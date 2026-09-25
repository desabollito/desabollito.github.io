// Vista 3D del vehículo (three.js). Los paños marcados se pintan en azul.
// Arrastrar para girar; tocar un paño muestra su nombre.
import { PIEZA } from "./domain.js";

let cargando = null;
function cargarThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  cargando ??= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = () => ok(window.THREE);
    s.onerror = () => { cargando = null; ko(new Error("No se pudo cargar la vista 3D")); };
    document.head.appendChild(s);
  });
  return cargando;
}

// Geometría: frente hacia +z, arriba +y. Izquierda del conductor = +x.
// [clave, ancho(x), alto(y), largo(z), x, y, z]
const PANOS = [
  ["capot", 1.62, 0.05, 1.05, 0, 0.86, 1.42],
  ["techo", 1.30, 0.05, 1.55, 0, 1.44, -0.15],
  ["baul", 1.62, 0.05, 0.75, 0, 0.90, -1.62],
  ["parante_izq", 0.08, 0.08, 1.60, 0.68, 1.40, -0.15],
  ["parante_der", 0.08, 0.08, 1.60, -0.68, 1.40, -0.15],
  ["gf_izq", 0.05, 0.42, 0.95, 0.91, 0.62, 1.45],
  ["pd_izq", 0.05, 0.48, 0.95, 0.91, 0.62, 0.45],
  ["pt_izq", 0.05, 0.48, 0.90, 0.91, 0.62, -0.50],
  ["gt_izq", 0.05, 0.42, 0.90, 0.91, 0.62, -1.48],
  ["gf_der", 0.05, 0.42, 0.95, -0.91, 0.62, 1.45],
  ["pd_der", 0.05, 0.48, 0.95, -0.91, 0.62, 0.45],
  ["pt_der", 0.05, 0.48, 0.90, -0.91, 0.62, -0.50],
  ["gt_der", 0.05, 0.42, 0.90, -0.91, 0.62, -1.48]
];

export async function montar3D(contenedor, piezas = {}, alTocar) {
  const THREE = await cargarThree();
  const oscuro = document.documentElement.getAttribute("data-theme") !== "light";
  const ancho = contenedor.clientWidth || 320, alto = 280;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(35, ancho / alto, 0.1, 100);
  camara.position.set(5.2, 3.2, 5.6);
  camara.lookAt(0, 0.7, 0);

  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  render.setSize(ancho, alto);
  contenedor.innerHTML = "";
  contenedor.appendChild(render.domElement);

  escena.add(new THREE.HemisphereLight(0xffffff, oscuro ? 0x223344 : 0x99aabb, 0.9));
  const sol = new THREE.DirectionalLight(0xffffff, 0.8);
  sol.position.set(4, 8, 5);
  escena.add(sol);

  const auto = new THREE.Group();
  escena.add(auto);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
  const caja = (w, h, l, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    m.position.set(x, y, z); auto.add(m); return m;
  };

  // Carrocería base, cabina de vidrio y ruedas
  caja(1.8, 0.55, 4.1, mat(oscuro ? 0x3a4a60 : 0x9aa7b8), 0, 0.58, 0);
  caja(1.42, 0.52, 1.75, mat(0x6f8fb5, { transparent: true, opacity: 0.55 }), 0, 1.13, -0.15);
  const rueda = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 24);
  const matRueda = mat(0x15191f);
  for (const [x, z] of [[0.86, 1.35], [-0.86, 1.35], [0.86, -1.35], [-0.86, -1.35]]) {
    const r = new THREE.Mesh(rueda, matRueda);
    r.rotation.z = Math.PI / 2; r.position.set(x, 0.36, z); auto.add(r);
  }

  // Paños
  const azul = 0x5b86ff, gris = oscuro ? 0x7d8ea6 : 0xd5dde8;
  const mallas = PANOS.map(([k, w, h, l, x, y, z]) => {
    const m = caja(w, h, l, mat(piezas[k] ? azul : gris, piezas[k] ? { emissive: 0x1a2f7a, emissiveIntensity: 0.35 } : {}), x, y, z);
    m.userData.pieza = k;
    return m;
  });

  // Girar arrastrando (con giro automático suave hasta que se toque)
  let arrastrando = false, movio = false, px = 0, py = 0, auto_giro = true;
  let rotY = -0.6, rotX = 0;
  const lienzo = render.domElement;
  lienzo.style.touchAction = "pan-y";
  lienzo.addEventListener("pointerdown", e => { arrastrando = true; movio = false; px = e.clientX; py = e.clientY; auto_giro = false; });
  addEventListener("pointerup", () => { arrastrando = false; });
  lienzo.addEventListener("pointermove", e => {
    if (!arrastrando) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    if (Math.abs(dx) + Math.abs(dy) > 3) movio = true;
    rotY += dx * 0.012; rotX = Math.max(-0.5, Math.min(0.5, rotX + dy * 0.006));
    px = e.clientX; py = e.clientY;
  });

  // Tocar un paño
  const ray = new THREE.Raycaster(), punto = new THREE.Vector2();
  lienzo.addEventListener("click", e => {
    if (movio) return;
    const r = lienzo.getBoundingClientRect();
    punto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(punto, camara);
    const hit = ray.intersectObjects(mallas)[0];
    if (hit) alTocar?.(hit.object.userData.pieza, PIEZA[hit.object.userData.pieza]?.label);
  });

  const cuadro = () => {
    if (!lienzo.isConnected) { render.dispose(); return; } // se cerró la vista
    if (auto_giro) rotY += 0.004;
    auto.rotation.y = rotY; auto.rotation.x = rotX;
    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  };
  cuadro();
}
