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
const get = async p => (await fetch(`${base}/${p}`, { headers: H })).json();
const s = v => v?.stringValue ?? "";
const norm = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const u = await get("usernames/gzmatte"); const uid = s(u.fields?.uid), nombre = s(u.fields?.name) || "gzmatte";
const comps = (await listar("companies")).filter(c => norm(s(c.fields?.name)).includes("san jorge"));
console.log(`::notice::candidatos: ${comps.map(c => s(c.fields.name) + " [" + c.name.split("/").pop() + "]").join(" | ")}`);
if (comps.length !== 1 || !uid) { console.log("::notice::no se unió (0 o varios candidatos)"); process.exit(0); }
const c = comps[0], miembros = (c.fields.members?.arrayValue?.values || []).map(x => x.stringValue);
if (miembros.includes(uid)) { console.log("::notice::ya era miembro"); process.exit(0); }
const cid = c.name.split("/").pop();
const body = { writes: [{ transform: { document: c.name, fieldTransforms: [{ fieldPath: "members", appendMissingElements: { values: [{ stringValue: uid }] } }] } },
  { update: { name: c.name, fields: { roles: { mapValue: { fields: { [uid]: { stringValue: "admin" } } } }, memberNames: { mapValue: { fields: { [uid]: { stringValue: nombre } } } }, memberUsers: { mapValue: { fields: { [uid]: { stringValue: "gzmatte" } } } } } },
    updateMask: { fieldPaths: [`roles.\`${uid}\``, `memberNames.\`${uid}\``, `memberUsers.\`${uid}\``] } }] };
const r = await fetch(`${base}:commit`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) });
console.log(`::notice::unido a ${s(c.fields.name)}: ${r.status} ${r.ok ? "" : (await r.text()).slice(0, 200)}`);
