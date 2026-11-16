// Inventario en 3D: el taller (pared perforada, mesa, valijas, lámparas) y los carros con lo que el técnico puso en cada uno.
// Arrastrar gira la vista, la rueda o el pellizco acerca, WASD / flechas desplazan; tocar una herramienta la abre.
const URLS = ["https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "https://unpkg.com/three@0.160.0/build/three.module.js"];
let cargando = null;
const cargarThree = () => cargando ||= (async () => {
  for (const u of URLS) { try { return await import(u); } catch { /* probar el otro CDN */ } }
  cargando = null; throw new Error("No se pudo cargar el 3D. Revisá la conexión.");
})();

const COLOR = { varilla: 0xc4cad3, martillo: 0xe2a93a, inercial: 0xec6a38, gancho: 0x4ea2e4, lampara: 0xf2f4f7, carro: 0x232427, valija: 0x56606c, desmontaje: 0x4fbf92, varios: 0x9d92d4 };
const largo = id => 0.9 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38) / 60;   // varillas de distinto largo, siempre igual para la misma
const lim = (v, a, b) => Math.max(a, Math.min(b, v));

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
  const agujeros = (fondo, hueco) => (g, w, h) => { g.fillStyle = fondo; g.fillRect(0, 0, w, h); g.fillStyle = hueco; g.beginPath(); g.arc(w / 2, h / 2, 6, 0, 7); g.fill(); };
  const texPerforada = canvasTex(64, 64, agujeros("#4a4e55", "#1c1e21"), [26, 12]);
  const texRejilla = canvasTex(64, 64, agujeros("#c9ced6", "#2a2c30"), [14, 2]);
  const texRayas = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#f4f6f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#15171a"; for (let y = 4; y < h; y += 16) g.fillRect(0, y, w, 8); });
  const ruido = (base, n, a) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "0,0,0" : "255,255,255"},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  };
  const texPared = canvasTex(256, 256, ruido("#3b3f44", 2200, .06), [3, 2]);
  const texPiso = canvasTex(256, 256, (g, w, h) => { ruido("#2a2c30", 1500, .04)(g, w, h); g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [6, 9]);

  const escena = new T.Scene();
  escena.background = new T.Color(0x16171a);
  escena.fog = new T.Fog(0x16171a, 7, 14);
  const camara = new T.PerspectiveCamera(50, 1, 0.05, 40);
  const render = new T.WebGLRenderer({ antialias: true });
  render.setPixelRatio(Math.min(devicePixelRatio, 2));
  render.shadowMap.enabled = true; render.shadowMap.type = T.PCFSoftShadowMap;
  render.toneMapping = T.ACESFilmicToneMapping;
  const c = render.domElement; c.tabIndex = 0; c.setAttribute("aria-label", "Taller en 3D");
  el.prepend(c);

  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .7, metalness: .1, ...extra });
  const metal = () => mat(0x6c7178, { metalness: .6, roughness: .45 });
  const plastico = () => mat(0x232427, { roughness: .85 });
  const caja = (w, h, d, m) => { const x = new T.Mesh(new T.BoxGeometry(w, h, d), m); x.castShadow = x.receiveShadow = true; return x; };
  const cil = (r, h, m, seg = 16) => { const x = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), m); x.castShadow = true; return x; };
  const en = (obj, x, y, z, rx = 0, ry = 0, rz = 0) => { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; };
  const rueda = (g, x, z) => g.add(en(cil(0.045, 0.035, mat(0x9aa0a8, { metalness: .5 })), x, 0.045, z, 0, 0, Math.PI / 2));

  // ── La habitación ──
  const plano = (w, h, m) => { const x = new T.Mesh(new T.PlaneGeometry(w, h), m); x.receiveShadow = true; return x; };
  escena.add(en(plano(7, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), 0, 1.7, 0));
  escena.add(en(plano(10, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), -3.5, 1.7, 5, 0, Math.PI / 2));
  escena.add(en(plano(10, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), 3.5, 1.7, 5, 0, -Math.PI / 2));
  escena.add(en(plano(7, 10, mat(0xffffff, { map: texPiso, roughness: .9 })), 0, 0, 5, -Math.PI / 2));
  escena.add(en(caja(0.5, 3.4, 0.5, mat(0x5a4038, { roughness: .8 })), 3.25, 1.7, 0.25));
  for (const y of [0.6, 2.6]) escena.add(en(caja(0.52, 0.08, 0.52, mat(0x8a5a40)), 3.25, y, 0.25));
  escena.add(en(caja(3.9, 1.85, 0.03, mat(0xffffff, { map: texPerforada, roughness: .8 })), -0.75, 2.05, 0.02));
  for (const x of [-1.8, 0.3]) escena.add(en(caja(1.5, 0.05, 0.08, new T.MeshStandardMaterial({ color: 0xffe0b8, emissive: 0xffd2a0, emissiveIntensity: 2.2 })), x, 3.12, 0.12));
  // Mesa de trabajo (tapa, patas y estante de abajo)
  const mMesa = metal();
  escena.add(en(caja(4.0, 0.07, 0.85, mat(0x9aa0a8, { metalness: .3, roughness: .55 })), -0.75, 0.95, 0.5));
  for (const x of [-2.68, 1.18]) for (const z of [0.15, 0.85]) escena.add(en(caja(0.06, 0.92, 0.06, mMesa), x, 0.46, z));
  escena.add(en(caja(3.9, 0.04, 0.75, mMesa), -0.75, 0.18, 0.5));

  // ── Luces: cálida desde arriba y un toque naranja al costado, como un taller de noche ──
  escena.add(new T.HemisphereLight(0xcfd8e6, 0x2a2420, 0.9));
  const foco = new T.SpotLight(0xffe2c0, 70, 0, 1.0, 0.6, 2);
  foco.position.set(-0.3, 3.4, 2.6); foco.target.position.set(-0.3, 0.6, 0.8);
  foco.castShadow = true; foco.shadow.mapSize.set(1024, 1024); foco.shadow.bias = -0.0004;
  escena.add(foco, foco.target);
  const naranja = new T.PointLight(0xff7a33, 9, 0, 2); naranja.position.set(2.7, 2.3, 1.3); escena.add(naranja);

  // ── Las herramientas ── (cada una es un grupo con userData.id para poder tocarla)
  const tocables = [];
  const dibujos = {
    varilla: (m, i) => { const g = new T.Group(), L = largo(i.id);
      g.add(en(cil(0.012, L, m, 8), 0, -L / 2, 0)); g.add(en(cil(0.02, 0.16, m, 8), 0, 0, 0, 0, 0, Math.PI / 2));
      g.add(en(cil(0.012, 0.12, m, 8), 0.04, -L, 0, 0, 0, Math.PI / 3)); return g; },
    martillo: m => { const g = new T.Group();
      g.add(en(cil(0.045, 0.16, m), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.015, 0.34, mat(0x2b2b2e)), 0, -0.19, 0)); return g; },
    gancho: m => { const g = new T.Group();
      g.add(en(cil(0.01, 0.4, m, 8), 0, -0.2, 0)); g.add(en(new T.Mesh(new T.TorusGeometry(0.06, 0.01, 8, 16, Math.PI), m), 0.06, -0.4, 0, 0, 0, Math.PI)); return g; },
    inercial: m => { const g = new T.Group();   // martillo inercial acostado: barra, pesa y manija en T
      g.add(en(cil(0.01, 0.55, metal(), 8), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.035, 0.12, m), 0.05, 0, 0, 0, 0, Math.PI / 2));
      g.add(en(cil(0.015, 0.14, m), -0.28, 0, 0)); g.position.y = 0.035; g.rotation.y = 0.35; return g; },
    lampara: (m, i, chica) => { const g = new T.Group(), luz = mat(0xffffff, { map: texRayas, emissive: 0xffffff, emissiveMap: texRayas, emissiveIntensity: .4 });
      if (chica) { g.add(en(caja(0.3, 0.02, 0.22, luz), 0, 0.02, 0)); return g; }   // en un carro: la pantalla acostada
      g.add(en(caja(0.55, 0.65, 0.03, luz), 0, 1.45, 0)); g.add(en(cil(0.02, 1.15, metal()), 0, 0.6, 0));
      for (const a of [0, 2.1, 4.2]) g.add(en(cil(0.012, 0.42, metal()), Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7));
      return g; },
    desmontaje: m => { const g = new T.Group();
      g.add(en(cil(0.022, 0.11, m), -0.08, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.006, 0.18, metal(), 8), 0.06, 0, 0, 0, 0, Math.PI / 2));
      g.position.y = 0.025; g.rotation.y = 0.5; return g; },
    varios: m => { const g = new T.Group(); g.add(en(caja(0.16, 0.1, 0.13, m), 0, 0.05, 0)); return g; },
    valija: m => { const g = new T.Group();
      g.add(en(caja(0.55, 0.14, 0.38, m), 0, 0.07, 0)); g.add(en(caja(0.56, 0.02, 0.39, mat(0xff8a3d, { roughness: .5 })), 0, 0.1, 0));
      g.add(en(caja(0.14, 0.03, 0.03, mat(0x222222)), 0, 0.07, 0.205)); return g; },
    carro: (m, i) => i.modelo === "alto" ? carroAlto(m) : carroComun(m)
  };
  // Carro común (tipo utilitario, 16:9): dos bandejas, y arriba unas plaquetas perforadas que sobresalen para colgar varillas
  function carroComun(m) {
    const g = new T.Group(), W = 1.0, D = 0.56;
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) { g.add(en(cil(0.03, 0.86, m), x, 0.5, z)); rueda(g, x, z); }
    const bandeja = (y, alto) => {
      g.add(en(caja(W, 0.03, D, m), 0, y, 0));
      for (const z of [-D / 2, D / 2]) g.add(en(caja(W, alto, 0.03, m), 0, y + alto / 2, z));
      for (const x of [-W / 2, W / 2]) g.add(en(caja(0.03, alto, D, m), x, y + alto / 2, 0));
    };
    bandeja(0.82, 0.13); bandeja(0.24, 0.09);
    for (const z of [-1, 1]) g.add(en(caja(W + 0.12, 0.015, 0.13, mat(0xffffff, { map: texRejilla, metalness: .4, roughness: .5 })), 0, 0.95, z * (D / 2 + 0.065)));
    g.userData.lugar = { colgar: { y: 0.95, xs: [-W / 2, W / 2], zs: [-(D / 2 + 0.07), D / 2 + 0.07] }, estantes: [{ y: 0.835, w: W - 0.14, d: D - 0.14 }, { y: 0.255, w: W - 0.14, d: D - 0.14 }] };
    return g;
  }
  // Carro alto: base con ruedas, un estante en el medio y la bandeja arriba (espuma azul y bordes perforados para colgar)
  function carroAlto(m) {
    const g = new T.Group(), W = 0.78, D = 0.58, mt = metal();
    for (const z of [-0.25, 0.25]) g.add(en(caja(0.7, 0.04, 0.05, mt), 0, 0.08, z));
    g.add(en(caja(0.05, 0.04, 0.55, mt), 0, 0.08, 0));
    for (const x of [-0.33, 0.33]) for (const z of [-0.25, 0.25]) rueda(g, x, z);
    g.add(en(cil(0.025, 1.12, mt), 0, 0.66, -0.12));
    g.add(en(caja(0.55, 0.03, 0.42, m), 0, 0.55, 0.02));
    g.add(en(caja(W, 0.03, D, m), 0, 1.22, 0));
    for (const [x, w] of [[-0.18, 0.22], [0.12, 0.22]]) g.add(en(caja(w, 0.035, 0.2, mat(0x2b6fd6, { roughness: .9 })), x, 1.245, -0.1));
    for (const z of [-1, 1]) g.add(en(caja(W + 0.1, 0.015, 0.1, mat(0xffffff, { map: texRejilla, metalness: .4, roughness: .5 })), 0, 1.24, z * (D / 2 + 0.05)));
    g.userData.lugar = { colgar: { y: 1.24, xs: [-W / 2, W / 2], zs: [-(D / 2 + 0.06), D / 2 + 0.06] }, estantes: [{ y: 1.24, w: W - 0.16, d: D - 0.2, z: 0.08 }, { y: 0.57, w: 0.45, d: 0.32 }] };
    return g;
  }

  const poner = (i, x, y, z, padre = escena, chica = false) => {
    const m = mat(COLOR[i.cat] ?? COLOR.varios, i.cat === "varilla" ? { metalness: .85, roughness: .3 } : i.cat === "carro" ? { roughness: .85 } : {});
    const g = (dibujos[i.cat] || dibujos.varios)(m, i, chica);
    g.position.x += x; g.position.y += y; g.position.z += z;
    g.userData = { ...g.userData, id: i.id, nombre: i.nombre, cant: i.cant || 1 };
    padre.add(g); tocables.push(g);
    return g;
  };
  const sueltas = cat => items.filter(i => i.cat === cat && items.find(x => x.id === i.en)?.cat !== "valija");   // lo del carro se ve en la pared y también en el carro
  // Pared: varillas a la izquierda, martillos y punzones al medio, ganchos a la derecha
  sueltas("varilla").forEach((i, k, l) => poner(i, -2.55 + k * Math.min(0.11, 1.35 / l.length), 2.85, 0.07));
  sueltas("martillo").forEach((i, k) => poner(i, -1.0 + (k % 4) * 0.22, 2.7 - Math.floor(k / 4) * 0.62, 0.09));
  sueltas("gancho").forEach((i, k) => poner(i, 0.05 + (k % 4) * 0.24, 2.75 - Math.floor(k / 4) * 0.62, 0.07));
  // Mesa: cada tipo en su tramo, en filas hacia el frente
  ["inercial", "desmontaje", "varios"].forEach((cat, t) =>
    sueltas(cat).forEach((i, k) => poner(i, -2.45 + t * 1.3 + (k % 4) * 0.28, 0.985, 0.3 + Math.floor(k / 4) % 3 * 0.22)));
  // Valijas: debajo de la mesa, apiladas de a tres
  sueltas("valija").forEach((i, k) => poner(i, -2.3 + Math.floor(k / 3) * 0.65, 0.2 + (k % 3) * 0.16, 0.5));
  // Lámparas: a la derecha, sobre el piso
  sueltas("lampara").forEach((i, k) => poner(i, 1.75 + (k % 3) * 0.55, 0, 0.9 + Math.floor(k / 3) * 0.6));
  // Carros: adelante, con lo que el técnico puso en cada uno
  const LUGARES = [[2.0, 2.3, -0.5], [-2.4, 2.5, 0.4], [0.1, 3.2, 0], [-0.9, 2.2, 0.2], [1.3, 3.6, -0.3]];
  items.filter(i => i.cat === "carro").forEach((cr, k) => {
    const [x, z, giro] = LUGARES[k % LUGARES.length];
    const g = poner(cr, x, 0, z + Math.floor(k / LUGARES.length) * 1.2); g.rotation.y = giro;
    const { colgar, estantes } = g.userData.lugar, dentro = items.filter(i => i.en === cr.id);
    // Varillas colgadas del borde (adelante y atrás); el resto acostado en los estantes, de arriba hacia abajo
    dentro.filter(i => i.cat === "varilla").forEach((i, n, l) => {
      const lado = n % 2, porLado = Math.ceil(l.length / 2), paso = Math.min(0.07, (colgar.xs[1] - colgar.xs[0] - 0.1) / Math.max(1, porLado - 1));
      const v = poner(i, colgar.xs[0] + 0.05 + Math.floor(n / 2) * paso, colgar.y, colgar.zs[lado], g);
      v.rotation.y = Math.PI / 2; v.scale.y = lim((colgar.y - 0.12) / largo(i.id), 0.4, 1);
    });
    let n = 0;
    dentro.filter(i => i.cat !== "varilla").forEach(i => {
      const e = estantes.find((s, k2) => n < estantes.slice(0, k2 + 1).reduce((a, s2) => a + cupo(s2), 0)) || estantes[estantes.length - 1];
      const antes = estantes.slice(0, estantes.indexOf(e)).reduce((a, s2) => a + cupo(s2), 0), p = (n - antes) % cupo(e), cols = Math.max(1, Math.floor(e.w / 0.2));
      poner(i, -e.w / 2 + 0.1 + (p % cols) * 0.2, e.y, (e.z || 0) - e.d / 2 + 0.08 + Math.floor(p / cols) * 0.16, g, true);
      n++;
    });
  });
  function cupo(e) { return Math.max(1, Math.floor(e.w / 0.2)) * Math.max(1, Math.floor(e.d / 0.16)); }

  // ── Cámara: gira alrededor de un punto (arrastrar), se acerca (rueda / pellizco) y se desplaza (WASD / flechas) ──
  const INICIO = { yaw: 0, pitch: 0.12, x: -0.3, y: 1.2, z: 0.6 };
  const v = { ...INICIO, dist: 5 };
  let distBase = 5, tocoZoom = false;
  const aplicar = () => {
    v.pitch = lim(v.pitch, -0.05, 1.25); v.yaw = lim(v.yaw, -1.2, 1.2); v.dist = lim(v.dist, 1.2, 10);
    v.x = lim(v.x, -3, 3); v.z = lim(v.z, 0.3, 5);
    camara.position.set(v.x + v.dist * Math.sin(v.yaw) * Math.cos(v.pitch), Math.max(0.25, v.y + v.dist * Math.sin(v.pitch)), v.z + v.dist * Math.cos(v.yaw) * Math.cos(v.pitch));
    camara.lookAt(v.x, v.y, v.z);
    escena.fog.near = v.dist + 2; escena.fog.far = v.dist + 10;
  };
  const tip = el.querySelector(".inv-3d-tip");
  const ray = new T.Raycaster(), p = new T.Vector2();
  let sobre = null;
  const tocado = e => {
    const r = c.getBoundingClientRect();
    p.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camara);
    let o = ray.intersectObjects(tocables, true)[0]?.object;
    while (o && !o.userData.id) o = o.parent;
    return o || null;
  };
  // Resalta solo esa herramienta (no lo que lleva adentro un carro)
  const resaltar = (g, on) => { const rec = o => { if (o !== g && o.userData.id) return; if (o.material?.emissive && !o.material.emissiveMap) o.material.emissive.setHex(on ? 0x553311 : 0); o.children.forEach(rec); }; if (g) rec(g); };
  const punteros = new Map();
  let ini = null, pellizco = 0;
  c.addEventListener("pointerdown", e => {
    punteros.set(e.pointerId, [e.clientX, e.clientY]); c.setPointerCapture(e.pointerId);
    ini = punteros.size === 1 ? [e.clientX, e.clientY] : null;
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pellizco = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  c.addEventListener("pointermove", e => {
    const ant = punteros.get(e.pointerId);
    if (ant) {
      punteros.set(e.pointerId, [e.clientX, e.clientY]);
      if (punteros.size === 1) { v.yaw -= (e.clientX - ant[0]) * 0.006; v.pitch += (e.clientY - ant[1]) * 0.005; }
      else if (punteros.size === 2) { const [a, b] = [...punteros.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pellizco) v.dist *= pellizco / d; pellizco = d; tocoZoom = true; }
      if (tip) tip.hidden = true;
      return;
    }
    if (e.pointerType !== "mouse") return;
    const g = tocado(e);
    if (g !== sobre) { resaltar(sobre, false); resaltar(g, true); sobre = g; }
    c.style.cursor = g ? "pointer" : "grab";
    if (tip) { tip.hidden = !g; if (g) { const r = c.getBoundingClientRect(); tip.textContent = g.userData.nombre + (g.userData.cant > 1 ? ` ×${g.userData.cant}` : ""); tip.style.left = lim(e.clientX - r.left, 60, r.width - 60) + "px"; tip.style.top = (e.clientY - r.top) + "px"; } }
  });
  const soltar = e => {
    punteros.delete(e.pointerId); pellizco = 0;
    if (ini && e.type === "pointerup" && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) < 8) { const g = tocado(e); if (g) alTocar(g.userData.id); }
    ini = null;
  };
  c.addEventListener("pointerup", soltar); c.addEventListener("pointercancel", soltar);
  c.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { resaltar(sobre, false); sobre = null; if (tip) tip.hidden = true; } });
  c.addEventListener("wheel", e => { e.preventDefault(); v.dist *= 1 + lim(e.deltaY, -100, 100) * 0.0012; tocoZoom = true; }, { passive: false });
  const teclas = new Set();
  const TECLAS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
  c.addEventListener("keydown", e => { const k = e.key.toLowerCase(); if (TECLAS.includes(k)) { e.preventDefault(); teclas.add(k); } });
  c.addEventListener("keyup", e => teclas.delete(e.key.toLowerCase()));
  c.addEventListener("blur", () => teclas.clear());
  c.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") c.focus({ preventScroll: true }); });
  // Botón para volver a la vista de entrada
  const centrar = document.createElement("button");
  centrar.type = "button"; centrar.className = "inv-3d-centrar"; centrar.textContent = "Centrar";
  centrar.onclick = () => { Object.assign(v, INICIO, { dist: distBase }); tocoZoom = false; };
  el.append(centrar);

  // Al entrar, la cámara se aleja lo justo para que entren la pared y la mesa a lo ancho (en vertical queda más lejos)
  const medir = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    render.setSize(w, h, false); camara.aspect = w / h; camara.updateProjectionMatrix();
    distBase = lim((w / h < 1 ? 4.4 : 6.4) / 2 / (Math.tan(camara.fov * Math.PI / 360) * camara.aspect) + 0.4, 4, 9);
    if (!tocoZoom) v.dist = distBase;
  };
  const ro = new ResizeObserver(medir); ro.observe(el); medir();
  let vivo = true;
  const cuadro = () => {
    if (!vivo) return;
    if (!el.isConnected) return desarmar();
    if (teclas.size) {
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), paso = 0.04;   // adelante = hacia donde mira la cámara, sobre el piso
      const ad = (teclas.has("w") || teclas.has("arrowup") ? 1 : 0) - (teclas.has("s") || teclas.has("arrowdown") ? 1 : 0);
      const de = (teclas.has("d") || teclas.has("arrowright") ? 1 : 0) - (teclas.has("a") || teclas.has("arrowleft") ? 1 : 0);
      v.x += (fx * ad - fz * de) * paso; v.z += (fz * ad + fx * de) * paso;
    }
    aplicar();
    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  };
  function desarmar() {
    if (!vivo) return; vivo = false; ro.disconnect();
    escena.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    render.dispose(); c.remove(); centrar.remove();
  }
  cuadro();
  return desarmar;
}
