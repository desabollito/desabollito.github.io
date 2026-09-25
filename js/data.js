import {
  auth, db, google, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signOut, updateProfile,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, arrayUnion, writeBatch, deleteField
} from "./firebase.js";
import { USER_DOMAIN } from "./config.js";
import { hoyISO } from "./ui.js";
import { SECUENCIA } from "./domain.js";
import { subir, recorteCuadrado } from "./media.js";

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
let unsubCompanies = null, unsubVehicles = null, unsubGastos = null, ultimaFirma = "";

export function iniciarSesion(onReady) {
  onAuthStateChanged(auth, async user => {
    unsubCompanies?.(); unsubVehicles?.(); unsubGastos?.(); ultimaFirma = "";
    S.user = user; S.profile = null; S.companies = []; S.company = null; S.vehicles = []; S.gastos = [];
    if (!user) { onReady(false); return; }
    try {
      await asegurarPerfil(user);
      escucharEmpresas();
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
  const username = await reservarUsuario(base, user.uid, user.displayName || base);
  const data = {
    name: user.displayName || base,
    email: user.email || "",
    photoURL: user.photoURL || "",
    username,
    createdAt: snap.exists() ? (snap.data().createdAt || serverTimestamp()) : serverTimestamp()
  };
  await setDoc(ref, data, { merge: true });
  S.profile = { id: user.uid, ...(snap.exists() ? snap.data() : {}), ...data };
}

async function reservarUsuario(base, uid, name) {
  let cand = base.length >= 3 ? base : base + "usr";
  for (let i = 0; i < 20; i++) {
    const ref = doc(db, "usernames", cand);
    const s = await getDoc(ref);
    if (!s.exists()) { await setDoc(ref, { uid, name }); return cand; }
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
  if (S.profile.username) await setDoc(doc(db, "usernames", S.profile.username), { uid: S.user.uid, name: nombre });
  S.profile.name = nombre;
  emit("profile");
}

// Edita nombre, usuario y foto en un solo paso
export async function actualizarPerfil({ nombre, usuario, foto }) {
  if (usuario && limpiarUsuario(usuario) !== S.profile.username) await cambiarUsuario(usuario);
  if (nombre && nombre.trim() !== S.profile.name) await cambiarNombre(nombre);
  if (foto) {
    const blob = await recorteCuadrado(foto);
    const r = await subir(blob, `perfiles/${S.user.uid}`);
    await updateDoc(doc(db, "users", S.user.uid), { photoURL: r.url });
    await updateProfile(S.user, { photoURL: r.url }).catch(() => {});
    S.profile.photoURL = r.url;
    await sincronizarFoto(true);
  }
  emit("profile");
}

// La foto de perfil se copia en cada operativo (memberPhotos) para que la vea el equipo
const fotoSincronizada = new Set();
export async function sincronizarFoto(forzar = false) {
  const uid = S.user?.uid, url = S.profile?.photoURL || "";
  if (!uid || !url) return;
  for (const c of S.companies) {
    if (c.memberPhotos?.[uid] === url || (!forzar && fotoSincronizada.has(c.id))) continue;
    fotoSincronizada.add(c.id);
    await updateDoc(doc(db, "companies", c.id), { [`memberPhotos.${uid}`]: url }).catch(e => console.warn("foto en operativo", e));
  }
}

// ── Empresas ──────────────────────────────────────────────────
function escucharEmpresas() {
  const q = query(collection(db, "companies"), where("members", "array-contains", S.user.uid));
  let creando = false;
  unsubCompanies = onSnapshot(q, { includeMetadataChanges: true }, async snap => {
    S.companies = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    // Primera vez: se crea un taller propio para empezar a trabajar
    if (!S.companies.length && !snap.metadata.fromCache && !creando) {
      creando = true;
      await crearEmpresa(`Operativo de ${S.profile?.name || "mi equipo"}`);
      return; // el snapshot siguiente trae la empresa nueva
    }
    const preferida = localStorage.getItem("empresaActiva") || S.profile?.activeCompanyId;
    const actual = S.companies.find(c => c.id === (S.company?.id || preferida)) || S.companies[0] || null;
    const cambio = actual?.id !== S.company?.id;
    S.company = actual;
    // Solo avisar si algo cambió de verdad (evita repintar por metadatos)
    const firma = JSON.stringify(S.companies.map(c => [c.id, c.name, c.members, c.roles, c.memberNames, c.memberTags, c.memberPhotos, c.seal?.texto, (c.seal?.logo || "").length]));
    if (firma === ultimaFirma && !cambio) return;
    ultimaFirma = firma;
    emit("companies");
    sincronizarFoto();
    if (cambio) { escucharVehiculos(); escucharGastos(); }
  }, e => { console.error(e); emit("error"); });
}

export function elegirEmpresa(id) {
  const c = S.companies.find(x => x.id === id);
  if (!c || c.id === S.company?.id) return;
  S.company = c;
  localStorage.setItem("empresaActiva", id);
  updateDoc(doc(db, "users", S.user.uid), { activeCompanyId: id }).catch(() => {});
  emit("companies");
  escucharVehiculos();
  escucharGastos();
}

export async function crearEmpresa(nombre) {
  const uid = S.user.uid, name = S.profile?.name || "Yo";
  const ref = await addDoc(collection(db, "companies"), {
    name: nombre.trim(),
    ownerId: uid,
    members: [uid],
    roles: { [uid]: "owner" },
    memberNames: { [uid]: name },
    memberTags: {},
    seal: { texto: "", logo: "" },
    createdAt: serverTimestamp()
  });
  localStorage.setItem("empresaActiva", ref.id);
  return ref.id;
}

export const miRol = () => S.company?.roles?.[S.user?.uid] || "tecnico";
export const soyAdmin = () => ["owner", "admin"].includes(miRol());

export async function renombrarEmpresa(nombre) {
  await updateDoc(doc(db, "companies", S.company.id), { name: nombre.trim() });
}

export async function guardarSello(sello) {
  await updateDoc(doc(db, "companies", S.company.id), { seal: sello });
}

export async function agregarMiembro(usuario, rol = "tecnico") {
  const u = limpiarUsuario(usuario);
  const s = await getDoc(doc(db, "usernames", u));
  if (!s.exists()) throw new Error(`No existe el usuario “${u}”. Pedile que entre a la app una vez y te pase su usuario.`);
  const { uid, name } = s.data();
  if (S.company.members.includes(uid)) throw new Error("Ya es parte del operativo");
  await updateDoc(doc(db, "companies", S.company.id), {
    members: arrayUnion(uid),
    [`roles.${uid}`]: rol,
    [`memberNames.${uid}`]: name || u
  });
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

function escucharVehiculos() {
  unsubVehicles?.();
  S.vehicles = []; S.loadingVehicles = true;
  emit("vehicles");
  if (!S.company) return;
  unsubVehicles = onSnapshot(colVehiculos(), { includeMetadataChanges: true }, snap => {
    S.vehicles = snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }));
    S.vehicles.sort((a, b) => (b.fechas?.peritado || "").localeCompare(a.fechas?.peritado || "")
      || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    S.loadingVehicles = false;
    emit("vehicles");
  }, e => { console.error(e); S.loadingVehicles = false; emit("error"); });
}

export const activos = () => S.vehicles.filter(v => !v.deleted);
export const papelera = () => S.vehicles.filter(v => v.deleted);
export const getVehiculo = id => S.vehicles.find(v => v.id === id);

export function nuevoIdVehiculo() {
  return doc(colVehiculos()).id;
}

export async function guardarVehiculo(id, data, esNuevo) {
  const ref = doc(colVehiculos(), id);
  const base = { ...data, updatedAt: serverTimestamp(), updatedBy: S.user.uid };
  if (esNuevo) {
    // setDoc sin await de red: con caché offline se guarda al instante
    await setDoc(ref, {
      ...base,
      estado: data.estado || "peritado",
      fechas: data.fechas || { peritado: hoyISO() },
      fotos: data.fotos || [],
      archivos: data.archivos || [],
      deleted: false,
      createdAt: serverTimestamp(),
      createdBy: S.user.uid,
      createdByName: S.profile?.name || ""
    });
  } else {
    await updateDoc(ref, base);
  }
}

export async function actualizarVehiculo(id, campos) {
  await updateDoc(doc(colVehiculos(), id), { ...campos, updatedAt: serverTimestamp(), updatedBy: S.user.uid });
}

export async function cambiarEstado(v, estado, fecha = hoyISO()) {
  const fechas = { ...(v.fechas || {}) };
  if (estado !== "anulado") {
    // al avanzar, completa fechas faltantes de los pasos previos
    const idx = SECUENCIA.indexOf(estado);
    SECUENCIA.forEach((e, i) => {
      if (i < idx && !fechas[e]) fechas[e] = fecha;
      if (i > idx) delete fechas[e];
    });
  }
  fechas[estado] = fecha;
  await actualizarVehiculo(v.id, { estado, fechas });
}

export const moverAPapelera = id => actualizarVehiculo(id, { deleted: true, deletedAt: serverTimestamp() });
export const restaurar = id => actualizarVehiculo(id, { deleted: false, deletedAt: null });
export const eliminarDefinitivo = id => deleteDoc(doc(colVehiculos(), id));

// ── Gastos ────────────────────────────────────────────────────
const colGastos = () => collection(db, "companies", S.company.id, "gastos");

function escucharGastos() {
  unsubGastos?.();
  S.gastos = []; S.loadingGastos = true;
  if (!S.company) return;
  unsubGastos = onSnapshot(colGastos(), { includeMetadataChanges: true }, snap => {
    S.gastos = snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }))
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    S.loadingGastos = false;
    emit("gastos");
  }, e => { console.error(e); S.loadingGastos = false; emit("error"); });
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
