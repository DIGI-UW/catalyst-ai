"""Request interruption tests through the real routes and persistent turn store."""

from __future__ import annotations

import asyncio
import json

import pytest

from src.catalyst import query_engine
from src.catalyst.generation_lifecycle import GenerationCancelled
from test_query_engine import (
    _extension,
    _ready_candidate,
    _reviewed_profile,
    QUESTION as ENGINE_QUESTION,
)
from test_workbench_routes import (
    FakeHub,
    PROFILE_ID,
    QUESTION,
    _client,
    _create_session,
    _ready_query,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["initial", "first_question", "followup"])
async def test_disconnect_stops_generation_and_releases_turn(
    tmp_path, monkeypatch, kind
):
    hub = FakeHub(_ready_query())
    client, analytics = _client(tmp_path, _ready_query(), hub=hub)
    session = None
    body = {
        "contractVersion": "catalyst.workbench.session.request.v1",
        "deploymentMode": "demo",
        "question": QUESTION,
        "profileId": PROFILE_ID,
    }
    path = "/v1/catalyst/workbench/sessions"
    if kind != "initial":
        session = _create_session(
            client, question="" if kind == "first_question" else QUESTION
        )
        path += f"/{session['sessionId']}"
        if kind == "first_question":
            path += "/question"
            body = {"question": QUESTION, "profileId": PROFILE_ID}
        else:
            path += "/turns"
            base = session["currentVersion"]
            body = {
                "contractVersion": "catalyst.workbench.turn.request.v1",
                "instruction": "Only include finalized observations",
                "profileId": PROFILE_ID,
                "observedBase": {
                    "versionId": base["versionId"],
                    "queryDigest": base["queryDigest"],
                },
                "editorSnapshot": {
                    "contractVersion": "catalyst.workbench.editor-snapshot.v1",
                    "sql": base["sql"],
                    "parameters": base["parameters"],
                    "expectedColumns": base["expectedColumns"],
                    "editorDigest": base["queryDigest"],
                },
            }

    started = asyncio.Event()
    stopped = asyncio.Event()
    calls = []
    original_generate = hub.generate_query

    async def blocked_generation(request):
        calls.append(request)
        started.set()
        try:
            await asyncio.Event().wait()
            calls.append("unexpected later repair")
        finally:
            stopped.set()

    monkeypatch.setattr(hub, "generate_query", blocked_generation)
    messages = []
    body_sent = False

    async def receive():
        nonlocal body_sent
        if not body_sent:
            body_sent = True
            return {"type": "http.request", "body": json.dumps(body).encode()}
        await started.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
    }
    request_task = asyncio.create_task(client.app(scope, receive, send))
    try:
        await asyncio.wait_for(started.wait(), 1)
        done, _ = await asyncio.wait({request_task}, timeout=0.5)
        assert request_task in done, "The route kept running after interruption"
        await request_task
        assert stopped.is_set()
        assert len(calls) == 1
        assert messages[0]["status"] == 499
        response = json.loads(messages[1]["body"])
        code = "generation_cancelled"
        assert response["error"]["code"] == code

        if session is None:
            session = client.get("/v1/catalyst/workbench/sessions").json()["sessions"][
                0
            ]
        session_id = session["sessionId"]
        timeline = client.get(
            f"/v1/catalyst/workbench/sessions/{session_id}/turns"
        ).json()
        failed = timeline["turns"][-1]
        assert failed["status"] == "failed"
        assert failed["failure"]["code"] == code
        assert failed["instruction"] == body.get("instruction", QUESTION)
        restored = client.get(f"/v1/catalyst/workbench/sessions/{session_id}").json()
        assert restored["currentVersionId"] == session.get("currentVersionId")
        if kind == "followup":
            assert failed["editorSnapshot"]["content"] == body["editorSnapshot"]
            monkeypatch.setattr(hub, "generate_query", original_generate)
            assert client.post(path, json=body).status_code == 201
        assert analytics.manual_calls == []
    finally:
        request_task.cancel()
        await asyncio.gather(request_task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["writer", "repair", "reviewer"])
async def test_cancelled_engine_keeps_role_evidence_without_later_repairs(
    monkeypatch, tmp_path, stage
):
    monkeypatch.setenv("TEAM_TRACE_DIR", str(tmp_path))
    active = asyncio.Event()
    roles = []

    async def backend(client, profile, role, model, messages, **kwargs):
        roles.append(role)
        if len(roles) == 1 and stage != "writer":
            candidate = _ready_candidate()
            if stage == "repair":
                candidate["expectedColumns"][0]["name"] = "wrong_column"
            return json.dumps(candidate)
        active.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(query_engine, "_backend_chat", backend)
    request = query_engine.EngineRequest(
        catalyst_query=_extension(),
        messages=[{"role": "user", "content": ENGINE_QUESTION}],
        profile=_reviewed_profile(),
    )

    async def generate():
        return [item async for item in query_engine.execute_query_profile(request)]

    task = asyncio.create_task(generate())
    try:
        await asyncio.wait_for(active.wait(), 1)
        task.cancel("generation_cancelled")
        with pytest.raises(GenerationCancelled) as caught:
            await task
        invocations = caught.value.evidence["modelInvocations"]
        assert len(invocations) == (1 if stage == "writer" else 2)
        assert invocations[-1]["outcome"] == "cancelled"
        assert invocations[-1]["role"] == (
            "reviewer" if stage == "reviewer" else "writer"
        )
        assert len(roles) == len(invocations)
        assert caught.value.args == ("generation_cancelled",)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
