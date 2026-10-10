// ═════════════════════════════════════════════════════════════
//  NOTIFICACIONES: cambios que hicieron otros en los vehículos del operativo
//  Salen del historial de cada vehículo (y de las fotos y vehículos nuevos, que no siempre
//  dejan historial). Lo último visto se guarda en el perfil (users/{uid}.notifVisto[cid]),
//  así el puntito se apaga en todos los equipos.
// ═════════════════════════════════════════════════════════════
import { db, doc, updateDoc } from "./firebase.js";
import { S, activos, onChange } from "./data.js";
import { $, esc, icon, openSheet, plate } from "./ui.js";
import { sonidoNotif } from "./sonidos.js";

const DIAS = 7, MAX = 80;
const ms = t => typeof t === "number" ? t : t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0);
const visto = () => {
  const v = S.profile?.notifVisto?.[S.company?.id];
  return typeof v === "number" ? v : Date.now() - 24 * 3600_000;   // la primera vez: lo de las últimas 24 h
};

// Solo se avisan cambios a los datos del vehículo y fotos nuevas: no la carga, ni los estados,
// ni las etapas de repuestos y pintura (Pedido, Recibido, Pintado…)
const ETAPAS_TXT = /: (Sin pedir|Pedido|Recibido|Colocado|Sin pintar|Turnado|Pintado)$/;
const avisable = txt => !!txt && !/^(Pasó a|Volvió a|Carg[óo] el veh)/.test(txt) && !ETAPAS_TXT.test(txt);
const MIN_CARGA = 30 * 60_000;   // fotos de los primeros 30 min = las de la carga, no se avisan
export function listaNotifs() {
  const yo = S.user?.uid, desde = Date.now() - DIAS * 86400_000, out = [];
  if (!yo || S.invitado) return out;
  for (const v of activos()) {
    const base = { vid: v.id, patente: v.patente, modelo: v.modelo };
    const t0h = Math.min(...(v.historial || []).map(e => e.t || Infinity)), tc = ms(v.createdAt) || (Number.isFinite(t0h) ? t0h : 0);
    for (const e of v.historial || []) {
      if (!e.t || e.t < desde || e.uid === yo) continue;
      if (!avisable(e.txt)) continue;
      out.push({ ...base, t: e.t, por: e.por || "Alguien", txt: e.txt || "Modificó el vehículo" });
    }
    // Fotos que subió otro: una línea por persona y por tanda (10 min)
    const tandas = new Map();
    for (const f of v.fotos || []) {
      const t = f.at || 0; if (!t || t < desde || f.by === yo || (tc && t - tc < MIN_CARGA)) continue;
      const quien = f.byName || f.by || f.byWhatsApp || "?", k = quien + "|" + Math.floor(t / 600_000);
      const x = tandas.get(k) || { ...base, t: 0, t0: Infinity, por: f.byName || "Alguien", n: 0, video: 0 };
      x.t = Math.max(x.t, t); x.n++; if (f.tipo === "video") x.video++;
      if (t < x.t0) { x.t0 = t; x.foto = f.url; }   // al tocar, abre la primera foto de esa tanda
      tandas.set(k, x);
    }
    for (const x of tandas.values()) out.push({ ...x, txt: `Subió ${x.n} ${x.video === x.n ? (x.n === 1 ? "video" : "videos") : x.n === 1 ? "foto" : "fotos"}` });
    // Desmontaje: fotos y notas que cargó otro (una línea por persona y tanda)
    const desm = new Map();
    for (const f of [...(v.desFotos || []).map(x => ({ ...x, foto: 1 })), ...(v.desNotas || []).map(x => ({ ...x, nota: 1 }))]) {
      const t = f.t || 0; if (!t || t < desde || f.uid === yo) continue;
      const k = (f.uid || f.por) + "|" + Math.floor(t / 600_000);
      const x = desm.get(k) || { ...base, t: 0, por: f.por || "Alguien", fotos: 0, notas: 0 };
      x.t = Math.max(x.t, t); x.fotos += f.foto || 0; x.notas += f.nota || 0;
      if (f.foto && f.url && (!x.t0 || t < x.t0)) { x.t0 = t; x.foto = f.url; x.desm = true; }
      desm.set(k, x);
    }
    for (const x of desm.values()) out.push({ ...x, txt: "Cargó desmontaje: " + [x.fotos && `${x.fotos} ${x.fotos === 1 ? "foto" : "fotos"}`, x.notas && `${x.notas} ${x.notas === 1 ? "nota" : "notas"}`].filter(Boolean).join(" y ") });
  }
  return out.sort((a, b) => b.t - a.t).slice(0, MAX);
}
export const cuantasNuevas = () => { const v = visto(); return listaNotifs().filter(n => n.t > v).length; };

// Campanita: el puntito (con la cantidad) se actualiza solo cuando cambian los vehículos
export function pintarCampana() {
  const b = $("#tb-notif"); if (!b) return;
  const n = cuantasNuevas(), p = $(".notif-dot", b);
  if (p) { p.hidden = !n; p.textContent = n > 9 ? "9+" : n || ""; }
  b.setAttribute("aria-label", n ? `Notificaciones: ${n} nuevas` : "Notificaciones");
}
// Sonido: cuando llega una nueva estando en la app, y una vez al entrar si hay sin ver
let antes = null, cidAntes = null;
function revisarSonido() {
  if (!S.user || S.invitado || S.loadingVehicles || !S.company) return;
  const n = cuantasNuevas();
  if (cidAntes !== S.company.id) { cidAntes = S.company.id; if (antes === null && n > 0) sonidoNotif(); antes = n; return; }
  if (antes !== null && n > antes) sonidoNotif();
  antes = n;
}
onChange(e => { if (e === "vehicles" || e === "companies" || e === "perfil") { pintarCampana(); if (e === "vehicles") revisarSonido(); } });

const cuando = t => {
  const d = Date.now() - t, min = Math.round(d / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
  return new Date(t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const minus = t => t.charAt(0).toLowerCase() + t.slice(1);
export function abrirNotifs() {
  const lista = listaNotifs(), v0 = visto();
  const nuevas = lista.filter(n => n.t > v0).length;
  const s = openSheet({ title: "Notificaciones", body: lista.length
    ? `<p class="muted small notif-sub">${nuevas ? `${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"} · ` : ""}Cambios de los últimos ${DIAS} días hechos por otros</p>
      <ul class="notif-list">${lista.map(n => `<li><a href="#/v/${esc(n.vid)}" class="notif-item ${n.t > v0 ? "nueva" : ""}" ${n.foto ? `data-foto-url="${esc(n.foto)}" ${n.desm ? "data-desm" : ""}` : ""}>
        <span class="notif-veh">${plate(n.patente, "sm")}<small>${esc(n.modelo || "")}</small></span>
        <span class="notif-txt"><b>${esc(n.por)}</b> ${esc(minus(String(n.txt).replace(/ por WhatsApp/g, "")))}</span>
        <time>${cuando(n.t)}</time></a></li>`).join("")}</ul>`
    : `<div class="empty small">${icon("bell")}<p>No hay cambios nuevos de otros en los últimos ${DIAS} días.</p></div>` });
  s.el.addEventListener("click", e => { const a = e.target.closest(".notif-item"); if (a) { e.preventDefault(); s.close();
    // Notificación de fotos: el vehículo se abre directo en esa foto
    S.abrirFoto = a.dataset.fotoUrl ? { vid: a.getAttribute("href").split("/").pop(), url: a.dataset.fotoUrl, desm: a.hasAttribute("data-desm") } : null;
    location.hash = a.getAttribute("href"); } });
  // Al abrirla queda todo visto
  const cid = S.company?.id;
  if (cid && S.user?.uid) {
    const ahora = Date.now();
    S.profile = { ...S.profile, notifVisto: { ...(S.profile?.notifVisto || {}), [cid]: ahora } };
    pintarCampana();
    updateDoc(doc(db, "users", S.user.uid), { [`notifVisto.${cid}`]: ahora }).catch(e => console.warn("notif", e));
  }
}
document.addEventListener("click", e => { if (e.target.closest("#tb-notif")) abrirNotifs(); });
