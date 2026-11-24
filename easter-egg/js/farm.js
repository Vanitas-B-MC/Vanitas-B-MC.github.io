// js/farm.js — logique pure de « Pêche & Ferme » (jeu idle). Aucun accès au DOM.
//
// Ferme : on plante, ça pousse en temps réel (même quand la page est fermée), on récolte contre des crédits.
// Pêche : on lance la ligne, on attend que ça morde, on ferre au bon moment.
// Améliorations : engrais, fermier-bot (récolte et replante tout seul), canne, appât, filet (revenu passif).
// Les durées utilisent l'heure du navigateur (Date.now) pour que la progression continue hors ligne.

import { wealthBonus, farmPct, NET_PCT_PER_SEC } from "./rewards.js";

export const OFFLINE_CAP = 8 * 3600_000;       // au plus 8 h de gains passifs d'un coup
export const START_PLOTS = 3;
export const MAX_PLOTS = 12;

const MIN = 60_000;
export const CROPS = [
  { id: "radis",      name: "Radis binaire",       cost: 10,     ms: 15_000,       sell: 20 },
  { id: "carotte",    name: "Carotte quantique",   cost: 60,     ms: MIN,          sell: 130 },
  { id: "mais",       name: "Maïs cyber",          cost: 300,    ms: 4 * MIN,      sell: 700 },
  { id: "citrouille", name: "Citrouille néon",     cost: 1500,   ms: 15 * MIN,     sell: 3700 },
  { id: "melon",      name: "Melon doré",          cost: 8000,   ms: 60 * MIN,     sell: 21000 },
  { id: "orchidee",   name: "Orchidée de données", cost: 50000,  ms: 240 * MIN,    sell: 140000 }
];
export const CROP_IDS = CROPS.map((c) => c.id);
export const cropById = (id) => CROPS.find((c) => c.id === id) ?? null;

// Améliorations : niveau maximal et prix du niveau suivant.
export const UPGRADES = {
  fert: { label: "Engrais",          max: 10, cost: (l) => Math.round(200 * 2.4 ** l), desc: "Les cultures poussent 8 % plus vite par niveau." },
  bot:  { label: "Fermier-bot",      max: 1,  cost: () => 6000,                        desc: "Récolte et replante tout seul les parcelles prêtes (même hors ligne, 8 h max)." },
  rod:  { label: "Canne à pêche",    max: 10, cost: (l) => Math.round(100 * 2.3 ** l), desc: "Les poissons mordent plus vite et tu as plus de temps pour ferrer." },
  bait: { label: "Appât",            max: 10, cost: (l) => Math.round(150 * 2.3 ** l), desc: "Plus de chances d'attraper des poissons rares." },
  net:  { label: "Filet automatique", max: 20, cost: (l) => Math.round(300 * 1.9 ** l), desc: "Rapporte des crédits en continu, même hors ligne (8 h max)." }
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

// Prix du niveau suivant, ou null si le maximum est atteint.
export function upgradeCost(id, level) {
  const up = UPGRADES[id];
  return up && level < up.max ? up.cost(level) : null;
}

// Prix de la parcelle suivante quand on en possède déjà `count`, ou null au maximum.
export const plotCost = (count) => (count >= MAX_PLOTS ? null : Math.round(150 * 2.2 ** (count - START_PLOTS)));

export const growMs = (crop, fert) => Math.round(crop.ms * 0.92 ** fert);
export const netRate = (level) => (level > 0 ? Math.round(0.4 * level ** 1.5 * 10) / 10 : 0);   // crédits par seconde

/* ---------- Sauvegarde ---------- */

export function freshFarm(now = Date.now()) {
  return {
    plots: Array.from({ length: MAX_PLOTS }, () => null),   // null ou { crop, at }
    plotCount: START_PLOTS,
    fert: 0, bot: 0, rod: 0, bait: 0, net: 0,
    caught: 0,                                              // poissons attrapés
    bestFish: 0,                                            // valeur de la meilleure prise
    harvests: 0,
    fish: Object.fromEntries(FISH.map((f) => [f.id, 0])),   // carnet de pêche
    seen: now                                               // dernier calcul du filet automatique
  };
}

const count = (v, max = Number.MAX_SAFE_INTEGER) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

// Reprend une sauvegarde en vérifiant chaque champ (le contenu du navigateur n'est pas fiable).
export function sanitizeFarm(raw, now = Date.now()) {
  const farm = freshFarm(now);
  if (!raw || typeof raw !== "object") return farm;

  farm.plotCount = Math.min(Math.max(count(raw.plotCount), START_PLOTS), MAX_PLOTS);
  for (const id of UPGRADE_IDS) farm[id] = count(raw[id], UPGRADES[id].max);
  farm.caught = count(raw.caught);
  farm.bestFish = count(raw.bestFish);
  farm.harvests = count(raw.harvests);
  for (const f of FISH) farm.fish[f.id] = count(raw.fish?.[f.id]);

  if (Array.isArray(raw.plots)) {
    for (let i = 0; i < farm.plotCount; i++) {
      const p = raw.plots[i];
      if (!p || !CROP_IDS.includes(p.crop)) continue;
      const at = Number(p.at);
      farm.plots[i] = { crop: p.crop, at: Number.isFinite(at) ? Math.min(at, now) : now };
    }
  }
  const seen = Number(raw.seen);
  farm.seen = Number.isFinite(seen) ? Math.min(Math.max(seen, 0), now) : now;
  return farm;
}

/* ---------- Ferme ---------- */

// État d'une parcelle : vide, en train de pousser (progress de 0 à 1) ou prête.
export function plotInfo(farm, index, now = Date.now()) {
  const plot = farm.plots[index];
  if (!plot) return { state: "empty" };
  const crop = cropById(plot.crop);
  const total = growMs(crop, farm.fert);
  const elapsed = Math.max(0, now - plot.at);
  if (elapsed >= total) return { state: "ready", crop, progress: 1, remaining: 0 };
  return { state: "growing", crop, progress: elapsed / total, remaining: total - elapsed };
}

// Fermier-bot : récolte et replante les parcelles prêtes, autant de cycles que le temps écoulé le permet.
// Renvoie le gain net en crédits (vente moins graines, plus le bonus de fortune de chaque récolte) et le nombre de récoltes.
// `balance` : solde du joueur, pour le bonus proportionnel. Modifie `farm`.
export function runBot(farm, now = Date.now(), balance = 0) {
  if (!farm.bot) return { net: 0, harvests: 0 };
  let net = 0;
  let harvests = 0;
  for (let i = 0; i < farm.plotCount; i++) {
    const plot = farm.plots[i];
    if (!plot) continue;
    const crop = cropById(plot.crop);
    const grow = growMs(crop, farm.fert);
    const elapsed = now - plot.at;
    const cycles = Math.floor(elapsed / grow);
    if (cycles < 1) continue;
    const done = Math.min(cycles, Math.max(1, Math.floor(OFFLINE_CAP / grow)));
    plot.at = done < cycles ? now - (elapsed % grow) : plot.at + done * grow;
    net += done * (crop.sell - crop.cost + wealthBonus(balance, farmPct(crop.ms)));
    harvests += done;
  }
  farm.harvests += harvests;
  return { net, harvests };
}

// Filet automatique : crédits gagnés depuis le dernier calcul. Modifie `farm.seen` (garde le temps non converti).
// `balance` : solde du joueur, pour la part proportionnelle du revenu.
export function settleNet(farm, now = Date.now(), balance = 0) {
  const rate = netRate(farm.net) + (farm.net > 0 ? Math.max(0, balance) * NET_PCT_PER_SEC * farm.net : 0);
  const elapsed = Math.min(Math.max(now - farm.seen, 0), OFFLINE_CAP);
  if (!rate) { farm.seen = now; return 0; }
  const whole = Math.floor((rate * elapsed) / 1000);
  if (whole > 0) farm.seen = elapsed >= OFFLINE_CAP ? now : farm.seen + (whole / rate) * 1000;
  return whole;
}

/* ---------- Pêche ---------- */

// weight : fréquence de base. L'appât multiplie le poids des poissons rares (indice plus grand = plus rare).
// diff : difficulté du combat (0 = très facile, 1 = très dur). color : couleur du poisson dans le mini-jeu.
export const FISH = [
  { id: "sardine",  name: "Sardine pixel",    value: 3,     weight: 40,   diff: 0.08, color: "#9aa9bd" },
  { id: "carpe",    name: "Carpe bitmap",     value: 6,     weight: 28,   diff: 0.20, color: "#d9a441" },
  { id: "truite",   name: "Truite binaire",   value: 14,    weight: 18,   diff: 0.32, color: "#4db6ac" },
  { id: "brochet",  name: "Brochet fantôme",  value: 35,    weight: 9,    diff: 0.46, color: "#7bd36b" },
  { id: "anguille", name: "Anguille néon",    value: 100,   weight: 3,    diff: 0.60, color: "#00f0ff" },
  { id: "thon",     name: "Thon cyber",       value: 350,   weight: 1,    diff: 0.74, color: "#4d7cff" },
  { id: "requin",   name: "Requin zéro-jour", value: 1400,  weight: 0.3,  diff: 0.88, color: "#b266ff" },
  { id: "koi",      name: "Koï doré",         value: 7000,  weight: 0.05, diff: 1,    color: "#ffb000", blue: 1 }   // blue : pièces bleues offertes
];

export function pickFish(rng = Math.random, bait = 0) {
  const weights = FISH.map((f, i) => f.weight * (1 + bait * 0.5 * i));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH.length; i++) {
    roll -= weights[i];
    if (roll < 0) return FISH[i];
  }
  return FISH[0];
}

// Une prise : poisson, taille (0,7 à 1,4) et valeur en crédits.
export function rollCatch(rng = Math.random, bait = 0) {
  const fish = pickFish(rng, bait);
  const size = 0.7 + rng() * 0.7;
  return { fish, size, value: Math.max(1, Math.round(fish.value * size)) };
}

export const biteDelay = (rod, rng = Math.random) => Math.round((1800 + rng() * 3200) * 0.95 ** rod);   // ms avant la touche
export const biteWindow = (rod) => 900 + rod * 120;                                                       // ms pour ferrer

/* ---------- Mini-jeu de combat (façon « Fisch ») ---------- */
// Une piste de 0 à 1. Le poisson file de-ci de-là ; le joueur déplace une zone : en maintenant la touche, elle accélère
// vers la droite, en relâchant, vers la gauche. La jauge monte quand le poisson est dans la zone et baisse sinon.
// Elle atteint 100 % : prise. Elle tombe à 0 : le poisson s'échappe.

export const REEL_START = 0.3;
const REEL_ACC = 2.6;       // accélération de la zone
const REEL_DAMP = 2.2;      // frottement

// Paramètres du combat selon le poisson et le niveau de canne. `assist` (mouvement réduit) rend le combat plus doux.
export function reelParams(fish, rod = 0, assist = false) {
  const d = fish.diff;
  return {
    bar: Math.max(0.12, 0.30 - 0.13 * d + 0.014 * rod),             // largeur de la zone
    fishSpeed: (0.30 + 1.0 * d) * (assist ? 0.6 : 1),                // vitesse du poisson
    darts: [0.30 + 0.5 * (1 - d), 0.8 + 0.8 * (1 - d)],              // durée entre deux changements de cap (s)
    gain: 0.30 + 0.02 * rod + (assist ? 0.15 : 0),                   // jauge gagnée par seconde dans la zone
    drain: 0.14 + 0.12 * d - (assist ? 0.05 : 0)                     // jauge perdue par seconde hors de la zone
  };
}

export function newReel(params, rng = Math.random) {
  return { bar: 0.5, vel: 0, fish: 0.5, target: 0.5, wait: params.darts[0] + rng() * (params.darts[1] - params.darts[0]),
           progress: REEL_START, inside: true, time: 0, status: "playing" };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Avance le combat de `dt` secondes. Modifie et renvoie `state` (status : "playing", "won" ou "lost").
export function reelStep(state, dt, holding, params, rng = Math.random) {
  if (state.status !== "playing") return state;
  dt = Math.min(dt, 0.05);                                           // un onglet en veille ne doit pas fausser le combat

  state.vel += (holding ? REEL_ACC : -REEL_ACC) * dt;
  state.vel *= Math.max(0, 1 - REEL_DAMP * dt);
  state.bar += state.vel * dt;
  const half = params.bar / 2;
  if (state.bar < half) { state.bar = half; state.vel = Math.abs(state.vel) * 0.3; }
  if (state.bar > 1 - half) { state.bar = 1 - half; state.vel = -Math.abs(state.vel) * 0.3; }

  state.wait -= dt;
  if (state.wait <= 0) {
    state.target = 0.04 + rng() * 0.92;
    state.wait = params.darts[0] + rng() * (params.darts[1] - params.darts[0]);
  }
  const step = params.fishSpeed * dt;
  state.fish += clamp(state.target - state.fish, -step, step);

  state.inside = Math.abs(state.fish - state.bar) <= half;
  state.progress = clamp(state.progress + (state.inside ? params.gain : -params.drain) * dt, 0, 1);
  state.time += dt;
  if (state.progress >= 1) state.status = "won";
  else if (state.progress <= 0) state.status = "lost";
  return state;
}

// Puissance du lancer (0 à 1) quand on maintient depuis `ms` millisecondes : monte puis redescend (période 1,4 s).
export const castPower = (ms) => (1 - Math.cos((Math.max(0, ms) / 1400) * 2 * Math.PI)) / 2;
export const PERFECT_CAST = 0.9;
// Effets du lancer : un bon lancer fait mordre plus vite et attire de plus gros poissons.
export const castLuck = (power) => (power >= PERFECT_CAST ? 3 : power >= 0.6 ? 1 : 0);   // niveaux d'appât en plus
export const castWait = (power) => 1.25 - 0.5 * power;                                    // multiplicateur du délai de touche
