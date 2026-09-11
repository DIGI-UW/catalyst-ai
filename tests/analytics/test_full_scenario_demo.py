import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class FullScenarioDemoContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = (
            ROOT / "catalyst-ui/e2e/full-scenario-demo.spec.ts"
        ).read_text()
        cls.import_helper = (
            ROOT / "catalyst-ui/e2e/support/superset-import.ts"
        ).read_text()
        cls.superset_fixture = (
            ROOT / "scripts/superset-demo-fixture.mjs"
        ).read_text()
        cls.runbook = (ROOT / "docs/full-scenario-demo.md").read_text()
        cls.phase1_journeys = (
            ROOT / "catalyst-ui/e2e/phase1-journeys.spec.ts"
        ).read_text()
        cls.cohort = json.loads(
            (ROOT / "analytics/openelis/catalyst-cohort-v1.json").read_text()
        )

    def test_flagship_has_only_visible_user_instructions_and_unique_artifacts(self):
        self.assertNotIn("/guidance", self.spec)
        # The only direct request verifies publication idempotency after the
        # visible Publish action; it cannot prepare or execute a hidden query.
        self.assertEqual(self.spec.count("page.request"), 1)
        self.assertIn(
            'const repeat = await page.request.post(`/v1/catalyst/dashboard-builder/dashboards/${revised.versionId}/publish`);',
            self.spec,
        )
        self.assertIn("expect(repeat.ok()).toBe(true)", self.spec)
        self.assertIn(
            "expect((await repeat.json() as DashboardPublication).pointer.bundle.sha256).toBe(bundle.pointer.bundle.sha256)",
            self.spec,
        )
        self.assertNotIn("Pin session guidance", self.phase1_journeys)
        self.assertNotIn("selected team", self.phase1_journeys)
        self.assertIn("excluding do_not_perform requests", self.phase1_journeys)
        self.assertIn("CATALYST_DEMO_RUN_ID", self.spec)
        self.assertIn("randomUUID()", self.spec)

    def test_versioned_laboratory_cohort_contract_is_preserved(self):
        self.assertEqual(self.cohort["expected"]["testTypes"], 9)
        self.assertEqual(self.cohort["expected"]["viralLoadResults"], 384)

    def test_both_sources_compare_superset_with_the_recorded_execution(self):
        self.assertIn('for (const source of ["openelis", "openmrs-hiv"])', self.spec)
        self.assertIn("for (const row of reusedExecution.result!.rows)", self.spec)
        self.assertIn(
            'const renderedRows = await table.getByRole("row").evaluateAll',
            self.spec,
        )
        self.assertIn(
            "rendered.length === cells.length",
            self.spec,
        )
        self.assertIn(
            "rendered.every((cell, index) => displayed(cell) === displayed(cells[index]!))",
            self.spec,
        )
        self.assertIn("execution: reusedExecution", self.spec)
        self.assertIn('dataSourceId: source, turnId: null', self.spec)

    def test_superset_operations_stay_inside_supported_wrappers(self):
        self.assertIn('"catalyst-mvp.sh"', self.import_helper)
        self.assertIn(
            'execFileSync(wrapper, ["superset-import"]', self.import_helper
        )
        self.assertNotIn('execFileSync("docker"', self.import_helper)
        self.assertIn('"already_imported"', self.import_helper)
        self.assertIn(
            "receipt.bundleDigest !== expectedBundleDigest", self.import_helper
        )
        self.assertIn("currentPointer.bundle?.sha256", self.import_helper)
        self.assertIn("./scripts/catalyst-mvp.sh up", self.runbook)
        self.assertNotIn("docker start", self.runbook)

    def test_sql_lab_fixture_does_not_delete_retained_user_tabs(self):
        self.assertNotIn("tabstateview", self.superset_fixture)
        self.assertNotIn('method: "DELETE"', self.superset_fixture)


if __name__ == "__main__":
    unittest.main()
