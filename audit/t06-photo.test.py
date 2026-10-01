"""Photo lifecycle tests. OCR, camera and product sources are mocked, not accuracy tests."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("baseline", Path(__file__).with_name("t01-browser-regressions.py"))
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


class PhotoTests(baseline.BrowserRegressionTests):
    def upload(self):
        # Browser-generated valid PNG also exercises image decoding.
        self.page.evaluate("""async () => {
          const c = document.createElement('canvas'); c.width = c.height = 20;
          const blob = await new Promise(r => c.toBlob(r, 'image/png'));
          const dt = new DataTransfer(); dt.items.add(new File([blob], 'label.png', {type:'image/png'}));
          const input = document.querySelector('#photoInput'); input.files = dt.files;
          input.dispatchEvent(new Event('change', {bubbles:true}));
        }""")

    def mock_ocr(self, pending=False, confidence=90):
        self.page.evaluate("""({pending, confidence}) => {
          window.ocrCalls = 0;
          window.Tesseract = {recognize: async () => {
            window.ocrCalls++;
            if (pending) await new Promise(r => window.finishOcr = r);
            return {data: {text:'Ingredients: Aqua, Glycerin, Panthenol', confidence,
              words:[{text:'Aqua',confidence:98,bbox:{x0:1,y0:2,x1:20,y1:10}}]}};
          }};
        }""", {"pending": pending, "confidence": confidence})

    def mock_composition(self):
        self.page.route("**/api/photo/resolve", lambda r: r.fulfill(json={
            "mode": "composition", "confidence": .9,
            "ingredients": ["Aqua", "Glycerin", "Panthenol", "Unclear"],
            "entries": [{"ingredient": x, "canonicalName": x, "status": "confirmed"}
                        for x in ["Aqua", "Glycerin", "Panthenol"]]
                       + [{"raw": "Unclear", "status": "suggested"}],
            "composition": "Aqua, Glycerin, Panthenol, Unclear"
        }))

    def stage(self, state):
        self.page.wait_for_function("s => document.querySelector('#photoStatus').dataset.state === s", arg=state)

    def test_t06_unknown_never_analyzes(self):
        self.mock_ocr()
        self.upload()
        self.stage("clarification")
        self.assertEqual(self.analyze_requests, [])
        self.assertTrue(self.page.locator('#photoAnalyze').is_disabled())
        self.assertEqual(self.page.locator('#composition').input_value(), '')

    def test_t06_confirmation_and_metadata(self):
        self.mock_ocr()
        self.mock_composition()
        self.upload()
        self.stage("confirmation")
        self.assertEqual(self.analyze_requests, [])
        self.assertEqual(self.page.locator('#photoText').input_value(), 'Aqua, Glycerin, Panthenol, Unclear')
        self.page.locator('#photoAnalyze').click()
        self.page.wait_for_function("document.querySelector('#result').textContent.includes('503') || document.querySelector('#result .error') !== null")
        self.assertEqual(len(self.analyze_requests), 1)
        payload = self.analyze_requests[0]
        self.assertIn('Unclear', payload['text'])
        self.assertEqual(payload['evidence']['formula']['scope'], 'partial')
        self.assertEqual(payload['evidence']['metrics']['ocrReadability']['value'], .9)

    def test_t06_unknown_medical_ingredient_is_not_hidden_before_analysis(self):
        self.mock_ocr()
        self.page.route("**/api/photo/resolve", lambda r: r.fulfill(json={
            "mode": "composition", "confidence": .9,
            "cleanedText": "Aqua, Prilocaine Hydrochloride, Glycerin, Panthenol",
            "ingredients": ["Aqua", "Prilocaine Hydrochloride", "Glycerin", "Panthenol"],
            "entries": [
                {"raw": "Aqua", "ingredient": "Aqua", "canonicalName": "Aqua", "status": "confirmed"},
                {"raw": "Prilocaine Hydrochloride", "ingredient": "Prilocaine Hydrochloride", "status": "unknown"},
                {"raw": "Glycerin", "ingredient": "Glycerin", "canonicalName": "Glycerin", "status": "confirmed"},
                {"raw": "Panthenol", "ingredient": "Panthenol", "canonicalName": "Panthenol", "status": "confirmed"}
            ]
        }))
        self.upload()
        self.stage("confirmation")
        self.assertIn("Prilocaine Hydrochloride", self.page.locator("#photoText").input_value())
        self.page.locator("#photoAnalyze").click()
        self.page.wait_for_function("document.querySelector('#result').textContent.includes('503') || document.querySelector('#result .error') !== null")
        self.assertEqual(len(self.analyze_requests), 1)
        self.assertIn("Prilocaine Hydrochloride", self.analyze_requests[0]["text"])
        self.assertEqual(self.analyze_requests[0]["evidence"]["formula"]["scope"], "partial")

    def test_t06_clear_pending_ocr(self):
        self.mock_ocr(pending=True)
        self.mock_composition()
        self.upload()
        self.page.wait_for_function('window.ocrCalls === 1')
        self.page.locator('#photoClear').click()
        self.page.evaluate('window.finishOcr()')
        self.page.wait_for_timeout(150)
        self.assertEqual(self.page.locator('#photoText').input_value(), '')
        self.assertTrue(self.page.locator('#photoReview').is_hidden())
        self.assertEqual(self.analyze_requests, [])

    def test_t06_replacement_discards_late_text(self):
        self.mock_ocr(pending=True)
        self.upload()
        self.page.wait_for_function('window.ocrCalls === 1')
        self.mock_ocr()
        self.mock_composition()
        self.upload()
        self.stage('confirmation')
        self.page.evaluate('window.finishOcr()')
        self.page.wait_for_timeout(150)
        self.assertEqual(self.page.locator('#photoText').input_value(), 'Aqua, Glycerin, Panthenol, Unclear')
        self.assertEqual(self.analyze_requests, [])

    def test_t06_low_confidence_needs_new_photo(self):
        self.mock_ocr(confidence=30)
        self.mock_composition()
        self.upload()
        self.stage('clarification')
        self.assertTrue(self.page.locator('#photoAnalyze').is_disabled())

    def test_t06_too_many_uncertain_positions_require_a_new_photo(self):
        self.mock_ocr()
        self.page.route("**/api/photo/resolve", lambda r: r.fulfill(json={
            "mode": "composition", "confidence": .9,
            "cleanedText": "Aqua, Glycerin, Panthenol, Broken One, Broken Two",
            "ingredients": ["Aqua", "Glycerin", "Panthenol", "Broken One", "Broken Two"],
            "entries": [
                {"raw": "Aqua", "ingredient": "Aqua", "canonicalName": "Aqua", "status": "confirmed"},
                {"raw": "Glycerin", "ingredient": "Glycerin", "canonicalName": "Glycerin", "status": "confirmed"},
                {"raw": "Panthenol", "ingredient": "Panthenol", "canonicalName": "Panthenol", "status": "confirmed"},
                {"raw": "Broken One", "ingredient": "Broken One", "status": "unknown"},
                {"raw": "Broken Two", "ingredient": "Broken Two", "status": "unknown"}
            ]
        }))
        self.upload()
        self.stage("clarification")
        self.assertTrue(self.page.locator("#photoAnalyze").is_disabled())
        self.assertIn("слишком много", self.page.locator("#photoStatus").inner_text().lower())

    def test_t06_front_candidate_and_source(self):
        self.mock_ocr()
        self.page.route('**/api/photo/resolve', lambda r: r.fulfill(json={
            'mode':'product', 'composition':'Aqua, Glycerin', 'ingredients':[],
            'product':{'id':'fixture', 'name':'Test label', 'brand':'Fixture',
                       'composition':'Aqua, Glycerin', 'source':'Fixture source'}
        }))
        self.upload()
        self.stage('confirmation')
        self.assertIn('Fixture source', self.page.locator('#photoStatus').inner_text())
        self.assertIn('Test label', self.page.locator('#photoStatus').inner_text())
        self.assertEqual(self.analyze_requests, [])

    def test_t06_camera_denied(self):
        self.page.evaluate("() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('denied'); }; }")
        self.page.locator('#photoCameraOpen').click()
        self.page.wait_for_function("document.querySelector('#photoStatus').textContent.includes('Загрузить фото')")
        self.assertTrue(self.page.locator('#cameraCapture').is_hidden())
        with self.page.expect_file_chooser():
            self.page.locator('label[for="photoInput"]').click()

    def test_t06_camera_closed_before_permission(self):
        self.page.evaluate("""() => {
          window.stopped = 0;
          navigator.mediaDevices.getUserMedia = () => new Promise(r => window.allowCamera = () => r({getTracks:() => [{stop:()=>window.stopped++}]}));
        }""")
        self.page.locator('#photoCameraOpen').click()
        self.page.locator('#cameraClose').click()
        self.page.evaluate('window.allowCamera()')
        self.page.wait_for_function('window.stopped === 1')
        self.assertTrue(self.page.locator('#cameraCapture').is_hidden())

    def test_t06_camera_capture_stops_tracks(self):
        self.mock_ocr()
        self.mock_composition()
        self.page.evaluate("""() => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 40;
          canvas.getContext('2d').fillRect(0,0,40,40);
          window.testStream = canvas.captureStream(5);
          navigator.mediaDevices.getUserMedia = async () => window.testStream;
        }""")
        self.page.locator('#photoCameraOpen').click()
        self.page.wait_for_function("document.querySelector('#cameraVideo').videoWidth > 0")
        self.page.locator('#cameraShot').click()
        self.stage('confirmation')
        self.assertTrue(self.page.locator('#cameraCapture').is_hidden())
        self.assertEqual(self.page.evaluate("window.testStream.getTracks()[0].readyState"), 'ended')

    def test_t06_worker_terminated_on_clear(self):
        self.page.evaluate("""() => {
          window.workerStopped = 0; window.workerStarted = false;
          window.Tesseract = { recognize: () => {}, createWorker: async () => ({
            recognize: async () => { window.workerStarted = true; return await new Promise(r => window.finishWorker = r); },
            terminate: async () => { window.workerStopped++; }
          }) };
        }""")
        self.upload()
        self.page.wait_for_function('window.workerStarted')
        self.page.locator('#photoClear').click()
        self.page.wait_for_function('window.workerStopped > 0')
        self.page.evaluate("window.finishWorker({data:{text:'Aqua, Glycerin, Panthenol'}})")
        self.page.wait_for_timeout(100)
        self.assertTrue(self.page.locator('#photoReview').is_hidden())

    def test_t06_resolver_failure_no_local_guess(self):
        self.mock_ocr()
        self.page.route('**/api/photo/resolve', lambda r: r.fulfill(status=503, json={}))
        self.upload()
        self.stage('error')
        self.assertEqual(self.analyze_requests, [])
        self.assertEqual(self.page.locator('#composition').input_value(), '')

    def test_t06_clear_pending_resolution(self):
        self.mock_ocr()
        self.page.evaluate("""() => {
          const original = window.fetch;
          window.fetch = async (url, options) => {
            if (url === '/api/photo/resolve') {
              window.resolveStarted = true;
              await new Promise(r => window.finishResolution = r);
              return new Response(JSON.stringify({mode:'product',composition:'Aqua, Glycerin',
                product:{name:'Late card', composition:'Aqua, Glycerin',source:'fixture'}}));
            }
            return original(url, options);
          };
        }""")
        self.upload()
        self.page.wait_for_function('window.resolveStarted')
        self.page.locator('#photoClear').click()
        self.page.evaluate('window.finishResolution()')
        self.page.wait_for_timeout(100)
        self.assertTrue(self.page.locator('#photoReview').is_hidden())
        self.assertEqual(self.page.locator('#composition').input_value(), '')
        self.assertEqual(self.page.locator('#productName').input_value(), '')

    def test_t06_invalid_image_bytes(self):
        self.mock_ocr()
        self.page.locator('#photoInput').set_input_files({'name':'bad.png','mimeType':'image/png','buffer':b'not an image'})
        self.stage('error')
        self.assertEqual(self.page.evaluate('window.ocrCalls'), 0)

    def test_t06_reject_file_type_and_size(self):
        for size, mime in [(4, 'image/svg+xml'), (16*1024*1024, 'image/png')]:
            self.page.locator('#photoInput').set_input_files({'name':'bad.png','mimeType':mime,'buffer':b'x'*size})
            self.stage('error')
            self.assertEqual(self.analyze_requests, [])

    def test_t06_progress_does_not_cover_photo(self):
        self.mock_ocr()
        self.mock_composition()
        for width in [360, 390, 412, 1280]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.upload()
            self.stage('confirmation')
            status = self.page.locator('#photoStatus').bounding_box()
            image = self.page.locator('#photoPreview').bounding_box()
            self.assertLessEqual(status['y'] + status['height'], image['y'])
            self.assertTrue(self.page.locator('#photoCameraOpen').is_visible())
        self.page.screenshot(path=str(Path(__file__).with_name('t06-photo-desktop.png')))
        self.page.set_viewport_size({'width':390,'height':844})
        self.page.locator('#photoReview').scroll_into_view_if_needed()
        self.page.screenshot(path=str(Path(__file__).with_name('t06-photo-mobile.png')))


if __name__ == '__main__':
    suite = unittest.TestSuite(PhotoTests(name) for name in unittest.defaultTestLoader.getTestCaseNames(PhotoTests) if name.startswith('test_t06'))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
