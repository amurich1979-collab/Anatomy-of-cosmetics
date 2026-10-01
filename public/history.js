import {
  buildAnalysisHistoryEntry,
  buildReanalysisRequest,
  inspectAnalysisHistoryEntry,
  sanitizeHistoryEntryForPrivacy
} from "./history-snapshot.js";

const historySummary = document.querySelector("#historySummary");
const historyList = document.querySelector("#historyList");
const clearHistory = document.querySelector("#clearHistory");
const historyStatus = document.querySelector("#historyStatus");
const loginLink = document.querySelector("#loginLink");

let currentUser = null;
let visibleHistory = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readList(key) {
  try {
    const items = JSON.parse(localStorage.getItem(key) || "[]");
    if (key !== "analysisHistory" || !Array.isArray(items)) return items;
    const safeItems = items.map(sanitizeHistoryEntryForPrivacy);
    if (JSON.stringify(items) !== JSON.stringify(safeItems)) {
      localStorage.setItem(key, JSON.stringify(safeItems));
    }
    return safeItems;
  } catch {
    return [];
  }
}

function saveUser(user) {
  if (user) {
    localStorage.setItem("demoUser", JSON.stringify(user));
  } else {
    localStorage.removeItem("demoUser");
  }
}

function historyPayload(item) {
  return item.payload || {};
}

function compactList(items, emptyText) {
  if (!items?.length) return `<p class="field-note">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.slice(0, 10).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function contractNotice(analysis) {
  const contract = analysis?.analysisContract;
  if (!contract || contract.schemaVersion !== "1.0") {
    return "Старый результат: полнота состава и происхождение совпадений тогда не сохранялись.";
  }

  const scopeLabels = {
    full: "полный INCI по заявлению источника",
    active_only: "только активные ингредиенты",
    partial: "неполный состав",
    unknown: "полнота состава не подтверждена"
  };
  const scope = scopeLabels[contract.formula?.scope] || scopeLabels.unknown;
  const source = contract.formula?.source?.name;
  return `Достоверность: ${scope}${source ? `; источник: ${source}` : "; источник не указан"}.`;
}

function snapshotNotice(item) {
  const inspected = inspectAnalysisHistoryEntry(item);
  if (inspected.status !== "snapshot") return inspected.legacyNotice;
  const snapshot = inspected.snapshot;
  const capturedAt = snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleString("ru-RU") : "дата не сохранена";
  const algorithm = snapshot.algorithmVersion || "версия правил не сохранена";
  const registry = snapshot.evidenceVersions?.registry || snapshot.evidenceVersions?.knowledge || "версия справочника не сохранена";
  return `Исторический снимок от ${capturedAt}. Правила: ${algorithm}. Справочник: ${registry}.`;
}

function sourceNotice(item) {
  const inspected = inspectAnalysisHistoryEntry(item);
  const source = inspected.snapshot?.formula?.source || inspected.analysis?.analysisContract?.formula?.source || {};
  const scope = inspected.snapshot?.formula?.scope || inspected.analysis?.analysisContract?.formula?.scope || "unknown";
  const sourceName = source.name || item.payload?.source || "источник не сохранён";
  const version = inspected.snapshot?.formula?.version || inspected.analysis?.analysisContract?.formula?.version;
  const market = inspected.snapshot?.formula?.market || inspected.analysis?.analysisContract?.formula?.market;
  return `Источник состава: ${sourceName}; полнота: ${scope}${version ? `; версия: ${version}` : ""}${market ? `; рынок: ${market}` : ""}.`;
}

function metricValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function assessmentNotice(analysis) {
  if (analysis?.assessment?.status !== "not_assessed") return "";
  return "Итоговая оценка, риск и рекомендации не рассчитывались: данных о полной формуле недостаточно.";
}

function renderSavedAnalysis(item) {
  const inspected = inspectAnalysisHistoryEntry(item);
  const payload = historyPayload(inspected.entry);
  const analysis = inspected.analysis || {};
  const warnings = analysis.warnings || [];
  const positives = analysis.positives || [];
  const found = analysis.found || [];
  const groups = analysis.groups || [];
  const composition = inspected.composition || "";
  const storedScore = analysis.score?.score ?? payload.score;

  return `
    <div class="history-detail">
      <p class="field-note history-snapshot-notice">${escapeHtml(snapshotNotice(item))}</p>
      <p class="field-note">${escapeHtml(sourceNotice(item))}</p>
      <p class="field-note">${escapeHtml(contractNotice(analysis))}</p>
      ${assessmentNotice(analysis) ? `<p class="field-note">${escapeHtml(assessmentNotice(analysis))}</p>` : ""}
      <div class="history-metrics">
        <article>
          <strong>${escapeHtml(metricValue(storedScore))}</strong>
          <span>оценка</span>
        </article>
        <article>
          <strong>${escapeHtml(metricValue(analysis.hydration_score))}</strong>
          <span>увлажнение</span>
        </article>
        <article>
          <strong>${escapeHtml(metricValue(analysis.irritation_risk))}</strong>
          <span>риск</span>
        </article>
      </div>

      <div class="history-block">
        <h3>${escapeHtml(analysis.formulaType || payload.formulaType || "Разбор состава")}</h3>
        <p>${escapeHtml(analysis.summary || "Сохранен старый краткий разбор без полного текста результата.")}</p>
      </div>

      <details>
        <summary>Исходный состав</summary>
        <p class="history-composition">${escapeHtml(composition || "Состав не сохранен в этой записи.")}</p>
      </details>

      <details>
        <summary>Что сервис выдал</summary>
        <div class="history-columns">
          <div>
            <h3>Может быть полезно</h3>
            ${compactList(positives, "Нет сохраненных выводов.")}
          </div>
          <div>
            <h3>На что обратить внимание</h3>
            ${compactList(warnings, "Явных предупреждений не сохранено.")}
          </div>
        </div>
      </details>

      <details>
        <summary>Компоненты и группы</summary>
        <div class="history-columns">
          <div>
            <h3>Группы</h3>
            ${compactList(groups.map((group) => `${group.role}: ${(group.items || []).join(", ")}`), "Группы не сохранены.")}
          </div>
          <div>
            <h3>Ингредиенты</h3>
            ${compactList(found.map((ingredient) => `${ingredient.name}${ingredient.ru ? ` — ${ingredient.ru}` : ""}`), "Ингредиенты не сохранены.")}
          </div>
        </div>
      </details>

      ${inspected.status !== "invalid" ? `
        <div class="history-actions">
          <button class="secondary-action compact-action" type="button" data-history-reanalyze>Повторить анализ</button>
          <span class="field-note" data-history-action-status aria-live="polite"></span>
        </div>
      ` : ""}
    </div>
  `;
}

function localAnalysisHistory() {
  return readList("analysisHistory").map((item, index) => ({
    id: item.id || `local_${index}`,
    kind: "analysis",
    title: item.title || item.productName || item.formulaType || "Локальный разбор состава",
    createdAt: item.createdAt || new Date().toISOString(),
    payload: item.payload || {
      productName: item.productName || "",
      score: item.score,
      formulaType: item.formulaType,
      analysis: item.analysis || null,
      composition: item.composition || ""
    }
  }));
}

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    currentUser = data.user || null;
    saveUser(currentUser);
  } catch {
    currentUser = null;
  }

  if (loginLink) {
    loginLink.textContent = currentUser ? "Профиль" : "Войти";
  }

  if (historyStatus) {
    historyStatus.textContent = currentUser
      ? `История загружается из аккаунта ${currentUser.email}.`
      : "Показана локальная история этого браузера. Войдите, чтобы сохранять разборы в аккаунте.";
    historyStatus.dataset.mode = currentUser ? "ok" : "warn";
  }
}

async function loadServerHistory() {
  if (!currentUser) return [];

  try {
    const response = await fetch("/api/user/history?limit=50");
    if (!response.ok) throw new Error("history failed");
    const data = await response.json();
    return data.history || [];
  } catch {
    if (historyStatus) {
      historyStatus.textContent = "Не удалось загрузить серверную историю. Попробуйте обновить страницу.";
      historyStatus.dataset.mode = "warn";
    }
    return [];
  }
}

function renderHistorySummary(serverHistory = []) {
  if (!historySummary) return;

  const searches = readList("productSearchHistory");
  const analyses = readList("analysisHistory");
  const serverAnalyses = serverHistory.filter((item) => item.kind === "analysis");

  historySummary.innerHTML = `
    <div class="mini-stats">
      <article>
        <strong>${searches.length}</strong>
        <span>локальных поисков</span>
      </article>
      <article>
        <strong>${analyses.length}</strong>
        <span>локальных разборов</span>
      </article>
      <article>
        <strong>${serverAnalyses.length}</strong>
        <span>в базе аккаунта</span>
      </article>
    </div>
  `;
}

function renderHistoryList(serverHistory = []) {
  if (!historyList) return;

  visibleHistory = currentUser ? serverHistory : localAnalysisHistory();

  if (!visibleHistory.length) {
    historyList.innerHTML = `<p class="field-note">${currentUser ? "Пока нет сохраненных разборов в аккаунте." : "Пока нет локальных сохраненных разборов в этом браузере."}</p>`;
    return;
  }

  historyList.innerHTML = visibleHistory.slice(0, 50).map((item, index) => `
    <details class="history-item" data-history-index="${index}">
      <summary>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.kind === "analysis" ? "разбор состава" : item.kind)} · ${new Date(item.createdAt).toLocaleString("ru-RU")}</small>
        </span>
        <em>Открыть</em>
      </summary>
      ${item.kind === "analysis" ? renderSavedAnalysis(item) : `<p class="field-note">Для этой записи нет детального результата.</p>`}
    </details>
  `).join("");

  historyList.querySelectorAll("[data-history-reanalyze]").forEach((button) => {
    button.addEventListener("click", () => rerunHistoryAnalysis(button));
  });
}

async function rerunHistoryAnalysis(button) {
  const container = button.closest("[data-history-index]");
  const item = visibleHistory[Number(container?.dataset.historyIndex)];
  const request = buildReanalysisRequest(item);
  const status = container?.querySelector("[data-history-action-status]");
  if (!request) {
    if (status) status.textContent = "Повторный анализ невозможен: исходный состав не сохранён.";
    return;
  }

  button.disabled = true;
  if (status) status.textContent = "Выполняю новый анализ...";
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const analysis = await response.json();
    if (!currentUser) {
      const entry = buildAnalysisHistoryEntry(request, analysis, request.evidence?.formula?.source?.name || "");
      if (!entry) throw new Error("analysis was not completed");
      const items = readList("analysisHistory");
      items.unshift({ ...entry, createdAt: new Date().toISOString() });
      localStorage.setItem("analysisHistory", JSON.stringify(items.slice(0, 50)));
    }
    await refreshHistory();
  } catch {
    button.disabled = false;
    if (status) status.textContent = "Не удалось выполнить новый анализ. Историческая запись не изменена.";
  }
}

async function refreshHistory() {
  const serverHistory = await loadServerHistory();
  renderHistorySummary(serverHistory);
  renderHistoryList(serverHistory);
}

clearHistory?.addEventListener("click", async () => {
  localStorage.removeItem("productSearchHistory");
  localStorage.removeItem("analysisHistory");

  if (currentUser) {
    try {
      await fetch("/api/user/history", { method: "DELETE" });
    } catch {
      if (historyStatus) {
        historyStatus.textContent = "Локальная история очищена, серверную не удалось очистить.";
        historyStatus.dataset.mode = "warn";
      }
    }
  }

  await refreshHistory();
});

async function initHistoryPage() {
  await loadAccount();
  await refreshHistory();
}

initHistoryPage();
