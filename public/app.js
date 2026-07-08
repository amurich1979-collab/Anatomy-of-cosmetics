const form = document.querySelector("#analysisForm");
const result = document.querySelector("#result");
const productName = document.querySelector("#productName");
const productSuggestions = document.querySelector("#productSuggestions");
const productStatus = document.querySelector("#productStatus");
const composition = document.querySelector("#composition");
const sampleChips = document.querySelectorAll(".sample-chip");
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(items, emptyText) {
  if (!items?.length) return `<p class="muted">${emptyText}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function cards(items, emptyText) {
  if (!items?.length) return `<p class="muted">${emptyText}</p>`;
  return `
    <div class="insight-list">
      ${items.map((item) => `<article class="insight-card">${escapeHtml(item)}</article>`).join("")}
    </div>
  `;
}

function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function normalizeProductText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setProductStatus(text, mode = "") {
  if (!productStatus) return;
  productStatus.textContent = text;
  productStatus.dataset.mode = mode;
  productStatus.hidden = !text;
}

function hideSuggestions() {
  if (!productSuggestions) return;
  productSuggestions.hidden = true;
  productSuggestions.innerHTML = "";
}

function applyProduct(product) {
  productName.value = `${product.brand} ${product.name}`.trim();
  composition.value = product.composition;
  hideSuggestions();

  const source = product.verified
    ? product.source
    : `${product.source}, проверьте состав по этикетке`;
  const verifiedAt = product.verifiedAt ? ` Проверено: ${product.verifiedAt}.` : "";
  setProductStatus(`Состав подставлен: ${source}.${verifiedAt}`, product.verified ? "ok" : "warn");
}

async function requestProductReview(query) {
  const response = await fetch("/api/products/review-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, source: "web-search-field" })
  });

  if (!response.ok) throw new Error("Review request failed");
  return response.json();
}

function renderReviewRequest(query) {
  productSuggestions.innerHTML = `
    <div class="suggestion-empty">
      <p>Пока нет проверенного состава для этого средства.</p>
      <button class="review-request-button" type="button">Отправить на проверку</button>
    </div>
  `;
  productSuggestions.hidden = false;

  productSuggestions.querySelector(".review-request-button")?.addEventListener("click", async () => {
    try {
      await requestProductReview(query);
      hideSuggestions();
      setProductStatus("Запрос добавлен в очередь проверки. Чем чаще средство ищут, тем выше приоритет.", "ok");
    } catch {
      setProductStatus("Не удалось добавить запрос. Попробуйте позже или вставьте INCI вручную.", "warn");
    }
  });
}

function renderSuggestions(products) {
  if (!productSuggestions) return false;

  const query = normalizeProductText(productName.value);
  const exactVerified = products.find((product) => {
    const fullName = normalizeProductText(`${product.brand} ${product.name}`);
    const nameOnly = normalizeProductText(product.name);
    return product.verified && (query === fullName || query === nameOnly);
  });

  if (exactVerified || (products.length === 1 && products[0].verified)) {
    applyProduct(exactVerified || products[0]);
    return true;
  }

  if (!products.length) {
    renderReviewRequest(productName.value.trim());
    return false;
  }

  productSuggestions.innerHTML = products
    .map((product, index) => `
      <button class="suggestion" type="button" data-index="${index}">
        <strong>${escapeHtml(product.name)} <em>${escapeHtml(product.trustLabel || "Источник")}</em></strong>
        <span>${escapeHtml(product.brand)} · ${escapeHtml(product.category || "категория не указана")}</span>
        <small>${escapeHtml(product.source)}${product.verifiedAt ? ` · ${escapeHtml(product.verifiedAt)}` : ""}${product.verified ? "" : " · проверьте по этикетке"}</small>
      </button>
    `)
    .join("");
  productSuggestions.hidden = false;

  productSuggestions.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      applyProduct(products[Number(button.dataset.index)]);
    });
  });

  return false;
}

async function searchProductByName(query) {
  const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("Search failed");
  return response.json();
}

const searchProducts = debounce(async () => {
  const query = productName?.value.trim() || "";

  if (query.length < 2) {
    hideSuggestions();
    setProductStatus("");
    return;
  }

  setProductStatus("Ищу состав по названию...");

  try {
    const data = await searchProductByName(query);
    const wasApplied = renderSuggestions(data.products || []);
    if (wasApplied) return;

    setProductStatus(
      data.products?.length
        ? "Выберите средство из списка, чтобы подставить INCI."
        : "Не нашла состав по названию. Уточните бренд или вставьте INCI вручную.",
      data.products?.length ? "ok" : "warn"
    );
  } catch {
    hideSuggestions();
    setProductStatus("Поиск временно недоступен. Состав можно вставить вручную.", "warn");
  }
});

productName?.addEventListener("input", searchProducts);

sampleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    productName.value = chip.dataset.query || "";
    productName.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

function render(data) {
  const expertSummary = cards(data.expertSummary, "Недостаточно данных для экспертной сводки.");
  const routineAdvice = list(data.routineAdvice, "Нет специальных рекомендаций по введению.");
  const questions = list(data.questions, "Уточняющих вопросов не сформировано.");
  const architecture = data.architecture?.length
    ? `
      <div class="architecture-grid">
        ${data.architecture
          .map((item) => `
            <article class="architecture-card">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.text)}</p>
            </article>
          `)
          .join("")}
      </div>
    `
    : `<p class="muted">Пока недостаточно распознанных компонентов, чтобы описать структуру формулы.</p>`;

  const groups = data.groups
    .map((group) => `
      <article class="tile">
        <h3>${escapeHtml(group.role)}</h3>
        <p>${escapeHtml(group.items.join(", "))}</p>
      </article>
    `)
    .join("");

  const found = data.found
    .map((item) => `
      <article class="ingredient">
        <div>
          <h3>${escapeHtml(item.name)} <span>${escapeHtml(item.ru || "")}</span></h3>
          <p>${escapeHtml(item.note)}</p>
        </div>
        <dl>
          <dt>Позиция</dt>
          <dd>${item.position}</dd>
          <dt>Зона</dt>
          <dd>${escapeHtml(item.concentration)}</dd>
        </dl>
      </article>
    `)
    .join("");

  const unknown = data.unknown
    .slice(0, 16)
    .map((item) => `${item.input} (${item.concentration})`);
  const unknownSection = unknown.length
    ? `
      <section class="section">
        <h2>Что требует проверки</h2>
        <p class="muted">Эти позиции не найдены в текущей базе MVP. Их стоит сверить по этикетке или расширенной базе ингредиентов.</p>
        ${list(unknown, "Все ингредиенты из состава распознаны базой MVP.")}
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `
    : `
      <section class="section">
        <h2>Ограничения анализа</h2>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      </section>
    `;

  result.innerHTML = `
    <div class="score">
      <div class="score-number">
        <p class="eyebrow">Итог</p>
        <h2>${escapeHtml(data.score.score)}/100</h2>
        <p>${escapeHtml(data.score.label)}</p>
      </div>
      <div>
        <h2>${escapeHtml(data.formulaType)}</h2>
        <p>${escapeHtml(data.summary)}</p>
        <p class="confidence">Уверенность: ${escapeHtml(data.confidence?.label || "неизвестно")} · ${escapeHtml(data.confidence?.text || "")}</p>
      </div>
    </div>

    <section class="section">
      <h2>Главный вывод</h2>
      ${expertSummary}
    </section>

    <section class="section">
      <h2>Как устроена формула</h2>
      ${architecture}
    </section>

    <section class="section">
      <h2>Группы компонентов</h2>
      <div class="tiles">${groups || '<p class="muted">Пока недостаточно распознанных компонентов.</p>'}</div>
    </section>

    <section class="section two">
      <div>
        <h2>Может быть полезно при</h2>
        ${list(data.positives, "По текущей базе MVP нет уверенных выводов.")}
      </div>
      <div>
        <h2>На что обратить внимание</h2>
        ${list(data.warnings, "Явных красных флагов в базе MVP не найдено.")}
      </div>
    </section>

    <section class="section two">
      <div>
        <h2>Как вводить в уход</h2>
        ${routineAdvice}
      </div>
      <div>
        <h2>Что спросить у косметолога</h2>
        ${questions}
      </div>
    </section>

    <section class="section">
      <h2>Распознанные ингредиенты</h2>
      <div class="ingredients">${found || '<p class="muted">Нет совпадений в базе MVP.</p>'}</div>
    </section>

    ${unknownSection}
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    text: composition.value,
    profile: {
      skinType: document.querySelector("#skinType").value,
      context: document.querySelector("#context").value,
      concerns: document.querySelector("#concerns").value
    }
  };

  result.innerHTML = `<div class="loading">Разбираю состав...</div>`;

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    result.innerHTML = `<div class="error">Не удалось разобрать состав. Проверьте текст и попробуйте еще раз.</div>`;
    return;
  }

  render(await response.json());
});
