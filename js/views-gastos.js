import { S, guardarGasto, borrarGasto, soyAdmin, mensajeError, buscarMiembro, guardarEtiquetasGasto } from "./data.js";
import { exportarExcel } from "./excel.js";
import { $, $$, esc, money, fechaCorta, hoyISO, icon, toast, openSheet, confirmar, debounce, busy, elegirDescarga, marcarError, pedirTexto } from "./ui.js";
import { setTopbar } from "./shell.js";
import { gastosPDF } from "./pdf.js";

export const CATEGORIAS = [
  { key: "herramientas", label: "Herramientas", color: "#4f8ff7" },
  { key: "repuestos", label: "Repuestos", color: "#9b7bf2" },
  { key: "alojamiento", label: "Estadía", color: "#ef7d57" },
  { key: "comida", label: "Comida", color: "#d9559b" },
  { key: "sueldos", label: "Sueldos", color: "#0ea5a4" },
  { key: "otros", label: "Otros", color: "#7a8699" }
];
// Categorías que ya no se ofrecen pero pueden existir en gastos viejos
const ANTERIORES = [
  { key: "combustible", label: "Combustible", color: "#e0a526" },
  { key: "viaticos", label: "Viáticos", color: "#22b07d" }
];
// Etiquetas propias del operativo (se crean desde el formulario del gasto)
const propias = () => S.company?.gastoCats || [];
const catMap = () => Object.fromEntries([...CATEGORIAS, ...ANTERIORES, ...propias()].map(c => [c.key, c]));
const COLORES_ETQ = ["#e5484d", "#22b07d", "#e0a526", "#4f8ff7", "#9b7bf2", "#0ea5a4", "#d9559b", "#ef7d57", "#5f6b7a", "#84cc16"];
const METODOS = ["Efectivo", "Transferencia", "Tarjeta", "Dólares"];
const esUSD = g => g.moneda === "USD";
export const montoTxt = g => esUSD(g) ? "US$ " + Number(g.monto || 0).toLocaleString("es-AR") : (money(g.monto) || "$0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const G = { y: new Date().getFullYear(), m: new Date().getMonth(), q: "", cat: null, metodo: null, orden: "fecha", dir: -1 };
const claveMes = () => `${G.y}-${String(G.m + 1).padStart(2, "0")}`;

const ORDEN_G = [["fecha", "Fecha"], ["monto", "Monto"], ["categoria", "Categoría"], ["metodo", "Método"]];
function ordenarG(lista) {
  const clave = g => G.orden === "monto" ? Number(g.monto || 0) : G.orden === "categoria" ? (catMap()[g.categoria]?.label || "")
    : G.orden === "metodo" ? (g.metodo || "") : (g.fecha || "") + (g.createdAt?.seconds || "");
  return [...lista].sort((a, b) => { const x = clave(a), y = clave(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es")) * G.dir; });
}
function delMes() {
  const q = G.q.toLowerCase();
  return ordenarG(S.gastos.filter(g => (g.fecha || "").startsWith(claveMes())
    && (!G.cat || g.categoria === G.cat)
    && (!G.metodo || (g.metodo || "Efectivo") === G.metodo)
    && (!q || [g.concepto, catMap()[g.categoria]?.label, g.metodo, g.tecnicoNombre, g.vehiculoTxt, g.createdByName]
      .some(x => (x || "").toLowerCase().includes(q)))));
}

export function vistaGastos(view) {
  setTopbar({
    title: "Gastos", sub: S.company?.name,
    actions: `<button class="icon-btn filtro-btn ${G.cat || G.metodo ? "activo" : ""}" id="g-filtros" aria-label="Filtros" title="Filtros">${icon("filter")}</button><button class="icon-btn filtro-btn ${G.orden !== "fecha" || G.dir !== -1 ? "activo" : ""}" id="g-orden" aria-label="Ordenar" title="Ordenar">${icon("sort")}</button><button class="btn btn-ghost btn-sm" id="g-dl" aria-label="Descargar">${icon("download")}<span class="hide-sm">Descargar</span></button>`
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
      const c = catMap()[k] || catMap().otros;
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
      const c = catMap()[g.categoria] || catMap().otros;
      return `<button class="g-row" data-id="${g.id}" style="--c:${c.color}">
        <span class="g-dot"></span>
        <span class="g-main"><strong>${esc(g.concepto || c.label)}</strong>
          <small>${[c.label, g.tecnicoNombre || g.vehiculoTxt].filter(Boolean).map(esc).join(" · ")}</small></span>
        <span class="g-side"><span class="g-monto">${g.metodo ? `<small>${esc(g.metodo)}</small>` : ""}<strong class="${esUSD(g) ? "usd" : ""}">${montoTxt(g)}</strong></span>
          <small>${fechaCorta(g.fecha)}</small></span>
        ${g._pending ? `<span class="sync" title="Pendiente de sincronizar"></span>` : ""}
      </button>`;
    }).join("");
  };

  $("#g-prev", view).onclick = () => { if (--G.m < 0) { G.m = 11; G.y--; } pintar(); };
  $("#g-next", view).onclick = () => { if (++G.m > 11) { G.m = 0; G.y++; } pintar(); };
  $("#g-q", view).oninput = debounce(e => { G.q = e.target.value; pintar(); }, 120);
  // Ordenar: tocar un criterio lo elige; tocarlo de nuevo invierte el orden
  $("#g-orden")?.addEventListener("click", () => {
    const hoja = openSheet({ title: "Ordenar por", body: `<div class="p-chips" id="go-chips"></div>` });
    const chips = () => {
      $("#go-chips", hoja.el).innerHTML = ORDEN_G.map(([k, t]) => `<button type="button" class="p-chip ${G.orden === k ? "on" : ""}" data-o="${k}">${t}${G.orden === k ? `<i>${G.dir > 0 ? "↑" : "↓"}</i>` : ""}</button>`).join("");
      $("#g-orden")?.classList.toggle("activo", G.orden !== "fecha" || G.dir !== -1);
    };
    chips();
    hoja.el.addEventListener("click", e => {
      const b = e.target.closest("[data-o]"); if (!b) return;
      if (G.orden === b.dataset.o) G.dir *= -1; else { G.orden = b.dataset.o; G.dir = ["fecha", "monto"].includes(G.orden) ? -1 : 1; }
      chips(); pintar();
    });
  });

  // Filtros: categoría y método de pago (con la cantidad de gastos del mes)
  $("#g-filtros")?.addEventListener("click", () => {
    const hoja = openSheet({ title: "Filtros", body: `<div class="stack filtros">
      <span class="muted small">Categoría</span><div class="p-chips" id="gf-cat"></div>
      <span class="muted small">Método de pago</span><div class="p-chips" id="gf-met"></div>
      <button class="btn btn-ghost btn-sm" id="gf-reset">Quitar filtros</button></div>` });
    const chips = () => {
      const mes = S.gastos.filter(g => (g.fecha || "").startsWith(claveMes()));
      const cats = [...CATEGORIAS, ...propias()].filter(c => mes.some(g => g.categoria === c.key) || G.cat === c.key);
      $("#gf-cat", hoja.el).innerHTML = cats.map(c => `<button type="button" class="p-chip ${G.cat === c.key ? "on" : ""}" data-cat="${esc(c.key)}" style="--c:${c.color}"><i class="f-dot"></i>${esc(c.label)} <b class="f-n">${mes.filter(g => g.categoria === c.key).length}</b></button>`).join("") || `<span class="muted small">Sin gastos este mes</span>`;
      $("#gf-met", hoja.el).innerHTML = METODOS.map(m => `<button type="button" class="p-chip ${G.metodo === m ? "on" : ""}" data-met="${m}">${m} <b class="f-n">${mes.filter(g => (g.metodo || "Efectivo") === m).length}</b></button>`).join("");
      $("#g-filtros")?.classList.toggle("activo", !!(G.cat || G.metodo));
    };
    chips();
    hoja.el.addEventListener("click", e => {
      const c = e.target.closest("[data-cat]"), m = e.target.closest("[data-met]");
      if (c) G.cat = G.cat === c.dataset.cat ? null : c.dataset.cat;
      else if (m) G.metodo = G.metodo === m.dataset.met ? null : m.dataset.met;
      else if (e.target.closest("#gf-reset")) { G.cat = null; G.metodo = null; }
      else return;
      chips(); pintar();
    });
  });
  $("#g-bars", view).onclick = e => { const b = e.target.closest("[data-cat]"); if (b) { G.cat = G.cat === b.dataset.cat ? null : b.dataset.cat; pintar(); } };
  $("#g-list", view).onclick = e => { const r = e.target.closest("[data-id]"); if (r) formGasto(S.gastos.find(g => g.id === r.dataset.id)); };
  $("#g-nuevo", view).onclick = () => formGasto();

  const excel = async () => {
    const lista = delMes();
    const pesos = lista.filter(g => !esUSD(g)).reduce((s, g) => s + Number(g.monto || 0), 0);
    const usd = lista.filter(esUSD).reduce((s, g) => s + Number(g.monto || 0), 0);
    try {
      await exportarExcel({
        archivo: `Gastos_${claveMes()}.xlsx`, hoja: "Gastos",
        titulo: `${S.company?.name || "Desabollito"} · Gastos de ${MESES[G.m]} ${G.y}`,
        columnas: [
          { titulo: "Fecha", ancho: 13, tipo: "fecha", valor: g => g.fecha },
          { titulo: "Concepto", ancho: 30, valor: g => g.concepto },
          { titulo: "Categoría", ancho: 15, valor: g => catMap()[g.categoria]?.label },
          { titulo: "Método de pago", ancho: 16, valor: g => g.metodo },
          { titulo: "Técnico", ancho: 20, valor: g => g.tecnicoNombre },
          { titulo: "Monto en pesos", ancho: 16, tipo: "moneda", valor: g => esUSD(g) ? null : g.monto },
          { titulo: "Monto en dólares", ancho: 17, tipo: "usd", valor: g => esUSD(g) ? g.monto : null },
          { titulo: "Cargado por", ancho: 18, valor: g => g.createdByName }
        ],
        filas: lista.slice().sort((x, y) => (x.fecha || "").localeCompare(y.fecha || "")),
        total: [{ etiqueta: "Total en pesos", valor: pesos }, ...(usd ? [{ etiqueta: "Total en dólares", valor: usd, tipo: "usd" }] : [])]
      });
    } catch (err) { toast(err.message, "error"); }
  };
  const pdf = () => gastosPDF(delMes(), S.company, `${MESES[G.m]} ${G.y}`, catMap()).save(`Gastos_${claveMes()}.pdf`);
  $("#g-dl").onclick = () => {
    if (!delMes().length) return toast("No hay gastos para descargar", "warning");
    elegirDescarga(`Gastos de ${MESES[G.m]} ${G.y}`, { excel, pdf });
  };

  pintar();
  return { soloLista: pintar };
}

function chipsCat(cat, puedeEditar) {
  return [...CATEGORIAS, ...propias()].map(c => `
    <button type="button" class="chip ${cat === c.key ? "on" : ""}" data-c="${esc(c.key)}" style="--c:${c.color}">${esc(c.label)}</button>`).join("")
    + (puedeEditar ? `<button type="button" class="chip chip-nueva" data-nueva>${icon("plus")}Etiqueta</button>` : "");
}

// Crea una etiqueta del operativo y devuelve su clave (si ya existe con ese nombre, usa esa)
async function crearEtiquetaGasto(nombre) {
  const todas = [...CATEGORIAS, ...propias()];
  const igual = todas.find(c => c.label.toLowerCase() === nombre.toLowerCase());
  if (igual) return igual.key;
  const key = "e_" + nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 30) + "_" + Date.now().toString(36).slice(-4);
  const color = COLORES_ETQ[propias().length % COLORES_ETQ.length];
  await guardarEtiquetasGasto([...propias(), { key, label: nombre.slice(0, 30), color }]);
  return key;
}

// Renombrar o borrar las etiquetas propias del operativo (las fijas no se tocan)
function modificarEtiquetas(alCambiar) {
  const s = openSheet({ title: "Etiquetas de gastos", body: `<div class="stack" id="etq-lista"></div>` });
  const pintar = () => {
    const lista = propias();
    $("#etq-lista", s.el).innerHTML = lista.length ? `<ul class="adm-list">${lista.map(c => `
      <li><span class="etq-nom"><i class="g-dot" style="--c:${c.color}"></i>${esc(c.label)}</span>
        <span><button type="button" class="icon-btn sm" data-ren="${esc(c.key)}" aria-label="Renombrar">${icon("edit")}</button>
        <button type="button" class="icon-btn sm danger" data-del="${esc(c.key)}" aria-label="Borrar">${icon("trash")}</button></span></li>`).join("")}</ul>
      <p class="muted small">Las categorías fijas (Herramientas, Repuestos, etc.) no se pueden cambiar.</p>`
      : `<p class="muted">Todavía no hay etiquetas propias. Creá una con “+ Etiqueta” al cargar un gasto.</p>`;
  };
  pintar();
  s.el.addEventListener("click", async e => {
    const ren = e.target.closest("[data-ren]"), del = e.target.closest("[data-del]");
    if (!ren && !del) return;
    const key = (ren || del).dataset[ren ? "ren" : "del"], c = propias().find(x => x.key === key);
    if (!c) return;
    try {
      if (ren) {
        const nombre = await pedirTexto({ title: "Renombrar etiqueta", label: "Nombre", value: c.label, ok: "Guardar" });
        if (!nombre?.trim() || nombre.trim() === c.label) return;
        await guardarEtiquetasGasto(propias().map(x => x.key === key ? { ...x, label: nombre.trim().slice(0, 30) } : x));
      } else {
        const usados = S.gastos.filter(g => g.categoria === key).length;
        if (!(await confirmar({ title: `¿Borrar “${c.label}”?`, message: usados ? `Hay ${usados} ${usados === 1 ? "gasto" : "gastos"} con esta etiqueta: van a pasar a “Otros”.` : "", ok: "Borrar", danger: true }))) return;
        await guardarEtiquetasGasto(propias().filter(x => x.key !== key));
      }
      pintar(); alCambiar?.(); toast("Etiquetas actualizadas", "success");
    } catch (err) { toast(mensajeError(err), "error"); }
  });
}

// Hoja para cargar o editar un gasto
export function formGasto(g = null) {
  const puedeBorrar = g && (soyAdmin() || g.createdBy === S.user.uid);
  const puedeEditar = !g || puedeBorrar;
  let cat = g?.categoria || "herramientas";
  const miembros = Object.values(S.company?.memberNames || {}).sort();
  const s = openSheet({
    title: g ? "Editar gasto" : "Nuevo gasto",
    body: `<form class="stack" id="gf">
      <label class="field"><span>Monto</span>
        <span class="money-in big"><i id="g-sim">${g && esUSD(g) ? "US$" : "$"}</i><input name="monto" inputmode="numeric" required placeholder="0"
          value="${g?.monto ? Number(g.monto).toLocaleString("es-AR") : ""}" ${puedeEditar ? "" : "disabled"}></span></label>
      <div class="field"><span>Categoría</span>
        <div class="cat-pick" id="cat">${chipsCat(cat, puedeEditar)}</div></div>
      <label class="field"><span>Concepto</span>
        <input name="concepto" value="${esc(g?.concepto)}" placeholder="Ej: Cinta, otros" maxlength="80"></label>
      <div class="grid-2">
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${g?.fecha || hoyISO()}" required></label>
        <label class="field"><span>Método de pago</span>
          <select name="metodo">${METODOS.map(m => `<option ${g?.metodo === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Técnico (opcional)</span>
        <input name="tecnico" list="dl-tec" value="${esc(g?.tecnicoNombre)}" placeholder="Nombre o @usuario" autocomplete="off" autocapitalize="none">
        <datalist id="dl-tec">${miembros.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
      ${puedeEditar ? `<button class="btn btn-primary btn-block btn-lg">${g ? "Guardar cambios" : "Guardar gasto"}</button>` : `<p class="muted small center">Solo quien lo cargó o un administrador puede editarlo.</p>`}
      <div class="g-form-links">
        ${puedeBorrar ? `<button type="button" class="link-btn danger" id="g-borrar">${icon("trash")}Eliminar gasto</button>` : ""}
        <button type="button" class="link-btn" id="g-etiquetas">${icon("edit")}Modificar etiquetas</button>
      </div>
    </form>`
  });
  const f = $("#gf", s.el);
  $("#g-etiquetas", s.el).onclick = () => modificarEtiquetas(() => { $("#cat", s.el).innerHTML = chipsCat(cat, puedeEditar); });
  f.metodo.addEventListener("change", () => { $("#g-sim", s.el).textContent = f.metodo.value === "Dólares" ? "US$" : "$"; });
  f.monto.addEventListener("input", e => {
    const d = e.target.value.replace(/\D/g, ""); e.target.value = d ? Number(d).toLocaleString("es-AR") : "";
  });
  $("#cat", s.el).onclick = async e => {
    if (!puedeEditar) return;
    if (e.target.closest("[data-nueva]")) {
      const nombre = await pedirTexto({ title: "Nueva etiqueta", label: "Nombre de la etiqueta", placeholder: "Ej: Peajes", ok: "Crear" });
      if (!nombre?.trim()) return;
      try { cat = await crearEtiquetaGasto(nombre.trim()); $("#cat", s.el).innerHTML = chipsCat(cat, true); toast("Etiqueta creada", "success"); }
      catch (err) { toast(mensajeError(err), "error"); }
      return;
    }
    const b = e.target.closest("[data-c]"); if (!b) return;
    cat = b.dataset.c; $$("#cat .chip", s.el).forEach(x => x.classList.toggle("on", x === b));
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const monto = Number(f.monto.value.replace(/\D/g, "")) || 0;
    if (!monto) { toast("Poné el monto del gasto", "warning"); marcarError(f.monto); return; }
    // Técnico: si coincide con alguien del operativo (por nombre o @usuario) queda vinculado a su cuenta
    const texto = f.tecnico.value.trim();
    let tec = null;
    if (texto) { try { tec = await buscarMiembro(texto); } catch { tec = null; } }
    const data = {
      monto, categoria: cat, concepto: f.concepto.value.trim(), fecha: f.fecha.value || hoyISO(),
      metodo: f.metodo.value, moneda: f.metodo.value === "Dólares" ? "USD" : "ARS",
      tecnicoUid: tec?.uid || null, tecnicoNombre: tec?.name || texto
    };
    guardarGasto(g?.id || null, data).catch(err => toast("No se guardó: " + mensajeError(err), "error"));
    toast(g ? "Gasto actualizado" : `Gasto de ${montoTxt(data)} guardado`, "success");
    // mostrar el mes del gasto recién cargado
    const [yy, mm] = data.fecha.split("-").map(Number); G.y = yy; G.m = mm - 1;
    s.close();
  };
  $("#g-borrar", s.el)?.addEventListener("click", async () => {
    if (await confirmar({ title: "¿Eliminar este gasto?", message: `${g.concepto || catMap()[g.categoria]?.label} · ${montoTxt(g)}`, ok: "Eliminar", danger: true })) {
      borrarGasto(g.id).catch(err => toast(mensajeError(err), "error"));
      s.close();
    }
  });
}
