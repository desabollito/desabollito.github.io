// App.js

function exportSpreadsheetPDF() {
  const vehicles = VehiclesModule.getAllVehicles();
  if (!vehicles.length) { showToast('No hay vehículos para exportar', 'warning'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Header azul oscuro (solo el header, no toda la tabla)
  doc.setFillColor(26, 60, 110);
  doc.rect(0, 0, pageW, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('PLANILLA DE VEHÍCULOS — DESABOLLITO', margin, 11);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 255);
  const now = new Date().toLocaleDateString('es-AR');
  doc.text(now, pageW - margin, 11, { align: 'right' });

  // Columnas
  const cols = [
    { label: 'Fecha',     key: 'fecha',     w: 22 },
    { label: 'Modelo',    key: 'modelo',    w: 52 },
    { label: 'Patente',   key: 'patente',   w: 24 },
    { label: 'Compañía',  key: 'compania',  w: 36 },
    { label: 'Localidad', key: 'localidad', w: 36 },
    { label: 'Estado',    key: 'estado',    w: 24 },
    { label: 'Precio',    key: 'precio',    w: 28 },
  ];

  const tableW   = cols.reduce((s, c) => s + c.w, 0);
  const startX   = (pageW - tableW) / 2;
  const rowH     = 8;
  let   currentY = 22;

  // Fila de encabezados — fondo gris medio, texto oscuro
  doc.setFillColor(60, 100, 160);
  doc.rect(startX, currentY, tableW, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  let x = startX;
  cols.forEach(c => {
    doc.text(c.label, x + 2, currentY + 5.5);
    x += c.w;
  });
  currentY += rowH;

  // Filas de datos
  const ESTADO_CONFIG = VehiclesModule.getEstadoConfig();
  const orden = ['peritado','turnado','reparado','finalizado'];

  vehicles.forEach((v, i) => {
    if (currentY + rowH > pageH - 12) {
      doc.addPage('a4', 'landscape');
      // Re-dibujar header de columnas en nueva página
      doc.setFillColor(60, 100, 160);
      doc.rect(startX, currentY, tableW, rowH, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
      x = startX;
      cols.forEach(c => { doc.text(c.label, x+2, currentY+5.5); x += c.w; });
      currentY += rowH;
    }

    // Filas alternadas: blanco puro / gris muy claro
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 255);
      doc.rect(startX, currentY, tableW, rowH, 'F');
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(startX, currentY, tableW, rowH, 'F');
    }

    let ultimoEstado = '-';
    for (const e of orden) {
      if (v.estados?.[e]?.fecha) ultimoEstado = ESTADO_CONFIG[e]?.label || e;
    }
    const peritadoDate = v.estados?.peritado?.fecha || '';
    const fecha  = peritadoDate ? peritadoDate.split('-').reverse().join('/') : '';
    const precio = v.precio ? '$' + Number(v.precio).toLocaleString('es-AR') : '-';

    const rowData = [
      { val: fecha },
      { val: v.modelo || '-' },
      { val: v.patente || '-' },
      { val: v.compania || '-' },
      { val: v.localidad || '-' },
      { val: ultimoEstado },
      { val: precio },
    ];

    // Texto oscuro, legible
    doc.setTextColor(30, 30, 50);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    x = startX;
    rowData.forEach((cell, ci) => {
      const maxW = cols[ci].w - 4;
      const text = doc.splitTextToSize(cell.val, maxW)[0] || '';
      doc.text(text, x + 2, currentY + 5.5);
      x += cols[ci].w;
    });

    // Línea divisora gris claro
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.1);
    doc.line(startX, currentY + rowH, startX + tableW, currentY + rowH);
    currentY += rowH;
  });

  // Borde exterior de la tabla
  doc.setDrawColor(60, 100, 160);
  doc.setLineWidth(0.4);
  doc.rect(startX, 22, tableW, currentY - 22, 'S');

  // Footer
  doc.setFillColor(26, 60, 110);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  doc.setTextColor(200, 220, 255); doc.setFontSize(7);
  doc.text(`Total: ${vehicles.length} vehículo${vehicles.length !== 1 ? 's' : ''}`, margin, pageH - 3);
  doc.text('Desabollito', pageW - margin, pageH - 3, { align: 'right' });

  doc.save(`Planilla_Desabollito_${now.replace(/\//g,'-')}.pdf`);
  showToast('Planilla exportada', 'success');
}

async function openTrash() {
  openModal('trash-modal');
  const container = document.getElementById('trash-content');
  container.innerHTML = '<div class="loading-sm">Cargando...</div>';
  const items = await VehiclesModule.loadTrash();
  if (!items.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0">La papelera está vacía</p>';
    return;
  }
  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="corp-danger-btn" style="width:auto;padding:7px 16px;font-size:12px" onclick="emptyTrash()">Vaciar papelera</button>
    </div>
    ${items.map(v => {
      const date = v.deletedAt?.toDate ? v.deletedAt.toDate().toLocaleDateString('es-AR') : '';
      return `<div class="trash-item">
        <div class="trash-item-info">
          <strong>${v.modelo || 'Sin modelo'}</strong>
          <span class="trash-item-plate">${v.patente || '-'}</span>
          <span class="trash-item-date">Eliminado: ${date}</span>
        </div>
        <div class="trash-item-actions">
          <button class="trash-restore-btn" onclick="restoreFromTrash('${v.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
            Restaurar
          </button>
          <button class="trash-delete-btn" onclick="permanentDelete('${v.id}','${(v.modelo||'').replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>`;
    }).join('')}`;
}

async function emptyTrash() {
  document.getElementById('confirm-title').textContent = '¿Vaciar la papelera?';
  document.getElementById('confirm-msg').textContent   = 'Se eliminarán permanentemente todos los vehículos de la papelera.';
  document.getElementById('confirm-ok-btn').textContent     = 'Vaciar';
  document.getElementById('confirm-ok-btn').className       = 'confirm-danger';
  document.getElementById('confirm-cancel-btn').textContent = 'Cancelar';
  document.getElementById('confirm-ok-btn').onclick = async () => {
    closeModal('confirm-modal');
    showToast('Vaciando papelera...', 'info');
    const items = await VehiclesModule.loadTrash();
    await Promise.all(items.map(v => VehiclesModule.deletePermanently(v.id)));
    showToast('Papelera vaciada', 'success');
    openTrash();
  };
  document.getElementById('confirm-cancel-btn').onclick = () => closeModal('confirm-modal');
  openModal('confirm-modal');
}

async function restoreFromTrash(id) {
  await VehiclesModule.restoreVehicle(id);
  openTrash();
}

async function permanentDelete(id, name) {
  document.getElementById('confirm-title').textContent = `¿Eliminar "${name}" para siempre?`;
  document.getElementById('confirm-msg').textContent   = 'Esta acción es irreversible. No se podrá recuperar.';
  document.getElementById('confirm-ok-btn').textContent    = 'Eliminar';
  document.getElementById('confirm-ok-btn').className      = 'confirm-danger';
  document.getElementById('confirm-cancel-btn').textContent = 'Cancelar';
  document.getElementById('confirm-ok-btn').onclick = async () => {
    closeModal('confirm-modal');
    await VehiclesModule.deletePermanently(id);
    openTrash();
  };
  document.getElementById('confirm-cancel-btn').onclick = () => closeModal('confirm-modal');
  openModal('confirm-modal');
}

// Ordenamiento de planilla
let sortCol = null, sortDir = 1;
function sortSpreadsheet(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  document.querySelectorAll('.sort-icon').forEach(s => { s.textContent = '↕'; s.className = 'sort-icon'; });
  const icon = document.querySelector(`.sort-icon[data-col="${col}"]`);
  if (icon) { icon.textContent = sortDir === 1 ? '↑' : '↓'; icon.className = `sort-icon ${sortDir === 1 ? 'asc' : 'desc'}`; }

  const ESTADO_CONFIG = VehiclesModule.getEstadoConfig();
  const orden = ['peritado','turnado','reparado','finalizado'];
  const vehicles = [...VehiclesModule.getAllVehicles()].sort((a, b) => {
    let va, vb;
    if (col === 'fecha')    { va = a.estados?.peritado?.fecha || ''; vb = b.estados?.peritado?.fecha || ''; }
    else if (col === 'modelo')   { va = a.modelo||''; vb = b.modelo||''; }
    else if (col === 'patente')  { va = a.patente||''; vb = b.patente||''; }
    else if (col === 'compania') { va = a.compania||''; vb = b.compania||''; }
    else if (col === 'localidad'){ va = a.localidad||''; vb = b.localidad||''; }
    else if (col === 'precio')   { va = Number(a.precio||0); vb = Number(b.precio||0); return (va-vb)*sortDir; }
    else if (col === 'estado')   {
      const getE = v => { let u=0; orden.forEach((e,i)=>{ if(v.estados?.[e]?.fecha) u=i+1; }); return u; };
      return (getE(a)-getE(b))*sortDir;
    }
    else { va=''; vb=''; }
    return va.localeCompare(vb) * sortDir;
  });
  // Renderizar con la lista ordenada
  const tbody = document.getElementById('spreadsheet-body');
  if (tbody) VehiclesModule.renderSpreadsheetSorted(vehicles);
}

// Canvas firma táctil
function initFirma() {
  const canvas = document.getElementById('firma-canvas');
  if (!canvas) return;

  // Alta resolución: multiplicar por devicePixelRatio para evitar pixelación
  const dpr   = window.devicePixelRatio || 2;
  const dispW = canvas.offsetWidth  || 600;
  const dispH = canvas.offsetHeight || 180;
  canvas.width  = dispW * dpr;
  canvas.height = dispH * dpr;
  canvas.style.width  = dispW + 'px';
  canvas.style.height = dispH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  let drawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  canvas.onmousedown  = canvas.ontouchstart = e => {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  canvas.onmousemove  = canvas.ontouchmove  = e => {
    e.preventDefault();
    if (!drawing) return;
    const p = getPos(e);
    // Curvas suaves con quadraticCurveTo
    ctx.quadraticCurveTo(lastX, lastY, (p.x + lastX)/2, (p.y + lastY)/2);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  };
  canvas.onmouseup    = canvas.ontouchend   = () => drawing = false;
  canvas.onmouseleave = () => drawing = false;
}

function clearFirma() {
  const canvas = document.getElementById('firma-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas._signed = false;
}

function getFirmaBase64() {
  const canvas = document.getElementById('firma-canvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}

function firmaEstaFirmada() {
  const canvas = document.getElementById('firma-canvas');
  if (!canvas) return false;
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Ver si hay algún pixel no transparente
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) return true;
  }
  return false;
}

function setVehicleFilter(filter) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
  VehiclesModule.setFilter(filter);
  // Limpiar buscador para no mezclar resultados
  const search = document.getElementById('search-input');
  if (search) search.value = '';
}

function navigateTo(viewId) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(viewId);
  if (target) { target.classList.remove('hidden'); target.classList.add('view-enter'); setTimeout(()=>target.classList.remove('view-enter'),400); }
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
  const isForm = viewId === 'form-view';
  document.getElementById('back-btn')?.classList.toggle('hidden', !isForm);
  document.getElementById('header-brand')?.classList.toggle('hidden', isForm);
  document.getElementById('header-right')?.classList.toggle('hidden', isForm);
  document.body.classList.toggle('form-open', isForm);
  if (viewId === 'calendar-view') CalendarModule.render();
}

function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => m.classList.add('modal-visible'), 10);
}
function openModal2(id) { openModal(id); }

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('modal-visible');
  document.body.classList.remove('modal-open');
  setTimeout(() => m.classList.add('hidden'), 280);
}

function showToast(msg, type='info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${{success:'✓',error:'✕',warning:'⚠',info:'ℹ'}[type]||'ℹ'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(()=>t.remove(),300); }, 3000);
}

function openImageViewer(url) {
  document.getElementById('viewer-img').src = url;
  document.getElementById('viewer-counter').textContent = '';
  document.getElementById('viewer-prev').classList.add('hidden');
  document.getElementById('viewer-next').classList.add('hidden');
  openModal('image-viewer-modal');
}

function confirmDelete(id, name) {
  document.getElementById('confirm-title').textContent = `¿Eliminar "${name}"?`;
  document.getElementById('confirm-msg').textContent   = 'El vehículo será movido a la papelera.';
  document.getElementById('confirm-ok-btn').textContent    = 'Eliminar';
  document.getElementById('confirm-ok-btn').className      = 'confirm-danger';
  document.getElementById('confirm-cancel-btn').textContent = 'Cancelar';
  document.getElementById('confirm-ok-btn').onclick     = async () => { closeModal('confirm-modal'); await VehiclesModule.deleteVehicle(id); };
  document.getElementById('confirm-cancel-btn').onclick = () => closeModal('confirm-modal');
  openModal('confirm-modal');
}

function openEditVehicle(id) { BudgetModule.openEdit(id); }

function searchSpreadsheet(q) {
  document.querySelectorAll('.spreadsheet-row').forEach(row =>
    row.style.display = row.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none'
  );
}

// Chip piezas
function toggleChip(key) {
  const chip=document.getElementById('chip-'+key), input=document.getElementById('pieza-'+key);
  if (!chip||!input) return;
  input.checked = chip.classList.toggle('selected');
}
function setChip(key, value) {
  const chip=document.getElementById('chip-'+key), input=document.getElementById('pieza-'+key);
  if (!chip||!input) return;
  input.checked = value;
  chip.classList.toggle('selected', value);
}

// Theme
function initTheme() {
  const saved   = localStorage.getItem('theme');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (sysDark ? 'dark' : 'light'));
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const isDark = theme === 'dark' || theme === 'brubank';
  document.getElementById('theme-icon-dark')?.classList.toggle('hidden', !isDark);
  document.getElementById('theme-icon-light')?.classList.toggle('hidden', isDark);
  // El texto muestra el tema CONTRARIO (a dónde cambiarías)
  const themeLabel = document.getElementById('theme-label');
  if (themeLabel) themeLabel.textContent = isDark ? 'Modo oscuro' : 'Modo claro';
  const loginImg = document.getElementById('login-logo-img');
  if (loginImg) loginImg.src = isDark ? 'icon-512dark.png' : 'icon-512white.png';
  // Header logo siempre dark (visible en todos los temas)
  const headerImg = document.getElementById('header-logo-img');
  if (headerImg) headerImg.src = 'icon-512dark.png';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
initTheme();

// Easter egg: long press en theme toggle → modo Brubank
(function() {
  let pressTimer = null;
  const btn = () => document.getElementById('theme-toggle-btn');
  function startPress() {
    pressTimer = setTimeout(() => {
      const current = document.documentElement.getAttribute('data-theme');
      if (current === 'brubank') {
        applyTheme('dark');
        showToast('Modo normal 🔵', 'info');
      } else {
        applyTheme('brubank');
        showToast('Modo Brubank 💜', 'success');
      }
    }, 600);
  }
  function cancelPress() { clearTimeout(pressTimer); }
  document.addEventListener('DOMContentLoaded', () => {
    const b = btn();
    if (!b) return;
    b.addEventListener('mousedown', startPress);
    b.addEventListener('touchstart', startPress, { passive: true });
    b.addEventListener('mouseup', cancelPress);
    b.addEventListener('mouseleave', cancelPress);
    b.addEventListener('touchend', cancelPress);
  });
})();

// Sidebar
function openSidebar() { document.getElementById('app-sidebar')?.classList.add('open'); document.getElementById('sidebar-overlay')?.classList.add('active'); }
function closeSidebar() { document.getElementById('app-sidebar')?.classList.remove('open'); document.getElementById('sidebar-overlay')?.classList.remove('active'); }

// Calendar — with day list modal
const CalendarModule = (() => {
  let current = new Date();
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const ESTADO_COLORS = { peritado:'#60a5fa', turnado:'#a78bfa', reparado:'#34d399', finalizado:'#fbbf24' };
  const ESTADO_LABELS = { peritado:'Peritado', turnado:'Turnado', reparado:'Reparado', finalizado:'Finalizado' };

  function getVehicleColor(v) {
    const orden = ['peritado','turnado','reparado','finalizado'];
    let ultimo = null;
    for (const e of orden) if (v.estados && v.estados[e] && v.estados[e].completado) ultimo = e;
    return ultimo ? ESTADO_COLORS[ultimo] : '#4d94f0';
  }

  function getVehicleDateStr(v) {
    // En calendario: usar fecha de peritado (primera fecha)
    // El calendario muestra cuando se peritó, no cuando cambió de estado
    if (v.estados && v.estados.peritado && v.estados.peritado.fecha) return v.estados.peritado.fecha;
    return v.fecha || null;
  }

  function render() {
    const year=current.getFullYear(), month=current.getMonth();
    document.getElementById('cal-month-label').textContent = `${MONTHS[month]} ${year}`;
    const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
    const today=new Date();
    const vehicles=VehiclesModule.getAllVehicles();
    const eventMap={};

    vehicles.forEach(v => {
      let dateStr = getVehicleDateStr(v);
      if (!dateStr && v.createdAt) {
        const d = v.createdAt.toDate ? v.createdAt.toDate() : new Date(v.createdAt);
        dateStr = d.toISOString().split('T')[0];
      }
      if (!dateStr) return;
      const [y,m,d] = dateStr.split('-');
      if (parseInt(y)===year && parseInt(m)-1===month) {
        const day = parseInt(d);
        if (!eventMap[day]) eventMap[day]=[];
        eventMap[day].push(v);
      }
    });

    const container=document.getElementById('cal-days');
    let html='';
    const prevDays=new Date(year,month,0).getDate();
    for (let i=firstDay-1;i>=0;i--) html+=`<div class="cal-day other-month"><div class="cal-day-num">${prevDays-i}</div></div>`;

    for (let d=1;d<=daysInMonth;d++) {
      const isToday=today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d;
      const events=eventMap[d]||[];
      const hasEvents = events.length > 0;
      const firstColor = hasEvents ? getVehicleColor(events[0]) : null;

      let evHtml='';
      if (events.length === 1) {
        const v = events[0];
        const color = getVehicleColor(v);
        evHtml = `<div class="cal-event" style="background:${color}22;color:${color};border-left:2px solid ${color}">${v.patente||v.modelo||'Vehículo'}</div>`;
      } else if (events.length > 1) {
        evHtml = `<div class="cal-event-count" style="background:${firstColor}22;color:${firstColor}">${events.length} vehículos</div>`;
      }

      const clickAttr = hasEvents ? `onclick="CalendarModule.openDayList(${d},${month},${year})"` : '';
      html+=`<div class="cal-day${isToday?' today':''}${hasEvents?' cal-day-clickable':''}" ${clickAttr}><div class="cal-day-num">${d}</div>${evHtml}</div>`;
    }

    const total=firstDay+daysInMonth, remain=total%7===0?0:7-(total%7);
    for (let d=1;d<=remain;d++) html+=`<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
    container.innerHTML=html;
  }

  function openDayList(day, month, year) {
    const vehicles = VehiclesModule.getAllVehicles();
    const dayVehicles = vehicles.filter(v => {
      // Usar siempre fecha de peritado para el calendario
      let dateStr = null;
      if (v.estados && v.estados.peritado && v.estados.peritado.fecha) {
        dateStr = v.estados.peritado.fecha;
      } else if (v.createdAt) {
        const d = v.createdAt.toDate ? v.createdAt.toDate() : new Date(v.createdAt);
        dateStr = d.toISOString().split('T')[0];
      }
      if (!dateStr) return false;
      const [y,m,d] = dateStr.split('-');
      return parseInt(y)===year && parseInt(m)-1===month && parseInt(d)===day;
    });

    const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('cal-day-title').textContent = `${day} de ${MONTHS[month]} ${year}`;
    document.getElementById('cal-day-list').innerHTML = dayVehicles.map(v => {
      const color = getVehicleColor(v);
      return `<div class="cal-day-vehicle" onclick="closeModal('cal-day-modal'); openVehicleDetail('${v.id}')">
        <div class="cal-day-vehicle-dot" style="background:${color}"></div>
        <div class="cal-day-vehicle-info">
          <strong>${v.modelo||'Sin modelo'}</strong> <span class="plate-badge">${v.patente||'-'}</span>
          <div style="font-size:11px;color:var(--text-muted)">${v.asegurado||''} ${v.compania ? '· '+v.compania : ''}</div>
        </div>
        ${v.precio ? `<span style="font-size:13px;font-weight:700;color:var(--price-color)">$${Number(v.precio).toLocaleString('es-AR')}</span>` : ''}
      </div>`;
    }).join('');
    openModal('cal-day-modal');
  }

  return { render, openDayList,
    prev:()=>{current.setMonth(current.getMonth()-1);render();},
    next:()=>{current.setMonth(current.getMonth()+1);render();}
  };
})();

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  AuthModule.init();

  document.getElementById('google-login-btn')?.addEventListener('click', ()=>AuthModule.signInWithGoogle());
  document.getElementById('signout-btn')?.addEventListener('click',      ()=>AuthModule.signOut());
  document.getElementById('sidebar-signout')?.addEventListener('click',  ()=>AuthModule.signOut());
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

  document.querySelectorAll('.nav-item[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigateTo(btn.dataset.view)));
  document.querySelectorAll('.sidebar-item[data-view]').forEach(btn=>btn.addEventListener('click',()=>{navigateTo(btn.dataset.view);closeSidebar();}));
  document.getElementById('header-calendar-btn')?.addEventListener('click',()=>navigateTo('calendar-view'));

  document.getElementById('hamburger-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.getElementById('search-input')?.addEventListener('input', e=>VehiclesModule.searchVehicles(e.target.value));
  document.getElementById('spreadsheet-search')?.addEventListener('input', e=>searchSpreadsheet(e.target.value));

  document.getElementById('add-vehicle-btn')?.addEventListener('click', ()=>BudgetModule.openNew());
  document.getElementById('export-spreadsheet-pdf-btn')?.addEventListener('click', exportSpreadsheetPDF);
  document.getElementById('nav-add-btn')?.addEventListener('click', ()=>BudgetModule.openNew());

  document.getElementById('add-vehicle-btn-header')?.addEventListener('click', ()=>BudgetModule.openNew());

  document.querySelectorAll('.form-tab-btn').forEach(btn=>btn.addEventListener('click',()=>BudgetModule.switchFormTab(btn.dataset.tab)));

  document.getElementById('save-btn')?.addEventListener('click', ()=>BudgetModule.saveForm());
  document.getElementById('back-btn')?.addEventListener('click', ()=>navigateTo('home'));
  document.getElementById('delete-form-btn')?.addEventListener('click', ()=>{
    const id=BudgetModule.getEditingId(), m=document.getElementById('f-modelo')?.value||'este vehículo';
    if (id) confirmDelete(id,m);
  });

  document.getElementById('f-precio')?.addEventListener('input', function(){
    const raw = this.value.replace(/\D/g,'');
    this.value = raw ? Number(raw).toLocaleString('es-AR') : '';
  });
  document.getElementById('f-telefono')?.addEventListener('input', function(){ this.value=this.value.replace(/\D/g,''); });

  // Estado checkboxes
  ['peritado','turnado','reparado','finalizado'].forEach(e => {
    document.getElementById(`estado-check-${e}`)?.addEventListener('change', ()=>BudgetModule.updateEstadoRow(e));
  });

  ['upload-camera-input','upload-images-input'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change', async e=>{
      const files = Array.from(e.target.files);
      const vid = BudgetModule.getEditingId();
      if (!vid) { showToast('Guardá el vehículo primero','warning'); return; }
      showToast(`Subiendo ${files.length} foto${files.length!==1?'s':''}...`, 'info');

      // Portada: thumbnail de la primera foto si no hay ninguna
      try {
        const uid = AuthModule.getUserId();
        const existing = await db.collection('users').doc(uid).collection('vehicles').doc(vid).collection('images').where('type','==','image').limit(1).get();
        if (existing.empty && files.length > 0) {
          const thumb = await BudgetModule.makeThumbnail(files[0]);
          if (thumb) await VehiclesModule.updateFirstPhoto(vid, thumb);
        }
      } catch(e) { console.warn('portada error:', e); }

      // Pre-obtener Drive context UNA SOLA VEZ (evita race condition de carpetas)
      let driveCtx = null;
      try {
        const driveOk = await DrivePublicModule.isConfigured();
        if (driveOk) {
          const token    = await DrivePublicModule.getToken();
          const folderId = await DrivePublicModule.getVehicleFolder(vid, token);
          driveCtx = { token, folderId };
        }
      } catch(err) { console.warn('Drive context error:', err); }

      // Subir todas en paralelo con el mismo context
      await Promise.all(files.map(f => BudgetModule.uploadFile(f, vid, true, driveCtx)));
      BudgetModule.loadImagesTab(vid);
      showToast('Fotos subidas', 'success');
      e.target.value='';
    });
  });
  document.getElementById('upload-docs-input')?.addEventListener('change', async e=>{
    const files = Array.from(e.target.files);
    const vid = BudgetModule.getEditingId();
    await Promise.all(files.map(f => BudgetModule.uploadFile(f, vid, true)));
    BudgetModule.loadImagesTab(vid);
    e.target.value='';
  });

  document.getElementById('confirm-media-btn')?.addEventListener('click', ()=>BudgetModule.confirmMediaSave());

  document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));

  // confirm-cancel-btn se maneja en cada contexto (confirmDelete / showLoginConfirm)
  document.getElementById('close-viewer-btn')?.addEventListener('click',   ()=>closeModal('image-viewer-modal'));


  document.getElementById('tel-modal-close')?.addEventListener('click', ()=>closeModal('tel-modal'));

  document.getElementById('cal-prev')?.addEventListener('click', ()=>CalendarModule.prev());
  document.getElementById('cal-next')?.addEventListener('click', ()=>CalendarModule.next());

  document.getElementById('user-menu-toggle')?.addEventListener('click', ()=>document.getElementById('user-menu-dropdown')?.classList.toggle('hidden'));
  document.addEventListener('click', e=>{
    const m=document.getElementById('user-menu-dropdown'), t=document.getElementById('user-menu-toggle');
    if (m&&t&&!t.contains(e.target)&&!m.contains(e.target)) m.classList.add('hidden');
  });

  document.getElementById('seal-save-btn')?.addEventListener('click', async ()=>{
    const text=document.getElementById('seal-text-input').value.trim();
    const imgEl=document.getElementById('seal-img-preview');
    await SealModule.save(text, imgEl.src&&!imgEl.classList.contains('hidden')?imgEl.src:'');
    closeModal('seal-modal');
  });
  document.getElementById('seal-img-input')?.addEventListener('change', e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      const img=document.getElementById('seal-img-preview');
      img.src=ev.target.result;
      img.classList.remove('hidden');
      const delBtn = document.getElementById('seal-img-delete-btn');
      if (delBtn) delBtn.style.display = 'flex';
    };
    r.readAsDataURL(f);
  });

  window.deleteSealImage = function() {
    const img = document.getElementById('seal-img-preview');
    img.src = '';
    img.classList.add('hidden');
    const delBtn = document.getElementById('seal-img-delete-btn');
    if (delBtn) delBtn.style.display = 'none';
    document.getElementById('seal-img-input').value = '';
  };
  document.getElementById('open-corp-btn')?.addEventListener('click', () => {
    document.getElementById('user-menu-dropdown')?.classList.add('hidden');
    openCorp();
  });
  document.getElementById('open-trash-btn')?.addEventListener('click', () => {
    document.getElementById('user-menu-dropdown')?.classList.add('hidden');
    openTrash();
  });
  document.getElementById('open-seal-btn')?.addEventListener('click', ()=>SealModule.openModal());

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW:',e));

  navigateTo('home');
});
