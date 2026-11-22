// js/race.js — logique pure des Courses d'IA (paris). Aucun accès au DOM.
//
// 6 robots courent 100 mètres. Chacun a 4 caractéristiques (vitesse, endurance, régularité, sprint) tirées à chaque course.
// Les cotes viennent de milliers de courses simulées avec exactement le même moteur que la vraie course :
// elles reflètent donc les vraies chances de chaque robot, moins 10 % de commission pour la maison.

export const LANES = 6;
export const TRACK = 100;                 // longueur de la piste
export const DT = 0.1;                    // pas de simulation, en secondes
export const MIN_BET = 10;
export const TAKEOUT = 0.9;               // part des mises rendue en moyenne aux joueurs
export const MAX_BETS = 6;

const BASE_SPEED = 6.7;                   // unités par seconde → environ 15 s de course
const MAX_STEPS = 600;
const SPEED_SPREAD = 0.05;                // écart de vitesse entre robots (± autour de 1)
const NOISE_GAIN = 3;                     // force des aléas de rythme

export const NAMES = ["NEON-7", "GLITCH", "VOLT", "CIPHER", "RONIN", "ZERO-X", "PIXEL", "DRIFT", "KIRA-9", "ECHO"];
export const KINDS = {
  win: { label: "Victoire", pays: (rank) => rank === 0 },
  podium: { label: "Podium", pays: (rank) => rank <= 2 }
};

// Tire 6 robots différents avec leurs caractéristiques (de 0 à 1, sauf la vitesse).
export function makeRoster(rng = Math.random) {
  const pool = [...NAMES];
  const roster = [];
  for (let i = 0; i < LANES; i++) {
    const name = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    roster.push({
      name,
      speed: 1 - SPEED_SPREAD + rng() * SPEED_SPREAD * 2,   // × la vitesse de base
      stamina: rng(),                     // endurance : résiste à la fatigue en fin de course
      steady: rng(),                      // régularité : peu de variations de rythme
      burst: rng()                        // sprint : accélération sur le dernier quart
    });
  }
  return roster;
}

// Simule une course. `record` garde les positions à chaque pas (pour l'animation).
// Renvoie { finish: temps d'arrivée de chaque robot, order: indices du 1er au dernier, frames }.
export function simulate(roster, rng = Math.random, record = true) {
  const n = roster.length;
  const pos = new Array(n).fill(0);
  const noise = new Array(n).fill(0);
  const finish = new Array(n).fill(null);
  const frames = record ? [pos.slice()] : null;
  let left = n;

  for (let step = 1; step <= MAX_STEPS && left > 0; step++) {
    for (let i = 0; i < n; i++) {
      if (finish[i] !== null) continue;
      const r = roster[i];
      const p = pos[i] / TRACK;
      let v = BASE_SPEED * r.speed;
      if (p > 0.55) v *= 1 - (1 - r.stamina) * 0.2 * Math.min(1, (p - 0.55) / 0.45);   // fatigue
      if (p > 0.75) v *= 1 + r.burst * 0.12;                                          // sprint final
      noise[i] = noise[i] * 0.8 + (rng() + rng() + rng() - 1.5) * 0.2;                 // rythme qui varie par séries
      v *= Math.max(0.25, 1 + noise[i] * (1.2 - r.steady) * NOISE_GAIN);
      const before = pos[i];
      pos[i] = before + v * DT;
      if (pos[i] >= TRACK) {
        finish[i] = (step - 1) * DT + (DT * (TRACK - before)) / (pos[i] - before);   // instant exact de l'arrivée
        pos[i] = TRACK;
        left--;
      }
    }
    if (record) frames.push(pos.slice());
  }
  // Sécurité : un robot qui n'aurait pas fini (ne devrait jamais arriver) est classé dernier.
  for (let i = 0; i < n; i++) if (finish[i] === null) finish[i] = MAX_STEPS * DT + i;
  const order = [...finish.keys()].sort((a, b) => finish[a] - finish[b]);
  return { finish, order, frames };
}

const roundOdds = (x) => Math.round(x * 10) / 10;

// Cotes de chaque robot : { win, podium, pWin, pPodium }, estimées sur `runs` courses simulées.
export function oddsFor(roster, rng = Math.random, runs = 3000) {
  const wins = new Array(roster.length).fill(0);
  const podiums = new Array(roster.length).fill(0);
  for (let k = 0; k < runs; k++) {
    const { order } = simulate(roster, rng, false);
    wins[order[0]]++;
    for (let r = 0; r < 3; r++) podiums[order[r]]++;
  }
  return roster.map((_, i) => {
    const pWin = Math.max(wins[i], 1) / runs;
    const pPodium = Math.max(podiums[i], 1) / runs;
    return {
      pWin, pPodium,
      win: Math.min(80, Math.max(1.1, roundOdds(TAKEOUT / pWin))),
      podium: Math.min(20, Math.max(1, roundOdds(TAKEOUT / pPodium)))
    };
  });
}

// Gain rendu pour une mise (mise comprise).
export const payout = (amount, odds) => Math.min(Math.floor(amount * odds), Number.MAX_SAFE_INTEGER);

// Résout tous les paris : bets = [{ racer, kind, amount, odds }]. `order` : indices du 1er au dernier.
export function resolve(bets, order) {
  let returned = 0;
  let staked = 0;
  const lines = bets.map((bet) => {
    staked += bet.amount;
    const rank = order.indexOf(bet.racer);
    const win = KINDS[bet.kind].pays(rank);
    const back = win ? payout(bet.amount, bet.odds) : 0;
    returned += back;
    return { ...bet, rank, win, back };
  });
  return { lines, staked, returned, net: returned - staked };
}

// Note moyenne d'un robot (0 à 1), pour afficher une « forme » lisible.
export const rating = (r) => ((r.speed - (1 - SPEED_SPREAD)) / (SPEED_SPREAD * 2)) * 0.5 + r.stamina * 0.2 + r.steady * 0.15 + r.burst * 0.15;
