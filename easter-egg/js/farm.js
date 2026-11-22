// js/farm.js — logique pure de « Pêche & Ferme » (jeu idle). Aucun accès au DOM.
//
// Ferme : on plante, ça pousse en temps réel (même quand la page est fermée), on récolte contre des crédits.
// Pêche : on lance la ligne, on attend que ça morde, on ferre au bon moment.
// Améliorations : engrais, fermier-bot (récolte et replante tout seul), canne, appât, filet (revenu passif).
// Les durées utilisent l'heure du navigateur (Date.now) pour que la progression continue hors ligne.

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
// Renvoie le gain net en crédits (vente moins graines) et le nombre de récoltes. Modifie `farm`.
export function runBot(farm, now = Date.now()) {
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
    net += done * (crop.sell - crop.cost);
    harvests += done;
  }
  farm.harvests += harvests;
  return { net, harvests };
}

// Filet automatique : crédits gagnés depuis le dernier calcul. Modifie `farm.seen` (garde le temps non converti).
export function settleNet(farm, now = Date.now()) {
  const rate = netRate(farm.net);
  const elapsed = Math.min(Math.max(now - farm.seen, 0), OFFLINE_CAP);
  if (!rate) { farm.seen = now; return 0; }
  const whole = Math.floor((rate * elapsed) / 1000);
  if (whole > 0) farm.seen = elapsed >= OFFLINE_CAP ? now : farm.seen + (whole / rate) * 1000;
  return whole;
}

/* ---------- Pêche ---------- */

// weight : fréquence de base. L'appât multiplie le poids des poissons rares (indice plus grand = plus rare).
export const FISH = [
  { id: "sardine",  name: "Sardine pixel",    value: 3,     weight: 40 },
  { id: "carpe",    name: "Carpe bitmap",     value: 6,     weight: 28 },
  { id: "truite",   name: "Truite binaire",   value: 14,    weight: 18 },
  { id: "brochet",  name: "Brochet fantôme",  value: 35,    weight: 9 },
  { id: "anguille", name: "Anguille néon",    value: 100,   weight: 3 },
  { id: "thon",     name: "Thon cyber",       value: 350,   weight: 1 },
  { id: "requin",   name: "Requin zéro-jour", value: 1400,  weight: 0.3 },
  { id: "koi",      name: "Koï doré",         value: 7000,  weight: 0.05 }
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
