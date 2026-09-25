// Estados del trabajo, en orden. "anulado" queda fuera de la secuencia.
export const ESTADOS = [
  { key: "peritado",  label: "Peritado",  color: "#4f8ff7" },
  { key: "turnado",   label: "Turnado",   color: "#9b7bf2" },
  { key: "reparado",  label: "Reparado",  color: "#22b07d" },
  { key: "facturado", label: "Facturado", color: "#e0a526" },
  { key: "anulado",   label: "Anulado",   color: "#e5484d" }
];
export const ESTADO = Object.fromEntries(ESTADOS.map(e => [e.key, e]));
export const SECUENCIA = ["peritado", "turnado", "reparado", "facturado"];

// Piezas de carrocería. La geometría (x,y,w,h en un lienzo 200×400,
// frente del auto arriba) se usa tanto en el SVG como en el PDF.
export const PIEZAS = [
  { key: "capot",       label: "Capot",                x: 66,  y: 36,  w: 108, h: 78, r: 14 },
  { key: "techo",       label: "Techo",                x: 84,  y: 158, w: 72, h: 104, r: 10 },
  { key: "baul",        label: "Baúl",                 x: 70,  y: 300, w: 100, h: 62, r: 14 },
  { key: "parante_izq", label: "Parante izquierdo",    x: 60,  y: 124, w: 20, h: 172, r: 8 },
  { key: "parante_der", label: "Parante derecho",      x: 160, y: 124, w: 20, h: 172, r: 8 },
  { key: "gf_izq",      label: "Guardabarro del. izq.", x: 26,  y: 44,  w: 32, h: 76, r: 12 },
  { key: "pd_izq",      label: "Puerta del. izq.",     x: 26,  y: 124, w: 30, h: 84, r: 6 },
  { key: "pt_izq",      label: "Puerta tras. izq.",    x: 26,  y: 212, w: 30, h: 84, r: 6 },
  { key: "gt_izq",      label: "Guardabarro tras. izq.", x: 26, y: 300, w: 32, h: 72, r: 12 },
  { key: "gf_der",      label: "Guardabarro del. der.", x: 182, y: 44,  w: 32, h: 76, r: 12 },
  { key: "pd_der",      label: "Puerta del. der.",     x: 184, y: 124, w: 30, h: 84, r: 6 },
  { key: "pt_der",      label: "Puerta tras. der.",    x: 184, y: 212, w: 30, h: 84, r: 6 },
  { key: "gt_der",      label: "Guardabarro tras. der.", x: 182, y: 300, w: 32, h: 72, r: 12 }
];
export const PIEZA = Object.fromEntries(PIEZAS.map(p => [p.key, p]));
export const ORDEN_PIEZAS = ["capot", "techo", "baul", "gf_izq", "pd_izq", "pt_izq", "gt_izq",
  "gf_der", "pd_der", "pt_der", "gt_der", "parante_izq", "parante_der"];

// Vidrios (solo dibujo, no seleccionables)
export const VIDRIOS = [
  { x: 84, y: 120, w: 72, h: 32, r: 8 },   // parabrisas
  { x: 86, y: 266, w: 68, h: 28, r: 8 }    // luneta
];

export const ROLES = {
  owner:   { label: "Dueño" },
  admin:   { label: "Administrador" },
  tecnico: { label: "Técnico" }
};

export function estadoActual(v) {
  return v?.estado && ESTADO[v.estado] ? v.estado : "peritado";
}

export function fechaPeritado(v) {
  return v?.fechas?.peritado || null;
}

export function piezasMarcadas(v) {
  const p = v?.piezas || {};
  return ORDEN_PIEZAS.filter(k => p[k]);
}
