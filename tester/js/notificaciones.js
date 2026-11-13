// ═════════════════════════════════════════════════════════════
//  NOTIFICACIONES: cambios que hicieron otros en los vehículos del operativo
//  Salen del historial de cada vehículo (y de las fotos y vehículos nuevos, que no siempre
//  dejan historial). Lo último visto se guarda en el perfil (users/{uid}.notifVisto[cid]),
//  así el puntito se apaga en todos los equipos.
// ═════════════════════════════════════════════════════════════
import { db, doc, updateDoc } from "./firebase.js";
import { S, activos, onChange, chatsSinLeer, chatSinLeer, usaClientes, getVehiculo } from "./data.js";
import { estadoActual } from "./domain.js";
import { $, esc, icon, openSheet, plate } from "./ui.js";
import { sonidoNotif } from "./sonidos.js";

const DIAS = 30, MAX = 150;
const ms = t => typeof t === "number" ? t : t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0);
const visto = () => {
  const v = S.profile?.notifVisto?.[S.company?.id];
  return typeof v === "number" ? v : Date.now() - 24 * 3600_000;   // la primera vez: lo de las últimas 24 h
};

// Solo se avisan cambios a los datos del vehículo y fotos nuevas: no la carga, ni los estados,
// ni las etapas de repuestos y pintura (Pedido, Recibido, Pintado…)
const ETAPAS_TXT = /: (Sin cargar|Sin pedir|Pedido|Recibido|Colocado|Sin pintar|Turnado|Pintado)$/;
const avisable = txt => !!txt && !/^(Pasó a|Volvió a|Carg[óo] el veh|Mensaje al cliente)/.test(txt) && !ETAPAS_TXT.test(txt);
const MIN_CARGA = 30 * 60_000;   // fotos de los primeros 30 min = las de la carga, no se avisan
// Se recalcula solo cuando llega otra lista de vehículos (cada cambio pedía la lista 2 o 3 veces seguidas)
let memo = { vs: null, uid: null, t: 0, lista: [] };
export function listaNotifs() {
  if (memo.vs !== S.vehicles || memo.uid !== S.user?.uid || Date.now() - memo.t > 60_000) memo = { vs: S.vehicles, uid: S.user?.uid, t: Date.now(), lista: calcularNotifs() };
  return memo.lista;
}
function calcularNotifs() {
  const yo = S.user?.uid, desde = Date.now() - DIAS * 86400_000, out = [];
  if (!yo || S.invitado) return out;
  for (const v of activos()) {
    const base = { vid: v.id, patente: v.patente, modelo: v.modelo };
    const t0h = Math.min(...(v.historial || []).map(e => e.t || Infinity)), tc = ms(v.createdAt) || (Number.isFinite(t0h) ? t0h : 0);
    for (const e of v.historial || []) {
      if (!e.t || e.t < desde || e.uid === yo) continue;
      if (!avisable(e.txt)) continue;
      out.push(/^Le avisó al cliente/.test(e.txt || "") ? { ...base, t: e.t, por: "", txt: "Cliente contactado" } : { ...base, t: e.t, por: e.por || "Alguien", txt: e.txt || "Modificó el vehículo" });
    }
    // Fotos que subió otro: una línea por persona y por tanda (10 min)
    const tandas = new Map();
    for (const f of v.fotos || []) {
      const t = f.at || 0; if (!t || t < desde || f.by === yo || (tc && t - tc < MIN_CARGA)) continue;
      const quien = f.byName || f.by || f.byWhatsApp || "?", k = quien + "|" + Math.floor(t / 600_000);
      const x = tandas.get(k) || { ...base, t: 0, t0: Infinity, por: f.byName || S.company?.memberNames?.[f.by] || "Alguien", n: 0, video: 0 };
      x.t = Math.max(x.t, t); x.n++; if (f.tipo === "video") x.video++;
      if (t < x.t0) { x.t0 = t; x.foto = f.url; }   // al tocar, abre la primera foto de esa tanda
      tandas.set(k, x);
    }
    for (const x of tandas.values()) out.push({ ...x, txt: `Subió ${x.n} ${x.video === x.n ? (x.n === 1 ? "video" : "videos") : x.n === 1 ? "foto" : "fotos"}` });
    // Documentos que agregó otro (los viejos sin autor no se avisan)
    const docs = new Map();
    for (const d of v.archivos || []) {
      const t = d.at || 0; if (!t || t < desde || (!d.by && !d.byWhatsApp) || d.by === yo) continue;
      const k = (d.by || d.byWhatsApp) + "|" + Math.floor(t / 600_000);
      const x = docs.get(k) || { ...base, t: 0, por: d.byName || "Alguien", n: 0, nombre: d.name || "" };
      x.t = Math.max(x.t, t); x.n++; docs.set(k, x);
    }
    for (const x of docs.values()) out.push({ ...x, txt: x.n === 1 ? `Agregó el documento “${x.nombre || "sin nombre"}”` : `Agregó ${x.n} documentos` });
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
// Las que tocó cada uno quedan marcadas (users/{uid}.notifAbiertas[cid] = ["vid|t", …]); igual las fijadas y archivadas
const clave = n => n.vid + "|" + n.t;
const marcadas = campo => S.profile?.[campo]?.[S.company?.id] || [];
const abiertas = () => marcadas("notifAbiertas");
export const cuantasNuevas = () => { const v = visto(), ab = new Set([...abiertas(), ...marcadas("notifArchivadas")]); return listaNotifs().filter(n => n.t > v && !ab.has(clave(n))).length; };
function guardarPerfil(campo, valor) {
  const cid = S.company?.id; if (!cid || !S.user?.uid) return;
  S.profile = { ...S.profile, [campo]: { ...(S.profile?.[campo] || {}), [cid]: valor } };
  pintarCampana();
  updateDoc(doc(db, "users", S.user.uid), { [`${campo}.${cid}`]: valor }).catch(e => console.warn("notif", e));
}
// Agrega (o saca) una clave; las que ya salieron de la lista (más de DIAS días) se descartan
function marcar(campo, k, lista, sacar = false) {
  const vigentes = new Set(lista.map(clave)), s = new Set(marcadas(campo));
  sacar ? s.delete(k) : s.add(k);
  guardarPerfil(campo, [...s].filter(x => vigentes.has(x)));
}
// Chats: se fijan por teléfono; se archivan con la hora del último mensaje, así uno nuevo del cliente lo saca de archivados
const chatK = c => c.tel + "|" + c.t;
const chatArch = c => marcadas("chatArchivados").includes(chatK(c));
// Turno del vehículo del chat: "no" sin confirmar, "si" confirmado, "" si no está turnado
const turnoDe = c => { const v = getVehiculo(c.vid); return v && estadoActual(v) === "turnado" ? (v.turnoConfirmado === true ? "si" : "no") : ""; };
const chatsNuevos = () => chatsSinLeer().filter(c => !chatArch(c));
function marcarChat(campo, k, sacar) {
  const s = new Set(marcadas(campo)), ok = new Set(S.chats.flatMap(c => [c.tel, chatK(c)]));
  sacar ? s.delete(k) : s.add(k);
  guardarPerfil(campo, [...s].filter(x => ok.has(x)));
}

// Campanita: el puntito (con la cantidad) se actualiza solo cuando cambian los vehículos
export function pintarCampana() {
  const b = $("#tb-notif"); if (!b) return;
  const n = cuantasNuevas() + chatsNuevos().length, p = $(".notif-dot", b);
  if (p) { p.hidden = !n; p.textContent = n > 9 ? "9+" : n || ""; }
  b.setAttribute("aria-label", n ? `Notificaciones: ${n} nuevas` : "Notificaciones");
}
// Sonido: cuando llega una nueva estando en la app, y una vez al entrar si hay sin ver
let antes = null, cidAntes = null;
function revisarSonido() {
  if (!S.user || S.invitado || S.loadingVehicles || !S.company) return;
  const n = cuantasNuevas() + chatsNuevos().length;
  if (cidAntes !== S.company.id) { cidAntes = S.company.id; if (antes === null && n > 0) sonidoNotif(); antes = n; return; }
  if (antes !== null && n > antes) sonidoNotif();
  antes = n;
}
onChange(e => { if (e === "vehicles" || e === "companies" || e === "perfil" || e === "chats") { pintarCampana(); if (e === "vehicles" || e === "chats") revisarSonido(); } });

const cuando = t => {
  const d = Date.now() - t, min = Math.round(d / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
  return new Date(t).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const minus = t => t.charAt(0).toLowerCase() + t.slice(1);
const ICO_PIN = `<svg class="ic" viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/></svg>`;
const ICO_ARCH = `<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>`;
// Deslizar a la derecha fija arriba, a la izquierda archiva (en computadora, con los botones que aparecen al pasar el mouse)
export function abrirNotifs(verArchivadas = false, pestIni = "") {
  const s = openSheet({ title: verArchivadas ? (pestIni === "chat" ? "Chats archivados" : "Archivadas") : "Notificaciones", onClose: () => off() });
  // Pestañas (como las del check): Notificaciones | Chat en vivo; si solo hay chats nuevos, entra en Chat en vivo
  let pest = pestIni || !verArchivadas && usaClientes() && chatsNuevos().length && !cuantasNuevas() ? "chat" : "notif";
  const off = onChange(e => { if ((e === "chats" || e === "vehicles") && pest === "chat") lista = pintar(); });
  let qChat = "", fTurno = "";   // buscador y filtro de turno de Chat en vivo
  s.body.addEventListener("input", e => { if (e.target.id === "chat-q") { qChat = e.target.value; lista = pintar(); } });
  const pintar = () => {
    const lista = listaNotifs(), v0 = visto(), ab = new Set(abiertas()), fij = new Set(marcadas("notifFijadas")), arch = new Set(marcadas("notifArchivadas"));
    const vis = lista.filter(n => arch.has(clave(n)) === verArchivadas).sort((a, b) => fij.has(clave(b)) - fij.has(clave(a)));
    const nuevas = cuantasNuevas(), nArch = lista.filter(n => arch.has(clave(n))).length;
    const conChat = !verArchivadas && usaClientes(), nChat = conChat ? chatsNuevos().length : 0;
    const tabs = conChat ? `<div class="seg notif-tabs">${[["notif", "Notificaciones", nuevas], ["chat", "Chat en vivo", nChat]].map(([k, t, n]) =>
      `<button type="button" class="seg-btn ${pest === k ? "on" : ""}" data-pest="${k}">${t}${n ? `<b class="notif-tab-n">${n > 9 ? "9+" : n}</b>` : ""}</button>`).join("")}</div>` : "";
    if (pest === "chat" && (conChat || verArchivadas)) {
      const fijC = new Set(marcadas("chatFijados"));
      const q = qChat.trim().toLowerCase(), deEste = S.chats.filter(c => chatArch(c) === verArchivadas);
      const busca = c => !q || [c.patente, c.nombre, c.modelo, c.tel, c.ult].some(x => String(x || "").toLowerCase().includes(q));
      const vc = deEste.filter(c => busca(c) && (!fTurno || turnoDe(c) === fTurno)).sort((a, b) => fijC.has(b.tel) - fijC.has(a.tel)), nArchC = S.chats.filter(chatArch).length;
      // El buscador se dibuja una sola vez (si no, pierde el foco al escribir); lo de abajo se repinta
      if (!$(".chat-lista", s.body)) s.body.innerHTML = tabs + `<label class="search chat-q">${icon("search")}<input type="search" id="chat-q" placeholder="Buscar patente, cliente o mensaje" aria-label="Buscar chats" value="${esc(qChat)}"></label><div class="chat-lista"></div>`;
      else $(".notif-tabs", s.body)?.replaceWith(Object.assign(document.createElement("template"), { innerHTML: tabs }).content);
      $(".chat-lista", s.body).innerHTML = `<div class="fo-seg chat-turnos">${[["no", "Turno sin confirmar", "#e0a526"], ["si", "Turno confirmado", "#22b07d"]].map(([k, t, col]) =>
        `<button type="button" class="fo-op ${fTurno === k ? "on" : ""}" data-turno="${k}" aria-pressed="${fTurno === k}" style="--c:${col}"><span class="fo-txt">${t}</span><b>${deEste.filter(c => busca(c) && turnoDe(c) === k).length}</b></button>`).join("")}</div>`
        + (vc.length ? `${verArchivadas ? `<p class="muted small notif-sub">Deslizá a la izquierda para sacarlo de archivados</p>` : ""}
        <ul class="notif-list">${vc.map(c => `<li class="notif-li"><i class="notif-lado l-fijar">${ICO_PIN}</i><i class="notif-lado l-arch">${ICO_ARCH}</i><a href="#" data-chat="${esc(c.tel)}" data-k="${esc(c.tel)}" data-ka="${esc(chatK(c))}" class="notif-item ${chatSinLeer(c) ? "nueva" : ""} ${fijC.has(c.tel) ? "fijada" : ""}">
        <span class="notif-veh">${fijC.has(c.tel) ? `<i class="notif-pin">${ICO_PIN}</i>` : ""}${plate(c.patente, "sm")}<small>${esc(c.nombre || c.modelo || "")}</small></span>
        <span class="notif-txt">${c.ultYo ? "Vos: " : ""}${esc(c.ult || "")}</span><time>${cuando(c.t)}</time>
        <span class="notif-acc">${verArchivadas ? "" : `<button type="button" class="icon-btn sm" data-acc="fijar" aria-label="${fijC.has(c.tel) ? "Desfijar" : "Fijar arriba"}">${ICO_PIN}</button>`}<button type="button" class="icon-btn sm" data-acc="archivar" aria-label="${verArchivadas ? "Sacar de archivados" : "Archivar"}">${ICO_ARCH}</button></span></a></li>`).join("")}</ul>`
        : `<div class="empty small">${icon("chat")}<p>${q || fTurno ? "Ningún chat coincide." : verArchivadas ? "No hay chats archivados." : "Todavía no hay chats. Aparecen cuando le escribís a un cliente desde el número de la empresa."}</p></div>`);
      if (!verArchivadas && nArchC) $(".chat-lista", s.body).insertAdjacentHTML("beforeend", `<button type="button" class="link-btn notif-ver-arch">${ICO_ARCH}Archivados (${nArchC})</button>`);
      return lista;
    }
    s.body.innerHTML = tabs + (vis.length
      ? `${verArchivadas ? `<p class="muted small notif-sub">Deslizá a la izquierda para sacarla de archivadas</p>` : ""}
        ${nuevas && !verArchivadas ? `<button class="btn btn-ghost notif-todas" type="button">Marcar todas como vistas</button>` : ""}
        <ul class="notif-list">${vis.map(n => { const k = clave(n); return `<li class="notif-li"><i class="notif-lado l-fijar">${ICO_PIN}</i><i class="notif-lado l-arch">${ICO_ARCH}</i><a href="#/v/${esc(n.vid)}" data-k="${esc(k)}" class="notif-item ${!ab.has(k) && n.t > v0 ? "nueva" : ""} ${fij.has(k) ? "fijada" : ""}" ${n.foto ? `data-foto-url="${esc(n.foto)}" ${n.desm ? "data-desm" : ""}` : ""}>
          <span class="notif-veh">${fij.has(k) ? `<i class="notif-pin">${ICO_PIN}</i>` : ""}${plate(n.patente, "sm")}<small>${esc(n.modelo || "")}</small></span>
          <span class="notif-txt">${n.por ? `<b>${esc(n.por)}</b> ${esc(minus(String(n.txt).replace(/ por WhatsApp/g, "")))}` : esc(n.txt)}</span>
          <time>${cuando(n.t)}</time>
          <span class="notif-acc">${verArchivadas ? "" : `<button type="button" class="icon-btn sm" data-acc="fijar" aria-label="${fij.has(k) ? "Desfijar" : "Fijar arriba"}">${ICO_PIN}</button>`}<button type="button" class="icon-btn sm" data-acc="archivar" aria-label="${verArchivadas ? "Sacar de archivadas" : "Archivar"}">${ICO_ARCH}</button></span></a></li>`; }).join("")}</ul>`
      : `<div class="empty small">${icon("bell")}<p>${verArchivadas ? "No hay notificaciones archivadas." : `No hay cambios nuevos de otros en los últimos ${DIAS} días.`}</p></div>`);
    if (!verArchivadas && nArch) s.body.insertAdjacentHTML("beforeend", `<button type="button" class="link-btn notif-ver-arch">${ICO_ARCH}Archivadas (${nArch})</button>`);
    return lista;
  };
  let lista = pintar();
  const accion = (a, que) => {
    const k = a.dataset.k;
    if (a.dataset.chat) {
      if (que === "fijar") marcarChat("chatFijados", k, marcadas("chatFijados").includes(k));
      else { marcarChat("chatArchivados", a.dataset.ka, verArchivadas); marcarChat("chatFijados", k, true); }
      lista = pintar(); return;
    }
    if (que === "fijar") marcar("notifFijadas", k, lista, marcadas("notifFijadas").includes(k));
    else { marcar("notifArchivadas", k, lista, verArchivadas); marcar("notifFijadas", k, lista, true); if (!verArchivadas) marcar("notifAbiertas", k, lista); }
    lista = pintar();
  };
  s.el.addEventListener("click", e => {
    if (e.target.closest(".notif-todas")) { guardarPerfil("notifVisto", Date.now()); lista = pintar(); return; }
    if (e.target.closest(".notif-ver-arch")) { s.close(); abrirNotifs(true, pest); return; }
    const pb = e.target.closest("[data-pest]"); if (pb) { pest = pb.dataset.pest; lista = pintar(); return; }
    const tb = e.target.closest("[data-turno]"); if (tb) { fTurno = fTurno === tb.dataset.turno ? "" : tb.dataset.turno; lista = pintar(); return; }
    const ch = e.target.closest("[data-chat]");
    if (ch) {
      e.preventDefault();
      const b = e.target.closest("[data-acc]"); if (b) return accion(ch, b.dataset.acc);
      if (ch.dataset.deslizado) return delete ch.dataset.deslizado;
      s.close(); import("./views-otros.js").then(m => m.abrirChatTel(ch.dataset.chat)); return; }
    const a = e.target.closest(".notif-item"); if (!a) return;
    e.preventDefault();
    const b = e.target.closest("[data-acc]"); if (b) return accion(a, b.dataset.acc);
    if (a.dataset.deslizado) return delete a.dataset.deslizado;
    marcar("notifAbiertas", a.dataset.k, lista); s.close();
    // Notificación de fotos: el vehículo se abre directo en esa foto
    S.abrirFoto = a.dataset.fotoUrl ? { vid: a.getAttribute("href").split("/").pop(), url: a.dataset.fotoUrl, desm: a.hasAttribute("data-desm") } : null;
    location.hash = a.getAttribute("href"); });
  // Deslizar con el dedo: más de 90 px suelta la acción
  let g = null;
  s.body.addEventListener("pointerdown", e => { const a = e.target.closest(".notif-item"); g = a && e.pointerType !== "mouse" ? { a, x0: e.clientX, y0: e.clientY, dx: 0, on: false } : null; });
  s.body.addEventListener("pointermove", e => {
    if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } if (Math.abs(dx) < 14) return; g.on = true; g.a.classList.add("desliza"); }
    if (verArchivadas && dx > 0) return;
    g.dx = Math.max(-120, Math.min(120, dx));
    g.a.style.transform = `translateX(${g.dx}px)`;
    g.a.parentElement.dataset.lado = g.dx > 0 ? "fijar" : "archivar";
    g.a.parentElement.classList.toggle("armado", Math.abs(g.dx) > 90);
  });
  const fin = () => {
    if (!g) return; const x = g; g = null; if (!x.on) return;
    x.a.dataset.deslizado = "1"; x.a.classList.remove("desliza"); x.a.style.transform = "";
    if (Math.abs(x.dx) > 90) { navigator.vibrate?.(15); setTimeout(() => accion(x.a, x.dx > 0 ? "fijar" : "archivar"), 180); }
    else { x.a.parentElement.classList.remove("armado"); delete x.a.parentElement.dataset.lado; }
  };
  s.body.addEventListener("pointerup", fin); s.body.addEventListener("pointercancel", fin);
}
document.addEventListener("click", e => { if (e.target.closest("#tb-notif")) abrirNotifs(); });
