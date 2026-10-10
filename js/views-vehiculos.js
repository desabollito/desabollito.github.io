import { BOT_API } from "./config.js";
import { botonesFotos, conectarFotos } from "./camara.js";
import {
  S, activos, getVehiculo, guardarVehiculo, actualizarVehiculo, cambiarEstado, moverAPapelera,
  solicitarEliminacion, cargadoPor, esDeWhatsApp, puedoEditar, esMioV, crearSolicitud, yaPedi,
  nuevoIdVehiculo, soyAdmin, mensajeError, ultimoDeshacible, deshacerCambio, aseguradoDePadron,
  soyDesmontaje, agregarDesmontaje, elegirDesmontador, borrarMedia, soyLector, linkVehiculo
} from "./data.js";
import { ESTADOS, ESTADO, SECUENCIA, PASO_REP, PIEZA, ORDEN_PIEZAS, estadoActual, piezasMarcadas } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet,
  confirmar, busy, debounce, marcarError, horaDe } from "./ui.js";
import { carMapSVG, montarMapa } from "./carmap.js";
import { montar3D } from "./car3d.js";
import { subir, comprimir, borrarConToken, thumb, grande, cloudinaryListo, esVideo, videoURL } from "./media.js";
import { presupuestoPDF, nombreArchivo } from "./pdf.js";
import { armarZip } from "./zip.js";
import { setTopbar, go, esAncho } from "./shell.js";

// Filtros de la lista (se conservan al navegar)
const F = { estado: "todos", q: "", mios: false, orden: "fecha", dir: -1, grado: null, repuestos: null, pintura: null, turno: null, cias: new Set() }; // grado: null = todos, 0 = sin grado
const ORDENES = [["fecha", "Fecha"], ["patente", "Patente"], ["modelo", "Modelo"], ["estado", "Estado"]];
function ordenar(lista) {
  if (F.orden === "fecha" && F.dir === -1) return lista;   // ya viene ordenada por fecha, la más nueva arriba
  const clave = v => F.orden === "fecha" ? (v.fechas?.peritado || "") : F.orden === "estado" ? String(ESTADOS.findIndex(e => e.key === estadoActual(v)) + 10)
    : String(v[F.orden] || "").toLowerCase();
  return [...lista].sort((a, b) => clave(a).localeCompare(clave(b), "es", { numeric: true }) * F.dir);
}
const tokensBorrado = new Map(); // publicId → delete_token (válido 10 min)

// ═════════════════════════════════════════════════════════════
//  LISTA
// ═════════════════════════════════════════════════════════════
// ¿Algún repuesto / paño de pintura del vehículo está en esa fase?
const docsOn = () => S.config?.documentos !== false;   // el creador puede apagar los documentos
const tieneEtapa = (v, tipo, fase) => itemsTexto(v[tipo]).some(x => etapaItem(v, tipo, x)[0] === fase);
// Compañías (filtro múltiple): ninguna o todas marcadas = se ven todas
const ciaDe = v => String(v.compania || "").trim() || "Sin compañía";
const ciasDisponibles = () => { const n = new Map(); activos().forEach(v => n.set(ciaDe(v), (n.get(ciaDe(v)) || 0) + 1)); return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
function filtrar(lista) {
  const todas = ciasDisponibles().map(([c]) => c);
  if (F.cias.size && todas.every(c => F.cias.has(c))) F.cias.clear();
  const q = F.q.trim().toLowerCase();
  return lista.filter(v =>
    (F.estado === "todos" || estadoActual(v) === F.estado) &&
    (!F.mios || esMioV(v)) &&
    (F.grado === null || (v.grado || 0) === F.grado) &&
    (!F.repuestos || tieneEtapa(v, "repuestos", F.repuestos)) &&
    (!F.pintura || tieneEtapa(v, "pintura", F.pintura)) &&
    (!F.turno || (estadoActual(v) === "turnado" && (F.turno === "si") === (v.turnoConfirmado === true))) &&
    (!F.cias.size || F.cias.has(ciaDe(v))) &&
    (!q || (q.startsWith("@")
      // "@usuario": los vehículos que cargó esa persona
      ? (q.length < 2 || cargadoPor(v).toLowerCase().startsWith(q) || ("@" + String(v.createdByName || "").toLowerCase().replace(/\s+/g, "")).startsWith(q.replace(/\s+/g, "")))
      : [v.modelo, v.patente, v.asegurado, v.compania, v.localidad, v.telefono]
        .some(x => (x || "").toLowerCase().includes(q)))));
}

// Historial del vehículo (lo más nuevo arriba). Los vehículos viejos arrancan con la carga.
// Historial con botón para deshacer el último cambio
function abrirHistorial(v0) {
  const v = getVehiculo(v0.id) || v0, ult = soyDesmontaje() || soyLector() ? null : ultimoDeshacible(v);
  const s = openSheet({ title: "Historial", body: `${ult ? `<button type="button" class="btn btn-ghost btn-block hist-undo" data-deshacer>${icon("rotate")}Deshacer último cambio</button>` : ""}${historialHTML(v)}` });
  $("[data-deshacer]", s.el)?.addEventListener("click", async () => {
    if (!(await confirmar({ title: "¿Estás seguro?", message: `Se deshace: “${ult.txt}”.`, ok: "Deshacer" }))) return;
    s.close();
    deshacerCambio(v, ult).then(() => toast("Cambio deshecho", "success")).catch(err => toast(mensajeError(err), "error"));
  });
}

// Color de cada línea del historial según de qué se trata (mismos colores que en la app)
function colorHist(txt = "") {
  const m = txt.match(/^Pasó a (\w+)/);
  if (m) return ESTADO[m[1].toLowerCase()]?.color || "";
  const f = txt.match(/: ([^:]+)$/);
  if (f) {
    const fase = f[1].trim().toLowerCase();
    for (const lista of Object.values(ETAPAS)) { const e = lista.find(x => x[1].toLowerCase() === fase); if (e) return e[2]; }
  }
  if (/^Deshizo/.test(txt)) return "#5f6b7a";
  return "";
}

function historialHTML(v) {
  const h = [...(v.historial || [])];
  if (!h.some(e => /^Carg/.test(e.txt))) {
    const t = v.createdAt?.toMillis?.() || (v.createdAt?.seconds ? v.createdAt.seconds * 1000 : 0);
    h.push({ t, por: esDeWhatsApp(v) ? String(v.createdByName || "").replace(/\s*\(WhatsApp\)$/, "") : v.createdByName, txt: esDeWhatsApp(v) ? "Cargó el vehículo por WhatsApp" : "Cargó el vehículo" });
  }
  h.sort((a, b) => (b.t || 0) - (a.t || 0));
  const cuando = t => t ? new Date(t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return `<ol class="hist">${h.map(e => `<li class="${colorHist(e.txt) ? "hc" : ""}" style="${colorHist(e.txt) ? `--c:${colorHist(e.txt)}` : ""}"><span class="hist-txt"><strong>${esc(e.por || "Alguien")}</strong> ${esc(String(e.txt || "").replace(/ por WhatsApp/g, ""))}</span><time>${cuando(e.t)}</time></li>`).join("")}</ol>`;
}

const gradoTag = v => v.grado ? `<span class="grado-tag g${v.grado} d-grado-tag">Grado ${v.grado}</span>` : "";
const gradoHTML = v => v.grado ? `<div class="grado-fila"><span class="grado-tag g${v.grado}">Grado ${v.grado}</span></div>` : "";

// Paños agrupados para el detalle en escritorio: centro y parantes, lateral izquierdo, lateral derecho
const GRUPOS_PIEZAS = [
  ["capot", "techo", "baul"],
  ["parante_izq", "gf_izq", "pd_izq", "pt_izq", "gt_izq"],
  ["parante_der", "gf_der", "pd_der", "pt_der", "gt_der"]
];
// Capot/techo/baúl en una línea; abajo, lado izquierdo y lado derecho en dos columnas
const listaPiezas = ks => `<ul class="piezas-list">${ks.map(k => `<li>${esc(PIEZA[k].label)}</li>`).join("")}</ul>`;
function piezasAgrupadas(v) {
  const [centro, izq, der] = GRUPOS_PIEZAS.map(g => g.filter(k => v.piezas?.[k]));
  return (centro.length ? listaPiezas(centro).replace('class="piezas-list"', 'class="piezas-list piezas-centro"') : "") +
    (izq.length || der.length ? `<div class="piezas-lados">
      <div><small class="muted">Lado izquierdo</small>${izq.length ? listaPiezas(izq) : `<p class="muted small">—</p>`}</div>
      <div><small class="muted">Lado derecho</small>${der.length ? listaPiezas(der) : `<p class="muted small">—</p>`}</div></div>` : "");
}

// Fecha de las tarjetas: la del peritaje o la del último estado (se elige en Ordenar y se recuerda en este equipo)
// Fecha de la lista (se elige en Ajustes)
const fechaVista = () => { try { return localStorage.getItem("fechaVista") || "peritado"; } catch { return "peritado"; } };
const claveFecha = v => { if (fechaVista() !== "estado" && !soyLector()) return "peritado"; const e = estadoActual(v); return v.fechas?.[e] ? e : "peritado"; };
function tarjeta(v, sel) {
  const foto = v.fotos?.[0]?.url, rot0 = v.fotos?.[0]?.rot, kf = claveFecha(v);
  return `
  <a class="vcard ${sel ? "sel" : ""}" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
    <span class="vthumb">${foto ? `<img src="${esc(thumb(foto, 160, rot0))}" alt="" loading="lazy">` : icon("car")}</span>
    <span class="vbody">
      <span class="vtop"><strong class="vmodel">${esc(v.modelo || "Sin modelo")}</strong>${estadoPill(v)}</span>
      <span class="vmid">${plate(v.patente, "sm")}${v._pending ? `<span class="sync" title="Pendiente de sincronizar"></span>` : ""}<time class="vfecha">${fechaCorta(v.fechas?.[kf])}</time></span>
      <span class="vsub"><span class="vcli">${esc(v.compania || "")}</span>${horaDe(v, kf) ? `<time>${horaDe(v, kf)}</time>` : ""}</span>
    </span>
  </a>`;
}

export function vistaVehiculos(view, selId = null) {
  const ancho = esAncho();
  const sel = selId ? getVehiculo(selId) : null;
  if (selId && !ancho) return vistaDetalle(view, selId);

  // Cuántos filtros/órdenes distintos de lo normal hay puestos (se ve en el botón)
  const cuantosActivos = () => [F.mios, F.grado !== null, F.repuestos, F.pintura, F.turno, F.cias.size > 0, F.orden !== "fecha" || F.dir !== -1].filter(Boolean).length;
  const marcarBoton = () => { const b = $("#tb-filtros"); if (!b) return; const k = cuantosActivos();
    b.classList.toggle("activo", k > 0); const n = $(".fo-badge", b); if (n) { n.textContent = k; n.hidden = !k; } };
  setTopbar({
    title: "Vehículos",
    sub: S.company?.name,
    actions: `<button class="icon-btn filtro-btn ${cuantosActivos() ? "activo" : ""}" id="tb-filtros" aria-label="Filtrar y ordenar" title="Filtrar y ordenar">${icon("filter")}<span class="fo-badge" ${cuantosActivos() ? "" : "hidden"}>${cuantosActivos()}</span></button>`
  });

  // En computadora los estados van en una fila a lo ancho de la pantalla, arriba de todo
  const strip = `<div class="estado-strip" id="estado-strip" role="tablist" aria-label="Filtrar por estado"></div>`;
  view.innerHTML = `
    ${ancho ? `<div class="estado-fila">${strip}</div>` : ""}
    <div class="split ${ancho ? "split-on" : ""}">
      <section class="pane-list">
        <div class="list-tools">
          <label class="search">${icon("search")}
            <input type="search" id="q" placeholder="Buscar patente, modelo…" value="${esc(F.q)}" autocomplete="off"></label>
          ${ancho ? "" : strip}
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
      // Link de perito: solo los estados que tienen algún vehículo
      ESTADOS.filter(e => !soyLector() || cuenta[e.key] || F.estado === e.key).map(e => `<button class="est ${F.estado === e.key ? "on" : ""}" data-e="${e.key}" style="--c:${e.color}">
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
    $("#limpiar", box)?.addEventListener("click", () => { F.q = ""; F.estado = "todos"; F.mios = false; F.cias.clear(); F.grado = null; F.repuestos = null; F.pintura = null; F.turno = null; marcarBoton(); $("#q", view).value = ""; pintar(); });
  };

  $("#q", view).addEventListener("input", debounce(e => { F.q = e.target.value; pintar(); }, 120));
  // Doble clic selecciona toda la búsqueda (en Mac no lo hacía solo)
  $("#q", view).addEventListener("dblclick", e => { e.target.select(); });
  $("#estado-strip", view).addEventListener("click", e => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    F.estado = F.estado === b.dataset.e ? "todos" : b.dataset.e; pintar();
  });
  // Un solo botón "Filtrar y ordenar": cada grupo es una fila de opciones (tocar una la elige; "Todos" la quita)
  $("#tb-filtros")?.addEventListener("click", () => {
    const lector = soyLector();
    const hoja = openSheet({ title: "Filtrar y ordenar", body: `<div class="fo">
      <section class="fo-sec"><h3>Ordenar por <small>tocá de nuevo para invertir</small></h3><div class="fo-seg" id="fo-orden"></div></section>
      <p class="muted small fo-ayuda">Sin nada marcado se ven todos. Tocá una opción para filtrar y tocala de nuevo para quitarla.</p>
      <section class="fo-sec"><h3>Grado</h3><div class="fo-seg" id="fo-grado"></div></section>
      <section class="fo-sec"><h3>Turnos</h3><div class="fo-seg" id="fo-turno"></div></section>
      <section class="fo-sec"><h3>Pintura</h3><div class="fo-seg" id="fo-pintura"></div></section>
      <section class="fo-sec"><h3>Repuestos</h3><div class="fo-seg" id="fo-repuestos"></div></section>
      ${lector ? "" : `<section class="fo-sec"><h3>Compañías <small>podés marcar varias</small></h3><div class="fo-chips" id="fo-cias"></div></section>
      <label class="fo-switch"><span>Solo los que cargué yo</span><input type="checkbox" id="fo-mios" ${F.mios ? "checked" : ""}></label>`}
      <div class="fo-pie"><button type="button" class="btn btn-ghost" id="fo-reset">Limpiar</button><button type="button" class="btn btn-primary" data-close id="fo-ver"></button></div>
    </div>` });
    const el = id => $(id, hoja.el);
    const n = f => activos().filter(f).length;
    // Opción de una fila: texto, cantidad y color opcional
    const op = (grupo, val, txt, cant, on, color) => `<button type="button" class="fo-op ${on ? "on" : ""}" data-g="${grupo}" data-v="${esc(String(val))}" ${color ? `style="--c:${color}"` : ""}>
      <span class="fo-txt">${color ? `<i class="f-dot"></i>` : ""}${txt}</span>${cant !== null && cant !== undefined ? `<b>${cant}</b>` : ""}</button>`;
    const pintarHoja = () => {
      el("#fo-orden").innerHTML = ORDENES.map(([k, t]) => op("orden", k, F.orden === k ? `${t} <i class="fo-flecha">${F.dir > 0 ? "↑" : "↓"}</i>` : t, null, F.orden === k)).join("");
      const gr = [[1, "G1"], [2, "G2"], [3, "G3"], [4, "G4"], [0, "Sin"]].filter(([g]) => !(g === 4 && lector) && (g !== 0 || n(v => !v.grado) || F.grado === 0));
      el("#fo-grado").innerHTML = gr.map(([g, t]) => op("grado", g, t, n(v => (v.grado || 0) === g), F.grado === g)).join("");
      el("#fo-turno").innerHTML = [["si", "Confirmados", "#22b07d", true], ["no", "Sin confirmar", "#e0a526", false]].map(([k, t, c, si]) =>
          op("turno", k, t, n(v => estadoActual(v) === "turnado" && (v.turnoConfirmado === true) === si), F.turno === k, c)).join("");
      ["pintura", "repuestos"].forEach(tipo => {
        el(`#fo-${tipo}`).innerHTML = ETAPAS[tipo].map(([k, t, c]) => op(tipo, k, t, n(v => tieneEtapa(v, tipo, k)), F[tipo] === k, c)).join("");
      });
      if (el("#fo-cias")) el("#fo-cias").innerHTML = ciasDisponibles().map(([c, k]) => `<button type="button" class="fo-op ${F.cias.has(c) ? "on" : ""}" data-cia="${esc(c)}">${esc(c)} <b>${k}</b></button>`).join("")
        || `<span class="muted small">Sin vehículos</span>`;
      const cant = filtrar(activos()).length;
      el("#fo-ver").textContent = `Ver ${cant} ${cant === 1 ? "vehículo" : "vehículos"}`;
      marcarBoton();
    };
    const aplicar = () => { pintar(); pintarHoja(); };
    hoja.el.addEventListener("click", e => {
      const c = e.target.closest("[data-cia]");
      if (c) { const k = c.dataset.cia; F.cias.has(k) ? F.cias.delete(k) : F.cias.add(k); return aplicar(); }
      if (e.target.closest("#fo-reset")) { F.mios = false; F.grado = null; F.repuestos = null; F.pintura = null; F.turno = null; F.cias.clear(); F.orden = "fecha"; F.dir = -1;
        if (el("#fo-mios")) el("#fo-mios").checked = false; return aplicar(); }
      const b = e.target.closest("[data-g]"); if (!b) return;
      const g = b.dataset.g, v = b.dataset.v;
      if (g === "orden") { if (F.orden === v) F.dir *= -1; else { F.orden = v; F.dir = v === "fecha" ? -1 : 1; } }
      // Sin "Todos": tocar la opción elegida la quita (ninguna elegida = todos)
      else if (g === "grado") F.grado = F.grado === Number(v) ? null : Number(v);
      else F[g] = F[g] === v ? null : v;   // turno, pintura, repuestos
      aplicar();
    });
    el("#fo-mios")?.addEventListener("change", e => { F.mios = e.target.checked; aplicar(); });
    pintarHoja();
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
    title: "Detalle", sub: v.patente || v.modelo || "", back: S.invitado?.uno ? null : (S.volverA || "#/"),
    actions: soyDesmontaje() || soyLector() ? "" : `<a class="icon-btn" href="#/editar/${v.id}" aria-label="Editar">${icon("edit")}</a>`
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

// Mensaje configurable desde el panel del dueño: {Vehiculo}, {Patente}, {Asegurado}… se completan con el vehículo
const VARS_WA = {
  vehiculo: v => v.modelo, modelo: v => v.modelo, patente: v => v.patente, asegurado: v => v.asegurado, cliente: v => v.asegurado,
  nombre: v => v.asegurado, telefono: v => v.telefono, compania: v => v.compania, aseguradora: v => v.compania,
  operativo: () => S.company?.name, localidad: v => v.localidad, grado: v => v.grado, precio: v => v.precio ? money(v.precio) : "",
  estado: v => ESTADO[estadoActual(v)]?.label || "", repuestos: v => v.repuestos, pintura: v => v.pintura,
  observaciones: v => v.observaciones, detalles: v => v.observaciones,
  fecha: v => fechaLarga(v.fechas?.peritado), peritaje: v => fechaLarga(v.fechas?.peritado),
  turno: v => fechaLarga(v.fechas?.turnado), horaturno: v => v.horaTurno, hora: v => v.horaTurno,
  usuario: () => String(S.profile?.name || "").trim().split(/\s+/)[0], yo: () => String(S.profile?.name || "").trim().split(/\s+/)[0],
  saludo: () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches"; }
};
const claveVar = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
export function textoWa(plantilla, v) {
  let t = String(plantilla || "").trim();
  const q = t.match(/[?&]text=([\s\S]*)$/i);   // se puede pegar el link entero (wa.me/numero?text=…)
  if (q) { t = q[1]; try { t = decodeURIComponent(t.replace(/\+/g, " ")); } catch { /* texto ya legible */ } }
  else if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(t)) t = "";
  return t.replace(/\{([^{}]+)\}/g, (m, k) => { const f = VARS_WA[claveVar(k)]; return f ? String(f(v) ?? "").trim() : m; })
    .replace(/[ \t]{2,}/g, " ").trim();
}
// Solo con el vehículo reparado; antes, el WhatsApp abre sin texto
const mensajeWa = v => ["reparado", "llamado"].includes(estadoActual(v)) ? textoWa(S.config?.mensajeWa, v) : "";

function waLink(tel, texto = "") {
  let d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (!d.startsWith("54")) d = "549" + d;
  else if (!d.startsWith("549")) d = "549" + d.slice(2);
  return `https://wa.me/${d}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

// "capot y techo, puerta" → ["Capot y techo", "Puerta"] (se separa solo con comas)
// Repuestos / pintura prolijos: "capot, espejo derecho" → "Capot, Espejo derecho"
const listaProlija = t => itemsTexto(t).join(", ");
// Cada ítem: primera letra mayúscula, el resto en minúscula (salvo siglas como ABS o palabras con números) y sin punto final
const prolijo = x => x.trim().replace(/[.;:\s]+$/, "").split(/\s+/)
  .map((w, i) => /\d/.test(w) || (/^[A-ZÁÉÍÓÚÑ]{2,4}$/.test(w)) ? w : (i ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");
const itemsTexto = t => String(t || "").split(/\n|,/).map(prolijo).filter(Boolean);

// Estado de cada repuesto y de cada paño de pintura: se toca el ítem y se elige
const ETAPAS = {
  repuestos: [["sinpedir", "Sin pedir", "#e5484d"], ["pedido", "Pedido", "#e0a526"], ["recibido", "Recibido", "#4f8ff7"], ["colocado", "Colocado", "#22b07d"]],
  pintura: [["pendiente", "Sin pintar", "#e5484d"], ["pedido", "Pedido", "#e0a526"], ["turnado", "Turnado", "#4f8ff7"], ["pintado", "Pintado", "#22b07d"]]
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
  // Llegó desde una notificación de fotos: se abre esa foto
  if (S.abrirFoto?.vid === v.id) {
    const f = S.abrirFoto; S.abrirFoto = null;
    setTimeout(() => { const lista = (f.desm ? v.desFotos : v.fotos) || [], i = lista.findIndex(x => x.url === f.url); if (i >= 0) visor(lista, i, f.desm ? null : v); }, 250);
  }
  if (vid3D !== v.id) { vid3D = v.id; modo3D = false; } // al abrir otro vehículo, arranca en 2D
  const est = estadoActual(v);
  const anulado = est === "anulado";
  const marcadas = piezasMarcadas(v);
  const todos = marcadas.length === ORDEN_PIEZAS.length;
  const esMio = esMioV(v);
  const soloVer = soyDesmontaje() || soyLector();   // Desmontaje: solo ve y carga desmontajes; link de perito: solo ve
  const nDesm = (v.desFotos?.length || 0) + (v.desNotas?.length || 0);

  root.innerHTML = `
  <article class="detail">
    <header class="d-head">
      ${v.fotos?.length
        ? `<button class="d-cover" data-act="galeria" aria-label="Ver las ${v.fotos.length} fotos">
             <img src="${esc(thumb(v.fotos[0].url, 240, v.fotos[0].rot))}" alt=""><span class="d-cover-n">${icon("camera")}${v.fotos.length}</span></button>`
        : `<div class="d-cover vacio">
             ${soloVer ? `<span class="d-cover-cam">${icon("image")}</span>` : `<button type="button" class="d-cover-cam" id="d-cover-fotos" aria-label="Agregar fotos">${icon("image")}<small>Fotos</small></button>`}
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
          <a href="${waLink(v.telefono, soyLector() ? "" : mensajeWa(v))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>
          <a href="tel:${esc(v.telefono)}">${icon("phone")}Llamar</a>
        </div></div>` : ""}
      ${embebido && !soloVer ? `<a class="btn btn-ghost btn-icon" href="#/editar/${v.id}" aria-label="Editar" title="Editar">${icon("edit")}</a>` : ""}
    </div>
${[...PASO_REP, "facturado"].includes(est) && !soyLector() && (soyAdmin() || soyDesmontaje()) ? `<button class="btn btn-ghost btn-block d-desm" data-act="desmontaje">${icon("tool")}Desmontaje${nDesm || v.desmontador ? ` <small>${[v.desmontador?.nombre, nDesm ? `${v.desFotos?.length || 0} fotos` : ""].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</button>` : ""}

    <section class="d-sec">
      <div class="seg-head"><h3>Seguimiento</h3>
        ${soloVer ? "" : `<button class="link-btn small ${anulado ? "" : "danger"}" data-act="anular">${anulado ? "Reactivar" : "Anular"}</button>`}</div>
      <ol class="stepper ${anulado ? "is-anulado" : ""}">
        ${["peritado", "turnado", "rep", "facturado"].map(k => {
          const aus = k === "turnado" && est === "ausente";
          // Paso de reparación: muestra la etapa actual (Reparando, Revisión, Llamado o Entregado)
          const sub = k === "rep" ? (PASO_REP.includes(est) ? est : est === "facturado" ? "entregado" : null) : null;
          const kk = k === "rep" ? (sub || "enreparacion") : k;
          const enRep = !!sub && sub !== "entregado";   // Reparando, Revisión y Contactado: color suave, sin tilde
          const e = aus ? ESTADO.ausente : ESTADO[kk];
          const hecho = !anulado && (k === "rep" ? sub === "entregado" : !!v.fechas?.[k]), actual = k === est || aus || (k === "rep" && PASO_REP.includes(est));
          const fechaK = k === "rep" ? (sub ? v.fechas?.[sub] : null) : v.fechas?.[k];
          return `<li><button class="step ${hecho ? "done" : ""} ${actual ? "now" : ""} ${aus ? "is-ausente" : ""} ${enRep ? "is-enrep" : ""}" data-estado="${k}" style="--c:${e.color}">
            <span class="dot">${hecho ? icon(aus ? "x" : "check") : ""}</span>
            <span class="step-l">${e.label}</span>
            <span class="step-d">${fechaK ? fechaCorta(fechaK) : "—"}${(k === "peritado" || k === "turnado") && v.fechas?.[k] && horaDe(v, k) ? `<br>${horaDe(v, k)}` : ""}</span>
            ${k === "turnado" && est === "turnado" ? `<span class="step-conf ${v.turnoConfirmado ? "ok" : ""}">${v.turnoConfirmado ? "Confirmado" : "Esperando confirmación"}</span>` : ""}</button></li>`;
        }).join("")}
      </ol>
      ${anulado ? `<p class="muted small">Anulado el ${fechaCorta(v.fechas?.anulado)}</p>` : ""}
    </section>

    ${soloVer && !(anulado ? v.razonAnulacion : v.postReparacion) ? "" : anulado ? `<section class="d-sec d-post">
      <h3>Razón de la anulación</h3>
      <textarea class="post-rep" data-campo="razonAnulacion" rows="1" ${soloVer ? "readonly" : ""} placeholder="Ej: el cliente desistió, etc">${esc(v.razonAnulacion || "")}</textarea>
    </section>` : [...PASO_REP, "facturado"].includes(est) || ["enreparacion", "reparado", "llamado", "entregado", "facturado"].some(k => v.fechas?.[k]) ? `<section class="d-sec d-post">
      <h3>Notas post-reparación</h3>
      <textarea class="post-rep" data-campo="postReparacion" rows="1" ${soloVer ? "readonly" : ""} placeholder="Regresó por tal motivo, etc">${esc(v.postReparacion || "")}</textarea>
    </section>` : ""}

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
          : piezasAgrupadas(v)}</div>
      </div>
      <p class="piezas-caption caption-3d" ${modo3D ? "" : "hidden"}>Arrastrá para girar · tocá un paño</p>
`}
    </section>`}

    ${v.observaciones ? `<section class="d-sec"><h3>Observaciones</h3><p class="prose">${esc(v.observaciones)}</p></section>` : ""}
    ${chipsSec("Repuestos", v, "repuestos")}
    ${chipsSec("Pintura", v, "pintura")}

    ${(() => {
      // Adicionales: con una sola cosa (ej. la firma) va directo, sin desplegable
      const partes = [docsOn() && v.archivos?.length ? `<section class="d-sub">
      <div class="sec-head"><h3>Documentos <small>${v.archivos?.length || 0}</small></h3></div>
      <ul class="docs">${(v.archivos || []).map((a, i) => `
        <li><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("file")}<span>${esc(a.name)}</span></a>
          ${soloVer ? "" : `<button class="icon-btn sm" data-del-doc="${i}" aria-label="Quitar documento">${icon("x")}</button>`}</li>`).join("")}</ul>
    </section>` : "",
        v.fechas?.reparado || v.fechas?.facturado || v.firma ? `<section class="d-sub">
      <div class="sec-head"><h3>Firma del cliente</h3>
        ${soloVer ? "" : `<button class="btn btn-ghost btn-sm" data-act="firma">${icon("sign")}${v.firma ? "Volver a firmar" : "Firmar"}</button>`}</div>
      ${v.firma ? `<img class="firma-img" src="${esc(v.firma)}" alt="Firma del cliente">`
        : ""}
    </section>` : ""].filter(Boolean);
      if (!partes.length) return "";
      if (partes.length === 1) return partes[0].replace('class="d-sub"', 'class="d-sec"');
      return `<details class="d-sec d-adic" ${adicAbierto ? "open" : ""}><summary><h3>Adicionales</h3></summary>${partes.join("")}</details>`;
    })()}

    <footer class="d-foot">
      <span class="d-autor"><button class="icon-btn sm hist-btn" data-act="historial" aria-label="Historial" title="Historial">${icon("clock")}</button>${!soloVer && puedoEditar(v) && S.companies.length > 1 ? `<button class="icon-btn sm hist-btn" data-act="mover" aria-label="Mover a otro operativo" title="Mover a otro operativo">${icon("swap")}</button>` : ""}Cargado por ${esc(cargadoPor(v))}</span>
      <span class="d-foot-btns">
        ${soloVer ? "" : `<button class="icon-btn danger" data-act="borrar" aria-label="Eliminar vehículo" title="Eliminar">${icon("trash")}</button>`}
      </span>
    </footer>
  </article>`;

  $(".d-adic", root)?.addEventListener("toggle", e => { adicAbierto = e.target.open; });
  // Adicionales post-reparación: una línea que crece sola; se guarda al dejar de escribir
  const post = $(".post-rep", root);
  if (post) {
    const crecer = () => { post.style.height = "auto"; post.style.height = post.scrollHeight + 2 + "px"; };
    requestAnimationFrame(crecer);
    let reloj = null;
    const guardar = () => {
      clearTimeout(reloj);
      const txt = post.value.trim(), campo = post.dataset.campo, nombre = campo === "razonAnulacion" ? "la razón de la anulación" : "notas post-reparación";
      if (txt === String(v[campo] || "").trim()) return;
      v[campo] = txt;
      actualizarVehiculo(v.id, { [campo]: txt }, txt ? `Anotó ${nombre}` : `Borró ${nombre}`)
        .catch(err => toast(mensajeError(err), "error"));
    };
    post.addEventListener("input", () => { crecer(); clearTimeout(reloj); reloj = setTimeout(guardar, 1500); });
    post.addEventListener("blur", guardar);
  }
  if (modo3D && marcadas.length) iniciar3D(root, v);

  // Mantener apretado "Turnado" (con el auto turnado): lo marca Ausente; otra vez, vuelve a Turnado
  let pasoLargo = false, relojPaso = null;
  const pasoTurno = $('[data-estado="turnado"]', root);
  pasoTurno?.addEventListener("pointerdown", () => {
    pasoLargo = false;
    if (soloVer) return;
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
  // Mantener apretado Reparación o Facturado: cambiar las fechas
  $$('[data-estado="rep"], [data-estado="facturado"]', root).forEach(paso => {
    let reloj = null;
    paso.addEventListener("pointerdown", () => {
      pasoLargo = false;
      if (soloVer) return;
      reloj = setTimeout(() => {
        pasoLargo = true; navigator.vibrate?.(30);
        const cur = getVehiculo(v.id) || v;
        if (paso.dataset.estado === "facturado") elegirFechaEstado(cur, "facturado"); else fechasReparacion(cur);
      }, 600);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => paso.addEventListener(ev, () => clearTimeout(reloj)));
    paso.addEventListener("contextmenu", e => e.preventDefault());
  });

  // Mantener apretado el tacho: ofrece borrar solo las fotos del vehículo
  const tacho = $('[data-act="borrar"]', root);
  let tachoLargo = false, relojTacho = null;
  tacho?.addEventListener("pointerdown", () => {
    tachoLargo = false;
    relojTacho = setTimeout(async () => {
      tachoLargo = true; navigator.vibrate?.(30);
      const n = (getVehiculo(v.id) || v).fotos?.length || 0;
      if (!n) return toast("Este vehículo no tiene fotos");
      if (!esMio && !soyAdmin()) return toast("Solo quien cargó el vehículo puede borrar sus fotos", "error");
      if (await confirmar({ title: `¿Borrar solo las fotos?`, message: `Se borran las ${n} ${n === 1 ? "foto" : "fotos"} de ${v.modelo || v.patente || "este vehículo"}. Los datos del vehículo quedan.`, ok: "Borrar fotos", danger: true }))
        actualizarVehiculo(v.id, { fotos: [] }, `Borró las ${n} fotos`).then(() => toast("Fotos borradas", "success")).catch(err => toast(mensajeError(err), "error"));
    }, 600);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => tacho?.addEventListener(ev, () => clearTimeout(relojTacho)));
  tacho?.addEventListener("contextmenu", e => e.preventDefault());

  // Acciones
  root.addEventListener("click", async e => {
    const t = e.target;
    // Rol Desmontaje: no modifica nada del vehículo
    if (soloVer && (t.closest("[data-estado], .etapa-item, [data-del-foto], [data-del-doc]") || ["anular", "borrar", "firma", "mover"].includes(t.closest("[data-act]")?.dataset.act))) return;
    if (soyLector() && ["desmontaje", "fotos", "subir", "docs"].includes(t.closest("[data-act]")?.dataset.act)) return;
    if (t.closest("[data-act]")?.dataset.act === "desmontaje") return abrirDesmontaje(v);
    const step = t.closest("[data-estado]");
    if (step) {
      if (pasoLargo) { pasoLargo = false; return; }
      const cur = getVehiculo(v.id) || v;   // estado al día (por si la vista no se redibujó)
      // Paso de reparación: cada toque avanza solo (sin pedir fecha): Reparando → Revisión → Llamado → Entregado
      if (step.dataset.estado === "rep") {
        const ahora = estadoActual(cur), i = PASO_REP.indexOf(ahora);
        if (ahora === "entregado" || ahora === "facturado") return toast("Ya está entregado");
        const sig = i < 0 ? "enreparacion" : PASO_REP[i + 1];
        cambiarEstado(cur, sig, hoyISO()).catch(err => toast(mensajeError(err), "error"));
        toast(ESTADO[sig].label, "success");
        if (sig === "llamado") setTimeout(() => ofrecerAvisoCliente(cur), 350);
        return;
      }
      // Facturado: un toque y queda con la fecha de hoy (mantener apretado para elegir otra)
      if (step.dataset.estado === "facturado") {
        if (estadoActual(cur) === "facturado") return toast("Ya está facturado · mantené apretado para cambiar la fecha");
        cambiarEstado(cur, "facturado", hoyISO()).catch(err => toast(mensajeError(err), "error"));
        return toast(`Facturado · ${fechaCorta(hoyISO())}`, "success");
      }
      return elegirFechaEstado(cur, step.dataset.estado);
    }
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
      const cerrar = () => { m.hidden = true; btn.setAttribute("aria-expanded", "false"); $(".menu-velo")?.remove(); };
      if (!abrir) return cerrar();
      m.hidden = false; btn.setAttribute("aria-expanded", "true");
      // Fondo desenfocado detrás del menú; tocarlo lo cierra
      const velo = document.createElement("div"); velo.className = "menu-velo"; velo.onclick = cerrar;
      document.body.appendChild(velo);
      $$("a", m).forEach(a => a.addEventListener("click", () => setTimeout(cerrar, 50), { once: true }));
      return;
    }
    if (act === "anular") {
      // Anular o reactivar: quien lo cargó o un administrador (de cualquier vehículo del operativo)
      if (!esMio && !soyAdmin()) return toast("Solo un administrador o quien lo cargó puede anularlo", "error");
      if (anulado) {
        const ultimo = SECUENCIA.filter(k => v.fechas?.[k]).pop() || "peritado";
        return cambiarEstado(v, ultimo, v.fechas?.[ultimo] || hoyISO()).catch(err => toast(mensajeError(err), "error"));
      }
      if (await confirmar({ title: "¿Anular este trabajo?", message: "Queda registrado como anulado. Podés reactivarlo después.", ok: "Anular", danger: true }))
        cambiarEstado(v, "anulado").catch(err => toast(mensajeError(err), "error"));
      return;
    }
    if (act === "historial") { abrirHistorial(v); return; }
    if (act === "mover") { moverDeOperativo(v); return; }
    if (act === "borrar" && tachoLargo) { tachoLargo = false; return; }
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
  // Sin fotos: "Fotos" pregunta si usar la cámara o la galería
  $("#d-cover-fotos", root)?.addEventListener("click", () => {
    const hoja = openSheet({ title: "Agregar fotos", body: botonesFotos({ id: "cov-op" }) });
    conectarFotos($("#cov-op", hoja.el), files => { hoja.close(); if (files.length) subirAdjuntos(v, files, "foto", root); });
  });
  $$("[data-up]", root).forEach(inp => inp.addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length) subirAdjuntos(v, files, inp.dataset.up, root);
  }));
}

// Mover el vehículo a otro operativo (pregunta antes)
function moverDeOperativo(v) {
  const ops = S.companies.filter(c => c.id !== S.company.id && c.roles?.[S.user.uid] !== "desmontaje");
  if (!ops.length) return toast("No tenés otro operativo donde moverlo", "error");
  const s = openSheet({ title: "Mover a otro operativo", body: `<div class="stack etapa-opciones">${ops.map(c =>
    `<button type="button" class="btn btn-block etapa-op" data-cid="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>` });
  s.el.addEventListener("click", async e => {
    const b = e.target.closest("[data-cid]"); if (!b) return;
    const c = ops.find(x => x.id === b.dataset.cid);
    s.close();
    if (!(await confirmar({ title: `¿Mover a ${c.name}?`, message: `${v.modelo || "El vehículo"} ${v.patente || ""} deja de estar en ${S.company.name} y pasa a ${c.name}, con todos sus datos y fotos.`, ok: "Mover" }))) return;
    try {
      const idToken = await S.user.getIdToken();
      const r = await fetch(`${BOT_API}/mover-vehiculo`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, cid: S.company.id, vid: v.id, destino: c.id }) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "No se pudo mover");
      toast(`Movido a ${c.name}`, "success");
      go("#/");
    } catch (err) { toast(err.message, "error"); }
  });
}

// ═════════════════ Desmontaje ═════════════════
// Fotos y notas agrupadas por carga (quién y cuándo), más el técnico que lo desmontó
function lotesDesm(v) {
  const g = new Map();
  const de = x => { const k = x.lote || `${x.uid}-${x.t}`; if (!g.has(k)) g.set(k, { t: x.t || 0, por: x.por || "", fotos: [], notas: [] }); return g.get(k); };
  (v.desFotos || []).forEach(f => de(f).fotos.push(f));
  (v.desNotas || []).forEach(n => de(n).notas.push(n.texto));
  return [...g.values()].sort((a, b) => b.t - a.t);
}
const fechaHora = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function abrirDesmontaje(v0) {
  const s = openSheet({ title: `Desmontaje · ${v0.patente || v0.modelo || ""}`, wide: true, body: `<div class="desm"></div>` });
  const caja = $(".desm", s.el);
  const pintar = () => {
    const v = getVehiculo(v0.id) || v0, lotes = lotesDesm(v);
    caja.innerHTML = `
      <div class="desm-quien"><span>Desmontado por</span>
        <button type="button" class="btn btn-ghost btn-sm" id="desm-tec">${icon("team")}${esc(v.desmontador?.nombre || "Elegir técnico")}</button></div>
      <button type="button" class="btn btn-primary btn-block" id="desm-add">${icon("plus")}Cargar fotos y texto</button>
      ${lotes.length ? lotes.map(l => `<div class="desm-lote">
        <div class="desm-cab"><strong>${esc(l.por || "—")}</strong><small>${l.t ? fechaHora(l.t) : ""}</small></div>
        ${l.notas.map(n => `<p class="prose">${esc(n)}</p>`).join("")}
        ${l.fotos.length ? `<div class="desm-fotos">${l.fotos.map(f => `<button type="button" data-dfoto="${esc(f.url)}"><img src="${esc(thumb(f.url, 200))}" alt="" loading="lazy">${esVideo(f) ? `<span class="play-ic">▶</span>` : ""}</button>`).join("")}</div>` : ""}
      </div>`).join("") : `<p class="muted center">Todavía no hay desmontaje cargado.</p>`}`;
  };
  pintar();
  caja.addEventListener("click", e => {
    const v = getVehiculo(v0.id) || v0;
    const f = e.target.closest("[data-dfoto]");
    if (f) { const todas = v.desFotos || []; return visor(todas, Math.max(0, todas.findIndex(x => x.url === f.dataset.dfoto))); }
    if (e.target.closest("#desm-add")) return formDesmontaje(v, () => setTimeout(pintar, 400));
    if (e.target.closest("#desm-tec")) return elegirTecnicoDesm(v, () => setTimeout(pintar, 400));
  });
}

function elegirTecnicoDesm(v, listo) {
  const c = S.company || {};
  // Solo los que tienen el rol Desmontador
  const miembros = (c.members || []).map(uid => ({ uid, nombre: c.memberNames?.[uid] || "Usuario", rol: c.roles?.[uid] }))
    .filter(m => m.rol === "desmontaje").sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!miembros.length && !v.desmontador) return toast("No hay desmontadores en el operativo. Asignale el rol Desmontador a alguien desde Operativo.", "error");
  const s = openSheet({ title: "¿Quién lo desmontó?", body: `<div class="stack etapa-opciones">
    ${miembros.map(m => `<button type="button" class="btn btn-block etapa-op ${v.desmontador?.uid === m.uid ? "on" : ""}" data-uid="${esc(m.uid)}">${esc(m.nombre)}</button>`).join("")}
    ${v.desmontador ? `<button type="button" class="btn btn-ghost btn-block" data-uid="">Quitar</button>` : ""}</div>` });
  s.el.addEventListener("click", e => {
    const b = e.target.closest("[data-uid]"); if (!b) return;
    const m = miembros.find(x => x.uid === b.dataset.uid) || null;
    s.close();
    elegirDesmontador(v, m).then(listo).catch(err => toast(mensajeError(err), "error"));
  });
}

// Formulario: fotos (cámara o galería) + texto
function formDesmontaje(v, listo) {
  let files = [];
  const s = openSheet({ title: `Desmontaje · ${v.patente || v.modelo || ""}`, body: `<form class="stack" id="desm-form">
      ${botonesFotos({ id: "desm-op" })}
      <p class="muted small" id="desm-n">Sin fotos</p>
      <label class="field"><span>Texto</span><textarea name="texto" rows="3" placeholder="Ej: se desmontó techo y parantes"></textarea></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
  const contar = () => { $("#desm-n", s.el).textContent = files.length ? `${files.length} ${files.length === 1 ? "archivo" : "archivos"} (fotos o videos) listo${files.length === 1 ? "" : "s"}` : "Sin fotos ni videos"; };
  conectarFotos($("#desm-op", s.el), nuevas => { files.push(...nuevas); contar(); });
  $("#desm-form", s.el).onsubmit = async e => {
    e.preventDefault();
    const texto = e.target.texto.value.trim();
    if (!files.length && !texto) return toast("Agregá fotos o un texto", "error");
    if (files.length && !cloudinaryListo()) return toast("Falta configurar Cloudinary", "error");
    const b = $("button.btn-primary:last-child", e.target); busy(b, true, files.length ? "Subiendo fotos…" : "Guardando…");
    try {
      const subidas = [];
      const cola = files.map((f, n) => ({ f, n }));
      const trabajador = async () => { for (let x; (x = cola.shift());) {
        const r = await subirMedia(x.f, `${S.company.id}/${v.id}/desmontaje`);
        subidas.push({ url: r.url, publicId: r.publicId, n: x.n, ...(r.tipo ? { tipo: r.tipo } : {}) });
      } };
      await Promise.all([trabajador(), trabajador(), trabajador()]);
      subidas.sort((a, b) => a.n - b.n).forEach(x => delete x.n);
      await agregarDesmontaje(v, subidas, texto);
      toast("Desmontaje guardado", "success");
      s.close(); listo?.();
    } catch (err) { toast(mensajeError(err), "error"); busy(b, false); }
  };
}

// Rol Desmontaje: el "+" elige un vehículo ya cargado (tira + patente para filtrar)
export function elegirVehiculoDesmontaje() {
  const s = openSheet({ title: "Cargar desmontaje", wide: true, body: `<div class="stack">
      <label class="search">${icon("search")}<input type="search" id="dv-q" placeholder="Patente o modelo" autocomplete="off" autocapitalize="characters"></label>
      <div class="dv-tira" id="dv-lista"></div></div>` });
  const lista = $("#dv-lista", s.el), q = $("#dv-q", s.el);
  const norm = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pintar = () => {
    const f = norm(q.value);
    const vs = activos().filter(v => !f || norm(v.patente).includes(f) || norm(v.modelo).includes(f)).slice(0, 60);
    lista.innerHTML = vs.length ? vs.map(v => `<button type="button" class="dv-item" data-id="${esc(v.id)}">
        ${v.fotos?.length ? `<img src="${esc(thumb(v.fotos[0].url, 160, v.fotos[0].rot))}" alt="">` : `<span class="dv-sin">${icon("car")}</span>`}
        <strong>${esc(v.modelo || "Sin modelo")}</strong>${plate(v.patente)}</button>`).join("")
      : `<p class="muted center">No hay vehículos con esa patente.</p>`;
  };
  pintar();
  q.addEventListener("input", pintar);
  lista.addEventListener("click", e => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const v = getVehiculo(b.dataset.id); if (!v) return;
    s.close(); formDesmontaje(v);
  });
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

// Fechas de la reparación (Reparando, Revisión, Contactado, Entregado): se cambian sin cambiar el estado
function fechasReparacion(v) {
  const est = estadoActual(v), hasta = Math.max(PASO_REP.indexOf(est), ["facturado"].includes(est) ? PASO_REP.length - 1 : -1);
  const pasos = PASO_REP.filter((k, i) => i <= hasta || v.fechas?.[k]);
  if (!pasos.length) return toast("Todavía no entró a reparación");
  const s = openSheet({ title: "Fechas de la reparación", body: `<form class="stack">
    ${pasos.map(k => `<label class="field"><span>${esc(ESTADO[k].label)}</span><input type="date" name="${k}" value="${esc(v.fechas?.[k] || "")}"></label>`).join("")}
    <button class="btn btn-primary btn-block">Guardar</button></form>` });
  $("form", s.el).onsubmit = ev => {
    ev.preventDefault();
    const fechas = { ...(v.fechas || {}) };
    pasos.forEach(k => { const val = ev.target[k].value; if (val) fechas[k] = val; });
    actualizarVehiculo(v.id, { fechas }, "Cambió las fechas de la reparación").then(() => toast("Fechas guardadas", "success")).catch(err => toast(mensajeError(err), "error"));
    s.close();
  };
}

function elegirFechaEstado(v, estado) {
  const e = ESTADO[estado];
  const s = openSheet({
    title: `Marcar como ${e.label.toLowerCase()}`,
    body: `<form class="stack">
      <label class="field"><span>${estado === "turnado" ? "Fecha del turno" : "Fecha"}</span>
        <input type="date" name="f" value="${v.fechas?.[estado] || hoyISO()}" required></label>
      ${estado === "turnado" ? `<div class="turno-hora">
        <button type="button" class="link-btn" id="t-hora-btn" ${v.horaTurno ? "hidden" : ""}>${icon("clock")}Agregar horario del turno (opcional)</button>
        <label class="field" id="t-hora" ${v.horaTurno ? "" : "hidden"}><span>Horario del turno</span>
          <input type="time" name="h" value="${esc(v.horaTurno || "")}"></label></div>` : ""}
      ${estado === "turnado" ? `<div class="turno-conf"><span>¿El cliente confirmó el turno?</span>
        <button type="button" class="switch ${v.turnoConfirmado === true ? "on" : ""}" id="t-conf" role="switch" aria-checked="${v.turnoConfirmado === true}">
          <span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button></div>` : ""}
      <button class="btn btn-primary btn-block" style="--btn:${e.color}">Guardar</button></form>`
  });
  let confirmado = v.turnoConfirmado === true;
  $("#t-hora-btn", s.el)?.addEventListener("click", e => { e.currentTarget.hidden = true; $("#t-hora", s.el).hidden = false; $("#t-hora input", s.el).focus(); });
  $("#t-conf", s.el)?.addEventListener("click", e => {
    confirmado = !confirmado;
    e.currentTarget.classList.toggle("on", confirmado); e.currentTarget.setAttribute("aria-checked", confirmado);
  });
  $("form", s.el).onsubmit = ev => {
    ev.preventDefault();
    cambiarEstado(v, estado, ev.target.f.value, estado === "turnado" ? { turnoConfirmado: confirmado, horaTurno: ev.target.h?.value || "" } : {}).catch(err => toast(mensajeError(err), "error"));
    toast(`${e.label} · ${fechaCorta(ev.target.f.value)}`, "success");
    s.close();

  };
}

// Foto (se comprime) o video (va tal cual, hasta 100 MB)
async function subirMedia(file, carpeta) {
  if (String(file.type).startsWith("video/")) {
    if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name || "Video"}: supera 100 MB`);
    const r = await subir(file, carpeta, { tipo: "video" });
    return { ...r, tipo: "video" };
  }
  return subir(await comprimir(file), carpeta);
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
          const r = await subirMedia(file, carpeta);
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          nuevos.push({ url: r.url, publicId: r.publicId, w: r.w, h: r.h, at: Date.now(), by: S.user.uid, n, ...(r.tipo ? { tipo: r.tipo } : {}) });
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
  if (soyLector()) return;
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
  actualizarVehiculo(v.id, { [campo]: lista }, campo === "fotos" ? "Quitó una foto" : `Quitó el documento “${item.name}”`)
    .then(() => borrarMedia(v.id, [item])).catch(e => toast(mensajeError(e), "error"));
  if (tokensBorrado.has(item.publicId)) borrarConToken(tokensBorrado.get(item.publicId));
}

// Foto a pantalla completa: pellizcar o doble toque para hacer zoom, arrastrar para mover
function zoomFoto(url, previa) {
  const el = document.createElement("div");
  el.className = "zoom-foto";
  el.innerHTML = `<img alt="" src="${esc(previa || url)}"><button class="zoom-x" aria-label="Volver"><span>${icon("back")}Volver</span></button>`;
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
      <div class="viewer-foto"><img id="vw-img" alt=""><video id="vw-vid" controls playsinline preload="metadata" hidden></video><span class="viewer-carga" hidden><span class="spin"></span></span>
        ${v && puedoEditar(v) ? `<button class="icon-btn viewer-ov viewer-rot" id="vw-rot" aria-label="Girar foto" title="Girar">${icon("rotate")}</button>` : ""}
        <button class="icon-btn viewer-ov viewer-x" data-close aria-label="Cerrar">${icon("x")}</button>
        <button class="icon-btn viewer-ov viewer-dl" id="vw-dl" aria-label="Descargar" title="Descargar">${icon("download")}</button>
</div>
      <div class="viewer-bar">
        <button class="icon-btn" data-p aria-label="Anterior" ${fotos.length > 1 ? "" : "disabled"}>${icon("back")}</button>
        <span id="vw-n"></span>
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
  const vid = $("#vw-vid", s.el);
  const show = () => {
    const url = grande(fotos[i].url, 1600, fotos[i].rot);
    // Video: se reproduce en el visor (sin girar)
    const video = esVideo(fotos[i]);
    vid.hidden = !video; img0.hidden = video;
    $("#vw-rot", s.el)?.toggleAttribute("hidden", video);
    if (video) {
      const src = videoURL(fotos[i].url);
      if (vid.getAttribute("src") !== src) { vid.poster = url; vid.src = src; }
      carga.hidden = true;
      $("#vw-n", s.el).textContent = `${i + 1} de ${fotos.length}`;
      return;
    }
    vid.pause?.();
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
  const nombreFoto = n => `${String(v?.patente || v?.modelo || "foto").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${String(n + 1).padStart(2, "0")}.${esVideo(fotos[n]) ? "mp4" : "jpg"}`;
  const origen = f => esVideo(f) ? videoURL(f.url) : grande(f.url, 4000, f.rot).replace("f_auto", "f_jpg");
  const celular = matchMedia("(pointer: coarse)").matches;
  const bajar = async n => {
    const f = fotos[n], nombre = nombreFoto(n);
    if (celular) {
      // Celular (como antes): baja la foto directo y la guarda, sin pasos extra en Cloudinary
      try {
        const r = await fetch(origen(f)); if (!r.ok) throw new Error(r.status);
        const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nombre; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch { open(f.url, "_blank", "noopener"); }
      return;
    }
    // Computadora: Cloudinary la manda como descarga con el nombre PATENTE_NN (fl_attachment)
    const url = origen(f).replace("/upload/", `/upload/fl_attachment:${nombre.replace(/\.(jpg|mp4)$/, "")}/`);
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
    const baseNombre = nombreFoto(0).replace(/_01\.(jpg|mp4)$/, "");
    const traer = async n => {
      const f = fotos[n];
      const r = await fetch(origen(f));
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
      <button class="btn ${puedeCompartirArchivos() ? "btn-ghost" : "btn-primary btn-lg"} btn-block" data-m="save">${icon("download")}Descargar PDF</button>
      ${soyDesmontaje() ? "" : `<button class="btn btn-ghost btn-block" data-link>${icon("car")}Vehículo en App</button>
      <small class="muted center">Link para ver solo este vehículo, sin poder cambiar nada.</small>`}</div>`
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
    const lk = e.target.closest("[data-link]");
    if (lk) {
      busy(lk, true, "Creando link…");
      try {
        const url = await linkVehiculo(v.id);
        busy(lk, false);
        const txt = `${v.modelo || "Vehículo"} ${v.patente || ""}`.trim();
        if (navigator.share) { try { await navigator.share({ title: txt, text: txt, url }); s.close(); return; } catch (err) { if (err.name === "AbortError") return; } }
        await navigator.clipboard?.writeText(url).catch(() => {});
        toast("Link copiado", "success"); s.close();
      } catch (err) { busy(lk, false); toast(err.message, "error"); }
      return;
    }
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
          <datalist id="dl-comp">${[...new Set(["Particular", ...activos().map(x => x.compania).filter(Boolean)])].sort().map(o => `<option value="${esc(o)}">`).join("")}</datalist>
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
              ${[1, 2, 3, 4].map(g => `<button type="button" class="seg-btn ${g === 4 ? "g4" : ""} ${v?.grado === g ? "on" : ""}" data-g="${g}" role="radio" aria-checked="${v?.grado === g}" ${g === 4 ? `aria-label="Grado 4" title="Grado 4"` : ""}>${g === 4 ? "+" : `Grado ${g}`}</button>`).join("")}
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
          <div class="grid-2 ff-ultima">
            ${v ? "" : `<label class="field"><span>Fecha de peritaje</span>
              <input name="fecha" type="date" value="${hoyISO()}"></label>`}
            <div class="field" ${docsOn() ? "" : "hidden"}><span>Documentos</span>
              <label class="btn btn-ghost ff-docs-btn">${icon("file")}Adjuntar
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" multiple hidden id="ff-doc-in"></label></div>
          </div>
          <ul class="docs ff-docs" id="ff-docs"></ul>
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
  // Vehículo nuevo: si la patente está en la planilla de asegurados, completa el asegurado
  form.patente.addEventListener("change", async () => {
    if (v || form.asegurado.value.trim()) return;
    const nombre = await aseguradoDePadron(form.patente.value);
    if (nombre && !form.asegurado.value.trim()) { form.asegurado.value = nombre; toast(`Asegurado: ${nombre}`, "success"); }
  });

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
      repuestos: listaProlija(f.repuestos.value),
      pintura: listaProlija(f.pintura.value),
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
