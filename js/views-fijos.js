// ═════════════════════════════════════════════════════════════
//  GASTOS FIJOS: viandas y alquiler, repartidos entre los técnicos de la planilla de técnicos.
//  Se guardan en companies/{cid}/planTec/_fijos (solo administradores).
//   viandas:  { cambios: [{ id, fecha, tecs: [ids], vianda, envio }], dias: { "AAAA-MM-DD": [ids] } }
//             Cada cambio vale desde su fecha en adelante; "dias" son los ajustes de un día puntual.
//   alquiler: { inicio, pagos: [{ id, monto, meses, desde }], estadias: { idTec: { llegada, salida } } }
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, onSnapshot, setDoc } from "./firebase.js";
import { S, soyAdmin, mensajeError } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, fechaCorta, hoyISO } from "./ui.js";
import { setTopbar } from "./shell.js";

const pesos = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaLabel = iso => { const [y, m, d] = iso.split("-").map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d}/${m}`; };
const iso = f => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
const masDias = (s, n) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const masMeses = (s, n) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1 + n, d)); };
const nuevoId = () => Math.random().toString(36).slice(2, 9);
function* diasEntre(a, b) { for (let d = a; d <= b; d = masDias(d, 1)) yield d; }

// ── Cálculos (también los usa el Cierre de la planilla de técnicos) ──
// Viandas por día: cada técnico paga su vianda + su parte del envío
export function diasViandas(fijos, hasta = hoyISO()) {
  const v = fijos?.viandas || {}, cambios = [...(v.cambios || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!cambios.length) return [];
  const out = [];
  for (const d of diasEntre(cambios[0].fecha, hasta)) {
    const c = [...cambios].reverse().find(x => x.fecha <= d);
    const tecs = v.dias?.[d] || c.tecs || [];
    const vianda = Number(c.vianda) || 0, envio = Number(c.envio) || 0;
    out.push({ fecha: d, tecs, vianda, envio, ajustado: !!v.dias?.[d], parte: tecs.length ? vianda + envio / tecs.length : 0 });
  }
  return out;
}
// Alquiler: cada pago cubre sus meses; el costo de cada día se reparte entre los técnicos que estaban en la casa
export function repartoAlquiler(fijos, tecnicos, desde = "", hasta = "") {
  const a = fijos?.alquiler || {}, porTec = Object.fromEntries((tecnicos || []).map(t => [t.id, 0])), diasTec = { ...Object.fromEntries(Object.keys(porTec).map(k => [k, 0])) };
  let sinAsignar = 0, total = 0;
  const est = a.estadias || {};
  for (const p of a.pagos || []) {
    const ini = p.desde || a.inicio; if (!ini || !(Number(p.meses) > 0)) continue;
    const fin = masDias(masMeses(ini, Number(p.meses)), -1);
    const dias = [...diasEntre(ini, fin)], porDia = (Number(p.monto) || 0) / dias.length;
    total += Number(p.monto) || 0;
    for (const d of dias) {
      if ((desde && d < desde) || (hasta && d > hasta)) continue;
      const hay = Object.keys(porTec).filter(id => est[id]?.llegada && est[id].llegada <= d && (!est[id].salida || d <= est[id].salida));
      if (!hay.length) { sinAsignar += porDia; continue; }
      hay.forEach(id => { porTec[id] += porDia / hay.length; diasTec[id]++; });
    }
  }
  return { porTec, diasTec, sinAsignar, total };
}
export function viandasPorTec(fijos, tecnicos, desde = "", hasta = "") {
  const s = Object.fromEntries((tecnicos || []).map(t => [t.id, 0]));
  diasViandas(fijos, hasta && hasta < hoyISO() ? hasta : hoyISO()).filter(d => !desde || d.fecha >= desde)
    .forEach(d => d.tecs.forEach(id => { if (id in s) s[id] += d.parte; }));
  return s;
}

const F = { tab: "viandas", editando: false };
let unsub = null;

export function vistaFijos(view) {
  setTopbar({ title: "Gastos fijos", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}" id="f-edit">${icon(F.editando ? "check" : "edit")}<span>${F.editando ? "Listo" : "Editar"}</span></button>` });
  if (!soyAdmin()) { view.innerHTML = `<div class="empty"><p>Solo los administradores ven esta planilla.</p></div>`; return; }
  view.innerHTML = `<div class="skeleton tall"></div>`;
  const col = collection(db, "companies", S.company.id, "planTec");
  let cfg = { tecnicos: [] }, fijos = {};
  unsub?.();
  unsub = onSnapshot(col, snap => {
    snap.docs.forEach(d => { if (d.id === "_config") cfg = { tecnicos: [], ...d.data() }; if (d.id === "_fijos") fijos = d.data(); });
    if (!document.body.contains(view) || location.hash !== "#/fijos") { unsub?.(); unsub = null; return; }
    if (!$(".fijos-page", view)) estructura();
    pintar();
  }, e => { view.innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });
  const guardar = cambios => setDoc(doc(col, "_fijos"), cambios, { merge: true }).catch(e => toast(mensajeError(e), "error"));
  const nombre = id => cfg.tecnicos.find(t => t.id === id)?.nombre || "?";

  const estructura = () => {
    view.innerHTML = `<div class="fijos-page tec-page">
      <div class="seg seg-sm tec-tabs" id="f-tabs">${[["viandas", "Viandas"], ["alquiler", "Alquiler"]].map(([k, t]) =>
        `<button type="button" class="seg-btn ${F.tab === k ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>
      <div id="f-body"></div></div>`;
    $("#f-tabs", view).onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; F.tab = b.dataset.tab;
      $$("#f-tabs .seg-btn", view).forEach(x => x.classList.toggle("on", x === b)); pintar(); };
    $("#f-body", view).addEventListener("click", clic);
    $("#f-body", view).addEventListener("change", cambio);
  };

  const pintar = () => {
    const body = $("#f-body", view); if (!body) return;
    if (!cfg.tecnicos.length) { body.innerHTML = `<div class="empty small"><p>Primero cargá los técnicos en la <a href="#/tecnicos">planilla de técnicos</a>.</p></div>`; return; }
    body.innerHTML = F.tab === "alquiler" ? pintarAlquiler() : pintarViandas();
  };

  // ── Viandas ──
  const pintarViandas = () => {
    const v = fijos.viandas || {}, cambios = [...(v.cambios || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ult = cambios[cambios.length - 1];
    const tecs = cfg.tecnicos, dias = diasViandas(fijos).reverse();
    const tot = Object.fromEntries(tecs.map(t => [t.id, 0]));
    dias.forEach(d => d.tecs.forEach(id => { if (id in tot) tot[id] += d.parte; }));
    const ed = F.editando;
    return `<section class="card fijos-actual">
        ${ult ? `<div class="fijos-kv"><span>Vianda por técnico</span><b>${pesos(ult.vianda)}</b></div>
          <div class="fijos-kv"><span>Envío por día (se reparte)</span><b>${pesos(ult.envio)}</b></div>
          <div class="fijos-kv"><span>Técnicos desde el ${fechaCorta(ult.fecha)}</span><b>${ult.tecs.map(id => esc(nombre(id))).join(", ") || "—"}</b></div>`
          : `<p class="muted">Todavía no empezaste. Elegí los técnicos que están ahora y los valores: se repite solo todos los días.</p>`}
        <button type="button" class="btn ${ult ? "btn-ghost" : "btn-primary"} btn-block" data-act="cambio">${icon(ult ? "edit" : "plus")}${ult ? "Cambiar técnicos o valores" : "Empezar"}</button>
        ${cambios.length > 1 ? `<details class="fijos-hist"><summary class="muted small">Cambios anteriores (${cambios.length})</summary><ul>${cambios.slice().reverse().map(c =>
          `<li><span>${fechaCorta(c.fecha)} · ${pesos(c.vianda)} + envío ${pesos(c.envio)} · ${c.tecs.length} técnicos</span>
            ${ed ? `<button type="button" class="icon-btn sm" data-del-cambio="${esc(c.id)}" aria-label="Borrar">${icon("x")}</button>` : ""}</li>`).join("")}</ul></details>` : ""}
      </section>
      ${dias.length ? `<div class="table-wrap"><table class="tbl tec-excel fijos-tbl">
        <thead><tr><th>Día</th>${tecs.map(t => `<th class="num">${esc(t.nombre)}</th>`).join("")}<th class="num">Total día</th></tr></thead>
        <tbody>
          <tr class="tec-sub"><td>TOTAL</td>${tecs.map(t => `<td class="num">${pesos(tot[t.id])}</td>`).join("")}<td class="num">${pesos(Object.values(tot).reduce((a, b) => a + b, 0))}</td></tr>
          ${dias.map(d => `<tr data-dia="${d.fecha}"><td>${diaLabel(d.fecha)}${d.ajustado ? ' <small class="muted">·</small>' : ""}</td>
            ${tecs.map(t => { const si = d.tecs.includes(t.id);
              return `<td class="num ${si ? "" : "tec-no"}">${ed ? `<button type="button" class="tec-celda ${si ? "on" : ""}" data-tec="${esc(t.id)}">${si ? pesos(d.parte) : "⨯"}</button>` : si ? pesos(d.parte) : "⨯"}</td>`; }).join("")}
            <td class="num">${pesos(d.vianda * d.tecs.length + (d.tecs.length ? d.envio : 0))}</td></tr>`).join("")}
        </tbody></table></div>
        ${ed ? `<p class="muted small">Tocá un técnico en un día para sacarlo o sumarlo solo ese día. El envío se reparte entre los que estén.</p>` : ""}` : ""}`;
  };
  const sheetCambio = () => {
    const v = fijos.viandas || {}, cambios = v.cambios || [];
    const ult = [...cambios].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    const marcados = new Set(ult?.tecs || cfg.tecnicos.filter(t => t.activo !== false).map(t => t.id));
    const s = openSheet({ title: ult ? "Cambiar viandas" : "Empezar viandas", body: `<form class="stack">
      <label class="field"><span>Desde el día</span><input type="date" name="fecha" value="${hoyISO()}" required></label>
      <label class="field"><span>Valor de la vianda (por técnico, por día)</span><input type="number" inputmode="numeric" name="vianda" min="0" value="${Number(ult?.vianda) || ""}" required></label>
      <label class="field"><span>Envío por día (se reparte entre todos)</span><input type="number" inputmode="numeric" name="envio" min="0" value="${Number(ult?.envio) || 0}"></label>
      <div class="field"><span>Técnicos que están</span><div class="p-chips" id="fc-tecs">${cfg.tecnicos.map(t =>
        `<button type="button" class="p-chip ${marcados.has(t.id) ? "on" : ""}" data-t="${esc(t.id)}">${esc(t.nombre)}</button>`).join("")}</div></div>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("#fc-tecs", s.el).onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return;
      marcados.has(b.dataset.t) ? marcados.delete(b.dataset.t) : marcados.add(b.dataset.t); b.classList.toggle("on"); };
    $("form", s.el).onsubmit = e => {
      e.preventDefault();
      const f = e.target, fecha = f.fecha.value;
      const nuevo = { id: nuevoId(), fecha, tecs: cfg.tecnicos.map(t => t.id).filter(id => marcados.has(id)), vianda: Number(f.vianda.value) || 0, envio: Number(f.envio.value) || 0 };
      // Un cambio por día; los ajustes de días desde esa fecha en adelante se reemplazan por el cambio nuevo
      const dias = Object.fromEntries(Object.entries(v.dias || {}).filter(([d]) => d < fecha));
      guardar({ viandas: { cambios: [...cambios.filter(c => c.fecha !== fecha), nuevo], dias } });
      s.close(); toast("Guardado", "success");
    };
  };

  // ── Alquiler ──
  const pintarAlquiler = () => {
    const a = fijos.alquiler || {}, ed = F.editando, est = a.estadias || {};
    const r = repartoAlquiler(fijos, cfg.tecnicos);
    const pagos = [...(a.pagos || [])].sort((x, y) => (x.desde || "").localeCompare(y.desde || ""));
    return `<section class="card">
        <label class="field"><span>Empezamos a alquilar la casa el</span><input type="date" data-campo="inicio" value="${esc(a.inicio || "")}" ${ed ? "" : "disabled"}></label>
        <h3 class="fijos-tit">Pagos</h3>
        ${pagos.length ? `<ul class="fijos-pagos">${pagos.map(p => { const ini = p.desde || a.inicio || "";
          return `<li><span><b>${pesos(p.monto)}</b> · ${p.meses} ${Number(p.meses) === 1 ? "mes" : "meses"}${ini ? ` <small class="muted">(${fechaCorta(ini)} al ${fechaCorta(masDias(masMeses(ini, Number(p.meses)), -1))})</small>` : ""}</span>
            ${ed ? `<button type="button" class="icon-btn sm" data-del-pago="${esc(p.id)}" aria-label="Quitar">${icon("x")}</button>` : ""}</li>`; }).join("")}</ul>`
          : `<p class="muted small">Sin pagos cargados.</p>`}
        ${ed ? `<button type="button" class="btn btn-ghost btn-block" data-act="pago">${icon("plus")}Agregar pago</button>` : ""}
      </section>
      <section class="card">
        <h3 class="fijos-tit">Técnicos en la casa</h3>
        <p class="muted small">Cada día de alquiler se reparte entre los técnicos que estaban ese día. Sin fecha de salida = sigue en la casa.</p>
        <div class="fijos-est">${cfg.tecnicos.map(t => `<div class="fijos-est-fila" data-tecid="${esc(t.id)}"><b>${esc(t.nombre)}</b>
          <label><small>Llegó</small><input type="date" data-campo="llegada" value="${esc(est[t.id]?.llegada || "")}" ${ed ? "" : "disabled"}></label>
          <label><small>Se fue</small><input type="date" data-campo="salida" value="${esc(est[t.id]?.salida || "")}" ${ed ? "" : "disabled"}></label></div>`).join("")}</div>
      </section>
      <section class="card">
        <h3 class="fijos-tit">Reparto</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Técnico</th><th class="num">Días</th><th class="num">Le toca</th></tr></thead><tbody>
          ${cfg.tecnicos.map(t => `<tr><td>${esc(t.nombre)}</td><td class="num">${r.diasTec[t.id] || 0}</td><td class="num">${pesos(r.porTec[t.id])}</td></tr>`).join("")}
          ${r.sinAsignar > 0.5 ? `<tr><td class="muted">Días sin técnicos en la casa</td><td></td><td class="num muted">${pesos(r.sinAsignar)}</td></tr>` : ""}
          <tr class="tec-sub"><td>TOTAL PAGADO</td><td></td><td class="num">${pesos(r.total)}</td></tr>
        </tbody></table></div>
        ${ed ? "" : `<p class="muted small">Tocá <b>Editar</b> para cargar pagos y fechas.</p>`}
      </section>`;
  };
  const sheetPago = () => {
    const a = fijos.alquiler || {}, pagos = a.pagos || [];
    const ult = [...pagos].sort((x, y) => (x.desde || "").localeCompare(y.desde || "")).pop();
    const sig = ult ? masDias(masMeses(ult.desde || a.inicio, Number(ult.meses)), -1) : "";
    const s = openSheet({ title: "Pago de alquiler", body: `<form class="stack">
      <label class="field"><span>Total pagado</span><input type="number" inputmode="numeric" name="monto" min="0" required></label>
      <label class="field"><span>¿Cuántos meses cubre?</span><input type="number" inputmode="numeric" name="meses" min="1" value="1" required></label>
      <label class="field"><span>Desde</span><input type="date" name="desde" value="${esc(sig ? masDias(sig, 1) : (a.inicio || hoyISO()))}" required></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("form", s.el).onsubmit = e => {
      e.preventDefault(); const f = e.target;
      const p = { id: nuevoId(), monto: Number(f.monto.value) || 0, meses: Math.max(1, Number(f.meses.value) || 1), desde: f.desde.value };
      guardar({ alquiler: { ...a, inicio: a.inicio || p.desde, pagos: [...pagos, p] } }); s.close();
    };
  };

  async function clic(e) {
    const t = e.target;
    if (t.closest("[data-act=cambio]")) return sheetCambio();
    if (t.closest("[data-act=pago]")) return sheetPago();
    const dia = t.closest("[data-dia]"), cel = t.closest("[data-tec]");
    if (dia && cel && F.editando) {
      const d = diasViandas(fijos).find(x => x.fecha === dia.dataset.dia); if (!d) return;
      const id = cel.dataset.tec, tecs = d.tecs.includes(id) ? d.tecs.filter(x => x !== id) : [...d.tecs, id];
      return guardar({ viandas: { ...(fijos.viandas || {}), dias: { ...(fijos.viandas?.dias || {}), [d.fecha]: tecs } } });
    }
    const dc = t.closest("[data-del-cambio]");
    if (dc && await confirmar({ title: "¿Borrar este cambio?", ok: "Borrar", danger: true }))
      return guardar({ viandas: { ...(fijos.viandas || {}), cambios: (fijos.viandas?.cambios || []).filter(c => c.id !== dc.dataset.delCambio) } });
    const dp = t.closest("[data-del-pago]");
    if (dp && await confirmar({ title: "¿Quitar este pago?", ok: "Quitar", danger: true }))
      return guardar({ alquiler: { ...(fijos.alquiler || {}), pagos: (fijos.alquiler?.pagos || []).filter(p => p.id !== dp.dataset.delPago) } });
  }
  function cambio(e) {
    const inp = e.target.closest("[data-campo]"); if (!inp || !F.editando) return;
    const a = fijos.alquiler || {};
    if (inp.dataset.campo === "inicio") return guardar({ alquiler: { ...a, inicio: inp.value } });
    const tec = inp.closest("[data-tecid]")?.dataset.tecid; if (!tec) return;
    const est = { ...(a.estadias || {}) }; est[tec] = { ...(est[tec] || {}), [inp.dataset.campo]: inp.value };
    guardar({ alquiler: { ...a, estadias: est } });
  }

  $("#f-edit")?.addEventListener("click", () => {
    F.editando = !F.editando;
    const b = $("#f-edit"); b.className = `btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(F.editando ? "check" : "edit")}<span>${F.editando ? "Listo" : "Editar"}</span>`;
    pintar();
  });
}
