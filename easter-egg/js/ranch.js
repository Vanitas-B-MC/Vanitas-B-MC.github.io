// js/ranch.js — logique pure de « Vallée Néon », le jeu de ferme façon Stardew Valley. Aucun accès au DOM.
//
// La carte fait 48 × 36 cases. Le sol (herbe, chemin, eau, enclos, serre…) est fixe et recalculé à chaque chargement ;
// seul ce qui change est sauvegardé : terre labourée, cultures, objets posés (pierres, arbres, arroseurs, machines…).
// Le temps du jeu avance de 6 h à 2 h du matin. Dormir passe au jour suivant : les cultures arrosées poussent, la caisse
// d'expédition est vendue, les animaux produisent, les machines avancent et de nouveaux débris apparaissent.
// 4 saisons de 14 jours. Chaque culture a ses saisons ; hors saison elle fane (sauf dans la serre).

import { wealthBonus } from "./rewards.js";

export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 36;
export const DAYS_PER_SEASON = 14;
export const DAY_START = 6 * 60;          // 6 h 00
export const DAY_END = 26 * 60;           // 2 h 00 du matin : on s'évanouit
export const MIDNIGHT = 24 * 60;
export const REAL_MS_PER_MIN = 600;       // 1 minute de jeu = 0,6 s → une journée dure 12 minutes
export const MAX_ENERGY = 100;
export const START_GOLD = 500;
export const SHOP_OPEN = 8 * 60;
export const SHOP_CLOSE = 20 * 60;
export const BAG_SIZES = [12, 24, 36];
export const SEASONS = ["Printemps", "Été", "Automne", "Hiver"];
export const QUALITY = ["", "Argent", "Or", "Iridium"];
export const QUALITY_MULT = [1, 1.25, 1.5, 2];
export const WEATHER = {
  sun: { name: "Soleil", icon: "☀" },
  rain: { name: "Pluie", icon: "☂" },
  storm: { name: "Orage", icon: "⚡" },
  snow: { name: "Neige", icon: "❄" }
};

export const idx = (x, y) => y * MAP_W + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/* ================= Sol ================= */

export const G = { GRASS: 0, PATH: 1, WATER: 2, SAND: 3, WALL: 4, BUILD: 5, GH: 6, GHWALL: 7, GHDOOR: 8, FENCE: 9, PEN: 10, GRAVEL: 11 };

// Bâtiments fixes. `x, y, w, h` = emprise au sol (cases pleines).
export const BUILDINGS = [
  { id: "house",  name: "Maison",              x: 5,  y: 2,  w: 6, h: 4 },
  { id: "well",   name: "Puits",               x: 3,  y: 5,  w: 1, h: 1 },
  { id: "bin",    name: "Caisse d'expédition", x: 12, y: 5,  w: 2, h: 1 },
  { id: "board",  name: "Panneau des demandes", x: 15, y: 4, w: 2, h: 2 },
  { id: "shop",   name: "Kiosque de Robin",    x: 40, y: 2,  w: 5, h: 3 },
  { id: "coop",   name: "Poulailler",          x: 26, y: 22, w: 5, h: 3, pen: { x: 24, y: 25, w: 10, h: 7, gate: { x: 24, y: 28 } } },
  { id: "barn",   name: "Grange",              x: 37, y: 21, w: 7, h: 4, pen: { x: 35, y: 25, w: 11, h: 8, gate: { x: 35, y: 29 } } }
];
export const GREENHOUSE = { x: 18, y: 1, w: 10, h: 6, door: { x: 22, y: 6 } };   // murs compris ; intérieur 8 × 4
export const QUARRY = { x: 39, y: 8, w: 8, h: 12 };
export const FOREST = { x: 1, y: 9, w: 5, h: 26 };
export const POND = { cx: 10, cy: 30, rx: 4.2, ry: 2.8 };
export const buildingById = (id) => BUILDINGS.find((b) => b.id === id) ?? null;

const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

function buildGround() {
  const g = new Uint8Array(MAP_W * MAP_H);
  const bmap = new Int8Array(MAP_W * MAP_H).fill(-1);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let t = G.GRASS;
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) t = G.WALL;
      else if (inRect(x, y, QUARRY)) t = G.GRAVEL;
      const d = ((x - POND.cx) / POND.rx) ** 2 + ((y - POND.cy) / POND.ry) ** 2;
      if (d <= 1) t = G.WATER;
      else if (d <= 1.55 && t === G.GRASS) t = G.SAND;
      g[idx(x, y)] = t;
    }
  }
  // Chemins : une grande allée et des embranchements.
  for (let x = 2; x <= 45; x++) g[idx(x, 7)] = G.PATH;
  for (let y = 6; y <= 7; y++) g[idx(7, y)] = G.PATH;
  for (let y = 5; y <= 7; y++) g[idx(42, y)] = G.PATH;
  for (let y = 8; y <= 21; y++) g[idx(34, y)] = G.PATH;
  for (let x = 20; x <= 34; x++) g[idx(x, 21)] = G.PATH;
  for (let y = 22; y <= 28; y++) g[idx(22, y)] = G.PATH;
  g[idx(23, 28)] = G.PATH;
  for (let x = 34; x <= 34; x++) for (let y = 25; y <= 29; y++) g[idx(x, y)] = G.PATH;
  for (let y = 6; y <= 6; y++) g[idx(12, y)] = G.PATH;
  // Serre (murs vitrés, porte en bas).
  for (let y = GREENHOUSE.y; y < GREENHOUSE.y + GREENHOUSE.h; y++) {
    for (let x = GREENHOUSE.x; x < GREENHOUSE.x + GREENHOUSE.w; x++) {
      const edge = x === GREENHOUSE.x || y === GREENHOUSE.y || x === GREENHOUSE.x + GREENHOUSE.w - 1 || y === GREENHOUSE.y + GREENHOUSE.h - 1;
      g[idx(x, y)] = edge ? G.GHWALL : G.GH;
    }
  }
  g[idx(GREENHOUSE.door.x, GREENHOUSE.door.y)] = G.GHDOOR;
  // Enclos.
  BUILDINGS.forEach((b, i) => {
    if (b.pen) {
      const p = b.pen;
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          const edge = x === p.x || y === p.y || x === p.x + p.w - 1 || y === p.y + p.h - 1;
          g[idx(x, y)] = edge ? G.FENCE : G.PEN;
        }
      }
      g[idx(p.gate.x, p.gate.y)] = G.PEN;
    }
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { g[idx(x, y)] = G.BUILD; bmap[idx(x, y)] = i; }
  });
  return { g, bmap };
}

export const { g: GROUND, bmap: BMAP } = buildGround();
export const groundAt = (x, y) => (inMap(x, y) ? GROUND[idx(x, y)] : G.WALL);
export const buildingAt = (x, y) => (inMap(x, y) && BMAP[idx(x, y)] >= 0 ? BUILDINGS[BMAP[idx(x, y)]] : null);
export const inGreenhouse = (x, y) => groundAt(x, y) === G.GH;

// Peut-on labourer cette case ? (herbe normale, ou intérieur de la serre une fois réparée)
export function tillable(r, x, y) {
  const t = groundAt(x, y);
  if (t === G.GH) return !!r.built.greenhouse;
  return t === G.GRASS;
}

/* ================= Objets du catalogue ================= */

// Cultures. shape : dessin (root, leafy, bush, tall, vine, gourd, flower). fruit : va au fût en « vin », sinon « jus ».
// regrow : jours pour repousser après récolte (0 = la plante disparaît). yield : nombre récolté.
export const CROPS = [
  // Printemps
  { id: "navet",     name: "Navet",            seasons: [0],       seed: 20,  days: 4,  sell: 35,  shape: "root",   color: "#f2e7b5" },
  { id: "patate",    name: "Pomme de terre",   seasons: [0],       seed: 50,  days: 6,  sell: 80,  shape: "root",   color: "#c99a5b", extra: 0.25 },
  { id: "kale",      name: "Chou kale",        seasons: [0],       seed: 70,  days: 6,  sell: 110, shape: "leafy",  color: "#2f8f55" },
  { id: "haricot",   name: "Haricot vert",     seasons: [0],       seed: 60,  days: 8,  sell: 40,  shape: "vine",   color: "#6fd04a", regrow: 3 },
  { id: "choufleur", name: "Chou-fleur",       seasons: [0],       seed: 80,  days: 9,  sell: 175, shape: "leafy",  color: "#f6f1dc" },
  { id: "fraise",    name: "Fraise",           seasons: [0],       seed: 100, days: 8,  sell: 120, shape: "bush",   color: "#ff3355", regrow: 4, fruit: true },
  { id: "tulipe",    name: "Tulipe",           seasons: [0],       seed: 20,  days: 5,  sell: 30,  shape: "flower", color: "#ff5aa0" },
  { id: "rhubarbe",  name: "Rhubarbe",         seasons: [0],       seed: 100, days: 11, sell: 220, shape: "tall",   color: "#e0405e", fruit: true },
  // Été
  { id: "radis",     name: "Radis",            seasons: [1],       seed: 40,  days: 5,  sell: 90,  shape: "root",   color: "#ff6688" },
  { id: "tomate",    name: "Tomate",           seasons: [1],       seed: 50,  days: 9,  sell: 60,  shape: "vine",   color: "#ff4a3a", regrow: 4 },
  { id: "piment",    name: "Piment",           seasons: [1],       seed: 40,  days: 5,  sell: 40,  shape: "bush",   color: "#ff2a2a", regrow: 3, fruit: true },
  { id: "myrtille",  name: "Myrtille",         seasons: [1],       seed: 80,  days: 11, sell: 50,  shape: "bush",   color: "#4a6aff", regrow: 4, yield: 3, fruit: true },
  { id: "melon",     name: "Melon",            seasons: [1],       seed: 80,  days: 10, sell: 250, shape: "gourd",  color: "#a6e36f", fruit: true },
  { id: "houblon",   name: "Houblon",          seasons: [1],       seed: 60,  days: 10, sell: 25,  shape: "vine",   color: "#b5dc6a", regrow: 1 },
  { id: "mais",      name: "Maïs",             seasons: [1, 2],    seed: 150, days: 12, sell: 50,  shape: "tall",   color: "#ffd84a", regrow: 4 },
  { id: "ble",       name: "Blé",              seasons: [1, 2],    seed: 10,  days: 4,  sell: 25,  shape: "tall",   color: "#e3c063" },
  { id: "tournesol", name: "Tournesol",        seasons: [1, 2],    seed: 200, days: 7,  sell: 80,  shape: "flower", color: "#ffcc00" },
  // Automne
  { id: "bokchoy",   name: "Bok choy",         seasons: [2],       seed: 50,  days: 4,  sell: 80,  shape: "leafy",  color: "#90d690" },
  { id: "aubergine", name: "Aubergine",        seasons: [2],       seed: 20,  days: 5,  sell: 60,  shape: "bush",   color: "#7a3aa8", regrow: 5 },
  { id: "betterave", name: "Betterave",        seasons: [2],       seed: 20,  days: 6,  sell: 100, shape: "root",   color: "#a11545" },
  { id: "artichaut", name: "Artichaut",        seasons: [2],       seed: 30,  days: 8,  sell: 160, shape: "leafy",  color: "#6c9c5c" },
  { id: "igname",    name: "Igname",           seasons: [2],       seed: 60,  days: 10, sell: 160, shape: "root",   color: "#b8643c" },
  { id: "raisin",    name: "Raisin",           seasons: [2],       seed: 60,  days: 10, sell: 80,  shape: "vine",   color: "#8f3ec8", regrow: 3, fruit: true },
  { id: "canneberge", name: "Canneberge",      seasons: [2],       seed: 240, days: 7,  sell: 75,  shape: "bush",   color: "#c8102e", regrow: 5, yield: 2, fruit: true },
  { id: "citrouille", name: "Citrouille",      seasons: [2],       seed: 100, days: 12, sell: 320, shape: "gourd",  color: "#ff8a1a" },
  // Hiver
  { id: "givre",     name: "Racine de givre",  seasons: [3],       seed: 70,  days: 7,  sell: 160, shape: "root",   color: "#bfe6ff" },
  { id: "pourpre",   name: "Chou pourpre",     seasons: [3],       seed: 90,  days: 9,  sell: 210, shape: "leafy",  color: "#c05aff" },
  { id: "cristalys", name: "Cristalys",        seasons: [3],       seed: 120, days: 8,  sell: 110, shape: "bush",   color: "#b8f4ff", regrow: 4, fruit: true },
  // Spéciales
  { id: "ancien",    name: "Fruit ancien",     seasons: [0, 1, 2], seed: 0,   days: 14, sell: 550, shape: "bush",   color: "#3affc0", regrow: 7, fruit: true, special: "blue" },
  { id: "neonfleur", name: "Fleur néon",       seasons: [0, 1, 2, 3], seed: 0, days: 6, sell: 300, shape: "flower", color: "#ff2bd6", special: "drop" }
];
export const cropById = (id) => CROPS.find((c) => c.id === id) ?? null;
export const ANCIENT_SEED_BLUE = 2;   // prix d'une graine de fruit ancien, en pièces bleues

// Cueillette sauvage (apparaît la nuit, selon la saison).
export const FORAGE = [
  { id: "poireau",   name: "Poireau sauvage",  season: 0, sell: 60,  color: "#a6e08a" },
  { id: "jonquille", name: "Jonquille",        season: 0, sell: 30,  color: "#fff05a" },
  { id: "morille",   name: "Morille",          season: 0, sell: 150, color: "#9a6a3a", rare: true },
  { id: "pois",      name: "Pois de senteur",  season: 1, sell: 50,  color: "#ff8ad8" },
  { id: "epice",     name: "Baie épicée",      season: 1, sell: 80,  color: "#ff5a2a" },
  { id: "mure",      name: "Mûre",             season: 2, sell: 30,  color: "#4a2a6a" },
  { id: "noisette",  name: "Noisette",         season: 2, sell: 45,  color: "#a8743a" },
  { id: "girolle",   name: "Girolle",          season: 2, sell: 160, color: "#ffb43a", rare: true },
  { id: "houx",      name: "Houx",             season: 3, sell: 80,  color: "#d02a3a" },
  { id: "racine",    name: "Racine d'hiver",   season: 3, sell: 70,  color: "#c09a7a" },
  { id: "givrecristal", name: "Cristal de givre", season: 3, sell: 250, color: "#9af0ff", rare: true }
];

export const ANIMALS = [
  { id: "poule",  name: "Poule",   home: "coop", price: 800,  product: "oeuf",       every: 1, color: "#f4f0e8" },
  { id: "canard", name: "Canard",  home: "coop", price: 1200, product: "oeufcanard", every: 2, color: "#e8e0a0" },
  { id: "vache",  name: "Vache",   home: "barn", price: 1500, product: "lait",       every: 1, color: "#f0f0f0" },
  { id: "chevre", name: "Chèvre",  home: "barn", price: 4000, product: "laitchevre", every: 2, color: "#d8c8b0" },
  { id: "mouton", name: "Mouton",  home: "barn", price: 8000, product: "laine",      every: 3, color: "#f8f8f8" }
];
export const animalById = (id) => ANIMALS.find((a) => a.id === id) ?? null;
export const HOUSE_CAP = { coop: 6, barn: 6 };
export const HAY_CAP = 240;

// Objets « fixes » (pas de qualité, ni de variante).
const BASE_ITEMS = {
  // Outils
  hoe:      { name: "Houe",            cat: "tool" },
  can:      { name: "Arrosoir",        cat: "tool" },
  axe:      { name: "Hache",           cat: "tool" },
  pick:     { name: "Pioche",          cat: "tool" },
  scythe:   { name: "Faux",            cat: "tool" },
  // Ressources
  bois:     { name: "Bois",            cat: "res", price: 2,   color: "#a0703a" },
  pierre:   { name: "Pierre",          cat: "res", price: 2,   color: "#9aa0a8" },
  fibre:    { name: "Fibre",           cat: "res", price: 1,   color: "#7cc46a" },
  cuivre:   { name: "Minerai de cuivre", cat: "res", price: 5, color: "#e0864a" },
  fer:      { name: "Minerai de fer",  cat: "res", price: 10,  color: "#c8d0dc" },
  or:       { name: "Minerai d'or",    cat: "res", price: 25,  color: "#ffd23a" },
  // Produits animaux
  oeuf:       { name: "Œuf",           cat: "animal", price: 50,  energy: 25, color: "#fff6e0" },
  oeufcanard: { name: "Œuf de cane",   cat: "animal", price: 95,  energy: 38, color: "#d8f0d0" },
  lait:       { name: "Lait",          cat: "animal", price: 125, energy: 38, color: "#ffffff" },
  laitchevre: { name: "Lait de chèvre", cat: "animal", price: 225, energy: 63, color: "#f0ead8" },
  laine:      { name: "Laine",         cat: "animal", price: 340, color: "#f4f4f4" },
  // Transformés
  fromage:    { name: "Fromage",       cat: "artisan", price: 230, energy: 50, color: "#ffd860" },
  chevrotin:  { name: "Fromage de chèvre", cat: "artisan", price: 400, energy: 63, color: "#f4ecd0" },
  mayo:       { name: "Mayonnaise",    cat: "artisan", price: 190, energy: 40, color: "#fff2a0" },
  mayocanard: { name: "Mayonnaise de cane", cat: "artisan", price: 375, energy: 60, color: "#e0f0a0" },
  tissu:      { name: "Tissu",         cat: "artisan", price: 470, color: "#c8c0ff" },
  // Engrais
  engrais:    { name: "Engrais",       cat: "fert", price: 4, fert: "q1", color: "#8a6a3a" },
  engraisplus: { name: "Engrais de qualité", cat: "fert", price: 10, fert: "q2", color: "#b8842a" },
  accel:      { name: "Accélérateur",  cat: "fert", price: 10, fert: "speed", color: "#3affb0" },
  // Objets à poser
  epouvantail: { name: "Épouvantail",  cat: "place", place: "scarecrow" },
  arroseur:   { name: "Arroseur",      cat: "place", place: "sprinkler1" },
  arroseur2:  { name: "Arroseur de qualité", cat: "place", place: "sprinkler2" },
  arroseur3:  { name: "Arroseur néon", cat: "place", place: "sprinkler3" },
  bocal:      { name: "Bocal à conserves", cat: "place", place: "jar" },
  fut:        { name: "Fût",           cat: "place", place: "keg" },
  presse:     { name: "Presse",        cat: "place", place: "press" },
  metier:     { name: "Métier à tisser", cat: "place", place: "loom" }
};

// Renvoie la fiche d'un objet (nom, catégorie, prix de base, énergie si comestible…), y compris les objets « composés »
// comme « seed:navet », « jam:fraise » ou « wine:raisin ». null si l'identifiant est inconnu.
export function itemInfo(id) {
  if (typeof id !== "string") return null;
  if (BASE_ITEMS[id]) return { id, ...BASE_ITEMS[id] };
  const crop = cropById(id);
  if (crop) return { id, name: crop.name, cat: crop.fruit ? "fruit" : crop.shape === "flower" ? "flower" : "veg", price: crop.sell, energy: crop.shape === "flower" ? 0 : Math.min(60, Math.round(crop.sell * 0.35) + 5), color: crop.color, crop: crop.id };
  const forage = FORAGE.find((f) => f.id === id);
  if (forage) return { id, name: forage.name, cat: "forage", price: forage.sell, energy: Math.min(45, Math.round(forage.sell * 0.4) + 5), color: forage.color };
  const [kind, base] = id.split(":");
  const c = cropById(base);
  if (!c) return null;
  if (kind === "seed") return { id, name: `Graines de ${c.name.toLowerCase()}`, cat: "seed", price: Math.floor(c.seed / 2), color: c.color, crop: c.id };
  if (kind === "jam") return { id, name: c.fruit ? `Confiture de ${c.name.toLowerCase()}` : `Bocal de ${c.name.toLowerCase()}`, cat: "artisan", price: c.sell * 2 + 50, energy: Math.min(80, c.sell + 10), color: c.color };
  if (kind === "wine") return { id, name: c.fruit ? `Vin de ${c.name.toLowerCase()}` : `Jus de ${c.name.toLowerCase()}`, cat: "artisan", price: Math.round(c.sell * (c.fruit ? 3 : 2.25)), energy: Math.min(80, Math.round(c.sell * 0.6)), color: c.color };
  return null;
}
export const isTool = (id) => itemInfo(id)?.cat === "tool";
export const hasQuality = (id) => { const c = itemInfo(id)?.cat; return c === "veg" || c === "fruit" || c === "flower" || c === "forage" || c === "animal"; };
export const sellPrice = (id, q = 0) => Math.floor((itemInfo(id)?.price ?? 0) * QUALITY_MULT[q || 0]);
export const itemEnergy = (id, q = 0) => Math.round((itemInfo(id)?.energy ?? 0) * (1 + 0.4 * (q || 0)));

export const TOOL_TIERS = ["de base", "en cuivre", "en fer", "en or"];
export const TOOL_UPGRADES = [
  { gold: 2000,  ore: "cuivre", n: 5 },
  { gold: 5000,  ore: "fer",    n: 5 },
  { gold: 12000, ore: "or",     n: 5 }
];
export const UPGRADABLE_TOOLS = ["hoe", "can", "axe", "pick"];
export const canCapacity = (level) => 40 + 15 * level;

/* ================= Compétences ================= */

export const SKILLS = {
  farm:   { name: "Agriculture", desc: "Qualité des récoltes, moins d'énergie pour la houe et l'arrosoir, nouvelles recettes." },
  forage: { name: "Foresterie",  desc: "Plus de bois, moins d'énergie pour la hache, cueillette de meilleure qualité." },
  mine:   { name: "Minage",      desc: "Plus de minerai, moins d'énergie pour la pioche, minerais plus rares dans la carrière." }
};
export const XP_LEVELS = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
export const levelOf = (xp) => { let l = 0; while (l < XP_LEVELS.length && xp >= XP_LEVELS[l]) l++; return l; };

// Recettes d'artisanat (débloquées par le niveau d'agriculture).
export const RECIPES = [
  { id: "epouvantail", lvl: 1, out: 1, cost: { bois: 30, fibre: 20 },             desc: "Protège les cultures des corbeaux dans un rayon de 8 cases." },
  { id: "engrais",     lvl: 1, out: 5, cost: { fibre: 5, pierre: 3 },             desc: "Améliore la qualité de la récolte (à mettre sur la terre avant la graine)." },
  { id: "arroseur",    lvl: 2, out: 1, cost: { cuivre: 2, fer: 1 },               desc: "Arrose chaque matin les 4 cases voisines." },
  { id: "bocal",       lvl: 3, out: 1, cost: { bois: 40, pierre: 25, cuivre: 2 }, desc: "Transforme une récolte en bocal ou confiture (2 nuits)." },
  { id: "accel",       lvl: 3, out: 5, cost: { fibre: 10, cuivre: 1 },            desc: "La culture pousse 25 % plus vite." },
  { id: "presse",      lvl: 4, out: 1, cost: { bois: 40, pierre: 40, fer: 2 },    desc: "Lait → fromage, œuf → mayonnaise (1 nuit)." },
  { id: "fut",         lvl: 5, out: 1, cost: { bois: 60, cuivre: 3, fer: 2 },     desc: "Fruit → vin, légume → jus (4 nuits)." },
  { id: "engraisplus", lvl: 6, out: 5, cost: { fibre: 10, fer: 1 },               desc: "Encore plus de chances de qualité or." },
  { id: "arroseur2",   lvl: 6, out: 1, cost: { fer: 3, or: 1 },                   desc: "Arrose chaque matin les 8 cases autour." },
  { id: "metier",      lvl: 7, out: 1, cost: { bois: 60, fibre: 40, or: 1 },      desc: "Laine → tissu (2 nuits)." },
  { id: "arroseur3",   lvl: 9, out: 1, cost: { fer: 5, or: 4 },                   desc: "Arrose chaque matin un carré de 5 × 5." }
];

// Machines : ce qu'elles acceptent et ce qu'elles produisent.
export function machineOutput(type, inputId) {
  const info = itemInfo(inputId);
  if (!info) return null;
  if (type === "jar" && (info.cat === "veg" || info.cat === "fruit")) return { out: `jam:${info.crop}`, nights: 2 };
  if (type === "keg" && (info.cat === "veg" || info.cat === "fruit")) return { out: `wine:${info.crop}`, nights: info.cat === "fruit" ? 4 : 3 };
  if (type === "press") {
    if (inputId === "lait") return { out: "fromage", nights: 1 };
    if (inputId === "laitchevre") return { out: "chevrotin", nights: 1 };
    if (inputId === "oeuf") return { out: "mayo", nights: 1 };
    if (inputId === "oeufcanard") return { out: "mayocanard", nights: 1 };
  }
  if (type === "loom" && inputId === "laine") return { out: "tissu", nights: 2 };
  return null;
}
export const MACHINES = ["jar", "keg", "press", "loom"];
export const SPRINKLER_RANGE = { sprinkler1: "plus", sprinkler2: "ring", sprinkler3: "big" };
export const SOLID_OBJECTS = new Set(["stone", "boulder", "tree", "stump", "ore_cu", "ore_fe", "ore_au", "scarecrow", "sprinkler1", "sprinkler2", "sprinkler3", "jar", "keg", "press", "loom", "weed", "branch"]);

/* ================= Succès (récompensés en pièces bleues de l'arcade) ================= */

export const ACHIEVEMENTS = [
  { id: "first",   name: "Premier légume",       blue: 1, desc: "Récolter une culture." },
  { id: "gold",    name: "Qualité or",           blue: 1, desc: "Récolter une culture de qualité or." },
  { id: "coop",    name: "Basse-cour",           blue: 2, desc: "Construire le poulailler." },
  { id: "barn",    name: "Éleveur",              blue: 2, desc: "Construire la grange." },
  { id: "gh",      name: "Sous verre",           blue: 4, desc: "Réparer la serre." },
  { id: "tools",   name: "Outils dorés",         blue: 3, desc: "Améliorer les 4 outils au niveau or." },
  { id: "rich",    name: "Magnat",               blue: 3, desc: "Expédier 100 000 or au total." },
  { id: "year2",   name: "Un an déjà",           blue: 3, desc: "Atteindre la deuxième année." },
  { id: "collect", name: "Collectionneur",       blue: 5, desc: "Expédier 30 objets différents." },
  { id: "streak",  name: "Voisin serviable",     blue: 2, desc: "Remplir 10 demandes du panneau." },
  { id: "master",  name: "Maître de la vallée",  blue: 5, desc: "Atteindre le niveau 10 en agriculture." }
];

/* ================= Hasard reproductible ================= */

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/* ================= Sauvegarde ================= */

export function freshRanch(seed = 1234) {
  const r = {
    v: 1,
    gold: START_GOLD,
    energy: MAX_ENERGY,
    time: DAY_START,
    day: 1, season: 0, year: 1,
    weather: "sun", tomorrow: "sun",
    px: 7.5, py: 7.5, face: 2,              // position (en cases) et direction : 0 haut, 1 droite, 2 bas, 3 gauche
    bag: 12,
    inv: Array(36).fill(null),             // { id, q, n }
    tools: { hoe: 0, can: 0, axe: 0, pick: 0 },
    water: canCapacity(0),
    xp: { farm: 0, forage: 0, mine: 0 },
    built: { coop: false, barn: false, greenhouse: false },
    animals: [],                           // { kind, name, mood, age, ready, petted, fedDays }
    hay: 0,
    soil: {},                              // index → { w: arrosée, f: engrais }
    crops: {},                             // index → { c, g: jours de pousse, h: récoltes, rg: jours depuis la dernière récolte, dead }
    obj: {},                               // index → { t, hp, item, left }
    bin: [],                               // expédition du jour : { id, q, n }
    request: null,                         // demande du panneau : { id, n, reward, done }
    stats: { shipped: 0, harvests: 0, days: 0, requests: 0, best: 0, ids: [] },
    ach: [],
    seed
  };
  const start = [["hoe"], ["can"], ["axe"], ["pick"], ["scythe"], ["seed:navet", 0, 15]];
  start.forEach(([id, q = 0, n = 1], i) => { r.inv[i] = { id, q, n }; });
  scatterInitial(r, mulberry(seed));
  r.request = newRequest(r, mulberry(seed + 7));
  return r;
}

function scatterInitial(r, rng) {
  const free = (x, y) => !r.obj[idx(x, y)];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = GROUND[idx(x, y)];
      const nearHouse = x >= 4 && x <= 16 && y >= 6 && y <= 12;   // un coin dégagé pour commencer
      if (inRect(x, y, FOREST) && t === G.GRASS) {
        const v = rng();
        if (v < 0.42) r.obj[idx(x, y)] = { t: "tree", hp: 8 };
        else if (v < 0.5) r.obj[idx(x, y)] = { t: "branch" };
        else if (v < 0.58) r.obj[idx(x, y)] = { t: "grass" };
        continue;
      }
      if (t === G.GRAVEL) {
        const v = rng();
        if (v < 0.12) r.obj[idx(x, y)] = { t: "boulder", hp: 6 };
        else if (v < 0.3) r.obj[idx(x, y)] = { t: "stone" };
        else if (v < 0.36) r.obj[idx(x, y)] = { t: "ore_cu", hp: 3 };
        continue;
      }
      if (t !== G.GRASS || nearHouse || !free(x, y)) continue;
      const v = rng();
      if (v < 0.13) r.obj[idx(x, y)] = { t: "weed" };
      else if (v < 0.2) r.obj[idx(x, y)] = { t: "stone" };
      else if (v < 0.25) r.obj[idx(x, y)] = { t: "branch" };
      else if (v < 0.27) r.obj[idx(x, y)] = { t: "stump", hp: 4 };
      else if (v < 0.29) r.obj[idx(x, y)] = { t: "tree", hp: 8 };
      else if (v < 0.35) r.obj[idx(x, y)] = { t: "grass" };
    }
  }
}

const OBJ_TYPES = new Set(["weed", "stone", "branch", "stump", "tree", "boulder", "ore_cu", "ore_fe", "ore_au", "grass", "forage",
  "scarecrow", "sprinkler1", "sprinkler2", "sprinkler3", "jar", "keg", "press", "loom"]);
const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const int = (v, lo, hi, def) => Math.floor(num(v, lo, hi, def));

// Reprend une sauvegarde en vérifiant chaque champ (le contenu du navigateur n'est pas fiable).
export function sanitizeRanch(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== 1) return freshRanch(Math.floor(Math.random() * 1e9));
  const r = freshRanch(int(raw.seed, 0, 2 ** 31, 1234));
  r.obj = {};
  r.gold = int(raw.gold, 0, 1e15, START_GOLD);
  r.energy = num(raw.energy, -20, MAX_ENERGY, MAX_ENERGY);
  r.time = int(raw.time, DAY_START, DAY_END, DAY_START);
  r.day = int(raw.day, 1, DAYS_PER_SEASON, 1);
  r.season = int(raw.season, 0, 3, 0);
  r.year = int(raw.year, 1, 999, 1);
  r.weather = WEATHER[raw.weather] ? raw.weather : "sun";
  r.tomorrow = WEATHER[raw.tomorrow] ? raw.tomorrow : "sun";
  r.px = num(raw.px, 1, MAP_W - 1, 7.5);
  r.py = num(raw.py, 1, MAP_H - 1, 7.5);
  r.face = int(raw.face, 0, 3, 2);
  r.bag = BAG_SIZES.includes(raw.bag) ? raw.bag : 12;
  if (Array.isArray(raw.inv)) {
    r.inv = Array(36).fill(null);
    raw.inv.slice(0, 36).forEach((s, i) => {
      if (s && itemInfo(s.id)) r.inv[i] = { id: s.id, q: hasQuality(s.id) ? int(s.q, 0, 3, 0) : 0, n: isTool(s.id) ? 1 : int(s.n, 1, 999, 1) };
    });
  }
  // Les 5 outils de base ne doivent jamais disparaître.
  for (const t of ["hoe", "can", "axe", "pick", "scythe"]) {
    if (r.inv.some((s) => s?.id === t)) continue;
    const free = r.inv.findIndex((s, i) => !s && i < r.bag);
    if (free >= 0) r.inv[free] = { id: t, q: 0, n: 1 };
  }
  for (const t of UPGRADABLE_TOOLS) r.tools[t] = int(raw.tools?.[t], 0, 3, 0);
  r.water = int(raw.water, 0, canCapacity(r.tools.can), canCapacity(r.tools.can));
  for (const k of Object.keys(r.xp)) r.xp[k] = int(raw.xp?.[k], 0, 1e9, 0);
  for (const k of Object.keys(r.built)) r.built[k] = !!raw.built?.[k];
  r.animals = [];
  if (Array.isArray(raw.animals)) {
    for (const a of raw.animals.slice(0, 12)) {
      const kind = animalById(a?.kind);
      if (!kind || !r.built[kind.home]) continue;
      if (r.animals.filter((x) => animalById(x.kind).home === kind.home).length >= HOUSE_CAP[kind.home]) continue;
      r.animals.push({ kind: kind.id, name: String(a.name ?? kind.name).slice(0, 20), mood: int(a.mood, 0, 255, 150),
        age: int(a.age, 0, 9999, 0), ready: !!a.ready, petted: !!a.petted, wait: int(a.wait, 0, 9, 0) });
    }
  }
  r.hay = int(raw.hay, 0, HAY_CAP, 0);
  const each = (o, fn) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { const i = int(k, 0, MAP_W * MAP_H - 1, -1); if (String(i) === k && v && typeof v === "object") fn(i, v); } };
  r.soil = {};
  each(raw.soil, (i, s) => { const x = i % MAP_W, y = Math.floor(i / MAP_W); if (tillable(r, x, y)) r.soil[i] = { w: s.w ? 1 : 0, f: ["q1", "q2", "speed"].includes(s.f) ? s.f : null }; });
  r.crops = {};
  each(raw.crops, (i, c) => { const crop = cropById(c.c); if (crop && r.soil[i]) r.crops[i] = { c: crop.id, g: int(c.g, 0, 99, 0), h: int(c.h, 0, 999, 0), rg: int(c.rg, 0, 99, 0), dead: !!c.dead }; });
  each(raw.obj, (i, o) => {
    if (!OBJ_TYPES.has(o.t) || r.soil[i]) return;
    const x = i % MAP_W, y = Math.floor(i / MAP_W);
    const t = groundAt(x, y);
    if (t === G.WALL || t === G.WATER || t === G.BUILD || t === G.FENCE || t === G.GHWALL || t === G.GHDOOR) return;
    const ob = { t: o.t };
    if (o.hp !== undefined) ob.hp = int(o.hp, 1, 20, 1);
    if (o.t === "forage") { if (!FORAGE.some((f) => f.id === o.item)) return; ob.item = o.item; }
    if (MACHINES.includes(o.t) && o.item && itemInfo(o.item)) { ob.item = o.item; ob.left = int(o.left, 0, 9, 0); ob.q = int(o.q, 0, 3, 0); }
    r.obj[i] = ob;
  });
  r.bin = [];
  if (Array.isArray(raw.bin)) for (const s of raw.bin.slice(0, 200)) if (s && itemInfo(s.id) && !isTool(s.id) && sellPrice(s.id) > 0) r.bin.push({ id: s.id, q: int(s.q, 0, 3, 0), n: int(s.n, 1, 9999, 1) });
  const rq = raw.request;
  r.request = rq && itemInfo(rq.id) ? { id: rq.id, n: int(rq.n, 1, 999, 1), reward: int(rq.reward, 0, 1e9, 0), done: !!rq.done } : r.request;
  for (const k of ["shipped", "harvests", "days", "requests", "best"]) r.stats[k] = int(raw.stats?.[k], 0, 1e15, 0);
  r.stats.ids = Array.isArray(raw.stats?.ids) ? raw.stats.ids.filter((id) => itemInfo(id)).slice(0, 300) : [];
  r.ach = Array.isArray(raw.ach) ? raw.ach.filter((id) => ACHIEVEMENTS.some((a) => a.id === id)) : [];
  // Le joueur ne doit jamais se retrouver coincé dans un mur.
  if (isSolid(r, Math.floor(r.px), Math.floor(r.py))) { r.px = 7.5; r.py = 7.5; }
  return r;
}

/* ================= Collisions ================= */

export function isSolid(r, x, y) {
  const t = groundAt(x, y);
  if (t === G.WALL || t === G.WATER || t === G.BUILD || t === G.FENCE || t === G.GHWALL) return true;
  if (t === G.GHDOOR) return !r.built.greenhouse;
  const o = r.obj[idx(x, y)];
  return !!o && SOLID_OBJECTS.has(o.t);
}

/* ================= Sac ================= */

export function addItem(r, id, q = 0, n = 1) {
  if (!itemInfo(id) || n <= 0) return n;
  q = hasQuality(id) ? q : 0;
  let left = n;
  if (!isTool(id)) {
    for (let i = 0; i < r.bag && left > 0; i++) {
      const s = r.inv[i];
      if (s && s.id === id && s.q === q && s.n < 999) { const k = Math.min(999 - s.n, left); s.n += k; left -= k; }
    }
  }
  for (let i = 0; i < r.bag && left > 0; i++) {
    if (!r.inv[i]) { const k = isTool(id) ? 1 : Math.min(999, left); r.inv[i] = { id, q, n: k }; left -= k; }
  }
  return left;   // ce qui n'a pas pu rentrer
}

export const countItem = (r, id) => r.inv.slice(0, r.bag).reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
export const canFit = (r, id, q = 0) => r.inv.slice(0, r.bag).some((s) => !s || (!isTool(id) && s.id === id && s.q === (hasQuality(id) ? q : 0) && s.n < 999));

// Retire n exemplaires (de n'importe quelle qualité, la plus basse d'abord). Renvoie false si pas assez.
export function removeItem(r, id, n = 1) {
  if (countItem(r, id) < n) return false;
  let left = n;
  const slots = r.inv.map((s, i) => [s, i]).filter(([s, i]) => s && s.id === id && i < r.bag).sort((a, b) => a[0].q - b[0].q);
  for (const [s, i] of slots) {
    const k = Math.min(s.n, left);
    s.n -= k; left -= k;
    if (s.n <= 0) r.inv[i] = null;
    if (!left) break;
  }
  return true;
}

export function takeFromSlot(r, slot, n = 1) {
  const s = r.inv[slot];
  if (!s || s.n < n) return null;
  s.n -= n;
  const taken = { id: s.id, q: s.q, n };
  if (s.n <= 0) r.inv[slot] = null;
  return taken;
}

/* ================= Temps, saisons ================= */

export const clockText = (t) => {
  const h = Math.floor(t / 60) % 24;
  const m = Math.floor(t % 60 / 10) * 10;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
export const dateText = (r) => `${SEASONS[r.season]} ${r.day} · An ${r.year}`;
export const cropInSeason = (crop, season) => crop.seasons.includes(season);
export const shopOpen = (r) => r.time >= SHOP_OPEN && r.time < SHOP_CLOSE;

/* ================= Cultures ================= */

export function cropDays(crop, soil) {
  return soil?.f === "speed" ? Math.max(1, Math.ceil(crop.days * 0.75)) : crop.days;
}

// État d'une culture : stade 0 (graine) à 4 (prête), ou dead.
export function cropStage(r, i) {
  const c = r.crops[i];
  if (!c) return null;
  const crop = cropById(c.c);
  if (c.dead) return { crop, dead: true, stage: 0, ready: false };
  if (c.h > 0) {
    const ready = c.rg >= crop.regrow;
    return { crop, stage: ready ? 4 : 3, ready, regrowing: !ready, left: Math.max(0, crop.regrow - c.rg) };
  }
  const total = cropDays(crop, r.soil[i]);
  const ready = c.g >= total;
  const stage = ready ? 4 : c.g === 0 ? 0 : Math.min(3, 1 + Math.floor((c.g / total) * 3));
  return { crop, stage, ready, left: Math.max(0, total - c.g) };
}

export function rollQuality(rng, farmLvl, fert) {
  const f = fert === "q2" ? 2 : fert === "q1" ? 1 : 0;
  const gold = 0.2 * (farmLvl / 10) + 0.2 * f * ((farmLvl + 2) / 12) + 0.01;
  const silver = Math.min(0.75, gold * 2);
  const roll = rng();
  if (f === 2 && roll < gold / 3) return 3;
  if (roll < gold) return 2;
  if (roll < silver) return 1;
  return 0;
}

/* ================= Actions ================= */

const FRONT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const frontTile = (r) => ({ x: Math.floor(r.px) + FRONT[r.face][0], y: Math.floor(r.py) + FRONT[r.face][1] });

// Cases touchées par la houe ou l'arrosoir selon la puissance (0 à 3) : 1 case, ligne de 3, ligne de 5, carré de 3 × 3.
export function toolArea(x, y, face, power) {
  const [dx, dy] = FRONT[face];
  if (power <= 0) return [{ x, y }];
  if (power === 1 || power === 2) {
    const len = power === 1 ? 3 : 5;
    return Array.from({ length: len }, (_, k) => ({ x: x + dx * k, y: y + dy * k }));
  }
  const cx = x + dx, cy = y + dy;
  const out = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) out.push({ x: cx + i, y: cy + j });
  return out;
}

export const skillLevel = (r, s) => levelOf(r.xp[s] ?? 0);
const energyCost = (r, skill, power = 0) => (power + 1) * Math.max(0.6, 2 - 0.14 * skillLevel(r, skill));

// Ajoute de l'XP ; renvoie le nouveau niveau s'il a augmenté.
export function gainXp(r, skill, amount) {
  const before = skillLevel(r, skill);
  r.xp[skill] = (r.xp[skill] ?? 0) + Math.round(amount);
  const after = skillLevel(r, skill);
  return after > before ? after : 0;
}

// Résultat commun des actions : messages, objets gagnés (pour les petits textes flottants) et niveaux gagnés.
const result = () => ({ ok: false, msg: "", gains: [], levels: [], fx: [], open: null });
function give(r, res, id, n, q = 0) {
  const left = addItem(r, id, q, n);
  if (n - left > 0) res.gains.push({ id, n: n - left, q });
  if (left > 0) res.msg = "Ton sac est plein !";
  return left === 0;
}
function xp(r, res, skill, amount) {
  const lvl = gainXp(r, skill, amount);
  if (lvl) res.levels.push({ skill, lvl });
}
function spend(r, res, amount) {
  if (r.energy <= 0) { res.msg = "Tu es épuisé… va dormir."; return false; }
  r.energy = Math.max(-20, r.energy - amount);
  return true;
}

// Récolte de la case i. Renvoie le résultat.
export function harvest(r, i, rng = Math.random, res = result()) {
  const st = cropStage(r, i);
  if (!st || !st.ready) return res;
  const crop = st.crop;
  const c = r.crops[i];
  const q = rollQuality(rng, skillLevel(r, "farm"), r.soil[i]?.f);
  let n = crop.yield ?? 1;
  if (crop.extra && rng() < crop.extra) n += 1;
  if (!canFit(r, crop.id, q)) { res.msg = "Ton sac est plein !"; return res; }
  give(r, res, crop.id, 1, q);
  if (n > 1) give(r, res, crop.id, n - 1, 0);
  xp(r, res, "farm", Math.max(3, crop.sell / 8));
  r.stats.harvests += 1;
  unlock(r, res, "first");
  if (q >= 2) unlock(r, res, "gold");
  if (crop.regrow) { c.h += 1; c.rg = 0; }
  else delete r.crops[i];
  res.ok = true;
  res.fx.push({ x: i % MAP_W, y: Math.floor(i / MAP_W), kind: "harvest", color: crop.color });
  return res;
}

function unlock(r, res, id) {
  if (r.ach.includes(id)) return;
  r.ach.push(id);
  res.ach = res.ach || [];
  res.ach.push(id);
}

// Utilise l'objet du slot sélectionné sur la case (x, y). `power` sert à la houe et à l'arrosoir.
export function useSlot(r, slot, x, y, power = 0, rng = Math.random) {
  const res = result();
  const s = r.inv[slot];
  if (!s) return res;
  const info = itemInfo(s.id);
  const i = idx(x, y);
  const o = r.obj[i];

  if (s.id === "hoe") {
    const lvl = Math.min(power, r.tools.hoe);
    if (!spend(r, res, energyCost(r, "farm", lvl))) return res;
    let done = 0;
    for (const p of toolArea(x, y, r.face, lvl)) {
      const k = idx(p.x, p.y);
      if (!inMap(p.x, p.y) || r.obj[k] || r.soil[k] || !tillable(r, p.x, p.y)) continue;
      r.soil[k] = { w: r.weather === "rain" || r.weather === "storm" ? (inGreenhouse(p.x, p.y) ? 0 : 1) : 0, f: null };
      done += 1;
      res.fx.push({ x: p.x, y: p.y, kind: "dirt" });
    }
    res.ok = true;
    if (!done) res.msg = o ? "Il faut d'abord dégager cette case." : r.soil[i] ? "" : "On ne peut pas labourer ici.";
    return res;
  }

  if (s.id === "can") {
    const t = groundAt(x, y);
    const b = buildingAt(x, y);
    if (t === G.WATER || b?.id === "well") {
      r.water = canCapacity(r.tools.can);
      res.ok = true; res.msg = "Arrosoir rempli."; res.fx.push({ x, y, kind: "splash" });
      return res;
    }
    if (r.water <= 0) { res.msg = "L'arrosoir est vide : remplis-le au puits ou à l'étang."; return res; }
    const lvl = Math.min(power, r.tools.can);
    if (!spend(r, res, energyCost(r, "farm", lvl))) return res;
    for (const p of toolArea(x, y, r.face, lvl)) {
      const k = idx(p.x, p.y);
      if (!r.soil[k] || r.water <= 0) continue;
      r.soil[k].w = 1;
      r.water -= 1;
      res.fx.push({ x: p.x, y: p.y, kind: "water" });
    }
    res.ok = true;
    return res;
  }

  if (s.id === "axe") {
    if (!o) return res;
    const dmg = 1 + r.tools.axe;
    if (o.t === "tree" || o.t === "stump") {
      if (!spend(r, res, energyCost(r, "forage"))) return res;
      o.hp -= dmg;
      res.ok = true; res.fx.push({ x, y, kind: "chip", color: "#c89a5a" });
      if (o.hp <= 0) {
        if (o.t === "tree") { r.obj[i] = { t: "stump", hp: 4 }; give(r, res, "bois", randInt(rng, 9, 13) + (skillLevel(r, "forage") >= 4 ? 3 : 0)); xp(r, res, "forage", 12); res.fx.push({ x, y, kind: "fall" }); }
        else { delete r.obj[i]; give(r, res, "bois", randInt(rng, 3, 5)); xp(r, res, "forage", 5); }
      }
      return res;
    }
    if (o.t === "branch") {
      if (!spend(r, res, energyCost(r, "forage"))) return res;
      delete r.obj[i]; give(r, res, "bois", randInt(rng, 1, 2) + (skillLevel(r, "forage") >= 4 ? 1 : 0)); xp(r, res, "forage", 1);
      res.ok = true; return res;
    }
    if (o.t === "weed") { delete r.obj[i]; give(r, res, "fibre", 1); res.ok = true; return res; }
    return pickUp(r, i, o, res);
  }

  if (s.id === "pick") {
    if (o) {
      const dmg = 1 + r.tools.pick;
      const ml = skillLevel(r, "mine");
      if (o.t === "stone") {
        if (!spend(r, res, energyCost(r, "mine"))) return res;
        delete r.obj[i]; give(r, res, "pierre", randInt(rng, 1, 2));
        if (rng() < 0.04 + 0.01 * ml) give(r, res, "cuivre", 1);
        xp(r, res, "mine", 1); res.ok = true; res.fx.push({ x, y, kind: "chip", color: "#aab" });
        return res;
      }
      if (o.t === "boulder" || o.t.startsWith("ore_")) {
        if (!spend(r, res, energyCost(r, "mine"))) return res;
        o.hp -= dmg;
        res.ok = true; res.fx.push({ x, y, kind: "chip", color: o.t === "ore_au" ? "#ffd23a" : o.t === "ore_fe" ? "#dde" : o.t === "ore_cu" ? "#e0864a" : "#aab" });
        if (o.hp <= 0) {
          delete r.obj[i];
          const bonus = ml >= 5 ? 1 : 0;
          if (o.t === "boulder") { give(r, res, "pierre", randInt(rng, 8, 12)); if (rng() < 0.35) give(r, res, "cuivre", randInt(rng, 1, 2)); xp(r, res, "mine", 10); }
          else {
            const ore = { ore_cu: "cuivre", ore_fe: "fer", ore_au: "or" }[o.t];
            give(r, res, ore, randInt(rng, 1, 3) + bonus); give(r, res, "pierre", 1);
            xp(r, res, "mine", { ore_cu: 5, ore_fe: 9, ore_au: 14 }[o.t]);
          }
        }
        return res;
      }
      return pickUp(r, i, o, res);
    }
    if (r.soil[i] && !r.crops[i]) { delete r.soil[i]; res.ok = true; return res; }
    return res;
  }

  if (s.id === "scythe") {
    const [dx, dy] = FRONT[r.face];
    const cells = [{ x, y }, { x: x + dy, y: y + dx }, { x: x - dy, y: y - dx }];
    for (const p of cells) {
      const k = idx(p.x, p.y);
      const ob = r.obj[k];
      if (ob?.t === "weed") { delete r.obj[k]; give(r, res, "fibre", 1); if (rng() < 0.015) give(r, res, "seed:neonfleur", 1); res.ok = true; res.fx.push({ x: p.x, y: p.y, kind: "leaf" }); }
      else if (ob?.t === "grass") {
        delete r.obj[k];
        if ((r.built.coop || r.built.barn) && r.hay < HAY_CAP && rng() < 0.6) { r.hay += 1; res.gains.push({ id: "foin", n: 1 }); }
        else if (rng() < 0.3) give(r, res, "fibre", 1);
        res.ok = true; res.fx.push({ x: p.x, y: p.y, kind: "leaf" });
      } else if (r.crops[k]?.dead) { delete r.crops[k]; res.ok = true; }
      else if (cropStage(r, k)?.ready) harvest(r, k, rng, res);
    }
    res.ok = true;
    return res;
  }

  if (info.cat === "seed") {
    const crop = cropById(info.crop);
    if (!r.soil[i]) { res.msg = "Il faut planter sur de la terre labourée."; return res; }
    if (r.crops[i]) return res;
    if (!inGreenhouse(x, y) && !cropInSeason(crop, r.season)) { res.msg = `${crop.name} : hors saison (${crop.seasons.map((k) => SEASONS[k]).join(", ")}).`; return res; }
    takeFromSlot(r, slot);
    r.crops[i] = { c: crop.id, g: 0, h: 0, rg: 0, dead: false };
    res.ok = true; res.fx.push({ x, y, kind: "seed" });
    return res;
  }

  if (info.cat === "fert") {
    if (!r.soil[i]) { res.msg = "L'engrais se met sur la terre labourée."; return res; }
    if (r.soil[i].f) { res.msg = "Il y a déjà de l'engrais ici."; return res; }
    if (r.crops[i] && r.crops[i].g > 0) { res.msg = "Trop tard : mets l'engrais avant que la graine pousse."; return res; }
    takeFromSlot(r, slot);
    r.soil[i].f = info.fert;
    res.ok = true; res.fx.push({ x, y, kind: "fert" });
    return res;
  }

  if (info.cat === "place") {
    const t = groundAt(x, y);
    if (o || r.soil[i] || ![G.GRASS, G.PATH, G.SAND, G.GH, G.PEN, G.GRAVEL].includes(t)) { res.msg = "On ne peut pas poser ça ici."; return res; }
    if (Math.floor(r.px) === x && Math.floor(r.py) === y) return res;
    takeFromSlot(r, slot);
    r.obj[i] = { t: info.place };
    res.ok = true; res.msg = `${info.name} posé. (Pioche ou hache pour le reprendre.)`;
    return res;
  }

  return res;
}

function pickUp(r, i, o, res) {
  const back = { scarecrow: "epouvantail", sprinkler1: "arroseur", sprinkler2: "arroseur2", sprinkler3: "arroseur3", jar: "bocal", keg: "fut", press: "presse", loom: "metier" }[o.t];
  if (!back) return res;
  if (o.item) { res.msg = "La machine travaille : récupère d'abord ce qu'il y a dedans."; return res; }
  if (!give(r, res, back, 1)) return res;
  delete r.obj[i];
  res.ok = true;
  return res;
}

// Action principale sur une case : bâtiments, récolte, machines, cueillette ; sinon l'objet tenu.
export function interact(r, slot, x, y, power = 0, rng = Math.random) {
  const res = result();
  const b = buildingAt(x, y);
  if (b) {
    res.ok = true;
    res.building = b.id;
    if (b.id === "house") res.open = "sleep";
    else if (b.id === "bin") {
      const s = r.inv[slot];
      if (s && !isTool(s.id) && sellPrice(s.id, s.q) > 0) { shipSlot(r, slot); res.msg = `Expédié : ${s.n} × ${itemInfo(s.id).name}. Payé cette nuit.`; res.fx.push({ x, y, kind: "ship" }); }
      else res.open = "ship";
    } else if (b.id === "board") res.open = "board";
    else if (b.id === "shop") res.open = "shop";
    else if (b.id === "well") {
      if (r.inv[slot]?.id === "can") return useSlot(r, slot, x, y, power, rng);
      res.msg = "Le puits : prends l'arrosoir pour le remplir.";
    }
    else if (b.id === "coop" || b.id === "barn") res.open = r.built[b.id] ? "animals" : "build";
    return res;
  }
  if ((groundAt(x, y) === G.GHDOOR || groundAt(x, y) === G.GHWALL) && !r.built.greenhouse) { res.ok = true; res.open = "build"; res.building = "greenhouse"; return res; }

  const i = idx(x, y);
  const o = r.obj[i];
  if (cropStage(r, i)?.ready) return harvest(r, i, rng, res);
  if (o?.t === "forage") {
    const f = FORAGE.find((k) => k.id === o.item);
    const fl = skillLevel(r, "forage");
    const q = rng() < 0.05 * fl ? (rng() < 0.3 ? 2 : 1) : 0;
    if (give(r, res, f.id, 1, q)) { delete r.obj[i]; xp(r, res, "forage", 7); res.ok = true; }
    return res;
  }
  if (o && MACHINES.includes(o.t)) {
    res.ok = true;
    if (o.item && o.left <= 0) {
      if (give(r, res, o.item, 1, o.q || 0)) { delete o.item; delete o.left; delete o.q; xp(r, res, "farm", 6); }
      return res;
    }
    if (o.item) { res.msg = `${itemInfo(o.item).name} : prêt dans ${o.left} nuit${o.left > 1 ? "s" : ""}.`; return res; }
    const s = r.inv[slot];
    const out = s && machineOutput(o.t, s.id);
    if (!out) { res.msg = { jar: "Bocal : mets-y un fruit ou un légume.", keg: "Fût : mets-y un fruit ou un légume.", press: "Presse : mets-y du lait ou un œuf.", loom: "Métier à tisser : mets-y de la laine." }[o.t]; return res; }
    const q = o.t === "press" || o.t === "loom" ? s.q : 0;
    takeFromSlot(r, slot);
    o.item = out.out; o.left = out.nights; o.q = q;
    res.msg = `${itemInfo(out.out).name} prêt dans ${out.nights} nuit${out.nights > 1 ? "s" : ""}.`;
    return res;
  }
  return useSlot(r, slot, x, y, power, rng);
}

// L'objet tenu se charge-t-il quand on maintient l'action ? (houe et arrosoir améliorés)
export const chargeable = (r, slot) => { const id = r.inv[slot]?.id; return (id === "hoe" || id === "can") && r.tools[id] > 0; };

export function eatSlot(r, slot) {
  const s = r.inv[slot];
  const e = s ? itemEnergy(s.id, s.q) : 0;
  if (!e) return 0;
  takeFromSlot(r, slot);
  const before = r.energy;
  r.energy = Math.min(MAX_ENERGY, r.energy + e);
  return Math.round(r.energy - before);
}

/* ================= Expédition ================= */

export function shipSlot(r, slot, n) {
  const s = r.inv[slot];
  if (!s || isTool(s.id) || sellPrice(s.id, s.q) <= 0) return false;
  const k = Math.min(n ?? s.n, s.n);
  takeFromSlot(r, slot, k);
  const same = r.bin.find((b) => b.id === s.id && b.q === s.q);
  if (same) same.n += k; else r.bin.push({ id: s.id, q: s.q, n: k });
  return true;
}
export function unshipLast(r) {
  const last = r.bin[r.bin.length - 1];
  if (!last || !canFit(r, last.id, last.q)) return false;
  const left = addItem(r, last.id, last.q, last.n);
  if (left) last.n = left; else r.bin.pop();
  return true;
}
export const binValue = (r) => r.bin.reduce((a, s) => a + sellPrice(s.id, s.q) * s.n, 0);

/* ================= Boutique ================= */

// Articles en vente selon la saison et ce que le joueur possède. `currency` : "gold" ou "blue" (pièces de l'arcade).
export function shopItems(r) {
  const list = [];
  for (const c of CROPS) {
    if (c.special) continue;
    if (cropInSeason(c, r.season) || r.built.greenhouse) list.push({ tab: "seeds", key: `seed:${c.id}`, item: `seed:${c.id}`, price: c.seed, currency: "gold", offSeason: !cropInSeason(c, r.season) });
  }
  list.push({ tab: "seeds", key: "seed:ancien", item: "seed:ancien", price: ANCIENT_SEED_BLUE, currency: "blue" });
  list.push({ tab: "supplies", key: "engrais", item: "engrais", price: 100, currency: "gold", n: 5 });
  list.push({ tab: "supplies", key: "accel", item: "accel", price: 200, currency: "gold", n: 5 });
  if (r.built.coop || r.built.barn) list.push({ tab: "supplies", key: "hay", label: "Foin ×10 (silo)", price: 500, currency: "gold", hay: 10 });
  list.push({ tab: "supplies", key: "bois", item: "bois", price: 100, currency: "gold", n: 10 });
  list.push({ tab: "supplies", key: "pierre", item: "pierre", price: 100, currency: "gold", n: 10 });
  for (const t of UPGRADABLE_TOOLS) {
    const lvl = r.tools[t];
    const up = TOOL_UPGRADES[lvl];
    if (up) list.push({ tab: "tools", key: `tool:${t}`, label: `${itemInfo(t).name} ${TOOL_TIERS[lvl + 1]}`, price: up.gold, currency: "gold", cost: { [up.ore]: up.n }, tool: t });
  }
  const bagNext = BAG_SIZES[BAG_SIZES.indexOf(r.bag) + 1];
  if (bagNext) list.push({ tab: "tools", key: "bag", label: `Sac de ${bagNext} places`, price: bagNext === 24 ? 2000 : 10000, currency: "gold", bag: bagNext });
  if (!r.built.coop) list.push({ tab: "build", key: "b:coop", label: "Construire le poulailler", price: 4000, currency: "gold", cost: { bois: 150, pierre: 100 }, build: "coop" });
  if (!r.built.barn) list.push({ tab: "build", key: "b:barn", label: "Construire la grange", price: 6000, currency: "gold", cost: { bois: 300, pierre: 150 }, build: "barn" });
  if (!r.built.greenhouse) list.push({ tab: "build", key: "b:gh", label: "Réparer la serre", price: 20000, currency: "gold", cost: { bois: 200, pierre: 150, or: 5 }, build: "greenhouse" });
  for (const a of ANIMALS) {
    const count = r.animals.filter((x) => animalById(x.kind).home === a.home).length;
    list.push({ tab: "animals", key: `a:${a.id}`, label: a.name, price: a.price, currency: "gold", animal: a.id, locked: !r.built[a.home], full: count >= HOUSE_CAP[a.home] });
  }
  return list;
}

const ANIMAL_NAMES = ["Biscotte", "Pixel", "Noisette", "Octet", "Praline", "Bug", "Cookie", "Neon", "Patate", "Turbo", "Glitch", "Caramel", "Byte", "Plume", "Fusée"];

// Achat. `blueBalance` et `spendBlue` servent à l'achat en pièces bleues. Renvoie { ok, msg }.
export function buy(r, entry, { blueBalance = 0, spendBlue = () => false, rng = Math.random } = {}) {
  if (entry.locked) return { ok: false, msg: "Construis d'abord le bâtiment." };
  if (entry.full) return { ok: false, msg: "Le bâtiment est plein." };
  if (entry.currency === "blue") {
    if (blueBalance < entry.price) return { ok: false, msg: "Pas assez de pièces bleues." };
  } else if (r.gold < entry.price) return { ok: false, msg: "Pas assez d'or." };
  for (const [id, n] of Object.entries(entry.cost ?? {})) if (countItem(r, id) < n) return { ok: false, msg: `Il manque : ${n} × ${itemInfo(id).name}.` };
  if (entry.item && !canFit(r, entry.item)) return { ok: false, msg: "Ton sac est plein." };
  if (entry.hay && r.hay >= HAY_CAP) return { ok: false, msg: "Le silo est plein." };

  if (entry.currency === "blue") { if (!spendBlue(entry.price)) return { ok: false, msg: "Pas assez de pièces bleues." }; }
  else r.gold -= entry.price;
  for (const [id, n] of Object.entries(entry.cost ?? {})) removeItem(r, id, n);

  if (entry.item) addItem(r, entry.item, 0, entry.n ?? 1);
  if (entry.hay) r.hay = Math.min(HAY_CAP, r.hay + entry.hay);
  if (entry.tool) {
    r.tools[entry.tool] += 1;
    if (entry.tool === "can") r.water = canCapacity(r.tools.can);
  }
  if (entry.bag) r.bag = entry.bag;
  const res = result();
  if (entry.build) { r.built[entry.build] = true; unlock(r, res, entry.build === "greenhouse" ? "gh" : entry.build); }
  if (UPGRADABLE_TOOLS.every((t) => r.tools[t] >= 3)) unlock(r, res, "tools");
  if (entry.animal) {
    const a = animalById(entry.animal);
    const used = new Set(r.animals.map((x) => x.name));
    const name = ANIMAL_NAMES.find((n) => !used.has(n)) ?? a.name;
    r.animals.push({ kind: a.id, name, mood: 150, age: 0, ready: false, petted: false, wait: 0 });
  }
  return { ok: true, msg: "Acheté !", ach: res.ach };
}

/* ================= Artisanat ================= */

export const recipeUnlocked = (r, rec) => skillLevel(r, "farm") >= rec.lvl;
export function canCraft(r, rec) {
  return recipeUnlocked(r, rec) && Object.entries(rec.cost).every(([id, n]) => countItem(r, id) >= n) && canFit(r, rec.id);
}
export function craft(r, rec) {
  if (!canCraft(r, rec)) return false;
  for (const [id, n] of Object.entries(rec.cost)) removeItem(r, id, n);
  addItem(r, rec.id, 0, rec.out);
  return true;
}

/* ================= Animaux ================= */

export function petAnimal(r, k, rng = Math.random) {
  const a = r.animals[k];
  const res = result();
  if (!a) return res;
  const kind = animalById(a.kind);
  res.ok = true;
  if (!a.petted) { a.petted = true; a.mood = Math.min(255, a.mood + 30); xp(r, res, "farm", 5); }
  if (a.ready) {
    const q = a.mood > 220 ? (rng() < 0.4 ? 2 : 1) : a.mood > 160 ? (rng() < 0.4 ? 1 : 0) : 0;
    if (give(r, res, kind.product, 1, q)) { a.ready = false; xp(r, res, "farm", 5); }
  } else if (!res.gains.length) res.msg = `${a.name} (${kind.name}) a l'air ${a.mood > 200 ? "très heureuse" : a.mood > 120 ? "contente" : "un peu triste"}.`;
  return res;
}

/* ================= Demandes du panneau ================= */

export function newRequest(r, rng) {
  const options = [];
  for (const c of CROPS) if (!c.special && (cropInSeason(c, r.season) || r.built.greenhouse)) options.push({ id: c.id, n: Math.max(1, Math.round(600 / c.sell)) });
  options.push({ id: "bois", n: randInt(rng, 40, 90) }, { id: "pierre", n: randInt(rng, 40, 90) }, { id: "fibre", n: randInt(rng, 20, 50) });
  if (skillLevel(r, "mine") >= 1) options.push({ id: "cuivre", n: randInt(rng, 5, 12) });
  if (r.animals.some((a) => a.kind === "poule")) options.push({ id: "oeuf", n: randInt(rng, 3, 8) });
  if (r.animals.some((a) => a.kind === "vache")) options.push({ id: "lait", n: randInt(rng, 2, 5) });
  for (const f of FORAGE) if (f.season === r.season && !f.rare) options.push({ id: f.id, n: randInt(rng, 2, 4) });
  const o = pick(rng, options);
  const n = Math.min(o.n, 40);
  return { id: o.id, n, reward: Math.max(150, Math.round(sellPrice(o.id) * n * 2.5)), done: false };
}

export function deliverRequest(r) {
  const rq = r.request;
  if (!rq || rq.done) return { ok: false };
  if (!removeItem(r, rq.id, rq.n)) return { ok: false, msg: `Il te faut ${rq.n} × ${itemInfo(rq.id).name} (tu en as ${countItem(r, rq.id)}).` };
  rq.done = true;
  r.gold += rq.reward;
  r.stats.requests += 1;
  const res = result();
  if (r.stats.requests >= 10) unlock(r, res, "streak");
  return { ok: true, msg: `Demande remplie : +${rq.reward} or.`, ach: res.ach };
}

/* ================= La nuit ================= */

function rollWeather(season, rng) {
  const v = rng();
  if (season === 3) return v < 0.35 ? "snow" : "sun";
  const rain = [0.3, 0.15, 0.3][season];
  const storm = [0.05, 0.12, 0.03][season];
  return v < storm ? "storm" : v < storm + rain ? "rain" : "sun";
}

function sprinklerCells(type, x, y) {
  const out = [];
  const kind = SPRINKLER_RANGE[type];
  const rad = kind === "big" ? 2 : 1;
  for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    if (!i && !j) continue;
    if (kind === "plus" && i && j) continue;
    out.push({ x: x + i, y: y + j });
  }
  return out;
}

// Cases vides où peut apparaître un débris.
function randomFreeTile(r, rng, test, tries = 40) {
  for (let k = 0; k < tries; k++) {
    const x = randInt(rng, 1, MAP_W - 2);
    const y = randInt(rng, 1, MAP_H - 2);
    const i = idx(x, y);
    if (r.obj[i] || r.soil[i] || !test(x, y)) continue;
    if (Math.abs(x + 0.5 - r.px) < 1.5 && Math.abs(y + 0.5 - r.py) < 1.5) continue;
    if (x >= 6 && x <= 9 && y >= 6 && y <= 8) continue;   // devant la porte
    return { x, y, i };
  }
  return null;
}

// Passe au jour suivant. Renvoie un rapport pour l'écran de fin de journée.
// `balance` : crédits de l'arcade (pour la récompense proportionnelle). `passedOut` : tombé de fatigue à 2 h.
export function sleep(r, { rng = Math.random, passedOut = false, balance = 0 } = {}) {
  const rep = { shipped: r.bin.slice(), gold: 0, lost: 0, events: [], levels: [], credits: 0, ach: [] };
  const res = result();

  // 1. Expédition.
  rep.gold = binValue(r);
  r.gold += rep.gold;
  r.stats.shipped += rep.gold;
  r.stats.best = Math.max(r.stats.best, rep.gold);
  for (const s of r.bin) if (!r.stats.ids.includes(s.id)) r.stats.ids.push(s.id);
  r.bin = [];
  if (passedOut) { rep.lost = Math.min(1000, Math.floor(r.gold * 0.1)); r.gold -= rep.lost; }
  rep.credits = rep.gold > 0 ? rep.gold * 10 + wealthBonus(balance, Math.min(0.03, rep.gold / 100000)) : 0;

  // 2. Cultures (avec l'eau d'aujourd'hui).
  const nextSeasonDay = r.day + 1 > DAYS_PER_SEASON;
  const newSeason = nextSeasonDay ? (r.season + 1) % 4 : r.season;
  let withered = 0;
  for (const [k, c] of Object.entries(r.crops)) {
    const i = Number(k);
    const x = i % MAP_W, y = Math.floor(i / MAP_W);
    const crop = cropById(c.c);
    const gh = inGreenhouse(x, y);
    if (c.dead) continue;
    if (r.soil[i]?.w) {
      if (c.h > 0) c.rg = Math.min(crop.regrow, c.rg + 1);
      else c.g = Math.min(99, c.g + 1);
    }
    if (!gh && !cropInSeason(crop, newSeason)) { c.dead = true; withered += 1; }
  }
  if (withered) rep.events.push(`${withered} culture${withered > 1 ? "s" : ""} hors saison ${withered > 1 ? "ont" : "a"} fané.`);

  // 3. La terre sèche ; la terre vide non arrosée peut redevenir de l'herbe.
  for (const [k, s] of Object.entries(r.soil)) {
    const i = Number(k);
    if (!r.crops[i] && !s.w && !inGreenhouse(i % MAP_W, Math.floor(i / MAP_W)) && rng() < 0.12) { delete r.soil[i]; continue; }
    s.w = 0;
  }

  // 4. Corbeaux.
  const scarecrows = Object.entries(r.obj).filter(([, o]) => o.t === "scarecrow").map(([k]) => ({ x: k % MAP_W, y: Math.floor(k / MAP_W) }));
  const exposed = Object.keys(r.crops).map(Number).filter((i) => {
    const x = i % MAP_W, y = Math.floor(i / MAP_W);
    return !r.crops[i].dead && !inGreenhouse(x, y) && !scarecrows.some((s) => Math.hypot(s.x - x, s.y - y) <= 8);
  });
  if (exposed.length >= 16 && rng() < 0.35) {
    const victim = pick(rng, exposed);
    rep.events.push(`Un corbeau a mangé ton ${cropById(r.crops[victim].c).name.toLowerCase()} ! (Pose un épouvantail.)`);
    delete r.crops[victim];
  }

  // 5. Machines.
  for (const o of Object.values(r.obj)) if (MACHINES.includes(o.t) && o.item && o.left > 0) o.left -= 1;

  // 6. Animaux : mangent (herbe dehors si beau temps hors hiver, sinon foin du silo) puis produisent.
  const graze = r.season !== 3 && r.weather === "sun";
  let hungry = 0;
  for (const a of r.animals) {
    const kind = animalById(a.kind);
    let fed = graze;
    if (!fed && r.hay > 0) { r.hay -= 1; fed = true; }
    if (!fed) hungry += 1;
    a.mood = Math.max(0, Math.min(255, a.mood + (a.petted ? 0 : -20) + (fed ? 5 : -40)));
    a.petted = false;
    a.age += 1;
    a.wait = (a.wait || 0) + 1;
    if (fed && !a.ready && a.wait >= kind.every) { a.ready = true; a.wait = 0; }
  }
  if (hungry) rep.events.push(`${hungry} animal${hungry > 1 ? "ux" : ""} n'${hungry > 1 ? "ont" : "a"} rien eu à manger : coupe de l'herbe haute avec la faux ou achète du foin.`);

  // 7. Calendrier.
  r.day += 1;
  if (r.day > DAYS_PER_SEASON) {
    r.day = 1;
    r.season = newSeason;
    if (r.season === 0) { r.year += 1; unlock(r, res, "year2"); }
    rep.events.unshift(`Bienvenue en ${SEASONS[r.season].toLowerCase()} !`);
  }
  r.weather = r.day === 1 ? "sun" : r.tomorrow;
  r.tomorrow = rollWeather(r.season, rng);
  r.stats.days += 1;

  // 8. Pluie, neige et arroseurs arrosent le matin.
  if (r.weather === "rain" || r.weather === "storm" || r.weather === "snow") {
    for (const k of Object.keys(r.soil)) { const i = Number(k); if (!inGreenhouse(i % MAP_W, Math.floor(i / MAP_W))) r.soil[i].w = 1; }
  }
  for (const [k, o] of Object.entries(r.obj)) {
    if (!SPRINKLER_RANGE[o.t]) continue;
    const i = Number(k);
    for (const p of sprinklerCells(o.t, i % MAP_W, Math.floor(i / MAP_W))) if (inMap(p.x, p.y) && r.soil[idx(p.x, p.y)]) r.soil[idx(p.x, p.y)].w = 1;
  }
  if (r.weather === "storm" && rng() < 0.25) {
    const trees = Object.entries(r.obj).filter(([, o]) => o.t === "tree");
    if (trees.length) { const [k] = pick(rng, trees); r.obj[k] = { t: "stump", hp: 4 }; rep.events.push("La foudre est tombée sur un arbre !"); }
  }

  // 9. Débris, cueillette, minerais, arbres.
  const count = Object.keys(r.obj).length;
  if (count < 520) {
    const grassy = (x, y) => groundAt(x, y) === G.GRASS && !inRect(x, y, FOREST);
    const forest = (x, y) => inRect(x, y, FOREST) && groundAt(x, y) === G.GRASS;
    const quarry = (x, y) => groundAt(x, y) === G.GRAVEL;
    const spawn = (n, test, make) => { for (let k = 0; k < n; k++) { const t = randomFreeTile(r, rng, test); if (t) r.obj[t.i] = make(); } };
    if (r.season !== 3) spawn(randInt(rng, 2, 5), grassy, () => ({ t: "weed" }));
    spawn(randInt(rng, 0, 2), grassy, () => ({ t: "stone" }));
    spawn(randInt(rng, 1, 2), (x, y) => grassy(x, y) || forest(x, y), () => ({ t: "branch" }));
    if (r.season !== 3) spawn(randInt(rng, 2, 5), (x, y) => grassy(x, y) || forest(x, y), () => ({ t: "grass" }));
    spawn(randInt(rng, 0, 1), forest, () => ({ t: "tree", hp: 8 }));
    const forage = FORAGE.filter((f) => f.season === r.season);
    spawn(randInt(rng, 2, 4), (x, y) => forest(x, y) || (grassy(x, y) && rng() < 0.3), () => {
      const rare = forage.filter((f) => f.rare);
      const common = forage.filter((f) => !f.rare);
      return { t: "forage", item: rare.length && rng() < 0.12 ? pick(rng, rare).id : pick(rng, common).id };
    });
    const ml = skillLevel(r, "mine");
    spawn(randInt(rng, 2, 4), quarry, () => {
      const v = rng();
      if (v < 0.08 + 0.01 * ml && ml >= 5) return { t: "ore_au", hp: 5 };
      if (v < 0.3 + 0.02 * ml && ml >= 2) return { t: "ore_fe", hp: 4 };
      if (v < 0.6) return { t: "ore_cu", hp: 3 };
      if (v < 0.75) return { t: "boulder", hp: 6 };
      return { t: "stone" };
    });
  }

  // 10. Réveil.
  r.energy = passedOut ? Math.round(MAX_ENERGY * 0.5) : r.time > MIDNIGHT ? Math.round(MAX_ENERGY * 0.75) : MAX_ENERGY;
  r.time = DAY_START;
  r.water = Math.max(r.water, 0);
  r.px = 7.5; r.py = 6.6; r.face = 2;
  r.request = newRequest(r, rng);

  if (r.stats.shipped >= 100000) unlock(r, res, "rich");
  if (r.stats.ids.length >= 30) unlock(r, res, "collect");
  if (skillLevel(r, "farm") >= 10) unlock(r, res, "master");
  rep.ach = res.ach || [];
  rep.weather = r.weather;
  return rep;
}
