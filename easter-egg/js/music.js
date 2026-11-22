// js/music.js — petite musique synthwave générée en direct avec Web Audio (aucun fichier audio).
// Boucle de 8 mesures : basse, arpège, nappe, grosse caisse et charleston.
// Le son ne démarre qu'après un clic du joueur (les navigateurs interdisent la lecture automatique).
// Quand le mode Edgerunners est actif (code « edgerunner »), la boucle change : morceau original de 16 mesures (~1 min),
// lent et mélancolique, dans l'ambiance d'« I Really Want to Stay at Your House » (aucune mélodie n'est reprise).
// Structure : intro (mesures 1-4), couplet (5-8), refrain (9-12), fin qui s'éteint (13-16). Le changement est immédiat.

const BPM = 96;
const BPM_EDGE = 62;                  // tempo du morceau Edgerunners
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

// Morceau Edgerunners : Mi mineur – Do – Sol – Si (2 mesures chacun), répété 2 fois = 16 mesures.
const EDGE_CHORDS = [
  { root: 28, notes: [64, 67, 71] },  // Mi mineur
  { root: 24, notes: [60, 64, 67] },  // Do
  { root: 31, notes: [62, 67, 71] },  // Sol
  { root: 35, notes: [63, 66, 71] }   // Si (tension, retombe sur Mi mineur)
];
const EDGE_BARS = 16;
// Mélodies originales : [pas dans les 2 mesures de l'accord, note MIDI, durée en pas].
const EDGE_VERSE = [
  [[0, 71, 8], [8, 69, 4], [12, 67, 4], [16, 66, 14]],
  [[0, 67, 8], [8, 72, 6], [16, 71, 8], [24, 69, 8]],
  [[0, 67, 6], [6, 71, 2], [8, 74, 8], [20, 71, 4], [24, 67, 8]],
  [[0, 66, 8], [8, 71, 8], [16, 75, 8], [24, 74, 8]]
];
const EDGE_CHORUS = [
  [[0, 76, 8], [8, 74, 4], [12, 71, 4], [16, 74, 16]],
  [[0, 72, 8], [8, 76, 8], [16, 74, 8], [24, 72, 8]],
  [[0, 74, 8], [8, 71, 4], [12, 74, 4], [16, 76, 16]],
  [[0, 75, 8], [8, 74, 8], [16, 71, 8], [24, 66, 8]]
];
const EDGE_ARP = [0, 1, 2, 1];
const STEPS_PER_BAR = 16;
const BARS = 8;
const loopSteps = () => STEPS_PER_BAR * (isEdge() ? EDGE_BARS : BARS);

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

  function note(freq, time, length, type, gain, dest = master, attack = 0.01) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(amp).connect(dest);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  // Voix de mélodie : sinus doux + triangle, attaque lente, vibrato qui s'installe après la note.
  function lead(freq, time, length, gain) {
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + 0.12);
    amp.gain.setValueAtTime(gain, time + Math.max(0.13, length * 0.55));
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    amp.connect(leadBus);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, time);
    depth.gain.linearRampToValueAtTime(freq * 0.006, time + 0.5);
    lfo.connect(depth);
    lfo.start(time);
    lfo.stop(time + length + 0.05);
    for (const [type, detune, level] of [["sine", 0, 1], ["triangle", 4, 0.35]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.value = detune;
      g.gain.value = level;
      depth.connect(osc.frequency);
      osc.connect(g).connect(amp);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
  }

  function kick(time, level = 0.9) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    amp.gain.setValueAtTime(level, time);
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

  // Morceau Edgerunners (16 mesures) : nappe qui respire, « battement de cœur », basse sinusoïdale,
  // arpège de piano lointain, mélodie chantée (couplet puis refrain plus aigu), puis tout s'éteint.
  function playEdgeStep(index, time) {
    const STEP = stepSeconds();
    const bar = Math.floor(index / STEPS_PER_BAR) % EDGE_BARS;
    const inBar = index % STEPS_PER_BAR;
    const pair = Math.floor(bar / 2) % 4;
    const chord = EDGE_CHORDS[pair];
    const section = Math.floor(bar / 4);          // 0 intro, 1 couplet, 2 refrain, 3 fin

    // Nappe : un accord tenu sur 2 mesures, attaque très lente.
    if (bar % 2 === 0 && inBar === 0) {
      for (const n of chord.notes) note(midi(n - 12), time, STEP * 32, "triangle", section === 2 ? 0.07 : 0.05, master, 1.2);
      note(midi(chord.notes[0]), time, STEP * 32, "sine", 0.025, leadBus, 1.6);
    }

    // Basse sinusoïdale, à partir du couplet.
    if (section >= 1 && inBar === 0) note(midi(chord.root), time, STEP * 15, "sine", 0.22, master, 0.04);
    if (section === 2 && inBar === 10) note(midi(chord.root + 12), time, STEP * 5, "sine", 0.1, master, 0.04);

    // « Battement de cœur » (couplet et refrain) + souffle de caisse claire au refrain.
    if (section === 1 || section === 2) {
      if (inBar === 0) kick(time, 0.55);
      if (inBar === 3) kick(time, 0.3);
    }
    if (section === 2) {
      if (inBar === 8) hat(time, 0.1, 1600, 0.16, "bandpass");
      if (inBar % 4 === 2) hat(time, 0.035);
    }
    if (section === 3 && bar === 12 && inBar === 0) kick(time, 0.4);

    // Arpège de piano lointain (disparaît à la fin).
    if (section < 3) {
      const every = section === 2 ? 2 : 4;
      if (inBar % every === 0) {
        const n = chord.notes[EDGE_ARP[(inBar / every) % EDGE_ARP.length]] + 12;
        note(midi(n), time, STEP * 6, "sine", section === 0 ? 0.05 : 0.04, leadBus, 0.02);
      }
    }

    // Mélodie : dès le couplet. Refrain plus aigu et plus présent ; la fin reprend le couplet, plus douce.
    if (section >= 1) {
      const phrases = section === 2 ? EDGE_CHORUS : EDGE_VERSE;
      const local = (bar % 2) * STEPS_PER_BAR + inBar;
      const gain = section === 2 ? 0.1 : section === 3 ? 0.06 : 0.08;
      for (const [at, n, len] of phrases[pair]) {
        if (at === local) lead(midi(n), time, STEP * len, gain);
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
      step = (step + 1) % loopSteps();
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
        lowpass.frequency.value = 3000;
        echo = ctx.createDelay(2);
        const feedback = ctx.createGain();
        feedback.gain.value = 0.45;
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        // Réverbération : bruit qui s'éteint sur ~3 s
        const length = Math.floor(ctx.sampleRate * 3);
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const data = impulse.getChannelData(c);
          for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
        }
        const reverb = ctx.createConvolver();
        reverb.buffer = impulse;
        const reverbLevel = ctx.createGain();
        reverbLevel.gain.value = 0.45;
        leadBus.connect(lowpass).connect(master);
        lowpass.connect(echo);
        echo.connect(feedback).connect(echo);
        echo.connect(wet).connect(master);
        lowpass.connect(reverb).connect(reverbLevel).connect(master);
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
