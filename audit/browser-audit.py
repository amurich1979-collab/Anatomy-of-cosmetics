import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit'

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'public')))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f'http://127.0.0.1:{server.server_port}/'
evidence = {'scope': 'Actual UI and local assets; API failures and OCR responses deliberately mocked. No real camera/OCR accuracy claim.', 'viewports': []}

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width, height in [(360,640), (390,844), (412,915), (1440,900)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
            page = context.new_page()
            requests = []
            errors = []
            page.on('pageerror', lambda err: errors.append(str(err)))

            def route_request(route):
                request = route.request
                if '/api/' in request.url:
                    if request.method == 'POST':
                        requests.append({'url': request.url.split('/api/')[-1], 'data': request.post_data_json})
                    if '/api/analyze' in request.url:
                        route.fulfill(status=503, json={'error': 'Audit: deliberate unavailability'})
                    elif '/api/photo/resolve' in request.url:
                        route.fulfill(json={'mode':'unknown', 'confidence':0.35,
                            'ingredients':['Qwertyblender','Zxcvbnformula','Plmoknextract'],
                            'cleanedText':'Qwertyblender, Zxcvbnformula, Plmoknextract', 'composition':'',
                            'message':'Cannot identify composition reliably.'})
                    elif '/api/products/search' in request.url and 'Audit' in request.url:
                        route.fulfill(json={'products':[{'id':'audit-a','name':'Audit Formula A','brand':'Fixture',
                            'composition':'Aqua, Glycerin, Panthenol','hasComposition':True,'source':'audit fixture'}]})
                    elif '/api/auth/me' in request.url:
                        route.fulfill(json={'user':None})
                    else:
                        route.fulfill(json={'products':[], 'theme':'fresh'})
                elif not request.url.startswith(url):
                    route.abort()
                else:
                    route.continue_()

            page.route('**/*', route_request)
            page.goto(url, wait_until='networkidle')
            page.screenshot(path=str(OUT / f'home-{width}.png'), full_page=True)
            metrics = page.evaluate('''() => {
                const box = selector => {
                    const el = document.querySelector(selector);
                    const r = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                    return {visible:!!(r.width && r.height) && style.visibility !== 'hidden',
                        centerHit:hit?.id || hit?.className || null,
                        centerObstructed:!!hit && hit !== el && !el.contains(hit),
                        x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,
                        inViewport:r.top>=0 && r.bottom<=innerHeight && r.width>0,
                        display:style.display,color:style.color,background:style.backgroundColor};
                };
                return {horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
                    barcode:box('#barcodeScan'),barcodeFind:box('#barcodeApply'),
                    analyze:box('#analysisForm > button[type=submit]'),sticky:box('#mobileAnalyze'),
                    advanced:box('.advanced-options'),manual:box('.manual-entry'),
                    photo:box('#photoCameraOpen'), catalog:box('.top-catalog-link'),
                    profile:{skinType:document.querySelector('#skinType').value,
                        context:document.querySelector('#context').value,
                        concerns:document.querySelector('#concerns').value},
                    barcodeDetector: 'BarcodeDetector' in window};
            }''')
            page.locator('#barcodeScan').click()
            metrics['scanStatus'] = page.locator('#productStatus').inner_text()
            if width == 390:
                page.evaluate("document.documentElement.dataset.theme = 'dark'")
                page.screenshot(path=str(OUT / 'home-390-night.png'), full_page=True)
                page.evaluate("document.documentElement.dataset.theme = 'fresh'")
                page.evaluate("""() => {
                    document.querySelector('#composition').value = 'Aqua, Prilocaine Hydrochloride, Glycerin, Phenoxyethanol';
                    document.querySelector('#productName').value = 'Anesthetic';
                    document.querySelector('#analysisForm').requestSubmit();
                }""")
                page.locator('#result h2').first.wait_for()
                metrics['failedServerResult'] = page.locator('#result').inner_text()
                metrics['submittedRequests'] = list(requests)
                page.screenshot(path=str(OUT / 'fallback-390.png'), full_page=True)
                page.evaluate("""() => {
                    window.Tesseract = {recognize: async () => ({data:{text:'Qwertyblender, Zxcvbnformula, Plmoknextract'}})};
                    document.querySelector('#composition').value = '';
                    document.querySelector('#productName').value = '';
                }""")
                with page.expect_request('**/api/analyze') as analysis_request:
                    page.locator('#photoInput').set_input_files(str(OUT / 'home-390.png'))
                page.wait_for_load_state('networkidle')
                metrics['unknownPhotoAutoAnalyzed'] = analysis_request.value.post_data_json
                metrics['unknownPhotoStatus'] = page.locator('#photoStatus').inner_text()
                page.locator('#productName').fill('Audit')
                page.locator('.suggestion').first.click()
                page.locator('#productName').fill('Entirely different product B')
                with page.expect_request('**/api/analyze') as stale_request:
                    page.locator('#mobileAnalyze').click()
                metrics['changedProductAnalyzed'] = stale_request.value.post_data_json
                page.evaluate("document.documentElement.dataset.theme = 'dark'")
                metrics['darkAnalyzeStyle'] = page.locator('#mobileAnalyze').evaluate('el => ({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})')
            metrics['errors'] = errors
            evidence['viewports'].append({'width':width,'height':height,**metrics})
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()

(OUT / 'browser-evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps([{'width':v['width'],'barcodeY':v['barcode']['y'],
    'barcodeCenterObstructed':v['barcode']['centerObstructed'],
    'manualVisible':v['manual']['visible'],'profileVisible':v['advanced']['visible'],
    'unknownPhotoAutoAnalyzed':v.get('unknownPhotoAutoAnalyzed'),
    'changedProductAnalyzed':v.get('changedProductAnalyzed'),
    'darkAnalyzeStyle':v.get('darkAnalyzeStyle'),'errors':v['errors']} for v in evidence['viewports']],ensure_ascii=True,indent=2))
