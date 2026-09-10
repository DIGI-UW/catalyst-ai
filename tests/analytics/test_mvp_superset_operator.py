import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class SupersetOperatorTests(unittest.TestCase):
    def run_operator(self, command="import", **overrides):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            calls_file = directory / "calls.jsonl"
            docker = directory / "docker"
            docker.write_text(
                f"#!{sys.executable}\n"
                + textwrap.dedent("""\
                    import json, os, sys
                    args = sys.argv[1:]
                    with open(os.environ["OPERATOR_CALLS"], "a") as output:
                        output.write(json.dumps(args) + "\\n")
                    service = args[-1]
                    if args[0] == "inspect":
                        template = args[2]
                        if ".State.Status" in template:
                            print(os.environ.get("OPERATOR_STATE", "running healthy"))
                        elif "working_dir" in template:
                            print(os.environ["OPERATOR_OWNER"])
                        elif "config-hash" in template:
                            print("running-hash")
                        else:
                            sys.exit(2)
                    elif "ps" in args:
                        if os.environ.get("OPERATOR_MISSING") != "true":
                            print(service)
                    elif "--hash" in args:
                        changed = service == "superset" and os.environ["SUPERSET_PORT"] != "18088"
                        print(service, "changed-hash" if changed else "running-hash")
                    elif args[-5:] in (
                        ["run", "--rm", "--no-deps", "superset-importer", "import"],
                        ["run", "--rm", "--no-deps", "superset-importer", "status"],
                    ):
                        print('{"status":"imported"}')
                    else:
                        sys.exit(2)
                """)
            )
            docker.chmod(0o755)
            environment = {
                **os.environ,
                "PATH": f"{directory}{os.pathsep}{os.environ['PATH']}",
                "OPERATOR_CALLS": str(calls_file),
                "OPERATOR_OWNER": str(ROOT.resolve()),
                "SUPERSET_PORT": "18088",
                **overrides,
            }
            environment.pop("MVP_COMPOSE_OVERRIDE_FILE", None)
            completed = subprocess.run(
                ["bash", ROOT / "scripts/mvp-superset.sh", command],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
            )
            calls = [json.loads(line) for line in calls_file.read_text().splitlines()]
            # No operator action is allowed to start/recreate dependency services.
            for call in calls:
                self.assertTrue({"up", "start", "restart", "down"}.isdisjoint(call))
            return completed, calls

    def test_import_uses_ready_services_without_reconfiguring_them(self):
        completed, calls = self.run_operator()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["status"], "imported")
        self.assertEqual(
            calls[-1][-5:],
            ["run", "--rm", "--no-deps", "superset-importer", "import"],
        )
        inspected = {call[-1] for call in calls if call[0] == "inspect"}
        self.assertEqual(inspected, {"spark-thriftserver", "superset"})

    def test_inherited_standalone_port_fails_before_import_or_service_changes(self):
        completed, calls = self.run_operator(SUPERSET_PORT="8088")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("superset configuration differs", completed.stderr)
        self.assertFalse(any("run" in call for call in calls))

    def test_import_requires_the_owning_checkout(self):
        completed, calls = self.run_operator(OPERATOR_OWNER="/another/checkout")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("belongs to another checkout", completed.stderr)
        self.assertFalse(any("run" in call for call in calls))

    def test_missing_or_unready_services_fail_before_import(self):
        for settings in (
            {"OPERATOR_MISSING": "true"},
            {"OPERATOR_STATE": "exited healthy"},
            {"OPERATOR_STATE": "running unhealthy"},
            {"OPERATOR_STATE": "running starting"},
        ):
            with self.subTest(settings=settings):
                completed, calls = self.run_operator(**settings)
                self.assertNotEqual(completed.returncode, 0)
                self.assertIn("before importing", completed.stderr)
                self.assertFalse(any("run" in call for call in calls))

    def test_status_does_not_require_or_start_dependency_services(self):
        completed, calls = self.run_operator("status", OPERATOR_MISSING="true")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertFalse(any(call[0] == "inspect" for call in calls))
        self.assertEqual(calls[-1][-1], "status")
