// js/music.js — petite musique synthwave générée en direct avec Web Audio (aucun fichier audio).
// Boucle de 8 mesures : basse, arpège, nappe, grosse caisse et charleston.
// Le son ne démarre qu'après un clic du joueur (les navigateurs interdisent la lecture automatique).
// Quand le mode Edgerunners est actif (code « edgerunner »), la boucle change : morceau original, plus lent et mélancolique,
// inspiré de l'ambiance d'« I Really Want to Stay at Your House » (aucune mélodie n'est reprise). Le changement est immédiat.

const BPM = 96;
const BPM_EDGE = 78;                  // tempo du morceau Edgerunners
const isEdge = () => document.documentElement.classList.contains("edgerunners");
const stepSeconds = () => 60 / (isEdge() ? BPM_EDGE : BPM) / 4;   // une double-croche, en secondes
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

// Morceau Edgerunners : Ré mineur – Si♭ – Fa – Do (2 mesures chacune)
const EDGE_CHORDS = [
  { root: 38, notes: [62, 65, 69] },  // Ré mineur
  { root: 34, notes: [58, 62, 65] },  // Si♭
  { root: 41, notes: [60, 65, 69] },  // Fa
  { root: 36, notes: [60, 64, 67] }   // Do
];
// Mélodie originale : [pas dans les 2 mesures, note MIDI, durée en pas] — jouée à partir de la 3e mesure.
const EDGE_LEAD = [
  [[0, 69, 6], [6, 67, 2], [8, 65, 4], [12, 64, 4], [16, 62, 10], [28, 64, 4]],
  [[0, 70, 6], [6, 69, 2], [8, 65, 4], [12, 67, 4], [16, 65, 12]],
  [[0, 72, 6], [6, 69, 2], [8, 65, 6], [14, 69, 2], [16, 67, 4], [20, 65, 4], [24, 64, 6]],
  [[0, 67, 4], [4, 69, 4], [8, 71, 6], [16, 72, 8], [24, 69, 4], [28, 67, 4]]
];
const EDGE_ARP = [0, 1, 2, 1];
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
  let leadBus = null;                 // mélodie du morceau Edgerunners : filtre passe-bas + écho
  let echo = null;
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
  function hat(time, gain, freq = 7000, decay = 0.05, type = "highpass") {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = freq;
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    src.connect(filter).connect(amp).connect(master);
    src.start(time);
    src.stop(time + decay + 0.03);
  }

  // Morceau Edgerunners : kick sur 1 et 3, caisse claire sur 2 et 4, basse, nappe, arpège doux et mélodie avec écho.
  function playEdgeStep(index, time) {
    const STEP = stepSeconds();
    const bar = Math.floor(index / STEPS_PER_BAR) % BARS;
    const inBar = index % STEPS_PER_BAR;
    const pair = Math.floor(bar / 2);
    const chord = EDGE_CHORDS[pair];

    if (inBar === 0 || inBar === 8) kick(time);
    if (inBar === 4 || inBar === 12) hat(time, 0.22, 1800, 0.12, "bandpass");
    if (inBar % 2 === 0) hat(time, 0.07);

    if (inBar === 0 || inBar === 10) note(midi(chord.root), time, STEP * 9, "sawtooth", 0.13);
    if (inBar === 0) for (const n of chord.notes) note(midi(n - 12), time, STEP * 16, "triangle", 0.05);

    if (inBar % 2 === 0 && bar >= 1) {
      const n = chord.notes[EDGE_ARP[(inBar / 2) % EDGE_ARP.length]] + 12;
      note(midi(n), time, STEP * 2.5, "square", 0.03);
    }

    if (bar >= 2) {
      const local = (bar % 2) * STEPS_PER_BAR + inBar;
      for (const [at, n, len] of EDGE_LEAD[pair]) {
        if (at === local) note(midi(n), time, STEP * len, "sawtooth", 0.05, leadBus);
      }
    }
  }

  function playStep(index, time) {
    if (isEdge()) return playEdgeStep(index, time);
    const STEP = stepSeconds();
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
      nextTime += stepSeconds();
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

        leadBus = ctx.createGain();
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 2200;
        echo = ctx.createDelay(1);
        const feedback = ctx.createGain();
        feedback.gain.value = 0.38;
        const wet = ctx.createGain();
        wet.gain.value = 0.55;
        leadBus.connect(lowpass).connect(master);
        lowpass.connect(echo);
        echo.connect(feedback).connect(echo);
        echo.connect(wet).connect(master);
      }
      echo.delayTime.value = stepSeconds() * 3;   // écho en croche pointée
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

  // Le code « edgerunner » (ou le retour au style normal) change de morceau tout de suite, sans couper la musique.
  window.addEventListener("mc-theme", () => {
    if (!ctx) return;
    echo.delayTime.value = stepSeconds() * 3;
    step = 0;
    if (on) nextTime = ctx.currentTime + 0.15;
  });

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
