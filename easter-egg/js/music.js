// js/music.js — petite musique synthwave générée en direct avec Web Audio (aucun fichier audio).
// Boucle de 8 mesures : basse, arpège, nappe, grosse caisse et charleston.
// Le son ne démarre qu'après un clic du joueur (les navigateurs interdisent la lecture automatique).
// Quand le mode Neon est actif (code « neon »), un autre morceau original de 16 mesures prend le relais : plus rapide,
// brillant et dansant (rose néon et cyan), avec grosse caisse à 4 temps, basse sur les contretemps et mélodie pop.
// Quand le mode Edgerunners est actif (code « edgerunner »), la boucle change : morceau original de 16 mesures (~1 min),
// lent et mélancolique, dans l'ambiance d'« I Really Want to Stay at Your House » (aucune mélodie n'est reprise).
// Structure : intro (mesures 1-4), couplet (5-8), refrain (9-12), fin qui s'éteint (13-16). Le changement est immédiat.
// Quand le mode Blackwall est actif (code « blackwall »), morceau original de 24 mesures (~1 min 05) sombre et tendu :
// drones qui grondent, flux de données en arpège, grosse caisse industrielle, pulsations de basse, mélodie glaciale,
// puis une brèche où la musique se déchire (bégaiements, montée) avant le retour du mur.

import { THEME_TRACKS } from "./music-themes.js";

const BPM = 96;
const BPM_EDGE = 62;                  // tempo du morceau Edgerunners
const BPM_NEON = 118;                 // tempo du morceau Neon
const BPM_BLACKWALL = 88;             // tempo du morceau Blackwall
const isEdge = () => document.documentElement.classList.contains("edgerunners");
const isNeon = () => document.documentElement.classList.contains("neon");
const isBlackwall = () => document.documentElement.classList.contains("blackwall");
// Thème secret qui a son propre morceau (voir music-themes.js), ou null.
const extraTrack = () => {
  for (const id of Object.keys(THEME_TRACKS)) if (document.documentElement.classList.contains(id)) return THEME_TRACKS[id];
  return null;
};
const stepSeconds = () => 60 / (extraTrack()?.bpm ?? (isEdge() ? BPM_EDGE : isNeon() ? BPM_NEON : isBlackwall() ? BPM_BLACKWALL : BPM)) / 4;   // une double-croche, en secondes
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

// Morceau Blackwall : Fa mineur – Ré♭ – Si♭ mineur – Do (2 mesures chacun, 8 mesures), joué 3 fois = 24 mesures.
// Le dernier accord (Do avec une neuvième mineure) laisse une tension qui retombe sur Fa mineur.
const BW_CHORDS = [
  { root: 41, notes: [65, 68, 72, 77] },  // Fa mineur
  { root: 37, notes: [61, 65, 68, 73] },  // Ré♭
  { root: 34, notes: [58, 61, 65, 70] },  // Si♭ mineur
  { root: 36, notes: [60, 64, 67, 61] }   // Do (+ ré♭ : neuvième mineure)
];
const BW_BARS = 24;
const BW_ARP = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 1, 2, 3, 2];     // « flux de données » : 1 note par double-croche
// Mélodie glaciale, très espacée : [pas dans les 2 mesures, note MIDI, durée en pas].
const BW_LEAD = [
  [[0, 77, 10], [12, 80, 6], [20, 79, 4], [24, 77, 8]],
  [[0, 73, 10], [12, 77, 6], [20, 75, 4], [24, 73, 8]],
  [[0, 70, 10], [12, 73, 6], [20, 72, 4], [24, 70, 8]],
  [[0, 72, 6], [8, 73, 6], [16, 76, 8], [24, 73, 8]]
];

// Morceau Neon : Ré maj7 – La – Si m7 – Sol (1 mesure chacun), répété 4 fois = 16 mesures.
const NEON_CHORDS = [
  { root: 38, notes: [62, 66, 69, 73] },  // Ré maj7
  { root: 33, notes: [57, 61, 64, 69] },  // La
  { root: 35, notes: [59, 62, 66, 69] },  // Si m7
  { root: 31, notes: [55, 59, 62, 67] }   // Sol
];
const NEON_BARS = 16;
const NEON_ARP = [0, 1, 2, 3, 2, 1, 3, 2];
// Mélodies originales : [pas dans la mesure, note MIDI, durée en pas] — une par accord.
const NEON_VERSE = [
  [[0, 78, 3], [4, 76, 2], [6, 74, 2], [8, 78, 4], [12, 81, 4]],
  [[0, 76, 3], [4, 73, 2], [6, 76, 2], [8, 81, 6], [14, 78, 2]],
  [[0, 74, 3], [4, 78, 2], [6, 76, 2], [8, 74, 4], [12, 71, 4]],
  [[0, 74, 3], [4, 71, 2], [6, 74, 2], [8, 79, 4], [12, 78, 4]]
];
const NEON_CHORUS = [
  [[0, 81, 4], [4, 78, 4], [8, 81, 4], [12, 83, 4]],
  [[0, 81, 4], [4, 76, 4], [8, 73, 4], [12, 76, 4]],
  [[0, 78, 4], [4, 81, 4], [8, 83, 4], [12, 81, 4]],
  [[0, 79, 6], [6, 78, 2], [8, 74, 4], [12, 71, 4]]
];
const STEPS_PER_BAR = 16;
const BARS = 8;
const loopSteps = () => STEPS_PER_BAR * (extraTrack()?.bars ?? (isEdge() ? EDGE_BARS : isNeon() ? NEON_BARS : isBlackwall() ? BW_BARS : BARS));

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
  let trim = null;                    // niveau du morceau en cours (le Blackwall est mixé plus fort : on le ramène au niveau des autres)
  let leadBus = null;                 // mélodie du morceau Edgerunners : filtre passe-bas + écho
  let echo = null;
  let feedback = null;
  let wet = null;
  let reverbLevel = null;
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

  // --- Outils du morceau Blackwall ---

  let loopNoise = null;               // 2 s de bruit en boucle, pour les montées et les chocs
  function noiseSource() {
    if (!loopNoise) {
      loopNoise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = loopNoise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = loopNoise;
    src.loop = true;
    return src;
  }

  // Drone : deux dents de scie légèrement désaccordées + un sinus grave, dans un filtre qui s'ouvre puis se referme.
  function drone(freq, time, length, gain) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(150, time);
    filter.frequency.linearRampToValueAtTime(950, time + length * 0.55);
    filter.frequency.linearRampToValueAtTime(200, time + length);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + length * 0.25);
    amp.gain.setValueAtTime(gain, time + length * 0.7);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    for (const [type, detune, mult] of [["sawtooth", -9, 1], ["sawtooth", 9, 1], ["sine", 0, 0.5]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mult;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
    filter.connect(amp).connect(master);
  }

  // Montée : un souffle de bruit dont le filtre grimpe, dans la réverbération.
  function riser(time, length) {
    const src = noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(300, time);
    filter.frequency.exponentialRampToValueAtTime(7000, time + length);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.16, time + length * 0.97);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length + 0.06);
    src.connect(filter).connect(amp).connect(leadBus);
    src.start(time);
    src.stop(time + length + 0.1);
  }

  // Choc : grosse caisse à fond + un grondement de bruit qui s'éteint lentement.
  function impact(time) {
    kick(time, 1);
    const src = noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, time);
    filter.frequency.exponentialRampToValueAtTime(70, time + 1.4);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.32, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 1.5);
    src.connect(filter).connect(amp).connect(master);
    src.start(time);
    src.stop(time + 1.6);
  }

  // --- Instruments supplémentaires, utilisés par les morceaux de music-themes.js ---

  // Nappe douce : deux triangles désaccordés, attaque lente, filtre passe-bas.
  function pad(freq, time, length, gain, attack = 0.6, cutoff = 1400, dest = master) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + attack);
    amp.gain.setValueAtTime(gain, time + Math.max(attack, length * 0.6));
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
    filter.connect(amp).connect(dest);
  }

  // Caisse claire : souffle filtré + petit corps sourd.
  function snare(time, gain = 0.2) {
    hat(time, gain, 1800, 0.13, "bandpass");
    hat(time, gain * 0.5, 6500, 0.08);
    note(midi(55), time, 0.09, "triangle", gain * 0.55, master, 0.002);
  }

  // Taiko : un sinus qui chute, plus un coup de souffle grave.
  function taiko(time, gain = 0.5, pitch = 64) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(pitch * 2, time);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.62, time + 0.3);
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
    osc.connect(amp).connect(master);
    osc.start(time);
    osc.stop(time + 0.6);
    hat(time, gain * 0.35, 400, 0.1, "lowpass");
  }

  // Accord de cuivres : dents de scie désaccordées dans un filtre qui se referme vite.
  function stab(freqs, time, length, gain, cutoff = 2600, dest = master) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(380, time + length);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    for (const freq of freqs) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + length + 0.05);
      }
    }
    filter.connect(amp).connect(dest);
  }

  // Piano électrique : un sinus + deux harmoniques qui s'éteignent plus vite (son « Rhodes »).
  function epiano(freq, time, length, gain, dest = master) {
    for (const [mult, level, decay] of [[1, 1, 1], [2, 0.4, 0.55], [4, 0.12, 0.25]]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.exponentialRampToValueAtTime(gain * level, time + 0.006);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + length * decay);
      osc.connect(amp).connect(dest);
      osc.start(time);
      osc.stop(time + length * decay + 0.05);
    }
  }

  // Basse filtrée : dent de scie dont le filtre se referme à chaque note.
  function bassLP(freq, time, length, gain, cutoff = 700) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff * 0.25), time + length);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(filter).connect(amp).connect(master);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  // Corde pincée : triangle + carré à l'octave, extinction rapide, petit clic de bruit.
  function pluck(freq, time, length, gain, dest = master) {
    note(freq, time, length, "triangle", gain, dest, 0.004);
    note(freq * 2, time, length * 0.5, "square", gain * 0.25, dest, 0.004);
    hat(time, gain * 0.6, 3000, 0.02, "highpass");
  }

  // Trousse transmise aux morceaux de music-themes.js.
  const kit = {
    midi, note, lead, bright, kick, hat, drone, riser, impact, pad, snare, taiko, stab, epiano, bassLP, pluck,
    get leadBus() { return leadBus; },
    get master() { return master; }
  };

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

  // Synthé brillant du morceau Neon : deux dents de scie légèrement désaccordées.
  function bright(freq, time, length, gain, dest = leadBus) {
    note(freq * 0.997, time, length, "sawtooth", gain, dest, 0.015);
    note(freq * 1.003, time, length, "sawtooth", gain, dest, 0.015);
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

  // Morceau Neon (16 mesures) : intro (1-4), couplet (5-8), refrain (9-12), pont avec montée (13-16).
  function playNeonStep(index, time) {
    const STEP = stepSeconds();
    const bar = Math.floor(index / STEPS_PER_BAR) % NEON_BARS;
    const inBar = index % STEPS_PER_BAR;
    const chord = NEON_CHORDS[bar % 4];
    const section = Math.floor(bar / 4);          // 0 intro, 1 couplet, 2 refrain, 3 pont

    // Rythme : grosse caisse à 4 temps (dès la 3e mesure), clap sur 2 et 4, charleston sur les contretemps.
    const drums = section === 1 || section === 2 || (section === 0 && bar >= 2);
    if (drums && inBar % 4 === 0) kick(time, 0.8);
    if ((section === 1 || section === 2) && (inBar === 4 || inBar === 12)) hat(time, 0.2, 1400, 0.12, "bandpass");
    if (drums && inBar % 4 === 2) hat(time, 0.14, 8000, 0.09);
    if (section === 2 && inBar % 2 === 1) hat(time, 0.05);
    // Montée de la dernière mesure : caisse claire de plus en plus serrée.
    if (bar === 15 && inBar % 2 === 0) hat(time, 0.06 + inBar * 0.012, 1600, 0.08, "bandpass");

    // Basse sur les contretemps (laisse la place à la grosse caisse).
    if ((section === 1 || section === 2) && inBar % 4 === 2) {
      note(midi(chord.root + (inBar === 14 ? 12 : 0)), time, STEP * 3, "sawtooth", 0.15);
    }

    // Arpège rapide (plus discret au couplet).
    const arpGain = section === 1 ? 0.025 : section === 3 ? 0.03 : 0.035;
    const n = chord.notes[NEON_ARP[inBar % NEON_ARP.length]] + (section === 2 ? 12 : 0);
    note(midi(n), time, STEP * 1.6, "square", arpGain, leadBus, 0.008);

    // Nappe (refrain et pont).
    if (inBar === 0 && section >= 2) {
      for (const pad of chord.notes) note(midi(pad - 12), time, STEP * 16, "triangle", 0.035, master, 0.08);
    }

    // Mélodie : couplet, refrain (plus aigu), pont (reprend le couplet, plus doux).
    if (section >= 1) {
      const phrases = section === 2 ? NEON_CHORUS : NEON_VERSE;
      const gain = section === 2 ? 0.05 : section === 3 ? 0.032 : 0.04;
      for (const [at, note_, len] of phrases[bar % 4]) {
        if (at === inBar) bright(midi(note_), time, STEP * len, gain);
      }
    }
  }

  // Morceau Blackwall (24 mesures) : intro (1-4), montée (5-8), le mur (9-16), la brèche (17-20), le mur final (21-24).
  function playBlackwallStep(index, time) {
    const STEP = stepSeconds();
    const bar = Math.floor(index / STEPS_PER_BAR) % BW_BARS;
    const inBar = index % STEPS_PER_BAR;
    const pair = Math.floor((bar % 8) / 2);
    const chord = BW_CHORDS[pair];
    const section = bar < 4 ? 0 : bar < 8 ? 1 : bar < 16 ? 2 : bar < 20 ? 3 : 4;
    const wall = section === 2 || section === 4;

    // Drone : un accord grave qui respire sur 2 mesures.
    if (bar % 2 === 0 && inBar === 0) {
      const gain = section <= 1 ? 0.065 : 0.085;
      drone(midi(chord.root + 12), time, STEP * 32, gain);
      drone(midi(chord.root + 19), time, STEP * 32, gain * 0.55);
    }

    // Flux de données : arpège de carrés très fins (moitié moins dense à l'intro et dans la brèche).
    if (section === 1 || wall || inBar % 2 === 0) {
      const n = chord.notes[BW_ARP[inBar]] + 12;
      note(midi(n), time, STEP * 0.85, "square", wall ? 0.02 : 0.015);
    }

    // Tic-tac glacial à l'intro, craquements aléatoires partout.
    if (section === 0 && inBar % 4 === 0) hat(time, 0.05, 3200, 0.03);
    if (inBar % 2 === 1 && Math.random() < 0.07) hat(time, 0.035, 2600, 0.02);

    // Rythme industriel : grosse caisse sur 1 et 3 (+ ghost), caisse claire et claquement métallique sur 2 et 4.
    const drums = section === 1 || wall;
    if (drums && (inBar === 0 || inBar === 8)) kick(time, 0.8);
    if (wall && inBar === 11) kick(time, 0.35);
    if ((wall && (inBar === 4 || inBar === 12)) || (section === 1 && inBar === 12)) {
      hat(time, 0.17, 1700, 0.14, "bandpass");
      hat(time, 0.09, 6200, 0.07);
    }
    if (wall && inBar % 2 === 1) hat(time, 0.028);

    // Basse : sous-grave sinusoïdal + pulsations syncopées en dents de scie.
    if (drums && inBar === 0) note(midi(chord.root), time, STEP * 14, "sine", 0.22, master, 0.03);
    if (drums && (inBar === 3 || inBar === 6 || inBar === 10)) note(midi(chord.root), time, STEP * 2.5, "sawtooth", 0.05);
    if (section === 4 && inBar === 14) note(midi(chord.root + 12), time, STEP * 2, "sawtooth", 0.05);

    // Mélodie glaciale, une octave plus haut dans le mur final.
    if (wall) {
      const local = (bar % 2) * STEPS_PER_BAR + inBar;
      const up = section === 4 ? 12 : 0;
      for (const [at, n, len] of BW_LEAD[pair]) {
        if (at === local) lead(midi(n + up), time, STEP * len, section === 4 ? 0.1 : 0.08);
      }
    }

    // La brèche : la musique bégaie sur le dernier temps des mesures 18 et 20.
    if (section === 3 && (bar === 17 || bar === 19) && inBar >= 12) {
      note(midi(chord.notes[inBar % 4] + 24 - (inBar - 12)), time, STEP * 0.45, "square", 0.045, leadBus, 0.003);
    }

    // Montées avant les deux entrées du mur, chocs sur le premier temps du mur.
    if ((bar === 7 || bar === 19) && inBar === 0) riser(time, STEP * 16);
    if ((bar === 8 || bar === 20) && inBar === 0) impact(time);
  }

  function playStep(index, time) {
    const extra = extraTrack();
    if (extra) return extra.play(kit, index, time, stepSeconds());
    if (isEdge()) return playEdgeStep(index, time);
    if (isBlackwall()) return playBlackwallStep(index, time);
    if (isNeon()) return playNeonStep(index, time);
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

  // Écho (croche pointée) et réverbération : longs et enveloppants pour Edgerunners, courts et nets pour Neon.
  function tune() {
    echo.delayTime.value = stepSeconds() * 3;
    const extra = extraTrack();
    if (extra) {
      trim.gain.value = extra.fx.trim;
      feedback.gain.value = extra.fx.feedback;
      wet.gain.value = extra.fx.wet;
      reverbLevel.gain.value = extra.fx.reverb;
      return;
    }
    const neon = isNeon();
    const dark = isBlackwall();
    trim.gain.value = dark ? 0.42 : 1;
    feedback.gain.value = neon ? 0.32 : dark ? 0.52 : 0.45;
    wet.gain.value = neon ? 0.32 : dark ? 0.4 : 0.5;
    reverbLevel.gain.value = neon ? 0.12 : dark ? 0.6 : 0.45;
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
        trim = ctx.createGain();                       // réglage de niveau propre à chaque morceau (voir tune)
        master.connect(trim).connect(compressor).connect(ctx.destination);

        leadBus = ctx.createGain();
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 3000;
        echo = ctx.createDelay(2);
        feedback = ctx.createGain();
        wet = ctx.createGain();
        // Réverbération : bruit qui s'éteint sur ~3 s
        const length = Math.floor(ctx.sampleRate * 3);
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const data = impulse.getChannelData(c);
          for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
        }
        const reverb = ctx.createConvolver();
        reverb.buffer = impulse;
        reverbLevel = ctx.createGain();
        leadBus.connect(lowpass).connect(master);
        lowpass.connect(echo);
        echo.connect(feedback).connect(echo);
        echo.connect(wet).connect(master);
        lowpass.connect(reverb).connect(reverbLevel).connect(master);
      }
      tune();
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

  // Les codes « edgerunner » et « neon » (ou le retour au style normal) changent de morceau tout de suite, sans couper la musique.
  window.addEventListener("mc-theme", () => {
    if (!ctx) return;
    tune();
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
