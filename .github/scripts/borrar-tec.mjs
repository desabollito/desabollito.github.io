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
const reg = await get("usernames/tec"); const uid = s(reg.fields?.uid);
if (!uid) { console.log("::notice::no existe el usuario tec"); process.exit(0); }
const u = await get(`users/${uid}`);
const ops = (await listar("companies")).filter(c => (c.fields.members?.arrayValue?.values || []).some(x => x.stringValue === uid));
console.log(`::notice::tec = ${s(u.fields?.name)} · uid ${uid} · operativos: ${ops.map(c => s(c.fields.name) + (s(c.fields.ownerId) === uid ? " (DUEÑO)" : "")).join(", ") || "ninguno"}`);
if (ops.some(c => s(c.fields.ownerId) === uid)) { console.log("::notice::NO SE BORRÓ: es dueño de un operativo"); process.exit(0); }
const uidC = s((await get("usernames/gzmatte")).fields?.uid);
const now2 = Math.floor(Date.now() / 1000);
const ct = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, sub: sa.client_email, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now2, exp: now2 + 3600, uid: uidC })}`;
const ctTok = `${ct}.${crypto.sign("RSA-SHA256", Buffer.from(ct), sa.private_key).toString("base64url")}`;
const si = await (await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDJL7vPKEkAMBKGM7ULWpphlDkYw1jKcSM", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ctTok, returnSecureToken: true }) })).json();
const rr = await fetch("https://desabollito-bot.desabollito.workers.dev/admin/borrar-usuario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: si.idToken, uid }) });
console.log(`::notice::borrar ${rr.status} ${(await rr.text()).slice(0, 200)} · queda usernames/tec: ${!!(await get("usernames/tec")).fields}`);
