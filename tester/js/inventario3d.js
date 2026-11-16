// Inventario en 3D: el taller (pared perforada, mesa, valijas, lámparas) y los carros con lo que el técnico puso en cada uno.
// En primera persona: arrastrar mira alrededor, WASD / flechas / botones caminan; tocar una herramienta la abre.
const URLS = ["https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "https://unpkg.com/three@0.160.0/build/three.module.js"];
let cargando = null;
let vista = null;   // dónde estaba parado y hacia dónde miraba: se conserva al rearmar la escena (después de cada cambio)
const cargarThree = () => cargando ||= (async () => {
  for (const u of URLS) { try { return await import(u); } catch { /* probar el otro CDN */ } }
  cargando = null; throw new Error("No se pudo cargar el 3D. Revisá la conexión.");
})();

const COLOR = { varilla: 0xc4cad3, martillo: 0xe2a93a, inercial: 0xec6a38, gancho: 0x4ea2e4, lampara: 0x1b1c1f, bateria: 0x1e2023, carro: 0x232427, valija: 0x1d1f23, desmontaje: 0x4fbf92, herramienta: 0x2f6fd0, varios: 0x9d92d4 };
const largo = id => 0.9 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38) / 60;   // varillas de distinto largo, siempre igual para la misma
const lim = (v, a, b) => Math.max(a, Math.min(b, v));

// Devuelve una función para desarmar la escena
export async function montar3D(el, items, alTocar, alAgregar = () => {}, alMover = () => {}) {
  const T = await cargarThree();
  if (!el.isConnected) return () => {};
  const canvasTex = (w, h, dibujar, rep) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; dibujar(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...rep); }
    return t;
  };
  const agujeros = (fondo, hueco) => (g, w, h) => { g.fillStyle = fondo; g.fillRect(0, 0, w, h); g.fillStyle = hueco; g.beginPath(); g.arc(w / 2, h / 2, 6, 0, 7); g.fill(); };
  const texPerforada = canvasTex(64, 64, agujeros("#6f747c", "#222427"), [26, 12]);
  const texRejilla = canvasTex(64, 64, agujeros("#c9ced6", "#2a2c30"), [14, 2]);
  const texRayas = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#f4f6f8"; g.fillRect(0, 0, w, h); g.fillStyle = "#15171a"; for (let y = 4; y < h; y += 16) g.fillRect(0, y, w, 8); });
  // Luz de las lámparas PDR: la de mano, franjas de cálida a fría; la de pie, tres franjas cálidas sobre fondo oscuro
  const franjas = (colores, fondo) => (g, w, h) => {
    g.fillStyle = fondo; g.fillRect(0, 0, w, h);
    colores.forEach((col, k) => {
      const x = (k + 0.5) * w / colores.length, r = g.createLinearGradient(x - w / colores.length / 2, 0, x + w / colores.length / 2, 0);
      r.addColorStop(0, fondo); r.addColorStop(0.5, col); r.addColorStop(1, fondo);
      g.fillStyle = r; g.fillRect(x - w / colores.length / 2, 0, w / colores.length, h);
    });
  };
  const texMano = canvasTex(96, 32, franjas(["#f4b648", "#ffe6a8", "#fff6e2", "#e4f0f8", "#bcd9ee"], "#d9c9a6"));
  const texPie = canvasTex(48, 32, franjas(["#ffd38a", "#ffe2ad", "#ffd38a"], "#2a2622"));
  // Espuma tipo huevera de las valijas (una textura por tamaño, para que las ondas no se estiren)
  const espumas = {};
  const espuma = (rx, ry) => mat(0xffffff, { roughness: 1, map: espumas[rx + "x" + ry] ||= canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#18191c"; g.fillRect(0, 0, w, h);
    for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48]]) {
      const r = g.createRadialGradient(x - 4, y - 4, 2, x, y, 15), alto = (x + y) % 64 === 32;
      r.addColorStop(0, alto ? "#4a4d53" : "#26282c"); r.addColorStop(1, "#18191c");
      g.fillStyle = r; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
    }
  }, [rx, ry]) });
  const ruido = (base, n, a) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "0,0,0" : "255,255,255"},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  };
  const texPared = canvasTex(256, 256, ruido("#7f848b", 2200, .07), [3, 2]);
  const texPiso = canvasTex(256, 256, (g, w, h) => { ruido("#55585e", 1500, .05)(g, w, h); g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [6, 9]);

  const escena = new T.Scene();
  escena.background = new T.Color(0x16171a);
  const camara = new T.PerspectiveCamera(65, 1, 0.05, 40);
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
  // Habitación cerrada de 7 × 8 m, con techo: se recorre caminando adentro
  const FONDO = 8;
  escena.add(en(plano(FONDO, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), -3.5, 1.7, FONDO / 2, 0, Math.PI / 2));
  escena.add(en(plano(FONDO, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), 3.5, 1.7, FONDO / 2, 0, -Math.PI / 2));
  escena.add(en(plano(7, 3.4, mat(0xffffff, { map: texPared, roughness: .95 })), 0, 1.7, FONDO, 0, Math.PI));
  escena.add(en(plano(7, FONDO, mat(0xffffff, { map: texPiso, roughness: .9 })), 0, 0, FONDO / 2, -Math.PI / 2));
  escena.add(en(plano(7, FONDO, mat(0xb4b7bc, { roughness: 1 })), 0, 3.4, FONDO / 2, Math.PI / 2));
  // Paneles de luz en el techo (6), cada uno con su luz: toda la habitación iluminada
  const LUCES = [-2, 0, 2].flatMap(x => [1.8, 5.4].map(z => [x, z]));
  for (const [x, z] of LUCES) {
    escena.add(en(caja(1.1, 0.04, 0.5, new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 1.6 })), x, 3.38, z));
    const l = new T.PointLight(0xfff1de, 12, 0, 1.8); l.position.set(x, 3.2, z); escena.add(l);
  }
  escena.add(en(caja(0.5, 3.4, 0.5, mat(0x5a4038, { roughness: .8 })), 3.25, 1.7, 0.25));
  for (const y of [0.6, 2.6]) escena.add(en(caja(0.52, 0.08, 0.52, mat(0x8a5a40)), 3.25, y, 0.25));
  escena.add(en(caja(3.9, 1.85, 0.03, mat(0xffffff, { map: texPerforada, roughness: .8 })), -0.75, 2.05, 0.02));
  for (const x of [-1.8, 0.3]) escena.add(en(caja(1.5, 0.05, 0.08, new T.MeshStandardMaterial({ color: 0xffe0b8, emissive: 0xffd2a0, emissiveIntensity: 2.2 })), x, 3.12, 0.12));
  // Mesa de trabajo (tapa, patas y estante de abajo)
  const mMesa = metal();
  escena.add(en(caja(4.0, 0.07, 0.85, mat(0x9aa0a8, { metalness: .3, roughness: .55 })), -0.75, 0.95, 0.5));
  for (const x of [-2.68, 1.18]) for (const z of [0.15, 0.85]) escena.add(en(caja(0.06, 0.92, 0.06, mMesa), x, 0.46, z));
  escena.add(en(caja(3.9, 0.04, 0.75, mMesa), -0.75, 0.18, 0.5));

  // ── Luces: luz general pareja, un foco sobre la mesa (sombras) y un toque naranja al costado ──
  escena.add(new T.HemisphereLight(0xeef2f8, 0x5a5048, 1.2), new T.AmbientLight(0xffffff, 0.2));
  render.toneMappingExposure = 1.0;
  const foco = new T.SpotLight(0xffe2c0, 70, 0, 1.0, 0.6, 2);
  foco.position.set(-0.3, 3.4, 2.6); foco.target.position.set(-0.3, 0.6, 0.8);
  foco.castShadow = true; foco.shadow.mapSize.set(1024, 1024); foco.shadow.bias = -0.0004;
  escena.add(foco, foco.target);
  const naranja = new T.PointLight(0xff7a33, 9, 0, 2); naranja.position.set(2.7, 2.3, 1.3); escena.add(naranja);

  // ── Las herramientas ── (cada una es un grupo con userData.id para poder tocarla)
  const tocables = [], flotantes = [];   // flotantes: las lámparas de mano (suben y bajan apenas)
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dibujos = {
    // Varilla: acero claro (bien visible contra el tablero), más gruesa, con el mango en T de color como las PDR
    varilla: (m, i) => { const g = new T.Group(), L = largo(i.id);
      const mango = mat([0xd8352a, 0x2f6fd0, 0x2fa35a, 0xf08a24, 0xe8c21e][[...i.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5], { roughness: .5 });
      g.add(en(cil(0.016, L, m, 10), 0, -L / 2, 0), en(cil(0.026, 0.18, mango, 12), 0, 0, 0, 0, 0, Math.PI / 2));
      g.add(en(cil(0.016, 0.12, m, 10), 0.045, -L, 0, 0, 0, Math.PI / 3)); return g; },
    martillo: m => { const g = new T.Group();
      g.add(en(cil(0.045, 0.16, m), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.015, 0.34, mat(0x2b2b2e)), 0, -0.19, 0)); return g; },
    gancho: m => { const g = new T.Group();
      g.add(en(cil(0.01, 0.4, m, 8), 0, -0.2, 0)); g.add(en(new T.Mesh(new T.TorusGeometry(0.06, 0.01, 8, 16, Math.PI), m), 0.06, -0.4, 0, 0, 0, Math.PI)); return g; },
    inercial: (m, i) => { const g = new T.Group(), nombre = i.nombre || "", negro = mat(0x18191c, { roughness: .6 });
      // BullKick / Shotgun / a resorte: parado, el cuerpo grueso negro con anillos rojos arriba, la barra y el mango chico abajo
      if (/bull ?kick|shotgun|resorte/i.test(nombre)) {
        const rojo = mat(0xd8352a, { roughness: .5 });
        g.add(en(cil(0.03, 0.32, negro, 16), 0, 0.42, 0), en(cil(0.031, 0.012, rojo, 16), 0, 0.3, 0), en(cil(0.031, 0.012, rojo, 16), 0, 0.55, 0));
        g.add(en(cil(0.009, 0.2, metal(), 10), 0, 0.17, 0), en(cil(0.019, 0.08, negro, 12), 0, 0.04, 0));
        return g;
      }
      // Pistola de pegamento, parada sobre el mango: cuerpo con boquilla, gatillo, la barra de pegamento atrás; a batería, con la batería abajo
      if (/pistola/i.test(nombre)) {
        const bat = /bater/i.test(nombre), base = bat ? 0.06 : 0;
        g.add(en(caja(0.22, 0.075, 0.06, m), 0, base + 0.2, 0), en(cil(0.012, 0.06, metal(), 10), 0.14, base + 0.2, 0, 0, 0, Math.PI / 2));
        g.add(en(caja(0.05, 0.15, 0.05, m), -0.035, base + 0.09, 0, 0, 0, 0.25), en(caja(0.012, 0.04, 0.02, negro), 0.01, base + 0.13, 0));
        g.add(en(cil(0.011, 0.09, mat(0xf3efe2, { roughness: .3, transparent: true, opacity: .85 }), 10), -0.15, base + 0.2, 0, 0, 0, Math.PI / 2));
        if (bat) g.add(en(caja(0.09, 0.06, 0.08, negro), -0.05, 0.03, 0));
        g.rotation.y = 0.5; return g;
      }
      // Martillo inercial (tipo FastPDR): parado, el mango con estrías arriba, la barra, la pesa al medio y la punta abajo
      if (/martillo inercial|slide/i.test(nombre)) {
        const acero = mat(0xc9ced6, { metalness: .5, roughness: .35 });
        g.add(en(cil(0.022, 0.17, acero, 14), 0, 0.5, 0), en(cil(0.026, 0.012, negro, 14), 0, 0.41, 0), en(cil(0.008, 0.52, acero, 10), 0, 0.15, 0));
        g.add(en(caja(0.06, 0.11, 0.06, acero), 0, 0.22, 0), en(cil(0.016, 0.05, acero, 10), 0, -0.015, 0));
        g.position.y = 0.04; return g;
      }
      // el resto (mini lifter, puller, pegamento…): acostado, barra, pesa y manija en T
      g.add(en(cil(0.01, 0.55, metal(), 8), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.035, 0.12, m), 0.05, 0, 0, 0, 0, Math.PI / 2));
      g.add(en(cil(0.015, 0.14, m), -0.28, 0, 0)); g.position.y = 0.035; g.rotation.y = 0.35; return g; },
    // Lámparas PDR. De mano: panel de luz cálida a fría con marco negro, mango y batería en la punta, flotando.
    // De pie: panel alto con tres franjas de luz, colgado de un caño con brazos, batería roja y base con ruedas.
    lampara: (m, i, chica) => { const g = new T.Group(), negro = m;
      const luz = (tex, w, h) => mat(0xffffff, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: .4 });
      if (chica) { g.add(en(caja(0.24, 0.02, 0.5, negro), 0, 0.012, 0), en(caja(0.21, 0.004, 0.47, luz(texMano)), 0, 0.024, 0)); return g; }   // en un carro: acostada
      if (i.modelo === "mano") {
        const panel = new T.Group(); panel.position.set(0, 1.3, 0); panel.rotation.z = -0.25;
        panel.add(en(caja(0.27, 0.6, 0.03, negro), 0, 0, 0), en(caja(0.235, 0.565, 0.004, luz(texMano)), 0, 0, 0.017));
        panel.add(en(cil(0.024, 0.26, negro), 0, -0.43, 0), en(caja(0.085, 0.075, 0.12, negro), 0, -0.6, 0));
        g.add(panel); g.userData.flota = true; return g;
      }
      // Base en cruz con ruedas, caño, batería roja, brazos y el panel alto
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        g.add(en(caja(0.3, 0.03, 0.035, metal()), Math.cos(a) * 0.15, 0.07, -Math.sin(a) * 0.15, 0, a, 0));
        rueda(g, Math.cos(a) * 0.29, -Math.sin(a) * 0.29);
      }
      g.add(en(cil(0.018, 1.95, negro), 0, 1.03, 0), en(caja(0.13, 0.11, 0.08, mat(0xb3261e, { roughness: .5 })), 0.03, 0.3, 0.05));
      for (const y of [0.55, 1.75]) g.add(en(caja(0.16, 0.02, 0.02, negro), 0.08, y, 0));
      g.add(en(cil(0.01, 0.4, negro, 8), -0.08, 2.05, 0, 0, 0, 0.6));   // mástil de arriba, inclinado
      g.add(en(caja(0.19, 1.35, 0.03, negro), 0.2, 1.15, 0), en(caja(0.16, 1.31, 0.004, luz(texPie)), 0.2, 1.15, 0.017));
      return g; },
    bateria: (m, i) => { const g = new T.Group();
      if (i.modelo === "auto") {   // de auto: caja con tapa y dos bornes
        g.add(en(caja(0.28, 0.19, 0.17, m), 0, 0.095, 0), en(caja(0.29, 0.02, 0.18, mat(0x111214)), 0, 0.2, 0));
        for (const x of [-0.1, 0.1]) g.add(en(cil(0.014, 0.03, mat(0xbfc3c8, { metalness: .7, roughness: .3 }), 10), x, 0.225, -0.05));
        return g;
      }
      // chica (de herramienta, tipo 18V): cuerpo, rieles grises y contactos naranja
      g.add(en(caja(0.08, 0.06, 0.115, m), 0, 0.03, 0), en(caja(0.06, 0.014, 0.09, mat(0xc9ccd1)), 0, 0.067, 0), en(caja(0.028, 0.008, 0.03, mat(0xf2a33a)), 0, 0.078, 0.01));
      g.rotation.y = 0.3; return g; },
    desmontaje: (m, i) => { const g = new T.Group();
      if (/pinza/i.test(i.nombre || "")) {   // pinza de punta acostada: puntas finas de acero, eje y dos mangos rojos abiertos en V
        const acero = metal(), rojo = mat(0xd8352a, { roughness: .55 });
        for (const s of [-1, 1]) {
          g.add(en(caja(0.11, 0.008, 0.008, acero), 0.07, 0.006, s * 0.004, 0, -s * 0.03, 0));
          g.add(en(caja(0.12, 0.016, 0.018, rojo), -0.06, 0.009, s * 0.022, 0, s * 0.3, 0));
        }
        g.add(en(cil(0.009, 0.02, acero, 10), 0.01, 0.01, 0));
        g.rotation.y = 0.6; return g;
      }
      g.add(en(cil(0.022, 0.11, m), -0.08, 0, 0, 0, 0, Math.PI / 2)); g.add(en(cil(0.006, 0.18, metal(), 8), 0.06, 0, 0, 0, 0, Math.PI / 2));
      g.position.y = 0.025; g.rotation.y = 0.5; return g; },
    herramienta: (m, i) => { const g = new T.Group(), negro = mat(0x1d1e21);
      if (/dentshock|hotbox|inducci/i.test(i.nombre || "")) {   // máquina de inducción: caja con pantallita y perilla, cable y lápiz
        g.add(en(caja(0.3, 0.17, 0.24, m), 0, 0.085, 0), en(caja(0.1, 0.05, 0.005, new T.MeshStandardMaterial({ color: 0x0f2a1c, emissive: 0x3ddc84, emissiveIntensity: .6 })), -0.06, 0.11, 0.123));
        g.add(en(cil(0.018, 0.02, negro, 12), 0.08, 0.11, 0.128, Math.PI / 2, 0, 0));
        const curva = new T.CatmullRomCurve3([[0.15, 0.06, 0.02], [0.24, 0.02, 0.08], [0.3, 0.01, 0.2], [0.3, 0.02, 0.32]].map(p => new T.Vector3(...p)));
        const cable = new T.Mesh(new T.TubeGeometry(curva, 24, 0.006, 6), negro); cable.castShadow = true; g.add(cable);
        g.add(en(cil(0.014, 0.17, negro, 10), 0.3, 0.02, 0.405, Math.PI / 2, 0, 0), en(cil(0.006, 0.03, metal(), 8), 0.3, 0.02, 0.505, Math.PI / 2, 0, 0));
        g.rotation.y = -0.3; return g;
      }
      // taladro (o máquina) apoyado: cuerpo, mandril, mango y batería
      g.add(en(caja(0.2, 0.07, 0.065, m), 0, 0.2, 0), en(cil(0.014, 0.07, metal(), 10), 0.13, 0.2, 0, 0, 0, Math.PI / 2));
      g.add(en(caja(0.045, 0.12, 0.05, negro), -0.03, 0.105, 0), en(caja(0.09, 0.045, 0.08, negro), -0.03, 0.0225, 0));
      g.rotation.y = 0.4; return g; },
    varios: (m, i) => { const g = new T.Group(), nombre = i.nombre || "";
      if (/chupete/i.test(nombre)) {   // chupetes: tres tabs naranjas translúcidos (base hexagonal, vástago y disco)
        const nar = mat(0xf28c1e, { roughness: .35, transparent: true, opacity: .85, emissive: 0x5a2400, emissiveIntensity: .25 });
        [[-0.05, 0], [0.05, 0.02], [0, 0.07]].forEach(([x, z]) => g.add(en(cil(0.022, 0.035, nar, 6), x, 0.0175, z), en(cil(0.009, 0.03, nar, 10), x, 0.05, z), en(cil(0.03, 0.008, nar, 20), x, 0.069, z)));
        return g;
      }
      if (/ventosa/i.test(nombre)) {   // ventosa: copa de goma negra y manija
        const goma = mat(0x1b1c1f, { roughness: .8 });
        g.add(en(new T.Mesh(new T.SphereGeometry(0.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), goma), 0, 0, 0), en(caja(0.1, 0.015, 0.025, metal()), 0, 0.09, 0));
        for (const x of [-0.035, 0.035]) g.add(en(cil(0.006, 0.04, metal(), 8), x, 0.07, 0));
        return g;
      }
      g.add(en(caja(0.16, 0.1, 0.13, m), 0, 0.05, 0)); return g; },
    valija: (m, i) => i.modelo === "mesa" ? mesaSacabollos(m) : i.modelo === "vertical" ? valijaVertical(m) : i.modelo === "flight" ? valijaFlight(m) : valijaLarga(m),
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
  // Valijas PDR, abiertas para ver lo de adentro (espuma tipo huevera).
  // Larga (de varillas): la tapa se abre hacia atrás y queda parada; adentro, todo acostado
  function valijaLarga(m) {
    const g = new T.Group(), negro = mat(0x111214), W = 1.3, D = 0.36, H = 0.12;
    g.add(en(caja(W, 0.02, D, m), 0, 0.01, 0));
    for (const z of [-D / 2, D / 2]) g.add(en(caja(W, H, 0.02, m), 0, H / 2, z));
    for (const x of [-W / 2, W / 2]) g.add(en(caja(0.02, H, D, m), x, H / 2, 0));
    g.add(en(caja(W - 0.04, 0.012, D - 0.04, espuma(20, 6)), 0, 0.026, 0));
    for (const x of [-0.5, -0.17, 0.17, 0.5]) g.add(en(caja(0.05, 0.05, 0.025, negro), x, H / 2 + 0.01, D / 2 + 0.012));
    g.add(en(caja(0.18, 0.025, 0.03, negro), 0, H / 2, D / 2 + 0.02));
    const tapa = new T.Group(); tapa.position.set(0, H, -D / 2); tapa.rotation.x = -Math.PI / 2 * 1.03;   // bisagra atrás, un poco hacia la pared
    tapa.add(en(caja(W, 0.03, D, m), 0, 0.015, D / 2), en(caja(W - 0.04, 0.012, D - 0.04, espuma(20, 6)), 0, -0.006, D / 2));
    for (const x of [-0.45, -0.15, 0.15, 0.45]) tapa.add(en(caja(0.22, 0.02, 0.3, m), x, 0.04, D / 2));
    g.add(tapa);
    const fondo = { y: 0.032, w: W - 0.1, d: D - 0.08 };
    g.userData.lugar = { acostar: fondo, estantes: [fondo] };
    return g;
  }
  // Vertical con ruedas (tipo SKB): parada, la puerta abierta de costado; las varillas cuelgan adentro
  function valijaVertical(m) {
    const g = new T.Group(), negro = mat(0x111214), W = 0.42, H = 1.1, D = 0.28, y0 = 0.05;
    g.add(en(caja(W, H, 0.02, m), 0, y0 + H / 2, -D / 2));
    for (const x of [-W / 2, W / 2]) g.add(en(caja(0.02, H, D, m), x, y0 + H / 2, 0));
    for (const y of [y0, y0 + H]) g.add(en(caja(W, 0.02, D, m), 0, y, 0));
    g.add(en(caja(W - 0.04, H - 0.04, 0.012, espuma(6, 16)), 0, y0 + H / 2, -D / 2 + 0.016));
    g.add(en(caja(0.18, 0.03, 0.04, negro), 0, y0 + H + 0.07, 0)); for (const x of [-0.08, 0.08]) g.add(en(caja(0.025, 0.06, 0.03, negro), x, y0 + H + 0.03, 0));
    for (const x of [-0.15, 0.15]) rueda(g, x, -0.1);
    const puerta = new T.Group(); puerta.position.set(-W / 2, 0, D / 2); puerta.rotation.y = -Math.PI * 0.6;   // bisagra a la izquierda
    puerta.add(en(caja(W, H, 0.03, m), W / 2, y0 + H / 2, 0.015), en(caja(W - 0.04, H - 0.04, 0.012, espuma(6, 16)), W / 2, y0 + H / 2, -0.006));
    for (let k = 0; k < 10; k++) puerta.add(en(caja(0.36, 0.025, 0.02, m), W / 2, y0 + 0.12 + k * 0.1, 0.04));
    for (const y of [0.3, 0.9]) puerta.add(en(caja(0.05, 0.06, 0.03, mat(0xb8bec6, { metalness: .6 })), W - 0.02, y, 0.03));
    g.add(puerta);
    g.userData.lugar = { colgar: { y: y0 + H - 0.08, xs: [-W / 2 + 0.04, W / 2 - 0.04], zs: [-D / 2 + 0.07], piso: y0 + 0.06 }, estantes: [{ y: y0 + 0.012, w: W - 0.06, d: D - 0.12, z: 0.04 }] };
    return g;
  }
  // Flight case (tipo FAST): caja abierta con cantoneras de aluminio y ruedas; con los caños y la tapa arriba se arma como carro
  // Mesa sacabollos: tapa oscura, 4 patas con ruedas, tijeras en X a los costados y soportes en U en las esquinas (para apoyar el panel)
  function mesaSacabollos(m) {
    const g = new T.Group(), azul = mat(0x24448a, { metalness: .4, roughness: .45 }), tubo = mat(0xb9bec6, { metalness: .7, roughness: .3 }), L = 0.8, A = 0.86;
    g.add(en(caja(L, 0.035, L, m), 0, A, 0));
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      g.add(en(cil(0.018, A - 0.07, azul, 10), x * 0.37, (A + 0.07) / 2, z * 0.37)); rueda(g, x * 0.37, z * 0.37);
      // soporte en U: sube desde la esquina, va hacia afuera y vuelve a subir
      g.add(en(cil(0.012, 0.22, tubo, 8), x * 0.37, A + 0.11, z * 0.37), en(cil(0.012, 0.1, tubo, 8), x * 0.42, A + 0.22, z * 0.37, 0, 0, Math.PI / 2));
      g.add(en(cil(0.012, 0.12, tubo, 8), x * 0.47, A + 0.28, z * 0.37), en(cil(0.02, 0.04, mat(0x111214), 8), x * 0.47, A + 0.35, z * 0.37));
    }
    // tijeras en X (dos diagonales por costado)
    const diag = Math.hypot(0.74, A - 0.15), ang = Math.atan2(A - 0.15, 0.74);
    for (const z of [-0.37, 0.37]) for (const s of [-1, 1]) g.add(en(cil(0.008, diag, mat(0x16171a), 6), 0, (A + 0.07) / 2, z, 0, 0, s * (Math.PI / 2 - ang)));
    for (const x of [-0.37, 0.37]) for (const s of [-1, 1]) g.add(en(cil(0.008, diag, mat(0x16171a), 6), x, (A + 0.07) / 2, 0, s * (Math.PI / 2 - ang), 0, 0));
    const tapa = { y: A + 0.018, w: L - 0.1, d: L - 0.1 };
    g.userData.lugar = { acostar: tapa, estantes: [tapa] };
    return g;
  }
  function valijaFlight(m) {
    const g = new T.Group(), alu = mat(0xc9ced6, { metalness: .7, roughness: .35 }), W = 1.3, D = 0.42, H = 0.32, y0 = 0.09;
    g.add(en(caja(W, 0.02, D, m), 0, y0, 0));
    for (const z of [-D / 2, D / 2]) g.add(en(caja(W, H, 0.02, m), 0, y0 + H / 2, z));
    for (const x of [-W / 2, W / 2]) g.add(en(caja(0.02, H, D, m), x, y0 + H / 2, 0));
    g.add(en(caja(W - 0.04, 0.012, D - 0.04, espuma(20, 7)), 0, y0 + 0.016, 0));
    for (const y of [y0, y0 + H]) for (const z of [-D / 2, D / 2]) g.add(en(caja(W + 0.02, 0.02, 0.025, alu), 0, y, z));
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(en(caja(0.025, H, 0.025, alu), x, y0 + H / 2, z));
    g.add(en(caja(0.12, 0.08, 0.02, alu), 0, y0 + H / 2, D / 2 + 0.012));
    for (const x of [-0.55, 0.55]) for (const z of [-0.16, 0.16]) rueda(g, x, z);
    for (const x of [-0.52, -0.42, 0.42, 0.52]) g.add(en(cil(0.014, 1.0, alu, 10), x, 0.91, -0.12));
    g.add(en(caja(W + 0.02, 0.05, D + 0.02, m), 0, 1.43, 0));
    for (const z of [-0.22, 0.22]) g.add(en(caja(W + 0.04, 0.02, 0.02, alu), 0, 1.45, z));
    const fondo = { y: y0 + 0.022, w: W - 0.1, d: D - 0.08 };
    g.userData.lugar = { acostar: fondo, estantes: [fondo, { y: 1.455, w: W - 0.1, d: D - 0.06 }] };
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
    const m = mat(COLOR[i.cat] ?? COLOR.varios, i.cat === "varilla" ? { metalness: .35, roughness: .35 } : i.cat === "carro" ? { roughness: .85 } : {});
    const g = (dibujos[i.cat] || dibujos.varios)(m, i, chica);
    g.position.x += x; g.position.y += y; g.position.z += z;
    g.userData = { ...g.userData, id: i.id, nombre: i.nombre, cant: i.cant || 1 };
    padre.add(g); tocables.push(g);
    if (g.userData.flota) flotantes.push({ g, y: g.position.y, fase: Math.random() * 6 });
    return g;
  };
  const sueltas = cat => items.filter(i => i.cat === cat);   // todo se ve en su lugar, aunque esté en una valija o un carro (lo del carro, también en el carro)
  // Pared: varillas a la izquierda, martillos y punzones al medio, ganchos a la derecha
  sueltas("varilla").forEach((i, k, l) => poner(i, -2.55 + k * Math.min(0.11, 1.35 / l.length), 2.85, 0.07));
  sueltas("martillo").forEach((i, k) => poner(i, -1.0 + (k % 4) * 0.22, 2.7 - Math.floor(k / 4) * 0.62, 0.09));
  sueltas("gancho").forEach((i, k) => poner(i, 0.05 + (k % 4) * 0.24, 2.75 - Math.floor(k / 4) * 0.62, 0.07));
  // Mesa: cada tipo en su tramo, en filas hacia el frente
  ["inercial", "desmontaje", "herramienta", "bateria"].forEach((cat, t) =>
    sueltas(cat).forEach((i, k) => poner(i, -2.6 + t * 1.0 + (k % 3) * 0.3, 0.985, 0.3 + Math.floor(k / 3) % 3 * 0.22)));
  // Varios (microfibras, compounds, pads, lijas…): en el estante de abajo de la mesa
  sueltas("varios").forEach((i, k) => poner(i, -2.5 + (k % 11) * 0.34, 0.2, 0.32 + Math.floor(k / 11) % 2 * 0.3));
  // Valijas: estantería en la pared izquierda con una valija larga abierta por estante (a distintas alturas);
  // las verticales, los flight cases y las largas que no entran, abiertas en el piso a lo largo de la misma pared
  const EST = { x: -3.27, z: 1.8, alturas: [0.05, 0.62, 1.19, 1.76, 2.33] }, mEst = metal();
  for (const x of [-3.47, -3.07]) for (const z of [1.0, 2.6]) escena.add(en(caja(0.04, 2.45, 0.04, mEst), x, 1.225, z));
  EST.alturas.forEach(y => escena.add(en(caja(0.44, 0.03, 1.64, mat(0x8d939b, { metalness: .4, roughness: .5 })), EST.x, y, EST.z)));
  const valijas = sueltas("valija"), modelo = i => ["vertical", "flight", "mesa"].includes(i.modelo) ? i.modelo : "larga";
  // Mesas sacabollos: sueltas por el taller (como los carros), con lo que tienen arriba
  const MESAS = [[0.9, 5.3, 0.2], [-1.4, 5.6, -0.15], [2.3, 4.6, 0.4], [-0.3, 6.6, 0], [1.6, 6.7, -0.3]];
  valijas.filter(i => modelo(i) === "mesa").forEach((i, k) => {
    const [x, z, giro] = MESAS[k % MESAS.length], g = poner(i, x, 0, Math.min(FONDO - 0.6, z + Math.floor(k / MESAS.length) * 0.9));
    g.rotation.y = giro; llenar(g, items.filter(d => d.en === i.id));
  });
  const abrir = (i, x, y, z) => { const g = poner(i, x, y, z); g.rotation.y = Math.PI / 2; llenar(g, items.filter(d => d.en === i.id)); };
  const largas = valijas.filter(i => modelo(i) === "larga");
  largas.slice(0, EST.alturas.length).forEach((i, k) => abrir(i, EST.x, EST.alturas[k] + 0.015, EST.z));
  let zPiso = 2.9;   // lo que va en el piso, una al lado de la otra
  valijas.filter(i => modelo(i) === "vertical").forEach(i => { abrir(i, -3.25, 0, zPiso + 0.2); zPiso += 0.85; });
  valijas.filter(i => modelo(i) === "flight").forEach(i => { abrir(i, -3.22, 0, zPiso + 0.7); zPiso += 1.45; });
  largas.slice(EST.alturas.length).forEach(i => { abrir(i, -3.27, 0, zPiso + 0.7); zPiso += 1.45; });
  // Lámparas: a la derecha, sobre el piso
  sueltas("lampara").forEach((i, k) => poner(i, 1.75 + (k % 3) * 0.55, 0, 0.9 + Math.floor(k / 3) * 0.6));
  // Carros: adelante, con lo que el técnico puso en cada uno
  const LUGARES = [[2.0, 2.3, -0.5], [-1.7, 3.3, 0.3], [0.1, 3.2, 0], [-0.9, 2.2, 0.2], [1.3, 3.6, -0.3]];
  items.filter(i => i.cat === "carro").forEach((cr, k) => {
    const [x, z, giro] = LUGARES[k % LUGARES.length];
    const g = poner(cr, x, 0, z + Math.floor(k / LUGARES.length) * 1.2); g.rotation.y = giro;
    llenar(g, items.filter(i => i.en === cr.id));
  });
  // Pone lo de adentro de un carro o una valija según su userData.lugar:
  // varillas colgadas (colgar) o acostadas (acostar); el resto en los estantes, de arriba hacia abajo
  function llenar(g, dentro) {
    const { colgar, acostar, estantes } = g.userData.lugar;
    const varillas = dentro.filter(i => i.cat === "varilla");
    if (colgar) varillas.forEach((i, n, l) => {
      const lados = colgar.zs.length, porLado = Math.ceil(l.length / lados), paso = Math.min(0.07, (colgar.xs[1] - colgar.xs[0] - 0.1) / Math.max(1, porLado - 1));
      const v = poner(i, colgar.xs[0] + 0.05 + Math.floor(n / lados) * paso, colgar.y, colgar.zs[n % lados], g);
      v.rotation.y = Math.PI / 2; v.scale.y = lim((colgar.y - (colgar.piso ?? 0.12)) / largo(i.id), 0.3, 1);
    });
    else varillas.forEach((i, n) => {
      const filas = Math.max(1, Math.floor(acostar.d / 0.035));
      const v = poner(i, -acostar.w / 2 + 0.04, acostar.y + 0.015 + Math.floor(n / filas) * 0.025, -acostar.d / 2 + 0.03 + (n % filas) * 0.035, g);
      v.rotation.z = Math.PI / 2; v.scale.y = lim((acostar.w - 0.1) / largo(i.id), 0.3, 1);
    });
    let n = 0;
    dentro.filter(i => i.cat !== "varilla").forEach(i => {
      const e = estantes.find((s, k2) => n < estantes.slice(0, k2 + 1).reduce((a, s2) => a + cupo(s2), 0)) || estantes[estantes.length - 1];
      const antes = estantes.slice(0, estantes.indexOf(e)).reduce((a, s2) => a + cupo(s2), 0), p = (n - antes) % cupo(e), cols = Math.max(1, Math.floor(e.w / 0.2));
      poner(i, -e.w / 2 + 0.1 + (p % cols) * 0.2, e.y, (e.z || 0) - e.d / 2 + 0.08 + Math.floor(p / cols) * 0.16, g, true);
      n++;
    });
  }
  function cupo(e) { return Math.max(1, Math.floor(e.w / 0.2)) * Math.max(1, Math.floor(e.d / 0.16)); }

  // ── Cámara en primera persona, a la altura de los ojos: arrastrar mira alrededor; WASD / flechas (o los botones en el celular)
  //    caminan; la rueda o el pellizco avanzan y retroceden. Tocar una herramienta la abre.
  // shortcut: solo choca con las paredes, no con los muebles; agregar cajas de choque si molesta atravesar la mesa o los carros
  const OJOS = 1.6, INICIO = { x: -0.5, z: 4.4, yaw: 0.1, pitch: 0.1 };
  const v = (vista ||= { ...INICIO });
  const caminar = (ad, de) => {   // ad: adelante (+) / atrás (-); de: derecha (+) / izquierda (-)
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    v.x = lim(v.x + fx * ad - fz * de, -3.2, 3.2); v.z = lim(v.z + fz * ad + fx * de, 0.95, FONDO - 0.3);
  };
  const aplicar = () => {
    v.pitch = lim(v.pitch, -1.3, 1.3);
    camara.position.set(v.x, OJOS, v.z);
    camara.lookAt(v.x - Math.sin(v.yaw) * Math.cos(v.pitch), OJOS + Math.sin(v.pitch), v.z - Math.cos(v.yaw) * Math.cos(v.pitch));
  };
  const tip = el.querySelector(".inv-3d-tip");
  const ray = new T.Raycaster(), p = new T.Vector2();
  // Zonas vacías para agregar con un click (van detrás de las herramientas: si hay una adelante, gana ella)
  const NOMBRE = { varilla: "varillas", martillo: "martillos y punzones", gancho: "ganchos y accesorios", inercial: "martillos inerciales y pullers", desmontaje: "desmontaje", varios: "varios", valija: "valijas", lampara: "lámparas", bateria: "baterías", herramienta: "herramientas" };
  const zonas = [], invisible = new T.MeshBasicMaterial({ visible: false });
  const zona = (cat, w, h, x, y, z, rx = 0, ry = 0) => { const m = en(new T.Mesh(new T.PlaneGeometry(w, h), invisible), x, y, z, rx, ry); m.userData.nueva = cat; escena.add(m); zonas.push(m); };
  zona("varilla", 1.55, 1.85, -1.925, 2.05, 0.04); zona("martillo", 1.05, 1.85, -0.625, 2.05, 0.04); zona("gancho", 1.3, 1.85, 0.55, 2.05, 0.04);
  [["inercial", -2.25], ["desmontaje", -1.25], ["herramienta", -0.25], ["bateria", 0.75]].forEach(([cat, x]) => zona(cat, 1.0, 0.85, x, 0.99, 0.5, -Math.PI / 2));
  zona("varios", 3.8, 0.7, -0.75, 0.205, 0.5, -Math.PI / 2);   // estante de abajo de la mesa
  zona("valija", 1.64, 2.45, -3.46, 1.225, 1.8, 0, Math.PI / 2);
  zona("lampara", 1.55, 1.7, 2.22, 0.01, 1.35, -Math.PI / 2);
  // Lo que hay en un punto de la pantalla (-1..1): una herramienta (userData.id) o una zona para agregar (userData.nueva)
  // sin: una herramienta que no cuenta (la que se está llevando)
  const esDe = (x, g) => { for (; x; x = x.parent) if (x === g) return true; return false; };
  const apuntar = (nx, ny, sin) => {
    p.set(nx, ny); ray.setFromCamera(p, camara);
    let o = ray.intersectObjects([...tocables, ...zonas], true).find(h => !sin || !esDe(h.object, sin))?.object;
    while (o && !o.userData.id && !o.userData.nueva) o = o.parent;
    return o || null;
  };
  const enPantalla = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
  // Resalta solo esa herramienta (no lo que lleva adentro un carro)
  const resaltar = (g, on) => { const rec = o => { if (o !== g && o.userData.id) return; if (o.material?.emissive && !o.material.emissiveMap) o.material.emissive.setHex(on ? 0x553311 : 0); o.children.forEach(rec); }; if (g) rec(g); };
  let sobre = null;
  const mostrar = (o, x, y) => {   // resalta y pone el cartelito (x, y en px dentro del lienzo)
    const g = o?.userData.id ? o : null;
    if (g !== sobre) { resaltar(sobre, false); resaltar(g, true); sobre = g; }
    if (!tip) return;
    tip.hidden = !o;
    if (o) { tip.textContent = o.userData.id ? o.userData.nombre + (o.userData.cant > 1 ? ` ×${o.userData.cant}` : "") : "+ Agregar " + NOMBRE[o.userData.nueva]; tip.style.left = lim(x, 60, c.clientWidth - 60) + "px"; tip.style.top = y + "px"; }
  };
  const elegir = o => {
    if (!o) return;
    if (o.userData.id) alTocar(o.userData.id); else alAgregar(o.userData.nueva);
  };

  // Llevar una herramienta (arrastrar): se agarra, flota adelante y se suelta sobre una valija o un carro
  // (queda guardada ahí) o en cualquier otro lado (vuelve a su lugar). Valijas y carros no se llevan.
  const itemDe = id => items.find(i => i.id === id);
  const CONT = ["valija", "carro"];
  const llevable = o => !!o?.userData.id && !CONT.includes(itemDe(o.userData.id)?.cat);
  const contenedorDe = o => { for (let x = o; x; x = x.parent) { const it = x.userData.id && itemDe(x.userData.id); if (it && CONT.includes(it.cat)) return it; } return null; };
  let llevado = null;
  const empezarLlevar = (o, nx = 0, ny = 0) => {
    const tam = new T.Box3().setFromObject(o).getSize(new T.Vector3()), f = o.clone();
    f.scale.copy(o.scale).multiplyScalar(Math.min(1, 0.45 / Math.max(tam.x, tam.y, tam.z, 0.01)));   // las largas se achican para que entren en la vista
    escena.add(f); o.visible = false; mostrar(null);
    llevado = { o, f, nx, ny }; navigator.vibrate?.(15);
  };
  const terminarLlevar = soltar => {
    const { o, f, nx, ny } = llevado; llevado = null;
    escena.remove(f); o.visible = true;
    if (!soltar) return;
    const id = o.userData.id, en = contenedorDe(apuntar(nx, ny, o))?.id || "";
    if (en !== (itemDe(id)?.en || "")) alMover(id, en);
  };

  // Computadora: con el mouse sobre el visor, moverlo mira (como en un juego, sin capturarlo); la mira del centro apunta;
  // click = abrir o agregar lo que está en la mira; mantener el click y mover = llevar la herramienta.
  // Celular: arrastrar mira, tocar abre o agrega, mantener apretado y arrastrar lleva la herramienta.
  const conMira = !matchMedia("(pointer: coarse)").matches;   // compu: mirar con el mouse al pasar por el visor (sin capturarlo: el resto de la página sigue andando)
  let bloqueado = false, pendiente = null, toque = 0, borde = 0.5;   // bloqueado: el mouse está dentro del visor; pendiente: click que todavía puede ser arrastre; borde: dónde está el mouse (0 izq … 1 der)
  const mira = document.createElement("span"); mira.className = "inv-3d-mira"; mira.hidden = true;
  const punteros = new Map();
  let ini = null, pellizco = 0;
  c.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && conMira) {
      if (e.button !== 0 || !bloqueado) return;
      c.setPointerCapture(e.pointerId);   // si suelta afuera del visor, igual termina acá
      pendiente = { o: apuntar(0, 0), mov: 0 };
      return;
    }
    punteros.set(e.pointerId, [e.clientX, e.clientY]); c.setPointerCapture(e.pointerId);
    ini = punteros.size === 1 ? [e.clientX, e.clientY] : null;
    clearTimeout(toque);
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pellizco = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    else { const pos = enPantalla(e), o = apuntar(...pos); if (llevable(o)) toque = setTimeout(() => empezarLlevar(o, ...pos), 450); }   // mantener apretado
  });
  c.addEventListener("mousemove", e => {
    if (!bloqueado) return;
    const r = c.getBoundingClientRect(); borde = (e.clientX - r.left) / r.width;   // cerca del borde, la vista sigue girando sola
    v.yaw -= e.movementX * 0.0025; v.pitch -= e.movementY * 0.0025;
    if (pendiente && (pendiente.mov += Math.abs(e.movementX) + Math.abs(e.movementY)) > 25) {
      if (llevable(pendiente.o)) empezarLlevar(pendiente.o);
      pendiente = null;
    }
  });
  c.addEventListener("pointermove", e => {
    if (llevado && punteros.has(e.pointerId)) { [llevado.nx, llevado.ny] = enPantalla(e); return; }
    const ant = punteros.get(e.pointerId);
    if (ant) {
      punteros.set(e.pointerId, [e.clientX, e.clientY]);
      if (ini && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) > 8) clearTimeout(toque);
      const dx = e.clientX - ant[0], dy = e.clientY - ant[1], sentido = e.pointerType === "mouse" ? -1 : 1;   // mouse: hacia donde lo movés; dedo: se "agarra" la escena
      if (punteros.size === 1) { v.yaw += sentido * dx * 0.004; v.pitch += sentido * dy * 0.004; }
      else if (punteros.size === 2) { const [a, b] = [...punteros.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pellizco) caminar((d - pellizco) * 0.01, 0); pellizco = d; }
      if (tip) tip.hidden = true;
      return;
    }
    if (e.pointerType !== "mouse" || bloqueado) return;
    const r = c.getBoundingClientRect();
    mostrar(apuntar(...enPantalla(e)), e.clientX - r.left, e.clientY - r.top);
    c.style.cursor = conMira ? "crosshair" : "grab";
  });
  const soltar = e => {
    if (e.pointerType === "mouse" && conMira) {
      if (llevado) terminarLlevar(e.type === "pointerup");
      else if (pendiente && e.type === "pointerup") elegir(pendiente.o);
      pendiente = null;
      return;
    }
    if (!punteros.has(e.pointerId)) return;
    clearTimeout(toque);
    punteros.delete(e.pointerId); pellizco = 0;
    if (llevado) { [llevado.nx, llevado.ny] = enPantalla(e); terminarLlevar(e.type === "pointerup"); }
    else if (ini && e.type === "pointerup" && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) < 8) elegir(apuntar(...enPantalla(e)));
    ini = null;
  };
  c.addEventListener("pointerup", soltar); c.addEventListener("pointercancel", soltar);
  c.addEventListener("contextmenu", e => e.preventDefault());   // mantener apretado en el celular no abre el menú
  // Compu: con el mouse sobre el visor se mira; al salir, se suelta lo que llevaba y vuelve el velo
  c.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && conMira) entrar(true); });
  c.addEventListener("pointerleave", e => {
    if (e.pointerType !== "mouse") return;
    if (conMira) { if (llevado) terminarLlevar(false); pendiente = null; entrar(false); } else mostrar(null);
  });
  c.addEventListener("wheel", e => { e.preventDefault(); caminar(-lim(e.deltaY, -100, 100) * 0.006, 0); }, { passive: false });
  const teclas = new Set();
  const TECLAS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
  c.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k === "escape") e.stopPropagation();   // en el visor, Esc no vuelve atrás de pantalla
    if (TECLAS.includes(k)) { e.preventDefault(); teclas.add(k); }
  });
  c.addEventListener("keyup", e => teclas.delete(e.key.toLowerCase()));
  c.addEventListener("blur", () => teclas.clear());
  c.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") c.focus({ preventScroll: true }); });
  // Botones: volver al lugar de entrada y, en pantallas táctiles, caminar (mantener apretado)
  const centrar = document.createElement("button");
  centrar.type = "button"; centrar.className = "inv-3d-centrar"; centrar.textContent = "Centrar";
  centrar.onclick = () => Object.assign(v, INICIO);
  const pad = document.createElement("div");
  pad.className = "inv-3d-pad";
  pad.innerHTML = [["w", "▲", "Adelante"], ["a", "◀", "Izquierda"], ["s", "▼", "Atrás"], ["d", "▶", "Derecha"]]
    .map(([k, f, t]) => `<button type="button" data-k="${k}" aria-label="${t}">${f}</button>`).join("");
  pad.addEventListener("pointerdown", e => { const b = e.target.closest("[data-k]"); if (b) { e.preventDefault(); b.setPointerCapture(e.pointerId); teclas.add(b.dataset.k); } });
  const soltarPad = e => { const b = e.target.closest("[data-k]"); if (b) teclas.delete(b.dataset.k); };
  pad.addEventListener("pointerup", soltarPad); pad.addEventListener("pointercancel", soltarPad);
  pad.addEventListener("contextmenu", e => e.preventDefault());
  // Cartel con los controles
  const ayuda = document.createElement("p");
  ayuda.className = "inv-3d-ayuda";
  const TXT = !conMira ? "Arrastrá para mirar · caminá con los botones o pellizcando" : "Hacé click para mirar con el mouse · WASD o flechas para caminar";
  ayuda.textContent = TXT;
  let tAyuda = 0;
  const sacarAyuda = () => ayuda.classList.add("fuera");
  if (!conMira) { c.addEventListener("pointerdown", sacarAyuda, { once: true }); pad.addEventListener("pointerdown", sacarAyuda, { once: true }); }
  else sacarAyuda();   // en la compu lo dice el velo
  // Computadora, con el mouse fuera del visor: la escena se oscurece y un cartel invita a pasar el mouse.
  // (No se captura el mouse: así el resto de la página, como el botón 2D, sigue andando.)
  const velo = document.createElement("div");
  velo.className = "inv-3d-velo"; velo.hidden = !conMira;
  velo.innerHTML = `<b>Pasá el mouse por acá para entrar</b><small>Mové el mouse para mirar (en el borde sigue girando) · WASD o flechas para caminar</small>`;
  const entrar = dentro => {
    bloqueado = dentro; borde = 0.5;
    velo.hidden = !conMira || dentro;
    mira.hidden = !dentro;
    c.style.cursor = dentro ? "none" : "";
    if (dentro) c.focus({ preventScroll: true }); else mostrar(null);
    ayuda.textContent = dentro ? "Click: abrir o agregar donde apunta la mira · mantené el click y mové para llevar una herramienta" : TXT;
    ayuda.classList.remove("fuera"); clearTimeout(tAyuda); if (dentro) tAyuda = setTimeout(sacarAyuda, 4000);
  };
  el.append(velo, centrar, pad, ayuda, mira);

  const medir = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    render.setSize(w, h, false); camara.aspect = w / h;
    camara.fov = w / h < 1 ? 80 : 65;   // en vertical, más ángulo para no ver todo por un tubo
    camara.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(medir); ro.observe(el); medir();
  let vivo = true;
  const cuadro = () => {
    if (!vivo) return;
    if (!el.isConnected) return desarmar();
    if (teclas.size) {
      const ad = (teclas.has("w") || teclas.has("arrowup") ? 1 : 0) - (teclas.has("s") || teclas.has("arrowdown") ? 1 : 0);
      const de = (teclas.has("d") || teclas.has("arrowright") ? 1 : 0) - (teclas.has("a") || teclas.has("arrowleft") ? 1 : 0);
      caminar(ad * 0.045, de * 0.045);
    }
    if (!sinMovimiento) { const t = performance.now() / 1000; for (const f of flotantes) { f.g.position.y = f.y + Math.sin(t * 1.6 + f.fase) * 0.04; f.g.rotation.y = Math.sin(t * 0.5 + f.fase) * 0.2; } }
    if (bloqueado && !llevado) { if (borde < 0.07) v.yaw += 0.022; else if (borde > 0.93) v.yaw -= 0.022; }   // mouse en el borde: sigue girando
    aplicar();
    if (llevado) {   // la herramienta que se lleva flota adelante, donde apunta la mira o el dedo
      p.set(llevado.nx, llevado.ny); ray.setFromCamera(p, camara);
      llevado.f.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 0.9); llevado.f.quaternion.copy(camara.quaternion);
    } else if (bloqueado) mostrar(apuntar(0, 0), c.clientWidth / 2, c.clientHeight / 2 - 16);   // lo que está en la mira
    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  };
  function desarmar() {
    if (!vivo) return; vivo = false; ro.disconnect(); clearTimeout(toque);
    escena.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    render.dispose(); c.remove(); centrar.remove(); pad.remove(); ayuda.remove(); mira.remove(); velo.remove();
  }
  cuadro();
  return desarmar;
}
