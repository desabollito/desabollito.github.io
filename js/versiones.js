// ═════════════════════════════════════════════════════════════
//  VERSIONES de las planillas (técnicos, fijos, facturación), como en Google Sheets.
//  Cada cambio guarda, en la misma escritura, cómo estaban antes los documentos que toca:
//    companies/{cid}/planHist/{planilla}/cambios/{id}: { at, uid, por, usuario, txt, antes: JSON de { docId: datos | null } }
//  Volver a una versión es un cambio más: queda registrado y también se puede revertir.
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, getDocs, query, orderBy, limit, writeBatch, serverTimestamp } from "./firebase.js";
import { S, mensajeError, soyCreador } from "./data.js";
import { $, esc, icon, toast, openSheet, confirmar } from "./ui.js";
import { estadoEn } from "./domain.js";
import { BOT_API } from "./config.js";

const TOPE = 300;   // shortcut: el historial muestra los últimos 300 cambios, paginar si hace falta ver más atrás
const AVISO_MS = 20000;   // varios toques seguidos salen en un solo WhatsApp
const PILAS = {};   // Deshacer: sobrevive al cambiar de pantalla, no al recargar (lo anterior queda en el Historial)
const fechaHora = ms => ms ? new Date(ms).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const escrituras = estado => Object.entries(estado).map(([id, datos]) => datos == null ? { id, borrar: true } : { id, datos });

// ── Aviso por WhatsApp al creador: el bot lee el detalle del historial y no avisa los cambios del propio creador ──
let cola = [], reloj = null;
async function mandarAvisos() {
  clearTimeout(reloj); reloj = null;
  const l = cola; cola = []; if (!l.length) return;
  const idToken = await S.user.getIdToken().catch(() => ""); if (!idToken) return;
  for (const k of new Set(l.map(x => x.k))) {
    const [cid, planilla] = k.split("/");
    fetch(`${BOT_API}/aviso-planilla`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, cid, planilla, ids: l.filter(x => x.k === k).map(x => x.id) }) }).catch(() => {});
  }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) mandarAvisos(); });

// Botones de la barra de arriba: Deshacer solo se ve al editar, al lado de Listo
export const botonesVersion = editando => `<button class="btn btn-ghost btn-sm" id="v-hist" aria-label="Historial de cambios" title="Historial de cambios">${icon("clock")}<span class="hide-sm">Historial</span></button>
  <button class="btn btn-ghost btn-sm" id="v-undo" ${editando ? "" : "hidden"} disabled>${icon("rotate")}<span>Deshacer</span></button>`;

// crudo(id): el documento tal como está en la base. todos(): todos los documentos. ver(estado | null): pinta ese estado (null = el real)
export function crearVersiones({ planilla, col, crudo, todos, ver, view, avisa = false }) {
  const cid = S.company.id, clave = `${cid}/${planilla}`, pila = PILAS[clave] ||= [];
  const colHist = collection(db, "companies", cid, "planHist", planilla, "cambios");
  let viendo = false;
  const refrescar = () => { const b = $("#v-undo"); if (b) { b.disabled = !pila.length; b.title = pila.length ? `Deshacer: ${pila[pila.length - 1].txt}` : "Nada para deshacer"; } };

  async function escribir(txt, writes, { sinPila = false } = {}) {
    if (viendo) { toast("Estás viendo una versión anterior: salí para editar", "warning"); return false; }
    const antes = Object.fromEntries(writes.map(w => [w.id, crudo(w.id) ?? null])), ref = doc(colHist);
    const entrada = { at: serverTimestamp(), uid: S.user.uid, por: S.profile?.name || "", usuario: S.profile?.username || "", txt, antes: JSON.stringify(antes) };
    if (!sinPila) { pila.push({ id: ref.id, txt, antes }); refrescar(); }
    try {
      for (let i = 0; i < writes.length; i += 400) {
        const b = writeBatch(db);
        if (!i) b.set(ref, entrada);
        writes.slice(i, i + 400).forEach(w => w.borrar ? b.delete(doc(col, w.id)) : b.set(doc(col, w.id), w.datos, { merge: !!w.merge }));
        await b.commit();
      }
    } catch (e) {
      const i = pila.findIndex(x => x.id === ref.id); if (i >= 0) pila.splice(i, 1);
      refrescar(); toast(mensajeError(e), "error"); return false;
    }
    if (avisa && !soyCreador()) { cola.push({ k: clave, id: ref.id }); clearTimeout(reloj); reloj = setTimeout(mandarAvisos, AVISO_MS); }
    return true;
  }

  const entradas = async () => (await getDocs(query(colHist, orderBy("at", "desc"), limit(TOPE)))).docs.map(d => {
    const e = d.data({ serverTimestamps: "estimate" });
    let antes = {}; try { antes = JSON.parse(e.antes || "{}"); } catch { /* entrada rota: se muestra sin poder volver */ }
    return { ...e, id: d.id, antes, ms: e.at?.toMillis?.() || 0 };
  });
  const quien = e => esc(e.por || (e.usuario ? "@" + e.usuario : "Alguien"));

  async function deshacer() {
    const u = pila[pila.length - 1]; if (!u) return;
    // El documento entero vuelve atrás: si otra persona lo tocó después, su cambio también se revierte
    const ajeno = await entradas().then(l => { const i = l.findIndex(e => e.id === u.id);
      return (i < 0 ? l : l.slice(0, i)).find(e => e.uid !== S.user.uid && Object.keys(e.antes).some(id => id in u.antes)); }).catch(() => null);
    if (ajeno && !(await confirmar({ title: "Otra persona cambió esto después", message: `${ajeno.por || "Alguien"}: ${ajeno.txt}. Si deshacés, ese cambio también se revierte.`, ok: "Deshacer igual", danger: true }))) return;
    pila.pop(); refrescar();
    if (await escribir(`Deshizo: ${u.txt}`, escrituras(u.antes), { sinPila: true })) toast("Cambio deshecho", "success");
  }

  // Visualizador: la planilla se pinta como estaba y una barra permite moverse en el tiempo. No cambia nada hasta confirmar.
  function visualizar(lista, inicial) {
    const n = lista.length;
    const barra = document.createElement("div");
    barra.className = "ver-barra"; barra.setAttribute("role", "region"); barra.setAttribute("aria-label", "Versiones anteriores");
    barra.innerHTML = `<div class="ver-info"><b id="vb-cuando"></b><span id="vb-txt"></span></div>
      <div class="ver-tiempo"><button type="button" class="icon-btn sm" id="vb-ant" aria-label="Versión anterior">${icon("back")}</button>
        <input type="range" id="vb-pos" min="0" max="${n}" step="1" aria-label="Línea de tiempo">
        <button type="button" class="icon-btn sm" id="vb-sig" aria-label="Versión siguiente">${icon("next")}</button></div>
      <div class="ver-acc"><button type="button" class="btn btn-ghost btn-sm" id="vb-salir">Salir sin cambiar</button>
        <button type="button" class="btn btn-primary btn-sm" id="vb-volver">Volver a esta versión</button></div>`;
    view.appendChild(barra);
    let k = inicial;   // 0 = ahora; k = cómo quedó después del cambio k; n = antes del cambio más viejo de la lista
    const pos = $("#vb-pos", barra);
    const mostrar = i => {
      k = Math.max(0, Math.min(n, i)); pos.value = n - k;
      const e = lista[k];
      $("#vb-cuando", barra).textContent = !k ? "Ahora" : e ? fechaHora(e.ms) : "Antes de estos cambios";
      $("#vb-txt", barra).innerHTML = e ? `${quien(e)}: ${esc(e.txt)}` : "Cómo estaba antes del primer cambio de la lista";
      $("#vb-volver", barra).disabled = !k;
      $("#vb-ant", barra).disabled = k === n; $("#vb-sig", barra).disabled = !k;
      ver(estadoEn(todos(), lista, k));
    };
    const salir = () => { viendo = false; barra.remove(); ver(null); };
    viendo = true; mostrar(k);
    pos.oninput = () => mostrar(n - Number(pos.value));
    $("#vb-ant", barra).onclick = () => mostrar(k + 1);
    $("#vb-sig", barra).onclick = () => mostrar(k - 1);
    $("#vb-salir", barra).onclick = salir;
    $("#vb-volver", barra).onclick = async () => {
      const elegida = lista[k], cuando = elegida ? fechaHora(elegida.ms) : "antes de estos cambios";
      if (!(await confirmar({ title: "¿Volver a esta versión?", message: `La planilla vuelve a como estaba (${cuando}). Queda registrado y podés volver al estado de ahora con Deshacer o desde el Historial.`, ok: "Volver a esta versión", danger: true }))) return;
      try {
        // Se relee por si alguien cambió algo mientras se miraba
        const l = await entradas(), j = elegida ? l.findIndex(e => e.id === elegida.id) : l.length;
        if (j < 0) return toast("Esa versión ya no está en la lista", "error");
        const destino = estadoEn(todos(), l, j);
        const ids = new Set(l.slice(0, j).flatMap(e => Object.keys(e.antes)));
        const cambian = [...ids].filter(id => JSON.stringify(destino[id] ?? null) !== JSON.stringify(crudo(id) ?? null));
        salir();
        if (!cambian.length) return toast("Ya estaba igual a esa versión");
        if (await escribir(`Volvió a la versión de ${cuando}`, escrituras(Object.fromEntries(cambian.map(id => [id, destino[id] ?? null]))))) {
          toast("Planilla restaurada", "success");
          const b = $("#v-undo"); if (b) b.hidden = false;   // arrepentirse queda a un toque, aunque no se esté editando
        }
      } catch (e) { toast(mensajeError(e), "error"); }
    };
  }

  async function abrir() {
    if (viendo) return;
    const s = openSheet({ title: "Historial de cambios", wide: true, body: `<div class="skeleton tall"></div>` });
    let lista;
    try { lista = await entradas(); }
    catch (e) { s.close(); return toast(mensajeError(e), "error"); }
    const cuerpo = $(".sheet-body", s.el);
    cuerpo.innerHTML = lista.length ? `<p class="muted small">Tocá un cambio para ver la planilla como quedó. No se cambia nada hasta que lo confirmes.</p>
      <ul class="ver-lista">${lista.map((e, i) => `<li><button type="button" class="ver-item" data-i="${i}"><span class="hist-txt"><strong>${quien(e)}</strong>${e.usuario ? ` <small class="muted">@${esc(e.usuario)}</small>` : ""} ${esc(e.txt)}</span><time>${fechaHora(e.ms)}</time></button></li>`).join("")}</ul>`
      : `<div class="empty small"><p>Todavía no hay cambios registrados. Se guardan desde esta versión de la app en adelante.</p></div>`;
    cuerpo.addEventListener("click", ev => { const b = ev.target.closest("[data-i]"); if (!b) return; s.close(); visualizar(lista, Number(b.dataset.i)); });
  }

  $("#v-undo")?.addEventListener("click", deshacer);
  $("#v-hist")?.addEventListener("click", abrir);
  refrescar();
  return { escribir, viendo: () => viendo, editando: on => { const b = $("#v-undo"); if (b) b.hidden = !on; } };
}
