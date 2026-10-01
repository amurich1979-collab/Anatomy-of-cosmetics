import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "..", "data");
export const REGISTRY_SCHEMA_VERSION = "1.0";
export const DEFAULT_REGISTRY_PATH = path.join(dataDir, "inci-registry.json");
export const DEFAULT_LOCAL_ADDITIONS_PATH = path.join(dataDir, "inci-registry-local-additions.json");

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
const textArray = (value) => Array.isArray(value) && value.every(nonEmpty) && new Set(value.map((item) => item.trim().toLowerCase())).size === value.length;
const optionalDate = (value) => value === null || (nonEmpty(value) && !Number.isNaN(Date.parse(value)));
const key = (value) => String(value || "").trim().toLocaleLowerCase("en-US");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateSource(source, errors) {
  if (!isObject(source)) {
    errors.push("source must be an object");
    return;
  }
  if (!nonEmpty(source.id)) errors.push("source.id is required");
  if (!nonEmpty(source.type)) errors.push("source.type is required");
  if (!/^https:\/\//.test(source.url || "")) errors.push("source.url must be https");
  if (!optionalDate(source.exportedAt)) errors.push("source.exportedAt must be a date or null");
  if (!optionalDate(source.retrievedAt)) errors.push("source.retrievedAt must be a date or null");
  if (source.version !== null && !nonEmpty(source.version)) errors.push("source.version must be text or null");
  if (!/^[a-f0-9]{64}$/.test(source.sha256 || "")) errors.push("source.sha256 must be sha256");
}

function validateRecord(record, sourceId, names, errors, index) {
  const prefix = `records[${index}]`;
  if (!isObject(record)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  if (!nonEmpty(record.name)) errors.push(`${prefix}.name is required`);
  const normalized = key(record.name);
  if (names.has(normalized)) errors.push(`${prefix}.name duplicates another canonical INCI`);
  names.add(normalized);
  if (!textArray(record.aliases || [])) errors.push(`${prefix}.aliases must be unique text`);
  if (!textArray(record.functions || [])) errors.push(`${prefix}.functions must be unique text`);
  if (record.cas !== null && !nonEmpty(record.cas)) errors.push(`${prefix}.cas must be text or null`);
  if (record.restrictions !== null && !textArray(record.restrictions)) errors.push(`${prefix}.restrictions must be unique text array or null`);
  if (!isObject(record.provenance)) errors.push(`${prefix}.provenance is required`);
  else {
    if (record.provenance.sourceId !== sourceId) errors.push(`${prefix}.provenance.sourceId must reference document source`);
    if (!isObject(record.provenance.sourceRecord)) errors.push(`${prefix}.provenance.sourceRecord is required`);
    if (!isObject(record.provenance.fields)) errors.push(`${prefix}.provenance.fields is required`);
    for (const field of ["aliases", "functions", "cas", "restrictions"]) {
      if (!["source", "not_available"].includes(record.provenance.fields?.[field])) errors.push(`${prefix}.provenance.fields.${field} is invalid`);
    }
  }
}

export function validateRegistryDocument(document) {
  const errors = [];
  if (!isObject(document)) return ["registry document must be an object"];
  if (document.schemaVersion !== REGISTRY_SCHEMA_VERSION) errors.push("unsupported registry schemaVersion");
  if (!nonEmpty(document.registryVersion)) errors.push("registryVersion is required");
  validateSource(document.source, errors);
  if (!Array.isArray(document.records)) errors.push("records must be an array");
  else {
    const names = new Set();
    document.records.forEach((record, index) => validateRecord(record, document.source?.id, names, errors, index));
  }
  return errors;
}

export function validateLocalAdditionsDocument(document, registryNames = new Set()) {
  const errors = [];
  if (!isObject(document)) return ["local additions document must be an object"];
  if (document.schemaVersion !== REGISTRY_SCHEMA_VERSION) errors.push("unsupported local additions schemaVersion");
  if (!nonEmpty(document.version)) errors.push("local additions version is required");
  for (const field of ["aliases", "suggestions"]) {
    if (!Array.isArray(document[field])) {
      errors.push(`${field} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const [index, addition] of document[field].entries()) {
      const prefix = `${field}[${index}]`;
      if (!isObject(addition) || !nonEmpty(addition.alias) || !nonEmpty(addition.target)) {
        errors.push(`${prefix} requires alias and target`);
        continue;
      }
      if (seen.has(key(addition.alias))) errors.push(`${prefix}.alias duplicates a local addition`);
      seen.add(key(addition.alias));
      if (!registryNames.has(key(addition.target))) errors.push(`${prefix}.target is not a canonical imported INCI`);
      if (!isObject(addition.provenance) || !nonEmpty(addition.provenance.kind) || !nonEmpty(addition.provenance.note)
        || !optionalDate(addition.provenance.addedAt)) errors.push(`${prefix}.provenance is invalid`);
      if (!["unreviewed", "reviewed", "rejected"].includes(addition.reviewStatus)) errors.push(`${prefix}.reviewStatus is invalid`);
      if (field === "suggestions" && (typeof addition.confidence !== "number" || addition.confidence <= 0 || addition.confidence >= 1)) errors.push(`${prefix}.confidence must be between 0 and 1`);
    }
  }
  return errors;
}

function readValidated(filePath, reader, label) {
  let document;
  try {
    document = readJsonFile(filePath);
  } catch (error) {
    throw new TypeError(`Cannot read ${label}: ${error.message}`);
  }
  const errors = reader(document);
  if (errors.length) throw new TypeError(`Invalid ${label}: ${errors.join("; ")}`);
  return document;
}

export function loadInciRegistry({ registryPath = DEFAULT_REGISTRY_PATH, localAdditionsPath = DEFAULT_LOCAL_ADDITIONS_PATH } = {}) {
  const document = readValidated(registryPath, validateRegistryDocument, "INCI registry");
  const names = new Set(document.records.map((record) => key(record.name)));
  const local = readValidated(localAdditionsPath, (value) => validateLocalAdditionsDocument(value, names), "local INCI additions");
  const aliasesByTarget = new Map();
  for (const addition of local.aliases) {
    const target = key(addition.target);
    if (!aliasesByTarget.has(target)) aliasesByTarget.set(target, []);
    aliasesByTarget.get(target).push(addition);
  }
  const records = document.records.map((record) => {
    const additions = aliasesByTarget.get(key(record.name)) || [];
    return {
      ...structuredClone(record),
      importedAliases: [...record.aliases],
      localAliases: additions.map((addition) => structuredClone(addition)),
      aliases: [...new Set([...record.aliases, ...additions.map((addition) => addition.alias)])]
    };
  });
  return {
    document,
    local,
    records,
    metadata: {
      schemaVersion: document.schemaVersion,
      registryVersion: document.registryVersion,
      source: structuredClone(document.source),
      registrySha256: sha256(fs.readFileSync(registryPath)),
      localAdditionsSha256: sha256(fs.readFileSync(localAdditionsPath))
    }
  };
}

let defaultSnapshot;
export function getInciRegistrySnapshot() {
  if (!defaultSnapshot) defaultSnapshot = loadInciRegistry();
  return defaultSnapshot;
}
