// ZIP sin compresión (las fotos JPG ya vienen comprimidas): arma el archivo en el navegador, sin librerías.
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function fechaDOS(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

/** archivos: [{ nombre, datos: Uint8Array }] → Blob application/zip */
export function armarZip(archivos) {
  const enc = new TextEncoder(), { hora, dia } = fechaDOS();
  const partes = [], central = [];
  let offset = 0;
  for (const { nombre, datos } of archivos) {
    const n = enc.encode(nombre), crc = crc32(datos);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, hora, true); h.setUint16(12, dia, true); h.setUint32(14, crc, true);
    h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
    partes.push(h.buffer, n, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.push(c.buffer, n);
    offset += 30 + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, fin.buffer], { type: "application/zip" });
}
