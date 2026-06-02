// Budget / Form Module
const BudgetModule = (() => {
  let editingId = null;

  const ESTADOS_ORDER = ['peritado','turnado','reparado','finalizado'];
  const ESTADOS_LABELS = { peritado:'Peritado', turnado:'Turnado', reparado:'Reparado', finalizado:'Finalizado' };
  const ESTADOS_COLORS = { peritado:'#60a5fa', turnado:'#a78bfa', reparado:'#34d399', finalizado:'#fbbf24' };

  function setupAutocomplete(inputId, dropdownId, field) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    function getOptions() {
      const val = input.value.trim().toLowerCase();
      const all = VehiclesModule.getAllVehicles();
      const unique = [...new Set(all.map(v => v[field]).filter(Boolean))].sort();
      return val ? unique.filter(o => o.toLowerCase().includes(val)) : unique;
    }

    function showDropdown() {
      const opts = getOptions();
      if (!opts.length) { dropdown.classList.add('hidden'); return; }
      dropdown.innerHTML = opts.map(o =>
        `<div class="autocomplete-item">${o}</div>`
      ).join('');
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = item.textContent;
          dropdown.classList.add('hidden');
        });
        item.addEventListener('touchstart', e => {
          e.preventDefault();
          input.value = item.textContent;
          dropdown.classList.add('hidden');
        }, { passive: false });
      });
    }

    input.addEventListener('input',  showDropdown);
    input.addEventListener('focus',  showDropdown);
    input.addEventListener('blur',   () => setTimeout(() => dropdown.classList.add('hidden'), 150));
  }

  // Selector de estado: un solo botón que cicla
  const ESTADO_LABELS  = { peritado:'Fecha peritado', turnado:'Fecha turnado', reparado:'Fecha reparado', finalizado:'Fecha facturado', anulado:'Fecha anulado' };
  const ESTADO_NOMBRES = { peritado:'Peritado', turnado:'Turnado', reparado:'Reparado', finalizado:'Facturado', anulado:'Anulado' };
  const ESTADO_COLORES = { peritado:'#60a5fa', turnado:'#a78bfa', reparado:'#34d399', finalizado:'#fbbf24', anulado:'#ef4444' };
  const ESTADO_CICLO   = ['peritado','turnado','reparado','finalizado','anulado'];

  function selectEstado(estado) {
    const btn = document.getElementById('estado-single-btn');
    if (btn) {
      btn.dataset.estado = estado;
      btn.style.setProperty('--ec', ESTADO_COLORES[estado] || '#60a5fa');
      const lbl = btn.querySelector('.estado-single-label');
      if (lbl) lbl.textContent = ESTADO_NOMBRES[estado] || estado;
    }
    const label = document.getElementById('estado-sel-label');
    if (label) label.textContent = ESTADO_LABELS[estado] || 'Fecha';
    syncEstadoFromSelector(estado);

    const firmaSection = document.getElementById('firma-section');
    if (firmaSection) {
      const show = estado === 'reparado';
      firmaSection.style.display = show ? 'block' : 'none';
      if (show) setTimeout(() => initFirma(), 50);
    }
  }

  // Avanza al siguiente estado del ciclo
  window.cycleEstado = function() {
    const btn = document.getElementById('estado-single-btn');
    const actual = btn?.dataset.estado || 'peritado';
    const idx = ESTADO_CICLO.indexOf(actual);
    const siguiente = ESTADO_CICLO[(idx + 1) % ESTADO_CICLO.length];
    selectEstado(siguiente);
    // Marcar el estado nuevo en los inputs ocultos con la fecha actual si no tiene
    const fechaInput = document.getElementById('estado-sel-fecha');
    const hoy = new Date().toISOString().split('T')[0];
    if (fechaInput && !fechaInput.value) fechaInput.value = hoy;
    aplicarEstadoHidden(siguiente, fechaInput?.value || hoy);
  };

  function aplicarEstadoHidden(estado, fecha) {
    // Limpiar todos
    ['peritado','turnado','reparado','finalizado','anulado'].forEach(e => {
      const c = document.getElementById(`estado-check-${e}`);
      if (c) c.checked = false;
    });
    if (estado === 'anulado') {
      setEstadoHidden('anulado', fecha, true);
    } else {
      // Marcar este y los previos de la secuencia lineal
      const seq = ['peritado','turnado','reparado','finalizado'];
      const idx = seq.indexOf(estado);
      seq.forEach((est, i) => {
        if (i <= idx) {
          const prev = document.getElementById(`estado-fecha-${est}`);
          const val  = (prev && prev.value) ? prev.value : fecha;
          setEstadoHidden(est, i === idx ? fecha : val, true);
        }
      });
    }
  }

  function initEstadoSelector() {
    document.getElementById('estado-sel-fecha')?.addEventListener('change', e => {
      const btn = document.getElementById('estado-single-btn');
      const estado = btn?.dataset.estado || 'peritado';
      aplicarEstadoHidden(estado, e.target.value);
    });
  }

  function setEstadoHidden(estado, fecha, checked) {
    const f = document.getElementById(`estado-fecha-${estado}`);
    const c = document.getElementById(`estado-check-${estado}`);
    if (f) f.value = fecha;
    if (c) c.checked = checked;
  }

  function syncEstadoFromSelector(estado) {
    const fecha = document.getElementById(`estado-fecha-${estado}`)?.value || '';
    const selFecha = document.getElementById('estado-sel-fecha');
    if (selFecha) selFecha.value = fecha;
  }

  function syncSelectorFromHidden() {
    const orden = ['anulado','finalizado','reparado','turnado','peritado'];
    let ultimo = null;
    for (const e of orden) {
      const check = document.getElementById(`estado-check-${e}`);
      if (check?.checked) { ultimo = e; break; }
    }
    if (!ultimo) ultimo = 'peritado';
    selectEstado(ultimo);
  }

  function populateDatalist() {
    setupAutocomplete('f-compania', 'ac-compania', 'compania');
    setupAutocomplete('f-localidad', 'ac-localidad', 'localidad');
    initEstadoSelector();
  }

  function openNew() {
    editingId = null;
    resetForm();
    populateDatalist();
    // Auto-set peritado with today's date
    const today = new Date().toISOString().split('T')[0];
    const cb    = document.getElementById('estado-check-peritado');
    const fd    = document.getElementById('estado-fecha-peritado');
    if (cb) cb.checked = true;
    if (fd) fd.value   = today;
    if (typeof BudgetModule !== 'undefined') updateEstadoRowDirect('peritado');
    document.getElementById('form-title').textContent = 'Nuevo Vehículo';
    document.getElementById('delete-form-btn').classList.add('hidden');
    navigateTo('form-view');
    switchFormTab('datos');
  }

  function openEdit(id) {
    const v = VehiclesModule.getVehicle(id);
    if (!v) return;
    editingId = id;
    populateForm(v);
    populateDatalist();
    syncSelectorFromHidden();
    document.getElementById('form-title').textContent = 'Editar Vehículo';
    document.getElementById('delete-form-btn').classList.remove('hidden');
    navigateTo('form-view');
    switchFormTab('datos');
  }

  function setTodayDate() {
    const el = document.getElementById('f-fecha');
    if (el) el.value = new Date().toISOString().split('T')[0];
  }

  function stripPrefix(tel) { return (tel||'').replace(/^\+?549?/,'').replace(/\D/g,''); }
  function addPrefix(tel) {
    const d = tel.replace(/\D/g,'');
    if (!d) return '';
    if (d.startsWith('549')) return '+'+d;
    if (d.startsWith('54'))  return '+549'+d.slice(2);
    return '+549'+d;
  }

  function populateForm(v) {
    document.getElementById('f-modelo').value        = v.modelo || '';
    document.getElementById('f-patente').value       = v.patente || '';
    document.getElementById('f-asegurado').value     = v.asegurado || '';
    document.getElementById('f-telefono').value      = stripPrefix(v.telefono||'');
    document.getElementById('f-compania').value      = v.compania || '';
    document.getElementById('f-localidad').value     = v.localidad || '';
    document.getElementById('f-observaciones').value = v.observaciones || '';
    document.getElementById('f-repuestos').value     = v.repuestos || '';
    document.getElementById('f-precio').value = v.precio ? Number(v.precio).toLocaleString('es-AR') : '';

    Object.keys(PIEZAS_LABELS).forEach(key => {
      const el = document.getElementById('pieza-'+key);
      if (el) { el.checked = !!(v.piezas && v.piezas[key]); if (typeof setChip==='function') setChip(key, el.checked); }
    });

    // Populate estado tab
    populateEstados(v.estados || {});

    if (editingId) loadImagesTab(editingId);
  }

  function populateEstados(estados) {
    ESTADOS_ORDER.forEach(e => {
      const cb    = document.getElementById(`estado-check-${e}`);
      const fecha = document.getElementById(`estado-fecha-${e}`);
      if (cb)    cb.checked    = !!(estados[e] && estados[e].completado);
      if (fecha) fecha.value   = (estados[e] && estados[e].fecha) || '';
      updateEstadoRow(e);
    });
  }

  function updateEstadoRow(estado) {
    const cb   = document.getElementById(`estado-check-${estado}`);
    const row  = document.getElementById(`estado-row-${estado}`);
    if (!cb || !row) return;
    row.classList.toggle('estado-row-active', cb.checked);
  }

  function updateEstadoRowDirect(estado) { updateEstadoRow(estado); }

  function resetForm() {
    document.getElementById('vehicle-form').reset();
    Object.keys(PIEZAS_LABELS).forEach(key => {
      const el = document.getElementById('pieza-'+key);
      if (el) { el.checked = false; if (typeof setChip==='function') setChip(key, false); }
    });
    document.getElementById('images-preview').innerHTML = '';
    document.getElementById('docs-preview').innerHTML   = '';
  }

  function getFormData() {
    const piezas = {};
    Object.keys(PIEZAS_LABELS).forEach(key => {
      const el = document.getElementById('pieza-'+key);
      piezas[key] = el ? el.checked : false;
    });
    const rawPhone = document.getElementById('f-telefono').value.replace(/\D/g,'');
    return {
      modelo:        document.getElementById('f-modelo').value.trim(),
      patente:       document.getElementById('f-patente').value.trim().toUpperCase(),
      asegurado:     document.getElementById('f-asegurado').value.trim(),
      telefono:      addPrefix(rawPhone),
      compania:      document.getElementById('f-compania').value.trim(),
      localidad:     document.getElementById('f-localidad').value.trim(),
      observaciones: document.getElementById('f-observaciones').value.trim(),
      repuestos:     document.getElementById('f-repuestos').value.trim(),
      precio:        document.getElementById('f-precio').value.replace(/\./g,'').replace(/[^0-9]/g,''),
      piezas
    };
  }

  function getEstadosData() {
    const estados = {};
    ESTADOS_ORDER.forEach(e => {
      const cb    = document.getElementById(`estado-check-${e}`);
      const fecha = document.getElementById(`estado-fecha-${e}`);
      if (cb && cb.checked) {
        estados[e] = { completado: true, fecha: fecha?.value || new Date().toISOString().split('T')[0] };
      }
    });
    return estados;
  }

  async function saveForm() {
    const data = getFormData();
    if (!data.modelo) { showToast('Ingresá al menos el modelo','warning'); return; }
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Guardando...';
    const result = await VehiclesModule.saveVehicle(data, editingId);
    const ok = result && result.ok;
    if (ok && !editingId) editingId = result.id;
    if (ok && editingId) {
      const estados = getEstadosData();
      await VehiclesModule.saveEstados(editingId, estados);

      // Si hay firma dibujada y el estado es reparado, guardarla como imagen
      const btn1 = document.getElementById('estado-single-btn');
      const estadoActual = btn1?.dataset.estado;
      if (estadoActual === 'reparado' && typeof firmaEstaFirmada === 'function' && firmaEstaFirmada()) {
        try {
          const firmaB64 = getFirmaBase64();
          const col = db.collection('users').doc(AuthModule.getUserId())
            .collection('vehicles').doc(editingId).collection('images');
          // Borrar firma anterior si existe
          const prevFirma = await col.where('type','==','firma').get();
          await Promise.all(prevFirma.docs.map(d => d.ref.delete()));
          // Guardar nueva firma
          await col.add({
            name: 'firma_cliente.png',
            type: 'firma',
            data: firmaB64,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch(e) { console.warn('Error guardando firma:', e); }
      }
    }
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Guardar';
    if (ok) navigateTo('home');
  }

  async function switchFormTab(tab) {
    // Si va a fotos y es nuevo, auto-guardar primero para obtener el ID
    if (tab === 'archivos' && !editingId) {
      const data = getFormData();
      if (!data.modelo) {
        showToast('Ingresá el modelo antes de subir fotos', 'warning');
        return;
      }
      const result = await VehiclesModule.saveVehicle(data, null, true);
      if (result && result.ok && result.id) {
        editingId = result.id;
      } else {
        const all = VehiclesModule.getAllVehicles();
        if (all.length) editingId = all[all.length - 1].id;
      }
    }
    document.querySelectorAll('.form-tab-btn').forEach(b  => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
    if (tab === 'archivos') {
      const delBtn = document.getElementById('form-delete-drive-btn');
      if (delBtn) delBtn.style.display = 'none';
      if (editingId) {
        loadImagesTab(editingId);
      }
    }
  }

  // ── Images: stored in BOTH Drive (if available) AND Firestore base64 ─────────
  function getImagesCollection(vehicleId) {
    const uid = AuthModule.getUserId();
    if (!uid || !vehicleId) return null;
    return db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).collection('images');
  }

  async function loadImagesTab(vehicleId) {
    const col         = getImagesCollection(vehicleId);
    const preview     = document.getElementById('images-preview');
    const docsPreview = document.getElementById('docs-preview');
    preview.innerHTML     = '<div class="loading-sm">Cargando imágenes...</div>';
    docsPreview.innerHTML = '<div class="loading-sm">Cargando documentos...</div>';

    if (!col) { preview.innerHTML = ''; docsPreview.innerHTML = ''; const d=document.getElementById('form-delete-drive-btn'); if(d) d.style.display='none'; return; }

    try {
      const snap  = await col.orderBy('createdAt','asc').get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const imgs  = items.filter(i => i.type === 'image');
      const docs  = items.filter(i => i.type === 'doc');

      preview.innerHTML = imgs.length
        ? imgs.map(i => {
            // Prefer base64 for display (always available), fallback to url
            const displaySrc = i.data || i.url || '';
            return `<div class="img-thumb-wrap">
              <img src="${displaySrc}" alt="${i.name}" onclick="openImageViewer('${displaySrc}')">
              <button class="img-thumb-del" onclick="BudgetModule.deleteMediaItem('${vehicleId}','${i.id}',event)">×</button>
            </div>`;
          }).join('')
        : '<p class="empty-media">Sin imágenes aún</p>';

      docsPreview.innerHTML = docs.length
        ? '<div class="docs-list">'+docs.map(d=>`
            <div class="doc-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              <a href="${d.data||d.url}" download="${d.name}">${d.name}</a>
              <button class="doc-delete-btn" onclick="BudgetModule.deleteMediaItem('${vehicleId}','${d.id}',event)">×</button>
            </div>`).join('')+'</div>'
        : '<p class="empty-media">Sin documentos aún</p>';

      // Mostrar el botón "Eliminar fotos de Drive" solo si hay imágenes o documentos
      const delBtn = document.getElementById('form-delete-drive-btn');
      if (delBtn) delBtn.style.display = (imgs.length || docs.length) ? 'flex' : 'none';

    } catch(e) { console.error(e); preview.innerHTML = '<p class="empty-media">Error al cargar</p>'; docsPreview.innerHTML = ''; }
  }

  function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h*maxWidth/w); w = maxWidth; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Thumbnail pequeño para portada del vehículo (muy comprimido, solo para display)
  function makeThumbnail(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max = 200;
          let w = img.width, h = img.height;
          if (w > h) { h = Math.round(h*max/w); w = max; } else { w = Math.round(w*max/h); h = max; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function b64KB(str) { return Math.round(str.length*0.75/1024); }

  async function uploadFile(file, vehicleId, silent = false, driveCtx = null) {
    if (!vehicleId) return;
    const col = getImagesCollection(vehicleId);
    if (!col) return;
    const isImage = file.type.startsWith('image/');
    if (file.size > 20*1024*1024) { showToast('Archivo demasiado grande (máx 20MB)','error'); return; }

    try {
      let data = null, url = null, driveId = null;

      if (isImage) {
        data = await compressImage(file, 1400, 0.82);
        if (b64KB(data) > 550) data = await compressImage(file, 1200, 0.75);
        if (b64KB(data) > 550) data = await compressImage(file, 1000, 0.70);
        if (b64KB(data) > 700) { showToast('Imagen muy grande','error'); return; }

        // Usar driveCtx pre-obtenido (evita race condition al crear carpetas)
        try {
          const ctx = driveCtx || (await (async () => {
            const driveOk = await DrivePublicModule.isConfigured();
            if (!driveOk) return null;
            const token = await DrivePublicModule.getToken();
            const folderId = await DrivePublicModule.getVehicleFolder(vehicleId, token);
            return { token, folderId };
          })());
          if (ctx) {
            const slug   = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/\s/g,'_')}`;
            const result = await DrivePublicModule.uploadFile(slug, 'image/jpeg', data, ctx.token, ctx.folderId);
            if (result && result.id) {
              await DrivePublicModule.makePublic(result.id, ctx.token);
              url = DrivePublicModule.getPublicUrl(result.id);
              driveId = result.id;
            }
          }
        } catch(driveErr) { console.warn('Drive upload failed:', driveErr); }

      } else {
        data = await fileToBase64(file);
        if (b64KB(data) > 900) { showToast('Documento muy pesado (máx ~700KB)','error'); return; }
      }

      const docData = { name: file.name, type: isImage ? 'image' : 'doc', data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (url)     docData.url     = url;
      if (driveId) docData.driveId = driveId;
      await col.add(docData);

      if (!silent) { showToast('Archivo guardado','success'); loadImagesTab(vehicleId); }
    } catch(e) { console.error(e); showToast('Error al guardar archivo','error'); }
  }

  async function deleteMediaItem(vehicleId, itemId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!vehicleId || !itemId) { showToast('Error al eliminar','error'); return; }
    const col = getImagesCollection(vehicleId);
    if (!col) { showToast('Error al eliminar','error'); return; }
    try {
      const docSnap  = await col.doc(itemId).get();
      const itemData = docSnap.exists ? docSnap.data() : null;

      // Borrar de Drive si tiene driveId
      if (itemData && itemData.driveId) {
        try {
          const token = await DrivePublicModule.getToken();
          await fetch(`https://www.googleapis.com/drive/v3/files/${itemData.driveId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
          });
        } catch(driveErr) { console.warn('No se pudo borrar de Drive:', driveErr); }
      }

      await col.doc(itemId).delete();

      const remaining = await col.where('type','==','image').orderBy('createdAt','asc').get();
      if (remaining.empty) {
        await VehiclesModule.updateFirstPhoto(vehicleId, null);
      } else {
        const first = remaining.docs[0].data();
        await VehiclesModule.updateFirstPhoto(vehicleId, first.data || first.url || null);
      }
      // Ocultar inmediatamente sin esperar
      loadImagesTab(vehicleId);
      showToast('Foto eliminada','info');
    } catch(e) {
      console.error('deleteMediaItem error:', e);
      // Recargar igual para reflejar estado real
      loadImagesTab(vehicleId);
    }
  }

  async function getImagesForPDF(vehicleId) {
    const col = getImagesCollection(vehicleId);
    if (!col) return [];
    try {
      const snap = await col.where('type','==','image').orderBy('createdAt','asc').get();
      return snap.docs.map(d => d.data());
    } catch(e) { return []; }
  }

  async function confirmMediaSave() { showToast('Archivos guardados','success'); }

  return {
    openNew, openEdit, saveForm, switchFormTab,
    uploadFile, makeThumbnail, deleteMediaItem, loadImagesTab, getImagesForPDF,
    confirmMediaSave, updateEstadoRow,
    getEditingId: () => editingId
  };
})();

// ── Vehicle Detail Modal ─────────────────────────────────────────────────────
function openVehicleDetail(id) {
  const v = VehiclesModule.getVehicle(id);
  if (!v) return;

  const piezasActivas  = VehiclesModule.getOrderedPiecesPublic(v.piezas);
  // Construir grilla de piezas con orden específico
  const PZ_LABELS = {
    capot:'Capot', techo:'Techo', baul:'Baúl',
    gf_izq:'Guardab. Del. Izq.', pd_izq:'Puerta Del. Izq.', pt_izq:'Puerta Tras. Izq.', gt_izq:'Guardab. Tras. Izq.',
    gf_der:'Guardab. Del. Der.', pd_der:'Puerta Del. Der.', pt_der:'Puerta Tras. Der.', gt_der:'Guardab. Tras. Der.',
    parante_izq:'Parante Izq.', parante_der:'Parante Der.'
  };
  // Desktop: filas anchas
  const PZ_FILAS_DESKTOP = [
    ['capot','techo','baul','parante_izq','parante_der'],
    ['gf_izq','pd_izq','pt_izq','gt_izq'],
    ['gf_der','pd_der','pt_der','gt_der'],
  ];
  // Móvil: pares izquierda/derecha
  const PZ_FILAS_MOVIL = [
    ['capot','techo','baul'],
    ['gf_izq','gf_der'],
    ['pd_izq','pd_der'],
    ['pt_izq','pt_der'],
    ['gt_izq','gt_der'],
    ['parante_izq','parante_der'],
  ];
  function buildPiezasGrid(filas) {
    return filas.map(fila => {
      const activas = fila.filter(k => v.piezas[k]);
      if (!activas.length) return '';
      return `<div class="pieces-row">${activas.map(k => `<span class="chip">${PZ_LABELS[k]}</span>`).join('')}</div>`;
    }).join('');
  }
  let piezasGridHtml = '';
  if (v.piezas && Object.values(v.piezas).some(Boolean)) {
    piezasGridHtml = `
      <div class="pieces-grid-desktop">${buildPiezasGrid(PZ_FILAS_DESKTOP)}</div>
      <div class="pieces-grid-movil">${buildPiezasGrid(PZ_FILAS_MOVIL)}</div>`;
  }
  const ESTADO_CONFIG  = VehiclesModule.getEstadoConfig();
  const ESTADOS_ORDER  = ['peritado','turnado','reparado','finalizado'];
  const tel            = v.telefono || '';
  
  // Fecha de peritado
  const peritadoDate = (v.estados && v.estados.peritado && v.estados.peritado.fecha) ? v.estados.peritado.fecha : null;
  const displayDate = peritadoDate ? peritadoDate.split('-').reverse().join('/') : '';

  // Build estados timeline
  let estadosHtml = '';
  const estados = v.estados || {};
  const tieneEstados = ESTADOS_ORDER.some(e => estados[e] && estados[e].completado);
  if (tieneEstados) {
    const estadoItems = ESTADOS_ORDER.filter(e => estados[e] && estados[e].completado).map(e => {
      const cfg = ESTADO_CONFIG[e];
      return `<div class="timeline-item" style="border-left-color:${cfg.color}">
        <span class="timeline-label" style="color:${cfg.color}">${cfg.label}</span>
        <span class="timeline-date">${estados[e].fecha ? estados[e].fecha.split('-').reverse().join('/') : ''}</span>
      </div>`;
    });
    estadosHtml = `<div class="estados-timeline-grid">${estadoItems.join('')}</div>`;
  }

  const telHtml = tel
    ? `<span class="detail-value tel-clickable" onclick="openTelMenu('${tel}')">${tel} <span style="font-size:10px;opacity:0.6">▼</span></span>`
    : '<span class="detail-value">-</span>';

  // Botón editar en el header del modal
  const editBtn = document.getElementById('detail-modal-edit-btn');
  if (editBtn) editBtn.innerHTML = `<button class="detail-edit-icon-btn" onclick="closeModal('detail-modal');openEditVehicle('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header-section">
      <div class="detail-vehicle-icon" onclick="openPhotoViewer('${id}')">
        ${v.firstPhotoUrl
          ? `<img src="${v.firstPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M15 9V7H7L5 9"/></svg>`
        }
      </div>
      <div style="flex:1;min-width:0">
        <h2 class="detail-model">${v.modelo||'Sin modelo'}</h2>
        <span class="detail-plate">${v.patente||'-'}</span>
      </div>
      ${v.precio ? `<span class="detail-header-price">$${Number(v.precio).toLocaleString('es-AR')}</span>` : ''}
    </div>
    <div class="detail-grid">
      <div class="detail-field"><label>Asegurado</label><span>${v.asegurado||'-'}</span></div>
      <div class="detail-field"><label>Teléfono</label>${telHtml}</div>
      <div class="detail-field"><label>Compañía</label><span>${v.compania||'-'}</span></div>
      <div class="detail-field"><label>Localidad</label><span>${v.localidad||'-'}</span></div>
    </div>
    ${estadosHtml}
    ${piezasGridHtml ? `<div class="detail-section" style="margin-top:14px"><h4>Piezas Afectadas</h4><div class="pieces-grid-detail">${piezasGridHtml}</div></div>` : ''}
    ${v.observaciones ? `<div class="detail-section"><h4>Observaciones</h4><p>${v.observaciones}</p></div>` : ''}
    ${v.repuestos     ? `<div class="detail-section"><h4>Repuestos</h4><p>${v.repuestos}</p></div>` : ''}

    <div id="detail-photo-gallery" class="detail-photo-gallery"></div>
    <div id="detail-doc-strip"></div>
    <div class="detail-actions">
      <button class="btn-detail photos" onclick="openDrivePhotos('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Fotos
      </button>
      <button class="btn-detail share" onclick="closeModal('detail-modal');ShareModule.openShareMenu('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Compartir
      </button>
    </div>
  `;
  openModal('detail-modal');
  // Load photo gallery async
  loadDetailGallery(id, v);

  // Cargar documentos del vehículo y mostrarlos como tira fina
  (async () => {
    const strip = document.getElementById('detail-doc-strip');
    if (!strip) return;
    try {
      const uid = AuthModule.getUserId();
      const snap = await db.collection('users').doc(uid).collection('vehicles').doc(id).collection('images').where('type','==','doc').get();
      if (snap.empty) { strip.innerHTML = ''; return; }
      const docs = snap.docs.map(d => d.data());
      strip.innerHTML = docs.map(d => `
        <a href="${d.data||d.url||'#'}" download="${d.name}" class="detail-doc-strip-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          <span>Documento adjunto: ${d.name}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;opacity:0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>`).join('');
    } catch(e) { console.warn('docs error:', e); strip.innerHTML = ''; }
  })();
}

// Tel menu
function openTelMenu(tel) {
  document.getElementById('tel-menu-wa').onclick   = () => { window.open(`https://wa.me/${tel.replace(/\D/g,'')}`, '_blank'); closeModal('tel-modal'); };
  document.getElementById('tel-menu-call').onclick = () => { window.location.href = `tel:${tel}`; closeModal('tel-modal'); };
  openModal('tel-modal');
}

// Photo viewer
async function openPhotoViewer(vehicleId) {
  const uid = AuthModule.getUserId();
  if (!uid) return;
  try {
    const snap = await db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).collection('images').where('type','==','image').orderBy('createdAt','asc').get();
    if (snap.empty) return;
    const imgs = snap.docs.map(d => d.data());
    let current = 0;

    function showImg(i) {
      const src = imgs[i].data || imgs[i].url;
      document.getElementById('viewer-img').src = src;
      document.getElementById('viewer-counter').textContent = `${i+1} / ${imgs.length}`;
      document.getElementById('viewer-prev').classList.toggle('hidden', i===0);
      document.getElementById('viewer-next').classList.toggle('hidden', i===imgs.length-1);
    }

    document.getElementById('viewer-prev').onclick = () => { if (current>0) { current--; showImg(current); } };
    document.getElementById('viewer-next').onclick = () => { if (current<imgs.length-1) { current++; showImg(current); } };
    showImg(0);
    openModal('image-viewer-modal');
  } catch(e) { console.error(e); }
}

// ── Detail photo gallery with Drive folder link ──────────────────────────────
async function loadDetailGallery(vehicleId, v) {
  const gallery = document.getElementById('detail-photo-gallery');
  if (!gallery) return;

  const uid = AuthModule.getUserId();
  if (!uid) { gallery.innerHTML = ''; return; }

  try {
    const col = db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).collection('images');

    const snapImgs = await col.where('type','==','image').orderBy('createdAt','asc').get();
    const imgs = snapImgs.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!imgs.length) { gallery.innerHTML = ''; return; }

    // Build drive folder URL if possible
    const driveFolderBtn = buildDriveFolderBtn(vehicleId, imgs);

    function renderGallery() {
      const src = imgs[current].data || imgs[current].url || '';
      gallery.innerHTML = `
        <div class="detail-gallery-wrap">
          <div class="detail-gallery-header">
            <span class="detail-gallery-title">Fotos (${current+1}/${imgs.length})</span>
            ${driveFolderBtn}
          </div>
          <div class="detail-gallery-img-wrap">
            <img src="${src}" class="detail-gallery-img" onclick="openImageViewer('${src}')">
            ${imgs.length > 1 ? `
            <button class="gallery-nav gallery-prev ${current===0?'hidden':''}" onclick="galleryNav(-1,'${vehicleId}')">‹</button>
            <button class="gallery-nav gallery-next ${current===imgs.length-1?'hidden':''}" onclick="galleryNav(1,'${vehicleId}')">›</button>` : ''}
          </div>
          <button class="delete-photos-btn" onclick="confirmDeleteDriveFolder('${vehicleId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Eliminar fotos de Drive
          </button>
        </div>`;
    }

    // Store current index on window for nav
    window._galleryState = window._galleryState || {};
    window._galleryState[vehicleId] = { imgs, current: 0 };

    window.galleryNav = function(dir, vid) {
      const state = window._galleryState[vid];
      if (!state) return;
      state.current = Math.max(0, Math.min(state.imgs.length-1, state.current + dir));
      const g = document.getElementById('detail-photo-gallery');
      if (!g) return;
      const s = state.imgs[state.current].data || state.imgs[state.current].url || '';
      g.querySelector('.detail-gallery-img').src = s;
      g.querySelector('.gallery-prev')?.classList.toggle('hidden', state.current===0);
      g.querySelector('.gallery-next')?.classList.toggle('hidden', state.current===state.imgs.length-1);
      g.querySelector('.detail-gallery-title').textContent = `Fotos (${state.current+1}/${state.imgs.length})`;
    };

    renderGallery();
  } catch(e) {
    console.error(e);
    gallery.innerHTML = '';
  }
}

function buildDriveFolderBtn(vehicleId, imgs) {
  // Try to get a drive file ID from any image to derive folder
  const withDrive = imgs.find(i => i.driveFileId || (i.url && i.url.includes('id=')));
  if (!withDrive) {
    // No drive files — offer export button that copies base64 info
    return `<button class="gallery-drive-btn" onclick="exportDriveLink('${vehicleId}')">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M6.28 3L1 12.36 4.36 18 9.64 9 6.28 3zM22.99 12.36L17.72 3h-6.72l5.27 9.36L22.99 12.36zM9.64 10.5L4.36 19.5h15.28l-5.28-9L9.64 10.5z"/></svg>
      Ver en Drive
    </button>`;
  }
  // Build drive folder URL from file
  const fileId = withDrive.driveFileId || withDrive.url.match(/id=([^&]+)/)?.[1];
  const uid    = AuthModule.getUserId();
  // Drive folder path: Desabollito/uid/vehicleId
  return `<button class="gallery-drive-btn" onclick="openDriveFolder('${fileId}','${uid}','${vehicleId}')">
    <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px"><path d="M6.28 3L1 12.36 4.36 18 9.64 9 6.28 3zM22.99 12.36L17.72 3h-6.72l5.27 9.36L22.99 12.36zM9.64 10.5L4.36 19.5h15.28l-5.28-9L9.64 10.5z"/></svg>
    Ver en Drive
  </button>`;
}

async function deleteCurrentVehicleDriveFolder() {
  const id = BudgetModule.getEditingId ? BudgetModule.getEditingId() : null;
  if (!id) { showToast('Guardá el vehículo primero', 'warning'); return; }
  await confirmDeleteDriveFolder(id);
  document.getElementById('form-delete-drive-btn').style.display = 'none';
}

async function confirmDeleteDriveFolder(vehicleId) {
  if (!confirm('¿Eliminar TODAS las fotos de este vehículo (en la app y en Drive)? Esta acción no se puede deshacer.')) return;
  showToast('Eliminando fotos...', 'info');
  try {
    // 1) Borrar imágenes de Firestore (las de la app)
    const uid = AuthModule.getUserId();
    const imgsCol = db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).collection('images');
    const imgsSnap = await imgsCol.where('type','==','image').get();
    await Promise.all(imgsSnap.docs.map(d => imgsCol.doc(d.id).delete()));

    // 2) Borrar de Drive
    try {
      const token    = await DrivePublicModule.getToken();
      const folderId = await DrivePublicModule.getVehicleFolder(vehicleId, token);
      const res  = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const files = data.files || [];
      await Promise.all(files.map(f =>
        fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
        })
      ));
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
    } catch(driveErr) { console.warn('Error borrando de Drive:', driveErr); }

    // 3) Limpiar miniatura
    await VehiclesModule.updateFirstPhoto(vehicleId, null);
    showToast('Fotos eliminadas', 'success');

    // Recargar la pestaña si está abierta
    if (typeof BudgetModule !== 'undefined' && BudgetModule.getEditingId && BudgetModule.getEditingId() === vehicleId) {
      BudgetModule.loadImagesTab(vehicleId);
    }
  } catch(e) {
    console.error(e);
    showToast('Error al eliminar fotos', 'error');
  }
}

async function openDrivePhotos(vehicleId) {
  showToast('Abriendo fotos...', 'info');
  try {
    const token = await DrivePublicModule.getToken();
    const folderId = await DrivePublicModule.getVehicleFolder(vehicleId, token);
    if (folderId) {
      window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    } else {
      showToast('Este vehículo no tiene carpeta de fotos', 'warning');
    }
  } catch(e) {
    console.error('Drive photos error:', e);
    showToast('No se pudo abrir el Drive', 'error');
  }
}

async function openDriveFolder(fileId, uid, vehicleId) {
  // Try to find the parent folder from Drive API
  try {
    const token = await DrivePublicModule.getToken();
    const res   = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data  = await res.json();
    const fid   = data.parents?.[0];
    if (fid) {
      const url = `https://drive.google.com/drive/folders/${fid}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link de Drive copiado', 'success');
      } catch (e) {
        console.warn('Clipboard error:', e);
        showToast('No se pudo copiar, pero abriendo Drive...', 'info');
      }
      window.open(url, '_blank');
    } else {
      exportDriveLink(vehicleId);
    }
  } catch(e) {
    console.error('Drive folder error:', e);
    exportDriveLink(vehicleId);
  }
}

async function exportDriveLink(vehicleId) {
  // Fallback: try to get folder from DrivePublicModule
  try {
    const token  = await DrivePublicModule.getToken();
    const folderId = await DrivePublicModule.getVehicleFolder(vehicleId, token);
    const url    = `https://drive.google.com/drive/folders/${folderId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link de Drive copiado', 'success');
    } catch (e) {
      console.warn('Clipboard error:', e);
      showToast('No se pudo copiar, pero abriendo Drive...', 'info');
    }
    window.open(url, '_blank');
  } catch(e) {
    console.error('Drive export error:', e);
    showToast('Drive no configurado o sin fotos subidas', 'warning');
  }
}
