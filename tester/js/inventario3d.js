// Inventario en 3D: el mismo taller (pared perforada, mesa, valijas, pantallas de pie) con cámara fija.
// No se camina: tocar una herramienta la abre; mover el mouse/dedo inclina un poco la vista.
const URLS = ["https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "https://unpkg.com/three@0.160.0/build/three.module.js"];
let cargando = null;
const cargarThree = () => cargando ||= (async () => {
  for (const u of URLS) { try { return await import(u); } catch { /* probar el otro CDN */ } }
  cargando = null; throw new Error("No se pudo cargar el 3D. Revisá la conexión.");
})();

const COLOR = { varilla: 0xc4cad3, martillo: 0xe2a93a, pantalla: 0xf2f4f7, pie: 0xf2f4f7, pegamento: 0xec6a38, desmontaje: 0x4ea2e4, limpieza: 0x4fbf92, otro: 0x9d92d4, valija: 0x56606c };
const largo = id => 0.9 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38) / 60;   // varillas de distinto largo, siempre igual para la misma

// Devuelve una función para desarmar la escena
export async function montar3D(el, items, alTocar) {
  const T = await cargarThree();
  if (!el.isConnected) return () => {};
  const canvasTex = (w, h, dibujar, rep) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; dibujar(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...rep); }
    return t;
  };
  const texPerforada = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#4a4e55"; g.fillRect(0, 0, w, h); g.fillStyle = "#1c1e21"; g.beginPath(); g.arc(w / 2, h / 2, 6, 0, 7); g.fill(); }, [26, 12]);
  const texRayas = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#f4f6f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#15171a"; for (let y = 4; y < h; y += 16) g.fillRect(0, y, w, 8); });
  const texPared = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#3b3f44"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "0,0,0" : "255,255,255"},${Math.random() * .06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }, [3, 2]);
  const texPiso = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#2a2c30"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [6, 9]);

  const escena = new T.Scene();
  escena.background = new T.Color(0x16171a);
  escena.fog = new T.Fog(0x16171a, 7, 13);
  const camara = new T.PerspectiveCamera(48, 1, 0.1, 40);
  const render = new T.WebGLRenderer({ antialias: true });
  render.setPixelRatio(Math.min(devicePixelRatio, 2));
  render.shadowMap.enabled = true; render.shadowMap.type = T.PCFSoftShadowMap;
  render.toneMapping = T.ACESFilmicToneMapping;
  el.prepend(render.domElement);

  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .7, metalness: .1, ...extra });
  const caja = (w, h, d, m) => { const x = new T.Mesh(new T.BoxGeometry(w, h, d), m); x.castShadow = x.receiveShadow = true; return x; };
  const cil = (r, h, m, seg = 16) => { const x = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m); x.castShadow = true; return x; };
  const en = (obj, x, y, z, rx = 0, ry = 0, rz = 0) => { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; };

  // ── La habitación ──
  const pared = new T.Mesh(new T.PlaneGeometry(7, 3.4), mat(0xffffff, { map: texPared, roughness: .95 }));
  pared.position.set(0, 1.7, 0); pared.receiveShadow = true; escena.add(pared);
  const lateral = new T.Mesh(new T.PlaneGeometry(10, 3.4), mat(0xffffff, { map: texPared, roughness: .95 }));
  lateral.position.set(-3.5, 1.7, 5); lateral.rotation.y = Math.PI / 2; lateral.receiveShadow = true; escena.add(lateral);
  const piso = new T.Mesh(new T.PlaneGeometry(7, 10), mat(0xffffff, { map: texPiso, roughness: .9 }));
  piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0, 5); piso.receiveShadow = true; escena.add(piso);
  const columna = caja(0.5, 3.4, 0.5, mat(0x5a4038, { roughness: .8 })); escena.add(en(columna, 3.25, 1.7, 0.25));
  for (const y of [0.6, 2.6]) escena.add(en(caja(0.52, 0.08, 0.52, mat(0x8a5a40)), 3.25, y, 0.25));
  // Tablero perforado y tubos de luz
  const tablero = caja(3.9, 1.85, 0.03, mat(0xffffff, { map: texPerforada, roughness: .8 }));
  escena.add(en(tablero, -0.75, 2.05, 0.02));
  for (const x of [-1.8, 0.3]) {
    escena.add(en(caja(1.5, 0.05, 0.08, new T.MeshStandardMaterial({ color: 0xffe0b8, emissive: 0xffd2a0, emissiveIntensity: 2.2 })), x, 3.12, 0.12));
  }
  // Mesa de trabajo (tapa, patas y estante de abajo)
  const metal = mat(0x6c7178, { metalness: .6, roughness: .45 });
  escena.add(en(caja(4.0, 0.07, 0.85, mat(0x9aa0a8, { metalness: .3, roughness: .55 })), -0.75, 0.95, 0.5));
  for (const x of [-2.68, 1.18]) for (const z of [0.15, 0.85]) escena.add(en(caja(0.06, 0.92, 0.06, metal), x, 0.46, z));
  escena.add(en(caja(3.9, 0.04, 0.75, metal), -0.75, 0.18, 0.5));

  // ── Luces: cálida desde arriba y un toque naranja al costado, como un taller de noche ──
  escena.add(new T.HemisphereLight(0xcfd8e6, 0x2a2420, 0.9));
  const foco = new T.SpotLight(0xffe2c0, 60, 0, 0.95, 0.6, 2);
  foco.position.set(-0.6, 3.4, 2.2); foco.target.position.set(-0.6, 0.8, 0.2);
  foco.castShadow = true; foco.shadow.mapSize.set(1024, 1024); foco.shadow.bias = -0.0004;
  escena.add(foco, foco.target);
  const naranja = new T.PointLight(0xff7a33, 9, 0, 2); naranja.position.set(2.7, 2.3, 1.3); escena.add(naranja);

  // ── Las herramientas ── (cada una es un grupo con userData.id para poder tocarla)
  const tocables = [];
  const dibujo = {
    varilla: (m, i) => { const g = new T.Group(), L = largo(i.id);
      g.add(en(cil(0.012, L, m, 8), 0, -L / 2, 0)); g.add(en(cil(0.02, 0.16, m, 8), 0, 0, 0, 0, 0, Math.PI / 2));
      g.add(en(cil(0.012, 0.12, m, 8), 0.04, -L, 0, 0, 0, Math.PI / 3)); return g; },
    martillo: m => { const g = new T.Group();
      g.add(en(cil(0.045, 0.16, m), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.015, 0.34, mat(0x2b2b2e)), 0, -0.19, 0)); return g; },
    pantalla: () => { const g = new T.Group();
      g.add(caja(0.32, 0.4, 0.025, mat(0xffffff, { map: texRayas, emissive: 0xffffff, emissiveMap: texRayas, emissiveIntensity: .35 })));
      g.add(en(cil(0.018, 0.16, mat(0x222326)), 0, -0.27, 0)); return g; },
    pie: () => { const g = new T.Group();
      g.add(en(caja(0.55, 0.65, 0.03, mat(0xffffff, { map: texRayas, emissive: 0xffffff, emissiveMap: texRayas, emissiveIntensity: .4 })), 0, 1.45, 0));
      g.add(en(cil(0.02, 1.15, metal), 0, 0.6, 0));
      for (const a of [0, 2.1, 4.2]) g.add(en(cil(0.012, 0.42, metal), Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7));
      return g; },
    pegamento: m => { const g = new T.Group();
      g.add(caja(0.22, 0.07, 0.06, m)); g.add(en(caja(0.05, 0.13, 0.05, m), -0.05, -0.08, 0, 0, 0, 0.3));
      g.add(en(cil(0.008, 0.06, mat(0x333333), 8), 0.13, 0.01, 0, 0, 0, Math.PI / 2)); g.position.y = 0.12; return g; },
    desmontaje: m => { const g = new T.Group();
      g.add(en(cil(0.022, 0.11, m), -0.08, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.006, 0.18, metal, 8), 0.06, 0, 0, 0, 0, Math.PI / 2));
      g.position.y = 0.025; g.rotation.y = 0.5; return g; },
    limpieza: m => { const g = new T.Group();
      g.add(en(cil(0.045, 0.2, m), 0, 0.1, 0)); g.add(en(caja(0.04, 0.04, 0.05, mat(0xeeeeee)), 0, 0.22, 0.01));
      g.add(en(caja(0.02, 0.05, 0.02, mat(0xeeeeee)), 0, 0.19, 0.04)); return g; },
    otro: m => { const g = new T.Group(); g.add(en(caja(0.18, 0.1, 0.14, m), 0, 0.05, 0)); return g; },
    valija: m => { const g = new T.Group();
      g.add(en(caja(0.55, 0.14, 0.38, m), 0, 0.07, 0)); g.add(en(caja(0.56, 0.02, 0.39, mat(0xff8a3d, { roughness: .5 })), 0, 0.1, 0));
      g.add(en(caja(0.14, 0.03, 0.03, mat(0x222222)), 0, 0.07, 0.205)); return g; }
  };
  const poner = (i, x, y, z) => {
    const m = mat(COLOR[i.cat], i.cat === "varilla" ? { metalness: .85, roughness: .3 } : {});
    const g = dibujo[i.cat](m, i); g.position.x += x; g.position.y += y; g.position.z += z;
    g.userData = { id: i.id, nombre: i.nombre, cant: i.cant || 1 };
    escena.add(g); tocables.push(g);
  };
  const de = cat => items.filter(i => i.cat === cat && !i.en);
  // Pared: varillas a la izquierda, martillos al medio, pantallas a la derecha
  de("varilla").forEach((i, k, l) => poner(i, -2.55 + k * Math.min(0.11, 1.35 / l.length), 2.85, 0.07));
  de("martillo").forEach((i, k) => poner(i, -1.0 + (k % 4) * 0.22, 2.7 - Math.floor(k / 4) * 0.62, 0.09));
  de("pantalla").forEach((i, k) => poner(i, 0.0 + (k % 3) * 0.36, 2.65 - Math.floor(k / 3) * 0.6, 0.06));
  // Mesa: cada tipo en su tramo, en filas hacia el frente
  ["pegamento", "desmontaje", "limpieza", "otro"].forEach((cat, t) =>
    de(cat).forEach((i, k) => poner(i, -2.5 + t * 0.95 + (k % 3) * 0.28, 0.985, 0.3 + Math.floor(k / 3) % 3 * 0.22)));
  // Valijas: debajo de la mesa, apiladas de a tres
  de("valija").forEach((i, k) => poner(i, -2.3 + Math.floor(k / 3) * 0.65, 0.2 + (k % 3) * 0.16, 0.5));
  // Pantallas de pie: a la derecha, sobre el piso
  de("pie").forEach((i, k) => poner(i, 1.75 + (k % 3) * 0.55, 0, 0.9 + Math.floor(k / 3) * 0.6));

  // ── Cámara fija, con una leve inclinación según el puntero ──
  const base = new T.Vector3(-0.3, 1.75, 4.3), mira = new T.Vector3(-0.3, 1.3, 0);
  let nx = 0, ny = 0, cx = 0, cy = 0;
  const tip = el.querySelector(".inv-3d-tip");
  const ray = new T.Raycaster(), p = new T.Vector2();
  let sobre = null;
  const tocado = e => {
    const r = render.domElement.getBoundingClientRect();
    p.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camara);
    let o = ray.intersectObjects(tocables, true)[0]?.object;
    while (o && !o.userData.id) o = o.parent;
    return o || null;
  };
  const resaltar = (g, on) => g?.traverse(o => { if (o.material?.emissive && !o.material.emissiveMap) o.material.emissive.setHex(on ? 0x553311 : 0); });
  const mover = e => {
    const r = render.domElement.getBoundingClientRect();
    nx = ((e.clientX - r.left) / r.width - .5) * 2; ny = ((e.clientY - r.top) / r.height - .5) * 2;
    const g = tocado(e);
    if (g !== sobre) { resaltar(sobre, false); resaltar(g, true); sobre = g; }
    render.domElement.style.cursor = g ? "pointer" : "";
    if (tip) { tip.hidden = !g; if (g) { tip.textContent = g.userData.nombre + (g.userData.cant > 1 ? ` ×${g.userData.cant}` : ""); tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px"; } }
  };
  let ini = null;
  const abajo = e => { ini = [e.clientX, e.clientY]; };
  const arriba = e => {
    if (!ini || Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) > 8) return;
    const g = tocado(e); if (g) alTocar(g.userData.id);
  };
  const fuera = () => { nx = ny = 0; resaltar(sobre, false); sobre = null; if (tip) tip.hidden = true; };
  const c = render.domElement;
  c.addEventListener("pointermove", mover); c.addEventListener("pointerdown", abajo); c.addEventListener("pointerup", arriba); c.addEventListener("pointerleave", fuera);

  // La cámara se aleja lo justo para que entren la pared y la mesa a lo ancho (en vertical queda más lejos)
  const medir = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    render.setSize(w, h, false); camara.aspect = w / h; camara.updateProjectionMatrix();
    const ancho = w / h < 1 ? 4.4 : 6.4, centro = w / h < 1 ? -0.75 : -0.3;
    base.z = Math.min(9, Math.max(4.3, ancho / 2 / (Math.tan(camara.fov * Math.PI / 360) * camara.aspect) + 0.6));
    base.x = mira.x = centro;
    escena.fog.near = base.z + 2; escena.fog.far = base.z + 9;
  };
  const ro = new ResizeObserver(medir); ro.observe(el); medir();
  let vivo = true;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cuadro = () => {
    if (!vivo) return;
    if (!el.isConnected) return desarmar();
    if (!quieto) { cx += (nx - cx) * .06; cy += (ny - cy) * .06; }
    camara.position.set(base.x + cx * 0.35, base.y - cy * 0.15, base.z);
    camara.lookAt(mira);
    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  };
  function desarmar() {
    if (!vivo) return; vivo = false; ro.disconnect();
    escena.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    render.dispose(); c.remove();
  }
  cuadro();
  return desarmar;
}
