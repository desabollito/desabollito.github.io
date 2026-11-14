import {
  S, activos, papelera, restaurar, eliminarDefinitivo, soyAdmin, miRol, renombrarEmpresa, guardarSello, guardarMensajesCliente, deshaciblesDe, deshacerCambio, soyDesmontaje,
  agregarMiembro, cambiarRol, quitarMiembro, guardarEtiquetas, resolverSolicitud, desvincularWhatsApp, salirDeEmpresa, eliminarEmpresa, crearEmpresa, elegirEmpresa,
  actualizarPerfil, ponerMiFoto, salir, mensajeError, llamarAdmin, soloDesmontaje, pedirUnion, linksCompartidos, getVehiculo, soloVer, soySacabollos, guardarOrdenOps, cambiarEstado, usaClientes,
  onChange, chatSinLeer, marcarChatVisto, actualizarVehiculo, guardarColor, guardarVehiculo, nuevoIdVehiculo, esPrueba
} from "./data.js";
import { cargarExcelJS } from "./excel.js";
import { db, doc, onSnapshot } from "./firebase.js";
import { colorPeritado, ESTADOS, ESTADO, ROLES, estadoActual, esAnulado, repartirTurnos } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet, confirmar,
  pedirTexto, busy, debounce, avatarUsuario, glideMenu, elegirDescarga, horaDe, formatoWa, avatarCliente
} from "./ui.js";
import { ruidoMotor, SONIDOS_AUTO } from "./sonidos.js";
import { NOVEDADES } from "./novedades.js";
import { imagenChica, avatar, subir, comprimir } from "./media.js";
import { planillaPDF } from "./pdf.js";
import { exportarExcel } from "./excel.js";
import { setTopbar, go, logoOperativo, pintarLateral } from "./shell.js";
import { APP_VERSION, WHATSAPP_BOT, BOT_API } from "./config.js";
import { renderDetalle, textoWa, abrirFiltros, botonFiltros, filtrarCalendario, linkMapa, elegirFechaEstado } from "./views-vehiculos.js";

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
// Los anulados no figuran en el calendario; los filtros son los mismos de Vehículos y la búsqueda es aparte
const delCal = () => filtrarCalendario(activos(), C.q).filter(v => !esAnulado(v));
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
  const foco = document.activeElement?.id === "cal-q";
  setTopbar({ title: "Calendario", sinTitulo: true, back: sel ? "#/calendario" : null, actions: botonFiltros(true) });
  {   // también con un vehículo abierto: la flecha queda a la izquierda del buscador
    // Buscador y filtros en la barra, como en Vehículos (en celular el botón de filtros va dentro del buscador)
    $("#topbar .tb-title").insertAdjacentHTML("afterend", `<label class="search">${icon("search")}<input type="search" id="cal-q" placeholder="Buscar patente, modelo…" value="${esc(C.q || "")}" autocomplete="off"></label>`);
    if (!matchMedia("(min-width: 1100px)").matches) $("#topbar > .search").append($("#tb-filtros"));
    const q = $("#cal-q");
    if (foco) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    q.addEventListener("input", debounce(e => { C.q = e.target.value; vistaCalendario(view, selId); }, 200));
    $("#tb-filtros").addEventListener("click", () => abrirFiltros(() => vistaCalendario(view, selId), true));
  }
  if (C.auto && !S.loadingVehicles) { C.auto = false; elegirDiaAuto(); }
  const iso = d => `${C.y}-${String(C.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const sinConf = v => estadoActual(v) === "turnado" && v.turnoConfirmado !== true;
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
          <span class="vmid">${plate(v.patente, "sm")}${estadoPill(v)}${estadoActual(v) === "turnado" ? `<span class="conf-tag ${v.turnoConfirmado === true ? "ok" : ""}">${v.turnoConfirmado === true ? "Confirmado" : v.turnoConfirmado === "cambio" ? "Pide otra fecha" : "Esperando confirmación"}</span>` : ""}</span>
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

    ${admin ? `<details class="card plegable">
      <summary><span>${icon("chat")}Mensajes al cliente</span>${icon("next")}</summary>
      <form id="msj-cli" class="stack">
        <label class="field"><span>Dirección del taller</span>
          <input name="direccion" maxlength="200" placeholder="Av. P. Zanni 2530, E3100 Paraná, Entre Ríos" value="${esc(c.mensajes?.direccion || "")}"></label>
        <label class="field"><span>Link de Google Maps</span>
          <input name="mapa" type="url" maxlength="300" placeholder="https://maps.app.goo.gl/…" value="${esc(c.mensajes?.mapa || "")}"></label>
        <div class="field"><span>Imagen de la vista previa del link <small class="muted">(la que se ve en WhatsApp${c.mensajes?.mapaN ? ` · chapisteriaomar.com/map${c.mensajes.mapaN}` : ""})</small></span>
          <div class="msj-img"><img id="msj-img-prev" src="${esc(c.mensajes?.mapaImg ? c.mensajes.mapaImg.replace("/upload/", "/upload/c_fill,g_auto,w_600,h_315,q_auto,f_auto/") : "https://chapisteriaomar.com/assets/og-home6.jpg")}" alt="Vista previa del link del taller">
            <span class="row-btns"><label class="btn btn-ghost btn-sm">${icon("image")}Elegir imagen<input type="file" id="msj-img-in" accept="image/*" hidden></label>
            ${c.mensajes?.mapaN ? `<button type="button" class="btn btn-ghost btn-sm" id="msj-act">${icon("rotate")}Actualizar vista previa</button>` : ""}</span></div>
          <small class="muted">La dirección del taller es el título de la vista previa. Después de cambiarla, guardá y tocá «Actualizar vista previa» (tarda 1 o 2 minutos).</small></div>
        <label class="field"><span>Mensaje de turno <small class="muted">(se puede cambiar antes de cada envío en Mensajes y turnos)</small></span>
          <textarea name="turno" rows="12" maxlength="2000">${esc(c.mensajes?.turno || TXT_TURNO)}</textarea></label>
        <label class="toggle"><input type="checkbox" name="encTurno" ${c.mensajes?.encTurno ? "checked" : ""}>
          <span>Después del mensaje de turno, mandar la encuesta</span></label>
        ${campoEncuesta(c, "turno")}
        <label class="field"><span>Si elige otra fecha, se le contesta <small class="muted">(vacío: no se manda nada)</small></span>
          <textarea name="cambioFecha" rows="3" maxlength="1000">${esc(c.mensajes?.cambioFecha ?? CAMBIO_FECHA_DEF)}</textarea></label>
        <div class="field"><span>Encuesta de «Enviar nueva fecha» <small class="muted">(desde el chat, cuando pidió cambiarla)</small></span></div>
        ${campoEncuesta(c, "reprogramar")}
        <label class="field"><span>Mensaje de contactado <small class="muted">(al marcar Contactado y en «Contactar por privado»)</small></span>
          <textarea name="contactado" rows="6" maxlength="2000">${esc(c.mensajes?.contactado || S.config?.mensajeWa || "")}</textarea></label>
        <label class="toggle"><input type="checkbox" name="encRetiro" ${c.mensajes?.encRetiro ? "checked" : ""}>
          <span>Después del mensaje de contactado, mandar la encuesta</span></label>
        ${campoEncuesta(c, "retiro")}
        <p class="muted small">Datos que se completan solos: {Saludo} {Asegurado} {Vehiculo} {Patente} {Operativo} {Turno} {Hora} {Direccion} {Mapa} {Compania}. Un renglón sin dato (por ejemplo, sin hora) no se manda. El link del mapa sale con vista previa.</p>
        <button type="button" class="link-btn" id="msj-def">Volver al mensaje original</button>
        <button class="btn btn-primary">Guardar mensajes</button>
        <div class="field msj-prueba"><span>Probar el chat en vivo</span>
          <small class="muted">Usa el «Vehículo de prueba» (AAA000) con este número: mandale el turno, votá las encuestas y respondé como si fueras el cliente.</small>
          <input name="telPrueba" type="tel" inputmode="numeric" placeholder="2936401097" value="${esc(String(S.profile?.whatsapp || "").replace(/^549/, ""))}">
          <span class="row-btns"><button type="button" class="btn btn-ghost btn-sm" data-prueba="chat">${icon("chat")}Abrir chat</button>
            <button type="button" class="btn btn-ghost btn-sm" data-prueba="ver">${icon("car")}Ver vehículo</button></span></div>
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
  $("#msj-def", view)?.addEventListener("click", () => { $("#msj-cli", view).turno.value = TXT_TURNO; });
  // Probar el chat en vivo con el vehículo de prueba
  $$("[data-prueba]", view).forEach(b => b.addEventListener("click", async () => {
    const tel = String($("#msj-cli", view).telPrueba.value).replace(/[^0-9]/g, "");
    if (!telWa(tel)) return toast("Poné un celular válido (10 dígitos, sin 0 ni 15)", "error");
    try { const v = await vehiculoPrueba(tel); b.dataset.prueba === "chat" ? abrirChatDe(v) : go(`#/v/${v.id}`); }
    catch (err) { toast(mensajeError(err), "error"); }
  }));
  if ($("#msj-cli", view)) $("#msj-cli", view).onsubmit = async e => {
    e.preventDefault(); const f = e.target, mapa = f.mapa.value.trim();
    if (mapa && !/^https:\/\//.test(mapa)) return toast("El link del mapa tiene que empezar con https://", "error");
    const turno = f.turno.value.trim();
    try {
      const encuestas = Object.fromEntries(["turno", "retiro", "reprogramar"].map(k => [k, leerEncuesta(f, k)]));
      if (Object.values(encuestas).some(x => x === false)) return toast("Cada encuesta necesita una pregunta y al menos 2 opciones", "error");
      await guardarMensajesCliente({ direccion: f.direccion.value.trim(), mapa, turno: turno === TXT_TURNO ? "" : turno, contactado: f.contactado.value.trim(), cambioFecha: f.cambioFecha.value.trim(), encTurno: f.encTurno.checked, encRetiro: f.encRetiro.checked,
        encuestas, mapaN: S.company?.mensajes?.mapaN || null, mapaImg });   // el número lo pone el bot: se lee del operativo al momento de guardar
      // Con link de Maps: el bot le da al operativo su link corto (chapisteriaomar.com/mapN), con la vista previa linda
      if (mapa && !S.company?.mensajes?.mapaN) { const j = await llamarBot("mapa-numero", { cid: c.id }); if (!j.ok) toast(j.error || "No se pudo crear el link corto", "error"); }
      toast("Mensajes guardados", "success");
    }
    catch (err) { toast(mensajeError(err), "error"); }
  };
  // Actualizar vista previa: el bot corre en GitHub el armado de chapisteriaomar.com/mapN con la dirección guardada
  $("#msj-act", view)?.addEventListener("click", async e => {
    const b = e.currentTarget; busy(b, true, "Pidiendo…");
    const j = await llamarBot("mapas-actualizar", { cid: c.id });
    busy(b, false);
    toast(j.ok ? "Actualizando: en 1 o 2 minutos la vista previa queda nueva" : j.error || "No se pudo actualizar", j.ok ? "success" : "error");
  });
  // Imagen de la vista previa: se sube ya y se guarda con "Guardar mensajes"
  let mapaImg = c.mensajes?.mapaImg || "";
  $("#msj-img-in", view)?.addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    toast("Subiendo imagen…");
    try { mapaImg = (await subir(await comprimir(file, 1600, 0.85), "mapas")).url;
      $("#msj-img-prev", view).src = mapaImg.replace("/upload/", "/upload/c_fill,g_auto,w_600,h_315,q_auto,f_auto/"); toast("Imagen lista: tocá «Guardar mensajes»", "success"); }
    catch (err) { toast(err.message || "No se pudo subir la imagen", "error"); }
  });
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
  // Lista de operativos; arriba la ruedita para gestionar el actual (donde iba la X), abajo el + para unirse o crear uno y, en celular, Ajustes
  const s = openSheet({
    title: "Tus operativos",
    body: `<ul class="company-list">${[...S.companies].sort((a, b) => (b.id === S.company?.id) - (a.id === S.company?.id)).map(c => `
      <li><button class="company-opt ${c.id === S.company?.id ? "on" : ""}" data-id="${c.id}">
        ${logoOperativo("", c.name)}
        <span><strong>${esc(c.name)}</strong><small>${ROLES[c.roles?.[S.user.uid]]?.label || ""} · ${c.members.length} ${c.members.length === 1 ? "persona" : "personas"}</small></span>
        ${c.id === S.company?.id ? icon("check") : ""}</button></li>`).join("")}</ul>
      <button type="button" class="op-nuevo" id="op-nuevo" aria-label="Unirme o crear un operativo">${icon("plus")}</button>
      <div class="op-elegir" id="op-elegir" hidden>
        <button type="button" class="btn btn-ghost" id="unir-op">Unirme a un operativo existente</button>
        ${soloDesmontaje() ? "" : `<button type="button" class="btn btn-ghost" id="nuevo-op">Crear nuevo operativo</button>`}
      </div>
      <div class="op-menu only-mobile">
        <a class="op-mas op-ajustes" href="#/ajustes" data-close>${icon("user")}<span><strong>Mis ajustes</strong></span>${icon("next")}</a>
      </div>`
  });
  const x = $(".sheet-head [data-close]", s.el);
  if (S.company && x) x.outerHTML = `<a class="icon-btn" href="#/operativo" data-close aria-label="Gestionar ${esc(S.company.name)}" title="Gestionar ${esc(S.company.name)}">${icon("settings")}</a>`;
  ordenable($(".company-list", s.el), ids => guardarOrdenOps(ids).then(() => toast("Orden guardado", "success")).catch(err => toast(mensajeError(err), "error")));
  s.body.addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (b) { elegirEmpresa(b.dataset.id); s.close(); go("#/"); }
    if (e.target.closest("#op-nuevo")) { const o = $("#op-elegir", s.el); o.hidden = !o.hidden; $("#op-nuevo", s.el).classList.toggle("abierto", !o.hidden); }
    if (e.target.closest("#nuevo-op")) { s.close(); crearOperativo(); }
    if (e.target.closest("#unir-op")) { s.close(); unirOperativo(); }
  });
}

// ═════════════════════════════════════════════════════════════
//  AJUSTES
// ═════════════════════════════════════════════════════════════
// Color de la app: vacío = el de siempre. Lo pinta window.pintarColor (index.html), así también la intro sale de ese color
const COLORES = ["#ff8a3d", "#e5484d", "#d9559b", "#9b7bf2", "#4f8ff7", "#0ea5a4", "#22b07d", "#84cc16", "#e0a526", "#8d8d96"];
function elegirColor(alTerminar) {
  const actual = (() => { try { return localStorage.getItem("color") || ""; } catch { return ""; } })();
  const s = openSheet({ title: "Color de la app", body: `<div class="color-grid">
      <button type="button" class="color-op ${actual ? "" : "on"}" data-c="" aria-label="Predeterminado"><i class="color-def"></i><small>Predeterminado</small></button>
      ${COLORES.map(c => `<button type="button" class="color-op ${actual === c ? "on" : ""}" data-c="${c}" aria-label="Color ${c}"><i style="background:${c}"></i></button>`).join("")}
      <button type="button" class="color-op ${actual && !COLORES.includes(actual) ? "on" : ""}" id="color-otro" aria-label="Otro color"><i class="color-rueda"></i></button>
    </div>
    <div class="rueda-caja" id="rueda" hidden><canvas width="440" height="440" aria-label="Rueda de color"></canvas>
      <div class="rueda-pie"><i class="rueda-prev"></i><input class="rueda-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Color en hex">
        <button type="button" class="btn btn-primary btn-sm" id="rueda-ok">Usar</button></div></div>` });
  const poner = c => {
    try { c ? localStorage.setItem("color", c) : localStorage.removeItem("color"); } catch { /* sin almacenamiento */ }
    window.pintarColor?.(c); colorPeritado(c); guardarColor(c); document.dispatchEvent(new Event("color-app")); alTerminar?.();
  };
  s.body.addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (b) { poner(b.dataset.c); s.close(); } });
  // Rueda propia (tono alrededor, intensidad hacia el centro) con el código hex al lado
  const caja = $("#rueda", s.el), cv = $("canvas", caja), cx = cv.getContext("2d"), R = cv.width / 2, hex = $(".rueda-hex", caja), prev = $(".rueda-prev", caja);
  const img = cx.createImageData(cv.width, cv.height);
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const dx = x - R, dy = y - R, d = Math.hypot(dx, dy) / R, i = (y * cv.width + x) * 4; if (d > 1) continue;
    const [r, g, b] = hsv((Math.atan2(dy, dx) / Math.PI * 180 + 360) % 360, d);
    img.data.set([r, g, b, 255], i);
  }
  cx.putImageData(img, 0, 0);
  const elegir = c => { hex.value = c; prev.style.background = c; };
  elegir(actual || "#4f8ff7");
  $("#color-otro", s.el).onclick = () => { caja.hidden = !caja.hidden; };
  const tocar = e => { const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * cv.width - R, y = (e.clientY - b.top) / b.height * cv.height - R;
    const d = Math.min(1, Math.hypot(x, y) / R); elegir(aHex(hsv((Math.atan2(y, x) / Math.PI * 180 + 360) % 360, d))); };
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); tocar(e); });
  cv.addEventListener("pointermove", e => { if (e.buttons) tocar(e); });
  hex.addEventListener("input", () => { if (/^#?[0-9a-f]{6}$/i.test(hex.value)) prev.style.background = "#" + hex.value.replace("#", ""); });
  $("#rueda-ok", s.el).onclick = () => { const v = "#" + hex.value.replace("#", "").toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) return toast("Color no válido", "error"); poner(v); s.close(); };
}
// Tono (0-360) e intensidad (0-1) a RGB, con brillo al máximo
function hsv(h, sat) {
  const f = n => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}
const aHex = rgb => "#" + rgb.map(x => x.toString(16).padStart(2, "0")).join("");
{ console.assert(aHex(hsv(0, 1)) === "#ff0000" && aHex(hsv(120, 1)) === "#00ff00" && aHex(hsv(0, 0)) === "#ffffff", "rueda de color"); }

export function aplicarTema(t) {
  localStorage.setItem("tema", t);
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
}

export function vistaAjustes(view) {
  setTopbar({ title: "Mis ajustes", back: "#/" });
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
      ${usaClientes() && S.company ? (S.config?.mensajesTurnos !== false ? fila("mt-abrir", "calendar", "Mensajes y turnos") : "") : ""}
    </div></section>

    <section class="aj-grupo"><h3>Apariencia</h3><div class="aj-lista">
      <div class="aj-item aj-ctrl">${icon("image")}<span class="aj-txt">Tema</span>
        <div class="seg seg-sm" id="tema"><button class="seg-btn ${oscuro ? "" : "on"}" data-t="light">Claro</button><button class="seg-btn ${oscuro ? "on" : ""}" data-t="dark">Oscuro</button></div>
        <button type="button" class="color-btn" id="color-app" aria-label="Color de la app" title="Color de la app"><i class="color-rueda"></i></button></div>
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
  $("#color-app", view).onclick = () => elegirColor();
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
    <form class="stack cp-form" id="cp-form"><label class="field"><span>Compañía</span><input name="cia" list="cp-cias" required placeholder="Ej: SMG" autocomplete="off"></label>
      <datalist id="cp-cias">${cias.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <button class="btn btn-primary btn-block" type="submit">${icon("share")}Crear link</button></form>
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
      <div class="perfil-foto">${avatarUsuario(p.username, p.name, "lg", p.foto)}
        <div class="perfil-foto-btns">
          <button type="button" class="icon-btn" id="foto-subir" aria-label="Agregar foto" title="Agregar foto">${icon("camera")}</button>
          ${p.foto ? `<button type="button" class="icon-btn danger" id="foto-borrar" aria-label="Eliminar foto" title="Eliminar foto">${icon("trash")}</button>` : ""}
        </div></div>
      <label class="field"><span>Nombre</span>
        <input name="nombre" value="${esc(p.name)}" required autocomplete="name"></label>
      ${p.whatsapp ? `<button type="button" class="btn btn-danger-ghost btn-block" id="wa-desv">${icon("chat")}Desvincular WhatsApp</button>` : ""}
      <button class="btn btn-primary btn-block btn-lg">Guardar cambios</button>
    </form>`
  });
  const listo = msg => { toast(msg, "success"); s.close(); alTerminar?.(); pintarLateral(); };
  const deWhatsApp = async () => {
    toast("Buscando tu foto de WhatsApp…");
    const j = await llamarBot("foto-wa");
    if (!j.ok) return toast(j.error || "No se pudo", "warning");
    S.profile.foto = j.foto; listo("Foto actualizada");
  };
  // La cámara pregunta de dónde: galería o la foto de WhatsApp (si está vinculado)
  $("#foto-subir", s.el).addEventListener("click", e => {
    if (p.whatsapp) return glideMenu(e.currentTarget, [["galeria", "Elegir de la galería"], ["wa", "Usar mi foto de WhatsApp"]], "", k => k === "wa" ? deWhatsApp() : galeria());
    galeria();
  });
  const galeria = () => {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      toast("Subiendo foto…");
      try { const r = await subir(await comprimir(file, 480, 0.85), "perfiles"); await ponerMiFoto(r.url); listo("Foto actualizada"); }
      catch (err) { toast(err.message || mensajeError(err), "error"); }
    };
    inp.click();
  };
  $("#foto-borrar", s.el)?.addEventListener("click", async () => {
    if (!(await confirmar({ title: "¿Eliminar tu foto?", ok: "Eliminar", danger: true }))) return;
    ponerMiFoto("").then(() => listo("Foto eliminada")).catch(e => toast(mensajeError(e), "error"));
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
    ${items.length ? `    <ul class="trash">${items.map(v => `
      <li><span class="t-meta"><strong>${esc(v.modelo || "Sin modelo")}</strong>
        <span>${plate(v.patente, "sm")}</span></span>
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
        <label class="toggle"><input type="checkbox" data-config="mensajesTurnos" ${datos.config?.mensajesTurnos !== false ? "checked" : ""}>
          <span>Botón «Mensajes y turnos»</span></label>
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
          <button type="button" class="btn btn-ghost btn-sm" id="adm-cli-cod">Con código</button>
          <button type="button" class="btn btn-ghost btn-sm danger" id="adm-chats-reset">${icon("rotate")}Reiniciar chats</button>
          ${datos.config?.mensajesTurnos !== false ? `<button type="button" class="btn btn-primary btn-sm" id="adm-masivo">${icon("chat")}Mensajes y turnos</button>` : ""}</span>
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
          <button type="button" class="icon-btn sm" data-foto-u="${esc(u.uid)}" ${u.foto ? "data-tiene" : ""} aria-haspopup="listbox" aria-label="Foto de ${esc(u.name || u.username)}" title="${u.fotoManual ? "Cambiar la foto (puesta a mano)" : "Poner una foto a mano"}">${icon("camera")}</button>
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
      if (clave === "mensajesTurnos") pintar();   // muestra u oculta el botón de acá arriba
      toast(`${{ documentos: "Documentos", fechaVista: "Elegir fecha", etapasPdf: "Estado en los PDF", planillaVeh: "Planilla de vehículos", mensajesTurnos: "Mensajes y turnos" }[clave] || "Aviso al cliente"} ${on ? "activado" : "desactivado"}`, "success");
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
      if (!detalle.length) return toast("No hay usuarios con WhatsApp vinculado (o todos tienen una foto puesta a mano)");
      cargar();
      return openSheet({ title: `Fotos: ${detalle.filter(d => d.foto).length} de ${detalle.length}`, body: `<ul class="adm-list">${detalle.map(d =>
        `<li><div><strong>@${esc(d.usuario)}</strong><small class="${d.foto ? "" : "muted"}">${d.foto ? "✓ " : ""}${esc(d.motivo)}</small></div></li>`).join("")}</ul>` });
    }
    const cli = e.target.closest("#adm-cli, #adm-cli-salir, #adm-cli-cod");
    if (cli) {   // estado del número de la empresa; sin conectar, muestra el QR o un código (WhatsApp → Dispositivos vinculados)
      const salir = cli.id === "adm-cli-salir";
      if (salir && !(await confirmar({ title: "¿Desvincular el número de la empresa?", message: "Dejan de salir los avisos y mensajes a clientes hasta que vuelvas a escanear el QR.", ok: "Desvincular" }))) return;
      const numero = cli.id === "adm-cli-cod" ? await pedirTexto({ title: "Vincular con código", label: "Número de la empresa, con código de país", placeholder: "5493515551234", ok: "Pedir código" }) : "";
      if (numero === null) return;
      busy(cli, true, "…");
      try {
        const r = await llamarAdmin("clientes-qr", { salir, numero });
        $("#adm-cli-est", caja).textContent = r.estado === "open" ? "✓ Conectado" : r.codigo ? "En WhatsApp → Dispositivos vinculados → Vincular → Vincular con número de teléfono, poné este código y tocá Conectar de nuevo."
          : r.qr ? "Escaneá el QR desde WhatsApp → Dispositivos vinculados y tocá Conectar de nuevo." : `Estado: ${r.estado}. Tocá Conectar de nuevo.`;
        $("#adm-cli-qr", caja).innerHTML = r.estado === "open" ? `<button type="button" class="btn btn-ghost btn-sm danger" id="adm-cli-salir">Desvincular número</button>`
          : r.codigo ? `<b style="font-size:1.6rem;letter-spacing:.15em;user-select:all">${esc(r.codigo)}</b>`
          : r.qr ? `<img src="${esc(r.qr)}" alt="QR para vincular el número de la empresa" style="width:240px;max-width:100%;background:#fff;border-radius:var(--r);padding:8px">` : "";
      } catch (err) { toast(err.message, "error"); }
      if (cli.isConnected) busy(cli, false);
      return;
    }
    if (e.target.closest("#adm-masivo")) return mensajesYTurnos();
    const rc = e.target.closest("#adm-chats-reset");
    if (rc) {   // borra los chats en vivo de todos los operativos (en WhatsApp quedan)
      if (!(await confirmar({ title: "¿Reiniciar todos los chats?", message: "Se borran todos los chats en vivo de la app, de todos los operativos. En WhatsApp los mensajes quedan. No se puede deshacer.", ok: "Borrar chats", danger: true, centro: true }))) return;
      busy(rc, true, "Borrando…");
      try { const r = await llamarAdmin("reiniciar-chats"); toast(`Chats reiniciados (${r.borrados})`, "success"); }
      catch (err) { toast(err.message || mensajeError(err), "error"); }
      if (rc.isConnected) busy(rc, false);
      return;
    }
    const fu = e.target.closest("[data-foto-u]");
    if (fu) {   // foto de un usuario: poner una a mano (se elige, se achica y se sube) o sacarla
      const tiene = fu.hasAttribute("data-tiene");
      return glideMenu(fu, [["poner", tiene ? "Cambiar foto" : "Agregar foto"], ...(tiene ? [["sacar", "Eliminar foto"]] : [])], null, async k => {
        if (k === "sacar") {
          if (!(await confirmar({ title: "¿Eliminar la foto?", message: "Queda con la inicial. La de WhatsApp no vuelve sola: solo si la persona la pide desde sus Ajustes o si tocás «Traer fotos».", ok: "Eliminar", danger: true, centro: true }))) return;
          try { await llamarAdmin("foto-usuario", { uid: fu.dataset.fotoU, url: "" }); toast("Foto eliminada", "success"); cargar(); }
          catch (err) { toast(err.message || mensajeError(err), "error"); }
          return;
        }
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
        inp.click();
      });
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
// Encuestas al cliente: las de siempre; si el operativo no las cambia, el bot arma la pregunta con la fecha y la hora que haya
const ENC_DEF = { turno: { pregunta: "¿Confirmás el turno del {Fecha} para tu {Vehiculo}?", opciones: ["Confirmo el turno", "Quiero cambiar la fecha"] },
  retiro: { pregunta: "Tu {Vehiculo} ya está listo. ¿Cuándo lo retirás?", opciones: ["Retiro hoy", "Retiro mañana"] },
  reprogramar: { pregunta: "¿Reprogramamos el turno al {Fecha}?", opciones: ["Confirmo el turno", "Quiero cambiar la fecha"] } };
// Lo que se le contesta al cliente cuando vota la segunda opción (igual que en el bot)
const CAMBIO_FECHA_DEF = "¿A qué fecha querés returnar?\n> Responderán del taller a la brevedad.";
// Vehículo de prueba del operativo (para probar el chat en vivo con el número de uno): se crea la primera vez
async function vehiculoPrueba(tel) {
  const v = S.vehicles.find(x => !x.deleted && esPrueba(x));
  if (v) { if (v.telefono !== tel) await actualizarVehiculo(v.id, { telefono: tel }, "Cambió el teléfono de prueba"); return getVehiculo(v.id) || { ...v, telefono: tel }; }
  const id = nuevoIdVehiculo(), datos = { patente: "AAA000", modelo: "Vehículo de prueba", asegurado: S.profile?.name || "Prueba", telefono: tel };
  await guardarVehiculo(id, datos, true);
  return getVehiculo(id) || { id, ...datos };
}
const campoEncuesta = (c, k) => { const e = c.mensajes?.encuestas?.[k] || ENC_DEF[k];
  return `<div class="msj-enc"><label class="field"><span>Pregunta <small class="muted">({Fecha} {Hora} {Vehiculo} {Patente})</small></span>
      <input name="enc-${k}-p" maxlength="255" value="${esc(e.pregunta)}"></label>
    <label class="field"><span>Opciones <small class="muted">(una por renglón, de 2 a 12${k !== "retiro" ? "; la primera confirma el turno y la segunda pide otra fecha" : ""})</small></span>
      <textarea name="enc-${k}-o" rows="3" maxlength="1300">${esc(e.opciones.join("\n"))}</textarea></label></div>`; };
// null = la de siempre; false = incompleta
const leerEncuesta = (f, k) => {
  const pregunta = f[`enc-${k}-p`].value.trim(), opciones = f[`enc-${k}-o`].value.split("\n").map(x => x.trim().slice(0, 100)).filter(Boolean).slice(0, 12);
  if (!pregunta || opciones.length < 2) return false;
  return pregunta === ENC_DEF[k].pregunta && opciones.join("|") === ENC_DEF[k].opciones.join("|") ? null : { pregunta, opciones };
};
// Mensaje de turno por defecto; cada operativo puede tener el suyo (Operativo → Mensajes al cliente). Los renglones sin dato se sacan solos.
const TXT_TURNO = `🚗 *TURNO DE REPARACIÓN POR GRANIZO*

{Saludo} {Asegurado}! Te escribimos por tu *{Vehiculo}* patente *{Patente}*.

📅 *Día:* {Turno}
⏰ *Hora:* {Hora}

🗺️ *Ubicación:* {Mapa}

🚘 Te pedimos que traigas el vehículo *limpio* y en condiciones para hacer la reparación.

⏱️ La reparación demora aproximadamente *48 a 72 horas*, según los trabajos que necesite.

📲 Por favor, *confirmá* que recibiste este mensaje.

⚠️ Si necesitás reprogramar el turno, avisanos con anticipación así reorganizamos los turnos.

¡Muchas gracias! 😊
_CHAPISTERÍA OMAR SOLUTIONS_`;
const plantillaTurno = () => S.company?.mensajes?.turno || TXT_TURNO;
const PAUSA_MS = 6000;
const DIAS_SEM = [[1, "Lu"], [2, "Ma"], [3, "Mi"], [4, "Ju"], [5, "Vi"], [6, "Sá"], [0, "Do"]];
const GRADOS_T = [[1, "Grado 1"], [2, "Grado 2"], [3, "Grado 3"], [4, "Grado +"], [0, "Sin grado"]];
function mensajesYTurnos() {
  let est = "peritado", q = "", cia = "", grado = "", porGradoOn = false, sinLugar = 0, cortar = false, enviando = false;
  const marcados = new Set(), dias = new Set([1, 2, 3, 4, 5]);
  let txt = plantillaTurno();
  const cupoG = { 1: 3, 2: 2, 3: 1, 4: 0, 0: 0 };
  const manana = new Date(Date.now() + 864e5).toLocaleDateString("en-CA");
  const ciaDe = v => String(v.compania || "").trim() || "Sin compañía";
  const s = openSheet({ title: `Mensajes y turnos · ${S.company?.name || ""}`, wide: true, onClose: () => { cortar = true; }, body: `<div class="mt2">
    <section class="mt-paso"><h3><b>1</b>Vehículos <small id="mt-n"></small></h3>
      <div class="mt-filtros">
        <label class="search mt-buscar">${icon("search")}<input type="search" id="mt-q" placeholder="Patente, asegurado, modelo…" autocomplete="off"></label>
        <label class="field"><span>Estado</span><select id="mt-est">${ESTADOS.map(e => `<option value="${e.key}">${e.label}</option>`).join("")}</select></label>
        <label class="field"><span>Compañía</span><select id="mt-cia"></select></label>
        <label class="field"><span>Grado</span><select id="mt-grado"><option value="">Todos</option>${GRADOS_T.map(([g, t]) => `<option value="${g}">${t}</option>`).join("")}</select></label>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="mt-todos">${icon("check")}Marcar todos</button>
      <ul class="mt-lista" id="mt-lista"></ul>
    </section>
    <section class="mt-paso" id="mt-turnos"><h3><b>2</b>Turnos</h3>
      <div class="grid-2 mt-fechas">
        <label class="field"><span>Desde</span><input type="date" id="mt-desde" value="${manana}"></label>
        <label class="field"><span>Hasta <small class="muted">(opcional)</small></span><input type="date" id="mt-hasta"></label>
      </div>
      <div class="mt-dias" role="group" aria-label="Días">${DIAS_SEM.map(([d, t]) => `<label class="mt-pill"><input type="checkbox" data-dia="${d}" ${dias.has(d) ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <label class="mt-pill mt-ancho"><input type="checkbox" id="mt-pg"><span>Intercalar grados por día</span></label>
      <label class="field" id="mt-pordia-f"><span>Autos por día <small class="muted">(contando los turnos que ya hay)</small></span><input type="number" id="mt-pordia" min="1" max="200" value="5" inputmode="numeric"></label>
      <div class="mt-cupos" id="mt-pg-f" hidden>${GRADOS_T.map(([g, t]) => `<label class="field"><span>${t}</span><input type="number" min="0" max="50" value="${cupoG[g]}" data-cupo="${g}" inputmode="numeric"></label>`).join("")}</div>
      <label class="mt-pill mt-ancho" id="mt-extra-f" hidden><input type="checkbox" id="mt-extra"><span>Repartir los que no entran (sobreturno)</span></label>
    </section>
    <section class="mt-paso"><h3><b>3</b>Mensaje</h3>
      <textarea id="mt-txt" rows="4" class="mt-txt"></textarea>
      <div class="mt-vars">${["Saludo", "Asegurado", "Vehiculo", "Patente", "Operativo", "Turno", "Hora", "Direccion", "Mapa", "Compania", "Grado", "Precio"].map(x => `<button type="button" class="chip-var" data-var="{${x}}">${x}</button>`).join("")}</div>
      <div id="mt-prev" class="mt-prev"></div>
    </section>
    <div class="mt-pie"><button type="button" class="btn btn-primary btn-lg" id="mt-ir"></button></div>
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
    const op = { desde: el("#mt-desde").value, hasta: el("#mt-hasta").value, porDia: Number(el("#mt-pordia").value),
      porGrado: porGradoOn ? Object.fromEntries($$("[data-cupo]", s.el).map(i => [i.dataset.cupo, Number(i.value) || 0])) : null, dias: [...dias], ocupados };
    const g = l.map(v => v.grado || 0), r = repartirTurnos(g, op);
    sinLugar = r.filter(x => !x).length;
    return sinLugar && el("#mt-extra").checked ? repartirTurnos(g, { ...op, sobreturno: true }) : r;
  };
  const conTurno = (v, f) => f ? { ...v, fechas: { ...v.fechas, turnado: f }, horaTurno: "" } : v;
  const pintarLista = () => {
    const cias = [...new Set(delEstado().map(ciaDe))].sort();
    if (cia && !cias.includes(cia)) cia = "";
    el("#mt-est").value = est;
    el("#mt-cia").innerHTML = `<option value="">Todas</option>` + cias.map(c => `<option ${c === cia ? "selected" : ""}>${esc(c)}</option>`).join("");
    el("#mt-lista").innerHTML = lista().map(v => `<li><label class="mt-veh"><input type="checkbox" data-v="${esc(v.id)}" ${marcados.has(v.id) ? "checked" : ""}><i class="mt-chk">${icon("check")}</i>
      <span class="mt-veh-txt"><span>${plate(v.patente, "sm")}<strong>${esc(v.asegurado || v.modelo || "")}</strong></span>
      <small class="muted">${v.grado ? `G${v.grado === 4 ? "+" : v.grado} · ` : ""}${esc(fechaCorta(v.fechas?.peritado) || "")} · ${v.telefono ? esc(v.telefono) : "sin teléfono"}</small></span></label></li>`).join("")
      || `<li class="muted small">No hay vehículos con ese filtro.</li>`;
    resumen();
  };
  const resumen = () => {
    const l = elegidos(), f = fechas(l), faltan = f.filter(x => !x).length;
    el("#mt-extra-f").hidden = !sinLugar;
    el("#mt-pordia-f").hidden = porGradoOn; el("#mt-pg-f").hidden = !porGradoOn;
    if (el("#mt-txt").value !== txt) el("#mt-txt").value = txt;
    el("#mt-n").textContent = `${l.length} de ${lista().length}`;
    el("#mt-ir").textContent = `Turnar ${l.length - faltan} y avisar`;
    el("#mt-ir").disabled = enviando || !l.length || faltan === l.length;
    el("#mt-prev").innerHTML = !l.length ? "" : (sinLugar ? `<p style="color:var(--danger)">⚠️ No entran ${sinLugar} antes de la fecha límite: ${faltan ? "quedan sin turnar. Abajo de los días podés repartirlos como sobreturno." : "se reparten como sobreturno en los días con menos autos."}</p>` : "")
      + `<ul class="mt-agenda">${l.map((v, i) => `<li>${plate(v.patente, "sm")}<span>${f[i] ? esc(fechaLarga(f[i])) : "no entra"}</span></li>`).join("")}</ul>`
      + `<div class="mt-burbuja"><small>Así le llega a ${esc(l[0].asegurado || l[0].patente || "")}</small>${esc(textoWa(txt, conTurno(l[0], f[0])))}</div>`;
  };
  s.el.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "mt-txt") txt = t.value;
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
    if (e.target.closest("#mt-todos")) { const l = lista(), todos = l.every(v => marcados.has(v.id)); l.forEach(v => todos ? marcados.delete(v.id) : marcados.add(v.id)); return pintarLista(); }
    const chip = e.target.closest("[data-var]");
    if (chip) { const ta = el("#mt-txt"), i = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, i) + chip.dataset.var + ta.value.slice(ta.selectionEnd ?? i); txt = ta.value; ta.focus(); return resumen(); }
    if (!e.target.closest("#mt-ir")) return;
    const todos = elegidos(), fs = fechas(todos), afuera = fs.filter(x => !x).length;
    const l = todos.filter((v, i) => fs[i]), f = fs.filter(Boolean), plantilla = txt.trim();   // los que no entran quedan sin turnar
    const orden = [...f].sort(), aviso = afuera ? ` ⚠️ ${afuera} no entran antes de la fecha límite y quedan sin turnar.` : "";
    if (!(await confirmar({ title: `¿Turnar ${l.length} vehículos?`,
      message: `Pasan a Turnado del ${fechaLarga(orden[0])} al ${fechaLarga(orden[orden.length - 1])}${plantilla ? " y a cada cliente con teléfono le llega su turno" : " (sin mensaje)"}.${aviso} Sale del número de la empresa, uno cada ${PAUSA_MS / 1000} segundos: dejá esta ventana abierta.`, ok: "Empezar" }))) return;
    enviando = true; cortar = false; resumen();
    const fallas = []; let ok = 0;
    for (let i = 0; i < l.length && !cortar; i++) {
      const v = getVehiculo(l[i].id) || l[i];
      busy(el("#mt-ir"), true, `${i + 1} de ${l.length}…`);
      try {
        await cambiarEstado(v, "turnado", f[i], { turnoConfirmado: false, horaTurno: "" });
        if (v.telefono && plantilla) {
          await llamarAdmin("enviar-cliente", { cid: S.company.id, vid: v.id, texto: textoWa(plantilla, conTurno(v, f[i])), por: S.profile?.name || "", encuesta: "turno", fecha: f[i] });
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

// ═════════════════════════════════════════════════════════════
//  CHATS CON CLIENTES: lo que se le mandó desde el número de la empresa y lo que respondieron (lo guarda el bot)
//  Lo no leído se recuerda en este equipo (chatVisto:{cid}:{tel} = hora del último mensaje visto)
// ═════════════════════════════════════════════════════════════
const horaChat = t => { const d = new Date(t), hoy = new Date().toDateString() === d.toDateString();
  return hoy ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }); };

export const abrirChatTel = tel => S.company && abrirChat(S.company.id, tel);

// Teléfono del vehículo → número de WhatsApp (549 + área + número), igual que telefonoAR del bot
export function telWa(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3); else if (d.startsWith("54")) d = d.slice(2);
  d = d.replace(/^0/, "");
  if (d.length === 12) for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === "15") { d = d.slice(0, a) + d.slice(a + 2); break; }
  if (d.length === 8) d = "11" + d;
  return d.length === 10 ? "549" + d : null;
}
console.assert(telWa("351 15 123-4567") === "5493511234567" && telWa("11 3770 9755") === "5491137709755" && telWa("123") === null, "telWa");
// Chat en vivo desde un vehículo (Contactar)
export function abrirChatDe(v) {
  const tel = telWa(v.telefono);
  if (!tel) return toast("El teléfono no parece un celular válido", "error");
  abrirChat(S.company.id, tel, null, v);
}
// Nueva fecha pedida por el cliente: solo la encuesta «¿Reprogramamos el turno al …?», sin repetir el mensaje
export async function reprogramarTurnoChat(v, fecha) {
  const j = await llamarBot("responder-cliente", { cid: S.company.id, tel: telWa(v.telefono), vid: v.id, por: S.profile?.name || "", tipo: "encuesta", encuesta: "reprogramar", fecha });
  if (!j.ok) throw new Error(j.error || "No se pudo enviar la encuesta");
}
// Avisar el turno por el chat en vivo (el mismo mensaje de Mensajes y turnos)
export function avisarTurnoChat(v, fecha) {
  const texto = textoWa(plantillaTurno(), { ...v, fechas: { ...v.fechas, turnado: fecha }, horaTurno: "" });
  return llamarAdmin("enviar-cliente", { cid: S.company.id, vid: v.id, texto, por: S.profile?.name || "", encuesta: "turno", fecha });
}

function abrirChat(cid, tel, alCerrar, v = null) {
  let c = null, enviando = false, verPap = false;
  const s = openSheet({ title: "Chat", onClose: () => { pararGrab(false); unsub(); offV(); alCerrar?.(); }, body: `<div class="chat">
      <div class="chat-msgs" id="chat-msgs"><div class="skeleton" style="height:60px"></div></div>
      <div class="chat-turno" id="chat-turno"></div>
      <div class="chat-resp" id="chat-resp" hidden><span></span><button type="button" class="icon-btn" id="chat-resp-x" aria-label="No responder a ese mensaje">${icon("x")}</button></div>
      <form class="chat-form" id="chat-form">
        <button class="icon-btn chat-mas" type="button" id="chat-mas" aria-label="Mandar foto, ubicación o encuesta" aria-haspopup="listbox">${icon("plus")}</button>
        <input type="file" id="chat-foto" accept="image/*,video/*" multiple hidden><input type="file" id="chat-doc" multiple hidden>
        <textarea name="txt" rows="1" placeholder="Escribí una respuesta…" maxlength="2000"></textarea>
        <span class="chat-grab" id="chat-grab" hidden>● Grabando <b>0:00</b></span>
        <button class="icon-btn chat-cancelar" type="button" id="chat-cancelar" aria-label="Descartar audio" hidden>${icon("trash")}</button>
        <button class="btn btn-ghost chat-enviar chat-mic" type="button" id="chat-mic" aria-label="Grabar audio">${icon("mic")}</button>
        <button class="btn btn-primary chat-enviar" type="submit" aria-label="Enviar">${icon("next")}</button></form></div>` });
  s.el.classList.add("sheet-centro");   // en el celular, al medio (no desde abajo)
  // En lugar de la X: la papelera de mensajes borrados (se cierra tocando afuera)
  $(".sheet-head [data-close]", s.el)?.replaceWith(Object.assign(document.createElement("template"), { innerHTML:
    `<button type="button" class="icon-btn chat-pap-btn" id="chat-pap" aria-label="Mensajes borrados" aria-pressed="false">${icon("trash")}</button>` }).content);
  const caja = $("#chat-msgs", s.el), form = $("#chat-form", s.el), ta = form.txt;
  const pintar = () => {
    if (!c) return;
    $(".sheet-head h2", s.el).innerHTML = `<span class="chat-cab">${avatarCliente(c)}<span class="chat-cab-nom">${esc(c.nombre || c.modelo || "Cliente")}</span>${plate(c.patente, "sm")}</span>`;
    const pb = $("#chat-pap", s.el);
    pb.classList.toggle("on", verPap); pb.setAttribute("aria-pressed", verPap);
    form.hidden = verPap;
    if (verPap) {   // papelera: los borrados, cada uno con Restaurar
      caja.innerHTML = `<p class="muted small center">Mensajes borrados en la app (en WhatsApp siguen estando).</p>` + ((c.papelera || []).slice().sort((a, b) => a.t - b.t).map(m => `<div class="chat-msg ${m.yo ? "yo" : ""} borrado">${formatoWa(m.txt)}
        <small>${m.yo && m.por ? esc(m.por) + " · " : ""}${horaChat(m.t)}</small><button type="button" class="link-btn small" data-restaurar="${m.t}">${icon("restore")}Restaurar</button></div>`).join("") || `<p class="muted small center">No hay mensajes borrados.</p>`);
      $("#chat-turno", s.el).innerHTML = "";
      return;
    }
    const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 40;
    const media = m => m.foto ? `<a class="chat-foto" href="${esc(m.foto)}" target="_blank" rel="noopener"><img src="${esc(m.foto.replace("/upload/", "/upload/c_limit,w_480,q_auto,f_auto/"))}" alt="Foto" loading="lazy"></a>${formatoWa(String(m.txt || "").replace(/^📷 Foto:? ?/, ""))}`
      : m.audio ? `<audio controls preload="none" src="${esc(m.audio)}"></audio>`
      : m.video ? `<video class="chat-video" controls preload="metadata" playsinline src="${esc(m.video)}"></video>${formatoWa(String(m.txt || "").replace(/^🎥 Video:? ?/, ""))}`
      : m.doc ? `<a class="chat-doc" href="${esc(m.doc.url)}" target="_blank" rel="noopener">${icon("file")}<span>${esc(m.doc.nombre || "Documento")}</span></a>`
      : m.geo ? `<a href="https://maps.google.com/?q=${Number(m.geo.lat)},${Number(m.geo.lng)}" target="_blank" rel="noopener">📍 Ubicación enviada</a>`
      : formatoWa(m.txt);
    caja.innerHTML = (c.msgs || []).slice().sort((a, b) => a.t - b.t).map(m => `<div class="chat-msg ${m.yo ? "yo" : ""}" data-t="${m.t}">${m.cita ? `<div class="chat-cita">${formatoWa(m.cita.txt)}</div>` : ""}${media(m)}
      <small>${m.yo && m.por ? esc(m.por) + " · " : ""}${horaChat(m.t)}</small>${m.reac ? `<span class="chat-reac">${esc(m.reac)}</span>` : ""}</div>`).join("") || `<p class="muted small center">Sin mensajes.</p>`;
    // Al entrar (o si ya estaba abajo) baja al último; se repite al siguiente cuadro porque la barra del turno y la ventana todavía cambian de alto
    if (abajo || !caja.dataset.listo) { pintarTurno(); const bajar = () => { caja.scrollTop = caja.scrollHeight; }; bajar(); requestAnimationFrame(() => requestAnimationFrame(bajar)); setTimeout(bajar, 260); caja.dataset.listo = "1"; }
    else pintarTurno();
    marcarChatVisto(tel, c.t || Date.now());
  };
  // Vehículo turnado: el turno queda sin confirmar hasta que alguien toca que el cliente lo confirmó
  const pintarTurno = () => {
    const vv = getVehiculo(c?.vid || v?.id), bt = $("#chat-turno", s.el);
    bt.innerHTML = vv && estadoActual(vv) === "turnado" ? (vv.turnoConfirmado === true ? `<span class="conf-tag ok">✓ Turno confirmado</span>`
      : vv.turnoConfirmado === "cambio" ? `<span class="conf-tag">Pidió cambiar la fecha</span><button type="button" class="btn btn-ghost btn-sm" id="chat-fecha">${icon("calendar")}Elegir nueva fecha</button>`
      : `<span class="conf-tag">Turno sin confirmar</span><button type="button" class="btn btn-ghost btn-sm" id="chat-conf">${icon("check")}El cliente confirmó el turno</button>`) : "";
  };
  const offV = onChange(e => { if (e === "vehicles" && c && !verPap) pintarTurno(); });
  const moverMsg = async (t, restaurar) => {
    const j = await llamarBot("borrar-msg-chat", { cid, tel, t: Number(t), restaurar });
    if (!j.ok) return toast(j.error || "No se pudo", "error");
    toast(restaurar ? "Mensaje restaurado" : "Mensaje a la papelera", "success");
  };
  const borrar = async m => {
    if (await confirmar({ title: "¿Borrar este mensaje?", message: "Va a la papelera del chat (arriba). Solo se borra en la app: en WhatsApp sigue estando.", ok: "Borrar", danger: true, centro: true })) moverMsg(m.dataset.t, false);
  };
  // Mantener apretado un mensaje: responder citándolo, reaccionar o borrar
  let citaT = null;
  const responderA = el => {
    const m = (c?.msgs || []).find(x => String(x.t) === el.dataset.t); if (!m) return;
    citaT = m.t; const r = $("#chat-resp", s.el);
    $("span", r).textContent = (m.yo ? "Vos: " : "Cliente: ") + String(m.txt || "").slice(0, 90); r.hidden = false; ta.focus();
  };
  const reaccionar = async (el, emoji) => {
    const j = await llamarBot("responder-cliente", { cid, tel, tipo: "reaccion", t: Number(el.dataset.t), emoji });
    if (!j.ok) toast(j.error || "No se pudo reaccionar", "error");
  };
  const pedirBorrar = el => {
    const ya = (c?.msgs || []).find(x => String(x.t) === el.dataset.t)?.reac;
    glideMenu(el, [["resp", "Responder"], ["reac", "Reaccionar"], ["borrar", "Borrar"]], null, k => {
      if (k === "resp") responderA(el);
      else if (k === "borrar") borrar(el);
      else glideMenu(el, [...["👍", "❤️", "🙏", "✅", "😂", "😮"].map(e => [e, e]), ...(ya ? [["", "Quitar reacción"]] : [])], ya || null, e => reaccionar(el, e), "Reaccionar");
    });
  };
  $("#chat-resp-x", s.el).addEventListener("click", () => { citaT = null; $("#chat-resp", s.el).hidden = true; });
  s.el.addEventListener("click", e => {
    if (e.target.closest("#chat-pap")) { verPap = !verPap; caja.dataset.listo = ""; return pintar(); }
    const r = e.target.closest("[data-restaurar]"); if (r) return moverMsg(r.dataset.restaurar, true);
    const vid = c?.vid || v?.id;
    if (e.target.closest("#chat-fecha")) { const vv = getVehiculo(vid); return vv && elegirFechaEstado(vv, "turnado", true); }
    if (!e.target.closest("#chat-conf")) return;
    actualizarVehiculo(vid, { turnoConfirmado: true }, "El cliente confirmó el turno").then(() => toast("Turno confirmado", "success")).catch(err => toast(mensajeError(err), "error"));
  });
  // Borrar un mensaje: mantenerlo apretado (o clic derecho en la computadora)
  let reloj = null;
  caja.addEventListener("pointerdown", e => { const m = e.target.closest(".chat-msg[data-t]"); if (!m) return; reloj = setTimeout(() => { navigator.vibrate?.(30); pedirBorrar(m); }, 550); });
  ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach(ev => caja.addEventListener(ev, e => { if (ev !== "pointermove" || Math.abs(e.movementY) > 3) clearTimeout(reloj); }));
  caja.addEventListener("contextmenu", e => { const m = e.target.closest(".chat-msg[data-t]"); if (m) { e.preventDefault(); clearTimeout(reloj); pedirBorrar(m); } });
  // Sin mensajes todavía (abierto desde un vehículo): se muestra con los datos del vehículo
  const vacio = v ? { tel, vid: v.id, patente: v.patente, nombre: v.asegurado, modelo: v.modelo, msgs: [] } : null;
  const unsub = onSnapshot(doc(db, "companies", cid, "chats", tel), d => { c = d.exists() ? { tel, ...d.data() } : vacio; pintar(); }, () => { c = vacio; pintar(); });
  // Enter manda, Shift+Enter baja de línea; el campo crece con el texto
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); form.requestSubmit(); } });
  // Todo sale por el mismo envío del bot; la respuesta citada se aplica a lo próximo que se mande
  const mandar = async datos => {
    if (enviando) return false;
    enviando = true; const bs = $$(".chat-enviar, .chat-mas", form); bs.forEach(b => { b.disabled = true; });
    const j = await llamarBot("responder-cliente", { cid, tel, por: S.profile?.name || "", vid: c?.vid || v?.id, ...(citaT ? { cita: citaT } : {}), ...datos })
      .catch(() => ({ ok: false }));
    enviando = false; bs.forEach(b => { b.disabled = false; });
    if (!j.ok) { toast(j.error || "No se pudo enviar", "error"); return false; }
    citaT = null; $("#chat-resp", s.el).hidden = true;
    return true;
  };
  form.onsubmit = async e => {
    e.preventDefault();
    if (grab) return pararGrab(true);
    const texto = ta.value.trim(); if (!texto) return;
    if (await mandar({ texto })) { ta.value = ""; ta.style.height = "auto"; }
  };

  // Fotos, videos y documentos (el texto escrito va como epígrafe del primero)
  const inFoto = $("#chat-foto", s.el), inDoc = $("#chat-doc", s.el);
  const mandarArchivos = async (input, comoDoc) => {
    const files = [...input.files]; input.value = "";
    for (const [i, f] of files.entries()) {
      const video = !comoDoc && String(f.type).startsWith("video/"), que = comoDoc ? "documento" : video ? "video" : "foto";
      if (f.size > (video ? 60 : 30) * 1024 * 1024) { toast(`${f.name}: supera ${video ? 60 : 30} MB`, "error"); continue; }
      try {
        toast(files.length > 1 ? `Subiendo ${que} ${i + 1} de ${files.length}…` : `Subiendo ${que}…`);
        const texto = i ? "" : ta.value.trim();
        const { url } = comoDoc ? await subir(f, "chat", { tipo: "auto", nombre: f.name }) : video ? await subir(f, "chat", { tipo: "video" }) : await subir(await comprimir(f), "chat");
        if (!(await mandar(comoDoc ? { tipo: "doc", url, nombre: f.name, texto } : { tipo: video ? "video" : "foto", url, texto }))) return;
        if (!i) { ta.value = ""; ta.style.height = "auto"; }
      } catch (err) { return toast(err.message || `No se pudo subir el ${que}`, "error"); }
    }
  };
  inFoto.addEventListener("change", () => mandarArchivos(inFoto, false));
  inDoc.addEventListener("change", () => mandarArchivos(inDoc, true));
  // Ubicación: la dirección fija del taller (Ajustes del operativo → Mensajes al cliente); el link sale con vista previa
  const mandarUbicacion = () => {
    const direccion = S.company?.mensajes?.direccion || "", mapa = linkMapa();
    if (!direccion && !mapa) return toast("Cargá la dirección del taller en Operativo → Mensajes al cliente", "error");
    // Con link corto la dirección ya va de título en la vista previa: se manda solo el link
    mandar({ texto: S.company?.mensajes?.mapaN && mapa ? `🗺️ *Ubicación:* ${mapa}` : [direccion && `📍 *Dirección:* ${direccion}`, mapa && `🗺️ *Ubicación:* ${mapa}`].filter(Boolean).join("\n") })
      .then(ok => ok && toast("Ubicación enviada", "success"));
  };
  $("#chat-mas", s.el).addEventListener("click", e => glideMenu(e.currentTarget,
    [["foto", "📷 Foto o video"], ["doc", "📄 Documento"], ["ubicacion", "📍 Ubicación"], ["turno", "📊 Confirmar turno / cambiar fecha"], ["retiro", "📊 Retiro hoy / mañana"]], null, k => {
      if (k === "foto") inFoto.click();
      else if (k === "doc") inDoc.click();
      else if (k === "ubicacion") mandarUbicacion();
      else mandar({ tipo: "encuesta", encuesta: k }).then(ok => ok && toast("Encuesta enviada", "success"));
    }));

  // Audio: tocar el micrófono graba; enviar (o el micrófono otra vez) lo manda; la papelera lo descarta
  let grab = null;
  const verGrab = on => { ta.hidden = on; $("#chat-grab", s.el).hidden = !on; $("#chat-cancelar", s.el).hidden = !on; $("#chat-mas", s.el).hidden = on;
    $("#chat-mic", s.el).classList.toggle("on", on); };
  const pararGrab = mandarlo => {
    const g = grab; if (!g) return; grab = null; clearInterval(g.reloj); verGrab(false);
    g.rec.onstop = async () => {
      g.stream.getTracks().forEach(t => t.stop());
      if (!mandarlo || Date.now() - g.t0 < 700) return;   // un toque sin querer no manda nada
      try {
        toast("Mandando audio…");
        const { url } = await subir(new Blob(g.partes, { type: g.rec.mimeType || "audio/webm" }), "chat", { tipo: "video" });
        await mandar({ tipo: "audio", url });
      } catch (err) { toast(err.message || "No se pudo mandar el audio", "error"); }
    };
    g.rec.stop();
  };
  $("#chat-mic", s.el).addEventListener("click", async () => {
    if (grab) return pararGrab(true);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Este equipo no puede grabar audio", "error");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream), g = { rec, stream, partes: [], t0: Date.now() };
      rec.ondataavailable = e => e.data.size && g.partes.push(e.data);
      rec.start(); grab = g; verGrab(true);
      const b = $("#chat-grab b", s.el);
      g.reloj = setInterval(() => { const sg = Math.floor((Date.now() - g.t0) / 1000); b.textContent = `${Math.floor(sg / 60)}:${String(sg % 60).padStart(2, "0")}`;
        if (sg >= 300) pararGrab(true); }, 500);   // tope de 5 minutos
    } catch { toast("No se pudo usar el micrófono (revisá el permiso)", "error"); }
  });
  $("#chat-cancelar", s.el).addEventListener("click", () => pararGrab(false));
}
