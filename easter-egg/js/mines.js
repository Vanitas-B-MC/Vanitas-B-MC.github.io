// js/mines.js — logique pure du Démineur. Aucun accès au DOM.
//
// La grille est un tableau à plat : la case (ligne, colonne) est à l'indice ligne * colonnes + colonne.
// Les mines sont placées au premier clic, jamais sur la case cliquée ni autour : le premier clic ouvre toujours une zone.

export const LEVELS = {
  easy:   { label: "Facile",    rows: 9,  cols: 9,  mines: 10, credits: 25,  blue: 0 },
  medium: { label: "Moyen",     rows: 16, cols: 16, mines: 40, credits: 120, blue: 0 },
  hard:   { label: "Difficile", rows: 16, cols: 30, mines: 99, credits: 600, blue: 1 }
};
export const LEVEL_IDS = Object.keys(LEVELS);

export function newGame(level) {
  const def = LEVELS[level] ?? LEVELS.easy;
  const size = def.rows * def.cols;
  return {
    level: LEVELS[level] ? level : "easy",
    rows: def.rows,
    cols: def.cols,
    mines: def.mines,
    size,
    status: "ready",                         // ready (rien d'ouvert) → playing → won | lost
    isMine: new Uint8Array(size),
    adjacent: new Uint8Array(size),          // nombre de mines voisines
    open: new Uint8Array(size),
    flag: new Uint8Array(size),
    opened: 0,
    flags: 0,
    exploded: -1                             // case où l'on a perdu
  };
}

// Indices des cases voisines (jusqu'à 8).
export function neighbors(game, index) {
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < game.rows && c >= 0 && c < game.cols) out.push(r * game.cols + c);
    }
  }
  return out;
}

// Place les mines au hasard, en gardant libre la case `safe` et ses voisines.
function placeMines(game, safe, rng) {
  const banned = new Set([safe, ...neighbors(game, safe)]);
  const free = [];
  for (let i = 0; i < game.size; i++) if (!banned.has(i)) free.push(i);
  for (let k = 0; k < game.mines; k++) {                       // mélange partiel de Fisher-Yates
    const j = k + Math.floor(rng() * (free.length - k));
    [free[k], free[j]] = [free[j], free[k]];
    game.isMine[free[k]] = 1;
  }
  for (let i = 0; i < game.size; i++) {
    if (game.isMine[i]) continue;
    game.adjacent[i] = neighbors(game, i).reduce((sum, n) => sum + game.isMine[n], 0);
  }
}

export const isOver = (game) => game.status === "won" || game.status === "lost";
export const minesLeft = (game) => game.mines - game.flags;

// Ouvre une case (et en cascade les zones vides). Renvoie la liste des cases nouvellement ouvertes.
export function reveal(game, index, rng = Math.random) {
  if (isOver(game) || game.open[index] || game.flag[index]) return [];
  if (game.status === "ready") {
    placeMines(game, index, rng);
    game.status = "playing";
  }
  if (game.isMine[index]) return lose(game, index);

  const opened = [];
  const stack = [index];
  while (stack.length) {
    const i = stack.pop();
    if (game.open[i] || game.flag[i]) continue;
    game.open[i] = 1;
    game.opened++;
    opened.push(i);
    if (game.adjacent[i] === 0) for (const n of neighbors(game, i)) if (!game.open[n]) stack.push(n);
  }
  checkWin(game);
  return opened;
}

// Pose ou retire un drapeau (impossible sur une case ouverte). Renvoie true si quelque chose a changé.
export function toggleFlag(game, index) {
  if (isOver(game) || game.open[index]) return false;
  game.flag[index] = game.flag[index] ? 0 : 1;
  game.flags += game.flag[index] ? 1 : -1;
  return true;
}

// Accord : sur un chiffre dont le nombre de drapeaux voisins est exact, ouvre les autres voisins.
// Un mauvais drapeau fait exploser une mine, comme dans le jeu classique.
export function chord(game, index, rng = Math.random) {
  if (isOver(game) || !game.open[index] || game.adjacent[index] === 0) return [];
  const around = neighbors(game, index);
  if (around.filter((n) => game.flag[n]).length !== game.adjacent[index]) return [];
  const opened = [];
  for (const n of around) {
    if (game.open[n] || game.flag[n] || isOver(game)) continue;
    opened.push(...reveal(game, n, rng));
  }
  return opened;
}

function lose(game, index) {
  game.status = "lost";
  game.exploded = index;
  return [index];
}

function checkWin(game) {
  if (game.opened !== game.size - game.mines) return;
  game.status = "won";
  for (let i = 0; i < game.size; i++) {                         // toutes les mines sont marquées
    if (game.isMine[i] && !game.flag[i]) { game.flag[i] = 1; game.flags++; }
  }
}

// Ce qu'il faut afficher pour une case : "closed" | "flag" | "mine" | "boom" | "wrong" | "open" (avec adjacent).
export function cellView(game, index) {
  const over = game.status === "lost";
  if (game.open[index]) return "open";
  if (over && game.isMine[index] && !game.flag[index]) return index === game.exploded ? "boom" : "mine";
  if (over && game.flag[index] && !game.isMine[index]) return "wrong";
  return game.flag[index] ? "flag" : "closed";
}
