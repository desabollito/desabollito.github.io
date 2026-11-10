// ═════════════════════════════════════════════════════════════
//  CIERRE OPERATIVO: vehículos por compañía − IVA − IIBB − gastos + retornos = total final, repartido por % y con gastos de cada persona.
//  Se guarda en companies/{cid}/cierre/datos: { ventas: [{cant, comp, valor}], gastos: [{nombre, monto}], reparto: [{nombre, pct, gastos: [{nombre, monto}]}] }
//  Retornos: solo los gastos marcados con el botón (la lista "retornos" vieja queda guardada pero no se muestra ni se cuenta)
//  Sin elegir acceso: lo ve quien tenga Gastos tildado (si no, los administradores).
// ═════════════════════════════════════════════════════════════
import { db, doc, onSnapshot, setDoc } from "./firebase.js";
import { S, activos, puedeVer, mensajeError } from "./data.js";
import { $, esc, icon, toast, confirmar, hoyISO, elegirDescarga } from "./ui.js";
import { setTopbar } from "./shell.js";
import { exportarExcel } from "./excel.js";

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
  // Reparto del total final entre personas, por porcentaje (ej. 60/40)
  reparto: { titulo: "Reparto", campos: [["nombre", "t", "Persona"], ["pct", "c", "%"]], total: (f, m, r) => (r?.final || 0) * num(f.pct) / 100, agregar: "Agregar persona" },
  // Gastos de cada persona del reparto: se le descuentan de su parte
  pg: { titulo: "Gastos por persona", campos: [["nombre", "t", "Gasto"], ["monto", "n", "Monto"]], total: f => num(f.monto), agregar: "Agregar gasto" },
  pg2: { titulo: "Más gastos", campos: [["nombre", "t", "Gasto"], ["monto", "n", "Monto"]], total: f => num(f.monto), agregar: "Agregar más gastos" },
};
// Gastos marcados como retorno: se restan como gasto y vuelven sumados en Retornos (ej. el alquiler que después pagan los técnicos)
const gastosRet = d => (d.gastos || []).filter(f => f.retorno);
export function cuentas(d) {
  const s = k => (d[k] || []).reduce((a, f) => a + SECC[k].total(f, d.modoVentas), 0);
  const bruto = s("ventas"), sinIva = bruto / IVA, iibb = sinIva * IIBB, neto = sinIva - iibb, gastos = s("gastos"), retornos = gastosRet(d).reduce((a, f) => a + num(f.monto), 0);
  return { bruto, iva: bruto - sinIva, sinIva, iibb, neto, gastos, trasGastos: neto - gastos, retornos, final: neto - gastos + retornos };
}
// Autocontrol: 121 de venta → 100 sin IVA → 96,5 tras IIBB; −10 de gasto = 86,5; un gasto marcado como retorno da 0
console.assert(cuentas({ modoVentas: "total", ventas: [{ cant: 2, valor: 1, total: 242 }] }).sinIva - 200 < 1e-9, "cierre: modo total");
console.assert(Math.abs(cuentas({ ventas: [{ cant: 1, valor: 121 }], gastos: [{ monto: 10 }], retornos: [{ monto: 5 }] }).final - 86.5) < 1e-9, "cierre: cuentas");
console.assert(cuentas({ gastos: [{ monto: 10, retorno: true }] }).final === 0, "cierre: gasto como retorno");
// Cada persona tiene dos listas: "gastos" (Gastos por persona) y "gastos2" (Más gastos, después de Queda)
const parte = (f, r) => SECC.reparto.total(f, 0, r), gastosDe = (f, l = "gastos") => (f[l] || []).filter(g => !g.retorno).reduce((a, g) => a + num(g.monto), 0);
// Lo que le queda a cada persona: su parte − sus gastos + sus retornos (en la persona el retorno es ganancia: no se resta)
const retDe = (f, l = "gastos") => (f[l] || []).filter(g => g.retorno).reduce((a, g) => a + num(g.monto), 0), queda = (f, r) => parte(f, r) - gastosDe(f) + retDe(f);
const quedaFinal = (f, r) => queda(f, r) - gastosDe(f, "gastos2") + retDe(f, "gastos2");
console.assert(quedaFinal({ pct: 100, gastos: [{ monto: 10 }], gastos2: [{ monto: 5 }, { monto: 2, retorno: true }] }, { final: 100 }) === 87, "cierre: más gastos");
// Secciones plegadas que cada uno dejó abiertas (solo en este equipo)
const abiertos = (() => { try { return JSON.parse(localStorage.getItem("cierreAbiertos")) || {}; } catch { return {}; } })();

// PDF con las mismas cajas que la página (sin botones). Cada caja: título, tabla y líneas de total; si no entra, va a la hoja siguiente
function cierrePDF(d, r) {
  if (!window.jspdf) throw new Error("Falta cargar el PDF, probá de nuevo en un momento");
  // Todo en una sola hoja: primero se juntan las cajas, después la hoja se hace del alto que haga falta (como mínimo A4)
  const W = 210, M = 14, FILA = 7, pend = [];
  const $$ = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");   // la fuente del PDF no tiene "−"
  const corto = (t, w) => doc.splitTextToSize(String(t ?? ""), w)[0] || "";
  const altoDe = (filas, lineas) => 12 + (filas.length ? FILA * (filas.length + 1) + 2 : 0) + lineas.reduce((a, l) => a + (l[2] === "final" ? 10 : 7), 0) + 4;
  // cols: [título, ancho (0 = lo que sobra), a la derecha]; lineas: [texto, plata, "final" | "sub" | ""]
  const caja = (titulo, cols, filas, lineas = []) => pend.push([titulo, cols, filas, lineas]);
  let doc, y = M;
  const dibujar = (titulo, cols, filas, lineas) => {
    const ancho = W - 2 * M - 8, fijo = cols.reduce((a, c) => a + c[1], 0), ws = cols.map(c => c[1] || ancho - fijo), alto = altoDe(filas, lineas);
    doc.setDrawColor(210); doc.setLineWidth(.3); doc.roundedRect(M, y, W - 2 * M, alto, 3, 3);
    let yy = y + 9, x0 = M + 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(17); doc.text(titulo, x0, yy); yy += 4;
    if (filas.length) {
      const fila = (vals, bold, color) => { let x = x0; yy += FILA; doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(color);
        vals.forEach((v, i) => { const t = corto(v, ws[i] - 2); cols[i][2] ? doc.text(t, x + ws[i] - 1, yy - 2, { align: "right" }) : doc.text(t, x + 1, yy - 2); x += ws[i]; }); };
      doc.setFontSize(9); fila(cols.map(c => c[0]), true, 110); doc.setFontSize(10);
      filas.forEach(f => { doc.setDrawColor(230); doc.line(x0, yy, x0 + ancho, yy); fila(f, false, 30); });
      yy += 2;
    }
    lineas.forEach(([t, n, cls]) => {
      if (cls) { doc.setDrawColor(cls === "final" ? 30 : 200); doc.setLineWidth(cls === "final" ? .6 : .3); doc.line(x0, yy + 1, x0 + ancho, yy + 1); }
      yy += cls === "final" ? 10 : 7; doc.setFont("helvetica", cls ? "bold" : "normal"); doc.setFontSize(cls === "final" ? 12 : 10); doc.setTextColor(cls ? 17 : 60);
      doc.text(t, x0, yy - 2); doc.text($$(n), x0 + ancho, yy - 2, { align: "right" });
    });
    doc.setLineWidth(.3); y += alto + 5;
  };
  const tot = d.modoVentas === "total";
  caja("Vehículos por compañía", [["Cantidad", 24], ["Compañía", 0], ["Valor por auto", 38, 1], ["Total", 38, 1]],
    (d.ventas || []).map(f => [num(f.cant) || "", f.comp || "", $$(tot ? porAuto(f) : num(f.valor)), $$(SECC.ventas.total(f, d.modoVentas))]), [[`Total (${(d.ventas || []).reduce((a, f) => a + num(f.cant), 0)} autos)`, r.bruto, "sub"]]);
  caja("Gastos", [["Gasto", 0], ["Monto", 40, 1]], (d.gastos || []).map(f => [(f.nombre || "") + (f.retorno ? "  (retorno)" : ""), $$(num(f.monto))]), [["Total", r.gastos, "sub"]]);
  caja("Resumen", [], [], [["Total facturado", r.bruto], ["IVA 21%", -r.iva], ["IIBB 3,5%", -r.iibb], ["Neto", r.neto, "sub"], ["Gastos", -r.gastos], ...(r.retornos ? [["Retornos", r.retornos]] : []), ["Total final", r.final, "final"]]);
  if (d.reparto?.length) caja("Reparto", [["Persona", 0], ["%", 24, 1], ["Le toca", 40, 1]], d.reparto.map(f => [f.nombre || "", num(f.pct) + "%", $$(parte(f, r))]));
  // Cada persona: lo que le toca, debajo cada gasto (y cada retorno, solo si hay) y lo que queda; sin tabla aparte ni línea "Gastos"
  const itemsG = l => (l || []).map(g => [(g.nombre || "Sin nombre") + (g.retorno ? " (retorno)" : ""), g.retorno ? num(g.monto) : -num(g.monto)]);
  (d.reparto || []).forEach(f => {
    caja(`Gastos de ${f.nombre || "sin nombre"}`, [], [], [[`Le toca (${num(f.pct)}%)`, parte(f, r)], ...itemsG(f.gastos), ...(f.gastos2?.length ? [["Queda", queda(f, r), "sub"], ...itemsG(f.gastos2)] : []), ["Final", quedaFinal(f, r), "final"]]);
  });
  const H = Math.max(297, 20 + 2 * M + pend.reduce((a, [, , f, l]) => a + altoDe(f, l) + 5, 0));
  doc = new window.jspdf.jsPDF({ unit: "mm", format: [W, H] });
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(17); doc.text(`Cierre operativo · ${S.company?.name || ""}`, M, y + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100);
  doc.text(new Date().toLocaleDateString("es-AR"), M, y + 12); y += 20;
  pend.forEach(c => dibujar(...c));
  doc.save(`Cierre_${hoyISO()}.pdf`);
}

let unsub = null;
export function vistaCierre(view) {
  setTopbar({ title: "Cierre operativo", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="c-desc">${icon("download")}<span class="hide-sm">Descargar</span></button>` });
  if (!puedeVer("cierre")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const ref = doc(db, "companies", S.company.id, "cierre", "datos");
  const comps = [...new Set(activos().map(v => v.compania).filter(Boolean))].sort();
  let d = { ventas: [], gastos: [], reparto: [] }, remoto = null, tGuardar = null, pSel = 0;   // pSel: persona elegida en Gastos por persona
  const lista = k => k === "pg" ? (d.reparto[pSel].gastos ||= []) : k === "pg2" ? (d.reparto[pSel].gastos2 ||= []) : (d[k] ||= []);
  const deGente = k => k === "pg" || k === "pg2";
  view.innerHTML = `<div class="tec-page cierre-page"><datalist id="c-comps">${comps.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <datalist id="c-gente">${Object.values(S.company?.memberNames || {}).filter(Boolean).map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <div id="c-body"><div class="skeleton tall"></div></div></div>`;
  const body = $("#c-body", view);
  // Una sola hoja: cada sección con su subtotal y al final el resumen
  $("#c-desc").onclick = () => {
    const r = cuentas(d), neg = (...x) => Object.assign(x, { negrita: true }), filas = [];
    const sec = (titulo, l, fila, sub) => { filas.push(neg(titulo, "", "", "")); l.forEach(f => filas.push(fila(f))); filas.push(neg("Subtotal", "", "", sub), ["", "", "", ""]); };
    sec("VEHÍCULOS", d.ventas || [], f => [f.comp || "", num(f.cant), d.modoVentas === "total" ? porAuto(f) : num(f.valor), SECC.ventas.total(f, d.modoVentas)], r.bruto);
    sec("GASTOS", d.gastos || [], f => [f.nombre || "", "", num(f.monto), SECC.gastos.total(f)], r.gastos);
    sec("RETORNOS (GASTOS QUE VUELVEN)", gastosRet(d), f => [f.nombre || "", "", num(f.monto), num(f.monto)], r.retornos);
    const rep = (d.reparto || []).map(f => [f.nombre || "", num(f.pct) + "%", "", SECC.reparto.total(f, 0, r)]);
    filas.push(neg("RESUMEN", "", "", ""), ["Total facturado", "", "", r.bruto], ["IVA 21%", "", "", -r.iva], ["IIBB 3,5%", "", "", -r.iibb],
      ["Neto", "", "", r.neto], ["Gastos", "", "", -r.gastos], ["Retornos", "", "", r.retornos], neg("TOTAL FINAL", "", "", r.final), ...(rep.length ? [["", "", "", ""], neg("REPARTO", "", "", ""), ...rep] : []));
    (d.reparto || []).filter(f => f.gastos?.length).forEach(f => { filas.push(["", "", "", ""]);
      sec(`GASTOS DE ${(f.nombre || "SIN NOMBRE").toUpperCase()}`, f.gastos, g => [g.nombre || "", "", num(g.monto), num(g.monto)], gastosDe(f));
      filas.push(["Le toca", "", "", parte(f, r)], ["Gastos", "", "", -gastosDe(f)], ["Retornos", "", "", retDe(f)], neg(f.gastos2?.length ? "QUEDA" : "FINAL", "", "", queda(f, r))); });
    (d.reparto || []).filter(f => f.gastos2?.length).forEach(f => { filas.push(["", "", "", ""]);
      sec(`MÁS GASTOS DE ${(f.nombre || "SIN NOMBRE").toUpperCase()}`, f.gastos2, g => [g.nombre || "", "", num(g.monto), num(g.monto)], gastosDe(f, "gastos2"));
      filas.push(["Queda", "", "", queda(f, r)], ["Gastos", "", "", -gastosDe(f, "gastos2")], ["Retornos", "", "", retDe(f, "gastos2")], neg("FINAL", "", "", quedaFinal(f, r))); });
    const cols = [{ titulo: "CONCEPTO", ancho: 30 }, { titulo: "CANTIDAD", ancho: 16 }, { titulo: "VALOR", ancho: 18, tipo: "moneda" }, { titulo: "TOTAL", ancho: 20, tipo: "moneda" }];
    elegirDescarga("Cierre operativo", {
      excel: () => exportarExcel({ archivo: `Cierre_${hoyISO()}.xlsx`, hoja: "Cierre operativo", titulo: `${S.company?.name || "Desabollito"} · Cierre operativo`, columnas: cols.map((x, i) => ({ ...x, valor: f => f[i] })), filas }),
      // PDF: la misma página impresa (Guardar como PDF), con lo plegado abierto y sin botones (ver @media print)
      pdf: () => cierrePDF(d, r) });
  };

  const celda = (c, t, l, v, k) => t === "n" ? `<input data-c="${c}" aria-label="${l}" type="text" inputmode="decimal" class="num" data-plata value="${esc(v === "" || v == null ? "" : num(v).toLocaleString("es-AR", { maximumFractionDigits: 2 }))}">`
    : `<input data-c="${c}" aria-label="${l}" ${t === "c" ? `type="number" inputmode="numeric" min="0" step="any"` : `type="text" ${c === "comp" ? `list="c-comps"` : c === "nombre" && k === "reparto" ? `list="c-gente"` : ""}`} value="${esc(v ?? "")}">`;
  // Reparto va plegado (se recuerda si se abrió), con su total a la vista
  // Vehículos: se escribe el valor por auto (y se calcula el total) o el total facturado (y se calcula el valor por auto)
  const ANCHO = { c: "110px", n: "150px", t: "" };
  const tabla = k => { const s = SECC[k], plegable = k === "reparto", porTotal = k === "ventas" && d.modoVentas === "total";
    const modos = k === "ventas" ? `<div class="seg seg-sm">${[["auto", "Valor por auto"], ["total", "Total facturado"]].map(([m, l]) => `<button type="button" class="seg-btn ${(d.modoVentas || "auto") === m ? "on" : ""}" data-modo="${m}">${l}</button>`).join("")}</div>` : "";
    const gente = (d.reparto || []).map((f, i) => `<button type="button" class="seg-btn ${i === pSel ? "on" : ""}" data-persona="${i}">${esc(f.nombre || `Persona ${i + 1}`)}</button>`).join("");
    if (deGente(k)) { if (!d.reparto?.length) return k === "pg2" ? "" : `<section class="d-sec cierre-sec"><h3>${s.titulo}</h3><p class="muted small">Agregá personas en el reparto para anotarles gastos.</p></section>`;
      if (pSel >= d.reparto.length) pSel = 0; }
    // Más gastos va dentro de la caja de Gastos por persona, después de "Queda": sin caja propia y sin tabla hasta que tenga algo
    const titulo = s.titulo, suelto = k === "pg2", conTabla = !suelto || lista(k).length;
    return `${suelto ? "" : plegable ? `<details class="d-sec d-adic cierre-sec" data-plg="${k}" ${abiertos[k] ? "open" : ""}><summary><h3>${s.titulo}</h3><small class="muted" data-sub="${k}"></small></summary>`
      : `<section class="d-sec cierre-sec"><div class="cierre-head"><h3>${titulo}</h3>${modos}</div>${k === "pg" ? `<div class="seg seg-sm c-gente">${gente}</div>` : ""}`}
      ${conTabla ? `<div class="table-wrap"><table class="tbl tbl-cierre"><colgroup>${s.campos.map(([, t]) => `<col style="width:${ANCHO[t] || "auto"}">`).join("")}<col style="width:150px"><col style="width:${k === "gastos" || deGente(k) ? 84 : 44}px"></colgroup>
      <thead><tr>${s.campos.map(([, t, l]) => `<th class="${t === "n" ? "num" : ""}">${l}</th>`).join("")}<th class="num">Total</th><th></th></tr></thead>
      <tbody>${lista(k).map((f, i) => `<tr data-sec="${k}" data-i="${i}" class="${f.retorno ? "c-esret" : ""}">${s.campos.map(([c, t, l]) => porTotal && c === "valor" ? `<td class="num" data-pu></td>` : `<td>${celda(c, t, l, f[c], k)}</td>`).join("")}
        ${porTotal ? `<td>${celda("total", "n", "Total facturado", f.total)}</td>` : `<td class="num" data-tot></td>`}<td class="c-acc">${k === "gastos" || deGente(k) ? `<button type="button" class="icon-btn sm c-retbtn" data-retorno aria-pressed="${!!f.retorno}" aria-label="Marcar como retorno" title="${f.retorno ? "Es retorno: tocá para quitar" : "Marcar como retorno"}">${icon("rotate")}</button>` : ""}<button type="button" class="icon-btn sm danger" data-borrar aria-label="Borrar fila">${icon("trash")}</button></td></tr>`).join("")}
</tbody>
      <tfoot><tr>${k === "ventas" ? `<td data-cant></td><td colspan="${s.campos.length - 1}"></td>` : `<td colspan="${s.campos.length}"></td>`}<td class="num" data-sub="${k}"></td><td></td></tr></tfoot></table></div>` : ""}
      <button type="button" class="btn btn-ghost btn-sm" data-agregar="${k}">${icon("plus")}${s.agregar}</button>${deGente(k) ? `<div class="cierre-res" id="c-${k}-res"></div>` : ""}${k === "pg" ? tabla("pg2") : ""}${suelto ? "" : plegable ? "</details>" : "</section>"}`; };
  const linea = (txt, n, cls = "") => `<div class="cierre-linea ${cls}"><span>${txt}</span><b>${pesos(n)}</b></div>`;
  // Solo los números: no se repintan los campos, así no se pierde lo que se está escribiendo
  const totales = () => {
    const r = cuentas(d);
    body.querySelectorAll("tr[data-sec]").forEach(tr => { const f = lista(tr.dataset.sec)[tr.dataset.i], tot = $("[data-tot]", tr), pu = $("[data-pu]", tr);
      if (tot) tot.textContent = pesos(SECC[tr.dataset.sec].total(f, d.modoVentas, r));
      if (pu) pu.textContent = pesos(porAuto(f)); });
    const cant = $("[data-cant]", body); if (cant) cant.textContent = (d.ventas || []).reduce((a, f) => a + num(f.cant), 0);
    const pct = Math.round((d.reparto || []).reduce((a, f) => a + num(f.pct), 0) * 100) / 100;
    body.querySelectorAll("[data-sub]").forEach(td => { if (td.dataset.sub !== "reparto") return void (td.textContent = pesos({ ventas: r.bruto, gastos: r.gastos, pg: d.reparto[pSel] ? gastosDe(d.reparto[pSel]) : 0, pg2: d.reparto[pSel] ? gastosDe(d.reparto[pSel], "gastos2") : 0 }[td.dataset.sub]));
      td.textContent = pct === 100 ? "100%" : `${pct}% (tiene que dar 100%)`; td.classList.toggle("c-mal", pct !== 100); });
    $("#c-res", body).innerHTML = linea("Total facturado", r.bruto) + linea("IVA 21%", -r.iva) + linea("IIBB 3,5%", -r.iibb)
      + linea("Neto", r.neto, "sub") + linea("Gastos", -r.gastos) + (r.retornos ? linea("Retornos", r.retornos) : "") + linea("Total final", r.final, "final");
    // Los botones de cada persona siguen al nombre que se escribe en el reparto
    body.querySelectorAll("[data-persona]").forEach(b => { b.textContent = d.reparto[b.dataset.persona]?.nombre || `Persona ${+b.dataset.persona + 1}`; });
    const yo = d.reparto[pSel], pres = $("#c-pg-res", body), pres2 = $("#c-pg2-res", body);
    body.querySelectorAll("[data-nombre]").forEach(x => { x.textContent = yo?.nombre || `Persona ${pSel + 1}`; });
    if (yo && pres) pres.innerHTML = linea(`Le toca (${num(yo.pct)}%)`, parte(yo, r)) + linea("Gastos", -gastosDe(yo)) + (retDe(yo) ? linea("Retornos", retDe(yo)) : "") + (yo.gastos2?.length ? linea("Queda", queda(yo, r), "sub") : linea("Final", queda(yo, r), "final"));
    if (yo && pres2) pres2.innerHTML = !yo.gastos2?.length ? "" : linea("Más gastos", -gastosDe(yo, "gastos2")) + (retDe(yo, "gastos2") ? linea("Retornos", retDe(yo, "gastos2")) : "") + linea("Final", quedaFinal(yo, r), "final");
  };
  const pintar = () => { body.innerHTML = tabla("ventas") + tabla("gastos") + `<section class="d-sec cierre-sec"><h3>Resumen</h3><div class="cierre-res" id="c-res"></div></section>` + tabla("reparto") + tabla("pg"); totales(); };
  // shortcut: se guarda el documento entero (si dos editan a la vez gana el último); pasar a filas sueltas si se edita mucho en simultáneo
  const guardar = () => { clearTimeout(tGuardar); tGuardar = null; remoto = null; setDoc(ref, d).catch(e => toast(mensajeError(e), "error")); };
  const editando = () => body.contains(document.activeElement) && document.activeElement.matches("input, select");

  unsub?.();
  unsub = onSnapshot(ref, snap => {
    if (!document.body.contains(view) || location.hash !== "#/cierre") { unsub?.(); unsub = null; return; }
    if (snap.metadata.hasPendingWrites) return;   // el eco de lo propio
    remoto = { ventas: [], gastos: [], reparto: [], ...snap.data() };
    if (editando() || tGuardar) return;           // lo de otros se pinta al salir del campo
    d = remoto; remoto = null; pintar();
  }, e => { body.innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  body.addEventListener("input", e => {
    const c = e.target.dataset.c, tr = e.target.closest("tr[data-sec]"); if (!c || !tr) return;
    const f = lista(tr.dataset.sec)[tr.dataset.i], t = e.target.type;
    if (e.target.hasAttribute("data-plata")) f[c] = plata(e.target);
    else f[c] = t === "number" ? (e.target.value === "" ? "" : num(e.target.value)) : e.target.value;
    totales(); clearTimeout(tGuardar); tGuardar = setTimeout(guardar, 700);
  });
  body.addEventListener("toggle", e => { if (e.target.dataset?.plg) { abiertos[e.target.dataset.plg] = e.target.open; try { localStorage.setItem("cierreAbiertos", JSON.stringify(abiertos)); } catch {} } }, true);
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
    const per = e.target.closest("[data-persona]");
    if (per) { pSel = +per.dataset.persona; return pintar(); }
    const ret = e.target.closest("[data-retorno]");
    if (ret) { const tr = ret.closest("tr"), f = lista(tr.dataset.sec)[tr.dataset.i]; if (f.retorno) delete f.retorno; else f.retorno = true; guardar(); return pintar(); }
    const add = e.target.closest("[data-agregar]");
    if (add) { const k = add.dataset.agregar; lista(k).push({}); guardar(); pintar();
      return $(`tr[data-sec="${k}"][data-i="${lista(k).length - 1}"] input`, body)?.focus(); }
    const tr = e.target.closest("[data-borrar]")?.closest("tr"); if (!tr) return;
    const k = tr.dataset.sec, f = lista(k)[tr.dataset.i];
    if (Object.values(f).some(v => v !== "" && v !== 0 && !(Array.isArray(v) && !v.length)) && !(await confirmar({ title: "¿Borrar esta fila?", ok: "Borrar", danger: true }))) return;
    lista(k).splice(+tr.dataset.i, 1); guardar(); pintar();
  });
}
