// Borra vehículos sin "createdBy" (quedaron a medias por un error del bot). No imprime datos de clientes.
import crypto from "node:crypto";
const sa = JSON.parse(process.env.SA || "{}");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const ahora = Math.floor(Date.now() / 1000);
const datos = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 })}`;
const firma = crypto.sign("RSA-SHA256", Buffer.from(datos), sa.private_key).toString("base64url");
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${datos}.${firma}` })).json();
const H = { Authorization: `Bearer ${tok.access_token}` };
const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
const listar = async ruta => { const out = []; let t = ""; do { const j = await (await fetch(`${base}/${ruta}?pageSize=300${t ? "&pageToken=" + t : ""}`, { headers: H })).json(); out.push(...(j.documents || [])); t = j.nextPageToken || ""; } while (t); return out; };
// Quita las fotos de perfil guardadas: users.photoURL y companies.memberPhotos
const get = async p => (await fetch(`${base}/${p}`, { headers: H })).json();
const val = f => f && (f.stringValue ?? f.integerValue ?? f.booleanValue ?? (f.mapValue ? "map" : JSON.stringify(f)));
const est = await get("bot_estado/diagnostico");
for (const [k, v] of Object.entries(est.fields || {})) if (/ultimoCrudoEvo/.test(k)) console.log(`::notice::${k}: ${String(val(v)).slice(0, 3000).replace(/\n/g, " ")}`);
const ed = await listar("bot_ediciones");
console.log(`::notice::bot_ediciones: ${ed.length} → ` + ed.map(d => new Date(Number(val(d.fields.ts))).toISOString()).join(", "));
const ms = await listar("bot_mensajes");
console.log(`::notice::evo_eventos: ` + ms.filter(d => d.name.includes("evo_eventos") || d.name.includes("/edit_")).map(d => d.name.split("/").pop()).join(", "));
