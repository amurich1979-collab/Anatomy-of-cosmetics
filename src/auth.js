import crypto from "node:crypto";
import {
  createPasswordResetToken,
  createUser,
  getValidPasswordResetToken,
  getUserByEmail,
  getUserById,
  markPasswordResetTokenUsed,
  updateUserPassword,
  publicUser
} from "./database.js";

const COOKIE_NAME = "anatomy_session";
const SESSION_DAYS = 30;
const fallbackSessionSecret = crypto.randomBytes(32).toString("hex");

function secret() {
  return process.env.SESSION_SECRET || fallbackSessionSecret;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function setSessionCookie(res, userId) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ userId, expiresAt }));
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.userId || Date.now() > Number(session.expiresAt || 0)) return null;
    return session;
  } catch {
    return null;
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function validatePassword(password) {
  return String(password || "").length >= 8;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function appBaseUrl(req) {
  const configured = process.env.APP_URL || process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

async function sendPasswordResetEmail({ email, resetLink }) {
  if (process.env.SMTP_HOST) {
    console.log(`[mail pending] Password reset email for ${email}: ${resetLink}`);
    return;
  }

  console.log(`[dev password reset] ${email}: ${resetLink}`);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash = "") {
  const [method, salt, hash] = storedHash.split(":");
  if (method !== "scrypt" || !salt || !hash) return false;

  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export async function attachCurrentUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies[COOKIE_NAME]);
  req.user = session ? await getUserById(session.userId) : null;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "Нужно войти в аккаунт." });
    return;
  }
  next();
}

export function registerAuthRoutes(app) {
  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  app.post("/api/auth/register", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();

    if (!validateEmail(email)) {
      res.status(400).json({ error: "Введите корректную почту." });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({ error: "Пароль должен быть не короче 8 символов." });
      return;
    }

    try {
      const user = await createUser({ email, passwordHash: hashPassword(password), name });
      setSessionCookie(res, user.id);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === "23505" || error.code === "EMAIL_EXISTS") {
        res.status(409).json({ error: "Пользователь с такой почтой уже есть." });
        return;
      }
      res.status(500).json({ error: "Не удалось создать аккаунт." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash || user.passwordHash)) {
      res.status(401).json({ error: "Неверная почта или пароль." });
      return;
    }

    setSessionCookie(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/auth/password-reset/request", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const neutral = {
      ok: true,
      message: "Если такой email зарегистрирован, мы отправим ссылку для восстановления пароля."
    };

    if (!validateEmail(email)) {
      res.json(neutral);
      return;
    }

    const user = await getUserByEmail(email);
    if (!user) {
      res.json(neutral);
      return;
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await createPasswordResetToken({
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt
    });

    const resetLink = `${appBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail({ email, resetLink });

    res.json({
      ...neutral,
      devResetLink: process.env.NODE_ENV === "production" ? undefined : resetLink
    });
  });

  app.post("/api/auth/password-reset/confirm", async (req, res) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");

    if (!token || !validatePassword(password)) {
      res.status(400).json({ error: "Ссылка недействительна или пароль короче 8 символов." });
      return;
    }

    const record = await getValidPasswordResetToken(hashResetToken(token));
    if (!record) {
      res.status(400).json({ error: "Ссылка устарела или уже использована. Запросите восстановление еще раз." });
      return;
    }

    const user = await updateUserPassword(record.userId, hashPassword(password));
    await markPasswordResetTokenUsed(record.id);

    if (!user) {
      res.status(400).json({ error: "Не удалось обновить пароль. Запросите восстановление еще раз." });
      return;
    }

    setSessionCookie(res, user.id);
    res.json({ user: publicUser(user), message: "Пароль обновлен. Вы вошли в аккаунт." });
  });

  app.post("/api/auth/oauth/:provider", (req, res) => {
    const provider = String(req.params.provider || "");
    res.status(501).json({
      error: `${provider} вход подготовлен в интерфейсе, но требует ключи OAuth и настройку callback URL.`
    });
  });
}
