const form = document.querySelector("#loginForm");
const status = document.querySelector("#loginStatus");
const title = document.querySelector("#authTitle");
const submit = document.querySelector("#authSubmit");
const tabs = document.querySelectorAll("[data-auth-mode]");
const providerButtons = document.querySelectorAll("[data-provider]");
const passwordInput = document.querySelector("#loginPassword");
const passwordToggle = document.querySelector("#passwordToggle");

let mode = "login";

function setStatus(text, nextMode = "") {
  if (!status) return;
  status.textContent = text;
  status.dataset.mode = nextMode;
}

function saveUser(user) {
  localStorage.setItem("demoUser", JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    signedInAt: new Date().toISOString()
  }));
}

function showAuthCallbackStatus() {
  const authCode = new URLSearchParams(window.location.search).get("auth");
  if (!authCode) return;

  const messages = {
    google_not_configured: "Google-вход почти готов: добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на сервере.",
    google_denied: "Google-вход отменен.",
    google_invalid: "Google-вход не прошел проверку безопасности. Попробуйте еще раз.",
    google_email_unverified: "Google не подтвердил email этого аккаунта.",
    google_failed: "Не удалось войти через Google. Попробуйте еще раз или используйте email."
  };

  setStatus(messages[authCode] || "Google-вход не завершен.", authCode === "google_denied" ? "warn" : "warn");
  window.history.replaceState({}, "", "/login");
}

function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.authMode === mode)));
  title.textContent = mode === "register" ? "Создать аккаунт" : "Войти в аккаунт";
  submit.textContent = mode === "register" ? "Зарегистрироваться" : "Войти по почте";
  document.querySelector("#loginName").closest("label").hidden = mode !== "register";
}

async function requestAuth(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось выполнить вход.");
  return data;
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    if (data.user) {
      saveUser(data.user);
      setStatus(`Вы уже вошли: ${data.user.email}. Можно переходить к анализу или настройкам.`, "ok");
      setTimeout(() => { window.location.href = "/profile"; }, 350);
    }
  } catch {
    // Login form remains available when the status check is unavailable.
  }
}

async function loadGoogleAuthStatus() {
  try {
    const response = await fetch("/api/auth/google/status");
    if (!response.ok) return;
    const data = await response.json();
    if (data.configured) {
      setStatus("Google-вход настроен. Можно войти через Google аккаунт.", "ok");
      return;
    }

    const missing = (data.missing || []).join(", ");
    setStatus(`Google-вход ожидает настройку: ${missing || "OAuth ключи"}. Callback: ${data.redirectUri}`, "warn");
  } catch {
    // Email login remains available when status probing fails.
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.authMode));
});

providerButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const provider = button.dataset.provider;
    if (provider === "google") {
      setStatus("Перенаправляю на Google...");
      window.location.href = "/api/auth/google";
      return;
    }

    try {
      const response = await fetch(`/api/auth/oauth/${provider}`, { method: "POST" });
      const data = await response.json();
      setStatus(data.error || `${provider} будет подключен позже.`, "warn");
    } catch {
      setStatus(`${provider} вход требует настройки OAuth на сервере.`, "warn");
    }
  });
});

passwordToggle?.addEventListener("click", () => {
  const isVisible = passwordInput.type === "text";
  passwordInput.type = isVisible ? "password" : "text";
  passwordToggle.textContent = isVisible ? "Показать" : "Скрыть";
  passwordToggle.setAttribute("aria-label", isVisible ? "Показать пароль" : "Скрыть пароль");
  passwordToggle.setAttribute("aria-pressed", String(!isVisible));
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.querySelector("#loginEmail")?.value.trim();
  const password = document.querySelector("#loginPassword")?.value || "";
  const name = document.querySelector("#loginName")?.value.trim() || "";

  if (!email || !password) {
    setStatus("Введите почту и пароль.", "warn");
    return;
  }

  submit.disabled = true;
  setStatus(mode === "register" ? "Создаю аккаунт..." : "Проверяю данные...");

  try {
    const data = await requestAuth(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
      email,
      password,
      name
    });
    saveUser(data.user);
    setStatus(`Готово. Вы вошли как ${data.user.email}. История и настройки будут сохраняться в базе.`, "ok");
    setTimeout(() => { window.location.href = "/"; }, 650);
  } catch (error) {
    setStatus(error.message, "warn");
  } finally {
    submit.disabled = false;
  }
});

setMode("login");
showAuthCallbackStatus();
loadGoogleAuthStatus();
loadCurrentUser();
