import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { searchExternalProductsDetailed } from "../src/services/productSources/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = "c14-smoke-isolated-session-key-32-chars";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startApp(dbPath, extraEnv = {}) {
  const port = await freePort();
  const process = spawn(globalThis.process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...globalThis.process.env,
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_URL: `http://127.0.0.1:${port}`,
      APP_DB_PATH: dbPath,
      SESSION_SECRET: secret,
      DATABASE_URL: "",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  process.stdout.on("data", (chunk) => { output += chunk; });
  process.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`App exited during smoke: ${output}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { process, base, getOutput: () => output };
    } catch { /* Startup is still in progress. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.kill();
  throw new Error(`App did not become healthy: ${output}`);
}

async function stopApp(instance) {
  if (!instance || instance.process.exitCode !== null) return;
  instance.process.kill();
  await new Promise((resolve) => instance.process.once("exit", resolve));
}

async function post(base, route, body, cookie) {
  const response = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

async function localSmtp() {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "";
    let inData = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (true) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) break;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write("250 queued\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^EHLO|^HELO/i.test(line)) socket.write("250-localhost\r\n250 SIZE 100000\r\n");
        else if (/^DATA/i.test(line)) { inData = true; socket.write("354 end with dot\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.end("221 bye\r\n"); break; }
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port, messages };
}

test("C14: isolated storage survives restart and backup restore; access, reset mail and limits work", { timeout: 45000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anatomy-c14-"));
  const originalDb = path.join(directory, "source.json");
  const backup = path.join(directory, "backup.json");
  const restoredDb = path.join(directory, "restored.json");
  const smtp = await localSmtp();
  let app;
  t.after(async () => {
    await stopApp(app);
    await new Promise((resolve) => smtp.server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const smtpEnv = { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port), SMTP_FROM: "test@example.invalid" };
  app = await startApp(originalDb, { ...smtpEnv, REVIEW_ADMIN_EMAILS: "second@example.invalid" });
  const first = await post(app.base, "/api/auth/register", { email: "first@example.invalid", password: "initial-password" });
  assert.equal(first.response.status, 201);
  const second = await post(app.base, "/api/auth/register", { email: "second@example.invalid", password: "another-password" });
  assert.equal(second.response.status, 201);
  const analysis = await post(app.base, "/api/analyze", { text: "Aqua, Glycerin, Niacinamide" }, first.cookie);
  assert.equal(analysis.response.status, 200);
  const ownHistory = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: first.cookie } });
  assert.ok((await ownHistory.json()).history.length >= 1);
  assert.equal((await fetch(`${app.base}/api/user/history`)).status, 401);
  assert.equal((await fetch(`${app.base}/api/products/review-queue`)).status, 401);
  assert.equal((await fetch(`${app.base}/api/products/review-queue`, { headers: { Cookie: first.cookie } })).status, 403);
  assert.equal((await fetch(`${app.base}/api/products/review-queue`, { headers: { Cookie: second.cookie } })).status, 200);
  const otherHistory = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: second.cookie } });
  assert.deepEqual((await otherHistory.json()).history, []);

  const reset = await post(app.base, "/api/auth/password-reset/request", { email: "first@example.invalid" });
  assert.equal(reset.response.status, 200);
  assert.equal(smtp.messages.length, 1);
  const encodedBody = smtp.messages[0].split("\r\n\r\n")[1].replace(/\s/g, "");
  const deliveredText = Buffer.from(encodedBody, "base64").toString("utf8");
  assert.ok(deliveredText.includes(reset.data.devResetLink));
  assert.ok(!app.getOutput().includes(reset.data.devResetLink));
  const token = new URL(reset.data.devResetLink).searchParams.get("token");
  const confirm = await post(app.base, "/api/auth/password-reset/confirm", { token, password: "replacement-password" });
  assert.equal(confirm.response.status, 200);
  assert.equal((await post(app.base, "/api/auth/password-reset/confirm", { token, password: "replacement-password" })).response.status, 400);

  const expiredPayload = Buffer.from(JSON.stringify({ userId: first.data.user.id, expiresAt: Date.now() - 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(expiredPayload).digest("base64url");
  const expiredResponse = await fetch(`${app.base}/api/auth/me`, {
    headers: { Cookie: `anatomy_session=${expiredPayload}.${signature}` }
  });
  assert.equal((await expiredResponse.json()).user, null);

  await stopApp(app);
  app = await startApp(originalDb, smtpEnv);
  const login = await post(app.base, "/api/auth/login", { email: "first@example.invalid", password: "replacement-password" });
  assert.equal(login.response.status, 200);
  const persisted = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: login.cookie } });
  assert.ok((await persisted.json()).history.length >= 1);
  await stopApp(app);

  fs.copyFileSync(originalDb, backup);
  fs.copyFileSync(backup, restoredDb);
  app = await startApp(restoredDb, smtpEnv);
  const restoredLogin = await post(app.base, "/api/auth/login", { email: "first@example.invalid", password: "replacement-password" });
  assert.equal(restoredLogin.response.status, 200);
  const restoredHistory = await fetch(`${app.base}/api/user/history`, { headers: { Cookie: restoredLogin.cookie } });
  assert.ok((await restoredHistory.json()).history.length >= 1);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const failed = await post(app.base, "/api/auth/login", { email: "first@example.invalid", password: "wrong" });
    if (attempt === 11) assert.equal(failed.response.status, 429);
  }
  fs.writeFileSync(restoredDb, "not json", "utf8");
  assert.equal((await fetch(`${app.base}/health`)).status, 503);
});

test("C14: source outage cannot produce a fabricated product or formula", async () => {
  const unavailable = {
    id: "test-unavailable",
    label: "Unavailable test source",
    searchByBarcode: async () => { throw new Error("offline"); },
    searchByName: async () => { throw new Error("offline"); },
    getProduct: async () => { throw new Error("offline"); }
  };
  const result = await searchExternalProductsDetailed("1234567890123", { sources: [unavailable], useCache: false });
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.products, []);
  assert.equal(result.sourceStatuses[0].status, "unavailable");
});

test("C14: production refuses ephemeral storage and rotating session secret", async () => {
  const process = spawn(globalThis.process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...globalThis.process.env,
      NODE_ENV: "production",
      APP_URL: "https://example.invalid",
      SESSION_SECRET: secret,
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  process.stderr.on("data", (chunk) => { output += chunk; });
  const exit = await new Promise((resolve) => process.once("exit", resolve));
  assert.notEqual(exit, 0);
  assert.match(output, /Production requires DATABASE_URL/);
});
