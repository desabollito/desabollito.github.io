// ═════════════════════════════════════════════════════════════
//  INVENTARIO: las herramientas de cada técnico, en un taller dibujado (pared, mesa, valijas) y en lista
// ═════════════════════════════════════════════════════════════
import { S, leerInventario, guardarInventario, mensajeError } from "./data.js";
import { $, esc, icon, toast, openSheet, confirmar, busy } from "./ui.js";
import { subir, comprimir, thumb } from "./media.js";
import { setTopbar } from "./shell.js";

// Tipos de herramienta PDR y dónde se ven en el taller (pared, mesa, piso o debajo de la mesa)
const CATS = {
  varilla:    { t: "Varillas", zona: "pared" },
  martillo:   { t: "Martillos y tap-down", zona: "pared" },
  pantalla:   { t: "Pantallas de mano", zona: "pared" },
  pegamento:  { t: "Pegamento y tracción", zona: "mesa" },
  desmontaje: { t: "Desmontaje", zona: "mesa" },
  limpieza:   { t: "Limpieza", zona: "mesa" },
  otro:       { t: "Otros", zona: "mesa" },
  pie:        { t: "Pantallas de pie", zona: "piso" },
  valija:     { t: "Valijas", zona: "bajo" }
};
// Sugerencias al escribir (lo típico de un kit PDR): nombre → tipo
const SUGERENCIAS = {
  varilla: ["Varilla de puerta", "Varilla cola de ballena", "Varilla de capot", "Varilla de techo", "Varilla doble punta", "Varilla de guardabarros", "Gancho de ventanilla"],
  martillo: ["Martillo de goma", "Martillo de teflón", "Martillo de bola", "Tap-down de nylon", "Tap-down de metal", "Juego de puntas para tap-down"],
  pantalla: ["Pantalla LED de mano", "Pantalla reflectora de líneas"],
  pie: ["Pantalla LED con pie", "Trípode para pantalla"],
  pegamento: ["Pistola de pegamento", "Barras de pegamento", "Tabs de tracción", "Mini lifter", "Martillo deslizante", "Puente de tracción", "Removedor de pegamento"],
  desmontaje: ["Saca grampas", "Kit de palancas plásticas", "Juego de tubos y llaves", "Destornilladores", "Cuña inflable", "Ventosa"],
  limpieza: ["Spray con alcohol isopropílico", "Paños de microfibra", "Espátula plástica"],
  valija: ["Valija de varillas", "Valija de pegamento", "Caja de herramientas"],
  otro: ["Linterna de cabeza", "Cinta de enmascarar"]
};
const catDe = nombre => Object.keys(SUGERENCIAS).find(c => SUGERENCIAS[c].some(s => s.toLowerCase() === nombre.trim().toLowerCase()));
{ console.assert(Object.keys(SUGERENCIAS).every(c => CATS[c]) && catDe(" mini LIFTER ") === "pegamento" && !catDe("xyz"), "inventario: sugerencias"); }

// Dibujos simples de cada tipo (usan el color del tipo con currentColor)
const DIBUJO = {
  varilla: `<svg viewBox="0 0 24 120" preserveAspectRatio="none"><path d="M4 7h16M12 7v96q0 10-9 11"/></svg>`,
  martillo: `<svg viewBox="0 0 40 64"><rect x="5" y="4" width="30" height="13" rx="4" class="lleno"/><path d="M20 17v44"/></svg>`,
  pantalla: `<svg viewBox="0 0 48 60"><rect x="4" y="4" width="40" height="52" rx="4"/><path d="M10 14h28M10 24h28M10 34h28M10 44h28" class="rayas"/></svg>`,
  pie: `<svg viewBox="0 0 48 150"><rect x="4" y="4" width="40" height="50" rx="4"/><path d="M10 14h28M10 24h28M10 34h28M10 44h28" class="rayas"/><path d="M24 54v80M24 134l-16 14M24 134l16 14M24 134v14"/></svg>`,
  pegamento: `<svg viewBox="0 0 64 48"><path d="M10 8h38a7 7 0 0 1 0 14H32l-5 22H16l5-22H10z" class="lleno"/><path d="M55 15h7M2 15h8"/></svg>`,
  desmontaje: `<svg viewBox="0 0 64 24"><rect x="2" y="5" width="24" height="14" rx="5" class="lleno"/><path d="M26 12h26l8-5"/></svg>`,
  limpieza: `<svg viewBox="0 0 32 64"><rect x="6" y="22" width="20" height="38" rx="5" class="lleno"/><path d="M11 22v-8h10v8M11 14V7h15l4 6"/></svg>`,
  otro: `<svg viewBox="0 0 40 34"><rect x="3" y="8" width="34" height="23" rx="3" class="lleno"/><path d="M3 15h34M17 15v5h6v-5"/></svg>`,
  valija: `<svg viewBox="0 0 84 52"><path d="M32 12V5h20v7"/><rect x="3" y="12" width="78" height="37" rx="6" class="lleno"/><path d="M3 26h78M18 22v8M66 22v8"/></svg>`
};
const largo = id => 62 + [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 38;   // varillas de distinto largo (siempre igual para la misma)
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function vistaInventario(view) {
  setTopbar({ title: "Inventario", back: "#/ajustes" });
  view.innerHTML = `<div class="page inventario"><div class="skeleton" style="height:340px"></div></div>`;
  let items;
  try { items = await leerInventario(); }
  catch (e) { view.innerHTML = `<div class="page"><div class="empty"><p>${esc(mensajeError(e))}</p></div></div>`; return; }

  const valijas = () => items.filter(i => i.cat === "valija");
  const nombreDe = id => items.find(i => i.id === id)?.nombre || "";
  async function guardar() {
    try { await guardarInventario(items); }
    catch (e) { toast(mensajeError(e), "error"); items = await leerInventario().catch(() => items); pintar(); }
  }

  const obj = i => `<button type="button" class="inv-obj inv-${i.cat}" data-id="${esc(i.id)}" aria-label="${esc(i.nombre)}" title="${esc(i.nombre)}"
      ${i.cat === "varilla" ? `style="height:${largo(i.id)}%"` : ""}>${DIBUJO[i.cat]}${(i.cant || 1) > 1 ? `<b class="inv-n">×${i.cant}</b>` : ""}
      ${i.cat === "valija" ? `<b class="inv-n">${items.filter(x => x.en === i.id).length || ""}</b>` : ""}<span class="inv-nom">${esc(i.nombre)}</span></button>`;
  // Cada zona: sus herramientas sueltas (las que están en una valija no se ven) y una etiqueta para agregar ahí
  const zona = (cat, clase = "") => `<div class="inv-zona ${clase}"><button type="button" class="inv-etq" data-nueva="${cat}">${icon("plus")}${CATS[cat].t}</button>
      <div class="inv-objs">${items.filter(i => i.cat === cat && !i.en).map(obj).join("")}</div></div>`;
  const fila = i => `<button type="button" class="aj-item inv-fila" data-id="${esc(i.id)}">
      ${i.foto?.url ? `<img class="inv-foto" src="${esc(thumb(i.foto.url))}" alt="" loading="lazy">` : `<span class="inv-foto inv-${i.cat}">${DIBUJO[i.cat]}</span>`}
      <span class="aj-txt">${esc(i.nombre)}</span><span class="aj-val">${[(i.cant || 1) > 1 ? "×" + i.cant : "", i.en ? "en " + esc(nombreDe(i.en)) : ""].filter(Boolean).join(" · ")}</span>${icon("next")}</button>`;

  let quitar3D = () => {};
  const abrir = id => { const it = items.find(i => i.id === id); if (it) (it.cat === "valija" ? verValija : editar)(it); };
  function pintar() {
    const total = items.reduce((a, i) => a + (i.cant || 1), 0);
    const en3D = (() => { try { return localStorage.getItem("invVista") === "3d"; } catch { return false; } })();
    quitar3D();
    view.innerHTML = `<div class="page inventario">
      <div class="seg seg-sm inv-modo" id="inv-modo"><button class="seg-btn ${en3D ? "" : "on"}" data-m="2d">2D</button><button class="seg-btn ${en3D ? "on" : ""}" data-m="3d">3D</button></div>
      ${en3D ? `<div class="inv-3d" id="inv-3d"><p class="inv-3d-carga muted small">Cargando el taller en 3D…</p><span class="inv-3d-tip" hidden></span></div>` : `
      <div class="inv-sala" role="group" aria-label="Taller">
        <div class="inv-pared">${zona("varilla", "inv-varillas")}${zona("martillo")}${zona("pantalla")}</div>
        <div class="inv-mesa"><div class="inv-tapa">${zona("pegamento")}${zona("desmontaje")}${zona("limpieza")}${zona("otro")}</div>
          <div class="inv-bajo">${zona("valija")}</div></div>
        <div class="inv-piso">${zona("pie")}</div>
      </div>`}
      <form class="inv-rapido" id="inv-rapido" autocomplete="off">
        <span class="field"><input name="nombre" list="inv-sug" required maxlength="80" placeholder="Agregar herramienta…" aria-label="Herramienta"></span>
        <select name="cat" aria-label="Tipo">${Object.entries(CATS).map(([k, c]) => `<option value="${k}">${c.t}</option>`).join("")}</select>
        <button class="btn btn-primary" type="submit" aria-label="Agregar">${icon("plus")}</button>
      </form>
      <datalist id="inv-sug">${Object.values(SUGERENCIAS).flat().map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <p class="muted small">${items.length ? `${total} ${total === 1 ? "herramienta" : "herramientas"}. Tocá una en el taller o en la lista para editarla o ponerle foto.` : "Todavía no cargaste herramientas. Escribí una arriba o tocá una etiqueta del taller."}</p>
      ${Object.entries(CATS).map(([k, c]) => { const l = items.filter(i => i.cat === k).sort((a, b) => a.nombre.localeCompare(b.nombre));
        return l.length ? `<section class="aj-grupo"><h3>${c.t} · ${l.length}</h3><div class="aj-lista">${l.map(fila).join("")}</div></section>` : ""; }).join("")}
    </div>`;
    const f = $("#inv-rapido", view);
    f.nombre.oninput = () => { const c = catDe(f.nombre.value); if (c) f.cat.value = c; };
    f.onsubmit = e => {
      e.preventDefault();
      items.push({ id: nuevoId(), nombre: f.nombre.value.trim(), cat: f.cat.value, cant: 1, en: "", nota: "" });
      const cat = f.cat.value; pintar(); guardar();
      $("#inv-rapido", view).cat.value = cat; $("#inv-rapido", view).nombre.focus();
    };
    $("#inv-modo", view).onclick = e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      try { localStorage.setItem("invVista", b.dataset.m); } catch { /* sin almacenamiento */ }
      pintar();
    };
    if (en3D) {
      const caja = $("#inv-3d", view);
      import("./inventario3d.js").then(m => m.montar3D(caja, items, abrir))
        .then(q => { quitar3D = q; caja.querySelector(".inv-3d-carga")?.remove(); })
        .catch(e => { caja.querySelector(".inv-3d-carga").textContent = e.message; });
    }
    view.querySelector(".inventario").onclick = e => {
      const b = e.target.closest("[data-id], [data-nueva]"); if (!b) return;
      if (b.dataset.nueva) return editar({ cat: b.dataset.nueva });
      const it = items.find(i => i.id === b.dataset.id);
      if (it.cat === "valija" && b.classList.contains("inv-obj")) verValija(it); else editar(it);
    };
  }

  // Valija: lo que tiene adentro, y agregar o editar
  function verValija(v) {
    const dentro = items.filter(i => i.en === v.id);
    const s = openSheet({ title: v.nombre, body: `<div class="stack">
      ${v.foto?.url ? `<img class="inv-foto-grande" src="${esc(v.foto.url)}" alt="">` : ""}
      ${dentro.length ? `<div class="aj-lista">${dentro.map(fila).join("")}</div>` : `<p class="muted small">La valija está vacía.</p>`}
      <div class="row-btns"><button type="button" class="btn btn-ghost" data-ed>${icon("edit")}Editar valija</button>
        <button type="button" class="btn btn-primary" data-add>${icon("plus")}Agregar adentro</button></div></div>` });
    s.el.onclick = e => {
      const r = e.target.closest("[data-id], [data-ed], [data-add]"); if (!r) return;
      s.close();
      if (r.dataset.id) editar(items.find(i => i.id === r.dataset.id));
      else if (r.hasAttribute("data-ed")) editar(v);
      else editar({ cat: "varilla", en: v.id });
    };
  }

  function editar(it) {
    const nuevo = !it.id;
    let foto = it.foto || null;
    const s = openSheet({ title: nuevo ? "Agregar herramienta" : "Editar herramienta", body: `<form class="stack" id="inv-f" autocomplete="off">
      <label class="field"><span>Herramienta</span><input name="nombre" list="inv-sug" required maxlength="80" value="${esc(it.nombre || "")}"></label>
      <div class="aj-fila"><label class="field"><span>Tipo</span><select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === it.cat ? "selected" : ""}>${c.t}</option>`).join("")}</select></label>
        <label class="field"><span>Cantidad</span><input name="cant" type="number" inputmode="numeric" min="1" max="999" value="${it.cant || 1}"></label></div>
      <label class="field inv-en"><span>Dónde está</span><select name="en"><option value="">En su lugar del taller</option>
        ${valijas().filter(v => v.id !== it.id).map(v => `<option value="${esc(v.id)}" ${v.id === it.en ? "selected" : ""}>Dentro de ${esc(v.nombre)}</option>`).join("")}</select></label>
      <label class="field"><span>Nota</span><input name="nota" maxlength="200" value="${esc(it.nota || "")}" placeholder="Medida, marca, estado…"></label>
      <div class="inv-foto-campo"><span id="inv-prev">${foto ? `<img class="inv-foto-grande" src="${esc(foto.url)}" alt="">` : ""}</span>
        <div class="row-btns"><label class="btn btn-ghost">${icon("camera")}${foto ? "Cambiar foto" : "Agregar foto"}<input type="file" accept="image/*" hidden id="inv-file"></label>
          ${foto ? `<button type="button" class="btn btn-ghost" id="inv-sin-foto">Quitar foto</button>` : ""}
          ${nuevo ? "" : `<button type="button" class="btn btn-ghost danger" id="inv-borrar">${icon("trash")}Borrar</button>`}</div></div>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button></form>` });
    const f = $("#inv-f", s.el), guardarBtn = f.querySelector("[type=submit]");
    const verEn = () => { $(".inv-en", f).hidden = f.cat.value === "valija" || !valijas().some(v => v.id !== it.id); };
    verEn(); f.cat.onchange = verEn;
    f.nombre.oninput = () => { const c = catDe(f.nombre.value); if (c) { f.cat.value = c; verEn(); } };
    $("#inv-file", f).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      busy(guardarBtn, true, "Subiendo foto…");
      try {
        const r = await subir(await comprimir(file, 1280), `inventario/${S.user.uid}`, { nombre: f.nombre.value });
        foto = { url: r.url };
        $("#inv-prev", f).innerHTML = `<img class="inv-foto-grande" src="${esc(foto.url)}" alt="">`;
      } catch (err) { toast(err.message, "error"); }
      busy(guardarBtn, false);
    };
    $("#inv-sin-foto", f)?.addEventListener("click", () => { foto = null; $("#inv-prev", f).innerHTML = ""; });
    $("#inv-borrar", f)?.addEventListener("click", async () => {
      const adentro = items.filter(i => i.en === it.id).length;
      if (!(await confirmar({ title: `¿Borrar «${it.nombre}»?`, message: adentro ? `Lo que tiene adentro (${adentro}) queda suelto en el taller.` : "", ok: "Borrar", danger: true }))) return;
      items = items.filter(i => i.id !== it.id).map(i => i.en === it.id ? { ...i, en: "" } : i);
      s.close(); pintar(); guardar();
    });
    f.onsubmit = e => {
      e.preventDefault();
      const cat = f.cat.value;
      const datos = { nombre: f.nombre.value.trim(), cat, cant: Math.min(999, Math.max(1, parseInt(f.cant.value, 10) || 1)),
        en: cat === "valija" ? "" : f.en.value, nota: f.nota.value.trim(), ...(foto ? { foto } : {}) };
      if (nuevo) items.push({ id: nuevoId(), ...datos });
      else items = items.map(i => i.id === it.id ? { id: it.id, ...datos } : i)
        .map(i => cat !== "valija" && i.en === it.id ? { ...i, en: "" } : i);   // dejó de ser valija: lo de adentro queda suelto
      s.close(); pintar(); guardar();
    };
  }

  pintar();
}
