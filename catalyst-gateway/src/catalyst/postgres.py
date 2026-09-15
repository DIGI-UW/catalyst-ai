"""PostgreSQL metadata and execution settings for the shared SQL adapter."""

from __future__ import annotations

import re
from typing import Any, Sequence


def logical_type(database_type: str) -> str:
    value = re.sub(r"\([^)]*\)", "", database_type.lower()).strip()
    if value.endswith("[]"):
        return "array"
    if value in {"bool", "boolean"}:
        return "boolean"
    if value in {"int2", "int4", "int8", "smallint", "integer", "bigint", "oid"}:
        return "integer"
    if value in {"numeric", "decimal", "real", "double precision", "float4", "float8"}:
        return "decimal"
    if value == "date":
        return "date"
    if value.startswith("timestamp"):
        return "date-time"
    if value.startswith("time"):
        return "time"
    if value in {"json", "jsonb"}:
        return "json"
    if value == "bytea":
        return "binary"
    if value.startswith("interval"):
        return "interval"
    return "string"


def prepare_cursor(cursor: Any, timeout_ms: int) -> None:
    # The role's grants remain the authorization boundary. This transaction
    # setting also lets PostgreSQL reject ordinary write attempts itself.
    cursor.execute("SET TRANSACTION READ ONLY")
    cursor.execute(
        "SELECT set_config('statement_timeout', %s, true)", (str(timeout_ms),)
    )


def describe_columns(description: Sequence[Any], cursor: Any) -> list[tuple[str, str]]:
    if not description:
        return []
    oids = list(dict.fromkeys(column[1] for column in description))
    cursor.execute(
        "SELECT oid, pg_catalog.format_type(oid, NULL), "
        "pg_catalog.format_type(NULLIF(typbasetype, 0), NULL) "
        "FROM pg_catalog.pg_type WHERE oid = ANY(%s)",
        (oids,),
    )
    types = {
        oid: (name, logical_type(base or name)) for oid, name, base in cursor.fetchall()
    }
    return [
        types.get(column[1], (f"oid:{column[1]}", "unknown")) for column in description
    ]


def discover_relations(cursor: Any) -> list[dict[str, Any]]:
    """Read catalog metadata only, including column-level SELECT grants."""
    cursor.execute(
        """
        SELECT n.nspname, c.relname, c.relkind,
               pg_catalog.pg_table_is_visible(c.oid),
               a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
               NOT a.attnotnull, pg_catalog.obj_description(c.oid, 'pg_class'),
               pg_catalog.col_description(c.oid, a.attnum),
               pg_catalog.format_type(NULLIF(t.typbasetype, 0), NULL)
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
             AND a.attnum > 0 AND NOT a.attisdropped
             AND pg_catalog.has_column_privilege(c.oid, a.attnum, 'SELECT')
        LEFT JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname !~ '^pg_(toast|temp)'
          AND pg_catalog.has_schema_privilege(n.oid, 'USAGE')
          AND (pg_catalog.has_table_privilege(c.oid, 'SELECT') OR a.attnum IS NOT NULL)
        ORDER BY n.nspname, c.relname, a.attnum
        """
    )
    kinds = {
        "r": "table",
        "p": "partitioned-table",
        "v": "view",
        "m": "materialized-view",
        "f": "foreign-table",
    }
    relations: dict[tuple[str, str], dict[str, Any]] = {}
    for (
        schema,
        name,
        kind,
        visible,
        column,
        native_type,
        nullable,
        comment,
        column_comment,
        base_type,
    ) in cursor.fetchall():
        relation = relations.setdefault(
            (schema, name),
            {
                "name": f"{schema}.{name}",
                "relationType": kinds[kind],
                "unqualifiedVisible": bool(visible),
                "grain": comment or f"Rows readable from {schema}.{name}",
                "fields": [],
            },
        )
        if column is not None:
            field = {
                "name": column,
                "type": logical_type(base_type or native_type),
                "databaseType": native_type,
                "nullable": bool(nullable),
            }
            if column_comment:
                field["description"] = column_comment
            relation["fields"].append(field)
    _add_foreign_keys(cursor, relations)
    return list(relations.values())


def _add_foreign_keys(
    cursor: Any, relations: dict[tuple[str, str], dict[str, Any]]
) -> None:
    """Enrich readable relations with declared joins, without reading data rows."""
    cursor.execute(
        """
        SELECT sn.nspname, sc.relname, tn.nspname, tc.relname,
               array_agg(sa.attname ORDER BY k.position),
               array_agg(ta.attname ORDER BY k.position)
        FROM pg_catalog.pg_constraint f
        JOIN pg_catalog.pg_class sc ON sc.oid = f.conrelid
        JOIN pg_catalog.pg_namespace sn ON sn.oid = sc.relnamespace
        JOIN pg_catalog.pg_class tc ON tc.oid = f.confrelid
        JOIN pg_catalog.pg_namespace tn ON tn.oid = tc.relnamespace
        JOIN LATERAL unnest(f.conkey, f.confkey) WITH ORDINALITY
             AS k(source_column, target_column, position) ON true
        JOIN pg_catalog.pg_attribute sa
             ON sa.attrelid = sc.oid AND sa.attnum = k.source_column
        JOIN pg_catalog.pg_attribute ta
             ON ta.attrelid = tc.oid AND ta.attnum = k.target_column
        WHERE f.contype = 'f'
        GROUP BY f.oid, sn.nspname, sc.relname, tn.nspname, tc.relname
        ORDER BY sn.nspname, sc.relname, tn.nspname, tc.relname, f.conname
        """
    )
    for (
        source_schema,
        source_table,
        target_schema,
        target_table,
        source_columns,
        target_columns,
    ) in cursor.fetchall():
        source = relations.get((source_schema, source_table))
        target = relations.get((target_schema, target_table))
        if source is None or target is None:
            continue
        # A partially readable composite key must not expose hidden columns or
        # suggest that joining only the visible part is a complete relationship.
        source_fields = {field["name"] for field in source["fields"]}
        target_fields = {field["name"] for field in target["fields"]}
        if (
            not set(source_columns) <= source_fields
            or not set(target_columns) <= target_fields
        ):
            continue
        joins = [
            f"{_qualified_column(source_schema, source_table, left)} = "
            f"{_qualified_column(target_schema, target_table, right)}"
            for left, right in zip(source_columns, target_columns, strict=True)
        ]
        relationship = "Declared foreign key: " + " AND ".join(joins)
        relationships = source.setdefault("relationships", [])
        if relationship not in relationships:
            relationships.append(relationship)


def _qualified_column(schema: str, table: str, column: str) -> str:
    return ".".join(
        '"' + part.replace('"', '""') + '"' for part in (schema, table, column)
    )
