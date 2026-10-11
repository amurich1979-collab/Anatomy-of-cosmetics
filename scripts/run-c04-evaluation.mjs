import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
const percent = (value) => value == null ? "not evaluated" : `${(value * 100).toFixed(2)}%`;

const annotations = readJson("audit/c02/annotations.json");
const baseline = readJson("audit/t18/ocr-live-final.json");
const enhanced = readJson("audit/c04/enhanced-ocr.json");

const approvedReadable = annotations.annotations.filter((annotation) => (
  annotation.status === "approved"
  && annotation.photo?.readability === "readable"
  && Array.isArray(annotation.formula?.ingredients)
  && annotation.formula.ingredients.length > 0
));

const acceptedStates = new Set(["confirmation"]);
const diagnosticCases = enhanced.cases.filter((item) => item.kind === "ingredients");
const acceptedDiagnostic = diagnosticCases.filter((item) => acceptedStates.has(item.state));
const rejectedDiagnostic = diagnosticCases.filter((item) => !acceptedStates.has(item.state));
const baselineById = new Map(baseline.cases.map((item) => [item.id, item]));
const matchedCases = enhanced.cases.map((item) => ({
  id: item.id,
  kind: item.kind,
  baselineState: baselineById.get(item.id)?.state || null,
  enhancedState: item.state || null,
  baselinePrecision: baselineById.get(item.id)?.comparison?.precision ?? null,
  enhancedPrecision: item.comparison?.precision ?? null,
  baselineRecall: baselineById.get(item.id)?.comparison?.recall ?? null,
  enhancedRecall: item.comparison?.recall ?? null
}));

const thresholds = {
  precision: 0.99,
  recall: 0.95,
  automaticallyAcceptedReadableShare: 0.8
};

const officialMetrics = approvedReadable.length === 0 ? {
  status: "not_evaluated",
  reason: "C02 contains no independently approved readable photo transcription.",
  readableGoldPhotos: 0,
  precision: null,
  recall: null,
  automaticallyAcceptedReadableShare: null,
  rejectedReadablePhotos: null,
  passed: false
} : {
  status: "not_run",
  reason: "Approved readable gold exists, but this script has not been supplied per-photo OCR output for it.",
  readableGoldPhotos: approvedReadable.length,
  precision: null,
  recall: null,
  automaticallyAcceptedReadableShare: null,
  rejectedReadablePhotos: null,
  passed: false
};

const result = {
  schemaVersion: "1.0",
  task: "C04",
  status: "partial",
  acceptance: {
    thresholds,
    officialMetrics,
    conclusion: "C04 acceptance is open. Engineering safeguards are implemented, but independent gold and physical mobile checks are missing; the complex diagnostic also remains below target."
  },
  provisionalDiagnostic: {
    status: "external_catalog_transcription_not_gold",
    warning: "These values compare OCR with an external catalog transcription and must not be reported as accepted OCR accuracy.",
    corpusCaseIds: enhanced.cases.map((item) => item.id),
    sameCasesAsBaseline: enhanced.cases.every((item) => baselineById.has(item.id))
      && baseline.cases.every((item) => enhanced.cases.some((candidate) => candidate.id === item.id)),
    ingredientPhotos: {
      records: enhanced.ingredientImages.records,
      baseline: {
        precision: baseline.ingredientImages.precision,
        recall: baseline.ingredientImages.recall
      },
      enhanced: {
        precision: enhanced.ingredientImages.precision,
        recall: enhanced.ingredientImages.recall
      },
      delta: {
        precision: Number((enhanced.ingredientImages.precision - baseline.ingredientImages.precision).toFixed(4)),
        recall: Number((enhanced.ingredientImages.recall - baseline.ingredientImages.recall).toFixed(4))
      },
      automaticallyAccepted: acceptedDiagnostic.length,
      rejectedForClarification: rejectedDiagnostic.length,
      automaticallyAcceptedShare: diagnosticCases.length ? acceptedDiagnostic.length / diagnosticCases.length : null
    },
    complexPhotos: matchedCases.filter((item) => item.kind === "ingredients"),
    frontLabelPhotos: {
      records: enhanced.frontImages.records,
      identifiedCandidates: enhanced.frontImages.identifiedCandidates,
      analysisCompleted: enhanced.frontImages.analysisCompleted,
      cases: matchedCases.filter((item) => item.kind === "front")
    },
    pageErrors: enhanced.browserPageErrors
  },
  engineComparison: {
    measuredOnSameDiagnosticCorpus: [
      {
        engine: "Tesseract.js current full-frame pipeline",
        source: "audit/t18/ocr-live-final.json",
        precision: baseline.ingredientImages.precision,
        recall: baseline.ingredientImages.recall
      },
      {
        engine: "Tesseract.js with C04 crop, contrast and rotation selection",
        source: "audit/c04/enhanced-ocr.json",
        precision: enhanced.ingredientImages.precision,
        recall: enhanced.ingredientImages.recall
      }
    ],
    notBenchmarked: [
      { engine: "PaddleOCR PP-OCRv5", reason: "Runtime/models are not installed in this repository." },
      { engine: "EasyOCR", reason: "Runtime/models are not installed in this repository." }
    ],
    proposedNextEngine: "PaddleOCR PP-OCRv5 multilingual, run locally or in a separately consented service and measured on the identical human-gold corpus before selection."
  },
  physicalDevices: {
    android: { status: "not_tested", required: true },
    ios: { status: "not_tested", required: true },
    note: "Playwright checks camera lifecycle and responsive layout but does not replace physical-device testing."
  }
};

const outputDir = path.join(rootDir, "audit", "c04");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "evaluation.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

const lines = [
  "# C04 OCR Evaluation",
  "",
  `- Acceptance status: **${result.status}**`,
  `- Independent readable gold photos: ${officialMetrics.readableGoldPhotos}`,
  `- Official precision: ${percent(officialMetrics.precision)}`,
  `- Official recall: ${percent(officialMetrics.recall)}`,
  `- Official auto-acceptance: ${percent(officialMetrics.automaticallyAcceptedReadableShare)}`,
  "",
  "## Provisional difficult-photo diagnostic",
  "",
  "> This section uses external catalog transcription, not independently approved gold.",
  "",
  `- Same four cases as baseline: ${result.provisionalDiagnostic.sameCasesAsBaseline ? "yes" : "no"}`,
  `- Baseline precision / recall: ${percent(baseline.ingredientImages.precision)} / ${percent(baseline.ingredientImages.recall)}`,
  `- Enhanced precision / recall: ${percent(enhanced.ingredientImages.precision)} / ${percent(enhanced.ingredientImages.recall)}`,
  `- Automatically accepted difficult INCI photos: ${acceptedDiagnostic.length}/${diagnosticCases.length}`,
  `- Rejected for clarification: ${rejectedDiagnostic.length}/${diagnosticCases.length}`,
  `- Front labels identified: ${enhanced.frontImages.identifiedCandidates}/${enhanced.frontImages.records}`,
  "",
  "## Acceptance blockers",
  "",
  "- No independent readable photo gold exists in C02 yet.",
  "- The provisional difficult-photo diagnostic remains below the target and correctly fails closed.",
  "- Android and iOS physical-device checks are still required.",
  "- PaddleOCR and EasyOCR are candidates, not measured results.",
  "",
  "See `docs/C04_OCR_ENGINE_COMPARISON.md` for the reproducible next-engine protocol."
];
fs.writeFileSync(path.join(outputDir, "evaluation.md"), `${lines.join("\n")}\n`, "utf8");
console.log(lines.slice(0, 15).join("\n"));

export { result };
