import { PIEZAS, PIEZA, VIDRIOS, ESTADO, estadoActual, piezasMarcadas } from "./domain.js";
import { paraPDF, blobADataURL } from "./media.js";
import { fechaCorta, money } from "./ui.js";

const INK = [14, 27, 44], AZUL = [43, 92, 230], GRIS = [104, 118, 138], LINEA = [218, 224, 232], SUAVE = [244, 246, 249];

const fecha = iso => iso ? iso.split("-").reverse().join("/") : "-";

function nuevoDoc(orientation = "portrait") {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

async function cargarImagen(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("No se pudo descargar " + url);
  const data = await blobADataURL(await res.blob());
  const dims = await new Promise((ok, ko) => {
    const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = ko; i.src = data;
  });
  return { data, ...dims };
}

function encabezado(doc, empresa, subtitulo) {
  const W = doc.internal.pageSize.getWidth(), M = 16;
  doc.setFillColor(...INK); doc.rect(0, 0, W, 34, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(empresa?.name || "Desabollito", M, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(175, 192, 215);
  doc.text(subtitulo, M, 22);

  const sello = empresa?.seal || {};
  let ty = 10;
  if (sello.logo) {
    try {
      const p = doc.getImageProperties(sello.logo);
      let w = 36, h = p.height / p.width * w;
      if (h > 14) { h = 14; w = p.width / p.height * h; }
      doc.addImage(sello.logo, p.fileType || "PNG", W - M - w, 5, w, h, undefined, "FAST");
      ty = 5 + h + 4;
    } catch (e) { console.warn("logo del sello", e); }
  }
  if (sello.texto) {
    doc.setFontSize(7.5); doc.setTextColor(175, 192, 215);
    const lineas = doc.splitTextToSize(sello.texto, 62).slice(0, Math.max(1, Math.floor((32 - ty) / 3.6) + 1));
    lineas.forEach((l, i) => doc.text(l, W - M, ty + i * 3.6, { align: "right" }));
  }
}

function pie(doc, texto) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(16, H - 12, W - 16, H - 12);
    doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal");
    doc.text(texto, 16, H - 7);
    doc.text(`Página ${i} de ${n}`, W - 16, H - 7, { align: "right" });
  }
}

function patente(doc, txt, xDer, y) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  const w = doc.getTextWidth(txt) + 12, x = xDer - w;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...INK); doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, 11, 1.6, 1.6, "FD");
  doc.setFillColor(...AZUL); doc.rect(x + 0.25, y + 0.25, w - 0.5, 2.4, "F");
  doc.setTextColor(...INK); doc.text(txt, x + w / 2, y + 8.9, { align: "center" });
}

function mapaPiezas(doc, piezas, x, y, alto) {
  const k = alto / 400;
  const R = (p, estilo) => doc.roundedRect(x + p.x * k, y + p.y * k, p.w * k, p.h * k, p.r * k, p.r * k, estilo);
  doc.setFillColor(...SUAVE); doc.setDrawColor(...LINEA); doc.setLineWidth(0.4);
  doc.roundedRect(x + 20 * k, y + 8 * k, 160 * k, 384 * k, 34 * k, 34 * k, "FD");
  doc.setFillColor(226, 232, 240);
  VIDRIOS.forEach(v => R(v, "F"));
  PIEZAS.forEach(p => {
    if (piezas[p.key]) { doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); }
    else { doc.setFillColor(255, 255, 255); doc.setDrawColor(200, 208, 220); }
    doc.setLineWidth(0.3); R(p, "FD");
  });
  doc.setFontSize(6); doc.setTextColor(...GRIS);
  doc.text("FRENTE", x + 100 * k, y + 5 * k - 1, { align: "center" });
}

function titulo(doc, txt, x, y, w) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
  doc.text(txt, x, y);
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.6); doc.line(x, y + 1.8, x + w, y + 1.8);
}

export async function presupuestoPDF(v, empresa, { conFotos = false, onProgreso } = {}) {
  const doc = nuevoDoc();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16, CW = W - M * 2;
  encabezado(doc, empresa, `Presupuesto de reparación de granizo · ${fecha(v.fechas?.peritado)}`);

  // Vehículo
  let y = 48;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(doc.splitTextToSize(v.modelo || "Vehículo", CW - 50)[0], M, y);
  if (v.patente) patente(doc, v.patente, W - M, y - 8);

  // Datos en dos columnas
  y += 10;
  const datos = [
    ["Asegurado", v.asegurado], ["Teléfono", v.telefono],
    ["Compañía de seguro", v.compania], ["Localidad", v.localidad],
    ["Fecha de peritaje", fecha(v.fechas?.peritado)], ["Estado", ESTADO[estadoActual(v)].label]
  ];
  if (v.fechas?.reparado) datos.push(["Fecha de reparación", fecha(v.fechas.reparado)]);
  if (v.grado) datos.push(["Grado de daño", `Grado ${v.grado}`]);
  const colW = CW / 2;
  datos.forEach(([l, val], i) => {
    const cx = M + (i % 2) * colW, cy = y + Math.floor(i / 2) * 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(l, cx, cy);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(val || "-"), colW - 6)[0], cx, cy + 5);
  });
  y += Math.ceil(datos.length / 2) * 12 + 4;

  // Piezas: mapa + lista
  const marcadas = piezasMarcadas(v);
  if (marcadas.length) {
    titulo(doc, "Paños afectados", M, y, CW); y += 7;
    const altoMapa = 74;
    mapaPiezas(doc, v.piezas, M, y, altoMapa);
    const lx = M + altoMapa / 2 + 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    const col2 = marcadas.length > 7;
    marcadas.forEach((k, i) => {
      const cx = lx + (col2 && i >= Math.ceil(marcadas.length / 2) ? 62 : 0);
      const cy = y + 5 + (col2 ? i % Math.ceil(marcadas.length / 2) : i) * 7;
      doc.setFillColor(...AZUL); doc.circle(cx, cy - 1.2, 1.1, "F");
      doc.text(PIEZA[k].label, cx + 4, cy);
    });
    doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(`${marcadas.length} ${marcadas.length === 1 ? "paño" : "paños"}`, lx, y + altoMapa - 2);
    y += altoMapa + 8;
  }

  // Observaciones y repuestos
  const bloques = [["Observaciones", v.observaciones], ["Repuestos", v.repuestos]].filter(b => b[1]);
  if (bloques.length) {
    const bw = bloques.length === 2 ? (CW - 8) / 2 : CW;
    let maxY = y;
    bloques.forEach(([t, txt], i) => {
      const bx = M + i * (bw + 8);
      titulo(doc, t, bx, y, bw);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 52, 70);
      const lineas = doc.splitTextToSize(txt, bw);
      doc.text(lineas, bx, y + 8);
      maxY = Math.max(maxY, y + 8 + lineas.length * 4.6);
    });
    y = maxY + 6;
  }

  // Total
  if (v.precio) {
    if (y + 24 > H - 16) { doc.addPage(); y = 24; }
    doc.setFillColor(...INK); doc.roundedRect(M, y, CW, 20, 2.5, 2.5, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(175, 192, 215);
    doc.text("Total del presupuesto", M + 6, y + 12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
    doc.text(money(v.precio), W - M - 6, y + 13.2, { align: "right" });
    y += 26;
  }

  // Firma del cliente
  if (v.firma) {
    if (y + 42 > H - 16) { doc.addPage(); y = 24; }
    titulo(doc, "Conformidad del cliente", M, y, CW); y += 5;
    try { doc.addImage(v.firma, "PNG", M, y, 70, 26); } catch (e) { console.warn(e); }
    doc.setDrawColor(...LINEA); doc.line(M, y + 28, M + 70, y + 28);
    doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(v.asegurado ? `Firma de ${v.asegurado}` : "Firma", M, y + 32);
    y += 38;
  }

  // Fotos
  const fotos = conFotos ? (v.fotos || []) : [];
  if (fotos.length) {
    const imgs = [];
    for (let i = 0; i < fotos.length; i++) {
      onProgreso?.(`Descargando fotos ${i + 1}/${fotos.length}`);
      try { imgs.push(await cargarImagen(paraPDF(fotos[i].url))); } catch (e) { console.warn(e); }
    }
    if (imgs.length) {
      doc.addPage();
      encabezado(doc, empresa, `Registro fotográfico · ${v.modelo || ""} ${v.patente || ""}`);
      const cols = 3, gap = 4, cw = (CW - gap * (cols - 1)) / cols, ch = cw * 0.75;
      let fy = 44, c = 0;
      for (const im of imgs) {
        if (fy + ch > H - 16) { doc.addPage(); fy = 20; c = 0; }
        const cx = M + c * (cw + gap);
        doc.setFillColor(...SUAVE); doc.roundedRect(cx, fy, cw, ch, 1.5, 1.5, "F");
        let w = cw, h = im.h / im.w * cw;
        if (h > ch) { h = ch; w = im.w / im.h * ch; }
        try { doc.addImage(im.data, "JPEG", cx + (cw - w) / 2, fy + (ch - h) / 2, w, h, undefined, "FAST"); }
        catch (e) { console.warn("foto no compatible", e); }
        if (++c === cols) { c = 0; fy += ch + gap; }
      }
    }
  }

  pie(doc, `${empresa?.name || "Desabollito"} · generado el ${new Date().toLocaleDateString("es-AR")}`);
  return doc;
}

export function planillaPDF(lista, empresa, filtroTexto = "") {
  const doc = nuevoDoc("landscape");
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  encabezado(doc, empresa, `Planilla de vehículos${filtroTexto ? " · " + filtroTexto : ""} · ${new Date().toLocaleDateString("es-AR")}`);
  const cols = [
    ["Fecha", 20, v => fechaCorta(v.fechas?.peritado)],
    ["Modelo", 52, v => v.modelo], ["Patente", 24, v => v.patente],
    ["Asegurado", 44, v => v.asegurado], ["Compañía", 36, v => v.compania],
    ["Localidad", 34, v => v.localidad], ["Estado", 22, v => ESTADO[estadoActual(v)].label],
    ["Precio", 27, v => money(v.precio)]
  ];
  const tw = cols.reduce((s, c) => s + c[1], 0), x0 = (W - tw) / 2, rh = 7.5;
  let y = 42;
  const cabecera = () => {
    doc.setFillColor(...AZUL); doc.rect(x0, y, tw, rh, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    let x = x0; cols.forEach(([t, w], i) => { doc.text(t, i === cols.length - 1 ? x + w - 2 : x + 2, y + 5, { align: i === cols.length - 1 ? "right" : "left" }); x += w; });
    y += rh;
  };
  cabecera();
  let total = 0;
  lista.forEach((v, n) => {
    if (y + rh > H - 18) { doc.addPage(); y = 16; cabecera(); }
    if (n % 2 === 0) { doc.setFillColor(...SUAVE); doc.rect(x0, y, tw, rh, "F"); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...INK);
    let x = x0;
    cols.forEach(([, w, f], i) => {
      const t = doc.splitTextToSize(String(f(v) || "-"), w - 4)[0] || "";
      doc.text(t, i === cols.length - 1 ? x + w - 2 : x + 2, y + 5, { align: i === cols.length - 1 ? "right" : "left" });
      x += w;
    });
    if (estadoActual(v) !== "anulado") total += Number(v.precio || 0);
    y += rh;
  });
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(`${lista.length} vehículos`, x0, y + 4);
  doc.text(`Total ${money(total) || "$0"}`, x0 + tw - 2, y + 4, { align: "right" });
  pie(doc, `${empresa?.name || "Desabollito"} · planilla`);
  return doc;
}

export function gastosPDF(lista, empresa, periodo, CAT) {
  const doc = nuevoDoc();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16, CW = W - M * 2;
  const usd = g => g.moneda === "USD";
  const txt = g => usd(g) ? "US$ " + Number(g.monto || 0).toLocaleString("es-AR") : money(g.monto) || "$0";
  encabezado(doc, empresa, `Rendición de gastos · ${periodo}`);
  const total = lista.filter(g => !usd(g)).reduce((s, g) => s + Number(g.monto || 0), 0);
  const totalUSD = lista.filter(usd).reduce((s, g) => s + Number(g.monto || 0), 0);
  let y = 46;
  const alto = totalUSD ? 24 : 18;
  doc.setFillColor(...INK); doc.roundedRect(M, y, CW, alto, 2.5, 2.5, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(175, 192, 215);
  doc.text(`Total de ${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}`, M + 6, y + 11);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text(money(total) || "$0", W - M - 6, y + 12, { align: "right" });
  if (totalUSD) {
    doc.setFontSize(11); doc.setTextColor(175, 192, 215);
    doc.text(`+ US$ ${totalUSD.toLocaleString("es-AR")}`, W - M - 6, y + 19, { align: "right" });
  }
  y += alto + 8;
  const porCat = {};
  lista.filter(g => !usd(g)).forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.monto || 0); });
  if (Object.keys(porCat).length) {
    titulo(doc, "Por categoría (pesos)", M, y, CW); y += 8;
    doc.setFontSize(9.5);
    Object.entries(porCat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
      doc.text(CAT[k]?.label || "Otros", M, y);
      doc.setFont("helvetica", "bold"); doc.text(money(v), W - M, y, { align: "right" });
      doc.setDrawColor(...LINEA); doc.line(M, y + 2, W - M, y + 2);
      y += 7;
    });
    y += 6;
  }
  titulo(doc, "Detalle", M, y, CW); y += 6;
  const cols = [["Fecha", 18], ["Concepto", 54], ["Categoría", 26], ["Método", 26], ["Técnico", 28], ["Monto", 26]];
  const rh = 7;
  const cab = () => {
    doc.setFillColor(...AZUL); doc.rect(M, y, CW, rh, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    let x = M; cols.forEach(([t, w], i) => { const last = i === cols.length - 1; doc.text(t, last ? x + w - 2 : x + 2, y + 4.8, { align: last ? "right" : "left" }); x += w; });
    y += rh;
  };
  cab();
  lista.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).forEach((g, n) => {
    if (y + rh > H - 18) { doc.addPage(); y = 16; cab(); }
    if (n % 2 === 0) { doc.setFillColor(...SUAVE); doc.rect(M, y, CW, rh, "F"); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...INK);
    const vals = [fechaCorta(g.fecha), g.concepto || "-", CAT[g.categoria]?.label || "Otros", g.metodo || "-", g.tecnicoNombre || "-", txt(g)];
    let x = M;
    cols.forEach(([, w], i) => {
      const last = i === cols.length - 1;
      doc.text(doc.splitTextToSize(String(vals[i]), w - 4)[0] || "", last ? x + w - 2 : x + 2, y + 4.8, { align: last ? "right" : "left" });
      x += w;
    });
    y += rh;
  });
  pie(doc, `${empresa?.name || "Desabollito"} · gastos ${periodo}`);
  return doc;
}

export function nombreArchivo(v) {
  return `Presupuesto_${(v.patente || v.modelo || "vehiculo").replace(/[^\w-]+/g, "_")}.pdf`;
}
