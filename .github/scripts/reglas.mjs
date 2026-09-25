// Publica firestore.rules usando la API de Firebase Rules (sin firebase-tools)
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const falla = m => { console.log(`::error::${m}`); process.exit(1); };
let sa;
try { sa = JSON.parse(process.env.SA || ""); } catch { falla("FIREBASE_SERVICE_ACCOUNT no es un JSON válido (pegá el archivo completo, de { a })."); }
const proyecto = sa.project_id;
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const ahora = Math.floor(Date.now() / 1000);
const datos = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 })}`;
const firma = crypto.sign("RSA-SHA256", Buffer.from(datos), sa.private_key).toString("base64url");
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${datos}.${firma}` })).json();
if (!tok.access_token) falla("Google no aceptó la cuenta de servicio: " + JSON.stringify(tok));
const H = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };
const api = `https://firebaserules.googleapis.com/v1/projects/${proyecto}`;

const rs = await (await fetch(`${api}/rulesets`, { method: "POST", headers: H,
  body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] } }) })).json();
if (!rs.name) falla("No se pudo crear el conjunto de reglas: " + JSON.stringify(rs.error || rs).slice(0, 600));

const rel = `projects/${proyecto}/releases/cloud.firestore`;
let r = await fetch(`${api}/releases/cloud.firestore`, { method: "PATCH", headers: H, body: JSON.stringify({ release: { name: rel, rulesetName: rs.name } }) });
if (r.status === 404) r = await fetch(`${api}/releases`, { method: "POST", headers: H, body: JSON.stringify({ name: rel, rulesetName: rs.name }) });
const j = await r.json();
if (!r.ok) falla("No se pudieron activar las reglas: " + JSON.stringify(j.error || j).slice(0, 600));
console.log(`::notice::Reglas publicadas en ${proyecto} (${rs.name.split("/").pop()})`);
