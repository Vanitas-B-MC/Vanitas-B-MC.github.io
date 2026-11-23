// js/slots.js — logique pure de la Machine à sous. Aucun accès au DOM.
//
// 5 rouleaux × 3 lignes, 10 lignes de paiement fixes. La mise est TOTALE : chaque ligne reçoit un dixième.
// Une ligne paie quand 3 symboles identiques ou plus se suivent depuis le rouleau de gauche.
// ✪ Wild : remplace tous les symboles sauf le Scatter (rouleaux 2, 3 et 4 seulement).
// Retour théorique au joueur : environ 96 % (tours gratuits compris).
// ✸ Scatter : 3 ou plus n'importe où paient la mise totale × un multiplicateur ET lancent des tours gratuits
//   (gains doublés, et les tours gratuits peuvent se relancer).

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;
export const MIN_BET = 10;                     // 1 par ligne
export const LINE_COUNT = 10;
export const FREE_MULT = 2;                    // gains ×2 pendant les tours gratuits
export const MAX_FREE_SPINS = 100;             // réserve maximale de tours gratuits

export const SYMBOLS = {
  club:    { glyph: "♣", name: "Trèfle" },
  diamond: { glyph: "♦", name: "Carreau" },
  heart:   { glyph: "♥", name: "Cœur" },
  spade:   { glyph: "♠", name: "Pique" },
  chip:    { glyph: "◈", name: "Puce" },
  star:    { glyph: "✦", name: "Étoile" },
  seven:   { glyph: "7", name: "Sept" },
  wild:    { glyph: "✪", name: "Wild" },
  scatter: { glyph: "✸", name: "Scatter" }
};
export const WILD = "wild";
export const SCATTER = "scatter";

// Gain d'une ligne, en multiples de la mise de la ligne : { symbole: [×3, ×4, ×5] }.
export const PAYTABLE = {
  club:    [5, 15, 40],
  diamond: [5, 15, 40],
  heart:   [8, 20, 50],
  spade:   [8, 20, 50],
  chip:    [20, 55, 140],
  star:    [40, 130, 380],
  seven:   [100, 380, 2000]
};
// Scatter : multiples de la MISE TOTALE pour 3, 4, 5 symboles, et tours gratuits offerts.
export const SCATTER_PAYS = { 3: 2, 4: 10, 5: 50 };
export const FREE_SPINS = { 3: 8, 4: 12, 5: 20 };

// Les 10 lignes : pour chaque rouleau, la rangée (0 = haut, 1 = milieu, 2 = bas).
export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 2]
];

/* ---------- Rouleaux ---------- */

// Composition d'un rouleau (32 positions). Le wild n'existe que sur les rouleaux 2, 3 et 4.
const OUTER = { club: 6, diamond: 7, heart: 6, spade: 6, chip: 3, star: 2, seven: 1, scatter: 1 };
const INNER = { club: 6, diamond: 6, heart: 5, spade: 5, chip: 3, star: 2, seven: 1, wild: 3, scatter: 1 };

// Petit générateur pseudo-aléatoire à graine fixe : les rouleaux sont toujours rangés dans le même ordre.
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStrip(counts, seed) {
  const strip = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(id));
  const rng = seeded(seed);
  for (let i = strip.length - 1; i > 0; i--) {               // mélange de Fisher-Yates
    const j = Math.floor(rng() * (i + 1));
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
  return strip;
}

export const REELS = [
  buildStrip(OUTER, 11), buildStrip(INNER, 23), buildStrip(INNER, 37), buildStrip(INNER, 41), buildStrip(OUTER, 53)
];

// Les 3 symboles visibles d'un rouleau quand il s'arrête sur la position `stop` (haut, milieu, bas).
export function windowAt(reel, stop) {
  const strip = REELS[reel];
  const n = strip.length;
  return [strip[(stop - 1 + n) % n], strip[stop % n], strip[(stop + 1) % n]];
}

// grid[rangée][rouleau] à partir des positions d'arrêt.
export function gridFor(stops) {
  const columns = stops.map((stop, reel) => windowAt(reel, stop));
  return Array.from({ length: ROW_COUNT }, (_, row) => columns.map((col) => col[row]));
}

/* ---------- Gains ---------- */

// Évalue une ligne. Renvoie { symbol, count, mult } ou null.
export function evaluateLine(symbols) {
  let base = null;
  for (const s of symbols) {
    if (s === WILD) continue;
    base = s;
    break;
  }
  if (base === null || base === SCATTER) base = "seven";     // une série de wild seuls paie comme des sept
  let count = 0;
  for (const s of symbols) {
    if (s === base || s === WILD) count++;
    else break;
  }
  if (count < 3) return null;
  return { symbol: base, count, mult: PAYTABLE[base][count - 3] };
}

// Évalue toute la grille.
// Renvoie { lines: [{ line, symbol, count, mult, cells }], lineMult, scatters, scatterMult, freeSpins, cells }
//   lineMult : somme des multiplicateurs des lignes (en multiples de la mise de ligne)
//   cells    : cases gagnantes, sous forme "rangée,rouleau" (pour les mettre en évidence)
export function evaluate(grid) {
  const lines = [];
  const cells = new Set();
  PAYLINES.forEach((rows, index) => {
    const symbols = rows.map((row, reel) => grid[row][reel]);
    const hit = evaluateLine(symbols);
    if (!hit) return;
    const used = rows.slice(0, hit.count).map((row, reel) => `${row},${reel}`);
    used.forEach((c) => cells.add(c));
    lines.push({ line: index + 1, ...hit, cells: used });
  });

  let scatters = 0;
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      if (grid[row][reel] === SCATTER) { scatters++; cells.add(`${row},${reel}`); }
    }
  }
  const hasScatterWin = scatters >= 3;
  if (!hasScatterWin) for (let row = 0; row < ROW_COUNT; row++) for (let reel = 0; reel < REEL_COUNT; reel++) if (grid[row][reel] === SCATTER) cells.delete(`${row},${reel}`);

  return {
    lines,
    lineMult: lines.reduce((sum, l) => sum + l.mult, 0),
    scatters,
    scatterMult: hasScatterWin ? SCATTER_PAYS[Math.min(scatters, 5)] : 0,
    freeSpins: hasScatterWin ? FREE_SPINS[Math.min(scatters, 5)] : 0,
    cells: [...cells]
  };
}

// Gain total (mise non comprise dans le calcul : c'est ce qui est rendu au joueur).
export function winAmount(bet, result, free = false) {
  const units = (bet * result.lineMult) / LINE_COUNT + bet * result.scatterMult;
  return Math.min(Math.floor(units * (free ? FREE_MULT : 1) + 1e-9), Number.MAX_SAFE_INTEGER);
}

// Un tour : tire les positions d'arrêt et évalue la grille.
export function spin(bet, rng = Math.random, free = false) {
  const stops = REELS.map((strip) => Math.floor(rng() * strip.length));
  const grid = gridFor(stops);
  const result = evaluate(grid);
  return { stops, grid, ...result, win: winAmount(bet, result, free), free };
}

// Ajoute des tours gratuits à la réserve (plafonnée).
export const addFreeSpins = (current, awarded) => Math.min(MAX_FREE_SPINS, current + awarded);

// Symbole aléatoire pour l'animation des rouleaux (aucun effet sur le résultat).
export const randomSymbol = (reel, rng = Math.random) => REELS[reel][Math.floor(rng() * REELS[reel].length)];
