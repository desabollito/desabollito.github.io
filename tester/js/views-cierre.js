// ═════════════════════════════════════════════════════════════
//  CIERRE OPERATIVO: vehículos por compañía − IVA − IIBB − gastos + retornos = total final.
//  Se guarda en companies/{cid}/cierre/datos: { ventas: [{cant, comp, valor}], gastos: [{nombre, monto, meses}], retornos: [{nombre, monto}] }
//  Sin elegir acceso: lo ve quien tenga Gastos tildado (si no, los administradores).
// ═════════════════════════════════════════════════════════════
import { db, doc, onSnapshot, setDoc } from "./firebase.js";
import { S, activos, puedeVer, mensajeError } from "./data.js";
import { $, esc, icon, toast, confirmar } from "./ui.js";
import { setTopbar } from "./shell.js";

const IVA = 1.21, IIBB = 0.035;
const num = x => Number(x) || 0;
const pesos = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");
const MESES = [[0, "Único"], ...Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1} ${i ? "meses" : "mes"}`])];
// Cada sección: sus columnas [campo, tipo (n número, t texto, m tiempo), título] y el total de una fila
const SECC = {
  ventas: { titulo: "Vehículos por compañía", campos: [["cant", "n", "Cantidad"], ["comp", "t", "Compañía"], ["valor", "n", "Valor por auto"]], total: f => num(f.cant) * num(f.valor), agregar: "Agregar compañía" },
  gastos: { titulo: "Gastos", campos: [["nombre", "t", "Gasto"], ["monto", "n", "Monto"], ["meses", "m", "Tiempo"]], total: f => num(f.monto) * (num(f.meses) || 1), agregar: "Agregar gasto" },
  retornos: { titulo: "Retornos (ej. alquileres de los técnicos)", campos: [["nombre", "t", "Concepto"], ["monto", "n", "Monto"]], total: f => num(f.monto), agregar: "Agregar retorno" },
};
export function cuentas(d) {
  const s = k => (d[k] || []).reduce((a, f) => a + SECC[k].total(f), 0);
  const bruto = s("ventas"), sinIva = bruto / IVA, iibb = sinIva * IIBB, neto = sinIva - iibb, gastos = s("gastos"), retornos = s("retornos");
  return { bruto, iva: bruto - sinIva, sinIva, iibb, neto, gastos, trasGastos: neto - gastos, retornos, final: neto - gastos + retornos };
}
// Autocontrol: 121 de venta → 100 sin IVA → 96,5 tras IIBB; −10 de gasto mensual por 2 meses, +5 de retorno = 81,5
console.assert(Math.abs(cuentas({ ventas: [{ cant: 1, valor: 121 }], gastos: [{ monto: 10, meses: 2 }], retornos: [{ monto: 5 }] }).final - 81.5) < 1e-9, "cierre: cuentas");

let unsub = null;
export function vistaCierre(view) {
  setTopbar({ title: "Cierre operativo", sub: S.company?.name, back: "#/planillas" });
  if (!puedeVer("cierre")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const ref = doc(db, "companies", S.company.id, "cierre", "datos");
  const comps = [...new Set(activos().map(v => v.compania).filter(Boolean))].sort();
  let d = { ventas: [], gastos: [], retornos: [] }, remoto = null, tGuardar = null;
  view.innerHTML = `<div class="tec-page cierre-page"><datalist id="c-comps">${comps.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div id="c-body"><div class="skeleton tall"></div></div></div>`;
  const body = $("#c-body", view);

  const celda = (c, t, l, v) => t === "m"
    ? `<select data-c="${c}" aria-label="${l}">${MESES.map(([n, txt]) => `<option value="${n}" ${num(v) === n ? "selected" : ""}>${txt}</option>`).join("")}</select>`
    : `<input data-c="${c}" aria-label="${l}" ${t === "n" ? `type="number" inputmode="decimal" min="0" step="any" class="num"` : `type="text" ${c === "comp" ? `list="c-comps"` : ""}`} value="${esc(v ?? "")}">`;
  const tabla = k => { const s = SECC[k];
    return `<section class="cierre-sec"><h3>${s.titulo}${s.sub ? ` <small class="muted">${s.sub}</small>` : ""}</h3>
      <div class="table-wrap"><table class="tbl tbl-cierre"><thead><tr>${s.campos.map(([, t, l]) => `<th class="${t === "n" ? "num" : ""}">${l}</th>`).join("")}<th class="num">Total</th><th></th></tr></thead>
      <tbody>${(d[k] || []).map((f, i) => `<tr data-sec="${k}" data-i="${i}">${s.campos.map(([c, t, l]) => `<td>${celda(c, t, l, f[c])}</td>`).join("")}
        <td class="num" data-tot></td><td><button type="button" class="icon-btn sm danger" data-borrar aria-label="Borrar fila">${icon("trash")}</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="${s.campos.length}">Subtotal</td><td class="num" data-sub="${k}"></td><td></td></tr></tfoot></table></div>
      <button type="button" class="btn btn-ghost btn-sm" data-agregar="${k}">${icon("plus")}${s.agregar}</button></section>`; };
  const linea = (txt, n, cls = "") => `<div class="cierre-linea ${cls}"><span>${txt}</span><b>${pesos(n)}</b></div>`;
  // Solo los números: no se repintan los campos, así no se pierde lo que se está escribiendo
  const totales = () => {
    body.querySelectorAll("tr[data-sec]").forEach(tr => { $("[data-tot]", tr).textContent = pesos(SECC[tr.dataset.sec].total(d[tr.dataset.sec][tr.dataset.i])); });
    const r = cuentas(d);
    body.querySelectorAll("[data-sub]").forEach(td => { td.textContent = pesos({ ventas: r.bruto, gastos: r.gastos, retornos: r.retornos }[td.dataset.sub]); });
    $("#c-res", body).innerHTML = linea("Total facturado", r.bruto) + linea("IVA 21%", -r.iva) + linea("IIBB 3,5%", -r.iibb)
      + linea("Neto", r.neto, "sub") + linea("Gastos", -r.gastos) + linea("Retornos", r.retornos) + linea("Total final", r.final, "final");
  };
  const pintar = () => { body.innerHTML = tabla("ventas") + tabla("gastos") + tabla("retornos") + `<section class="cierre-sec"><h3>Resumen</h3><div class="cierre-res" id="c-res"></div></section>`; totales(); };
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
    f[c] = t === "number" || e.target.tagName === "SELECT" ? (e.target.value === "" ? "" : num(e.target.value)) : e.target.value;
    totales(); clearTimeout(tGuardar); tGuardar = setTimeout(guardar, 700);
  });
  body.addEventListener("focusout", () => setTimeout(() => {
    if (tGuardar) guardar();
    if (remoto && !editando()) { d = remoto; remoto = null; pintar(); }
  }));
  body.addEventListener("click", async e => {
    const add = e.target.closest("[data-agregar]");
    if (add) { const k = add.dataset.agregar; d[k] = [...(d[k] || []), k === "gastos" ? { meses: 0 } : {}]; guardar(); pintar();
      return $(`tr[data-sec="${k}"][data-i="${d[k].length - 1}"] input`, body)?.focus(); }
    const tr = e.target.closest("[data-borrar]")?.closest("tr"); if (!tr) return;
    const k = tr.dataset.sec, f = d[k][tr.dataset.i];
    if (Object.values(f).some(v => v !== "" && v !== 0) && !(await confirmar({ title: "¿Borrar esta fila?", ok: "Borrar", danger: true }))) return;
    d[k] = d[k].filter((_, i) => i !== +tr.dataset.i); guardar(); pintar();
  });
}
