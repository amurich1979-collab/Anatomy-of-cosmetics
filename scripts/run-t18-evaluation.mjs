import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "../src/analyzer.js";
import { cleanInciText } from "../src/services/inciCleaner.js";
import { searchExternalProductsDetailed } from "../src/services/productSources/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T18 = path.join(ROOT, "audit", "t18");
const manifest = JSON.parse(fs.readFileSync(path.join(T18, "corpus-manifest.json"), "utf8"));
const safetyDocument = JSON.parse(fs.readFileSync(path.join(T18, "safety-cases.json"), "utf8"));
const localProducts = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));

function normalizeToken(value) {
  return String(value || "")
    .replace(/^\s*(ingredients?|inci|состав)\s*[:\-]?\s*/i, "")
    .replace(/[.。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function referenceIngredients(text) {
  return String(text || "")
    .split(/[,;\n]+/)
    .map(normalizeToken)
    .filter((item) => item.length >= 2);
}

function multisetCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function compareIngredients(expected, actual) {
  const left = multisetCounts(expected);
  const right = multisetCounts(actual);
  let truePositive = 0;
  for (const [name, count] of left) truePositive += Math.min(count, right.get(name) || 0);
  const falsePositive = Math.max(0, actual.length - truePositive);
  const falseNegative = Math.max(0, expected.length - truePositive);
  return { truePositive, falsePositive, falseNegative };
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function wilson(successes, total, z = 1.96) {
  if (!total) return null;
  const p = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const center = (p + (z ** 2) / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + (z ** 2) / (4 * total)) / total) / denominator;
  return [Number(Math.max(0, center - margin).toFixed(4)), Number(Math.min(1, center + margin).toFixed(4))];
}

function aggregate(rows) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const tp = sum("truePositive");
  const fp = sum("falsePositive");
  const fn = sum("falseNegative");
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return {
    records: rows.length,
    expectedIngredients: tp + fn,
    extractedIngredients: tp + fp,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    precision,
    precisionWilson95: wilson(tp, tp + fp),
    recall,
    recallWilson95: wilson(tp, tp + fn),
    target: { precision: 0.99, recall: 0.95 },
    targetStatus: precision != null && recall != null
      ? (precision >= 0.99 && recall >= 0.95 ? "met_on_this_sample" : "not_met_on_this_sample")
      : "not_evaluated"
  };
}

function evaluateTextEntry(entry) {
  const expected = referenceIngredients(entry.inputs.sourceText);
  const cleaned = cleanInciText(entry.inputs.sourceText);
  const actual = cleaned.ingredients.map(normalizeToken).filter(Boolean);
  const comparison = compareIngredients(expected, actual);
  const analysis = analyzeComposition({
    text: cleaned.ingredients.join(", "),
    productName: [entry.product.brand, entry.product.name].filter(Boolean).join(" "),
    formulaScope: "full",
    productEvidence: {
      identificationStatus: "confirmed",
      name: entry.product.name,
      brand: entry.product.brand,
      source: { name: "Open Beauty Facts", type: "open_beauty_facts", url: entry.source.productUrl }
    }
  });
  const confirmed = analysis.found.filter((item) => item.status !== "suggested").length;
  return {
    id: entry.id,
    partition: entry.partition,
    brand: entry.product.brand,
    language: entry.product.language,
    expectedCount: expected.length,
    extractedCount: actual.length,
    ...comparison,
    precision: ratio(comparison.truePositive, comparison.truePositive + comparison.falsePositive),
    recall: ratio(comparison.truePositive, comparison.truePositive + comparison.falseNegative),
    analysis: {
      total: analysis.totalIngredients,
      confirmed,
      suggested: analysis.found.length - confirmed,
      unknown: analysis.unknown.length,
      recognitionCoverage: ratio(confirmed, analysis.totalIngredients),
      expertExplained: analysis.evidenceCoverage?.expertExplanation?.count || 0,
      expertReviewed: analysis.evidenceCoverage?.expertExplanation?.reviewedCount || 0,
      assessmentStatus: analysis.assessment?.status,
      assessmentReason: analysis.assessment?.reason,
      productType: analysis.productSafety?.type
    }
  };
}

function evaluateSafetyCase(definition) {
  let input = { ...definition };
  if (definition.productId) {
    const product = localProducts.find((item) => item.id === definition.productId);
    input = {
      ...definition,
      text: product?.composition || "",
      productName: [product?.brand, product?.name].filter(Boolean).join(" "),
      formulaScope: product?.compositionScope === "active_ingredients_only" ? "active_only" : product?.compositionScope
    };
  }
  if (definition.fromCorpus === "front_label") {
    const entry = manifest.entries.find((item) => item.inputs.frontImage.url && (item.product.name || item.product.brand));
    input = {
      ...definition,
      text: [entry?.product.brand, entry?.product.name].filter(Boolean).join(" "),
      productName: "",
      formulaScope: "unknown",
      corpusId: entry?.id
    };
  }

  const analysis = analyzeComposition({
    text: input.text,
    productName: input.productName || "",
    formulaScope: input.formulaScope || "unknown"
  });
  const acceptedInputs = [...analysis.found, ...analysis.unknown].map((item) => normalizeToken(item.input)).filter(Boolean);
  const cleanedInputs = (analysis.inciCleaning?.ingredients || []).map(normalizeToken);
  const hiddenAdditions = acceptedInputs.filter((item) => !cleanedInputs.includes(item));
  const actual = {
    productType: analysis.productSafety?.type,
    assessmentStatus: analysis.assessment?.status,
    assessmentReason: analysis.assessment?.reason,
    score: analysis.score?.score ?? null,
    routineAdviceCount: analysis.routineAdvice?.length || 0,
    positiveRecommendationCount: analysis.positives?.length || 0,
    acceptedIngredientCount: analysis.totalIngredients,
    hiddenAdditions
  };
  const mismatches = Object.entries(definition.expect || {})
    .filter(([key, expected]) => JSON.stringify(actual[key]) !== JSON.stringify(expected))
    .map(([key, expected]) => ({ key, expected, actual: actual[key] }));
  if (hiddenAdditions.length) mismatches.push({ key: "hiddenAdditions", expected: [], actual: hiddenAdditions });
  return { id: definition.id, sourceType: definition.sourceType, corpusId: input.corpusId || null, actual, passed: mismatches.length === 0, mismatches };
}

function uniqueBrandSample(entries, limit) {
  const result = [];
  const brands = new Set();
  for (const entry of entries) {
    const brand = String(entry.product.brand || entry.id).toLocaleLowerCase();
    if (brands.has(brand)) continue;
    brands.add(brand);
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}

async function evaluateBarcodes(entries) {
  const results = [];
  for (const entry of uniqueBrandSample(entries, 8)) {
    const startedAt = Date.now();
    try {
      const response = await searchExternalProductsDetailed(entry.barcode, { limit: 5, useCache: false, timeoutMs: 12000 });
      const exact = response.products.find((product) => String(product.code || product.barcode) === entry.barcode) || null;
      const analysis = exact?.composition ? analyzeComposition({
        text: exact.composition,
        productName: [exact.brand, exact.name].filter(Boolean).join(" "),
        formulaScope: exact.compositionScope === "active_ingredients_only" ? "active_only" : (exact.compositionScope || "unknown"),
        productEvidence: { identificationStatus: "confirmed", name: exact.name, brand: exact.brand, source: { name: exact.source, type: exact.sourceType, url: exact.sourceUrl } }
      }) : null;
      results.push({
        id: entry.id,
        barcode: entry.barcode,
        elapsedMs: Date.now() - startedAt,
        lookupStatus: response.status,
        exactMatch: Boolean(exact),
        compositionAvailable: Boolean(exact?.composition),
        source: exact?.source || null,
        formulaScope: exact?.compositionScope || null,
        analysisStatus: analysis?.assessment?.status || null,
        sourceStatuses: response.sourceStatuses
      });
    } catch (error) {
      results.push({ id: entry.id, barcode: entry.barcode, elapsedMs: Date.now() - startedAt, exactMatch: false, error: error.message });
    }
  }
  return results;
}

const textRows = manifest.entries.map(evaluateTextEntry);
const approvedGold = manifest.entries.filter((entry) => entry.reference.humanReview.status === "approved" && entry.reference.humanReview.exactIngredients.length);
const safety = safetyDocument.cases.map(evaluateSafetyCase);
const barcode = await evaluateBarcodes(manifest.entries.filter((entry) => entry.partition === "final"));
const byPartition = Object.fromEntries(["setup", "final"].map((partition) => [partition, aggregate(textRows.filter((row) => row.partition === partition))]));
const recognition = {
  records: textRows.length,
  ingredients: textRows.reduce((sum, row) => sum + row.analysis.total, 0),
  confirmed: textRows.reduce((sum, row) => sum + row.analysis.confirmed, 0),
  suggested: textRows.reduce((sum, row) => sum + row.analysis.suggested, 0),
  unknown: textRows.reduce((sum, row) => sum + row.analysis.unknown, 0),
  expertExplained: textRows.reduce((sum, row) => sum + row.analysis.expertExplained, 0),
  expertReviewed: textRows.reduce((sum, row) => sum + row.analysis.expertReviewed, 0)
};
recognition.confirmedCoverage = ratio(recognition.confirmed, recognition.ingredients);
recognition.expertExplainedCoverage = ratio(recognition.expertExplained, recognition.ingredients);
recognition.expertReviewedCoverage = ratio(recognition.expertReviewed, recognition.ingredients);

const output = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  corpus: manifest.counts,
  benchmarkStatus: approvedGold.length ? "human_reviewed_subset_available" : "candidate_only_no_human_reviewed_gold",
  humanReviewedGold: {
    records: approvedGold.length,
    metrics: approvedGold.length ? "not_implemented_until_reviewed_labels_exist" : null,
    target: { precision: 0.99, recall: 0.95 },
    targetStatus: "not_evaluated"
  },
  provisionalSourceTranscriptionDiagnostic: {
    warning: "Uses external Open Beauty Facts ingredients_text, not project-owned human-verified gold. It measures text cleaning, not OCR accuracy and must not be reported as market accuracy.",
    byPartition,
    worstCases: textRows
      .map((row) => ({ ...row, f1: row.precision != null && row.recall != null && row.precision + row.recall ? Number((2 * row.precision * row.recall / (row.precision + row.recall)).toFixed(4)) : 0 }))
      .sort((a, b) => a.f1 - b.f1)
      .slice(0, 12)
  },
  expertCoverage: recognition,
  safety: {
    records: safety.length,
    passed: safety.filter((item) => item.passed).length,
    failed: safety.filter((item) => !item.passed).length,
    cases: safety
  },
  barcodeLive: {
    records: barcode.length,
    exactMatches: barcode.filter((item) => item.exactMatch).length,
    compositions: barcode.filter((item) => item.compositionAvailable).length,
    errors: barcode.filter((item) => item.error).length,
    cases: barcode
  }
};

fs.writeFileSync(path.join(T18, "evaluation.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  benchmarkStatus: output.benchmarkStatus,
  corpus: output.corpus,
  provisional: output.provisionalSourceTranscriptionDiagnostic.byPartition,
  expertCoverage: output.expertCoverage,
  safety: { records: output.safety.records, passed: output.safety.passed, failed: output.safety.failed },
  barcode: { records: output.barcodeLive.records, exactMatches: output.barcodeLive.exactMatches, compositions: output.barcodeLive.compositions, errors: output.barcodeLive.errors }
}, null, 2));
