// ═════════════════════════════════════════════════════════════
//  PLANILLAS (menú) y PLANILLA DE TÉCNICOS
//  La planilla de técnicos es propia: el valor del auto, los técnicos y quiénes trabajaron
//  cada auto se guardan aparte (companies/{cid}/planTec) y no cambian nada del vehículo.
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, onSnapshot, setDoc, writeBatch } from "./firebase.js";
import { S, activos, soyAdmin, mensajeError } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, pedirTexto, fechaCorta, hoyISO } from "./ui.js";
import { setTopbar } from "./shell.js";
import { estadoActual } from "./domain.js";

export function vistaPlanillas(view) {
  setTopbar({ title: "Planillas", sub: S.company?.name });
  const admin = soyAdmin();
  view.innerHTML = `<div class="planillas-hub">
    <a class="hub-btn" href="#/planilla">${icon("table")}<span><strong>Planilla de vehículos</strong><small>Todos los vehículos del operativo</small></span></a>
    ${admin ? `<a class="hub-btn" href="#/tecnicos">${icon("team")}<span><strong>Planilla de técnicos</strong><small>Valor por auto, reparto, adelantos y cierre</small></span></a>` : ""}
    <a class="hub-btn" href="#/gastos">${icon("money")}<span><strong>Planilla de gastos</strong><small>Gastos del operativo</small></span></a>
  </div>`;
}

const pesos = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaLabel = iso => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d); return `${DIAS[f.getDay()]} ${d}/${m}`; };
const lunesDe = iso => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d); f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
const masDias = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
// Fecha de la reparación (Revisión en adelante)
const fechaRep = v => v.fechas?.reparado || v.fechas?.llamado || v.fechas?.entregado || v.fechas?.facturado || "";
const nuevoId = () => Math.random().toString(36).slice(2, 9);

const T = { tab: "autos", resumen: "dia", desde: "", hasta: "" };
let unsub = null;

export function vistaTecnicos(view) {
  setTopbar({ title: "Planilla de técnicos", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="t-tec">${icon("team")}<span class="hide-sm">Técnicos</span></button>` });
  if (!soyAdmin()) { view.innerHTML = `<div class="empty"><p>Solo los administradores ven esta planilla.</p></div>`; return; }
  view.innerHTML = `<div class="skeleton tall"></div>`;
  const cid = S.company.id, col = collection(db, "companies", cid, "planTec");
  let cfg = null, filas = {}, creando = false, gestionando = false;
  unsub?.();
  unsub = onSnapshot(col, snap => {
    filas = {}; cfg = null;
    snap.docs.forEach(d => { if (d.id === "_config") cfg = d.data(); else filas[d.id] = d.data(); });
    cfg = { tecnicos: [], valorDefault: 450000, movs: [], ...(cfg || {}) };
    if (!document.body.contains(view) || location.hash !== "#/tecnicos") { unsub?.(); unsub = null; return; }
    if (!$(".tec-page", view)) estructura();
    asegurarFilas(); pintar();
  }, e => { view.innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  const guardarCfg = cambios => setDoc(doc(col, "_config"), cambios, { merge: true }).catch(e => toast(mensajeError(e), "error"));
  const guardarFila = (vid, cambios) => setDoc(doc(col, vid), cambios, { merge: true }).catch(e => toast(mensajeError(e), "error"));

  // Autos reparados (de la app) que todavía no están en la planilla: se agregan con el valor y los técnicos activos
  const asegurarFilas = () => {
    if (creando || gestionando || !cfg.tecnicos.length) return;   // se arma cuando ya están los técnicos   // sin técnicos todavía no se arma nada
    const faltan = activos().filter(v => fechaRep(v) && estadoActual(v) !== "anulado" && !filas[v.id]);
    if (!faltan.length) return;
    creando = true;
    const activosTec = cfg.tecnicos.filter(t => t.activo !== false).map(t => t.id);
    const b = writeBatch(db);
    faltan.slice(0, 400).forEach(v => b.set(doc(col, v.id), { valor: Number(cfg.valorDefault) || 0, tecs: activosTec, creado: Date.now() }));
    b.commit().catch(e => toast(mensajeError(e), "error")).finally(() => { creando = false; });
  };

  // Filas visibles: auto de la app + datos de la planilla, dentro del período elegido
  const lista = () => activos().filter(v => filas[v.id] && !filas[v.id].oculto && estadoActual(v) !== "anulado").map(v => {
    const f = filas[v.id], fecha = f.fecha || fechaRep(v);
    const tecs = (f.tecs || []).filter(id => cfg.tecnicos.some(t => t.id === id));
    return { v, f, fecha, valor: Number(f.valor) || 0, tecs, parte: tecs.length ? (Number(f.valor) || 0) / tecs.length : 0 };
  }).filter(r => r.fecha && (!T.desde || r.fecha >= T.desde) && (!T.hasta || r.fecha <= T.hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(a.v.patente).localeCompare(String(b.v.patente)));

  const estructura = () => {
    view.innerHTML = `<div class="tec-page">
      <div class="tec-filtros">
        <label class="field"><span>Desde</span><input type="date" id="t-desde" value="${esc(T.desde)}"></label>
        <label class="field"><span>Hasta</span><input type="date" id="t-hasta" value="${esc(T.hasta)}"></label>
      </div>
      <div class="seg seg-sm tec-tabs" id="t-tabs">${[["autos", "Autos"], ["resumen", "Resumen"], ["cierre", "Cierre"]].map(([k, t]) =>
        `<button type="button" class="seg-btn ${T.tab === k ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>
      <div id="t-body"></div></div>`;
    $("#t-desde", view).onchange = e => { T.desde = e.target.value; pintar(); };
    $("#t-hasta", view).onchange = e => { T.hasta = e.target.value; pintar(); };
    $("#t-tabs", view).onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; T.tab = b.dataset.tab;
      $$("#t-tabs .seg-btn", view).forEach(x => x.classList.toggle("on", x === b)); pintar(); };
    $("#t-body", view).addEventListener("click", clic);
    $("#t-body", view).addEventListener("change", cambio);
  };

  const nombreTec = id => cfg.tecnicos.find(t => t.id === id)?.nombre || "?";
  const sumaPorTec = rows => { const s = Object.fromEntries(cfg.tecnicos.map(t => [t.id, 0])); rows.forEach(r => r.tecs.forEach(id => { s[id] += r.parte; })); return s; };

  const pintar = () => {
    const body = $("#t-body", view); if (!body) return;
    const rows = lista();
    if (!cfg.tecnicos.length) {
      body.innerHTML = `<div class="empty small"><p>Primero agregá los técnicos (solo nombres, no tienen que estar en la app).</p>
        <button class="btn btn-primary" data-act="tecnicos">${icon("plus")}Agregar técnicos</button></div>`;
      return;
    }
    if (T.tab === "autos") body.innerHTML = pintarAutos(rows);
    else if (T.tab === "resumen") body.innerHTML = pintarResumen(rows);
    else body.innerHTML = pintarCierre(rows);
  };

  const pintarAutos = rows => {
    if (!rows.length) return `<div class="empty small"><p>Todavía no hay autos reparados${T.desde || T.hasta ? " en ese período" : ""}.</p></div>`;
    const dias = [...new Set(rows.map(r => r.fecha))];
    return dias.map(d => {
      const rs = rows.filter(r => r.fecha === d), tot = rs.reduce((a, r) => a + r.valor, 0);
      return `<section class="tec-dia"><h3>${diaLabel(d)} <small>${rs.length} ${rs.length === 1 ? "auto" : "autos"} · ${pesos(tot)}</small></h3>
        ${rs.map(r => `<div class="tec-fila" data-vid="${esc(r.v.id)}">
          <div class="tec-auto"><strong>${esc(r.v.modelo || "Sin modelo")}</strong><span class="tec-pat">${esc(r.v.patente || "")}</span><small>${esc(r.v.compania || "")}</small>
            <button type="button" class="icon-btn sm" data-act="fila" aria-label="Opciones">${icon("edit")}</button></div>
          <div class="tec-valor"><label>Valor <input type="number" inputmode="numeric" min="0" step="1000" data-campo="valor" value="${r.valor}"></label>
            <span class="muted small">${r.tecs.length ? `÷${r.tecs.length} = <b>${pesos(r.parte)}</b> c/u` : "Sin técnicos"}</span></div>
          <div class="tec-chips">${cfg.tecnicos.map(t => `<button type="button" class="p-chip ${r.tecs.includes(t.id) ? "on" : ""}" data-tec="${esc(t.id)}">${esc(t.nombre)}</button>`).join("")}</div>
        </div>`).join("")}</section>`;
    }).join("");
  };

  const tabla = (grupos) => `<div class="table-wrap"><table class="tbl tec-tbl">
    <thead><tr><th></th><th class="num">Autos</th><th class="num">Total</th>${cfg.tecnicos.map(t => `<th class="num">${esc(t.nombre)}</th>`).join("")}</tr></thead>
    <tbody>${grupos.map(([label, rs]) => { const s = sumaPorTec(rs); return `<tr><td>${label}</td><td class="num">${rs.length}</td><td class="num">${pesos(rs.reduce((a, r) => a + r.valor, 0))}</td>
      ${cfg.tecnicos.map(t => `<td class="num">${s[t.id] ? pesos(s[t.id]) : "—"}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>`;

  const pintarResumen = rows => {
    if (!rows.length) return `<div class="empty small"><p>Sin autos en el período.</p></div>`;
    const seg = `<div class="seg seg-sm" id="t-res">${[["dia", "Diario"], ["semana", "Semanal"]].map(([k, t]) =>
      `<button type="button" class="seg-btn ${T.resumen === k ? "on" : ""}" data-res="${k}">${t}</button>`).join("")}</div>`;
    let grupos;
    if (T.resumen === "dia") grupos = [...new Set(rows.map(r => r.fecha))].map(d => [diaLabel(d), rows.filter(r => r.fecha === d)]);
    else grupos = [...new Set(rows.map(r => lunesDe(r.fecha)))].map(l => [`${fechaCorta(l).slice(0, 5)} al ${fechaCorta(masDias(l, 6)).slice(0, 5)}`, rows.filter(r => lunesDe(r.fecha) === l)]);
    return seg + tabla(grupos);
  };

  const enPeriodo = m => (!T.desde || m.fecha >= T.desde) && (!T.hasta || m.fecha <= T.hasta);
  const pintarCierre = rows => {
    const s = sumaPorTec(rows), total = rows.reduce((a, r) => a + r.valor, 0);
    const movs = (cfg.movs || []).filter(enPeriodo);
    const de = (id, tipo) => movs.filter(m => m.tec === id && m.tipo === tipo);
    const suma = l => l.reduce((a, m) => a + (Number(m.monto) || 0), 0);
    return `<div class="tec-cierre-top">
        <div class="kv"><span>Autos reparados</span><strong>${rows.length}</strong></div>
        <div class="kv"><span>Valor de todos los autos</span><strong>${pesos(total)}</strong></div>
      </div>
      ${cfg.tecnicos.map(t => {
        const ad = de(t.id, "adelanto"), ga = de(t.id, "gasto"), fin = s[t.id] - suma(ad) - suma(ga);
        const items = (l, tipo) => l.map(m => `<li><span>${fechaCorta(m.fecha)}${m.nota ? " · " + esc(m.nota) : ""}</span><b>-${pesos(m.monto)}</b>
          <button type="button" class="icon-btn sm" data-del-mov="${esc(m.id)}" aria-label="Quitar">${icon("x")}</button></li>`).join("") ||
          `<li class="muted small">Sin ${tipo === "adelanto" ? "adelantos" : "gastos"}</li>`;
        return `<section class="tec-cierre" data-tecid="${esc(t.id)}">
          <h3>${esc(t.nombre)} <small>${rows.filter(r => r.tecs.includes(t.id)).length} autos</small></h3>
          <div class="tec-linea"><span>Total ganado</span><b>${pesos(s[t.id])}</b></div>
          <div class="tec-linea"><span>Adelantos</span><b>-${pesos(suma(ad))}</b><button type="button" class="link-btn small" data-add-mov="adelanto">+ Adelanto</button></div>
          <ul class="tec-movs">${items(ad, "adelanto")}</ul>
          <div class="tec-linea"><span>Gastos</span><b>-${pesos(suma(ga))}</b><button type="button" class="link-btn small" data-add-mov="gasto">+ Gasto</button></div>
          <ul class="tec-movs">${items(ga, "gasto")}</ul>
          <div class="tec-linea tec-final"><span>Final a pagar</span><b>${pesos(fin)}</b></div>
        </section>`;
      }).join("")}`;
  };

  // ── Acciones ──
  async function clic(e) {
    const t = e.target;
    if (t.closest("[data-act=tecnicos]")) return gestionarTecnicos();
    const res = t.closest("[data-res]");
    if (res) { T.resumen = res.dataset.res; return pintar(); }
    const fila = t.closest("[data-vid]");
    const chip = t.closest("[data-tec]");
    if (chip && fila) {
      const f = filas[fila.dataset.vid] || {}, id = chip.dataset.tec;
      const tecs = (f.tecs || []).includes(id) ? f.tecs.filter(x => x !== id) : [...(f.tecs || []), id];
      return guardarFila(fila.dataset.vid, { tecs });
    }
    if (t.closest("[data-act=fila]") && fila) return opcionesFila(fila.dataset.vid);
    const add = t.closest("[data-add-mov]");
    if (add) {
      const tecid = t.closest("[data-tecid]").dataset.tecid, tipo = add.dataset.addMov;
      return nuevoMov(tecid, tipo);
    }
    const del = t.closest("[data-del-mov]");
    if (del) {
      if (!(await confirmar({ title: "¿Quitar este movimiento?", ok: "Quitar", danger: true }))) return;
      return guardarCfg({ movs: (cfg.movs || []).filter(m => m.id !== del.dataset.delMov) });
    }
  }
  function cambio(e) {
    const inp = e.target.closest("[data-campo=valor]"), fila = e.target.closest("[data-vid]");
    if (inp && fila) guardarFila(fila.dataset.vid, { valor: Math.max(0, Number(inp.value) || 0) });
  }

  function nuevoMov(tecid, tipo) {
    const s = openSheet({ title: `${tipo === "adelanto" ? "Adelanto" : "Gasto"} · ${nombreTec(tecid)}`, body: `<form class="stack">
      <label class="field"><span>Monto</span><input name="monto" type="number" inputmode="numeric" min="0" required></label>
      <label class="field"><span>Fecha</span><input name="fecha" type="date" value="${hoyISO()}" required></label>
      <label class="field"><span>Nota (opcional)</span><input name="nota" maxlength="80"></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("form", s.el).onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target, m = { id: nuevoId(), tec: tecid, tipo, monto: Number(f.monto.value) || 0, fecha: f.fecha.value, nota: f.nota.value.trim() };
      guardarCfg({ movs: [...(cfg.movs || []), m] }); s.close();
    };
  }

  function opcionesFila(vid) {
    const v = activos().find(x => x.id === vid), f = filas[vid] || {};
    const s = openSheet({ title: `${v?.modelo || ""} ${v?.patente || ""}`, body: `<form class="stack">
      <label class="field"><span>Fecha en la planilla</span><input name="fecha" type="date" value="${esc(f.fecha || fechaRep(v || {}))}"></label>
      <button class="btn btn-primary btn-block">Guardar</button>
      <button type="button" class="btn btn-ghost btn-block danger" data-ocultar>Quitar de la planilla</button></form>` });
    $("form", s.el).onsubmit = ev => { ev.preventDefault(); guardarFila(vid, { fecha: ev.target.fecha.value || "" }); s.close(); };
    $("[data-ocultar]", s.el).onclick = async () => { s.close();
      if (await confirmar({ title: "¿Quitar de la planilla de técnicos?", message: "El vehículo sigue en la app; solo deja de contar acá.", ok: "Quitar", danger: true }))
        guardarFila(vid, { oculto: true }); };
  }

  function gestionarTecnicos() {
    gestionando = true;
    const s = openSheet({ title: "Técnicos", onClose: () => { gestionando = false; asegurarFilas(); pintar(); }, body: `<div class="stack">
      <p class="muted small">Solo nombres para esta planilla. Los marcados como activos se ponen solos en los autos nuevos.</p>
      <ul class="tec-lista" id="tl"></ul>
      <button type="button" class="btn btn-ghost btn-block" id="tl-add">${icon("plus")}Agregar técnico</button>
      <label class="field"><span>Valor del auto por defecto</span><input type="number" inputmode="numeric" id="tl-valor" value="${Number(cfg.valorDefault) || 0}"></label>
    </div>` });
    const pintarL = () => { $("#tl", s.el).innerHTML = cfg.tecnicos.map(t => `<li data-id="${esc(t.id)}">
      <button type="button" class="switch ${t.activo !== false ? "on" : ""}" data-sw role="switch" aria-checked="${t.activo !== false}"><span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button>
      <span class="tl-nombre">${esc(t.nombre)}</span>
      <button type="button" class="icon-btn sm" data-ren aria-label="Renombrar">${icon("edit")}</button>
      <button type="button" class="icon-btn sm danger" data-del aria-label="Quitar">${icon("trash")}</button></li>`).join("") || `<li class="muted small">Sin técnicos</li>`; };
    pintarL();
    const guardarTecs = tecnicos => { cfg.tecnicos = tecnicos; pintarL(); return guardarCfg({ tecnicos }); };
    $("#tl-add", s.el).onclick = async () => {
      const n = await pedirTexto({ title: "Nuevo técnico", label: "Nombre", placeholder: "Ej: Juan", ok: "Agregar" });
      if (n?.trim()) guardarTecs([...cfg.tecnicos, { id: nuevoId(), nombre: n.trim().toUpperCase(), activo: true }]);
    };
    $("#tl-valor", s.el).onchange = e => guardarCfg({ valorDefault: Math.max(0, Number(e.target.value) || 0) });
    $("#tl", s.el).onclick = async e => {
      const li = e.target.closest("[data-id]"); if (!li) return;
      const id = li.dataset.id, t = cfg.tecnicos.find(x => x.id === id);
      if (e.target.closest("[data-sw]")) return guardarTecs(cfg.tecnicos.map(x => x.id === id ? { ...x, activo: x.activo === false } : x));
      if (e.target.closest("[data-ren]")) {
        const n = await pedirTexto({ title: "Renombrar", label: "Nombre", value: t.nombre });
        if (n?.trim()) guardarTecs(cfg.tecnicos.map(x => x.id === id ? { ...x, nombre: n.trim().toUpperCase() } : x));
        return;
      }
      if (e.target.closest("[data-del]") && await confirmar({ title: `¿Quitar a ${t.nombre}?`, message: "Deja de figurar en la planilla y en los repartos.", ok: "Quitar", danger: true }))
        guardarTecs(cfg.tecnicos.filter(x => x.id !== id));
    };
  }

  $("#t-tec")?.addEventListener("click", () => cfg && gestionarTecnicos());
  return { soloLista: () => { if (cfg) { asegurarFilas(); pintar(); } } };
}
