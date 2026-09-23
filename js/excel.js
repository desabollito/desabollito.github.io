// Exportación a Excel real (.xlsx): acentos y Ñ correctos, letra Nunito,
// todo alineado a la izquierda, encabezado fijo y filtros.
// La librería (ExcelJS, ~1 MB) se descarga solo la primera vez que se exporta.

const FUENTES = [
  "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
  "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
];
let cargando = null;

function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (cargando) return cargando;
  cargando = (async () => {
    for (const src of FUENTES) {
      try {
        await new Promise((ok, ko) => {
          const s = document.createElement("script");
          s.src = src; s.onload = ok; s.onerror = ko;
          document.head.appendChild(s);
        });
        if (window.ExcelJS) return window.ExcelJS;
      } catch { /* probar la siguiente */ }
    }
    cargando = null;
    throw new Error("No se pudo cargar el generador de Excel. Revisá la conexión.");
  })();
  return cargando;
}

const FUENTE = { name: "Nunito", size: 11 };
const IZQ = { horizontal: "left", vertical: "middle" };

// columnas: [{ titulo, ancho, tipo: "texto" | "fecha" | "moneda" | "usd", valor: fila => ... }]
export async function exportarExcel({ archivo, hoja, titulo, columnas, filas, total }) {
  const ExcelJS = await cargarExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Desabollito";
  const ws = wb.addWorksheet(hoja, { views: [{ state: "frozen", ySplit: titulo ? 2 : 1 }] });

  let filaInicio = 1;
  if (titulo) {
    ws.mergeCells(1, 1, 1, columnas.length);
    const c = ws.getCell(1, 1);
    c.value = titulo;
    c.font = { ...FUENTE, size: 13, bold: true };
    c.alignment = IZQ;
    ws.getRow(1).height = 24;
    filaInicio = 2;
  }

  ws.columns = columnas.map(col => ({ width: col.ancho || 16 }));
  const cab = ws.getRow(filaInicio);
  columnas.forEach((col, i) => {
    const c = cab.getCell(i + 1);
    c.value = col.titulo;
    c.font = { ...FUENTE, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B5CE6" } };
    c.alignment = IZQ;
  });
  cab.height = 22;

  filas.forEach((f, n) => {
    const row = ws.getRow(filaInicio + 1 + n);
    columnas.forEach((col, i) => {
      const c = row.getCell(i + 1);
      let v = col.valor(f);
      if (col.tipo === "fecha" && v) {
        const [y, m, d] = String(v).split("-").map(Number);
        v = new Date(Date.UTC(y, m - 1, d));
        c.numFmt = "dd/mm/yyyy";
      } else if (col.tipo === "moneda" || col.tipo === "usd") {
        v = v == null || v === "" ? "" : Number(v);
        c.numFmt = col.tipo === "usd" ? '"US$" #,##0' : '"$" #,##0';
      } else {
        v = v == null ? "" : String(v);
      }
      c.value = v === "" ? null : v;
      c.font = FUENTE;
      c.alignment = { ...IZQ, wrapText: col.tipo === "texto" && (col.ancho || 16) >= 30 };
      if (n % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F9" } };
    });
  });

  // Filas de totales opcionales: [{ etiqueta, valor, tipo }]
  (total || []).forEach((t, k) => {
    const row = ws.getRow(filaInicio + filas.length + 2 + k);
    const a = row.getCell(1), b = row.getCell(2);
    a.value = t.etiqueta; a.font = { ...FUENTE, bold: true }; a.alignment = IZQ;
    b.value = Number(t.valor || 0); b.numFmt = t.tipo === "usd" ? '"US$" #,##0' : '"$" #,##0';
    b.font = { ...FUENTE, bold: true }; b.alignment = IZQ;
  });

  ws.autoFilter = { from: { row: filaInicio, column: 1 }, to: { row: filaInicio, column: columnas.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = archivo; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
