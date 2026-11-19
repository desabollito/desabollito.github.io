// Estado de entrega de los mensajes del chat en vivo (webhook messages.update de Evolution)
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDe, avanzaEstado } from "../bot/worker.js";

test("lee el estado en los dos formatos de Evolution", () => {
  assert.deepEqual(estadoDe({ keyId: "3EB0ABC123", fromMe: true, status: "DELIVERY_ACK" }), { id: "3EB0ABC123", est: "DELIVERY_ACK" });
  assert.deepEqual(estadoDe({ key: { id: "3EB0ABC123", fromMe: true }, update: { status: 4 } }), { id: "3EB0ABC123", est: "READ" });
  assert.equal(estadoDe({ keyId: "3EB0ABC123", fromMe: false, status: "READ" }), null);   // del cliente: no
});
test("el estado solo avanza; ERROR solo si no se entregó", () => {
  assert.ok(avanzaEstado("PENDING", "SERVER_ACK"));
  assert.ok(!avanzaEstado("READ", "DELIVERY_ACK"));
  assert.ok(avanzaEstado("PENDING", "ERROR"));
  assert.ok(!avanzaEstado("DELIVERY_ACK", "ERROR"));
});
