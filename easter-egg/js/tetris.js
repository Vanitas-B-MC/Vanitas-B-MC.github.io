// js/tetris.js — logique pure du Tetris (aucun accès au DOM, donc simple à tester).
// Séparée de l'affichage (ui-tetris.js).
//
// Grille de 10 colonnes sur 20 lignes. Une pièce bleue est gagnée toutes les 6 lignes complétées.

export const COLS = 10;
export const ROWS = 20;
export const LINES_PER_COIN = 6;
export const LINES_PER_LEVEL = 10;
export const NEXT_COUNT = 3;
export const TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

// Points pour 0, 1, 2, 3 et 4 lignes d'un coup (multipliés par le niveau + 1).
export const LINE_SCORES = [0, 100, 300, 500, 800];

const BASE = {
  I: ["....", "IIII", "....", "...."],
  O: ["OO", "OO"],
  T: [".T.", "TTT", "..."],
  S: [".SS", "SS.", "..."],
  Z: ["ZZ.", ".ZZ", "..."],
  J: ["J..", "JJJ", "..."],
  L: ["..L", "LLL", "..."]
};

const rotateMatrix = (m) => m.map((_, r) => m.map((__, c) => m[m.length - 1 - c][r]));

// ROTATIONS[type][rotation] = liste des cases [x, y] de la pièce (dans sa petite grille).
const ROTATIONS = {};
for (const type of TYPES) {
  let matrix = BASE[type].map((row) => [...row].map((ch) => (ch === "." ? 0 : 1)));
  ROTATIONS[type] = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    matrix.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    ROTATIONS[type].push(cells);
    matrix = rotateMatrix(matrix);
  }
}

// Décalages essayés quand une rotation est bloquée contre un mur ou une pile (« wall kicks » simplifiés).
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

/* ---------- Pièces et grille ---------- */

export const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// Cases occupées par une pièce, en coordonnées de la grille.
export function cellsOf(piece) {
  return ROTATIONS[piece.type][piece.rot].map(([x, y]) => [piece.x + x, piece.y + y]);
}

// Une case au-dessus de la grille (y < 0) ne gêne jamais : les pièces y apparaissent.
export function collides(grid, piece) {
  return cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x] !== 0));
}

function spawnPiece(type) {
  const size = BASE[type].length;
  return { type, rot: 0, x: Math.floor((COLS - size) / 2), y: type === "I" ? -1 : 0 };
}

// Sac de 7 : chaque pièce sort une fois avant que les autres ne reviennent.
function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takeFromBag(state) {
  if (state.bag.length === 0) state.bag = shuffle(TYPES, state.rng);
  return state.bag.pop();
}

/* ---------- Partie ---------- */

export function createState(rng = Math.random) {
  const state = {
    rng,
    grid: emptyGrid(),
    bag: [],
    queue: [],
    piece: null,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 0,
    coins: 0,        // pièces bleues gagnées pendant cette partie
    lineCarry: 0,    // lignes déjà faites vers la prochaine pièce bleue
    over: false
  };
  while (state.queue.length < NEXT_COUNT) state.queue.push(takeFromBag(state));
  nextPiece(state);
  return state;
}

// Sort la pièce suivante. Si elle n'a pas la place d'apparaître, la partie est finie.
function nextPiece(state) {
  state.queue.push(takeFromBag(state));
  state.piece = spawnPiece(state.queue.shift());
  state.canHold = true;
  if (collides(state.grid, state.piece)) state.over = true;
}

export function tryMove(state, dx, dy) {
  if (state.over) return false;
  const moved = { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy };
  if (collides(state.grid, moved)) return false;
  state.piece = moved;
  return true;
}

// dir : +1 sens horaire, -1 sens anti-horaire.
export function rotate(state, dir = 1) {
  if (state.over) return false;
  const rot = (state.piece.rot + dir + 4) % 4;
  for (const [kx, ky] of KICKS) {
    const moved = { ...state.piece, rot, x: state.piece.x + kx, y: state.piece.y + ky };
    if (!collides(state.grid, moved)) {
      state.piece = moved;
      return true;
    }
  }
  return false;
}

// La pièce repose-t-elle sur quelque chose ?
export const isGrounded = (state) =>
  state.over || collides(state.grid, { ...state.piece, y: state.piece.y + 1 });

// Descente d'une case commandée par le joueur : +1 point par case.
export function softDrop(state) {
  if (!tryMove(state, 0, 1)) return false;
  state.score += 1;
  return true;
}

// Où la pièce atterrirait si on la lâchait (pour afficher le fantôme).
export function ghostY(state) {
  let y = state.piece.y;
  while (!collides(state.grid, { ...state.piece, y: y + 1 })) y++;
  return y;
}

// Chute instantanée : +2 points par case, puis la pièce se fixe.
export function hardDrop(state) {
  if (state.over) return null;
  const dropped = ghostY(state) - state.piece.y;
  state.piece = { ...state.piece, y: state.piece.y + dropped };
  state.score += 2 * dropped;
  return lockPiece(state);
}

// Pas de gravité : descend d'une case, ou fixe la pièce si elle ne peut plus descendre.
export function gravity(state) {
  if (tryMove(state, 0, 1)) return null;
  return lockPiece(state);
}

// Fixe la pièce, efface les lignes pleines, compte les points et les pièces bleues.
// Renvoie { cleared, coins, over }.
export function lockPiece(state) {
  const cells = cellsOf(state.piece);

  // Fixée entièrement au-dessus de la grille : perdu.
  if (cells.some(([, y]) => y < 0)) {
    state.over = true;
    return { cleared: 0, coins: 0, over: true };
  }

  const colorId = TYPES.indexOf(state.piece.type) + 1;
  for (const [x, y] of cells) state.grid[y][x] = colorId;

  const kept = state.grid.filter((row) => row.some((v) => v === 0));
  const cleared = ROWS - kept.length;
  if (cleared > 0) {
    state.grid = [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...kept];
    state.score += LINE_SCORES[cleared] * (state.level + 1);
    state.lines += cleared;
    state.level = Math.floor(state.lines / LINES_PER_LEVEL);
  }

  state.lineCarry += cleared;
  const coins = Math.floor(state.lineCarry / LINES_PER_COIN);
  state.lineCarry %= LINES_PER_COIN;
  state.coins += coins;

  nextPiece(state);
  return { cleared, coins, over: state.over };
}

// Met la pièce de côté (une fois par pièce) ou l'échange avec celle déjà gardée.
export function holdPiece(state) {
  if (state.over || !state.canHold) return false;
  const current = state.piece.type;
  if (state.hold === null) {
    state.hold = current;
    state.queue.push(takeFromBag(state));
    state.piece = spawnPiece(state.queue.shift());
  } else {
    state.piece = spawnPiece(state.hold);
    state.hold = current;
  }
  state.canHold = false;
  if (collides(state.grid, state.piece)) state.over = true;
  return true;
}

// Délai entre deux descentes (ms) : plus le niveau monte, plus ça va vite.
export const dropInterval = (level) => Math.max(60, Math.round(800 * 0.82 ** level));
