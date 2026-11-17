// Lo que el bot no reconoce como marca o modelo va a adicionales, no al nombre del vehículo
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretar } from "../bot/worker.js";

test("texto suelto va a adicionales, no al modelo", () => {
  for (const [t, obs] of [["AH337VT  - OT ENVIADA", "OT ENVIADA"], ["AC821ND \n1136810075\nREPUESTOS AVISAR", "REPUESTOS AVISAR"], ["STRO 02-01-02461774\nBAGUETAS DE TECHO\nHZO339", "STRO BAGUETAS"]]) {
    const r = interpretar(t);
    assert.equal(r.modelo, "", t);
    assert.equal(r.observaciones, obs, t);
  }
  assert.equal(interpretar("Chery Tiggo 4 AB123CD").modelo, "Chery Tiggo 4");
  assert.equal(interpretar("AB123CD Juan Perez 2215551234 Sandero").asegurado, "Juan Perez");
});
