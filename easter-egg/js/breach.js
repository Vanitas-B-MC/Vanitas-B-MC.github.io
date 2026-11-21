// js/breach.js — logique pure du « Breach Protocol » (aucun accès au DOM, testable sous Node).
//
// Règles (comme dans Cyberpunk 2077) : une matrice de codes hexadécimaux. On choisit des cases
// l'une après l'autre dans un tampon limité : la 1re dans la ligne du haut, la 2e dans la colonne
// de la 1re, la 3e dans la ligne de la 2e, etc. Une case ne sert qu'une fois. Chaque « daemon »
// (séquence de codes) est piraté s'il apparaît d'affilée dans le tampon.

export const CODES = ["1C", "55", "BD", "E9", "7A", "FF"];

// size : côté de la matrice ; buffer : cases du tampon ; seqLens : longueurs des daemons ; time : secondes
export const DIFFICULTIES = {
  1: { id: 1, name: "Facile",    size: 5, buffer: 6, seqLens: [2, 3],    time: 45, credits: 6,  coins: 0 },
  2: { id: 2, name: "Moyen",     size: 6, buffer: 7, seqLens: [2, 3, 3], time: 55, credits: 10, coins: 1 },
  3: { id: 3, name: "Difficile", size: 7, buffer: 8, seqLens: [3, 3, 4], time: 65, credits: 16, coins: 2 }
};

export const DAEMON_NAMES = ["DATAMINE_V1", "ICEPICK", "MASS_VULNERABILITY", "CAMERA_SHUTDOWN", "NEUTRALIZE_MALWARE"];

const ri = (rng, n) => Math.floor(rng() * n);

/* ---------- Génération (toujours résoluble) ---------- */

// Tire au hasard un chemin valide de la longueur du tampon, puis en tire les daemons :
// ainsi, au moins un enchaînement qui les réussit tous existe, quand ils se chevauchent.
export function generate(rng, difficulty) {
  const d = DIFFICULTIES[difficulty];
  const matrix = Array.from({ length: d.size }, () => Array.from({ length: d.size }, () => CODES[ri(rng, CODES.length)]));

  const path = [];
  let row = 0;
  let col = ri(rng, d.size);
  let horizontal = true;                   // 1re case : dans la ligne du haut
  for (let i = 0; i < d.buffer; i++) {
    const free = [];
    for (let k = 0; k < d.size; k++) {
      const r = horizontal ? row : k;
      const c = horizontal ? k : col;
      if (!path.some((p) => p.r === r && p.c === c)) free.push([r, c]);
    }
    if (free.length === 0) break;
    const [r, c] = free[ri(rng, free.length)];
    path.push({ r, c });
    row = r;
    col = c;
    horizontal = !horizontal;
  }
  const codes = path.map((p) => matrix[p.r][p.c]);

  // Daemons : des morceaux du chemin, décalés pour se chevaucher un peu.
  const sequences = [];
  let start = 0;
  d.seqLens.forEach((len, i) => {
    const from = Math.min(start, Math.max(0, codes.length - len));
    const slice = codes.slice(from, from + len);
    // Évite deux daemons identiques
    if (!sequences.some((s) => s.codes.join() === slice.join())) {
      sequences.push({ name: DAEMON_NAMES[i % DAEMON_NAMES.length], codes: slice, reward: len * d.credits });
    }
    start = from + len - 1;
  });
  return { difficulty, size: d.size, matrix, bufferSize: d.buffer, sequences, time: d.time, solution: path };
}

/* ---------- Partie ---------- */

export function createState(puzzle) {
  return {
    puzzle,
    path: [],                 // cases choisies, dans l'ordre
    timeLeft: puzzle.time,
    over: false,
    reason: null              // "done" | "buffer" | "time" | "stuck" | "quit"
  };
}

export const bufferCodes = (state) => state.path.map((p) => state.puzzle.matrix[p.r][p.c]);

// La ligne (ou colonne) dans laquelle il faut jouer maintenant : { type: "row"|"col", index }
export function activeLine(state) {
  const last = state.path[state.path.length - 1];
  if (!last) return { type: "row", index: 0 };
  return state.path.length % 2 === 1 ? { type: "col", index: last.c } : { type: "row", index: last.r };
}

export const isUsed = (state, r, c) => state.path.some((p) => p.r === r && p.c === c);

export function canPick(state, r, c) {
  if (state.over || state.path.length >= state.puzzle.bufferSize) return false;
  if (isUsed(state, r, c)) return false;
  const line = activeLine(state);
  return line.type === "row" ? r === line.index : c === line.index;
}

// État d'un daemon : "done" (piraté), "failed" (plus possible) ou "open".
export function sequenceStatus(state, seq) {
  const buf = bufferCodes(state);
  const len = seq.codes.length;
  const remaining = state.puzzle.bufferSize - buf.length;

  for (let i = 0; i + len <= buf.length; i++) {
    if (seq.codes.every((code, k) => buf[i + k] === code)) return "done";
  }
  // Début de daemon déjà posé à la fin du tampon, qu'il reste la place de terminer ?
  for (let i = Math.max(0, buf.length - len + 1); i <= buf.length; i++) {
    const have = buf.length - i;
    if (have >= len) continue;
    if (len - have > remaining) continue;
    if (seq.codes.slice(0, have).every((code, k) => buf[i + k] === code)) return "open";
  }
  return "failed";
}

export function progress(state) {
  return state.puzzle.sequences.map((seq) => ({ seq, status: sequenceStatus(state, seq) }));
}

function isStuck(state) {
  const { size } = state.puzzle;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (canPick(state, r, c)) return false;
  return true;
}

function checkEnd(state) {
  const statuses = progress(state).map((p) => p.status);
  if (statuses.every((s) => s === "done")) return end(state, "done");
  if (statuses.every((s) => s !== "open")) return end(state, state.path.length >= state.puzzle.bufferSize ? "buffer" : "stuck");
  if (state.path.length >= state.puzzle.bufferSize) return end(state, "buffer");
  if (isStuck(state)) return end(state, "stuck");
  return state;
}

function end(state, reason) {
  state.over = true;
  state.reason = reason;
  return state;
}

// Choisit une case. Renvoie false si le coup est interdit.
export function pick(state, r, c) {
  if (!canPick(state, r, c)) return false;
  state.path.push({ r, c });
  checkEnd(state);
  return true;
}

// Retire une seconde (renvoie true quand le temps est écoulé).
export function tick(state, dt) {
  if (state.over) return false;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft === 0) { end(state, "time"); return true; }
  return false;
}

export function giveUp(state) {
  if (!state.over) end(state, "quit");
}

/* ---------- Récompenses ---------- */

// Crédits : somme des daemons piratés. Pièces bleues : seulement si tous les daemons sont piratés.
export function rewards(state) {
  const done = progress(state).filter((p) => p.status === "done");
  const credits = done.reduce((sum, p) => sum + p.seq.reward, 0);
  const all = done.length === state.puzzle.sequences.length;
  const coins = all ? DIFFICULTIES[state.puzzle.difficulty].coins : 0;
  return { credits, coins, hacked: done.length, total: state.puzzle.sequences.length };
}
