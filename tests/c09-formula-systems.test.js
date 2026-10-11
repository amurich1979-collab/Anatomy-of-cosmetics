import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { buildFormulaAssessment, FORMULA_SYSTEMS_ENGINE_VERSION, validateFormulaAssessment } from "../src/services/formulaSystems.js";
import { buildAnalysisHistoryEntry, inspectAnalysisHistoryEntry } from "../public/history-snapshot.js";
import { buildAnalysisReportModel } from "../public/analysis-report.js";

const analyze = (text, options = {}) => analyzeComposition({
  text,
  formulaScope: "full",
  productName: "Test product",
  ...options
});

const system = (result, id) => result.formulaAssessment.systems.find((item) => item.id === id);
const claimTexts = (result, ids) => ids.map((id) => result.formulaAssessment.claims.find((claim) => claim.id === id)?.text || "");

test("C09: output contains all stable systems, resolved references and no arbitrary score", () => {
  const result = analyze("Aqua, Glycerin, Glyceryl Stearate, Carbomer, Phenoxyethanol, Parfum", {
    formulaEvidence: {
      version: "RU-2026",
      confirmation: "source_declared",
      source: { name: "Package label", type: "package_label", retrievedAt: "2026-10-05T08:00:00.000Z" }
    }
  });
  const assessment = result.formulaAssessment;
  assert.equal(assessment.schemaVersion, "1.0");
  assert.equal(assessment.systems.length, 13);
  assert.equal(validateFormulaAssessment(assessment).valid, true);
  assert.equal(assessment.formulaRef.version, "RU-2026");
  assert.ok(assessment.formulaRef.sourceId);
  assert.ok(assessment.sources.some((source) => source.id === assessment.formulaRef.sourceId));
  assert.equal(assessment.quantitative.length, 0);
  assert.deepEqual(assessment.duration, []);
  assert.equal(result.score.score, null);
  assert.equal(result.hydration_score, null);
  assert.equal(result.irritation_risk, null);
  assert.equal(assessment.versions.ruleSetReviewStatus, "pending");
  assert.equal(assessment.versions.ruleSetTextsEnabled, false);
  assert.equal(system(result, "water_phase").status, "reference_only");
  assert.equal(system(result, "humectants").status, "reference_only");
  assert.equal(system(result, "emulsification").status, "reference_only");
  assert.equal(system(result, "preservation").status, "reference_only");
  assert.equal(system(result, "fragrance").status, "reference_only");
  const allText = assessment.claims.map((claim) => claim.text).join(" ");
  assert.match(allText, /не подтверждает микробиологическую защиту|challenge-test/i);
  assert.match(allText, /гипоаллергенность.*не установлены/i);
  assert.doesNotMatch(allText, /гарантированно устойчив|прош[её]л challenge-test|гипоаллергенен/i);
});

test("C09: a multifunctional ingredient cannot change product purpose", () => {
  const result = analyze("Aqua, Glycerin, Cetearyl Alcohol, Petrolatum", {
    productName: "Daily face cream"
  });
  assert.equal(result.productSafety.type, "barrier_moisturizer");
  assert.notEqual(result.productSafety.type, "hair_scalp");
  assert.equal(system(result, "humectants").ingredientRefs.length, 1);
  assert.doesNotMatch(result.formulaAssessment.purpose.category, /hair/i);
});

test("C09: rinse-off context changes interpretation but not source identity", () => {
  const formula = "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin";
  const cleanser = analyze(formula, {
    productName: "Official cleanser",
    productEvidence: {
      identificationStatus: "confirmed",
      name: "Official cleanser",
      category: "Facial cleanser",
      useInstructions: "Massage and rinse with water.",
      source: { name: "Official brand", type: "official_brand_page", url: "https://brand.example/cleanser" }
    }
  });
  const cream = analyze(formula, { productName: "Face cream" });
  const cleanserSystem = system(cleanser, "surfactants");
  const creamSystem = system(cream, "surfactants");
  assert.equal(cleanser.productSafety.exposure.mode, "rinse_off");
  assert.deepEqual([...cleanserSystem.ingredientRefs].sort(), [...creamSystem.ingredientRefs].sort());
  assert.match(claimTexts(cleanser, cleanserSystem.roleClaimIds).join(" "), /смываемом контексте.*очищающая роль/i);
  assert.match(claimTexts(cream, creamSystem.roleClaimIds).join(" "), /не устанавливает очищающее назначение/i);
  assert.equal(cleanserSystem.status, "reference_only");
  assert.equal(creamSystem.status, "reference_only");
});

test("C09: ingredient order never creates percentages or changes system meaning", () => {
  const first = analyze("Aqua, Glycerin, Glyceryl Stearate, Phenoxyethanol");
  const second = analyze("Phenoxyethanol, Glyceryl Stearate, Glycerin, Aqua");
  const projection = (result) => result.formulaAssessment.systems.map((item) => ({
    id: item.id,
    status: item.status,
    ingredients: item.ingredientRefs.map((ref) => result.formulaAssessment.ingredients.find((entry) => entry.id === ref)?.canonicalName).sort()
  }));
  assert.deepEqual(projection(first), projection(second));
  assert.deepEqual(first.formulaAssessment.quantitative, []);
  assert.deepEqual(second.formulaAssessment.quantitative, []);
});

test("C15 regression: identified hydrocarbons, silicones, esters and waxes remain visible in lipid phase", () => {
  const result = analyze("Aqua, Petrolatum, Dimethicone, Caprylic/Capric Triglyceride, Cetearyl Ethylhexanoate, Cera Alba, Paraffinum Liquidum");
  const lipids = system(result, "lipid_phase");
  const names = lipids.ingredientRefs.map((ref) => result.formulaAssessment.ingredients.find((entry) => entry.id === ref)?.canonicalName);
  assert.equal(lipids.status, "reference_only");
  assert.deepEqual(names, ["Petrolatum", "Dimethicone", "Caprylic/Capric Triglyceride", "Cetearyl Ethylhexanoate", "Cera Alba", "Paraffinum Liquidum"]);
  const roles = claimTexts(result, lipids.roleClaimIds).join(" ");
  assert.match(roles, /углеводород/i);
  assert.match(roles, /силикон/i);
  assert.match(roles, /триглицерид/i);
  assert.match(roles, /эфир/i);
  assert.match(roles, /воск/i);
  assert.equal(lipids.assessmentClaimIds.length, 0);
  assert.equal(result.formulaAssessment.quantitative.length, 0);
  assert.equal(system(result, "oils").ingredientRefs.length, 0);
});

test("C15 regression: confirmed active candidates are listed without claiming product efficacy", () => {
  const result = analyze("Aqua, Niacinamide, Retinol, Salicylic Acid");
  const actives = system(result, "actives");
  const names = actives.ingredientRefs.map((ref) => result.formulaAssessment.ingredients.find((entry) => entry.id === ref)?.canonicalName);
  assert.deepEqual(names, ["Niacinamide", "Retinol", "Salicylic Acid"]);
  assert.equal(actives.status, "reference_only");
  assert.deepEqual(actives.assessmentClaimIds, []);
  assert.equal(result.score.score, null);
  assert.match(claimTexts(result, actives.roleClaimIds).join(" "), /эффект.*не подтвержд|эффект.*не установлен/i);
});

test("C15 regression: uncertain names and functional acids are not upgraded to active identities", () => {
  const onlyFunctional = analyze("Aqua, Citric Acid, Sodium Hydroxide, PEG-40 Hydrogenated Castor Oil, RET Complex");
  assert.equal(system(onlyFunctional, "actives").ingredientRefs.length, 0);
  assert.equal(system(onlyFunctional, "oils").ingredientRefs.length, 0);
  assert.equal(system(onlyFunctional, "lipid_phase").ingredientRefs.length, 0);
  assert.equal(onlyFunctional.proprietaryComplexes.length, 1);

  const suggested = buildFormulaAssessment({
    found: [{ input: "Retinnol", name: "Retinol", status: "suggested", position: 1, suggested_match: "Retinol", findings: [] }],
    formulaScope: "full",
    productSafety: { type: "unknown_cosmetic", shouldScoreAsCosmetic: true, purposeStatus: "uncertain" }
  });
  assert.equal(suggested.systems.find((entry) => entry.id === "actives").ingredientRefs.length, 0);
  assert.equal(suggested.systems.find((entry) => entry.id === "actives").status, "insufficient_data");
  const displayed = buildAnalysisReportModel({ formulaAssessment: suggested }).systems.find((entry) => entry.id === "actives");
  assert.equal(displayed.status, "insufficient_data");
  assert.doesNotMatch(`${displayed.statusLabel} ${displayed.explanation}`, /не выявлено/i);
});

test("C09: identical input produces a deterministic formula assessment", () => {
  const input = {
    text: "Aqua, Glycerin, Glyceryl Stearate, Phenoxyethanol",
    formulaScope: "full",
    productName: "Daily cream"
  };
  assert.deepEqual(analyzeComposition(input).formulaAssessment, analyzeComposition(input).formulaAssessment);
});

test("C09: incomplete formula preserves references and cannot prove an absent system", () => {
  const result = analyzeComposition({
    text: "Aqua, Glycerin, Unresolvedium",
    formulaScope: "partial",
    productName: "Partial label"
  });
  assert.equal(result.formulaAssessment.status, "partial");
  assert.equal(system(result, "humectants").status, "reference_only");
  assert.equal(system(result, "preservation").status, "insufficient_data");
  assert.ok(result.formulaAssessment.formulaRef.unresolvedIngredientRefs.length);
  assert.ok(system(result, "preservation").unknownClaimIds.includes("claim:formula-incomplete"));
});

test("C09: medical formulas remain out of scope while ingredient references stay separate", () => {
  const result = analyze("Aqua, Lidocaine, Prilocaine, Carbomer", { productName: "Numbing cream" });
  assert.equal(result.formulaAssessment.status, "out_of_scope");
  assert.equal(result.formulaAssessment.purpose.productClass, "medical_or_procedural");
  assert.equal(system(result, "water_phase").status, "reference_only");
  assert.equal(system(result, "preservation").status, "not_applicable");
  assert.ok(result.formulaAssessment.systems.every((item) => item.assessmentClaimIds.length === 0));
  assert.deepEqual(result.routineAdvice, []);
});

test("C09: UV filter identity does not turn decorative makeup into sunscreen or create SPF", () => {
  const result = analyze("Aqua, Dimethicone, Titanium Dioxide, Iron Oxides, Glycerin", {
    productName: "Decorative foundation"
  });
  assert.equal(result.productSafety.type, "decorative_cosmetic");
  assert.equal(system(result, "uv_filters").status, "reference_only");
  assert.deepEqual(result.formulaAssessment.photoprotection.productMetrics, []);
  assert.match(claimTexts(result, system(result, "uv_filters").roleClaimIds).join(" "), /не назначает продукту солнцезащитное применение/i);
});

test("C09: only a verified, approved, context-matching claim can describe a system", () => {
  const registryHash = "a".repeat(64);
  const approved = buildFormulaAssessment({
    formulaScope: "full",
    productSafety: {
      type: "barrier_moisturizer",
      label: "увлажняющий крем",
      shouldScoreAsCosmetic: true,
      purposeStatus: "confirmed_manufacturer",
      intendedUse: "Назначение подтверждено производителем: увлажняющий крем.",
      exposure: { mode: "leave_on" }
    },
    found: [{
      input: "Glycerin", name: "Glycerin", status: "confirmed", position: 1,
      findings: [
        {
          kind: "reference", ruleId: "reference.cosing.humectants",
          basis: [{ type: "local_registry", file: "data/inci-registry.json", sha256: registryHash, record: "Glycerin" }]
        },
        {
          kind: "expert", ruleId: "literature.glycerin.hydration", version: "test-fixture-1",
          text: "TEST FIXTURE ONLY: ограниченное наблюдение для исследованной формулы.",
          review: { status: "approved", reviewerId: "fixture-reviewer" }, evidenceStatus: "verified",
          applicability: { status: "context_matches" }, conclusionSupported: true,
          conditions: { usage: "leave_on" }, limitations: ["Не подтверждает эффект текущего продукта."],
          basis: [{ type: "study", url: "https://example.test/study", locator: "fixture abstract" }]
        }
      ]
    }],
    evidenceVersions: { knowledge: "fixture", knowledgeSha256: "b".repeat(64), registrySha256: registryHash }
  });
  const humectants = approved.systems.find((item) => item.id === "humectants");
  assert.equal(approved.status, "described");
  assert.equal(humectants.status, "described");
  assert.equal(humectants.assessmentClaimIds.length, 1);
  assert.equal(approved.claims.find((claim) => claim.id === humectants.assessmentClaimIds[0]).verification, "expert_reviewed");

  const pending = structuredClone(approved);
  const sourceItem = [{
    input: "Glycerin", name: "Glycerin", status: "confirmed", position: 1,
    findings: [{ kind: "reference", ruleId: "reference.cosing.humectants", basis: [{ type: "local_registry", sha256: registryHash, record: "Glycerin" }] },
      { kind: "expert", ruleId: "literature.glycerin.hydration", review: { status: "pending" }, evidenceStatus: "review_required", applicability: { status: "context_matches" }, conclusionSupported: false, text: "Pending", basis: [] }]
  }];
  const notApproved = buildFormulaAssessment({ found: sourceItem, formulaScope: "full", productSafety: { type: "barrier_moisturizer", shouldScoreAsCosmetic: true, purposeStatus: "confirmed_manufacturer", exposure: { mode: "leave_on" } } });
  assert.equal(notApproved.systems.find((item) => item.id === "humectants").status, "reference_only");
  assert.equal(notApproved.systems.find((item) => item.id === "humectants").assessmentClaimIds.length, 0);
  assert.notDeepEqual(pending, notApproved);
});

test("C09: history stores the exact new snapshot and old records are not reinterpreted", () => {
  const analysis = analyze("Aqua, Glycerin, Phenoxyethanol");
  analysis.analysisContract = {
    schemaVersion: "1.0", algorithmVersion: "analyzer-v6-system-analysis", generatedAt: "2026-10-05T10:00:00.000Z",
    evidenceVersions: analysis.evidenceVersions,
    product: { identity: {}, identificationStatus: "unknown", source: {}, purpose: {} },
    formula: { scope: "full", rawText: "Aqua, Glycerin, Phenoxyethanol", source: {} },
    metrics: { knowledgeCoverage: {} }, assessment: analysis.assessment, profile: {}
  };
  const entry = buildAnalysisHistoryEntry({ text: "Aqua, Glycerin, Phenoxyethanol" }, analysis, "", { capturedAt: "2026-10-05T10:00:00.000Z" });
  const reopened = inspectAnalysisHistoryEntry(entry);
  assert.deepEqual(reopened.analysis.formulaAssessment, analysis.formulaAssessment);
  assert.equal(reopened.snapshot.evidenceVersions.systems, FORMULA_SYSTEMS_ENGINE_VERSION);

  const legacy = inspectAnalysisHistoryEntry({ payload: { analysis: { summary: "Old result" }, composition: "Aqua" } });
  assert.equal(legacy.status, "legacy");
  assert.equal(legacy.analysis.formulaAssessment, undefined);
});
