import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { requireRole, requireUser } from "./auth.js";
import { listUsers, setUserRole } from "./database.js";
import {
  archiveRecord, contraindicationWarnings, createCatalogRecord, createClient, createInvitation, createRecord, getAnamnesis,
  getClient, getOwnClient, listAudit, listCatalog, listClients, listFaceMaps, listRecords, listWorkspaceCalendar, redeemInvitation,
  saveAnamnesis, updateClient, updateRecord
} from "./crmDatabase.js";

const staff = requireRole("admin", "cosmetologist");
const admin = requireRole("admin");
const pdfRegularFont = fileURLToPath(new URL("../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", import.meta.url));
const pdfBoldFont = fileURLToPath(new URL("../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf", import.meta.url));
const TYPES = {
  contraindications: "contraindications", visits: "visits", recommendations: "recommendations",
  "calendar-events": "calendarEvents", "injection-points": "injectionPoints", "product-usages": "productUsages",
  photos: "photos", consents: "consents", documents: "documents"
};

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function publicClient(client, clientView = false) {
  if (!client) return null;
  const result = { ...client };
  if (clientView) {
    delete result.internalNote; delete result.internal_note; delete result.createdBy; delete result.created_by;
  }
  return result;
}

async function accessibleClient(req, res, { staffOnly = false } = {}) {
  if (staffOnly && !["admin", "cosmetologist"].includes(req.user?.role)) {
    res.status(403).json({ error: "Недостаточно прав для изменения карточки." });
    return null;
  }
  const client = await getClient(req.user, req.params.clientId);
  if (!client) {
    res.status(404).json({ error: "Карточка клиента не найдена." });
    return null;
  }
  return client;
}

function safeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body;
}

export function registerCrmRoutes(app) {
  app.use(["/api/crm", "/api/portal", "/api/admin"], (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          res.status(403).json({ error: "Запрос отклонён проверкой источника." });
          return;
        }
      } catch {
        res.status(403).json({ error: "Некорректный источник запроса." });
        return;
      }
    }
    if (!String(req.headers["content-type"] || "").includes("application/json")) {
      res.status(415).json({ error: "CRM API принимает изменения только в формате JSON." });
      return;
    }
    next();
  });
  app.get("/api/crm/clients", staff, asyncRoute(async (req, res) => {
    res.json({ clients: await listClients(req.user, req.query) });
  }));

  app.post("/api/crm/clients", staff, asyncRoute(async (req, res) => {
    const client = await createClient(req.user, safeBody(req.body), req);
    res.status(201).json({ client });
  }));

  app.get("/api/crm/clients/:clientId", requireUser, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res); if (!client) return;
    res.json({ client: publicClient(client, req.user.role === "client") });
  }));

  app.put("/api/crm/clients/:clientId", staff, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
    res.json({ client: await updateClient(req.user, client.id, safeBody(req.body), req) });
  }));

  app.get("/api/crm/clients/:clientId/anamnesis", requireUser, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res); if (!client) return;
    res.json({ anamnesis: await getAnamnesis(client.id) });
  }));

  app.put("/api/crm/clients/:clientId/anamnesis", requireUser, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res); if (!client) return;
    res.json({ anamnesis: await saveAnamnesis(req.user, client.id, safeBody(req.body), req) });
  }));

  for (const [urlType, type] of Object.entries(TYPES)) {
    app.get(`/api/crm/clients/:clientId/${urlType}`, requireUser, asyncRoute(async (req, res) => {
      const client = await accessibleClient(req, res); if (!client) return;
      const records = await listRecords(req.user, client.id, type, { clientView: req.user.role === "client" });
      res.json({ records });
    }));

    app.post(`/api/crm/clients/:clientId/${urlType}`, staff, asyncRoute(async (req, res) => {
      const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
      const input = safeBody(req.body);
      const warnings = type === "visits" ? await contraindicationWarnings(client.id, input.procedureName) : [];
      const record = await createRecord(req.user, client.id, type, input, req);
      res.status(201).json({ record, warnings });
    }));

    app.put(`/api/crm/clients/:clientId/${urlType}/:recordId`, staff, asyncRoute(async (req, res) => {
      const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
      const record = await updateRecord(req.user, client.id, type, req.params.recordId, safeBody(req.body), req);
      if (!record) { res.status(404).json({ error: "Запись не найдена." }); return; }
      res.json({ record });
    }));

    app.delete(`/api/crm/clients/:clientId/${urlType}/:recordId`, staff, asyncRoute(async (req, res) => {
      const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
      const archived = await archiveRecord(req.user, client.id, type, req.params.recordId, req);
      if (!archived) { res.status(404).json({ error: "Запись не найдена." }); return; }
      res.json({ archived: true });
    }));
  }

  app.get("/api/crm/face-maps", requireUser, asyncRoute(async (req, res) => {
    res.json({ faceMaps: await listFaceMaps(req.user) });
  }));

  app.get("/api/crm/products", staff, asyncRoute(async (req, res) => res.json({ records: await listCatalog(req.user, "products") })));
  app.post("/api/crm/products", staff, asyncRoute(async (req, res) => res.status(201).json({ record: await createCatalogRecord(req.user, "products", safeBody(req.body), req) })));
  app.get("/api/crm/procedures", staff, asyncRoute(async (req, res) => res.json({ records: await listCatalog(req.user, "procedures") })));
  app.post("/api/crm/procedures", staff, asyncRoute(async (req, res) => res.status(201).json({ record: await createCatalogRecord(req.user, "procedures", safeBody(req.body), req) })));
  app.get("/api/crm/recommendation-templates", staff, asyncRoute(async (req, res) => res.json({ records: await listCatalog(req.user, "recommendationTemplates") })));
  app.post("/api/crm/recommendation-templates", staff, asyncRoute(async (req, res) => res.status(201).json({ record: await createCatalogRecord(req.user, "recommendationTemplates", safeBody(req.body), req) })));
  app.get("/api/crm/calendar", staff, asyncRoute(async (req, res) => res.json({ records: await listWorkspaceCalendar(req.user) })));

  app.get("/api/crm/clients/:clientId/audit-log", staff, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
    res.json({ records: await listAudit(req.user, client.id) });
  }));

  app.post("/api/crm/clients/:clientId/invitations", staff, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res, { staffOnly: true }); if (!client) return;
    const invitation = await createInvitation(req.user, client.id, req.body?.destination || client.email || client.phone, req);
    res.status(201).json({ invitation, delivery: "manual" });
  }));

  app.post("/api/crm/invitations/redeem", requireUser, asyncRoute(async (req, res) => {
    const access = await redeemInvitation(req.user, req.body?.token, req);
    if (!access) { res.status(400).json({ error: "Приглашение недействительно, истекло или уже использовано." }); return; }
    res.json({ access });
  }));

  app.get("/api/portal/me", requireRole("client"), asyncRoute(async (req, res) => {
    const client = await getOwnClient(req.user);
    if (!client) { res.status(404).json({ error: "Аккаунт ещё не связан с карточкой клиента." }); return; }
    const [anamnesis, visits, recommendations, events, points, usages, photos, consents, documents] = await Promise.all([
      getAnamnesis(client.id), listRecords(req.user, client.id, "visits", { clientView: true }),
      listRecords(req.user, client.id, "recommendations", { clientView: true }), listRecords(req.user, client.id, "calendarEvents", { clientView: true }),
      listRecords(req.user, client.id, "injectionPoints", { clientView: true }), listRecords(req.user, client.id, "productUsages", { clientView: true }),
      listRecords(req.user, client.id, "photos", { clientView: true }), listRecords(req.user, client.id, "consents", { clientView: true }),
      listRecords(req.user, client.id, "documents", { clientView: true })
    ]);
    res.json({ client: publicClient(client, true), anamnesis, visits: visits.filter((v) => v.status !== "draft"), recommendations,
      calendarEvents: events, injectionPoints: points, productUsages: usages, photos, consents, documents });
  }));

  app.post("/api/portal/recommendations/:recordId/acknowledge", requireRole("client"), asyncRoute(async (req, res) => {
    const client = await getOwnClient(req.user);
    if (!client) { res.status(404).json({ error: "Карточка не найдена." }); return; }
    const visible = await listRecords(req.user, client.id, "recommendations", { clientView: true });
    if (!visible.some((record) => record.id === req.params.recordId)) { res.status(404).json({ error: "Рекомендация не найдена." }); return; }
    const record = await updateRecord(req.user, client.id, "recommendations", req.params.recordId, { acknowledgedAt: new Date().toISOString() }, req);
    res.json({ record });
  }));

  app.get("/api/admin/users", admin, asyncRoute(async (_req, res) => res.json({ users: await listUsers() })));
  app.patch("/api/admin/users/:userId/role", admin, asyncRoute(async (req, res) => {
    const user = await setUserRole(req.params.userId, req.body?.role, req.body?.workspaceId || "default");
    if (!user) { res.status(400).json({ error: "Пользователь или роль не найдены." }); return; }
    res.json({ user });
  }));

  app.post("/api/crm/clients/:clientId/photos/upload", staff, (_req, res) => {
    res.status(503).json({
      error: "Хранилище медицинских фотографий не настроено. Метаданные доступны, но загрузка отключена для защиты от потери файлов.",
      required: ["PHOTO_STORAGE_PROVIDER", "PHOTO_STORAGE_BUCKET"]
    });
  });

  app.get("/api/crm/clients/:clientId/export.pdf", requireUser, asyncRoute(async (req, res) => {
    const client = await accessibleClient(req, res); if (!client) return;
    const clientView = req.user.role === "client";
    const [anamnesis, visits, recommendations, events, points] = await Promise.all([
      getAnamnesis(client.id), listRecords(req.user, client.id, "visits", { clientView }),
      listRecords(req.user, client.id, "recommendations", { clientView }), listRecords(req.user, client.id, "calendarEvents", { clientView }),
      listRecords(req.user, client.id, "injectionPoints", { clientView })
    ]);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=client-${client.id}.pdf`);
    const doc = new PDFDocument({ margin: 48, info: { Title: `Карточка ${client.fullName}` } });
    doc.pipe(res);
    doc.registerFont("Regular", pdfRegularFont).registerFont("Bold", pdfBoldFont);
    doc.font("Bold").fontSize(20).text("Карточка клиента").moveDown();
    doc.fontSize(14).text(client.fullName).font("Regular").fontSize(10).text(`Телефон: ${client.phone || "—"}`).text(`Email: ${client.email || "—"}`).text(`Дата рождения: ${client.birthDate || "—"}`);
    if (!clientView && client.internalNote) doc.moveDown().text(`Внутренняя заметка: ${client.internalNote}`);
    const section = (title, data) => { doc.moveDown().font("Bold").fontSize(13).text(title).font("Regular").fontSize(9).text(JSON.stringify(data, null, 2)); };
    section("Анамнез", anamnesis.data || anamnesis); section("Визиты", visits); section("Рекомендации", recommendations);
    section("Календарь", events); section("Карта введения", points); doc.end();
  }));
}

export function crmErrorHandler(error, _req, res, _next) {
  console.error("CRM request failed", { message: error.message, code: error.code });
  const status = Number(error.status) || (error.code === "23505" ? 409 : 500);
  res.status(status).json({ error: status >= 500 ? "Не удалось выполнить операцию. Повторите попытку позже." : error.message });
}
