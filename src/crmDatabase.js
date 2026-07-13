import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabasePool } from "./database.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const filePath = path.join(rootDir, "data", "crm-db.json");
const migrationPath = path.join(rootDir, "migrations", "001_crm.sql");

const COLLECTIONS = [
  "clients", "access", "anamneses", "medicalConditions", "contraindications", "procedures", "visits",
  "products", "productUsages", "injectionPoints", "recommendationTemplates", "recommendations",
  "calendarEvents", "photos", "consents", "documents", "invitations", "auditLogs"
];

const FACE_MAPS = [
  { id: "map_front", workspaceId: "default", name: "Лицо спереди", viewType: "front", imagePath: "/assets/face-maps/front.svg" },
  { id: "map_left", workspaceId: "default", name: "Левый профиль", viewType: "left", imagePath: "/assets/face-maps/profile-left.svg" },
  { id: "map_right", workspaceId: "default", name: "Правый профиль", viewType: "right", imagePath: "/assets/face-maps/profile-right.svg" },
  { id: "map_neck", workspaceId: "default", name: "Шея и декольте", viewType: "neck", imagePath: "/assets/face-maps/neck.svg" },
  { id: "map_lips", workspaceId: "default", name: "Губы", viewType: "lips", imagePath: "/assets/face-maps/lips.svg" }
];

let pool = null;

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function timestamp() {
  return new Date().toISOString();
}

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const shaped = Object.fromEntries(COLLECTIONS.map((key) => [key, Array.isArray(parsed[key]) ? parsed[key] : []]));
    shaped.faceMaps = Array.isArray(parsed.faceMaps) && parsed.faceMaps.length ? parsed.faceMaps : FACE_MAPS;
    return shaped;
  } catch {
    return { ...Object.fromEntries(COLLECTIONS.map((key) => [key, []])), faceMaps: FACE_MAPS };
  }
}

function writeFile(db) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function workspaceOf(user) {
  return user?.workspace_id || user?.workspaceId || "default";
}

function camelRow(row) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = value;
  }
  return out;
}

function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function initCrmDatabase() {
  pool = getDatabasePool();
  if (!pool) {
    writeFile(readFile());
    return { provider: "file", migration: "001_crm" };
  }
  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const existing = await pool.query("select name from schema_migrations where name = $1", ["001_crm"]);
  if (!existing.rowCount) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(fs.readFileSync(migrationPath, "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", ["001_crm"]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  return { provider: "postgres", migration: "001_crm" };
}

export async function audit(user, { clientId = null, action, entityType, entityId = null, changes = {}, req = null }) {
  const record = {
    id: id("audit"), workspaceId: workspaceOf(user), actorId: user?.id || null, clientId,
    action, entityType, entityId, changes, ipAddress: req?.ip || null,
    userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 500), createdAt: timestamp()
  };
  if (pool) {
    await pool.query(
      `insert into audit_logs (id, workspace_id, actor_id, client_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [record.id, record.workspaceId, record.actorId, record.clientId, action, entityType, entityId, changes,
        record.ipAddress, record.userAgent, record.createdAt]
    );
  } else {
    const db = readFile(); db.auditLogs.push(record); writeFile(db);
  }
  return record;
}

export async function listClients(user, filters = {}) {
  const workspaceId = workspaceOf(user);
  if (pool) {
    const values = [workspaceId];
    const clauses = ["c.workspace_id = $1", "c.archived_at is null"];
    if (filters.q) {
      values.push(`%${String(filters.q).trim()}%`);
      clauses.push(`(c.full_name ilike $${values.length} or c.phone ilike $${values.length} or c.email ilike $${values.length})`);
    }
    if (filters.letter) { values.push(`${String(filters.letter).toUpperCase()}%`); clauses.push(`upper(c.full_name) like $${values.length}`); }
    if (filters.noVisits === "true") clauses.push("not exists (select 1 from visits v where v.client_id=c.id and v.archived_at is null)");
    if (filters.hasContraindications === "true") clauses.push("exists (select 1 from contraindications x where x.client_id=c.id and x.archived_at is null and (x.ends_on is null or x.ends_on >= current_date))");
    if (filters.followUp === "true") clauses.push("exists (select 1 from visits v where v.client_id=c.id and v.archived_at is null and v.status='follow_up_required')");
    const result = await pool.query(
      `select c.*,
       (select max(v.scheduled_at) from visits v where v.client_id=c.id and v.archived_at is null and v.status='completed') last_visit_at,
       (select min(v.scheduled_at) from visits v where v.client_id=c.id and v.archived_at is null and v.scheduled_at >= now() and v.status in ('planned','postponed','follow_up_required')) next_visit_at,
       exists(select 1 from contraindications x where x.client_id=c.id and x.archived_at is null and x.importance in ('high','critical') and (x.ends_on is null or x.ends_on >= current_date)) has_warning
       from client_profiles c where ${clauses.join(" and ")} order by c.full_name collate \"C\"`, values
    );
    return result.rows.map(camelRow);
  }
  const db = readFile();
  let clients = db.clients.filter((c) => c.workspaceId === workspaceId && !c.archivedAt);
  const q = String(filters.q || "").toLocaleLowerCase("ru");
  if (q) clients = clients.filter((c) => [c.fullName, c.phone, c.email].some((v) => String(v || "").toLocaleLowerCase("ru").includes(q)));
  if (filters.letter) clients = clients.filter((c) => c.fullName.toLocaleUpperCase("ru").startsWith(String(filters.letter).toLocaleUpperCase("ru")));
  if (filters.noVisits === "true") clients = clients.filter((c) => !db.visits.some((v) => v.clientId === c.id && !v.archivedAt));
  if (filters.hasContraindications === "true") clients = clients.filter((c) => db.contraindications.some((x) => x.clientId === c.id && !x.archivedAt));
  if (filters.followUp === "true") clients = clients.filter((c) => db.visits.some((v) => v.clientId === c.id && v.status === "follow_up_required" && !v.archivedAt));
  return clients.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")).map((c) => summarizeFileClient(c, db));
}

function summarizeFileClient(client, db) {
  const visits = db.visits.filter((v) => v.clientId === client.id && !v.archivedAt);
  const completed = visits.filter((v) => v.status === "completed").sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)));
  const upcoming = visits.filter((v) => ["planned", "postponed", "follow_up_required"].includes(v.status) && new Date(v.scheduledAt) >= new Date()).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  return { ...client, lastVisitAt: completed[0]?.scheduledAt || null, nextVisitAt: upcoming[0]?.scheduledAt || null,
    hasWarning: db.contraindications.some((x) => x.clientId === client.id && ["high", "critical"].includes(x.importance) && !x.archivedAt) };
}

export async function createClient(user, input, req) {
  const record = {
    id: id("client"), workspaceId: workspaceOf(user), fullName: String(input.fullName || "").trim(),
    birthDate: input.birthDate || null, phone: String(input.phone || "").trim() || null,
    email: String(input.email || "").trim().toLowerCase() || null, avatarUrl: input.avatarUrl || null,
    internalNote: String(input.internalNote || "").trim() || null, createdBy: user.id, createdAt: timestamp(), updatedAt: timestamp()
  };
  if (!record.fullName) throw Object.assign(new Error("Укажите ФИО клиента."), { status: 400 });
  if (pool) {
    const result = await pool.query(
      `insert into client_profiles (id, workspace_id, full_name, birth_date, phone, email, avatar_url, internal_note, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [record.id, record.workspaceId, record.fullName, record.birthDate, record.phone, record.email, record.avatarUrl, record.internalNote, record.createdBy, record.createdAt, record.updatedAt]
    );
    await audit(user, { clientId: record.id, action: "create", entityType: "client", entityId: record.id, changes: { after: record }, req });
    return camelRow(result.rows[0]);
  }
  const db = readFile(); db.clients.push(record); writeFile(db);
  await audit(user, { clientId: record.id, action: "create", entityType: "client", entityId: record.id, changes: { after: record }, req });
  return record;
}

export async function getClient(user, clientId) {
  if (!user) return null;
  const workspaceId = workspaceOf(user);
  if (pool) {
    const values = [clientId];
    let access = "c.id=$1 and c.archived_at is null";
    if (user.role === "client") access += " and (c.user_id=$2 or exists(select 1 from client_access a where a.client_id=c.id and a.user_id=$2))", values.push(user.id);
    else access += ` and c.workspace_id=$2`, values.push(workspaceId);
    const result = await pool.query(`select c.* from client_profiles c where ${access}`, values);
    return camelRow(result.rows[0]);
  }
  const db = readFile();
  const client = db.clients.find((c) => c.id === clientId && !c.archivedAt);
  if (!client) return null;
  if (user.role === "client") return (client.userId === user.id || db.access.some((a) => a.clientId === client.id && a.userId === user.id)) ? client : null;
  return client.workspaceId === workspaceId ? client : null;
}

export async function getOwnClient(user) {
  if (!user) return null;
  if (pool) {
    const result = await pool.query(`select c.* from client_profiles c left join client_access a on a.client_id=c.id where c.archived_at is null and (c.user_id=$1 or a.user_id=$1) limit 1`, [user.id]);
    return camelRow(result.rows[0]);
  }
  const db = readFile();
  return db.clients.find((c) => !c.archivedAt && (c.userId === user.id || db.access.some((a) => a.clientId === c.id && a.userId === user.id))) || null;
}

export async function updateClient(user, clientId, input, req) {
  const current = await getClient(user, clientId);
  if (!current) return null;
  const allowed = cleanObject(input);
  const next = { ...current,
    fullName: allowed.fullName === undefined ? current.fullName : String(allowed.fullName).trim(),
    birthDate: allowed.birthDate === undefined ? current.birthDate : allowed.birthDate || null,
    phone: allowed.phone === undefined ? current.phone : String(allowed.phone || "").trim() || null,
    email: allowed.email === undefined ? current.email : String(allowed.email || "").trim().toLowerCase() || null,
    avatarUrl: allowed.avatarUrl === undefined ? current.avatarUrl : allowed.avatarUrl || null,
    internalNote: allowed.internalNote === undefined ? current.internalNote : String(allowed.internalNote || "").trim() || null,
    updatedAt: timestamp()
  };
  if (!next.fullName) throw Object.assign(new Error("Укажите ФИО клиента."), { status: 400 });
  if (pool) {
    const result = await pool.query(`update client_profiles set full_name=$2,birth_date=$3,phone=$4,email=$5,avatar_url=$6,internal_note=$7,updated_at=$8 where id=$1 returning *`,
      [clientId, next.fullName, next.birthDate, next.phone, next.email, next.avatarUrl, next.internalNote, next.updatedAt]);
    await audit(user, { clientId, action: "update", entityType: "client", entityId: clientId, changes: { before: current, after: next }, req });
    return camelRow(result.rows[0]);
  }
  const db = readFile(); Object.assign(db.clients.find((c) => c.id === clientId), next); writeFile(db);
  await audit(user, { clientId, action: "update", entityType: "client", entityId: clientId, changes: { before: current, after: next }, req });
  return next;
}

export async function getAnamnesis(clientId) {
  if (pool) {
    const result = await pool.query("select * from anamneses where client_id=$1", [clientId]);
    const row = result.rows[0];
    return row ? { clientId: row.client_id, ...row.data, confirmedAt: row.confirmed_at, confirmationRequestedAt: row.confirmation_requested_at, updatedAt: row.updated_at } : { clientId, data: {}, updatedAt: null };
  }
  return readFile().anamneses.find((a) => a.clientId === clientId) || { clientId, data: {}, updatedAt: null };
}

export async function saveAnamnesis(user, clientId, input, req) {
  const previous = await getAnamnesis(clientId);
  const data = cleanObject(input.data || input);
  delete data.clientId; delete data.updatedAt; delete data.confirmedAt; delete data.confirmationRequestedAt;
  const record = { clientId, data, confirmedAt: input.confirmedAt || previous.confirmedAt || null,
    confirmationRequestedAt: input.requestConfirmation ? timestamp() : previous.confirmationRequestedAt || null,
    updatedBy: user.id, updatedAt: timestamp() };
  if (pool) {
    await pool.query(`insert into anamneses (client_id,data,confirmed_at,confirmation_requested_at,updated_by,updated_at) values ($1,$2,$3,$4,$5,$6)
      on conflict(client_id) do update set data=excluded.data,confirmed_at=excluded.confirmed_at,confirmation_requested_at=excluded.confirmation_requested_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      [clientId, data, record.confirmedAt, record.confirmationRequestedAt, user.id, record.updatedAt]);
  } else {
    const db = readFile(); const index = db.anamneses.findIndex((a) => a.clientId === clientId);
    if (index >= 0) db.anamneses[index] = record; else db.anamneses.push(record); writeFile(db);
  }
  await audit(user, { clientId, action: "update", entityType: "anamnesis", entityId: clientId, changes: { before: previous, after: record }, req });
  return record;
}

const RESOURCE_CONFIG = {
  contraindications: { collection: "contraindications", prefix: "contra", core: ["title", "kind", "importance", "startsOn", "endsOn", "recheckOn"] },
  visits: { collection: "visits", prefix: "visit", core: ["scheduledAt", "status", "procedureName", "clientVisible"] },
  recommendations: { collection: "recommendations", prefix: "rec", core: ["visitId", "category", "body", "clientVisible", "publishedAt", "acknowledgedAt", "expiresAt"] },
  calendarEvents: { collection: "calendarEvents", prefix: "event", core: ["visitId", "eventType", "title", "startsAt", "rangeEnd", "status", "clientVisible"] },
  injectionPoints: { collection: "injectionPoints", prefix: "point", core: ["faceMapId", "visitId", "x", "y", "clientVisible"] },
  productUsages: { collection: "productUsages", prefix: "usage", core: ["visitId", "productId", "clientVisible"] },
  photos: { collection: "photos", prefix: "photo", core: ["visitId", "storageKey", "category", "clientVisible", "storageConsent", "publicationConsent"] },
  consents: { collection: "consents", prefix: "consent", core: ["consentType", "version", "status", "confirmedAt", "clientVisible"] },
  documents: { collection: "documents", prefix: "document", core: ["documentType", "version", "status", "storageKey", "clientVisible"] }
};

const SQL_TABLES = { contraindications: "contraindications", visits: "visits", recommendations: "recommendations", calendarEvents: "calendar_events",
  injectionPoints: "injection_points", productUsages: "product_usages", photos: "client_photos", consents: "consents", documents: "documents" };

export async function listRecords(user, clientId, type, { clientView = false } = {}) {
  const config = RESOURCE_CONFIG[type]; if (!config) throw new Error("Unknown resource");
  if (pool) {
    const visibility = clientView && type !== "contraindications" ? " and client_visible=true" : "";
    const result = await pool.query(`select * from ${SQL_TABLES[type]} where client_id=$1 and archived_at is null${visibility} order by created_at desc`, [clientId]);
    return result.rows.map((row) => ({ ...camelRow(row), ...(row.data || {}) }));
  }
  return readFile()[config.collection].filter((r) => r.clientId === clientId && !r.archivedAt && (!clientView || type === "contraindications" || r.clientVisible));
}

function pgColumns(type, record) {
  const maps = {
    contraindications: ["title", "kind", "importance", "starts_on", "ends_on", "recheck_on"],
    visits: ["scheduled_at", "status", "procedure_name", "client_visible"],
    recommendations: ["visit_id", "category", "body", "client_visible", "published_at", "acknowledged_at", "expires_at"],
    calendarEvents: ["visit_id", "event_type", "title", "starts_at", "range_end", "status", "client_visible"],
    injectionPoints: ["face_map_id", "visit_id", "x", "y", "client_visible"],
    productUsages: ["visit_id", "product_id", "client_visible"],
    photos: ["visit_id", "storage_key", "category", "client_visible", "storage_consent", "publication_consent"],
    consents: ["consent_type", "version", "status", "confirmed_at", "client_visible"],
    documents: ["document_type", "version", "status", "storage_key", "client_visible"]
  };
  const keys = RESOURCE_CONFIG[type].core;
  return { columns: maps[type], values: keys.map((key) => record[key] ?? null) };
}

export async function createRecord(user, clientId, type, input, req) {
  const config = RESOURCE_CONFIG[type]; if (!config) throw new Error("Unknown resource");
  const core = Object.fromEntries(config.core.map((key) => [key, input[key] ?? null]));
  if (type === "injectionPoints" && (!(Number(input.x) >= 0 && Number(input.x) <= 100) || !(Number(input.y) >= 0 && Number(input.y) <= 100))) {
    throw Object.assign(new Error("Координаты должны быть в диапазоне от 0 до 100."), { status: 400 });
  }
  if (type === "visits" && !input.scheduledAt) throw Object.assign(new Error("Укажите дату и время визита."), { status: 400 });
  if (type === "contraindications" && !input.title) throw Object.assign(new Error("Укажите название противопоказания."), { status: 400 });
  if (type === "recommendations" && (!input.category || !String(input.body || "").trim())) throw Object.assign(new Error("Укажите категорию и текст рекомендации."), { status: 400 });
  if (type === "calendarEvents" && !String(input.title || "").trim()) throw Object.assign(new Error("Укажите название события."), { status: 400 });
  if (type === "injectionPoints" && !input.faceMapId) throw Object.assign(new Error("Выберите схему лица."), { status: 400 });
  if (type === "productUsages" && !input.visitId) throw Object.assign(new Error("Свяжите препарат с визитом."), { status: 400 });
  if (type === "photos" && !input.storageConsent) throw Object.assign(new Error("Для сохранения фотографии необходимо согласие на хранение."), { status: 400 });
  const data = Object.fromEntries(Object.entries(cleanObject(input)).filter(([key]) => !config.core.includes(key) && key !== "id"));
  const record = { id: id(config.prefix), clientId, workspaceId: workspaceOf(user), ...core, ...data, data,
    createdBy: user.id, createdAt: timestamp(), updatedAt: timestamp(), archivedAt: null };
  if (pool) {
    const { columns, values } = pgColumns(type, record);
    const allColumns = ["id", "client_id", "workspace_id", ...columns, "data", "created_by", "created_at", "updated_at"];
    const allValues = [record.id, clientId, record.workspaceId, ...values, data, user.id, record.createdAt, record.updatedAt];
    const placeholders = allValues.map((_v, i) => `$${i + 1}`).join(",");
    const result = await pool.query(`insert into ${SQL_TABLES[type]} (${allColumns.join(",")}) values (${placeholders}) returning *`, allValues);
    await audit(user, { clientId, action: "create", entityType: type, entityId: record.id, changes: { after: record }, req });
    return { ...camelRow(result.rows[0]), ...(result.rows[0].data || {}) };
  }
  const db = readFile(); db[config.collection].push(record); writeFile(db);
  await audit(user, { clientId, action: "create", entityType: type, entityId: record.id, changes: { after: record }, req });
  return record;
}

export async function updateRecord(user, clientId, type, recordId, input, req) {
  const config = RESOURCE_CONFIG[type]; if (!config) throw new Error("Unknown resource");
  const existing = (await listRecords(user, clientId, type)).find((r) => r.id === recordId);
  if (!existing) return null;
  const next = { ...existing, ...cleanObject(input), id: recordId, clientId, updatedAt: timestamp() };
  const data = Object.fromEntries(Object.entries(next).filter(([key]) => ![...config.core, "id", "clientId", "workspaceId", "createdBy", "createdAt", "updatedAt", "archivedAt", "data"].includes(key)));
  next.data = data;
  if (pool) {
    const { columns, values } = pgColumns(type, next);
    const sets = columns.map((column, index) => `${column}=$${index + 3}`);
    const result = await pool.query(`update ${SQL_TABLES[type]} set ${sets.join(",")},data=$${values.length + 3},updated_at=now() where id=$1 and client_id=$2 and archived_at is null returning *`,
      [recordId, clientId, ...values, data]);
    await audit(user, { clientId, action: "update", entityType: type, entityId: recordId, changes: { before: existing, after: next }, req });
    return result.rows[0] ? { ...camelRow(result.rows[0]), ...(result.rows[0].data || {}) } : null;
  }
  const db = readFile(); const index = db[config.collection].findIndex((r) => r.id === recordId && r.clientId === clientId);
  if (index < 0) return null; db[config.collection][index] = next; writeFile(db);
  await audit(user, { clientId, action: "update", entityType: type, entityId: recordId, changes: { before: existing, after: next }, req });
  return next;
}

export async function archiveRecord(user, clientId, type, recordId, req) {
  const config = RESOURCE_CONFIG[type]; if (!config) throw new Error("Unknown resource");
  if (pool) {
    const result = await pool.query(`update ${SQL_TABLES[type]} set archived_at=now() where id=$1 and client_id=$2 and archived_at is null returning id`, [recordId, clientId]);
    if (!result.rowCount) return false;
  } else {
    const db = readFile(); const record = db[config.collection].find((r) => r.id === recordId && r.clientId === clientId && !r.archivedAt);
    if (!record) return false; record.archivedAt = timestamp(); writeFile(db);
  }
  await audit(user, { clientId, action: "archive", entityType: type, entityId: recordId, req });
  return true;
}

export async function listFaceMaps(user) {
  const workspaceId = workspaceOf(user);
  if (pool) {
    const result = await pool.query("select * from face_maps where active=true and workspace_id in ('default',$1) order by name", [workspaceId]);
    return result.rows.map(camelRow);
  }
  return readFile().faceMaps.filter((m) => m.workspaceId === "default" || m.workspaceId === workspaceId);
}

export async function listAudit(user, clientId) {
  if (pool) {
    const result = await pool.query("select * from audit_logs where client_id=$1 and workspace_id=$2 order by created_at desc limit 200", [clientId, workspaceOf(user)]);
    return result.rows.map(camelRow);
  }
  return readFile().auditLogs.filter((r) => r.clientId === clientId && r.workspaceId === workspaceOf(user)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
}

export async function listCatalog(user, type) {
  const workspaceId = workspaceOf(user);
  const configs = {
    products: { table: "products", collection: "products" },
    recommendationTemplates: { table: "recommendation_templates", collection: "recommendationTemplates" },
    procedures: { table: "procedures", collection: "procedures" }
  };
  const config = configs[type]; if (!config) throw new Error("Unknown catalog");
  if (pool) {
    const result = await pool.query(`select * from ${config.table} where workspace_id=$1 and archived_at is null order by ${type === "recommendationTemplates" ? "title" : "name"}`, [workspaceId]);
    return result.rows.map((row) => ({ ...camelRow(row), ...(row.data || {}) }));
  }
  return readFile()[config.collection].filter((item) => item.workspaceId === workspaceId && !item.archivedAt);
}

export async function createCatalogRecord(user, type, input, req) {
  const workspaceId = workspaceOf(user); const createdAt = timestamp();
  let record;
  if (type === "products") {
    record = { id: id("product"), workspaceId, name: String(input.name || "").trim(), category: input.category || null,
      manufacturer: input.manufacturer || null, unit: input.unit || null, standardVolume: input.standardVolume || null,
      description: input.description || null, createdAt };
    if (!record.name) throw Object.assign(new Error("Укажите название препарата."), { status: 400 });
    if (pool) await pool.query(`insert into products (id,workspace_id,name,category,manufacturer,unit,standard_volume,description,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [record.id,workspaceId,record.name,record.category,record.manufacturer,record.unit,record.standardVolume,record.description,createdAt]);
  } else if (type === "recommendationTemplates") {
    record = { id: id("rectpl"), workspaceId, title: String(input.title || "").trim(), category: input.category || "после процедуры", body: String(input.body || "").trim(), createdBy: user.id, createdAt };
    if (!record.title || !record.body) throw Object.assign(new Error("Укажите название и текст шаблона."), { status: 400 });
    if (pool) await pool.query(`insert into recommendation_templates (id,workspace_id,title,category,body,created_by,created_at) values ($1,$2,$3,$4,$5,$6,$7)`,
      [record.id,workspaceId,record.title,record.category,record.body,user.id,createdAt]);
  } else if (type === "procedures") {
    record = { id: id("procedure"), workspaceId, name: String(input.name || "").trim(), category: input.category || null, data: cleanObject(input.data || {}), createdAt };
    if (!record.name) throw Object.assign(new Error("Укажите название процедуры."), { status: 400 });
    if (pool) await pool.query(`insert into procedures (id,workspace_id,name,category,data,created_at) values ($1,$2,$3,$4,$5,$6)`, [record.id,workspaceId,record.name,record.category,record.data,createdAt]);
  } else throw new Error("Unknown catalog");
  if (!pool) { const db=readFile(); db[type === "recommendationTemplates" ? "recommendationTemplates" : type].push(record); writeFile(db); }
  await audit(user, { action:"create", entityType:type, entityId:record.id, changes:{ after:record }, req });
  return record;
}

export async function listWorkspaceCalendar(user) {
  const workspaceId = workspaceOf(user);
  if (pool) {
    const [events, visits] = await Promise.all([
      pool.query(`select e.*,c.full_name from calendar_events e join client_profiles c on c.id=e.client_id where e.workspace_id=$1 and e.archived_at is null order by e.starts_at`, [workspaceId]),
      pool.query(`select v.*,c.full_name from visits v join client_profiles c on c.id=v.client_id where v.workspace_id=$1 and v.archived_at is null and v.status<>'draft' order by v.scheduled_at`, [workspaceId])
    ]);
    return [...events.rows.map((r)=>({ ...camelRow(r), source:"event" })), ...visits.rows.map((r)=>({ ...camelRow(r), startsAt:r.scheduled_at, title:r.procedure_name || "Визит", eventType:"визит", source:"visit" }))].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
  }
  const db=readFile(); const names=new Map(db.clients.map(c=>[c.id,c.fullName]));
  return [...db.calendarEvents.filter(r=>r.workspaceId===workspaceId&&!r.archivedAt).map(r=>({...r,fullName:names.get(r.clientId),source:"event"})),
    ...db.visits.filter(r=>r.workspaceId===workspaceId&&!r.archivedAt&&r.status!=="draft").map(r=>({...r,startsAt:r.scheduledAt,title:r.procedureName||"Визит",eventType:"визит",fullName:names.get(r.clientId),source:"visit"}))].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
}

export async function createInvitation(user, clientId, destination, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = { id: id("invite"), clientId, workspaceId: workspaceOf(user), tokenHash, destination: String(destination || "").trim(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), usedAt: null, createdBy: user.id, createdAt: timestamp() };
  if (pool) await pool.query(`insert into invitations (id,client_id,workspace_id,token_hash,destination,expires_at,created_by,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [record.id, clientId, record.workspaceId, tokenHash, record.destination, record.expiresAt, user.id, record.createdAt]);
  else { const db = readFile(); db.invitations.push(record); writeFile(db); }
  await audit(user, { clientId, action: "invite", entityType: "invitation", entityId: record.id, changes: { destination: record.destination, expiresAt: record.expiresAt }, req });
  return { token, expiresAt: record.expiresAt };
}

export async function redeemInvitation(user, token, req) {
  const tokenHash = crypto.createHash("sha256").update(String(token || "")).digest("hex");
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const found = await client.query("select * from invitations where token_hash=$1 and used_at is null and expires_at>now() for update", [tokenHash]);
      const invite = found.rows[0]; if (!invite) { await client.query("rollback"); return null; }
      await client.query("update invitations set used_at=now() where id=$1", [invite.id]);
      await client.query("update client_profiles set user_id=$1 where id=$2 and user_id is null", [user.id, invite.client_id]);
      await client.query(`insert into client_access (id,client_id,user_id,workspace_id) values ($1,$2,$3,$4) on conflict(client_id,user_id) do nothing`, [id("access"), invite.client_id, user.id, invite.workspace_id]);
      await client.query("update users set role='client', workspace_id=$2 where id=$1", [user.id, invite.workspace_id]);
      await client.query("commit");
      await audit(user, { clientId: invite.client_id, action: "redeem", entityType: "invitation", entityId: invite.id, req });
      return { clientId: invite.client_id };
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  const db = readFile(); const invite = db.invitations.find((r) => r.tokenHash === tokenHash && !r.usedAt && new Date(r.expiresAt) > new Date());
  if (!invite) return null; invite.usedAt = timestamp(); const client = db.clients.find((c) => c.id === invite.clientId); if (client && !client.userId) client.userId = user.id;
  if (!db.access.some((a) => a.clientId === invite.clientId && a.userId === user.id)) db.access.push({ id: id("access"), clientId: invite.clientId, userId: user.id, workspaceId: invite.workspaceId, createdAt: timestamp() });
  writeFile(db); await audit(user, { clientId: invite.clientId, action: "redeem", entityType: "invitation", entityId: invite.id, req }); return { clientId: invite.clientId };
}

export async function contraindicationWarnings(clientId, procedureName = "") {
  const rows = await listRecords({ workspaceId: "default" }, clientId, "contraindications");
  const name = String(procedureName).toLocaleLowerCase("ru");
  return rows.filter((item) => {
    const procedures = Array.isArray(item.relatedProcedures) ? item.relatedProcedures : [];
    return !procedures.length || procedures.some((p) => name.includes(String(p).toLocaleLowerCase("ru")) || String(p).toLocaleLowerCase("ru").includes(name));
  });
}
