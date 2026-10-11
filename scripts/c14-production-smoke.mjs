import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = process.env.C14_SOURCE_DATABASE_URL;
const restoreUrl = process.env.C14_RESTORE_DATABASE_URL;
const secret = process.env.C14_SESSION_SECRET;

function databaseName(url) {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^c14_[a-z0-9_]+$/i.test(name)) throw new Error("C14 databases must be dedicated and named c14_*");
  return name;
}

if (!sourceUrl || !restoreUrl || !secret || secret.length < 32) {
  throw new Error("Set C14_SOURCE_DATABASE_URL, C14_RESTORE_DATABASE_URL and C14_SESSION_SECRET (32+ chars)");
}
if (sourceUrl === restoreUrl || databaseName(sourceUrl) === databaseName(restoreUrl)) {
  throw new Error("C14 source and restore databases must be distinct");
}

async function assertEmpty(url) {
  const pool = new pg.Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
  try {
    const tables = await pool.query("select count(*)::int as count from pg_tables where schemaname = 'public'");
    assert.equal(tables.rows[0].count, 0, "C14 smoke refuses a non-empty database");
  } finally {
    await pool.end();
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function start(url) {
  const port = await freePort();
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: url,
      NODE_ENV: "production",
      SESSION_SECRET: secret,
      APP_URL: "https://c14.example.invalid",
      HOST: "127.0.0.1",
      PORT: String(port)
    },
    stdio: "ignore"
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error("C14 production process exited before becoming healthy");
    try {
      if ((await fetch(`${base}/health`)).ok) return { child, base };
    } catch { /* Still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("C14 production process did not become healthy");
}

async function stop(instance) {
  if (!instance || instance.child.exitCode !== null) return;
  instance.child.kill();
  await new Promise((resolve) => instance.child.once("exit", resolve));
}

async function post(base, route, body, cookie) {
  const response = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  assert.ok(response.ok, `POST ${route} failed with ${response.status}`);
  return { data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

function postgresCliEnv(url) {
  const parsed = new URL(url);
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: process.env.DATABASE_SSL === "false" ? "disable" : "require"
  };
}

function runPg(command, args, url) {
  const result = spawnSync(command, args, { env: postgresCliEnv(url), stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error(`${command} failed; verify PostgreSQL client tools and test database access`);
}

await assertEmpty(sourceUrl);
await assertEmpty(restoreUrl);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anatomy-c14-pg-"));
const archive = path.join(directory, "backup.dump");
let app;
try {
  app = await start(sourceUrl);
  const created = await post(app.base, "/api/auth/register", { email: "c14-smoke@example.invalid", password: "c14-test-password" });
  await post(app.base, "/api/analyze", { text: "Aqua, Glycerin, Niacinamide" }, created.cookie);
  await stop(app);
  app = await start(sourceUrl);
  const signedIn = await post(app.base, "/api/auth/login", { email: "c14-smoke@example.invalid", password: "c14-test-password" });
  const history = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: signedIn.cookie } });
  assert.ok((await history.json()).history.length > 0, "History did not survive restart");
  await stop(app);
  app = null;
  runPg("pg_dump", ["--format=custom", "--file", archive], sourceUrl);
  runPg("pg_restore", ["--no-owner", "--no-acl", "--dbname", databaseName(restoreUrl), archive], restoreUrl);
  app = await start(restoreUrl);
  const restored = await post(app.base, "/api/auth/login", { email: "c14-smoke@example.invalid", password: "c14-test-password" });
  const restoredHistory = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: restored.cookie } });
  assert.ok((await restoredHistory.json()).history.length > 0, "History missing after restore");
  console.log("C14 production smoke: PASS (PostgreSQL restart and isolated restore)");
} finally {
  await stop(app);
  fs.rmSync(directory, { recursive: true, force: true });
}
