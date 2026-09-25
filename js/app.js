import {
  S, onChange, iniciarSesion, ingresar, crearCuenta, ingresarConGoogle, mensajeError, elegirEmpresa
} from "./data.js";
import { $, $$, toast, busy } from "./ui.js";
import { FIREBASE } from "./config.js";
import { marcarNav, pintarLateral, esAncho } from "./shell.js";
import { vistaVehiculos, vistaDetalle, vistaFormulario, reiniciarVista3D } from "./views-vehiculos.js";
import {
  vistaPlanilla, vistaCalendario, calendarioAlEntrar, vistaEmpresa, vistaAjustes, vistaPapelera, elegirEmpresaSheet
} from "./views-otros.js";
import { vistaGastos, formGasto } from "./views-gastos.js";

const view = $("#view");
let ruta = { nombre: "", arg: null };
let ctrl = null;

// ── Rutas ─────────────────────────────────────────────────────
// Link directo desde el bot: #/o/<operativo>/v/<vehículo>
function irAVehiculo(arg) {
  const [cid, vid] = arg.split("|");
  if (!S.companies.length) { view.innerHTML = `<div class="skeleton tall"></div>`; return; }
  if (!S.companies.some(c => c.id === cid)) {
    view.innerHTML = `<div class="empty"><h2>No tenés acceso a ese operativo</h2><p>Pedile a un administrador que te sume.</p>
      <a class="btn btn-primary" href="#/">Ver vehículos</a></div>`;
    return;
  }
  if (S.company?.id !== cid) elegirEmpresa(cid);
  location.replace(`#/v/${vid}`);
}

const RUTAS = [
  [/^#?\/?$/,               "vehiculos",  () => vistaVehiculos(view)],
  [/^#\/v\/([\w-]+)$/,      "vehiculos",  id => esAncho() ? vistaVehiculos(view, id) : vistaDetalle(view, id)],
  [/^#\/o\/([\w-]+\/v\/[\w-]+)$/, "link", a => irAVehiculo(a.replace("/v/", "|"))],
  [/^#\/nuevo$/,            "nuevo",      () => vistaFormulario(view)],
  [/^#\/editar\/([\w-]+)$/, "editar",     id => vistaFormulario(view, id)],
  [/^#\/planilla$/,         "planilla",   () => vistaPlanilla(view)],
  [/^#\/calendario$/,       "calendario", () => vistaCalendario(view)],
  [/^#\/(operativo|empresa)$/, "operativo", () => vistaEmpresa(view)],
  [/^#\/gastos$/,           "gastos",     () => vistaGastos(view)],
  [/^#\/ajustes$/,          "ajustes",    () => vistaAjustes(view)],
  [/^#\/papelera$/,         "papelera",   () => vistaPapelera(view)]
];

function render({ conservarScroll = false } = {}) {
  if (!S.user || !S.profile) return;
  const h = location.hash || "#/";
  const hit = RUTAS.find(([re]) => re.test(h)) || RUTAS[0];
  const arg = hit[1] === "operativo" ? null : (h.match(hit[0])?.[1] || null);
  const mismaRuta = ruta.nombre === hit[1] && ruta.arg === arg;
  const y = conservarScroll && mismaRuta ? scrollY : 0;
  ruta = { nombre: hit[1], arg };
  document.body.dataset.ruta = hit[1];
  document.body.dataset.detalle = hit[1] === "vehiculos" && arg ? "1" : "";
  marcarNav(["nuevo", "editar", "operativo"].includes(hit[1]) ? "" : hit[1] === "papelera" ? "ajustes" : hit[1]);
  pintarTabPlanilla(hit[1]);
  if (hit[1] === "calendario" && !mismaRuta) calendarioAlEntrar();
  if (!mismaRuta) reiniciarVista3D(); // cada vez que se abre un vehículo, arranca en 2D
  ctrl = hit[2](arg) || null;
  if (!conservarScroll || !mismaRuta) { scrollTo(0, 0); view.focus({ preventScroll: true }); }
  else scrollTo(0, y);
}

addEventListener("hashchange", () => render());

// Celular: la pestaña Planilla alterna con Gastos al tocarla de nuevo
function pintarTabPlanilla(r) {
  const t = $("#tab-planilla");
  const gastos = r === "gastos";
  t.classList.toggle("on", r === "planilla" || gastos);
  t.classList.toggle("is-gastos", gastos);
  $("use", t).setAttribute("href", gastos ? "#i-money" : "#i-table");
  $(".tab-label", t).textContent = gastos ? "Gastos" : "Planilla";
}
$("#tab-planilla").addEventListener("click", e => {
  if (ruta.nombre === "planilla") { e.preventDefault(); location.hash = "#/gastos"; navigator.vibrate?.(8); }
  else if (ruta.nombre === "gastos") { e.preventDefault(); location.hash = "#/planilla"; navigator.vibrate?.(8); }
});

// Botón flotante: en Gastos carga un gasto, en el resto un vehículo
$(".fab").addEventListener("click", e => {
  if (ruta.nombre === "gastos") { e.preventDefault(); formGasto(); }
});
matchMedia("(min-width: 1100px)").addEventListener("change", () => render({ conservarScroll: true }));

// Cambios de datos en vivo (otro técnico cargó algo, llegó la sincronización, etc.)
onChange(what => {
  if (what === "companies" || what === "profile") pintarLateral();
  if (!S.profile) return;
  // Nunca repintar un formulario a mitad de carga: se perdería lo escrito
  if (["nuevo", "editar"].includes(ruta.nombre) && $("#vform")) return; // sí se pinta si todavía estaba cargando
  if (what === "gastos") { if (ruta.nombre === "gastos") ctrl?.soloLista?.(); return; }
  if (what === "solicitudes") { if (["papelera", "ajustes"].includes(ruta.nombre)) render({ conservarScroll: true }); return; }
  if (what === "vehicles" && ruta.nombre === "gastos") return;
  if (what === "vehicles" && ctrl?.soloLista && !ruta.arg) { ctrl.soloLista(); return; }
  if (what === "error") { toast("Problema de conexión con la base de datos", "error"); return; }
  render({ conservarScroll: true });
});

document.addEventListener("elegir-empresa", elegirEmpresaSheet);
$("#company-switch").addEventListener("click", elegirEmpresaSheet);

// ── Login ─────────────────────────────────────────────────────
let modo = "ingresar";
$$(".seg-btn[data-modo]").forEach(b => b.addEventListener("click", () => {
  modo = b.dataset.modo;
  $$(".seg-btn[data-modo]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
  $$(".only-crear").forEach(el => el.hidden = modo !== "crear");
  $("#login-submit").textContent = modo === "crear" ? "Crear cuenta" : "Ingresar";
  $("#login-form").pass.autocomplete = modo === "crear" ? "new-password" : "current-password";
}));

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = $("#login-submit");
  const usuario = f.usuario.value.trim(), pass = f.pass.value;
  if (!usuario) return toast("Escribí tu usuario", "warning");
  if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) return toast("El usuario solo lleva letras, números, punto o guion", "warning");
  if (pass.length < 6) return toast("La contraseña tiene al menos 6 caracteres", "warning");
  busy(btn, true, modo === "crear" ? "Creando cuenta…" : "Ingresando…");
  try {
    if (modo === "crear") await crearCuenta(usuario, pass, f.nombre.value.trim());
    else await ingresar(usuario, pass);
  } catch (err) {
    toast(mensajeError(err), "error");
    busy(btn, false);
  }
});

$("#login-google").addEventListener("click", async e => {
  const b = e.currentTarget;
  busy(b, true, "Abriendo Google…");
  try { await ingresarConGoogle(); }
  catch (err) { if (err.code !== "auth/cancelled-popup-request") toast(mensajeError(err), "error"); busy(b, false); }
});

// ── Arranque ──────────────────────────────────────────────────
if (FIREBASE.apiKey.startsWith("TU_")) {
  $("#splash").innerHTML = `<div class="setup-msg"><h1>Falta configurar Firebase</h1>
    <p>Completá las claves del proyecto nuevo en <code>js/config.js</code> y volvé a publicar.</p></div>`;
  throw new Error("Firebase sin configurar (js/config.js)");
}
iniciarSesion((logueado, error) => {
  $("#splash").hidden = true;
  $("#login").hidden = logueado;
  $("#shell").hidden = !logueado;
  if (!logueado) {
    busy($("#login-submit"), false); busy($("#login-google"), false);
    $("#login-form").reset();
    view.innerHTML = "";
    return;
  }
  if (error) toast("No se pudo cargar tu perfil: " + mensajeError(error), "error");
  pintarLateral();
  render();
});

// ── Actualizaciones ───────────────────────────────────────────
// Tocar la versión en Ajustes fuerza la actualización: borra la copia guardada de la app y recarga desde el servidor.
if (/[?&]act=\d+/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
addEventListener("forzar-actualizacion", async () => {
  toast("Actualizando a la última versión…");
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith("-ext")).map(k => caches.delete(k)));   // el lector de patentes se conserva
    const regs = await navigator.serviceWorker?.getRegistrations() || [];
    await Promise.all(regs.map(r => r.unregister()));
  } catch (e) { console.warn("actualizar", e); }
  location.replace(location.pathname + "?act=" + Date.now() + location.hash);
});

// Si se publica una versión nueva mientras la app está abierta, aparece un aviso.
if ("serviceWorker" in navigator) {
  // Solo se recarga cuando el usuario tocó "Actualizar" (ni en la primera visita
  // ni cuando la versión nueva se activa sola al abrir la app).
  let recargarAlCambiar = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!recargarAlCambiar) return;
    recargarAlCambiar = false;
    location.reload();
  });

  const avisar = sw => {
    if ($("#update-bar")) return;
    const bar = document.createElement("div");
    bar.id = "update-bar";
    bar.className = "update-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = `<span>Hay una versión nueva de Desabollito</span><button class="btn btn-primary btn-sm">Actualizar</button>`;
    bar.querySelector("button").onclick = () => { busy(bar.querySelector("button"), true, "Actualizando…"); recargarAlCambiar = true; sw.postMessage("activar"); };
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add("in"));
  };

  addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
      // Al abrir, los archivos ya se bajaron frescos: si quedó una versión en espera, se activa sola.
      if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage("activar");

      reg.addEventListener("updatefound", () => {
        const nuevo = reg.installing;
        nuevo?.addEventListener("statechange", () => {
          if (nuevo.state === "installed" && navigator.serviceWorker.controller) avisar(nuevo);
        });
      });

      // Buscar versiones nuevas al volver a la app y cada 30 minutos
      const revisar = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") revisar(); });
      setInterval(revisar, 30 * 60 * 1000);
    } catch (e) { console.warn("SW", e); }
  });
}
