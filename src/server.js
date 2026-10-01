import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalysisContract } from "./analysisContract.js";
import { findFormulaAlternativesDetailed } from "./analogs.js";
import { analyzeComposition } from "./analyzer.js";
import { attachCurrentUser, registerAuthRoutes, requireUser } from "./auth.js";
import { addUserHistory, clearUserHistory, getUserSettings, initDatabase, listUserHistory, updateUserSettings } from "./database.js";
import { createReviewRequest, getProductDetails, identifyProductFromText, listCatalogProducts, listReviewRequests, searchProductsDetailed } from "./products.js";
import { cleanInciText } from "./services/inciCleaner.js";
import { classifyFormulaProduct } from "./services/productClassifier.js";
import { isSessionOnlyHistory } from "../public/analysis-profile.js";
import { buildAnalysisHistoryEntry, inspectAnalysisHistoryEntry, sanitizeHistoryEntryForPrivacy } from "../public/history-snapshot.js";

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

  const result = await searchProductsDetailed(query);
  res.json({
    products: result.products,
    lookupStatus: result.lookupStatus,
    sourceStatuses: result.sourceStatuses,
    cache: result.cache
  });
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

app.post("/api/photo/resolve", async (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (text.length < 8) {
    res.json({
      mode: "unknown",
      cleanedText: "",
      ingredients: [],
      confidence: 0,
      message: "На фото почти не распознан текст."
    });
    return;
  }

  const cleaned = cleanInciText(text);
  const hasComposition = cleaned.ingredients.length >= 3 && cleaned.confidence >= 0.45;
  const product = await identifyProductFromText(text);
  const productWithDetails = product?.composition ? product : product?.id ? await getProductDetails(product.id) : null;
  const purpose = classifyFormulaProduct({
    ingredients: hasComposition ? cleaned.ingredients : cleanInciText(productWithDetails?.composition || "").ingredients,
    productName: productWithDetails?.name || product?.name || "",
    productEvidence: productWithDetails || product ? {
      identificationStatus: "suggested",
      name: productWithDetails?.name || product?.name || null,
      category: productWithDetails?.category || product?.category || null,
      description: productWithDetails?.description || product?.description || null,
      useInstructions: productWithDetails?.useInstructions || product?.useInstructions || null,
      source: {
        name: productWithDetails?.source || product?.source || null,
        type: productWithDetails?.sourceType || product?.sourceType || null,
        url: productWithDetails?.sourceUrl || product?.sourceUrl || null,
        retrievedAt: productWithDetails?.importedAt || productWithDetails?.verifiedAt || product?.importedAt || product?.verifiedAt || null
      }
    } : {},
    rawText: [
      text,
      productWithDetails?.brand,
      productWithDetails?.name,
      productWithDetails?.category,
      productWithDetails?.description,
      productWithDetails?.activeIngredients,
      productWithDetails?.composition
    ].filter(Boolean).join(" ")
  });

  if (hasComposition) {
    res.json({
      mode: "composition",
      cleanedText: cleaned.cleanedText,
      extractedBlock: cleaned.extractedBlock,
      entries: cleaned.entries,
      ingredients: cleaned.ingredients,
      confidence: cleaned.confidence,
      autoCorrections: cleaned.autoCorrections,
      suggestions: cleaned.suggestions,
      product: productWithDetails || product || null,
      purpose,
      composition: cleaned.ingredients.join(", "),
      message: "Фото похоже на оборотную сторону с составом. Сервис выделил только INCI-блок."
    });
    return;
  }

  if (productWithDetails?.composition) {
    res.json({
      mode: "product",
      cleanedText: productWithDetails.composition,
      ingredients: [],
      confidence: productWithDetails.confidence || product?.confidence || 0.62,
      product: productWithDetails,
      purpose,
      composition: productWithDetails.composition,
      message: "Фото похоже на лицевую этикетку. Сервис определил средство и подтянул состав из базы."
    });
    return;
  }

  res.json({
    mode: "unknown",
    cleanedText: cleaned.cleanedText,
    extractedBlock: cleaned.extractedBlock,
    ingredients: cleaned.ingredients,
    confidence: cleaned.confidence,
    product: product || null,
    purpose,
    composition: "",
    message: product
      ? "Средство похоже найдено, но состав для него пока не доступен."
      : "Не удалось уверенно понять: это лицевая этикетка или состав. Попробуйте фото ближе или добавьте бренд в поиск."
  });
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
  if (isSessionOnlyHistory(req.body)) {
    res.status(400).json({ error: "Персональный разбор используется только в текущем сеансе и не сохраняется без отдельного согласия." });
    return;
  }
  let historyEntry = sanitizeHistoryEntryForPrivacy(req.body || {});
  if (historyEntry.kind === "analysis") {
    const inspected = inspectAnalysisHistoryEntry(historyEntry);
    if (inspected.status === "invalid") {
      res.status(400).json({ error: "В историю можно сохранить только завершённый анализ." });
      return;
    }
    if (inspected.status === "legacy") {
      historyEntry = buildAnalysisHistoryEntry({
        text: inspected.composition,
        productName: historyEntry.payload?.productName || historyEntry.title
      }, inspected.analysis, historyEntry.payload?.source || "");
    }
  }

  const record = await addUserHistory(req.user.id, {
    kind: historyEntry?.kind,
    title: historyEntry?.title,
    payload: historyEntry?.payload || {}
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
  res.set("Cache-Control", "no-store");
  const { text, profile } = req.body || {};

  if (!text || String(text).trim().length < 3) {
    res.status(400).json({ error: "Передайте состав в поле text." });
    return;
  }

  const analysis = analyzeComposition({
    text: String(text),
    profile: profile || {},
    productName: req.body?.productName || "",
    formulaScope: req.body?.evidence?.formula?.scope || "unknown",
    productEvidence: req.body?.evidence?.product || {}
  });
  const alternativeSearch = findFormulaAlternativesDetailed({
    text: String(text),
    profile: profile || {},
    productName: req.body?.productName || "",
    formulaScope: req.body?.evidence?.formula?.scope || "unknown",
    productEvidence: req.body?.evidence?.product || {},
    sourceProduct: req.body?.product || req.body?.evidence?.product || {},
    limit: 5
  });
  analysis.alternatives = alternativeSearch.alternatives;
  analysis.alternativeSearch = { ...alternativeSearch, alternatives: undefined };
  analysis.analysisContract = createAnalysisContract({
    analysis,
    request: {
      text: String(text),
      productName: req.body?.productName || "",
      profile: profile || {},
      evidence: req.body?.evidence || {}
    }
  });

  if (req.user && analysis.historyPolicy.mode !== "session_only") {
    const historyEntry = buildAnalysisHistoryEntry({
      text: String(text),
      productName: req.body?.productName || ""
    }, analysis, req.body?.evidence?.formula?.source?.name || "");
    if (historyEntry) await addUserHistory(req.user.id, historyEntry);
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
  res.redirect("/profile");
});

app.get("/history", (_req, res) => {
  res.redirect("/profile");
});

app.get("/profile", (_req, res) => {
  res.sendFile(path.join(publicDir, "profile.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  app.listen(port, host, () => {
    console.log(`Anatomy Cosmetology web app: http://localhost:${port}`);
    console.log(`Network access: http://${host}:${port}`);
    console.log(`Telegram Mini App preview: http://localhost:${port}/miniapp`);
    console.log(`Database: ${databaseInfo.provider}${databaseInfo.path ? ` (${databaseInfo.path})` : ""}`);
  });
}

export { app };
