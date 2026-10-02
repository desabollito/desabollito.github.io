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
const est = (await get("bot_estado/diagnostico")).fields || {};
for (const k of ["ultimoError", "ultimaMencion"]) console.log(`::notice::${k}: ${String(JSON.stringify(est[k])).slice(0, 1500)}`);
const idn = (await get("bot_estado/identidad")).fields || {};
console.log(`::notice::identidad: ${String(JSON.stringify(idn)).slice(0, 3000)}`);
const ed = await listar("bot_ediciones");
console.log("::notice::ediciones: " + ed.map(d => d.name.split("/").pop() + " " + JSON.stringify(d.fields.texto) + (d.fields.fallo ? " FALLO" : "")).join(" | "));
