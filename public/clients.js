const list = document.querySelector("#clientList");
const filters = document.querySelector("#filters");
const dialog = document.querySelector("#clientDialog");
const form = document.querySelector("#clientForm");
const toast = document.querySelector("#toast");
let letter = "";
let clients = [];

function notify(message, error = false) { toast.textContent = message; toast.className = `toast${error ? " error" : ""}`; toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.hidden = true, 3500); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" }[c])); }
function date(value) { return value ? new Intl.DateTimeFormat("ru", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(value)) : "—"; }
function initials(name) { return String(name).split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase(); }

async function api(url, options) { const response = await fetch(url, options); if (response.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; throw new Error("Необходим вход"); } const data = await response.json().catch(() => ({})); if (response.status === 403 && data.error) { const me = await fetch("/api/auth/me").then((r) => r.json()); if (me.user?.role === "client") location.href = "/portal"; } if (!response.ok) throw new Error(data.error || "Ошибка запроса"); return data; }

function render() {
  let rows = [...clients];
  const last = filters.lastVisit.value; const next = filters.nextVisit.value;
  if (last) rows = rows.filter((item) => String(item.lastVisitAt || "").slice(0,10) === last);
  if (next) rows = rows.filter((item) => String(item.nextVisitAt || "").slice(0,10) === next);
  if (filters.sort.value === "last") rows.sort((a,b) => String(b.lastVisitAt || "").localeCompare(String(a.lastVisitAt || "")));
  if (filters.sort.value === "next") rows.sort((a,b) => String(a.nextVisitAt || "9999").localeCompare(String(b.nextVisitAt || "9999")));
  if (!rows.length) { list.innerHTML = '<div class="crm-card empty-state">Клиенты по выбранным условиям не найдены.</div>'; return; }
  list.innerHTML = rows.map((item) => `<a class="client-row" href="/clients/${encodeURIComponent(item.id)}"><span class="avatar">${escapeHtml(initials(item.fullName))}</span><span class="client-main"><strong>${escapeHtml(item.fullName)}</strong><span>${escapeHtml(item.email || "Без email")}</span></span><span class="client-meta"><small>Телефон</small>${escapeHtml(item.phone || "—")}</span><span class="client-meta"><small>Последний визит</small>${date(item.lastVisitAt)}</span><span class="client-meta"><small>Следующий визит</small>${date(item.nextVisitAt)}</span>${item.hasWarning ? '<span class="warning-dot" title="Важное предупреждение"></span>' : '<span></span>'}</a>`).join("");
}

async function load() {
  const data = new FormData(filters); const params = new URLSearchParams();
  if (data.get("q")) params.set("q", data.get("q")); if (letter) params.set("letter", letter);
  for (const key of ["hasContraindications","followUp","noVisits"]) if (data.get(key)) params.set(key, "true");
  try { clients = (await api(`/api/crm/clients?${params}`)).clients; render(); } catch (error) { list.innerHTML = `<div class="crm-card empty-state">${escapeHtml(error.message)}</div>`; }
}

document.querySelector("#alphabet").innerHTML = ["Все",..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ"].map((char) => `<button type="button" data-letter="${char === "Все" ? "" : char}">${char}</button>`).join("");
document.querySelector("#alphabet").addEventListener("click", (event) => { const button = event.target.closest("button"); if (!button) return; letter = button.dataset.letter; load(); });
let timer; filters.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); }); filters.addEventListener("change", load);
document.querySelector("#addClient").addEventListener("click", () => dialog.showModal()); document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
form.addEventListener("submit", async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(form)); try { const { client } = await api("/api/crm/clients", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); location.href = `/clients/${client.id}`; } catch (error) { notify(error.message, true); } });
load();
