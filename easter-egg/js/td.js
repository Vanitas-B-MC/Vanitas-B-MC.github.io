// js/td.js — logique pure du Tower Defense « Pare-feu » (aucun accès au DOM, donc testable).
// Séparée de l'affichage (ui-td.js).
//
// Deux monnaies, à ne pas confondre :
//   - l'ÉNERGIE (state.gold) : sert à poser et améliorer des tours PENDANT une partie ;
//   - les CRÉDITS (portefeuille) : servent à DÉBLOQUER un type de tour pour de bon.
//     Chaque vague survivie rapporte aussi quelques crédits.
//
// Inspiré de Bloons TD6 : 3 chemins d'amélioration par tour (4 paliers chacun), ciblage réglable,
// capacités actives, boss à pouvoirs, étourdissement limité (durée plafonnée + immunité ensuite).

export const COLS = 14;
export const ROWS = 9;
export const CELL = 40;

export const START_LIVES = 20;      // valeurs de la difficulté « Normal »
export const START_GOLD = 140;
export const SELL_RATIO = 0.6;

// Paragon (comme Bloons TD6) : on fusionne 3 tours d'un même type ayant un chemin au palier 4. Une seule par type.
export const PARAGON_NEED = 3;
export const PARAGON_COST_MUL = 25;      // coût = coût de pose × 25
export const PARAGON_MAX_DEGREE = 20;

export const PATH_COUNT = 3;        // chemins d'amélioration par tour
export const MAX_TIER = 4;          // paliers par chemin ; le palier 4 est l'amélioration ultime du chemin

/* ---------- Difficulté ---------- */

// lives / gold : vies et énergie de départ. hp : solidité des ennemis. reward : multiplicateur de crédits.
export const DIFFICULTIES = [
  { id: "facile",    name: "Facile",    desc: "Plus de vies et d'énergie, ennemis moins solides. Crédits ×0,6, ne bat pas le record.", lives: 30, gold: 200, hp: 0.75, reward: 0.6, record: false },
  { id: "normal",    name: "Normal",    desc: "L'équilibre prévu.",                                                                     lives: 20, gold: 140, hp: 1,    reward: 1,   record: true },
  { id: "difficile", name: "Difficile", desc: "Peu de vies, ennemis plus solides. Crédits ×1,5.",                                       lives: 12, gold: 110, hp: 1.3,  reward: 1.5, record: true }
];
export const DEFAULT_DIFFICULTY = "normal";
export const diffById = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];

/* ---------- Cartes et chemins des ennemis ---------- */

// Points de passage en cases (le chemin entre et sort hors de l'écran ou s'arrête au centre).
// unlock : crédits pour débloquer la carte. hpMul : solidité des ennemis. reward : multiplicateur de crédits.
export const MAPS = [
  { id: "serpent",    name: "Serpent",    desc: "Le classique : trois virages.",              unlock: 0,    hpMul: 1,    reward: 1,
    waypoints: [[-1, 1], [11, 1], [11, 4], [2, 4], [2, 7], [14, 7]] },
  { id: "spirale",    name: "Spirale",    desc: "Un long chemin qui s'enroule vers le cœur.", unlock: 1500, hpMul: 1.15, reward: 1.5,
    waypoints: [[-1, 7], [12, 7], [12, 1], [1, 1], [1, 5], [8, 5]] },
  { id: "zigzag",     name: "Zigzag",     desc: "Sept virages serrés : peu de place pour les tours.", unlock: 5000, hpMul: 1.3,  reward: 2,
    waypoints: [[-1, 4], [3, 4], [3, 1], [8, 1], [8, 7], [12, 7], [12, 4], [14, 4]] },
  { id: "labyrinthe", name: "Labyrinthe", desc: "Un très long chemin : beaucoup d'ennemis, beaucoup de crédits.", unlock: 15000, hpMul: 1.5, reward: 2.6,
    waypoints: [[-1, 1], [12, 1], [12, 3], [1, 3], [1, 5], [12, 5], [12, 7], [14, 7]] }
];
export const MAP_IDS = MAPS.map((m) => m.id);
export const FREE_MAP = "serpent";
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

// Prépare un chemin : points en pixels, segments, longueur et cases interdites.
function buildMap(def) {
  const points = def.waypoints.map(([c, r]) => [(c + 0.5) * CELL, (r + 0.5) * CELL]);
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    segments.push({ x1, y1, x2, y2, length, start: total });
    total += length;
  }
  const cells = new Set();
  for (let i = 0; i < def.waypoints.length - 1; i++) {
    const [c1, r1] = def.waypoints[i];
    const [c2, r2] = def.waypoints[i + 1];
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) cells.add(`${c},${r}`);
    }
  }
  return { ...def, points, segments, length: total, cells };
}

const BUILT = Object.fromEntries(MAPS.map((m) => [m.id, buildMap(m)]));
export const builtMap = (id) => BUILT[id] || BUILT[FREE_MAP];

// Compatibilité : chemin de la première carte.
export const WAYPOINTS = MAPS[0].waypoints;
export const PATH_LENGTH = BUILT[FREE_MAP].length;
export const PATH_POINTS = BUILT[FREE_MAP].points;

export const isPathCell = (col, row, map = BUILT[FREE_MAP]) => map.cells.has(`${col},${row}`);

// Position (en pixels) d'un ennemi qui a parcouru `dist` pixels du chemin.
export function pointAt(dist, map = BUILT[FREE_MAP]) {
  const d = Math.min(Math.max(dist, 0), map.length);
  const seg = map.segments.find((s) => d <= s.start + s.length) || map.segments[map.segments.length - 1];
  const t = seg.length === 0 ? 0 : (d - seg.start) / seg.length;
  return { x: seg.x1 + (seg.x2 - seg.x1) * t, y: seg.y1 + (seg.y2 - seg.y1) * t };
}

/* ---------- Tours ---------- */

export const FREE_TOWER = "laser";

// cost : énergie pour la poser. unlock : crédits pour la débloquer (0 = gratuite).
// range en cases, rate en tirs par seconde.
export const TOWER_DEFS = {
  laser:  { id: "laser",  name: "Laser",           desc: "Tir rapide, dégâts faibles. Bon partout.",             cost: 50,  unlock: 0,    range: 2.7, rate: 2.2,  dmg: 7,  color: "#00f0ff" },
  cryo:   { id: "cryo",   name: "Tour cryo",       desc: "Ralentit les ennemis de 50 % pendant 2 s. Peut les geler.", cost: 70,  unlock: 150,  range: 2.5, rate: 1.4,  dmg: 3,  color: "#7fd8ff", slow: 0.5,  slowTime: 2 },
  canon:  { id: "canon",  name: "Canon à plasma",  desc: "Dégâts de zone : idéal contre les groupes.",           cost: 95,  unlock: 400,  range: 2.9, rate: 0.8,  dmg: 34, color: "#ff8a3d", splash: 1.15 },
  sniper: { id: "sniper", name: "Sniper",          desc: "Portée immense et gros dégâts, mais lent.",            cost: 120, unlock: 900,  range: 6,   rate: 0.5,  dmg: 100, color: "#fcee0a" },
  tesla:  { id: "tesla",  name: "Tesla",           desc: "Un éclair qui rebondit sur 3 ennemis et peut les étourdir.", cost: 140, unlock: 1800, range: 2.7, rate: 1.2,  dmg: 26, color: "#b58cff", chain: 3 },
  venin:  { id: "venin",  name: "Injecteur viral", desc: "Empoisonne : dégâts sur la durée, ignore le blindage.", cost: 110, unlock: 1200, range: 2.6, rate: 1.3,  dmg: 6,  color: "#3ddc84", poisonDps: 18, poisonTime: 4 },
  mortier:{ id: "mortier", name: "Mortier",        desc: "Portée énorme, énormes dégâts de zone, très lent.",    cost: 150, unlock: 5000, range: 5,   rate: 0.3,  dmg: 90, color: "#ffb347", splash: 1.7 },
  gatling:{ id: "gatling", name: "Gatling",         desc: "Cadence folle, dégâts minuscules. Achève les essaims.", cost: 130, unlock: 7000, range: 2.4, rate: 6,    dmg: 4,  color: "#e6e6e6" },
  pulsar: { id: "pulsar", name: "Pulsar",          desc: "Onde qui touche tous les ennemis proches.",            cost: 160, unlock: 3000, range: 2.2, rate: 0.7,  dmg: 24, color: "#ff6bd6", pulse: true },
  beacon: { id: "beacon", name: "Beacon",         desc: "Ne tire pas : booste les tours voisines (dégâts, cadence). Plusieurs beacons se cumulent.", cost: 120, unlock: 9000,  range: 2.2, rate: 0, dmg: 0, color: "#4dffd2", support: true },
  miner:  { id: "miner",  name: "Data Miner",      desc: "Ne tire pas : produit de l'énergie à la fin de chaque vague.",  cost: 100, unlock: 4000,  range: 0,   rate: 0, dmg: 0, color: "#5b9bff", income: true },
  dartling: { id: "dartling", name: "Dartling", desc: "Tir en ligne : chaque salve transperce plusieurs ennemis alignés. Au bout du chemin 1, le Rayon de la mort.", cost: 110, unlock: 6000, range: 3, rate: 5, dmg: 7, color: "#ffe14d", line: true },
  desperado: { id: "desperado", name: "Desperado", desc: "Duelliste : tire d'autant plus vite qu'il y a peu d'ennemis à portée. Critiques à longue distance, salves de revolver.", cost: 150, unlock: 12000, range: 3.2, rate: 1.5, dmg: 26, color: "#ff9f5a" }
};
export const TOWER_IDS = Object.keys(TOWER_DEFS);
export const LINE_WIDTH = 11;           // demi-largeur (px) du tir en ligne du Dartling

/* ---------- Chemins d'amélioration ---------- */
// Règles (comme Bloons TD6) : une tour utilise au plus 2 chemins, et un seul chemin peut dépasser le palier 2.
// Coût d'un palier = coût de pose × cost. Le palier 4 du chemin 3 donne une capacité active.
//
// fx — multiplicateurs : dmg, rate, range, poisonDps, income, boostDamage, boostRate
//      ajouts : targets, splash, chain, chainReach, spreadCount, spreadRadius, crit, boostRange,
//               poisonTime, slowTime, pulseSlowTime, interest
//      minimums (on garde le plus haut) : stun, slow, freezeChance, freezeTime, pulseSlow, critMul, execute, chainFalloff
//      pierce (vrai/faux), ability (nom d'une capacité de ABILITIES)
const U = (name, cost, fx) => ({ name, cost, fx });

export const PATH_NAMES = {
  laser:   ["Optique", "Cadence", "Puissance"],
  cryo:    ["Froid", "Gel", "Givre"],
  canon:   ["Explosif", "Choc", "Artillerie"],
  sniper:  ["Précision", "Cadence", "Pénétration"],
  tesla:   ["Arcs", "Choc", "Puissance"],
  venin:   ["Toxine", "Contagion", "Injection"],
  mortier: ["Zone", "Choc", "Artillerie"],
  gatling: ["Munitions", "Cadence", "Multi-canon"],
  pulsar:  ["Onde", "Entrave", "Cadence"],
  beacon:  ["Dégâts", "Cadence", "Réseau"],
  miner:   ["Rendement", "Intérêts", "Surcadence"],
  dartling: ["Perforation", "Cadence", "Armement"],
  desperado: ["Duel", "Précision", "Barillet"]
};

export const UPGRADES = {
  laser: [
    [U("Lentille focale", 0.6, { range: 1.15, dmg: 1.2 }), U("Double faisceau", 1.1, { targets: 1 }), U("Triple faisceau", 2.2, { targets: 1, dmg: 1.3 }), U("Prisme", 4.8, { targets: 2, crit: 0.2, critMul: 2.5 })],
    [U("Condensateurs", 0.6, { rate: 1.3 }), U("Surcadence", 1.2, { rate: 1.3 }), U("Mitrailleuse laser", 2.4, { rate: 1.4, dmg: 1.2 }), U("Chaîne infinie", 5, { rate: 1.6 })],
    [U("Diodes", 0.7, { dmg: 1.4 }), U("Perforant", 1.3, { pierce: true, dmg: 1.2 }), U("Rayon thermique", 2.5, { dmg: 1.6 }), U("Surcharge", 5.5, { dmg: 1.6, ability: "overdrive" })]
  ],
  cryo: [
    [U("Compresseur", 0.5, { slow: 0.6, slowTime: 1 }), U("Azote liquide", 1, { slow: 0.7, slowTime: 1, range: 1.1 }), U("Cryo-zone", 2.2, { splash: 1, slowTime: 1 }), U("Âge glaciaire", 4.5, { splash: 0.5, slow: 0.75, dmg: 2 })],
    [U("Cristallisation", 0.7, { freezeChance: 0.15, freezeTime: 0.6 }), U("Gel profond", 1.3, { freezeChance: 0.25, freezeTime: 0.8 }), U("Permafrost", 2.5, { freezeChance: 0.35, freezeTime: 1, rate: 1.2 }), U("Cœur de glace", 5, { freezeChance: 0.5, rate: 1.3, splash: 0.4 })],
    [U("Éclats", 0.6, { dmg: 2 }), U("Lames de givre", 1.2, { dmg: 1.8, range: 1.1 }), U("Tempête de glace", 2.4, { rate: 1.5, pierce: true }), U("Zéro absolu", 5, { splash: 0.8, dmg: 1.8, ability: "absolute" })]
  ],
  canon: [
    [U("Charge creuse", 0.6, { splash: 0.25, dmg: 1.2 }), U("Napalm", 1.2, { splash: 0.25, dmg: 1.3 }), U("Fragmentation", 2.5, { splash: 0.4, dmg: 1.4 }), U("Cataclysme", 5.2, { splash: 0.6, dmg: 1.8 })],
    [U("Onde de choc", 0.6, { stun: 0.3 }), U("Sidération", 1.1, { stun: 0.5, rate: 1.2 }), U("Choc répété", 2.3, { stun: 0.7, rate: 1.3 }), U("Séisme", 4.8, { stun: 0.9, splash: 0.3, rate: 1.3 })],
    [U("Rechargeur", 0.7, { rate: 1.3 }), U("Canon long", 1.3, { range: 1.2, dmg: 1.2 }), U("Double canon", 2.6, { targets: 1 }), U("Bombardier", 5.5, { targets: 1, rate: 1.3, ability: "barrage" })]
  ],
  sniper: [
    [U("Lunette", 0.6, { crit: 0.15, critMul: 3 }), U("Visée laser", 1.2, { crit: 0.15 }), U("Tir fatal", 2.5, { crit: 0.15, critMul: 4 }), U("Œil de dieu", 5.2, { crit: 0.2, execute: 0.3 })],
    [U("Culasse rapide", 0.6, { rate: 1.3 }), U("Chargeur", 1.2, { rate: 1.4 }), U("Semi-auto", 2.4, { rate: 1.5 }), U("Tireur d'élite", 5, { rate: 1.6, dmg: 1.3 })],
    [U("Balles AP", 0.7, { pierce: true, dmg: 1.3 }), U("Munitions HE", 1.3, { dmg: 1.6 }), U("Anti-matériel", 2.6, { dmg: 2, range: 1.15 }), U("Railgun", 5.6, { dmg: 2.5, targets: 1, ability: "headshot" })]
  ],
  tesla: [
    [U("Bobines", 0.6, { chain: 1, chainReach: 0.3 }), U("Surtension", 1.2, { chain: 2, dmg: 1.2 }), U("Foudre en chaîne", 2.5, { chain: 3, chainFalloff: 0.95 }), U("Orage", 5.2, { chain: 5, chainFalloff: 1, dmg: 1.3 })],
    [U("Décharge", 0.6, { stun: 0.25 }), U("Paralysie", 1.1, { stun: 0.4, dmg: 1.2 }), U("Électrocution", 2.3, { stun: 0.6, rate: 1.2 }), U("Tétanie", 5, { stun: 0.8, chain: 2, rate: 1.2 })],
    [U("Condensateur", 0.7, { dmg: 1.4 }), U("Générateur", 1.3, { dmg: 1.5, range: 1.1 }), U("Réacteur", 2.7, { rate: 1.5 }), U("Tempête", 5.6, { dmg: 1.8, ability: "storm" })]
  ],
  venin: [
    [U("Concentré", 0.6, { poisonDps: 1.4 }), U("Neurotoxine", 1.2, { poisonDps: 1.5 }), U("Acide", 2.4, { poisonDps: 1.6, poisonTime: 2 }), U("Nécrose", 5, { poisonDps: 2, poisonTime: 3 })],
    [U("Spores", 0.7, { spreadCount: 1, spreadRadius: 1.2 }), U("Vecteurs", 1.3, { spreadCount: 1, spreadRadius: 0.4 }), U("Épidémie", 2.5, { spreadCount: 2, spreadRadius: 0.4, rate: 1.2 }), U("Contagion totale", 5.2, { spreadCount: 4, spreadRadius: 0.6, range: 1.15 })],
    [U("Seringue", 0.6, { rate: 1.3 }), U("Double dose", 1.2, { targets: 1 }), U("Trio", 2.4, { targets: 1, rate: 1.3 }), U("Virulence", 5.4, { dmg: 2, poisonDps: 1.4, ability: "plague" })]
  ],
  mortier: [
    [U("Charge lourde", 0.6, { splash: 0.3 }), U("Explosif brisant", 1.2, { splash: 0.3, dmg: 1.2 }), U("Obus à grappes", 2.5, { splash: 0.5, dmg: 1.3 }), U("Napalm", 5.2, { splash: 0.7, dmg: 1.6 })],
    [U("Onde de choc", 0.6, { stun: 0.3 }), U("Sidération", 1.1, { stun: 0.5, rate: 1.2 }), U("Choc répété", 2.3, { stun: 0.7, rate: 1.3 }), U("Double obus", 4.8, { stun: 0.9, targets: 1 })],
    [U("Rechargeur", 0.7, { rate: 1.4 }), U("Tube long", 1.3, { range: 1.2, dmg: 1.3 }), U("Chargeur auto", 2.6, { targets: 1, rate: 1.3 }), U("Pilonnage", 5.5, { targets: 1, dmg: 1.5, ability: "carpet" })]
  ],
  gatling: [
    [U("Perforant", 0.7, { pierce: true }), U("Tungstène", 1.3, { dmg: 1.5 }), U("Explosif", 2.5, { dmg: 1.5, crit: 0.1 }), U("Uranium", 5, { dmg: 2, crit: 0.1 })],
    [U("Moteur", 0.6, { rate: 1.3 }), U("Surrégime", 1.2, { rate: 1.3 }), U("Refroidisseur", 2.4, { rate: 1.4, range: 1.1 }), U("Fusion", 5, { rate: 1.6 })],
    [U("Deux canons", 0.8, { targets: 1 }), U("Trois canons", 1.4, { targets: 1 }), U("Barillet", 2.6, { targets: 1, rate: 1.2 }), U("Tempête d'acier", 5.5, { targets: 2, dmg: 1.5, ability: "frenzy" })]
  ],
  pulsar: [
    [U("Antenne", 0.6, { range: 1.15 }), U("Amplificateur", 1.2, { dmg: 1.4 }), U("Résonance", 2.5, { range: 1.2, dmg: 1.4 }), U("Onde colossale", 5, { dmg: 2, range: 1.2 })],
    [U("Brouillage", 0.7, { pulseSlow: 0.3, pulseSlowTime: 1.2 }), U("Entrave", 1.3, { pulseSlow: 0.45, pulseSlowTime: 0.5 }), U("Paralysie", 2.5, { stun: 0.4, pulseSlow: 0.6 }), U("Verrou", 5, { stun: 0.7, pulseSlow: 0.7, pulseSlowTime: 1 })],
    [U("Pompe", 0.6, { rate: 1.3 }), U("Double pompe", 1.2, { rate: 1.3 }), U("Surchauffe", 2.5, { rate: 1.4, dmg: 1.2 }), U("Choc sismique", 5.5, { rate: 1.5, dmg: 1.5, ability: "shock" })]
  ],
  beacon: [
    [U("Relais", 0.6, { boostDamage: 1.3 }), U("Amplis", 1.2, { boostDamage: 1.3 }), U("Surpuissance", 2.5, { boostDamage: 1.4 }), U("Matrice", 5, { boostDamage: 1.6 })],
    [U("Horloge", 0.6, { boostRate: 1.3 }), U("Overclock", 1.2, { boostRate: 1.3 }), U("Surrégime", 2.5, { boostRate: 1.4 }), U("Fréquence folle", 5, { boostRate: 1.6 })],
    [U("Antenne", 0.7, { range: 1.15 }), U("Portée étendue", 1.3, { range: 1.15, boostRange: 0.07 }), U("Réseau maillé", 2.6, { range: 1.15, boostDamage: 1.2 }), U("Surtension", 5.4, { range: 1.2, boostRate: 1.2, boostDamage: 1.2, ability: "surge" })]
  ],
  miner: [
    [U("Processeur", 0.6, { income: 1.4 }), U("Grappe", 1.2, { income: 1.4 }), U("Ferme de calcul", 2.4, { income: 1.5 }), U("Supercalculateur", 5, { income: 2 })],
    [U("Placement", 0.7, { interest: 0.01 }), U("Épargne", 1.3, { interest: 0.015 }), U("Portefeuille", 2.5, { interest: 0.02 }), U("Marché noir", 5, { interest: 0.03, income: 1.2 })],
    [U("Refroidissement", 0.6, { income: 1.2 }), U("Overclock", 1.2, { income: 1.2 }), U("Minage groupé", 2.4, { income: 1.3 }), U("Dividende", 5.4, { income: 1.5, ability: "dividend" })]
  ],
  // Dartling : chemin 1 = perforation jusqu'au Rayon de la mort (touche tous les ennemis de la ligne)
  dartling: [
    [U("Ailettes", 0.6, { pierceN: 2, dmg: 1.2 }), U("Pointes de tungstène", 1.2, { pierceN: 3, dmg: 1.3 }), U("Faisceau laser", 2.5, { pierceN: 5, dmg: 1.5, range: 1.1 }), U("Rayon de la mort", 5.5, { pierceN: 99, dmg: 2.5, rate: 1.5 })],
    [U("Moteur", 0.6, { rate: 1.3 }), U("Barillet rapide", 1.2, { rate: 1.3 }), U("Mitrailleuse", 2.4, { rate: 1.4, range: 1.1 }), U("Hyper-rafale", 5, { rate: 1.6, dmg: 1.3 })],
    [U("Gros calibre", 0.7, { dmg: 1.5 }), U("Canons jumeaux", 1.4, { targets: 1 }), U("Triple canon", 2.6, { targets: 1, dmg: 1.3 }), U("Rayon fatal", 5.5, { targets: 1, dmg: 1.6, ability: "deathbeam" })]
  ],
  // Desperado : duel (cadence selon le nombre d'ennemis), critiques à distance, salves
  desperado: [
    [U("Dégaine rapide", 0.6, { quick: 0.5 }), U("Colt long", 1.2, { dmg: 1.3, rate: 1.1 }), U("Gros calibre", 2.4, { duel: 1.2, dmg: 1.2 }), U("Soleil de plomb", 5.2, { dmg: 2, duel: 0.6, rate: 1.2 })],
    [U("Visée", 0.6, { critFar: 0.1, critMul: 2.5 }), U("Mouche", 1.2, { critFar: 0.15, range: 1.1 }), U("Œil de lynx", 2.5, { critFar: 0.2, critMul: 3.5, pierce: true }), U("Fantôme du désert", 5, { crit: 0.15, critFar: 0.25, execute: 0.2, range: 1.2 })],
    [U("Errant", 0.7, { burst: 1 }), U("Face à face", 1.3, { burst: 1, rate: 1.2 }), U("Six coups", 2.6, { burst: 2, rate: 1.1 }), U("Twin Sixes", 5.6, { burst: 4, dmg: 1.2, ability: "highnoon" })]
  ]
};

const MUL = { dmg: "damage", rate: "rate", range: "range", poisonDps: "poisonDps", income: "income", boostDamage: "boostDamage", boostRate: "boostRate" };
const ADD = new Set(["burst", "duel", "quick", "critFar", "pierceN", "targets", "splash", "chain", "chainReach", "spreadCount", "spreadRadius", "crit", "boostRange", "poisonTime", "slowTime", "pulseSlowTime", "interest"]);

function applyFx(st, fx) {
  for (const [k, v] of Object.entries(fx)) {
    if (MUL[k]) st[MUL[k]] *= v;
    else if (ADD.has(k)) st[k] += v;
    else if (k === "pierce" || k === "ability") st[k] = v;
    else st[k] = Math.max(st[k], v);
  }
}

// Caractéristiques d'une tour selon ses paliers [chemin 1, chemin 2, chemin 3].
export function towerStats(def, tiers = [0, 0, 0]) {
  const st = {
    damage: def.dmg, range: def.range * CELL, rate: def.rate,                 // portée en pixels
    targets: 1, splash: def.splash || 0, chain: def.chain || 0, chainFalloff: 0.85, chainReach: 2,
    stun: 0, slow: def.slow || 0, slowTime: def.slowTime || 0, freezeChance: 0, freezeTime: 0,
    poisonDps: def.poisonDps || 0, poisonTime: def.poisonTime || 0,
    spreadCount: 0, spreadRadius: 0, crit: 0, critMul: 2, pierce: false, execute: 0,
    pulseSlow: 0, pulseSlowTime: 0, pierceN: def.line ? 3 : 0, burst: 0, duel: 0, quick: 0, critFar: 0,
    boostDamage: def.id === "beacon" ? 0.2 : 0, boostRate: def.id === "beacon" ? 0.15 : 0, boostRange: 0,
    income: def.id === "miner" ? 24 : 0, interest: 0, ability: null
  };
  const paths = UPGRADES[def.id];
  for (let p = 0; p < PATH_COUNT; p++) {
    for (let t = 0; t < (tiers[p] || 0); t++) applyFx(st, paths[p][t].fx);
  }
  st.crit = Math.min(st.crit, 0.9);
  return st;
}

export const towerDamage = (def, tiers) => towerStats(def, tiers).damage;
export const towerRange = (def, tiers) => towerStats(def, tiers).range;
export const upgradeCostOf = (def, path, tier) => Math.round(def.cost * UPGRADES[def.id][path][tier].cost);

// Description automatique d'une amélioration (affichée sur le bouton).
export function describeFx(fx) {
  const pct = (m) => `+${Math.round((m - 1) * 100)} %`;
  const out = [];
  if (fx.dmg) out.push(`${pct(fx.dmg)} dégâts`);
  if (fx.rate) out.push(`${pct(fx.rate)} cadence`);
  if (fx.range) out.push(`${pct(fx.range)} portée`);
  if (fx.targets) out.push(`+${fx.targets} cible${fx.targets > 1 ? "s" : ""}`);
  if (fx.splash) out.push(`explosion +${fx.splash} case`);
  if (fx.chain) out.push(`+${fx.chain} rebond${fx.chain > 1 ? "s" : ""}`);
  if (fx.chainFalloff && fx.chainFalloff >= 0.95) out.push("rebonds sans perte");
  if (fx.stun) out.push(`étourdit ${String(fx.stun).replace(".", ",")} s`);
  if (fx.slow) out.push(`ralentit de ${Math.round(fx.slow * 100)} %`);
  if (fx.slowTime) out.push(`+${fx.slowTime} s de ralentissement`);
  if (fx.freezeChance) out.push(`${Math.round(fx.freezeChance * 100)} % de gel (${String(fx.freezeTime).replace(".", ",")} s)`);
  else if (fx.freezeTime) out.push(`gel ${String(fx.freezeTime).replace(".", ",")} s`);
  if (fx.poisonDps) out.push(`${pct(fx.poisonDps)} poison`);
  if (fx.poisonTime) out.push(`+${fx.poisonTime} s de poison`);
  if (fx.spreadCount) out.push(`propage à ${fx.spreadCount} voisin${fx.spreadCount > 1 ? "s" : ""} de plus`);
  if (fx.crit) out.push(`+${Math.round(fx.crit * 100)} % critique`);
  if (fx.critMul) out.push(`critiques ×${String(fx.critMul).replace(".", ",")}`);
  if (fx.execute) out.push(`exécute sous ${Math.round(fx.execute * 100)} % PV`);
  if (fx.pierce) out.push("ignore le blindage");
  if (fx.pierceN) out.push(fx.pierceN >= 50 ? "transperce toute la ligne" : `transperce +${fx.pierceN} ennemis`);
  if (fx.burst) out.push(`+${fx.burst} tir${fx.burst > 1 ? "s" : ""} par salve`);
  if (fx.duel) out.push(`jusqu'à +${Math.round(fx.duel * 100)} % cadence si peu d'ennemis`);
  if (fx.quick) out.push(`jusqu'à +${Math.round(fx.quick * 100)} % cadence sur cible lointaine`);
  if (fx.critFar) out.push(`jusqu'à +${Math.round(fx.critFar * 100)} % critique à longue portée`);
  if (fx.pulseSlow) out.push(`l'onde ralentit de ${Math.round(fx.pulseSlow * 100)} %`);
  if (fx.boostDamage) out.push(`${pct(fx.boostDamage)} effet dégâts`);
  if (fx.boostRate) out.push(`${pct(fx.boostRate)} effet cadence`);
  if (fx.boostRange) out.push(`alliés +${Math.round(fx.boostRange * 100)} % portée`);
  if (fx.income) out.push(`${pct(fx.income)} énergie`);
  if (fx.interest) out.push(`+${String(fx.interest * 100).replace(".", ",")} % d'intérêts`);
  if (fx.ability) out.push(`CAPACITÉ : ${ABILITIES[fx.ability].name}`);
  return out.join(" · ");
}

// Les paliers atteints dans l'ordre, pour afficher « Prisme + Surcharge » etc.
export function ownedUpgrades(tower) {
  const list = [];
  for (let p = 0; p < PATH_COUNT; p++) for (let t = 0; t < tower.tiers[p]; t++) list.push(UPGRADES[tower.type][p][t]);
  return list;
}

// Règles des chemins : renvoie { up, price, tier, locked, affordable } pour le prochain palier d'un chemin.
// locked : "max" (palier 4 atteint) | "paths" (déjà 2 chemins utilisés) | "crossed" (un autre chemin dépasse déjà le palier 2).
export function upgradeInfo(state, tower, path) {
  const def = TOWER_DEFS[tower.type];
  const t = tower.tiers[path];
  if (t >= MAX_TIER) return { locked: "max", tier: t, affordable: false };
  const up = UPGRADES[def.id][path][t];
  const others = tower.tiers.filter((_, i) => i !== path);
  const next = t + 1;
  let locked = null;
  if (t === 0 && others.filter((x) => x > 0).length >= 2) locked = "paths";
  else if (next >= 3 && others.some((x) => x >= 3)) locked = "crossed";
  const price = upgradeCostOf(def, path, t);
  return { up, price, tier: next, locked, affordable: state.gold >= price };
}

// Énergie dépensée au total pour une tour (pose + améliorations) : sert à calculer la revente.
export function invested(tower) {
  if (tower.paragon) return tower.paragon.spent;
  const def = TOWER_DEFS[tower.type];
  let sum = def.cost;
  for (let p = 0; p < PATH_COUNT; p++) for (let t = 0; t < tower.tiers[p]; t++) sum += upgradeCostOf(def, p, t);
  return sum;
}

/* ---------- Ciblage ---------- */

export const TARGET_MODES = ["first", "last", "strong", "close"];
export const TARGET_LABELS = { first: "Premier", last: "Dernier", strong: "Plus fort", close: "Plus proche" };

function sortTargets(list, mode, origin) {
  if (mode === "last") list.sort((a, b) => a.dist - b.dist);
  else if (mode === "strong") list.sort((a, b) => b.hp - a.hp);
  else if (mode === "close") list.sort((a, b) => dist2(origin, a) - dist2(origin, b));
  else list.sort((a, b) => b.dist - a.dist);
  return list;
}

export function setTargetMode(state, id, mode) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || !TARGET_MODES.includes(mode)) return false;
  tower.target = mode;
  return true;
}

export function cycleTargetMode(state, id) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower) return null;
  tower.target = TARGET_MODES[(TARGET_MODES.indexOf(tower.target) + 1) % TARGET_MODES.length];
  return tower.target;
}

/* ---------- Ennemis et vagues ---------- */

// Étourdissement : durée plafonnée, impossible à prolonger, et immunité juste après. Un ennemi ne peut donc
// jamais rester bloqué : au mieux STUN_CAP s à l'arrêt, puis STUN_IMMUNITY s obligatoires en mouvement.
export const STUN_CAP = 1;
export const STUN_IMMUNITY = 2.5;
export const STUN_IMMUNITY_BOSS = 6;
export const SLOW_CAP = 0.75;
export const SLOW_CAP_BOSS = 0.35;

// hp : multiplicateur de points de vie. speed : cases par seconde. gold : énergie gagnée à la mort.
export const ENEMY_DEFS = {
  drone:  { name: "Drone",  hp: 1,    speed: 1.5, gold: 4,  lives: 1, color: "#ff2a6d" },
  runner: { name: "Sprint", hp: 0.55, speed: 2.5, gold: 5,  lives: 1, color: "#fcee0a" },
  tank:   { name: "Blindé", hp: 3.4,  speed: 0.9, gold: 10, lives: 2, color: "#a066ff" },
  armored:{ name: "Cuirassé", hp: 2.2, speed: 1.1, gold: 9,  lives: 2, color: "#9aa5b1", armor: 5 },
  swarm:  { name: "Essaim",  hp: 0.25, speed: 2.0, gold: 2,  lives: 1, color: "#ffd1e8" },
  // Boss : un type différent toutes les 10 vagues, chacun avec un pouvoir.
  boss:   { name: "Virus",     hp: 10, speed: 0.7,  gold: 70,  lives: 5,  color: "#ffffff", boss: true, spawnAt: [0.66, 0.33], power: "Libère des drones à 66 % et 33 % de PV" },
  boss2:  { name: "Rootkit",   hp: 8, speed: 0.8,  gold: 90,  lives: 5,  color: "#ff6bd6", boss: true, armor: 4, jam: { every: 6, radius: 3, time: 3 }, power: "Brouille les tours proches toutes les 6 s (elles ne tirent plus 3 s)" },
  boss3:  { name: "Ver",       hp: 12, speed: 0.65, gold: 110, lives: 6, color: "#3ddc84", boss: true, armor: 8, rage: 1.7, power: "Blindage 8 ; accélère de 70 % sous 50 % de PV" }
};
export const BOSS_ORDER = ["boss", "boss2", "boss3"];
export const isBoss = (e) => !!ENEMY_DEFS[e.type].boss;

// Solidité de base d'un ennemi à la vague `wave` (croissance douce : la courbe suit celle de la puissance des tours).
export const HP_START = 24;
export const HP_GROWTH = 1.11;
export const HP_LINEAR = 0.02;
export const baseHp = (wave) => HP_START * HP_GROWTH ** (wave - 1) * (1 + HP_LINEAR * (wave - 1));

export const waveCredits = (wave, map = BUILT[FREE_MAP], diff = diffById(DEFAULT_DIFFICULTY)) =>
  Math.round((5 + 3 * wave) * (map.reward || 1) * (diff.reward || 1));          // crédits versés quand la vague est repoussée
export const waveBonusGold = (wave) => 20 + 2 * wave;                             // énergie offerte à la fin de la vague
export const killGold = (type, wave) => Math.round(ENEMY_DEFS[type].gold * (1 + 0.03 * (wave - 1)));

// Liste des ennemis d'une vague, avec l'instant de leur apparition (en secondes).
export function waveSpec(wave, hpMul = 1) {
  const count = Math.min(6 + 2 * wave, 56);
  const gap = Math.max(0.32, 0.95 - 0.025 * wave);
  const hp = baseHp(wave) * hpMul;
  const list = [];
  for (let i = 0; i < count; i++) {
    let type = "drone";
    if (wave >= 3 && i % 3 === 2) type = "runner";
    if (wave >= 5 && i % 5 === 4) type = "tank";
    if (wave >= 7 && i % 6 === 5) type = "armored";
    list.push({ type, hp: hp * ENEMY_DEFS[type].hp, at: i * gap });
  }
  // Une rafale d'essaim toutes les 4 vagues
  if (wave >= 4 && wave % 4 === 0) {
    for (let k = 0; k < 8 + wave / 2; k++) list.push({ type: "swarm", hp: hp * ENEMY_DEFS.swarm.hp, at: count * gap * 0.4 + k * 0.18 });
  }
  // Boss toutes les 10 vagues : Virus, Rootkit, Ver, puis on recommence avec un boss de plus tous les 3 cycles.
  if (wave % 10 === 0) {
    const k = wave / 10;
    const type = BOSS_ORDER[(k - 1) % BOSS_ORDER.length];
    const n = 1 + Math.floor((k - 1) / BOSS_ORDER.length);
    for (let b = 0; b < n; b++) list.push({ type, hp: hp * ENEMY_DEFS[type].hp, at: count * gap + 1 + b * 4 });
  }
  return list.sort((x, y) => x.at - y.at);
}

/* ---------- Partie ---------- */

export function createState(unlocked = [FREE_TOWER], mapId = FREE_MAP, diffId = DEFAULT_DIFFICULTY) {
  const map = builtMap(mapId);
  const diff = diffById(diffId);
  return {
    map,
    diff,
    hpMul: (map.hpMul || 1) * diff.hp,
    unlocked: unlocked.filter((id) => TOWER_IDS.includes(id)),
    gold: diff.gold,
    lives: diff.lives,
    wave: 0,
    phase: "idle",          // idle (entre deux vagues) | wave | over
    time: 0,
    enemies: [],
    towers: [],
    spawnList: [],
    spawnClock: 0,
    fx: [],                 // effets visuels de courte durée (tirs, explosions)
    nextId: 1,
    creditsEarned: 0,
    kills: 0,
    src: null               // tour qui est en train de tirer (sert à compter les éliminations des paragons)
  };
}

export const towerAt = (state, col, row) => state.towers.find((t) => t.col === col && t.row === row) || null;

export function canPlace(state, col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return !isPathCell(col, row, state.map) && !towerAt(state, col, row);
}

// Pose une tour. Renvoie { ok: true, tower } ou { ok: false, reason }.
export function placeTower(state, typeId, col, row) {
  const def = TOWER_DEFS[typeId];
  if (!def) return { ok: false, reason: "unknown" };
  if (state.phase === "over") return { ok: false, reason: "over" };
  if (!state.unlocked.includes(typeId)) return { ok: false, reason: "locked" };
  if (!canPlace(state, col, row)) return { ok: false, reason: "blocked" };
  if (state.gold < def.cost) return { ok: false, reason: "gold" };
  state.gold -= def.cost;
  const tiers = [0, 0, 0];
  const tower = { id: state.nextId++, type: typeId, col, row, tiers, st: towerStats(def, tiers), cooldown: 0, target: "first", abilityCd: 0, fury: 0, jam: 0, kills: 0, paragon: null, dyn: 1 };
  state.towers.push(tower);
  return { ok: true, tower };
}

// Améliore un chemin d'une tour. Raisons de refus : unknown, over, max, paths, crossed, gold.
export function upgradeTower(state, id, path = 0) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || !(path >= 0 && path < PATH_COUNT)) return { ok: false, reason: "unknown" };
  if (state.phase === "over") return { ok: false, reason: "over" };
  const info = upgradeInfo(state, tower, path);
  if (info.locked) return { ok: false, reason: info.locked };
  if (!info.affordable) return { ok: false, reason: "gold" };
  state.gold -= info.price;
  tower.tiers[path] += 1;
  tower.st = towerStats(TOWER_DEFS[tower.type], tower.tiers);
  return { ok: true, tower };
}

export function sellTower(state, id) {
  const index = state.towers.findIndex((t) => t.id === id);
  if (index < 0 || state.phase === "over") return { ok: false, reason: "unknown" };
  const refund = Math.floor(invested(state.towers[index]) * SELL_RATIO);
  state.gold += refund;
  state.towers.splice(index, 1);
  return { ok: true, refund };
}

export function startWave(state) {
  if (state.phase !== "idle") return false;
  state.wave += 1;
  state.phase = "wave";
  state.spawnList = waveSpec(state.wave, state.hpMul);
  state.spawnClock = 0;
  return true;
}

/* ---------- Simulation ---------- */

function spawn(state, entry, dist = 0) {
  const def = ENEMY_DEFS[entry.type];
  const { x, y } = pointAt(dist, state.map);
  state.enemies.push({
    id: state.nextId++, type: entry.type, hp: entry.hp, maxHp: entry.hp,
    dist, x, y, slow: 0, slowLeft: 0, poison: 0, poisonLeft: 0, stun: 0, stunImmune: 0, dead: false, speed: def.speed * CELL,
    spawned: 0, clock: 0
  });
}

// pierce : le poison ignore le blindage ; un coup direct perd `armor` points (au moins 20 % passent).
function hit(state, enemy, damage, events, pierce = false) {
  if (enemy.dead) return;
  const armor = pierce ? 0 : ENEMY_DEFS[enemy.type].armor || 0;
  enemy.hp -= armor ? Math.max(damage * 0.2, damage - armor) : damage;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    state.gold += killGold(enemy.type, state.wave);
    state.kills += 1;
    events.killed += 1;
    const src = state.src;
    if (src) { src.kills += 1; if (src.paragon) refreshParagon(src); }
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Étourdissement : refusé si l'ennemi est déjà étourdi ou encore immunisé ; durée plafonnée (réduite pour les boss).
function stunEnemy(e, time) {
  if (time <= 0 || e.stun > 0 || e.stunImmune > 0) return false;
  e.stun = Math.min(time, STUN_CAP) * (isBoss(e) ? 0.4 : 1);
  return true;
}

function slowEnemy(e, amount, time) {
  if (amount <= 0) return;
  const cap = isBoss(e) ? SLOW_CAP_BOSS : SLOW_CAP;
  e.slow = Math.max(e.slow, Math.min(amount, cap));
  e.slowLeft = Math.max(e.slowLeft || 0, time);
}

// Effets secondaires d'un tir sur un ennemi touché (ralentissement, gel, étourdissement, poison).
function applyEffects(state, e, st) {
  if (e.dead) return;
  if (st.slow) slowEnemy(e, st.slow, st.slowTime);
  if (st.freezeChance && (state.rng || Math.random)() < st.freezeChance) stunEnemy(e, st.freezeTime);
  if (st.stun) stunEnemy(e, st.stun);
  if (st.poisonDps) {
    e.poison = Math.max(e.poison, st.poisonDps);
    e.poisonLeft = Math.max(e.poisonLeft, st.poisonTime);
    e.poisonBy = state.src || e.poisonBy || null;
  }
}

// Bonus apportés à une tour par les Beacons voisins (les effets se cumulent, avec un plafond).
export function beaconBuff(state, tower) {
  const buff = { damage: 1, rate: 1, range: 1 };
  if (TOWER_DEFS[tower.type].support) return buff;
  let d = 0, r = 0, g = 0, surge = false, para = false;
  for (const b of state.towers) {
    if (b.type !== "beacon") continue;
    const reach = b.st.range;
    const dx = (b.col - tower.col) * CELL, dy = (b.row - tower.row) * CELL;
    if (dx * dx + dy * dy > reach * reach) continue;
    d += b.st.boostDamage; r += b.st.boostRate; g = Math.max(g, b.st.boostRange);
    if (b.fury > 0) { surge = true; d += 0.4; r += 0.4; }
    if (b.paragon) para = true;
  }
  buff.damage += Math.min((surge ? 1.4 : 1) + (para ? 1 : 0), d);
  buff.rate += Math.min((surge ? 1 : 0.6) + (para ? 0.6 : 0), r);
  buff.range += g;
  return buff;
}

// Cadence réelle d'une tour (tirs par seconde) : améliorations, beacons, capacité en cours.
export function towerRate(state, tower) {
  const ab = tower.st.ability && ABILITIES[tower.st.ability];
  const fury = tower.fury > 0 && ab && ab.fury && ab.fury.rate ? ab.fury.rate : 1;
  return tower.st.rate * beaconBuff(state, tower).rate * fury * (tower.dyn || 1);
}

function explode(state, x, y, radius, damage, events, st, color) {
  state.fx.push({ kind: "boom", x, y, r: radius, ttl: 0.25, max: 0.25, color });
  const c = { x, y };
  for (const e of state.enemies) {
    if (e.dead || dist2(c, e) > radius * radius) continue;
    hit(state, e, damage, events, st.pierce);
    applyEffects(state, e, st);
  }
}

// state.src : la tour qui tire, pour attribuer les éliminations (degré des paragons).
function fire(state, tower, events) {
  state.src = tower;
  const fired = fireShots(state, tower, events);
  state.src = null;
  return fired;
}

function fireShots(state, tower, events) {
  const def = TOWER_DEFS[tower.type];
  const st = { ...tower.st };
  const buff = beaconBuff(state, tower);
  const ab = st.ability && ABILITIES[st.ability];
  const fury = tower.fury > 0 && ab && ab.fury ? ab.fury : null;
  st.damage *= buff.damage * (fury && fury.dmg ? fury.dmg : 1);
  st.range *= buff.range;
  if (fury) {
    if (fury.pierce) st.pierce = true;
    if (fury.crit) st.crit = Math.max(st.crit, fury.crit);
    if (fury.pierceN) st.pierceN = Math.max(st.pierceN, fury.pierceN);
  }
  const range = st.range;
  const cx = (tower.col + 0.5) * CELL;
  const cy = (tower.row + 0.5) * CELL;
  const origin = { x: cx, y: cy };
  const rng = state.rng || Math.random;

  // Cibles : les ennemis à portée, triés selon le mode de ciblage de la tour.
  const inRange = sortTargets(state.enemies.filter((e) => !e.dead && dist2(origin, e) <= range * range), tower.target, origin);
  if (!inRange.length) { tower.dyn = 1; return false; }

  // Desperado : cadence selon le nombre d'ennemis à portée (duel) et la distance de la cible (dégaine rapide).
  let dyn = 1;
  if (st.duel) dyn += st.duel * Math.max(0, (5 - inRange.length) / 4);
  if (st.quick) dyn += st.quick * Math.min(1, Math.sqrt(dist2(origin, inRange[0])) / range);
  tower.dyn = dyn;

  const maxChance = fury && fury.crit >= 1 ? 1 : 0.95;
  const beam = (a, b) => state.fx.push({ kind: "beam", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ttl: 0.1, max: 0.1, color: def.color });
  // Dégâts d'un coup : critique (plus fréquent de loin pour le Desperado) et exécution selon les paliers.
  const strike = (e, base) => {
    let damage = base;
    const chance = Math.min(maxChance, st.crit + (st.critFar ? st.critFar * Math.min(1, Math.sqrt(dist2(origin, e)) / range) : 0));
    if (chance > 0 && rng() < chance) damage *= st.critMul;
    if (st.execute && !isBoss(e) && e.hp - damage <= e.maxHp * st.execute) damage = Math.max(damage, e.hp);
    hit(state, e, damage, events, st.pierce);
  };

  if (def.pulse) {
    state.fx.push({ kind: "boom", x: cx, y: cy, r: range, ttl: 0.3, max: 0.3, color: def.color });
    for (const e of inRange) {
      strike(e, st.damage);
      if (st.pulseSlow && !e.dead) slowEnemy(e, st.pulseSlow, st.pulseSlowTime);
      applyEffects(state, e, { stun: st.stun });
    }
    return true;
  }

  const list = inRange.slice(0, st.targets);

  if (def.line) {
    // Dartling : un rayon par cible ; il touche les `pierceN` premiers ennemis alignés (tous avec le Rayon de la mort).
    const all = st.pierceN >= 50;
    for (const aim of list) {
      const len = Math.max(1, Math.sqrt(dist2(origin, aim)));
      const ux = (aim.x - cx) / len;
      const uy = (aim.y - cy) / len;
      const hits = [];
      for (const e of state.enemies) {
        if (e.dead) continue;
        const rx = e.x - cx, ry = e.y - cy;
        const along = rx * ux + ry * uy;
        if (along < 0 || along > range || Math.abs(rx * uy - ry * ux) > LINE_WIDTH) continue;
        hits.push({ e, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const aimed = hits.findIndex((h) => h.e === aim);
      if (aimed > 0) hits.unshift(hits.splice(aimed, 1)[0]);      // la cible visée est toujours touchée
      state.fx.push({ kind: "beam", x1: cx, y1: cy, x2: cx + ux * range, y2: cy + uy * range, ttl: all ? 0.16 : 0.08, max: all ? 0.16 : 0.08, color: def.color, w: all ? 7 : 2 });
      for (const { e } of hits.slice(0, st.pierceN)) { strike(e, st.damage); applyEffects(state, e, st); }
    }
    return true;
  }

  // Salve (Desperado) : 1 + burst tirs répartis sur les cibles ; sinon un tir par cible.
  const shots = st.burst ? Array.from({ length: 1 + st.burst }, (_, k) => list[k % list.length]) : list;
  for (const mainTarget of shots) {
    if (mainTarget.dead) continue;
    beam(origin, mainTarget);
    if (st.splash) {
      const radius = st.splash * CELL;
      state.fx.push({ kind: "boom", x: mainTarget.x, y: mainTarget.y, r: radius, ttl: 0.25, max: 0.25, color: def.color });
      for (const e of state.enemies) {
        if (e.dead || dist2(mainTarget, e) > radius * radius) continue;
        strike(e, st.damage);
        applyEffects(state, e, st);
      }
    } else if (st.chain) {
      const struck = new Set([mainTarget.id]);
      let from = mainTarget;
      let dmg = st.damage;
      strike(mainTarget, dmg);
      applyEffects(state, mainTarget, st);
      for (let n = 1; n < st.chain; n++) {
        let next = null;
        for (const e of state.enemies) {
          if (e.dead || struck.has(e.id) || dist2(from, e) > (st.chainReach * CELL) ** 2) continue;
          if (!next || dist2(from, e) < dist2(from, next)) next = e;
        }
        if (!next) break;
        struck.add(next.id);
        beam(from, next);
        dmg *= st.chainFalloff;
        strike(next, dmg);
        applyEffects(state, next, st);
        from = next;
      }
    } else {
      strike(mainTarget, st.damage);
      applyEffects(state, mainTarget, st);
      if (st.spreadCount) {
        // Contagion : le poison gagne les ennemis les plus proches de la cible.
        const reach = (st.spreadRadius * CELL) ** 2;
        const near = state.enemies
          .filter((e) => !e.dead && e !== mainTarget && dist2(mainTarget, e) <= reach)
          .sort((a, b) => dist2(mainTarget, a) - dist2(mainTarget, b))
          .slice(0, st.spreadCount);
        for (const e of near) { beam(mainTarget, e); applyEffects(state, e, { poisonDps: st.poisonDps * 0.7, poisonTime: st.poisonTime * 0.8 }); }
      }
    }
  }
  return true;
}

/* ---------- Capacités actives (palier 4 du chemin 3) ---------- */

// Chaque capacité a un temps de recharge propre à la tour. Utilisable seulement pendant une vague.
const alive = (state) => state.enemies.filter((e) => !e.dead);
const strongest = (state, n) => alive(state).sort((a, b) => b.hp - a.hp).slice(0, n);
const around = (state, tower, reach) => {
  const o = { x: (tower.col + 0.5) * CELL, y: (tower.row + 0.5) * CELL };
  return alive(state).filter((e) => dist2(o, e) <= reach * reach);
};
const origin = (tower) => ({ x: (tower.col + 0.5) * CELL, y: (tower.row + 0.5) * CELL });
const abilityStats = (state, tower) => {
  const buff = beaconBuff(state, tower);
  return { ...tower.st, damage: tower.st.damage * buff.damage, range: tower.st.range * buff.range };
};

export const ABILITIES = {
  overdrive: { name: "Surcharge", cd: 45, desc: "6 s : cadence ×2,5 et dégâts ×1,5.", fury: { time: 6, rate: 2.5, dmg: 1.5 } },
  frenzy:    { name: "Furie", cd: 40, desc: "5 s : cadence ×3, dégâts ×1,5, balles perforantes.", fury: { time: 5, rate: 3, dmg: 1.5, pierce: true } },
  highnoon:  { name: "Midi pile", cd: 45, desc: "5 s : cadence ×3, dégâts ×2, tous les tirs sont critiques et perforants.", fury: { time: 5, rate: 3, dmg: 2, crit: 1, pierce: true } },
  deathbeam: { name: "Rayon fatal", cd: 40, desc: "4 s : le rayon transperce toute la ligne, dégâts ×3 et cadence ×2.", fury: { time: 4, rate: 2, dmg: 3, pierceN: 99 } },
  surge:     { name: "Surtension", cd: 60, desc: "8 s : les tours dans l'aura gagnent +40 % de dégâts et de cadence en plus.", fury: { time: 8 } },
  absolute: {
    name: "Zéro absolu", cd: 50, desc: "Gèle 1 s, ralentit de 70 % et inflige 3× les dégâts à tous les ennemis proches.",
    run(state, tower, st, events) {
      state.fx.push({ kind: "boom", x: origin(tower).x, y: origin(tower).y, r: st.range * 1.5, ttl: 0.5, max: 0.5, color: "#7fd8ff" });
      for (const e of around(state, tower, st.range * 1.5)) { stunEnemy(e, 1); slowEnemy(e, 0.7, 3); hit(state, e, st.damage * 3, events, true); }
    }
  },
  barrage: {
    name: "Salve", cd: 40, desc: "6 explosions sur les ennemis les plus avancés à portée (3× dégâts).",
    run(state, tower, st, events) {
      const targets = around(state, tower, st.range * 1.6).sort((a, b) => b.dist - a.dist).slice(0, 6);
      for (const e of targets) explode(state, e.x, e.y, (st.splash || 1.2) * CELL, st.damage * 3, events, st, "#ff8a3d");
    }
  },
  headshot: {
    name: "Tir fatal", cd: 35, desc: "Un tir à 12× les dégâts sur l'ennemi le plus solide de la carte.",
    run(state, tower, st, events) {
      const [target] = strongest(state, 1);
      if (!target) return;
      state.fx.push({ kind: "beam", x1: origin(tower).x, y1: origin(tower).y, x2: target.x, y2: target.y, ttl: 0.35, max: 0.35, color: "#fcee0a" });
      state.fx.push({ kind: "boom", x: target.x, y: target.y, r: CELL, ttl: 0.3, max: 0.3, color: "#fcee0a" });
      hit(state, target, st.damage * 12, events, true);
    }
  },
  storm: {
    name: "Tempête", cd: 40, desc: "Foudroie les 8 ennemis les plus solides de la carte (3× dégâts, étourdit 0,5 s).",
    run(state, tower, st, events) {
      for (const e of strongest(state, 8)) {
        state.fx.push({ kind: "beam", x1: origin(tower).x, y1: origin(tower).y, x2: e.x, y2: e.y, ttl: 0.3, max: 0.3, color: "#b58cff" });
        hit(state, e, st.damage * 3, events, true);
        stunEnemy(e, 0.5);
      }
    }
  },
  plague: {
    name: "Pandémie", cd: 45, desc: "Empoisonne tous les ennemis de la carte (poison ×1,5 pendant 8 s).",
    run(state, tower, st) {
      for (const e of alive(state)) { e.poison = Math.max(e.poison, st.poisonDps * 1.5); e.poisonLeft = Math.max(e.poisonLeft, 8); }
      state.fx.push({ kind: "boom", x: (COLS * CELL) / 2, y: (ROWS * CELL) / 2, r: (COLS * CELL) / 2, ttl: 0.5, max: 0.5, color: "#3ddc84" });
    }
  },
  carpet: {
    name: "Pilonnage", cd: 45, desc: "10 obus tombent sur des ennemis à portée (2× dégâts de zone).",
    run(state, tower, st, events) {
      const pool = around(state, tower, st.range * 1.5);
      if (!pool.length) return;
      const rng = state.rng || Math.random;
      for (let i = 0; i < 10; i++) {
        const e = pool[Math.floor(rng() * pool.length)];
        explode(state, e.x + (rng() - 0.5) * 24, e.y + (rng() - 0.5) * 24, (st.splash || 1.7) * CELL, st.damage * 2, events, st, "#ffb347");
      }
    }
  },
  shock: {
    name: "Choc sismique", cd: 50, desc: "Onde géante : 4× dégâts et ralentissement de 50 % sur tous les ennemis de la carte.",
    run(state, tower, st, events) {
      state.fx.push({ kind: "boom", x: (COLS * CELL) / 2, y: (ROWS * CELL) / 2, r: (COLS * CELL) / 2, ttl: 0.5, max: 0.5, color: "#ff6bd6" });
      for (const e of alive(state)) { hit(state, e, st.damage * 4, events, true); slowEnemy(e, 0.5, 3); }
    }
  },
  dividend: {
    name: "Dividende", cd: 60, desc: "Verse tout de suite deux fois la production d'énergie de la tour.",
    run(state, tower, st) { state.gold += Math.round(st.income * 2); }
  }
};

export const abilityOf = (tower) => (tower.st.ability ? ABILITIES[tower.st.ability] : null);

// Déclenche la capacité d'une tour. Raisons de refus : unknown, none, idle (hors vague), cd.
export function useAbility(state, id) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || state.phase === "over") return { ok: false, reason: "unknown" };
  const ab = abilityOf(tower);
  if (!ab) return { ok: false, reason: "none" };
  if (state.phase !== "wave") return { ok: false, reason: "idle" };
  if (tower.abilityCd > 0) return { ok: false, reason: "cd" };
  const events = { killed: 0, leaked: 0 };
  if (ab.fury) tower.fury = ab.fury.time;
  state.src = tower;
  if (ab.run) ab.run(state, tower, abilityStats(state, tower), events);
  state.src = null;
  tower.abilityCd = tower.paragon ? ab.cd / 2 : ab.cd;      // un paragon recharge deux fois plus vite
  state.fx.push({ kind: "boom", x: origin(tower).x, y: origin(tower).y, r: CELL * 0.9, ttl: 0.35, max: 0.35, color: TOWER_DEFS[tower.type].color });
  return { ok: true, name: ab.name };
}

/* ---------- Pouvoirs des boss ---------- */

function bossTick(state, e, def, dt) {
  if (def.spawnAt) {
    const ratio = e.hp / e.maxHp;
    while (e.spawned < def.spawnAt.length && ratio <= def.spawnAt[e.spawned]) {
      e.spawned += 1;
      const n = 5 + Math.floor(state.wave / 5);
      const hp = baseHp(state.wave) * state.hpMul * ENEMY_DEFS.drone.hp * 0.8;
      for (let k = 0; k < n; k++) spawn(state, { type: "drone", hp }, Math.max(0, e.dist - 10 - k * 9));
      state.fx.push({ kind: "boom", x: e.x, y: e.y, r: CELL * 1.5, ttl: 0.4, max: 0.4, color: "#ffffff" });
    }
  }
  if (def.jam) {
    e.clock += dt;
    if (e.clock >= def.jam.every) {
      e.clock = 0;
      const reach = def.jam.radius * CELL;
      for (const t of state.towers) {
        const o = origin(t);
        if (dist2(o, e) <= reach * reach) t.jam = def.jam.time;
      }
      state.fx.push({ kind: "boom", x: e.x, y: e.y, r: reach, ttl: 0.4, max: 0.4, color: "#ff2a6d" });
    }
  }
}

// Fait avancer la partie de `dt` secondes (petit pas : 1/60 s). Renvoie ce qui s'est passé.
export function update(state, dt) {
  const events = { killed: 0, leaked: 0, waveCleared: false, credits: 0, over: false };
  if (state.phase === "over") return events;
  state.time += dt;

  // Apparitions
  if (state.phase === "wave") {
    state.spawnClock += dt;
    while (state.spawnList.length && state.spawnList[0].at <= state.spawnClock) spawn(state, state.spawnList.shift());
  }

  // Déplacement des ennemis
  for (const e of state.enemies) {
    const def = ENEMY_DEFS[e.type];
    if (e.slowLeft > 0) {
      e.slowLeft -= dt;
      if (e.slowLeft <= 0) e.slow = 0;
    }
    if (e.stunImmune > 0) e.stunImmune = Math.max(0, e.stunImmune - dt);
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.stun <= 0) { e.stun = 0; e.stunImmune = def.boss ? STUN_IMMUNITY_BOSS : STUN_IMMUNITY; }
    }
    if (e.poisonLeft > 0) {
      e.poisonLeft -= dt;
      state.src = e.poisonBy || null;
      hit(state, e, e.poison * dt, events, true);
      state.src = null;
      if (e.dead) continue;
    }
    if (def.boss) bossTick(state, e, def, dt);
    if (e.stun <= 0) {
      const rage = def.rage && e.hp <= e.maxHp * 0.5 ? def.rage : 1;
      e.dist += e.speed * rage * (1 - e.slow) * dt;
    }
    if (e.dist >= state.map.length) {
      e.dead = true;
      e.leaked = true;
      state.lives -= def.lives;
      events.leaked += 1;
      continue;
    }
    const p = pointAt(e.dist, state.map);
    e.x = p.x;
    e.y = p.y;
  }

  // Tirs des tours
  // Recharge des capacités, durée des effets et brouillage : ces minuteurs ne tournent que pendant une vague.
  const waving = state.phase === "wave";
  for (const tower of state.towers) {
    tower.cooldown -= dt;
    if (waving) {
      if (tower.abilityCd > 0) tower.abilityCd = Math.max(0, tower.abilityCd - dt);
      if (tower.fury > 0) tower.fury = Math.max(0, tower.fury - dt);
      if (tower.jam > 0) tower.jam = Math.max(0, tower.jam - dt);
    }
    if (tower.jam > 0) continue;      // brouillée par un Rootkit
    if (tower.cooldown > 0) continue;
    const tdef = TOWER_DEFS[tower.type];
    if (tdef.support || tdef.income) continue;   // Beacon et Data Miner ne tirent pas
    if (fire(state, tower, events)) tower.cooldown = 1 / towerRate(state, tower);
    else tower.cooldown = 0;   // rien à portée : elle tirera dès qu'un ennemi arrive
  }

  state.enemies = state.enemies.filter((e) => !e.dead);

  // Effets visuels
  for (const f of state.fx) f.ttl -= dt;
  state.fx = state.fx.filter((f) => f.ttl > 0);

  // Défaite
  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = "over";
    events.over = true;
    return events;
  }

  // Vague repoussée
  if (state.phase === "wave" && state.spawnList.length === 0 && state.enemies.length === 0) {
    state.phase = "idle";
    for (const t of state.towers) t.jam = 0;      // le brouillage s'arrête avec la vague
    // Data Miners : de l'énergie en plus à la fin de la vague (les Beacons voisins l'augmentent un peu).
    let mined = 0;
    for (const t of state.towers) {
      if (t.type !== "miner") continue;
      const base = t.st.income + Math.min(state.gold, 3000) * t.st.interest;
      mined += Math.round(base * (1 + (beaconBuff(state, t).damage - 1) * 0.5));
    }
    state.gold += waveBonusGold(state.wave) + mined;
    events.mined = mined;
    const credits = waveCredits(state.wave, state.map, state.diff);
    state.creditsEarned += credits;
    events.waveCleared = true;
    events.credits = credits;
  }
  return events;
}


/* ---------- Paragons ---------- */
// Fusion de 3 tours d'un même type (chacune avec un chemin au palier 4) : une tour qui cumule les 3 chemins au palier 4,
// avec une capacité qui recharge deux fois plus vite. Son degré (1 à 20) monte avec l'énergie investie et ses éliminations.

export const paragonCost = (def) => def.cost * PARAGON_COST_MUL;

export function paragonDegree(tower) {
  if (!tower.paragon) return 0;
  const def = TOWER_DEFS[tower.type];
  const worth = tower.paragon.spent / def.cost + Math.min(60, (tower.kills || 0) / 25);
  return Math.max(1, Math.min(PARAGON_MAX_DEGREE, 1 + Math.floor((worth - 40) / 4)));
}

export function paragonStats(def, tower) {
  const st = towerStats(def, [MAX_TIER, MAX_TIER, MAX_TIER]);
  const d = paragonDegree(tower);
  st.degree = d;
  if (def.support) { st.boostDamage *= 1 + 0.1 * (d - 1); st.boostRate *= 1 + 0.1 * (d - 1); }
  else if (def.income) st.income *= 1 + 0.15 * (d - 1);
  else { st.damage *= 1 + 0.15 * (d - 1); st.rate *= 1 + 0.03 * (d - 1); st.range *= 1 + 0.01 * (d - 1); }
  return st;
}

function refreshParagon(tower) {
  const def = TOWER_DEFS[tower.type];
  if (paragonDegree(tower) !== tower.st.degree) tower.st = paragonStats(def, tower);
}

// État d'une tour face aux paragons : { is: true, degree } si c'en est un, sinon le coût, le nombre de tours prêtes et la raison
// du blocage : have (ce type a déjà un paragon) | notmax (aucun chemin au palier 4) | need (pas assez de tours prêtes) | gold.
export function paragonInfo(state, tower) {
  const def = TOWER_DEFS[tower.type];
  if (tower.paragon) return { is: true, degree: paragonDegree(tower) };
  const cost = paragonCost(def);
  const ready = state.towers.filter((t) => t.type === tower.type && !t.paragon && t.tiers.some((x) => x >= MAX_TIER));
  let reason = null;
  if (state.towers.some((t) => t.type === tower.type && t.paragon)) reason = "have";
  else if (!tower.tiers.some((x) => x >= MAX_TIER)) reason = "notmax";
  else if (ready.length < PARAGON_NEED) reason = "need";
  else if (state.gold < cost) reason = "gold";
  return { is: false, cost, ready: ready.length, need: PARAGON_NEED, reason };
}

// Fusionne : la tour choisie devient le paragon, les 2 autres tours prêtes (les plus investies) sont sacrifiées.
export function makeParagon(state, id) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || state.phase === "over") return { ok: false, reason: "unknown" };
  const info = paragonInfo(state, tower);
  if (info.is) return { ok: false, reason: "have" };
  if (info.reason) return { ok: false, reason: info.reason };
  const def = TOWER_DEFS[tower.type];
  const others = state.towers
    .filter((t) => t !== tower && t.type === tower.type && !t.paragon && t.tiers.some((x) => x >= MAX_TIER))
    .sort((a, b) => invested(b) - invested(a))
    .slice(0, PARAGON_NEED - 1);
  const spent = invested(tower) + others.reduce((sum, t) => sum + invested(t), 0) + info.cost;
  state.gold -= info.cost;
  state.towers = state.towers.filter((t) => !others.includes(t));
  tower.paragon = { spent };
  tower.tiers = [MAX_TIER, MAX_TIER, MAX_TIER];
  tower.st = paragonStats(def, tower);
  tower.abilityCd = 0;
  state.fx.push({ kind: "boom", x: (tower.col + 0.5) * CELL, y: (tower.row + 0.5) * CELL, r: CELL * 2, ttl: 0.6, max: 0.6, color: "#fcee0a" });
  return { ok: true, tower, sacrificed: others.map((t) => t.id) };
}
