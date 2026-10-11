import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnnotations, createManifest, stableHash, stableJson } from "./lib/c02-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C02 = path.join(ROOT, "audit", "c02");
const SNAPSHOT_PATH = path.join(C02, "source-snapshot.json");
const MANIFEST_PATH = path.join(C02, "corpus-manifest.json");
const ANNOTATIONS_PATH = path.join(C02, "annotations.json");
const API = "https://world.openbeautyfacts.org/api/v2/search";
const USER_AGENT = "AnatomyCosmeticsC02/1.0 (reproducible local evaluation corpus)";
const PAGE_SIZE = 100;
// The public search endpoint serves ten anonymous pages; page 11 returns HTTP 401.
// Ten pages currently provide more than the 200 records required by C02.
const PAGE_COUNT = 10;
const FIELDS = [
  "code", "product_name", "brands", "ingredients_text", "image_front_url", "image_ingredients_url",
  "images", "lang", "categories_tags", "countries_tags", "created_t", "last_modified_t"
].join(",");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function productFolder(code) {
  const padded = String(code || "").padStart(13, "0");
  return /^\d{13,}$/.test(padded) ? `${padded.slice(0, 3)}/${padded.slice(3, 6)}/${padded.slice(6, 9)}/${padded.slice(9)}` : null;
}

function imageMetadata(product, prefix) {
  const key = Object.keys(product.images || {}).sort().find((name) => name.startsWith(`${prefix}_`));
  const selected = key ? product.images[key] : null;
  const original = selected?.imgid ? product.images?.[String(selected.imgid)] : null;
  const folder = productFolder(product.code);
  const explicit = product[`image_${prefix}_url`];
  const url = explicit
    ? explicit.replace(/\.400\.jpg$/u, ".full.jpg")
    : (folder && key && selected?.rev ? `https://images.openbeautyfacts.org/images/products/${folder}/${key}.${selected.rev}.full.jpg` : null);
  return {
    key: key || null,
    url: url || null,
    width: Number(selected?.sizes?.full?.w) || null,
    height: Number(selected?.sizes?.full?.h) || null,
    originalUrl: folder && selected?.imgid ? `https://images.openbeautyfacts.org/images/products/${folder}/${selected.imgid}.jpg` : null,
    originalWidth: Number(original?.sizes?.full?.w) || null,
    originalHeight: Number(original?.sizes?.full?.h) || null
  };
}

function normalizeProduct(product) {
  const barcode = String(product.code || "").trim();
  return {
    snapshotRecordId: `open-beauty-facts:${barcode}`,
    barcode,
    name: String(product.product_name || "").trim() || null,
    brand: String(product.brands || "").trim() || null,
    language: String(product.lang || "").trim() || null,
    categories: Array.isArray(product.categories_tags) ? product.categories_tags : [],
    markets: Array.isArray(product.countries_tags) ? product.countries_tags : [],
    ingredientImage: imageMetadata(product, "ingredients"),
    frontImage: imageMetadata(product, "front"),
    sourceReportedFormulaText: String(product.ingredients_text || "").trim(),
    productUrl: `https://world.openbeautyfacts.org/product/${barcode}`,
    apiUrl: `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json`,
    sourceCreatedAt: Number(product.created_t) ? new Date(Number(product.created_t) * 1000).toISOString() : null,
    sourceModifiedAt: Number(product.last_modified_t) ? new Date(Number(product.last_modified_t) * 1000).toISOString() : null
  };
}

async function refreshSnapshot() {
  const products = new Map();
  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    const url = new URL(API);
    url.searchParams.set("fields", FIELDS);
    url.searchParams.set("sort_by", "last_modified_t");
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Open Beauty Facts page ${page}: HTTP ${response.status}`);
    const data = await response.json();
    for (const raw of data.products || []) {
      const product = normalizeProduct(raw);
      if (!/^\d{8,14}$/.test(product.barcode) || !product.ingredientImage.url || !product.sourceReportedFormulaText) continue;
      products.set(product.barcode, product);
    }
    process.stdout.write(`C02 source page ${page}/${PAGE_COUNT}: ${products.size} eligible\n`);
    await sleep(120);
  }
  const normalized = [...products.values()].sort((a, b) => a.barcode.localeCompare(b.barcode));
  const retrievedAt = new Date().toISOString();
  const snapshotCore = {
    schemaVersion: "1.0",
    source: "Open Beauty Facts API",
    retrievedAt,
    query: { api: API, sortBy: "last_modified_t", pageSize: PAGE_SIZE, pageCount: PAGE_COUNT, fields: FIELDS },
    userAgent: USER_AGENT,
    products: normalized
  };
  const snapshot = { ...snapshotCore, contentHash: stableHash(snapshotCore) };
  fs.writeFileSync(SNAPSHOT_PATH, stableJson(snapshot), "utf8");
  return snapshot;
}

fs.mkdirSync(C02, { recursive: true });
const refresh = process.argv.includes("--refresh");
if (refresh) await refreshSnapshot();
if (!fs.existsSync(SNAPSHOT_PATH)) throw new Error("Missing audit/c02/source-snapshot.json. Run npm run refresh:c02 once to freeze source candidates.");

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
const expectedHash = stableHash({
  schemaVersion: snapshot.schemaVersion,
  source: snapshot.source,
  retrievedAt: snapshot.retrievedAt,
  query: snapshot.query,
  userAgent: snapshot.userAgent,
  products: snapshot.products
});
if (snapshot.contentHash !== expectedHash) throw new Error("C02 source snapshot hash mismatch; refresh or restore the snapshot.");

const manifest = createManifest(snapshot);
const previousAnnotations = fs.existsSync(ANNOTATIONS_PATH) ? JSON.parse(fs.readFileSync(ANNOTATIONS_PATH, "utf8")) : null;
const annotations = createAnnotations(manifest, previousAnnotations);
fs.writeFileSync(MANIFEST_PATH, stableJson(manifest), "utf8");
fs.writeFileSync(ANNOTATIONS_PATH, stableJson(annotations), "utf8");
console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, snapshotHash: manifest.sourceSnapshotHash }, null, 2));
if (manifest.counts.products < manifest.targets.products) process.exitCode = 2;
