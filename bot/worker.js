// ═══════════════════════════════════════════════════════════════
//  Desabollito · Bot de WhatsApp (Cloudflare Worker)
//
//  El bot es de toda la app: no hace falta vincular cuentas.
//
//  Flujo:
//    1. Cualquiera del equipo manda la patente ("AE345KD").
//    2. El bot la busca en TODOS los operativos y deja ese vehículo "abierto".
//       Si la patente está en más de un operativo, pregunta a cuál.
//    3. Cada foto o documento que mande después se sube a Cloudinary
//       y se agrega a ese vehículo en Firebase (se ve al instante en la web).
//    4. "listo" cierra el vehículo. Otra patente cambia de vehículo.
//
//  Variables (Cloudflare → Worker → Settings → Variables and secrets):
//    WHATSAPP_TOKEN          token permanente de Meta (usuario del sistema)
//    WHATSAPP_PHONE_ID       Phone number ID del número del bot
//    WHATSAPP_VERIFY_TOKEN   texto que inventás vos para verificar el webhook
//    WHATSAPP_APP_SECRET     App secret de la app de Meta
//    FIREBASE_PROJECT_ID     desabollitoorg
//    FIREBASE_CLIENT_EMAIL   client_email de la cuenta de servicio
//    FIREBASE_PRIVATE_KEY    private_key de la cuenta de servicio
//    CLOUDINARY_CLOUD_NAME   dkfedvsn
//    CLOUDINARY_API_KEY      API Key de Cloudinary
//    CLOUDINARY_API_SECRET   API Secret de Cloudinary
//    NUMEROS_PERMITIDOS      (opcional) números que pueden usar el bot, separados
//                            por coma, ej: 5493515551234,5491123456789.
//                            Vacío o sin cargar = cualquiera puede usarlo.
// ═══════════════════════════════════════════════════════════════

const GRAPH = "https://graph.facebook.com/v21.0";
// A dónde responder: al número (bot oficial) o al chat/grupo (número vinculado con Evolution API)
import { completarXlsx, fechaExcel } from "./xlsx.js";
import { MERCANTIL } from "./plantillas.js";

const dest = m => m._to || m.from;
const APP_URL = "https://desabollito.github.io";
const SESION_HORAS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Desabollito bot funcionando ✅");
    if (url.pathname === "/diagnostico") return diagnostico(url, env);
    if (url.pathname === "/evolution") return webhookEvolution(req, url, env, ctx);
    const API = { "/registro": nuevoRegistro, "/avisar": avisarCliente, "/solicitud": avisarSolicitud, "/agregado": avisarAgregado, "/pedido-union": avisarPedidoUnion,
      "/admin/datos": adminDatos, "/admin/borrar-usuario": adminBorrarUsuario, "/admin/config": adminConfig, "/admin/padron": adminPadron, "/mover-vehiculo": moverVehiculo,
      "/borrar-media": borrarMediaApi, "/eliminar-vehiculo": eliminarVehiculoApi };
    if (API[url.pathname]) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
      let body = {};
      try { body = await req.json(); } catch {}
      try { return await API[url.pathname](env, body); }
      catch (e) { console.error(url.pathname, e?.stack || e); return json({ ok: false, error: "Error interno del bot" }, 500); }
    }
    if (url.pathname !== "/webhook") return new Response("No encontrado", { status: 404 });

    // Verificación del webhook (Meta la hace una sola vez al configurarlo)
    if (req.method === "GET") {
      const p = url.searchParams;
      const txt = (t, st = 200) => new Response(t, { status: st, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (!p.has("hub.mode")) {
        return txt("✅ Esta es la dirección del webhook. Está bien: se pega en Meta como “URL de devolución de llamada”; no hace falta abrirla en el navegador.");
      }
      const recibido = String(p.get("hub.verify_token") || "").trim();
      const esperado = String(env.WHATSAPP_VERIFY_TOKEN || "").trim();
      if (!esperado) return txt("❌ Falta cargar WHATSAPP_VERIFY_TOKEN en Cloudflare (y tocar Deploy).", 403);
      if (p.get("hub.mode") === "subscribe" && recibido === esperado) return txt(p.get("hub.challenge") || "");
      console.error(`Verificación rechazada: Meta mandó un token de ${recibido.length} caracteres; en Cloudflare hay uno de ${esperado.length}.`);
      return txt(`❌ El token de verificación no coincide (Meta mandó ${recibido.length} caracteres, Cloudflare tiene ${esperado.length}).`, 403);
    }
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

    // Solo aceptamos mensajes firmados por Meta
    const raw = await req.text();
    const firmaOk = await firmaValida(raw, req.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET);
    // Se registra cada llegada (sirve para el diagnóstico)
    ctx.waitUntil(registrar(env, { ultimoWebhook: new Date().toISOString(), ultimaFirmaOk: firmaOk, ultimoCuerpo: raw.slice(0, 600) }));
    if (!firmaOk) {
      console.error("Firma inválida: revisá WHATSAPP_APP_SECRET");
      return new Response("Firma inválida", { status: 401 });
    }
    let body;
    try { body = JSON.parse(raw); } catch { return new Response("ok"); }

    const mensajes = [];
    for (const entry of body.entry || []) {
      for (const ch of entry.changes || []) {
        const nombres = Object.fromEntries((ch.value?.contacts || []).map(c => [c.wa_id, c.profile?.name || ""]));
        for (const m of ch.value?.messages || []) mensajes.push({ ...m, _nombre: nombres[m.from] || "" });
      }
    }
    // Respondemos 200 enseguida (si no, Meta reintenta) y procesamos en segundo plano
    ctx.waitUntil(Promise.all(mensajes.map(m => procesar(m, env).catch(e => {
      console.error("Error con mensaje", m.id, e?.stack || e);
      registrar(env, { ultimoError: `${new Date().toISOString()} · ${String(e?.message || e).slice(0, 500)}` }).catch(() => {});
      return responder(env, dest(m), "⚠️ Hubo un error procesando tu mensaje. Probá de nuevo en un rato.").catch(() => {});
    }))));
    return new Response("ok");
  },
  // Cada hora: vacía la papelera (vehículos borrados hace más de 48 hs, con sus fotos en Cloudinary)
  async scheduled(ev, env, ctx) {
    // 23:00 UTC = 20:00 Argentina: resumen diario
    if (ev.cron === "0 23 * * *") return ctx.waitUntil(enviarResumenesDiarios(env).catch(e => console.error("resumen", e?.stack || e)));
    ctx.waitUntil(vaciarPapelera(env).catch(e => console.error("papelera", e?.stack || e)));
  }
};

// ─────────────────────────────────────────────────────────────
//  Lógica del bot
// ─────────────────────────────────────────────────────────────
async function procesar(m, env) {
  if (!(await primeraVez(env, m.id))) return; // Meta a veces reenvía el mismo mensaje

  const numero = normalizarNumero(m.from);
  const quien = { numero, nombre: m._nombre || "" };

  // Candado opcional: si hay lista de números permitidos, solo ellos usan el bot
  const permitidos = String(env.NUMEROS_PERMITIDOS || "").split(",").map(normalizarNumero).filter(Boolean);
  if (permitidos.length && !permitidos.includes(numero)) {
    return m._grupo ? null : responder(env, dest(m), "⛔ Este número no está habilitado para usar el bot de Desabollito.");
  }

  // El administrador aprueba o rechaza cuentas nuevas respondiendo SI / NO
  if (numero === numeroAdmin(env) && m.type === "text" && !m._grupo) {
    if (await comandoAdmin(env, m, (m.text?.body || "").trim())) return;
  }
  // Cada número tiene que estar vinculado a un usuario aprobado de la web
  const cuenta = await fsGet(env, `bot_numeros/${numero}`);
  if (!cuenta?.uid) return vincular(env, m, quien);
  // Si lo desvincularon desde la app, el número vuelve a pedir el usuario
  const perfil = await fsGet(env, `users/${cuenta.uid}`);
  if (!perfil || perfil.whatsapp !== numero) {
    await fsDelete(env, `bot_numeros/${numero}`).catch(() => {});
    return vincular(env, m, quien);
  }
  quien.waNombre = m._nombre || ""; quien.appNombre = cuenta.name || ""; quien.uid = cuenta.uid; quien.username = cuenta.username; quien.nombre = cuenta.name || quien.nombre;

  if (m.type === "text") return alRecibirTexto(env, m, quien, (m.text?.body || "").trim());
  if (m.type === "image" || m.type === "document" || m.type === "video") return alRecibirArchivo(env, m, quien);
  // Otros tipos (reacciones, avisos de álbum "unsupported", stickers, etc.): se ignoran en silencio
  await registrar(env, { ultimoTipoIgnorado: `${new Date().toISOString()} · ${m.type} · ${JSON.stringify(m).slice(0, 300)}` });
}

// ═══════════════════════════════════════════════════════════════
//  Intérprete de datos de vehículos escritos en cualquier orden:
//  "Corolla AB099BA Riv 1137709755 Monte" → modelo, patente,
//  compañía, teléfono y localidad.
// ═══════════════════════════════════════════════════════════════
const sinTildes = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const NO_ABREV = new Set(["pro", "plus", "max", "full", "sport", "sedan", "cross", "trend", "highline", "comfortline", "titanium",
  "limited", "active", "feel", "shine", "pack", "lite", "fire", "attractive", "precision", "freedom", "drive", "intense", "zen", "life",
  "premier", "premium", "classic", "confort", "style", "touring", "turbo", "diesel", "nafta", "manual", "automatica", "auto", "doble",
  "cabina", "simple", "seg", "ser", "san", "las", "los", "del", "con", "sin", "por", "para", "sur", "nor", "est", "oes"]);
// Compañías de seguro: nombre oficial + formas de escribirlas
const COMPANIAS = [
  ["Rivadavia", ["rivadavia"]], ["San Cristóbal", ["san cristobal", "sancristobal", "sc"]], ["Sancor", ["sancor"]],
  ["Paraná Seguros", ["parana seguros", "parana"]], ["Provincia Seguros", ["provincia seguros", "provincia", "prov"]],
  ["Mapfre", ["mapfre"]], ["La Segunda", ["la segunda", "segunda"]], ["Mercantil Andina", ["mercantil andina", "mercantil"]],
  ["Federación", ["federacion patronal", "federacion", "patronal", "fed patronal"]], ["Answer", ["answer"]],
  ["Allianz", ["allianz"]], ["Zurich", ["zurich"]], ["La Caja", ["la caja"]], ["Galicia Seguros", ["galicia"]],
  ["Nación Seguros", ["nacion seguros"]], ["Sura", ["sura"]], ["Río Uruguay", ["rio uruguay", "rus"]],
  ["Orbis", ["orbis"]], ["Meridional", ["meridional"]], ["Integrity", ["integrity"]], ["El Norte", ["el norte"]],
  ["Triunfo", ["triunfo"]], ["La Holando", ["la holando", "holando"]], ["Libra", ["libra"]], ["Experta", ["experta"]],
  ["HDI", ["hdi"]], ["Chubb", ["chubb"]], ["ATM", ["atm"]], ["Berkley", ["berkley"]], ["Cooperación Seguros", ["cooperacion"]],
  ["Victoria", ["victoria"]], ["SMG", ["smg", "swiss medical", "smg seguros"]], ["Particular", ["particular", "part"]], ["Boston", ["boston"]], ["Agrosalta", ["agrosalta"]], ["Evolución", ["evolucion"]]
];

// Localidades y provincias frecuentes (se agregan también las ya cargadas en la app)
const LOCALIDADES = [
  "Monte", "Posadas", "Entre Ríos", "Santa Fe", "Córdoba", "Rosario", "Mendoza", "Paraná", "Buenos Aires", "CABA", "La Plata",
  "Mar del Plata", "Bahía Blanca", "Tucumán", "Salta", "Neuquén", "San Luis", "Río Cuarto", "Rafaela", "Venado Tuerto",
  "Pergamino", "Junín", "Tandil", "Olavarría", "Azul", "Resistencia", "Corrientes", "Oberá", "Concordia", "Gualeguaychú",
  "Santiago del Estero", "San Juan", "Jujuy", "Catamarca", "La Rioja", "Villa María", "San Nicolás", "Zárate", "Campana",
  "Luján", "Pilar", "Mercedes", "San Rafael", "Carlos Paz", "Villa Carlos Paz", "Misiones", "Chaco", "Formosa", "La Pampa",
  "Santa Rosa", "Río Negro", "Bariloche", "Chubut", "Comodoro Rivadavia", "Trelew", "Santa Cruz", "Río Gallegos",
  "Tierra del Fuego", "Ushuaia", "San Pedro", "Chivilcoy", "Bragado", "9 de Julio", "Trenque Lauquen", "Tres Arroyos",
  "Necochea", "Balcarce", "Chascomús", "Cañuelas", "Lobos", "San Miguel", "Morón", "Quilmes", "Lanús", "Avellaneda",
  "Lomas de Zamora", "Tigre", "Escobar", "San Isidro", "Vicente López", "Ezeiza", "Esteban Echeverría", "Eldorado",
  "Apóstoles", "Goya", "Paso de los Libres", "Reconquista", "Esperanza", "Sunchales", "Cañada de Gómez", "San Francisco",
  "Villa Mercedes", "Alta Gracia", "Jesús María", "Bell Ville", "Marcos Juárez", "General Roca", "Cipolletti", "Plottier",
  "Villa Gesell", "Pinamar", "Gualeguay", "Victoria", "Colón", "Concepción del Uruguay", "Crespo", "Villaguay", "Federal"
];

// Marcas y modelos (con la forma de escribirlos)
const MARCAS = ["Toyota", "Volkswagen", "VW", "Ford", "Chevrolet", "Fiat", "Renault", "Peugeot", "Citroën", "Nissan", "Honda",
  "Hyundai", "Kia", "Jeep", "RAM", "Mercedes-Benz", "Mercedes", "BMW", "Audi", "Chery", "Suzuki", "Mitsubishi", "DS", "Dodge",
  "BAIC", "Haval", "JAC", "Great Wall", "Geely", "BYD", "Subaru", "Volvo", "Mini", "Porsche", "Iveco", "Isuzu", "Lifan", "Jetour", "Chevy"];
const MODELOS = ["Gol", "Gol Trend", "Hilux", "Corolla", "Corolla Cross", "Etios", "Yaris", "SW4", "RAV4", "Amarok", "Vento", "Polo",
  "Virtus", "T-Cross", "Taos", "Nivus", "Saveiro", "Up", "Fox", "Suran", "Voyage", "Tiguan", "Passat", "Golf", "Bora", "Ranger",
  "Ka", "Fiesta", "Focus", "EcoSport", "Territory", "Maverick", "Kuga", "Mondeo", "Bronco", "Onix", "Cruze", "Tracker", "Prisma",
  "S10", "Spin", "Montana", "Equinox", "Trailblazer", "Agile", "Corsa", "Classic", "Celta", "Cronos", "Argo", "Toro", "Strada",
  "Mobi", "Palio", "Siena", "Uno", "Pulse", "Fastback", "Punto", "Fiorino", "Ducato", "Sandero", "Logan", "Kangoo", "Duster",
  "Stepway", "Kwid", "Alaskan", "Captur", "Oroch", "Clio", "Symbol", "Fluence", "Koleos", "Arkana", "208", "2008", "308", "3008",
  "408", "5008", "207", "206", "Partner", "Expert", "Boxer", "C3", "C4", "C4 Cactus", "C5", "Berlingo", "Frontier", "Kicks",
  "Versa", "Sentra", "March", "Note", "X-Trail", "HR-V", "Civic", "City", "Fit", "CR-V", "WR-V", "Tucson", "Creta", "HB20",
  "i10", "Santa Fe", "Renegade", "Compass", "Wrangler", "Commander", "500", "Mustang", "Tiggo", "QQ", "Vitara", "Swift",
  "L200", "Outlander", "Sportage", "Cerato", "Rio", "Picanto", "Seltos", "Sprinter", "Clase A", "Hilux SRV", "Hiace", "Innova",
  "Camry", "Prius", "Tacoma", "Tundra", "Jolion", "H6", "Poer", "Wingle", "Dolphin", "Song", "Yuan", "Forester", "Outback", "XV"];

function indice(lista) {
  const m = new Map();
  for (const nombre of lista) m.set(sinTildes(nombre), nombre);
  return m;
}
const IDX_MARCAS = indice(MARCAS);
const IDX_MODELOS = indice(MODELOS);

// Patentes argentinas: AA000AA (Mercosur) y AAA000 (anterior)
const RE_PATENTE = /\b([A-Za-z]{2})[\s.-]?(\d{3})[\s.-]?([A-Za-z]{2})\b|\b([A-Za-z]{3})[\s.-]?(\d{3})\b/;
// "BMW118", "KIA 125"… tienen forma de patente vieja pero son marca + modelo: no se toman como patente
const esMarcaModelo = letras => typeof IDX_MARCAS !== "undefined" && IDX_MARCAS.has(String(letras).toLowerCase());
export function buscarPatenteEnTexto(texto) {
  const cands = [...String(texto).matchAll(new RegExp(RE_PATENTE.source, "g"))]
    .filter(m => m[1] || !esMarcaModelo(m[4]));
  // Si hay varias, gana la del formato nuevo (AB123CD)
  const m = cands.find(x => x[1]) || cands[0];
  if (!m) return null;
  return { patente: (m[1] ? m[1] + m[2] + m[3] : m[4] + m[5]).toUpperCase(), desde: m.index, largo: m[0].length };
}

// ── Paños afectados ──────────────────────────────────────────
const LADO = "(izq(?:uierd[oa]s?)?|der(?:ech[oa]s?)?)";
const POS = "(del(?:anter[oa]s?)?|tras(?:er[oa]s?)?)";
const lados = l => !l ? ["izq", "der"] : [l.startsWith("izq") ? "izq" : "der"];
const posiciones = p => !p ? ["d", "t"] : [p.startsWith("del") ? "d" : "t"];
const TODOS_LOS_PANOS = ["capot", "techo", "baul", "parante_izq", "parante_der", "gf_izq", "pd_izq", "pt_izq", "gt_izq", "gf_der", "pd_der", "pt_der", "gt_der"];
const REGLAS_PANOS = [
  [/\b(?:todos(?:\s+los\s+panos)?|todo\s+el\s+auto|completo)\b/g, () => TODOS_LOS_PANOS],
  [/\bcap(?:o|ó|ot)\b/g, () => ["capot"]],
  [/\btecho\b/g, () => ["techo"]],
  [/\b(?:tapa\s+(?:de\s+)?)?(?:baul|baúl|porton|portón|compuerta)\b/g, () => ["baul"]],
  [new RegExp(`\\bparantes?(?:\\s+${LADO})?\\b`, "g"), m => lados(m[1]).map(l => `parante_${l}`)],
  [new RegExp(`\\bguardabarros?(?:\\s+${POS})?(?:\\s+${LADO})?\\b`, "g"), m => posiciones(m[1]).flatMap(p => lados(m[2]).map(l => `g${p === "d" ? "f" : "t"}_${l}`))],
  [new RegExp(`\\bpuertas?(?:\\s+${POS})?(?:\\s+${LADO})?\\b`, "g"), m => posiciones(m[1]).flatMap(p => lados(m[2]).map(l => `p${p}_${l}`))],
  [new RegExp(`\\blateral(?:es)?(?:\\s+${LADO})?\\b`, "g"), m => lados(m[1]).flatMap(l => [`gf_${l}`, `pd_${l}`, `pt_${l}`, `gt_${l}`])]
];
function sacarPanos(texto) {
  let original = String(texto);
  let norm = sinTildes(original);
  if (norm.length !== original.length) original = norm; // por seguridad, si cambió el largo
  const piezas = {};
  for (const [re, fn] of REGLAS_PANOS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(norm))) {
      fn(m).forEach(k => { piezas[k] = true; });
      const blanco = " ".repeat(m[0].length);
      norm = norm.slice(0, m.index) + blanco + norm.slice(m.index + m[0].length);
      original = original.slice(0, m.index) + blanco + original.slice(m.index + m[0].length);
    }
  }
  return { piezas, resto: original };
}

// "$150.000", "150000", "150 mil", "150k", "1,5 millones" → número
function aPrecio(t) {
  const s2 = sinTildes(String(t));
  const m = s2.match(/(\d+(?:[.,]\d+)*)\s*(millon(?:es)?|mil|k|m\b)?/);
  if (!m) return null;
  let num = m[1];
  // Separadores: "150.000" / "150,000" son miles; "1,5" / "1.5" con multiplicador son decimales
  if (m[2] && /^\d+[.,]\d{1,2}$/.test(num)) num = Number(num.replace(",", "."));
  else num = Number(num.replace(/[.,]/g, ""));
  const mult = !m[2] ? 1 : /^(k|mil)$/.test(m[2]) ? 1000 : 1000000;
  const n = Math.round(num * mult);
  return n > 0 ? n : null;
}

// Palabra con forma de nombre propio: "Juan" o, si escriben todo en mayúsculas, "JUAN"
const palabraNombre = w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü']+$/.test(w) || /^[A-ZÁÉÍÓÚÑÜ']{2,}$/.test(w);
// ── Nombre del cliente: "cliente Juan Pérez", "asegurado: Ana Ruiz", "titular …"
const RE_CLIENTE = /\b(?:cliente|asegurad[oa]|titular|nombre|sr\.?|sra\.?)\s*:?\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü'´]+(?:\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü'´]+){0,3})/i;

const titulo = t => t.split(/\s+/).map(p => /\d/.test(p) || p.length <= 3 && p === p.toUpperCase() ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");

/**
 * @param {string} texto
 * @param {{ localidades?: string[], companias?: string[] }} extra  valores ya usados en la app
 */
// "pintar capot techo", "paños a pintura capot y techo", "repuesto faro izq espejo der":
// después de la palabra clave se toman solo las piezas (con su lado/posición), cada una por separado,
// y se corta en la primera palabra que no es una pieza (el resto del mensaje sigue normal).
const PARTES_RE = new Set(("capot techo baul porton guardabarro guardabarros puerta puertas parante parantes zocalo zocalos faro faros optica opticas " +
  "espejo espejos moldura molduras paragolpe paragolpes parabrisas luneta vidrio vidrios manija manijas emblema emblemas burlete burletes " +
  "antena spoiler aleron grilla parrilla rejilla farito faritos giro giros calco calcos cristal deflector tapa tapas babero baberos retrovisor " +
  "barral barrales llanta llantas lateral laterales frente trompa cola pilar marco sensor sensores bisagra bisagras cubre tazas taza " +
  "panel paneles butaca sunroof techito portaequipaje").split(" "));
const MODS_RE = new Set(("izq izquierdo izquierda izquierdos izquierdas der derecho derecha derechos derechas del delantero delantera delanteros delanteras " +
  "tras trasero trasera traseros traseras sup superior inf inferior de completo completa lado ext exterior int interior chico chica grande " +
  "medio central x2 x3 ambos ambas").split(" "));
const RE_PIEZAS_ETIQ = /(^|\s)(?:pa[ñn]os?\s+(?:a|para|de)\s+)?(pint(?:ar|ura|arlo|arla|arlos|ado|ada|or|a)|repuestos?)(?![a-záéíóúñ:=])/gi;
function piezasEtiquetadas(texto, r) {
  let out = texto, m;
  RE_PIEZAS_ETIQ.lastIndex = 0;
  const cortes = [];
  while ((m = RE_PIEZAS_ETIQ.exec(texto))) {
    const ini = m.index + m[1].length, tras = texto.slice(m.index + m[0].length);
    const tokens = [...tras.matchAll(/[^\s,;]+|[,;]/g)];
    const items = []; let actual = null, fin = 0;
    for (const t of tokens) {
      const w = sinTildes(t[0]).replace(/[.:]+$/, "");
      if (w === "," || w === ";" || w === "y" || w === "e") { actual = null; fin = t.index + t[0].length; continue; }
      if (PARTES_RE.has(w)) { actual = [t[0].replace(/[.:]+$/, "")]; items.push(actual); fin = t.index + t[0].length; continue; }
      if (actual && MODS_RE.has(w)) { actual.push(t[0].replace(/:+$/, "")); fin = t.index + t[0].length; continue; }
      if (!actual && /^(del|de|la|el|los|las|al|a|en|el|un|una)$/.test(w)) continue;   // "pintura del techo"
      break;
    }
    if (!items.length) continue;
    const lista = items.map(x => x.join(" ")).join(", ");
    if (/^rep/i.test(m[2])) r.repuestos = r.repuestos ? r.repuestos + ", " + lista : lista;
    else r.pintura = r.pintura ? r.pintura + ", " + lista : lista;
    cortes.push([ini, m.index + m[0].length + fin]);
  }
  for (const [a, b] of cortes.reverse()) out = out.slice(0, a) + " " + out.slice(b);
  return out;
}

const RE_CHARLA = /\b(hay que|tiene que|tenes que|tenés que|decile|decirle|avisale|avisarle|preguntale|preguntarle|que traiga|que venga|cuando venga|cuando pase|va a|vamos a|me dijo|dice que|dijo que|porque|despu[eé]s|mañana|ma[nñ]ana|hoy|ayer|este|esta|ese|esa|traiga|venga|retirar|retira|buscar|llam[aá]lo|llamar)\b/i;
const esCharla = t => RE_CHARLA.test(String(t || ""));

export function interpretar(texto, extra = {}) {
  // Sin menciones ("@⁨Mati Squadano⁩", "@5493511234567")
  let resto = ` ${String(texto || "").replace(/@\u2068[^\u2069]*\u2069/g, " ").replace(/@\+?\d{6,}/g, " ")} `;
  const r = { patente: null, modelo: "", compania: "", telefono: "", localidad: "", grado: null, otros: "", asegurado: "", piezas: {},
    observaciones: "", repuestos: "", pintura: "", precio: null };

  // 0. "AB123CD fotos", "mando fotos", "más fotos": es un pedido para cargar fotos, no un dato del vehículo
  resto = resto.replace(/(^|\s)(?:(?:te\s+)?(?:mando|paso|envio|envío|subo|cargo|cargar|subir|agrego)\s+)?(?:(?:las|unas|m[aá]s|mas)\s+)?(?:fotos?|im[aá]genes|videos?)(?=\s|[.,;:!]|$)/gi, " ");

  // 0b. "P208", "P3008", "p 2008"… (una P y 3 o 4 números) es un Peugeot
  resto = resto.replace(/(^|\s)p\s?-?(\d{3,4})(?=\s|[.,;]|$)/gi, "$1Peugeot $2");
  resto = resto.replace(/(^|\s)([a-z]{2,4})(\d{2,4})(?=\s|[.,;]|$)/gi, (t, a, l, n) => esMarcaModelo(l) ? `${a}${l} ${n}` : t);

  // 1. Patente
  const p = buscarPatenteEnTexto(resto);
  // (queda una marca "¶" donde estaba, para saber qué modelo está pegado a la patente)
  if (p) { r.patente = p.patente; resto = resto.slice(0, p.desde) + " ¶ " + resto.slice(p.desde + p.largo); }

  // 1b. Campos con etiqueta: "detalle: …", "adicional …", "repuestos: …", "precio: …".
  //     El texto va desde la etiqueta hasta la próxima etiqueta o el final del mensaje.
  // Repuestos y pintura con ":" toman todo el texto que sigue; sin ":" se entienden solo las piezas (ver abajo)
  const RE_ETIQ = /(?:^|\s)(?:(detalles?|adicional(?:es)?|observaci[oó]n(?:es)?|obs|precio)(?![a-záéíóúñ])\s*[:\-=]?|(repuestos?|pintura)(?![a-záéíóúñ])\s*[:=])\s*/gi;
  resto = piezasEtiquetadas(resto, r);
  const marcas = [...resto.matchAll(RE_ETIQ)];
  if (marcas.length) {
    const partes = marcas.map((mm, k) => ({ tipo: sinTildes(mm[1] || mm[2]), texto: resto.slice(mm.index + mm[0].length, k + 1 < marcas.length ? marcas[k + 1].index : resto.length).replace(/¶/g, " ").replace(/\s+/g, " ").trim() }));
    resto = resto.slice(0, marcas[0].index) + " ";
    for (const { tipo, texto: t } of partes) {
      if (!t) continue;
      if (tipo.startsWith("repuesto")) r.repuestos = r.repuestos ? r.repuestos + "\n" + t : t;
      else if (tipo === "precio") r.precio = aPrecio(t);
      else if (tipo === "pintura") r.pintura = r.pintura ? r.pintura + ", " + t : t;
      else r.observaciones = r.observaciones ? r.observaciones + "\n" + t : t;
    }
  }
  if (r.repuestos) r.repuestos = itemsRep(r.repuestos).join(", ");
  if (r.pintura) r.pintura = itemsRep(r.pintura).join(", ");


  // 2. Grado: "grado 2", "g2", "G 3"
  resto = resto.replace(/\b(?:grado|g)\s*([1234])\b/i, (_, g) => { r.grado = Number(g); return " "; });

  // 3. Teléfono: 8 a 13 dígitos (con o sin +54, espacios o guiones)
  resto = resto.replace(/(?<![A-Za-zÁÉÍÓÚÑáéíóúñ\d])(?:\+?\s?\d[\d\s-]{6,16}\d)/g, m => {
    let d = m.replace(/\D/g, "");
    // Número de modelo pegado al teléfono ("2008 3515551234"): se deja el primero y se toma el resto
    if (!r.telefono && d.length > 13 && /\s/.test(m.trim())) {
      const [primero, ...demas] = m.trim().split(/\s+/);
      const t2 = demas.join("").replace(/\D/g, "");
      if (t2.length >= 8 && t2.length <= 13) { d = t2; }
      else return m;
      let t = d;
      if (t.startsWith("549") && t.length === 13) t = t.slice(3);
      else if (t.startsWith("54") && t.length === 12) t = t.slice(2);
      else if (t.startsWith("0") && t.length === 11) t = t.slice(1);
      r.telefono = t; return ` ${primero} `;
    }
    if (!r.telefono && d.length >= 8 && d.length <= 13) {
      // Formato local: sin +54 / 9 / 0 adelante (ej: 1137709755)
      let t = d;
      if (t.startsWith("549") && t.length === 13) t = t.slice(3);
      else if (t.startsWith("54") && t.length === 12) t = t.slice(2);
      else if (t.startsWith("0") && t.length === 11) t = t.slice(1);
      r.telefono = t; return " ";
    }
    return m;
  });

  // 3c. Paños afectados (capot, techo, puerta del izq, guardabarro tras der, lateral izquierdo…)
  const pz = sacarPanos(resto);
  r.piezas = pz.piezas;
  resto = pz.resto;

  // 3b. Cliente (con palabra clave). Se cortan al final las palabras que son compañía, localidad o modelo.
  const mc = resto.match(RE_CLIENTE);
  if (mc) {
    const palabrasC = mc[1].split(/\s+/);
    const conocida = w => { const n = sinTildes(w); return indice([...LOCALIDADES, ...(extra.localidades || [])]).has(n) || IDX_MARCAS.has(n) || IDX_MODELOS.has(n) ||
      COMPANIAS.some(([, al]) => al.some(a => a === n || (n.length >= 3 && a.split(" ").some(x => x.startsWith(n))))); };
    while (palabrasC.length > 1 && conocida(palabrasC[palabrasC.length - 1])) palabrasC.pop();
    r.asegurado = titulo(palabrasC.filter(w => w !== "¶").join(" "));
    resto = resto.replace(mc[0].split(/\s+/).slice(0, 1 + palabrasC.length).join(" "), " ");
  }

  // 4. Palabras restantes: compañía, localidad, marca/modelo (buscando primero las frases más largas)
  const palabras = resto.split(/[\s,;/|]+/).filter(Boolean);
  const norm = palabras.map(w => sinTildes(w.replace(/[.:]+$/, "")));
  const tipo = palabras.map(w => w === "¶" ? "pat" : null);
  const idxLoc = indice([...LOCALIDADES, ...(extra.localidades || [])]);
  const compExtra = (extra.companias || []).map(c => [c, [sinTildes(c)]]);
  const todasComp = [...COMPANIAS, ...compExtra];

  const compDe = frase => {
    // Coincidencia exacta con un alias, o abreviatura (3+ letras) que solo encaje con una compañía
    const exacta = todasComp.find(([, al]) => al.includes(frase));
    if (exacta) return exacta[0];
    if (frase.length < 3 || frase.includes(" ")) return null;
    // Palabras de versiones/modelos ("pro", "plus", "sport"…) o marcas/modelos conocidos no son abreviaturas de compañía
    if (NO_ABREV.has(frase) || IDX_MARCAS.has(frase) || IDX_MODELOS.has(frase)) return null;
    const cand = new Set(todasComp.filter(([, al]) => al.some(a => a.split(" ").some(w => w.startsWith(frase)))).map(([n]) => n));
    return cand.size === 1 ? [...cand][0] : null;
  };

  for (const n of [3, 2, 1]) {
    for (let i = 0; i + n <= palabras.length; i++) {
      if (tipo.slice(i, i + n).some(Boolean)) continue;
      const frase = norm.slice(i, i + n).join(" ");
      if (!frase) continue;
      let asignado = null;
      if (!r.compania) { const c = compDe(frase); if (c) { r.compania = c; asignado = "compania"; } }
      // (la localidad nunca se toma del mensaje: siempre es el nombre del operativo)
      if (!asignado && (IDX_MARCAS.has(frase) || IDX_MODELOS.has(frase))) asignado = "modelo";
      if (asignado) for (let k = i; k < i + n; k++) tipo[k] = asignado;
    }
  }

  // Modelo: marcas/modelos reconocidos + palabras desconocidas pegadas a ellos ("Chery Tiggo 4")
  // Si hay varios modelos separados ("traiga la duster cuando retire la Amarok AB123CD") se toma
  // solo el bloque seguido más cercano a la patente; los otros quedan como texto.
  const bloques = [];
  tipo.forEach((t, i) => { if (t !== "modelo") return; const b = bloques[bloques.length - 1]; if (b && b[1] === i - 1) b[1] = i; else bloques.push([i, i]); });
  if (bloques.length > 1) {
    const iPat = tipo.indexOf("pat");
    const dist = ([a, b]) => iPat < 0 ? a : Math.min(Math.abs(a - iPat), Math.abs(b - iPat));
    const elegido = bloques.reduce((m, b) => dist(b) < dist(m) ? b : m);
    for (const b of bloques) if (b !== elegido) for (let k = b[0]; k <= b[1]; k++) tipo[k] = null;
  }
  const idxModelo = tipo.map((t, i) => t === "modelo" ? i : -1).filter(i => i >= 0);
  if (idxModelo.length) {
    let ini = Math.min(...idxModelo), fin = Math.max(...idxModelo);
    // Suma palabras desconocidas pegadas ("Chery Tiggo 4"), salvo que parezcan un nombre ("Carlos Méndez")
    const esNombre = palabraNombre;
    let libres = 0;
    while (fin + 1 + libres < palabras.length && !tipo[fin + 1 + libres]) libres++;
    // Números pegados al modelo ("BMW 118", "Etios 1.5") van con el modelo
    while (libres > 0 && /\d/.test(palabras[fin + 1])) { fin++; libres--; }
    const grupo = palabras.slice(fin + 1, fin + 1 + libres);
    // Dos palabras solo con letras (en minúscula o Nombre Apellido) después del modelo: es el cliente, no el modelo
    const pareceNombre = grupo.length >= 2 && grupo.slice(0, 2).every(w => esNombre(w) || (/^[a-záéíóúñü]{3,}$/i.test(w) && !/^[A-Z]{2,6}$/.test(w)));
    if (!pareceNombre) {
      let sum = 0;
      // Solo palabras cortas o con números ("SRV", "Pro", "1.6"): lo demás ("golpe fuerte") va a detalles
      while (sum < Math.min(2, grupo.length) && (grupo[sum].length <= 4 || /\d/.test(grupo[sum]) || /^[A-Z]{2,6}$/.test(grupo[sum]))) sum++;
      fin += sum;
    }
    for (let k = ini; k <= fin; k++) if (!tipo[k] || tipo[k] === "modelo") tipo[k] = "modelo";
    r.modelo = palabras.filter((_, k) => tipo[k] === "modelo").map((w, j, arr) => {
      const n2 = sinTildes(w);
      return IDX_MARCAS.get(n2) || IDX_MODELOS.get(n2) || titulo(w);
    }).join(" ");
  }

  // Lo que no se reconoció: completa modelo o asegurado; el resto va a detalles (no se pierde)
  const grupos = [];
  palabras.forEach((w, i) => {
    if (tipo[i]) return;
    if (i > 0 && !tipo[i - 1] && grupos.length) grupos[grupos.length - 1].push(w); else grupos.push([w]);
  });
  for (const g of grupos) {
    const t = g.join(" ");
    // Nombre: 1 a 4 palabras solo con letras (en cualquier formato: "victoria", "Juan Perez", "JUAN")
    const pareceNombre = g.length >= 1 && g.length <= 4 && g.every(w => palabraNombre(w) || /^[a-záéíóúñü']{2,}$/i.test(w))
      && !g.some(w => PARTES_RE.has(sinTildes(w)) || /^(falta|faltan|roto|rota|golpe|golpes|rayon|rayado|abollado|cambiar|cambio|sin|con|tiene|viene|hay|para)$/i.test(sinTildes(w)));
    if (!r.asegurado && pareceNombre && r.modelo) { r.asegurado = titulo(t); continue; }
    if (!r.modelo && g.length <= 3 && !esCharla(t)) r.modelo = titulo(t);
    else r.otros = (r.otros ? r.otros + " " : "") + t;
  }
  // Sin conectores sueltos que quedan al sacar paños ("en", "y", "x2")
  // Texto de charla ("a este hay que decirle que traiga…"): no es una carga de datos
  r.charla = esCharla(r.otros) || r.otros.split(/\s+/).filter(Boolean).length >= 6;
  r.otros = r.otros.split(/\s+/).filter(w => w && !/^(en|y|e|o|de|del|la|el|los|las|con|a|al|x\d)$/i.test(w)).join(" ");
  if (r.otros) { r.observaciones = [r.observaciones, r.otros].filter(Boolean).join("\n"); r.otros = ""; }
  return r;
}

// ¿El texto nombra algún operativo? Compara con el nombre completo y con el nombre
// sin palabras genéricas ("Operativo Rosario" → "rosario"). Devuelve el más largo.
const GENERICAS = new Set(["operativo", "operativos", "granizo", "taller", "equipo", "de", "del", "la", "el", "los", "las", "en"]);
const soloPalabras = t => sinTildes(t).replace(/[^a-z0-9ñ]+/g, " ").trim();

export function operativoMencionado(texto, operativos) {
  const t = ` ${soloPalabras(texto)} `;
  let mejor = null;
  for (const op of operativos) {
    const completo = soloPalabras(op.operativo);
    const corto = completo.split(" ").filter(w => !GENERICAS.has(w)).join(" ");
    for (const frase of new Set([completo, corto])) {
      if (frase.length >= 3 && t.includes(` ${frase} `) && (!mejor || frase.length > mejor.frase.length)) mejor = { op, frase };
    }
  }
  return mejor;
}

// Quita del texto las palabras del nombre del operativo (para que no se tomen como
// modelo), salvo que también sean una localidad conocida.
export function quitarFrase(texto, frase) {
  if (!frase || indice(LOCALIDADES).has(frase)) return texto;
  const objetivo = frase.split(" ");
  const palabras = String(texto).split(/\s+/);
  const norm = palabras.map(w => soloPalabras(w));
  for (let i = 0; i + objetivo.length <= palabras.length; i++) {
    if (objetivo.every((w, k) => norm[i + k] === w)) { palabras.splice(i, objetivo.length); break; }
  }
  return palabras.join(" ");
}


const INSTRUCCIONES =
  "Enviame los datos del vehículo y luego las fotos.\n\n" +
  "Todo se carga en la nube al momento que lo envías. Cuando termines un vehículo enviá *OK*.";
const SALUDO = "¡Hola, soy Desabollito 🚘!\n\n" + INSTRUCCIONES;

// Saludo según la hora de Argentina (UTC-3): con el nombre de la cuenta de la app;
// si todavía no se conoce, con el nombre de WhatsApp
function saludoHora(quien) {
  const h = (new Date().getUTCHours() + 21) % 24;
  const franja = h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches";
  const primero = t => String(t || "").trim().split(/\s+/)[0] || "";   // solo el nombre, sin apellido
  const nombre = primero(quien?.appNombre) || quien?.username || primero(quien?.waNombre);
  return `${franja}${nombre ? " " + nombre : ""}! 👋\n\n` + INSTRUCCIONES;
}

const AYUDA =
  "🚗 *Cómo usar Desabollito*\n\n" +
  "- Envia los datos del vehiculo en un solo mensaje, no importa el orden.\n\n" +
  "- Luego envia las fotos\n\n" +
  "- Listo! Seguí con otro o enviá *OK* para finalizar.\n\n" +
  "🚨 *Operativo*\n\n" +
  "Para cambiarlo escribí *operativo*.";

const lineaOperativo = fijo => `\n\n> Operativo actual: ${fijo ? fijo.operativo : "ninguno (escribí *operativo* para elegirlo)"}`;

const NOMBRE_PANO = { capot: "Capot", techo: "Techo", baul: "Baúl", parante_izq: "Parante izq.", parante_der: "Parante der.",
  gf_izq: "Guardabarro del. izq.", pd_izq: "Puerta del. izq.", pt_izq: "Puerta tras. izq.", gt_izq: "Guardabarro tras. izq.",
  gf_der: "Guardabarro del. der.", pd_der: "Puerta del. der.", pt_der: "Puerta tras. der.", gt_der: "Guardabarro tras. der." };
const ESTADO_TXT = { peritado: "Peritado", turnado: "Turnado", enreparacion: "Reparando", reparado: "Revisión", llamado: "Contactado", entregado: "Entregado", facturado: "Facturado", ausente: "Ausente", anulado: "Anulado" };
const fechaTxt = iso => { const [a, mm, d] = String(iso || "").split("-"); return d ? `${d}/${mm}/${a.slice(2)}` : ""; };
// Ficha del vehículo por escrito (para "localizá")
function detalleVehiculo(v, operativo) {
  const est = v.fechas?.anulado ? "anulado" : ["ausente", "enreparacion"].includes(v.estado) ? v.estado : ["facturado", "entregado", "llamado", "reparado", "turnado", "peritado"].find(k => v.fechas?.[k]) || v.estado || "peritado";
  const cuando = k => v.fechas?.[k] ? `${fechaTxt(v.fechas[k])}${v.horas?.[k] ? " " + v.horas[k] : ""}` : "";
  const panos = Object.keys(v.piezas || {}).filter(k => v.piezas[k]);
  const filas = [
    `🚗 *${v.modelo || "Sin modelo"}* · ${v.patente || ""}`,
    operativo ? `📂 ${operativo}` : "",
    `📌 ${ESTADO_TXT[est] || est}${cuando(est) ? ` · ${cuando(est)}` : ""}`,
    est !== "peritado" && cuando("peritado") ? `Peritado: ${cuando("peritado")}` : "",
    v.asegurado ? `👤 ${v.asegurado}` : "",
    v.telefono ? `📞 ${v.telefono}` : "",
    v.compania ? `🛡️ ${v.compania}` : "",
    v.grado ? `Grado ${v.grado}` : "",
    panos.length ? `Paños: ${panos.length === TODOS_LOS_PANOS.length ? "todos" : panos.map(k => NOMBRE_PANO[k] || k).join(", ")}` : "",
    v.pintura ? `Pintura: ${v.pintura}` : "",
    v.repuestos ? `Repuestos: ${String(v.repuestos).replace(/\n+/g, ", ")}` : "",
    v.observaciones ? `Detalles: ${v.observaciones}` : "",
    v.precio ? `💲 $${Number(v.precio).toLocaleString("es-AR")}` : "",
    `📷 ${(v.fotos || []).length} ${(v.fotos || []).length === 1 ? "foto" : "fotos"}`
  ];
  return filas.filter(Boolean).join("\n");
}
// ── Repuestos por WhatsApp: "repuestos AB123CD" → lista con estados; después agregar o cambiar estados
const FASES_REP = [["sinpedir", "Sin pedir", "🔴"], ["pedido", "Pedido", "🟡"], ["recibido", "Recibido", "🔵"], ["colocado", "Colocado", "🟢"]];
// Cada ítem: primera letra mayúscula, el resto en minúscula (salvo siglas como ABS o palabras con números) y sin punto final
const prolijo = x => x.trim().replace(/[.;:\s]+$/, "").split(/\s+/)
  .map((w, i) => /\d/.test(w) || (/^[A-ZÁÉÍÓÚÑ]{2,4}$/.test(w)) ? w : (i ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");
const itemsRep = t => String(t || "").split(/\n|,/).map(prolijo).filter(Boolean);
const claveRep = x => sinTildes(String(x)).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "item";
const faseDe = (v, x) => FASES_REP.find(f => f[0] === v.etapasRepuestos?.[claveRep(x)]) || FASES_REP[0];
const RE_PIDE_REP = /^(?:localiz\w*\s+)?repuestos?\s+(\S+(?:\s+\S+)?)$/i;
function textoRepuestos(v, operativo) {
  const est = v.fechas?.anulado ? "anulado" : ["ausente", "enreparacion"].includes(v.estado) ? v.estado : ["facturado", "entregado", "llamado", "reparado", "turnado", "peritado"].find(k => v.fechas?.[k]) || "peritado";
  const items = itemsRep(v.repuestos);
  return [`🚗 *${v.modelo || "Sin modelo"}* · ${v.patente || ""}`,
    v.compania ? `🛡 ${v.compania}` : null,
    `📌 ${ESTADO_TXT[est] || est}`,
    operativo ? `📁 ${operativo}` : null,
    "",
    items.length ? "*Repuestos:*\n" + items.map((x, i) => { const f = faseDe(v, x); return `${i + 1}. ${x} — ${f[2]} ${f[1]}`; }).join("\n") : "_Todavía no tiene repuestos cargados._",
    items.length ? "" : null,
    items.length ? "Podes actualizar el estado.\nIndicame el numero y el estado nuevo (pedido/recibido /colocado)" : null
  ].filter(x => x !== null).join("\n");
}
function faseDeTexto(t) {
  const x = sinTildes(t).replace(/\s+/g, "");
  if (/^sinpedir|^nopedid|^falta/.test(x)) return "sinpedir";
  if (/^pedid|^pedi/.test(x)) return "pedido";
  if (/^recib|^lleg/.test(x)) return "recibido";
  if (/^coloc|^puest|^instal/.test(x)) return "colocado";
  return null;
}

const etiqueta = s => s.modelo ? `*${s.modelo}* (${s.patente})` : `*${s.patente}*`;
const PALABRAS_CIERRE = ["ok", "oka", "okey", "okay", "okk", "listo", "lista", "ya", "ya está", "ya esta", "fin", "terminé", "termine",
  "cerrar", "chau", "gracias", "dale", "perfecto", "joya", "bien", "👍", "👌", "✅"];
const limpio = t => t.toLowerCase().trim().replace(/[!.¡¿?\s]+$/g, "").replace(/^[¡¿\s]+/, "");
const esCierre = t => PALABRAS_CIERRE.includes(limpio(t));
const esSaludo = t => /^(hola+|buenas|buen d[ií]a|buenas tardes|buenas noches|hey|hi|start|inicio)$/.test(limpio(t));
const esAyuda = t => /^(ayuda|help|\?|menu|menú|comandos|info)$/.test(limpio(t));
const esLocalizar = t => /^(localiz|ubic|encontr|busc|d[oó]nde\s+est|mostr|pas[aá]me\s+el\s+link|link)/i.test(limpio(t));
// Menciones al bot en grupos: "desabollito", "@desabollito" o la palabra "bot"
const mencionaBot = t => /desabollito|\bbot\b/i.test(sinTildes(String(t || "")));
const quitarMencion = t => String(t || "").replace(/@?desabollito|\bbot\b/gi, " ").replace(/\s+/g, " ").trim();
const esCancelar = t => /^(cancelar|cancela|cancelalo|cancel|fue un error|error|me equivoque|no)$/.test(sinTildes(limpio(t)));
const esCierreGrupo = t => /^(ok+|okey|okay|listo|lista|fin|termine)$/.test(sinTildes(limpio(t)));
const esCambioOperativo = t => /^(cambiar\s+(de\s+)?)?operativos?$/.test(limpio(t));
const resumen = n => `${n} ${n === 1 ? "foto" : "fotos"}`;
const esperar = ms => new Promise(r => setTimeout(r, ms));
const OTRO = "Mandame otro vehículo cuando quieras.";

// Hora de envío del mensaje (según WhatsApp), en segundos. Se usa para ubicar
// fotos que llegan desordenadas: toda foto enviada antes del cierre va al vehículo
// que estaba abierto en ese momento, aunque el bot la reciba después.
const horaDe = m => Number(m.timestamp || Math.floor(Date.now() / 1000));

async function leerSesion(env, numero) {
  const s = await fsGet(env, `bot_sesiones/${numero}`);
  if (!s) return null;
  if (Date.now() - Number(s.ts || 0) > SESION_HORAS * 3600 * 1000) return null;
  return s;
}
const abierta = s => !!(s?.vid && !s.cerradaEn);

// Operativo "fijo" de cada número: donde se crean los vehículos nuevos
async function operativoFijo(env, numero, uid) {
  let o = await fsGet(env, `bot_operativo/${numero}`);
  // Si el operativo se eligió en la app después que en el bot, manda el de la app
  const u = uid ? await fsGet(env, `users/${uid}`).catch(() => null) : null;
  if (u?.activeCompanyId && Number(u.activeCompanyAt || 0) > Number(o?.ts || 0)) o = { cid: u.activeCompanyId, operativo: "" };
  if (!o?.cid) return null;
  const c = await fsGet(env, `companies/${o.cid}`);
  if (!c || (uid && !(c.members || []).includes(uid))) return null;   // ya no es miembro
  return { cid: o.cid, operativo: c.name || o.operativo };
}
const fijarOperativo = (env, numero, op) => fsSet(env, `bot_operativo/${numero}`, { cid: op.cid, operativo: op.operativo, ts: Date.now() });

async function listaOperativos(env, uid) {
  if (!uid) return [];
  return (await fsQuery(env, "", "companies", { field: "members", op: "ARRAY_CONTAINS", value: uid }, 50))
    .map(o => ({ cid: o.__ruta.split("/")[1], operativo: o.name || "Operativo" }))
    .sort((a, b) => a.operativo.localeCompare(b.operativo)).slice(0, 20);
}
const menuOperativos = ops => ops.map((o, i) => `${i + 1}. ${o.operativo}`).join("\n") + "\n\n0. Cancelar";

// ── Tanda: vehículos cargados desde el último OK ──────────────
// La sesión guarda la lista de vehículos de la tanda y un contador de fotos por
// vehículo (campo n_<id>). El bot no responde nada hasta el OK: ahí manda un
// resumen de todos.
const campoConteo = vid => `n_${vid}`;

// Cierra el vehículo abierto sin avisar (al pasar a otro vehículo)
const cerrarEnSilencio = (env, numero, hora) => fsMerge(env, `bot_sesiones/${numero}`, { cerradaEn: hora, ts: Date.now() });

// OK: cierra, espera a que terminen de guardarse las últimas fotos y arma el resumen
async function resumenDeTanda(env, numero, sesion, hora) {
  if (abierta(sesion)) await cerrarEnSilencio(env, numero, hora);
  await esperar(Number(env.ESPERA_CIERRE_MS ?? 4000));
  const s = (await fsGet(env, `bot_sesiones/${numero}`)) || sesion || {};
  const tanda = s.tanda || [];
  const lineas = tanda.map(v => `✅ Listo ${v.etiqueta}${v.operativo ? ` → ${v.operativo}` : ""}`);
  // Nueva tanda. Se conserva el último vehículo como "anterior" para fotos que lleguen tarde.
  const ant = anteriorDe({ ...s, cerradaEn: s.cerradaEn || hora }, hora);
  await fsSet(env, `bot_sesiones/${numero}`, { ts: Date.now(), ...(ant ? { anterior: ant } : {}) });
  return (lineas.length ? lineas.join("\n") : "👌 No había vehículos abiertos.") + `\n\n${OTRO}`;
}

// Ficha del vehículo (se usa en la ayuda)
function fichaVehiculo(v) {
  const l = [`🚗 *Vehículo:* ${v.modelo || "sin modelo cargado"}`, `🔢 *Patente:* ${v.patente}`, `🏢 *Operativo:* ${v.operativo}`];
  if (v.compania) l.push(`🛡️ *Compañía:* ${v.compania}`);
  if (v.telefono) l.push(`📞 *Teléfono:* ${v.telefono}`);
  if (v.localidad) l.push(`📍 *Localidad:* ${v.localidad}`);
  if (v.grado) l.push(`🌨️ *Grado:* ${v.grado}`);
  return l.join("\n");
}

// Confirmación silenciosa: tilde en el mensaje del usuario
const tilde = (env, m) => reaccionar(env, dest(m), m.id, "✅", m._key);

async function alRecibirTexto(env, m, quien, texto) {
  const numero = quien.numero;
  const grupo = !!m._grupo, mencion = mencionaBot(texto);
  const sinMencion = quitarMencion(texto).replace(ABIERTO_G, " ").trim();
  const t = limpio(texto);
  const hora = horaDe(m);
  const s = await leerSesion(env, numero);

  // "!resumendiario": este chat recibe todos los días a las 20 hs el resumen de los peritados del día
  const cmdRes = String(texto).trim().match(/^!\s*resumen\s*diario\b\s*(.*)$/i);
  if (cmdRes) return comandoResumenDiario(env, m, quien, cmdRes[1]);

  // Grupos: "@abierto" deja el vehículo abierto para que cualquiera del grupo mande las fotos
  const pideAbierto = grupo && ABIERTO.test(texto);
  if (grupo && CERRADO.test(texto)) {
    const g = await grupoAbierto(env, m);
    if (!g) return;
    await fsDelete(env, `bot_grupos/${idGrupo(m)}`);
    return reaccionar(env, dest(m), m.id, "🆗", m._key);
  }
  if (pideAbierto && !buscarPatenteEnTexto(texto)) {
    if (!abierta(s)) return responder(env, dest(m), "📌 Primero mandá los datos del vehículo (con la patente) y después *@abierto* (o *@a*).");
    return abrirParaGrupo(env, m, s);
  }

  // Cancelar la carga en curso (cada persona cancela solo lo suyo, también en grupos)
  if (abierta(s) && esCancelar(sinMencion)) {
    const g = grupo ? await grupoAbierto(env, m) : null;
    if (g?.vid === s.vid) await fsDelete(env, `bot_grupos/${idGrupo(m)}`);
    return responder(env, dest(m), await cancelarCarga(env, numero, s, quien));
  }

  // En grupos solo se saluda/ayuda si le hablan al bot ("hola desabollito", "@desabollito", "bot")
  if (!grupo || mencion) {
    if (esSaludo(sinMencion) || (grupo && mencion && !limpio(sinMencion))) return responder(env, dest(m), saludoHora(quien));
    if (esAyuda(sinMencion)) return responder(env, dest(m), AYUDA);
  }

  // Solo el creador: "operativoall" → elige un usuario y le cambia el operativo actual del bot
  if (!grupo && quien.username === CREADOR) {
    const r = await operativoAll(env, numero, s, t);
    if (r) return responder(env, dest(m), r);
  }

  // Comando: cambiar de operativo (en grupos, solo la palabra "operativo" sola)
  if (grupo ? limpio(sinMencion) === "operativo" : esCambioOperativo(texto)) {
    const ops = await listaOperativos(env, quien.uid);
    if (!ops.length) return responder(env, dest(m), "No hay operativos creados en la app todavía.");
    const fijo = await operativoFijo(env, numero, quien.uid);
    await fsMerge(env, `bot_sesiones/${numero}`, { elegirOperativo: ops, ts: Date.now() });
    return responder(env, dest(m), (fijo ? `🏢 Operativo actual: *${fijo.operativo}*\n\n` : "") +
      "¿En qué operativo cargo los vehículos nuevos? Respondé con el número:\n\n" + menuOperativos(ops));
  }

  const numeroElegido = /^\d{1,2}$/.test(t) ? Number(t) : null;
  const cancela = t === "0" || t === "cancelar" || t === "no";

  // Respuesta al comando "operativo"
  if (s?.elegirOperativo?.length && (numeroElegido !== null || cancela)) {
    await fsMerge(env, `bot_sesiones/${numero}`, { elegirOperativo: null });
    if (cancela) return responder(env, dest(m), "👌 Sigo con el mismo operativo.");
    const op = s.elegirOperativo[numeroElegido - 1];
    if (!op) return responder(env, dest(m), `Elegí un número del 1 al ${s.elegirOperativo.length}.`);
    await fijarOperativo(env, numero, op);
    return responder(env, dest(m), `🏢 Listo: los vehículos nuevos van a *${op.operativo}*.\n\nEnviame los datos del vehículo.`);
  }

  // Patente nueva sin operativo elegido: ¿dónde la creo?
  if (s?.crear?.datos?.patente && (numeroElegido !== null || cancela)) {
    if (cancela) {
      await fsMerge(env, `bot_sesiones/${numero}`, { crear: null });
      return responder(env, dest(m), `👌 No creé ${s.crear.datos.patente}. ${OTRO}`);
    }
    const op = s.crear.operativos[numeroElegido - 1];
    if (!op) return responder(env, dest(m), `Elegí un número del 1 al ${s.crear.operativos.length}, o 0 para cancelar.`);
    if (await esDesm(env, op.cid, quien.uid)) { await fsMerge(env, `bot_sesiones/${numero}`, { crear: null }); return responder(env, dest(m), NO_DESM); }
    await fijarOperativo(env, numero, op);
    const nuevo = await crearVehiculo(env, op, s.crear.datos, quien);
    await abrir(env, numero, nuevo, hora, s, true);
    return tilde(env, m);
  }

  // Patente repetida en varios operativos: ¿cuál?
  if (s?.opciones?.length && numeroElegido !== null) {
    const v = s.opciones[numeroElegido - 1];
    if (!v) return responder(env, dest(m), `Elegí un número del 1 al ${s.opciones.length}.`);
    await abrirExistente(env, numero, v, s.datos || {}, hora, s, false, quien);
    return v.fotos ? responder(env, dest(m), `⚠️ ${etiqueta(v)} ya tiene ${resumen(v.fotos)} subidas. Si mandás más, se suman a esas.`) : tilde(env, m);
  }

  // "AB123CD asegurado?" → solo el nombre del asegurado según la planilla
  const patAseg = /asegurad|nombre/i.test(sinMencion) ? buscarPatenteEnTexto(sinMencion) : null;
  if (patAseg && (sinMencion.slice(0, patAseg.desde) + " " + sinMencion.slice(patAseg.desde + patAseg.largo)).replace(/[¿?!.,:]/g, " ").trim().split(/\s+/)
      .filter(w => w && !/^(el|la|de|del|quien|quién|es|cual|cuál|asegurad\w*|nombre|decime|dame|pasame)$/i.test(w)).length === 0) {
    const patente = buscarPatenteEnTexto(sinMencion).patente;
    const n = await aseguradoDePadron(env, patente);
    if (n) return responder(env, dest(m), n);
    return responder(env, dest(m), `No encontré *${patente}* en la planilla de asegurados.`);
  }

  // Repuestos: "repuestos AB123CD" / "localizá repuesto AB123CD" → lista con estados y opciones
  const pideRep = sinMencion.match(RE_PIDE_REP);
  if (pideRep && buscarPatenteEnTexto(pideRep[1])) {
    const patente = buscarPatenteEnTexto(pideRep[1]).patente;
    const encontrados = await buscarPatente(env, patente, quien.uid);
    if (!encontrados.length) return responder(env, dest(m), `🔎 No encontré la patente *${patente}*.`);
    const e = encontrados[0];
    const v = await fsGet(env, `companies/${e.cid}/vehicles/${e.vid}`);
    if (!v || v.deleted) return responder(env, dest(m), `🔎 No encontré la patente *${patente}*.`);
    const op = e.operativo || (await fsGet(env, `companies/${e.cid}`).catch(() => null))?.name || "";
    await fsMerge(env, `bot_sesiones/${numero}`, { repuestosDe: { cid: e.cid, vid: e.vid, op, t: Date.now() } });
    return responder(env, dest(m), textoRepuestos(v, op));
  }
  // Respuesta mientras se ven los repuestos (5 minutos): solo "número + estado" (ej: "1 recibido").
  // Cualquier otra cosa, o pasado el tiempo, el bot se olvida en silencio y el mensaje sigue su curso normal.
  if (s?.repuestosDe) {
    const { cid, vid, op } = s.repuestosDe, ruta = `companies/${cid}/vehicles/${vid}`;
    const cambia = Date.now() - Number(s.repuestosDe.t || 0) < 5 * 60_000 && sinMencion.trim().match(/^(\d{1,2})[\s.:)-]+(.+)$/);
    const fase = cambia && faseDeTexto(cambia[2]);
    const v = fase ? await fsGet(env, ruta) : null;
    const items = v && !v.deleted ? itemsRep(v.repuestos) : [];
    const item = fase ? items[Number(cambia[1]) - 1] : null;
    if (!item) {
      await fsMerge(env, `bot_sesiones/${numero}`, { repuestosDe: null }).catch(() => {});
      // Dentro de los 5 minutos, lo que no sea "número + estado" (ni otra patente) se ignora en silencio
      if (Date.now() - Number(s.repuestosDe.t || 0) < 5 * 60_000 && !buscarPatenteEnTexto(texto) && !abierta(s)) return;
    } else if (await esDesm(env, cid, quien.uid)) {
      await fsMerge(env, `bot_sesiones/${numero}`, { repuestosDe: null }).catch(() => {});
      return responder(env, dest(m), NO_DESM);
    } else {
      await fsMerge(env, ruta, { etapasRepuestos: { ...(v.etapasRepuestos || {}), [claveRep(item)]: fase }, updatedBy: `whatsapp:${numero}` });
      await fsAppend(env, ruta, "historial", { t: Date.now(), uid: quien.uid || "", por: quien.nombre || quien.numero, txt: `${item}: ${FASES_REP.find(f => f[0] === fase)[1]}` }).catch(() => {});
      await fsMerge(env, `bot_sesiones/${numero}`, { repuestosDe: { ...s.repuestosDe, t: Date.now() } });
      return responder(env, dest(m), "✅ Actualizado\n\n" + textoRepuestos(await fsGet(env, ruta), op));
    }
  }

  // "xlsx" → formulario de la planilla Mercantil; la respuesta completa → el .xlsx
  if (s?.xlsxForm?.t && Date.now() - s.xlsxForm.t < VENTANA_XLSX && esFormXlsx(texto))
    return completarFormXlsx(env, m, quien, texto, s.xlsxForm);
  if (/(^|\s)\.?xlsx\b/i.test(sinMencion)) return pedirFormXlsx(env, m, quien, sinMencion);

  // "Turnos hoy", "¿Qué viene hoy?", "Autos hoy"… → turnos de hoy, un auto por línea
  // En grupos solo si le hablan al bot (@desabollito o "bot")
  if ((!grupo || mencion) && esTurnosHoy(sinMencion || texto) && !buscarPatenteEnTexto(texto))
    return responder(env, dest(m), await textoTurnosHoy(env, numero, quien.uid));

  // Localizar: "Localizá NTK100" → detalle del vehículo por escrito + link (sin vista previa).
  // "Localizá" solo → el vehículo que está abierto.
  const soloLocalizar = /^(localiz[aá]|localizalo|ubic[aá]|ubicalo|ubicame)$/i.test(sinTildes(limpio(sinMencion || texto)));
  if (esLocalizar(sinMencion || texto) && (buscarPatenteEnTexto(texto) || soloLocalizar)) {
    let encontrados;
    if (buscarPatenteEnTexto(texto)) {
      const patente = buscarPatenteEnTexto(texto).patente;
      encontrados = await buscarPatente(env, patente, quien.uid);
      if (!encontrados.length) return responder(env, dest(m), `🔎 No encontré la patente *${patente}*.`);
    } else {
      if (!abierta(s)) return responder(env, dest(m), "Decime la patente, por ejemplo: *localizá AB123CD*");
      encontrados = [{ cid: s.cid, vid: s.vid, operativo: s.operativo || "" }];
    }
    const textos = [];
    for (const e of encontrados.slice(0, 5)) {
      const v = await fsGet(env, `companies/${e.cid}/vehicles/${e.vid}`);
      const op = e.operativo || (await fsGet(env, `companies/${e.cid}`).catch(() => null))?.name || "";
      if (v && !v.deleted) textos.push(detalleVehiculo(v, op) + `\n${APP_URL}/#/o/${e.cid}/v/${e.vid}`);
    }
    return responder(env, dest(m), textos.join("\n\n———\n\n") || "🔎 No lo encontré.");
  }

  // Datos de un vehículo (tiene patente). Si nombra un operativo, se usa ese.
  const patenteEnTexto = buscarPatenteEnTexto(texto);
  // (el operativo solo se cambia con el comando "operativo"; nombres en el mensaje no lo cambian)
  // "agregar/añadir AB123CD …": suma los datos a un vehículo ya cargado (no crea uno nuevo)
  if (RE_AGREGAR.test(sinMencion) && buscarPatenteEnTexto(sinMencion)) {
    const fijoA = await operativoFijo(env, numero, quien.uid);
    if (fijoA && await esDesm(env, fijoA.cid, quien.uid)) return responder(env, dest(m), NO_DESM);
    const extra = interpretar(sinMencion.replace(RE_AGREGAR, " "));
    const r = await agregarAVehiculo(env, numero, extra, hora, s, quien);
    await recordarMensaje(env, m, numero, sinMencion, extra.patente, true).catch(() => {});
    return responder(env, dest(m), r);
  }

  const datos = interpretar(sinMencion);
  if (datos.patente) {
    const r = await abrirModoDesm(env, numero, quien, sinMencion, datos, hora);
    if (r?.msg) return responder(env, dest(m), r.msg);
    if (r?.ok) return tilde(env, m);
  }
  // Ventana de desmontaje abierta: todo el texto va a la nota de desmontaje (salvo "ok", que cierra)
  if (!datos.patente && s?.desm && abierta(s)) {
    if (await ventanaDesm(env, numero, s, hora)) {
      if (!(grupo ? esCierreGrupo(texto) : esCierre(texto))) {
        await notaDesm(env, s.desm.cid, s.desm.vid, quien, sinMencion.trim(), loteWa(numero, s));
        return tilde(env, m);
      }
    } else if (!grupo) return responder(env, dest(m), `⏱️ Pasaron 5 minutos y se cerró *${s.patente}*. Mandá la patente de nuevo para seguir cargando el desmontaje.`);
    else return;
  }
  if (datos.patente) try {
    // Si el vehículo abierto se borró desde la app, no se sigue cargando ahí: se crea de nuevo
    const sigue = abierta(s) && s.patente === datos.patente ? await fsGet(env, `companies/${s.cid}/vehicles/${s.vid}`) : null;
    if (sigue && !sigue.deleted) {
      if (await esDesm(env, s.cid, quien.uid)) await notaDesm(env, s.cid, s.vid, quien, notaDe(sinMencion, datos.patente), loteWa(numero, s));
      else await actualizarDatos(env, s, datos, quien);
      if (pideAbierto) return abrirParaGrupo(env, m, s);
      return tilde(env, m);
    }
    if (abierta(s)) await cerrarEnSilencio(env, numero, hora);
    const pregunta = await prepararVehiculo(env, numero, datos, hora, await leerSesion(env, numero), quien);
    if (pregunta) return responder(env, dest(m), pregunta);
    { const s2 = await leerSesion(env, numero);
      if (abierta(s2) && s2.patente === datos.patente && await esDesm(env, s2.cid, quien.uid))
        await notaDesm(env, s2.cid, s2.vid, quien, notaDe(sinMencion, datos.patente), loteWa(numero, s2)); }
    if (pideAbierto) { const s2 = await leerSesion(env, numero); if (abierta(s2)) return abrirParaGrupo(env, m, s2); }
    return tilde(env, m);
  } finally { await recordarMensaje(env, m, numero, sinMencion, datos.patente).catch(() => {}); }

  // Texto sin patente: OK (o cualquier texto después de mandar fotos) → resumen de la tanda
  const fotosDelActual = abierta(s) ? Number(s[campoConteo(s.vid)] || 0) : 0;
  // En grupos solo cierra un OK explícito; en privado, cualquier texto después de las fotos
  if ((s?.tanda?.length && (grupo ? esCierreGrupo(texto) : esCierre(texto))) || (!grupo && fotosDelActual > 0)) {
    // El OK de quien lo abrió también cierra el vehículo compartido del grupo
    if (grupo) { const g = await grupoAbierto(env, m); if (g?.por === numero) await fsDelete(env, `bot_grupos/${idGrupo(m)}`); }
    // Sin resumen: el OK solo cierra la tanda (el resumen del día llega a las 20 hs con !resumendiario)
    await resumenDeTanda(env, numero, s, hora);
    return tilde(env, m);
  }
  if (s?.crear?.datos?.patente && !grupo) {
    return responder(env, dest(m), `Respondé con el número del operativo donde creo *${s.crear.datos.patente}*, o 0 para cancelar.`);
  }
  if (abierta(s)) return; // vehículo abierto: el bot espera en silencio
  if (grupo) return mencion ? responder(env, dest(m), saludoHora(quien)) : undefined; // charla del grupo: silencio
  if (esCierre(texto)) return responder(env, dest(m), "👌 " + OTRO);
  return responder(env, dest(m), "No encontré una patente en tu mensaje 🤔\n\nEnviame los datos del vehículo, por ejemplo:\n_Corolla AB099BA Riv 1137709755 Monte_\n\nO escribí *ayuda*.");
}

// Busca la patente: si existe la abre (y completa los datos nuevos); si no, la crea
// en el operativo nombrado o en el último usado. Devuelve un texto solo si hay que
// preguntarle algo al usuario; si no, null (el bot solo marca la tilde).
async function prepararVehiculo(env, numero, datos, hora, previa, quien) {
  const encontrados = await buscarPatente(env, datos.patente, quien?.uid);
  // Prioridad: operativo nombrado en el mensaje → último operativo usado → preguntar
  const mencionado = null;
  const fijo = await operativoFijo(env, numero, quien?.uid);
  delete datos.operativo;

  if (encontrados.length) {
    const v = encontrados.length === 1 ? encontrados[0] : encontrados.find(x => x.cid === fijo?.cid);
    if (!v) {
      await fsMerge(env, `bot_sesiones/${numero}`, { opciones: encontrados.slice(0, 9), datos, ts: Date.now() });
      return `La patente *${datos.patente}* está en más de un operativo. ¿Cuál es? Respondé con el número:\n\n` +
        encontrados.slice(0, 9).map((x, i) => `${i + 1}. ${x.operativo} · ${x.modelo || "sin modelo"}`).join("\n");
    }
    // Si la patente ya existe en otro operativo distinto del nombrado, se usa esa (no se duplica)
    await abrirExistente(env, numero, v, datos, hora, previa, false, quien);
    return v.fotos ? `⚠️ ${etiqueta(v)} ya tiene ${resumen(v.fotos)} subidas. Si mandás más, se suman a esas.` : null;
  }

  if (fijo && await esDesm(env, fijo.cid, quien?.uid)) return `🔎 No encontré la patente *${datos.patente}* en *${fijo.operativo}*.\n\n${NO_DESM}`;
  if (fijo) {
    const nuevo = await crearVehiculo(env, fijo, datos, quien);
    await abrir(env, numero, nuevo, hora, previa, true);
    return null;
  }

  const todosOps = await listaOperativos(env, quien?.uid);
  const operativos = [];
  for (const o of todosOps) if (!(await esDesm(env, o.cid, quien?.uid))) operativos.push(o);
  if (todosOps.length && !operativos.length) return `🔎 No encontré la patente *${datos.patente}*.\n\n${NO_DESM}`;
  if (!operativos.length) return "No sos parte de ningún operativo todavía. Pedile a un administrador que te sume desde la app.";
  await fsMerge(env, `bot_sesiones/${numero}`, { crear: { datos, operativos }, ts: Date.now() });
  return `🔎 La patente *${datos.patente}* no está cargada.\n\n¿En qué operativo la creo? Respondé con el número:\n\n` + menuOperativos(operativos);
}

async function abrirExistente(env, numero, v, datos, hora, previa, fijar = true, quien = null) {
  if (!(await esDesm(env, v.cid, quien?.uid))) await actualizarDatos(env, v, datos, quien);
  await abrir(env, numero, v, hora, previa, false);
  // El operativo del vehículo abierto pasa a ser el actual (salvo que se haya nombrado otro)
  if (fijar) await fijarOperativo(env, numero, v);
}

const RE_AGREGAR = /(^|\s)(?:agreg(?:a|ar|á|ale|alo|ame|ale|ue)?|a[nñ]ad(?:ir|i|í|e|ile|ilo|ime|a))(?=\s|$|[:,.])/i;

// ── Mensajes editados (solo número propio / Evolution) ──
// Se guarda qué mensaje cargó o modificó cada vehículo; si después se edita, se aplican solo los cambios.
async function recordarMensaje(env, m, numero, texto, patente, agregar = false) {
  if (!String(m.id || "").startsWith("evo_") || !patente) return;
  const s = await leerSesion(env, numero);
  if (!s?.vid || s.patente !== patente) return;
  await fsSet(env, `bot_ediciones/${m.id}`, { texto, numero, cid: s.cid, vid: s.vid, agregar, to: dest(m), ts: Date.now(),
    ...(m._secreto ? { secreto: m._secreto, jids: m._jids || [] } : {}) });
}

// Busca dentro del evento el aviso de edición: { id original, texto nuevo }
export function edicionDe(d) {
  let hallado = null;
  // WhatsApp nuevo: la edición llega cifrada con el secreto del mensaje original
  const sem = d?.message?.secretEncryptedMessage;
  if (sem?.targetMessageKey?.id && sem.encPayload && Number(sem.secretEncType ?? 2) === 2) {
    return { id: "evo_" + String(sem.targetMessageKey.id).replace(/[^A-Za-z0-9_-]/g, ""), origId: String(sem.targetMessageKey.id),
      enc: { payload: b64DeBytes(sem.encPayload), iv: b64DeBytes(sem.encIv) }, jids: jidsDe(d) };
  }
  const ver = (o, prof = 0) => {
    if (hallado || !o || typeof o !== "object" || prof > 8) return;
    const pm = o.protocolMessage || (o.editedMessage && o.key?.id && !o.editedMessage.message?.protocolMessage ? o : null);
    if (pm?.editedMessage && pm.key?.id) {
      const e = pm.editedMessage;
      const texto = e.conversation || e.extendedTextMessage?.text || e.imageMessage?.caption || e.documentMessage?.caption || e.message?.conversation || e.message?.extendedTextMessage?.text;
      if (texto) { hallado = { id: "evo_" + String(pm.key.id).replace(/[^A-Za-z0-9_-]/g, ""), texto: String(texto) }; return; }
    }
    for (const v of Object.values(o)) ver(v, prof + 1);
  };
  ver(d);
  return hallado;
}

async function alEditarMensaje(env, e) {
  const rec = await fsGet(env, `bot_ediciones/${e.id}`);
  if (!rec?.vid) return;
  { const cta = await fsGet(env, `bot_numeros/${rec.numero}`).catch(() => null);
    if (await esDesm(env, rec.cid, cta?.uid)) return; }
  if (e.enc) {
    const diag = {};
    e.texto = await descifrarEdicion(rec, e, diag);
    if (!e.texto) {
      await fsMerge(env, `bot_ediciones/${e.id}`, { fallo: { payload: e.enc.payload, iv: e.enc.iv, jids: e.jids, origId: e.origId || "" } }).catch(() => {});
      await registrar(env, { ultimoError: `${new Date().toISOString()} · Edición cifrada no descifrada · ${diag.largos} · ${diag.ok || "clave no coincide"} · ${JSON.stringify(rec.jids || [])} / ${JSON.stringify(e.jids)}` }).catch(() => {});
      return;
    }
  }
  const hash = [...e.texto].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  if (!(await primeraVez(env, `edit_${e.id}_${hash}`))) return;
  const limpiar = t => { let x = quitarMencion(t).replace(ABIERTO_G, " ").trim(); return rec.agregar ? x.replace(RE_AGREGAR, " ") : x; };
  const viejo = interpretar(limpiar(rec.texto)), nuevo = interpretar(limpiar(e.texto));
  if (!nuevo.patente) return;
  const ruta = `companies/${rec.cid}/vehicles/${rec.vid}`;
  const v = await fsGet(env, ruta);
  if (!v || v.deleted) return;
  const cambios = {}, nombres = [];
  const igual = (a, b) => sinTildes(String(a ?? "")) === sinTildes(String(b ?? ""));

  if (nuevo.patente !== viejo.patente && v.patente === viejo.patente) { cambios.patente = nuevo.patente; nombres.push("patente"); }
  const padron = await aseguradoDePadron(env, cambios.patente || v.patente);
  for (const [k, nombre, vacio] of [["modelo", "modelo", ""], ["compania", "compañía", ""], ["telefono", "teléfono", ""], ["asegurado", "cliente", ""], ["grado", "grado", null], ["precio", "precio", 0]]) {
    if (k === "asegurado" && padron) continue;
    if (igual(nuevo[k], viejo[k])) continue;
    // Si se borró del mensaje, solo se borra si en la app sigue el valor viejo
    if (!nuevo[k] && !igual(v[k], viejo[k])) continue;
    const nv = nuevo[k] || vacio;
    if (!igual(v[k], nv)) { cambios[k] = nv; nombres.push(nombre); }
  }
  const oO = viejo.observaciones || "", nO = nuevo.observaciones || "";
  if (oO !== nO) {
    const cur = String(v.observaciones || "");
    let r = oO && cur.includes(oO) ? cur.replace(oO, nO) : nO && !cur.includes(nO) ? [cur, nO].filter(Boolean).join("\n") : cur;
    r = r.split("\n").map(x => x.trimEnd()).filter(x => x.trim()).join("\n");
    if (r !== cur) { cambios.observaciones = r; nombres.push("detalles"); }
  }
  for (const [k, nombre] of [["repuestos", "repuestos"], ["pintura", "pintura"]]) {
    const vi = itemsRep(viejo[k]).map(sinTildes), nu = itemsRep(nuevo[k]);
    const nuK = nu.map(sinTildes);
    const cur = itemsRep(v[k]);
    let r = cur.filter(x => !(vi.includes(sinTildes(x)) && !nuK.includes(sinTildes(x))));
    nu.forEach(x => { if (!r.some(y => sinTildes(y) === sinTildes(x))) r.push(x); });
    if (r.join(", ") !== cur.join(", ")) { cambios[k] = r.join(", "); nombres.push(nombre); }
  }
  const pv = Object.keys(viejo.piezas || {}), pn = Object.keys(nuevo.piezas || {});
  const piezas = { ...(v.piezas || {}) };
  pv.filter(k => !pn.includes(k)).forEach(k => delete piezas[k]);
  pn.filter(k => !pv.includes(k)).forEach(k => { piezas[k] = true; });
  if (JSON.stringify(Object.keys(piezas).filter(k => piezas[k]).sort()) !== JSON.stringify(Object.keys(v.piezas || {}).filter(k => v.piezas[k]).sort())) {
    cambios.piezas = piezas; nombres.push("paños");
  }

  await fsMerge(env, `bot_ediciones/${e.id}`, { texto: e.texto, ts: Date.now() });
  if (!nombres.length) return;
  const cuenta = await fsGet(env, `bot_numeros/${rec.numero}`).catch(() => null);
  await fsMerge(env, ruta, { ...cambios, updatedBy: `whatsapp:${rec.numero}` });
  await fsAppend(env, ruta, "historial", { t: Date.now(), uid: cuenta?.uid || "", por: cuenta?.name || rec.numero, txt: `Editó ${nombres.join(", ")} por WhatsApp` }).catch(() => {});
  if (cambios.patente) {
    const s = await leerSesion(env, rec.numero);
    if (s?.vid === rec.vid) await fsMerge(env, `bot_sesiones/${rec.numero}`, { patente: cambios.patente });
  }
  const etq = `*${cambios.modelo || v.modelo || "Vehículo"}* (${cambios.patente || v.patente})`;
  return responder(env, rec.to || destinoNumero(env, rec.numero), `✏️ Actualicé ${nombres.join(", ")} de ${etq}.`);
}

// Descifra una edición (AES-GCM con clave HKDF del secreto del mensaje original, igual que WhatsApp)
export async function descifrarEdicion(rec, e, diag = {}) {
  const secreto = aBytes(rec.secreto), payload = aBytes(e.enc.payload), iv = aBytes(e.enc.iv);
  diag.largos = `sec ${secreto?.length} payload ${payload?.length} iv ${iv?.length}`;
  if (!secreto || !payload || !iv) return null;
  const te = new TextEncoder(), id = e.origId || e.id.replace(/^evo_/, "");
  const base = await crypto.subtle.importKey("raw", secreto, "HKDF", false, ["deriveBits"]);
  const jids = [...new Set([...(rec.jids || []), ...(e.jids || [])])];
  for (const o of jids) for (const mo of jids) for (const ad of [`${id}\0${mo}`, null, `${id}\0${o}`]) {
    let plano;
    try {
      const info = te.encode(id + o + mo + "Message Edit");
      const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info }, base, 256);
      const k = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
      plano = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, ...(ad ? { additionalData: te.encode(ad) } : {}) }, k, payload));
    } catch { continue; }
    diag.ok = `${o} / ${mo} / ad ${ad ? "sí" : "no"} · ${[...plano.slice(0, 80)].map(x => x.toString(16).padStart(2, "0")).join("")}`;
    const t = textoDeProto(plano);
    if (t) return t;
  }
  return null;
}

// Lector mínimo de protobuf: busca el texto en conversation (1), extendedTextMessage.text (6.1),
// caption de imagen/documento, protocolMessage.editedMessage (12.14) o mensajes anidados
function campos(b) {
  const out = []; let i = 0;
  const varint = () => { let r = 0, sh = 0, c; do { c = b[i++]; r += (c & 127) * 2 ** sh; sh += 7; } while (c & 128 && i < b.length); return r; };
  while (i < b.length) {
    const tag = varint(), f = Math.floor(tag / 8), w = tag & 7;
    if (!f) return null;
    if (w === 0) varint(); else if (w === 1) i += 8; else if (w === 5) i += 4;
    else if (w === 2) { const n = varint(); if (i + n > b.length) return null; out.push([f, b.subarray(i, i + n)]); i += n; }
    else return null;
  }
  return i === b.length ? out : null;
}
export function textoDeProto(b, prof = 0) {
  const cs = campos(b);
  if (!cs || prof > 6) return null;
  const td = new TextDecoder("utf-8", { fatal: true });
  const str = x => { try { return td.decode(x); } catch { return null; } };
  const de = n => cs.filter(([f]) => f === n).map(([, v]) => v);
  const texto = t => t && t.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t) && !/^[\w.:-]+@[\w.]+$/.test(t);
  for (const v of de(1)) { const t = str(v); if (texto(t)) return t; }
  for (const v of de(6)) { const t = campos(v)?.find(([f]) => f === 1); if (t && str(t[1])) return str(t[1]); }
  for (const [n, c] of [[3, 3], [7, 3]]) for (const v of de(n)) { const t = campos(v)?.find(([f]) => f === c); if (t && str(t[1])) return str(t[1]); }
  for (const [f, v] of cs) { if (f === 1) continue; const t = textoDeProto(v, prof + 1); if (t) return t; }
  return null;
}

// ── Rol Desmontaje: solo carga fotos y notas de desmontaje a vehículos ya cargados ──
const rolCache = new Map();
async function rolEn(env, cid, uid) {
  if (!cid || !uid) return "";
  let c = rolCache.get(cid);
  if (!c || Date.now() - c.t > 60_000) {
    const comp = await fsGet(env, `companies/${cid}`).catch(() => null);
    c = { t: Date.now(), roles: comp?.roles || {} }; rolCache.set(cid, c);
  }
  return c.roles[uid] || "";
}
const esDesm = async (env, cid, uid) => (await rolEn(env, cid, uid)) === "desmontaje";
const NO_DESM = "🔧 Con el rol *Desmontador* solo podés cargar fotos y notas de desmontaje a vehículos ya cargados.";
const RE_DESM = /(^|\s)desmont(?:aje|ado|ada|e|ar)\b/i, RE_DESM_G = /(^|\s)desmont(?:aje|ado|ada|e|ar)\b/gi;
const VENTANA_DESM = 300;   // segundos: después de la patente, 5 minutos para fotos y texto de desmontaje

// Modo desmontaje: lo usa el rol Desmontador siempre, y cualquiera que escriba "desmontaje" con la patente.
// Abre el vehículo (sin cambiar sus datos ni crear vehículos), corta el anterior y da 5 minutos
// para mandar fotos y texto, que van a la sección Desmontaje. Devuelve null si no corresponde.
async function abrirModoDesm(env, numero, quien, texto, datos, hora) {
  // La palabra cuenta solo fuera de "detalle: …" y sin "no" adelante ("Detalle: NO DESMONTAR TECHO" es un dato)
  const antes = String(texto || "").split(/(?:^|\s)(?:detalles?|adicional(?:es)?|observaci[oó]n(?:es)?|obs|repuestos?|pintura)\b/i)[0];
  const kw = RE_DESM.test(antes) && !/(^|\s)no\s+desmont/i.test(antes);
  const enc = await buscarPatente(env, datos.patente, quien.uid);
  const fijo = await operativoFijo(env, numero, quien.uid);
  const e = enc.find(x => x.cid === fijo?.cid) || enc[0];
  const rol = e ? await esDesm(env, e.cid, quien.uid) : fijo ? await esDesm(env, fijo.cid, quien.uid) : false;
  if (!kw && !rol) return null;
  if (!e && !rol) return null;   // no existe y no es desmontador: se carga normal
  if (!e) return { msg: `🔎 No encontré la patente *${datos.patente}*.` + (rol ? `\n\n${NO_DESM}` : "") };
  const s = await leerSesion(env, numero);
  if (abierta(s)) await cerrarEnSilencio(env, numero, hora - 1);   // otra patente corta la anterior
  await abrir(env, numero, e, hora, await leerSesion(env, numero), false);
  await fsMerge(env, `bot_sesiones/${numero}`, { desm: { cid: e.cid, vid: e.vid, hasta: hora + VENTANA_DESM } });
  await notaDesm(env, e.cid, e.vid, quien, notaDe(texto.replace(RE_DESM_G, " "), datos.patente), loteWa(numero, { desde: hora }));
  return { ok: true };
}
// ¿Sigue abierta la ventana de desmontaje? Si ya pasaron los 5 minutos, se cierra el vehículo.
async function ventanaDesm(env, numero, s, hora) {
  if (!s?.desm || !abierta(s) || s.vid !== s.desm.vid) return false;
  if (hora <= Number(s.desm.hasta)) return true;
  await fsMerge(env, `bot_sesiones/${numero}`, { cerradaEn: Number(s.desm.hasta), desm: null, ts: Date.now() });
  return false;
}
// Texto del mensaje sin la patente → nota de desmontaje
function notaDe(texto, patente) {
  const p = buscarPatenteEnTexto(texto);
  const t = p ? texto.slice(0, p.desde) + " " + texto.slice(p.desde + p.largo) : texto;
  return t.replace(/\s+/g, " ").trim();
}
async function notaDesm(env, cid, vid, quien, texto, lote) {
  if (!texto) return;
  const ruta = `companies/${cid}/vehicles/${vid}`;
  await fsAppend(env, ruta, "desNotas", { lote, t: Date.now(), texto, uid: quien.uid || "", por: quien.nombre || quien.numero, via: "whatsapp" });
  await fsAppend(env, ruta, "historial", { t: Date.now(), uid: quien.uid || "", por: quien.nombre || "", txt: "Cargó una nota de desmontaje por WhatsApp" }).catch(() => {});
}
const loteWa = (numero, s) => `wa-${numero}-${s?.desde || Math.floor(Date.now() / 1000)}`;

// ── operativoall (solo el creador): ver y cambiar el operativo actual del bot de cada usuario ──
async function operativoAll(env, numero, s, t) {
  const st = s?.opAll;
  if (t === "operativoall" || t === "operativo all") {
    const nums = await fsList(env, "bot_numeros");
    const lista = [];
    for (const d of nums) {
      if (!d.uid) continue;
      const actual = await operativoFijo(env, d.__id, d.uid).catch(() => null);
      lista.push({ numero: d.__id, uid: d.uid, nombre: d.name || d.username || d.__id, user: d.username || "", op: actual?.operativo || "—" });
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!lista.length) return "No hay usuarios con WhatsApp vinculado.";
    await fsMerge(env, `bot_sesiones/${numero}`, { ts: Date.now(), opAll: { paso: "usuario", lista: lista.slice(0, 60), t: Date.now() } });
    return "👥 *Operativo actual de cada usuario*\n\n" + lista.slice(0, 60).map((u, i) => `${i + 1}. ${u.nombre}${u.user ? ` (@${u.user})` : ""} → *${u.op}*`).join("\n") +
      "\n\nRespondé con el número del usuario para cambiarle el operativo, o 0 para salir.";
  }
  if (!st || Date.now() - Number(st.t || 0) > 10 * 60_000 || !/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  if (n === 0) { await fsMerge(env, `bot_sesiones/${numero}`, { opAll: null, ts: Date.now() }); return "👌 Listo."; }
  if (st.paso === "usuario") {
    const u = st.lista[n - 1];
    if (!u) return `Elegí un número del 1 al ${st.lista.length}, o 0 para salir.`;
    const ops = await listaOperativos(env, u.uid);
    if (!ops.length) return `${u.nombre} no está en ningún operativo.`;
    await fsMerge(env, `bot_sesiones/${numero}`, { ts: Date.now(), opAll: { paso: "op", u, ops, lista: st.lista, t: Date.now() } });
    return `🏢 *${u.nombre}* · actual: *${u.op}*\n\n¿A qué operativo lo paso? Respondé con el número:\n\n` + menuOperativos(ops);
  }
  if (st.paso === "op") {
    const op = st.ops[n - 1];
    if (!op) return `Elegí un número del 1 al ${st.ops.length}, o 0 para cancelar.`;
    await fijarOperativo(env, st.u.numero, op);
    await fsMerge(env, `bot_sesiones/${numero}`, { ts: Date.now(), opAll: { paso: "usuario", lista: st.lista.map(x => x.numero === st.u.numero ? { ...x, op: op.operativo } : x), t: Date.now() } });
    return `✅ *${st.u.nombre}* ahora carga en *${op.operativo}*.\n\nRespondé con otro número de usuario, o 0 para salir.`;
  }
  return null;
}

// ── Turnos de hoy ──
export function esTurnosHoy(t) {
  const x = sinTildes(String(t || "")).replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!/\bhoy\b/.test(x) || x.split(" ").length > 7) return false;
  return /\b(vehiculos?|autos?|coches?|turnos?|turnados?|agenda|que (viene|vienen|hay|tenemos|entra|entran)|quien viene|quienes vienen)\b/.test(x);
}
const CIA_CORTA = { "Rivadavia": "Riv", "San Cristóbal": "SC", "Federación": "Fed", "Mercantil Andina": "Merc", "Provincia Seguros": "Prov",
  "Paraná Seguros": "Paraná", "Galicia Seguros": "Galicia", "Nación Seguros": "Nación", "Río Uruguay": "RUS", "La Segunda": "Segunda",
  "La Holando": "Holando", "Cooperación Seguros": "Coop", "Mercantil": "Merc" };
const ciaCorta = c => CIA_CORTA[c] || c || "";
async function textoTurnosHoy(env, numero, uid) {
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  // Solo el operativo actual
  const fijo = await operativoFijo(env, numero, uid);
  if (!fijo?.cid) return "Primero elegí un operativo: escribí *operativo*.";
  const ops = [fijo];
  const lista = [];
  for (const o of ops) {
    const vs = await fsQuery(env, `companies/${o.cid}`, "vehicles", { field: "fechas.turnado", op: "EQUAL", value: hoy }, 100).catch(() => []);
    vs.filter(v => !v.deleted && !v.fechas?.anulado && v.estado !== "anulado").forEach(v => lista.push({ ...v, operativo: o.operativo }));
  }
  if (!lista.length) return `📅 Hoy no hay turnos en *${fijo.operativo}*.`;
  lista.sort((a, b) => String(a.horaTurno || "99").localeCompare(String(b.horaTurno || "99")));
  const linea = v => [v.modelo || "Sin modelo", v.patente, v.grado ? `G${v.grado}` : "", ciaCorta(v.compania)].filter(Boolean).map(x => "`" + x + "`").join(" ");
  return `📅 *Turnos de hoy · ${fijo.operativo}*\n\n` + lista.map(linea).join("\n\n");
}

// "agregar PATENTE …": suma los datos a un vehículo existente. Los textos (detalles, repuestos, pintura)
// se agregan a lo que ya había; paños se suman; el resto se completa o reemplaza.
async function agregarAVehiculo(env, numero, datos, hora, previa, quien) {
  const encontrados = await buscarPatente(env, datos.patente, quien?.uid);
  if (!encontrados.length) return `🔎 No encontré la patente *${datos.patente}*. Para cargarla como nueva, mandá los datos sin "agregar" ni "añadir".`;
  const fijo = await operativoFijo(env, numero, quien?.uid);
  const e = encontrados.find(x => x.cid === fijo?.cid) || encontrados[0];
  const ruta = `companies/${e.cid}/vehicles/${e.vid}`;
  const v = await fsGet(env, ruta);
  if (!v || v.deleted) return `🔎 No encontré la patente *${datos.patente}*.`;
  const nuevos = {}, nombres = [];
  const sumarLista = (viejo, nuevo, sep) => {
    const ya = itemsRep(viejo).map(x => sinTildes(x));
    const agregar = itemsRep(nuevo).filter(x => !ya.includes(sinTildes(x)));
    return agregar.length ? [...itemsRep(viejo), ...agregar].join(sep) : null;
  };
  for (const [k, nombre] of [["repuestos", "repuestos"], ["pintura", "pintura"]]) {
    if (!datos[k]) continue;
    const r = sumarLista(v[k], datos[k], ", ");
    if (r) { nuevos[k] = r; nombres.push(nombre); }
  }
  const obs = [datos.observaciones, datos.otros].filter(Boolean).join("\n");
  if (obs && !String(v.observaciones || "").includes(obs)) { nuevos.observaciones = [v.observaciones, obs].filter(Boolean).join("\n"); nombres.push("detalles"); }
  for (const [k, nombre] of [["modelo", "modelo"], ["compania", "compañía"], ["telefono", "teléfono"], ["asegurado", "cliente"], ["grado", "grado"], ["precio", "precio"]]) {
    if (datos[k] && datos[k] !== v[k]) { nuevos[k] = datos[k]; nombres.push(nombre); }
  }
  const panos = Object.keys(datos.piezas || {}).filter(k => !v.piezas?.[k]);
  if (panos.length) { nuevos.piezas = { ...(v.piezas || {}), ...Object.fromEntries(panos.map(k => [k, true])) }; nombres.push("paños"); }
  const etq = `*${nuevos.modelo || v.modelo || "Vehículo"}* (${v.patente})`;
  // Queda abierto: si después manda fotos, van a este vehículo
  if (abierta(previa) && previa.vid !== e.vid) { await cerrarEnSilencio(env, numero, hora); previa = await leerSesion(env, numero); }
  await abrir(env, numero, { ...e, modelo: nuevos.modelo || v.modelo || "", patente: v.patente }, hora, previa, false);
  if (!nombres.length) return `👌 ${etq} ya tenía esos datos. Si mandás fotos, se suman a ese vehículo.`;
  await fsMerge(env, ruta, { ...nuevos, updatedBy: `whatsapp:${numero}` });
  await fsAppend(env, ruta, "historial", { t: Date.now(), uid: quien?.uid || "", por: quien?.nombre || "", txt: `Agregó ${nombres.join(", ")} por WhatsApp` }).catch(() => {});
  return `✅ Agregué ${nombres.join(", ")} a ${etq}${e.operativo ? ` · ${e.operativo}` : ""}.`;
}

// Completa en la web los datos que vinieron en el mensaje (solo los que cambian)
async function actualizarDatos(env, v, datos, quien) {
  const campos = { modelo: "modelo", compania: "compañía", telefono: "teléfono", grado: "grado", asegurado: "cliente",
    observaciones: "detalles", repuestos: "repuestos", pintura: "pintura", precio: "precio" };
  const nuevos = {}, nombres = [];
  // Si el mensaje es charla, no se pisan datos que ya están ni se guarda el texto como detalle
  let actual = null;
  if (datos.charla) actual = await fsGet(env, `companies/${v.cid}/vehicles/${v.vid}`).catch(() => null);
  for (const [k, nombre] of Object.entries(campos)) {
    if (datos.charla && (k === "observaciones" || (actual?.[k] ?? v[k]))) continue;
    if (datos[k] && datos[k] !== v[k]) { nuevos[k] = datos[k]; nombres.push(nombre); v[k] = datos[k]; }
  }
  // Paños: se suman a los que ya estaban marcados
  if (Object.keys(datos.piezas || {}).length) {
    // Se leen los paños actuales del vehículo (la sesión no los guarda)
    const actual = await fsGet(env, `companies/${v.cid}/vehicles/${v.vid}`);
    v.piezas = actual?.piezas || {};
  }
  const panosNuevos = Object.keys(datos.piezas || {}).filter(k => !v.piezas?.[k]);
  if (panosNuevos.length) {
    nuevos.piezas = { ...(v.piezas || {}), ...Object.fromEntries(panosNuevos.map(k => [k, true])) };
    v.piezas = nuevos.piezas; nombres.push("paños");
  }
  if (nombres.length) {
    await fsMerge(env, `companies/${v.cid}/vehicles/${v.vid}`, nuevos);
    await fsAppend(env, `companies/${v.cid}/vehicles/${v.vid}`, "historial",
      { t: Date.now(), uid: quien?.uid || "", por: quien?.nombre || "", txt: `Actualizó ${nombres.join(", ")} por WhatsApp` }).catch(() => {});
  }
  return nombres;
}

function anteriorDe(p, hora) {
  if (p?.vid) return { cid: p.cid, vid: p.vid, patente: p.patente, modelo: p.modelo || "", operativo: p.operativo || "",
    desde: p.desde || 0, cerradaEn: p.cerradaEn || hora };
  return p?.anterior || null;
}

// Abre un vehículo y lo suma a la tanda. El que estaba antes queda como "anterior"
// para ubicar fotos que se mandaron antes del cambio pero llegan tarde.
// Se usa merge para no borrar los contadores de fotos de la tanda.
async function abrir(env, numero, v, hora, previa, nuevo = false) {
  const anterior = previa?.vid === v.vid && !previa?.cerradaEn ? (previa.anterior || null) : anteriorDe(previa, hora);
  const tanda = [...(previa?.tanda || [])];
  if (!tanda.some(x => x.vid === v.vid)) tanda.push({ vid: v.vid, etiqueta: etiqueta(v), operativo: v.operativo || "", nuevo });
  await fsMerge(env, `bot_sesiones/${numero}`, {
    cid: v.cid, vid: v.vid, patente: v.patente, modelo: v.modelo || "", operativo: v.operativo || "",
    desde: hora, ts: Date.now(), cerradaEn: null, crear: null, opciones: null, datos: null, elegirOperativo: null,
    anterior: anterior || null, tanda, desm: null
  });
}

async function buscarPatente(env, patente, uid) {
  const mios = new Set((await listaOperativos(env, uid)).map(o => o.cid));
  let vehiculos;
  try {
    // Una sola consulta sobre todos los operativos
    vehiculos = await fsQuery(env, "", "vehicles", { field: "patente", op: "EQUAL", value: patente }, 20, true);
  } catch (e) {
    // Si falta el índice de grupo de colecciones, se recorre operativo por operativo
    console.warn("Consulta global no disponible, se recorre por operativo:", e.message);
    vehiculos = [];
    for (const cid of mios) {
      const op = { __id: cid };
      const vs = await fsQuery(env, `companies/${op.__id}`, "vehicles", { field: "patente", op: "EQUAL", value: patente }, 5);
      vs.forEach(v => { v.__ruta = `companies/${op.__id}/vehicles/${v.__id}`; });
      vehiculos.push(...vs);
    }
  }
  const res = [];
  const nombres = {};
  for (const v of vehiculos) {
    if (v.deleted) continue;
    const [, cid, , vid] = v.__ruta.split("/");
    if (!mios.has(cid)) continue;
    nombres[cid] ??= (await fsGet(env, `companies/${cid}`))?.name || "Operativo";
    res.push({ cid, vid, patente: v.patente, modelo: v.modelo || "", operativo: nombres[cid],
      compania: v.compania || "", telefono: v.telefono || "", localidad: v.localidad || "", grado: v.grado || null,
      asegurado: v.asegurado || "", piezas: v.piezas || {},
      fotos: (v.fotos || []).length });
  }
  return res;
}

// Crea el vehículo en la web, con los mismos campos que usa la app
// Mismo nombre aunque cambie el orden, las mayúsculas o las tildes ("Perez Juan" = "Juan Pérez")
const mismoNombre = (a, b) => { const t = x => sinTildes(String(x || "")).split(/\s+/).filter(Boolean).sort().join(" "); return t(a) === t(b); };
async function aseguradoDePadron(env, patente) {
  const p = await fsGet(env, `padron/${patente}`).catch(() => null);
  return p?.nombre || null;
}

async function crearVehiculo(env, op, d, quien) {
  // Planilla de asegurados del operativo: manda el nombre de la planilla; si el mensaje trae otro, queda en detalles
  const delPadron = d.patente ? await aseguradoDePadron(env, d.patente) : null;
  if (delPadron) {
    if (d.asegurado && !mismoNombre(d.asegurado, delPadron)) d.observaciones = [d.observaciones, `Asegurado ${d.asegurado}`].filter(Boolean).join("\n");
    d.asegurado = delPadron;
  }
  const vid = [...crypto.getRandomValues(new Uint8Array(15))].map(b => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("") + "wa";
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // fecha de Argentina (UTC-3)
  const datos = {
    modelo: d.modelo || "", patente: d.patente, asegurado: d.asegurado || "", telefono: d.telefono || "", compania: d.compania || "",
    localidad: op.operativo || "", observaciones: d.observaciones || "", repuestos: itemsRep(d.repuestos).join(", "), pintura: itemsRep(d.pintura).join(", "), precio: d.precio || 0, piezas: d.piezas || {}, grado: d.grado || null,
    estado: "peritado", fechas: { peritado: hoy }, horas: { peritado: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16) }, fotos: [], archivos: [], firma: null, deleted: false,
    createdBy: `whatsapp:${quien.numero}`, createdByName: `${quien.nombre || quien.numero} (WhatsApp)`,
    ...(quien.uid ? { createdByUid: quien.uid } : {}),
    ...(quien.username ? { createdByUser: quien.username } : {}),
    historial: [{ t: Date.now(), uid: quien.uid || "", por: quien.nombre || quien.numero, txt: "Cargó el vehículo por WhatsApp" }],
    updatedBy: `whatsapp:${quien.numero}`, via: "whatsapp"
  };
  const ruta = `companies/${op.cid}/vehicles/${vid}`;
  const r = await fs(env, `${base(env)}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        update: { name: nombreDoc(env, ruta), fields: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, aValor(v)])) },
        updateTransforms: [
          { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
          { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }
        ],
        currentDocument: { exists: false }
      }]
    })
  });
  if (!r.ok) throw new Error(`No se pudo crear el vehículo: ${r.status} ${await r.text()}`);
  return { cid: op.cid, vid, operativo: op.operativo, ...datos };
}

// ¿A qué vehículo va un archivo enviado a la hora "hora"?
function destinoDe(s, hora) {
  if (!s) return null;
  if (s.vid && hora >= Number(s.desde || 0) && (!s.cerradaEn || hora <= Number(s.cerradaEn))) return { ...s, esActual: true };
  const a = s.anterior;
  if (a?.vid && hora >= Number(a.desde || 0) && hora <= Number(a.cerradaEn || 0)) return { ...a, esActual: false };
  return null;
}

// Evita repetir el mismo aviso por cada foto de un grupo
async function avisarUnaVez(env, m, numero, clave, texto) {
  if (m._grupo) return; // en grupos, fotos sin patente se ignoran en silencio
  // Un aviso por tanda de fotos (ventana de 90 s), aunque lleguen varias a la vez
  if (!(await primeraVez(env, `aviso-${clave}-${numero}-${Math.floor(Date.now() / 90000)}`))) return;
  return responder(env, dest(m), texto);
}

async function alRecibirArchivo(env, m, quien) {
  const numero = quien.numero;
  const media = m.image || m.document || m.video;
  const esVid = m.type === "video";
  const esFoto = m.type === "image" || esVid;   // los videos se guardan junto con las fotos
  const hora = horaDe(m);

  // Si la foto trae datos del vehículo como descripción, se procesan primero
  let sesion = await leerSesion(env, numero);
  const caption = (media?.caption || "").trim();
  let datos = null;
  if (caption && buscarPatenteEnTexto(caption)) {
    datos = interpretar(caption);
  }
  // Pie de foto con patente en modo desmontaje (rol Desmontador o "desmontaje AB123CD")
  const rDesm = datos?.patente && !(abierta(sesion) && sesion.patente === datos.patente && sesion.desm)
    ? await abrirModoDesm(env, numero, quien, quitarMencion(caption), datos, hora) : null;
  if (rDesm?.msg) return avisarUnaVez(env, m, numero, "desm", rDesm.msg);
  if (rDesm?.ok) sesion = await leerSesion(env, numero);
  else if (datos?.patente && !(abierta(sesion) && sesion.patente === datos.patente)) {
    if (abierta(sesion)) await cerrarEnSilencio(env, numero, hora - 1);
    const pregunta = await prepararVehiculo(env, numero, datos, hora, await leerSesion(env, numero), quien);
    if (pregunta) await responder(env, dest(m), pregunta);
    await recordarMensaje(env, m, numero, caption, datos.patente).catch(() => {});
    sesion = await leerSesion(env, numero);
  }

  if (m._grupo) {
    const g = await grupoAbierto(env, m);
    // Si venía subiendo al vehículo abierto del grupo y ese ya se cerró (o cambió), se suelta
    // Un @abierto posterior manda: cierra el vehículo que la persona tenía abierto de antes
    const previoAlAbierto = g && abierta(sesion) && sesion.vid !== g.vid && Number(sesion.desde || 0) < Number(g.desde || 0);
    if (previoAlAbierto || (abierta(sesion) && sesion.deGrupo === sesion.vid && g?.vid !== sesion.vid)) {
      await cerrarEnSilencio(env, numero, hora - 1); sesion = await leerSesion(env, numero);
    }
    if (g && !abierta(sesion)) {
      await abrir(env, numero, g, hora, sesion, false);
      await fsMerge(env, `bot_sesiones/${numero}`, { deGrupo: g.vid });
      sesion = await leerSesion(env, numero);
    }
  }
  // Modo desmontaje: pasados los 5 minutos el vehículo queda cerrado
  const enDesm = await ventanaDesm(env, numero, sesion, hora);
  if (sesion?.desm && !enDesm) sesion = await leerSesion(env, numero);
  const destino = destinoDe(sesion, hora);
  if (!destino) {
    if (sesion?.crear?.datos?.patente) {
      return avisarUnaVez(env, m, numero, "avisoFotos",
        `📌 Primero decime en qué operativo creo *${sesion.crear.datos.patente}* (respondé con el número). Después reenviame las fotos.`);
    }
    if (sesion?.opciones?.length) {
      return avisarUnaVez(env, m, numero, "avisoFotos", "📌 Primero decime de qué operativo es (respondé con el número). Después reenviame las fotos.");
    }
    return avisarUnaVez(env, m, numero, "avisoFotos",
      "📌 Primero enviame los datos del vehículo (al menos la patente) y después reenviame las fotos.");
  }

  const ruta = `companies/${destino.cid}/vehicles/${destino.vid}`;
  const vehiculo = await fsGet(env, ruta);
  if (!vehiculo || vehiculo.deleted) {
    // Un solo aviso por tanda de fotos (avisarUnaVez agrupa en ventanas de 90 s); también en grupos
    // Un solo aviso por vehículo y por día, aunque sigan llegando fotos (también en grupos)
    if (!(await primeraVez(env, `aviso-borrado-${destino.vid}-${numero}-${new Date().toISOString().slice(0, 10)}`))) return;
    return responder(env, dest(m), `🗑️ ${destino.patente} está en la papelera: no guardé estas fotos. ${OTRO}`);
  }

  // Bajar el archivo de WhatsApp
  const { bytes, mime } = m._key ? await bajarMediaEvolution(env, m) : await bajarMedia(env, media.id);
  const maxB = esVid ? 25 * 1024 * 1024 : MAX_BYTES;
  if (bytes.byteLength > maxB) return responder(env, dest(m), `📦 Ese ${esVid ? "video" : "archivo"} pesa más de ${esVid ? 25 : 15} MB, no lo puedo guardar.`);

  // Subir a Cloudinary (misma carpeta que usa la app)
  const nombre = media.filename || (esVid ? "video.mp4" : esFoto ? "foto.jpg" : "archivo");
  const subido = await subirCloudinary(env, new Blob([bytes], { type: mime }), nombre,
    `desabollito/${destino.cid}/${destino.vid}`, esVid ? "video" : esFoto ? "image" : "auto");
  const extraVid = esVid ? { tipo: "video" } : {};

  // Agregar al vehículo (la web lo muestra al instante). Sin ✅ por foto: el resumen llega al cerrar.
  const origen = { via: "whatsapp", byWhatsApp: numero, byName: quien.nombre };
  if (enDesm || await esDesm(env, destino.cid, quien.uid)) {
    // Rol Desmontaje: las fotos van a la sección Desmontaje del vehículo
    if (esFoto) await fsAppend(env, ruta, "desFotos", { url: subido.secure_url, publicId: subido.public_id, lote: loteWa(numero, destino),
      t: Date.now(), uid: quien.uid || "", por: quien.nombre || numero, via: "whatsapp", ...extraVid });
  } else if (esFoto) {
    await fsAppend(env, ruta, "fotos",
      { url: subido.secure_url, publicId: subido.public_id, w: subido.width || null, h: subido.height || null, at: Date.now(), ...origen, ...extraVid });
  } else {
    await fsAppend(env, ruta, "archivos",
      { url: subido.secure_url, publicId: subido.public_id, name: nombre, bytes: subido.bytes || null, format: subido.format || null, at: Date.now(), ...origen });
  }
  await fsIncrementar(env, `bot_sesiones/${numero}`, campoConteo(destino.vid)).catch(() => {});
  // Vehículo abierto del grupo: con la primera foto, el ▶️ del mensaje pasa a ✅
  if (m._grupo) {
    const g = await grupoAbierto(env, m);
    if (g && g.vid === destino.vid && !g.tildado) {
      await fsMerge(env, `bot_grupos/${idGrupo(m)}`, { tildado: true });
      await reaccionar(env, dest(m), g.msgId, "✅", g.msgKey || undefined);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  WhatsApp (Cloud API de Meta)
// ─────────────────────────────────────────────────────────────
async function firmaValida(raw, header, secreto) {
  if (!header || !secreto) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const esperado = "sha256=" + [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== header.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ header.charCodeAt(i);
  return dif === 0;
}

// Argentina: WhatsApp informa los celulares como 549…; se guarda siempre así
export function normalizarNumero(n) {
  let d = String(n || "").replace(/\D/g, "");
  if (d.startsWith("54") && !d.startsWith("549")) d = "549" + d.slice(2);
  return d;
}

// Argentina: WhatsApp informa el celular como 549 + área + número, pero para
// responder Meta a veces exige otro formato (sin el 9, o con el 15 después del
// código de área). Se prueban en orden y se recuerda el que funcionó.
const formatoQueFunciona = new Map();

function variantesAR(to) {
  if (!/^549\d{10}$/.test(to)) return [to];
  const resto = to.slice(3); // área + número (10 dígitos)
  const v = [to, "54" + resto];
  for (const largoArea of [2, 3, 4]) v.push("54" + resto.slice(0, largoArea) + "15" + resto.slice(largoArea));
  return v;
}

async function enviarEvolution(env, to, payload) {
  const chat = to.slice(4);
  const base = String(env.EVOLUTION_URL || "").replace(/\/+$/, "");
  const inst = payload._inst || env.EVOLUTION_INSTANCE || "desabollito";
  const h = { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" };
  const r = payload.type === "reaction"
    ? await fetch(`${base}/message/sendReaction/${inst}`, { method: "POST", headers: h,
        body: JSON.stringify({ key: payload._key, reaction: payload.reaction.emoji }) })
    : await fetch(`${base}/message/sendText/${inst}`, { method: "POST", headers: h,
        body: JSON.stringify({ number: chat, text: payload.text.body, linkPreview: payload.text.preview_url === true }) });
  if (!r.ok) {
    const d = await r.text();
    console.error("Evolution no aceptó el mensaje:", r.status, d);
    await registrar(env, { ultimoErrorEnvio: `${new Date().toISOString()} · Evolution · ${r.status} · ${d.slice(0, 300)}` }).catch(() => {});
  }
  return r;
}

async function enviar(env, to, payload) {
  if (String(to).startsWith("evo:")) return enviarEvolution(env, to, payload);
  delete payload._key;
  const intentar = dest => fetch(`${GRAPH}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: dest, ...payload })
  });
  const conocido = formatoQueFunciona.get(to);
  const candidatos = conocido ? [conocido, ...variantesAR(to).filter(x => x !== conocido)] : variantesAR(to);
  let r, detalle = "";
  for (const dest of candidatos) {
    r = await intentar(dest);
    if (r.ok) { formatoQueFunciona.set(to, dest); return r; }
    detalle = await r.text();
    // Solo tiene sentido probar otro formato si el problema es el destinatario
    if (!detalle.includes("131030") && !detalle.includes("131026") && !detalle.includes("recipient")) break;
  }
  console.error("WhatsApp no aceptó el mensaje:", r.status, detalle);
  await registrar(env, { ultimoErrorEnvio: `${new Date().toISOString()} · a ${to} (probé ${candidatos.join(", ")}) · ${r.status} · ${detalle.slice(0, 400)}` }).catch(() => {});
  return r;
}

const responder = (env, to, texto) => enviar(env, to, { type: "text", text: { body: texto, preview_url: false } });
const reaccionar = (env, to, messageId, emoji, key) => enviar(env, to, { type: "reaction", reaction: { message_id: messageId, emoji }, _key: key });

async function bajarMediaEvolution(env, m) {
  let b64 = m._base64, mime = m._mime || "image/jpeg";
  if (!b64) {
    const base = String(env.EVOLUTION_URL || "").replace(/\/+$/, "");
    const r = await fetch(`${base}/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE || "desabollito"}`, {
      method: "POST", headers: { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: m._key }, convertToMp4: false })
    });
    if (!r.ok) throw new Error("Evolution no devolvió el archivo: " + r.status);
    const j = await r.json(); b64 = j.base64; mime = j.mimetype || mime;
  }
  const bin = atob(String(b64).replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes: bytes.buffer, mime };
}

async function bajarMedia(env, mediaId) {
  const auth = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
  const info = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!info.ok) throw new Error("No se pudo obtener el archivo de WhatsApp: " + info.status);
  const { url, mime_type } = await info.json();
  const bin = await fetch(url, { headers: auth });
  if (!bin.ok) throw new Error("No se pudo descargar el archivo de WhatsApp: " + bin.status);
  return { bytes: await bin.arrayBuffer(), mime: mime_type || "application/octet-stream" };
}

// ─────────────────────────────────────────────────────────────
//  Cloudinary (subida firmada: el secreto vive solo acá)
// ─────────────────────────────────────────────────────────────
async function subirCloudinary(env, blob, nombre, carpeta, tipo) {
  const timestamp = Math.floor(Date.now() / 1000);
  const transformation = tipo === "image" ? "c_limit,w_1920,h_1920,q_auto:good" : "";
  const firmar = `folder=${carpeta}&timestamp=${timestamp}${transformation ? `&transformation=${transformation}` : ""}${env.CLOUDINARY_API_SECRET}`;
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(firmar));
  const signature = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");

  const fd = new FormData();
  fd.append("file", blob, nombre);
  fd.append("folder", carpeta);
  fd.append("timestamp", String(timestamp));
  fd.append("api_key", env.CLOUDINARY_API_KEY);
  fd.append("signature", signature);
  if (transformation) fd.append("transformation", transformation);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${tipo}/upload`, { method: "POST", body: fd });
  const data = await r.json();
  if (!r.ok) throw new Error("Cloudinary: " + (data?.error?.message || r.status));
  return data;
}

// ─────────────────────────────────────────────────────────────
//  Firestore (API REST con cuenta de servicio)
// ─────────────────────────────────────────────────────────────
let tokenCache = null;

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenFirebase(env) {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const ahora = Math.floor(Date.now() / 1000);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const datos = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora, exp: ahora + 3600
  })}`;
  const pem = String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(datos)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${datos}.${b64url(firma)}`
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Firebase no aceptó la cuenta de servicio: " + JSON.stringify(j));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

const base = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const nombreDoc = (env, ruta) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${ruta}`;

async function fs(env, url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${await tokenFirebase(env)}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  return r;
}

export function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aValor(x)])) } };
  return { stringValue: String(v) };
}

export function deValor(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, deValor(x)]));
  return null;
}

const deDoc = d => ({ __id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, deValor(v)])) });

async function fsGet(env, ruta) {
  const r = await fs(env, `${base(env)}/${ruta}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore get ${ruta}: ${r.status} ${await r.text()}`);
  return deDoc(await r.json());
}

async function fsSet(env, ruta, data) {
  const r = await fs(env, `${base(env)}/${ruta}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, aValor(v)])) })
  });
  if (!r.ok) throw new Error(`Firestore set ${ruta}: ${r.status} ${await r.text()}`);
}

async function fsDelete(env, ruta) {
  const r = await fs(env, `${base(env)}/${ruta}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`Firestore delete ${ruta}: ${r.status}`);
}

async function fsQuery(env, padre, coleccion, filtro, limite = 20, todos = false) {
  const url = padre ? `${base(env)}/${padre}:runQuery` : `${base(env)}:runQuery`;
  const r = await fs(env, url, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion, allDescendants: todos }],
        where: { fieldFilter: { field: { fieldPath: filtro.field }, op: filtro.op, value: aValor(filtro.value) } },
        limit: limite
      }
    })
  });
  if (!r.ok) throw new Error(`Firestore query ${coleccion}: ${r.status} ${await r.text()}`);
  return (await r.json()).filter(x => x.document).map(x => ({ ...deDoc(x.document), __ruta: x.document.name.split("/documents/")[1] }));
}

async function fsList(env, coleccion) {
  const out = [];
  let token = "";
  do {
    const r = await fs(env, `${base(env)}/${coleccion}?pageSize=300${token ? "&pageToken=" + token : ""}`);
    if (!r.ok) throw new Error(`Firestore list ${coleccion}: ${r.status}`);
    const j = await r.json();
    out.push(...(j.documents || []).map(deDoc));
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

// Agrega un elemento a una lista del documento sin pisar lo que haya (seguro con fotos simultáneas)
async function fsIncrementar(env, ruta, campo) {
  const r = await fs(env, `${base(env)}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        transform: {
          document: nombreDoc(env, ruta),
          fieldTransforms: [{ fieldPath: campo, increment: { integerValue: "1" } }]
        },
        currentDocument: { exists: true }
      }]
    })
  });
  if (!r.ok) throw new Error(`Firestore increment ${ruta}: ${r.status}`);
}

async function fsAppend(env, ruta, campo, elemento) {
  const r = await fs(env, `${base(env)}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        transform: {
          document: nombreDoc(env, ruta),
          fieldTransforms: [
            { fieldPath: campo, appendMissingElements: { values: [aValor(elemento)] } },
            { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }
          ]
        },
        currentDocument: { exists: true }
      }]
    })
  });
  if (!r.ok) throw new Error(`Firestore append ${ruta}: ${r.status} ${await r.text()}`);
}

// Evita procesar dos veces el mismo mensaje
async function primeraVez(env, id) {
  const r = await fs(env, `${base(env)}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        update: { name: nombreDoc(env, `bot_mensajes/${id}`), fields: { ts: aValor(Date.now()) } },
        currentDocument: { exists: false }
      }]
    })
  });
  if (r.ok) return true;
  const t = await r.text();
  if (r.status === 409 || t.includes("FAILED_PRECONDITION") || t.includes("ALREADY_EXISTS")) return false;
  throw new Error("Firestore dedupe: " + r.status + " " + t);
}

// ─────────────────────────────────────────────────────────────
//  Diagnóstico: https://TU-WORKER.workers.dev/diagnostico?token=TU_VERIFY_TOKEN
//  Revisa cada pieza sin mostrar ningún secreto.
// ─────────────────────────────────────────────────────────────
async function registrar(env, datos) {
  try { await fsMerge(env, "bot_estado/diagnostico", datos); } catch (e) { console.error("No se pudo registrar estado:", e.message); }
}

async function fsMerge(env, ruta, data) {
  const campos = Object.keys(data);
  let qs = campos.map(c => "updateMask.fieldPaths=" + encodeURIComponent(c)).join("&");
  // Nunca crear operativos ni vehículos "a medias" por escribir sobre uno que ya no existe
  if (/^companies\//.test(ruta)) qs += "&currentDocument.exists=true";
  const r = await fs(env, `${base(env)}/${ruta}?${qs}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, aValor(v)])) })
  });
  if (!r.ok) throw new Error(`Firestore merge ${ruta}: ${r.status} ${await r.text()}`);
}

async function diagnostico(url, env) {
  if (!env.WHATSAPP_VERIFY_TOKEN || String(url.searchParams.get("token") || "").trim() !== String(env.WHATSAPP_VERIFY_TOKEN).trim()) {
    return new Response("Agregá ?token=TU_WHATSAPP_VERIFY_TOKEN al final de la dirección.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const filas = [];
  const ok = (t, d = "") => filas.push(["✅", t, d]);
  const mal = (t, d = "") => filas.push(["❌", t, d]);
  const aviso = (t, d = "") => filas.push(["⚠️", t, d]);

  // 1. Variables cargadas
  const nombres = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET",
    "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY",
    "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  const faltan = nombres.filter(n => !String(env[n] || "").trim());
  faltan.length ? mal("Variables en Cloudflare", "Faltan: " + faltan.join(", ")) : ok("Variables en Cloudflare", "Las 10 están cargadas");
  const conEspacios = nombres.filter(n => env[n] && String(env[n]) !== String(env[n]).trim());
  if (conEspacios.length) aviso("Espacios de más", "Tienen espacios al principio o al final: " + conEspacios.join(", "));
  if (env.NUMEROS_PERMITIDOS) aviso("Candado activo", "Solo pueden usar el bot: " + env.NUMEROS_PERMITIDOS);

  // 2. Firebase
  let estado = null;
  try {
    tokenCache = null;
    await tokenFirebase(env);
    ok("Firebase: clave de servicio", "Firebase aceptó la cuenta de servicio");
    try {
      estado = await fsGet(env, "bot_estado/diagnostico");
      ok("Firebase: base de datos", "Lectura y escritura funcionando");
    } catch (e) { mal("Firebase: base de datos", e.message.slice(0, 300)); }
  } catch (e) { mal("Firebase: clave de servicio", "Revisá FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY · " + e.message.slice(0, 250)); }

  // 3. WhatsApp: token y número
  try {
    const r = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
    });
    const j = await r.json();
    if (r.ok) ok("WhatsApp: token y número", `Número ${j.display_phone_number || "?"} · ${j.verified_name || ""}`);
    else mal("WhatsApp: token y número", "Revisá WHATSAPP_TOKEN y WHATSAPP_PHONE_ID · " + (j?.error?.message || r.status));
  } catch (e) { mal("WhatsApp: token y número", e.message); }

  // 3b. ¿La cuenta de WhatsApp está suscripta a la app? (si no, Meta no manda los mensajes)
  try {
    const dbg = await (await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(env.WHATSAPP_TOKEN)}&access_token=${encodeURIComponent(env.WHATSAPP_TOKEN)}`)).json();
    // El ID de la cuenta se puede pasar a mano: &waba=ID (o cargarlo como WHATSAPP_WABA_ID)
    const manual = String(url.searchParams.get("waba") || env.WHATSAPP_WABA_ID || "").replace(/\D/g, "");
    const wabas = manual ? [manual] : [...new Set((dbg?.data?.granular_scopes || [])
      .filter(g => g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging")
      .flatMap(g => g.target_ids || []))];
    if (!wabas.length) {
      aviso("Suscripción de la cuenta de WhatsApp",
        "No se pudo leer la cuenta desde el token. Agregá al final de esta dirección &waba=ID_DE_TU_CUENTA&arreglar=1 " +
        "(el ID está en Meta → WhatsApp → Configuración de la API, debajo del Phone number ID).");
    }
    for (const waba of wabas) {
      const auth = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
      let subs = await (await fetch(`${GRAPH}/${waba}/subscribed_apps`, { headers: auth })).json();
      if (!(subs?.data || []).length && url.searchParams.get("arreglar") === "1") {
        const alta = await (await fetch(`${GRAPH}/${waba}/subscribed_apps`, { method: "POST", headers: auth })).json();
        if (alta?.error) aviso("Intento de suscripción", alta.error.message);
        subs = await (await fetch(`${GRAPH}/${waba}/subscribed_apps`, { headers: auth })).json();
      }
      const appIdToken = String(dbg?.data?.app_id || env.WHATSAPP_APP_ID || "");
      const appsSuscriptas = (subs?.data || []).map(x => ({ id: String(x.whatsapp_business_api_data?.id || x.id || ""), nombre: x.whatsapp_business_api_data?.name || "" }));
      // ¿El número del bot pertenece a esta cuenta?
      try {
        const nums = await (await fetch(`${GRAPH}/${waba}/phone_numbers?fields=id,display_phone_number`, { headers: auth })).json();
        const lista = (nums?.data || []);
        if (lista.length && !lista.some(x => String(x.id) === String(env.WHATSAPP_PHONE_ID).trim())) {
          mal("Número y cuenta", `El WHATSAPP_PHONE_ID no pertenece a la cuenta ${waba}. Números de esa cuenta: ` +
            lista.map(x => `${x.display_phone_number} (ID ${x.id})`).join(", "));
        } else if (lista.length) ok("Número y cuenta", `El número del bot pertenece a la cuenta ${waba}`);
      } catch {}
      if (appsSuscriptas.length && appIdToken && !appsSuscriptas.some(a => a.id === appIdToken)) {
        mal("Suscripción de la cuenta de WhatsApp",
          `La cuenta ${waba} está suscripta a OTRA app (${appsSuscriptas.map(a => `${a.nombre} ${a.id}`).join(", ")}), no a la del bot (${appIdToken}). ` +
          `Abrí esta página con &arreglar=1 para suscribirla también a la del bot.`);
        if (url.searchParams.get("arreglar") === "1") {
          const alta = await (await fetch(`${GRAPH}/${waba}/subscribed_apps`, { method: "POST", headers: auth })).json();
          if (alta?.error) aviso("Intento de suscripción", alta.error.message);
          else ok("Suscripción corregida", "Se suscribió la cuenta a la app del bot. Recargá sin &arreglar=1 para confirmar.");
        }
      } else if ((subs?.data || []).length) ok("Suscripción de la cuenta de WhatsApp", `Cuenta ${waba} suscripta a la app ${appsSuscriptas.map(a => `${a.nombre} ${a.id}`.trim()).join(", ")}`);
      else if (subs?.error) mal("Suscripción de la cuenta de WhatsApp",
        `No se pudo consultar la cuenta ${waba}: ${subs.error.message}. Si cargaste el token temporal, reemplazalo por el permanente del usuario del sistema.`);
      else mal("Suscripción de la cuenta de WhatsApp",
        `La cuenta ${waba} NO está suscripta: Meta no le manda los mensajes al bot. ` +
        `Arreglalo abriendo esta misma página con &arreglar=1 al final.`);
    }
  } catch (e) { aviso("Suscripción de la cuenta de WhatsApp", e.message); }

  // 3c. Webhook de la app: URL correcta y campo "messages" suscripto
  try {
    const dbg2 = await (await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(env.WHATSAPP_TOKEN)}&access_token=${encodeURIComponent(env.WHATSAPP_TOKEN)}`)).json();
    const appId = String(dbg2?.data?.app_id || env.WHATSAPP_APP_ID || "");
    if (!appId) {
      aviso("Webhook de la app", "No se pudo saber el ID de la app desde el token.");
    } else {
      const appToken = `${appId}|${String(env.WHATSAPP_APP_SECRET).trim()}`;
      const urlWebhook = `${url.origin}/webhook`;
      const leer = async () => (await (await fetch(`${GRAPH}/${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`)).json());
      let subs = await leer();
      const revisar = sx => {
        const w = (sx?.data || []).find(x => x.object === "whatsapp_business_account");
        return { w, bien: !!w && w.active !== false && w.callback_url === urlWebhook && (w.fields || []).some(f => (f.name || f) === "messages") };
      };
      let { w, bien } = revisar(subs);
      if (!bien && url.searchParams.get("arreglar") === "1" && !subs?.error) {
        const fd = new URLSearchParams({
          object: "whatsapp_business_account", callback_url: urlWebhook,
          verify_token: String(env.WHATSAPP_VERIFY_TOKEN).trim(), fields: "messages", access_token: appToken
        });
        const alta = await (await fetch(`${GRAPH}/${appId}/subscriptions`, { method: "POST", body: fd })).json();
        if (alta?.error) aviso("Intento de configurar el webhook", alta.error.message);
        subs = await leer(); ({ w, bien } = revisar(subs));
      }
      if (subs?.error) mal("Webhook de la app", "No se pudo leer: " + subs.error.message + " (revisá WHATSAPP_APP_SECRET)");
      else if (bien) ok("Webhook de la app", `URL correcta y campo “messages” suscripto (app ${appId})`);
      else {
        const problemas = [];
        if (!w) problemas.push("no hay webhook de WhatsApp configurado");
        else {
          if (w.callback_url !== urlWebhook) problemas.push(`la URL es “${w.callback_url}” y debería ser “${urlWebhook}”`);
          if (!(w.fields || []).some(f => (f.name || f) === "messages")) problemas.push("el campo “messages” no está suscripto");
          if (w.active === false) problemas.push("está inactivo");
        }
        mal("Webhook de la app", problemas.join("; ") + ". Arreglalo abriendo esta página con &arreglar=1 al final.");
      }
    }
  } catch (e) { aviso("Webhook de la app", e.message); }

  // 3d. Número propio (Evolution API), si está configurado
  if (env.EVOLUTION_URL) {
    try {
      const base = String(env.EVOLUTION_URL).replace(/\/+$/, "");
      const r = await fetch(`${base}/instance/connectionState/${env.EVOLUTION_INSTANCE || "desabollito"}`, { headers: { apikey: env.EVOLUTION_APIKEY } });
      const j = await r.json().catch(() => ({}));
      const estadoEvo = j?.instance?.state || j?.state;
      if (estadoEvo === "open") ok("Número propio (Evolution)", "Conectado a WhatsApp");
      else mal("Número propio (Evolution)", `Estado: ${estadoEvo || r.status}. Escaneá el QR en ${base}/manager`);
      const cli = await estadoEvolution(env, instanciaClientes(env));
      if (cli === "open") ok("Número de la empresa (avisos a clientes)", `Conexión "${instanciaClientes(env)}" conectada`);
      else aviso("Número de la empresa (avisos a clientes)", cli ? `Conexión "${instanciaClientes(env)}": ${cli}. Escaneá el QR en ${base}/manager`
        : `Falta crear la conexión "${instanciaClientes(env)}" en ${base}/manager. Mientras tanto los avisos a clientes no se envían.`);
    } catch (e) { mal("Número propio (Evolution)", "No responde el servidor: " + e.message); }
  }

  // 4. Cloudinary
  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/ping`, {
      headers: { Authorization: "Basic " + btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`) }
    });
    r.ok ? ok("Cloudinary", "Credenciales correctas") : mal("Cloudinary", "Revisá CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET · " + r.status);
  } catch (e) { mal("Cloudinary", e.message); }

  // 5. ¿Meta está llamando al bot?
  if (!estado?.ultimoWebhook) {
    mal("Mensajes de WhatsApp", "Meta todavía no mandó ningún mensaje al bot. Revisá la URL del webhook y la suscripción a “messages”.");
  } else if (estado.ultimaFirmaOk === false) {
    mal("Mensajes de WhatsApp", `Llegó un mensaje (${estado.ultimoWebhook}) pero la firma no coincide: revisá WHATSAPP_APP_SECRET.`);
  } else {
    const de = (String(estado.ultimoCuerpo || "").match(/"from":"(\d+)"/) || [])[1];
    const esPrueba = de === "16315551181";
    (esPrueba ? aviso : ok)("Mensajes de WhatsApp", `Último mensaje recibido: ${estado.ultimoWebhook}` +
      (de ? ` · de ${de}${esPrueba ? " (es la prueba del panel de Meta, todavía no llegó ningún mensaje real)" : ""}` : ""));
  }
  if (estado?.ultimoError) aviso("Último error procesando", estado.ultimoError);
  if (estado?.ultimoErrorEnvio) aviso("Último error al responder", estado.ultimoErrorEnvio);
  if (estado?.ultimoTipoIgnorado) aviso("Último mensaje ignorado", estado.ultimoTipoIgnorado);

  const esc = t => String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Diagnóstico del bot</title>
  <body style="font-family:system-ui;background:#0a1420;color:#e7edf5;padding:20px;max-width:760px;margin:auto">
  <h1 style="font-size:22px">Diagnóstico · Desabollito bot</h1>
  ${filas.map(([i, t, d]) => `<div style="background:#111e2f;border:1px solid #213349;border-radius:12px;padding:12px 14px;margin:10px 0">
    <div style="font-weight:700">${i} ${esc(t)}</div><div style="color:#b5c3d4;font-size:14px;margin-top:4px;word-break:break-word">${esc(d)}</div></div>`).join("")}
  ${estado?.ultimoCuerpo ? `<details style="margin-top:14px;color:#8395ab"><summary>Último mensaje recibido (técnico)</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(estado.ultimoCuerpo)}</pre></details>` : ""}
  <p style="color:#8395ab;font-size:13px;margin-top:20px">Recargá esta página después de mandarle un mensaje al bot.</p></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

// ─────────────────────────────────────────────────────────────
//  Evolution API: número propio vinculado (sirve en grupos)
//  Webhook: https://TU-WORKER.workers.dev/evolution?token=EVOLUTION_APIKEY
// ─────────────────────────────────────────────────────────────
async function webhookEvolution(req, url, env, ctx) {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (!env.EVOLUTION_APIKEY || url.searchParams.get("token") !== env.EVOLUTION_APIKEY) return new Response("No autorizado", { status: 403 });
  let body;
  try { body = await req.json(); } catch { return new Response("ok"); }
  const evento = String(body.event || "").toLowerCase().replace("_", ".");
  const lista = Array.isArray(body.data) ? body.data : [body.data];
  ctx.waitUntil(asegurarEventosEvo(env, body.instance).catch(() => {}));
  ctx.waitUntil(aprenderIdentidad(env, body).catch(e => registrar(env, { ultimoError: `${new Date().toISOString()} · identidad · ${e.message}` }).catch(() => {})));
  // Mensajes editados: llegan como upsert (protocolMessage), messages.update o messages.edited
  if (["messages.upsert", "messages.update", "messages.edited"].includes(evento)) {
    const ediciones = lista.filter(d => !d?.key?.fromMe).map(edicionDe).filter(Boolean);
    if (ediciones.length) {
      ctx.waitUntil(Promise.all(ediciones.map(e => alEditarMensaje(env, e).catch(err =>
        registrar(env, { ultimoError: `${new Date().toISOString()} · Edición · ${String(err?.message || err).slice(0, 400)}` }).catch(() => {})))));
      return new Response("ok");
    }
  }
  if (evento !== "messages.upsert") return new Response("ok");
  const botJids = await jidsDelBot(env, body);
  const mensajes = lista.map(d => deEvolution(d, botJids)).filter(Boolean);
  // Temporal: registra las menciones para aprender el identificador del bot en grupos
  const conMencion = lista.find(d => mencionesDe(d).length) || lista.find(d => /@\d{6,}/.test(JSON.stringify(d.message || {})));
  if (conMencion) ctx.waitUntil(registrar(env, { ultimaMencion: `${new Date().toISOString()} · sender ${body.sender || "-"} · bot ${JSON.stringify(botJids)} · ${JSON.stringify(mencionesDe(conMencion))} · ${JSON.stringify({ ...conMencion, message: conMencion.message }, (k, v) => (k === "base64" || k === "jpegThumbnail" ? "…" : v)).slice(0, 1500)}` }).catch(() => {}));
  // Temporal: guarda la forma de los mensajes no reconocidos (sin archivos) para diagnosticar
  const raro = lista.find((d, i) => deEvolution(d)?.type === "unsupported");
  if (raro) ctx.waitUntil(registrar(env, { ultimoCrudoEvo: `${new Date().toISOString()} · ${evento} · ` +
    JSON.stringify({ ...raro, message: raro.message }, (k, v) => (k === "base64" || k === "jpegThumbnail" ? "…" : v)).slice(0, 3000) }).catch(() => {}));
  ctx.waitUntil(registrar(env, { ultimoEvolution: `${new Date().toISOString()} · ${mensajes.length} mensaje(s)` }));
  ctx.waitUntil(Promise.all(mensajes.map(m => procesar(m, env).catch(e => {
    console.error("Error con mensaje de Evolution", m.id, e?.stack || e);
    registrar(env, { ultimoError: `${new Date().toISOString()} · Evolution · ${String(e?.message || e).slice(0, 400)}` }).catch(() => {});
  }))));
  return new Response("ok");
}

// El webhook de Evolution también tiene que avisar las ediciones (se revisa una vez por día)
let eventosOk = false;
async function asegurarEventosEvo(env, instancia) {
  const inst = typeof instancia === "string" && instancia ? instancia : (env.EVOLUTION_INSTANCE || "desabollito");
  if (eventosOk || !env.EVOLUTION_URL || inst !== (env.EVOLUTION_INSTANCE || "desabollito")) return;
  if (!(await primeraVez(env, `evo_eventos_${inst}_${new Date().toISOString().slice(0, 10)}`))) { eventosOk = true; return; }
  const base = String(env.EVOLUTION_URL).replace(/\/+$/, "");
  const h = { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" };
  const w = await (await fetch(`${base}/webhook/find/${inst}`, { headers: h })).json().catch(() => null);
  const ev = (w?.events || w?.webhook?.events || []).map(String);
  const faltan = ["MESSAGES_UPSERT", "MESSAGES_EDITED"].filter(x => !ev.includes(x));
  if (!w || !faltan.length || ev.includes("MESSAGES_UPDATE")) { eventosOk = true; return; }
  const url = w.url || w.webhook?.url;
  if (!url) return;
  const poner = extra => fetch(`${base}/webhook/set/${inst}`, { method: "POST", headers: h, body: JSON.stringify({ webhook: {
    enabled: true, url, byEvents: false, base64: w.webhookBase64 ?? w.base64 ?? true, events: [...new Set([...ev, "MESSAGES_UPSERT", extra])] } }) });
  // Versiones viejas de Evolution no tienen MESSAGES_EDITED: se usa MESSAGES_UPDATE
  let r = await poner("MESSAGES_EDITED");
  if (!r.ok) r = await poner("MESSAGES_UPDATE");
  if (r.ok) eventosOk = true;
  else await registrar(env, { ultimoError: `${new Date().toISOString()} · Webhook eventos · ${r.status} · ${(await r.text()).slice(0, 300)}` });
}

const aBytes = x => !x ? null : typeof x === "string" ? Uint8Array.from(atob(x), c => c.charCodeAt(0))
  : x instanceof Uint8Array ? x : Array.isArray(x) ? Uint8Array.from(x) : x.data ? Uint8Array.from(x.data) : Uint8Array.from(Object.keys(x).sort((a, b) => a - b).map(k => x[k]));
const b64DeBytes = x => { const b = aBytes(x); return b?.length ? btoa(String.fromCharCode(...b)) : null; };
const jidsDe = d => { const k = d?.key || {}; const g = String(k.remoteJid || "").endsWith("@g.us");
  return [...new Set((g ? [k.participant, k.participantAlt, k.participantPn, d.participant] : [k.remoteJid, k.remoteJidAlt, k.senderPn, k.senderLid])
    .filter(Boolean).map(j => String(j).replace(/:\d+@/, "@")))]; };

// Menciones (@) del mensaje: identificadores de WhatsApp de los arrobados
export function mencionesDe(d) {
  const m = d?.message || {}, out = [];
  for (const v of Object.values(m)) if (v && typeof v === "object" && Array.isArray(v.contextInfo?.mentionedJid)) out.push(...v.contextInfo.mentionedJid);
  if (Array.isArray(d?.contextInfo?.mentionedJid)) out.push(...d.contextInfo.mentionedJid);
  return [...new Set(out.map(String))];
}
// Identificadores del bot: su número (sender del webhook) y su LID (aprendido y guardado)
let cacheBot = null;
async function jidsDelBot(env, body) {
  if (!cacheBot || Date.now() - cacheBot.t > 10 * 60_000) {
    const e = await fsGet(env, "bot_estado/identidad").catch(() => null);
    cacheBot = { t: Date.now(), jids: e?.jids || [] };
  }
  const solo = j => String(j || "").split("@")[0].split(":")[0];
  return [...new Set([solo(body?.sender), ...cacheBot.jids.map(solo)].filter(Boolean))];
}

// Busca el LID del bot (WhatsApp lo usa en las menciones de grupos) y lo guarda
let identidadOk = false;
async function aprenderIdentidad(env, body) {
  if (identidadOk || !env.EVOLUTION_URL) return;
  const inst = env.EVOLUTION_INSTANCE || "desabollito";
  if (body?.instance && body.instance !== inst) return;
  const prev = await fsGet(env, "bot_estado/identidad").catch(() => null);
  if (prev?.jids?.some(j => String(j).endsWith("@lid"))) { identidadOk = true; return; }
  if (!(await primeraVez(env, `identidad_${Math.floor(Date.now() / 3600_000)}`))) { identidadOk = true; return; }
  const base = String(env.EVOLUTION_URL).replace(/\/+$/, "");
  const h = { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" };
  const numero = String(body?.sender || "").split("@")[0];
  const crudo = {};
  const r1 = await fetch(`${base}/instance/fetchInstances?instanceName=${inst}`, { headers: h }).then(r => r.json()).catch(() => null);
  crudo.inst = r1;
  const r2 = numero ? await fetch(`${base}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: h, body: JSON.stringify({ numbers: [numero] }) }).then(r => r.json()).catch(() => null) : null;
  crudo.num = r2;
  const txt = JSON.stringify(crudo);
  const lids = [...new Set(txt.match(/\d{8,20}@lid/g) || [])];
  await fsMerge(env, "bot_estado/identidad", { jids: [...new Set([...(prev?.jids || []), ...(numero ? [numero + "@s.whatsapp.net"] : []), ...lids])], crudo: txt.slice(0, 1500), ts: Date.now() });
  cacheBot = null;
  if (lids.length) identidadOk = true;
}

export function deEvolution(d, botJids = []) {
  const key = d?.key;
  if (!key || key.fromMe) return null;
  const chat = String(key.remoteJid || "");
  if (!chat || chat === "status@broadcast" || chat.endsWith("@newsletter")) return null;
  const grupo = chat.endsWith("@g.us");
  // Quién escribió: en grupos es el participante; se prefiere el número real al identificador interno
  const autor = grupo
    ? [key.participantAlt, key.participantPn, d.participant, key.participant].find(x => String(x || "").includes("@s.whatsapp.net")) || key.participant || d.participant || ""
    : [key.remoteJidAlt, chat].find(x => String(x || "").includes("@s.whatsapp.net")) || chat;
  let msg = d.message || {};
  msg = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg.documentWithCaptionMessage?.message || msg;
  const base = {
    id: "evo_" + String(key.id || "").replace(/[^A-Za-z0-9_-]/g, ""),
    from: String(autor).split("@")[0].replace(/\D/g, ""),
    timestamp: String(Number(d.messageTimestamp?.low ?? d.messageTimestamp ?? Math.floor(Date.now() / 1000))),
    _to: "evo:" + chat, _grupo: grupo, _nombre: d.pushName || "",
    _key: { remoteJid: chat, fromMe: false, id: key.id, ...(key.participant ? { participant: key.participant } : {}) },
    _base64: d.message?.base64 || msg.base64 || d.base64 || null,
    // Para descifrar ediciones futuras: secreto del mensaje y las formas del autor (lid / número)
    _secreto: b64DeBytes(d.message?.messageContextInfo?.messageSecret || msg.messageContextInfo?.messageSecret),
    _jids: jidsDe(d)
  };
  // Si arrobaron al bot (@número o @lid), se cambia por "@desabollito" para que lo reconozca
  const alBot = mencionesDe(d).map(j => j.split("@")[0].split(":")[0]).filter(x => botJids.includes(x));
  const conBot = t => alBot.reduce((x, n) => x.replace(new RegExp("@" + n + "\\b", "g"), "@desabollito"), String(t));
  const texto = msg.conversation || msg.extendedTextMessage?.text;
  if (texto) return { ...base, type: "text", text: { body: conBot(texto) } };
  if (msg.videoMessage) return { ...base, type: "video", video: { id: key.id, caption: conBot(msg.videoMessage.caption || "") }, _mime: msg.videoMessage.mimetype || "video/mp4" };
  if (msg.imageMessage) return { ...base, type: "image", image: { id: key.id, caption: conBot(msg.imageMessage.caption || "") }, _mime: msg.imageMessage.mimetype };
  if (msg.documentMessage) {
    const doc = msg.documentMessage;
    return { ...base, type: "document", document: { id: key.id, caption: doc.caption || "", filename: doc.fileName || "archivo" }, _mime: doc.mimetype };
  }
  return { ...base, type: "unsupported" };
}


// ─────────────────────────────────────────────────────────────
//  Cuentas: vinculación de WhatsApp, aprobación de registros y avisos al cliente
// ─────────────────────────────────────────────────────────────
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
const numeroAdmin = env => normalizarNumero(env.ADMIN_WHATSAPP || "5491137709755");
const destinoNumero = (env, numero) => (env.EVOLUTION_URL ? `evo:${numero}` : numero);
const limpiarUsuario = u => String(u || "").toLowerCase().trim().replace(/^@/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]/g, "");
const responderLink = (env, to, texto) => enviar(env, to, { type: "text", text: { body: texto, preview_url: true } });

// Primer contacto de un número: se le pide el usuario de la web y se vincula
async function vincular(env, m, quien) {
  const numero = quien.numero;
  if (m._grupo) {
    const txt = m.type === "text" ? String(m.text?.body || "") : String(m.image?.caption || "");
    if (!mencionaBot(txt) && !buscarPatenteEnTexto(txt)) return;   // charla del grupo: no se responde
    return avisarUnaVez(env, { ...m, _grupo: false }, numero, "vincular",
      "👋 Para usar el bot primero escribime por privado tu *usuario* de Desabollito.");
  }
  const estado = await fsGet(env, `bot_vinculo/${numero}`);
  const texto = m.type === "text" ? String(m.text?.body || "").trim() : "";
  const unaPalabra = texto && !/\s/.test(texto.replace(/^@/, ""));
  const cand = unaPalabra ? limpiarUsuario(texto) : "";

  if (cand.length >= 3) {
    const u = await fsGet(env, `usernames/${cand}`);
    if (u?.uid) {
      const perfil = await fsGet(env, `users/${u.uid}`);
      if (perfil?.rechazado) return responder(env, dest(m), "⛔ Esa cuenta no fue aprobada, así que no puede usar el bot.");
      if (perfil?.aprobado === false) {
        await fsSet(env, `bot_vinculo/${numero}`, { pedido: true, ts: Date.now() });
        return responder(env, dest(m), `⏳ La cuenta *@${cand}* todavía está esperando aprobación.\n\nCuando la aprueben, escribime de nuevo tu usuario.`);
      }
      const nombre = perfil?.name || u.name || cand;
      // Un usuario con otro WhatsApp ya vinculado no se puede tomar desde otro número
      if (perfil?.whatsapp && perfil.whatsapp !== numero) {
        const otro = await fsGet(env, `bot_numeros/${perfil.whatsapp}`);
        if (otro?.uid === u.uid) {
          return responder(env, dest(m), `🔒 El usuario *@${cand}* ya tiene otro WhatsApp vinculado.

Si cambiaste de número, entrá a la app → Ajustes → *Desvincular WhatsApp* y después escribime tu usuario desde este número.`);
        }
      }
      await fsSet(env, `bot_numeros/${numero}`, { uid: u.uid, username: cand, name: nombre, ts: Date.now() });
      await fsMerge(env, `users/${u.uid}`, { whatsapp: numero });
      await fsDelete(env, `bot_vinculo/${numero}`).catch(() => {});
      return responder(env, dest(m), `✅ Listo *${nombre}*, tu WhatsApp quedó vinculado a *@${cand}*.\n\n` + INSTRUCCIONES);
    }
    if (estado?.pedido) {
      return responderLink(env, dest(m), `❌ No encontré el usuario *${cand}*.\n\nPara usar el bot necesitás una cuenta en Desabollito. Registrate acá y, cuando te la aprueben, escribime tu usuario:\n\n👉 ${APP_URL}`);
    }
  } else if (estado?.pedido && texto) {
    return responderLink(env, dest(m), `Escribime solo tu *usuario* de Desabollito (una palabra, sin espacios).\n\n¿No tenés cuenta? Registrate acá:\n👉 ${APP_URL}`);
  }
  if (estado?.pedido && m.type !== "text") return; // fotos antes de vincular: ya se le pidió el usuario
  await fsSet(env, `bot_vinculo/${numero}`, { pedido: true, ts: Date.now() });
  const wa = String(m._nombre || "").trim();
  return responder(env, dest(m), `👋 ¡Hola${wa ? " " + wa : ""}! Soy el bot de *Desabollito*.\n\nPara empezar, escribime tu *usuario* de la app (el que usás para entrar en desabollito.github.io).`);
}

// El administrador responde "SI usuario" / "NO usuario" (o solo SI/NO si hay una sola solicitud)
async function comandoAdmin(env, m, texto) {
  const t = limpio(texto);
  if (t === "pendientes") {
    const pend = await fsList(env, "bot_pendientes");
    await responder(env, dest(m), pend.length ? "📋 Cuentas esperando aprobación:\n\n" + pend.map(p => `• ${p.name || ""} (@${p.username})`).join("\n") + "\n\nRespondé *SI usuario* o *NO usuario*."
      : "No hay cuentas esperando aprobación.");
    return true;
  }
  const mm = texto.trim().match(/^(si|sí|no)\b[\s,:]*@?([a-z0-9._-]{3,64})?\s*$/i);
  if (!mm) return false;
  const pend = await fsList(env, "bot_pendientes");
  if (!pend.length) return false; // no hay solicitudes: el mensaje sigue su curso normal
  const aprobar = !/^no$/i.test(mm[1]);
  let p = mm[2] ? pend.find(x => x.username === limpiarUsuario(mm[2])) : pend.length === 1 ? pend[0] : null;
  if (!p) {
    await responder(env, dest(m), mm[2] ? `No hay ninguna solicitud de *@${limpiarUsuario(mm[2])}*.` :
      "Hay varias solicitudes. Respondé *SI usuario* o *NO usuario*:\n\n" + pend.map(x => `• ${x.name || ""} (@${x.username})`).join("\n"));
    return true;
  }
  if (aprobar) {
    await fsMerge(env, `users/${p.uid}`, { aprobado: true, rechazado: false });
    await fsMerge(env, `usernames/${p.username}`, { pendiente: false }).catch(() => {});
  } else {
    // Rechazo: se borra la cuenta entera, así el usuario queda libre para registrarse de nuevo
    await borrarCuentaAuth(env, p.uid).catch(e => console.error("borrar cuenta", e));
    await fsDelete(env, `usernames/${p.username}`).catch(() => {});
    await fsDelete(env, `users/${p.uid}`).catch(() => {});
  }
  await fsDelete(env, `bot_pendientes/${p.username}`);
  await responder(env, dest(m), aprobar
    ? `✅ Aprobaste a *${p.name || p.username}*.`
    : `❌ Rechazaste a *${p.name || p.username}*.`);
  return true;
}

// La app avisa que alguien se registró: se le pregunta al administrador por WhatsApp
async function nuevoRegistro(env, { uid, reenviar }) {
  if (!uid || !/^[A-Za-z0-9]{10,40}$/.test(uid)) return json({ ok: false, error: "Falta el usuario" }, 400);
  const p = await fsGet(env, `users/${uid}`);
  if (!p || p.aprobado !== false || p.rechazado) return json({ ok: false, error: "Nada para avisar" });
  if (p.notificado && (!reenviar || Date.now() - Number(p.notificadoEn || 0) < 10 * 60 * 1000)) return json({ ok: true, yaAvisado: true });
  const username = p.username || "";
  await fsSet(env, `bot_pendientes/${username}`, { uid, username, name: p.name || "", ts: Date.now() });
  const r = await enviar(env, destinoNumero(env, numeroAdmin(env)), { type: "text", text: { body:
    `🆕 *Nueva cuenta en Desabollito*\n\n👤 ${p.name || "(sin nombre)"}\n🔑 Usuario: *@${username}*${p.email && !/@desabollito/i.test(p.email) ? `\n✉️ ${p.email}` : ""}\n\n` +
    `Respondé *SI ${username}* para aprobarla o *NO ${username}* para rechazarla.`, preview_url: false } });
  await fsMerge(env, `users/${uid}`, { notificado: true, notificadoEn: Date.now() });
  return json({ ok: !!r?.ok });
}

// Celular argentino → 549 + área + número (acepta 0, 15, espacios, +54...)
export function telefonoAR(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3); else if (d.startsWith("54")) d = d.slice(2);
  d = d.replace(/^0/, "");
  if (d.length === 12) {                       // área + 15 + número
    for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === "15") { d = d.slice(0, a) + d.slice(a + 2); break; }
  }
  if (d.length === 8) d = "11" + d;            // número de CABA sin característica
  return d.length === 10 ? "549" + d : null;
}

// Aviso al cliente cuando su auto queda reparado (una sola vez por vehículo)
async function avisarCliente(env, { cid, vid, por }) {
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(cid || "") || !/^[A-Za-z0-9_-]{1,60}$/.test(vid || "")) return json({ ok: false, error: "Datos inválidos" }, 400);
  const ruta = `companies/${cid}/vehicles/${vid}`;
  const v = await fsGet(env, ruta);
  if (!v || v.deleted) return json({ ok: false, error: "No encontré el vehículo" }, 404);
  if (!["reparado", "llamado"].includes(v.estado)) return json({ ok: false, error: "El vehículo no está en revisión ni contactado" });
  if (v.avisoReparado) return json({ ok: false, error: "Al cliente ya se le avisó" });
  if ((await fsGet(env, "config/app").catch(() => null))?.avisoReparado === false) return json({ ok: false, error: "El aviso al cliente está desactivado" });
  const tel = telefonoAR(v.telefono);
  if (!tel) return json({ ok: false, error: "El teléfono del cliente no parece un celular válido" });
  const c = await fsGet(env, `companies/${cid}`);
  const nombre = String(v.asegurado || "").trim().split(/\s+/)[0];
  const texto = `Hola${nombre ? " " + nombre : ""}! 👋 Te escribimos de ${c?.name || "Desabollito"}: tu ${v.modelo || "vehículo"}${v.patente ? ` (${v.patente})` : ""} ya está reparado y listo para retirar. ¡Gracias por confiar en nosotros!`;
  // Los avisos a clientes salen desde el número de la empresa (conexión "clientes" de Evolution), no desde Desabollito
  if (!env.EVOLUTION_URL) return json({ ok: false, error: "Falta conectar el número de la empresa" });
  const est = await estadoEvolution(env, instanciaClientes(env));
  if (est !== "open") return json({ ok: false, error: "El número de la empresa no está conectado" });
  const r = await enviarEvolution(env, `evo:${tel}`, { type: "text", text: { body: texto }, _inst: instanciaClientes(env) });
  if (!r?.ok) return json({ ok: false, error: "WhatsApp no aceptó el mensaje" });
  const quien = String(por || "").slice(0, 60);
  await fsMerge(env, ruta, { avisoReparado: { t: Date.now(), por: quien } });
  await fsAppend(env, ruta, "historial", { t: Date.now(), uid: "", por: quien, txt: "Le avisó al cliente por WhatsApp que el auto está listo" }).catch(() => {});
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════
//  Panel del creador de la app (solo la cuenta @gzmatte)
// ═══════════════════════════════════════════════════════════════
const CREADOR = "gzmatte";
let jwksCache = null;
const b64dec = t => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4)), c => c.charCodeAt(0));

// Verifica el token de sesión de Firebase que manda la app y devuelve el uid
async function verificarIdToken(env, token) {
  const [h, p, firma] = String(token || "").split(".");
  if (!h || !p || !firma) throw new Error("token");
  const cab = JSON.parse(new TextDecoder().decode(b64dec(h)));
  const dat = JSON.parse(new TextDecoder().decode(b64dec(p)));
  const ahora = Date.now() / 1000;
  if (cab.alg !== "RS256" || dat.aud !== env.FIREBASE_PROJECT_ID || dat.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
    || !(dat.exp > ahora) || !dat.sub) throw new Error("token");
  if (!jwksCache || jwksCache.exp < Date.now()) {
    const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    jwksCache = { keys: (await r.json()).keys || [], exp: Date.now() + 3600_000 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === cab.kid);
  if (!jwk) throw new Error("token");
  const clave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", clave, b64dec(firma), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("token");
  return dat.sub;
}

async function soloCreador(env, idToken) {
  try {
    const uid = await verificarIdToken(env, idToken);
    const u = await fsGet(env, `users/${uid}`);
    return u?.username === CREADOR ? uid : null;
  } catch { return null; }
}

// Mover un vehículo a otro operativo (copia exacta y borra el original, en una sola operación).
// Puede quien lo cargó o un administrador del operativo de origen, si también es miembro del destino.
// ── Resumen diario (20 hs Argentina) ─────────────────────────
// Se guarda en bot_resumen/{chat}: a dónde mandarlo y de quién son los operativos.
async function comandoResumenDiario(env, m, quien, arg) {
  const id = String(dest(m)).replace(/[^A-Za-z0-9_-]/g, "_");
  if (/^(off|no|parar|stop|cancelar|baja)$/i.test(String(arg || "").trim())) {
    await fsDelete(env, `bot_resumen/${id}`);
    return responder(env, dest(m), "🔕 Listo, no mando más el resumen diario a este chat.");
  }
  if (!quien.uid) return responder(env, dest(m), "Primero vinculá tu número con la app.");
  await fsSet(env, `bot_resumen/${id}`, { to: dest(m), uid: quien.uid, por: quien.nombre || "", t: Date.now() });
  const ops = await listaOperativos(env, quien.uid);
  return responder(env, dest(m), `🗓️ Listo: todos los días a las *20:00* mando acá el resumen de los vehículos peritados en el día` +
    (ops.length ? ` (${ops.map(o => o.operativo).join(", ")}).` : ".") + `

Para cortarlo: *!resumendiario off*`);
}
const fechaCortaAR = iso => iso.split("-").reverse().slice(0, 2).join("/");
async function textoResumenDiario(env, uid, hoy) {
  const ops = await listaOperativos(env, uid);
  const bloques = [];
  let total = 0;
  for (const o of ops) {
    const vs = (await fsQuery(env, `companies/${o.cid}`, "vehicles", { field: "fechas.peritado", op: "EQUAL", value: hoy }, 300).catch(() => []))
      .filter(v => !v.deleted && v.estado !== "anulado" && !v.fechas?.anulado);
    if (!vs.length) continue;
    total += vs.length;
    vs.sort((a, b) => String(a.horas?.peritado || "99").localeCompare(String(b.horas?.peritado || "99")));
    const linea = v => [v.modelo || "Sin modelo", v.patente, v.grado ? `G${v.grado}` : "", ciaCorta(v.compania)].filter(Boolean).map(x => "`" + x + "`").join(" ");
    bloques.push(`*${o.operativo}* · ${vs.length} ${vs.length === 1 ? "vehículo" : "vehículos"}\n\n` + vs.map(linea).join("\n"));
  }
  const tit = `📋 *Resumen del día · ${fechaCortaAR(hoy)}*`;
  if (!total) return `${tit}\n\nHoy no se peritaron vehículos.`;
  return `${tit}\nTotal: *${total}* ${total === 1 ? "vehículo peritado" : "vehículos peritados"}\n\n` + bloques.join("\n\n━━━━━━━━━━\n\n");
}
async function enviarResumenesDiarios(env) {
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  for (const r of await fsList(env, "bot_resumen").catch(() => [])) {
    if (!r.to || !r.uid || r.ultimo === hoy) continue;
    try {
      await responder(env, r.to, await textoResumenDiario(env, r.uid, hoy));
      await fsMerge(env, `bot_resumen/${r.__id}`, { ultimo: hoy });
    } catch (e) { console.error("resumen diario", r.__id, e?.stack || e); }
  }
}

// ── Planilla de pericia Mercantil Andina (.xlsx) ─────────────
// Los datos del vehículo salen de la app; en el mensaje van solo siniestro, km y (opcional) año.
const TOTAL_MERCANTIL = { 1: 800000, 2: 1200000, 3: 1700000 };
const PANOS_MERCANTIL = { C10: "CAPOT", C11: "TECHO", C12: "BAUL",
  C14: "GUARDABARROS DEL. IZQ", C15: "PUERTA DEL. IZQ", C16: "PUERTA TRAS. IZQ", C17: "GUARDABARROS TRAS. IZQ", C18: "PARANTE IZQ",
  C20: "GUARDABARROS DEL. DER", C21: "PUERTA DEL. DER", C22: "PUERTA TRAS. DER", C23: "GUARDABARROS TRAS. DER", C24: "PARANTE DER" };
const numDe = t => { const d = String(t || "").replace(/\D/g, ""); return d ? (d.length <= 15 ? Number(d) : d) : null; };
const CAMPOS_XLSX = [["patente", "Patente"], ["modelo", "Modelo"], ["siniestro", "Siniestro"], ["km", "KM"], ["grado", "Grado"], ["asegurado", "Asegurado"], ["telefono", "Teléfono"]];
const VENTANA_XLSX = 30 * 60_000;
const esFormXlsx = t => String(t || "").split(/\n/).filter(l => /^\s*[1-7]\s*[.)\-:]/.test(l)).length >= 3;

// "xlsx" (con o sin patente) → formulario para completar. Si la patente está cargada, viene con los datos de la app.
async function pedirFormXlsx(env, m, quien, texto) {
  const p = buscarPatenteEnTexto(texto);
  let d = { patente: p?.patente || "" }, ref = null;
  if (p) {
    const enc = await buscarPatente(env, p.patente, quien.uid);
    const fijo = enc.length ? await operativoFijo(env, quien.numero, quien.uid) : null;
    const e = enc.find(x => x.cid === fijo?.cid) || enc[0];
    const v = e ? await fsGet(env, `companies/${e.cid}/vehicles/${e.vid}`) : null;
    if (v && !v.deleted) { d = { ...v, patente: v.patente || p.patente }; ref = { cid: e.cid, vid: e.vid }; }
  }
  await fsMerge(env, `bot_sesiones/${quien.numero}`, { xlsxForm: { t: Date.now(), ...(ref || {}) }, ts: Date.now() });
  const val = k => k === "grado" ? (d.grado ? String(d.grado) : "") : String(d[k] || "");
  return responder(env, dest(m), `📄 *Planilla Mercantil*\nCopiá, completá y mandá:\n\n` + CAMPOS_XLSX.map(([k, l], i) => `${i + 1}. ${l}: ${val(k)}`).join("\n"));
}

// Respuesta al formulario → arma el .xlsx y lo manda
async function completarFormXlsx(env, m, quien, texto, form) {
  const d = {};
  for (const l of String(texto).split(/\n/)) {
    const mm = l.match(/^\s*([1-7])\s*[.)\-:]\s*(?:[a-záéíóúñ ]+:)?\s*(.*)$/i);
    if (mm) d[CAMPOS_XLSX[mm[1] - 1][0]] = mm[2].trim();
  }
  const pat = buscarPatenteEnTexto(d.patente || "")?.patente || String(d.patente || "").toUpperCase().replace(/\s+/g, "");
  if (!pat) return responder(env, dest(m), "Falta la patente (punto 1).");
  const grado = Number(String(d.grado || "").match(/[1-4]/)?.[0]) || null;
  // Vehículo en la app: para la fecha del peritaje y para guardar siniestro y km
  let v = null, ruta = form?.vid ? `companies/${form.cid}/vehicles/${form.vid}` : null;
  if (!ruta) {
    const enc = await buscarPatente(env, pat, quien.uid);
    const fijo = enc.length ? await operativoFijo(env, quien.numero, quien.uid) : null;
    const e = enc.find(x => x.cid === fijo?.cid) || enc[0];
    if (e) ruta = `companies/${e.cid}/vehicles/${e.vid}`;
  }
  if (ruta) v = await fsGet(env, ruta).catch(() => null);
  if (v?.deleted) v = null;
  if (v && v.patente === pat) {
    const guardar = {};
    if (d.siniestro) guardar.siniestro = d.siniestro.replace(/\D/g, "");
    if (d.km) guardar.km = d.km.replace(/\D/g, "");
    if (Object.keys(guardar).length) await fsMerge(env, ruta, guardar).catch(() => {});
  }
  await fsMerge(env, `bot_sesiones/${quien.numero}`, { xlsxForm: null }).catch(() => {});
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const celdas = {
    C2: numDe(d.siniestro), C4: fechaExcel((v?.patente === pat && v.fechas?.peritado) || hoy), C5: "CHAPISTERIA OMAR",
    H4: String(d.asegurado || "").toUpperCase(), I4: null, J4: null, H5: pat, C6: numDe(d.telefono),
    H6: String(d.modelo || "").toUpperCase(), H7: { v: numDe(d.km), s: 112 }, B10: { v: grado ? `GRADO ${grado}` : "", s: 111 }, ...PANOS_MERCANTIL,   // estilo 111: Arial 10 (agregado a la plantilla)
    J40: TOTAL_MERCANTIL[grado] || null
  };
  const xlsx = await completarXlsx(MERCANTIL, celdas);
  await enviarDocumento(env, dest(m), xlsx, `Mercantil_${pat}.xlsx`, "");
}

// Manda un archivo por WhatsApp (Evolution: en base64; Meta: link de Cloudinary)
async function enviarDocumento(env, to, bytes, nombre, caption = "") {
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (String(to).startsWith("evo:")) {
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base = String(env.EVOLUTION_URL || "").replace(/\/+$/, "");
    const r = await fetch(`${base}/message/sendMedia/${env.EVOLUTION_INSTANCE || "desabollito"}`, { method: "POST",
      headers: { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: to.slice(4), mediatype: "document", mimetype: mime, media: btoa(bin), fileName: nombre, caption }) });
    if (!r.ok) { const t = await r.text(); await registrar(env, { ultimoErrorEnvio: `${new Date().toISOString()} · sendMedia · ${r.status} · ${t.slice(0, 300)}` }).catch(() => {}); }
    return r;
  }
  const up = await subirCloudinary(env, new Blob([bytes], { type: mime }), nombre, "desabollito/planillas", "raw");
  return enviar(env, to, { type: "document", document: { link: up.secure_url, filename: nombre, ...(caption ? { caption } : {}) } });
}

// ── Papelera y Cloudinary ────────────────────────────────────
const HORAS_PAPELERA = 48;
// Todo lo subido a Cloudinary que cuelga del vehículo (fotos, videos, documentos, desmontaje, notas…)
function mediaDe(obj, out = new Map()) {
  if (Array.isArray(obj)) obj.forEach(x => mediaDe(x, out));
  else if (obj && typeof obj === "object") {
    if (typeof obj.publicId === "string" && obj.publicId) {
      const u = String(obj.url || "");
      const tipo = obj.tipo === "video" || /\/video\/upload\//.test(u) ? "video" : /\/raw\/upload\//.test(u) ? "raw" : "image";
      out.set(tipo + ":" + obj.publicId, { publicId: obj.publicId, tipo });
    }
    for (const [k, x] of Object.entries(obj)) if (k !== "historial" && x && typeof x === "object") mediaDe(x, out);
  }
  return out;
}
async function borrarCloudinary(env, items) {
  const porTipo = {};
  for (const { publicId, tipo } of items) (porTipo[tipo] ||= []).push(publicId);
  const auth = "Basic " + btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
  for (const [tipo, ids] of Object.entries(porTipo)) {
    for (let i = 0; i < ids.length; i += 100) {
      const q = ids.slice(i, i + 100).map(x => "public_ids[]=" + encodeURIComponent(x)).join("&");
      const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${tipo}/upload?${q}`, { method: "DELETE", headers: { Authorization: auth } });
      if (!r.ok) console.error("cloudinary delete", tipo, r.status, (await r.text()).slice(0, 200));
    }
  }
}
async function purgarVehiculo(env, ruta, v) {
  await borrarCloudinary(env, [...mediaDe(v).values()]);
  await fsDelete(env, ruta);
}
async function vaciarPapelera(env) {
  const vs = [];
  for (const c of await fsList(env, "companies"))
    vs.push(...await fsQuery(env, `companies/${c.__id}`, "vehicles", { field: "deleted", op: "EQUAL", value: true }, 200).catch(() => []));
  const limite = Date.now() - HORAS_PAPELERA * 3600_000;
  let n = 0;
  for (const v of vs) {
    const t = Date.parse(v.deletedAt || "");
    if (!t) {   // sin fecha (borrado por el bot): empieza a contar ahora
      await fs(env, `${base(env)}:commit`, { method: "POST", body: JSON.stringify({ writes: [{
        transform: { document: nombreDoc(env, v.__ruta), fieldTransforms: [{ fieldPath: "deletedAt", setToServerValue: "REQUEST_TIME" }] } }] }) });
      continue;
    }
    if (t < limite) { await purgarVehiculo(env, v.__ruta, v); n++; }
  }
  if (n) await registrar(env, { ultimaPapelera: `${new Date().toISOString()} · ${n} vehículo(s) eliminados` }).catch(() => {});
}
async function miembroDe(env, idToken, cid) {
  const uid = await verificarIdToken(env, idToken).catch(() => null);
  if (!uid || !idValido(cid)) return null;
  const c = await fsGet(env, `companies/${cid}`);
  return c && (c.members || []).includes(uid) ? { uid, c } : null;
}
// Fotos o documentos que se quitaron de un vehículo: se borran de Cloudinary
// (solo los que ya no están en el vehículo, para no borrar algo en uso)
async function borrarMediaApi(env, { idToken, cid, vid, items }) {
  const m = await miembroDe(env, idToken, cid);
  if (!m || !idValido(vid)) return json({ ok: false, error: "No autorizado" }, 403);
  const v = await fsGet(env, `companies/${cid}/vehicles/${vid}`);
  const enUso = v ? mediaDe(v) : new Map();
  const lista = [...mediaDe(Array.isArray(items) ? items.slice(0, 50) : []).entries()].filter(([k]) => !enUso.has(k)).map(([, x]) => x)
    .filter(x => x.publicId.startsWith("desabollito/"));
  if (lista.length) await borrarCloudinary(env, lista);
  return json({ ok: true, borradas: lista.length });
}
// "Eliminar para siempre" desde la papelera: borra el vehículo y sus fotos
async function eliminarVehiculoApi(env, { idToken, cid, vid }) {
  const m = await miembroDe(env, idToken, cid);
  if (!m || !idValido(vid)) return json({ ok: false, error: "No autorizado" }, 403);
  const ruta = `companies/${cid}/vehicles/${vid}`;
  const v = await fsGet(env, ruta);
  if (!v) return json({ ok: true });
  if (!v.deleted) return json({ ok: false, error: "Primero tiene que estar en la papelera" }, 400);
  const propio = [v.deletedBy, v.createdBy, v.createdByUid].includes(m.uid);
  if (!propio && !["owner", "admin"].includes(m.c.roles?.[m.uid])) return json({ ok: false, error: "No autorizado" }, 403);
  await purgarVehiculo(env, ruta, v);
  return json({ ok: true });
}

async function moverVehiculo(env, { idToken, cid, vid, destino }) {
  let uid;
  try { uid = await verificarIdToken(env, idToken); } catch { return json({ ok: false, error: "No autorizado" }, 403); }
  if (![cid, vid, destino].every(idValido) || cid === destino) return json({ ok: false, error: "Datos inválidos" }, 400);
  const [cOrig, cDest] = await Promise.all([fsGet(env, `companies/${cid}`), fsGet(env, `companies/${destino}`)]);
  if (!cOrig || !cDest || !(cOrig.members || []).includes(uid) || !(cDest.members || []).includes(uid))
    return json({ ok: false, error: "Tenés que ser parte de los dos operativos" }, 403);
  if (cDest.roles?.[uid] === "desmontaje") return json({ ok: false, error: "No podés cargar vehículos en ese operativo" }, 403);
  const r = await fs(env, `${base(env)}/companies/${cid}/vehicles/${vid}`);
  if (!r.ok) return json({ ok: false, error: "No encontré el vehículo" }, 404);
  const docV = await r.json(), f = docV.fields || {};
  const creador = f.createdBy?.stringValue === uid || f.createdByUid?.stringValue === uid;
  if (!creador && !["owner", "admin"].includes(cOrig.roles?.[uid])) return json({ ok: false, error: "Solo quien lo cargó o un administrador puede moverlo" }, 403);
  const quien = (await fsGet(env, `users/${uid}`).catch(() => null))?.name || "";
  const hist = f.historial?.arrayValue?.values || [];
  // La localidad que era el nombre del operativo pasa a ser el nombre del nuevo
  const loc = f.localidad?.stringValue === (cOrig.name || "") ? { localidad: aValor(cDest.name || "") } : {};
  const fields = { ...f, ...loc, historial: { arrayValue: { values: [...hist,
    aValor({ t: Date.now(), uid, por: quien, txt: `Lo movió de ${cOrig.name || "otro operativo"} a ${cDest.name || "este operativo"}` })] } } };
  const c = await fs(env, `${base(env)}:commit`, { method: "POST", body: JSON.stringify({ writes: [
    { update: { name: nombreDoc(env, `companies/${destino}/vehicles/${vid}`), fields }, currentDocument: { exists: false } },
    { delete: nombreDoc(env, `companies/${cid}/vehicles/${vid}`) }
  ] }) });
  if (!c.ok) return json({ ok: false, error: "No se pudo mover: " + (await c.text()).slice(0, 120) }, 500);
  return json({ ok: true, operativo: cDest.name || "" });
}

// Todos los operativos y todos los usuarios
async function adminDatos(env, { idToken }) {
  if (!(await soloCreador(env, idToken))) return json({ ok: false, error: "No autorizado" }, 403);
  const [users, comps] = await Promise.all([fsList(env, "users"), fsList(env, "companies")]);
  const nombreDe = Object.fromEntries(users.map(u => [u.__id, u.username ? "@" + u.username : u.name || u.__id]));
  // Cantidad de vehículos de cada operativo (sin los de la papelera)
  const contar = async (cid, borrados) => {
    const r = await fs(env, `${base(env)}/companies/${cid}:runAggregationQuery`, { method: "POST", body: JSON.stringify({ structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: "vehicles" }], ...(borrados ? { where: { fieldFilter: { field: { fieldPath: "deleted" }, op: "EQUAL", value: { booleanValue: true } } } } : {}) },
      aggregations: [{ alias: "n", count: {} }] } }) });
    if (!r.ok) return null;
    return Number((await r.json())?.[0]?.result?.aggregateFields?.n?.integerValue || 0);
  };
  const cuentas = Object.fromEntries(await Promise.all(comps.map(async c => {
    const [t, b] = await Promise.all([contar(c.__id, false), contar(c.__id, true)]).catch(() => [null, null]);
    return [c.__id, t === null ? null : t - (b || 0)];
  })));
  return json({ ok: true,
    usuarios: users.map(u => ({ uid: u.__id, name: u.name || "", username: u.username || "", whatsapp: u.whatsapp || "",
      aprobado: u.aprobado !== false, rechazado: !!u.rechazado }))
      .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username)),
    operativos: comps.map(c => ({ id: c.__id, name: c.name || "Sin nombre", vehiculos: cuentas[c.__id],
      miembros: (c.members || []).map(m => ({ uid: m, quien: nombreDe[m] || c.memberNames?.[m] || "(usuario borrado)", rol: c.roles?.[m] || "" })) }))
      .sort((a, b) => a.name.localeCompare(b.name)) });
}

// Ajustes generales (por ahora: aviso al cliente cuando el auto queda reparado)
// Planilla de asegurados: reemplaza toda la planilla (filas vacías = borrarla)
async function adminPadron(env, { idToken, filas }) {
  if (!(await soloCreador(env, idToken))) return json({ ok: false, error: "No autorizado" }, 403);
  const nuevas = (Array.isArray(filas) ? filas : []).filter(f => /^[A-Z0-9]{6,7}$/.test(f?.patente || "") && f.nombre)
    .map(f => ({ patente: f.patente, nombre: String(f.nombre).slice(0, 80) })).slice(0, 20000);
  const commit = writes => fs(env, `${base(env)}:commit`, { method: "POST", body: JSON.stringify({ writes }) });
  // borrar las patentes que ya no están
  const viejas = (await fsList(env, "padron")).map(d => d.__id), quedan = new Set(nuevas.map(f => f.patente));
  const borrar = viejas.filter(p => !quedan.has(p));
  for (let i = 0; i < borrar.length; i += 400) await commit(borrar.slice(i, i + 400).map(p => ({ delete: nombreDoc(env, `padron/${p}`) })));
  for (let i = 0; i < nuevas.length; i += 400)
    await commit(nuevas.slice(i, i + 400).map(f => ({ update: { name: nombreDoc(env, `padron/${f.patente}`), fields: { nombre: aValor(f.nombre) } } })));
  await fsMerge(env, "config/app", { padronN: nuevas.length, padronFecha: Date.now() });
  return json({ ok: true, n: nuevas.length });
}

const CONFIG_CLAVES = ["avisoReparado", "documentos"];   // interruptores del creador (todos arrancan encendidos)
async function adminConfig(env, body) {
  if (!(await soloCreador(env, body.idToken))) return json({ ok: false, error: "No autorizado" }, 403);
  const cambios = Object.fromEntries(CONFIG_CLAVES.filter(k => typeof body[k] === "boolean").map(k => [k, body[k]]));
  if (typeof body.mensajeWa === "string") cambios.mensajeWa = body.mensajeWa.slice(0, 2000);
  if (Object.keys(cambios).length) await fsMerge(env, "config/app", cambios);
  const c = await fsGet(env, "config/app");
  return json({ ok: true, config: { ...Object.fromEntries(CONFIG_CLAVES.map(k => [k, c?.[k] !== false])), padronN: c?.padronN || 0, mensajeWa: c?.mensajeWa || "" } });
}

// Elimina un usuario de la app: cuenta de acceso, perfil, nombre de usuario, WhatsApp y membresías
async function adminBorrarUsuario(env, { idToken, uid }) {
  const yo = await soloCreador(env, idToken);
  if (!yo) return json({ ok: false, error: "No autorizado" }, 403);
  if (!idValido(uid) || uid === yo) return json({ ok: false, error: "No se puede borrar ese usuario" }, 400);
  const u = await fsGet(env, `users/${uid}`);
  await borrarCuentaAuth(env, uid).catch(e => console.error("borrar cuenta", e));
  if (u?.username) {
    await fsDelete(env, `usernames/${u.username}`).catch(() => {});
    await fsDelete(env, `bot_pendientes/${u.username}`).catch(() => {});
  }
  if (u?.whatsapp) await fsDelete(env, `bot_numeros/${u.whatsapp}`).catch(() => {});
  const sinUid = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== uid));
  for (const c of await fsList(env, "companies")) {
    if (!(c.members || []).includes(uid)) continue;
    const cambios = { members: c.members.filter(m => m !== uid) };
    for (const k of ["roles", "memberNames", "memberTags", "memberPhotos", "memberUsers", "memberAddedBy"]) if (c[k]) cambios[k] = sinUid(c[k]);
    await fsMerge(env, `companies/${c.__id}`, cambios).catch(e => console.error("quitar de operativo", e));
  }
  await fsDelete(env, `users/${uid}`).catch(() => {});
  return json({ ok: true });
}

// Borra la cuenta de acceso (Firebase Authentication) de un usuario rechazado
async function borrarCuentaAuth(env, uid) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenFirebase(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid })
  });
  if (!r.ok) throw new Error(`No se pudo borrar la cuenta ${uid}: ${r.status} ${await r.text()}`);
}

const idValido = x => /^[A-Za-z0-9_-]{1,120}$/.test(String(x || ""));

// Solicitudes de la app (eliminar, quitar foto/documento, acceso de edición): aviso al administrador
async function avisarSolicitud(env, { cid, sid }) {
  if (!idValido(cid) || !idValido(sid)) return json({ ok: false, error: "Datos inválidos" }, 400);
  const ruta = `companies/${cid}/solicitudes/${sid}`;
  const sol = await fsGet(env, ruta);
  if (!sol) return json({ ok: false, error: "No existe la solicitud" }, 404);
  if (sol.notificado) return json({ ok: true, yaAvisado: true });
  const c = await fsGet(env, `companies/${cid}`);
  const quien = sol.pedidoPorUser ? "@" + sol.pedidoPorUser : sol.pedidoPorNombre || "Alguien";
  const que = { eliminar: "eliminar el vehículo", foto: "quitar una foto de", documento: `quitar el documento “${sol.item?.name || ""}” de`, editar: "acceso para editar" }[sol.tipo || "eliminar"];
  const auto = `*${sol.modelo || "Vehículo"}*${sol.patente ? ` (${sol.patente})` : ""}`;
  const r = await enviar(env, destinoNumero(env, numeroAdmin(env)), { type: "text", text: { preview_url: false, body:
    `📩 *Nueva solicitud* en ${c?.name || "un operativo"}\n\n${quien} pide ${que} ${auto}` +
    `${sol.cargadoPor ? `, cargado por ${sol.cargadoPor}` : ""}.\n\nPara aprobarla o rechazarla: ${APP_URL}/#/papelera` } });
  await fsMerge(env, ruta, { notificado: true });
  return json({ ok: !!r?.ok });
}

// Alguien fue sumado a un operativo: se le avisa por WhatsApp si tiene el número vinculado (una sola vez)
async function avisarAgregado(env, { cid, uid }) {
  if (!idValido(cid) || !idValido(uid)) return json({ ok: false, error: "Datos inválidos" }, 400);
  const c = await fsGet(env, `companies/${cid}`);
  if (!c || !(c.members || []).includes(uid)) return json({ ok: false, error: "No es miembro" });
  const u = await fsGet(env, `users/${uid}`);
  if (!u?.whatsapp) return json({ ok: false, error: "Sin WhatsApp vinculado" });
  if ((u.avisosOperativos || []).includes(cid)) return json({ ok: true, yaAvisado: true });
  const por = c.memberAddedBy?.[uid];
  const quien = por?.user ? "@" + por.user : por?.por || "Alguien";
  const nombre = String(u.name || "").trim().split(/\s+/)[0];
  const r = await enviar(env, destinoNumero(env, u.whatsapp), { type: "text", text: { preview_url: false, body:
    `👋 ${nombre ? nombre + ", " : ""}${quien} te agregó al operativo *${c.name || ""}*.\n\nYa podés cargar vehículos ahí desde la app o por acá.` } });
  await fsMerge(env, `users/${uid}`, { avisosOperativos: [...(u.avisosOperativos || []), cid] });
  return json({ ok: !!r?.ok });
}

// Alguien sin operativo pide unirse: aviso por WhatsApp al administrador que eligió
async function avisarPedidoUnion(env, { uid }) {
  if (!idValido(uid)) return json({ ok: false, error: "Datos inválidos" }, 400);
  const p = await fsGet(env, `pedidosUnion/${uid}`);
  if (!p?.para || p.avisado) return json({ ok: false });
  const a = await fsGet(env, `users/${p.para}`);
  if (!a?.whatsapp) return json({ ok: false, error: "Sin WhatsApp vinculado" });
  const nombre = String(a.name || "").trim().split(/\s+/)[0];
  const r = await enviar(env, destinoNumero(env, a.whatsapp), { type: "text", text: { preview_url: false, body:
    `📩 ${nombre ? nombre + ", " : ""}*${p.name || ""}* (@${p.username || ""}) quiere unirse a tu operativo.\n\nPara sumarlo entrá a la app: ${APP_URL}` } });
  await fsMerge(env, `pedidosUnion/${uid}`, { avisado: true }).catch(() => {});
  return json({ ok: !!r?.ok });
}

// Conexión de Evolution del número de la empresa (el que usan los clientes). Solo envía avisos: no tiene webhook.
const instanciaClientes = env => env.EVOLUTION_INSTANCE_CLIENTES || "clientes";
async function estadoEvolution(env, inst) {
  try {
    const base = String(env.EVOLUTION_URL || "").replace(/\/+$/, "");
    const r = await fetch(`${base}/instance/connectionState/${inst}`, { headers: { apikey: env.EVOLUTION_APIKEY } });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    return j?.instance?.state || j?.state || `error ${r.status}`;
  } catch { return null; }
}

// Cancela la carga abierta: si el bot recién creó el vehículo, lo borra (sin fotos) o lo manda a
// la papelera de quien lo cargó (con fotos). Si el vehículo ya existía, solo deja de recibir fotos.
async function cancelarCarga(env, numero, s, quien) {
  const ruta = `companies/${s.cid}/vehicles/${s.vid}`;
  const item = (s.tanda || []).find(x => x.vid === s.vid);
  const fotos = Number(s[campoConteo(s.vid)] || 0);
  let txt;
  if (item?.nuevo) {
    const v = await fsGet(env, ruta);
    if (v && !(v.fotos || []).length) { await fsDelete(env, ruta); txt = `❌ Cancelado: borré ${etiqueta(s)}.`; }
    else if (v) { await fsMerge(env, ruta, { deleted: true, deletedBy: quien?.uid || "" }); txt = `❌ Cancelado: ${etiqueta(s)} fue a tu papelera (tenía fotos).`; }
    else txt = "❌ Cancelado.";
  } else txt = `❌ Cancelado: dejé de cargar fotos en ${etiqueta(s)}${fotos ? ` (las ${fotos} que ya llegaron quedan guardadas)` : ""}.`;
  const tanda = (s.tanda || []).filter(x => x.vid !== s.vid);
  await fsSet(env, `bot_sesiones/${numero}`, { ts: Date.now(), ...(tanda.length ? { tanda } : {}) });
  return txt;
}

// ── Vehículo abierto para todo el grupo ("@abierto") ─────────────────────────
const ABIERTO = /(^|\s)@(?:abierto|a)\b/i;   // "@a" = "@abierto"
const ABIERTO_G = /(^|\s)@(?:abierto|a)\b/gi;
const CERRADO = /(^|\s)@(?:cerrado|c)\b/i;   // "@c" = "@cerrado"
const idGrupo = m => String(m._to || "").replace(/[^A-Za-z0-9_-]/g, "_");
async function grupoAbierto(env, m) {
  if (!m._grupo) return null;
  const g = await fsGet(env, `bot_grupos/${idGrupo(m)}`);
  if (!g?.vid || Date.now() - Number(g.ts || 0) > SESION_HORAS * 3600 * 1000) return null;
  return g;
}
async function abrirParaGrupo(env, m, s) {
  await fsSet(env, `bot_grupos/${idGrupo(m)}`, { cid: s.cid, vid: s.vid, patente: s.patente, modelo: s.modelo || "",
    operativo: s.operativo || "", por: normalizarNumero(m.from), ts: Date.now(), desde: horaDe(m), msgId: m.id, msgKey: m._key || null, tildado: false });
  return reaccionar(env, dest(m), m.id, "▶️", m._key);   // esperando fotos
}
