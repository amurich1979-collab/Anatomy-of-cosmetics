const THEMES = {
  fresh: "День",
  rose: "Роза",
  clinic: "Клиника",
  dark: "Ночь"
};

const STORAGE_KEY = "theme";

function setTheme(theme) {
  const nextTheme = THEMES[theme] ? theme : "fresh";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(STORAGE_KEY, nextTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = nextTheme === "dark" ? "Ночь" : "День";
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === nextTheme));
  });

  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: nextTheme } }));
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme || "fresh";
  setTheme(current === "dark" ? "fresh" : "dark");
}

setTheme(localStorage.getItem(STORAGE_KEY) || document.documentElement.dataset.theme || "fresh");

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", cycleTheme);
});

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

window.themeControls = {
  themes: THEMES,
  setTheme,
  getTheme: () => document.documentElement.dataset.theme || "fresh"
};
