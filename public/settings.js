const historySummary = document.querySelector("#historySummary");
const clearHistory = document.querySelector("#clearHistory");

function currentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("demoUser") || "null");
    return user?.email || user?.provider || "anonymous";
  } catch {
    return "anonymous";
  }
}

async function saveSettings(settings) {
  try {
    await fetch("/api/user/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-demo-user": currentUserId()
      },
      body: JSON.stringify({ settings })
    });
  } catch {
    // The local theme still works if the demo API is unavailable.
  }
}

function readList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function renderHistorySummary() {
  const searches = readList("productSearchHistory");
  const analyses = readList("analysisHistory");
  const user = JSON.parse(localStorage.getItem("demoUser") || "null");

  historySummary.innerHTML = `
    <div class="mini-stats">
      <article>
        <strong>${searches.length}</strong>
        <span>поисков</span>
      </article>
      <article>
        <strong>${analyses.length}</strong>
        <span>разборов</span>
      </article>
      <article>
        <strong>${user ? "есть" : "нет"}</strong>
        <span>демо-профиль</span>
      </article>
    </div>
  `;
}

clearHistory?.addEventListener("click", () => {
  localStorage.removeItem("productSearchHistory");
  localStorage.removeItem("analysisHistory");
  renderHistorySummary();
});

window.addEventListener("themechange", (event) => {
  saveSettings({ theme: event.detail?.theme || "fresh" });
});

renderHistorySummary();
