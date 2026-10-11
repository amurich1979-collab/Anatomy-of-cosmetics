import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "../src/analyzer.js";
import { cleanInciText } from "../src/services/inciCleaner.js";
import { compareIngredientLists, ratio, stableHash, stableJson, validateApprovedAnnotation } from "./lib/c02-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C02 = path.join(ROOT, "audit", "c02");
const read = (name) => JSON.parse(fs.readFileSync(path.join(C02, name), "utf8"));
const manifest = read("corpus-manifest.json");
const annotations = read("annotations.json");
const predictions = read("ocr-predictions.json");
const challenges = read("challenge-cases.json");
const annotationById = new Map(annotations.annotations.map((item) => [item.id, item]));
const predictionById = new Map(predictions.predictions.map((item) => [item.id, item]));
const approved = [];
const invalidApproved = [];

for (const annotation of annotations.annotations) {
  const validation = validateApprovedAnnotation(annotation);
  if (validation.eligible) approved.push(annotation);
  else if (annotation.status === "approved") invalidApproved.push({ id: annotation.id, reasons: validation.reasons });
}

const splitLeakage = (() => {
  const setup = new Set(manifest.entries.filter((item) => item.partition === "setup").map((item) => item.splitGroup));
  return [...new Set(manifest.entries.filter((item) => item.partition === "final" && setup.has(item.splitGroup)).map((item) => item.splitGroup))];
})();
const duplicate = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const identificationReviewed = approved.filter((item) => ["exact", "incorrect"].includes(item.identity.sourceIdentityAssessment));
const identificationExact = identificationReviewed.filter((item) => item.identity.sourceIdentityAssessment === "exact").length;
const completenessReviewed = approved.filter((item) => item.formula.scope);

let tp = 0;
let fp = 0;
let fn = 0;
let ocrRecords = 0;
for (const annotation of approved) {
  const prediction = predictionById.get(annotation.id);
  if (!prediction || !Array.isArray(prediction.ingredients)) continue;
  const comparison = compareIngredientLists(annotation.formula.ingredients, prediction.ingredients);
  tp += comparison.truePositive;
  fp += comparison.falsePositive;
  fn += comparison.falseNegative;
  ocrRecords += 1;
}

const diagnosticRows = manifest.entries.map((entry) => {
  const sourceText = entry.inputs.externalCatalogTranscription.text;
  const cleaned = cleanInciText(sourceText);
  const analysis = analyzeComposition({
    text: cleaned.ingredients.join(", "),
    productName: [entry.product.sourceReportedBrand, entry.product.sourceReportedName].filter(Boolean).join(" "),
    formulaScope: "unknown"
  });
  const confirmed = analysis.found.filter((item) => item.status !== "suggested").length;
  const suggested = analysis.found.length - confirmed;
  return {
    id: entry.id,
    ingredients: analysis.totalIngredients,
    confirmed,
    suggested,
    unknown: analysis.unknown.length,
    expertExplained: analysis.evidenceCoverage?.expertExplanation?.count || 0,
    expertReviewed: analysis.evidenceCoverage?.expertExplanation?.reviewedCount || 0
  };
});
const sum = (key) => diagnosticRows.reduce((total, item) => total + item[key], 0);
const totalIngredients = sum("ingredients");
const categoryCounts = Object.fromEntries([...new Set(manifest.entries.map((item) => item.product.automatedCandidateCategory))].sort().map((category) => [category, manifest.entries.filter((item) => item.product.automatedCandidateCategory === category).length]));
const scopeCounts = Object.fromEntries(["full", "partial", "active_only", "unknown"].map((scope) => [scope, completenessReviewed.filter((item) => item.formula.scope === scope).length]));

const blockers = [];
if (approved.length < manifest.targets.independentManualPhotoTranscriptions) blockers.push({
  code: "independent_manual_gold_shortfall",
  severity: "external_blocker",
  current: approved.length,
  required: manifest.targets.independentManualPhotoTranscriptions,
  action: "An independent reviewer must transcribe ingredient photos using docs/C02_ANNOTATION_GUIDE.md."
});
if (manifest.counts.locallyArchivedIngredientPhotos < manifest.targets.independentManualPhotoTranscriptions) blockers.push({
  code: "local_photo_archive_shortfall",
  severity: "external_blocker",
  current: manifest.counts.locallyArchivedIngredientPhotos,
  remoteCandidates: manifest.counts.remoteIngredientPhotos,
  required: manifest.targets.independentManualPhotoTranscriptions,
  action: "Archive licensed source images with attribution or retain verifiable source URLs during manual review."
});

const report = {
  schemaVersion: "1.0",
  corpusId: manifest.corpusId,
  evaluatedInputHash: stableHash({ manifest, annotations, predictions, challenges }),
  measuredAt: manifest.builtAt,
  status: blockers.length ? "instrument_ready_external_review_blocked" : "measured",
  reproducibility: {
    sourceSnapshotHash: manifest.sourceSnapshotHash,
    manifestHash: stableHash(manifest),
    annotationHash: stableHash(annotations),
    deterministicOfflineBuild: true,
    splitLeakageGroups: splitLeakage
  },
  corpusQuality: {
    products: manifest.entries.length,
    uniqueIds: new Set(manifest.entries.map((item) => item.id)).size,
    uniqueBarcodes: new Set(manifest.entries.map((item) => item.barcode)).size,
    duplicateIds: [...new Set(duplicate(manifest.entries.map((item) => item.id)))],
    duplicateBarcodes: [...new Set(duplicate(manifest.entries.map((item) => item.barcode)))],
    setup: manifest.entries.filter((item) => item.partition === "setup").length,
    final: manifest.entries.filter((item) => item.partition === "final").length,
    remoteIngredientPhotos: manifest.counts.remoteIngredientPhotos,
    localIngredientPhotos: manifest.counts.locallyArchivedIngredientPhotos,
    knownDataRights: manifest.entries.filter((item) => item.provenance.dataLicense).length,
    knownImageRights: manifest.entries.filter((item) => item.provenance.imageLicense).length,
    sourceNamePresent: manifest.entries.filter((item) => item.product.sourceReportedName).length,
    sourceBrandPresent: manifest.entries.filter((item) => item.product.sourceReportedBrand).length,
    sourceMarketPresent: manifest.entries.filter((item) => item.product.sourceReportedMarkets.length).length,
    sourceModifiedDatePresent: manifest.entries.filter((item) => item.provenance.sourceModifiedAt).length,
    reviewedPurposePresent: approved.filter((item) => item.purpose).length,
    reviewedCategoryPresent: approved.filter((item) => item.category).length,
    reviewedMarketPresent: approved.filter((item) => item.market).length,
    categoryCandidateDistribution: categoryCounts,
    invalidApprovedAnnotations: invalidApproved
  },
  identification: {
    sourceCandidateCoverage: {
      barcode: { numerator: manifest.entries.filter((item) => item.barcode).length, denominator: manifest.entries.length, rate: ratio(manifest.entries.filter((item) => item.barcode).length, manifest.entries.length) },
      name: { numerator: manifest.entries.filter((item) => item.product.sourceReportedName).length, denominator: manifest.entries.length, rate: ratio(manifest.entries.filter((item) => item.product.sourceReportedName).length, manifest.entries.length) },
      brand: { numerator: manifest.entries.filter((item) => item.product.sourceReportedBrand).length, denominator: manifest.entries.length, rate: ratio(manifest.entries.filter((item) => item.product.sourceReportedBrand).length, manifest.entries.length) }
    },
    humanReviewedAccuracy: {
      numerator: identificationExact,
      denominator: identificationReviewed.length,
      rate: ratio(identificationExact, identificationReviewed.length),
      status: identificationReviewed.length ? "measured" : "not_evaluated"
    },
    warning: "Source field presence is coverage, not identification accuracy. Accuracy uses approved independent review only."
  },
  formulaCompleteness: {
    reviewedRecords: completenessReviewed.length,
    distribution: scopeCounts,
    status: completenessReviewed.length ? "measured" : "not_evaluated",
    warning: "Catalog text is not assumed to be a full formula. Scope remains unknown until photo review."
  },
  ocr: {
    goldRecords: approved.length,
    predictedGoldRecords: ocrRecords,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    status: ocrRecords ? "measured_against_independent_manual_gold" : "not_evaluated",
    warning: "External catalog transcription and cleaner output are excluded from OCR gold."
  },
  referenceCoverageDiagnostic: {
    status: "diagnostic_external_catalog_text_not_gold",
    records: diagnosticRows.length,
    ingredients: totalIngredients,
    confirmed: sum("confirmed"),
    suggested: sum("suggested"),
    unknown: sum("unknown"),
    confirmedRate: ratio(sum("confirmed"), totalIngredients),
    warning: "Measures name recognition on source-reported catalog text; it is not OCR accuracy or formula correctness."
  },
  expertCoverageDiagnostic: {
    status: "diagnostic_external_catalog_text_not_gold",
    denominator: totalIngredients,
    explained: sum("expertExplained"),
    domainReviewed: sum("expertReviewed"),
    explainedRate: ratio(sum("expertExplained"), totalIngredients),
    domainReviewedRate: ratio(sum("expertReviewed"), totalIngredients),
    warning: "Name recognition, expert explanation and domain-reviewed explanation are separate measurements."
  },
  challengeCoverage: {
    records: challenges.cases.length,
    byType: Object.fromEntries([...new Set(challenges.cases.map((item) => item.type))].sort().map((type) => [type, challenges.cases.filter((item) => item.type === type).length])),
    note: "These are fixed acceptance fixtures. Current application outputs are not copied into expected values."
  },
  externalBlockers: blockers
};

fs.writeFileSync(path.join(C02, "quality-report.json"), stableJson(report), "utf8");
const markdown = `# C02 corpus quality report\n\n- Status: \`${report.status}\`\n- Products: ${report.corpusQuality.products} (${report.corpusQuality.setup} setup / ${report.corpusQuality.final} final)\n- Remote ingredient photos: ${report.corpusQuality.remoteIngredientPhotos}\n- Approved independent photo transcriptions: ${report.ocr.goldRecords}/${manifest.targets.independentManualPhotoTranscriptions}\n- OCR metric: ${report.ocr.status}\n- Formula completeness metric: ${report.formulaCompleteness.status}\n- Identification accuracy: ${report.identification.humanReviewedAccuracy.status}\n- Reference coverage diagnostic: ${report.referenceCoverageDiagnostic.confirmedRate ?? "n/a"}\n- Domain-reviewed expert coverage diagnostic: ${report.expertCoverageDiagnostic.domainReviewedRate ?? "n/a"}\n\n## External blockers\n\n${blockers.length ? blockers.map((item) => `- \`${item.code}\`: ${item.current}/${item.required}. ${item.action}`).join("\n") : "None."}\n\nThe JSON file is authoritative and contains denominators, warnings and data-quality counts.\n`;
fs.writeFileSync(path.join(C02, "quality-report.md"), markdown, "utf8");
console.log(JSON.stringify({ status: report.status, corpus: report.corpusQuality.products, approvedGold: approved.length, ocr: report.ocr.status, blockers: blockers.map((item) => item.code) }, null, 2));
