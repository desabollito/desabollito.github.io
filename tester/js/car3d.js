// Vista 3D del vehículo (three.js). Los paños marcados se pintan en azul.
// Se gira solo alrededor (arrastrando); tocar un paño lo nombra o, en edición, lo marca.
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

// Perfil lateral de un sedán: z = largo (frente hacia +z), y = alto
const RUEDA_R = 0.36, ARCO_R = 0.43, EJE_T = -1.4, EJE_D = 1.4, PISO = 0.33, CINTURA = 0.99;
const X_LADO = 0.885; // cara exterior de la carrocería

export async function montar3D(contenedor, piezas = {}, opciones = {}) {
  if (typeof opciones === "function") opciones = { alTocar: opciones };
  const { alTocar, editable = false } = opciones;
  const THREE = await cargarThree();
  const oscuro = document.documentElement.getAttribute("data-theme") !== "light";
  const ancho = contenedor.clientWidth || 320, alto = 280;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(32, ancho / alto, 0.1, 100);
  camara.position.set(0, 2.6, 8.2);
  camara.lookAt(0, 0.75, 0);

  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  render.setSize(ancho, alto);
  contenedor.innerHTML = "";
  contenedor.appendChild(render.domElement);

  escena.add(new THREE.HemisphereLight(0xffffff, oscuro ? 0x1c2735 : 0x8f9fb3, 0.75));
  const sol = new THREE.DirectionalLight(0xffffff, 0.9); sol.position.set(5, 9, 6); escena.add(sol);
  const relleno = new THREE.DirectionalLight(0xbfd4ff, 0.35); relleno.position.set(-6, 3, -5); escena.add(relleno);

  const auto = new THREE.Group();
  escena.add(auto);

  const pintura = color => new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 });
  const COLOR_BASE = oscuro ? 0x8d9bb0 : 0xc9d2de, COLOR_MARCA = 0x4f7dff;

  // Las formas se dibujan en el plano (u, y) con u = -z; al rotar 90° quedan a lo largo del auto
  const P = (z, y) => [-z, y];
  const extruir = (forma, profundidad, material, xCentro = 0, bisel = 0.02) => {
    const geo = new THREE.ExtrudeGeometry(forma, { depth: profundidad, bevelEnabled: bisel > 0, bevelSize: bisel, bevelThickness: bisel, bevelSegments: 2, curveSegments: 24 });
    geo.translate(0, 0, -profundidad / 2);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.position.x = xCentro;
    auto.add(m);
    return m;
  };
  const poligono = pts => { const s = new THREE.Shape(); s.moveTo(...P(...pts[0])); pts.slice(1).forEach(p => s.lineTo(...P(...p))); s.closePath(); return s; };

  // ── Carrocería con arcos de rueda
  const cuerpo = new THREE.Shape();
  cuerpo.moveTo(...P(-2.22, PISO));
  cuerpo.lineTo(...P(EJE_T - ARCO_R, PISO));
  cuerpo.absarc(-EJE_T, RUEDA_R, ARCO_R, 0, Math.PI, false);
  cuerpo.lineTo(...P(EJE_D - ARCO_R, PISO));
  cuerpo.absarc(-EJE_D, RUEDA_R, ARCO_R, 0, Math.PI, false);
  cuerpo.lineTo(...P(2.2, PISO));
  cuerpo.lineTo(...P(2.28, 0.58));
  cuerpo.lineTo(...P(2.16, 0.86));
  cuerpo.lineTo(...P(1.1, CINTURA));
  cuerpo.lineTo(...P(-1.35, CINTURA));
  cuerpo.lineTo(...P(-2.22, 0.94));
  cuerpo.lineTo(...P(-2.3, 0.6));
  cuerpo.closePath();
  const carroceria = extruir(cuerpo, X_LADO * 2 - 0.06, pintura(COLOR_BASE), 0, 0.03);
  carroceria.userData.cuerpo = true;

  // ── Cabina de vidrio
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x223044, metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0.88 });
  const cabina = extruir(poligono([[-1.3, CINTURA], [-0.72, 1.43], [0.34, 1.45], [1.06, CINTURA]]), 1.44, vidrio, 0, 0.02);
  cabina.userData.vidrio = true;

  // ── Paños
  const mallas = {};
  const registrar = (k, m) => { m.userData.pieza = k; (mallas[k] ||= []).push(m); };
  registrar("capot", extruir(poligono([[1.1, CINTURA + 0.005], [2.13, 0.865], [2.265, 0.64], [2.3, 0.64], [2.17, 0.9], [1.1, CINTURA + 0.04]]), 1.62, pintura(COLOR_BASE), 0, 0.015));
  registrar("techo", extruir(poligono([[-0.74, 1.435], [0.36, 1.455], [0.36, 1.49], [-0.74, 1.47]]), 1.36, pintura(COLOR_BASE), 0, 0.015));
  registrar("baul", extruir(poligono([[-2.21, 0.945], [-1.35, CINTURA + 0.005], [-1.35, CINTURA + 0.04], [-2.25, 0.98], [-2.335, 0.66], [-2.3, 0.66]]), 1.62, pintura(COLOR_BASE), 0, 0.015));
  registrar("capot", extruir(poligono([[2.1, PISO + 0.04], [2.3, 0.58], [2.18, 0.885], [2.12, 0.885], [2.24, 0.58], [2.05, PISO + 0.04]]), 1.62, pintura(COLOR_BASE), 0, 0.012));
  registrar("baul", extruir(poligono([[-2.18, PISO + 0.04], [-2.33, 0.6], [-2.24, 0.965], [-2.18, 0.965], [-2.27, 0.6], [-2.12, PISO + 0.04]]), 1.62, pintura(COLOR_BASE), 0, 0.012));
  const borde = [[-1.33, CINTURA], [-0.73, 1.44], [0.35, 1.46], [1.08, CINTURA]];
  const franja = [...borde, ...borde.slice().reverse().map(([z, y]) => [z, y - 0.075])];
  registrar("parante_izq", extruir(poligono(franja), 0.08, pintura(COLOR_BASE), 0.7, 0.01));
  registrar("parante_der", extruir(poligono(franja), 0.08, pintura(COLOR_BASE), -0.7, 0.01));

  const lateral = (lado, x) => {
    const gf = new THREE.Shape();
    gf.moveTo(...P(EJE_D - ARCO_R - 0.02, CINTURA - 0.02));
    gf.lineTo(...P(2.12, 0.85)); gf.lineTo(...P(2.22, 0.58)); gf.lineTo(...P(2.17, PISO + 0.03));
    gf.lineTo(...P(EJE_D + ARCO_R, PISO + 0.03));
    gf.absarc(-EJE_D, RUEDA_R, ARCO_R + 0.01, Math.PI, 0, true);
    gf.closePath();
    const gt = new THREE.Shape();
    gt.moveTo(...P(EJE_T + ARCO_R + 0.02, CINTURA - 0.02));
    gt.lineTo(...P(-2.2, 0.93)); gt.lineTo(...P(-2.27, 0.6)); gt.lineTo(...P(-2.2, PISO + 0.03));
    gt.lineTo(...P(EJE_T - ARCO_R, PISO + 0.03));
    gt.absarc(-EJE_T, RUEDA_R, ARCO_R + 0.01, 0, Math.PI, false);
    gt.closePath();
    const puerta = (z0, z1) => poligono([[z0, PISO + 0.05], [z1, PISO + 0.05], [z1, CINTURA - 0.02], [z0, CINTURA - 0.02]]);
    const esp = 0.03, xx = x + Math.sign(x) * 0.005;
    registrar(`gf_${lado}`, extruir(gf, esp, pintura(COLOR_BASE), xx, 0.008));
    registrar(`pd_${lado}`, extruir(puerta(-0.02, EJE_D - ARCO_R - 0.04), esp, pintura(COLOR_BASE), xx, 0.008));
    registrar(`pt_${lado}`, extruir(puerta(EJE_T + ARCO_R + 0.04, -0.06), esp, pintura(COLOR_BASE), xx, 0.008));
    registrar(`gt_${lado}`, extruir(gt, esp, pintura(COLOR_BASE), xx, 0.008));
  };
  lateral("izq", X_LADO);   // izquierda del conductor = +x (frente hacia +z)
  lateral("der", -X_LADO);

  // ── Ruedas, ópticas y espejos
  const cubierta = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.9 });
  const llanta = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.8, roughness: 0.25 });
  for (const z of [EJE_T, EJE_D]) for (const x of [0.8, -0.8]) {
    const zona = `${z > 0 ? "gf" : "gt"}_${x > 0 ? "izq" : "der"}`;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(RUEDA_R, RUEDA_R, 0.26, 32), cubierta);
    r.rotation.z = Math.PI / 2; r.position.set(x, RUEDA_R, z); r.userData.rueda = zona; auto.add(r);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 24), llanta);
    l.rotation.z = Math.PI / 2; l.position.set(x * 1.01, RUEDA_R, z); l.userData.rueda = zona; auto.add(l);
  }
  const optica = (color, emis, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), new THREE.MeshStandardMaterial({ color, emissive: emis, emissiveIntensity: 0.6 }));
    m.position.set(x, y, z); auto.add(m);
  };
  for (const x of [0.58, -0.58]) {
    optica(0xdfe6f0, 0x556070, x, 0.72, 2.3, 0.42, 0.1);
    optica(0xdfe6f0, 0x556070, x, 0.8, -2.34, 0.45, 0.1);
  }
  for (const x of [0.95, -0.95]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.16), pintura(COLOR_BASE));
    e.position.set(x, 1.05, 0.95); auto.add(e);
  }
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: oscuro ? 0.35 : 0.12 }));
  sombra.rotation.x = -Math.PI / 2; sombra.scale.set(0.45, 1, 1); sombra.position.y = 0.005; escena.add(sombra);

  const pintar = p => {
    for (const [k, ms] of Object.entries(mallas)) for (const m of ms) {
      m.material.color.setHex(p[k] ? COLOR_MARCA : COLOR_BASE);
      m.material.emissive.setHex(p[k] ? 0x14286e : 0x000000);
    }
  };
  pintar(piezas);

  // ── Girar solo alrededor (eje vertical)
  let arrastrando = false, movio = false, px = 0, autoGiro = true, rotY = -0.7;
  const lienzo = render.domElement;
  lienzo.style.touchAction = "pan-y";
  lienzo.addEventListener("pointerdown", e => { arrastrando = true; movio = false; px = e.clientX; autoGiro = false; });
  addEventListener("pointerup", () => { arrastrando = false; });
  lienzo.addEventListener("pointermove", e => {
    if (!arrastrando) return;
    const dx = e.clientX - px;
    if (Math.abs(dx) > 3) movio = true;
    rotY += dx * 0.012; px = e.clientX;
  });

  // ── Tocar un paño
  const ray = new THREE.Raycaster(), punto = new THREE.Vector2();
  const tocables = auto.children;
  const panoDe = hit => {
    const u = hit.object.userData;
    if (u.pieza) return u.pieza;
    if (u.rueda) return u.rueda;
    if (u.vidrio) {
      // Ventanas laterales → parante de ese lado; parabrisas y luneta no marcan nada
      const q = auto.worldToLocal(hit.point.clone());
      return Math.abs(q.x) > 0.6 ? `parante_${q.x > 0 ? "izq" : "der"}` : null;
    }
    if (!u.cuerpo) return null;
    const p = auto.worldToLocal(hit.point.clone());
    const lado = p.x > 0 ? "izq" : "der";
    if (p.z > 1.9 || (p.y > CINTURA - 0.08 && p.z > 1.05)) return "capot";
    if (p.z < -2.05 || (p.y > CINTURA - 0.12 && p.z < -1.3)) return "baul";
    if (Math.abs(p.x) > 0.6) {
      if (p.z > EJE_D - ARCO_R) return `gf_${lado}`;
      if (p.z > -0.04) return `pd_${lado}`;
      if (p.z > EJE_T + ARCO_R) return `pt_${lado}`;
      return `gt_${lado}`;
    }
    return null;
  };
  lienzo.addEventListener("click", e => {
    if (movio) return;
    const r = lienzo.getBoundingClientRect();
    punto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(punto, camara);
    const hit = ray.intersectObjects(tocables, true)[0];
    if (!hit) return;
    const k = panoDe(hit);
    if (!k) return;
    if (editable) navigator.vibrate?.(8);
    alTocar?.(k, PIEZA[k]?.label);
  });

  const cuadro = () => {
    if (!lienzo.isConnected) { render.dispose(); return; }
    if (autoGiro) rotY += 0.004;
    auto.rotation.y = rotY;
    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  };
  cuadro();
  return { pintar };
}
