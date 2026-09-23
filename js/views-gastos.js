import { S, guardarGasto, borrarGasto, soyAdmin, mensajeError, buscarMiembro } from "./data.js";
import { exportarExcel } from "./excel.js";
import { $, $$, esc, money, fechaCorta, hoyISO, icon, toast, openSheet, confirmar, debounce, busy } from "./ui.js";
import { setTopbar } from "./shell.js";
import { gastosPDF } from "./pdf.js";

export const CATEGORIAS = [
  { key: "combustible", label: "Combustible", color: "#e0a526" },
  { key: "herramientas", label: "Herramientas", color: "#4f8ff7" },
  { key: "repuestos", label: "Repuestos", color: "#9b7bf2" },
  { key: "viaticos", label: "Viáticos", color: "#22b07d" },
  { key: "alojamiento", label: "Alojamiento", color: "#ef7d57" },
  { key: "comida", label: "Comida", color: "#d9559b" },
  { key: "sueldos", label: "Sueldos", color: "#0ea5a4" },
  { key: "otros", label: "Otros", color: "#7a8699" }
];
const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.key, c]));
const METODOS = ["Efectivo", "Transferencia", "Dólares"];
const esUSD = g => g.moneda === "USD";
export const montoTxt = g => esUSD(g) ? "US$ " + Number(g.monto || 0).toLocaleString("es-AR") : (money(g.monto) || "$0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const G = { y: new Date().getFullYear(), m: new Date().getMonth(), q: "", cat: null };
const claveMes = () => `${G.y}-${String(G.m + 1).padStart(2, "0")}`;

function delMes() {
  const q = G.q.toLowerCase();
  return S.gastos.filter(g => (g.fecha || "").startsWith(claveMes())
    && (!G.cat || g.categoria === G.cat)
    && (!q || [g.concepto, CAT[g.categoria]?.label, g.metodo, g.tecnicoNombre, g.vehiculoTxt, g.createdByName, g.nota]
      .some(x => (x || "").toLowerCase().includes(q))));
}

export function vistaGastos(view) {
  setTopbar({
    title: "Gastos", sub: S.company?.name,
    actions: `<button class="btn btn-ghost btn-sm" id="g-csv">${icon("download")}<span class="hide-sm">Excel</span></button>
              <button class="btn btn-ghost btn-sm" id="g-pdf">${icon("file")}<span class="hide-sm">PDF</span></button>`
  });

  view.innerHTML = `
  <div class="gastos-page">
    <section class="g-summary card">
      <div class="g-month">
        <button class="icon-btn" id="g-prev" aria-label="Mes anterior">${icon("back")}</button>
        <h2 id="g-mes"></h2>
        <button class="icon-btn" id="g-next" aria-label="Mes siguiente">${icon("next")}</button>
      </div>
      <div class="g-total"><small>Total del mes</small><strong id="g-total"></strong>
        <span id="g-usd" class="g-usd"></span><span id="g-count" class="muted small"></span></div>
      <div class="g-bars" id="g-bars"></div>
      <button class="btn btn-primary hide-mobile" id="g-nuevo">${icon("plus")}Agregar gasto</button>
    </section>
    <section class="g-list-wrap">
      <label class="search">${icon("search")}<input type="search" id="g-q" placeholder="Buscar concepto, categoría, técnico…" value="${esc(G.q)}"></label>
      <div id="g-list" class="g-list"></div>
    </section>
  </div>`;

  const pintar = () => {
    $("#g-mes", view).textContent = `${MESES[G.m]} ${G.y}`;
    const todosMes = S.gastos.filter(g => (g.fecha || "").startsWith(claveMes()));
    const total = todosMes.filter(g => !esUSD(g)).reduce((s, g) => s + Number(g.monto || 0), 0);
    const totalUSD = todosMes.filter(esUSD).reduce((s, g) => s + Number(g.monto || 0), 0);
    $("#g-total", view).textContent = money(total) || "$0";
    $("#g-usd", view).textContent = totalUSD ? `+ US$ ${totalUSD.toLocaleString("es-AR")} en dólares` : "";
    $("#g-count", view).textContent = `${todosMes.length} ${todosMes.length === 1 ? "gasto" : "gastos"}`;

    // Reparto por categoría (tocar una filtra la lista)
    const porCat = {};
    todosMes.filter(g => !esUSD(g)).forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.monto || 0); });
    const filas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    const max = filas[0]?.[1] || 1;
    $("#g-bars", view).innerHTML = filas.length ? filas.map(([k, v]) => {
      const c = CAT[k] || CAT.otros;
      return `<button class="g-bar ${G.cat === k ? "on" : ""} ${G.cat && G.cat !== k ? "dim" : ""}" data-cat="${k}" style="--c:${c.color}">
        <span class="g-bar-l">${c.label}</span>
        <span class="g-bar-track"><i style="width:${Math.max(4, v / max * 100)}%"></i></span>
        <span class="g-bar-v">${money(v)}</span></button>`;
    }).join("") : `<p class="muted small">Sin gastos cargados en este mes.</p>`;

    const lista = delMes();
    const box = $("#g-list", view);
    if (S.loadingGastos) { box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`; return; }
    if (!lista.length) {
      box.innerHTML = `<div class="empty small"><p>${todosMes.length ? "Ningún gasto coincide con el filtro." : "Todavía no hay gastos en " + MESES[G.m] + "."}</p>
        ${G.cat || G.q ? `<button class="btn btn-ghost" id="g-limpiar">Limpiar filtros</button>` : ""}</div>`;
      $("#g-limpiar", box)?.addEventListener("click", () => { G.cat = null; G.q = ""; $("#g-q", view).value = ""; pintar(); });
      return;
    }
    box.innerHTML = lista.map(g => {
      const c = CAT[g.categoria] || CAT.otros;
      return `<button class="g-row" data-id="${g.id}" style="--c:${c.color}">
        <span class="g-dot"></span>
        <span class="g-main"><strong>${esc(g.concepto || c.label)}</strong>
          <small>${[c.label, g.metodo, g.tecnicoNombre || g.vehiculoTxt].filter(Boolean).map(esc).join(" · ")}</small></span>
        <span class="g-side"><strong class="${esUSD(g) ? "usd" : ""}">${montoTxt(g)}</strong>
          <small>${fechaCorta(g.fecha)}${S.company?.members?.length > 1 ? " · " + esc((g.createdByName || "").split(" ")[0]) : ""}</small></span>
        ${g._pending ? `<span class="sync" title="Pendiente de sincronizar"></span>` : ""}
      </button>`;
    }).join("");
  };

  $("#g-prev", view).onclick = () => { if (--G.m < 0) { G.m = 11; G.y--; } pintar(); };
  $("#g-next", view).onclick = () => { if (++G.m > 11) { G.m = 0; G.y++; } pintar(); };
  $("#g-q", view).oninput = debounce(e => { G.q = e.target.value; pintar(); }, 120);
  $("#g-bars", view).onclick = e => { const b = e.target.closest("[data-cat]"); if (b) { G.cat = G.cat === b.dataset.cat ? null : b.dataset.cat; pintar(); } };
  $("#g-list", view).onclick = e => { const r = e.target.closest("[data-id]"); if (r) formGasto(S.gastos.find(g => g.id === r.dataset.id)); };
  $("#g-nuevo", view).onclick = () => formGasto();

  $("#g-csv").onclick = async e => {
    const lista = delMes();
    if (!lista.length) return toast("No hay gastos para exportar", "warning");
    const b = e.currentTarget; busy(b, true, "Armando…");
    const pesos = lista.filter(g => !esUSD(g)).reduce((s, g) => s + Number(g.monto || 0), 0);
    const usd = lista.filter(esUSD).reduce((s, g) => s + Number(g.monto || 0), 0);
    try {
      await exportarExcel({
        archivo: `Gastos_${claveMes()}.xlsx`, hoja: "Gastos",
        titulo: `${S.company?.name || "Desabollito"} · Gastos de ${MESES[G.m]} ${G.y}`,
        columnas: [
          { titulo: "Fecha", ancho: 13, tipo: "fecha", valor: g => g.fecha },
          { titulo: "Concepto", ancho: 30, valor: g => g.concepto },
          { titulo: "Categoría", ancho: 15, valor: g => CAT[g.categoria]?.label },
          { titulo: "Método de pago", ancho: 16, valor: g => g.metodo },
          { titulo: "Técnico", ancho: 20, valor: g => g.tecnicoNombre },
          { titulo: "Monto en pesos", ancho: 16, tipo: "moneda", valor: g => esUSD(g) ? null : g.monto },
          { titulo: "Monto en dólares", ancho: 17, tipo: "usd", valor: g => esUSD(g) ? g.monto : null },
          { titulo: "Cargado por", ancho: 18, valor: g => g.createdByName },
          { titulo: "Nota", ancho: 32, valor: g => g.nota }
        ],
        filas: lista.slice().sort((x, y) => (x.fecha || "").localeCompare(y.fecha || "")),
        total: [{ etiqueta: "Total en pesos", valor: pesos }, ...(usd ? [{ etiqueta: "Total en dólares", valor: usd, tipo: "usd" }] : [])]
      });
    } catch (err) { toast(err.message, "error"); }
    finally { busy(b, false); }
  };
  $("#g-pdf").onclick = () => {
    const lista = delMes();
    if (!lista.length) return toast("No hay gastos para exportar", "warning");
    gastosPDF(lista, S.company, `${MESES[G.m]} ${G.y}`, CAT).save(`Gastos_${claveMes()}.pdf`);
  };

  pintar();
  return { soloLista: pintar };
}

// Hoja para cargar o editar un gasto
export function formGasto(g = null) {
  const puedeBorrar = g && (soyAdmin() || g.createdBy === S.user.uid);
  const puedeEditar = !g || puedeBorrar;
  let cat = g?.categoria || "combustible";
  const miembros = Object.values(S.company?.memberNames || {}).sort();
  const s = openSheet({
    title: g ? "Editar gasto" : "Nuevo gasto",
    body: `<form class="stack" id="gf">
      <label class="field"><span>Monto</span>
        <span class="money-in big"><i id="g-sim">${g && esUSD(g) ? "US$" : "$"}</i><input name="monto" inputmode="numeric" required placeholder="0"
          value="${g?.monto ? Number(g.monto).toLocaleString("es-AR") : ""}" ${puedeEditar ? "" : "disabled"}></span></label>
      <div class="field"><span>Categoría</span>
        <div class="cat-pick" id="cat">${CATEGORIAS.map(c => `
          <button type="button" class="chip ${cat === c.key ? "on" : ""}" data-c="${c.key}" style="--c:${c.color}">${c.label}</button>`).join("")}</div></div>
      <label class="field"><span>Concepto</span>
        <input name="concepto" value="${esc(g?.concepto)}" placeholder="Ej: Nafta camioneta, varillas nuevas" maxlength="80"></label>
      <div class="grid-2">
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${g?.fecha || hoyISO()}" required></label>
        <label class="field"><span>Método de pago</span>
          <select name="metodo">${METODOS.map(m => `<option ${g?.metodo === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Técnico (opcional)</span>
        <input name="tecnico" list="dl-tec" value="${esc(g?.tecnicoNombre)}" placeholder="Nombre o @usuario" autocomplete="off" autocapitalize="none">
        <datalist id="dl-tec">${miembros.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
      <label class="field"><span>Nota</span><textarea name="nota" rows="2" placeholder="Detalles adicionales">${esc(g?.nota)}</textarea></label>
      ${puedeEditar ? `<button class="btn btn-primary btn-block btn-lg">${g ? "Guardar cambios" : "Guardar gasto"}</button>` : `<p class="muted small center">Solo quien lo cargó o un administrador puede editarlo.</p>`}
      ${puedeBorrar ? `<button type="button" class="link-btn danger" id="g-borrar">${icon("trash")}Eliminar gasto</button>` : ""}
    </form>`
  });
  const f = $("#gf", s.el);
  f.metodo.addEventListener("change", () => { $("#g-sim", s.el).textContent = f.metodo.value === "Dólares" ? "US$" : "$"; });
  f.monto.addEventListener("input", e => {
    const d = e.target.value.replace(/\D/g, ""); e.target.value = d ? Number(d).toLocaleString("es-AR") : "";
  });
  $("#cat", s.el).onclick = e => {
    const b = e.target.closest("[data-c]"); if (!b || !puedeEditar) return;
    cat = b.dataset.c; $$("#cat .chip", s.el).forEach(x => x.classList.toggle("on", x === b));
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const monto = Number(f.monto.value.replace(/\D/g, "")) || 0;
    if (!monto) { toast("Poné el monto del gasto", "warning"); f.monto.focus(); return; }
    // Técnico: si coincide con alguien del operativo (por nombre o @usuario) queda vinculado a su cuenta
    const texto = f.tecnico.value.trim();
    let tec = null;
    if (texto) { try { tec = await buscarMiembro(texto); } catch { tec = null; } }
    const data = {
      monto, categoria: cat, concepto: f.concepto.value.trim(), fecha: f.fecha.value || hoyISO(),
      metodo: f.metodo.value, moneda: f.metodo.value === "Dólares" ? "USD" : "ARS", nota: f.nota.value.trim(),
      tecnicoUid: tec?.uid || null, tecnicoNombre: tec?.name || texto
    };
    guardarGasto(g?.id || null, data).catch(err => toast("No se guardó: " + mensajeError(err), "error"));
    toast(g ? "Gasto actualizado" : `Gasto de ${montoTxt(data)} guardado`, "success");
    // mostrar el mes del gasto recién cargado
    const [yy, mm] = data.fecha.split("-").map(Number); G.y = yy; G.m = mm - 1;
    s.close();
  };
  $("#g-borrar", s.el)?.addEventListener("click", async () => {
    if (await confirmar({ title: "¿Eliminar este gasto?", message: `${g.concepto || CAT[g.categoria]?.label} · ${montoTxt(g)}`, ok: "Eliminar", danger: true })) {
      borrarGasto(g.id).catch(err => toast(mensajeError(err), "error"));
      s.close();
    }
  });
  if (!g) setTimeout(() => f.monto.focus(), 80);
}
