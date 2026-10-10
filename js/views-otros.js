import {
  S, activos, papelera, restaurar, eliminarDefinitivo, soyAdmin, miRol, renombrarEmpresa, guardarSello,
  agregarMiembro, cambiarRol, quitarMiembro, guardarEtiquetas, resolverSolicitud, desvincularWhatsApp, salirDeEmpresa, eliminarEmpresa, crearEmpresa, elegirEmpresa,
  actualizarPerfil, salir, mensajeError, llamarAdmin, soloDesmontaje, pedirUnion, linksCompartidos
} from "./data.js";
import { cargarExcelJS } from "./excel.js";
import { ESTADOS, ESTADO, ROLES, estadoActual } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet, confirmar,
  pedirTexto, busy, debounce, initials, tsToISO, elegirDescarga, horaDe
} from "./ui.js";
import { imagenChica, avatar } from "./media.js";
import { NOVEDADES } from "./novedades.js";
import { planillaPDF } from "./pdf.js";
import { exportarExcel } from "./excel.js";
import { setTopbar, go, logoOperativo } from "./shell.js";
import { APP_VERSION, WHATSAPP_BOT, BOT_API } from "./config.js";

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
    actions: `<button class="btn btn-ghost btn-sm" id="dl" aria-label="Descargar">${icon("download")}<span class="hide-sm">Descargar</span></button>`
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
      <thead><tr>${COLS.map(([k, t]) => `<th data-k="${k}" class="${k === "precio" ? "num" : ""}" aria-sort="${P.orden === k ? (P.dir > 0 ? "ascending" : "descending") : "none"}">
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
    const total = filas.reduce((s, v) => s + (estadoActual(v) === "anulado" ? 0 : Number(v.precio || 0)), 0);
    $("#psum", view).innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? "vehículo" : "vehículos"}</span>${S.invitado ? "" : `<span>Total <b>${money(total) || "$0"}</b></span>`}`;

    // Celular
    $("#plist", view).innerHTML = filas.length ? filas.map(v => `
      <a class="p-row" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
        <span class="p-l">
          <span class="p-top">${plate(v.patente, "sm")}<strong>${esc(v.modelo || "Sin modelo")}</strong></span>
          <small>${esc([fechaCorta(v.fechas?.peritado), v.compania].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="p-r">
          <strong>${money(v.precio) || "—"}</strong>
          <small><i class="p-dot"></i>${ESTADO[estadoActual(v)].label}</small>
        </span>
      </a>`).join("") : `<div class="empty small"><p>Sin resultados.</p></div>`;

    // Escritorio
    $("#tb", view).innerHTML = filas.length ? filas.map(v => `
      <tr data-id="${v.id}" tabindex="0">
        <td>${plate(v.patente, "sm")}</td><td><strong>${esc(v.modelo || "—")}</strong></td>
        <td>${fechaCorta(v.fechas?.peritado)}</td>
        <td>${esc(v.compania || "—")}</td><td>${esc(v.localidad || "—")}</td>
        <td>${estadoPill(v)}</td><td class="num">${money(v.precio) || "—"}</td></tr>`).join("")
      : `<tr><td colspan="7" class="empty-cell">Sin resultados.</td></tr>`;
    $("#tf", view).innerHTML = `<tr><td colspan="6">${filas.length} ${filas.length === 1 ? "vehículo" : "vehículos"}</td><td class="num">${S.invitado ? "" : money(total) || "$0"}</td></tr>`;
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
        { titulo: "Precio", ancho: 14, tipo: "moneda", valor: v => v.precio },
        { titulo: "Cargado por", ancho: 18, valor: v => v.createdByName }
      ],
      filas,
      total: S.invitado ? [] : [{ etiqueta: "Total", valor: filas.reduce((s, v) => s + (estadoActual(v) === "anulado" ? 0 : Number(v.precio || 0)), 0) }]
    });
  };
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

// Al entrar: hoy si tiene vehículos; si no, el próximo día con vehículos; si no hay
// ninguno adelante, el último día anterior que tenga.
// Solo la primera vez: después queda en el día que se eligió
export function calendarioAlEntrar() { if (!C.dia) C.auto = true; }
// Tocar de nuevo la pestaña Calendario: vuelve al día automático
export function reiniciarCalendario() { C.dia = null; C.auto = true; }
const delCal = () => activos().filter(v => estadoActual(v) !== "anulado");   // los anulados no figuran en el calendario
function elegirDiaAuto() {
  const hoy = hoyISO();
  const dias = [...new Set(delCal().map(v => v.fechas?.[C.campo]).filter(Boolean))].sort();
  const dia = dias.includes(hoy) ? hoy : (dias.find(d => d > hoy) || dias.filter(d => d < hoy).pop() || hoy);
  const [y, m] = dia.split("-").map(Number);
  C.y = y; C.m = m - 1; C.dia = dia;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function vistaCalendario(view) {
  setTopbar({ title: "Calendario", sub: S.company?.name });
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

  let celdas = "";
  for (let i = 0; i < primero; i++) celdas += `<div class="cd out"></div>`;
  for (let d = 1; d <= dias; d++) {
    const f = iso(d), lst = porDia[f] || [];
    celdas += `<button class="cd ${f === hoy ? "today" : ""} ${f === C.dia ? "sel" : ""} ${lst.length ? "has" : ""}" data-d="${f}"
      aria-label="${d} de ${MESES[C.m]}: ${lst.length} vehículos">
      <span class="cd-n">${d}</span>
      <span class="cd-ev">${lst.slice(0, 3).map(v => `<i style="--c:${sinConf(v) ? "#e5484d" : ESTADO[estadoActual(v)].color}">${esc(v.patente || v.modelo || "•")}</i>`).join("")}
      ${lst.length > 3 ? `<i class="more">+${lst.length - 3}</i>` : ""}</span></button>`;
  }
  // Turnos sin confirmar primero
  const delDia = (C.dia ? (porDia[C.dia] || []) : []).slice().sort((a, b) => sinConf(b) - sinConf(a));
  const totalMes = Object.entries(porDia).filter(([k]) => k.startsWith(iso(1).slice(0, 7))).reduce((s, [, l]) => s + l.length, 0);

  view.innerHTML = `
  <div class="cal-page">
    <section class="cal">
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="Mes anterior">${icon("back")}</button>
        <h2>${MESES[C.m]} ${C.y}</h2>
        <button class="icon-btn" id="next" aria-label="Mes siguiente">${icon("next")}</button>
        <button class="btn btn-ghost btn-sm" id="hoy">Hoy</button>
      </div>
      <div class="seg seg-sm" id="campo">
        ${[["peritado", "Peritajes"], ["turnado", "Turnos"]].map(([k, t]) =>
          `<button class="seg-btn ${C.campo === k ? "on" : ""}" data-c="${k}">${t}</button>`).join("")}
      </div>
      <div class="cal-grid">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => `<div class="cw">${d}</div>`).join("")}${celdas}</div>
      <p class="muted small">${totalMes} ${C.campo === "turnado" ? "turnos" : C.campo === "reparado" ? "reparaciones" : "peritajes"} en ${MESES[C.m]}.</p>
    </section>
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

  $("#prev", view).onclick = () => { if (--C.m < 0) { C.m = 11; C.y--; } C.dia = null; vistaCalendario(view); };
  $("#next", view).onclick = () => { if (++C.m > 11) { C.m = 0; C.y++; } C.dia = null; vistaCalendario(view); };
  $("#hoy", view).onclick = () => { const d = new Date(); C.y = d.getFullYear(); C.m = d.getMonth(); C.dia = hoyISO(); vistaCalendario(view); };
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
          <span class="avatar">${esc(initials(m.name))}</span>
          <span class="m-meta">
            <strong>${esc(m.name)}${m.uid === S.user.uid ? " (vos)" : ""}</strong>
            <small>${m.user ? `@${esc(m.user)} · ` : ""}${ROLES[m.rol]?.label || m.rol}</small>
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
          <span class="avatar sm">${esc(initials(u.name || u.username))}</span><span><strong>${esc(u.name || u.username)}</strong><small>@${esc(u.username)}</small></span></button>`).join("")
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
        <button type="button" class="op-mas" id="op-mas" aria-expanded="false">${icon("team")}<span><strong>Operativos</strong><small>Gestionar, unirme o crear</small></span>${icon("next")}</button>
        <div class="op-opciones" id="op-opciones" hidden>
          ${S.company ? `<a class="op-opc" href="#/operativo" data-close>${icon("settings")}<span><strong>Gestionar ${esc(S.company.name)}</strong><small>Usuarios, roles, sello y links</small></span></a>` : ""}
          <button type="button" class="op-opc" id="unir-op">${icon("swap")}<span><strong>Unirme a un operativo</strong><small>Pedir unirme a uno que ya existe</small></span></button>
          ${soloDesmontaje() ? "" : `<button type="button" class="op-opc" id="nuevo-op">${icon("plus")}<span><strong>Crear un operativo</strong><small>Empezá uno nuevo</small></span></button>`}
        </div>
        <a class="op-mas op-ajustes only-mobile" href="#/ajustes" data-close>${icon("settings")}<span><strong>Ajustes</strong><small>Perfil, tema, WhatsApp y papelera</small></span>${icon("next")}</a>
      </div>`
  });
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
  view.innerHTML = `
  <div class="page narrow">
    <section class="card profile">
      <div class="profile-row">
        <span class="avatar lg">${esc(initials(p.name))}</span>
        <div class="profile-meta"><h2>${esc(p.name)}</h2><p class="muted">@${esc(p.username)}</p>
          ${p.whatsapp ? `<p class="perfil-wa" title="WhatsApp vinculado al bot">${icon("chat")}+${esc(String(p.whatsapp).replace(/^(\d{2})(9)(\d{2})(\d{4})(\d{4})$/, "$1 $2 $3 $4-$5"))}</p>` : ""}</div>
      </div>
      <button class="btn btn-ghost btn-block" id="editar-perfil">${icon("edit")}Editar perfil</button>
    </section>

    ${WHATSAPP_BOT ? `<section class="card">
      <h3>Bot de WhatsApp</h3>
      <p class="muted small">Mandale la patente y después las fotos: se guardan solas en ese vehículo, en el operativo que corresponda.</p>
      <a class="btn btn-ghost btn-block" href="https://wa.me/${WHATSAPP_BOT}?text=ayuda" target="_blank" rel="noopener">${icon("chat")}Abrir chat con el bot</a>
    </section>` : ""}

    <section class="card">
      <h3>Apariencia</h3>
      <div class="seg" id="tema">
        <button class="seg-btn ${oscuro ? "" : "on"}" data-t="light">Claro</button>
        <button class="seg-btn ${oscuro ? "on" : ""}" data-t="dark">Oscuro</button>
      </div>
      <span class="muted small aj-sub">Fecha que se muestra en la lista de vehículos</span>
      <div class="seg" id="fecha-vista">${[["peritado", "Día de peritación"], ["estado", "Último estado"]].map(([k, t]) =>
        `<button class="seg-btn ${(() => { try { return localStorage.getItem("fechaVista") || "peritado"; } catch { return "peritado"; } })() === k ? "on" : ""}" data-fv="${k}">${t}</button>`).join("")}</div>
    </section>

    <nav class="card menu">
      <a href="#/papelera">${icon("trash")}<span><strong>Papelera</strong><small>${(S.solicitudes?.length && soyAdmin()) ? `${S.solicitudes.length} ${S.solicitudes.length === 1 ? "solicitud" : "solicitudes"} · ` : ""}${enPapelera ? `${enPapelera} ${enPapelera === 1 ? "vehículo" : "vehículos"}` : "Vacía"}</small></span>${icon("next")}</a>
    </nav>

    <section class="card">
      <button class="btn btn-danger-ghost btn-block" id="salir">${icon("logout")}Cerrar sesión</button>
      <p class="center"><button type="button" class="version-btn" onclick="window.dispatchEvent(new Event('forzar-actualizacion'))"
        title="Tocá para forzar la actualización">Desabollito ${APP_VERSION} ${icon("rotate")}</button></p>
      <p class="center firma-autor">by @gzmatte</p>
      <details class="novedades-log"><summary>Novedades</summary>
        ${NOVEDADES.map(n => `<section><small class="muted">Versión ${esc(n.v)}</small><ul>${n.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}
      </details>
    </section>
  </div>`;

  $("#editar-perfil", view).onclick = () => editarPerfil(() => vistaAjustes(view));
  $("#tema", view).onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    aplicarTema(b.dataset.t); $$(".seg-btn", $("#tema", view)).forEach(x => x.classList.toggle("on", x === b));
  };
  $("#fecha-vista", view).onclick = e => {
    const b = e.target.closest("[data-fv]"); if (!b) return;
    try { localStorage.setItem("fechaVista", b.dataset.fv); } catch { /* sin almacenamiento */ }
    $$(".seg-btn", $("#fecha-vista", view)).forEach(x => x.classList.toggle("on", x === b));
  };
  $("#salir", view).onclick = async () => { if (await confirmar({ title: "¿Cerrar sesión?", ok: "Cerrar sesión" })) salir(); };
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

function editarPerfil(alTerminar) {
  const p = S.profile;
  const s = openSheet({
    title: "Editar perfil",
    body: `<form class="stack" id="perfil-form">
      <label class="field"><span>Nombre</span>
        <input name="nombre" value="${esc(p.name)}" required autocomplete="name"></label>
      <label class="field"><span>Usuario</span>
        <input name="usuario" value="${esc(p.username)}" required autocapitalize="none" spellcheck="false">
        <small class="muted">Letras, números, punto o guion. Es el que usan para sumarte a un operativo.</small></label>
      <button class="btn btn-primary btn-block btn-lg">Guardar perfil</button>
      ${p.whatsapp ? `<button type="button" class="btn btn-danger-ghost btn-block" id="wa-desv">${icon("chat")}Desvincular WhatsApp</button>` : ""}
    </form>`
  });
  $("#wa-desv", s.el)?.addEventListener("click", async () => {
    if (!(await confirmar({ title: "¿Desvincular tu WhatsApp?", message: "El bot te va a pedir tu usuario la próxima vez que le escribas (desde este u otro número).", ok: "Desvincular", danger: true }))) return;
    desvincularWhatsApp().then(() => { toast("WhatsApp desvinculado", "success"); s.close(); alTerminar?.(); }).catch(e => toast(mensajeError(e), "error"));
  });
  $("#perfil-form", s.el).onsubmit = async e => {
    e.preventDefault();
    const b = $("button.btn-primary", e.target);
    busy(b, true, "Guardando…");
    try {
      await actualizarPerfil({ nombre: e.target.nombre.value, usuario: e.target.usuario.value });
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
  let tab = "operativos", datos = null, accAbierto = false;
  // Acceso efectivo de cada usuario (lo elegido o, si no, lo de siempre)
  const esAdminEnAlguno = uid => datos.operativos.some(o => o.miembros.some(m => m.uid === uid && ["admin", "owner"].includes(m.rol)));
  const accesoDe = uid => { const e = datos.config?.accesos?.[uid] || {}, adm = esAdminEnAlguno(uid);
    return { tecnicos: e.tecnicos ?? adm, gastos: e.gastos ?? true, fijos: e.fijos ?? adm }; };
  const nVeh = n => n === null || n === undefined ? "" : `${n} ${n === 1 ? "vehículo" : "vehículos"}`;
  const pintar = () => {
    const { operativos, usuarios } = datos;
    caja.innerHTML = `
      <div class="adm-toggles">
        <label class="toggle"><input type="checkbox" data-config="avisoReparado" ${datos.config?.avisoReparado !== false ? "checked" : ""}>
          <span>Avisar al cliente al marcar Contactado</span></label>
        <label class="toggle"><input type="checkbox" data-config="documentos" ${datos.config?.documentos !== false ? "checked" : ""}>
          <span>Documentos en los vehículos</span></label>
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
      <details class="adm-toggles adm-accesos" ${accAbierto ? "open" : ""}>
        <summary><b>Quién ve las planillas</b> <small class="muted">Técnicos · Gastos · Gastos fijos</small></summary>
        <div class="adm-acc-head"><span></span><small>Técnicos</small><small>Gastos</small><small>Fijos</small></div>
        ${usuarios.filter(u => u.username !== "gzmatte" && u.aprobado !== false && !u.rechazado).map(u => { const a = accesoDe(u.uid);
          return `<div class="adm-acc-fila" data-acc="${esc(u.uid)}"><span><b>${esc(u.name || "Sin nombre")}</b> <small class="muted">@${esc(u.username)}</small></span>
            ${["tecnicos", "gastos", "fijos"].map(k => `<input type="checkbox" data-acc-sec="${k}" ${a[k] ? "checked" : ""} aria-label="${k}">`).join("")}</div>`; }).join("")}
        <small class="muted">Sin tocar: Técnicos y Gastos fijos los ven los administradores y Gastos todos. Vos siempre ves todo.</small>
      </details>
      <div class="seg seg-sm adm-tabs">
        <button type="button" class="seg-btn ${tab === "operativos" ? "on" : ""}" data-tab="operativos">Operativos <small>${operativos.length}</small></button>
        <button type="button" class="seg-btn ${tab === "usuarios" ? "on" : ""}" data-tab="usuarios">Usuarios <small>${usuarios.length}</small></button>
      </div>
      ${tab === "operativos" ? `<ul class="adm-list">${operativos.map(o => `
        <li><div><strong>${esc(o.name)}</strong> <span class="adm-n">${nVeh(o.vehiculos)}</span>
          <small class="muted">${o.miembros.map(m => `${esc(m.quien)}${m.rol === "admin" ? " (admin)" : ""}`).join(" · ") || "Sin miembros"}</small></div></li>`).join("")}</ul>`
      : `<ul class="adm-list">${usuarios.map(u => `
        <li><div><strong>${esc(u.name || "Sin nombre")}</strong>
          <small class="muted">@${esc(u.username)}${u.whatsapp ? ` · +${esc(u.whatsapp)}` : ""}${!u.aprobado ? " · pendiente" : ""}${u.rechazado ? " · rechazado" : ""}</small>
          <small class="adm-ops">${(() => { const ops = operativos.filter(o => o.miembros.some(m => m.uid === u.uid));
            return ops.length ? ops.map(o => `${esc(o.name)} <b>${nVeh(o.vehiculos)}</b>`).join(" · ") : `<span class="muted">Sin operativos</span>`; })()}</small></div>
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
    const sec = e.target.dataset.accSec;
    if (sec) {
      const uid = e.target.closest("[data-acc]").dataset.acc, on = e.target.checked;
      // Se guarda todo lo que se ve (así queda explícito para cada uno)
      const accesos = Object.fromEntries(datos.usuarios.filter(u => u.username !== "gzmatte").map(u => [u.uid, accesoDe(u.uid)]));
      accesos[uid] = { ...accesos[uid], [sec]: on };
      e.target.disabled = true;
      try { const r = await llamarAdmin("config", { accesos }); datos.config = r.config; S.config = { ...S.config, accesos: r.config.accesos || {} }; toast("Acceso guardado", "success"); }
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
      toast(`${clave === "documentos" ? "Documentos" : "Aviso al cliente"} ${on ? "activado" : "desactivado"}`, "success");
    } catch (err) { e.target.checked = !on; toast(err.message, "error"); }
    e.target.disabled = false;
  });
  caja.addEventListener("toggle", e => { if (e.target.classList?.contains("adm-accesos")) accAbierto = e.target.open; }, true);
  caja.addEventListener("click", async e => {
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
