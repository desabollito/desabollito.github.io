// ═════════════════════════════════════════════════════════════
//  CIERRE OPERATIVO: vehículos por compañía − IVA − IIBB − gastos + retornos = total final.
//  Se guarda en companies/{cid}/cierre/datos: { ventas: [{cant, comp, valor}], gastos: [{nombre, monto}], retornos: [{nombre, monto}] }
//  Sin elegir acceso: lo ve quien tenga Gastos tildado (si no, los administradores).
// ═════════════════════════════════════════════════════════════
import { db, doc, onSnapshot, setDoc } from "./firebase.js";
import { S, activos, puedeVer, mensajeError } from "./data.js";
import { $, esc, icon, toast, confirmar, hoyISO } from "./ui.js";
import { setTopbar } from "./shell.js";
import { descargarTabla } from "./excel.js";

const IVA = 1.21, IIBB = 0.035;
const num = x => Number(x) || 0;
const porAuto = f => num(f.cant) ? Math.round(num(f.total) / num(f.cant) * 100) / 100 : 0;
// Plata con puntos de miles mientras se escribe (coma para decimales); el cursor queda después del mismo dígito
function plata(inp) {
  const izq = inp.value.slice(0, inp.selectionStart).replace(/[^\d,]/g, "").length;
  const [ent = "", dec] = inp.value.replace(/[^\d,]/g, "").split(",");
  const e = ent.replace(/^0+(?=\d)/, ""), txt = (e ? Number(e).toLocaleString("es-AR") : dec !== undefined ? "0" : "") + (dec !== undefined ? "," + dec.slice(0, 2) : "");
  inp.value = txt;
  let pos = 0, n = 0; while (pos < txt.length && n < izq) { if (/[\d,]/.test(txt[pos])) n++; pos++; }
  inp.setSelectionRange(pos, pos);
  return txt ? Number((e || "0") + (dec ? "." + dec.slice(0, 2) : "")) : "";
}
const pesos = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");
// Cada sección: sus columnas [campo, tipo (c cantidad, n plata, t texto), título] y el total de una fila (m: modo de Vehículos)
const SECC = {
  ventas: { titulo: "Vehículos por compañía", campos: [["cant", "c", "Cantidad"], ["comp", "t", "Compañía"], ["valor", "n", "Valor por auto"]], total: (f, m) => m === "total" ? num(f.total) : num(f.cant) * num(f.valor), agregar: "Agregar compañía" },
  gastos: { titulo: "Gastos", campos: [["nombre", "t", "Gasto"], ["monto", "n", "Monto"]], total: f => num(f.monto), agregar: "Agregar gasto" },
  retornos: { titulo: "Retornos (ej. alquileres de los técnicos)", campos: [["nombre", "t", "Concepto"], ["monto", "n", "Monto"]], total: f => num(f.monto), agregar: "Agregar retorno" },
};
// Gastos marcados como retorno: se restan como gasto y vuelven sumados en Retornos (ej. el alquiler que después pagan los técnicos)
const gastosRet = d => (d.gastos || []).filter(f => f.retorno);
export function cuentas(d) {
  const s = k => (d[k] || []).reduce((a, f) => a + SECC[k].total(f, d.modoVentas), 0);
  const bruto = s("ventas"), sinIva = bruto / IVA, iibb = sinIva * IIBB, neto = sinIva - iibb, gastos = s("gastos"), retornos = s("retornos") + gastosRet(d).reduce((a, f) => a + num(f.monto), 0);
  return { bruto, iva: bruto - sinIva, sinIva, iibb, neto, gastos, trasGastos: neto - gastos, retornos, final: neto - gastos + retornos };
}
// Autocontrol: 121 de venta → 100 sin IVA → 96,5 tras IIBB; −10 de gasto, +5 de retorno = 91,5
console.assert(cuentas({ modoVentas: "total", ventas: [{ cant: 2, valor: 1, total: 242 }] }).sinIva - 200 < 1e-9, "cierre: modo total");
console.assert(Math.abs(cuentas({ ventas: [{ cant: 1, valor: 121 }], gastos: [{ monto: 10 }], retornos: [{ monto: 5 }] }).final - 91.5) < 1e-9, "cierre: cuentas");
console.assert(cuentas({ gastos: [{ monto: 10, retorno: true }], retornos: [{ monto: 5 }] }).final === 5, "cierre: gasto como retorno");

let unsub = null;
export function vistaCierre(view) {
  setTopbar({ title: "Cierre operativo", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="c-desc">${icon("download")}<span class="hide-sm">Descargar</span></button>` });
  if (!puedeVer("cierre")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const ref = doc(db, "companies", S.company.id, "cierre", "datos");
  const comps = [...new Set(activos().map(v => v.compania).filter(Boolean))].sort();
  let d = { ventas: [], gastos: [], retornos: [] }, remoto = null, tGuardar = null, retAbierto = false;
  view.innerHTML = `<div class="tec-page cierre-page"><datalist id="c-comps">${comps.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div id="c-body"><div class="skeleton tall"></div></div></div>`;
  const body = $("#c-body", view);
  // Una sola hoja: cada sección con su subtotal y al final el resumen
  $("#c-desc").onclick = () => {
    const r = cuentas(d), neg = (...x) => Object.assign(x, { negrita: true }), filas = [];
    const sec = (titulo, k, fila, sub, extra = []) => { filas.push(neg(titulo, "", "", "")); [...(d[k] || []), ...extra].forEach(f => filas.push(fila(f))); filas.push(neg("Subtotal", "", "", sub), ["", "", "", ""]); };
    sec("VEHÍCULOS", "ventas", f => [f.comp || "", num(f.cant), d.modoVentas === "total" ? porAuto(f) : num(f.valor), SECC.ventas.total(f, d.modoVentas)], r.bruto);
    sec("GASTOS", "gastos", f => [f.nombre || "", "", num(f.monto), SECC.gastos.total(f)], r.gastos);
    sec("RETORNOS", "retornos", f => [f.nombre || "", "", num(f.monto), num(f.monto)], r.retornos, gastosRet(d));
    filas.push(neg("RESUMEN", "", "", ""), ["Total facturado", "", "", r.bruto], ["IVA 21%", "", "", -r.iva], ["IIBB 3,5%", "", "", -r.iibb],
      ["Neto", "", "", r.neto], ["Gastos", "", "", -r.gastos], ["Retornos", "", "", r.retornos], neg("TOTAL FINAL", "", "", r.final));
    descargarTabla({ archivo: `Cierre_${hoyISO()}`, titulo: "Cierre operativo", filas,
      cols: [{ titulo: "CONCEPTO", ancho: 30 }, { titulo: "CANTIDAD", ancho: 16 }, { titulo: "VALOR", ancho: 18, tipo: "moneda" }, { titulo: "TOTAL", ancho: 20, tipo: "moneda" }] });
  };

  const celda = (c, t, l, v) => t === "n" ? `<input data-c="${c}" aria-label="${l}" type="text" inputmode="decimal" class="num" data-plata value="${esc(v === "" || v == null ? "" : num(v).toLocaleString("es-AR", { maximumFractionDigits: 2 }))}">`
    : `<input data-c="${c}" aria-label="${l}" ${t === "c" ? `type="number" inputmode="numeric" min="0" step="any"` : `type="text" ${c === "comp" ? `list="c-comps"` : ""}`} value="${esc(v ?? "")}">`;
  // Retornos va plegado (se recuerda si se abrió), con su total a la vista
  // Vehículos: se escribe el valor por auto (y se calcula el total) o el total facturado (y se calcula el valor por auto)
  const ANCHO = { c: "110px", n: "150px", t: "" };
  const tabla = k => { const s = SECC[k], plegable = k === "retornos", porTotal = k === "ventas" && d.modoVentas === "total";
    const modos = k === "ventas" ? `<div class="seg seg-sm">${[["auto", "Valor por auto"], ["total", "Total facturado"]].map(([m, l]) => `<button type="button" class="seg-btn ${(d.modoVentas || "auto") === m ? "on" : ""}" data-modo="${m}">${l}</button>`).join("")}</div>` : "";
    return `${plegable ? `<details class="d-sec d-adic cierre-sec" id="c-ret" ${retAbierto ? "open" : ""}><summary><h3>${s.titulo}</h3><small class="muted" data-sub="${k}"></small></summary>`
      : `<section class="d-sec cierre-sec"><div class="cierre-head"><h3>${s.titulo}</h3>${modos}</div>`}
      <div class="table-wrap"><table class="tbl tbl-cierre"><colgroup>${s.campos.map(([, t]) => `<col style="width:${ANCHO[t] || "auto"}">`).join("")}<col style="width:150px"><col style="width:${k === "gastos" ? 84 : 44}px"></colgroup>
      <thead><tr>${s.campos.map(([, t, l]) => `<th class="${t === "n" ? "num" : ""}">${l}</th>`).join("")}<th class="num">Total</th><th></th></tr></thead>
      <tbody>${(d[k] || []).map((f, i) => `<tr data-sec="${k}" data-i="${i}" class="${f.retorno ? "c-esret" : ""}">${s.campos.map(([c, t, l]) => porTotal && c === "valor" ? `<td class="num" data-pu></td>` : `<td>${celda(c, t, l, f[c])}</td>`).join("")}
        ${porTotal ? `<td>${celda("total", "n", "Total facturado", f.total)}</td>` : `<td class="num" data-tot></td>`}<td class="c-acc">${k === "gastos" ? `<button type="button" class="icon-btn sm c-retbtn" data-retorno aria-pressed="${!!f.retorno}" aria-label="Marcar como retorno" title="${f.retorno ? "Es retorno: tocá para quitar" : "Marcar como retorno"}">${icon("rotate")}</button>` : ""}<button type="button" class="icon-btn sm danger" data-borrar aria-label="Borrar fila">${icon("trash")}</button></td></tr>`).join("")}
      ${plegable ? (d.gastos || []).map((f, i) => f.retorno ? `<tr data-gret="${i}" class="c-gret"><td><span data-n></span> <small class="muted">· gasto</small></td><td class="num" data-m></td><td class="num" data-m></td><td><button type="button" class="icon-btn sm" data-desmarcar="${i}" aria-label="Quitar de retornos" title="Quitar de retornos">${icon("x")}</button></td></tr>` : "").join("") : ""}</tbody>
      <tfoot><tr><td colspan="${s.campos.length}"></td><td class="num" data-sub="${k}"></td><td></td></tr></tfoot></table></div>
      <button type="button" class="btn btn-ghost btn-sm" data-agregar="${k}">${icon("plus")}${s.agregar}</button>${plegable ? "</details>" : "</section>"}`; };
  const linea = (txt, n, cls = "") => `<div class="cierre-linea ${cls}"><span>${txt}</span><b>${pesos(n)}</b></div>`;
  // Solo los números: no se repintan los campos, así no se pierde lo que se está escribiendo
  const totales = () => {
    body.querySelectorAll("tr[data-sec]").forEach(tr => { const f = d[tr.dataset.sec][tr.dataset.i], tot = $("[data-tot]", tr), pu = $("[data-pu]", tr);
      if (tot) tot.textContent = pesos(SECC[tr.dataset.sec].total(f, d.modoVentas));
      if (pu) pu.textContent = pesos(porAuto(f)); });
    body.querySelectorAll("tr[data-gret]").forEach(tr => { const f = d.gastos[tr.dataset.gret] || {};
      $("[data-n]", tr).textContent = f.nombre || "Sin nombre"; tr.querySelectorAll("[data-m]").forEach(td => { td.textContent = pesos(num(f.monto)); }); });
    const r = cuentas(d);
    body.querySelectorAll("[data-sub]").forEach(td => { td.textContent = pesos({ ventas: r.bruto, gastos: r.gastos, retornos: r.retornos }[td.dataset.sub]); });
    $("#c-res", body).innerHTML = linea("Total facturado", r.bruto) + linea("IVA 21%", -r.iva) + linea("IIBB 3,5%", -r.iibb)
      + linea("Neto", r.neto, "sub") + linea("Gastos", -r.gastos) + linea("Retornos", r.retornos) + linea("Total final", r.final, "final");
  };
  const pintar = () => { body.innerHTML = tabla("ventas") + tabla("gastos") + tabla("retornos") + `<section class="d-sec cierre-sec"><h3>Resumen</h3><div class="cierre-res" id="c-res"></div></section>`; totales(); };
  // shortcut: se guarda el documento entero (si dos editan a la vez gana el último); pasar a filas sueltas si se edita mucho en simultáneo
  const guardar = () => { clearTimeout(tGuardar); tGuardar = null; remoto = null; setDoc(ref, d).catch(e => toast(mensajeError(e), "error")); };
  const editando = () => body.contains(document.activeElement) && document.activeElement.matches("input, select");

  unsub?.();
  unsub = onSnapshot(ref, snap => {
    if (!document.body.contains(view) || location.hash !== "#/cierre") { unsub?.(); unsub = null; return; }
    if (snap.metadata.hasPendingWrites) return;   // el eco de lo propio
    remoto = { ventas: [], gastos: [], retornos: [], ...snap.data() };
    if (editando() || tGuardar) return;           // lo de otros se pinta al salir del campo
    d = remoto; remoto = null; pintar();
  }, e => { body.innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  body.addEventListener("input", e => {
    const c = e.target.dataset.c, tr = e.target.closest("tr[data-sec]"); if (!c || !tr) return;
    const f = d[tr.dataset.sec][tr.dataset.i], t = e.target.type;
    if (e.target.hasAttribute("data-plata")) f[c] = plata(e.target);
    else f[c] = t === "number" ? (e.target.value === "" ? "" : num(e.target.value)) : e.target.value;
    totales(); clearTimeout(tGuardar); tGuardar = setTimeout(guardar, 700);
  });
  body.addEventListener("toggle", e => { if (e.target.id === "c-ret") retAbierto = e.target.open; }, true);
  body.addEventListener("focusout",() => setTimeout(() => {
    if (tGuardar) guardar();
    if (remoto && !editando()) { d = remoto; remoto = null; pintar(); }
  }));
  body.addEventListener("click", async e => {
    const modo = e.target.closest("[data-modo]")?.dataset.modo;
    if (modo) { if (modo === (d.modoVentas || "auto")) return;
      // Al cambiar se pasa el dato, así el total de cada compañía no cambia
      d.ventas = (d.ventas || []).map(f => modo === "total" ? { ...f, total: num(f.cant) * num(f.valor) } : { ...f, valor: porAuto(f) });
      d.modoVentas = modo; guardar(); return pintar(); }
    const ret = e.target.closest("[data-retorno], [data-desmarcar]");
    if (ret) { const f = d.gastos[ret.dataset.desmarcar ?? ret.closest("tr").dataset.i]; if (f.retorno) delete f.retorno; else f.retorno = true; guardar(); return pintar(); }
    const add = e.target.closest("[data-agregar]");
    if (add) { const k = add.dataset.agregar; d[k] = [...(d[k] || []), {}]; guardar(); pintar();
      return $(`tr[data-sec="${k}"][data-i="${d[k].length - 1}"] input`, body)?.focus(); }
    const tr = e.target.closest("[data-borrar]")?.closest("tr"); if (!tr) return;
    const k = tr.dataset.sec, f = d[k][tr.dataset.i];
    if (Object.values(f).some(v => v !== "" && v !== 0) && !(await confirmar({ title: "¿Borrar esta fila?", ok: "Borrar", danger: true }))) return;
    d[k] = d[k].filter((_, i) => i !== +tr.dataset.i); guardar(); pintar();
  });
}
