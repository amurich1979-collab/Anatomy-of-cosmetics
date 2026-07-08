const reviewQueue = document.querySelector("#reviewQueue");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "нет даты";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function loadQueue() {
  reviewQueue.innerHTML = `<div class="loading">Загружаю очередь...</div>`;
  const response = await fetch("/api/products/review-queue");

  if (!response.ok) {
    reviewQueue.innerHTML = `<div class="error">Не удалось загрузить очередь проверки.</div>`;
    return;
  }

  const data = await response.json();
  const requests = data.requests || [];

  if (!requests.length) {
    reviewQueue.innerHTML = `<p class="muted">Очередь пустая. Новые запросы появятся здесь после кнопки “Отправить на проверку”.</p>`;
    return;
  }

  reviewQueue.innerHTML = `
    <div class="review-list">
      ${requests
        .map((request) => `
          <article class="review-item">
            <div>
              <h2>${escapeHtml(request.query)}</h2>
              <p>${escapeHtml(request.status)} · ${escapeHtml(request.source || "web")}</p>
            </div>
            <dl>
              <dt>Запросов</dt>
              <dd>${escapeHtml(request.count || 1)}</dd>
              <dt>Создано</dt>
              <dd>${escapeHtml(formatDate(request.createdAt))}</dd>
              <dt>Последний</dt>
              <dd>${escapeHtml(formatDate(request.lastRequestedAt))}</dd>
            </dl>
          </article>
        `)
        .join("")}
    </div>
  `;
}

loadQueue();
