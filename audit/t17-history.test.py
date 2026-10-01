"""T17 browser checks for immutable history snapshots and explicit reanalysis."""
import json
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


def result_fixture(summary, algorithm):
    return {
        "summary": summary,
        "formulaType": "увлажняющее средство",
        "score": {"score": 7},
        "hydration_score": 6,
        "irritation_risk": 2,
        "warnings": [],
        "positives": ["Справочный вывод"],
        "found": [{"name": "Glycerin", "ru": "увлажнитель"}],
        "groups": [{"role": "HUMECTANT", "items": ["Glycerin"]}],
        "assessment": {"status": "assessed", "reason": None},
        "historyPolicy": {"mode": "standard"},
        "analysisContract": {
            "schemaVersion": "1.0",
            "algorithmVersion": algorithm,
            "generatedAt": "2026-09-30T10:00:00.000Z" if algorithm == "rules-old" else "2026-10-01T10:00:00.000Z",
            "evidenceVersions": {"rules": algorithm, "knowledge": "knowledge-v1", "registry": "registry-v1"},
            "product": {
                "identity": {"id": "fixture", "barcode": "4601234567890", "brand": "Fixture", "name": "Cream"},
                "identificationStatus": "confirmed",
                "source": {"name": "Brand card", "type": "official_brand_page", "url": "https://example.test/product", "retrievedAt": None},
            },
            "formula": {
                "scope": "full", "version": "RU 2026", "market": "RU",
                "rawText": "Aqua, Glycerin", "normalizedText": "Aqua, Glycerin",
                "source": {"name": "Brand card", "type": "official_brand_page", "url": "https://example.test/formula", "retrievedAt": None},
            },
            "metrics": {"knowledgeCoverage": {"value": 1, "status": "measured", "confirmed": 2, "suggested": 0, "unknown": 0, "total": 2}},
            "assessment": {"status": "assessed", "reason": None},
            "profile": {},
            "personalization": None,
        },
    }


def stored_records():
    old = result_fixture("ИСТОРИЧЕСКИЙ ВЫВОД", "rules-old")
    snapshot = {
        "schemaVersion": "1.0", "status": "completed", "capturedAt": "2026-09-30T10:00:00.000Z",
        "analysisContractVersion": "1.0", "algorithmVersion": "rules-old",
        "evidenceVersions": {"rules": "rules-old", "knowledge": "knowledge-v1", "registry": "registry-v1"},
        "product": old["analysisContract"]["product"],
        "formula": {**old["analysisContract"]["formula"], "composition": "Aqua, Glycerin"},
        "completeness": {"formulaScope": "full", "knowledgeCoverage": old["analysisContract"]["metrics"]["knowledgeCoverage"]},
        "confirmations": {"productIdentification": "confirmed", "assessmentStatus": "assessed", "ingredients": {"confirmed": 2, "suggested": 0, "unknown": 0, "total": 2}},
        "profile": {"stored": False, "reason": "profile_not_stored_without_explicit_consent"},
        "result": old,
    }
    return [
        {
            "kind": "analysis", "title": "Fixture Cream", "createdAt": "2026-09-30T10:00:00.000Z",
            "payload": {"snapshot": snapshot, "productName": "Fixture Cream", "source": "Brand card", "composition": "Aqua, Glycerin", "analysis": old},
        },
        {
            "kind": "analysis", "title": "Legacy Cream", "createdAt": "2025-01-01T00:00:00.000Z",
            "payload": {
                "composition": "Aqua", "profile": {"context": "PRIVATE PROFILE"},
                "imageData": "data:image/jpeg;base64,PRIVATE",
                "analysis": {"summary": "СТАРЫЙ РЕЗУЛЬТАТ", "formulaType": "крем", "warnings": [], "positives": [], "found": [], "groups": []},
            },
        },
    ]


class T17HistoryBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "public")))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/history.html"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def page_with_history(self, width=390, height=844):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        context.add_init_script(f"localStorage.setItem('analysisHistory', {json.dumps(json.dumps(stored_records()))});")
        page = context.new_page()
        errors, requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if url.endswith("/api/auth/me"):
                route.fulfill(json={"user": None})
            elif url.endswith("/api/analyze"):
                requests.append(route.request.post_data_json)
                route.fulfill(json=result_fixture("НОВЫЙ ВЫВОД", "rules-new"))
            elif "/api/" in url:
                route.fulfill(json={})
            elif url.startswith(f"http://127.0.0.1:{self.server.server_port}/"):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, errors, requests

    def test_opening_snapshot_never_recalculates_and_legacy_is_labeled(self):
        page, errors, requests = self.page_with_history()
        self.assertEqual(page.locator(".history-item").count(), 2)
        self.assertEqual(requests, [])
        page.locator(".history-item").nth(0).locator(":scope > summary").click()
        first = page.locator(".history-item").nth(0)
        self.assertIn("ИСТОРИЧЕСКИЙ ВЫВОД", first.inner_text())
        self.assertIn("rules-old", first.inner_text())
        self.assertIn("Brand card", first.inner_text())
        page.locator(".history-item").nth(1).locator(":scope > summary").click()
        self.assertIn("Старая запись", page.locator(".history-item").nth(1).inner_text())
        self.assertEqual(requests, [])
        self.assertEqual(errors, [])

    def test_reanalysis_is_explicit_and_adds_new_record_without_replacing_old(self):
        page, errors, requests = self.page_with_history()
        page.locator(".history-item").nth(0).locator(":scope > summary").click()
        button = page.locator(".history-item").nth(0).locator("[data-history-reanalyze]")
        button.scroll_into_view_if_needed()
        box = button.bounding_box()
        self.assertGreaterEqual(box["height"], 40)
        button.click()
        page.wait_for_function("localStorage.getItem('analysisHistory') && JSON.parse(localStorage.getItem('analysisHistory')).length === 3")
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["evidence"]["formula"]["source"]["name"], "Brand card")
        records = page.evaluate("JSON.parse(localStorage.getItem('analysisHistory'))")
        summaries = [item["payload"].get("snapshot", {}).get("result", item["payload"].get("analysis", {})).get("summary") for item in records]
        self.assertIn("ИСТОРИЧЕСКИЙ ВЫВОД", summaries)
        self.assertIn("НОВЫЙ ВЫВОД", summaries)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "t17-history-mobile.png"), full_page=True)

    def test_local_privacy_migration_removes_profile_and_photo(self):
        page, errors, _ = self.page_with_history(1280, 900)
        serialized = page.evaluate("localStorage.getItem('analysisHistory')")
        self.assertNotIn("PRIVATE PROFILE", serialized)
        self.assertNotIn("data:image", serialized)
        self.assertEqual(errors, [])

    def test_profile_uses_the_same_historical_snapshot(self):
        page, errors, requests = self.page_with_history(1280, 900)
        page.goto(self.url.replace("history.html", "profile.html"), wait_until="networkidle")
        self.assertEqual(page.locator(".history-item").count(), 2)
        page.locator(".history-item").nth(0).locator(":scope > summary").click()
        self.assertIn("ИСТОРИЧЕСКИЙ ВЫВОД", page.locator(".history-item").nth(0).inner_text())
        self.assertEqual(requests, [])
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
