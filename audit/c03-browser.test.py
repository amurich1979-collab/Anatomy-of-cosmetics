"""C03 browser checks for formula confirmation and missing-data fallback paths."""
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
FORMULA = "Aqua, Glycerin, Niacinamide, Panthenol"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class C03BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "public")))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def open_page(self, width, height):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        page = context.new_page()
        requests = []
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if "/api/analyze" in url:
                requests.append(route.request.post_data_json)
                route.fulfill(status=503, json={"error": "controlled_test_response"})
            elif "/api/products/search" in url:
                route.fulfill(json={"products": [{
                    "id": "fixture-cream", "brand": "Fixture", "name": "Calm Cream",
                    "composition": "Aqua, Glycerin", "compositionScope": "full",
                    "source": "C03 fixture", "sourceType": "local", "verified": True
                }], "diagnostics": {}})
            elif "/api/" in url:
                route.fulfill(json={"user": None, "products": [], "theme": "fresh"})
            elif url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, requests, errors

    def test_user_confirmation_and_fallback_paths_at_target_sizes(self):
        for width, height in [(360, 640), (390, 844), (412, 915), (1280, 900)]:
            with self.subTest(width=width):
                page, requests, errors = self.open_page(width, height)

                expect(page.locator("label[for='photoInput']")).to_be_visible()
                expect(page.locator(".manual-entry > summary")).to_be_visible()
                self.assertFalse(page.locator("#formulaConfirmationRow").is_visible())

                page.locator("#productName").fill("Fixture Calm Cream")
                expect(page.locator("#productSuggestions .suggestion")).to_be_visible()
                page.locator("#productSuggestions .suggestion").click()
                expect(page.locator("#productStatus")).to_contain_text("Состав подставлен")

                page.locator(".manual-entry > summary").scroll_into_view_if_needed()
                page.locator(".manual-entry > summary").click()
                page.locator("#composition").fill(FORMULA)
                expect(page.locator("#formulaConfirmationRow")).to_be_visible()

                confirmation = page.locator("#formulaLabelConfirmation")
                confirmation.scroll_into_view_if_needed()
                confirmation.check()
                self.assertTrue(confirmation.is_checked())
                expect(page.locator("#formulaConfirmationRow")).to_contain_text("не означает, что состав проверен производителем")
                bounds = page.locator("#formulaConfirmationRow").evaluate(
                    "e => { const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; }"
                )
                self.assertGreaterEqual(bounds["left"], 0)
                self.assertLessEqual(bounds["right"], width)

                submit = page.locator("#mobileAnalyze" if width < 768 else "#analysisForm > .primary-action[type='submit']")
                submit.scroll_into_view_if_needed()
                submit.click()
                page.wait_for_timeout(50)
                self.assertEqual(len(requests), 1)
                self.assertEqual(requests[0]["evidence"]["formula"]["scope"], "full")
                self.assertEqual(requests[0]["evidence"]["formula"]["confirmation"], "user_confirmed")
                self.assertNotEqual(requests[0]["evidence"]["formula"]["confirmation"], "manufacturer_verified")

                page.locator("#productName").fill("Different product")
                self.assertFalse(confirmation.is_checked())
                self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
                self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
