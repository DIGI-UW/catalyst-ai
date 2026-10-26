"""Governed-query JSON Schemas, structured-output formats, and contract errors.

Ported verbatim (behaviour-preserving) from the med-agent-hub's
``catalyst_query.py`` as part of moving query orchestration into the gateway.
Everything here is pure and derived from the ``catalyst.query.v1`` contract:

* the ``catalyst-query-v1`` final contract (loaded from ``docs/contracts``),
* the intermediate *candidate* / *review* / *repair* schemas the model must
  satisfy, and the strict ``response_format`` payloads passed to the hub,
* the narrow error types the pipeline raises when a model response breaks a
  strict contract.
"""

from __future__ import annotations

import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple

import json

from jsonschema import Draft202012Validator, FormatChecker

# docs/contracts lives at the catalyst submodule root: from
# src/catalyst/query_schemas.py that is parents[3] (matches ContractRegistry.default()).
_CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "docs"
    / "contracts"
    / "catalyst-query-v1.schema.json"
)
FINAL_SCHEMA = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(FINAL_SCHEMA)
FORMAT_CHECKER = FormatChecker()
FINAL_VALIDATOR = Draft202012Validator(FINAL_SCHEMA, format_checker=FORMAT_CHECKER)

STATUS_FIELDS = {
    "ready": ("target", "sql", "parameters", "expectedColumns"),
    "needs_clarification": ("clarification",),
    "unsupported": ("message",),
    "rejected": ("message",),
}
MODEL_READY_FIELDS = ("sql", "parameters", "expectedColumns")
ALL_STATUS_FIELDS = {
    "target",
    "sql",
    "parameters",
    "expectedColumns",
    "clarification",
    "message",
}


def _status_branch(
    status: str, required: Tuple[str, ...], forbidden: Tuple[str, ...]
) -> Dict[str, Any]:
    branch: Dict[str, Any] = {
        "properties": {"status": {"const": status}},
        "required": list(required),
    }
    if forbidden:
        branch["not"] = {"anyOf": [{"required": [field]} for field in forbidden]}
    return branch


CANDIDATE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["status"],
    "properties": {
        "status": {
            "enum": [
                "ready",
                "needs_clarification",
                "unsupported",
                "rejected",
            ]
        },
        "target": {"$ref": "#/$defs/target"},
        "sql": FINAL_SCHEMA["properties"]["sql"],
        "parameters": FINAL_SCHEMA["properties"]["parameters"],
        "expectedColumns": FINAL_SCHEMA["properties"]["expectedColumns"],
        "clarification": FINAL_SCHEMA["properties"]["clarification"],
        "message": FINAL_SCHEMA["properties"]["message"],
    },
    "oneOf": [
        _status_branch(
            status,
            fields,
            tuple(sorted(ALL_STATUS_FIELDS - set(fields))),
        )
        for status, fields in STATUS_FIELDS.items()
    ],
    "$defs": {
        name: deepcopy(FINAL_SCHEMA["$defs"][name])
        for name in ("target", "parameter", "column")
    },
}
Draft202012Validator.check_schema(CANDIDATE_SCHEMA)
CANDIDATE_VALIDATOR = Draft202012Validator(
    CANDIDATE_SCHEMA, format_checker=FORMAT_CHECKER
)

CHECK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "status"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "status": {"enum": ["passed", "warned", "failed"]},
        "message": {"type": "string"},
    },
}
FEEDBACK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["issue", "suggestion"],
    "properties": {
        "issue": {"type": "string", "minLength": 1},
        "suggestion": {"type": "string", "minLength": 1},
    },
}
# The reviewer checks the writer's query and never writes SQL itself. It
# approves, or asks for a revision with feedback the writer acts on once.
REVIEW_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["decision", "checks"],
    "properties": {
        "decision": {"enum": ["approve", "revise"]},
        "checks": {
            "type": "array",
            "minItems": 1,
            "items": CHECK_SCHEMA,
        },
        "feedback": {"type": "array", "minItems": 1, "items": FEEDBACK_SCHEMA},
        "message": {"type": "string", "minLength": 1},
    },
    "allOf": [
        {
            "if": {"properties": {"decision": {"const": "revise"}}},
            "then": {"required": ["feedback"]},
        }
    ],
}
Draft202012Validator.check_schema(REVIEW_SCHEMA)
REVIEW_VALIDATOR = Draft202012Validator(REVIEW_SCHEMA, format_checker=FORMAT_CHECKER)


class QueryContractError(ValueError):
    """A model response failed a strict query-stage contract."""


class QueryGenerationError(QueryContractError):
    """Generation stopped after preserving its deterministic attempt history."""

    def __init__(
        self,
        message: str,
        history: list[dict[str, Any]],
        *,
        candidate: Optional[Mapping[str, Any]] = None,
        raw_output: Optional[str] = None,
    ) -> None:
        self.history = deepcopy(history)
        self.candidate = deepcopy(candidate) if candidate is not None else None
        self.raw_output = raw_output
        super().__init__(message)


class QueryReviewError(QueryContractError):
    """Review failed after retaining the exact model output as evidence."""

    def __init__(self, message: str, *, raw_output: str) -> None:
        self.raw_output = raw_output
        super().__init__(message)


class QueryPatchError(QueryContractError):
    """A generation correction patch violated its strict local scope."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


def structured_format(name: str, schema: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": schema,
        },
    }


def _flatten_conditional_object(schema: Mapping[str, Any]) -> Dict[str, Any]:
    """Fold a base object plus its ``oneOf`` refinements into closed branches.

    The parameter contract is written as a base object (name, type, source) with
    a ``oneOf`` that pins ``value`` to the declared type. Each of those branches
    inherits the base by sitting alongside it -- correct JSON Schema, and
    another shape llama.cpp's converter cannot carry: branch-local ``required``
    is dropped, so the grammar permits a parameter with no ``value`` at all, or
    a string where an integer was declared.

    Merging each branch with the base produces self-contained alternatives that
    say the same thing without relying on sibling context.
    """
    base = {
        key: deepcopy(value)
        for key, value in schema.items()
        if key not in ("oneOf", "anyOf", "allOf")
    }
    variants = schema.get("oneOf")
    if not variants:
        return base

    branches: list[Dict[str, Any]] = []
    for variant in variants:
        properties = deepcopy(base.get("properties", {}))
        properties.update(deepcopy(variant.get("properties", {})))
        required = sorted(
            set(base.get("required", [])) | set(variant.get("required", []))
        )
        branches.append(
            {
                "type": "object",
                "additionalProperties": False,
                "required": required,
                "properties": properties,
            }
        )
    return {"oneOf": branches}


def _grammar_safe_defs(defs: Mapping[str, Any]) -> Dict[str, Any]:
    """The shared ``$defs``, with conditional objects flattened for the wire."""
    return {
        name: _flatten_conditional_object(definition)
        for name, definition in deepcopy(dict(defs)).items()
    }


# The wire contract for generation, as the writer's three terminal outcomes.
# Each is a closed object, for the same reason review is: llama.cpp's
# schema-to-grammar converter drops `not` and branch-local `required`, so a
# branch has to be unable to express the other statuses rather than forbidden
# from doing so.
#
# Pinning this to "ready" alone is what forced invention. The prompt tells the
# writer to ask rather than invent an identifier it cannot ground, and the wire
# gave it no way to ask; a request the data could not answer left fabrication
# as the only legal move.
BACKEND_GENERATION_SCHEMA: Dict[str, Any] = {
    "oneOf": [
        {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "status",
                *MODEL_READY_FIELDS,
            ],
            "properties": {
                "status": {"const": "ready"},
                "sql": deepcopy(CANDIDATE_SCHEMA["properties"]["sql"]),
                "parameters": deepcopy(CANDIDATE_SCHEMA["properties"]["parameters"]),
                "expectedColumns": deepcopy(
                    CANDIDATE_SCHEMA["properties"]["expectedColumns"]
                ),
            },
        },
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["status", "clarification"],
            "properties": {
                "status": {"const": "needs_clarification"},
                "clarification": deepcopy(
                    CANDIDATE_SCHEMA["properties"]["clarification"]
                ),
            },
        },
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["status", "message"],
            "properties": {
                "status": {"const": "unsupported"},
                "message": deepcopy(CANDIDATE_SCHEMA["properties"]["message"]),
            },
        },
    ],
    "$defs": _grammar_safe_defs(CANDIDATE_SCHEMA["$defs"]),
}


_BACKEND_CHECKS: Dict[str, Any] = {
    "type": "array",
    "minItems": 1,
    "items": deepcopy(CHECK_SCHEMA),
}
# The wire contract for review, as two closed alternatives the grammar compiles
# faithfully. A revision carries feedback in words; there is no SQL to return.
BACKEND_REVIEW_SCHEMA: Dict[str, Any] = {
    "oneOf": [
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["decision", "checks"],
            "properties": {
                "decision": {"const": "approve"},
                "checks": deepcopy(_BACKEND_CHECKS),
                "message": {"type": "string"},
            },
        },
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["decision", "checks", "feedback"],
            "properties": {
                "decision": {"const": "revise"},
                "checks": deepcopy(_BACKEND_CHECKS),
                "feedback": {
                    "type": "array",
                    "minItems": 1,
                    "items": deepcopy(FEEDBACK_SCHEMA),
                },
                "message": {"type": "string"},
            },
        },
    ],
}
Draft202012Validator.check_schema(BACKEND_GENERATION_SCHEMA)
Draft202012Validator.check_schema(BACKEND_REVIEW_SCHEMA)

GENERATION_FORMAT = structured_format(
    "catalyst_query_candidate", BACKEND_GENERATION_SCHEMA
)
REVIEW_FORMAT = structured_format("catalyst_query_review", BACKEND_REVIEW_SCHEMA)

PATCH_OPERATION_SCHEMA: Dict[str, Any] = {
    "oneOf": [
        {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "findingCode",
                "op",
                "path",
                "oldValue",
                "replacement",
            ],
            "properties": {
                "findingCode": {"type": "string", "minLength": 1},
                "op": {"const": "replace_text"},
                "path": {"const": "/sql"},
                "oldValue": {"type": "string", "minLength": 1},
                "replacement": {"type": "string"},
            },
        },
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["findingCode", "op", "path", "value"],
            "properties": {
                "findingCode": {"type": "string", "minLength": 1},
                "op": {"enum": ["add", "replace"]},
                "path": {"type": "string", "pattern": "^/"},
                "value": {},
            },
        },
    ]
}
BACKEND_PATCH_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["patches"],
    "properties": {
        "patches": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": PATCH_OPERATION_SCHEMA,
        }
    },
}
Draft202012Validator.check_schema(BACKEND_PATCH_SCHEMA)
PATCH_VALIDATOR = Draft202012Validator(
    BACKEND_PATCH_SCHEMA, format_checker=FORMAT_CHECKER
)


def patch_format(
    allowed_paths: list[str],
    finding_codes: list[str],
    *,
    add_only_paths: Optional[set[str]] = None,
) -> Dict[str, Any]:
    """Return a strict private response schema narrowed to current findings."""
    codes = sorted(set(finding_codes))
    add_only = add_only_paths or set()
    operation_variants: list[dict[str, Any]] = []
    if "/sql" in allowed_paths:
        text_variant = deepcopy(PATCH_OPERATION_SCHEMA["oneOf"][0])
        text_variant["properties"]["findingCode"] = {"enum": codes}
        operation_variants.append(text_variant)

    for path in (path for path in allowed_paths if path != "/sql"):
        leaf_variant = deepcopy(PATCH_OPERATION_SCHEMA["oneOf"][1])
        leaf_variant["properties"]["findingCode"] = {"enum": codes}
        leaf_variant["properties"]["path"] = {"const": path}
        if path == "/parameters/-":
            leaf_variant["properties"]["op"] = {"const": "add"}
            leaf_variant["properties"]["value"] = deepcopy(
                CANDIDATE_SCHEMA["$defs"]["parameter"]
            )
        elif re.fullmatch(r"/parameters/\d+/name", path):
            if path in add_only:
                leaf_variant["properties"]["op"] = {"const": "add"}
            leaf_variant["properties"]["value"] = deepcopy(
                CANDIDATE_SCHEMA["$defs"]["parameter"]["properties"]["name"]
            )
        elif re.fullmatch(r"/expectedColumns/\d+/name", path):
            leaf_variant["properties"]["op"] = {"const": "replace"}
            leaf_variant["properties"]["value"] = deepcopy(
                CANDIDATE_SCHEMA["$defs"]["column"]["properties"]["name"]
            )
        operation_variants.append(leaf_variant)

    schema = deepcopy(BACKEND_PATCH_SCHEMA)
    schema["properties"]["patches"]["items"]["oneOf"] = operation_variants
    return structured_format("catalyst_query_candidate_patch", schema)


def validation_error(
    validator: Draft202012Validator, value: Any, label: str
) -> QueryContractError:
    errors = sorted(
        validator.iter_errors(value),
        key=lambda error: [str(item) for item in error.absolute_path],
    )
    if not errors:
        return QueryContractError("")
    error = errors[0]
    location = ".".join(str(item) for item in error.absolute_path) or "<root>"
    return QueryContractError(f"{label} failed at {location}: {error.message}")
