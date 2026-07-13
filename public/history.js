const historySummary = document.querySelector("#historySummary");
const historyList = document.querySelector("#historyList");
const clearHistory = document.querySelector("#clearHistory");
const historyStatus = document.querySelector("#historyStatus");
const loginLink = document.querySelector("#loginLink");

let currentUser = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
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

function renderSavedAnalysis(item) {
  const payload = historyPayload(item);
  const analysis = payload.analysis || {};
  const warnings = analysis.warnings || [];
  const positives = analysis.positives || [];
  const found = analysis.found || [];
  const groups = analysis.groups || [];
  const composition = payload.composition || "";

  return `
    <div class="history-detail">
      <div class="history-metrics">
        <article>
          <strong>${escapeHtml(analysis.score?.score ?? payload.score ?? "—")}</strong>
          <span>оценка</span>
        </article>
        <article>
          <strong>${escapeHtml(analysis.hydration_score ?? "—")}</strong>
          <span>увлажнение</span>
        </article>
        <article>
          <strong>${escapeHtml(analysis.irritation_risk ?? "—")}</strong>
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

  const visibleHistory = currentUser ? serverHistory : localAnalysisHistory();

  if (!visibleHistory.length) {
    historyList.innerHTML = `<p class="field-note">${currentUser ? "Пока нет сохраненных разборов в аккаунте." : "Пока нет локальных сохраненных разборов в этом браузере."}</p>`;
    return;
  }

  historyList.innerHTML = visibleHistory.slice(0, 50).map((item) => `
    <details class="history-item">
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
