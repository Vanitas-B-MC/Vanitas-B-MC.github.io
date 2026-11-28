// js/fishing.js — logique pure de « Grand Bleu », le jeu de pêche. Aucun accès au DOM.
//
// 6 lieux, 54 espèces. Chaque espèce a ses lieux, ses moments (aube, jour, crépuscule, nuit) et sa météo.
// Une partie de pêche : 1) maintenir pour charger le lancer, relâcher au bon moment ; 2) attendre la touche et ferrer ;
// 3) mini-jeu façon Stardew Valley : garder le poisson dans la barre verte (maintenir = la barre monte) jusqu'à remplir
// la jauge. Un coffre au trésor apparaît parfois : le garder dans la barre pour l'ouvrir.
// Les prises sont vendues tout de suite contre des perles (monnaie du jeu) et notées dans le bestiaire.

import { wealthBonus } from "./rewards.js";

export const MIN_PER_REAL_SEC = 2;          // 1 seconde = 2 minutes de jeu → une journée dure 12 minutes
export const DAY_START = 6 * 60;

export const RARITY = [
  { name: "Commun",      color: "#c8d0dc", weight: 100, xp: 1,   pct: 0.0005 },
  { name: "Peu commun",  color: "#3ddc84", weight: 40,  xp: 1.5, pct: 0.001 },
  { name: "Rare",        color: "#3aa9ff", weight: 14,  xp: 2,   pct: 0.003 },
  { name: "Épique",      color: "#b266ff", weight: 4,   xp: 3,   pct: 0.008 },
  { name: "Légendaire",  color: "#ffb000", weight: 1,   xp: 5,   pct: 0.025 },
  { name: "Mythique",    color: "#ff2bd6", weight: 0.3, xp: 8,   pct: 0.05 }
];

export const TIMES = {
  dawn:  { name: "Aube",       icon: "🌅" },
  day:   { name: "Jour",       icon: "☀" },
  dusk:  { name: "Crépuscule", icon: "🌇" },
  night: { name: "Nuit",       icon: "🌙" }
};
export const TIME_IDS = Object.keys(TIMES);
export const WEATHERS = {
  sun:   { name: "Soleil",     icon: "☀" },
  rain:  { name: "Pluie",      icon: "☂" },
  fog:   { name: "Brouillard", icon: "≋" },
  storm: { name: "Orage",      icon: "⚡" }
};
export const WEATHER_IDS = Object.keys(WEATHERS);

export const BEHAVIORS = {
  calme:     { name: "Calme",     change: 0.7, range: 0.35, agility: 2.2, bias: 0 },
  vif:       { name: "Vif",       change: 1.6, range: 0.7,  agility: 6.5, bias: 0 },
  plongeur:  { name: "Plongeur",  change: 1.0, range: 0.5,  agility: 3.5, bias: -0.18 },
  flotteur:  { name: "Flotteur",  change: 1.0, range: 0.5,  agility: 3.5, bias: 0.18 },
  mixte:     { name: "Mixte",     change: 1.2, range: 0.55, agility: 4.2, bias: 0 },
  chaotique: { name: "Chaotique", change: 2.4, range: 0.85, agility: 7.5, bias: 0 }
};

export const LOCATIONS = [
  { id: "etang",   name: "Étang des Saules",      price: 0,     lvl: 0, desc: "Un étang paisible derrière la ferme. Idéal pour débuter.", junk: 0.12 },
  { id: "riviere", name: "Rivière Claire",        price: 400,   lvl: 0, desc: "Un courant vif, des truites et des saumons qui remontent.", junk: 0.1 },
  { id: "lac",     name: "Lac de la Montagne",    price: 2500,  lvl: 2, desc: "Eaux froides et profondes, souvent noyées de brouillard.", junk: 0.08 },
  { id: "mer",     name: "Côte Néon",             price: 6000,  lvl: 3, desc: "La jetée face à la mégapole. Les gros poissons sortent avec l'orage.", junk: 0.1 },
  { id: "egouts",  name: "Égouts de Night City",  price: 15000, lvl: 5, desc: "Eaux troubles, néons et créatures mutantes. Ça pique.", junk: 0.18 },
  { id: "abysse",  name: "Fosse Abyssale",        price: 50000, lvl: 7, desc: "Une plateforme au-dessus du vide bleu. Les monstres des profondeurs.", junk: 0.05 }
];
export const locById = (id) => LOCATIONS.find((l) => l.id === id) ?? null;

// t : moments (vide = tous). w : météo (vide = toutes). r : rareté (0 à 5). min/max en cm. p : prix de base en perles.
// d : difficulté (0 à 100). b : comportement. s : silhouette (fish, long, round, flat, eel, shark, squid, crab, jelly).
const F = (id, name, loc, r, t, w, min, max, p, d, b, s, color, desc) => ({ id, name, loc, rarity: r, times: t, weather: w, min, max, price: p, diff: d, behavior: b, shape: s, color, desc });
export const FISH = [
  // Étang
  F("gardon",    "Gardon",               "etang", 0, [], [], 10, 30, 15, 10, "calme", "fish", "#c8ccd4", "Petit poisson argenté, toujours en bande. Le compagnon des débutants."),
  F("carpe",     "Carpe commune",        "etang", 0, [], [], 30, 80, 30, 18, "calme", "round", "#c8a050", "Elle fouille la vase à la recherche de graines. Robuste et têtue."),
  F("perche",    "Perche",               "etang", 0, ["day", "dusk"], [], 15, 45, 25, 25, "vif", "fish", "#9ac850", "Rayée de vert, elle chasse les alevins en plein jour."),
  F("tanche",    "Tanche",               "etang", 1, ["dawn", "dusk"], ["rain", "fog"], 20, 60, 55, 30, "plongeur", "round", "#5a8a3a", "Sa peau visqueuse la protégerait de tout. Sort par temps gris."),
  F("brochet",   "Brochet",              "etang", 1, ["day"], [], 50, 120, 90, 45, "vif", "long", "#6a9a5a", "Le requin d'eau douce. Une attaque éclair, des dents partout."),
  F("koi",       "Carpe koï",            "etang", 2, ["day"], ["sun"], 30, 90, 220, 40, "flotteur", "round", "#ff7a2a", "Des écailles orange et blanches. On dit qu'elle porte chance."),
  F("chat",      "Poisson-chat",         "etang", 2, ["night"], ["rain", "storm"], 30, 110, 160, 55, "plongeur", "long", "#6a5a4a", "Il sort de la vase les nuits de pluie, moustaches en avant."),
  F("silure",    "Silure",               "etang", 3, ["night"], [], 100, 250, 600, 70, "plongeur", "eel", "#4a4a3a", "Un géant qui vit au fond depuis des décennies. Avale tout."),
  F("barbu",     "Le Vieux Barbu",       "etang", 4, ["dawn"], ["fog"], 150, 200, 3000, 85, "mixte", "round", "#d8b060", "Une carpe énorme aux barbillons blancs. Les anciens jurent l'avoir vue."),
  // Rivière
  F("chevesne",  "Chevesne",             "riviere", 0, [], [], 20, 55, 30, 25, "calme", "fish", "#a8b0a0", "Gros gourmand, il mange de tout, même des cerises tombées à l'eau."),
  F("truite",    "Truite arc-en-ciel",   "riviere", 0, ["day"], ["sun"], 25, 60, 45, 35, "vif", "fish", "#ff8ab0", "Une bande rose irisée le long du flanc. Saute hors de l'eau."),
  F("barbeau",   "Barbeau",              "riviere", 0, ["dawn", "day"], [], 25, 70, 40, 30, "plongeur", "long", "#b8a070", "Il fouille les galets du lit de la rivière avec ses barbillons."),
  F("ombre",     "Ombre",                "riviere", 1, ["day"], ["fog"], 25, 50, 85, 40, "flotteur", "fish", "#8a9ab8", "Sa grande nageoire dorsale ressemble à un drapeau."),
  F("saumon",    "Saumon",               "riviere", 1, ["dawn", "dusk"], ["rain"], 50, 110, 120, 50, "vif", "fish", "#ff7a5a", "Il remonte le courant pour frayer. Une énergie incroyable."),
  F("lamproie",  "Lamproie",             "riviere", 1, ["night"], ["rain", "storm"], 30, 90, 100, 45, "mixte", "eel", "#6a6a7a", "Une bouche-ventouse pleine de dents. Préhistorique et étrange."),
  F("esturgeon", "Esturgeon",            "riviere", 2, ["night"], [], 80, 250, 300, 65, "plongeur", "shark", "#7a8a8a", "Un fossile vivant couvert de plaques osseuses."),
  F("truiteor",  "Truite dorée",         "riviere", 3, ["dawn"], ["sun"], 30, 70, 700, 70, "vif", "fish", "#ffd23a", "Elle brille comme un lingot sous les premiers rayons du soleil."),
  F("chrome",    "Saumon Chromé",        "riviere", 4, [], ["storm"], 120, 160, 4000, 88, "chaotique", "fish", "#d8e8ff", "Un saumon au corps de métal poli. Il ne remonte la rivière que sous l'orage."),
  // Lac
  F("omble",     "Omble chevalier",      "lac", 0, [], [], 25, 60, 60, 30, "calme", "fish", "#e07a4a", "Ventre rouge vif, il aime les eaux glacées."),
  F("coregone",  "Corégone",             "lac", 0, ["day"], [], 25, 55, 50, 25, "flotteur", "fish", "#d0dce8", "Il nage en pleine eau en grands bancs argentés."),
  F("truitelac", "Truite de lac",        "lac", 1, ["dawn", "dusk"], [], 40, 100, 130, 50, "vif", "fish", "#8a9a7a", "Plus grosse que ses cousines de rivière, et bien plus rusée."),
  F("lotte",     "Lotte",                "lac", 1, ["night"], [], 30, 80, 110, 45, "plongeur", "eel", "#7a6a3a", "La seule morue d'eau douce. Chasse la nuit, au ras du fond."),
  F("sandre",    "Sandre",               "lac", 1, ["dusk", "night"], [], 40, 90, 140, 50, "vif", "long", "#a8b090", "Ses grands yeux voient dans le noir. Un prédateur discret."),
  F("huchon",    "Huchon",               "lac", 2, [], ["fog"], 60, 150, 380, 65, "mixte", "long", "#c0806a", "Le saumon du Danube. Rare et protégé ailleurs, il hante ce lac."),
  F("glace",     "Poisson des glaces",   "lac", 3, ["night"], ["fog", "sun"], 20, 40, 900, 75, "flotteur", "fish", "#bff0ff", "Son sang transparent ne gèle jamais. On voit à travers lui."),
  F("spectre",   "Spectre du Lac",       "lac", 4, ["night"], ["fog"], 100, 180, 5000, 90, "chaotique", "long", "#a0f0ff", "Une silhouette pâle qui glisse sous la brume. Est-ce vraiment un poisson ?"),
  // Côte néon
  F("sardine",   "Sardine",              "mer", 0, [], [], 10, 25, 20, 15, "vif", "fish", "#9ab0c8", "Des millions de sardines tournent sous la jetée."),
  F("maquereau", "Maquereau",            "mer", 0, ["day"], [], 20, 50, 40, 30, "vif", "fish", "#4a8ac8", "Rayé de bleu et de noir, il se bat comme un fou."),
  F("bar",       "Bar",                  "mer", 0, ["dawn", "dusk"], [], 30, 80, 70, 35, "mixte", "fish", "#a8b8c8", "Le loup des mers. Il chasse dans l'écume des vagues."),
  F("daurade",   "Daurade royale",       "mer", 1, ["day"], ["sun"], 25, 60, 110, 40, "calme", "round", "#e8d080", "Un sourcil doré entre les yeux. Très appréciée."),
  F("raie",      "Raie pastenague",      "mer", 1, [], ["rain"], 50, 150, 160, 45, "plongeur", "flat", "#8a7a6a", "Elle se cache dans le sable. Attention à la queue !"),
  F("meduse",    "Méduse néon",          "mer", 2, ["night"], [], 20, 60, 260, 50, "flotteur", "jelly", "#ff5ad8", "Elle s'illumine au rythme des enseignes de la ville."),
  F("poulpe",    "Poulpe",               "mer", 2, ["night"], [], 30, 120, 300, 60, "plongeur", "squid", "#d86a5a", "Huit bras, trois cœurs et beaucoup trop d'intelligence."),
  F("thon",      "Thon rouge",           "mer", 2, ["day"], [], 100, 300, 450, 70, "vif", "shark", "#3a5a9a", "Une torpille de muscles. Il peut traverser l'océan."),
  F("espadon",   "Espadon",              "mer", 3, ["day"], ["storm"], 150, 400, 1500, 80, "chaotique", "shark", "#5a7aaa", "Son rostre fend les vagues. Ne sort que quand la mer gronde."),
  F("datapulse", "Requin Datapulse",     "mer", 4, ["night"], ["storm"], 300, 600, 8000, 92, "chaotique", "shark", "#00f0ff", "Un requin aux branchies lumineuses qui suit les câbles sous-marins de la ville."),
  // Égouts
  F("neon",      "Poisson-néon",         "egouts", 0, ["night"], [], 5, 15, 60, 30, "vif", "fish", "#00f0ff", "Minuscule et fluorescent. Un banc ressemble à une pub qui bouge."),
  F("mutante",   "Carpe mutante",        "egouts", 0, [], [], 30, 90, 70, 30, "mixte", "round", "#9ac83a", "Trois yeux, des écailles vertes. Elle a l'air contente."),
  F("gobie",     "Gobie chromé",         "egouts", 1, ["day"], [], 8, 20, 140, 50, "vif", "fish", "#c8d0e0", "Ses écailles réfléchissent comme un miroir. Il mange de la limaille."),
  F("anguille",  "Anguille électrique",  "egouts", 1, [], [], 50, 200, 160, 55, "mixte", "eel", "#e8e83a", "600 volts. Évite de la toucher à mains nues."),
  F("crabebot",  "Crabe-bot",            "egouts", 1, [], [], 10, 30, 120, 45, "plongeur", "crab", "#ff6a3a", "Moitié crabe, moitié drone de nettoyage. Personne ne sait qui l'a fabriqué."),
  F("piranha",   "Piranha cyber",        "egouts", 2, ["night"], [], 15, 35, 350, 70, "vif", "round", "#c83a4a", "Des dents en titane. Il a déjà mordu un câble haute tension."),
  F("toxique",   "Silure toxique",       "egouts", 2, [], ["rain", "storm"], 80, 200, 420, 65, "plongeur", "eel", "#6aff3a", "Il brille en vert. Mieux vaut ne pas le manger."),
  F("daemon",    "Daemon des égouts",    "egouts", 3, ["night"], ["storm"], 100, 200, 2000, 82, "chaotique", "long", "#ff2a6d", "On raconte qu'il est né d'un virus échappé d'un serveur noyé."),
  F("croco",     "Croco-Glitch",         "egouts", 4, ["night"], [], 200, 400, 9000, 93, "chaotique", "shark", "#3aff8f", "Un crocodile dont l'image saute comme une vidéo corrompue."),
  // Abysse
  F("lanterne",  "Poisson-lanterne",     "abysse", 1, [], [], 10, 30, 300, 55, "flotteur", "fish", "#5affd0", "Des points lumineux sur les flancs pour s'y retrouver dans le noir."),
  F("baudroie",  "Baudroie abyssale",    "abysse", 1, [], [], 20, 60, 380, 60, "plongeur", "round", "#3a3a4a", "Une lumière au bout d'une antenne… et une bouche immense derrière."),
  F("isopode",   "Isopode géant",        "abysse", 1, [], [], 20, 50, 420, 50, "plongeur", "crab", "#c8b8a8", "Un cloporte de la taille d'un chat. Il peut jeûner des années."),
  F("hache",     "Poisson-hache",        "abysse", 2, [], [], 5, 15, 500, 65, "vif", "flat", "#c0c8d8", "Fin comme une lame, argenté, avec des yeux tournés vers le haut."),
  F("lutin",     "Requin lutin",         "abysse", 2, [], [], 150, 400, 900, 72, "mixte", "shark", "#e8a8b0", "Rose, avec une mâchoire qui jaillit vers l'avant. Cauchemardesque."),
  F("dragon",    "Poisson-dragon",       "abysse", 3, [], [], 20, 60, 1800, 80, "vif", "eel", "#8a3aff", "Il produit une lumière rouge invisible pour ses proies."),
  F("calmar",    "Calmar géant",         "abysse", 3, ["night"], [], 400, 1200, 2500, 85, "chaotique", "squid", "#c83a3a", "Des yeux grands comme des assiettes. Il se bat avec des cachalots."),
  F("coelacanthe", "Cœlacanthe",         "abysse", 4, [], ["fog"], 120, 200, 12000, 90, "mixte", "fish", "#4a6aaa", "On le croyait disparu depuis 66 millions d'années."),
  F("coeur",     "Cœur de l'Abysse",     "abysse", 5, ["night"], ["storm"], 1000, 2000, 25000, 97, "chaotique", "jelly", "#ff2bd6", "Une créature immense faite de lumière. Elle bat comme un cœur.")
];
export const fishById = (id) => FISH.find((f) => f.id === id) ?? null;

export const JUNK = [
  { id: "botte",   name: "Vieille botte",       price: 2 },
  { id: "algue",   name: "Algues",              price: 3 },
  { id: "canette", name: "Canette écrasée",     price: 1 },
  { id: "flotte",  name: "Bois flotté",         price: 4 },
  { id: "puce",    name: "Puce électronique",   price: 40, loc: "egouts" }
];

/* ================= Équipement ================= */

export const RODS = [
  { id: "bambou",  name: "Canne en bambou",         price: 0,     lvl: 0, bar: 0,    slots: 0, luck: 0,   bite: 1 },
  { id: "fibre",   name: "Canne en fibre de verre", price: 1800,  lvl: 2, bar: 0.03, slots: 1, luck: 0.1, bite: 0.95 },
  { id: "carbone", name: "Canne en carbone",        price: 6000,  lvl: 4, bar: 0.05, slots: 1, luck: 0.25, bite: 0.9 },
  { id: "iridium", name: "Canne en iridium",        price: 20000, lvl: 6, bar: 0.07, slots: 2, luck: 0.4, bite: 0.85 },
  { id: "quantum", name: "Canne néon quantique",    price: 75000, lvl: 8, bar: 0.1,  slots: 3, luck: 0.6, bite: 0.75, blue: 5 }
];
export const rodById = (id) => RODS.find((r) => r.id === id) ?? RODS[0];

export const BAITS = [
  { id: "ver",     name: "Vers de terre",   price: 50,   n: 10, lvl: 0, desc: "Touche 25 % plus rapide.", bite: 0.75, luck: 0 },
  { id: "deluxe",  name: "Appât deluxe",    price: 400,  n: 10, lvl: 3, desc: "Touche 2× plus rapide, poissons un peu plus rares.", bite: 0.5, luck: 0.3 },
  { id: "magique", name: "Appât magique",   price: 1500, n: 5,  lvl: 6, desc: "Ignore le moment et la météo : tout le lieu peut mordre.", bite: 0.7, luck: 0.1, magic: true }
];
export const baitById = (id) => BAITS.find((b) => b.id === id) ?? null;

export const TACKLE = [
  { id: "bouchon", name: "Bouchon géant",     price: 500,  lvl: 2, uses: 25, desc: "Barre verte plus grande." },
  { id: "plomb",   name: "Plomb piège",       price: 800,  lvl: 3, uses: 25, desc: "La jauge descend 35 % moins vite quand le poisson s'échappe de la barre." },
  { id: "aimant",  name: "Aimant à trésor",   price: 1000, lvl: 3, uses: 25, desc: "Coffres au trésor beaucoup plus fréquents." },
  { id: "leurre",  name: "Leurre néon",       price: 2500, lvl: 5, uses: 25, desc: "Attire les poissons rares." },
  { id: "sonar",   name: "Sonar de poche",    price: 3000, lvl: 6, uses: 40, desc: "Montre quel poisson a mordu, et le ralentit un peu." }
];
export const tackleById = (id) => TACKLE.find((t) => t.id === id) ?? null;

export const RAIN_TOTEM = { price: 300, desc: "Fait pleuvoir sur le lieu de pêche jusqu'à la fin de la journée." };

export const XP_LEVELS = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
export const levelOf = (xp) => { let l = 0; while (l < XP_LEVELS.length && xp >= XP_LEVELS[l]) l++; return l; };

// Paliers du bestiaire (espèces différentes) : pièces bleues de l'arcade.
export const MILESTONES = [
  { n: 5, blue: 1 }, { n: 10, blue: 1 }, { n: 20, blue: 2 }, { n: 30, blue: 3 }, { n: 40, blue: 4 }, { n: 50, blue: 5 }, { n: FISH.length, blue: 10 }
];

/* ================= Sauvegarde ================= */

export function freshAngler() {
  return {
    v: 1,
    pearls: 100,
    xp: 0,
    loc: "etang",
    unlocked: ["etang"],
    rods: ["bambou"],
    rod: "bambou",
    bait: { ver: 10 },
    baitOn: "ver",
    tackle: {},            // id → utilisations restantes
    tackleOn: [],
    time: DAY_START,
    day: 1,
    weather: "sun",
    totem: false,          // pluie forcée jusqu'à la fin de la journée
    dex: {},               // id → { n, best (cm), q (meilleure qualité) }
    junk: 0,
    quests: [],
    stats: { caught: 0, perfect: 0, treasure: 0, escaped: 0, earned: 0, biggest: 0 },
    milestones: []
  };
}

const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const int = (v, lo, hi, def) => Math.floor(num(v, lo, hi, def));

export function sanitizeAngler(raw) {
  const a = freshAngler();
  if (!raw || typeof raw !== "object" || raw.v !== 1) return a;
  a.pearls = int(raw.pearls, 0, 1e15, 100);
  a.xp = int(raw.xp, 0, 1e9, 0);
  if (Array.isArray(raw.unlocked)) for (const id of raw.unlocked) if (locById(id) && !a.unlocked.includes(id)) a.unlocked.push(id);
  a.loc = a.unlocked.includes(raw.loc) ? raw.loc : "etang";
  if (Array.isArray(raw.rods)) for (const id of raw.rods) if (RODS.some((r) => r.id === id) && !a.rods.includes(id)) a.rods.push(id);
  a.rod = a.rods.includes(raw.rod) ? raw.rod : "bambou";
  a.bait = {};
  for (const b of BAITS) { const n = int(raw.bait?.[b.id], 0, 9999, 0); if (n) a.bait[b.id] = n; }
  a.baitOn = baitById(raw.baitOn) && a.bait[raw.baitOn] ? raw.baitOn : null;
  a.tackle = {};
  for (const t of TACKLE) { const n = int(raw.tackle?.[t.id], 0, 9999, 0); if (n) a.tackle[t.id] = n; }
  a.tackleOn = Array.isArray(raw.tackleOn) ? [...new Set(raw.tackleOn.filter((id) => a.tackle[id]))].slice(0, rodById(a.rod).slots) : [];
  a.time = num(raw.time, 0, 1440, DAY_START);
  a.day = int(raw.day, 1, 1e6, 1);
  a.weather = WEATHERS[raw.weather] ? raw.weather : "sun";
  a.totem = !!raw.totem;
  if (raw.dex && typeof raw.dex === "object") {
    for (const f of FISH) {
      const d = raw.dex[f.id];
      if (d && typeof d === "object" && int(d.n, 0, 1e9, 0) > 0) a.dex[f.id] = { n: int(d.n, 1, 1e9, 1), best: num(d.best, 0, 99999, 0), q: int(d.q, 0, 3, 0) };
    }
  }
  a.junk = int(raw.junk, 0, 1e9, 0);
  if (Array.isArray(raw.quests)) a.quests = raw.quests.slice(0, 3).map(sanitizeQuest).filter(Boolean);
  for (const k of Object.keys(a.stats)) a.stats[k] = num(raw.stats?.[k], 0, 1e15, 0);
  a.milestones = Array.isArray(raw.milestones) ? raw.milestones.filter((n) => MILESTONES.some((m) => m.n === n)) : [];
  return a;
}

function sanitizeQuest(q) {
  if (!q || typeof q !== "object") return null;
  if (!["count", "rarity", "size"].includes(q.type)) return null;
  const out = { type: q.type, done: !!q.done, claimed: !!q.claimed, p: int(q.p, 0, 99, 0), n: int(q.n, 1, 99, 1), reward: int(q.reward, 0, 1e9, 0) };
  if (q.type === "rarity") { if (!locById(q.loc)) return null; out.loc = q.loc; out.r = int(q.r, 0, 5, 1); }
  else { if (!fishById(q.fish)) return null; out.fish = q.fish; if (q.type === "size") out.cm = int(q.cm, 1, 9999, 1); }
  return out;
}

/* ================= Temps et météo ================= */

export function period(time) {
  const h = (time / 60) % 24;
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}
export const clockText = (t) => { const m = Math.floor(t) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60 / 10) * 10).padStart(2, "0")}`; };

function rollWeather(rng) {
  const v = rng();
  return v < 0.5 ? "sun" : v < 0.75 ? "rain" : v < 0.9 ? "fog" : "storm";
}

// Avance l'horloge de `minutes`. Renvoie true si une nouvelle journée a commencé (nouvelle météo, nouvelles quêtes).
export function advance(a, minutes, rng = Math.random) {
  const before = a.time;
  a.time += minutes;
  let newDay = false;
  if (before < DAY_START && a.time >= DAY_START) newDay = true;   // le jour se lève à 6 h
  if (a.time >= 1440) { a.time -= 1440; if (a.time >= DAY_START) newDay = true; }
  if (newDay) {
    a.day += 1;
    a.weather = rollWeather(rng);
    a.totem = false;
    a.quests = makeQuests(a, rng);
  }
  return newDay;
}

/* ================= Niveau et bonus ================= */

export const level = (a) => levelOf(a.xp);
export const hasTackle = (a, id) => a.tackleOn.includes(id) && (a.tackle[id] ?? 0) > 0;

export function barSize(a) {
  return Math.min(0.42, 0.2 + rodById(a.rod).bar + level(a) * 0.006 + (hasTackle(a, "bouchon") ? 0.045 : 0));
}

export function luckOf(a, castQuality = 0) {
  const bait = baitById(a.baitOn);
  return rodById(a.rod).luck + (bait && a.bait[bait.id] ? bait.luck : 0) + (hasTackle(a, "leurre") ? 0.45 : 0) + level(a) * 0.04 + castQuality * 0.25;
}

/* ================= Choix du poisson ================= */

// Poissons qui peuvent mordre maintenant à ce lieu (l'appât magique ignore le moment et la météo).
export function available(loc, time, weather, magic = false) {
  const p = period(time);
  return FISH.filter((f) => f.loc === loc && (magic || ((!f.times.length || f.times.includes(p)) && (!f.weather.length || f.weather.includes(weather)))));
}

// Tire le poisson qui mord. Renvoie { fish } ou { junk }.
export function rollBite(a, castQuality = 0, rng = Math.random) {
  const bait = baitById(a.baitOn);
  const magic = !!(bait?.magic && a.bait[bait.id]);
  const loc = locById(a.loc);
  const pool = available(a.loc, a.time, currentWeather(a), magic);
  const junkChance = Math.max(0.02, loc.junk - 0.015 * RODS.findIndex((r) => r.id === a.rod) - 0.03 * castQuality);
  if (!pool.length || rng() < junkChance) {
    const junk = JUNK.filter((j) => !j.loc || j.loc === a.loc);
    return { junk: junk[Math.floor(rng() * junk.length)] };
  }
  const luck = luckOf(a, castQuality);
  const weights = pool.map((f) => RARITY[f.rarity].weight * (1 + luck * 0.35 * f.rarity));
  let roll = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll < 0) return { fish: pool[i] }; }
  return { fish: pool[pool.length - 1] };
}

export const currentWeather = (a) => (a.totem ? "rain" : a.weather);

// Taille de la prise (cm), un peu poussée vers le haut par la chance.
export function rollSize(fish, luck = 0, rng = Math.random) {
  const u = Math.pow(rng(), 1 / (1 + luck * 0.4));
  return Math.round((fish.min + (fish.max - fish.min) * u) * 10) / 10;
}

// Délai avant la touche (ms). castQuality : 0 faible, 1 bon, 2 parfait.
export function biteDelay(a, castQuality = 0, rng = Math.random) {
  const bait = baitById(a.baitOn);
  const b = bait && a.bait[bait.id] ? bait.bite : 1;
  const cast = [1.15, 0.9, 0.65][castQuality] ?? 1;
  return Math.round((2200 + rng() * 6500) * b * rodById(a.rod).bite * cast * (1 - 0.02 * level(a)));
}
export const hookWindow = (a) => 850 + RODS.findIndex((r) => r.id === a.rod) * 90 + level(a) * 15;

/* ================= Lancer ================= */

// Puissance du lancer (0 à 1) après `ms` de charge : monte puis redescend (période 1,5 s).
export const castPower = (ms) => (1 - Math.cos((Math.max(0, ms) / 1500) * 2 * Math.PI)) / 2;
export const castQuality = (power) => (power >= 0.92 ? 2 : power >= 0.65 ? 1 : 0);

/* ================= Mini-jeu ================= */
// Piste verticale de 0 (bas) à 1 (haut). La barre a une hauteur `bar` ; `pos` = son bas.
// Maintenir : elle accélère vers le haut ; relâcher : elle retombe et rebondit au fond.

const UP = 3.4;
const GRAVITY = 2.9;

export function reelParams(a, fish) {
  const beh = BEHAVIORS[fish.behavior];
  const d = fish.diff / 100;
  const sonar = hasTackle(a, "sonar");
  return {
    bar: barSize(a),
    change: beh.change * (0.6 + d * 1.2),
    range: beh.range,
    agility: beh.agility * (0.55 + d * 0.9) * (sonar ? 0.9 : 1),
    bias: beh.bias,
    gain: 0.3 + level(a) * 0.006,
    loss: (0.16 + d * 0.2) * (hasTackle(a, "plomb") ? 0.65 : 1),
    treasure: Math.min(0.6, 0.12 + level(a) * 0.006 + (hasTackle(a, "aimant") ? 0.3 : 0))
  };
}

export function newReel(params, rng = Math.random) {
  return {
    pos: 0, vel: 0, fish: 0.3 + rng() * 0.4, target: 0.5, progress: 0.3, perfect: true, inside: true,
    treasure: rng() < params.treasure ? { at: 1 + rng() * 2.5, y: 0, p: 0, shown: false, got: false } : null,
    time: 0, status: "playing"
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function reelStep(s, dt, holding, params, rng = Math.random) {
  if (s.status !== "playing") return s;
  dt = Math.min(dt, 0.05);
  s.time += dt;

  // Barre
  s.vel += (holding ? UP : -GRAVITY) * dt;
  s.vel = clamp(s.vel, -1.6, 1.6);
  s.pos += s.vel * dt;
  const top = 1 - params.bar;
  if (s.pos < 0) { s.pos = 0; s.vel = s.vel < -0.4 ? -s.vel * 0.35 : 0; }
  if (s.pos > top) { s.pos = top; s.vel = Math.min(0, s.vel) * 0.3; }

  // Poisson
  if (rng() < params.change * dt) {
    const delta = (rng() * 2 - 1) * params.range + params.bias;
    s.target = clamp(s.fish + delta, 0.03, 0.97);
  }
  s.fish += (s.target - s.fish) * Math.min(1, params.agility * dt);
  s.fish = clamp(s.fish, 0.02, 0.98);

  s.inside = s.fish >= s.pos && s.fish <= s.pos + params.bar;
  s.progress = clamp(s.progress + (s.inside ? params.gain : -params.loss) * dt, 0, 1);
  if (!s.inside) s.perfect = false;

  // Trésor
  const t = s.treasure;
  if (t && !t.got) {
    if (!t.shown && s.time >= t.at) { t.shown = true; t.y = 0.1 + rng() * 0.8; }
    if (t.shown) {
      const inBar = t.y >= s.pos && t.y <= s.pos + params.bar;
      t.p = clamp(t.p + (inBar ? 0.55 : -0.12) * dt, 0, 1);
      if (t.p >= 1) t.got = true;
    }
  }

  if (s.progress >= 1) s.status = "won";
  else if (s.progress <= 0) s.status = "lost";
  return s;
}

/* ================= Résultat d'une prise ================= */

export function qualityOf(sizeFrac, perfect, lvl, rng = Math.random) {
  let q = 0;
  if (sizeFrac >= 0.8) q += 1;
  if (perfect) q += 1;
  if (perfect && rng() < lvl * 0.03) q += 1;
  return Math.min(3, q);
}
export const QUALITY = ["", "Argent", "Or", "Iridium"];
export const QUALITY_MULT = [1, 1.25, 1.5, 2];
export const fishValue = (fish, size, q) => Math.round(fish.price * (0.75 + 0.5 * ((size - fish.min) / Math.max(1, fish.max - fish.min))) * QUALITY_MULT[q]);

// Enregistre une prise. Renvoie le détail : perles, nouvelle espèce, record, paliers, crédits et pièces bleues de l'arcade.
export function landFish(a, fish, size, perfect, { balance = 0, rng = Math.random } = {}) {
  const lvlBefore = level(a);
  const frac = (size - fish.min) / Math.max(1, fish.max - fish.min);
  const q = qualityOf(frac, perfect, lvlBefore, rng);
  const value = fishValue(fish, size, q);
  const entry = a.dex[fish.id];
  const isNew = !entry;
  const record = !entry || size > entry.best;
  a.dex[fish.id] = { n: (entry?.n ?? 0) + 1, best: Math.max(entry?.best ?? 0, size), q: Math.max(entry?.q ?? 0, q) };
  a.pearls += value;
  a.stats.caught += 1;
  a.stats.earned += value;
  a.stats.biggest = Math.max(a.stats.biggest, size);
  if (perfect) a.stats.perfect += 1;
  const xp = Math.round((3 + fish.diff * 0.25) * RARITY[fish.rarity].xp * (perfect ? 1.4 : 1));
  a.xp += xp;
  useTackle(a);

  let credits = 0;
  let blue = 0;
  if (isNew) {
    credits = fish.price * 50 + wealthBonus(balance, RARITY[fish.rarity].pct);
    if (fish.rarity >= 4) blue += 2;
  }
  const species = Object.keys(a.dex).length;
  const reached = [];
  for (const m of MILESTONES) if (species >= m.n && !a.milestones.includes(m.n)) { a.milestones.push(m.n); blue += m.blue; reached.push(m); }
  const questsDone = progressQuests(a, fish, size);
  for (const qd of questsDone) { a.pearls += qd.reward; credits += wealthBonus(balance, 0.002) + qd.reward * 20; if (rng() < 0.15) blue += 1; }
  return { fish, size, q, value, xp, isNew, record, perfect, credits, blue, milestones: reached, quests: questsDone, levelUp: level(a) > lvlBefore ? level(a) : 0 };
}

export function landJunk(a, junk) {
  a.junk += 1;
  a.pearls += junk.price;
  a.xp += 1;
  useTackle(a);
  return { junk, value: junk.price };
}

function useTackle(a) {
  for (const id of a.tackleOn) {
    if (!a.tackle[id]) continue;
    a.tackle[id] -= 1;
    if (a.tackle[id] <= 0) delete a.tackle[id];
  }
  a.tackleOn = a.tackleOn.filter((id) => a.tackle[id]);
}

// Consomme un appât (au moment où le poisson mord).
export function useBait(a) {
  const id = a.baitOn;
  if (!id || !a.bait[id]) return;
  a.bait[id] -= 1;
  if (a.bait[id] <= 0) { delete a.bait[id]; a.baitOn = null; }
}

// Contenu d'un coffre au trésor.
export function openTreasure(a, rng = Math.random) {
  a.stats.treasure += 1;
  const locIndex = LOCATIONS.findIndex((l) => l.id === a.loc);
  const loot = [];
  const pearls = Math.round((60 + rng() * 240) * (1 + locIndex * 0.8));
  a.pearls += pearls;
  loot.push({ kind: "pearls", n: pearls, text: `${pearls} perles` });
  const v = rng();
  if (v < 0.3) { a.bait.ver = (a.bait.ver ?? 0) + 10; loot.push({ kind: "bait", text: "10 vers de terre" }); }
  else if (v < 0.5) { a.bait.deluxe = (a.bait.deluxe ?? 0) + 5; loot.push({ kind: "bait", text: "5 appâts deluxe" }); }
  else if (v < 0.6) { a.bait.magique = (a.bait.magique ?? 0) + 2; loot.push({ kind: "bait", text: "2 appâts magiques" }); }
  else if (v < 0.75) {
    const t = TACKLE[Math.floor(rng() * TACKLE.length)];
    a.tackle[t.id] = (a.tackle[t.id] ?? 0) + t.uses;
    loot.push({ kind: "tackle", text: `${t.name} (${t.uses} utilisations)` });
  }
  let blue = 0;
  if (rng() < 0.05 + locIndex * 0.01) { blue = 1; loot.push({ kind: "blue", text: "1 pièce bleue !" }); }
  return { loot, blue };
}

/* ================= Quêtes du capitaine ================= */

export function makeQuests(a, rng = Math.random) {
  const out = [];
  const locs = a.unlocked;
  const pool = FISH.filter((f) => locs.includes(f.loc) && f.rarity <= 2);
  const pickFish = () => pool[Math.floor(rng() * pool.length)];
  if (pool.length) {
    const f = pickFish();
    const n = f.rarity === 0 ? 3 + Math.floor(rng() * 3) : f.rarity === 1 ? 2 : 1;
    out.push({ type: "count", fish: f.id, n, p: 0, done: false, claimed: false, reward: Math.round(f.price * n * 2.2) });
    const g = pickFish();
    const cm = Math.round(g.min + (g.max - g.min) * (0.55 + rng() * 0.25));
    out.push({ type: "size", fish: g.id, cm, n: 1, p: 0, done: false, claimed: false, reward: Math.round(g.price * 4) });
  }
  const loc = locs[Math.floor(rng() * locs.length)];
  const r = 1 + Math.floor(rng() * 2);
  out.push({ type: "rarity", loc, r, n: 1, p: 0, done: false, claimed: false, reward: Math.round(200 * (1 + LOCATIONS.findIndex((l) => l.id === loc)) * r) });
  return out;
}

export function questText(q) {
  if (q.type === "count") return `Attraper ${q.n} × ${fishById(q.fish).name}`;
  if (q.type === "size") return `Attraper un ${fishById(q.fish).name.toLowerCase()} d'au moins ${q.cm} cm`;
  return `Attraper un poisson ${RARITY[q.r].name.toLowerCase()} ou mieux à : ${locById(q.loc).name}`;
}

function progressQuests(a, fish, size) {
  const done = [];
  for (const q of a.quests) {
    if (q.done) continue;
    let hit = false;
    if (q.type === "count" && q.fish === fish.id) hit = true;
    if (q.type === "size" && q.fish === fish.id && size >= q.cm) hit = true;
    if (q.type === "rarity" && fish.loc === q.loc && a.loc === q.loc && fish.rarity >= q.r) hit = true;
    if (!hit) continue;
    q.p += 1;
    if (q.p >= q.n) { q.done = true; q.claimed = true; done.push(q); }
  }
  return done;
}

/* ================= Boutique ================= */

// Renvoie { ok, msg }. `spendBlue` : pour la canne néon (pièces bleues de l'arcade).
export function buyRod(a, id, { blueBalance = 0, spendBlue = () => false } = {}) {
  const rod = RODS.find((r) => r.id === id);
  if (!rod || a.rods.includes(id)) return { ok: false, msg: "Déjà achetée." };
  if (level(a) < rod.lvl) return { ok: false, msg: `Il faut le niveau ${rod.lvl}.` };
  if (a.pearls < rod.price) return { ok: false, msg: "Pas assez de perles." };
  if (rod.blue && blueBalance < rod.blue) return { ok: false, msg: `Il faut aussi ${rod.blue} pièces bleues.` };
  if (rod.blue && !spendBlue(rod.blue)) return { ok: false, msg: "Pas assez de pièces bleues." };
  a.pearls -= rod.price;
  a.rods.push(id);
  a.rod = id;
  return { ok: true, msg: `${rod.name} achetée et équipée !` };
}

export function equipRod(a, id) {
  if (!a.rods.includes(id)) return false;
  a.rod = id;
  a.tackleOn = a.tackleOn.slice(0, rodById(id).slots);
  return true;
}

export function buyBait(a, id) {
  const b = baitById(id);
  if (!b) return { ok: false };
  if (level(a) < b.lvl) return { ok: false, msg: `Il faut le niveau ${b.lvl}.` };
  if (a.pearls < b.price) return { ok: false, msg: "Pas assez de perles." };
  a.pearls -= b.price;
  a.bait[id] = (a.bait[id] ?? 0) + b.n;
  if (!a.baitOn) a.baitOn = id;
  return { ok: true, msg: `${b.n} × ${b.name}.` };
}

export function buyTackle(a, id) {
  const t = tackleById(id);
  if (!t) return { ok: false };
  if (level(a) < t.lvl) return { ok: false, msg: `Il faut le niveau ${t.lvl}.` };
  if (a.pearls < t.price) return { ok: false, msg: "Pas assez de perles." };
  a.pearls -= t.price;
  a.tackle[id] = (a.tackle[id] ?? 0) + t.uses;
  if (!a.tackleOn.includes(id) && a.tackleOn.length < rodById(a.rod).slots) a.tackleOn.push(id);
  return { ok: true, msg: `${t.name} : +${t.uses} utilisations.` };
}

export function toggleTackle(a, id) {
  if (a.tackleOn.includes(id)) { a.tackleOn = a.tackleOn.filter((x) => x !== id); return true; }
  if (!a.tackle[id] || a.tackleOn.length >= rodById(a.rod).slots) return false;
  a.tackleOn.push(id);
  return true;
}

export function unlockLoc(a, id) {
  const l = locById(id);
  if (!l || a.unlocked.includes(id)) return { ok: false };
  if (level(a) < l.lvl) return { ok: false, msg: `Il faut le niveau ${l.lvl}.` };
  if (a.pearls < l.price) return { ok: false, msg: "Pas assez de perles." };
  a.pearls -= l.price;
  a.unlocked.push(id);
  a.loc = id;
  return { ok: true, msg: `Nouveau lieu : ${l.name} !` };
}

export function buyTotem(a) {
  if (a.totem || a.weather === "rain") return { ok: false, msg: "Il pleut déjà." };
  if (a.pearls < RAIN_TOTEM.price) return { ok: false, msg: "Pas assez de perles." };
  a.pearls -= RAIN_TOTEM.price;
  a.totem = true;
  return { ok: true, msg: "Les nuages arrivent… il pleut !" };
}
