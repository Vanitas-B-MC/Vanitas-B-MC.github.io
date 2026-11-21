// js/clicker.js — logique pure du Clicker « Mineur de données ». Aucun accès au DOM.
//
// Deux sortes d'améliorations :
//   - en CRÉDITS  (UPGRADES)      : ajoutent des crédits par clic ou par seconde ;
//   - en PIÈCES BLEUES (BLUE_UPGRADES) : paliers incrémentiels qui multiplient les gains,
//     ou font baisser les prix. Les pièces bleues viennent du Snake et du Tetris.

// kind "click" : crédits par clic. kind "auto" : crédits par seconde.
export const UPGRADES = [
  { id: "click",   kind: "click", name: "Implant neuronal",        desc: "+1 crédit par clic",         base: 25,      growth: 1.18, value: 1 },
  { id: "click2",  kind: "click", name: "Gants haptiques",         desc: "+6 crédits par clic",        base: 450,     growth: 1.19, value: 6 },
  { id: "click3",  kind: "click", name: "Interface neuro-directe", desc: "+45 crédits par clic",       base: 8000,    growth: 1.20, value: 45 },
  { id: "script",  kind: "auto",  name: "Script automatique",      desc: "+1 crédit / seconde",        base: 60,      growth: 1.15, value: 1 },
  { id: "botnet",  kind: "auto",  name: "Réseau de bots",          desc: "+8 crédits / seconde",       base: 650,     growth: 1.15, value: 8 },
  { id: "farm",    kind: "auto",  name: "Ferme de serveurs",       desc: "+50 crédits / seconde",      base: 6000,    growth: 1.15, value: 50 },
  { id: "dc",      kind: "auto",  name: "Centre de données",       desc: "+320 crédits / seconde",     base: 70000,   growth: 1.15, value: 320 },
  { id: "quantum", kind: "auto",  name: "Ordinateur quantique",    desc: "+2 200 crédits / seconde",   base: 800000,  growth: 1.15, value: 2200 },
  { id: "ai",      kind: "auto",  name: "IA autonome",             desc: "+16 000 crédits / seconde",  base: 9500000, growth: 1.16, value: 16000 }
];

// effect : "click" (gains par clic), "auto" (gains par seconde), "all" (les deux), "discount" (prix des améliorations).
export const BLUE_UPGRADES = [
  { id: "gold_click",  effect: "click",    name: "Souris dorée",       desc: "+30 % de crédits par clic",           per: 0.30, base: 1, growth: 1.55, max: 30 },
  { id: "overclock",   effect: "auto",     name: "Cœur surcadencé",    desc: "+20 % de crédits par seconde",        per: 0.20, base: 2, growth: 1.60, max: 30 },
  { id: "supplier",    effect: "discount", name: "Remise fournisseur", desc: "−4 % sur le prix des améliorations",  per: 0.04, base: 3, growth: 1.70, max: 10 },
  { id: "convergence", effect: "all",      name: "Convergence",        desc: "+10 % à tous les gains",              per: 0.10, base: 5, growth: 1.80, max: 20 }
];

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);
export const blueUpgradeById = (id) => BLUE_UPGRADES.find((u) => u.id === id);

const level = (levels, id) => Math.max(0, Math.floor(levels?.[id] || 0));

/* ---------- Prix ---------- */

// Remise fournisseur : 1 = plein tarif, 0,6 = 40 % de réduction (maximum).
export function discountFactor(blueLevels = {}) {
  const u = blueUpgradeById("supplier");
  return 1 - u.per * Math.min(level(blueLevels, u.id), u.max);
}

// Prix de la prochaine amélioration en crédits, quand on en possède déjà `owned`.
export function costOf(upgrade, owned, blueLevels = {}) {
  return Math.max(1, Math.ceil(upgrade.base * upgrade.growth ** owned * discountFactor(blueLevels)));
}

// Prix en pièces bleues du prochain palier, ou null quand le palier maximum est atteint.
export function blueCostOf(upgrade, owned) {
  if (owned >= upgrade.max) return null;
  return Math.ceil(upgrade.base * upgrade.growth ** owned);
}

/* ---------- Gains ---------- */

function multiplier(blueLevels, effect) {
  let mult = 1;
  for (const u of BLUE_UPGRADES) {
    if (u.effect === effect || u.effect === "all") mult *= 1 + u.per * Math.min(level(blueLevels, u.id), u.max);
  }
  return mult;
}

export const clickMultiplier = (blueLevels = {}) => multiplier(blueLevels, "click");
export const autoMultiplier = (blueLevels = {}) => multiplier(blueLevels, "auto");

// Crédits par clic (un nombre à virgule : voir clickGain).
export function clickPower(levels, blueLevels = {}) {
  let power = 1;
  for (const u of UPGRADES) if (u.kind === "click") power += u.value * level(levels, u.id);
  return power * clickMultiplier(blueLevels);
}

// Crédits par seconde, sans rien faire.
export function perSecond(levels, blueLevels = {}) {
  let rate = 0;
  for (const u of UPGRADES) if (u.kind === "auto") rate += u.value * level(levels, u.id);
  return rate * autoMultiplier(blueLevels);
}

// Un crédit est entier : on garde la partie décimale (`carry`) pour le prochain passage.
function whole(exact) {
  const w = Math.floor(exact + 1e-9);
  return { whole: w, carry: Math.max(0, exact - w) };
}

export function clickGain(levels, blueLevels = {}, carry = 0) {
  return whole(clickPower(levels, blueLevels) + carry);
}

// Gain passif pendant `ms` millisecondes.
export function idleGain(levels, ms, carry = 0, blueLevels = {}) {
  return whole((perSecond(levels, blueLevels) * ms) / 1000 + carry);
}

/* ---------- Achats ---------- */

// Achète une amélioration en crédits. Renvoie true si l'achat a eu lieu.
export function buy(wallet, id) {
  const upgrade = upgradeById(id);
  if (!upgrade) return false;
  const price = costOf(upgrade, wallet.data.levels[id] || 0, wallet.data.blueLevels);
  if (!wallet.spendCredits(price)) return false;
  wallet.levelUp(id);
  return true;
}

// Achète un palier en pièces bleues. Renvoie true si l'achat a eu lieu.
export function buyBlue(wallet, id) {
  const upgrade = blueUpgradeById(id);
  if (!upgrade) return false;
  const price = blueCostOf(upgrade, wallet.data.blueLevels[id] || 0);
  if (price === null || !wallet.spendBlue(price)) return false;
  wallet.blueLevelUp(id);
  return true;
}

/* ---------- Paquet de données (événement aléatoire) ---------- */

export const PACKET_MIN_DELAY = 40000;   // ms entre deux paquets
export const PACKET_MAX_DELAY = 90000;
export const PACKET_LIFETIME = 9000;     // ms pendant lesquelles on peut le cliquer

export const nextPacketDelay = (rng = Math.random) =>
  PACKET_MIN_DELAY + Math.floor(rng() * (PACKET_MAX_DELAY - PACKET_MIN_DELAY));

// Récompense : environ 45 secondes de gains passifs plus 25 clics, au moins 75 crédits.
export function packetReward(levels, blueLevels = {}) {
  return Math.max(75, Math.floor(perSecond(levels, blueLevels) * 45 + clickPower(levels, blueLevels) * 25));
}

/* ---------- Succès ---------- */

const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS = [
  { id: "first_click",  name: "Premier clic",          desc: "Mine ton premier crédit",                    reward: 10,      test: (s) => s.clicks >= 1 },
  { id: "clicks_100",   name: "Doigts de fée",         desc: "100 clics",                                  reward: 50,      test: (s) => s.clicks >= 100 },
  { id: "clicks_1000",  name: "Tendinite",             desc: "1 000 clics",                                reward: 500,     test: (s) => s.clicks >= 1000 },
  { id: "mined_1k",     name: "Petit mineur",          desc: "1 000 crédits minés",                        reward: 100,     test: (s) => s.mined >= 1000 },
  { id: "mined_100k",   name: "Gros mineur",           desc: "100 000 crédits minés",                      reward: 5000,    test: (s) => s.mined >= 100000 },
  { id: "mined_10m",    name: "Magnat des données",    desc: "10 millions de crédits minés",               reward: 250000,  test: (s) => s.mined >= 10000000 },
  { id: "scripts_10",   name: "Automatisation",        desc: "10 scripts automatiques",                    reward: 300,     test: (s) => (s.levels.script || 0) >= 10 },
  { id: "farm_5",       name: "Salle des machines",    desc: "5 fermes de serveurs",                       reward: 5000,    test: (s) => (s.levels.farm || 0) >= 5 },
  { id: "every_tier",   name: "Panoplie complète",     desc: "Au moins 1 de chaque amélioration",          reward: 50000,   test: (s) => UPGRADES.every((u) => (s.levels[u.id] || 0) >= 1) },
  { id: "blue_first",   name: "Premier bleu",          desc: "Première amélioration en pièces bleues",     reward: 100,     test: (s) => s.blueTotal >= 1 },
  { id: "blue_10",      name: "Collectionneur",        desc: "10 paliers en pièces bleues",                reward: 2000,    test: (s) => s.blueTotal >= 10 }
];

export function statsOf(data) {
  return {
    clicks: data.clicksTotal || 0,
    mined: data.minedTotal || 0,
    levels: data.levels || {},
    blueLevels: data.blueLevels || {},
    blueTotal: sum(data.blueLevels)
  };
}

// Débloque les succès atteints et verse leur récompense. Renvoie la liste des nouveaux succès.
export function checkAchievements(wallet) {
  const stats = statsOf(wallet.data);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (wallet.data.achievements.includes(a.id) || !a.test(stats)) continue;
    if (wallet.unlockAchievement(a.id)) {
      wallet.addCredits(a.reward);
      unlocked.push(a);
    }
  }
  return unlocked;
}
