// js/music-themes.js — les morceaux des thèmes secrets (un par thème), joués par music.js quand le thème est actif.
// Chaque morceau est original : aucune mélodie existante n'est reprise, seulement l'ambiance du thème.
//
// Un morceau = { bpm, bars, fx, play(k, index, time, S) }
//   bpm, bars : tempo et nombre de mesures de la boucle (16 pas par mesure)
//   fx        : niveau (trim) et effets (écho feedback/wet, réverbération reverb)
//   play      : appelé pour chaque pas (index = numéro du pas, time = instant audio, S = durée d'un pas en secondes)
//   k         : la trousse d'instruments de music.js (note, lead, kick, hat, snare, taiko, stab, epiano, pad, drone…)

const STEPS = 16;
const bounds = (index, bars) => {
  const bar = Math.floor(index / STEPS) % bars;
  return { bar, inBar: index % STEPS };
};

/* =====================================================================================================
   ARASAKA — 84 BPM, ré mineur, gamme japonaise (ré, mi♭, sol, la, si♭). Taiko, cordes pincées, shakuhachi.
   Intro (1-4) · montée (5-8) · le grand salon (9-14) · retour au calme (15-16)
===================================================================================================== */
const ARASAKA_ROOTS = [38, 34, 31, 33, 38, 34, 31, 33];                 // une fondamentale toutes les 2 mesures
const ARASAKA_PLUCK = [                                                 // [pas, note] — notes de la gamme, très espacées
  [[0, 74], [3, 77], [6, 79], [11, 77]],
  [[0, 70], [4, 74], [7, 77], [12, 74]],
  [[0, 67], [3, 70], [8, 74], [10, 72]],
  [[0, 69], [4, 73], [6, 76], [11, 73]]
];
const ARASAKA_LEAD = [
  [[0, 74, 14], [16, 77, 6], [24, 79, 8]],
  [[0, 70, 12], [16, 74, 10], [28, 72, 4]],
  [[0, 67, 14], [16, 70, 8], [26, 74, 6]],
  [[0, 69, 10], [12, 73, 6], [20, 76, 12]]
];

function arasaka(k, index, time, S) {
  const { bar, inBar } = bounds(index, 16);
  const pair = Math.floor(bar / 2) % 4;
  const root = ARASAKA_ROOTS[Math.floor(bar / 2)];
  const section = bar < 4 ? 0 : bar < 8 ? 1 : bar < 14 ? 2 : 3;

  if (bar % 2 === 0 && inBar === 0) {                                   // le drone, qui respire sur 2 mesures
    k.pad(k.midi(root + 12), time, S * 32, 0.07, 1.4, 650);
    k.pad(k.midi(root + 19), time, S * 32, 0.04, 1.8, 900);
  }
  if (bar % 2 === 0 && inBar === 0 && section === 2) k.stab([k.midi(root + 24), k.midi(root + 27), k.midi(root + 31)], time, S * 3, 0.03, 3000, k.leadBus);

  // taiko : un coup solennel, puis deux, puis des roulements à la fin de chaque phrase
  if (section === 0 && bar % 2 === 0 && inBar === 0) k.taiko(time, 0.34, 58);
  if (section >= 1 && section <= 2 && (inBar === 0 || inBar === 8)) k.taiko(time, section === 2 ? 0.5 : 0.4, 58);
  if (section === 2 && inBar === 10 && bar % 2 === 1) k.taiko(time, 0.3, 70);
  if (section >= 1 && section <= 2 && bar % 4 === 3 && inBar >= 12) k.taiko(time, 0.2 + (inBar - 12) * 0.08, 64 + (inBar - 12) * 2);
  if (section === 3 && bar === 14 && inBar === 0) k.taiko(time, 0.32, 55);

  // bois : un tic sec toutes les quatre doubles-croches à partir de la montée
  if (section >= 1 && section <= 2 && inBar % 4 === 2) k.hat(time, 0.05, 3600, 0.03, "bandpass");

  // koto : quelques cordes pincées par mesure, dans l'écho
  for (const [at, n] of ARASAKA_PLUCK[pair]) {
    if (at === inBar) k.pluck(k.midi(n), time, S * 5, section === 0 ? 0.05 : 0.07, k.leadBus);
  }

  // shakuhachi : longues notes soufflées, dans le grand salon
  if (section === 2) {
    const local = (bar % 2) * STEPS + inBar;
    for (const [at, n, len] of ARASAKA_LEAD[pair]) if (at === local) k.lead(k.midi(n), time, S * len, 0.09);
  }
}

/* =====================================================================================================
   MILITECH — 104 BPM, mi mineur. Caisse claire militaire, grosse caisse, basse sèche, cuivres, bips de HUD.
   Intro (1-4) · assaut (5-12) · pause (13-14) · charge finale (15-16)
===================================================================================================== */
const MIL_ROOTS = [40, 36, 38, 35, 40, 36, 38, 35];                      // une fondamentale par 2 mesures
const MIL_CHORDS = [[64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66]];
const MIL_HORN = [[[0, 76, 4], [4, 79, 4], [8, 83, 6]], [[0, 76, 4], [4, 72, 4], [8, 76, 6]], [[0, 74, 4], [4, 78, 4], [8, 81, 6]], [[0, 71, 4], [4, 75, 4], [8, 78, 6]]];

function militech(k, index, time, S) {
  const { bar, inBar } = bounds(index, 16);
  const cyc = Math.floor((bar % 8) / 2);
  const root = MIL_ROOTS[Math.floor((bar % 8) / 2)];
  const chord = MIL_CHORDS[cyc];
  const section = bar < 4 ? 0 : bar < 12 ? 1 : bar < 14 ? 2 : 3;
  const fight = section === 1 || section === 3;

  // bips de HUD : un ping aigu toutes les 8 doubles-croches
  if (inBar % 8 === 0 && (section === 0 || section === 2)) k.note(k.midi(96), time, S * 1.2, "sine", 0.05, k.leadBus, 0.004);
  if (section === 0 && inBar === 4 && bar % 2 === 1) k.note(k.midi(91), time, S * 1.2, "sine", 0.04, k.leadBus, 0.004);

  // roulement de caisse claire qui monte pendant l'intro et avant la charge
  if ((section === 0 && bar >= 2) || (section === 2 && bar === 13)) {
    if (inBar % 2 === 0) k.hat(time, 0.04 + (bar - 2 + inBar / 16) * 0.012, 2000, 0.07, "bandpass");
  }

  if (fight) {
    if (inBar === 0 || inBar === 8) k.kick(time, 0.9);
    if (inBar === 6 || inBar === 10) k.kick(time, 0.35);
    if (inBar === 4 || inBar === 12) k.snare(time, 0.2);
    if (inBar === 3 || inBar === 11) k.snare(time, 0.06);                                       // notes fantômes
    if (bar % 2 === 1 && inBar >= 13) k.snare(time, 0.07 + (inBar - 13) * 0.03);                 // roulement de fin de phrase
    if (inBar % 2 === 0) k.bassLP(k.midi(root + (inBar % 8 === 6 ? 12 : 0)), time, S * 1.8, 0.16, 650);
    // cuivres : accords secs sur le premier temps et en syncope
    if (inBar === 0 || (section === 3 && (inBar === 6 || inBar === 10)) || (section === 1 && bar >= 8 && inBar === 6)) {
      k.stab(chord.map((n) => k.midi(n)), time, S * 2.4, 0.026, 2800);
    }
    // cor : appel héroïque sur 2 mesures, dans la charge finale
    if (section === 3 && bar % 2 === 0) {
      for (const [at, n, len] of MIL_HORN[cyc]) if (at === inBar) k.bright(k.midi(n), time, S * len, 0.04);
    }
  } else if (section === 2) {
    if (inBar === 0) k.kick(time, 0.5);
    if (inBar === 0 && bar % 2 === 0) k.drone(k.midi(root + 12), time, S * 32, 0.07);
  }
  if (section === 0 && inBar === 0 && bar % 2 === 0) k.drone(k.midi(root + 12), time, S * 32, 0.05);
  if (section === 3 && bar === 14 && inBar === 0) k.impact(time);
}

/* =====================================================================================================
   AFTERLIFE — 92 BPM, la mineur. Piano électrique, basse chaude, balais swingués, saxophone qui traîne.
   Comptoir (1-4) · on s'installe (5-8) · le solo (9-12) · dernier verre (13-16)
===================================================================================================== */
const AFTER_CHORDS = [
  { root: 45, notes: [60, 64, 67, 71] },    // La mineur 9
  { root: 38, notes: [65, 69, 72, 76] },    // Ré mineur 9
  { root: 43, notes: [59, 62, 65, 69] },    // Sol 9
  { root: 36, notes: [64, 67, 71, 74] },    // Do majeur 9
  { root: 41, notes: [60, 64, 69, 72] },    // Fa majeur 7
  { root: 47, notes: [57, 62, 65, 69] },    // Si mineur 7 ♭5
  { root: 40, notes: [56, 59, 62, 65] },    // Mi 7 ♭9
  { root: 45, notes: [60, 64, 67, 71] }     // La mineur 9
];
const AFTER_SAX = [
  [[0, 76, 9], [10, 74, 4], [16, 72, 8], [26, 69, 6]],
  [[0, 77, 8], [10, 76, 4], [16, 72, 10], [28, 69, 4]],
  [[0, 74, 10], [12, 71, 4], [16, 69, 8], [26, 67, 6]],
  [[0, 79, 8], [10, 76, 6], [18, 74, 6], [26, 71, 6]],
  [[0, 72, 8], [10, 69, 6], [16, 72, 10], [28, 76, 4]],
  [[0, 69, 8], [10, 71, 6], [16, 74, 8], [26, 72, 6]],
  [[0, 71, 8], [10, 68, 4], [16, 71, 6], [24, 74, 8]],
  [[0, 76, 12], [14, 72, 6], [20, 69, 12]]
];

function afterlife(k, index, time, S) {
  const { bar, inBar } = bounds(index, 16);
  const ci = Math.floor(bar / 2);
  const chord = AFTER_CHORDS[ci];
  const section = Math.floor(bar / 4);
  const swing = S * 0.55;                                                // les contretemps arrivent un peu en retard

  if (bar % 2 === 0 && inBar === 0) {
    for (const n of chord.notes) k.pad(k.midi(n - 12), time, S * 32, 0.014, 1.2, 1100);
  }

  // piano électrique : l'accord sur le premier temps, puis une reprise syncopée
  if (inBar === 0 || (inBar === 10 && section >= 1) || (inBar === 6 && section === 3)) {
    chord.notes.forEach((n, i) => k.epiano(k.midi(n), time + i * 0.012, S * (inBar === 0 ? 9 : 5), 0.045, k.leadBus));
  }

  // basse qui marche : fondamentale, quinte, note de passage, retour
  const walk = [0, 7, 10, 5];
  if (inBar % 4 === 0) k.note(k.midi(chord.root + walk[inBar / 4]), time, S * 3.4, "sine", 0.2, k.master, 0.012);
  if (inBar % 4 === 0 && section >= 1) k.note(k.midi(chord.root + 12 + walk[inBar / 4]), time, S * 1.5, "triangle", 0.03, k.master, 0.01);

  // balais : temps réguliers, contretemps swingués ; une rimshot discrète sur 2 et 4
  if (section >= 1) {
    if (inBar % 4 === 0) k.hat(time, 0.035, 6200, 0.05);
    if (inBar % 4 === 2) k.hat(time + swing, 0.025, 6200, 0.04);
    if (inBar === 4 || inBar === 12) k.hat(time, 0.07, 1500, 0.06, "bandpass");
    if (inBar === 0 || inBar === 10) k.kick(time, 0.32);
  } else if (inBar % 8 === 0) {
    k.hat(time, 0.03, 6200, 0.05);
  }

  // saxophone : phrases languissantes, dans la réverbération
  if (section === 2 || section === 3) {
    const local = (bar % 2) * STEPS + inBar;
    for (const [at, n, len] of AFTER_SAX[ci]) {
      if (at === local) k.lead(k.midi(n - (section === 3 ? 12 : 0)), time, S * len, section === 3 ? 0.075 : 0.095);
    }
  }
}

/* =====================================================================================================
   BRAINDANCE — 100 BPM, si mineur. Arpèges qui flottent dans un grand écho, nappe, rythme feutré, souvenirs qui bégaient.
   Calibrage (1-4) · lecture (5-8) · immersion (9-12) · saut de mémoire (13-16)
===================================================================================================== */
const BD_CHORDS = [
  { root: 35, notes: [59, 62, 66, 69, 73] },    // Si mineur 9
  { root: 31, notes: [55, 59, 62, 66, 69] },    // Sol majeur 9
  { root: 38, notes: [62, 66, 69, 73, 76] },    // Ré majeur 9
  { root: 33, notes: [57, 61, 64, 66, 71] }     // La 6/9
];
const BD_LEAD = [
  [[0, 81, 10], [12, 78, 6], [20, 83, 10]],
  [[0, 79, 10], [12, 76, 6], [20, 81, 10]],
  [[0, 78, 8], [10, 81, 6], [18, 85, 12]],
  [[0, 76, 8], [10, 78, 6], [18, 83, 12]]
];

function braindance(k, index, time, S) {
  const { bar, inBar } = bounds(index, 16);
  const ci = Math.floor(bar / 4);
  const chord = BD_CHORDS[ci];
  const section = ci;

  if (bar % 2 === 0 && inBar === 0) {
    chord.notes.slice(0, 3).forEach((n) => k.pad(k.midi(n), time, S * 32, 0.028, 1.6, 2400, k.leadBus));
  }

  // arpège : monte et descend à travers l'accord sur deux octaves, un peu plus dense à chaque section
  const dense = section === 0 ? inBar % 2 === 0 : true;
  if (dense) {
    const seq = [0, 1, 2, 3, 4, 3, 2, 1];
    const step = seq[inBar % seq.length];
    const octave = (Math.floor(inBar / 8) % 2) * 12 + 12;
    k.pluck(k.midi(chord.notes[step] + octave), time, S * 3.2, section === 0 ? 0.03 : 0.036, k.leadBus);
  }

  if (section >= 1) {
    if (inBar === 0 || inBar === 8) k.kick(time, 0.5);
    if (inBar === 0) k.note(k.midi(chord.root), time, S * 12, "sine", 0.18, k.master, 0.03);
    if (inBar === 4 || inBar === 12) k.hat(time, 0.08, 2600, 0.06, "bandpass");
    if (inBar % 2 === 1 && Math.random() < 0.7) k.hat(time, 0.022, 7500, 0.03);                 // charleston qui saute parfois : la mémoire glitche
  }

  if (section === 2) {
    const local = (bar % 2) * STEPS + inBar;
    for (const [at, n, len] of BD_LEAD[bar % 4]) {
      if (at === local) { k.lead(k.midi(n), time, S * len, 0.08); k.bright(k.midi(n - 12), time, S * len, 0.012); }
    }
  }

  // saut de mémoire : des morceaux de phrase répétés de plus en plus vite, puis une montée
  if (section === 3 && (bar === 13 || bar === 15) && inBar >= 8) {
    const hold = inBar >= 12 ? 1 : 2;
    if (inBar % hold === 0) k.note(k.midi(chord.notes[(inBar >> 1) % 5] + 24), time, S * 0.7, "square", 0.04, k.leadBus, 0.003);
  }
  if (section === 3 && bar === 15 && inBar === 0) k.riser(time, S * 16);
  if (bar === 0 && inBar === 0) k.impact(time);
}

/* =====================================================================================================
   DOGTOWN — 98 BPM, mi phrygien dominant (mi, fa, sol♯, la, si, do, ré). Basse sale, claps, cordes pincées, poussière.
   Le péage (1-4) · la rue (5-8) · le marché (9-12) · les ruines (13-14) · retour au poste (15-16)
===================================================================================================== */
const DOG_RIFF = [[0, 40], [3, 40], [6, 41], [8, 40], [10, 44], [12, 41], [14, 40]];          // [pas, note MIDI]
const DOG_SCALE = [64, 65, 68, 69, 71, 72, 74, 76];
const DOG_PLUCK = [[0, 0], [2, 2], [3, 3], [6, 4], [8, 2], [10, 5], [12, 4], [14, 3]];         // [pas, degré de la gamme]
const DOG_LEAD = [[[0, 76, 10], [12, 75, 4], [16, 72, 8], [26, 71, 6]], [[0, 77, 8], [10, 76, 6], [16, 72, 10], [28, 71, 4]]];

function dogtown(k, index, time, S) {
  const { bar, inBar } = bounds(index, 16);
  const section = bar < 4 ? 0 : bar < 8 ? 1 : bar < 12 ? 2 : bar < 14 ? 3 : 4;
  const ruins = section === 3;

  if (bar % 2 === 0 && inBar === 0) {                                          // drone de chaleur, grave et sale
    k.drone(k.midi(52), time, S * 32, section === 0 ? 0.055 : 0.07);
  }
  if (inBar % 2 === 1 && Math.random() < 0.09) k.hat(time, 0.03, 2400, 0.03);   // poussière : grains au hasard

  // basse : un riff qui rampe sur la fondamentale, avec un do♯ et un fa qui grincent
  if (section !== 0 && !ruins) {
    for (const [at, n] of DOG_RIFF) {
      if (at === inBar) k.bassLP(k.midi(n + (section === 2 && bar % 4 === 3 && at >= 10 ? 5 : 0)), time, S * 2.2, 0.17, 520);
    }
  }
  if (section === 0 && inBar === 0) k.bassLP(k.midi(40), time, S * 8, 0.12, 420);

  // rythme : grosse caisse sèche, claps sur 2 et 4, shaker qui traîne
  if (section >= 1 && !ruins) {
    if (inBar === 0 || inBar === 7 || inBar === 10) k.kick(time, inBar === 0 ? 0.85 : 0.5);
    if (inBar === 4 || inBar === 12) k.snare(time, 0.17);
    if (inBar % 2 === 1) k.hat(time + (inBar % 4 === 3 ? S * 0.25 : 0), 0.035, 7000, 0.04);
    if (inBar === 14) k.hat(time, 0.09, 3800, 0.12, "bandpass");                                // marteau sur l'enclume
  }
  if (ruins) {
    if (inBar === 0 || inBar === 8) k.hat(time, 0.12, 3800, 0.2, "bandpass");
    if (inBar === 0) k.kick(time, 0.6);
  }

  // cordes pincées, façon guitare du désert, dans l'écho
  if (section >= 1 && !ruins) {
    for (const [at, degree] of DOG_PLUCK) {
      if (at === inBar && (section === 2 || at % 4 !== 3)) k.pluck(k.midi(DOG_SCALE[degree] - 12), time, S * 3.5, 0.06, k.leadBus);
    }
  }

  // le lead : une plainte lente au marché
  if (section === 2) {
    const local = (bar % 2) * STEPS + inBar;
    for (const [at, n, len] of DOG_LEAD[Math.floor(bar / 2) % 2]) if (at === local) k.lead(k.midi(n), time, S * len, 0.085);
  }

  // montée avant le retour au poste, coup d'enclume et début de boucle
  if (bar === 13 && inBar === 0) k.riser(time, S * 32);
  if (bar === 15 && inBar === 12) k.hat(time, 0.14, 3200, 0.2, "bandpass");
  if (bar === 14 && inBar === 0) k.impact(time);
}

/* ===================================================================================================== */

/* =====================================================================================================
   CHATQUIPUE — 140 BPM, la mineur. Chiptune sautillant (carrés, triangle, bruit) avec des miaulements, un trombone
   triste et, une seule fois par boucle, un petit « pouet » grave. C'est une private joke : le morceau est rigolo.
   Intro (1-4) · le chat arrive (5-12) · le chat insiste (13-20) · l'odeur monte (21-24)
===================================================================================================== */
const CAT_ROOTS = [45, 41, 48, 43];                                    // La, Fa, Do, Sol — une fondamentale toutes les 2 mesures
const CAT_ARP = [[69, 72, 76, 81], [65, 69, 72, 77], [72, 76, 79, 84], [67, 71, 74, 79]];
const CAT_LEAD = [
  [[0, 81, 3], [4, 79, 3], [8, 76, 3], [12, 79, 3], [16, 81, 3], [20, 84, 3], [24, 81, 6]],
  [[0, 77, 3], [4, 81, 3], [8, 84, 3], [12, 81, 3], [16, 77, 3], [20, 79, 3], [24, 77, 6]],
  [[0, 84, 3], [4, 79, 3], [8, 76, 3], [12, 79, 3], [16, 84, 3], [20, 88, 3], [24, 84, 6]],
  [[0, 83, 3], [4, 79, 3], [8, 74, 3], [12, 79, 3], [16, 83, 3], [20, 86, 3], [24, 83, 6]]
];
const CAT_SAD = [[392, 370], [370, 349], [349, 330], [330, 196]];       // le trombone triste : quatre notes qui tombent

function chatquipue(k, index, time, S) {
  const { bar, inBar } = bounds(index, 24);
  const pair = Math.floor(bar / 2) % 4;
  const section = bar < 4 ? 0 : bar < 12 ? 1 : bar < 20 ? 2 : 3;
  const root = CAT_ROOTS[pair];
  const drums = section === 1 || section === 2;

  // basse triangle qui saute
  if ([0, 3, 6, 8, 11, 14].includes(inBar)) {
    k.note(k.midi(root + (inBar === 6 || inBar === 14 ? 12 : 0)), time, S * 1.9, "triangle", 0.2, k.master, 0.006);
  }

  // arpège en carrés, une note par double-croche (un temps sur deux à l'intro)
  if (section !== 3 && (section > 0 || inBar % 2 === 0)) {
    k.note(k.midi(CAT_ARP[pair][inBar % 4]), time, S * 0.85, "square", section === 0 ? 0.016 : 0.022, k.master, 0.004);
  }

  // rythme : grosse caisse sur 1 et 3, caisse claire sur 2 et 4, charleston en bruit
  if (drums) {
    if (inBar === 0 || inBar === 8) k.kick(time, 0.7);
    if (inBar === 4 || inBar === 12) k.snare(time, 0.12);
    if (inBar % 2 === 0) k.hat(time, 0.03, 8000, 0.03);
  } else if (section === 0 && inBar % 4 === 2) {
    k.hat(time, 0.025, 8000, 0.03);
  }

  // mélodie en carré : une octave plus haut, avec un écho, quand le chat insiste
  if (drums) {
    const local = (bar % 2) * STEPS + inBar;
    for (const [at, n, len] of CAT_LEAD[pair]) {
      if (at === local) k.note(k.midi(n + (section === 2 ? 0 : -12)), time, S * len, "square", section === 2 ? 0.05 : 0.04, section === 2 ? k.leadBus : k.master, 0.004);
    }
  }

  // miaulements : un petit glissando qui monte puis retombe (fin des phrases de la première partie, puis sur la deuxième)
  if ((bar === 7 && inBar === 12) || (bar === 11 && inBar === 8)) k.glide("triangle", 520, 900, 620, time, S * 5, 0.07, k.leadBus, 2600);
  if (bar === 15 && inBar === 10) k.glide("triangle", 640, 1050, 700, time, S * 5, 0.07, k.leadBus, 2800);
  if (bar === 19 && inBar === 12) { k.glide("triangle", 420, 760, 480, time, S * 6, 0.07, k.leadBus, 2400); }

  // l'odeur monte : le trombone triste tombe, le chat miaule encore, puis un petit « pouet » grave
  if (section === 3) {
    if (inBar === 0) k.drone(k.midi(CAT_ROOTS[0] + 12), time, S * 16, 0.04);
    if (bar >= 20 && inBar === 0) {
      const [from, to] = CAT_SAD[bar - 20];
      k.glide("sawtooth", from, from * 0.96, to, time, S * (bar === 23 ? 14 : 12), 0.05, k.master, bar === 23 ? 900 : 1500);
    }
    if (bar === 22 && inBar === 8) k.glide("triangle", 560, 980, 640, time, S * 5, 0.07, k.leadBus, 2600);
    if (bar === 23 && inBar === 14) k.glide("sawtooth", 120, 90, 55, time, S * 2, 0.12, k.master, 500);      // le « pouet »
    if (inBar === 8) k.hat(time, 0.02, 8000, 0.03);
  }
}

/* ===================================================================================================== */

export const THEME_TRACKS = {
  arasaka:    { bpm: 84,  bars: 16, fx: { trim: 0.55, feedback: 0.45, wet: 0.4,  reverb: 0.5 },  play: arasaka },
  militech:   { bpm: 104, bars: 16, fx: { trim: 0.6,  feedback: 0.25, wet: 0.2,  reverb: 0.2 },  play: militech },
  afterlife:  { bpm: 92,  bars: 16, fx: { trim: 0.8,  feedback: 0.35, wet: 0.3,  reverb: 0.45 }, play: afterlife },
  braindance: { bpm: 100, bars: 16, fx: { trim: 0.6,  feedback: 0.5,  wet: 0.5,  reverb: 0.55 }, play: braindance },
  dogtown:    { bpm: 98,  bars: 16, fx: { trim: 0.6,  feedback: 0.4,  wet: 0.35, reverb: 0.3 },  play: dogtown },
  chatquipue: { bpm: 140, bars: 24, fx: { trim: 1.0,  feedback: 0.3,  wet: 0.25, reverb: 0.15 }, play: chatquipue }
};
