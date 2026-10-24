import tempfile
import unittest
from pathlib import Path

from coverage_summary import counters, summarize, junit_counts, jenkins_evidence


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
