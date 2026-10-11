"""C15: isolated real backend and real report UI; no mocked analysis responses."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "audit" / "c15"
OUT.mkdir(parents=True, exist_ok=True)
rows = []
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
base = f"http://127.0.0.1:{port}"
with tempfile.TemporaryDirectory(prefix="c15-isolated-") as temp:
    env = {**os.environ, "NODE_ENV": "development", "HOST": "127.0.0.1",
           "PORT": str(port), "APP_URL": base, "DATABASE_URL": "",
           "APP_DB_PATH": str(Path(temp) / "app.json"),
           "SESSION_SECRET": "c15-local-acceptance-only-secret-32-characters"}
    server = subprocess.Popen(["node", "src/server.js"], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for attempt in range(100):
            if server.poll() is not None:
                raise RuntimeError("Isolated server exited before becoming healthy")
            try:
                with urllib.request.urlopen(base + "/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Isolated server health timeout")
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                for width, height in [(360, 640), (390, 844), (412, 915), (1280, 900)]:
                    for name, text, system in [
                        ("retinol", "Aqua, Retinol", "actives"),
                        ("lipids", "Aqua, Petrolatum, Dimethicone", "lipid_phase"),
                    ]:
                        context = browser.new_context(viewport={"width": width, "height": height})
                        try:
                            page = context.new_page()
                            errors = []
                            page.on("pageerror", lambda error: errors.append(str(error)))
                            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
                            page.goto(base, wait_until="networkidle")
                            page.locator(".manual-entry > summary").click()
                            page.locator("#composition").fill(text)
                            page.locator("#formulaLabelConfirmation").check()
                            started = time.monotonic()
                            with page.expect_response(lambda response: response.url.endswith("/api/analyze")) as pending:
                                button = "#mobileAnalyze" if width < 768 else '#analysisForm button[type="submit"]'
                                page.locator(button).click()
                            response = pending.value
                            payload = response.json()
                            page.locator(".report-overview").wait_for()
                            elapsed = time.monotonic() - started
                            page.locator('[data-report-view="details"]').click()
                            card = page.locator(f'[data-system-id="{system}"]')
                            card.scroll_into_view_if_needed()
                            displayed = card.inner_text()
                            observed = next(item for item in payload["formulaAssessment"]["systems"] if item["id"] == system)
                            page.screenshot(path=str(OUT / f"live-{name}-{width}.png"))
                            rows.append({"width": width, "height": height, "case": name,
                                         "input": text, "httpStatus": response.status,
                                         "formulaScope": payload["formulaAssessment"]["formulaRef"]["scope"],
                                         "confirmation": payload["formulaAssessment"]["formulaRef"]["confirmation"],
                                         "system": observed, "displayedText": displayed,
                                         "pageErrors": errors, "submitToOverviewSeconds": elapsed,
                                         "noFalseAbsence": observed["status"] != "not_identified"})
                        finally:
                            context.close()
            finally:
                browser.close()
    finally:
        server.terminate()
        server.wait(timeout=15)

report = {"method": "Chromium headless; real local API and temporary file DB; external browser requests blocked; manual synthetic INCI, not camera/OCR or physical phone.",
          "cases": rows, "transportAndRenderPassed": sum(row["httpStatus"] == 200 and not row["pageErrors"] for row in rows),
          "semanticPassed": sum(row["noFalseAbsence"] for row in rows), "total": len(rows)}
(OUT / "live-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "cases"}, ensure_ascii=False))
raise SystemExit(0 if report["transportAndRenderPassed"] == len(rows) and report["semanticPassed"] == len(rows) else 1)
