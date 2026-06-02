// Corporation Module — grupos sociales donde técnicos comparten vehículos
const CorporationModule = (() => {

  // Estructura Firestore:
  // corporations/{corpId} = { name, ownerId, ownerName, members: [uid...], memberNames: {uid: name}, createdAt }
  // users/{uid}/profile/info = { corpId }  ← a qué corporación pertenece

  function corpsCol() { return db.collection('corporations'); }

  async function getMyCorp() {
    const uid = AuthModule.getUserId();
    if (!uid) return null;
    // Buscar corporación donde el usuario es miembro
    const snap = await corpsCol().where('members', 'array-contains', uid).limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async function createCorp(name) {
    const uid  = AuthModule.getUserId();
    const user = AuthModule.getUser();
    if (!uid) return null;
    const uname = user?.displayName || user?.email?.split('@')[0] || 'Usuario';
    const ref = await corpsCol().add({
      name: name.trim(),
      ownerId: uid,
      ownerName: uname,
      members: [uid],
      memberNames: { [uid]: uname },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Corporación creada', 'success');
    return ref.id;
  }

  async function addMember(corpId, username) {
    const uname = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
    if (!uname) { showToast('Usuario inválido', 'warning'); return false; }
    // Buscar por el campo username (funciona para email Y Google)
    const snap = await db.collection('publicProfiles').where('username', '==', uname).limit(1).get();
    if (snap.empty) {
      showToast('Usuario no encontrado. Verificá que se haya registrado y tenga ese nombre de usuario.', 'warning');
      return false;
    }
    const targetUid  = snap.docs[0].data().uid;
    const targetName = snap.docs[0].data().name || uname;

    await corpsCol().doc(corpId).update({
      members: firebase.firestore.FieldValue.arrayUnion(targetUid),
      [`memberNames.${targetUid}`]: targetName
    });
    showToast(`${targetName} agregado a la corporación`, 'success');
    return true;
  }

  async function removeMember(corpId, uid) {
    try {
      const corp = (await corpsCol().doc(corpId).get()).data();
      if (!corp) return false;
      const newNames = { ...corp.memberNames };
      delete newNames[uid];
      await corpsCol().doc(corpId).update({
        members: firebase.firestore.FieldValue.arrayRemove(uid),
        memberNames: newNames
      });
      return true;
    } catch(e) {
      console.error('removeMember error:', e);
      showToast('No tenés permiso para esta acción', 'error');
      return false;
    }
  }

  async function leaveCorp(corpId) {
    const uid = AuthModule.getUserId();
    const ok = await removeMember(corpId, uid);
    if (ok) showToast('Saliste de la corporación', 'info');
    return ok;
  }

  async function deleteCorp(corpId) {
    await corpsCol().doc(corpId).delete();
    showToast('Corporación eliminada', 'info');
  }

  // Registrar perfil público para que puedan invitarme (llamar al login)
  async function registerPublicProfile() {
    const uid  = AuthModule.getUserId();
    const user = AuthModule.getUser();
    if (!uid || !user) return;
    const uname = user.displayName || user.email?.split('@')[0] || 'Usuario';
    try {
      // Determinar username: email interno → parte antes de @desabollito.app
      // Google → no tiene username aún, se deja vacío hasta que lo elija
      const isInternal = user.email?.endsWith('@desabollito.app');
      const existing   = await db.collection('publicProfiles').doc(uid).get();
      const data = { uid, email: user.email, name: uname };
      if (isInternal) {
        data.username = user.email.split('@')[0];
      } else if (!existing.exists || !existing.data()?.username) {
        // Google sin username: autogenerar uno desde el nombre/email
        data.username = (user.email?.split('@')[0] || uname).toLowerCase().replace(/[^a-z0-9._-]/g, '');
      }
      await db.collection('publicProfiles').doc(uid).set(data, { merge: true });
    } catch(e) { console.warn('No se pudo registrar perfil público:', e); }
  }

  async function getMyUsername() {
    const uid = AuthModule.getUserId();
    if (!uid) return null;
    const doc = await db.collection('publicProfiles').doc(uid).get();
    return doc.exists ? (doc.data().username || null) : null;
  }

  async function setMyUsername(newName) {
    const uid = AuthModule.getUserId();
    if (!uid) return false;
    const uname = newName.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
    if (uname.length < 3) { showToast('El usuario debe tener al menos 3 caracteres', 'warning'); return false; }
    // Verificar que no esté tomado por otro
    const taken = await db.collection('publicProfiles').where('username', '==', uname).limit(1).get();
    if (!taken.empty && taken.docs[0].data().uid !== uid) {
      showToast('Ese nombre de usuario ya está en uso', 'warning'); return false;
    }
    await db.collection('publicProfiles').doc(uid).set({ username: uname }, { merge: true });
    showToast('Nombre de usuario guardado', 'success');
    return true;
  }

  return { getMyCorp, createCorp, addMember, removeMember, leaveCorp, deleteCorp, registerPublicProfile, getMyUsername, setMyUsername };
})();

// ── UI ──────────────────────────────────────────────────────────────
async function openCorp() {
  openModal('corp-modal');
  const c = document.getElementById('corp-content');
  c.innerHTML = '<div class="loading-sm">Cargando...</div>';

  const corp    = await CorporationModule.getMyCorp();
  const myUid   = AuthModule.getUserId();
  const myUser  = await CorporationModule.getMyUsername();

  // Bloque "Tu usuario" — siempre visible
  const userBlock = `
    <div class="corp-myuser">
      <label>Tu nombre de usuario</label>
      <div class="corp-myuser-row">
        <input id="corp-myuser-input" type="text" value="${myUser || ''}" placeholder="Elegí un usuario">
        <button class="corp-myuser-save" onclick="doSetUsername()">Guardar</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:5px">Con este nombre te pueden agregar a una corporación.</p>
    </div>
  `;

  if (!corp) {
    c.innerHTML = userBlock + `
      <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px"></div>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.5;margin-bottom:16px">
        Una corporación te permite compartir vehículos y planillas con otros técnicos. Creá una y agregá a tu equipo.
      </p>
      <div class="login-input-wrap">
        <input id="corp-name-input" type="text" placeholder="Nombre de la corporación">
      </div>
      <button class="form-save-btn" style="width:100%" onclick="doCreateCorp()">Crear corporación</button>
    `;
    return;
  }

  const isOwner = corp.ownerId === myUid;
  const members = (corp.members || []).map(uid => ({
    uid, name: corp.memberNames?.[uid] || 'Usuario', isOwner: uid === corp.ownerId
  }));

  c.innerHTML = userBlock + `
    <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:8px"></div>
    <div class="corp-header">
      <h4>${corp.name}</h4>
      <span class="corp-role">${isOwner ? 'Sos el administrador' : 'Miembro'}</span>
    </div>
    <p class="form-section-title">Miembros (${members.length})</p>
    <div class="corp-members">
      ${members.map(m => `
        <div class="corp-member">
          <div class="corp-member-info">
            <span class="corp-member-name">${m.name}</span>
            ${m.isOwner ? '<span class="corp-owner-badge">Admin</span>' : ''}
          </div>
          ${isOwner && !m.isOwner ? `<button class="corp-remove-btn" onclick="doRemoveMember('${corp.id}','${m.uid}')">×</button>` : ''}
        </div>
      `).join('')}
    </div>
    ${isOwner ? `
      <p class="form-section-title">Agregar técnico</p>
      <div class="login-input-wrap" style="display:flex;gap:8px">
        <input id="corp-add-input" type="text" placeholder="Usuario del técnico" style="flex:1">
        <button class="form-save-btn" style="width:auto;padding:0 16px;margin:0" onclick="doAddMember('${corp.id}')">+</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px">El técnico debe estar registrado en la app.</p>
    ` : ''}
    <div style="margin-top:20px;display:flex;gap:8px">
      ${isOwner
        ? `<button class="corp-danger-btn" onclick="doDeleteCorp('${corp.id}')">Eliminar corporación</button>`
        : `<button class="corp-danger-btn" onclick="doLeaveCorp('${corp.id}')">Salir de la corporación</button>`
      }
    </div>
  `;
}

async function doSetUsername() {
  const val = document.getElementById('corp-myuser-input')?.value.trim();
  if (!val) { showToast('Ingresá un usuario', 'warning'); return; }
  const ok = await CorporationModule.setMyUsername(val);
  if (ok) openCorp();
}

async function doCreateCorp() {
  const name = document.getElementById('corp-name-input')?.value.trim();
  if (!name) { showToast('Ingresá un nombre', 'warning'); return; }
  await CorporationModule.createCorp(name);
  openCorp();
  if (typeof VehiclesModule !== 'undefined') VehiclesModule.loadVehicles();
}

async function doAddMember(corpId) {
  const username = document.getElementById('corp-add-input')?.value.trim();
  if (!username) { showToast('Ingresá un usuario', 'warning'); return; }
  const ok = await CorporationModule.addMember(corpId, username);
  if (ok) openCorp();
}

async function doRemoveMember(corpId, uid) {
  const ok = await CorporationModule.removeMember(corpId, uid);
  if (ok) { showToast('Miembro eliminado', 'info'); openCorp(); }
}

async function doLeaveCorp(corpId) {
  const ok = await CorporationModule.leaveCorp(corpId);
  if (ok) {
    closeModal('corp-modal');
    if (typeof VehiclesModule !== 'undefined') VehiclesModule.loadVehicles();
  }
}

async function doDeleteCorp(corpId) {
  await CorporationModule.deleteCorp(corpId);
  closeModal('corp-modal');
  if (typeof VehiclesModule !== 'undefined') VehiclesModule.loadVehicles();
}
