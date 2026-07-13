const accountTitle = document.querySelector("#accountTitle");
const accountStatus = document.querySelector("#accountStatus");
const loginLink = document.querySelector("#loginLink");
const logoutButton = document.querySelector("#logoutButton");

let currentUser = null;

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

logoutButton?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  saveUser(null);
  currentUser = null;
  await loadAccount();
});

window.addEventListener("themechange", (event) => {
  saveSettings({ theme: event.detail?.theme || "fresh" });
});

async function initSettingsPage() {
  await loadAccount();
  const authCode = new URLSearchParams(window.location.search).get("auth");
  if (authCode === "google_ok" && accountStatus) {
    accountStatus.textContent = "Вы вошли через Google. История и настройки будут сохраняться в аккаунте.";
    accountStatus.dataset.mode = "ok";
    window.history.replaceState({}, "", "/settings");
  }
}

initSettingsPage();
