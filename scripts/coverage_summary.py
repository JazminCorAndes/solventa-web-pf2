"""Summarize JaCoCo/Cobertura and current JUnit reports without external packages."""

import argparse
import glob
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit


RUN_ID_PATTERN = r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"
CYPRESS_PHASES = {
    "configuration": "Configuración",
    "backend-preflight": "Comprobación del backend desechable",
    "port-check": "Comprobación del puerto",
    "workspace-preparation": "Preparación de informes y proxy",
    "angular-start": "Arranque de Angular",
    "angular-readiness": "Espera de Angular",
    "cypress-run": "Ejecución de Cypress",
    "cypress-results": "Resultado de Cypress",
    "complete": "Finalizada",
}
CYPRESS_CAUSES = {
    "none": "Sin fallo registrado",
    "invalid-configuration": "Configuración rechazada",
    "backend-preflight-failed": "Falló la comprobación previa del backend desechable",
    "port-in-use": "Puerto ocupado",
    "port-check-failed": "No se pudo comprobar el puerto",
    "workspace-error": "Fallo al preparar informes o proxy",
    "angular-module-missing": "Módulo de Angular no disponible",
    "angular-start-failed": "Fallo al iniciar Angular",
    "angular-readiness-timeout": "Angular no respondió dentro del límite existente",
    "angular-exited": "Angular terminó antes de responder",
    "angular-readiness-failed": "Fallo al comprobar la disponibilidad de Angular",
    "xvfb-missing": "El lanzador informó ausencia de Xvfb",
    "xvfb-start-failed": "El lanzador informó un fallo al iniciar Xvfb",
    "cypress-binary-missing": "El lanzador informó ausencia del binario Cypress",
    "cypress-binary-permissions": "El lanzador informó permisos de ejecución insuficientes",
    "shared-library-missing": "El lanzador informó una biblioteca compartida no disponible",
    "cypress-verification-timeout": "La verificación de Cypress agotó su límite",
    "cypress-verification-failed": "Falló la verificación de Cypress",
    "cypress-results-missing": "Cypress no produjo un resultado de ejecución",
    "cypress-module-missing": "Módulo de Cypress no disponible",
    "cypress-run-error": "Fallo de Cypress no clasificado",
    "invalid-cypress-result": "Contadores de Cypress inválidos",
    "tests-failed": "Cypress informó pruebas fallidas",
    "no-tests": "Cypress no ejecutó pruebas",
    "unclassified-error": "Fallo no clasificado",
}
CYPRESS_CAPTURE_FAILURES = {
    "invalid-run-id", "report-write-failed", "report-log-failed", "stderr-write-failed",
}


def cypress_diagnostics(path: Path, expected_run_id: str | None) -> tuple[str, bool]:
    heading = "\n### Diagnóstico Cypress de esta ejecución\n\n"

    def unavailable(reason: str) -> tuple[str, bool]:
        return heading + f"⚠️ {reason} No acredita una ejecución correcta.\n", False

    if not expected_run_id or not re.fullmatch(RUN_ID_PATTERN, expected_run_id):
        return unavailable("No hay identificador de ejecución válido; no se reutilizan informes.")
    try:
        with path.open("rb") as source:
            data = source.read(4097)
        if len(data) > 4096:
            raise ValueError("Oversized diagnostic")
        record = json.loads(data)
        fields = {"kind", "schemaVersion", "runId", "suite", "fullSuite", "phase", "outcome",
                  "cause", "reportsCleared", "tests", "captureFailures"}
        if not isinstance(record, dict) or set(record) != fields:
            raise ValueError("Unknown schema")
        if (
            record["kind"] != "cypress-run-diagnostics"
            or type(record["schemaVersion"]) is not int or record["schemaVersion"] != 1
            or not isinstance(record["runId"], str)
            or not re.fullmatch(RUN_ID_PATTERN, record["runId"])
            or record["suite"] != "ui"
            or type(record["fullSuite"]) is not bool
            or record["phase"] not in CYPRESS_PHASES
            or record["cause"] not in CYPRESS_CAUSES
            or record["outcome"] not in {"running", "passed", "failed"}
            or type(record["reportsCleared"]) is not bool
        ):
            raise ValueError("Invalid diagnostic")
        failures = record["captureFailures"]
        if (not isinstance(failures, list) or len(failures) > 4
                or any(not isinstance(item, str) or item not in CYPRESS_CAPTURE_FAILURES
                       for item in failures) or len(failures) != len(set(failures))):
            raise ValueError("Invalid capture failures")
        tests = record["tests"]
        if tests is not None:
            if (not isinstance(tests, dict) or set(tests) != {"total", "passed", "failed"}
                    or any(type(value) is not int or not 0 <= value <= 1000000
                           for value in tests.values())
                    or tests["passed"] + tests["failed"] > tests["total"]
                    or not record["reportsCleared"]):
                raise ValueError("Invalid counters")
        if record["outcome"] == "passed":
            if (record["phase"] != "complete" or record["cause"] != "none"
                    or tests is None or tests["total"] == 0 or tests["failed"] != 0):
                raise ValueError("Invalid success")
        elif record["outcome"] == "running":
            if record["cause"] != "none" or tests is not None:
                raise ValueError("Invalid unfinished diagnostic")
        elif record["cause"] == "none":
            raise ValueError("Missing failure classification")
        if record["cause"] == "tests-failed" and (tests is None or tests["failed"] == 0):
            raise ValueError("Missing failed tests")
        if record["cause"] == "no-tests" and (tests is None or tests["total"] != 0):
            raise ValueError("Invalid empty result")
    except (OSError, UnicodeError, ValueError, TypeError, RecursionError):
        return unavailable("Diagnóstico ausente, ilegible o inválido.")
    if record["runId"] != expected_run_id:
        return unavailable("Se rechazó un diagnóstico de otra ejecución.")
    if not record["fullSuite"]:
        return unavailable("Un selector parcial no acredita la suite UI completa de Jenkins.")
    outcomes = {"running": "Sin resultado final", "failed": "Falló", "passed": "Finalizó sin pruebas fallidas"}
    lines = [
        heading,
        f"**Estado:** {outcomes[record['outcome']]}.",
        f"**Última fase registrada:** {CYPRESS_PHASES[record['phase']]}.",
        f"**Categoría observada:** {CYPRESS_CAUSES[record['cause']]}.",
    ]
    complete = record["outcome"] == "passed" and not failures
    if failures:
        lines.append("⚠️ Captura incompleta: " + ", ".join(sorted(failures)) + ".")
    if not record["reportsCleared"]:
        lines.append("XML no acreditados: no se confirmó la retirada de informes anteriores.")
        complete = False
    else:
        passed, failed, skipped, problems = junit_counts([str(path.parent / "ui" / "*.xml")])
        if problems:
            lines.append("⚠️ XML Cypress ausentes o inválidos; no se presentan cero fallos.")
            complete = False
        elif tests is None:
            lines.append("⚠️ XML parciales sin resultado final de Cypress; no acreditan el recorrido completo.")
            complete = False
        elif (passed, failed, skipped) != (tests["passed"], tests["failed"],
                                          tests["total"] - tests["passed"] - tests["failed"]):
            lines.append("⚠️ Los conteos XML no coinciden con el resultado de Cypress.")
            complete = False
        else:
            lines.append(f"**JUnit cotejado:** {passed} correctas, {failed} fallidas, {skipped} omitidas.")
    lines.append("Clasificación acotada del runner; no publica mensajes, rutas, cuerpos ni credenciales. "
                 "No sustituye el resultado global ni permite atribuir fallos de ejecuciones anteriores.")
    return "\n".join(lines) + "\n", complete


def jenkins_evidence(revision: str, number: str, result: str, url: str) -> str:
    parsed = urlsplit(url)
    if (
        not re.fullmatch(r"[0-9a-f]{40}", revision)
        or not re.fullmatch(r"[1-9][0-9]*", number)
        or result not in {"SUCCESS", "FAILURE", "UNSTABLE", "ABORTED", "NOT_BUILT"}
        or parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or any(character in url for character in "\r\n ()<>")
    ):
        raise ValueError("Invalid Jenkins build metadata")
    base = url.rstrip("/") + "/"
    return (
        f"\n**Origen:** Jenkins · ejecución **#{number}** · resultado observado **{result}**.\n"
        f"\n**Revisión compilada:** [`{revision}`]"
        f"(https://github.com/JazminCorAndes/solventa-web-pf2/commit/{revision}).\n"
        "\nLos conteos anteriores pertenecen a esta ejecución de Jenkins. "
        "Un informe parcial no demuestra que toda la validación haya terminado.\n"
        "\n**Informes detallados — acceso privado mediante túnel autorizado:** "
        f"[Cobertura HTML]({base}artifact/coverage/solventa-web-pf2/index.html) · "
        f"[Pruebas JUnit]({base}testReport/).\n"
        "El enlace de Jenkins no es una URL pública; `localhost` apunta al equipo de quien "
        "lo abre. Los resultados resumidos y el SHA se pueden consultar aquí en GitHub "
        "sin abrir ese enlace.\n"
    )


def ratio(covered: int, total: int) -> str:
    if not 0 <= covered <= total:
        raise ValueError("Invalid coverage counters")
    return f"{100 * covered / total:.2f}%" if total else "—"


def counters(path: Path) -> tuple[tuple[int, int], tuple[int, int]]:
    root = ET.parse(path).getroot()
    values = []
    for kind, metric in (("LINE", "lines"), ("BRANCH", "branches")):
        if root.tag == "report":
            counter = root.find(f"counter[@type='{kind}']")
            if counter is None:
                raise ValueError("Missing JaCoCo counter")
            covered = int(counter.attrib["covered"])
            total = covered + int(counter.attrib["missed"])
        elif root.tag == "coverage":
            covered = int(root.attrib[f"{metric}-covered"])
            total = int(root.attrib[f"{metric}-valid"])
        else:
            raise ValueError("Unknown coverage format")
        if kind == "LINE" and total == 0:
            raise ValueError("No application lines measured")
        ratio(covered, total)
        values.append((covered, total))
    return values[0], values[1]


def junit_counts(patterns: list[str]) -> tuple[int, int, int, list[str]]:
    cases: list[ET.Element] = []
    seen: set[str] = set()
    problems = []
    for pattern in patterns:
        paths = glob.glob(pattern, recursive=True)
        if not paths:
            problems.append(f"JUnit ausente: `{pattern}`.")
        for filename in paths:
            if filename in seen:
                continue
            seen.add(filename)
            try:
                current = list(ET.parse(filename).getroot().iter("testcase"))
                if not current:
                    raise ValueError("Empty JUnit")
                cases.extend(current)
            except (OSError, ET.ParseError, ValueError):
                problems.append(f"JUnit inválido: `{filename}`.")
    failed = sum(c.find("failure") is not None or c.find("error") is not None for c in cases)
    skipped = sum(c.find("skipped") is not None and c.find("failure") is None and c.find("error") is None for c in cases)
    return len(cases) - failed - skipped, failed, skipped, problems


def summarize(sources: list[str], tests: list[str], scope: str) -> tuple[str, bool]:
    rows = []
    problems = []
    line_results = []
    for source in sources:
        label, filename = source.split("=", 1)
        try:
            lines, branches = counters(Path(filename))
            line_results.append(ratio(*lines))
            for metric, (covered, total) in (("Líneas", lines), ("Ramas", branches)):
                if not total:
                    progress = "⚪ No aplica"
                elif covered * 100 >= total * 80:
                    progress = "🟢 Objetivo alcanzado"
                else:
                    difference = 80 - 100 * covered / total
                    distance = "< 0.01" if difference < 0.01 else f"{difference:.2f}"
                    progress = f"🟠 A {distance} pp del objetivo"
                rows.append(f"| {label} | {metric} | **{ratio(covered, total)}** | {covered} / {total} | {total - covered} | {progress} |")
        except (OSError, ET.ParseError, KeyError, ValueError):
            rows.append(f"| {label} | — | No disponible | — | — | 🔴 Revisar informe |")
            problems.append(f"Reporte ausente o inválido: {label}.")

    passed, failed, skipped, junit_problems = junit_counts(tests)
    problems.extend(junit_problems)
    title = "Cobertura incompleta" if problems else "Cobertura web"
    if len(line_results) == 1 and not problems:
        title += f": {line_results[0]} en líneas"
    summary = [
        title,
        "",
        "> 🎯 **Objetivo recomendado: 80 % en líneas y ramas.** Referencia de mejora; no bloquea la integración.",
        "",
        "| Módulo | Métrica | Cobertura | Cubiertas / total | Pendientes | Frente al objetivo |",
        "| --- | --- | ---: | ---: | ---: | --- |",
        *rows,
        "",
        "### Pruebas",
        "",
        "| ✅ Correctas | ❌ Fallidas | ⏭️ Omitidas | Total |",
        "| ---: | ---: | ---: | ---: |",
        f"| {passed} | {failed} | {skipped} | {passed + failed + skipped} |",
        "",
        f"**Alcance:** {scope}",
        "",
        "Los indicadores comparan cada métrica con el objetivo. **pp** = puntos porcentuales.",
    ]
    if problems:
        summary.extend(["", "**Reporte parcial; no usar como cobertura completa.**", *problems])
    return "\n".join(summary) + "\n", not problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coverage", action="append", required=True)
    parser.add_argument("--tests", action="append", required=True)
    parser.add_argument("--scope", required=True)
    parser.add_argument("--revision")
    parser.add_argument("--build-number")
    parser.add_argument("--build-result")
    parser.add_argument("--build-url")
    parser.add_argument("--cypress-diagnostics")
    parser.add_argument("--cypress-run-id")
    args = parser.parse_args()
    summary, complete = summarize(args.coverage, args.tests, args.scope)
    metadata = [args.revision, args.build_number, args.build_result, args.build_url]
    if any(value is not None for value in metadata):
        if not all(value is not None for value in metadata):
            parser.error("Jenkins evidence requires revision, build number, result and URL")
        summary += jenkins_evidence(*metadata)
    if args.cypress_diagnostics is not None:
        diagnostic, diagnostic_complete = cypress_diagnostics(
            Path(args.cypress_diagnostics), args.cypress_run_id
        )
        summary += diagnostic
        complete = complete and diagnostic_complete
    elif args.cypress_run_id is not None:
        parser.error("Cypress run ID requires a diagnostic path")
    Path("reports").mkdir(exist_ok=True)
    Path("reports/coverage-summary.md").write_text(summary, encoding="utf-8")
    print(summary)
    return 0 if complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
