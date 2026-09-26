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
    if (url.pathname === "/registro" || url.pathname === "/avisar") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
      let body = {};
      try { body = await req.json(); } catch {}
      try { return url.pathname === "/registro" ? await nuevoRegistro(env, body) : await avisarCliente(env, body); }
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
  if (m.type === "image" || m.type === "document") return alRecibirArchivo(env, m, quien);
  // Otros tipos (reacciones, avisos de álbum "unsupported", stickers, etc.): se ignoran en silencio
  await registrar(env, { ultimoTipoIgnorado: `${new Date().toISOString()} · ${m.type} · ${JSON.stringify(m).slice(0, 300)}` });
}

// ═══════════════════════════════════════════════════════════════
//  Intérprete de datos de vehículos escritos en cualquier orden:
//  "Corolla AB099BA Riv 1137709755 Monte" → modelo, patente,
//  compañía, teléfono y localidad.
// ═══════════════════════════════════════════════════════════════
const sinTildes = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Compañías de seguro: nombre oficial + formas de escribirlas
const COMPANIAS = [
  ["Rivadavia", ["rivadavia"]], ["San Cristóbal", ["san cristobal", "sancristobal", "sc"]], ["Sancor", ["sancor"]],
  ["Paraná Seguros", ["parana seguros", "parana"]], ["Provincia Seguros", ["provincia seguros", "provincia"]],
  ["Mapfre", ["mapfre"]], ["La Segunda", ["la segunda", "segunda"]], ["Mercantil Andina", ["mercantil andina", "mercantil"]],
  ["Federación", ["federacion patronal", "federacion", "patronal", "fed patronal"]], ["Answer", ["answer"]],
  ["Allianz", ["allianz"]], ["Zurich", ["zurich"]], ["La Caja", ["la caja"]], ["Galicia Seguros", ["galicia"]],
  ["Nación Seguros", ["nacion seguros"]], ["Sura", ["sura"]], ["Río Uruguay", ["rio uruguay", "rus"]],
  ["Orbis", ["orbis"]], ["Meridional", ["meridional"]], ["Integrity", ["integrity"]], ["El Norte", ["el norte"]],
  ["Triunfo", ["triunfo"]], ["La Holando", ["la holando", "holando"]], ["Libra", ["libra"]], ["Experta", ["experta"]],
  ["HDI", ["hdi"]], ["Chubb", ["chubb"]], ["ATM", ["atm"]], ["Berkley", ["berkley"]], ["Cooperación Seguros", ["cooperacion"]],
  ["Victoria", ["victoria"]], ["Boston", ["boston"]], ["Agrosalta", ["agrosalta"]], ["Evolución", ["evolucion"]]
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
export function buscarPatenteEnTexto(texto) {
  const m = String(texto).match(RE_PATENTE);
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

// ── Nombre del cliente: "cliente Juan Pérez", "asegurado: Ana Ruiz", "titular …"
const RE_CLIENTE = /\b(?:cliente|asegurad[oa]|titular|nombre|sr\.?|sra\.?)\s*:?\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü'´]+(?:\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü'´]+){0,3})/i;

const titulo = t => t.split(/\s+/).map(p => /\d/.test(p) || p.length <= 3 && p === p.toUpperCase() ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");

/**
 * @param {string} texto
 * @param {{ localidades?: string[], companias?: string[] }} extra  valores ya usados en la app
 */
export function interpretar(texto, extra = {}) {
  let resto = ` ${String(texto || "")} `;
  const r = { patente: null, modelo: "", compania: "", telefono: "", localidad: "", grado: null, otros: "", asegurado: "", piezas: {} };

  // 1. Patente
  const p = buscarPatenteEnTexto(resto);
  if (p) { r.patente = p.patente; resto = resto.slice(0, p.desde) + " " + resto.slice(p.desde + p.largo); }

  // 2. Grado: "grado 2", "g2", "G 3"
  resto = resto.replace(/\b(?:grado|g)\s*([123])\b/i, (_, g) => { r.grado = Number(g); return " "; });

  // 3. Teléfono: 8 a 13 dígitos (con o sin +54, espacios o guiones)
  resto = resto.replace(/(?:\+?\s?\d[\d\s-]{6,16}\d)/g, m => {
    const d = m.replace(/\D/g, "");
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
    r.asegurado = titulo(palabrasC.join(" "));
    resto = resto.replace(mc[0].split(/\s+/).slice(0, 1 + palabrasC.length).join(" "), " ");
  }

  // 4. Palabras restantes: compañía, localidad, marca/modelo (buscando primero las frases más largas)
  const palabras = resto.split(/[\s,;/|]+/).filter(Boolean);
  const norm = palabras.map(w => sinTildes(w.replace(/[.:]+$/, "")));
  const tipo = new Array(palabras.length).fill(null);
  const idxLoc = indice([...LOCALIDADES, ...(extra.localidades || [])]);
  const compExtra = (extra.companias || []).map(c => [c, [sinTildes(c)]]);
  const todasComp = [...COMPANIAS, ...compExtra];

  const compDe = frase => {
    // Coincidencia exacta con un alias, o abreviatura (3+ letras) que solo encaje con una compañía
    const exacta = todasComp.find(([, al]) => al.includes(frase));
    if (exacta) return exacta[0];
    if (frase.length < 3 || frase.includes(" ")) return null;
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
      if (!asignado && idxLoc.has(frase) && !((IDX_MODELOS.has(frase) || IDX_MARCAS.has(frase)) && frase !== "santa fe")) {
        if (!r.localidad) { r.localidad = idxLoc.get(frase); asignado = "localidad"; }
      }
      if (!asignado && (IDX_MARCAS.has(frase) || IDX_MODELOS.has(frase))) asignado = "modelo";
      if (asignado) for (let k = i; k < i + n; k++) tipo[k] = asignado;
    }
  }

  // Modelo: marcas/modelos reconocidos + palabras desconocidas pegadas a ellos ("Chery Tiggo 4")
  const idxModelo = tipo.map((t, i) => t === "modelo" ? i : -1).filter(i => i >= 0);
  if (idxModelo.length) {
    let ini = Math.min(...idxModelo), fin = Math.max(...idxModelo);
    // Suma palabras desconocidas pegadas ("Chery Tiggo 4"), salvo que parezcan un nombre ("Carlos Méndez")
    const esNombre = w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü']+$/.test(w);
    let libres = 0;
    while (fin + 1 + libres < palabras.length && !tipo[fin + 1 + libres]) libres++;
    const grupo = palabras.slice(fin + 1, fin + 1 + libres);
    const pareceNombre = grupo.length >= 2 && grupo.slice(0, 2).every(esNombre);
    if (!pareceNombre) {
      let sum = 0;
      while (sum < Math.min(2, grupo.length) && grupo[sum].length <= 12) sum++;
      fin += sum;
    }
    for (let k = ini; k <= fin; k++) if (!tipo[k] || tipo[k] === "modelo") tipo[k] = "modelo";
    r.modelo = palabras.filter((_, k) => tipo[k] === "modelo").map((w, j, arr) => {
      const n2 = sinTildes(w);
      return IDX_MARCAS.get(n2) || IDX_MODELOS.get(n2) || titulo(w);
    }).join(" ");
  }

  // Lo que no se reconoció: primero completa modelo, después localidad, el resto queda como observación
  const grupos = [];
  palabras.forEach((w, i) => {
    if (tipo[i]) return;
    if (i > 0 && !tipo[i - 1] && grupos.length) grupos[grupos.length - 1].push(w); else grupos.push([w]);
  });
  for (const g of grupos) {
    const t = g.join(" ");
    const pareceNombre = g.length >= 2 && g.length <= 4 && g.every(w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü']+$/.test(w));
    if (!r.asegurado && pareceNombre && r.modelo) { r.asegurado = t; continue; }
    if (!r.modelo) r.modelo = titulo(t);
    else if (!r.localidad) r.localidad = titulo(t);
    else r.otros = (r.otros ? r.otros + " " : "") + t;
  }
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
  "Para finalizar, enviá *OK* o continuá con otro vehículo.";
const SALUDO = "¡Hola, soy Desabollito 🚘!\n\n" + INSTRUCCIONES;

// Saludo según la hora de Argentina (UTC-3): con el nombre de la cuenta de la app;
// si todavía no se conoce, con el nombre de WhatsApp
function saludoHora(quien) {
  const h = (new Date().getUTCHours() + 21) % 24;
  const franja = h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches";
  const nombre = String(quien?.appNombre || "").trim() || quien?.username || String(quien?.waNombre || "").trim();
  return `${franja}${nombre ? " " + nombre : ""}! 👋\n\n` + INSTRUCCIONES;
}

const AYUDA =
  "🚗 *Cómo usar Desabollito*\n\n" +
  "- Envia los datos del vehiculo en un solo mensaje, no importa el orden.\n\n" +
  "- Luego envia las fotos\n\n" +
  "- Listo! Seguí con otro o enviá *OK* para finalizar.\n\n" +
  "🚨 *Operativo*\n\n" +
  "Si nombrás la localidad del operativo en el mensaje, se asignarán los vehiculos a ese operativo.\n\n" +
  "Para cambiarlo escribí *operativo*.";

const lineaOperativo = fijo => `\n\n> Operativo actual: ${fijo ? fijo.operativo : "ninguno (escribí *operativo* para elegirlo)"}`;

const etiqueta = s => s.modelo ? `*${s.modelo}* (${s.patente})` : `*${s.patente}*`;
const PALABRAS_CIERRE = ["ok", "oka", "okey", "okay", "okk", "listo", "lista", "ya", "ya está", "ya esta", "fin", "terminé", "termine",
  "cerrar", "chau", "gracias", "dale", "perfecto", "joya", "bien", "👍", "👌", "✅"];
const limpio = t => t.toLowerCase().trim().replace(/[!.¡¿?\s]+$/g, "").replace(/^[¡¿\s]+/, "");
const esCierre = t => PALABRAS_CIERRE.includes(limpio(t));
const esSaludo = t => /^(hola+|buenas|buen d[ií]a|buenas tardes|buenas noches|hey|hi|start|inicio)$/.test(limpio(t));
const esAyuda = t => /^(ayuda|help|\?|menu|menú|comandos|info)$/.test(limpio(t));
const esLocalizar = t => /^(localiz|ubic|encontr|busc|d[oó]nde\s+est|mostr|pas[aá]me\s+el\s+link|link)/i.test(limpio(t));
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
async function operativoFijo(env, numero) {
  const o = await fsGet(env, `bot_operativo/${numero}`);
  if (!o?.cid) return null;
  const c = await fsGet(env, `companies/${o.cid}`);
  return c ? { cid: o.cid, operativo: c.name || o.operativo } : null;
}
const fijarOperativo = (env, numero, op) => fsSet(env, `bot_operativo/${numero}`, { cid: op.cid, operativo: op.operativo, ts: Date.now() });

async function listaOperativos(env) {
  return (await fsList(env, "companies"))
    .map(o => ({ cid: o.__id, operativo: o.name || "Operativo" }))
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
  const t = limpio(texto);
  const hora = horaDe(m);
  const s = await leerSesion(env, numero);

  if (esSaludo(texto)) return responder(env, dest(m), saludoHora(quien));
  if (esAyuda(texto)) return responder(env, dest(m), AYUDA);

  // Comando: cambiar de operativo
  if (esCambioOperativo(texto)) {
    const ops = await listaOperativos(env);
    if (!ops.length) return responder(env, dest(m), "No hay operativos creados en la app todavía.");
    const fijo = await operativoFijo(env, numero);
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
    await fijarOperativo(env, numero, op);
    const nuevo = await crearVehiculo(env, op, s.crear.datos, quien);
    await abrir(env, numero, nuevo, hora, s, true);
    return tilde(env, m);
  }

  // Patente repetida en varios operativos: ¿cuál?
  if (s?.opciones?.length && numeroElegido !== null) {
    const v = s.opciones[numeroElegido - 1];
    if (!v) return responder(env, dest(m), `Elegí un número del 1 al ${s.opciones.length}.`);
    await abrirExistente(env, numero, v, s.datos || {}, hora, s, true, quien);
    return v.fotos ? responder(env, dest(m), `⚠️ ${etiqueta(v)} ya tiene ${resumen(v.fotos)} subidas. Si mandás más, se suman a esas.`) : tilde(env, m);
  }

  // Localizar: "Ubicame NTK100" → link al vehículo en la app
  if (esLocalizar(texto) && buscarPatenteEnTexto(texto)) {
    const patente = buscarPatenteEnTexto(texto).patente;
    const encontrados = await buscarPatente(env, patente);
    if (!encontrados.length) return responder(env, dest(m), `🔎 No encontré la patente *${patente}*.`);
    return responder(env, dest(m), encontrados.map(v =>
      `📍 ${etiqueta(v)} · ${v.operativo}\n${APP_URL}/#/o/${v.cid}/v/${v.vid}`).join("\n\n"));
  }

  // Datos de un vehículo (tiene patente). Si nombra un operativo, se usa ese.
  const patenteEnTexto = buscarPatenteEnTexto(texto);
  let mencion = null, textoDatos = texto;
  if (patenteEnTexto) {
    mencion = operativoMencionado(texto, await listaOperativos(env));
    if (mencion) textoDatos = quitarFrase(texto, mencion.frase);
  }
  const datos = interpretar(textoDatos);
  if (mencion) datos.operativo = mencion.op;
  if (datos.patente) {
    if (abierta(s) && s.patente === datos.patente) {
      await actualizarDatos(env, s, datos, quien);
      return tilde(env, m);
    }
    if (abierta(s)) await cerrarEnSilencio(env, numero, hora);
    const pregunta = await prepararVehiculo(env, numero, datos, hora, await leerSesion(env, numero), quien);
    return pregunta ? responder(env, dest(m), pregunta) : tilde(env, m);
  }

  // Texto sin patente: OK (o cualquier texto después de mandar fotos) → resumen de la tanda
  const fotosDelActual = abierta(s) ? Number(s[campoConteo(s.vid)] || 0) : 0;
  if ((s?.tanda?.length && esCierre(texto)) || fotosDelActual > 0) {
    return responder(env, dest(m), await resumenDeTanda(env, numero, s, hora));
  }
  if (s?.crear?.datos?.patente) {
    return responder(env, dest(m), `Respondé con el número del operativo donde creo *${s.crear.datos.patente}*, o 0 para cancelar.`);
  }
  if (abierta(s)) return; // vehículo abierto, todavía sin fotos: el bot espera en silencio
  if (m._grupo) return; // en grupos solo se responde a patentes, fotos, OK y comandos
  if (esCierre(texto)) return responder(env, dest(m), "👌 " + OTRO);
  return responder(env, dest(m), "No encontré una patente en tu mensaje 🤔\n\nEnviame los datos del vehículo, por ejemplo:\n_Corolla AB099BA Riv 1137709755 Monte_\n\nO escribí *ayuda*.");
}

// Busca la patente: si existe la abre (y completa los datos nuevos); si no, la crea
// en el operativo nombrado o en el último usado. Devuelve un texto solo si hay que
// preguntarle algo al usuario; si no, null (el bot solo marca la tilde).
async function prepararVehiculo(env, numero, datos, hora, previa, quien) {
  const encontrados = await buscarPatente(env, datos.patente);
  // Prioridad: operativo nombrado en el mensaje → último operativo usado → preguntar
  const mencionado = datos.operativo || null;
  if (mencionado) await fijarOperativo(env, numero, mencionado);
  const fijo = mencionado || await operativoFijo(env, numero);
  delete datos.operativo;

  if (encontrados.length) {
    const v = encontrados.length === 1 ? encontrados[0] : encontrados.find(x => x.cid === fijo?.cid);
    if (!v) {
      await fsMerge(env, `bot_sesiones/${numero}`, { opciones: encontrados.slice(0, 9), datos, ts: Date.now() });
      return `La patente *${datos.patente}* está en más de un operativo. ¿Cuál es? Respondé con el número:\n\n` +
        encontrados.slice(0, 9).map((x, i) => `${i + 1}. ${x.operativo} · ${x.modelo || "sin modelo"}`).join("\n");
    }
    // Si la patente ya existe en otro operativo distinto del nombrado, se usa esa (no se duplica)
    await abrirExistente(env, numero, v, datos, hora, previa, !mencionado, quien);
    return v.fotos ? `⚠️ ${etiqueta(v)} ya tiene ${resumen(v.fotos)} subidas. Si mandás más, se suman a esas.` : null;
  }

  if (fijo) {
    const nuevo = await crearVehiculo(env, fijo, datos, quien);
    await abrir(env, numero, nuevo, hora, previa, true);
    return null;
  }

  const operativos = await listaOperativos(env);
  if (!operativos.length) return "No hay operativos creados en la app todavía.";
  await fsMerge(env, `bot_sesiones/${numero}`, { crear: { datos, operativos }, ts: Date.now() });
  return `🔎 La patente *${datos.patente}* no está cargada.\n\n¿En qué operativo la creo? Respondé con el número:\n\n` + menuOperativos(operativos);
}

async function abrirExistente(env, numero, v, datos, hora, previa, fijar = true, quien = null) {
  await actualizarDatos(env, v, datos, quien);
  await abrir(env, numero, v, hora, previa, false);
  // El operativo del vehículo abierto pasa a ser el actual (salvo que se haya nombrado otro)
  if (fijar) await fijarOperativo(env, numero, v);
}

// Completa en la web los datos que vinieron en el mensaje (solo los que cambian)
async function actualizarDatos(env, v, datos, quien) {
  const campos = { modelo: "modelo", compania: "compañía", telefono: "teléfono", localidad: "localidad", grado: "grado", asegurado: "cliente" };
  const nuevos = {}, nombres = [];
  for (const [k, nombre] of Object.entries(campos)) {
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
    anterior: anterior || null, tanda
  });
}

async function buscarPatente(env, patente) {
  let vehiculos;
  try {
    // Una sola consulta sobre todos los operativos
    vehiculos = await fsQuery(env, "", "vehicles", { field: "patente", op: "EQUAL", value: patente }, 20, true);
  } catch (e) {
    // Si falta el índice de grupo de colecciones, se recorre operativo por operativo
    console.warn("Consulta global no disponible, se recorre por operativo:", e.message);
    vehiculos = [];
    for (const op of await fsList(env, "companies")) {
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
    nombres[cid] ??= (await fsGet(env, `companies/${cid}`))?.name || "Operativo";
    res.push({ cid, vid, patente: v.patente, modelo: v.modelo || "", operativo: nombres[cid],
      compania: v.compania || "", telefono: v.telefono || "", localidad: v.localidad || "", grado: v.grado || null,
      asegurado: v.asegurado || "", piezas: v.piezas || {},
      fotos: (v.fotos || []).length });
  }
  return res;
}

// Crea el vehículo en la web, con los mismos campos que usa la app
async function crearVehiculo(env, op, d, quien) {
  const vid = [...crypto.getRandomValues(new Uint8Array(15))].map(b => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("") + "wa";
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // fecha de Argentina (UTC-3)
  const datos = {
    modelo: d.modelo || "", patente: d.patente, asegurado: d.asegurado || "", telefono: d.telefono || "", compania: d.compania || "",
    localidad: d.localidad || op.operativo || "", observaciones: d.otros || "", repuestos: "", precio: 0, piezas: d.piezas || {}, grado: d.grado || null,
    estado: "peritado", fechas: { peritado: hoy }, fotos: [], archivos: [], firma: null, deleted: false,
    createdBy: `whatsapp:${quien.numero}`, createdByName: `${quien.nombre || quien.numero} (WhatsApp)`,
    ...(quien.uid ? { createdByUid: quien.uid } : {}),
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
  const media = m.image || m.document;
  const esFoto = m.type === "image";
  const hora = horaDe(m);

  // Si la foto trae datos del vehículo como descripción, se procesan primero
  let sesion = await leerSesion(env, numero);
  const caption = (media?.caption || "").trim();
  let datos = null;
  if (caption && buscarPatenteEnTexto(caption)) {
    const mencion = operativoMencionado(caption, await listaOperativos(env));
    datos = interpretar(mencion ? quitarFrase(caption, mencion.frase) : caption);
    if (mencion) datos.operativo = mencion.op;
  }
  if (datos?.patente && !(abierta(sesion) && sesion.patente === datos.patente)) {
    if (abierta(sesion)) await cerrarEnSilencio(env, numero, hora - 1);
    const pregunta = await prepararVehiculo(env, numero, datos, hora, await leerSesion(env, numero), quien);
    if (pregunta) await responder(env, dest(m), pregunta);
    sesion = await leerSesion(env, numero);
  }

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
    return responder(env, dest(m), `🗑️ El vehículo ${destino.patente} ya no está disponible. ${OTRO}`);
  }

  // Bajar el archivo de WhatsApp
  const { bytes, mime } = m._key ? await bajarMediaEvolution(env, m) : await bajarMedia(env, media.id);
  if (bytes.byteLength > MAX_BYTES) return responder(env, dest(m), "📦 Ese archivo pesa más de 15 MB, no lo puedo guardar.");

  // Subir a Cloudinary (misma carpeta que usa la app)
  const nombre = media.filename || (esFoto ? "foto.jpg" : "archivo");
  const subido = await subirCloudinary(env, new Blob([bytes], { type: mime }), nombre,
    `desabollito/${destino.cid}/${destino.vid}`, esFoto ? "image" : "auto");

  // Agregar al vehículo (la web lo muestra al instante). Sin ✅ por foto: el resumen llega al cerrar.
  const origen = { via: "whatsapp", byWhatsApp: numero, byName: quien.nombre };
  if (esFoto) {
    await fsAppend(env, ruta, "fotos",
      { url: subido.secure_url, publicId: subido.public_id, w: subido.width || null, h: subido.height || null, at: Date.now(), ...origen });
  } else {
    await fsAppend(env, ruta, "archivos",
      { url: subido.secure_url, publicId: subido.public_id, name: nombre, bytes: subido.bytes || null, format: subido.format || null, at: Date.now(), ...origen });
  }
  await fsIncrementar(env, `bot_sesiones/${numero}`, campoConteo(destino.vid)).catch(() => {});
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
  const inst = env.EVOLUTION_INSTANCE || "desabollito";
  const h = { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" };
  const r = payload.type === "reaction"
    ? await fetch(`${base}/message/sendReaction/${inst}`, { method: "POST", headers: h,
        body: JSON.stringify({ key: payload._key, reaction: payload.reaction.emoji }) })
    : await fetch(`${base}/message/sendText/${inst}`, { method: "POST", headers: h,
        body: JSON.stringify({ number: chat, text: payload.text.body }) });
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
    scope: "https://www.googleapis.com/auth/datastore",
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
  const qs = campos.map(c => "updateMask.fieldPaths=" + encodeURIComponent(c)).join("&");
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
  if (evento !== "messages.upsert") return new Response("ok");
  const lista = Array.isArray(body.data) ? body.data : [body.data];
  const mensajes = lista.map(deEvolution).filter(Boolean);
  ctx.waitUntil(registrar(env, { ultimoEvolution: `${new Date().toISOString()} · ${mensajes.length} mensaje(s)` }));
  ctx.waitUntil(Promise.all(mensajes.map(m => procesar(m, env).catch(e => {
    console.error("Error con mensaje de Evolution", m.id, e?.stack || e);
    registrar(env, { ultimoError: `${new Date().toISOString()} · Evolution · ${String(e?.message || e).slice(0, 400)}` }).catch(() => {});
  }))));
  return new Response("ok");
}

export function deEvolution(d) {
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
    _base64: d.message?.base64 || msg.base64 || d.base64 || null
  };
  const texto = msg.conversation || msg.extendedTextMessage?.text;
  if (texto) return { ...base, type: "text", text: { body: texto } };
  if (msg.imageMessage) return { ...base, type: "image", image: { id: key.id, caption: msg.imageMessage.caption || "" }, _mime: msg.imageMessage.mimetype };
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
  await fsMerge(env, `users/${p.uid}`, aprobar ? { aprobado: true, rechazado: false } : { aprobado: false, rechazado: true });
  if (aprobar) await fsMerge(env, `usernames/${p.username}`, { pendiente: false }).catch(() => {});
  await fsDelete(env, `bot_pendientes/${p.username}`);
  await responder(env, dest(m), aprobar
    ? `✅ Aprobaste a *${p.name || p.username}* (@${p.username}). Ya puede entrar a la app y usar el bot.`
    : `❌ Rechazaste la cuenta de *${p.name || p.username}* (@${p.username}).`);
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
  if (v.estado !== "reparado") return json({ ok: false, error: "El vehículo no está marcado como reparado" });
  if (v.avisoReparado) return json({ ok: false, error: "Al cliente ya se le avisó" });
  const tel = telefonoAR(v.telefono);
  if (!tel) return json({ ok: false, error: "El teléfono del cliente no parece un celular válido" });
  const c = await fsGet(env, `companies/${cid}`);
  const nombre = String(v.asegurado || "").trim().split(/\s+/)[0];
  const texto = `Hola${nombre ? " " + nombre : ""}! 👋 Te escribimos de ${c?.name || "Desabollito"}: tu ${v.modelo || "vehículo"}${v.patente ? ` (${v.patente})` : ""} ya está reparado y listo para retirar. ¡Gracias por confiar en nosotros!`;
  const r = await enviar(env, destinoNumero(env, tel), { type: "text", text: { body: texto, preview_url: false } });
  if (!r?.ok) return json({ ok: false, error: "WhatsApp no aceptó el mensaje" });
  const quien = String(por || "").slice(0, 60);
  await fsMerge(env, ruta, { avisoReparado: { t: Date.now(), por: quien } });
  await fsAppend(env, ruta, "historial", { t: Date.now(), uid: "", por: quien, txt: "Le avisó al cliente por WhatsApp que el auto está listo" }).catch(() => {});
  return json({ ok: true });
}
