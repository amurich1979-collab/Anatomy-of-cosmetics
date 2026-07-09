const THEMES = {
  fresh: "День",
  dark: "Ночь"
};

const STORAGE_KEY = "theme";

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Theme still works for the current page when storage is unavailable.
  }
}

function setTheme(theme) {
  const nextTheme = THEMES[theme] ? theme : "fresh";
  document.documentElement.dataset.theme = nextTheme;
  writeStoredTheme(nextTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = THEMES[nextTheme];
    button.setAttribute("aria-pressed", String(nextTheme === "dark"));
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

setTheme(readStoredTheme() || document.documentElement.dataset.theme || "fresh");

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-theme-toggle]");
  if (button) cycleTheme();
});

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

window.themeControls = {
  themes: THEMES,
  setTheme,
  getTheme: () => document.documentElement.dataset.theme || "fresh"
};
