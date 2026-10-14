// Efectos visuales (estilo chapisteriaomar.com): intro, velo con blur al cambiar de pantalla,
// scroll suave, spotlight en tarjetas, texto que entra desenfocado y números que cuentan.
const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Logo dibujado por líneas: el logo se arma trazo por trazo; después una mancha azul oscura difuminada crece detrás
// hasta llenar la pantalla (zoom in) y el logo se disuelve. Se usa al abrir la app.
// shortcut: trazos calcados a mano de img/logo-*.png (sin el grosor variable); si cambia el logo, recalcarlos.
const LOGO_TRAZOS = [
  "M68 402 C68 360 68 320 74 300 C84 272 96 250 100 232 C104 220 120 214 140 208 C162 200 176 178 196 146 C212 120 226 104 252 98 C320 86 400 82 473 80",
  "M473 106 C390 110 300 114 262 126 C236 136 214 168 180 214 C270 206 380 199 473 197",
  "M146 186 C120 178 86 180 64 190 C46 200 48 218 66 228",
  "M256 306 C214 288 168 266 136 274 C114 282 112 308 126 326"
];
function animacionLogo() {
  if (quieto()) return Promise.resolve();
  const capa = document.createElement("div");
  capa.className = "expande";
  capa.innerHTML = `<div class="ex-media"></div>
    <svg class="ex-logo" viewBox="30 50 470 380" aria-hidden="true">${LOGO_TRAZOS.map(d => `<path d="${d}" pathLength="1"/>`).join("")}</svg>`;
  document.body.appendChild(capa);
  const W = innerWidth, H = innerHeight, w = Math.min(320, W * .7), h = Math.min(220, H * .3);
  const S = Math.max(W / w, H / h) * 2, DUR = 2700, curva = "cubic-bezier(.76,0,.24,1)";   // de más, así el borde difuminado queda fuera de pantalla
  // 1) el logo se arma por líneas, una tras otra
  capa.querySelectorAll(".ex-logo path").forEach((p, n) => p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 850, delay: 150 + n * 230, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" }));
  // 2) la ventana aparece detrás y se expande; 3) el logo crece con ella y se disuelve
  const media = capa.querySelector(".ex-media");
  media.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px`;
  const crece = media.animate([
    { transform: "scale(.8)", opacity: 0, offset: 0 },
    { transform: "scale(.8)", opacity: 0, offset: .5 },
    { transform: "scale(1)", opacity: 1, offset: .64, easing: curva },
    { transform: `scale(${S})`, opacity: 1, offset: 1 }
  ], { duration: DUR, easing: "ease-out", fill: "forwards" });
  capa.querySelector(".ex-logo").animate([
    { transform: "none", opacity: 1, filter: "none", offset: .62, easing: curva },
    { transform: "scale(2.2)", opacity: 0, filter: "blur(8px)", offset: 1 }
  ], { duration: DUR, fill: "forwards" });
  return crece.finished.catch(() => {}).then(() => {
    capa.classList.add("sale");
    setTimeout(() => capa.remove(), 500);
  });
}

// Al abrir la app (navegador o instalada), el logo se dibuja sobre la intro, que ya arranca solo con la aurora (index.html);
// la intro no se abre hasta que la animación termina.
let introLista = Promise.resolve();
if (!quieto()) {
  introLista = animacionLogo();
} else document.getElementById("splash")?.classList.remove("solo-aurora");

// Intro: al terminar la carga se abre un agujero desde el centro y el texto de la pantalla entra con blur
export function cerrarSplash() { introLista.then(abrirIntro); }
function abrirIntro() {
  const sp = document.getElementById("splash");
  if (!sp || sp.hidden) return;
  if (quieto() || sp.classList.contains("abre")) { sp.hidden = true; return; }
  // El login entra con Blur Text; se arma antes de abrir la intro para que el texto no aparezca y vuelva a desaparecer
  const login = document.querySelector("#login:not([hidden])");
  if (login) blurTexto(login);
  sp.classList.add("abre");
  setTimeout(() => { sp.hidden = true; sp.classList.remove("abre"); }, 1000);
}

// Blur Text: cada palabra entra desenfocada, en orden de lectura (máx. 30 escalones de 40 ms para no demorar)
export function blurTexto(raiz) {
  if (quieto()) return;
  const alto = innerHeight, textos = [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: n =>
    !n.textContent.trim() || n.parentElement.closest(".bw, script, style, textarea, select, option, svg, [hidden]")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  while (w.nextNode() && textos.length < 400) {
    const r = w.currentNode.parentElement.getBoundingClientRect();
    if (r.bottom > 0 && r.top < alto && r.width) textos.push(w.currentNode);   // solo lo que se ve
  }
  let i = 0;
  textos.forEach(n => {
    const f = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(p => {
      if (!p.trim()) return f.append(p);
      const s = document.createElement("span");
      s.className = "bw"; s.style.setProperty("--i", Math.min(30, i++)); s.textContent = p;
      f.append(s);
    });
    n.replaceWith(f);
  });
}

// Count Up: de 0 al valor con ease-out cúbico
export function contar(el, hasta = +el.textContent, ms = 1100) {
  if (quieto() || !(hasta > 0)) return;
  const t0 = performance.now();
  const paso = t => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(hasta * (1 - (1 - p) ** 3));
    if (p < 1 && el.isConnected) requestAnimationFrame(paso);
  };
  el.textContent = "0";
  requestAnimationFrame(paso);
}

// Fade Content: un velo con desenfoque sobre la pantalla que se disipa al cambiar de pestaña
export function veloCambio() {
  if (quieto()) return;
  document.querySelector(".velo-cambio")?.remove();
  const v = document.createElement("div");
  v.className = "velo-cambio";
  v.addEventListener("animationend", () => v.remove(), { once: true });
  document.body.appendChild(v);
}

// Glow que sigue al mouse por toda la app (se mueve con transform: no recalcula estilos)
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const glow = document.createElement("div");
  glow.className = "glow-mouse"; glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);
  document.addEventListener("pointermove", e => { glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`; glow.style.opacity = 1; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { glow.style.opacity = 0; });
}

// Scroll suave con la rueda o el touchpad (en el celular queda el nativo)
if (matchMedia("(pointer: fine)").matches && !quieto()) {
  import("https://cdn.jsdelivr.net/npm/lenis@1.3.25/dist/lenis.mjs").then(({ default: Lenis }) => {
    const lenis = new Lenis({
      autoRaf: true, lerp: 0.12, allowNestedScroll: true,
      // Hojas, visor, menú y fotos a pantalla completa scrollean solos
      prevent: n => !!n.closest?.(".sheet-backdrop, .zoom-foto, .side, .fecha-pop, .pane-list, [data-lenis-prevent]")
    });
    // Con una hoja abierta (body.no-scroll) el fondo no se mueve
    new MutationObserver(() => document.body.classList.contains("no-scroll") ? lenis.stop() : lenis.start())
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }).catch(() => { /* sin señal: queda el scroll normal */ });
}
