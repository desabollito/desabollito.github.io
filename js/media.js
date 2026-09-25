import { CLOUDINARY } from "./config.js";

export function cloudinaryListo() {
  return CLOUDINARY.cloudName && !CLOUDINARY.cloudName.startsWith("TU_")
      && CLOUDINARY.uploadPreset && !CLOUDINARY.uploadPreset.startsWith("TU_");
}

// Reduce la foto en el teléfono antes de subirla: ahorra datos móviles
// y créditos de Cloudinary (1 crédito = 1 GB guardado o servido).
export function comprimir(file, maxLado = 1920, calidad = 0.82, mime = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const k = Math.min(1, maxLado / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo comprimir")), mime, calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen inválida")); };
    img.src = url;
  });
}

// file puede ser Blob/File o un data URL (para migrar fotos viejas en base64)
export async function subir(file, carpeta, { tipo = "image", nombre } = {}) {
  if (!cloudinaryListo()) throw new Error("Cloudinary no está configurado (js/config.js)");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY.uploadPreset);
  fd.append("folder", `${CLOUDINARY.rootFolder}/${carpeta}`);
  if (nombre) fd.append("context", `alt=${nombre.replace(/[|=]/g, " ")}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${tipo}/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Error al subir a Cloudinary");
  return {
    url: data.secure_url,
    publicId: data.public_id,
    w: data.width || null,
    h: data.height || null,
    bytes: data.bytes || null,
    format: data.format || null,
    // solo sirve durante 10 minutos, no se guarda en la base
    deleteToken: data.delete_token || null
  };
}

// Borrado real solo posible con el token (primeros 10 min).
// Pasado ese tiempo se quita la referencia; el archivo se borra desde
// el panel de Cloudinary (Media Library → carpeta del vehículo).
export async function borrarConToken(token) {
  if (!token) return false;
  try {
    const fd = new FormData();
    fd.append("token", token);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/delete_by_token`, { method: "POST", body: fd });
    return res.ok;
  } catch { return false; }
}

// Variantes servidas por Cloudinary (formato y calidad automáticos)
const giro = rot => (rot ? `a_${rot}/` : "");
export function thumb(url, lado = 320, rot = 0) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/${giro(rot)}c_fill,g_auto,w_${lado},h_${lado},q_auto,f_auto/`);
}
export function grande(url, ancho = 1600, rot = 0) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/${giro(rot)}c_limit,w_${ancho},q_auto,f_auto/`);
}
export function paraPDF(url, rot = 0) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/${giro(rot)}c_limit,w_1000,q_70,f_jpg/`);
}

export function blobADataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Imagen chica en base64 (logo del sello): se guarda directo en Firestore
export async function imagenChica(file, maxLado = 480) {
  const blob = await comprimir(file, maxLado, 0.85, "image/png"); // PNG conserva transparencia
  return blobADataURL(blob);
}

// Foto de perfil: recorte cuadrado centrado, 400×400
export function recorteCuadrado(file, lado = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const m = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo procesar la foto")), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen inválida")); };
    img.src = url;
  });
}

export function avatar(url, lado = 96) {
  if (!url || !url.includes("res.cloudinary.com")) return url;
  return url.replace("/upload/", `/upload/c_fill,g_face,w_${lado},h_${lado},q_auto,f_auto/`);
}
