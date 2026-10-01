"""T01 browser-only red regressions.

All API responses are local route mocks. This suite does not claim to test a
camera, OCR engine, or external product source. It verifies how the browser
handles their documented responses at the application boundary.
"""

import base64
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PHOTO_FIXTURE = {
    "name": "label-fixture.png",
    "mimeType": "image/png",
    # A valid 1x1 PNG used only to exercise the file-input/browser boundary.
    "buffer": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII="
    ),
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def guess_type(self, path):
        content_type = super().guess_type(path)
        if content_type in {"text/html", "text/css", "text/javascript", "application/javascript"}:
            return f"{content_type}; charset=utf-8"
        return content_type


class BrowserRegressionTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.page = self.context.new_page()
        self.analyze_requests = []

        def route_request(route):
            request = route.request
            if "/api/" not in request.url:
                if request.url.startswith(self.url):
                    route.continue_()
                else:
                    route.abort()
                return

            if "/api/analyze" in request.url:
                self.analyze_requests.append(request.post_data_json)
                route.fulfill(status=503, json={"error": "Temporary analyzer outage"})
            elif "/api/photo/resolve" in request.url:
                route.fulfill(json={
                    "mode": "unknown",
                    "confidence": 0.35,
                    "ingredients": ["Qwertyblender", "Zxcvbnformula", "Plmoknextract"],
                    "cleanedText": "Qwertyblender, Zxcvbnformula, Plmoknextract",
                    "composition": "",
                    "message": "Cannot identify composition reliably.",
                })
            elif "/api/products/search" in request.url and "Audit" in request.url:
                route.fulfill(json={"products": [{
                    "id": "audit-a",
                    "name": "Audit Formula A",
                    "brand": "Fixture",
                    "composition": "Aqua, Glycerin, Panthenol",
                    "hasComposition": True,
                    "source": "fixture",
                }]})
            elif "/api/products/audit-a" in request.url:
                route.fulfill(json={"product": {
                    "id": "audit-a",
                    "name": "Audit Formula A",
                    "brand": "Fixture",
                    "composition": "Aqua, Glycerin, Panthenol",
                    "hasComposition": True,
                    "source": "fixture",
                }})
            elif "/api/auth/me" in request.url:
                route.fulfill(json={"user": None})
            else:
                route.fulfill(json={"products": [], "theme": "fresh"})

        self.page.route("**/*", route_request)
        self.page.goto(self.url, wait_until="networkidle")

    def tearDown(self):
        self.context.close()

    def test_t01_06_unknown_photo_does_not_auto_analyze(self):
        self.page.evaluate("""() => {
            window.Tesseract = { recognize: async () => ({ data: {
                text: 'Qwertyblender, Zxcvbnformula, Plmoknextract'
            }}) };
        }""")

        self.page.locator("#photoInput").set_input_files(files=PHOTO_FIXTURE)
        self.page.wait_for_function(
            "document.querySelector('#photoStatus').textContent.includes('Cannot identify composition reliably.')"
        )

        self.assertEqual(
            self.analyze_requests,
            [],
            "mode: unknown must ask for confirmation and must not submit garbage to /api/analyze.",
        )

    def test_t01_07_server_503_for_anesthetic_never_uses_local_cosmetic_fallback(self):
        self.page.evaluate("""() => {
            document.querySelector('#productName').value = 'Topical anesthetic';
            document.querySelector('#composition').value =
              'Aqua, Prilocaine Hydrochloride, Glycerin, Phenoxyethanol';
            document.querySelector('#analysisForm').requestSubmit();
        }""")
        self.page.wait_for_function("document.querySelector('#result').textContent.trim().length > 0")
        result = self.page.locator("#result").inner_text()

        self.assertNotIn(
            "86/100",
            result,
            "A 503 must remain a visible server failure; it cannot render a local cosmetic score for an anesthetic.",
        )

    def test_t01_08_renaming_product_clears_composition_before_analysis(self):
        self.page.locator("#productName").fill("Audit")
        self.page.locator(".suggestion").first.wait_for()
        self.page.locator(".suggestion").first.click()
        self.page.locator("#productName").fill("Entirely different product B")
        self.page.locator("#mobileAnalyze").click()
        self.page.wait_for_function("document.querySelector('#result').textContent.trim().length > 0")

        self.assertEqual(
            self.page.locator("#composition").input_value(),
            "",
            "Changing product A to unselected product B must invalidate product A's cached INCI.",
        )
        if self.analyze_requests:
            self.assertNotIn(
                "Aqua, Glycerin, Panthenol",
                self.analyze_requests[-1].get("text", ""),
                "Changing product A to product B must not analyse product A's cached INCI.",
            )

    def test_t01_11_default_profile_is_neutral_until_user_selects_values(self):
        profile = self.page.evaluate("""() => ({
            skinType: document.querySelector('#skinType').value,
            context: document.querySelector('#context').value,
            concerns: document.querySelector('#concerns').value
        })""")

        self.assertEqual(profile, {"skinType": "", "context": "", "concerns": ""})

    def test_t01_12_scanner_control_is_not_covered_by_sticky_analyze_button_at_390px(self):
        overlap = self.page.evaluate("""() => {
            const scanner = document.querySelector('#barcodeScan');
            const rect = scanner.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return !hit || (!scanner.contains(hit) && !hit.closest('#barcodeScan'));
        }""")

        self.assertFalse(overlap, "At 390 px, the fixed analyze button must not cover the barcode scanner control.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
