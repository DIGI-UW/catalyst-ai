from __future__ import annotations

import json
import stat
import uuid
import zipfile
from pathlib import Path

import pytest

from src.catalyst.contracts import ContractRegistry
from src.catalyst.dashboard_builder import (
    DashboardBuilder,
    DashboardBuilderError,
    compile_parameterized_sql,
    suggest_presentation,
)


def _id() -> str:
    return str(uuid.uuid4())


class _Workbench:
    def __init__(
        self,
        *,
        columns: list[dict[str, object]] | None = None,
        rows: list[list[dict[str, object]]] | None = None,
        truncated: bool = False,
    ) -> None:
        self.session_id = _id()
        self.turn_id = _id()
        self.version_id = _id()
        self.execution_id = _id()
        self.query_digest = "a" * 64
        self.columns = columns or [
            {
                "ordinal": 0,
                "name": "observed_at",
                "databaseType": "date",
                "logicalType": "date",
            },
            {
                "ordinal": 1,
                "name": "result_value",
                "databaseType": "numeric",
                "logicalType": "decimal",
            },
        ]
        self.rows = rows or [
            [
                {"type": "date", "value": "2026-01-01"},
                {"type": "decimal", "value": "14.2"},
            ]
        ]
        self.truncated = truncated

    def get_session(self, session_id: str):
        if session_id != self.session_id:
            return None
        version = {
            "versionId": self.version_id,
            "ordinal": 1,
            "queryDigest": self.query_digest,
            "sql": "SELECT observed_at, result_value FROM analytics.lab_result_fact_v1 WHERE observed_at >= :since",
            "parameters": [
                {
                    "name": "since",
                    "type": "date",
                    "source": "human",
                    "value": "2026-01-01",
                }
            ],
        }
        return {
            "sessionId": self.session_id,
            "catalogVersion": "analytics-v1",
            "provenance": {"dataSourceId": "openelis", "dialect": "spark"},
            "currentVersion": version,
            "executions": [
                {
                    "executionId": self.execution_id,
                    "versionId": self.version_id,
                    "status": "succeeded",
                    "maxRows": 100,
                    "query": {
                        "sql": version["sql"],
                        "parameters": version["parameters"],
                    },
                    "result": {
                        "columns": self.columns,
                        "rows": self.rows,
                        "rowCount": {
                            "returned": 1,
                            "truncated": self.truncated,
                            "truncationReason": "configured_limit"
                            if self.truncated
                            else None,
                        },
                        "warnings": [],
                    },
                }
            ],
        }

    def list_turns(self, session_id: str):
        assert session_id == self.session_id
        return {"currentTurnId": self.turn_id}


def test_save_without_recorded_source_does_not_guess_a_connection(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    session = workbench.get_session(workbench.session_id)
    session["provenance"].pop("dataSourceId")
    workbench.get_session = lambda _session_id: session
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )

    with pytest.raises(DashboardBuilderError, match="data source was not recorded"):
        builder.save_dataset(
            session_id=workbench.session_id,
            execution_id=workbench.execution_id,
            title="Unknown source",
        )
    assert builder.list("dataset") == []


def test_compile_parameterized_sql_preserves_typed_literals() -> None:
    assert (
        compile_parameterized_sql(
            "SELECT :day::date, :text, :ids",
            [
                {"name": "day", "type": "date", "value": "2026-01-01"},
                {"name": "text", "type": "string", "value": "O'Brien"},
                {"name": "ids", "type": "integer-list", "value": [2, 3]},
            ],
        )
        == "SELECT DATE '2026-01-01'::date, 'O''Brien', (2, 3)"
    )


def test_compile_parameterized_sql_uses_spark_timestamp_and_preserves_backslashes() -> (
    None
):
    assert (
        compile_parameterized_sql(
            "SELECT :at AS at, :label AS label",
            [
                {
                    "name": "at",
                    "type": "date-time",
                    "value": "2026-09-06T12:00:00Z",
                },
                {"name": "label", "type": "string", "value": r"group\new"},
            ],
        )
        == r"SELECT TIMESTAMP '2026-09-06T12:00:00Z' AS at, 'group\\new' AS label"
    )


def test_empty_numeric_dataset_does_not_suggest_an_invalid_big_number() -> None:
    columns = [{"ordinal": 0, "name": "count", "logicalType": "integer"}]

    assert suggest_presentation(columns, 0) == "table"
    assert suggest_presentation(columns, 1) == "big_number"


def test_saved_lineage_publishes_a_contract_valid_native_bundle(tmp_path: Path) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Monthly result values",
    )
    assert dataset["configuration"]["source"]["dialect"] == "spark"
    widget = builder.save_widget(
        dataset_version_id=dataset["versionId"], title="Result trend"
    )
    assert widget["configuration"]["presentationKind"] == "table"
    assert widget["configuration"]["suggestedKind"] == "time_series_line"
    dashboard = builder.save_dashboard(
        title="Lab operations", widget_version_ids=[widget["versionId"]]
    )
    publication = builder.publish(dashboard["versionId"])

    ContractRegistry.default().validate(
        "catalyst-superset-bundle-v1.schema.json", publication["manifest"]
    )
    ContractRegistry.default().validate(
        "catalyst-superset-outbox-current-v1.schema.json", publication["pointer"]
    )
    bundle = tmp_path / "outbox" / publication["pointer"]["bundle"]["fileName"]
    assert bundle.is_file()
    assert stat.S_IMODE(bundle.stat().st_mode) == 0o640
    assert bundle.stat().st_gid == bundle.parent.stat().st_gid
    assert (
        json.loads((tmp_path / "outbox" / "current.json").read_text())
        == publication["pointer"]
    )
    with zipfile.ZipFile(bundle) as archive:
        names = archive.namelist()
        database_member = next(name for name in names if "/databases/" in name)
        dashboard_member = next(name for name in names if "/dashboards/" in name)
        database = json.loads(archive.read(database_member))
        dashboard_asset = json.loads(archive.read(dashboard_member))
    assert "masked_encrypted_extra" not in database
    chart_meta = dashboard_asset["position"]["CHART-0"]["meta"]
    assert (
        chart_meta["uuid"]
        == publication["manifest"]["assetUuids"]["chartsByVersion"][widget["versionId"]]
    )
    assert chart_meta["chartId"] == 0
    assert any(name.endswith("/metadata.yaml") for name in names)
    assert any("/databases/" in name for name in names)
    assert any("/datasets/" in name for name in names)
    assert any("/charts/" in name for name in names)
    assert any("/dashboards/" in name for name in names)
    assert any(name.endswith("/catalyst/manifest.json") for name in names)

    original_bytes = bundle.read_bytes()
    bundle.chmod(0o600)
    republished = builder.publish(dashboard["versionId"])
    assert republished["pointer"]["bundle"] == publication["pointer"]["bundle"]
    assert bundle.read_bytes() == original_bytes
    assert stat.S_IMODE(bundle.stat().st_mode) == 0o640
    assert bundle.stat().st_gid == bundle.parent.stat().st_gid


def test_publication_projects_only_an_exact_verified_import(tmp_path: Path) -> None:
    workbench = _Workbench()
    receipts = tmp_path / "receipts"
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3",
        workbench=workbench,
        outbox=tmp_path / "outbox",
        receipts=receipts,
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Monthly result values",
    )
    widget = builder.save_widget(
        dataset_version_id=dataset["versionId"], title="Result trend"
    )
    dashboard = builder.save_dashboard(
        title="Lab operations", widget_version_ids=[widget["versionId"]]
    )
    published = builder.publish(dashboard["versionId"])
    digest = published["pointer"]["bundle"]["sha256"]
    receipt = {
        "outcome": "imported",
        "receiptId": _id(),
        "receiptDigest": "b" * 64,
        "stage": "complete",
        "finishedAt": "2026-08-06T20:23:02.225Z",
        "errorCode": None,
        "recoveryAction": "none",
    }
    (receipts / "latest").mkdir(parents=True)
    (receipts / "latest" / f"{digest}.json").write_text(
        json.dumps({"bundleDigest": digest, "latestReceipt": receipt})
    )
    (receipts / "last-verified").mkdir(parents=True)
    (receipts / "last-verified" / f"{dashboard['id']}.json").write_text(
        json.dumps(
            {
                "bundleDigest": digest,
                "dashboard": {
                    "id": dashboard["id"],
                    "versionId": dashboard["versionId"],
                    "configurationDigest": dashboard["configurationDigest"],
                },
                "importReceipt": {
                    "receiptId": receipt["receiptId"],
                    "receiptDigest": receipt["receiptDigest"],
                },
                "projectionDigest": "c" * 64,
                "supersetDashboard": {
                    "url": "http://localhost:18088/superset/dashboard/catalyst-test/"
                },
            }
        )
    )

    imported = builder.publication(dashboard["versionId"])

    assert imported is not None
    assert imported["status"] == "imported"
    assert imported["importState"]["receiptId"] == receipt["receiptId"]
    assert (
        imported["importState"]["dashboardUrl"]
        == "http://localhost:18088/superset/dashboard/catalyst-test/"
    )

    (receipts / "last-verified" / f"{dashboard['id']}.json").write_text("{}")
    failed = builder.publication(dashboard["versionId"])
    assert failed is not None
    assert failed["status"] == "import_failed"
    assert failed["importState"]["errorCode"] == "last_verified_mismatch"
    assert (
        failed["importState"]["recoveryAction"]
        == "full_reset_then_reimport_last_verified_bundle"
    )
    assert "dashboardUrl" not in failed["importState"]


def test_unknown_chart_kind_cannot_be_silently_exported_as_a_table(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Monthly result values",
    )

    with pytest.raises(
        DashboardBuilderError,
        match="Unsupported presentation kind",
    ):
        builder.save_widget(
            dataset_version_id=dataset["versionId"],
            title="Result trend",
            presentation_kind="radar",
        )


def test_non_table_widgets_preserve_the_saved_dataset_as_their_source(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Monthly result values",
    )

    widget = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="Result trend",
        presentation_kind="time_series_line",
    )

    assert widget["configuration"]["datasetVersionId"] == dataset["versionId"]
    assert "aggregation" not in widget["configuration"]


def test_chart_widget_uses_the_saved_sql_even_when_the_preview_is_bounded(
    tmp_path: Path,
) -> None:
    workbench = _Workbench(truncated=True)
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Bounded laboratory result preview",
    )

    widget = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="Result trend",
        presentation_kind="time_series_line",
    )

    assert widget["configuration"]["presentationKind"] == "time_series_line"


def test_native_bundle_maps_saved_result_schema_to_superset_metrics(
    tmp_path: Path,
) -> None:
    columns = [
        {
            "ordinal": 0,
            "name": "observed_at",
            "databaseType": "date",
            "logicalType": "date",
        },
        {
            "ordinal": 1,
            "name": "test_name",
            "databaseType": "text",
            "logicalType": "string",
        },
        {
            "ordinal": 2,
            "name": "result_status",
            "databaseType": "text",
            "logicalType": "string",
        },
        {
            "ordinal": 3,
            "name": "result_value",
            "databaseType": "numeric",
            "logicalType": "decimal",
        },
    ]
    workbench = _Workbench(
        columns=columns,
        rows=[
            [
                {"type": "date", "value": "2026-01-01"},
                {"type": "string", "value": "Viral Load"},
                {"type": "string", "value": "final"},
                {"type": "decimal", "value": "14.2"},
            ],
            [
                {"type": "date", "value": "2026-02-01"},
                {"type": "string", "value": "CD4"},
                {"type": "string", "value": "preliminary"},
                {"type": "decimal", "value": "17.3"},
            ],
        ],
    )
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Monthly laboratory values",
    )
    widgets = [
        builder.save_widget(
            dataset_version_id=dataset["versionId"],
            title="Average result by month",
            presentation_kind="time_series_line",
        ),
        builder.save_widget(
            dataset_version_id=dataset["versionId"],
            title="Maximum result by test",
            presentation_kind="grouped_bar",
        ),
        builder.save_widget(
            dataset_version_id=dataset["versionId"],
            title="Result composition",
            presentation_kind="proportion_bar",
        ),
    ]
    dashboard = builder.save_dashboard(
        title="Lab operations",
        widget_version_ids=[widget["versionId"] for widget in widgets],
    )
    publication = builder.publish(dashboard["versionId"])
    bundle = tmp_path / "outbox" / publication["pointer"]["bundle"]["fileName"]

    with zipfile.ZipFile(bundle) as archive:
        charts = {
            json.loads(archive.read(name))["slice_name"]: json.loads(archive.read(name))
            for name in archive.namelist()
            if "/charts/" in name
        }

    line = charts["Average result by month"]
    assert line["viz_type"] == "echarts_timeseries_line"
    assert line["params"]["metrics"][0]["aggregate"] == "MAX"
    assert line["params"]["x_axis"] == "observed_at"
    assert line["params"]["groupby"] == ["test_name", "result_status"]
    grouped = charts["Maximum result by test"]
    assert grouped["viz_type"] == "echarts_timeseries_bar"
    assert grouped["params"]["metrics"][0]["aggregate"] == "MAX"
    assert grouped["params"]["x_axis"] == "test_name"
    assert grouped["params"]["groupby"] == ["result_status"]
    proportion = charts["Result composition"]
    assert proportion["params"]["stack"] == "Stack"
    assert proportion["params"]["contributionMode"] == "row"
    assert all("aggregation" not in item for item in publication["manifest"]["widgets"])


def test_saved_arrangement_versions_keep_identity_and_render_order(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Results",
    )
    first = builder.save_widget(dataset_version_id=dataset["versionId"], title="Table")
    second = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="Trend",
        presentation_kind="time_series_line",
    )
    original = builder.save_dashboard(
        title="Operations", widget_version_ids=[first["versionId"], second["versionId"]]
    )
    request = dict(
        title="Operations",
        widget_version_ids=[second["versionId"], first["versionId"]],
        widget_widths={first["versionId"]: 6, second["versionId"]: 6},
    )
    arranged = builder.save_dashboard(**request, base_version_id=original["versionId"])
    assert arranged["id"] == original["id"]
    assert arranged["ordinal"] == 2
    assert arranged["versionId"] != original["versionId"]
    assert (
        next(
            item
            for item in builder.list("dashboard")
            if item["versionId"] == arranged["versionId"]
        )
        == arranged
    )
    assert (
        next(
            item
            for item in builder.list("dashboard")
            if item["versionId"] == original["versionId"]
        )
        == original
    )
    assert (
        builder.save_dashboard(**request, base_version_id=arranged["versionId"])
        == arranged
    )
    published = builder.publish(arranged["versionId"])
    assert (
        published["manifest"]["dashboardSlug"]
        == builder.publish(original["versionId"])["manifest"]["dashboardSlug"]
    )
    with zipfile.ZipFile(
        tmp_path / "outbox" / published["pointer"]["bundle"]["fileName"]
    ) as archive:
        path = next(name for name in archive.namelist() if "/dashboards/" in name)
        layout = json.loads(archive.read(path))["position"]
    rows = layout["GRID_ID"]["children"]
    assert len(rows) == 1
    charts = [layout[key]["meta"] for key in layout[rows[0]]["children"]]
    assert [item["sliceName"] for item in charts] == ["Trend", "Table"]
    assert [item["width"] for item in charts] == [6, 6]
    assert (
        builder.publish(arranged["versionId"])["pointer"]["bundle"]
        == published["pointer"]["bundle"]
    )


def test_same_source_schema_refresh_composes_but_another_source_does_not(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    first = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Earlier result",
    )
    recorded = workbench.get_session(workbench.session_id)
    recorded["catalogVersion"] = "analytics-v2"
    workbench.get_session = lambda _session_id: recorded
    later = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Later result",
    )
    first_widget = builder.save_widget(
        dataset_version_id=first["versionId"], title="Earlier chart"
    )
    later_widget = builder.save_widget(
        dataset_version_id=later["versionId"], title="Later chart"
    )
    dashboard = builder.save_dashboard(
        title="Both results",
        widget_version_ids=[first_widget["versionId"], later_widget["versionId"]],
    )
    publication = builder.publish(dashboard["versionId"])
    assert {
        item["source"]["catalogVersion"] for item in publication["manifest"]["datasets"]
    } == {"analytics-v1", "analytics-v2"}
    recorded["provenance"]["dataSourceId"] = "another-source"
    other = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Other source",
    )
    other_widget = builder.save_widget(
        dataset_version_id=other["versionId"], title="Other chart"
    )
    with pytest.raises(DashboardBuilderError, match="cannot mix data sources"):
        builder.save_dashboard(
            title="Mixed sources",
            widget_version_ids=[first_widget["versionId"], other_widget["versionId"]],
        )


def test_save_is_idempotent_and_chart_edits_preserve_the_previous_version(
    tmp_path: Path,
) -> None:
    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    request = dict(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Saved query",
    )
    dataset = builder.save_dataset(**request)
    assert builder.save_dataset(**request) == dataset
    widget = builder.save_widget(dataset_version_id=dataset["versionId"], title="Table")
    changed = builder.save_widget(
        dataset_version_id=dataset["versionId"],
        title="Trend",
        presentation_kind="time_series_line",
        base_version_id=widget["versionId"],
    )
    assert changed["id"] == widget["id"]
    assert changed["ordinal"] == 2
    assert changed["versionId"] != widget["versionId"]
    assert (
        next(
            item
            for item in builder.list("widget")
            if item["versionId"] == widget["versionId"]
        )
        == widget
    )


def test_public_save_route_keeps_layout_and_rejects_invalid_widths(
    tmp_path: Path,
) -> None:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from src.catalyst.dashboard_routes import install_dashboard_routes

    workbench = _Workbench()
    builder = DashboardBuilder(
        tmp_path / "state.sqlite3", workbench=workbench, outbox=tmp_path / "outbox"
    )
    dataset = builder.save_dataset(
        session_id=workbench.session_id,
        execution_id=workbench.execution_id,
        title="Results",
    )
    app = FastAPI()
    install_dashboard_routes(app, builder)
    client = TestClient(app)
    chart = client.post(
        "/v1/catalyst/dashboard-builder/widgets",
        json={"datasetVersionId": dataset["versionId"], "title": "Result table"},
    )
    assert chart.status_code == 201
    chart_id = chart.json()["versionId"]
    endpoint = "/v1/catalyst/dashboard-builder/dashboards"
    created = client.post(
        endpoint,
        json={
            "title": "Overview",
            "widgetVersionIds": [chart_id],
            "widgetWidths": {chart_id: 6},
        },
    )
    assert created.status_code == 201
    updated = client.post(
        endpoint,
        json={
            "title": "Overview",
            "widgetVersionIds": [chart_id],
            "widgetWidths": {chart_id: 12},
            "baseVersionId": created.json()["versionId"],
        },
    )
    assert updated.status_code == 201
    assert updated.json()["id"] == created.json()["id"]
    assert updated.json()["ordinal"] == 2
    assert updated.json()["configuration"]["widgets"][0]["width"] == 12
    for widths in [{chart_id: 0}, {chart_id: True}, {"unknown-chart": 6}, []]:
        rejected = client.post(
            endpoint, json={"widgetVersionIds": [chart_id], "widgetWidths": widths}
        )
        assert rejected.status_code == 422
    assert len(client.get(endpoint).json()["items"]) == 2
