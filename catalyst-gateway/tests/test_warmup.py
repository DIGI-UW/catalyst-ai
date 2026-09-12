"""Warmup uses live schema discovery without opening user stores or running SQL."""

from dataclasses import replace
from unittest.mock import AsyncMock
import json

import pytest

from src import warmup
from src.catalyst.catalog import Catalog
from src.config import DataSourceConfig, load_config
from test_catalog_runtime import DISCOVERED_RELATION


@pytest.mark.asyncio
async def test_each_source_uses_its_own_schema_and_leaves_user_stores_unopened(
    tmp_path, monkeypatch, capsys
):
    config = replace(
        load_config(),
        data_sources=tuple(
            DataSourceConfig(name, name, f"fixture://{name}", "fixture", "fixture")
            for name in ("first", "second")
        ),
        preview_store_path=str(tmp_path / "user-state.sqlite3"),
        superset_outbox_path=str(tmp_path / "outbox"),
        superset_receipts_path=str(tmp_path / "receipts"),
    )
    discovered = []

    class SchemaOnlyConnection:
        def __init__(self, uri, *, dialect, data_source_id):
            self.source = data_source_id
            assert uri == f"fixture://{self.source}"

        async def discover_relations(self):
            discovered.append(self.source)
            return [{**DISCOVERED_RELATION, "name": f"{self.source}.records"}]

        async def execute(self, *args, **kwargs):
            pytest.fail("Warmup attempted SQL execution")

        execute_manual = execute

    monkeypatch.setattr(warmup, "SqlAnalyticsAdapter", SchemaOnlyConnection)
    hub = AsyncMock()
    await warmup.warm_sources(config, hub)
    assert discovered == ["first", "second"]
    requests = [call.args[0] for call in hub.warm_query_prefix.call_args_list]
    assert len(requests) == 2
    for source, request in zip(discovered, requests):
        assert request["messages"] == [
            {"role": "user", "content": warmup.WARMUP_QUESTION}
        ]
        assert request["model"] == config.default_query_profile_id
        context = request["catalystQuery"]
        assert context["target"]["dataSource"] == source
        expected = Catalog.for_source(data_source=source, dialect="fixture")
        expected = expected.with_discovered_relations(
            [{**DISCOVERED_RELATION, "name": f"{source}.records"}]
        )
        assert context["target"] == expected.request_target()
        assert context["catalog"] == expected.request_catalog()
    assert (
        requests[0]["catalystQuery"]["correlation"]
        != requests[1]["catalystQuery"]["correlation"]
    )
    assert list(tmp_path.iterdir()) == []
    receipts = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [item["dataSourceId"] for item in receipts] == discovered


@pytest.mark.asyncio
async def test_failed_source_does_not_claim_completion_or_retry(monkeypatch, capsys):
    analytics = AsyncMock()
    analytics.discover_relations.return_value = [DISCOVERED_RELATION]
    monkeypatch.setattr(warmup, "SqlAnalyticsAdapter", lambda *a, **kw: analytics)
    hub = AsyncMock()
    hub.warm_query_prefix.side_effect = RuntimeError("model unavailable")
    with pytest.raises(RuntimeError, match="model unavailable"):
        await warmup.warm_sources(load_config(), hub)
    assert hub.warm_query_prefix.call_count == 1
    assert not capsys.readouterr().out
