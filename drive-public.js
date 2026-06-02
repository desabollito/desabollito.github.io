// ═══════════════════════════════════════════════════════════════════════════════
// DRIVE PÚBLICO — Sube archivos a tu Drive personal
// Credenciales guardadas en Firestore: colección "config" → documento "drive"
// Campos: clientId, clientSecret, refreshToken
// ═══════════════════════════════════════════════════════════════════════════════

const DrivePublicModule = (() => {

  const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
  const DRIVE_API  = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  let cfg            = null;
  let cachedToken    = null;
  let tokenExpiry    = 0;
  // folder cache: { root, [userId]: id, [userId/vehicleId]: id }
  let folderCache    = {};

  // ── Config desde Firestore ───────────────────────────────────────────────────
  async function loadConfig() {
    if (cfg) return cfg;
    try {
      const snap = await db.collection('config').doc('drive').get();
      if (!snap.exists) return null;
      const d = snap.data();
      if (!d.clientId || !d.clientSecret || !d.refreshToken) return null;
      cfg = d;
      return cfg;
    } catch(e) { console.error(e); return null; }
  }

  // ── Access token ─────────────────────────────────────────────────────────────
  async function getToken() {
    if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
    const config = await loadConfig();
    if (!config) throw new Error('Drive no configurado');
    const res  = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId, client_secret: config.clientSecret,
        refresh_token: config.refreshToken, grant_type: 'refresh_token'
      })
    });
    const data = await res.json();
    if (!data.access_token) { cfg = null; throw new Error('Token inválido'); }
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedToken;
  }

  // ── Crear o encontrar carpeta ────────────────────────────────────────────────
  async function getFolder(name, parentId, token) {
    const cacheKey = parentId ? `${parentId}/${name}` : name;
    if (folderCache[cacheKey]) return folderCache[cacheKey];

    const q = encodeURIComponent(
      `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
      (parentId ? ` and '${parentId}' in parents` : '')
    );
    const res  = await fetch(`${DRIVE_API}?q=${q}&fields=files(id)`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.files && data.files.length) { folderCache[cacheKey] = data.files[0].id; return data.files[0].id; }

    const body = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) body.parents = [parentId];
    const cr   = await fetch(DRIVE_API, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const f    = await cr.json();
    folderCache[cacheKey] = f.id;
    return f.id;
  }

  // ── Estructura: Desabollito / userId / vehicleId ─────────────────────────────
  async function getVehicleFolder(vehicleId, token) {
    const uid      = AuthModule.getUserId();
    const rootId   = await getFolder('Desabollito', null, token);
    const userId   = await getFolder(uid, rootId, token);
    const vehicId  = await getFolder(vehicleId, userId, token);
    return vehicId;
  }

  // ── Subir archivo ────────────────────────────────────────────────────────────
  async function uploadFile(filename, mimeType, dataUrl, token, folderId) {
    const b64    = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob     = new Blob([bytes], { type: mimeType });
    const metadata = JSON.stringify({ name: filename, parents: [folderId] });
    const form     = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(UPLOAD_API, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return res.json();
  }

  async function makePublic(fileId, token) {
    await fetch(`${DRIVE_API}/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
  }

  // ── Subir imagen de vehículo ─────────────────────────────────────────────────
  async function uploadVehicleImage(vehicleId, filename, dataUrl) {
    try {
      const token    = await getToken();
      const folderId = await getVehicleFolder(vehicleId, token);
      const result   = await uploadFile(filename, 'image/jpeg', dataUrl, token, folderId);
      if (result.id) await makePublic(result.id, token);
      return result;
    } catch(e) { console.error('Drive upload error:', e); return null; }
  }

  // ── Obtener link público de un archivo ───────────────────────────────────────
  function getPublicUrl(fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  // ── Verificar si está configurado ────────────────────────────────────────────
  async function isConfigured() {
    const c = await loadConfig();
    return !!c;
  }

  function dateSlug() {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getFullYear()}`;
  }

  return { uploadVehicleImage, getToken, getVehicleFolder, uploadFile, makePublic, getPublicUrl, isConfigured, dateSlug };
})();
