import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from coverage_summary import counters, summarize, junit_counts, jenkins_evidence, cypress_diagnostics


class CypressDiagnosticsSummaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "ui-run-diagnostics.json"
        self.run_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        self.record = {
            "kind": "cypress-run-diagnostics", "schemaVersion": 1, "runId": self.run_id,
            "suite": "ui", "fullSuite": True, "phase": "complete", "outcome": "passed", "cause": "none",
            "reportsCleared": True, "tests": {"total": 1, "passed": 1, "failed": 0},
            "captureFailures": [],
        }
        self.xml = self.root / "ui" / "results-current.xml"
        self.xml.parent.mkdir()
        self.xml.write_text("<testsuite><testcase/></testsuite>", encoding="utf-8")

    def render(self) -> tuple[str, bool]:
        self.path.write_text(json.dumps(self.record), encoding="utf-8")
        return cypress_diagnostics(self.path, self.run_id)

    def test_current_success_requires_matching_junit(self) -> None:
        summary, complete = self.render()
        self.assertTrue(complete)
        self.assertIn("1 correctas, 0 fallidas, 0 omitidas", summary)
        self.xml.unlink()
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("XML Cypress ausentes o inválidos", summary)
        self.assertNotIn("0 correctas", summary)

    def test_launch_failure_remains_visible_without_xml(self) -> None:
        self.xml.unlink()
        self.record.update(phase="cypress-run", outcome="failed", cause="xvfb-missing", tests=None)
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("Estado:** Falló", summary)
        self.assertIn("ausencia de Xvfb", summary)
        self.assertIn("XML Cypress ausentes", summary)
        self.assertNotIn("0 fallidas", summary)

    def test_does_not_read_old_xml_before_cleanup_or_another_run(self) -> None:
        self.record.update(phase="port-check", outcome="failed", cause="port-in-use",
                           reportsCleared=False, tests=None)
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("Puerto ocupado", summary)
        self.assertIn("retirada de informes anteriores", summary)
        self.assertNotIn("JUnit cotejado", summary)
        self.record["runId"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("otra ejecución", summary)
        self.assertNotIn("Puerto ocupado", summary)

    def test_incomplete_capture_and_interrupted_run_are_not_success(self) -> None:
        self.record["captureFailures"] = ["report-write-failed", "report-log-failed"]
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("Captura incompleta", summary)
        self.record.update(phase="angular-readiness", outcome="running", tests=None)
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("Sin resultado final", summary)
        self.assertIn("XML parciales", summary)

    def test_partial_selector_cannot_reuse_full_suite_xml(self) -> None:
        self.record["fullSuite"] = False
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("selector parcial", summary)
        self.assertNotIn("JUnit cotejado", summary)

    def test_failed_or_mismatched_results_never_become_success(self) -> None:
        self.record.update(phase="cypress-results", outcome="failed", cause="tests-failed",
                           tests={"total": 1, "passed": 0, "failed": 1})
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("no coinciden", summary)
        self.xml.write_text("<testsuite><testcase><failure/></testcase></testsuite>")
        summary, complete = self.render()
        self.assertFalse(complete)
        self.assertIn("0 correctas, 1 fallidas, 0 omitidas", summary)

    def test_missing_corrupt_oversized_and_untrusted_fields_are_not_echoed(self) -> None:
        secret = "PRIVATE-CREDENTIAL-DO-NOT-EXPORT"
        records = [
            {"message": secret, **self.record},
            {**self.record, "cause": secret},
            {**self.record, "phase": [secret]},
            {**self.record, "captureFailures": [secret]},
            {**self.record, "tests": {"total": True, "passed": 1, "failed": 0}},
            {**self.record, "outcome": "passed", "cause": "no-tests"},
        ]
        payloads = [None, "{broken", secret * 200, "[" * 1100 + "]" * 1100]
        payloads.extend(json.dumps(record) for record in records)
        for payload in payloads:
            with self.subTest(payload=str(payload)[:35]):
                if payload is None:
                    self.path.unlink(missing_ok=True)
                else:
                    self.path.write_text(payload, encoding="utf-8")
                summary, complete = cypress_diagnostics(self.path, self.run_id)
                self.assertFalse(complete)
                self.assertNotIn(secret, summary)
                self.assertIn("No acredita una ejecución correcta", summary)
        for run_id in (None, "", secret):
            summary, complete = cypress_diagnostics(self.path, run_id)
            self.assertFalse(complete)
            self.assertNotIn(secret, summary)

    def test_existing_cli_publishes_safe_failure_summary_without_cypress_xml(self) -> None:
        self.xml.unlink()
        self.record.update(phase="cypress-run", outcome="failed",
                           cause="cypress-binary-missing", tests=None)
        self.render()
        coverage = self.root / "coverage.xml"
        coverage.write_text('<coverage lines-covered="1" lines-valid="1" '
                            'branches-covered="1" branches-valid="1"/>')
        unit = self.root / "unit.xml"
        unit.write_text("<testsuite><testcase/></testsuite>")
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve().with_name("coverage_summary.py")),
             "--coverage", f"Web={coverage}", "--tests", str(unit), "--scope", "V8",
             "--revision", "a" * 40, "--build-number", "2", "--build-result", "FAILURE",
             "--build-url", "http://localhost:8080/job/web/2/",
             "--cypress-diagnostics", str(self.path), "--cypress-run-id", self.run_id],
            cwd=self.root, capture_output=True, encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        summary = (self.root / "reports" / "coverage-summary.md").read_text(encoding="utf-8")
        self.assertIn("resultado observado **FAILURE**", summary)
        self.assertIn("ausencia del binario Cypress", summary)
        self.assertIn("XML Cypress ausentes", summary)
        self.assertEqual(result.stdout.strip(), summary.strip())


class CoverageSummaryTest(unittest.TestCase):
    def test_jenkins_evidence_identifies_its_revision_result_and_private_links(self) -> None:
        summary = jenkins_evidence("a" * 40, "48", "FAILURE", "http://localhost:8080/job/web/48/")
        self.assertIn("Jenkins", summary)
        self.assertIn("FAILURE", summary)
        self.assertIn("#48", summary)
        self.assertIn(f"/commit/{'a' * 40}", summary)
        self.assertIn("acceso privado", summary)
        self.assertIn("no es una URL pública", summary)
        self.assertIn("testReport/", summary)
        self.assertNotIn("Actions", summary)

    def test_jenkins_evidence_does_not_accept_untraceable_metadata(self) -> None:
        for revision, number, result, url in (
            ("missing", "48", "SUCCESS", "http://localhost:8080/"),
            ("a" * 40, "", "SUCCESS", "http://localhost:8080/"),
            ("a" * 40, "48", "UNKNOWN", "http://localhost:8080/"),
            ("a" * 40, "48", "SUCCESS", "javascript:alert(1)"),
        ):
            with self.subTest(revision=revision, number=number, result=result, url=url):
                with self.assertRaises(ValueError):
                    jenkins_evidence(revision, number, result, url)

    def test_reports_and_current_junit_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = root / "coverage.xml"
            report.write_text('<coverage lines-covered="3" lines-valid="4" '
                              'branches-covered="1" branches-valid="2"/>')
            junit = root / "current.xml"
            junit.write_text('<testsuite><testcase/><testcase><failure/></testcase>'
                             '<testcase><skipped/></testcase></testsuite>')
            (root / "old.xml").write_text('<testsuite><testcase/></testsuite>')
            self.assertEqual(counters(report), ((3, 4), (1, 2)))
            summary, complete = summarize([f"Web={report}"], [str(junit), str(junit)], "V8")
            self.assertTrue(complete)
            self.assertIn("| 1 | 1 | 1 | 3 |", summary)

    def test_missing_and_malformed_reports_are_partial(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.xml"
            for text in (None, "<broken", '<coverage lines-covered="5" lines-valid="4"/>'):
                if text is not None:
                    path.write_text(text)
                summary, complete = summarize([f"Web={path}"], [str(path)], "V8")
                self.assertFalse(complete)
                self.assertIn("Reporte parcial", summary)

    def test_recommendation_is_informative_and_uses_exact_counters(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            junit = root / "tests.xml"
            junit.write_text('<testsuite><testcase/></testsuite>')
            report = root / "coverage.xml"
            for covered, total, expected in ((3, 4, "🟠 A 5.00 pp"), (4, 5, "🟢 Objetivo alcanzado"),
                                             (79999, 100000, "🟠 A < 0.01 pp")):
                report.write_text(f'<coverage lines-covered="{covered}" lines-valid="{total}" '
                                  'branches-covered="0" branches-valid="0"/>')
                summary, complete = summarize([f"Web={report}"], [str(junit)], "V8")
                self.assertTrue(complete)
                self.assertIn("Objetivo recomendado: 80 %", summary)
                self.assertIn(expected, summary)
                self.assertIn("⚪ No aplica", summary)
                self.assertNotIn("Sin umbral", summary)

    def test_error_has_priority_over_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            junit = Path(directory) / "tests.xml"
            junit.write_text('<testsuite><testcase><error/><skipped/></testcase></testsuite>')
            self.assertEqual(junit_counts([str(junit)]), (0, 1, 0, []))


if __name__ == "__main__":
    unittest.main()
