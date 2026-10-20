// ═════════════════════════════════════════════════════════════
//  PLANILLAS (menú) y PLANILLA DE TÉCNICOS
//  La planilla de técnicos es propia: el valor del auto, los técnicos y quiénes trabajaron
//  cada auto se guardan aparte (companies/{cid}/planTec) y no cambian nada del vehículo.
// ═════════════════════════════════════════════════════════════
import { db, collection, doc, onSnapshot, setDoc, writeBatch } from "./firebase.js";
import { S, activos, puedeVer, mensajeError, soyAdmin, linkTecnicos } from "./data.js";
import { $, $$, esc, icon, toast, openSheet, confirmar, pedirTexto, fechaCorta, hoyISO, busy } from "./ui.js";
import { setTopbar } from "./shell.js";
import { estadoActual } from "./domain.js";
import { viandasPorTec, repartoAlquiler } from "./views-fijos.js";
import { descargarTabla } from "./excel.js";

export function vistaPlanillas(view) {
  setTopbar({ title: "Planillas", sub: S.company?.name });
  view.innerHTML = `<div class="planillas-hub">
    ${puedeVer("planilla") ? `<a class="hub-btn" href="#/planilla">${icon("table")}<span><strong>Planilla de vehículos</strong><small>Todos los vehículos del operativo</small></span></a>` : ""}
    ${puedeVer("tecnicos") ? `<a class="hub-btn" href="#/tecnicos">${icon("team")}<span><strong>Planilla de técnicos</strong><small>Sacabollos, sueldos y cierre</small></span></a>` : ""}
    ${puedeVer("gastos") ? `<a class="hub-btn" href="#/gastos">${icon("money")}<span><strong>Planilla de gastos</strong><small>Gastos del operativo</small></span></a>` : ""}
    ${puedeVer("fijos") ? `<a class="hub-btn" href="#/fijos">${icon("wallet")}<span><strong>Fijos</strong><small>Viandas y alquiler, repartidos entre los técnicos</small></span></a>` : ""}
    ${puedeVer("facturacion") ? `<a class="hub-btn" href="#/facturacion">${icon("sign")}<span><strong>Facturación</strong><small>Documento firmado de cada vehículo</small></span></a>` : ""}
  </div>`;
}

const pesos = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaLabel = iso => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d); return `${DIAS[f.getDay()]} ${d}/${m}`; };
const lunesDe = iso => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d); f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
const masDias = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
// Fecha de la reparación (Revisión en adelante)
// Cuentan los autos desde que entran a reparar (Reparando, Revisión, Contactado, Entregado o Facturado)
const entregado = v => ["enreparacion", "reparado", "llamado", "entregado", "facturado"].includes(estadoActual(v));
// El día del auto en la planilla es el de la reparación (no el de la entrega)
const fechaRep = v => v.fechas?.reparado || v.fechas?.enreparacion || v.fechas?.llamado || v.fechas?.entregado || v.fechas?.facturado || "";
const nuevoId = () => Math.random().toString(36).slice(2, 9);

const T = { tab: "autos", resumen: "dia", desde: "", hasta: "", q: "", editando: false };   // desde/hasta quedan vacíos: se sacó el filtro de fechas
let unsub = null;

export function vistaTecnicos(view) {
  setTopbar({ title: "Planilla de técnicos", sub: S.company?.name, back: "#/planillas",
    actions: `<button class="btn btn-ghost btn-sm" id="t-dl" aria-label="Descargar">${icon("download")}<span class="hide-sm">Descargar</span></button>${S.invitado ? "" : `${soyAdmin() ? `<button class="btn btn-ghost btn-sm" id="t-share" aria-label="Compartir">${icon("share")}<span class="hide-sm">Compartir</span></button>` : ""}<button class="btn btn-ghost btn-sm" id="t-tec">${icon("team")}<span class="hide-sm">Técnicos</span></button>
      <button class="btn btn-sm ${T.editando ? "btn-primary" : "btn-ghost"}" id="t-edit">${icon(T.editando ? "check" : "edit")}${T.editando ? "<span>Listo</span>" : ""}</button>`}` });
  if (S.invitado) T.editando = false;
  const sinSueldos = !!S.invitado && !S.invitado.tecnicos?.sueldos;   // link compartido sin la sección Sueldos
  if (!puedeVer("tecnicos")) { view.innerHTML = `<div class="empty"><p>No tenés acceso a esta planilla.</p></div>`; return; }
  view.innerHTML = `<div class="skeleton tall"></div>`;
  if (!S.company) return;   // F5: el operativo todavía no llegó; se repinta solo cuando llega
  const cid = S.company.id, col = collection(db, "companies", cid, "planTec");
  let cfg = null, filas = {}, fijos = {}, creando = false, gestionando = false;
  unsub?.();
  const cargar = snap => {
    filas = {}; cfg = null;
    fijos = {};
    snap.docs.forEach(d => { if (d.id === "_config") cfg = d.data(); else if (d.id === "_fijos") fijos = d.data(); else if (!d.id.startsWith("_")) filas[d.id] = d.data(); });
    cfg = { tecnicos: [], valorDefault: 450000, movs: [], ...(cfg || {}) };
    if (!document.body.contains(view) || location.hash !== "#/tecnicos") { unsub?.(); unsub = null; return; }
    if (!$(".tec-page", view)) estructura();
    asegurarFilas(); pintar();
  };
  // Link compartido: los datos vienen del bot (S.planTec), no de Firestore
  const cargarInvitado = () => cargar({ docs: (S.planTec || []).map(x => ({ id: x.id, data: () => x.d })) });
  if (S.invitado) setTimeout(cargarInvitado);
  else unsub = onSnapshot(col, cargar, e => { view.innerHTML = `<div class="empty"><p>${esc(mensajeError(e))}</p></div>`; });

  const guardarCfg = cambios => setDoc(doc(col, "_config"), cambios, { merge: true }).catch(e => toast(mensajeError(e), "error"));
  const guardarFila = (vid, cambios) => setDoc(doc(col, vid), cambios, { merge: true }).catch(e => toast(mensajeError(e), "error"));

  // Autos reparados (de la app) que todavía no están en la planilla: se agregan con el valor y los técnicos activos
  const asegurarFilas = () => {
    if (S.invitado || creando || gestionando || !cfg.tecnicos.length) return;   // se arma cuando ya están los técnicos   // sin técnicos todavía no se arma nada
    const faltan = activos().filter(v => entregado(v) && fechaRep(v) && !filas[v.id]);
    if (!faltan.length) return;
    creando = true;
    const activosTec = cfg.tecnicos.filter(t => t.activo !== false).map(t => t.id);
    const b = writeBatch(db);
    faltan.slice(0, 400).forEach(v => b.set(doc(col, v.id), { valor: Number(cfg.valorDefault) || 0, tecs: activosTec, creado: Date.now() }));
    b.commit().catch(e => toast(mensajeError(e), "error")).finally(() => { creando = false; });
  };

  // Filas visibles: auto de la app + datos de la planilla, dentro del período elegido
  const lista = () => activos().filter(v => filas[v.id] && !filas[v.id].oculto && entregado(v)).map(v => {
    const f = filas[v.id], fecha = f.fecha || fechaRep(v);
    const tecs = (f.tecs || []).filter(id => cfg.tecnicos.some(t => t.id === id));
    return { v, f, fecha, valor: Number(f.valor) || 0, tecs, parte: tecs.length ? (Number(f.valor) || 0) / tecs.length : 0 };
  }).filter(r => r.fecha && (!T.desde || r.fecha >= T.desde) && (!T.hasta || r.fecha <= T.hasta))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.f.creado || 0) - Number(b.f.creado || 0));   // del primer día al último

  const estructura = () => {
    view.innerHTML = `<div class="tec-page">
      <label class="search">${icon("search")}<input type="search" id="t-q" placeholder="Buscar patente" value="${esc(T.q)}" autocomplete="off" autocapitalize="characters"></label>
      <div class="seg seg-sm tec-tabs" id="t-tabs">${[["autos", "Sacabollos"], ["sueldos", "Sueldos"], ["cierre", "Cierre"]].filter(([k]) => !(sinSueldos && k === "sueldos")).map(([k, t]) =>
        `<button type="button" class="seg-btn ${T.tab === k ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>
      <div id="t-body"></div></div>`;
    $("#t-q", view).oninput = e => { T.q = e.target.value; pintar(); };
    $("#t-tabs", view).onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; T.tab = b.dataset.tab;
      $$("#t-tabs .seg-btn", view).forEach(x => x.classList.toggle("on", x === b)); pintar(); };
    $("#t-body", view).addEventListener("click", clic);
    $("#t-body", view).addEventListener("change", cambio);
  };

  const nombreTec = id => cfg.tecnicos.find(t => t.id === id)?.nombre || (fijos.tecnicos || []).find(t => t.id === id)?.nombre || (cfg.personas || []).find(t => t.id === id)?.nombre || "?";
  const sumaPorTec = rows => { const s = Object.fromEntries(cfg.tecnicos.map(t => [t.id, 0])); rows.forEach(r => r.tecs.forEach(id => { s[id] += r.parte; })); return s; };

  const pintar = () => {
    const body = $("#t-body", view); if (!body) return;
    const rows = lista(), q = T.q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cfg.tecnicos.length) {
      body.innerHTML = `<div class="empty small"><p>Primero agregá los técnicos (solo nombres, no tienen que estar en la app).</p>
        <button class="btn btn-primary" data-act="tecnicos">${icon("plus")}Agregar técnicos</button></div>`;
      return;
    }
    if (!["sueldos", "cierre"].includes(T.tab) || (sinSueldos && T.tab === "sueldos")) T.tab = "autos";
    if (T.tab === "autos") {
      // Al repintar (por ej. al tocar un técnico) la tabla queda donde estaba deslizada
      const tw = $(".table-wrap", body), sx = tw?.scrollLeft || 0, sy = tw?.scrollTop || 0;
      body.innerHTML = pintarAutos(q ? rows.filter(r => (r.v.patente || "").toUpperCase().replace(/[^A-Z0-9]/g, "").includes(q)) : rows); conectarAnchos(body);
      const nw = $(".table-wrap", body); if (nw && tw) { nw.scrollLeft = sx; nw.scrollTop = sy; }
      // Volviendo de un vehículo: la planilla queda donde estaba
      if (nw && T.volver) { nw.scrollLeft = T.volver.x; nw.scrollTop = T.volver.t; scrollTo(0, T.volver.y); T.volver = null; }
    }
    else if (T.tab === "sueldos") body.innerHTML = pintarSueldos();
    else body.innerHTML = pintarCierre(rows);
  };

  // Como el Excel: semana por semana; cada día con su título, cada auto en una línea y una columna por técnico.
  // Al terminar cada semana va "TOTAL SEMANA". Solo se puede cambiar algo con "Editar" activado.
  // Las columnas se pueden ensanchar o achicar arrastrando el borde del título (se recuerda en este equipo).
  const anchos = () => { try { return JSON.parse(localStorage.getItem("tecCols") || "{}"); } catch { return {}; } };
  const pintarAutos = rows => {
    if (!rows.length) return `<div class="empty small"><p>${T.q ? "No hay autos con esa patente." : "Todavía no hay autos en reparación ni entregados."}</p></div>`;
    const ed = T.editando, tecs = cfg.tecnicos, nc = 4 + tecs.length + (ed ? 1 : 0), w = anchos();
    // Entre Importe y los técnicos va una columna vacía de separación
    const cols = [["veh", "VEHÍCULO", 120], ["pat", "PATENTE", 90], ["imp", "IMPORTE", 100], ["sep", "", 16], ...tecs.map(t => [t.id, t.nombre, 95])];
    const th = ([k, txt], i) => k === "sep" ? `<th class="tec-sepcol" data-col="sep"><span class="col-res" aria-hidden="true"></span></th>` : `<th class="${i >= 2 ? "num" : ""} ${k === "imp" ? "col-imp" : ""} ${i >= 4 ? "tec-col" : ""}" data-col="${esc(k)}">${esc(txt)}<span class="col-res" aria-hidden="true"></span></th>`;
    const semanas = [...new Set(rows.map(r => lunesDe(r.fecha)))];
    const fila = r => `<tr data-vid="${esc(r.v.id)}">
      <td>${esc((r.v.modelo || "—").toUpperCase())}</td><td>${esc(r.v.patente || "")}</td>
      <td class="num col-imp">${ed ? `<input type="number" inputmode="numeric" min="0" step="1000" data-campo="valor" value="${r.valor}">` : pesos(r.valor)}</td><td class="tec-sepcol"></td>
      ${tecs.map(t => { const si = r.tecs.includes(t.id);
        return `<td class="num tec-col ${si ? "" : "tec-no"}">${ed ? `<button type="button" class="tec-celda ${si ? "on" : ""}" data-tec="${esc(t.id)}">${si ? pesos(r.parte) : "⨯"}</button>` : si ? pesos(r.parte) : "⨯"}</td>`; }).join("")}
      ${ed ? `<td><button type="button" class="icon-btn sm" data-act="fila" aria-label="Opciones">${icon("edit")}</button></td>` : ""}</tr>`;
    return `<div class="table-wrap"><table class="tbl tec-excel ${ed ? "editando" : ""}">
      <colgroup>${cols.map(([k, , def]) => `<col data-col="${esc(k)}" style="width:${Number(w[k]) || def}px">`).join("")}${ed ? `<col style="width:44px">` : ""}</colgroup>
      <thead><tr>${cols.map(th).join("")}${ed ? "<th></th>" : ""}</tr></thead>
      <tbody>${semanas.map(l => {
        const rsS = rows.filter(r => lunesDe(r.fecha) === l), s = sumaPorTec(rsS);
        const dias = [...new Set(rsS.map(r => r.fecha))];
        return dias.map(d => `<tr class="tec-dia-fila"><td colspan="${nc}"><span>${diaLabel(d).toUpperCase()}</span></td></tr>${rsS.filter(r => r.fecha === d).map(fila).join("")}`).join("") +
          `<tr class="tec-sub"><td colspan="2">SEMANA ${semanas.indexOf(l) + 1}</td>
            <td class="num col-imp">${pesos(rsS.reduce((a, r) => a + r.valor, 0))}</td><td class="tec-sepcol"></td>
            ${tecs.map(t => s[t.id] ? `<td class="num tec-col">${pesos(s[t.id])}</td>` : `<td class="tec-no tec-col">⨯</td>`).join("")}${ed ? "<td></td>" : ""}</tr>
          <tr class="tec-sep"><td colspan="${nc}"></td></tr>`;
      }).join("")}</tbody></table></div>
      ${ed ? `<p class="muted small">Tocá la celda de un técnico para sumarlo o sacarlo de ese auto. El importe se reparte solo.</p>` : ""}`;
  };
  // Arrastrar el borde derecho del título de una columna cambia su ancho
  // El ancho de la tabla es la suma de sus columnas (así se pueden achicar, no solo agrandar)
  const ajustarTabla = body => $$(".tec-excel", body).forEach(t => {
    t.style.width = [...t.querySelectorAll("col")].reduce((a, c) => a + (parseInt(c.style.width) || 0), 0) + "px"; });
  const conectarAnchos = body => {
    ajustarTabla(body);
    $$(".col-res", body).forEach(h => h.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      const k = h.parentElement.dataset.col, col = $(`col[data-col="${CSS.escape(k)}"]`, body);
      const x0 = e.clientX, w0 = col.getBoundingClientRect().width || parseInt(col.style.width) || 100;
      const mover = ev => { col.style.width = Math.max(k === "sep" ? 4 : 40, Math.round(w0 + ev.clientX - x0)) + "px"; ajustarTabla(body); };
      const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar);
        const w = anchos(); w[k] = parseInt(col.style.width); try { localStorage.setItem("tecCols", JSON.stringify(w)); } catch { /* sin almacenamiento */ } };
      addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
    }));
  };

  const enPeriodo = m => (!T.desde || m.fecha >= T.desde) && (!T.hasta || m.fecha <= T.hasta);
  const movsDe = (id, tipo) => (cfg.movs || []).filter(m => enPeriodo(m) && m.tec === id && m.tipo === tipo);
  const suma = l => l.reduce((a, m) => a + (Number(m.monto) || 0), 0);
  const norm = n => String(n || "").trim().toUpperCase();
  // Gastos fijos tiene sus propios técnicos. Se cruzan por nombre; un sacabollo "PAB+ROD" junta a PABLO y RODRI.
  const asignarFijos = () => {
    const partes = n => norm(n).split(/\s*[+/&,]\s*|\s+Y\s+/).filter(Boolean);
    const pega = (k, n) => partes(n).some(p => p === k || (p.length >= 3 && k.startsWith(p)) || (k.length >= 3 && p.startsWith(k)));
    const de = {}, sueltos = [];
    (fijos.tecnicos || []).forEach(f => {
      const k = norm(f.nombre);
      const t = cfg.tecnicos.find(t => norm(t.nombre) === k) || cfg.tecnicos.find(t => pega(k, t.nombre));
      if (t) (de[t.id] ||= []).push(f.id); else sueltos.push(f);
    });
    return { de, sueltos };
  };
  // Personas a sueldo: las de viandas/alquiler que no son sacabollos + las agregadas a mano (una por nombre)
  const personasSueldo = sueltos => {
    const vistos = new Set(), out = [];
    [...sueltos.map(f => ({ id: f.id, nombre: f.nombre })), ...(cfg.personas || []).map(p => ({ ...p, manual: true }))].forEach(p => {
      const k = norm(p.nombre); if (!k || vistos.has(k)) return; vistos.add(k); out.push(p);
    });
    return out;
  };
  // Sueldos: cada uno con su rango (desde/hasta). "Fijo" se repite todos los meses desde "desde" (hasta "hasta" si tiene).
  // En el cierre cuenta el monto completo si cae en el período elegido; los fijos cuentan una vez por mes.
  const masMes = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const f = new Date(y, m - 1 + n, 1), ult = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`; };
  const vecesSueldo = m => {
    const desde = m.desde || m.fecha || "", hasta = m.hasta || desde;
    if (!desde) return 0;
    if (!m.fijo) return (!T.hasta || desde <= T.hasta) && (!T.desde || hasta >= T.desde) ? 1 : 0;
    const tope = [m.hasta, T.hasta, hoyISO()].filter(Boolean).sort()[0];
    let n = 0;
    for (let k = 0, f = desde; f <= tope && k < 240; f = masMes(desde, ++k)) if (!T.desde || f >= T.desde) n++;
    return n;
  };
  const sueldosDe = id => (cfg.movs || []).filter(m => m.tec === id && m.tipo === "sueldo");
  const totalSueldo = id => sueldosDe(id).reduce((a, m) => a + (Number(m.monto) || 0) * vecesSueldo(m), 0);
  const listaSueldos = id => sueldosDe(id).map(m => { const v = vecesSueldo(m), d = m.desde || m.fecha;
    return `<li class="${v ? "" : "muted"}"><span>${m.fijo ? `Fijo mensual desde ${fechaCorta(d)}${m.hasta ? ` hasta ${fechaCorta(m.hasta)}` : ""}${v > 1 ? ` · ×${v}` : ""}`
      : `${fechaCorta(d)}${m.hasta && m.hasta !== d ? ` al ${fechaCorta(m.hasta)}` : ""}`}${m.nota ? " · " + esc(m.nota) : ""}</span><b>${pesos(m.monto)}</b>
      ${T.editando ? `<button type="button" class="icon-btn sm" data-del-mov="${esc(m.id)}" aria-label="Quitar">${icon("x")}</button>` : ""}</li>`; }).join("") ||
    `<li class="muted small">Sin sueldos cargados</li>`;
  const listaMovs = (l, vacio) => l.map(m => `<li><span>${fechaCorta(m.fecha)}${m.nota ? " · " + esc(m.nota) : ""}</span><b>${m.tipo === "sueldo" ? "" : "-"}${pesos(m.monto)}</b>
      ${T.editando ? `<button type="button" class="icon-btn sm" data-del-mov="${esc(m.id)}" aria-label="Quitar">${icon("x")}</button>` : ""}</li>`).join("") ||
      `<li class="muted small">${vacio}</li>`;

  const pintarSueldos = () => {
    const ps = personasSueldo(asignarFijos().sueltos);
    return `${ps.length ? `<div class="tec-cierre-grid">${ps.map(p => {
      return `<section class="tec-cierre" data-tecid="${esc(p.id)}">
        <h3 class="tec-cierre-nombre">${esc(p.nombre)}${p.manual && T.editando ? ` <button type="button" class="link-btn small" data-del-persona="${esc(p.id)}">Quitar</button>` : ""}</h3>
        <div class="tec-linea"><span>Sueldo</span><b>${pesos(totalSueldo(p.id))}</b>${T.editando ? `<button type="button" class="link-btn small" data-add-mov="sueldo">+ Sueldo</button>` : ""}</div>
        <ul class="tec-movs">${listaSueldos(p.id)}</ul>
      </section>`; }).join("")}</div>`
      : `<div class="empty small"><p>No hay técnicos a sueldo. Aparecen solos los que están en viandas o alquiler y no son sacabollos, o agregalos acá.</p></div>`}
      <button type="button" class="btn btn-ghost btn-block tec-add-persona" data-act="persona">${icon("plus")}Agregar técnico</button>`;
  };

  // Números del cierre (los usan las tarjetas y la descarga)
  const datosCierre = rows => {
    const s = sumaPorTec(rows), { de, sueltos } = asignarFijos(), ftecs = fijos.tecnicos || [];
    const vi = viandasPorTec(fijos, ftecs, T.desde, T.hasta), al = repartoAlquiler(fijos, ftecs, T.desde, T.hasta).porTec;
    const item = (t, ids, sueldo) => {
      const v = ids.reduce((a, id) => a + (vi[id] || 0), 0), a = ids.reduce((x, id) => x + (al[id] || 0), 0);
      const ganado = sueldo ? totalSueldo(t.id) : s[t.id] || 0;
      const ad = movsDe(t.id, "adelanto"), ga = movsDe(t.id, "gasto");
      // Adelantos y gastos se descuentan siempre; viandas y alquiler, a los de sueldo solo con "Descontar gastos" activado
      const desc = !sueldo || !!cfg.descontar?.[t.id];
      return { t, sueldo, autos: rows.filter(r => r.tecs.includes(t.id)).length, ganado, ad, ga, v, a, desc,
        gastos: suma(ga) + v + a, fin: ganado - suma(ad) - suma(ga) - (desc ? v + a : 0) };
    };
    return [...cfg.tecnicos.map(t => item(t, de[t.id] || [], false)),
      ...(sinSueldos ? [] : personasSueldo(sueltos)).map(p => item(p, sueltos.filter(f => norm(f.nombre) === norm(p.nombre)).map(f => f.id), true))];
  };
  const pintarCierre = rows => {
    const total = rows.reduce((a, r) => a + r.valor, 0);
    const hayFijos = !!(fijos.viandas?.cambios?.length || fijos.alquiler?.pagos?.length || fijos.alquiler?.casas?.length);
    const tarjeta = ({ t, sueldo, autos, ganado, ad, ga, v, a, desc, gastos, fin }) => {
      const sw = sueldo ? `<div class="tec-linea tec-desc"><span>Descontar gastos</span><button type="button" class="switch ${desc ? "on" : ""}" data-descontar role="switch" aria-checked="${desc}" aria-label="Descontar gastos"><span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button></div>` : "";
      return `<section class="tec-cierre" data-tecid="${esc(t.id)}">
        <h3 class="tec-cierre-nombre">${esc(t.nombre)}${sueldo ? "" : ` <small>${autos} autos</small>`}</h3>
        <div class="tec-linea"><span>${sueldo ? "Sueldo" : "Total ganado"}</span><b>${pesos(ganado)}</b></div>
        <div class="tec-linea"><span>Adelantos</span><b>-${pesos(suma(ad))}</b>${T.editando ? `<button type="button" class="link-btn small" data-add-mov="adelanto">+ Adelanto</button>` : ""}</div>
        <ul class="tec-movs">${listaMovs(ad, "Sin adelantos")}</ul>
        <div class="tec-linea"><span>Gastos</span><b>-${pesos(suma(ga))}</b>${T.editando ? `<button type="button" class="link-btn small" data-add-mov="gasto">+ Gasto</button>` : ""}</div>
        <ul class="tec-movs">${listaMovs(ga, "Sin gastos")}</ul>
        ${hayFijos ? `<div class="${desc ? "" : "tec-aparte"}"><div class="tec-linea"><span>Viandas</span><b>-${pesos(v)}</b></div>
        <div class="tec-linea"><span>Alquiler</span><b>-${pesos(a)}</b></div></div>` : ""}
        ${sw}<div class="tec-linea tec-gtot"><span>Gastos totales</span><b>${pesos(gastos)}</b></div>
        <div class="tec-linea tec-final"><span>Final a pagar</span><b>${pesos(fin)}</b></div>
      </section>`;
    };
    const l = datosCierre(rows), ps = l.filter(x => x.sueldo);
    return `<div class="tec-cierre-top">
        <div class="tec-stat"><small>Autos</small><strong>${rows.length}</strong></div>
        <div class="tec-stat"><small>Valor de todos los autos</small><strong>${pesos(total)}</strong></div>
      </div>
      <h3 class="tec-cierre-tit">Sacabollos</h3>
      <div class="tec-cierre-grid">${l.filter(x => !x.sueldo).map(tarjeta).join("")}</div>
      ${ps.length ? `<h3 class="tec-cierre-tit">Sueldos</h3>
      <div class="tec-cierre-grid">${ps.map(tarjeta).join("")}</div>` : ""}`;
  };

  // ── Acciones ──
  async function clic(e) {
    const t = e.target;
    if (t.closest("[data-act=tecnicos]")) return gestionarTecnicos();
    const dsw = t.closest("[data-descontar]");
    if (dsw && !S.invitado) { const id = dsw.closest("[data-tecid]").dataset.tecid; return guardarCfg({ descontar: { ...(cfg.descontar || {}), [id]: !cfg.descontar?.[id] } }); }
    if (t.closest("[data-act=persona]")) {
      const nombre = (await pedirTexto({ title: "Técnico a sueldo", label: "Nombre", ok: "Agregar" }))?.trim();
      if (nombre) guardarCfg({ personas: [...(cfg.personas || []), { id: nuevoId(), nombre: nombre.toUpperCase() }] });
      return;
    }
    const dp = t.closest("[data-del-persona]");
    if (dp && T.editando) {
      if (!(await confirmar({ title: "¿Quitar esta persona?", ok: "Quitar", danger: true }))) return;
      return guardarCfg({ personas: (cfg.personas || []).filter(p => p.id !== dp.dataset.delPersona) });
    }
    const res = t.closest("[data-res]");
    if (res) { T.resumen = res.dataset.res; return pintar(); }
    const fila = t.closest("[data-vid]");
    const chip = t.closest("[data-tec]");
    if (chip && fila && T.editando) {
      const f = filas[fila.dataset.vid] || {}, id = chip.dataset.tec;
      const tecs = (f.tecs || []).includes(id) ? f.tecs.filter(x => x !== id) : [...(f.tecs || []), id];
      return guardarFila(fila.dataset.vid, { tecs });
    }
    if (t.closest("[data-act=fila]") && fila && T.editando) return opcionesFila(fila.dataset.vid);
    if (fila && !T.editando && !S.invitado) { T.volver = { y: scrollY, x: $(".table-wrap", view)?.scrollLeft || 0, t: $(".table-wrap", view)?.scrollTop || 0 }; location.hash = `#/v/${fila.dataset.vid}`; return; }
    const add = t.closest("[data-add-mov]");
    if (add && T.editando) {
      const tecid = t.closest("[data-tecid]").dataset.tecid, tipo = add.dataset.addMov;
      return nuevoMov(tecid, tipo);
    }
    const del = t.closest("[data-del-mov]");
    if (del && T.editando) {
      if (!(await confirmar({ title: "¿Quitar este movimiento?", ok: "Quitar", danger: true }))) return;
      return guardarCfg({ movs: (cfg.movs || []).filter(m => m.id !== del.dataset.delMov) });
    }
  }
  function cambio(e) {
    const inp = e.target.closest("[data-campo=valor]"), fila = e.target.closest("[data-vid]");
    if (inp && fila) guardarFila(fila.dataset.vid, { valor: Math.max(0, Number(inp.value) || 0), valorManual: true });
  }

  function nuevoMov(tecid, tipo) {
    if (tipo === "sueldo") return nuevoSueldo(tecid);
    const s = openSheet({ title: `${{ adelanto: "Adelanto", gasto: "Gasto", sueldo: "Sueldo" }[tipo] || "Gasto"} · ${nombreTec(tecid)}`, body: `<form class="stack">
      <label class="field"><span>Monto</span><input name="monto" type="number" inputmode="numeric" min="0" required></label>
      <label class="field"><span>Fecha</span><input name="fecha" type="date" value="${hoyISO()}" required></label>
      <label class="field"><span>Nota (opcional)</span><input name="nota" maxlength="80"></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("form", s.el).onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target, m = { id: nuevoId(), tec: tecid, tipo, monto: Number(f.monto.value) || 0, fecha: f.fecha.value, nota: f.nota.value.trim() };
      guardarCfg({ movs: [...(cfg.movs || []), m] }); s.close();
    };
  }

  function nuevoSueldo(tecid) {
    const s = openSheet({ title: `Sueldo · ${nombreTec(tecid)}`, body: `<form class="stack">
      <label class="field"><span>Monto</span><input name="monto" type="number" inputmode="numeric" min="0" required></label>
      <div class="row2"><label class="field"><span>Desde</span><input name="desde" type="date" value="${hoyISO()}" required></label>
      <label class="field"><span>Hasta</span><input name="hasta" type="date"></label></div>
      <label class="switch-row"><span>Fijo (se repite todos los meses)</span><input type="checkbox" name="fijo"></label>
      <label class="field"><span>Nota (opcional)</span><input name="nota" maxlength="80"></label>
      <button class="btn btn-primary btn-block">Guardar</button></form>` });
    $("form", s.el).onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target, desde = f.desde.value, hasta = f.hasta.value && f.hasta.value >= desde ? f.hasta.value : "";
      const m = { id: nuevoId(), tec: tecid, tipo: "sueldo", monto: Number(f.monto.value) || 0, desde, fecha: desde, hasta, fijo: f.fijo.checked, nota: f.nota.value.trim() };
      guardarCfg({ movs: [...(cfg.movs || []), m] }); s.close();
    };
  }

  function opcionesFila(vid) {
    const v = activos().find(x => x.id === vid), f = filas[vid] || {};
    const s = openSheet({ title: `${v?.modelo || ""} ${v?.patente || ""}`, body: `<form class="stack">
      <label class="field"><span>Fecha en la planilla</span><input name="fecha" type="date" value="${esc(f.fecha || fechaRep(v || {}))}"></label>
      <button class="btn btn-primary btn-block">Guardar</button>
      <button type="button" class="btn btn-ghost btn-block danger" data-ocultar>Quitar de la planilla</button></form>` });
    $("form", s.el).onsubmit = ev => { ev.preventDefault(); guardarFila(vid, { fecha: ev.target.fecha.value || "" }); s.close(); };
    $("[data-ocultar]", s.el).onclick = async () => { s.close();
      if (await confirmar({ title: "¿Quitar de la planilla de técnicos?", message: "El vehículo sigue en la app; solo deja de contar acá.", ok: "Quitar", danger: true }))
        guardarFila(vid, { oculto: true }); };
  }

  function gestionarTecnicos() {
    gestionando = true;
    const s = openSheet({ title: "Técnicos", onClose: () => { gestionando = false; asegurarFilas(); pintar(); }, body: `<div class="stack">
      <p class="muted small">Solo nombres para esta planilla. <b>Marcado por defecto</b>: <b>Sí</b> = aparece marcado solo en cada auto nuevo; <b>No</b> = queda sin marcar y lo marcás vos en los autos que corresponda.</p>
      <ul class="tec-lista" id="tl"></ul>
      <button type="button" class="btn btn-ghost btn-block" id="tl-add">${icon("plus")}Agregar técnico</button>
      <label class="field"><span>Valor del auto por defecto</span><input type="number" inputmode="numeric" id="tl-valor" value="${Number(cfg.valorDefault) || 0}"></label>
      <button type="button" class="btn btn-ghost btn-block" id="tl-reset">Reiniciar importes</button>
    </div>` });
    // Todos los autos vuelven al valor por defecto (también los cambiados a mano)
    $("#tl-reset", s.el).onclick = async () => {
      const v = Number(cfg.valorDefault) || 0, ids = Object.keys(filas);
      if (!ids.length || !(await confirmar({ title: "¿Reiniciar importes?", message: `Los ${ids.length} autos de la planilla quedan en ${pesos(v)}, también los que se cambiaron a mano. No se puede deshacer.`, ok: "Reiniciar", danger: true }))) return;
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach(id => b.set(doc(col, id), { valor: v, valorManual: false }, { merge: true }));
        await b.commit().catch(err => toast(mensajeError(err), "error"));
      }
      toast("Importes reiniciados");
    };
    const pintarL = () => { $("#tl", s.el).innerHTML = cfg.tecnicos.map(t => `<li data-id="${esc(t.id)}">
      <small class="tl-def">Por defecto</small><button type="button" class="switch ${t.activo !== false ? "on" : ""}" data-sw role="switch" aria-checked="${t.activo !== false}" aria-label="Marcado por defecto"><span class="sw-txt sw-si">Sí</span><span class="sw-txt sw-no">No</span><i class="sw-bola"></i></button>
      <span class="tl-nombre">${esc(t.nombre)}</span>
      <button type="button" class="icon-btn sm" data-ren aria-label="Renombrar">${icon("edit")}</button>
      <button type="button" class="icon-btn sm danger" data-del aria-label="Quitar">${icon("trash")}</button></li>`).join("") || `<li class="muted small">Sin técnicos</li>`; };
    pintarL();
    const guardarTecs = tecnicos => { cfg.tecnicos = tecnicos; pintarL(); return guardarCfg({ tecnicos }); };
    $("#tl-add", s.el).onclick = async () => {
      const n = await pedirTexto({ title: "Nuevo técnico", label: "Nombre", placeholder: "Ej: Juan", ok: "Agregar" });
      if (n?.trim()) guardarTecs([...cfg.tecnicos, { id: nuevoId(), nombre: n.trim().toUpperCase(), activo: true }]);
    };
    // Arrastrar el nombre para arriba o abajo cambia el orden (el de las columnas)
    $("#tl", s.el).addEventListener("pointerdown", e => {
      const li = e.target.closest(".tl-nombre")?.closest("li[data-id]"); if (!li) return;
      e.preventDefault(); e.stopPropagation(); li.classList.add("arrastrando");
      const mover = ev => {
        const otro = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("#tl > li[data-id]"); if (!otro || otro === li) return;
        const r = otro.getBoundingClientRect(); otro.parentNode.insertBefore(li, ev.clientY > r.top + r.height / 2 ? otro.nextSibling : otro);
      };
      const soltar = () => {
        removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); removeEventListener("pointercancel", soltar);
        li.classList.remove("arrastrando");
        const orden = $$("#tl > li[data-id]", s.el).map(x => x.dataset.id);
        if (orden.join() !== cfg.tecnicos.map(t => t.id).join()) guardarTecs(orden.map(id => cfg.tecnicos.find(t => t.id === id)));
      };
      addEventListener("pointermove", mover); addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
    });
    // Cambiar el valor por defecto también cambia los autos que lo tenían y nadie tocó a mano
    $("#tl-valor", s.el).onchange = e => {
      const viejo = Number(cfg.valorDefault) || 0, nuevo = Math.max(0, Number(e.target.value) || 0);
      guardarCfg({ valorDefault: nuevo });
      const ids = Object.keys(filas).filter(id => !filas[id].valorManual && (Number(filas[id].valor) || 0) === viejo);
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach(id => b.set(doc(col, id), { valor: nuevo }, { merge: true }));
        b.commit().catch(err => toast(mensajeError(err), "error"));
      }
    };
    $("#tl", s.el).onclick = async e => {
      const li = e.target.closest("[data-id]"); if (!li) return;
      const id = li.dataset.id, t = cfg.tecnicos.find(x => x.id === id);
      if (e.target.closest("[data-sw]")) return guardarTecs(cfg.tecnicos.map(x => x.id === id ? { ...x, activo: x.activo === false } : x));
      if (e.target.closest("[data-ren]")) {
        const n = await pedirTexto({ title: "Renombrar", label: "Nombre", value: t.nombre });
        if (n?.trim()) guardarTecs(cfg.tecnicos.map(x => x.id === id ? { ...x, nombre: n.trim().toUpperCase() } : x));
        return;
      }
      if (e.target.closest("[data-del]") && await confirmar({ title: `¿Quitar a ${t.nombre}?`, message: "Deja de figurar en la planilla y en los repartos.", ok: "Quitar", danger: true }))
        guardarTecs(cfg.tecnicos.filter(x => x.id !== id));
    };
  }

  $("#t-tec")?.addEventListener("click", () => cfg && gestionarTecnicos());
  // Descargar: los autos del período, con el total de cada semana y el total general
  $("#t-dl")?.addEventListener("click", () => {
    if (!cfg) return;
    const rows = lista(), tecs = cfg.tecnicos;
    if (!rows.length) return toast("No hay autos para descargar", "warning");
    const total = (etq, rs) => { const s = sumaPorTec(rs);
      return Object.assign(["", etq, "", rs.reduce((a, r) => a + r.valor, 0), "", ...tecs.map(t => s[t.id] || "")], { negrita: true }); };
    const filas = [];
    [...new Set(rows.map(r => lunesDe(r.fecha)))].forEach((l, i) => {
      const rs = rows.filter(r => lunesDe(r.fecha) === l);
      rs.forEach((r, j) => filas.push(Object.assign([r.fecha, (r.v.modelo || "").toUpperCase(), r.v.patente || "", r.valor, "", ...tecs.map(t => r.tecs.includes(t.id) ? r.parte : "")], { cab: j === 0 })));
      filas.push(total(`SEMANA ${i + 1}`, rs));
    });
    filas.push(total("TOTAL", rows));
    descargarTabla({ archivo: `Tecnicos_${hoyISO()}`, titulo: "Planilla de técnicos", filas,
      cols: [{ titulo: "FECHA", ancho: 14, tipo: "fecha" }, { titulo: "VEHÍCULO", ancho: 26 }, { titulo: "PATENTE", ancho: 16.3 },
        { titulo: "IMPORTE", ancho: 19.5, tipo: "moneda" }, { titulo: "", ancho: 8 }, ...tecs.map(t => ({ titulo: t.nombre, ancho: 17.5, tipo: "moneda", centro: true }))],
      mas: [cierreDescarga(rows)] });
  });
  // Hoja del cierre, como la planilla: un técnico por columna (sacabollos y sueldos) y los conceptos hacia abajo
  const cierreDescarga = rows => {
    const l = datosCierre(rows), sum = f => l.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    // TOTAL primero, una columna vacía y después cada técnico; los descuentos en rojo rosado
    const fila = (etq, f, total = sum(f)) => [etq, total, "", ...l.map(f)];
    const rojo = r => Object.assign(r, { rojo: true });
    const filas = [
      fila("AUTOS", x => x.sueldo ? "" : String(x.autos), String(rows.length)), fila("GANANCIA", x => x.ganado),
      rojo(fila("ADELANTOS", x => suma(x.ad))), rojo(fila("GASTOS", x => suma(x.ga))),
      rojo(fila("VIANDAS", x => x.v)), rojo(fila("ALQUILER", x => x.a)),   // se muestran siempre; FINAL solo los resta con x.desc
      Object.assign(fila("FINAL A PAGAR", x => x.fin), { negrita: true })];
    return { titulo: "Cierre", filas, cols: [{ titulo: "", ancho: 33.5, negrita: true }, { titulo: "TOTAL", ancho: 28, tipo: "moneda", centro: true, negrita: true }, { titulo: "", ancho: 8 },
      ...l.map(x => ({ titulo: x.t.nombre, ancho: 21, tipo: "moneda", centro: true }))] };
  };
  $("#t-edit")?.addEventListener("click", () => {
    T.editando = !T.editando;
    const b = $("#t-edit"); b.className = `btn btn-sm ${T.editando ? "btn-primary" : "btn-ghost"}`;
    b.innerHTML = `${icon(T.editando ? "check" : "edit")}${T.editando ? "<span>Listo</span>" : ""}`;
    if (cfg) pintar();
  });
  // Compartir: link de solo lectura de esta planilla (con o sin Sueldos)
  $("#t-share")?.addEventListener("click", () => {
    const s = openSheet({ title: "Compartir planilla de técnicos", body: `<div class="stack">
      <p class="muted small">Link de solo lectura: ve la planilla y el cierre, sin precios ni documentos de los vehículos.</p>
      <label class="switch-row"><span>Mostrar Sueldos (y sus personas en el cierre)</span><input type="checkbox" id="ts-sueldos"></label>
      <button type="button" class="btn btn-primary btn-block" id="ts-link">${icon("share")}Crear y copiar link</button></div>` });
    $("#ts-link", s.el).onclick = async e => {
      const b = e.currentTarget; busy(b, true, "Creando link…");
      const pedido = linkTecnicos($("#ts-sueldos", s.el).checked);
      // El portapapeles se pide en este mismo toque (si no, el celular lo bloquea) y se llena cuando llega el link
      const copia = window.ClipboardItem && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "text/plain": pedido.then(u => new Blob([u], { type: "text/plain" })) })])
        : pedido.then(u => navigator.clipboard.writeText(u));
      try {
        const url = await pedido, ok = await copia.then(() => true, () => false);
        busy(b, false);
        if (ok) { toast(`Link copiado: ${url.replace(/^https?:\/\//, "")}`, "success"); s.close(); return; }
        b.insertAdjacentHTML("afterend", `<input readonly value="${esc(url)}" style="width:100%">`);
        b.nextElementSibling.select();
      } catch (err) { busy(b, false); toast(err.message, "error"); }
    };
  });
  return { soloLista: () => { if (S.invitado) return cargarInvitado(); if (cfg) { asegurarFilas(); pintar(); } } };
}
