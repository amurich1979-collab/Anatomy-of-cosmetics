import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const productsPath = path.join(rootDir, "data", "products.json");
const productIndexPath = path.join(rootDir, "data", "product-index.json");

const TARGET_COUNT = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 1000);

const QUERIES = [
  "SkinCeuticals",
  "La Roche Posay",
  "CeraVe",
  "Bioderma",
  "Avene",
  "Uriage",
  "Vichy",
  "Eucerin",
  "SVR",
  "Noreva",
  "Ducray",
  "The Ordinary",
  "Paula's Choice",
  "Sesderma",
  "Medik8",
  "Mesoestetic",
  "Martiderm",
  "Filorga",
  "Neostrata",
  "Exuviance",
  "Obagi",
  "ZO Skin Health",
  "Dermalogica",
  "PCA Skin",
  "iS Clinical",
  "Revision Skincare",
  "Colorescience",
  "EltaMD",
  "Heliocare",
  "Holy Land",
  "Christina",
  "GIGI",
  "Janssen Cosmetics",
  "Academie",
  "Sothys",
  "Thalgo",
  "Biologique Recherche",
  "Dr. Jart",
  "Murad",
  "Ren Clean Skincare",
  "Elemis",
  "Mediderma",
  "A-Derma",
  "Topicrem",
  "Klorane",
  "Lierac",
  "Caudalie",
  "AHA serum",
  "retinol serum",
  "glycolic peel",
  "salicylic acid",
  "azelaic acid",
  "vitamin c serum",
  "SPF 50 face",
  "post peel",
  "professional skincare"
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickIngredients(product) {
  return (
    product.ingredients_text ||
    product.ingredients_text_en ||
    product.ingredients_text_fr ||
    product.ingredients_text_ru ||
    product.ingredients_text_with_allergens ||
    ""
  ).trim();
}

function toProduct(product) {
  const composition = pickIngredients(product);
  const name = product.product_name?.trim();

  if (!name || !composition || composition.length < 20) {
    return null;
  }

  const code = product.code || slug(`${product.brands}-${name}`);

  return {
    id: `obf-${code}`,
    code,
    name,
    brand: product.brands?.trim() || "Бренд не указан",
    category: product.categories?.trim() || "Косметическое средство",
    trustLevel: "D",
    trustLabel: "Внешний источник",
    trustNote: "Состав импортирован из Open Beauty Facts. Перед рекомендациями его нужно сверить по этикетке или официальному источнику.",
    source: "Open Beauty Facts",
    sourceUrl: product.url || `https://world.openbeautyfacts.org/product/${code}`,
    sourceType: "open_beauty_facts",
    verified: false,
    hasComposition: Boolean(composition),
    importedAt: new Date().toISOString().slice(0, 10),
    formulaVersion: "external-open-beauty-facts",
    market: "external"
  };
}

async function fetchPage(query, page) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "100",
    page: String(page),
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url"
  });

  const response = await fetch(`https://world.openbeautyfacts.org/cgi/search.pl?${params}`, {
    headers: {
      "User-Agent": "AnatomyCosmetologyImporter/0.1 (contact: local MVP)"
    }
  });

  if (!response.ok) {
    throw new Error(`Open Beauty Facts ${response.status} for ${query}`);
  }

  return response.json();
}

const existingProducts = readJson(productsPath, []);
const existingIndex = readJson(productIndexPath, []);
const existing = [...existingProducts, ...existingIndex];
const byId = new Map(existing.map((product) => [product.id, product]));
const byIdentity = new Set(existing.map((product) => normalize(`${product.brand} ${product.name}`)));

let imported = 0;
let scanned = 0;

for (const query of QUERIES) {
  if (byId.size >= TARGET_COUNT) break;

  for (let page = 1; page <= 4; page += 1) {
    if (byId.size >= TARGET_COUNT) break;

    try {
      const data = await fetchPage(query, page);
      const products = data.products || [];
      if (!products.length) break;

      for (const rawProduct of products) {
        scanned += 1;
        const product = toProduct(rawProduct);
        if (!product) continue;

        const identity = normalize(`${product.brand} ${product.name}`);
        if (byId.has(product.id) || byIdentity.has(identity)) continue;

        byId.set(product.id, product);
        byIdentity.add(identity);
        imported += 1;

        if (byId.size >= TARGET_COUNT) break;
      }
    } catch (error) {
      console.warn(`skip "${query}" page ${page}: ${error.message}`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const nextProducts = Array.from(byId.values());
writeJson(productIndexPath, nextProducts);

console.log(JSON.stringify({
  scanned,
  imported,
  total: nextProducts.length,
  target: TARGET_COUNT
}, null, 2));
