import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("shared", Path(__file__).with_name("shared-agent-lifecycle.py"))
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


class SharedDemandTests(unittest.TestCase):
    projects = ("solventa-android", "solventa-web/pr-checks")

    def demand(self, task, offline=True, idle=True):
        return shared.read_shared_demand({"items": [{"task": task}]}, {"offline": offline, "idle": idle}, self.projects)

    def test_android_full_name(self):
        self.assertEqual(self.demand({"fullName": "solventa-android/PR-9"}), (True, False))

    def test_web_nested_url(self):
        self.assertEqual(self.demand({"url": "http://localhost:8080/job/solventa-web/job/pr-checks/job/PR-9/"}), (True, False))

    def test_web_full_name(self):
        self.assertEqual(self.demand({"fullName": "solventa-web/pr-checks/PR-9"}), (True, False))

    def test_lookalike_not_accepted(self):
        self.assertEqual(self.demand({"fullName": "solventa-web/pr-checks-fake/PR-9"}), (False, False))

    def test_backend_not_enabled(self):
        self.assertEqual(self.demand({"fullName": "solventa-backend/PR-1"}), (False, False))

    def test_any_busy_work_protected(self):
        self.assertEqual(self.demand({"fullName": "other/job"}, offline=False, idle=False), (False, True))

    def test_incomplete_responses_fail_closed(self):
        for queue, node in [({}, {}), ({"items": [{}]}, {"offline": True, "idle": True}), ({"items": []}, {})]:
            with self.assertRaises(ValueError):
                shared.read_shared_demand(queue, node, self.projects)


if __name__ == "__main__":
    unittest.main()
