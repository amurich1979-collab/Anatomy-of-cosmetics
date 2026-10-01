function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}+/\-\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const unique = (items) => [...new Set(items.filter(Boolean))];
const countMatches = (text, patterns) => patterns.filter((pattern) => pattern.test(text)).length;
const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const CLASS_INFO = Object.freeze({
  local_anesthetic: { label: "местный анестетик / процедурный препарат", group: "medical_procedure", cosmetic: false },
  hair_scalp: { label: "средство для волос или кожи головы", group: "cosmetic", cosmetic: true },
  spf: { label: "SPF / фотозащитное средство", group: "cosmetic", cosmetic: true },
  acid_peel: { label: "кислотное средство / пилинг", group: "cosmetic_procedure", cosmetic: true },
  retinoid: { label: "ретиноидное активное средство", group: "cosmetic", cosmetic: true },
  active_serum: { label: "активная сыворотка", group: "cosmetic", cosmetic: true },
  cleanser: { label: "очищающее средство", group: "cosmetic", cosmetic: true },
  barrier_moisturizer: { label: "крем или увлажняющее средство", group: "cosmetic", cosmetic: true },
  decorative_cosmetic: { label: "декоративное косметическое средство", group: "cosmetic", cosmetic: true },
  unknown_cosmetic: { label: "назначение не подтверждено", group: "unknown", cosmetic: true }
});

const PRODUCT_PATTERNS = Object.freeze({
  local_anesthetic: [/анестетик|анестез|обезбол|numbing|anaesthetic|anesthetic|\bemla\b/i],
  hair_scalp: [/\bhair\b|\bscalp\b|shampoo|conditioner|волос|кожа головы|шампун|кондиционер|бород|trixosil|trichosil/i],
  spf: [/\bspf\s*\d*\+?\b|sunscreen|sun screen|sun protection|uvmune|anthelios|санскрин|солнцезащит|фотозащит/i],
  acid_peel: [/\baha\b|\bbha\b|\bpha\b|\bpeel(?:ing)?\b|exfoliant|пилинг|эксфолиант|кислотное средство/i],
  retinoid: [/retinol|retinal|retinoid|ретин/i],
  active_serum: [/serum|сыворот|booster|бустер/i],
  cleanser: [/cleanser|cleansing|micellar|makeup remover|face wash|\bwash\b|\bsoap\b|очищ|умыван|мицелляр|мыло/i],
  barrier_moisturizer: [/moistur|\bcream\b|\blotion\b|gel cream|water gel|barrier|repair|recovery|увлаж|\bкрем\b|лосьон|барьер|восстанов/i],
  decorative_cosmetic: [/foundation|concealer|primer|makeup|bb cream|cc cream|тональ|консилер|праймер|макияж|пудр/i]
});

const ANESTHETIC_INGREDIENTS = [
  /\bprilocaine(?:\s+hydrochloride)?\b/i,
  /\blidocaine(?:\s+hydrochloride)?\b/i,
  /\btetracaine(?:\s+hydrochloride)?\b/i,
  /\bbenzocaine\b/i,
  /\bprocaine(?:\s+hydrochloride)?\b/i,
  /\barticaine(?:\s+hydrochloride)?\b/i,
  /\bmepivacaine(?:\s+hydrochloride)?\b/i,
  /\bbupivacaine(?:\s+hydrochloride)?\b/i,
  /\bfrostoin\b/i
];

const CLEANSING_INGREDIENTS = [
  /\bsodium laureth sulfate\b/i,
  /\bsodium lauryl sulfate\b/i,
  /\bcocamidopropyl betaine\b/i,
  /\bdecyl glucoside\b/i,
  /\bcoco glucoside\b/i,
  /\blauryl glucoside\b/i,
  /\bsodium cocoyl isethionate\b/i,
  /\bsodium lauroyl sarcosinate\b/i,
  /\bpeg-6 caprylic\/capric glycerides\b/i,
  /\bcetrimonium bromide\b/i
];

const MOISTURIZER_INGREDIENTS = [
  /\bglycerin\b/i,
  /\bsodium hyaluronate\b/i,
  /\bhyaluronic acid\b/i,
  /\bceramide(?:\s|$)/i,
  /\bpetrolatum\b/i,
  /\bdimethicone\b/i,
  /\bcaprylic\/capric triglyceride\b/i,
  /\bcetearyl alcohol\b/i,
  /\bcetyl alcohol\b/i,
  /\bsqualane\b/i,
  /\burea\b/i,
  /\bpanthenol\b/i
];

const EXFOLIATING_ACIDS = [
  /\bglycolic acid\b/i,
  /\blactic acid\b/i,
  /\bmandelic acid\b/i,
  /\bsalicylic acid\b/i,
  /\blactobionic acid\b/i,
  /\bgluconolactone\b/i
];

const UV_FILTERS = [
  /\bzinc oxide\b/i,
  /\btitanium dioxide\b/i,
  /\bethylhexyl salicylate\b/i,
  /\bethylhexyl triazone\b/i,
  /\bbis-ethylhexyloxyphenol methoxyphenyl triazine\b/i,
  /\bbutyl methoxydibenzoylmethane\b/i,
  /\bdiethylamino hydroxybenzoyl hexyl benzoate\b/i,
  /\bdrometrizole trisiloxane\b/i,
  /\bterephthalylidene dicamphor sulfonic acid\b/i,
  /\bmethoxypropylamino cyclohexenylidene ethoxyethylcyanoacetate\b/i
];

const HAIR_INGREDIENTS = [
  /\bpyrrolidinyl diaminopyrimidine oxide\b/i,
  /\bpyrithione zinc\b/i,
  /\bguar hydroxypropyltrimonium chloride\b/i
];

function sourceOf(productEvidence = {}) {
  const value = productEvidence.source && typeof productEvidence.source === "object" ? productEvidence.source : {};
  return {
    name: value.name || productEvidence.sourceName || (typeof productEvidence.source === "string" ? productEvidence.source : null),
    type: value.type || productEvidence.sourceType || null,
    url: value.url || productEvidence.sourceUrl || null,
    retrievedAt: value.retrievedAt || productEvidence.importedAt || productEvidence.verifiedAt || null
  };
}

function isOfficialManufacturerSource(source) {
  return /official|manufacturer|brand_page|gigi_official/i.test(`${source.type || ""} ${source.name || ""}`) && Boolean(source.url);
}

function explicitClasses(value) {
  const normalized = normalize(value);
  const postProcedureRecovery = /post[-\s]?peel|after[-\s]?peel|постпилинг|после пилинга/i.test(normalized);
  return Object.entries(PRODUCT_PATTERNS)
    .filter(([type]) => type !== "local_anesthetic")
    .filter(([type]) => type !== "acid_peel" || !postProcedureRecovery)
    .filter(([, patterns]) => hasAny(normalized, patterns))
    .map(([type]) => type);
}

function formulaClasses(ingredientText) {
  const candidates = [];
  const cleansingCount = countMatches(ingredientText, CLEANSING_INGREDIENTS);
  const moisturizerCount = countMatches(ingredientText, MOISTURIZER_INGREDIENTS);
  const acidCount = countMatches(ingredientText, EXFOLIATING_ACIDS);
  const filterCount = countMatches(ingredientText, UV_FILTERS);
  const hairCount = countMatches(ingredientText, HAIR_INGREDIENTS);
  if (cleansingCount) candidates.push({ type: "cleanser", signals: cleansingCount });
  if (hairCount) candidates.push({ type: "hair_scalp", signals: hairCount });
  if (moisturizerCount >= 3) candidates.push({ type: "barrier_moisturizer", signals: moisturizerCount });
  if (acidCount >= 2 && !cleansingCount) candidates.push({ type: "acid_peel", signals: acidCount });
  if (filterCount >= 2) candidates.push({ type: "spf", signals: filterCount });
  return candidates;
}

function compatible(left, right) {
  if (left === right) return true;
  if ([left, right].includes("barrier_moisturizer") && ![left, right].includes("local_anesthetic")) return true;
  return [
    new Set(["hair_scalp", "cleanser"]),
    new Set(["retinoid", "active_serum"])
  ].some((set) => set.has(left) && set.has(right));
}

function preferredCompatible(types) {
  if (types.includes("hair_scalp")) return "hair_scalp";
  if (types.includes("spf")) return "spf";
  if (types.includes("retinoid")) return "retinoid";
  if (types.includes("active_serum")) return "active_serum";
  return types[0] || null;
}

function evidenceObject(status, basis, source, signals = []) {
  return { status, basis, source: source?.url || source?.name ? source : null, signals: unique(signals) };
}

function formatFromText(value, status, source) {
  const normalized = normalize(value);
  const formats = [
    ["shampoo", /shampoo|шампун/i],
    ["cleanser", /cleanser|cleansing|face wash|умыван|очищ|мыло/i],
    ["cream", /\bcream\b|\bкрем\b/i],
    ["lotion", /\blotion\b|лосьон/i],
    ["serum", /serum|сыворот/i],
    ["gel", /\bgel\b|\bгель\b/i],
    ["peel", /\bpeel(?:ing)?\b|пилинг/i],
    ["powder", /powder|пудр/i]
  ];
  const match = formats.find(([, pattern]) => pattern.test(normalized));
  return { value: match?.[0] || null, status: match ? status : "unknown", source: match && source ? source : null };
}

function areaFromText(value, status, source) {
  const normalized = normalize(value);
  const areas = [
    ["hair_or_scalp", /hair|scalp|волос|кожа головы|шампун/i],
    ["face", /face|facial|лиц[ао]|кож[ау] лица/i],
    ["body", /body|тел[ао]/i],
    ["lips", /lip|губ/i],
    ["eye_area", /eye|век|глаз/i]
  ];
  const match = areas.find(([, pattern]) => pattern.test(normalized));
  return { value: match?.[0] || null, status: match ? status : "unknown", source: match && source ? source : null };
}

function exposureFromInstruction(instruction, source) {
  const normalized = normalize(instruction);
  if (!normalized) return { mode: "unknown", status: "unknown", source: null };
  if (/не смыва|leave[-\s]?on|оставить на коже|до полного впитывания/i.test(normalized)) {
    return { mode: "leave_on", status: "source_backed", source };
  }
  if (/смыть|смойте|rinse|wash off/i.test(normalized)) {
    return { mode: "rinse_off", status: "source_backed", source };
  }
  return { mode: "unknown", status: "source_backed_but_unspecified", source };
}

function unknownResult({ conflicts = [], alternatives = [], source = null } = {}) {
  const info = CLASS_INFO.unknown_cosmetic;
  return {
    type: "unknown_cosmetic",
    label: info.label,
    group: info.group,
    confidence: null,
    confidenceStatus: "not_calibrated",
    shouldScoreAsCosmetic: true,
    isCosmeticRoutine: false,
    purposeStatus: "uncertain",
    intendedUse: "Назначение не подтверждено. По составу нельзя надежно определить формат и применение готового продукта.",
    purposeEvidence: evidenceObject("insufficient_data", "conflicting_or_missing_product_evidence", source),
    application: "Способ применения не установлен. Нужна этикетка или карточка именно этого продукта.",
    applicationEvidence: evidenceObject("unavailable", "no_verified_instruction", null),
    format: { value: null, status: "unknown", source: null },
    applicationArea: { value: null, status: "unknown", source: null },
    exposure: { mode: "unknown", status: "unknown", source: null },
    safetyNotes: [],
    detectedSignals: [],
    conflicts,
    alternatives,
    requiredVerification: "Сверьте название, категорию, зону нанесения и способ применения на этикетке или в карточке производителя.",
    message: "Назначение продукта не подтверждено; анализ состава не используется как инструкция по применению."
  };
}

function medicalResult(ingredientText, nameText) {
  const matches = ANESTHETIC_INGREDIENTS.filter((pattern) => pattern.test(ingredientText)).map(String);
  const nameMatch = hasAny(nameText, PRODUCT_PATTERNS.local_anesthetic);
  if (!matches.length && !nameMatch) return null;
  const info = CLASS_INFO.local_anesthetic;
  return {
    type: "local_anesthetic",
    label: info.label,
    group: info.group,
    confidence: null,
    confidenceStatus: "safety_rule_not_probability",
    shouldScoreAsCosmetic: false,
    isCosmeticRoutine: false,
    purposeStatus: "safety_flag",
    intendedUse: "Есть признаки местного анестетика или процедурного препарата. Точное назначение подтверждается инструкцией конкретного продукта.",
    purposeEvidence: evidenceObject("safety_flag", matches.length ? "ingredient_safety_signal" : "product_name_signal", null, matches),
    application: "Схема применения по INCI не определяется и не формируется. Проверьте официальную инструкцию и назначение специалиста для конкретного препарата.",
    applicationEvidence: evidenceObject("unavailable", "medical_instruction_required", null),
    format: formatFromText(nameText, "hypothesis", null),
    applicationArea: { value: null, status: "unknown", source: null },
    exposure: { mode: "unknown", status: "unknown", source: null },
    safetyNotes: [
      "Не оценивать как обычное ежедневное уходовое средство.",
      "По INCI нельзя установить допустимую дозу, площадь, экспозицию или противопоказания."
    ],
    detectedSignals: matches,
    conflicts: [],
    alternatives: [],
    requiredVerification: "Нужна официальная инструкция именно этого препарата.",
    message: "Обнаружены признаки процедурного или лекарственного средства; косметическая оценка отключена."
  };
}

function classifiedResult({ type, purposeStatus, basis, source, productText, instruction, alternatives = [], signals = [] }) {
  const info = CLASS_INFO[type];
  const statusLabel = purposeStatus === "confirmed_manufacturer"
    ? "Назначение подтверждено карточкой производителя"
    : purposeStatus === "source_backed"
      ? "Назначение указано в выбранной карточке источника"
      : "Гипотеза по названию и составу; производитель не подтвержден";
  const instructionStatus = instruction && ["confirmed_manufacturer", "source_backed"].includes(purposeStatus)
    ? purposeStatus
    : "unavailable";
  const application = instructionStatus === "unavailable"
    ? "Способ применения не установлен. Нужна инструкция именно этого продукта."
    : instruction;
  return {
    type,
    label: info.label,
    group: info.group,
    confidence: null,
    confidenceStatus: "not_calibrated",
    shouldScoreAsCosmetic: info.cosmetic,
    isCosmeticRoutine: info.cosmetic,
    purposeStatus,
    intendedUse: `${statusLabel}: ${info.label}.`,
    purposeEvidence: evidenceObject(purposeStatus, basis, source, signals),
    application,
    applicationEvidence: evidenceObject(instructionStatus, instructionStatus === "unavailable" ? "no_verified_instruction" : "product_instruction", instructionStatus === "unavailable" ? null : source),
    format: formatFromText(productText, purposeStatus, source),
    applicationArea: areaFromText(`${productText} ${instruction || ""}`, purposeStatus, source),
    exposure: instructionStatus === "unavailable" ? { mode: "unknown", status: "unknown", source: null } : exposureFromInstruction(instruction, source),
    safetyNotes: [],
    detectedSignals: unique(signals),
    conflicts: [],
    alternatives,
    requiredVerification: purposeStatus === "confirmed_manufacturer"
      ? "Сверьте вариант продукта, рынок и актуальность этикетки."
      : "Сверьте назначение и способ применения с этикеткой или карточкой производителя.",
    message: `${statusLabel}: ${info.label}.`
  };
}

export function classifyFormulaProduct({ ingredients = [], found = [], rawText = "", productName = "", productEvidence = {} } = {}) {
  const ingredientNames = unique([...ingredients, ...found.map((item) => item.name || item.input || "")]);
  const ingredientText = normalize(ingredientNames.join(", "));
  const nameText = normalize(productName || productEvidence.name || "");
  const medical = medicalResult(ingredientText, nameText);
  if (medical) return medical;

  const source = sourceOf(productEvidence);
  const identified = productEvidence.identificationStatus === "confirmed";
  const manufacturer = identified && isOfficialManufacturerSource(source);
  const sourceBacked = identified && Boolean(source.url || source.name);
  const declaredText = normalize([
    productEvidence.name,
    productEvidence.category,
    productEvidence.description
  ].filter(Boolean).join(" "));
  const declaredTypes = sourceBacked ? unique(explicitClasses(declaredText)) : [];
  const nameTypes = unique(explicitClasses(nameText));
  const formulaCandidates = formulaClasses(ingredientText);
  const formulaTypes = formulaCandidates.map((item) => item.type);

  if (declaredTypes.length > 1 && declaredTypes.some((type) => declaredTypes.some((other) => !compatible(type, other)))) {
    return unknownResult({
      source,
      conflicts: [{ kind: "source_metadata_conflict", types: declaredTypes, message: "Карточка источника содержит признаки разных назначений." }],
      alternatives: declaredTypes.map((type) => ({ type, label: CLASS_INFO[type].label, evidence: "source" }))
    });
  }

  const declaredType = preferredCompatible(declaredTypes);
  if (declaredType) {
    const incompatibleFormula = formulaTypes.filter((type) => !compatible(declaredType, type));
    if (incompatibleFormula.length) {
      return unknownResult({
        source,
        conflicts: [{ kind: "source_formula_conflict", sourceType: declaredType, formulaTypes: incompatibleFormula, message: "Назначение карточки противоречит функциональным признакам состава." }],
        alternatives: [declaredType, ...incompatibleFormula].map((type) => ({ type, label: CLASS_INFO[type].label, evidence: type === declaredType ? "source" : "formula_hypothesis" }))
      });
    }
    return classifiedResult({
      type: declaredType,
      purposeStatus: manufacturer ? "confirmed_manufacturer" : "source_backed",
      basis: manufacturer ? "manufacturer_product_card" : "selected_product_card",
      source,
      productText: declaredText,
      instruction: productEvidence.useInstructions || "",
      alternatives: formulaTypes.filter((type) => type !== declaredType).map((type) => ({ type, label: CLASS_INFO[type].label, evidence: "formula_hypothesis" })),
      signals: declaredTypes
    });
  }

  if (nameTypes.length > 1 && nameTypes.some((type) => nameTypes.some((other) => !compatible(type, other)))) {
    return unknownResult({
      conflicts: [{ kind: "product_name_conflict", types: nameTypes, message: "Название содержит признаки разных назначений." }],
      alternatives: nameTypes.map((type) => ({ type, label: CLASS_INFO[type].label, evidence: "product_name_hypothesis" }))
    });
  }

  const nameType = preferredCompatible(nameTypes);
  if (nameType) {
    const incompatibleFormula = formulaTypes.filter((type) => !compatible(nameType, type));
    if (incompatibleFormula.length) {
      return unknownResult({
        conflicts: [{ kind: "name_formula_conflict", nameType, formulaTypes: incompatibleFormula, message: "Название и признаки состава указывают на разные типы продукта." }],
        alternatives: [nameType, ...incompatibleFormula].map((type) => ({ type, label: CLASS_INFO[type].label, evidence: type === nameType ? "product_name_hypothesis" : "formula_hypothesis" }))
      });
    }
    return classifiedResult({
      type: nameType,
      purposeStatus: "hypothesis",
      basis: "unverified_product_name",
      source: null,
      productText: nameText,
      instruction: "",
      alternatives: formulaTypes.filter((type) => type !== nameType).map((type) => ({ type, label: CLASS_INFO[type].label, evidence: "formula_hypothesis" })),
      signals: nameTypes
    });
  }

  if (formulaTypes.length === 1) {
    const type = formulaTypes[0];
    return classifiedResult({
      type,
      purposeStatus: "hypothesis",
      basis: "formula_function_hypothesis",
      source: null,
      productText: rawText,
      instruction: "",
      signals: formulaCandidates.map((item) => `${item.type}:${item.signals}`)
    });
  }

  if (formulaTypes.length > 1) {
    const allCompatible = formulaTypes.every((type) => formulaTypes.every((other) => compatible(type, other)));
    if (allCompatible) {
      const type = preferredCompatible(formulaTypes);
      return classifiedResult({
        type,
        purposeStatus: "hypothesis",
        basis: "compatible_formula_function_hypotheses",
        source: null,
        productText: rawText,
        instruction: "",
        alternatives: formulaTypes.filter((item) => item !== type).map((item) => ({ type: item, label: CLASS_INFO[item].label, evidence: "formula_hypothesis" })),
        signals: formulaCandidates.map((item) => `${item.type}:${item.signals}`)
      });
    }
    return unknownResult({
      conflicts: [{ kind: "formula_hypothesis_conflict", types: formulaTypes, message: "Состав совместим с несколькими разными типами продукта." }],
      alternatives: formulaTypes.map((type) => ({ type, label: CLASS_INFO[type].label, evidence: "formula_hypothesis" }))
    });
  }

  return unknownResult();
}
