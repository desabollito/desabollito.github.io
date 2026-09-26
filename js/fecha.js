// Selector de fecha propio (reemplaza al del navegador en todos los input[type=date])
import { icon } from "./ui.js";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deISO = s => { const [a, m, d] = String(s || "").split("-").map(Number); return a ? new Date(a, m - 1, d) : null; };
const texto = s => { const d = deISO(s); return d ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Elegir fecha"; };

let abierto = null;
function cerrar() { abierto?.remove(); abierto = null; removeEventListener("pointerdown", fuera, true); removeEventListener("resize", cerrar); removeEventListener("keydown", esc, true); removeEventListener("scroll", alScroll, true); }
function alScroll(e) { if (abierto && !abierto.contains(e.target)) cerrar(); }
function fuera(e) { if (abierto && !abierto.contains(e.target) && !e.target.closest(".fecha-btn")) cerrar(); }
function esc(e) { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } }

function abrir(btn, input) {
  if (abierto) { const mismo = abierto._btn === btn; cerrar(); if (mismo) return; }
  const sel = deISO(input.value);
  let ver = sel ? new Date(sel) : new Date(); ver.setDate(1);
  const pop = document.createElement("div");
  pop.className = "fecha-pop"; pop._btn = btn;
  const pintar = () => {
    const y = ver.getFullYear(), m = ver.getMonth();
    const inicio = (new Date(y, m, 1).getDay() + 6) % 7, dias = new Date(y, m + 1, 0).getDate(), hoy = iso(new Date());
    let celdas = "";
    for (let i = 0; i < inicio; i++) celdas += "<span></span>";
    for (let d = 1; d <= dias; d++) {
      const k = iso(new Date(y, m, d));
      celdas += `<button type="button" data-d="${k}" class="${k === input.value ? "sel" : ""} ${k === hoy ? "hoy" : ""}">${d}</button>`;
    }
    pop.innerHTML = `
      <div class="fp-cab"><button type="button" data-mes="-1" aria-label="Mes anterior">‹</button>
        <strong>${MESES[m]} ${y}</strong><button type="button" data-mes="1" aria-label="Mes siguiente">›</button></div>
      <div class="fp-sem">${DIAS.map(x => `<span>${x}</span>`).join("")}</div>
      <div class="fp-dias">${celdas}</div>
      <div class="fp-pie"><button type="button" data-d="${hoy}">Hoy</button></div>`;
  };
  pintar();
  pop.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.mes) { ver.setMonth(ver.getMonth() + Number(b.dataset.mes)); pintar(); return; }
    if (b.dataset.d) {
      input.value = b.dataset.d;
      btn.querySelector("span").textContent = texto(input.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      cerrar();
    }
  });
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
  const arriba = r.bottom + h + 8 > innerHeight && r.top - h - 8 > 0;
  pop.style.top = `${arriba ? r.top - h - 6 : r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  abierto = pop;
  setTimeout(() => { addEventListener("pointerdown", fuera, true); addEventListener("resize", cerrar); addEventListener("keydown", esc, true); addEventListener("scroll", alScroll, true); });
}

function mejorar(input) {
  input.dataset.fecha = "1";
  input.type = "hidden";
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "fecha-btn";
  btn.innerHTML = `${icon("calendar")}<span>${texto(input.value)}</span>`;
  input.after(btn);
  btn.addEventListener("click", () => abrir(btn, input));
}

export function iniciarFechas() {
  const revisar = raiz => raiz.querySelectorAll?.('input[type="date"]:not([data-fecha])').forEach(mejorar);
  revisar(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches?.('input[type="date"]')) mejorar(n); else revisar(n); } })))
    .observe(document.body, { childList: true, subtree: true });
  addEventListener("hashchange", cerrar);
}
