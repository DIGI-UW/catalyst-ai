"""Verify real role-payload assembly keeps full schema before changing context."""

from copy import deepcopy
import json
from os.path import commonprefix

from src.catalyst.query_engine import EngineRequest, _request_payload
from test_query_engine import _extension, _reviewed_profile


def test_different_questions_and_followup_share_the_complete_schema_prefix():
    initial = _extension()
    followup = deepcopy(initial)
    followup["contractVersion"] = "catalyst.query.request.v2"
    followup["correlation"] = {
        "requestId": "another-request",
        "traceId": "another-trace",
    }
    followup["revision"] = {
        "currentInstruction": "Break that count down by gender",
        "editorSnapshot": {"sql": "SELECT COUNT(*) AS patients FROM patients"},
    }
    payloads = [
        _request_payload(
            EngineRequest(
                catalyst_query=extension,
                messages=[{"role": "user", "content": question}],
                profile=_reviewed_profile(),
            ),
            extension,
        )
        for extension, question in (
            (initial, "How many patients are there?"),
            (followup, "Break that count down by gender"),
        )
    ]
    rendered = [json.dumps(payload, separators=(",", ":")) for payload in payloads]
    shared = commonprefix(rendered)
    assert json.dumps(initial["catalog"], separators=(",", ":")) in shared
    assert payloads[0]["catalog"] == payloads[1]["catalog"] == initial["catalog"]
    assert payloads[0]["question"] != payloads[1]["question"]
    assert payloads[1]["revision"] == followup["revision"]
    assert payloads[1]["correlation"] == followup["correlation"]


def test_changed_schema_is_not_replaced_by_a_previous_request():
    extension = _extension()
    request = EngineRequest(
        catalyst_query=extension,
        messages=[{"role": "user", "content": "Show the available data"}],
        profile=_reviewed_profile(),
    )
    before = _request_payload(request, extension)
    changed = deepcopy(extension)
    changed["catalog"]["views"][0]["fields"].append(
        {"name": "new_field", "type": "string"}
    )
    after = _request_payload(request, changed)
    assert after["catalog"] == changed["catalog"]
    assert before["catalog"] == extension["catalog"]
    assert after["catalog"] != before["catalog"]
