"""Contracts for Hub-owned Catalyst query profile discovery and execution."""

from __future__ import annotations

import copy
import asyncio
import hashlib
import json
from unittest.mock import patch

from src.catalyst.session_context import SESSION_CONTEXT_CONTRACT

import httpx
import pytest

from src.catalyst import query_engine
from src.catalyst import local_hub
from src.warmup import WARMUP_QUESTION
from src.catalyst.digest import canonical_sha256
from src.catalyst.hub import HubError
from src.catalyst.local_hub import LocalHub
from src.catalyst.service import CatalystService
from src.catalyst.storage import WorkbenchStore

PROFILE_ID = "catalyst-query-e4b-qwen14b"
WRITER = "google/gemma-4-e4b"
REVIEWER = "qwen2.5-14b-instruct-mlx"
VIEW_NAME = "analytics.lab_result_fact_v1"
TARGET = {
    "dataSource": "openelis-demo-analytics",
    "catalogVersion": "analytics-catalog-v1",
    "dialect": "fixture",
}


def _evidence() -> dict:
    evidence = {
        "profileId": PROFILE_ID,
        "profileName": "Catalyst query — Gemma 4 E4B writer, Qwen 2.5 14B reviewer",
        "writer": {
            "role": "writer",
            "providerId": "med-agent-hub",
            "modelClass": "gemma-4",
            "modelId": WRITER,
            "config": {"temperature": 0, "dry": 0, "maxTokens": 1024},
            "systemPrompt": {
                "promptId": "catalyst-query-generate",
                "version": "1",
                "promptRef": "med-agent-hub:server/prompts/catalyst-query-generate.txt",
                "promptDigest": hashlib.sha256(b"writer prompt").hexdigest(),
                "text": "writer prompt",
            },
        },
        "reviewer": {
            "role": "reviewer",
            "providerId": "med-agent-hub",
            "modelClass": "qwen2.5",
            "modelId": REVIEWER,
            "config": {"temperature": 0, "dry": 0, "maxTokens": 2048},
            "systemPrompt": {
                "promptId": "catalyst-query-review",
                "version": "1",
                "promptRef": "med-agent-hub:server/prompts/catalyst-query-review.txt",
                "promptDigest": hashlib.sha256(b"reviewer prompt").hexdigest(),
                "text": "reviewer prompt",
            },
        },
    }
    compact = copy.deepcopy(evidence)
    compact["writer"]["systemPrompt"].pop("text")
    compact["reviewer"]["systemPrompt"].pop("text")
    evidence["profileDigest"] = canonical_sha256(compact)
    return evidence


def _profile(*, available: bool = True) -> dict:
    return {
        "id": PROFILE_ID,
        "label": "Catalyst query — Gemma 4 E4B writer, Qwen 2.5 14B reviewer",
        "available": available,
        "required_models": [WRITER, REVIEWER],
        "role_models": {"query_generate": WRITER, "query_review": REVIEWER},
        "role_knobs": {
            "query_generate": {"temperature": 0, "dry": 0, "maxTokens": 1024},
            "query_review": {"temperature": 0, "dry": 0, "maxTokens": 2048},
        },
        "policies": {
            "generation_attempts": 3,
            "collaborative_review": True,
            "model_classes": {"query_generate": "gemma-4", "query_review": "qwen2.5"},
        },
        "profileEvidence": _evidence(),
        "unavailable_reasons": []
        if available
        else [f"model_not_advertised:{REVIEWER}"],
    }


def _discovery(*, profiles: list[dict] | None = None, reachable: bool = True) -> dict:
    return {
        "object": "list",
        "data": profiles if profiles is not None else [_profile()],
        "backend": {
            "contract_version": "med-agent-hub.backend-model-inventory.v1",
            "catalog_reachable": reachable,
            "advertised_model_ids": [WRITER, REVIEWER] if reachable else [],
        },
    }


def _hub(*, profiles: list[dict] | None = None, reachable: bool = True) -> LocalHub:
    def transport(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/hub/query-profiles":
            return httpx.Response(
                200, json=_discovery(profiles=profiles, reachable=reachable)
            )
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "healthy"})
        return httpx.Response(404)

    return LocalHub(hub_base_url="http://hub", transport=httpx.MockTransport(transport))


def _request() -> dict:
    return {
        "model": PROFILE_ID,
        "messages": [
            {"role": "user", "content": "Show viral load results since 2026-01-01"}
        ],
        "catalystQuery": {
            "contractVersion": "catalyst.query.request.v1",
            "requiredOutputContract": "catalyst.query.v1",
            "target": copy.deepcopy(TARGET),
            "catalog": {
                "contextSourceId": "catalog:analytics-catalog-v1",
                "views": [
                    {
                        "name": VIEW_NAME,
                        "version": "1",
                        "grain": "one row per result",
                        "fields": [
                            {"name": "viral_load_value", "type": "decimal"},
                            {"name": "release_date", "type": "date"},
                        ],
                    }
                ],
            },
            "policy": {
                "allowedOperation": "select",
                "requirePreview": True,
                "maxRows": 100,
                "statementTimeoutMs": 5000,
            },
            "correlation": {"requestId": "r1", "traceId": "t1"},
        },
    }


def _candidate() -> dict:
    return {
        "status": "ready",
        "target": {**TARGET, "approvedViews": [VIEW_NAME]},
        "sql": f"SELECT viral_load_value, release_date FROM {VIEW_NAME} WHERE release_date >= :since",
        "parameters": [
            {
                "name": "since",
                "type": "date",
                "source": "question",
                "value": "2026-01-01",
            }
        ],
        "expectedColumns": [
            {"name": "viral_load_value", "logicalType": "decimal", "nullable": False},
            {"name": "release_date", "logicalType": "date", "nullable": False},
        ],
    }


def _approval() -> dict:
    return {
        "decision": "approve",
        "checks": [{"name": "catalog_and_policy", "status": "passed", "message": "ok"}],
    }


@pytest.mark.asyncio
async def test_discovery_uses_hub_profile_evidence_and_hides_unavailable_profiles():
    unavailable = _profile(available=False)
    unavailable["id"] = "unavailable"
    hub = _hub(profiles=[_profile(), unavailable])
    profiles = await hub.list_query_profiles()
    await hub.aclose()

    # The in-process engine reads the Phase 1 layered context, so discovery
    # advertises it; Catalyst withholds the layer from a Hub that does not.
    assert profiles == [
        {**_profile(), "supported_request_contracts": [SESSION_CONTEXT_CONTRACT]}
    ]
    assert profiles[0]["profileEvidence"]["writer"]["modelId"] == WRITER
    assert profiles[0]["profileEvidence"]["reviewer"]["modelId"] == REVIEWER


@pytest.mark.asyncio
async def test_readiness_fails_closed_when_hub_profile_discovery_is_invalid():
    def transport(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "healthy"})
        return httpx.Response(200, json={"data": []})

    hub = LocalHub(hub_base_url="http://hub", transport=httpx.MockTransport(transport))
    readiness = await hub.readiness()
    await hub.aclose()

    assert readiness["hub"]["ready"] is True
    assert readiness["queryProfile"] == {
        "ready": False,
        "unavailableReasons": ["model_inventory_unavailable"],
    }
    assert readiness["modelRouter"]["ready"] is False


@pytest.mark.asyncio
async def test_generate_uses_named_hub_roles_and_preserves_hub_evidence():
    calls = []

    async def backend(client, profile_id, role, model, messages, **kwargs):
        calls.append({"profile_id": profile_id, "role": role, "model": model, **kwargs})
        return json.dumps(_candidate() if role == "query_generate" else _approval())

    hub = _hub()
    with patch.object(query_engine, "_backend_chat", side_effect=backend):
        result = await hub.generate_query(_request())
    await hub.aclose()

    assert result["status"] == "ready"
    assert result["_hubEvidence"]["profileEvidence"] == _evidence()
    assert [(call["profile_id"], call["role"], call["model"]) for call in calls] == [
        (PROFILE_ID, "query_generate", WRITER),
        (PROFILE_ID, "query_review", REVIEWER),
    ]
    assert [call["max_tokens"] for call in calls] == [1024, 2048]


@pytest.mark.asyncio
async def test_generation_rejects_unknown_or_unavailable_profile_before_model_call():
    hub = _hub(profiles=[_profile(available=False)])
    with pytest.raises(HubError) as error:
        await hub.generate_query(_request())
    await hub.aclose()

    assert error.value.code == "profile_unavailable"


@pytest.mark.asyncio
async def test_neutral_warmup_is_not_history_or_an_example_for_a_different_question():
    calls = []
    discarded_answer = "PRIVATE WARMUP ANSWER - must never be sent again"

    async def backend(client, profile_id, role, model, messages, **kwargs):
        calls.append(copy.deepcopy((profile_id, role, model, messages, kwargs)))
        if len(calls) == 1:
            return discarded_answer, None, None
        return json.dumps(_candidate() if role == "query_generate" else _approval())

    hub = _hub()
    warm_request = _request()
    warm_request["messages"][0]["content"] = WARMUP_QUESTION
    warm_request["catalystQuery"]["correlation"] = {
        "requestId": "warmup-request",
        "traceId": "warmup-trace",
    }
    try:
        with (
            patch.object(local_hub, "_warm_backend_prefix", side_effect=backend),
            patch.object(query_engine, "_backend_chat", side_effect=backend),
        ):
            assert await hub.warm_query_prefix(warm_request) is None
            assert len(calls) == 1  # No review, repair or saved answer from warmup.
            result = await hub.generate_query(_request())
        assert result["status"] == "ready"
        first, real = calls[:2]
        assert first[:3] == real[:3]
        assert first[4] == real[4]  # Same output format and profile settings.
        prefix = first[3][0]["content"].split(',"question":', 1)[0]
        assert real[3][0]["content"].startswith(prefix + ',"question":')
        for call in calls[1:]:
            content = json.dumps(call[3])
            assert WARMUP_QUESTION not in content
            assert discarded_answer not in content
            assert "warmup-request" not in content
            assert "warmup-trace" not in content
        payload = json.loads(real[3][0]["content"])
        assert payload["catalog"] == _request()["catalystQuery"]["catalog"]
        assert payload["question"] == _request()["messages"][0]["content"]
    finally:
        await hub.aclose()


@pytest.mark.asyncio
async def test_cancelling_warmup_closes_the_call_without_starting_another():
    started, stopped = asyncio.Event(), asyncio.Event()

    async def backend(*args, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()

    hub = _hub()
    with patch.object(local_hub, "_warm_backend_prefix", side_effect=backend) as call:
        task = asyncio.create_task(hub.warm_query_prefix(_request()))
        try:
            await asyncio.wait_for(started.wait(), 1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert stopped.is_set()
            assert call.call_count == 1
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await hub.aclose()


@pytest.mark.asyncio
async def test_warm_prefix_uses_the_internal_route_without_an_interactive_deadline():
    seen = {}

    def transport(request):
        seen["path"] = request.url.path
        seen["timeout"] = request.extensions["timeout"]
        seen["deadline"] = request.headers.get("X-Request-Timeout-Seconds")
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        await query_engine._warm_backend_prefix(
            client,
            PROFILE_ID,
            "query_generate",
            WRITER,
            [{"role": "user", "content": WARMUP_QUESTION}],
            response_format={"type": "json_object"},
            temperature=0,
            dry_multiplier=0,
            max_tokens=1024,
        )

    assert seen == {
        "path": f"/v1/hub/query-profiles/{PROFILE_ID}/roles/query_generate/warm",
        "timeout": {
            "connect": None,
            "read": None,
            "write": None,
            "pool": None,
        },
        "deadline": None,
    }


@pytest.mark.asyncio
async def test_named_role_call_has_no_automatic_deadline():
    seen = {}

    def transport(request):
        seen["path"] = request.url.path
        seen["timeout"] = request.extensions["timeout"]
        seen["deadline"] = request.headers.get("X-Request-Timeout-Seconds")
        return httpx.Response(200, json={"content": "{}"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        content, _, _ = await query_engine._backend_chat(
            client,
            PROFILE_ID,
            "query_generate",
            WRITER,
            [{"role": "user", "content": "Count results"}],
            response_format={"type": "json_object"},
            temperature=0,
            dry_multiplier=0,
            max_tokens=1024,
        )

    assert content == "{}"
    assert seen == {
        "path": f"/v1/hub/query-profiles/{PROFILE_ID}/roles/query_generate/generate",
        "timeout": {
            "connect": None,
            "read": None,
            "write": None,
            "pool": None,
        },
        "deadline": None,
    }


def test_turn_and_storage_snapshots_retain_hub_profile_evidence():
    discovery = {
        "id": PROFILE_ID,
        "label": _profile()["label"],
        "profileEvidence": _evidence(),
    }
    snapshot = CatalystService._turn_profile_snapshot(discovery)
    descriptor = WorkbenchStore._hub_profile_descriptor(
        _evidence(), compact_digest=_evidence()["profileDigest"]
    )

    assert snapshot["writer"]["modelId"] == WRITER
    assert snapshot["reviewer"]["modelId"] == REVIEWER
    assert descriptor["detail"]["writer"]["modelId"] == WRITER
    assert descriptor["detail"]["reviewer"]["modelId"] == REVIEWER


@pytest.mark.asyncio
async def test_the_local_hub_advertises_the_session_context_it_can_read(
    monkeypatch,
) -> None:
    """The in-process engine reads the Phase 1 shape, so it says so.

    Without the advertisement Catalyst withholds the layer, and nothing would
    ever receive guidance supplied for an experiment.
    """
    from src.catalyst.session_context import SESSION_CONTEXT_CONTRACT

    hub = LocalHub(hub_base_url="http://hub")

    async def _document():
        return (
            [{"id": "catalyst-query-checked", "available": True}],
            {"contract_version": "med-agent-hub.backend-model-inventory.v1"},
        )

    monkeypatch.setattr(hub, "_profile_document", _document)
    profiles = await hub.list_query_profiles()

    assert profiles[0]["supported_request_contracts"] == [SESSION_CONTEXT_CONTRACT]
