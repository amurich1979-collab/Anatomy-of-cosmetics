import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "./analyzer.js";
import { createReviewRequest, identifyProductFromText, listReviewRequests, searchProducts } from "./products.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

app.get("/api/products/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (query.length < 2) {
    res.json({ products: [] });
    return;
  }

  const products = await searchProducts(query);
  res.json({ products });
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

app.post("/api/analyze", (req, res) => {
  const { text, profile } = req.body || {};

  if (!text || String(text).trim().length < 3) {
    res.status(400).json({ error: "Передайте состав в поле text." });
    return;
  }

  res.json(analyzeComposition({ text: String(text), profile: profile || {} }));
});

app.get("/miniapp", (_req, res) => {
  res.sendFile(path.join(publicDir, "miniapp.html"));
});

app.get("/review", (_req, res) => {
  res.sendFile(path.join(publicDir, "review.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, host, () => {
  console.log(`Anatomy Cosmetology web app: http://localhost:${port}`);
  console.log(`Network access: http://${host}:${port}`);
  console.log(`Telegram Mini App preview: http://localhost:${port}/miniapp`);
});
