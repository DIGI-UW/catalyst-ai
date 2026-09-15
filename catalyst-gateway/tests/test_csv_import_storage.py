"""File/type review and real PostgreSQL import checks (no model or query session)."""

import os
import sqlite3

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from src.config import DataSourceConfig
from src.catalyst.csv_import import CsvImportError
from src.catalyst.dashboard_builder import DashboardBuilder
from src.catalyst.dashboard_routes import install_dashboard_routes


class NoWorkbench:
    def get_session(self, *_):
        pytest.fail("CSV import must not create or consult a query session")


@pytest.fixture
def builder(tmp_path):
    uri = os.getenv(
        "CATALYST_TEST_POSTGRES_URI", "postgresql://unused:unused@127.0.0.1:1/test"
    )
    source = DataSourceConfig(
        "catalyst-imports", "Uploaded files", uri, "postgresql", "postgresql"
    )
    instance = DashboardBuilder(
        tmp_path / "state.sqlite3",
        workbench=NoWorkbench(),
        outbox=tmp_path / "outbox",
        import_source=source,
    )
    yield instance
    instance.close()


@pytest.fixture
def live_pg():
    uri = os.getenv("CATALYST_TEST_POSTGRES_URI")
    if not uri:
        pytest.skip(
            "Set CATALYST_TEST_POSTGRES_URI to a disposable PostgreSQL database"
        )
    return uri


def test_draft_restores_original_bytes_types_and_errors_after_restart(builder):
    raw = b"Accession,Result\n001,450\n002,<20\n"
    draft = builder.import_store().create("report.csv", raw)
    identifier = draft["importId"]
    changed = builder.update_import(
        identifier, title="May report", types=["text", "number"]
    )
    assert "result row 2" in changed["error"]
    assert changed["types"] == ["text", "number"]
    assert changed["preview"]["rows"][1][1]["value"] == "<20"
    assert builder.list("dataset") == []
    from src.catalyst.import_store import ImportStore

    reopened = ImportStore(
        builder.path,
        builder.import_store().directory,
        builder.import_store().connection_uri,
    )
    try:
        restored = reopened.review(identifier)
        assert restored == changed
        assert (reopened.directory / identifier).read_bytes() == raw
        assert (reopened.directory / identifier).stat().st_mode & 0o777 == 0o600
    finally:
        reopened.close()


def test_invalid_upload_does_not_create_draft_or_file(builder):
    with pytest.raises(CsvImportError):
        builder.import_store().create("report.csv", b"ID,Result\n1\n")
    assert not builder.import_store().directory.exists()
    assert builder.list("dataset") == []


def test_http_review_retains_invalid_types_and_requires_explicit_confirm(builder):
    app = FastAPI()
    install_dashboard_routes(app, builder)
    with TestClient(app) as client:
        response = client.post(
            "/v1/catalyst/dashboard-builder/datasets/imports?filename=report.csv",
            content=b"ID,Result\n001,<20\n",
        )
        assert response.status_code == 201
        identifier = response.json()["importId"]
        base = f"/v1/catalyst/dashboard-builder/datasets/imports/{identifier}"
        bad = client.patch(
            base, json={"title": "Reviewed", "types": ["text", "number"]}
        )
        assert bad.status_code == 200
        assert bad.json()["error"]
        failed = client.post(base + "/confirm")
        assert failed.status_code == 422
        assert builder.list("dataset") == []
        assert client.get(base).json()["title"] == "Reviewed"
        assert (
            client.patch(
                base, json={"title": "Reviewed", "types": ["text", "text"]}
            ).json()["error"]
            is None
        )


def test_real_import_immutable_values_order_and_restart(builder, live_pg):
    raw = '\ufeffID,Result,Date,Notes\r\n001,450.250,2026-05-06,"first, ""quoted""\r\nsecond"\r\n001,450.250,2026-05-06,\r\n003,,,\r\n'.encode()
    draft = builder.import_store().create("report.csv", raw)
    saved = builder.confirm_import(draft["importId"])
    config = saved["configuration"]
    assert config["origin"]["kind"] == "file"
    assert not {"parameterizedSql", "compiledSql", "parameters"} & config.keys()
    assert not {"sessionId", "executionId", "queryVersionId"} & config["source"].keys()
    assert config["rowCount"] == {"total": 3, "returned": 3, "truncated": False}
    assert builder.confirm_import(draft["importId"]) == saved
    rows = builder.imported_rows(saved["versionId"], offset=0, limit=100)
    assert rows["rows"][0] == [
        {"type": "string", "value": "001"},
        {"type": "decimal", "value": "450.250"},
        {"type": "date", "value": "2026-05-06"},
        {"type": "string", "value": 'first, "quoted"\r\nsecond'},
    ]
    assert rows["rows"][2] == [
        {"type": "string", "value": "003"},
        {"type": "null"},
        {"type": "null"},
        {"type": "string", "value": ""},
    ]
    reopened = DashboardBuilder(
        builder.path,
        workbench=NoWorkbench(),
        outbox=builder.outbox,
        import_source=builder.import_source,
    )
    try:
        assert reopened.imported_rows(saved["versionId"], offset=0, limit=100) == rows
        newer = reopened.import_store().create("report.csv", b"ID,Result\n001,900\n")
        second = reopened.confirm_import(newer["importId"])
        assert second["versionId"] != saved["versionId"]
        assert reopened.imported_rows(saved["versionId"], offset=0, limit=100) == rows
    finally:
        reopened.close()


def test_database_failure_and_lost_metadata_write_leave_no_ready_partial_import(
    builder, live_pg, monkeypatch
):
    draft = builder.import_store().create(
        "report.csv", b"ID,Result\n001,450\n002,900\n"
    )
    store = builder.import_store()
    original_uri = store.connection_uri
    store.connection_uri = "postgresql://unused:unused@127.0.0.1:1/test"
    with pytest.raises(CsvImportError, match="retained"):
        builder.confirm_import(draft["importId"])
    assert builder.list("dataset") == []
    assert not builder.outbox.exists()
    store.connection_uri = original_uri
    original_append = builder._append

    def interrupted(*args, **kwargs):
        raise sqlite3.OperationalError("simulated interrupted metadata save")

    monkeypatch.setattr(builder, "_append", interrupted)
    with pytest.raises(sqlite3.OperationalError):
        builder.confirm_import(draft["importId"])
    assert builder.list("dataset") == []
    monkeypatch.setattr(builder, "_append", original_append)
    saved = builder.confirm_import(draft["importId"])
    assert (
        builder.imported_rows(saved["versionId"], offset=0, limit=100)["rowCount"][
            "total"
        ]
        == 2
    )
    assert builder.confirm_import(draft["importId"]) == saved


def test_invalid_type_does_not_touch_postgres_before_corrected_retry(builder, live_pg):
    draft = builder.import_store().create(
        "report.csv", b"ID,Result\n001,<20\n001,450\n"
    )
    builder.update_import(
        draft["importId"], title="Mixed values", types=["text", "number"]
    )
    with pytest.raises(CsvImportError, match="valid number"):
        builder.confirm_import(draft["importId"])
    assert builder.list("dataset") == []
    builder.update_import(
        draft["importId"], title="Mixed values", types=["text", "text"]
    )
    saved = builder.confirm_import(draft["importId"])
    assert (
        builder.imported_rows(saved["versionId"], offset=0, limit=100)["rows"][0][1][
            "value"
        ]
        == "<20"
    )


def test_import_publication_has_file_provenance_and_native_raw_table(builder, live_pg):
    import json
    import zipfile
    from src.catalyst.contracts import ContractRegistry

    draft = builder.import_store().create(
        "report.csv", b"Accession Number,Result Value\n001,450\n001,450\n"
    )
    saved = builder.confirm_import(draft["importId"])
    widget = builder.save_widget(
        dataset_version_id=saved["versionId"], title="Detailed results"
    )
    dashboard = builder.save_dashboard(
        title="Imported report", widget_version_ids=[widget["versionId"]]
    )
    publication = builder.publish(dashboard["versionId"])
    manifest = publication["manifest"]
    ContractRegistry.default().validate(
        "catalyst-superset-bundle-v1.schema.json", manifest
    )
    assert manifest["datasets"][0]["origin"]["rowCount"] == 2
    assert manifest["generator"]["parameterCompilerRevisions"] == []
    assert "parameterizedSql" not in manifest["datasets"][0]
    assert "sessionId" not in manifest["datasets"][0]["source"]
    assert manifest["containsResultRows"] is False
    with zipfile.ZipFile(
        builder.outbox / publication["pointer"]["bundle"]["fileName"]
    ) as bundle:
        assert all(
            b"catalyst-test-only" not in bundle.read(name) for name in bundle.namelist()
        )
        dataset = json.loads(
            bundle.read(
                next(name for name in bundle.namelist() if "/datasets/" in name)
            )
        )
        chart = json.loads(
            bundle.read(next(name for name in bundle.namelist() if "/charts/" in name))
        )
    assert dataset["sql"] is None
    assert dataset["schema"] == "catalyst_imports"
    assert dataset["columns"][0]["verbose_name"] == "Accession Number"
    assert chart["params"]["all_columns"] == ["c0", "c1"]
    assert chart["params"]["query_mode"] == "raw"
    assert chart["params"]["order_by_cols"] == ['["row_order", true]']
    assert (
        builder.publish(dashboard["versionId"])["pointer"]["bundle"]
        == publication["pointer"]["bundle"]
    )


def test_long_unicode_heading_remains_exact_without_becoming_a_database_identifier(
    builder, live_pg
):
    heading = 'Résultat "quoted", ' + "long " * 20
    import csv
    import io

    content = io.StringIO(newline="")
    writer = csv.writer(content)
    writer.writerow([heading, "ID"])
    writer.writerow(["<20", "001"])
    draft = builder.import_store().create(
        "long-heading.csv", content.getvalue().encode()
    )
    saved = builder.confirm_import(draft["importId"])
    rows = builder.imported_rows(saved["versionId"], offset=0, limit=100)
    assert rows["columns"][0]["name"] == heading
    assert rows["columns"][0]["databaseName"] == "c0"
    assert rows["rows"][0][0]["value"] == "<20"


def test_completed_import_is_recovered_after_losing_its_draft_acknowledgement(
    builder, live_pg, monkeypatch
):
    draft = builder.import_store().create("report.csv", b"ID,Result\n001,450\n")
    store = builder.import_store()
    mark_saved = store.mark_saved

    def lost_ack(*_):
        raise sqlite3.OperationalError("lost acknowledgement")

    monkeypatch.setattr(store, "mark_saved", lost_ack)
    with pytest.raises(sqlite3.OperationalError):
        builder.confirm_import(draft["importId"])
    completed = builder.list("dataset")[0]
    monkeypatch.setattr(store, "mark_saved", mark_saved)
    assert (
        builder.review_import(draft["importId"])["datasetVersionId"]
        == completed["versionId"]
    )
    assert builder.confirm_import(draft["importId"]) == completed
    with pytest.raises(CsvImportError, match="already saved"):
        builder.update_import(
            draft["importId"], title="Replace old data", types=["text", "text"]
        )


def test_draft_and_saved_paging_preserve_complete_count_and_original_order(
    builder, live_pg
):
    raw = "ID,Value\n" + "".join(f"id-{i:03},value-{i}\n" for i in range(105))
    draft = builder.import_store().create("pages.csv", raw.encode())
    next_page = builder.review_import(draft["importId"], 100)["preview"]
    assert next_page["offset"] == 100
    assert next_page["rows"][0][0]["value"] == "id-100"
    assert next_page["rowCount"] == {"total": 105, "returned": 5, "truncated": False}
    saved = builder.confirm_import(draft["importId"])
    page = builder.imported_rows(saved["versionId"], offset=100, limit=100)
    assert page["rows"] == next_page["rows"]
    assert page["rowCount"] == next_page["rowCount"]


def test_imported_summary_publication_and_versions_use_complete_file(builder, live_pg):
    import json
    import zipfile
    from src.catalyst.contracts import ContractRegistry

    # More rows than the 100-row preview; repeated results remain separate records.
    draft = builder.import_store().create(
        "turnaround.csv",
        b"Section,Minutes\n"
        + b"Virology,30\n" * 120
        + b"Virology,90\nVirology,\nOther,\n",
    )
    dataset = builder.confirm_import(draft["importId"])
    average = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="Average turnaround",
        presentation_kind="grouped_bar",
        aggregation={
            "operation": "average",
            "valueColumnOrdinal": 1,
            "groupColumnOrdinal": 0,
        },
    )
    count = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="All records",
        presentation_kind="big_number",
        aggregation={"operation": "count"},
        base_version_id=average["versionId"],
    )
    assert count["id"] == average["id"] and count["ordinal"] == 2
    assert (
        builder._entity("widget", average["versionId"]).configuration["aggregation"][
            "operation"
        ]
        == "average"
    )
    dashboard = builder.save_dashboard(
        title="Summary", widget_version_ids=[average["versionId"], count["versionId"]]
    )
    publication = builder.publish(dashboard["versionId"])
    ContractRegistry.default().validate(
        "catalyst-superset-bundle-v1.schema.json", publication["manifest"]
    )
    with zipfile.ZipFile(
        builder.outbox / publication["pointer"]["bundle"]["fileName"]
    ) as bundle:
        charts = {
            item["slice_name"]: item["params"]
            for item in (
                json.loads(bundle.read(name))
                for name in bundle.namelist()
                if "/charts/" in name
            )
        }
    assert charts["Average turnaround"]["x_axis"] == "c0"
    assert charts["Average turnaround"]["metrics"][0]["aggregate"] == "AVG"
    assert charts["Average turnaround"]["metrics"][0]["column"]["column_name"] == "c1"
    assert charts["All records"]["metric"]["aggregate"] == "COUNT"
    assert charts["All records"]["metric"]["column"]["column_name"] == "row_order"
    assert dataset["configuration"]["origin"]["rowCount"] == 123
    assert (
        len(builder.imported_rows(dataset["versionId"], offset=100, limit=100)["rows"])
        == 23
    )
    assert (
        builder.publish(dashboard["versionId"])["pointer"]["bundle"]
        == publication["pointer"]["bundle"]
    )


@pytest.mark.parametrize(
    "summary",
    [
        None,
        [],
        {"operation": []},
        {"operation": "median"},
        {"operation": "average", "valueColumnOrdinal": 0},
        {"operation": "count", "groupColumnOrdinal": True},
        {"operation": "count", "groupColumnOrdinal": 99},
        {"operation": "count", "sql": "SELECT arbitrary"},
    ],
)
def test_invalid_imported_summary_does_not_save_a_widget(builder, live_pg, summary):
    from src.catalyst.dashboard_builder import DashboardBuilderError

    draft = builder.import_store().create("report.csv", b"ID,Minutes\n001,30\n")
    dataset = builder.confirm_import(draft["importId"])
    with pytest.raises(DashboardBuilderError):
        builder.save_widget(
            dataset_version_id=dataset["versionId"],
            title="Invalid",
            presentation_kind="grouped_bar",
            aggregation=summary,
        )
    assert builder.list("widget") == []
