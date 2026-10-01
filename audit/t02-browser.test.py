"""Browser acceptance tests for T02.

The test uses local API fixtures and a mocked OCR boundary. It verifies browser
failure handling only; it is not a real camera, OCR, or external-source test.
"""

import base64
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PHOTO_FIXTURE = {
    "name": "inci-label.png",
    "mimeType": "image/png",
    "buffer": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII="
    ),
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def analysis_fixture(summary, score):
    return {
        "summary": summary,
        "formulaType": "Server verified fixture",
        "score": {"score": score, "label": "server result"},
        "qualitySummary": {
            "score": 7.5,
            "label": "server fixture",
            "confidence": "test fixture",
            "knownCount": 1,
            "unknownCount": 0,
            "totalIngredients": 1,
            "methodology": "Local deterministic test fixture.",
        },
        "productClassification": {
            "label": "Server classification",
            "intendedUse": "Deterministic browser test.",
            "confidence": 1,
        },
        "totalIngredients": 1,
        "found": [],
        "unknown": [],
        "groups": [],
        "positives": [],
        "warnings": [],
        "architecture": [],
        "expertSummary": [summary],
        "routineAdvice": [],
        "questions": [],
        "confidence": {"label": "server", "text": "Fixture returned by mocked API."},
        "disclaimer": "Browser contract fixture.",
    }


class T02BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            partial(QuietHandler, directory=str(ROOT / "public")),
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.mode = "success-new"
        self.context = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.page = self.context.new_page()
        self.page.add_init_script("""(() => {
            window.__ANALYZE_TIMEOUT_MS__ = 500;
            const nativeFetch = window.fetch.bind(window);
            window.fetch = (input, options = {}) => {
                const url = typeof input === 'string' ? input : input.url;
                if (url.includes('/api/analyze') && window.__t02HangAnalyze) {
                    return new Promise((resolve, reject) => {
                        options.signal?.addEventListener('abort', () => {
                            reject(new DOMException('Timed out', 'AbortError'));
                        }, { once: true });
                    });
                }
                return nativeFetch(input, options);
            };
        })()""")

        def route_request(route):
            request = route.request
            if "/api/" not in request.url:
                if request.url.startswith(self.url):
                    route.continue_()
                else:
                    route.abort()
                return

            if "/api/analyze" in request.url:
                if self.mode == "503":
                    route.fulfill(status=503, json={"error": "Analyzer unavailable"})
                elif self.mode == "offline":
                    route.abort("internetdisconnected")
                elif self.mode == "success-old":
                    route.fulfill(json=analysis_fixture("OLD SERVER RESULT", 91))
                else:
                    route.fulfill(json=analysis_fixture("NEW SERVER RESULT", 42))
            elif "/api/photo/resolve" in request.url:
                route.fulfill(json={
                    "mode": "composition",
                    "entries": [{"ingredient": name, "status": "confirmed"} for name in ["Aqua", "Prilocaine Hydrochloride", "Phenoxyethanol"]],
                    "confidence": 0.93,
                    "ingredients": ["Aqua", "Prilocaine Hydrochloride", "Phenoxyethanol"],
                    "cleanedText": "Aqua, Prilocaine Hydrochloride, Phenoxyethanol",
                    "composition": "Aqua, Prilocaine Hydrochloride, Phenoxyethanol",
                    "message": "Test OCR boundary resolved an INCI block.",
                })
            elif "/api/auth/me" in request.url:
                route.fulfill(json={"user": None})
            else:
                route.fulfill(json={"products": []})

        self.page.route("**/*", route_request)
        self.page.goto(self.url, wait_until="domcontentloaded", timeout=10000)
        self.page.locator("#analysisForm").wait_for()

    def tearDown(self):
        self.context.close()

    def submit_manual(self, text, name="Fixture product"):
        self.page.evaluate(
            """({ text, name }) => {
                document.querySelector('#productName').value = name;
                document.querySelector('#composition').value = text;
                document.querySelector('#analysisForm').requestSubmit();
            }""",
            {"text": text, "name": name},
        )

    def test_503_clears_stale_report_preserves_input_and_retry_uses_server(self):
        self.mode = "success-old"
        self.submit_manual("Aqua, Glycerin", "Old product")
        expect(self.page.locator("#result")).to_contain_text("OLD SERVER RESULT")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.analysisHistory).length"), 1)

        failed_text = "Aqua, Prilocaine Hydrochloride, Phenoxyethanol"
        self.mode = "503"
        self.submit_manual(failed_text, "Topical anesthetic")
        expect(self.page.locator("#analysisRetry")).to_be_visible()

        failed_result = self.page.locator("#result").inner_text()
        self.assertNotIn("OLD SERVER RESULT", failed_result)
        self.assertNotIn("86/100", failed_result)
        self.assertEqual(self.page.locator("#composition").input_value(), failed_text)
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.analysisHistory).length"), 1)

        self.mode = "success-new"
        self.page.locator("#analysisRetry").click()
        expect(self.page.locator("#result")).to_contain_text("NEW SERVER RESULT")
        self.assertEqual(self.page.locator("#composition").input_value(), failed_text)
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.analysisHistory).length"), 2)

    def test_offline_failure_does_not_create_cosmetic_report(self):
        self.mode = "offline"
        failed_text = "Aqua, Prilocaine Hydrochloride, Phenoxyethanol"
        self.submit_manual(failed_text, "Topical anesthetic")

        expect(self.page.locator("#analysisRetry")).to_be_visible()
        self.assertNotIn("86/100", self.page.locator("#result").inner_text())
        self.assertEqual(self.page.locator("#composition").input_value(), failed_text)
        self.assertIsNone(self.page.evaluate("localStorage.getItem('analysisHistory')"))

    def test_client_timeout_shows_retry_instead_of_hanging_or_fallback(self):
        self.page.evaluate("window.__t02HangAnalyze = true")
        self.submit_manual("Aqua, Prilocaine Hydrochloride", "Topical anesthetic")

        expect(self.page.locator("#analysisRetry")).to_be_visible(timeout=1500)
        self.assertNotIn("86/100", self.page.locator("#result").inner_text())

    def test_ocr_started_analysis_failure_keeps_photo_and_composition(self):
        self.mode = "503"
        self.page.evaluate("""() => {
            window.Tesseract = { recognize: async () => ({ data: {
                text: 'INGREDIENTS: Aqua, Prilocaine Hydrochloride, Phenoxyethanol'
            }}) };
        }""")

        self.page.locator("#photoInput").set_input_files(files=PHOTO_FIXTURE)
        expect(self.page.locator("#photoAnalyze")).to_be_enabled()
        self.page.locator("#photoAnalyze").click()
        expect(self.page.locator("#analysisRetry")).to_be_visible()

        self.assertEqual(
            self.page.locator("#composition").input_value(),
            "Aqua, Prilocaine Hydrochloride, Phenoxyethanol",
        )
        self.assertTrue(self.page.locator("#photoPreview").get_attribute("src").startswith("blob:"))
        self.assertNotIn("86/100", self.page.locator("#result").inner_text())
        self.assertIsNone(self.page.evaluate("localStorage.getItem('analysisHistory')"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
