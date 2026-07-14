import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanInciText } from "./services/inciCleaner.js";
import { findCosIngIngredient } from "./services/ingredientSources/cosing.js";
import { classifyFormulaProduct } from "./services/productClassifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INGREDIENTS_PATH = path.join(__dirname, "..", "data", "ingredients-expert.json");

const INGREDIENTS = JSON.parse(fs.readFileSync(INGREDIENTS_PATH, "utf8"));
const INGREDIENT_INDEX = buildIngredientIndex(INGREDIENTS);

const PROPRIETARY_COMPLEX_PATTERNS = [
  /\bret\s+complex\b/i,
  /\b[a-z0-9+\-\s]+complex\b/i
];

const ROLE_GROUPS = {
  hydration: ["увлажнитель", "humectant", "nmf", "пленкообразователь"],
  barrier: ["эмолент", "окклюзив", "керамид", "барьер", "липид", "воск", "жирная кислота", "силикон"],
  active: ["актив", "aha", "bha", "pha", "ретиноид", "антиоксидант", "spf-фильтр", "uv-фильтр", "пептид"],
  irritation: ["aha", "bha", "pha", "ретиноид", "отдушка", "аллерген", "эфирное масло", "anion surfactant"]
};

const CATEGORY_GROUPS = {
  hydration: ["увлажнитель"],
  barrier: ["эмолент", "керамид", "масло", "воск", "окклюзив", "силикон"],
  active: ["актив", "кислота", "ретиноид", "spf-фильтр", "антиоксидант", "пептид"],
  irritation: ["отдушка", "эфирное масло", "кислота", "ретиноид", "пав"]
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}+\-/\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIngredientIndex(items) {
  const index = new Map();
  items.forEach((item) => {
    [item.name, ...(item.aliases || [])].forEach((name) => {
      const key = normalize(name);
      if (key) index.set(key, item);
    });
  });
  return index;
}

function concentrationZone(index, total) {
  if (index === 0) return "основа формулы";
  if (index <= 4) return "вероятно высокая или средняя концентрационная зона";
  if (index / Math.max(total, 1) < 0.45) return "вероятно средняя зона";
  return "вероятно низкая зона или блок до/ниже 1%";
}

function positionWeight(position, total) {
  const ratio = position / Math.max(total, 1);
  if (position <= 5) return 1;
  if (ratio < 0.45) return 0.72;
  return 0.42;
}

export function parseIngredients(text) {
  return cleanInciText(text || "").ingredients;
}

function findIngredient(raw) {
  if (PROPRIETARY_COMPLEX_PATTERNS.some((pattern) => pattern.test(String(raw || "")))) {
    return {
      name: String(raw || "").trim(),
      category: "proprietary_complex",
      roles: [],
      benefits: [],
      risks: ["Комплекс производителя: свойства и концентрации нельзя определить по INCI без раскрытого состава."],
      best_for: [],
      avoid_for: [],
      quality_score: 0,
      evidence_level: "undisclosed",
      dataSource: "proprietary_complex",
      excludedFromScoring: true
    };
  }

  const key = normalize(raw);
  if (INGREDIENT_INDEX.has(key)) return INGREDIENT_INDEX.get(key);

  const slashParts = key.split("/").map((part) => part.trim()).filter(Boolean);
  for (const part of slashParts) {
    if (INGREDIENT_INDEX.has(part)) return INGREDIENT_INDEX.get(part);
  }

  const cosing = findCosIngIngredient(raw);
  if (!cosing) return null;
  if (cosing.match?.type === "fuzzy" && (cosing.match.confidence || 0) < 0.95) return null;

  return {
    name: cosing.name,
    category: cosing.functions[0] || "CosIng",
    roles: cosing.functions,
    benefits: cosing.functions.length ? [`Функции по CosIng: ${cosing.functions.join(", ")}.`] : ["Ингредиент найден в CosIng, функции не указаны."],
    risks: [],
    best_for: [],
    avoid_for: [],
    quality_score: 55,
    evidence_level: "cosing",
    dataSource: "CosIng",
    sourceFile: cosing.sourceFile,
    match: cosing.match
  };
}

function hasRole(item, patterns) {
  const haystack = `${item.category} ${(item.roles || []).join(" ")}`.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

function scoreBy(found, group, base = 0) {
  const rolePatterns = ROLE_GROUPS[group] || [];
  const categoryPatterns = CATEGORY_GROUPS[group] || [];
  const total = found.length || 1;
  const raw = found.filter((item) => !item.excludedFromScoring).reduce((sum, item) => {
    const category = item.category.toLowerCase();
    const match = hasRole(item, rolePatterns) || categoryPatterns.some((pattern) => (
      pattern === "кислота" ? category === "кислота" : category.includes(pattern)
    ));
    if (!match) return sum;
    return sum + positionWeight(item.position, total) * (item.quality_score / 100) * 24;
  }, base);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function irritationScore(found, profile = {}) {
  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();
  const sensitiveProfile = /чувств|розацеа|дерматит|после|барьер|жжение|покрасн/.test(profileText);
  const acneProfile = /акне|комедон|жирн/.test(profileText);
  const total = found.length || 1;

  const raw = found.filter((item) => !item.excludedFromScoring).reduce((sum, item) => {
    let add = 0;
    if (hasRole(item, ROLE_GROUPS.irritation)) add += 14;
    if ((item.risks || []).length) add += Math.min(12, item.risks.length * 3);
    if (sensitiveProfile && (item.avoid_for || []).some((value) => /чувств|розацеа|дерматит|после/.test(value.toLowerCase()))) add += 10;
    if (acneProfile && (item.avoid_for || []).some((value) => /акне|комедон|жирн/.test(value.toLowerCase()))) add += 7;
    return sum + add * positionWeight(item.position, total);
  }, 0);

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formulaScores(found, unknownCount, profile) {
  const hydration_score = scoreBy(found, "hydration");
  const barrier_score = scoreBy(found, "barrier");
  const active_score = scoreBy(found, "active");
  const irritation_risk = Math.min(100, irritationScore(found, profile) + Math.min(unknownCount * 2, 16));
  return { hydration_score, barrier_score, irritation_risk, active_score };
}

function qualityLevel(score) {
  if (score >= 8.5) return "сильная компонентная база";
  if (score >= 7) return "хорошая компонентная база";
  if (score >= 5.5) return "средняя компонентная база";
  return "требует проверки";
}

function qualityNote(item) {
  if (item.excludedFromScoring) {
    return "Не оценивается: это скрытый комплекс производителя без раскрытого состава.";
  }
  if (item.dataSource === "CosIng") {
    return "Найден в CosIng: функция подтверждена справочником, но экспертная оценка ограничена.";
  }
  if (item.evidence_level === "high") {
    return "Хорошо изученный компонент с понятной ролью в формуле.";
  }
  if (item.evidence_level === "medium") {
    return "Рабочий компонент, но итоговая ценность сильнее зависит от концентрации и общей формулы.";
  }
  return "Оценка предварительная: нужны концентрация, pH и данные готового продукта.";
}

function componentQualityScore(item) {
  if (item.excludedFromScoring) return null;
  const raw = Number(item.quality_score);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(raw / 10)));
}

function buildQualitySummary(found, unknownCount, totalIngredients, productSafety) {
  if (productSafety?.shouldScoreAsCosmetic === false) {
    return {
      score: null,
      label: "не оценивается как косметическая формула",
      confidence: "низкая",
      methodology: "Оценка качества компонентной базы отключена: средство похоже на процедурный препарат, а не на обычный уход.",
      knownCount: found.filter((item) => !item.excludedFromScoring).length,
      unknownCount,
      totalIngredients
    };
  }

  const scored = found.filter((item) => !item.excludedFromScoring && Number.isFinite(Number(item.quality_score)));
  const total = totalIngredients || found.length + unknownCount || 1;
  const weightedSum = scored.reduce((sum, item) => sum + componentQualityScore(item) * positionWeight(item.position, total), 0);
  const weightSum = scored.reduce((sum, item) => sum + positionWeight(item.position, total), 0);
  const baseScore = weightSum ? weightedSum / weightSum : 0;
  const unknownPenalty = Math.min(1.6, unknownCount * 0.18);
  const score = scored.length ? Math.max(1, Math.min(10, Math.round((baseScore - unknownPenalty) * 10) / 10)) : null;
  const coverage = totalIngredients ? scored.length / totalIngredients : 0;

  return {
    score,
    label: score ? qualityLevel(score) : "недостаточно данных",
    confidence: coverage >= 0.85 && unknownCount <= 2 ? "хорошая" : coverage >= 0.55 ? "средняя" : "низкая",
    methodology: "Это оценка качества компонентной базы по INCI: доказанность роли, уместность функции, профиль переносимости и место в списке. Это не оценка чистоты сырья, поставщика, процента ввода, pH или лабораторных тестов готового продукта.",
    knownCount: scored.length,
    unknownCount,
    totalIngredients
  };
}

function scoreFormula(expertScores, unknownCount) {
  const supportBonus = Math.round((expertScores.hydration_score + expertScores.barrier_score + expertScores.active_score) / 12);
  const riskPenalty = Math.round(expertScores.irritation_risk * 0.42) + Math.min(unknownCount * 2, 14);
  const value = Math.max(0, Math.min(100, 72 + supportBonus - riskPenalty));
  const label = value >= 75 ? "низкая настороженность" : value >= 55 ? "умеренная настороженность" : "высокая настороженность";
  return { score: value, label };
}

function nonCosmeticScores() {
  return {
    hydration_score: 0,
    barrier_score: 0,
    irritation_risk: 100,
    active_score: 0
  };
}

function buildProcedureOverride({ safety, ingredients, found, unknown }) {
  const detected = [
    ...found.map((item) => item.name),
    ...unknown.map((item) => item.input)
  ].filter((name) => /prilocaine|lidocaine|tetracaine|benzocaine|procaine|articaine|mepivacaine|bupivacaine|frostoin/i.test(name));

  const detectedText = detected.length ? ` Обнаружено: ${[...new Set(detected)].join(", ")}.` : "";

  return {
    expertScores: nonCosmeticScores(),
    formulaType: safety.label,
    score: { score: 0, label: "не оценивать как уходовое средство" },
    summary: [
      `Похоже на: ${safety.label}.`,
      `Это не обычная косметическая формула для ухода за кожей.${detectedText}`,
      "Косметические баллы, подбор аналогов по уходу и советы по введению в рутину здесь неприменимы.",
      "Нужно сверить назначение, противопоказания, способ применения и ограничения по инструкции производителя или у специалиста."
    ].join(" "),
    positives: ["процедурное обезболивание только по инструкции производителя или назначению специалиста"],
    warnings: [
      ...safety.safetyNotes,
      "Не использовать как ежедневное уходовое средство.",
      "Не наносить на большие площади, поврежденную кожу, слизистые или под окклюзию без инструкции/назначения.",
      "Для местных анестетиков важны дозировка, площадь нанесения, время экспозиции и противопоказания.",
      "При беременности, лактации, заболеваниях сердца, аллергии на анестетики или при приеме лекарств нужна консультация врача."
    ].filter((item, index, arr) => arr.indexOf(item) === index),
    expertSummary: [
      `Похоже на: ${safety.label}.`,
      "Сервис остановил обычную косметическую интерпретацию, потому что в INCI есть признаки местного анестетика.",
      "Вспомогательные компоненты вроде Aqua, эмульгаторов, загустителей и консервантов не делают такую формулу уходовым кремом.",
      "Главная проверка здесь не «для какого типа кожи», а безопасность применения по инструкции: концентрация анестетика, площадь, время, противопоказания."
    ],
    routineAdvice: [
      "Не вводить в домашний уход как крем/сыворотку.",
      "Использовать только по назначению: перед процедурой, в указанном количестве и на указанное время.",
      "Смывать/удалять и выдерживать ограничения так, как указано в инструкции производителя."
    ],
    questions: [
      "Какая концентрация анестетика и максимальная площадь нанесения указаны в инструкции?",
      "Сколько минут держать средство и нужно ли удалять его перед процедурой?",
      "Какие противопоказания и ограничения есть для клиента: беременность, лактация, сердечно-сосудистые заболевания, аллергии, повреждения кожи?"
    ],
    architecture: [
      {
        title: "Процедурное назначение",
        text: "Формула содержит признаки местного анестетика; косметическая оценка ухода отключена."
      },
      {
        title: "Основа и вспомогательные компоненты",
        text: ingredients.filter((item) => !detected.includes(item)).slice(0, 8).join(", ")
      }
    ].filter((item) => item.text),
    confidence: {
      label: "требует проверки инструкции",
      text: "Класс продукта определен по сигнальным ингредиентам, но безопасность применения нельзя выводить только по INCI."
    },
    disclaimer: "Это не медицинское назначение. Для анестетиков и процедурных препаратов обязательны инструкция производителя, противопоказания и профессиональная оценка."
  };
}

function confidenceLevel(found, totalIngredients, unknownCount) {
  if (!totalIngredients) {
    return { label: "низкая", text: "Состав не удалось разобрать: нужен полный список ингредиентов." };
  }
  const ratio = found.length / totalIngredients;
  if (ratio >= 0.85 && unknownCount <= 3) {
    return { label: "хорошая", text: "Большая часть состава распознана. Ограничения: неизвестны проценты, pH и тесты готового продукта." };
  }
  if (ratio >= 0.55) {
    return { label: "средняя", text: "Часть состава распознана, поэтому выводы лучше считать предварительными." };
  }
  return { label: "низкая", text: "Много ингредиентов не найдено в экспертной базе, анализ требует ручной проверки." };
}

function inferFormulaType(found, rawText) {
  const text = normalize(rawText);
  const has = (group) => found.some((item) => hasRole(item, ROLE_GROUPS[group] || [group]));
  const hasCategory = (pattern) => found.some((item) => item.category.toLowerCase().includes(pattern));

  if (hasCategory("spf") || /spf|sunscreen|санскрин|фотозащит/.test(text)) return "SPF/фотозащитное средство";
  if (hasCategory("ретиноид")) return "ретиноидное активное средство";
  if (found.some((item) => item.category.toLowerCase() === "кислота" || /\b(AHA|BHA|PHA)\b/i.test(item.roles.join(" ")))) return "кислотное средство или пилинг-подобная формула";
  if (found.some((item) => /sodium laureth sulfate|sodium lauryl sulfate|cocamidopropyl betaine|decyl glucoside/i.test(item.name))) return "очищающее средство";
  if (has("barrier") && has("hydration")) return "питательный крем/бальзам для сухой кожи и поддержки барьера";
  if (has("hydration")) return "увлажняющее уходовое средство";
  return "уходовое средство, тип требует уточнения по назначению производителя";
}

function roleGroups(found) {
  const map = new Map();
  found.filter((item) => !item.excludedFromScoring).forEach((item) => {
    item.roles.forEach((role) => {
      if (!map.has(role)) map.set(role, []);
      map.get(role).push(item.name);
    });
  });
  return Array.from(map.entries()).map(([role, items]) => ({ role, items: [...new Set(items)] }));
}

function namesBy(found, predicate) {
  return found.filter(predicate).map((item) => item.name);
}

function buildFormulaArchitecture(found) {
  const scored = found.filter((item) => !item.excludedFromScoring);
  const rows = [
    { title: "Водная и увлажняющая часть", items: namesBy(scored, (item) => hasRole(item, ROLE_GROUPS.hydration)) },
    { title: "Жировая/барьерная часть", items: namesBy(scored, (item) => hasRole(item, ROLE_GROUPS.barrier)) },
    { title: "Активы", items: namesBy(scored, (item) => hasRole(item, ROLE_GROUPS.active)) },
    { title: "Эмульгаторы и стабилизаторы", items: namesBy(scored, (item) => /эмульгатор|стабилизатор|загуститель|солюбилизатор/i.test(`${item.category} ${item.roles.join(" ")}`)) },
    { title: "Консервация", items: namesBy(scored, (item) => /консервант|бустер консервации/i.test(`${item.category} ${item.roles.join(" ")}`)) },
    { title: "Отдушка и потенциальные аллергены", items: namesBy(scored, (item) => /отдушка|аллерген|эфирное масло/i.test(`${item.category} ${item.roles.join(" ")}`)) }
  ];

  return rows
    .map((row) => ({ title: row.title, text: [...new Set(row.items)].join(", ") }))
    .filter((row) => row.text);
}

function buildWarnings(found, profile) {
  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();
  const warnings = new Set(found.filter((item) => !item.excludedFromScoring).flatMap((item) => item.risks || []));

  if (/чувств|розацеа|дерматит|после|жжение|покрасн/.test(profileText)) {
    found.forEach((item) => {
      if ((item.avoid_for || []).some((value) => /чувств|розацеа|дерматит|после/.test(value.toLowerCase()))) {
        warnings.add(`${item.name}: может быть не лучшим выбором для реактивной кожи или постпроцедурного периода.`);
      }
    });
  }
  if (found.some((item) => /spf-фильтр|uv-фильтр/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    warnings.add("Реальный SPF/UVA-PF нельзя подтвердить по одному INCI: нужны тесты готового продукта.");
  }
  return [...warnings].slice(0, 10);
}

function buildExpertSummary(found, scores, formulaType) {
  const lines = [
    `Похоже на: ${formulaType}.`
  ];

  if (scores.hydration_score >= 45) lines.push("Увлажняющий блок выражен: формула содержит компоненты, которые притягивают или удерживают воду в роговом слое.");
  if (scores.barrier_score >= 45) lines.push("Барьерная часть заметная: есть смягчающие, липидные или окклюзивные компоненты для снижения сухости и потери влаги.");
  if (scores.active_score >= 45) lines.push("Активная часть выражена: средство может давать целевой эффект, но важны концентрации, pH и переносимость.");
  if (scores.irritation_risk >= 55) lines.push("Риск раздражения повышен: формулу лучше вводить постепенно, особенно при чувствительности, розацеа или после процедур.");
  if (!found.length) lines.push("База пока не распознала ключевые ингредиенты, поэтому вывод ограничен.");
  if (lines.length === 1) lines.push("Формула выглядит как базовое уходовое средство; главная неопределенность - проценты, pH и индивидуальная переносимость.");

  return lines;
}

function buildRoutineAdvice(found, scores) {
  const advice = [];
  if (found.some((item) => /ретиноид/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    advice.push("Ретиноиды вводить вечером постепенно, не сочетать на старте с кислотами и ежедневно использовать SPF.");
  }
  if (found.some((item) => /aha|bha|pha|кислота/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    advice.push("Кислоты вводить по схеме; при курсовом применении нужен SPF и контроль сухости/жжения.");
  }
  if (scores.barrier_score >= 55) advice.push("Можно рассматривать как поддержку барьера, если нет жжения, зуда или усиления высыпаний.");
  if (scores.irritation_risk >= 55) advice.push("Перед регулярным применением лучше сделать пробу на небольшом участке.");
  if (!advice.length) advice.push("Вводить как обычное новое средство: постепенно и с наблюдением за реакцией кожи.");
  return advice;
}

function buildQuestions(found) {
  const questions = ["Какие проценты ключевых активов, pH и назначение заявлены производителем?"];
  if (found.some((item) => /spf-фильтр|uv-фильтр/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    questions.push("Есть ли подтвержденные SPF/UVA-PF тесты именно готового продукта?");
  }
  if (found.some((item) => /ретиноид|кислота/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    questions.push("Как встроить средство в текущую схему, чтобы не перегрузить кожу?");
  }
  if (found.some((item) => /отдушка|аллерген/i.test(`${item.category} ${item.roles.join(" ")}`))) {
    questions.push("Есть ли версия без отдушки для чувствительной кожи?");
  }
  return questions;
}

function buildProprietaryComplexes(found) {
  return found
    .filter((item) => item.category === "proprietary_complex")
    .map((item) => ({
      name: item.name,
      input: item.input,
      note: "Комплекс производителя сохранен как исходное название. Его свойства, состав и концентрации нельзя определить по INCI без раскрытия производителем.",
      excludedFromScoring: true
    }));
}

export function analyzeComposition({ text, profile = {} }) {
  const inciCleaning = cleanInciText(text || "");
  const ingredients = inciCleaning.ingredients;
  const found = [];
  const unknown = [];

  ingredients.forEach((ingredient, index) => {
    const record = findIngredient(ingredient);
    if (record) {
      found.push({
        input: ingredient,
        name: record.name,
        ru: record.category,
        category: record.category,
        roles: record.roles || [],
        benefits: record.benefits || [],
        risks: record.risks || [],
        best_for: record.best_for || [],
        avoid_for: record.avoid_for || [],
        quality_score: record.quality_score,
        ingredient_quality_score: componentQualityScore(record),
        quality_label: componentQualityScore(record) ? qualityLevel(componentQualityScore(record)) : "не оценивается",
        quality_note: qualityNote(record),
        evidence_level: record.evidence_level,
        dataSource: record.dataSource || "expert",
        suggested_match: record.match?.suggested_match,
        match_confidence: record.match?.confidence,
        match_type: record.match?.type,
        excludedFromScoring: Boolean(record.excludedFromScoring),
        note: [...(record.benefits || []), ...(record.risks || []).slice(0, 1)].join(" "),
        cautions: record.risks || [],
        skin: record.best_for || [],
        position: index + 1,
        concentration: concentrationZone(index, ingredients.length)
      });
      return;
    }

    const suggestion = inciCleaning.suggestions.find((item) => normalize(item.original) === normalize(ingredient));
    unknown.push({
      input: ingredient,
      position: index + 1,
      concentration: concentrationZone(index, ingredients.length),
      suggested_match: suggestion?.suggested_match,
      match_confidence: suggestion?.confidence
    });
  });

  const productSafety = classifyFormulaProduct({ ingredients, found, rawText: text || "" });
  const procedureOverride = productSafety.shouldScoreAsCosmetic
    ? null
    : buildProcedureOverride({ safety: productSafety, ingredients, found, unknown });
  const expertScores = procedureOverride?.expertScores || formulaScores(found, unknown.length, profile);
  const formulaType = procedureOverride?.formulaType || (
    productSafety.confidence >= 0.72 ? productSafety.label : inferFormulaType(found, text || "")
  );
  const warnings = procedureOverride?.warnings || buildWarnings(found, profile);
  const positives = procedureOverride?.positives || [...new Set(found.filter((item) => !item.excludedFromScoring).flatMap((item) => item.best_for || []))].slice(0, 10);
  const confidence = procedureOverride?.confidence || confidenceLevel(found, ingredients.length, unknown.length);
  const score = procedureOverride?.score || scoreFormula(expertScores, unknown.length);
  const expertSummary = procedureOverride?.expertSummary || buildExpertSummary(found, expertScores, formulaType);
  const proprietaryComplexes = buildProprietaryComplexes(found);
  const qualitySummary = buildQualitySummary(found, unknown.length, ingredients.length, productSafety);

  const summary = procedureOverride?.summary || [
    `Похоже на: ${formulaType}.`,
    found.length ? `Распознано ингредиентов: ${found.length} из ${ingredients.length}.` : "Пока не удалось уверенно распознать ингредиенты из экспертной базы.",
    productSafety.intendedUse ? `Назначение: ${productSafety.intendedUse}` : "",
    productSafety.application ? `Применение: ${productSafety.application}` : "",
    `Оценки: увлажнение ${expertScores.hydration_score}/100, барьер ${expertScores.barrier_score}/100, активность ${expertScores.active_score}/100, риск раздражения ${expertScores.irritation_risk}/100.`,
    warnings.length ? "Есть факторы, которые стоит учитывать перед применением." : "Явных красных флагов в текущей экспертной базе не найдено."
  ].filter(Boolean).join(" ");

  return {
    summary,
    formulaType,
    score,
    hydration_score: expertScores.hydration_score,
    barrier_score: expertScores.barrier_score,
    irritation_risk: expertScores.irritation_risk,
    active_score: expertScores.active_score,
    expertScores,
    qualitySummary,
    productSafety,
    productClassification: productSafety,
    totalIngredients: ingredients.length,
    inciCleaning,
    found,
    unknown,
    groups: roleGroups(found),
    positives,
    warnings,
    architecture: procedureOverride?.architecture || buildFormulaArchitecture(found),
    proprietaryComplexes,
    expertSummary,
    routineAdvice: procedureOverride?.routineAdvice || buildRoutineAdvice(found, expertScores),
    questions: procedureOverride?.questions || buildQuestions(found),
    confidence,
    disclaimer: procedureOverride?.disclaimer || "Это справочный разбор состава, а не медицинское назначение. По INCI нельзя надежно определить точные проценты, pH, SPF/UVA-PF и индивидуальную переносимость."
  };
}

export function formatTelegramReport(result) {
  const topGroups = result.groups
    .slice(0, 8)
    .map((group) => `• ${group.role}: ${group.items.slice(0, 4).join(", ")}`)
    .join("\n");

  const warnings = result.warnings.length
    ? result.warnings.slice(0, 5).map((item) => `• ${item}`).join("\n")
    : "• Явных красных флагов в экспертной базе не найдено.";

  return [
    "Разбор состава",
    "",
    result.summary,
    "",
    `Оценка: ${result.score.score}/100 (${result.score.label})`,
    `Увлажнение: ${result.hydration_score}/100 · Барьер: ${result.barrier_score}/100 · Активность: ${result.active_score}/100 · Риск раздражения: ${result.irritation_risk}/100`,
    "",
    "Группы компонентов:",
    topGroups || "• Пока недостаточно распознанных компонентов.",
    "",
    "На что обратить внимание:",
    warnings,
    "",
    result.disclaimer
  ].join("\n");
}
