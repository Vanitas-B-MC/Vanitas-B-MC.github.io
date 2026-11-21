// js/roulette.js — logique pure de la Roulette européenne (37 cases : 0 à 36).
// Les mises sont en pièces bleues. Aucun accès au DOM.

// Ordre réel des cases sur la roue, en tournant dans le sens des aiguilles d'une montre.
export const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function colorOf(n) {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

// Types de mise. `pays` = gain en plus de la mise (35 pour 1 sur un numéro plein, etc.).
export const BET_TYPES = {
  straight: { pays: 35, wins: (n, bet) => n === bet.n },
  red:      { pays: 1,  wins: (n) => colorOf(n) === "red" },
  black:    { pays: 1,  wins: (n) => colorOf(n) === "black" },
  even:     { pays: 1,  wins: (n) => n !== 0 && n % 2 === 0 },
  odd:      { pays: 1,  wins: (n) => n % 2 === 1 },
  low:      { pays: 1,  wins: (n) => n >= 1 && n <= 18 },
  high:     { pays: 1,  wins: (n) => n >= 19 && n <= 36 },
  dozen:    { pays: 2,  wins: (n, bet) => n >= (bet.d - 1) * 12 + 1 && n <= bet.d * 12 }
};

// Identifiant unique d'une mise, pour regrouper les jetons posés au même endroit.
export function betKey(bet) {
  if (bet.type === "straight") return `straight:${bet.n}`;
  if (bet.type === "dozen") return `dozen:${bet.d}`;
  return bet.type;
}

export function isWin(bet, number) {
  const def = BET_TYPES[bet.type];
  return Boolean(def) && def.wins(number, bet);
}

// Résout toutes les mises pour un numéro sorti.
// bets : [{ type, n?, d?, amount }]
// Renvoie le total rendu au joueur (mises gagnantes comprises) et le gain net.
export function resolve(bets, number) {
  let returned = 0;
  let staked = 0;
  const lines = bets.map((bet) => {
    staked += bet.amount;
    const win = isWin(bet, number);
    const back = win ? bet.amount * (BET_TYPES[bet.type].pays + 1) : 0;
    returned += back;
    return { ...bet, win, back };
  });
  return { number, lines, staked, returned, net: returned - staked };
}

export const pickNumber = (rng = Math.random) => Math.floor(rng() * 37);

// Angle (en radians, sens horaire depuis le haut) du centre de la case d'un numéro.
export function slotCenter(number) {
  const index = WHEEL.indexOf(number);
  const slice = (Math.PI * 2) / WHEEL.length;
  return index * slice + slice / 2;
}

// Rotation finale de la roue pour que `number` s'arrête sous le repère fixe en haut.
// `current` : rotation actuelle ; `turns` : tours complets à faire avant de s'arrêter.
export function spinTarget(current, number, turns = 5) {
  const full = Math.PI * 2;
  const wanted = (((-slotCenter(number)) % full) + full) % full;
  const now = ((current % full) + full) % full;
  const delta = (((wanted - now) % full) + full) % full;
  return current + turns * full + delta;
}

// Numéro qui se trouve sous le repère pour une rotation donnée (sert à vérifier spinTarget).
export function numberAt(rotation) {
  const full = Math.PI * 2;
  const slice = full / WHEEL.length;
  const under = ((((-rotation) % full) + full) % full);
  return WHEEL[Math.floor(under / slice) % WHEEL.length];
}
