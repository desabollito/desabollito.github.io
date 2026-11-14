// ═════════════════════════════════════════════════════════════
//  FACTURACIÓN: el documento firmado de cada vehículo. Solo figura en esta planilla (no en el vehículo).
//  Se guarda en companies/{cid}/factura/docs (antes planTec/_factura, se migra solo): { vids: [vid elegidos], estados: { [vid]: impreso|firmado|facturado }, docs: { [vid]: { url, publicId, name, bytes, at } } }
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, getDoc, onSnapshot, setDoc, deleteDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { S, activos, puedeVer, mensajeError, cambiarEstado } from "./data.js";
import { $, esc, icon, toast, plate, openSheet, glideMenu, fechaCorta } from "./ui.js";
import { estadoActual } from "./domain.js";
import { setTopbar } from "./shell.js";
import { subir, cloudinaryListo, thumb } from "./media.js";
import { armarZip } from "./zip.js";
import { crearVersiones, botonesVersion } from "./versiones.js";

const F = { q: "", editando: false, volver: null };
const ESTADOS_F = [["impreso", "Impreso"], ["firmado", "Firmado"], ["facturado", "Facturado"]];
let unsub = null;
const norm = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Se descarga como número de línea + patente (1_AA444AA.pdf), con la extensión del archivo subido
const nombreArchivo = (v, d, n) => `${n}_${norm(v.patente) || v.id}${(String(d.name || d.url || "").match(/\.[a-z0-9]{2,5}$/i) || [""])[0].toLowerCase()}`;
const guardarBlob = (blob, nombre) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
const traer = async d => { const r = await fetch(d.url); if (!r.ok) throw new Error(`No se pudo bajar ${d.name || "el documento"}`); return r.blob(); };

export function vistaFacturacion(view) {
  setTopbar({ title: "Facturación", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="f-todos">${icon("download")}<span class="hide-sm">Descargar todos</span></button>
      ${botonesVersion(F.editando)}<button class="btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}" id="f-edit" aria-label="Editar">${icon(F.editando ? "check" : "edit")}${F.editando ? "<span>Listo</span>" : ""}</button>` });
  if (!puedeVer("facturacion")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const ref = doc(db, "companies", S.company.id, "factura", "docs"), viejo = doc(db, "companies", S.company.id, "planTec", "_factura");
  let docs = {}, vids = [], estados = {}, fechaEst = {}, hist = {}, vidSubir = null, real = {};
  const cargar = d => { docs = d.docs || {}; vids = d.vids || []; estados = d.estados || {}; fechaEst = d.fechaEst || {}; hist = d.hist || {}; };
  // Cada cambio de estado guarda la fecha y queda en el historial del vehículo (quién, cuándo, a qué estado)
  const conFecha = (vid, est) => ({ estados: { [vid]: est }, fechaEst: { [vid]: Date.now() },
    hist: { [vid]: arrayUnion({ t: Date.now(), est, por: S.profile?.name || "" }) } });
  // Fecha del estado actual; los cambios de antes de registrarla usan la de facturado del vehículo o la de la orden subida
  const fechaDe = (v, est) => { const ms = fechaEst[v.id] || (est === "firmado" ? docs[v.id]?.at : 0);
    return ms ? fechaCorta(new Date(ms).toLocaleDateString("en-CA")) : est === "facturado" ? fechaCorta(v.fechas?.facturado) : ""; };
  const V = crearVersiones({ planilla: "facturacion", col: collection(db, "companies", S.company.id, "factura"), view, crudo: id => id === "docs" ? real : undefined, todos: () => ({ docs: real }),
    ver: estado => { if (estado && F.editando) alternarEdicion(); cargar(estado ? estado.docs || {} : real); pintar(); } });
  const guardar = (datos, txt) => V.escribir(txt, [{ id: "docs", datos, merge: true }]);
  const patenteDe = vid => activos().find(v => v.id === vid)?.patente || "Vehículo";
  // Sin elegir: Firmado si ya tiene la orden subida, si no Impreso (con orden subida nunca es Impreso)
  const estadoDe = vid => (docs[vid] && estados[vid] === "impreso" ? "" : estados[vid]) || (docs[vid] ? "firmado" : "impreso");
  // Firmados y facturados en el orden de vids: su posición es el número de línea (y el nombre de la descarga)
  const firmados = () => vids.map(id => activos().find(v => v.id === id)).filter(v => v && estadoDe(v.id) !== "impreso");
  // Al firmarse pasa al final de vids: toma el último número
  const alFinal = vid => estadoDe(vid) === "impreso" ? { vids: [...vids.filter(x => x !== vid), vid] } : {};
  view.innerHTML = `<div class="tec-page">
    <label class="search">${icon("search")}<input type="search" id="f-q" placeholder="Buscar patente o modelo" value="${esc(F.q)}" autocomplete="off" autocapitalize="characters"></label>
    <div class="row-btns"><button type="button" class="btn btn-primary" id="f-add">${icon("plus")}Agregar vehículo</button>
      <button type="button" class="btn btn-ghost" id="f-digital">${icon("check")}Facturados digital</button></div>
    <input type="file" id="f-in" accept="application/pdf,image/*" hidden>
    <div id="f-body"><div class="skeleton tall"></div></div></div>`;

  const pintar = () => {
    const q = norm(F.q), body = $("#f-body", view); if (!body) return;
    // Firmados y facturados primero (numerados); los impresos al final, sin número
    const fs = firmados(), elegidos = [...fs, ...activos().filter(v => vids.includes(v.id) && !fs.includes(v))];
    const vs = elegidos.filter(v => !q || norm(v.patente).includes(q) || norm(v.modelo).includes(q));
    body.innerHTML = vs.length ? `<div class="table-wrap"><table class="tbl tbl-fact"><thead><tr><th class="num">#</th><th>Vehículo</th><th>Patente</th><th>Compañía</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${vs.map(v => { const d = docs[v.id], est = estadoDe(v.id);
        // El número de línea es el de la lista completa: buscando, cada vehículo conserva el suyo
        return `<tr data-vid="${esc(v.id)}"><td class="num muted">${est !== "impreso" ? fs.indexOf(v) + 1 : ""}</td><td>${esc(v.modelo || "—")}</td><td>${plate(v.patente)}</td><td>${esc(v.compania || "—")}</td>
          <td><button type="button" class="gs-chip" data-est="${est}" data-act="estado" aria-haspopup="listbox" aria-expanded="false" aria-label="Estado">${ESTADOS_F.find(([k]) => k === est)[1]}${icon("next")}</button></td>
          <td class="muted">${esc(fechaDe(v, est) || "—")}</td>
          <td class="num"><button type="button" class="btn btn-ghost btn-sm" data-act="hist" aria-label="Historial de estados">${icon("clock")}</button>${!d || F.editando ? `<label class="btn btn-ghost btn-sm" for="f-in" data-act="subir" aria-label="${d ? "Cambiar" : "Cargar orden firmada"}">${icon("file")}<span class="hide-sm">${d ? "Cambiar" : "Cargar orden firmada"}</span></label>` : ""}
            ${d ? `<button type="button" class="btn btn-primary btn-sm" data-act="bajar" aria-label="Descargar">${icon("download")}</button>` : ""}
            ${F.editando ? `<button type="button" class="btn btn-ghost btn-sm" data-act="quitar" aria-label="Quitar de la lista">${icon("x")}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty small"><p>${q && elegidos.length ? "No hay vehículos con esa patente." : "Agregá los vehículos a facturar con el botón de arriba."}</p></div>`;
  };

  unsub?.();
  unsub = onSnapshot(ref, d => {
    if (!document.body.contains(view) || location.hash !== "#/facturacion") { unsub?.(); unsub = null; return; }
    real = d.data() || {};
    if (V.viendo()) return;   // mirando una versión anterior, lo nuevo se pinta al salir
    cargar(real); pintar();
    // Volviendo de un vehículo: la planilla queda donde estaba
    if (F.volver) { const tw = $(".table-wrap", view); if (tw) tw.scrollTop = F.volver.t; scrollTo(0, F.volver.y); F.volver = null; }
    // shortcut: migración única desde planTec/_factura, borrar cuando ya no quede ninguno
    if (!d.exists() && !d.metadata.fromCache) getDoc(viejo).then(o => o.exists() && setDoc(ref, o.data()).then(() => deleteDoc(viejo))).catch(() => {});
  }, e => { $("#f-body", view).innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  // Mismo selector que el desmontaje (tira + patente); queda abierto para agregar varios
  $("#f-add", view).onclick = () => {
    if (V.viendo()) return;
    const s = openSheet({ title: "Agregar vehículo", wide: true, body: `<div class="stack">
        <label class="search">${icon("search")}<input type="search" id="dv-q" placeholder="Patente o modelo" autocomplete="off" autocapitalize="characters"></label>
        <div class="dv-tira" id="dv-lista"></div></div>` });
    const lista = $("#dv-lista", s.el), q = $("#dv-q", s.el);
    const pintarTira = () => {
      const f = norm(q.value);
      const vs = activos().filter(v => !vids.includes(v.id) && (!f || norm(v.patente).includes(f) || norm(v.modelo).includes(f))).slice(0, 60);
      lista.innerHTML = vs.length ? vs.map(v => `<button type="button" class="dv-item" data-id="${esc(v.id)}">
          ${v.fotos?.length ? `<img src="${esc(thumb(v.fotos[0].url, 160, v.fotos[0].rot))}" alt="">` : `<span class="dv-sin">${icon("car")}</span>`}
          <strong>${esc(v.modelo || "Sin modelo")}</strong>${plate(v.patente)}</button>`).join("")
        : `<p class="muted center">No hay vehículos con esa patente.</p>`;
    };
    pintarTira(); q.focus();
    q.addEventListener("input", pintarTira);
    // La ruedita avanza de a un vehículo por la tira horizontal
    lista.addEventListener("wheel", e => { if (!e.deltaY) return; e.preventDefault(); lista.scrollBy({ left: Math.sign(e.deltaY) * 150, behavior: "smooth" }); }, { passive: false });
    lista.addEventListener("click", async e => {
      const b = e.target.closest("[data-id]"); if (!b) return;
      vids = [...vids, b.dataset.id]; pintarTira(); q.select();
      if (await guardar({ vids: arrayUnion(b.dataset.id) }, `Agregó ${patenteDe(b.dataset.id)}`)) toast("Vehículo agregado", "success");
    });
  };
  // Facturados digital: los que están en Facturado en Vehículos pero no en esta planilla (que es la de facturados físico)
  $("#f-digital", view).onclick = () => { location.hash = "#/factdigital"; };
  $("#f-q", view).oninput = e => { F.q = e.target.value; pintar(); };
  $("#f-body", view).onclick = async e => {
    const b = e.target.closest("[data-act]"), vid = e.target.closest("[data-vid]")?.dataset.vid; if (!vid) return;
    if (V.viendo()) { e.preventDefault(); return; }
    // Tocar la fila (fuera de los botones) abre el vehículo; al volver queda en el mismo lugar
    if (!b) { F.volver = { y: scrollY, t: $(".table-wrap", view)?.scrollTop || 0 }; location.hash = `#/v/${vid}`; return; }
    const ponerEstado = async est => {
      try {
        if (!(await guardar({ ...conFecha(vid, est), ...(est !== "impreso" ? alFinal(vid) : {}) }, `${patenteDe(vid)}: pasó a ${ESTADOS_F.find(([k]) => k === est)[1]}`))) return;
        // Facturado acá también marca Facturado en el vehículo
        const v = activos().find(x => x.id === vid);
        if (est === "facturado" && v && estadoActual(v) !== "facturado") { await cambiarEstado(v, "facturado"); toast("Vehículo marcado Facturado", "success"); }
      } catch (err) { toast(mensajeError(err), "error"); }
    };
    // Con la orden ya subida no puede volver a Impreso
    if (b.dataset.act === "estado") return glideMenu(b, docs[vid] ? ESTADOS_F.filter(([k]) => k !== "impreso") : ESTADOS_F, estadoDe(vid), ponerEstado);
    if (b.dataset.act === "hist") {
      const nom = k => ESTADOS_F.find(([x]) => x === k)?.[1] || k, actual = estadoDe(vid);
      const l = (hist[vid] || []).slice().sort((x, y) => y.t - x.t);
      const s = openSheet({ title: `Estados · ${patenteDe(vid)}`, body: `<div class="stack">${l.length ? `<ul class="f-hist">${l.map(h => `<li>
          <span><b>${esc(nom(h.est))}</b><small class="muted">${esc(new Date(h.t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }))}${h.por ? " · " + esc(h.por) : ""}</small></span>
          ${h.est !== actual && !(docs[vid] && h.est === "impreso") ? `<button type="button" class="btn btn-ghost btn-sm" data-volver="${esc(h.est)}">${icon("restore")}Volver a este</button>` : ""}</li>`).join("")}</ul>`
        : `<p class="muted">Todavía no hay cambios registrados. Se guardan desde ahora, cada vez que alguien cambia el estado.</p>`}</div>` });
      s.el.addEventListener("click", ev => { const x = ev.target.closest("[data-volver]"); if (x) { s.close(); ponerEstado(x.dataset.volver); } });
      return;
    }
    if (b.dataset.act === "subir") {
      // El <label for="f-in"> abre el selector solo (el .click() por código falla en Android)
      if (!cloudinaryListo()) { e.preventDefault(); return toast("Falta configurar Cloudinary en js/config.js", "error"); }
      vidSubir = vid;
    } else if (b.dataset.act === "quitar") {
      // el documento subido queda guardado: si se vuelve a agregar, reaparece
      guardar({ vids: arrayRemove(vid) }, `Quitó ${patenteDe(vid)} de la lista`);
    } else {
      const v = activos().find(x => x.id === vid);
      try { guardarBlob(await traer(docs[vid]), nombreArchivo(v, docs[vid], firmados().indexOf(v) + 1)); } catch (err) { toast(err.message, "error"); }
    }
  };
  $("#f-in", view).onchange = async e => {
    const file = e.target.files[0], vid = vidSubir; e.target.value = "";
    if (!file || !vid) return;
    if (file.size > 10 * 1024 * 1024) return toast(`${file.name}: supera 10 MB`, "error");
    toast("Subiendo documento…");
    try {
      const r = await subir(file, `${S.company.id}/${vid}/factura`, { tipo: "auto", nombre: file.name });
      const ok = await guardar({ docs: { [vid]: { url: r.url, publicId: r.publicId, name: file.name, bytes: r.bytes, at: Date.now() } },
        ...(estadoDe(vid) === "impreso" ? { ...conFecha(vid, "firmado"), ...alFinal(vid) } : {}) }, `${patenteDe(vid)}: subió la orden firmada`);   // subir la orden la pasa a Firmado
      if (ok) toast("Documento guardado", "success");
    } catch (err) { toast(mensajeError(err), "error"); }
  };
  $("#f-todos").onclick = async () => {
    const lista = firmados();
    if (!lista.length) return toast("Todavía no hay documentos subidos");
    toast(`Preparando ${lista.length} documentos…`);
    try {
      const archivos = [];
      for (const [i, v] of lista.entries()) archivos.push({ nombre: nombreArchivo(v, docs[v.id], i + 1), datos: new Uint8Array(await (await traer(docs[v.id])).arrayBuffer()) });
      guardarBlob(armarZip(archivos), `Facturacion_${S.company?.name || "operativo"}.zip`.replace(/[\\/:*?"<>|]/g, "_"));
      toast("ZIP descargado", "success");
    } catch (err) { toast(err.message || "No se pudo descargar", "error"); }
  };
  const alternarEdicion = () => {
    F.editando = !F.editando; V.editando(F.editando);
    const b = $("#f-edit"); b.className = `btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(F.editando ? "check" : "edit")}${F.editando ? "<span>Listo</span>" : ""}`;
    pintar();
  };
  $("#f-edit").onclick = () => { if (!V.viendo()) alternarEdicion(); };
  // Si cambian los vehículos solo se repinta la tabla: rearmar la página perdería el archivo elegido al volver del selector
  return { soloLista: pintar };
}

// Facturados digital (página propia): en Facturado en Vehículos pero no en la planilla de Facturación (que es la de físicos).
// Con buscador y la fecha de facturado, que se ordena tocando el título (más recientes primero o al revés).
const FD = { q: "", dir: -1, volver: null };
export function vistaFactDigital(view) {
  setTopbar({ title: "Facturados digital", sub: S.company?.name, back: "#/facturacion" });
  if (!puedeVer("facturacion")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  view.innerHTML = `<div class="tec-page">
    <label class="search">${icon("search")}<input type="search" id="fd-q" placeholder="Buscar patente, modelo o compañía" value="${esc(FD.q)}" autocomplete="off" autocapitalize="characters"></label>
    <div id="fd-body"><div class="skeleton tall"></div></div></div>`;
  let vids = null;
  const pintar = () => {
    const body = $("#fd-body", view); if (!body || !vids) return;
    const q = norm(FD.q), fecha = v => v.fechas?.facturado || "";
    const todos = activos().filter(v => estadoActual(v) === "facturado" && !vids.includes(v.id));
    const vs = todos.filter(v => !q || [v.patente, v.modelo, v.compania].some(x => norm(x).includes(q)))
      .sort((a, b) => fecha(a).localeCompare(fecha(b)) * FD.dir);   // dir -1: más recientes primero
    body.innerHTML = vs.length ? `<p class="muted small">${vs.length} de ${todos.length}</p><div class="table-wrap"><table class="tbl tbl-fact"><thead><tr><th>Vehículo</th><th>Patente</th><th>Compañía</th>
        <th><button type="button" id="fd-orden" aria-label="Ordenar por fecha de facturado: ${FD.dir < 0 ? "más recientes primero" : "más antiguos primero"}">Facturado ${FD.dir < 0 ? "↓" : "↑"}</button></th></tr></thead>
      <tbody>${vs.map(v => `<tr data-ir="${esc(v.id)}" style="cursor:pointer"><td>${esc(v.modelo || "—")}</td><td>${plate(v.patente)}</td><td>${esc(v.compania || "—")}</td><td>${esc(fechaCorta(fecha(v)) || "—")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty small"><p>${q && todos.length ? "No hay vehículos con esa búsqueda." : "No hay vehículos facturados fuera de la planilla de Facturación."}</p></div>`;
  };
  getDoc(doc(db, "companies", S.company.id, "factura", "docs")).then(d => {
    vids = d.data()?.vids || []; pintar();
    if (FD.volver !== null) { scrollTo(0, FD.volver); FD.volver = null; }   // volviendo de un vehículo, queda donde estaba
  }).catch(e => { $("#fd-body", view).innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });
  $("#fd-q", view).oninput = e => { FD.q = e.target.value; pintar(); };
  $("#fd-body", view).onclick = e => {
    if (e.target.closest("#fd-orden")) { FD.dir *= -1; return pintar(); }
    const r = e.target.closest("[data-ir]"); if (r) { FD.volver = scrollY; location.hash = `#/v/${r.dataset.ir}`; }
  };
}
