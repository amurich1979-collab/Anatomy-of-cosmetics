const form = document.querySelector("#analysisForm");
const result = document.querySelector("#result");
const productName = document.querySelector("#productName");
const productSuggestions = document.querySelector("#productSuggestions");
const productStatus = document.querySelector("#productStatus");
const productClear = document.querySelector("#productClear");
const composition = document.querySelector("#composition");
const sampleChips = document.querySelectorAll(".sample-chip");
const concernChips = document.querySelectorAll(".concern-chip");
const catalogToggle = document.querySelector("#catalogToggle");
const catalogDrawer = document.querySelector("#catalogDrawer");
const catalogClose = document.querySelector("#catalogClose");
const catalogCategories = document.querySelector("#catalogCategories");
const catalogResults = document.querySelector("#catalogResults");
const catalogOpen = document.querySelector("#catalogOpen");
const photoInput = document.querySelector("#photoInput");
const photoInputs = document.querySelectorAll("[data-photo-input]");
const photoCameraOpen = document.querySelector("#photoCameraOpen");
const photoCameraInput = document.querySelector("#photoCameraInput");
const photoStatus = document.querySelector("#photoStatus");
const photoReview = document.querySelector("#photoReview");
const photoPreview = document.querySelector("#photoPreview");
const photoClear = document.querySelector("#photoClear");
const photoText = document.querySelector("#photoText");
const photoUseComposition = document.querySelector("#photoUseComposition");
const photoAnalyze = document.querySelector("#photoAnalyze");
const cameraCapture = document.querySelector("#cameraCapture");
const cameraVideo = document.querySelector("#cameraVideo");
const cameraCanvas = document.querySelector("#cameraCanvas");
const cameraClose = document.querySelector("#cameraClose");
const cameraShot = document.querySelector("#cameraShot");
const cameraFallback = document.querySelector("#cameraFallback");
const barcodeInput = document.querySelector("#barcodeInput");
const barcodeScan = document.querySelector("#barcodeScan");
const barcodeApply = document.querySelector("#barcodeApply");
const barcodeCapture = document.querySelector("#barcodeCapture");
const barcodeVideo = document.querySelector("#barcodeVideo");
const barcodeScanClose = document.querySelector("#barcodeScanClose");
const barcodeScanStatus = document.querySelector("#barcodeScanStatus");
const mobileAnalyze = document.querySelector("#mobileAnalyze");
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

function productImage(product) {
  if (product.imageUrl) {
    return `<img class="product-thumb" src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(`${product.brand} ${product.name}`)}" loading="lazy" />`;
  }

  return `<span class="product-thumb product-thumb-placeholder">${escapeHtml((product.brand || "?").slice(0, 1).toUpperCase())}</span>`;
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

﻿function concentrationZone(index, total) {
  if (index === 0) return "основа формулы";
  if (index <= 4) return "вероятно высокая или средняя концентрационная зона";
  if (index / Math.max(total, 1) < 0.45) return "вероятно средняя зона";
  return "вероятно низкая зона или блок до/ниже 1%";
}

function scrollToResult() {
  if (!result) return;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submitAnalysisFromSticky() {
  form?.requestSubmit();
}

function clearPhotoState() {
  photoInputs.forEach((input) => { input.value = ""; });
  if (photoPreview) {
    if (photoPreview.src?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.src);
    photoPreview.removeAttribute("src");
  }
  if (photoText) photoText.value = "";
  if (photoStatus) {
    photoStatus.textContent = "";
    photoStatus.hidden = true;
  }
  if (photoReview) photoReview.hidden = true;
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
  if (!expertSummary.length) expertSummary.push("Формула выглядит как базовое уходовое средство. Главная неопределенность - проценты, pH и индивидуальная переносимость.");

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

function showAuthReturnStatus() {
  const authCode = new URLSearchParams(window.location.search).get("auth");
  if (authCode !== "google_ok") return;
  setProductStatus("Вы вошли через Google. История разборов будет сохраняться в профиле.", "ok");
  window.history.replaceState({}, "", "/");
}

function hideSuggestions() {
  if (!productSuggestions) return;
  productSuggestions.hidden = true;
  productSuggestions.innerHTML = "";
}

function syncSearchClear() {
  if (!productClear) return;
  productClear.hidden = !(productName?.value.trim());
}

function saveLocalHistory(key, entry, limit = 30) {
  try {
    const items = JSON.parse(localStorage.getItem(key) || "[]");
    items.unshift({ ...entry, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(items.slice(0, limit)));
  } catch {
    // Local history is optional; analysis must keep working if storage is blocked.
  }
}

async function saveServerHistory(entry) {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    if (!data.user) return;

    await fetch("/api/user/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch {
    // Server history is optional; local analysis should not be blocked by auth state.
  }
}

function buildAnalysisHistoryEntry(payload, analysis, sourceLabel = "") {
  const productTitle = payload.productName || sourceLabel || analysis.formulaType || "Разбор состава";
  return {
    kind: "analysis",
    title: productTitle,
    productName: payload.productName || "",
    score: analysis.score?.score,
    formulaType: analysis.formulaType,
    payload: {
      productName: payload.productName || "",
      source: sourceLabel || "",
      composition: String(payload.text || "").slice(0, 4000),
      profile: payload.profile || {},
      score: analysis.score?.score,
      formulaType: analysis.formulaType,
      analysis
    }
  };
}

function saveAnalysisSnapshot(payload, analysis, sourceLabel = "") {
  const entry = buildAnalysisHistoryEntry(payload, analysis, sourceLabel);
  saveLocalHistory("analysisHistory", entry, 50);
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
    setProductStatus("Карточка найдена, но состав пока не подтянулся. Можно вставить состав вручную.", "warn");
    return;
  }

  composition.value = detailedProduct.composition;
  hideSuggestions();
  saveLocalHistory("productSearchHistory", {
    id: detailedProduct.id,
    brand: detailedProduct.brand,
    name: detailedProduct.name,
    source: detailedProduct.source
  });
  saveServerHistory({
    kind: "product",
    title: `${detailedProduct.brand} ${detailedProduct.name}`.trim(),
    payload: {
      id: detailedProduct.id,
      brand: detailedProduct.brand,
      source: detailedProduct.source
    }
  });

  const source = detailedProduct.verified
    ? detailedProduct.source
    : `${detailedProduct.source}, проверьте состав по этикетке`;
  const verifiedAt = detailedProduct.verifiedAt ? ` Проверено: ${detailedProduct.verifiedAt}.` : "";
  const scopeNote = detailedProduct.compositionScope === "active_ingredients_only"
    ? " Это не полный INCI: подставлены только активные ингредиенты из официальной карточки."
    : "";
  setProductStatus(`Состав подставлен: ${source}.${verifiedAt}${scopeNote}`, detailedProduct.verified ? "ok" : "warn");
  return detailedProduct;
}

async function autofillCompositionFromName() {
  const query = productName?.value.trim() || "";
  if (composition.value.trim()) return true;
  if (!query) return false;

  setProductStatus("Ищу состав по названию средства...");

  try {
    const data = await searchProductByName(query);
    const candidate = (data.products || []).find((product) => product.hasComposition || product.composition);

    if (!candidate) {
      hideSuggestions();
      setProductStatus("Состав по названию пока не найден. Уточните бренд/название или вставьте состав с упаковки вручную.", "warn");
      return false;
    }

    const detailedProduct = await applyProduct(candidate);
    return Boolean(detailedProduct?.composition || composition.value.trim());
  } catch {
    setProductStatus("Поиск временно недоступен. Можно попробовать позже или вставить состав с упаковки вручную.", "warn");
    return false;
  }
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

  if (!products.length) {
    renderReviewRequest(productName.value.trim());
    return false;
  }

  productSuggestions.innerHTML = products
    .map((product, index) => {
      const verifiedAt = product.verifiedAt ? ` · ${escapeHtml(product.verifiedAt)}` : "";
      const verificationNote = product.verified ? "" : " · проверьте по этикетке";
      return `
        <button class="suggestion" type="button" data-index="${index}">
          ${productImage(product)}
          <span class="suggestion-body">
            <strong>${escapeHtml(product.name)} <em>${escapeHtml(product.trustLabel || "Источник")}</em></strong>
            <span>${escapeHtml(product.brand)} · ${escapeHtml(product.category || "категория не указана")}</span>
            <small>${escapeHtml(product.source)}${verifiedAt}${verificationNote}</small>
          </span>
        </button>
      `;
    })
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
productName?.addEventListener("input", syncSearchClear);

productClear?.addEventListener("click", () => {
  productName.value = "";
  composition.value = "";
  hideSuggestions();
  setProductStatus("");
  syncSearchClear();
  productName.focus();
});

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

function openCatalog() {
  catalogDrawer?.setAttribute("aria-hidden", "false");
}

function closeCatalog() {
  catalogDrawer?.setAttribute("aria-hidden", "true");
}

let catalogProductsCache = [];
let catalogLoaded = false;

function catalogText(product) {
  return normalizeProductText(`${product.brand} ${product.name} ${product.category} ${product.source || ""} ${product.composition || ""}`);
}

function cleanOcrText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[|]/g, "I")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCompositionCandidate(text) {
  const clean = cleanOcrText(text);
  const marker = clean.match(/(?:состав|inci|ingredients?|ингредиенты)\s*[:：]?\s*([\s\S]{40,1600})/i);
  const source = marker?.[1] || clean;
  const beforeWarnings = source.split(/(?:меры предосторожности|способ применения|применение|изготовитель|производитель|warning|caution|directions|usage)/i)[0];
  const lines = beforeWarnings
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const likelyIngredientLines = lines.filter((line) => {
    const commaCount = (line.match(/,/g) || []).length;
    return commaCount >= 1 || /\b(aqua|water|glycerin|acid|extract|oil|alcohol|glycol|parfum|phenoxyethanol|niacinamide|panthenol)\b/i.test(line);
  });
  const candidate = (likelyIngredientLines.length ? likelyIngredientLines : lines).join(" ");
  return candidate
    .replace(/\s*[,;]\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
}

function guessProductNameFromPhotoText(text) {
  const lines = cleanOcrText(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-zА-Яа-яЁё0-9%+\- ]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 70)
    .filter((line) => !/состав|inci|ingredients|меры|примен|изготов|производ|гост|eac|barcode|регистрац/i.test(line));

  return lines.slice(0, 4).join(" / ");
}

async function resolvePhotoText(text) {
  try {
    const response = await fetch("/api/photo/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error("Photo resolve failed");
    return await response.json();
  } catch {
    const compositionCandidate = extractCompositionCandidate(text);
    const ingredients = parseIngredients(compositionCandidate);
    return {
      mode: ingredients.length >= 3 ? "composition" : "unknown",
      cleanedText: ingredients.join(", "),
      ingredients,
      composition: ingredients.join(", "),
      confidence: ingredients.length >= 3 ? 0.45 : 0,
      message: ingredients.length >= 3
        ? "Серверная очистка недоступна, использована локальная очистка состава."
        : "Не удалось обработать фото. Попробуйте еще раз."
    };
  }
}

async function identifyProductFromPhotoText(text) {
  try {
    const response = await fetch("/api/products/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.product || null;
  } catch {
    return null;
  }
}

async function analyzeCurrentComposition(sourceLabel = "") {
  const text = composition.value.trim();
  if (!text) {
    result.innerHTML = `<div class="error">Сначала нужен состав: выберите средство, распознайте фото или вставьте список ингредиентов.</div>`;
    scrollToResult();
    return;
  }

  const payload = {
    text,
    productName: productName?.value.trim() || sourceLabel,
    profile: {
      skinType: document.querySelector("#skinType").value,
      context: document.querySelector("#context").value,
      concerns: document.querySelector("#concerns").value
    }
  };

  result.innerHTML = `<div class="loading">Разбираю состав...</div>`;
  scrollToResult();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Analyze failed");
    const analysis = await response.json();
    saveAnalysisSnapshot(payload, analysis, sourceLabel);
    render(analysis);
  } catch {
    const analysis = localAnalyzeComposition(payload);
    saveAnalysisSnapshot(payload, analysis, sourceLabel);
    render(analysis);
  }
  scrollToResult();
}

function classifyCatalogProduct(product) {
  const text = catalogText(product);
  if (/hair|волос|scalp|шампун|бород|trixosil/.test(text)) return { category: "Волосы и кожа головы", subcategory: /shampoo|шампун/.test(text) ? "Шампуни и очищение" : "Рост и уход" };
  if (/spf|sunscreen|zinc|titanium|uv|санскрин|защит/.test(text)) return { category: "SPF и защита", subcategory: /mineral|zinc|titanium/.test(text) ? "Минеральные фильтры" : "Солнцезащита" };
  if (/glycolic|lactic|salicylic|aha|bha|peel|acid|кислот|пилинг/.test(text)) return { category: "Кислоты и пилинги", subcategory: /salicylic|bha/.test(text) ? "BHA" : /glycolic|lactic|aha/.test(text) ? "AHA" : "Пилинги" };
  if (/acne|акне|comedon|комедон|clarifying/.test(text)) return { category: "Акне и комедоны", subcategory: "Себорегуляция" };
  if (/retinol|retinal|retinoid|ретин/.test(text)) return { category: "Ретиноиды", subcategory: "Ретинол и ретиноиды" };
  if (/barrier|panthenol|ceramide|cicalfate|repair|recovery|барьер|восстанов/.test(text)) return { category: "Барьер и восстановление", subcategory: "Восстановление" };
  if (/clean|soap|gel|wash|очищ|мыло/.test(text)) return { category: "Очищение", subcategory: "Гели и мыло" };
  if (/moistur|cream|serum|сыворот|крем|увлаж/.test(text)) return { category: "Уходовые средства", subcategory: /serum|сыворот/.test(text) ? "Сыворотки" : "Кремы и увлажнение" };
  return { category: "Другое", subcategory: product.sourceType === "open_beauty_facts" ? "Open Beauty Facts" : "Локальная база" };
}

function enrichCatalogProduct(product) {
  return { ...product, ...classifyCatalogProduct(product) };
}

async function loadCatalogProducts() {
  if (catalogLoaded) return catalogProductsCache;
  const response = await fetch("/api/products/catalog");
  const data = await response.json();
  catalogProductsCache = (data.products || []).map(enrichCatalogProduct);
  catalogLoaded = true;
  return catalogProductsCache;
}

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeBrandKey(value) {
  return normalizeProductText(String(value || "").split(/[,;/|]+/)[0]);
}

function brandDisplayName(value) {
  return String(value || "")
    .split(/[,;/|]+/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueBrands(products) {
  const brands = new Map();
  products.forEach((product) => {
    const key = normalizeBrandKey(product.brand);
    if (!key) return;
    const label = brandDisplayName(product.brand);
    const current = brands.get(key);
    if (!current || (label.length < current.label.length && label.length > 1)) {
      brands.set(key, { key, label });
    }
  });
  return Array.from(brands.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function renderCatalogFilters(products) {
  if (!catalogCategories) return;
  const brands = uniqueBrands(products);
  const categories = uniqueSorted(products.map((product) => product.category));
  catalogCategories.innerHTML = `
    <div class="catalog-filters">
      <label>Поиск<input id="catalogTextFilter" type="search" placeholder="Название, бренд, актив..." /></label>
      <label>Категория<select id="catalogCategoryFilter"><option value="">Все категории</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Производитель<select id="catalogBrandFilter"><option value="">Все производители</option>${brands.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label>Данные<select id="catalogSourceFilter"><option value="">Любые данные</option><option value="verified">Проверенные</option><option value="hasComposition">Есть состав</option><option value="hasImage">Есть фото</option><option value="open_beauty_facts">Open Beauty Facts</option></select></label>
    </div>
  `;
  catalogCategories.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", () => renderCatalogTree(applyCatalogFilters(products)));
    control.addEventListener("change", () => renderCatalogTree(applyCatalogFilters(products)));
  });
}

function applyCatalogFilters(products) {
  const text = normalizeProductText(document.querySelector("#catalogTextFilter")?.value || "");
  const category = document.querySelector("#catalogCategoryFilter")?.value || "";
  const brand = document.querySelector("#catalogBrandFilter")?.value || "";
  const source = document.querySelector("#catalogSourceFilter")?.value || "";
  return products.filter((product) => {
    if (text && !catalogText(product).includes(text)) return false;
    if (category && product.category !== category) return false;
    if (brand && normalizeBrandKey(product.brand) !== brand) return false;
    if (source === "verified" && !product.verified) return false;
    if (source === "hasComposition" && !product.hasComposition) return false;
    if (source === "hasImage" && !product.imageUrl) return false;
    if (source === "open_beauty_facts" && product.sourceType !== "open_beauty_facts") return false;
    return true;
  });
}

function groupBy(items, key) {
  const grouped = new Map();
  items.forEach((item) => {
    const value = item[key] || "Без раздела";
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item);
  });
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function productLetter(product) {
  return (product.name || product.brand || "#").trim().slice(0, 1).toUpperCase();
}

function renderCatalogTree(products = []) {
  if (!catalogResults) return;
  if (!products.length) {
    catalogResults.innerHTML = `<p class="field-note">По выбранным фильтрам ничего не найдено.</p>`;
    return;
  }
  catalogResults.innerHTML = groupBy(products, "category").map(([category, categoryProducts], categoryIndex) => `
    <details class="catalog-node" ${categoryIndex === 0 ? "open" : ""}>
      <summary>${escapeHtml(category)} <span>${categoryProducts.length}</span></summary>
      <div class="catalog-branch">
        ${groupBy(categoryProducts, "subcategory").map(([subcategory, subProducts]) => `
          <details class="catalog-node catalog-brand" open>
            <summary>${escapeHtml(subcategory)} <span>${subProducts.length}</span></summary>
            <div class="catalog-branch">
              ${groupBy(subProducts.map((product) => ({ ...product, letter: productLetter(product) })), "letter").map(([letter, letterProducts]) => `
                <details class="catalog-node catalog-letter" open>
                  <summary>${escapeHtml(letter)} <span>${letterProducts.length}</span></summary>
                  <div class="catalog-products">
                    ${letterProducts.sort((a, b) => a.name.localeCompare(b.name)).map((product) => `
                      <button class="catalog-product" type="button" data-product-id="${escapeHtml(product.id)}">
                        ${productImage(product)}
                        <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand)} · ${escapeHtml(product.source || "")}</small></span>
                      </button>
                    `).join("")}
                  </div>
                </details>
              `).join("")}
            </div>
          </details>
        `).join("")}
      </div>
    </details>
  `).join("");
  catalogResults.querySelectorAll(".catalog-product").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = catalogProductsCache.find((item) => item.id === button.dataset.productId);
      if (product) await applyProduct(product);
      if (catalogOpen) catalogOpen.checked = false;
      closeCatalog();
    });
  });
}

async function renderCatalog() {
  if (!catalogResults) return;
  catalogResults.innerHTML = `<div class="loading compact-loading">Собираю каталог...</div>`;
  const products = await loadCatalogProducts();
  renderCatalogFilters(products);
  renderCatalogTree(applyCatalogFilters(products));
}

function initCatalog() {
  renderCatalog();
}
catalogToggle?.addEventListener("click", () => {
  openCatalog();
  renderCatalog();
});

if (catalogToggle) {
  catalogToggle.onclick = (event) => {
    event.preventDefault();
    if (catalogOpen) catalogOpen.checked = true;
    openCatalog();
    renderCatalog();
  };
}

document.addEventListener("click", (event) => {
  if (event.target.closest?.("#catalogToggle")) {
    event.preventDefault();
    openCatalog();
    renderCatalog();
  }
});

catalogClose?.addEventListener("click", closeCatalog);
catalogDrawer?.addEventListener("click", (event) => {
  if (event.target === catalogDrawer) closeCatalog();
});

async function recognizePhotoText(file) {
  if (!window.Tesseract?.recognize) {
    throw new Error("OCR-модуль не загрузился. Проверьте интернет-соединение и попробуйте еще раз.");
  }

  const result = await window.Tesseract.recognize(file, "eng+rus", {
    logger: (event) => {
      if (!photoStatus || event.status !== "recognizing text") return;
      const progress = Math.round((event.progress || 0) * 100);
      photoStatus.textContent = `Распознаю текст с фото: ${progress}%`;
    }
  });

  return cleanOcrText(result?.data?.text || "");
}

async function applyPhotoText({ analyze = false } = {}) {
  const rawText = photoText?.value.trim() || "";
  if (!rawText) {
    if (photoStatus) {
      photoStatus.hidden = false;
      photoStatus.textContent = "Сначала нужен распознанный текст. Если OCR ошибся, вставьте текст с упаковки вручную.";
    }
    return false;
  }

  const resolution = await resolvePhotoText(rawText);
  return applyPhotoResolution(resolution, { analyze, fallbackText: rawText });
}

async function applyPhotoResolution(resolution, { analyze = false, fallbackText = "" } = {}) {
  const ingredients = resolution.ingredients || [];
  const product = resolution.product || null;
  const nextComposition = resolution.composition || resolution.cleanedText || "";

  if (!nextComposition || (resolution.mode !== "product" && ingredients.length < 3)) {
    if (photoText) photoText.value = resolution.cleanedText || fallbackText;
    if (photoStatus) {
      photoStatus.hidden = false;
      photoStatus.textContent = resolution.message || "Не удалось уверенно выделить состав или определить средство. Попробуйте фото ближе, ровнее и при хорошем свете.";
    }
    return false;
  }

  composition.value = nextComposition;
  if (photoText) photoText.value = nextComposition;

  if (product) {
    productName.value = `${product.brand} ${product.name}`.replace(/\s+/g, " ").trim();
    setProductStatus(`По фото найдено: ${product.brand} ${product.name}. Источник состава: ${product.source || "база сервиса"}.`, product.composition ? "ok" : "warn");
  } else {
    const guessedName = guessProductNameFromPhotoText(fallbackText);
    if (guessedName && !productName.value.trim()) productName.value = guessedName;
    setProductStatus("Средство по фото не найдено в базе, но состав очищен и готов к разбору.", "warn");
  }

  const purposeText = resolution.purpose?.label
    ? ` Назначение: ${resolution.purpose.label}.`
    : "";
  if (photoStatus) {
    photoStatus.hidden = false;
    photoStatus.textContent = `${resolution.message || "Фото обработано."}${purposeText} ${ingredients.length ? `Выделено ингредиентов: ${ingredients.length}.` : "Состав подтянут из карточки средства."}`;
  }

  if (analyze) await analyzeCurrentComposition(product ? "Фото лицевой этикетки" : "Фото состава");
  return true;
}

async function handlePhotoFile(file) {
  if (!file || !photoStatus) return;

  photoStatus.hidden = false;
  photoStatus.textContent = "Фото принято. Распознаю текст и определяю сторону упаковки...";
  photoStatus.scrollIntoView({ behavior: "smooth", block: "center" });

  if (photoReview) photoReview.hidden = false;
  if (photoPreview) {
    if (photoPreview.src?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.src);
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
  }

  try {
    const text = await recognizePhotoText(file);
    if (photoText) photoText.value = "Очищаю распознанный текст...";

    if (!text || text.length < 12) {
      photoStatus.textContent = "Текст почти не распознан. Попробуйте фото ближе, ровнее, при хорошем свете.";
      return;
    }

    const resolution = await resolvePhotoText(text);
    await applyPhotoResolution(resolution, { analyze: true, fallbackText: text });
  } catch (error) {
    photoStatus.textContent = error.message || "Не удалось распознать фото. Попробуйте другое фото или вставьте состав вручную.";
  }
}

let cameraStream = null;
let barcodeStream = null;
let barcodeFrameRequest = null;

function stopCameraStream() {
  cameraStream?.getTracks?.().forEach((track) => track.stop());
  cameraStream = null;
  if (cameraVideo) cameraVideo.srcObject = null;
}

function stopBarcodeScanner() {
  if (barcodeFrameRequest) cancelAnimationFrame(barcodeFrameRequest);
  barcodeFrameRequest = null;
  barcodeStream?.getTracks?.().forEach((track) => track.stop());
  barcodeStream = null;
  if (barcodeVideo) barcodeVideo.srcObject = null;
  if (barcodeCapture) barcodeCapture.hidden = true;
}

function extractBarcodeValue(rawValue = "") {
  const raw = String(rawValue || "").trim();
  const digitMatch = raw.match(/(?:^|[^\d])(\d{8,14})(?:[^\d]|$)/);
  return digitMatch?.[1] || raw;
}

function applyScannedCode(rawValue = "") {
  const value = extractBarcodeValue(rawValue);
  stopBarcodeScanner();

  if (/^\d{8,14}$/.test(value)) {
    barcodeInput.value = value;
    setProductStatus(`Код распознан: ${value}. Ищу товар...`, "ok");
    barcodeApply?.click();
    return;
  }

  if (value) {
    productName.value = value;
    composition.value = "";
    setProductStatus("QR распознан. Пробую найти средство по содержимому QR...", "ok");
    form?.requestSubmit();
  }
}

async function openBarcodeScanner() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia || !barcodeCapture || !barcodeVideo) {
    setProductStatus("Сканер штрихкодов недоступен в этом браузере. Введите EAN/UPC вручную.", "warn");
    barcodeInput?.focus();
    return;
  }

  try {
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128", "code_39", "itf"]
    });
    barcodeCapture.hidden = false;
    barcodeScanStatus.textContent = "Разрешите доступ к камере и наведите ее на код.";
    barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    barcodeVideo.srcObject = barcodeStream;
    await barcodeVideo.play();
    barcodeScanStatus.textContent = "Ищу штрихкод или QR в кадре...";

    const scanFrame = async () => {
      if (!barcodeStream || barcodeCapture.hidden) return;
      try {
        const codes = await detector.detect(barcodeVideo);
        if (codes?.length) {
          applyScannedCode(codes[0].rawValue || "");
          return;
        }
      } catch {
        barcodeScanStatus.textContent = "Не удалось прочитать код. Держите упаковку ровнее и ближе к камере.";
      }
      barcodeFrameRequest = requestAnimationFrame(scanFrame);
    };

    barcodeFrameRequest = requestAnimationFrame(scanFrame);
  } catch {
    stopBarcodeScanner();
    setProductStatus("Не удалось открыть камеру для сканирования. Введите EAN/UPC вручную.", "warn");
    barcodeInput?.focus();
  }
}

async function openCameraCapture() {
  if (!navigator.mediaDevices?.getUserMedia || !cameraCapture || !cameraVideo) {
    photoCameraInput?.click();
    return;
  }

  try {
    cameraCapture.hidden = false;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
  } catch {
    stopCameraStream();
    cameraCapture.hidden = true;
    photoCameraInput?.click();
  }
}

async function captureCameraFrame() {
  if (!cameraVideo || !cameraCanvas) return;
  const width = cameraVideo.videoWidth || 1280;
  const height = cameraVideo.videoHeight || 720;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const context = cameraCanvas.getContext("2d");
  context.drawImage(cameraVideo, 0, 0, width, height);

  cameraCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `label-${Date.now()}.jpg`, { type: "image/jpeg" });
    stopCameraStream();
    cameraCapture.hidden = true;
    await handlePhotoFile(file);
  }, "image/jpeg", 0.92);
}

if (photoCameraOpen?.tagName === "BUTTON") {
  photoCameraOpen.addEventListener("click", openCameraCapture);
}
photoClear?.addEventListener("click", clearPhotoState);
cameraClose?.addEventListener("click", () => {
  stopCameraStream();
  cameraCapture.hidden = true;
});
cameraFallback?.addEventListener("click", () => {
  stopCameraStream();
  cameraCapture.hidden = true;
  photoCameraInput?.click();
});
cameraShot?.addEventListener("click", captureCameraFrame);

photoInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    await handlePhotoFile(input.files?.[0]);
    input.value = "";
  });
});

photoUseComposition?.addEventListener("click", () => {
  applyPhotoText({ analyze: false });
});

photoAnalyze?.addEventListener("click", () => {
  applyPhotoText({ analyze: true });
});

barcodeApply?.addEventListener("click", () => {
  const code = barcodeInput?.value.trim() || "";
  if (!code) return;
  productName.value = code;
  composition.value = "";
  setProductStatus("Ищу средство по EAN/UPC...");
  form?.requestSubmit();
});

barcodeScan?.addEventListener("click", openBarcodeScanner);
barcodeScanClose?.addEventListener("click", stopBarcodeScanner);

barcodeInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  barcodeApply?.click();
});

mobileAnalyze?.addEventListener("click", submitAnalysisFromSticky);

initCatalog();

function render(data) {
  const purpose = data.productSafety || data.productClassification || {};
  const purposeSection = `
    <section class="section product-purpose">
      <p class="eyebrow">Назначение средства</p>
      <h2>${escapeHtml(purpose.label || data.formulaType || "Тип средства требует уточнения")}</h2>
      <p>${escapeHtml(purpose.intendedUse || "Назначение не определено уверенно только по составу. Сверьте название, карточку товара и инструкцию производителя.")}</p>
      ${purpose.application ? `<p><strong>Как применять:</strong> ${escapeHtml(purpose.application)}</p>` : ""}
      ${purpose.confidence ? `<p class="confidence">Уверенность определения: ${Math.round(Number(purpose.confidence || 0) * 100)}%</p>` : ""}
    </section>
  `;
  const safetyNotice = data.productSafety?.shouldScoreAsCosmetic === false
    ? `
      <section class="section safety-notice">
        <h2>Это не обычное уходовое средство</h2>
        <p>${escapeHtml(data.productSafety.message || "Формула похожа на процедурный препарат. Обычная косметическая оценка отключена.")}</p>
        ${data.productSafety.intendedUse ? `<p><strong>Назначение:</strong> ${escapeHtml(data.productSafety.intendedUse)}</p>` : ""}
        ${data.productSafety.application ? `<p><strong>Применение:</strong> ${escapeHtml(data.productSafety.application)}</p>` : ""}
      </section>
    `
    : "";
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

  const quality = data.qualitySummary || {};
  const qualityScore = quality.score == null ? "—" : `${quality.score}/10`;
  const qualitySection = `
    <section class="section quality-section">
      <div class="quality-head">
        <div>
          <p class="eyebrow">Компонентная база</p>
          <h2>Качество компонентов</h2>
          <p>${escapeHtml(quality.methodology || "Оценка строится по экспертной базе ингредиентов и не заменяет документы производителя.")}</p>
        </div>
        <div class="quality-total">
          <strong>${escapeHtml(qualityScore)}</strong>
          <span>${escapeHtml(quality.label || "недостаточно данных")}</span>
        </div>
      </div>
      <p class="confidence">Уверенность: ${escapeHtml(quality.confidence || "неизвестно")} · распознано для оценки ${escapeHtml(quality.knownCount ?? 0)} из ${escapeHtml(quality.totalIngredients ?? data.totalIngredients ?? 0)}, неизвестных ${escapeHtml(quality.unknownCount ?? data.unknown?.length ?? 0)}.</p>
    </section>
  `;

  const found = data.found
    .map((item) => `
      <article class="ingredient">
        <div>
          <h3>${escapeHtml(item.name)} <span>${escapeHtml(item.ru || "")}</span></h3>
          <p>${escapeHtml(item.note)}</p>
          ${item.quality_note ? `<p class="quality-note">${escapeHtml(item.quality_note)}</p>` : ""}
        </div>
        <dl>
          <dt>Качество</dt>
          <dd>${item.ingredient_quality_score == null ? "—" : `${escapeHtml(item.ingredient_quality_score)}/10`}</dd>
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
  const alternatives = data.alternatives?.length
    ? `
      <section class="section">
        <h2>Похожие аналоги</h2>
        <p class="muted">MVP-подбор по локальной базе: похожесть не означает полный аналог, цену и наличие в РФ нужно сверять перед покупкой.</p>
        <div class="insight-list">
          ${data.alternatives.map((item) => `
            <article class="insight-card">
              <strong>${escapeHtml(item.brand)} ${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(item.similarity)}% похожести · ${escapeHtml(item.ruAvailability || "наличие нужно проверить")} · ${escapeHtml(item.price || "цена пока не подключена")}</p>
              <p>${escapeHtml((item.why || []).join(", "))}</p>
              ${(item.matchedIngredients || []).length ? `<p>Совпало: ${escapeHtml(item.matchedIngredients.join(", "))}</p>` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `
    : "";
  const proprietaryComplexes = data.proprietaryComplexes?.length
    ? `
      <section class="section">
        <h2>Комплексы производителя</h2>
        <p class="muted">Эти названия сохранены как указаны в INCI. Без раскрытого состава нельзя подтвердить активы, концентрации и реальный вклад комплекса.</p>
        ${list(data.proprietaryComplexes.map((item) => `${item.name}: ${item.note}`), "Комплексов производителя не найдено.")}
      </section>
    `
    : "";
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
    ${purposeSection}

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

    ${safetyNotice}

    <section class="section">
      <h2>Главный вывод</h2>
      ${expertSummary}
    </section>

    <section class="section">
      <h2>Как устроена формула</h2>
      ${architecture}
    </section>

    ${qualitySection}

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

    ${proprietaryComplexes}

    ${alternatives}

    ${unknownSection}
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const hasComposition = await autofillCompositionFromName();

  if (!hasComposition) {
    result.innerHTML = `<div class="error">Не удалось автоматически подтянуть состав. Выберите средство из подсказок или каталога, либо уточните название.</div>`;
    scrollToResult();
    return;
  }

  const payload = {
    text: composition.value,
    productName: productName?.value.trim() || "",
    profile: {
      skinType: document.querySelector("#skinType").value,
      context: document.querySelector("#context").value,
      concerns: document.querySelector("#concerns").value
    }
  };

  result.innerHTML = `<div class="loading">Разбираю состав...</div>`;
  scrollToResult();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Analyze failed");
    const analysis = await response.json();
    saveAnalysisSnapshot(payload, analysis);
    render(analysis);
  } catch {
    const analysis = localAnalyzeComposition(payload);
    saveAnalysisSnapshot(payload, analysis);
    render(analysis);
  }
  scrollToResult();
});

showAuthReturnStatus();
