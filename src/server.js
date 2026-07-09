import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "./analyzer.js";
import { attachCurrentUser, registerAuthRoutes, requireUser } from "./auth.js";
import { addUserHistory, clearUserHistory, getUserSettings, initDatabase, listUserHistory, updateUserSettings } from "./database.js";
import { createReviewRequest, getProductDetails, identifyProductFromText, listCatalogProducts, listReviewRequests, searchProducts } from "./products.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(attachCurrentUser);
app.use(express.static(publicDir));

const databaseInfo = await initDatabase();
registerAuthRoutes(app);

app.get("/api/products/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (query.length < 1) {
    res.json({ products: [] });
    return;
  }

  const products = await searchProducts(query);
  res.json({ products });
});

app.get("/api/products/catalog", (_req, res) => {
  res.json({ products: listCatalogProducts() });
});

app.get("/api/products/:id", async (req, res) => {
  const product = await getProductDetails(req.params.id);

  if (!product) {
    res.status(404).json({ error: "Средство не найдено или состав пока недоступен." });
    return;
  }

  res.json({ product });
});

app.post("/api/products/identify", async (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (text.length < 8) {
    res.json({ product: null });
    return;
  }

  res.json({ product: await identifyProductFromText(text) });
});

app.post("/api/products/review-request", (req, res) => {
  const request = createReviewRequest({
    query: req.body?.query,
    source: req.body?.source || "web",
    notes: req.body?.notes || ""
  });

  if (!request) {
    res.status(400).json({ error: "Передайте название средства в поле query." });
    return;
  }

  res.json({ request });
});

app.get("/api/products/review-queue", (_req, res) => {
  res.json({ requests: listReviewRequests() });
});

app.get("/api/user/settings", async (req, res) => {
  res.json(await getUserSettings(req.user?.id));
});

app.put("/api/user/settings", requireUser, async (req, res) => {
  res.json(await updateUserSettings(req.user.id, req.body?.settings || {}));
});

app.get("/api/user/history", requireUser, async (req, res) => {
  res.json({ history: await listUserHistory(req.user.id, req.query.limit) });
});

app.post("/api/user/history", requireUser, async (req, res) => {
  const record = await addUserHistory(req.user.id, {
    kind: req.body?.kind,
    title: req.body?.title,
    payload: req.body?.payload || {}
  });

  if (!record) {
    res.status(400).json({ error: "Передайте kind и title для записи истории." });
    return;
  }

  res.status(201).json({ record });
});

app.delete("/api/user/history", requireUser, async (req, res) => {
  res.json(await clearUserHistory(req.user.id));
});

app.post("/api/analyze", async (req, res) => {
  const { text, profile } = req.body || {};

  if (!text || String(text).trim().length < 3) {
    res.status(400).json({ error: "Передайте состав в поле text." });
    return;
  }

  const analysis = analyzeComposition({ text: String(text), profile: profile || {} });

  if (req.user) {
    await addUserHistory(req.user.id, {
      kind: "analysis",
      title: req.body?.productName || analysis.formulaType || "Разбор состава",
      payload: {
        score: analysis.score?.score,
        formulaType: analysis.formulaType,
        profile: profile || {},
        composition: String(text).slice(0, 4000)
      }
    });
  }

  res.json(analysis);
});

app.get("/miniapp", (_req, res) => {
  res.sendFile(path.join(publicDir, "miniapp.html"));
});

app.get("/review", (_req, res) => {
  res.sendFile(path.join(publicDir, "review.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/reset-password", (_req, res) => {
  res.sendFile(path.join(publicDir, "reset-password.html"));
});

app.get("/settings", (_req, res) => {
  res.sendFile(path.join(publicDir, "settings.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, host, () => {
  console.log(`Anatomy Cosmetology web app: http://localhost:${port}`);
  console.log(`Network access: http://${host}:${port}`);
  console.log(`Telegram Mini App preview: http://localhost:${port}/miniapp`);
  console.log(`Database: ${databaseInfo.provider}${databaseInfo.path ? ` (${databaseInfo.path})` : ""}`);
});
