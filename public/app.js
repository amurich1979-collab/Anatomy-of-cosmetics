const form = document.querySelector("#analysisForm");
import { normalizeProductIdentifier } from "./barcode-utils.js";
import { normalizeAnalysisProfile, hasPersonalProfile, isSessionOnlyHistory } from "./analysis-profile.js";
import { buildAnalysisHistoryEntry } from "./history-snapshot.js";
const result = document.querySelector("#result");
const productName = document.querySelector("#productName");
const productSuggestions = document.querySelector("#productSuggestions");
const productStatus = document.querySelector("#productStatus");
const productClear = document.querySelector("#productClear");
const productSearchAction = document.querySelector("#productSearchAction");
const formulaVariantChoices = document.querySelector("#formulaVariantChoices");
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
const barcodeImageUpload = document.querySelector("#barcodeImageUpload");
const barcodeImageInput = document.querySelector("#barcodeImageInput");
const barcodeCapture = document.querySelector("#barcodeCapture");
const barcodeVideo = document.querySelector("#barcodeVideo");
const barcodeScanClose = document.querySelector("#barcodeScanClose");
const barcodeScanStatus = document.querySelector("#barcodeScanStatus");
const mobileAnalyze = document.querySelector("#mobileAnalyze");
const tg = window.Telegram?.WebApp;

let selectedProductCard = null;
let compositionOrigin = {
  mode: "empty",
  productId: "",
  source: "",
  sourceType: "",
  sourceUrl: "",
  sourceDate: null,
  formulaScope: "unknown",
  formulaVersion: null,
  market: null
};
let productSelectionRevision = 0;
let productSearchRevision = 0;
let activeProductSearchController = null;
let lastProductSearchText = productName?.value.trim() || "";
let personalProfileRevision = 0;

function readAnalysisProfile() {
  const value = (id) => document.getElementById(id)?.value || "";
  return normalizeAnalysisProfile({
    skinType: value("skinType"), context: value("context"), concerns: value("concerns"),
    goals: value("profileGoal") ? [value("profileGoal")] : [],
    applicationArea: value("applicationArea"), allergyStatus: value("allergyStatus"),
    allergens: value("allergens"), previousReaction: value("previousReaction")
  });
}

document.querySelectorAll("#skinType, #context, #concernsCustom, .concern-chip, #profileGoal, #applicationArea, #allergyStatus, #allergens, #previousReaction").forEach((control) => {
  control.addEventListener(control.matches("button") ? "click" : "input", () => {
    personalProfileRevision += 1;
    clearAnalysisResult();
    result?.removeAttribute("aria-busy");
  });
});

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

function productDisplayName(product) {
  return `${product?.brand || ""} ${product?.name || ""}`.replace(/\s+/g, " ").trim();
}

function clearAnalysisResult() {
  if (result) result.innerHTML = "";
}

function syncSelectedProductDataset() {
  if (!productName) return;
  if (!selectedProductCard) {
    delete productName.dataset.selectedProductId;
    delete productName.dataset.selectedProductSource;
    return;
  }
  productName.dataset.selectedProductId = String(selectedProductCard.id || "");
  productName.dataset.selectedProductSource = String(selectedProductCard.source || "");
}

function setSelectedProduct(product) {
  selectedProductCard = product || null;
  syncSelectedProductDataset();
}

function setCompositionValue(value, {
  mode = "empty",
  product = null,
  source = "",
  sourceType = "",
  sourceUrl = "",
  sourceDate = null,
  formulaScope = "unknown",
  formulaVersion = null,
  market = null
} = {}) {
  if (composition) composition.value = value || "";
  compositionOrigin = value
    ? {
        mode,
        productId: product?.id || "",
        source: source || product?.source || "",
        sourceType: sourceType || product?.sourceType || mode,
        sourceUrl,
        sourceDate,
        formulaScope: formulaScope || "unknown",
        formulaVersion,
        market
      }
    : {
        mode: "empty",
        productId: "",
        source: "",
        sourceType: "",
        sourceUrl: "",
        sourceDate: null,
        formulaScope: "unknown",
        formulaVersion: null,
        market: null
      };
}

function normalizeFormulaText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function productFormulaVariants(product) {
  const variants = [];
  const add = (variant) => {
    if (!variant?.composition || variants.some((item) => normalizeFormulaText(item.composition) === normalizeFormulaText(variant.composition))) return;
    variants.push({
      composition: variant.composition,
      source: variant.source || product?.source || "Источник не указан",
      sourceType: variant.sourceType || product?.sourceType || "unknown",
      sourceUrl: variant.sourceUrl || product?.sourceUrl || null,
      updatedAt: variant.updatedAt || null,
      fetchedAt: variant.fetchedAt || variant.retrievedAt || product?.importedAt || null,
      market: variant.market || product?.market || null,
      variant: variant.variant || product?.variant || null,
      formulaVersion: variant.formulaVersion || product?.formulaVersion || null,
      compositionScope: variant.compositionScope || product?.compositionScope || "unknown"
    });
  };

  add(product);
  (product?.formulaVariants || []).forEach(add);
  return variants;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formulaVariantLabel(variant, index) {
  const details = [variant.source, variant.market, variant.variant || variant.formulaVersion, variant.updatedAt]
    .filter(Boolean)
    .join(" · ");
  return details || `Версия состава ${index + 1}`;
}

function clearFormulaVariantChoices() {
  if (!formulaVariantChoices) return;
  formulaVariantChoices.hidden = true;
  formulaVariantChoices.innerHTML = "";
}

function applyFormulaVariant(product, variant) {
  if (!variant?.composition) return;
  const keepsIndependentComposition = ["manual", "photo"].includes(compositionOrigin.mode)
    && composition?.value.trim()
    && normalizeFormulaText(composition.value) !== normalizeFormulaText(variant.composition);
  if (keepsIndependentComposition && !window.confirm("Заменить текущий независимый состав выбранной версией из карточки товара?")) {
    setProductStatus("Сохранён текущий независимый состав. Версия из карточки не подставлена.", "warn");
    return;
  }
  setSelectedProduct(product);
  setCompositionValue(variant.composition, {
    mode: "product",
    product,
    source: variant.source,
    sourceType: variant.sourceType,
    sourceUrl: variant.sourceUrl,
    sourceDate: variant.updatedAt || variant.fetchedAt || null,
    formulaScope: variant.compositionScope,
    formulaVersion: variant.formulaVersion || variant.variant || null,
    market: variant.market || null
  });
  clearFormulaVariantChoices();
  clearAnalysisResult();
  setProductStatus(`Выбрана версия состава: ${formulaVariantLabel(variant, 0)}.`, "ok");
}

function renderFormulaVariantChoices(product) {
  const variants = productFormulaVariants(product);
  if (!formulaVariantChoices || variants.length < 2) {
    clearFormulaVariantChoices();
    return false;
  }

  formulaVariantChoices.innerHTML = `
    <section class="formula-variant-picker" aria-labelledby="formulaVariantTitle">
      <h3 id="formulaVariantTitle">Найдены разные версии состава</h3>
      <p>Источники сообщают различный INCI. Формулы не объединены: выберите одну версию для разбора.</p>
      <div class="formula-variant-list">
        ${variants.map((variant, index) => `
          <button class="formula-variant-option" type="button" data-formula-variant-index="${index}">
            <strong>Версия ${index + 1}</strong>
            <span>${escapeHtml(formulaVariantLabel(variant, index))}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
  formulaVariantChoices.hidden = false;
  formulaVariantChoices.querySelectorAll("[data-formula-variant-index]").forEach((button) => {
    button.addEventListener("click", () => {
      applyFormulaVariant(product, variants[Number(button.dataset.formulaVariantIndex)]);
    });
  });
  return true;
}

function buildAnalysisEvidence() {
  const product = selectedProductCard;
  const productIdentificationStatus = product
    ? (compositionOrigin.mode === "photo" ? "suggested" : "confirmed")
    : "unknown";

  return {
    product: {
      id: product?.id || null,
      barcode: product?.code || product?.barcode || null,
      brand: product?.brand || null,
      name: product?.name || productName?.value.trim() || null,
      category: product?.category || null,
      description: product?.description || null,
      useInstructions: product?.useInstructions || null,
      identificationStatus: productIdentificationStatus,
      source: {
        name: product?.source || null,
        type: product?.sourceType || null,
        url: product?.sourceUrl || null,
        retrievedAt: product?.importedAt || product?.verifiedAt || null
      }
    },
    formula: {
      scope: compositionOrigin.formulaScope || "unknown",
      version: compositionOrigin.formulaVersion || null,
      market: compositionOrigin.market || null,
      source: {
        name: compositionOrigin.source || null,
        type: compositionOrigin.sourceType || null,
        url: compositionOrigin.sourceUrl || null,
        retrievedAt: compositionOrigin.sourceDate || null
      }
    },
    metrics: {
      ocrReadability: compositionOrigin.mode === "photo" && Number.isFinite(photoJob?.ocr?.confidence)
        ? { value: photoJob.ocr.confidence / 100, status: "measured", method: "tesseract_confidence" }
        : null,
      productIdentification: null
    }
  };
}

function cancelPendingProductWork() {
  productSearchRevision += 1;
  productSelectionRevision += 1;
  activeProductSearchController?.abort();
  activeProductSearchController = null;
}

function invalidateSelectedProduct({ preserveIndependentComposition = true } = {}) {
  const shouldClearComposition = compositionOrigin.mode === "product"
    || (!preserveIndependentComposition && Boolean(composition?.value.trim()));
  setSelectedProduct(null);
  if (shouldClearComposition) setCompositionValue("");
  clearAnalysisResult();
}

function clearPhotoState() {
  cancelPhotoJob();
  stopCameraStream();
  if (cameraCapture) cameraCapture.hidden = true;
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
  if (compositionOrigin.mode === "photo") {
    cancelPendingProductWork();
    setCompositionValue("");
    setSelectedProduct(null);
    if (productName) {
      productName.value = "";
      lastProductSearchText = "";
      syncSearchClear();
    }
    clearAnalysisResult();
  }
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

function saveAnalysisSnapshot(payload, analysis, sourceLabel = "") {
  if (hasPersonalProfile(payload.profile) || isSessionOnlyHistory({ analysis })) return;
  const entry = buildAnalysisHistoryEntry(payload, analysis, sourceLabel);
  if (!entry) return;
  saveLocalHistory("analysisHistory", entry, 50);
}

function analyzeTimeoutMs() {
  const configured = Number(window.__ANALYZE_TIMEOUT_MS__);
  return Number.isFinite(configured) && configured > 0 ? configured : 20000;
}

async function requestServerAnalysis(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), analyzeTimeoutMs());

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`Analyze request failed with HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderAnalysisFailure(payload, sourceLabel, error) {
  const timedOut = error?.name === "AbortError";
  const message = timedOut
    ? "Сервер анализа не ответил вовремя. Состав и фото сохранены на странице — попробуйте повторить запрос."
    : "Не удалось получить разбор с сервера. Состав и фото сохранены на странице — проверьте соединение и повторите запрос.";

  result.innerHTML = `
    <section class="error analysis-failure" role="alert">
      <h2>Разбор не выполнен</h2>
      <p>${message}</p>
      <button class="secondary-action" type="button" id="analysisRetry">Повторить анализ</button>
    </section>
  `;

  result.querySelector("#analysisRetry")?.addEventListener("click", () => {
    runServerAnalysis(payload, sourceLabel);
  });
}

async function runServerAnalysis(payload, sourceLabel = "", isCurrent = null) {
  const photoAtStart = compositionOrigin.mode === "photo" ? photoJob : null;
  const priorIsCurrent = isCurrent || (photoAtStart ? () => currentPhoto(photoAtStart) : () => true);
  const profileRevision = personalProfileRevision;
  isCurrent = () => priorIsCurrent() && profileRevision === personalProfileRevision;
  result.setAttribute("aria-busy", "true");
  result.innerHTML = `<div class="loading">Разбираю состав...</div>`;
  scrollToResult();

  try {
    const analysis = await requestServerAnalysis(payload);
    if (!isCurrent()) return null;
    saveAnalysisSnapshot(payload, analysis, sourceLabel);
    render(analysis);
    return analysis;
  } catch (error) {
    if (!isCurrent()) return null;
    renderAnalysisFailure(payload, sourceLabel, error);
    return null;
  } finally {
    if (isCurrent()) {
      result.removeAttribute("aria-busy");
      scrollToResult();
    }
  }
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
  const selectionRevision = ++productSelectionRevision;
  const displayName = productDisplayName(product);
  const previousMode = compositionOrigin.mode;

  productName.value = displayName;
  lastProductSearchText = displayName;
  syncSearchClear();
  setSelectedProduct(null);
  if (previousMode === "product") setCompositionValue("");
  clearAnalysisResult();
  setProductStatus("Подтягиваю состав из базы...");
  const detailedProduct = await loadProductDetails(product);

  if (selectionRevision !== productSelectionRevision || productName.value.trim() !== displayName) {
    return null;
  }

  setSelectedProduct(detailedProduct);
  const hasIndependentComposition = Boolean(composition.value.trim())
    && (compositionOrigin.mode === "manual" || compositionOrigin.mode === "photo");

  if (productFormulaVariants(detailedProduct).length > 1) {
    if (!hasIndependentComposition) setCompositionValue("");
    hideSuggestions();
    renderFormulaVariantChoices(detailedProduct);
    setProductStatus(
      detailedProduct.formulaConflictNote || "Найдены разные версии состава. Выберите одну версию, чтобы не смешивать INCI из разных источников.",
      "warn"
    );
    return detailedProduct;
  }

  clearFormulaVariantChoices();

  if (!detailedProduct.composition) {
    hideSuggestions();
    const preservedNote = hasIndependentComposition
      ? " Сохранён независимый состав, введённый вручную или полученный с фото."
      : "";
    setProductStatus(`${detailedProduct.compositionAvailabilityNote || "Карточка найдена, но состав пока не подтянулся."}${preservedNote}`, "warn");
    return detailedProduct;
  }

  if (hasIndependentComposition) {
    const replaceExisting = window.confirm("Заменить текущий ручной состав составом из выбранной карточки товара?");
    if (selectionRevision !== productSelectionRevision || productName.value.trim() !== displayName) {
      return null;
    }
    if (!replaceExisting) {
      hideSuggestions();
      setProductStatus("Карточка выбрана. Сохранён независимый ручной состав; состав из карточки не подставлен.", "warn");
      return { ...detailedProduct, compositionPreserved: true };
    }
  }

  setCompositionValue(detailedProduct.composition, {
    mode: "product",
    product: detailedProduct,
    source: detailedProduct.source,
    sourceType: detailedProduct.sourceType,
    sourceUrl: detailedProduct.sourceUrl,
    sourceDate: detailedProduct.importedAt || detailedProduct.verifiedAt || null,
    formulaScope: detailedProduct.compositionScope || "unknown",
    formulaVersion: detailedProduct.formulaVersion || null,
    market: detailedProduct.market || null
  });
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

  setProductStatus("Ищу варианты по названию средства...");

  try {
    const data = await searchProductByName(query);
    if (productName.value.trim() !== query) return false;
    const products = data.products || [];

    if (!products.length) {
      hideSuggestions();
      setProductStatus("Состав по названию пока не найден. Уточните бренд/название или вставьте состав с упаковки вручную.", "warn");
      return false;
    }

    renderSuggestions(products);
    setProductStatus("Выберите конкретное средство из списка. Состав не подставляется без выбора карточки.", "warn");
    return false;
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
async function searchProductByName(query, { signal } = {}) {
  try {
    const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) throw new Error("Search failed");
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") return { products: [], aborted: true };
    return { products: localSearchProducts(query), staticMode: true };
  }
}

const searchProducts = debounce(async (revision, query) => {
  if (revision !== productSearchRevision || query !== productName?.value.trim()) return;

  if (query.length < 1) {
    hideSuggestions();
    setProductStatus("");
    return;
  }

  setProductStatus("Ищу состав по названию...");
  const controller = new AbortController();
  activeProductSearchController?.abort();
  activeProductSearchController = controller;

  try {
    const data = await searchProductByName(query, { signal: controller.signal });
    if (data.aborted || revision !== productSearchRevision || query !== productName?.value.trim()) return;
    const wasApplied = renderSuggestions(data.products || []);
    if (wasApplied) return;

    setProductStatus(
      data.products?.length
        ? "Выберите средство из списка, чтобы подставить INCI."
        : "Не нашла состав по названию. Уточните бренд или вставьте INCI вручную.",
      data.products?.length ? "ok" : "warn"
    );
  } catch {
    if (revision !== productSearchRevision || query !== productName?.value.trim()) return;
    hideSuggestions();
    setProductStatus("Поиск временно недоступен. Состав можно вставить вручную.", "warn");
  } finally {
    if (activeProductSearchController === controller) activeProductSearchController = null;
  }
});

function handleProductNameInput() {
  const query = productName?.value.trim() || "";
  const valueChanged = query !== lastProductSearchText;
  const selectedName = productDisplayName(selectedProductCard);

  if (valueChanged) {
    productSelectionRevision += 1;
    if (selectedProductCard && query !== selectedName) {
      invalidateSelectedProduct({ preserveIndependentComposition: true });
    } else {
      clearAnalysisResult();
    }
    lastProductSearchText = query;
  }

  productSearchRevision += 1;
  activeProductSearchController?.abort();
  activeProductSearchController = null;
  clearFormulaVariantChoices();
  hideSuggestions();
  syncSearchClear();

  if (!query) {
    setProductStatus("");
    return;
  }

  searchProducts(productSearchRevision, query);
}

productName?.addEventListener("input", handleProductNameInput);

productClear?.addEventListener("click", () => {
  cancelPendingProductWork();
  productName.value = "";
  lastProductSearchText = "";
  invalidateSelectedProduct({ preserveIndependentComposition: true });
  clearFormulaVariantChoices();
  hideSuggestions();
  setProductStatus("");
  syncSearchClear();
  productName.focus();
});

productSearchAction?.addEventListener("click", () => {
  if (!productName?.value.trim()) {
    setProductStatus("Введите название или бренд средства.", "warn");
    productName?.focus();
    return;
  }

  productName.dispatchEvent(new Event("input", { bubbles: true }));
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

composition?.addEventListener("input", () => {
  setCompositionValue(composition.value, {
    mode: composition.value.trim() ? "manual" : "empty",
    source: composition.value.trim() ? "manual" : ""
  });
  clearAnalysisResult();
  if (composition.value.trim()) {
    setProductStatus("Используется состав, введённый вручную. Он не будет заменён карточкой без подтверждения.", "ok");
  }
});

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

async function resolvePhotoText(text, signal) {
    const response = await fetch("/api/photo/resolve", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error("Обработка фото недоступна. Повторите загрузку позже.");
    return await response.json();
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

async function analyzeCurrentComposition(sourceLabel = "", isCurrent = () => true) {
  const text = composition.value.trim();
  if (!text) {
    result.innerHTML = `<div class="error">Сначала нужен состав: выберите средство, распознайте фото или вставьте список ингредиентов.</div>`;
    scrollToResult();
    return;
  }

  const payload = {
    text,
    productName: productName?.value.trim() || sourceLabel,
    evidence: buildAnalysisEvidence(),
    profile: readAnalysisProfile()
  };

  return runServerAnalysis(payload, sourceLabel, isCurrent);
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

let photoJob = null;
let photoRevision = 0;

function cancelPhotoJob() {
  photoRevision += 1;
  photoJob?.controller.abort();
  photoJob?.worker?.terminate().catch(() => {});
  photoJob = null;
  if (photoUseComposition) photoUseComposition.disabled = true;
  if (photoAnalyze) photoAnalyze.disabled = true;
}

function currentPhoto(job) {
  return job === photoJob && !job.controller.signal.aborted;
}

function photoStage(job, state, message) {
  if (!currentPhoto(job)) return;
  job.state = state;
  photoStatus.dataset.state = state;
  photoStatus.hidden = false;
  photoStatus.textContent = message;
  const ready = state === "confirmation" && !!job.resolution;
  photoUseComposition.disabled = !ready;
  photoAnalyze.disabled = !ready;
}

async function recognizePhotoText(file, job) {
  if (!window.Tesseract?.recognize) {
    throw new Error("OCR-модуль не загрузился. Проверьте интернет-соединение и попробуйте еще раз.");
  }

  const options = {
    logger: (event) => {
      if (!currentPhoto(job) || event.status !== "recognizing text") return;
      const progress = Math.round((event.progress || 0) * 100);
      photoStage(job, "reading", `Распознаю текст с фото: ${progress}%`);
    }
  };
  let result;
  if (window.Tesseract.createWorker) {
    const worker = await window.Tesseract.createWorker("eng+rus", 1, options);
    if (!currentPhoto(job)) { await worker.terminate(); return ""; }
    job.worker = worker;
    try { result = await worker.recognize(file); }
    finally { await worker.terminate(); job.worker = null; }
  } else {
    result = await window.Tesseract.recognize(file, "eng+rus", options);
  }
  if (!currentPhoto(job)) return "";
  job.ocr = {
    confidence: Number.isFinite(result?.data?.confidence) ? result.data.confidence : null,
    words: (result?.data?.words || []).map(({ text, confidence, bbox }) => ({ text, confidence, bbox })),
    lines: (result?.data?.lines || []).map(({ text, confidence, bbox }) => ({ text, confidence, bbox }))
  };
  return cleanOcrText(result?.data?.text || "");
}

async function applyPhotoText({ analyze = false } = {}) {
  const job = photoJob;
  if (!job || job.state !== "confirmation" || !job.resolution) return false;
  const rawText = photoText?.value.trim() || "";
  if (!rawText) {
    if (photoStatus) {
      photoStatus.hidden = false;
      photoStatus.textContent = "Сначала нужен распознанный текст. Если OCR ошибся, вставьте текст с упаковки вручную.";
    }
    return false;
  }

  try {
    // Edited text must pass the same server cleaner again, not bypass it.
    if (rawText !== job.previewText) {
      photoStage(job, "label_type", "Проверяю исправленный состав...");
      const resolution = await resolvePhotoText(rawText, job.controller.signal);
      if (currentPhoto(job)) stagePhotoResolution(job, resolution);
      return false;
    }
    photoStage(job, "analysis", analyze ? "Разбираю подтверждённый состав..." : "Состав подтверждён.");
    const applied = await applyPhotoResolution(job.resolution, { analyze, fallbackText: rawText, job });
    if (currentPhoto(job)) photoStage(job, applied ? "confirmed" : "error", applied ? "Состав подтверждён и передан для разбора." : "Разбор не завершён. Сообщение об ошибке показано ниже.");
    return applied;
  } catch (error) {
    photoStage(job, "error", error.message);
    return false;
  }
}

async function applyPhotoResolution(resolution, { analyze = false, fallbackText = "", job = photoJob } = {}) {
  const ingredients = resolution.ingredients || [];
  const product = resolution.product || null;
  const nextComposition = resolution.composition || resolution.cleanedText || "";

  if (!currentPhoto(job) || !["composition", "product"].includes(resolution.mode) || !nextComposition || (resolution.mode !== "product" && ingredients.length < 3)) {
    if (photoText) photoText.value = resolution.cleanedText || fallbackText;
    if (photoStatus) {
      photoStatus.hidden = false;
      photoStatus.textContent = resolution.message || "Не удалось уверенно выделить состав или определить средство. Попробуйте фото ближе, ровнее и при хорошем свете.";
    }
    return false;
  }

  cancelPendingProductWork();
  hideSuggestions();
  clearAnalysisResult();
  setCompositionValue(nextComposition, {
    mode: "photo",
    product,
    source: resolution.mode === "product" ? (product?.source || "photo") : "photo_ocr",
    sourceType: resolution.mode === "product" ? (product?.sourceType || "product_source") : "photo_ocr",
    sourceUrl: resolution.mode === "product" ? (product?.sourceUrl || "") : "",
    sourceDate: resolution.mode === "product" ? (product?.importedAt || product?.verifiedAt || null) : null,
    formulaScope: resolution.mode === "product"
      ? (product?.compositionScope || "unknown")
      : (resolution.compositionScope || "unknown"),
    formulaVersion: resolution.mode === "product" ? (product?.formulaVersion || null) : null,
    market: resolution.mode === "product" ? (product?.market || null) : null
  });
  if (photoText) photoText.value = nextComposition;

  if (product) {
    const displayName = productDisplayName(product);
    productName.value = displayName;
    lastProductSearchText = displayName;
    setSelectedProduct(product);
    setProductStatus(`По фото найдено: ${product.brand} ${product.name}. Источник состава: ${product.source || "база сервиса"}.`, product.composition ? "ok" : "warn");
  } else {
    setSelectedProduct(null);
    productName.value = "";
    const guessedName = guessProductNameFromPhotoText(fallbackText);
    if (guessedName) productName.value = guessedName;
    lastProductSearchText = productName.value.trim();
    setProductStatus("Средство по фото не найдено в базе, но состав очищен и готов к разбору.", "warn");
  }
  syncSearchClear();

  const purposeText = resolution.purpose?.label
    ? ` Назначение: ${resolution.purpose.label}.`
    : "";
  if (photoStatus) {
    photoStatus.hidden = false;
    photoStatus.textContent = `${resolution.message || "Фото обработано."}${purposeText} ${ingredients.length ? `Выделено ингредиентов: ${ingredients.length}.` : "Состав подтянут из карточки средства."}`;
  }

  if (analyze) return !!(await analyzeCurrentComposition(product ? "Фото лицевой этикетки" : "Фото состава", () => currentPhoto(job)));
  return true;
}

function stagePhotoResolution(job, resolution) {
  if (!currentPhoto(job)) return;
  job.resolution = null;
  const entries = resolution.entries || [];
  const confirmed = entries.filter((entry) => entry.status === "confirmed");
  const uncertain = entries.length - confirmed.length;
  const poor = job.ocr?.confidence !== null && job.ocr?.confidence < 60;
  if (!["composition", "product"].includes(resolution.mode) || poor || resolution.mode === "mixed") {
    photoText.value = resolution.cleanedText || "";
    photoStage(job, "clarification", `${resolution.message || "Тип этикетки не определён."} Снимите отдельно название или состав, ближе и без бликов.`);
    return;
  }
  if (resolution.mode === "composition") {
    if (confirmed.length < 3) {
      photoText.value = resolution.cleanedText || "";
      photoStage(job, "clarification", "Недостаточно подтверждённых ингредиентов. Снимите состав крупнее или введите его вручную.");
      return;
    }
    const uncertainRatio = entries.length ? uncertain / entries.length : 1;
    if (uncertainRatio > 0.25) {
      photoText.value = resolution.cleanedText || "";
      photoStage(job, "clarification", "В распознанном составе слишком много сомнительных позиций. Исправьте текст вручную или переснимите этикетку ближе, ровнее и без бликов.");
      return;
    }
    const reviewIngredients = entries.map((entry) => entry.canonicalName || entry.ingredient || entry.raw).filter(Boolean);
    resolution = {
      ...resolution,
      product: null,
      ingredients: reviewIngredients,
      compositionScope: uncertain ? "partial" : "unknown"
    };
    resolution.composition = resolution.cleanedText || [...new Set(reviewIngredients)].join(", ");
  } else if (!resolution.product?.composition) {
    photoStage(job, "clarification", "У найденного кандидата нет состава. Сфотографируйте оборотную этикетку.");
    return;
  }
  job.resolution = resolution;
  job.previewText = resolution.composition;
  photoText.value = job.previewText;
  const source = resolution.mode === "product"
    ? `Кандидат: ${productDisplayName(resolution.product)}. Источник состава: ${resolution.product.source || resolution.product.sourceType || "не указан"}. Сверьте название и версию с упаковкой.`
    : `Этикетка с составом. Подтверждено позиций: ${confirmed.length}. ${uncertain ? `Нужно проверить сомнительные позиции (${uncertain}): ${entries.filter((entry) => entry.status !== "confirmed").map((entry) => entry.raw || entry.ingredient).join(", ")}. Они сохранены в тексте, а состав помечен неполным.` : "Сверьте состав с фотографией."}`;
  photoStage(job, "confirmation", `${source} Подтвердите состав перед разбором.`);
}

async function handlePhotoFile(file) {
  if (!file || !photoStatus) return;
  clearPhotoState();
  cancelPendingProductWork();
  hideSuggestions();
  setCompositionValue("");
  setSelectedProduct(null);
  productName.value = "";
  lastProductSearchText = "";
  syncSearchClear();
  clearAnalysisResult();
  const job = { id: photoRevision, controller: new AbortController(), worker: null, ocr: null, resolution: null };
  photoJob = job;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 15 * 1024 * 1024) {
    photoStage(job, "error", "Загрузите JPEG, PNG или WebP размером до 15 МБ.");
    return;
  }
  photoStage(job, "accepted", "Фото принято. Подготавливаю распознавание...");

  if (photoReview) photoReview.hidden = false;
  if (photoPreview) {
    if (photoPreview.src?.startsWith("blob:")) URL.revokeObjectURL(photoPreview.src);
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
  }

  try {
    const decoded = await createImageBitmap(file);
    const pixels = decoded.width * decoded.height;
    decoded.close();
    if (!currentPhoto(job)) return;
    if (pixels > 40000000) throw new Error("Фото слишком большое: уменьшите его до 40 мегапикселей.");
    photoStage(job, "reading", "Читаю текст с фото...");
    const text = await recognizePhotoText(file, job);
    if (!currentPhoto(job)) return;
    if (photoText) photoText.value = "Очищаю распознанный текст...";

    if (!text || text.length < 12) {
      photoStage(job, "clarification", "Текст почти не распознан. Попробуйте фото ближе, ровнее, при хорошем свете.");
      return;
    }

    job.rawText = text;
    photoStage(job, "label_type", "Определяю тип этикетки и очищаю состав...");
    const resolution = await resolvePhotoText(text, job.controller.signal);
    stagePhotoResolution(job, resolution);
  } catch (error) {
    photoStage(job, "error", error.message || "Не удалось распознать фото. Попробуйте другое фото или вставьте состав вручную.");
  }
}

let cameraStream = null;
let cameraRevision = 0;
let barcodeStream = null;
let barcodeFrameRequest = null;
let barcodeScannerControls = null;
let barcodeScanRevision = 0;
let barcodeLookupRevision = 0;
let barcodeLookupController = null;
let lastAcceptedBarcode = { code: "", at: 0 };

const NATIVE_BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];

function stopCameraStream() {
  cameraRevision += 1;
  cameraStream?.getTracks?.().forEach((track) => track.stop());
  cameraStream = null;
  if (cameraVideo) cameraVideo.srcObject = null;
}

function stopBarcodeScanner() {
  barcodeScanRevision += 1;
  if (barcodeFrameRequest) cancelAnimationFrame(barcodeFrameRequest);
  barcodeFrameRequest = null;
  barcodeScannerControls?.stop?.();
  barcodeScannerControls = null;
  barcodeStream?.getTracks?.().forEach((track) => track.stop());
  barcodeStream = null;
  if (barcodeVideo) barcodeVideo.srcObject = null;
  if (barcodeCapture) barcodeCapture.hidden = true;
}

async function createNativeBarcodeDetector() {
  if (typeof window.BarcodeDetector !== "function" || typeof window.BarcodeDetector.getSupportedFormats !== "function") return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    if (!NATIVE_BARCODE_FORMATS.every((format) => supported.includes(format))) return null;
    return new window.BarcodeDetector({ formats: NATIVE_BARCODE_FORMATS });
  } catch {
    return null;
  }
}

function createZxingBarcodeReader() {
  const zxing = window.ZXingBrowser;
  if (!zxing?.BrowserMultiFormatReader || !zxing?.BarcodeFormat) return null;
  const reader = new zxing.BrowserMultiFormatReader();
  reader.possibleFormats = [
    zxing.BarcodeFormat.EAN_13,
    zxing.BarcodeFormat.EAN_8,
    zxing.BarcodeFormat.UPC_A,
    zxing.BarcodeFormat.UPC_E,
    zxing.BarcodeFormat.QR_CODE
  ];
  return reader;
}

function zxingFormat(result) {
  const value = result?.getBarcodeFormat?.();
  return String(window.ZXingBrowser?.BarcodeFormat?.[value] || "").toLowerCase();
}

async function lookupBarcode(normalized) {
  const revision = ++barcodeLookupRevision;
  barcodeLookupController?.abort();
  const controller = new AbortController();
  barcodeLookupController = controller;
  cancelPendingProductWork();
  setSelectedProduct(null);
  setCompositionValue("");
  clearAnalysisResult();
  hideSuggestions();

  barcodeInput.value = normalized.lookupCode;
  productName.value = normalized.lookupCode;
  lastProductSearchText = normalized.lookupCode;
  syncSearchClear();
  const equivalentNote = normalized.raw !== normalized.lookupCode
    ? ` ${normalized.type} ${normalized.raw} эквивалентен коду ${normalized.lookupCode}.`
    : "";
  setProductStatus(`Код подтверждён.${equivalentNote} Ищу карточку товара...`, "ok");

  const data = await searchProductByName(normalized.lookupCode, { signal: controller.signal });
  if (data.aborted || revision !== barcodeLookupRevision) return false;
  barcodeLookupController = null;
  const products = data.products || [];
  if (products.length) {
    renderSuggestions(products);
    setProductStatus(`Код ${normalized.lookupCode} найден.${equivalentNote} Выберите карточку товара для загрузки состава.`, "ok");
  } else {
    hideSuggestions();
    setProductStatus(`Код ${normalized.lookupCode} корректен.${equivalentNote} Карточка товара в подключённых источниках не найдена.`, "warn");
  }
  return true;
}

function applyScannedCode(rawValue = "", format = "", source = "camera") {
  const normalized = normalizeProductIdentifier(rawValue, format);
  if (!normalized.valid) {
    const label = format === "qr_code" ? "QR не принят" : "Код не принят";
    setProductStatus(`${label}: ${normalized.reason}`, "warn");
    if (barcodeScanStatus && source === "camera") barcodeScanStatus.textContent = `${normalized.reason} Наведите камеру на другой код.`;
    return false;
  }

  const now = Date.now();
  if (lastAcceptedBarcode.code === normalized.lookupCode && now - lastAcceptedBarcode.at < 2500) return false;
  lastAcceptedBarcode = { code: normalized.lookupCode, at: now };
  stopBarcodeScanner();
  void lookupBarcode(normalized);
  return true;
}

async function openBarcodeScanner() {
  if (!navigator.mediaDevices?.getUserMedia || !barcodeCapture || !barcodeVideo) {
    setProductStatus("Камера недоступна. Загрузите фото кода или введите EAN/UPC вручную.", "warn");
    barcodeInput?.focus();
    return;
  }

  stopBarcodeScanner();
  const revision = barcodeScanRevision;
  try {
    barcodeCapture.hidden = false;
    barcodeScanStatus.textContent = "Разрешите доступ к камере и наведите ее на код.";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    if (revision !== barcodeScanRevision) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    barcodeStream = stream;
    barcodeVideo.srcObject = barcodeStream;
    await barcodeVideo.play();
    if (revision !== barcodeScanRevision) return;
    barcodeScanStatus.textContent = "Ищу штрихкод или QR в кадре...";

    const detector = await createNativeBarcodeDetector();
    if (revision !== barcodeScanRevision) return;
    if (detector) {
      const scanFrame = async () => {
        if (revision !== barcodeScanRevision || !barcodeStream || barcodeCapture.hidden) return;
        try {
          const codes = await detector.detect(barcodeVideo);
          for (const code of codes || []) {
            if (applyScannedCode(code.rawValue || "", code.format || "", "camera")) return;
          }
        } catch {
          barcodeScanStatus.textContent = "Не удалось прочитать код. Держите упаковку ровнее и ближе к камере.";
        }
        barcodeFrameRequest = requestAnimationFrame(scanFrame);
      };
      barcodeFrameRequest = requestAnimationFrame(scanFrame);
      return;
    }

    const reader = createZxingBarcodeReader();
    if (!reader) throw new Error("fallback-unavailable");
    barcodeScannerControls = await reader.decodeFromVideoElement(barcodeVideo, (result, error, controls) => {
      if (revision !== barcodeScanRevision) {
        controls?.stop?.();
        return;
      }
      if (result) applyScannedCode(result.getText(), zxingFormat(result), "camera");
      else if (error && !/NotFound/i.test(error.name || error.constructor?.name || "")) {
        barcodeScanStatus.textContent = "Код пока не читается. Приблизьте упаковку и уберите блики.";
      }
    });
  } catch {
    if (revision !== barcodeScanRevision) return;
    stopBarcodeScanner();
    setProductStatus("Не удалось открыть камеру. Загрузите фото кода или введите EAN/UPC вручную.", "warn");
    barcodeInput?.focus();
  }
}

function loadBarcodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось открыть изображение.")); };
    image.src = url;
  });
}

async function decodeBarcodeImage(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 15 * 1024 * 1024) {
    setProductStatus("Загрузите JPEG, PNG или WebP размером до 15 МБ.", "warn");
    return;
  }
  setProductStatus("Читаю штрихкод с изображения...");
  let loaded;
  try {
    loaded = await loadBarcodeImage(file);
    const detector = await createNativeBarcodeDetector();
    if (detector) {
      const results = await detector.detect(loaded.image);
      for (const result of results || []) {
        if (applyScannedCode(result.rawValue || "", result.format || "", "image")) return;
      }
    }

    const reader = createZxingBarcodeReader();
    if (!reader) throw new Error("Декодер штрихкодов не загрузился.");
    const result = await reader.decodeFromImageElement(loaded.image);
    if (!applyScannedCode(result.getText(), zxingFormat(result), "image")) {
      throw new Error("На изображении нет допустимого товарного EAN/UPC или GS1 QR.");
    }
  } catch (error) {
    setProductStatus(error.message || "Не удалось распознать код. Снимите его крупнее, ровно и без бликов.", "warn");
  } finally {
    if (loaded?.url) URL.revokeObjectURL(loaded.url);
  }
}

async function openCameraCapture() {
  if (!navigator.mediaDevices?.getUserMedia || !cameraCapture || !cameraVideo) {
    photoCameraInput?.click();
    return;
  }

  stopCameraStream();
  const revision = cameraRevision;
  try {
    cameraCapture.hidden = false;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    if (revision !== cameraRevision) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
  } catch {
    if (revision !== cameraRevision) return;
    stopCameraStream();
    cameraCapture.hidden = true;
    photoStatus.hidden = false;
    photoStatus.textContent = "Камера недоступна или доступ запрещён. Выберите «Загрузить фото».";
  }
}

async function captureCameraFrame() {
  if (!cameraVideo || !cameraCanvas || !cameraStream || !cameraVideo.videoWidth) return;
  const revision = cameraRevision;
  const width = cameraVideo.videoWidth || 1280;
  const height = cameraVideo.videoHeight || 720;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const context = cameraCanvas.getContext("2d");
  context.drawImage(cameraVideo, 0, 0, width, height);

  cameraCanvas.toBlob(async (blob) => {
    if (!blob || revision !== cameraRevision) return;
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
  document.querySelector("#photoInput")?.click();
});
cameraShot?.addEventListener("click", captureCameraFrame);
window.addEventListener("pagehide", () => {
  clearPhotoState();
  stopBarcodeScanner();
  barcodeLookupRevision += 1;
  barcodeLookupController?.abort();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopCameraStream();
    if (cameraCapture) cameraCapture.hidden = true;
    stopBarcodeScanner();
  }
});

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
  applyScannedCode(barcodeInput?.value || "", "", "manual");
});

barcodeScan?.addEventListener("click", openBarcodeScanner);
barcodeScanClose?.addEventListener("click", stopBarcodeScanner);
barcodeImageUpload?.addEventListener("click", () => barcodeImageInput?.click());
barcodeImageInput?.addEventListener("change", async () => {
  await decodeBarcodeImage(barcodeImageInput.files?.[0]);
  barcodeImageInput.value = "";
});

barcodeInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  barcodeApply?.click();
});

if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  window.__barcodeTest = { apply: applyScannedCode };
}

mobileAnalyze?.addEventListener("click", submitAnalysisFromSticky);

// Keep the fixed mobile action above an on-screen keyboard without changing the form flow.
function syncMobileKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport || window.matchMedia("(min-width: 561px)").matches) {
    document.documentElement.style.removeProperty("--mobile-keyboard-inset");
    return;
  }

  const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  document.documentElement.style.setProperty("--mobile-keyboard-inset", `${Math.round(inset)}px`);
}

window.visualViewport?.addEventListener("resize", syncMobileKeyboardInset);
window.visualViewport?.addEventListener("scroll", syncMobileKeyboardInset);
window.addEventListener("resize", syncMobileKeyboardInset);
syncMobileKeyboardInset();

initCatalog();

const FUNCTION_LABELS = {
  ABSORBENT: "абсорбент",
  ANTISTATIC: "антистатическая функция",
  BINDING: "связующая функция",
  BUFFERING: "буферная функция",
  DENATURANT: "денатурант",
  EMULSIFYING: "эмульгирующая функция",
  FILM_FORMING: "плёнкообразующая функция",
  HUMECTANT: "увлажняющий компонент",
  MASKING: "маскирующая функция",
  ORAL_CARE: "функция для средств полости рта",
  PERFUMING: "парфюмирующая функция",
  PRESERVATIVE: "консервант",
  SKIN_CONDITIONING: "кондиционирование кожи",
  SKIN_PROTECTING: "защита кожи",
  SOLVENT: "растворитель",
  SURFACTANT: "поверхностно-активное вещество",
  VISCOSITY_CONTROLLING: "регулятор вязкости",
  HAIR_CONDITIONING: "кондиционирование волос"
};

const FORMULA_SCOPE_LABELS = {
  full: "Источник сообщил полный INCI.",
  active_only: "Источник указал только активные компоненты, а не полный INCI.",
  partial: "Доступен неполный фрагмент формулы.",
  unknown: "Полнота состава не подтверждена источником."
};

const MATCH_STATUS_LABELS = {
  confirmed: "подтверждённое совпадение",
  suggested: "возможное совпадение, требует проверки",
  unknown: "не найдено в текущем справочнике"
};

function reportFunctionLabel(value) {
  const raw = String(value || "").trim();
  const key = raw.replace(/\s*\(.*?\)\s*/g, "").replace(/[\s-]+/g, "_").toUpperCase();
  return FUNCTION_LABELS[key] || (/[A-Z]{3,}/.test(raw) ? `справочная функция: ${raw}` : raw || "функция не указана");
}

function uniqueText(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function reportSourceLink(source, fallback = "Источник не указан") {
  const name = String(source?.name || fallback);
  const url = safeExternalUrl(source?.url);
  return url
    ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
    : escapeHtml(name);
}

function reportIngredientSources(item) {
  const sources = [];
  (item.findings || []).forEach((finding) => {
    (finding.basis || []).forEach((basis) => {
      const url = safeExternalUrl(basis.url || basis.recordSourceUrl);
      if (url) sources.push({ name: basis.title || basis.record || basis.source || item.dataSource || "Источник", url });
    });
  });
  if (!sources.length && item.dataSource) sources.push({ name: item.dataSource, url: null });
  return uniqueText(sources.map((source) => `${source.name}|${source.url || ""}`)).map((value) => {
    const [name, url] = value.split("|");
    return reportSourceLink({ name, url });
  });
}

function reportUncertainIngredients(data, contract) {
  const uncertain = [];
  const seen = new Set();
  const add = (item) => {
    const input = String(item?.input || item?.ingredient || "").trim();
    if (!input || seen.has(input.toLowerCase())) return;
    seen.add(input.toLowerCase());
    const status = item?.status === "suggested" || item?.suggested_match || item?.match?.suggestedName ? "suggested" : "unknown";
    uncertain.push({
      input,
      status,
      suggestedName: item?.suggested_match || item?.match?.suggestedName || null
    });
  };
  (contract?.ingredients || []).filter((item) => item?.status !== "confirmed").forEach(add);
  (data.unknown || []).forEach(add);
  return uncertain;
}

function reportIngredientCard(item) {
  const status = item.status === "suggested" ? "suggested" : item.status === "unknown" ? "unknown" : "confirmed";
  const rawName = item.input || item.provenance?.raw || item.name || "Неизвестный фрагмент";
  const canonicalName = status === "confirmed" ? item.name : item.suggested_match || item.name || null;
  const roles = uniqueText((item.roles || []).map(reportFunctionLabel));
  const references = uniqueText((item.findings || []).filter((finding) => finding.kind === "reference").map((finding) => finding.text));
  const expert = uniqueText((item.findings || []).filter((finding) => finding.kind === "expert").map((finding) => finding.text));
  const limits = uniqueText([
    ...(item.cautions || []),
    ...(item.findings || []).flatMap((finding) => finding.limitations || [])
  ]);
  const sources = reportIngredientSources(item);
  return `
    <details class="ingredient-report" data-ingredient-search="${escapeHtml(`${rawName} ${canonicalName || ""} ${roles.join(" ")}`.toLowerCase())}">
      <summary>
        <span class="ingredient-position">${escapeHtml(item.position || "-")}</span>
        <span><strong>${escapeHtml(rawName)}</strong>${canonicalName && canonicalName !== rawName ? `<small>Каноническое имя: ${escapeHtml(canonicalName)}</small>` : ""}</span>
        <span class="match-status match-status-${status}">${escapeHtml(MATCH_STATUS_LABELS[status])}</span>
      </summary>
      <div class="ingredient-report-body">
        <dl class="ingredient-data">
          <dt>Исходное имя</dt><dd>${escapeHtml(rawName)}</dd>
          <dt>Совпадение</dt><dd>${canonicalName ? escapeHtml(canonicalName) : "нет"}</dd>
          <dt>Роль в формуле</dt><dd>${roles.length ? escapeHtml(roles.join(", ")) : "не указана в ответе анализатора"}</dd>
          <dt>Позиция в INCI</dt><dd>${escapeHtml(item.position || "не указана")}</dd>
        </dl>
        ${references.length ? `<h4>Справочные сведения</h4>${list(references, "")}` : ""}
        ${expert.length ? `<h4>Сведения, требующие предметной проверки</h4>${list(expert, "")}` : ""}
        ${limits.length ? `<h4>Условия и ограничения</h4>${list(limits, "")}` : ""}
        <p class="ingredient-source"><strong>Источник:</strong> ${sources.length ? sources.join(", ") : "не указан в ответе анализатора"}</p>
      </div>
    </details>
  `;
}

function render(data) {
  const contract = data.analysisContract || {};
  const personal = data.personalization;
  const profileLabels = { skinType: "Тип кожи", context: "Контекст", concerns: "Состояние кожи", goals: "Цели", applicationArea: "Зона нанесения", allergyStatus: "Аллергии", allergens: "Аллергены", previousReaction: "Прошлая реакция", invalidFields: "Некорректные поля" };
  const valueLabels = { hydration: "увлажнение", barrier: "поддержка барьера", appearance: "внешний вид кожи", cleansing: "очищение", face: "лицо", body: "тело", hair_or_scalp: "волосы и кожа головы", eye_area: "область глаз", lips: "губы", none_reported: "не известны / не замечены", reported: "есть подтверждённые", this_product: "на этот продукт", other_product: "на другое средство" };
  const identity = contract.product?.identity || {};
  const productTitle = [identity.brand, identity.name].filter(Boolean).join(" ") || productName?.value.trim() || "Средство не идентифицировано";
  const productStatus = contract.product?.identificationStatus || "unknown";
  const formula = contract.formula || {};
  const formulaScope = formula.scope || "unknown";
  const purpose = data.productSafety || data.productClassification || {};
  const purposeSource = purpose.purposeEvidence?.source || null;
  const purposeBasis = purpose.purposeStatus === "confirmed_manufacturer"
    ? `Карточка производителя: ${reportSourceLink(purposeSource)}`
    : purpose.purposeStatus === "source_backed"
      ? `Карточка источника: ${reportSourceLink(purposeSource)}`
      : purpose.purposeStatus === "hypothesis"
        ? "Гипотеза по названию и функциональным признакам состава"
        : purpose.purposeStatus === "safety_flag"
          ? "Защитное правило по сигнальным ингредиентам"
          : "Недостаточно данных или есть противоречие";
  const assessment = data.assessment || { status: "not_assessed", reason: "insufficient_data" };
  const uncertain = reportUncertainIngredients(data, contract);
  const groups = (data.groups || []).map((group) => `
    <article class="tile">
      <h3>${escapeHtml(reportFunctionLabel(group.role))}</h3>
      <p>${escapeHtml((group.items || []).join(", "))}</p>
    </article>
  `).join("");
  const ingredientCards = (data.found || []).map(reportIngredientCard).join("");
  const expertSummary = cards(data.expertSummary, "Проверяемых экспертных утверждений для этой формулы нет.");
  const availableVariants = productFormulaVariants(selectedProductCard);
  const formulaVersions = availableVariants.length > 1 ? `
    <section class="section formula-versions" aria-labelledby="reportFormulaVersionsTitle">
      <h2 id="reportFormulaVersionsTitle">Версии формулы из источников</h2>
      <p>Источники сообщают разные составы. Текущий отчёт относится только к выбранной версии; формулы не объединяются.</p>
      <div class="formula-variant-list">
        ${availableVariants.map((variant, index) => `
          <button class="formula-variant-option" type="button" data-report-formula-index="${index}">
            <strong>${escapeHtml(`Версия ${index + 1}`)}</strong>
            <span>${escapeHtml(formulaVariantLabel(variant, index))}</span>
          </button>
        `).join("")}
      </div>
    </section>
  ` : "";
  const personalSection = personal ? `
    <section class="section" id="personalAssessment">
      <h2>${personal.profileProvided ? "Персональный итог" : "Персональная оценка"}</h2>
      <p>${escapeHtml(personal.summary || "Профиль не указан.")}</p>
      ${personal.restrictions?.length ? `<h3>Ограничения</h3>${list(personal.restrictions.map((item) => item.text), "")}` : ""}
      ${personal.precautions?.length ? `<h3>Что требует уточнения</h3>${list(personal.precautions.map((item) => item.text), "")}` : ""}
      ${personal.potentialBenefits?.length ? `<h3>Потенциальная польза с ограничениями</h3>${list(personal.potentialBenefits.map((item) => item.text), "")}` : ""}
      ${list(personal.limitations || [], "Персональная применимость не установлена.")}
      <details><summary>Что учтено в разборе</summary>
        ${list((personal.usedInputs || []).map((item) => `${profileLabels[item.field] || item.field}: ${(Array.isArray(item.value) ? item.value : [item.value]).map((value) => valueLabels[value] || value).join(", ")}. ${item.reason}`), "Профиль не указан.")}
        ${personal.missingFields?.length ? `<p>Не указано: ${escapeHtml(personal.missingFields.map((item) => profileLabels[item] || item).join(", "))}.</p>` : ""}
      </details>
      ${data.historyPolicy?.mode === "session_only" ? '<p class="field-note">Персональный результат не сохранён в историю. Данные профиля действуют только в текущем разборе.</p>' : ""}
    </section>` : "";
  const safetyNotice = data.productSafety?.shouldScoreAsCosmetic === false ? `
    <section class="section safety-notice">
      <h2>Это не обычное уходовое средство</h2>
      <p>${escapeHtml(data.productSafety.message || "Косметическая оценка отключена.")}</p>
      ${data.productSafety.intendedUse ? `<p><strong>Назначение:</strong> ${escapeHtml(data.productSafety.intendedUse)}</p>` : ""}
      ${data.productSafety.application ? `<p><strong>Применение:</strong> ${escapeHtml(data.productSafety.application)}</p>` : ""}
    </section>` : "";
  const proprietaryComplexes = data.proprietaryComplexes?.length ? `
    <section class="section">
      <h2>Комплексы производителя</h2>
      <p class="muted">Состав комплекса не раскрыт в INCI: его активы, концентрации и вклад нельзя подтвердить.</p>
      ${list(data.proprietaryComplexes.map((item) => `${item.name}: ${item.note}`), "")}
    </section>` : "";
  const additionalGuidance = data.routineAdvice?.length || data.questions?.length ? `
    <details class="section report-additional">
      <summary>Дополнительные вопросы и рекомендации</summary>
      ${data.routineAdvice?.length ? `<h3>Как вводить в уход</h3>${list(data.routineAdvice, "")}` : ""}
      ${data.questions?.length ? `<h3>Что уточнить у специалиста</h3>${list(data.questions, "")}` : ""}
    </details>` : "";
  const alternativesSection = data.alternativeSearch || data.alternatives?.length ? `
    <section class="section" id="formulaAlternatives">
      <h2>Возможные аналоги</h2>
      <p>${escapeHtml(data.alternativeSearch?.message || "Найдены кандидаты для сравнения состава.")}</p>
      ${data.alternatives?.length ? `<div class="tiles">${data.alternatives.map((item) => `
        <article class="tile alternative-card">
          <h3>${escapeHtml([item.brand, item.name].filter(Boolean).join(" "))}</h3>
          <p><strong>${escapeHtml(item.similarityLabel || "Сходство состава")}:</strong> ${escapeHtml(item.similarity)}%</p>
          ${list(item.why || [], "")}
          <p><strong>Цена:</strong> ${escapeHtml(item.priceComparison?.label || item.price || "неизвестна")}</p>
          <p><strong>Наличие:</strong> ${escapeHtml(item.availabilityEvidence?.label || item.ruAvailability || "неизвестно")}</p>
          <p class="muted">${escapeHtml(item.note || "Это кандидат для сравнения, а не подтверждённо идентичная замена.")}</p>
          ${safeExternalUrl(item.sourceUrl) ? `<a class="source-link" href="${escapeHtml(safeExternalUrl(item.sourceUrl))}" target="_blank" rel="noreferrer">Источник карточки</a>` : ""}
        </article>`).join("")}</div>` : ""}
    </section>` : "";

  result.innerHTML = `
    <section class="section report-product">
      <p class="eyebrow">Товар и назначение</p>
      <h2>${escapeHtml(productTitle)}</h2>
      <p class="report-status">Идентификация товара: ${escapeHtml(MATCH_STATUS_LABELS[productStatus] || "не подтверждена")}</p>
      <h3>${escapeHtml(purpose.label || data.formulaType || "Тип средства требует уточнения")}</h3>
      <p>${escapeHtml(purpose.intendedUse || "Назначение нельзя надёжно определить только по составу.")}</p>
      <p><strong>Основание:</strong> ${purposeBasis}</p>
      ${purpose.application ? `<p><strong>Способ применения:</strong> ${escapeHtml(purpose.application)}</p>` : ""}
    </section>

    <section class="section report-formula">
      <p class="eyebrow">Состав и происхождение</p>
      <h2>Что именно разобрано</h2>
      <dl class="report-meta">
        <dt>Полнота</dt><dd>${escapeHtml(FORMULA_SCOPE_LABELS[formulaScope] || FORMULA_SCOPE_LABELS.unknown)}</dd>
        <dt>Источник</dt><dd>${reportSourceLink(formula.source)}</dd>
        <dt>Версия</dt><dd>${escapeHtml(formula.version || "не указана")}</dd>
        <dt>Рынок</dt><dd>${escapeHtml(formula.market || "не указан")}</dd>
        <dt>Распознано</dt><dd>${escapeHtml(contract.metrics?.knowledgeCoverage?.confirmed ?? data.found?.length ?? 0)} из ${escapeHtml(contract.metrics?.knowledgeCoverage?.total ?? data.totalIngredients ?? 0)} ингредиентов с подтверждённым совпадением</dd>
      </dl>
      ${assessment.status === "not_assessed" ? `<p class="report-caution">Итоговая оценка не выполнена: ${escapeHtml(data.qualitySummary?.methodology || "недостаточно подтверждённых данных о готовом продукте")}</p>` : ""}
    </section>

    ${formulaVersions}

    ${uncertain.length ? `
      <section class="section report-uncertain">
        <h2>Позиции, которые нужно проверить до выводов</h2>
        <p>Они не считаются подтверждёнными ингредиентами и не используются как установленный факт в разборе.</p>
        <ul>${uncertain.map((item) => `<li><strong>${escapeHtml(item.input)}</strong>: ${escapeHtml(item.status === "suggested" ? `возможное совпадение${item.suggestedName ? ` с ${item.suggestedName}` : ""}; проверьте этикетку.` : "не найдено в текущем справочнике.")}</li>`).join("")}</ul>
      </section>` : ""}

    ${personalSection}
    ${safetyNotice}

    <section class="section">
      <h2>Главное по имеющимся данным</h2>
      <p class="report-summary">${escapeHtml(data.summary || "Сводка пока недоступна.")}</p>
      ${expertSummary}
    </section>

    <section class="section">
      <h2>Функциональные блоки формулы</h2>
      <p class="muted">Это справочные функции компонентов, а не доказательство эффекта или назначения готового продукта.</p>
      <div class="tiles">${groups || '<p class="muted">Функциональные блоки пока не выделены.</p>'}</div>
    </section>

    <section class="section ingredient-section">
      <div class="ingredient-section-head">
        <div><h2>Ингредиенты</h2><p class="muted">Откройте компонент, чтобы увидеть исходное имя, совпадение, роль, ограничения и источник.</p></div>
        <label class="ingredient-filter-label">Поиск по составу<input id="ingredientFilter" type="search" autocomplete="off" placeholder="Название ингредиента" /></label>
      </div>
      <p id="ingredientFilterStatus" class="field-note" aria-live="polite"></p>
      <div class="ingredient-reports">${ingredientCards || '<p class="muted">Нет подтверждённых совпадений в текущем справочнике.</p>'}</div>
    </section>

    ${proprietaryComplexes}
    ${alternativesSection}
    ${additionalGuidance}
    <section class="section report-limitations"><h2>Ограничения анализа</h2><p class="disclaimer">${escapeHtml(data.disclaimer || "Данные о готовом продукте ограничены.")}</p></section>
  `;

  result.querySelector("#ingredientFilter")?.addEventListener("input", (event) => {
    const query = String(event.target.value || "").trim().toLocaleLowerCase();
    const cards = Array.from(result.querySelectorAll(".ingredient-report"));
    let visible = 0;
    cards.forEach((card) => {
      const matches = !query || card.dataset.ingredientSearch.includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    const status = result.querySelector("#ingredientFilterStatus");
    if (status) status.textContent = query ? `Показано компонентов: ${visible}.` : "";
  });

  result.querySelectorAll("[data-report-formula-index]").forEach((button) => {
    button.addEventListener("click", async () => {
      const variant = availableVariants[Number(button.dataset.reportFormulaIndex)];
      applyFormulaVariant(selectedProductCard, variant);
      if (compositionOrigin.mode === "product") await analyzeCurrentComposition(variant.source || "");
    });
  });
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
    evidence: buildAnalysisEvidence(),
    profile: readAnalysisProfile()
  };

  await runServerAnalysis(payload, compositionOrigin.source);
});

showAuthReturnStatus();
