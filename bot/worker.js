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
    if (url.pathname !== "/webhook") return new Response("No encontrado", { status: 404 });

    // Verificación del webhook (Meta la hace una sola vez al configurarlo)
    if (req.method === "GET") {
      const p = url.searchParams;
      if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(p.get("hub.challenge") || "");
      }
      return new Response("Token de verificación incorrecto", { status: 403 });
    }
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

    // Solo aceptamos mensajes firmados por Meta
    const raw = await req.text();
    if (!(await firmaValida(raw, req.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET))) {
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
  if (!r.ok) console.error("WhatsApp no aceptó el mensaje:", r.status, await r.text());
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
