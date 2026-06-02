// Share Module — pregunta con/sin fotos, luego mail/whatsapp/guardar
const ShareModule = (() => {

  let _pendingVehicleId = null;
  let _withPhotos = true;

  function openShareMenu(vehicleId) {
    _pendingVehicleId = vehicleId;
    _withPhotos = true;
    // Mostrar primero el paso de elección con/sin fotos
    showPhotoChoice();
    openModal('share-menu-modal');
  }

  function showPhotoChoice() {
    const opts = document.getElementById('share-options');
    if (!opts) return;
    opts.innerHTML = `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;text-align:center">¿Cómo querés compartir el presupuesto?</p>
      <button class="share-option-btn photos" onclick="ShareModule.choosePhotos(true)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Con fotos
      </button>
      <button class="share-option-btn save" onclick="ShareModule.choosePhotos(false)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Sin fotos
      </button>
    `;
  }

  function showShareOptions() {
    const opts = document.getElementById('share-options');
    if (!opts) return;
    opts.innerHTML = `
      <button class="share-option-btn mail" onclick="ShareModule.doShare('mail')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Enviar por Mail</button>
      <button class="share-option-btn wa" onclick="ShareModule.doShare('whatsapp')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>Enviar por WhatsApp</button>
      <button class="share-option-btn save" onclick="ShareModule.doShare('save')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Guardar en el dispositivo</button>
    `;
  }

  function choosePhotos(withPhotos) {
    _withPhotos = withPhotos;
    showShareOptions();
  }

  async function doShare(method) {
    closeModal('share-menu-modal');
    const id = _pendingVehicleId;
    if (!id) return;

    showToast('Generando PDF...', 'info');

    try {
      // Con o sin fotos según la elección
      const doc = _withPhotos
        ? await PDFModule.generatePDFWithPhotos(id, true)
        : await PDFModule.generatePDF(id, true);
      if (!doc) { showToast('Error al generar PDF', 'error'); return; }

      const pdfBlob  = doc.output('blob');
      const v        = VehiclesModule.getVehicle(id);
      const filename = `Presupuesto_${(v?.patente || v?.modelo || 'vehiculo').replace(/\s/g,'_')}.pdf`;
      const subject  = `Presupuesto de Granizo${v?.modelo ? ' - ' + v.modelo : ''}${v?.patente ? ' ' + v.patente : ''}`;
      const bodyText = buildText(v);
      const file     = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (method === 'save') {
        const url = URL.createObjectURL(pdfBlob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast('PDF descargado', 'success');
        return;
      }

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: subject, text: bodyText, files: [file] });
          return;
        } catch(e) {
          if (e.name === 'AbortError') return;
          console.warn('Share API falló, usando fallback:', e);
        }
      }

      const url = URL.createObjectURL(pdfBlob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);

      if (method === 'mail') {
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText + '\n\n(Adjuntá el PDF que se acaba de descargar)')}`;
      } else if (method === 'whatsapp') {
        const phone = (v?.telefono || '').replace(/\D/g,'');
        const enc   = encodeURIComponent(bodyText + '\n\n(Adjuntá el PDF que se acaba de descargar)');
        window.open(phone ? `https://wa.me/${phone}?text=${enc}` : `https://wa.me/?text=${enc}`, '_blank');
      }
      showToast('PDF descargado — adjuntalo al mensaje', 'info');

    } catch(err) {
      console.error(err);
      showToast('Error al compartir', 'error');
    }
  }

  function buildText(v) {
    if (!v) return '';
    let t = `*PRESUPUESTO DE GRANIZO*\n`;
    if (v.modelo)    t += `Vehículo: ${v.modelo}\n`;
    if (v.patente)   t += `Patente: ${v.patente}\n`;
    if (v.precio)    t += `Total: $${Number(v.precio).toLocaleString('es-AR')}\n`;
    return t;
  }

  return { openShareMenu, doShare, choosePhotos };
})();
