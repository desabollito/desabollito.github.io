// Completa una plantilla .xlsx sin tocar su formato: abre el zip, cambia celdas en el XML y lo vuelve a armar.
// Solo usa APIs estándar (DecompressionStream/CompressionStream), sin dependencias.

const td = new TextDecoder(), te = new TextEncoder();
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function pasar(datos, stream) {
  const r = new Blob([datos]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}

export async function leerZip(bytes) {
  const b = new Uint8Array(bytes);
  let eocd = b.length - 22;
  while (eocd >= 0 && u32(b, eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("No es un .xlsx válido");
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const archivos = [];
  for (let i = 0; i < n; i++) {
    const metodo = u16(b, p + 10), comp = u32(b, p + 20), lnom = u16(b, p + 28), lext = u16(b, p + 30), lcom = u16(b, p + 32), off = u32(b, p + 42);
    const nombre = td.decode(b.subarray(p + 46, p + 46 + lnom));
    const ini = off + 30 + u16(b, off + 26) + u16(b, off + 28);
    const crudo = b.subarray(ini, ini + comp);
    const datos = metodo === 0 ? crudo.slice() : await pasar(crudo, new DecompressionStream("deflate-raw"));
    archivos.push({ nombre, datos });
    p += 46 + lnom + lext + lcom;
  }
  return archivos;
}

let TABLA = null;
function crc32(d) {
  if (!TABLA) TABLA = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLA[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function armarZip(archivos) {
  const partes = [], central = [];
  let off = 0;
  for (const { nombre, datos } of archivos) {
    const nom = te.encode(nombre), comp = await pasar(datos, new CompressionStream("deflate-raw")), crc = crc32(datos);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 8, true);
    h.setUint32(14, crc, true); h.setUint32(18, comp.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, nom.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, nom.length, true); c.setUint32(42, off, true);
    partes.push(new Uint8Array(h.buffer), nom, comp);
    central.push(new Uint8Array(c.buffer), nom);
    off += 30 + nom.length + comp.length;
  }
  const tamC = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, archivos.length, true); e.setUint16(10, archivos.length, true);
  e.setUint32(12, tamC, true); e.setUint32(16, off, true);
  const todo = [...partes, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(todo.reduce((a, x) => a + x.length, 0));
  let p = 0; for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

const escXml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Pone un valor en una celda que ya existe en la hoja (mantiene su estilo). Saca la fórmula si tenía.
export function ponerCelda(xml, ref, valor) {
  const re = new RegExp(`<c r="${ref}"((?:\\s+[a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`);
  let estilo = null;
  if (valor && typeof valor === "object") { estilo = valor.s; valor = valor.v; }   // { v, s }: valor y estilo propio
  return xml.replace(re, (_, attrs) => {
    const s = estilo != null ? ` s="${estilo}"` : (attrs.match(/\ss="[^"]*"/) || [""])[0];
    if (valor === null || valor === undefined || valor === "") return `<c r="${ref}"${s}/>`;
    if (typeof valor === "number") return `<c r="${ref}"${s}><v>${valor}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(valor)}</t></is></c>`;
  });
}

// Completa la hoja 1 con { "C2": 123, "H4": "texto", … } y devuelve el .xlsx nuevo
export async function completarXlsx(plantillaB64, celdas) {
  const bin = Uint8Array.from(atob(plantillaB64), c => c.charCodeAt(0));
  const archivos = await leerZip(bin);
  for (const a of archivos) {
    if (a.nombre === "xl/worksheets/sheet1.xml") {
      let xml = td.decode(a.datos);
      for (const [ref, v] of Object.entries(celdas)) xml = ponerCelda(xml, ref, v);
      a.datos = te.encode(xml);
    }
    // Que Excel recalcule las fórmulas al abrir
    if (a.nombre === "xl/workbook.xml")
      a.datos = te.encode(td.decode(a.datos).replace(/<calcPr\b([^>]*?)\/>/, (m, at) => /fullCalcOnLoad/.test(at) ? m : `<calcPr${at} fullCalcOnLoad="1"/>`));
  }
  return armarZip(archivos.filter(a => a.nombre !== "xl/calcChain.xml"));
}

// Fecha ISO (AAAA-MM-DD) → número de fecha de Excel
export const fechaExcel = iso => { const t = Date.parse(iso + "T00:00:00Z"); return t ? Math.round(t / 86400000) + 25569 : null; };
