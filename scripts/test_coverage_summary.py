import tempfile
import unittest
from pathlib import Path

from coverage_summary import counters, summarize


class CoverageSummaryTest(unittest.TestCase):
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
            self.assertEqual(counters(report), ("75.00% (3/4)", "50.00% (1/2)"))
            summary, complete = summarize([f"Web={report}"], [str(junit), str(junit)], "V8")
            self.assertTrue(complete)
            self.assertIn("1 correctas, 1 fallidas, 1 omitidas (3 casos JUnit)", summary)

    def test_missing_and_malformed_reports_are_partial(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.xml"
            for text in (None, "<broken", '<coverage lines-covered="5" lines-valid="4"/>'):
                if text is not None:
                    path.write_text(text)
                summary, complete = summarize([f"Web={path}"], [str(path)], "V8")
                self.assertFalse(complete)
                self.assertIn("Reporte parcial", summary)


if __name__ == "__main__":
    unittest.main()
