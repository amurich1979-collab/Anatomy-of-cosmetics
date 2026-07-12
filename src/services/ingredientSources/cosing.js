import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "..", "..", "..", "data", "inci-registry.json");

const OCR_REPLACEMENTS = [
  [/phenoxyethanal/gi, "phenoxyethanol"],
  [/\bnacinamide\b/gi, "niacinamide"],
  [/hydrogenated castor of\b/gi, "hydrogenated castor oil"],
  [/\bpeg\s*40\b/gi, "peg-40"],
  [/\bcopper\s+tripeptide\s+l\b/gi, "copper tripeptide-1"],
  [/\bgreen\s+tea\s+leaf\s+extract\b/gi, "camellia sinensis leaf extract"]
];

const MANUAL_ALIASES = new Map([
  ["water", "aqua"],
  ["fragrance", "parfum"],
  ["mineral oil", "paraffinum liquidum"],
  ["beeswax", "cera alba"],
  ["green tea leaf extract", "camellia sinensis leaf extract"],
  ["camellia sinensis green tea leaf extract", "camellia sinensis leaf extract"]
]);

const SUGGESTED_ALIASES = new Map([
  ["hamamelis virginiana extract", { target: "hamamelis virginiana bark/leaf extract", confidence: 0.88 }]
]);

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function normalizeInciKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[|]/g, "i")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^\p{L}\p{N}+/\-.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInciText(value) {
  return OCR_REPLACEMENTS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, String(value || ""))
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIndex(registry) {
  const byKey = new Map();
  const searchable = [];

  registry.forEach((record) => {
    const names = [record.name, ...(record.aliases || [])].filter(Boolean);
    names.forEach((name) => {
      const key = normalizeInciKey(name);
      if (key && !byKey.has(key)) byKey.set(key, record);
    });
  });

  MANUAL_ALIASES.forEach((target, alias) => {
    const record = byKey.get(normalizeInciKey(target));
    if (record) byKey.set(normalizeInciKey(alias), record);
  });

  byKey.forEach((record, key) => {
    if (key.length >= 4) searchable.push({ key, record });
  });

  return { byKey, searchable };
}

const REGISTRY = readRegistry();
const INDEX = buildIndex(REGISTRY);

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function similarity(a, b) {
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

function fuzzyFind(key) {
  if (key.length < 5) return null;

  const first = key[0];
  const length = key.length;
  let best = null;

  for (const candidate of INDEX.searchable) {
    if (candidate.key[0] !== first) continue;
    if (Math.abs(candidate.key.length - length) > Math.max(3, Math.round(length * 0.22))) continue;

    const confidence = similarity(key, candidate.key);
    if (confidence < 0.86) continue;
    if (!best || confidence > best.confidence) {
      best = { record: candidate.record, confidence, matchedKey: candidate.key };
    }
  }

  return best;
}

function toSourceRecord(record, match) {
  return {
    name: record.name,
    aliases: record.aliases || [],
    functions: record.functions || [],
    source: "CosIng",
    sourceFile: "data/inci-registry.json",
    match
  };
}

export function findCosIngIngredient(raw) {
  const normalizedText = normalizeInciText(raw);
  const key = normalizeInciKey(normalizedText);
  const aliasKey = MANUAL_ALIASES.get(key) || key;

  const exact = INDEX.byKey.get(aliasKey);
  if (exact) {
    return toSourceRecord(exact, {
      type: key === aliasKey ? "exact" : "alias",
      input: raw,
      normalized: aliasKey,
      confidence: 1
    });
  }

  const suggestedAlias = SUGGESTED_ALIASES.get(aliasKey);
  if (suggestedAlias) {
    const suggestedRecord = INDEX.byKey.get(suggestedAlias.target);
    if (suggestedRecord) {
      return toSourceRecord(suggestedRecord, {
        type: "suggested",
        input: raw,
        normalized: aliasKey,
        suggested_match: suggestedRecord.name,
        matchedKey: suggestedAlias.target,
        confidence: suggestedAlias.confidence
      });
    }
  }

  const slashParts = aliasKey.split("/").map((part) => part.trim()).filter((part) => part.length >= 4);
  for (const part of slashParts) {
    const partRecord = INDEX.byKey.get(part);
    if (partRecord) {
      return toSourceRecord(partRecord, {
        type: "partial",
        input: raw,
        normalized: part,
        confidence: 0.96
      });
    }
  }

  const fuzzy = fuzzyFind(aliasKey);
  if (fuzzy) {
    return toSourceRecord(fuzzy.record, {
      type: "fuzzy",
      input: raw,
      normalized: aliasKey,
      suggested_match: fuzzy.record.name,
      matchedKey: fuzzy.matchedKey,
      confidence: Number(fuzzy.confidence.toFixed(3))
    });
  }

  return null;
}

export function registrySize() {
  return REGISTRY.length;
}
