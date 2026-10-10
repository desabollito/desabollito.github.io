// ═════════════════════════════════════════════════════════════
//  SONIDOS (hechos con Web Audio, sin archivos)
//  · Notificación nueva: un "ding" corto de dos notas.
//  · Actualizar: un auto acelerando (3 sonidos a elegir por el creador en su panel).
//  Cada usuario puede silenciarlos en Ajustes (se guarda en este equipo).
// ═════════════════════════════════════════════════════════════
export const SONIDOS_AUTO = [["deportivo", "Deportivo", "Acelera fuerte y pasa un cambio"], ["turbo", "Turbo", "Silbido de turbo y soplido al final"], ["v8", "V8 grave", "Motor grande, ronco y gordo"]];

export const sonidosOn = () => { try { return localStorage.getItem("sonidos") !== "off"; } catch { return true; } };
export const setSonidos = on => { try { localStorage.setItem("sonidos", on ? "on" : "off"); } catch { /* sin almacenamiento */ } };

let ctx = null;
function contexto() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  if (!ctx || ctx.state === "closed") ctx = new AC();
  return ctx;
}
// El navegador no deja sonar nada hasta que la persona toca la pantalla: si todavía no tocó, suena en el primer toque
function cuandoSePueda(fn) {
  const ac = contexto(); if (!ac) return;
  if (ac.state === "running") return fn(ac);
  ac.resume().then(() => { if (ac.state === "running") fn(ac); else esperarToque(fn); }).catch(() => esperarToque(fn));
}
let pendiente = null;
function esperarToque(fn) {
  if (pendiente) { pendiente = fn; return; }
  pendiente = fn;
  const una = () => { removeEventListener("pointerdown", una, true); removeEventListener("keydown", una, true);
    const f = pendiente; pendiente = null; const ac = contexto(); ac?.resume().then(() => f?.(ac)).catch(() => {}); };
  addEventListener("pointerdown", una, true); addEventListener("keydown", una, true);
}

const ruido = (ac, seg) => {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * seg), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(); s.buffer = b; return s;
};

// ── Notificación ──
export function sonidoNotif() {
  if (!sonidosOn()) return;
  cuandoSePueda(ac => {
    const t = ac.currentTime;
    [[880, 0], [1318.5, 0.11]].forEach(([f, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.22, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
      o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.5);
    });
  });
}

// ── Auto acelerando ──
// Motor = osciladores en la frecuencia de encendido + "pulso" de los cilindros (LFO) + ruido de admisión filtrado
function motor(ac, t, { dur, curva, tipos, filtro, vol, pulso, ruidoVol = 0.08 }) {
  const salida = ac.createGain();
  salida.gain.setValueAtTime(0.0001, t); salida.gain.exponentialRampToValueAtTime(vol, t + 0.07);
  salida.gain.setValueAtTime(vol, t + dur - 0.3); salida.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 5;
  lp.frequency.setValueAtTime(filtro[0], t); lp.frequency.exponentialRampToValueAtTime(filtro[1], t + dur * 0.85);
  lp.connect(salida); salida.connect(ac.destination);
  const pon = (f, k = 1) => { f.setValueAtTime(curva[0][1] * k, t); curva.slice(1).forEach(([s, hz]) => f.exponentialRampToValueAtTime(hz * k, t + s)); };
  tipos.forEach(([tipo, det, g0]) => {
    const o = ac.createOscillator(); o.type = tipo; o.detune.value = det; pon(o.frequency);
    const g = ac.createGain(); g.gain.value = g0; o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  });
  // Pulso de los cilindros: modula el volumen
  const lfo = ac.createOscillator(), lg = ac.createGain();
  lfo.frequency.setValueAtTime(pulso[0], t); lfo.frequency.linearRampToValueAtTime(pulso[1], t + dur);
  lg.gain.value = vol * 0.4; lfo.connect(lg); lg.connect(salida.gain); lfo.start(t); lfo.stop(t + dur + 0.05);
  // Ruido de admisión/escape
  const n = ruido(ac, dur + 0.1), bp = ac.createBiquadFilter(), ng = ac.createGain();
  bp.type = "bandpass"; bp.Q.value = 1.2; pon(bp.frequency, 4);
  ng.gain.value = ruidoVol; n.connect(bp); bp.connect(ng); ng.connect(lp); n.start(t); n.stop(t + dur + 0.05);
  return salida;
}

const PERFILES = {
  deportivo: (ac, t) => {
    motor(ac, t, { dur: 1.3, vol: 0.3, filtro: [500, 2600], pulso: [20, 48],
      curva: [[0, 52], [0.45, 165], [0.53, 112], [1.3, 280]], tipos: [["sawtooth", 0, 0.55], ["square", 9, 0.25], ["sawtooth", -1200, 0.35]] });
  },
  turbo: (ac, t) => {
    const dur = 1.35;
    motor(ac, t, { dur, vol: 0.26, filtro: [450, 2200], pulso: [18, 42],
      curva: [[0, 48], [0.9, 190], [dur, 230]], tipos: [["sawtooth", 0, 0.55], ["square", 6, 0.22]] });
    // Silbido del turbo que sube
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(1800, t + 0.15); o.frequency.exponentialRampToValueAtTime(5200, t + 1.05);
    g.gain.setValueAtTime(0.0001, t + 0.15); g.gain.exponentialRampToValueAtTime(0.045, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.12);
    o.connect(g); g.connect(ac.destination); o.start(t + 0.15); o.stop(t + 1.2);
    // "Pssshh" de la válvula de alivio al soltar
    const n = ruido(ac, 0.5), hp = ac.createBiquadFilter(), ng = ac.createGain();
    hp.type = "highpass"; hp.frequency.value = 2500; ng.gain.setValueAtTime(0.0001, t + 1.05);
    ng.gain.exponentialRampToValueAtTime(0.16, t + 1.09); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(hp); hp.connect(ng); ng.connect(ac.destination); n.start(t + 1.05); n.stop(t + 1.55);
  },
  v8: (ac, t) => {
    motor(ac, t, { dur: 1.45, vol: 0.34, filtro: [260, 1200], pulso: [11, 26], ruidoVol: 0.12,
      curva: [[0, 34], [0.35, 58], [0.42, 50], [1.45, 125]], tipos: [["sawtooth", 0, 0.6], ["square", -12, 0.35], ["triangle", -1200, 0.5]] });
  }
};
export function ruidoMotor(tipo = "deportivo", forzar = false) {
  if (!forzar && !sonidosOn()) return;
  const ac = contexto(); if (!ac) return;
  ac.resume?.().catch(() => {});
  try { (PERFILES[tipo] || PERFILES.deportivo)(ac, ac.currentTime + 0.02); } catch (e) { console.warn("sonido", e); }
}
