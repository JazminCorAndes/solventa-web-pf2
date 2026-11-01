"""Disposable real backend with a synthetic partner for the SOL-205 browser journey."""

import argparse
import json
import logging
import os
import signal
import socket
import sys
import threading
from pathlib import Path
from tempfile import TemporaryDirectory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--web-port", type=int, default=5000)
    parser.add_argument("--mobile-port", type=int, default=5001)
    args = parser.parse_args()
    if os.environ.get("CYPRESS_DISPOSABLE_BACKEND") != "1":
        raise SystemExit("Set CYPRESS_DISPOSABLE_BACKEND=1; never use production databases.")
    for port in (args.web_port, args.mobile_port):
        with socket.socket() as probe:
            probe.settimeout(1)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                raise SystemExit(f"Port {port} is already in use; do not share a test backend.")
    backend = args.backend.resolve(strict=True)
    sys.path.insert(0, str(backend))
    from tests.jmeter.local_stack import LocalStack

    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    stopped = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    with TemporaryDirectory(prefix="solventa-cypress-partner-") as directory:
        with LocalStack(
            Path(directory), args.web_port, args.mobile_port, encrypted_login_enabled=True
        ) as stack:
            created = stack.apps["identity"].test_cli_runner().invoke(
                args=[
                    "create-partner-user",
                    "--name",
                    "Socio Cypress",
                    "--email",
                    "socio-cypress@example.com",
                    "--partner-id",
                    "BANK-CYPRESS",
                    "--partner-name",
                    "Banco sintetico Cypress",
                ],
                input="Cypress-Socio-205!\nCypress-Socio-205!\n",
            )
            if created.exit_code != 0:
                raise RuntimeError("Could not create the disposable partner.")
            manifest = (
                Path(__file__).resolve().parents[2]
                / ".angular/cypress/partner-backend.json"
            )
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_text(
                json.dumps({
                    "identityUrl": stack.urls["identity"],
                    "webUrl": stack.urls["web"],
                }),
                encoding="utf-8",
            )
            try:
                print(f"Disposable partner backend ready: {stack.urls['web']}", flush=True)
                while manifest.exists() and not stopped.wait(0.5):
                    pass
            finally:
                manifest.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
