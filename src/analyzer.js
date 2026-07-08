const INGREDIENTS = {
  aqua: {
    name: "Aqua",
    ru: "вода",
    roles: ["Водная фаза", "Растворитель"],
    note: "Обычно основа водных формул.",
    skin: ["Подходит большинству типов кожи"]
  },
  water: {
    aliasOf: "aqua"
  },
  glycerin: {
    name: "Glycerin",
    ru: "глицерин",
    roles: ["Увлажнитель"],
    note: "Притягивает и удерживает воду в роговом слое. В высоких концентрациях может давать липкость.",
    skin: ["Сухая кожа", "Обезвоженность", "Нарушенный барьер"]
  },
  "hyaluronic acid": {
    name: "Hyaluronic Acid",
    ru: "гиалуроновая кислота",
    roles: ["Увлажнитель", "Пленкообразователь"],
    note: "Работает как влагоудерживающий компонент. Эффект зависит от формы и молекулярной массы.",
    skin: ["Обезвоженность", "Постпроцедурный уход"]
  },
  "sodium hyaluronate": {
    name: "Sodium Hyaluronate",
    ru: "гиалуронат натрия",
    roles: ["Увлажнитель"],
    note: "Соль гиалуроновой кислоты, часто используется в сыворотках и постуходе.",
    skin: ["Обезвоженность", "Чувствительная кожа"]
  },
  niacinamide: {
    name: "Niacinamide",
    ru: "ниацинамид",
    roles: ["Актив", "Барьер", "Себорегуляция"],
    note: "Может поддерживать барьер, снижать видимость покраснения и себума. У чувствительной кожи возможна реактивность.",
    skin: ["Жирная кожа", "Постакне", "Нарушенный барьер"]
  },
  panthenol: {
    name: "Panthenol",
    ru: "пантенол",
    roles: ["Успокаивающий компонент", "Барьер"],
    note: "Частый компонент постпроцедурного ухода, помогает снизить ощущение сухости и дискомфорта.",
    skin: ["Чувствительная кожа", "После процедур", "Нарушенный барьер"]
  },
  allantoin: {
    name: "Allantoin",
    ru: "аллантоин",
    roles: ["Успокаивающий компонент"],
    note: "Мягкий компонент для снижения ощущения раздражения.",
    skin: ["Чувствительная кожа", "Постпроцедурный уход"]
  },
  "salicylic acid": {
    name: "Salicylic Acid",
    ru: "салициловая кислота",
    roles: ["BHA", "Кератолитик", "Актив против комедонов"],
    note: "Жирорастворимая кислота. Может быть полезна при комедонах, но повышает риск сухости и раздражения.",
    cautions: ["Беременность/лактация: согласовать со специалистом", "Не сочетать бездумно с ретиноидами и сильными кислотами"],
    skin: ["Жирная кожа", "Комедоны", "Акне-склонность"]
  },
  "glycolic acid": {
    name: "Glycolic Acid",
    ru: "гликолевая кислота",
    roles: ["AHA", "Кератолитик", "Пилинг-компонент"],
    note: "Малая молекула AHA, потенциально активная и раздражающая. Важны pH и концентрация.",
    cautions: ["Фоточувствительность", "Риск раздражения", "SPF обязателен"],
    skin: ["Текстура кожи", "Пигментация", "Возрастные изменения"]
  },
  "lactic acid": {
    name: "Lactic Acid",
    ru: "молочная кислота",
    roles: ["AHA", "Увлажняющий фактор", "Кератолитик"],
    note: "Мягче гликолевой, но активность зависит от pH и концентрации.",
    cautions: ["SPF обязателен при курсовом применении"],
    skin: ["Сухая кожа", "Тусклый тон", "Текстура кожи"]
  },
  retinol: {
    name: "Retinol",
    ru: "ретинол",
    roles: ["Ретиноид", "Актив"],
    note: "Работает с текстурой, признаками фотостарения и высыпаниями, но требует постепенного введения.",
    cautions: ["Беременность/лактация: не использовать без назначения врача", "Не сочетать на старте с кислотами", "SPF обязателен"],
    skin: ["Возрастные изменения", "Постакне", "Акне-склонность"]
  },
  retinal: {
    name: "Retinal",
    ru: "ретиналь",
    roles: ["Ретиноид", "Актив"],
    note: "Более близкая к ретиноевой кислоте форма, может быть активнее ретинола.",
    cautions: ["Беременность/лактация: не использовать без назначения врача", "Риск раздражения", "SPF обязателен"],
    skin: ["Возрастные изменения", "Акне-склонность"]
  },
  "ascorbic acid": {
    name: "Ascorbic Acid",
    ru: "аскорбиновая кислота",
    roles: ["Антиоксидант", "Актив против тусклого тона"],
    note: "Активная форма витамина C. Может раздражать чувствительную кожу, особенно при низком pH.",
    cautions: ["Осторожно после агрессивных процедур"],
    skin: ["Тусклый тон", "Пигментация", "Фотостарение"]
  },
  "zinc oxide": {
    name: "Zinc Oxide",
    ru: "оксид цинка",
    roles: ["Минеральный SPF-фильтр", "Успокаивающий компонент"],
    note: "Покрывает UVB и часть UVA-спектра. Реальная SPF-защита зависит от концентрации, дисперсии и тестов готовой формулы.",
    skin: ["Чувствительная кожа", "После процедур"]
  },
  "titanium dioxide": {
    name: "Titanium Dioxide",
    ru: "диоксид титана",
    roles: ["Минеральный SPF-фильтр", "Пигмент"],
    note: "Хорошо работает в UVB и частично UVA II. Итоговая защита зависит от всей формулы.",
    skin: ["Чувствительная кожа", "После процедур"]
  },
  "ethylhexyl methoxycinnamate": {
    name: "Ethylhexyl Methoxycinnamate",
    ru: "октиноксат",
    roles: ["Органический UVB-фильтр"],
    note: "UVB-фильтр. Требует корректной комбинации с UVA-фильтрами для широкого спектра.",
    cautions: ["Для реактивной кожи лучше оценивать переносимость индивидуально"]
  },
  "butyl methoxydibenzoylmethane": {
    name: "Butyl Methoxydibenzoylmethane",
    ru: "авобензон",
    roles: ["Органический UVA-фильтр"],
    note: "UVA-фильтр. Важна фотостабилизация другими компонентами формулы."
  },
  "phenoxyethanol": {
    name: "Phenoxyethanol",
    ru: "феноксиэтанол",
    roles: ["Консервант"],
    note: "Частый консервант. Обычно находится в низких концентрациях.",
    cautions: ["У очень чувствительной кожи возможна индивидуальная реакция"]
  },
  "ethylhexylglycerin": {
    name: "Ethylhexylglycerin",
    ru: "этилгексилглицерин",
    roles: ["Бустер консервации", "Смягчающий компонент"],
    note: "Часто усиливает консервирующую систему вместе с феноксиэтанолом."
  },
  parfum: {
    name: "Parfum",
    ru: "отдушка",
    roles: ["Отдушка"],
    note: "Может повышать риск раздражения или сенсибилизации у чувствительной кожи.",
    cautions: ["Осторожно при розацеа, дерматите, после процедур"]
  },
  fragrance: {
    aliasOf: "parfum"
  },
  limonene: {
    name: "Limonene",
    ru: "лимонен",
    roles: ["Фрагранс-аллерген"],
    note: "Ароматический аллерген, чаще значим для чувствительной и аллергичной кожи.",
    cautions: ["Осторожно при склонности к аллергическим реакциям"]
  },
  linalool: {
    name: "Linalool",
    ru: "линалоол",
    roles: ["Фрагранс-аллерген"],
    note: "Ароматический аллерген, может быть проблемным для реактивной кожи.",
    cautions: ["Осторожно при чувствительной коже"]
  },
  "caprylic/capric triglyceride": {
    name: "Caprylic/Capric Triglyceride",
    ru: "каприлик/каприновый триглицерид",
    roles: ["Эмолент", "Жировая фаза"],
    note: "Легкий эмолент, часто улучшает распределение и снижает сухость.",
    skin: ["Сухая кожа", "Нормальная кожа"]
  },
  "cetearyl alcohol": {
    name: "Cetearyl Alcohol",
    ru: "цетеариловый спирт",
    roles: ["Жирный спирт", "Эмолент", "Соэмульгатор"],
    note: "Не равен сушащему спирту. Дает плотность и смягчение эмульсии."
  },
  "cetyl alcohol": {
    name: "Cetyl Alcohol",
    ru: "цетиловый спирт",
    roles: ["Жирный спирт", "Эмолент", "Соэмульгатор"],
    note: "Структурообразователь и смягчающий компонент."
  },
  dimethicone: {
    name: "Dimethicone",
    ru: "диметикон",
    roles: ["Силиконовый эмолент", "Защитная пленка"],
    note: "Снижает трансэпидермальную потерю воды и улучшает скольжение. Часто полезен после процедур.",
    skin: ["Нарушенный барьер", "Чувствительная кожа"]
  },
  "polysorbate 20": {
    name: "Polysorbate 20",
    ru: "полисорбат-20",
    roles: ["Солюбилизатор", "ПАВ"],
    note: "Помогает вводить ароматические или масляные компоненты в водную фазу."
  },
  "sodium laureth sulfate": {
    name: "Sodium Laureth Sulfate",
    ru: "SLES",
    roles: ["Анионный ПАВ"],
    note: "Эффективно очищает, но при частом применении может усиливать сухость у чувствительной кожи.",
    cautions: ["Осторожно при нарушенном барьере"]
  }
};

const ROLE_WEIGHTS = {
  "Ретиноид": 18,
  "AHA": 16,
  "BHA": 16,
  "Кератолитик": 12,
  "Фрагранс-аллерген": 10,
  "Отдушка": 8,
  "Органический UVB-фильтр": 6,
  "Органический UVA-фильтр": 6,
  "Консервант": 4,
  "Анионный ПАВ": 6
};

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;]$/g, "")
    .trim();
}

function canonicalIngredient(name) {
  const normalized = normalizeName(name);
  const record = INGREDIENTS[normalized];
  if (record?.aliasOf) {
    return record.aliasOf;
  }
  return normalized;
}

export function parseIngredients(rawText) {
  const withoutHeading = rawText
    .replace(/ingredients?\s*[:：]/gi, "")
    .replace(/состав\s*[:：]/gi, "");

  return withoutHeading
    .split(/[,;\n]+/)
    .map((item) => item.replace(/\(.+?\)/g, "").trim())
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " "))
    .filter((item, index, array) => array.findIndex((other) => normalizeName(other) === normalizeName(item)) === index);
}

function concentrationZone(index, total) {
  if (index === 0) {
    return "основа формулы";
  }
  if (index <= 4) {
    return "вероятно высокая или средняя концентрационная зона";
  }
  if (index / Math.max(total, 1) < 0.45) {
    return "вероятно средняя зона";
  }
  return "вероятно низкая зона или блок до/ниже 1%";
}

function profileWarnings(profile, found) {
  const warnings = [];
  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();

  const hasRole = (role) => found.some((item) => item.roles.includes(role));
  const hasAnyRole = (roles) => found.some((item) => roles.some((role) => item.roles.includes(role)));

  if (/чувств|розацеа|дерматит|после|пилинг|лазер|барьер/.test(profileText) && hasAnyRole(["Отдушка", "Фрагранс-аллерген", "AHA", "BHA", "Ретиноид"])) {
    warnings.push("Для чувствительной кожи, розацеа, дерматита или постпроцедурного периода формула требует осторожного введения: есть потенциально раздражающие активы или отдушка.");
  }

  if (/беремен|лактац/.test(profileText) && hasAnyRole(["Ретиноид", "BHA"])) {
    warnings.push("При беременности или лактации ретиноиды и BHA-компоненты нужно согласовывать с врачом или лечащим специалистом.");
  }

  if (/пигмент|мелазм|постакне/.test(profileText) && hasAnyRole(["AHA", "BHA", "Ретиноид", "Актив против тусклого тона"])) {
    warnings.push("При работе с пигментацией особенно важен ежедневный SPF: активы могут повышать чувствительность к солнцу.");
  }

  if (hasRole("Минеральный SPF-фильтр") || hasAnyRole(["Органический UVB-фильтр", "Органический UVA-фильтр"])) {
    warnings.push("По одному списку INCI нельзя подтвердить реальный SPF/PPD: защита определяется тестами готового продукта, концентрацией фильтров и стабильностью формулы.");
  }

  return warnings;
}

function inferFormulaType(found, rawText) {
  const text = rawText.toLowerCase();
  const roles = new Set(found.flatMap((item) => item.roles));

  if (roles.has("Минеральный SPF-фильтр") || roles.has("Органический UVB-фильтр") || roles.has("Органический UVA-фильтр") || /spf|sunscreen|санскрин/.test(text)) {
    return "SPF/фотозащитное средство";
  }
  if (roles.has("AHA") || roles.has("BHA") || /peel|пилинг/.test(text)) {
    return "кислотное средство или пилинг-подобная формула";
  }
  if (roles.has("Ретиноид")) {
    return "ретиноидное активное средство";
  }
  if (roles.has("Анионный ПАВ")) {
    return "очищающее средство";
  }
  if (roles.has("Жировая фаза") || roles.has("Эмолент") || roles.has("Силиконовый эмолент")) {
    return "эмульсия/кремовая формула";
  }
  return "уходовое средство, тип требует уточнения по назначению производителя";
}

function scoreFormula(found, unknownCount) {
  const risk = found.reduce((sum, item) => {
    return sum + item.roles.reduce((roleSum, role) => roleSum + (ROLE_WEIGHTS[role] || 0), 0);
  }, 0);
  const unknownPenalty = Math.min(unknownCount * 2, 18);
  const score = Math.max(0, Math.min(100, 88 - risk - unknownPenalty));

  if (score >= 75) return { score, label: "низкая настороженность" };
  if (score >= 55) return { score, label: "умеренная настороженность" };
  return { score, label: "высокая настороженность" };
}

function hasName(found, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return found.some((item) => wanted.has(item.name.toLowerCase()));
}

function namesFor(found, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return found
    .filter((item) => wanted.has(item.name.toLowerCase()))
    .map((item) => item.name);
}

function buildFormulaArchitecture(found) {
  const waterPhase = namesFor(found, ["Aqua", "Glycerin", "Sodium Hyaluronate", "Hyaluronic Acid", "Panthenol", "Niacinamide", "Allantoin"]);
  const lipidPhase = namesFor(found, ["Caprylic/Capric Triglyceride", "Dimethicone", "Cetearyl Alcohol", "Cetyl Alcohol"]);
  const actives = namesFor(found, ["Niacinamide", "Retinol", "Retinal", "Glycolic Acid", "Lactic Acid", "Salicylic Acid", "Ascorbic Acid"]);
  const preservation = namesFor(found, ["Phenoxyethanol", "Ethylhexylglycerin"]);
  const fragrance = namesFor(found, ["Parfum", "Limonene", "Linalool"]);
  const uvFilters = namesFor(found, ["Zinc Oxide", "Titanium Dioxide", "Ethylhexyl Methoxycinnamate", "Butyl Methoxydibenzoylmethane"]);

  const rows = [];
  if (waterPhase.length) rows.push({ title: "Водная и увлажняющая часть", text: waterPhase.join(", ") });
  if (lipidPhase.length) rows.push({ title: "Смягчающая/защитная часть", text: lipidPhase.join(", ") });
  if (actives.length) rows.push({ title: "Активы", text: actives.join(", ") });
  if (uvFilters.length) rows.push({ title: "UV-фильтры", text: uvFilters.join(", ") });
  if (preservation.length) rows.push({ title: "Консервация", text: preservation.join(", ") });
  if (fragrance.length) rows.push({ title: "Отдушка и ароматические аллергены", text: fragrance.join(", ") });
  return rows;
}

function buildExpertSummary(found, profile, formulaType) {
  const lines = [];
  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();

  if (hasName(found, ["Retinol", "Retinal"])) {
    lines.push("Это активная ретиноидная формула: ее ценность в работе с текстурой, постакне и признаками фотостарения, но вводить ее лучше постепенно.");
  }
  if (hasName(found, ["Glycolic Acid", "Lactic Acid", "Salicylic Acid"])) {
    lines.push("В составе есть кислоты: эффективность и раздражающий потенциал сильно зависят от процента и pH, которых не видно по одному INCI.");
  }
  if (hasName(found, ["Zinc Oxide", "Titanium Dioxide", "Ethylhexyl Methoxycinnamate", "Butyl Methoxydibenzoylmethane"])) {
    lines.push("Это похоже на SPF-средство, но реальную защиту SPF/PPD подтверждают только тесты готовой формулы, а не список ингредиентов.");
  }
  if (hasName(found, ["Panthenol", "Allantoin", "Dimethicone", "Sodium Hyaluronate"])) {
    lines.push("В формуле есть компоненты для поддержки барьера и снижения ощущения сухости: это плюс для постпроцедурного или реактивного ухода.");
  }
  if (hasName(found, ["Parfum", "Limonene", "Linalool"])) {
    lines.push("Есть отдушка или ароматические аллергены: для розацеа, дерматита и кожи после процедур это частая причина лишней реактивности.");
  }
  if (/после|розацеа|чувств|барьер/.test(profileText) && /кислот|ретиноид/i.test(formulaType)) {
    lines.push("С учетом указанного профиля это не лучший кандидат для агрессивного старта: сначала стоит восстановить барьер и уточнить схему у специалиста.");
  }
  if (!lines.length) {
    lines.push("Формула выглядит как базовое уходовое средство. Главная неопределенность сейчас не в отдельных ингредиентах, а в процентах, pH и переносимости.");
  }
  return lines;
}

function buildRoutineAdvice(found) {
  const advice = [];
  const hasAcid = hasName(found, ["Glycolic Acid", "Lactic Acid", "Salicylic Acid"]);
  const hasRetinoid = hasName(found, ["Retinol", "Retinal"]);
  const hasSpf = hasName(found, ["Zinc Oxide", "Titanium Dioxide", "Ethylhexyl Methoxycinnamate", "Butyl Methoxydibenzoylmethane"]);

  if (hasRetinoid) {
    advice.push("Начинать 2-3 раза в неделю вечером, на сухую кожу, не сочетать в тот же вечер с кислотами на старте.");
  }
  if (hasAcid) {
    advice.push("Не использовать в один день с другими сильными кислотами/ретиноидами без схемы. На следующий день обязателен SPF.");
  }
  if (hasSpf) {
    advice.push("Наносить щедро и обновлять при длительном пребывании на улице. Для постпроцедурного периода важна не только SPF-цифра, но и переносимость.");
  }
  if (hasName(found, ["Parfum", "Limonene", "Linalool"])) {
    advice.push("При чувствительной коже лучше сделать пробу на небольшом участке и не вводить средство сразу после травмирующих процедур.");
  }
  if (hasName(found, ["Panthenol", "Allantoin", "Dimethicone"])) {
    advice.push("Можно рассматривать как поддержку барьера, особенно если нет жжения, покраснения и усиления сухости.");
  }
  if (!advice.length) {
    advice.push("Вводить как обычное новое средство: 1 раз в день или через день, наблюдая за жжением, зудом, высыпаниями и сухостью.");
  }
  return advice;
}

function buildQuestions(found) {
  const questions = ["Подходит ли это средство моему текущему состоянию кожи, а не только типу кожи?"];

  if (hasName(found, ["Glycolic Acid", "Lactic Acid", "Salicylic Acid"])) {
    questions.push("Какой процент кислот и pH у средства?");
    questions.push("Как часто его вводить и нужен ли период восстановления после процедур?");
  }
  if (hasName(found, ["Retinol", "Retinal"])) {
    questions.push("Какая концентрация ретиноида и как выстроить схему адаптации?");
    questions.push("Что исключить из ухода на период введения ретиноида?");
  }
  if (hasName(found, ["Zinc Oxide", "Titanium Dioxide", "Ethylhexyl Methoxycinnamate", "Butyl Methoxydibenzoylmethane"])) {
    questions.push("Есть ли подтвержденные SPF/PPD/UVA-PF тесты именно готового продукта?");
  }
  if (hasName(found, ["Parfum", "Limonene", "Linalool"])) {
    questions.push("Есть ли версия без отдушки для чувствительной кожи или розацеа?");
  }
  return questions;
}

function confidenceLevel(found, totalIngredients, unknownCount) {
  if (!totalIngredients) {
    return { label: "низкая", text: "Состав не удалось разобрать: нужен полный INCI." };
  }

  const ratio = found.length / totalIngredients;
  if (ratio >= 0.85 && unknownCount <= 2) {
    return { label: "хорошая", text: "Большая часть состава распознана. Главные ограничения: неизвестны проценты, pH и тесты готового продукта." };
  }
  if (ratio >= 0.55) {
    return { label: "средняя", text: "Часть состава распознана, поэтому выводы лучше считать предварительными." };
  }
  return { label: "низкая", text: "Много ингредиентов не найдено в базе MVP, поэтому анализ требует ручной проверки." };
}

export function analyzeComposition({ text, profile = {} }) {
  const ingredients = parseIngredients(text || "");
  const found = [];
  const unknown = [];

  ingredients.forEach((ingredient, index) => {
    const key = canonicalIngredient(ingredient);
    const record = INGREDIENTS[key];

    if (record && !record.aliasOf) {
      found.push({
        input: ingredient,
        name: record.name,
        ru: record.ru,
        roles: record.roles,
        note: record.note,
        cautions: record.cautions || [],
        skin: record.skin || [],
        position: index + 1,
        concentration: concentrationZone(index, ingredients.length)
      });
      return;
    }

    unknown.push({
      input: ingredient,
      position: index + 1,
      concentration: concentrationZone(index, ingredients.length)
    });
  });

  const roleMap = new Map();
  found.forEach((item) => {
    item.roles.forEach((role) => {
      if (!roleMap.has(role)) roleMap.set(role, []);
      roleMap.get(role).push(item.name);
    });
  });

  const warnings = [
    ...new Set([
      ...found.flatMap((item) => item.cautions),
      ...profileWarnings(profile, found)
    ])
  ];

  const positives = [
    ...new Set(found.flatMap((item) => item.skin))
  ].slice(0, 8);

  const formulaType = inferFormulaType(found, text || "");
  const score = scoreFormula(found, unknown.length);
  const architecture = buildFormulaArchitecture(found);
  const expertSummary = buildExpertSummary(found, profile, formulaType);
  const routineAdvice = buildRoutineAdvice(found);
  const questions = buildQuestions(found);
  const confidence = confidenceLevel(found, ingredients.length, unknown.length);

  const summary = [
    `Похоже на: ${formulaType}.`,
    found.length
      ? `Распознано ингредиентов: ${found.length} из ${ingredients.length}.`
      : "Пока не удалось уверенно распознать ингредиенты из базы MVP.",
    warnings.length
      ? "Есть факторы, которые стоит обсудить со специалистом перед применением."
      : "Явных красных флагов в рамках базы MVP не найдено."
  ].join(" ");

  return {
    summary,
    formulaType,
    score,
    totalIngredients: ingredients.length,
    found,
    unknown,
    groups: Array.from(roleMap.entries()).map(([role, items]) => ({ role, items })),
    positives,
    warnings,
    architecture,
    expertSummary,
    routineAdvice,
    questions,
    confidence,
    disclaimer: "Это справочный разбор состава, а не медицинское назначение. Точные проценты, pH, SPF/PPD и переносимость нельзя надежно определить только по INCI."
  };
}

export function formatTelegramReport(result) {
  const topGroups = result.groups
    .slice(0, 8)
    .map((group) => `• ${group.role}: ${group.items.slice(0, 4).join(", ")}`)
    .join("\n");

  const warnings = result.warnings.length
    ? result.warnings.slice(0, 5).map((item) => `• ${item}`).join("\n")
    : "• Явных красных флагов в базе MVP не найдено.";

  return [
    `Разбор состава`,
    ``,
    result.summary,
    ``,
    `Оценка: ${result.score.score}/100 (${result.score.label})`,
    ``,
    `Группы компонентов:`,
    topGroups || "• Пока недостаточно распознанных компонентов.",
    ``,
    `На что обратить внимание:`,
    warnings,
    ``,
    result.disclaimer
  ].join("\n");
}
