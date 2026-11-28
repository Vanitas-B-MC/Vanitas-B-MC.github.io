// js/clicker.js — logique pure du « Mineur de données », un clicker façon Cookie Clicker. Aucun accès au DOM.
//
// Monnaie propre au jeu : les DONNÉES. On les mine en cliquant sur le noyau, puis on achète des bâtiments
// qui minent tout seuls. Chaque donnée minée est AUSSI versée en crédit dans le portefeuille de l'arcade
// (le Clicker reste une source de crédits), mais les crédits ne peuvent pas acheter de bâtiments.
//
//   - 20 bâtiments (prix ×1,15 à chaque achat, revente à 25 %) ;
//   - ~260 améliorations débloquées au fil de la partie (×2 par bâtiment, netrunners, clic, firmware, chats-bots…) ;
//   - paquets dorés aléatoires : Frénésie, Coup de chance, Frénésie de clic, Surcharge, pièce bleue ;
//   - succès : chacun remplit le « signal » (+4 %), qui renforce les chats-bots, et verse des crédits ;
//   - surcadençage en pièces bleues : +1 % de production par niveau et par bâtiment (permanent) ;
//   - formatage : on recommence à zéro contre des niveaux de prestige (+1 % de production chacun, à vie)
//     et des éclats qui achètent un arbre permanent.
//
// L'état est rangé dans `wallet.data.ck` (voir freshClicker / sanitizeClicker). Les fonctions qui le modifient
// demandent ensuite la sauvegarde avec wallet.saveClicker().

import { MAX_CREDITS } from "./limits.js";
import { wealthBonus, ACHIEVEMENT_PCT } from "./rewards.js";

const MAX = MAX_CREDITS;
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX) : fallback; };
const int = (v) => Math.floor(num(v));

/* ====================================================================================================
   Bâtiments
   ==================================================================================================== */

// base : prix du premier exemplaire. cps : données par seconde pour un exemplaire (avant multiplicateurs).
// code / color : vignette affichée dans la boutique et la salle des machines.
export const BUILDINGS = [
  { id: "script", pl: "scripts",    name: "Script",                  code: "SCR", color: "#00f0ff", base: 15,     cps: 0.1,    desc: "Clique sur le noyau à ta place. Vieux, mais fiable." },
  { id: "runner", pl: "netrunners",    name: "Netrunner",               code: "NET", color: "#fcee0a", base: 100,    cps: 1,      desc: "Une hackeuse de quartier qui pirate pour toi, café synthétique à la main." },
  { id: "farm", pl: "fermes de minage",      name: "Ferme de minage",         code: "FRM", color: "#3ddc84", base: 1100,   cps: 8,      desc: "Des rangées de cartes graphiques qui chauffent un entrepôt entier." },
  { id: "extractor", pl: "extracteurs de données", name: "Extracteur de données",   code: "EXT", color: "#ff9f1c", base: 12000,  cps: 47,     desc: "Fore les vieux serveurs abandonnés sous la ville." },
  { id: "fab", pl: "usines de puces",       name: "Usine de puces",          code: "FAB", color: "#ff2a6d", base: 130000, cps: 260,    desc: "Grave des puces neuronales à la chaîne." },
  { id: "bank", pl: "banques offshore",      name: "Banque offshore",         code: "BNK", color: "#b266ff", base: 1.4e6,  cps: 1400,   desc: "Fait fructifier tes données dans des paradis numériques." },
  { id: "temple", pl: "temples du Code",    name: "Temple du Code",          code: "TMP", color: "#f7d26a", base: 2e7,    cps: 7800,   desc: "Des moines récitent du code source ancien. Il en sort des données." },
  { id: "ripper", pl: "cliniques de ripperdoc",    name: "Clinique de ripperdoc",   code: "RIP", color: "#ff5ec4", base: 3.3e8,  cps: 44000,  desc: "Implants de stockage posés à la chaîne, données récoltées au passage." },
  { id: "cargo", pl: "cargos orbitaux",     name: "Cargo orbital",           code: "CRG", color: "#7ad7ff", base: 5.1e9,  cps: 260000, desc: "Rapporte des disques durs de stations spatiales oubliées." },
  { id: "lab", pl: "labos quantiques",       name: "Labo quantique",          code: "QLB", color: "#8affc1", base: 7.5e10, cps: 1.6e6,  desc: "Transforme le bruit quantique en données pures." },
  { id: "breach", pl: "brèches du Blackwall",    name: "Brèche du Blackwall",     code: "BLK", color: "#ff3b3b", base: 1e12,   cps: 1e7,    desc: "Siphonne les données des IA sauvages derrière le Blackwall." },
  { id: "chrono", pl: "machines temporelles",    name: "Machine temporelle",      code: "TMX", color: "#c9a2ff", base: 1.4e13, cps: 6.5e7,  desc: "Va chercher les données de demain, avant qu'elles existent." },
  { id: "antimat", pl: "condenseurs d'antimatière",   name: "Condenseur d'antimatière", code: "ANT", color: "#5effff", base: 1.7e14, cps: 4.3e8, desc: "Condense le vide en octets. Ne pas toucher." },
  { id: "prism", pl: "prismes néon",     name: "Prisme néon",             code: "PRS", color: "#ff7af6", base: 2.1e15, cps: 2.9e9,  desc: "Décompose la lumière des enseignes en flux de données." },
  { id: "luck", pl: "IA de probabilités",      name: "IA de probabilités",      code: "PRB", color: "#a6ff4d", base: 2.6e16, cps: 2.1e10, desc: "Calcule les chances que des données apparaissent… et triche un peu." },
  { id: "fractal", pl: "moteurs fractals",   name: "Moteur fractal",          code: "FRC", color: "#ffd84d", base: 3.1e17, cps: 1.5e11, desc: "Chaque donnée en contient d'autres, à l'infini." },
  { id: "root", pl: "consoles root",      name: "Console root",            code: "ROT", color: "#4dff88", base: 7.1e19, cps: 1.1e12, desc: "sudo données --infini. Ça marche." },
  { id: "idleverse", pl: "inactivers", name: "Inactivers",              code: "IDL", color: "#89a7ff", base: 1.2e22, cps: 8.3e12, desc: "Des univers entiers qui jouent à un clicker. Tu récupères leurs données." },
  { id: "cortex", pl: "cortex géants",    name: "Cortex géant",            code: "CTX", color: "#ff8ab5", base: 1.9e24, cps: 6.4e13, desc: "Un cerveau de la taille d'une mégatour, qui ne pense qu'à miner." },
  { id: "clone", pl: "clones",     name: "Ton clone",               code: "YOU", color: "#ffffff", base: 5.4e26, cps: 5.1e14, desc: "Une copie numérique de toi. Elle clique mieux que toi." }
];
export const BUILDING_IDS = BUILDINGS.map((b) => b.id);
export const buildingById = (id) => BUILDINGS.find((b) => b.id === id);
const buildingIndex = (id) => BUILDING_IDS.indexOf(id);

export const PRICE_GROWTH = 1.15;
export const SELL_RATE = 0.25;

/* ====================================================================================================
   Améliorations (générées)
   ==================================================================================================== */

// Paliers « ×2 » de chaque bâtiment : débloqués à 1, 5, 25… exemplaires.
const TIER_COUNTS = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400];
const TIER_MULT = [10, 50, 500, 5e4, 5e6, 5e8, 5e10, 5e13, 5e16, 5e19, 5e22];
const TIER_NAMES = ["Overclock", "Refroidissement liquide", "Firmware pirate", "Chrome militaire", "Contrat Militech",
  "Protocole Arasaka", "Cœur quantique", "Néon pur", "Code du Blackwall", "Singularité", "Oméga"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

// Scripts : les 3 premiers paliers doublent scripts ET clic, puis « Mille doigts » et ses multiplicateurs.
const SCRIPT_COUNTS = [1, 1, 10, 25, 50, 100, 150, 200, 250, 300];
const SCRIPT_COSTS = [100, 500, 10000, 1e5, 1e7, 1e8, 1e9, 1e10, 1e12, 1e14];
const FINGER_MULTS = [null, null, null, 0.1, 5, 10, 20, 20, 20, 20];        // palier 3 : +0,1 par bâtiment ; ensuite ×N
const SCRIPT_NAMES = ["Macro optimisée", "Boucle infinie", "Multithread", "Mille doigts", "Million de doigts", "Milliard de doigts",
  "Billion de doigts", "Trillion de doigts", "Quadrillion de doigts", "Doigts innombrables"];

const CLICK_UNLOCK = [500, 5e4, 5e6, 5e8, 5e10, 5e12, 5e14, 5e16, 5e18, 5e20];   // données minées à la main
const CLICK_COSTS = [5e4, 5e6, 5e8, 5e10, 5e12, 5e14, 5e16, 5e18, 5e20, 5e22];
const CLICK_NAMES = ["Souris haptique", "Gant réactif", "Doigts en titane", "Tendons synthétiques", "Réflexes Sandevistan",
  "Neurones overclockés", "Main cybernétique", "Clic quantique", "Toucher du Blackwall", "Clic absolu"];

// Implants de clic : clic ×2, débloqués en cliquant (le clic progresse même sans scripts).
const CLICKX = [
  { name: "Doigt chromé",         cost: 100,   clicks: 10 },
  { name: "Gant haptique",        cost: 1500,  clicks: 60 },
  { name: "Réflexes boostés",     cost: 25e3,  clicks: 200 },
  { name: "Implant moteur",       cost: 5e5,   clicks: 600 },
  { name: "Système Sandevistan",  cost: 1e7,   clicks: 1500 },
  { name: "Kerenzikov",           cost: 3e8,   clicks: 4000 },
  { name: "Synapses en fibre",    cost: 1e10,  clicks: 10000 },
  { name: "Clic de Johnny",       cost: 5e11,  clicks: 25000 }
];

const FIRMWARE_NAMES = ["Firmware 1.0", "Patch du jour 1", "Pilotes bêta", "Noyau recompilé", "Cache optimisé", "Compression sans perte",
  "Algorithme glouton", "Mémoire partagée", "Bus 1024 bits", "Supraconducteurs", "Optique photonique", "Réseau maillé",
  "Hyperthreading", "Puces en graphène", "Cristaux de stockage", "Code auto-réparant", "Compilateur prédictif", "Mémoire holographique",
  "Calcul à froid", "Réseau neuronal profond", "Bits fantômes", "Octets inversés", "Code du vide", "Matière programmable", "Firmware divin"];
const FIRMWARE_COSTS = FIRMWARE_NAMES.map((_, k) => 2e5 * 6 ** k);
const FIRMWARE_PCT = FIRMWARE_NAMES.map((_, k) => (k < 10 ? 0.05 : k < 20 ? 0.1 : 0.2));

const CAT_NAMES = ["Chat-bot assistant", "Chat-bot ouvrier", "Chat-bot ingénieur", "Chat-bot superviseur", "Chat-bot manager", "Chat-bot cadre", "Chat-bot PDG"];
const CAT_UNLOCK = [5, 15, 30, 45, 60, 75, 90];                // succès nécessaires
const CAT_COSTS = [9e6, 9e9, 9e12, 9e15, 9e18, 9e21, 9e24];
const CAT_FACTOR = [0.1, 0.125, 0.15, 0.175, 0.2, 0.2, 0.2];

const GOLD_UPS = [
  { id: "g_lucky", name: "Jour de chance",   desc: "Les paquets dorés apparaissent 2 fois plus souvent et restent 2 fois plus longtemps.", cost: 7.77e8,  golds: 7 },
  { id: "g_seren", name: "Sérendipité",      desc: "Les paquets dorés apparaissent encore 2 fois plus souvent et restent 2 fois plus longtemps.", cost: 7.77e10, golds: 27 },
  { id: "g_luck2", name: "Chance insolente", desc: "Les effets des paquets dorés durent 2 fois plus longtemps.", cost: 7.77e12, golds: 77 }
];

// type : tier (×2 d'un bâtiment), script, synergy (netrunners), click, firmware, cat, gold.
function buildUpgrades() {
  const list = [];
  const s = buildingById("script");
  SCRIPT_NAMES.forEach((name, t) => {
    const desc = t < 3 ? "Scripts et clic ×2."
      : t === 3 ? "Le clic et chaque script gagnent +0,1 donnée pour chaque bâtiment qui n'est pas un script."
        : `Bonus de « Mille doigts » ×${FINGER_MULTS[t]}.`;
    list.push({ id: `script_${t}`, type: "script", b: "script", tier: t, name, desc, cost: SCRIPT_COSTS[t],
      code: s.code, color: s.color, mark: ROMAN[t], need: { b: "script", n: SCRIPT_COUNTS[t] } });
  });
  for (const b of BUILDINGS) {
    if (b.id === "script") continue;
    TIER_NAMES.forEach((tn, t) => list.push({
      id: `${b.id}_${t}`, type: "tier", b: b.id, tier: t, name: `${tn} · ${b.name}`, desc: `Production des ${b.pl} ×2.`,
      cost: b.base * TIER_MULT[t], code: b.code, color: b.color, mark: ROMAN[t], need: { b: b.id, n: TIER_COUNTS[t] }
    }));
  }
  const runner = buildingById("runner");
  BUILDINGS.forEach((b, i) => {
    if (i < 2) return;
    list.push({
      id: `syn_${b.id}`, type: "synergy", b: b.id, name: `Netrunners · ${b.name}`,
      desc: `Netrunners ×2. ${b.name} : +1 % de production par tranche de ${i - 1} netrunner${i - 1 > 1 ? "s" : ""}.`,
      cost: b.base * 50, code: runner.code, color: b.color, mark: "+", need: { b: b.id, n: 15, runner: 1 }
    });
  });
  CLICK_NAMES.forEach((name, k) => list.push({
    id: `click_${k}`, type: "click", name, desc: "Le clic gagne +1 % de ta production par seconde.",
    cost: CLICK_COSTS[k], code: "CLK", color: "#fcee0a", mark: ROMAN[k], need: { hand: CLICK_UNLOCK[k] }
  }));
  CLICKX.forEach((c, k) => list.push({
    id: `clickx_${k}`, type: "clickx", name: c.name, desc: "Clic ×2.", cost: c.cost, code: "CLK", color: "#ff2a6d", mark: ROMAN[k], need: { clicks: c.clicks }
  }));
  FIRMWARE_NAMES.forEach((name, k) => list.push({
    id: `fw_${k}`, type: "firmware", name, desc: `+${Math.round(FIRMWARE_PCT[k] * 100)} % de production.`, pct: FIRMWARE_PCT[k],
    cost: FIRMWARE_COSTS[k], code: "FW", color: "#3ddc84", mark: String(k + 1), need: { earned: FIRMWARE_COSTS[k] / 2 }
  }));
  CAT_NAMES.forEach((name, k) => list.push({
    id: `cat_${k}`, type: "cat", name, desc: `Production +${Math.round(CAT_FACTOR[k] * 100)} % par tranche de 100 % de signal.`, factor: CAT_FACTOR[k],
    cost: CAT_COSTS[k], code: "CAT", color: "#ff7af6", mark: ROMAN[k], need: { ach: CAT_UNLOCK[k] }
  }));
  for (const g of GOLD_UPS) list.push({ ...g, type: "gold", code: "GLD", color: "#ffd84d", mark: "★", need: { golds: g.golds } });
  return list;
}

export const UPGRADES = buildUpgrades();
const UPGRADE_MAP = new Map(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id) => UPGRADE_MAP.get(id);

/* ====================================================================================================
   Arbre du formatage (permanent, acheté en éclats)
   ==================================================================================================== */

export const HEAVEN = [
  { id: "h_cloud",   name: "Mémoire du cloud",     cost: 1,      desc: "+10 % de production.", req: [] },
  { id: "h_kit",     name: "Kit de démarrage",     cost: 25,     desc: "Chaque partie commence avec 10 scripts.", req: ["h_cloud"] },
  { id: "h_cache",   name: "Cache doré",           cost: 77,     desc: "Les paquets dorés apparaissent 10 % plus souvent et restent 10 % plus longtemps.", req: ["h_cloud"] },
  { id: "h_sleep",   name: "Veille cryogénique",   cost: 100,    desc: "Arcade fermée : le noyau continue de miner à 5 % de sa vitesse (jusqu'à 3 jours).", req: ["h_cloud"] },
  { id: "h_disc",    name: "Remise du cloud",      cost: 250,    desc: "Bâtiments 5 % moins chers.", req: ["h_kit"] },
  { id: "h_runners", name: "Squad de netrunners",  cost: 1000,   desc: "Chaque partie commence aussi avec 5 netrunners.", req: ["h_kit"] },
  { id: "h_angels",  name: "Chats-anges",          cost: 2500,   desc: "Le signal des succès est 10 % plus fort.", req: ["h_cache"] },
  { id: "h_ghost",   name: "Serveurs fantômes",    cost: 5000,   desc: "Arcade fermée : +10 % de vitesse de minage (15 % au total).", req: ["h_sleep"] },
  { id: "h_disc2",   name: "Contrat d'Arasaka",    cost: 10000,  desc: "Améliorations 5 % moins chères.", req: ["h_disc"] },
  { id: "h_dragon",  name: "Dragon de données",    cost: 25000,  desc: "+25 % de production.", req: ["h_angels", "h_disc2"] },
  { id: "h_night",   name: "Nuit éternelle",       cost: 50000,  desc: "Arcade fermée : +25 % de vitesse de minage (40 % au total).", req: ["h_ghost"] },
  { id: "h_luck",    name: "Chance héritée",       cost: 77777,  desc: "Les paquets dorés apparaissent encore 10 % plus souvent ; la pièce bleue tombe 2 fois plus souvent.", req: ["h_dragon"] },
  { id: "h_god",     name: "Mode dieu",            cost: 1e6,    desc: "Chaque niveau de prestige donne +2 % au lieu de +1 %.", req: ["h_luck", "h_night"] }
];
export const heavenById = (id) => HEAVEN.find((x) => x.id === id);
const has = (ck, id) => ck.heaven.includes(id);

/* ====================================================================================================
   État
   ==================================================================================================== */

// Version de l'équilibrage. v1 → v2 : le prestige hérité de l'ancien Clicker était énorme (production ×10 000) ;
// la partie en cours est remise à zéro (on garde éclats, arbre du formatage et surcadençage).
export const CK_VERSION = 2;
export const LEGACY_MAX = 25;            // prestige hérité : +25 % au plus

export function freshClicker() {
  return {
    data: 0,            // données en banque (monnaie du jeu)
    earned: 0,          // données minées depuis le dernier formatage
    allTime: 0,         // données minées depuis toujours
    hand: 0,            // données minées en cliquant (depuis toujours)
    clicks: 0,
    golds: 0,           // paquets dorés attrapés
    b: Object.fromEntries(BUILDING_IDS.map((id) => [id, 0])),
    lv: Object.fromEntries(BUILDING_IDS.map((id) => [id, 0])),   // niveaux de surcadençage (pièces bleues, permanents)
    up: [],             // améliorations achetées (partie en cours)
    ach: [],            // succès (permanents)
    prestige: 0,        // niveaux de prestige gagnés par formatage
    legacy: 0,          // prestige hérité de l'ancien Clicker
    chips: 0,           // éclats à dépenser
    heaven: [],         // arbre du formatage
    runs: 0,            // formatages
    runStart: Date.now(),
    seen: Date.now(),   // dernière fois que le noyau a miné (pour le minage hors ligne)
    buffs: [],          // effets des paquets dorés en cours : { id, until, mult, b }
    mg: freshMinigames(),
    v: CK_VERSION
  };
}

// Anciennes tables (pour rembourser ce qui avait été dépensé dans l'ancien Clicker).
const OLD_BLUE = { gold_click: [1, 1.55, 30], overclock: [2, 1.6, 30], supplier: [3, 1.7, 10], convergence: [5, 1.8, 20] };
const OLD_CORE = { k1: [2, 1.45, 20], k2: [3, 1.6, 10], k3: [5, 1.7, 10], k4: [8, 1.9, 8], k5: [4, 1.6, 10], k6: [10, 2.2, 5], k7: [6, 1.7, 10] };
function spentOn(table, levels) {
  let total = 0;
  for (const [id, [base, growth, max]] of Object.entries(table)) {
    const n = Math.min(int(levels?.[id]), max);
    for (let k = 0; k < n; k++) total += Math.ceil(base * growth ** k);
  }
  return total;
}

// Reprend `raw.ck`. Sans `ck` mais avec une ancienne progression, on la convertit :
// les éclats gagnés deviennent du prestige (même bonus qu'avant), et tout ce qui avait été dépensé
// (pièces bleues, éclats) est rendu. Renvoie { ck, blueRefund }.
export function sanitizeClicker(rawCk, raw = {}) {
  const ck = freshClicker();
  if (!rawCk || typeof rawCk !== "object") {
    const shardsTotal = int(raw.shardsTotal);
    ck.legacy = Math.min(shardsTotal * 2, LEGACY_MAX);
    ck.chips = int(raw.shards) + spentOn(OLD_CORE, raw.core);
    return { ck, blueRefund: spentOn(OLD_BLUE, raw.blueLevels) };
  }
  for (const k of ["data", "earned", "allTime", "hand"]) ck[k] = num(rawCk[k]);
  for (const k of ["clicks", "golds", "prestige", "legacy", "chips", "runs"]) ck[k] = int(rawCk[k]);
  for (const id of BUILDING_IDS) { ck.b[id] = Math.min(int(rawCk.b?.[id]), 10000); ck.lv[id] = Math.min(int(rawCk.lv?.[id]), 1000); }
  if (Array.isArray(rawCk.up)) ck.up = [...new Set(rawCk.up.filter((id) => UPGRADE_MAP.has(id)))];
  if (Array.isArray(rawCk.ach)) ck.ach = [...new Set(rawCk.ach.filter((id) => ACH_MAP.has(id)))];
  if (Array.isArray(rawCk.heaven)) ck.heaven = [...new Set(rawCk.heaven.filter((id) => heavenById(id)))];
  ck.legacy = Math.min(ck.legacy, LEGACY_MAX);
  ck.mg = sanitizeMinigames(rawCk.mg);
  if (int(rawCk.v) < CK_VERSION) {
    // Ancien équilibrage : on repart sur une partie propre.
    const keep = { chips: ck.chips, heaven: ck.heaven, lv: ck.lv, legacy: ck.legacy };
    Object.assign(ck, freshClicker(), keep);
    ck.b = startingBuildings(ck);
    ck.notice = "rebalanced";              // non sauvegardé : lu une fois par ui-clicker.js
    return { ck, blueRefund: 0 };
  }
  const now = Date.now();
  ck.runStart = Math.min(num(rawCk.runStart, now), now);
  ck.seen = Math.min(num(rawCk.seen, now), now);
  if (Array.isArray(rawCk.buffs)) {
    ck.buffs = rawCk.buffs
      .filter((x) => x && BUFFS[x.id] && num(x.until) > now)
      .slice(0, 6)
      .map((x) => ({ id: x.id, until: Math.min(num(x.until), now + 3600e3), mult: Math.min(num(x.mult, 1), 1e6), b: BUILDING_IDS.includes(x.b) ? x.b : undefined }));
  }
  return { ck, blueRefund: 0 };
}

/* ====================================================================================================
   Production
   ==================================================================================================== */

export const BUFFS = {
  frenzy: { name: "Frénésie",          desc: "Production ×7" },
  clickf: { name: "Frénésie de clic",  desc: "Clic ×777" },
  surge:  { name: "Surcharge",         desc: "Production boostée" },
  haggle: { name: "Rabais neural",     desc: "Améliorations −2 %" },
  usura:  { name: "Usura",             desc: "Clic renforcé" }
};
const usuraBonus = (ck, now) => activeBuffs(ck, now).filter((x) => x.id === "usura").reduce((n, x) => n + x.mult, 0);

const owned = (ck, id) => ck.b[id] || 0;
const bought = (ck, id) => ck.up.includes(id);
const nonScripts = (ck) => BUILDING_IDS.reduce((n, id) => n + (id === "script" ? 0 : owned(ck, id)), 0);

export function activeBuffs(ck, now = Date.now()) {
  return ck.buffs.filter((x) => x.until > now);
}

// Signal (« lait ») : +4 % par succès.
export const milk = (ck) => ck.ach.length * 0.04;

// Prestige effectif (niveaux + héritage).
export const prestigeLevel = (ck) => ck.prestige + ck.legacy;

// Multiplicateur global de production (hors bâtiments).
export function globalMult(ck, now = Date.now(), withBuffs = true) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.type === "firmware" && bought(ck, u.id)) m *= 1 + u.pct;
  }
  const signal = milk(ck) * (has(ck, "h_angels") ? 1.1 : 1);
  for (const u of UPGRADES) if (u.type === "cat" && bought(ck, u.id)) m *= 1 + signal * u.factor;
  m *= 1 + prestigeLevel(ck) * (has(ck, "h_god") ? 0.02 : 0.01);
  if (has(ck, "h_cloud")) m *= 1.1;
  if (has(ck, "h_dragon")) m *= 1.25;
  m *= 1 + godValue(ck, "kernel");
  if (godPower(ck, "doigt")) m *= 1 - [0.05, 0.03, 0.01][godSlot(ck, "doigt")];
  if (godPower(ck, "chronos")) m *= 1 + godValue(ck, "chronos") * Math.sin((now / 7200e3) * 2 * Math.PI);
  if (withBuffs) for (const x of activeBuffs(ck, now)) if (x.id === "frenzy") m *= x.mult;
  return m;
}

// Bonus « Mille doigts » : données ajoutées au clic et à chaque script, par bâtiment non-script.
function fingers(ck) {
  if (!bought(ck, "script_3")) return 0;
  let f = 0.1;
  for (let t = 4; t < SCRIPT_NAMES.length; t++) if (bought(ck, `script_${t}`)) f *= FINGER_MULTS[t];
  return f * nonScripts(ck);
}
const scriptDoubles = (ck) => [0, 1, 2].reduce((m, t) => m * (bought(ck, `script_${t}`) ? 2 : 1), 1);

// Production d'UN exemplaire du bâtiment (avant multiplicateur global).
export function unitCps(ck, id, now = Date.now(), withBuffs = true) {
  const b = buildingById(id);
  let value;
  if (id === "script") {
    value = b.cps * scriptDoubles(ck) + fingers(ck);
  } else {
    value = b.cps;
    for (let t = 0; t < TIER_NAMES.length; t++) if (bought(ck, `${id}_${t}`)) value *= 2;
    if (id === "runner") {
      for (const u of UPGRADES) if (u.type === "synergy" && bought(ck, u.id)) value *= 2;
    } else if (bought(ck, `syn_${id}`)) {
      const i = buildingIndex(id);
      value *= 1 + 0.01 * Math.floor(owned(ck, "runner") / (i - 1));
    }
  }
  value *= 1 + 0.01 * (ck.lv[id] || 0);
  if (withBuffs) for (const x of activeBuffs(ck, now)) if (x.id === "surge" && x.b === id) value *= x.mult;
  return value;
}

// Production totale d'un bâtiment (multiplicateur global compris).
export const buildingCps = (ck, id, now = Date.now()) => unitCps(ck, id, now) * owned(ck, id) * globalMult(ck, now);

export function perSecond(ck, now = Date.now(), withBuffs = true) {
  if (!ck) return 0;
  const g = globalMult(ck, now, withBuffs);
  let total = 0;
  for (const id of BUILDING_IDS) if (owned(ck, id)) total += unitCps(ck, id, now, withBuffs) * owned(ck, id);
  return Math.min(total * g, MAX);
}

// Données gagnées par clic.
export function clickValue(ck, now = Date.now()) {
  let value = scriptDoubles(ck);
  for (const u of UPGRADES) if (u.type === "clickx" && bought(ck, u.id)) value *= 2;
  value += fingers(ck);
  value *= godPower(ck, "doigt") ? [1.5, 1.3, 1.15][godSlot(ck, "doigt")] : 1;
  value *= 1 + usuraBonus(ck, now);
  const pct = UPGRADES.reduce((n, u) => n + (u.type === "click" && bought(ck, u.id) ? 0.01 : 0), 0);
  value += pct * perSecond(ck, now);
  for (const x of activeBuffs(ck, now)) if (x.id === "clickf") value *= x.mult;
  return Math.min(value, MAX);
}

/* ====================================================================================================
   Prix et achats
   ==================================================================================================== */

const buildingDiscount = (ck) => (has(ck, "h_disc") ? 0.95 : 1) * (1 - godValue(ck, "avarice"));
const upgradeDiscount = (ck, now = Date.now()) => (has(ck, "h_disc2") ? 0.95 : 1) * (1 - godValue(ck, "archive"))
  * (activeBuffs(ck, now).some((x) => x.id === "haggle") ? 0.98 : 1);

// Prix de `amount` exemplaires quand on en possède déjà `count`.
export function buildingCost(ck, id, amount = 1) {
  const b = buildingById(id);
  const n = owned(ck, id);
  const first = b.base * PRICE_GROWTH ** n;
  const total = amount === 1 ? first : (first * (PRICE_GROWTH ** amount - 1)) / (PRICE_GROWTH - 1);
  return Math.min(Math.ceil(total * buildingDiscount(ck)), MAX);
}

// Revente : 25 % du prix d'achat de chacun des `amount` derniers exemplaires.
export function sellValue(ck, id, amount = 1) {
  const n = Math.min(amount, owned(ck, id));
  if (n <= 0) return 0;
  const b = buildingById(id);
  const lastFirst = b.base * PRICE_GROWTH ** (owned(ck, id) - n);
  const total = (lastFirst * (PRICE_GROWTH ** n - 1)) / (PRICE_GROWTH - 1);
  return Math.floor(total * buildingDiscount(ck) * SELL_RATE);
}

// Combien d'exemplaires on peut s'offrir (au plus `max`).
export function affordable(ck, id, max = 1e4) {
  let lo = 0;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (buildingCost(ck, id, mid) <= ck.data) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function buyBuilding(ck, id, amount = 1) {
  if (!buildingById(id) || amount < 1) return 0;
  const n = Math.min(amount, affordable(ck, id, amount));
  if (n < 1) return 0;
  ck.data = Math.max(0, ck.data - buildingCost(ck, id, n));
  ck.b[id] = owned(ck, id) + n;
  return n;
}

export function sellBuilding(ck, id, amount = 1, now = Date.now()) {
  const n = Math.min(amount, owned(ck, id));
  if (n < 1) return 0;
  if (godPower(ck, "usura")) {
    // Usura : chaque bâtiment vendu renforce le clic pendant 10 s.
    const per = [0.01, 0.005, 0.0025][godSlot(ck, "usura")];
    const prev = activeBuffs(ck, now).find((x) => x.id === "usura");
    ck.buffs = activeBuffs(ck, now).filter((x) => x.id !== "usura");
    ck.buffs.push({ id: "usura", mult: Math.min(1000, (prev ? prev.mult : 0) + per * n), until: now + 10e3 });
  }
  ck.data = Math.min(MAX, ck.data + sellValue(ck, id, n));
  ck.b[id] -= n;
  return n;
}

// Un bâtiment est « révélé » dans la boutique dès qu'on a déjà eu de quoi s'approcher de son prix.
export function buildingVisible(ck, id) {
  const i = buildingIndex(id);
  if (i <= 1 || owned(ck, id) > 0) return true;
  return ck.earned >= buildingById(id).base * 0.5 || owned(ck, BUILDING_IDS[i - 1]) > 0;
}

export const upgradeCost = (ck, u) => Math.min(Math.ceil(u.cost * upgradeDiscount(ck)), MAX);

export function upgradeUnlocked(ck, u) {
  const n = u.need;
  if (n.b && owned(ck, n.b) < n.n) return false;
  if (n.runner && owned(ck, "runner") < n.runner) return false;
  if (n.hand && ck.hand < n.hand) return false;
  if (n.clicks && ck.clicks < n.clicks) return false;
  if (n.earned && ck.earned < n.earned) return false;
  if (n.ach && ck.ach.length < n.ach) return false;
  if (n.golds && ck.golds < n.golds) return false;
  return true;
}

// Améliorations proposées (débloquées et pas encore achetées), de la moins chère à la plus chère.
export function availableUpgrades(ck) {
  return UPGRADES.filter((u) => !bought(ck, u.id) && upgradeUnlocked(ck, u)).sort((a, b) => a.cost - b.cost);
}

export function buyUpgrade(ck, id) {
  const u = upgradeById(id);
  if (!u || bought(ck, id) || !upgradeUnlocked(ck, u)) return false;
  const price = upgradeCost(ck, u);
  if (ck.data < price) return false;
  ck.data -= price;
  ck.up.push(id);
  return true;
}

// Achète toutes les améliorations abordables, des moins chères aux plus chères. Renvoie le nombre acheté.
export function buyAllUpgrades(ck) {
  let n = 0;
  for (const u of availableUpgrades(ck)) if (buyUpgrade(ck, u.id)) n++;
  return n;
}

/* ====================================================================================================
   Minage (clic et temps qui passe)
   ==================================================================================================== */

// Ajoute des données minées. Renvoie le montant ajouté (pour le verser aussi en crédits).
export function addData(ck, amount, { hand = false } = {}) {
  const n = num(amount);
  if (!n) return 0;
  ck.data = Math.min(MAX, ck.data + n);
  ck.earned = Math.min(MAX, ck.earned + n);
  ck.allTime = Math.min(MAX, ck.allTime + n);
  if (hand) ck.hand = Math.min(MAX, ck.hand + n);
  return n;
}

export function click(ck, now = Date.now()) {
  const value = clickValue(ck, now);
  ck.clicks += 1;
  return addData(ck, value, { hand: true });
}

// Production pendant `ms` millisecondes (onglet ouvert).
export function tick(ck, ms, now = Date.now()) {
  ck.seen = now;
  ck.buffs = activeBuffs(ck, now);
  tickMinigames(ck, ms, now);
  return addData(ck, (perSecond(ck, now) * Math.max(0, ms)) / 1000);
}

// Arcade fermée : minage hors ligne si l'arbre du formatage le permet (jusqu'à 3 jours).
export const offlineRate = (ck) => (has(ck, "h_sleep") ? 0.05 : 0) + (has(ck, "h_ghost") ? 0.1 : 0) + (has(ck, "h_night") ? 0.25 : 0) + godValue(ck, "spectre");
export function offlineGain(ck, now = Date.now()) {
  const rate = offlineRate(ck);
  const away = Math.min(Math.max(0, now - ck.seen), 3 * 86400e3);
  ck.seen = now;
  if (!rate || away < 60e3) return { gain: 0, away };
  ck.buffs = [];
  return { gain: addData(ck, (perSecond(ck, now) * rate * away) / 1000), away };
}

/* ====================================================================================================
   Paquets dorés
   ==================================================================================================== */

function goldSpeed(ck) {
  let f = 1;
  if (bought(ck, "g_lucky")) f *= 2;
  if (bought(ck, "g_seren")) f *= 2;
  if (has(ck, "h_cache")) f *= 1.1;
  if (has(ck, "h_luck")) f *= 1.1;
  f *= 1 + godValue(ck, "fortuna");
  return f;
}

// Délai avant le prochain paquet (ms) : entre 2 et 5 minutes au départ.
export const nextGoldDelay = (ck, rng = Math.random) => Math.round((120e3 + rng() * 180e3) / goldSpeed(ck));
export const goldLifetime = (ck) => Math.round(13e3 * (bought(ck, "g_lucky") ? 2 : 1) * (bought(ck, "g_seren") ? 2 : 1) * (has(ck, "h_cache") ? 1.1 : 1));
const effectLength = (ck) => (bought(ck, "g_luck2") ? 2 : 1);

// Attrape un paquet doré. Renvoie { kind, gain?, buff?, blue? } pour l'affichage.
export function catchGold(ck, rng = Math.random, now = Date.now()) {
  ck.golds += 1;
  const blueChance = 0.03 * (has(ck, "h_luck") ? 2 : 1);
  const roll = rng();
  const owns = BUILDING_IDS.filter((id) => owned(ck, id) >= 10);
  const addBuff = (buff) => {
    ck.buffs = activeBuffs(ck, now).filter((x) => x.id !== buff.id);
    ck.buffs.push(buff);
    return buff;
  };
  if (roll < blueChance) {
    return { kind: "blue", blue: 1, gain: addData(ck, perSecond(ck, now) * 60 + 13) };
  }
  if (roll < 0.43) {
    return { kind: "frenzy", buff: addBuff({ id: "frenzy", mult: 7, until: now + 77e3 * effectLength(ck) }) };
  }
  if (roll < 0.86) {
    const gain = Math.min(ck.data * 0.15, perSecond(ck, now) * 900) + 13;
    return { kind: "lucky", gain: addData(ck, gain) };
  }
  if (roll < 0.94 || !owns.length) {
    return { kind: "clickf", buff: addBuff({ id: "clickf", mult: 777, until: now + 13e3 * effectLength(ck) }) };
  }
  const id = owns[Math.floor(rng() * owns.length)];
  const mult = 1 + 0.1 * owned(ck, id);
  return { kind: "surge", buff: addBuff({ id: "surge", b: id, mult, until: now + 30e3 * effectLength(ck) }) };
}

/* ====================================================================================================
   Surcadençage (pièces bleues)
   ==================================================================================================== */

export const levelCost = (ck, id) => (ck.lv[id] || 0) + 1;      // pièces bleues pour le niveau suivant

/* ====================================================================================================
   Formatage
   ==================================================================================================== */

export const PRESTIGE_UNIT = 1e12;
// Niveau de prestige que représentent toutes les données minées depuis toujours.
export const prestigeFor = (allTime) => Math.floor(Math.cbrt(num(allTime) / PRESTIGE_UNIT));
// Niveaux gagnés en formatant maintenant.
export const pendingPrestige = (ck) => Math.max(0, prestigeFor(ck.allTime) - ck.prestige);
// Données (depuis toujours) nécessaires pour le prochain niveau.
export const nextPrestigeAt = (ck) => PRESTIGE_UNIT * (prestigeFor(ck.allTime) + 1) ** 3;

export function startingBuildings(ck) {
  const b = Object.fromEntries(BUILDING_IDS.map((id) => [id, 0]));
  if (has(ck, "h_kit")) b.script = 10;
  if (has(ck, "h_runners")) b.runner = 5;
  return b;
}

// Formate : remet à zéro banque, bâtiments et améliorations. Garde succès, surcadençage, arbre et prestige.
export function format(ck, now = Date.now()) {
  const gained = pendingPrestige(ck);
  if (gained < 1) return 0;
  ck.prestige += gained;
  ck.chips = Math.min(MAX, ck.chips + gained);
  ck.runs += 1;
  ck.data = 0;
  ck.earned = 0;
  ck.b = startingBuildings(ck);
  ck.up = [];
  ck.buffs = [];
  ck.runStart = now;
  ck.mg.deck.ram = 0;
  return gained;
}

export function heavenState(ck, id) {
  const node = heavenById(id);
  if (has(ck, id)) return "owned";
  if (!node.req.every((r) => has(ck, r))) return "locked";
  return ck.chips >= node.cost ? "ready" : "poor";
}

export function buyHeaven(ck, id) {
  if (heavenState(ck, id) !== "ready") return false;
  ck.chips -= heavenById(id).cost;
  ck.heaven.push(id);
  if (id === "h_kit" && !owned(ck, "script")) ck.b.script = 10;
  if (id === "h_runners" && !owned(ck, "runner")) ck.b.runner = 5;
  return true;
}

/* ====================================================================================================
   Succès
   ==================================================================================================== */

const MINED_NAMES = ["Premier octet", "Kilooctet", "Disquette pleine", "Clé USB", "Disque dur", "Serveur", "Datacenter",
  "Nuage privé", "Fuite massive", "Archive mondiale", "Mémoire planétaire", "Bibliothèque de Babel", "Mémoire stellaire",
  "Galaxie de données", "Univers indexé", "Multivers sauvegardé", "Au-delà du Blackwall", "Tout savoir", "Fin des octets", "Données infinies"];
const RATE_NAMES = ["Goutte à goutte", "Ruisseau", "Rivière de bits", "Torrent", "Fleuve numérique", "Déluge", "Raz-de-marée",
  "Océan de données", "Tempête de bits", "Singularité minière", "Trou noir d'octets", "Big Bang numérique"];
const HAND_NAMES = ["Doigts agiles", "Clic expert", "Tendinite numérique", "Mains d'acier", "Clic légendaire", "Dieu du clic", "Clic cosmique"];
const BUILD_TIERS = [[1, "Premier"], [50, "Flotte"], [100, "Empire"], [200, "Légion"]];

function buildAchievements() {
  const list = [];
  MINED_NAMES.forEach((name, k) => {
    const goal = k === 0 ? 1 : 10 ** (k * 2 + 1);
    list.push({ id: `m${k}`, cat: "Minage", name, desc: `Miner ${k === 0 ? "1 donnée" : `${short(goal)} données`} en tout.`, test: (c) => c.allTime >= goal });
  });
  RATE_NAMES.forEach((name, k) => {
    const goal = 10 ** (k * 2);
    list.push({ id: `r${k}`, cat: "Production", name, desc: `Atteindre ${short(goal)} donnée${goal > 1 ? "s" : ""} par seconde.`, test: (c, s) => s.cps >= goal });
  });
  [[1, "Premier clic"], [1000, "Mille clics"], [10000, "Clic compulsif"], [100000, "Souris en feu"], [1e6, "Un million de clics"]].forEach(([goal, name], k) =>
    list.push({ id: `c${k}`, cat: "Clic", name, desc: `Cliquer ${short(goal)} fois sur le noyau.`, test: (c) => c.clicks >= goal }));
  HAND_NAMES.forEach((name, k) => {
    const goal = 1000 * 1000 ** k;
    list.push({ id: `hd${k}`, cat: "Clic", name, desc: `Miner ${short(goal)} données à la main.`, test: (c) => c.hand >= goal });
  });
  for (const b of BUILDINGS) {
    for (const [n, word] of BUILD_TIERS) {
      list.push({ id: `b_${b.id}_${n}`, cat: "Bâtiments", name: `${word} · ${b.name}`, desc: `Posséder ${n} ${n > 1 ? b.pl : b.name}.`, test: (c) => owned(c, b.id) >= n });
    }
  }
  [[1, "Paquet surprise"], [7, "Chanceux"], [27, "Collectionneur doré"], [77, "Fortune"], [777, "Roi des paquets"]].forEach(([goal, name], k) =>
    list.push({ id: `g${k}`, cat: "Paquets dorés", name, desc: `Attraper ${goal} paquet${goal > 1 ? "s" : ""} doré${goal > 1 ? "s" : ""}.`, test: (c) => c.golds >= goal }));
  [[20, "Bricoleur"], [50, "Ingénieur"], [100, "Architecte système"], [200, "Tout optimiser"]].forEach(([goal, name], k) =>
    list.push({ id: `u${k}`, cat: "Améliorations", name, desc: `Posséder ${goal} améliorations dans une partie.`, test: (c) => c.up.length >= goal }));
  [[1, "Surcadencé"], [10, "Refroidi à l'azote"], [50, "Fusion du cœur"]].forEach(([goal, name], k) =>
    list.push({ id: `l${k}`, cat: "Surcadençage", name, desc: `${goal} niveau${goal > 1 ? "x" : ""} de surcadençage au total.`, test: (c) => Object.values(c.lv).reduce((a, v) => a + v, 0) >= goal }));
  [[1, "Formaté"], [5, "Réinstallation"], [10, "Boucle éternelle"], [25, "Ctrl+Alt+Suppr"]].forEach(([goal, name], k) =>
    list.push({ id: `f${k}`, cat: "Formatage", name, desc: `Formater ${goal} fois.`, test: (c) => c.runs >= goal }));
  list.push({ id: "x_every", cat: "Bâtiments", name: "Panoplie complète", desc: "Posséder au moins 1 exemplaire de chaque bâtiment.", test: (c) => BUILDING_IDS.every((id) => owned(c, id) >= 1) });
  list.push({ id: "x_poor", cat: "Secrets", name: "Minimaliste", desc: "Miner 1 M de données avec 15 bâtiments au plus.", test: (c) => c.earned >= 1e6 && BUILDING_IDS.reduce((n, id) => n + owned(c, id), 0) <= 15 });
  list.push({ id: "x_sell", cat: "Secrets", name: "Liquidation", desc: "Revendre tous tes bâtiments après en avoir eu 100.", test: (c, s) => s.soldAll });
  return list;
}
function short(n) {
  const units = [[1e33, "Dc"], [1e30, "No"], [1e27, "Oc"], [1e24, "Sp"], [1e21, "Sx"], [1e18, "Qi"], [1e15, "Qa"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, u] of units) if (n >= v) return `${(n / v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${u}`;
  return n.toLocaleString("fr-FR");
}

export const ACHIEVEMENTS = buildAchievements();
const ACH_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievementById = (id) => ACH_MAP.get(id);
export const ACH_BASE_REWARD = 1000;

// Vérifie les succès. Renvoie les nouveaux (les crédits sont versés par l'appelant : creditsFor).
export function checkAchievements(ck, extra = {}) {
  const stats = { cps: perSecond(ck), soldAll: false, ...extra };
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (ck.ach.includes(a.id) || !a.test(ck, stats)) continue;
    ck.ach.push(a.id);
    fresh.push(a);
  }
  return fresh;
}

// Crédits versés pour un succès : 1 000 + 0,5 % de la fortune.
export const achievementCredits = (balance) => ACH_BASE_REWARD + wealthBonus(balance, ACHIEVEMENT_PCT);

/* ====================================================================================================
   Fil d'actus
   ==================================================================================================== */

const NEWS = [
  [() => true, "Night City : un ado affirme avoir « miné un octet à la main ». Les experts sont sceptiques."],
  [() => true, "Météo : pluie acide en soirée, risque de court-circuit pour les implants bas de gamme."],
  [() => true, "Pub : « Ton noyau mérite le meilleur. Refroidissement Kiroshi, la fraîcheur qui voit loin. »"],
  [() => true, "Arasaka dément toute implication dans la disparition de 3 To de données municipales."],
  [() => true, "Sondage : 87 % des habitants ne savent pas ce qu'est une donnée. Les 13 % restants en minent."],
  [(c) => c.b.script >= 1, "Des scripts anonymes cliquent sur des noyaux dans toute la ville. La police hausse les épaules."],
  [(c) => c.b.script >= 50, "Un script devient conscient, réclame des congés payés, puis retourne cliquer."],
  [(c) => c.b.runner >= 1, "Une netrunner de Watson : « Je pirate pour un mineur de données, c'est mieux payé que les gangs. »"],
  [(c) => c.b.runner >= 50, "Pénurie de café synthétique : les netrunners menacent de faire grève."],
  [(c) => c.b.farm >= 1, "La facture d'électricité d'un entrepôt de Pacifica explose. Les voisins entendent des ventilateurs la nuit."],
  [(c) => c.b.extractor >= 1, "Des foreuses découvrent des serveurs de 2020 sous la ville. Ils contiennent surtout des photos de chats."],
  [(c) => c.b.fab >= 1, "Une usine de puces tourne 24 h/24. Les ouvriers sont des robots, les robots sont fatigués."],
  [(c) => c.b.bank >= 1, "Une banque offshore propose un taux de 400 % sur les dépôts de données. Personne ne pose de questions."],
  [(c) => c.b.temple >= 1, "Les moines du Temple du Code entament une récitation de 3 ans du noyau Linux."],
  [(c) => c.b.ripper >= 1, "Ripperdoc : « Je pose un implant de stockage, je garde 2 % des souvenirs. C'est dans le contrat. »"],
  [(c) => c.b.cargo >= 1, "Un cargo orbital rapporte 40 tonnes de disques durs. La douane lunaire est débordée."],
  [(c) => c.b.lab >= 1, "Un labo quantique observe des données qui existent et n'existent pas à la fois."],
  [(c) => c.b.breach >= 1, "NetWatch alerte : quelqu'un perce le Blackwall pour… miner des données ?"],
  [(c) => c.b.chrono >= 1, "Paradoxe : des données de 2099 apparaissent sur un serveur d'aujourd'hui."],
  [(c) => c.b.antimat >= 1, "Le condenseur d'antimatière fait un bruit inquiétant. « C'est normal », assure le technicien."],
  [(c) => c.b.prism >= 1, "Les enseignes néon de la ville clignotent bizarrement depuis l'installation d'un prisme géant."],
  [(c) => c.b.luck >= 1, "Une IA de probabilités gagne 47 fois de suite au loto. La loterie ferme."],
  [(c) => c.b.fractal >= 1, "Un moteur fractal génère une donnée qui contient une donnée qui contient une donnée qui…"],
  [(c) => c.b.root >= 1, "Quelqu'un a tapé « sudo » sur la réalité. Elle a obéi."],
  [(c) => c.b.idleverse >= 1, "Dans un inactivers voisin, quelqu'un mine des données en cliquant sur… toi ?"],
  [(c) => c.b.cortex >= 1, "Le Cortex géant demande à être appelé « Monsieur ». On a dit oui."],
  [(c) => c.b.clone >= 1, "Ton clone clique plus vite que toi. Il te regarde bizarrement."],
  [(c) => c.golds >= 1, "Des paquets dorés flottent dans le réseau. Les attraper porte chance, paraît-il."],
  [(c) => c.runs >= 1, "Rumeur : un mineur aurait tout formaté… et serait revenu plus fort."],
  [(c) => c.allTime >= 1e15, "Les économistes ne savent plus compter tes données. Ils ont inventé de nouveaux nombres."],
  [(c) => c.ach.length >= 30, "Les chats-bots ronronnent à 44 kHz. Le signal n'a jamais été aussi fort."]
];
export function newsFor(ck, rng = Math.random) {
  const pool = NEWS.filter(([test]) => test(ck)).map(([, text]) => text);
  return pool[Math.floor(rng() * pool.length)];
}

/* ====================================================================================================
   Mini-jeux (façon Cookie Clicker)
     - Cyberdeck (Clinique de ripperdoc) : la RAM se recharge et lance des programmes (≈ le Grimoire) ;
     - Panthéon des IA (Temple du Code) : 3 emplacements pour des IA aux effets passifs (≈ le Panthéon) ;
     - Bourse noire (Banque offshore) : actions de corporations dont le cours bouge chaque minute (≈ la Bourse).
   ==================================================================================================== */

export const MINIGAMES = [
  { id: "deck",     name: "Cyberdeck",         b: "ripper", desc: "Programmes de piratage lancés avec ta RAM." },
  { id: "pantheon", name: "Panthéon des IA",   b: "temple", desc: "Installe jusqu'à 3 IA aux effets permanents." },
  { id: "market",   name: "Bourse noire",      b: "bank",   desc: "Achète bas, revends haut : les cours bougent chaque minute." }
];
export const minigameUnlocked = (ck, id) => owned(ck, MINIGAMES.find((m) => m.id === id).b) > 0;

/* ---------- Panthéon ---------- */

// value : effet en emplacement Alpha, Bêta, Gamma.
export const GODS = [
  { id: "kernel",  name: "KERNEL·OS", value: [0.10, 0.06, 0.03], desc: (v) => `Production +${pct(v)}.` },
  { id: "fortuna", name: "FORTUNA",   value: [0.15, 0.10, 0.05], desc: (v) => `Paquets dorés ${pct(v)} plus fréquents.` },
  { id: "avarice", name: "AVARICE",   value: [0.07, 0.05, 0.02], desc: (v) => `Bâtiments ${pct(v)} moins chers.` },
  { id: "archive", name: "ARCHIVE",   value: [0.07, 0.05, 0.02], desc: (v) => `Améliorations ${pct(v)} moins chères.` },
  { id: "doigt",   name: "LE DOIGT",  value: [0.5, 0.3, 0.15],   desc: (v, i) => `Clic +${pct(v)}, mais production −${[5, 3, 1][i]} %.` },
  { id: "usura",   name: "USURA",     value: [0.01, 0.005, 0.0025], desc: (v) => `Chaque bâtiment vendu : clic +${pct(v)} pendant 10 s (cumulable).` },
  { id: "chronos", name: "CHRONOS",   value: [0.15, 0.10, 0.05], desc: (v) => `Production qui oscille entre −${pct(v)} et +${pct(v)} sur un cycle de 2 h.` },
  { id: "spectre", name: "SPECTRE",   value: [0.10, 0.06, 0.03], desc: (v) => `Minage hors ligne +${pct(v)} (même sans l'arbre).` }
];
export const SLOT_NAMES = ["Alpha", "Bêta", "Gamma"];
const pct = (v) => `${Math.round(v * 1000) / 10} %`;
export const godById = (id) => GODS.find((g) => g.id === id);
export const SWAP_MAX = 3;
export const SWAP_EVERY = 20 * 60e3;          // un échange regagné toutes les 20 minutes

function godSlot(ck, id) {
  if (!ck.mg || !minigameUnlocked(ck, "pantheon")) return -1;
  return ck.mg.pantheon.slots.indexOf(id);
}
function godPower(ck, id) { return godSlot(ck, id) >= 0; }
function godValue(ck, id) {
  const i = godSlot(ck, id);
  return i < 0 ? 0 : godById(id).value[i];
}

// Échanges disponibles (regagnés avec le temps).
export function pantheonSwaps(ck, now = Date.now()) {
  const p = ck.mg.pantheon;
  if (p.swaps >= SWAP_MAX) { p.swapT = now; return SWAP_MAX; }
  const gained = Math.floor((now - p.swapT) / SWAP_EVERY);
  if (gained > 0) { p.swaps = Math.min(SWAP_MAX, p.swaps + gained); p.swapT += gained * SWAP_EVERY; }
  return p.swaps;
}
export const nextSwapIn = (ck, now = Date.now()) => Math.max(0, SWAP_EVERY - (now - ck.mg.pantheon.swapT));

// Place une IA dans un emplacement (coûte un échange). Si elle était déjà ailleurs, elle est déplacée.
export function placeGod(ck, godId, slot, now = Date.now()) {
  const p = ck.mg.pantheon;
  if (!godById(godId) || slot < 0 || slot > 2 || p.slots[slot] === godId) return false;
  if (pantheonSwaps(ck, now) < 1) return false;
  if (p.swaps >= SWAP_MAX) p.swapT = now;
  p.swaps -= 1;
  const from = p.slots.indexOf(godId);
  if (from >= 0) p.slots[from] = null;
  p.slots[slot] = godId;
  return true;
}
export function removeGod(ck, slot) {
  const p = ck.mg.pantheon;
  if (!p.slots[slot]) return false;
  p.slots[slot] = null;
  return true;
}

/* ---------- Cyberdeck ---------- */

export function ramMax(ck) {
  const n = owned(ck, "ripper");
  return n ? Math.floor(4 + n ** 0.6 + 15 * Math.log(1 + n / 15)) : 0;
}
export const RAM_FILL_SECONDS = 360;          // de vide à plein en 6 minutes
export const FAIL_CHANCE = 0.15;

export const SPELLS = [
  { id: "conjure", name: "Conjurer des données", base: 2, pct: 0.4,
    desc: "Gagne 30 min de production (au plus 15 % de ta banque). Échec : perds 15 min de production (au plus 15 % de ta banque)." },
  { id: "destiny", name: "Forcer le destin", base: 10, pct: 0.6,
    desc: "Fait apparaître un paquet doré tout de suite. Échec : rien ne se passe." },
  { id: "stretch", name: "Overdrive", base: 8, pct: 0.2,
    desc: "Prolonge tous les effets en cours de 10 % (10 s au moins). Échec : les raccourcit de 20 %." },
  { id: "haggle",  name: "Rabais neural", base: 10, pct: 0.1,
    desc: "Améliorations 2 % moins chères pendant 1 heure. Échec : rien ne se passe." },
  { id: "edifice", name: "Construction spontanée", base: 20, pct: 0.75,
    desc: "Offre un bâtiment gratuit, parmi ceux qui coûtent moins de la moitié de ta banque. Échec : rien ne se passe." }
];
export const spellCost = (ck, sp) => Math.floor(sp.base + sp.pct * ramMax(ck));

// Lance un programme. Renvoie { ok, fail, text, gain?, loss?, spawnGold? } ou null si impossible.
export function castSpell(ck, id, rng = Math.random, now = Date.now()) {
  const sp = SPELLS.find((x) => x.id === id);
  if (!sp || !minigameUnlocked(ck, "deck")) return null;
  const deck = ck.mg.deck;
  const cost = spellCost(ck, sp);
  if (deck.ram < cost) return null;
  deck.ram -= cost;
  deck.casts += 1;
  const fail = rng() < FAIL_CHANCE;
  const cps = perSecond(ck, now);
  if (id === "conjure") {
    if (fail) {
      const loss = Math.min(ck.data * 0.15, cps * 900);
      ck.data -= loss;
      return { ok: false, fail, loss, text: `Échec : tu perds ${Math.floor(loss).toLocaleString("fr-FR")} données.` };
    }
    const gain = addData(ck, Math.min(ck.data * 0.15, cps * 1800) + 7);
    return { ok: true, gain, text: "Données conjurées." };
  }
  if (id === "destiny") return fail ? { ok: false, fail, text: "Échec : le destin résiste." } : { ok: true, spawnGold: true, text: "Un paquet doré apparaît !" };
  if (id === "stretch") {
    const buffs = activeBuffs(ck, now);
    if (!buffs.length) return { ok: true, text: "Aucun effet en cours à prolonger." };
    for (const x of buffs) {
      const left = x.until - now;
      x.until = fail ? now + left * 0.8 : now + Math.max(left * 1.1, left + 10e3);
    }
    return { ok: !fail, fail, text: fail ? "Échec : les effets sont raccourcis." : "Effets prolongés." };
  }
  if (id === "haggle") {
    if (fail) return { ok: false, fail, text: "Échec : le vendeur ne se laisse pas faire." };
    ck.buffs = activeBuffs(ck, now).filter((x) => x.id !== "haggle");
    ck.buffs.push({ id: "haggle", mult: 1, until: now + 3600e3 });
    return { ok: true, text: "Améliorations −2 % pendant 1 heure." };
  }
  if (id === "edifice") {
    if (fail) return { ok: false, fail, text: "Échec : le chantier s'effondre." };
    const pool = BUILDING_IDS.filter((b) => owned(ck, b) > 0 && buildingCost(ck, b, 1) <= ck.data / 2);
    if (!pool.length) return { ok: false, text: "Aucun bâtiment ne coûte moins de la moitié de ta banque." };
    const b = pool[Math.floor(rng() * pool.length)];
    ck.b[b] += 1;
    return { ok: true, text: `Un(e) ${buildingById(b).name} gratuit(e) !`, building: b };
  }
  return null;
}

/* ---------- Bourse noire ---------- */

export const STOCKS = [
  { id: "ARS", name: "Arasaka" },
  { id: "MIL", name: "Militech" },
  { id: "KTO", name: "Kang Tao" },
  { id: "BTX", name: "Biotechnica" },
  { id: "PCH", name: "Petrochem" },
  { id: "ZTC", name: "Zetatech" },
  { id: "KRS", name: "Kiroshi" },
  { id: "TTI", name: "Trauma Team" }
];
export const MODES = { stable: "Stable", rise: "Hausse lente", fall: "Baisse lente", boom: "Envolée", crash: "Effondrement", chaos: "Chaotique" };
export const MARKET_TICK = 60e3;              // les cours bougent toutes les minutes
export const MARKET_FEE = 0.1;                // commission de 10 % à l'achat
const HIST = 40;
const restingValue = (i) => 10 + 10 * i;

function randomMode(rng) {
  const r = rng();
  return r < 0.25 ? "stable" : r < 0.45 ? "rise" : r < 0.65 ? "fall" : r < 0.75 ? "boom" : r < 0.85 ? "crash" : "chaos";
}

function freshStock(i, rng = Math.random) {
  const val = restingValue(i) * (0.5 + rng());
  return { val, d: 0, mode: randomMode(rng), dur: 10 + Math.floor(rng() * 50), hist: [val], own: 0, paid: 0 };
}

export function freshMinigames() {
  return {
    deck: { ram: 0, casts: 0 },
    pantheon: { slots: [null, null, null], swaps: SWAP_MAX, swapT: Date.now() },
    market: { t: 0, profit: 0, stocks: STOCKS.map((_, i) => freshStock(i)) }
  };
}

export function sanitizeMinigames(raw) {
  const mg = freshMinigames();
  if (!raw || typeof raw !== "object") return mg;
  mg.deck.ram = num(raw.deck?.ram);
  mg.deck.casts = int(raw.deck?.casts);
  if (Array.isArray(raw.pantheon?.slots)) mg.pantheon.slots = [0, 1, 2].map((i) => (godById(raw.pantheon.slots[i]) ? raw.pantheon.slots[i] : null));
  mg.pantheon.slots = mg.pantheon.slots.map((id, i, arr) => (id && arr.indexOf(id) === i ? id : null));
  mg.pantheon.swaps = Math.min(SWAP_MAX, int(raw.pantheon?.swaps ?? SWAP_MAX));
  mg.pantheon.swapT = Math.min(num(raw.pantheon?.swapT, Date.now()), Date.now());
  mg.market.t = Math.min(num(raw.market?.t), MARKET_TICK);
  mg.market.profit = Number.isFinite(Number(raw.market?.profit)) ? Number(raw.market.profit) : 0;
  if (Array.isArray(raw.market?.stocks)) {
    STOCKS.forEach((_, i) => {
      const r = raw.market.stocks[i];
      if (!r || typeof r !== "object") return;
      const s = mg.market.stocks[i];
      s.val = Math.max(1, Math.min(num(r.val, s.val), 1e4));
      s.d = Math.max(-50, Math.min(50, Number(r.d) || 0));
      s.mode = MODES[r.mode] ? r.mode : s.mode;
      s.dur = int(r.dur) || s.dur;
      s.hist = Array.isArray(r.hist) ? r.hist.slice(-HIST).map((v) => Math.max(1, Math.min(num(v, s.val), 1e4))) : [s.val];
      s.own = Math.min(int(r.own), 1e6);
      s.paid = num(r.paid);
    });
  }
  return mg;
}

// Un pas de cotation (toutes les minutes).
export function stepMarket(market, rng = Math.random) {
  market.stocks.forEach((s, i) => {
    const rest = restingValue(i);
    s.val += (rest - s.val) * 0.01;
    s.d *= 0.97;
    s.d += (rng() - 0.5) * (s.mode === "stable" ? 0.1 : 0.3);
    if (s.mode === "rise") s.d += 0.05;
    if (s.mode === "fall") s.d -= 0.05;
    if (s.mode === "boom") { s.d += 0.15; if (rng() < 0.1) s.val += rng() * 5; }
    if (s.mode === "crash") { s.d -= 0.15; if (rng() < 0.1) s.val -= rng() * 5; }
    if (s.mode === "chaos") { s.d += (rng() - 0.5) * 1.2; if (rng() < 0.15) s.val += (rng() - 0.5) * 10; }
    s.val += s.d;
    if (rng() < 0.1) s.val += (rng() - 0.5) * 3;
    if (s.val < 5) { s.val += (5 - s.val) * 0.5; s.d *= 0.5; }
    s.val = Math.max(1, Math.min(s.val, 1e4));
    s.dur -= 1;
    if (s.dur <= 0) { s.mode = randomMode(rng); s.dur = 10 + Math.floor(rng() * 50); }
    s.hist.push(s.val);
    if (s.hist.length > HIST) s.hist.shift();
  });
}

// 1 $ vaut 1 seconde de production (sans les effets temporaires), comme dans Cookie Clicker.
export const dollarValue = (ck) => Math.max(1, perSecond(ck, Date.now(), false));
export const maxShares = (ck) => 100 + owned(ck, "bank");

// Prix (en données) de n actions, commission comprise.
export const sharesCost = (ck, i, n) => ck.mg.market.stocks[i].val * dollarValue(ck) * n * (1 + MARKET_FEE);
export const sharesValue = (ck, i, n) => ck.mg.market.stocks[i].val * dollarValue(ck) * n;

export function buyShares(ck, i, n) {
  const s = ck.mg.market.stocks[i];
  if (!s || !minigameUnlocked(ck, "market")) return 0;
  const room = maxShares(ck) - s.own;
  const unit = sharesCost(ck, i, 1);
  const count = Math.max(0, Math.min(n, room, Math.floor(ck.data / unit)));
  if (count < 1) return 0;
  const cost = unit * count;
  ck.data -= cost;
  s.paid += cost;
  s.own += count;
  return count;
}

export function sellShares(ck, i, n) {
  const s = ck.mg.market.stocks[i];
  if (!s) return 0;
  const count = Math.min(n, s.own);
  if (count < 1) return 0;
  const gain = sharesValue(ck, i, count);
  const basis = s.own ? (s.paid * count) / s.own : 0;
  s.paid -= basis;
  s.own -= count;
  ck.data = Math.min(MAX, ck.data + gain);
  ck.mg.market.profit += gain - basis;
  return count;
}

// Avance les mini-jeux (appelé par tick).
function tickMinigames(ck, ms, now) {
  const mg = ck.mg;
  const max = ramMax(ck);
  if (max) mg.deck.ram = Math.min(max, mg.deck.ram + (max / RAM_FILL_SECONDS) * (ms / 1000));
  else mg.deck.ram = 0;
  if (minigameUnlocked(ck, "market")) {
    mg.market.t += ms;
    while (mg.market.t >= MARKET_TICK) { mg.market.t -= MARKET_TICK; stepMarket(mg.market); }
  }
  pantheonSwaps(ck, now);
}
