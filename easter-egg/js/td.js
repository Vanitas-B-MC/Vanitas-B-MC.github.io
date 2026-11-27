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
export const PARAGON_MAX_DEGREE = 20;
export const PARAGON_COMPLETE_BONUS = 3;     // degrés offerts quand les 3 tours sacrifiées couvrent les 3 chemins

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

/* ---------- Plateau, cartes et chemins des ennemis ---------- */

export const W = COLS * CELL;            // taille du plateau en pixels
export const H = ROWS * CELL;

// Placement libre (comme dans BTD6) : une tour est un disque posé n'importe où, sauf sur le chemin,
// sur un obstacle (arbre, étang…) ou sur une autre tour.
export const TOWER_RADIUS = 13;
export const TOWER_GAP = 30;             // distance minimale entre deux tours (centre à centre)
export const PATH_CLEAR = 31;            // distance minimale entre le centre d'une tour et l'axe du chemin
export const PATH_HALF = 18;             // demi-largeur dessinée du chemin

// lanes : un ou plusieurs chemins, chacun en points de passage (en cases, décimales permises ; hors plateau = entrée ou sortie).
// smooth : coins arrondis. obstacles : [colonne, ligne, rayon en cases].
// unlock : crédits pour débloquer la carte. hpMul : solidité des ennemis. reward : multiplicateur de crédits.
export const MAPS = [
  { id: "serpent",    name: "Serpent",    desc: "Le classique : trois virages.",              unlock: 0,    hpMul: 1,    reward: 1,
    lanes: [[[-1, 1], [11, 1], [11, 4], [2, 4], [2, 7], [14, 7]]], obstacles: [[7, 5.5, 0.7], [12.7, 2.6, 0.55]] },
  { id: "prairie",    name: "Prairie",    desc: "Un grand chemin en S aux courbes douces, parsemé d'arbres.", unlock: 600, hpMul: 0.65, reward: 1.2, smooth: true,
    lanes: [[[-1, 6], [2, 6], [4, 3], [7, 3], [9, 6], [12, 6], [12, 2], [14, 2]]], obstacles: [[6.2, 5.6, 0.75], [1.6, 1.9, 0.7], [10.6, 3.9, 0.6]] },
  { id: "spirale",    name: "Spirale",    desc: "Un long chemin qui s'enroule vers le cœur.", unlock: 1500, hpMul: 1.15, reward: 1.5,
    lanes: [[[-1, 7], [12, 7], [12, 1], [1, 1], [1, 5], [8, 5]]], obstacles: [] },
  { id: "fourche",    name: "Fourche",    desc: "Deux entrées qui fusionnent : il faut couvrir les deux chemins.", unlock: 3000, hpMul: 0.45, reward: 1.8, smooth: true, bonusGold: 60,
    lanes: [[[-1, 1], [8, 1], [8, 4], [14, 4]], [[-1, 7], [8, 7], [8, 4]]], obstacles: [[11.3, 1.4, 0.8], [11.3, 6.8, 0.8]] },
  { id: "zigzag",     name: "Zigzag",     desc: "Sept virages serrés : peu de place pour les tours.", unlock: 5000, hpMul: 1,  reward: 2,
    lanes: [[[-1, 4], [3, 4], [3, 1], [8, 1], [8, 7], [12, 7], [12, 4], [14, 4]]], obstacles: [] },
  { id: "riviere",    name: "Rivière",    desc: "Des étangs empêchent de construire au centre.", unlock: 8000, hpMul: 0.7, reward: 2.3, smooth: true,
    lanes: [[[-1, 2], [4, 2], [4, 6], [9, 6], [9, 2], [14, 2]]], obstacles: [[6.5, 3.7, 1.25], [11.9, 5.2, 1.0], [1.6, 5.5, 0.9]] },
  { id: "labyrinthe", name: "Labyrinthe", desc: "Un très long chemin : beaucoup d'ennemis, beaucoup de crédits.", unlock: 15000, hpMul: 1.4, reward: 2.6,
    lanes: [[[-1, 1], [12, 1], [12, 3], [1, 3], [1, 5], [12, 5], [12, 7], [14, 7]]], obstacles: [] },
  { id: "infernal",   name: "Infernal",   desc: "Trois chemins qui se croisent puis fusionnent : le défi ultime.", unlock: 25000, hpMul: 0.4, reward: 3.2, smooth: true, bonusGold: 160,
    lanes: [[[-1, 1], [12, 1], [12, 4], [14, 4]], [[-1, 7], [12, 7], [12, 4]], [[7, -1], [7, 4], [12, 4]]], obstacles: [[3.5, 4, 0.9], [9.6, 2.7, 0.55], [9.6, 5.4, 0.55]] }
];
export const MAP_IDS = MAPS.map((m) => m.id);
export const FREE_MAP = "serpent";
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

// Coins arrondis : remplace chaque virage par une courbe de Bézier de rayon `radius`.
function roundCorners(points, radius) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const a = [cx + ((px - cx) / d1) * r, cy + ((py - cy) / d1) * r];
    const b = [cx + ((nx - cx) / d2) * r, cy + ((ny - cy) / d2) * r];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Un chemin prêt à l'emploi : points, segments, longueur, et échantillons réguliers (pour les pointes de la Spike Factory).
function buildLane(points) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    segments.push({ x1, y1, x2, y2, length, start: total });
    total += length;
  }
  const lane = { points, segments, length: total, samples: [] };
  for (let d = 0; d <= total; d += 14) lane.samples.push({ dist: d, ...pointAt(d, lane) });
  return lane;
}

function buildMap(def) {
  const lanes = def.lanes.map((wp) => {
    let pts = wp.map(([c, r]) => [(c + 0.5) * CELL, (r + 0.5) * CELL]);
    if (def.smooth) pts = roundCorners(pts, CELL * 1.3);
    return buildLane(pts);
  });
  const obstacles = (def.obstacles || []).map(([c, r, rad]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, r: rad * CELL }));
  const first = lanes[0];
  return { ...def, lanes, laneCount: lanes.length, obstacles, points: first.points, segments: first.segments, length: first.length };
}

const BUILT = Object.fromEntries(MAPS.map((m) => [m.id, buildMap(m)]));
export const builtMap = (id) => BUILT[id] || BUILT[FREE_MAP];

// Position (en pixels) d'un ennemi qui a parcouru `dist` pixels d'un chemin (un « lane » ou une carte, qui a les mêmes champs).
export function pointAt(dist, lane = BUILT[FREE_MAP]) {
  const d = Math.min(Math.max(dist, 0), lane.length);
  const seg = lane.segments.find((s) => d <= s.start + s.length) || lane.segments[lane.segments.length - 1];
  const t = seg.length === 0 ? 0 : (d - seg.start) / seg.length;
  return { x: seg.x1 + (seg.x2 - seg.x1) * t, y: seg.y1 + (seg.y2 - seg.y1) * t };
}

function projectOnSegment(px, py, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2)) : 0;
  const x = s.x1 + t * dx;
  const y = s.y1 + t * dy;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

// Point du chemin (de n'importe quel chemin de la carte) le plus proche de (x, y).
export function nearestPathPoint(map, x, y) {
  let best = null;
  for (const lane of map.lanes) for (const seg of lane.segments) {
    const q = projectOnSegment(x, y, seg);
    if (!best || q.d < best.d) best = q;
  }
  return best;
}
export const distToPath = (map, x, y) => nearestPathPoint(map, x, y).d;

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
  dartling: { id: "dartling", name: "Dartling", desc: "Portée infinie : tire des fléchettes vers la souris ou un point fixe ; chaque fléchette transperce les ennemis sur sa route. Le chemin 1 mène au laser continu, puis au Rayon de la mort.", cost: 1200, upScale: 0.35, unlock: 6000, range: 99, rate: 5, dmg: 14, color: "#ffe14d", line: true, paragonMul: 2 },
  desperado: { id: "desperado", name: "Desperado", desc: "Duelliste : tire d'autant plus vite qu'il y a peu d'ennemis à portée. Critiques à longue distance, salves de revolver.", cost: 150, unlock: 12000, range: 3.2, rate: 1.5, dmg: 26, color: "#ff9f5a" },
  tack:      { id: "tack",      name: "Tack Shooter", desc: "Tire une couronne de pointes dans toutes les directions. Portée courte, idéal dans les virages.", cost: 90,  unlock: 300,   range: 1.7, rate: 1.3, dmg: 14,  color: "#ff7a7a", radial: 8 },
  boomerang: { id: "boomerang", name: "Boomerang",    desc: "Lance un vrai boomerang : il traverse plusieurs ennemis à l'aller et au retour (chaque ennemi touché l'est deux fois).", cost: 100, unlock: 700,   range: 3.2, rate: 1.1, dmg: 14, color: "#7ad7ff", boom: true },
  wizard:    { id: "wizard",    name: "Wizard",       desc: "Magie : ignore le blindage. Boules de feu qui brûlent, éclairs, invocations.", cost: 120, unlock: 2500,  range: 3.3, rate: 1.6, dmg: 12, color: "#b06bff", magic: true },
  spikes:    { id: "spikes",    name: "Spike Factory", desc: "Pose des tas de pointes sur le chemin : chaque tas blesse les ennemis qui passent dessus.", cost: 130, unlock: 3500,  range: 1.5, rate: 0.6, dmg: 12, color: "#c0c0d0", spikes: true },
  super:     { id: "super",     name: "Super Monkey", desc: "Cadence démesurée et longue portée. Très cher, très puissant.", cost: 450, unlock: 20000, range: 4.2, rate: 12, dmg: 6, color: "#6bd0ff" }
};
export const TOWER_IDS = Object.keys(TOWER_DEFS);
export const LINE_WIDTH = 11;           // demi-largeur (px) du tir en ligne du Dartling
export const BEAM_TICK = 0.13;          // laser continu du Dartling : un coup toutes les 0,13 s
export const DART_SPEED = 900;          // vitesse des fléchettes du Dartling (px/s)
export const SPIKE_SPOT = 0.9;          // Spike Factory ciblée : les pointes tombent à moins de 0,9 case du point choisi

/* ---------- Chemins d'amélioration ---------- */
// Règles (comme Bloons TD6) : une tour utilise au plus 2 chemins, et un seul chemin peut dépasser le palier 2.
// Coût d'un palier = coût de pose × cost. Le palier 4 du chemin 3 donne une capacité active.
//
// fx — multiplicateurs : dmg, rate, range, poisonDps, income, boostDamage, boostRate
//      ajouts : targets, splash, chain, chainReach, spreadCount, spreadRadius, crit, boostRange,
//               poisonTime, slowTime, pulseSlowTime, interest
//      minimums (on garde le plus haut) : stun, slow, freezeChance, freezeTime, pulseSlow, critMul, execute, chainFalloff
//      pierce (vrai/faux), ability (nom d'une capacité de ABILITIES)
// price (facultatif) : prix fixe en énergie, au lieu de « coût de pose × cost ».
const U = (name, cost, fx, price) => ({ name, cost, fx, price });

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
  desperado: ["Duel", "Précision", "Barillet"],
  tack:      ["Pointes", "Lames", "Feu"],
  boomerang: ["Glaives", "Vitesse", "Puissance"],
  wizard:    ["Feu", "Arcane", "Invocation"],
  spikes:    ["Fabrication", "Pointes", "Ciblage"],
  super:     ["Lasers", "Portée", "Pouvoirs"]
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
    [U("Ailettes", 0.6, { pierceN: 2, dmg: 1.2 }), U("Pointes de tungstène", 1.2, { pierceN: 3, dmg: 1.3 }), U("Faisceau laser", 0, { beam: 1, dmg: 1.5 }, 10000), U("Rayon de la mort", 0, { beam: 2, dmg: 2.5, rate: 1.5 }, 25000)],
    [U("Moteur", 0.6, { rate: 1.3 }), U("Barillet rapide", 1.2, { rate: 1.3 }), U("Mitrailleuse", 2.4, { rate: 1.4, dmg: 1.1 }), U("Hyper-rafale", 5, { rate: 1.6, dmg: 1.3 })],
    [U("Gros calibre", 0.7, { dmg: 1.5 }), U("Canons jumeaux", 1.4, { targets: 1 }), U("Triple canon", 2.6, { targets: 1, dmg: 1.3 }), U("Rayon fatal", 5.5, { targets: 1, dmg: 1.6, ability: "deathbeam" })]
  ],
  // Desperado : duel (cadence selon le nombre d'ennemis), critiques à distance, salves
  desperado: [
    [U("Dégaine rapide", 0.6, { quick: 0.5 }), U("Colt long", 1.2, { dmg: 1.3, rate: 1.1 }), U("Gros calibre", 2.4, { duel: 1.2, dmg: 1.2 }), U("Soleil de plomb", 5.2, { dmg: 2, duel: 0.6, rate: 1.2 })],
    [U("Visée", 0.6, { critFar: 0.1, critMul: 2.5 }), U("Mouche", 1.2, { critFar: 0.15, range: 1.1 }), U("Œil de lynx", 2.5, { critFar: 0.2, critMul: 3.5, pierce: true, bounty: 0.5 }), U("Fantôme du désert", 5, { crit: 0.15, critFar: 0.25, execute: 0.2, range: 1.2, bounty: 0.5 })],
    [U("Errant", 0.7, { burst: 1 }), U("Face à face", 1.3, { burst: 1, rate: 1.2 }), U("Six coups", 2.6, { burst: 2, rate: 1.1 }), U("Twin Sixes", 5.6, { burst: 4, dmg: 1.2, ability: "highnoon" })]
  ],
  tack: [
    [U("Plus de pointes", 0.6, { radial: 2 }), U("Encore plus", 1.2, { radial: 2, rate: 1.15 }), U("Arroseur", 2.4, { radial: 4, rate: 1.2 }), U("Pluie de clous", 5, { radial: 8, rate: 1.3 })],
    [U("Pointes longues", 0.6, { range: 1.2 }), U("Super portée", 1.2, { range: 1.2, pierceN: 1 }), U("Lames", 2.5, { dmg: 2, pierceN: 2, pierce: true }), U("Tempête de lames", 5.2, { dmg: 2, pierceN: 3, rate: 1.25 })],
    [U("Pointes chaudes", 0.7, { burn: 10, burnTime: 2 }), U("Cercle de feu", 1.3, { burn: 18, burnTime: 1, dmg: 1.2 }), U("Anneau ardent", 2.6, { burn: 30, burnTime: 2, rate: 1.2 }), U("Anneau infernal", 5.5, { burn: 50, burnTime: 2, ability: "inferno" })]
  ],
  boomerang: [
    [U("Rangs améliorés", 0.6, { pierceN: 2 }), U("Glaives", 1.2, { pierceN: 2, dmg: 1.3 }), U("Ricochet", 2.4, { returns: 1, dmg: 1.2 }), U("Glaive Lord", 5.2, { returns: 1, pierceN: 4, dmg: 1.6 })],
    [U("Lancer rapide", 0.6, { rate: 1.3 }), U("Bionique", 1.2, { rate: 1.3 }), U("Turbo", 2.4, { rate: 1.4, range: 1.1 }), U("Turbo-charge", 5, { rate: 1.7 })],
    [U("Acier trempé", 0.7, { dmg: 1.4 }), U("Lames rotatives", 1.3, { dmg: 1.4, pierce: true }), U("Tranchant", 2.6, { dmg: 1.5 }), U("Tornade", 5.5, { dmg: 1.6, ability: "tornado" })]
  ],
  wizard: [
    [U("Boule de feu", 0.7, { splash: 0.5, burn: 12, burnTime: 2 }), U("Flammes", 1.3, { burn: 25, burnTime: 1, splash: 0.2 }), U("Souffle ardent", 2.6, { burn: 45, splash: 0.4, dmg: 1.3 }), U("Dragon", 5.5, { burn: 80, splash: 0.6, dmg: 1.5, burnTime: 2 })],
    [U("Éclair arcanique", 0.6, { dmg: 1.4 }), U("Maîtrise", 1.2, { dmg: 1.3, range: 1.15, rate: 1.2 }), U("Éclair en chaîne", 2.5, { chain: 3, dmg: 1.2 }), U("Arcane suprême", 5.2, { chain: 4, dmg: 1.6, rate: 1.2 })],
    [U("Familier", 0.8, { targets: 1 }), U("Phénix", 1.5, { targets: 1, dmg: 1.2 }), U("Armée", 2.8, { targets: 1, rate: 1.3 }), U("Maître des invocations", 5.6, { targets: 2, dmg: 1.5, ability: "dragon" })]
  ],
  spikes: [
    [U("Cadence", 0.6, { rate: 1.4 }), U("Deux tas", 1.2, { batch: 1 }), U("Chaîne de montage", 2.4, { rate: 1.4 }), U("Usine géante", 5, { batch: 2, rate: 1.4 })],
    [U("Pointes lourdes", 0.6, { dmg: 1.5 }), U("Pointes solides", 1.2, { pierceN: 2, dmg: 1.2 }), U("Pointes en acier", 2.5, { pierceN: 2, dmg: 1.5 }), U("Pointes mortelles", 5.2, { pierceN: 4, dmg: 2, pierce: true })],
    [U("Lance-pointes", 0.7, { aimSpikes: 1, range: 1.2 }), U("Grand rayon", 1.3, { range: 1.1, batch: 1 }), U("Tapis de pointes", 2.6, { range: 1.1, batch: 2 }), U("Tempête de pointes", 5.5, { batch: 3, rate: 1.3, ability: "spikestorm" })]
  ],
  super: [
    [U("Lasers", 0.6, { dmg: 1.4 }), U("Plasma", 1.2, { dmg: 1.4, pierce: true }), U("Rayons solaires", 2.5, { dmg: 1.6, splash: 0.3 }), U("Avatar du soleil", 5.2, { dmg: 2, rate: 1.3, splash: 0.4 })],
    [U("Longue portée", 0.6, { range: 1.2 }), U("Portée épique", 1.2, { range: 1.2, rate: 1.15 }), U("Robo", 2.5, { targets: 1, rate: 1.2 }), U("Technicien", 5, { targets: 1, dmg: 1.4, rate: 1.2 })],
    [U("Réflexes", 0.7, { rate: 1.3 }), U("Surrégime", 1.3, { rate: 1.3 }), U("Coups critiques", 2.6, { crit: 0.15, critMul: 3 }), U("Fureur solaire", 5.5, { rate: 1.5, dmg: 1.5, ability: "sunburst" })]
  ]
};

const MUL = { dmg: "damage", rate: "rate", range: "range", poisonDps: "poisonDps", income: "income", boostDamage: "boostDamage", boostRate: "boostRate" };
const ADD = new Set(["radial", "returns", "batch", "burnTime", "bounty", "burst", "duel", "quick", "critFar", "pierceN", "targets", "splash", "chain", "chainReach", "spreadCount", "spreadRadius", "crit", "boostRange", "poisonTime", "slowTime", "pulseSlowTime", "interest"]);

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
    spreadCount: 0, spreadRadius: 0, crit: 0, critMul: 2, pierce: !!def.magic, execute: 0,
    pulseSlow: 0, pulseSlowTime: 0, pierceN: def.line ? 3 : def.radial ? 1 : def.boom ? 4 : def.spikes ? 4 : 0, burst: 0, duel: 0, quick: 0, critFar: 0,
    radial: def.radial || 0, returns: def.boom ? 1 : 0, batch: def.spikes ? 1 : 0, burn: 0, burnTime: 0, bounty: 0,
    boostDamage: def.id === "beacon" ? 0.2 : 0, boostRate: def.id === "beacon" ? 0.15 : 0, boostRange: 0,
    income: def.id === "miner" ? 24 : 0, interest: 0, ability: null,
    beam: 0,          // Dartling : 1 = laser continu, 2 = Rayon de la mort (plus large)
    aimSpikes: 0      // Spike Factory : le joueur choisit où tombent les pointes
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
export const upgradeCostOf = (def, path, tier) => {
  const up = UPGRADES[def.id][path][tier];
  return up.price || Math.round(def.cost * (def.upScale || 1) * up.cost);
};

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
  if (fx.radial) out.push(`+${fx.radial} pointes`);
  if (fx.returns) out.push(`+${fx.returns} aller-retour`);
  if (fx.batch) out.push(`+${fx.batch} tas de pointes par fabrication`);
  if (fx.burn) out.push(`brûlure ${fx.burn}/s`);
  if (fx.burnTime) out.push(`+${fx.burnTime} s de brûlure`);
  if (fx.bounty) out.push(`+${Math.round(fx.bounty * 100)} % d'énergie par élimination`);
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
  if (fx.beam === 1) out.push(`laser continu : touche toute la ligne toutes les ${String(BEAM_TICK).replace(".", ",")} s`);
  if (fx.beam === 2) out.push("rayon continu géant");
  if (fx.aimSpikes) out.push("choisis où tombent les pointes");
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
export function waveSpec(wave, hpMul = 1, laneCount = 1) {
  const count = Math.min(6 + 2 * wave, 56);
  const gap = Math.max(0.32, 0.95 - 0.025 * wave);
  const hp = baseHp(wave) * hpMul;
  const list = [];
  for (let i = 0; i < count; i++) {
    let type = "drone";
    if (wave >= 3 && i % 3 === 2) type = "runner";
    if (wave >= 5 && i % 5 === 4) type = "tank";
    if (wave >= 7 && i % 6 === 5) type = "armored";
    list.push({ type, hp: hp * ENEMY_DEFS[type].hp, at: i * gap, lane: i % laneCount });
  }
  // Une rafale d'essaim toutes les 4 vagues
  if (wave >= 4 && wave % 4 === 0) {
    for (let k = 0; k < 8 + wave / 2; k++) list.push({ type: "swarm", hp: hp * ENEMY_DEFS.swarm.hp, at: count * gap * 0.4 + k * 0.18, lane: k % laneCount });
  }
  // Boss toutes les 10 vagues : Virus, Rootkit, Ver, puis on recommence avec un boss de plus tous les 3 cycles.
  if (wave % 10 === 0) {
    const k = wave / 10;
    const type = BOSS_ORDER[(k - 1) % BOSS_ORDER.length];
    const n = 1 + Math.floor((k - 1) / BOSS_ORDER.length);
    for (let b = 0; b < n; b++) list.push({ type, hp: hp * ENEMY_DEFS[type].hp, at: count * gap + 1 + b * 4, lane: b % laneCount });
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
    gold: diff.gold + (map.bonusGold || 0),      // les cartes à plusieurs chemins offrent un peu d'énergie de départ
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
    src: null,              // tour qui est en train de tirer (sert à compter les éliminations des paragons)
    spikes: [],             // pointes posées sur le chemin par les Spike Factory
    projs: [],              // projectiles en vol (boomerangs)
    cursor: null            // position de la souris sur le plateau (visée du Dartling), mise à jour par l'interface
  };
}

// La tour la plus proche du point (x, y), si le point est sur elle (clic pour la sélectionner).
export function towerAt(state, x, y) {
  let best = null;
  let bestD = (TOWER_RADIUS + 5) ** 2;
  for (const t of state.towers) {
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d <= bestD) { bestD = d; best = t; }
  }
  return best;
}

// Pourquoi on ne peut pas poser une tour en (x, y) : bounds (hors plateau) | path | obstacle | tower | null si c'est possible.
export function placeIssue(state, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "bounds";
  if (x < TOWER_RADIUS || x > W - TOWER_RADIUS || y < TOWER_RADIUS || y > H - TOWER_RADIUS) return "bounds";
  if (distToPath(state.map, x, y) < PATH_CLEAR) return "path";
  for (const o of state.map.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + TOWER_RADIUS) return "obstacle";
  for (const t of state.towers) if (Math.hypot(x - t.x, y - t.y) < TOWER_GAP) return "tower";
  return null;
}
export const canPlace = (state, x, y) => placeIssue(state, x, y) === null;

// Pose une tour en (x, y) (pixels). Renvoie { ok: true, tower } ou { ok: false, reason }.
export function placeTower(state, typeId, x, y) {
  const def = TOWER_DEFS[typeId];
  if (!def) return { ok: false, reason: "unknown" };
  if (state.phase === "over") return { ok: false, reason: "over" };
  if (!state.unlocked.includes(typeId)) return { ok: false, reason: "locked" };
  x = Math.round(x);
  y = Math.round(y);
  const issue = placeIssue(state, x, y);
  if (issue) return { ok: false, reason: issue };
  if (state.gold < def.cost) return { ok: false, reason: "gold" };
  state.gold -= def.cost;
  const tiers = [0, 0, 0];
  const tower = { id: state.nextId++, type: typeId, x, y, tiers, st: towerStats(def, tiers), cooldown: 0, target: "first", abilityCd: 0, fury: 0, jam: 0, kills: 0, paragon: null, dyn: 1 };
  if (def.line) {
    // Dartling : il vise un point fixe, par défaut le point du chemin le plus proche ; le joueur peut aussi le faire suivre la souris.
    const near = nearestPathPoint(state.map, x, y);
    tower.aim = { x: near.x, y: near.y };
    tower.aimMode = "point";
  }
  state.towers.push(tower);
  return { ok: true, tower };
}

// Spike Factory ciblée : par défaut, le point du chemin le plus proche de la tour.
function aimSpikesDefault(state, tower) {
  const near = nearestPathPoint(state.map, tower.x, tower.y);
  tower.aim = { x: near.x, y: near.y };
  tower.aimMode = "point";
}

// Visée du Dartling : un point fixe, ou la souris (state.cursor, mis à jour par l'interface).
// Spike Factory : un point fixe, ramené dans la portée de la tour si on clique trop loin.
export function setAim(state, id, x, y) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || !tower.aim) return false;
  x = Math.max(0, Math.min(W, x));
  y = Math.max(0, Math.min(H, y));
  if (TOWER_DEFS[tower.type].spikes) {
    const reach = tower.st.range * beaconBuff(state, tower).range;
    const d = Math.hypot(x - tower.x, y - tower.y);
    if (d > reach) { x = tower.x + ((x - tower.x) / d) * reach; y = tower.y + ((y - tower.y) / d) * reach; }
  }
  tower.aim = { x, y };
  return true;
}
export function setAimMode(state, id, mode) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || !tower.aim || !["point", "mouse"].includes(mode)) return false;
  if (mode === "mouse" && !TOWER_DEFS[tower.type].line) return false;     // la souris : seulement pour le Dartling
  tower.aimMode = mode;
  return true;
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
  if (tower.st.aimSpikes && !tower.aim) aimSpikesDefault(state, tower);
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
  state.spawnList = waveSpec(state.wave, state.hpMul, state.map.laneCount);
  state.spawnClock = 0;
  return true;
}

/* ---------- Simulation ---------- */

function spawn(state, entry, dist = 0) {
  const def = ENEMY_DEFS[entry.type];
  const lane = entry.lane || 0;
  const { x, y } = pointAt(dist, state.map.lanes[lane]);
  state.enemies.push({
    id: state.nextId++, type: entry.type, hp: entry.hp, maxHp: entry.hp, lane,
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
    const src = state.src;
    const gain = killGold(enemy.type, state.wave);
    state.gold += src && src.st.bounty ? Math.round(gain * (1 + src.st.bounty)) : gain;      // prime d'énergie (Desperado)
    state.kills += 1;
    events.killed += 1;
    if (src) {
      src.kills += 1;
      if (src.paragon) refreshParagon(src);
    }
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
  if (st.burn) {
    e.poison = Math.max(e.poison, st.burn);
    e.poisonLeft = Math.max(e.poisonLeft, st.burnTime || 3);
    e.poisonBy = state.src || e.poisonBy || null;
  }
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
    const dx = b.x - tower.x, dy = b.y - tower.y;
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

const RAY_LENGTH = 1300;

// Ennemis touchés par un rayon qui part de (x, y) dans la direction (ux, uy) sur `length` pixels, du plus proche au plus lointain.
function rayEnemies(state, x, y, ux, uy, length, width) {
  const hits = [];
  for (const e of state.enemies) {
    if (e.dead) continue;
    const rx = e.x - x;
    const ry = e.y - y;
    const along = rx * ux + ry * uy;
    if (along < 0 || along > length || Math.abs(rx * uy - ry * ux) > width) continue;
    hits.push({ e, along });
  }
  return hits.sort((a, b) => a.along - b.along).map((h) => h.e);
}

// Spike Factory : pose `count` tas de pointes sur le chemin, à portée de la tour.
// Deux tas au même endroit s'empilent (plus de passages possibles, tas plus gros, jusqu'à 6) ; l'aspect (look) suit le niveau du chemin « Pointes ».
function addSpikes(state, tower, st, count) {
  let spots = [];
  state.map.lanes.forEach((lane, li) => {
    for (const smp of lane.samples) if ((smp.x - tower.x) ** 2 + (smp.y - tower.y) ** 2 <= st.range ** 2) spots.push({ lane: li, ...smp });
  });
  if (!spots.length) return 0;
  // Ciblée (Lance-pointes) : seulement les morceaux de chemin autour du point choisi, s'il y en a.
  const aim = st.aimSpikes && tower.aim ? tower.aim : null;
  if (aim) {
    const reach = (SPIKE_SPOT * CELL) ** 2;
    const near = spots.filter((p) => (p.x - aim.x) ** 2 + (p.y - aim.y) ** 2 <= reach);
    if (near.length) spots = near;
  }
  const from = aim || tower;
  spots.sort((a, b) => (a.x - from.x) ** 2 + (a.y - from.y) ** 2 - ((b.x - from.x) ** 2 + (b.y - from.y) ** 2));
  const rng = state.rng || Math.random;
  const look = tower.paragon ? 5 : Math.min(4, tower.tiers[1]);
  const pierce = Math.max(1, Math.round(st.pierceN));
  for (let k = 0; k < count; k++) {
    const sp = spots[Math.floor(rng() * rng() * rng() * spots.length)];      // les premiers tas tombent au même endroit, donc ils s'empilent
    const dist = sp.dist + (rng() - 0.5) * 10;
    const near = state.spikes.find((p) => p.lane === sp.lane && Math.abs(p.dist - dist) < 9 && p.pierce > 0);
    if (near) {
      if (near.stack >= 6) continue;
      near.stack += 1;
      near.pierce += pierce;
      near.dmg = Math.max(near.dmg, st.damage);
      near.ignore = near.ignore || st.pierce;
      near.look = Math.max(near.look, look);
      near.src = tower;
    } else {
      state.spikes.push({ lane: sp.lane, dist, x: sp.x, y: sp.y, pierce, stack: 1, look, dmg: st.damage, ignore: st.pierce, src: tower });
    }
  }
  if (state.spikes.length > 240) state.spikes.splice(0, state.spikes.length - 240);
  return count;
}

function projectileHit(state, pr, e, events) {
  const st = pr.st;
  const rng = state.rng || Math.random;
  let damage = st.damage;
  if (st.crit && rng() < Math.min(0.95, st.crit)) damage *= st.critMul;
  if (st.execute && !isBoss(e) && e.hp - damage <= e.maxHp * st.execute) damage = Math.max(damage, e.hp);
  state.src = pr.tower;
  hit(state, e, damage, events, st.pierce);
  applyEffects(state, e, st);
  state.src = null;
}

// Fait avancer les projectiles : position sur la boucle, et touches (une fois par ennemi et par trajet).
function stepProjectiles(state, dt, events) {
  for (const pr of state.projs) {
    if (pr.kind === "dart") { stepDart(state, pr, dt, events); continue; }
    const end = 2 * Math.PI * pr.loops;
    pr.theta = Math.min(end, pr.theta + pr.omega * dt);
    const leg = Math.min(pr.loops * 2 - 1, Math.floor(pr.theta / Math.PI));
    if (leg !== pr.leg) { pr.leg = leg; pr.hitSet = new Set(); pr.count = 0; }
    const phase = pr.theta % (2 * Math.PI);
    pr.x = pr.ox + pr.ux * (pr.R / 2) * (1 - Math.cos(phase)) + pr.vx * pr.arc * Math.sin(phase);
    pr.y = pr.oy + pr.uy * (pr.R / 2) * (1 - Math.cos(phase)) + pr.vy * pr.arc * Math.sin(phase);
    for (const e of state.enemies) {
      if (pr.count >= pr.pierceN) break;
      if (e.dead || pr.hitSet.has(e.id) || (e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 > 18 * 18) continue;
      pr.hitSet.add(e.id);
      pr.count += 1;
      projectileHit(state, pr, e, events);
    }
    if (pr.theta >= end) pr.done = true;
  }
  state.projs = state.projs.filter((p) => !p.done);
}

// Fléchette du Dartling : ligne droite ; elle touche chaque ennemi croisé une seule fois, jusqu'à `pierceN` ennemis.
// On teste le segment parcouru pendant le pas (pas seulement le point d'arrivée) : à 900 px/s, rien ne passe au travers.
function stepDart(state, pr, dt, events) {
  const x0 = pr.x, y0 = pr.y;
  const step = DART_SPEED * dt;
  pr.x += pr.ux * step;
  pr.y += pr.uy * step;
  const hits = [];
  for (const e of state.enemies) {
    if (e.dead || pr.hitSet.has(e.id)) continue;
    const rx = e.x - x0, ry = e.y - y0;
    const along = rx * pr.ux + ry * pr.uy;
    if (along < -LINE_WIDTH || along > step + LINE_WIDTH) continue;
    if (Math.abs(rx * pr.uy - ry * pr.ux) > LINE_WIDTH) continue;
    hits.push({ e, along });
  }
  hits.sort((a, b) => a.along - b.along);
  for (const { e } of hits) {
    if (pr.count >= pr.pierceN) break;
    pr.hitSet.add(e.id);
    pr.count += 1;
    projectileHit(state, pr, e, events);
  }
  if (pr.count >= pr.pierceN || pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20) pr.done = true;
}

// Un ennemi qui avance de `before` à e.dist franchit les pointes posées entre les deux sur son chemin.
function crossSpikes(state, e, before, events) {
  for (const sp of state.spikes) {
    if (sp.pierce <= 0 || sp.lane !== e.lane || sp.dist <= before || sp.dist > e.dist) continue;
    state.src = sp.src;
    hit(state, e, sp.dmg, events, sp.ignore);
    state.src = null;
    sp.pierce -= 1;
    if (e.dead) break;
  }
}

function burnEnemy(e, dps, time, src) {
  e.poison = Math.max(e.poison, dps);
  e.poisonLeft = Math.max(e.poisonLeft, time);
  e.poisonBy = src || e.poisonBy || null;
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
  const cx = tower.x;
  const cy = tower.y;
  const origin = { x: cx, y: cy };
  const rng = state.rng || Math.random;

  // Spike Factory : fabrique des pointes sur le chemin pendant les vagues.
  if (def.spikes) {
    if (state.phase !== "wave") return false;
    return addSpikes(state, tower, st, st.batch) > 0;
  }

  // Dartling : portée infinie, il tire dès qu'il reste des ennemis, vers son point visé ou la souris.
  if (def.line && !state.enemies.some((e) => !e.dead)) { tower.dyn = 1; return false; }

  // Cibles : les ennemis à portée, triés selon le mode de ciblage de la tour.
  const inRange = def.line ? [] : sortTargets(state.enemies.filter((e) => !e.dead && dist2(origin, e) <= range * range), tower.target, origin);
  if (!def.line && !inRange.length) { tower.dyn = 1; return false; }

  // Desperado : cadence selon le nombre d'ennemis à portée (duel) et la distance de la cible (dégaine rapide).
  let dyn = 1;
  if (inRange.length) {
    if (st.duel) dyn += st.duel * Math.max(0, (5 - inRange.length) / 4);
    if (st.quick) dyn += st.quick * Math.min(1, Math.sqrt(dist2(origin, inRange[0])) / range);
  }
  tower.dyn = dyn;

  const maxChance = fury && fury.crit >= 1 ? 1 : 0.95;
  const beam = (a, b) => state.fx.push({ kind: "beam", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ttl: 0.1, max: 0.1, color: def.color });
  // Dégâts d'un coup : critique (plus fréquent de loin pour le Desperado) et exécution selon les paliers.
  const strike = (e, base) => {
    let damage = base;
    const chance = Math.min(maxChance, st.crit + (st.critFar && !def.line ? st.critFar * Math.min(1, Math.sqrt(dist2(origin, e)) / range) : 0));
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
  if (list.length) tower.angle = Math.atan2(list[0].y - cy, list[0].x - cx);

  if (def.line) {
    const aim = tower.aimMode === "mouse" && state.cursor ? state.cursor : tower.aim;
    const len = Math.hypot(aim.x - cx, aim.y - cy);
    if (len < 2) return false;
    const ux0 = (aim.x - cx) / len;
    const uy0 = (aim.y - cy) / len;
    tower.angle = Math.atan2(uy0, ux0);
    const n = Math.round(st.targets);
    const dirs = Array.from({ length: n }, (_, k) => {
      const a = (k - (n - 1) / 2) * 0.06;
      return [ux0 * Math.cos(a) - uy0 * Math.sin(a), ux0 * Math.sin(a) + uy0 * Math.cos(a)];
    });
    if (st.beam) {
      // Laser continu : un coup toutes les BEAM_TICK s sur TOUS les ennemis de la ligne. Les bonus de cadence
      // (améliorations, Beacons, capacité) augmentent les dégâts de chaque coup au lieu de la fréquence.
      const per = st.damage * (towerRate(state, tower) / def.rate);
      const width = st.beam >= 2 ? LINE_WIDTH + 7 : LINE_WIDTH;
      tower.beamUntil = state.time + BEAM_TICK * 1.6;
      for (const [ux, uy] of dirs) {
        for (const e of rayEnemies(state, cx, cy, ux, uy, RAY_LENGTH, width)) { strike(e, per); applyEffects(state, e, st); }
      }
      return true;
    }
    // Fléchettes : un vrai projectile par canon, qui file en ligne droite et transperce `pierceN` ennemis.
    const pierceN = Math.max(1, Math.round(st.pierceN));
    for (const [ux, uy] of dirs) {
      state.projs.push({
        kind: "dart", tower, x: cx + ux * 14, y: cy + uy * 14, ux, uy, hitSet: new Set(), count: 0, pierceN, color: def.color, done: false,
        st: { damage: st.damage, crit: st.crit, critMul: st.critMul, pierce: st.pierce, execute: st.execute, stun: st.stun }
      });
    }
    if (state.projs.length > 400) state.projs.splice(0, state.projs.length - 400);
    return true;
  }

  if (def.radial) {
    // Tack Shooter : une couronne de pointes qui tourne un peu à chaque salve.
    const n = Math.max(1, Math.round(st.radial));
    tower.spin = (tower.spin || 0) + Math.PI / n;
    for (let k = 0; k < n; k++) {
      const a = tower.spin + (k * 2 * Math.PI) / n;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const hits = rayEnemies(state, cx, cy, ux, uy, range, LINE_WIDTH + 6);
      state.fx.push({ kind: "beam", x1: cx, y1: cy, x2: cx + ux * range, y2: cy + uy * range, ttl: 0.08, max: 0.08, color: def.color });
      for (const e of hits.slice(0, st.pierceN)) { strike(e, st.damage); applyEffects(state, e, st); }
    }
    return true;
  }

  if (def.boom) {
    // Boomerang : un vrai projectile. Il part vers la cible en décrivant une boucle, la dépasse, puis revient vers la tour
    // (un aller-retour par « returns »). Sur chaque trajet (aller ou retour) il touche au plus `pierceN` ennemis, chacun une fois.
    for (const target of list) {
      const dx = target.x - cx;
      const dy = target.y - cy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.max(50, Math.min(range, dist + 20));
      state.projs.push({
        kind: "boom", tower, ox: cx, oy: cy, ux: dx / dist, uy: dy / dist, vx: -dy / dist, vy: dx / dist,
        R: reach, arc: reach * 0.15, omega: 680 / reach, theta: 0, loops: Math.max(1, Math.round(st.returns)),
        leg: -1, hitSet: new Set(), count: 0, pierceN: Math.max(1, Math.round(st.pierceN)), x: cx, y: cy, color: def.color, done: false,
        st: { damage: st.damage, crit: st.crit, critMul: st.critMul, pierce: st.pierce, execute: st.execute, stun: st.stun, burn: st.burn, burnTime: st.burnTime, poisonDps: st.poisonDps, poisonTime: st.poisonTime, slow: st.slow, slowTime: st.slowTime, freezeChance: st.freezeChance, freezeTime: st.freezeTime }
      });
    }
    if (state.projs.length > 120) state.projs.splice(0, state.projs.length - 120);
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
  const o = { x: tower.x, y: tower.y };
  return alive(state).filter((e) => dist2(o, e) <= reach * reach);
};
const origin = (tower) => ({ x: tower.x, y: tower.y });
const abilityStats = (state, tower) => {
  const buff = beaconBuff(state, tower);
  return { ...tower.st, damage: tower.st.damage * buff.damage, range: tower.st.range * buff.range };
};

export const ABILITIES = {
  overdrive: { name: "Surcharge", cd: 45, desc: "6 s : cadence ×2,5 et dégâts ×1,5.", fury: { time: 6, rate: 2.5, dmg: 1.5 } },
  frenzy:    { name: "Furie", cd: 40, desc: "5 s : cadence ×3, dégâts ×1,5, balles perforantes.", fury: { time: 5, rate: 3, dmg: 1.5, pierce: true } },
  highnoon:  { name: "Midi pile", cd: 45, desc: "5 s : cadence ×3, dégâts ×2, tous les tirs sont critiques et perforants.", fury: { time: 5, rate: 3, dmg: 2, crit: 1, pierce: true } },
  deathbeam: { name: "Rayon fatal", cd: 40, desc: "4 s : les tirs transpercent toute la ligne, dégâts ×3 et cadence ×2.", fury: { time: 4, rate: 2, dmg: 3, pierceN: 99 } },
  sunburst:  { name: "Avatar solaire", cd: 45, desc: "6 s : cadence ×2,5, dégâts ×2,5, tirs perforants.", fury: { time: 6, rate: 2.5, dmg: 2.5, pierce: true } },
  inferno: {
    name: "Anneau infernal", cd: 40, desc: "Nova de feu : 5× dégâts et brûlure (60/s pendant 4 s) à tous les ennemis proches.",
    run(state, tower, st, events) {
      state.fx.push({ kind: "boom", x: tower.x, y: tower.y, r: st.range * 2, ttl: 0.5, max: 0.5, color: "#ff7a7a" });
      for (const e of around(state, tower, st.range * 2)) { hit(state, e, st.damage * 5, events, true); if (!e.dead) burnEnemy(e, 60, 4, tower); }
    }
  },
  tornado: {
    name: "Tornade", cd: 45, desc: "Un vortex de lames : 4× dégâts et étourdit (0,6 s) tous les ennemis proches.",
    run(state, tower, st, events) {
      state.fx.push({ kind: "boom", x: tower.x, y: tower.y, r: st.range * 1.8, ttl: 0.5, max: 0.5, color: "#7ad7ff" });
      for (const e of around(state, tower, st.range * 1.8)) { hit(state, e, st.damage * 4, events, true); stunEnemy(e, 0.6); }
    }
  },
  dragon: {
    name: "Souffle du dragon", cd: 45, desc: "3× dégâts et brûlure (40/s pendant 5 s) à tous les ennemis proches.",
    run(state, tower, st, events) {
      state.fx.push({ kind: "boom", x: tower.x, y: tower.y, r: st.range * 2, ttl: 0.5, max: 0.5, color: "#ff8a3d" });
      for (const e of around(state, tower, st.range * 2)) { hit(state, e, st.damage * 3, events, true); if (!e.dead) burnEnemy(e, 40, 5, tower); }
    }
  },
  spikestorm: {
    name: "Tempête de pointes", cd: 40, desc: "Pose 40 tas de pointes d'un coup sur le chemin à portée.",
    run(state, tower, st) { addSpikes(state, tower, st, 40); }
  },
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
      for (let k = 0; k < n; k++) spawn(state, { type: "drone", hp, lane: e.lane }, Math.max(0, e.dist - 10 - k * 9));
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
      const before = e.dist;
      e.dist += e.speed * rage * (1 - e.slow) * dt;
      if (state.spikes.length) { crossSpikes(state, e, before, events); if (e.dead) continue; }
    }
    const lane = state.map.lanes[e.lane || 0];
    if (e.dist >= lane.length) {
      e.dead = true;
      e.leaked = true;
      state.lives -= def.lives;
      events.leaked += 1;
      continue;
    }
    const p = pointAt(e.dist, lane);
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
    if (fire(state, tower, events)) tower.cooldown = tower.st.beam ? BEAM_TICK : 1 / towerRate(state, tower);
    else tower.cooldown = 0;   // rien à portée : elle tirera dès qu'un ennemi arrive
  }

  if (state.projs.length) stepProjectiles(state, dt, events);
  state.enemies = state.enemies.filter((e) => !e.dead);
  if (state.spikes.length) state.spikes = state.spikes.filter((sp) => sp.pierce > 0);

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
    state.spikes = [];
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
// Comme dans BTD6, un paragon est une tour à part, avec son nom, ses caractéristiques propres et sa capacité propre
// (ce n'est pas la somme des trois chemins). On le crée en fusionnant 3 tours d'un même type au palier maximum :
//  - idéalement une par chemin (fusion « complète » : +3 degrés) ; trois tours du même chemin marchent aussi ;
//  - le prix dépend de la puissance du type de tour ;
//  - au moment de la fusion (et seulement alors), on peut investir de l'énergie en plus pour monter le degré (1 à 20) ;
//  - le degré monte aussi avec la valeur des tours sacrifiées et, ensuite, avec les éliminations.
// Une seule par type.

// Estimation de la puissance (dégâts par seconde « équivalents ») à partir des caractéristiques d'une tour.
export function powerOfStats(def, st) {
  if (def.support) return 2600 * (st.boostDamage + st.boostRate);
  if (def.income) return 10 * st.income * (1 + st.interest * 8);
  const crit = Math.min(0.95, st.crit + st.critFar * 0.5);
  let dps = st.damage * (1 + crit * (st.critMul - 1)) * st.rate * (1 + st.burst);
  let reach = st.targets;
  if (def.pulse) reach *= 3;
  if (st.splash) reach *= 1 + st.splash * 1.3;
  if (st.chain) reach *= 1 + (st.chain - 1) * 0.5;
  if (def.line || def.boom || def.radial) reach *= Math.min(st.pierceN, 8) * 0.6 + 0.4;
  if (def.radial) reach *= Math.max(1, st.radial / 3);
  if (def.boom) dps *= 2 * st.returns;
  if (def.spikes) { dps = st.damage * st.pierceN * st.rate * st.batch; reach = 1; }
  if (st.beam) { reach = st.targets * 8 * (st.beam >= 2 ? 1.3 : 1); dps /= def.rate * BEAM_TICK; }   // laser continu : toute la ligne, un coup toutes les 0,13 s
  dps *= reach;
  dps += (st.poisonDps + st.burn) * 0.6 * Math.min(reach, 4);
  return dps;
}
export const towerPower = (def, tiers = [MAX_TIER, MAX_TIER, MAX_TIER]) => powerOfStats(def, towerStats(def, tiers));

// Les 18 paragons : nom, description, « forme » (ce qui change par rapport à la tour de base), puissance visée (ratio par rapport
// à 3 tours maximales, au degré 1) et capacité (version renforcée d'une capacité du type, sous un nom propre).
export const PARAGONS = {
  laser:    { name: "Prisme Absolu", desc: "7 rayons perforants, critiques fréquents.", ratio: 3, ability: ["overdrive", "Rayon absolu"], shape: { targets: 6, range: 1.4, rate: 1.5, crit: 0.2, critMul: 3, pierce: true } },
  cryo:     { name: "Zéro Éternel", desc: "Gel de zone fréquent, ralentit presque à l'arrêt.", ratio: 2.5, ability: ["absolute", "Hiver éternel"], shape: { splash: 1.6, slow: 0.75, slowTime: 4, freezeChance: 0.5, freezeTime: 1, rate: 1.6, range: 1.4 } },
  canon:    { name: "Dévastateur Plasma", desc: "Explosions colossales qui étourdissent.", ratio: 3, ability: ["barrage", "Cataclysme"], shape: { splash: 1.6, stun: 0.9, targets: 2, rate: 1.8, range: 1.3 } },
  sniper:   { name: "Œil du Juge", desc: "3 tirs perforants, exécute les ennemis affaiblis.", ratio: 3, ability: ["headshot", "Verdict"], shape: { crit: 0.5, critMul: 5, execute: 0.4, targets: 2, rate: 2.5, pierce: true, range: 1.4 } },
  tesla:    { name: "Colosse Foudroyant", desc: "Éclair de 10 rebonds sans perte, qui étourdit.", ratio: 3, ability: ["storm", "Jugement de la foudre"], shape: { chain: 9, chainFalloff: 1, chainReach: 1.5, stun: 0.8, rate: 2, range: 1.3 } },
  venin:    { name: "Pandémie Vivante", desc: "Poison foudroyant qui gagne 8 voisins.", ratio: 3, ability: ["plague", "Fléau"], shape: { spreadCount: 8, spreadRadius: 2.2, poisonTime: 6, targets: 2, rate: 2, range: 1.4 } },
  mortier:  { name: "Titan d'Artillerie", desc: "Obus géants en rafale, qui étourdissent.", ratio: 3, ability: ["carpet", "Pilonnage total"], shape: { splash: 2.3, targets: 2, stun: 0.9, rate: 3, range: 1.3 } },
  gatling:  { name: "Moissonneuse d'Acier", desc: "4 canons perforants à cadence folle.", ratio: 3, ability: ["frenzy", "Moisson"], shape: { targets: 3, rate: 1.8, range: 1.3, pierce: true, crit: 0.2 } },
  pulsar:   { name: "Singularité", desc: "Onde géante qui étourdit et fige les ennemis.", ratio: 3, ability: ["shock", "Effondrement"], shape: { range: 1.6, rate: 2, pulseSlow: 0.8, pulseSlowTime: 2, stun: 0.9 } },
  beacon:   { name: "Nexus Souverain", desc: "Aura énorme : dégâts et cadence des alliés au maximum.", ratio: 2.5, ability: ["surge", "Nexus ardent"], shape: { range: 1.6, boostRange: 0.25 } },
  miner:    { name: "Banque Centrale", desc: "Production colossale et gros intérêts.", ratio: 2.5, ability: ["dividend", "Krach inversé"], shape: { interest: 0.05 } },
  dartling: { name: "Rayon du Jugement", desc: "4 rayons qui traversent toute la ligne.", ratio: 3, ability: ["deathbeam", "Rayon final"], shape: { pierceN: 99, targets: 3, rate: 1.8 } },
  desperado:{ name: "Légende du Désert", desc: "Salves de 9 tirs, duel, critiques lointains, prime d'énergie doublée.", ratio: 3, ability: ["highnoon", "Dernier duel"], shape: { burst: 8, duel: 2, quick: 1, critFar: 0.5, crit: 0.2, critMul: 4, execute: 0.25, pierce: true, bounty: 1, range: 1.3 } },
  tack:     { name: "Hérisson Infernal", desc: "24 pointes brûlantes qui transpercent.", ratio: 3, ability: ["inferno", "Hérisson ardent"], shape: { radial: 16, pierceN: 3, burn: 80, burnTime: 3, rate: 1.8, range: 1.5, pierce: true } },
  boomerang:{ name: "Seigneur des Glaives", desc: "Glaives qui font trois allers-retours en transperçant.", ratio: 3, ability: ["tornado", "Tempête de glaives"], shape: { pierceN: 10, returns: 2, targets: 2, rate: 2, range: 1.4, pierce: true } },
  wizard:   { name: "Archimage", desc: "Boules de feu géantes, brûlure intense, trois sorts à la fois.", ratio: 3, ability: ["dragon", "Cataclysme arcanique"], shape: { splash: 1.2, burn: 100, burnTime: 3, targets: 3, rate: 2, range: 1.3 } },
  spikes:   { name: "Forge Sans Fin", desc: "Cascade de pointes dorées perforantes, tas empilés, où tu veux dans sa portée.", ratio: 3, ability: ["spikestorm", "Forge ardente"], shape: { batch: 4, rate: 3, pierceN: 8, pierce: true, range: 1.3, aimSpikes: 1 } },
  super:    { name: "Avatar Solaire", desc: "Rayons solaires explosifs sur 6 cibles.", ratio: 3, ability: ["sunburst", "Éclipse solaire"], shape: { targets: 5, rate: 2, range: 1.4, splash: 0.8, pierce: true, crit: 0.2, critMul: 3 } }
};

// Capacité de paragon : la capacité du type, en plus forte, sous un nom propre.
for (const [id, spec] of Object.entries(PARAGONS)) {
  const base = ABILITIES[spec.ability[0]];
  const name = spec.ability[1];
  const desc = `${base.desc} Version paragon, nettement plus puissante.`;
  if (base.fury) {
    const f = base.fury;
    ABILITIES[`par_${id}`] = { name, desc, cd: base.cd, fury: { ...f, time: f.time * 1.6, ...(f.rate ? { rate: f.rate * 1.3 } : {}), ...(f.dmg ? { dmg: f.dmg * 1.3 } : {}) } };
  } else {
    ABILITIES[`par_${id}`] = { name, desc, cd: base.cd, run(state, tower, st, events) { base.run(state, tower, { ...st, damage: st.damage * 2.5, income: st.income * 3 }, events); } };
  }
}

// Caractéristiques de base d'un paragon (degré 1) : forme du paragon, puis dégâts mis à l'échelle pour atteindre la puissance visée.
const paragonBaseCache = {};
function paragonBase(def) {
  if (paragonBaseCache[def.id]) return paragonBaseCache[def.id];
  const spec = PARAGONS[def.id];
  const st = towerStats(def, [0, 0, 0]);
  applyFx(st, spec.shape);
  let ref = 0;
  for (let p = 0; p < PATH_COUNT; p++) for (let q = 0; q < PATH_COUNT; q++) {
    if (p === q) continue;
    const tiers = [0, 0, 0];
    tiers[p] = MAX_TIER;
    tiers[q] = 2;
    ref = Math.max(ref, towerPower(def, tiers));
  }
  const p0 = powerOfStats(def, st);
  const k = p0 > 0 ? (spec.ratio * 3 * ref) / p0 : 1;
  st.damage *= k; st.poisonDps *= k; st.burn *= k; st.boostDamage *= k; st.boostRate *= k; st.income *= k;
  st.ability = `par_${def.id}`;
  st.power = powerOfStats(def, st);
  paragonBaseCache[def.id] = st;
  return st;
}

// Prix : selon la puissance du paragon (et un coefficient propre au type, plus fort pour le Dartling).
export const paragonCost = (def) => Math.round(((def.cost * 3 + 1000 * Math.log(1 + paragonBase(def).power / 300)) * (def.paragonMul || 1)) / 50) * 50;

// Le degré (1 à 20) : tours sacrifiées + fusion complète + énergie investie à la fusion + éliminations ensuite (jusqu'à +10).
export function paragonDegree(tower) {
  const pg = tower.paragon;
  if (!pg) return 0;
  const killBonus = Math.min(10, Math.floor((tower.kills || 0) / 150));
  return Math.max(1, Math.min(PARAGON_MAX_DEGREE, pg.base + Math.floor(pg.extra / pg.step) + killBonus));
}

export function paragonStats(def, tower) {
  const st = { ...paragonBase(def) };
  const d = paragonDegree(tower);
  st.degree = d;
  if (def.support) { st.boostDamage *= 1 + 0.1 * (d - 1); st.boostRate *= 1 + 0.1 * (d - 1); }
  else if (def.income) st.income *= 1 + 0.15 * (d - 1);
  else { st.damage *= 1 + 0.15 * (d - 1); st.rate *= 1 + 0.03 * (d - 1); st.range *= 1 + 0.01 * (d - 1); st.poisonDps *= 1 + 0.15 * (d - 1); st.burn *= 1 + 0.15 * (d - 1); }
  return st;
}

function refreshParagon(tower) {
  const def = TOWER_DEFS[tower.type];
  if (paragonDegree(tower) !== tower.st.degree) tower.st = paragonStats(def, tower);
}

const maxedPaths = (t) => t.tiers.map((x, i) => (x >= MAX_TIER ? i : -1)).filter((i) => i >= 0);

// Tout ce qu'il faut savoir avant de fusionner : { is: true, degree } si c'en est un déjà ; sinon le prix, le pas du curseur
// d'investissement (step = énergie pour +1 degré, maxSteps = nombre de pas utiles), le degré de départ, les chemins couverts
// par les tours prêtes (covered), si la fusion est complète (3 chemins), et la raison du blocage :
// have (ce type a déjà un paragon) | notmax (aucun chemin au palier max) | need (pas assez de tours prêtes) | gold.
export function paragonInfo(state, tower) {
  const def = TOWER_DEFS[tower.type];
  if (tower.paragon) return { is: true, degree: paragonDegree(tower) };
  const cost = paragonCost(def);
  const step = Math.max(10, Math.round((cost * 0.1) / 10) * 10);
  const ready = state.towers.filter((t) => t.type === tower.type && !t.paragon && t.tiers.some((x) => x >= MAX_TIER));
  // Les 2 autres tours sacrifiées : d'abord celles qui apportent un chemin différent, puis les plus investies.
  const covered = new Set(maxedPaths(tower));
  const pool = ready.filter((t) => t !== tower);
  const others = [];
  while (others.length < PARAGON_NEED - 1 && pool.length) {
    const fresh = (t) => maxedPaths(t).filter((p) => !covered.has(p)).length;
    pool.sort((a, b) => fresh(b) - fresh(a) || invested(b) - invested(a));
    const t = pool.shift();
    others.push(t);
    maxedPaths(t).forEach((p) => covered.add(p));
  }
  const complete = covered.size >= PATH_COUNT && others.length >= PARAGON_NEED - 1;
  const sacrificed = invested(tower) + others.reduce((sum, t) => sum + invested(t), 0);
  const base = Math.min(PARAGON_MAX_DEGREE, 1 + Math.floor(sacrificed / (cost * 0.6)) + (complete ? PARAGON_COMPLETE_BONUS : 0));
  const maxSteps = Math.max(0, PARAGON_MAX_DEGREE - base);
  let reason = null;
  if (state.towers.some((t) => t.type === tower.type && t.paragon)) reason = "have";
  else if (!tower.tiers.some((x) => x >= MAX_TIER)) reason = "notmax";
  else if (ready.length < PARAGON_NEED) reason = "need";
  else if (state.gold < cost) reason = "gold";
  return { is: false, cost, step, base, maxSteps, sacrificed, others, ready: ready.length, need: PARAGON_NEED, complete, covered: [0, 1, 2].map((p) => covered.has(p)), reason };
}

// Fusionne : la tour choisie devient le paragon, les 2 autres tours prêtes sont sacrifiées.
// steps : nombre de pas d'investissement supplémentaire (chacun coûte info.step et ajoute 1 degré), possible seulement ici.
export function makeParagon(state, id, steps = 0) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || state.phase === "over") return { ok: false, reason: "unknown" };
  const info = paragonInfo(state, tower);
  if (info.is) return { ok: false, reason: "have" };
  if (info.reason) return { ok: false, reason: info.reason };
  const n = Math.max(0, Math.min(info.maxSteps, Math.floor(Number(steps) || 0)));
  const extra = n * info.step;
  if (state.gold < info.cost + extra) return { ok: false, reason: "gold" };
  const def = TOWER_DEFS[tower.type];
  const spent = info.sacrificed + info.cost + extra;
  state.gold -= info.cost + extra;
  state.towers = state.towers.filter((t) => !info.others.includes(t));
  tower.paragon = { spent, base: info.base, extra, step: info.step, complete: info.complete };
  tower.tiers = [MAX_TIER, MAX_TIER, MAX_TIER];
  tower.st = paragonStats(def, tower);
  tower.abilityCd = 0;
  if (tower.st.aimSpikes && !tower.aim) aimSpikesDefault(state, tower);
  state.fx.push({ kind: "boom", x: tower.x, y: tower.y, r: CELL * 2, ttl: 0.6, max: 0.6, color: "#fcee0a" });
  return { ok: true, tower, sacrificed: info.others.map((t) => t.id), paid: info.cost + extra };
}
