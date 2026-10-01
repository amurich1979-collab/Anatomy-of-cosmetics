"""T07 browser acceptance tests.

The still-image test uses ZXing's real EAN-13 blackbox fixture and the vendored
decoder. Camera streams and API responses are local fixtures; physical Android
and iOS devices are intentionally outside this automated suite.
"""
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EAN_IMAGE = ROOT / "audit" / "fixtures" / "zxing-ean13-1.png"
EAN_CODE = "8413000065504"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class BarcodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "public"))
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
        self.context.add_init_script("delete window.BarcodeDetector")
        self.page = self.context.new_page()
        self.searches = []

        def route_request(route):
            request = route.request
            if "/api/products/search" in request.url:
                query = parse_qs(urlparse(request.url).query).get("q", [""])[0]
                self.searches.append(query)
                route.fulfill(json={"products": []})
            elif "/api/auth/me" in request.url:
                route.fulfill(json={"user": None})
            elif "/api/" in request.url:
                route.fulfill(json={"products": []})
            elif request.url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        self.page.route("**/*", route_request)
        self.page.goto(self.url, wait_until="domcontentloaded")
        self.page.locator("#analysisForm").wait_for()

    def tearDown(self):
        self.context.close()

    def test_fallback_decodes_official_ean_image_without_native_detector(self):
        self.assertFalse(self.page.evaluate("'BarcodeDetector' in window"))
        self.page.locator("#barcodeImageInput").set_input_files(str(EAN_IMAGE))
        self.page.wait_for_function("code => document.querySelector('#barcodeInput').value === code", arg=EAN_CODE)
        self.page.wait_for_function("() => document.querySelector('#productStatus').textContent.includes('8413000065504')")
        self.assertEqual(self.searches, [EAN_CODE])

    def test_invalid_check_digit_and_embedded_number_never_search(self):
        for value in ["8413000065505", "Order 8413000065504 ready", "1234567890"]:
            self.page.locator("#barcodeInput").fill(value)
            self.page.locator("#barcodeApply").click()
            expect(self.page.locator("#productStatus")).to_contain_text("контроль")
        self.assertEqual(self.searches, [])

    def test_manual_upca_uses_explicit_ean13_equivalent_once(self):
        self.page.locator("#barcodeInput").fill("036000291452")
        self.page.locator("#barcodeApply").click()
        self.page.wait_for_function("() => document.querySelector('#productStatus').textContent.includes('UPC-A')")
        self.assertEqual(self.searches, ["0036000291452"])

    def test_arbitrary_qr_url_is_not_opened_or_searched(self):
        navigations = []
        self.page.on("framenavigated", lambda frame: navigations.append(frame.url))
        accepted = self.page.evaluate("window.__barcodeTest.apply('https://example.test/item/8413000065504', 'qr_code')")
        self.page.wait_for_timeout(100)
        self.assertFalse(accepted)
        self.assertEqual(self.searches, [])
        self.assertEqual(navigations, [])

    def test_supported_gs1_qr_looks_up_only_its_gtin(self):
        accepted = self.page.evaluate("window.__barcodeTest.apply('https://id.gs1.org/01/09506000134352', 'qr_code')")
        self.assertTrue(accepted)
        self.page.wait_for_function("() => document.querySelector('#barcodeInput').value === '09506000134352'")
        self.assertEqual(self.searches, ["09506000134352"])

    def test_repeated_detection_causes_one_lookup(self):
        results = self.page.evaluate("""async () => Promise.all([
          window.__barcodeTest.apply('8413000065504', 'ean_13'),
          window.__barcodeTest.apply('8413000065504', 'ean_13'),
          window.__barcodeTest.apply('8413000065504', 'ean_13')
        ])""")
        self.page.wait_for_timeout(100)
        self.assertEqual(sum(bool(item) for item in results), 1)
        self.assertEqual(self.searches, [EAN_CODE])

    def test_camera_denial_keeps_upload_and_manual_fallbacks(self):
        self.page.evaluate("() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('denied'); }; }")
        self.page.locator("#barcodeScan").click()
        expect(self.page.locator("#productStatus")).to_contain_text("EAN/UPC")
        expect(self.page.locator("#barcodeImageUpload")).to_be_visible()
        expect(self.page.locator("#barcodeInput")).to_be_visible()

    def test_closing_scanner_stops_stream(self):
        self.page.evaluate("""() => {
          window.barcodeTrackStops = 0;
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
          window.barcodeTestStream = canvas.captureStream(5);
          const track = window.barcodeTestStream.getTracks()[0];
          const originalStop = track.stop.bind(track);
          track.stop = () => { window.barcodeTrackStops++; originalStop(); };
          navigator.mediaDevices.getUserMedia = async () => window.barcodeTestStream;
          window.ZXingBrowser.BrowserMultiFormatReader.prototype.decodeFromVideoElement = async () => ({stop(){}});
        }""")
        self.page.locator("#barcodeScan").click()
        expect(self.page.locator("#barcodeCapture")).to_be_visible()
        self.page.locator("#barcodeScanClose").click()
        self.page.wait_for_function("window.barcodeTrackStops === 1")
        expect(self.page.locator("#barcodeCapture")).to_be_hidden()

    def test_closing_before_camera_permission_stops_late_stream(self):
        self.page.evaluate("""() => {
          window.lateBarcodeStops = 0;
          navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
            window.allowBarcodeCamera = () => resolve({getTracks: () => [{stop: () => window.lateBarcodeStops++}]});
          });
        }""")
        self.page.locator("#barcodeScan").click()
        expect(self.page.locator("#barcodeCapture")).to_be_visible()
        self.page.locator("#barcodeScanClose").click()
        self.page.evaluate("window.allowBarcodeCamera()")
        self.page.wait_for_function("window.lateBarcodeStops === 1")
        expect(self.page.locator("#barcodeCapture")).to_be_hidden()

    def test_controls_are_visible_click_targets_on_mobile_widths(self):
        for width in [360, 390, 412]:
            self.page.set_viewport_size({"width": width, "height": 844})
            self.page.locator(".barcode-row").scroll_into_view_if_needed()
            for selector in ["#barcodeScan", "#barcodeImageUpload", "#barcodeApply"]:
                expect(self.page.locator(selector)).to_be_visible()
                box = self.page.locator(selector).bounding_box()
                self.assertGreaterEqual(box["height"], 44)
                self.assertGreaterEqual(box["width"], 120)
        self.page.screenshot(path=str(ROOT / "audit" / "t07-barcode-mobile.png"), full_page=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
