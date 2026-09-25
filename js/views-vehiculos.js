import {
  S, activos, getVehiculo, guardarVehiculo, actualizarVehiculo, cambiarEstado, moverAPapelera,
  nuevoIdVehiculo, soyAdmin, mensajeError
} from "./data.js";
import { ESTADOS, ESTADO, SECUENCIA, PIEZA, ORDEN_PIEZAS, estadoActual, piezasMarcadas } from "./domain.js";
import {
  $, $$, esc, money, fechaCorta, fechaLarga, hoyISO, plate, estadoPill, icon, toast, openSheet,
  confirmar, busy, debounce, marcarError
} from "./ui.js";
import { carMapSVG, montarMapa } from "./carmap.js";
import { montar3D } from "./car3d.js";
import { subir, comprimir, borrarConToken, thumb, grande, cloudinaryListo } from "./media.js";
import { presupuestoPDF, nombreArchivo } from "./pdf.js";
import { setTopbar, go, esAncho } from "./shell.js";

// Filtros de la lista (se conservan al navegar)
const F = { estado: "todos", q: "", mios: false };
const tokensBorrado = new Map(); // publicId → delete_token (válido 10 min)

// ═════════════════════════════════════════════════════════════
//  LISTA
// ═════════════════════════════════════════════════════════════
function filtrar(lista) {
  const q = F.q.trim().toLowerCase();
  return lista.filter(v =>
    (F.estado === "todos" || estadoActual(v) === F.estado) &&
    (!F.mios || v.createdBy === S.user.uid) &&
    (!q || [v.modelo, v.patente, v.asegurado, v.compania, v.localidad, v.telefono]
      .some(x => (x || "").toLowerCase().includes(q))));
}

function tarjeta(v, sel) {
  const foto = v.fotos?.[0]?.url;
  const autor = S.company?.members?.length > 1 && v.createdBy !== S.user.uid ? v.createdByName : "";
  return `
  <a class="vcard ${sel ? "sel" : ""}" href="#/v/${v.id}" style="--c:${ESTADO[estadoActual(v)].color}">
    <span class="vthumb">${foto ? `<img src="${esc(thumb(foto, 160))}" alt="" loading="lazy">` : icon("car")}</span>
    <span class="vbody">
      <span class="vtop"><strong class="vmodel">${esc(v.modelo || "Sin modelo")}</strong>
</span>
      <span class="vmid">${plate(v.patente, "sm")}${estadoPill(v)}${v._pending ? `<span class="sync" title="Pendiente de sincronizar"></span>` : ""}</span>
      <span class="vsub"><span class="vcli">${esc(v.compania || "")}</span>
        ${autor ? `<em>${esc(autor.split(" ")[0])}</em>` : ""}<time>${fechaCorta(v.fechas?.peritado)}</time></span>
    </span>
  </a>`;
}

export function vistaVehiculos(view, selId = null) {
  const ancho = esAncho();
  const sel = selId ? getVehiculo(selId) : null;
  if (selId && !ancho) return vistaDetalle(view, selId);

  setTopbar({
    title: "Vehículos",
    sub: S.company?.name
  });

  view.innerHTML = `
    <div class="split ${ancho ? "split-on" : ""}">
      <section class="pane-list">
        <div class="list-tools">
          <label class="search">${icon("search")}
            <input type="search" id="q" placeholder="Buscar patente, modelo, asegurado…" value="${esc(F.q)}" autocomplete="off"></label>
          <div class="estado-strip" id="estado-strip" role="tablist" aria-label="Filtrar por estado"></div>
          ${S.company?.members?.length > 1 ? `
            <label class="toggle"><input type="checkbox" id="mios" ${F.mios ? "checked" : ""}><span>Solo los que cargué yo</span></label>` : ""}
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

    const lista = filtrar(todos);
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
    $("#limpiar", box)?.addEventListener("click", () => { F.q = ""; F.estado = "todos"; F.mios = false; $("#q", view).value = ""; pintar(); });
  };

  $("#q", view).addEventListener("input", debounce(e => { F.q = e.target.value; pintar(); }, 120));
  $("#estado-strip", view).addEventListener("click", e => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    F.estado = F.estado === b.dataset.e ? "todos" : b.dataset.e; pintar();
  });
  $("#mios", view)?.addEventListener("change", e => { F.mios = e.target.checked; pintar(); });
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

// Vista 3D (se recuerda mientras la app está abierta)
let modo3D = false;
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

function renderDetalle(root, v, embebido) {
  const est = estadoActual(v);
  const anulado = est === "anulado";
  const marcadas = piezasMarcadas(v);
  const todos = marcadas.length === ORDEN_PIEZAS.length;
  const puedeBorrar = soyAdmin() || v.createdBy === S.user.uid;

  root.innerHTML = `
  <article class="detail">
    <header class="d-head">
      ${v.fotos?.length
        ? `<button class="d-cover" data-act="galeria" aria-label="Ver las ${v.fotos.length} fotos">
             <img src="${esc(thumb(v.fotos[0].url, 240))}" alt=""><span class="d-cover-n">${icon("camera")}${v.fotos.length}</span></button>`
        : `<label class="d-cover vacio" aria-label="Agregar fotos">${icon("camera")}<small>Agregar fotos</small>
             <input type="file" accept="image/*" multiple hidden data-up="foto"></label>`}
      <div class="d-title">
        <h2>${esc(v.modelo || "Sin modelo")}</h2>
        <div class="d-plate">${plate(v.patente, "lg")}</div>
        ${v.precio ? `<div class="d-price"><strong>${money(v.precio)}</strong></div>` : ""}
      </div>
    </header>

    <div class="d-actions">
      <button class="btn btn-primary" data-act="pdf">${icon("share")}Compartir</button>
      ${v.telefono ? `<a class="btn btn-ghost d-half" href="${waLink(v.telefono)}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>
        <a class="btn btn-ghost d-half" href="tel:${esc(v.telefono)}">${icon("phone")}Llamar</a>` : ""}
      ${embebido ? `<a class="btn btn-ghost btn-icon" href="#/editar/${v.id}" aria-label="Editar" title="Editar">${icon("edit")}</a>` : ""}
    </div>

    <section class="d-sec">
      <h3>Seguimiento</h3>
      <ol class="stepper ${anulado ? "is-anulado" : ""}">
        ${SECUENCIA.map(k => {
          const e = ESTADO[k], hecho = !!v.fechas?.[k] && !anulado, actual = k === est;
          return `<li><button class="step ${hecho ? "done" : ""} ${actual ? "now" : ""}" data-estado="${k}" style="--c:${e.color}">
            <span class="dot">${hecho ? icon("check") : ""}</span>
            <span class="step-l">${e.label}</span>
            <span class="step-d">${v.fechas?.[k] ? fechaCorta(v.fechas[k]) : "—"}</span></button></li>`;
        }).join("")}
      </ol>
      <button class="link-btn ${anulado ? "" : "danger"}" data-act="anular">
        ${anulado ? `Reactivar trabajo (anulado el ${fechaCorta(v.fechas?.anulado)})` : "Anular trabajo"}</button>
    </section>

    <section class="d-sec d-grid">
      ${[["Asegurado", v.asegurado], ["Teléfono", v.telefono], ["Compañía de seguro", v.compania], ["Localidad", v.localidad]]
        .map(([l, x]) => `<div class="kv"><span>${l}</span><strong>${esc(x || "—")}</strong></div>`).join("")}
    </section>

    <section class="d-sec d-piezas">
      <div class="sec-head"><h3>Paños afectados ${todos ? "<small>todos</small>" : marcadas.length ? `<small>${marcadas.length}</small>` : ""}</h3>
        <button class="btn btn-ghost btn-sm vista-btn" data-act="vista3d">${modo3D ? "2D" : "3D"}</button></div>
      <div class="vista-3d" ${modo3D ? "" : "hidden"}></div>
      <div class="piezas-view" ${modo3D ? "hidden" : ""}>
        ${carMapSVG(v.piezas || {}, { size: "carmap-sm" })}
        <p class="piezas-caption" aria-live="polite">${todos ? "<strong>Todos</strong>" : marcadas.length ? "Tocá un paño para ver su nombre" : "Sin paños marcados"}</p>
        <ul class="piezas-list">${todos ? "<li>Todos</li>" : marcadas.map(k => `<li>${esc(PIEZA[k].label)}</li>`).join("") || "<li class='muted'>Sin paños marcados</li>"}</ul>
      </div>
      <p class="piezas-caption caption-3d" ${modo3D ? "" : "hidden"}>Arrastrá para girar · tocá un paño</p>
      ${v.grado ? `<div class="grado-fila"><span class="grado-tag g${v.grado}">Grado ${v.grado}</span></div>` : ""}
    </section>

    ${v.observaciones ? `<section class="d-sec"><h3>Observaciones</h3><p class="prose">${esc(v.observaciones)}</p></section>` : ""}
    ${v.repuestos ? `<section class="d-sec"><h3>Repuestos</h3><p class="prose">${esc(v.repuestos)}</p></section>` : ""}

    <section class="d-sec">
      <div class="sec-head"><h3>Documentos <small>${v.archivos?.length || 0}</small></h3>
        <label class="btn btn-ghost btn-sm">${icon("file")}Adjuntar
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" multiple hidden data-up="doc"></label></div>
      <ul class="docs">${(v.archivos || []).map((a, i) => `
        <li><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("file")}<span>${esc(a.name)}</span></a>
          <button class="icon-btn sm" data-del-doc="${i}" aria-label="Quitar documento">${icon("x")}</button></li>`).join("")}</ul>
    </section>

    <section class="d-sec">
      <div class="sec-head"><h3>Firma del cliente</h3>
        <button class="btn btn-ghost btn-sm" data-act="firma">${icon("sign")}${v.firma ? "Volver a firmar" : "Firmar"}</button></div>
      ${v.firma ? `<img class="firma-img" src="${esc(v.firma)}" alt="Firma del cliente">`
        : `<p class="muted small">Pedile al cliente que firme en la pantalla al entregar el auto.</p>`}
    </section>

    <footer class="d-foot">
      <span>Cargado por ${esc(v.createdByName || "—")}</span>
      ${puedeBorrar ? `<button class="icon-btn danger" data-act="borrar" aria-label="Eliminar vehículo" title="Eliminar">${icon("trash")}</button>` : ""}
    </footer>
  </article>`;

  if (modo3D) iniciar3D(root, v);

  // Acciones
  root.addEventListener("click", async e => {
    const t = e.target;
    const step = t.closest("[data-estado]");
    if (step) return elegirFechaEstado(v, step.dataset.estado);
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
    if (act === "anular") {
      if (anulado) {
        const ultimo = SECUENCIA.filter(k => v.fechas?.[k]).pop() || "peritado";
        return cambiarEstado(v, ultimo, v.fechas?.[ultimo] || hoyISO()).catch(err => toast(mensajeError(err), "error"));
      }
      if (await confirmar({ title: "¿Anular este trabajo?", message: "Queda registrado como anulado. Podés reactivarlo después.", ok: "Anular", danger: true }))
        cambiarEstado(v, "anulado").catch(err => toast(mensajeError(err), "error"));
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
  $$("[data-up]", root).forEach(inp => inp.addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length) subirAdjuntos(v, files, inp.dataset.up, root);
  }));
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
    await actualizarVehiculo(v.id, { [campo]: [...(actual[campo] || []), ...nuevos] });
    toast(tipo === "foto" ? "Fotos guardadas" : "Documentos guardados", "success");
  } catch (e) { toast(mensajeError(e), "error"); }
}

async function quitarAdjunto(v, campo, idx) {
  const item = v[campo]?.[idx]; if (!item) return;
  const ok = await confirmar({
    title: campo === "fotos" ? "¿Quitar esta foto?" : `¿Quitar “${item.name}”?`,
    message: "Se quita del vehículo y del PDF.", ok: "Quitar", danger: true
  });
  if (!ok) return;
  const lista = (getVehiculo(v.id)?.[campo] || []).filter(x => x.publicId !== item.publicId || x.url !== item.url);
  actualizarVehiculo(v.id, { [campo]: lista }).catch(e => toast(mensajeError(e), "error"));
  if (tokensBorrado.has(item.publicId)) borrarConToken(tokensBorrado.get(item.publicId));
}

function visor(fotos = [], inicio = 0, v = null) {
  if (!fotos.length) return;
  let i = inicio;
  const s = openSheet({
    wide: true,
    body: `<div class="viewer">
      <img id="vw-img" alt="">
      <div class="viewer-bar">
        <button class="icon-btn" data-p aria-label="Anterior">${icon("back")}</button>
        <span id="vw-n"></span>
        <a class="icon-btn" id="vw-dl" target="_blank" rel="noopener" aria-label="Abrir original">${icon("download")}</a>
        ${v ? `<button class="icon-btn danger" id="vw-del" aria-label="Quitar esta foto">${icon("trash")}</button>` : ""}
        <button class="icon-btn" data-n aria-label="Siguiente">${icon("next")}</button>
      </div>
      ${v ? `<label class="btn btn-ghost btn-block viewer-add">${icon("camera")}Agregar fotos
        <input type="file" accept="image/*" multiple hidden id="vw-add"></label>` : ""}
      </div>`
  });
  const show = () => {
    $("#vw-img", s.el).src = grande(fotos[i].url);
    const f = fotos[i];
    $("#vw-n", s.el).textContent = `${i + 1} de ${fotos.length}` + (f.via === "whatsapp" ? ` · por WhatsApp${f.byName ? " (" + f.byName + ")" : ""}` : "");
    $("#vw-dl", s.el).href = fotos[i].url;
  };
  $("[data-p]", s.el).onclick = () => { i = (i - 1 + fotos.length) % fotos.length; show(); };
  $("[data-n]", s.el).onclick = () => { i = (i + 1) % fotos.length; show(); };
  let x0 = null;
  const img = $("#vw-img", s.el);
  img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { i = (i + (dx < 0 ? 1 : -1) + fotos.length) % fotos.length; show(); }
  });
  $("#vw-add", s.el)?.addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (!files.length) return;
    s.close();
    subirAdjuntos(getVehiculo(v.id) || v, files, "foto", document);
  });
  $("#vw-del", s.el)?.addEventListener("click", async () => {
    const f = fotos[i];
    const idx = (getVehiculo(v.id)?.fotos || []).findIndex(x => x.url === f.url);
    s.close();
    if (idx >= 0) await quitarAdjunto(getVehiculo(v.id), "fotos", idx);
  });
  s.el.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") $("[data-n]", s.el).click();
    if (e.key === "ArrowLeft") $("[data-p]", s.el).click();
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
    if (!trazos) { toast("La firma está vacía", "warning"); return; }
    // Reducir a un PNG liviano para guardarlo en la base
    const out = document.createElement("canvas");
    out.width = 600; out.height = Math.round(600 * c.height / c.width);
    out.getContext("2d").drawImage(c, 0, 0, out.width, out.height);
    actualizarVehiculo(v.id, { firma: out.toDataURL("image/png") }).catch(e => toast(mensajeError(e), "error"));
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
            <label class="btn btn-ghost btn-block">${icon("camera")}Agregar fotos${v?.fotos?.length ? ` <small class="muted">(ya tiene ${v.fotos.length})</small>` : ""}
              <input type="file" accept="image/*" multiple hidden id="ff-in"></label>
            <div class="ff-grid" id="ff-grid"></div>
          </div>
        <fieldset class="card vform-veh">
          <legend>Vehículo</legend>
          <div class="grid-2">
            <label class="field"><span>Modelo</span>
              <input name="modelo" value="${esc(v?.modelo)}" placeholder="Toyota Corolla 2020" required autocomplete="off"></label>
            <label class="field"><span>Patente</span>
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
        <fieldset class="card vform-map">
          <legend>Paños afectados</legend>
          <div class="map-cab">
            <p class="muted small">Tocá los paños en el dibujo del auto.</p>
            <button type="button" class="btn btn-ghost btn-sm vista-btn" id="f-vista">3D</button>
          </div>
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
        <fieldset class="card vform-det">
          <legend>Detalle del trabajo</legend>
          <label class="field"><span>Observaciones</span>
            <textarea name="observaciones" rows="3" placeholder="Detalles adicionales">${esc(v?.observaciones)}</textarea></label>
          <label class="field"><span>Repuestos</span>
            <textarea name="repuestos" rows="2" placeholder="Un repuesto por línea">${esc(v?.repuestos)}</textarea></label>
          <div class="grid-2">
            <label class="field"><span>Precio</span>
              <span class="money-in"><i>$</i><input name="precio" inputmode="numeric" value="${v?.precio ? Number(v.precio).toLocaleString("es-AR") : ""}" placeholder="0"></span></label>
            ${v ? "" : `<label class="field"><span>Fecha de peritaje</span>
              <input name="fecha" type="date" value="${hoyISO()}"></label>`}
          </div>
        </fieldset>
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
  form.patente.addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""); });

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
  $("#ff-in", view).addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
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
      precio: Number(f.precio.value.replace(/\D/g, "")) || 0,
      piezas: Object.fromEntries(Object.entries(piezas).filter(([, on]) => on)),
      grado
    };
    const nuevoId = vid;
    if (!v) data.fechas = { peritado: f.fecha.value || hoyISO() };
    if (pendientes.size) {
      const b = $("button[type=submit]", form);
      busy(b, true, "Subiendo fotos…");
      await Promise.allSettled([...pendientes]);
      busy(b, false);
    }
    const listas = nuevas.filter(n => n.foto).map(n => n.foto);
    if (listas.length) data.fotos = [...(getVehiculo(vid)?.fotos || v?.fotos || []), ...listas];
    // Con la caché offline el cambio se ve al instante; la red sincroniza sola.
    guardarVehiculo(nuevoId, data, !v).catch(err => toast("No se guardó: " + mensajeError(err), "error"));
    toast(v ? "Cambios guardados" : "Vehículo guardado", "success");
    go(`#/v/${nuevoId}`);
  });

}
