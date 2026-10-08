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
import { fijosPorNombre } from "./views-fijos.js";

export function vistaPlanillas(view) {
  setTopbar({ title: "Planillas", sub: S.company?.name });
  const admin = soyAdmin();
  view.innerHTML = `<div class="planillas-hub">
    <a class="hub-btn" href="#/planilla">${icon("table")}<span><strong>Planilla de vehículos</strong><small>Todos los vehículos del operativo</small></span></a>
    ${admin ? `<a class="hub-btn" href="#/tecnicos">${icon("team")}<span><strong>Planilla de técnicos</strong><small>Valor por auto, reparto, adelantos y cierre</small></span></a>` : ""}
    <a class="hub-btn" href="#/gastos">${icon("money")}<span><strong>Planilla de gastos</strong><small>Gastos del operativo</small></span></a>
    ${admin ? `<a class="hub-btn" href="#/fijos">${icon("wallet")}<span><strong>Gastos fijos</strong><small>Viandas y alquiler, repartidos entre los técnicos</small></span></a>` : ""}
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
// Cuentan los autos desde que entran a reparar (Reparando, Revisión, Contactado, Entregado o Facturado)
const entregado = v => ["enreparacion", "reparado", "llamado", "entregado", "facturado"].includes(estadoActual(v));
// El día del auto en la planilla es el de la reparación (no el de la entrega)
const fechaRep = v => v.fechas?.reparado || v.fechas?.enreparacion || v.fechas?.llamado || v.fechas?.entregado || v.fechas?.facturado || "";
const nuevoId = () => Math.random().toString(36).slice(2, 9);

const T = { tab: "autos", resumen: "dia", desde: "", hasta: "", editando: false };
let unsub = null;

export function vistaTecnicos(view) {
  setTopbar({ title: "Planilla de técnicos", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="t-tec">${icon("team")}<span class="hide-sm">Técnicos</span></button>
      <button class="btn btn-sm ${T.editando ? "btn-primary" : "btn-ghost"}" id="t-edit">${icon(T.editando ? "check" : "edit")}<span>${T.editando ? "Listo" : "Editar"}</span></button>` });
  if (!soyAdmin()) { view.innerHTML = `<div class="empty"><p>Solo los administradores ven esta planilla.</p></div>`; return; }
  view.innerHTML = `<div class="skeleton tall"></div>`;
  const cid = S.company.id, col = collection(db, "companies", cid, "planTec");
  let cfg = null, filas = {}, fijos = {}, creando = false, gestionando = false;
  unsub?.();
  unsub = onSnapshot(col, snap => {
    filas = {}; cfg = null;
    fijos = {};
    snap.docs.forEach(d => { if (d.id === "_config") cfg = d.data(); else if (d.id === "_fijos") fijos = d.data(); else if (!d.id.startsWith("_")) filas[d.id] = d.data(); });
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
    const faltan = activos().filter(v => entregado(v) && fechaRep(v) && !filas[v.id]);
    if (!faltan.length) return;
    creando = true;
    const activosTec = cfg.tecnicos.filter(t => t.activo !== false).map(t => t.id);
    const b = writeBatch(db);
    faltan.slice(0, 400).forEach(v => b.set(doc(col, v.id), { valor: Number(cfg.valorDefault) || 0, tecs: activosTec, creado: Date.now() }));
    b.commit().catch(e => toast(mensajeError(e), "error")).finally(() => { creando = false; });
  };

  // Filas visibles: auto de la app + datos de la planilla, dentro del período elegido
  const lista = () => activos().filter(v => filas[v.id] && !filas[v.id].oculto && entregado(v)).map(v => {
    const f = filas[v.id], fecha = f.fecha || fechaRep(v);
    const tecs = (f.tecs || []).filter(id => cfg.tecnicos.some(t => t.id === id));
    return { v, f, fecha, valor: Number(f.valor) || 0, tecs, parte: tecs.length ? (Number(f.valor) || 0) / tecs.length : 0 };
  }).filter(r => r.fecha && (!T.desde || r.fecha >= T.desde) && (!T.hasta || r.fecha <= T.hasta))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.f.creado || 0) - Number(b.f.creado || 0));   // del primer día al último

  const estructura = () => {
    view.innerHTML = `<div class="tec-page">
      <div class="tec-filtros">
        <label class="field"><span>Desde</span><input type="date" id="t-desde" value="${esc(T.desde)}"></label>
        <label class="field"><span>Hasta</span><input type="date" id="t-hasta" value="${esc(T.hasta)}"></label>
      </div>
      <div class="seg seg-sm tec-tabs" id="t-tabs">${[["autos", "Autos"], ["cierre", "Cierre"]].map(([k, t]) =>
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
    if (T.tab !== "cierre") T.tab = "autos";
    if (T.tab === "autos") body.innerHTML = pintarAutos(rows);
    if (T.tab === "autos") conectarAnchos(body);
    else body.innerHTML = pintarCierre(rows);
  };

  // Como el Excel: semana por semana; cada día con su título, cada auto en una línea y una columna por técnico.
  // Al terminar cada semana va "TOTAL SEMANA". Solo se puede cambiar algo con "Editar" activado.
  // Las columnas se pueden ensanchar o achicar arrastrando el borde del título (se recuerda en este equipo).
  const anchos = () => { try { return JSON.parse(localStorage.getItem("tecCols") || "{}"); } catch { return {}; } };
  const pintarAutos = rows => {
    if (!rows.length) return `<div class="empty small"><p>Todavía no hay autos en reparación ni entregados${T.desde || T.hasta ? " en ese período" : ""}.</p></div>`;
    const ed = T.editando, tecs = cfg.tecnicos, nc = 4 + tecs.length + (ed ? 1 : 0), w = anchos();
    // Entre Importe y los técnicos va una columna vacía de separación
    const cols = [["veh", "Vehículo", 120], ["pat", "Patente", 90], ["imp", "Importe", 100], ["sep", "", 16], ...tecs.map(t => [t.id, t.nombre, 95])];
    const th = ([k, txt], i) => k === "sep" ? `<th class="tec-sepcol" data-col="sep"><span class="col-res" aria-hidden="true"></span></th>` : `<th class="${i >= 2 ? "num" : ""} ${k === "imp" ? "col-imp" : ""}" data-col="${esc(k)}">${esc(txt)}<span class="col-res" aria-hidden="true"></span></th>`;
    const semanas = [...new Set(rows.map(r => lunesDe(r.fecha)))];
    const fila = r => `<tr data-vid="${esc(r.v.id)}">
      <td>${esc((r.v.modelo || "—").toUpperCase())}</td><td>${esc(r.v.patente || "")}</td>
      <td class="num col-imp">${ed ? `<input type="number" inputmode="numeric" min="0" step="1000" data-campo="valor" value="${r.valor}">` : pesos(r.valor)}</td><td class="tec-sepcol"></td>
      ${tecs.map(t => { const si = r.tecs.includes(t.id);
        return `<td class="num ${si ? "" : "tec-no"}">${ed ? `<button type="button" class="tec-celda ${si ? "on" : ""}" data-tec="${esc(t.id)}">${si ? pesos(r.parte) : "⨯"}</button>` : si ? pesos(r.parte) : "⨯"}</td>`; }).join("")}
      ${ed ? `<td><button type="button" class="icon-btn sm" data-act="fila" aria-label="Opciones">${icon("edit")}</button></td>` : ""}</tr>`;
    return `<div class="table-wrap"><table class="tbl tec-excel ${ed ? "editando" : ""}">
      <colgroup>${cols.map(([k, , def]) => `<col data-col="${esc(k)}" style="width:${Number(w[k]) || def}px">`).join("")}${ed ? `<col style="width:44px">` : ""}</colgroup>
      <thead><tr>${cols.map(th).join("")}${ed ? "<th></th>" : ""}</tr></thead>
      <tbody>${semanas.map(l => {
        const rsS = rows.filter(r => lunesDe(r.fecha) === l), s = sumaPorTec(rsS);
        const dias = [...new Set(rsS.map(r => r.fecha))];
        return dias.map(d => `<tr class="tec-dia-fila"><td colspan="${nc}">${diaLabel(d).toUpperCase()}</td></tr>${rsS.filter(r => r.fecha === d).map(fila).join("")}`).join("") +
          `<tr class="tec-sub"><td colspan="2">TOTAL SEMANA <small>${fechaCorta(l).slice(0, 5)} al ${fechaCorta(masDias(l, 6)).slice(0, 5)} · ${rsS.length} ${rsS.length === 1 ? "auto" : "autos"}</small></td>
            <td class="num col-imp">${pesos(rsS.reduce((a, r) => a + r.valor, 0))}</td><td class="tec-sepcol"></td>
            ${tecs.map(t => `<td class="num">${s[t.id] ? pesos(s[t.id]) : "—"}</td>`).join("")}${ed ? "<td></td>" : ""}</tr>
          <tr class="tec-sep"><td colspan="${nc}"></td></tr>`;
      }).join("")}</tbody></table></div>
      ${ed ? `<p class="muted small">Tocá la celda de un técnico para sumarlo o sacarlo de ese auto. El importe se reparte solo.</p>` : ""}`;
  };
  // Arrastrar el borde derecho del título de una columna cambia su ancho
  // El ancho de la tabla es la suma de sus columnas (así se pueden achicar, no solo agrandar)
  const ajustarTabla = body => $$(".tec-excel", body).forEach(t => {
    t.style.width = [...t.querySelectorAll("col")].reduce((a, c) => a + (parseInt(c.style.width) || 0), 0) + "px"; });
  const conectarAnchos = body => {
    ajustarTabla(body);
    $$(".col-res", body).forEach(h => h.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      const k = h.parentElement.dataset.col, col = $(`col[data-col="${CSS.escape(k)}"]`, body);
      const x0 = e.clientX, w0 = col.getBoundingClientRect().width || parseInt(col.style.width) || 100;
      const mover = ev => { col.style.width = Math.max(k === "sep" ? 4 : 40, Math.round(w0 + ev.clientX - x0)) + "px"; ajustarTabla(body); };
      const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar);
        const w = anchos(); w[k] = parseInt(col.style.width); try { localStorage.setItem("tecCols", JSON.stringify(w)); } catch { /* sin almacenamiento */ } };
      addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
    }));
  };

  const enPeriodo = m => (!T.desde || m.fecha >= T.desde) && (!T.hasta || m.fecha <= T.hasta);
  const pintarCierre = rows => {
    const s = sumaPorTec(rows), total = rows.reduce((a, r) => a + r.valor, 0);
    const movs = (cfg.movs || []).filter(enPeriodo);
    const de = (id, tipo) => movs.filter(m => m.tec === id && m.tipo === tipo);
    const suma = l => l.reduce((a, m) => a + (Number(m.monto) || 0), 0);
    // Gastos fijos (viandas y alquiler) de cada técnico en el período
    const hayFijos = !!(fijos.viandas?.cambios?.length || fijos.alquiler?.pagos?.length);
    // Gastos fijos tiene sus propios técnicos: se cruzan por nombre
    const fx = fijosPorNombre(fijos, T.desde, T.hasta), nf = t => fx[String(t.nombre || "").trim().toUpperCase()] || {};
    const vi = Object.fromEntries(cfg.tecnicos.map(t => [t.id, nf(t).viandas || 0])), al = Object.fromEntries(cfg.tecnicos.map(t => [t.id, nf(t).alquiler || 0]));
    return `<div class="tec-cierre-top">
        <div class="tec-stat"><small>Autos</small><strong>${rows.length}</strong></div>
        <div class="tec-stat"><small>Valor de todos los autos</small><strong>${pesos(total)}</strong></div>
      </div>
      <h3 class="tec-cierre-tit">Por técnico</h3>
      <div class="tec-cierre-grid">
      ${cfg.tecnicos.map(t => {
        const ad = de(t.id, "adelanto"), ga = de(t.id, "gasto"), fin = s[t.id] - suma(ad) - suma(ga) - (vi[t.id] || 0) - (al[t.id] || 0);
        const items = (l, tipo) => l.map(m => `<li><span>${fechaCorta(m.fecha)}${m.nota ? " · " + esc(m.nota) : ""}</span><b>-${pesos(m.monto)}</b>
          ${T.editando ? `<button type="button" class="icon-btn sm" data-del-mov="${esc(m.id)}" aria-label="Quitar">${icon("x")}</button>` : ""}</li>`).join("") ||
          `<li class="muted small">Sin ${tipo === "adelanto" ? "adelantos" : "gastos"}</li>`;
        return `<section class="tec-cierre" data-tecid="${esc(t.id)}">
          <h3 class="tec-cierre-nombre">${esc(t.nombre)} <small>${rows.filter(r => r.tecs.includes(t.id)).length} autos</small></h3>
          <div class="tec-linea"><span>Total ganado</span><b>${pesos(s[t.id])}</b></div>
          <div class="tec-linea"><span>Adelantos</span><b>-${pesos(suma(ad))}</b>${T.editando ? `<button type="button" class="link-btn small" data-add-mov="adelanto">+ Adelanto</button>` : ""}</div>
          <ul class="tec-movs">${items(ad, "adelanto")}</ul>
          <div class="tec-linea"><span>Gastos</span><b>-${pesos(suma(ga))}</b>${T.editando ? `<button type="button" class="link-btn small" data-add-mov="gasto">+ Gasto</button>` : ""}</div>
          <ul class="tec-movs">${items(ga, "gasto")}</ul>
          ${hayFijos ? `<div class="tec-linea"><span>Viandas</span><b>-${pesos(vi[t.id])}</b></div>
          <div class="tec-linea"><span>Alquiler</span><b>-${pesos(al[t.id])}</b></div>` : ""}
          <div class="tec-linea tec-final"><span>Final a pagar</span><b>${pesos(fin)}</b></div>
        </section>`;
      }).join("")}</div>`;
  };

  // ── Acciones ──
  async function clic(e) {
    const t = e.target;
    if (t.closest("[data-act=tecnicos]")) return gestionarTecnicos();
    const res = t.closest("[data-res]");
    if (res) { T.resumen = res.dataset.res; return pintar(); }
    const fila = t.closest("[data-vid]");
    const chip = t.closest("[data-tec]");
    if (chip && fila && T.editando) {
      const f = filas[fila.dataset.vid] || {}, id = chip.dataset.tec;
      const tecs = (f.tecs || []).includes(id) ? f.tecs.filter(x => x !== id) : [...(f.tecs || []), id];
      return guardarFila(fila.dataset.vid, { tecs });
    }
    if (t.closest("[data-act=fila]") && fila && T.editando) return opcionesFila(fila.dataset.vid);
    const add = t.closest("[data-add-mov]");
    if (add && T.editando) {
      const tecid = t.closest("[data-tecid]").dataset.tecid, tipo = add.dataset.addMov;
      return nuevoMov(tecid, tipo);
    }
    const del = t.closest("[data-del-mov]");
    if (del && T.editando) {
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
      <p class="muted small">Solo nombres para esta planilla. <b>Marcado por defecto</b>: <b>Sí</b> = aparece marcado solo en cada auto nuevo; <b>No</b> = queda sin marcar y lo marcás vos en los autos que corresponda.</p>
      <ul class="tec-lista" id="tl"></ul>
      <button type="button" class="btn btn-ghost btn-block" id="tl-add">${icon("plus")}Agregar técnico</button>
      <label class="field"><span>Valor del auto por defecto</span><input type="number" inputmode="numeric" id="tl-valor" value="${Number(cfg.valorDefault) || 0}"></label>
    </div>` });
    const pintarL = () => { $("#tl", s.el).innerHTML = cfg.tecnicos.map(t => `<li data-id="${esc(t.id)}">
      <small class="tl-def">Por defecto</small><button type="button" class="switch ${t.activo !== false ? "on" : ""}" data-sw role="switch" aria-checked="${t.activo !== false}" aria-label="Marcado por defecto"><span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button>
      <span class="tl-nombre">${esc(t.nombre)}</span>
      <button type="button" class="icon-btn sm" data-up aria-label="Mover a la izquierda" title="Mover antes">↑</button>
      <button type="button" class="icon-btn sm" data-down aria-label="Mover a la derecha" title="Mover después">↓</button>
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
      const i = cfg.tecnicos.findIndex(x => x.id === id);
      const mover = d => { const l = [...cfg.tecnicos], j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; guardarTecs(l); };
      if (e.target.closest("[data-up]")) return mover(-1);
      if (e.target.closest("[data-down]")) return mover(1);
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
  $("#t-edit")?.addEventListener("click", () => {
    T.editando = !T.editando;
    const b = $("#t-edit"); b.className = `btn btn-sm ${T.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(T.editando ? "check" : "edit")}<span>${T.editando ? "Listo" : "Editar"}</span>`;
    if (cfg) pintar();
  });
  return { soloLista: () => { if (cfg) { asegurarFilas(); pintar(); } } };
}
