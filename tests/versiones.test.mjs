// node tests/versiones.test.mjs
import assert from "node:assert/strict";
import { estadoEn, marcarVianda, valoresVianda } from "../tester/js/domain.js";

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
console.log("ok");
