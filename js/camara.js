// Cámara en ráfaga dentro de la app + lector de patentes gratuito en el celular (Tesseract, self-hosted)
import { icon, plate, toast, confirmar } from "./ui.js";

const OCR_DIR = new URL("../vendor/ocr/", import.meta.url).href;

// ── Normalización de patentes argentinas (AA000AA y AAA000) con corrección de letras/números confundidos
const A_LETRA = { 0: "O", 1: "I", 2: "Z", 4: "A", 5: "S", 6: "G", 7: "T", 8: "B" };
const A_NUM = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", J: "1", Z: "2", S: "5", B: "8", G: "6", A: "4", T: "7" };
// Acepta como máximo 1 carácter corregido: evita "inventar" patentes con ruido
const fijar = (txt, patron) => {
  let r = "", corregidos = 0;
  for (let i = 0; i < patron.length; i++) {
    const c = txt[i];
    const ok = patron[i] === "L" ? /[A-Z]/.test(c) : /[0-9]/.test(c);
    const x = ok ? c : (patron[i] === "L" ? A_LETRA[c] : A_NUM[c]);
    if (!x) return null;
    if (!ok && ++corregidos > 1) return null;
    r += x;
  }
  return r;
};
export function patenteDeTexto(texto) {
  const lineas = String(texto || "").toUpperCase().split(/\n/).map(l => l.replace(/[^A-Z0-9]/g, ""));
  for (const [len, patron] of [[7, "LLNNNLL"], [6, "LLLNNN"]]) {
    for (const l of lineas) {
      for (let i = 0; i + len <= l.length; i++) {
        const p = fijar(l.slice(i, i + len), patron);
        if (p) return p;
      }
    }
  }
  return null;
}

// ── Motor OCR (se carga una sola vez, solo cuando se usa)
let motor = null;
function cargarOCR() {
  if (motor) return motor;
  motor = (async () => {
    if (!window.Tesseract) await new Promise((ok, mal) => {
      const s = document.createElement("script"); s.src = OCR_DIR + "tesseract.min.js"; s.onload = ok; s.onerror = mal; document.head.appendChild(s);
    });
    const w = await window.Tesseract.createWorker("eng", 1, {
      workerPath: OCR_DIR + "worker.min.js", corePath: OCR_DIR, langPath: OCR_DIR.replace(/\/$/, ""), gzip: true, workerBlobURL: false
    });
    await w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ", tessedit_pageseg_mode: "6" });
    return w;
  })().catch(e => { motor = null; throw e; });
  return motor;
}

// Zona del video que cae dentro del recuadro (el video se muestra con object-fit: cover)
function zona(video, marco, margen = 0) {
  const vr = video.getBoundingClientRect(), mr = marco.getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = Math.max(vr.width / vw, vr.height / vh);
  const ox = (vr.width - vw * k) / 2, oy = (vr.height - vh * k) / 2;
  const ex = mr.width * margen * 0.3, ey = mr.height * margen;
  return { sx: (mr.left - ex - vr.left - ox) / k, sy: (mr.top - ey - vr.top - oy) / k,
           sw: (mr.width + ex * 2) / k, sh: (mr.height + ey * 2) / k };
}

// Prepara el recorte para el lector: gris, contraste, invertido (patentes negras) y opcionalmente blanco/negro puro
function preparar(src, z, lienzo, { ancho = 400, invertir = false, bn = false } = {}) {
  const W = ancho, H = Math.max(20, Math.round(W * z.sh / z.sw));
  lienzo.width = W; lienzo.height = H;
  const c = lienzo.getContext("2d", { willReadFrequently: true });
  c.drawImage(src, z.sx, z.sy, z.sw, z.sh, 0, 0, W, H);
  const img = c.getImageData(0, 0, W, H), d = img.data, n = d.length / 4;
  const hist = new Uint32Array(256);
  let min = 255, max = 0, suma = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) | 0;
    d[i] = g; hist[g]++; if (g < min) min = g; if (g > max) max = g; suma += g;
  }
  let umbral = 128;
  if (bn) {                                   // Otsu
    let sB = 0, wB = 0, mejor = 0, total = 0;
    for (let t = 0; t < 256; t++) total += t * hist[t];
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += t * hist[t];
      const v = wB * wF * ((sB / wB) - ((total - sB) / wF)) ** 2;
      if (v > mejor) { mejor = v; umbral = t; }
    }
  }
  const inv = (suma / n < 110) !== invertir, rango = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    let g = bn ? (d[i] > umbral ? 255 : 0) : (d[i] - min) * 255 / rango;
    if (inv) g = 255 - g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  c.putImageData(img, 0, 0);
  return lienzo;
}
const VARIANTES = [
  { margen: 0, ancho: 400 }, { margen: 0, ancho: 400, invertir: true },
  { margen: 0.25, ancho: 560 }, { margen: 0, ancho: 300, bn: true },
  { margen: 0.25, ancho: 560, invertir: true }, { margen: 0, ancho: 300, bn: true, invertir: true },
  { margen: 0.15, ancho: 480, bn: true }
];
const limpio = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/**
 * Abre la cámara a pantalla completa.
 * @param {{ patente?: boolean }} op  patente: antes de las fotos, escanea la patente
 * @returns {Promise<{ fotos: File[], patente: string|null } | null>}  null si no hay cámara (usar galería)
 */
let abriendo = false;
export async function abrirCamara(op = {}) {
  if (abriendo || document.querySelector(".cam")) return { fotos: [], patente: null };
  abriendo = true;
  try { return await abrirCamara_(op); } finally { abriendo = false; }
}

// Formato 4:3 (el de la cámara del celular), con la mayor resolución disponible
const VIDEO_4x3 = { width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { ideal: 4 / 3 } };

// Lentes: zoom nativo si el celular lo expone; si no, cámaras traseras separadas (ultra gran angular, etc.)
async function opcionesDeLente(track) {
  const caps = track.getCapabilities?.() || {};
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    const { min, max } = caps.zoom, ops = [];
    if (min < 0.95) ops.push({ t: (Math.round(min * 10) / 10).toString().replace(".", ",") + "x", zoom: min });
    ops.push({ t: "1x", zoom: Math.max(min, 1) });
    if (max >= 2) ops.push({ t: "2x", zoom: 2 });
    if (max >= 3) ops.push({ t: "3x", zoom: 3 });
    return ops.length > 1 ? ops : [];
  }
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
  const traseras = devs.filter(d => !/front|frontal|delanter|user|facetime/i.test(d.label));
  if (traseras.length < 2) return [];
  const rol = d => /ultra|gran angular|0[.,]5/i.test(d.label) ? 0 : /tele/i.test(d.label) ? 2 : /dual|triple/i.test(d.label) ? 9 : 1;
  const conRol = traseras.map(d => ({ d, r: rol(d) })).filter(x => x.r !== 9);
  const conocidos = conRol.some(x => x.r !== 1);
  if (conocidos) {
    const ops = [];
    const ultra = conRol.find(x => x.r === 0), normal = conRol.find(x => x.r === 1), tele = conRol.find(x => x.r === 2);
    if (ultra) ops.push({ t: "0,5x", id: ultra.d.deviceId });
    if (normal) ops.push({ t: "1x", id: normal.d.deviceId });
    if (tele) ops.push({ t: "2x", id: tele.d.deviceId });
    return ops.length > 1 ? ops : [];
  }
  return conRol.map((x, i) => ({ t: `Lente ${i + 1}`, id: x.d.deviceId }));
}

async function abrirCamara_() {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream;
  const pedir = extra => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...VIDEO_4x3, ...extra } });
  try { stream = await pedir({ facingMode: { ideal: "environment" } }); }
  catch (e) {
    console.warn("cámara", e);
    toast(e?.name === "NotAllowedError" ? "La cámara está bloqueada. Habilitala en los permisos del navegador." : "No se pudo abrir la cámara", "error");
    return null;
  }
  let track = stream.getVideoTracks()[0];

  return new Promise(resolve => {
    const fotos = [];          // { file, url }
    let flash = false, cerrado = false, lentes = [], lente = 0;

    const el = document.createElement("div");
    el.className = "cam";
    el.innerHTML = `
      <div class="cam-visor"><video playsinline muted autoplay></video><div class="cam-flashfx"></div></div>
      <header class="cam-top">
        <button class="cam-ic" data-cerrar aria-label="Cerrar">${icon("x")}</button>
        <span class="cam-titulo">Fotos</span>
        <button class="cam-ic" data-flash aria-label="Linterna" hidden>${icon("flash")}</button><span class="cam-ic vacio"></span>
      </header>
      <footer class="cam-bot">
        <div class="cam-lentes"></div>
        <div class="cam-tiras"></div>
        <div class="cam-ctrl">
          <span class="cam-n"></span>
          <button class="cam-disparo" data-disparo aria-label="Sacar foto"></button>
          <button class="cam-ok" data-ok>OK</button>
        </div>
      </footer>`;
    document.body.appendChild(el);
    document.documentElement.classList.add("cam-abierta");
    const $ = s => el.querySelector(s);
    const video = $("video"); video.srcObject = stream;

    const prepararControles = async () => {
      const puedeFlash = !!track.getCapabilities?.().torch;
      $("[data-flash]").hidden = !puedeFlash; $(".cam-ic.vacio").hidden = puedeFlash;
      if (!lentes.length) {
        lentes = await opcionesDeLente(track).catch(() => []);
        lente = Math.max(0, lentes.findIndex(o => o.t === "1x"));
      }
      $(".cam-lentes").innerHTML = lentes.map((o, i) => `<button class="${i === lente ? "on" : ""}" data-lente="${i}">${o.t}</button>`).join("");
    };
    const usarLente = async i => {
      const o = lentes[i]; if (!o) return;
      lente = i; prepararControles();
      if (o.zoom != null) { track.applyConstraints({ advanced: [{ zoom: o.zoom }] }).catch(() => {}); return; }
      try {
        stream.getTracks().forEach(t => t.stop());
        stream = await pedir({ deviceId: { exact: o.id } });
        track = stream.getVideoTracks()[0]; video.srcObject = stream; flash = false;
        $("[data-flash]").classList.remove("on");
        prepararControles();
      } catch (e) { console.warn("lente", e); toast("No se pudo cambiar de lente", "error"); }
    };

    const pintar = () => {
      $(".cam-n").textContent = fotos.length ? `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}` : "";
      $(".cam-ok").disabled = !fotos.length;
      $(".cam-tiras").innerHTML = fotos.map((f, i) => `
        <figure><img src="${f.url}" alt=""><button data-quitar="${i}" aria-label="Quitar">${icon("x")}</button></figure>`).join("");
      $(".cam-tiras").scrollLeft = 1e6;
    };

    const terminar = res => {
      if (cerrado) return; cerrado = true;
      stream.getTracks().forEach(t => t.stop());
      removeEventListener("hashchange", alNavegar);
      document.documentElement.classList.remove("cam-abierta");
      el.remove();
      resolve(res);
    };
    const alNavegar = () => terminar({ fotos: fotos.map(f => f.file), patente: null });
    addEventListener("hashchange", alNavegar);

    el.addEventListener("click", async e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-disparo]")) {
        if (!video.videoWidth) return;
        const c = document.createElement("canvas");
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        $(".cam-flashfx").classList.remove("on"); void el.offsetWidth; $(".cam-flashfx").classList.add("on");
        navigator.vibrate?.(25);
        c.toBlob(b => {
          if (!b || cerrado) return;
          const file = new File([b], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
          fotos.push({ file, url: URL.createObjectURL(b) }); pintar();
        }, "image/jpeg", 0.92);
      }
      else if (t.matches("[data-lente]")) usarLente(+t.dataset.lente);
      else if (t.matches("[data-quitar]")) { const [f] = fotos.splice(+t.dataset.quitar, 1); URL.revokeObjectURL(f.url); pintar(); }
      else if (t.matches("[data-ok]")) terminar({ fotos: fotos.map(f => f.file), patente: null });
      else if (t.matches("[data-flash]")) {
        flash = !flash; t.classList.toggle("on", flash);
        track.applyConstraints({ advanced: [{ torch: flash }] }).catch(() => {});
      }
      else if (t.matches("[data-cerrar]")) {
        if (fotos.length && !(await confirmar({ title: `¿Descartar ${fotos.length === 1 ? "la foto" : `las ${fotos.length} fotos`}?`, ok: "Descartar", danger: true }))) return;
        fotos.forEach(f => URL.revokeObjectURL(f.url)); fotos.length = 0;
        terminar({ fotos: [], patente: null });
      }
    });

    pintar(); prepararControles();
    video.play?.().catch(() => {});
  });
}

/**
 * Busca la patente en una foto (la primera que se sacó). Gratis, en el celular.
 * Prueba varias zonas (la patente suele estar abajo al centro) y variantes de contraste.
 */
export async function buscarPatenteEnFoto(file) {
  const bmp = await createImageBitmap(file);
  const W = bmp.width, H = bmp.height;
  const zonas = [
    [0.18, 0.45, 0.82, 0.95], [0.1, 0.3, 0.9, 1], [0.25, 0.55, 0.75, 0.9], [0, 0, 1, 1]
  ];
  const w = await cargarOCR();
  await w.setParameters({ tessedit_pageseg_mode: "11" });
  const lienzo = document.createElement("canvas");
  try {
    for (const [x0, y0, x1, y1] of zonas) {
      const z = { sx: x0 * W, sy: y0 * H, sw: (x1 - x0) * W, sh: (y1 - y0) * H };
      for (const v of [{ ancho: 1400 }, { ancho: 1400, invertir: true }, { ancho: 1000, bn: true }]) {
        const { data } = await w.recognize(preparar(bmp, z, lienzo, v));
        const p = patenteDeTexto(data.text);
        if (p) return p;
      }
    }
    return null;
  } finally {
    await w.setParameters({ tessedit_pageseg_mode: "6" });
    bmp.close?.();
  }
}

/** Botón "Cámara" grande + botón chico de galería. */
export function botonesFotos({ id, extra = "" } = {}) {
  return `<div class="foto-btns" ${id ? `id="${id}"` : ""}>
    <button type="button" class="btn btn-primary" data-camara>${icon("camera")}Cámara${extra}</button>
    <label class="btn btn-ghost foto-gal" aria-label="Agregar fotos de la galería" title="Agregar de la galería"><span class="gal-ic">${icon("image")}<span class="gal-plus">+</span></span><span class="gal-txt">Galería</span>
      <input type="file" accept="image/*" multiple hidden data-galeria></label>
  </div>`;
}

/** Conecta los botones: onFotos(files, patenteLeida) */
export function conectarFotos(cont, onFotos) {
  cont.querySelector("[data-galeria]").addEventListener("change", e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length) onFotos(files, null);
  });
  cont.querySelector("[data-camara]").addEventListener("click", async () => {
    const r = await abrirCamara();
    if (r === null) { cont.querySelector("[data-galeria]").click(); return; }
    if (r && (r.fotos.length || r.patente)) onFotos(r.fotos, r.patente);
  });
}
