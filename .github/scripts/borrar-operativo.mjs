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
// Borra el operativo de "Estefi" SOLO si no tiene miembros (con todo lo que tenga adentro)
const val = f => f?.stringValue ?? f?.arrayValue?.values?.map(x => x.stringValue) ?? null;
let borrados = [];
for (const op of await listar("companies")) {
  const nombre = val(op.fields?.name) || "", miembros = val(op.fields?.members) || [];
  if (!/estef/i.test(nombre)) continue;
  console.log(`Encontrado: "${nombre}" · miembros: ${miembros.length}`);
  if (miembros.length) continue;
  const id = op.name.split("/").pop();
  for (const sub of ["vehicles", "gastos", "solicitudes"])
    for (const d of await listar(`companies/${id}/${sub}`)) await fetch(`https://firestore.googleapis.com/v1/${d.name}`, { method: "DELETE", headers: H });
  await fetch(`https://firestore.googleapis.com/v1/${op.name}`, { method: "DELETE", headers: H });
  borrados.push(nombre);
}
console.log(`::notice::Operativos borrados: ${borrados.join(", ") || "ninguno"}`);
