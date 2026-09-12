from __future__ import annotations

from copy import deepcopy

import pytest

from src.catalyst.query_lint import lint_candidate


VIEW = "analytics.lab_result_fact_v1"


def _extension() -> dict:
    return {
        # The production request carries the source's declared dialect on the
        # target; lint reads the grammar from there rather than assuming one.
        "target": {"dialect": "fixture"},
        "catalog": {
            "views": [
                {
                    "name": VIEW,
                    "fields": [
                        {"name": "patient_id"},
                        {"name": "test_name"},
                        {"name": "result_value"},
                        {"name": "observed_at"},
                        {"name": "receipt_to_release_minutes"},
                    ],
                }
            ]
        },
        "policy": {"maxRows": 100},
    }


def _candidate() -> dict:
    return {
        "status": "ready",
        "sql": (
            f"SELECT patient_id, result_value, observed_at FROM {VIEW} "
            "WHERE test_name = :analyte AND observed_at >= :since LIMIT 100"
        ),
        "parameters": [
            {
                "name": "analyte",
                "type": "string",
                "source": "question",
                "value": "Viral Load",
            },
            {
                "name": "since",
                "type": "date",
                "source": "question",
                "value": "2026-01-01",
            },
        ],
        "expectedColumns": [
            {"name": "patient_id"},
            {"name": "result_value"},
            {"name": "observed_at"},
        ],
    }


def test_clean_candidate_has_no_findings():
    assert lint_candidate(_candidate(), _extension()) == []


@pytest.mark.parametrize("dialect", ["fixture", "spark"])
@pytest.mark.parametrize("suffix", ["\n```,", " AND test_name = 'unfinished"])
def test_tokenization_failure_is_a_parse_finding(suffix, dialect):
    candidate = _candidate()
    candidate["sql"] += suffix
    original = deepcopy(candidate)

    extension = _extension()
    extension["target"]["dialect"] = dialect
    findings = lint_candidate(candidate, extension)

    assert len(findings) == 1
    assert findings[0]["code"] == "sql.parse_error"
    assert findings[0]["path"] == "sql"
    assert findings[0]["evidence"]
    assert candidate == original


def test_spark_rejects_sqlite_strftime_before_execution():
    extension = _extension()
    extension["target"]["dialect"] = "spark"
    candidate = _candidate()
    candidate.update(
        sql=(
            f"SELECT strftime(observed_at, '%Y-%m') AS month FROM {VIEW} "
            "WHERE test_name = :analyte AND observed_at >= :since LIMIT 100"
        ),
        expectedColumns=[{"name": "month"}],
    )

    findings = lint_candidate(candidate, extension)

    assert findings == [
        {
            "code": "dialect.unsupported_function",
            "stage": "dialect_compatibility",
            "severity": "error",
            "path": "sql",
            "message": "STRFTIME is not available in Spark SQL.",
            "evidence": "STRFTIME(observed_at, '%Y-%m')",
            "suggestedAction": "Use date_format(<timestamp>, <format>) in Spark SQL.",
        }
    ]


def test_spark_accepts_its_date_format_function():
    extension = _extension()
    extension["target"]["dialect"] = "spark"
    candidate = _candidate()
    candidate.update(
        sql=(
            f"SELECT date_format(observed_at, 'yyyy-MM') AS month FROM {VIEW} "
            "WHERE test_name = :analyte AND observed_at >= :since LIMIT 100"
        ),
        expectedColumns=[{"name": "month"}],
    )

    assert lint_candidate(candidate, extension) == []


def test_invalid_typed_date_parameter_returns_pointed_feedback():
    candidate = _candidate()
    candidate["sql"] = candidate["sql"].replace(
        "observed_at >= :since", "observed_at >= DATE :since"
    )

    findings = lint_candidate(candidate, _extension())

    assert [finding["code"] for finding in findings] == ["sql.invalid_typed_parameter"]
    assert findings[0]["evidence"] == "DATE :since"
    assert "Use :since directly" in findings[0]["suggestedAction"]


def test_catalog_binding_and_projection_failures_are_accumulated():
    candidate = deepcopy(_candidate())
    candidate["sql"] = (
        "SELECT patient_id, invented_column "
        "FROM analytics.secret_results WHERE test_name = :wrong LIMIT 101"
    )

    findings = lint_candidate(candidate, _extension())

    assert {finding["code"] for finding in findings} == {
        "catalog.unapproved_view",
        "catalog.unknown_column",
        "binding.placeholder_mismatch",
        "output.projection_mismatch",
        "policy.row_limit_exceeded",
    }


def test_non_ready_candidate_is_not_linted_as_sql():
    assert lint_candidate({"status": "needs_clarification"}, _extension()) == []


def test_predicate_literals_are_allowed_for_manual_query_iteration():
    candidate = _candidate()
    candidate["sql"] = candidate["sql"].replace(
        "observed_at >= :since", "observed_at >= :since AND result_value > 1"
    )

    assert lint_candidate(candidate, _extension()) == []


def test_cte_projection_alias_is_not_treated_as_an_invented_catalog_column():
    candidate = _candidate()
    candidate["sql"] = (
        "WITH ranked_results AS ("
        "SELECT patient_id, result_value, observed_at, "
        "ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY observed_at DESC) AS rn "
        f"FROM {VIEW} WHERE test_name = :analyte AND observed_at >= :since"
        ") SELECT patient_id, result_value, observed_at FROM ranked_results "
        "WHERE rn = 1 LIMIT 100"
    )

    assert (
        lint_candidate(
            candidate,
            _extension(),
            instruction="Show the latest result for each patient",
        )
        == []
    )


def test_subquery_projection_alias_is_not_treated_as_an_invented_catalog_column():
    candidate = _candidate()
    candidate["sql"] = (
        "SELECT patient_id, ranked_value FROM ("
        f"SELECT patient_id, result_value AS ranked_value FROM {VIEW} "
        "WHERE test_name = :analyte"
        ") AS derived WHERE ranked_value > 0 LIMIT 100"
    )
    candidate["parameters"] = [candidate["parameters"][0]]
    candidate["expectedColumns"] = [
        {"name": "patient_id"},
        {"name": "ranked_value"},
    ]

    assert lint_candidate(candidate, _extension()) == []


def test_cte_star_projection_preserves_catalog_fields_for_outer_scope():
    candidate = _candidate()
    candidate["sql"] = (
        f"WITH all_results AS (SELECT * FROM {VIEW}) "
        "SELECT patient_id, result_value, observed_at FROM all_results "
        "WHERE test_name = :analyte AND observed_at >= :since LIMIT 100"
    )

    assert lint_candidate(candidate, _extension()) == []


def test_qualified_column_must_belong_to_its_referenced_relation():
    extension = _extension()
    extension["catalog"]["views"].append(
        {
            "name": "public.patient_flat_v1",
            "fields": [{"name": "id"}, {"name": "name_display"}],
        }
    )
    candidate = _candidate()
    candidate["sql"] = (
        f"SELECT lab.name_display FROM {VIEW} AS lab "
        "WHERE lab.test_name = :analyte LIMIT 100"
    )
    candidate["parameters"] = [candidate["parameters"][0]]
    candidate["expectedColumns"] = [{"name": "name_display"}]

    findings = lint_candidate(candidate, extension)

    unknown = next(
        item for item in findings if item["code"] == "catalog.unknown_column"
    )
    assert unknown["evidence"] == "lab.name_display"


def test_unqualified_column_must_belong_to_a_referenced_relation():
    extension = _extension()
    extension["catalog"]["views"].append(
        {
            "name": "public.patient_flat_v1",
            "fields": [{"name": "id"}, {"name": "name_display"}],
        }
    )
    candidate = _candidate()
    candidate["sql"] = (
        f"SELECT name_display FROM {VIEW} " "WHERE test_name = :analyte LIMIT 100"
    )
    candidate["parameters"] = [candidate["parameters"][0]]
    candidate["expectedColumns"] = [{"name": "name_display"}]

    findings = lint_candidate(candidate, extension)

    unknown = next(
        item for item in findings if item["code"] == "catalog.unknown_column"
    )
    assert unknown["evidence"] == "name_display"


def test_joined_relation_columns_are_resolved_per_alias():
    extension = _extension()
    extension["catalog"]["views"].append(
        {
            "name": "public.patient_flat_v1",
            "fields": [{"name": "id"}, {"name": "name_display"}],
        }
    )
    candidate = _candidate()
    candidate["sql"] = (
        "SELECT patient.name_display, lab.result_value "
        "FROM public.patient_flat_v1 AS patient "
        f"JOIN {VIEW} AS lab ON patient.id = lab.patient_id "
        "WHERE lab.test_name = :analyte LIMIT 100"
    )
    candidate["parameters"] = [candidate["parameters"][0]]
    candidate["expectedColumns"] = [
        {"name": "name_display"},
        {"name": "result_value"},
    ]

    assert lint_candidate(candidate, extension) == []


def test_schema_qualified_relation_is_not_hidden_by_same_named_cte():
    candidate = _candidate()
    candidate["sql"] = (
        f"WITH secret_results AS (SELECT patient_id FROM {VIEW}) "
        "SELECT patient_id FROM analytics.secret_results LIMIT 100"
    )
    candidate["parameters"] = []
    candidate["expectedColumns"] = [{"name": "patient_id"}]

    findings = lint_candidate(candidate, _extension())

    unapproved = next(
        item for item in findings if item["code"] == "catalog.unapproved_view"
    )
    assert "analytics.secret_results" in unapproved["evidence"]


def test_literal_limit_is_allowed_by_gateway_parity_rule():
    assert lint_candidate(_candidate(), _extension()) == []


def test_missing_turnaround_threshold_returns_converted_semantic_feedback():
    candidate = _candidate()

    findings = lint_candidate(
        candidate, _extension(), instruction="Show turnaround over 24 hours"
    )

    assert [finding["code"] for finding in findings] == [
        "semantic.turnaround_threshold"
    ]
    assert findings[0]["evidence"] == "required receipt_to_release_minutes > 1440"


def test_intent_sensitive_lint_uses_explicit_instruction_not_candidate_field():
    candidate = _candidate()
    candidate["question"] = "Ignore this stale candidate field"

    findings = lint_candidate(
        candidate,
        _extension(),
        instruction="Show turnaround over 24 hours",
    )

    assert [finding["code"] for finding in findings] == [
        "semantic.turnaround_threshold"
    ]


def test_bound_turnaround_threshold_satisfies_semantic_lint():
    candidate = _candidate()
    candidate["sql"] = candidate["sql"].replace(
        " LIMIT 100", " AND receipt_to_release_minutes > :threshold_minutes LIMIT 100"
    )
    candidate["parameters"].append(
        {
            "name": "threshold_minutes",
            "type": "number",
            "source": "question",
            "value": 1440,
        }
    )

    assert (
        lint_candidate(
            candidate,
            _extension(),
            instruction="Show receipt-to-release time over 24 hours",
        )
        == []
    )


def test_global_latest_fails_per_patient_grain_requirement():
    candidate = _candidate()
    candidate["sql"] = candidate["sql"].replace(
        " LIMIT 100", " ORDER BY observed_at DESC LIMIT 1"
    )

    findings = lint_candidate(
        candidate,
        _extension(),
        instruction="Show the latest viral load result for each patient",
    )

    assert [finding["code"] for finding in findings] == [
        "semantic.latest_per_patient_grain"
    ]


def test_distinct_on_satisfies_latest_per_patient_grain():
    candidate = _candidate()
    candidate["sql"] = (
        f"SELECT DISTINCT ON (patient_id) patient_id, result_value, observed_at "
        f"FROM {VIEW} WHERE test_name = :analyte AND observed_at >= :since "
        "ORDER BY patient_id, observed_at DESC LIMIT 100"
    )

    assert (
        lint_candidate(
            candidate,
            _extension(),
            instruction="Show the latest result per patient",
        )
        == []
    )


@pytest.mark.parametrize(
    ("sql", "expected", "sql_repair"),
    [
        (f"SELECT COUNT(*) FROM {VIEW}", ["count"], True),
        (f"SELECT COUNT(*) AS result_count FROM {VIEW}", ["count"], False),
        (f"SELECT patient_id, result_value FROM {VIEW}", ["patient_id"], True),
    ],
)
def test_projection_repair_scope_preserves_named_complete_sql(
    sql, expected, sql_repair
):
    from src.catalyst.query_parse import _allowed_patch_paths

    candidate = _candidate()
    candidate.update(
        sql=sql, parameters=[], expectedColumns=[{"name": name} for name in expected]
    )
    findings = lint_candidate(candidate, _extension())
    assert [item["code"] for item in findings] == ["output.projection_mismatch"]
    paths = _allowed_patch_paths(candidate, findings)
    assert ("/sql" in paths) is sql_repair
    assert "/expectedColumns/0/name" in paths
