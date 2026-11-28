// js/deck.js — « Grimoire Néon » : roguelite deckbuilder (façon Slay the Spire), logique pure (aucun accès au DOM).
// Univers : un réseau où se mêlent dieux anciens et cyberpunk. On choisit un héros, on gravit 3 actes
// (carte d'étages à embranchements), on construit son deck de cartes, on collectionne reliques et stims.
// Entre les parties, les éclats (❖) achètent des améliorations permanentes (méta-progression).
//
// Tout l'état d'une partie (run) est un simple objet JSON : il est sauvegardé tel quel et peut être repris.
// Les cartes, ennemis, reliques… sont décrits dans des tables ; le moteur de combat les interprète.

/* =====================================================================
   Hasard reproductible (l'état du générateur est stocké dans la partie)
===================================================================== */

export function rand(run) {
  // mulberry32
  let t = (run.seed = (run.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (run, a, b) => a + Math.floor(rand(run) * (b - a + 1));
const pick = (run, list) => list[Math.floor(rand(run) * list.length)];
function shuffle(run, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(run) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, up) => (Array.isArray(x) ? x[up ? 1 : 0] : x);

/* =====================================================================
   Héros
===================================================================== */

export const HEROES = [
  {
    id: "blade", name: "Rōnin du Réseau", short: "Rōnin", hp: 80, color: "#ff2a6d", relic: "katana", cost: 0,
    desc: "Guerrier au sabre monomoléculaire. Attaques lourdes, Force, bouclier et contre-attaques.",
    deck: ["strike", "strike", "strike", "strike", "strike", "guard", "guard", "guard", "guard", "cleave_b"]
  },
  {
    id: "techno", name: "Technomancienne", short: "Technomancienne", hp: 72, color: "#00e0ff", relic: "grimoire", cost: 150,
    desc: "Mage des flux. Brûlure qui ronge les ennemis, Gel qui affaiblit leurs coups, sorts de zone.",
    deck: ["strike", "strike", "strike", "strike", "guard", "guard", "guard", "guard", "spark", "frostrune"]
  },
  {
    id: "shadow", name: "Spectre", short: "Spectre", hp: 66, color: "#7dffb0", relic: "intrusion", cost: 300,
    desc: "Hacker de l'ombre. Virus qui s'accumulent, cartes à coût nul, pioche et lames de données.",
    deck: ["strike", "strike", "strike", "strike", "strike", "dodge", "dodge", "dodge", "dodge", "inject"]
  }
];
export const HERO_IDS = HEROES.map((h) => h.id);
export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

/* =====================================================================
   Effets (statuts)
===================================================================== */

// kind : buff (bonus) ou debuff (malus) — sert à l'affichage et à la purification
export const STATUS = {
  str:      { name: "Force", icon: "⚔", kind: "buff", text: (n) => `Les attaques infligent ${n} dégât${n > 1 ? "s" : ""} de plus.` },
  dex:      { name: "Dextérité", icon: "⛨", kind: "buff", text: (n) => `Le bouclier gagné par les cartes augmente de ${n}.` },
  thorns:   { name: "Épines", icon: "✹", kind: "buff", text: (n) => `Inflige ${n} dégâts à chaque attaquant.` },
  regen:    { name: "Régénération", icon: "✚", kind: "buff", text: (n) => `Soigne ${n} PV à la fin du tour, puis diminue de 1.` },
  ritual:   { name: "Rituel", icon: "☥", kind: "buff", text: (n) => `Gagne ${n} Force à la fin de chaque tour.` },
  vuln:     { name: "Vulnérable", icon: "◎", kind: "debuff", text: (n) => `Subit 50 % de dégâts en plus des attaques (${n} tour${n > 1 ? "s" : ""}).` },
  weak:     { name: "Affaibli", icon: "▽", kind: "debuff", text: (n) => `Les attaques infligent 25 % de dégâts en moins (${n} tour${n > 1 ? "s" : ""}).` },
  frail:    { name: "Fragile", icon: "◇", kind: "debuff", text: (n) => `Le bouclier gagné par les cartes est réduit de 25 % (${n} tour${n > 1 ? "s" : ""}).` },
  poison:   { name: "Virus", icon: "☣", kind: "debuff", text: (n) => `Perd ${n} PV au début du tour, puis diminue de 1.` },
  burn:     { name: "Brûlure", icon: "♨", kind: "debuff", text: (n) => `Perd ${n} PV à la fin du tour, puis diminue de moitié.` },
  gel:      { name: "Gel", icon: "❄", kind: "debuff", text: (n) => `Chaque coup porté inflige ${n} dégâts de moins. Diminue de 1 à la fin du tour.` },
  // pouvoirs du joueur (cartes « Pouvoir »)
  pRage:    { name: "Flux de combat", icon: "⟳", kind: "buff", text: (n) => `Chaque attaque jouée donne ${n} bouclier.` },
  pSamurai: { name: "Esprit du samouraï", icon: "⛩", kind: "buff", text: (n) => `Gagne ${n} Force au début de chaque tour.` },
  pFort:    { name: "Forteresse", icon: "▣", kind: "buff", text: () => "Le bouclier n'est plus retiré au début du tour." },
  pPyro:    { name: "Pyromancie", icon: "🜂", kind: "buff", text: (n) => `La Brûlure appliquée augmente de ${n}.` },
  pCryo:    { name: "Cryostase", icon: "❅", kind: "buff", text: (n) => `Gagne ${n} bouclier à la fin du tour.` },
  pIce:     { name: "Ère glaciaire", icon: "❆", kind: "buff", text: (n) => `Applique ${n} Gel à tous les ennemis au début du tour.` },
  pMage:    { name: "Archimage", icon: "✶", kind: "buff", text: (n) => `Gagne ${n} énergie au début de chaque tour.` },
  pBotnet:  { name: "Botnet", icon: "⌘", kind: "buff", text: (n) => `Applique ${n} Virus à tous les ennemis au début du tour.` },
  pCorrupt: { name: "Corruption", icon: "☠", kind: "buff", text: (n) => `Le Virus appliqué augmente de ${n}.` },
  pShadows: { name: "Ombres multiples", icon: "⚚", kind: "buff", text: (n) => `Ajoute ${n} Lame${n > 1 ? "s" : ""} de données à la main au début du tour.` },
  pFlame:   { name: "Cœur ardent", icon: "✺", kind: "buff", text: (n) => `Chaque Compétence jouée applique ${n} Brûlure à tous les ennemis.` },
  pEcho:    { name: "Méditation", icon: "☯", kind: "buff", text: (n) => `Pioche ${n} carte${n > 1 ? "s" : ""} de plus chaque tour.` }
};
const DECAY_1 = ["vuln", "weak", "frail"];   // diminuent de 1 à la fin du tour de leur porteur

/* =====================================================================
   Cartes
   ops : liste d'effets joués dans l'ordre. Les valeurs [a, b] = [normale, améliorée].
   target : enemy (un ennemi à choisir) · all (tous) · self · random (un ennemi au hasard par coup)
===================================================================== */

const RAW_CARDS = [];
function C(id, name, hero, type, rarity, cost, target, ops, extra = {}) {
  RAW_CARDS.push({ id, name, hero, type, rarity, cost, target, ops, ...extra });
}

// ---- Communes à tous (deck de départ) ----
C("strike", "Frappe", "any", "attack", "starter", 1, "enemy", [{ dmg: [6, 9] }]);
C("guard", "Parade", "any", "skill", "starter", 1, "self", [{ block: [5, 8] }]);
C("dodge", "Esquive", "any", "skill", "starter", 1, "self", [{ block: [5, 8] }]);

// ---- Rōnin du Réseau ----
C("cleave_b", "Lame fendante", "blade", "attack", "starter", 2, "enemy", [{ dmg: [8, 10] }, { apply: { vuln: [2, 3] } }]);
C("twin", "Coup double", "blade", "attack", "common", 1, "enemy", [{ dmg: [5, 7], times: 2 }]);
C("sweep", "Balayage", "blade", "attack", "common", 1, "all", [{ dmgAll: [8, 11] }]);
C("stance", "Posture haute", "blade", "skill", "common", 1, "self", [{ block: [7, 10] }, { draw: 1 }]);
C("jab", "Estoc", "blade", "attack", "common", 0, "enemy", [{ dmg: [4, 6] }]);
C("charge", "Charge brutale", "blade", "attack", "common", 2, "enemy", [{ dmg: [14, 19] }]);
C("riposte", "Riposte", "blade", "attack", "common", 1, "enemy", [{ block: [5, 7] }, { dmg: [5, 7] }]);
C("kiai", "Kiai", "blade", "skill", "common", 1, "self", [{ self: { str: [2, 3] } }], { exhaust: true });
C("hotblade", "Lame chauffée", "blade", "attack", "common", 1, "enemy", [{ dmg: [7, 9] }, { apply: { weak: [1, 2] } }]);
C("steelstorm", "Tempête d'acier", "blade", "attack", "uncommon", 1, "random", [{ dmg: [3, 4], times: 4 }]);
C("barrier", "Barrière cinétique", "blade", "skill", "uncommon", 2, "self", [{ block: [16, 21] }]);
C("thornsuit", "Contre-attaque", "blade", "power", "uncommon", 1, "self", [{ self: { thorns: [3, 5] } }]);
C("combatflow", "Flux de combat", "blade", "power", "uncommon", 1, "self", [{ self: { pRage: [2, 3] } }]);
C("execute", "Exécution", "blade", "attack", "uncommon", 2, "enemy", [{ special: "execute", dmg: [12, 16] }]);
C("quake", "Impact sismique", "blade", "attack", "uncommon", 2, "all", [{ dmgAll: [11, 15] }, { applyAll: { vuln: 1 } }]);
C("shieldbash", "Coup de bouclier", "blade", "attack", "uncommon", [1, 0], "enemy", [{ special: "blockDmg" }]);
C("secondwind", "Second souffle", "blade", "skill", "uncommon", 1, "self", [{ draw: [2, 3] }, { energy: 1 }], { exhaust: true });
C("warcry", "Cri de guerre", "blade", "skill", "uncommon", 0, "all", [{ applyAll: { weak: [1, 2] } }, { draw: 1 }], { exhaust: true });
C("samurai", "Esprit du samouraï", "blade", "power", "rare", [3, 2], "self", [{ self: { pSamurai: 1 } }]);
C("judgment", "Lame du jugement", "blade", "attack", "rare", 3, "enemy", [{ dmg: [32, 42] }]);
C("fortress", "Forteresse", "blade", "power", "rare", [2, 1], "self", [{ self: { pFort: 1 } }]);
C("thousand", "Mille lames", "blade", "attack", "rare", 2, "random", [{ dmg: [2, 3], times: 8 }]);
C("berserk", "Berserk", "blade", "skill", "rare", 0, "self", [{ loseHp: 3 }, { energy: [2, 3] }]);
C("titan", "Force du titan", "blade", "skill", "rare", 1, "self", [{ special: "doubleStr" }], { exhaust: [true, false] });
C("bladewall", "Rempart d'acier", "blade", "skill", "uncommon", 1, "self", [{ block: [6, 9] }, { self: { thorns: 2 } }], { arch: 1 });
C("ironwill", "Volonté de fer", "blade", "skill", "common", 1, "self", [{ block: [6, 9] }, { self: { str: 1 } }], { arch: 1 });
C("bloodlust", "Soif de sang", "blade", "attack", "uncommon", 1, "enemy", [{ dmg: [8, 11] }, { special: "lifesteal" }], { arch: 2 });
C("ragnarok", "Ragnarök", "blade", "attack", "rare", 3, "random", [{ dmg: [5, 6], times: 5 }, { self: { str: 1 } }], { arch: 2 });
C("unbreakable", "Inébranlable", "blade", "skill", "rare", 2, "self", [{ block: [20, 26] }, { self: { dex: 1 } }], { exhaust: true, arch: 3 });
C("onslaught", "Assaut sans fin", "blade", "attack", "uncommon", 1, "enemy", [{ dmg: [6, 8] }, { draw: 1 }, { special: "freeIfAttack" }], { arch: 3 });

// ---- Technomancienne ----
C("spark", "Étincelle", "techno", "attack", "starter", 1, "enemy", [{ dmg: [4, 6] }, { apply: { burn: [3, 4] } }]);
C("frostrune", "Rune de givre", "techno", "attack", "starter", 1, "enemy", [{ dmg: [4, 6] }, { apply: { gel: [2, 3] } }]);
C("fireball", "Boule de feu", "techno", "attack", "common", 1, "enemy", [{ dmg: [7, 9] }, { apply: { burn: [2, 3] } }]);
C("chain", "Éclair en chaîne", "techno", "attack", "common", 1, "all", [{ dmgAll: [5, 7] }]);
C("icewall", "Mur de glace", "techno", "skill", "common", 1, "all", [{ block: [7, 10] }, { applyAll: { gel: 1 } }]);
C("combust", "Combustion", "techno", "skill", "common", 0, "enemy", [{ apply: { burn: [3, 5] } }]);
C("scan", "Lecture du code", "techno", "skill", "common", 1, "self", [{ draw: [2, 3] }]);
C("arcshield", "Bouclier arcanique", "techno", "skill", "common", 1, "self", [{ block: [6, 9] }, { draw: 1 }]);
C("icespike", "Pic de glace", "techno", "attack", "common", 1, "enemy", [{ dmg: [8, 11] }, { apply: { gel: [2, 3] } }]);
C("beam", "Rayon prismatique", "techno", "attack", "common", 2, "enemy", [{ dmg: [15, 20] }]);
C("inferno", "Inferno", "techno", "skill", "uncommon", 2, "all", [{ applyAll: { burn: [4, 6] } }]);
C("absolute", "Zéro absolu", "techno", "skill", "uncommon", 2, "all", [{ applyAll: { gel: [3, 4] } }, { block: [8, 11] }]);
C("pyro", "Pyromancie", "techno", "power", "uncommon", 1, "self", [{ self: { pPyro: [1, 2] } }]);
C("cryo", "Cryostase", "techno", "power", "uncommon", 1, "self", [{ self: { pCryo: [3, 5] } }]);
C("ignite", "Embrasement", "techno", "skill", "uncommon", [1, 0], "enemy", [{ special: "doubleBurn" }]);
C("fission", "Fission", "techno", "skill", "uncommon", 0, "self", [{ energy: [2, 3] }], { exhaust: true });
C("manastorm", "Tempête de mana", "techno", "attack", "uncommon", 2, "random", [{ dmg: [3, 4], times: 5 }, { applyRandom: { burn: 1 }, times: 5 }]);
C("drain", "Drain d'âme", "techno", "attack", "uncommon", 1, "enemy", [{ dmg: [6, 9] }, { heal: [3, 4] }]);
C("meteor", "Météore", "techno", "attack", "rare", 3, "enemy", [{ dmg: [30, 38] }, { apply: { burn: [6, 8] } }]);
C("apocalypse", "Apocalypse", "techno", "attack", "rare", 2, "all", [{ special: "apocalypse", mult: [3, 4] }], { exhaust: true });
C("iceage", "Ère glaciaire", "techno", "power", "rare", [3, 2], "self", [{ self: { pIce: 2 } }]);
C("archmage", "Archimage", "techno", "power", "rare", [3, 2], "self", [{ self: { pMage: 1 } }]);
C("phoenix", "Renaissance du phénix", "techno", "skill", "rare", 2, "all", [{ heal: [10, 14] }, { applyAll: { burn: [5, 7] } }], { exhaust: true });
C("flameheart", "Cœur ardent", "techno", "power", "uncommon", 1, "self", [{ self: { pFlame: [1, 2] } }], { arch: 1 });
C("frostnova", "Nova de givre", "techno", "attack", "common", 1, "all", [{ dmgAll: [4, 6] }, { applyAll: { gel: 1 } }], { arch: 1 });
C("overload", "Surcharge", "techno", "attack", "uncommon", 1, "enemy", [{ special: "burnHit", dmg: [5, 7] }], { arch: 2 });
C("blizzard", "Blizzard", "techno", "attack", "rare", 3, "all", [{ dmgAll: [12, 16] }, { applyAll: { gel: [3, 4] } }, { applyAll: { weak: 1 } }], { arch: 2 });
C("timewarp", "Distorsion temporelle", "techno", "skill", "rare", 2, "self", [{ draw: [3, 4] }, { energy: 2 }], { exhaust: true, arch: 3 });
C("supernova", "Supernova", "techno", "attack", "rare", 3, "all", [{ dmgAll: [18, 24] }, { applyAll: { burn: [5, 7] } }], { arch: 3 });

// ---- Spectre ----
C("inject", "Injection", "shadow", "attack", "starter", 1, "enemy", [{ dmg: [3, 4] }, { apply: { poison: [4, 6] } }]);
C("venomblade", "Lame empoisonnée", "shadow", "attack", "common", 1, "enemy", [{ dmg: [4, 6] }, { apply: { poison: [3, 4] } }]);
C("knives", "Lancer de couteaux", "shadow", "attack", "common", 1, "enemy", [{ dmg: [3, 4], times: 3 }]);
C("shadowstep", "Pas de l'ombre", "shadow", "skill", "common", 1, "self", [{ block: [8, 11] }, { draw: 1 }]);
C("toxcloud", "Nuage toxique", "shadow", "skill", "common", 1, "all", [{ applyAll: { poison: [3, 4] } }]);
C("quickcut", "Coupe rapide", "shadow", "attack", "common", 0, "enemy", [{ dmg: [4, 6] }, { draw: 1 }]);
C("prepare", "Préparation", "shadow", "skill", "common", 0, "self", [{ draw: [2, 3] }], { exhaust: true });
C("feint", "Feinte", "shadow", "skill", "common", 1, "enemy", [{ apply: { weak: [2, 3] } }, { block: [6, 8] }]);
C("lowblow", "Coup bas", "shadow", "attack", "common", 1, "enemy", [{ dmg: [9, 12] }, { apply: { vuln: 1 } }]);
C("catalyst", "Catalyseur", "shadow", "skill", "uncommon", 1, "enemy", [{ special: "multPoison", mult: [2, 3] }], { exhaust: true });
C("botnet", "Botnet", "shadow", "power", "uncommon", 2, "self", [{ self: { pBotnet: [1, 2] } }]);
C("reflexes", "Réflexes", "shadow", "power", "uncommon", 1, "self", [{ self: { dex: [2, 3] } }]);
C("acrobat", "Acrobatie", "shadow", "skill", "uncommon", 1, "self", [{ draw: [3, 4] }]);
C("forge", "Fabrique de lames", "shadow", "skill", "uncommon", 1, "self", [{ addCard: "shiv", n: [3, 4] }]);
C("sabotage", "Sabotage", "shadow", "skill", "uncommon", 1, "enemy", [{ apply: { weak: [2, 3], vuln: [2, 3] } }]);
C("smoke", "Fumigène", "shadow", "skill", "uncommon", 2, "all", [{ block: [12, 16] }, { applyAll: { weak: 1 } }]);
C("plague", "Peste numérique", "shadow", "skill", "rare", [3, 2], "all", [{ applyAll: { poison: 9 } }]);
C("assassin", "Exécution silencieuse", "shadow", "attack", "rare", 2, "enemy", [{ special: "killEnergy", dmg: [24, 30] }]);
C("shadows", "Ombres multiples", "shadow", "power", "rare", [2, 1], "self", [{ self: { pShadows: 1 } }]);
C("corruption", "Corruption", "shadow", "power", "rare", 1, "self", [{ self: { pCorrupt: [2, 3] } }]);
C("glitch", "Glitch", "shadow", "skill", "rare", 0, "self", [{ energy: 2 }, { draw: [2, 3] }], { exhaust: true });
C("envenom", "Envenimer", "shadow", "attack", "uncommon", 1, "random", [{ dmg: [2, 3], times: 4 }, { applyRandom: { poison: 1 }, times: 4 }], { arch: 1 });
C("vanish", "Disparition", "shadow", "skill", "common", 0, "self", [{ block: [4, 6] }], { arch: 1 });
C("bladefan", "Éventail de lames", "shadow", "attack", "uncommon", 1, "all", [{ dmgAll: [4, 6] }, { addCard: "shiv", n: 1 }], { arch: 2 });
C("deathmark", "Marque de mort", "shadow", "skill", "rare", 1, "enemy", [{ apply: { poison: [8, 11], vuln: 2 } }], { exhaust: true, arch: 2 });
C("phantom", "Fantôme", "shadow", "skill", "rare", 2, "self", [{ block: [10, 14] }, { self: { dex: 2 } }], { exhaust: true, arch: 3 });
C("overdose", "Surdose", "shadow", "attack", "rare", 2, "enemy", [{ special: "poisonBurst", mult: [1, 2] }], { arch: 3 });

// ---- Neutres (récompenses rares, boutique, événements) ----
C("stim", "Stimpack", "neutral", "skill", "uncommon", 0, "self", [{ heal: [4, 7] }], { exhaust: true });
C("flash", "Flash", "neutral", "skill", "common", 0, "self", [{ draw: [1, 2] }]);
C("blessing", "Bénédiction", "neutral", "skill", "rare", 1, "self", [{ self: { str: 1, dex: 1 } }], { exhaust: [true, false] });
C("purify", "Purification", "neutral", "skill", "uncommon", 1, "self", [{ special: "cleanse" }, { block: [5, 8] }]);
C("emp", "Grenade EMP", "neutral", "attack", "uncommon", 1, "all", [{ dmgAll: [8, 12] }], { exhaust: true });
C("prayer", "Prière", "neutral", "skill", "rare", 1, "self", [{ heal: [6, 9] }, { draw: 1 }], { exhaust: true });
C("overclock", "Overclock", "neutral", "skill", "uncommon", 0, "self", [{ energy: [2, 3] }, { addCard: "burnout", n: 1, to: "draw" }]);
C("meditate", "Méditation", "neutral", "power", "rare", [2, 1], "self", [{ self: { pEcho: 1 } }]);
C("swift", "Lame éclair", "neutral", "attack", "common", 0, "enemy", [{ dmg: [3, 5] }, { draw: 1 }], { exhaust: true });

// ---- Spéciales : jetons et malédictions (jamais proposées en récompense) ----
C("shiv", "Lame de données", "token", "attack", "special", 0, "enemy", [{ dmg: [4, 6] }], { exhaust: true });
C("burnout", "Surchauffe", "curse", "status", "special", -1, "self", [], { unplayable: true, endHand: { loseHp: 2 }, text: "Injouable. Fin du tour (en main) : perds 2 PV. Disparaît en fin de combat." , temp: true });
C("wound", "Blessure", "curse", "curse", "special", -1, "self", [], { unplayable: true, text: "Injouable." });
C("doubt", "Doute", "curse", "curse", "special", -1, "self", [], { unplayable: true, endHand: { self: { weak: 1 } }, text: "Injouable. Fin du tour (en main) : tu es Affaibli 1 tour." });
C("glitched", "Données corrompues", "curse", "curse", "special", -1, "self", [], { unplayable: true, endHand: { loseHp: 3 }, text: "Injouable. Fin du tour (en main) : perds 3 PV." });

export const CARDS = Object.fromEntries(RAW_CARDS.map((c) => [c.id, c]));
export const CARD_IDS = RAW_CARDS.map((c) => c.id);
export const cardById = (id) => CARDS[id] || CARDS.strike;
export const RARITY = { starter: "Base", common: "Commune", uncommon: "Peu commune", rare: "Rare", special: "Spéciale" };
export const TYPE_NAME = { attack: "Attaque", skill: "Compétence", power: "Pouvoir", curse: "Malédiction", status: "État" };

// Une carte du deck : { id, up } (up = améliorée)
export const cardCost = (c) => {
  const def = cardById(c.id);
  return V(def.cost, c.up);
};
export const cardName = (c) => `${cardById(c.id).name}${c.up ? "+" : ""}`;
export const canUpgrade = (c) => !c.up && !["curse", "token"].includes(cardById(c.id).hero) && cardById(c.id).type !== "status";

/* =====================================================================
   Textes des cartes (avec les valeurs réelles en combat si on donne l'état)
===================================================================== */

const STATUS_WORD = (k, n) => {
  const s = STATUS[k];
  return `${n} ${s.name}`;
};

// p : combattant joueur (pour la Force / Dextérité / Faiblesse), t : cible (Vulnérable…), run : reliques
export function cardText(card, p = null, t = null, run = null) {
  const def = cardById(card.id);
  if (def.text) return def.text;
  const up = card.up;
  const parts = [];
  const dmgOf = (base) => (p ? calcDamage(base, p, t, run) : base);
  const blkOf = (base) => (p ? calcBlock(base, p) : base);
  for (const op of def.ops) {
    const times = V(op.times, up) || 1;
    if (op.special) {
      const d = V(op.dmg, up);
      const m = V(op.mult, up);
      switch (op.special) {
        case "execute": parts.push(`Inflige ${dmgOf(d)} dégâts, le double si l'ennemi a moins de la moitié de ses PV.`); break;
        case "blockDmg": parts.push(`Inflige des dégâts égaux à ton bouclier${p ? ` (${dmgOf(p.block)})` : ""}.`); break;
        case "doubleBurn": parts.push("Double la Brûlure de l'ennemi."); break;
        case "apocalypse": parts.push(`Chaque ennemi subit ${m} fois sa Brûlure en dégâts.`); break;
        case "killEnergy": parts.push(`Inflige ${dmgOf(d)} dégâts. S'il meurt, gagne 2 énergie.`); break;
        case "multPoison": parts.push(`Multiplie le Virus de l'ennemi par ${m}.`); break;
        case "cleanse": parts.push("Retire tous tes malus."); break;
        case "doubleStr": parts.push("Double ta Force."); break;
        case "lifesteal": parts.push("Soigne la moitié des PV retirés."); break;
        case "freeIfAttack": parts.push("Coûte 0 si tu as déjà joué une attaque ce tour."); break;
        case "burnHit": parts.push(`Inflige ${dmgOf(d)} dégâts, plus la Brûlure de l'ennemi.`); break;
        case "poisonBurst": parts.push(`Inflige ${m > 1 ? `${m} fois ` : ""}le Virus de l'ennemi en dégâts.`); break;
        default: break;
      }
      continue;
    }
    if (op.dmg !== undefined) {
      const d = dmgOf(V(op.dmg, up));
      parts.push(def.target === "random"
        ? `Inflige ${d} dégâts${times > 1 ? ` ${times} fois` : ""} à un ennemi au hasard.`
        : `Inflige ${d} dégâts${times > 1 ? ` ${times} fois` : ""}.`);
    }
    if (op.dmgAll !== undefined) parts.push(`Inflige ${dmgOf(V(op.dmgAll, up))} dégâts à tous les ennemis${times > 1 ? ` ${times} fois` : ""}.`);
    if (op.block !== undefined) parts.push(`Gagne ${blkOf(V(op.block, up))} bouclier.`);
    if (op.draw !== undefined) { const n = V(op.draw, up); parts.push(`Pioche ${n} carte${n > 1 ? "s" : ""}.`); }
    if (op.energy !== undefined) parts.push(`Gagne ${V(op.energy, up)} énergie.`);
    if (op.heal !== undefined) parts.push(`Soigne ${V(op.heal, up)} PV.`);
    if (op.loseHp !== undefined) parts.push(`Perds ${V(op.loseHp, up)} PV.`);
    if (op.apply) parts.push(`Applique ${Object.entries(op.apply).map(([k, n]) => STATUS_WORD(k, applied(k, V(n, up), p))).join(" et ")}.`);
    if (op.applyAll) parts.push(`Applique ${Object.entries(op.applyAll).map(([k, n]) => STATUS_WORD(k, applied(k, V(n, up), p))).join(" et ")} à tous les ennemis.`);
    if (op.applyRandom) parts.push(`Applique ${Object.entries(op.applyRandom).map(([k, n]) => STATUS_WORD(k, applied(k, V(n, up), p))).join(" et ")} à chaque coup.`);
    if (op.self) {
      for (const [k, n] of Object.entries(op.self)) {
        const v = V(n, up);
        if (k.startsWith("p")) parts.push(STATUS[k].text(v));
        else parts.push(`Gagne ${STATUS_WORD(k, v)}.`);
      }
    }
    if (op.addCard) { const n = V(op.n, up); parts.push(`Ajoute ${n} ${cardById(op.addCard).name}${n > 1 ? "s" : ""} ${op.to === "draw" ? "à ta pioche" : "à ta main"}.`); }
  }
  if (V(def.exhaust, up)) parts.push("Épuiser.");
  if (def.ethereal) parts.push("Éphémère.");
  return parts.join(" ");
}

/* =====================================================================
   Reliques
===================================================================== */

export const RELICS = [
  // de départ
  { id: "katana", name: "Katana monomoléculaire", tier: "starter", icon: "⚔", text: "Fin de combat : soigne 6 PV." },
  { id: "grimoire", name: "Grimoire quantique", tier: "starter", icon: "📖", text: "Début de combat : pioche 2 cartes de plus." },
  { id: "intrusion", name: "Kit d'intrusion", tier: "starter", icon: "⌁", text: "Début de combat : +1 énergie et 2 Virus à tous les ennemis." },
  // communes
  { id: "anchor", name: "Pierre d'ancrage", tier: "common", icon: "⚓", text: "+10 PV max." },
  { id: "battery", name: "Batterie de secours", tier: "common", icon: "🔋", text: "Premier tour de chaque combat : +1 énergie." },
  { id: "lantern", name: "Lanterne spectrale", tier: "common", icon: "🏮", text: "Premier tour de chaque combat : pioche 2 cartes de plus." },
  { id: "plating", name: "Plaque de blindage", tier: "common", icon: "▤", text: "Début de combat : gagne 10 bouclier." },
  { id: "leech", name: "Sangsue numérique", tier: "common", icon: "🩸", text: "Fin de combat : soigne 3 PV." },
  { id: "dice", name: "Dé truqué", tier: "common", icon: "🎲", text: "Les récompenses proposent 4 cartes au lieu de 3." },
  { id: "purse", name: "Bourse sans fond", tier: "common", icon: "👛", text: "+25 % d'or gagné." },
  { id: "spikes", name: "Bouclier miroir", tier: "common", icon: "✹", text: "Début de combat : gagne 3 Épines." },
  { id: "vial", name: "Fiole virale", tier: "common", icon: "⚗", text: "Début de combat : applique 2 Virus à tous les ennemis." },
  { id: "ember", name: "Braise éternelle", tier: "common", icon: "♨", text: "Début de combat : applique 2 Brûlure à tous les ennemis." },
  { id: "gauntlet", name: "Gantelet du titan", tier: "common", icon: "✊", text: "Début de combat : gagne 1 Force." },
  { id: "boots", name: "Bottes ailées", tier: "common", icon: "👢", text: "Début de combat : gagne 1 Dextérité." },
  { id: "chalice", name: "Calice sacré", tier: "common", icon: "🍷", text: "Les feux de camp soignent 15 PV de plus." },
  { id: "belt", name: "Ceinture d'alchimiste", tier: "common", icon: "⛓", text: "+1 emplacement de stim." },
  // peu communes
  { id: "kunai", name: "Kunai", tier: "uncommon", icon: "🗡", text: "Toutes les 3 attaques jouées dans un tour : +1 Dextérité." },
  { id: "shuriken", name: "Shuriken", tier: "uncommon", icon: "✴", text: "Toutes les 3 attaques jouées dans un tour : +1 Force." },
  { id: "orichalcum", name: "Orichalque", tier: "uncommon", icon: "⬢", text: "Fin de tour sans bouclier : gagne 6 bouclier." },
  { id: "jade", name: "Talisman de jade", tier: "uncommon", icon: "♢", text: "Chaque Pouvoir joué : pioche 1 carte." },
  { id: "blade2", name: "Lame d'appoint", tier: "uncommon", icon: "⚚", text: "Début de combat : applique 1 Vulnérable à tous les ennemis." },
  { id: "nails", name: "Ongles d'acier", tier: "uncommon", icon: "☣", text: "Le Virus et la Brûlure appliqués augmentent de 1." },
  { id: "vip", name: "Carte VIP", tier: "uncommon", icon: "💳", text: "Boutique : -20 % sur tout." },
  { id: "pen", name: "Plume de cristal", tier: "uncommon", icon: "✒", text: "Toutes les 10 attaques, la suivante inflige double dégâts." },
  // rares
  { id: "phoenixf", name: "Plume de phénix", tier: "rare", icon: "🪶", text: "Une fois : à la mort, reviens avec 50 % de tes PV." },
  { id: "lens", name: "Lentille de vérité", tier: "rare", icon: "🔍", text: "Les ennemis Vulnérables subissent 75 % de dégâts en plus (au lieu de 50 %)." },
  { id: "torii", name: "Torii", tier: "rare", icon: "⛩", text: "Les coups de 5 dégâts ou moins que tu subis sont réduits à 1." },
  { id: "halo", name: "Auréole", tier: "rare", icon: "◯", text: "Début de chaque tour : gagne 3 bouclier." },
  { id: "codex", name: "Codex interdit", tier: "rare", icon: "📕", text: "Début de combat : ajoute une carte rare aléatoire de ta classe à ta main (elle coûte 0 ce combat)." },
  // de boss (puissantes, parfois avec un défaut)
  { id: "core", name: "Cœur de dragon", tier: "boss", icon: "🐉", text: "+1 énergie par tour. Les ennemis ont 10 % de PV en plus." },
  { id: "cloak", name: "Cape d'ombre", tier: "boss", icon: "🦇", text: "+1 énergie par tour. Pioche 1 carte de moins." },
  { id: "eye", name: "Œil du hacker", tier: "boss", icon: "👁", text: "Pioche 1 carte de plus chaque tour." },
  { id: "crown", name: "Couronne du serment", tier: "boss", icon: "👑", text: "+1 énergie par tour. Les feux de camp ne soignent plus." },
  { id: "hourglass", name: "Sablier céleste", tier: "boss", icon: "⌛", text: "Tu gardes ta main d'un tour à l'autre (jusqu'à 10 cartes)." },
  { id: "pandora", name: "Boîte de Pandore", tier: "boss", icon: "🎁", text: "Transforme toutes tes Frappes et Parades en cartes aléatoires de ta classe." },
  { id: "wings", name: "Ailes de séraphin", tier: "boss", icon: "🕊", text: "+15 PV max et soigne tous tes PV." }
];
export const RELIC_IDS = RELICS.map((r) => r.id);
export const relicById = (id) => RELICS.find((r) => r.id === id);
export const has = (run, id) => run.relics.includes(id);

/* =====================================================================
   Stims (potions) : utilisables en combat (le soin aussi hors combat)
===================================================================== */

export const POTIONS = [
  { id: "fire", name: "Stim incendiaire", icon: "🔥", color: "#ff6a3d", target: "enemy", text: "Inflige 20 dégâts à un ennemi." },
  { id: "shield", name: "Stim de blindage", icon: "🛡", color: "#5aa9ff", target: "self", text: "Gagne 12 bouclier." },
  { id: "strength", name: "Élixir du titan", icon: "💪", color: "#ff2a6d", target: "self", text: "Gagne 2 Force." },
  { id: "agility", name: "Élixir d'agilité", icon: "🌀", color: "#7dffb0", target: "self", text: "Gagne 2 Dextérité." },
  { id: "energy", name: "Cellule d'énergie", icon: "⚡", color: "#fcee0a", target: "self", text: "Gagne 2 énergie." },
  { id: "heal", name: "Nano-soin", icon: "✚", color: "#9fff9f", target: "self", text: "Soigne 25 % de tes PV max.", anywhere: true },
  { id: "swift", name: "Stim de vitesse", icon: "➶", color: "#c38bff", target: "self", text: "Pioche 3 cartes." },
  { id: "toxin", name: "Fiole de toxine", icon: "☣", color: "#9be76a", target: "enemy", text: "Applique 7 Virus." },
  { id: "frost", name: "Fiole de givre", icon: "❄", color: "#9be7ff", target: "all", text: "Applique 3 Gel et 1 Affaibli à tous les ennemis." },
  { id: "fear", name: "Fiole d'effroi", icon: "☾", color: "#b06bff", target: "enemy", text: "Applique 3 Vulnérable." }
];
export const POTION_IDS = POTIONS.map((p) => p.id);
export const potionById = (id) => POTIONS.find((p) => p.id === id);
export const potionSlots = (run) => 2 + (has(run, "belt") ? 1 : 0) + (run.bonusSlots || 0);

/* =====================================================================
   Ennemis
   moves : { clé: { name, intent, ops } } — ops : dmg/times, block, self (statuts sur soi), apply (sur le joueur),
           heal, summon, addCard (malédiction dans le deck du joueur pour ce combat)
   ai(e, turn) : renvoie la clé du prochain coup (e.last = dernier coup joué)
===================================================================== */

const E = {};
function enemy(id, name, act, tier, hp, art, moves, ai, extra = {}) {
  E[id] = { id, name, act, tier, hp, art, moves, ai, ...extra };
}
const cycle = (...keys) => (e, turn) => keys[turn % keys.length];
// Choix pondéré au hasard, sans jouer 3 fois de suite le même coup
const weighted = (table) => (e, turn, r) => {
  const opts = table.filter(([k]) => !(e.last === k && e.last2 === k));
  const total = opts.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of opts) { x -= w; if (x <= 0) return k; }
  return opts[0][0];
};

// ---- Acte 1 : les Catacombes néon ----
enemy("drone", "Drone sentinelle", 1, "normal", [20, 24], { kind: "drone", c1: "#5aa9ff", c2: "#ff2a6d" },
  { zap: { name: "Décharge", intent: "attack", ops: [{ dmg: 7 }] }, guard: { name: "Repli", intent: "defend", ops: [{ block: 6 }, { dmg: 3 }] } },
  weighted([["zap", 60], ["guard", 40]]));
enemy("rat", "Rat cybernétique", 1, "normal", [12, 15], { kind: "rat", c1: "#8a8f9e", c2: "#ff2a6d" },
  { bite: { name: "Morsure", intent: "attack", ops: [{ dmg: 5 }] }, gnaw: { name: "Grignotage", intent: "attackDebuff", ops: [{ dmg: 3 }, { apply: { weak: 1 } }] } },
  weighted([["bite", 65], ["gnaw", 35]]));
enemy("slime", "Slime viral", 1, "normal", [28, 32], { kind: "slime", c1: "#7dff6a", c2: "#2a8a3a" },
  { tackle: { name: "Écrasement", intent: "attack", ops: [{ dmg: 9 }] }, spit: { name: "Crachat viral", intent: "attackDebuff", ops: [{ dmg: 4 }, { apply: { poison: 3 } }] } },
  weighted([["tackle", 50], ["spit", 50]]));
enemy("ghoul", "Goule chromée", 1, "normal", [40, 45], { kind: "ghoul", c1: "#b8bcc8", c2: "#7a2a8a" },
  { roar: { name: "Hurlement", intent: "buff", ops: [{ self: { str: 2 } }, { block: 5 }] }, claw: { name: "Griffes", intent: "attack", ops: [{ dmg: 8 }] } },
  (e, turn) => (turn % 3 === 0 ? "roar" : "claw"));
enemy("cultist", "Cultiste néon", 1, "normal", [46, 52], { kind: "cultist", c1: "#b06bff", c2: "#fcee0a" },
  { incant: { name: "Incantation", intent: "buff", ops: [{ self: { ritual: 3 } }] }, slash: { name: "Lame sacrée", intent: "attack", ops: [{ dmg: 6 }] } },
  (e, turn) => (turn === 0 ? "incant" : "slash"));
enemy("hexer", "Sorcier du réseau", 1, "normal", [26, 30], { kind: "mage", c1: "#00e0ff", c2: "#3a2a8a" },
  { hex: { name: "Maléfice", intent: "debuff", ops: [{ apply: { vuln: 2, weak: 1 } }] }, bolt: { name: "Trait d'énergie", intent: "attack", ops: [{ dmg: 10 }] } },
  cycle("hex", "bolt", "bolt"));
// élites
enemy("knight", "Chevalier déchu", 1, "elite", [80, 86], { kind: "knight", c1: "#6a6f85", c2: "#ff2a6d" },
  { smash: { name: "Coup d'estoc", intent: "attack", ops: [{ dmg: 14 }] }, shield: { name: "Garde de fer", intent: "defend", ops: [{ block: 12 }, { self: { str: 2 } }] }, rend: { name: "Fente", intent: "attack", ops: [{ dmg: 6, times: 2 }] } },
  cycle("smash", "shield", "rend"));
enemy("hydra", "Hydre de code", 1, "elite", [70, 76], { kind: "hydra", c1: "#2ad870", c2: "#fcee0a" },
  { bites: { name: "Morsures", intent: "attack", ops: [{ dmg: 4, times: 3 }] }, venom: { name: "Venin", intent: "attackDebuff", ops: [{ dmg: 7 }, { apply: { poison: 4 } }] }, grow: { name: "Régénération", intent: "buff", ops: [{ self: { regen: 5, str: 1 } }] } },
  cycle("bites", "venom", "grow"));
enemy("golem", "Gardien d'obsidienne", 1, "elite", [92, 98], { kind: "golem", c1: "#3a3f55", c2: "#ff8a3d" },
  { slam: { name: "Poing de lave", intent: "attack", ops: [{ dmg: 16 }] }, harden: { name: "Carapace", intent: "defend", ops: [{ block: 15 }, { self: { thorns: 2 } }] } },
  cycle("harden", "slam", "slam"));
// boss
enemy("archon", "L'Archon de cristal", 1, "boss", [140, 140], { kind: "archon", c1: "#9be7ff", c2: "#b06bff" },
  {
    prism: { name: "Prisme", intent: "attack", ops: [{ dmg: 5, times: 3 }] },
    crystal: { name: "Cristallisation", intent: "defend", ops: [{ block: 16 }, { self: { str: 2 } }] },
    beam: { name: "Rayon divin", intent: "attack", ops: [{ dmg: 18 }] },
    shards: { name: "Éclats", intent: "summon", ops: [{ summon: "shardling" }, { summon: "shardling" }] }
  },
  (e, turn) => ["shards", "prism", "crystal", "beam", "prism", "beam"][turn % 6]);
enemy("shardling", "Éclat de cristal", 1, "minion", [12, 14], { kind: "crystal", c1: "#9be7ff", c2: "#ffffff" },
  { cut: { name: "Coupure", intent: "attack", ops: [{ dmg: 4 }] } }, cycle("cut"));

// ---- Acte 2 : la Tour corporative céleste ----
enemy("sentinel", "Sentinelle séraphique", 2, "normal", [48, 54], { kind: "drone", c1: "#fcee0a", c2: "#ffffff" },
  { laser: { name: "Laser sacré", intent: "attack", ops: [{ dmg: 12 }] }, shield: { name: "Égide", intent: "defend", ops: [{ block: 12 }, { dmg: 5 }] } },
  weighted([["laser", 55], ["shield", 45]]));
enemy("enforcer", "Exécuteur corpo", 2, "normal", [58, 64], { kind: "knight", c1: "#2a2a3a", c2: "#fcee0a" },
  { baton: { name: "Matraque", intent: "attackDebuff", ops: [{ dmg: 9 }, { apply: { frail: 2 } }] }, burst: { name: "Rafale", intent: "attack", ops: [{ dmg: 3, times: 4 }] } },
  weighted([["baton", 50], ["burst", 50]]));
enemy("oracle", "Oracle déchu", 2, "normal", [42, 46], { kind: "mage", c1: "#c38bff", c2: "#fcee0a" },
  { curse: { name: "Prophétie", intent: "debuff", ops: [{ apply: { weak: 2, vuln: 2 } }, { addCard: "doubt" }] }, smite: { name: "Châtiment", intent: "attack", ops: [{ dmg: 12 }] } },
  cycle("curse", "smite", "smite"));
enemy("swarm", "Essaim de nanites", 2, "normal", [30, 34], { kind: "slime", c1: "#b8bcc8", c2: "#00e0ff" },
  { swarm: { name: "Nuée", intent: "attack", ops: [{ dmg: 2, times: 4 }] }, corrode: { name: "Corrosion", intent: "attackDebuff", ops: [{ dmg: 5 }, { apply: { poison: 4 } }] } },
  weighted([["swarm", 55], ["corrode", 45]]));
enemy("gargoyle", "Gargouille néon", 2, "normal", [62, 68], { kind: "ghoul", c1: "#5a5a6a", c2: "#00e0ff" },
  { stone: { name: "Peau de pierre", intent: "defend", ops: [{ block: 14 }, { self: { str: 2 } }] }, dive: { name: "Piqué", intent: "attack", ops: [{ dmg: 13 }] } },
  cycle("stone", "dive", "dive"));
enemy("valkyrie", "Valkyrie chromée", 2, "normal", [55, 60], { kind: "angel", c1: "#e8ecf4", c2: "#ff2a6d" },
  { spear: { name: "Lance", intent: "attack", ops: [{ dmg: 11 }] }, wings: { name: "Envol", intent: "buff", ops: [{ self: { str: 3 } }, { block: 8 }] } },
  weighted([["spear", 65], ["wings", 35]]));
enemy("judge", "Juge d'acier", 2, "elite", [130, 140], { kind: "knight", c1: "#d4af37", c2: "#ffffff" },
  { verdict: { name: "Verdict", intent: "attack", ops: [{ dmg: 22 }] }, sentence: { name: "Sentence", intent: "attackDebuff", ops: [{ dmg: 10 }, { apply: { vuln: 2, weak: 2 } }] }, law: { name: "Loi martiale", intent: "buff", ops: [{ self: { str: 3 } }, { block: 15 }] } },
  cycle("law", "sentence", "verdict"));
enemy("seraph", "Séraphin à six ailes", 2, "elite", [115, 120], { kind: "angel", c1: "#fff0a0", c2: "#ff8a3d" },
  { flames: { name: "Flammes saintes", intent: "attack", ops: [{ dmg: 5, times: 4 }] }, blind: { name: "Lumière aveuglante", intent: "debuff", ops: [{ apply: { weak: 3 } }, { addCard: "wound" }] }, heal: { name: "Grâce", intent: "buff", ops: [{ heal: 20 }, { self: { str: 2 } }] } },
  cycle("flames", "blind", "flames", "heal"));
enemy("mecha", "Mécha de siège", 2, "elite", [140, 150], { kind: "golem", c1: "#4a4f5e", c2: "#fcee0a" },
  { charge: { name: "Chargement", intent: "defend", ops: [{ block: 20 }] }, cannon: { name: "Canon à plasma", intent: "attack", ops: [{ dmg: 34 }] }, missiles: { name: "Missiles", intent: "attack", ops: [{ dmg: 6, times: 3 }] } },
  cycle("missiles", "charge", "cannon"));
enemy("director", "La Directrice Séraphine", 2, "boss", [260, 260], { kind: "boss2", c1: "#fcee0a", c2: "#ff2a6d" },
  {
    contract: { name: "Contrat", intent: "debuff", ops: [{ apply: { weak: 2, frail: 2 } }, { addCard: "glitched" }, { block: 15 }] },
    audit: { name: "Audit", intent: "attack", ops: [{ dmg: 9, times: 3 }] },
    downsize: { name: "Licenciement", intent: "attack", ops: [{ dmg: 32 }] },
    guards: { name: "Sécurité", intent: "summon", ops: [{ summon: "guard" }, { self: { str: 2 } }] }
  },
  (e, turn) => ["contract", "audit", "guards", "downsize", "audit", "contract", "downsize"][turn % 7]);
enemy("guard", "Garde de sécurité", 2, "minion", [26, 30], { kind: "drone", c1: "#2a2a3a", c2: "#fcee0a" },
  { shoot: { name: "Tir", intent: "attack", ops: [{ dmg: 7 }] }, cover: { name: "Couverture", intent: "defend", ops: [{ block: 8 }] } }, cycle("shoot", "cover"));

// ---- Acte 3 : le Cœur du Réseau divin ----
enemy("wraith", "Spectre du code", 3, "normal", [60, 66], { kind: "ghost", c1: "#7dffb0", c2: "#00e0ff" },
  { drain: { name: "Siphon", intent: "attackDebuff", ops: [{ dmg: 10 }, { apply: { weak: 2 } }] }, phase: { name: "Déphasage", intent: "defend", ops: [{ block: 18 }] }, wail: { name: "Lamentation", intent: "attack", ops: [{ dmg: 5, times: 3 }] } },
  weighted([["drain", 40], ["phase", 25], ["wail", 35]]));
enemy("titanbot", "Titan de silice", 3, "normal", [88, 96], { kind: "golem", c1: "#9a8a6a", c2: "#00e0ff" },
  { crush: { name: "Broyage", intent: "attack", ops: [{ dmg: 18 }] }, reinforce: { name: "Renforts", intent: "defend", ops: [{ block: 16 }, { self: { str: 3 } }] } },
  cycle("reinforce", "crush", "crush"));
enemy("djinn", "Djinn quantique", 3, "normal", [70, 76], { kind: "mage", c1: "#ff7ad9", c2: "#00e0ff" },
  { curse: { name: "Malédiction", intent: "debuff", ops: [{ apply: { vuln: 3, frail: 2 } }] }, storm: { name: "Tempête", intent: "attack", ops: [{ dmg: 6, times: 3 }] }, nova: { name: "Nova", intent: "attack", ops: [{ dmg: 20 }] } },
  cycle("curse", "storm", "nova"));
enemy("dragonet", "Dragonnet de données", 3, "normal", [64, 70], { kind: "dragon", c1: "#ff6a3d", c2: "#fcee0a" },
  { breath: { name: "Souffle", intent: "attackDebuff", ops: [{ dmg: 12 }, { apply: { poison: 4 } }] }, claw: { name: "Griffes", intent: "attack", ops: [{ dmg: 7, times: 2 }] }, rage: { name: "Fureur", intent: "buff", ops: [{ self: { str: 4 } }] } },
  cycle("claw", "breath", "rage", "claw"));
enemy("cherub", "Chérubin corrompu", 3, "normal", [50, 55], { kind: "angel", c1: "#ffb0d0", c2: "#7a2a8a" },
  { hymn: { name: "Hymne", intent: "buff", ops: [{ self: { str: 2, regen: 4 } }] }, arrow: { name: "Flèche d'amour", intent: "attack", ops: [{ dmg: 14 }] } },
  cycle("hymn", "arrow", "arrow"));
enemy("avatar", "Avatar du néant", 3, "elite", [170, 180], { kind: "ghost", c1: "#2a0a45", c2: "#ff2a6d" },
  { void: { name: "Néant", intent: "attackDebuff", ops: [{ dmg: 14 }, { apply: { vuln: 2 } }, { addCard: "wound" }] }, eclipse: { name: "Éclipse", intent: "attack", ops: [{ dmg: 8, times: 3 }] }, absorb: { name: "Absorption", intent: "buff", ops: [{ heal: 25 }, { self: { str: 3 } }] } },
  cycle("void", "eclipse", "absorb", "eclipse"));
enemy("warden", "Gardien des portes", 3, "elite", [190, 200], { kind: "knight", c1: "#e8ecf4", c2: "#9be7ff" },
  { gate: { name: "Porte close", intent: "defend", ops: [{ block: 30 }, { self: { thorns: 3 } }] }, judgement: { name: "Jugement", intent: "attack", ops: [{ dmg: 28 }] }, sweep: { name: "Faux céleste", intent: "attack", ops: [{ dmg: 11, times: 2 }] } },
  cycle("gate", "sweep", "judgement"));
enemy("hydra2", "Hydre primordiale", 3, "elite", [160, 170], { kind: "hydra", c1: "#b06bff", c2: "#7dffb0" },
  { bites: { name: "Sept morsures", intent: "attack", ops: [{ dmg: 4, times: 6 }] }, toxic: { name: "Bain toxique", intent: "attackDebuff", ops: [{ dmg: 10 }, { apply: { poison: 7 } }] }, grow: { name: "Nouvelles têtes", intent: "buff", ops: [{ self: { str: 2, regen: 8 } }] } },
  cycle("toxic", "bites", "grow"));
enemy("machinegod", "Le Dieu-Machine", 3, "boss", [400, 400], { kind: "boss3", c1: "#ff2a6d", c2: "#00e0ff" },
  {
    awaken: { name: "Éveil", intent: "buff", ops: [{ self: { ritual: 2 } }, { block: 25 }] },
    judgment: { name: "Jugement final", intent: "attack", ops: [{ dmg: 12, times: 3 }] },
    erase: { name: "Effacement", intent: "attackDebuff", ops: [{ dmg: 18 }, { apply: { vuln: 2, weak: 2 } }, { addCard: "glitched" }] },
    genesis: { name: "Genèse", intent: "summon", ops: [{ summon: "seraphbit" }, { summon: "seraphbit" }, { block: 20 }] },
    apocalypse: { name: "Apocalypse", intent: "attack", ops: [{ dmg: 45 }] }
  },
  (e, turn) => ["awaken", "judgment", "erase", "genesis", "judgment", "apocalypse"][turn % 6]);
enemy("seraphbit", "Ange-bit", 3, "minion", [24, 28], { kind: "angel", c1: "#ffffff", c2: "#00e0ff" },
  { pierce: { name: "Transpercer", intent: "attack", ops: [{ dmg: 8 }] }, shield: { name: "Bouclier sacré", intent: "defend", ops: [{ block: 10 }] } }, cycle("pierce", "shield"));

export const ENEMIES = E;
export const ENEMY_IDS = Object.keys(E);
export const enemyById = (id) => E[id];

// Groupes de rencontres par acte
const ENCOUNTERS = {
  1: {
    easy: [["drone"], ["rat", "rat"], ["slime"], ["hexer"]],
    normal: [["ghoul"], ["cultist"], ["drone", "rat"], ["slime", "rat"], ["hexer", "drone"], ["rat", "rat", "rat"], ["slime", "hexer"]],
    elite: [["knight"], ["hydra"], ["golem"]],
    boss: [["archon"]]
  },
  2: {
    easy: [["sentinel"], ["swarm", "swarm"], ["oracle"]],
    normal: [["enforcer"], ["gargoyle"], ["valkyrie"], ["sentinel", "swarm"], ["oracle", "enforcer"], ["swarm", "swarm", "swarm"], ["valkyrie", "oracle"]],
    elite: [["judge"], ["seraph"], ["mecha"]],
    boss: [["director"]]
  },
  3: {
    easy: [["wraith"], ["cherub", "cherub"], ["dragonet"]],
    normal: [["titanbot"], ["djinn"], ["wraith", "cherub"], ["dragonet", "cherub"], ["djinn", "wraith"], ["titanbot", "cherub"]],
    elite: [["avatar"], ["warden"], ["hydra2"]],
    boss: [["machinegod"]]
  }
};
export const ACT_NAMES = { 1: "Catacombes néon", 2: "Tour corporative céleste", 3: "Cœur du Réseau divin" };

/* =====================================================================
   Difficulté : Ascension (débloquée niveau par niveau en gagnant)
===================================================================== */

export const ASCENSIONS = [
  "Normal",
  "Les élites ont 20 % de PV en plus.",
  "Les ennemis normaux infligent 10 % de dégâts en plus.",
  "Les boss ont 15 % de PV en plus.",
  "Les feux de camp soignent 20 % au lieu de 30 %.",
  "Tu commences avec une Blessure dans ton deck.",
  "Tu commences avec 5 PV max en moins.",
  "Tu gagnes 25 % d'or en moins.",
  "Les élites infligent 15 % de dégâts en plus.",
  "Les boss infligent 15 % de dégâts en plus.",
  "Les ennemis ont tous 10 % de PV en plus."
];
export const ASC_MAX = ASCENSIONS.length - 1;

/* =====================================================================
   Méta-progression (éclats ❖, gardés entre les parties)
===================================================================== */

export const META = [
  { id: "vit", name: "Vitalité", icon: "♥", max: 5, cost: (r) => 30 + r * 25, text: (r) => `+5 PV max au départ (actuel : +${r * 5}).` },
  { id: "gold", name: "Bourse d'héritage", icon: "◆", max: 4, cost: (r) => 25 + r * 25, text: (r) => `+25 or au départ (actuel : +${r * 25}).` },
  { id: "potion", name: "Trousse de stims", icon: "⚗", max: 2, cost: (r) => 60 + r * 60, text: (r) => (r ? "Commence avec 1 stim aléatoire et +1 emplacement." : "Commence avec 1 stim aléatoire.") },
  { id: "relic", name: "Héritage", icon: "✦", max: 1, cost: () => 150, text: () => "Commence chaque partie avec une relique commune aléatoire." },
  { id: "reroll", name: "Œil du prophète", icon: "👁", max: 3, cost: (r) => 50 + r * 50, text: (r) => `Relancer les cartes proposées en récompense : +1 fois par acte (actuel : ${r} par acte).` },
  { id: "camp", name: "Camp fortifié", icon: "⛺", max: 3, cost: (r) => 40 + r * 40, text: (r) => `Les feux de camp soignent 5 % de plus (actuel : +${r * 5} %).` },
  { id: "purge", name: "Purge initiale", icon: "✂", max: 1, cost: () => 120, text: () => "Commence sans une Frappe (deck plus efficace)." },
  { id: "arch", name: "Archives interdites", icon: "📜", max: 3, cost: (r) => 80 + r * 90, text: (r) => `Débloque de nouvelles cartes pour chaque héros (niveau ${r} / 3).` },
  { id: "luck", name: "Faveur des dieux", icon: "☀", max: 3, cost: (r) => 60 + r * 60, text: (r) => `Plus de chances de cartes rares (actuel : +${r * 3} %).` },
  { id: "shop", name: "Contacts au marché noir", icon: "¤", max: 2, cost: (r) => 70 + r * 70, text: (r) => `Boutique : -${(r + 1) * 10} % (actuel : -${r * 10} %).` }
];
export const META_IDS = META.map((m) => m.id);
export const metaById = (id) => META.find((m) => m.id === id);
export const rank = (save, id) => save.ranks?.[id] || 0;

/* =====================================================================
   Sauvegarde du jeu (wallet.data.deck)
===================================================================== */

const STAT_KEYS = ["runs", "wins", "bestFloor", "kills", "elites", "bosses", "cards", "damage", "maxHit", "earned"];

export function freshDeckSave() {
  return {
    shards: 0,
    ranks: Object.fromEntries(META_IDS.map((id) => [id, 0])),
    heroes: ["blade"],
    asc: Object.fromEntries(HERO_IDS.map((id) => [id, 0])),     // plus haut niveau d'Ascension débloqué par héros
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    seenCards: [],
    seenEnemies: [],
    seenRelics: [],
    last: { hero: "blade", asc: 0 },
    run: null
  };
}

const num = (v, max = 1e15) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

export function sanitizeDeckSave(raw) {
  const s = freshDeckSave();
  if (!raw || typeof raw !== "object") return s;
  s.shards = num(raw.shards);
  for (const m of META) s.ranks[m.id] = Math.min(num(raw.ranks?.[m.id]), m.max);
  if (Array.isArray(raw.heroes)) for (const id of raw.heroes) if (HERO_IDS.includes(id) && !s.heroes.includes(id)) s.heroes.push(id);
  for (const id of HERO_IDS) s.asc[id] = Math.min(ASC_MAX, num(raw.asc?.[id]));
  for (const k of STAT_KEYS) s.stats[k] = num(raw.stats?.[k]);
  if (Array.isArray(raw.seenCards)) s.seenCards = [...new Set(raw.seenCards.filter((id) => CARDS[id]))];
  if (Array.isArray(raw.seenEnemies)) s.seenEnemies = [...new Set(raw.seenEnemies.filter((id) => E[id]))];
  if (Array.isArray(raw.seenRelics)) s.seenRelics = [...new Set(raw.seenRelics.filter((id) => relicById(id)))];
  if (raw.last && typeof raw.last === "object") {
    if (s.heroes.includes(raw.last.hero)) s.last.hero = raw.last.hero;
    s.last.asc = Math.min(s.asc[s.last.hero] || 0, num(raw.last.asc));
  }
  s.run = sanitizeRun(raw.run);
  return s;
}

// La partie en cours est conservée si sa forme est cohérente (sinon elle est abandonnée sans planter)
function sanitizeRun(r) {
  try {
    if (!r || typeof r !== "object" || !HERO_IDS.includes(r.hero)) return null;
    if (!Array.isArray(r.deck) || !r.deck.every((c) => c && CARDS[c.id])) return null;
    if (!Array.isArray(r.relics) || !r.relics.every((id) => relicById(id))) return null;
    if (!Array.isArray(r.potions) || !r.potions.every((id) => id === null || potionById(id))) return null;
    if (!r.map || !Array.isArray(r.map.nodes)) return null;
    if (!Number.isFinite(r.hp) || !Number.isFinite(r.maxHp) || !Number.isFinite(r.seed)) return null;
    if (r.combat) {
      const c = r.combat;
      if (!Array.isArray(c.enemies) || !c.enemies.every((e) => E[e.id])) return null;
      for (const pile of ["hand", "draw", "discard", "exhaust"]) if (!Array.isArray(c[pile]) || !c[pile].every((x) => x && CARDS[x.id])) return null;
    }
    return r;
  } catch {
    return null;
  }
}

/* =====================================================================
   Création d'une partie et carte des étages
===================================================================== */

export const ROWS = 11;          // étages par acte (le boss est au-dessus)
const COLS = 7;

export function cardPool(save, hero, rarity) {
  const arch = rank(save, "arch");
  return RAW_CARDS.filter((c) => c.hero === hero && c.rarity === rarity && (c.arch || 0) <= arch).map((c) => c.id);
}
const NEUTRALS = () => RAW_CARDS.filter((c) => c.hero === "neutral").map((c) => c.id);

export function newRun(save, heroId, asc = 0, seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
  const hero = heroById(heroId);
  const run = {
    v: 1,
    hero: hero.id,
    asc: clamp(asc, 0, ASC_MAX),
    seed: seed >>> 0,
    act: 1,
    floor: 0,                     // étage total (1 à 36)
    hp: 0, maxHp: 0,
    gold: 99,
    deck: hero.deck.map((id) => ({ id, up: false })),
    relics: [hero.relic],
    potions: [null, null],
    bonusSlots: 0,
    removeCost: 75,
    rerolls: rank(save, "reroll"),
    map: null,
    pos: null,                    // { row, col } du dernier nœud visité (null : début de l'acte)
    screen: "map",                // map · combat · reward · shop · rest · event · treasure · boss-relic · over · victory
    combat: null,
    reward: null,
    shop: null,
    event: null,
    potionChance: 40,
    stats: { kills: 0, elites: 0, bosses: 0, cards: 0, damage: 0, maxHit: 0, gold: 0 },
    seenRelics: [],
    phoenixUsed: false,
    log: []
  };
  run.maxHp = hero.hp + rank(save, "vit") * 5 - (run.asc >= 6 ? 5 : 0);
  run.gold += rank(save, "gold") * 25;
  if (rank(save, "purge")) {
    const i = run.deck.findIndex((c) => c.id === "strike");
    if (i >= 0) run.deck.splice(i, 1);
  }
  if (run.asc >= 5) run.deck.push({ id: "wound", up: false });
  if (rank(save, "potion") >= 1) run.potions[0] = pick(run, POTION_IDS);
  if (rank(save, "potion") >= 2) { run.bonusSlots = 1; run.potions.push(null); }
  if (rank(save, "relic")) gainRelic(run, pick(run, RELICS.filter((r) => r.tier === "common").map((r) => r.id)));
  run.hp = run.maxHp;
  run.map = genMap(run);
  run.metaLuck = rank(save, "luck") * 3;
  run.metaShop = rank(save, "shop") * 10;
  run.metaCamp = rank(save, "camp") * 5;
  run.arch = rank(save, "arch");
  run.metaReroll = rank(save, "reroll");
  return run;
}

// Carte d'un acte : lignes 0 à ROWS-1, 6 chemins qui montent ; boss au-dessus de la dernière ligne
export function genMap(run) {
  const nodes = [];       // { row, col, type, next: [col…] }
  const at = (row, col) => nodes.find((n) => n.row === row && n.col === col);
  const add = (row, col) => at(row, col) || (nodes.push({ row, col, type: null, next: [] }), nodes[nodes.length - 1]);
  const starts = [];
  for (let p = 0; p < 6; p++) {
    let col = p < 2 ? [1, 3, 5][p] : rint(run, 0, COLS - 1);
    if (p === 1 && starts[0] === col) col = (col + 2) % COLS;
    starts.push(col);
    for (let row = 0; row < ROWS; row++) {
      const n = add(row, col);
      if (row === ROWS - 1) break;
      // pas de croisement : on évite de couper une arête déjà tracée
      let nc = clamp(col + rint(run, -1, 1), 0, COLS - 1);
      for (let tries = 0; tries < 3; tries++) {
        const crossing = nodes.some((m) => m.row === row && m.col !== col && m.next.some((k) => (m.col < col && k > nc) || (m.col > col && k < nc)));
        if (!crossing) break;
        nc = clamp(col + rint(run, -1, 1), 0, COLS - 1);
      }
      if (!n.next.includes(nc)) n.next.push(nc);
      col = nc;
    }
  }
  // types de salles
  for (const n of nodes) {
    if (n.row === 0) n.type = "fight";
    else if (n.row === ROWS - 1) n.type = "rest";
    else if (n.row === Math.floor(ROWS / 2)) n.type = "treasure";
  }
  const parents = (n) => nodes.filter((m) => m.row === n.row - 1 && m.next.includes(n.col));
  for (const n of nodes.filter((m) => !m.type).sort((a, b) => a.row - b.row)) {
    const r = rand(run);
    const pType = parents(n).map((m) => m.type);
    let type;
    if (r < 0.12) type = "shop";
    else if (r < 0.34) type = "event";
    else if (r < 0.46 && n.row >= 4) type = "elite";
    else if (r < 0.56 && n.row >= 4 && n.row < ROWS - 2) type = "rest";
    else type = "fight";
    if (["shop", "elite", "rest"].includes(type) && pType.includes(type)) type = type === "elite" ? "fight" : "event";
    if (n.row <= 1 && type !== "fight" && type !== "event") type = "fight";
    n.type = type;
  }
  for (const n of nodes) n.next.sort((a, b) => a - b);
  return { act: run.act, nodes };
}

export const NODE_INFO = {
  fight: { name: "Combat", icon: "⚔" },
  elite: { name: "Élite", icon: "☠" },
  event: { name: "Événement", icon: "?" },
  shop: { name: "Marchand", icon: "¤" },
  rest: { name: "Feu de camp", icon: "🔥" },
  treasure: { name: "Trésor", icon: "◈" },
  boss: { name: "Boss", icon: "♛" }
};

// Nœuds accessibles depuis la position actuelle
export function reachable(run) {
  const nodes = run.map.nodes;
  if (!run.pos) return nodes.filter((n) => n.row === 0);
  if (run.pos.row === "boss") return [];
  const cur = nodes.find((n) => n.row === run.pos.row && n.col === run.pos.col);
  if (!cur) return [];
  if (cur.row === ROWS - 1) return [{ row: "boss", col: 3, type: "boss" }];
  return cur.next.map((c) => nodes.find((n) => n.row === cur.row + 1 && n.col === c)).filter(Boolean);
}

/* =====================================================================
   Reliques : gain et effets permanents
===================================================================== */

export function gainRelic(run, id) {
  if (!id || has(run, id)) return;
  run.relics.push(id);
  run.seenRelics = run.seenRelics || [];
  if (!run.seenRelics.includes(id)) run.seenRelics.push(id);
  if (id === "anchor" && run.maxHp) { run.maxHp += 10; run.hp += 10; }
  if (id === "wings") { run.maxHp += 15; run.hp = run.maxHp; }
  if (id === "belt") run.potions.push(null);
  if (id === "pandora") {
    const pool = [...cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "common"), ...cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "uncommon")];
    run.deck = run.deck.map((c) => (["strike", "guard", "dodge"].includes(c.id) ? { id: pick(run, pool), up: false } : c));
  }
}

function relicPool(run, tier) {
  return RELICS.filter((r) => r.tier === tier && !has(run, r.id)).map((r) => r.id);
}
export function randomRelic(run, tierRoll = rand(run)) {
  const tier = tierRoll < 0.55 ? "common" : tierRoll < 0.88 ? "uncommon" : "rare";
  const pool = relicPool(run, tier);
  if (pool.length) return pick(run, pool);
  const any = ["common", "uncommon", "rare"].flatMap((t) => relicPool(run, t));
  return any.length ? pick(run, any) : null;
}

/* =====================================================================
   Combat
===================================================================== */

function fighter(hp, maxHp) {
  return { hp, maxHp, block: 0, st: {} };
}

const ascHp = (run, tier) => 1 + (run.asc >= 1 && tier === "elite" ? 0.2 : 0) + (run.asc >= 3 && tier === "boss" ? 0.15 : 0)
  + (run.asc >= 10 ? 0.1 : 0) + (has(run, "core") ? 0.1 : 0);
const ascDmg = (run, tier) => 1 + (run.asc >= 2 && tier === "normal" ? 0.1 : 0) + (run.asc >= 8 && tier === "elite" ? 0.15 : 0) + (run.asc >= 9 && tier === "boss" ? 0.15 : 0);

function makeEnemy(run, id, uid) {
  const def = E[id];
  const hp = Math.round(rint(run, def.hp[0], def.hp[1]) * ascHp(run, def.tier));
  return { uid, id, ...fighter(hp, hp), intent: null, last: null, last2: null, turn: 0, dmgMult: ascDmg(run, def.tier) };
}

export function startCombat(run, kind, groupIds = null) {
  const act = run.act;
  const enc = ENCOUNTERS[act];
  let group = groupIds;
  if (!group) {
    if (kind === "boss") group = enc.boss[0];
    else if (kind === "elite") group = pick(run, enc.elite);
    else {
      // les 2 premiers combats de l'acte sont plus faciles
      const fightsDone = run.combatsInAct || 0;
      group = pick(run, fightsDone < 2 ? enc.easy : enc.normal);
    }
  }
  run.combatsInAct = (run.combatsInAct || 0) + 1;
  const c = {
    kind,
    turn: 0,
    energy: 0,
    maxEnergy: 3 + (has(run, "core") ? 1 : 0) + (has(run, "cloak") ? 1 : 0) + (has(run, "crown") ? 1 : 0),
    player: { ...fighter(run.hp, run.maxHp) },
    enemies: [],
    draw: shuffle(run, run.deck.map((card, i) => ({ ...card, k: i }))),
    hand: [],
    discard: [],
    exhaust: [],
    nextUid: 1,
    attacksThisTurn: 0,
    attacksTotal: 0,
    cardsThisTurn: 0,
    playedAttackLast: false,
    log: [],
    fx: []                     // évènements visuels à jouer par l'interface (dégâts, soins…)
  };
  run.combat = c;
  run.screen = "combat";
  for (const id of group) c.enemies.push(makeEnemy(run, id, c.nextUid++));
  // reliques de début de combat
  const p = c.player;
  if (has(run, "plating")) p.block += 10;
  if (has(run, "spikes")) addStatus(p, "thorns", 3);
  if (has(run, "gauntlet")) addStatus(p, "str", 1);
  if (has(run, "boots")) addStatus(p, "dex", 1);
  for (const e of c.enemies) {
    if (has(run, "vial") || has(run, "intrusion")) addStatus(e, "poison", 2);
    if (has(run, "ember")) addStatus(e, "burn", 2);
    if (has(run, "blade2")) addStatus(e, "vuln", 1);
  }
  if (has(run, "codex")) {
    const pool = cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "rare");
    if (pool.length) { const card = { id: pick(run, pool), up: false, k: 900, free: true }; c.hand.push(card); }
  }
  for (const e of c.enemies) chooseIntent(run, e);
  startTurn(run);
  return c;
}

export function addStatus(f, k, n) {
  if (!n) return;
  f.st[k] = (f.st[k] || 0) + n;
  if (f.st[k] <= 0 && k !== "str" && k !== "dex") delete f.st[k];
  if ((k === "str" || k === "dex") && f.st[k] === 0) delete f.st[k];
}
const st = (f, k) => f.st[k] || 0;

// Quantité réellement appliquée (bonus de Pyromancie, Corruption, Ongles d'acier)
function applied(k, n, p, run = null) {
  if (!p) return n;
  let v = n;
  if (k === "burn") v += st(p, "pPyro") + (run && has(run, "nails") ? 1 : 0);
  if (k === "poison") v += st(p, "pCorrupt") + (run && has(run, "nails") ? 1 : 0);
  return v;
}

export function calcDamage(base, src, tgt, run = null) {
  let d = base + st(src, "str");
  if (st(src, "weak")) d *= 0.75;
  if (tgt && st(tgt, "vuln")) d *= run && has(run, "lens") && src === run.combat?.player ? 1.75 : 1.5;
  return Math.max(0, Math.floor(d));
}
export function calcBlock(base, f) {
  let b = base + st(f, "dex");
  if (st(f, "frail")) b *= 0.75;
  return Math.max(0, Math.floor(b));
}
// Dégâts d'une attaque ennemie (avec Gel, multiplicateur d'Ascension)
export function enemyHit(run, e, base) {
  const p = run.combat.player;
  let d = (base + st(e, "str")) * (e.dmgMult || 1);
  if (st(e, "weak")) d *= 0.75;
  if (st(p, "vuln")) d *= 1.5;
  d = Math.floor(d) - st(e, "gel");
  return Math.max(0, d);
}

function fx(c, f) { c.fx.push(f); if (c.fx.length > 80) c.fx.shift(); }
function log(c, text) { c.log.push(text); if (c.log.length > 40) c.log.shift(); }

// Inflige des dégâts (après bouclier). Renvoie les PV réellement perdus.
function hurt(run, tgt, amount, { attacker = null, pierce = false } = {}) {
  const c = run.combat;
  let dmg = Math.max(0, Math.floor(amount));
  if (tgt === c.player && has(run, "torii") && attacker && dmg > 0 && dmg <= 5) dmg = 1;
  let lost = dmg;
  if (!pierce && tgt.block > 0) {
    const absorbed = Math.min(tgt.block, dmg);
    tgt.block -= absorbed;
    lost = dmg - absorbed;
    if (absorbed) fx(c, { t: "block", who: tgt === c.player ? "p" : tgt.uid, n: absorbed });
  }
  if (lost > 0) {
    tgt.hp -= lost;
    fx(c, { t: "dmg", who: tgt === c.player ? "p" : tgt.uid, n: lost });
    if (tgt !== c.player) { run.stats.damage += lost; run.stats.maxHit = Math.max(run.stats.maxHit, lost); }
  }
  // épines
  if (attacker && st(tgt, "thorns") && attacker.hp > 0) {
    hurt(run, attacker, st(tgt, "thorns"), { pierce: false });
  }
  if (tgt === c.player && tgt.hp <= 0) checkPhoenix(run);
  return lost;
}

function checkPhoenix(run) {
  const p = run.combat.player;
  if (p.hp > 0 || !has(run, "phoenixf") || run.phoenixUsed) return;
  run.phoenixUsed = true;
  p.hp = Math.floor(p.maxHp * 0.5);
  fx(run.combat, { t: "heal", who: "p", n: p.hp });
  log(run.combat, "La Plume de phénix te ramène à la vie !");
}

function heal(run, f, n) {
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + n);
  if (f.hp > before) fx(run.combat, { t: "heal", who: f === run.combat.player ? "p" : f.uid, n: f.hp - before });
}

export const alive = (c) => c.enemies.filter((e) => e.hp > 0);

function drawCards(run, n) {
  const c = run.combat;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= 10) break;
    if (!c.draw.length) {
      if (!c.discard.length) break;
      c.draw = shuffle(run, c.discard);
      c.discard = [];
    }
    c.hand.push(c.draw.pop());
  }
}

function startTurn(run) {
  const c = run.combat;
  const p = c.player;
  c.turn++;
  c.attacksThisTurn = 0;
  c.cardsThisTurn = 0;
  if (!st(p, "pFort")) p.block = 0;
  // Virus du joueur
  if (st(p, "poison")) { hurt(run, p, st(p, "poison"), { pierce: true }); addStatus(p, "poison", -1); }
  if (p.hp <= 0) return;
  if (has(run, "halo")) p.block += 3;
  if (st(p, "pSamurai")) addStatus(p, "str", st(p, "pSamurai"));
  if (st(p, "pIce")) for (const e of alive(c)) addStatus(e, "gel", st(p, "pIce"));
  if (st(p, "pBotnet")) for (const e of alive(c)) addStatus(e, "poison", applied("poison", st(p, "pBotnet"), p, run));
  c.energy = c.maxEnergy + st(p, "pMage") + (c.turn === 1 && has(run, "battery") ? 1 : 0) + (c.turn === 1 && has(run, "intrusion") ? 1 : 0);
  let n = 5 + st(p, "pEcho") + (has(run, "eye") ? 1 : 0) - (has(run, "cloak") ? 1 : 0);
  if (c.turn === 1) n += (has(run, "grimoire") ? 2 : 0) + (has(run, "lantern") ? 2 : 0);
  drawCards(run, n);
  if (st(p, "pShadows")) for (let i = 0; i < st(p, "pShadows"); i++) if (c.hand.length < 10) c.hand.push({ id: "shiv", up: false, k: 1000 + c.nextUid++ });
  for (const e of alive(c)) e.shownIntent = e.intent;
}

export function chooseIntent(run, e) {
  const def = E[e.id];
  const key = def.ai(e, e.turn, rand(run));
  e.intent = key;
}

// Ce que l'ennemi annonce : { kind, dmg, times, text }
export function intentOf(run, e) {
  const def = E[e.id];
  const mv = def.moves[e.intent];
  if (!mv) return null;
  let dmg = 0;
  let times = 1;
  for (const op of mv.ops) if (op.dmg !== undefined) { dmg = enemyHit(run, e, op.dmg); times = op.times || 1; }
  return { kind: mv.intent, name: mv.name, dmg, times };
}

export function cardPlayable(run, card) {
  const c = run.combat;
  const def = cardById(card.id);
  if (def.unplayable) return false;
  return effectiveCost(run, card) <= c.energy;
}
export function effectiveCost(run, card) {
  const c = run.combat;
  if (card.free) return 0;
  const def = cardById(card.id);
  let cost = V(def.cost, card.up);
  if (def.id === "onslaught" && c && c.attacksThisTurn > 0) cost = 0;
  return Math.max(0, cost);
}
export const needsTarget = (card) => cardById(card.id).target === "enemy";

// Joue la carte d'index `hi` de la main sur l'ennemi `uid` (si besoin). Renvoie true si jouée.
export function playCard(run, hi, uid = null) {
  const c = run.combat;
  if (!c || c.over) return false;
  const card = c.hand[hi];
  if (!card || !cardPlayable(run, card)) return false;
  const def = cardById(card.id);
  const up = card.up;
  let target = null;
  if (def.target === "enemy") {
    target = alive(c).find((e) => e.uid === uid) || (alive(c).length === 1 ? alive(c)[0] : null);
    if (!target) return false;
  }
  c.energy -= effectiveCost(run, card);
  c.hand.splice(hi, 1);
  c.cardsThisTurn++;
  run.stats.cards++;
  const p = c.player;
  const isAttack = def.type === "attack";
  // Plume de cristal : toutes les 10 attaques, la suivante fait double dégâts
  let doubleNext = false;
  if (isAttack) {
    c.attacksTotal++;
    if (has(run, "pen") && c.attacksTotal % 10 === 0) doubleNext = true;
  }
  c.cardDealt = 0;
  const dealTo = (e, base) => {
    if (!e || e.hp <= 0) return 0;
    let d = calcDamage(base, p, e, run);
    if (doubleNext) d *= 2;
    const lost = hurt(run, e, d, { attacker: p });
    c.cardDealt += lost;
    return lost;
  };
  for (const op of def.ops) {
    const times = V(op.times, up) || 1;
    if (op.special) { special(run, op, up, target, dealTo); continue; }
    if (op.dmg !== undefined) {
      for (let i = 0; i < times; i++) {
        const tg = def.target === "random" ? pick(run, alive(c)) : target;
        if (!tg) break;
        dealTo(tg, V(op.dmg, up));
        if (op.applyRandom) for (const [k, n] of Object.entries(op.applyRandom)) addStatus(tg, k, applied(k, V(n, up), p, run));
      }
    }
    if (op.dmgAll !== undefined) for (let i = 0; i < times; i++) for (const e of alive(c)) dealTo(e, V(op.dmgAll, up));
    if (op.applyRandom && op.dmg === undefined) for (let i = 0; i < times; i++) { const tg = pick(run, alive(c)); if (tg) for (const [k, n] of Object.entries(op.applyRandom)) addStatus(tg, k, applied(k, V(n, up), p, run)); }
    if (op.block !== undefined) { p.block += calcBlock(V(op.block, up), p); fx(c, { t: "shield", who: "p" }); }
    if (op.draw !== undefined) drawCards(run, V(op.draw, up));
    if (op.energy !== undefined) c.energy += V(op.energy, up);
    if (op.heal !== undefined) heal(run, p, V(op.heal, up));
    if (op.loseHp !== undefined) hurt(run, p, V(op.loseHp, up), { pierce: true });
    if (op.apply && target) for (const [k, n] of Object.entries(op.apply)) addStatus(target, k, applied(k, V(n, up), p, run));
    if (op.applyAll) for (const e of alive(c)) for (const [k, n] of Object.entries(op.applyAll)) addStatus(e, k, applied(k, V(n, up), p, run));
    if (op.self) for (const [k, n] of Object.entries(op.self)) addStatus(p, k, V(n, up));
    if (op.addCard) {
      const n = V(op.n, up);
      for (let i = 0; i < n; i++) {
        const nc = { id: op.addCard, up: false, k: 1000 + c.nextUid++ };
        if (op.to === "draw") c.draw.splice(rint(run, 0, c.draw.length), 0, nc);
        else if (c.hand.length < 10) c.hand.push(nc); else c.discard.push(nc);
      }
    }
  }
  // effets déclenchés
  if (isAttack) {
    c.attacksThisTurn++;
    if (st(p, "pRage")) p.block += st(p, "pRage");
    if (c.attacksThisTurn % 3 === 0) {
      if (has(run, "kunai")) addStatus(p, "dex", 1);
      if (has(run, "shuriken")) addStatus(p, "str", 1);
    }
  }
  if (def.type === "skill" && st(p, "pFlame")) for (const e of alive(c)) addStatus(e, "burn", applied("burn", st(p, "pFlame"), p, run));
  if (def.type === "power" && has(run, "jade")) drawCards(run, 1);
  // où va la carte
  if (def.type === "power") { /* les pouvoirs disparaissent une fois joués */ }
  else if (V(def.exhaust, up) || def.hero === "token") c.exhaust.push(card);
  else c.discard.push(card);
  log(c, `Tu joues ${cardName(card)}.`);
  checkEnd(run);
  return true;
}

function special(run, op, up, target, dealTo) {
  const c = run.combat;
  const p = c.player;
  switch (op.special) {
    case "execute": {
      const base = V(op.dmg, up);
      dealTo(target, target.hp < target.maxHp / 2 ? base * 2 : base);
      break;
    }
    case "blockDmg": dealTo(target, p.block - st(p, "str")); break;
    case "doubleBurn": addStatus(target, "burn", st(target, "burn")); break;
    case "apocalypse": for (const e of alive(c)) if (st(e, "burn")) hurt(run, e, st(e, "burn") * V(op.mult, up), { attacker: null }); break;
    case "killEnergy": { dealTo(target, V(op.dmg, up)); if (target.hp <= 0) c.energy += 2; break; }
    case "multPoison": addStatus(target, "poison", st(target, "poison") * (V(op.mult, up) - 1)); break;
    case "cleanse": for (const k of Object.keys(p.st)) if (STATUS[k]?.kind === "debuff") delete p.st[k]; break;
    case "doubleStr": if (st(p, "str") > 0) addStatus(p, "str", st(p, "str")); break;
    case "lifesteal": heal(run, p, Math.floor((c.cardDealt || 0) / 2)); break;
    case "freeIfAttack": break;
    case "burnHit": dealTo(target, V(op.dmg, up) + st(target, "burn")); break;
    case "poisonBurst": hurt(run, target, st(target, "poison") * V(op.mult, up), { attacker: null }); break;
    default: break;
  }
}

/* ---------- Fin du tour du joueur, tour des ennemis ---------- */

export function endTurn(run) {
  const c = run.combat;
  if (!c || c.over) return;
  const p = c.player;
  // cartes en main : malédictions de fin de tour, éphémères ; la main est défaussée (sauf Sablier céleste)
  const keep = [];
  for (const card of c.hand) {
    const def = cardById(card.id);
    if (def.endHand) {
      if (def.endHand.loseHp) hurt(run, p, def.endHand.loseHp, { pierce: true });
      if (def.endHand.self) for (const [k, n] of Object.entries(def.endHand.self)) addStatus(p, k, n);
    }
    if (def.ethereal) c.exhaust.push(card);
    else if (has(run, "hourglass") && keep.length < 10 && !def.unplayable) keep.push(card);
    else c.discard.push(card);
  }
  c.hand = keep;
  // fin de tour du joueur
  if (st(p, "pCryo")) p.block += st(p, "pCryo");
  if (has(run, "orichalcum") && p.block === 0) p.block += 6;
  endOfTurnTicks(run, p);
  if (p.hp <= 0) { checkEnd(run); if (c.over) return; }
  // tour des ennemis
  for (const e of alive(c)) {
    e.block = 0;
    if (st(e, "poison")) { hurt(run, e, st(e, "poison"), { pierce: true }); addStatus(e, "poison", -1); }
    if (e.hp <= 0) continue;
    enemyAct(run, e);
    if (p.hp <= 0) break;
    endOfTurnTicks(run, e);
  }
  checkEnd(run);
  if (c.over) return;
  for (const e of alive(c)) { e.turn++; chooseIntent(run, e); }
  startTurn(run);
  checkEnd(run);
}

function endOfTurnTicks(run, f) {
  if (st(f, "burn")) { hurt(run, f, st(f, "burn"), { pierce: true }); f.st.burn = Math.floor(st(f, "burn") / 2); if (!f.st.burn) delete f.st.burn; }
  if (st(f, "regen")) { heal(run, f, st(f, "regen")); addStatus(f, "regen", -1); }
  if (st(f, "ritual")) addStatus(f, "str", st(f, "ritual"));
  for (const k of DECAY_1) if (st(f, k)) addStatus(f, k, -1);
  if (st(f, "gel")) addStatus(f, "gel", -1);
}

function enemyAct(run, e) {
  const c = run.combat;
  const p = c.player;
  const def = E[e.id];
  const mv = def.moves[e.intent];
  if (!mv) return;
  fx(c, { t: "act", who: e.uid, intent: mv.intent });
  log(c, `${def.name} : ${mv.name}.`);
  for (const op of mv.ops) {
    if (op.dmg !== undefined) {
      const times = op.times || 1;
      for (let i = 0; i < times; i++) {
        if (p.hp <= 0 || e.hp <= 0) break;
        hurt(run, p, enemyHit(run, e, op.dmg), { attacker: e });
      }
    }
    if (op.block !== undefined) e.block += op.block;
    if (op.self) for (const [k, n] of Object.entries(op.self)) addStatus(e, k, n);
    if (op.apply) for (const [k, n] of Object.entries(op.apply)) addStatus(p, k, n);
    if (op.heal) heal(run, e, op.heal);
    if (op.summon && alive(c).length < 5 && alive(c).filter((x) => E[x.id].tier === "minion").length < 2) {
      const ne = makeEnemy(run, op.summon, c.nextUid++);
      chooseIntent(run, ne);
      c.enemies.push(ne);
      fx(c, { t: "summon", who: ne.uid });
    }
    if (op.addCard) c.discard.push({ id: op.addCard, up: false, k: 1000 + c.nextUid++ });
  }
  e.last2 = e.last;
  e.last = e.intent;
}

function checkEnd(run) {
  const c = run.combat;
  if (c.over) return;
  for (const e of c.enemies) {
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      e.hp = 0;
      run.stats.kills++;
      fx(c, { t: "die", who: e.uid });
    }
  }
  if (c.player.hp <= 0) checkPhoenix(run);
  if (c.player.hp <= 0) {
    c.over = "lose";
    run.hp = 0;
    run.screen = "over";
    return;
  }
  // les sbires disparaissent avec leur boss
  const bossDead = c.enemies.some((e) => E[e.id].tier === "boss" && e.dead);
  if (bossDead) for (const e of c.enemies) if (E[e.id].tier === "minion" && !e.dead) { e.dead = true; e.hp = 0; fx(c, { t: "die", who: e.uid }); }
  if (!alive(c).length) {
    c.over = "win";
    run.hp = Math.min(c.player.hp, run.maxHp);
    if (has(run, "katana")) run.hp = Math.min(run.maxHp, run.hp + 6);
    if (has(run, "leech")) run.hp = Math.min(run.maxHp, run.hp + 3);
    if (c.kind === "elite") run.stats.elites++;
    if (c.kind === "boss") run.stats.bosses++;
    makeReward(run, c.kind);
  }
}

/* =====================================================================
   Stims en combat
===================================================================== */

export function usePotion(run, slot, uid = null) {
  const id = run.potions[slot];
  const pot = potionById(id);
  if (!pot) return false;
  const c = run.combat;
  if (!c || c.over) {
    if (!pot.anywhere) return false;
    run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.25));
    run.potions[slot] = null;
    return true;
  }
  const p = c.player;
  let target = null;
  if (pot.target === "enemy") {
    target = alive(c).find((e) => e.uid === uid) || (alive(c).length === 1 ? alive(c)[0] : null);
    if (!target) return false;
  }
  switch (id) {
    case "fire": hurt(run, target, 20, { attacker: null }); break;
    case "shield": p.block += 12; fx(c, { t: "shield", who: "p" }); break;
    case "strength": addStatus(p, "str", 2); break;
    case "agility": addStatus(p, "dex", 2); break;
    case "energy": c.energy += 2; break;
    case "heal": heal(run, p, Math.floor(p.maxHp * 0.25)); break;
    case "swift": drawCards(run, 3); break;
    case "toxin": addStatus(target, "poison", 7); break;
    case "frost": for (const e of alive(c)) { addStatus(e, "gel", 3); addStatus(e, "weak", 1); } break;
    case "fear": addStatus(target, "vuln", 3); break;
    default: break;
  }
  run.potions[slot] = null;
  checkEnd(run);
  return true;
}

export function addPotion(run, id) {
  const i = run.potions.indexOf(null);
  if (i < 0) return false;
  run.potions[i] = id;
  return true;
}

/* =====================================================================
   Récompenses
===================================================================== */

const goldMult = (run) => (has(run, "purse") ? 1.25 : 1) * (run.asc >= 7 ? 0.75 : 1);

function rollRarity(run, kind) {
  const r = rand(run) * 100;
  const luck = run.metaLuck || 0;
  if (kind === "boss") return "rare";
  if (kind === "elite") return r < 10 + luck ? "rare" : r < 50 ? "uncommon" : "common";
  return r < 4 + luck ? "rare" : r < 37 ? "uncommon" : "common";
}

export function cardChoices(run, kind, n = has(run, "dice") ? 4 : 3) {
  const save = { ranks: { arch: run.arch || 0 } };
  const out = [];
  for (let i = 0; i < n; i++) {
    let id;
    for (let tries = 0; tries < 20; tries++) {
      const neutral = kind !== "boss" && rand(run) < 0.06;
      const rarity = rollRarity(run, kind);
      const pool = neutral ? NEUTRALS().filter((x) => cardById(x).rarity === rarity || rarity === "common") : cardPool(save, run.hero, rarity);
      id = pick(run, pool.length ? pool : cardPool(save, run.hero, "common"));
      if (!out.some((c) => c.id === id)) break;
    }
    out.push({ id, up: run.act >= 2 && rand(run) < (run.act === 2 ? 0.1 : 0.25) && canUpgrade({ id, up: false }) });
  }
  return out;
}

function makeReward(run, kind) {
  const base = kind === "boss" ? rint(run, 95, 110) : kind === "elite" ? rint(run, 28, 38) : rint(run, 12, 20);
  const gold = Math.round(base * goldMult(run));
  const items = [{ type: "gold", n: gold }];
  if (rand(run) * 100 < run.potionChance) { items.push({ type: "potion", id: pick(run, POTION_IDS) }); run.potionChance = Math.max(10, run.potionChance - 10); }
  else run.potionChance = Math.min(80, run.potionChance + 10);
  if (kind === "elite") items.push({ type: "relic", id: randomRelic(run) });
  items.push({ type: "cards", cards: cardChoices(run, kind) });
  run.reward = { kind, items, bossRelics: kind === "boss" ? bossRelicChoices(run) : null };
  run.screen = "reward";
}

function bossRelicChoices(run) {
  const pool = shuffle(run, relicPool(run, "boss"));
  return pool.slice(0, 3);
}

export function takeReward(run, index, choice = null) {
  const r = run.reward;
  if (!r) return false;
  const it = r.items[index];
  if (!it || it.taken) return false;
  switch (it.type) {
    case "gold": run.gold += it.n; run.stats.gold += it.n; break;
    case "potion": if (!addPotion(run, it.id)) return false; break;
    case "relic": if (it.id) gainRelic(run, it.id); break;
    case "cards": {
      if (choice === null) return false;
      const card = it.cards[choice];
      if (!card) return false;
      run.deck.push({ id: card.id, up: card.up });
      break;
    }
    default: return false;
  }
  it.taken = true;
  return true;
}

export function rerollCards(run, index) {
  const it = run.reward?.items[index];
  if (!it || it.type !== "cards" || it.taken || run.rerolls <= 0) return false;
  run.rerolls--;
  it.cards = cardChoices(run, run.reward.kind);
  return true;
}

// Après les récompenses : retour à la carte, ou choix de relique de boss puis acte suivant
export function leaveReward(run) {
  if (run.reward?.kind === "boss") {
    run.screen = run.act >= 3 ? "victory" : "boss-relic";
    if (run.act >= 3) run.combat = null;
    return;
  }
  run.reward = null;
  run.combat = null;
  run.screen = "map";
}

export function takeBossRelic(run, id) {
  if (id && run.reward?.bossRelics?.includes(id)) gainRelic(run, id);
  nextAct(run);
}

function nextAct(run) {
  run.act++;
  run.reward = null;
  run.combat = null;
  run.pos = null;
  run.combatsInAct = 0;
  run.hp = Math.min(run.maxHp, run.hp + Math.ceil((run.maxHp - run.hp) * 0.75));
  run.map = genMap(run);
  run.rerolls = run.metaReroll || 0;
  run.screen = "map";
}

/* =====================================================================
   Déplacement sur la carte et salles
===================================================================== */

export function enterNode(run, row, col) {
  const ok = reachable(run).find((n) => n.row === row && n.col === col);
  if (!ok || run.screen !== "map") return false;
  run.pos = { row, col };
  run.floor++;
  const type = ok.type;
  switch (type) {
    case "fight": startCombat(run, "normal"); break;
    case "elite": startCombat(run, "elite"); break;
    case "boss": startCombat(run, "boss"); break;
    case "rest": run.screen = "rest"; break;
    case "shop": openShop(run); break;
    case "treasure": openTreasure(run); break;
    case "event": openEvent(run); break;
    default: run.screen = "map";
  }
  return true;
}

// ---- Feu de camp ----
export const restHeal = (run) => (has(run, "crown") ? 0 : Math.floor(run.maxHp * ((run.asc >= 4 ? 0.2 : 0.3) + (run.metaCamp || 0) / 100)) + (has(run, "chalice") ? 15 : 0));
export function rest(run, action, deckIndex = null) {
  if (run.screen !== "rest") return false;
  if (action === "heal") run.hp = Math.min(run.maxHp, run.hp + restHeal(run));
  else if (action === "upgrade") {
    const card = run.deck[deckIndex];
    if (!card || !canUpgrade(card)) return false;
    card.up = true;
  } else return false;
  run.screen = "map";
  return true;
}

// ---- Trésor ----
function openTreasure(run) {
  run.screen = "treasure";
  run.treasure = { relic: randomRelic(run, rand(run) * 0.95), gold: Math.round(rint(run, 30, 55) * goldMult(run)), opened: false };
}
export function openChest(run) {
  const t = run.treasure;
  if (!t || t.opened) return false;
  t.opened = true;
  if (t.relic) gainRelic(run, t.relic);
  run.gold += t.gold;
  run.stats.gold += t.gold;
  return true;
}
export function leaveRoom(run) {
  run.treasure = null;
  run.shop = null;
  run.event = null;
  run.screen = "map";
}

// ---- Boutique ----
export const shopPrice = (run, base) => Math.max(1, Math.round(base * (1 - (has(run, "vip") ? 0.2 : 0) - (run.metaShop || 0) / 100)));
function openShop(run) {
  const cardPrice = (id) => ({ common: 50, uncommon: 75, rare: 150 }[cardById(id).rarity] || 60) + rint(run, -5, 8);
  const cards = cardChoices(run, "normal", 5).map((c) => ({ ...c, up: false, price: cardPrice(c.id) }));
  const neutral = shuffle(run, NEUTRALS()).slice(0, 2).map((id) => ({ id, up: false, price: cardPrice(id) + 15 }));
  const sale = rint(run, 0, cards.length - 1);
  cards[sale].price = Math.floor(cards[sale].price / 2);
  cards[sale].sale = true;
  const relics = [];
  for (let i = 0; i < 3; i++) {
    const id = randomRelic(run, i === 2 ? 0.95 : rand(run));
    if (id && !relics.some((r) => r.id === id)) relics.push({ id, price: { common: 150, uncommon: 220, rare: 290 }[relicById(id).tier] + rint(run, -10, 15) });
  }
  const potions = shuffle(run, POTION_IDS.slice()).slice(0, 3).map((id) => ({ id, price: rint(run, 48, 75) }));
  run.shop = { cards: [...cards, ...neutral], relics, potions, removed: false };
  run.screen = "shop";
}
export function buy(run, kind, index) {
  const s = run.shop;
  if (!s) return false;
  const list = s[kind];
  const it = list?.[index];
  if (!it || it.sold) return false;
  const price = shopPrice(run, it.price);
  if (run.gold < price) return false;
  if (kind === "potions" && run.potions.indexOf(null) < 0) return false;
  run.gold -= price;
  it.sold = true;
  if (kind === "cards") run.deck.push({ id: it.id, up: it.up });
  if (kind === "relics") gainRelic(run, it.id);
  if (kind === "potions") addPotion(run, it.id);
  return true;
}
export function removeCard(run, deckIndex) {
  const s = run.shop;
  if (!s || s.removed) return false;
  const price = shopPrice(run, run.removeCost);
  if (run.gold < price || !run.deck[deckIndex]) return false;
  run.gold -= price;
  run.deck.splice(deckIndex, 1);
  run.removeCost += 25;
  s.removed = true;
  return true;
}

/* =====================================================================
   Événements
   Chaque choix : { text, ok(run) → peut-on le choisir, go(run) → texte du résultat (ou un objet { pick: "remove" … }) }
===================================================================== */

const randomCard = (run, rarity) => {
  const pool = cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, rarity);
  return pick(run, pool.length ? pool : cardPool({ ranks: {} }, run.hero, "common"));
};

export const EVENTS = [
  {
    id: "altar", name: "Autel oublié", art: "⛩",
    text: "Au fond d'une ruelle, un autel de pierre couvert de câbles grésille encore. Une voix murmure : « Une offrande de sang, et je te ferai un présent. »",
    choices: [
      { text: "Offrir ton sang (perds 10 PV) : gagne une relique", ok: (r) => r.hp > 10, go: (r) => { r.hp -= 10; const id = randomRelic(r); gainRelic(r, id); return `L'autel s'illumine. Tu obtiens : ${relicById(id)?.name || "rien"}.`; } },
      { text: "Prier en silence : soigne 25 % de tes PV", go: (r) => { const n = Math.floor(r.maxHp * 0.25); r.hp = Math.min(r.maxHp, r.hp + n); return "Une chaleur douce t'envahit."; } },
      { text: "Partir", go: () => "Tu passes ton chemin." }
    ]
  },
  {
    id: "terminal", name: "Terminal piraté", art: "⌨",
    text: "Un vieux terminal affiche des lignes de code qui défilent. Un accès root clignote… mais un pare-feu veille.",
    choices: [
      { text: "Pirater (perds 7 PV) : gagne une carte rare", ok: (r) => r.hp > 7, go: (r) => { r.hp -= 7; const id = randomCard(r, "rare"); r.deck.push({ id, up: false }); return `Accès accordé ! Tu obtiens ${cardById(id).name}.`; } },
      { text: "Siphonner les comptes : gagne 60 or, ajoute Données corrompues", go: (r) => { r.gold += 60; r.deck.push({ id: "glitched", up: false }); return "Les crédits affluent… mais quelque chose s'est glissé dans ton code."; } },
      { text: "Partir", go: () => "Mieux vaut ne pas tenter le diable." }
    ]
  },
  {
    id: "fountain", name: "Fontaine sacrée", art: "⛲",
    text: "Une fontaine d'eau lumineuse purifie tout ce qui la touche. Tes cartes les plus faibles pourraient s'y dissoudre.",
    choices: [
      { text: "Purifier : retire une carte de ton deck", go: () => ({ pick: "remove", done: "La carte se dissout dans l'eau lumineuse." }) },
      { text: "Boire : +5 PV max", go: (r) => { r.maxHp += 5; r.hp += 5; return "Tu te sens plus solide."; } }
    ]
  },
  {
    id: "forge", name: "Forge cybernétique", art: "⚒",
    text: "Un forgeron-androïde t'accueille : « Je peux renforcer une de tes techniques. Ou deux, si tu acceptes d'y laisser un peu de toi. »",
    choices: [
      { text: "Améliorer une carte", go: () => ({ pick: "upgrade", done: "Le métal chante sous le marteau." }) },
      { text: "Améliorer 2 cartes au hasard (perds 6 PV)", ok: (r) => r.hp > 6 && r.deck.filter(canUpgrade).length > 0, go: (r) => { r.hp -= 6; const list = shuffle(r, r.deck.filter(canUpgrade)).slice(0, 2); for (const c of list) c.up = true; return `Améliorées : ${list.map((c) => cardById(c.id).name).join(", ")}.`; } },
      { text: "Partir", go: () => "Le forgeron retourne à son enclume." }
    ]
  },
  {
    id: "library", name: "Bibliothèque céleste", art: "📚",
    text: "Des milliers de grimoires flottent dans les airs. L'un d'eux s'ouvre devant toi.",
    choices: [
      { text: "Lire : choisis une carte parmi 4", go: (r) => ({ pick: "card", cards: cardChoices(r, "elite", 4), done: "Le savoir s'imprime dans ton esprit." }) },
      { text: "Dormir entre les rayons : soigne 33 % de tes PV", go: (r) => { r.hp = Math.min(r.maxHp, r.hp + Math.floor(r.maxHp * 0.33)); return "Un sommeil sans rêve."; } }
    ]
  },
  {
    id: "beggar", name: "L'IA mendiante", art: "🤖",
    text: "Une petite IA abîmée tend un bras mécanique : « Quelques pièces, voyageur ? Je sais effacer ce qui te pèse. »",
    choices: [
      { text: "Donner 40 or : retire une carte", ok: (r) => r.gold >= 40, go: (r) => { r.gold -= 40; return { pick: "remove", done: "L'IA efface la carte avec un bip joyeux." }; } },
      { text: "Lui donner 20 or (karma)", ok: (r) => r.gold >= 20, go: (r) => { r.gold -= 20; r.maxHp += 3; r.hp += 3; return "Tu te sens étrangement bien. +3 PV max."; } },
      { text: "Partir", go: () => "Elle te regarde t'éloigner." }
    ]
  },
  {
    id: "chest", name: "Coffre scellé", art: "🗝",
    text: "Un coffre orné de runes et de circuits. Les runes forment un avertissement : « Malheur à celui qui l'ouvre. »",
    choices: [
      { text: "Ouvrir : gagne une relique et 30 or, mais ajoute une Blessure", go: (r) => { const id = randomRelic(r); gainRelic(r, id); r.gold += 30; r.deck.push({ id: "wound", up: false }); return `Tu obtiens ${relicById(id)?.name || "rien"}… et une vilaine coupure.`; } },
      { text: "Partir", go: () => "La prudence est mère de sûreté." }
    ]
  },
  {
    id: "duelist", name: "Le maître d'armes", art: "🤺",
    text: "Un vieux maître d'armes holographique t'observe. « Montre-moi ta technique. »",
    choices: [
      { text: "S'entraîner (perds 5 PV) : améliore une carte et gagne 1 PV max", ok: (r) => r.hp > 5, go: (r) => { r.hp -= 5; r.maxHp += 1; r.hp += 1; return { pick: "upgrade", done: "« Bien. Très bien. »" }; } },
      { text: "Méditer avec lui : transforme une carte en carte aléatoire", go: () => ({ pick: "transform", done: "Ta technique a changé." }) },
      { text: "Partir", go: () => "Il s'incline poliment." }
    ]
  },
  {
    id: "gamble", name: "Le casino des dieux", art: "🎰",
    text: "Une machine à sous dorée trône au milieu d'un temple. « Mise 50 or. Pile, tu doubles. Face, tu perds. »",
    choices: [
      { text: "Miser 50 or", ok: (r) => r.gold >= 50, go: (r) => { if (rand(r) < 0.5) { r.gold += 50; return "Jackpot ! Tu gagnes 50 or."; } r.gold -= 50; return "Perdu. Les dieux rient."; } },
      { text: "Voler la machine (perds 8 PV) : gagne un stim", ok: (r) => r.hp > 8 && r.potions.includes(null), go: (r) => { r.hp -= 8; addPotion(r, pick(r, POTION_IDS)); return "Tu t'enfuis avec un stim caché dans la machine."; } },
      { text: "Partir", go: () => "La maison gagne toujours." }
    ]
  },
  {
    id: "shrine", name: "Sanctuaire du dragon", art: "🐲",
    text: "Le squelette d'un dragon de données repose ici. Son cœur pulse encore faiblement.",
    choices: [
      { text: "Prendre le cœur (perds 12 % de tes PV max) : gagne une relique rare", ok: (r) => r.maxHp > 30, go: (r) => { const n = Math.floor(r.maxHp * 0.12); r.maxHp -= n; r.hp = Math.min(r.hp, r.maxHp); const pool = relicPool(r, "rare"); const id = pool.length ? pick(r, pool) : randomRelic(r); gainRelic(r, id); return `Tu obtiens ${relicById(id)?.name || "rien"}.`; } },
      { text: "Se recueillir : améliore une carte au hasard", go: (r) => { const list = r.deck.filter(canUpgrade); if (!list.length) return "Rien ne se passe."; const c = pick(r, list); c.up = true; return `${cardById(c.id).name} est améliorée.`; } }
    ]
  }
];
export const EVENT_IDS = EVENTS.map((e) => e.id);
export const eventById = (id) => EVENTS.find((e) => e.id === id);

function openEvent(run) {
  // un événement sur 4 cache en fait un combat ou un marchand (comme dans le genre)
  const r = rand(run);
  if (r < 0.12) { startCombat(run, "normal"); return; }
  if (r < 0.18) { openShop(run); return; }
  run.seenEvents = run.seenEvents || [];
  const pool = EVENT_IDS.filter((id) => !run.seenEvents.includes(id));
  const id = pick(run, pool.length ? pool : EVENT_IDS);
  run.seenEvents.push(id);
  run.event = { id, result: null, pick: null };
  run.screen = "event";
}

export function chooseEvent(run, i) {
  const ev = eventById(run.event?.id);
  if (!ev || run.event.result) return false;
  const ch = ev.choices[i];
  if (!ch || (ch.ok && !ch.ok(run))) return false;
  const res = ch.go(run);
  if (typeof res === "string") run.event.result = res;
  else { run.event.pick = res; run.event.result = null; }
  return true;
}
// Termine un choix « sélection de carte » d'un événement
export function eventPick(run, deckIndex) {
  const pk = run.event?.pick;
  if (!pk) return false;
  if (pk.pick === "remove") { if (!run.deck[deckIndex]) return false; run.deck.splice(deckIndex, 1); }
  else if (pk.pick === "upgrade") { const c = run.deck[deckIndex]; if (!c || !canUpgrade(c)) return false; c.up = true; }
  else if (pk.pick === "transform") {
    const c = run.deck[deckIndex];
    if (!c) return false;
    const pool = [...cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "common"), ...cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "uncommon"), ...cardPool({ ranks: { arch: run.arch || 0 } }, run.hero, "rare")].filter((id) => id !== c.id);
    run.deck[deckIndex] = { id: pick(run, pool), up: false };
  } else if (pk.pick === "card") {
    const card = pk.cards?.[deckIndex];
    if (card) run.deck.push({ id: card.id, up: card.up });
  }
  run.event.result = pk.done;
  run.event.pick = null;
  return true;
}
export function skipEventPick(run) {
  if (!run.event?.pick) return false;
  run.event.result = "Tu laisses passer l'occasion.";
  run.event.pick = null;
  return true;
}

/* =====================================================================
   Fin de partie : éclats et statistiques
===================================================================== */

export function shardsFor(run, won) {
  const floors = run.floor;
  const base = floors * 2 + run.stats.elites * 6 + run.stats.bosses * 25 + (won ? 40 : 0);
  return Math.round(base * (1 + run.asc * 0.1));
}

// Clôt la partie : met à jour la sauvegarde. Renvoie le résumé (éclats gagnés, ascension débloquée…).
export function finishRun(save, run, won) {
  const shards = shardsFor(run, won);
  save.shards += shards;
  const s = save.stats;
  s.runs++;
  if (won) s.wins++;
  s.bestFloor = Math.max(s.bestFloor, run.floor);
  s.kills += run.stats.kills;
  s.elites += run.stats.elites;
  s.bosses += run.stats.bosses;
  s.cards += run.stats.cards;
  s.damage += run.stats.damage;
  s.maxHit = Math.max(s.maxHit, run.stats.maxHit);
  s.earned += shards;
  let ascUnlocked = null;
  if (won && run.asc >= (save.asc[run.hero] || 0) && run.asc < ASC_MAX) {
    save.asc[run.hero] = run.asc + 1;
    ascUnlocked = run.asc + 1;
  }
  for (const id of run.relics) if (!save.seenRelics.includes(id)) save.seenRelics.push(id);
  for (const c of run.deck) if (!save.seenCards.includes(c.id)) save.seenCards.push(c.id);
  save.run = null;
  return { shards, won, ascUnlocked, floor: run.floor, bosses: run.stats.bosses };
}

export function buyMeta(save, id) {
  const m = metaById(id);
  if (!m) return false;
  const r = rank(save, id);
  if (r >= m.max) return false;
  const cost = m.cost(r);
  if (save.shards < cost) return false;
  save.shards -= cost;
  save.ranks[id] = r + 1;
  return true;
}
export function buyHero(save, id) {
  const h = HEROES.find((x) => x.id === id);
  if (!h || save.heroes.includes(id) || save.shards < h.cost) return false;
  save.shards -= h.cost;
  save.heroes.push(id);
  return true;
}

// Note les ennemis rencontrés (codex)
export function noteEnemies(save, run) {
  if (!run.combat) return;
  for (const e of run.combat.enemies) if (!save.seenEnemies.includes(e.id)) save.seenEnemies.push(e.id);
}

