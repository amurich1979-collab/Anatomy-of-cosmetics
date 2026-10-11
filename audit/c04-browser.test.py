"""C04 browser workflow tests. OCR and APIs are mocked; this is not an accuracy benchmark."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("photo_tests", Path(__file__).with_name("t06-photo.test.py"))
photo_tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photo_tests)


class C04BrowserTests(photo_tests.PhotoTests):
    def test_c04_weak_first_pass_uses_better_retry(self):
        self.page.evaluate("""() => {
          window.ocrCalls = 0;
          window.Tesseract = {recognize: async () => {
            window.ocrCalls++;
            if (window.ocrCalls === 2) return {data: {
              text:'INGREDIENTS: Aqua, Glycerin, Panthenol, Phenoxyethanol', confidence:92,
              words:[{text:'Aqua',confidence:98,bbox:{x0:1,y0:2,x1:20,y1:10}}]
            }};
            return {data:{text:'aq', confidence:22, words:[]}};
          }};
        }""")
        self.page.route("**/api/photo/resolve", lambda route: route.fulfill(json={
            "mode": "composition", "labelType": "inci", "confidence": .9,
            "ingredients": ["Aqua", "Glycerin", "Panthenol", "Phenoxyethanol"],
            "entries": [{"ingredient": name, "canonicalName": name, "status": "confirmed"}
                        for name in ["Aqua", "Glycerin", "Panthenol", "Phenoxyethanol"]],
            "composition": "Aqua, Glycerin, Panthenol, Phenoxyethanol"
        }))
        self.upload()
        self.stage("confirmation")
        self.assertEqual(self.page.evaluate("window.ocrCalls"), 2)
        self.assertIn("Phenoxyethanol", self.page.locator("#photoText").input_value())

    def test_c04_suggestions_are_visible_and_not_applied_silently(self):
        self.mock_ocr()
        self.page.route("**/api/photo/resolve", lambda route: route.fulfill(json={
            "mode": "composition", "labelType": "inci", "confidence": .75,
            "ingredients": ["Aqua", "Glycerin", "Panthenol", "Phenoxyethanil"],
            "entries": [
                {"raw": "Aqua", "ingredient": "Aqua", "canonicalName": "Aqua", "status": "confirmed"},
                {"raw": "Glycerin", "ingredient": "Glycerin", "canonicalName": "Glycerin", "status": "confirmed"},
                {"raw": "Panthenol", "ingredient": "Panthenol", "canonicalName": "Panthenol", "status": "confirmed"},
                {"raw": "Phenoxyethanil", "ingredient": "Phenoxyethanil", "status": "suggested", "suggested_match": "Phenoxyethanol"}
            ],
            "suggestions": [{"original": "Phenoxyethanil", "suggested_match": "Phenoxyethanol", "confidence": .91}],
            "composition": "Aqua, Glycerin, Panthenol, Phenoxyethanil"
        }))
        self.upload()
        self.stage("confirmation")
        self.assertTrue(self.page.locator("#photoSuggestions").is_visible())
        self.assertIn("Phenoxyethanil", self.page.locator("#photoSuggestions").inner_text())
        self.assertIn("Phenoxyethanol", self.page.locator("#photoSuggestions").inner_text())
        self.assertIn("Phenoxyethanil", self.page.locator("#photoText").input_value())

    def test_c04_retry_clears_old_photo_and_reopens_camera_path(self):
        self.mock_ocr()
        self.mock_composition()
        self.upload()
        self.stage("confirmation")
        self.page.evaluate("() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('denied'); }; }")
        self.page.locator("#photoRetry").click()
        self.page.wait_for_function("document.querySelector('#photoStatus').textContent.includes('Загрузить фото')")
        self.assertTrue(self.page.locator("#photoReview").is_hidden())
        self.assertEqual(self.page.locator("#photoText").input_value(), "")
        self.assertTrue(self.page.locator("#photoSuggestions").is_hidden())

    def test_c04_barcode_photo_uses_barcode_path_without_enabling_formula_buttons(self):
        self.mock_ocr()
        self.page.route("**/api/photo/resolve", lambda route: route.fulfill(json={
            "mode": "barcode", "labelType": "barcode", "barcode": "4006381333931",
            "cleanedText": "4006381333931", "ingredients": []
        }))
        self.upload()
        self.stage("barcode")
        self.assertEqual(self.page.locator("#barcodeInput").input_value(), "4006381333931")
        self.assertTrue(self.page.locator("#photoAnalyze").is_disabled())
        self.assertTrue(self.page.locator("#photoUseComposition").is_disabled())

    def test_c04_review_controls_fit_all_required_widths(self):
        self.mock_ocr()
        self.page.route("**/api/photo/resolve", lambda route: route.fulfill(json={
            "mode": "composition", "labelType": "inci", "confidence": .78,
            "ingredients": ["Aqua", "Glycerin", "Panthenol", "Phenoxyethanil"],
            "entries": [
                {"raw": "Aqua", "ingredient": "Aqua", "canonicalName": "Aqua", "status": "confirmed"},
                {"raw": "Glycerin", "ingredient": "Glycerin", "canonicalName": "Glycerin", "status": "confirmed"},
                {"raw": "Panthenol", "ingredient": "Panthenol", "canonicalName": "Panthenol", "status": "confirmed"},
                {"raw": "Phenoxyethanil", "ingredient": "Phenoxyethanil", "status": "suggested"}
            ],
            "suggestions": [{"original": "Phenoxyethanil", "suggested_match": "Phenoxyethanol", "confidence": .91}],
            "composition": "Aqua, Glycerin, Panthenol, Phenoxyethanil"
        }))
        self.upload()
        self.stage("confirmation")

        for width in [360, 390, 412, 1280]:
            self.page.set_viewport_size({"width": width, "height": 900})
            self.page.locator("#photoReview").scroll_into_view_if_needed()
            self.page.wait_for_timeout(50)
            overflow = self.page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            self.assertLessEqual(overflow, 1, f"horizontal overflow at {width}px")
            for selector in ["#photoSuggestions", "#photoRetry", "#photoClear"]:
                locator = self.page.locator(selector)
                self.assertTrue(locator.is_visible(), f"{selector} hidden at {width}px")
                box = locator.bounding_box()
                self.assertGreaterEqual(box["x"], -1, f"{selector} starts outside at {width}px")
                self.assertLessEqual(box["x"] + box["width"], width + 1, f"{selector} ends outside at {width}px")


if __name__ == "__main__":
    suite = unittest.TestSuite(C04BrowserTests(name) for name in unittest.defaultTestLoader.getTestCaseNames(C04BrowserTests) if name.startswith("test_c04"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
