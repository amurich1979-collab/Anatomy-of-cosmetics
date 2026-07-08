const form = document.querySelector("#analysisForm");
const result = document.querySelector("#result");
const productName = document.querySelector("#productName");
const productSuggestions = document.querySelector("#productSuggestions");
const productStatus = document.querySelector("#productStatus");
const composition = document.querySelector("#composition");
const sampleChips = document.querySelectorAll(".sample-chip");
const concernChips = document.querySelectorAll(".concern-chip");
const tg = window.Telegram?.WebApp;

const STATIC_PRODUCTS = [
  {
    id: "demo-aha-post-peel",
    name: "AHA Post-Peel Recovery Serum",
    brand: "Demo Professional",
    category: "Постпилинговая сыворотка",
    composition: "Aqua, Glycerin, Panthenol, Niacinamide, Sodium Hyaluronate, Allantoin, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "Проверено",
    source: "Статическая база MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-glycolic-peel",
    name: "Glycolic Renewal Peel 20",
    brand: "Demo Clinic Lab",
    category: "Кислотное средство",
    composition: "Aqua, Glycolic Acid, Lactic Acid, Glycerin, Panthenol, Phenoxyethanol, Sodium Hydroxide",
    trustLabel: "Проверено",
    source: "Статическая база MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-retinol-night",
    name: "Retinol Barrier Night Concentrate",
    brand: "Demo Cosmeceuticals",
    category: "Ретиноидное средство",
    composition: "Aqua, Glycerin, Caprylic/Capric Triglyceride, Dimethicone, Niacinamide, Retinol, Panthenol, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "Проверено",
    source: "Статическая база MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-mineral-spf",
    name: "Mineral Recovery SPF 50",
    brand: "Demo Dermatology",
    category: "SPF после процедур",
    composition: "Aqua, Zinc Oxide, Titanium Dioxide, Caprylic/Capric Triglyceride, Dimethicone, Glycerin, Panthenol, Phenoxyethanol",
    trustLabel: "Проверено",
    source: "Статическая база MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-salicylic-gel",
    name: "BHA Clarifying Gel",
    brand: "Demo Acne Care",
    category: "Средство для кожи с комедонами",
    composition: "Aqua, Glycerin, Salicylic Acid, Niacinamide, Panthenol, Polysorbate 20, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "Проверено",
    source: "Статическая база MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  }
];

const STATIC_INGREDIENTS = {
  aqua: { name: "Aqua", ru: "вода", roles: ["Водная фаза", "Растворитель"], note: "Обычно основа водных формул.", skin: ["Подходит большинству типов кожи"] },
  water: { aliasOf: "aqua" },
  glycerin: { name: "Glycerin", ru: "глицерин", roles: ["Увлажнитель"], note: "Удерживает воду в роговом слое и снижает ощущение сухости.", skin: ["Сухая кожа", "Обезвоженность", "Нарушенный барьер"] },
  niacinamide: { name: "Niacinamide", ru: "ниацинамид", roles: ["Актив", "Барьер", "Себорегуляция"], note: "Поддерживает барьер, может помогать при жирности, постакне и неровном тоне.", skin: ["Жирная кожа", "Постакне", "Нарушенный барьер"] },
  panthenol: { name: "Panthenol", ru: "пантенол", roles: ["Успокаивающий компонент", "Барьер"], note: "Компонент для снижения сухости и дискомфорта, часто уместен после процедур.", skin: ["Чувствительная кожа", "После процедур", "Нарушенный барьер"] },
  allantoin: { name: "Allantoin", ru: "аллантоин", roles: ["Успокаивающий компонент"], note: "Мягкий успокаивающий компонент.", skin: ["Чувствительная кожа", "Постпроцедурный уход"] },
  "sodium hyaluronate": { name: "Sodium Hyaluronate", ru: "гиалуронат натрия", roles: ["Увлажнитель"], note: "Влагоудерживающий компонент.", skin: ["Обезвоженность", "Чувствительная кожа"] },
  "hyaluronic acid": { name: "Hyaluronic Acid", ru: "гиалуроновая кислота", roles: ["Увлажнитель"], note: "Влагоудерживающий компонент, эффект зависит от формы и молекулярной массы.", skin: ["Обезвоженность", "Постпроцедурный уход"] },
  "glycolic acid": { name: "Glycolic Acid", ru: "гликолевая кислота", roles: ["AHA", "Кератолитик", "Пилинг-компонент"], note: "Активная AHA-кислота. Важны процент и pH.", cautions: ["Фоточувствительность", "Риск раздражения", "SPF обязателен"], skin: ["Текстура кожи", "Пигментация"] },
  "lactic acid": { name: "Lactic Acid", ru: "молочная кислота", roles: ["AHA", "Кератолитик"], note: "AHA-кислота, часто мягче гликолевой, но pH и процент все равно критичны.", cautions: ["SPF обязателен при курсовом применении"], skin: ["Сухая кожа", "Тусклый тон"] },
  "salicylic acid": { name: "Salicylic Acid", ru: "салициловая кислота", roles: ["BHA", "Кератолитик"], note: "Жирорастворимая кислота, полезна при комедонах, но может сушить.", cautions: ["Осторожно при беременности/лактации", "Не сочетать без схемы с ретиноидами"], skin: ["Жирная кожа", "Комедоны"] },
  retinol: { name: "Retinol", ru: "ретинол", roles: ["Ретиноид", "Актив"], note: "Актив для текстуры, постакне и фотостарения. Требует постепенного введения.", cautions: ["Беременность/лактация: согласовать со специалистом", "SPF обязателен", "Не сочетать на старте с кислотами"], skin: ["Возрастные изменения", "Постакне"] },
  retinal: { name: "Retinal", ru: "ретиналь", roles: ["Ретиноид", "Актив"], note: "Активная форма ретиноида, может быть раздражающей.", cautions: ["Беременность/лактация: согласовать со специалистом", "SPF обязателен"], skin: ["Возрастные изменения", "Акне-склонность"] },
  "caprylic/capric triglyceride": { name: "Caprylic/Capric Triglyceride", ru: "каприлик/каприновый триглицерид", roles: ["Эмолент", "Жировая фаза"], note: "Легкий эмолент, улучшает распределение и смягчение.", skin: ["Сухая кожа", "Нормальная кожа"] },
  dimethicone: { name: "Dimethicone", ru: "диметикон", roles: ["Силиконовый эмолент", "Защитная пленка"], note: "Снижает потерю влаги, улучшает скольжение, часто полезен при нарушенном барьере.", skin: ["Нарушенный барьер", "Чувствительная кожа"] },
  "zinc oxide": { name: "Zinc Oxide", ru: "оксид цинка", roles: ["Минеральный SPF-фильтр"], note: "Минеральный UV-фильтр. Реальный SPF подтверждается только тестами готового продукта.", skin: ["Чувствительная кожа", "После процедур"] },
  "titanium dioxide": { name: "Titanium Dioxide", ru: "диоксид титана", roles: ["Минеральный SPF-фильтр"], note: "Минеральный UV-фильтр. Итоговая защита зависит от готовой формулы.", skin: ["Чувствительная кожа", "После процедур"] },
  phenoxyethanol: { name: "Phenoxyethanol", ru: "феноксиэтанол", roles: ["Консервант"], note: "Распространенный консервант, обычно в низкой концентрации.", cautions: ["У очень чувствительной кожи возможна индивидуальная реакция"] },
  ethylhexylglycerin: { name: "Ethylhexylglycerin", ru: "этилгексилглицерин", roles: ["Бустер консервации"], note: "Часто усиливает консервирующую систему." },
  parfum: { name: "Parfum", ru: "отдушка", roles: ["Отдушка"], note: "Может повышать риск раздражения у чувствительной кожи.", cautions: ["Осторожно при розацеа, дерматите, после процедур"] },
  fragrance: { aliasOf: "parfum" },
  limonene: { name: "Limonene", ru: "лимонен", roles: ["Фрагранс-аллерген"], note: "Ароматический аллерген.", cautions: ["Осторожно при склонности к аллергическим реакциям"] },
  linalool: { name: "Linalool", ru: "линалоол", roles: ["Фрагранс-аллерген"], note: "Ароматический аллерген.", cautions: ["Осторожно при чувствительной коже"] }
};

if (tg) {
  tg.ready();
  tg.expand();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(items, emptyText) {
  if (!items?.length) return `<p class="muted">${emptyText}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function cards(items, emptyText) {
  if (!items?.length) return `<p class="muted">${emptyText}</p>`;
  return `
    <div class="insight-list">
      ${items.map((item) => `<article class="insight-card">${escapeHtml(item)}</article>`).join("")}
    </div>
  `;
}

function debounce(fn, delay = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function normalizeProductText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function concentrationZone(index, total) {
  if (index === 0) return "основа формулы";
  if (index <= 4) return "вероятно высокая или средняя концентрационная зона";
  if (index / Math.max(total, 1) < 0.45) return "вероятно средняя зона";
  return "вероятно низкая зона или блок до/ниже 1%";
}

function parseIngredients(text) {
  return String(text || "")
    .replace(/ingredients?\s*[:：]/gi, "")
    .replace(/состав\s*[:：]/gi, "")
    .split(/[,;\n]+/)
    .map((item) => item.replace(/\(.+?\)/g, "").trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((other) => normalizeProductText(other) === normalizeProductText(item)) === index);
}

function localSearchProducts(query) {
  const normalizedQuery = normalizeProductText(query);
  if (normalizedQuery.length < 1) return [];

  return STATIC_PRODUCTS
    .map((product) => {
      const haystack = normalizeProductText(`${product.brand} ${product.name} ${product.category}`);
      const score = haystack.includes(normalizedQuery)
        ? 100
        : normalizedQuery.split(" ").filter((token) => token.length > 1 && haystack.includes(token)).length;
      return { product, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.product);
}

function localAnalyzeComposition({ text, profile = {} }) {
  const ingredients = parseIngredients(text);
  const found = [];
  const unknown = [];

  ingredients.forEach((ingredient, index) => {
    const key = normalizeProductText(ingredient);
    const alias = STATIC_INGREDIENTS[key]?.aliasOf;
    const record = STATIC_INGREDIENTS[alias || key];

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
    } else {
      unknown.push({ input: ingredient, position: index + 1, concentration: concentrationZone(index, ingredients.length) });
    }
  });

  const hasRole = (role) => found.some((item) => item.roles.includes(role));
  const names = new Set(found.map((item) => item.name));
  const roleMap = new Map();
  found.forEach((item) => item.roles.forEach((role) => {
    if (!roleMap.has(role)) roleMap.set(role, []);
    roleMap.get(role).push(item.name);
  }));

  let formulaType = "уходовое средство, тип требует уточнения";
  if (hasRole("Минеральный SPF-фильтр")) formulaType = "SPF/фотозащитное средство";
  if (hasRole("AHA") || hasRole("BHA")) formulaType = "кислотное средство или пилинг-подобная формула";
  if (hasRole("Ретиноид")) formulaType = "ретиноидное активное средство";

  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();
  const warnings = [...new Set(found.flatMap((item) => item.cautions))];
  if (/чувств|розацеа|после|барьер/.test(profileText) && (hasRole("AHA") || hasRole("BHA") || hasRole("Ретиноид") || hasRole("Отдушка"))) {
    warnings.push("Для чувствительной кожи, розацеа или постпроцедурного периода формула требует осторожного введения.");
  }
  if (hasRole("Минеральный SPF-фильтр")) {
    warnings.push("Реальный SPF/PPD нельзя подтвердить по одному INCI: нужны тесты готового продукта.");
  }

  const risk = (hasRole("Ретиноид") ? 18 : 0) + (hasRole("AHA") ? 16 : 0) + (hasRole("BHA") ? 16 : 0) + (hasRole("Отдушка") ? 8 : 0) + unknown.length * 2;
  const scoreValue = Math.max(0, Math.min(100, 88 - risk));
  const score = {
    score: scoreValue,
    label: scoreValue >= 75 ? "низкая настороженность" : scoreValue >= 55 ? "умеренная настороженность" : "высокая настороженность"
  };

  const architecture = [
    { title: "Водная и увлажняющая часть", names: ["Aqua", "Glycerin", "Sodium Hyaluronate", "Hyaluronic Acid", "Panthenol", "Niacinamide", "Allantoin"] },
    { title: "Смягчающая/защитная часть", names: ["Caprylic/Capric Triglyceride", "Dimethicone"] },
    { title: "Активы", names: ["Niacinamide", "Retinol", "Retinal", "Glycolic Acid", "Lactic Acid", "Salicylic Acid"] },
    { title: "Консервация", names: ["Phenoxyethanol", "Ethylhexylglycerin"] },
    { title: "Отдушка и аллергены", names: ["Parfum", "Limonene", "Linalool"] }
  ]
    .map((group) => ({ title: group.title, text: group.names.filter((name) => names.has(name)).join(", ") }))
    .filter((group) => group.text);

  const expertSummary = [];
  if (hasRole("Ретиноид")) expertSummary.push("Это активная ретиноидная формула: полезна для текстуры, постакне и признаков фотостарения, но требует постепенного введения.");
  if (hasRole("AHA") || hasRole("BHA")) expertSummary.push("В составе есть кислоты: эффективность и раздражающий потенциал зависят от процента и pH, которых не видно по INCI.");
  if (hasRole("Минеральный SPF-фильтр")) expertSummary.push("Это похоже на SPF-средство, но реальную защиту подтверждают только тесты готовой формулы.");
  if (names.has("Panthenol") || names.has("Allantoin") || names.has("Dimethicone")) expertSummary.push("Есть компоненты для поддержки барьера и снижения сухости.");
  if (!expertSummary.length) expertSummary.push("Формула выглядит как базовое уходовое средство. Главная неопределенность — проценты, pH и индивидуальная переносимость.");

  const routineAdvice = [];
  if (hasRole("Ретиноид")) routineAdvice.push("Начинать 2-3 раза в неделю вечером, не сочетать на старте с кислотами.");
  if (hasRole("AHA") || hasRole("BHA")) routineAdvice.push("Не сочетать в один день с другими сильными кислотами/ретиноидами без схемы. SPF обязателен.");
  if (hasRole("Минеральный SPF-фильтр")) routineAdvice.push("Наносить щедро и обновлять при длительном пребывании на улице.");
  if (!routineAdvice.length) routineAdvice.push("Вводить постепенно и наблюдать за жжением, зудом, сухостью и высыпаниями.");

  const questions = ["Подходит ли это средство моему текущему состоянию кожи, а не только типу кожи?"];
  if (hasRole("AHA") || hasRole("BHA")) questions.push("Какой процент кислот и pH у средства?");
  if (hasRole("Ретиноид")) questions.push("Какая концентрация ретиноида и как выстроить схему адаптации?");
  if (hasRole("Минеральный SPF-фильтр")) questions.push("Есть ли подтвержденные SPF/PPD/UVA-PF тесты готового продукта?");

  const confidenceRatio = ingredients.length ? found.length / ingredients.length : 0;

  return {
    summary: `Похоже на: ${formulaType}. Распознано ингредиентов: ${found.length} из ${ingredients.length}.`,
    formulaType,
    score,
    totalIngredients: ingredients.length,
    found,
    unknown,
    groups: Array.from(roleMap.entries()).map(([role, items]) => ({ role, items })),
    positives: [...new Set(found.flatMap((item) => item.skin))].slice(0, 8),
    warnings,
    architecture,
    expertSummary,
    routineAdvice,
    questions,
    confidence: {
      label: confidenceRatio >= 0.85 ? "хорошая" : confidenceRatio >= 0.55 ? "средняя" : "низкая",
      text: "Статическая версия: работает без сервера, но без внешнего поиска Open Beauty Facts и очереди проверки."
    },
    disclaimer: "Это справочный разбор состава, а не медицинское назначение. Точные проценты, pH, SPF/PPD и переносимость нельзя надежно определить только по INCI."
  };
}

function setProductStatus(text, mode = "") {
  if (!productStatus) return;
  productStatus.textContent = text;
  productStatus.dataset.mode = mode;
  productStatus.hidden = !text;
}

function hideSuggestions() {
  if (!productSuggestions) return;
  productSuggestions.hidden = true;
  productSuggestions.innerHTML = "";
}

async function loadProductDetails(product) {
  if (product.composition) return product;

  try {
    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`);
    if (!response.ok) throw new Error("Product detail failed");
    const data = await response.json();
    return data.product || product;
  } catch {
    return product;
  }
}

async function applyProduct(product) {
  productName.value = `${product.brand} ${product.name}`.trim();
  setProductStatus("Подтягиваю состав из базы...");
  const detailedProduct = await loadProductDetails(product);

  if (!detailedProduct.composition) {
    hideSuggestions();
    setProductStatus("Карточка найдена, но INCI пока не подтянулся. Можно вставить состав вручную.", "warn");
    return;
  }

  composition.value = detailedProduct.composition;
  hideSuggestions();

  const source = detailedProduct.verified
    ? detailedProduct.source
    : `${product.source}, проверьте состав по этикетке`;
  const verifiedAt = product.verifiedAt ? ` Проверено: ${product.verifiedAt}.` : "";
  setProductStatus(`Состав подставлен: ${source}.${verifiedAt}`, product.verified ? "ok" : "warn");
}

async function requestProductReview(query) {
  try {
    const response = await fetch("/api/products/review-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, source: "web-search-field" })
    });

    if (!response.ok) throw new Error("Review request failed");
    return response.json();
  } catch {
    const queue = JSON.parse(localStorage.getItem("reviewQueue") || "[]");
    queue.unshift({ query, source: "static-page", createdAt: new Date().toISOString() });
    localStorage.setItem("reviewQueue", JSON.stringify(queue.slice(0, 50)));
    return { request: queue[0], staticMode: true };
  }
}

function renderReviewRequest(query) {
  productSuggestions.innerHTML = `
    <div class="suggestion-empty">
      <p>Пока нет проверенного состава для этого средства.</p>
      <button class="review-request-button" type="button">Отправить на проверку</button>
    </div>
  `;
  productSuggestions.hidden = false;

  productSuggestions.querySelector(".review-request-button")?.addEventListener("click", async () => {
    try {
      await requestProductReview(query);
      hideSuggestions();
      setProductStatus("Запрос добавлен в очередь проверки. Чем чаще средство ищут, тем выше приоритет.", "ok");
    } catch {
      setProductStatus("Не удалось добавить запрос. Попробуйте позже или вставьте INCI вручную.", "warn");
    }
  });
}

function renderSuggestions(products) {
  if (!productSuggestions) return false;

  const query = normalizeProductText(productName.value);
  const exactVerified = products.find((product) => {
    const fullName = normalizeProductText(`${product.brand} ${product.name}`);
    const nameOnly = normalizeProductText(product.name);
    return product.verified && (query === fullName || query === nameOnly);
  });

  if (exactVerified || (products.length === 1 && products[0].verified)) {
    applyProduct(exactVerified || products[0]);
    return true;
  }

  if (!products.length) {
    renderReviewRequest(productName.value.trim());
    return false;
  }

  productSuggestions.innerHTML = products
    .map((product, index) => `
      <button class="suggestion" type="button" data-index="${index}">
        <strong>${escapeHtml(product.name)} <em>${escapeHtml(product.trustLabel || "Источник")}</em></strong>
        <span>${escapeHtml(product.brand)} · ${escapeHtml(product.category || "категория не указана")}</span>
        <small>${escapeHtml(product.source)}${product.verifiedAt ? ` · ${escapeHtml(product.verifiedAt)}` : ""}${product.verified ? "" : " · проверьте по этикетке"}</small>
      </button>
    `)
    .join("");
  productSuggestions.hidden = false;

  productSuggestions.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", async () => {
      await applyProduct(products[Number(button.dataset.index)]);
    });
  });

  return false;
}

async function searchProductByName(query) {
  try {
    const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Search failed");
    return response.json();
  } catch {
    return { products: localSearchProducts(query), staticMode: true };
  }
}

const searchProducts = debounce(async () => {
  const query = productName?.value.trim() || "";

  if (query.length < 1) {
    hideSuggestions();
    setProductStatus("");
    return;
  }

  setProductStatus("Ищу состав по названию...");

  try {
    const data = await searchProductByName(query);
    const wasApplied = renderSuggestions(data.products || []);
    if (wasApplied) return;

    setProductStatus(
      data.products?.length
        ? "Выберите средство из списка, чтобы подставить INCI."
        : "Не нашла состав по названию. Уточните бренд или вставьте INCI вручную.",
      data.products?.length ? "ok" : "warn"
    );
  } catch {
    hideSuggestions();
    setProductStatus("Поиск временно недоступен. Состав можно вставить вручную.", "warn");
  }
});

productName?.addEventListener("input", searchProducts);

function syncConcernInput() {
  const selected = Array.from(concernChips)
    .filter((chip) => chip.getAttribute("aria-pressed") === "true")
    .map((chip) => chip.dataset.value || chip.textContent.trim())
    .filter(Boolean);
  const customValue = document.querySelector("#concernsCustom")?.value.trim();
  const concerns = document.querySelector("#concerns");
  if (concerns) concerns.value = (customValue ? [...selected, customValue] : selected).join(", ");
}

concernChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const nextValue = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(nextValue));
    syncConcernInput();
  });
});

document.querySelector("#concernsCustom")?.addEventListener("input", syncConcernInput);

sampleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    productName.value = chip.dataset.query || "";
    productName.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

function render(data) {
  const expertSummary = cards(data.expertSummary, "Недостаточно данных для экспертной сводки.");
  const routineAdvice = list(data.routineAdvice, "Нет специальных рекомендаций по введению.");
  const questions = list(data.questions, "Уточняющих вопросов не сформировано.");
  const architecture = data.architecture?.length
    ? `
      <div class="architecture-grid">
        ${data.architecture
          .map((item) => `
            <article class="architecture-card">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.text)}</p>
            </article>
          `)
          .join("")}
      </div>
    `
    : `<p class="muted">Пока недостаточно распознанных компонентов, чтобы описать структуру формулы.</p>`;

  const groups = data.groups
    .map((group) => `
      <article class="tile">
        <h3>${escapeHtml(group.role)}</h3>
        <p>${escapeHtml(group.items.join(", "))}</p>
      </article>
    `)
    .join("");

  const found = data.found
    .map((item) => `
      <article class="ingredient">
        <div>
          <h3>${escapeHtml(item.name)} <span>${escapeHtml(item.ru || "")}</span></h3>
          <p>${escapeHtml(item.note)}</p>
        </div>
        <dl>
          <dt>Позиция</dt>
          <dd>${item.position}</dd>
          <dt>Зона</dt>
          <dd>${escapeHtml(item.concentration)}</dd>
        </dl>
      </article>
    `)
    .join("");

  const unknown = data.unknown
    .slice(0, 16)
    .map((item) => `${item.input} (${item.concentration})`);
  const unknownSection = unknown.length
    ? `
      <section class="section">
        <h2>Что требует проверки</h2>
        <p class="muted">Эти позиции не найдены в текущей базе MVP. Их стоит сверить по этикетке или расширенной базе ингредиентов.</p>
        ${list(unknown, "Все ингредиенты из состава распознаны базой MVP.")}
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `
    : `
      <section class="section">
        <h2>Ограничения анализа</h2>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `;

  result.innerHTML = `
    <div class="score">
      <div class="score-number">
        <p class="eyebrow">Итог</p>
        <h2>${escapeHtml(data.score.score)}/100</h2>
        <p>${escapeHtml(data.score.label)}</p>
      </div>
      <div>
        <h2>${escapeHtml(data.formulaType)}</h2>
        <p>${escapeHtml(data.summary)}</p>
        <p class="confidence">Уверенность: ${escapeHtml(data.confidence?.label || "неизвестно")} · ${escapeHtml(data.confidence?.text || "")}</p>
      </div>
    </div>

    <section class="section">
      <h2>Главный вывод</h2>
      ${expertSummary}
    </section>

    <section class="section">
      <h2>Как устроена формула</h2>
      ${architecture}
    </section>

    <section class="section">
      <h2>Группы компонентов</h2>
      <div class="tiles">${groups || '<p class="muted">Пока недостаточно распознанных компонентов.</p>'}</div>
    </section>

    <section class="section two">
      <div>
        <h2>Может быть полезно при</h2>
        ${list(data.positives, "По текущей базе MVP нет уверенных выводов.")}
      </div>
      <div>
        <h2>На что обратить внимание</h2>
        ${list(data.warnings, "Явных красных флагов в базе MVP не найдено.")}
      </div>
    </section>

    <section class="section two">
      <div>
        <h2>Как вводить в уход</h2>
        ${routineAdvice}
      </div>
      <div>
        <h2>Что спросить у косметолога</h2>
        ${questions}
      </div>
    </section>

    <section class="section">
      <h2>Распознанные ингредиенты</h2>
      <div class="ingredients">${found || '<p class="muted">Нет совпадений в базе MVP.</p>'}</div>
    </section>

    ${unknownSection}
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    text: composition.value,
    profile: {
      skinType: document.querySelector("#skinType").value,
      context: document.querySelector("#context").value,
      concerns: document.querySelector("#concerns").value
    }
  };

  result.innerHTML = `<div class="loading">Разбираю состав...</div>`;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Analyze failed");
    render(await response.json());
  } catch {
    render(localAnalyzeComposition(payload));
  }
});
