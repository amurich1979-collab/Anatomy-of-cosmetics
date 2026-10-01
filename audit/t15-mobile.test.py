"""T15 mobile layout checks against the rendered browser, with local API fixtures."""
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class T15MobileTests(unittest.TestCase):
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

    def page_at(self, width, height):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if "/api/" in url:
                route.fulfill(json={"user": None, "products": [], "theme": "fresh"})
            elif url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, errors

    def assert_action_center_is_clickable(self, page, selector):
        state = page.locator(selector).evaluate("""element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { visible: Boolean(rect.width && rect.height), width: rect.width, height: rect.height,
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            receivesClick: hit === element || element.contains(hit) };
        }""")
        self.assertTrue(state["visible"], selector)
        self.assertGreaterEqual(state["height"], 40, selector)
        self.assertGreaterEqual(state["left"], 0, selector)
        self.assertTrue(state["receivesClick"], selector)
        return state

    def test_primary_actions_are_visible_and_not_covered_at_target_sizes(self):
        for width, height in [(360, 640), (390, 844), (412, 915)]:
            with self.subTest(width=width, height=height):
                page, errors = self.page_at(width, height)
                scan = self.assert_action_center_is_clickable(page, "#barcodeScan")
                self.assert_action_center_is_clickable(page, "#barcodeApply")
                self.assert_action_center_is_clickable(page, "#photoCameraOpen")
                sticky = self.assert_action_center_is_clickable(page, "#mobileAnalyze")
                self.assertLessEqual(scan["bottom"], sticky["top"] - 8, "scanner must remain above the fixed CTA")
                self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
                self.assertEqual(errors, [])
                page.screenshot(path=str(ROOT / "audit" / f"t15-initial-{width}x{height}.png"))

    def test_manual_and_profile_sections_remain_keyboard_accessible(self):
        page, errors = self.page_at(390, 844)
        for selector in [".manual-entry > summary", ".advanced-options > summary"]:
            page.locator(selector).evaluate("element => element.scrollIntoView({block:'center'})")
            self.assert_action_center_is_clickable(page, selector)
            page.locator(selector).focus()
            self.assertEqual(page.evaluate("selector => document.activeElement === document.querySelector(selector)", selector), True)
            page.keyboard.press("Enter")
        self.assertTrue(page.locator(".manual-entry").evaluate("element => element.open"))
        self.assertTrue(page.locator(".advanced-options").evaluate("element => element.open"))
        self.assertEqual(errors, [])

    def test_day_and_night_controls_have_visible_text_and_focus(self):
        page, errors = self.page_at(390, 844)
        theme = self.assert_action_center_is_clickable(page, "[data-theme-toggle]")
        self.assertGreaterEqual(theme["height"], 40)
        self.assertIn("День", page.locator("[data-theme-toggle]").inner_text())
        page.locator("[data-theme-toggle]").focus()
        self.assertEqual(page.evaluate("document.activeElement.matches('[data-theme-toggle]')"), True)
        before = page.locator("[data-theme-toggle]").inner_text()
        page.locator("[data-theme-toggle]").press("Enter")
        self.assertNotEqual(page.locator("[data-theme-toggle]").inner_text(), before)
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "dark")
        contrast = page.locator("[data-theme-toggle]").evaluate("""element => {
          const rgb = (value) => (value.match(/\\d+(?:\\.\\d+)?/g) || []).slice(0, 3).map(Number);
          const channel = (value) => {
            value /= 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          };
          const luminance = (value) => {
            const [red, green, blue] = rgb(value);
            return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
          };
          const style = getComputedStyle(element);
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        }""")
        self.assertGreaterEqual(contrast, 4.5)
        self.assertEqual(errors, [])

    def test_large_text_keeps_actions_reachable(self):
        page, errors = self.page_at(360, 640)
        page.add_style_tag(content="html { font-size: 150% !important; }")
        for selector in ["#photoCameraOpen", "#barcodeScan", "#barcodeImageUpload", "#barcodeApply"]:
            page.locator(selector).evaluate("element => element.scrollIntoView({block: 'center'})")
            self.assert_action_center_is_clickable(page, selector)
        for selector in [".photo-upload-cta", "#barcodeScan", "#barcodeImageUpload", "#barcodeApply"]:
            fits = page.locator(selector).evaluate_all("elements => elements.every(element => element.scrollWidth <= element.clientWidth)")
            self.assertTrue(fits, selector)
        self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "t15-large-text-360x640.png"))

    def test_desktop_actions_remain_clickable(self):
        page, errors = self.page_at(1280, 900)
        for selector in ["#productName", "#photoCameraOpen", "#barcodeScan", "#barcodeApply", ".panel > .primary-action[type='submit']"]:
            page.locator(selector).evaluate("element => element.scrollIntoView({block: 'center'})")
            self.assert_action_center_is_clickable(page, selector)
        self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "t15-desktop-1280x900.png"), full_page=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
