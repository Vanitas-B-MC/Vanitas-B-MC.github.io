// js/slots.js — logique pure de la Machine à sous. Aucun accès au DOM.
//
// 5 rouleaux × 3 rangées, SANS lignes de paiement : système « rouleaux adjacents ».
// Un symbole gagne dès qu'il est visible sur au moins 3 rouleaux CÔTE À CÔTE, dans n'importe quelle rangée,
// et n'importe où sur la machine (rouleaux 1-2-3, 2-3-4 ou 3-4-5, ou plus long).
// Si un symbole apparaît plusieurs fois sur un même rouleau de la série, chaque exemplaire forme une combinaison
// de plus : le gain est multiplié par le nombre de combinaisons (ex. 2 cœurs sur le rouleau 2 → ×2).
// ✪ Wild : remplace tous les symboles sauf le Scatter (rouleaux 2, 3 et 4 seulement).
// ✸ Scatter : 3 ou plus n'importe où paient la mise totale × un multiplicateur ET lancent des tours gratuits
//   (gains doublés, et les tours gratuits peuvent se relancer).
// Retour théorique au joueur : environ 95 % (tours gratuits compris, vérifié par simulation).

import { MAX_CREDITS } from "./limits.js";

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;
export const MIN_BET = 100;                    // le plus petit gain (×0,05) vaut alors 5 crédits
export const MIN_RUN = 3;                      // nombre minimal de rouleaux côte à côte pour gagner
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

// Gain d'une combinaison, en multiples de la MISE TOTALE : { symbole: [3 rouleaux, 4 rouleaux, 5 rouleaux] }.
export const PAYTABLE = {
  club:    [0.05, 0.15, 0.4],
  diamond: [0.05, 0.15, 0.4],
  heart:   [0.1, 0.25, 0.5],
  spade:   [0.1, 0.25, 0.5],
  chip:    [0.3, 0.9, 2.5],
  star:    [0.75, 2.5, 8],
  seven:   [2, 10, 50]
};
// Scatter : multiples de la MISE TOTALE pour 3, 4, 5 symboles, et tours gratuits offerts.
export const SCATTER_PAYS = { 3: 2, 4: 10, 5: 50 };
export const FREE_SPINS = { 3: 8, 4: 12, 5: 20 };

/* ---------- Rouleaux ---------- */

// Composition d'un rouleau (32 positions). Le wild n'existe que sur les rouleaux 2, 3 et 4 (2 par rouleau).
const OUTER = { club: 6, diamond: 7, heart: 6, spade: 6, chip: 3, star: 2, seven: 1, scatter: 1 };
const INNER = { club: 6, diamond: 7, heart: 5, spade: 5, chip: 3, star: 2, seven: 1, wild: 2, scatter: 1 };

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

// Cherche, pour un symbole, la plus longue série de rouleaux côte à côte qui le montrent (wild compris).
// Sur 5 rouleaux, il ne peut y avoir qu'une seule série de 3 ou plus par symbole.
// Renvoie { symbol, start, count, ways, mult, cells } ou null.
export function evaluateSymbol(grid, symbol) {
  const hits = [];                                           // par rouleau : rangées qui montrent le symbole ou un wild
  const real = [];                                           // par rouleau : le vrai symbole est-il présent ?
  for (let reel = 0; reel < REEL_COUNT; reel++) {
    const rows = [];
    let own = false;
    for (let row = 0; row < ROW_COUNT; row++) {
      const s = grid[row][reel];
      if (s === symbol) { rows.push(row); own = true; } else if (s === WILD) rows.push(row);
    }
    hits.push(rows);
    real.push(own);
  }

  let best = null;
  let reel = 0;
  while (reel < REEL_COUNT) {
    if (!hits[reel].length) { reel++; continue; }
    const start = reel;
    while (reel < REEL_COUNT && hits[reel].length) reel++;
    const count = reel - start;
    const hasReal = real.slice(start, reel).some(Boolean);   // une série faite uniquement de wilds ne compte pas
    if (count >= MIN_RUN && hasReal && (!best || count > best.count)) best = { start, count };
  }
  if (!best) return null;

  const run = hits.slice(best.start, best.start + best.count);
  const ways = run.reduce((product, rows) => product * rows.length, 1);
  const cells = run.flatMap((rows, i) => rows.map((row) => `${row},${best.start + i}`));
  return { symbol, start: best.start, count: best.count, ways, mult: PAYTABLE[symbol][best.count - MIN_RUN] * ways, cells };
}

// Évalue toute la grille.
// Renvoie { wins: [{ symbol, start, count, ways, mult, cells }], lineMult, scatters, scatterMult, freeSpins, cells }
//   lineMult : somme des gains des symboles (en multiples de la mise totale)
//   cells    : cases gagnantes, sous forme "rangée,rouleau" (pour les mettre en évidence)
export function evaluate(grid) {
  const wins = [];
  const cells = new Set();
  for (const symbol of Object.keys(PAYTABLE)) {
    const hit = evaluateSymbol(grid, symbol);
    if (!hit) continue;
    hit.cells.forEach((c) => cells.add(c));
    wins.push(hit);
  }
  wins.sort((x, y) => y.mult - x.mult);

  let scatters = 0;
  const scatterCells = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      if (grid[row][reel] === SCATTER) { scatters++; scatterCells.push(`${row},${reel}`); }
    }
  }
  const hasScatterWin = scatters >= 3;
  if (hasScatterWin) scatterCells.forEach((c) => cells.add(c));

  return {
    wins,
    lineMult: wins.reduce((sum, w) => sum + w.mult, 0),
    scatters,
    scatterMult: hasScatterWin ? SCATTER_PAYS[Math.min(scatters, 5)] : 0,
    freeSpins: hasScatterWin ? FREE_SPINS[Math.min(scatters, 5)] : 0,
    cells: [...cells]
  };
}

// Gain d'une combinaison pour une mise donnée (pour l'affichage du détail).
export const comboWin = (bet, win, free = false) => Math.floor(bet * win.mult * (free ? FREE_MULT : 1) + 1e-9);

// Gain total (mise non comprise dans le calcul : c'est ce qui est rendu au joueur).
export function winAmount(bet, result, free = false) {
  const units = bet * result.lineMult + bet * result.scatterMult;
  return Math.min(Math.floor(units * (free ? FREE_MULT : 1) + 1e-9), MAX_CREDITS);
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
