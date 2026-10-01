"""Browser acceptance tests for T03 product/composition ownership.

All product, analysis and OCR responses are deterministic local fixtures. The
photo case checks state transitions only and is not a real OCR test.
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
    "name": "new-label.png",
    "mimeType": "image/png",
    "buffer": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII="
    ),
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def analysis_fixture():
    return {
        "summary": "SERVER RESULT",
        "formulaType": "Fixture",
        "score": {"score": 50, "label": "fixture"},
        "qualitySummary": {"score": None, "knownCount": 0, "unknownCount": 0, "totalIngredients": 0},
        "productClassification": {"label": "Fixture", "intendedUse": "State test", "confidence": 1},
        "totalIngredients": 0,
        "found": [],
        "unknown": [],
        "groups": [],
        "positives": [],
        "warnings": [],
        "architecture": [],
        "expertSummary": [],
        "routineAdvice": [],
        "questions": [],
        "confidence": {"label": "fixture", "text": "fixture"},
        "disclaimer": "fixture",
    }


class T03BrowserTests(unittest.TestCase):
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
        self.analyze_requests = []
        self.context = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.page = self.context.new_page()
        self.page.add_init_script("""(() => {
            const nativeFetch = window.fetch.bind(window);
            const product = (id, name, composition = '') => ({
                id, name, brand: 'Brand', category: 'cream', composition,
                hasComposition: Boolean(composition), source: 'T03 fixture', verified: true
            });
            const jsonResponse = value => new Response(JSON.stringify(value), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
            window.fetch = (input, options = {}) => {
                const url = new URL(typeof input === 'string' ? input : input.url, location.href);
                if (url.pathname === '/api/products/search') {
                    const query = url.searchParams.get('q') || '';
                    if (query === 'Alpha') return Promise.resolve(jsonResponse({ products: [product('a', 'Product A')] }));
                    if (query === 'Slow search A') {
                        window.__slowSearchStarted = true;
                        return new Promise(resolve => setTimeout(() => {
                            window.__slowSearchFinished = true;
                            resolve(jsonResponse({ products: [product('slow-a', 'Slow Product A', 'Aqua, Glycerin')] }));
                        }, 450));
                    }
                    if (query === 'Beta') return Promise.resolve(jsonResponse({ products: [product('b', 'Product B', 'Aqua, Niacinamide')] }));
                    if (query === 'Similar') return Promise.resolve(jsonResponse({ products: [
                        product('s1', 'Similar One', 'Aqua, Glycerin'),
                        product('s2', 'Similar Two', 'Aqua, Panthenol')
                    ] }));
                    if (query === 'Manual target') return Promise.resolve(jsonResponse({ products: [
                        product('manual', 'Manual Target', 'Aqua, Retinol')
                    ] }));
                    if (query === 'No INCI') return Promise.resolve(jsonResponse({ products: [
                        product('empty', 'No INCI Card')
                    ] }));
                    return Promise.resolve(jsonResponse({ products: [] }));
                }
                if (url.pathname === '/api/products/a') {
                    window.__aDetailsStarted = true;
                    return new Promise(resolve => setTimeout(() => {
                        window.__aDetailsFinished = true;
                        resolve(jsonResponse({ product: product('a', 'Product A', 'Aqua, Glycerin, Panthenol') }));
                    }, 450));
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
                self.analyze_requests.append(request.post_data_json)
                route.fulfill(json=analysis_fixture())
            elif "/api/photo/resolve" in request.url:
                route.fulfill(json={
                    "mode": "composition",
                    "entries": [{"ingredient": name, "status": "confirmed"} for name in ["Aqua", "Panthenol", "Phenoxyethanol"]],
                    "confidence": 0.94,
                    "ingredients": ["Aqua", "Panthenol", "Phenoxyethanol"],
                    "cleanedText": "Aqua, Panthenol, Phenoxyethanol",
                    "composition": "Aqua, Panthenol, Phenoxyethanol",
                    "message": "Photo formula fixture.",
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

    def choose_search_result(self, query):
        self.page.locator("#productName").fill(query)
        expect(self.page.locator(".suggestion").first).to_be_visible()
        self.page.locator(".suggestion").first.click()

    def test_product_a_then_typed_b_never_submits_a_formula_under_b(self):
        self.choose_search_result("Beta")
        expect(self.page.locator("#composition")).to_have_value("Aqua, Niacinamide")

        self.page.locator("#productName").fill("Entirely different product B")
        self.page.locator("#analysisForm").evaluate("form => form.requestSubmit()")
        self.page.wait_for_timeout(250)

        self.assertEqual(self.page.locator("#composition").input_value(), "")
        self.assertEqual(self.analyze_requests, [])

    def test_slow_a_details_cannot_overwrite_selected_b(self):
        self.choose_search_result("Alpha")
        self.page.wait_for_function("window.__aDetailsStarted === true")

        self.choose_search_result("Beta")
        expect(self.page.locator("#composition")).to_have_value("Aqua, Niacinamide")
        self.page.wait_for_function("window.__aDetailsFinished === true")
        self.page.wait_for_timeout(50)

        self.assertEqual(self.page.locator("#productName").input_value(), "Brand Product B")
        self.assertEqual(self.page.locator("#composition").input_value(), "Aqua, Niacinamide")

    def test_late_search_a_cannot_replace_selected_b_suggestions(self):
        self.page.locator("#productName").fill("Slow search A")
        self.page.wait_for_function("window.__slowSearchStarted === true")

        self.choose_search_result("Beta")
        self.page.wait_for_function("window.__slowSearchFinished === true")
        self.page.wait_for_timeout(50)

        self.assertEqual(self.page.locator("#productName").input_value(), "Brand Product B")
        self.assertEqual(self.page.locator("#composition").input_value(), "Aqua, Niacinamide")
        self.assertEqual(self.page.locator(".suggestion").count(), 0)

    def test_clearing_search_ignores_late_search_response(self):
        self.page.locator("#productName").fill("Slow search A")
        self.page.wait_for_function("window.__slowSearchStarted === true")
        self.page.locator("#productClear").click()
        self.page.wait_for_function("window.__slowSearchFinished === true")
        self.page.wait_for_timeout(50)

        self.assertEqual(self.page.locator("#productName").input_value(), "")
        self.assertEqual(self.page.locator(".suggestion").count(), 0)

    def test_clearing_search_cancels_pending_product_details(self):
        self.choose_search_result("Alpha")
        self.page.wait_for_function("window.__aDetailsStarted === true")
        self.page.locator("#productClear").click()
        self.page.wait_for_function("window.__aDetailsFinished === true")
        self.page.wait_for_timeout(50)

        self.assertEqual(self.page.locator("#productName").input_value(), "")
        self.assertEqual(self.page.locator("#composition").input_value(), "")

    def test_ambiguous_name_requires_explicit_selection(self):
        self.page.locator("#productName").fill("Similar")
        expect(self.page.locator(".suggestion")).to_have_count(2)
        self.page.locator("#analysisForm").evaluate("form => form.requestSubmit()")
        self.page.wait_for_timeout(250)

        self.assertEqual(self.analyze_requests, [])
        self.assertEqual(self.page.locator(".suggestion").count(), 2)

    def test_card_without_inci_does_not_inherit_previous_product_formula(self):
        self.choose_search_result("Beta")
        expect(self.page.locator("#composition")).to_have_value("Aqua, Niacinamide")

        self.choose_search_result("No INCI")
        expect(self.page.locator("#productName")).to_have_value("Brand No INCI Card")
        self.assertEqual(self.page.locator("#composition").input_value(), "")

    def test_manual_formula_is_not_replaced_without_confirmation(self):
        manual = "Aqua, Copper Tripeptide-1, Phenoxyethanol"
        self.page.evaluate("""value => {
            const field = document.querySelector('#composition');
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }""", manual)
        dialogs = []
        self.page.on("dialog", lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))

        self.choose_search_result("Manual target")
        self.page.wait_for_timeout(100)

        self.assertEqual(len(dialogs), 1)
        self.assertEqual(self.page.locator("#composition").input_value(), manual)

    def test_manual_input_during_slow_product_load_is_preserved(self):
        dialogs = []
        self.page.on("dialog", lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
        self.choose_search_result("Alpha")
        self.page.wait_for_function("window.__aDetailsStarted === true")

        manual = "Aqua, Copper Tripeptide-1, Phenoxyethanol"
        self.page.evaluate("""value => {
            const field = document.querySelector('#composition');
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }""", manual)
        self.page.wait_for_function("window.__aDetailsFinished === true")
        self.page.wait_for_timeout(50)

        self.assertEqual(len(dialogs), 1)
        self.assertEqual(self.page.locator("#composition").input_value(), manual)

    def test_new_photo_formula_drops_previous_product_ownership(self):
        self.choose_search_result("Beta")
        self.page.evaluate("""() => {
            window.Tesseract = { recognize: async () => ({ data: {
                text: 'INGREDIENTS: Aqua, Panthenol, Phenoxyethanol'
            }}) };
        }""")
        self.page.locator("#photoInput").set_input_files(files=PHOTO_FIXTURE)
        expect(self.page.locator("#photoAnalyze")).to_be_enabled()
        self.page.locator("#photoAnalyze").click()
        expect(self.page.locator("#result")).to_contain_text("SERVER RESULT")

        latest = self.analyze_requests[-1]
        self.assertEqual(latest["text"], "Aqua, Panthenol, Phenoxyethanol")
        self.assertNotEqual(latest.get("productName"), "Brand Product B")


if __name__ == "__main__":
    unittest.main(verbosity=2)
