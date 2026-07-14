function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}+\-/\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function matchAny(text, patterns) {
  return patterns.filter((pattern) => pattern.test(text));
}

function names(found = []) {
  return found.map((item) => item.name || item.input || "");
}

function buildContext({ ingredients = [], found = [], rawText = "", productName = "" }) {
  const ingredientNames = unique([...ingredients, ...names(found)]);
  return {
    productText: normalize(productName || ""),
    ingredientText: normalize(ingredientNames.join(", ")),
    rawText: normalize(rawText || "")
  };
}

const STRONG_CLEANSING_INGREDIENTS = [
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

const MOISTURIZER_SIGNAL_INGREDIENTS = [
  /\bglycerin\b/i,
  /\bsodium hyaluronate\b/i,
  /\bhyaluronic acid\b/i,
  /\bceramide\b/i,
  /\bpetrolatum\b/i,
  /\bdimethicone\b/i,
  /\bcaprylic\/capric triglyceride\b/i,
  /\bcetearyl alcohol\b/i,
  /\bcetyl alcohol\b/i,
  /\bsqualane\b/i,
  /\burea\b/i,
  /\bpanthenol\b/i
];

const PRODUCT_CLASS_RULES = [
  {
    type: "local_anesthetic",
    label: "местный анестетик / процедурный препарат",
    group: "medical_procedure",
    priority: 100,
    confidence: 0.98,
    shouldScoreAsCosmetic: false,
    intendedUse: "Местная анестезия перед косметологической или медицинской процедурой, только по инструкции производителя или назначению специалиста.",
    application: "Наносится процедурно на ограниченную область и ограниченное время; не является ежедневным уходом.",
    productPatterns: [/анестетик|анестез|обезбол|numbing|anaesthetic|anesthetic|emla/i],
    ingredientPatterns: [
      /\bprilocaine(?:\s+hydrochloride)?\b/i,
      /\blidocaine(?:\s+hydrochloride)?\b/i,
      /\btetracaine(?:\s+hydrochloride)?\b/i,
      /\bbenzocaine\b/i,
      /\bprocaine(?:\s+hydrochloride)?\b/i,
      /\barticaine(?:\s+hydrochloride)?\b/i,
      /\bmepivacaine(?:\s+hydrochloride)?\b/i,
      /\bbupivacaine(?:\s+hydrochloride)?\b/i,
      /\bfrostoin\b/i
    ],
    safetyNotes: [
      "Не использовать как ежедневное уходовое средство.",
      "Важны концентрация анестетика, площадь нанесения, время экспозиции и противопоказания.",
      "Нужна проверка инструкции, особенно при беременности, лактации, заболеваниях сердца, аллергиях и повреждении кожи."
    ]
  },
  {
    type: "hair_scalp",
    label: "средство для волос или кожи головы",
    group: "cosmetic",
    priority: 86,
    confidence: 0.86,
    shouldScoreAsCosmetic: true,
    intendedUse: "Уход за волосами или кожей головы.",
    application: "Применять на волосистой части головы или волосах по инструкции производителя.",
    productPatterns: [/hair|scalp|shampoo|conditioner|волос|кожа головы|шампун|кондиционер|бород|trixosil|trichosil/i],
    ingredientPatterns: [
      /\bminoxidil\b/i,
      /\bpyrrolidinyl diaminopyrimidine oxide\b/i,
      /\bpyrithione zinc\b/i,
      /\bguar hydroxypropyltrimonium chloride\b/i
    ],
    requiresProductOrStrongIngredient: true
  },
  {
    type: "spf",
    label: "SPF / фотозащитное средство",
    group: "cosmetic",
    priority: 82,
    confidence: 0.9,
    shouldScoreAsCosmetic: true,
    intendedUse: "Защита кожи от UV-излучения.",
    application: "Наносить щедро перед выходом на солнце и обновлять по инструкции.",
    productPatterns: [/\bspf\b|sunscreen|sun screen|uvmune|anthelios|санскрин|солнцезащит|фотозащит/i],
    ingredientPatterns: [
      /\bzinc oxide\b/i,
      /\btitanium dioxide\b/i,
      /\bethylhexyl salicylate\b/i,
      /\bethyhexyl triazone\b/i,
      /\bethylhexyl triazone\b/i,
      /\bbis-ethylhexyloxyphenol methoxyphenyl triazine\b/i,
      /\bbutyl methoxydibenzoylmethane\b/i,
      /\bdiethylamino hydroxybenzoyl hexyl benzoate\b/i,
      /\bdrometrizole trisiloxane\b/i,
      /\bterephthalylidene dicamphor sulfonic acid\b/i,
      /\bmethoxypropylamino cyclohexenylidene ethoxyethylcyanoacetate\b/i
    ]
  },
  {
    type: "acid_peel",
    label: "кислотное средство / пилинг",
    group: "cosmetic_procedure",
    priority: 74,
    confidence: 0.88,
    shouldScoreAsCosmetic: true,
    intendedUse: "Кератолитическое действие, обновление текстуры кожи, работа с комедонами или пигментацией.",
    application: "Использовать по схеме, с учетом процента кислот и pH; SPF обязателен.",
    productPatterns: [/\baha\b|\bbha\b|\bpha\b|peel|exfoliant|пилинг|эксфолиант|кислотное средство/i],
    ingredientPatterns: [
      /\bglycolic acid\b/i,
      /\blactic acid\b/i,
      /\bmandelic acid\b/i,
      /\bsalicylic acid\b/i,
      /\blactobionic acid\b/i,
      /\bgluconolactone\b/i
    ]
  },
  {
    type: "retinoid",
    label: "ретиноидное активное средство",
    group: "cosmetic",
    priority: 72,
    confidence: 0.88,
    shouldScoreAsCosmetic: true,
    intendedUse: "Активный уход для текстуры, фотостарения, постакне или акне-склонности.",
    application: "Вводить постепенно вечером; не сочетать на старте с кислотами; днем SPF.",
    productPatterns: [/retinol|retinal|retinoid|ретин/i],
    ingredientPatterns: [/\bretinol\b|\bretinal\b|\bretinyl\b|\bhydroxypinacolone retinoate\b/i]
  },
  {
    type: "active_serum",
    label: "активная сыворотка для лица",
    group: "cosmetic",
    priority: 66,
    confidence: 0.8,
    shouldScoreAsCosmetic: true,
    intendedUse: "Точечный активный уход по заявлению производителя: тон, себорегуляция, барьер или текстура.",
    application: "Использовать как активный уход, наблюдая за реакцией кожи.",
    productPatterns: [/serum|сыворот|booster|бустер/i],
    ingredientPatterns: [/\bniacinamide\b/i, /\bzinc pca\b/i],
    requiresTwoIngredientSignals: true
  },
  {
    type: "cleanser",
    label: "очищающее средство",
    group: "cosmetic",
    priority: 60,
    confidence: 0.82,
    shouldScoreAsCosmetic: true,
    intendedUse: "Очищение кожи или удаление загрязнений/макияжа.",
    application: "Использовать как очищающее средство; смывать, если это не мицеллярная вода или иной leave-on формат по инструкции.",
    productPatterns: [/cleanser|cleansing|micellar|makeup remover|wash|soap|face wash|очищ|умыван|мицелляр|мыло/i],
    ingredientPatterns: STRONG_CLEANSING_INGREDIENTS,
    requiresProductOrStrongIngredient: true
  },
  {
    type: "barrier_moisturizer",
    label: "барьерное / увлажняющее уходовое средство",
    group: "cosmetic",
    priority: 40,
    confidence: 0.72,
    shouldScoreAsCosmetic: true,
    intendedUse: "Увлажнение, смягчение и поддержка кожного барьера.",
    application: "Использовать как обычный уход, если нет индивидуальной реакции.",
    productPatterns: [/moistur|cream|lotion|gel cream|water gel|barrier|repair|recovery|увлаж|крем|лосьон|барьер|восстанов/i],
    ingredientPatterns: MOISTURIZER_SIGNAL_INGREDIENTS,
    requiresMultipleIngredientSignals: 3
  }
];

function ruleMatches(rule, context) {
  const productMatches = matchAny(context.productText, rule.productPatterns || []);
  const rawMatches = matchAny(context.rawText, rule.productPatterns || []);
  const ingredientMatches = matchAny(context.ingredientText, rule.ingredientPatterns || []);
  const allProductMatches = unique([...productMatches, ...rawMatches].map(String));

  if (rule.requiresProductOrStrongIngredient && !allProductMatches.length && !ingredientMatches.length) {
    return null;
  }

  if (rule.requiresTwoIngredientSignals && ingredientMatches.length < 2 && !allProductMatches.length) {
    return null;
  }

  if (rule.requiresMultipleIngredientSignals && ingredientMatches.length < rule.requiresMultipleIngredientSignals && !allProductMatches.length) {
    return null;
  }

  if (!allProductMatches.length && !ingredientMatches.length) return null;

  const confidence = Math.min(
    0.99,
    rule.confidence +
      Math.min(allProductMatches.length, 2) * 0.04 +
      Math.min(ingredientMatches.length - 1, 3) * 0.02
  );

  return {
    type: rule.type,
    label: rule.label,
    group: rule.group,
    priority: rule.priority,
    confidence,
    shouldScoreAsCosmetic: rule.shouldScoreAsCosmetic,
    isCosmeticRoutine: rule.shouldScoreAsCosmetic,
    intendedUse: rule.intendedUse,
    application: rule.application,
    safetyNotes: rule.safetyNotes || [],
    detectedSignals: unique([...allProductMatches, ...ingredientMatches].map((pattern) => String(pattern).replace(/^\/|\/[a-z]*$/gi, ""))).slice(0, 8)
  };
}

function resolveConflicts(matches, context) {
  const byType = new Map(matches.map((item) => [item.type, item]));
  const moisturizer = byType.get("barrier_moisturizer");
  const hair = byType.get("hair_scalp");
  const cleanser = byType.get("cleanser");

  const productSaysSkinMoisturizer = /moistur|cream|lotion|water gel|увлаж|крем|лосьон/i.test(context.productText);
  const productSaysHair = /hair|scalp|shampoo|conditioner|волос|кожа головы|шампун|кондиционер/i.test(context.productText);

  if (hair && moisturizer && productSaysSkinMoisturizer && !productSaysHair) {
    hair.confidence = Math.min(hair.confidence, 0.58);
    hair.priority = Math.min(hair.priority, 35);
  }

  if (cleanser && moisturizer && productSaysSkinMoisturizer && !/cleanser|cleansing|wash|micellar|очищ|умыван/i.test(context.productText)) {
    cleanser.confidence = Math.min(cleanser.confidence, 0.6);
    cleanser.priority = Math.min(cleanser.priority, 34);
  }

  return matches.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);
}

export function classifyFormulaProduct({ ingredients = [], found = [], rawText = "", productName = "" } = {}) {
  const context = buildContext({ ingredients, found, rawText, productName });
  const matches = resolveConflicts(
    PRODUCT_CLASS_RULES
      .map((rule) => ruleMatches(rule, context))
      .filter(Boolean),
    context
  );

  const primary = matches[0] || {
    type: "unknown_cosmetic",
    label: "тип продукта требует уточнения по назначению производителя",
    group: "unknown",
    priority: 0,
    confidence: 0.35,
    shouldScoreAsCosmetic: true,
    isCosmeticRoutine: true,
    intendedUse: "Назначение не определено уверенно только по INCI.",
    application: "Нужно сверить карточку продукта, инструкцию и маркировку производителя.",
    safetyNotes: [],
    detectedSignals: []
  };

  return {
    ...primary,
    alternatives: matches.slice(1).map(({ priority, ...item }) => item),
    message: primary.shouldScoreAsCosmetic
      ? `Тип продукта: ${primary.label}.`
      : `В составе есть признаки класса: ${primary.label}. Такой продукт нельзя оценивать как обычный уход для кожи.`
  };
}
