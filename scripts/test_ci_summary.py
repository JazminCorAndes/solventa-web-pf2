import tempfile
import unittest
from pathlib import Path

from ci_summary import summarize


class CiSummaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_actual_steps_and_current_junit(self) -> None:
        reports = self.root / "reports"
        reports.mkdir()
        (reports / "unit-tests.xml").write_text('<testsuite tests="999"><testcase/>'
                                               '<testcase><failure/></testcase></testsuite>')
        (reports / "old.xml").write_text('<testsuite><testcase/></testsuite>')
        result = summarize({"tests": {"outcome": "failure"}, "build": {"outcome": "skipped"}},
                           self.root, "a" * 40, "https://github.com/owner/repo/actions/runs/1")
        self.assertIn("| Pruebas Vitest | ❌ Falló |", result)
        self.assertIn("| Compilación | ⏭️ Omitido |", result)
        self.assertIn("| 1 | 1 | 0 | 2 |", result)
        self.assertIn("a" * 40, result)

    def test_missing_or_malformed_junit_is_not_success(self) -> None:
        report = self.root / "reports/unit-tests.xml"
        report.parent.mkdir()
        for contents in (None, "<broken"):
            if contents is not None:
                report.write_text(contents)
            result = summarize({}, self.root, "a" * 40, "https://github.com/owner/repo/actions/runs/1")
            self.assertIn("Informe JUnit ausente o incompleto", result)
            self.assertNotIn("| 0 | 0 | 0 | 0 |", result)

    def test_backport_reuses_evidence_without_fake_test_counts(self) -> None:
        result = summarize({"policy": {"outputs": {"skip_tests": "true"}}}, self.root,
                           "a" * 40, "https://github.com/owner/repo/actions/runs/1")
        self.assertIn("Evidencia de la release verificada", result)
        self.assertIn("Revisión de la política", result)
        self.assertNotIn("Pruebas ejecutadas", result)
        self.assertNotIn("✅ Correcto", result)


if __name__ == "__main__":
    unittest.main()
