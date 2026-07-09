const historySummary = document.querySelector("#historySummary");
const historyList = document.querySelector("#historyList");
const clearHistory = document.querySelector("#clearHistory");
const accountTitle = document.querySelector("#accountTitle");
const accountStatus = document.querySelector("#accountStatus");
const loginLink = document.querySelector("#loginLink");
const logoutButton = document.querySelector("#logoutButton");

let currentUser = null;

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

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    currentUser = data.user || null;
    saveUser(currentUser);
  } catch {
    currentUser = null;
  }

  if (currentUser) {
    accountTitle.textContent = currentUser.email;
    accountStatus.textContent = "Аккаунт активен. Настройки и новые разборы сохраняются на сервере.";
    accountStatus.dataset.mode = "ok";
    loginLink.textContent = "Профиль";
    logoutButton.hidden = false;
  } else {
    accountTitle.textContent = "Гостевой режим";
    accountStatus.textContent = "Войдите, чтобы история и тема сохранялись в базе, а не только в этом браузере.";
    accountStatus.dataset.mode = "warn";
    loginLink.textContent = "Войти";
    logoutButton.hidden = true;
  }
}

async function saveSettings(settings) {
  if (!currentUser) return;

  try {
    await fetch("/api/user/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings })
    });
  } catch {
    accountStatus.textContent = "Тема применена локально, но сервер временно не сохранил настройку.";
    accountStatus.dataset.mode = "warn";
  }
}

async function loadServerHistory() {
  if (!currentUser) return [];

  try {
    const response = await fetch("/api/user/history?limit=20");
    if (!response.ok) throw new Error("history failed");
    const data = await response.json();
    return data.history || [];
  } catch {
    return [];
  }
}

function renderHistorySummary(serverHistory = []) {
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

  if (!currentUser) {
    historyList.innerHTML = `<p class="field-note">Серверная история появится после входа в аккаунт.</p>`;
    return;
  }

  if (!serverHistory.length) {
    historyList.innerHTML = `<p class="field-note">Пока нет сохраненных разборов в аккаунте.</p>`;
    return;
  }

  historyList.innerHTML = serverHistory.slice(0, 8).map((item) => `
    <article class="history-item">
      <strong>${item.title}</strong>
      <span>${item.kind === "analysis" ? "разбор состава" : item.kind} · ${new Date(item.createdAt).toLocaleString("ru-RU")}</span>
    </article>
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
      accountStatus.textContent = "Локальная история очищена, серверную не удалось очистить.";
      accountStatus.dataset.mode = "warn";
    }
  }

  refreshHistory();
});

logoutButton?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  saveUser(null);
  currentUser = null;
  await loadAccount();
  await refreshHistory();
});

window.addEventListener("themechange", (event) => {
  saveSettings({ theme: event.detail?.theme || "fresh" });
});

async function initSettingsPage() {
  await loadAccount();
  await refreshHistory();
}

initSettingsPage();
