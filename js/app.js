import {
  S, onChange, iniciarSesion, ingresar, crearCuenta, mensajeError, elegirEmpresa
} from "./data.js";
import { $, $$, esc, toast, busy, openSheet } from "./ui.js";
import { FIREBASE } from "./config.js";
import { iniciarFechas } from "./fecha.js";
import { cuentaPendiente, salir, marcarOperativosVistos, soyCreador, crearEmpresa, pedirUnion, cancelarPedidoUnion, escucharMiPedido, responderPedidoUnion, soyDesmontaje, miRol, soyAdmin, getVehiculo } from "./data.js";
import { marcarNav, pintarLateral, esAncho } from "./shell.js";
import { vistaVehiculos, vistaDetalle, vistaFormulario, reiniciarVista3D, elegirVehiculoDesmontaje } from "./views-vehiculos.js";
import {
  vistaPlanilla, vistaCalendario, calendarioAlEntrar, reiniciarCalendario, vistaEmpresa, vistaAjustes, vistaPapelera, elegirEmpresaSheet, panelCreador
} from "./views-otros.js";
import { vistaGastos, formGasto } from "./views-gastos.js";
import { vistaPlanillas, vistaTecnicos } from "./views-tecnicos.js";

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
  [/^#\/v\/([\w-]+)$/,      "vehiculos",  id => esAncho() && !S.volverA ? vistaVehiculos(view, id) : vistaDetalle(view, id)],
  [/^#\/o\/([\w-]+\/v\/[\w-]+)$/, "link", a => irAVehiculo(a.replace("/v/", "|"))],
  [/^#\/nuevo$/,            "nuevo",      () => vistaFormulario(view)],
  [/^#\/editar\/([\w-]+)$/, "editar",     id => vistaFormulario(view, id)],
  [/^#\/planillas$/,        "planillas",  () => vistaPlanillas(view)],
  [/^#\/planilla$/,         "planilla",   () => vistaPlanilla(view)],
  [/^#\/tecnicos$/,         "tecnicos",   () => vistaTecnicos(view)],
  [/^#\/calendario$/,       "calendario", () => vistaCalendario(view)],
  [/^#\/(operativo|empresa)$/, "operativo", () => vistaEmpresa(view)],
  [/^#\/gastos$/,           "gastos",     () => vistaGastos(view)],
  [/^#\/ajustes$/,          "ajustes",    () => vistaAjustes(view)],
  [/^#\/papelera$/,         "papelera",   () => vistaPapelera(view)]
];

function render({ conservarScroll = false, reabrir = false } = {}) {
  if (!S.user || !S.profile || S.sinOperativo) return;
  const h = location.hash || "#/";
  let hit = RUTAS.find(([re]) => re.test(h)) || RUTAS[0];
  // Rol Desmontaje: no carga ni edita vehículos; "nuevo" abre la elección de vehículo para el desmontaje
  document.body.dataset.rol = miRol();
  if (soyDesmontaje() && ["nuevo", "editar"].includes(hit[1])) {
    const nuevo = hit[1] === "nuevo";
    history.replaceState(null, "", "#/"); hit = RUTAS[0];
    if (nuevo) setTimeout(elegirVehiculoDesmontaje, 50);
  }
  const arg = hit[1] === "operativo" ? null : (h.match(hit[0])?.[1] || null);
  const mismaRuta = ruta.nombre === hit[1] && ruta.arg === arg;
  // La lista y el calendario recuerdan su scroll y el último vehículo abierto (al volver de cualquier lado)
  const claveScroll = (n, a) => n === "vehiculos" && !a ? "lista" : n;
  const previa = ruta;
  const plAntes = $(".split-on .pane-list");
  if (plAntes) memScroll.pane = plAntes.scrollTop;
  if (!mismaRuta && ["lista", "calendario"].includes(claveScroll(previa.nombre, previa.arg))) memScroll[claveScroll(previa.nombre, previa.arg)] = scrollY;
  const nuevaClave = claveScroll(hit[1], arg);
  // Computadora: al volver a Vehículos desde otra sección, se reabre el último vehículo
  if (nuevaClave === "lista" && esAncho() && S.ultimoVid && previa.nombre && previa.nombre !== "vehiculos" && previa.nombre !== "editar" && getVehiculo(S.ultimoVid)) {
    history.replaceState(null, "", `#/v/${S.ultimoVid}`);
    return render({ reabrir: true });
  }
  // Vehículo abierto desde el calendario: al salir vuelve al calendario (no a la lista)
  if (hit[1] === "vehiculos" && arg) { if (reabrir) S.volverA = null; else if (ruta.nombre === "calendario") S.volverA = "#/calendario"; else if (ruta.nombre === "vehiculos" && !ruta.arg) S.volverA = null; }
  else if (hit[1] !== "editar") S.volverA = null;
  const y = conservarScroll && mismaRuta ? scrollY : 0;
  ruta = { nombre: hit[1], arg };
  document.body.dataset.ruta = hit[1];
  document.body.dataset.detalle = hit[1] === "vehiculos" && arg ? "1" : "";
  marcarNav(["nuevo", "editar", "operativo"].includes(hit[1]) ? "" : hit[1] === "papelera" ? "ajustes" : ["planilla", "gastos", "tecnicos"].includes(hit[1]) ? "planillas" : hit[1]);
  pintarTabPlanilla(hit[1]);
  // Menú lateral (computadora): Planillas se despliega con sus 3 planillas
  const enPlan = ["planillas", "planilla", "gastos", "tecnicos"].includes(hit[1]);
  $(".side-grupo")?.classList.toggle("abierto", enPlan);
  $$(".side-sub a").forEach(a => a.classList.toggle("on", a.dataset.sub === hit[1]));
  const subTec = $('.side-sub [data-sub="tecnicos"]'); if (subTec) subTec.hidden = !soyAdmin();
  if (hit[1] === "calendario" && !mismaRuta) calendarioAlEntrar();
  if (!mismaRuta) reiniciarVista3D(); // cada vez que se abre un vehículo, arranca en 2D
  ultimoRender = Date.now();
  ctrl = hit[2](arg) || null;
  if (hit[1] === "vehiculos" && arg) S.ultimoVid = arg;
  // Último vehículo abierto: marcado en la lista y el calendario
  const marcar = () => { if (!S.ultimoVid) return null;
    const el = $(`a[href="#/v/${S.ultimoVid}"]`, view); el?.classList.add("sel"); return el; };
  const aLaVista = (el, caja) => { if (!el) return;
    const r = el.getBoundingClientRect(), c = caja ? caja.getBoundingClientRect() : { top: 60, bottom: innerHeight - 70 };
    if (r.top < c.top || r.bottom > c.bottom) el.scrollIntoView({ block: "center" }); };
  // Computadora: la lista de la izquierda queda donde estaba
  const pl = $(".split-on .pane-list");
  if (pl) {
    if (memScroll.pane != null) pl.scrollTop = memScroll.pane;
    if (!mismaRuta) aLaVista(marcar() || $(".vcard.sel", pl), pl);
    if (!mismaRuta) view.focus({ preventScroll: true });
    if (previa.nombre === "vehiculos" || conservarScroll) return;
  }
  if (!mismaRuta && memScroll[nuevaClave] != null) {
    const yy = memScroll[nuevaClave];
    scrollTo(0, yy); view.focus({ preventScroll: true });
    requestAnimationFrame(() => { scrollTo(0, yy); aLaVista(marcar()); });
    return;
  }
  if (!mismaRuta && ["lista", "calendario"].includes(nuevaClave)) requestAnimationFrame(() => marcar());
  if (conservarScroll && mismaRuta && ["lista", "calendario"].includes(nuevaClave)) marcar();
  if (!conservarScroll || !mismaRuta) { scrollTo(0, 0); view.focus({ preventScroll: true }); }
  else scrollTo(0, y);
}
// El scroll lo maneja la app (si no, el navegador lo pisa al volver atrás)
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const memScroll = {};
let ultimoRender = 0;
// Volver "de cero": sin vehículo marcado y arriba de todo (y en el calendario, el día automático)
function reiniciarSeccion(cual) {
  S.ultimoVid = null;
  delete memScroll.lista; delete memScroll.pane; delete memScroll.calendario;
  if (cual === "calendario") reiniciarCalendario();
  $$(".vcard.sel", view).forEach(el => el.classList.remove("sel"));
}
// Tocar de nuevo la pestaña en la que ya estás
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-nav]");
  if (!a || !["vehiculos", "calendario"].includes(a.dataset.nav) || ruta.nombre !== a.dataset.nav) return;
  e.preventDefault();
  reiniciarSeccion(a.dataset.nav);
  if (location.hash !== a.getAttribute("href") && !(a.getAttribute("href") === "#/" && !location.hash)) history.replaceState(null, "", a.getAttribute("href"));
  ruta = { nombre: null, arg: null };
  render();
  scrollTo({ top: 0 });
  const pl = $(".split-on .pane-list"); if (pl) pl.scrollTop = 0;
});
// Subir hasta arriba de todo a mano: se olvida el vehículo marcado
let yAnterior = 0;
addEventListener("scroll", () => {
  const y = scrollY;
  if (y <= 0 && yAnterior > 150 && Date.now() - ultimoRender > 800 && ["vehiculos", "calendario"].includes(ruta.nombre) && !(ruta.nombre === "vehiculos" && ruta.arg && !esAncho()))
    reiniciarSeccion("scroll");
  yAnterior = y;
}, { passive: true });
document.addEventListener("scroll", e => {
  const pl = e.target?.classList?.contains("pane-list") && e.target.closest(".split-on") ? e.target : null;
  if (!pl) return;
  if (pl.scrollTop <= 0 && (pl._yAnt || 0) > 150 && Date.now() - ultimoRender > 800) { reiniciarSeccion("scroll"); }
  pl._yAnt = pl.scrollTop;
}, { passive: true, capture: true });

addEventListener("hashchange", () => render());

// Celular: la pestaña Planilla alterna con Gastos al tocarla de nuevo
// La pestaña "Planillas" abre el menú de planillas (vehículos, técnicos y gastos)
function pintarTabPlanilla(r) {
  $("#tab-planilla").classList.toggle("on", ["planillas", "planilla", "gastos", "tecnicos"].includes(r));
}

// Botón flotante: en Gastos carga un gasto, en el resto un vehículo
$(".fab").addEventListener("click", e => {
  if (ruta.nombre === "gastos") { e.preventDefault(); formGasto(); }
});
// Rol Desmontaje: cualquier "Nuevo vehículo" abre la elección de un vehículo ya cargado
document.addEventListener("click", e => {
  if (!soyDesmontaje() || ruta.nombre === "gastos") return;
  if (e.target.closest('a[href="#/nuevo"]')) { e.preventDefault(); elegirVehiculoDesmontaje(); }
}, true);
matchMedia("(min-width: 1100px)").addEventListener("change", () => render({ conservarScroll: true }));

// Cambios de datos en vivo (otro técnico cargó algo, llegó la sincronización, etc.)
onChange(what => {
  if (what?.tipo === "agregado") { avisarAgregado(what.operativos); return; }
  if (what?.tipo === "pedidos-union") { mostrarPedidosUnion(); return; }
  if (what === "sin-operativo") { mostrarSinOperativo(); if (!S.sinOperativo) { pintarLateral(); render(); } return; }
  if (what === "perfil") { mostrarSegunAprobacion(); if (!cuentaPendiente()) render({ conservarScroll: true }); return; }
  if (what === "companies" || what === "profile") pintarLateral();
  if (!S.profile) return;
  // Nunca repintar un formulario a mitad de carga: se perdería lo escrito
  if (["nuevo", "editar"].includes(ruta.nombre) && $("#vform")) return; // sí se pinta si todavía estaba cargando
  if (document.activeElement?.classList?.contains("post-rep") && what === "vehicles") return;   // escribiendo post-reparación
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
    busy($("#login-submit"), false);
    $("#login-form").reset();
    view.innerHTML = "";
    return;
  }
  if (error) toast("No se pudo cargar tu perfil: " + mensajeError(error), "error");
  if (mostrarSegunAprobacion()) return;
  mostrarSinOperativo();
  pintarLateral();
  render();
});

// Cuenta nueva sin aprobar: pantalla de espera (se desbloquea sola al aprobarla)
function mostrarSegunAprobacion() {
  let el = $("#espera");
  if (!cuentaPendiente()) {
    if (el && !el.hidden) { el.hidden = true; $("#shell").hidden = false; pintarLateral(); render(); toast("¡Tu cuenta fue aprobada! 🎉", "success"); }
    return false;
  }
  if (!el) {
    el = document.createElement("section");
    el.id = "espera"; el.className = "espera";
    document.body.appendChild(el);
    el.addEventListener("click", async e => {
      if (e.target.closest("[data-salir]")) salir();

    });
  }
  const rechazada = S.profile?.rechazado;
  el.innerHTML = `<div class="espera-caja">
      <img src="img/logo-oscuro.png" alt="" class="espera-logo">
      <h1>${rechazada ? "Tu solicitud no fue aprobada" : "Solicitud enviada"}</h1>
      ${rechazada ? `<p>Si creés que es un error, comunicate con nosotros a <a href="mailto:desabollito@gmail.com">desabollito@gmail.com</a></p>`
        : `<p>Recibimos tu registro como <strong>${S.profile?.username || ""}</strong>.</p>
           <p>Una vez aprobado, esta pantalla se abre sola.</p>`}
      <div class="espera-btns">
        <button class="btn btn-ghost" data-salir>Cerrar sesión</button>
      </div></div>`;
  el.hidden = false; $("#shell").hidden = true;
  return true;
}

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
    bar.querySelector("button").onclick = () => {
      busy(bar.querySelector("button"), true, "Actualizando…"); recargarAlCambiar = true; sw.postMessage("activar");
      // Aviso abajo de la barra, por si el navegador no recarga solo
      if (!$(".update-hint")) {
        const hint = document.createElement("button");
        hint.type = "button"; hint.className = "update-hint";
        hint.textContent = "Si se queda cargando, recargá la página";
        hint.onclick = () => location.reload();
        bar.after(hint);
        requestAnimationFrame(() => hint.classList.add("in"));
      }
    };
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

// Selector de fecha propio en toda la app
iniciarFechas();

// Cartel al abrir la app cuando alguien te sumó a un operativo
function avisarAgregado(ops) {
  const esc = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const quien = o => o.por?.user ? "@" + o.por.user : o.por?.por || "Alguien";
  const s = openSheet({
    title: ops.length === 1 ? "¡Te sumaron a un operativo!" : "¡Te sumaron a operativos nuevos!",
    body: `<div class="stack">${ops.map(o => `<p><strong>${esc(quien(o))}</strong> te agregó a <strong>${esc(o.name)}</strong>.</p>`).join("")}
      <div class="row-btns">
        <button class="btn btn-ghost" data-ok>Entendido</button>
        ${ops.length === 1 && S.company?.id !== ops[0].id ? `<button class="btn btn-primary" data-ir>Ir al operativo</button>` : ""}
      </div></div>`,
    onClose: () => marcarOperativosVistos(ops.map(o => o.id))
  });
  $("[data-ok]", s.el).onclick = () => s.close();
  const ir = $("[data-ir]", s.el);
  if (ir) ir.onclick = () => { elegirEmpresa(ops[0].id); s.close(); location.hash = "#/"; };
}

// Dos toques seguidos en el botón de Ajustes (solo el creador de la app): panel con todos los operativos y usuarios
{
  // Un toque va a Ajustes (con una espera cortita); dos toques abren el panel
  let reloj = null;
  document.addEventListener("click", e => {
    if (!e.target.closest('a[href="#/ajustes"]') || !soyCreador()) return;
    e.preventDefault();
    if (reloj) { clearTimeout(reloj); reloj = null; panelCreador(); return; }
    reloj = setTimeout(() => { reloj = null; location.hash = "#/ajustes"; }, 320);
  }, true);
}

// ── Sin operativo: pedir unirse a uno o crear uno propio ─────────
let unsubMiPedido = null, pedidoActual = null, pintarSinOp = () => {};
function mostrarSinOperativo() {
  let el = $("#sin-op");
  if (!S.sinOperativo || cuentaPendiente()) {
    if (el && !el.hidden) { el.hidden = true; el.dataset.listo = ""; $("#shell").hidden = false; }
    unsubMiPedido?.(); unsubMiPedido = null; pedidoActual = null;
    return;
  }
  if (!el) {
    el = document.createElement("section");
    el.id = "sin-op"; el.className = "espera";
    document.body.appendChild(el);
    el.addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, b = $("button[type=submit]", f);
      busy(b, true, "Enviando…");
      try {
        if (f.id === "so-unir") { await pedirUnion(f.admin.value); toast("Pedido enviado", "success"); }
        else { await crearEmpresa(f.nombre.value.trim()); toast("Operativo creado", "success"); }
      } catch (err) { toast(err.message || mensajeError(err), "error"); }
      busy(b, false);
    });
    el.addEventListener("click", e => {
      if (e.target.closest("[data-salir]")) salir();
      if (e.target.closest("[data-cancelar]")) cancelarPedidoUnion().catch(() => {});
      const op = e.target.closest("button[data-op]");
      if (op) { el.dataset.modo = op.dataset.op; pintarSinOp(pedidoActual); }
    });
  }
  if (!el.hidden && el.dataset.listo) return; // ya se está mostrando: no se repinta (se perdería lo escrito)
  el.dataset.listo = "1";
  const pintar = p => {
    pedidoActual = p;
    const op = el.dataset.modo || "";
    el.innerHTML = `<div class="espera-caja">
      <img src="img/logo-oscuro.png" alt="" class="espera-logo">
      <h1>Todavía no tenés ningún operativo</h1>
      ${p ? `<p>Le pediste a <strong>@${esc(p.paraUser)}</strong> que te sume a su operativo.</p>
             <p>Cuando lo haga, esta pantalla se abre sola.</p>
             <div class="espera-btns"><button class="btn btn-ghost" data-cancelar>Cancelar pedido</button></div>`
      : `<p>¿Querés pedir unirte a uno o crear el tuyo?</p>
      <div class="so-ops">
        <button type="button" class="btn ${op === "unir" ? "btn-primary" : "btn-ghost"}" data-op="unir">Unirme a uno</button>
        <button type="button" class="btn ${op === "crear" ? "btn-primary" : "btn-ghost"}" data-op="crear">Crear uno</button>
      </div>
      ${op === "unir" ? `<form id="so-unir" class="so-form">
          <label class="field"><span>Usuario de quien administra el operativo</span>
            <input name="admin" required autocomplete="off" autocapitalize="none" placeholder="Ej: juanperez"></label>
          <button class="btn btn-primary btn-block" type="submit">Pedir unirme</button></form>` : ""}
      ${op === "crear" ? `<form id="so-crear" class="so-form">
          <label class="field"><span>Nombre del operativo</span>
            <input name="nombre" required autocomplete="off" placeholder="Ej: Granizo Córdoba 2026"></label>
          <button class="btn btn-primary btn-block" type="submit">Crear operativo</button></form>` : ""}`}
</div>`;
  };
  pintarSinOp = pintar;
  pintar(null);
  el.hidden = false; $("#shell").hidden = true;
  if (!unsubMiPedido) unsubMiPedido = escucharMiPedido(p => { if (JSON.stringify(p) !== JSON.stringify(pedidoActual)) pintar(p); });
}

// Administradores: alguien sin operativo pidió que lo sumen
const pedidosVistos = new Set();
function mostrarPedidosUnion() {
  const p = (S.pedidosUnion || []).find(x => !pedidosVistos.has(x.id));
  if (!p) return;
  pedidosVistos.add(p.id);
  const mios = S.companies.filter(c => ["owner", "admin"].includes(c.roles?.[S.user.uid]));
  if (!mios.length) return;
  const s = openSheet({ title: "Pedido para unirse", body: `<form class="stack">
      <p><strong>${esc(p.name || "")}</strong> (@${esc(p.username || "")}) quiere unirse a tu operativo.</p>
      <label class="field"><span>Sumarlo a</span><select name="cid">${mios.map(c => `<option value="${esc(c.id)}" ${c.id === S.company?.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Rol</span><select name="rol">${[["desmontaje", "Desmontador"], ["tecnico", "Técnico"], ["admin", "Administrador"]].map(([k, l]) =>
        `<option value="${k}" ${(p.rol || "tecnico") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="row-btns"><button type="button" class="btn btn-ghost" data-no>Rechazar</button>
        <button class="btn btn-primary" type="submit">Sumar</button></div></form>` });
  $("form", s.el).onsubmit = async e => {
    e.preventDefault();
    try { await responderPedidoUnion(p, e.target.cid.value, e.target.rol.value); toast(`${p.name || "@" + p.username} ahora es parte del operativo`, "success"); s.close(); }
    catch (err) { toast(err.message || mensajeError(err), "error"); }
  };
  $("[data-no]", s.el).onclick = async () => { await responderPedidoUnion(p, null).catch(() => {}); s.close(); };
}
addEventListener("hashchange", () => document.querySelector(".menu-velo")?.remove());
