import { ESTADO, estadoActual } from "./domain.js";
import { S } from "./data.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Todo texto del usuario pasa por acá antes de ir a innerHTML.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const pesos = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");   // planillas: siempre con número (también $0)
export const nuevoId = () => Math.random().toString(36).slice(2, 9);   // ids de filas dentro de un documento (no de Firestore)

export const money = n => {
  const v = Number(n || 0);
  return v ? "$" + v.toLocaleString("es-AR") : "";
};

export function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Hora local en formato 24 h "HH:MM"
export function horaAhora(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Hora en que se marcó peritado / reparado. Vehículos viejos: se deduce del historial si coincide la fecha.
export function horaDe(v, k) {
  if (k === "turnado") return v?.fechas?.turnado ? (v.horaTurno || "") : "";
  if (v?.horas?.[k]) return v.horas[k];
  const f = v?.fechas?.[k];
  if (!f || (k !== "peritado" && k !== "reparado")) return "";
  const h = (v.historial || []).filter(e => e?.t && (k === "peritado" ? /^Carg[oó]/.test(e.txt || "") : /^Pasó a (Reparado|Revisión)/.test(e.txt || "")));
  let t = h.length ? h[k === "peritado" ? 0 : h.length - 1].t : null;
  if (!t && k === "peritado" && v.createdAt?.toMillis) t = v.createdAt.toMillis();
  if (!t) return "";
  const d = new Date(t), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return iso === f ? horaAhora(d) : "";
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

// ── Menú "Glide Select" (como reactbits.dev/micro/glide-select): sale del chip y un resaltado se desliza entre las opciones ──
// opciones: [[valor, texto], …]. Va fijo sobre la página para que la tabla no lo recorte; se cierra al deslizar.
export function glideMenu(chip, opciones, actual, alElegir, titulo = "") {
  document.querySelector(".gs-menu")?.cerrar?.();
  const m = document.createElement("div");
  m.className = "gs-menu"; m.setAttribute("role", "listbox");
  m.innerHTML = `<span class="gs-pill" aria-hidden="true"></span>${titulo ? `<div class="gs-tit">${esc(titulo)}</div>` : ""}` + opciones.map(([k, t], i) =>
    `<div class="gs-op" role="option" data-i="${i}" aria-selected="${k === actual}"><span>${esc(t)}</span>${icon("check")}</div>`).join("");
  document.body.appendChild(m);
  const r = chip.getBoundingClientRect(), abajo = r.bottom + m.offsetHeight + 8 < innerHeight;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
  m.style.top = `${abajo ? r.bottom + 6 : r.top - m.offsetHeight - 6}px`;
  m.style.transformOrigin = abajo ? "top left" : "bottom left";
  const pill = m.firstChild, ops = [...m.querySelectorAll(".gs-op")];
  let act = Math.max(0, opciones.findIndex(([k]) => k === actual));
  const mover = (i, salto) => {
    act = i; pill.style.transitionDuration = salto ? "0ms" : "";
    pill.style.transform = `translateY(${ops[i].offsetTop}px)`; pill.style.opacity = "1";
  };
  const fuera = e => { if (!m.contains(e.target) && !chip.contains(e.target)) cerrar(); };
  const teclas = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mover((act + (e.key === "ArrowDown" ? 1 : ops.length - 1)) % ops.length); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(act); }
    else if (e.key === "Escape" || e.key === "Tab") cerrar();
  };
  const cerrar = () => {
    chip.setAttribute("aria-expanded", "false"); m.dataset.state = "closed";
    document.removeEventListener("pointerdown", fuera, true); document.removeEventListener("keydown", teclas, true);
    removeEventListener("scroll", cerrar, true); setTimeout(() => m.remove(), 140);
  };
  const elegir = i => { cerrar(); chip.focus({ preventScroll: true }); if (opciones[i][0] !== actual) alElegir(opciones[i][0]); };
  m.cerrar = cerrar;
  m.addEventListener("pointerover", e => { const o = e.target.closest(".gs-op"); if (o && e.pointerType !== "touch") mover(+o.dataset.i); });
  m.addEventListener("click", e => { const o = e.target.closest(".gs-op"); if (o) elegir(+o.dataset.i); });
  document.addEventListener("pointerdown", fuera, true); document.addEventListener("keydown", teclas, true);
  addEventListener("scroll", cerrar, true);
  chip.setAttribute("aria-expanded", "true");
  mover(act, true);
  requestAnimationFrame(() => { m.dataset.state = "open"; });
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
  // Pie fijo igual en todas las hojas: la acción principal del final abajo a la derecha, con Cancelar a la izquierda
  const ult = bodyEl.firstElementChild?.lastElementChild;
  if (ult?.matches(".btn-primary.btn-block:not([data-close])")) {
    const pie = document.createElement("div"); pie.className = "sheet-pie";
    ult.before(pie); ult.classList.remove("btn-block", "btn-lg");
    pie.innerHTML = `<button type="button" class="btn btn-ghost" data-close>Cancelar</button>`; pie.append(ult);
  }
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
  if (e.key !== "Escape") return;
  if (sheetStack.length) return sheetStack[sheetStack.length - 1].close();
  // Sin ventanas abiertas: Esc vuelve atrás como la flecha de arriba (no mientras se escribe en un campo)
  if (!e.target.closest?.("input, textarea, select, [contenteditable]")) document.getElementById("tb-back")?.click();
});

export function confirmar({ title, message = "", ok = "Confirmar", danger = false, centro = false }) {
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
    if (centro) s.el.classList.add("sheet-centro");   // en el celular, en el medio de la pantalla en vez de abajo
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

// Blobatar: avatar generado por nombre de usuario (se arma en el navegador, sin mandar datos afuera).
// Mientras carga la librería (o sin señal) quedan las iniciales.
// foto: la de WhatsApp (Cloudinary), recortada a la cara; si no hay, el blobatar
export function avatarUsuario(usuario, nombre, cls = "", foto = "") {
  if (/^https:\/\/res\.cloudinary\.com\//.test(foto || "")) return `<span class="avatar ${cls}"><img src="${esc(foto.replace("/upload/", "/upload/c_fill,g_face,w_160,h_160,q_auto,f_auto/"))}" alt="" loading="lazy"></span>`;
  return `<span class="avatar ${cls}" data-blob="${esc(usuario || nombre || "")}">${esc(initials(nombre || usuario || ""))}</span>`;
}
// Solo celestes y azules (tono OKLCH 195°–265°). Los del operativo se reparten en orden alfabético para no repetirse
// (tono y claridad alternados); los de afuera caen en un lugar fijo según el nombre.
function colorBlob(u) {
  const lista = Object.values(S.company?.memberUsers || {}).filter(Boolean).map(x => x.toLowerCase()).sort();
  let i = lista.indexOf(u), n = lista.length;
  if (i < 0) { n = 12; i = [...u].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7) % n; }
  // tonos de la librería con color (los de .2–.36 y .93+ salen casi blancos o grises)
  return { hue: 195 + 70 * i / Math.max(n, 1), tone: [.5, .7, .85][i % 3] };
}
import("https://cdn.jsdelivr.net/npm/blobatar@2.7.0/+esm").then(({ blobatar }) => {
  const pintar = raiz => raiz.querySelectorAll("[data-blob]:not(.con-blob)").forEach(el => {
    if (!el.dataset.blob) return;
    const u = el.dataset.blob.toLowerCase();
    el.innerHTML = blobatar(u, colorBlob(u)); el.classList.add("con-blob");
  });
  pintar(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && pintar(n.parentNode || n))))
    .observe(document.body, { childList: true, subtree: true });
}).catch(() => {});

// ── Desplegables: todos los <select> se muestran con el menú de la app (glideMenu), no el del navegador ──
// El select queda oculto en el formulario (sigue mandando su valor); el botón muestra la opción elegida.
function lindo(sel) {
  if (sel.dataset.lindo || sel.multiple) return;
  sel.dataset.lindo = "1";
  const b = document.createElement("button");
  b.type = "button"; b.className = "sel-btn " + (sel.className || ""); b.setAttribute("aria-haspopup", "listbox");
  if (sel.getAttribute("aria-label")) b.setAttribute("aria-label", sel.getAttribute("aria-label"));
  const pintar = () => { b.innerHTML = `<span>${esc(sel.selectedOptions[0]?.textContent || "—")}</span>${icon("next")}`; b.disabled = sel.disabled; };
  pintar(); sel.after(b); sel.classList.add("sel-oculto");
  sel.addEventListener("change", pintar);
  new MutationObserver(pintar).observe(sel, { childList: true, subtree: true, attributes: true });
  b.addEventListener("click", () => {
    glideMenu(b, [...sel.options].map(o => [o.value, o.textContent]), sel.value, v => { sel.value = v; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); });
    const m = document.querySelector(".gs-menu"); if (m) m.style.minWidth = b.offsetWidth + "px";
  });
}
// Campos con sugerencias (<input list>): la lista sale debajo del campo, filtrada con lo que se escribe, en vez de la del navegador
const sinTilde = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function sugerir(inp) {
  if (inp.dataset.lista) return;
  inp.dataset.lista = inp.getAttribute("list"); inp.removeAttribute("list");
  let caja = null, act = -1;
  const cerrar = () => { caja?.remove(); caja = null; act = -1; };
  const marcar = i => { const ops = caja ? [...caja.children] : []; act = i; ops.forEach((o, j) => o.classList.toggle("on", j === i)); ops[i]?.scrollIntoView({ block: "nearest" }); };
  const poner = t => { inp.value = t; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); cerrar(); };
  const abrir = () => {
    const q = sinTilde(inp.value.trim());
    const ops = [...(document.getElementById(inp.dataset.lista)?.options || [])].map(o => o.value).filter(v => v && (!q || sinTilde(v).includes(q)) && sinTilde(v) !== q).slice(0, 8);
    if (!ops.length) return cerrar();
    if (!caja) { caja = document.createElement("div"); caja.className = "sug-lista"; caja.setAttribute("role", "listbox"); document.body.appendChild(caja);
      caja.addEventListener("pointerdown", e => e.preventDefault());   // no le saca el foco al campo
      caja.addEventListener("click", e => { const o = e.target.closest(".sug-op"); if (o) poner(o.textContent); }); }
    caja.innerHTML = ops.map(v => `<div class="sug-op" role="option">${esc(v)}</div>`).join(""); act = -1;
    const r = inp.getBoundingClientRect(), abajo = innerHeight - r.bottom > 220 || r.top < 220;
    Object.assign(caja.style, { left: r.left + "px", width: r.width + "px", top: abajo ? r.bottom + 4 + "px" : "", bottom: abajo ? "" : innerHeight - r.top + 4 + "px" });
  };
  inp.addEventListener("input", e => { if (e.isTrusted) abrir(); });
  inp.addEventListener("focus", abrir);
  inp.addEventListener("blur", () => setTimeout(cerrar, 120));
  inp.addEventListener("keydown", e => {
    if (!caja) return;
    const n = caja.children.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); marcar((act + (e.key === "ArrowDown" ? 1 : n - 1)) % n); }
    else if (e.key === "Enter" && act >= 0) { e.preventDefault(); poner(caja.children[act].textContent); }
    else if (e.key === "Escape") { e.stopPropagation(); cerrar(); }
  });
  addEventListener("scroll", e => { if (caja && !caja.contains(e.target)) cerrar(); }, true);
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) {
  (n.matches("select") ? [n] : n.querySelectorAll("select")).forEach(lindo);
  (n.matches("input[list]") ? [n] : n.querySelectorAll("input[list]")).forEach(sugerir);
} })
  .observe(document.documentElement, { childList: true, subtree: true });
// Formato de WhatsApp en el chat en vivo: *negrita*, _cursiva_ y ~tachado~ (sobre el texto ya escapado; el signo va pegado al texto, como en WhatsApp)
export const formatoWa = t => [["*", "b"], ["_", "i"], ["~", "s"]].reduce((s, [m, tag]) => {
  const e = "\\" + m;
  return s.replace(new RegExp(`(^|[\\s([{¿¡])${e}([^\\s${e}](?:[^${e}\\n]*[^\\s${e}])?)${e}(?=$|[\\s.,;:!?)\\]}])`, "gm"), `$1<${tag}>$2</${tag}>`);
}, esc(t));
console.assert(formatoWa("Hola *Juan*, tu _auto_ ~no~ está") === "Hola <b>Juan</b>, tu <i>auto</i> <s>no</s> está" && formatoWa("2*3*4") === "2*3*4" && formatoWa("* suelto *") === "* suelto *", "formatoWa");
// Foto de perfil del cliente (la de WhatsApp, la guarda el servidor) o su inicial
export const avatarCliente = c => c?.foto ? `<img class="chat-ava" src="${esc(c.foto)}" alt="" loading="lazy">`
  : `<span class="chat-ava chat-ava-ini" aria-hidden="true">${esc(String(c?.nombre || c?.modelo || "?").trim().charAt(0).toUpperCase() || "?")}</span>`;
