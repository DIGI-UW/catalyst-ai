"""Run source-aware Catalyst prefix warmup inside the deployed gateway image."""

from __future__ import annotations

import asyncio
import json
import uuid

from .catalyst.analytics import SqlAnalyticsAdapter
from .catalyst.catalog import Catalog
from .catalyst.contracts import ContractRegistry
from .catalyst.dialects import resolve_dialect_adapter
from .catalyst.local_hub import LocalHub
from .catalyst.request import build_query_request
from .config import GatewayConfig, load_config

WARMUP_QUESTION = "What information is available in this data source?"


async def warm_sources(config: GatewayConfig, hub: LocalHub) -> None:
    """Use schema discovery and the ordinary writer; never open user stores."""
    contracts = ContractRegistry.default()
    for source in config.data_sources:
        analytics = SqlAnalyticsAdapter(
            source.connection_uri,
            dialect=resolve_dialect_adapter(source.dialect_adapter),
            data_source_id=source.source_id,
        )
        catalog = Catalog.for_source(
            data_source=source.source_id, dialect=source.dialect
        ).with_discovered_relations(await analytics.discover_relations())
        request = build_query_request(
            WARMUP_QUESTION,
            catalog,
            max_rows=config.max_rows,
            statement_timeout_ms=config.statement_timeout_ms,
            request_id=str(uuid.uuid4()),
            trace_id=str(uuid.uuid4()),
            profile_id=config.default_query_profile_id,
        )
        contracts.validate("catalyst-query-request-v1.schema.json", request)
        await hub.warm_query_prefix(request)
        # Completion is an observation. A later request must demonstrate reuse.
        print(
            json.dumps(
                {
                    "dataSourceId": source.source_id,
                    "catalogVersion": catalog.catalog_version,
                    "profileId": config.default_query_profile_id,
                    "status": "completed",
                },
                sort_keys=True,
            ),
            flush=True,
        )


async def _main() -> None:
    config = load_config()
    hub = LocalHub(hub_base_url=config.hub_base_url)
    try:
        await warm_sources(config, hub)
    finally:
        await hub.aclose()


if __name__ == "__main__":
    asyncio.run(_main())
