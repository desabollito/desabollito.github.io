// PDF Export Module
const PDFModule = (() => {

  const PIEZAS_ORDER  = ['capot','techo','baul','gf_izq','pd_izq','pt_izq','gt_izq','gf_der','pd_der','pt_der','gt_der','parante_izq','parante_der'];
  const PIEZAS_LABELS = {
    capot:'Capot', techo:'Techo', baul:'Baúl',
    gf_izq:'Guardab. Del. Izq.', pd_izq:'Puerta Del. Izq.', pt_izq:'Puerta Tras. Izq.', gt_izq:'Guardab. Tras. Izq.',
    gf_der:'Guardab. Del. Der.', pd_der:'Puerta Del. Der.', pt_der:'Puerta Tras. Der.', gt_der:'Guardab. Tras. Der.',
    parante_izq:'Parante Izquierdo', parante_der:'Parante Derecho'
  };
  const ESTADOS_ORDER  = ['peritado','turnado','reparado','finalizado'];
  const ESTADOS_LABELS = { peritado:'Peritado', turnado:'Turnado', reparado:'Reparado', finalizado:'Finalizado' };

  async function buildDoc(vehicleId) {
    const v = VehiclesModule.getVehicle(vehicleId);
    if (!v) return null;

    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const margin = 18;
    let y = 0;

    const seal = SealModule.get();

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.setFillColor(10, 25, 47);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text('PRESUPUESTO DE GRANIZO', margin, 15);
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.setTextColor(180,200,230);
    const fechaStr = v.fecha ? v.fecha.split('-').reverse().join('/') : formatDatePDF(v.createdAt);
    doc.text(`Fecha: ${fechaStr}`, margin, 22);

    // Sello/firma en la esquina superior derecha (respetando proporción)
    if (seal && (seal.imageBase64 || seal.text)) {
      let textStartY = 12;
      if (seal.imageBase64) {
        try {
          const props = doc.getImageProperties(seal.imageBase64);
          const maxW = 40, maxH = 18;
          let w = maxW, h = (props.height / props.width) * maxW;
          if (h > maxH) { h = maxH; w = (props.width / props.height) * maxH; }
          const ix = pageW - margin - w;
          doc.addImage(seal.imageBase64, props.fileType || 'PNG', ix, 5, w, h, undefined, 'MEDIUM');
          textStartY = 5 + h + 4; // texto debajo de la imagen
        } catch(e){ console.warn('sello img', e); }
      }
      if (seal.text) {
        const rx = pageW - margin - 46;
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(180,200,230);
        const lines = doc.splitTextToSize(seal.text, 44);
        lines.forEach((l,i) => doc.text(l, rx, textStartY + i*4.2));
      }
    }

    y = 50;

    const estados = v.estados || {};
    const peritado = estados.peritado?.completado ? estados.peritado : null;
    const reparado = estados.reparado?.completado ? estados.reparado : null;
    const hayEstados = peritado || reparado;

    // ── DATOS ────────────────────────────────────────────────────────────────
    const datosH = hayEstados ? 70 : 54; // más alto si hay estados
    doc.setFillColor(245,248,255);
    doc.roundedRect(margin, y, pageW-margin*2, datosH, 3, 3, 'F');
    doc.setDrawColor(200,215,240);
    doc.roundedRect(margin, y, pageW-margin*2, datosH, 3, 3, 'S');
    doc.setTextColor(10,25,47); doc.setFontSize(14); doc.setFont('helvetica','bold');
    doc.text(v.modelo||'Sin modelo', margin+5, y+11);
    // Patente al lado del modelo
    if (v.patente) {
      const modelW = doc.getTextWidth(v.modelo||'Sin modelo');
      const px = margin + 5 + modelW + 6;
      doc.setFillColor(26,115,232);
      const pw = doc.getTextWidth(v.patente) + 8;
      doc.roundedRect(px, y+3.5, pw, 9, 2, 2, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
      doc.text(v.patente, px + pw/2, y+9.8, {align:'center'});
    }
    let fy0 = y + 22;
    const colW = (pageW-margin*2-10)/2;
    const fields = [['Asegurado',v.asegurado],['Teléfono',v.telefono],['Compañía',v.compania],['Localidad',v.localidad]];
    fields.forEach((f,i) => {
      const col=i%2, row=Math.floor(i/2);
      const fx=margin+5+col*(colW+5), fy=fy0+row*13;
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,120,160);
      doc.text(f[0].toUpperCase(), fx, fy);
      doc.setFontSize(9.5); doc.setFont('helvetica','bold'); doc.setTextColor(20,40,80);
      doc.text(f[1]||'-', fx, fy+5.5);
    });

    // Peritado debajo de Compañía, Reparado debajo de Localidad (misma grilla, sin contorno)
    if (hayEstados) {
      const estadoRow = [
        peritado ? ['Peritado', peritado.fecha] : ['Peritado','-'],
        reparado ? ['Reparado', reparado.fecha] : ['Reparado','-'],
      ];
      const fy = fy0 + 2*13;
      estadoRow.forEach((e, i) => {
        const fx = margin+5+i*(colW+5);
        doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,120,160);
        doc.text(e[0].toUpperCase(), fx, fy);
        doc.setFontSize(9.5); doc.setFont('helvetica','bold'); doc.setTextColor(20,40,80);
        const val = e[1] && e[1] !== '-' ? e[1].split('-').reverse().join('/') : '-';
        doc.text(val, fx, fy+5.5);
      });
    }

    y += datosH + 6;

    // ── PIEZAS ───────────────────────────────────────────────────────────────
    if (v.piezas && Object.values(v.piezas).some(Boolean)) {
      doc.setFillColor(26,115,232); doc.rect(margin,y,pageW-margin*2,8,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
      doc.text('PIEZAS AFECTADAS', margin+4, y+5.5);
      y += 11;

      const rowW  = pageW - margin*2;
      const gap   = 3;
      const chipH = 7;

      // Filas con layout específico
      const filas = [
        // Fila 1: 3 piezas que ocupan todo el ancho (como 3 chips de 4-col)
        ['capot','techo','baul'],
        // Filas 2 y 3: 4 por fila
        ['gf_izq','pd_izq','pt_izq','gt_izq'],
        ['gf_der','pd_der','pt_der','gt_der'],
        // Fila 4: 2 que ocupan como 4
        ['parante_izq','parante_der'],
      ];

      const chipW4 = (rowW - gap * 3) / 4; // ancho exacto de 1 columna de 4

      filas.forEach(fila => {
        const activas = fila.filter(k => v.piezas && v.piezas[k]);
        if (!activas.length) return;

        if (fila === filas[0]) {
          // Fila 1: 3 piezas llenando todo el ancho
          const w = (rowW - gap * 2) / 3;
          activas.forEach((k, i) => {
            const x = margin + i * (w + gap);
            doc.setFillColor(230,238,255); doc.roundedRect(x, y, w, chipH, 2, 2, 'F');
            doc.setTextColor(26,115,232); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text(PIEZAS_LABELS[k]||k, x + w/2, y + 4.8, {align:'center'});
          });
        } else if (fila === filas[3]) {
          // Fila 4: 2 parantes, cada uno ocupa exactamente 2 columnas de 4
          const w = chipW4 * 2 + gap;
          activas.forEach((k, i) => {
            const x = margin + i * (w + gap);
            doc.setFillColor(230,238,255); doc.roundedRect(x, y, w, chipH, 2, 2, 'F');
            doc.setTextColor(26,115,232); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text(PIEZAS_LABELS[k]||k, x + w/2, y + 4.8, {align:'center'});
          });
        } else {
          // Filas 2 y 3: 4 columnas iguales
          activas.forEach((k, i) => {
            const x = margin + i * (chipW4 + gap);
            doc.setFillColor(230,238,255); doc.roundedRect(x, y, chipW4, chipH, 2, 2, 'F');
            doc.setTextColor(26,115,232); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text(PIEZAS_LABELS[k]||k, x + chipW4/2, y + 4.8, {align:'center'});
          });
        }
        y += chipH + gap;
      });
      y += 4;
    }

    // Observaciones y Repuestos en dos columnas
    if (v.observaciones || v.repuestos) {
      const colWidth = (pageW - margin*2 - 6) / 2;
      const startY = y;
      let maxEndY = y;

      if (v.observaciones) {
        const x = margin;
        doc.setFillColor(26,115,232); doc.rect(x, startY, colWidth, 8, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
        doc.text('OBSERVACIONES', x+4, startY+5.5);
        doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(30,50,90);
        const lines = doc.splitTextToSize(v.observaciones, colWidth-8);
        doc.text(lines, x+4, startY+13);
        maxEndY = Math.max(maxEndY, startY+13+lines.length*5);
      }
      if (v.repuestos) {
        const x = margin + colWidth + 6;
        doc.setFillColor(26,115,232); doc.rect(x, startY, colWidth, 8, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
        doc.text('REPUESTOS', x+4, startY+5.5);
        doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(30,50,90);
        const lines = doc.splitTextToSize(v.repuestos, colWidth-8);
        doc.text(lines, x+4, startY+13);
        maxEndY = Math.max(maxEndY, startY+13+lines.length*5);
      }
      y = maxEndY + 8;
    }

    if (v.precio) {
      y += 4;
      doc.setFillColor(10,25,47); doc.roundedRect(margin,y,pageW-margin*2,18,3,3,'F');
      doc.setTextColor(150,190,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
      doc.text('TOTAL PRESUPUESTO', margin+5, y+7);
      doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
      doc.text(`$${Number(v.precio).toLocaleString('es-AR')}`, pageW-margin-5, y+12, {align:'right'});
      y += 24;
    }


    // ── FOOTER ───────────────────────────────────────────────────────────────
    const pages = doc.internal.getNumberOfPages();
    for (let i=1;i<=pages;i++) {
      doc.setPage(i);
      doc.setFillColor(10,25,47); doc.rect(0,287,pageW,10,'F');
      doc.setTextColor(120,150,200); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('Presupuesto de Granizo', margin, 293);
      doc.text(`Página ${i} / ${pages}`, pageW-margin, 293, {align:'right'});
    }

    return doc;
  }

  async function generatePDF(vehicleId, silent) {
    if (!silent) showToast('Generando PDF...','info');
    try {
      const v   = VehiclesModule.getVehicle(vehicleId);
      const doc = await buildDoc(vehicleId);
      if (!doc) { showToast('Error al generar PDF','error'); return null; }
      if (silent) return doc; // devolver para compartir
      const filename = `Presupuesto_${(v?.patente||v?.modelo||'vehiculo').replace(/\s/g,'_')}.pdf`;
      doc.save(filename);
      showToast('PDF descargado ✓','success');
      return doc;
    } catch(err) { console.error(err); showToast('Error al generar PDF','error'); return null; }
  }

  async function generatePDFBase64(vehicleId) {
    try { const doc = await buildDoc(vehicleId); return doc ? doc.output('datauristring') : null; }
    catch(err) { console.error(err); return null; }
  }

  async function generatePDFBlob(vehicleId) {
    const doc = await buildDoc(vehicleId);
    if (!doc) throw new Error('No se pudo generar el PDF');
    return doc.output('blob');
  }

  function addSection(doc, title, text, y, margin, pageW) {
    doc.setFillColor(26,115,232); doc.rect(margin,y,pageW-margin*2,8,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(title, margin+4, y+5.5);
    y += 12;
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(30,50,90);
    const lines = doc.splitTextToSize(text, pageW-margin*2-8);
    doc.text(lines, margin+4, y);
    return y+lines.length*5+8;
  }

  function formatDatePDF(ts) {
    if (!ts) return new Date().toLocaleDateString('es-AR');
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  async function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function fetchDrivePhotos(vehicleId) {
    try {
      const token    = await DrivePublicModule.getToken();
      const folderId = await DrivePublicModule.getVehicleFolder(vehicleId, token);

      const res  = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&orderBy=createdTime&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data  = await res.json();
      const files = (data.files || []).filter(f => f.mimeType && f.mimeType.startsWith('image/')).slice(0, 12);

      if (!files.length) return [];

      const images = [];
      for (const f of files) {
        try {
          const imgRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!imgRes.ok) continue;
          const blob = await imgRes.blob();
          const result = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width  = img.width;
              canvas.height = img.height;
              canvas.getContext('2d').drawImage(img, 0, 0);
              resolve({ data: canvas.toDataURL('image/jpeg', 0.85), w: img.width, h: img.height });
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
          });
          images.push(result);
        } catch(e) { console.warn('Error procesando foto:', f.id, e); }
      }
      return images;
    } catch(e) {
      console.warn('fetchDrivePhotos error:', e);
      return [];
    }
  }

  async function generatePDFWithPhotos(vehicleId, silent) {
    if (!silent) showToast('Generando PDF...', 'info');
    try {
      const doc = await buildDoc(vehicleId);
      if (!doc) { showToast('Error al generar PDF', 'error'); return null; }

      // Obtener fotos de Drive
      const images = await fetchDrivePhotos(vehicleId);

      // Obtener firma guardada en Firestore
      let firmaImg = null;
      try {
        const uid      = AuthModule.getUserId();
        const firmaSnap = await db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).collection('images').where('type','==','firma').limit(1).get();
        if (!firmaSnap.empty) firmaImg = firmaSnap.docs[0].data().data;
      } catch(e) { console.warn('No se pudo cargar la firma:', e); }

      if (images.length > 0 || firmaImg) {
        const pageW  = doc.internal.pageSize.getWidth();
        const pageH  = doc.internal.pageSize.getHeight();
        const margin = 14;
        const gap    = 6;

        doc.addPage();

        // Header
        doc.setFillColor(10, 25, 47);
        doc.rect(0, 0, pageW, 16, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text('REGISTRO FOTOGRÁFICO', margin, 11);
        const v = VehiclesModule.getVehicle(vehicleId);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 180, 220);
        doc.text(`${v?.modelo || ''} ${v?.patente ? '· ' + v.patente : ''}`, pageW - margin, 11, { align: 'right' });

        let currentY = 22;

        // FIRMA PRIMERO
        if (firmaImg) {
          const firmaMaxW = 60;
          const firmaMaxH = 18;
          const firmaX    = margin + (pageW - margin*2 - firmaMaxW) / 2;
          doc.setTextColor(26,115,232); doc.setFontSize(8); doc.setFont('helvetica','bold');
          doc.text('FIRMA DEL CLIENTE', margin, currentY + 5);
          doc.setFillColor(255,255,255);
          doc.roundedRect(firmaX - 4, currentY + 8, firmaMaxW + 8, firmaMaxH + 8, 3, 3, 'F');
          doc.setDrawColor(200,215,240); doc.setLineWidth(0.3);
          doc.roundedRect(firmaX - 4, currentY + 8, firmaMaxW + 8, firmaMaxH + 8, 3, 3, 'S');
          try { doc.addImage(firmaImg, 'PNG', firmaX, currentY + 12, firmaMaxW, firmaMaxH, 'firma', 'NONE'); }
          catch(e) { console.warn('Error firma:', e); }
          currentY += firmaMaxH + 24;
          doc.setDrawColor(200,215,240); doc.setLineWidth(0.3);
          doc.line(margin, currentY, pageW - margin, currentY);
          currentY += 8;
        }

        // FOTOS — 4 columnas iguales, gap mínimo, centradas
        if (images.length > 0) {
          const cols  = 4;
          const gapF  = 2;
          const cellW = (pageW - margin * 2 - gapF * (cols - 1)) / cols;
          const cellH = cellW * 0.9;

          let row = [];
          for (let i = 0; i <= images.length; i++) {
            if (i < images.length) row.push(images[i]);
            if (row.length === cols || (i === images.length && row.length > 0)) {
              if (currentY + cellH > pageH - margin) {
                doc.addPage();
                doc.setFillColor(10, 25, 47);
                doc.rect(0, 0, pageW, 10, 'F');
                currentY = 14;
              }
              // Centrar la fila si tiene menos de 4 imágenes
              const rowWidth = row.length * cellW + (row.length - 1) * gapF;
              const rowStartX = margin + ((pageW - margin*2) - rowWidth) / 2;
              row.forEach((img, c) => {
                const cellX = rowStartX + c * (cellW + gapF);
                try {
                  // Respetar proporción dentro de la celda (contain), centrada
                  const ratio = img.w / img.h;
                  let dw = cellW, dh = cellW / ratio;
                  if (dh > cellH) { dh = cellH; dw = cellH * ratio; }
                  const dx = cellX + (cellW - dw) / 2;
                  const dy = currentY + (cellH - dh) / 2;
                  doc.addImage(img.data, 'JPEG', dx, dy, dw, dh, `img_${i}_${c}`, 'FAST');
                } catch(e) { console.warn('Error imagen:', e); }
              });
              currentY += cellH + gapF;
              row = [];
            }
          }
        }
      }

      // Footer en todas las páginas
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const pw = doc.internal.pageSize.getWidth();
        doc.setFillColor(10, 25, 47);
        doc.rect(0, 287, pw, 10, 'F');
        doc.setTextColor(120, 150, 200);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Presupuesto de Granizo', 14, 293);
        doc.text(`Página ${p} / ${totalPages}`, pw - 14, 293, { align: 'right' });
      }

      return doc;
    } catch(err) {
      console.error('generatePDFWithPhotos error:', err);
      showToast('Error al generar PDF con fotos', 'error');
      return null;
    }
  }

  async function generatePDFWithPhotosBlob(vehicleId) {
    const doc = await generatePDFWithPhotos(vehicleId);
    if (!doc) throw new Error('No se pudo generar el PDF');
    return doc.output('blob');
  }

  return { generatePDF, generatePDFBase64, generatePDFBlob, generatePDFWithPhotos, generatePDFWithPhotosBlob };
})();
