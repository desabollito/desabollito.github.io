// ═════════════════════════════════════════════════════════════
//  INVENTARIO: las herramientas de cada técnico, en un taller dibujado (2D o 3D) y en lista.
//  Valijas y carros guardan herramientas ("en": id del contenedor); lo que está en un carro se ve en el carro.
//  En el 2D cada herramienta puede tener su lugar dentro de su sección ("pos": punto de apoyo, abajo al centro, de 0 a 1).
// ═════════════════════════════════════════════════════════════
import { S, leerInventario, guardarInventario, mensajeError } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, busy } from "./ui.js";
import { subir, comprimir, thumb, entera } from "./media.js";
import { setTopbar } from "./shell.js";

// Secciones del taller, en el orden de la lista
const CATS = {
  varilla: "Varillas", martillo: "Martillos y punzones", inercial: "Martillos inerciales y pullers", gancho: "Ganchos y accesorios",
  lampara: "Lámparas", bateria: "Baterías", carro: "Carro", valija: "Valijas", desmontaje: "Desmontaje", herramienta: "Herramientas", varios: "Varios"
};
const CONTENEDOR = ["valija", "carro"];
// Tipos de la primera versión → los de ahora
const VIEJO = { pantalla: "lampara", pie: "lampara", pegamento: "inercial", limpieza: "varios", otro: "varios" };
// Sugerencias al escribir (lo típico de un kit PDR): nombre → sección
const SUGERENCIAS = {
  varilla: ["Varilla de puerta", "Varilla cola de ballena", "Varilla de capot", "Varilla de techo", "Varilla doble punta", "Varilla de guardabarros"],
  martillo: ["Martillo de goma", "Martillo de teflón", "Martillo de bola", "Punzón de nylon", "Punzón de metal", "Tap-down", "Juego de puntas intercambiables"],
  inercial: ["Martillo inercial", "BullKick", "Shotgun", "Martillo inercial a resorte", "Pinza sacabollos", "Mini lifter", "Puller", "Puente de tracción", "Pistola de pegamento a batería", "Pistola de pegamento a cable", "Barras de pegamento", "Tabs de tracción", "Removedor de pegamento"],
  gancho: ["Gancho de ventanilla", "Gancho en S", "Ventosa", "Cuña inflable", "Protector de ventanilla", "Puntas de repuesto", "Traba de capot", "Traba de puerta", "Traba", "Vara de capot", "Soporte de capot"],
  lampara: ["Lámpara de mano", "Lámpara LED de líneas", "Pantalla reflectora de mano", "Lámpara con pie", "Trípode para lámpara"],
  bateria: ["Batería 18V 6.0Ah", "Batería 18V 5.0Ah", "Batería 18V 3.0Ah", "Batería de auto 12V 65Ah", "Batería de gel 12V 7Ah"],
  carro: ["Carro común", "Carro alto"],
  valija: ["Valija larga de varillas", "Valija vertical con ruedas", "Flight case con ruedas", "Mesa sacabollos"],
  desmontaje: ["Saca grampas", "Kit de palancas plásticas", "Juego de tubos y llaves", "Destornilladores"],
  herramienta: ["Taladro", "Taladro a batería", "Máquina de taladro", "Máquina de pulir", "Máquina Dentshock", "Máquina Hotbox", "Pistola de calor a batería", "Pistola de calor a cable"],
  varios: ["Paños de microfibra", "Compound de pulido", "Pads del taladro", "Lijas", "Spray con alcohol isopropílico", "Linterna de cabeza", "Cinta de enmascarar"]
};
// La sección sale del nombre: igual a una sugerencia, o con una palabra clave
// (el orden importa: "Pistola de calor a batería" es herramienta, no batería; "Pads del taladro" es varios, no herramienta)
const CLAVES = [[/varilla/i, "varilla"], [/traba|\bvara\b|soporte de capot/i, "gancho"], [/mesa sacabollo/i, "valija"],[/microfibra|compound|\bpads?\b|\blijas?\b/i, "varios"], [/pegamento|inercial|puller|lifter|pinza|bull ?kick|shotgun|\btabs?\b/i, "inercial"],
  [/taladro|pulir|pulidora|dentshock|hotbox|pistola de calor|amoladora/i, "herramienta"], [/bater[ií]a/i, "bateria"], [/l[aá]mpara|pantalla/i, "lampara"],
  [/martillo|punz[oó]n|tap.?down/i, "martillo"], [/gancho|ventosa|cu[ñn]a/i, "gancho"], [/valija|flight/i, "valija"], [/\bcarro\b/i, "carro"]];
const catDe = nombre => Object.keys(SUGERENCIAS).find(c => SUGERENCIAS[c].some(s => s.toLowerCase() === nombre.trim().toLowerCase()))
  || CLAVES.find(([re]) => re.test(nombre))?.[1];
// Modelos (el primero es el que toma si no eligió)
const MODELOS = {
  carro: { t: "Modelo de carro", l: [["comun", "Común (dos estantes)"], ["alto", "Alto (con bandeja arriba)"]] },
  valija: { t: "Modelo de valija", l: [["larga", "Larga de varillas"], ["vertical", "Vertical con ruedas"], ["flight", "Flight case (se arma como carro)"], ["mesa", "Mesa sacabollos (con ruedas)"]] },
  lampara: { t: "Tipo de lámpara", l: [["pie", "De pie (con ruedas)"], ["mano", "De mano"]] },
  bateria: { t: "Tipo de batería", l: [["chica", "Chica (de herramienta)"], ["auto", "De auto"]] }
};
const modeloDe = (cat, nombre) => cat === "carro" ? (/alto/i.test(nombre) ? "alto" : "comun")
  : cat === "lampara" ? (/mano|reflectora/i.test(nombre) ? "mano" : "pie")
  : cat === "bateria" ? (/auto|gel|plomo|12\s?v/i.test(nombre) ? "auto" : "chica")
  : /mesa/i.test(nombre) ? "mesa" : /vertical/i.test(nombre) ? "vertical" : /flight|ruedas/i.test(nombre) ? "flight" : "larga";
const nombreModelo = i => MODELOS[i.cat]?.l.find(([k]) => k === i.modelo)?.[1] || MODELOS[i.cat]?.l[0][1];
const ahDe = nombre => { const m = /(\d+(?:[.,]\d+)?)\s*ah\b/i.exec(nombre); return m ? parseFloat(m[1].replace(",", ".")) : null; };
{ console.assert(Object.keys(SUGERENCIAS).every(c => CATS[c]) && Object.values(VIEJO).every(c => CATS[c]) && catDe(" mini LIFTER ") === "inercial" && !catDe("xyz")
    && catDe("Varilla 60cm") === "varilla" && catDe("Batería Makita") === "bateria" && catDe("Taladro a batería") === "herramienta" && catDe("Pistola de pegamento a batería") === "inercial" && catDe("Pads del taladro") === "varios" && catDe("Pistola de calor 2000W") === "herramienta"
    && modeloDe("carro", "Carro alto") === "alto" && SUGERENCIAS.valija.map(n => modeloDe("valija", n)).join() === "larga,vertical,flight,mesa"
    && modeloDe("lampara", "Pantalla reflectora de mano") === "mano" && modeloDe("bateria", "Batería de auto 12V 65Ah") === "auto" && modeloDe("bateria", "Batería 18V 6.0Ah") === "chica"
    && ahDe("Batería 18V 6.0Ah") === 6 && ahDe("12V 7,5 Ah") === 7.5 && ahDe("sin dato") === null, "inventario: tipos"); }

// Dibujos de cada tipo (usan el color del tipo con currentColor)
const DIBUJO = {
  varilla: `<svg viewBox="0 0 24 120" preserveAspectRatio="none"><path d="M4 7h16M12 7v96q0 10-9 11"/></svg>`,
  martillo: `<svg viewBox="0 0 40 64"><rect x="5" y="4" width="30" height="13" rx="4" class="lleno"/><path d="M20 17v44"/></svg>`,
  inercial: `<svg viewBox="0 0 30 90"><path d="M5 6h20M15 6v80"/><rect x="8" y="34" width="14" height="22" rx="3" class="lleno"/></svg>`,
  gancho: `<svg viewBox="0 0 34 70"><path d="M17 4v40a10 10 0 1 1-12-9"/></svg>`,
  // Lámpara de pie (como las PDR con ruedas): panel alto con tres franjas de luz, caño con brazos, batería roja y base con ruedas
  lampara: `<svg viewBox="0 0 60 160" class="m-pie"><rect x="24" y="4" width="20" height="104" rx="4" class="marco"/><path d="M29 11v90" class="luz1"/><path d="M34 11v90" class="luz2"/><path d="M39 11v90" class="luz3"/><path d="M15 14v132M15 26h9M15 90h9M10 10l5 4"/><rect x="9" y="116" width="12" height="15" rx="2" class="rojo"/><path d="M3 148h26"/><circle cx="6" cy="154" r="3.5"/><circle cx="26" cy="154" r="3.5"/></svg>`,
  // Lámpara de mano: panel con luz cálida a fría, mango y batería en la punta
  lamparaMano: `<svg viewBox="0 0 70 92" class="m-mano"><g transform="rotate(22 40 34)"><rect x="24" y="4" width="34" height="58" rx="8" class="marco"/><path d="M32 11v44" class="luz1"/><path d="M41 11v44" class="luz2"/><path d="M50 11v44" class="luz3"/><path d="M41 62v16"/><rect x="31" y="78" width="20" height="12" rx="3" class="lleno"/></g></svg>`,
  // Baterías: chica (de herramienta, tipo 18V) y de auto
  bateria: `<svg viewBox="0 0 50 40" class="m-chica"><rect x="3" y="13" width="44" height="23" rx="5" class="lleno"/><rect x="11" y="5" width="28" height="9" rx="2"/><rect x="20" y="7" width="10" height="4" rx="1" class="naranja"/><path d="M9 20h2M13 20h2M17 20h2M21 20h2"/></svg>`,
  bateriaAuto: `<svg viewBox="0 0 60 46" class="m-auto"><rect x="3" y="10" width="54" height="33" rx="3" class="lleno"/><rect x="10" y="4" width="8" height="6" rx="1"/><rect x="42" y="4" width="8" height="6" rx="1"/><path d="M11 22h6M14 19v6M43 22h6"/></svg>`,
  carro: `<svg viewBox="0 0 74 62"><rect x="4" y="8" width="66" height="13" rx="3" class="lleno"/><rect x="4" y="38" width="66" height="9" rx="3" class="lleno"/><path d="M9 21v29M65 21v29M1 8h72"/><circle cx="10" cy="56" r="4"/><circle cx="64" cy="56" r="4"/></svg>`,
  carroAlto: `<svg viewBox="0 0 54 96"><rect x="3" y="5" width="48" height="9" rx="2" class="lleno"/><path d="M27 14v66"/><rect x="8" y="50" width="38" height="6" rx="2" class="lleno"/><path d="M6 84h42"/><circle cx="8" cy="90" r="4"/><circle cx="46" cy="90" r="4"/></svg>`,
  valija: `<svg viewBox="0 0 110 30" class="m-larga"><rect x="3" y="6" width="104" height="20" rx="4" class="lleno"/><path d="M48 6V2h14v4M3 16h104M20 9h16M74 9h16"/></svg>`,
  valijaVertical: `<svg viewBox="0 0 40 92" class="m-vertical"><path d="M14 8V3h12v5"/><rect x="4" y="8" width="32" height="74" rx="5" class="lleno"/><path d="M10 20h20M10 30h20M10 40h20M10 50h20M10 60h20M10 70h20"/><circle cx="10" cy="86" r="3"/><circle cx="30" cy="86" r="3"/></svg>`,
  valijaFlight: `<svg viewBox="0 0 100 82" class="m-flight"><rect x="4" y="4" width="92" height="6" rx="2" class="lleno"/><path d="M14 10v42M86 10v42M24 10v42M76 10v42"/><rect x="4" y="52" width="92" height="20" rx="2" class="lleno"/><circle cx="12" cy="77" r="3.5"/><circle cx="88" cy="77" r="3.5"/></svg>`,
  desmontaje: `<svg viewBox="0 0 64 24"><rect x="2" y="5" width="24" height="14" rx="5" class="lleno"/><path d="M26 12h26l8-5"/></svg>`,
  herramienta: `<svg viewBox="0 0 60 50"><rect x="6" y="6" width="40" height="16" rx="6" class="lleno"/><path d="M46 14h12"/><rect x="15" y="22" width="11" height="17" rx="3"/><rect x="10" y="39" width="22" height="8" rx="2" class="lleno"/></svg>`,
  varios: `<svg viewBox="0 0 40 34"><rect x="3" y="8" width="34" height="23" rx="3" class="lleno"/><path d="M3 15h34M17 15v5h6v-5"/></svg>`
};
const VARIANTE = { carro: { alto: "carroAlto" }, lampara: { mano: "lamparaMano" }, bateria: { auto: "bateriaAuto" }, valija: { mesa: "mesaSacabollos", vertical: "valijaVertical", flight: "valijaFlight" } };
// Máquinas de inducción (Dentshock, Hotbox): caja con pantallita y perilla, y el lápiz con su cable
DIBUJO.induccion = `<svg viewBox="0 0 76 50" class="m-induccion"><rect x="3" y="14" width="36" height="30" rx="4" class="lleno"/><rect x="9" y="20" width="15" height="9" rx="1.5"/><circle cx="31" cy="25" r="3.5"/><path d="M9 37h22"/><path d="M39 32c14 0 10-20 22-21" class="cable"/><path d="M60 12l12-9" class="lapiz"/></svg>`;
// Mesa sacabollos: tapa, patas con tijera en X, 4 ruedas y los soportes en U de las esquinas
DIBUJO.mesaSacabollos = `<svg viewBox="0 0 72 66" class="m-mesa"><path d="M12 18V7h7V3M60 18V7h-7V3"/><rect x="6" y="18" width="60" height="6" rx="1.5" class="lleno"/><path d="M12 24v34M60 24v34M12 26l48 30M60 26L12 56"/><circle cx="12" cy="61" r="3.5"/><circle cx="60" cy="61" r="3.5"/></svg>`;
// Pinza sacabollos: cuerpo con tornillo arriba, dos mangos a la derecha y dos patas con goma
DIBUJO.pinza = `<svg viewBox="0 0 74 58" class="m-pinza"><rect x="22" y="1" width="10" height="5" rx="1.5"/><path d="M27 6v8"/><path d="M12 14h30v12l-7 8v6H19v-6l-7-8z" class="lleno"/><path d="M42 16h30M40 26l30 9"/><path d="M27 34v12"/><path d="M4 54h18l2-6M50 54H32l-2-6" class="patas"/></svg>`;
const esPinza = i => i.cat === "inercial" && /pinza/i.test(i.nombre || "");
// Martillo inercial (tipo FastPDR), parado: mango con estrías arriba, barra, pesa con 3 tornillos al medio y la punta abajo
DIBUJO.slide = `<svg viewBox="0 0 30 124" class="m-slide"><rect x="9" y="2" width="12" height="34" rx="5" class="lleno"/><path d="M9 11h12M9 19h12M9 27h12"/><rect x="8" y="36" width="14" height="4" rx="1"/><path d="M15 40v70"/><rect x="7" y="56" width="16" height="30" rx="2" class="lleno"/><circle cx="15" cy="63" r="2"/><circle cx="15" cy="71" r="2"/><circle cx="15" cy="79" r="2"/><rect x="11" y="110" width="8" height="12" rx="2"/></svg>`;
// BullKick / Shotgun / a resorte, parado: cuerpo grueso negro con anillos rojos arriba, barra de acero y el mango chico abajo
DIBUJO.bullkick = `<svg viewBox="0 0 30 124" class="m-bull"><rect x="5" y="2" width="20" height="64" rx="8" class="lleno"/><path d="M5 11h20M5 57h20" class="rojo2"/><path d="M10 25h10M10 33h10M10 41h10"/><path d="M15 66v34" class="acero"/><rect x="10" y="100" width="10" height="22" rx="4" class="lleno"/></svg>`;
// Pistola de pegamento: cuerpo con boquilla, mango con gatillo y la barra de pegamento atrás; a batería, con la batería abajo
const PISTOLA = bat => `<svg viewBox="0 0 74 60" class="m-pistola"><path d="M10 8h40a8 8 0 0 1 0 16H36l-5 22H19l5-22H10z" class="lleno"/><path d="M58 16h12"/><path d="M1 16h9" class="barra"/><path d="M33 26q-5 6-2 11"/>${bat ? `<rect x="14" y="46" width="22" height="11" rx="2" class="bat"/>` : ""}</svg>`;
DIBUJO.pistola = PISTOLA(false); DIBUJO.pistolaBat = PISTOLA(true);
const esPistola = i => i.cat === "inercial" && /pistola/i.test(i.nombre || "");
const esBullkick = i => i.cat === "inercial" && /bull ?kick|shotgun|resorte/i.test(i.nombre || "");
const esSlide = i => i.cat === "inercial" && !esBullkick(i) && /martillo inercial|slide/i.test(i.nombre || "");
const esInduccion = i => i.cat === "herramienta" && /dentshock|hotbox|inducci/i.test(i.nombre || "");
const dibujo = i => esInduccion(i) ? DIBUJO.induccion : esPinza(i) ? DIBUJO.pinza : esPistola(i) ? (/bater/i.test(i.nombre) ? DIBUJO.pistolaBat : DIBUJO.pistola) :esBullkick(i) ? DIBUJO.bullkick : esSlide(i) ? DIBUJO.slide : DIBUJO[VARIANTE[i.cat]?.[i.modelo]] || DIBUJO[i.cat] || DIBUJO.varios;
const largo = id => 62 + [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38;   // varillas de distinto largo (siempre igual para la misma)
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Lugar de cada herramienta en su sección del 2D: el que eligió (arrastrando) o uno ordenado por defecto
const COLUMNAS = { valija: 2, carro: 2, lampara: 2 }, COLGADAS = ["martillo", "gancho"];
const posDefecto = (i, k, n) => {
  if (i.cat === "varilla") { const paso = Math.min(0.07, 0.94 / Math.max(1, n)); return { x: 0.04 + paso * (k + 0.5), y: largo(i.id) / 100 }; }
  const cols = COLUMNAS[i.cat] || 3, fila = Math.floor(k / cols), x = (k % cols + 0.5) / cols;
  return COLGADAS.includes(i.cat) ? { x, y: Math.min(1, 0.48 + fila * 0.5) } : { x, y: Math.max(0.35, 1 - fila * 0.45) };
};
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
// Encastre en grilla, como los íconos del escritorio: el punto de apoyo (px dentro del recuadro W×H) va al casillero más cercano
// donde la herramienta entera (media ancho mw, alto mh) queda adentro; si ahí ya hay otra apoyada, al casillero libre más cercano.
const GRILLA = 28;
const encastrar = (px, py, W, H, mw, mh, otros = []) => {
  const xs = [], ys = [];
  for (let x = Math.ceil(mw / GRILLA) * GRILLA; x <= W - mw + 0.01; x += GRILLA) xs.push(x);
  for (let y = Math.ceil(mh / GRILLA) * GRILLA; y <= H + 0.01; y += GRILLA) ys.push(y);
  if (!xs.length) xs.push(W / 2);
  if (!ys.length || ys[ys.length - 1] < H - 1) ys.push(H);   // siempre se puede apoyar en el piso del recuadro
  const libre = (x, y) => !otros.some(o => Math.abs(o.x - x) < GRILLA / 2 && Math.abs(o.y - y) < GRILLA / 2);
  let mejor = null, dm = Infinity;
  for (const x of xs) for (const y of ys) { const dd = (x - px) ** 2 + (y - py) ** 2; if (dd < dm && libre(x, y)) { dm = dd; mejor = { x, y }; } }
  return mejor || { x: lim(px, mw, W - mw), y: lim(py, mh, H) };
};
{ const a = encastrar(50, 100, 200, 100, 10, 20), b = encastrar(50, 100, 200, 100, 10, 20, [{ x: 56, y: 100 }]);
  console.assert(a.x === 56 && a.y === 100 && b.x === 56 && b.y === 84, "inventario: encastre en grilla"); }
// Dónde va cada sección del taller 2D si no la movió (en % del taller): pared arriba, mesa al medio, lo de abajo y las lámparas a la derecha.
// En pantallas angostas, de a dos por fila.
const R = (x, y, w, h) => ({ x, y, w, h });
const DISPOSICION = {
  ancho: { varilla: R(1, 2, 31, 44), martillo: R(33, 2, 25, 44), gancho: R(59, 2, 25.5, 44),
    inercial: R(1, 47.5, 20.5, 24.5), desmontaje: R(22.5, 47.5, 20.5, 24.5), herramienta: R(44, 47.5, 20.5, 24.5), bateria: R(65.5, 47.5, 19, 24.5),
    valija: R(1, 73.5, 27.5, 25), carro: R(29.5, 73.5, 27.5, 25), varios: R(58, 73.5, 26.5, 25), lampara: R(85.5, 2, 13.5, 96.5) },
  angosto: { varilla: R(1, 0.5, 98, 14), martillo: R(1, 15, 48.5, 11), gancho: R(50.5, 15, 48.5, 11),
    inercial: R(1, 26.5, 48.5, 10.5), desmontaje: R(50.5, 26.5, 48.5, 10.5), herramienta: R(1, 37.5, 48.5, 10.5), bateria: R(50.5, 37.5, 48.5, 10.5),
    lampara: R(1, 48.5, 98, 16), valija: R(1, 65, 48.5, 11), carro: R(50.5, 65, 48.5, 11), varios: R(1, 76.5, 98, 11) }
};
{ const ks = Object.keys(CATS).sort().join();
  console.assert(Object.keys(DISPOSICION.ancho).sort().join() === ks && Object.keys(DISPOSICION.angosto).sort().join() === ks
    && Object.values(DISPOSICION.ancho).every(r => r.x + r.w <= 100 && r.y + r.h <= 100), "inventario: disposición de secciones"); }
const FOTO = 54, TAM_MIN = 24, TAM_MAX = 320;   // lado de la foto en el 2D (px) y sus límites al agrandar o achicar
{ const p = posDefecto({ cat: "martillo" }, 4, 6); console.assert(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.98) < 1e-9, "inventario: lugar por defecto"); }

export async function vistaInventario(view) {
  setTopbar({ title: "Inventario", back: "#/ajustes" });
  view.innerHTML = `<div class="page inventario"><div class="skeleton" style="height:340px"></div></div>`;
  let items, secciones;   // secciones: { ancho: { cat: {x,y,w,h} }, angosto: {...} } las que movió o agrandó (en % del taller)
  const normalizar = l => l.map(i => i.nombre === "Puller en T" ? { ...i, nombre: "Puller" } : i).map(i => CATS[i.cat] ? i : { ...i, cat: VIEJO[i.cat] || "varios", ...(i.cat === "pantalla" ? { modelo: "mano" } : {}) });   // las pantallas de mano de antes
  try { const r = await leerInventario(); items = normalizar(r.items); secciones = r.secciones; }
  catch (e) { view.innerHTML = `<div class="page"><div class="empty"><p>${esc(mensajeError(e))}</p></div></div>`; return; }

  const de = id => items.find(i => i.id === id);
  const contenedores = (sin = "") => items.filter(i => CONTENEDOR.includes(i.cat) && i.id !== sin);
  const dondeTxt = i => { const c = de(i.en); return !c ? "" : (c.cat === "carro" ? "En el carro " : "Dentro de ") + c.nombre; };
  async function guardar() {
    try { await guardarInventario(items, secciones); }
    catch (e) {
      toast(mensajeError(e), "error");
      const r = await leerInventario().catch(() => null);
      if (r) { items = normalizar(r.items); secciones = r.secciones; }
      pintar();
    }
  }
  const cambiar = nuevos => { items = nuevos; pintar(); guardar(); };

  const obj = (i, k, n) => {
    const p = i.pos || posDefecto(i, k, n), conFoto = fotos && i.foto?.url, lado = Math.round(FOTO * (i.tam || 1));
    // En modo Foto: la foto entera, del tamaño que eligió (tirador de la esquina o rueda del mouse)
    return `<button type="button" class="inv-obj inv-${i.cat}" data-ver="${esc(i.id)}" aria-label="${esc(i.nombre)}" title="${esc(i.nombre)}"
      style="left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%${i.cat === "varilla" && !conFoto ? `;height:${largo(i.id)}%` : ""}">${conFoto
        ? `<img class="inv-obj-foto" src="${esc(entera(i.foto.url))}" alt="" loading="lazy" draggable="false" style="width:${lado}px;height:${lado}px"><span class="inv-tam" title="Arrastrá para agrandar o achicar"></span>`
        : dibujo(i)}${(i.cant || 1) > 1 ? `<b class="inv-n">×${i.cant}</b>` : ""}
      ${CONTENEDOR.includes(i.cat) ? `<b class="inv-n">${items.filter(x => x.en === i.id).length || ""}</b>` : ""}<span class="inv-nom">${esc(i.nombre)}</span></button>`;
  };
  // Cada sección: todas sus herramientas (aunque estén en una valija o un carro, siguen en la pared) y el + para agregar ahí
  // Cada sección es un recuadro del taller (en % del taller) que se mueve con el ⠿ y se agranda desde la esquina de abajo a la derecha.
  // Hay una disposición para pantallas anchas y otra para angostas (celular), así una no arruina la otra.
  const disp = () => view.clientWidth >= 700 ? "ancho" : "angosto";
  const rectDe = cat => secciones?.[disp()]?.[cat] || DISPOSICION[disp()][cat];
  const zona = cat => { const l = items.filter(i => i.cat === cat), r = rectDe(cat);
    return `<div class="inv-zona inv-z-${cat}" data-zona="${cat}"
        style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%">
      <div class="inv-zona-cab"><span class="inv-mover" role="button" aria-label="Mover la sección ${esc(CATS[cat])}" title="Arrastrá para mover la sección">⠿</span>
        <button type="button" class="inv-etq" data-nueva="${cat}">${icon("plus")}${CATS[cat]}</button></div>
      <div class="inv-objs" data-cat="${cat}">${l.map((i, k) => obj(i, k, l.length)).join("")}</div>
      <span class="inv-redim" aria-hidden="true" title="Arrastrá para cambiar el tamaño"></span></div>`; };
  const miniatura = i => i.foto?.url ? `<img class="inv-foto" src="${esc(entera(i.foto.url))}" alt="" loading="lazy">` : `<span class="inv-foto inv-${i.cat}">${dibujo(i)}</span>`;
  const fila = i => `<div class="aj-item inv-fila"><button type="button" class="inv-fila-ver" data-ver="${esc(i.id)}">${miniatura(i)}
      <span class="aj-txt">${esc(i.nombre)}</span><span class="aj-val">${[(i.cant || 1) > 1 ? "×" + i.cant : "", i.ah ? i.ah + " Ah" : "", esc(dondeTxt(i))].filter(Boolean).join(" · ")}</span></button>
      <button type="button" class="icon-btn sm" data-ed="${esc(i.id)}" aria-label="Editar ${esc(i.nombre)}" title="Editar">${icon("edit")}</button></div>`;

  let quitar3D = () => {}, fotos = false;   // fotos: el taller 2D muestra la foto real en vez del dibujo
  function pintar() {
    const total = items.reduce((a, i) => a + (i.cant || 1), 0);
    const en3D = (() => { try { return localStorage.getItem("invVista") === "3d"; } catch { return false; } })();
    fotos = (() => { try { return localStorage.getItem("invFotos") === "1"; } catch { return false; } })();
    quitar3D(); quitar3D = () => {};
    view.innerHTML = `<div class="page inventario">
      <div class="inv-barra"><div class="seg seg-sm inv-modo" id="inv-modo"><button class="seg-btn ${en3D ? "" : "on"}" data-m="2d">2D</button><button class="seg-btn ${en3D ? "on" : ""}" data-m="3d">3D</button></div>
        ${en3D ? "" : `<div class="seg seg-sm" id="inv-fotos" title="Ver las herramientas con su dibujo o con su foto real"><button class="seg-btn ${fotos ? "" : "on"}" data-f="0">Dibujo</button><button class="seg-btn ${fotos ? "on" : ""}" data-f="1">Foto</button></div>`}
        ${!en3D && Object.keys(secciones?.[disp()] || {}).length ? `<button type="button" class="btn btn-ghost btn-sm" id="inv-restablecer">${icon("restore")}Restablecer secciones</button>` : ""}</div>
      ${en3D ? `<div class="inv-3d" id="inv-3d"><p class="inv-3d-carga">Cargando el taller en 3D…</p><span class="inv-3d-tip" hidden></span></div>` : `
      <div class="inv-sala inv-sala-${disp()}" role="group" aria-label="Taller">${Object.keys(DISPOSICION.ancho).map(zona).join("")}
      </div>`}
      <p class="muted small">${items.length ? `${total} ${total === 1 ? "herramienta" : "herramientas"}. Tocá una para verla; arrastrala para acomodarla o para guardarla en una valija o un carro.` : "Todavía no cargaste herramientas: tocá el + de una sección del taller."}</p>
      ${Object.entries(CATS).map(([k, t]) => { const l = items.filter(i => i.cat === k).sort((a, b) => a.nombre.localeCompare(b.nombre));
        return l.length ? `<section class="aj-grupo"><h3>${t} · ${l.length}</h3><div class="aj-lista">${l.map(fila).join("")}</div></section>` : ""; }).join("")}
    </div>`;
    $("#inv-modo", view).onclick = e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      try { localStorage.setItem("invVista", b.dataset.m); } catch { /* sin almacenamiento */ }
      pintar();
    };
    $("#inv-restablecer", view)?.addEventListener("click", async () => {
      if (!(await confirmar({ title: "¿Volver las secciones a su lugar?", message: "Las secciones del taller vuelven a su tamaño y lugar de siempre. Las herramientas no se tocan.", ok: "Restablecer" }))) return;
      secciones = { ...secciones, [disp()]: {} }; pintar(); guardar();
    });
    $("#inv-fotos", view)?.addEventListener("click", e => {
      const b = e.target.closest("[data-f]"); if (!b) return;
      try { localStorage.setItem("invFotos", b.dataset.f); } catch { /* sin almacenamiento */ }
      pintar();
    });
    if (en3D) {
      const caja = $("#inv-3d", view);
      import("./inventario3d.js").then(m => m.montar3D(caja, items, id => de(id) && ver(de(id)), cat => editar({ cat }), (id, en) => de(id) && mover(de(id), en)))
        .then(q => { quitar3D = q; caja.querySelector(".inv-3d-carga")?.remove(); })
        .catch(e => { caja.querySelector(".inv-3d-carga").textContent = e.message; });
    }
    if (!en3D) escucharArrastre(view.querySelector(".inventario"));
    view.querySelector(".inventario").onclick = e => {
      const b = e.target.closest("[data-ver], [data-ed], [data-nueva]"); if (!b || arrastro) return;
      if (b.dataset.nueva) editar({ cat: b.dataset.nueva });
      else if (b.dataset.ed) editar(de(b.dataset.ed));
      else ver(de(b.dataset.ver));
    };
  }

  // Ver una herramienta (sin editar): foto, datos y lo que tiene adentro si es valija o carro
  function ver(it) {
    const dentro = items.filter(i => i.en === it.id), esCont = CONTENEDOR.includes(it.cat);
    const carros = contenedores(it.id).filter(c => c.cat === "carro"), enCarro = de(it.en)?.cat === "carro";
    const dato = (t, v) => v ? `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>` : "";
    const s = openSheet({ title: it.nombre, body: `<div class="stack">
      ${it.foto?.url ? `<img class="inv-foto-grande" src="${esc(it.foto.url)}" alt="">` : `<div class="inv-ver-dibujo inv-${it.cat}">${dibujo(it)}</div>`}
      <dl class="inv-datos">${dato("Sección", CATS[it.cat])}${MODELOS[it.cat] ? dato("Modelo", nombreModelo(it)) : ""}${dato("Amperaje", it.ah ? it.ah + " Ah" : "")}
        ${dato("Cantidad", String(it.cant || 1))}${dato("Dónde está", dondeTxt(it) || "En su lugar del taller")}${dato("Nota", it.nota)}</dl>
      ${esCont ? `<h3 class="inv-sub">${it.cat === "carro" ? "En el carro" : "Adentro"} · ${dentro.length}</h3>
        ${dentro.length ? `<div class="aj-lista">${dentro.map(fila).join("")}</div>` : `<p class="muted small">${it.cat === "carro" ? "El carro está vacío." : "La valija está vacía."}</p>`}` : ""}
      <div class="row-btns inv-acciones">
        ${esCont ? `<button type="button" class="btn btn-ghost" data-elegir>${icon("check")}Elegir herramientas</button>` : ""}
        ${!esCont && it.en ? `<button type="button" class="btn btn-ghost" data-mover="">${icon("restore")}${enCarro ? "Sacar del carro" : "Sacar de la valija"}</button>`
          : !esCont && carros.length ? `<button type="button" class="btn btn-ghost" data-carro>${icon("tool")}Mostrar en el carro</button>` : ""}
        <button type="button" class="btn btn-primary" data-editar>${icon("edit")}Editar</button></div></div>` });
    s.el.onclick = e => {
      const b = e.target.closest("[data-ver], [data-ed], [data-elegir], [data-mover], [data-carro], [data-editar]"); if (!b) return;
      s.close();
      if (b.dataset.ver) ver(de(b.dataset.ver));
      else if (b.dataset.ed) editar(de(b.dataset.ed));
      else if (b.hasAttribute("data-elegir")) elegir(it);
      else if (b.hasAttribute("data-mover")) mover(it, b.dataset.mover);
      else if (b.hasAttribute("data-carro")) carros.length === 1 ? mover(it, carros[0].id) : elegirCarro(it, carros);
      else editar(it);
    };
  }
  const mover = (it, en) => { cambiar(items.map(i => i.id === it.id ? { ...i, en } : i)); toast(en ? `En ${de(en).nombre}` : "De vuelta en su lugar", "success"); };
  function elegirCarro(it, carros) {
    const s = openSheet({ title: "¿En qué carro?", body: `<div class="stack">${carros.map(c =>
      `<button type="button" class="btn btn-block etapa-op" data-c="${esc(c.id)}">${esc(c.nombre)}</button>`).join("")}</div>` });
    s.el.onclick = e => { const b = e.target.closest("[data-c]"); if (b) { s.close(); mover(it, b.dataset.c); } };
  }
  // Valija o carro: tildar cuáles de las herramientas ya cargadas van adentro
  function elegir(c) {
    const l = items.filter(i => !CONTENEDOR.includes(i.cat)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!l.length) return toast("Primero cargá herramientas.", "info");
    const s = openSheet({ title: `${c.cat === "carro" ? "En el carro" : "Adentro de"} ${c.nombre}`, body: `<form class="stack" id="inv-el">
      <div class="aj-lista">${l.map(i => `<label class="aj-item inv-tilde"><input type="checkbox" value="${esc(i.id)}" ${i.en === c.id ? "checked" : ""}>${miniatura(i)}
        <span class="aj-txt">${esc(i.nombre)}</span><span class="aj-val">${i.en && i.en !== c.id ? esc(dondeTxt(i)) : ""}</span></label>`).join("")}</div>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button></form>` });
    $("#inv-el", s.el).onsubmit = e => {
      e.preventDefault();
      const si = new Set($$("input:checked", s.el).map(x => x.value));
      s.close();
      cambiar(items.map(i => si.has(i.id) ? { ...i, en: c.id } : i.en === c.id ? { ...i, en: "" } : i));
    };
  }
  // Cuando la sección no se puede saber (ni por el + ni por el nombre), se pregunta al guardar
  const preguntarSeccion = () => new Promise(listo => {
    let elegida = null;
    const s = openSheet({ title: "¿En qué sección va?", onClose: () => listo(elegida), body: `<div class="stack">${Object.entries(CATS).map(([k, t]) =>
      `<button type="button" class="btn btn-block etapa-op" data-c="${k}">${t}</button>`).join("")}</div>` });
    s.el.onclick = e => { const b = e.target.closest("[data-c]"); if (b) { elegida = b.dataset.c; s.close(); } };
  });

  // Agregar o editar. La sección no se elige: es la del + que tocó, o la que dice el nombre (si escribe "Martillo…", va a Martillos)
  function editar(it) {
    const nuevo = !it.id;
    let foto = it.foto || null, cat = it.cat || null;
    const s = openSheet({ title: nuevo ? "Agregar herramienta" : "Editar herramienta", body: `<form class="stack" id="inv-f" autocomplete="off">
      <label class="field"><span>Herramienta</span><input name="nombre" list="inv-sug" required maxlength="80" value="${esc(it.nombre || "")}" placeholder="Ej: Varilla cola de ballena"></label>
      <datalist id="inv-sug">${Object.values(SUGERENCIAS).flat().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <p class="muted small inv-seccion">Sección: <b></b></p>
      <div class="inv-sugs" id="inv-sugs" aria-label="Sugerencias"></div>
      <div class="aj-fila"><label class="field"><span>Cantidad</span><input name="cant" type="number" inputmode="numeric" min="1" max="999" value="${it.cant || 1}"></label>
        <label class="field inv-ah"><span>Amperaje (Ah)</span><input name="ah" type="number" inputmode="decimal" min="0" max="9999" step="0.1" value="${it.ah ?? ""}" placeholder="Ej: 6"></label></div>
      <label class="field inv-modelo"><span></span><select name="modelo"></select></label>
      <label class="field"><span>Nota</span><input name="nota" maxlength="200" value="${esc(it.nota || "")}" placeholder="Medida, marca, estado…"></label>
      <div class="inv-foto-campo"><span id="inv-prev">${foto ? `<img class="inv-foto-grande" src="${esc(foto.url)}" alt="">` : ""}</span>
        <div class="row-btns"><label class="btn btn-ghost">${icon("camera")}${foto ? "Cambiar foto" : "Agregar foto"}<input type="file" accept="image/*" hidden id="inv-file"></label>
          <button type="button" class="btn btn-ghost" id="inv-sin-fondo" ${foto ? "" : "hidden"}>${icon("image")}Quitar fondo</button>
          <button type="button" class="btn btn-ghost" id="inv-sin-foto" ${foto ? "" : "hidden"}>Quitar foto</button>
          ${nuevo ? "" : `<button type="button" class="btn btn-ghost danger" id="inv-borrar">${icon("trash")}Borrar</button>`}</div></div>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button></form>` });
    const f = $("#inv-f", s.el), guardarBtn = f.querySelector("[type=submit]");
    // Sección, modelo (carros, valijas, lámparas y baterías) y amperaje (baterías) según la sección
    const verCampos = () => {
      $(".inv-seccion b", f).textContent = CATS[cat] || "se pregunta al guardar";
      $(".inv-ah", f).hidden = cat !== "bateria";
      const md = MODELOS[cat], antes = f.modelo.value || it.modelo;
      $(".inv-modelo", f).hidden = !md;
      if (md && $(".inv-modelo span", f).textContent !== md.t) {
        $(".inv-modelo span", f).textContent = md.t;
        f.modelo.innerHTML = md.l.map(([k, t]) => `<option value="${k}" ${k === antes ? "selected" : ""}>${t}</option>`).join("");
      }
    };
    verCampos();
    // Todas las sugerencias, de todas las secciones (primero las de la sección donde tocó +), filtradas por lo que escribe
    // Solo se filtra mientras escribe: con el nombre que ya tenía o el que eligió tocando un botón, se ven todas
    const inicial = it.cat;
    let escribio = false;
    f.nombre.addEventListener("input", () => { escribio = true; });
    const pintarSugs = () => {
      const nombre = f.nombre.value.trim().toLowerCase(), q = escribio ? nombre : "";
      const grupos = Object.entries(SUGERENCIAS).sort(([a], [b]) => (b === inicial) - (a === inicial))
        .map(([k, l]) => [k, l.filter(s => !q || s.toLowerCase().includes(q))]).filter(([, l]) => l.length);
      $("#inv-sugs", f).innerHTML = grupos.map(([k, l]) => `<div class="inv-sug-grupo"><small>${CATS[k]}</small><div class="inv-sug-chips">${l.map(s =>
        `<button type="button" class="inv-chip ${s.toLowerCase() === nombre ? "on" : ""}" data-sug="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`).join("");
    };
    $("#inv-sugs", f).onclick = e => {
      const b = e.target.closest("[data-sug]"); if (!b) return;
      escribio = false; f.nombre.value = b.dataset.sug; f.nombre.oninput();
    };
    f.nombre.oninput = () => {
      const c = catDe(f.nombre.value), ah = ahDe(f.nombre.value);
      if (c) cat = c;
      verCampos(); pintarSugs();
      if (c && MODELOS[c]) f.modelo.value = modeloDe(c, f.nombre.value);
      if (ah != null) f.ah.value = ah;
    };
    pintarSugs();
    // La foto elegida (o sin fondo) queda acá y se sube una sola vez, al guardar: así no se gasta Cloudinary en pruebas
    let pendiente = null;
    const mostrarFoto = url => {
      $("#inv-prev", f).innerHTML = url ? `<img class="inv-foto-grande" src="${esc(url)}" alt="">` : "";
      $("#inv-sin-fondo", f).hidden = $("#inv-sin-foto", f).hidden = !url;
    };
    $("#inv-file", f).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try { pendiente = await comprimir(file, 1280, 0.82, "image/webp"); mostrarFoto(URL.createObjectURL(pendiente)); }   // WebP: mantiene la transparencia
      catch (err) { toast(err.message, "error"); }
      e.target.value = "";
    };
    $("#inv-sin-fondo", f).onclick = async () => {
      const b = $("#inv-sin-fondo", f);
      busy(b, true, "Quitando fondo…"); guardarBtn.disabled = true;
      try {
        const origen = pendiente || await (await fetch(foto.url)).blob();
        const { quitarFondo } = await import("./quitarfondo.js");
        pendiente = await quitarFondo(origen);
        mostrarFoto(URL.createObjectURL(pendiente));
      } catch (err) { toast(err.message || "No se pudo quitar el fondo", "error"); }
      busy(b, false); guardarBtn.disabled = false;
    };
    $("#inv-sin-foto", f).onclick = () => { foto = null; pendiente = null; mostrarFoto(""); };
    $("#inv-borrar", f)?.addEventListener("click", async () => {
      const adentro = items.filter(i => i.en === it.id).length;
      if (!(await confirmar({ title: `¿Borrar «${it.nombre}»?`, message: adentro ? `Lo que tiene (${adentro}) vuelve a su lugar del taller.` : "", ok: "Borrar", danger: true }))) return;
      s.close();
      cambiar(items.filter(i => i.id !== it.id).map(i => i.en === it.id ? { ...i, en: "" } : i));
    });
    f.onsubmit = async e => {
      e.preventDefault();
      if (!cat && !(cat = await preguntarSeccion())) return;
      verCampos();
      if (pendiente) {
        busy(guardarBtn, true, "Subiendo foto…");
        try { foto = { url: (await subir(pendiente, `inventario/${S.user.uid}`, { nombre: f.nombre.value })).url }; }
        catch (err) { busy(guardarBtn, false); return toast(err.message, "error"); }
      }
      const cont = CONTENEDOR.includes(cat), ah = parseFloat(String(f.ah.value).replace(",", "."));
      // Sin campos vacíos (Firestore no acepta undefined); el lugar del 2D se conserva si sigue en la misma sección
      const datos = { nombre: f.nombre.value.trim(), cat, cant: Math.min(999, Math.max(1, parseInt(f.cant.value, 10) || 1)),
        en: cont ? "" : it.en || "", nota: f.nota.value.trim(), ...(MODELOS[cat] ? { modelo: f.modelo.value } : {}),
        ...(cat === "bateria" && ah > 0 ? { ah } : {}), ...(foto ? { foto } : {}), ...(it.pos && it.cat === cat ? { pos: it.pos } : {}) };
      s.close();
      if (nuevo) cambiar([...items, { id: nuevoId(), ...datos }]);
      else cambiar(items.map(i => i.id === it.id ? { id: it.id, ...datos } : i)
        .map(i => !cont && i.en === it.id ? { ...i, en: "" } : i));   // dejó de ser valija o carro: lo de adentro vuelve a su lugar
    };
  }

  // Arrastrar en el taller 2D (con el mouse directo; con el dedo, mantener apretado un momento):
  // soltar sobre una valija o un carro la guarda ahí; soltar dentro de su sección la deja en ese lugar; fuera, no cambia nada.
  // Se escucha en la página del inventario (se rearma en cada repintado, así los eventos no se acumulan).
  let arrastro = false, d = null;
  const destinoEn = (x, y) => {
    const el = document.elementFromPoint(x, y), b = el?.closest(".inv-obj"), it = b && de(b.dataset.ver);
    return !CONTENEDOR.includes(d.it.cat) && it && CONTENEDOR.includes(it.cat) && it.id !== d.it.id ? b : null;
  };
  const limpiar = () => {
    d.fant?.remove(); d.b.classList.remove("inv-llevando"); d.dest?.classList.remove("inv-destino"); d.zona?.classList.remove("inv-zona-destino");
    clearTimeout(d.t); d = null;
  };
  const escucharArrastre = pag => {
    // Vista previa con la foto real al pasar el mouse o apoyar el dedo sobre una herramienta del taller
    const previa = document.createElement("div"); previa.className = "inv-previa"; previa.hidden = true; pag.append(previa);
    const mostrarPrevia = b => {
      const it = de(b.dataset.ver); if (!it) return;
      previa.innerHTML = (it.foto?.url ? `<img src="${esc(entera(it.foto.url))}" alt="">`
        : `<span class="inv-previa-dibujo inv-${it.cat}">${dibujo(it)}</span><small>Sin foto</small>`) + `<b>${esc(it.nombre)}</b>`;
      previa.hidden = false;
      const r = b.getBoundingClientRect(), w = previa.offsetWidth, h = previa.offsetHeight;
      previa.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
      previa.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + "px";
    };
    const ocultarPrevia = () => { previa.hidden = true; };
    pag.addEventListener("pointerover", e => { const b = e.pointerType === "mouse" && !d?.fant && e.target.closest(".inv-sala .inv-obj"); if (b) mostrarPrevia(b); });
    pag.addEventListener("pointerout", e => { const b = e.target.closest(".inv-sala .inv-obj"); if (b && !b.contains(e.relatedTarget)) ocultarPrevia(); });
    pag.addEventListener("pointerdown", e => { const b = e.target.closest(".inv-sala .inv-obj"); if (b && e.pointerType !== "mouse") mostrarPrevia(b); else ocultarPrevia(); });
    pag.addEventListener("pointerup", ocultarPrevia); pag.addEventListener("pointercancel", ocultarPrevia);

    pag.addEventListener("pointerdown", e => {
      const b = e.target.closest(".inv-sala .inv-obj"), it = b && de(b.dataset.ver);
      if (!it || e.button > 0) return;
      const r = b.getBoundingClientRect();
      d = { b, it, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height,
        listo: e.pointerType === "mouse", fant: null, dest: null };
      b.setPointerCapture(e.pointerId);
      if (!d.listo) d.t = setTimeout(() => { if (d) { d.listo = true; navigator.vibrate?.(15); b.classList.add("inv-llevando"); } }, 350);
    });
    pag.addEventListener("pointermove", e => {
      if (!d) return;
      if (!d.listo) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) limpiar(); return; }   // se movió antes: era para desplazar la página
      if (!d.fant) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
        ocultarPrevia();
        d.fant = d.b.cloneNode(true); d.fant.classList.add("inv-fantasma"); d.fant.removeAttribute("style");
        d.fant.style.width = d.w + "px"; d.fant.style.height = d.h + "px";
        document.body.append(d.fant); d.b.classList.add("inv-llevando");
      }
      d.fant.style.left = (e.clientX - d.ox) + "px"; d.fant.style.top = (e.clientY - d.oy) + "px";
      const b = destinoEn(e.clientX, e.clientY);
      if (b !== d.dest) { d.dest?.classList.remove("inv-destino"); b?.classList.add("inv-destino"); d.dest = b; }
      // Si va a otra sección, se marca esa sección (valijas y carros no cambian de sección)
      let zn = b ? null : document.elementFromPoint(e.clientX, e.clientY)?.closest(".inv-sala .inv-zona");
      if (zn === d.b.closest(".inv-zona") || CONTENEDOR.includes(d.it.cat)) zn = null;
      if (zn !== d.zona) { d.zona?.classList.remove("inv-zona-destino"); zn?.classList.add("inv-zona-destino"); d.zona = zn; }
    });
    const terminar = e => {
      if (!d) return;
      if (!(d.fant && e.type === "pointerup")) return limpiar();
      arrastro = true; setTimeout(() => { arrastro = false; });   // que el click de soltar no abra la herramienta
      const it = d.it, cont = destinoEn(e.clientX, e.clientY), g = d.fant.getBoundingClientRect();
      // Sección donde se soltó: otra (pasa a esa sección; valijas y carros no, por lo que llevan adentro) o la suya
      const otraZona = document.elementFromPoint(e.clientX, e.clientY)?.closest(".inv-sala .inv-zona");
      const zonaEl = otraZona && otraZona !== d.b.closest(".inv-zona") && !CONTENEDOR.includes(it.cat) ? otraZona : d.b.closest(".inv-zona");
      const objs = zonaEl.querySelector(".inv-objs"), z = objs.getBoundingClientRect(), sec = zonaEl.getBoundingClientRect(), M = 40;
      // Dónde están apoyadas las otras herramientas de esa sección (en px), para no encimarlas
      const otros = [...objs.querySelectorAll(":scope > .inv-obj")].filter(o => o !== d.b)
        .map(o => ({ x: parseFloat(o.style.left) / 100 * z.width, y: parseFloat(o.style.top) / 100 * z.height }));
      limpiar();
      if (cont) return mover(it, cont.dataset.ver);
      // En la sección (o apenas afuera): el punto de apoyo (abajo al centro) se encastra en la grilla, dentro del recuadro
      const cx = g.left + g.width / 2, cy = g.bottom;
      if (e.clientX < sec.left - M || e.clientX > sec.right + M || e.clientY < sec.top - M || e.clientY > sec.bottom + M) return;   // lejos: queda donde estaba
      const p = encastrar(cx - z.left, cy - z.top, z.width, z.height, g.width / 2, Math.min(z.height, g.height), otros);
      const pos = { x: +(p.x / z.width).toFixed(4), y: +(p.y / z.height).toFixed(4) }, cat = zonaEl.dataset.zona;
      if (cat === it.cat) return cambiar(items.map(i => i.id === it.id ? { ...i, pos } : i));
      // Cambió de sección: el modelo y el amperaje solo quedan si la nueva sección los usa
      const { modelo, ah, ...resto } = it;
      cambiar(items.map(i => i.id === it.id ? { ...resto, cat, pos, ...(MODELOS[cat] ? { modelo: modeloDe(cat, it.nombre) } : {}), ...(cat === "bateria" && ah ? { ah } : {}) } : i));
      toast(`Movida a ${CATS[cat]}`, "success");
    };
    pag.addEventListener("pointerup", terminar); pag.addEventListener("pointercancel", terminar);
    // Con el dedo, mientras se lleva una herramienta la página no se desplaza
    // Mover una sección (agarrándola del ⠿) o cambiarle el tamaño (esquina de abajo a la derecha), siempre dentro del taller.
    // Se guarda en % del taller, redondeado a medio punto para que se alineen fácil.
    let sz = null;
    const MEDIO = v => Math.round(v * 2) / 2;
    pag.addEventListener("pointerdown", e => {
      const h = e.target.closest(".inv-mover, .inv-redim"); if (!h) return;
      e.stopPropagation(); e.preventDefault(); ocultarPrevia();
      const el = h.closest(".inv-zona"), s = el.parentElement.getBoundingClientRect(), cat = el.dataset.zona;
      sz = { el, cat, redim: h.classList.contains("inv-redim"), x: e.clientX, y: e.clientY, W: s.width, H: s.height, r0: { ...rectDe(cat) }, r: { ...rectDe(cat) } };
      h.setPointerCapture(e.pointerId); el.classList.add("inv-zona-moviendo");
    }, true);
    pag.addEventListener("pointermove", e => {
      if (!sz) return;
      e.stopPropagation();
      const dx = (e.clientX - sz.x) / sz.W * 100, dy = (e.clientY - sz.y) / sz.H * 100, r0 = sz.r0;
      const minW = Math.min(100, 90 / sz.W * 100), minH = Math.min(100, 70 / sz.H * 100);   // nunca más chica que ~90 × 70 px
      sz.r = sz.redim
        ? { ...r0, w: MEDIO(lim(r0.w + dx, minW, 100 - r0.x)), h: MEDIO(lim(r0.h + dy, minH, 100 - r0.y)) }
        : { ...r0, x: MEDIO(lim(r0.x + dx, 0, 100 - r0.w)), y: MEDIO(lim(r0.y + dy, 0, 100 - r0.h)) };
      Object.assign(sz.el.style, { left: sz.r.x + "%", top: sz.r.y + "%", width: sz.r.w + "%", height: sz.r.h + "%" });
    }, true);
    const soltarSeccion = e => {
      if (!sz) return;
      e.stopPropagation();
      const { cat, r, r0, el } = sz; sz = null; el.classList.remove("inv-zona-moviendo");
      arrastro = true; setTimeout(() => { arrastro = false; });
      if (JSON.stringify(r) === JSON.stringify(r0)) return;
      secciones = { ...secciones, [disp()]: { ...(secciones?.[disp()] || {}), [cat]: r } };
      pintar(); guardar();
    };
    pag.addEventListener("pointerup", soltarSeccion, true); pag.addEventListener("pointercancel", soltarSeccion, true);

    // Agrandar o achicar una foto (modo Foto): el tirador de la esquina (hacia arriba o la derecha agranda) o la rueda del mouse.
    // Va en la fase de captura para ganarle al arrastre de la herramienta.
    let rz = null, tRueda = 0;
    const guardarTam = (it, lado) => cambiar(items.map(i => i.id === it.id ? { ...i, tam: +(lado / FOTO).toFixed(2) } : i));
    pag.addEventListener("pointerdown", e => {
      const h = e.target.closest(".inv-tam"); if (!h) return;
      e.stopPropagation(); e.preventDefault();
      const b = h.closest(".inv-obj"), img = b.querySelector(".inv-obj-foto");
      rz = { it: de(b.dataset.ver), img, x: e.clientX, y: e.clientY, base: img.offsetWidth, lado: img.offsetWidth };
      h.setPointerCapture(e.pointerId); ocultarPrevia();
    }, true);
    pag.addEventListener("pointermove", e => {
      if (!rz) return;
      e.stopPropagation();
      rz.lado = Math.round(lim(rz.base + (e.clientX - rz.x) - (e.clientY - rz.y), TAM_MIN, TAM_MAX));
      rz.img.style.width = rz.img.style.height = rz.lado + "px";
    }, true);
    const soltarTam = e => {
      if (!rz) return;
      e.stopPropagation();
      const { it, lado, base } = rz; rz = null;
      arrastro = true; setTimeout(() => { arrastro = false; });   // que soltar el tirador no abra la herramienta
      if (lado !== base) guardarTam(it, lado);
    };
    pag.addEventListener("pointerup", soltarTam, true); pag.addEventListener("pointercancel", soltarTam, true);
    pag.addEventListener("wheel", e => {
      const b = e.target.closest(".inv-sala .inv-obj"), img = b?.querySelector(".inv-obj-foto"); if (!img) return;
      e.preventDefault();
      const lado = Math.round(lim(img.offsetWidth * (e.deltaY < 0 ? 1.1 : 1 / 1.1), TAM_MIN, TAM_MAX));
      img.style.width = img.style.height = lado + "px";
      clearTimeout(tRueda); tRueda = setTimeout(() => guardarTam(de(b.dataset.ver), lado), 450);   // se guarda cuando deja de girar
    }, { passive: false });
    pag.addEventListener("touchmove", e => { if (d?.listo || rz || sz) e.preventDefault(); }, { passive: false });
    pag.addEventListener("contextmenu", e => { if (e.target.closest(".inv-sala .inv-obj")) e.preventDefault(); });
  };

  pintar();
}
