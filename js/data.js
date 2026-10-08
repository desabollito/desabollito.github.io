import {
  auth, db, google, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signOut, updateProfile,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, arrayUnion, writeBatch, deleteField
} from "./firebase.js";
import { USER_DOMAIN, BOT_API } from "./config.js";
import { hoyISO, horaAhora } from "./ui.js";
import { SECUENCIA, ESTADO, PIEZA } from "./domain.js";

// ── Estado global muy simple con suscriptores ─────────────────
export const S = {
  user: null,        // usuario de Firebase Auth
  profile: null,     // users/{uid}
  companies: [],     // empresas donde soy miembro
  company: null,     // empresa activa
  vehicles: [],      // vehículos del operativo activo (incluye papelera)
  loadingVehicles: true,
  gastos: [],        // gastos del operativo activo
  loadingGastos: true
};
const subs = new Set();
export const onChange = fn => (subs.add(fn), () => subs.delete(fn));
const emit = what => subs.forEach(fn => fn(what));

// ── Autenticación ─────────────────────────────────────────────
export const limpiarUsuario = u => (u || "").toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
const emailInterno = u => `${limpiarUsuario(u)}@${USER_DOMAIN}`;

export async function ingresar(usuario, pass) {
  await signInWithEmailAndPassword(auth, emailInterno(usuario), pass);
}

export async function crearCuenta(usuario, pass, nombre) {
  const u = limpiarUsuario(usuario);
  if (u.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres");
  const cred = await createUserWithEmailAndPassword(auth, emailInterno(u), pass);
  await updateProfile(cred.user, { displayName: nombre || u });
}

export async function ingresarConGoogle() {
  try { await signInWithPopup(auth, google); }
  catch (e) {
    // Algunos navegadores de apps (Instagram, WhatsApp) bloquean popups
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, google);
    } else throw e;
  }
}

export const salir = () => signOut(auth);

export function mensajeError(e) {
  const m = {
    "auth/invalid-credential": "Usuario o contraseña incorrectos",
    "auth/wrong-password": "Usuario o contraseña incorrectos",
    "auth/user-not-found": "Ese usuario no existe. Tocá “Crear cuenta”.",
    "auth/email-already-in-use": "Ese usuario ya existe. Elegí otro o ingresá.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
    "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos.",
    "auth/network-request-failed": "Sin conexión. Revisá internet e intentá de nuevo.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar",
    "permission-denied": "No tenés permiso para hacer eso"
  };
  return m[e?.code] || e?.message || "Ocurrió un error";
}

// ── Arranque de sesión ────────────────────────────────────────
let unsubPerfil = null;
// El perfil propio se escucha en vivo: así la app se desbloquea sola cuando aprueban la cuenta
function escucharPerfil(user) {
  unsubPerfil?.();
  unsubPerfil = onSnapshot(doc(db, "users", user.uid), snap => {
    if (S.user?.uid !== user.uid) return;
    // Cuenta pendiente cuyo perfil desapareció: el administrador la rechazó
    if (!snap.exists()) {
      if (S.profile?.aprobado === false && !snap.metadata.fromCache) { S.profile = { ...S.profile, rechazado: true }; emit("perfil"); }
      return;
    }
    const antes = S.profile?.aprobado, waAntes = S.profile?.whatsapp, d = snap.data();
    S.profile = { ...S.profile, ...d, id: user.uid };
    if (antes !== d.aprobado || waAntes !== d.whatsapp) emit("perfil");
    // Recién aprobada: recién ahí arrancan los operativos
    if (antes === false && d.aprobado === true) escucharEmpresas();
  }, e => console.warn("perfil", e));
}
export const cuentaPendiente = () => S.profile?.aprobado === false;
// Operativos a los que me agregaron y todavía no vi (se avisa con un cartel al abrir la app)
const avisados = new Set();
export function revisarAgregados() {
  const uid = S.user?.uid; if (!uid || cuentaPendiente()) return;
  const vistos = S.profile?.operativosVistos || [];
  const nuevos = S.companies.filter(c => c.memberAddedBy?.[uid] && c.ownerId !== uid && !vistos.includes(c.id) && !avisados.has(c.id));
  if (!nuevos.length) return;
  nuevos.forEach(c => avisados.add(c.id));
  emit({ tipo: "agregado", operativos: nuevos.map(c => ({ id: c.id, name: c.name, por: c.memberAddedBy[uid] })) });
}
export async function marcarOperativosVistos(ids) {
  S.profile.operativosVistos = [...new Set([...(S.profile.operativosVistos || []), ...ids])];
  await updateDoc(doc(db, "users", S.user.uid), { operativosVistos: arrayUnion(...ids) }).catch(e => console.warn("vistos", e));
}
export async function desvincularWhatsApp() {
  await updateDoc(doc(db, "users", S.user.uid), { whatsapp: deleteField() });
  delete S.profile.whatsapp; emit("profile");
}
let unsubCompanies = null, unsubVehicles = null, unsubGastos = null, ultimaFirma = "";

// ── Modo lectura por link (?ver=TOKEN): sin cuenta; los datos los da el bot, solo de una compañía ──
export async function iniciarInvitado(token, onReady) {
  const traer = async () => {
    const r = await fetch(`${BOT_API}/compartido`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || "No se pudo abrir el link");
    return j;
  };
  try {
    const j = await traer();
    S.invitado = { token, compania: j.compania, uno: j.vid || null };
    S.user = { uid: "invitado", invitado: true, getIdToken: async () => "" };
    S.profile = { id: "invitado", name: j.vid ? "Vehículo compartido" : `Perito ${j.compania}`, username: "", aprobado: true };
    S.company = { ...j.operativo, roles: {}, members: [] };
    S.companies = [S.company];
    const ordenar = vs => vs.sort((a, b) => (b.fechas?.peritado || "").localeCompare(a.fechas?.peritado || ""));
    S.vehicles = ordenar(j.vehiculos); S.loadingVehicles = false; S.gastos = []; S.loadingGastos = false;
    onReady(true);
    emit("companies"); emit("vehicles");
    // Se actualiza solo cada minuto
    let firma = JSON.stringify(j.vehiculos);
    setInterval(async () => {
      if (document.hidden) return;
      try { const n = await traer(); const f = JSON.stringify(n.vehiculos); if (f !== firma) { firma = f; S.vehicles = ordenar(n.vehiculos); emit("vehicles"); } } catch { /* sin conexión */ }
    }, 60_000);
  } catch (e) { onReady(false, e); }
}

// Administradores: crear, listar y borrar links de solo lectura
// "Vehículo en App": link de solo lectura para un único vehículo
export async function linkVehiculo(vid) {
  const idToken = await S.user.getIdToken();
  const r = await fetch(`${BOT_API}/compartir`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, cid: S.company.id, accion: "vehiculo", vid }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || "No se pudo crear el link");
  return `${location.origin}/${j.token}`;
}
export async function linksCompartidos(accion = "listar", extra = {}) {
  const idToken = await S.user.getIdToken();
  const r = await fetch(`${BOT_API}/compartir`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, cid: S.company.id, accion, ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || "No se pudo");
  return j.lista || [];
}

export function iniciarSesion(onReady) {
  onAuthStateChanged(auth, async user => {
    unsubCompanies?.(); unsubVehicles?.(); unsubGastos?.(); unsubPerfil?.(); ultimaFirma = "";
    S.user = user; S.profile = null; S.companies = []; S.company = null; S.vehicles = []; S.gastos = [];
    if (!user) { onReady(false); return; }
    try {
      await asegurarPerfil(user);
      escucharPerfil(user);
      if (S.profile?.aprobado !== false) escucharEmpresas();   // cuenta pendiente: no arranca nada hasta que la aprueben
      onReady(true);
    } catch (e) {
      console.error(e);
      onReady(true, e);
    }
  });
}

async function asegurarPerfil(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().username) { S.profile = { id: user.uid, ...snap.data() }; return; }

  const esInterno = user.email?.endsWith("@" + USER_DOMAIN);
  const base = limpiarUsuario(esInterno ? user.email.split("@")[0] : (user.email?.split("@")[0] || user.displayName || "usuario"));
  const nueva = !snap.exists();
  const username = await reservarUsuario(base, user.uid, user.displayName || base, nueva);
  const data = {
    name: user.displayName || base,
    email: user.email || "",
    username,
    ...(nueva ? { aprobado: false } : {}),
    createdAt: snap.exists() ? (snap.data().createdAt || serverTimestamp()) : serverTimestamp()
  };
  await setDoc(ref, data, { merge: true });
  S.profile = { id: user.uid, ...(snap.exists() ? snap.data() : {}), ...data };
  // Cuenta nueva: se avisa al administrador por WhatsApp para que la apruebe
  if (nueva) fetch(`${BOT_API}/registro`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: user.uid }) }).catch(e => console.warn("aviso de registro", e));
}
export function reenviarSolicitud() {
  return fetch(`${BOT_API}/registro`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: S.user.uid, reenviar: true }) });
}

async function reservarUsuario(base, uid, name, pendiente = false) {
  let cand = base.length >= 3 ? base : base + "usr";
  for (let i = 0; i < 20; i++) {
    const ref = doc(db, "usernames", cand);
    const s = await getDoc(ref);
    if (!s.exists()) { await setDoc(ref, pendiente ? { uid, name, pendiente: true } : { uid, name }); return cand; }
    if (s.data().uid === uid) return cand;
    cand = base + Math.floor(Math.random() * 900 + 100);
  }
  throw new Error("No se pudo reservar un nombre de usuario");
}

export async function cambiarUsuario(nuevo) {
  const u = limpiarUsuario(nuevo);
  if (u.length < 3) throw new Error("Mínimo 3 caracteres: letras, números, punto o guion");
  if (u === S.profile.username) return;
  const ref = doc(db, "usernames", u);
  const s = await getDoc(ref);
  if (s.exists() && s.data().uid !== S.user.uid) throw new Error("Ese usuario ya está en uso");
  await setDoc(ref, { uid: S.user.uid, name: S.profile.name });
  const viejo = S.profile.username;
  await updateDoc(doc(db, "users", S.user.uid), { username: u });
  if (viejo) await deleteDoc(doc(db, "usernames", viejo)).catch(() => {});
  S.profile.username = u;
  emit("profile");
}

export async function cambiarNombre(nombre) {
  nombre = nombre.trim();
  if (!nombre) return;
  await updateProfile(S.user, { displayName: nombre });
  await updateDoc(doc(db, "users", S.user.uid), { name: nombre });
  if (S.profile.username) await setDoc(doc(db, "usernames", S.profile.username), { uid: S.user.uid, name: nombre }, { merge: true });
  S.profile.name = nombre;
  emit("profile");
}

// Edita nombre y usuario
export async function actualizarPerfil({ nombre, usuario }) {
  if (usuario && limpiarUsuario(usuario) !== S.profile.username) await cambiarUsuario(usuario);
  if (nombre && nombre.trim() !== S.profile.name) await cambiarNombre(nombre);
  emit("profile");
}

// Cada miembro deja su @usuario en el operativo (para mostrar "cargado por @usuario")
const usuarioSincronizado = new Set();
async function sincronizarUsuario() {
  const uid = S.user?.uid, u = S.profile?.username;
  if (!uid || !u) return;
  for (const c of S.companies) {
    if (c.memberUsers?.[uid] === u || usuarioSincronizado.has(c.id)) continue;
    usuarioSincronizado.add(c.id);
    await updateDoc(doc(db, "companies", c.id), { [`memberUsers.${uid}`]: u }).catch(e => console.warn("usuario en operativo", e));
  }
}

// ── Empresas ──────────────────────────────────────────────────
function escucharEmpresas() {
  const q = query(collection(db, "companies"), where("members", "array-contains", S.user.uid));
  let creando = false;
  unsubCompanies = onSnapshot(q, { includeMetadataChanges: true }, async snap => {
    S.companies = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    // Sin operativos: la app ofrece pedir unirse a uno o crear uno (ya no se crea solo)
    const sinOp = !S.companies.length && !snap.metadata.fromCache;
    if (sinOp !== !!S.sinOperativo) { S.sinOperativo = sinOp; emit("sin-operativo"); }
    if (!S.companies.length) return;
    const preferida = localStorage.getItem("empresaActiva") || S.profile?.activeCompanyId;
    const actual = S.companies.find(c => c.id === (S.company?.id || preferida)) || S.companies[0] || null;
    const cambio = actual?.id !== S.company?.id;
    S.company = actual;
    // Solo avisar si algo cambió de verdad (evita repintar por metadatos)
    const firma = JSON.stringify(S.companies.map(c => [c.id, c.name, c.members, c.roles, c.memberNames, c.memberTags, c.seal?.texto, c.seal?.color, c.seal?.colorPanos, c.seal?.colorTitulos, c.seal?.colorPuntos, c.seal?.diseno, JSON.stringify(c.seal?.tam || null), (c.seal?.logo || "").length]));
    if (firma === ultimaFirma && !cambio) return;
    ultimaFirma = firma;
    emit("companies");
    sincronizarUsuario(); revisarAgregados();
    escucharConfig();
    if (!unsubPedidos && S.companies.some(c => ["owner", "admin"].includes(c.roles?.[S.user.uid]))) escucharPedidosParaMi();
    if (cambio) { escucharVehiculos(); escucharGastos(); }
    escucharSolicitudes();
  }, e => { console.error(e); if (e?.code !== "permission-denied") emit("error"); });
}

export function elegirEmpresa(id) {
  const c = S.companies.find(x => x.id === id);
  if (!c || c.id === S.company?.id) return;
  S.company = c;
  localStorage.setItem("empresaActiva", id);
  // El bot de WhatsApp también usa este operativo para los vehículos nuevos (el último elegido, en la app o en el bot)
  updateDoc(doc(db, "users", S.user.uid), { activeCompanyId: id, activeCompanyAt: Date.now() }).catch(() => {});
  emit("companies");
  escucharVehiculos();
  escucharGastos();
  escucharSolicitudes();
}

export async function crearEmpresa(nombre) {
  const uid = S.user.uid, name = S.profile?.name || "Yo";
  const ref = await addDoc(collection(db, "companies"), {
    name: nombre.trim(),
    ownerId: uid,
    members: [uid],
    roles: { [uid]: "owner" },
    memberNames: { [uid]: name },
    memberUsers: { [uid]: S.profile?.username || "" },
    memberTags: {},
    seal: { texto: "", logo: "" },
    createdAt: serverTimestamp()
  });
  localStorage.setItem("empresaActiva", ref.id);
  return ref.id;
}

export const miRol = () => S.invitado ? "lectura" : (S.company?.roles?.[S.user?.uid] || "tecnico");
// Link de solo lectura (perito de una compañía): ve, no toca nada
export const soyLector = () => !!S.invitado;
export const soyAdmin = () => ["owner", "admin"].includes(miRol());
export const soyDesmontaje = () => miRol() === "desmontaje";
// Solo tiene el rol Desmontaje (en todos sus operativos): no puede crear operativos
export const soloDesmontaje = () => S.companies?.length > 0 && S.companies.every(c => c.roles?.[S.user?.uid] === "desmontaje");

export async function renombrarEmpresa(nombre) {
  await updateDoc(doc(db, "companies", S.company.id), { name: nombre.trim() });
}

export async function guardarSello(sello) {
  await updateDoc(doc(db, "companies", S.company.id), { seal: sello });
}

export async function agregarMiembro(usuario, rol = "tecnico", empresa = S.company) {
  const u = limpiarUsuario(usuario);
  const s = await getDoc(doc(db, "usernames", u));
  if (!s.exists()) throw new Error(`No existe el usuario “${u}”. Pedile que entre a la app una vez y te pase su usuario.`);
  const { uid, name, pendiente } = s.data();
  if (pendiente) throw new Error(`La cuenta “${u}” todavía no fue aprobada.`);
  if (empresa.members.includes(uid)) throw new Error("Ya es parte del operativo");
  await updateDoc(doc(db, "companies", empresa.id), {
    members: arrayUnion(uid),
    [`roles.${uid}`]: rol,
    [`memberNames.${uid}`]: name || u,
    [`memberUsers.${uid}`]: u,
    [`memberAddedBy.${uid}`]: { por: S.profile?.name || "", user: S.profile?.username || "", t: Date.now() }
  });
  // Aviso por WhatsApp a la persona agregada (si tiene el número vinculado)
  fetch(`${BOT_API}/agregado`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cid: empresa.id, uid }) }).catch(() => {});
  return name || u;
}

export async function cambiarRol(uid, rol) {
  await updateDoc(doc(db, "companies", S.company.id), { [`roles.${uid}`]: rol });
}

export async function quitarMiembro(uid) {
  const c = S.company;
  await updateDoc(doc(db, "companies", c.id), {
    members: c.members.filter(m => m !== uid),
    [`roles.${uid}`]: deleteField(),
    [`memberNames.${uid}`]: deleteField(),
    [`memberTags.${uid}`]: deleteField()
  });
}

// Busca un miembro del operativo por nombre o por @usuario → { uid, name } o null
export async function buscarMiembro(texto) {
  const c = S.company; if (!c) return null;
  const t = texto.trim().replace(/^@/, "");
  const porNombre = Object.entries(c.memberNames || {}).find(([, n]) => n.toLowerCase() === t.toLowerCase());
  if (porNombre) return { uid: porNombre[0], name: porNombre[1] };
  const u = limpiarUsuario(t);
  if (u.length < 3) return null;
  const s = await getDoc(doc(db, "usernames", u));
  if (s.exists() && c.members.includes(s.data().uid)) return { uid: s.data().uid, name: c.memberNames?.[s.data().uid] || s.data().name };
  return null;
}

// Etiquetas de cada miembro (Sacabollos, Desmontador, Gestión…)
export async function guardarEtiquetas(uid, etiquetas) {
  const limpias = [...new Set(etiquetas.map(e => e.trim()).filter(Boolean))].slice(0, 6);
  await updateDoc(doc(db, "companies", S.company.id), { [`memberTags.${uid}`]: limpias });
}

export async function salirDeEmpresa() {
  await quitarMiembro(S.user.uid);
  localStorage.removeItem("empresaActiva");
}

export async function eliminarEmpresa() {
  const cid = S.company.id;
  for (const sub of ["vehicles", "gastos"]) {
    const snap = await getDocs(collection(db, "companies", cid, sub));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  await deleteDoc(doc(db, "companies", cid));
  localStorage.removeItem("empresaActiva");
}

// ── Vehículos ─────────────────────────────────────────────────
const colVehiculos = (cid = S.company?.id) => collection(db, "companies", cid, "vehicles");

const reintentos = { v: 0, g: 0 };
function escucharVehiculos() {
  unsubVehicles?.();
  S.vehicles = []; S.loadingVehicles = true;
  emit("vehicles");
  if (!S.company) return;
  unsubVehicles = onSnapshot(colVehiculos(), { includeMetadataChanges: true }, snap => {
    S.vehicles = snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }));
    S.vehicles.sort((a, b) => (b.fechas?.peritado || "").localeCompare(a.fechas?.peritado || "")
      || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    S.loadingVehicles = false; reintentos.v = 0;
    emit("vehicles");
  }, e => {
    console.warn("vehículos", e); S.loadingVehicles = false;
    // Permiso denegado suele ser una carrera (operativo recién creado o cambio de operativo): se reintenta en silencio
    if (e?.code === "permission-denied" && reintentos.v++ < 3) setTimeout(() => { if (S.company) escucharVehiculos(); }, 2000);
    else if (e?.code !== "permission-denied") emit("error");
  });
}

export const activos = () => S.vehicles.filter(v => !v.deleted);
// Papelera personal: los vehículos que borré yo
export const papelera = () => S.vehicles.filter(v => v.deleted && (v.deletedBy ? v.deletedBy === S.user.uid : v.createdBy === S.user.uid));
export const getVehiculo = id => S.vehicles.find(v => v.id === id);

export function nuevoIdVehiculo() {
  return doc(colVehiculos()).id;
}

// ── Historial de cambios de cada vehículo ─────────────────────
const entrada = (txt, antes) => ({ t: Date.now(), uid: S.user.uid, por: S.profile?.name || "", txt, ...(antes ? { antes } : {}) });

// ── Deshacer: cada cambio guarda cómo estaban los campos antes (no fotos ni documentos) ──
const SIN_DESHACER = new Set(["fotos", "archivos", "firma", "historial", "updatedAt", "updatedBy", "deleted", "deletedAt", "deletedBy", "avisoReparado"]);
const valorEn = (obj, ruta) => ruta.split(".").reduce((o, k) => o?.[k], obj);
function antesDe(v, campos) {
  if (!v) return null;
  const out = {};
  for (const k of Object.keys(campos)) {
    if (SIN_DESHACER.has(k.split(".")[0])) continue;
    const val = valorEn(v, k);
    out[k.replace(/\./g, "|")] = val === undefined ? null : JSON.parse(JSON.stringify(val));
  }
  return Object.keys(out).length ? out : null;
}
// El último cambio que se puede deshacer (que no se haya deshecho ya)
export function ultimoDeshacible(v) {
  const h = v?.historial || [], hechos = new Set(h.filter(e => e.deshace).map(e => e.deshace));
  return [...h].sort((a, b) => (b.t || 0) - (a.t || 0)).find(e => e.antes && !e.deshace && !hechos.has(e.t)) || null;
}
export async function deshacerCambio(v, e) {
  const campos = {};
  for (const [k, val] of Object.entries(e.antes || {})) campos[k.replace(/\|/g, ".")] = val === null ? deleteField() : val;
  await updateDoc(doc(colVehiculos(), v.id), { ...campos,
    historial: arrayUnion({ ...entrada(`Deshizo: ${e.txt}`), deshace: e.t }), updatedAt: serverTimestamp(), updatedBy: S.user.uid });
}
const plata = n => "$" + Number(n || 0).toLocaleString("es-AR");
const CAMPOS_HIST = { modelo: "el modelo", patente: "la patente", asegurado: "el asegurado", telefono: "el teléfono",
  compania: "la compañía", localidad: "la localidad", observaciones: "las observaciones", repuestos: "los repuestos", pintura: "la pintura" };
function cambiosDe(viejo, nuevo) {
  if (!viejo) return [];
  const out = [];
  for (const [k, nombre] of Object.entries(CAMPOS_HIST)) {
    if (k in nuevo && String(nuevo[k] ?? "") !== String(viejo[k] ?? "")) {
      const largo = k === "observaciones" || k === "repuestos";
      out.push(largo || !nuevo[k] ? `Cambió ${nombre}` : `Cambió ${nombre} a “${nuevo[k]}”`);
    }
  }
  if ("precio" in nuevo && Number(nuevo.precio || 0) !== Number(viejo.precio || 0))
    out.push(`Cambió el precio de ${plata(viejo.precio)} a ${plata(nuevo.precio)}`);
  if ("grado" in nuevo && (nuevo.grado || null) !== (viejo.grado || null))
    out.push(nuevo.grado ? `Puso grado ${nuevo.grado}` : "Quitó el grado");
  if ("piezas" in nuevo) {
    const a = viejo.piezas || {}, b = nuevo.piezas || {};
    const mas = Object.keys(b).filter(k => b[k] && !a[k]).map(k => PIEZA[k]?.label || k);
    const menos = Object.keys(a).filter(k => a[k] && !b[k]).map(k => PIEZA[k]?.label || k);
    if (mas.length) out.push(`Marcó ${mas.join(", ")}`);
    if (menos.length) out.push(`Desmarcó ${menos.join(", ")}`);
  }
  if ("fotos" in nuevo && (nuevo.fotos?.length || 0) > (viejo.fotos?.length || 0)) {
    const n = nuevo.fotos.length - (viejo.fotos?.length || 0);
    out.push(`Agregó ${n} ${n === 1 ? "foto" : "fotos"}`);
  }
  return out;
}

export async function guardarVehiculo(id, data, esNuevo) {
  const ref = doc(colVehiculos(), id);
  const base = { ...data, updatedAt: serverTimestamp(), updatedBy: S.user.uid };
  if (esNuevo) base.historial = [entrada("Cargó el vehículo")];
  else {
    const viejo = getVehiculo(id), cambios = cambiosDe(viejo, data);
    if (cambios.length) {
      // El deshacer de una edición revierte todo lo que se cambió al guardar
      const cambiados = Object.fromEntries(Object.keys(data).filter(k => JSON.stringify(data[k] ?? null) !== JSON.stringify(viejo?.[k] ?? null)).map(k => [k, 1]));
      base.historial = arrayUnion(entrada(cambios.join(" · "), antesDe(viejo, cambiados)));
    }
  }
  if (esNuevo) {
    // setDoc sin await de red: con caché offline se guarda al instante
    await setDoc(ref, {
      ...base,
      estado: data.estado || "peritado",
      fechas: data.fechas || { peritado: hoyISO() },
      horas: data.horas || { peritado: horaAhora() },
      fotos: data.fotos || [],
      archivos: data.archivos || [],
      deleted: false,
      createdAt: serverTimestamp(),
      createdBy: S.user.uid,
      createdByName: S.profile?.name || "",
      createdByUser: S.profile?.username || ""
    });
  } else {
    await updateDoc(ref, base);
  }
}

export async function actualizarVehiculo(id, campos, hist) {
  const extra = hist ? { historial: arrayUnion(entrada(hist, antesDe(getVehiculo(id), campos))) } : {};
  await updateDoc(doc(colVehiculos(), id), { ...campos, ...extra, updatedAt: serverTimestamp(), updatedBy: S.user.uid });
}

export async function cambiarEstado(v, estado, fecha = hoyISO(), extra = {}) {
  const fechas = { ...(v.fechas || {}) };
  if (estado !== "anulado" && estado !== "ausente" && estado !== "enreparacion") {
    delete fechas.ausente;
    // al avanzar, completa fechas faltantes de los pasos previos
    const idx = SECUENCIA.indexOf(estado);
    SECUENCIA.forEach((e, i) => {
      if (i < idx && !fechas[e]) fechas[e] = fecha;
      if (i > idx) delete fechas[e];
    });
  }
  fechas[estado] = fecha;
  // Hora en que se marcó (solo peritado y reparado)
  const horas = { ...(v.horas || {}) };
  for (const k of Object.keys(horas)) if (!fechas[k]) delete horas[k];
  if (estado === "peritado" || estado === "reparado") horas[estado] = horaAhora();
  const [a, m, d] = String(fecha).split("-");
  await actualizarVehiculo(v.id, { estado, fechas, horas, ...extra }, `Pasó a ${ESTADO[estado]?.label || estado}${d ? ` (${d}/${m}/${a})` : ""}`);
}

export const moverAPapelera = id => actualizarVehiculo(id, { deleted: true, deletedAt: serverTimestamp(), deletedBy: S.user.uid }, "Lo envió a la papelera");
export const restaurar = id => actualizarVehiculo(id, { deleted: false, deletedAt: null, deletedBy: null }, "Lo restauró de la papelera");

// Quién cargó el vehículo: se muestra el @usuario (vale igual para la app y el bot)
export const esDeWhatsApp = v => String(v?.createdBy || "").startsWith("whatsapp:");
export function cargadoPor(v) {
  if (v?.createdByUser) return "@" + v.createdByUser;
  const uid = v?.createdByUid || v?.createdBy;
  const miembro = S.company?.memberUsers?.[uid];
  if (miembro) return "@" + miembro;
  return String(v?.createdByName || "").replace(/\s*\(WhatsApp\)\s*$/, "") || "otra persona";
}
// Permisos sobre un vehículo: quien lo cargó, los administradores y a quienes se les dio acceso
export const esMioV = v => !!v && (v.createdBy === S.user?.uid || v.createdByUid === S.user?.uid);
export const puedoEditar = v => !soyDesmontaje() && !S.invitado && (esMioV(v) || soyAdmin() || (v?.editores || []).includes(S.user?.uid));

// ── Desmontaje: fotos y notas (cada una con quién la subió) y el técnico desmontador ──
export async function agregarDesmontaje(v, fotos, texto) {
  const lote = `${Date.now()}-${S.user.uid.slice(0, 6)}`, t = Date.now(), quien = { uid: S.user.uid, por: S.profile?.name || "" };
  const campos = {};
  if (fotos.length) campos.desFotos = arrayUnion(...fotos.map(f => ({ ...f, lote, t, ...quien })));
  if (texto) campos.desNotas = arrayUnion({ lote, t, texto, ...quien });
  if (!fotos.length && !texto) return;
  const txt = [fotos.length ? `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}` : "", texto ? "una nota" : ""].filter(Boolean).join(" y ");
  await updateDoc(doc(colVehiculos(), v.id), { ...campos, historial: arrayUnion(entrada(`Cargó desmontaje: ${txt}`)), updatedAt: serverTimestamp(), updatedBy: S.user.uid });
}
export async function elegirDesmontador(v, m) {
  await updateDoc(doc(colVehiculos(), v.id), { desmontador: m ? { uid: m.uid || "", nombre: m.nombre } : null,
    historial: arrayUnion(entrada(m ? `Desmontó: ${m.nombre}` : "Quitó el desmontador")), updatedAt: serverTimestamp(), updatedBy: S.user.uid });
}

// ── Solicitudes (las aprueban los administradores): eliminar el vehículo, quitar una foto o
//    un documento, o acceso para editar un vehículo de otro
const colSolicitudes = () => collection(db, "companies", S.company.id, "solicitudes");
let unsubSolicitudes = null, unsubMias = null;
S.solicitudes = []; S.misSolicitudes = [];
export function escucharSolicitudes() {
  unsubSolicitudes?.(); unsubMias?.(); S.solicitudes = []; S.misSolicitudes = [];
  if (!S.company) return;
  if (soyAdmin()) {
    unsubSolicitudes = onSnapshot(colSolicitudes(), snap => {
      S.solicitudes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      emit("solicitudes");
    }, e => console.warn("solicitudes", e));
  } else {
    unsubMias = onSnapshot(query(colSolicitudes(), where("pedidoPor", "==", S.user.uid)), snap => {
      S.misSolicitudes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, e => console.warn("mis solicitudes", e));
  }
}
export const yaPedi = (tipo, vid) => S.misSolicitudes.some(x => x.tipo === tipo && x.vid === vid);
export async function crearSolicitud(v, tipo, item = null) {
  const id = tipo === "eliminar" ? v.id : `${tipo}_${v.id}_${tipo === "editar" ? S.user.uid : Date.now()}`;
  await setDoc(doc(colSolicitudes(), id), {
    tipo, vid: v.id, patente: v.patente || "", modelo: v.modelo || "", cargadoPor: cargadoPor(v),
    ...(item ? { item: { url: item.url || "", publicId: item.publicId || "", name: item.name || "" } } : {}),
    pedidoPor: S.user.uid, pedidoPorNombre: S.profile?.name || "", pedidoPorUser: S.profile?.username || "",
    createdAt: serverTimestamp()
  });
  // Aviso por WhatsApp al administrador de Desabollito
  fetch(`${BOT_API}/solicitud`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cid: S.company.id, sid: id }) }).catch(() => {});
}
export const solicitarEliminacion = v => crearSolicitud(v, "eliminar");
export async function resolverSolicitud(sol, aprobar) {
  if (aprobar) {
    const v = getVehiculo(sol.vid);
    const quien = sol.pedidoPorUser ? "@" + sol.pedidoPorUser : sol.pedidoPorNombre || "otro usuario";
    if (sol.tipo === "editar") await actualizarVehiculo(sol.vid, { editores: arrayUnion(sol.pedidoPor) }, `Le dio acceso de edición a ${quien}`);
    else if (sol.tipo === "foto" || sol.tipo === "documento") {
      const campo = sol.tipo === "foto" ? "fotos" : "archivos";
      const lista = (v?.[campo] || []).filter(x => !(x.url === sol.item?.url && (x.publicId || "") === (sol.item?.publicId || "")));
      await actualizarVehiculo(sol.vid, { [campo]: lista }, sol.tipo === "foto" ? `Quitó una foto (pedido de ${quien})` : `Quitó el documento “${sol.item?.name || ""}” (pedido de ${quien})`);
      borrarMedia(sol.vid, [sol.item]);
    } else await moverAPapelera(sol.vid);
  }
  await deleteDoc(doc(colSolicitudes(), sol.id));
}
// Fotos o documentos quitados de un vehículo: el bot los borra de Cloudinary
export async function borrarMedia(vid, items) {
  const lista = (items || []).filter(x => x?.publicId).map(x => ({ publicId: x.publicId, url: x.url || "", ...(x.tipo ? { tipo: x.tipo } : {}) }));
  if (!lista.length) return;
  try {
    const idToken = await S.user.getIdToken();
    await fetch(`${BOT_API}/borrar-media`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, cid: S.company.id, vid, items: lista }) });
  } catch { /* sin conexión: quedan en Cloudinary */ }
}
// Eliminar para siempre: el bot borra el vehículo y sus fotos de Cloudinary
export async function eliminarDefinitivo(id) {
  const idToken = await S.user.getIdToken();
  const r = await fetch(`${BOT_API}/eliminar-vehiculo`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, cid: S.company.id, vid: id }) }).catch(() => null);
  const j = await r?.json().catch(() => ({}));
  if (!j?.ok) throw new Error(j?.error || "No se pudo eliminar. Probá de nuevo.");
}

// ── Gastos ────────────────────────────────────────────────────
const colGastos = () => collection(db, "companies", S.company.id, "gastos");

function escucharGastos() {
  unsubGastos?.();
  S.gastos = []; S.loadingGastos = true;
  if (!S.company) return;
  unsubGastos = onSnapshot(colGastos(), { includeMetadataChanges: true }, snap => {
    S.gastos = snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }))
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    S.loadingGastos = false; reintentos.g = 0;
    emit("gastos");
  }, e => {
    console.warn("gastos", e); S.loadingGastos = false;
    if (e?.code === "permission-denied" && reintentos.g++ < 3) setTimeout(() => { if (S.company) escucharGastos(); }, 2000);
    else if (e?.code !== "permission-denied") emit("error");
  });
}

export async function guardarGasto(id, data) {
  if (id) {
    await updateDoc(doc(colGastos(), id), { ...data, updatedAt: serverTimestamp(), updatedBy: S.user.uid });
  } else {
    await setDoc(doc(colGastos()), {
      ...data, createdAt: serverTimestamp(), createdBy: S.user.uid, createdByName: S.profile?.name || ""
    });
  }
}

export const borrarGasto = id => deleteDoc(doc(colGastos(), id));

// ── Panel del creador (@gzmatte): todos los operativos y usuarios ─────
export const soyCreador = () => S.profile?.username === "gzmatte";
export async function llamarAdmin(ruta, datos = {}) {
  const idToken = await S.user.getIdToken();
  const r = await fetch(`${BOT_API}/admin/${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...datos }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || "No se pudo completar");
  return j;
}

// ── Pedidos para unirse a un operativo ─────────────────────────
// Quien no tiene operativo elige a un administrador (por su @usuario) y le pide que lo sume.
export async function pedirUnion(usuarioAdmin) {
  const u = limpiarUsuario(usuarioAdmin);
  if (!u) throw new Error("Escribí el usuario del administrador");
  if (u === S.profile?.username) throw new Error("Ese es tu propio usuario");
  const s = await getDoc(doc(db, "usernames", u));
  if (!s.exists()) throw new Error(`No existe el usuario “${u}”`);
  await setDoc(doc(db, "pedidosUnion", S.user.uid), {
    uid: S.user.uid, name: S.profile?.name || "", username: S.profile?.username || "",
    para: s.data().uid, paraUser: u, paraName: s.data().name || "", t: Date.now(),
    rol: soloDesmontaje() ? "desmontaje" : "tecnico"   // sugerencia para quien lo suma
  });
  fetch(`${BOT_API}/pedido-union`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: S.user.uid }) }).catch(() => {});
}
export const cancelarPedidoUnion = () => deleteDoc(doc(db, "pedidosUnion", S.user.uid));
export function escucharMiPedido(cb) {
  return onSnapshot(doc(db, "pedidosUnion", S.user.uid), d => cb(d.exists() ? d.data() : null), () => cb(null));
}
// Pedidos que me hicieron a mí (para sumarlos a alguno de mis operativos)
let unsubPedidos = null;
export function escucharPedidosParaMi() {
  unsubPedidos?.();
  unsubPedidos = onSnapshot(query(collection(db, "pedidosUnion"), where("para", "==", S.user.uid)), snap => {
    S.pedidosUnion = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit({ tipo: "pedidos-union" });
  }, e => console.warn("pedidos", e));
}
export async function responderPedidoUnion(p, cid, rol = "tecnico") {
  if (cid) {
    const c = S.companies.find(x => x.id === cid);
    await agregarMiembro(p.username, rol, c);
  }
  await deleteDoc(doc(db, "pedidosUnion", p.id));
}

// ── Configuración general de la app (config/app) ─────────────────
S.config = { avisoReparado: true, documentos: true, mensajeWa: "" };
let unsubConfig = null;
export function escucharConfig() {
  if (unsubConfig) return;
  unsubConfig = onSnapshot(doc(db, "config", "app"), d => {
    const antes = JSON.stringify(S.config);
    S.config = { avisoReparado: d.data()?.avisoReparado !== false, documentos: d.data()?.documentos !== false, mensajeWa: d.data()?.mensajeWa || "" };
    if (JSON.stringify(S.config) !== antes) emit("config");
  },
    () => { unsubConfig = null; });
}

// Etiquetas de gastos propias del operativo (cualquier miembro puede crearlas)
export async function guardarEtiquetasGasto(lista) {
  await updateDoc(doc(db, "companies", S.company.id), { gastoCats: lista });
  S.company.gastoCats = lista;
}

// ── Planilla de asegurados (patente → nombre), la carga el creador desde su panel ──
export async function aseguradoDePadron(patente) {
  const p = String(patente || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) return null;
  const d = await getDoc(doc(db, "padron", p)).catch(() => null);
  return d?.exists() ? d.data().nombre : null;
}
