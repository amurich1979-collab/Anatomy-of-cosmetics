import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "audit", "t18", "corpus-manifest.json");
const API = "https://world.openbeautyfacts.org/api/v2/search";
const USER_AGENT = "AnatomyCosmeticsAudit/0.1 (local reproducible evaluation)";
const PAGE_COUNT = 10;
const PAGE_SIZE = 100;
const TARGET = 120;
const FINAL_TARGET = 40;
const fields = [
  "code", "product_name", "brands", "ingredients_text", "image_front_url",
  "image_ingredients_url", "images", "lang", "categories_tags", "last_modified_t"
].join(",");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function productFolder(code) {
  const padded = String(code || "").padStart(13, "0");
  if (!/^\d{13,}$/.test(padded)) return null;
  return `${padded.slice(0, 3)}/${padded.slice(3, 6)}/${padded.slice(6, 9)}/${padded.slice(9)}`;
}

function selectedImageUrl(product, prefix) {
  const explicit = product[`image_${prefix}_url`];
  if (explicit) return explicit.replace(/\.400\.jpg$/, ".full.jpg");
  const key = Object.keys(product.images || {}).sort().find((name) => name.startsWith(`${prefix}_`));
  const selected = key ? product.images[key] : null;
  const folder = productFolder(product.code);
  if (!key || !selected?.rev || !folder) return null;
  return `https://images.openbeautyfacts.org/images/products/${folder}/${key}.${selected.rev}.full.jpg`;
}

function imageMetadata(product, prefix) {
  const key = Object.keys(product.images || {}).sort().find((name) => name.startsWith(`${prefix}_`));
  const selected = key ? product.images[key] : null;
  const original = selected?.imgid ? product.images?.[String(selected.imgid)] : null;
  const full = selected?.sizes?.full || {};
  const folder = productFolder(product.code);
  return {
    key: key || null,
    width: Number(full.w) || null,
    height: Number(full.h) || null,
    url: selectedImageUrl(product, prefix),
    originalUrl: folder && selected?.imgid ? `https://images.openbeautyfacts.org/images/products/${folder}/${selected.imgid}.jpg` : null,
    originalWidth: Number(original?.sizes?.full?.w) || null,
    originalHeight: Number(original?.sizes?.full?.h) || null
  };
}

function approximateIngredientCount(value) {
  return String(value || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean).length;
}

function normalizedBrand(product) {
  return String(product.brands || "").split(",")[0].trim().toLocaleLowerCase() || `unknown:${product.code}`;
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function splitBrandGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.splitGroup;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const ordered = [...groups.entries()].sort((a, b) => hash(a[0]) - hash(b[0]) || a[0].localeCompare(b[0]));
  const final = [];
  const setup = [];
  const remaining = [];
  for (const [, group] of ordered) {
    if (final.length + group.length <= FINAL_TARGET) final.push(...group);
    else remaining.push(...group);
  }
  for (const entry of remaining) {
    if (setup.length >= TARGET - final.length) break;
    setup.push(entry);
  }
  return [
    ...setup.map((entry) => ({ ...entry, partition: "setup" })),
    ...final.map((entry) => ({ ...entry, partition: "final" }))
  ];
}

async function loadProducts() {
  const products = [];
  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    const url = new URL(API);
    url.searchParams.set("fields", fields);
    url.searchParams.set("sort_by", "last_modified_t");
    url.searchParams.set("page_size", PAGE_SIZE);
    url.searchParams.set("page", page);
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Open Beauty Facts page ${page}: HTTP ${response.status}`);
    const data = await response.json();
    products.push(...(data.products || []));
    await sleep(120);
  }
  return products;
}

const products = await loadProducts();
const deduped = new Map();
for (const product of products) {
  const ingredientImage = imageMetadata(product, "ingredients");
  const frontImage = imageMetadata(product, "front");
  const referenceText = String(product.ingredients_text || "").trim();
  if (!/^\d{8,14}$/.test(String(product.code || "")) || !referenceText || !ingredientImage.url) continue;
  const count = approximateIngredientCount(referenceText);
  const entry = {
    id: `obf-${product.code}`,
    partition: null,
    splitGroup: normalizedBrand(product),
    barcode: String(product.code),
    product: {
      name: String(product.product_name || "").trim() || null,
      brand: String(product.brands || "").trim() || null,
      language: String(product.lang || "unknown"),
      categories: Array.isArray(product.categories_tags) ? product.categories_tags : []
    },
    inputs: {
      ingredientImage,
      frontImage,
      sourceText: referenceText
    },
    source: {
      id: "open_beauty_facts",
      productUrl: `https://world.openbeautyfacts.org/product/${product.code}`,
      apiUrl: `https://world.openbeautyfacts.org/api/v2/product/${product.code}.json`,
      retrievedAt: new Date().toISOString(),
      sourceModifiedAt: Number(product.last_modified_t) ? new Date(Number(product.last_modified_t) * 1000).toISOString() : null,
      dataLicense: "ODbL",
      imageLicense: "CC BY-SA"
    },
    coverageTags: [
      "barcode",
      "ingredient_photo",
      ...(frontImage.url ? ["front_label"] : []),
      ...(product.lang && product.lang !== "en" ? ["non_english"] : []),
      ...(count >= 25 ? ["long_inci", "small_print_candidate"] : [])
    ],
    reference: {
      kind: "external_human_transcription",
      ingredientCountApprox: count,
      humanReview: {
        status: "pending",
        reviewer: null,
        reviewedAt: null,
        exactIngredients: [],
        labelType: null,
        readability: null,
        visualConditions: [],
        productClass: null,
        notes: "Must be checked against the ingredient image before inclusion in gold metrics."
      }
    }
  };
  deduped.set(entry.barcode, entry);
}

const candidates = [...deduped.values()].sort((a, b) => a.barcode.localeCompare(b.barcode));
const entries = splitBrandGroups(candidates).slice(0, TARGET);
const manifest = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  status: entries.length >= TARGET ? "candidate_target_reached" : "insufficient_candidates",
  target: TARGET,
  counts: {
    entries: entries.length,
    setup: entries.filter((entry) => entry.partition === "setup").length,
    final: entries.filter((entry) => entry.partition === "final").length,
    humanReviewed: entries.filter((entry) => entry.reference.humanReview.status === "approved").length
  },
  splitPolicy: "Brand-disjoint deterministic split. Final brands never appear in setup.",
  provenance: {
    source: "Open Beauty Facts API",
    api: API,
    query: { sortBy: "last_modified_t", pages: PAGE_COUNT, pageSize: PAGE_SIZE, fields },
    userAgent: USER_AGENT,
    dataLicense: "ODbL; attribution and share-alike apply",
    imageLicense: "CC BY-SA; attribution and share-alike apply",
    documentation: [
      "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/",
      "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/"
    ]
  },
  limitations: [
    "The external ingredients_text is a source transcription, not a project-owned human-verified gold label.",
    "Glare, curvature and small print require visual human review and are not inferred as facts from metadata.",
    "The manifest is a candidate corpus until humanReview.status is approved for individual records."
  ],
  entries
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest.counts));
if (entries.length < TARGET) process.exitCode = 2;
