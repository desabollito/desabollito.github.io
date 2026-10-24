// ═════════════════════════════════════════════════════════════
//  FACTURACIÓN: el documento firmado de cada vehículo. Solo figura en esta planilla (no en el vehículo).
//  Se guarda en companies/{cid}/factura/docs (antes planTec/_factura, se migra solo): { vids: [vid elegidos], estados: { [vid]: impreso|firmado|facturado }, docs: { [vid]: { url, publicId, name, bytes, at } } }
// ═════════════════════════════════════════════════════════════
import { db, doc, getDoc, onSnapshot, setDoc, deleteDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { S, activos, puedeVer, mensajeError, cambiarEstado } from "./data.js";
import { $, esc, icon, toast, plate, openSheet, glideMenu } from "./ui.js";
import { estadoActual } from "./domain.js";
import { setTopbar } from "./shell.js";
import { subir, cloudinaryListo, thumb } from "./media.js";
import { armarZip } from "./zip.js";

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
      <button class="btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}" id="f-edit" aria-label="Editar">${icon(F.editando ? "check" : "edit")}${F.editando ? "<span>Listo</span>" : ""}</button>` });
  if (!puedeVer("facturacion")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  if (!S.company) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  const ref = doc(db, "companies", S.company.id, "factura", "docs"), viejo = doc(db, "companies", S.company.id, "planTec", "_factura");
  let docs = {}, vids = [], estados = {}, vidSubir = null;
  // Sin elegir: Firmado si ya tiene la orden subida, si no Impreso (con orden subida nunca es Impreso)
  const estadoDe = vid => (docs[vid] && estados[vid] === "impreso" ? "" : estados[vid]) || (docs[vid] ? "firmado" : "impreso");
  // Firmados y facturados en el orden de vids: su posición es el número de línea (y el nombre de la descarga)
  const firmados = () => vids.map(id => activos().find(v => v.id === id)).filter(v => v && estadoDe(v.id) !== "impreso");
  // Al firmarse pasa al final de vids: toma el último número
  const alFinal = vid => estadoDe(vid) === "impreso" ? { vids: [...vids.filter(x => x !== vid), vid] } : {};
  view.innerHTML = `<div class="tec-page">
    <label class="search">${icon("search")}<input type="search" id="f-q" placeholder="Buscar patente o modelo" value="${esc(F.q)}" autocomplete="off" autocapitalize="characters"></label>
    <button type="button" class="btn btn-primary" id="f-add">${icon("plus")}Agregar vehículo</button>
    <input type="file" id="f-in" accept="application/pdf,image/*" hidden>
    <div id="f-body"><div class="skeleton tall"></div></div></div>`;

  const pintar = () => {
    const q = norm(F.q), body = $("#f-body", view); if (!body) return;
    // Firmados y facturados primero (numerados); los impresos al final, sin número
    const fs = firmados(), elegidos = [...fs, ...activos().filter(v => vids.includes(v.id) && !fs.includes(v))];
    const vs = elegidos.filter(v => !q || norm(v.patente).includes(q) || norm(v.modelo).includes(q));
    body.innerHTML = vs.length ? `<div class="table-wrap"><table class="tbl tbl-fact"><thead><tr><th class="num">#</th><th>Vehículo</th><th>Patente</th><th>Compañía</th><th>Estado</th><th></th></tr></thead>
      <tbody>${vs.map(v => { const d = docs[v.id], est = estadoDe(v.id);
        // El número de línea es el de la lista completa: buscando, cada vehículo conserva el suyo
        return `<tr data-vid="${esc(v.id)}"><td class="num muted">${est !== "impreso" ? fs.indexOf(v) + 1 : ""}</td><td>${esc(v.modelo || "—")}</td><td>${plate(v.patente)}</td><td>${esc(v.compania || "—")}</td>
          <td><button type="button" class="gs-chip" data-est="${est}" data-act="estado" aria-haspopup="listbox" aria-expanded="false" aria-label="Estado">${ESTADOS_F.find(([k]) => k === est)[1]}${icon("next")}</button></td>
          <td class="num">${!d || F.editando ? `<label class="btn btn-ghost btn-sm" for="f-in" data-act="subir" aria-label="${d ? "Cambiar" : "Cargar orden firmada"}">${icon("file")}<span class="hide-sm">${d ? "Cambiar" : "Cargar orden firmada"}</span></label>` : ""}
            ${d ? `<button type="button" class="btn btn-primary btn-sm" data-act="bajar" aria-label="Descargar">${icon("download")}</button>` : ""}
            ${F.editando ? `<button type="button" class="btn btn-ghost btn-sm" data-act="quitar" aria-label="Quitar de la lista">${icon("x")}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty small"><p>${q && elegidos.length ? "No hay vehículos con esa patente." : "Agregá los vehículos a facturar con el botón de arriba."}</p></div>`;
  };

  unsub?.();
  unsub = onSnapshot(ref, d => {
    if (!document.body.contains(view) || location.hash !== "#/facturacion") { unsub?.(); unsub = null; return; }
    docs = d.data()?.docs || {}; vids = d.data()?.vids || []; estados = d.data()?.estados || {}; pintar();
    // Volviendo de un vehículo: la planilla queda donde estaba
    if (F.volver) { const tw = $(".table-wrap", view); if (tw) tw.scrollTop = F.volver.t; scrollTo(0, F.volver.y); F.volver = null; }
    // shortcut: migración única desde planTec/_factura, borrar cuando ya no quede ninguno
    if (!d.exists() && !d.metadata.fromCache) getDoc(viejo).then(o => o.exists() && setDoc(ref, o.data()).then(() => deleteDoc(viejo))).catch(() => {});
  }, e => { $("#f-body", view).innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  // Mismo selector que el desmontaje (tira + patente); queda abierto para agregar varios
  $("#f-add", view).onclick = () => {
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
      try { await setDoc(ref, { vids: arrayUnion(b.dataset.id) }, { merge: true }); toast("Vehículo agregado", "success"); } catch (err) { toast(mensajeError(err), "error"); }
    });
  };
  $("#f-q", view).oninput = e => { F.q = e.target.value; pintar(); };
  $("#f-body", view).onclick = async e => {
    const b = e.target.closest("[data-act]"), vid = e.target.closest("[data-vid]")?.dataset.vid; if (!vid) return;
    // Tocar la fila (fuera de los botones) abre el vehículo; al volver queda en el mismo lugar
    if (!b) { F.volver = { y: scrollY, t: $(".table-wrap", view)?.scrollTop || 0 }; location.hash = `#/v/${vid}`; return; }
    if (b.dataset.act === "estado") {
      // Con la orden ya subida no puede volver a Impreso
      return glideMenu(b, docs[vid] ? ESTADOS_F.filter(([k]) => k !== "impreso") : ESTADOS_F, estadoDe(vid), async est => {
        try {
          await setDoc(ref, { estados: { [vid]: est }, ...(est !== "impreso" ? alFinal(vid) : {}) }, { merge: true });
          // Facturado acá también marca Facturado en el vehículo
          const v = activos().find(x => x.id === vid);
          if (est === "facturado" && v && estadoActual(v) !== "facturado") { await cambiarEstado(v, "facturado"); toast("Vehículo marcado Facturado", "success"); }
        } catch (err) { toast(mensajeError(err), "error"); }
      });
    }
    if (b.dataset.act === "subir") {
      // El <label for="f-in"> abre el selector solo (el .click() por código falla en Android)
      if (!cloudinaryListo()) { e.preventDefault(); return toast("Falta configurar Cloudinary en js/config.js", "error"); }
      vidSubir = vid;
    } else if (b.dataset.act === "quitar") {
      // el documento subido queda guardado: si se vuelve a agregar, reaparece
      try { await setDoc(ref, { vids: arrayRemove(vid) }, { merge: true }); } catch (err) { toast(mensajeError(err), "error"); }
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
      await setDoc(ref, { docs: { [vid]: { url: r.url, publicId: r.publicId, name: file.name, bytes: r.bytes, at: Date.now() } },
        ...(estadoDe(vid) === "impreso" ? { estados: { [vid]: "firmado" }, ...alFinal(vid) } : {}) }, { merge: true });   // subir la orden la pasa a Firmado
      toast("Documento guardado", "success");
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
  $("#f-edit").onclick = () => {
    F.editando = !F.editando;
    const b = $("#f-edit"); b.className = `btn btn-sm ${F.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(F.editando ? "check" : "edit")}${F.editando ? "<span>Listo</span>" : ""}`;
    pintar();
  };
  // Si cambian los vehículos solo se repinta la tabla: rearmar la página perdería el archivo elegido al volver del selector
  return { soloLista: pintar };
}
