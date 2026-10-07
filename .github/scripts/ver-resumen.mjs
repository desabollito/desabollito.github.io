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
const val = v => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "booleanValue" in v ? v.booleanValue : "arrayValue" in v ? (v.arrayValue.values || []).map(val) : "timestampValue" in v ? v.timestampValue : JSON.stringify(v);
for (const d of await listar("bot_resumen")) {
  const f = d.fields || {};
  console.log(`::notice::resumen ${d.name.split("/").pop()} to=${val(f.to)} todos=${val(f.todos)} cids=${JSON.stringify(val(f.cids))} ultimo=${val(f.ultimo)}`);
}
const e = await get("bot_estado/diagnostico");
for (const k of ["ultimoError", "ultimoErrorEnvio", "ultimaPapelera"]) console.log(`::notice::${k} ${String(val(e.fields?.[k])).slice(0, 300)}`);
