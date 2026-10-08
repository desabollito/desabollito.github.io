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
const norm = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const u = await get("usernames/gzmatte"); const uid = s(u.fields?.uid), nombre = s(u.fields?.name) || "gzmatte";
const val = v => v == null ? null : "stringValue" in v ? v.stringValue : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : "booleanValue" in v ? v.booleanValue : null;
for (const c of await listar("companies")) {
  const cid = c.name.split("/").pop(), vs = await listar(`companies/${cid}/vehicles`);
  const rep = vs.filter(d => ["enreparacion", "reparado", "llamado", "entregado", "facturado"].includes(val(d.fields?.estado)) && !val(d.fields?.deleted));
  if (!rep.length) continue;
  const plan = (await listar(`companies/${cid}/planTec`)).map(d => d.name.split("/").pop());
  const cfg = plan.includes("_config");
  console.log(`::notice::${s(c.fields?.name)}: ${rep.length} en rep+ · planTec ${plan.length} (config ${cfg}) · ` + rep.slice(0, 12).map(d => `${val(d.fields.estado)}:${JSON.stringify(val(d.fields.fechas) || {}).slice(0, 80)}:${plan.includes(d.name.split("/").pop()) ? "fila" : "SIN"}`).join(" | ").slice(0, 900));
}
