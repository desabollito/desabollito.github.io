// Efectos visuales (estilo chapisteriaomar.com): intro, velo con blur al cambiar de pantalla,
// scroll suave, spotlight en tarjetas, texto que entra desenfocado y números que cuentan.
const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Intro: al terminar la carga se abre un agujero desde el centro y el texto de la pantalla entra con blur
export function cerrarSplash() {
  const sp = document.getElementById("splash");
  if (!sp || sp.hidden) return;
  if (quieto() || sp.classList.contains("abre")) { sp.hidden = true; return; }
  sp.classList.add("abre");
  setTimeout(() => { sp.hidden = true; sp.classList.remove("abre"); }, 1000);
  setTimeout(() => document.querySelectorAll(".tb-title h1, .view h1, .view h2, .login-card h1").forEach(blurTexto), 250);
}

// Blur Text: cada palabra entra desenfocada, con 70 ms de diferencia
export function blurTexto(el) {
  if (quieto() || el.dataset.bw) return;
  el.dataset.bw = "1";
  let i = 0;
  [...el.childNodes].forEach(n => {
    if (n.nodeType !== 3 || !n.textContent.trim()) return;
    const f = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(p => {
      if (!p.trim()) return f.append(p);
      const s = document.createElement("span");
      s.className = "bw"; s.style.setProperty("--i", i++); s.textContent = p;
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

// Spotlight Card: un brillo que sigue al mouse dentro de la tarjeta
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  let ultima = null;
  document.addEventListener("pointermove", e => {
    const c = e.target.closest?.(".vcard, .card, .d-sec");
    if (ultima && ultima !== c) { ultima.style.removeProperty("--mx"); ultima.style.removeProperty("--my"); }
    ultima = c;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });
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
