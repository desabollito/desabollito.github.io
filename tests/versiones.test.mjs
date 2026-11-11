// node tests/versiones.test.mjs
import assert from "node:assert/strict";
import { estadoEn, marcarVianda, valoresVianda, fechaRep, tocarTec, cambiarGrupo, grupoSolo, fechasDeSueldo, repartirTurnos } from "../tester/js/domain.js";

// Más nueva primero: c cambió B, b borró A... cada una guarda cómo estaba antes
const actual = { cfg: { v: 3 }, fila: { t: ["x"] } };
const entradas = [
  { antes: { cfg: { v: 2 } } },              // 3.º cambio: v 2 → 3
  { antes: { fila: null } },                 // 2.º cambio: creó la fila
  { antes: { cfg: { v: 1 } } }               // 1.º cambio: v 1 → 2
];
assert.deepEqual(estadoEn(actual, entradas, 0), actual, "k = 0 es ahora");
assert.deepEqual(estadoEn(actual, entradas, 1), { cfg: { v: 2 }, fila: { t: ["x"] } });
assert.deepEqual(estadoEn(actual, entradas, 2), { cfg: { v: 2 } }, "la fila todavía no existía");
assert.deepEqual(estadoEn(actual, entradas, 3), { cfg: { v: 1 } }, "antes del primer cambio");
assert.deepEqual(actual, { cfg: { v: 3 }, fila: { t: ["x"] } }, "no modifica el estado real");

// Sacar a alguien un día sigue hacia adelante con los mismos valores
const cambios = [{ id: "a", fecha: "2026-10-01", tecs: ["p", "r"], vianda: 100, envio: 50 }, { id: "b", fecha: "2026-10-20", tecs: ["p"], vianda: 200, envio: 60 }];
const m = marcarVianda(cambios, "2026-10-10", ["r"], "n");
assert.deepEqual(m.find(c => c.id === "n"), { id: "n", fecha: "2026-10-10", tecs: ["r"], vianda: 100, envio: 50 });
assert.equal(m.length, 3);
assert.equal(marcarVianda(cambios, "2026-10-20", ["r"], "n").length, 2, "un cambio por día");

// Cambiar valores: desde ese día en adelante, sin tocar los técnicos ni los días anteriores
const v = valoresVianda(cambios, "2026-10-10", 300, 70, "n");
assert.equal(v.find(c => c.id === "a").vianda, 100);
assert.deepEqual(v.find(c => c.id === "b"), { id: "b", fecha: "2026-10-20", tecs: ["p"], vianda: 300, envio: 70 });
assert.deepEqual(v.find(c => c.id === "n").tecs, ["p", "r"]);
assert.equal(valoresVianda(cambios, "2026-10-20", 300, 70, "n").length, 2, "mismo día: no duplica");

// Tocar a un técnico: entra su grupo y sale el resto; apretado o sin grupo se suma solo; marcado sale solo él
assert.deepEqual(tocarTec(["s", "n"], "p", ["p", "r"]), ["p", "r"]);
assert.deepEqual(tocarTec(["s", "n"], "p", ["p", "r"], true), ["s", "n", "p"]);
assert.deepEqual(tocarTec(["s"], "e", []), ["s", "e"]);
assert.deepEqual(tocarTec(["p", "r"], "p", ["p", "r"]), ["r"]);

// Grupos: se arman de a dos, cada técnico en uno solo, y un grupo de uno desaparece
let g = cambiarGrupo([], "p", "r", "g1");
assert.deepEqual(g, [{ id: "g1", tecs: ["p", "r"] }]);
g = cambiarGrupo(g, "s", "n", "g2");
g = cambiarGrupo(g, "p", "n", "x");
assert.deepEqual(g, [{ id: "g1", tecs: ["p", "r", "n"] }], "n se mudó y el grupo de s quedó de uno");
g = cambiarGrupo(g, "p", "n", "x");
g = cambiarGrupo(g, "p", "r", "x");
assert.deepEqual(g, [], "sacar al último compañero borra el grupo");

// "Solo": grupo de uno que al marcarlo desmarca al resto y no se pierde al tocar otros grupos
assert.deepEqual(tocarTec(["s", "n"], "e", ["e"]), ["e"]);
assert.deepEqual(tocarTec(["s", "n"], "e", ["e"], true), ["s", "n", "e"]);
g = grupoSolo([{ id: "g1", tecs: ["p", "r"] }], "e", "g2");
assert.deepEqual(g, [{ id: "g1", tecs: ["p", "r"] }, { id: "g2", tecs: ["e"] }]);
assert.deepEqual(cambiarGrupo(g, "p", "n", "x"), [{ id: "g1", tecs: ["p", "r", "n"] }, { id: "g2", tecs: ["e"] }], "otro grupo no borra al solo");
assert.deepEqual(cambiarGrupo(g, "p", "r", "x"), [{ id: "g2", tecs: ["e"] }], "quedar sin compañero no es elegir Solo");
assert.deepEqual(grupoSolo(g, "e", "x"), [{ id: "g1", tecs: ["p", "r"] }], "Solo otra vez: sin grupo");
assert.deepEqual(grupoSolo(g, "p", "g3"), [{ id: "g2", tecs: ["e"] }, { id: "g3", tecs: ["p"] }], "pasar a Solo disuelve el grupo de a dos");
assert.deepEqual(cambiarGrupo(g, "e", "p", "x"), [{ id: "g2", tecs: ["e", "p"] }], "un solo que suma compañero deja de ser solo");

// El día en la planilla de técnicos es el de Reparando, aunque ya haya pasado a Revisión o Entregado
assert.equal(fechaRep({ fechas: { enreparacion: "2026-10-19", reparado: "2026-10-22", entregado: "2026-10-25" } }), "2026-10-19");
assert.equal(fechaRep({ fechas: { reparado: "2026-10-22", entregado: "2026-10-25" } }), "2026-10-22", "sin Reparando: el primer paso que tenga");
assert.equal(fechaRep({}), "");

// Sueldos: el 03/11 se ve el que cerró el 27/10; el que cierra el 27/11 aparece ese mismo día
const fijo = { fijo: true, desde: "2026-09-27" };
assert.deepEqual(fechasDeSueldo(fijo, "2026-11-03"), ["2026-09-27"]);
assert.deepEqual(fechasDeSueldo(fijo, "2026-11-26"), ["2026-09-27"]);
assert.deepEqual(fechasDeSueldo(fijo, "2026-11-27"), ["2026-09-27", "2026-10-27"]);
assert.deepEqual(fechasDeSueldo({ fijo: true, desde: "2026-10-30" }, "2026-11-03"), [], "todavía no cerró ninguno");
assert.deepEqual(fechasDeSueldo({ fijo: true, desde: "2026-09-27", hasta: "2026-10-15" }, "2026-12-30"), ["2026-09-27"], "fijo con hasta: no sigue después");
assert.deepEqual(fechasDeSueldo({ desde: "2026-11-01", hasta: "2026-11-30" }, "2026-11-03"), [], "con hasta: aparece al llegar");
assert.deepEqual(fechasDeSueldo({ desde: "2026-11-01", hasta: "2026-11-30" }, "2026-11-30"), ["2026-11-01"]);
assert.deepEqual(fechasDeSueldo({ desde: "2026-11-03" }, "2026-11-03"), ["2026-11-03"], "sin hasta: el mismo día");
console.log("ok");

// Agenda: 2 por día, lunes a viernes, desde el viernes 13/11 (que ya tiene 1 turno) → vie, lun, lun, mar
const LV = [1, 2, 3, 4, 5];
assert.deepEqual(repartirTurnos([1, 1, 1, 1], { desde: "2026-11-13", porDia: 2, dias: LV, ocupados: { "2026-11-13": [2] } }), ["2026-11-13", "2026-11-16", "2026-11-16", "2026-11-17"]);
assert.deepEqual(repartirTurnos([1, 1, 1], { desde: "2026-11-13", hasta: "2026-11-16", porDia: 1, dias: LV }), ["2026-11-13", "2026-11-16", null], "no pasa la fecha límite");
// Por grado: 1 de grado 1 y 1 de grado 2 por día; el grado 3 no tiene cupo
assert.deepEqual(repartirTurnos([1, 1, 2, 3], { desde: "2026-11-16", hasta: "2026-11-20", porGrado: { 1: 1, 2: 1 }, dias: LV }), ["2026-11-16", "2026-11-17", "2026-11-16", null]);
// Sobreturno: 1 por día lun a mié, 5 autos → los 2 que sobran van a lun y mar
assert.deepEqual(repartirTurnos([1, 1, 1, 1, 1], { desde: "2026-11-16", hasta: "2026-11-18", porDia: 1, dias: LV, sobreturno: true }), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-16", "2026-11-17"]);
