// Temporal: estado de una lista de patentes
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
const pats = "PQN351 AE591UC".split(" ");
const L = { peritado: "Peritado", turnado: "Turnado", enreparacion: "Reparando", reparado: "Revisión", llamado: "Contactado", entregado: "Entregado", facturado: "Facturado", anulado: "Anulado", ausente: "Ausente" };
const norm = p => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const res = Object.fromEntries(pats.map(p => [p, []]));
for (const c of await listar("companies")) {
  const cid = c.name.split("/").pop(), cn = s(c.fields?.name);
  for (const v of await listar(`companies/${cid}/vehicles`)) {
    const p = norm(s(v.fields?.patente));
    if (!(p in res)) continue;
    if (v.fields?.deleted?.booleanValue) { res[p].push(`${cn}: (en papelera)`); continue; }
    const e = s(v.fields?.estado); const f = v.fields?.fechas?.mapValue?.fields || {};
    const fe = s(f[e]) || "";
    res[p].push(`${cn}: ${L[e] || "Peritado"}${fe ? " " + fe : ""} · ${s(v.fields?.modelo)}`);
  }
}
for (const p of pats) console.log(`::notice::${p} → ${res[p].join(" | ") || "NO ENCONTRADO"}`);
