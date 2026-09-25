// Service worker: la app abre al instante y funciona sin señal.
// Subí el número de versión en cada publicación para forzar la actualización.
const VERSION = "desabollito-v2.8.7";
const SHELL = [
  "./", "./index.html", "./manifest.json", "./css/app.css",
  "./js/app.js", "./js/config.js", "./js/firebase.js", "./js/data.js", "./js/domain.js", "./js/ui.js",
  "./js/shell.js", "./js/media.js", "./js/carmap.js", "./js/pdf.js",
  "./js/views-vehiculos.js", "./js/views-otros.js", "./js/views-gastos.js", "./js/car3d.js", "./js/excel.js", "./js/camara.js",
  "./img/app-192.png", "./img/app-512.png", "./img/logo-claro.png", "./img/logo-oscuro.png"
];

self.addEventListener("install", e => {
  // La versión nueva queda en espera: la app muestra "Actualizar" y el usuario decide.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener("message", e => {
  if (e.data === "activar") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + "-ext").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase, Google y Cloudinary API: siempre a la red (Firestore maneja su propia caché)
  if (/googleapis\.com|firebaseio|identitytoolkit|securetoken|api\.cloudinary\.com/.test(url.host)) return;

  // Archivos propios: siempre se consulta a GitHub si hay algo nuevo (no-cache evita
  // la demora de ~10 min de GitHub Pages). Sin señal, se usa la copia guardada.
  // Lector de patentes (archivos grandes que no cambian): primero la copia guardada
  if (url.origin === location.origin && url.pathname.includes("/vendor/")) {
    e.respondWith(caches.open(VERSION + "-ext").then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req, { cache: "no-cache" }).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Librerías (SDK de Firebase, jsPDF, fuentes): caché primero.
  // Las fotos de Cloudinary las cachea el navegador; no se guardan acá para no llenar el teléfono.
  if (/gstatic\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION + "-ext").then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
