import crypto from "node:crypto";
import {
  createPasswordResetToken,
  createUser,
  findOrCreateOAuthUser,
  getValidPasswordResetToken,
  getUserByEmail,
  getUserById,
  markPasswordResetTokenUsed,
  updateUserPassword,
  publicUser
} from "./database.js";

const COOKIE_NAME = "anatomy_session";
const OAUTH_STATE_COOKIE = "anatomy_oauth_state";
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

function appendSetCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }

  res.setHeader("Set-Cookie", Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

function secureCookiePart() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function setSessionCookie(res, userId) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ userId, expiresAt }));
  const token = `${payload}.${sign(payload)}`;
  appendSetCookie(
    res,
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secureCookiePart()}`
  );
}

function clearSessionCookie(res) {
  appendSetCookie(res, `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

function googleOAuthConfig(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appBaseUrl(req)}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getGoogleOAuthStatusForRequest(req) {
  const config = googleOAuthConfig(req);
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    redirectUri: config.redirectUri,
    missing: [
      !config.clientId ? "GOOGLE_CLIENT_ID" : "",
      !config.clientSecret ? "GOOGLE_CLIENT_SECRET" : "",
      !(process.env.APP_URL || process.env.PUBLIC_URL || process.env.GOOGLE_REDIRECT_URI) ? "APP_URL" : ""
    ].filter(Boolean)
  };
}

function authRedirect(message) {
  return `/login?auth=${encodeURIComponent(message)}`;
}

function setOAuthStateCookie(res, state) {
  appendSetCookie(
    res,
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secureCookiePart()}`
  );
}

function clearOAuthStateCookie(res) {
  appendSetCookie(res, `${OAUTH_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secureCookiePart()}`);
}

async function exchangeGoogleCode({ code, config }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed");
  }

  return data;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const profile = await response.json().catch(() => ({}));
  if (!response.ok || !profile.email) {
    throw new Error(profile.error_description || profile.error || "Google profile request failed");
  }

  return profile;
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

  app.get("/api/auth/google/status", (req, res) => {
    res.json(getGoogleOAuthStatusForRequest(req));
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

  app.get("/api/auth/google", (req, res) => {
    const config = googleOAuthConfig(req);
    if (!config.clientId || !config.clientSecret) {
      res.redirect(authRedirect("google_not_configured"));
      return;
    }

    const state = crypto.randomBytes(24).toString("base64url");
    setOAuthStateCookie(res, state);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("prompt", "select_account");

    res.redirect(authUrl.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const config = googleOAuthConfig(req);
    const cookies = parseCookies(req.headers.cookie);
    const state = String(req.query.state || "");
    const code = String(req.query.code || "");

    clearOAuthStateCookie(res);

    if (req.query.error) {
      res.redirect(authRedirect("google_denied"));
      return;
    }

    if (!config.clientId || !config.clientSecret || !code || !state || cookies[OAUTH_STATE_COOKIE] !== state) {
      res.redirect(authRedirect("google_invalid"));
      return;
    }

    try {
      const token = await exchangeGoogleCode({ code, config });
      const profile = await fetchGoogleProfile(token.access_token);

      if (profile.email_verified === false) {
        res.redirect(authRedirect("google_email_unverified"));
        return;
      }

      const user = await findOrCreateOAuthUser({
        email: profile.email,
        name: profile.name || profile.given_name || "",
        provider: "google"
      });

      if (!user) {
        res.redirect(authRedirect("google_failed"));
        return;
      }

      setSessionCookie(res, user.id);
      res.redirect("/profile?auth=google_ok");
    } catch (error) {
      console.error("[google oauth]", error.message);
      res.redirect(authRedirect("google_failed"));
    }
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
    if (provider === "google") {
      res.json({ url: "/api/auth/google" });
      return;
    }
    res.status(501).json({
      error: `${provider} вход подготовлен в интерфейсе, но требует ключи OAuth и настройку callback URL.`
    });
  });
}
