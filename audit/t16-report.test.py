"""T16 report rendering checks with deterministic analysis and product fixtures."""
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


def analysis_fixture(scope="unknown"):
    return {
        "summary": "Справочный разбор доступен, но итоговая оценка готового продукта не выполнена.",
        "formulaType": "тип средства требует уточнения",
        "assessment": {"status": "not_assessed", "reason": "insufficient_formula_completeness"},
        "qualitySummary": {"methodology": "Концентрации, pH, SPF и качество сырья не определяются по INCI."},
        "productSafety": {
            "label": "тип средства требует уточнения",
            "intendedUse": "Назначение не подтверждено только по списку INCI.",
            "purposeStatus": "uncertain",
            "purposeEvidence": {"source": None},
            "shouldScoreAsCosmetic": True,
        },
        "personalization": {
            "profileProvided": False,
            "summary": "Профиль не указан. Показан общий справочный разбор.",
            "restrictions": [], "precautions": [], "potentialBenefits": [], "limitations": [],
            "usedInputs": [], "missingFields": [],
        },
        "historyPolicy": {"mode": "standard"},
        "totalIngredients": 3,
        "found": [{
            "input": "Nacinamide", "name": "Niacinamide", "status": "confirmed", "position": 2,
            "roles": ["HUMECTANT"], "dataSource": "INCI registry", "cautions": ["Концентрация в готовом продукте не указана."],
            "findings": [{
                "kind": "reference", "text": "Niacinamide: справочная функция в локальном реестре.",
                "basis": [{"title": "INCI registry", "url": "https://example.test/inci/niacinamide"}],
                "limitations": ["Справочная функция не доказывает эффект готового продукта."],
            }],
        }],
        "unknown": [{
            "input": "Hamamelis Virginiana Extract", "status": "suggested",
            "suggested_match": "Hamamelis Virginiana Leaf Extract",
        }],
        "groups": [{"role": "HUMECTANT", "items": ["Niacinamide"]}],
        "expertSummary": [], "routineAdvice": [], "questions": [], "proprietaryComplexes": [],
        "disclaimer": "Список INCI не показывает точные проценты и индивидуальную переносимость.",
        "analysisContract": {
            "product": {
                "identity": {"brand": "Fixture Lab", "name": "Calm Formula", "barcode": None, "id": "fixture"},
                "identificationStatus": "confirmed",
                "source": {"name": "Fixture source", "url": "https://example.test/product", "type": "fixture", "retrievedAt": None},
            },
            "formula": {
                "scope": scope, "version": "2026-test", "market": "EU",
                "source": {"name": "Source A", "url": "https://example.test/formula-a", "type": "fixture", "retrievedAt": None},
            },
            "metrics": {"knowledgeCoverage": {"confirmed": 1, "suggested": 1, "unknown": 0, "total": 2}},
            "ingredients": [
                {"input": "Nacinamide", "canonicalName": "Niacinamide", "status": "confirmed", "match": {"method": "alias"}},
                {"input": "Hamamelis Virginiana Extract", "canonicalName": None, "status": "suggested", "match": {"suggestedName": "Hamamelis Virginiana Leaf Extract", "method": "suggested"}},
            ],
        },
    }


class T16ReportTests(unittest.TestCase):
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

    def page_at(self, width=1280, height=900):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        self.addCleanup(context.close)
        page = context.new_page()
        errors, analysis_requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_request(route):
            url = route.request.url
            if url.endswith("/api/auth/me"):
                route.fulfill(json={"user": None})
            elif "/api/products/search" in url:
                query = url.split("q=")[-1].lower()
                scope = "partial" if "partial" in query else "full"
                product = {
                    "id": "fixture-product", "brand": "Fixture Lab", "name": "Calm Formula",
                    "composition": "Aqua, Nacinamide, Phenoxyethanol", "compositionScope": scope,
                    "source": "Source A", "sourceType": "fixture", "sourceUrl": "https://example.test/formula-a",
                    "formulaVersion": "2026-test", "market": "EU", "verified": True,
                }
                if "conflict" in query:
                    product.update({
                        "hasFormulaConflict": True,
                        "formulaConflictNote": "Найдены разные версии состава в разных источниках.",
                        "formulaVariants": [
                            {"composition": "Aqua, Nacinamide, Phenoxyethanol", "source": "Source A", "sourceType": "fixture", "sourceUrl": "https://example.test/formula-a", "market": "EU", "formulaVersion": "2025"},
                            {"composition": "Aqua, Glycerin, Phenoxyethanol", "source": "Source B", "sourceType": "fixture", "sourceUrl": "https://example.test/formula-b", "market": "RU", "formulaVersion": "2026"},
                        ],
                    })
                route.fulfill(json={"products": [product]})
            elif url.endswith("/api/analyze"):
                payload = route.request.post_data_json
                analysis_requests.append(payload)
                route.fulfill(json=analysis_fixture(payload.get("evidence", {}).get("formula", {}).get("scope", "unknown")))
            elif "/api/" in url:
                route.fulfill(json={})
            elif url.startswith(self.url):
                route.continue_()
            else:
                route.abort()

        page.route("**/*", route_request)
        page.goto(self.url, wait_until="networkidle")
        return page, errors, analysis_requests

    def analyze_product(self, page, query="Full Formula"):
        page.locator("#productName").fill(query)
        page.wait_for_selector(".suggestion")
        page.locator(".suggestion").click()
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".report-product")

    def test_report_puts_provenance_and_uncertainty_before_interpretation(self):
        page, errors, requests = self.page_at()
        self.analyze_product(page)
        text = page.locator("#result").inner_text()
        self.assertTrue(page.locator(".report-product").is_visible())
        self.assertTrue(page.locator(".report-formula").is_visible())
        self.assertIn("Источник", text)
        self.assertIn("Источник сообщил полный INCI.", text)
        self.assertLess(text.index("Позиции, которые нужно проверить"), text.index("Главное по имеющимся данным"))
        self.assertNotIn("Оценка компонентной базы", text)
        self.assertNotIn("/100", text)
        self.assertEqual(len(requests), 1)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "t16-report-desktop.png"), full_page=True)

    def test_ingredient_details_translate_function_and_keep_source_and_status(self):
        page, errors, _ = self.page_at()
        self.analyze_product(page)
        card = page.locator(".ingredient-report")
        self.assertIn("подтверждённое совпадение", card.inner_text())
        self.assertNotIn("HUMECTANT", card.inner_text())
        card.locator("summary").click()
        self.assertIn("Nacinamide", card.inner_text())
        self.assertIn("Niacinamide", card.inner_text())
        self.assertIn("увлажняющий компонент", card.inner_text())
        self.assertIn("Справочные сведения", card.inner_text())
        self.assertEqual(card.locator(".source-link").get_attribute("href"), "https://example.test/inci/niacinamide")
        self.assertIn("возможное совпадение", page.locator(".report-uncertain").inner_text())
        self.assertEqual(errors, [])

    def test_full_partial_and_unknown_formula_states_are_distinct(self):
        expectations = [
            ("Full Formula", "Источник сообщил полный INCI."),
            ("Partial Formula", "Доступен неполный фрагмент формулы."),
        ]
        for query, expected in expectations:
            with self.subTest(query=query):
                page, errors, _ = self.page_at()
                self.analyze_product(page, query)
                self.assertIn(expected, page.locator(".report-formula").inner_text())
                self.assertEqual(errors, [])

        page, errors, _ = self.page_at()
        page.locator(".manual-entry > summary").click()
        page.locator("#composition").fill("Aqua, Nacinamide, Phenoxyethanol")
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".report-formula")
        self.assertIn("Полнота состава не подтверждена источником.", page.locator(".report-formula").inner_text())
        self.assertEqual(errors, [])

    def test_filter_and_mobile_report_are_usable(self):
        page, errors, _ = self.page_at(390, 844)
        self.analyze_product(page)
        page.locator("#ingredientFilter").fill("absent")
        self.assertTrue(page.locator(".ingredient-report").is_hidden())
        self.assertIn("Показано компонентов: 0.", page.locator("#ingredientFilterStatus").inner_text())
        page.locator("#ingredientFilter").fill("niacinamide")
        self.assertTrue(page.locator(".ingredient-report").is_visible())
        page.locator(".ingredient-report").scroll_into_view_if_needed()
        state = page.locator(".ingredient-report summary").evaluate("""element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { width: rect.width, height: rect.height, receivesClick: hit === element || element.contains(hit) };
        }""")
        self.assertGreater(state["height"], 40)
        self.assertTrue(state["receivesClick"])
        self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
        self.assertEqual(errors, [])
        page.screenshot(path=str(ROOT / "audit" / "t16-report-mobile.png"), full_page=True)

    def test_conflicting_formula_versions_require_a_choice_and_stay_separate(self):
        page, errors, requests = self.page_at()
        page.locator("#productName").fill("Conflict Formula")
        page.wait_for_selector(".suggestion")
        page.locator(".suggestion").click()
        page.wait_for_selector("#formulaVariantChoices:not([hidden])")
        options = page.locator("#formulaVariantChoices [data-formula-variant-index]")
        self.assertEqual(options.count(), 2)
        self.assertEqual(page.locator("#composition").input_value(), "")
        options.nth(1).click()
        self.assertEqual(page.locator("#composition").input_value(), "Aqua, Glycerin, Phenoxyethanol")
        self.assertTrue(page.locator("#formulaVariantChoices").is_hidden())
        page.locator("#analysisForm").evaluate("element => element.requestSubmit()")
        page.wait_for_selector(".formula-versions")
        self.assertEqual(page.locator(".formula-versions [data-report-formula-index]").count(), 2)
        self.assertEqual(len(requests), 1)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
