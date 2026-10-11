import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeInciKey } from "../src/services/ingredientSources/cosing.js";
import { REQUIRED_FUNCTIONAL_CLASSES, validateExpertCardBatch } from "../src/services/expertCardBatch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "audit", "c02", "corpus-manifest.json");
const registryPath = path.join(root, "data", "inci-registry.json");
const outputPath = path.join(root, "data", "expert-card-batch-c06.json");
const auditPath = path.join(root, "audit", "c06", "coverage.json");
const CHECKED_AT = "2026-10-03";
const CARD_COUNT = 50;

const OFFICIAL_CONTEXT_SOURCES = Object.freeze([
  {
    id: "ec-cosing-overview-2026-10-03",
    title: "Cosmetic ingredient database (CosIng)",
    type: "official_context",
    url: "https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Database purpose and content only; not an exact basis for any local ingredient row.",
    version: null,
    contentHash: null
  },
  {
    id: "ec-cosing-guide",
    title: "Guide to Consulting CosIng",
    type: "official_context",
    url: "https://ec.europa.eu/growth/tools-databases/cosing/assets/images/CosIng_FO.pdf",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "CosIng interpretation and legal-value limitations; not an ingredient-level claim source.",
    version: null,
    contentHash: null
  },
  {
    id: "sccs-opinions-index-2026-10-03",
    title: "SCCS opinions",
    type: "official_discovery_index",
    url: "https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs/sccs-opinions_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Discovery index only; no conclusion is transcribed from the index.",
    version: null,
    contentHash: null
  },
  {
    id: "sccs-salicylic-acid-1646-22",
    title: "SCCS Opinion on salicylic acid, SCCS/1646/22",
    type: "official_opinion_candidate",
    url: "https://health.ec.europa.eu/publications/salicylic-acid-cas-no-69-72-7-ec-no-200-712-3_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Research candidate only. Conclusions and conditions are not transcribed into a runtime claim in C06.",
    version: "SCCS/1646/22",
    contentHash: null
  },
  {
    id: "sccs-vitamin-a-1639-21",
    title: "SCCS Opinion on Vitamin A, SCCS/1639/21",
    type: "official_opinion_candidate",
    url: "https://health.ec.europa.eu/publications/revision-scientific-opinion-sccs157616-vitamin-retinol-retinyl-acetate-retinyl-palmitate_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Research candidate only. Product type, retinol-equivalent basis and exposure context require expert transcription.",
    version: "SCCS/1639/21",
    contentHash: null
  },
  {
    id: "sccs-titanium-dioxide-1661-23",
    title: "SCCS Scientific Advice on Titanium dioxide, SCCS/1661/23",
    type: "official_opinion_candidate",
    url: "https://health.ec.europa.eu/publications/scientific-advice-titanium-dioxide-tio2-casec-numbers-13463-67-7236-675-5-1317-70-0215-280-1-1317-80_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Research candidate only. Material grade, particle form, route and product category must not be collapsed.",
    version: "SCCS/1661/23",
    contentHash: null
  },
  {
    id: "sccs-ehmc-1671-24",
    title: "SCCS Opinion on Ethylhexyl Methoxycinnamate, SCCS/1671/24",
    type: "official_opinion_candidate",
    url: "https://health.ec.europa.eu/publications/sccs-opinion-ethylhexyl-methoxycinnamate-ehmc-cas-no-5466-77-383834-59-7-ec-no-226-775-7629-661-9_en",
    artifactRef: null,
    checkedAt: CHECKED_AT,
    scope: "Research candidate only. The 2026 corrigendum and use conditions require expert transcription.",
    version: "SCCS/1671/24, corrigendum 2026",
    contentHash: null
  }
]);

const CRITICAL_PRIORITIES = Object.freeze([
  "Titanium Dioxide",
  "Butyl Methoxydibenzoylmethane",
  "Ethylhexyl Methoxycinnamate",
  "Octocrylene",
  "Salicylic Acid",
  "Retinol",
  "Lactic Acid",
  "Ceramide Np",
  "Allantoin",
  "Citral",
  "Simmondsia Chinensis Seed Oil"
]);

const ACTIVE_PRIORITIES = new Set([
  "niacinamide", "panthenol", "salicylic acid", "retinol", "lactic acid", "sodium hyaluronate",
  "tocopherol", "allantoin", "ceramide np"
].map(normalizeInciKey));

const RESEARCH_SOURCE_BY_INGREDIENT = new Map([
  [normalizeInciKey("Salicylic Acid"), ["sccs-salicylic-acid-1646-22"]],
  [normalizeInciKey("Retinol"), ["sccs-vitamin-a-1639-21"]],
  [normalizeInciKey("Titanium Dioxide"), ["sccs-titanium-dioxide-1661-23"]],
  [normalizeInciKey("Ethylhexyl Methoxycinnamate"), ["sccs-ehmc-1671-24"]]
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const unique = (values) => [...new Set(values)];
const ratio = (part, total) => total ? Number((part / total).toFixed(4)) : null;

function registryIndex(registry) {
  const index = new Map();
  for (const record of registry.records) {
    index.set(normalizeInciKey(record.name), record);
    for (const alias of record.aliases || []) index.set(normalizeInciKey(alias), record);
  }
  return index;
}

function resolveExact(raw, index) {
  const candidates = [
    raw,
    ...[...raw.matchAll(/\(([^()]*)\)/gu)].map((match) => match[1]),
    raw.replace(/\([^)]*\)/gu, "").trim()
  ];
  for (const candidate of candidates) {
    const record = index.get(normalizeInciKey(candidate));
    if (record) return record;
  }
  return null;
}

function rankPartition(entries, partition, index) {
  const ranked = new Map();
  let rawOccurrenceCount = 0;
  let recognizedOccurrenceCount = 0;
  for (const entry of entries.filter((item) => item.partition === partition)) {
    const transcription = entry.inputs?.externalCatalogTranscription;
    if (!transcription?.text) continue;
    const seenRaw = new Set();
    const seenCanonical = new Set();
    for (const rawValue of transcription.text.split(/[,;\n\r]+/u)) {
      const raw = rawValue.replace(/^[-–—•\s]+|[-–—•\s.]+$/gu, "").replace(/\s+/gu, " ").trim();
      const rawKey = normalizeInciKey(raw);
      if (!rawKey || seenRaw.has(rawKey)) continue;
      seenRaw.add(rawKey);
      rawOccurrenceCount += 1;
      const record = resolveExact(raw, index);
      if (!record) continue;
      const key = normalizeInciKey(record.name);
      if (seenCanonical.has(key)) continue;
      seenCanonical.add(key);
      recognizedOccurrenceCount += 1;
      if (!ranked.has(key)) ranked.set(key, {
        record,
        formulaCount: 0,
        occurrenceCount: 0,
        formulaIds: []
      });
      const row = ranked.get(key);
      row.formulaCount += 1;
      row.occurrenceCount += 1;
      row.formulaIds.push(entry.id);
    }
  }
  const rows = [...ranked.values()]
    .sort((a, b) => b.formulaCount - a.formulaCount
      || b.occurrenceCount - a.occurrenceCount
      || a.record.name.localeCompare(b.record.name, "en"))
    .map((row, indexPosition) => ({ ...row, rank: indexPosition + 1 }));
  return { rows, rawOccurrenceCount, recognizedOccurrenceCount };
}

function classifyFunctionalClasses(record) {
  const functions = new Set(record.functions || []);
  const name = record.name;
  const classes = [];
  if (functions.has("EMULSIFYING") || functions.has("EMULSION STABILISING")) classes.push("emulsifiers");
  if (functions.has("EMOLLIENT")) classes.push("emollients");
  if (["SURFACTANT", "CLEANSING", "FOAMING"].some((value) => functions.has(value))) classes.push("surfactants");
  if (functions.has("PRESERVATIVE")) classes.push("preservatives");
  if (["PERFUMING", "DEODORANT"].some((value) => functions.has(value)) || normalizeInciKey(name) === "parfum") classes.push("fragrance");
  if (functions.has("EMOLLIENT") && /(?:oil|butter|petrolatum)$/iu.test(name)) classes.push("fatty_phase_oils");
  if (functions.has("UV FILTER")) classes.push("uv_filters");
  if (ACTIVE_PRIORITIES.has(normalizeInciKey(name))) classes.push("actives_additives");
  if (functions.has("HUMECTANT")) classes.push("humectants");
  if (["VISCOSITY CONTROLLING", "GEL FORMING", "BINDING"].some((value) => functions.has(value))) classes.push("rheology");
  return unique(classes);
}

function selectCards(ranking) {
  const selected = new Map();
  const add = (row, reason) => {
    if (!row || selected.size >= CARD_COUNT && !selected.has(normalizeInciKey(row.record.name))) return;
    const key = normalizeInciKey(row.record.name);
    if (!selected.has(key)) selected.set(key, { row, reasons: [] });
    selected.get(key).reasons.push(reason);
  };
  const byName = new Map(ranking.map((row) => [normalizeInciKey(row.record.name), row]));
  for (const ingredient of CRITICAL_PRIORITIES) add(byName.get(normalizeInciKey(ingredient)), "critical_class_priority_independent_of_frequency");
  for (const functionalClass of REQUIRED_FUNCTIONAL_CLASSES) {
    add(ranking.find((row) => classifyFunctionalClasses(row.record).includes(functionalClass)), `required_functional_class:${functionalClass}`);
  }
  for (const row of ranking) {
    if (selected.size >= CARD_COUNT) break;
    add(row, "setup_corpus_frequency");
  }
  if (selected.size !== CARD_COUNT) throw new Error(`Unable to select ${CARD_COUNT} unique cards; selected ${selected.size}`);
  return [...selected.values()]
    .sort((a, b) => a.row.rank - b.row.rank)
    .map((item, index) => ({ ...item, batchRank: index + 1, reasons: unique(item.reasons) }));
}

function coverageForSelection(ranked, selectedKeys) {
  const denominator = ranked.rows.reduce((sum, row) => sum + row.occurrenceCount, 0);
  const numerator = ranked.rows
    .filter((row) => selectedKeys.has(normalizeInciKey(row.record.name)))
    .reduce((sum, row) => sum + row.occurrenceCount, 0);
  return {
    selectedRecognizedOccurrences: numerator,
    allRecognizedOccurrences: denominator,
    recognizedOccurrenceCoverage: ratio(numerator, denominator),
    allRawOccurrences: ranked.rawOccurrenceCount,
    selectedToAllRawOccurrenceCoverage: ratio(numerator, ranked.rawOccurrenceCount)
  };
}

function ingredientsNeededForTarget(rows, target = 0.9) {
  const total = rows.reduce((sum, row) => sum + row.occurrenceCount, 0);
  let covered = 0;
  let count = 0;
  for (const row of rows) {
    covered += row.occurrenceCount;
    count += 1;
    if (covered / total >= target) break;
  }
  return { target, ingredientCount: count, coveredOccurrences: covered, totalOccurrences: total, rate: ratio(covered, total) };
}

export function buildC06Batch({ manifest, registry, registryContent }) {
  const index = registryIndex(registry);
  const setup = rankPartition(manifest.entries, "setup", index);
  const final = rankPartition(manifest.entries, "final", index);
  const selection = selectCards(setup.rows);
  const selectedKeys = new Set(selection.map((item) => normalizeInciKey(item.row.record.name)));
  const registryHash = sha256(registryContent);
  const sources = [
    {
      id: "c06-local-inci-registry-snapshot",
      title: "Local INCI registry legacy snapshot",
      type: "third_party_legacy_snapshot",
      url: registry.source.url,
      artifactRef: "data/inci-registry.json",
      checkedAt: CHECKED_AT,
      scope: "Exact local record and function fields only. The snapshot is a third-party legacy mirror and is not treated as current EU regulatory evidence.",
      version: registry.registryVersion,
      contentHash: registryHash
    },
    ...OFFICIAL_CONTEXT_SOURCES
  ];
  const cards = selection.map(({ row, reasons, batchRank }) => {
    const classes = classifyFunctionalClasses(row.record);
    const functionText = row.record.functions.length ? row.record.functions.join(", ") : "не указаны";
    return {
      id: `c06-${normalizeInciKey(row.record.name).replace(/\s+/gu, "-")}`,
      batchRank,
      ingredient: {
        canonicalName: row.record.name,
        aliases: row.record.aliases || [],
        cas: row.record.cas,
        referenceFunctions: row.record.functions || []
      },
      corpusPriority: {
        partition: "setup",
        candidateMaterialKind: "external_catalog_transcription_not_gold",
        rank: row.rank,
        formulaCount: row.formulaCount,
        occurrenceCount: row.occurrenceCount,
        setupFormulaCount: manifest.entries.filter((entry) => entry.partition === "setup").length,
        note: "Частота рассчитана по каталожным транскрипциям setup-части C02 и используется только для очередности исследования."
      },
      functionalClasses: classes,
      selectionReasons: reasons,
      draftReference: {
        claimType: "reference_function_candidate",
        textRu: `В локальном legacy-снимке INCI-реестра для ${row.record.name} перечислены справочные функции: ${functionText}.`,
        basis: {
          sourceId: "c06-local-inci-registry-snapshot",
          locator: `records[name=${JSON.stringify(row.record.name)}].functions`
        },
        evidenceStatus: "review_required",
        publicationStatus: "staged_not_runtime",
        runtimeEligible: false,
        limitations: [
          "Запись происходит из локального legacy-зеркала и требует сверки с актуальным официальным источником.",
          "Перечень справочных функций не доказывает роль ингредиента в конкретной формуле, эффект, безопасность, качество сырья или концентрацию.",
          "Технологические и значимые для здоровья выводы не подготовлены и не прошли предметное ревью."
        ],
        review: {
          status: "pending",
          reviewerId: null,
          reviewedAt: null,
          artifactRef: null
        }
      },
      assessmentGaps: {
        technicalProperties: "not_assessed",
        formulaRole: "not_assessed",
        tolerability: "not_assessed",
        regulatoryRestrictions: "not_assessed",
        qualityAssessment: "not_assessed"
      },
      researchCandidates: (RESEARCH_SOURCE_BY_INGREDIENT.get(normalizeInciKey(row.record.name)) || []).map((sourceId) => ({
        sourceId,
        status: "candidate_not_transcribed",
        note: "Источник найден, но его условия и выводы не перенесены в правило без предметной проверки."
      }))
    };
  });
  const setupCoverage = coverageForSelection(setup, selectedKeys);
  const finalCoverage = coverageForSelection(final, selectedKeys);
  const classCounts = Object.fromEntries(REQUIRED_FUNCTIONAL_CLASSES.map((functionalClass) => [
    functionalClass,
    cards.filter((card) => card.functionalClasses.includes(functionalClass)).length
  ]));
  const batch = {
    schemaVersion: "1.0",
    batchId: "c06-first-50",
    version: "1.0.0",
    checkedAt: CHECKED_AT,
    publicationStatus: "staged_not_runtime",
    domainReviewStatus: "pending_external_expert",
    selectionPolicy: {
      sourceCorpus: manifest.corpusId,
      selectionPartition: "setup",
      heldOutPartition: "final",
      method: "critical priorities and required functional classes first, then setup formula frequency; exact or alias registry matches only",
      finalPartitionUsedForSelection: false,
      candidateMaterialLimitation: "Open Beauty Facts catalog transcriptions are candidate material, not independent manual gold.",
      fuzzyMatchesAcceptedForSelection: false
    },
    sources,
    cards,
    coverage: {
      setup: setupCoverage,
      finalHoldoutReadOnly: finalCoverage,
      setupIngredientsNeededFor90PercentRecognizedOccurrences: ingredientsNeededForTarget(setup.rows),
      selectedCardCount: cards.length,
      requiredFunctionalClassCounts: classCounts,
      publishedExpertClaimCount: 0,
      approvedExpertClaimCount: 0,
      limitation: "Покрытие измеряет только присутствие карточки для точно распознанного имени. Оно не означает экспертную полноту карточки или корректность каталожной транскрипции."
    }
  };
  const errors = validateExpertCardBatch(batch, { expectedCardCount: CARD_COUNT });
  if (errors.length) throw new Error(`Generated C06 batch is invalid: ${errors.join("; ")}`);
  return batch;
}

const manifest = readJson(manifestPath);
const registryContent = fs.readFileSync(registryPath);
const registry = JSON.parse(registryContent.toString("utf8"));
const batch = buildC06Batch({ manifest, registry, registryContent });
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(batch, null, 2)}\n`);
fs.writeFileSync(auditPath, `${JSON.stringify({
  schemaVersion: batch.schemaVersion,
  batchId: batch.batchId,
  checkedAt: batch.checkedAt,
  selectionPolicy: batch.selectionPolicy,
  coverage: batch.coverage,
  selectedIngredients: batch.cards.map((card) => ({
    batchRank: card.batchRank,
    ingredient: card.ingredient.canonicalName,
    corpusRank: card.corpusPriority.rank,
    formulaCount: card.corpusPriority.formulaCount,
    functionalClasses: card.functionalClasses,
    selectionReasons: card.selectionReasons
  }))
}, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath: path.relative(root, outputPath),
  auditPath: path.relative(root, auditPath),
  cards: batch.cards.length,
  setupCoverage: batch.coverage.setup,
  finalCoverage: batch.coverage.finalHoldoutReadOnly,
  reviewed: batch.coverage.approvedExpertClaimCount
}, null, 2));
