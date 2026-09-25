import { ESTADO, estadoActual } from "./domain.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Todo texto del usuario pasa por acá antes de ir a innerHTML.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const money = n => {
  const v = Number(n || 0);
  return v ? "$" + v.toLocaleString("es-AR") : "";
};

export function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function fechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function fechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

export function tsToISO(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
}

// Patente con estética de chapa Mercosur
export function plate(p, size = "") {
  if (!p) return `<span class="plate plate-empty ${size}">Sin patente</span>`;
  return `<span class="plate ${size}"><span class="plate-band"></span><span class="plate-num">${esc(p)}</span></span>`;
}

export function estadoPill(v) {
  const e = ESTADO[estadoActual(v)];
  return `<span class="pill" style="--c:${e.color}">${e.label}</span>`;
}

export function icon(name) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// ── Toasts ────────────────────────────────────────────────────
export function toast(msg, type = "info") {
  const box = $("#toasts");
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.setAttribute("role", type === "error" ? "alert" : "status");
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 250); }, type === "error" ? 5000 : 3000);
}

// ── Hojas (bottom sheet en teléfono, diálogo centrado en pantalla grande)
let sheetStack = [];
export function openSheet({ title = "", body = "", wide = false, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `
    <div class="sheet ${wide ? "sheet-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      ${title ? `<header class="sheet-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">${icon("x")}</button></header>` : ""}
      <div class="sheet-body"></div>
    </div>`;
  const bodyEl = $(".sheet-body", wrap);
  if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  document.body.appendChild(wrap);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => wrap.classList.add("in"));

  const close = () => {
    wrap.classList.remove("in");
    sheetStack = sheetStack.filter(s => s !== api);
    if (!sheetStack.length) document.body.classList.remove("no-scroll");
    setTimeout(() => wrap.remove(), 220);
    onClose?.();
  };
  wrap.addEventListener("click", e => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  const api = { el: wrap, body: bodyEl, close };
  sheetStack.push(api);
  // Foco en la hoja (no en un campo): así el teclado del celular no se abre solo
  const hoja = $(".sheet", wrap);
  hoja.tabIndex = -1;
  setTimeout(() => hoja.focus({ preventScroll: true }), 60);
  return api;
}

// Al cambiar de pantalla se cierran las ventanas abiertas
export function cerrarHojas() { [...sheetStack].forEach(h => h.close()); }
addEventListener("hashchange", cerrarHojas);

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheetStack.length) sheetStack[sheetStack.length - 1].close();
});

export function confirmar({ title, message = "", ok = "Confirmar", danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const s = openSheet({
      body: `
        <div class="confirm">
          <h2>${esc(title)}</h2>
          ${message ? `<p>${esc(message)}</p>` : ""}
          <div class="row-btns">
            <button class="btn btn-ghost" data-no>Cancelar</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(ok)}</button>
          </div>
        </div>`,
      onClose: () => { if (!done) resolve(false); }
    });
    $("[data-no]", s.el).onclick = () => { done = true; resolve(false); s.close(); };
    $("[data-yes]", s.el).onclick = () => { done = true; resolve(true); s.close(); };
  });
}

export function pedirTexto({ title, label, value = "", placeholder = "", ok = "Guardar" }) {
  return new Promise(resolve => {
    let done = false;
    const s = openSheet({
      title,
      body: `
        <form class="stack">
          <label class="field"><span>${esc(label)}</span>
            <input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" required></label>
          <button class="btn btn-primary btn-block">${esc(ok)}</button>
        </form>`,
      onClose: () => { if (!done) resolve(null); }
    });
    $("form", s.el).onsubmit = e => {
      e.preventDefault();
      done = true;
      resolve(e.target.v.value.trim());
      s.close();
    };
  });
}

export function busy(btn, on, text = "Guardando…") {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${esc(text)}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Hoja "¿Excel o PDF?" para los botones de descarga
export function elegirDescarga(titulo, { excel, pdf }) {
  const s = openSheet({
    title: "Descargar",
    body: `<div class="stack">
      <p class="muted small">${esc(titulo)}</p>
      <div class="dl-opts">
        <button class="dl-opt" data-f="excel"><span class="dl-ico xls">XLS</span><strong>Excel</strong><small>Para editar y filtrar</small></button>
        <button class="dl-opt" data-f="pdf"><span class="dl-ico pdf">PDF</span><strong>PDF</strong><small>Para enviar o imprimir</small></button>
      </div></div>`
  });
  s.body.addEventListener("click", async e => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    busy(b, true, "Armando…");
    try { await (b.dataset.f === "excel" ? excel() : pdf()); s.close(); }
    catch (err) { toast(err.message || "No se pudo descargar", "error"); busy(b, false); }
  });
}

// Marca un campo con error sin enfocarlo (así no se abre el teclado)
export function marcarError(input) {
  input.closest(".field")?.classList.add("invalid");
  input.scrollIntoView({ block: "center", behavior: "smooth" });
  input.addEventListener("input", () => input.closest(".field")?.classList.remove("invalid"), { once: true });
}
