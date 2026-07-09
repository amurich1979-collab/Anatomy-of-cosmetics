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
const photoStatus = document.querySelector("#photoStatus");
const tg = window.Telegram?.WebApp;

const STATIC_PRODUCTS = [
  {
    id: "demo-aha-post-peel",
    name: "AHA Post-Peel Recovery Serum",
    brand: "Demo Professional",
    category: "РџРѕСЃС‚РїРёР»РёРЅРіРѕРІР°СЏ СЃС‹РІРѕСЂРѕС‚РєР°",
    composition: "Aqua, Glycerin, Panthenol, Niacinamide, Sodium Hyaluronate, Allantoin, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "РџСЂРѕРІРµСЂРµРЅРѕ",
    source: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ Р±Р°Р·Р° MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-glycolic-peel",
    name: "Glycolic Renewal Peel 20",
    brand: "Demo Clinic Lab",
    category: "РљРёСЃР»РѕС‚РЅРѕРµ СЃСЂРµРґСЃС‚РІРѕ",
    composition: "Aqua, Glycolic Acid, Lactic Acid, Glycerin, Panthenol, Phenoxyethanol, Sodium Hydroxide",
    trustLabel: "РџСЂРѕРІРµСЂРµРЅРѕ",
    source: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ Р±Р°Р·Р° MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-retinol-night",
    name: "Retinol Barrier Night Concentrate",
    brand: "Demo Cosmeceuticals",
    category: "Р РµС‚РёРЅРѕРёРґРЅРѕРµ СЃСЂРµРґСЃС‚РІРѕ",
    composition: "Aqua, Glycerin, Caprylic/Capric Triglyceride, Dimethicone, Niacinamide, Retinol, Panthenol, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "РџСЂРѕРІРµСЂРµРЅРѕ",
    source: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ Р±Р°Р·Р° MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-mineral-spf",
    name: "Mineral Recovery SPF 50",
    brand: "Demo Dermatology",
    category: "SPF РїРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ",
    composition: "Aqua, Zinc Oxide, Titanium Dioxide, Caprylic/Capric Triglyceride, Dimethicone, Glycerin, Panthenol, Phenoxyethanol",
    trustLabel: "РџСЂРѕРІРµСЂРµРЅРѕ",
    source: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ Р±Р°Р·Р° MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  },
  {
    id: "demo-salicylic-gel",
    name: "BHA Clarifying Gel",
    brand: "Demo Acne Care",
    category: "РЎСЂРµРґСЃС‚РІРѕ РґР»СЏ РєРѕР¶Рё СЃ РєРѕРјРµРґРѕРЅР°РјРё",
    composition: "Aqua, Glycerin, Salicylic Acid, Niacinamide, Panthenol, Polysorbate 20, Phenoxyethanol, Ethylhexylglycerin",
    trustLabel: "РџСЂРѕРІРµСЂРµРЅРѕ",
    source: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ Р±Р°Р·Р° MVP",
    verified: true,
    verifiedAt: "2026-07-08"
  }
];

const STATIC_INGREDIENTS = {
  aqua: { name: "Aqua", ru: "РІРѕРґР°", roles: ["Р’РѕРґРЅР°СЏ С„Р°Р·Р°", "Р Р°СЃС‚РІРѕСЂРёС‚РµР»СЊ"], note: "РћР±С‹С‡РЅРѕ РѕСЃРЅРѕРІР° РІРѕРґРЅС‹С… С„РѕСЂРјСѓР».", skin: ["РџРѕРґС…РѕРґРёС‚ Р±РѕР»СЊС€РёРЅСЃС‚РІСѓ С‚РёРїРѕРІ РєРѕР¶Рё"] },
  water: { aliasOf: "aqua" },
  glycerin: { name: "Glycerin", ru: "РіР»РёС†РµСЂРёРЅ", roles: ["РЈРІР»Р°Р¶РЅРёС‚РµР»СЊ"], note: "РЈРґРµСЂР¶РёРІР°РµС‚ РІРѕРґСѓ РІ СЂРѕРіРѕРІРѕРј СЃР»РѕРµ Рё СЃРЅРёР¶Р°РµС‚ РѕС‰СѓС‰РµРЅРёРµ СЃСѓС…РѕСЃС‚Рё.", skin: ["РЎСѓС…Р°СЏ РєРѕР¶Р°", "РћР±РµР·РІРѕР¶РµРЅРЅРѕСЃС‚СЊ", "РќР°СЂСѓС€РµРЅРЅС‹Р№ Р±Р°СЂСЊРµСЂ"] },
  niacinamide: { name: "Niacinamide", ru: "РЅРёР°С†РёРЅР°РјРёРґ", roles: ["РђРєС‚РёРІ", "Р‘Р°СЂСЊРµСЂ", "РЎРµР±РѕСЂРµРіСѓР»СЏС†РёСЏ"], note: "РџРѕРґРґРµСЂР¶РёРІР°РµС‚ Р±Р°СЂСЊРµСЂ, РјРѕР¶РµС‚ РїРѕРјРѕРіР°С‚СЊ РїСЂРё Р¶РёСЂРЅРѕСЃС‚Рё, РїРѕСЃС‚Р°РєРЅРµ Рё РЅРµСЂРѕРІРЅРѕРј С‚РѕРЅРµ.", skin: ["Р–РёСЂРЅР°СЏ РєРѕР¶Р°", "РџРѕСЃС‚Р°РєРЅРµ", "РќР°СЂСѓС€РµРЅРЅС‹Р№ Р±Р°СЂСЊРµСЂ"] },
  panthenol: { name: "Panthenol", ru: "РїР°РЅС‚РµРЅРѕР»", roles: ["РЈСЃРїРѕРєР°РёРІР°СЋС‰РёР№ РєРѕРјРїРѕРЅРµРЅС‚", "Р‘Р°СЂСЊРµСЂ"], note: "РљРѕРјРїРѕРЅРµРЅС‚ РґР»СЏ СЃРЅРёР¶РµРЅРёСЏ СЃСѓС…РѕСЃС‚Рё Рё РґРёСЃРєРѕРјС„РѕСЂС‚Р°, С‡Р°СЃС‚Рѕ СѓРјРµСЃС‚РµРЅ РїРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ.", skin: ["Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°", "РџРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ", "РќР°СЂСѓС€РµРЅРЅС‹Р№ Р±Р°СЂСЊРµСЂ"] },
  allantoin: { name: "Allantoin", ru: "Р°Р»Р»Р°РЅС‚РѕРёРЅ", roles: ["РЈСЃРїРѕРєР°РёРІР°СЋС‰РёР№ РєРѕРјРїРѕРЅРµРЅС‚"], note: "РњСЏРіРєРёР№ СѓСЃРїРѕРєР°РёРІР°СЋС‰РёР№ РєРѕРјРїРѕРЅРµРЅС‚.", skin: ["Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°", "РџРѕСЃС‚РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ СѓС…РѕРґ"] },
  "sodium hyaluronate": { name: "Sodium Hyaluronate", ru: "РіРёР°Р»СѓСЂРѕРЅР°С‚ РЅР°С‚СЂРёСЏ", roles: ["РЈРІР»Р°Р¶РЅРёС‚РµР»СЊ"], note: "Р’Р»Р°РіРѕСѓРґРµСЂР¶РёРІР°СЋС‰РёР№ РєРѕРјРїРѕРЅРµРЅС‚.", skin: ["РћР±РµР·РІРѕР¶РµРЅРЅРѕСЃС‚СЊ", "Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°"] },
  "hyaluronic acid": { name: "Hyaluronic Acid", ru: "РіРёР°Р»СѓСЂРѕРЅРѕРІР°СЏ РєРёСЃР»РѕС‚Р°", roles: ["РЈРІР»Р°Р¶РЅРёС‚РµР»СЊ"], note: "Р’Р»Р°РіРѕСѓРґРµСЂР¶РёРІР°СЋС‰РёР№ РєРѕРјРїРѕРЅРµРЅС‚, СЌС„С„РµРєС‚ Р·Р°РІРёСЃРёС‚ РѕС‚ С„РѕСЂРјС‹ Рё РјРѕР»РµРєСѓР»СЏСЂРЅРѕР№ РјР°СЃСЃС‹.", skin: ["РћР±РµР·РІРѕР¶РµРЅРЅРѕСЃС‚СЊ", "РџРѕСЃС‚РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ СѓС…РѕРґ"] },
  "glycolic acid": { name: "Glycolic Acid", ru: "РіР»РёРєРѕР»РµРІР°СЏ РєРёСЃР»РѕС‚Р°", roles: ["AHA", "РљРµСЂР°С‚РѕР»РёС‚РёРє", "РџРёР»РёРЅРі-РєРѕРјРїРѕРЅРµРЅС‚"], note: "РђРєС‚РёРІРЅР°СЏ AHA-РєРёСЃР»РѕС‚Р°. Р’Р°Р¶РЅС‹ РїСЂРѕС†РµРЅС‚ Рё pH.", cautions: ["Р¤РѕС‚РѕС‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅРѕСЃС‚СЊ", "Р РёСЃРє СЂР°Р·РґСЂР°Р¶РµРЅРёСЏ", "SPF РѕР±СЏР·Р°С‚РµР»РµРЅ"], skin: ["РўРµРєСЃС‚СѓСЂР° РєРѕР¶Рё", "РџРёРіРјРµРЅС‚Р°С†РёСЏ"] },
  "lactic acid": { name: "Lactic Acid", ru: "РјРѕР»РѕС‡РЅР°СЏ РєРёСЃР»РѕС‚Р°", roles: ["AHA", "РљРµСЂР°С‚РѕР»РёС‚РёРє"], note: "AHA-РєРёСЃР»РѕС‚Р°, С‡Р°СЃС‚Рѕ РјСЏРіС‡Рµ РіР»РёРєРѕР»РµРІРѕР№, РЅРѕ pH Рё РїСЂРѕС†РµРЅС‚ РІСЃРµ СЂР°РІРЅРѕ РєСЂРёС‚РёС‡РЅС‹.", cautions: ["SPF РѕР±СЏР·Р°С‚РµР»РµРЅ РїСЂРё РєСѓСЂСЃРѕРІРѕРј РїСЂРёРјРµРЅРµРЅРёРё"], skin: ["РЎСѓС…Р°СЏ РєРѕР¶Р°", "РўСѓСЃРєР»С‹Р№ С‚РѕРЅ"] },
  "salicylic acid": { name: "Salicylic Acid", ru: "СЃР°Р»РёС†РёР»РѕРІР°СЏ РєРёСЃР»РѕС‚Р°", roles: ["BHA", "РљРµСЂР°С‚РѕР»РёС‚РёРє"], note: "Р–РёСЂРѕСЂР°СЃС‚РІРѕСЂРёРјР°СЏ РєРёСЃР»РѕС‚Р°, РїРѕР»РµР·РЅР° РїСЂРё РєРѕРјРµРґРѕРЅР°С…, РЅРѕ РјРѕР¶РµС‚ СЃСѓС€РёС‚СЊ.", cautions: ["РћСЃС‚РѕСЂРѕР¶РЅРѕ РїСЂРё Р±РµСЂРµРјРµРЅРЅРѕСЃС‚Рё/Р»Р°РєС‚Р°С†РёРё", "РќРµ СЃРѕС‡РµС‚Р°С‚СЊ Р±РµР· СЃС…РµРјС‹ СЃ СЂРµС‚РёРЅРѕРёРґР°РјРё"], skin: ["Р–РёСЂРЅР°СЏ РєРѕР¶Р°", "РљРѕРјРµРґРѕРЅС‹"] },
  retinol: { name: "Retinol", ru: "СЂРµС‚РёРЅРѕР»", roles: ["Р РµС‚РёРЅРѕРёРґ", "РђРєС‚РёРІ"], note: "РђРєС‚РёРІ РґР»СЏ С‚РµРєСЃС‚СѓСЂС‹, РїРѕСЃС‚Р°РєРЅРµ Рё С„РѕС‚РѕСЃС‚Р°СЂРµРЅРёСЏ. РўСЂРµР±СѓРµС‚ РїРѕСЃС‚РµРїРµРЅРЅРѕРіРѕ РІРІРµРґРµРЅРёСЏ.", cautions: ["Р‘РµСЂРµРјРµРЅРЅРѕСЃС‚СЊ/Р»Р°РєС‚Р°С†РёСЏ: СЃРѕРіР»Р°СЃРѕРІР°С‚СЊ СЃРѕ СЃРїРµС†РёР°Р»РёСЃС‚РѕРј", "SPF РѕР±СЏР·Р°С‚РµР»РµРЅ", "РќРµ СЃРѕС‡РµС‚Р°С‚СЊ РЅР° СЃС‚Р°СЂС‚Рµ СЃ РєРёСЃР»РѕС‚Р°РјРё"], skin: ["Р’РѕР·СЂР°СЃС‚РЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ", "РџРѕСЃС‚Р°РєРЅРµ"] },
  retinal: { name: "Retinal", ru: "СЂРµС‚РёРЅР°Р»СЊ", roles: ["Р РµС‚РёРЅРѕРёРґ", "РђРєС‚РёРІ"], note: "РђРєС‚РёРІРЅР°СЏ С„РѕСЂРјР° СЂРµС‚РёРЅРѕРёРґР°, РјРѕР¶РµС‚ Р±С‹С‚СЊ СЂР°Р·РґСЂР°Р¶Р°СЋС‰РµР№.", cautions: ["Р‘РµСЂРµРјРµРЅРЅРѕСЃС‚СЊ/Р»Р°РєС‚Р°С†РёСЏ: СЃРѕРіР»Р°СЃРѕРІР°С‚СЊ СЃРѕ СЃРїРµС†РёР°Р»РёСЃС‚РѕРј", "SPF РѕР±СЏР·Р°С‚РµР»РµРЅ"], skin: ["Р’РѕР·СЂР°СЃС‚РЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ", "РђРєРЅРµ-СЃРєР»РѕРЅРЅРѕСЃС‚СЊ"] },
  "caprylic/capric triglyceride": { name: "Caprylic/Capric Triglyceride", ru: "РєР°РїСЂРёР»РёРє/РєР°РїСЂРёРЅРѕРІС‹Р№ С‚СЂРёРіР»РёС†РµСЂРёРґ", roles: ["Р­РјРѕР»РµРЅС‚", "Р–РёСЂРѕРІР°СЏ С„Р°Р·Р°"], note: "Р›РµРіРєРёР№ СЌРјРѕР»РµРЅС‚, СѓР»СѓС‡С€Р°РµС‚ СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ Рё СЃРјСЏРіС‡РµРЅРёРµ.", skin: ["РЎСѓС…Р°СЏ РєРѕР¶Р°", "РќРѕСЂРјР°Р»СЊРЅР°СЏ РєРѕР¶Р°"] },
  dimethicone: { name: "Dimethicone", ru: "РґРёРјРµС‚РёРєРѕРЅ", roles: ["РЎРёР»РёРєРѕРЅРѕРІС‹Р№ СЌРјРѕР»РµРЅС‚", "Р—Р°С‰РёС‚РЅР°СЏ РїР»РµРЅРєР°"], note: "РЎРЅРёР¶Р°РµС‚ РїРѕС‚РµСЂСЋ РІР»Р°РіРё, СѓР»СѓС‡С€Р°РµС‚ СЃРєРѕР»СЊР¶РµРЅРёРµ, С‡Р°СЃС‚Рѕ РїРѕР»РµР·РµРЅ РїСЂРё РЅР°СЂСѓС€РµРЅРЅРѕРј Р±Р°СЂСЊРµСЂРµ.", skin: ["РќР°СЂСѓС€РµРЅРЅС‹Р№ Р±Р°СЂСЊРµСЂ", "Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°"] },
  "zinc oxide": { name: "Zinc Oxide", ru: "РѕРєСЃРёРґ С†РёРЅРєР°", roles: ["РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ"], note: "РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ UV-С„РёР»СЊС‚СЂ. Р РµР°Р»СЊРЅС‹Р№ SPF РїРѕРґС‚РІРµСЂР¶РґР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ С‚РµСЃС‚Р°РјРё РіРѕС‚РѕРІРѕРіРѕ РїСЂРѕРґСѓРєС‚Р°.", skin: ["Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°", "РџРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ"] },
  "titanium dioxide": { name: "Titanium Dioxide", ru: "РґРёРѕРєСЃРёРґ С‚РёС‚Р°РЅР°", roles: ["РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ"], note: "РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ UV-С„РёР»СЊС‚СЂ. РС‚РѕРіРѕРІР°СЏ Р·Р°С‰РёС‚Р° Р·Р°РІРёСЃРёС‚ РѕС‚ РіРѕС‚РѕРІРѕР№ С„РѕСЂРјСѓР»С‹.", skin: ["Р§СѓРІСЃС‚РІРёС‚РµР»СЊРЅР°СЏ РєРѕР¶Р°", "РџРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ"] },
  phenoxyethanol: { name: "Phenoxyethanol", ru: "С„РµРЅРѕРєСЃРёСЌС‚Р°РЅРѕР»", roles: ["РљРѕРЅСЃРµСЂРІР°РЅС‚"], note: "Р Р°СЃРїСЂРѕСЃС‚СЂР°РЅРµРЅРЅС‹Р№ РєРѕРЅСЃРµСЂРІР°РЅС‚, РѕР±С‹С‡РЅРѕ РІ РЅРёР·РєРѕР№ РєРѕРЅС†РµРЅС‚СЂР°С†РёРё.", cautions: ["РЈ РѕС‡РµРЅСЊ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅРѕР№ РєРѕР¶Рё РІРѕР·РјРѕР¶РЅР° РёРЅРґРёРІРёРґСѓР°Р»СЊРЅР°СЏ СЂРµР°РєС†РёСЏ"] },
  ethylhexylglycerin: { name: "Ethylhexylglycerin", ru: "СЌС‚РёР»РіРµРєСЃРёР»РіР»РёС†РµСЂРёРЅ", roles: ["Р‘СѓСЃС‚РµСЂ РєРѕРЅСЃРµСЂРІР°С†РёРё"], note: "Р§Р°СЃС‚Рѕ СѓСЃРёР»РёРІР°РµС‚ РєРѕРЅСЃРµСЂРІРёСЂСѓСЋС‰СѓСЋ СЃРёСЃС‚РµРјСѓ." },
  parfum: { name: "Parfum", ru: "РѕС‚РґСѓС€РєР°", roles: ["РћС‚РґСѓС€РєР°"], note: "РњРѕР¶РµС‚ РїРѕРІС‹С€Р°С‚СЊ СЂРёСЃРє СЂР°Р·РґСЂР°Р¶РµРЅРёСЏ Сѓ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅРѕР№ РєРѕР¶Рё.", cautions: ["РћСЃС‚РѕСЂРѕР¶РЅРѕ РїСЂРё СЂРѕР·Р°С†РµР°, РґРµСЂРјР°С‚РёС‚Рµ, РїРѕСЃР»Рµ РїСЂРѕС†РµРґСѓСЂ"] },
  fragrance: { aliasOf: "parfum" },
  limonene: { name: "Limonene", ru: "Р»РёРјРѕРЅРµРЅ", roles: ["Р¤СЂР°РіСЂР°РЅСЃ-Р°Р»Р»РµСЂРіРµРЅ"], note: "РђСЂРѕРјР°С‚РёС‡РµСЃРєРёР№ Р°Р»Р»РµСЂРіРµРЅ.", cautions: ["РћСЃС‚РѕСЂРѕР¶РЅРѕ РїСЂРё СЃРєР»РѕРЅРЅРѕСЃС‚Рё Рє Р°Р»Р»РµСЂРіРёС‡РµСЃРєРёРј СЂРµР°РєС†РёСЏРј"] },
  linalool: { name: "Linalool", ru: "Р»РёРЅР°Р»РѕРѕР»", roles: ["Р¤СЂР°РіСЂР°РЅСЃ-Р°Р»Р»РµСЂРіРµРЅ"], note: "РђСЂРѕРјР°С‚РёС‡РµСЃРєРёР№ Р°Р»Р»РµСЂРіРµРЅ.", cautions: ["РћСЃС‚РѕСЂРѕР¶РЅРѕ РїСЂРё С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅРѕР№ РєРѕР¶Рµ"] }
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

function concentrationZone(index, total) {
  if (index === 0) return "РѕСЃРЅРѕРІР° С„РѕСЂРјСѓР»С‹";
  if (index <= 4) return "РІРµСЂРѕСЏС‚РЅРѕ РІС‹СЃРѕРєР°СЏ РёР»Рё СЃСЂРµРґРЅСЏСЏ РєРѕРЅС†РµРЅС‚СЂР°С†РёРѕРЅРЅР°СЏ Р·РѕРЅР°";
  if (index / Math.max(total, 1) < 0.45) return "РІРµСЂРѕСЏС‚РЅРѕ СЃСЂРµРґРЅСЏСЏ Р·РѕРЅР°";
  return "РІРµСЂРѕСЏС‚РЅРѕ РЅРёР·РєР°СЏ Р·РѕРЅР° РёР»Рё Р±Р»РѕРє РґРѕ/РЅРёР¶Рµ 1%";
}

function parseIngredients(text) {
  return String(text || "")
    .replace(/ingredients?\s*[:пјљ]/gi, "")
    .replace(/СЃРѕСЃС‚Р°РІ\s*[:пјљ]/gi, "")
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

  let formulaType = "СѓС…РѕРґРѕРІРѕРµ СЃСЂРµРґСЃС‚РІРѕ, С‚РёРї С‚СЂРµР±СѓРµС‚ СѓС‚РѕС‡РЅРµРЅРёСЏ";
  if (hasRole("РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ")) formulaType = "SPF/С„РѕС‚РѕР·Р°С‰РёС‚РЅРѕРµ СЃСЂРµРґСЃС‚РІРѕ";
  if (hasRole("AHA") || hasRole("BHA")) formulaType = "РєРёСЃР»РѕС‚РЅРѕРµ СЃСЂРµРґСЃС‚РІРѕ РёР»Рё РїРёР»РёРЅРі-РїРѕРґРѕР±РЅР°СЏ С„РѕСЂРјСѓР»Р°";
  if (hasRole("Р РµС‚РёРЅРѕРёРґ")) formulaType = "СЂРµС‚РёРЅРѕРёРґРЅРѕРµ Р°РєС‚РёРІРЅРѕРµ СЃСЂРµРґСЃС‚РІРѕ";

  const profileText = `${profile.skinType || ""} ${profile.concerns || ""} ${profile.context || ""}`.toLowerCase();
  const warnings = [...new Set(found.flatMap((item) => item.cautions))];
  if (/С‡СѓРІСЃС‚РІ|СЂРѕР·Р°С†РµР°|РїРѕСЃР»Рµ|Р±Р°СЂСЊРµСЂ/.test(profileText) && (hasRole("AHA") || hasRole("BHA") || hasRole("Р РµС‚РёРЅРѕРёРґ") || hasRole("РћС‚РґСѓС€РєР°"))) {
    warnings.push("Р”Р»СЏ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅРѕР№ РєРѕР¶Рё, СЂРѕР·Р°С†РµР° РёР»Рё РїРѕСЃС‚РїСЂРѕС†РµРґСѓСЂРЅРѕРіРѕ РїРµСЂРёРѕРґР° С„РѕСЂРјСѓР»Р° С‚СЂРµР±СѓРµС‚ РѕСЃС‚РѕСЂРѕР¶РЅРѕРіРѕ РІРІРµРґРµРЅРёСЏ.");
  }
  if (hasRole("РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ")) {
    warnings.push("Р РµР°Р»СЊРЅС‹Р№ SPF/PPD РЅРµР»СЊР·СЏ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РїРѕ РѕРґРЅРѕРјСѓ INCI: РЅСѓР¶РЅС‹ С‚РµСЃС‚С‹ РіРѕС‚РѕРІРѕРіРѕ РїСЂРѕРґСѓРєС‚Р°.");
  }

  const risk = (hasRole("Р РµС‚РёРЅРѕРёРґ") ? 18 : 0) + (hasRole("AHA") ? 16 : 0) + (hasRole("BHA") ? 16 : 0) + (hasRole("РћС‚РґСѓС€РєР°") ? 8 : 0) + unknown.length * 2;
  const scoreValue = Math.max(0, Math.min(100, 88 - risk));
  const score = {
    score: scoreValue,
    label: scoreValue >= 75 ? "РЅРёР·РєР°СЏ РЅР°СЃС‚РѕСЂРѕР¶РµРЅРЅРѕСЃС‚СЊ" : scoreValue >= 55 ? "СѓРјРµСЂРµРЅРЅР°СЏ РЅР°СЃС‚РѕСЂРѕР¶РµРЅРЅРѕСЃС‚СЊ" : "РІС‹СЃРѕРєР°СЏ РЅР°СЃС‚РѕСЂРѕР¶РµРЅРЅРѕСЃС‚СЊ"
  };

  const architecture = [
    { title: "Р’РѕРґРЅР°СЏ Рё СѓРІР»Р°Р¶РЅСЏСЋС‰Р°СЏ С‡Р°СЃС‚СЊ", names: ["Aqua", "Glycerin", "Sodium Hyaluronate", "Hyaluronic Acid", "Panthenol", "Niacinamide", "Allantoin"] },
    { title: "РЎРјСЏРіС‡Р°СЋС‰Р°СЏ/Р·Р°С‰РёС‚РЅР°СЏ С‡Р°СЃС‚СЊ", names: ["Caprylic/Capric Triglyceride", "Dimethicone"] },
    { title: "РђРєС‚РёРІС‹", names: ["Niacinamide", "Retinol", "Retinal", "Glycolic Acid", "Lactic Acid", "Salicylic Acid"] },
    { title: "РљРѕРЅСЃРµСЂРІР°С†РёСЏ", names: ["Phenoxyethanol", "Ethylhexylglycerin"] },
    { title: "РћС‚РґСѓС€РєР° Рё Р°Р»Р»РµСЂРіРµРЅС‹", names: ["Parfum", "Limonene", "Linalool"] }
  ]
    .map((group) => ({ title: group.title, text: group.names.filter((name) => names.has(name)).join(", ") }))
    .filter((group) => group.text);

  const expertSummary = [];
  if (hasRole("Р РµС‚РёРЅРѕРёРґ")) expertSummary.push("Р­С‚Рѕ Р°РєС‚РёРІРЅР°СЏ СЂРµС‚РёРЅРѕРёРґРЅР°СЏ С„РѕСЂРјСѓР»Р°: РїРѕР»РµР·РЅР° РґР»СЏ С‚РµРєСЃС‚СѓСЂС‹, РїРѕСЃС‚Р°РєРЅРµ Рё РїСЂРёР·РЅР°РєРѕРІ С„РѕС‚РѕСЃС‚Р°СЂРµРЅРёСЏ, РЅРѕ С‚СЂРµР±СѓРµС‚ РїРѕСЃС‚РµРїРµРЅРЅРѕРіРѕ РІРІРµРґРµРЅРёСЏ.");
  if (hasRole("AHA") || hasRole("BHA")) expertSummary.push("Р’ СЃРѕСЃС‚Р°РІРµ РµСЃС‚СЊ РєРёСЃР»РѕС‚С‹: СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚СЊ Рё СЂР°Р·РґСЂР°Р¶Р°СЋС‰РёР№ РїРѕС‚РµРЅС†РёР°Р» Р·Р°РІРёСЃСЏС‚ РѕС‚ РїСЂРѕС†РµРЅС‚Р° Рё pH, РєРѕС‚РѕСЂС‹С… РЅРµ РІРёРґРЅРѕ РїРѕ INCI.");
  if (hasRole("РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ")) expertSummary.push("Р­С‚Рѕ РїРѕС…РѕР¶Рµ РЅР° SPF-СЃСЂРµРґСЃС‚РІРѕ, РЅРѕ СЂРµР°Р»СЊРЅСѓСЋ Р·Р°С‰РёС‚Сѓ РїРѕРґС‚РІРµСЂР¶РґР°СЋС‚ С‚РѕР»СЊРєРѕ С‚РµСЃС‚С‹ РіРѕС‚РѕРІРѕР№ С„РѕСЂРјСѓР»С‹.");
  if (names.has("Panthenol") || names.has("Allantoin") || names.has("Dimethicone")) expertSummary.push("Р•СЃС‚СЊ РєРѕРјРїРѕРЅРµРЅС‚С‹ РґР»СЏ РїРѕРґРґРµСЂР¶РєРё Р±Р°СЂСЊРµСЂР° Рё СЃРЅРёР¶РµРЅРёСЏ СЃСѓС…РѕСЃС‚Рё.");
  if (!expertSummary.length) expertSummary.push("Р¤РѕСЂРјСѓР»Р° РІС‹РіР»СЏРґРёС‚ РєР°Рє Р±Р°Р·РѕРІРѕРµ СѓС…РѕРґРѕРІРѕРµ СЃСЂРµРґСЃС‚РІРѕ. Р“Р»Р°РІРЅР°СЏ РЅРµРѕРїСЂРµРґРµР»РµРЅРЅРѕСЃС‚СЊ вЂ” РїСЂРѕС†РµРЅС‚С‹, pH Рё РёРЅРґРёРІРёРґСѓР°Р»СЊРЅР°СЏ РїРµСЂРµРЅРѕСЃРёРјРѕСЃС‚СЊ.");

  const routineAdvice = [];
  if (hasRole("Р РµС‚РёРЅРѕРёРґ")) routineAdvice.push("РќР°С‡РёРЅР°С‚СЊ 2-3 СЂР°Р·Р° РІ РЅРµРґРµР»СЋ РІРµС‡РµСЂРѕРј, РЅРµ СЃРѕС‡РµС‚Р°С‚СЊ РЅР° СЃС‚Р°СЂС‚Рµ СЃ РєРёСЃР»РѕС‚Р°РјРё.");
  if (hasRole("AHA") || hasRole("BHA")) routineAdvice.push("РќРµ СЃРѕС‡РµС‚Р°С‚СЊ РІ РѕРґРёРЅ РґРµРЅСЊ СЃ РґСЂСѓРіРёРјРё СЃРёР»СЊРЅС‹РјРё РєРёСЃР»РѕС‚Р°РјРё/СЂРµС‚РёРЅРѕРёРґР°РјРё Р±РµР· СЃС…РµРјС‹. SPF РѕР±СЏР·Р°С‚РµР»РµРЅ.");
  if (hasRole("РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ")) routineAdvice.push("РќР°РЅРѕСЃРёС‚СЊ С‰РµРґСЂРѕ Рё РѕР±РЅРѕРІР»СЏС‚СЊ РїСЂРё РґР»РёС‚РµР»СЊРЅРѕРј РїСЂРµР±С‹РІР°РЅРёРё РЅР° СѓР»РёС†Рµ.");
  if (!routineAdvice.length) routineAdvice.push("Р’РІРѕРґРёС‚СЊ РїРѕСЃС‚РµРїРµРЅРЅРѕ Рё РЅР°Р±Р»СЋРґР°С‚СЊ Р·Р° Р¶Р¶РµРЅРёРµРј, Р·СѓРґРѕРј, СЃСѓС…РѕСЃС‚СЊСЋ Рё РІС‹СЃС‹РїР°РЅРёСЏРјРё.");

  const questions = ["РџРѕРґС…РѕРґРёС‚ Р»Рё СЌС‚Рѕ СЃСЂРµРґСЃС‚РІРѕ РјРѕРµРјСѓ С‚РµРєСѓС‰РµРјСѓ СЃРѕСЃС‚РѕСЏРЅРёСЋ РєРѕР¶Рё, Р° РЅРµ С‚РѕР»СЊРєРѕ С‚РёРїСѓ РєРѕР¶Рё?"];
  if (hasRole("AHA") || hasRole("BHA")) questions.push("РљР°РєРѕР№ РїСЂРѕС†РµРЅС‚ РєРёСЃР»РѕС‚ Рё pH Сѓ СЃСЂРµРґСЃС‚РІР°?");
  if (hasRole("Р РµС‚РёРЅРѕРёРґ")) questions.push("РљР°РєР°СЏ РєРѕРЅС†РµРЅС‚СЂР°С†РёСЏ СЂРµС‚РёРЅРѕРёРґР° Рё РєР°Рє РІС‹СЃС‚СЂРѕРёС‚СЊ СЃС…РµРјСѓ Р°РґР°РїС‚Р°С†РёРё?");
  if (hasRole("РњРёРЅРµСЂР°Р»СЊРЅС‹Р№ SPF-С„РёР»СЊС‚СЂ")) questions.push("Р•СЃС‚СЊ Р»Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рµ SPF/PPD/UVA-PF С‚РµСЃС‚С‹ РіРѕС‚РѕРІРѕРіРѕ РїСЂРѕРґСѓРєС‚Р°?");

  const confidenceRatio = ingredients.length ? found.length / ingredients.length : 0;

  return {
    summary: `РџРѕС…РѕР¶Рµ РЅР°: ${formulaType}. Р Р°СЃРїРѕР·РЅР°РЅРѕ РёРЅРіСЂРµРґРёРµРЅС‚РѕРІ: ${found.length} РёР· ${ingredients.length}.`,
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
      label: confidenceRatio >= 0.85 ? "С…РѕСЂРѕС€Р°СЏ" : confidenceRatio >= 0.55 ? "СЃСЂРµРґРЅСЏСЏ" : "РЅРёР·РєР°СЏ",
      text: "РЎС‚Р°С‚РёС‡РµСЃРєР°СЏ РІРµСЂСЃРёСЏ: СЂР°Р±РѕС‚Р°РµС‚ Р±РµР· СЃРµСЂРІРµСЂР°, РЅРѕ Р±РµР· РІРЅРµС€РЅРµРіРѕ РїРѕРёСЃРєР° Open Beauty Facts Рё РѕС‡РµСЂРµРґРё РїСЂРѕРІРµСЂРєРё."
    },
    disclaimer: "Р­С‚Рѕ СЃРїСЂР°РІРѕС‡РЅС‹Р№ СЂР°Р·Р±РѕСЂ СЃРѕСЃС‚Р°РІР°, Р° РЅРµ РјРµРґРёС†РёРЅСЃРєРѕРµ РЅР°Р·РЅР°С‡РµРЅРёРµ. РўРѕС‡РЅС‹Рµ РїСЂРѕС†РµРЅС‚С‹, pH, SPF/PPD Рё РїРµСЂРµРЅРѕСЃРёРјРѕСЃС‚СЊ РЅРµР»СЊР·СЏ РЅР°РґРµР¶РЅРѕ РѕРїСЂРµРґРµР»РёС‚СЊ С‚РѕР»СЊРєРѕ РїРѕ INCI."
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
  setProductStatus("РџРѕРґС‚СЏРіРёРІР°СЋ СЃРѕСЃС‚Р°РІ РёР· Р±Р°Р·С‹...");
  const detailedProduct = await loadProductDetails(product);

  if (!detailedProduct.composition) {
    hideSuggestions();
    setProductStatus("РљР°СЂС‚РѕС‡РєР° РЅР°Р№РґРµРЅР°, РЅРѕ INCI РїРѕРєР° РЅРµ РїРѕРґС‚СЏРЅСѓР»СЃСЏ. РњРѕР¶РЅРѕ РІСЃС‚Р°РІРёС‚СЊ СЃРѕСЃС‚Р°РІ РІСЂСѓС‡РЅСѓСЋ.", "warn");
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
    : `${detailedProduct.source}, РїСЂРѕРІРµСЂСЊС‚Рµ СЃРѕСЃС‚Р°РІ РїРѕ СЌС‚РёРєРµС‚РєРµ`;
  const verifiedAt = detailedProduct.verifiedAt ? ` РџСЂРѕРІРµСЂРµРЅРѕ: ${detailedProduct.verifiedAt}.` : "";
  const scopeNote = detailedProduct.compositionScope === "active_ingredients_only"
    ? " Р­С‚Рѕ РЅРµ РїРѕР»РЅС‹Р№ INCI: РїРѕРґСЃС‚Р°РІР»РµРЅС‹ С‚РѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ РёРЅРіСЂРµРґРёРµРЅС‚С‹ СЃ РѕС„РёС†РёР°Р»СЊРЅРѕР№ РєР°СЂС‚РѕС‡РєРё."
    : "";
  setProductStatus(`РЎРѕСЃС‚Р°РІ РїРѕРґСЃС‚Р°РІР»РµРЅ: ${source}.${verifiedAt}${scopeNote}`, detailedProduct.verified ? "ok" : "warn");
  return detailedProduct;
}

async function autofillCompositionFromName() {
  const query = productName?.value.trim() || "";
  if (composition.value.trim()) return true;
  if (!query) return false;

  setProductStatus("РС‰Сѓ СЃРѕСЃС‚Р°РІ РїРѕ РЅР°Р·РІР°РЅРёСЋ СЃСЂРµРґСЃС‚РІР°...");

  try {
    const data = await searchProductByName(query);
    const candidate = (data.products || []).find((product) => product.hasComposition || product.composition);

    if (!candidate) {
      hideSuggestions();
      setProductStatus("РЎРѕСЃС‚Р°РІ РїРѕ РЅР°Р·РІР°РЅРёСЋ РїРѕРєР° РЅРµ РЅР°Р№РґРµРЅ. РЈС‚РѕС‡РЅРёС‚Рµ Р±СЂРµРЅРґ/РЅР°Р·РІР°РЅРёРµ РёР»Рё РІСЃС‚Р°РІСЊС‚Рµ СЃРѕСЃС‚Р°РІ СЃ СѓРїР°РєРѕРІРєРё РІСЂСѓС‡РЅСѓСЋ.", "warn");
      return false;
    }

    const detailedProduct = await applyProduct(candidate);
    return Boolean(detailedProduct?.composition || composition.value.trim());
  } catch {
    setProductStatus("РџРѕРёСЃРє РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РњРѕР¶РЅРѕ РїРѕРїСЂРѕР±РѕРІР°С‚СЊ РїРѕР·Р¶Рµ РёР»Рё РІСЃС‚Р°РІРёС‚СЊ СЃРѕСЃС‚Р°РІ СЃ СѓРїР°РєРѕРІРєРё РІСЂСѓС‡РЅСѓСЋ.", "warn");
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
      <p>РџРѕРєР° РЅРµС‚ РїСЂРѕРІРµСЂРµРЅРЅРѕРіРѕ СЃРѕСЃС‚Р°РІР° РґР»СЏ СЌС‚РѕРіРѕ СЃСЂРµРґСЃС‚РІР°.</p>
      <button class="review-request-button" type="button">РћС‚РїСЂР°РІРёС‚СЊ РЅР° РїСЂРѕРІРµСЂРєСѓ</button>
    </div>
  `;
  productSuggestions.hidden = false;

  productSuggestions.querySelector(".review-request-button")?.addEventListener("click", async () => {
    try {
      await requestProductReview(query);
      hideSuggestions();
      setProductStatus("Р—Р°РїСЂРѕСЃ РґРѕР±Р°РІР»РµРЅ РІ РѕС‡РµСЂРµРґСЊ РїСЂРѕРІРµСЂРєРё. Р§РµРј С‡Р°С‰Рµ СЃСЂРµРґСЃС‚РІРѕ РёС‰СѓС‚, С‚РµРј РІС‹С€Рµ РїСЂРёРѕСЂРёС‚РµС‚.", "ok");
    } catch {
      setProductStatus("РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ Р·Р°РїСЂРѕСЃ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ РёР»Рё РІСЃС‚Р°РІСЊС‚Рµ INCI РІСЂСѓС‡РЅСѓСЋ.", "warn");
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
      const verifiedAt = product.verifiedAt ? ` В· ${escapeHtml(product.verifiedAt)}` : "";
      const verificationNote = product.verified ? "" : " В· РїСЂРѕРІРµСЂСЊС‚Рµ РїРѕ СЌС‚РёРєРµС‚РєРµ";
      return `
        <button class="suggestion" type="button" data-index="${index}">
          ${productImage(product)}
          <span class="suggestion-body">
            <strong>${escapeHtml(product.name)} <em>${escapeHtml(product.trustLabel || "РСЃС‚РѕС‡РЅРёРє")}</em></strong>
            <span>${escapeHtml(product.brand)} В· ${escapeHtml(product.category || "РєР°С‚РµРіРѕСЂРёСЏ РЅРµ СѓРєР°Р·Р°РЅР°")}</span>
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

  setProductStatus("РС‰Сѓ СЃРѕСЃС‚Р°РІ РїРѕ РЅР°Р·РІР°РЅРёСЋ...");

  try {
    const data = await searchProductByName(query);
    const wasApplied = renderSuggestions(data.products || []);
    if (wasApplied) return;

    setProductStatus(
      data.products?.length
        ? "Р’С‹Р±РµСЂРёС‚Рµ СЃСЂРµРґСЃС‚РІРѕ РёР· СЃРїРёСЃРєР°, С‡С‚РѕР±С‹ РїРѕРґСЃС‚Р°РІРёС‚СЊ INCI."
        : "РќРµ РЅР°С€Р»Р° СЃРѕСЃС‚Р°РІ РїРѕ РЅР°Р·РІР°РЅРёСЋ. РЈС‚РѕС‡РЅРёС‚Рµ Р±СЂРµРЅРґ РёР»Рё РІСЃС‚Р°РІСЊС‚Рµ INCI РІСЂСѓС‡РЅСѓСЋ.",
      data.products?.length ? "ok" : "warn"
    );
  } catch {
    hideSuggestions();
    setProductStatus("РџРѕРёСЃРє РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РЎРѕСЃС‚Р°РІ РјРѕР¶РЅРѕ РІСЃС‚Р°РІРёС‚СЊ РІСЂСѓС‡РЅСѓСЋ.", "warn");
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

function renderCatalogFilters(products) {
  if (!catalogCategories) return;
  const brands = uniqueSorted(products.map((product) => product.brand));
  const categories = uniqueSorted(products.map((product) => product.category));
  catalogCategories.innerHTML = `
    <div class="catalog-filters">
      <label>Поиск<input id="catalogTextFilter" type="search" placeholder="Название, бренд, актив..." /></label>
      <label>Категория<select id="catalogCategoryFilter"><option value="">Все категории</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Производитель<select id="catalogBrandFilter"><option value="">Все производители</option>${brands.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></label>
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
    if (brand && product.brand !== brand) return false;
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

photoInput?.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  if (!file || !photoStatus) return;

  photoStatus.hidden = false;
  photoStatus.textContent = "Р¤РѕС‚Рѕ РїСЂРёРЅСЏС‚Рѕ. РЎРµР№С‡Р°СЃ РІРєР»СЋС‡РµРЅ Р±С‹СЃС‚СЂС‹Р№ РїСЂРѕС‚РѕС‚РёРї: СЃРµСЂРІРёСЃ РїСЂРѕР±СѓРµС‚ РёСЃРєР°С‚СЊ РїРѕ РёРјРµРЅРё С„Р°Р№Р»Р° Рё Р±Р°Р·Рµ. РџРѕР»РЅРѕС†РµРЅРЅРѕРµ OCR-СЂР°СЃРїРѕР·РЅР°РІР°РЅРёРµ СЃРѕСЃС‚Р°РІР° Р»СѓС‡С€Рµ РїРѕРґРєР»СЋС‡Р°С‚СЊ СЃРµСЂРІРµСЂРЅС‹Рј РјРѕРґСѓР»РµРј.";

  const guessed = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (guessed) {
    productName.value = guessed;
    productName.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

initCatalog();

function render(data) {
  const expertSummary = cards(data.expertSummary, "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С… РґР»СЏ СЌРєСЃРїРµСЂС‚РЅРѕР№ СЃРІРѕРґРєРё.");
  const routineAdvice = list(data.routineAdvice, "РќРµС‚ СЃРїРµС†РёР°Р»СЊРЅС‹С… СЂРµРєРѕРјРµРЅРґР°С†РёР№ РїРѕ РІРІРµРґРµРЅРёСЋ.");
  const questions = list(data.questions, "РЈС‚РѕС‡РЅСЏСЋС‰РёС… РІРѕРїСЂРѕСЃРѕРІ РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅРѕ.");
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
    : `<p class="muted">РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ СЂР°СЃРїРѕР·РЅР°РЅРЅС‹С… РєРѕРјРїРѕРЅРµРЅС‚РѕРІ, С‡С‚РѕР±С‹ РѕРїРёСЃР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂСѓ С„РѕСЂРјСѓР»С‹.</p>`;

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
          <dt>РџРѕР·РёС†РёСЏ</dt>
          <dd>${item.position}</dd>
          <dt>Р—РѕРЅР°</dt>
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
        <h2>Р§С‚Рѕ С‚СЂРµР±СѓРµС‚ РїСЂРѕРІРµСЂРєРё</h2>
        <p class="muted">Р­С‚Рё РїРѕР·РёС†РёРё РЅРµ РЅР°Р№РґРµРЅС‹ РІ С‚РµРєСѓС‰РµР№ Р±Р°Р·Рµ MVP. РС… СЃС‚РѕРёС‚ СЃРІРµСЂРёС‚СЊ РїРѕ СЌС‚РёРєРµС‚РєРµ РёР»Рё СЂР°СЃС€РёСЂРµРЅРЅРѕР№ Р±Р°Р·Рµ РёРЅРіСЂРµРґРёРµРЅС‚РѕРІ.</p>
        ${list(unknown, "Р’СЃРµ РёРЅРіСЂРµРґРёРµРЅС‚С‹ РёР· СЃРѕСЃС‚Р°РІР° СЂР°СЃРїРѕР·РЅР°РЅС‹ Р±Р°Р·РѕР№ MVP.")}
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `
    : `
      <section class="section">
        <h2>РћРіСЂР°РЅРёС‡РµРЅРёСЏ Р°РЅР°Р»РёР·Р°</h2>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `;

  result.innerHTML = `
    <div class="score">
      <div class="score-number">
        <p class="eyebrow">РС‚РѕРі</p>
        <h2>${escapeHtml(data.score.score)}/100</h2>
        <p>${escapeHtml(data.score.label)}</p>
      </div>
      <div>
        <h2>${escapeHtml(data.formulaType)}</h2>
        <p>${escapeHtml(data.summary)}</p>
        <p class="confidence">РЈРІРµСЂРµРЅРЅРѕСЃС‚СЊ: ${escapeHtml(data.confidence?.label || "РЅРµРёР·РІРµСЃС‚РЅРѕ")} В· ${escapeHtml(data.confidence?.text || "")}</p>
      </div>
    </div>

    <section class="section">
      <h2>Р“Р»Р°РІРЅС‹Р№ РІС‹РІРѕРґ</h2>
      ${expertSummary}
    </section>

    <section class="section">
      <h2>РљР°Рє СѓСЃС‚СЂРѕРµРЅР° С„РѕСЂРјСѓР»Р°</h2>
      ${architecture}
    </section>

    <section class="section">
      <h2>Р“СЂСѓРїРїС‹ РєРѕРјРїРѕРЅРµРЅС‚РѕРІ</h2>
      <div class="tiles">${groups || '<p class="muted">РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ СЂР°СЃРїРѕР·РЅР°РЅРЅС‹С… РєРѕРјРїРѕРЅРµРЅС‚РѕРІ.</p>'}</div>
    </section>

    <section class="section two">
      <div>
        <h2>РњРѕР¶РµС‚ Р±С‹С‚СЊ РїРѕР»РµР·РЅРѕ РїСЂРё</h2>
        ${list(data.positives, "РџРѕ С‚РµРєСѓС‰РµР№ Р±Р°Р·Рµ MVP РЅРµС‚ СѓРІРµСЂРµРЅРЅС‹С… РІС‹РІРѕРґРѕРІ.")}
      </div>
      <div>
        <h2>РќР° С‡С‚Рѕ РѕР±СЂР°С‚РёС‚СЊ РІРЅРёРјР°РЅРёРµ</h2>
        ${list(data.warnings, "РЇРІРЅС‹С… РєСЂР°СЃРЅС‹С… С„Р»Р°РіРѕРІ РІ Р±Р°Р·Рµ MVP РЅРµ РЅР°Р№РґРµРЅРѕ.")}
      </div>
    </section>

    <section class="section two">
      <div>
        <h2>РљР°Рє РІРІРѕРґРёС‚СЊ РІ СѓС…РѕРґ</h2>
        ${routineAdvice}
      </div>
      <div>
        <h2>Р§С‚Рѕ СЃРїСЂРѕСЃРёС‚СЊ Сѓ РєРѕСЃРјРµС‚РѕР»РѕРіР°</h2>
        ${questions}
      </div>
    </section>

    <section class="section">
      <h2>Р Р°СЃРїРѕР·РЅР°РЅРЅС‹Рµ РёРЅРіСЂРµРґРёРµРЅС‚С‹</h2>
      <div class="ingredients">${found || '<p class="muted">РќРµС‚ СЃРѕРІРїР°РґРµРЅРёР№ РІ Р±Р°Р·Рµ MVP.</p>'}</div>
    </section>

    ${unknownSection}
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const hasComposition = await autofillCompositionFromName();

  if (!hasComposition) {
    result.innerHTML = `<div class="error">Не удалось автоматически подтянуть состав. Выберите средство из подсказок или каталога, либо уточните название.</div>`;
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

  result.innerHTML = `<div class="loading">Р Р°Р·Р±РёСЂР°СЋ СЃРѕСЃС‚Р°РІ...</div>`;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Analyze failed");
    const analysis = await response.json();
    saveLocalHistory("analysisHistory", {
      productName: productName?.value.trim() || "",
      score: analysis.score?.score,
      formulaType: analysis.formulaType
    });
    render(analysis);
  } catch {
    const analysis = localAnalyzeComposition(payload);
    saveLocalHistory("analysisHistory", {
      productName: productName?.value.trim() || "",
      score: analysis.score?.score,
      formulaType: analysis.formulaType
    });
    render(analysis);
  }
});
