// ═════════════════════════════════════════════════════════════
//  INVENTARIO: las herramientas de cada técnico, en un taller dibujado (2D o 3D) y en lista.
//  Valijas y carros guardan herramientas ("en": id del contenedor); lo que está en un carro se ve en el carro.
// ═════════════════════════════════════════════════════════════
import { S, leerInventario, guardarInventario, mensajeError } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, busy } from "./ui.js";
import { subir, comprimir, thumb } from "./media.js";
import { setTopbar } from "./shell.js";

// Tipos de herramienta PDR, en el orden de la lista
const CATS = {
  varilla: "Varillas", martillo: "Martillos y punzones", inercial: "Martillos inerciales y pullers", gancho: "Ganchos y accesorios",
  lampara: "Lámparas", carro: "Carro", valija: "Valijas", desmontaje: "Desmontaje", varios: "Varios"
};
const CONTENEDOR = ["valija", "carro"];
// Tipos de la primera versión → los de ahora
const VIEJO = { pantalla: "lampara", pie: "lampara", pegamento: "inercial", limpieza: "varios", otro: "varios" };
// Sugerencias al escribir (lo típico de un kit PDR): nombre → tipo
const SUGERENCIAS = {
  varilla: ["Varilla de puerta", "Varilla cola de ballena", "Varilla de capot", "Varilla de techo", "Varilla doble punta", "Varilla de guardabarros"],
  martillo: ["Martillo de goma", "Martillo de teflón", "Martillo de bola", "Punzón de nylon", "Punzón de metal", "Tap-down", "Juego de puntas intercambiables"],
  inercial: ["Martillo inercial", "Mini lifter", "Puller en T", "Puente de tracción", "Pistola de pegamento", "Barras de pegamento", "Tabs de tracción", "Removedor de pegamento"],
  gancho: ["Gancho de ventanilla", "Gancho en S", "Ventosa", "Cuña inflable", "Protector de ventanilla", "Puntas de repuesto"],
  lampara: ["Lámpara LED de líneas", "Pantalla reflectora de mano", "Lámpara con pie", "Trípode para lámpara"],
  carro: ["Carro común", "Carro alto"],
  valija: ["Valija de varillas", "Valija de pegamento", "Caja de herramientas"],
  desmontaje: ["Saca grampas", "Kit de palancas plásticas", "Juego de tubos y llaves", "Destornilladores"],
  varios: ["Spray con alcohol isopropílico", "Paños de microfibra", "Linterna de cabeza", "Cinta de enmascarar"]
};
const catDe = nombre => Object.keys(SUGERENCIAS).find(c => SUGERENCIAS[c].some(s => s.toLowerCase() === nombre.trim().toLowerCase()));
const modeloDe = nombre => /alto/i.test(nombre) ? "alto" : "comun";
{ console.assert(Object.keys(SUGERENCIAS).every(c => CATS[c]) && Object.values(VIEJO).every(c => CATS[c]) && catDe(" mini LIFTER ") === "inercial" && !catDe("xyz") && modeloDe("Carro alto") === "alto", "inventario: tipos"); }

// Dibujos simples de cada tipo (usan el color del tipo con currentColor)
const DIBUJO = {
  varilla: `<svg viewBox="0 0 24 120" preserveAspectRatio="none"><path d="M4 7h16M12 7v96q0 10-9 11"/></svg>`,
  martillo: `<svg viewBox="0 0 40 64"><rect x="5" y="4" width="30" height="13" rx="4" class="lleno"/><path d="M20 17v44"/></svg>`,
  inercial: `<svg viewBox="0 0 30 90"><path d="M5 6h20M15 6v80"/><rect x="8" y="34" width="14" height="22" rx="3" class="lleno"/></svg>`,
  gancho: `<svg viewBox="0 0 34 70"><path d="M17 4v40a10 10 0 1 1-12-9"/></svg>`,
  lampara: `<svg viewBox="0 0 48 150"><rect x="4" y="4" width="40" height="50" rx="4"/><path d="M10 14h28M10 24h28M10 34h28M10 44h28" class="rayas"/><path d="M24 54v80M24 134l-16 14M24 134l16 14M24 134v14"/></svg>`,
  carro: `<svg viewBox="0 0 74 62"><rect x="4" y="8" width="66" height="13" rx="3" class="lleno"/><rect x="4" y="38" width="66" height="9" rx="3" class="lleno"/><path d="M9 21v29M65 21v29M1 8h72"/><circle cx="10" cy="56" r="4"/><circle cx="64" cy="56" r="4"/></svg>`,
  carroAlto: `<svg viewBox="0 0 54 96"><rect x="3" y="5" width="48" height="9" rx="2" class="lleno"/><path d="M27 14v66"/><rect x="8" y="50" width="38" height="6" rx="2" class="lleno"/><path d="M6 84h42"/><circle cx="8" cy="90" r="4"/><circle cx="46" cy="90" r="4"/></svg>`,
  valija: `<svg viewBox="0 0 84 52"><path d="M32 12V5h20v7"/><rect x="3" y="12" width="78" height="37" rx="6" class="lleno"/><path d="M3 26h78M18 22v8M66 22v8"/></svg>`,
  desmontaje: `<svg viewBox="0 0 64 24"><rect x="2" y="5" width="24" height="14" rx="5" class="lleno"/><path d="M26 12h26l8-5"/></svg>`,
  varios: `<svg viewBox="0 0 40 34"><rect x="3" y="8" width="34" height="23" rx="3" class="lleno"/><path d="M3 15h34M17 15v5h6v-5"/></svg>`
};
const dibujo = i => i.cat === "carro" && i.modelo === "alto" ? DIBUJO.carroAlto : DIBUJO[i.cat] || DIBUJO.varios;
const largo = id => 62 + [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38;   // varillas de distinto largo (siempre igual para la misma)
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function vistaInventario(view) {
  setTopbar({ title: "Inventario", back: "#/ajustes" });
  view.innerHTML = `<div class="page inventario"><div class="skeleton" style="height:340px"></div></div>`;
  let items;
  const normalizar = l => l.map(i => CATS[i.cat] ? i : { ...i, cat: VIEJO[i.cat] || "varios" });
  try { items = normalizar(await leerInventario()); }
  catch (e) { view.innerHTML = `<div class="page"><div class="empty"><p>${esc(mensajeError(e))}</p></div></div>`; return; }

  const de = id => items.find(i => i.id === id);
  const contenedores = (sin = "") => items.filter(i => CONTENEDOR.includes(i.cat) && i.id !== sin);
  const dondeTxt = i => { const c = de(i.en); return !c ? "" : (c.cat === "carro" ? "En el carro " : "Dentro de ") + c.nombre; };
  async function guardar() {
    try { await guardarInventario(items); }
    catch (e) { toast(mensajeError(e), "error"); items = normalizar(await leerInventario().catch(() => items)); pintar(); }
  }
  const cambiar = nuevos => { items = nuevos; pintar(); guardar(); };

  const obj = i => `<button type="button" class="inv-obj inv-${i.cat}" data-ver="${esc(i.id)}" aria-label="${esc(i.nombre)}" title="${esc(i.nombre)}"
      ${i.cat === "varilla" ? `style="height:${largo(i.id)}%"` : ""}>${dibujo(i)}${(i.cant || 1) > 1 ? `<b class="inv-n">×${i.cant}</b>` : ""}
      ${CONTENEDOR.includes(i.cat) ? `<b class="inv-n">${items.filter(x => x.en === i.id).length || ""}</b>` : ""}<span class="inv-nom">${esc(i.nombre)}</span></button>`;
  // Cada zona: sus herramientas sueltas (las guardadas en una valija no se ven; las del carro siguen en la pared) y una etiqueta para agregar ahí
  const zona = (cat, clase = "") => `<div class="inv-zona ${clase}"><button type="button" class="inv-etq" data-nueva="${cat}">${icon("plus")}${CATS[cat]}</button>
      <div class="inv-objs">${items.filter(i => i.cat === cat && de(i.en)?.cat !== "valija").map(obj).join("")}</div></div>`;
  const miniatura = i => i.foto?.url ? `<img class="inv-foto" src="${esc(thumb(i.foto.url))}" alt="" loading="lazy">` : `<span class="inv-foto inv-${i.cat}">${dibujo(i)}</span>`;
  const fila = i => `<div class="aj-item inv-fila"><button type="button" class="inv-fila-ver" data-ver="${esc(i.id)}">${miniatura(i)}
      <span class="aj-txt">${esc(i.nombre)}</span><span class="aj-val">${[(i.cant || 1) > 1 ? "×" + i.cant : "", esc(dondeTxt(i))].filter(Boolean).join(" · ")}</span></button>
      <button type="button" class="icon-btn sm" data-ed="${esc(i.id)}" aria-label="Editar ${esc(i.nombre)}" title="Editar">${icon("edit")}</button></div>`;

  let quitar3D = () => {};
  function pintar() {
    const total = items.reduce((a, i) => a + (i.cant || 1), 0);
    const en3D = (() => { try { return localStorage.getItem("invVista") === "3d"; } catch { return false; } })();
    quitar3D(); quitar3D = () => {};
    view.innerHTML = `<div class="page inventario">
      <div class="seg seg-sm inv-modo" id="inv-modo"><button class="seg-btn ${en3D ? "" : "on"}" data-m="2d">2D</button><button class="seg-btn ${en3D ? "on" : ""}" data-m="3d">3D</button></div>
      ${en3D ? `<div class="inv-3d" id="inv-3d"><p class="inv-3d-carga">Cargando el taller en 3D…</p><span class="inv-3d-tip" hidden></span></div>` : `
      <div class="inv-sala" role="group" aria-label="Taller">
        <div class="inv-pared">${zona("varilla", "inv-varillas")}${zona("martillo")}${zona("gancho")}</div>
        <div class="inv-mesa"><div class="inv-tapa">${zona("inercial")}${zona("desmontaje")}${zona("varios")}</div>
          <div class="inv-bajo">${zona("valija")}${zona("carro")}</div></div>
        <div class="inv-piso">${zona("lampara")}</div>
      </div>`}
      <button type="button" class="btn btn-primary btn-block" id="inv-agregar">${icon("plus")}Agregar herramientas</button>
      <p class="muted small">${items.length ? `${total} ${total === 1 ? "herramienta" : "herramientas"}. Tocá una para verla; el lápiz de la lista la edita.` : "Todavía no cargaste herramientas."}</p>
      ${Object.entries(CATS).map(([k, t]) => { const l = items.filter(i => i.cat === k).sort((a, b) => a.nombre.localeCompare(b.nombre));
        return l.length ? `<section class="aj-grupo"><h3>${t} · ${l.length}</h3><div class="aj-lista">${l.map(fila).join("")}</div></section>` : ""; }).join("")}
    </div>`;
    $("#inv-modo", view).onclick = e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      try { localStorage.setItem("invVista", b.dataset.m); } catch { /* sin almacenamiento */ }
      pintar();
    };
    if (en3D) {
      const caja = $("#inv-3d", view);
      import("./inventario3d.js").then(m => m.montar3D(caja, items, id => de(id) && ver(de(id))))
        .then(q => { quitar3D = q; caja.querySelector(".inv-3d-carga")?.remove(); })
        .catch(e => { caja.querySelector(".inv-3d-carga").textContent = e.message; });
    }
    view.querySelector(".inventario").onclick = e => {
      const b = e.target.closest("[data-ver], [data-ed], [data-nueva], #inv-agregar"); if (!b) return;
      if (b.id === "inv-agregar") editar({ cat: "varilla" });
      else if (b.dataset.nueva) editar({ cat: b.dataset.nueva });
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
      <dl class="inv-datos">${dato("Tipo", CATS[it.cat])}${it.cat === "carro" ? dato("Modelo", it.modelo === "alto" ? "Alto" : "Común") : ""}
        ${dato("Cantidad", String(it.cant || 1))}${dato("Dónde está", dondeTxt(it) || "En su lugar del taller")}${dato("Nota", it.nota)}</dl>
      ${esCont ? `<h3 class="inv-sub">${it.cat === "carro" ? "En el carro" : "Adentro"} · ${dentro.length}</h3>
        ${dentro.length ? `<div class="aj-lista">${dentro.map(fila).join("")}</div>` : `<p class="muted small">${it.cat === "carro" ? "El carro está vacío." : "La valija está vacía."}</p>`}` : ""}
      <div class="row-btns inv-acciones">
        ${esCont ? `<button type="button" class="btn btn-ghost" data-elegir>${icon("check")}Elegir herramientas</button>` : ""}
        ${!esCont && enCarro ? `<button type="button" class="btn btn-ghost" data-mover="">${icon("restore")}Sacar del carro</button>`
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
  const mover = (it, en) => { cambiar(items.map(i => i.id === it.id ? { ...i, en } : i)); toast(en ? `En ${de(en).nombre}` : "Fuera del carro", "success"); };
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

  function editar(it) {
    const nuevo = !it.id;
    let foto = it.foto || null;
    const s = openSheet({ title: nuevo ? "Agregar herramienta" : "Editar herramienta", body: `<form class="stack" id="inv-f" autocomplete="off">
      <label class="field"><span>Herramienta</span><input name="nombre" list="inv-sug" required maxlength="80" value="${esc(it.nombre || "")}" placeholder="Ej: Varilla cola de ballena"></label>
      <datalist id="inv-sug">${Object.values(SUGERENCIAS).flat().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <div class="aj-fila"><label class="field"><span>Tipo</span><select name="cat">${Object.entries(CATS).map(([k, t]) => `<option value="${k}" ${k === it.cat ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Cantidad</span><input name="cant" type="number" inputmode="numeric" min="1" max="999" value="${it.cant || 1}"></label></div>
      <label class="field inv-modelo"><span>Modelo de carro</span><select name="modelo"><option value="comun">Común (dos estantes)</option>
        <option value="alto" ${it.modelo === "alto" ? "selected" : ""}>Alto (con bandeja arriba)</option></select></label>
      <label class="field inv-en"><span>Dónde está</span><select name="en"><option value="">En su lugar del taller</option>
        ${contenedores(it.id).map(c => `<option value="${esc(c.id)}" ${c.id === it.en ? "selected" : ""}>${c.cat === "carro" ? "En el carro" : "Dentro de"} ${esc(c.nombre)}</option>`).join("")}</select></label>
      <label class="field"><span>Nota</span><input name="nota" maxlength="200" value="${esc(it.nota || "")}" placeholder="Medida, marca, estado…"></label>
      <div class="inv-foto-campo"><span id="inv-prev">${foto ? `<img class="inv-foto-grande" src="${esc(foto.url)}" alt="">` : ""}</span>
        <div class="row-btns"><label class="btn btn-ghost">${icon("camera")}${foto ? "Cambiar foto" : "Agregar foto"}<input type="file" accept="image/*" hidden id="inv-file"></label>
          <button type="button" class="btn btn-ghost" id="inv-sin-fondo" ${foto ? "" : "hidden"}>${icon("image")}Quitar fondo</button>
          <button type="button" class="btn btn-ghost" id="inv-sin-foto" ${foto ? "" : "hidden"}>Quitar foto</button>
          ${nuevo ? "" : `<button type="button" class="btn btn-ghost danger" id="inv-borrar">${icon("trash")}Borrar</button>`}</div></div>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button></form>` });
    const f = $("#inv-f", s.el), guardarBtn = f.querySelector("[type=submit]");
    const verCampos = () => {
      const cont = CONTENEDOR.includes(f.cat.value);
      $(".inv-en", f).hidden = cont || !contenedores(it.id).length;
      $(".inv-modelo", f).hidden = f.cat.value !== "carro";
    };
    verCampos(); f.cat.onchange = verCampos;
    f.nombre.oninput = () => { const c = catDe(f.nombre.value); if (c) { f.cat.value = c; if (c === "carro") f.modelo.value = modeloDe(f.nombre.value); verCampos(); } };
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
      if (pendiente) {
        busy(guardarBtn, true, "Subiendo foto…");
        try { foto = { url: (await subir(pendiente, `inventario/${S.user.uid}`, { nombre: f.nombre.value })).url }; }
        catch (err) { busy(guardarBtn, false); return toast(err.message, "error"); }
      }
      const cat = f.cat.value, cont = CONTENEDOR.includes(cat);
      const datos = { nombre: f.nombre.value.trim(), cat, cant: Math.min(999, Math.max(1, parseInt(f.cant.value, 10) || 1)),
        en: cont ? "" : f.en.value, nota: f.nota.value.trim(), ...(cat === "carro" ? { modelo: f.modelo.value } : {}), ...(foto ? { foto } : {}) };
      s.close();
      if (nuevo) cambiar([...items, { id: nuevoId(), ...datos }]);
      else cambiar(items.map(i => i.id === it.id ? { id: it.id, ...datos } : i)
        .map(i => !cont && i.en === it.id ? { ...i, en: "" } : i));   // dejó de ser valija o carro: lo de adentro vuelve a su lugar
    };
  }

  pintar();
}
