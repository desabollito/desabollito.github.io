import { PIEZAS, PIEZA, VIDRIOS, ESTADO, estadoActual, piezasMarcadas } from "./domain.js";
import { paraPDF, blobADataURL } from "./media.js";
import { fechaCorta, money } from "./ui.js";

const AZUL_BASE = [43, 92, 230];
// Colores elegidos por el dueño en el sello: encabezado, paños, subtítulos/líneas y puntitos
// (los que no se eligen toman el color del encabezado, y este el azul de siempre)
let AZUL = AZUL_BASE, C_PANOS = AZUL_BASE, C_TIT = AZUL_BASE, C_PUNTOS = AZUL_BASE;
const hexARgb = h => /^#[0-9a-f]{6}$/i.test(h || "") ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
const acento = empresa => {
  const s = empresa?.seal || {};
  AZUL = hexARgb(s.color) || AZUL_BASE;
  C_PANOS = hexARgb(s.colorPanos) || AZUL; C_TIT = hexARgb(s.colorTitulos) || AZUL; C_PUNTOS = hexARgb(s.colorPuntos) || AZUL;
};
const INK = [14, 27, 44], GRIS = [104, 118, 138], LINEA = [218, 224, 232], SUAVE = [244, 246, 249];

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

// Encabezado: nombre a la izquierda; logo del sello a la derecha y su texto al lado del logo.
// El alto crece si el texto del sello o el logo lo necesitan. Devuelve el alto del encabezado.
function encabezado(doc, empresa, subtitulo, tituloTxt = null, { soloLogo = false } = {}) {
  const W = doc.internal.pageSize.getWidth(), M = 16;
  const sello = empresa?.seal || {};
  // Tamaños elegidos en el sello (titulo y subtitulo y datos en puntos, logo en mm de ancho)
  const tm = sello.tam || {};
  const T = { titulo: +tm.titulo || 15, sub: +tm.sub || 9, logo: +tm.logo || 46, datos: +tm.datos || 7.5 };
  // medir logo y texto antes de pintar el fondo
  let logo = null;
  if (sello.logo) {
    try {
      const p = doc.getImageProperties(sello.logo);
      const k = T.logo / 46;   // tamaño del logo elegido (46 = normal)
      let w = T.logo, h = p.height / p.width * w;
      if (h > 24 * k) { h = 24 * k; w = p.width / p.height * h; }
      logo = { p, w, h };
    } catch (e) { console.warn("logo del sello", e); }
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(T.datos);
  const lineas = sello.texto && !soloLogo ? doc.splitTextToSize(sello.texto, 64 * T.datos / 7.5) : [];
  const LH = T.datos * 0.47;
  const PT = 0.353;   // mm por punto
  const bloque = T.titulo * PT + (subtitulo ? 2.6 + T.sub * PT : 0);
  const alto = Math.max(34, logo ? logo.h + 12 : 0, lineas.length ? 9 + lineas.length * LH + 4 : 0, bloque + 18);

  doc.setFillColor(...AZUL); doc.rect(0, 0, W, alto, "F");
  const tit = tituloTxt || empresa?.name || "Desabollito";
  doc.setFont("helvetica", "normal"); doc.setFontSize(T.datos);
  const anchoTexto = lineas.length ? Math.max(...lineas.map(l => doc.getTextWidth(l))) : 0;
  const ponerLogo = x => { try { doc.addImage(sello.logo, logo.p.fileType || "PNG", x, (alto - logo.h) / 2, logo.w, logo.h, undefined, "FAST"); } catch (e) { console.warn("logo del sello", e); } };
  const ponerTexto = (x, align) => {
    if (!lineas.length) return;
    doc.setFont("helvetica", "normal"); doc.setFontSize(T.datos); doc.setTextColor(222, 232, 252);
    const y0 = (alto - lineas.length * LH) / 2 + T.datos * PT;
    lineas.forEach((l, i) => doc.text(l, x, y0 + i * LH, { align }));
  };
  const ponerTitulo = (x, disponible, align) => {
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    let fs = T.titulo; doc.setFontSize(fs);
    while (fs > 8 && doc.getTextWidth(tit) > disponible) doc.setFontSize(fs -= 0.5);
    const yT = (alto - (fs * PT + (subtitulo ? 2.6 + T.sub * PT : 0))) / 2 + fs * PT;
    doc.text(tit, x, yT, { align });
    doc.setFont("helvetica", "normal"); doc.setFontSize(T.sub); doc.setTextColor(222, 232, 252);
    if (subtitulo) doc.text(subtitulo, x, yT + 2.6 + T.sub * PT, { align });
  };

  if (sello.diseno === "centrado") {
    // Logo a la izquierda, título centrado y datos de facturación a la derecha
    const lado = Math.max(logo ? logo.w : 0, anchoTexto) + 6;
    if (logo) ponerLogo(M);
    ponerTexto(W - M, "right");
    ponerTitulo(W / 2, W - 2 * M - 2 * lado, "center");
  } else {
    // Clásico: título a la izquierda; logo a la derecha y su texto al lado
    const anchoSello = (logo ? logo.w + 5 : 0) + (anchoTexto ? anchoTexto + 6 : 0);
    ponerTitulo(M, W - 2 * M - anchoSello, "left");
    if (logo) ponerLogo(W - M - logo.w);
    ponerTexto(logo ? W - M - logo.w - 5 : W - M, "right");
  }
  return alto;
}

function pie(doc, texto) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    // Pie más arriba (14 mm del borde) para que ninguna impresora lo corte por sus márgenes
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(16, H - 19, W - 16, H - 19);
    doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal");
    doc.text(texto, 16, H - 14);
    doc.text(`Página ${i} de ${n}`, W - 16, H - 14, { align: "right" });
  }
}

function patente(doc, txt, xDer, y) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  const w = doc.getTextWidth(txt) + 12, x = xDer - w;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(27, 35, 48); doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, 11, 1.6, 1.6, "FD");
  doc.setFillColor(28, 71, 184); doc.rect(x + 0.25, y + 0.25, w - 0.5, 2.4, "F");   // mismo azul que la patente de la app
  doc.setTextColor(...INK); doc.text(txt, x + w / 2, y + 8.9, { align: "center" });
}

function mapaPiezas(doc, piezas, x, y, alto) {
  const k = alto / 422;
  const R = (p, estilo) => doc.roundedRect(x + p.x * k, y + p.y * k, p.w * k, p.h * k, p.r * k, p.r * k, estilo);
  doc.setFillColor(...SUAVE); doc.setDrawColor(...LINEA); doc.setLineWidth(0.4);
  doc.roundedRect(x + 22 * k, y + 8 * k, 196 * k, 406 * k, 40 * k, 40 * k, "FD");
  doc.setFillColor(226, 232, 240);
  VIDRIOS.forEach(v => R(v, "F"));
  PIEZAS.forEach(p => {
    if (piezas[p.key]) { doc.setFillColor(...C_PANOS); doc.setDrawColor(...C_PANOS); }
    else { doc.setFillColor(255, 255, 255); doc.setDrawColor(200, 208, 220); }
    doc.setLineWidth(0.3); R(p, "FD");
  });
  doc.setFontSize(6); doc.setTextColor(...GRIS);
  doc.text("FRENTE", x + 120 * k, y + 5 * k - 1, { align: "center" });
}

function titulo(doc, txt, x, y, w) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...C_TIT);
  doc.text(txt, x, y);
  doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(x, y + 1.8, x + w, y + 1.8);   // línea finita gris
}

export async function presupuestoPDF(v, empresa, { conFotos = false, onProgreso } = {}) {
  acento(empresa);
  const doc = nuevoDoc();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16, CW = W - M * 2;
  const hh = encabezado(doc, empresa, "Granizo por método sacabollo", "PRESUPUESTO DE REPARACIÓN");

  // Vehículo
  let y = hh + 14;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(doc.splitTextToSize(v.modelo || "Vehículo", CW - 50)[0], M, y);
  if (v.patente) patente(doc, v.patente, W - M, y - 8);

  // Datos en dos columnas
  y += 10;
  const datos = [
    ["Asegurado", v.asegurado], ["Teléfono", v.telefono],
    ["Compañía de seguro", v.compania], ["Localidad", v.localidad],
    ["Fecha de peritaje", fecha(v.fechas?.peritado)], ["Grado de daño", v.grado ? `Grado ${v.grado}` : "-"]
  ];
  if (v.fechas?.reparado) datos.push(["Fecha de reparación", fecha(v.fechas.reparado)]);
  const marcadas = piezasMarcadas(v);
  const colW = CW / 2;
  datos.forEach(([l, val], i) => {
    const cx = M + (i % 2) * colW, cy = y + Math.floor(i / 2) * 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(l, cx, cy);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(val || "-"), colW - 6)[0], cx, cy + 5);
  });
  y += Math.ceil(datos.length / 2) * 12 + 10;   // aire antes de "Paños afectados"

  // Piezas: mapa + lista
  if (marcadas.length) {
    titulo(doc, "Paños afectados", M, y, CW); y += 7;
    const altoMapa = 56;
    mapaPiezas(doc, v.piezas, M, y, altoMapa);
    const lx = M + altoMapa * 240 / 422 + 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    // Capot, techo y baúl en una línea; abajo, lado izquierdo y lado derecho (con los parantes) en dos columnas
    const punto = (txt, cx, cy) => { doc.setFillColor(...C_PUNTOS); doc.circle(cx, cy - 1.2, 1.1, "F"); doc.setTextColor(...INK); doc.text(txt, cx + 4, cy); return doc.getTextWidth(txt) + 12; };
    const centro = ["capot", "techo", "baul"].filter(k => v.piezas?.[k]);
    const izq = ["parante_izq", "gf_izq", "pd_izq", "pt_izq", "gt_izq"].filter(k => v.piezas?.[k]);
    const der = ["parante_der", "gf_der", "pd_der", "pt_der", "gt_der"].filter(k => v.piezas?.[k]);
    let py = y + 5;
    if (centro.length) { let cx = lx; centro.forEach(k => { cx += punto(PIEZA[k].label, cx, py); }); py += 10; }
    if (izq.length || der.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
      doc.text("LADO IZQUIERDO", lx, py); doc.text("LADO DERECHO", lx + 62, py);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      izq.forEach((k, i) => punto(PIEZA[k].label, lx, py + 6 + i * 6.5));
      der.forEach((k, i) => punto(PIEZA[k].label, lx + 62, py + 6 + i * 6.5));
    }
    y += altoMapa + 8;
  }

  // Observaciones y repuestos
  const bloques = [["Pintura", v.pintura], ["Repuestos", v.repuestos], ["Observaciones", v.observaciones]].filter(b => b[1]);
  // Una fila por sección (de lado a lado de la hoja): el nombre a la izquierda y los ítems uno al lado del otro
  if (bloques.length) {
    const LX = M + 56 * 240 / 422 + 10, LW = CW - (LX - M);   // mismos puntos que los paños (lado izq./der.)
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(M, y - 4, M + CW, y - 4); y += 2.5;
    // Línea fina entre Pintura, Repuestos y Observaciones (no después de la última)
    let n = 0;
    const sep = () => { if (++n < bloques.length) { y += 2.5; doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(M, y - 4, M + CW, y - 4); y += 4.5; } };
    bloques.forEach(([t, txt]) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...C_TIT);
      doc.text(t, M, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 52, 70);
      if (t === "Observaciones") {
        const lineas = doc.splitTextToSize(txt, LW);
        doc.text(lineas, LX, y);
        y += lineas.length * 4.6 + 3;
        sep();
      } else {
        // Dos columnas, alineadas con "Lado izquierdo" y "Lado derecho" de los paños
        let iy = y;
        String(txt).split(/\n|,/).map(x => x.trim()).filter(Boolean).forEach((item, i) => {
          if (i && i % 2 === 0) iy += 6.5;
          const ix = LX + (i % 2) * 62;
          doc.setFillColor(...C_PUNTOS); doc.circle(ix + 1.1, iy - 1.2, 1.1, "F");
          doc.text(doc.splitTextToSize(item, 56)[0], ix + 4, iy);
        });
        y = iy + 7;
        sep();
      }
    });
    y += 2;
  }

  // Firma del cliente
  if (v.firma) {
    if (y + 42 > H - 23) { doc.addPage(); y = 24; }
    titulo(doc, "Conformidad del cliente", M, y, CW); y += 5;
    try { doc.addImage(v.firma, "PNG", M, y, 70, 26); } catch (e) { console.warn(e); }
    doc.setDrawColor(...LINEA); doc.line(M, y + 28, M + 70, y + 28);
    doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(v.asegurado ? `Firma de ${v.asegurado}` : "Firma", M, y + 32);
    y += 38;
  }

  // Total: barra siempre al pie de la hoja (texto a la izquierda y precio a la derecha, centrados en alto)
  if (v.precio) {
    const AB = 14.5;   // alto de la barra
    const yBarra = H - 21 - AB - 2;
    if (y > yBarra - 2) doc.addPage();
    y = yBarra;
    doc.setFillColor(...AZUL); doc.roundedRect(M, y, CW, AB, 2, 2, "F");
    const fsT = Math.min(+empresa?.seal?.tam?.titulo || 15, 16);
    doc.setFont("helvetica", "bold"); doc.setFontSize(fsT); doc.setTextColor(255, 255, 255);
    const yt = y + AB / 2 + fsT * 0.353 * 0.36;   // centro vertical de la barra (alto de las mayúsculas)
    doc.text("TOTAL DEL PRESUPUESTO", M + 5, yt);
    doc.text(money(v.precio), W - M - 5, yt, { align: "right" });
    y += 15;
  }

  // Fotos
  const fotos = conFotos ? (v.fotos || []).filter(f => !String(f.url || "").includes("/video/upload/")) : [];
  if (fotos.length) {
    const imgs = [];
    for (let i = 0; i < fotos.length; i++) {
      onProgreso?.(`Descargando fotos ${i + 1}/${fotos.length}`);
      try { imgs.push(await cargarImagen(paraPDF(fotos[i].url, fotos[i].rot))); } catch (e) { console.warn(e); }
    }
    if (imgs.length) {
      doc.addPage();
      const hf = encabezado(doc, empresa, "", "REGISTRO FOTOGRÁFICO", { soloLogo: true });
      const cols = 3, gap = 4, cw = (CW - gap * (cols - 1)) / cols, ch = cw * 0.75;
      let fy = hf + 10, c = 0;
      for (const im of imgs) {
        if (fy + ch > H - 23) { doc.addPage(); fy = 20; c = 0; }
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

  pie(doc, "El presupuesto incluye únicamente mano de obra por sacabollo, no incluye pintura ni repuestos.");
  return doc;
}

export function planillaPDF(lista, empresa, filtroTexto = "", sinTotal = false) {
  acento(empresa);
  const doc = nuevoDoc("landscape");
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  const hp = encabezado(doc, empresa, `Planilla de vehículos${filtroTexto ? " · " + filtroTexto : ""} · ${new Date().toLocaleDateString("es-AR")}`);
  const cols = [
    ["Fecha", 20, v => fechaCorta(v.fechas?.peritado)],
    ["Modelo", 52, v => v.modelo], ["Patente", 24, v => v.patente],
    ["Asegurado", 44, v => v.asegurado], ["Compañía", 36, v => v.compania],
    ["Localidad", 34, v => v.localidad], ["Estado", 22, v => ESTADO[estadoActual(v)].label],
    ["Precio", 27, v => money(v.precio)]
  ];
  const tw = cols.reduce((s, c) => s + c[1], 0), x0 = (W - tw) / 2, rh = 7.5;
  let y = hp + 8;
  const cabecera = () => {
    doc.setFillColor(...AZUL); doc.rect(x0, y, tw, rh, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    let x = x0; cols.forEach(([t, w], i) => { doc.text(t, i === cols.length - 1 ? x + w - 2 : x + 2, y + 5, { align: i === cols.length - 1 ? "right" : "left" }); x += w; });
    y += rh;
  };
  cabecera();
  let total = 0;
  lista.forEach((v, n) => {
    if (y + rh > H - 21) { doc.addPage(); y = 16; cabecera(); }
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
  if (!sinTotal) doc.text(`Total ${money(total) || "$0"}`, x0 + tw - 2, y + 4, { align: "right" });
  pie(doc, `${empresa?.name || "Desabollito"} · planilla`);
  return doc;
}

export function gastosPDF(lista, empresa, periodo, CAT) {
  acento(empresa);
  const doc = nuevoDoc();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16, CW = W - M * 2;
  const usd = g => g.moneda === "USD";
  const txt = g => usd(g) ? "US$ " + Number(g.monto || 0).toLocaleString("es-AR") : money(g.monto) || "$0";
  const hg = encabezado(doc, empresa, `Rendición de gastos · ${periodo}`);
  const total = lista.filter(g => !usd(g)).reduce((s, g) => s + Number(g.monto || 0), 0);
  const totalUSD = lista.filter(usd).reduce((s, g) => s + Number(g.monto || 0), 0);
  let y = hg + 12;
  const alto = totalUSD ? 24 : 18;
  doc.setFillColor(...AZUL); doc.roundedRect(M, y, CW, alto, 2.5, 2.5, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(222, 232, 252);
  doc.text(`Total de ${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}`, M + 6, y + 11);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text(money(total) || "$0", W - M - 6, y + 12, { align: "right" });
  if (totalUSD) {
    doc.setFontSize(11); doc.setTextColor(222, 232, 252);
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
    if (y + rh > H - 21) { doc.addPage(); y = 16; cab(); }
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
  // Presupuesto_PATENTE_31_12_2026.pdf (fecha en que se genera)
  const d = new Date(), f = [d.getDate(), d.getMonth() + 1].map(n => String(n).padStart(2, "0")).join("_") + "_" + d.getFullYear();
  return `Presupuesto_${(v.patente || v.modelo || "vehiculo").replace(/[^\w-]+/g, "_")}_${f}.pdf`;
}
