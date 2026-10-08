// Crea una página real por cada link compartido (desabollito.com/smg-k7p2/) para que WhatsApp muestre la vista previa.
// Las carpetas generadas llevan la marca LINK-CORTO; las que ya no existen en Firestore se borran.
import fs from "node:fs";
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
const get = async p => (await fetch(`${base}/${p}`, { headers: H })).json();
const s = v => v?.stringValue ?? "";
if (!tok.access_token) { console.log("::error::sin token"); process.exit(1); }
const tokens = (await listar("compartidos")).map(d => d.name.split("/").pop()).filter(t => /^[A-Za-z0-9_-]{3,60}$/.test(t));
const MARCA = "<!-- LINK-CORTO -->";
const base0 = fs.readFileSync("v/index.html", "utf8");
const pagina = t => MARCA + "\n" + base0
  .replace('content="https://desabollito.com/v/"', `content="https://desabollito.com/${t}/"`)
  .replace(/location\.replace\([^;]*\);/, `location.replace("/?ver=${t}" + location.hash);`);
const reservadas = new Set(["v", "js", "css", "img", "bot", "icons", "fonts"]);
let n = 0, b = 0;
for (const t of tokens) {
  if (reservadas.has(t) || t.startsWith(".")) continue;
  const f = `${t}/index.html`;
  if (fs.existsSync(t) && !(fs.existsSync(f) && fs.readFileSync(f, "utf8").startsWith(MARCA))) continue;
  const html = pagina(t);
  if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === html) continue;
  fs.mkdirSync(t, { recursive: true }); fs.writeFileSync(f, html); n++;
}
const vivos = new Set(tokens);
for (const d of fs.readdirSync(".")) {
  const f = `${d}/index.html`;
  if (!vivos.has(d) && fs.existsSync(f) && fs.readFileSync(f, "utf8").startsWith(MARCA)) { fs.rmSync(d, { recursive: true }); b++; }
}
console.log(`::notice::links: ${tokens.length} · nuevos/actualizados ${n} · borrados ${b}`);
