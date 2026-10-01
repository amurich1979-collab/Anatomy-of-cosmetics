import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCosIngIngredient, normalizeInciKey } from "./ingredientSources/cosing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const expertPath = path.join(rootDir, "data", "ingredients-expert.json");
const translationsPath = path.join(rootDir, "data", "inci-translations.json");

const START_MARKER = /\b(?:ingredients?|ingre[dl]ients?|ngredients?|credients?|inci)\b\s*[:：-]?|состав\s*(?:\([^)]*\))?\s*[:：-]?/i;
const END_MARKER = /\b(?:directions?|how\s+to\s+use|warning|caution|storage|manufacturer|made\s+in|barcode|usage|use\s+by|best\s+before|expiry|eac|code|llc|inc\.?|ltd\.?|new\s+york|ny\s+\d{5}|ho\s+chi|minh|viet\s?nam|the\s+nexus|quan\s+\d+)\b|меры\s+предосторожности|способ\s+применения|применение|изготовитель|производитель|срок\s+годности|условия\s+хранения|дата\s+изготовления|номер\s+партии|партия|гост|еас/i;
const ADDRESS_OR_LABEL_NOISE = /\b(?:canh|bao|kha|tre|tuoi|sinh|tranh|children|external|avoid|contact|directly|manufacturer|distributor|importer|address|llc|inc\.?|ltd\.?|new\s+york|ny\s+\d{5}|ho\s+chi|minh|viet\s?nam|nexus|quan\s+\d+|tang\s+\d+|code|barcode|eac|ean)\b|предосторожности|производитель|изготовитель|адрес|импортер|штрихкод|срок|партия/i;

const OCR_REPLACEMENTS = [
  { pattern: /\bnacinamide\b/gi, replacement: "Niacinamide", confidence: 1 },
  { pattern: /\bphenoxyethanal\b/gi, replacement: "Phenoxyethanol", confidence: 1 },
  { pattern: /\bhydrogenated\s+castor\s+of\b/gi, replacement: "Hydrogenated Castor Oil", confidence: 1 },
  { pattern: /\bethyherlylglycerin\b/gi, replacement: "Ethylhexylglycerin", confidence: 1 },
  { pattern: /\bethyhexylglycerin\b/gi, replacement: "Ethylhexylglycerin", confidence: 0.98 },
  { pattern: /\bpeg\s*[-–—]?\s*40\b/gi, replacement: "PEG-40", confidence: 1 },
  { pattern: /\bcetylpalmitate\b/gi, replacement: "Cetyl Palmitate", confidence: 0.98 },
  { pattern: /\bsodium\s+laurqyl\s+lactylate\b/gi, replacement: "Sodium Lauroyl Lactylate", confidence: 0.98 },
  { pattern: /\bsodium\s+lauroyl\s+lactylate\b/gi, replacement: "Sodium Lauroyl Lactylate", confidence: 1 },
  { pattern: /\bedta\s+dipqtasronate\b/gi, replacement: "Dipotassium EDTA", confidence: 0.9 },
  { pattern: /\b(?:sodium\s+)?rimoniun\s+methosulfate\b/gi, replacement: "Behentrimonium Methosulfate", confidence: 0.85 },
  { pattern: /\bbehentrima\b/gi, replacement: "Behentrimonium Methosulfate", confidence: 0.85 },
  { pattern: /\bcopper\s+tripeptide\s+l\b/gi, replacement: "Copper Tripeptide-1", confidence: 0.98 }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const EXPERT_INDEX = new Map();
readJson(expertPath, []).forEach((item) => {
  [item.name, ...(item.aliases || [])].forEach((name) => {
    const key = normalizeInciKey(name);
    if (key && !EXPERT_INDEX.has(key)) EXPERT_INDEX.set(key, item.name);
  });
});

const TRANSLATION_INDEX = new Map();
readJson(translationsPath, []).forEach((item) => {
  Object.entries(item.translations || {}).forEach(([language, names]) => {
    names.forEach((name) => {
      const key = normalizeInciKey(name);
      if (key && !TRANSLATION_INDEX.has(key)) {
        TRANSLATION_INDEX.set(key, {
          canonical: item.canonical,
          language
        });
      }
    });
  });
});

// Offsets always refer to the original JS string (UTF-16, end exclusive).
function compact(value) {
  return value.replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim();
}

function candidateMatch(input) {
  const key = normalizeInciKey(input);
  if (EXPERT_INDEX.has(key)) return { canonical: EXPERT_INDEX.get(key), type: "exact", confidence: 1, origin: "expert" };
  const record = findCosIngIngredient(input);
  if (!record || record.match?.type === "partial") return null;
  return { canonical: record.name, type: record.match.type, confidence: record.match.confidence, origin: "cosing" };
}

function exactMatch(input) {
  const match = candidateMatch(input);
  return match && ["exact", "alias"].includes(match.type) ? match : null;
}

function labelledMatch(input) {
  const direct = exactMatch(input);
  if (direct) return direct;
  const withoutParentheses = input.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (withoutParentheses !== input) {
    const match = exactMatch(withoutParentheses);
    if (match) return { ...match, type: "alias" };
  }
  const parts = input.split("/").map(x => exactMatch(x.trim()));
  if (parts.length > 1 && parts.every(Boolean) && parts.every(x => x.canonical === parts[0].canonical)) {
    return { ...parts[0], type: "alias" };
  }
  return null;
}

function extractBlock(raw, transformations) {
  const marker = raw.match(START_MARKER);
  let start = marker ? marker.index + marker[0].length : 0;
  let end = raw.length;
  const remaining = raw.slice(start);
  const stops = [
    END_MARKER,
    /\b(?:ean|batch|lot|net\s+weight|distributor|importer|address)\b|адрес|штрихкод|тел(?:ефон)?\s*[.:]|phone|fax/i,
    /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.\w+/i,
    /\b\d{8,14}\b|\+\d[\d ()-]{7,}/,
    /\b\d+(?:[.,]\d+)?\s*(?:ml|kg|g)\b|\d+\s*(?:мл|кг|гр)\b/i
  ];
  for (const pattern of stops) {
    const found = remaining.match(pattern);
    if (found) end = Math.min(end, start + found.index);
  }
  if (start) transformations.push({ type: "remove_prefix", start: 0, end: start, original: raw.slice(0, start), replacement: "" });
  if (end < raw.length) transformations.push({ type: "remove_metadata", start: end, end: raw.length, original: raw.slice(end), replacement: "" });
  while (start < end && /\s/.test(raw[start])) start++;
  while (end > start && /\s/.test(raw[end - 1])) end--;
  return { start, end, hasMarker: Boolean(marker) };
}

export function extractInciBlock(rawText) {
  const raw = String(rawText || "");
  const block = extractBlock(raw, []);
  return raw.slice(block.start, block.end);
}

function splitTokens(raw, block, transformations) {
  const tokens = [];
  let begin = block.start;
  let depth = 0;
  function push(end, separator) {
    let start = begin;
    while (start < end && /\s/.test(raw[start])) start++;
    while (end > start && /\s/.test(raw[end - 1])) end--;
    if (end > start) tokens.push({ start, end, raw: raw.slice(start, end), separator });
  }
  for (let i = block.start; i < block.end; i++) {
    const c = raw[i];
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    const numericComma = c === "," && /\d/.test(raw[i - 1] || "") && /\d/.test(raw[i + 1] || "");
    const dot = c === "." && (i + 1 === block.end || /\s/.test(raw[i + 1]));
    if (!depth && ((c === "," && !numericComma) || c === ";" || c === "\n" || c === "\r" || dot)) {
      push(i, c);
      transformations.push({ type: "split", start: i, end: i + 1, original: c, replacement: ", " });
      begin = i + 1;
    }
  }
  push(block.end, "");
  return tokens;
}

function mergeLines(tokens, raw, transformations) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (!labelledMatch(compact(token.raw))) {
      for (let j = i + 1; j < Math.min(tokens.length, i + 5); j++) {
        const gap = raw.slice(tokens[j - 1].end, tokens[j].start);
        if (!/^[\r\n\s]+$/.test(gap)) break;
        const original = raw.slice(token.start, tokens[j].end);
        const variants = [compact(original), compact(original.replace(/-\s*[\r\n]+\s*/g, ""))];
        const joined = variants.find(value => labelledMatch(value));
        if (joined) {
          transformations.push({ type: "join_lines", start: token.start, end: tokens[j].end, original, replacement: joined });
          token = { ...token, end: tokens[j].end, raw: original, joined };
          i = j;
          break;
        }
      }
    }
    result.push(token);
  }
  return result;
}

function normalizeToken(token, transformations, autoCorrections, suggestions) {
  let value = token.joined || compact(token.raw).replace(/^[^\p{L}\d]+|[^\p{L}\d)]+$/gu, "");
  const log = (type, original, replacement, extra = {}) => transformations.push({
    type, start: token.start, end: token.end, original, replacement, ...extra
  });
  if (value !== token.raw) log("normalize_format", token.raw, value);
  if (!value || ADDRESS_OR_LABEL_NOISE.test(value) || !/\p{L}{2}/u.test(value) || /^(?:ayy|phosphate)$/i.test(value)) {
    log("reject_noise", value, "");
    return null;
  }
  if (/\b(?:complex|комплекс)\b/i.test(value)) {
    return { ...token, ingredient: value, canonicalName: null, status: "unknown", method: "undisclosed", origin: "proprietary_complex" };
  }
  let pending = null;
  const addSuggestion = (name, confidence, reason) => {
    pending = { original: value, suggested_match: name, confidence, reason, start: token.start, end: token.end };
    suggestions.push(pending);
    log("suggest", value, null, { suggested_match: name, confidence, reason });
  };
  const translation = TRANSLATION_INDEX.get(normalizeInciKey(value));
  if (translation && normalizeInciKey(value) !== normalizeInciKey(translation.canonical)) {
    const before = value;
    value = translation.canonical;
    autoCorrections.push({ original: before, corrected: value, source: "inci_translation", language: translation.language, confidence: 1 });
    log("inci_translation", before, value);
  }
  for (const rule of OCR_REPLACEMENTS) {
    const next = value.replace(rule.pattern, rule.replacement);
    if (next === value) continue;
    if (rule.confidence <= 0.95) {
      addSuggestion(next, rule.confidence, "Uncertain OCR dictionary correction");
    } else {
      autoCorrections.push({ original: value, corrected: next, confidence: rule.confidence, source: "ocr_dictionary" });
      log("ocr_dictionary", value, next);
      value = next;
    }
  }
  if (/\bbotnoyl\b/i.test(value)) addSuggestion(null, null, "Unresolved OCR or trade name; no chemical identity inferred");
  const exact = labelledMatch(value);
  const match = exact || candidateMatch(value);
  if (!pending && match && !exact) addSuggestion(match.canonical, match.confidence, "Candidate requires confirmation");
  const status = pending ? "suggested" : exact ? "confirmed" : "unknown";
  // Keep complete slash names and parenthetical label text; canonical identity is separate.
  const display = status === "confirmed" && !/[()/]/.test(value) ? exact.canonical : value;
  if (display !== value) log("canonicalize", value, display);
  if (status === "confirmed" && display !== exact.canonical) {
    log("match_alias", display, display, { canonicalName: exact.canonical });
  }
  return {
    ...token, ingredient: display, canonicalName: status === "confirmed" ? exact.canonical : null,
    status, method: pending ? "suggested" : exact?.type || "none",
    origin: match?.origin || "none", suggested_match: pending?.suggested_match || null,
    match_confidence: pending?.confidence ?? exact?.confidence ?? null
  };
}

export function cleanInciText(rawText) {
  const raw = String(rawText || "");
  const transformations = [], autoCorrections = [], suggestions = [];
  const block = extractBlock(raw, transformations);
  const tokens = mergeLines(splitTokens(raw, block, transformations), raw, transformations);
  let entries = tokens.map(token => normalizeToken(token, transformations, autoCorrections, suggestions)).filter(Boolean);
  const hasEvidence = entries.some(x => x.status !== "unknown" || x.origin === "proprietary_complex");
  if (!block.hasMarker && !hasEvidence) {
    for (const item of entries) transformations.push({ type: "reject_unanchored_text", start: item.start, end: item.end, original: item.raw, replacement: "" });
    entries = [];
  }
  const seen = new Map();
  const ingredients = [];
  entries.forEach((entry, index) => {
    entry.position = index + 1;
    const key = normalizeInciKey(entry.ingredient);
    entry.duplicateOf = seen.get(key) || null;
    if (entry.duplicateOf) {
      transformations.push({ type: "duplicate", start: entry.start, end: entry.end, original: entry.raw, replacement: null, duplicateOf: entry.duplicateOf });
    } else {
      seen.set(key, entry.position);
      ingredients.push(entry.ingredient);
    }
  });
  const recognized = entries.filter(x => x.status === "confirmed").length;
  return {
    rawText: raw, extractedBlock: raw.slice(block.start, block.end), block: { start: block.start, end: block.end },
    cleanedText: ingredients.join(", "), ingredients, entries, transformations, autoCorrections, suggestions,
    // Compatibility-only match coverage heuristic, never an OCR probability.
    confidence: entries.length ? recognized / entries.length : 0
  };
}
