// ═══════════════════════════════════════════════════════════════════════════════
// DRIVE PERSONAL — Sube el PDF al Drive del usuario logueado
// Requiere OAuth2 Client ID configurado en Google Cloud Console
// ═══════════════════════════════════════════════════════════════════════════════

const DriveModule = (() => {

  // ── Completar con tu OAuth2 Client ID de Google Cloud Console ───────────────
  const CLIENT_ID   = '58621481139-pu68u9u165gh6eead4bh71sd4o79fib4.apps.googleusercontent.com';
  const SCOPES      = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME = 'Desabollito';

  let gapiReady = false;
  let folderId  = null;

  function loadGapi() {
    return new Promise(resolve => {
      if (gapiReady) { resolve(); return; }
      if (window.gapi) { initClient().then(() => { gapiReady = true; resolve(); }); return; }
      const s = document.createElement('script');
      s.src   = 'https://apis.google.com/js/api.js';
      s.onload = () => {
        window.gapi.load('client:auth2', () => {
          initClient().then(() => { gapiReady = true; resolve(); });
        });
      };
      document.head.appendChild(s);
    });
  }

  function initClient() {
    return window.gapi.client.init({ clientId: CLIENT_ID, scope: SCOPES, plugin_name: 'Desabollito' });
  }

  async function authorize() {
    await loadGapi();
    const auth2 = window.gapi.auth2.getAuthInstance();
    if (!auth2.isSignedIn.get()) await auth2.signIn({ scope: SCOPES });
    return auth2.currentUser.get().getAuthResponse().access_token;
  }

  async function getOrCreateFolder(token) {
    if (folderId) return folderId;
    const q   = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.files && data.files.length > 0) { folderId = data.files[0].id; return folderId; }
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await create.json();
    folderId = folder.id;
    return folderId;
  }

  async function uploadToDrive(filename, mimeType, dataUrl, token, folId) {
    const b64    = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob     = new Blob([bytes], { type: mimeType });
    const metadata = JSON.stringify({ name: filename, parents: [folId] });
    const form     = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    return res.json();
  }

  async function shareToDrive(vehicleId) {
    const v = VehiclesModule.getVehicle(vehicleId);
    if (!v) return;
    if (CLIENT_ID.includes('TU_CLIENT_ID')) { openModal('drive-setup-modal'); return; }

    showToast('Conectando con tu Drive...', 'info');
    try {
      const token    = await authorize();
      const folId    = await getOrCreateFolder(token);
      showToast('Generando PDF...', 'info');
      const pdfB64   = await PDFModule.generatePDFBase64(vehicleId);
      if (!pdfB64) { showToast('Error generando PDF', 'error'); return; }
      const filename = `Desabollito_${(v.patente||v.modelo||'vehiculo').replace(/\s/g,'_')}_${dateSlug()}.pdf`;
      showToast('Subiendo...', 'info');
      const result   = await uploadToDrive(filename, 'application/pdf', pdfB64, token, folId);
      if (result.id) {
        showToast('✓ Subido a tu Drive', 'success');
        showDriveSuccessModal(result.webViewLink, filename);
      } else { showToast('Error al subir', 'error'); }
    } catch (err) {
      console.error(err);
      if ((err.error||'').includes('popup') || (err.message||'').includes('popup'))
        showToast('Cancelaste la autorización', 'warning');
      else showToast('Error con Drive: ' + (err.message||''), 'error');
    }
  }

  function showDriveSuccessModal(link, filename) {
    document.getElementById('drive-success-filename').textContent = filename;
    document.getElementById('drive-open-btn').onclick = () => window.open(link, '_blank');
    openModal('drive-success-modal');
  }

  function dateSlug() {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getFullYear()}`;
  }

  return { shareToDrive };
})();
