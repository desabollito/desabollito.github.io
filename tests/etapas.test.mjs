// El estado de cada repuesto / paño sigue al ítem al editar la lista
import { test } from "node:test";
import assert from "node:assert/strict";
import { etapasTrasEditar, claveItem } from "../js/domain.js";

test("renombrar, agregar y quitar conservan el estado", () => {
  const et = { espejo: "pedido", capot: "recibido" };
  assert.deepEqual(etapasTrasEditar(["Espejo", "Capot"], ["Espejo derecho", "Capot"], et), { espejo_derecho: "pedido", capot: "recibido" });   // renombrado en el lugar
  assert.deepEqual(etapasTrasEditar(["Espejo", "Capot"], ["Faro", "Espejo", "Capot"], et), { espejo: "pedido", capot: "recibido" });   // agregado adelante: nadie hereda mal
  assert.deepEqual(etapasTrasEditar(["Espejo", "Capot"], ["Capot"], et), { capot: "recibido" });   // quitado
  assert.equal(claveItem("Óptica Der."), "optica_der");
});
