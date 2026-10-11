"""C13 technical acceptance for responsive layout and accessible capture controls."""
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


class C13MobileAccessibilityTests(unittest.TestCase):
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

    def page_at(self, width, height, camera_mode="missing"):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        if camera_mode == "denied":
            page.add_init_script("""
              Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) }
              });
            """)
        elif camera_mode == "available":
            page.add_init_script("""
              Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: { getUserMedia: () => Promise.resolve(new MediaStream()) }
              });
              HTMLMediaElement.prototype.play = () => Promise.resolve();
              window.BarcodeDetector = class {
                static getSupportedFormats() { return Promise.resolve(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']); }
                detect() { return Promise.resolve([]); }
                constructor() {}
              };
            """)

        def route_request(route):
            if "/api/" in route.request.url:
                route.fulfill(json={"user": None, "products": [], "theme": "fresh"})
            elif route.request.url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, errors

    def assert_reachable(self, page, selector):
        state = page.locator(selector).evaluate("""element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return {
            width: rect.width, height: rect.height, left: rect.left, right: rect.right,
            top: rect.top, bottom: rect.bottom,
            receivesClick: hit === element || element.contains(hit),
            hit: hit ? `${hit.tagName.toLowerCase()}#${hit.id}.${String(hit.className || "").replace(/\\s+/g, ".")}` : null,
            scrollY: window.scrollY,
            viewportHeight: window.innerHeight
          };
        }""")
        self.assertGreater(state["width"], 0, selector)
        self.assertGreaterEqual(state["height"], 40, selector)
        self.assertGreaterEqual(state["left"], 0, selector)
        self.assertTrue(state["receivesClick"], f"{selector}: {state}")
        return state

    def assert_no_horizontal_overflow(self, page):
        self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))

    def test_task_path_fits_all_required_viewports_and_themes(self):
        for width, height in [(360, 640), (390, 844), (412, 915), (1280, 900)]:
            for theme in ("fresh", "dark"):
                with self.subTest(width=width, theme=theme):
                    page, errors = self.page_at(width, height)
                    page.evaluate("theme => document.documentElement.dataset.theme = theme", theme)
                    page.locator("#productName").fill("Очень длинное наименование косметического средства для проверки переноса в мобильной компоновке")
                    for selector in ["#photoCameraOpen", "#barcodeScan", "#barcodeImageUpload", "#barcodeApply"]:
                        page.locator(selector).evaluate("element => element.scrollIntoView({block: 'center'})")
                        self.assert_reachable(page, selector)
                    self.assert_no_horizontal_overflow(page)
                    self.assertEqual(errors, [])
                    page.screenshot(path=str(ROOT / "audit" / f"c13-{theme}-{width}x{height}.png"), full_page=False)

    def test_fixed_action_moves_above_a_virtual_keyboard(self):
        page, errors = self.page_at(390, 844)
        page.evaluate("document.documentElement.style.setProperty('--mobile-keyboard-inset', '260px')")
        sticky = self.assert_reachable(page, "#mobileAnalyze")
        self.assertLessEqual(abs(sticky["bottom"] - (844 - 260 - 10)), 3)
        self.assert_no_horizontal_overflow(page)
        self.assertEqual(errors, [])

    def test_camera_and_scanner_denials_keep_a_recovery_path(self):
        page, errors = self.page_at(390, 844, camera_mode="denied")
        page.locator("#photoCameraOpen").click()
        page.locator("#photoStatus").wait_for(state="visible")
        self.assertIn("Камера недоступна", page.locator("#photoStatus").inner_text())
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#photoCameraOpen')"), True)

        page.locator("#barcodeScan").click()
        page.locator("#productStatus").wait_for(state="visible")
        self.assertIn("EAN/UPC", page.locator("#productStatus").inner_text())
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#barcodeInput')"), True)
        self.assertEqual(errors, [])

    def test_capture_dialogs_have_names_trap_focus_and_restore_it(self):
        page, errors = self.page_at(390, 844, camera_mode="available")
        page.locator("#photoCameraOpen").click()
        camera = page.locator("#cameraCapture")
        camera.wait_for(state="visible")
        self.assertEqual(camera.get_attribute("role"), "dialog")
        self.assertTrue(camera.get_attribute("aria-labelledby"))
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#cameraClose')"), True)
        page.keyboard.press("Shift+Tab")
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#cameraShot')"), True)
        page.keyboard.press("Tab")
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#cameraClose')"), True)
        page.keyboard.press("Escape")
        self.assertTrue(camera.is_hidden())
        page.wait_for_function("document.activeElement === document.querySelector('#photoCameraOpen')")
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#photoCameraOpen')"), True)

        page.locator("#barcodeScan").click()
        barcode = page.locator("#barcodeCapture")
        barcode.wait_for(state="visible")
        self.assertEqual(barcode.get_attribute("role"), "dialog")
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#barcodeScanClose')"), True)
        page.keyboard.press("Escape")
        self.assertTrue(barcode.is_hidden())
        page.wait_for_function("document.activeElement === document.querySelector('#barcodeScan')")
        self.assertEqual(page.evaluate("document.activeElement === document.querySelector('#barcodeScan')"), True)
        self.assertEqual(errors, [])

    def test_controls_have_accessible_names_and_visible_focus(self):
        page, errors = self.page_at(390, 844)
        unnamed = page.locator("button").evaluate_all("""buttons => buttons
          .filter(button => !button.hidden && !button.closest('details:not([open])') && button.getClientRects().length)
          .filter(button => !(button.getAttribute('aria-label') || button.textContent.trim() || button.getAttribute('title')))
          .map(button => button.id || button.outerHTML)""")
        self.assertEqual(unnamed, [])
        page.locator("#barcodeApply").focus()
        focus_style = page.locator("#barcodeApply").evaluate("element => getComputedStyle(element).outlineStyle")
        self.assertNotEqual(focus_style, "none")
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
