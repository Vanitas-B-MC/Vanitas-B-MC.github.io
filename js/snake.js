// js/snake.js — logique pure du jeu « Data Snake » (aucun accès au DOM).
// Séparée de l'affichage (arcade.js) pour rester simple à lire et à tester.

export const GRID = 20;

// Pièce bleue : rare. Elle peut apparaître quand on mange un fragment,
// et disparaît d'elle-même après COIN_LIFETIME pas de jeu.
export const COIN_CHANCE = 0.15;
export const COIN_LIFETIME = 45;
export const COIN_SCORE = 20;

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

// Nouvelle partie : un serpent de 3 cases au centre, qui part vers la droite.
export function createState(rng = Math.random, size = GRID) {
  const mid = Math.floor(size / 2);
  const state = {
    size,
    snake: [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ],
    dir: DIRECTIONS.right,
    queue: [],        // directions demandées, appliquées une par pas de jeu
    food: null,
    coin: null,       // pièce bleue : { x, y, ttl } ou null
    coinsCollected: 0,
    coinPicked: false, // vrai uniquement pendant le pas où une pièce vient d'être ramassée
    score: 0,
    over: false,
    won: false
  };
  state.food = placeFood(state, rng);
  return state;
}

// Cases occupées : le serpent, plus la pièce bleue et le fragment s'il y en a.
function takenCells(state) {
  const taken = new Set(state.snake.map((c) => `${c.x},${c.y}`));
  if (state.coin) taken.add(`${state.coin.x},${state.coin.y}`);
  if (state.food) taken.add(`${state.food.x},${state.food.y}`);
  return taken;
}

function randomFreeCell(state, rng) {
  const taken = takenCells(state);
  const free = [];
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(rng() * free.length)] : null;
}

// Fait apparaître une pièce bleue sur une case libre (aucune s'il y en a déjà une).
export function placeCoin(state, rng = Math.random) {
  if (state.coin) return;
  const cell = randomFreeCell(state, rng);
  if (cell) state.coin = { ...cell, ttl: COIN_LIFETIME };
}

// Choisit au hasard une case libre (jamais sous le serpent ni sur la pièce).
export function placeFood(state, rng = Math.random) {
  const taken = new Set(state.snake.map((c) => `${c.x},${c.y}`));
  if (state.coin) taken.add(`${state.coin.x},${state.coin.y}`);
  const free = [];
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}

// Mémorise un changement de direction.
// Les demi-tours sont ignorés, et on garde au plus 2 ordres en attente :
// deux appuis rapides (ex. haut puis gauche) sont donc bien pris en compte.
export function queueDirection(state, dir) {
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (dir.x === last.x && dir.y === last.y) return;
  if (dir.x === -last.x && dir.y === -last.y) return;
  if (state.queue.length >= 2) return;
  state.queue.push(dir);
}

// Avance d'une case. Modifie et renvoie l'état.
export function step(state, rng = Math.random) {
  if (state.over) return state;

  state.coinPicked = false;
  if (state.queue.length) state.dir = state.queue.shift();

  const head = state.snake[0];
  const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  const eating = state.food !== null && next.x === state.food.x && next.y === state.food.y;

  // Si on ne mange pas, le bout de la queue se libère : on peut s'y déplacer.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const hitWall = next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size;
  const hitSelf = body.some((c) => c.x === next.x && c.y === next.y);

  if (hitWall || hitSelf) {
    state.over = true;
    return state;
  }

  state.snake.unshift(next);

  // Pièce bleue ramassée ?
  if (state.coin && next.x === state.coin.x && next.y === state.coin.y) {
    state.coin = null;
    state.coinsCollected += 1;
    state.coinPicked = true;
    state.score += COIN_SCORE;
  } else if (state.coin && --state.coin.ttl <= 0) {
    state.coin = null;           // la pièce a disparu
  }

  if (eating) {
    state.score += 10;
    state.food = placeFood(state, rng);
    if (state.food === null) {   // plateau rempli : victoire
      state.won = true;
      state.over = true;
    } else if (!state.coin && rng() < COIN_CHANCE) {
      placeCoin(state, rng);
    }
  } else {
    state.snake.pop();
  }

  return state;
}

// Délai entre deux pas (ms) : le jeu accélère à chaque fragment récupéré.
export function stepDelay(score) {
  return Math.max(70, 140 - (score / 10) * 4);
}
