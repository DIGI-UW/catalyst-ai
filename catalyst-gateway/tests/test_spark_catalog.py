"""Spark metadata mapping, with an opt-in real HiveServer2 regression.

Set CATALYST_TEST_SPARK_URI to run the scratch-catalog test against Spark 4.0.
It creates and removes only its own uniquely named schema and session view.
The cursor fixtures cover error/quoting branches, not Spark's SQL semantics.
"""

from __future__ import annotations

import os
from uuid import uuid4

import pytest

from src.catalyst.analytics import _dbapi_connect
from src.catalyst.dialects import SPARK


class MetadataCursor:
    def __init__(self, responses):
        self.responses = responses
        self.rows = []

    def execute(self, sql):
        response = self.responses[sql]
        if isinstance(response, Exception):
            raise response
        self.rows = response

    def fetchall(self):
        return self.rows


def test_persistent_view_uses_view_metadata_and_quoted_qualified_description():
    cursor = MetadataCursor(
        {
            "SHOW TABLES": [("lab`archive", "result`view", False)],
            "SHOW VIEWS": [("lab`archive", "result`view", False)],
            "DESCRIBE TABLE `lab``archive`.`result``view`": [
                ("count", "bigint", "Number of results"),
            ],
        }
    )
    relation = SPARK.discover_relations(cursor)[0]
    assert relation["name"] == "lab`archive.result`view"
    assert relation["relationType"] == "view"
    assert relation["fields"] == [
        {
            "name": "count",
            "type": "integer",
            "databaseType": "bigint",
            "nullable": True,
            "description": "Number of results",
        }
    ]


def test_failed_view_listing_does_not_misreport_every_view_as_a_table():
    cursor = MetadataCursor(
        {
            "SHOW TABLES": [("lab", "result", False)],
            "SHOW VIEWS": PermissionError("view metadata unavailable"),
        }
    )
    with pytest.raises(PermissionError, match="view metadata unavailable"):
        SPARK.discover_relations(cursor)


def test_failed_description_keeps_the_relation_visible_without_invented_columns():
    cursor = MetadataCursor(
        {
            "SHOW TABLES": [("lab", "result", False)],
            "SHOW VIEWS": [("lab", "result", False)],
            "DESCRIBE TABLE `lab`.`result`": PermissionError("describe denied"),
        }
    )
    relations = SPARK.discover_relations(cursor)
    assert len(relations) == 1
    assert relations[0]["name"] == "lab.result"
    assert relations[0]["relationType"] == "relation"
    assert relations[0]["fields"] == []


@pytest.mark.skipif(
    not os.environ.get("CATALYST_TEST_SPARK_URI"),
    reason="Set CATALYST_TEST_SPARK_URI for the real Spark metadata regression",
)
def test_real_spark_catalog_distinguishes_persistent_and_shadowing_temporary_views():
    """Real DDL and production discovery; no ingestion or deployed UI proof."""
    schema = f"catalyst_catalog_test_{uuid4().hex}"
    with _dbapi_connect(os.environ["CATALYST_TEST_SPARK_URI"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE `{schema}`")
            try:
                cursor.execute(f"USE `{schema}`")
                cursor.execute(
                    "CREATE TABLE sample (patient_key BIGINT, cohort STRING) "
                    "USING PARQUET PARTITIONED BY (cohort)"
                )
                cursor.execute("CREATE VIEW summary AS SELECT patient_key FROM sample")
                cursor.execute("CREATE TEMP VIEW sample AS SELECT 'temporary' AS note")

                relations = {
                    relation["name"]: relation
                    for relation in SPARK.discover_relations(cursor)
                }
                assert relations[f"{schema}.summary"]["relationType"] == "view"
                assert relations[f"{schema}.sample"]["relationType"] == "table"
                assert relations["sample"]["relationType"] == "view"
                assert not relations[f"{schema}.sample"]["unqualifiedVisible"]
                assert relations["sample"]["unqualifiedVisible"]
                assert relations[f"{schema}.summary"]["unqualifiedVisible"]
                assert [
                    (field["name"], field["databaseType"])
                    for field in relations[f"{schema}.sample"]["fields"]
                ] == [("patient_key", "bigint"), ("cohort", "string")]
                assert [
                    field["name"] for field in relations[f"{schema}.summary"]["fields"]
                ] == ["patient_key"]
                assert [field["name"] for field in relations["sample"]["fields"]] == [
                    "note"
                ]
            finally:
                cursor.execute("USE default")
                cursor.execute(f"DROP DATABASE `{schema}` CASCADE")
