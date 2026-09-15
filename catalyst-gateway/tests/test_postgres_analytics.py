"""PostgreSQL transport, metadata and exact execution through the shared adapter.

The optional integration fixture uses a disposable PostgreSQL test database.
Never point CATALYST_TEST_POSTGRES_URI at a clinical or application database.
"""

from __future__ import annotations

import os
from datetime import date
from decimal import Decimal
from urllib.parse import quote
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest

from src.catalyst.analytics import (
    AnalyticsError,
    ManualAnalyticsError,
    SqlAnalyticsAdapter,
    _dbapi_connect,
)
from src.catalyst.dialects import POSTGRES, resolve_dialect_adapter
from src.catalyst.postgres import logical_type


@pytest.mark.parametrize(
    ("native", "logical"),
    [
        ("integer", "integer"),
        ("numeric(12,3)", "decimal"),
        ("timestamp(6) with time zone", "date-time"),
        ("time without time zone", "time"),
        ("jsonb", "json"),
        ("uuid", "string"),
        ("integer[]", "array"),
        ("bytea", "binary"),
        ("interval day to second", "interval"),
    ],
)
def test_postgres_type_names(native, logical):
    assert logical_type(native) == logical


def test_alias_and_cast_parameter_do_not_rewrite_type_names():
    assert resolve_dialect_adapter("postgresql") is POSTGRES
    assert (
        SqlAnalyticsAdapter._driver_sql("SELECT :integer::integer, 10 % 3", {"integer"})
        == "SELECT %(integer)s::integer, 10 %% 3"
    )


def test_unknown_transport_never_falls_back_to_spark():
    with pytest.raises(
        AnalyticsError, match="Unsupported SQL connection scheme"
    ) as caught:
        _dbapi_connect("unknown://user:private-password@host/db")
    assert "private-password" not in str(caught.value)


@pytest.fixture()
def postgres_source():
    uri = os.environ.get("CATALYST_TEST_POSTGRES_URI")
    if not uri:
        pytest.skip(
            "Set CATALYST_TEST_POSTGRES_URI to a disposable PostgreSQL database"
        )
    suffix = uuid4().hex[:12]
    schema, role, password = (
        f"catalog_{suffix}",
        f"reader_{suffix}",
        "fixture p@ss:word/",
    )
    with psycopg.connect(uri, autocommit=True) as admin:
        with admin.cursor() as cursor:
            cursor.execute(
                sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                    sql.Identifier(role), sql.Literal(password)
                )
            )
            cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            try:
                cursor.execute(
                    sql.SQL("SET search_path TO {}").format(sql.Identifier(schema))
                )
                cursor.execute("CREATE DOMAIN assay_number AS numeric(12,3)")
                cursor.execute(
                    "CREATE TABLE measurements (accession text, value assay_number, collected date, optional_value text)"
                )
                cursor.execute(
                    "INSERT INTO measurements VALUES (%s,%s,%s,NULL),(%s,%s,%s,NULL)",
                    (
                        "0007",
                        Decimal("1.250"),
                        date(2026, 5, 5),
                        "0007",
                        Decimal("2.500"),
                        date(2026, 5, 6),
                    ),
                )
                cursor.execute("CREATE VIEW result_view AS SELECT * FROM measurements")
                cursor.execute(
                    "CREATE MATERIALIZED VIEW result_snapshot AS SELECT * FROM measurements"
                )
                cursor.execute("CREATE TABLE partial (allowed integer, hidden text)")
                cursor.execute("CREATE TABLE hidden (secret text)")
                cursor.execute("CREATE TABLE zero_columns ()")
                cursor.execute(
                    "CREATE TABLE partitioned (collected date) PARTITION BY RANGE (collected)"
                )
                cursor.execute(
                    sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                        sql.Identifier(schema), sql.Identifier(role)
                    )
                )
                cursor.execute(
                    sql.SQL(
                        "GRANT SELECT ON measurements, result_view, result_snapshot, zero_columns, partitioned TO {}"
                    ).format(sql.Identifier(role))
                )
                cursor.execute(
                    sql.SQL("GRANT SELECT (allowed) ON partial TO {}").format(
                        sql.Identifier(role)
                    )
                )
                cursor.execute(
                    "COMMENT ON COLUMN measurements.value IS 'Reported assay measurement'"
                )
                info = admin.info
                user_uri = f'postgresql://{role}:{quote(password, safe="")}@{info.host}:{info.port}/{info.dbname}'
                yield (
                    SqlAnalyticsAdapter(
                        user_uri, dialect=POSTGRES, data_source_id="native-postgres"
                    ),
                    schema,
                )
            finally:
                cursor.execute(
                    sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
                )
                cursor.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))


@pytest.mark.asyncio
async def test_real_postgres_catalog_respects_actual_permissions_and_keeps_relations(
    postgres_source,
):
    adapter, schema = postgres_source
    relations = {
        r["name"].removeprefix(schema + "."): r
        for r in await adapter.discover_relations()
        if r["name"].startswith(schema + ".")
    }
    assert set(relations) == {
        "measurements",
        "result_view",
        "result_snapshot",
        "partial",
        "zero_columns",
        "partitioned",
    }
    assert relations["result_view"]["relationType"] == "view"
    assert relations["result_snapshot"]["relationType"] == "materialized-view"
    assert relations["partitioned"]["relationType"] == "partitioned-table"
    assert relations["zero_columns"]["fields"] == []
    assert [f["name"] for f in relations["partial"]["fields"]] == ["allowed"]
    value = relations["measurements"]["fields"][1]
    assert value["type"] == "decimal"
    assert value["description"] == "Reported assay measurement"
    assert value["databaseType"].endswith("assay_number")
    assert (await adapter.readiness())["ready"] is True


@pytest.mark.asyncio
async def test_real_postgres_typed_parameters_and_values(postgres_source):
    adapter, schema = postgres_source
    result = await adapter.execute_manual(
        sql=f'SELECT accession, value, collected, optional_value FROM "{schema}".measurements WHERE collected >= :start ORDER BY collected',
        parameters=[{"name": "start", "type": "date", "value": "2026-05-05"}],
        max_rows=5,
        statement_timeout_ms=500,
    )
    assert [c.logical_type for c in result.columns] == [
        "string",
        "decimal",
        "date",
        "string",
    ]
    assert result.rows == [
        [
            {"type": "string", "value": "0007"},
            {"type": "decimal", "value": "1.250"},
            {"type": "date", "value": "2026-05-05"},
            {"type": "null"},
        ],
        [
            {"type": "string", "value": "0007"},
            {"type": "decimal", "value": "2.500"},
            {"type": "date", "value": "2026-05-06"},
            {"type": "null"},
        ],
    ]
    nulls = await adapter.execute_manual(
        sql="SELECT NULL::numeric, NULL::timestamptz, NULL::jsonb, NULL::integer[], NULL::bytea",
        parameters=[],
        max_rows=1,
        statement_timeout_ms=500,
    )
    assert [c.logical_type for c in nulls.columns] == [
        "decimal",
        "date-time",
        "json",
        "array",
        "binary",
    ]
    assert [c.database_type for c in nulls.columns] == [
        "numeric",
        "timestamp with time zone",
        "jsonb",
        "integer[]",
        "bytea",
    ]
    assert nulls.rows == [[{"type": "null"}] * 5]
    bound = await adapter.execute(
        sql="SELECT :integer::integer, '50%', ':integer', $$:integer$$, 5 % 2, 3 = ANY(:ids)",
        parameters=[
            {"name": "integer", "type": "integer", "value": 7},
            {"name": "ids", "type": "integer-list", "value": [2, 3]},
        ],
        max_rows=2,
        statement_timeout_ms=500,
    )
    assert bound.rows == [(7, "50%", ":integer", ":integer", 1, True)]


@pytest.mark.asyncio
async def test_real_postgres_bounds_database_errors_and_next_execution(postgres_source):
    adapter, schema = postgres_source
    result = await adapter.execute_manual(
        sql="SELECT generate_series(1,4)",
        parameters=[],
        max_rows=2,
        statement_timeout_ms=500,
    )
    assert result.truncated and len(result.rows) == 2
    for statement, code in [
        ("SELECT pg_sleep(0.2)", "57014"),
        ("SELECT absent_column", "42703"),
        (f'DELETE FROM "{schema}".measurements', "25006"),
    ]:
        with pytest.raises(ManualAnalyticsError) as caught:
            await adapter.execute_manual(
                sql=statement, parameters=[], max_rows=2, statement_timeout_ms=30
            )
        assert caught.value.diagnostic.sqlstate == code
    recovered = await adapter.execute_manual(
        sql="SELECT 1 AS ready", parameters=[], max_rows=1, statement_timeout_ms=500
    )
    assert recovered.rows == [[{"type": "integer", "value": 1}]]


@pytest.mark.asyncio
async def test_real_postgres_escape_strings_and_nested_comments_keep_bindings(
    postgres_source,
):
    adapter, _ = postgres_source
    result = await adapter.execute_manual(
        sql=r"SELECT E'it\'s :value', /* outer /* inner */ :value */ :value::integer",
        parameters=[{"name": "value", "type": "integer", "value": 9}],
        max_rows=1,
        statement_timeout_ms=500,
    )
    assert result.rows == [
        [{"type": "string", "value": "it's :value"}, {"type": "integer", "value": 9}]
    ]


@pytest.mark.asyncio
async def test_published_postgres_literals_match_bound_query_values(postgres_source):
    from src.catalyst.dashboard_builder import compile_parameterized_sql

    adapter, _ = postgres_source
    query = "SELECT :label AS label, :at AS at, 9 = ANY(:ids) AS included, :empty::bigint[] AS empty_ids, ':ignored' AS untouched, 10 % 3 AS remainder"
    parameters = [
        {"name": "label", "type": "string", "value": "O'Brien\\new % :ids"},
        {"name": "at", "type": "date-time", "value": "2026-05-06T12:30:00+05:30"},
        {"name": "ids", "type": "integer-list", "value": [7, 9]},
        {"name": "empty", "type": "integer-list", "value": []},
    ]
    bound = await adapter.execute_manual(
        sql=query, parameters=parameters, max_rows=1, statement_timeout_ms=500
    )
    compiled = compile_parameterized_sql(query, parameters, "postgresql")
    rendered = await adapter.execute_manual(
        sql=compiled, parameters=[], max_rows=1, statement_timeout_ms=500
    )
    assert rendered.rows == bound.rows
    assert rendered.rows[0][0] == {"type": "string", "value": parameters[0]["value"]}
