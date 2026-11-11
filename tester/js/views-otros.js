import {
  S, activos, papelera, restaurar, eliminarDefinitivo, soyAdmin, miRol, renombrarEmpresa, guardarSello, deshaciblesDe, deshacerCambio, soyDesmontaje,
  agregarMiembro, cambiarRol, quitarMiembro, guardarEtiquetas, resolverSolicitud, desvincularWhatsApp, salirDeEmpresa, eliminarEmpresa, crearEmpresa, elegirEmpresa,
  actualizarPerfil, salir, mensajeError, llamarAdmin, soloDesmontaje, pedirUnion, linksCompartidos, getVehiculo, soloVer, soySacabollos, guardarOrdenOps, cambiarEstado, usaClientes
} from "./data.js";
import { cargarExcelJS } from "./excel.js";
import { ESTADOS, ESTADO, ROLES, estadoActual, esAnulado, repartirTurnos } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet, confirmar,
  pedirTexto, busy, debounce, avatarUsuario, tsToISO, elegirDescarga, horaDe
} from "./ui.js";
import { ruidoMotor, SONIDOS_AUTO } from "./sonidos.js";
import { NOVEDADES } from "./novedades.js";
import { imagenChica, avatar, subir, comprimir } from "./media.js";
import { planillaPDF } from "./pdf.js";
import { exportarExcel } from "./excel.js";
import { setTopbar, go, logoOperativo, pintarLateral } from "./shell.js";
import { APP_VERSION, WHATSAPP_BOT, BOT_API } from "./config.js";
import { renderDetalle, textoWa } from "./views-vehiculos.js";

// ═════════════════════════════════════════════════════════════
//  PLANILLA
// ═════════════════════════════════════════════════════════════
const P = { q: "", orden: "fecha", dir: -1 };
const COLS = [
  ["patente", "Patente", v => v.patente || ""],
  ["modelo", "Modelo", v => v.modelo || ""],
  ["fecha", "Peritaje", v => v.fechas?.peritado || ""],
  ["compania", "Compañía", v => v.compania || ""],
  ["localidad", "Localidad", v => v.localidad || ""],
  ["estado", "Estado", v => ESTADOS.findIndex(e => e.key === estadoActual(v))],
  ["precio", "Precio", v => Number(v.precio || 0)]
];

function filasPlanilla() {
  const q = P.q.toLowerCase();
  const col = COLS.find(c => c[0] === P.orden);
  return activos().filter(v =>
    !q || [v.modelo, v.patente, v.asegurado, v.compania, v.localidad, ESTADO[estadoActual(v)].label]
      .some(x => (x || "").toLowerCase().includes(q))
  ).sort((a, b) => {
    const x = col[2](a), y = col[2](b);
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * P.dir;
  });
}

export function vistaPlanilla(view) {
  setTopbar({
    title: "Planilla de vehículos", sub: S.invitado ? S.invitado.compania : S.company?.name, back: S.invitado ? "" : "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="dl" aria-label="Descargar">${icon("download")}<span class="hide-sm">Descargar</span></button>${S.invitado || soloVer() ? "" : `<button class="btn btn-ghost btn-sm" id="p-cambios" aria-label="Cambios recientes" title="Cambios recientes">${icon("clock")}<span class="hide-sm">Cambios</span></button>`}`
  });
  const ordenes = [["fecha", "Fecha"], ["patente", "Patente"], ["modelo", "Modelo"], ["estado", "Estado"]];
  if (matchMedia("(max-width: 899px)").matches && !ordenes.some(([k]) => k === P.orden)) { P.orden = "fecha"; P.dir = -1; }
  view.innerHTML = `
  <div class="sheet-page ${P.q ? "buscando" : ""}">
    <label class="search p-search">${icon("search")}<input type="search" id="pq" placeholder="Buscar patente, modelo, asegurado, estado…" value="${esc(P.q)}">
      <button type="button" class="icon-btn sm p-search-x" id="pq-x" aria-label="Cerrar búsqueda">${icon("x")}</button></label>

    <!-- Celular: lista compacta con orden elegible -->
    <div class="p-mobile">
      <div class="p-sort" role="group" aria-label="Ordenar por">
        <div class="p-chips" id="psort"></div>
        <button type="button" class="p-lupa" id="plupa" aria-label="Buscar">${icon("search")}</button>
      </div>
      <div class="p-list" id="plist"></div>
    </div>

    <!-- Tablet y escritorio: tabla completa -->
    <div class="table-wrap p-desktop"><table class="tbl">
      <thead><tr>${COLS.filter(([k]) => k !== "precio" || !soloVer()).map(([k, t]) => `<th data-k="${k}" class="${k === "precio" ? "num" : ""}" aria-sort="${P.orden === k ? (P.dir > 0 ? "ascending" : "descending") : "none"}">
        <button>${t}${P.orden === k ? (P.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead>
      <tbody id="tb"></tbody><tfoot id="tf"></tfoot></table></div>

    <div class="p-summary" id="psum"></div>
  </div>`;

  const pintarOrden = () => {
    $("#psort", view).innerHTML = ordenes.map(([k, t]) => `<button type="button" class="p-chip ${P.orden === k ? "on" : ""}" data-orden="${k}"
      aria-pressed="${P.orden === k}">${t}${P.orden === k ? `<i>${P.dir > 0 ? "↑" : "↓"}</i>` : ""}</button>`).join("");
  };
  const pintar = () => {
    pintarOrden();
    const filas = filasPlanilla();
    const total = filas.reduce((s, v) => s + (esAnulado(v) ? 0 : Number(v.precio || 0)), 0);
    $("#psum", view).innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? "vehículo" : "vehículos"}</span>${soloVer() ? "" : `<span>Total <b>${money(total) || "$0"}</b></span>`}`;

    // Celular
    $("#plist", view).innerHTML = filas.length ? filas.map(v => `
      <a class="p-row" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
        <span class="p-l">
          <span class="p-top">${plate(v.patente, "sm")}<strong>${esc(v.modelo || "Sin modelo")}</strong></span>
          <small>${esc([fechaCorta(v.fechas?.peritado), v.compania].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="p-r">
          ${soloVer() ? "" : `<strong>${money(v.precio) || "—"}</strong>`}
          <small><i class="p-dot"></i>${ESTADO[estadoActual(v)].label}</small>
        </span>
      </a>`).join("") : `<div class="empty small"><p>Sin resultados.</p></div>`;

    // Escritorio
    $("#tb", view).innerHTML = filas.length ? filas.map(v => `
      <tr data-id="${v.id}" tabindex="0">
        <td>${plate(v.patente, "sm")}</td><td><strong>${esc(v.modelo || "—")}</strong></td>
        <td>${fechaCorta(v.fechas?.peritado)}</td>
        <td>${esc(v.compania || "—")}</td><td>${esc(v.localidad || "—")}</td>
        <td>${estadoPill(v)}</td>${soloVer() ? "" : `<td class="num">${money(v.precio) || "—"}</td>`}</tr>`).join("")
      : `<tr><td colspan="7" class="empty-cell">Sin resultados.</td></tr>`;
    $("#tf", view).innerHTML = `<tr><td colspan="6">${filas.length} ${filas.length === 1 ? "vehículo" : "vehículos"}</td>${soloVer() ? "" : `<td class="num">${money(total) || "$0"}</td>`}</tr>`;
  };
  pintar();

  $("#pq", view).oninput = debounce(e => { P.q = e.target.value; pintar(); }, 120);
  // Celular: la búsqueda se abre con la lupa al final de los filtros
  const pagina = $(".sheet-page", view);
  $("#plupa", view).onclick = () => { pagina.classList.add("buscando"); $("#pq", view).focus(); };
  $("#pq-x", view).onclick = e => { e.preventDefault(); P.q = ""; $("#pq", view).value = ""; pagina.classList.remove("buscando"); pintar(); };
  // Tocar un criterio lo elige; tocar el elegido invierte el orden
  $("#psort", view).onclick = e => {
    const b = e.target.closest("[data-orden]"); if (!b) return;
    if (P.orden === b.dataset.orden) P.dir *= -1;
    else { P.orden = b.dataset.orden; P.dir = ["fecha", "precio"].includes(P.orden) ? -1 : 1; }
    pintar();
  };
  $("thead", view).onclick = e => {
    const th = e.target.closest("[data-k]"); if (!th) return;
    if (P.orden === th.dataset.k) P.dir *= -1; else { P.orden = th.dataset.k; P.dir = 1; }
    vistaPlanilla(view);
  };
  $("#tb", view).onclick = e => { const tr = e.target.closest("[data-id]"); if (tr) go(`#/v/${tr.dataset.id}`); };
  $("#tb", view).onkeydown = e => { if (e.key === "Enter") e.target.closest("[data-id]")?.click(); };

  const pdf = () => planillaPDF(filasPlanilla(), S.company, P.q ? `búsqueda “${P.q}”` : "", !!S.invitado).save(`Planilla_${hoyISO()}.pdf`);
  const excel = async () => {
    const filas = filasPlanilla();
    await exportarExcel({
      archivo: `Planilla_${hoyISO()}.xlsx`, hoja: "Planilla",
      titulo: `${S.company?.name || "Desabollito"} · Planilla de vehículos`,
      columnas: [
        { titulo: "Patente", ancho: 12, valor: v => v.patente },
        { titulo: "Modelo", ancho: 28, valor: v => v.modelo },
        { titulo: "Fecha de peritaje", ancho: 17, tipo: "fecha", valor: v => v.fechas?.peritado },
        { titulo: "Asegurado", ancho: 24, valor: v => v.asegurado },
        { titulo: "Teléfono", ancho: 16, valor: v => v.telefono },
        { titulo: "Compañía", ancho: 20, valor: v => v.compania },
        { titulo: "Localidad", ancho: 18, valor: v => v.localidad },
        { titulo: "Estado", ancho: 12, valor: v => ESTADO[estadoActual(v)].label },
        { titulo: "Grado", ancho: 9, valor: v => v.grado ? `Grado ${v.grado}` : "" },
        { titulo: "Fecha de turno", ancho: 15, tipo: "fecha", valor: v => v.fechas?.turnado },
        { titulo: "Fecha de reparación", ancho: 19, tipo: "fecha", valor: v => v.fechas?.reparado },
        { titulo: "Fecha de facturación", ancho: 20, tipo: "fecha", valor: v => v.fechas?.facturado },
        ...(soloVer() ? [] : [{ titulo: "Precio", ancho: 14, tipo: "moneda", valor: v => v.precio }]),
        { titulo: "Cargado por", ancho: 18, valor: v => v.createdByName }
      ],
      filas,
      total: soloVer() ? [] : [{ etiqueta: "Total", valor: filas.reduce((s, v) => s + (esAnulado(v) ? 0 : Number(v.precio || 0)), 0) }]
    });
  };
  // Todos los cambios recientes de todos los vehículos, con quién los hizo; cada uno se puede revertir (y revertir la reversión)
  $("#p-cambios")?.addEventListener("click", () => {
    const l = activos().flatMap(v => (v.historial || []).map(e => ({ v, e }))).sort((a, b) => (b.e.t || 0) - (a.e.t || 0)).slice(0, 200);
    const s = openSheet({ title: "Cambios recientes", wide: true, body: l.length ? `<p class="muted small">Últimos ${l.length} cambios de la planilla, de todos los vehículos.</p><ul class="ver-lista">${l.map(({ v, e }, i) =>
      `<li><div class="ver-item"><span class="hist-txt"><strong>${esc(e.por || "Alguien")}</strong> ${esc(v.patente || v.modelo || "")}: ${esc(String(e.txt || "").replace(/Pasó a /g, ""))}</span>
        <span class="ver-item-acc"><time>${e.t ? new Date(e.t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</time>
        ${deshaciblesDe(v).includes(e) && !soyDesmontaje() ? `<button type="button" class="btn btn-ghost btn-sm" data-i="${i}">Revertir</button>` : ""}</span></div></li>`).join("")}</ul>`
      : `<div class="empty small"><p>Todavía no hay cambios.</p></div>` });
    s.el.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-i]"); if (!b) return;
      const { v, e } = l[+b.dataset.i];
      if (!(await confirmar({ title: "¿Revertir este cambio?", message: `${v.patente || v.modelo || ""}: ${e.txt}. Queda registrado y se puede volver a aplicar desde esta misma lista.`, ok: "Revertir", danger: true }))) return;
      s.close();
      deshacerCambio(v, e).then(() => toast("Cambio revertido", "success")).catch(err => toast(mensajeError(err), "error"));
    });
  });
  $("#dl").onclick = () => {
    if (!filasPlanilla().length) return toast("No hay vehículos para descargar", "warning");
    elegirDescarga("Planilla de vehículos", { excel, pdf });
  };
  return { soloLista: pintar };
}

// ═════════════════════════════════════════════════════════════
//  CALENDARIO
// ═════════════════════════════════════════════════════════════
const C = { y: new Date().getFullYear(), m: new Date().getMonth(), campo: "turnado", dia: null, auto: true };
if (!["peritado", "turnado"].includes(C.campo)) C.campo = "turnado";
// Celdas: patentes ("pat") o solo la cantidad del día ("txt"); se recuerda en este navegador
try { C.vista = localStorage.getItem("calVista") === "txt" ? "txt" : "pat"; } catch { C.vista = "pat"; }

// Al entrar: hoy si tiene vehículos; si no, el próximo día con vehículos; si no hay
// ninguno adelante, el último día anterior que tenga.
// Solo la primera vez: después queda en el día que se eligió
export function calendarioAlEntrar() { if (!C.dia) C.auto = true; }
// Tocar de nuevo la pestaña Calendario: vuelve al día automático
export function reiniciarCalendario() { C.dia = null; C.auto = true; }
const delCal = () => activos().filter(v => !esAnulado(v));   // los anulados no figuran en el calendario
function elegirDiaAuto() {
  const hoy = hoyISO();
  const dias = [...new Set(delCal().map(v => v.fechas?.[C.campo]).filter(Boolean))].sort();
  const dia = dias.includes(hoy) ? hoy : (dias.find(d => d > hoy) || dias.filter(d => d < hoy).pop() || hoy);
  const [y, m] = dia.split("-").map(Number);
  C.y = y; C.m = m - 1; C.dia = dia;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Computadora: con selId, el vehículo tocado en la lista del día reemplaza al calendario (como en Vehículos)
export function vistaCalendario(view, selId = null) {
  const sel = selId ? getVehiculo(selId) : null;
  setTopbar({ title: "Calendario", back: sel ? "#/calendario" : null });
  if (C.auto && !S.loadingVehicles) { C.auto = false; elegirDiaAuto(); }
  const iso = d => `${C.y}-${String(C.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const sinConf = v => estadoActual(v) === "turnado" && !v.turnoConfirmado;
  const porDia = {};
  delCal().forEach(v => {
    const f = v.fechas?.[C.campo]; if (!f) return;
    (porDia[f] ||= []).push(v);
  });
  const primero = (new Date(C.y, C.m, 1).getDay() + 6) % 7; // semana arranca lunes
  const dias = new Date(C.y, C.m + 1, 0).getDate();
  const hoy = hoyISO();
  const mesActual = `${C.y}-${String(C.m + 1).padStart(2, "0")}`;
  if (!C.dia || !C.dia.startsWith(mesActual)) {
    // al cambiar de mes: hoy si cae en ese mes y tiene algo, si no el primer día con vehículos
    const conAlgo = Object.keys(porDia).filter(d => d.startsWith(mesActual)).sort();
    C.dia = conAlgo.includes(hoy) ? hoy : (conAlgo[0] || (hoy.startsWith(mesActual) ? hoy : null));
  }

  const txt = C.vista === "txt";
  let celdas = "";
  for (let i = 0; i < primero; i++) celdas += `<div class="cd out"></div>`;
  for (let d = 1; d <= dias; d++) {
    const f = iso(d), lst = porDia[f] || [];
    celdas += `<button class="cd ${f === hoy ? "today" : ""} ${f === C.dia ? "sel" : ""} ${lst.length ? "has" : ""}" data-d="${f}"
      aria-label="${d} de ${MESES[C.m]}: ${lst.length} vehículos">
      <span class="cd-n">${d}</span>
      ${txt ? (lst.length ? `<span class="cd-txt"><b>${lst.length}</b> <span class="cd-pal">${C.campo === "turnado" ? (lst.length === 1 ? "turno" : "turnos") : (lst.length === 1 ? "peritaje" : "peritajes")}</span></span>` : "") + "</button>" : `<span class="cd-ev">${lst.slice(0, 3).map(v => `<i style="--c:${sinConf(v) ? "#e5484d" : ESTADO[estadoActual(v)].color}">${esc(v.patente || v.modelo || "•")}</i>`).join("")}
      ${lst.length > 3 ? `<i class="more">+${lst.length - 3}</i>` : ""}</span></button>`}`;
  }
  // Turnos sin confirmar primero
  const delDia = (C.dia ? (porDia[C.dia] || []) : []).slice().sort((a, b) => sinConf(b) - sinConf(a));
  const totalMes = Object.entries(porDia).filter(([k]) => k.startsWith(iso(1).slice(0, 7))).reduce((s, [, l]) => s + l.length, 0);

  const scrollDia = $(".cal-day", view)?.scrollTop || 0;   // la lista del día no salta al abrir un vehículo
  view.innerHTML = `
  <div class="cal-page">
    ${sel ? `<section class="pane-detail"></section>` : `<section class="cal">
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="Mes anterior">${icon("back")}</button>
        <h2>${MESES[C.m]} ${C.y}</h2>
        <button class="icon-btn" id="next" aria-label="Mes siguiente">${icon("next")}</button>
        <button class="btn btn-ghost btn-sm" id="hoy">Hoy</button>
        <button class="btn btn-ghost btn-sm hide-mobile" id="vista" aria-label="Cambiar cómo se ven los días">${C.vista === "txt" ? "Ver patentes" : "Ver cantidad"}</button>
      </div>
      <div class="seg seg-sm" id="campo">
        ${[["peritado", "Peritajes"], ["turnado", "Turnos"]].map(([k, t]) =>
          `<button class="seg-btn ${C.campo === k ? "on" : ""}" data-c="${k}">${t}</button>`).join("")}
      </div>
      <div class="cal-grid">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => `<div class="cw">${d}</div>`).join("")}${celdas}</div>
      <p class="muted small cal-total">${totalMes} ${C.campo === "turnado" ? "turnos" : C.campo === "reparado" ? "reparaciones" : "peritajes"} en ${MESES[C.m]}.
        <button class="btn btn-ghost btn-sm only-mobile vista">${C.vista === "txt" ? "Ver puntitos" : "Ver cantidad"}</button></p>
    </section>`}
    <section class="cal-day">
      <h3>${C.dia ? fechaLarga(C.dia) : "Elegí un día"}</h3>
      ${C.dia ? (delDia.length ? `<div class="vlist compact">${delDia.map(v => `
        <a class="vcard" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
          <span class="vbody"><span class="vtop"><strong class="vmodel">${esc(v.modelo || "Sin modelo")}</strong>
            ${v.precio ? `<span class="vprice">${money(v.precio)}</span>` : ""}</span>
          <span class="vmid">${plate(v.patente, "sm")}${estadoPill(v)}${estadoActual(v) === "turnado" ? `<span class="conf-tag ${v.turnoConfirmado ? "ok" : ""}">${v.turnoConfirmado ? "Confirmado" : "Esperando confirmación"}</span>` : ""}</span>
          <span class="vsub"><span class="vcli">${esc(v.compania || "")}</span>${horaDe(v, C.campo) ? `<time>${horaDe(v, C.campo)}</time>` : ""}</span></span></a>`).join("")}</div>`
        : `<p class="muted">Nada agendado este día.</p>`) : ""}
    </section>
  </div>`;

  $(".cal-day", view).scrollTop = scrollDia;
  if (sel) { renderDetalle($(".pane-detail", view), sel, true); return; }
  $("#prev", view).onclick = () => { if (--C.m < 0) { C.m = 11; C.y--; } C.dia = null; vistaCalendario(view); };
  $("#next", view).onclick = () => { if (++C.m > 11) { C.m = 0; C.y++; } C.dia = null; vistaCalendario(view); };
  $("#hoy", view).onclick = () => { const d = new Date(); C.y = d.getFullYear(); C.m = d.getMonth(); C.dia = hoyISO(); vistaCalendario(view); };
  $(".cal-total .vista", view).onclick = $("#vista", view).onclick = () => { C.vista = C.vista === "txt" ? "pat" : "txt"; try { localStorage.setItem("calVista", C.vista); } catch {} vistaCalendario(view); };
  $("#campo", view).onclick = e => { const b = e.target.closest("[data-c]"); if (b) { C.campo = b.dataset.c; C.auto = true; vistaCalendario(view); } };
  $(".cal-grid", view).onclick = e => { const b = e.target.closest("[data-d]"); if (b) { C.dia = b.dataset.d; vistaCalendario(view); } };
}

// ═════════════════════════════════════════════════════════════
//  OPERATIVO: equipo, etiquetas y sello
// ═════════════════════════════════════════════════════════════
const ETIQUETAS_SUGERIDAS = ["Sacabollos", "Desmontador", "Gestión", "Perito", "Pintor", "Chofer"];

export function vistaEmpresa(view) {
  const c = S.company;
  setTopbar({ title: "Operativo", back: matchMedia("(min-width: 900px)").matches ? null : "#/" });
  if (!c) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const admin = soyAdmin(), duenio = miRol() === "owner";
  const miembros = c.members.map(uid => ({
    uid, name: c.memberNames?.[uid] || "Usuario", user: c.memberUsers?.[uid] || "", rol: c.roles?.[uid] || "tecnico", tags: c.memberTags?.[uid] || [],
    foto: ""
  })).sort((a, b) => (a.rol === "owner" ? -1 : b.rol === "owner" ? 1 : a.name.localeCompare(b.name)));
  const sello = c.seal || {};

  view.innerHTML = `
  <div class="page narrow">
    <section class="card">
      <div class="sec-head"><div><small class="muted">Operativo activo</small><h2 class="h-company">${esc(c.name)}</h2></div>
        ${admin ? `<button class="icon-btn" id="renombrar" aria-label="Renombrar operativo" title="Renombrar">${icon("edit")}</button>` : ""}</div>
    </section>

    <section class="card">
      <h3>Equipo <small class="muted">${miembros.length}</small></h3>
      <ul class="members">${miembros.map(m => `
        <li>
          ${avatarUsuario(m.user, m.name, "", c.memberPhotos?.[m.uid])}
          <span class="m-meta">
            <strong>${esc(m.name)}${m.uid === S.user.uid ? " (vos)" : ""}</strong>
            <small>${[m.user ? `@${esc(m.user)}` : "", admin && m.rol !== "owner" && m.uid !== S.user.uid ? "" : ROLES[m.rol]?.label || m.rol].filter(Boolean).join(" · ")}</small>
          </span>
          ${admin && m.rol !== "owner" && m.uid !== S.user.uid ? `
            <span class="m-actions">
              <select class="rol-sel" data-rol="${m.uid}" aria-label="Rol de ${esc(m.name)}">${[["desmontaje", "Desmontador"], ["tecnico", "Sacabollos"], ["admin", "Administrador"]].map(([k, l]) =>
                `<option value="${k}" ${m.rol === k ? "selected" : ""}>${l}</option>`).join("")}</select>
              <button class="icon-btn sm" data-quitar="${m.uid}" aria-label="Quitar a ${esc(m.name)}">${icon("x")}</button>
            </span>` : ""}
        </li>`).join("")}</ul>
      ${admin ? `
      <button class="btn btn-ghost btn-block" id="agregar-usuario">${icon("plus")}Agregar usuario</button>
` : ""}
    </section>

    ${admin ? `<button type="button" class="card plegable plegable-btn" id="compartir-perito"><span>${icon("share")}Compartir con perito</span>${icon("next")}</button>` : ""}

    ${admin ? `<details class="card plegable">
      <summary><span>${icon("file")}Sello</span>${icon("next")}</summary>
      <form id="sello" class="stack">
        <label class="field">
          <textarea name="texto" aria-label="Texto del sello" rows="4" ${admin ? "" : "disabled"} placeholder="Juan Pérez · Desabollador&#10;CUIT 20-12345678-9&#10;11 2345 6789">${esc(sello.texto)}</textarea></label>
        <div class="logo-row">
          <${admin ? "label" : "div"} class="logo-prev ${sello.logo ? "" : "vacio"}" ${admin ? 'title="Tocá para elegir el logo"' : ""}>
            <span class="logo-vis">${sello.logo ? `<img src="${esc(sello.logo)}" alt="Logo">` : admin ? "Subir logo" : "Sin logo"}</span>
            ${admin ? `<input type="file" accept="image/*" hidden id="logo-in">` : ""}</${admin ? "label" : "div"}>
          ${admin ? `<button type="button" class="link-btn danger" id="logo-del" ${sello.logo ? "" : "hidden"}>Quitar logo</button>` : ""}
        </div>
        <div class="field"><span>Diseño del encabezado</span>
          <div class="seg seg-sm" id="diseno-pdf">${[["clasico", "Título a la izquierda"], ["centrado", "Logo · Título · Datos"]].map(([k, t]) =>
            `<button type="button" class="seg-btn ${(sello.diseno || "clasico") === k ? "on" : ""}" data-diseno="${k}" ${admin ? "" : "disabled"}>${t}</button>`).join("")}</div></div>
        <div class="field tam-pdf"><span>Tamaños del encabezado</span>
          ${[["titulo", "Título", 10, 24, 0.5, 15], ["sub", "Subtítulo", 6, 14, 0.5, 9], ["logo", "Logo", 20, 80, 1, 46], ["datos", "Datos de facturación", 5, 12, 0.5, 7.5]].map(([k, t, mn, mx, st, def]) =>
            `<label class="tam-item"><span>${t}</span><input type="range" name="tam_${k}" min="${mn}" max="${mx}" step="${st}" value="${esc(sello.tam?.[k] || def)}" data-def="${def}" ${admin ? "" : "disabled"}><b>${esc(sello.tam?.[k] || def)}</b></label>`).join("")}
          ${admin ? `<button type="button" class="link-btn" id="tam-def">Tamaños normales</button>` : ""}</div>
        <div class="field color-pdf"><span>Colores del PDF</span>
          <div class="colores-grid">${[["color", "Encabezado"], ["colorPanos", "Paños afectados"], ["colorTitulos", "Subtítulos y líneas"], ["colorPuntos", "Puntitos"]].map(([k, t]) =>
            `<label class="color-item"><input type="color" name="${k}" value="${esc(sello[k] || sello.color || "#2b5ce6")}" ${admin ? "" : "disabled"}><span>${t}</span></label>`).join("")}</div>
          ${admin ? `<button type="button" class="link-btn" id="color-def">Volver al azul</button>` : ""}</div>
        ${admin ? `<button class="btn btn-primary">Guardar sello</button>` : ""}
      </form>
    </details>` : ""}

    <section class="card danger-zone">
      ${duenio
        ? `<button class="btn btn-danger-ghost" id="borrar-emp">${icon("trash")}Eliminar operativo</button>`
        : `<button class="btn btn-danger-ghost" id="salir-emp">${icon("logout")}Salir de este operativo</button>`}
    </section>
  </div>`;

  let logo = sello.logo || "";
  $("#renombrar", view)?.addEventListener("click", async () => {
    const n = await pedirTexto({ title: "Renombrar operativo", label: "Nombre", value: c.name });
    if (n) renombrarEmpresa(n).catch(e => toast(mensajeError(e), "error"));
  });
  $("#compartir-perito", view)?.addEventListener("click", compartirPerito);
  $("#agregar-usuario", view)?.addEventListener("click", () => {
    let rol = "admin";
    const sh = openSheet({
      title: "Agregar personas",
      body: `<form class="stack" id="add">
        <label class="field"><span>Buscar en la app</span>
          <input name="u" placeholder="Nombre o @usuario" autocapitalize="none" spellcheck="false" autocomplete="off" required></label>
        <div class="usr-tira" id="usr-tira"><span class="muted small">Cargando usuarios…</span></div>
        <div class="field"><span>Rol</span>
          <select id="rol-nuevo">${[["desmontaje", "Desmontador"], ["tecnico", "Sacabollos"], ["admin", "Administrador"]].map(([k, l]) => `<option value="${k}" ${k === "admin" ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <button class="btn btn-primary btn-block btn-lg">${icon("plus")}Agregar</button>
      </form>`
    });
    $("#rol-nuevo", sh.el).onchange = e => { rol = e.target.value; };
    // Tira de usuarios de la app: se filtra con lo que escribís; tocar uno lo elige
    const tira = $("#usr-tira", sh.el), inp = $("[name=u]", sh.el);
    let todos = [];
    const pintarTira = () => {
      const q = inp.value.trim().toLowerCase().replace(/^@/, "");
      const l = todos.filter(u => !q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)).slice(0, 30);
      tira.innerHTML = l.length ? l.map(u => `<button type="button" class="usr-chip ${u.username.toLowerCase() === q ? "on" : ""}" data-u="${esc(u.username)}">
          ${avatarUsuario(u.username, u.name, "sm", u.foto)}<span><strong>${esc(u.name || u.username)}</strong><small>@${esc(u.username)}</small></span></button>`).join("")
        : `<span class="muted small">${todos.length ? "No hay coincidencias" : "No hay usuarios para sumar"}</span>`;
    };
    S.user.getIdToken().then(idToken => fetch(`${BOT_API}/usuarios-app`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken, cid: c.id }) }))
      .then(r => r.json()).then(j => { todos = j.lista || []; pintarTira(); }).catch(() => { tira.innerHTML = `<span class="muted small">No se pudo cargar la lista. Escribí el usuario.</span>`; });
    inp.addEventListener("input", pintarTira);
    tira.onclick = e => { const b = e.target.closest("[data-u]"); if (!b) return; inp.value = b.dataset.u; pintarTira(); };
    $("#add", sh.el).onsubmit = async e => {
      e.preventDefault();
      const b = $("button.btn-primary", e.target); busy(b, true, "Buscando…");
      try { const n = await agregarMiembro(e.target.u.value, rol); toast(`${n} se sumó al operativo`, "success"); sh.close(); }
      catch (err) { toast(mensajeError(err), "error"); busy(b, false); }
    };
  });
  $$("select[data-rol]", view).forEach(sel => sel.onchange = () =>
    cambiarRol(sel.dataset.rol, sel.value).then(() => toast("Rol actualizado", "success")).catch(err => toast(mensajeError(err), "error")));
  $$("[data-quitar]", view).forEach(b => b.onclick = async () => {
    const n = c.memberNames?.[b.dataset.quitar] || "esta persona";
    if (await confirmar({ title: `¿Quitar a ${n}?`, message: "Deja de ver los vehículos del operativo. Lo que cargó se conserva.", ok: "Quitar", danger: true }))
      quitarMiembro(b.dataset.quitar).catch(e => toast(mensajeError(e), "error"));
  });
  $("#logo-in", view)?.addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = "";
    try {
      logo = await imagenChica(f);
      $(".logo-prev", view).classList.remove("vacio");
      $(".logo-vis", view).innerHTML = `<img src="${logo}" alt="Logo">`;
      $("#logo-del", view).hidden = false;
    }
    catch { toast("No se pudo leer la imagen", "error"); }
  });
  $("#logo-del", view)?.addEventListener("click", e => {
    logo = ""; $(".logo-prev", view).classList.add("vacio"); $(".logo-vis", view).textContent = "Subir logo"; e.currentTarget.hidden = true;
  });
  $$(".tam-item input", view).forEach(i => i.addEventListener("input", () => { i.nextElementSibling.textContent = i.value; }));
  $("#tam-def", view)?.addEventListener("click", () => $$(".tam-item input", view).forEach(i => { i.value = i.dataset.def; i.nextElementSibling.textContent = i.value; }));
  let diseno = sello.diseno || "clasico";
  $("#diseno-pdf", view)?.addEventListener("click", e => {
    const b = e.target.closest("[data-diseno]"); if (!b || !admin) return;
    diseno = b.dataset.diseno; $$("#diseno-pdf .seg-btn", view).forEach(x => x.classList.toggle("on", x === b));
  });
  $("#color-def", view)?.addEventListener("click", () => { $$("#sello input[type=color]", view).forEach(i => { i.value = "#2b5ce6"; }); });
  if ($("#sello", view)) $("#sello", view).onsubmit = async e => {
    e.preventDefault(); if (!admin) return;
    try { await guardarSello({ texto: e.target.texto.value.trim(), logo, color: e.target.color.value,
      colorPanos: e.target.colorPanos.value, colorTitulos: e.target.colorTitulos.value, colorPuntos: e.target.colorPuntos.value, diseno,
      tam: Object.fromEntries(["titulo", "sub", "logo", "datos"].map(k => [k, Number(e.target[`tam_${k}`].value)])) }); toast("Sello guardado", "success"); }
    catch (err) { toast(mensajeError(err), "error"); }
  };
  $("#salir-emp", view)?.addEventListener("click", async () => {
    if (await confirmar({ title: `¿Salir de ${c.name}?`, message: "Vas a dejar de ver sus vehículos. Un administrador te puede volver a sumar.", ok: "Salir", danger: true }))
      salirDeEmpresa().then(() => go("#/")).catch(e => toast(mensajeError(e), "error"));
  });
  $("#borrar-emp", view)?.addEventListener("click", async () => {
    const uno = await confirmar({ title: `¿Eliminar el operativo “${c.name}”?`,
      message: "Se va a perder todo: vehículos, fotos, documentos y gastos de este operativo.", ok: "Sí, eliminar", danger: true });
    if (!uno) return;
    const dos = await confirmar({ title: "¿Estás completamente seguro?",
      message: `Se borra “${c.name}” con todo su contenido. No se puede deshacer.`, ok: "Eliminar definitivamente", danger: true });
    if (!dos) return;
    try { const j = await eliminarEmpresa(); toast(j.yaPedido ? "Ya está pedido: falta que lo confirmen por WhatsApp" : "Pedido enviado: se elimina cuando lo confirmen por WhatsApp", "success"); }
    catch (e) { toast(e.message || mensajeError(e), "error"); }
  });
}

function editarEtiquetas(uid) {
  const c = S.company;
  const actuales = new Set(c.memberTags?.[uid] || []);
  // sugerencias: las de siempre + las que ya se usan en este operativo
  const usadas = Object.values(c.memberTags || {}).flat();
  const opciones = [...new Set([...ETIQUETAS_SUGERIDAS, ...usadas, ...actuales])];
  const s = openSheet({
    title: `Etiquetas de ${c.memberNames?.[uid] || "este miembro"}`,
    body: `<form class="stack">
      <div class="tag-pick" id="tp">${opciones.map(t => `
        <button type="button" class="chip ${actuales.has(t) ? "on" : ""}" data-t="${esc(t)}" aria-pressed="${actuales.has(t)}">${esc(t)}</button>`).join("")}</div>
      <div class="add-tag">
        <input id="nueva" placeholder="Otra etiqueta" maxlength="24" aria-label="Nueva etiqueta">
        <button type="button" class="btn btn-ghost btn-sm" id="sumar">${icon("plus")}Agregar</button>
      </div>
      <button class="btn btn-primary btn-block">Guardar etiquetas</button></form>`
  });
  const tp = $("#tp", s.el);
  tp.onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    const t = b.dataset.t;
    actuales.has(t) ? actuales.delete(t) : actuales.add(t);
    b.classList.toggle("on", actuales.has(t)); b.setAttribute("aria-pressed", actuales.has(t));
  };
  const sumar = () => {
    const inp = $("#nueva", s.el), t = inp.value.trim();
    if (!t) return;
    actuales.add(t); inp.value = "";
    if (![...tp.children].some(b => b.dataset.t === t))
      tp.insertAdjacentHTML("beforeend", `<button type="button" class="chip on" data-t="${esc(t)}" aria-pressed="true">${esc(t)}</button>`);
    else tp.querySelector(`[data-t="${CSS.escape(t)}"]`).classList.add("on");
  };
  $("#sumar", s.el).onclick = sumar;
  $("#nueva", s.el).onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); sumar(); } };
  $("form", s.el).onsubmit = e => {
    e.preventDefault();
    guardarEtiquetas(uid, [...actuales]).then(() => toast("Etiquetas guardadas", "success")).catch(err => toast(mensajeError(err), "error"));
    s.close();
  };
}

async function unirOperativo() {
  const u = await pedirTexto({ title: "Unirme a otro operativo", label: "Usuario de quien administra el operativo", placeholder: "Ej: juanperez", ok: "Pedir unirme" });
  if (!u) return;
  try { await pedirUnion(u); toast("Pedido enviado. Cuando te sume, vas a ver el operativo.", "success"); } catch (e) { toast(e.message || mensajeError(e), "error"); }
}

async function crearOperativo() {
  if (soloDesmontaje()) return toast("Con el rol Desmontador no podés crear operativos", "error");
  const n = await pedirTexto({ title: "Nuevo operativo", label: "Nombre del operativo", placeholder: "Granizo Córdoba 2026", ok: "Crear" });
  if (!n) return;
  try { await crearEmpresa(n); toast("Operativo creado", "success"); } catch (e) { toast(mensajeError(e), "error"); }
}

// Mantener apretado un operativo (400 ms) y arrastrarlo arriba o abajo lo cambia de lugar; al soltar se guarda el orden
function ordenable(ul, alSoltar) {
  if (!ul || ul.children.length < 2) return;
  let arr = null, timer = 0, y0 = 0, movido = false, largo = false;
  ul.addEventListener("pointerdown", e => {
    const li = e.target.closest("li"); if (!li) return;
    y0 = e.clientY; movido = largo = false;
    timer = setTimeout(() => { arr = { li, y: y0 }; largo = true; li.classList.add("arrastrando"); navigator.vibrate?.(15);
      try { ul.setPointerCapture(e.pointerId); } catch { /* sin captura */ } }, 400);
  });
  ul.addEventListener("pointermove", e => {
    if (!arr) { if (Math.abs(e.clientY - y0) > 8) clearTimeout(timer); return; }
    const li = arr.li; let dy = e.clientY - arr.y;
    const otro = dy > 0 ? li.nextElementSibling : li.previousElementSibling;
    if (otro && Math.abs(dy) > otro.offsetHeight / 2) {
      const h = otro.offsetHeight + 6;   // 6 = gap de la lista
      dy > 0 ? otro.after(li) : otro.before(li);
      arr.y += Math.sign(dy) * h; dy = e.clientY - arr.y; movido = true;
    }
    li.style.transform = `translateY(${dy}px)`;
  });
  const soltar = () => {
    clearTimeout(timer); if (!arr) return;
    arr.li.classList.remove("arrastrando"); arr.li.style.transform = ""; arr = null;
    if (movido) alSoltar([...ul.querySelectorAll("[data-id]")].map(b => b.dataset.id));
  };
  ul.addEventListener("pointerup", soltar); ul.addEventListener("pointercancel", soltar);
  ul.addEventListener("touchmove", e => { if (arr) e.preventDefault(); }, { passive: false });   // arrastrando no se desliza la hoja
  ul.addEventListener("contextmenu", e => e.preventDefault());
  ul.addEventListener("click", e => { if (largo) { e.preventDefault(); e.stopPropagation(); largo = false; } }, true);   // soltar no elige el operativo
}

export function elegirEmpresaSheet() {
  // Lista de operativos; abajo un solo botón con las opciones (gestionar / unirme / crear) y, en celular, Ajustes
  const s = openSheet({
    title: "Tus operativos",
    body: `<ul class="company-list">${S.companies.map(c => `
      <li><button class="company-opt ${c.id === S.company?.id ? "on" : ""}" data-id="${c.id}">
        ${logoOperativo("", c.name)}
        <span><strong>${esc(c.name)}</strong><small>${ROLES[c.roles?.[S.user.uid]]?.label || ""} · ${c.members.length} ${c.members.length === 1 ? "persona" : "personas"}</small></span>
        ${c.id === S.company?.id ? icon("check") : ""}</button></li>`).join("")}</ul>
      <div class="op-menu">
        <button type="button" class="op-mas" id="op-mas" aria-expanded="false">${icon("settings")}<span><strong>Gestión</strong><small>Administrar, unirme a otro o crear uno</small></span>${icon("next")}</button>
        <div class="op-opciones" id="op-opciones" hidden>
          ${S.company ? `<a class="op-opc" href="#/operativo" data-close>${icon("settings")}<span><strong>Gestionar ${esc(S.company.name)}</strong><small>Usuarios, roles, sello y links</small></span></a>` : ""}
          <button type="button" class="op-opc" id="unir-op">${icon("swap")}<span><strong>Unirme a un operativo</strong><small>Pedir unirme a uno que ya existe</small></span></button>
          ${soloDesmontaje() ? "" : `<button type="button" class="op-opc" id="nuevo-op">${icon("plus")}<span><strong>Crear un operativo</strong><small>Empezá uno nuevo</small></span></button>`}
        </div>
        <a class="op-mas op-ajustes only-mobile" href="#/ajustes" data-close>${icon("settings")}<span><strong>Ajustes</strong></span>${icon("next")}</a>
      </div>`
  });
  ordenable($(".company-list", s.el), ids => guardarOrdenOps(ids).then(() => toast("Orden guardado", "success")).catch(err => toast(mensajeError(err), "error")));
  s.body.addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (b) { elegirEmpresa(b.dataset.id); s.close(); go("#/"); }
    if (e.target.closest("#op-mas")) { const o = $("#op-opciones", s.el), m = $("#op-mas", s.el); o.hidden = !o.hidden; m.setAttribute("aria-expanded", String(!o.hidden)); m.classList.toggle("abierto", !o.hidden); }
    if (e.target.closest("#nuevo-op")) { s.close(); crearOperativo(); }
    if (e.target.closest("#unir-op")) { s.close(); unirOperativo(); }
  });
}

// ═════════════════════════════════════════════════════════════
//  AJUSTES
// ═════════════════════════════════════════════════════════════
export function aplicarTema(t) {
  localStorage.setItem("tema", t);
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
}

export function vistaAjustes(view) {
  setTopbar({ title: "Ajustes", back: "#/" });
  const p = S.profile;
  const oscuro = document.documentElement.getAttribute("data-theme") !== "light";
  const enPapelera = papelera().length;
  const wa = p.whatsapp ? "+" + String(p.whatsapp).replace(/^(\d{2})(9)(\d{2})(\d{4})(\d{4})$/, "$1 $2 $3 $4-$5") : "";
  const nPap = soySacabollos() ? 0 : enPapelera + (soyAdmin() ? S.solicitudes?.length || 0 : 0);
  const fv = (() => { try { return localStorage.getItem("fechaVista") || "peritado"; } catch { return "peritado"; } })();
  // Fila de un grupo: ícono, texto, valor y flechita (o un control a la derecha)
  const fila = (id, ic, txt, valor = "", extra = "") => `<button type="button" class="aj-item ${extra}" id="${id}">${icon(ic)}<span class="aj-txt">${txt}</span><span class="aj-val">${valor}</span>${icon("next")}</button>`;
  view.innerHTML = `
  <div class="page narrow ajustes">
    <section class="aj-perfil">
      ${avatarUsuario(p.username, p.name, "lg", p.foto)}
      <div class="profile-meta"><h2>${esc(p.name)}</h2><p class="muted">@${esc(p.username)}</p>
        ${p.whatsapp ? `<p class="perfil-wa" title="WhatsApp vinculado al bot">${icon("chat")}${esc(wa)}</p>`
          : `<button type="button" class="btn btn-primary btn-sm aj-vincular" id="vincular-wa">${icon("chat")}Vincular WhatsApp</button>`}</div>
    </section>

    <section class="aj-grupo"><h3>Cuenta</h3><div class="aj-lista">
      ${fila("editar-perfil", "edit", "Perfil", esc(p.name))}
      ${WHATSAPP_BOT ? `<a class="aj-item" href="https://wa.me/${WHATSAPP_BOT}?text=ayuda" target="_blank" rel="noopener">${icon("chat")}<span class="aj-txt">Chat con el bot</span><span class="aj-val"></span>${icon("next")}</a>` : ""}
      ${usaClientes() && S.company ? fila("mt-abrir", "calendar", "Mensajes y turnos") : ""}
    </div></section>

    <section class="aj-grupo"><h3>Apariencia</h3><div class="aj-lista">
      <div class="aj-item aj-ctrl">${icon("image")}<span class="aj-txt">Tema</span>
        <div class="seg seg-sm" id="tema"><button class="seg-btn ${oscuro ? "" : "on"}" data-t="light">Claro</button><button class="seg-btn ${oscuro ? "on" : ""}" data-t="dark">Oscuro</button></div></div>
      ${S.config?.fechaVista === false ? "" : `<div class="aj-item aj-ctrl">${icon("calendar")}<span class="aj-txt">Fecha en la lista</span>
        <div class="seg seg-sm" id="fecha-vista">${[["peritado", "Peritación"], ["estado", "Último estado"]].map(([k, t]) => `<button class="seg-btn ${fv === k ? "on" : ""}" data-fv="${k}">${t}</button>`).join("")}</div></div>`}
    </div></section>

    <section class="aj-grupo"><div class="aj-lista">
      ${soySacabollos() ? "" : `<a class="aj-item" href="#/papelera">${icon("trash")}<span class="aj-txt">Papelera</span><span class="aj-val">${nPap || ""}</span>${icon("next")}</a>`}
      ${fila("salir", "logout", "Cerrar sesión", "", "aj-peligro")}
    </div></section>

    <p class="center aj-version"><button type="button" class="version-btn" id="version-btn"
      title="Tocá para forzar la actualización · mantené apretado para ver las novedades">Desabollito ${APP_VERSION} ${icon("rotate")}</button></p>
  </div>`;

  $("#editar-perfil", view).onclick = () => editarPerfil(() => vistaAjustes(view));
  if ($("#vincular-wa", view)) $("#vincular-wa", view).onclick = () => vincularWhatsApp(() => vistaAjustes(view));
  $("#tema", view).onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    aplicarTema(b.dataset.t); $$(".seg-btn", $("#tema", view)).forEach(x => x.classList.toggle("on", x === b));
  };
  if ($("#fecha-vista", view)) $("#fecha-vista", view).onclick = e => {
    const b = e.target.closest("[data-fv]"); if (!b) return;
    try { localStorage.setItem("fechaVista", b.dataset.fv); } catch { /* sin almacenamiento */ }
    $$(".seg-btn", $("#fecha-vista", view)).forEach(x => x.classList.toggle("on", x === b));
  };
  $("#mt-abrir", view)?.addEventListener("click", mensajesYTurnos);
  $("#salir", view).onclick = async () => { if (await confirmar({ title: "¿Cerrar sesión?", ok: "Cerrar sesión" })) salir(); };
  // Versión: tocar fuerza la actualización; mantener apretado muestra las novedades
  const vb = $("#version-btn", view); let largo = false, t = 0;
  vb.onpointerdown = () => { largo = false; t = setTimeout(() => { largo = true; navigator.vibrate?.(15); verNovedades(); }, 500); };
  vb.onpointerup = vb.onpointerleave = vb.onpointercancel = () => clearTimeout(t);
  vb.oncontextmenu = e => e.preventDefault();
  vb.onclick = () => { if (!largo) window.dispatchEvent(new Event("forzar-actualizacion")); largo = false; };
}

function verNovedades() {
  openSheet({ title: "Novedades", wide: true, body: `<div class="novedades">${NOVEDADES.map(n =>
    `<section class="nov"><h3>${esc(n.v)}</h3><ul>${n.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}</div>` });
}

// Links de solo lectura: el perito ve los vehículos de una compañía en este operativo (sin poder tocar nada)
function compartirPerito() {
  const cias = [...new Set(activos().map(v => (v.compania || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const url = t => `${location.origin}/v/?${t}`;
  const s = openSheet({ title: "Compartir con un perito", body: `<div class="stack">
    <p class="muted small">El link muestra solo los vehículos de esa compañía en <strong>${esc(S.company?.name || "")}</strong>: estado, turnos, fechas, fotos y todo el detalle, pero sin poder cambiar nada. Se actualiza solo.</p>
    <form class="row-btns" id="cp-form"><input name="cia" list="cp-cias" required placeholder="Compañía (ej: SMG)" autocomplete="off" style="flex:1">
      <datalist id="cp-cias">${cias.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <button class="btn btn-primary" type="submit">Crear link</button></form>
    <div id="cp-lista"><div class="skeleton" style="height:60px"></div></div></div>` });
  const lista = $("#cp-lista", s.el);
  const pintar = ls => {
    lista.innerHTML = ls.length ? `<ul class="trash">${ls.map(l => `<li><span class="t-meta"><strong>${esc(l.compania)}</strong>
        <small class="muted" style="word-break:break-all">${esc(url(l.token))}</small></span>
        <button type="button" class="btn btn-ghost btn-sm" data-copiar="${esc(l.token)}">Copiar</button>
        <button type="button" class="icon-btn sm danger" data-borrar="${esc(l.token)}" aria-label="Borrar link">${icon("trash")}</button></li>`).join("")}</ul>`
      : `<p class="muted small">Todavía no hay links.</p>`;
  };
  linksCompartidos().then(pintar).catch(e => { lista.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; });
  $("#cp-form", s.el).onsubmit = async e => {
    e.preventDefault();
    const b = $("button[type=submit]", e.target); busy(b, true, "Creando…");
    try { const ls = await linksCompartidos("crear", { compania: e.target.cia.value.trim() }); pintar(ls); e.target.reset();
      if (ls[0]) { navigator.clipboard?.writeText(url(ls[0].token)).catch(() => {}); toast("Link creado y copiado", "success"); } }
    catch (err) { toast(err.message, "error"); }
    busy(b, false);
  };
  lista.onclick = async e => {
    const c = e.target.closest("[data-copiar]"), d = e.target.closest("[data-borrar]");
    if (c) { const u = url(c.dataset.copiar); try { await navigator.clipboard.writeText(u); toast("Link copiado", "success"); } catch { pedirTexto?.({ title: "Link", value: u }); } }
    if (d && await confirmar({ title: "¿Borrar este link?", message: "Quien lo tenga ya no va a poder entrar.", ok: "Borrar", danger: true }))
      linksCompartidos("borrar", { token: d.dataset.borrar }).then(pintar).catch(err => toast(err.message, "error"));
  };
}

// Llamada al bot con la sesión (las respuestas de error vienen como { ok: false, error })
const llamarBot = async (ruta, datos = {}) => {
  try {
    const r = await fetch(`${BOT_API}/${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await S.user.getIdToken(), ...datos }) });
    return await r.json();
  } catch { return { ok: false, error: "Sin conexión. Probá de nuevo." }; }
};

// Vincular WhatsApp: la app da un código de 6 dígitos y se lo mandás al bot desde tu número
async function vincularWhatsApp(alTerminar) {
  const s = openSheet({ title: "Vincular WhatsApp", body: `<div class="stack center wa-cod"><div class="skeleton" style="height:90px"></div></div>` });
  const j = await llamarBot("codigo-wa"), caja = $(".wa-cod", s.el);
  if (!caja) return;
  if (!j.ok) { caja.innerHTML = `<p class="muted">${esc(j.error || "No se pudo generar el código")}</p>`; return; }
  const cod = `${j.codigo.slice(0, 3)} ${j.codigo.slice(3)}`;
  caja.innerHTML = `<p class="muted small">Mandale este código al bot por WhatsApp, desde el número que querés vincular. Vence en 15 minutos.</p>
    <strong class="wa-codigo" aria-label="Código ${esc(j.codigo)}">${esc(cod)}</strong>
    ${j.bot ? `<a class="btn btn-primary btn-block" href="https://wa.me/${esc(j.bot)}?text=${esc(j.codigo)}" target="_blank" rel="noopener">${icon("chat")}Mandar por WhatsApp</a>` : ""}
    <button type="button" class="btn btn-ghost btn-block" id="wa-copiar">Copiar código</button>`;
  $("#wa-copiar", s.el).onclick = () => navigator.clipboard?.writeText(j.codigo).then(() => toast("Código copiado", "success"), () => {});
  // Cuando el bot lo vincula, el perfil cambia solo: se cierra la hoja
  const listo = () => { if (S.profile?.whatsapp) { s.close(); toast("WhatsApp vinculado", "success"); alTerminar?.(); } };
  const t = setInterval(() => { if (!document.body.contains(s.el)) return clearInterval(t); listo(); }, 1500);
}

function editarPerfil(alTerminar) {
  const p = S.profile;
  const s = openSheet({
    title: "Editar perfil",
    body: `<form class="stack" id="perfil-form">
      <label class="field"><span>Nombre</span>
        <input name="nombre" value="${esc(p.name)}" required autocomplete="name"></label>
      <label class="field"><span>Usuario</span>
        <input value="@${esc(p.username)}" readonly disabled>
        <small class="muted">El usuario no se puede cambiar. Es el que usan para sumarte a un operativo.</small></label>
      <button class="btn btn-primary btn-block btn-lg">Guardar perfil</button>
      ${p.whatsapp ? `<button type="button" class="btn btn-ghost btn-block" id="wa-foto">${icon("image")}Usar mi foto de WhatsApp</button>
        <button type="button" class="btn btn-danger-ghost btn-block" id="wa-desv">${icon("chat")}Desvincular WhatsApp</button>` : ""}
    </form>`
  });
  $("#wa-foto", s.el)?.addEventListener("click", async e => {
    const b = e.currentTarget; busy(b, true, "Buscando tu foto…");
    const j = await llamarBot("foto-wa");
    busy(b, false);
    if (!j.ok) return toast(j.error || "No se pudo", "warning");
    S.profile.foto = j.foto; toast("Foto actualizada", "success"); s.close(); alTerminar?.();
    pintarLateral();
  });
  $("#wa-desv", s.el)?.addEventListener("click", async () => {
    if (!(await confirmar({ title: "¿Desvincular tu WhatsApp?", message: "Para volver a usar el bot vas a tener que vincularlo de nuevo con un código desde Ajustes.", ok: "Desvincular", danger: true }))) return;
    desvincularWhatsApp().then(() => { toast("WhatsApp desvinculado", "success"); s.close(); alTerminar?.(); }).catch(e => toast(mensajeError(e), "error"));
  });
  $("#perfil-form", s.el).onsubmit = async e => {
    e.preventDefault();
    const b = $("button.btn-primary", e.target);
    busy(b, true, "Guardando…");
    try {
      await actualizarPerfil({ nombre: e.target.nombre.value });
      toast("Perfil actualizado", "success");
      s.close(); alTerminar?.();
    } catch (err) { toast(mensajeError(err), "error"); busy(b, false); }
  };
}

// ═════════════════════════════════════════════════════════════
//  PAPELERA
// ═════════════════════════════════════════════════════════════
const QUE_PIDE = { eliminar: "pide eliminarlo", foto: "pide quitar una foto", documento: "pide quitar el documento", editar: "pide acceso para editarlo" };
const BOTON_OK = { eliminar: "Eliminar", foto: "Quitar foto", documento: "Quitar", editar: "Dar acceso" };
const HECHO = { eliminar: "Vehículo eliminado", foto: "Foto quitada", documento: "Documento quitado", editar: "Acceso de edición otorgado" };
const quedan = v => {
  const t = v.deletedAt?.toMillis ? v.deletedAt.toMillis() : Date.parse(tsToISO(v.deletedAt) || "");
  if (!t) return "Se elimina en 48 hs";
  const h = Math.ceil((t + 48 * 3600_000 - Date.now()) / 3600_000);
  return h <= 1 ? "Se elimina en menos de 1 h" : `Se elimina en ${h} hs`;
};
export function vistaPapelera(view) {
  setTopbar({ title: "Papelera", back: "#/ajustes" });
  const items = papelera();
  const admin = soyAdmin();
  const sols = admin ? (S.solicitudes || []) : [];
  view.innerHTML = `
  <div class="page narrow">
    ${sols.length ? `<section class="card">
      <h3>Solicitudes <small class="muted">${sols.length}</small></h3>
      <ul class="trash solicitudes">${sols.map(x => `
        <li><span class="t-meta"><strong>${esc(x.modelo || "Sin modelo")}</strong>
          <span>${plate(x.patente, "sm")}<small class="muted">${esc(x.pedidoPorUser ? "@" + x.pedidoPorUser : x.pedidoPorNombre || "Alguien")} ${esc(QUE_PIDE[x.tipo || "eliminar"])}${x.tipo === "documento" && x.item?.name ? ` “${esc(x.item.name)}”` : ""} · cargado por ${esc(x.cargadoPor || "—")}</small></span></span>
          ${x.tipo === "foto" && x.item?.url ? `<a class="sol-foto" href="${esc(x.item.url)}" target="_blank" rel="noopener"><img src="${esc(x.item.url.replace("/upload/", "/upload/c_fill,w_80,h_80,q_auto,f_auto/"))}" alt=""></a>` : ""}
          <button class="btn ${x.tipo === "editar" ? "btn-ghost" : "btn-danger-ghost"} btn-sm" data-ok="${x.id}">${BOTON_OK[x.tipo || "eliminar"]}</button>
          <button class="icon-btn sm" data-no="${x.id}" aria-label="Rechazar">${icon("x")}</button>
        </li>`).join("")}</ul>
    </section>` : ""}
    ${items.length ? `<p class="muted small">Los vehículos se eliminan solos (con sus fotos) a las 48 hs de borrados.</p>
    <ul class="trash">${items.map(v => `
      <li><span class="t-meta"><strong>${esc(v.modelo || "Sin modelo")}</strong>
        <span>${plate(v.patente, "sm")}<small class="muted">${quedan(v)}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-r="${v.id}">${icon("restore")}Restaurar</button>
        <button class="icon-btn sm danger" data-x="${v.id}" aria-label="Eliminar para siempre">${icon("trash")}</button>
      </li>`).join("")}</ul>`
    : `<div class="empty"><h2>Tu papelera está vacía</h2><p>Lo que borres aparece acá por si te arrepentís.</p></div>`}
  </div>`;
  $(".page", view).onclick = async e => {
    const ok = e.target.closest("[data-ok]"), no = e.target.closest("[data-no]");
    if (ok || no) {
      const sol = sols.find(x => x.id === (ok ? ok.dataset.ok : no.dataset.no));
      const tipo = sol.tipo || "eliminar";
      if (ok && tipo === "eliminar" && !(await confirmar({ title: `¿Eliminar ${sol.modelo || sol.patente}?`, message: "Va a tu papelera; desde ahí se puede restaurar.", ok: "Eliminar", danger: true }))) return;
      resolverSolicitud(sol, !!ok).then(() => toast(ok ? HECHO[tipo] : "Solicitud rechazada", "success")).catch(err => toast(mensajeError(err), "error"));
      return;
    }
    const r = e.target.closest("[data-r]"), x = e.target.closest("[data-x]");
    if (r) { restaurar(r.dataset.r).catch(err => toast(mensajeError(err), "error")); toast("Vehículo restaurado", "success"); }
    if (x) {
      const v = items.find(i => i.id === x.dataset.x);
      if (await confirmar({ title: `¿Eliminar “${v?.modelo || v?.patente}” para siempre?`, message: "Se borran también sus fotos. No se puede deshacer.", ok: "Eliminar", danger: true }))
        eliminarDefinitivo(x.dataset.x).then(() => toast("Eliminado", "success")).catch(err => toast(mensajeError(err), "error"));
    }
  };
}

// ── Panel del creador: se abre manteniendo apretado el botón de Ajustes (solo @gzmatte)
export async function panelCreador() {
  const s = openSheet({ title: "Administración", wide: true, body: `<div class="adm"><div class="skeleton" style="height:160px"></div></div>` });
  const caja = $(".adm", s.el);
  let tab = "operativos", datos = null, accAbierto = false, accOp = null;   // accOp: operativo elegido en "Quién ve las planillas"
  // Acceso efectivo de cada usuario (lo elegido o, si no, lo de siempre)
  const opAcc = () => datos.operativos.find(o => o.id === accOp) || datos.operativos.find(o => /paran/i.test(o.name)) || datos.operativos[0];
  const accesoDe = (op, m) => { const e = datos.config?.accesosOp?.[op.id]?.[m.uid] || {}, adm = ["admin", "owner"].includes(m.rol);
    // Igual que puedeVer: Sacabollos (rol técnico) ve Vehículos, Técnicos y Fijos, no Gastos
    const sac = ["", "tecnico"].includes(m.rol);
    return { planilla: e.planilla ?? true, tecnicos: e.tecnicos ?? (adm || sac), gastos: e.gastos ?? !sac, fijos: e.fijos ?? (adm || sac), facturacion: e.facturacion ?? adm, cierre: e.cierre ?? e.gastos ?? adm }; };
  const nVeh = n => n === null || n === undefined ? "" : `${n} ${n === 1 ? "vehículo" : "vehículos"}`;
  const pintar = () => {
    const { operativos, usuarios } = datos;
    caja.innerHTML = `
      <div class="adm-toggles">
        <label class="toggle"><input type="checkbox" data-config="avisoReparado" ${datos.config?.avisoReparado !== false ? "checked" : ""}>
          <span>Avisar al cliente al marcar Contactado</span></label>
        <label class="toggle"><input type="checkbox" data-config="documentos" ${datos.config?.documentos !== false ? "checked" : ""}>
          <span>Documentos en los vehículos</span></label>
        <label class="toggle"><input type="checkbox" data-config="fechaVista" ${datos.config?.fechaVista !== false ? "checked" : ""}>
          <span>Elegir en Ajustes la fecha que se muestra en la lista</span></label>
        <label class="toggle"><input type="checkbox" data-config="etapasPdf" ${datos.config?.etapasPdf ? "checked" : ""}>
          <span>Estado de repuestos y pintura en los PDF</span></label>
        <label class="toggle"><input type="checkbox" data-config="planillaVeh" ${datos.config?.planillaVeh !== false ? "checked" : ""}>
          <span>Planilla de vehículos</span></label>
      </div>
      <div class="adm-toggles adm-sonido">
        <span><b>Sonido al actualizar la app</b> <small class="muted">(lo escuchan todos)</small></span>
        <div class="adm-son">${SONIDOS_AUTO.map(([k, t, d]) => `<div class="adm-son-op ${(datos.config?.sonidoAuto || "deportivo") === k ? "on" : ""}">
          <label><input type="radio" name="son-auto" value="${k}" ${(datos.config?.sonidoAuto || "deportivo") === k ? "checked" : ""}><span><b>${t}</b><small class="muted">${d}</small></span></label>
          <button type="button" class="btn btn-ghost btn-sm" data-probar="${k}">▶ Probar</button></div>`).join("")}</div>
      </div>
      <div class="adm-toggles adm-wa">
        <label class="field"><span><b>Mensaje del botón WhatsApp</b> <small class="muted">(Contactar → WhatsApp, en Revisión o Contactado)</small></span>
          <textarea id="adm-wa" rows="3" placeholder="Hola {Asegurado}! Te escribimos por tu {Vehiculo} patente {Patente}…">${esc(datos.config?.mensajeWa || "")}</textarea></label>
        <small class="muted">Podés pegar el link entero (wa.me/numero?text=…) o solo el texto. Datos: ${["Saludo", "Vehiculo", "Patente", "Asegurado", "Telefono", "Compania", "Operativo", "Grado", "Precio", "Estado", "Repuestos", "Pintura", "Fecha", "Turno", "HoraTurno", "Usuario"].map(x => `<button type="button" class="chip-var" data-var="{${x}}">{${x}}</button>`).join(" ")}</small>
        <span class="row-btns"><button type="button" class="btn btn-primary btn-sm" id="adm-wa-ok">Guardar mensaje</button></span>
      </div>
      <div class="adm-toggles adm-padron">
        <span><b>Planilla de asegurados</b><br><small class="muted">${datos.config?.padronN ? `${datos.config.padronN} patentes cargadas` : "Sin cargar"} · columna 1 nombre, columna 2 patente</small></span>
        <span class="row-btns">
          <label class="btn btn-ghost btn-sm">${icon("import")}${datos.config?.padronN ? "Actualizar" : "Subir"}<input type="file" accept=".csv,.xlsx,.txt" hidden id="adm-padron"></label>
          ${datos.config?.padronN ? `<button type="button" class="btn btn-ghost btn-sm danger" id="adm-padron-del">${icon("trash")}Borrar</button>` : ""}
        </span>
      </div>
      <div class="adm-toggles">
        <span><b>Fotos de perfil</b><br><small class="muted">Vuelve a buscar la foto de WhatsApp de todos los vinculados y te dice qué pasó con cada uno. Las puestas a mano (📷 en Usuarios) no se tocan.</small></span>
        <span class="row-btns"><button type="button" class="btn btn-ghost btn-sm" id="adm-fotos">${icon("image")}Traer fotos</button></span>
      </div>
      <div class="adm-toggles">
        <span><b>Número de la empresa</b> <small class="muted">(conexión «clientes»: avisos, mensajes y turnos)</small><br><small class="muted" id="adm-cli-est">Tocá Conectar para ver el estado.</small></span>
        <span class="row-btns"><button type="button" class="btn btn-ghost btn-sm" id="adm-cli">${icon("phone")}Conectar</button>
          <button type="button" class="btn btn-primary btn-sm" id="adm-masivo">${icon("chat")}Mensajes y turnos</button></span>
        <div id="adm-cli-qr"></div>
      </div>
      <details class="adm-toggles">
        <summary><b>Quién usa Mensajes y turnos</b> <small class="muted">${(datos.config?.usanClientes || []).length ? (datos.config.usanClientes.length + " además de vos") : "solo vos"}</small></summary>
        ${usuarios.filter(u => u.username !== "gzmatte" && u.aprobado).map(u => `<label class="toggle"><input type="checkbox" data-usa="${esc(u.uid)}" ${(datos.config?.usanClientes || []).includes(u.uid) ? "checked" : ""}>
          <span>${esc(u.name || "Sin nombre")} <small class="muted">@${esc(u.username)}</small></span></label>`).join("")}
        <small class="muted">Lo ven en Ajustes y solo pueden usarlo en los operativos donde son miembros. Conectar el número sigue siendo solo tuyo.</small>
      </details>
      <details class="adm-toggles adm-accesos" ${accAbierto ? "open" : ""}>
        <summary><b>Quién ve las planillas</b> <small class="muted">Vehículos · Técnicos · Gastos · Fijos · Facturación · Cierre</small></summary>
        ${(() => { const op = opAcc(); if (!op) return `<small class="muted">No hay operativos.</small>`;
        if (!("accesosOp" in (datos.config || {}))) return `<small class="muted">Falta publicar el bot nuevo para elegir por operativo.</small>`;   // el bot viejo pisaría las tildes de los demás
        return `<label class="field"><span>Operativo</span><select id="adm-acc-op">${operativos.map(o => `<option value="${esc(o.id)}" ${o.id === op.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
        <div class="adm-acc-head"><span></span><small>Vehíc.</small><small>Técnicos</small><small>Gastos</small><small>Fijos</small><small>Factura</small><small>Cierre</small></div>
        ${op.miembros.filter(m => usuarios.find(u => u.uid === m.uid)?.username !== "gzmatte").map(m => { const a = accesoDe(op, m), u = usuarios.find(x => x.uid === m.uid);
          return `<div class="adm-acc-fila" data-acc="${esc(m.uid)}"><span><b>${esc(u?.name || "Sin nombre")}</b> <small class="muted">${esc(u ? "@" + u.username : m.quien)}</small></span>
            ${["planilla", "tecnicos", "gastos", "fijos", "facturacion", "cierre"].map(k => `<input type="checkbox" data-acc-sec="${k}" ${a[k] ? "checked" : ""} aria-label="${k}">`).join("")}</div>`; }).join("")}`; })()}
        <small class="muted">Sin tocar: Técnicos, Fijos y Facturación los ven los administradores; Vehículos todos; Gastos todos menos Sacabollos (que ve Técnicos y Fijos); Cierre igual que Gastos si está tildado, si no los administradores. Vale solo para este operativo. Vos siempre ves todo.</small>
      </details>
      <div class="seg seg-sm adm-tabs">
        <button type="button" class="seg-btn ${tab === "operativos" ? "on" : ""}" data-tab="operativos">Operativos <small>${operativos.length}</small></button>
        <button type="button" class="seg-btn ${tab === "usuarios" ? "on" : ""}" data-tab="usuarios">Usuarios <small>${usuarios.length}</small></button>
      </div>
      ${tab === "operativos" ? `<ul class="adm-list">${operativos.map(o => `
        <li><div><strong>${esc(o.name)}</strong> <span class="adm-n">${nVeh(o.vehiculos)}</span>
          <small class="muted">${o.miembros.map(m => `${esc(m.quien)}${m.rol === "admin" ? " (admin)" : ""}`).join(" · ") || "Sin miembros"}</small></div></li>`).join("")}</ul>`
      : `<ul class="adm-list">${usuarios.map(u => `
        <li>${avatarUsuario(u.username, u.name, "sm", u.foto)}<div><strong>${esc(u.name || "Sin nombre")}</strong>
          <small class="muted">@${esc(u.username)}${u.whatsapp ? ` · +${esc(u.whatsapp)}` : ""}${!u.aprobado ? " · pendiente" : ""}${u.rechazado ? " · rechazado" : ""}</small>
          <small class="adm-ops">${(() => { const ops = operativos.filter(o => o.miembros.some(m => m.uid === u.uid));
            return ops.length ? ops.map(o => `${esc(o.name)} <b>${nVeh(o.vehiculos)}</b>`).join(" · ") : `<span class="muted">Sin operativos</span>`; })()}</small></div>
          <button type="button" class="icon-btn sm" data-foto-u="${esc(u.uid)}" aria-label="Poner foto de ${esc(u.name || u.username)}" title="${u.fotoManual ? "Cambiar la foto (puesta a mano)" : "Poner una foto a mano"}">${icon("camera")}</button>
          ${u.username === "gzmatte" ? "" : `<button type="button" class="icon-btn sm danger" data-borrar="${esc(u.uid)}" aria-label="Eliminar usuario" title="Eliminar de la app">${icon("trash")}</button>`}</li>`).join("")}</ul>`}`;
  };
  const cargar = async () => {
    try {
      const [d, c] = await Promise.all([llamarAdmin("datos"), llamarAdmin("config").catch(() => ({ config: { avisoReparado: true, documentos: true } }))]);
      datos = { ...d, config: c.config }; pintar();
    }
    catch (e) { caja.innerHTML = `<p class="muted center">${esc(e.message)}</p>`; }
  };
  caja.addEventListener("change", async e => {
    if (e.target.id === "adm-padron") {
      const file = e.target.files[0]; e.target.value = "";
      if (!file) return;
      try {
        const filas = await leerPadron(file);
        if (!filas.length) return toast("No encontré filas con nombre (columna 1) y patente (columna 2)", "error");
        if (!(await confirmar({ title: `¿Cargar ${filas.length} asegurados?`, message: `Reemplaza la planilla anterior. Ej: ${filas.slice(0, 2).map(f => `${f.nombre} → ${f.patente}`).join(" · ")}`, ok: "Cargar" }))) return;
        toast("Subiendo la planilla…");
        const r = await llamarAdmin("padron", { filas });
        datos.config = { ...datos.config, padronN: r.n }; pintar();
        toast(`${r.n} asegurados cargados`, "success");
      } catch (err) { toast(err.message || mensajeError(err), "error"); }
      return;
    }
    if (e.target.name === "son-auto") {
      try { const r = await llamarAdmin("config", { sonidoAuto: e.target.value }); datos.config = r.config; S.config = { ...S.config, sonidoAuto: r.config.sonidoAuto }; pintar(); toast("Sonido guardado", "success"); }
      catch (err) { toast(err.message, "error"); }
      return;
    }
    if (e.target.id === "adm-acc-op") { accOp = e.target.value; pintar(); return; }
    if (e.target.dataset.usa) {
      const uid = e.target.dataset.usa, on = e.target.checked, l = (datos.config?.usanClientes || []).filter(x => x !== uid);
      e.target.disabled = true;
      try { const r = await llamarAdmin("config", { usanClientes: on ? [...l, uid] : l }); datos.config = r.config; e.target.disabled = false; toast("Guardado", "success"); }
      catch (err) { e.target.checked = !on; e.target.disabled = false; toast(err.message, "error"); }
      return;
    }
    const sec = e.target.dataset.accSec;
    if (sec) {
      const uid = e.target.closest("[data-acc]").dataset.acc, on = e.target.checked, op = opAcc();
      // Se guarda solo lo que se tocó: el resto sigue con lo de su rol en este operativo
      const accesos = { ...datos.config?.accesosOp?.[op.id] };
      accesos[uid] = { ...accesos[uid], [sec]: on };
      e.target.disabled = true;
      try { const r = await llamarAdmin("config", { cid: op.id, accesos }); datos.config = r.config; S.config = { ...S.config, accesosOp: r.config.accesosOp || {} }; toast("Acceso guardado", "success"); }
      catch (err) { e.target.checked = !on; toast(err.message, "error"); }
      e.target.disabled = false;
      return;
    }
    const clave = e.target.dataset.config;
    if (!clave) return;
    const on = e.target.checked;
    e.target.disabled = true;
    try {
      const r = await llamarAdmin("config", { [clave]: on });
      datos.config = r.config; S.config = { ...S.config, ...r.config };
      toast(`${{ documentos: "Documentos", fechaVista: "Elegir fecha", etapasPdf: "Estado en los PDF", planillaVeh: "Planilla de vehículos" }[clave] || "Aviso al cliente"} ${on ? "activado" : "desactivado"}`, "success");
    } catch (err) { e.target.checked = !on; toast(err.message, "error"); }
    e.target.disabled = false;
  });
  caja.addEventListener("toggle", e => { if (e.target.classList?.contains("adm-accesos")) accAbierto = e.target.open; }, true);
  caja.addEventListener("click", e => { const p = e.target.closest("[data-probar]"); if (p) ruidoMotor(p.dataset.probar, true); });
  caja.addEventListener("click", async e => {
    const fb = e.target.closest("#adm-fotos");
    if (fb) {   // de a tandas hasta que no queden; al final, el motivo de cada uno
      busy(fb, true, "Buscando…"); const detalle = [];
      try { let desde = 0; for (let i = 0; i < 40; i++) { const j = await llamarAdmin("fotos-wa", { desde }); detalle.push(...j.detalle); desde = j.siguiente; if (!j.quedan || !j.detalle.length) break; } }
      catch (err) { toast(err.message, "error"); }
      busy(fb, false);
      if (!detalle.length) return toast("No hay usuarios con WhatsApp vinculado (o todos tienen foto puesta a mano)");
      cargar();
      return openSheet({ title: `Fotos: ${detalle.filter(d => d.foto).length} de ${detalle.length}`, body: `<ul class="adm-list">${detalle.map(d =>
        `<li><div><strong>@${esc(d.usuario)}</strong><small class="${d.foto ? "" : "muted"}">${d.foto ? "✓ " : ""}${esc(d.motivo)}</small></div></li>`).join("")}</ul>` });
    }
    const cli = e.target.closest("#adm-cli, #adm-cli-salir");
    if (cli) {   // estado del número de la empresa; sin conectar, muestra el QR (WhatsApp → Dispositivos vinculados)
      const salir = cli.id === "adm-cli-salir";
      if (salir && !(await confirmar({ title: "¿Desvincular el número de la empresa?", message: "Dejan de salir los avisos y mensajes a clientes hasta que vuelvas a escanear el QR.", ok: "Desvincular" }))) return;
      busy(cli, true, "…");
      try {
        const r = await llamarAdmin("clientes-qr", { salir });
        $("#adm-cli-est", caja).textContent = r.estado === "open" ? "✓ Conectado" : r.qr ? "Escaneá el QR desde WhatsApp → Dispositivos vinculados y tocá Conectar de nuevo." : `Estado: ${r.estado}. Tocá Conectar de nuevo.`;
        $("#adm-cli-qr", caja).innerHTML = r.estado === "open" ? `<button type="button" class="btn btn-ghost btn-sm danger" id="adm-cli-salir">Desvincular número</button>`
          : r.qr ? `<img src="${esc(r.qr)}" alt="QR para vincular el número de la empresa" style="width:240px;max-width:100%;background:#fff;border-radius:var(--r);padding:8px">` : "";
      } catch (err) { toast(err.message, "error"); }
      if (cli.isConnected) busy(cli, false);
      return;
    }
    if (e.target.closest("#adm-masivo")) return mensajesYTurnos();
    const fu = e.target.closest("[data-foto-u]");
    if (fu) {   // foto a mano para un usuario: se elige la imagen, se achica y se sube
      const inp = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return;
        toast("Subiendo foto…");
        try {
          const r = await subir(await comprimir(file, 480, 0.85), "perfiles");
          await llamarAdmin("foto-usuario", { uid: fu.dataset.fotoU, url: r.url });
          toast("Foto guardada", "success"); cargar();
        } catch (err) { toast(err.message || mensajeError(err), "error"); }
      };
      return inp.click();
    }
    const chip = e.target.closest("[data-var]");
    if (chip) {
      const ta = $("#adm-wa", caja), i = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, i) + chip.dataset.var + ta.value.slice(ta.selectionEnd ?? i);
      ta.focus(); ta.selectionStart = ta.selectionEnd = i + chip.dataset.var.length;
      return;
    }
    if (e.target.closest("#adm-wa-ok")) {
      const b = e.target.closest("#adm-wa-ok"); b.disabled = true;
      try {
        const r = await llamarAdmin("config", { mensajeWa: $("#adm-wa", caja).value.trim() });
        datos.config = r.config; S.config = { ...S.config, ...r.config };
        toast("Mensaje guardado", "success");
      } catch (err) { toast(err.message, "error"); }
      b.disabled = false;
      return;
    }
    if (e.target.closest("#adm-padron-del")) {
      if (!(await confirmar({ title: "¿Borrar la planilla de asegurados?", ok: "Borrar", danger: true }))) return;
      try { await llamarAdmin("padron", { filas: [] }); datos.config = { ...datos.config, padronN: 0 }; pintar(); toast("Planilla borrada", "success"); }
      catch (err) { toast(err.message, "error"); }
      return;
    }
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; return pintar(); }
    const b = e.target.closest("[data-borrar]");
    if (!b) return;
    const u = datos.usuarios.find(x => x.uid === b.dataset.borrar);
    if (!(await confirmar({ title: `¿Eliminar a ${u.name || "@" + u.username}?`, message: `Se borra su cuenta @${u.username}, su WhatsApp vinculado y se lo quita de todos los operativos. Los vehículos que cargó quedan.`, ok: "Eliminar", danger: true }))) return;
    b.disabled = true;
    try { await llamarAdmin("borrar-usuario", { uid: u.uid }); toast("Usuario eliminado", "success"); await cargar(); }
    catch (err) { b.disabled = false; toast(err.message, "error"); }
  });
  cargar();
}

// ── Mensajes y turnos: salen del número de la empresa, de a uno y con pausa para que WhatsApp no lo bloquee
const TXT = {
  turnos: "{Saludo} {Asegurado}! Te escribimos de {Operativo} por tu {Vehiculo} patente {Patente}: te dimos turno para el {Turno}. Respondé este mensaje para confirmar. ¡Gracias!",
  mensaje: "{Saludo} {Asegurado}! Te escribimos de {Operativo}: tu {Vehiculo} ({Patente}) ya está reparado y listo para retirar. ¡Gracias por confiar en nosotros!"
};
const PAUSA_MS = 6000;
const DIAS_SEM = [[1, "Lu"], [2, "Ma"], [3, "Mi"], [4, "Ju"], [5, "Vi"], [6, "Sá"], [0, "Do"]];
const GRADOS_T = [[1, "Grado 1"], [2, "Grado 2"], [3, "Grado 3"], [4, "Grado +"], [0, "Sin grado"]];
function mensajesYTurnos() {
  let modo = "turnos", est = "peritado", q = "", cia = "", grado = "", porGradoOn = false, cortar = false, enviando = false;
  const marcados = new Set(), dias = new Set([1, 2, 3, 4, 5]), txt = { turnos: TXT.turnos, mensaje: S.config?.mensajeWa || TXT.mensaje };
  const cupoG = { 1: 3, 2: 2, 3: 1, 4: 0, 0: 0 };
  const manana = new Date(Date.now() + 864e5).toLocaleDateString("en-CA");
  const ciaDe = v => String(v.compania || "").trim() || "Sin compañía";
  const s = openSheet({ title: `Mensajes y turnos · ${S.company?.name || ""}`, wide: true, onClose: () => { cortar = true; }, body: `<div class="adm mt">
    <div class="seg seg-sm adm-tabs">${[["turnos", "Avisar turno"], ["mensaje", "Avisar reparado"]].map(([k, t]) => `<button type="button" class="seg-btn" data-modo="${k}">${t}</button>`).join("")}</div>
    <div class="adm-toggles">
      <label class="field"><span>Estado</span><select id="mt-est">${ESTADOS.map(e => `<option value="${e.key}">${e.label}</option>`).join("")}</select></label>
      <label class="field"><span>Compañía</span><select id="mt-cia"></select></label>
      <label class="field"><span>Grado</span><select id="mt-grado"><option value="">Todos</option>${GRADOS_T.map(([g, t]) => `<option value="${g}">${t}</option>`).join("")}</select></label>
      <label class="field"><span>Buscar</span><input type="search" id="mt-q" placeholder="Patente, asegurado, modelo…"></label>
    </div>
    <p class="small"><button type="button" class="link-btn" id="mt-todos">Marcar todos</button> · <span id="mt-n"></span></p>
    <ul class="adm-list" id="mt-lista"></ul>
    <div id="mt-turnos" class="adm-toggles">
      <label class="field"><span>Desde</span><input type="date" id="mt-desde" value="${manana}"></label>
      <label class="field"><span>Fecha límite <small class="muted">(opcional)</small></span><input type="date" id="mt-hasta"></label>
      <span class="row-btns">${DIAS_SEM.map(([d, t]) => `<label class="toggle"><input type="checkbox" data-dia="${d}" ${dias.has(d) ? "checked" : ""}><span>${t}</span></label>`).join("")}</span>
      <label class="toggle"><input type="checkbox" id="mt-pg"><span>Intercalar grados por día</span></label>
      <label class="field" id="mt-pordia-f"><span>Autos por día <small class="muted">(contando los turnos que ya hay)</small></span><input type="number" id="mt-pordia" min="1" max="200" value="5" inputmode="numeric"></label>
      <span class="row-btns" id="mt-pg-f" hidden>${GRADOS_T.map(([g, t]) => `<label class="field"><span>${t}</span><input type="number" min="0" max="50" value="${cupoG[g]}" data-cupo="${g}" inputmode="numeric" style="width:5em"></label>`).join("")}</span>
    </div>
    <label class="field"><span>Mensaje</span><textarea id="mt-txt" rows="4"></textarea></label>
    <small class="muted">Datos: ${["Saludo", "Asegurado", "Vehiculo", "Patente", "Operativo", "Turno", "Compania", "Grado", "Precio"].map(x => `<button type="button" class="chip-var" data-var="{${x}}">{${x}}</button>`).join(" ")}</small>
    <div id="mt-prev" class="muted small"></div>
    <span class="row-btns"><button type="button" class="btn btn-primary" id="mt-ir"></button></span>
  </div>` });
  const el = x => $(x, s.el);
  const delEstado = () => activos().filter(v => estadoActual(v) === est);
  const lista = () => delEstado().filter(v => (!cia || ciaDe(v) === cia) && (grado === "" || (v.grado || 0) === Number(grado))
    && (!q || [v.patente, v.asegurado, v.modelo, v.telefono].some(x => String(x || "").toLowerCase().includes(q))))
    .sort((a, b) => (b.fechas?.peritado || "").localeCompare(a.fechas?.peritado || ""));   // peritado más reciente primero
  const elegidos = () => lista().filter(v => marcados.has(v.id));
  // Turnos que ya hay por día (sin contar los que se están volviendo a turnar), para no sobreturnar
  const fechas = l => {
    const ids = new Set(l.map(v => v.id)), ocupados = {};
    activos().filter(v => estadoActual(v) === "turnado" && v.fechas?.turnado && !ids.has(v.id)).forEach(v => (ocupados[v.fechas.turnado] ||= []).push(v.grado || 0));
    return repartirTurnos(l.map(v => v.grado || 0), { desde: el("#mt-desde").value, hasta: el("#mt-hasta").value, porDia: Number(el("#mt-pordia").value),
      porGrado: porGradoOn ? Object.fromEntries($$("[data-cupo]", s.el).map(i => [i.dataset.cupo, Number(i.value) || 0])) : null, dias: [...dias], ocupados });
  };
  const conTurno = (v, f) => f ? { ...v, fechas: { ...v.fechas, turnado: f }, horaTurno: "" } : v;
  const pintarLista = () => {
    const cias = [...new Set(delEstado().map(ciaDe))].sort();
    if (cia && !cias.includes(cia)) cia = "";
    el("#mt-est").value = est;
    el("#mt-cia").innerHTML = `<option value="">Todas</option>` + cias.map(c => `<option ${c === cia ? "selected" : ""}>${esc(c)}</option>`).join("");
    el("#mt-lista").innerHTML = lista().map(v => `<li><label class="toggle"><input type="checkbox" data-v="${esc(v.id)}" ${marcados.has(v.id) ? "checked" : ""}>
      <span>${plate(v.patente, "sm")} ${esc(v.asegurado || v.modelo || "")} <small class="muted">${v.grado ? `G${v.grado === 4 ? "+" : v.grado} · ` : ""}${esc(fechaCorta(v.fechas?.peritado) || "")} · ${v.telefono ? esc(v.telefono) : "sin teléfono: no se le escribe"}</small></span></label></li>`).join("")
      || `<li class="muted">No hay vehículos con ese filtro.</li>`;
    resumen();
  };
  const resumen = () => {
    const l = elegidos(), f = modo === "turnos" ? fechas(l) : [], faltan = f.filter(x => !x).length;
    $$("[data-modo]", s.el).forEach(b => b.classList.toggle("on", b.dataset.modo === modo));
    el("#mt-turnos").hidden = modo !== "turnos";
    el("#mt-pordia-f").hidden = porGradoOn; el("#mt-pg-f").hidden = !porGradoOn;
    if (el("#mt-txt").value !== txt[modo]) el("#mt-txt").value = txt[modo];
    el("#mt-n").textContent = `${l.length} de ${lista().length} marcados`;
    el("#mt-ir").textContent = modo === "turnos" ? `Turnar ${l.length} y avisar` : `Enviar a ${l.filter(v => v.telefono).length}`;
    el("#mt-ir").disabled = enviando || !l.length || faltan > 0;
    el("#mt-prev").innerHTML = !l.length ? "" : (modo === "turnos" ? (faltan ? `<p style="color:var(--danger)">No entran ${faltan} antes de la fecha límite: desmarcá autos, subí el cupo o mové la fecha.</p>` : "")
      + `<p>${l.map((v, i) => `${esc(v.patente || v.modelo || "")} → ${f[i] ? esc(fechaLarga(f[i])) : "no entra"}`).join(" · ")}</p>` : "")
      + `<p><b>Ejemplo:</b> ${esc(textoWa(txt[modo], conTurno(l[0], f[0])))}</p>`;
  };
  s.el.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "mt-txt") txt[modo] = t.value;
    if (t.id === "mt-est") { est = t.value; marcados.clear(); return pintarLista(); }
    if (t.id === "mt-cia") { cia = t.value; return pintarLista(); }
    if (t.id === "mt-grado") { grado = t.value; return pintarLista(); }
    if (t.id === "mt-q") { q = t.value.trim().toLowerCase(); return pintarLista(); }
    if (t.id === "mt-pg") porGradoOn = t.checked;
    if (t.dataset.v) t.checked ? marcados.add(t.dataset.v) : marcados.delete(t.dataset.v);
    if (t.dataset.dia) t.checked ? dias.add(Number(t.dataset.dia)) : dias.delete(Number(t.dataset.dia));
    resumen();
  });
  s.el.addEventListener("click", async e => {
    const m = e.target.closest("[data-modo]");
    if (m) { if (modo !== m.dataset.modo) { modo = m.dataset.modo; est = modo === "turnos" ? "peritado" : "reparado"; marcados.clear(); } return pintarLista(); }
    if (e.target.closest("#mt-todos")) { const l = lista(), todos = l.every(v => marcados.has(v.id)); l.forEach(v => todos ? marcados.delete(v.id) : marcados.add(v.id)); return pintarLista(); }
    const chip = e.target.closest("[data-var]");
    if (chip) { const ta = el("#mt-txt"), i = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, i) + chip.dataset.var + ta.value.slice(ta.selectionEnd ?? i); txt[modo] = ta.value; ta.focus(); return resumen(); }
    if (!e.target.closest("#mt-ir")) return;
    const l = elegidos(), f = modo === "turnos" ? fechas(l) : [], plantilla = txt[modo].trim();
    if (!plantilla && modo === "mensaje") return toast("Escribí el mensaje", "error");
    const orden = [...f].sort();
    if (!(await confirmar({ title: modo === "turnos" ? `¿Turnar ${l.length} vehículos?` : `¿Enviar ${l.filter(v => v.telefono).length} mensajes?`,
      message: `${modo === "turnos" ? `Pasan a Turnado del ${fechaLarga(orden[0])} al ${fechaLarga(orden[orden.length - 1])}${plantilla ? " y a cada cliente con teléfono le llega su turno" : " (sin mensaje)"}.` : "Le llega uno a cada cliente."} Sale del número de la empresa, uno cada ${PAUSA_MS / 1000} segundos: dejá esta ventana abierta.`, ok: "Empezar" }))) return;
    enviando = true; cortar = false; resumen();
    const fallas = []; let ok = 0;
    for (let i = 0; i < l.length && !cortar; i++) {
      const v = getVehiculo(l[i].id) || l[i];
      busy(el("#mt-ir"), true, `${i + 1} de ${l.length}…`);
      try {
        if (modo === "turnos") await cambiarEstado(v, "turnado", f[i], { turnoConfirmado: false, horaTurno: "" });
        if (v.telefono && plantilla) {
          await llamarAdmin("enviar-cliente", { cid: S.company.id, vid: v.id, texto: textoWa(plantilla, conTurno(v, f[i])), por: S.profile?.name || "", reparado: modo === "mensaje" });
          if (i < l.length - 1) await new Promise(r => setTimeout(r, PAUSA_MS));
        }
        ok++;
      } catch (err) { fallas.push(`${v.patente || v.modelo || v.id}: ${err.message || mensajeError(err)}`); }
    }
    enviando = false;
    if (!s.el.isConnected) return toast(`Listo: ${ok} de ${l.length}${cortar ? " (se cortó al cerrar)" : ""}`, fallas.length ? "error" : "success");
    busy(el("#mt-ir"), false); marcados.clear(); pintarLista();
    toast(`Listo: ${ok} de ${l.length}`, fallas.length ? "error" : "success");
    if (fallas.length) openSheet({ title: `${fallas.length} con problemas`, body: `<ul class="adm-list">${fallas.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` });
  });
  pintarLista();
}

// Lee la planilla de asegurados (CSV o Excel) → [{ patente, nombre }]
const RE_PAT = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
const normPat = p => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function leerPadron(file) {
  let filas = [];
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = await cargarExcelJS();
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    wb.worksheets[0].eachRow(r => filas.push(r.values.slice(1).map(v => v?.text ?? v?.result ?? v ?? "")));
  } else {
    const txt = await file.text();
    const sep = [";", ",", "\t"].sort((a, b) => txt.split(b).length - txt.split(a).length)[0];
    filas = txt.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, "")));
  }
  // Siempre: primera columna = nombre, segunda columna = patente (la fila de títulos se saltea sola)
  const vistas = new Map();
  for (const f of filas) {
    const nombre = String(f[0] ?? "").trim().replace(/\s+/g, " "), patente = normPat(f[1]);
    if (RE_PAT.test(patente) && nombre) vistas.set(patente, nombre);
  }
  return [...vistas].map(([patente, nombre]) => ({ patente, nombre }));
}
