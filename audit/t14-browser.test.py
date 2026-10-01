"""T14 browser boundary tests. External APIs are mocked; analysis uses the real local engine."""
import json
import subprocess
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
FORMULA = "Aqua, Glycerin, Petrolatum, Niacinamide, Phenoxyethanol, Panthenol, Squalane, Allantoin, Urea, Dimethicone, Cetearyl Alcohol, Citric Acid"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def analyze(payload):
    code = """import { analyzeComposition } from './src/analyzer.js';
import { createAnalysisContract } from './src/analysisContract.js';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const result = analyzeComposition({...request, formulaScope: 'full'});
result.analysisContract = createAnalysisContract({analysis: result, request});
console.log(JSON.stringify(result));"""
    result = subprocess.run(["node", "--input-type=module", "-e", code], input=json.dumps(payload), cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(result.stdout)


class T14BrowserTests(unittest.TestCase):
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

    def open_page(self, width):
        context = self.browser.new_context(viewport={"width": width, "height": 844})
        self.addCleanup(context.close)
        page = context.new_page()
        requests = []
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if "/api/analyze" in url:
                payload = route.request.post_data_json
                requests.append(payload)
                route.fulfill(json=analyze(payload))
            elif "/api/" in url:
                route.fulfill(json={"user": None, "products": [], "theme": "fresh"})
            elif url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, requests, errors

    def test_neutral_profile_then_explicit_allergies_at_mobile_and_desktop_sizes(self):
        for width in [360, 390, 412, 1280]:
            with self.subTest(width=width):
                page, requests, errors = self.open_page(width)
                for selector in ["#skinType", "#context", "#concerns", "#allergyStatus", "#allergens", "#previousReaction", "#applicationArea", "#profileGoal"]:
                    self.assertEqual(page.locator(selector).input_value(), "")
                self.assertEqual(page.locator('.concern-chip[aria-pressed="true"]').count(), 0)
                # Seed the composition boundary; mobile manual-entry visibility belongs to T15.
                page.locator("#composition").evaluate("(e, value) => { e.value=value; e.dispatchEvent(new Event('input',{bubbles:true})); }", FORMULA)
                page.locator(".advanced-options > summary").evaluate("e => e.scrollIntoView({block:'center'})")
                page.locator(".advanced-options > summary").click()
                page.locator("#allergyStatus").select_option("reported")
                page.locator("#allergens").fill(FORMULA)
                page.locator("#profileGoal").select_option("hydration")
                page.locator("#applicationArea").select_option("face")
                for selector in ["#allergyStatus", "#allergens", "#profileGoal", "#applicationArea"]:
                    control = page.locator(selector)
                    control.evaluate("e => e.scrollIntoView({block:'center'})")
                    hit = control.evaluate("e => {const r=e.getBoundingClientRect(); const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {ok:h===e||e.contains(h),width:r.width,height:r.height,left:r.left,right:r.right};}")
                    self.assertTrue(hit["ok"], selector)
                    self.assertGreater(hit["height"], 30)
                    self.assertGreaterEqual(hit["left"], 0)
                    self.assertLessEqual(hit["right"], width)
                button = page.locator("#mobileAnalyze" if width < 768 else '#analysisForm button[type="submit"]')
                button.evaluate("e => e.scrollIntoView({block:'center'})")
                button.click()
                expect(page.locator("#personalAssessment")).to_be_visible()
                expect(page.locator("#personalAssessment")).to_contain_text("Есть ограничения")
                for name in FORMULA.split(", "):
                    self.assertIn(name, page.locator("#personalAssessment").inner_text())
                self.assertEqual(requests[-1]["profile"]["allergens"], FORMULA.split(", "))
                self.assertIsNone(page.evaluate("localStorage.getItem('analysisHistory')"))
                self.assertNotIn("Citric Acid", page.evaluate("JSON.stringify(localStorage)"))
                page.screenshot(path=str(ROOT / "audit" / f"t14-profile-{width}.png"))
                # Changing a profile must invalidate its now-stale personal result.
                page.locator("#allergens").fill("Glycerin")
                self.assertEqual(page.locator("#result").inner_text(), "")
                self.assertEqual(errors, [])

    def test_general_analysis_can_still_be_saved_without_personal_data(self):
        page, requests, errors = self.open_page(1280)
        page.locator(".manual-entry > summary").click()
        page.locator("#composition").fill("Aqua, Glycerin, Panthenol")
        page.locator('#analysisForm button[type="submit"]').click()
        expect(page.locator("#personalAssessment")).to_contain_text("Профиль не указан")
        stored = page.evaluate("JSON.parse(localStorage.getItem('analysisHistory'))")
        self.assertEqual(len(stored), 1)
        self.assertFalse(stored[0]["payload"]["analysis"]["personalization"]["profileProvided"])
        self.assertEqual(requests[-1]["profile"]["allergens"], [])
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
