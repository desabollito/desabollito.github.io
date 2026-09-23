import {
  S, activos, papelera, restaurar, eliminarDefinitivo, soyAdmin, miRol, renombrarEmpresa, guardarSello,
  agregarMiembro, cambiarRol, quitarMiembro, guardarEtiquetas, salirDeEmpresa, eliminarEmpresa, crearEmpresa, elegirEmpresa,
  actualizarPerfil, salir, mensajeError
} from "./data.js";
import { ESTADOS, ESTADO, ROLES, estadoActual } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet, confirmar,
  pedirTexto, busy, debounce, initials, tsToISO, elegirDescarga
} from "./ui.js";
import { imagenChica, avatar } from "./media.js";
import { planillaPDF } from "./pdf.js";
import { exportarExcel } from "./excel.js";
import { setTopbar, go, logoOperativo } from "./shell.js";
import { APP_VERSION, WHATSAPP_BOT } from "./config.js";

// ═════════════════════════════════════════════════════════════
//  PLANILLA
// ═════════════════════════════════════════════════════════════
const P = { q: "", orden: "fecha", dir: -1 };
const COLS = [
  ["patente", "Patente", v => v.patente || ""],
  ["modelo", "Modelo", v => v.modelo || ""],
  ["fecha", "Peritaje", v => v.fechas?.peritado || ""],
  ["asegurado", "Asegurado", v => v.asegurado || ""],
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
    title: "Planilla", sub: S.company?.name,
    actions: `<button class="btn btn-ghost btn-sm" id="dl" aria-label="Descargar">${icon("download")}<span class="hide-sm">Descargar</span></button>`
  });
  const ordenes = [["fecha", "Fecha"], ["patente", "Patente"], ["modelo", "Modelo"], ["asegurado", "Asegurado"], ["estado", "Estado"], ["precio", "Precio"]];
  view.innerHTML = `
  <div class="sheet-page">
    <label class="search">${icon("search")}<input type="search" id="pq" placeholder="Buscar patente, modelo, asegurado, estado…" value="${esc(P.q)}"></label>
    <div class="p-summary" id="psum"></div>

    <!-- Celular: lista compacta con orden elegible -->
    <div class="p-mobile">
      <div class="p-sort">
        <span class="muted small">Ordenar por</span>
        <select id="psort" aria-label="Ordenar por">${ordenes.map(([k, t]) => `<option value="${k}" ${P.orden === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        <button class="icon-btn sm" id="pdir" aria-label="Invertir orden">${icon("sort")}</button>
      </div>
      <div class="p-list" id="plist"></div>
    </div>

    <!-- Tablet y escritorio: tabla completa -->
    <div class="table-wrap p-desktop"><table class="tbl">
      <thead><tr>${COLS.map(([k, t]) => `<th data-k="${k}" class="${k === "precio" ? "num" : ""}" aria-sort="${P.orden === k ? (P.dir > 0 ? "ascending" : "descending") : "none"}">
        <button>${t}${P.orden === k ? (P.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead>
      <tbody id="tb"></tbody><tfoot id="tf"></tfoot></table></div>
  </div>`;

  const pintar = () => {
    const filas = filasPlanilla();
    const total = filas.reduce((s, v) => s + (estadoActual(v) === "anulado" ? 0 : Number(v.precio || 0)), 0);
    $("#psum", view).innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? "vehículo" : "vehículos"}</span><span>Total <b>${money(total) || "$0"}</b></span>`;

    // Celular
    $("#plist", view).innerHTML = filas.length ? filas.map(v => `
      <a class="p-row" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
        <span class="p-l">
          <span class="p-top">${plate(v.patente, "sm")}<strong>${esc(v.modelo || "Sin modelo")}</strong></span>
          <small>${esc([fechaCorta(v.fechas?.peritado), v.asegurado, v.compania].filter(Boolean).join(" · "))}</small>
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
        <td>${fechaCorta(v.fechas?.peritado)}</td><td>${esc(v.asegurado || "—")}</td>
        <td>${esc(v.compania || "—")}</td><td>${esc(v.localidad || "—")}</td>
        <td>${estadoPill(v)}</td><td class="num">${money(v.precio) || "—"}</td></tr>`).join("")
      : `<tr><td colspan="8" class="empty-cell">Sin resultados.</td></tr>`;
    $("#tf", view).innerHTML = `<tr><td colspan="7">${filas.length} ${filas.length === 1 ? "vehículo" : "vehículos"}</td><td class="num">${money(total) || "$0"}</td></tr>`;
  };
  pintar();

  $("#pq", view).oninput = debounce(e => { P.q = e.target.value; pintar(); }, 120);
  $("#psort", view).onchange = e => { P.orden = e.target.value; P.dir = ["fecha", "precio"].includes(P.orden) ? -1 : 1; pintar(); };
  $("#pdir", view).onclick = () => { P.dir *= -1; pintar(); };
  $("thead", view).onclick = e => {
    const th = e.target.closest("[data-k]"); if (!th) return;
    if (P.orden === th.dataset.k) P.dir *= -1; else { P.orden = th.dataset.k; P.dir = 1; }
    vistaPlanilla(view);
  };
  $("#tb", view).onclick = e => { const tr = e.target.closest("[data-id]"); if (tr) go(`#/v/${tr.dataset.id}`); };
  $("#tb", view).onkeydown = e => { if (e.key === "Enter") e.target.closest("[data-id]")?.click(); };

  const pdf = () => planillaPDF(filasPlanilla(), S.company, P.q ? `búsqueda “${P.q}”` : "").save(`Planilla_${hoyISO()}.pdf`);
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
        { titulo: "Fecha de turno", ancho: 15, tipo: "fecha", valor: v => v.fechas?.turnado },
        { titulo: "Fecha de reparación", ancho: 19, tipo: "fecha", valor: v => v.fechas?.reparado },
        { titulo: "Fecha de facturación", ancho: 20, tipo: "fecha", valor: v => v.fechas?.facturado },
        { titulo: "Precio", ancho: 14, tipo: "moneda", valor: v => v.precio },
        { titulo: "Cargado por", ancho: 18, valor: v => v.createdByName }
      ],
      filas,
      total: [{ etiqueta: "Total", valor: filas.reduce((s, v) => s + (estadoActual(v) === "anulado" ? 0 : Number(v.precio || 0)), 0) }]
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

// Al entrar: hoy si tiene vehículos; si no, el próximo día con vehículos; si no hay
// ninguno adelante, el último día anterior que tenga.
export function calendarioAlEntrar() { C.auto = true; }
function elegirDiaAuto() {
  const hoy = hoyISO();
  const dias = [...new Set(activos().map(v => v.fechas?.[C.campo]).filter(Boolean))].sort();
  const dia = dias.includes(hoy) ? hoy : (dias.find(d => d > hoy) || dias.filter(d => d < hoy).pop() || hoy);
  const [y, m] = dia.split("-").map(Number);
  C.y = y; C.m = m - 1; C.dia = dia;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function vistaCalendario(view) {
  setTopbar({ title: "Calendario", sub: S.company?.name });
  if (C.auto && !S.loadingVehicles) { C.auto = false; elegirDiaAuto(); }
  const iso = d => `${C.y}-${String(C.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const porDia = {};
  activos().forEach(v => {
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
      <span class="cd-ev">${lst.slice(0, 3).map(v => `<i style="--c:${ESTADO[estadoActual(v)].color}">${esc(v.patente || v.modelo || "•")}</i>`).join("")}
      ${lst.length > 3 ? `<i class="more">+${lst.length - 3}</i>` : ""}</span></button>`;
  }
  const delDia = C.dia ? (porDia[C.dia] || []) : [];
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
        ${[["peritado", "Peritajes"], ["turnado", "Turnos"], ["reparado", "Reparaciones"]].map(([k, t]) =>
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
          <span class="vmid">${plate(v.patente, "sm")}${estadoPill(v)}</span>
          <span class="vsub">${esc(v.asegurado || "")}</span></span></a>`).join("")}</div>`
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
    uid, name: c.memberNames?.[uid] || "Usuario", rol: c.roles?.[uid] || "tecnico", tags: c.memberTags?.[uid] || []
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
      <p class="muted small">Todos ven y cargan los vehículos de este operativo. Los administradores además gestionan el equipo, las etiquetas y el sello.</p>
      <ul class="members">${miembros.map(m => `
        <li>
          <span class="avatar">${esc(initials(m.name))}</span>
          <span class="m-meta">
            <strong>${esc(m.name)}${m.uid === S.user.uid ? " (vos)" : ""}</strong>
            <small>${ROLES[m.rol]?.label || m.rol}</small>
            ${m.tags.length || admin ? `<span class="tags">${m.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
              ${admin ? `<button class="tag tag-edit" data-tags="${m.uid}">${m.tags.length ? icon("edit") + "Etiquetas" : icon("plus") + "Etiqueta"}</button>` : ""}</span>` : ""}
          </span>
          ${admin && m.rol !== "owner" && m.uid !== S.user.uid ? `
            <span class="m-actions">
              <select data-rol="${m.uid}" aria-label="Rol de ${esc(m.name)}">
                <option value="tecnico" ${m.rol === "tecnico" ? "selected" : ""}>Técnico</option>
                <option value="admin" ${m.rol === "admin" ? "selected" : ""}>Administrador</option></select>
              <button class="icon-btn sm" data-quitar="${m.uid}" aria-label="Quitar a ${esc(m.name)}">${icon("x")}</button>
            </span>` : ""}
        </li>`).join("")}</ul>
      ${admin ? `
      <form class="add-member" id="add">
        <label class="field"><span>Sumar a alguien por su usuario</span>
          <input name="u" placeholder="usuario" autocapitalize="none" spellcheck="false" required></label>
        <select name="rol" aria-label="Rol"><option value="tecnico">Técnico</option><option value="admin">Administrador</option></select>
        <button class="btn btn-primary">${icon("plus")}Sumar</button>
      </form>
      <p class="muted small">Tu usuario es <strong>@${esc(S.profile.username)}</strong>. La otra persona ve el suyo en Ajustes.</p>` : ""}
    </section>

    <section class="card">
      <h3>Sello del presupuesto</h3>
      <p class="muted small">Aparece arriba a la derecha en cada PDF.</p>
      <form id="sello" class="stack">
        <label class="field"><span>Texto</span>
          <textarea name="texto" rows="4" ${admin ? "" : "disabled"} placeholder="Juan Pérez · Desabollador&#10;CUIT 20-12345678-9&#10;11 2345 6789">${esc(sello.texto)}</textarea></label>
        <div class="logo-row">
          <div class="logo-prev ${sello.logo ? "" : "vacio"}">${sello.logo ? `<img src="${esc(sello.logo)}" alt="Logo">` : "Sin logo"}</div>
          ${admin ? `<div class="stack-sm">
            <label class="btn btn-ghost btn-sm">${icon("plus")}${sello.logo ? "Cambiar logo" : "Subir logo"}<input type="file" accept="image/*" hidden id="logo-in"></label>
            ${sello.logo ? `<button type="button" class="link-btn danger" id="logo-del">Quitar logo</button>` : ""}</div>` : ""}
        </div>
        ${admin ? `<button class="btn btn-primary">Guardar sello</button>` : ""}
      </form>
    </section>

    <section class="card danger-zone">
      ${duenio
        ? `<button class="btn btn-danger-ghost" id="borrar-emp">${icon("trash")}Eliminar el operativo y sus vehículos</button>`
        : `<button class="btn btn-danger-ghost" id="salir-emp">${icon("logout")}Salir de este operativo</button>`}
    </section>
  </div>`;

  let logo = sello.logo || "";
  $("#renombrar", view)?.addEventListener("click", async () => {
    const n = await pedirTexto({ title: "Renombrar operativo", label: "Nombre", value: c.name });
    if (n) renombrarEmpresa(n).catch(e => toast(mensajeError(e), "error"));
  });
  $("#add", view)?.addEventListener("submit", async e => {
    e.preventDefault();
    const b = $("button", e.target); busy(b, true, "Buscando…");
    try { const n = await agregarMiembro(e.target.u.value, e.target.rol.value); toast(`${n} se sumó al operativo`, "success"); }
    catch (err) { toast(mensajeError(err), "error"); }
    finally { busy(b, false); }
  });
  $$("[data-rol]", view).forEach(s => s.onchange = () => cambiarRol(s.dataset.rol, s.value).then(() => toast("Rol actualizado", "success")).catch(e => toast(mensajeError(e), "error")));
  $$("[data-tags]", view).forEach(b => b.onclick = () => editarEtiquetas(b.dataset.tags));
  $$("[data-quitar]", view).forEach(b => b.onclick = async () => {
    const n = c.memberNames?.[b.dataset.quitar] || "esta persona";
    if (await confirmar({ title: `¿Quitar a ${n}?`, message: "Deja de ver los vehículos del operativo. Lo que cargó se conserva.", ok: "Quitar", danger: true }))
      quitarMiembro(b.dataset.quitar).catch(e => toast(mensajeError(e), "error"));
  });
  $("#logo-in", view)?.addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { logo = await imagenChica(f); $(".logo-prev", view).classList.remove("vacio"); $(".logo-prev", view).innerHTML = `<img src="${logo}" alt="Logo">`; }
    catch { toast("No se pudo leer la imagen", "error"); }
  });
  $("#logo-del", view)?.addEventListener("click", () => { logo = ""; $(".logo-prev", view).classList.add("vacio"); $(".logo-prev", view).textContent = "Sin logo"; });
  $("#sello", view).onsubmit = async e => {
    e.preventDefault(); if (!admin) return;
    try { await guardarSello({ texto: e.target.texto.value.trim(), logo }); toast("Sello guardado", "success"); }
    catch (err) { toast(mensajeError(err), "error"); }
  };
  $("#salir-emp", view)?.addEventListener("click", async () => {
    if (await confirmar({ title: `¿Salir de ${c.name}?`, message: "Vas a dejar de ver sus vehículos. Un administrador te puede volver a sumar.", ok: "Salir", danger: true }))
      salirDeEmpresa().then(() => go("#/")).catch(e => toast(mensajeError(e), "error"));
  });
  $("#borrar-emp", view)?.addEventListener("click", async () => {
    const n = await pedirTexto({ title: "Eliminar operativo", label: `Escribí “${c.name}” para confirmar`, ok: "Eliminar para siempre" });
    if (n !== c.name) { if (n !== null) toast("El nombre no coincide", "warning"); return; }
    try { await eliminarEmpresa(); toast("Operativo eliminado"); go("#/"); } catch (e) { toast(mensajeError(e), "error"); }
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

async function crearOperativo() {
  const n = await pedirTexto({ title: "Nuevo operativo", label: "Nombre del operativo", placeholder: "Granizo Córdoba 2026", ok: "Crear" });
  if (!n) return;
  try { await crearEmpresa(n); toast("Operativo creado", "success"); } catch (e) { toast(mensajeError(e), "error"); }
}

export function elegirEmpresaSheet() {
  const s = openSheet({
    title: "Tus operativos",
    body: `<ul class="company-list">${S.companies.map(c => `
      <li><button class="company-opt ${c.id === S.company?.id ? "on" : ""}" data-id="${c.id}">
        ${logoOperativo()}
        <span><strong>${esc(c.name)}</strong><small>${ROLES[c.roles?.[S.user.uid]]?.label || ""} · ${c.members.length} ${c.members.length === 1 ? "persona" : "personas"}</small></span>
        ${c.id === S.company?.id ? icon("check") : ""}</button></li>`).join("")}</ul>
      <div class="stack-sm full">
        <a class="btn btn-primary btn-block" href="#/operativo" data-close>${icon("team")}Gestionar operativo</a>
        <button class="btn btn-ghost btn-block" id="nuevo-op">${icon("plus")}Crear otro operativo</button>
      </div>`
  });
  s.body.addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (b) { elegirEmpresa(b.dataset.id); s.close(); go("#/"); }
    if (e.target.closest("#nuevo-op")) { s.close(); crearOperativo(); }
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
    <nav class="card menu">
      <a href="#/papelera">${icon("trash")}<span><strong>Papelera</strong><small>${enPapelera ? `${enPapelera} ${enPapelera === 1 ? "vehículo" : "vehículos"}` : "Vacía"}</small></span>${icon("next")}</a>
    </nav>

    <section class="card profile">
      <div class="profile-row">
        <span class="avatar lg">${p.photoURL ? `<img src="${esc(avatar(p.photoURL, 160))}" alt="">` : esc(initials(p.name))}</span>
        <div class="profile-meta"><h2>${esc(p.name)}</h2><p class="muted">@${esc(p.username)}</p></div>
      </div>
      <button class="btn btn-ghost btn-block" id="editar-perfil">${icon("edit")}Editar perfil</button>
      <p class="muted small">Pasale tu usuario al administrador del operativo para que te sume.</p>
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
    </section>

    <section class="card">
      <button class="btn btn-danger-ghost btn-block" id="salir">${icon("logout")}Cerrar sesión</button>
      <p class="muted small center">Desabollito ${APP_VERSION}</p>
    </section>
  </div>`;

  $("#editar-perfil", view).onclick = () => editarPerfil(() => vistaAjustes(view));
  $("#tema", view).onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    aplicarTema(b.dataset.t); $$(".seg-btn", $("#tema", view)).forEach(x => x.classList.toggle("on", x === b));
  };
  $("#salir", view).onclick = async () => { if (await confirmar({ title: "¿Cerrar sesión?", ok: "Cerrar sesión" })) salir(); };
}

function editarPerfil(alTerminar) {
  const p = S.profile;
  let foto = null;
  const s = openSheet({
    title: "Editar perfil",
    body: `<form class="stack" id="perfil-form">
      <div class="photo-pick">
        <span class="avatar xl" id="pf-prev">${p.photoURL ? `<img src="${esc(avatar(p.photoURL, 200))}" alt="">` : esc(initials(p.name))}</span>
        <label class="btn btn-ghost btn-sm">${icon("camera")}${p.photoURL ? "Cambiar foto" : "Subir foto"}
          <input type="file" accept="image/*" hidden id="pf-foto"></label>
      </div>
      <label class="field"><span>Nombre</span>
        <input name="nombre" value="${esc(p.name)}" required autocomplete="name"></label>
      <label class="field"><span>Usuario</span>
        <input name="usuario" value="${esc(p.username)}" required autocapitalize="none" spellcheck="false">
        <small class="muted">Letras, números, punto o guion. Es el que usan para sumarte a un operativo.</small></label>
      <button class="btn btn-primary btn-block btn-lg">Guardar perfil</button>
    </form>`
  });
  $("#pf-foto", s.el).onchange = e => {
    foto = e.target.files[0] || null;
    if (foto) $("#pf-prev", s.el).innerHTML = `<img src="${URL.createObjectURL(foto)}" alt="">`;
  };
  $("#perfil-form", s.el).onsubmit = async e => {
    e.preventDefault();
    const b = $("button.btn-primary", e.target);
    busy(b, true, foto ? "Subiendo foto…" : "Guardando…");
    try {
      await actualizarPerfil({ nombre: e.target.nombre.value, usuario: e.target.usuario.value, foto });
      toast("Perfil actualizado", "success");
      s.close(); alTerminar?.();
    } catch (err) { toast(mensajeError(err), "error"); busy(b, false); }
  };
}

// ═════════════════════════════════════════════════════════════
//  PAPELERA
// ═════════════════════════════════════════════════════════════
export function vistaPapelera(view) {
  setTopbar({ title: "Papelera", back: "#/ajustes" });
  const items = papelera();
  const admin = soyAdmin();
  view.innerHTML = `
  <div class="page narrow">
    ${items.length ? `<p class="muted small">Los vehículos quedan acá hasta que los restaures o los elimines.</p>
    <ul class="trash">${items.map(v => `
      <li><span class="t-meta"><strong>${esc(v.modelo || "Sin modelo")}</strong>
        <span>${plate(v.patente, "sm")}<small class="muted">Borrado el ${fechaCorta(tsToISO(v.deletedAt)) || "—"}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-r="${v.id}">${icon("restore")}Restaurar</button>
        ${admin || v.createdBy === S.user.uid ? `<button class="icon-btn sm danger" data-x="${v.id}" aria-label="Eliminar para siempre">${icon("trash")}</button>` : ""}
      </li>`).join("")}</ul>`
    : `<div class="empty"><h2>La papelera está vacía</h2><p>Lo que borres de la lista aparece acá por si te arrepentís.</p></div>`}
  </div>`;
  $(".page", view).onclick = async e => {
    const r = e.target.closest("[data-r]"), x = e.target.closest("[data-x]");
    if (r) { restaurar(r.dataset.r).catch(err => toast(mensajeError(err), "error")); toast("Vehículo restaurado", "success"); }
    if (x) {
      const v = items.find(i => i.id === x.dataset.x);
      if (await confirmar({ title: `¿Eliminar “${v?.modelo || v?.patente}” para siempre?`, message: "No se puede deshacer.", ok: "Eliminar", danger: true }))
        eliminarDefinitivo(x.dataset.x).catch(err => toast(mensajeError(err), "error"));
    }
  };
}
