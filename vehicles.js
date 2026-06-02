// Vehicles Module
const VehiclesModule = (() => {
  let vehicles    = [];
  let currentFilter = 'mios'; // 'mios' | 'corp'

  function getFilteredVehicles() {
    if (currentFilter === 'mios') return vehicles.filter(v => v._own);
    return vehicles.filter(v => !v._own); // corp = solo los de otros
  }

  function setFilter(filter) {
    currentFilter = filter;
    renderVehicleList(getFilteredVehicles());
    renderSpreadsheet(getFilteredVehicles());
  }
  let unsubscribe = null;

  const PIEZAS_ORDER = ['capot','techo','baul','gf_izq','pd_izq','pt_izq','gt_izq','gf_der','pd_der','pt_der','gt_der','parante_izq','parante_der'];

  function getUserCollection() {
    const uid = AuthModule.getUserId();
    if (!uid) return null;
    return db.collection('users').doc(uid).collection('vehicles');
  }

  function loadVehicles() {
    const col = getUserCollection();
    if (!col) return;
    showListLoader(true);
    if (unsubscribe) unsubscribe();
    unsubscribe = col.orderBy('createdAt', 'desc').onSnapshot(async snapshot => {
      let propios = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), _ownerUid: AuthModule.getUserId(), _own: true }))
        .filter(v => !v.deleted);

      // Cargar vehículos de compañeros de corporación
      let compartidos = [];
      try {
        if (typeof CorporationModule !== 'undefined') {
          const corp = await CorporationModule.getMyCorp();
          if (corp && corp.members) {
            const myUid = AuthModule.getUserId();
            const otros = corp.members.filter(uid => uid !== myUid);
            for (const uid of otros) {
              const snap = await db.collection('users').doc(uid).collection('vehicles').orderBy('createdAt','desc').get();
              snap.docs.forEach(d => {
                const data = d.data();
                if (!data.deleted) compartidos.push({ id: d.id, ...data, _ownerUid: uid, _own: false, _ownerName: corp.memberNames?.[uid] || '' });
              });
            }
          }
        }
      } catch(e) { console.warn('Error cargando vehículos de corporación:', e); }

      vehicles = [...propios, ...compartidos];
      // Mostrar chip de corporación solo si hay vehículos compartidos
      const chipCorp = document.getElementById('chip-corp');
      if (chipCorp) chipCorp.style.display = compartidos.length > 0 ? '' : 'none';
      renderVehicleList(getFilteredVehicles());
      renderSpreadsheet(getFilteredVehicles());
      showListLoader(false);
      updateAutocompletes();
    }, err => {
      console.error(err);
      showToast('Error al cargar vehículos', 'error');
      showListLoader(false);
    });
  }

  const ESTADO_CONFIG = {
    peritado:  { label: 'Peritado',   color: '#60a5fa' },
    turnado:   { label: 'Turnado',    color: '#a78bfa' },
    reparado:  { label: 'Reparado',   color: '#34d399' },
    finalizado:{ label: 'Facturado', color: '#fbbf24' },
    anulado:   { label: 'Anulado',    color: '#ef4444' }
  };

  function estadoBadge(v) {
    // Mostrar el último estado completado
    const orden = ['peritado','turnado','reparado','finalizado'];
    let ultimoEstado = null;
    for (const e of orden) {
      if (v.estados && v.estados[e] && v.estados[e].fecha) ultimoEstado = e;
    }
    if (!ultimoEstado) return '';
    const cfg = ESTADO_CONFIG[ultimoEstado];
    return `<span class="estado-badge" style="background:${cfg.color}22;border-color:${cfg.color}55;color:${cfg.color}">${cfg.label}</span>`;
  }

  function getVehicleStateColor(v) {
    // Devuelve el color del último estado completado
    const orden = ['peritado','turnado','reparado','finalizado'];
    let ultimoEstado = null;
    for (const e of orden) {
      if (v.estados && v.estados[e] && v.estados[e].fecha) ultimoEstado = e;
    }
    if (!ultimoEstado) return '#1a73e8'; // color por defecto
    return ESTADO_CONFIG[ultimoEstado].color;
  }

  function getVehicleStateDate(v) {
    // Devuelve la fecha del último estado, o la de peritado
    const orden = ['finalizado','reparado','turnado','peritado'];
    for (const e of orden) {
      if (v.estados && v.estados[e] && v.estados[e].fecha) return v.estados[e].fecha;
    }
    return null;
  }

  function renderVehicleList(list) {
    const container = document.getElementById('vehicles-list');
    const empty     = document.getElementById('empty-state');
    if (!list || !list.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    container.innerHTML = list.map(v => {
      const hasPhoto  = v.firstPhotoUrl;
      const iconHtml  = hasPhoto
        ? `<img src="${v.firstPhotoUrl}" alt="foto" class="vehicle-thumb" onclick="openPhotoViewer('${v.id}');event.stopPropagation()">`
        : `<div class="vehicle-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M15 9V7H7L5 9"/></svg></div>`;

      // Patente siempre azul (color de peritado)
      const peritadoColor = '#60a5fa';
      // Fecha siempre de peritado (primera fecha)
      const peritadoDate = (v.estados && v.estados.peritado && v.estados.peritado.fecha) ? v.estados.peritado.fecha : null;

      return `
      <div class="vehicle-card" onclick="openVehicleDetail('${v.id}')">
        <div class="vehicle-card-header">
          <div class="vehicle-icon-outer">${iconHtml}</div>
          <div class="vehicle-info">
            <h3 class="vehicle-model">${v.modelo || 'Sin modelo'}${!v._own && v._ownerName ? `<span class="vehicle-shared-badge">${v._ownerName}</span>` : ''}</h3>
            <div class="vehicle-plate-row">
              <span class="vehicle-plate" style="background:${peritadoColor}22;border-color:${peritadoColor}55;color:${peritadoColor}">${v.patente || '-'}</span>
              ${estadoBadge(v)}
            </div>
          </div>
          <div class="vehicle-meta">
            ${v.precio ? `<span class="vehicle-price">$${Number(v.precio).toLocaleString('es-AR')}</span>` : ''}
            <span class="vehicle-date">${formatDateStr(peritadoDate) || formatDate(v.createdAt)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function getOrderedPieces(piezas) {
    if (!piezas) return [];
    return PIEZAS_ORDER.filter(k => piezas[k]).map(k => PIEZAS_LABELS[k] || k);
  }

  // Planilla: mobile muestra 4 cols, desktop todas
  function renderSpreadsheet(list) {
    const tbody = document.getElementById('spreadsheet-body');
    if (!tbody) return;
    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-row">Sin registros</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(v => {
      const piezas = getOrderedPieces(v.piezas).join(', ') || '-';
      const orden  = ['peritado','turnado','reparado','finalizado'];
      let ultimoEstado = '-';
      let stateColor = '#60a5fa'; // peritado por defecto
      for (const e of orden) {
        if (v.estados && v.estados[e] && v.estados[e].fecha) {
          ultimoEstado = (ESTADO_CONFIG[e]?.label || e);
          stateColor = ESTADO_CONFIG[e]?.color || '#60a5fa';
        }
      }
      // Patente siempre azul (peritado) en la planilla
      const peritadoColor = '#60a5fa';
      const peritadoDate = (v.estados && v.estados.peritado && v.estados.peritado.fecha) ? v.estados.peritado.fecha : null;
      return `<tr onclick="openVehicleDetail('${v.id}')" class="spreadsheet-row">
        <td class="col-fecha">${formatDateStr(peritadoDate) || formatDate(v.createdAt)}</td>
        <td class="col-modelo"><strong>${v.modelo||'-'}</strong></td>
        <td class="col-patente"><span class="plate-badge" style="background:${peritadoColor}22;border-color:${peritadoColor}55;color:${peritadoColor}">${v.patente||'-'}</span></td>
        <td class="col-compania col-desktop">${v.compania||'-'}</td>
        <td class="col-localidad col-desktop">${v.localidad||'-'}</td>
        <td class="col-estado col-desktop">${ultimoEstado}</td>
        <td class="col-precio"><strong>${v.precio ? '$'+Number(v.precio).toLocaleString('es-AR') : '-'}</strong></td>
      </tr>`;
    }).join('');
  }

  function updateAutocompletes() {
    const companias   = [...new Set(vehicles.map(v => v.compania).filter(Boolean))];
    const localidades = [...new Set(vehicles.map(v => v.localidad).filter(Boolean))];
    updateDatalist('datalist-compania',  companias);
    updateDatalist('datalist-localidad', localidades);
  }

  function updateDatalist(id, items) {
    const dl = document.getElementById(id);
    if (dl) dl.innerHTML = items.map(i => `<option value="${i}">`).join('');
  }

  async function saveVehicle(data, id = null, silent = false) {
    const col = getUserCollection();
    if (!col) return;
    try {
      if (id) {
        await col.doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        if (!silent) showToast('Vehículo actualizado', 'success');
        return { ok: true, id };
      } else {
        // Al crear: estado inicial = Peritado con fecha actual
        const today = new Date().toISOString().split('T')[0];
        data.estados = { peritado: { fecha: today, completado: true } };
        const ref = await col.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        if (!silent) showToast('Vehículo guardado', 'success');
        return { ok: true, id: ref.id };
      }
    } catch(err) { console.error(err); showToast('Error al guardar', 'error'); return { ok: false }; }
  }

  async function saveEstados(id, estados) {
    const col = getUserCollection();
    if (!col) return;
    try {
      await col.doc(id).update({ estados, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return true;
    } catch(e) { console.error(e); showToast('Error al guardar estado', 'error'); return false; }
  }

  async function updateFirstPhoto(vehicleId, url) {
    const col = getUserCollection();
    if (!col) return;
    try { await col.doc(vehicleId).update({ firstPhotoUrl: url || null }); } catch(e) { console.error(e); }
  }

  async function deleteVehicle(id) {
    const col = getUserCollection();
    if (!col) return;
    try {
      await col.doc(id).update({
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('Vehículo eliminado', 'info');
    } catch(err) { console.error(err); showToast('Error al eliminar', 'error'); }
  }

  async function restoreVehicle(id) {
    const col = getUserCollection();
    if (!col) return;
    try {
      await col.doc(id).update({ deleted: false, deletedAt: null });
      showToast('Vehículo restaurado', 'success');
    } catch(err) { console.error(err); showToast('Error al restaurar', 'error'); }
  }

  async function deletePermanently(id) {
    const col = getUserCollection();
    if (!col) return;
    try {
      const uid      = AuthModule.getUserId();
      const imgsSnap = await db.collection('users').doc(uid).collection('vehicles').doc(id).collection('images').get();
      const batch    = db.batch();
      imgsSnap.forEach(doc => batch.delete(doc.ref));
      batch.delete(col.doc(id));
      await batch.commit();
      showToast('Eliminado permanentemente', 'info');
    } catch(err) { console.error(err); showToast('Error al eliminar', 'error'); }
  }

  async function loadTrash() {
    const col = getUserCollection();
    if (!col) return [];
    const snap = await col.where('deleted', '==', true).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  function searchVehicles(query) {
    const base = getFilteredVehicles();
    if (!query.trim()) { renderVehicleList(base); return; }
    const q = query.toLowerCase();
    renderVehicleList(base.filter(v =>
      (v.modelo||'').toLowerCase().includes(q) || (v.patente||'').toLowerCase().includes(q) ||
      (v.asegurado||'').toLowerCase().includes(q) || (v.compania||'').toLowerCase().includes(q) ||
      (v.localidad||'').toLowerCase().includes(q)
    ));
  }

  function showListLoader(show) {
    const l = document.getElementById('list-loader');
    if (l) l.classList.toggle('hidden', !show);
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' });
  }

  function formatDateStr(str) {
    if (!str) return '';
    const [y,m,d] = str.split('-');
    if (!y||!m||!d) return str;
    return `${d}/${m}/${y.slice(2)}`;
  }

  function getVehicle(id)               { return vehicles.find(v => v.id === id); }
  function getAllVehicles()              { return vehicles; }
  function getOrderedPiecesPublic(p)    { return getOrderedPieces(p); }
  function getEstadoConfig()            { return ESTADO_CONFIG; }
  function getVehicleStateColorPublic(v) { return getVehicleStateColor(v); }
  function getVehicleStateDatePublic(v) { return getVehicleStateDate(v); }

  function renderSpreadsheetSorted(list) { renderSpreadsheet(list); }

  return { loadVehicles, saveVehicle, saveEstados, deleteVehicle, restoreVehicle, deletePermanently, loadTrash, getVehicle, setFilter,
           getAllVehicles, searchVehicles, updateFirstPhoto, renderSpreadsheetSorted,
           getOrderedPiecesPublic, getEstadoConfig, getVehicleStateColorPublic, getVehicleStateDatePublic };
})();

const PIEZAS_LABELS = {
  capot:'Capot', techo:'Techo', baul:'Baúl',
  gf_izq:'Guarda. Del. Izq.', pd_izq:'Puerta Del. Izq.', pt_izq:'Puerta Tras. Izq.', gt_izq:'Guarda. Tras. Izq.',
  gf_der:'Guarda. Del. Der.', pd_der:'Puerta Del. Der.', pt_der:'Puerta Tras. Der.', gt_der:'Guarda. Tras. Der.',
  parante_izq:'Parante Izq.', parante_der:'Parante Der.'
};
