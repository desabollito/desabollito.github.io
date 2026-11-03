// Cómo estaban los documentos de una planilla después del cambio k (entradas: la más nueva primero; k = 0 es ahora):
// se deshacen en orden las más nuevas que esa, con lo que cada una guardó de antes (null = el documento no existía)
export function estadoEn(actual, entradas, k) {
  const out = { ...actual };
  entradas.slice(0, k).forEach(e => Object.entries(e.antes).forEach(([id, d]) => { if (d == null) delete out[id]; else out[id] = d; }));
  return out;
}
// Marcar o sacar un técnico de las viandas un día: vale desde ese día en adelante, hasta el próximo cambio
export function marcarVianda(cambios, fecha, tecs, id) {
  const c = [...cambios].sort((a, b) => a.fecha.localeCompare(b.fecha)).filter(x => x.fecha <= fecha).pop();
  return [...cambios.filter(x => x.fecha !== fecha), { id, fecha, tecs, vianda: c?.vianda || 0, envio: c?.envio || 0 }];
}
// Cambiar los valores de las viandas: valen desde ese día en adelante, sin tocar qué técnicos estaban
export function valoresVianda(cambios, fecha, vianda, envio, id) {
  const c = [...cambios].sort((a, b) => a.fecha.localeCompare(b.fecha)).filter(x => x.fecha <= fecha).pop() || [...cambios].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const siguen = cambios.map(x => x.fecha >= fecha ? { ...x, vianda, envio } : x);
  return siguen.some(x => x.fecha === fecha) ? siguen : [...siguen, { id, fecha, tecs: c?.tecs || [], vianda, envio }];
}

// Tocar a un técnico en un auto: si estaba marcado sale solo él. Si no, queda su grupo y nadie más (grupo: él y sus compañeros);
// grupo de uno: queda él solo. Sin grupo, o con solo = true (mantener apretado), se suma él a los que ya estaban.
export function tocarTec(tecs, id, grupo, solo) {
  if (tecs.includes(id)) return tecs.filter(x => x !== id);
  return solo || !grupo.length ? [...tecs, id] : grupo;
}
// Saca a un técnico de los grupos. Si a un grupo le queda uno solo, se disuelve; los que ya eran de uno (elegidos "Solo") siguen
const sacarDeGrupos = (grupos, t) => grupos.map(x => ({ ...x, tecs: (x.tecs || []).filter(y => y !== t) }))
  .filter((x, i) => x.tecs.length > 1 || (x.tecs.length && x.tecs.length === grupos[i].tecs?.length));
// Junta a b en el grupo de a, o lo saca si ya estaban juntos. Cada técnico en un solo grupo
export function cambiarGrupo(grupos, a, b, id) {
  const g = grupos.find(x => x.tecs?.includes(a)), juntos = g?.tecs.includes(b), resto = sacarDeGrupos(grupos, b);
  if (!juntos) { if (g) resto.find(x => x.id === g.id).tecs.push(b); else resto.push({ id, tecs: [a, b] }); }
  return resto;
}
// "Solo": a queda en un grupo de uno (al marcarlo se desmarcan los demás); otra vez, sin grupo
export function grupoSolo(grupos, a, id) {
  const yaSolo = grupos.some(x => x.tecs?.length === 1 && x.tecs[0] === a), resto = sacarDeGrupos(grupos, a);
  return yaSolo ? resto : [...resto, { id, tecs: [a] }];
}

// Estados del trabajo, en orden. "anulado" queda fuera de la secuencia.
// El paso de reparación avanza con cada toque: Reparando → Revisión → Contactado → Entregado
// ("reparado" es la Revisión final; se mantiene la clave para no perder los datos cargados)
export const ESTADOS = [
  { key: "peritado",  label: "Peritado",  color: "#4f8ff7" },
  { key: "turnado",   label: "Turnado",   color: "#e0a526" },
  { key: "enreparacion", label: "Reparando", color: "#7cc9a8" },
  { key: "reparado",  label: "Revisión",  color: "#22b07d" },
  { key: "llamado",   label: "Contactado", color: "#14b8a6" },
  { key: "entregado", label: "Entregado", color: "#16a34a" },
  { key: "facturado", label: "Facturado", color: "#9b7bf2" },
  { key: "anular",    label: "Anular",    color: "#f0743e" },   // primer toque de "Anular"; el segundo lo deja Anulado
  { key: "anulado",   label: "Anulado",   color: "#e5484d" },
  { key: "ausente",   label: "Ausente",   color: "#5f6b7a" }    // turnado que no vino (mantener apretado "Turnado")
];
export const PASO_REP = ["enreparacion", "reparado", "llamado", "entregado"];   // un solo paso en el seguimiento
export const ESTADO = Object.fromEntries(ESTADOS.map(e => [e.key, e]));
export const SECUENCIA = ["peritado", "turnado", "reparado", "llamado", "entregado", "facturado"];

// Piezas de carrocería. La geometría (x,y,w,h en un lienzo 200×400,
// frente del auto arriba) se usa tanto en el SVG como en el PDF.
export const PIEZAS = [
  { key: "capot",       label: "Capot",                x: 64,  y: 24,  w: 112, h: 90, r: 16 },
  { key: "techo",       label: "Techo",                x: 84,  y: 158, w: 72, h: 104, r: 10 },
  { key: "baul",        label: "Baúl",                 x: 66,  y: 300, w: 108, h: 90, r: 16 },
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
  tecnico: { label: "Sacabollos" },
  desmontaje: { label: "Desmontador" }   // solo ve los vehículos y carga desmontajes
};

export function estadoActual(v) {
  return v?.estado && ESTADO[v.estado] ? v.estado : "peritado";
}

// "Anular" y "Anulado" no cuentan en totales, calendario ni filtros
export const esAnulado = v => ["anular", "anulado"].includes(estadoActual(v));

export function fechaPeritado(v) {
  return v?.fechas?.peritado || null;
}

export function piezasMarcadas(v) {
  const p = v?.piezas || {};
  return ORDEN_PIEZAS.filter(k => p[k]);
}
