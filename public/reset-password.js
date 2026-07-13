const resetForm = document.querySelector("#resetForm");
const resetEmail = document.querySelector("#resetEmail");
const resetPassword = document.querySelector("#resetPassword");
const resetPasswordToggle = document.querySelector("#resetPasswordToggle");
const resetStatus = document.querySelector("#resetStatus");
const resetSubmit = document.querySelector("#resetSubmit");
const requestStep = document.querySelector("#requestStep");
const confirmStep = document.querySelector("#confirmStep");
const resetTitle = document.querySelector("#resetTitle");
const resetEyebrow = document.querySelector("#resetEyebrow");

const resetToken = new URLSearchParams(window.location.search).get("token") || "";

function setResetStatus(text, mode = "") {
  resetStatus.textContent = text;
  resetStatus.dataset.mode = mode;
}

function setConfirmMode() {
  requestStep.hidden = true;
  confirmStep.hidden = false;
  resetTitle.textContent = "Новый пароль";
  resetEyebrow.textContent = "Смена пароля";
  resetSubmit.textContent = "Сохранить пароль";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось выполнить запрос.");
  return data;
}

resetPasswordToggle?.addEventListener("click", () => {
  const isVisible = resetPassword.type === "text";
  resetPassword.type = isVisible ? "password" : "text";
  resetPasswordToggle.textContent = isVisible ? "Показать" : "Скрыть";
  resetPasswordToggle.setAttribute("aria-label", isVisible ? "Показать пароль" : "Скрыть пароль");
  resetPasswordToggle.setAttribute("aria-pressed", String(!isVisible));
});

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetSubmit.disabled = true;

  try {
    if (resetToken) {
      const password = resetPassword.value || "";
      if (password.length < 8) {
        setResetStatus("Пароль должен быть не короче 8 символов.", "warn");
        return;
      }

      const data = await postJson("/api/auth/password-reset/confirm", { token: resetToken, password });
      setResetStatus(data.message || "Пароль обновлен.", "ok");
      setTimeout(() => { window.location.href = "/profile"; }, 700);
      return;
    }

    const email = resetEmail.value.trim();
    await postJson("/api/auth/password-reset/request", { email });
    setResetStatus("Если такой email зарегистрирован, ссылка для восстановления будет отправлена. В тестовом режиме ссылка также выводится в консоль сервера.", "ok");
  } catch (error) {
    setResetStatus(error.message, "warn");
  } finally {
    resetSubmit.disabled = false;
  }
});

if (resetToken) {
  setConfirmMode();
}
