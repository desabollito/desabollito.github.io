// ═══════════════════════════════════════════════════════════════
//  Desabollito · Bot de WhatsApp (Cloudflare Worker)
//
//  Flujo:
//    1. El técnico manda la patente ("AE345KD").
//    2. El bot busca el vehículo en sus operativos y lo deja "abierto".
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
        for (const m of ch.value?.messages || []) mensajes.push(m);
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
  const vinculo = await fsGet(env, `whatsapp/${numero}`);
  if (!vinculo?.uid) {
    return responder(env, m.from,
      "👋 ¡Hola! Este número no está vinculado a Desabollito.\n\n" +
      "Abrí la app → *Ajustes* → *Editar perfil* y cargá este número de WhatsApp. Después volvé a escribirme.");
  }
  const uid = vinculo.uid;

  if (m.type === "text") return alRecibirTexto(env, m, numero, uid, (m.text?.body || "").trim());
  if (m.type === "image" || m.type === "document") return alRecibirArchivo(env, m, numero, uid);
  if (m.type === "reaction") return;
  return responder(env, m.from, "Por ahora entiendo patentes, fotos y documentos. Escribí *ayuda* para ver cómo usarme.");
}

const AYUDA =
  "🚗 *Cómo usarme*\n\n" +
  "1. Mandame la *patente* del vehículo (ej: AE345KD).\n" +
  "2. Mandame las *fotos* (o PDFs). Las guardo en ese vehículo y te marco cada una con ✅.\n" +
  "3. Escribí *listo* cuando termines, o mandá otra patente para cambiar de vehículo.\n\n" +
  "También podés mandar una foto con la patente escrita como descripción.";

function pareceP(t) {
  const p = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 5 && p.length <= 9 && /[A-Z]/.test(p) && /[0-9]/.test(p) ? p : null;
}

async function alRecibirTexto(env, m, numero, uid, texto) {
  const t = texto.toLowerCase();
  if (["hola", "ayuda", "menu", "menú", "?", "info", "help"].includes(t)) {
    const s = await sesionVigente(env, numero);
    return responder(env, m.from, AYUDA + (s ? `\n\n📌 Vehículo abierto: *${s.modelo || s.patente}* (${s.patente})` : ""));
  }
  if (["listo", "fin", "terminé", "termine", "cerrar", "chau", "gracias"].includes(t)) {
    const s = await sesionVigente(env, numero);
    await fsDelete(env, `bot_sesiones/${numero}`);
    return responder(env, m.from, s ? `👌 Listo, cerré *${s.modelo || s.patente}*. Mandame otra patente cuando quieras.` : "👌 Listo.");
  }
  const patente = pareceP(texto);
  if (!patente) return responder(env, m.from, "No entendí 🤔 Mandame la *patente* del vehículo (ej: AE345KD) o escribí *ayuda*.");

  const r = await abrirVehiculo(env, numero, uid, patente);
  return responder(env, m.from, r.mensaje);
}

async function abrirVehiculo(env, numero, uid, patente) {
  const encontrados = await buscarPatente(env, uid, patente);
  if (!encontrados.length) {
    return { ok: false, mensaje: `🔎 No encontré la patente *${patente}* en tus operativos.\n\nCargala primero en la app y después mandame las fotos.` };
  }
  const perfil = await fsGet(env, `users/${uid}`);
  const v = encontrados.find(x => x.cid === perfil?.activeCompanyId) || encontrados[0];
  await fsSet(env, `bot_sesiones/${numero}`, {
    uid, cid: v.cid, vid: v.vid, patente: v.patente, modelo: v.modelo || "", operativo: v.operativo || "", ts: Date.now()
  });
  let msg = `📸 *${v.modelo || "Vehículo"}* (${v.patente})\nOperativo: ${v.operativo}\n\nMandame las fotos y las guardo acá. Cuando termines escribí *listo*.`;
  if (encontrados.length > 1) msg += `\n\nℹ️ Esa patente está en ${encontrados.length} operativos; usé *${v.operativo}*.`;
  return { ok: true, mensaje: msg, vehiculo: v };
}

async function buscarPatente(env, uid, patente) {
  const operativos = await fsQuery(env, "", "companies", { field: "members", op: "ARRAY_CONTAINS", value: uid }, 50);
  const res = [];
  for (const op of operativos) {
    const cid = op.__id;
    const vs = await fsQuery(env, `companies/${cid}`, "vehicles", { field: "patente", op: "EQUAL", value: patente }, 5);
    for (const v of vs) if (!v.deleted) res.push({ cid, vid: v.__id, patente: v.patente, modelo: v.modelo, operativo: op.name });
  }
  return res;
}

async function sesionVigente(env, numero) {
  const s = await fsGet(env, `bot_sesiones/${numero}`);
  if (!s || Date.now() - Number(s.ts || 0) > SESION_HORAS * 3600 * 1000) return null;
  return s;
}

async function alRecibirArchivo(env, m, numero, uid) {
  const media = m.image || m.document;
  const esFoto = m.type === "image";

  // Si la foto trae la patente como descripción, se abre ese vehículo
  const caption = (media?.caption || "").trim();
  let sesion = await sesionVigente(env, numero);
  const pCaption = caption && pareceP(caption);
  if (pCaption && pCaption !== sesion?.patente) {
    const r = await abrirVehiculo(env, numero, uid, pCaption);
    if (!r.ok) return responder(env, m.from, r.mensaje);
    sesion = await sesionVigente(env, numero);
  }
  if (!sesion) {
    return responder(env, m.from, "📌 Primero mandame la *patente* del vehículo al que van estas fotos (ej: AE345KD). Después reenviámelas.");
  }

  // Sigue siendo miembro del operativo y el vehículo sigue existiendo
  const op = await fsGet(env, `companies/${sesion.cid}`);
  if (!op?.members?.includes(uid)) {
    await fsDelete(env, `bot_sesiones/${numero}`);
    return responder(env, m.from, "⛔ Ya no formás parte de ese operativo. Mandame otra patente.");
  }
  const vehiculo = await fsGet(env, `companies/${sesion.cid}/vehicles/${sesion.vid}`);
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
  const quien = op.memberNames?.[uid] || "";
  if (esFoto) {
    await fsAppend(env, `companies/${sesion.cid}/vehicles/${sesion.vid}`, "fotos",
      { url: subido.secure_url, publicId: subido.public_id, w: subido.width || null, h: subido.height || null, at: Date.now(), by: uid, via: "whatsapp" }, uid);
  } else {
    await fsAppend(env, `companies/${sesion.cid}/vehicles/${sesion.vid}`, "archivos",
      { url: subido.secure_url, publicId: subido.public_id, name: nombre, bytes: subido.bytes || null, format: subido.format || null, at: Date.now(), via: "whatsapp" }, uid);
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

async function fsQuery(env, padre, coleccion, filtro, limite = 20) {
  const url = padre ? `${base(env)}/${padre}:runQuery` : `${base(env)}:runQuery`;
  const r = await fs(env, url, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: { fieldFilter: { field: { fieldPath: filtro.field }, op: filtro.op, value: aValor(filtro.value) } },
        limit: limite
      }
    })
  });
  if (!r.ok) throw new Error(`Firestore query ${coleccion}: ${r.status} ${await r.text()}`);
  return (await r.json()).filter(x => x.document).map(x => deDoc(x.document));
}

// Agrega un elemento a una lista del documento sin pisar lo que haya (seguro con fotos simultáneas)
async function fsAppend(env, ruta, campo, elemento, uid) {
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
      }, {
        update: { name: nombreDoc(env, ruta), fields: { updatedBy: aValor(uid) } },
        updateMask: { fieldPaths: ["updatedBy"] },
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
