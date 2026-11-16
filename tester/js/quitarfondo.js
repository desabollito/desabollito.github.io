// Quitar el fondo de una foto en el propio dispositivo (gratis, sin subir nada a terceros).
// Modelo U²-Net chico (u2netp, Apache 2.0, ~4.5 MB) con onnxruntime-web; se baja una sola vez y queda en caché.
const ORT = ["https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/", "https://unpkg.com/onnxruntime-web@1.17.3/dist/"];
let ortBase = ORT[0];
const MODELO = new URL("../modelos/u2netp.onnx", import.meta.url).href;
const LADO = 320;   // el modelo trabaja a 320×320
const MEDIA = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225];

// RGBA (LADO×LADO) → tensor NCHW normalizado como lo entrenaron (dividido por el máximo, después media y desvío de ImageNet)
export function prepararTensor(rgba) {
  const n = LADO * LADO, t = new Float32Array(3 * n);
  let max = 1;
  for (let i = 0; i < rgba.length; i += 4) max = Math.max(max, rgba[i], rgba[i + 1], rgba[i + 2]);
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) t[c * n + p] = (rgba[p * 4 + c] / max - MEDIA[c]) / DESVIO[c];
  return t;
}
// Salida del modelo → máscara 0..255 (estirada entre el mínimo y el máximo)
export function aMascara(pred) {
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const m = new Uint8ClampedArray(pred.length), r = hi - lo || 1;
  for (let i = 0; i < pred.length; i++) m[i] = (pred[i] - lo) / r * 255;
  return m;
}

let sesion = null;
async function cargar() {
  for (const base of ORT) {   // si un CDN falla, el otro
    if (window.ort) break;
    await new Promise(ok => { const s = document.createElement("script"); s.src = base + "ort.min.js"; s.onload = () => { ortBase = base; ok(); }; s.onerror = ok; document.head.append(s); });
  }
  if (!window.ort) throw new Error("No se pudo cargar el quitador de fondo. Revisá la conexión.");
  window.ort.env.wasm.wasmPaths = ortBase;
  window.ort.env.wasm.numThreads = 1;   // sin aislamiento de origen no hay hilos; así anda en todos lados
  return sesion ||= await window.ort.InferenceSession.create(MODELO, { executionProviders: ["wasm"] });
}

// Devuelve la foto (Blob) sin fondo: WebP con transparencia (PNG donde el navegador no sabe hacer WebP)
export async function quitarFondo(blob) {
  const ses = await cargar(), ort = window.ort;
  const img = await createImageBitmap(blob);
  const k = Math.min(1, 1280 / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k);
  const chico = document.createElement("canvas"); chico.width = chico.height = LADO;
  const gc = chico.getContext("2d", { willReadFrequently: true }); gc.drawImage(img, 0, 0, LADO, LADO);
  const salida = await ses.run({ [ses.inputNames[0]]: new ort.Tensor("float32", prepararTensor(gc.getImageData(0, 0, LADO, LADO).data), [1, 3, LADO, LADO]) });
  const m = aMascara(salida[ses.outputNames[0]].data);
  // La máscara de 320×320 se agranda al tamaño de la foto (suavizada por el navegador) y pasa a ser la transparencia
  const md = gc.createImageData(LADO, LADO);
  for (let i = 0; i < m.length; i++) { md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = m[i]; md.data[i * 4 + 3] = 255; }
  gc.putImageData(md, 0, 0);
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const go = out.getContext("2d", { willReadFrequently: true });
  go.drawImage(chico, 0, 0, W, H); const mg = go.getImageData(0, 0, W, H).data;
  go.clearRect(0, 0, W, H); go.drawImage(img, 0, 0, W, H);
  const px = go.getImageData(0, 0, W, H);
  for (let i = 3; i < px.data.length; i += 4) px.data[i] = Math.min(255, Math.max(0, (mg[i - 3] - 20) * 1.25));   // corta el halo gris del borde
  go.putImageData(px, 0, 0);
  img.close?.();
  return new Promise((ok, mal) => out.toBlob(b => b ? ok(b) : mal(new Error("No se pudo armar la foto")), "image/webp", 0.85));
}
