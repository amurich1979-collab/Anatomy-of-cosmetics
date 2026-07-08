import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const productsPath = path.join(rootDir, "data", "products.json");
const reviewQueuePath = path.join(rootDir, "data", "review-queue.json");

const TRUST = {
  A: {
    label: "Проверено",
    note: "Состав подтвержден внутренней проверенной базой или официальным источником.",
    verified: true
  },
  B: {
    label: "По этикетке",
    note: "Состав подтвержден фото упаковки или этикетки.",
    verified: true
  },
  C: {
    label: "Совпало в источниках",
    note: "Состав совпадает в нескольких внешних источниках, но еще не прошел ручную проверку.",
    verified: false
  },
  D: {
    label: "Внешний источник",
    note: "Состав найден во внешней базе. Перед использованием лучше сверить по упаковке.",
    verified: false
  },
  E: {
    label: "Черновик",
    note: "Данные требуют проверки и не должны считаться подтвержденными.",
    verified: false
  }
};

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

function loadProducts() {
  return readJson(productsPath, []);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withTrust(product) {
  const trust = TRUST[product.trustLevel] || TRUST.E;
  return {
    ...product,
    trustLabel: product.trustLabel || trust.label,
    trustNote: product.trustNote || trust.note,
    verified: Boolean(product.verified ?? trust.verified)
  };
}

function localScore(product, query) {
  const normalizedQuery = normalize(query);
  const haystack = normalize(`${product.brand} ${product.name} ${product.category}`);

  if (!normalizedQuery) return 0;
  if (haystack.includes(normalizedQuery)) return 100;

  return normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && haystack.includes(token)).length;
}

export function searchLocalProducts(query, limit = 6) {
  return loadProducts()
    .map((product) => ({ product: withTrust(product), score: localScore(product, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, limit)
    .map(({ product }) => ({
      ...product,
      sourceType: "local"
    }));
}

export function identifyLocalProductFromText(text) {
  const normalizedText = normalize(text);
  if (normalizedText.length < 8) return null;

  const ranked = loadProducts()
    .map(withTrust)
    .map((product) => {
      const fullName = normalize(`${product.brand} ${product.name}`);
      const name = normalize(product.name);
      const brand = normalize(product.brand);
      const tokens = `${brand} ${name}`.split(" ").filter((token) => token.length > 2);
      const tokenHits = tokens.filter((token) => normalizedText.includes(token)).length;
      const exactBoost = normalizedText.includes(fullName) || normalizedText.includes(name) ? 12 : 0;
      return { product, score: tokenHits + exactBoost };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  return {
    ...ranked[0].product,
    sourceType: "local",
    confidence: Math.min(0.98, 0.45 + ranked[0].score * 0.08)
  };
}

function pickIngredients(product) {
  return (
    product.ingredients_text ||
    product.ingredients_text_en ||
    product.ingredients_text_fr ||
    product.ingredients_text_ru ||
    product.ingredients_text_with_allergens ||
    ""
  );
}

export async function searchOpenBeautyFacts(query, limit = 5) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(limit),
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://world.openbeautyfacts.org/cgi/search.pl?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AnatomyCosmetologyMVP/0.1 (local prototype)"
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.products || [])
      .map((product) => {
        const composition = pickIngredients(product);
        if (!composition) return null;

        return withTrust({
          id: `obf-${product.code || crypto.randomUUID()}`,
          name: product.product_name || "Без названия",
          brand: product.brands || "Бренд не указан",
          category: product.categories || "Косметическое средство",
          source: "Open Beauty Facts",
          sourceUrl: product.url || "https://world.openbeautyfacts.org",
          sourceType: "open_beauty_facts",
          trustLevel: "D",
          verified: false,
          composition
        });
      })
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchProducts(query, limit = 8) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];

  const local = searchLocalProducts(query, limit);
  const exactLocal = local.find((product) => {
    return (
      normalize(product.name) === normalizedQuery ||
      normalize(`${product.brand} ${product.name}`) === normalizedQuery
    );
  });

  if (exactLocal) {
    return [exactLocal];
  }

  const remaining = Math.max(0, limit - local.length);
  const external = remaining ? await searchOpenBeautyFacts(query, remaining) : [];

  return [...local, ...external];
}

export async function identifyProductFromText(text) {
  const local = identifyLocalProductFromText(text);
  if (local) return local;

  const normalizedText = normalize(text);
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 90)
    .filter((line) => !/ingredients|inci|состав|ингредиенты|directions|usage|warning|caution/i.test(line))
    .slice(0, 8);

  for (const line of lines) {
    const products = await searchProducts(line, 4);
    const exact = products.find((product) => {
      const name = normalize(product.name);
      const brandAndName = normalize(`${product.brand} ${product.name}`);
      const normalizedLine = normalize(line);
      return (
        normalizedText.includes(name) ||
        normalizedText.includes(brandAndName) ||
        name.includes(normalizedLine) ||
        brandAndName.includes(normalizedLine)
      );
    });

    if (exact) {
      return {
        ...exact,
        confidence: exact.verified ? 0.9 : 0.68
      };
    }
  }

  return null;
}

export function createReviewRequest({ query, source = "web", notes = "" }) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) {
    return null;
  }

  const queue = readJson(reviewQueuePath, []);
  const normalizedQuery = normalize(cleanQuery);
  const existing = queue.find((item) => normalize(item.query) === normalizedQuery);

  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastRequestedAt = new Date().toISOString();
    writeJson(reviewQueuePath, queue);
    return existing;
  }

  const request = {
    id: `review-${Date.now()}`,
    query: cleanQuery,
    status: "needs_review",
    source,
    notes,
    count: 1,
    createdAt: new Date().toISOString(),
    lastRequestedAt: new Date().toISOString()
  };

  queue.unshift(request);
  writeJson(reviewQueuePath, queue.slice(0, 500));
  return request;
}

export function listReviewRequests() {
  return readJson(reviewQueuePath, []);
}
