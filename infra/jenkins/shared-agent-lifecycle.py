#!/usr/bin/env python3
"""Extend the verified lifecycle without modifying its Android implementation."""

import importlib.util
import os
import sys
from urllib.parse import quote, urlsplit


def belongs_to_project(task, project):
    name = task.get("fullName", "")
    if name == project or name.startswith(project + "/"):
        return True
    path = "/" + urlsplit(task.get("url", "")).path.strip("/") + "/"
    prefix = "/" + "/".join("job/" + quote(part, safe="") for part in project.split("/")) + "/"
    return path.startswith(prefix)


def read_shared_demand(queue, node, projects):
    items = queue.get("items")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ValueError("Incomplete queue")
    if not all(isinstance(item.get("task"), dict) for item in items):
        raise ValueError("Incomplete queue tasks")
    if not isinstance(node.get("offline"), bool) or not isinstance(node.get("idle"), bool):
        raise ValueError("Incomplete node state")
    queued = any(belongs_to_project(item["task"], project) for item in items for project in projects)
    # Busy protects all work on the shared node, including projects not enabled here.
    return queued, not node["offline"] and not node["idle"]


def main():
    projects = tuple(os.environ.get("JENKINS_SHARED_PROJECTS", "").split(","))
    if not projects or any(project not in ("solventa-android", "solventa-web/pr-checks") for project in projects):
        raise ValueError("Only explicitly approved projects may start the shared agent")
    spec = importlib.util.spec_from_file_location("original_lifecycle", "/opt/jenkins-pilot/agent-lifecycle.py")
    lifecycle = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lifecycle)
    lifecycle.read_demand = lambda queue, node, unused: read_shared_demand(queue, node, projects)
    return lifecycle.main()


if __name__ == "__main__":
    sys.exit(main())
