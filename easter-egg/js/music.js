// js/music.js — petite musique synthwave générée en direct avec Web Audio (aucun fichier audio).
// Boucle de 8 mesures : basse, arpège, nappe, grosse caisse et charleston.
// Le son ne démarre qu'après un clic du joueur (les navigateurs interdisent la lecture automatique).

const BPM = 96;
const STEP = 60 / BPM / 4;            // une double-croche, en secondes
const LOOKAHEAD = 0.25;               // on programme les notes 250 ms à l'avance
const KEY = "mc-music";

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Progression : Am – F – C – G (2 mesures chacune → 8 mesures au total)
const CHORDS = [
  { root: 33, notes: [57, 60, 64] },  // La mineur
  { root: 29, notes: [53, 57, 60] },  // Fa
  { root: 36, notes: [55, 60, 64] },  // Do
  { root: 31, notes: [55, 59, 62] }   // Sol
];
const ARP = [0, 1, 2, 1, 2, 1, 0, 2];  // ordre des notes de l'accord, 1 par double-croche
const STEPS_PER_BAR = 16;
const BARS = 8;

function readPref() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writePref(pref) {
  try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch { /* pas grave */ }
}

export function createMusic() {
  const pref = readPref();
  let volume = typeof pref.volume === "number" ? Math.min(1, Math.max(0, pref.volume)) : 0.5;
  let on = false;
  let ctx = null;
  let master = null;
  let timer = 0;
  let nextTime = 0;
  let step = 0;
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn({ on, volume }));

  function note(freq, time, length, type, gain, dest = master) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(amp).connect(dest);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  function kick(time) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    amp.gain.setValueAtTime(0.9, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    osc.connect(amp).connect(master);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  let noiseBuffer = null;
  function hat(time, gain) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 7000;
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(filter).connect(amp).connect(master);
    src.start(time);
    src.stop(time + 0.08);
  }

  function playStep(index, time) {
    const bar = Math.floor(index / STEPS_PER_BAR) % BARS;
    const inBar = index % STEPS_PER_BAR;
    const chord = CHORDS[Math.floor(bar / 2)];

    if (inBar % 4 === 0) kick(time);
    if (inBar % 2 === 1) hat(time, 0.12);
    else if (inBar % 4 === 2) hat(time, 0.2);

    // Basse : croches sur la fondamentale, octave en haut sur les contretemps
    if (inBar % 2 === 0) note(midi(chord.root + (inBar % 8 === 6 ? 12 : 0)), time, STEP * 1.8, "sawtooth", 0.16);

    // Arpège (plus présent à partir de la 3e mesure)
    if (bar >= 2 || inBar % 2 === 0) {
      const n = chord.notes[ARP[inBar % ARP.length]] + (bar % 4 === 3 && inBar >= 8 ? 12 : 0);
      note(midi(n), time, STEP * 1.5, "square", 0.045);
    }

    // Nappe : un accord tenu au début de chaque mesure
    if (inBar === 0) for (const n of chord.notes) note(midi(n - 12), time, STEP * 15, "triangle", 0.05);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      playStep(step, nextTime);
      step = (step + 1) % (STEPS_PER_BAR * BARS);
      nextTime += STEP;
    }
  }

  function start() {
    if (on) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!ctx) {
        ctx = new AudioCtx();
        master = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        master.connect(compressor).connect(ctx.destination);
      }
      master.gain.value = volume * 0.6;
      ctx.resume();
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      timer = window.setInterval(schedule, 80);
      on = true;
      writePref({ ...readPref(), on: true, volume });
      emit();
    } catch {
      on = false;
    }
  }

  function stop() {
    if (!on) return;
    window.clearInterval(timer);
    on = false;
    ctx?.suspend();
    writePref({ ...readPref(), on: false, volume });
    emit();
  }

  // Onglet en arrière-plan : on coupe le son sans changer le choix du joueur.
  document.addEventListener("visibilitychange", () => {
    if (!on || !ctx) return;
    if (document.hidden) { window.clearInterval(timer); ctx.suspend(); }
    else { ctx.resume(); nextTime = ctx.currentTime + 0.1; timer = window.setInterval(schedule, 80); }
  });

  return {
    get on() { return on; },
    get volume() { return volume; },
    wantedOn: !!pref.on,      // le joueur l'avait activée la dernière fois
    toggle() { on ? stop() : start(); },
    start,
    stop,
    setVolume(v) {
      volume = Math.min(1, Math.max(0, Number(v) || 0));
      if (master) master.gain.value = volume * 0.6;
      writePref({ ...readPref(), volume });
      emit();
    },
    subscribe(fn) { listeners.add(fn); }
  };
}
