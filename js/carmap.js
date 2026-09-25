import { PIEZAS, PIEZA, VIDRIOS, ORDEN_PIEZAS } from "./domain.js";
import { esc } from "./ui.js";

// Silueta del auto visto desde arriba, frente hacia arriba.
const CUERPO = "M120 8 C182 8 214 22 216 60 L218 330 C218 372 194 392 120 392 C46 392 22 372 22 330 L24 60 C26 22 58 8 120 8 Z";

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
  return `<svg class="carmap ${size} ${editable ? "editable" : ""}" viewBox="0 0 240 400" role="${editable ? "group" : "img"}"
      aria-label="Mapa de piezas del vehículo">
    <path class="body" d="${CUERPO}"/>
    <rect class="mirror" x="6" y="122" width="18" height="10" rx="4"/>
    <rect class="mirror" x="216" y="122" width="18" height="10" rx="4"/>
    ${glass}${panels}
    <text class="car-front" x="120" y="24" text-anchor="middle">Frente</text>
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

  // Mantener apretado el techo 0,75 s marca todos los paños (o los desmarca si ya estaban todos)
  let timer = null, largo = false;
  const cancelar = () => { clearTimeout(timer); timer = null; };
  svg.addEventListener("pointerdown", e => {
    largo = false;
    if (!e.target.closest('[data-pieza="techo"]')) return;
    timer = setTimeout(() => {
      largo = true; timer = null;
      // Si ya estaban todos marcados, se desmarcan todos; si no, se marcan todos
      const marcar = !ORDEN_PIEZAS.every(k => piezas[k]);
      ORDEN_PIEZAS.forEach(k => {
        piezas[k] = marcar;
        const g = svg.querySelector(`[data-pieza="${k}"]`);
        g.classList.toggle("on", marcar); g.setAttribute("aria-checked", marcar);
      });
      pintarLista(); onToggle?.(piezas);
      navigator.vibrate?.(marcar ? [20, 40, 20] : 30);
    }, 750);
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
  // Sincroniza el dibujo con "piezas" (cuando se cambian desde la vista 3D)
  return {
    refrescar() {
      svg.querySelectorAll("[data-pieza]").forEach(g => {
        const on = !!piezas[g.dataset.pieza];
        g.classList.toggle("on", on); g.setAttribute("aria-checked", on);
      });
      pintarLista();
    }
  };
}
