import { BOT_API } from "./config.js";
import { botonesFotos, conectarFotos } from "./camara.js";
import {
  S, activos, getVehiculo, guardarVehiculo, actualizarVehiculo, cambiarEstado, moverAPapelera,
  solicitarEliminacion, cargadoPor, esDeWhatsApp, puedoEditar, esMioV, crearSolicitud, yaPedi,
  nuevoIdVehiculo, soyAdmin, mensajeError
} from "./data.js";
import { ESTADOS, ESTADO, SECUENCIA, PIEZA, ORDEN_PIEZAS, estadoActual, piezasMarcadas } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet,
  confirmar, busy, debounce, marcarError, horaDe } from "./ui.js";
import { carMapSVG, montarMapa } from "./carmap.js";
import { montar3D } from "./car3d.js";
import { subir, comprimir, borrarConToken, thumb, grande, cloudinaryListo } from "./media.js";
import { presupuestoPDF, nombreArchivo } from "./pdf.js";
import { armarZip } from "./zip.js";
import { setTopbar, go, esAncho } from "./shell.js";

// Filtros de la lista (se conservan al navegar)
const F = { estado: "todos", q: "", mios: false, orden: "fecha", dir: -1, grado: null, repuestos: null, pintura: null }; // grado: null = todos, 0 = sin grado
const ORDENES = [["fecha", "Fecha"], ["patente", "Patente"], ["modelo", "Modelo"], ["estado", "Estado"]];
function ordenar(lista) {
  if (F.orden === "fecha" && F.dir === -1) return lista;   // ya viene ordenada por fecha, la más nueva arriba
  const clave = v => F.orden === "fecha" ? (v.fechas?.peritado || "") : F.orden === "estado" ? String(SECUENCIA.indexOf(estadoActual(v)) + 10)
    : String(v[F.orden] || "").toLowerCase();
  return [...lista].sort((a, b) => clave(a).localeCompare(clave(b), "es", { numeric: true }) * F.dir);
}
const tokensBorrado = new Map(); // publicId → delete_token (válido 10 min)

// ═════════════════════════════════════════════════════════════
//  LISTA
// ═════════════════════════════════════════════════════════════
// ¿Algún repuesto / paño de pintura del vehículo está en esa fase?
const tieneEtapa = (v, tipo, fase) => itemsTexto(v[tipo]).some(x => etapaItem(v, tipo, x)[0] === fase);
function filtrar(lista) {
  const q = F.q.trim().toLowerCase();
  return lista.filter(v =>
    (F.estado === "todos" || estadoActual(v) === F.estado) &&
    (!F.mios || esMioV(v)) &&
    (F.grado === null || (v.grado || 0) === F.grado) &&
    (!F.repuestos || tieneEtapa(v, "repuestos", F.repuestos)) &&
    (!F.pintura || tieneEtapa(v, "pintura", F.pintura)) &&
    (!q || [v.modelo, v.patente, v.asegurado, v.compania, v.localidad, v.telefono]
      .some(x => (x || "").toLowerCase().includes(q))));
}

// Historial del vehículo (lo más nuevo arriba). Los vehículos viejos arrancan con la carga.
function historialHTML(v) {
  const h = [...(v.historial || [])];
  if (!h.some(e => /^Carg/.test(e.txt))) {
    const t = v.createdAt?.toMillis?.() || (v.createdAt?.seconds ? v.createdAt.seconds * 1000 : 0);
    h.push({ t, por: esDeWhatsApp(v) ? String(v.createdByName || "").replace(/\s*\(WhatsApp\)$/, "") : v.createdByName, txt: esDeWhatsApp(v) ? "Cargó el vehículo por WhatsApp" : "Cargó el vehículo" });
  }
  h.sort((a, b) => (b.t || 0) - (a.t || 0));
  const cuando = t => t ? new Date(t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return `<ol class="hist">${h.map(e => `<li><span class="hist-txt"><strong>${esc(e.por || "Alguien")}</strong> ${esc(String(e.txt || "").replace(/ por WhatsApp/g, ""))}</span><time>${cuando(e.t)}</time></li>`).join("")}</ol>`;
}

const gradoTag = v => v.grado ? `<span class="grado-tag g${v.grado} d-grado-tag">Grado ${v.grado}</span>` : "";
const gradoHTML = v => v.grado ? `<div class="grado-fila"><span class="grado-tag g${v.grado}">Grado ${v.grado}</span></div>` : "";

// Paños agrupados para el detalle en escritorio: centro y parantes, lateral izquierdo, lateral derecho
const GRUPOS_PIEZAS = [
  ["capot", "techo", "baul", "parante_izq", "parante_der"],
  ["gf_izq", "pd_izq", "pt_izq", "gt_izq"],
  ["gf_der", "pd_der", "pt_der", "gt_der"]
];

function tarjeta(v, sel) {
  const foto = v.fotos?.[0]?.url, rot0 = v.fotos?.[0]?.rot;
  return `
  <a class="vcard ${sel ? "sel" : ""}" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
    <span class="vthumb">${foto ? `<img src="${esc(thumb(foto, 160, rot0))}" alt="" loading="lazy">` : icon("car")}</span>
    <span class="vbody">
      <span class="vtop"><strong class="vmodel">${esc(v.modelo || "Sin modelo")}</strong>${estadoPill(v)}</span>
      <span class="vmid">${plate(v.patente, "sm")}${v._pending ? `<span class="sync" title="Pendiente de sincronizar"></span>` : ""}<time class="vfecha">${fechaCorta(v.fechas?.peritado)}</time></span>
      <span class="vsub"><span class="vcli">${esc(v.compania || "")}</span>${horaDe(v, "peritado") ? `<time>${horaDe(v, "peritado")}</time>` : ""}</span>
    </span>
  </a>`;
}

export function vistaVehiculos(view, selId = null) {
  const ancho = esAncho();
  const sel = selId ? getVehiculo(selId) : null;
  if (selId && !ancho) return vistaDetalle(view, selId);

  const filtroActivo = () => F.mios || F.grado !== null || F.repuestos || F.pintura || F.orden !== "fecha" || F.dir !== -1;
  setTopbar({
    title: "Vehículos",
    sub: S.company?.name,
    actions: `<button class="icon-btn filtro-btn ${filtroActivo() ? "activo" : ""}" id="tb-filtros" aria-label="Filtros" title="Filtros">${icon("filter")}</button>`
  });

  view.innerHTML = `
    <div class="split ${ancho ? "split-on" : ""}">
      <section class="pane-list">
        <div class="list-tools">
          <label class="search">${icon("search")}
            <input type="search" id="q" placeholder="Buscar patente, modelo, asegurado…" value="${esc(F.q)}" autocomplete="off"></label>
          <div class="estado-strip" id="estado-strip" role="tablist" aria-label="Filtrar por estado"></div>
        </div>
        <div id="vlist" class="vlist"></div>
      </section>
      ${ancho ? `<section class="pane-detail" id="pane-detail"></section>` : ""}
    </div>`;

  const pintar = () => {
    const todos = activos();
    const cuenta = Object.fromEntries(ESTADOS.map(e => [e.key, 0]));
    todos.forEach(v => cuenta[estadoActual(v)]++);
    $("#estado-strip", view).innerHTML =
      ESTADOS.map(e => `<button class="est ${F.estado === e.key ? "on" : ""}" data-e="${e.key}" style="--c:${e.color}">
        <b>${cuenta[e.key]}</b><span>${e.label}</span></button>`).join("");
    $("#estado-strip", view).setAttribute("aria-label", `Filtrar por estado (${todos.length} en total)`);

    const lista = ordenar(filtrar(todos));
    const box = $("#vlist", view);
    if (S.loadingVehicles) { box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
    if (!todos.length) {
      box.innerHTML = `<div class="empty">
        ${carMapSVG({ techo: 1, capot: 1 }, { size: "carmap-empty" })}
        <h2>Todavía no hay vehículos</h2>
        <p>Cargá el primer peritaje: modelo, patente y las piezas con granizo.</p>
        <a class="btn btn-primary" href="#/nuevo">${icon("plus")}Cargar vehículo</a></div>`;
      return;
    }
    box.innerHTML = lista.length
      ? lista.map(v => tarjeta(v, v.id === selId)).join("")
      : `<div class="empty small"><p>Ningún vehículo coincide con la búsqueda.</p>
         <button class="btn btn-ghost" id="limpiar">Limpiar filtros</button></div>`;
    $("#limpiar", box)?.addEventListener("click", () => { F.q = ""; F.estado = "todos"; F.mios = false; F.grado = null; F.repuestos = null; F.pintura = null; $("#tb-filtros")?.classList.remove("activo"); $("#q", view).value = ""; pintar(); });
  };

  $("#q", view).addEventListener("input", debounce(e => { F.q = e.target.value; pintar(); }, 120));
  $("#estado-strip", view).addEventListener("click", e => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    F.estado = F.estado === b.dataset.e ? "todos" : b.dataset.e; pintar();
  });
  // Filtros: orden (como en la planilla) y "Cargados por mí"
  $("#tb-filtros")?.addEventListener("click", () => {
    const s = openSheet({ title: "Filtros", body: `<div class="stack filtros">
      <span class="muted small">Grado</span><div class="p-chips" id="f-grado"></div>
      <span class="muted small">Repuestos</span><div class="p-chips" id="f-repuestos"></div>
      <span class="muted small">Pintura</span><div class="p-chips" id="f-pintura"></div>
      <span class="muted small">Ordenar por</span><div class="p-chips" id="f-orden"></div>
      <label class="toggle"><input type="checkbox" id="f-mios" ${F.mios ? "checked" : ""}><span>Cargados por mí</span></label>
      <button class="btn btn-ghost btn-sm" id="f-reset">Quitar filtros</button></div>` });
    const chips = () => { $("#f-orden", s.el).innerHTML = ORDENES.map(([k, t]) => `<button type="button" class="p-chip ${F.orden === k ? "on" : ""}" data-orden="${k}">${t}${F.orden === k ? `<i>${F.dir > 0 ? "↑" : "↓"}</i>` : ""}</button>`).join(""); };
    const chipsGrado = () => {
      const n = g => activos().filter(v => (v.grado || 0) === g).length;
      $("#f-grado", s.el).innerHTML = [[1, "Grado 1"], [2, "Grado 2"], [3, "Grado 3"], [0, "Sin grado"]].map(([g, t]) =>
        `<button type="button" class="p-chip ${F.grado === g ? "on" : ""}" data-grado="${g}">${t} <b class="f-n">${n(g)}</b></button>`).join("");
    };
    chipsGrado();
    const chipsEtapas = () => ["repuestos", "pintura"].forEach(tipo => {
      $(`#f-${tipo}`, s.el).innerHTML = ETAPAS[tipo].map(([k, t, color]) =>
        `<button type="button" class="p-chip ${F[tipo] === k ? "on" : ""}" data-fase="${k}" data-tipo="${tipo}" style="--c:${color}"><i class="f-dot"></i>${t} <b class="f-n">${activos().filter(v => tieneEtapa(v, tipo, k)).length}</b></button>`).join("");
    });
    chipsEtapas();
    ["repuestos", "pintura"].forEach(tipo => {
      $(`#f-${tipo}`, s.el).onclick = e => {
        const b = e.target.closest("[data-fase]"); if (!b) return;
        F[tipo] = F[tipo] === b.dataset.fase ? null : b.dataset.fase; chipsEtapas(); aplicar();
      };
    });
    $("#f-grado", s.el).onclick = e => {
      const b = e.target.closest("[data-grado]"); if (!b) return;
      const g = Number(b.dataset.grado);
      F.grado = F.grado === g ? null : g; chipsGrado(); aplicar();
    };
    const aplicar = () => { chips(); pintar(); $("#tb-filtros")?.classList.toggle("activo", filtroActivo()); };
    chips();
    $("#f-orden", s.el).onclick = e => {
      const b = e.target.closest("[data-orden]"); if (!b) return;
      if (F.orden === b.dataset.orden) F.dir *= -1; else { F.orden = b.dataset.orden; F.dir = F.orden === "fecha" ? -1 : 1; }
      aplicar();
    };
    $("#f-mios", s.el).onchange = e => { F.mios = e.target.checked; aplicar(); };
    $("#f-reset", s.el).onclick = () => { F.mios = false; F.grado = null; F.repuestos = null; F.pintura = null; chipsEtapas(); F.orden = "fecha"; F.dir = -1; $("#f-mios", s.el).checked = false; chipsGrado(); aplicar(); };
  });
  pintar();

  if (ancho) {
    const pane = $("#pane-detail", view);
    if (sel) renderDetalle(pane, sel, true);
    else pane.innerHTML = `<div class="empty pane-empty">${carMapSVG({}, { size: "carmap-empty" })}
      <p>Elegí un vehículo de la lista para ver el detalle.</p></div>`;
  }
  return { refrescar: () => vistaVehiculos(view, selId), soloLista: pintar };
}

// ═════════════════════════════════════════════════════════════
//  DETALLE
// ═════════════════════════════════════════════════════════════
export function vistaDetalle(view, id) {
  const v = getVehiculo(id);
  if (!v) {
    setTopbar({ title: "Vehículo", back: "#/" });
    view.innerHTML = S.loadingVehicles ? `<div class="skeleton tall"></div>`
      : `<div class="empty"><h2>No encontramos este vehículo</h2><p>Puede que lo hayan borrado o que sea de otro operativo.</p>
         <a class="btn btn-primary" href="#/">Ver vehículos</a></div>`;
    return;
  }
  setTopbar({
    title: "Detalle", sub: v.patente || v.modelo || "", back: "#/",
    actions: `<a class="icon-btn" href="#/editar/${v.id}" aria-label="Editar">${icon("edit")}</a>`
  });
  view.innerHTML = `<div class="detail-page"></div>`;
  renderDetalle($(".detail-page", view), v, false);
}

// Vista 3D: siempre arranca en 2D al abrir un vehículo
let modo3D = false, vid3D = null, adicAbierto = false;
export const reiniciarVista3D = () => { modo3D = false; };
function iniciar3D(root, v) {
  const caja = $(".vista-3d", root), cap = $(".caption-3d", root);
  caja.innerHTML = `<div class="skeleton" style="height:280px"></div>`;
  montar3D(caja, v.piezas || {}, (k, nombre) => { if (cap) cap.innerHTML = `<strong>${esc(nombre || k)}</strong>`; })
    .catch(err => { caja.innerHTML = `<p class="muted small center">${esc(err.message)}</p>`; });
}

function waLink(tel, texto = "") {
  let d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (!d.startsWith("54")) d = "549" + d;
  else if (!d.startsWith("549")) d = "549" + d.slice(2);
  return `https://wa.me/${d}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

// "capot y techo, puerta" → ["Capot y techo", "Puerta"] (se separa solo con comas y puntos)
const itemsTexto = t => String(t || "").split(/\n|,|;|\.(?!\d)/).map(x => x.trim()).filter(Boolean)
  .map(x => x.charAt(0).toUpperCase() + x.slice(1));

// Estado de cada repuesto y de cada paño de pintura: se toca el ítem y se elige
const ETAPAS = {
  repuestos: [["sinpedir", "Sin pedir", "#e5484d"], ["pedido", "Pedido", "#e0a526"], ["recibido", "Recibido", "#4f8ff7"], ["colocado", "Colocado", "#22b07d"]],
  pintura: [["pendiente", "Sin pintar", "#e5484d"], ["turnado", "Turnado", "#e0a526"], ["pintado", "Pintado", "#22b07d"]]
};
const CAMPO_ETAPAS = { repuestos: "etapasRepuestos", pintura: "etapasPintura" };
const claveItem = x => sinTildesJS(x).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "item";
const sinTildesJS = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const etapaItem = (v, tipo, x) => ETAPAS[tipo].find(e => e[0] === v[CAMPO_ETAPAS[tipo]]?.[claveItem(x)]) || ETAPAS[tipo][0];
const chipsSec = (titulo, v, tipo) => {
  const items = itemsTexto(v[tipo]);
  if (!items.length) return "";
  return `<section class="d-sec"><h3>${titulo}</h3>
  <ul class="piezas-list pintura-list etapas">${items.map(x => { const [, label, color] = etapaItem(v, tipo, x);
    return `<li><button type="button" class="etapa-item" data-tipo="${tipo}" data-item="${esc(x)}" style="--c:${color}"><span>${esc(x)}</span><small>${label}</small></button></li>`; }).join("")}</ul></section>`;
};

function elegirEtapa(v, tipo, item) {
  const actual = etapaItem(v, tipo, item)[0];
  const s = openSheet({ title: item, body: `<div class="stack etapa-opciones">${ETAPAS[tipo].map(([k, label, color]) =>
    `<button type="button" class="btn btn-block etapa-op ${k === actual ? "on" : ""}" data-k="${k}" style="--c:${color}"><i></i>${label}</button>`).join("")}</div>` });
  s.el.addEventListener("click", e => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    s.close();
    if (b.dataset.k === actual) return;
    const campo = CAMPO_ETAPAS[tipo], label = ETAPAS[tipo].find(x => x[0] === b.dataset.k)[1];
    actualizarVehiculo(v.id, { [`${campo}.${claveItem(item)}`]: b.dataset.k }, `${item}: ${label}`)
      .catch(err => toast(mensajeError(err), "error"));
  });
}

function renderDetalle(root, v, embebido) {
  if (vid3D !== v.id) { vid3D = v.id; modo3D = false; } // al abrir otro vehículo, arranca en 2D
  const est = estadoActual(v);
  const anulado = est === "anulado";
  const marcadas = piezasMarcadas(v);
  const todos = marcadas.length === ORDEN_PIEZAS.length;
  const esMio = esMioV(v);

  root.innerHTML = `
  <article class="detail">
    <header class="d-head">
      ${v.fotos?.length
        ? `<button class="d-cover" data-act="galeria" aria-label="Ver las ${v.fotos.length} fotos">
             <img src="${esc(thumb(v.fotos[0].url, 240, v.fotos[0].rot))}" alt=""><span class="d-cover-n">${icon("camera")}${v.fotos.length}</span></button>`
        : `<div class="d-cover vacio" id="d-cover-cam">
             <button type="button" class="d-cover-cam" data-camara aria-label="Abrir la cámara">${icon("camera")}<small>Cámara</small></button>
             <label class="d-cover-gal" aria-label="Agregar fotos de la galería">${icon("image")}<span class="gal-plus">+</span><input type="file" accept="image/*" multiple hidden data-galeria></label>
           </div>`}
      <div class="d-title">
        <h2>${esc(v.modelo || "Sin modelo")}</h2>
        <div class="d-plate">${plate(v.patente, "lg")}</div>
        ${v.precio ? `<div class="d-price"><strong>${money(v.precio)}</strong></div>` : ""}
      </div>
    </header>

    <div class="d-actions">
      <button class="btn btn-primary" data-act="pdf">${icon("share")}Compartir</button>
      ${v.telefono ? `<div class="d-contacto">
        <button class="btn btn-ghost" data-act="contactar" aria-haspopup="true" aria-expanded="false">${icon("phone")}Contactar</button>
        <div class="d-menu" hidden>
          <a href="${waLink(v.telefono)}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>
          <a href="tel:${esc(v.telefono)}">${icon("phone")}Llamar</a>
        </div></div>` : ""}
      ${embebido ? `<a class="btn btn-ghost btn-icon" href="#/editar/${v.id}" aria-label="Editar" title="Editar">${icon("edit")}</a>` : ""}
    </div>

    <section class="d-sec">
      <div class="seg-head"><h3>Seguimiento</h3>
        <button class="link-btn small ${anulado ? "" : "danger"}" data-act="anular">${anulado ? "Reactivar vehículo" : "Anular vehículo"}</button></div>
      <ol class="stepper ${anulado ? "is-anulado" : ""}">
        ${SECUENCIA.map(k => {
          const aus = k === "turnado" && est === "ausente";
          const e = aus ? ESTADO.ausente : ESTADO[k], hecho = !!v.fechas?.[k] && !anulado, actual = k === est || aus;
          return `<li><button class="step ${hecho ? "done" : ""} ${actual ? "now" : ""} ${aus ? "is-ausente" : ""}" data-estado="${k}" style="--c:${e.color}">
            <span class="dot">${hecho ? icon(aus ? "x" : "check") : ""}</span>
            <span class="step-l">${e.label}</span>
            <span class="step-d">${v.fechas?.[k] ? fechaCorta(v.fechas[k]) : "—"}${(k === "peritado" || k === "reparado") && v.fechas?.[k] && horaDe(v, k) ? `<br>${horaDe(v, k)}` : ""}</span></button></li>`;
        }).join("")}
      </ol>
      ${anulado ? `<p class="muted small">Anulado el ${fechaCorta(v.fechas?.anulado)}</p>` : ""}
    </section>

    <section class="d-sec d-grid">
      ${[["Asegurado", v.asegurado], ["Teléfono", v.telefono], ["Compañía de seguro", v.compania], ["Localidad", v.localidad]]
        .map(([l, x]) => `<div class="kv"><span>${l}</span><strong>${esc(x || "—")}</strong></div>`).join("")}
    </section>

    ${!marcadas.length ? (v.grado ? `<section class="d-sec d-piezas"><div class="sec-head"><h3>Paños afectados</h3>${gradoTag(v)}</div></section>` : "") : `<section class="d-sec d-piezas">
      <div class="sec-head"><h3>Paños afectados ${todos ? "<small>todos</small>" : marcadas.length ? `<small>${marcadas.length}</small>` : ""}</h3>${gradoTag(v)}
        ${marcadas.length ? `<button class="btn btn-ghost btn-sm vista-btn" data-act="vista3d">${modo3D ? "2D" : "3D"}</button>` : ""}</div>
      ${!marcadas.length ? `<p class="muted sin-panos">Sin paños marcados</p>` : `
      <div class="vista-3d" ${modo3D ? "" : "hidden"}></div>
      <div class="piezas-view" ${modo3D ? "hidden" : ""}>
        <div class="map-col">${carMapSVG(v.piezas || {}, { size: "carmap-sm" })}</div>
        <p class="piezas-caption" aria-live="polite">${todos ? "<strong>Todos</strong>" : marcadas.length ? "Tocá un paño para ver su nombre" : "Sin paños marcados"}</p>
        <div class="piezas-grupos">${todos ? `<ul class="piezas-list"><li>Todos</li></ul>`
          : !marcadas.length ? `<ul class="piezas-list"><li class="muted">Sin paños marcados</li></ul>`
          : GRUPOS_PIEZAS.map(g => g.filter(k => v.piezas?.[k])).filter(g => g.length)
              .map(g => `<ul class="piezas-list">${g.map(k => `<li>${esc(PIEZA[k].label)}</li>`).join("")}</ul>`).join("")}</div>
      </div>
      <p class="piezas-caption caption-3d" ${modo3D ? "" : "hidden"}>Arrastrá para girar · tocá un paño</p>
`}
    </section>`}

    ${v.observaciones ? `<section class="d-sec"><h3>Observaciones</h3><p class="prose">${esc(v.observaciones)}</p></section>` : ""}
    ${chipsSec("Repuestos", v, "repuestos")}
    ${chipsSec("Pintura", v, "pintura")}

    ${v.archivos?.length || v.fechas?.reparado || v.fechas?.facturado || v.firma ? `<details class="d-sec d-adic" ${adicAbierto ? "open" : ""}>
      <summary><h3>Adicionales</h3></summary>


    ${v.archivos?.length ? `<section class="d-sub">
      <div class="sec-head"><h3>Documentos <small>${v.archivos?.length || 0}</small></h3></div>
      <ul class="docs">${(v.archivos || []).map((a, i) => `
        <li><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("file")}<span>${esc(a.name)}</span></a>
          <button class="icon-btn sm" data-del-doc="${i}" aria-label="Quitar documento">${icon("x")}</button></li>`).join("")}</ul>
    </section>` : ""}

    ${v.fechas?.reparado || v.fechas?.facturado || v.firma ? `<section class="d-sub">
      <div class="sec-head"><h3>Firma del cliente</h3>
        <button class="btn btn-ghost btn-sm" data-act="firma">${icon("sign")}${v.firma ? "Volver a firmar" : "Firmar"}</button></div>
      ${v.firma ? `<img class="firma-img" src="${esc(v.firma)}" alt="Firma del cliente">`
        : ""}
    </section>` : ""}

    </details>` : ""}

    <footer class="d-foot">
      <span class="d-autor"><button class="icon-btn sm hist-btn" data-act="historial" aria-label="Historial" title="Historial">${icon("clock")}</button>Cargado por ${esc(cargadoPor(v))}</span>
      <span class="d-foot-btns">
        <button class="icon-btn danger" data-act="borrar" aria-label="Eliminar vehículo" title="Eliminar">${icon("trash")}</button>
      </span>
    </footer>
  </article>`;

  $(".d-adic", root)?.addEventListener("toggle", e => { adicAbierto = e.target.open; });
  if (modo3D && marcadas.length) iniciar3D(root, v);

  // Mantener apretado "Turnado" (con el auto turnado): lo marca Ausente; otra vez, vuelve a Turnado
  let pasoLargo = false, relojPaso = null;
  const pasoTurno = $('[data-estado="turnado"]', root);
  pasoTurno?.addEventListener("pointerdown", () => {
    pasoLargo = false;
    const est = estadoActual(v);
    if (est !== "turnado" && est !== "ausente") return;
    relojPaso = setTimeout(() => {
      pasoLargo = true; navigator.vibrate?.(30);
      if (est === "turnado") { cambiarEstado(v, "ausente", hoyISO()).catch(err => toast(mensajeError(err), "error")); toast("Marcado como ausente"); }
      else { cambiarEstado(v, "turnado", v.fechas?.turnado || hoyISO()).catch(err => toast(mensajeError(err), "error")); toast("Volvió a turnado"); }
    }, 600);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => pasoTurno?.addEventListener(ev, () => clearTimeout(relojPaso)));
  pasoTurno?.addEventListener("contextmenu", e => e.preventDefault());

  // Acciones
  root.addEventListener("click", async e => {
    const t = e.target;
    const step = t.closest("[data-estado]");
    if (step) { if (pasoLargo) { pasoLargo = false; return; } return elegirFechaEstado(v, step.dataset.estado); }
    const et = t.closest(".etapa-item");
    if (et) return elegirEtapa(v, et.dataset.tipo, et.dataset.item);
    const act = t.closest("[data-act]")?.dataset.act;
    if (act === "pdf") return compartir(v);
    if (act === "galeria") return visor(v.fotos, 0, v);
    if (act === "vista3d") {
      modo3D = !modo3D;
      t.closest("[data-act]").textContent = modo3D ? "2D" : "3D";
      $(".vista-3d", root).hidden = !modo3D;
      $(".d-piezas .piezas-view", root).hidden = modo3D;
      $(".caption-3d", root).hidden = !modo3D;
      if (modo3D) iniciar3D(root, v);
      return;
    }
    if (act === "firma") return firmar(v);
    if (act === "contactar") {
      const m = $(".d-menu", root), abrir = m.hidden;
      const btn = t.closest("[data-act]");
      m.hidden = !abrir; btn.setAttribute("aria-expanded", abrir);
      if (abrir) setTimeout(() => document.addEventListener("click", function fuera(ev) {
        if (!ev.target.closest(".d-contacto")) { m.hidden = true; btn.setAttribute("aria-expanded", "false"); }
        document.removeEventListener("click", fuera);
      }), 0);
      return;
    }
    if (act === "anular") {
      if (anulado) {
        const ultimo = SECUENCIA.filter(k => v.fechas?.[k]).pop() || "peritado";
        return cambiarEstado(v, ultimo, v.fechas?.[ultimo] || hoyISO()).catch(err => toast(mensajeError(err), "error"));
      }
      if (await confirmar({ title: "¿Anular este trabajo?", message: "Queda registrado como anulado. Podés reactivarlo después.", ok: "Anular", danger: true }))
        cambiarEstado(v, "anulado").catch(err => toast(mensajeError(err), "error"));
      return;
    }
    if (act === "historial") { openSheet({ title: "Historial", body: historialHTML(getVehiculo(v.id) || v) }); return; }
    if (act === "borrar" && !esMio && !soyAdmin()) {
      // Solo quien lo cargó puede borrarlo: los demás piden la eliminación a los administradores
      if (await confirmar({ title: "Este vehículo no es tuyo",
        message: `Está cargado por ${cargadoPor(v)}. ¿Solicitar su eliminación a los administradores del operativo?`, ok: "Solicitar eliminación", danger: true })) {
        solicitarEliminacion(v).then(() => toast("Solicitud enviada a los administradores", "success")).catch(err => toast(mensajeError(err), "error"));
      }
      return;
    }
    if (act === "borrar") {
      if (await confirmar({ title: `¿Mover “${v.modelo || v.patente}” a la papelera?`, message: "Lo podés restaurar desde Ajustes → Papelera.", ok: "Mover a la papelera", danger: true })) {
        moverAPapelera(v.id).catch(err => toast(mensajeError(err), "error"));
        toast("Movido a la papelera");
        go("#/");
      }
      return;
    }
    const pz = t.closest(".d-piezas [data-pieza]");
    if (pz) {
      const k = pz.dataset.pieza, cap = $(".piezas-caption", root);
      $$(".d-piezas .panel", root).forEach(g => g.classList.toggle("tocado", g === pz));
      if (cap) cap.innerHTML = `<strong>${esc(PIEZA[k].label)}</strong>`;
      return;
    }
    const fi = t.closest("[data-foto]");
    if (fi) return visor(v.fotos, +fi.dataset.foto);
    const df = t.closest("[data-del-foto]");
    if (df) return quitarAdjunto(v, "fotos", +df.dataset.delFoto);
    const dd = t.closest("[data-del-doc]");
    if (dd) return quitarAdjunto(v, "archivos", +dd.dataset.delDoc);
  });
  const cov = $("#d-cover-cam", root);
  if (cov) conectarFotos(cov, files => files.length && subirAdjuntos(v, files, "foto", root));
  $$("[data-up]", root).forEach(inp => inp.addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length) subirAdjuntos(v, files, inp.dataset.up, root);
  }));
}

// Aviso al cliente por WhatsApp cuando el auto queda reparado (se confirma dos veces)
function textoAviso(v) {
  const nombre = String(v.asegurado || "").trim().split(/\s+/)[0];
  return `Hola${nombre ? " " + nombre : ""}! 👋 Te escribimos de ${S.company?.name || "Desabollito"}: tu ${v.modelo || "vehículo"}${v.patente ? ` (${v.patente})` : ""} ya está reparado y listo para retirar. ¡Gracias por confiar en nosotros!`;
}
async function ofrecerAvisoCliente(v) {
  v = getVehiculo(v.id) || v;
  if (!v.telefono || S.config?.avisoReparado === false) return;   // el creador puede apagar esta función
  if (!(await confirmar({ title: "¿Avisarle al cliente?", message: `Le mandamos un WhatsApp a ${v.asegurado || "el cliente"} (${v.telefono}) diciendo que el auto está listo.`, ok: "Sí, avisar" }))) return;
  if (!(await confirmar({ title: "¿Confirmás el envío?", message: `Se va a enviar este mensaje a ${v.telefono}:\n\n“${textoAviso(v)}”`, ok: "Enviar mensaje" }))) return;
  try {
    const r = await fetch(`${BOT_API}/avisar`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: S.company.id, vid: v.id, por: S.profile?.name || "" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || "No se pudo enviar");
    toast("Aviso enviado al cliente", "success");
  } catch (e) {
    if (await confirmar({ title: "No se pudo enviar desde el bot", message: `${e.message}. ¿Abrir WhatsApp para mandarlo vos?`, ok: "Abrir WhatsApp" })) {
      const tel = String(v.telefono).replace(/\D/g, "").replace(/^0/, "");
      open(`https://wa.me/${tel.startsWith("54") ? tel : "549" + tel}?text=${encodeURIComponent(textoAviso(v))}`, "_blank");
    }
  }
}

function elegirFechaEstado(v, estado) {
  const e = ESTADO[estado];
  const s = openSheet({
    title: `Marcar como ${e.label.toLowerCase()}`,
    body: `<form class="stack">
      <label class="field"><span>${estado === "turnado" ? "Fecha del turno" : "Fecha"}</span>
        <input type="date" name="f" value="${v.fechas?.[estado] || hoyISO()}" required></label>
      ${estado === "turnado" ? `<p class="muted small">El turno aparece en el calendario.</p>` : ""}
      <button class="btn btn-primary btn-block" style="--btn:${e.color}">Guardar</button></form>`
  });
  $("form", s.el).onsubmit = ev => {
    ev.preventDefault();
    cambiarEstado(v, estado, ev.target.f.value).catch(err => toast(mensajeError(err), "error"));
    toast(`${e.label} · ${fechaCorta(ev.target.f.value)}`, "success");
    s.close();
    if (estado === "reparado") setTimeout(() => ofrecerAvisoCliente(v), 350);
  };
}

async function subirAdjuntos(v, files, tipo, root) {
  if (!cloudinaryListo()) { toast("Falta configurar Cloudinary en js/config.js", "error"); return; }
  const holders = files.map(() => null);
  const est = $("#fotos-estado", root);
  if (est && tipo === "foto") est.innerHTML = `<span class="spin"></span> Subiendo ${files.length} ${files.length === 1 ? "foto" : "fotos"}…`;
  toast(`Subiendo ${files.length} ${tipo === "foto" ? (files.length === 1 ? "foto" : "fotos") : (files.length === 1 ? "archivo" : "archivos")}…`);
  const nuevos = [];
  const carpeta = `${S.company.id}/${v.id}`;
  let i = 0;
  const trabajador = async () => {
    while (i < files.length) {
      const n = i++, file = files[n];
      try {
        if (tipo === "foto") {
          const blob = await comprimir(file);
          const r = await subir(blob, carpeta);
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          nuevos.push({ url: r.url, publicId: r.publicId, w: r.w, h: r.h, at: Date.now(), by: S.user.uid, n });
        } else {
          if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: supera 10 MB`);
          const r = await subir(file, carpeta, { tipo: "auto", nombre: file.name });
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          nuevos.push({ url: r.url, publicId: r.publicId, name: file.name, bytes: r.bytes, format: r.format, at: Date.now(), n });
        }
      } catch (e) {
        console.error(e); toast(e.message, "error");
        holders[n]?.remove();
      }
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  if (!nuevos.length) return;
  nuevos.sort((a, b) => a.n - b.n).forEach(x => delete x.n);
  const actual = getVehiculo(v.id) || v;
  const campo = tipo === "foto" ? "fotos" : "archivos";
  try {
    await actualizarVehiculo(v.id, { [campo]: [...(actual[campo] || []), ...nuevos] },
      tipo === "foto" ? `Agregó ${nuevos.length} ${nuevos.length === 1 ? "foto" : "fotos"}` : `Adjuntó ${nuevos.length === 1 ? "un documento" : `${nuevos.length} documentos`}`);
    toast(tipo === "foto" ? "Fotos guardadas" : "Documentos guardados", "success");
  } catch (e) { toast(mensajeError(e), "error"); }
}

// Pedir acceso para editar un vehículo cargado por otra persona
export async function pedirEdicion(v) {
  if (yaPedi("editar", v.id)) { toast("Ya pediste acceso para editar este vehículo", "info"); return; }
  if (!(await confirmar({ title: "Este vehículo no es tuyo", message: `Lo cargó ${cargadoPor(v)}. ¿Querés pedir acceso para editarlo?`, ok: "Pedir acceso" }))) return;
  crearSolicitud(v, "editar").then(() => toast("Pedido enviado a los administradores", "success")).catch(e => toast(mensajeError(e), "error"));
}

async function quitarAdjunto(v, campo, idx) {
  const item = v[campo]?.[idx]; if (!item) return;
  if (!puedoEditar(v)) {
    const tipo = campo === "fotos" ? "foto" : "documento";
    if (!(await confirmar({ title: "Este vehículo no es tuyo",
      message: `Lo cargó ${cargadoPor(v)}. ¿Pedir a los administradores que quiten ${tipo === "foto" ? "esta foto" : `“${item.name}”`}?`, ok: "Pedir que la quiten", danger: true }))) return;
    crearSolicitud(v, tipo, item).then(() => toast("Pedido enviado a los administradores", "success")).catch(e => toast(mensajeError(e), "error"));
    return;
  }
  const ok = await confirmar({
    title: campo === "fotos" ? "¿Quitar esta foto?" : `¿Quitar “${item.name}”?`,
    message: "Se quita del vehículo y del PDF.", ok: "Quitar", danger: true
  });
  if (!ok) return;
  const lista = (getVehiculo(v.id)?.[campo] || []).filter(x => x.publicId !== item.publicId || x.url !== item.url);
  actualizarVehiculo(v.id, { [campo]: lista }, campo === "fotos" ? "Quitó una foto" : `Quitó el documento “${item.name}”`).catch(e => toast(mensajeError(e), "error"));
  if (tokensBorrado.has(item.publicId)) borrarConToken(tokensBorrado.get(item.publicId));
}

// Foto a pantalla completa: pellizcar o doble toque para hacer zoom, arrastrar para mover
function zoomFoto(url, previa) {
  const el = document.createElement("div");
  el.className = "zoom-foto";
  el.innerHTML = `<img alt="" src="${esc(previa || url)}"><button class="icon-btn zoom-x" aria-label="Cerrar">${icon("x")}</button>`;
  document.body.appendChild(el);
  const im = $("img", el);
  if (previa && previa !== url) { const hd = new Image(); hd.onload = () => { im.src = url; }; hd.src = url; }
  let esc_ = 1, tx = 0, ty = 0;
  const pintar = () => { im.style.transform = `translate(${tx}px, ${ty}px) scale(${esc_})`; };
  const limitar = () => {
    if (esc_ <= 1) { esc_ = 1; tx = 0; ty = 0; return; }
    const mx = im.offsetWidth * (esc_ - 1) / 2, my = im.offsetHeight * (esc_ - 1) / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  };
  const cerrar = () => { el.remove(); removeEventListener("keydown", tecla, true); };
  const tecla = e => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
  addEventListener("keydown", tecla, true);
  $(".zoom-x", el).onclick = cerrar;
  const ptrs = new Map();
  let d0 = 0, e0 = 1, p0 = null, ultimoToque = 0, movio = false;
  el.addEventListener("pointerdown", e => {
    if (e.target.closest(".zoom-x")) return;
    el.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); movio = false;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); e0 = esc_; }
    else p0 = { x: e.clientX - tx, y: e.clientY - ty };
  });
  el.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); movio = true;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; esc_ = Math.max(1, Math.min(6, e0 * Math.hypot(a.x - b.x, a.y - b.y) / d0)); }
    else if (p0 && esc_ > 1) { tx = e.clientX - p0.x; ty = e.clientY - p0.y; }
    limitar(); pintar();
  });
  const soltar = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { const [a] = [...ptrs.values()]; p0 = { x: a.x - tx, y: a.y - ty }; }
    if (ptrs.size || movio) return;
    // Doble toque: acerca / vuelve
    const ahora = Date.now();
    if (ahora - ultimoToque < 300) {
      if (esc_ > 1) { esc_ = 1; tx = 0; ty = 0; }
      else { esc_ = 2.5; const r = im.getBoundingClientRect(); tx = (r.left + r.width / 2 - e.clientX) * 1.5; ty = (r.top + r.height / 2 - e.clientY) * 1.5; limitar(); }
      im.style.transition = "transform .2s"; pintar(); setTimeout(() => { im.style.transition = ""; }, 220);
      ultimoToque = 0;
    } else ultimoToque = ahora;
  };
  el.addEventListener("pointerup", soltar);
  el.addEventListener("pointercancel", soltar);
  el.addEventListener("wheel", e => { e.preventDefault(); esc_ = Math.max(1, Math.min(6, esc_ * (e.deltaY < 0 ? 1.15 : 0.87))); limitar(); pintar(); }, { passive: false });
}

function visor(fotos = [], inicio = 0, v = null) {
  if (!fotos.length) return;
  let i = inicio;
  const s = openSheet({
    wide: true,
    body: `<div class="viewer">
      <div class="viewer-foto"><img id="vw-img" alt=""><span class="viewer-carga" hidden><span class="spin"></span></span>
        ${v && puedoEditar(v) ? `<button class="icon-btn viewer-ov viewer-rot" id="vw-rot" aria-label="Girar foto" title="Girar">${icon("rotate")}</button>` : ""}
        <button class="icon-btn viewer-ov viewer-x" data-close aria-label="Cerrar">${icon("x")}</button>
        <button class="icon-btn viewer-ov viewer-dl" id="vw-dl" aria-label="Descargar" title="Descargar">${icon("download")}</button>
</div>
      <div class="viewer-bar">
        <button class="icon-btn" data-p aria-label="Anterior" ${fotos.length > 1 ? "" : "disabled"}>${icon("back")}</button>
        <span id="vw-n"></span>
        ${v ? `<button class="icon-btn danger" id="vw-del" aria-label="Quitar esta foto">${icon("trash")}</button>` : ""}
        <button class="icon-btn" data-n aria-label="Siguiente" ${fotos.length > 1 ? "" : "disabled"}>${icon("next")}</button>
      </div>
      ${v ? `<div class="viewer-add"><button type="button" class="btn btn-ghost btn-block" id="vw-mas">${icon("plus")}Añadir más fotos</button>
        <div class="viewer-mas" id="vw-mas-op" hidden>${botonesFotos({ id: "vw-add" })}</div></div>` : ""}
      </div>`
  });
  $(".sheet", s.el).classList.add("sheet-visor");
  const img0 = $("#vw-img", s.el), carga = $(".viewer-carga", s.el);
  img0.addEventListener("load", () => { carga.hidden = true; img0.classList.remove("cargando"); });
  img0.addEventListener("error", () => { carga.hidden = true; img0.classList.remove("cargando"); });
  const show = () => {
    const url = grande(fotos[i].url, 1600, fotos[i].rot);
    if (img0.getAttribute("src") !== url) {
      // Animación de carga mientras llega la foto (a veces tarda 1-3 s)
      img0.classList.add("cargando"); carga.hidden = false;
      img0.src = url;
      if (img0.complete && img0.naturalWidth) { carga.hidden = true; img0.classList.remove("cargando"); }
    }
    $("#vw-n", s.el).textContent = `${i + 1} de ${fotos.length}`;
  };
  // "Añadir más fotos": abre la elección Cámara / Galería
  $("#vw-mas", s.el)?.addEventListener("click", e => {
    const op = $("#vw-mas-op", s.el); op.hidden = !op.hidden; e.currentTarget.hidden = !op.hidden;
  });
  // Nombre: PATENTE_01.jpg, PATENTE_02.jpg…
  const nombreFoto = n => `${String(v?.patente || v?.modelo || "foto").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${String(n + 1).padStart(2, "0")}.jpg`;
  const celular = matchMedia("(pointer: coarse)").matches;
  const bajar = async n => {
    const f = fotos[n], nombre = nombreFoto(n);
    if (celular) {
      // Celular (como antes): baja la foto directo y la guarda, sin pasos extra en Cloudinary
      try {
        const r = await fetch(grande(f.url, 4000, f.rot).replace("f_auto", "f_jpg")); if (!r.ok) throw new Error(r.status);
        const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nombre; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch { open(f.url, "_blank", "noopener"); }
      return;
    }
    // Computadora: Cloudinary la manda como descarga con el nombre PATENTE_NN (fl_attachment)
    const url = grande(f.url, 4000, f.rot).replace("f_auto", "f_jpg")
      .replace("/upload/", `/upload/fl_attachment:${nombre.replace(/\.jpg$/, "")}/`);
    const a = document.createElement("a"); a.href = url; a.download = nombre; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const bajarTodas = async () => {
    toast(`Descargando ${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}…`);
    for (let n = 0; n < fotos.length; n++) { await bajar(n); await new Promise(r => setTimeout(r, 350)); }
  };
  const dl = $("#vw-dl", s.el);
  if (celular) {
    // Celular: un toque baja esta foto; mantener apretado baja todas
    let largo = null, todas = false;
    dl.addEventListener("pointerdown", () => {
      todas = false;
      largo = setTimeout(() => { todas = true; navigator.vibrate?.(30); bajarTodas(); }, 600);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => dl.addEventListener(ev, () => clearTimeout(largo)));
    dl.addEventListener("contextmenu", e => e.preventDefault());
    dl.addEventListener("click", () => { if (!todas) bajar(i); });
  } else {
    // Computadora: esta foto, todas en ZIP o todas en una carpeta (esta última solo en Chrome/Edge)
    const baseNombre = nombreFoto(0).replace(/_01\.jpg$/, "");
    const traer = async n => {
      const f = fotos[n];
      const r = await fetch(grande(f.url, 4000, f.rot).replace("f_auto", "f_jpg"));
      if (!r.ok) throw new Error(`No se pudo bajar la foto ${n + 1}`);
      return r.blob();
    };
    const conProgreso = async (hacer) => {
      const t = toast(`Preparando ${fotos.length} fotos…`);
      try { await hacer(); } catch (e) { if (e?.name !== "AbortError") toast(e.message || "No se pudo descargar", "error"); }
    };
    dl.addEventListener("click", () => {
      if (fotos.length === 1) return bajar(i);
      const carpeta = "showDirectoryPicker" in window;
      const q = openSheet({ title: "Descargar", body: `<div class="stack">
        <button type="button" class="btn btn-ghost btn-block" data-una>${icon("image")}Esta foto</button>
        <button type="button" class="btn btn-primary btn-block" data-zip>${icon("download")}Todas en ZIP (${fotos.length})</button>
        ${carpeta ? `<button type="button" class="btn btn-ghost btn-block" data-carpeta>${icon("file")}Todas en una carpeta</button>` : ""}</div>` });
      $("[data-una]", q.el).onclick = () => { q.close(); bajar(i); };
      $("[data-zip]", q.el).onclick = () => { q.close(); conProgreso(async () => {
        const archivos = [];
        for (let n = 0; n < fotos.length; n++) archivos.push({ nombre: nombreFoto(n), datos: new Uint8Array(await (await traer(n)).arrayBuffer()) });
        const a = document.createElement("a"); a.href = URL.createObjectURL(armarZip(archivos)); a.download = `${baseNombre}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        toast("ZIP descargado", "success");
      }); };
      $("[data-carpeta]", q.el)?.addEventListener("click", async () => {
        q.close();
        let dir;
        try { dir = await window.showDirectoryPicker({ mode: "readwrite", id: "desabollito-fotos" }); } catch { return; }
        conProgreso(async () => {
          for (let n = 0; n < fotos.length; n++) {
            const fh = await dir.getFileHandle(nombreFoto(n), { create: true });
            const w = await fh.createWritable(); await w.write(await traer(n)); await w.close();
          }
          toast(`${fotos.length} fotos guardadas en “${dir.name}”`, "success");
        });
      });
    });
  }
  if ($("[data-p]", s.el)) $("[data-p]", s.el).onclick = () => { i = (i - 1 + fotos.length) % fotos.length; show(); };
  if ($("[data-n]", s.el)) $("[data-n]", s.el).onclick = () => { i = (i + 1) % fotos.length; show(); };
  let x0 = null, deslizo = false;
  const img = $("#vw-img", s.el);
  img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; deslizo = false; }, { passive: true });
  img.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { deslizo = true; i = (i + (dx < 0 ? 1 : -1) + fotos.length) % fotos.length; show(); }
  });
  // Tocar la foto: se abre a pantalla completa con zoom
  img.addEventListener("click", () => { if (!deslizo) zoomFoto(grande(fotos[i].url, 2400, fotos[i].rot), img.src); deslizo = false; });
  const vwAdd = $("#vw-add", s.el);
  if (vwAdd) conectarFotos(vwAdd, files => {
    if (!files.length) return;
    s.close();
    subirAdjuntos(getVehiculo(v.id) || v, files, "foto", document);
  });
  // Girar 90°: queda guardado en el vehículo y se aplica en la app y en el PDF
  $("#vw-rot", s.el)?.addEventListener("click", () => {
    const f = fotos[i];
    const lista = [...(getVehiculo(v.id)?.fotos || [])];
    const idx = lista.findIndex(x => x.url === f.url);
    if (idx < 0) return;
    const rot = ((f.rot || 0) + 90) % 360;
    fotos[i] = { ...f, rot };
    lista[idx] = { ...lista[idx], rot };
    show();
    actualizarVehiculo(v.id, { fotos: lista }).catch(e => toast(mensajeError(e), "error"));
  });
  $("#vw-del", s.el)?.addEventListener("click", async () => {
    const f = fotos[i];
    const idx = (getVehiculo(v.id)?.fotos || []).findIndex(x => x.url === f.url);
    s.close();
    if (idx >= 0) await quitarAdjunto(getVehiculo(v.id), "fotos", idx);
  });
  s.el.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") $("[data-n]", s.el)?.click();
    if (e.key === "ArrowLeft") $("[data-p]", s.el)?.click();
  });
  show();
}

function firmar(v) {
  const s = openSheet({
    title: "Firma del cliente",
    wide: true,
    body: `<div class="stack">
      <p class="muted small">${v.asegurado ? `Firma de ${esc(v.asegurado)} en conformidad con la reparación.` : "Firma en conformidad con la reparación."}</p>
      <div class="pad"><canvas id="pad"></canvas><span class="pad-line"></span></div>
      <div class="row-btns"><button class="btn btn-ghost" data-clear>Borrar</button>
      <button class="btn btn-primary" data-save>Guardar firma</button></div></div>`
  });
  s.el.classList.add("sheet-arriba");
  const c = $("#pad", s.el), ctx = c.getContext("2d");
  const dpr = Math.max(2, devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  c.width = r.width * dpr; c.height = r.height * dpr;
  ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "#0e1b2c";
  let dib = false, ult = null, trazos = 0;
  const pos = e => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  c.addEventListener("pointerdown", e => { dib = true; ult = pos(e); c.setPointerCapture(e.pointerId); trazos++; });
  c.addEventListener("pointermove", e => {
    if (!dib) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(ult.x, ult.y);
    ctx.quadraticCurveTo(ult.x, ult.y, (p.x + ult.x) / 2, (p.y + ult.y) / 2);
    ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => c.addEventListener(ev, () => { dib = false; }));
  $("[data-clear]", s.el).onclick = () => { ctx.clearRect(0, 0, c.width, c.height); trazos = 0; };
  $("[data-save]", s.el).onclick = () => {
    if (!trazos) {
      // Vacía: si había una firma guardada, se elimina; si no, no hay nada que hacer
      if (v.firma || getVehiculo(v.id)?.firma) {
        actualizarVehiculo(v.id, { firma: null }, "Eliminó la firma del cliente").catch(e => toast(mensajeError(e), "error"));
        toast("Firma eliminada", "success");
      }
      s.close(); return;
    }
    // Reducir a un PNG liviano para guardarlo en la base
    const out = document.createElement("canvas");
    out.width = 600; out.height = Math.round(600 * c.height / c.width);
    out.getContext("2d").drawImage(c, 0, 0, out.width, out.height);
    actualizarVehiculo(v.id, { firma: out.toDataURL("image/png") }, "Registró la firma del cliente").catch(e => toast(mensajeError(e), "error"));
    toast("Firma guardada", "success");
    s.close();
  };
}

// ¿El navegador puede compartir archivos? (celulares sí; la mayoría de las computadoras no)
function puedeCompartirArchivos() {
  try { return !!navigator.canShare?.({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] }); }
  catch { return false; }
}

function compartir(v) {
  const hayFotos = v.fotos?.length > 0;
  const puedeCompartirArchivos = () => false;   // solo "Descargar PDF", igual en celular y computadora
  const s = openSheet({
    title: "Compartir presupuesto",
    body: `<div class="stack">
      ${hayFotos ? `<label class="toggle"><input type="checkbox" id="con-fotos" checked><span>Incluir las ${v.fotos.length} fotos</span></label>` : ""}
      ${puedeCompartirArchivos() ? `<button class="btn btn-primary btn-block btn-lg" data-m="share">${icon("share")}Compartir PDF</button>` : ""}
      <button class="btn ${puedeCompartirArchivos() ? "btn-ghost" : "btn-primary btn-lg"} btn-block" data-m="save">${icon("download")}Descargar PDF</button></div>`
  });
  const nombre = nombreArchivo(v);
  const texto = `Presupuesto de granizo${v.modelo ? " · " + v.modelo : ""}${v.patente ? " " + v.patente : ""}${v.precio ? " · Total " + money(v.precio) : ""}`;

  // El PDF se arma apenas se abre la hoja: así, al tocar "Compartir", el menú
  // del teléfono se abre en el mismo toque (si tarda, el navegador lo bloquea).
  let listo = null, preparando = null, turno = 0, error = null;
  const preparar = () => {
    const conFotos = $("#con-fotos", s.el)?.checked || false;
    const mio = ++turno;
    listo = null; error = null;
    preparando = presupuestoPDF(v, S.company, { conFotos })
      .then(doc => {
        if (mio !== turno) return;
        const blob = doc.output("blob");
        listo = { blob, file: new File([blob], nombre, { type: "application/pdf" }) };
      })
      .catch(err => { console.error(err); if (mio === turno) error = err; });
    return preparando;
  };
  preparar();
  $("#con-fotos", s.el)?.addEventListener("change", preparar);

  const descargar = blob => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  s.body.addEventListener("click", async e => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    if (!listo) {
      busy(b, true, "Preparando PDF…");
      await preparando;
      busy(b, false);
      if (!listo) { toast("No se pudo armar el PDF" + (error ? ": " + error.message : ""), "error"); return; }
      // Si tardó, el navegador ya no deja abrir el menú de compartir en este toque
      if (b.dataset.m === "share" && navigator.canShare?.({ files: [listo.file] })) {
        toast("PDF listo: tocá “Compartir PDF” de nuevo");
        return;
      }
    }
    if (b.dataset.m === "save") { descargar(listo.blob); toast("PDF descargado", "success"); s.close(); return; }

    try { await navigator.share({ files: [listo.file], title: nombre }); s.close(); }
    catch (err) {
      if (err.name === "AbortError") return;
      console.warn(err);
      // El navegador pide un toque "fresco": el PDF ya está listo, se vuelve a tocar
      toast("Tocá “Compartir PDF” de nuevo", "info");
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  FORMULARIO (nuevo / editar)
// ═════════════════════════════════════════════════════════════
export function vistaFormulario(view, id = null) {
  const v = id ? getVehiculo(id) : null;
  // Vehículo de otra persona sin acceso de edición: vuelve al detalle y ofrece pedir acceso
  if (v && !puedoEditar(v)) {
    location.replace(`#/v/${v.id}`);
    setTimeout(() => pedirEdicion(v), 250);
    return;
  }
  if (id && !v) {
    setTopbar({ title: "Editar", back: "#/" });
    view.innerHTML = S.loadingVehicles ? `<div class="skeleton tall"></div>` : `<div class="empty"><h2>No encontramos este vehículo</h2></div>`;
    return;
  }
  const piezas = { ...(v?.piezas || {}) };
  const opciones = campo => [...new Set(activos().map(x => x[campo]).filter(Boolean))].sort()
    .map(o => `<option value="${esc(o)}">`).join("");

  setTopbar({ title: v ? "Editar vehículo" : "Nuevo vehículo", back: v ? `#/v/${v.id}` : "#/" });
  view.innerHTML = `
  <form class="vform" id="vform" novalidate>
    <div class="vform-cols">
          <div class="card form-fotos vform-fotos">
            ${botonesFotos({ id: "ff-in", extra: v?.fotos?.length ? ` <small class="cam-ya">(ya tiene ${v.fotos.length})</small>` : "" })}
            <div class="ff-grid" id="ff-grid"></div>
          </div>
        <fieldset class="card vform-veh">
          <legend>Vehículo</legend>
          <div class="grid-2">
            <label class="field"><span>Modelo</span>
              <input name="modelo" value="${esc(v?.modelo)}" placeholder="Toyota Corolla 2020" required autocomplete="off"></label>
            <label class="field" id="f-patente"><span>Patente</span>
              <input name="patente" value="${esc(v?.patente)}" placeholder="AB123CD" class="upper" autocomplete="off" autocapitalize="characters" maxlength="10"></label>
          </div>
        </fieldset>
        <fieldset class="card vform-cli">
          <legend>Cliente</legend>
          <div class="grid-2">
            <label class="field"><span>Asegurado</span>
              <input name="asegurado" value="${esc(v?.asegurado)}" placeholder="Nombre y apellido" autocomplete="off"></label>
            <label class="field"><span>Teléfono</span>
              <input name="telefono" value="${esc(v?.telefono)}" type="tel" inputmode="tel" placeholder="11 2345 6789"></label>
            <label class="field"><span>Compañía de seguro</span>
              <input name="compania" value="${esc(v?.compania)}" list="dl-comp" placeholder="Ej: La Segunda" autocomplete="off"></label>
            <label class="field"><span>Localidad</span>
              <input name="localidad" value="${esc(v ? v.localidad : (S.company?.name || ""))}" list="dl-loc" placeholder="Ej: Córdoba" autocomplete="off"></label>
          </div>
          <datalist id="dl-comp">${opciones("compania")}</datalist>
          <datalist id="dl-loc">${opciones("localidad")}</datalist>
        </fieldset>
        <div class="vform-der">
        <fieldset class="card vform-map">
          <legend class="leg-flex"><span>Paños afectados</span>
            <button type="button" class="btn btn-ghost btn-sm vista-btn" id="f-vista">3D</button></legend>
          <div class="vista-3d" id="f-3d" hidden></div>
          <div class="map-wrap">
            ${carMapSVG(piezas, { editable: true })}
            <div class="pieza-chips"></div>
          </div>
          <p class="pieza-resumen" aria-live="polite"></p>
          <div class="grado-pick">
            <span>Grado de daño</span>
            <div class="seg seg-sm" id="grado" role="radiogroup" aria-label="Grado de daño">
              ${[1, 2, 3].map(g => `<button type="button" class="seg-btn ${v?.grado === g ? "on" : ""}" data-g="${g}" role="radio" aria-checked="${v?.grado === g}">Grado ${g}</button>`).join("")}
            </div>
          </div>
        </fieldset>
        <fieldset class="card vform-precio">
          <legend>Precio</legend>
          <label class="field"><span class="money-in"><i>$</i><input name="precio" inputmode="numeric" aria-label="Precio" value="${v?.precio ? Number(v.precio).toLocaleString("es-AR") : ""}" placeholder="0"></span></label>
        </fieldset>
        </div>
        <details class="card vform-det">
          <summary>Adicionales</summary>
          <label class="field"><span>Observaciones</span>
            <textarea name="observaciones" rows="3" placeholder="Detalles adicionales">${esc(v?.observaciones)}</textarea></label>
          <label class="field"><span>Repuestos</span>
            <textarea name="repuestos" rows="2" placeholder="Ej: moldura, espejo">${esc(v?.repuestos)}</textarea></label>
          <label class="field"><span>Pintura</span>
            <input name="pintura" autocomplete="off" placeholder="Ej: capot, techo" value="${esc(v?.pintura)}"></label>
          <div class="field"><span>Documentos</span>
            <ul class="docs ff-docs" id="ff-docs"></ul>
            <label class="btn btn-ghost btn-sm ff-docs-btn">${icon("file")}Adjuntar documento
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" multiple hidden id="ff-doc-in"></label></div>
          ${v ? "" : `<label class="field"><span>Fecha de peritaje</span>
            <input name="fecha" type="date" value="${hoyISO()}"></label>`}
        </details>
    </div>

    <div class="vform-bar">
      <a class="btn btn-ghost" href="${v ? `#/v/${v.id}` : "#/"}">Cancelar</a>
      <button class="btn btn-primary btn-lg" type="submit">${icon("check")}${v ? "Guardar cambios" : "Guardar vehículo"}</button>
    </div>
  </form>`;

  const form = $("#vform", view);
  const mapa = montarMapa($(".vform-map", view), piezas);
  let vista3d = null;
  $("#f-vista", view).addEventListener("click", async e => {
    const b = e.currentTarget, caja = $("#f-3d", view), en3d = caja.hidden;
    caja.hidden = !en3d;
    $(".vform-map .carmap", view).style.display = en3d ? "none" : "";
    b.textContent = en3d ? "2D" : "3D";
    if (en3d) {
      caja.innerHTML = `<div class="skeleton" style="height:280px"></div>`;
      try {
        vista3d = await montar3D(caja, piezas, {
          editable: true,
          alTocar: k => { piezas[k] = !piezas[k]; vista3d?.pintar(piezas); mapa.refrescar(); }
        });
      } catch (err) { caja.innerHTML = `<p class="muted small center">${esc(err.message)}</p>`; }
    }
  });
  let grado = v?.grado || null;
  $("#grado", view).addEventListener("click", e => {
    const b = e.target.closest("[data-g]"); if (!b) return;
    const g = Number(b.dataset.g);
    grado = grado === g ? null : g; // tocar el marcado lo desmarca
    $$("#grado .seg-btn", view).forEach(x => { const on = Number(x.dataset.g) === grado; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
  });

  form.precio.addEventListener("input", e => {
    const d = e.target.value.replace(/\D/g, "");
    e.target.value = d ? Number(d).toLocaleString("es-AR") : "";
  });
  // Patente repetida en este operativo
  const repetida = pat => {
    const p = String(pat || "").replace(/\s+/g, "");
    return p.length >= 5 ? activos().find(x => x.patente === p && x.id !== v?.id) : null;
  };
  const avisoRepetida = () => {
    const otro = repetida(form.patente.value);
    let aviso = $("#aviso-patente", view);
    if (!otro) { aviso?.remove(); return; }
    if (!aviso) { aviso = document.createElement("p"); aviso.id = "aviso-patente"; aviso.className = "aviso-rep"; $("#f-patente", view).appendChild(aviso); }
    aviso.innerHTML = `Ya está cargada en este operativo: <a href="#/v/${otro.id}">${esc(otro.modelo || otro.patente)}</a>`;
  };
  form.patente.addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""); avisoRepetida(); });

  // Fotos cargadas desde el formulario: se suben mientras completás los datos
  const vid = v?.id || nuevoIdVehiculo();
  const nuevas = []; // { key, preview, estado: "subiendo"|"ok"|"error", foto }
  const pendientes = new Set();
  const pintarFotos = () => {
    $("#ff-grid", view).innerHTML = nuevas.map(n => `
      <figure class="ff ${n.estado}" data-k="${n.key}">
        <img src="${n.preview}" alt="">
        ${n.estado === "subiendo" ? `<span class="ff-spin"><span class="spin"></span></span>` : ""}
        ${n.estado === "error" ? `<span class="ff-err">!</span>` : ""}
        <button type="button" class="ph-del" data-quitar-nueva="${n.key}" aria-label="Quitar foto">${icon("x")}</button>
      </figure>`).join("");
  };
  conectarFotos($("#ff-in", view), files => {
    if (!files.length) return;
    if (!cloudinaryListo()) { toast("Falta configurar Cloudinary en js/config.js", "error"); return; }
    for (const file of files) {
      const n = { key: Math.random().toString(36).slice(2), preview: URL.createObjectURL(file), estado: "subiendo", foto: null };
      nuevas.push(n);
      const p = (async () => {
        try {
          const r = await subir(await comprimir(file), `${S.company.id}/${vid}`);
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          n.foto = { url: r.url, publicId: r.publicId, w: r.w, h: r.h, at: Date.now(), by: S.user.uid };
          n.estado = "ok";
        } catch (err) { console.error(err); n.estado = "error"; }
        pintarFotos();
      })();
      pendientes.add(p); p.finally(() => pendientes.delete(p));
    }
    pintarFotos();
  });
  // Documentos desde el formulario: se suben en segundo plano igual que las fotos
  const docsNuevos = []; // { key, name, estado, doc }
  const pintarDocs = () => {
    $("#ff-docs", view).innerHTML = docsNuevos.map(d => `
      <li><span class="ff-doc ${d.estado}">${d.estado === "subiendo" ? `<span class="spin"></span>` : icon("file")}<span>${esc(d.name)}</span></span>
        <button type="button" class="icon-btn sm" data-quitar-doc="${d.key}" aria-label="Quitar documento">${icon("x")}</button></li>`).join("");
  };
  $("#ff-doc-in", view).addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (!files.length) return;
    if (!cloudinaryListo()) { toast("Falta configurar Cloudinary en js/config.js", "error"); return; }
    for (const file of files) {
      const d = { key: Math.random().toString(36).slice(2), name: file.name, estado: "subiendo", doc: null };
      docsNuevos.push(d);
      const p = (async () => {
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: supera 10 MB`);
          const r = await subir(file, `${S.company.id}/${vid}`, { tipo: "auto", nombre: file.name });
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          d.doc = { url: r.url, publicId: r.publicId, name: file.name, bytes: r.bytes, format: r.format, at: Date.now() };
          d.estado = "ok";
        } catch (err) {
          console.error(err); toast(err.message, "error");
          docsNuevos.splice(docsNuevos.indexOf(d), 1);
        }
        pintarDocs();
      })();
      pendientes.add(p); p.finally(() => pendientes.delete(p));
    }
    pintarDocs();
  });
  $("#ff-docs", view).addEventListener("click", e => {
    const b = e.target.closest("[data-quitar-doc]"); if (!b) return;
    const i = docsNuevos.findIndex(d => d.key === b.dataset.quitarDoc);
    if (i < 0) return;
    const [d] = docsNuevos.splice(i, 1);
    if (d.doc && tokensBorrado.has(d.doc.publicId)) borrarConToken(tokensBorrado.get(d.doc.publicId));
    pintarDocs();
  });

  $("#ff-grid", view).addEventListener("click", e => {
    const b = e.target.closest("[data-quitar-nueva]"); if (!b) return;
    const i = nuevas.findIndex(n => n.key === b.dataset.quitarNueva);
    if (i < 0) return;
    const [n] = nuevas.splice(i, 1);
    if (n.foto && tokensBorrado.has(n.foto.publicId)) borrarConToken(tokensBorrado.get(n.foto.publicId));
    pintarFotos();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const f = form;
    const otro = repetida(f.patente.value);
    if (otro) {
      if (await confirmar({ title: `La patente ${otro.patente} ya está cargada`,
        message: `Es ${otro.modelo || "un vehículo"} de este operativo. Para no duplicarlo, abrí ese y agregale lo que falte.`, ok: "Abrir ese vehículo" })) go(`#/v/${otro.id}`);
      return;
    }
    if (!f.modelo.value.trim() && !f.patente.value.trim()) {
      toast("Poné al menos el modelo o la patente", "warning"); marcarError(f.modelo); return;
    }
    const data = {
      modelo: f.modelo.value.trim(),
      patente: f.patente.value.trim().replace(/\s+/g, ""),
      asegurado: f.asegurado.value.trim(),
      telefono: f.telefono.value.trim(),
      compania: f.compania.value.trim(),
      localidad: f.localidad.value.trim() || (v ? "" : S.company?.name || ""),
      observaciones: f.observaciones.value.trim(),
      repuestos: f.repuestos.value.trim(),
      pintura: f.pintura.value.trim(),
      precio: Number(f.precio.value.replace(/\D/g, "")) || 0,
      piezas: Object.fromEntries(Object.entries(piezas).filter(([, on]) => on)),
      grado
    };
    const nuevoId = vid;
    if (!v) data.fechas = { peritado: f.fecha.value || hoyISO() };
    if (pendientes.size) {
      const b = $("button[type=submit]", form);
      busy(b, true, "Subiendo archivos…");
      await Promise.allSettled([...pendientes]);
      busy(b, false);
    }
    const listas = nuevas.filter(n => n.foto).map(n => n.foto);
    if (listas.length) data.fotos = [...(getVehiculo(vid)?.fotos || v?.fotos || []), ...listas];
    const docsListos = docsNuevos.filter(d => d.doc).map(d => d.doc);
    if (docsListos.length) data.archivos = [...(getVehiculo(vid)?.archivos || v?.archivos || []), ...docsListos];
    // Con la caché offline el cambio se ve al instante; la red sincroniza sola.
    guardarVehiculo(nuevoId, data, !v).catch(err => toast("No se guardó: " + mensajeError(err), "error"));
    toast(v ? "Cambios guardados" : "Vehículo guardado", "success");
    go(`#/v/${nuevoId}`);
  });

}
