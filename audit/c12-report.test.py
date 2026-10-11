"""C12 report UX checks with deterministic API fixtures."""
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SYSTEMS = [
    ("water_phase", "Водная основа", "reference_only"),
    ("humectants", "Увлажняющая система", "reference_only"),
    ("emollients", "Эмоленты", "not_identified"),
    ("lipid_phase", "Жировая фаза", "not_identified"),
    ("oils", "Масла", "not_identified"),
    ("barrier_lipids", "Барьерные липиды", "not_identified"),
    ("emulsification", "Эмульгаторы", "not_identified"),
    ("surfactants", "ПАВы", "not_identified"),
    ("rheology", "Реология", "not_identified"),
    ("preservation", "Консервация", "reference_only"),
    ("fragrance", "Отдушка", "not_identified"),
    ("actives", "Активы", "not_identified"),
    ("uv_filters", "SPF-фильтры", "not_identified"),
]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def analysis_fixture(composition):
    ingredients = [item.strip() for item in composition.split(",") if item.strip()]
    formula_ingredients = [
        {
            "id": f"ingredient:{index}", "input": name, "canonicalName": name,
            "position": index, "identityStatus": "confirmed", "identityKind": "ingredient",
            "suggestedMatch": None, "provenance": {}, "roleClaimIds": [],
            "limitationClaimIds": [], "quantitative": [],
        }
        for index, name in enumerate(ingredients, 1)
    ]
    systems = []
    for system_id, label, status in SYSTEMS:
        ingredient_refs = []
        if system_id == "water_phase" and formula_ingredients:
            ingredient_refs = [formula_ingredients[0]["id"]]
        if system_id == "humectants" and len(formula_ingredients) > 1:
            ingredient_refs = [formula_ingredients[1]["id"]]
        if system_id == "preservation" and len(formula_ingredients) > 2:
            ingredient_refs = [formula_ingredients[-1]["id"]]
        systems.append({
            "id": system_id, "label": label, "status": status,
            "ingredientRefs": ingredient_refs, "roleClaimIds": [],
            "assessmentClaimIds": [], "cautionClaimIds": [],
            "unknownClaimIds": [], "requiredInputs": ["verifiedProductData"],
        })

    return {
        "summary": "Назначение подтверждено карточкой; доступен справочный разбор полного INCI.",
        "formulaType": "увлажняющий крем",
        "assessment": {"status": "not_assessed", "reason": "unvalidated_scoring_method"},
        "qualitySummary": {"methodology": "Качество сырья не определяется по INCI."},
        "productSafety": {
            "label": "увлажняющий крем", "intendedUse": "Уход за кожей лица.",
            "purposeStatus": "confirmed_manufacturer", "shouldScoreAsCosmetic": True,
            "purposeEvidence": {"source": {"name": "Fixture brand", "url": "https://example.test/product"}},
            "application": "По инструкции производителя.",
        },
        "personalization": {
            "profileProvided": False, "summary": "Профиль не указан. Показан общий разбор.",
            "restrictions": [], "precautions": [], "potentialBenefits": [], "limitations": [],
            "usedInputs": [], "missingFields": [],
        },
        "historyPolicy": {"mode": "standard"},
        "totalIngredients": len(ingredients),
        "found": [
            {"input": name, "name": name, "status": "confirmed", "position": index,
             "roles": [], "dataSource": "Fixture registry", "cautions": [], "findings": []}
            for index, name in enumerate(ingredients, 1)
        ],
        "unknown": [], "groups": [], "routineAdvice": [], "questions": [],
        "proprietaryComplexes": [],
        "disclaimer": "Разбор не гарантирует безопасность или переносимость.",
        "formulaAssessment": {
            "schemaVersion": "1.0", "status": "partial",
            "formulaRef": {"scope": "full", "confirmation": "source_declared", "unresolvedIngredientRefs": []},
            "purpose": {"status": "confirmed_manufacturer"},
            "summary": {"claimIds": ["claim:purpose"]}, "systems": systems,
            "ingredients": formula_ingredients, "quantitative": [],
            "photoprotection": {"filters": [], "productMetrics": [], "instructionClaimIds": [], "unknownClaimIds": []},
            "duration": [],
            "tolerability": {"irritationClaimIds": [], "sensitizationClaimIds": [], "manufacturerHypoallergenicClaimIds": [], "unknownClaimIds": []},
            "personalFit": {"status": "general_only", "goalMatchClaimIds": [], "precautionClaimIds": [], "restrictionClaimIds": [], "unknownClaimIds": [], "missingInputs": [], "missingInputsByConclusion": [], "safetyEstablished": False, "applicationAdviceAllowed": False},
            "claims": [{"id": "claim:purpose", "text": "Назначение подтверждено карточкой производителя.", "basis": [{"sourceId": "source:fixture"}]}],
            "sources": [{"id": "source:fixture", "title": "Fixture brand", "url": "https://example.test/product", "checkedScope": "product identity and purpose"}],
            "limitations": [], "versions": {"engine": "test"},
        },
        "analysisContract": {
            "product": {"identity": {"brand": "Fixture", "name": "Calm Cream"}, "identificationStatus": "confirmed"},
            "formula": {"scope": "full", "confirmation": "source_declared", "associationStatus": "confirmed", "source": {"name": "Fixture brand", "url": "https://example.test/product"}, "version": "2026", "market": "RU"},
            "metrics": {"knowledgeCoverage": {"confirmed": len(ingredients), "suggested": 0, "unknown": 0, "total": len(ingredients)}},
            "ingredients": [{"input": name, "status": "confirmed"} for name in ingredients],
        },
    }


class C12ReportTests(unittest.TestCase):
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

    def page_at(self, analyze_failure=None, width=1280, height=900):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        page = context.new_page()
        requests, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if url.endswith("/api/auth/me"):
                route.fulfill(json={"user": None})
            elif url.endswith("/api/analyze"):
                payload = route.request.post_data_json
                requests.append(payload)
                if analyze_failure and analyze_failure(payload):
                    route.fulfill(status=500, json={"error": "fixture failure"})
                else:
                    route.fulfill(json=analysis_fixture(payload["text"]))
            elif "/api/" in url:
                route.fulfill(json={})
            elif url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, requests, errors

    def analyze_manual(self, page, composition="Aqua, Glycerin, Phenoxyethanol"):
        page.locator(".manual-entry > summary").click()
        page.locator("#composition").fill(composition)
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".report-overview")

    def test_two_reading_levels_and_complete_detailed_contract(self):
        page, requests, errors = self.page_at()
        self.analyze_manual(page)
        self.assertTrue(page.locator(".report-overview").is_visible())
        self.assertTrue(page.locator("#reportDetails").is_hidden())
        self.assertEqual(page.locator(".report-summary").count(), 1)
        self.assertEqual(page.locator(".report-facts li").count(), 4)

        page.locator('[data-report-view="details"]').click()
        self.assertTrue(page.locator("#reportDetails").is_visible())
        self.assertEqual(page.locator(".report-system").count(), 13)
        text = page.locator("#reportDetails").inner_text()
        self.assertIn("Не выявлено в полном INCI", text)
        self.assertIn("Точные проценты компонентов и pH не определены", text)
        self.assertIn("SPF, UVA-PF, спектр готового продукта", text)
        self.assertIn("Продолжительность действия не установлена", text)
        self.assertIn("назвать продукт гипоаллергенным", text)
        self.assertIn("Справочная функция ингредиента не доказывает назначение", text)
        self.assertEqual(len(requests), 1)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "c12-report-desktop.png"), full_page=True)

    def test_edit_recalculate_and_history_use_the_correct_formula(self):
        page, requests, errors = self.page_at(width=390, height=844)
        self.analyze_manual(page)
        page.locator("#editAnalyzedComposition").click()
        self.assertTrue(page.locator(".manual-entry").get_attribute("open") is not None)
        self.assertEqual(page.evaluate("document.activeElement.id"), "composition")
        page.locator("#composition").fill("Aqua, Niacinamide, Phenoxyethanol")
        self.assertEqual(page.locator(".report-overview").count(), 0)
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".report-overview")
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[-1]["text"], "Aqua, Niacinamide, Phenoxyethanol")
        history = page.evaluate("JSON.parse(localStorage.getItem('analysisHistory') || '[]')")
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["payload"]["composition"], "Aqua, Niacinamide, Phenoxyethanol")
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "c12-report-mobile.png"), full_page=True)

    def test_request_error_replaces_previous_recommendation(self):
        page, requests, errors = self.page_at(lambda payload: "Errorium" in payload.get("text", ""))
        self.analyze_manual(page)
        page.locator("#editAnalyzedComposition").click()
        page.locator("#composition").fill("Aqua, Errorium")
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".analysis-failure")
        self.assertEqual(page.locator(".report-overview").count(), 0)
        self.assertIn("Разбор не выполнен", page.locator("#result").inner_text())
        self.assertEqual(len(requests), 2)
        self.assertEqual(errors, [])

    def test_product_change_clears_the_previous_result(self):
        page, requests, errors = self.page_at()
        self.analyze_manual(page)
        self.assertEqual(page.locator(".report-overview").count(), 1)
        page.locator("#productName").fill("Другой продукт")
        self.assertEqual(page.locator(".report-overview").count(), 0)
        self.assertEqual(page.locator("#result").inner_text(), "")
        self.assertEqual(len(requests), 1)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
