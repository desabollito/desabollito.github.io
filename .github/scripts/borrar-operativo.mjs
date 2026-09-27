// Borra los operativos cuyo nombre contiene el texto indicado (con sus vehículos, gastos y solicitudes)
import crypto from "node:crypto";
const falla = m => { console.log(`::error::${m}`); process.exit(1); };
const sa = JSON.parse(process.env.SA || "{}");
const buscar = String(process.env.NOMBRE || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
if (buscar.length < 4) falla("Falta el nombre a buscar");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const ahora = Math.floor(Date.now() / 1000);
const datos = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 })}`;
const firma = crypto.sign("RSA-SHA256", Buffer.from(datos), sa.private_key).toString("base64url");
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${datos}.${firma}` })).json();
if (!tok.access_token) falla("Google no aceptó la cuenta de servicio");
const H = { Authorization: `Bearer ${tok.access_token}` };
const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
const listar = async ruta => { const out = []; let t = ""; do { const j = await (await fetch(`${base}/${ruta}?pageSize=300${t ? "&pageToken=" + t : ""}`, { headers: H })).json(); out.push(...(j.documents || [])); t = j.nextPageToken || ""; } while (t); return out; };
const borrar = name => fetch(`https://firestore.googleapis.com/v1/${name}`, { method: "DELETE", headers: H });
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ops = (await listar("companies")).filter(d => norm(d.fields?.name?.stringValue).includes(buscar));
console.log(`Operativos que coinciden con "${buscar}": ${ops.length}`);
for (const op of ops) {
  const id = op.name.split("/").pop();
  let n = 0;
  for (const sub of ["vehicles", "gastos", "solicitudes"]) for (const d of await listar(`companies/${id}/${sub}`)) { await borrar(d.name); n++; }
  await borrar(op.name);
  console.log(`::notice::Borrado "${op.fields?.name?.stringValue}" (${id}) con ${n} documentos adentro`);
}
