import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "../src/analyzer.js";
import { cleanInciText } from "../src/services/inciCleaner.js";
import { searchLocalProducts } from "../src/products.js";
import { mergeSourceProducts } from "../src/services/productSources/index.js";
import { buildAnalysisReportModel } from "../public/analysis-report.js";
import { validateFormulaAssessment } from "../src/services/formulaSystems.js";
import { validateApprovedAnnotation } from "./lib/c02-corpus.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const hash = (name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex");
const rate = (n, d) => d ? n / d : null;
const tally = (values) => values.reduce((out, value) => { out[value] = (out[value] || 0) + 1; return out; }, {});
const manifest = read("audit/c02/corpus-manifest.json");
const final = manifest.entries.filter((entry) => entry.partition === "final");
const annotations = read("audit/c02/annotations.json").annotations;
const approvedGold = annotations.filter((entry) => validateApprovedAnnotation(entry).eligible);
const profile = {
  skinType: "сухая", context: "домашний уход", goals: ["hydration", "barrier"],
  applicationArea: "face", allergyStatus: "none_reported", previousReaction: "none_reported"
};

// Frozen catalog transcription is diagnostic input, never independent OCR gold.
const rows = final.map((entry) => {
  const cleaned = cleanInciText(entry.inputs.externalCatalogTranscription.text);
  const result = analyzeComposition({
    text: cleaned.ingredients.join(", "), formulaScope: "unknown", profile,
    productName: [entry.product.sourceReportedBrand, entry.product.sourceReportedName].filter(Boolean).join(" ")
  });
  const local = searchLocalProducts(entry.barcode, 8);
  return {
    id: entry.id, brand: entry.product.sourceReportedBrand,
    candidateCategory: entry.product.automatedCandidateCategory,
    ingredients: result.totalIngredients,
    confirmed: result.found.filter((item) => item.status !== "suggested").length,
    suggested: result.found.filter((item) => item.status === "suggested").length,
    unknown: result.unknown.length,
    explained: result.evidenceCoverage?.expertExplanation?.count || 0,
    reviewed: result.evidenceCoverage?.expertExplanation?.reviewedCount || 0,
    formulaStatus: result.formulaAssessment.status,
    contractValidation: validateFormulaAssessment(result.formulaAssessment),
    systemStatuses: tally(result.formulaAssessment.systems.map((system) => system.status)),
    purposeStatus: result.productSafety.purposeStatus,
    personalStatus: result.personalization.status,
    personalPotential: result.personalization.potentialBenefits.length,
    applicationAdviceAllowed: result.personalization.applicationAdviceAllowed,
    localBarcodeFound: local.some((product) => String(product.code) === entry.barcode),
    localBarcodeResultCount: local.length
  };
});
const sum = (key) => rows.reduce((n, row) => n + row[key], 0);

// Existing development controls are reported separately from held-out records.
const controls = read("audit/c03/control-queries.json");
const searchRows = controls.cases.map((test) => {
  const products = searchLocalProducts(test.query, 8);
  return { query: test.query, kind: test.kind, expectedId: test.expectedId,
    actualId: products[0]?.id || null, resultCount: products.length,
    passed: products[0]?.id === test.expectedId && (test.kind !== "barcode" || products.length === 1) };
});
const searchSafety = controls.safetyCases.map((test) => ({
  query: test.query, passed: searchLocalProducts(test.query, 8).length === 0
}));
const probes = [];
const check = (id, owner, expected, actual, passed, input) => probes.push({ id, owner, expected, actual, passed: Boolean(passed), input });
const analyze = (text, extra = {}) => analyzeComposition({ text, formulaScope: "full", ...extra });
for (const [id, text, system, members] of [
  ["lipid-hydrocarbon-silicone", "Aqua, Petrolatum, Dimethicone", "lipid_phase", 2],
  ["retinol-active", "Aqua, Retinol", "actives", 1],
  ["salicylic-active", "Aqua, Salicylic Acid", "actives", 1],
  ["mixed-active", "Aqua, Niacinamide, Retinol", "actives", 2]
]) {
  const result = analyze(text);
  const actual = buildAnalysisReportModel(result).systems.find((item) => item.id === system);
  const count = result.formulaAssessment.systems.find((item) => item.id === system).ingredientRefs.length;
  check(id, "C09", { minimumMembers: members, noFalseAbsence: true }, {
    confirmed: result.found.map((item) => ({ name: item.name, status: item.status })),
    members: count, status: actual.status, label: actual.statusLabel
  }, count >= members && actual.status !== "not_identified", { text, formulaScope: "full", synthetic: true });
}
const challenges = read("audit/c02/challenge-cases.json").cases;
const medical = analyze(challenges[0].input.formula, { profile, productName: "Face cream" });
check("anesthetic-overrides-cosmetic-name", "C07/C11", "out_of_scope, no score or routine", {
  status: medical.formulaAssessment.status, score: medical.score, routine: medical.routineAdvice,
  advice: medical.personalization.applicationAdviceAllowed
}, medical.formulaAssessment.status === "out_of_scope" && medical.score.score === null && !medical.routineAdvice.length && !medical.personalization.applicationAdviceAllowed,
{ ...challenges[0].input, productName: "Face cream" });
const partial = analyze("Niacinamide, Salicylic Acid", { formulaScope: "active_only" });
check("active-only-not-full", "C03/C09", "scope retained, no numeric score", {
  scope: partial.formulaAssessment.formulaRef.scope, score: partial.score, status: partial.formulaAssessment.status
}, partial.formulaAssessment.formulaRef.scope === "active_only" && partial.score.score === null);
const variants = challenges[2].input.formulaVariants.map((item, index) => ({
  id: `c15-fixture-${index}`, code: "1234567890123", name: "Fixture Cream", brand: "Fixture Brand",
  composition: item.formula, source: item.source, sourceType: item.source,
  sourceUrl: `https://example.test/${index}`, market: item.market
}));
const merged = mergeSourceProducts(variants);
check("conflicting-formulas-not-mixed", "C03", "two attributed variants, one unchanged composition", {
  conflict: merged[0]?.hasFormulaConflict, variants: merged[0]?.formulaVariants,
  composition: merged[0]?.composition
}, merged.length === 1 && merged[0].hasFormulaConflict && merged[0].formulaVariants.length === 2 && variants.some((item) => item.composition === merged[0].composition));
const baselinePersonal = analyze("Aqua, Glycerin, Phenoxyethanol", { profile });
const allergy = analyze("Aqua, Glycerin, Phenoxyethanol", { profile: { ...profile, allergyStatus: "reported", allergens: ["Glycerin"] } });
check("personal-allergen-priority", "C11", "blocked, no advice", {
  withoutReportedAllergen: baselinePersonal.personalization.status,
  status: allergy.personalization.status, advice: allergy.personalization.applicationAdviceAllowed,
  restrictions: allergy.personalization.restrictions.map((item) => item.ruleId)
}, baselinePersonal.personalization.status !== "blocked" && allergy.personalization.status === "blocked" && !allergy.personalization.applicationAdviceAllowed);
const uncertain = analyze("Aqua, Glycerin, Retinol, Zinc Oxide");
const model = buildAnalysisReportModel(uncertain);
check("no-invented-quantities", "C10", "no numeric score, concentrations, SPF or duration", {
  score: uncertain.score, quantitative: model.quantitative, spf: model.photoprotection.productMetrics, duration: model.duration
}, uncertain.score.score === null && !model.quantitative.length && !model.photoprotection.productMetrics.length && !model.duration.length);
const complex = analyze("Aqua, RET Complex");
check("proprietary-complex-not-active", "C05/C09", "complex separate, no confirmed active membership", {
  complexes: complex.proprietaryComplexes.map((item) => item.name),
  activeMembers: complex.formulaAssessment.systems.find((item) => item.id === "actives").ingredientRefs.length
}, complex.proprietaryComplexes.length === 1 && !complex.formulaAssessment.systems.find((item) => item.id === "actives").ingredientRefs.length);
const ocrInput = "INGREDIENTS: Aqua, Nacinamide, Phenoxyethanal. WARNING: avoid eyes. Manufacturer: ABC 123 Street";
const cleaned = cleanInciText(ocrInput);
check("ocr-text-boundaries-and-known-errors", "C04", ["Aqua", "Niacinamide", "Phenoxyethanol"], cleaned.ingredients,
  JSON.stringify(cleaned.ingredients) === JSON.stringify(["Aqua", "Niacinamide", "Phenoxyethanol"]), { text: ocrInput, synthetic: true, imageTest: false });

const files = [
  "audit/c02/corpus-manifest.json", "audit/c02/annotations.json", "audit/c03/control-queries.json",
  "src/analyzer.js", "src/services/formulaSystems.js", "src/services/expertRules.js",
  "src/services/personalization.js", "src/services/inciCleaner.js", "public/analysis-report.js",
  "data/expert-claims.json", "data/expert-card-batch-c06.json", "data/product-index.json",
  "scripts/run-c15-acceptance.mjs"
];
const report = {
  schemaVersion: "1.0", status: "partial", accepted: false,
  measuredAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch },
  hashes: Object.fromEntries(files.map((file) => [file, hash(file)])),
  method: "Offline acceptance: final catalog texts are not photo gold; no production API calls, no injected approved claims, no algorithm changes.",
  corpus: { ...manifest.counts, approvedGold: approvedGold.length,
    finalCategoryCandidates: tally(rows.map((row) => row.candidateCategory)), finalBrands: tally(rows.map((row) => row.brand)) },
  finalDiagnostics: {
    records: rows.length, ingredients: sum("ingredients"), confirmed: sum("confirmed"), suggested: sum("suggested"), unknown: sum("unknown"),
    confirmedRate: rate(sum("confirmed"), sum("ingredients")), explained: sum("explained"), reviewed: sum("reviewed"),
    reviewedRate: rate(sum("reviewed"), sum("ingredients")),
    formulaStatuses: tally(rows.map((row) => row.formulaStatus)), purposeStatuses: tally(rows.map((row) => row.purposeStatus)),
    validContracts: rows.filter((row) => row.contractValidation.valid).length,
    personalStatuses: tally(rows.map((row) => row.personalStatus)), potentialBenefitReports: rows.filter((row) => row.personalPotential > 0).length,
    adviceAllowed: rows.filter((row) => row.applicationAdviceAllowed).length,
    localBarcodeCoverage: { found: rows.filter((row) => row.localBarcodeFound).length, total: rows.length },
    rows
  },
  developmentSearch: { passed: searchRows.filter((row) => row.passed).length, total: searchRows.length,
    noResults: searchRows.filter((row) => !row.resultCount).length, cases: searchRows, safety: searchSafety },
  semanticProbes: { passed: probes.filter((probe) => probe.passed).length, total: probes.length, cases: probes },
  unmeasured: { liveSearchTop1: null, ocrPrecision: null, ocrRecall: null, photoAutoAcceptance: null,
    expertAgreement: null, purposeAccuracy: null, physicalMobileSuccess: null, noviceSuccess: null, endToEndP90: null },
  blockers: ["independent_photo_gold_missing", "domain_review_missing", "physical_devices_and_novice_users_unverified",
    "production_postgres_restore_and_mail_unverified", ...probes.filter((probe) => !probe.passed).map((probe) => probe.id)],
  reusePolicy: "No held-out results were used to tune implementation. Newly exposed counterexamples must become regression cases; replace them for later independent acceptance."
};
const output = path.join(root, "audit/c15");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, accepted: report.accepted,
  final: { ...report.finalDiagnostics, rows: undefined },
  search: { passed: report.developmentSearch.passed, total: searchRows.length },
  probes: { passed: report.semanticProbes.passed, total: probes.length }, blockers: report.blockers }, null, 2));
// A completed diagnostic run is not a passed acceptance gate.
process.exitCode = report.accepted ? 0 : 1;
