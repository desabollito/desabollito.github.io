// ═════════════════════════════════════════════════════════════
//  GASTOS FIJOS: viandas y alquiler, repartidos entre los técnicos de la planilla de técnicos.
//  Se guardan en companies/{cid}/planTec/_fijos (solo administradores).
//   viandas:  { cambios: [{ id, fecha, tecs: [ids], vianda, envio }], dias: { "AAAA-MM-DD": [ids] } }
//             Cada cambio vale desde su fecha en adelante; "dias" son los ajustes de un día puntual.
//   alquiler: { casas: [{ id, nombre, inicio, pagos: [{ id, monto, desde, hasta }], estadias: { idTec: [{ id, llegada, salida }] } }] }
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, onSnapshot, setDoc } from "./firebase.js";
import { S, soyAdmin, mensajeError } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, pedirTexto, fechaCorta, hoyISO } from "./ui.js";
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
    const [yy, mm, dd] = d.split("-").map(Number);
    if (new Date(yy, mm - 1, dd).getDay() === 0) continue;   // los domingos no hay vianda
    const c = [...cambios].reverse().find(x => x.fecha <= d);
    const tecs = v.dias?.[d] || c.tecs || [];
    const vianda = Number(c.vianda) || 0, envio = Number(c.envio) || 0;
    out.push({ fecha: d, tecs, vianda, envio, ajustado: !!v.dias?.[d], parte: tecs.length ? vianda + envio / tecs.length : 0 });
  }
  return out;
}
// Período de un pago (desde/hasta; los pagos viejos tenían "meses")
export const rangoPago = (p, a = {}) => {
  const ini = p.desde || a.inicio || "";
  const fin = p.hasta || (ini && Number(p.meses) > 0 ? masMeses(ini, Number(p.meses)) : ini);
  return [ini, fin];
};
// Estadías de un técnico en la casa: varias por técnico (las viejas eran una sola)
export const estadiasDe = (est, id) => Array.isArray(est?.[id]) ? est[id] : est?.[id]?.llegada ? [{ id: "e0", ...est[id] }] : [];
// Casas alquiladas (varias). Los datos viejos (una sola casa sin nombre) se leen como "Casa 1".
export function casasDe(fijos) {
  const a = fijos?.alquiler || {};
  if (Array.isArray(a.casas)) return a.casas;
  return (a.pagos?.length || a.inicio || Object.keys(a.estadias || {}).length) ? [{ id: "c0", nombre: "Casa 1", inicio: a.inicio || "", pagos: a.pagos || [], estadias: a.estadias || {} }] : [];
}
// Una casa: cada pago cubre su período; el costo de cada día se reparte entre los técnicos que estaban en esa casa
export function repartoCasa(casa, tecnicos, desde = "", hasta = "") {
  const porTec = Object.fromEntries((tecnicos || []).map(t => [t.id, 0])), diasTec = Object.fromEntries(Object.keys(porTec).map(k => [k, 0]));
  let sinAsignar = 0, total = 0;
  const est = casa.estadias || {};
  for (const p of casa.pagos || []) {
    // Se cuentan noches: el día de salida no se cobra (del 1 al 5 son 4 noches)
    const [ini, fin] = rangoPago(p, casa); if (!ini || !fin || fin <= ini) continue;
    const dias = [...diasEntre(ini, masDias(fin, -1))], porDia = (Number(p.monto) || 0) / dias.length;
    total += Number(p.monto) || 0;
    for (const d of dias) {
      if ((desde && d < desde) || (hasta && d > hasta)) continue;
      const hay = Object.keys(porTec).filter(id => estadiasDe(est, id).some(e => e.llegada && e.llegada <= d && (!e.salida || d < e.salida)));
      if (!hay.length) { sinAsignar += porDia; continue; }
      hay.forEach(id => { porTec[id] += porDia / hay.length; diasTec[id]++; });
    }
  }
  return { porTec, diasTec, sinAsignar, total };
}
// Todas las casas juntas
export function repartoAlquiler(fijos, tecnicos, desde = "", hasta = "") {
  const out = { porTec: Object.fromEntries((tecnicos || []).map(t => [t.id, 0])), diasTec: Object.fromEntries((tecnicos || []).map(t => [t.id, 0])), sinAsignar: 0, total: 0 };
  for (const c of casasDe(fijos)) {
    const r = repartoCasa(c, tecnicos, desde, hasta);
    Object.keys(out.porTec).forEach(id => { out.porTec[id] += r.porTec[id] || 0; out.diasTec[id] += r.diasTec[id] || 0; });
    out.sinAsignar += r.sinAsignar; out.total += r.total;
  }
  return out;
}
// Para el Cierre de la planilla de técnicos: lo que le toca a cada técnico de gastos fijos, por nombre
export function fijosPorNombre(fijos, desde = "", hasta = "") {
  const tecs = fijos?.tecnicos || [], vi = viandasPorTec(fijos, tecs, desde, hasta), al = repartoAlquiler(fijos, tecs, desde, hasta).porTec;
  const norm = n => String(n || "").trim().toUpperCase();
  const out = {};
  tecs.forEach(t => { const k = norm(t.nombre); out[k] = { viandas: (out[k]?.viandas || 0) + (vi[t.id] || 0), alquiler: (out[k]?.alquiler || 0) + (al[t.id] || 0) }; });
  return out;
}
export function viandasPorTec(fijos, tecnicos, desde = "", hasta = "") {
  const s = Object.fromEntries((tecnicos || []).map(t => [t.id, 0]));
  diasViandas(fijos, hasta && hasta < hoyISO() ? hasta : hoyISO()).filter(d => !desde || d.fecha >= desde)
    .forEach(d => d.tecs.forEach(id => { if (id in s) s[id] += d.parte; }));
  return s;
}

const F = { tab: "viandas", editando: false, abiertas: new Set() };
let unsub = null;

export function vistaFijos(view) {
  setTopbar({ title: "Gastos fijos", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="f-tec">${icon("team")}<span class="hide-sm">Técnicos</span></button><button class="btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}" id="f-edit">${icon(F.editando ? "check" : "edit")}<span>${F.editando ? "Listo" : "Editar"}</span></button>` });
  if (!soyAdmin()) { view.innerHTML = `<div class="empty"><p>Solo los administradores ven esta planilla.</p></div>`; return; }
  view.innerHTML = `<div class="skeleton tall"></div>`;
  const col = collection(db, "companies", S.company.id, "planTec");
  // Los técnicos de gastos fijos son propios (no los de la planilla de técnicos)
  let fijos = {};
  // Orden de ingreso: el primer día en que cada técnico aparece en las viandas (si no, el día que llegó a la casa);
  // los que entraron el mismo día quedan en el orden en que se cargaron. Así un técnico nuevo nunca se mete entre los anteriores.
  const cfg = { get tecnicos() {
    const l = fijos.tecnicos || [], primero = {};
    const llegadas = id => casasDe(fijos).flatMap(c => estadiasDe(c.estadias, id).map(e => e.llegada)).filter(Boolean).sort();
    for (const c of [...(fijos.viandas?.cambios || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)))
      (c.tecs || []).forEach(id => { if (!primero[id] || c.fecha < primero[id]) primero[id] = c.fecha; });
    Object.entries(fijos.viandas?.dias || {}).forEach(([d, ids]) => (ids || []).forEach(id => { if (!primero[id] || d < primero[id]) primero[id] = d; }));
    return l.map((t, i) => ({ t, i, f: primero[t.id] || llegadas(t.id)[0] || "9999" })).sort((a, b) => a.f.localeCompare(b.f) || a.i - b.i).map(x => x.t);
  } };
  unsub?.();
  unsub = onSnapshot(col, snap => {
    snap.docs.forEach(d => { if (d.id === "_fijos") fijos = d.data(); });
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
    // Se recuerda qué casas están abiertas
    $("#f-body", view).addEventListener("toggle", e => { const d = e.target; if (d?.dataset && "total" in d.dataset) { F.totalAbierto = d.open; return; } if (!d?.dataset?.casa) return;
      d.open ? F.abiertas.add(d.dataset.casa) : F.abiertas.delete(d.dataset.casa); }, true);
  };

  const pintar = () => {
    const body = $("#f-body", view); if (!body) return;
    if (!cfg.tecnicos.length) { body.innerHTML = `<div class="empty small"><p>Primero agregá los técnicos de los gastos fijos.</p>
      <button class="btn btn-primary" data-act="tecnicos">${icon("plus")}Agregar técnicos</button></div>`; return; }
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
          <div class="fijos-kv"><span>Envío por día (se reparte)</span><b>${pesos(ult.envio)}</b></div>`
          : `<p class="muted">Todavía no empezaste. Elegí los técnicos que están ahora y los valores: se repite solo todos los días.</p>`}
        <button type="button" class="btn ${ult ? "btn-ghost" : "btn-primary"} btn-block" data-act="cambio">${icon(ult ? "edit" : "plus")}${ult ? "Cambiar técnicos o valores" : "Empezar"}</button>
      </section>
      ${dias.length ? `<details class="card plegable fijos-tot">
          <summary><span>Total por técnico <small class="muted">${dias.length} ${dias.length === 1 ? "día" : "días"} · ${pesos(Object.values(tot).reduce((a, b) => a + b, 0))}</small></span>${icon("next")}</summary>
          <div class="fijos-tot-body">
          ${tecs.map(t => `<div class="fijos-kv"><span>${esc(t.nombre)}</span><b>${pesos(tot[t.id])}</b></div>`).join("")}
          <div class="fijos-kv fijos-kv-total"><span>Total</span><b>${pesos(Object.values(tot).reduce((a, b) => a + b, 0))}</b></div>
          </div></details>
        ${ed ? `<p class="muted small">Tocá un técnico en un día para sacarlo o sumarlo solo ese día. El envío se reparte entre los que estén.</p>` : ""}
        <div class="vdias">${dias.map(d => {
          const totalDia = d.vianda * d.tecs.length + (d.tecs.length ? d.envio : 0);
          const chips = tecs.filter(t => ed || d.tecs.includes(t.id)).map(t => { const si = d.tecs.includes(t.id);
            return `<${ed ? "button type=\"button\"" : "span"} class="vchip ${si ? "on" : ""}" data-tec="${esc(t.id)}">${esc(t.nombre)}${si ? ` <b>${pesos(d.parte)}</b>` : ""}</${ed ? "button" : "span"}>`; }).join("");
          return `<div class="vdia" data-dia="${d.fecha}">
            <div class="vdia-top"><strong>${diaLabel(d.fecha)}</strong><b>${pesos(totalDia)}</b></div>
            <div class="vdia-chips">${chips || `<span class="muted small">Nadie</span>`}</div>
          </div>`; }).join("")}</div>` : ""}`;
  };
  const sheetCambio = () => {
    const v = fijos.viandas || {}, cambios = v.cambios || [];
    const ult = [...cambios].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    const marcados = new Set(ult?.tecs || cfg.tecnicos.map(t => t.id));
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

  // ── Alquiler: varias casas, cada una con su nombre, pagos y estadías ──
  const casas = () => casasDe(fijos);
  const guardarCasas = l => guardar({ alquiler: { casas: l } });
  const updCasa = (cid, fn) => guardarCasas(casas().map(c => c.id === cid ? fn({ ...c }) : c));
  const tablaReparto = (r, titulo) => `<div class="table-wrap"><table class="tbl tbl-reparto"><thead><tr><th>${titulo}</th><th class="num">Noches</th><th class="num">Corresponde</th></tr></thead><tbody>
      ${cfg.tecnicos.filter(t => r.diasTec[t.id] || r.porTec[t.id] > 0.5).map(t => `<tr><td>${esc(t.nombre)}</td><td class="num">${r.diasTec[t.id] || 0}</td><td class="num">${pesos(r.porTec[t.id])}</td></tr>`).join("")}
      ${r.sinAsignar > 0.5 ? `<tr><td class="muted">Noches sin nadie</td><td></td><td class="num muted">${pesos(r.sinAsignar)}</td></tr>` : ""}
      <tr class="tec-sub"><td>TOTAL PAGADO</td><td></td><td class="num">${pesos(r.total)}</td></tr></tbody></table></div>`;
  const pintarAlquiler = () => {
    const ed = F.editando, l = casas();
    const tarjeta = c => {
      const est = c.estadias || {}, pagos = [...(c.pagos || [])].sort((x, y) => (rangoPago(x, c)[0] || "").localeCompare(rangoPago(y, c)[0] || ""));
      const r = repartoCasa(c, cfg.tecnicos);
      return `<details class="card plegable casa" data-casa="${esc(c.id)}" ${F.abiertas?.has(c.id) ? "open" : ""}>
        <summary><span>${icon("team")}${esc(c.nombre || "Casa")} <small class="muted">${pesos(r.total)}</small></span>${icon("next")}</summary>
        <div class="casa-body">
          ${ed ? `<div class="row-btns"><button type="button" class="btn btn-ghost btn-sm" data-ren-casa>${icon("edit")}Nombre</button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-del-casa>${icon("trash")}Quitar casa</button></div>` : ""}
          <label class="field"><span>Empezamos a alquilar el</span><input type="date" data-campo="inicio" value="${esc(c.inicio || "")}" ${ed ? "" : "disabled"}></label>
          <h3 class="fijos-tit">Pagos</h3>
          ${pagos.length ? `<ul class="fijos-pagos">${pagos.map(p => { const [ini, fin] = rangoPago(p, c);
            return `<li><span><b>${pesos(p.monto)}</b>${ini ? ` <small class="muted">· ${fechaCorta(ini)} al ${fechaCorta(fin)}</small>` : ""}</span>
              ${ed ? `<button type="button" class="icon-btn sm" data-del-pago="${esc(p.id)}" aria-label="Quitar">${icon("x")}</button>` : ""}</li>`; }).join("")}</ul>`
            : `<p class="muted small">Sin pagos cargados.</p>`}
          ${ed ? `<button type="button" class="btn btn-ghost btn-block" data-act="pago">${icon("plus")}Agregar pago</button>` : ""}
          ${ed ? `<h3 class="fijos-tit">Técnicos en la casa</h3>
          <div class="fijos-est">${cfg.tecnicos.filter(t => ed || estadiasDe(est, t.id).length).map(t => { const es = estadiasDe(est, t.id);
            return `<div class="fijos-est-tec" data-tecid="${esc(t.id)}"><div class="fijos-est-nom"><b>${esc(t.nombre)}</b>
                ${ed ? `<span class="est-acc">${es.length ? `<button type="button" class="link-btn small" data-copiar-est title="Copiar estas fechas">Copiar</button>` : ""}
                  ${F.copiaEst ? `<button type="button" class="link-btn small" data-pegar-est title="Pegar las fechas copiadas">Pegar</button>` : ""}
                  <button type="button" class="link-btn small" data-add-est>+ Estadía</button></span>` : ""}</div>
              ${es.map(e => `<div class="fijos-est-fila" data-est="${esc(e.id)}">
                <label><small>Llegó</small><input type="date" data-campo="llegada" value="${esc(e.llegada || "")}" ${ed ? "" : "disabled"}></label>
                <label><small>Se fue</small><input type="date" data-campo="salida" value="${esc(e.salida || "")}" ${ed ? "" : "disabled"}></label>
                ${ed ? `<button type="button" class="icon-btn sm" data-del-est aria-label="Quitar estadía">${icon("x")}</button>` : "<span></span>"}</div>`).join("")}</div>`; }).join("")
              || `<p class="muted small">Sin técnicos cargados.</p>`}</div>` : ""}
          <h3 class="fijos-tit">Reparto de esta casa</h3>
          ${tablaReparto(r, "Técnico")}
        </div></details>`;
    };
    const rt = repartoAlquiler(fijos, cfg.tecnicos);
    return `${l.map(tarjeta).join("")}
      ${l.length ? "" : `<div class="empty small"><p>Todavía no cargaste ninguna casa.</p></div>`}
      ${ed || !l.length ? `<button type="button" class="btn ${l.length ? "btn-ghost" : "btn-primary"} btn-block" data-act="casa">${icon("plus")}Agregar casa</button>` : ""}
      ${l.length ? `<details class="card plegable casa" data-total ${F.totalAbierto ? "open" : ""}><summary><span>${icon("money")}Reparto total <small class="muted">${pesos(rt.total)}</small></span>${icon("next")}</summary>
        <div class="casa-body">${tablaReparto(rt, "Técnico")}</div></details>` : ""}
      ${l.length && !ed ? `<p class="muted small">Tocá <b>Editar</b> para cargar casas, pagos y fechas.</p>` : ""}`;
  };
  const sheetPago = cid => {
    const c = casas().find(x => x.id === cid); if (!c) return;
    const pagos = c.pagos || [];
    const ult = [...pagos].sort((x, y) => (rangoPago(x, c)[1] || "").localeCompare(rangoPago(y, c)[1] || "")).pop();
    const ini = ult ? rangoPago(ult, c)[1] : (c.inicio || hoyISO());   // el pago siguiente arranca el día que termina el anterior
    const s = openSheet({ title: `Pago · ${c.nombre || "Casa"}`, body: `<form class="stack">
      <label class="field"><span>Total pagado</span><input type="number" inputmode="numeric" name="monto" min="0" required></label>
      <label class="field"><span>Desde</span><input type="date" name="desde" value="${esc(ini)}" required></label>
      <label class="field"><span>Hasta (día de salida, esa noche no cuenta)</span><input type="date" name="hasta" value="${esc(masMeses(ini, 1))}" required></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("form", s.el).onsubmit = e => {
      e.preventDefault(); const f = e.target;
      if (f.hasta.value <= f.desde.value) return toast("La fecha de fin tiene que ser después del inicio", "warning");
      const p = { id: nuevoId(), monto: Number(f.monto.value) || 0, desde: f.desde.value, hasta: f.hasta.value };
      updCasa(cid, x => ({ ...x, inicio: x.inicio || p.desde, pagos: [...(x.pagos || []), p] })); s.close();
    };
  };
  const nuevaCasa = async () => {
    const n = await pedirTexto({ title: "Nueva casa", label: "Nombre de la casa", placeholder: "Ej: Casa San Martín", ok: "Agregar" });
    if (!n?.trim()) return;
    const id = nuevoId(); (F.abiertas ||= new Set()).add(id);
    if (!F.editando) $("#f-edit")?.click();
    guardarCasas([...casas(), { id, nombre: n.trim(), inicio: "", pagos: [], estadias: {} }]);
  };

  async function clic(e) {
    const t = e.target;
    if (t.closest("[data-act=cambio]")) return sheetCambio();
    if (t.closest("[data-act=tecnicos]")) return gestionarTecnicos();
    const casaEl = t.closest("[data-casa]"), cid = casaEl?.dataset.casa;
    if (t.closest("[data-act=casa]")) return nuevaCasa();
    if (t.closest("[data-act=pago]") && cid) return sheetPago(cid);
    if (t.closest("[data-ren-casa]") && cid) {
      const c = casas().find(x => x.id === cid);
      const n = await pedirTexto({ title: "Nombre de la casa", label: "Nombre", value: c?.nombre || "" });
      if (n?.trim()) updCasa(cid, x => ({ ...x, nombre: n.trim() }));
      return;
    }
    if (t.closest("[data-del-casa]") && cid && await confirmar({ title: "¿Quitar esta casa?", message: "Se borran sus pagos y estadías.", ok: "Quitar", danger: true }))
      return guardarCasas(casas().filter(x => x.id !== cid));
    const dia = t.closest("[data-dia]"), cel = t.closest("[data-tec]");
    if (dia && cel && F.editando) {
      const d = diasViandas(fijos).find(x => x.fecha === dia.dataset.dia); if (!d) return;
      const id = cel.dataset.tec, tecs = d.tecs.includes(id) ? d.tecs.filter(x => x !== id) : [...d.tecs, id];
      return guardar({ viandas: { ...(fijos.viandas || {}), dias: { ...(fijos.viandas?.dias || {}), [d.fecha]: tecs } } });
    }
    const dc = t.closest("[data-del-cambio]");
    if (dc && await confirmar({ title: "¿Borrar este cambio?", ok: "Borrar", danger: true }))
      return guardar({ viandas: { ...(fijos.viandas || {}), cambios: (fijos.viandas?.cambios || []).filter(c => c.id !== dc.dataset.delCambio) } });
    const tecEl = t.closest("[data-tecid]");
    if (t.closest("[data-add-est]") && tecEl && cid && F.editando) {
      const id = tecEl.dataset.tecid;
      return updCasa(cid, c => ({ ...c, estadias: { ...(c.estadias || {}), [id]: [...estadiasDe(c.estadias, id), { id: nuevoId(), llegada: hoyISO(), salida: "" }] } }));
    }
    // Copiar y pegar las fechas de un técnico a otro (también entre casas)
    if (t.closest("[data-copiar-est]") && tecEl && cid) {
      const c = casas().find(x => x.id === cid);
      F.copiaEst = estadiasDe(c?.estadias, tecEl.dataset.tecid).map(({ llegada, salida }) => ({ llegada, salida }));
      toast("Fechas copiadas: tocá Pegar en otro técnico", "success"); return pintar();
    }
    if (t.closest("[data-pegar-est]") && tecEl && cid && F.copiaEst) {
      const id = tecEl.dataset.tecid;
      return updCasa(cid, c => ({ ...c, estadias: { ...(c.estadias || {}), [id]: F.copiaEst.map(e => ({ id: nuevoId(), ...e })) } }));
    }
    const de = t.closest("[data-del-est]");
    if (de && tecEl && cid && F.editando && await confirmar({ title: "¿Quitar esta estadía?", ok: "Quitar", danger: true })) {
      const id = tecEl.dataset.tecid, eid = de.closest("[data-est]").dataset.est;
      return updCasa(cid, c => ({ ...c, estadias: { ...(c.estadias || {}), [id]: estadiasDe(c.estadias, id).filter(e => e.id !== eid) } }));
    }
    const dp = t.closest("[data-del-pago]");
    if (dp && cid && await confirmar({ title: "¿Quitar este pago?", ok: "Quitar", danger: true }))
      return updCasa(cid, c => ({ ...c, pagos: (c.pagos || []).filter(p => p.id !== dp.dataset.delPago) }));
  }
  function cambio(e) {
    const inp = e.target.closest("[data-campo]"); if (!inp || !F.editando) return;
    const cid = inp.closest("[data-casa]")?.dataset.casa; if (!cid) return;
    if (inp.dataset.campo === "inicio") return updCasa(cid, c => ({ ...c, inicio: inp.value }));
    const tec = inp.closest("[data-tecid]")?.dataset.tecid, eid = inp.closest("[data-est]")?.dataset.est; if (!tec || !eid) return;
    updCasa(cid, c => ({ ...c, estadias: { ...(c.estadias || {}), [tec]: estadiasDe(c.estadias, tec).map(e => e.id === eid ? { ...e, [inp.dataset.campo]: inp.value } : e) } }));
  }

  // Técnicos propios de gastos fijos: agregar, renombrar, quitar
  function gestionarTecnicos() {
    const s = openSheet({ title: "Técnicos (gastos fijos)", body: `<div class="stack">
      <p class="muted small">Son aparte de la planilla de técnicos. En el Cierre se descuentan a quien tenga el mismo nombre.</p>
      <ul class="tec-lista" id="ftl"></ul>
      <button type="button" class="btn btn-ghost btn-block" id="ftl-add">${icon("plus")}Agregar técnico</button></div>` });
    const pintarL = () => { $("#ftl", s.el).innerHTML = cfg.tecnicos.map(t => `<li data-id="${esc(t.id)}"><span class="tl-nombre">${esc(t.nombre)}</span>
      <button type="button" class="icon-btn sm" data-ren aria-label="Renombrar">${icon("edit")}</button>
      <button type="button" class="icon-btn sm danger" data-del aria-label="Quitar">${icon("trash")}</button></li>`).join("") || `<li class="muted small">Sin técnicos</li>`; };
    pintarL();
    const guardarTecs = tecnicos => { fijos = { ...fijos, tecnicos }; pintarL(); return guardar({ tecnicos }); };
    $("#ftl-add", s.el).onclick = async () => {
      const n = await pedirTexto({ title: "Nuevo técnico", label: "Nombre", placeholder: "Ej: Juan", ok: "Agregar" });
      if (n?.trim()) guardarTecs([...cfg.tecnicos, { id: nuevoId(), nombre: n.trim().toUpperCase() }]);
    };
    $("#ftl", s.el).onclick = async e => {
      const li = e.target.closest("[data-id]"); if (!li) return;
      const t = cfg.tecnicos.find(x => x.id === li.dataset.id);
      if (e.target.closest("[data-ren]")) {
        const n = await pedirTexto({ title: "Renombrar", label: "Nombre", value: t.nombre });
        if (n?.trim()) guardarTecs(cfg.tecnicos.map(x => x.id === t.id ? { ...x, nombre: n.trim().toUpperCase() } : x));
      }
      if (e.target.closest("[data-del]") && await confirmar({ title: `¿Quitar a ${t.nombre}?`, ok: "Quitar", danger: true }))
        guardarTecs(cfg.tecnicos.filter(x => x.id !== t.id));
    };
  }
  $("#f-tec")?.addEventListener("click", gestionarTecnicos);

  $("#f-edit")?.addEventListener("click", () => {
    F.editando = !F.editando;
    const b = $("#f-edit"); b.className = `btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(F.editando ? "check" : "edit")}<span>${F.editando ? "Listo" : "Editar"}</span>`;
    pintar();
  });
}
