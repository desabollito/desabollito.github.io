import { PIEZAS, PIEZA, VIDRIOS, ORDEN_PIEZAS } from "./domain.js";
import { esc } from "./ui.js";

// Silueta del auto visto desde arriba, frente hacia arriba.
const CUERPO = "M100 8 C150 8 176 22 178 60 L180 330 C180 372 160 392 100 392 C40 392 20 372 20 330 L22 60 C24 22 50 8 100 8 Z";

function rect(p, extra = "") {
  return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" ${extra}/>`;
}

// Devuelve el markup del mapa. editable=true agrega foco y roles de checkbox.
export function carMapSVG(piezas = {}, { editable = false, size = "" } = {}) {
  const panels = PIEZAS.map(p => {
    const on = !!piezas[p.key];
    const a11y = editable
      ? `tabindex="0" role="checkbox" aria-checked="${on}" aria-label="${esc(p.label)}"`
      : `aria-hidden="true"`;
    return `<g class="panel ${on ? "on" : ""}" data-pieza="${p.key}" ${a11y}>
      <title>${esc(p.label)}</title>${rect(p)}</g>`;
  }).join("");
  const glass = VIDRIOS.map(v => rect(v, 'class="glass"')).join("");
  return `<svg class="carmap ${size} ${editable ? "editable" : ""}" viewBox="0 0 200 400" role="${editable ? "group" : "img"}"
      aria-label="Mapa de piezas del vehículo">
    <path class="body" d="${CUERPO}"/>
    <rect class="mirror" x="6" y="128" width="16" height="10" rx="4"/>
    <rect class="mirror" x="178" y="128" width="16" height="10" rx="4"/>
    ${glass}${panels}
    <text class="car-front" x="100" y="24" text-anchor="middle">Frente</text>
  </svg>`;
}

// Conecta el mapa editable con un objeto de piezas y una lista de chips.
export function montarMapa(root, piezas, onToggle) {
  const svg = root.querySelector(".carmap");
  const lista = root.querySelector(".pieza-chips");

  const resumen = root.querySelector(".pieza-resumen");
  const pintarLista = () => {
    if (resumen) {
      const sel = ORDEN_PIEZAS.filter(k => piezas[k]).map(k => PIEZA[k].label);
      resumen.textContent = sel.length === ORDEN_PIEZAS.length ? "Todos los paños"
        : sel.length ? `${sel.length} ${sel.length === 1 ? "paño" : "paños"}: ${sel.join(", ")}` : "Ningún paño marcado todavía.";
    }
    if (!lista) return;
    lista.innerHTML = ORDEN_PIEZAS.map(k => `
      <button type="button" class="chip ${piezas[k] ? "on" : ""}" data-pieza="${k}" aria-pressed="${!!piezas[k]}">
        ${esc(PIEZA[k].label)}</button>`).join("");
  };

  const toggle = key => {
    piezas[key] = !piezas[key];
    const g = svg.querySelector(`[data-pieza="${key}"]`);
    g.classList.toggle("on", piezas[key]);
    g.setAttribute("aria-checked", piezas[key]);
    pintarLista();
    onToggle?.(piezas);
    navigator.vibrate?.(8);
  };

  // Mantener apretado el techo 1,5 s marca todos los paños
  let timer = null, largo = false;
  const cancelar = () => { clearTimeout(timer); timer = null; };
  svg.addEventListener("pointerdown", e => {
    largo = false;
    if (!e.target.closest('[data-pieza="techo"]')) return;
    timer = setTimeout(() => {
      largo = true; timer = null;
      ORDEN_PIEZAS.forEach(k => {
        piezas[k] = true;
        const g = svg.querySelector(`[data-pieza="${k}"]`);
        g.classList.add("on"); g.setAttribute("aria-checked", "true");
      });
      pintarLista(); onToggle?.(piezas);
      navigator.vibrate?.([20, 40, 20]);
    }, 1500);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => svg.addEventListener(ev, cancelar));
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("click", e => {
    if (largo) { largo = false; return; } // no desmarcar el techo después del toque largo
    const g = e.target.closest("[data-pieza]");
    if (g) toggle(g.dataset.pieza);
  });
  svg.addEventListener("keydown", e => {
    const g = e.target.closest("[data-pieza]");
    if (g && (e.key === " " || e.key === "Enter")) { e.preventDefault(); toggle(g.dataset.pieza); }
  });
  lista?.addEventListener("click", e => {
    const b = e.target.closest("[data-pieza]");
    if (b) toggle(b.dataset.pieza);
  });
  pintarLista();
}
