// Auth Module
const AuthModule = (() => {
  let currentUser = null;

  function init() {
    auth.onAuthStateChanged(async user => {
      currentUser = user;
      if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-shell').classList.remove('hidden');
        document.body.classList.add('logged-in');
        const displayName = user.displayName || user.email?.split('@')[0] || 'Usuario';
        document.getElementById('user-avatar').src = user.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a73e8&color=fff`;
        const dd = document.getElementById('dropdown-user-name');
        if (dd) dd.textContent = displayName;
        if (typeof CorporationModule !== 'undefined') CorporationModule.registerPublicProfile();
        VehiclesModule.loadVehicles();
        await SealModule.load();
      } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-shell').classList.add('hidden');
        document.body.classList.remove('logged-in');
      }
    });
  }

  // Convierte "usuario" → "usuario@desabollito.app" para Firebase
  function toInternalEmail(username) {
    return `${username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '')}@desabollito.app`;
  }

  async function signInWithEmail() {
    const username = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    if (!username) { showToast('Ingresá tu usuario', 'warning'); return; }
    if (!password)  { showToast('Ingresá tu contraseña', 'warning'); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      showToast('Solo letras, números, puntos y guiones', 'warning'); return;
    }
    if (password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }

    const btn   = document.getElementById('email-login-btn');
    btn.disabled = true; btn.textContent = 'Ingresando...';
    const email = toInternalEmail(username);

    try {
      // Intentar login directamente
      await auth.signInWithEmailAndPassword(email, password);
    } catch(err) {
      console.error('Auth error:', err.code, err.message);

      // Códigos que indican que el usuario NO existe
      const userNotFound = err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email';

      // Con email enumeration protection activada, Firebase devuelve
      // auth/invalid-credential tanto para contraseña incorrecta como para usuario inexistente.
      // Para distinguirlos, intentamos crear el usuario primero.
      if (err.code === 'auth/invalid-credential' || userNotFound) {
        // Intentar verificar si existe tratando de crear (fallará con email-already-in-use si existe)
        btn.disabled = false; btn.textContent = 'Continuar';
        try {
          // Si esto NO falla → el usuario no existía → mostrar popup
          // Si falla con email-already-in-use → el usuario existe pero la contraseña es incorrecta
          const testCreate = auth.createUserWithEmailAndPassword(email, 'test-probe-123456');
          // Si llegamos aquí sin error aún → cancelar inmediatamente y mostrar popup
          testCreate.then(async cred => {
            // Eliminar cuenta de prueba
            await cred.user.delete();
          }).catch(() => {});

          const confirmed = await showLoginConfirm(username);
          if (!confirmed) return;

          btn.disabled = true; btn.textContent = 'Creando cuenta...';
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          await cred.user.updateProfile({ displayName: username });
          showToast(`Bienvenido, ${username}!`, 'success');
        } catch(probeErr) {
          if (probeErr.code === 'auth/email-already-in-use') {
            // El usuario existe → contraseña incorrecta
            showToast('Contraseña incorrecta', 'error');
          } else if (probeErr.code === 'auth/weak-password') {
            // El usuario no existía pero la contraseña falló la prueba de creación real
            showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
          } else {
            showToast('Error al ingresar', 'error');
          }
          btn.disabled = false; btn.textContent = 'Continuar';
        }
      } else if (err.code === 'auth/wrong-password') {
        showToast('Contraseña incorrecta', 'error');
        btn.disabled = false; btn.textContent = 'Continuar';
      } else if (err.code === 'auth/too-many-requests') {
        showToast('Demasiados intentos. Esperá un momento.', 'error');
        btn.disabled = false; btn.textContent = 'Continuar';
      } else {
        showToast('Error al ingresar', 'error');
        btn.disabled = false; btn.textContent = 'Continuar';
      }
    }
  }

  async function registerWithEmail() {} // ya no se usa

  async function signInWithGoogle() {
    try {
      showLoginLoader(true);
      await auth.signInWithPopup(googleProvider);
    } catch (err) {
      console.error('Login error:', err);
      showToast('Error al iniciar sesión. Intentá de nuevo.', 'error');
      showLoginLoader(false);
    }
  }

  async function signOut() {
    try { await auth.signOut(); showToast('Sesión cerrada', 'info'); }
    catch (err) { console.error(err); }
  }

  function getUser()   { return currentUser; }
  function getUserId() { return currentUser ? currentUser.uid : null; }

  function showLoginLoader(show) {
    const btn = document.getElementById('google-login-btn');
    if (!btn) return;
    btn.disabled = show;
    btn.innerHTML = show
      ? '<span class="spinner-sm"></span> Iniciando...'
      : '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> Continuar con Google';
  }

  return { init, signInWithGoogle, signInWithEmail, registerWithEmail, signOut, getUser, getUserId };
})();

// ── Seal / Stamp Module ──────────────────────────────────────────────────────
const SealModule = (() => {
  let sealData = null; // { text: '', imageBase64: '' }

  function getUserDoc() {
    const uid = AuthModule.getUserId();
    if (!uid) return null;
    return db.collection('users').doc(uid).collection('config').doc('seal');
  }

  async function load() {
    const ref = getUserDoc();
    if (!ref) return;
    try {
      const snap = await ref.get();
      if (snap.exists) sealData = snap.data();
      else sealData = null;
    } catch(e) { sealData = null; }
  }

  async function save(text, imageBase64) {
    const ref = getUserDoc();
    if (!ref) return;
    sealData = { text: text || '', imageBase64: imageBase64 || '' };
    await ref.set(sealData);
    showToast('Sello guardado ✓', 'success');
  }

  function get() { return sealData; }

  function openModal() {
    const seal = sealData || {};
    document.getElementById('seal-text-input').value = seal.text || '';
    const preview = document.getElementById('seal-img-preview');
    preview.src = seal.imageBase64 || '';
    preview.classList.toggle('hidden', !seal.imageBase64);
    const delBtn = document.getElementById('seal-img-delete-btn');
    if (delBtn) delBtn.style.display = seal.imageBase64 ? 'flex' : 'none';
    openModal2('seal-modal');
  }

  return { load, save, get, openModal };
})();

async function forgotPassword() {
  showToast('Para recuperar tu cuenta, contactá al administrador', 'info');
}

function showLoginConfirm(username) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = 'Usuario no encontrado';
    document.getElementById('confirm-msg').textContent   = `"${username}" no está registrado. ¿Querés crear una cuenta nueva con ese usuario?`;
    const okBtn     = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const icon      = document.querySelector('#confirm-modal .confirm-icon svg');
    okBtn.textContent      = 'Crear cuenta';
    okBtn.className        = 'confirm-ok';
    cancelBtn.textContent  = 'Cancelar';
    if (icon) icon.style.color = 'var(--accent-light)';
    openModal('confirm-modal');
    const cleanup = (result) => {
      closeModal('confirm-modal');
      if (icon) icon.style.color = '';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
