import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const fileDbPath = path.join(rootDir, "data", "app-db.json");

const DEFAULT_SETTINGS = {
  theme: "fresh",
  historyEnabled: true,
  saveSearches: true,
  saveAnalyses: true
};

let pgPool = null;

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function readFileDb() {
  try {
    return JSON.parse(fs.readFileSync(fileDbPath, "utf8"));
  } catch {
    return { users: [], settings: [], history: [] };
  }
}

function writeFileDb(db) {
  fs.mkdirSync(path.dirname(fileDbPath), { recursive: true });
  fs.writeFileSync(fileDbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function query(sql, params = []) {
  if (!pgPool) return null;
  return pgPool.query(sql, params);
}

export async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    writeFileDb(readFileDb());
    return { provider: "file", path: fileDbPath };
  }

  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  await query(`
    create table if not exists users (
      id text primary key,
      email text unique not null,
      password_hash text not null,
      name text,
      provider text not null default 'email',
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists user_settings (
      user_id text primary key references users(id) on delete cascade,
      settings jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists user_history (
      id text primary key,
      user_id text references users(id) on delete cascade,
      kind text not null,
      title text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);

  return { provider: "postgres" };
}

export async function createUser({ email, passwordHash, name = "" }) {
  const cleanEmail = normalizeEmail(email);
  const id = createId("usr");

  if (pgPool) {
    const result = await query(
      "insert into users (id, email, password_hash, name, provider) values ($1, $2, $3, $4, 'email') returning id, email, name, provider, created_at",
      [id, cleanEmail, passwordHash, name]
    );
    await query("insert into user_settings (user_id, settings) values ($1, $2)", [id, DEFAULT_SETTINGS]);
    return result.rows[0];
  }

  const db = readFileDb();
  if (db.users.some((user) => user.email === cleanEmail)) {
    const error = new Error("EMAIL_EXISTS");
    error.code = "EMAIL_EXISTS";
    throw error;
  }

  const user = {
    id,
    email: cleanEmail,
    passwordHash,
    name,
    provider: "email",
    createdAt: now()
  };

  db.users.push(user);
  db.settings.push({ userId: id, settings: DEFAULT_SETTINGS, updatedAt: now() });
  writeFileDb(db);
  return publicUser(user);
}

export async function getUserByEmail(email) {
  const cleanEmail = normalizeEmail(email);

  if (pgPool) {
    const result = await query("select * from users where email = $1", [cleanEmail]);
    return result.rows[0] || null;
  }

  return readFileDb().users.find((user) => user.email === cleanEmail) || null;
}

export async function getUserById(id) {
  if (!id) return null;

  if (pgPool) {
    const result = await query("select id, email, name, provider, created_at from users where id = $1", [id]);
    return result.rows[0] || null;
  }

  const user = readFileDb().users.find((record) => record.id === id);
  return user ? publicUser(user) : null;
}

export async function getUserSettings(userId) {
  if (!userId) {
    return { userId: "anonymous", settings: DEFAULT_SETTINGS, updatedAt: null };
  }

  if (pgPool) {
    const result = await query("select settings, updated_at from user_settings where user_id = $1", [userId]);
    const record = result.rows[0];
    return {
      userId,
      settings: { ...DEFAULT_SETTINGS, ...parseJson(record?.settings, {}) },
      updatedAt: record?.updated_at || null
    };
  }

  const record = readFileDb().settings.find((item) => item.userId === userId);
  return {
    userId,
    settings: { ...DEFAULT_SETTINGS, ...(record?.settings || {}) },
    updatedAt: record?.updatedAt || null
  };
}

export async function updateUserSettings(userId, nextSettings = {}) {
  const settings = {
    ...(await getUserSettings(userId)).settings,
    ...nextSettings
  };

  if (pgPool) {
    const result = await query(
      `insert into user_settings (user_id, settings, updated_at)
       values ($1, $2, now())
       on conflict (user_id)
       do update set settings = excluded.settings, updated_at = now()
       returning user_id, settings, updated_at`,
      [userId, settings]
    );
    const record = result.rows[0];
    return { userId: record.user_id, settings: record.settings, updatedAt: record.updated_at };
  }

  const db = readFileDb();
  const index = db.settings.findIndex((item) => item.userId === userId);
  const record = { userId, settings, updatedAt: now() };
  if (index >= 0) db.settings[index] = record;
  else db.settings.push(record);
  writeFileDb(db);
  return record;
}

export async function addUserHistory(userId, { kind, title, payload = {} }) {
  if (!userId || !kind || !title) return null;
  const record = {
    id: createId("hst"),
    userId,
    kind: String(kind).slice(0, 40),
    title: String(title).slice(0, 220),
    payload,
    createdAt: now()
  };

  if (pgPool) {
    const result = await query(
      "insert into user_history (id, user_id, kind, title, payload) values ($1, $2, $3, $4, $5) returning id, user_id, kind, title, payload, created_at",
      [record.id, userId, record.kind, record.title, record.payload]
    );
    return mapHistory(result.rows[0]);
  }

  const db = readFileDb();
  db.history.unshift(record);
  db.history = db.history.slice(0, 5000);
  writeFileDb(db);
  return record;
}

export async function listUserHistory(userId, limit = 50) {
  if (!userId) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  if (pgPool) {
    const result = await query(
      "select id, user_id, kind, title, payload, created_at from user_history where user_id = $1 order by created_at desc limit $2",
      [userId, safeLimit]
    );
    return result.rows.map(mapHistory);
  }

  return readFileDb().history
    .filter((item) => item.userId === userId)
    .slice(0, safeLimit);
}

export async function clearUserHistory(userId) {
  if (!userId) return { deleted: 0 };

  if (pgPool) {
    const result = await query("delete from user_history where user_id = $1", [userId]);
    return { deleted: result.rowCount || 0 };
  }

  const db = readFileDb();
  const before = db.history.length;
  db.history = db.history.filter((item) => item.userId !== userId);
  writeFileDb(db);
  return { deleted: before - db.history.length };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    provider: user.provider || "email",
    createdAt: user.createdAt || user.created_at || null
  };
}

function mapHistory(record) {
  return {
    id: record.id,
    userId: record.user_id || record.userId,
    kind: record.kind,
    title: record.title,
    payload: parseJson(record.payload, {}),
    createdAt: record.created_at || record.createdAt
  };
}
