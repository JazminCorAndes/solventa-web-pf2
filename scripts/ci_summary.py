"""Summarize web CI using actual step outcomes and the current Vitest report."""

import json
import os
import subprocess
from pathlib import Path

from coverage_summary import junit_counts


def summarize(steps: dict, root: Path, revision: str, run_url: str) -> str:
    lines = ["## Validación web", ""]
    reused = steps.get("policy", {}).get("outputs", {}).get("skip_tests") == "true"
    if reused:
        lines += ["♻️ **Evidencia de la release verificada.** No se repiten compilación ni pruebas.", ""]
    else:
        checks = [("automation", "Automatización"), ("dependencies", "Dependencias"), ("lint", "Lint"),
                  ("tests", "Pruebas Vitest"), ("pages", "Navegación de Pages"), ("build", "Compilación"),
                  ("reports", "Informes disponibles")]
        states = {"success": "✅ Correcto", "failure": "❌ Falló", "skipped": "⏭️ Omitido", "cancelled": "⏹️ Cancelado"}
        lines += ["| Comprobación | Resultado |", "| --- | --- |"]
        for step, label in checks:
            lines.append(f"| {label} | {states.get(steps.get(step, {}).get('outcome'), '⚪ Sin resultado')} |")
        passed, failed, skipped, problems = junit_counts([str(root / "reports/unit-tests.xml")])
        lines += ["", "### Pruebas ejecutadas", ""]
        if problems:
            lines.append("⚠️ Informe JUnit ausente o incompleto; no se presenta como una ejecución sin fallos.")
        else:
            lines += ["| ✅ Correctas | ❌ Fallidas | ⏭️ Omitidas | Total |", "| ---: | ---: | ---: | ---: |",
                      f"| {passed} | {failed} | {skipped} | {passed + failed + skipped} |"]
    revision_label = "Revisión de la política" if reused else "Revisión validada"
    lines += ["", f"[Ver ejecución e informes]({run_url})", "", f"**{revision_label}:** `{revision}`."]
    return "\n".join(lines) + "\n"


def main() -> None:
    steps = json.loads(os.environ["CI_STEPS"])
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    run_url = f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
        output.write(summarize(steps, Path("."), revision, run_url))


if __name__ == "__main__":
    main()
