import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const settingsPath = path.join(rootDir, "data", "user-settings.json");

const DEFAULT_SETTINGS = {
  theme: "fresh",
  historyEnabled: true,
  saveSearches: true,
  saveAnalyses: true
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cleanUserId(value) {
  return String(value || "anonymous")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "anonymous";
}

export function getUserSettings(userId = "anonymous") {
  const cleanId = cleanUserId(userId);
  const records = readJson(settingsPath, []);
  const existing = records.find((record) => record.userId === cleanId);

  return {
    userId: cleanId,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(existing?.settings || {})
    },
    updatedAt: existing?.updatedAt || null
  };
}

export function updateUserSettings(userId = "anonymous", nextSettings = {}) {
  const cleanId = cleanUserId(userId);
  const records = readJson(settingsPath, []);
  const index = records.findIndex((record) => record.userId === cleanId);
  const current = index >= 0 ? records[index] : { userId: cleanId, settings: DEFAULT_SETTINGS };

  const record = {
    userId: cleanId,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(current.settings || {}),
      ...nextSettings
    },
    updatedAt: new Date().toISOString()
  };

  if (index >= 0) records[index] = record;
  else records.push(record);

  writeJson(settingsPath, records.slice(-1000));
  return record;
}
