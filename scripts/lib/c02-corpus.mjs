import crypto from "node:crypto";

export const C02_TARGET = 200;
export const C02_FINAL_TARGET = 50;
export const C02_MANUAL_GOLD_TARGET = 100;

const CATEGORY_RULES = [
  ["sunscreen", /sunscreen|sun[- ]?care|sun protection|solaire|spf\s*\d|uv protection/iu],
  ["hair_care", /shampoo|conditioner|hair|scalp|shampoos|hair-care|cheveux|haarpflege/iu],
  ["rinse_off_cleanser", /cleanser|cleansing|body wash|face wash|soap|shower gel|washing gel|nettoyant/iu],
  ["serum_or_oil", /serum|face oil|facial oil|squalane|ampoule|essence/iu],
  ["cream_or_lotion", /cream|lotion|moisturi[sz]er|body milk|face cream|hand cream|creme|crème/iu]
];

const text = (value) => String(value || "").trim();
const list = (value) => Array.isArray(value) ? value : [];

export function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function normalizeSplitGroup(product) {
  const brand = text(product.brand || product.brands).split(",")[0].toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return brand || `unknown:${text(product.barcode || product.code)}`;
}

export function inferCandidateCategory(product) {
  const haystack = [product.name, product.product_name, ...list(product.categories)].join(" ");
  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack));
  return match?.[0] || "unknown";
}

function numericHash(value) {
  return Number.parseInt(stableHash(value).slice(0, 12), 16);
}

function selectFinalGroups(groups, target) {
  const ordered = [...groups.entries()]
    .filter(([, values]) => values.length <= target)
    .sort((a, b) => numericHash(a[0]) - numericHash(b[0]) || a[0].localeCompare(b[0], "en"));
  const reachable = new Map([[0, []]]);
  for (let index = 0; index < ordered.length; index += 1) {
    const size = ordered[index][1].length;
    for (const [sum, selected] of [...reachable.entries()].sort((a, b) => b[0] - a[0])) {
      const next = sum + size;
      if (next <= target && !reachable.has(next)) reachable.set(next, [...selected, index]);
    }
    if (reachable.has(target)) break;
  }
  const best = reachable.has(target) ? target : Math.max(...reachable.keys());
  return new Set((reachable.get(best) || []).map((index) => ordered[index][0]));
}

function assignPartitions(candidates) {
  const groups = new Map();
  for (const entry of candidates) {
    if (!groups.has(entry.splitGroup)) groups.set(entry.splitGroup, []);
    groups.get(entry.splitGroup).push(entry);
  }
  const finalGroups = selectFinalGroups(groups, C02_FINAL_TARGET);
  const final = candidates.filter((entry) => finalGroups.has(entry.splitGroup)).slice(0, C02_FINAL_TARGET);
  const setup = candidates.filter((entry) => !finalGroups.has(entry.splitGroup)).slice(0, C02_TARGET - final.length);
  return [
    ...setup.map((entry) => ({ ...entry, partition: "setup" })),
    ...final.map((entry) => ({ ...entry, partition: "final" }))
  ].sort((a, b) => a.partition.localeCompare(b.partition) || a.barcode.localeCompare(b.barcode));
}

function approximateIngredientCount(value) {
  return text(value).split(/[,;\n\r]+/u).map((item) => item.trim()).filter(Boolean).length;
}

export function createManifest(snapshot) {
  const snapshotProducts = list(snapshot.products);
  const candidates = snapshotProducts
    .filter((product) => /^\d{8,14}$/.test(text(product.barcode)) && text(product.ingredientImage?.url) && text(product.sourceReportedFormulaText))
    .map((product) => {
      const splitGroup = normalizeSplitGroup(product);
      const category = inferCandidateCategory(product);
      return {
        id: `c02-obf-${product.barcode}`,
        partition: null,
        splitGroup,
        barcode: text(product.barcode),
        product: {
          sourceReportedName: text(product.name) || null,
          sourceReportedBrand: text(product.brand) || null,
          sourceReportedLanguage: text(product.language) || null,
          sourceReportedCategories: list(product.categories),
          sourceReportedMarkets: list(product.markets),
          automatedCandidateCategory: category,
          reviewedCategory: null,
          reviewedPurpose: null,
          reviewedMarket: null,
          packagingOrFormulaDate: null
        },
        inputs: {
          ingredientPhoto: { ...product.ingredientImage, localPath: null },
          frontPhoto: product.frontImage?.url ? { ...product.frontImage, localPath: null } : null,
          externalCatalogTranscription: {
            text: text(product.sourceReportedFormulaText),
            kind: "external_catalog_transcription_not_gold",
            formulaScope: "unknown",
            ingredientCountApprox: approximateIngredientCount(product.sourceReportedFormulaText)
          }
        },
        provenance: {
          sourceId: "open_beauty_facts",
          productUrl: product.productUrl,
          apiUrl: product.apiUrl,
          snapshotRecordId: product.snapshotRecordId,
          snapshotHash: snapshot.contentHash,
          sourceModifiedAt: product.sourceModifiedAt || null,
          capturedAt: snapshot.retrievedAt,
          dataLicense: "ODbL",
          imageLicense: "CC BY-SA",
          attributionRequired: true
        },
        reviewState: {
          status: "pending_independent_manual_review",
          identityConfirmed: null,
          formulaCompleteness: null,
          photoReadability: null,
          notes: null
        },
        coverageTags: [
          "barcode",
          "remote_ingredient_photo",
          ...(product.frontImage?.url ? ["remote_front_photo"] : []),
          ...(category !== "unknown" ? [`candidate_category:${category}`] : ["candidate_category:unknown"]),
          ...(approximateIngredientCount(product.sourceReportedFormulaText) >= 25 ? ["long_inci"] : [])
        ]
      };
    })
    .sort((a, b) => a.barcode.localeCompare(b.barcode));

  const entries = assignPartitions(candidates);
  const setupCount = entries.filter((entry) => entry.partition === "setup").length;
  const finalCount = entries.filter((entry) => entry.partition === "final").length;
  return {
    schemaVersion: "2.0",
    corpusId: "c02-formula-evaluation-corpus",
    builtAt: snapshot.retrievedAt,
    sourceSnapshotHash: snapshot.contentHash,
    status: entries.length === C02_TARGET && finalCount === C02_FINAL_TARGET ? "candidate_corpus_ready_for_manual_review" : "insufficient_candidates",
    targets: { products: C02_TARGET, independentManualPhotoTranscriptions: C02_MANUAL_GOLD_TARGET, finalProducts: C02_FINAL_TARGET },
    counts: {
      products: entries.length,
      setup: setupCount,
      final: finalCount,
      remoteIngredientPhotos: entries.filter((entry) => entry.inputs.ingredientPhoto.url).length,
      locallyArchivedIngredientPhotos: entries.filter((entry) => entry.inputs.ingredientPhoto.localPath).length,
      independentManualPhotoTranscriptions: 0
    },
    splitPolicy: {
      unit: "normalized_primary_brand",
      rule: "A normalized primary brand is assigned wholly to setup or final. This conservatively keeps close product versions from the same brand out of the opposite partition.",
      deterministicKey: "SHA-256(normalized primary brand)",
      finalIsHeldOut: true
    },
    provenance: {
      source: "Open Beauty Facts API",
      sourceSnapshot: "audit/c02/source-snapshot.json",
      dataLicense: "ODbL",
      imageLicense: "CC BY-SA",
      documentation: [
        "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/",
        "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/"
      ]
    },
    fieldPolicy: {
      nullMeans: "unknown_or_not_independently_reviewed",
      sourceReportedFields: "Preserved as source claims and never promoted to reviewed truth.",
      automatedCandidateCategory: "A deterministic sampling aid, not expert or manual gold.",
      externalCatalogTranscription: "Candidate material only. It is excluded from OCR accuracy metrics."
    },
    limitations: [
      "Ingredient images are linked under the stated source license but are not vendored into the repository.",
      "Product purpose, category, formula completeness, market and date remain null until a reviewer can verify them from source evidence.",
      "Open Beauty Facts ingredients_text is not independent manual transcription and is never OCR gold."
    ],
    entries
  };
}

function blankAnnotation(entry) {
  return {
    id: entry.id,
    partition: entry.partition,
    status: "pending",
    independentFromMachineOutputs: true,
    reviewer: { id: null, reviewedAt: null },
    identity: { sourceIdentityAssessment: null, correctedName: null, correctedBrand: null },
    purpose: null,
    category: null,
    market: null,
    packagingOrFormulaDate: null,
    formula: { scope: null, exactTranscription: null, ingredients: [], unreadableFragments: [] },
    photo: { readability: null, visualConditions: [], labelSide: null },
    notes: null
  };
}

export function createAnnotations(manifest, previous = null) {
  const existing = new Map(list(previous?.annotations).map((item) => [item.id, item]));
  return {
    schemaVersion: "1.0",
    corpusId: manifest.corpusId,
    manifestHash: stableHash(manifest),
    annotationPolicy: {
      blindTo: ["OCR output", "external catalog transcription", "current analyzer output"],
      approvalRequires: ["ingredient photo viewed", "exact transcription or explicit unreadable fragments", "formula scope reviewed", "reviewer id", "review date"],
      allowedFormulaScopes: ["full", "partial", "active_only", "unknown"]
    },
    annotations: manifest.entries.map((entry) => existing.get(entry.id) || blankAnnotation(entry))
  };
}

export function validateApprovedAnnotation(annotation) {
  if (annotation.status !== "approved") return { eligible: false, reasons: ["status_not_approved"] };
  const reasons = [];
  if (annotation.independentFromMachineOutputs !== true) reasons.push("not_independent");
  if (!text(annotation.reviewer?.id)) reasons.push("missing_reviewer");
  if (!text(annotation.reviewer?.reviewedAt)) reasons.push("missing_review_date");
  if (!text(annotation.formula?.exactTranscription)) reasons.push("missing_exact_transcription");
  if (!list(annotation.formula?.ingredients).length) reasons.push("missing_ingredient_list");
  if (!["full", "partial", "active_only", "unknown"].includes(annotation.formula?.scope)) reasons.push("missing_formula_scope");
  if (!text(annotation.photo?.readability)) reasons.push("missing_photo_readability");
  return { eligible: reasons.length === 0, reasons };
}

export function normalizeIngredientToken(value) {
  return text(value).toLocaleLowerCase("en").replace(/[()[\]{}]/g, " ").replace(/[^\p{L}\p{N}+\-/]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function compareIngredientLists(expected, actual) {
  const expectedCounts = new Map();
  const actualCounts = new Map();
  for (const item of expected.map(normalizeIngredientToken).filter(Boolean)) expectedCounts.set(item, (expectedCounts.get(item) || 0) + 1);
  for (const item of actual.map(normalizeIngredientToken).filter(Boolean)) actualCounts.set(item, (actualCounts.get(item) || 0) + 1);
  let truePositive = 0;
  for (const [item, count] of expectedCounts) truePositive += Math.min(count, actualCounts.get(item) || 0);
  const expectedTotal = [...expectedCounts.values()].reduce((sum, count) => sum + count, 0);
  const actualTotal = [...actualCounts.values()].reduce((sum, count) => sum + count, 0);
  return { truePositive, falsePositive: actualTotal - truePositive, falseNegative: expectedTotal - truePositive };
}

export function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
