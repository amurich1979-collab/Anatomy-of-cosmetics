const form = document.querySelector("#loginForm");
const status = document.querySelector("#loginStatus");

function saveDemoUser(provider, email = "") {
  const user = {
    provider,
    email,
    name: email || provider,
    signedInAt: new Date().toISOString()
  };
  localStorage.setItem("demoUser", JSON.stringify(user));
  status.textContent = provider === "email"
    ? "Демо-профиль сохранен локально. Реальная почтовая авторизация подключается на сервере."
    : `${provider} выбран как будущий способ входа. Для реального входа нужны OAuth-настройки.`;
  status.dataset.mode = "ok";
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.querySelector("#loginEmail")?.value.trim();
  if (!email) {
    status.textContent = "Введите почту для демо-входа.";
    status.dataset.mode = "warn";
    return;
  }
  saveDemoUser("email", email);
});

document.querySelectorAll("[data-provider]").forEach((button) => {
  button.addEventListener("click", () => saveDemoUser(button.dataset.provider));
});
