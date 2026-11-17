// Lo que el bot no reconoce como marca o modelo va a adicionales, no al nombre del vehículo
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretar } from "../bot/worker.js";

test("texto suelto va a adicionales, no al modelo", () => {
  for (const [t, obs] of [["AH337VT  - OT ENVIADA", "OT ENVIADA"], ["AC821ND \n1136810075\nREPUESTOS AVISAR", "REPUESTOS AVISAR"], ["STRO 02-01-02461774\nBAGUETAS DE TECHO\nHZO339", "BAGUETAS\nSiniestro 02-01-02461774"]]) {
    const r = interpretar(t);
    assert.equal(r.modelo, "", t);
    assert.equal(r.observaciones, obs, t);
  }
  assert.equal(interpretar("Chery Tiggo 4 AB123CD").modelo, "Chery Tiggo 4");
  assert.equal(interpretar("AB123CD Juan Perez 2215551234 Sandero").asegurado, "Juan Perez");
});

test("siniestro no se toma como teléfono", () => {
  for (const [t, tel, stro] of [["STRO 02-01-02461774 HZO339", "", "02-01-02461774"], ["AB123CD 02-01-02461774 1137709755", "1137709755", "02-01-02461774"],
    ["AB123CD 1234567890123", "", "1234567890123"], ["AB123CD 11-3770-9755", "1137709755", undefined], ["AB123CD 0341 15 5551234", "0341155551234", undefined]]) {
    const r = interpretar(t);
    assert.equal(r.telefono, tel, t);
    assert.equal(r.siniestro, stro, t);
  }
});
