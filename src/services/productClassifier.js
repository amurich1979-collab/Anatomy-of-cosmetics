function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}+\-/\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, patterns) {
  return patterns.filter((pattern) => pattern.test(text));
}

function foundText(found = []) {
  return found
    .map((item) => `${item.name} ${item.category} ${(item.roles || []).join(" ")}`)
    .join(" ");
}

function buildHaystack({ ingredients = [], found = [], rawText = "" }) {
  return normalize([
    rawText,
    ingredients.join(", "),
    foundText(found)
  ].join(" "));
}

const PRODUCT_CLASS_RULES = [
  {
    type: "local_anesthetic",
    label: "местный анестетик / процедурный препарат",
    group: "medical_procedure",
    priority: 100,
    confidence: 0.98,
    shouldScoreAsCosmetic: false,
    intendedUse: "Местная анестезия перед косметологической или медицинской процедурой, только по инструкции производителя или назначению специалиста.",
    application: "Наносится процедурно на ограниченную область и на ограниченное время; не является ежедневным уходом.",
    patterns: [
      /\bprilocaine(?:\s+hydrochloride)?\b/i,
      /\blidocaine(?:\s+hydrochloride)?\b/i,
      /\btetracaine(?:\s+hydrochloride)?\b/i,
      /\bbenzocaine\b/i,
      /\bprocaine(?:\s+hydrochloride)?\b/i,
      /\barticaine(?:\s+hydrochloride)?\b/i,
      /\bmepivacaine(?:\s+hydrochloride)?\b/i,
      /\bbupivacaine(?:\s+hydrochloride)?\b/i,
      /\bfrostoin\b/i,
      /анестетик|анестез|обезбол|numbing|anaesthetic|anesthetic/i
    ],
    safetyNotes: [
      "Не использовать как ежедневное уходовое средство.",
      "Важны концентрация анестетика, площадь нанесения, время экспозиции и противопоказания.",
      "Нужна проверка инструкции, особенно при беременности, лактации, заболеваниях сердца, аллергиях и повреждении кожи."
    ]
  },
  {
    type: "spf",
    label: "SPF / фотозащитное средство",
    group: "cosmetic",
    priority: 80,
    confidence: 0.9,
    shouldScoreAsCosmetic: true,
    intendedUse: "Защита кожи от UV-излучения.",
    application: "Наносить щедро перед выходом на солнце и обновлять по инструкции.",
    patterns: [
      /\bspf\b|sunscreen|sun\s*screen|санскрин|солнцезащит|фотозащит/i,
      /\bzinc oxide\b|\btitanium dioxide\b|\bethylhexyl methoxycinnamate\b|\bavobenzone\b|\buvasorb\b|\btinosorb\b/i
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
    patterns: [
      /\bglycolic acid\b|\blactic acid\b|\bmandelic acid\b|\bsalicylic acid\b|\baha\b|\bbha\b|\bpha\b|peel|пилинг|кислот/i
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
    patterns: [
      /\bretinol\b|\bretinal\b|\bretinyl\b|\bhydroxypinacolone retinoate\b|ретин/i
    ]
  },
  {
    type: "cleanser",
    label: "очищающее средство",
    group: "cosmetic",
    priority: 58,
    confidence: 0.82,
    shouldScoreAsCosmetic: true,
    intendedUse: "Очищение кожи или удаление загрязнений.",
    application: "Нанести, вспенить/распределить и смыть; не оставлять как несмываемый уход.",
    patterns: [
      /cleanser|cleansing|wash|soap|shampoo|очищ|умыван|мыло|шампун/i,
      /\bsodium laureth sulfate\b|\bsodium lauryl sulfate\b|\bcocamidopropyl betaine\b|\bdecyl glucoside\b|\bc10-16 alkyl glucoside\b/i
    ]
  },
  {
    type: "hair_scalp",
    label: "средство для волос или кожи головы",
    group: "cosmetic",
    priority: 54,
    confidence: 0.82,
    shouldScoreAsCosmetic: true,
    intendedUse: "Уход за волосами или кожей головы.",
    application: "Применять на волосистой части головы или волосах по инструкции производителя.",
    patterns: [
      /hair|scalp|волос|кожа головы|бород|trixosil|pyrrolidinyl diaminopyrimidine oxide/i
    ]
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
    patterns: [
      /moistur|cream|serum|barrier|repair|recovery|увлаж|крем|сыворот|барьер|восстанов/i,
      /\bglycerin\b|\bpanthenol\b|\bniacinamide\b|\bsodium hyaluronate\b|\bceramide\b|\bdimethicone\b/i
    ]
  }
];

export function classifyFormulaProduct({ ingredients = [], found = [], rawText = "" } = {}) {
  const haystack = buildHaystack({ ingredients, found, rawText });
  const matches = PRODUCT_CLASS_RULES
    .map((rule) => {
      const matchedPatterns = containsAny(haystack, rule.patterns);
      if (!matchedPatterns.length) return null;
      return {
        type: rule.type,
        label: rule.label,
        group: rule.group,
        priority: rule.priority,
        confidence: Math.min(0.99, rule.confidence + Math.min(matchedPatterns.length - 1, 2) * 0.03),
        shouldScoreAsCosmetic: rule.shouldScoreAsCosmetic,
        isCosmeticRoutine: rule.shouldScoreAsCosmetic,
        intendedUse: rule.intendedUse,
        application: rule.application,
        safetyNotes: rule.safetyNotes || [],
        detectedSignals: matchedPatterns.map((pattern) => String(pattern).replace(/^\/|\/[a-z]*$/gi, "")).slice(0, 8)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);

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
