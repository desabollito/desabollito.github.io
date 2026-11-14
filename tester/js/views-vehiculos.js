import { BOT_API } from "./config.js";
import { botonesFotos, conectarFotos } from "./camara.js";
import {
  S, activos, getVehiculo, guardarVehiculo, actualizarVehiculo, cambiarEstado, moverAPapelera,
  solicitarEliminacion, cargadoPor, esDeWhatsApp, puedoEditar, esMioV, crearSolicitud, yaPedi,
  nuevoIdVehiculo, soyAdmin, mensajeError, deshaciblesDe, deshacerCambio, aseguradoDePadron,
  soyDesmontaje, agregarDesmontaje, elegirDesmontador, borrarMedia, soyLector, linkVehiculo, soloVer, soySacabollos, usaClientes, chatEnMantenimiento,
  onChange, chatSinLeer, chatDeTel
} from "./data.js";
import { ESTADOS, ESTADO, SECUENCIA, PASO_REP, PIEZA, ORDEN_PIEZAS, estadoActual, esAnulado, piezasMarcadas } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet,
  confirmar, busy, debounce, marcarError, horaDe, glideMenu } from "./ui.js";
import { carMapSVG, montarMapa, pulsar } from "./carmap.js";
import { contar } from "./efectos.js";
import { subir, comprimir, borrarConToken, thumb, grande, cloudinaryListo, esVideo, videoURL } from "./media.js";
import { presupuestoPDF, nombreArchivo, tablaPDF } from "./pdf.js";
import { armarZip } from "./zip.js";
import { setTopbar, go, esAncho } from "./shell.js";
import { abrirChatDe, avisarTurnoChat, telWa } from "./views-otros.js";
// Chat en vivo con mensajes sin leer: puntito titilando en Contactar (y en "Chat en vivo" al abrir el menú)
const chatNuevo = tel => !!tel && usaClientes() && chatSinLeer(chatDeTel(tel));
onChange(e => { if (e === "chats") $$(".d-contacto[data-tel]").forEach(el => el.classList.toggle("chat-nuevo", chatNuevo(el.dataset.tel))); });

// Filtros de la lista (se conservan al navegar)
const nuevoF = () => ({ estado: new Set(), q: "", mios: false, sinAnul: false, orden: "fecha", dir: -1, grado: new Set(), repuestos: new Set(), pintura: new Set(), cliente: new Set(), cargado: new Set(), cias: new Set() }); // cada filtro: Set vacío = todos (se pueden marcar varias opciones de cada uno); grado 0 = sin grado
// Vehículos y calendario tienen filtros separados: F apunta a los de la pantalla que está usando el filtro en ese momento
const FV = nuevoF(), FC = nuevoF();
let F = FV;
const conF = (f, fn) => { const prev = F; F = f; try { return fn(); } finally { F = prev; } };

// Conformidad del cliente al entregar: carita y color de cada opción
const CARAS = { conforme: ["Conforme", "#22b07d", "M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2"], regular: ["Regular", "#e0a526", "M8.5 15.5h7"], desconforme: ["Desconforme", "#e0486e", "M8 16.5c1-1.4 2.4-2 4-2s3 .6 4 2"] };
const cara = k => `<svg class="cara" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="${CARAS[k][2]}"/></svg>`;
const conformidadHTML = v => `<div class="conf-ops">${Object.entries(CARAS).map(([k, [t, c]]) =>
  `<button type="button" class="conf-op ${v.conformidad === k ? "on" : ""}" data-conf="${k}" style="--c:${c}">${cara(k)}<span>${t}</span></button>`).join("")}</div>`;
// Tocar una carita la guarda; tocar la que ya estaba la quita
function elegirConformidad(el, v, alElegir) {
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-conf]"); if (!b) return;
    const cur = getVehiculo(v.id) || v, k = cur.conformidad === b.dataset.conf ? null : b.dataset.conf;
    $$("[data-conf]", el).forEach(x => x.classList.toggle("on", x.dataset.conf === k));
    actualizarVehiculo(v.id, { conformidad: k }, k ? `Cliente ${k}` : "Quitó la conformidad del cliente").catch(err => toast(mensajeError(err), "error"));
    alElegir?.();
  });
}
// ── Deslizar una tarjeta a la izquierda y mantener el dedo: pasa el vehículo al estado siguiente ──
// Hay que dejarlo hasta que se llene la barra (0,8 s), así no hay cambios sin querer
const PROX = { peritado: "turnado", turnado: "enreparacion", ausente: "enreparacion", enreparacion: "reparado", reparado: "llamado", llamado: "entregado", entregado: "facturado" };
function avanzarEstado(v) {
  const sig = PROX[estadoActual(v)]; if (!sig) return;
  if (sig === "turnado") return elegirFechaEstado(v, "turnado");   // el turno pide día y hora
  cambiarEstado(v, sig, hoyISO()).then(() => toast(`${v.patente || v.modelo || "Vehículo"} · ${ESTADO[sig].label}`, "success")).catch(err => toast(mensajeError(err), "error"));
  if (sig === "llamado") setTimeout(() => ofrecerAvisoCliente(v), 350);
  if (sig === "entregado") setTimeout(() => popupConformidad(v), 350);
}
function deslizarParaAvanzar(lista) {
  if (soyDesmontaje() || soloVer()) return;
  let g = null;
  lista.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    const card = e.target.closest("a.vcard"), v = card && getVehiculo(card.getAttribute("href").split("/").pop());
    const sig = v && PROX[estadoActual(v)];
    g = sig ? { card, v, sig, x0: e.clientX, y0: e.clientY, activo: false, armado: false, t: 0 } : null;
  });
  lista.addEventListener("pointermove", e => {
    if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.activo) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // está desplazando la lista
      if (dx > -14) return;
      g.activo = true; lista.classList.remove("lista-anim"); g.card.classList.add("desliza");
      g.card.insertAdjacentHTML("beforeend", `<span class="vswipe" style="--s:${ESTADO[g.sig].color}" aria-hidden="true"><b>${ESTADO[g.sig].label}</b><i class="vswipe-barra"></i><small>Mantené</small></span>`);
    }
    const x = Math.max(-124, Math.min(0, dx));
    g.card.style.transform = `translateX(${x}px)`;
    const armar = x <= -96;
    if (armar && !g.armado) {
      g.armado = true; g.card.classList.add("armado"); navigator.vibrate?.(10);
      const yo = g;
      g.t = setTimeout(() => { yo.hecho = true; yo.card.classList.add("hecho"); navigator.vibrate?.(30); avanzarEstado(getVehiculo(yo.v.id) || yo.v); }, 800);
    } else if (!armar && g.armado && !g.hecho) { g.armado = false; g.card.classList.remove("armado"); clearTimeout(g.t); }
  });
  const fin = () => {
    if (!g) return; const x = g; g = null;
    if (!x.hecho) clearTimeout(x.t);
    if (!x.activo) return;
    x.card.dataset.deslizado = "1";   // el toque que sigue no abre el vehículo
    x.card.classList.remove("desliza", "armado"); x.card.style.transform = "";
    setTimeout(() => { x.card.querySelector(".vswipe")?.remove(); x.card.classList.remove("hecho"); }, 260);
  };
  lista.addEventListener("pointerup", fin); lista.addEventListener("pointercancel", fin);
  lista.addEventListener("click", e => { const c = e.target.closest("a.vcard"); if (c?.dataset.deslizado) { e.preventDefault(); e.stopImmediatePropagation(); delete c.dataset.deslizado; } }, true);
}

function popupConformidad(v) {
  const s = openSheet({ title: "¿Cómo se fue el cliente?", body: conformidadHTML(getVehiculo(v.id) || v) });
  elegirConformidad(s.el, v, () => setTimeout(() => s.close(), 250));
}
const ORDENES = [["fecha", "Fecha"], ["patente", "Patente"], ["modelo", "Modelo"], ["estado", "Estado"]];
function ordenar(lista) {
  // Filtrando por estado, la fecha es la de ese estado (en Entregados, el último entregado arriba); sin filtro ya viene por fecha de peritado
  if (F.orden === "fecha" && F.dir === -1 && !F.estado.size) return lista;
  const clave = v => F.orden === "fecha" ? ((F.estado.size && v.fechas?.[estadoActual(v)]) || v.fechas?.peritado || "") :F.orden === "estado" ? String(ESTADOS.findIndex(e => e.key === estadoActual(v)) + 10)
    : String(v[F.orden] || "").toLowerCase();
  return [...lista].sort((a, b) => clave(a).localeCompare(clave(b), "es", { numeric: true }) * F.dir);
}
const tokensBorrado = new Map(); // publicId → delete_token (válido 10 min)

// ═════════════════════════════════════════════════════════════
//  LISTA
// ═════════════════════════════════════════════════════════════
// ¿Algún repuesto / paño de pintura del vehículo está en esa fase?
const docsOn = () => S.config?.documentos !== false;   // el creador puede apagar los documentos
// Filtro "Cargado": con fotos o notas de desmontaje, con algo en el check in / out, o con firma digital del cliente
const CARGADO = { desm: v => !!(v.desFotos?.length || v.desNotas?.length), check: v => [v.checkIn, v.checkOut].some(c => c && Object.keys(c).length), firma: v => !!v.firma };
const tieneEtapa = (v, tipo, fase) => itemsTexto(v[tipo]).some(x => etapaItem(v, tipo, x)[0] === fase);
// "Ocultar anulados": los anulados no se cuentan ni se listan
const visibles = () => activos().filter(v => !F.sinAnul || !esAnulado(v));
// Compañías (filtro múltiple): ninguna o todas marcadas = se ven todas
// Compañías para el formulario: las más usadas primero
const ciasPorCantidad = () => { const n = new Map([["Particular", 0]]); activos().forEach(v => { const c = String(v.compania || "").trim(); if (c) n.set(c, (n.get(c) || 0) + 1); }); return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c); };
const ciaDe = v => String(v.compania || "").trim() || "Sin compañía";
const ciasDisponibles = () => { const n = new Map(); visibles().forEach(v => n.set(ciaDe(v), (n.get(ciaDe(v)) || 0) + 1)); return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
function filtrar(lista, conAnul) {
  const todas = ciasDisponibles().map(([c]) => c);
  if (F.cias.size && todas.every(c => F.cias.has(c))) F.cias.clear();
  const q = F.q.trim().toLowerCase();
  return lista.filter(v =>
    (!F.estado.size || F.estado.has(estadoActual(v))) &&
    (!F.mios || esMioV(v)) &&
    (conAnul || !F.sinAnul || q || !esAnulado(v)) &&   // buscando, los anulados aparecen igual
    (!F.grado.size || F.grado.has(v.grado || 0)) &&
    (!F.repuestos.size || [...F.repuestos].some(f => tieneEtapa(v, "repuestos", f))) &&   // varias fases = cualquiera de ellas
    (!F.pintura.size || [...F.pintura].some(f => tieneEtapa(v, "pintura", f))) &&
    (!F.cliente.size || F.cliente.has(v.conformidad)) &&
    (!F.cargado.size || [...F.cargado].some(k => CARGADO[k](v))) &&
    (!F.cias.size || F.cias.has(ciaDe(v))) &&
    (!q || (q.startsWith("@")
      // "@usuario": los vehículos que cargó esa persona
      ? (q.length < 2 || cargadoPor(v).toLowerCase().startsWith(q) || ("@" + String(v.createdByName || "").toLowerCase().replace(/\s+/g, "")).startsWith(q.replace(/\s+/g, "")))
      : [v.modelo, v.patente, v.asegurado, v.compania, v.localidad, v.telefono]
        .some(x => (x || "").toLowerCase().includes(q)))));
}
// Filtra con todos los filtros menos uno: así cada número dice cuántos quedarían al elegir esa opción
function filtrarSin(clave, lista) {
  const prev = F[clave];
  F[clave] = prev instanceof Set ? new Set() : null;
  try { return filtrar(lista); } finally { F[clave] = prev; }
}

// PDF de la lista filtrada (lo mismo que se ve: estados, anulados, búsqueda…): una fila por repuesto / paño (el vehículo va solo en la primera)
// Repuestos y Pintura Sí/No: Sí = solo los que tienen y va su columna; No = solo los que no tienen. Los dos en No = sin repuestos ni pintura.
function exportarPDF() {
  // Los anulados se deciden acá (arranca como el filtro "Ocultar anulados")
  const base = ordenar(filtrar(activos(), true));
  let sinAnul = F.sinAnul;
  const lista = () => sinAnul ? base.filter(v => !esAnulado(v)) : base;
  const otrosFiltros = F.estado.size || F.q.trim() || [F.mios, F.grado.size, F.repuestos.size, F.pintura.size, F.cliente.size, F.cargado.size, F.cias.size].some(Boolean);
  // Si hay fases marcadas en el filtro, solo esos ítems
  const items = (v, tipo) => itemsTexto(v[tipo]).map(x => [x, etapaItem(v, tipo, x)]).filter(([, e]) => !F[tipo].size || F[tipo].has(e[0])).map(([x, e]) => `${x} — ${e[1]}`);
  const quiere = { repuestos: true, pintura: true };
  const elegidos = () => lista().filter(v => ["repuestos", "pintura"].every(t => quiere[t] === items(v, t).length > 0));
  const s = openSheet({ title: "Exportar PDF", body: `<div class="stack pdf-exp">
    ${["repuestos", "pintura"].map(t => `<div class="aj-item aj-ctrl pdf-op"><span class="aj-txt">${t === "pintura" ? "Pintura" : "Repuestos"}</span>
      <div class="seg seg-sm" data-t="${t}"><button type="button" class="seg-btn on" data-si="1">Sí</button><button type="button" class="seg-btn" data-si="">No</button></div></div>`).join("")}
    <button type="button" class="fo-switch ${sinAnul ? "on" : ""}" id="pdf-anul" aria-pressed="${sinAnul}">Ocultar anulados</button>
    <p class="muted small" id="pdf-txt" aria-live="polite"></p>
    <button type="button" class="btn btn-primary btn-block btn-lg" id="pdf-ok"></button>
    <button type="button" class="btn btn-ghost btn-block" id="pdf-todos"></button></div>` });
  const contar = () => {
    const n = elegidos().length, nt = lista().length;
    const que = quiere.repuestos && quiere.pintura ? "con repuestos y pintura" : quiere.repuestos ? "con repuestos y sin pintura" : quiere.pintura ? "con pintura y sin repuestos" : "sin repuestos ni pintura";
    $("#pdf-txt", s.el).textContent = `Se exportarán vehículos ${que} únicamente${sinAnul ? ", sin los anulados" : ""}${otrosFiltros ? ", según los filtros puestos" : ""}.`;
    $("#pdf-ok", s.el).innerHTML = `${icon("download")}Exportar ${n} ${n === 1 ? "vehículo" : "vehículos"}`; $("#pdf-ok", s.el).disabled = !n;
    $("#pdf-todos", s.el).textContent = `Exportar todos (${nt})`; $("#pdf-todos", s.el).disabled = !nt;
    const a = $("#pdf-anul", s.el); a.classList.toggle("on", sinAnul); a.setAttribute("aria-pressed", sinAnul);
  };
  contar();
  s.el.addEventListener("click", e => {
    const b = e.target.closest("[data-si]");
    if (b) { const seg = b.parentElement; quiere[seg.dataset.t] = !!b.dataset.si; seg.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("on", x === b)); return contar(); }
    if (e.target.closest("#pdf-anul")) { sinAnul = !sinAnul; return contar(); }
    const todos = !!e.target.closest("#pdf-todos");
    if (!todos && !e.target.closest("#pdf-ok")) return;
    // "Todos": cada vehículo de la lista, con sus repuestos y su pintura (tenga o no)
    const tipos = todos ? ["repuestos", "pintura"] : ["repuestos", "pintura"].filter(t => quiere[t]), vs = todos ? lista() : elegidos();
    const t = todos ? "Vehículos" : tipos.length === 2 ? "Vehículos con repuestos y pintura" : tipos.length ? `Vehículos con ${tipos[0]}` : "Vehículos sin repuestos ni pintura";
    // Math.max con 1: un vehículo sin ítems igual lleva su fila
    const filas = vs.flatMap(v => { const cols = tipos.map(tp => items(v, tp)), n = Math.max(1, ...cols.map(c => c.length));
      return Array.from({ length: n }, (_, i) => [i ? "" : v.modelo || "", i ? "" : v.patente || "", ...cols.map(c => c[i] || "")]); });
    tablaPDF(S.company, t, [{ titulo: "Vehículo", ancho: 60 }, { titulo: "Patente", ancho: 28 }, ...tipos.map(tp => ({ titulo: tp === "pintura" ? "Pintura" : "Repuestos", ancho: 90 }))], filas)
      .save(`${t.replace(/\s+/g, "_")}_${hoyISO()}.pdf`);
    s.close();
  });
}

// Historial del vehículo (lo más nuevo arriba). Los vehículos viejos arrancan con la carga.
// En pantalla sin el "Pasó a" de los cambios de estado (el texto guardado lo sigue teniendo: lo usan colores y avisos)
const sinPaso = txt => String(txt || "").replace(/Pasó a /g, "");
// Historial con botón para deshacer: al tocarlo se elige qué cambio deshacer
function abrirHistorial(v0) {
  const v = getVehiculo(v0.id) || v0, lista = soyDesmontaje() || soloVer() ? [] : deshaciblesDe(v);
  const s = openSheet({ title: "Historial", body: `${lista.length ? `<details class="hist-undo-op"><summary class="btn btn-ghost btn-block hist-undo">${icon("rotate")}Eliminar cambios</summary>
    <div class="stack hist-undo-lista">${lista.map((e, i) => `<button type="button" class="btn btn-ghost btn-block hist-undo-item" data-deshacer="${i}">${icon("x")}<span>${esc(sinPaso(e.txt))}</span><small class="muted">${fechaHora(e.t)}</small></button>`).join("")}</div></details>` : ""}${historialHTML(v)}` });
  s.el.addEventListener("click", async e => {
    const b = e.target.closest("[data-deshacer]"); if (!b) return;
    const elegido = lista[+b.dataset.deshacer];
    if (!(await confirmar({ title: "¿Estás seguro?", message: `Se deshace: “${sinPaso(elegido.txt)}”.`, ok: "Deshacer" }))) return;
    s.close();
    deshacerCambio(v, elegido).then(() => toast("Cambio deshecho", "success")).catch(err => toast(mensajeError(err), "error"));
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
  // Firmas del cliente que se borraron o se reemplazaron (se guardan al cambiar la firma)
  const firmas = h.filter(e => /^data:image\//.test(e.firmaAnterior || ""));
  return `<ol class="hist">${h.map(e => `<li class="${colorHist(e.txt) ? "hc" : ""}" style="${colorHist(e.txt) ? `--c:${colorHist(e.txt)}` : ""}"><span class="hist-txt"><strong>${esc(e.por || "Alguien")}</strong> ${esc(sinPaso(e.txt).replace(/ por WhatsApp/g, ""))}</span><time>${cuando(e.t)}</time></li>`).join("")}</ol>`
    + (firmas.length ? `<section class="hist-firmas"><h4>Firmas anteriores</h4>${firmas.map(e => `<figure><img class="firma-img" src="${esc(e.firmaAnterior)}" alt="Firma anterior del cliente">
      <figcaption class="muted small">${esc(e.por || "Alguien")} la ${/^Elimin/.test(e.txt) ? "eliminó" : "reemplazó"} · ${cuando(e.t)}</figcaption></figure>`).join("")}</section>` : "");
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
      ${izq.length ? `<div><small class="muted">Lado izquierdo</small>${listaPiezas(izq)}</div>` : ""}
      ${der.length ? `<div><small class="muted">Lado derecho</small>${listaPiezas(der)}</div>` : ""}</div>` : "");
}

// Fecha de las tarjetas: la del peritaje o la del último estado (se elige en Ordenar y se recuerda en este equipo)
// Fecha de la lista (se elige en Ajustes)
const fechaVista = () => { if (S.config?.fechaVista === false) return "peritado"; try { return localStorage.getItem("fechaVista") || "peritado"; } catch { return "peritado"; } };
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

// Cuántos filtros/órdenes distintos de lo normal hay puestos (se ve en el botón)
const cuantosActivos = () => [F.mios, F.sinAnul, F.grado.size, F.repuestos.size, F.pintura.size, F.cliente.size, F.cargado.size, F.cias.size, F.orden !== "fecha" || F.dir !== -1].filter(Boolean).length;
const marcarBoton = () => { const b = $("#tb-filtros"); if (!b) return; const k = cuantosActivos();
  b.classList.toggle("activo", k > 0); const n = $(".fo-badge", b); if (n) { n.textContent = k; n.hidden = !k; } };
export const botonFiltros = (cal = false) => cal ? conF(FC, () => botonFiltros()) : `<button class="icon-btn filtro-btn ${cuantosActivos() ? "activo" : ""}" id="tb-filtros" aria-label="Filtrar y ordenar" title="Filtrar y ordenar">${icon("filter")}<span class="fo-badge" ${cuantosActivos() ? "" : "hidden"}>${cuantosActivos()}</span></button>`;
// El calendario tiene sus propios filtros (sin estados) y su propia búsqueda
export function filtrarCalendario(lista, q) {
  return conF(FC, () => { FC.q = q || ""; return filtrar(lista); });
}
// Un solo botón "Filtros": cada grupo es una fila de opciones (tocar una la elige; tocarla de nuevo la quita).
// En el calendario (cal) usa sus filtros y no tiene Ordenar, Adicionales ni Ocultar anulados
export function abrirFiltros(alCambiar, cal = false) {
  return cal ? conF(FC, () => abrirFiltrosCon(alCambiar, true)) : abrirFiltrosCon(alCambiar, false);
}
function abrirFiltrosCon(alCambiar, cal) {
  const usar = fn => cal ? conF(FC, fn) : fn();   // los eventos llegan después: cada uno vuelve a apuntar a sus filtros
  const lector = soyLector();
  // Las tiras que cada uno deja abiertas quedan abiertas la próxima vez (en este equipo)
  let abiertas = []; try { abiertas = JSON.parse(localStorage.getItem("filtrosAbiertos") || "[]"); } catch { /* sin almacenamiento */ }
  const tira = (k, titulo, activo, extra = "") => `<details class="fo-sec fo-plega" data-tira="${k}" ${activo || abiertas.includes(k) ? "open" : ""}><summary><h3>${titulo}</h3>${icon("next")}</summary><div class="fo-seg" id="fo-${k}"></div>${extra}</details>`;
  const hoja = openSheet({ title: "Filtros", body: `<div class="fo">
    ${lector ? "" : `<section class="fo-sec"><h3>Compañías</h3><div class="fo-cias-caja"><div class="fo-seg fo-cias" id="fo-cias"></div></div></section>`}
    ${tira("grado", "Grado", F.grado.size).replace('class="fo-sec fo-plega"', 'class="fo-sec fo-plega fo-grados"')}
    ${tira("pintura", "Pintura", F.pintura.size)}
    ${tira("repuestos", "Repuestos", F.repuestos.size)}
    ${cal ? "" : (() => { const extra = `<div class="fo-extra"><div class="fo-seg" id="fo-cliente" aria-label="Conformidad del retiro"></div>
      <button type="button" class="btn btn-ghost btn-block" data-close id="fo-pdf">${icon("file")}Exportar PDF</button></div>`;
      return lector ? extra : tira("cargado", "Adicionales", F.cargado.size || F.cliente.size, extra); })()}
    ${cal ? "" : `<div class="fo-switches"><button type="button" class="fo-switch ${F.sinAnul ? "on" : ""}" id="fo-anul" aria-pressed="${F.sinAnul}">Ocultar anulados</button></div>`}
    <div class="fo-pie"><button type="button" class="btn btn-ghost" data-close id="fo-reset">Limpiar</button><button type="button" class="btn btn-primary" data-close id="fo-ver"></button></div>
  </div>` });
  const el = id => $(id, hoja.el);
  // Ordenar: en lugar de la X (se cierra tocando afuera, con Limpiar o con Ver), con las 4 opciones en un desplegable
  if (!cal) $(".sheet-head [data-close]", hoja.el)?.replaceWith(Object.assign(document.createElement("template"), { innerHTML: `<button type="button" class="fo-grado-dd fo-orden-btn" id="fo-orden-btn" aria-haspopup="listbox" aria-expanded="false"></button>` }).content);
  hoja.el.addEventListener("toggle", e => {
    const k = e.target.dataset?.tira; if (!k) return;
    abiertas = abiertas.filter(x => x !== k).concat(e.target.open ? [k] : []);
    try { localStorage.setItem("filtrosAbiertos", JSON.stringify(abiertas)); } catch { /* sin almacenamiento */ }
  }, true);
  const n = (grupo, f) => filtrarSin(grupo, activos()).filter(f).length;
  // Opción de una fila: texto, cantidad y color opcional
  const op = (grupo, val, txt, cant, on, color) => `<button type="button" class="fo-op ${on ? "on" : ""}" data-g="${grupo}" data-v="${esc(String(val))}" ${color ? `style="--c:${color}"` : ""}>
    <span class="fo-txt">${color ? `<i class="f-dot"></i>` : ""}${txt}</span>${cant !== null && cant !== undefined ? `<b>${cant}</b>` : ""}</button>`;
  const pintarHoja = () => usar(() => {
    const ob = el("#fo-orden-btn");   // fijo "Ordenar por"; se resalta si no es el orden normal (fecha, lo más nuevo arriba)
    if (ob) { ob.innerHTML = `<span>Ordenar por</span>${icon("next")}`; ob.classList.toggle("on", F.orden !== "fecha" || F.dir !== -1); }
    const gr = [[1, "G1"], [2, "G2"], [3, "G3"], [4, "G4"], [0, "–"]].filter(([g]) => !(g === 4 && lector) && (g !== 0 || n("grado", v => !v.grado) || F.grado.has(0)));
    el("#fo-grado").innerHTML = gr.map(([g, t]) => op("grado", g, t, n("grado", v => (v.grado || 0) === g), F.grado.has(g))).join("");
    if (el("#fo-cliente")) el("#fo-cliente").innerHTML = Object.entries(CARAS).map(([k, [t, c]]) => op("cliente", k, t, n("cliente", v => v.conformidad === k), F.cliente.has(k), c)).join("");
    if (el("#fo-cargado")) el("#fo-cargado").innerHTML = [["desm", "Desmontaje"], ["check", "Chequeo"], ["firma", "Firmados"]].map(([k, t]) => op("cargado", k, t, n("cargado", CARGADO[k]), F.cargado.has(k))).join("");
    ["pintura", "repuestos"].forEach(tipo => {
      el(`#fo-${tipo}`).innerHTML = ETAPAS[tipo].map(([k, t, c]) => op(tipo, k, t, n(tipo, v => tieneEtapa(v, tipo, k)), F[tipo].has(k), c)).join("");
    });
    if (el("#fo-cias")) el("#fo-cias").innerHTML = ciasDisponibles().map(([c]) => [c, n("cias", v => ciaDe(v) === c)]).map(([c, k]) => `<button type="button" class="fo-op ${F.cias.has(c) ? "on" : ""}" data-cia="${esc(c)}"><span class="fo-txt">${esc(c)}</span><b>${k}</b></button>`).join("")
      || `<span class="muted small">Sin vehículos</span>`;
    const cant = filtrar(activos()).length;
    [["#fo-anul", F.sinAnul]].forEach(([id, on]) => { const b = el(id); if (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); } });
    el("#fo-ver").textContent = `Ver ${cant} ${cant === 1 ? "vehículo" : "vehículos"}`;
    marcarBoton();
  });
  const aplicar = () => { alCambiar(); pintarHoja(); };
  // Compañías: se deslizan con la barra de abajo o con la rueda del mouse (en computadora no se podía)
  const cias = el("#fo-cias");
  cias?.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); cias.scrollLeft += e.deltaY; } }, { passive: false });
  hoja.el.addEventListener("click", e => usar(() => {
    const ob = e.target.closest("#fo-orden-btn");
    // Elegir otra opción la pone en su sentido normal; elegir la misma da vuelta el sentido
    if (ob) return glideMenu(ob, ORDENES.map(([k, t]) => [k, F.orden === k ? `${t} ${F.dir > 0 ? "↓" : "↑"} (invertir)` : t]), null,
      k => { if (F.orden === k) F.dir *= -1; else { F.orden = k; F.dir = k === "fecha" ? -1 : 1; } aplicar(); });
    const c = e.target.closest("[data-cia]");
    if (c) { const k = c.dataset.cia; F.cias.has(k) ? F.cias.delete(k) : F.cias.add(k); return aplicar(); }
    if (e.target.closest("#fo-reset")) { F.mios = false; F.sinAnul = false; F.cargado.clear(); F.grado.clear(); F.repuestos.clear(); F.pintura.clear(); F.cliente.clear(); F.cias.clear(); F.orden = "fecha"; F.dir = -1;
      return aplicar(); }
    if (e.target.closest("#fo-pdf")) return exportarPDF();
    if (e.target.closest("#fo-anul")) { F.sinAnul = !F.sinAnul; return aplicar(); }
    const b = e.target.closest("[data-g]"); if (!b) return;
    const g = b.dataset.g, v = b.dataset.v;
    if (g === "orden") { if (F.orden === v) F.dir *= -1; else { F.orden = v; F.dir = v === "fecha" ? -1 : 1; } }
    // Sin "Todos": tocar la opción elegida la quita (ninguna elegida = todos)
    else { const k = g === "grado" ? Number(v) : v; F[g].has(k) ? F[g].delete(k) : F[g].add(k); }   // se pueden marcar varias en cada fila
    aplicar();
  }));
  pintarHoja();
}

export function vistaVehiculos(view, selId = null) {
  const ancho = esAncho();
  const sel = selId ? getVehiculo(selId) : null;
  if (selId && !ancho) return vistaDetalle(view, selId);

  // Filtros puestos, a la vista debajo del buscador: cada uno con su X (los estados ya se ven marcados en la fila de estados)
  const puestos = () => { const o = [];
    if (F.mios) o.push(["Cargados por mí", () => { F.mios = false; }]);
    if (F.sinAnul) o.push(["Sin anulados", () => { F.sinAnul = false; }]);
    F.grado.forEach(g => o.push([g ? `Grado ${g}` : "Sin grado", () => F.grado.delete(g)]));
    ["pintura", "repuestos"].forEach(t => F[t].forEach(k => o.push([`${t === "pintura" ? "Pintura" : "Repuestos"}: ${ETAPAS[t].find(e => e[0] === k)?.[1] || k}`, () => F[t].delete(k)])));
    F.cliente.forEach(k => o.push([`Cliente ${CARAS[k]?.[0].toLowerCase() || k}`, () => F.cliente.delete(k)]));
    F.cargado.forEach(k => o.push([{ desm: "Con desmontaje", check: "Con chequeo", firma: "Firmados" }[k] || k, () => F.cargado.delete(k)]));
    F.cias.forEach(c => o.push([c, () => F.cias.delete(c)]));
    if (F.orden !== "fecha" || F.dir !== -1) o.push([`Orden: ${ORDENES.find(x => x[0] === F.orden)?.[1]} ${F.dir > 0 ? "↑" : "↓"}`, () => { F.orden = "fecha"; F.dir = -1; }]);
    return o; };
  const pintarPuestos = () => { const c = $("#filtros-act", view); if (!c) return; const o = puestos(), k = o.map(x => x[0]).join("|");
    if (c.dataset.k === k) return; c.dataset.k = k;   // sin cambios no se repinta (si no, las etiquetas se animan con cada cambio de datos)
    c.innerHTML = o.map(([t], i) => `<button type="button" class="filtro-act" data-quitar="${i}" aria-label="Quitar filtro ${esc(t)}"><span>${esc(t)}</span>${icon("x")}</button>`).join(""); c.hidden = !o.length; };
  setTopbar({
    title: "Vehículos", sinTitulo: true,
    back: S.volverA || null,   // abierto desde la planilla de técnicos: volver a la planilla
    actions: botonFiltros()
  });

  // En computadora los estados van en una fila a lo ancho de la pantalla, arriba de todo
  let contarAlEntrar = !$("#estado-strip", view);   // solo al llegar de otra pantalla, no al redibujar
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
        <div id="filtros-act" class="filtros-act" aria-label="Filtros puestos"></div>
        <div id="vlist" class="vlist"></div>
      </section>
      ${ancho ? `<section class="pane-detail" id="pane-detail"></section>` : ""}
    </div>`;

  // El buscador va arriba, en la barra: entre el operativo (o el título) y el botón de filtros
  $("#topbar .tb-title")?.after($(".list-tools .search", view));
  // Celular: el botón de filtros va dentro del buscador (así la barra llega hasta la campana)
  if (!ancho && $("#tb-filtros")) $("#topbar > .search")?.append($("#tb-filtros"));

  let ultimaLista = "";   // cada guardado dispara 2+ avisos de la base: si la lista quedó igual, no se redibuja
  const pintar = (animar = false) => {
    const todos = activos();
    const cuenta = Object.fromEntries(ESTADOS.map(e => [e.key, 0]));
    filtrarSin("estado", todos).forEach(v => cuenta[estadoActual(v)]++);
    $("#estado-strip", view).innerHTML =
      // Link de perito: solo los estados que tienen algún vehículo
      ESTADOS.filter(e => !soyLector() || cuenta[e.key] || F.estado.has(e.key)).map(e => `<button class="est ${F.estado.has(e.key) ? "on" : ""}" data-e="${e.key}" style="--c:${e.color}">
        <b>${cuenta[e.key]}</b><span>${e.label}</span></button>`).join("");
    $("#estado-strip", view).setAttribute("aria-label", `Filtrar por estado (${todos.length} en total)`);
    pintarPuestos();
    // Count Up: los números de los estados cuentan desde 0 la primera vez que hay datos
    if (contarAlEntrar && !S.loadingVehicles) { contarAlEntrar = false; $$("#estado-strip b", view).forEach(b => contar(b)); }

    const lista = ordenar(filtrar(todos));
    const box = $("#vlist", view);
    if (S.loadingVehicles) { ultimaLista = ""; box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
    if (!todos.length) {
      ultimaLista = "";
      box.innerHTML = `<div class="empty">
        ${carMapSVG({ techo: 1, capot: 1 }, { size: "carmap-empty" })}
        <h2>Todavía no hay vehículos</h2>
        <p>Cargá el primer peritaje: modelo, patente y las piezas con granizo.</p>
        <a class="btn btn-primary" href="#/nuevo">${icon("plus")}Cargar vehículo</a></div>`;
      return;
    }
    const html = lista.length
      ? lista.map(v => tarjeta(v, v.id === selId)).join("")
      : `<div class="empty small"><p>Ningún vehículo coincide con la búsqueda.</p>
         <button class="btn btn-ghost" id="limpiar">Limpiar filtros</button></div>`;
    if (!animar && html === ultimaLista) return;
    ultimaLista = html;
    box.innerHTML = html;
    box.classList.toggle("lista-anim", animar);
    if (animar) [...box.children].forEach((c, i) => c.style.setProperty("--i", i));
    $("#limpiar", box)?.addEventListener("click", () => { F.estado.clear(); F.mios = false; F.sinAnul = false; F.cias.clear(); F.grado.clear(); F.repuestos.clear(); F.pintura.clear(); F.cliente.clear(); F.cargado.clear(); marcarBoton(); pintar(); });
  };

  // Computadora: tocar de nuevo el vehículo marcado lo desmarca y cierra el detalle
  deslizarParaAvanzar($("#vlist", view));
  $("#vlist", view).addEventListener("click", e => {
    const a = e.target.closest("a.vcard.sel"); if (!a || !ancho || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); S.ultimoVid = null; a.classList.remove("sel"); go("#/");
  });
  $("#q").addEventListener("input", debounce(e => { F.q = e.target.value; pintar(true); }, 120));
  // Doble clic selecciona toda la búsqueda (en Mac no lo hacía solo)
  $("#q").addEventListener("dblclick", e => { e.target.select(); });
  $("#estado-strip", view).addEventListener("click", e => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    { const k = b.dataset.e; F.estado.has(k) ? F.estado.delete(k) : F.estado.add(k); } pintar();
  });
  $("#filtros-act", view).addEventListener("click", e => {
    const b = e.target.closest("[data-quitar]"); if (!b) return;
    puestos()[+b.dataset.quitar]?.[1](); marcarBoton(); pintar(true);
  });
  $("#tb-filtros")?.addEventListener("click", () => abrirFiltros(() => pintar()));
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
    actions: soyDesmontaje() || soloVer() ? "" : `<a class="icon-btn" href="#/editar/${v.id}" aria-label="Editar">${icon("edit")}</a>`
  });
  view.innerHTML = `<div class="detail-page"></div>`;
  renderDetalle($(".detail-page", view), v, false);
}

let adicCerrado = null, pzTocada = null;   // adicCerrado: id del vehículo donde se cerró Adicionales (arranca abierto)
let _x;   // pzTocada: paño elegido en el detalle (sobrevive al redibujo)

// Mensaje configurable desde el panel del dueño: {Vehiculo}, {Patente}, {Asegurado}… se completan con el vehículo
const VARS_WA = {
  vehiculo: v => v.modelo, modelo: v => v.modelo, patente: v => v.patente, asegurado: v => v.asegurado, cliente: v => v.asegurado,
  nombre: v => v.asegurado, telefono: v => v.telefono, compania: v => v.compania, aseguradora: v => v.compania,
  operativo: () => S.company?.name, localidad: v => v.localidad, grado: v => v.grado, precio: v => v.precio ? money(v.precio) : "",
  estado: v => ESTADO[estadoActual(v)]?.label || "", repuestos: v => v.repuestos, pintura: v => v.pintura,
  observaciones: v => v.observaciones, detalles: v => v.observaciones,
  fecha: v => fechaLarga(v.fechas?.peritado), peritaje: v => fechaLarga(v.fechas?.peritado),
  turno: v => fechaLarga(v.fechas?.turnado).replace(/ de [0-9]{4}$/, ""), horaturno: v => v.horaTurno, hora: v => v.horaTurno,
  usuario: () => String(S.profile?.name || "").trim().split(/\s+/)[0], yo: () => String(S.profile?.name || "").trim().split(/\s+/)[0],
  saludo: () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches"; },
  direccion: () => S.company?.mensajes?.direccion, mapa: () => linkMapa(), ubicacion: () => linkMapa()
};
// Link del taller: el corto con vista previa linda (chapisteriaomar.com/mapN) si el operativo ya lo tiene; si no, el de Maps tal cual
export const linkMapa = () => { const m = S.company?.mensajes || {}; return !m.mapa ? "" : m.mapaN ? `https://chapisteriaomar.com/map${m.mapaN}` : m.mapa; };
const claveVar = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
export function textoWa(plantilla, v) {
  let t = String(plantilla || "").trim();
  const q = t.match(/[?&]text=([\s\S]*)$/i);   // se puede pegar el link entero (wa.me/numero?text=…)
  if (q) { t = q[1]; try { t = decodeURIComponent(t.replace(/\+/g, " ")); } catch { /* texto ya legible */ } }
  else if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(t)) t = "";
  // Un renglón tipo "⏰ Hora: {Hora}" sin dato se saca entero (no queda la etiqueta sola)
  return t.split("\n").map(l => { let hay = false, lleno = false;
    const r = l.replace(/\{([^{}]+)\}/g, (m, k) => { const f = VARS_WA[claveVar(k)]; if (!f) return m; hay = true; const x = String(f(v) ?? "").trim(); if (x) lleno = true; return x; });
    return hay && !lleno && /:[*_\s]*$/.test(r) ? null : r; }).filter(l => l !== null).join("\n")
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
console.assert(textoWa("A\n⏰ *Hora:* {Hora}\nB {Patente}", { patente: "AB123CD" }) === "A\nB AB123CD" && textoWa("Hola {Asegurado}!", {}) === "Hola !", "textoWa");
// Solo con el vehículo reparado; antes, el WhatsApp abre sin texto
const mensajeWa = v => ["reparado", "llamado"].includes(estadoActual(v)) ? textoWa(S.company?.mensajes?.contactado || S.config?.mensajeWa, v) : "";

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
  repuestos: [["sinpedir", "Sin cargar", "#e5484d"], ["pedido", "Pedido", "#e0a526"], ["recibido", "Recibido", "#4f8ff7"], ["colocado", "Colocado", "#22b07d"]],
  pintura: [["pendiente", "Sin cargar", "#e5484d"], ["pedido", "Pedido", "#e0a526"], ["turnado", "Turnado", "#4f8ff7"], ["pintado", "Pintado", "#22b07d"]]
};
const CAMPO_ETAPAS = { repuestos: "etapasRepuestos", pintura: "etapasPintura" };
const claveItem = x => sinTildesJS(x).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "item";
const sinTildesJS = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const etapaItem = (v, tipo, x) => ETAPAS[tipo].find(e => e[0] === v[CAMPO_ETAPAS[tipo]]?.[claveItem(x)]) || ETAPAS[tipo][0];
// Con las fotos de esa sección (fotosRepuestos / fotosPintura) abajo de los ítems
// Misma grilla de fotos que el resto: si no entran, el último cuadro dice "+N" (abre el visor) y al final va el cuadro "+" para agregar
const grillaFotos = (fotos, campo, soloVer) => {
  const max = soloVer ? 8 : 7, ver = fotos.length > max ? fotos.slice(0, max - 1) : fotos, resto = fotos.length - ver.length;
  const cuadro = (f, extra = "") => `<button type="button" data-pfoto="${esc(f.url)}" data-campo="${campo}"><img src="${esc(thumb(f.url, 200))}" alt="" loading="lazy">${extra}</button>`;
  return `<div class="desm-fotos">${ver.map(f => cuadro(f)).join("")}${resto ? cuadro(fotos[ver.length], `<span class="ft-resto">+${resto}</span>`) : ""}${soloVer ? "" : `<button type="button" class="ft-mas" data-fsec="${campo}" aria-label="Agregar fotos">${icon("plus")}</button>`}</div>`;
};
const chipsSec = (titulo, v, tipo, soloVer) => {
  const items = itemsTexto(v[tipo]), campo = tipo === "pintura" ? "fotosPintura" : "fotosRepuestos", fotos = v[campo] || [];
  if (!items.length && !fotos.length) return "";
  return `<section class="d-sec"><div class="sec-head"><h3>${titulo}${fotos.length ? ` <small>${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}</small>` : ""}</h3></div>
  ${items.length ? `<ul class="piezas-list pintura-list etapas">${items.map(x => { const [, label, color] = etapaItem(v, tipo, x);
    return `<li><button type="button" class="etapa-item" data-tipo="${tipo}" data-item="${esc(x)}" style="--c:${color}"><span>${esc(x)}</span><small>${label}</small></button></li>`; }).join("")}</ul>` : ""}
  ${fotos.length ? grillaFotos(fotos, campo, soloVer) : ""}</section>`;
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

export function renderDetalle(root, v, embebido) {
  // Llegó desde una notificación de fotos: se abre esa foto
  if (S.abrirFoto?.vid === v.id) {
    const f = S.abrirFoto; S.abrirFoto = null;
    setTimeout(() => { const lista = (f.desm ? v.desFotos : v.fotos) || [], i = lista.findIndex(x => x.url === f.url); if (i >= 0) visor(lista, i, f.desm ? null : v); }, 250);
  }
  const est = estadoActual(v);
  const anulado = est === "anulado" || est === "anular";
  const marcadas = piezasMarcadas(v);
  const todos = marcadas.length === ORDEN_PIEZAS.length;
  const esMio = esMioV(v);
  const soloVer = soyDesmontaje() || soyLector() || soySacabollos();   // Desmontaje: solo ve y carga desmontajes; link de perito: solo ve

  // Estado recién tocado: al redibujar, su círculo aparece con un "pop"
  if (S.pasoTocado && Date.now() - S.pasoTocado.t < 4000) { const k = S.pasoTocado.k; queueMicrotask(() => { const b = root.querySelector(`.step[data-estado="${k}"]`);
    if (b && (b.classList.contains("done") || b.classList.contains("now"))) { b.classList.add("recien"); S.pasoTocado = null; } }); }
  root.innerHTML = `
  <article class="detail">
    <header class="d-head">
      ${v.fotos?.length
        ? `<button class="d-cover" data-vid="${esc(v.id)}" data-act="galeria" aria-label="Ver las ${v.fotos.length} fotos">
             <img src="${esc(thumb(v.fotos[0].url, 240, v.fotos[0].rot))}" alt=""><span class="d-cover-n">${icon("camera")}${v.fotos.length}</span>${barraSubida(v.id)}</button>`
        : `<div class="d-cover vacio" data-vid="${esc(v.id)}">${barraSubida(v.id)}
             ${soloVer ? `<span class="d-cover-cam">${icon("image")}</span>` : `<button type="button" class="d-cover-cam" id="d-cover-fotos" aria-label="Agregar fotos">${icon("image")}<small>Fotos</small></button>`}
           </div>`}
      <div class="d-title">
        <h2>${esc(v.modelo || "Sin modelo")}</h2>
        <div class="d-plate">${plate(v.patente, "lg")}</div>
        ${v.precio ? `<div class="d-price"><strong>${money(v.precio)}</strong></div>` : ""}
      </div>
      <span class="d-edit">${[...PASO_REP, "facturado"].includes(est) && !soyLector() && (soyAdmin() || soyDesmontaje()) ? `<button class="btn btn-ghost btn-icon d-desm" data-act="desmontaje" aria-label="Chequeo" title="Chequeo">${icon("table")}${CARGADO.desm(v) || CARGADO.check(v) ? `<i class="d-desm-punto" aria-label="Tiene algo cargado"></i>` : ""}</button>` : ""}
        ${embebido && !soloVer ? `<a class="btn btn-ghost btn-icon" href="#/editar/${v.id}" aria-label="Editar" title="Editar">${icon("edit")}</a>` : ""}</span>
    </header>

    <div class="d-actions">
      <button class="btn btn-primary" data-act="pdf">${icon("share")}Compartir</button>
      ${v.telefono ? `<div class="d-contacto ${chatNuevo(telWa(v.telefono)) ? "chat-nuevo" : ""}" data-tel="${esc(telWa(v.telefono) || "")}">
        <button class="btn btn-ghost" data-act="contactar" aria-haspopup="true" aria-expanded="false">${icon("phone")}Contactar</button>
        <div class="d-menu" hidden>
          ${(usaClientes() || chatEnMantenimiento()) && !soyLector() ? `<a role="button" data-act="chat">${icon("chat")}Chat en vivo</a>` : ""}
          <a ${soySacabollos() ? `role="button"` : `href="${waLink(v.telefono, soyLector() ? "" : mensajeWa(v))}" target="_blank" rel="noopener"`}>${icon("share")}Contactar por privado</a>   <!-- Sacabollos: se puede tocar pero no hace nada -->
        </div></div>` : ""}
    </div>

    <section class="d-sec">
      <div class="seg-head"><h3>Seguimiento</h3>
        ${soloVer ? "" : `<span class="seg-acts">${anulado ? `<button class="link-btn small" data-act="reactivar">Reactivar</button>` : ""}${est !== "anulado" ? `<button class="link-btn small danger" data-act="anular">${est === "anular" ? "Anulado" : "Anular"}</button>` : ""}</span>`}</div>
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
            ${hecho && k === "rep" && CARAS[v.conformidad] ? `<span class="step-cara" style="--c:${CARAS[v.conformidad][1]}" title="${CARAS[v.conformidad][0]}">${cara(v.conformidad)}</span>` : ""}
            ${k === "turnado" && est === "turnado" ? `<span class="step-conf ${v.turnoConfirmado === true ? "ok" : ""}">${v.turnoConfirmado === true ? "Confirmado" : v.turnoConfirmado === "cambio" ? "Pide otra fecha" : "Esperando confirmación"}</span>` : ""}</button></li>`;
        }).join("")}
      </ol>
      ${anulado ? `<p class="muted small">${ESTADO[est].label} el ${fechaCorta(v.fechas?.[est])}</p>` : ""}
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
      <div class="sec-head"><h3>Paños afectados ${todos ? "<small>todos</small>" : marcadas.length ? `<small>${marcadas.length}</small>` : ""}</h3>${gradoTag(v)}</div>
      ${!marcadas.length ? `<p class="muted sin-panos">Sin paños marcados</p>` : `
      <div class="piezas-view">
        <div class="map-col">${carMapSVG(v.piezas || {}, { size: "carmap-sm" })}</div>
        <p class="piezas-caption" aria-live="polite">${todos ? "<strong>Todos</strong>" : marcadas.length ? "Tocá un paño para ver su nombre" : "Sin paños marcados"}</p>
        <div class="piezas-grupos">${todos ? `<ul class="piezas-list"><li>Todos</li></ul>`
          : !marcadas.length ? `<ul class="piezas-list"><li class="muted">Sin paños marcados</li></ul>`
          : piezasAgrupadas(v)}</div>
      </div>
`}
    </section>`}

    ${v.observaciones ? `<section class="d-sec"><h3>Observaciones</h3><p class="prose">${esc(v.observaciones)}</p></section>` : ""}
    ${chipsSec("Repuestos", v, "repuestos", soloVer)}
    ${chipsSec("Pintura", v, "pintura", soloVer)}

    ${(() => {
      // Adicionales: con una sola cosa (ej. la firma) va directo, sin desplegable
      const partes = [docsOn() && v.archivos?.length ? `<section class="d-sub">
      <div class="sec-head"><h3>Documentos <small>${v.archivos?.length || 0}</small></h3></div>
      <ul class="docs">${(v.archivos || []).map((a, i) => `
        <li><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("file")}<span>${esc(a.name)}</span></a>
          </li>`).join("")}</ul>   <!-- los documentos se quitan solo desde Editar -->
    </section>` : "",
        v.fechas?.reparado || v.fechas?.facturado || v.firma ? `<section class="d-sub">
      <div class="sec-head"><h3>Firma del cliente</h3>
        ${soloVer ? "" : `<button class="btn btn-ghost btn-sm" data-act="firma">${icon("sign")}${v.firma ? "Volver a firmar" : "Firmar"}</button>`}</div>
      ${v.firma ? `<img class="firma-img" src="${esc(v.firma)}" alt="Firma del cliente">`
        : ""}
    </section>` : ""].filter(Boolean);
      if (!partes.length) return "";
      if (partes.length === 1) return partes[0].replace('class="d-sub"', 'class="d-sec"');
      return `<details class="d-sec d-adic" ${adicCerrado !== v.id ? "open" : ""}><summary><h3>Adicionales</h3></summary>${partes.join("")}</details>`;
    })()}

    <footer class="d-foot">
      <span class="d-autor"><button class="icon-btn sm hist-btn" data-act="historial" aria-label="Historial" title="Historial">${icon("clock")}</button>${!soloVer && puedoEditar(v) && S.companies.length > 1 ? `<button class="icon-btn sm hist-btn" data-act="mover" aria-label="Mover a otro operativo" title="Mover a otro operativo">${icon("swap")}</button>` : ""}Cargado por ${esc(cargadoPor(v))}</span>
      <span class="d-foot-btns">
        ${soloVer ? "" : `<button class="icon-btn danger" data-act="borrar" aria-label="Eliminar vehículo" title="Eliminar">${icon("trash")}</button>`}
      </span>
    </footer>
  </article>`;

  $(".d-adic", root)?.addEventListener("toggle", e => { adicCerrado = e.target.open ? null : v.id; });
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
  // Al redibujar (cambios en vivo) el paño elegido sigue marcado y con su nombre
  if (pzTocada?.vid === v.id) {
    const g = $(`.d-piezas [data-pieza="${pzTocada.k}"]`, root), cap = $(".piezas-view .piezas-caption", root);
    if (g) { g.classList.add("tocado"); if (cap) cap.innerHTML = `<strong>${esc(PIEZA[pzTocada.k].label)}</strong>`; }
  }

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
      // Ventanita: Ausente (o volver a Turnado) y deshacer ese estado
      const cur = getVehiculo(v.id) || v, d = pasoDeshacible(cur, [est]);
      const s = openSheet({ title: ESTADO[est].label, body: `<div class="stack">
        <button type="button" class="btn btn-ghost btn-block" data-ausente>${est === "turnado" ? "Marcar ausente" : "Volver a turnado"}</button>${botonDeshacer(d)}</div>` });
      s.el.classList.add("sheet-centro");
      $("[data-ausente]", s.el).onclick = () => {
        s.close();
        if (est === "turnado") { cambiarEstado(cur, "ausente", hoyISO()).catch(err => toast(mensajeError(err), "error")); toast("Marcado como ausente"); }
        else { cambiarEstado(cur, "turnado", cur.fechas?.turnado || hoyISO()).catch(err => toast(mensajeError(err), "error")); toast("Volvió a turnado"); }
      };
      conectarDeshacer(s, cur, d);
    }, 600);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => pasoTurno?.addEventListener(ev, () => clearTimeout(relojPaso)));
  pasoTurno?.addEventListener("contextmenu", e => e.preventDefault());
  // Mantener apretado Peritado, Reparación o Facturado: cambiar las fechas (y deshacer ese estado si es el actual)
  $$('[data-estado="peritado"], [data-estado="rep"], [data-estado="facturado"]', root).forEach(paso => {
    let reloj = null;
    paso.addEventListener("pointerdown", () => {
      pasoLargo = false;
      if (soloVer) return;
      reloj = setTimeout(() => {
        pasoLargo = true; navigator.vibrate?.(30);
        const cur = getVehiculo(v.id) || v;
        if (paso.dataset.estado === "rep") fechasReparacion(cur); else elegirFechaEstado(cur, paso.dataset.estado);
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
    if ((soyLector() || soySacabollos()) && [...(soyLector() ? ["desmontaje"] : []), "fotos", "subir", "docs"].includes(t.closest("[data-act]")?.dataset.act)) return;
    if (t.closest("[data-act]")?.dataset.act === "desmontaje") return abrirCheck(v);
    const fs = t.closest("[data-fsec]");
    if (fs) return abrirFotosSec(v, fs.dataset.fsec);
    const pf = t.closest("[data-pfoto]");
    if (pf) { const c = pf.dataset.campo, l = v[c] || []; return visor(l, Math.max(0, l.findIndex(x => x.url === pf.dataset.pfoto)), v, c); }
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
        if (sig === "entregado") setTimeout(() => popupConformidad(cur), 350);
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
    if (act === "pdf" && soySacabollos()) {
      // Sin permiso: el ícono se sacude como el de Contactar y vibra, sin abrir nada
      const b = t.closest("[data-act]"); b.classList.remove("negado"); void b.offsetWidth; b.classList.add("negado");
      navigator.vibrate?.([30, 40, 30]);
      return;
    }
    if (act === "pdf") return compartir(v);
    if (act === "galeria") return visor(v.fotos, 0, v);
    if (act === "firma") return firmar(v);
    if (act === "chat") return chatEnMantenimiento() ? toast("Chat en vivo en mantenimiento. Volvé a probar más tarde.", "info") : abrirChatDe(v);
    if (act === "contactar") {
      const m = $(".d-menu", root), abrir = m.hidden;
      const btn = t.closest("[data-act]");
      // Al cerrar: el menú y el velo salen animados (.sale) y recién después se ocultan
      const cerrar = () => {
        btn.setAttribute("aria-expanded", "false");
        const velo = $(".menu-velo"); velo?.classList.add("sale"); m.classList.add("sale");
        setTimeout(() => { m.hidden = true; m.classList.remove("sale"); velo?.remove(); }, 180);
      };
      if (!abrir) return cerrar();
      m.hidden = false; btn.setAttribute("aria-expanded", "true");
      // Fondo desenfocado detrás del menú; tocarlo lo cierra
      const velo = document.createElement("div"); velo.className = "menu-velo"; velo.onclick = cerrar;
      document.body.appendChild(velo);
      $$("a", m).forEach(a => a.addEventListener("click", () => setTimeout(cerrar, 50), { once: true }));
      return;
    }
    if (act === "anular" || act === "reactivar") {
      // Anular o reactivar: quien lo cargó o un administrador (de cualquier vehículo del operativo)
      if (!esMio && !soyAdmin()) return toast("Solo un administrador o quien lo cargó puede anularlo", "error");
      if (act === "reactivar") {
        const ultimo = SECUENCIA.filter(k => v.fechas?.[k]).pop() || "peritado";
        return cambiarEstado(v, ultimo, v.fechas?.[ultimo] || hoyISO()).catch(err => toast(mensajeError(err), "error"));
      }
      // Primer toque: queda en "Anular"; el segundo lo deja "Anulado" por completo
      const fin = est === "anular";
      if (await confirmar({ title: fin ? "¿Anularlo por completo?" : "¿Anular este trabajo?", message: fin ? "Pasa de Anular a Anulado." : "Queda en Anular. Tocá Anulado después para anularlo por completo, o Reactivar.", ok: fin ? "Anulado" : "Anular", danger: true }))
        cambiarEstado(v, fin ? "anulado" : "anular").catch(err => toast(mensajeError(err), "error"));
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
      pulsar(pz); pzTocada = { vid: v.id, k };
      if (cap) cap.innerHTML = `<strong>${esc(PIEZA[k].label)}</strong>`;
      return;
    }
    const fi = t.closest("[data-foto]");
    if (fi) return visor(v.fotos, +fi.dataset.foto, v);
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

// ═════════════════ Check in / out ═════════════════
// Basado en las planillas del taller, adaptado a sacabollos/PDR. Cada ítem arranca sin marcar: un toque = bien, otro = mal, otro = sin marcar.
const CHECK = {
  in: [
    ["exterior", "Exterior", ["Bien", "Dañado"], ["Ópticas delanteras", "Ópticas traseras", "Tercer stop", "Espejos", "Parabrisas", "Luneta",
      "Vidrios laterales", "Colizas", "Antena", "Logos e insignias"]],
    ["interior", "Interior", ["Bien", "Dañado"], ["Pantalla", "Levantavidrios", "Cerraduras y manijas", "Tapizado de techo", "Luces de tablero"]],
    ["elementos", "Elementos", ["Está", "Falta"], ["Auxilio", "Criquet y llave", "Matafuego", "Objetos de valor", "Pertenencias personales"]]
  ],
  out: [
    ["control", "Control de calidad", ["OK", "Revisar"], ["Bollos", "Golpes", "Rayas", "Cold Glue", "Colizas", "Ópticas", "Pintura",
      "Tapizado interior", "Parantes interior", "Luz interior", "Manijas interior"]]
  ]
};
const ANOTAR = ["Objetos de valor", "Pertenencias personales"];   // se escribe qué hay tanto si está como si falta
const CALIDAD = ["Calidad general de la reparación", "Limpieza interior", "Limpieza exterior"], NOTAS = ["Mala", "Regular", "Buena", "Excelente"];
const COMBUSTIBLE = ["Reserva", "¼", "½", "¾", "Lleno"];
const campoCheck = t => t === "in" ? "checkIn" : "checkOut";

// Chequeo (desmontaje y check) en una ventana emergente (como las fotos), con pestañas Desmontaje / IN / OUT arriba; entra en Desmontaje
export function abrirCheck(v0, t = "desm") {
  const s = openSheet({ title: `Chequeo · ${v0.patente || v0.modelo || ""}`, wide: true, body: `<div class="chk-pop"></div>` });
  const caja = $(".chk-pop", s.el), pop = { cerrar: s.close, ir: k => vistaCheckForm(caja, v0.id, k, pop) };
  // Las pestañas cambian adentro (un link cerraría la ventana)
  caja.addEventListener("click", e => { const b = e.target.closest("[data-chk-tab]"); if (b) pop.ir(b.dataset.chkTab); });
  pop.ir(t);
}
// También a pantalla completa por link (#/check/id/in): pop = null
export function vistaCheckForm(view, id, t, pop = null) {
  const v = getVehiculo(id);
  if (!pop) setTopbar({ title: "Chequeo", sub: v ? [v.modelo, v.patente].filter(Boolean).join(" · ") : "", back: `#/v/${id}` });
  if (!v) { view.innerHTML = S.loadingVehicles ? `<div class="skeleton tall"></div>` : `<div class="empty"><h2>No encontramos este vehículo</h2></div>`; return; }
  const tabs = `<div class="seg chk-tabs">${[["desm", "Desmontaje"], ["in", "Check IN"], ["out", "Check OUT"]].map(([k, l]) => pop
    ? `<button type="button" class="seg-btn ${k === t ? "on" : ""}" data-chk-tab="${k}">${l}</button>` : `<a class="seg-btn ${k === t ? "on" : ""}" href="#/check/${id}/${k}">${l}</a>`).join("")}</div>`;
  if (t === "desm") { view.innerHTML = `<div class="page narrow stack">${tabs}<div class="card desm"></div></div>`; return pintarDesmontaje($(".desm", view), v); }
  const c = v[campoCheck(t)] || {}, val = {};
  let files = [];
  const seg = (name, ops, sel) => `<div class="seg seg-sm">${ops.map((o, i) => `<button type="button" class="seg-btn ${sel === i ? "on" : ""}" data-n="${name}" data-v="${i}">${o}</button>`).join("")}</div>`;
  view.innerHTML = `<form class="vform chk-form" novalidate><div class="page narrow stack">
    ${tabs}
    ${t === "in" ? "" : `<fieldset class="card"><legend>Calidad</legend>${CALIDAD.map((x, i) => `<div class="field"><span>${x}</span>${seg("calidad." + i, NOTAS, c.calidad?.[i])}</div>`).join("")}</fieldset>`}
    ${CHECK[t].map(([k, titulo, ops, items]) => `<fieldset class="card chk-grupo"><legend>${titulo}</legend>
      ${items.map(it => { const x = c[k]?.[it], sel = x?.v ?? ""; return `<div class="chk-fila ${ANOTAR.includes(it) ? "anota" : ""}" data-sel="${sel}"><span>${esc(it)}</span>
        <button type="button" class="chk-tog" data-k="${k}" data-it="${esc(it)}" data-ops="${esc(ops.join("|"))}">${sel === "" ? "—" : ops[sel]}</button>
        <label class="field chk-obs"><input data-obs="${k}|${esc(it)}" value="${esc(x?.obs || "")}" placeholder="${ANOTAR.includes(it) ? "¿Qué hay?" : "¿Qué tiene?"}"></label></div>`; }).join("")}${k === "interior" ? `<div class="field chk-nafta"><span>Combustible</span>${seg("nafta", COMBUSTIBLE, c.nafta)}</div>` : ""}</fieldset>`).join("")}
    <fieldset class="card"><legend>Observaciones y fotos</legend>
      <label class="field"><textarea name="obs" rows="3" placeholder="Algo más para anotar">${esc(c.obs || "")}</textarea></label>
      ${botonesFotos({ id: "chk-op" })}<p class="muted small" id="chk-n">${c.fotos?.length ? `${c.fotos.length} fotos cargadas` : "Sin fotos"}</p>
      ${c.fotos?.length ? `<div class="desm-fotos">${c.fotos.map(f => `<button type="button" data-cfoto="${esc(f.url)}"><img src="${esc(thumb(f.url, 200))}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </fieldset></div>
    <div class="vform-bar">${pop ? `<button type="button" class="btn btn-ghost" data-close>Cancelar</button>` : `<a class="btn btn-ghost" href="#/v/${v.id}">Cancelar</a>`}
      <button class="btn btn-primary btn-lg" type="submit">${icon("check")}Guardar check ${t}</button></div></form>`;
  const form = $(".chk-form", view);
  conectarFotos($("#chk-op", view), nuevas => { files.push(...nuevas); $("#chk-n", view).textContent = `${(c.fotos?.length || 0) + files.length} fotos`; });
  form.addEventListener("click", e => {
    const f = e.target.closest("[data-cfoto]");
    if (f) return visor(c.fotos, Math.max(0, c.fotos.findIndex(x => x.url === f.dataset.cfoto)));
    const tg = e.target.closest(".chk-tog");
    if (tg) {   // sin marcar → Bien/Está/OK → Dañado/Falta/Revisar (abre la observación) → sin marcar
      const fila = tg.closest(".chk-fila"), s0 = fila.dataset.sel;
      const nv = s0 === "" ? "0" : s0 === "0" ? "1" : "";
      fila.dataset.sel = nv; tg.textContent = nv === "" ? "—" : tg.dataset.ops.split("|")[nv];
      if (getComputedStyle($(".chk-obs", fila)).display !== "none") $("input", fila).focus();
      return;
    }
    const b = e.target.closest("[data-n]"); if (!b) return;
    const on = b.classList.contains("on");   // tocar la elegida la desmarca
    $$(`[data-n="${b.dataset.n}"]`, form).forEach(x => x.classList.toggle("on", x === b && !on));
    val[b.dataset.n] = on ? null : +b.dataset.v;
  });
  form.onsubmit = async e => {
    e.preventDefault();
    const elegido = (n, antes) => n in val ? val[n] : antes ?? null;
    const datos = { por: S.profile?.name || "", t: Date.now(), obs: form.obs.value.trim() };
    CHECK[t].forEach(([k]) => { datos[k] = {}; });
    $$(".chk-tog", form).forEach(tg => {
      const fila = tg.closest(".chk-fila");
      const s1 = fila.dataset.sel, conObs = getComputedStyle($(".chk-obs", fila)).display !== "none";
      datos[tg.dataset.k][tg.dataset.it] = { v: s1 === "" ? null : +s1, obs: conObs ? $("input", fila).value.trim() : "" };
    });
    if (t === "in") datos.nafta = elegido("nafta", c.nafta);
    else datos.calidad = CALIDAD.map((_, i) => elegido("calidad." + i, c.calidad?.[i]));
    if (files.length && !cloudinaryListo()) return toast("Falta configurar Cloudinary", "error");
    const b = $(".vform-bar .btn-primary", form); busy(b, true, files.length ? "Subiendo fotos…" : "Guardando…");
    try {
      const subidas = [];
      for (const f of files) { const r = await subirMedia(f, `${S.company.id}/${v.id}/check-${t}`); subidas.push({ url: r.url, publicId: r.publicId }); }
      datos.fotos = [...(c.fotos || []), ...subidas];
      await actualizarVehiculo(v.id, { [campoCheck(t)]: datos }, `${c.t ? "Editó" : "Completó"} el check ${t}`);
      toast(`Check ${t} guardado`, "success");
      pop ? pop.cerrar() : go(`#/v/${v.id}`);
    } catch (err) { toast(mensajeError(err), "error"); busy(b, false); }
  };
}

// Fotos de pintura (saltó / despegó) y de repuestos: secciones aparte del vehículo; las de pintura también llegan por el bot con "Saltó pintura PATENTE"
const FOTOS_SEC = { fotosPintura: "pintura", fotosRepuestos: "repuestos" };
export function abrirFotosSec(v0, campo = "fotosPintura") {
  const nom = FOTOS_SEC[campo];
  const s = openSheet({ title: `${nom[0].toUpperCase() + nom.slice(1)} · ${v0.patente || v0.modelo || ""}`, wide: true, body: `<div class="stack">
    ${botonesFotos({ id: "pint-op" })}<div class="pint-caja"></div></div>` });
  const caja = $(".pint-caja", s.el);
  const pintar = () => {
    const fotos = (getVehiculo(v0.id) || v0)[campo] || [];
    caja.innerHTML = fotos.length ? `<div class="desm-fotos">${fotos.map(f => `<button type="button" data-pfoto="${esc(f.url)}"><img src="${esc(thumb(f.url, 200))}" alt="" loading="lazy"></button>`).join("")}</div>`
      : `<p class="muted center">Todavía no hay fotos de ${nom}.</p>`;
  };
  pintar();
  caja.onclick = e => {
    const f = e.target.closest("[data-pfoto]"); if (!f) return;
    const fotos = (getVehiculo(v0.id) || v0)[campo] || [];
    visor(fotos, Math.max(0, fotos.findIndex(x => x.url === f.dataset.pfoto)), getVehiculo(v0.id) || v0, campo);
  };
  conectarFotos($("#pint-op", s.el), async nuevas => {
    if (!cloudinaryListo()) return toast("Falta configurar Cloudinary", "error");
    caja.insertAdjacentHTML("afterbegin", `<p class="muted small" id="pint-sub">Subiendo ${nuevas.length} ${nuevas.length === 1 ? "foto" : "fotos"}…</p>`);
    try {
      const subidas = [];
      for (const f of nuevas) { const r = await subirMedia(f, `${S.company.id}/${v0.id}/${nom}`); subidas.push({ url: r.url, publicId: r.publicId, t: Date.now(), por: S.profile?.name || "" }); }
      const v = getVehiculo(v0.id) || v0;
      await actualizarVehiculo(v.id, { [campo]: [...(v[campo] || []), ...subidas] }, `Cargó ${subidas.length} ${subidas.length === 1 ? "foto" : "fotos"} de ${nom}`);
      toast(`Fotos de ${nom} guardadas`, "success");
      setTimeout(pintar, 400);
    } catch (err) { toast(mensajeError(err), "error"); $("#pint-sub", caja)?.remove(); }
  });
}

// Desmontaje (primera pestaña de "Desmontaje y check"): técnico, fotos y notas
function pintarDesmontaje(caja, v0) {
  const pintar = () => {
    const v = getVehiculo(v0.id) || v0, lotes = lotesDesm(v), c = S.company || {};
    // Sin desmontador elegido: por defecto, el primer miembro del operativo que cargó algo del desmontaje
    const primero = [...(v.desFotos || []), ...(v.desNotas || [])].filter(x => (c.members || []).includes(x.uid)).sort((a, b) => (a.t || 0) - (b.t || 0))[0];
    const quien = v.desmontador?.nombre || (primero && (c.memberNames?.[primero.uid] || primero.por));
    caja.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" id="desm-add">${icon("plus")}Cargar fotos y texto</button>
      ${lotes.length ? lotes.map(l => `<div class="desm-lote">
        <div class="desm-cab"><strong>${esc(l.por || "—")}</strong><small>${l.t ? fechaHora(l.t) : ""}</small></div>
        ${l.notas.map(n => `<p class="prose">${esc(n)}</p>`).join("")}
        ${l.fotos.length ? `<div class="desm-fotos">${l.fotos.map(f => `<button type="button" data-dfoto="${esc(f.url)}"><img src="${esc(thumb(f.url, 200))}" alt="" loading="lazy">${esVideo(f) ? `<span class="play-ic">▶</span>` : ""}</button>`).join("")}</div>` : ""}
      </div>`).join("") : `<p class="muted center">Todavía no hay desmontaje cargado.</p>`}
      <div class="desm-quien"><span>Desmontado por</span>
        <button type="button" class="btn btn-ghost btn-sm" id="desm-tec">${icon("team")}${esc(quien || "Elegir técnico")}</button></div>`;
  };
  pintar();
  caja.onclick = e => {   // onclick (no addEventListener): la pestaña se repinta cada vez que se entra
    const v = getVehiculo(v0.id) || v0;
    const f = e.target.closest("[data-dfoto]");
    if (f) { const todas = v.desFotos || []; return visor(todas, Math.max(0, todas.findIndex(x => x.url === f.dataset.dfoto))); }
    if (e.target.closest("#desm-add")) return formDesmontaje(v, () => setTimeout(pintar, 400));
    if (e.target.closest("#desm-tec")) return elegirTecnicoDesm(v, () => setTimeout(pintar, 400));
  };
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

// Aviso al cliente por WhatsApp al marcar Contactado, desde el número de la empresa: el del operativo, el del panel del creador o, sin ninguno, este
function textoAviso(v) {
  const propio = textoWa(S.company?.mensajes?.contactado || S.config?.mensajeWa, v);
  if (propio) return propio;
  const nombre = String(v.asegurado || "").trim().split(/\s+/)[0];
  return `Hola${nombre ? " " + nombre : ""}! 👋 Te escribimos de ${S.company?.name || "Desabollito"}: tu ${v.modelo || "vehículo"}${v.patente ? ` (${v.patente})` : ""} ya está reparado y listo para retirar. ¡Gracias por confiar en nosotros!`;
}
async function ofrecerAvisoCliente(v) {
  v = getVehiculo(v.id) || v;
  // Si no se puede avisar, se dice por qué (antes no pasaba nada y parecía roto)
  const no = S.config?.avisoReparado === false ? "El aviso al cliente está apagado en el panel del creador" : !v.telefono ? "Sin teléfono: no se le puede avisar al cliente" : v.avisoReparado ? "A este cliente ya se le avisó" : "";
  if (no) return toast(no);
  const chat = usaClientes() && !!telWa(v.telefono);
  if (!(await confirmar({ title: chat ? "¿Avisarle al cliente desde el chat en vivo?" : "¿Avisarle al cliente desde el teléfono de la empresa?",
    message: `Se le avisará ${v.asegurado ? "a " + v.asegurado : "al cliente"} que está listo su vehículo.`, ok: "Enviar mensaje", centro: true }))) return;
  const espera = openSheet({ title: "Avisando al cliente", body: `<p class="aviso-cargando"><span class="spin"></span>Enviando mensaje…</p>` });
  espera.el.classList.add("sheet-centro");   // en el celular, al medio como la pregunta de antes
  try {
    const r = await fetch(`${BOT_API}/avisar`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await S.user.getIdToken(), cid: S.company.id, vid: v.id, por: S.profile?.name || "", texto: textoAviso(v) }) }).finally(() => espera.close());
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || "No se pudo enviar");
    toast("Aviso enviado al cliente", "success");
    if (chat) abrirChatDe(v);   // el aviso queda guardado en el chat en vivo
  } catch (e) { espera.close();
    if (await confirmar({ title: "No se pudo enviar desde el número de la empresa", message: `${e.message}. ¿Abrir WhatsApp para mandarlo vos?`, ok: "Abrir WhatsApp", centro: true })) {
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
  const entregado = ["entregado", "facturado"].includes(est);
  const s = openSheet({ title: "Fechas de la reparación", body: `<form class="stack">
    ${entregado ? `<div class="field"><span>Cliente</span>${conformidadHTML(v)}</div>` : ""}
    ${pasos.map(k => `<label class="field"><span>${esc(ESTADO[k].label)}</span><input type="date" name="${k}" value="${esc(v.fechas?.[k] || "")}"></label>`).join("")}
    ${botonDeshacer(PASO_REP.includes(est) && pasoDeshacible(v, [est]))}
    <button class="btn btn-primary btn-block">Guardar</button></form>` });
  if (PASO_REP.includes(est)) conectarDeshacer(s, v, pasoDeshacible(v, [est]));
  if (entregado) elegirConformidad(s.el, v);
  $("form", s.el).onsubmit = ev => {
    ev.preventDefault();
    const fechas = { ...(v.fechas || {}) };
    pasos.forEach(k => { const val = ev.target[k].value; if (val) fechas[k] = val; });
    actualizarVehiculo(v.id, { fechas }, "Cambió las fechas de la reparación").then(() => toast("Fechas guardadas", "success")).catch(err => toast(mensajeError(err), "error"));
    s.close();
  };
}

const telWaOk = v => /\d{8}/.test(String(v.telefono || "").replace(/\D/g, ""));
// Mantener apretado un estado: el último "Pasó a …" de esos estados que se puede deshacer (botón dentro de la ventana de fechas)
const pasoDeshacible = (v, estados) => deshaciblesDe(getVehiculo(v.id) || v).find(e => estados.some(k => new RegExp(`^Pasó a ${ESTADO[k].label}( \\(|$)`).test(e.txt || "")));
// Deshacer es una tira para deslizar hasta el final (un toque sin querer no deshace nada)
const botonDeshacer = e => e ? `<label class="tira-deshacer"><input type="range" min="0" max="100" value="0" data-deshacer-estado aria-label="Deslizá hasta el final para deshacer: ${esc(sinPaso(e.txt))}">
  <span>${icon("rotate")}Deslizá para deshacer: ${esc(sinPaso(e.txt))}</span></label>` : "";
function conectarDeshacer(s, v, e) {
  const r = $("[data-deshacer-estado]", s.el); if (!r) return;
  let antes = 0;
  const poner = x => { r.value = x; antes = x; r.style.setProperty("--p", x + "%"); };
  // Tocar la tira hace saltar el control: un salto grande se ignora, solo cuenta arrastrar
  r.addEventListener("input", () => { if (r.value - antes > 25) r.value = antes; poner(+r.value); });
  r.addEventListener("change", () => {
    if (+r.value < 92) return poner(0);
    s.close();
    deshacerCambio(v, e).then(() => toast("Estado deshecho", "success")).catch(err => toast(mensajeError(err), "error"));
  });
}
// enChat: abierto desde el chat en vivo, al avisar no lo vuelve a abrir
export function elegirFechaEstado(v, estado, enChat) {
  const e = ESTADO[estado];
  // Sin título ni X: se cierra tocando afuera
  const s = openSheet({
    body: `<form class="stack">
      <label class="field"><span>${estado === "turnado" ? "Fecha del turno" : "Fecha"}</span>
        <input type="date" name="f" value="${v.fechas?.[estado] || hoyISO()}" required></label>
      ${estado === "turnado" ? `<div class="turno-conf"><span>¿Confirmó el turno?</span>
        <button type="button" class="switch ${v.turnoConfirmado === true ? "on" : ""}" id="t-conf" role="switch" aria-checked="${v.turnoConfirmado === true}">
          <span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button></div>` : ""}
      ${estado === "turnado" && usaClientes() && telWaOk(v) ? `<button type="button" class="btn btn-ghost btn-block" id="t-avisar">${icon("chat")}Avisar desde chat en vivo</button>` : ""}
      ${estadoActual(v) === estado ? botonDeshacer(pasoDeshacible(v, [estado])) : ""}
      <button class="btn btn-primary btn-block" style="--btn:${e.color}">Guardar</button></form>`
  });
  $(".sheet", s.el).setAttribute("aria-label", `Marcar como ${e.label.toLowerCase()}`);
  if (estadoActual(v) === estado) conectarDeshacer(s, v, pasoDeshacible(v, [estado]));
  let confirmado = v.turnoConfirmado === true;
  let avisar = false;
  // Avisar desde chat en vivo: guarda el turno, manda el mensaje y abre el chat
  $("#t-avisar", s.el)?.addEventListener("click", () => { avisar = true; $("form", s.el).requestSubmit(); });
  $("#t-conf", s.el)?.addEventListener("click", e => {
    confirmado = !confirmado;
    e.currentTarget.classList.toggle("on", confirmado); e.currentTarget.setAttribute("aria-checked", confirmado);
  });
  $("form", s.el).onsubmit = async ev => {
    ev.preventDefault();
    const fecha = ev.target.f.value;
    // Avisado por el chat en vivo: queda sin confirmar hasta que el cliente responda y alguien lo confirme
    cambiarEstado(v, estado, fecha, estado === "turnado" ? { turnoConfirmado: avisar ? false : confirmado } : {}).catch(err => toast(mensajeError(err), "error"));
    toast(`${e.label} · ${fechaCorta(ev.target.f.value)}`, "success");
    if (!avisar) return s.close();
    // Espera a que salga el mensaje (tarda ~1 s) y recién ahí abre el chat, así ya se ve
    busy(ev.submitter || $("form .btn-primary", s.el), true, "Avisando…");
    const vv = getVehiculo(v.id) || v;
    try { await avisarTurnoChat(vv, fecha); s.close(); if (!enChat) abrirChatDe(vv); }
    catch (err) { s.close(); toast(err.message || mensajeError(err), "error"); }

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

// Fotos subiéndose por vehículo: barra sobre la portada que se completa con cada foto (sobrevive a que se redibuje el detalle)
const subidas = new Map();   // vid → { h: hechas, t: total }
function barraSubida(vid) {
  const p = subidas.get(vid); if (!p) return "";
  return `<span class="d-cover-prog" role="progressbar" aria-label="Subiendo fotos" aria-valuemin="0" aria-valuemax="${p.t}" aria-valuenow="${p.h}"><i style="width:${Math.max(8, p.h / p.t * 100)}%"></i><small>${p.h}/${p.t}</small></span>`;
}
function pintarSubida(vid) {
  const c = document.querySelector(`.d-cover[data-vid="${CSS.escape(vid)}"]`); if (!c) return;
  c.querySelector(".d-cover-prog")?.remove();
  c.insertAdjacentHTML("beforeend", barraSubida(vid));
}

async function subirAdjuntos(v, files, tipo, root) {
  if (!cloudinaryListo()) { toast("Falta configurar Cloudinary en js/config.js", "error"); return; }
  const holders = files.map(() => null);
  const est = $("#fotos-estado", root);
  if (est && tipo === "foto") est.innerHTML = `<span class="spin"></span> Subiendo ${files.length} ${files.length === 1 ? "foto" : "fotos"}…`;
  if (tipo === "foto") { subidas.set(v.id, { h: 0, t: files.length }); pintarSubida(v.id); }
  else toast(`Subiendo ${files.length} ${files.length === 1 ? "archivo" : "archivos"}…`);
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
          nuevos.push({ url: r.url, publicId: r.publicId, w: r.w, h: r.h, at: Date.now(), by: S.user.uid, byName: S.profile?.name || "", n, ...(r.tipo ? { tipo: r.tipo } : {}) });
        } else {
          if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: supera 10 MB`);
          const r = await subir(file, carpeta, { tipo: "auto", nombre: file.name });
          if (r.deleteToken) tokensBorrado.set(r.publicId, r.deleteToken);
          nuevos.push({ url: r.url, publicId: r.publicId, name: file.name, bytes: r.bytes, format: r.format, at: Date.now(), by: S.user.uid, byName: S.profile?.name || "", n });
        }
      } catch (e) {
        console.error(e); toast(e.message, "error");
        holders[n]?.remove();
      }
      const p = subidas.get(v.id); if (tipo === "foto" && p) { p.h++; pintarSubida(v.id); }
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  if (tipo === "foto") { subidas.delete(v.id); pintarSubida(v.id); }
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

async function quitarAdjunto(v, campo, idx, confirmado = false) {
  const item = v[campo]?.[idx]; if (!item) return;
  if (soloVer()) return;
  if (!puedoEditar(v)) {
    const tipo = campo === "archivos" ? "documento" : "foto";
    if (!(await confirmar({ title: "Este vehículo no es tuyo",
      message: `Lo cargó ${cargadoPor(v)}. ¿Pedir a los administradores que quiten ${tipo === "foto" ? "esta foto" : `“${item.name}”`}?`, ok: "Pedir que la quiten", danger: true }))) return;
    crearSolicitud(v, tipo, item).then(() => toast("Pedido enviado a los administradores", "success")).catch(e => toast(mensajeError(e), "error"));
    return;
  }
  const ok = confirmado || await confirmar({
    title: campo === "archivos" ? `¿Quitar “${item.name}”?` : "¿Quitar esta foto?",
    message: "Se quita del vehículo y del PDF.", ok: "Quitar", danger: true
  });
  if (!ok) return;
  const lista = (getVehiculo(v.id)?.[campo] || []).filter(x => x.publicId !== item.publicId || x.url !== item.url);
  actualizarVehiculo(v.id, { [campo]: lista }, campo === "archivos" ? `Quitó el documento “${item.name}”` : FOTOS_SEC[campo] ? `Quitó una foto de ${FOTOS_SEC[campo]}` : "Quitó una foto")
    .then(() => borrarMedia(v.id, [item])).catch(e => toast(mensajeError(e), "error"));
  if (tokensBorrado.has(item.publicId)) borrarConToken(tokensBorrado.get(item.publicId));
}

// Foto a pantalla completa: pellizcar o doble toque para hacer zoom, arrastrar para mover
// mover(d): pasa a la foto anterior (-1) o siguiente (1) del visor y devuelve { url, previa }.
// Dos flechas flotantes abajo; en celular también deslizando (sin zoom).
function zoomFoto(url, previa, mover = null) {
  const el = document.createElement("div");
  el.className = "zoom-foto";
  el.innerHTML = `<img alt=""><button class="zoom-x" aria-label="Volver" title="Volver">${icon("back")}</button>
    ${mover ? `<div class="zoom-bar"><button class="icon-btn" data-zd="-1" aria-label="Foto anterior">${icon("back")}</button><button class="icon-btn" data-zd="1" aria-label="Foto siguiente">${icon("next")}</button></div>` : ""}`;
  document.body.appendChild(el);
  const im = $("img", el);
  let esc_ = 1, tx = 0, ty = 0, hd = null;
  const cargar = (url, previa) => {
    esc_ = 1; tx = 0; ty = 0; im.style.transform = "";
    im.src = previa || url;
    if (hd) hd.onload = null;   // la HD de la foto anterior no pisa a la nueva
    if (previa && previa !== url) { hd = new Image(); hd.onload = () => { im.src = url; }; hd.src = url; }
  };
  const pasar = d => { const f = mover(d); cargar(f.url, f.previa); };
  cargar(url, previa);
  if (mover) $(".zoom-bar", el).onclick = e => { const b = e.target.closest("[data-zd]"); if (b) pasar(+b.dataset.zd); };
  const pintar = () => { im.style.transform = `translate(${tx}px, ${ty}px) scale(${esc_})`; };
  const limitar = () => {
    if (esc_ <= 1) { esc_ = 1; tx = 0; ty = 0; return; }
    const mx = im.offsetWidth * (esc_ - 1) / 2, my = im.offsetHeight * (esc_ - 1) / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  };
  const cerrar = () => { el.remove(); removeEventListener("keydown", tecla, true); };
  const tecla = e => {
    if (e.key === "Escape") { e.stopPropagation(); cerrar(); }
    else if (mover && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.stopPropagation(); e.preventDefault(); pasar(e.key === "ArrowRight" ? 1 : -1); }
  };
  addEventListener("keydown", tecla, true);
  $(".zoom-x", el).onclick = cerrar;
  const ptrs = new Map();
  let d0 = 0, e0 = 1, p0 = null, ultimoToque = 0, movio = false, ini = null, pellizco = false;
  el.addEventListener("pointerdown", e => {
    if (e.target.closest(".zoom-x, .zoom-bar")) return;
    el.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); movio = false;
    if (ptrs.size === 1) { ini = { x: e.clientX, y: e.clientY }; pellizco = false; } else pellizco = true;
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
    // Deslizar a los costados sin zoom: foto anterior / siguiente
    const dx = e.clientX - (ini?.x ?? e.clientX), dy = e.clientY - (ini?.y ?? e.clientY);
    if (!ptrs.size && mover && !pellizco && esc_ === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return pasar(dx < 0 ? 1 : -1);
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

// Ícono de gota (pintura) y de carpeta con + (asignar foto a una sección)
const GOTA = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3.5 4.2 6 7.6 6 10.5a6 6 0 0 1-12 0C6 10.6 8.5 7.2 12 3z"/></svg>`;
const ASIGNAR = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/></svg>`;
function visor(fotos = [], inicio = 0, v = null, campo = "fotos") {   // campo: "fotos", "fotosPintura" o "fotosRepuestos"
  if (!fotos.length) return;
  // Mantener para borrar: solo en las fotos del vehículo y si el usuario puede editarlo
  const borrable = !!v && fotos === v[campo] && puedoEditar(v) && !soloVer();
  fotos = fotos.slice();   // copia: borrar/girar acá no toca la lista del estado
  let i = inicio;
  const s = openSheet({
    wide: true,
    body: `<div class="viewer">
      <div class="viewer-foto ${fotos.length > 1 ? "depth" : ""}"><img class="vw-lado vw-ant" alt="" aria-hidden="true"><img class="vw-lado vw-sig" alt="" aria-hidden="true"><img id="vw-img" alt=""><video id="vw-vid" controls playsinline preload="metadata" hidden></video><span class="viewer-carga" hidden><span class="spin"></span></span>
        ${v && campo === "fotos" && puedoEditar(v) ? `<button class="icon-btn viewer-ov viewer-rot" id="vw-rot" aria-label="Girar foto" title="Girar">${icon("rotate")}</button>` : ""}
        <button class="icon-btn viewer-ov viewer-x" data-close aria-label="Cerrar">${icon("x")}</button>
        <button class="icon-btn viewer-ov viewer-dl" id="vw-dl" aria-label="Descargar" title="Descargar">${icon("download")}</button>
</div>
      <div class="viewer-bar">
        <button class="icon-btn" data-p aria-label="Anterior" ${fotos.length > 1 ? "" : "disabled"}>${icon("back")}</button>
        <div class="vw-centro"><span id="vw-n"></span></div>
        <button class="icon-btn" data-n aria-label="Siguiente" ${fotos.length > 1 ? "" : "disabled"}>${icon("next")}</button>
      </div>
      ${v ? `<div class="viewer-add"><div class="viewer-add-fila">${(campo === "fotos" || FOTOS_SEC[campo]) && puedoEditar(v) ? `<button type="button" class="icon-btn viewer-pint-fila" id="vw-pint" aria-label="Mover foto a otra sección" title="Asignar a…">${ASIGNAR}</button>` : ""}${campo === "fotos" ? `<button type="button" class="btn btn-ghost btn-block" id="vw-mas">${icon("plus")}Añadir más fotos</button>` : ""}
        ${borrable ? `<button type="button" class="hold-del" id="vw-del" aria-label="Mantené apretado para borrar esta foto" title="Mantené apretado para borrar">
          <svg class="anillo" viewBox="0 0 36 36" aria-hidden="true"><circle class="base" cx="18" cy="18" r="16" pathLength="100"/><circle cx="18" cy="18" r="16" pathLength="100"/></svg>${icon("trash")}</button>` : ""}</div>
        <div class="viewer-mas" id="vw-mas-op" hidden>${botonesFotos({ id: "vw-add" })}</div></div>` : ""}
      </div>`
  });
  $(".sheet", s.el).classList.add("sheet-visor");
  const img0 = $("#vw-img", s.el), carga = $(".viewer-carga", s.el);
  // Al cargar la principal, se precargan en grande la anterior y la siguiente (pasar de foto es instantáneo)
  const precargar = () => [-1, 1].forEach(d => {
    const f = fotos[(i + d + fotos.length) % fotos.length];
    if (fotos.length > 1 && !esVideo(f)) new Image().src = grande(f.url, 1600, f.rot);
  });
  // Después, todas las siguientes en orden (de a una); al cerrar el visor se corta la descarga
  let pre = null, arranco = false;
  const precargarTodas = async () => {
    for (let k = 1; k < fotos.length; k++) {
      const f = fotos[(inicio + k) % fotos.length];
      if (!s.el.classList.contains("in")) return;
      if (esVideo(f)) continue;
      pre = new Image();
      await new Promise(r => { pre.onload = pre.onerror = r; pre.src = grande(f.url, 1600, f.rot); });
    }
  };
  new MutationObserver(() => { if (!s.el.classList.contains("in") && pre) pre.src = ""; }).observe(s.el, { attributes: true, attributeFilter: ["class"] });
  img0.addEventListener("load", () => { carga.hidden = true; img0.classList.remove("cargando"); precargar(); if (!arranco) { arranco = true; precargarTodas(); } });
  img0.addEventListener("error", () => { carga.hidden = true; img0.classList.remove("cargando"); });
  const vid = $("#vw-vid", s.el);
  const show = (dir = 0) => {
    const url = grande(fotos[i].url, 1600, fotos[i].rot);
    // Carrusel con profundidad: la anterior y la siguiente quedan atrás, a los costados
    const n = fotos.length;
    $(".viewer-foto", s.el).classList.toggle("depth", n > 1);
    [[".vw-ant", -1], [".vw-sig", 1]].forEach(([sel, d]) => {
      const im = $(sel, s.el), f = fotos[(i + d + n) % n];
      im.hidden = n < 2;
      if (n > 1) im.src = grande(f.url, 600, f.rot);
    });
    if (dir) [img0, vid].forEach(el => { el.classList.remove("dc-sig", "dc-ant"); void el.offsetWidth; el.classList.add(dir > 0 ? "dc-sig" : "dc-ant"); });
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
  const origen = f => esVideo(f) ? videoURL(f.url) : grande(f.url, 0, f.rot).replace("f_auto", "f_jpg");
  const celular = matchMedia("(pointer: coarse)").matches;
  const bajar = async n => {
    const f = fotos[n], nombre = nombreFoto(n);
    // Baja la foto directo y la guarda como PATENTE_NN (sin fl_attachment: cada uno era una transformación más)
    try {
      const r = await fetch(origen(f)); if (!r.ok) throw new Error(r.status);
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { open(f.url, "_blank", "noopener"); }
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
  const ir = d => { if (fotos.length < 2) return; i = (i + d + fotos.length) % fotos.length; show(d); };
  if ($("[data-p]", s.el)) $("[data-p]", s.el).onclick = () => ir(-1);
  if ($("[data-n]", s.el)) $("[data-n]", s.el).onclick = () => ir(1);
  let x0 = null, deslizo = false;
  const img = $("#vw-img", s.el), marco = $(".viewer-foto", s.el);
  img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; deslizo = false; }, { passive: true });
  img.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { deslizo = true; ir(dx < 0 ? 1 : -1); }
  });
  // Touchpad: deslizar con dos dedos a los costados (un paso por gesto, aunque siga la inercia)
  let acum = 0, gesto = false, finGesto = null;
  marco.addEventListener("wheel", e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    clearTimeout(finGesto); finGesto = setTimeout(() => { gesto = false; acum = 0; }, 180);
    if (gesto) return;
    acum += e.deltaX;
    if (Math.abs(acum) > 40) { gesto = true; ir(acum > 0 ? 1 : -1); }
  }, { passive: false });
  // Mantener apretado 1,2 s para borrar esta foto (Enter/Espacio: pide confirmación)
  const del = $("#vw-del", s.el);
  if (del) {
    let reloj = null;
    const soltar = () => { clearTimeout(reloj); del.classList.remove("cargando"); };
    const borrarActual = async conf => {
      const f = fotos[i], idx = (getVehiculo(v.id)?.[campo] || []).findIndex(x => x.url === f.url);
      if (idx < 0) return;
      if (!conf && !(await confirmar({ title: "¿Quitar esta foto?", message: "Se quita del vehículo y del PDF.", ok: "Quitar", danger: true }))) return;
      quitarAdjunto(getVehiculo(v.id), campo, idx, true);
      navigator.vibrate?.([15, 40, 15]);
      fotos.splice(i, 1);
      if (!fotos.length) return s.close();
      i = Math.min(i, fotos.length - 1); show(1);
      toast("Foto eliminada");
    };
    del.addEventListener("pointerdown", e => {
      e.preventDefault(); del.setPointerCapture?.(e.pointerId);
      del.classList.add("cargando"); navigator.vibrate?.(8);
      reloj = setTimeout(() => { soltar(); borrarActual(true); }, 1200);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => del.addEventListener(ev, soltar));
    del.addEventListener("contextmenu", e => e.preventDefault());
    del.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); borrarActual(false); } });
  }
  // Tocar la foto: se abre a pantalla completa con zoom
  // shortcut: un video en la foto grande se ve como imagen fija; para reproducirlo se vuelve al visor
  const actual = () => ({ url: grande(fotos[i].url, 2400, fotos[i].rot), previa: grande(fotos[i].url, 1600, fotos[i].rot) });
  img.addEventListener("click", () => { if (!deslizo) zoomFoto(actual().url, img.src, fotos.length > 1 ? d => { ir(d); return actual(); } : null); deslizo = false; });
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
  // Asignar: mueve esta foto entre las principales, las de pintura y las de repuestos del vehículo
  $("#vw-pint", s.el)?.addEventListener("click", () => {
    const f = fotos[i];
    const ops = [["fotos", "Principal", icon("image"), "var(--primary)"], ["fotosPintura", "Pintura", GOTA, "#d93a40"], ["fotosRepuestos", "Repuestos", icon("tool"), "#1f7a4c"]].filter(o => o[0] !== campo);
    const h = openSheet({ title: "Mover foto a…", body: `<div class="dl-opts">${ops.map(([c, l, ic, col]) =>
      `<button class="dl-opt" data-sec="${c}"><span class="dl-ico" style="background:${col}">${ic}</span><strong>${l}</strong></button>`).join("")}</div>` });
    h.body.addEventListener("click", e => {
      const campoDest = e.target.closest("[data-sec]")?.dataset.sec; if (!campoDest) return;
      h.close();
      const act = getVehiculo(v.id) || v, nom = FOTOS_SEC[campoDest] || "principales";
      if (!(act[campo] || []).some(x => x.url === f.url)) return;
      actualizarVehiculo(v.id, { [campo]: act[campo].filter(x => x.url !== f.url), [campoDest]: [...(act[campoDest] || []), f] }, `Pasó una foto a ${nom}`)
        .then(() => toast(`Foto pasada a ${nom}`, "success")).catch(e => toast(mensajeError(e), "error"));
      const k = fotos.indexOf(f); if (k >= 0) fotos.splice(k, 1);
      if (!fotos.length) return s.close();
      i = Math.min(i, fotos.length - 1); show(1);
    });
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
  // Al girar el celular el canvas cambia de tamaño en pantalla pero no por dentro: se escala el toque para que caiga bajo el dedo
  const pos = e => { const b = c.getBoundingClientRect(); return { x: (e.clientX - b.left) * c.width / dpr / b.width, y: (e.clientY - b.top) * c.height / dpr / b.height }; };
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
      ${hayFotos ? `<label class="toggle"><input type="checkbox" id="con-fotos"><span>Incluir las ${v.fotos.length} fotos</span></label>` : ""}
      ${puedeCompartirArchivos() ? `<button class="btn btn-primary btn-block btn-lg" data-m="share">${icon("share")}Compartir PDF</button>` : ""}
      <button class="btn ${puedeCompartirArchivos() ? "btn-ghost" : "btn-primary btn-lg"} btn-block" data-m="save">${icon("download")}Descargar PDF</button>
      ${soyDesmontaje() ? "" : `<button class="btn btn-ghost btn-block" data-link>${icon("car")}Link de seguimiento</button>`}</div>`
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
    preparando = presupuestoPDF(v, S.company, { conFotos, etapa: S.config?.etapasPdf ? (tipo, x) => etapaItem(v, tipo, x) : null })
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
      const pedido = linkVehiculo(v.id);
      // Solo se copia el link corto. El portapapeles se pide en este mismo toque (si no, el celular lo bloquea) y se llena cuando llega el link.
      const copia = window.ClipboardItem && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "text/plain": pedido.then(u => new Blob([u], { type: "text/plain" })) })])
        : pedido.then(u => navigator.clipboard.writeText(u));
      try {
        const url = await pedido, ok = await copia.then(() => true, () => false);
        busy(lk, false);
        if (ok) { toast(`Link copiado: ${url.replace(/^https?:\/\//, "")}`, "success"); s.close(); return; }
        // Sin permiso de portapapeles: el link queda a la vista para copiarlo a mano
        lk.insertAdjacentHTML("afterend", `<input readonly value="${esc(url)}" style="width:100%">`);
        lk.nextElementSibling.select();
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
          <datalist id="dl-comp">${ciasPorCantidad().map(o => `<option value="${esc(o)}">`).join("")}</datalist>
          <datalist id="dl-loc">${opciones("localidad")}</datalist>
        </fieldset>
        <div class="vform-der">
        <fieldset class="card vform-map">
          <legend class="leg-flex"><span>Paños afectados</span></legend>
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
          <div class="stack ff-ultima">
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
  const quitados = new Set();   // documentos que ya tenía y se quitan al guardar (se recuperan con Deshacer)
  const pintarDocs = () => {
    $("#ff-docs", view).innerHTML = (v?.archivos || []).filter(a => !quitados.has(a.url)).map(a => `
      <li><span class="ff-doc ok">${icon("file")}<span>${esc(a.name)}</span></span>
        <button type="button" class="icon-btn sm" data-quitar-viejo="${esc(a.url)}" aria-label="Quitar documento">${icon("x")}</button></li>`).join("") + docsNuevos.map(d => `
      <li><span class="ff-doc ${d.estado}">${d.estado === "subiendo" ? `<span class="spin"></span>` : icon("file")}<span>${esc(d.name)}</span></span>
        <button type="button" class="icon-btn sm" data-quitar-doc="${d.key}" aria-label="Quitar documento">${icon("x")}</button></li>`).join("");
  };
  pintarDocs();   // los que ya tiene, con su x para quitarlos
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
    const vj = e.target.closest("[data-quitar-viejo]");
    if (vj) { quitados.add(vj.dataset.quitarViejo); return pintarDocs(); }
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
    if (!v) data.fechas = { peritado: hoyISO() };   // la fecha de peritaje es la del día de carga
    if (pendientes.size) {
      const b = $("button[type=submit]", form);
      busy(b, true, "Subiendo archivos…");
      await Promise.allSettled([...pendientes]);
      busy(b, false);
    }
    const listas = nuevas.filter(n => n.foto).map(n => n.foto);
    if (listas.length) data.fotos = [...(getVehiculo(vid)?.fotos || v?.fotos || []), ...listas];
    const docsListos = docsNuevos.filter(d => d.doc).map(d => d.doc);
    if (docsListos.length || quitados.size) data.archivos = [...(getVehiculo(vid)?.archivos || v?.archivos || []).filter(a => !quitados.has(a.url)), ...docsListos];
    // Con la caché offline el cambio se ve al instante; la red sincroniza sola.
    guardarVehiculo(nuevoId, data, !v).catch(err => toast("No se guardó: " + mensajeError(err), "error"));
    toast(v ? "Cambios guardados" : "Vehículo guardado", "success");
    go(`#/v/${nuevoId}`);
  });

}
