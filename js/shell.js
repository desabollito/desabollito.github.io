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
    <div class="tb-actions">${actions}${back ? "" : `<a class="icon-btn only-sm" href="#/ajustes" aria-label="Ajustes">${icon("settings")}</a>`}</div>`;
  $("#tb-back", tb)?.addEventListener("click", () => {
    if (back === true || history.length < 2) history.length > 1 ? history.back() : go("#/");
    else go(back);
  });
  $("#tb-company", tb)?.addEventListener("click", () => document.dispatchEvent(new CustomEvent("elegir-empresa")));
}

export function marcarNav(nombre) {
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === nombre));
}

export function pintarLateral() {
  const c = S.company;
  $("#company-name").textContent = c?.name || "Sin operativo";
  $("#company-role").textContent = c ? `${ROLES[c.roles?.[S.user.uid]]?.label || "Miembro"} · ${c.members.length} ${c.members.length === 1 ? "persona" : "personas"}` : "";
  const p = S.profile || {};
  $("#side-user").innerHTML = `
    <span class="avatar">${p.photoURL ? `<img src="${esc(avatar(p.photoURL, 80))}" alt="">` : esc(initials(p.name))}</span>
    <span class="side-user-meta"><strong>${esc(p.name || "")}</strong><small>@${esc(p.username || "")}</small></span>`;
}

// Logo de la app como ícono del operativo (sin fondo, según tema)
export function logoOperativo(tam = "") {
  return `<span class="company-avatar ${tam}"><img class="logo-on-light" src="img/logo-oscuro.png" alt=""><img class="logo-on-dark" src="img/logo-claro.png" alt=""></span>`;
}
