"""The wire contracts must stay inside the subset llama.cpp compiles.

`response_format` is not a promise the backend keeps for free. llama.cpp turns
the schema into a GBNF grammar, and its converter does not implement `not` or
branch-local `required` inside a `oneOf`. A schema using them is accepted, a
grammar is produced, and the grammar is weaker than the schema -- so `strict:
True` reads as enforced while the model can still emit a forbidden shape.

That happened: a reviewer returned `candidate: {"status": "ready"}` with no SQL,
which REVIEW_SCHEMA forbids via `not`, and every follow-up turn died on the
resulting contract failure. These tests pin the shape of what we send.
"""

from __future__ import annotations

from typing import Any, Mapping

from src.catalyst.query_schemas import (
    GENERATION_FORMAT,
    REVIEW_FORMAT,
    REVIEW_VALIDATOR,
)

WIRE_FORMATS = {
    "generation": GENERATION_FORMAT,
    "review": REVIEW_FORMAT,
}

# Keywords llama.cpp's converter does not honour. `oneOf` is allowed, but only
# as a union of self-contained closed objects -- which the tests below check.
UNSUPPORTED_KEYWORDS = ("not", "if", "then", "else", "allOf", "anyOf")


def _walk(node: Any, path: str = ""):
    if isinstance(node, Mapping):
        yield path, node
        for key, value in node.items():
            yield from _walk(value, f"{path}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _walk(value, f"{path}/{index}")


def test_wire_formats_avoid_keywords_the_grammar_drops():
    for name, wire in WIRE_FORMATS.items():
        schema = wire["json_schema"]["schema"]
        for path, node in _walk(schema):
            for keyword in UNSUPPORTED_KEYWORDS:
                assert keyword not in node, (
                    f"{name} format uses {keyword!r} at {path or '/'}; llama.cpp "
                    "ignores it, so the grammar would be weaker than the schema"
                )


def test_every_oneof_branch_is_a_closed_self_describing_object():
    """A branch must not lean on sibling context to be correct.

    If a branch omits `type`/`additionalProperties`, or declares required fields
    it does not also list in `properties`, the compiled grammar cannot express
    the constraint even without `not`.
    """
    for name, wire in WIRE_FORMATS.items():
        schema = wire["json_schema"]["schema"]
        for path, node in _walk(schema):
            branches = node.get("oneOf")
            if not isinstance(branches, list):
                continue
            for index, branch in enumerate(branches):
                where = f"{name}{path}/oneOf/{index}"
                assert branch.get("type") == "object", f"{where} has no object type"
                assert (
                    branch.get("additionalProperties") is False
                ), f"{where} does not close additionalProperties"
                properties = branch.get("properties") or {}
                missing = [
                    field
                    for field in branch.get("required", [])
                    if field not in properties
                ]
                assert not missing, f"{where} requires undeclared {missing}"


def test_the_reviewer_can_only_approve_or_ask_for_a_revision():
    branches = {
        branch["properties"]["decision"]["const"]: branch
        for branch in REVIEW_FORMAT["json_schema"]["schema"]["oneOf"]
    }
    assert set(branches) == {"approve", "revise"}
    # A revision is only useful if it says what to change.
    assert "feedback" in branches["revise"]["required"]


def test_the_reviewer_has_no_way_to_return_sql():
    for branch in REVIEW_FORMAT["json_schema"]["schema"]["oneOf"]:
        assert "candidate" not in branch["properties"]
        assert "sql" not in branch["properties"]
    # And the validator refuses a reviewer-written query, so defence in depth holds.
    rewrite = {
        "decision": "approve",
        "checks": [{"name": "field-grounding", "status": "passed"}],
        "candidate": {"status": "ready", "sql": "SELECT 1"},
    }
    assert list(REVIEW_VALIDATOR.iter_errors(rewrite)), "validator accepts a rewrite"


def test_a_revision_without_feedback_is_not_a_valid_review():
    stub = {"decision": "revise", "checks": [{"name": "grain", "status": "failed"}]}
    assert list(REVIEW_VALIDATOR.iter_errors(stub)), "validator accepts the stub"


# --- the writer's three terminal outcomes ----------------------------------
#
# The prompt has always told the writer to ask rather than invent an
# identifier it cannot ground, while the wire pinned status to "ready" and made
# asking impossible. Faced with a request the data could not answer, the only
# legal move left was to fabricate, and it did. The wire now carries all three
# terminal outcomes the contract already defines.


def _generation_branches() -> dict[str, Mapping[str, Any]]:
    schema = GENERATION_FORMAT["json_schema"]["schema"]
    return {
        branch["properties"]["status"]["const"]: branch for branch in schema["oneOf"]
    }


def test_generation_wire_offers_exactly_the_three_writer_outcomes():
    assert set(_generation_branches()) == {
        "ready",
        "needs_clarification",
        "unsupported",
    }


def test_a_ready_branch_still_has_to_carry_a_complete_query():
    ready = _generation_branches()["ready"]
    assert set(ready["required"]) == {
        "status",
        "sql",
        "parameters",
        "expectedColumns",
    }
    assert "target" not in ready["properties"]


def test_asking_a_question_carries_the_question_and_no_sql():
    branch = _generation_branches()["needs_clarification"]
    assert set(branch["required"]) == {"status", "clarification"}
    # Closed, so the grammar itself cannot emit SQL on this branch.
    assert branch["additionalProperties"] is False
    assert "sql" not in branch["properties"]


def test_declining_carries_the_reason_and_no_sql():
    branch = _generation_branches()["unsupported"]
    assert set(branch["required"]) == {"status", "message"}
    assert branch["additionalProperties"] is False
    assert "sql" not in branch["properties"]


def test_the_gateways_rejection_is_not_a_writer_branch():
    """`rejected` is the Gateway's for policy, contract, or reviewer failure."""
    assert "rejected" not in _generation_branches()
