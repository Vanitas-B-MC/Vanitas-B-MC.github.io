// js/clicker.js — logique pure du Clicker « Mineur de données ». Aucun accès au DOM.
import { wealthBonus, ACHIEVEMENT_PCT } from "./rewards.js";
import { MAX_CREDITS } from "./limits.js";
//
// Trois niveaux de progression :
//   - en CRÉDITS  (UPGRADES)      : ajoutent des crédits par clic ou par seconde ;
//   - en PIÈCES BLEUES (BLUE_UPGRADES) : paliers incrémentiels qui multiplient les gains,
//     ou font baisser les prix. Les pièces bleues viennent du Snake et du Tetris ;
//   - COMPÉTENCES (SKILLS) : arbre de la partie en cours, points gagnés en minant, remis à zéro au Rebirth ;
//   - REBIRTH : on « formate » pour gagner des éclats, qui achètent un arbre permanent (CORE).

// kind "click" : crédits par clic. kind "auto" : crédits par seconde.
export const UPGRADES = [
  { id: "click",   kind: "click", name: "Implant neuronal",        desc: "+1 crédit par clic",         base: 25,      growth: 1.18, value: 1 },
  { id: "click2",  kind: "click", name: "Gants haptiques",         desc: "+6 crédits par clic",        base: 450,     growth: 1.19, value: 6 },
  { id: "click3",  kind: "click", name: "Interface neuro-directe", desc: "+45 crédits par clic",       base: 8000,    growth: 1.20, value: 45 },
  { id: "click4",  kind: "click", name: "Symbiose neuronale",     desc: "+400 crédits par clic",      base: 150000,  growth: 1.21, value: 400 },

  // ----- Paliers « cosmiques » : très chers, pour les grosses fortunes -----
  { id: "click5",  kind: "click", name: "Poing de plasma",            desc: "+3 500 crédits par clic",   base: 2.5e6,  growth: 1.21, value: 3500 },
  { id: "click6",  kind: "click", name: "Frappe orbitale",            desc: "+40 000 crédits par clic",  base: 3e7,    growth: 1.21, value: 40000 },
  { id: "click7",  kind: "click", name: "Gantelet gravitationnel",    desc: "+500 000 crédits par clic", base: 4e8,    growth: 1.22, value: 500000 },
  { id: "click8",  kind: "click", name: "Main du temps",              desc: "+8 M crédits par clic",     base: 6e9,    growth: 1.22, value: 8e6 },
  { id: "click9",  kind: "click", name: "Toucher de Midas quantique", desc: "+150 M crédits par clic",   base: 1e11,   growth: 1.22, value: 1.5e8 },
  { id: "click10", kind: "click", name: "Doigt de l'infini",          desc: "+4 B crédits par clic",     base: 3e12,   growth: 1.23, value: 4e9 },
  { id: "click11", kind: "click", name: "Clic cosmique",              desc: "+120 B crédits par clic",   base: 1e14,   growth: 1.23, value: 1.2e11 },
  { id: "click12", kind: "click", name: "Impact stellaire",           desc: "+5 T crédits par clic",     base: 6e15,   growth: 1.23, value: 5e12 },
  { id: "click13", kind: "click", name: "Pression galactique",        desc: "+300 T crédits par clic",   base: 4e17,   growth: 1.24, value: 3e14 },
  { id: "click14", kind: "click", name: "Clic du Big Bang",           desc: "+20 Qa crédits par clic",   base: 5e19,   growth: 1.24, value: 2e16 },
  { id: "click15", kind: "click", name: "Singularité tactile",        desc: "+2 Qi crédits par clic",    base: 8e22,   growth: 1.25, value: 2e18 },
  { id: "click16", kind: "click", name: "Pouvoir du créateur",        desc: "+500 Qi crédits par clic",  base: 3e26,   growth: 1.25, value: 5e20 },
  { id: "script",  kind: "auto",  name: "Script automatique",      desc: "+1 crédit / seconde",        base: 60,      growth: 1.15, value: 1 },
  { id: "botnet",  kind: "auto",  name: "Réseau de bots",          desc: "+8 crédits / seconde",       base: 650,     growth: 1.15, value: 8 },
  { id: "farm",    kind: "auto",  name: "Ferme de serveurs",       desc: "+50 crédits / seconde",      base: 6000,    growth: 1.15, value: 50 },
  { id: "dc",      kind: "auto",  name: "Centre de données",       desc: "+320 crédits / seconde",     base: 70000,   growth: 1.15, value: 320 },
  { id: "quantum", kind: "auto",  name: "Ordinateur quantique",    desc: "+2 200 crédits / seconde",   base: 800000,  growth: 1.15, value: 2200 },
  { id: "ai",      kind: "auto",  name: "IA autonome",             desc: "+16 000 crédits / seconde",  base: 9500000, growth: 1.16, value: 16000 },
  { id: "sim",     kind: "auto",  name: "Simulation d'univers",    desc: "+120 000 crédits / seconde", base: 120000000,  growth: 1.16, value: 120000 },
  { id: "singu",   kind: "auto",  name: "Singularité",             desc: "+900 000 crédits / seconde", base: 1500000000, growth: 1.17, value: 900000 },

  // ----- Paliers « cosmiques » : très chers, pour les grosses fortunes -----
  { id: "dyson",      kind: "auto", name: "Sphère de Dyson",       desc: "+7 M crédits / seconde",    base: 3e10,   growth: 1.17, value: 7e6 },
  { id: "matriochka", kind: "auto", name: "Cerveau Matriochka",    desc: "+65 M crédits / seconde",   base: 4e11,   growth: 1.17, value: 6.5e7 },
  { id: "planck",     kind: "auto", name: "Horloge de Planck",     desc: "+600 M crédits / seconde",  base: 5e12,   growth: 1.18, value: 6e8 },
  { id: "blackhole",  kind: "auto", name: "Trou noir minier",      desc: "+6 B crédits / seconde",    base: 6e13,   growth: 1.18, value: 6e9 },
  { id: "harvester",  kind: "auto", name: "Moissonneuse stellaire", desc: "+70 B crédits / seconde",  base: 8e14,   growth: 1.18, value: 7e10 },
  { id: "pocketverse", kind: "auto", name: "Univers de poche",     desc: "+800 B crédits / seconde",  base: 1e16,   growth: 1.19, value: 8e11 },
  { id: "multiverse", kind: "auto", name: "Multivers",             desc: "+9 T crédits / seconde",    base: 1.4e17, growth: 1.19, value: 9e12 },
  { id: "cosmicmind", kind: "auto", name: "Conscience cosmique",   desc: "+100 T crédits / seconde",  base: 2e18,   growth: 1.19, value: 1e14 },
  { id: "entropy",    kind: "auto", name: "Entropie inversée",     desc: "+1,2 Qa crédits / seconde", base: 3e19,   growth: 1.20, value: 1.2e15 },
  { id: "equation",   kind: "auto", name: "Équation finale",       desc: "+15 Qa crédits / seconde",  base: 5e20,   growth: 1.20, value: 1.5e16 },
  { id: "omega",      kind: "auto", name: "Moteur Oméga",          desc: "+200 Qa crédits / seconde", base: 8e21,   growth: 1.21, value: 2e17 },
  { id: "lastbit",    kind: "auto", name: "Le Dernier Bit",        desc: "+3 Qi crédits / seconde",   base: 2e23,   growth: 1.22, value: 3e18 },
  { id: "godmode",    kind: "auto", name: "Mode dieu",             desc: "+50 Qi crédits / seconde",  base: 5e24,   growth: 1.23, value: 5e19 },
  { id: "paradox",    kind: "auto", name: "Paradoxe du créateur",  desc: "+1 Sx crédits / seconde",   base: 2e26,   growth: 1.25, value: 1e21 }
];

// Les 12 améliorations d'origine (le succès « Panoplie complète » ne demande que celles-là).
const CLASSIC_IDS = ["click", "click2", "click3", "click4", "script", "botnet", "farm", "dc", "quantum", "ai", "sim", "singu"];

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

/* ---------- Arbre de compétences (remis à zéro à chaque Rebirth) ---------- */

// branch : colonne d'affichage. cost : points par rang. req : rangs nécessaires dans d'autres compétences.
export const SKILLS = [
  { id: "c1", branch: "click", name: "Réflexes",             desc: "+10 % de crédits par clic",                     max: 5, cost: 1, req: [] },
  { id: "c2", branch: "click", name: "Frappe critique",      desc: "+3 % de chance de clic critique (×5)",          max: 5, cost: 2, req: [{ id: "c1", rank: 2 }] },
  { id: "c3", branch: "click", name: "Main de fer",          desc: "Le clic gagne +1 % de tes crédits / seconde",   max: 3, cost: 3, req: [{ id: "c2", rank: 1 }] },
  { id: "a1", branch: "auto",  name: "Optimisation",         desc: "+10 % de crédits par seconde",                  max: 5, cost: 1, req: [] },
  { id: "a2", branch: "auto",  name: "Parallélisme",         desc: "Scripts et bots +25 %",                         max: 3, cost: 2, req: [{ id: "a1", rank: 2 }] },
  { id: "a3", branch: "auto",  name: "Refroidissement",      desc: "Fermes et centres de données +25 %",            max: 3, cost: 3, req: [{ id: "a2", rank: 1 }] },
  { id: "e1", branch: "eco",   name: "Négociation",          desc: "−3 % sur le prix des améliorations",            max: 5, cost: 1, req: [] },
  { id: "e2", branch: "eco",   name: "Chasseur de paquets",  desc: "Paquets plus fréquents (−15 %) et +20 % de gain", max: 3, cost: 2, req: [{ id: "e1", rank: 1 }] },
  { id: "e3", branch: "eco",   name: "Filon bleu",           desc: "+3 % de chance qu'un paquet contienne une pièce bleue", max: 3, cost: 3, req: [{ id: "e2", rank: 2 }] },
  { id: "s1", branch: "eco",   name: "Convergence ouvrière", desc: "+25 % à tous les gains",                        max: 1, cost: 5, req: [{ id: "c1", rank: 3 }, { id: "a1", rank: 3 }, { id: "e1", rank: 3 }] }
];
export const SKILL_BRANCHES = [
  { id: "click", name: "Clic" },
  { id: "auto",  name: "Automatisation" },
  { id: "eco",   name: "Économie" }
];
export const skillById = (id) => SKILLS.find((x) => x.id === id);

// Un point de compétence à chaque seuil de crédits minés pendant la partie en cours.
export const SKILL_THRESHOLDS = Array.from({ length: 20 }, (_, n) => Math.round(500 * 2.2 ** n));

/* ---------- Arbre du Rebirth (permanent, acheté avec des éclats) ---------- */

export const REBIRTH_MIN = 50000;        // crédits minés dans la partie pour pouvoir formater
export const SHARD_BONUS = 0.02;         // +2 % à tous les gains par éclat gagné, à vie

export const CORE = [
  { id: "k1", name: "Noyau d'énergie",   desc: "+15 % à tous les gains",                            max: 20, base: 2,  growth: 1.45 },
  { id: "k2", name: "Tête de pont",      desc: "Chaque partie commence avec +3 scripts et +1 bot",  max: 10, base: 3,  growth: 1.6 },
  { id: "k3", name: "Éclat avide",       desc: "+10 % d'éclats à chaque formatage",                 max: 10, base: 5,  growth: 1.7 },
  { id: "k4", name: "Mémoire vive",      desc: "+1 point de compétence au départ",                  max: 8,  base: 8,  growth: 1.9 },
  { id: "k5", name: "Marché noir",       desc: "−2 % sur le prix des améliorations",                max: 10, base: 4,  growth: 1.6 },
  { id: "k6", name: "Clic automatique",  desc: "Un clic automatique par seconde",                   max: 5,  base: 10, growth: 2.2 },
  { id: "k7", name: "Indemnité",         desc: "Le formatage rend 2 % des crédits minés de la partie", max: 10, base: 6,  growth: 1.7 }
];
export const coreById = (id) => CORE.find((x) => x.id === id);

export const NO_BONUS = Object.freeze({ skills: {}, core: {}, shards: 0 });
export const bonusOf = (data) => ({ skills: data?.skills || {}, core: data?.core || {}, shards: data?.shardsTotal || 0 });

const rank = (table, id, max) => Math.min(level(table, id), max);
const skillRank = (bonus, id) => rank(bonus.skills, id, skillById(id).max);
const coreRank = (bonus, id) => rank(bonus.core, id, coreById(id).max);

export function coreCostOf(node, owned) {
  if (owned >= node.max) return null;
  return Math.ceil(node.base * node.growth ** owned);
}

/* ---------- Prix ---------- */

// 1 = plein tarif. Remises cumulées (fournisseur, négociation, marché noir), plafonnées à −70 %.
export function discountFactor(blueLevels = {}, bonus = NO_BONUS) {
  const sup = blueUpgradeById("supplier");
  const total =
    sup.per * Math.min(level(blueLevels, sup.id), sup.max) +
    0.03 * skillRank(bonus, "e1") +
    0.02 * coreRank(bonus, "k5");
  return 1 - Math.min(0.7, total);
}

// Prix de la prochaine amélioration en crédits, quand on en possède déjà `owned`.
export function costOf(upgrade, owned, blueLevels = {}, bonus = NO_BONUS) {
  return Math.min(MAX_CREDITS, Math.max(1, Math.ceil(upgrade.base * upgrade.growth ** owned * discountFactor(blueLevels, bonus))));
}

// Prix en pièces bleues du prochain palier, ou null quand le palier maximum est atteint.
export function blueCostOf(upgrade, owned) {
  if (owned >= upgrade.max) return null;
  return Math.ceil(upgrade.base * upgrade.growth ** owned);
}

/* ---------- Gains ---------- */

// Tous les multiplicateurs, pour « click », « auto » ou « all ».
function multiplier(blueLevels, effect, bonus) {
  let mult = 1;
  for (const u of BLUE_UPGRADES) {
    if (u.effect === effect || u.effect === "all") mult *= 1 + u.per * Math.min(level(blueLevels, u.id), u.max);
  }
  if (effect === "click") mult *= 1 + 0.10 * skillRank(bonus, "c1");
  if (effect === "auto") mult *= 1 + 0.10 * skillRank(bonus, "a1");
  mult *= 1 + 0.25 * skillRank(bonus, "s1");
  mult *= 1 + 0.15 * coreRank(bonus, "k1");
  mult *= 1 + SHARD_BONUS * (bonus.shards || 0);
  return mult;
}

export const clickMultiplier = (blueLevels = {}, bonus = NO_BONUS) => multiplier(blueLevels, "click", bonus);
export const autoMultiplier = (blueLevels = {}, bonus = NO_BONUS) => multiplier(blueLevels, "auto", bonus);

// Gain automatique des améliorations, avant les multiplicateurs.
function baseAuto(levels, bonus) {
  let rate = 0;
  for (const u of UPGRADES) {
    if (u.kind !== "auto") continue;
    let value = u.value;
    if (u.id === "script" || u.id === "botnet") value *= 1 + 0.25 * skillRank(bonus, "a2");
    if (u.id === "farm" || u.id === "dc") value *= 1 + 0.25 * skillRank(bonus, "a3");
    rate += value * level(levels, u.id);
  }
  return rate;
}

// Crédits par clic, sans la compétence « Main de fer » (qui dépend du gain par seconde).
function baseClick(levels, blueLevels, bonus) {
  let power = 1;
  for (const u of UPGRADES) if (u.kind === "click") power += u.value * level(levels, u.id);
  return power * clickMultiplier(blueLevels, bonus);
}

// Crédits par seconde, sans rien faire (y compris les clics automatiques du Rebirth).
export function perSecond(levels, blueLevels = {}, bonus = NO_BONUS) {
  const auto = baseAuto(levels, bonus) * autoMultiplier(blueLevels, bonus);
  const autoClicks = coreRank(bonus, "k6") * baseClick(levels, blueLevels, bonus);
  return auto + autoClicks;
}

// Crédits par clic (un nombre à virgule : voir clickGain).
export function clickPower(levels, blueLevels = {}, bonus = NO_BONUS) {
  const ironHand = 0.01 * skillRank(bonus, "c3") * baseAuto(levels, bonus) * autoMultiplier(blueLevels, bonus);
  return baseClick(levels, blueLevels, bonus) + ironHand;
}

export const critChance = (bonus = NO_BONUS) => 0.03 * skillRank(bonus, "c2");
export const CRIT_MULTIPLIER = 5;

// Un crédit est entier : on garde la partie décimale (`carry`) pour le prochain passage.
function whole(exact) {
  const w = Math.floor(exact + 1e-9);
  return { whole: w, carry: Math.max(0, exact - w) };
}

// Gain d'un clic. rng permet de tester les coups critiques.
export function clickGain(levels, blueLevels = {}, carry = 0, bonus = NO_BONUS, rng = Math.random) {
  const crit = rng() < critChance(bonus);
  const exact = clickPower(levels, blueLevels, bonus) * (crit ? CRIT_MULTIPLIER : 1) + carry;
  return { ...whole(exact), crit };
}

// Gain passif pendant `ms` millisecondes.
export function idleGain(levels, ms, carry = 0, blueLevels = {}, bonus = NO_BONUS) {
  return whole((perSecond(levels, blueLevels, bonus) * ms) / 1000 + carry);
}

/* ---------- Achats ---------- */

// Achète une amélioration en crédits. Renvoie true si l'achat a eu lieu.
export function buy(wallet, id) {
  const upgrade = upgradeById(id);
  if (!upgrade) return false;
  const price = costOf(upgrade, wallet.data.levels[id] || 0, wallet.data.blueLevels, bonusOf(wallet.data));
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

/* ---------- Points de compétence ---------- */

export function pointsEarned(data) {
  const bonus = bonusOf(data);
  const fromMining = SKILL_THRESHOLDS.filter((t) => (data.minedRun || 0) >= t).length;
  return fromMining + coreRank(bonus, "k4");
}

export const pointsSpent = (data) => SKILLS.reduce((sum, sk) => sum + skillRank(bonusOf(data), sk.id) * sk.cost, 0);
export const pointsFree = (data) => pointsEarned(data) - pointsSpent(data);

// Prochain seuil de crédits minés qui donnera un point (null s'ils sont tous atteints).
export const nextThreshold = (data) => SKILL_THRESHOLDS.find((t) => (data.minedRun || 0) < t) ?? null;

export function skillState(data, id) {
  const sk = skillById(id);
  const bonus = bonusOf(data);
  const current = skillRank(bonus, id);
  const missing = sk.req.filter((r) => skillRank(bonus, r.id) < r.rank);
  if (current >= sk.max) return { current, state: "max", missing };
  if (missing.length) return { current, state: "locked", missing };
  if (pointsFree(data) < sk.cost) return { current, state: "poor", missing };
  return { current, state: "ready", missing };
}

export function skillUp(wallet, id) {
  if (!skillById(id) || skillState(wallet.data, id).state !== "ready") return false;
  wallet.skillUp(id);
  return true;
}

/* ---------- Rebirth ---------- */

export function shardsFor(data) {
  const run = data.minedRun || 0;
  if (run < REBIRTH_MIN) return 0;
  const bonus = bonusOf(data);
  return Math.floor(Math.sqrt(run / REBIRTH_MIN) * (1 + 0.10 * coreRank(bonus, "k3")));
}

export const canRebirth = (data) => shardsFor(data) >= 1;

// Crédits rendus au formatage (arbre du Rebirth « Indemnité »).
export const refundFor = (data) => Math.floor((data.minedRun || 0) * 0.02 * coreRank(bonusOf(data), "k7"));

// Niveaux d'amélioration offerts au début de chaque partie (« Tête de pont »).
export function startLevels(data) {
  const r = coreRank(bonusOf(data), "k2");
  return r > 0 ? { script: 3 * r, botnet: r } : {};
}

// Formate : remet à zéro les améliorations en crédits et l'arbre de compétences, donne les éclats.
// Les crédits, pièces bleues, paliers bleus, tours et succès sont conservés.
export function rebirth(wallet) {
  if (!canRebirth(wallet.data)) return null;
  const result = { shards: shardsFor(wallet.data), credits: refundFor(wallet.data), start: startLevels(wallet.data) };
  wallet.rebirth(result);
  return result;
}

export function buyCore(wallet, id) {
  const node = coreById(id);
  if (!node) return false;
  const price = coreCostOf(node, wallet.data.core?.[id] || 0);
  if (price === null || !wallet.spendShards(price)) return false;
  wallet.coreUp(id);
  return true;
}

/* ---------- Paquet de données (événement aléatoire) ---------- */

export const PACKET_MIN_DELAY = 40000;   // ms entre deux paquets
export const PACKET_MAX_DELAY = 90000;
export const PACKET_LIFETIME = 9000;     // ms pendant lesquelles on peut le cliquer

export const nextPacketDelay = (rng = Math.random, bonus = NO_BONUS) =>
  Math.round((PACKET_MIN_DELAY + Math.floor(rng() * (PACKET_MAX_DELAY - PACKET_MIN_DELAY))) * 0.85 ** skillRank(bonus, "e2"));

// Récompense : environ 45 secondes de gains passifs plus 25 clics, au moins 75 crédits.
export function packetReward(levels, blueLevels = {}, bonus = NO_BONUS) {
  const base = perSecond(levels, blueLevels, bonus) * 45 + clickPower(levels, blueLevels, bonus) * 25;
  return Math.max(75, Math.floor(base * (1 + 0.2 * skillRank(bonus, "e2"))));
}

export const packetBlueChance = (bonus = NO_BONUS) => 0.03 * skillRank(bonus, "e3");

/* ---------- Succès ---------- */

const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS = [
  { id: "first_click",  name: "Premier clic",          desc: "Mine ton premier crédit",                    reward: 10,      test: (s) => s.clicks >= 1 },
  { id: "clicks_100",   name: "Doigts de fée",         desc: "100 clics",                                  reward: 50,      test: (s) => s.clicks >= 100 },
  { id: "clicks_1000",  name: "Tendinite",             desc: "1 000 clics",                                reward: 500,     test: (s) => s.clicks >= 1000 },
  { id: "mined_1k",     name: "Petit mineur",          desc: "1 000 crédits minés",                        reward: 100,     test: (s) => s.mined >= 1000 },
  { id: "mined_100k",   name: "Gros mineur",           desc: "100 000 crédits minés",                      reward: 5000,    test: (s) => s.mined >= 100000 },
  { id: "mined_10m",    name: "Magnat des données",    desc: "10 millions de crédits minés",               reward: 250000,  test: (s) => s.mined >= 10000000 },
  { id: "mined_1b",     name: "Empire des données",    desc: "1 milliard de crédits minés",                reward: 5000000, test: (s) => s.mined >= 1000000000 },
  { id: "scripts_10",   name: "Automatisation",        desc: "10 scripts automatiques",                    reward: 300,     test: (s) => (s.levels.script || 0) >= 10 },
  { id: "farm_5",       name: "Salle des machines",    desc: "5 fermes de serveurs",                       reward: 5000,    test: (s) => (s.levels.farm || 0) >= 5 },
  { id: "every_tier",   name: "Panoplie complète",     desc: "Au moins 1 de chaque amélioration",          reward: 50000,   test: (s) => CLASSIC_IDS.every((id) => (s.levels[id] || 0) >= 1) },
  { id: "blue_first",   name: "Premier bleu",          desc: "Première amélioration en pièces bleues",     reward: 100,     test: (s) => s.blueTotal >= 1 },
  { id: "blue_10",      name: "Collectionneur",        desc: "10 paliers en pièces bleues",                reward: 2000,    test: (s) => s.blueTotal >= 10 },
  { id: "skill_first",  name: "Spécialisation",        desc: "Prends une première compétence",             reward: 500,     test: (s) => s.skillRanks >= 1 },
  { id: "skill_10",     name: "Maître opérateur",      desc: "10 rangs de compétence dans une partie",     reward: 20000,   test: (s) => s.skillRanks >= 10 },
  { id: "rebirth_1",    name: "Renaissance",           desc: "Premier formatage",                          reward: 25000,   test: (s) => s.rebirths >= 1 },
  { id: "rebirth_5",    name: "Cycle éternel",         desc: "5 formatages",                               reward: 500000,  test: (s) => s.rebirths >= 5 },
  { id: "clicks_10000", name: "Clic compulsif",        desc: "10 000 clics",                               reward: 50000,    test: (s) => s.clicks >= 10000 },
  { id: "clicks_100k",  name: "Souris légendaire",     desc: "100 000 clics",                              reward: 1000000,  test: (s) => s.clicks >= 100000 },
  { id: "mined_100m",   name: "Cent millions",         desc: "100 millions de crédits minés",              reward: 2000000,  test: (s) => s.mined >= 100000000 },
  { id: "mined_100b",   name: "Économie mondiale",     desc: "100 milliards de crédits minés",             reward: 50000000, test: (s) => s.mined >= 100000000000 },
  { id: "scripts_100",  name: "Légion de scripts",     desc: "100 scripts automatiques",                   reward: 50000,    test: (s) => (s.levels.script || 0) >= 100 },
  { id: "botnet_25",    name: "Zombies",               desc: "25 réseaux de bots",                         reward: 100000,   test: (s) => (s.levels.botnet || 0) >= 25 },
  { id: "dc_10",        name: "Hyperscaler",           desc: "10 centres de données",                      reward: 500000,   test: (s) => (s.levels.dc || 0) >= 10 },
  { id: "quantum_5",    name: "Superposition",         desc: "5 ordinateurs quantiques",                   reward: 5000000,  test: (s) => (s.levels.quantum || 0) >= 5 },
  { id: "ai_1",         name: "Éveil",                 desc: "Une IA autonome",                            reward: 2000000,  test: (s) => (s.levels.ai || 0) >= 1 },
  { id: "sim_1",        name: "Architecte",            desc: "Une simulation d'univers",                   reward: 100000000, test: (s) => (s.levels.sim || 0) >= 1 },
  { id: "blue_25",      name: "Banquier bleu",         desc: "25 paliers en pièces bleues",                reward: 50000,    test: (s) => s.blueTotal >= 25 },
  { id: "skill_20",     name: "Grand maître",          desc: "20 rangs de compétence dans une partie",     reward: 500000,   test: (s) => s.skillRanks >= 20 },
  { id: "rebirth_10",   name: "Boucle infinie",        desc: "10 formatages",                              reward: 5000000,  test: (s) => s.rebirths >= 10 },
  { id: "core_30",      name: "Cœur de diamant",       desc: "30 rangs dans l'arbre du Rebirth",           reward: 2000000,  test: (s) => s.coreRanks >= 30 },
  { id: "core_10",      name: "Cœur de silicium",      desc: "10 rangs dans l'arbre du Rebirth",           reward: 100000,  test: (s) => s.coreRanks >= 10 },
  { id: "clicks_1m",    name: "Un million de clics",   desc: "1 000 000 de clics",                         reward: 5e9,     test: (s) => s.clicks >= 1000000 },
  { id: "mined_1t",     name: "Mille milliards",       desc: "1 T de crédits minés",                       reward: 1e10,    test: (s) => s.mined >= 1e12 },
  { id: "mined_1qa",    name: "Quadrillionnaire",      desc: "1 Qa de crédits minés",                      reward: 1e13,    test: (s) => s.mined >= 1e15 },
  { id: "mined_1qi",    name: "Au-delà du réel",       desc: "1 Qi de crédits minés",                      reward: 1e16,    test: (s) => s.mined >= 1e18 },
  { id: "mined_1sx",    name: "Économie galactique",   desc: "1 Sx de crédits minés",                      reward: 1e19,    test: (s) => s.mined >= 1e21 },
  { id: "mined_1sp",    name: "Économie universelle",  desc: "1 Sp de crédits minés",                      reward: 1e22,    test: (s) => s.mined >= 1e24 },
  { id: "mined_1oc",    name: "Fortune absurde",       desc: "1 Oc de crédits minés",                      reward: 1e25,    test: (s) => s.mined >= 1e27 },
  { id: "dyson_1",      name: "Bâtisseur d'étoiles",   desc: "Une sphère de Dyson",                        reward: 1e11,    test: (s) => (s.levels.dyson || 0) >= 1 },
  { id: "blackhole_1",  name: "Horizon des événements", desc: "Un trou noir minier",                       reward: 1e13,    test: (s) => (s.levels.blackhole || 0) >= 1 },
  { id: "multiverse_1", name: "Voyageur du multivers", desc: "Un multivers",                               reward: 1e16,    test: (s) => (s.levels.multiverse || 0) >= 1 },
  { id: "omega_1",      name: "Alpha et Oméga",        desc: "Un moteur Oméga",                            reward: 1e19,    test: (s) => (s.levels.omega || 0) >= 1 },
  { id: "lastbit_1",    name: "Plus rien à miner",     desc: "Le Dernier Bit",                             reward: 1e21,    test: (s) => (s.levels.lastbit || 0) >= 1 },
  { id: "paradox_1",    name: "Créateur",              desc: "Un paradoxe du créateur",                    reward: 1e24,    test: (s) => (s.levels.paradox || 0) >= 1 },
  { id: "every_cosmic", name: "Panoplie cosmique",     desc: "Au moins 1 de chaque amélioration, nouvelles comprises", reward: 1e22, test: (s) => UPGRADES.every((u) => (s.levels[u.id] || 0) >= 1) }
];

export function statsOf(data) {
  return {
    clicks: data.clicksTotal || 0,
    mined: data.minedTotal || 0,
    levels: data.levels || {},
    blueLevels: data.blueLevels || {},
    blueTotal: sum(data.blueLevels),
    skillRanks: sum(data.skills),
    coreRanks: sum(data.core),
    rebirths: data.rebirths || 0
  };
}

// Débloque les succès atteints et verse leur récompense. Renvoie la liste des nouveaux succès.
export function checkAchievements(wallet) {
  const stats = statsOf(wallet.data);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (wallet.data.achievements.includes(a.id) || !a.test(stats)) continue;
    if (wallet.unlockAchievement(a.id)) {
      const paid = a.reward + wealthBonus(wallet.credits, ACHIEVEMENT_PCT);   // + 0,5 % de la fortune
      wallet.addCredits(paid);
      unlocked.push({ ...a, reward: paid });
    }
  }
  return unlocked;
}
