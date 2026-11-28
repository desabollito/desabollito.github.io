// ═════════════════════════════════════════════════════════════
//  REPUESTOS: todos los repuestos de los vehículos, filtrados por estado, con el turno para colocarlos.
//  El estado es el mismo del vehículo (etapasRepuestos); el turno es del vehículo: turnoRep (fecha) y turnoRepOk (confirmado).
// ═════════════════════════════════════════════════════════════
import { S, activos, puedeVer, actualizarVehiculo, mensajeError } from "./data.js";
import { $, esc, icon, toast, plate, openSheet, fechaCorta } from "./ui.js";
import { setTopbar } from "./shell.js";
import { ETAPAS, etapaItem, itemsTexto, elegirEtapa } from "./views-vehiculos.js";

const R = { est: new Set(), q: "", autos: false };   // autos: una fila por vehículo con sus repuestos
const norm = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function vistaRepuestos(view) {
  setTopbar({ title: "Repuestos", sub: S.company?.name, back: "#/planillas" });
  if (!puedeVer("repuestos")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  const filas = activos().flatMap(v => itemsTexto(v.repuestos).map(x => ({ v, x, e: etapaItem(v, "repuestos", x) })));
  // Por vehículo: cuántos autos tienen algún repuesto en ese estado
  const cuenta = k => { const fs = filas.filter(f => f.e[0] === k); return R.autos ? new Set(fs.map(f => f.v)).size : fs.length; };
  const q = norm(R.q);
  const vs = filas.filter(f => (!R.est.size || R.est.has(f.e[0])) && (!q || norm(f.v.patente).includes(q) || norm(f.v.modelo).includes(q) || norm(f.x).includes(q)))
    .sort((a, b) => String(a.v.turnoRep || "9").localeCompare(String(b.v.turnoRep || "9")) || String(a.v.patente || "").localeCompare(String(b.v.patente || "")));
  const chip = ({ v, x, e: [, label, color] }) => `<button type="button" class="etapa-item" data-vid="${esc(v.id)}" data-item="${esc(x)}" style="--c:${color}"><span>${esc(x)}</span><small>${label}</small></button>`;
  const veh = v => `<a href="#/v/${esc(v.id)}" class="rep-veh">${plate(v.patente)}<small>${esc(v.modelo || "")}</small></a>`;
  const turno = v => `<button type="button" class="btn btn-sm ${v.turnoRepOk ? "btn-primary" : "btn-ghost"}" data-turno="${esc(v.id)}">${icon(v.turnoRepOk ? "check" : "calendar")}${v.turnoRep ? fechaCorta(v.turnoRep) : "Turno"}</button>`;
  const porAuto = [...vs.reduce((m, f) => m.set(f.v, [...(m.get(f.v) || []), f]), new Map())];   // sin Map.groupBy: celulares viejos
  view.innerHTML = `<div class="tec-page">
    <label class="search">${icon("search")}<input type="search" id="r-q" placeholder="Buscar patente, modelo o repuesto" value="${esc(R.q)}" autocomplete="off"></label>
    <div class="rep-fila">
    <div class="estado-strip" role="tablist" aria-label="Filtrar por estado">${ETAPAS.repuestos.map(([k, label, color]) =>
      `<button class="est ${R.est.has(k) ? "on" : ""}" data-e="${k}" style="--c:${color}"><b>${cuenta(k)}</b><span>${label}</span></button>`).join("")}</div>
      <div class="seg seg-sm"><button type="button" class="seg-btn ${R.autos ? "" : "on"}" data-autos="">Repuesto</button><button type="button" class="seg-btn ${R.autos ? "on" : ""}" data-autos="1">Vehículo</button></div>
    </div>
    ${vs.length ? `<ul class="rep-list">${R.autos
      ? porAuto.map(([v, fs]) => `<li>${veh(v)}<div class="rep-chips">${fs.map(chip).join("")}</div>${turno(v)}</li>`).join("")
      : vs.map(f => `<li>${veh(f.v)}${chip(f)}${turno(f.v)}</li>`).join("")}</ul>`
      : `<div class="empty small"><p>${filas.length ? "No hay repuestos con ese filtro." : "Ningún vehículo tiene repuestos cargados."}</p></div>`}</div>`;

  $("#r-q", view).addEventListener("input", e => { R.q = e.target.value; const p = e.target.selectionStart; vistaRepuestos(view); const i = $("#r-q", view); i.focus(); i.setSelectionRange(p, p); });
  view.querySelector(".estado-strip").addEventListener("click", e => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    R.est.has(b.dataset.e) ? R.est.delete(b.dataset.e) : R.est.add(b.dataset.e); vistaRepuestos(view);
  });
  view.querySelector(".tec-page").addEventListener("click", e => {
    const a = e.target.closest("[data-autos]"); if (a) { R.autos = !!a.dataset.autos; return vistaRepuestos(view); }
    const et = e.target.closest(".etapa-item[data-vid]");
    if (et) return elegirEtapa(activos().find(v => v.id === et.dataset.vid), "repuestos", et.dataset.item);
    const t = e.target.closest("[data-turno]"); if (t) turnoColocacion(activos().find(v => v.id === t.dataset.turno));
  });
}

// Día para colocar los repuestos del vehículo y si el cliente lo confirmó
function turnoColocacion(v) {
  const s = openSheet({ title: `Colocar repuestos · ${v.patente || v.modelo || ""}`, body: `<form class="stack">
    <label class="field"><span>Día del turno</span><input type="date" name="f" value="${esc(v.turnoRep || "")}"></label>
    <label class="toggle"><input type="checkbox" name="ok" ${v.turnoRepOk ? "checked" : ""}><span>Confirmado para colocar</span></label>
    <button class="btn btn-primary">Guardar</button></form>` });
  $("form", s.el).onsubmit = e => {
    e.preventDefault(); const f = e.target.f.value, ok = e.target.ok.checked; s.close();
    actualizarVehiculo(v.id, { turnoRep: f || null, turnoRepOk: ok },
      f ? `Turno para colocar repuestos: ${fechaCorta(f)}${ok ? " (confirmado)" : ""}` : "Quitó el turno para colocar repuestos")
      .catch(err => toast(mensajeError(err), "error"));
  };
}
