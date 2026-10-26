from __future__ import annotations

import pytest

from src.catalyst.analytics import AnalyticsColumn, AnalyticsResult
from src.catalyst.contracts import ContractRegistry
from src.catalyst.table import TableError, build_table


def _preview_and_query(*, logical_type: str = "string", nullable: bool = False):
    columns = [
        {"name": "count_patients", "logicalType": logical_type, "nullable": nullable}
    ]
    preview = {
        "question": "How many patients are there?",
        "previewId": "preview-1",
        "queryDigest": "a" * 64,
        "sql": "SELECT count(DISTINCT t1.id) AS count_patients FROM openelis.patient_flat AS t1",
        "parameters": [],
        "target": {
            "dataSource": "openelis",
            "catalogVersion": "live",
            "approvedViews": ["openelis.patient_flat"],
        },
    }
    query = {
        "expectedColumns": columns,
        "provenance": {
            "traceId": "hub-trace",
            "profileId": "catalyst-query-e4b-qwen14b",
        },
    }
    return preview, query


def _table(preview, query, result):
    return build_table(
        preview=preview,
        query=query,
        result=result,
        freshness={"dataSource": "openelis", "dialect": "spark", "relationCount": 1},
        accepted_at="2026-10-25T00:00:00Z",
        duration_ms=5,
        statement_timeout_ms=10000,
        max_rows=100,
        catalyst_trace_id="catalyst-trace",
    )


def _counted(*values, database_type: str = "integer"):
    return AnalyticsResult(
        column_names=["count_patients"],
        rows=[(value,) for value in values],
        truncated=False,
        columns=[AnalyticsColumn(0, "count_patients", "BIGINT", database_type)],
    )


def test_a_count_declared_a_string_is_recorded_as_the_integer_the_database_returned():
    """The writer once declared COUNT(...) a string; the query was right and the
    table refused it with a 502."""
    preview, query = _preview_and_query(logical_type="string")

    table = _table(preview, query, _counted(96))

    assert table["table"]["columns"] == [
        {"name": "count_patients", "logicalType": "integer", "nullable": False}
    ]
    assert table["table"]["rows"] == [[{"type": "integer", "value": 96}]]
    assert (
        "Column count_patients was declared string; the database returned integer."
        in table["warnings"]
    )
    assert query["expectedColumns"][0]["logicalType"] == "string"
    ContractRegistry.default().validate("catalyst-table-v1.schema.json", table)


def test_nulls_in_a_column_declared_not_null_are_reported_not_fatal():
    preview, query = _preview_and_query(logical_type="integer", nullable=False)

    table = _table(preview, query, _counted(96, None))

    assert table["table"]["columns"][0]["nullable"] is True
    assert table["table"]["rows"][1] == [{"type": "null"}]
    assert (
        "Column count_patients was declared not null; the database returned nulls."
        in table["warnings"]
    )


def test_a_database_type_the_table_cannot_carry_leaves_the_declaration_in_place():
    preview, query = _preview_and_query(logical_type="integer")

    table = _table(preview, query, _counted(96, database_type="interval"))

    assert table["table"]["columns"][0]["logicalType"] == "integer"
    assert not [w for w in table["warnings"] if "declared" in w]


def test_a_result_without_database_types_is_checked_against_the_declaration():
    preview, query = _preview_and_query(logical_type="string")
    result = AnalyticsResult(
        column_names=["count_patients"], rows=[(96,)], truncated=False
    )

    with pytest.raises(TableError, match="does not match string"):
        _table(preview, query, result)


@pytest.mark.asyncio
async def test_a_preview_execution_carries_the_databases_column_types():
    from src.catalyst.analytics import SqlAnalyticsAdapter
    from src.catalyst.dialects import SPARK

    class Cursor:
        description = [("count_patients", "BIGINT")]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def execute(self, sql, params=None):
            return None

        def fetchmany(self, count):
            return [(96,)]

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def cursor(self):
            return Cursor()

    adapter = SqlAnalyticsAdapter(
        "hive2://example/openelis",
        dialect=SPARK,
        connect=lambda *args, **kwargs: Connection(),
    )

    result = await adapter.execute(
        sql="SELECT count(*) AS count_patients FROM openelis.patient_flat",
        parameters=[],
        max_rows=100,
        statement_timeout_ms=1000,
    )

    assert [(c.name, c.database_type, c.logical_type) for c in result.columns] == [
        ("count_patients", "BIGINT", "integer")
    ]
