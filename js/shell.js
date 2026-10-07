import { S } from "./data.js";
import { $, $$, esc, icon, initials } from "./ui.js";
import { ROLES } from "./domain.js";
import { avatar } from "./media.js";

export const go = hash => { if (location.hash !== hash) location.hash = hash; };
export const esAncho = () => matchMedia("(min-width: 1100px)").matches;

// title: texto; back: hash o true (history.back); actions: HTML de botones
export function setTopbar({ title = "", back = null, actions = "", sub = "" } = {}) {
  const tb = $("#topbar");
  const backBtn = back
    ? `<button class="icon-btn" id="tb-back" aria-label="Volver">${icon("back")}</button>`
    : `<button class="tb-company" id="tb-company" aria-label="Cambiar de operativo">
         ${logoOperativo("sm")}</button>`;
  tb.innerHTML = `
    ${backBtn}
    <div class="tb-title"><h1>${esc(title)}</h1>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
    <div class="tb-actions">${actions}${S.invitado ? `<button class="icon-btn only-sm" data-tema-lector aria-label="Modo claro / oscuro" title="Modo claro / oscuro">${ICONO_TEMA}</button>` : back ? "" : `<a class="icon-btn only-sm" href="#/ajustes" aria-label="Ajustes">${icon("settings")}</a>`}</div>`;
  $("#tb-back", tb)?.addEventListener("click", () => {
    if (back === true || history.length < 2) history.length > 1 ? history.back() : go("#/");
    else go(back);
  });
  $("#tb-company", tb)?.addEventListener("click", () => { if (!S.invitado) document.dispatchEvent(new CustomEvent("elegir-empresa")); });
}

// Link de perito: botón claro/oscuro (se recuerda aparte del tema de la app)
const ICONO_TEMA = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>`;
document.addEventListener("click", e => {
  if (!e.target.closest("[data-tema-lector]")) return;
  const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("temaLector", t); } catch { /* sin almacenamiento */ }
});

export function marcarNav(nombre) {
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === nombre));
}

export function pintarLateral() {
  const c = S.company;
  $("#company-name").textContent = c?.name || "Sin operativo";
  $("#company-avatar").textContent = letraOperativo(c?.name);
  $("#company-role").textContent = S.invitado ? `Solo lectura · ${S.invitado.compania}` : c ? `${ROLES[c.roles?.[S.user.uid]]?.label || "Miembro"} · ${c.members.length} ${c.members.length === 1 ? "persona" : "personas"}` : "";
  const p = S.profile || {};
  $("#side-user").innerHTML = `
    <span class="avatar">${esc(initials(p.name))}</span>
    <span class="side-user-meta"><strong>${esc(p.name || "")}</strong><small>${S.invitado ? "Solo lectura" : "@" + esc(p.username || "")}</small></span>
    ${S.invitado ? `<button class="icon-btn sm" data-tema-lector aria-label="Modo claro / oscuro" title="Modo claro / oscuro">${ICONO_TEMA}</button>` : ""}`;
}

// Ícono del operativo: primera letra del nombre sobre fondo de color
export const letraOperativo = nombre => (String(nombre || "").trim()[0] || "?").toUpperCase();
export function logoOperativo(tam = "", nombre = S.company?.name) {
  return `<span class="company-avatar ${tam}">${esc(letraOperativo(nombre))}</span>`;
}

