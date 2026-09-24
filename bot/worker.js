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
const SESION_HORAS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Desabollito bot funcionando ✅");
    if (url.pathname === "/diagnostico") return diagnostico(url, env);
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
      return responder(env, m.from, "⚠️ Hubo un error procesando tu mensaje. Probá de nuevo en un rato.").catch(() => {});
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
    return responder(env, m.from, "⛔ Este número no está habilitado para usar el bot de Desabollito.");
  }

  if (m.type === "text") return alRecibirTexto(env, m, quien, (m.text?.body || "").trim());
  if (m.type === "image" || m.type === "document") return alRecibirArchivo(env, m, quien);
  if (m.type === "reaction") return;
  return responder(env, m.from, "Por ahora entiendo patentes, fotos y documentos. Escribí *ayuda* para ver cómo usarme.");
}

const AYUDA =
  "🚗 *Cómo usarme*\n\n" +
  "1. Mandame la *patente* del vehículo (ej: AE345KD).\n" +
  "2. Mandame las *fotos* (o PDFs). Las guardo en ese vehículo y te marco cada una con ✅.\n" +
  "3. Escribí *listo* cuando termines, o mandá otra patente para cambiar de vehículo.\n\n" +
  "También podés mandar una foto con la patente escrita como descripción.";

const etiqueta = s => `*${s.modelo || "Vehículo"}* (${s.patente})`;

function pareceP(t) {
  const p = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 5 && p.length <= 9 && /[A-Z]/.test(p) && /[0-9]/.test(p) ? p : null;
}

async function alRecibirTexto(env, m, quien, texto) {
  const t = texto.toLowerCase();
  const numero = quien.numero;
  if (["hola", "ayuda", "menu", "menú", "?", "info", "help"].includes(t)) {
    const s = await sesionVigente(env, numero);
    return responder(env, m.from, AYUDA + (s?.vid ? `\n\n📌 Vehículo abierto: ${etiqueta(s)} · ${s.operativo}` : ""));
  }
  if (["listo", "fin", "terminé", "termine", "cerrar", "chau", "gracias"].includes(t)) {
    const s = await sesionVigente(env, numero);
    await fsDelete(env, `bot_sesiones/${numero}`);
    return responder(env, m.from, s?.vid ? `👌 Listo, cerré ${etiqueta(s)}. Mandame otra patente cuando quieras.` : "👌 Listo.");
  }

  // Respuesta a "¿en qué operativo?" cuando la patente estaba repetida
  const s = await sesionVigente(env, numero);
  if (s?.opciones?.length && /^\d{1,2}$/.test(t)) {
    const elegido = s.opciones[Number(t) - 1];
    if (!elegido) return responder(env, m.from, `Elegí un número del 1 al ${s.opciones.length}.`);
    await abrir(env, numero, elegido);
    return responder(env, m.from, mensajeAbierto(elegido));
  }

  const patente = pareceP(texto);
  if (!patente) return responder(env, m.from, "No entendí 🤔 Mandame la *patente* del vehículo (ej: AE345KD) o escribí *ayuda*.");
  const r = await elegirVehiculo(env, numero, patente);
  return responder(env, m.from, r.mensaje);
}

const mensajeAbierto = v =>
  `📸 ${etiqueta(v)}\nOperativo: ${v.operativo}\n\nMandame las fotos y las guardo acá. Cuando termines escribí *listo*.`;

async function abrir(env, numero, v) {
  await fsSet(env, `bot_sesiones/${numero}`, {
    cid: v.cid, vid: v.vid, patente: v.patente, modelo: v.modelo || "", operativo: v.operativo || "", ts: Date.now()
  });
}

// Busca la patente en todos los operativos. Una coincidencia: la abre.
// Varias: guarda las opciones y pregunta a cuál.
async function elegirVehiculo(env, numero, patente) {
  const encontrados = await buscarPatente(env, patente);
  if (!encontrados.length) {
    return { ok: false, mensaje: `🔎 No encontré la patente *${patente}* en Desabollito.\n\nCargala primero en la app y después mandame las fotos.` };
  }
  if (encontrados.length === 1) {
    await abrir(env, numero, encontrados[0]);
    return { ok: true, mensaje: mensajeAbierto(encontrados[0]), vehiculo: encontrados[0] };
  }
  await fsSet(env, `bot_sesiones/${numero}`, { opciones: encontrados.slice(0, 9), patente, ts: Date.now() });
  return {
    ok: false, pregunta: true,
    mensaje: `La patente *${patente}* está en más de un operativo. ¿A cuál van las fotos? Respondé con el número:\n\n` +
      encontrados.slice(0, 9).map((v, i) => `${i + 1}. ${v.operativo} · ${v.modelo || "Vehículo"}`).join("\n")
  };
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
    res.push({ cid, vid, patente: v.patente, modelo: v.modelo, operativo: nombres[cid] });
  }
  return res;
}

async function sesionVigente(env, numero) {
  const s = await fsGet(env, `bot_sesiones/${numero}`);
  if (!s || Date.now() - Number(s.ts || 0) > SESION_HORAS * 3600 * 1000) return null;
  return s;
}

async function alRecibirArchivo(env, m, quien) {
  const numero = quien.numero;
  const media = m.image || m.document;
  const esFoto = m.type === "image";

  // Si la foto trae la patente como descripción, se abre ese vehículo
  const caption = (media?.caption || "").trim();
  let sesion = await sesionVigente(env, numero);
  const pCaption = caption && pareceP(caption);
  if (pCaption && pCaption !== sesion?.patente) {
    const r = await elegirVehiculo(env, numero, pCaption);
    if (!r.ok) return responder(env, m.from, r.mensaje + (r.pregunta ? "\n\nDespués reenviame la foto." : ""));
    sesion = await sesionVigente(env, numero);
  }
  if (sesion?.opciones?.length && !sesion.vid) {
    return responder(env, m.from, "📌 Primero decime a qué operativo van (respondé con el número de la lista). Después reenviame las fotos.");
  }
  if (!sesion?.vid) {
    return responder(env, m.from, "📌 Primero mandame la *patente* del vehículo al que van estas fotos (ej: AE345KD). Después reenviámelas.");
  }

  const ruta = `companies/${sesion.cid}/vehicles/${sesion.vid}`;
  const vehiculo = await fsGet(env, ruta);
  if (!vehiculo || vehiculo.deleted) {
    await fsDelete(env, `bot_sesiones/${numero}`);
    return responder(env, m.from, `🗑️ El vehículo ${sesion.patente} ya no está disponible. Mandame otra patente.`);
  }

  // Bajar el archivo de WhatsApp
  const { bytes, mime } = await bajarMedia(env, media.id);
  if (bytes.byteLength > MAX_BYTES) return responder(env, m.from, "📦 Ese archivo pesa más de 15 MB, no lo puedo guardar.");

  // Subir a Cloudinary (misma carpeta que usa la app)
  const nombre = media.filename || (esFoto ? "foto.jpg" : "archivo");
  const subido = await subirCloudinary(env, new Blob([bytes], { type: mime }), nombre,
    `desabollito/${sesion.cid}/${sesion.vid}`, esFoto ? "image" : "auto");

  // Agregar al vehículo (la web lo muestra al instante)
  const origen = { via: "whatsapp", byWhatsApp: numero, byName: quien.nombre };
  if (esFoto) {
    await fsAppend(env, ruta, "fotos",
      { url: subido.secure_url, publicId: subido.public_id, w: subido.width || null, h: subido.height || null, at: Date.now(), ...origen });
  } else {
    await fsAppend(env, ruta, "archivos",
      { url: subido.secure_url, publicId: subido.public_id, name: nombre, bytes: subido.bytes || null, format: subido.format || null, at: Date.now(), ...origen });
  }
  await fsSet(env, `bot_sesiones/${numero}`, { ...sesion, ts: Date.now() }); // renueva las 12 h
  return reaccionar(env, m.from, m.id, "✅");
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

async function enviar(env, to, payload) {
  const intentar = dest => fetch(`${GRAPH}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: dest, ...payload })
  });
  let r = await intentar(to);
  // Particularidad de Argentina: a veces hay que responder al número sin el 9
  if (!r.ok && to.startsWith("549")) r = await intentar("54" + to.slice(3));
  if (!r.ok) {
    const detalle = await r.text();
    console.error("WhatsApp no aceptó el mensaje:", r.status, detalle);
    await registrar(env, { ultimoErrorEnvio: `${new Date().toISOString()} · a ${to} · ${r.status} · ${detalle.slice(0, 400)}` }).catch(() => {});
  }
  return r;
}

const responder = (env, to, texto) => enviar(env, to, { type: "text", text: { body: texto, preview_url: false } });
const reaccionar = (env, to, messageId, emoji) => enviar(env, to, { type: "reaction", reaction: { message_id: messageId, emoji } });

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
  const firmar = `folder=${carpeta}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(firmar));
  const signature = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");

  const fd = new FormData();
  fd.append("file", blob, nombre);
  fd.append("folder", carpeta);
  fd.append("timestamp", String(timestamp));
  fd.append("api_key", env.CLOUDINARY_API_KEY);
  fd.append("signature", signature);
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
