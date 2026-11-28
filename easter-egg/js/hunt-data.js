// js/hunt-data.js — données de « Chasse aux Titans » : types, attaques, talents, objets, créatures, zones et dresseurs.
// Aucune logique ici (voir hunt.js) : seulement des tableaux faciles à relire et à équilibrer.

/* =========================================================
   TYPES — 14 types et leur table d'efficacité
========================================================= */

export const TYPES = {
  chrome: { name: "Chrome", color: "#b9b6c8" },
  plasma: { name: "Plasma", color: "#ff6a3d" },
  hydro:  { name: "Hydro",  color: "#3a9bff" },
  bio:    { name: "Bio",    color: "#4ccf6a" },
  volt:   { name: "Volt",   color: "#fcee0a" },
  cryo:   { name: "Cryo",   color: "#8ff0ff" },
  impact: { name: "Impact", color: "#e0603a" },
  virus:  { name: "Virus",  color: "#b65ce6" },
  seisme: { name: "Séisme", color: "#d4a656" },
  aero:   { name: "Aéro",   color: "#9fb8ff" },
  psi:    { name: "Psi",    color: "#ff5ab0" },
  glitch: { name: "Glitch", color: "#8a6cff" },
  acier:  { name: "Acier",  color: "#9fb3c4" },
  neant:  { name: "Néant",  color: "#a27bb0" }
};
export const TYPE_IDS = Object.keys(TYPES);

// CHART[attaque][défense] = multiplicateur (absent = ×1).
const S = 2, R = 0.5, X = 0;
export const CHART = {
  chrome: { glitch: X, acier: R },
  plasma: { plasma: R, hydro: R, bio: S, cryo: S, acier: S },
  hydro:  { plasma: S, hydro: R, bio: R, seisme: S },
  bio:    { plasma: R, hydro: S, bio: R, virus: R, seisme: S, aero: R, acier: R },
  volt:   { hydro: S, volt: R, bio: R, seisme: X, aero: S },
  cryo:   { plasma: R, hydro: R, bio: S, cryo: R, seisme: S, aero: S, acier: R },
  impact: { chrome: S, cryo: S, virus: R, aero: R, psi: R, glitch: X, neant: S, acier: S },
  virus:  { bio: S, virus: R, seisme: R, glitch: R, acier: X },
  seisme: { plasma: S, volt: S, bio: R, virus: S, aero: X, acier: S },
  aero:   { volt: R, bio: S, impact: S, acier: R },
  psi:    { impact: S, virus: S, psi: R, neant: X, acier: R },
  glitch: { chrome: X, psi: S, glitch: S, neant: R },
  acier:  { plasma: R, hydro: R, volt: R, cryo: S, acier: R },
  neant:  { impact: R, psi: S, glitch: S, neant: R }
};

/* =========================================================
   ATTAQUES
   cat : "phys" (Atq / Déf), "spec" (Atq Spé / Déf Spé) ou "stat" (aucun dégât)
   acc : précision en % (null = touche toujours) · pri : priorité · c : attaque de contact · crit : taux critique élevé
   fx  : effets — st (statut adverse), fs (stats adverses), ss (stats du lanceur), dr (drain), rc (contrecoup),
         hl (soin), pr (protection), fl (peur), wx (météo), lc (vampigraine), hz (pièges), rest (repos)
========================================================= */

const M = (id, name, type, cat, pow, acc, pp, o = {}) => ({ id, name, type, cat, pow, acc, pp, pri: 0, c: false, crit: 0, fx: [], ...o });

const LIST = [
  // Chrome
  M("charge", "Charge", "chrome", "phys", 40, 100, 35, { c: true }),
  M("vivattaque", "Vive-Attaque", "chrome", "phys", 40, 100, 30, { pri: 1, c: true }),
  M("coupdboule", "Coup d'Boule", "chrome", "phys", 70, 100, 15, { c: true, fx: [{ k: "fl", ch: 0.3 }] }),
  M("plaquage", "Plaquage", "chrome", "phys", 85, 100, 15, { c: true, fx: [{ k: "st", s: "par", ch: 0.3 }] }),
  M("tranche", "Tranche", "chrome", "phys", 70, 100, 20, { c: true, crit: 1 }),
  M("belier", "Bélier", "chrome", "phys", 120, 100, 15, { c: true, fx: [{ k: "rc", f: 1 / 3 }] }),
  M("regardnoir", "Groz'Yeux", "chrome", "stat", 0, 100, 30, { fx: [{ k: "fs", st: { def: -1 } }] }),
  M("rugissement", "Rugissement", "chrome", "stat", 0, 100, 40, { fx: [{ k: "fs", st: { atk: -1 } }] }),
  M("dansesabre", "Danse-Lames", "chrome", "stat", 0, null, 20, { fx: [{ k: "ss", st: { atk: 2 } }] }),
  M("overclock", "Overclock", "chrome", "stat", 0, null, 20, { fx: [{ k: "ss", st: { spe: 2 } }] }),
  M("abri", "Abri", "chrome", "stat", 0, null, 10, { pri: 4, fx: [{ k: "pr" }] }),
  M("reparation", "Réparation", "chrome", "stat", 0, null, 10, { fx: [{ k: "hl", f: 0.5 }] }),
  M("bruitblanc", "Bruit Blanc", "chrome", "stat", 0, 60, 20, { fx: [{ k: "st", s: "conf" }] }),
  // Plasma
  M("flammeche", "Flammèche", "plasma", "spec", 40, 100, 25, { fx: [{ k: "st", s: "brn", ch: 0.1 }] }),
  M("lanceflammes", "Lance-Flammes", "plasma", "spec", 90, 100, 15, { fx: [{ k: "st", s: "brn", ch: 0.1 }] }),
  M("deflagration", "Déflagration", "plasma", "spec", 110, 85, 5, { fx: [{ k: "st", s: "brn", ch: 0.1 }] }),
  M("poingfeu", "Poing de Feu", "plasma", "phys", 75, 100, 15, { c: true, fx: [{ k: "st", s: "brn", ch: 0.1 }] }),
  M("nitrocharge", "Nitrocharge", "plasma", "phys", 50, 100, 20, { c: true, fx: [{ k: "ss", st: { spe: 1 } }] }),
  M("boutefeu", "Boutefeu", "plasma", "phys", 120, 100, 15, { c: true, fx: [{ k: "rc", f: 1 / 3 }, { k: "st", s: "brn", ch: 0.1 }] }),
  M("feufollet", "Feu Follet", "plasma", "stat", 0, 85, 15, { fx: [{ k: "st", s: "brn" }] }),
  M("zenith", "Zénith", "plasma", "stat", 0, null, 5, { fx: [{ k: "wx", w: "sun" }] }),
  // Hydro
  M("pistolet", "Pistolet à O", "hydro", "spec", 40, 100, 25),
  M("surf", "Surf", "hydro", "spec", 90, 100, 15),
  M("hydrocanon", "Hydrocanon", "hydro", "spec", 110, 80, 5),
  M("ebullition", "Ébullition", "hydro", "spec", 80, 100, 15, { fx: [{ k: "st", s: "brn", ch: 0.3 }] }),
  M("aquajet", "Aqua-Jet", "hydro", "phys", 40, 100, 20, { pri: 1, c: true }),
  M("cascade", "Cascade", "hydro", "phys", 80, 100, 15, { c: true, fx: [{ k: "fl", ch: 0.2 }] }),
  M("dansepluie", "Danse Pluie", "hydro", "stat", 0, null, 5, { fx: [{ k: "wx", w: "rain" }] }),
  // Bio
  M("fouetlianes", "Fouet Lianes", "bio", "phys", 45, 100, 25, { c: true }),
  M("gigasangsue", "Giga-Sangsue", "bio", "spec", 75, 100, 10, { fx: [{ k: "dr", f: 0.5 }] }),
  M("lamefeuille", "Lame-Feuille", "bio", "phys", 90, 100, 15, { c: true, crit: 1 }),
  M("energiball", "Éco-Sphère", "bio", "spec", 90, 100, 10, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.1 }] }),
  M("vampigraine", "Vampigraine", "bio", "stat", 0, 90, 10, { fx: [{ k: "lc" }] }),
  M("poudredodo", "Poudre Dodo", "bio", "stat", 0, 75, 15, { fx: [{ k: "st", s: "slp" }] }),
  M("synthese", "Synthèse", "bio", "stat", 0, null, 5, { fx: [{ k: "hl", f: 0.5, sun: true }] }),
  // Volt
  M("eclair", "Éclair", "volt", "spec", 40, 100, 30, { fx: [{ k: "st", s: "par", ch: 0.1 }] }),
  M("tonnerre", "Tonnerre", "volt", "spec", 90, 100, 15, { fx: [{ k: "st", s: "par", ch: 0.1 }] }),
  M("fatalfoudre", "Fatal-Foudre", "volt", "spec", 110, 70, 10, { rainSure: true, fx: [{ k: "st", s: "par", ch: 0.3 }] }),
  M("poingeclair", "Poing-Éclair", "volt", "phys", 75, 100, 15, { c: true, fx: [{ k: "st", s: "par", ch: 0.1 }] }),
  M("etincelle", "Étincelle", "volt", "phys", 65, 100, 20, { c: true, fx: [{ k: "st", s: "par", ch: 0.3 }] }),
  M("electacle", "Électacle", "volt", "phys", 120, 100, 15, { c: true, fx: [{ k: "rc", f: 1 / 3 }, { k: "st", s: "par", ch: 0.1 }] }),
  M("cageeclair", "Cage-Éclair", "volt", "stat", 0, 90, 20, { fx: [{ k: "st", s: "par" }] }),
  // Cryo
  M("poudreuse", "Poudreuse", "cryo", "spec", 40, 100, 25, { fx: [{ k: "st", s: "frz", ch: 0.1 }] }),
  M("ventglace", "Vent Glace", "cryo", "spec", 55, 95, 15, { fx: [{ k: "fs", st: { spe: -1 } }] }),
  M("laserglace", "Laser Glace", "cryo", "spec", 90, 100, 10, { fx: [{ k: "st", s: "frz", ch: 0.1 }] }),
  M("blizzard", "Blizzard", "cryo", "spec", 110, 70, 5, { hailSure: true, fx: [{ k: "st", s: "frz", ch: 0.1 }] }),
  M("eclatsglace", "Éclats Glace", "cryo", "phys", 40, 100, 30, { pri: 1 }),
  M("crocsgivre", "Crocs Givre", "cryo", "phys", 65, 95, 15, { c: true, fx: [{ k: "st", s: "frz", ch: 0.1 }, { k: "fl", ch: 0.1 }] }),
  M("stalactite", "Stalactite", "cryo", "phys", 85, 90, 10, { fx: [{ k: "fl", ch: 0.3 }] }),
  M("grele", "Grêle", "cryo", "stat", 0, null, 10, { fx: [{ k: "wx", w: "hail" }] }),
  // Impact
  M("poingkarate", "Poing Karaté", "impact", "phys", 50, 100, 25, { c: true, crit: 1 }),
  M("machpunch", "Mach Punch", "impact", "phys", 40, 100, 30, { pri: 1, c: true }),
  M("cassebrique", "Casse-Brique", "impact", "phys", 75, 100, 15, { c: true }),
  M("dynamopoing", "Dynamopoing", "impact", "phys", 100, 50, 5, { c: true, fx: [{ k: "st", s: "conf" }] }),
  M("closecombat", "Close Combat", "impact", "phys", 120, 100, 5, { c: true, fx: [{ k: "ss", st: { def: -1, spd: -1 } }] }),
  M("aurasphere", "Aurasphère", "impact", "spec", 80, null, 20),
  M("gonflette", "Gonflette", "impact", "stat", 0, null, 20, { fx: [{ k: "ss", st: { atk: 1, def: 1 } }] }),
  // Virus
  M("dardvenin", "Dard-Venin", "virus", "phys", 15, 100, 35, { fx: [{ k: "st", s: "psn", ch: 0.3 }] }),
  M("acide", "Acide", "virus", "spec", 40, 100, 30, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.1 }] }),
  M("bombbeurk", "Bomb-Beurk", "virus", "spec", 90, 100, 10, { fx: [{ k: "st", s: "psn", ch: 0.3 }] }),
  M("directtoxik", "Direct Toxik", "virus", "phys", 80, 100, 20, { c: true, fx: [{ k: "st", s: "psn", ch: 0.3 }] }),
  M("toxik", "Toxik", "virus", "stat", 0, 90, 10, { fx: [{ k: "st", s: "psn" }] }),
  // Séisme
  M("tirdeboue", "Tir de Boue", "seisme", "spec", 55, 95, 15, { fx: [{ k: "fs", st: { spe: -1 } }] }),
  M("pietisol", "Piétisol", "seisme", "phys", 60, 100, 20, { fx: [{ k: "fs", st: { spe: -1 } }] }),
  M("seisme", "Séisme", "seisme", "phys", 100, 100, 10),
  M("telluriforce", "Telluriforce", "seisme", "spec", 90, 100, 10, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.1 }] }),
  M("tempetesable", "Tempête de Sable", "seisme", "stat", 0, null, 10, { fx: [{ k: "wx", w: "sand" }] }),
  // Aéro
  M("picpic", "Picpic", "aero", "phys", 35, 100, 35, { c: true }),
  M("cruaile", "Cru-Ailes", "aero", "phys", 60, 100, 35, { c: true }),
  M("aeropique", "Aéropique", "aero", "phys", 60, null, 20, { c: true }),
  M("lamedair", "Lame d'Air", "aero", "spec", 75, 95, 15, { fx: [{ k: "fl", ch: 0.3 }] }),
  M("rapace", "Rapace", "aero", "phys", 120, 100, 15, { c: true, fx: [{ k: "rc", f: 1 / 3 }] }),
  M("atterrissage", "Atterrissage", "aero", "stat", 0, null, 10, { fx: [{ k: "hl", f: 0.5 }] }),
  // Psi
  M("chocmental", "Choc Mental", "psi", "spec", 50, 100, 25, { fx: [{ k: "st", s: "conf", ch: 0.1 }] }),
  M("psyko", "Psyko", "psi", "spec", 90, 100, 10, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.1 }] }),
  M("psykoudboul", "Psykoud'Boul", "psi", "phys", 80, 90, 15, { c: true, fx: [{ k: "fl", ch: 0.2 }] }),
  M("hypnose", "Hypnose", "psi", "stat", 0, 60, 20, { fx: [{ k: "st", s: "slp" }] }),
  M("plenitude", "Plénitude", "psi", "stat", 0, null, 20, { fx: [{ k: "ss", st: { spa: 1, spd: 1 } }] }),
  M("repos", "Repos", "psi", "stat", 0, null, 5, { fx: [{ k: "rest" }] }),
  // Glitch
  M("lechouille", "Léchouille", "glitch", "phys", 30, 100, 30, { c: true, fx: [{ k: "st", s: "par", ch: 0.3 }] }),
  M("ombreportee", "Ombre Portée", "glitch", "phys", 40, 100, 30, { pri: 1, c: true }),
  M("griffeombre", "Griffe Ombre", "glitch", "phys", 70, 100, 15, { c: true, crit: 1 }),
  M("ballombre", "Ball'Ombre", "glitch", "spec", 80, 100, 15, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.2 }] }),
  M("ondefolie", "Onde Folie", "glitch", "stat", 0, 100, 10, { fx: [{ k: "st", s: "conf" }] }),
  // Acier
  M("griffeacier", "Griffe Acier", "acier", "phys", 50, 95, 35, { c: true, fx: [{ k: "ss", st: { atk: 1 }, ch: 0.1 }] }),
  M("tetedefer", "Tête de Fer", "acier", "phys", 80, 100, 15, { c: true, fx: [{ k: "fl", ch: 0.3 }] }),
  M("poingmeteore", "Poing Météore", "acier", "phys", 90, 90, 10, { c: true, fx: [{ k: "ss", st: { atk: 1 }, ch: 0.2 }] }),
  M("luminocanon", "Luminocanon", "acier", "spec", 80, 100, 10, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.1 }] }),
  M("murdefer", "Mur de Fer", "acier", "stat", 0, null, 15, { fx: [{ k: "ss", st: { def: 2 } }] }),
  M("pics", "Pics de Données", "acier", "stat", 0, null, 20, { fx: [{ k: "hz" }] }),
  // Néant
  M("morsure", "Morsure", "neant", "phys", 60, 100, 25, { c: true, fx: [{ k: "fl", ch: 0.3 }] }),
  M("machouille", "Mâchouille", "neant", "phys", 80, 100, 15, { c: true, fx: [{ k: "fs", st: { def: -1 }, ch: 0.2 }] }),
  M("tranchenuit", "Tranche-Nuit", "neant", "phys", 70, 100, 15, { c: true, crit: 1 }),
  M("vibrobscur", "Vibrobscur", "neant", "spec", 80, 100, 15, { fx: [{ k: "fl", ch: 0.2 }] }),
  M("machination", "Machination", "neant", "stat", 0, null, 20, { fx: [{ k: "ss", st: { spa: 2 } }] }),
  // Attaques signature des Titans
  M("fulgurance", "Fulgurance", "volt", "spec", 120, 100, 5, { fx: [{ k: "st", s: "par", ch: 0.3 }] }),
  M("fournaise", "Fournaise Primordiale", "plasma", "spec", 120, 95, 5, { fx: [{ k: "st", s: "brn", ch: 0.3 }] }),
  M("zeroabsolu", "Zéro Absolu", "cryo", "spec", 120, 95, 5, { fx: [{ k: "st", s: "frz", ch: 0.2 }] }),
  M("forgetitan", "Forge Titanique", "acier", "phys", 120, 100, 5, { c: true, fx: [{ k: "ss", st: { def: 1 } }] }),
  M("extinction", "Extinction", "neant", "spec", 140, 90, 5, { fx: [{ k: "fs", st: { spd: -1 }, ch: 0.3 }] })
];

export const MOVES = Object.fromEntries(LIST.map((m) => [m.id, m]));

/* =========================================================
   STATUTS, MÉTÉO, TALENTS, OBJETS
========================================================= */

export const STATUS = {
  brn: { name: "Brûlé", short: "BRÛ", color: "#ff6a3d" },
  par: { name: "Paralysé", short: "PAR", color: "#fcee0a" },
  psn: { name: "Empoisonné", short: "PSN", color: "#b65ce6" },
  slp: { name: "Endormi", short: "SOM", color: "#9fb8ff" },
  frz: { name: "Gelé", short: "GEL", color: "#8ff0ff" }
};

export const WEATHER = {
  sun:  { name: "Soleil ardent", start: "Le soleil tape fort !", end: "Le soleil s'est voilé." },
  rain: { name: "Pluie acide", start: "Une pluie acide se met à tomber !", end: "La pluie s'est arrêtée." },
  sand: { name: "Tempête de silice", start: "Une tempête de silice se lève !", end: "La tempête s'est calmée." },
  hail: { name: "Grêle cryo", start: "Il commence à grêler !", end: "La grêle s'est arrêtée." }
};

export const STAT_NAMES = { atk: "Attaque", def: "Défense", spa: "Atq. Spé", spd: "Déf. Spé", spe: "Vitesse" };

export const ABILITIES = {
  surchauffe:   { name: "Surchauffe", desc: "Attaques Plasma ×1,5 quand il lui reste 1/3 de ses PV ou moins.", pinch: "plasma" },
  torrent:      { name: "Torrent", desc: "Attaques Hydro ×1,5 quand il lui reste 1/3 de ses PV ou moins.", pinch: "hydro" },
  photosynthese: { name: "Photosynthèse", desc: "Attaques Bio ×1,5 quand il lui reste 1/3 de ses PV ou moins.", pinch: "bio" },
  impudence:    { name: "Impudence", desc: "Chaque K.O. infligé augmente son Attaque." },
  turbo:        { name: "Turbo", desc: "Sa Vitesse augmente à la fin de chaque tour." },
  statique:     { name: "Statique", desc: "30 % de chances de paralyser qui le frappe au contact." },
  corpsardent:  { name: "Corps Ardent", desc: "30 % de chances de brûler qui le frappe au contact." },
  gardemagique: { name: "Garde Magique", desc: "Ne subit que les dégâts directs (pas de poison, météo, contrecoup…)." },
  fermete:      { name: "Fermeté", desc: "Résiste à un coup fatal avec 1 PV s'il avait tous ses PV." },
  levitation:   { name: "Lévitation", desc: "Flotte : immunisé contre les attaques Séisme." },
  isograisse:   { name: "Isograisse", desc: "Divise par deux les dégâts Plasma et Cryo reçus." },
  regenerateur: { name: "Régénérateur", desc: "Récupère 1/3 de ses PV quand il quitte le combat." },
  ensablement:  { name: "Ensablement", desc: "Déclenche une tempête de silice en entrant." },
  secheresse:   { name: "Sécheresse", desc: "Déclenche un soleil ardent en entrant." },
  blizzardeur:  { name: "Blizzardeur", desc: "Déclenche la grêle en entrant." },
  intimidation: { name: "Intimidation", desc: "Baisse l'Attaque de l'adversaire en entrant." },
  sniper:       { name: "Sniper", desc: "Ses coups critiques font ×2,25 au lieu de ×1,5." },
  absorbevolt:  { name: "Absorbe-Volt", desc: "Les attaques Volt le soignent au lieu de le blesser." },
  adaptabilite: { name: "Adaptabilité", desc: "Bonus de type ×2 au lieu de ×1,5." }
};

// Objets du sac (combat) et objets à tenir. price en trophées ✦.
export const ITEMS = {
  potion:      { name: "Potion", price: 150, cat: "heal", heal: 30, desc: "Rend 30 PV." },
  superpotion: { name: "Super Potion", price: 500, cat: "heal", heal: 80, desc: "Rend 80 PV." },
  hyperpotion: { name: "Hyper Potion", price: 1200, cat: "heal", heal: 200, desc: "Rend 200 PV." },
  potionmax:   { name: "Potion Max", price: 2500, cat: "heal", heal: 9999, desc: "Rend tous les PV." },
  totalsoin:   { name: "Total Soin", price: 400, cat: "cure", desc: "Soigne le statut (brûlure, poison, sommeil…)." },
  rappel:      { name: "Rappel", price: 1500, cat: "revive", desc: "Ranime une créature K.O. avec la moitié de ses PV." },
  elixir:      { name: "Élixir", price: 1500, cat: "pp", desc: "Rend 10 PP à chaque attaque." },
  stimatk:     { name: "Stimulant Atq", price: 600, cat: "boost", st: "atk", desc: "Attaque +2 jusqu'à la fin du combat (ou au changement)." },
  stimspa:     { name: "Stimulant Spé", price: 600, cat: "boost", st: "spa", desc: "Atq. Spé +2." },
  stimdef:     { name: "Stimulant Déf", price: 600, cat: "boost", st: "def", desc: "Défense +2." },
  stimspe:     { name: "Stimulant Vit", price: 600, cat: "boost", st: "spe", desc: "Vitesse +2." },
  module:      { name: "Module de capture", price: 200, cat: "ball", rate: 1, desc: "Capture une créature sauvage affaiblie." },
  supermodule: { name: "Super Module", price: 600, cat: "ball", rate: 1.5, desc: "Taux de capture ×1,5." },
  hypermodule: { name: "Hyper Module", price: 1200, cat: "ball", rate: 2, desc: "Taux de capture ×2." },
  moduletitan: { name: "Module Titan", price: 8000, cat: "ball", rate: 4, desc: "Taux de capture ×4 : fait pour les Titans." },
  // Objets tenus
  restes:      { name: "Restes", price: 9000, cat: "held", desc: "Rend 1/16 des PV à chaque fin de tour." },
  orbevie:     { name: "Orbe Vie", price: 12000, cat: "held", desc: "Attaques ×1,3, mais coûte 1/10 des PV à chaque coup." },
  ceinture:    { name: "Ceinture Force", price: 7000, cat: "held", desc: "Survit à un coup fatal avec 1 PV si ses PV étaient au max (1 fois par combat)." },
  baie:        { name: "Baie Sitrus", price: 3000, cat: "held", desc: "Rend 1/4 des PV sous la moitié des PV (1 fois par combat)." },
  lentille:    { name: "Lentille Viseur", price: 6000, cat: "held", desc: "Augmente le taux de coups critiques." },
  bandeau:     { name: "Bandeau Muscle", price: 8000, cat: "held", desc: "Attaques physiques ×1,2." },
  lunettes:    { name: "Lunettes Sages", price: 8000, cat: "held", desc: "Attaques spéciales ×1,2." },
  gilet:       { name: "Veste de Combat", price: 10000, cat: "held", desc: "Déf. Spé ×1,5." }
};
export const ITEM_IDS = Object.keys(ITEMS);

/* =========================================================
   CRÉATURES
   base : [PV, Atq, Déf, Atq Spé, Déf Spé, Vit] · rate : taux de capture (3 à 255) · xp : expérience de base
   shape : silhouette du sprite (voir hunt-art.js) · col : [couleur principale, couleur secondaire]
   evo : [niveau, espèce] · line : liste d'attaques partagée par toute la lignée
========================================================= */

const LEARN = {
  braise: [[1, "charge"], [1, "rugissement"], [5, "flammeche"], [9, "vivattaque"], [12, "poingfeu"], [18, "nitrocharge"], [22, "dansesabre"], [28, "lanceflammes"], [33, "cassebrique"], [40, "boutefeu"], [46, "closecombat"], [52, "deflagration"]],
  aqua: [[1, "charge"], [1, "regardnoir"], [5, "pistolet"], [9, "abri"], [13, "aquajet"], [18, "cascade"], [22, "dansepluie"], [28, "surf"], [32, "griffeacier"], [38, "luminocanon"], [44, "murdefer"], [48, "hydrocanon"]],
  pousse: [[1, "charge"], [1, "rugissement"], [5, "fouetlianes"], [9, "vampigraine"], [14, "gigasangsue"], [18, "poudredodo"], [22, "lamefeuille"], [26, "synthese"], [30, "energiball"], [34, "pietisol"], [40, "seisme"], [48, "telluriforce"]],
  rat: [[1, "charge"], [1, "vivattaque"], [4, "regardnoir"], [8, "morsure"], [13, "coupdboule"], [17, "overclock"], [22, "tranche"], [27, "machouille"], [34, "belier"], [40, "dansesabre"]],
  piaf: [[1, "charge"], [1, "picpic"], [5, "rugissement"], [9, "vivattaque"], [14, "cruaile"], [19, "aeropique"], [24, "atterrissage"], [30, "lamedair"], [38, "rapace"], [44, "overclock"]],
  volt: [[1, "charge"], [1, "eclair"], [4, "rugissement"], [8, "cageeclair"], [11, "vivattaque"], [15, "etincelle"], [20, "overclock"], [24, "poingeclair"], [30, "tonnerre"], [38, "electacle"], [44, "fatalfoudre"]],
  larve: [[1, "charge"], [1, "dardvenin"], [7, "murdefer"], [12, "chocmental"], [13, "poudredodo"], [15, "acide"], [19, "lamedair"], [24, "bombbeurk"], [30, "psyko"], [36, "plenitude"]],
  roc: [[1, "charge"], [1, "murdefer"], [6, "pietisol"], [10, "coupdboule"], [14, "pics"], [18, "tetedefer"], [22, "tempetesable"], [30, "seisme"], [36, "poingmeteore"], [42, "belier"]],
  fantome: [[1, "lechouille"], [1, "ondefolie"], [8, "ombreportee"], [12, "hypnose"], [18, "bombbeurk"], [24, "ballombre"], [30, "machination"], [34, "vibrobscur"], [42, "psyko"]],
  cryo: [[1, "charge"], [1, "poudreuse"], [5, "pistolet"], [9, "eclatsglace"], [14, "ventglace"], [18, "aquajet"], [22, "crocsgivre"], [26, "grele"], [30, "surf"], [34, "laserglace"], [42, "blizzard"], [46, "repos"]],
  box: [[1, "poingkarate"], [1, "regardnoir"], [7, "machpunch"], [12, "gonflette"], [17, "cassebrique"], [21, "poingfeu"], [25, "poingeclair"], [30, "dynamopoing"], [38, "closecombat"], [44, "poingmeteore"]],
  psy: [[1, "charge"], [1, "chocmental"], [5, "rugissement"], [10, "hypnose"], [16, "psykoudboul"], [20, "plenitude"], [26, "psyko"], [32, "ballombre"], [36, "repos"], [42, "aurasphere"]],
  sable: [[1, "charge"], [1, "tempetesable"], [6, "pietisol"], [12, "tranche"], [16, "griffeacier"], [22, "regardnoir"], [28, "seisme"], [34, "tranchenuit"], [40, "dansesabre"]],
  cendre: [[1, "flammeche"], [1, "picpic"], [1, "cruaile"], [20, "nitrocharge"], [26, "feufollet"], [30, "lanceflammes"], [34, "lamedair"], [38, "zenith"], [46, "deflagration"], [50, "rapace"]],
  myco: [[1, "fouetlianes"], [1, "dardvenin"], [5, "acide"], [9, "vampigraine"], [14, "gigasangsue"], [18, "poudredodo"], [22, "bombbeurk"], [26, "synthese"], [30, "energiball"], [34, "toxik"]],
  fer: [[1, "charge"], [1, "murdefer"], [5, "griffeacier"], [12, "regardnoir"], [18, "tetedefer"], [22, "pics"], [26, "gonflette"], [34, "poingmeteore"], [40, "belier"], [46, "seisme"]],
  draco: [[1, "morsure"], [1, "regardnoir"], [10, "cruaile"], [16, "tranchenuit"], [22, "dansesabre"], [28, "machouille"], [34, "poingfeu"], [42, "seisme"], [50, "rapace"], [55, "vibrobscur"]],
  lumi: [[1, "eclair"], [1, "picpic"], [20, "cageeclair"], [24, "etincelle"], [28, "lamedair"], [32, "tonnerre"], [38, "atterrissage"], [44, "fatalfoudre"]],
  lynx: [[1, "morsure"], [1, "vivattaque"], [20, "regardnoir"], [24, "griffeombre"], [28, "tranchenuit"], [32, "machouille"], [38, "dansesabre"], [44, "psykoudboul"], [50, "closecombat"]],
  marmo: [[1, "pistolet"], [1, "tirdeboue"], [16, "aquajet"], [22, "cascade"], [28, "pietisol"], [34, "seisme"], [40, "surf"], [46, "repos"]],
  givre: [[1, "eclatsglace"], [1, "griffeacier"], [30, "crocsgivre"], [34, "tetedefer"], [38, "stalactite"], [42, "dansesabre"], [48, "poingmeteore"]],
  poupix: [[1, "lechouille"], [1, "ombreportee"], [8, "ondefolie"], [14, "griffeombre"], [20, "psykoudboul"], [26, "dansesabre"], [32, "tranchenuit"], [38, "ballombre"]],
  fulgur: [[1, "tonnerre"], [1, "cageeclair"], [1, "luminocanon"], [1, "overclock"], [50, "fulgurance"]],
  pyro: [[1, "lanceflammes"], [1, "telluriforce"], [1, "feufollet"], [1, "machination"], [50, "fournaise"]],
  glace: [[1, "laserglace"], [1, "psyko"], [1, "plenitude"], [1, "repos"], [50, "zeroabsolu"]],
  alpha: [[1, "seisme"], [1, "poingmeteore"], [1, "pics"], [1, "murdefer"], [55, "forgetitan"]],
  omega: [[1, "vibrobscur"], [1, "ballombre"], [1, "machination"], [1, "aurasphere"], [65, "extinction"]]
};

const SP = (id, name, types, base, ability, rate, xp, shape, col, line, evo, desc) => ({ id, name, types, base, ability, rate, xp, shape, col, line, evo, desc });

const SPECIES_LIST = [
  SP("braisinet", "Braisinet", ["plasma"], [39, 52, 43, 60, 50, 65], "surchauffe", 45, 62, "quad", ["#ff6a3d", "#3a2626"], "braise", [16, "fournaxe"], "Un petit lézard dont le réacteur dorsal crépite quand il est content."),
  SP("fournaxe", "Fournaxe", ["plasma"], [58, 64, 58, 80, 65, 80], "surchauffe", 45, 142, "quad", ["#ff5a2a", "#4a2020"], "braise", [36, "volcanyx"], "Ses griffes chauffées à blanc découpent l'acier."),
  SP("volcanyx", "Volcanyx", ["plasma", "impact"], [78, 104, 78, 100, 78, 95], "surchauffe", 45, 240, "biped", ["#ff4a1a", "#2a1616"], "braise", null, "Un guerrier de magma. Ses poings atteignent 3 000 degrés."),
  SP("aquabit", "Aquabit", ["hydro"], [44, 48, 65, 50, 64, 43], "torrent", 45, 63, "fish", ["#3a9bff", "#12304a"], "aqua", [16, "torrentix"], "Un poisson-robot qui refroidit les serveurs de la ville basse."),
  SP("torrentix", "Torrentix", ["hydro"], [59, 63, 80, 65, 80, 58], "torrent", 45, 142, "serpent", ["#2a86f0", "#10284a"], "aqua", [36, "leviacode"], "Il nage dans les canalisations à la vitesse d'un paquet réseau."),
  SP("leviacode", "Léviacode", ["hydro", "acier"], [79, 83, 100, 95, 105, 78], "torrent", 45, 239, "serpent", ["#1f6fd8", "#9fb3c4"], "aqua", null, "Un serpent de mer cuirassé. Ses écailles sont des plaques de blindage."),
  SP("pousseron", "Pousseron", ["bio"], [45, 49, 49, 65, 65, 45], "photosynthese", 45, 64, "blob", ["#4ccf6a", "#1e4a2a"], "pousse", [16, "ronceforge"], "Une graine bionique qui se recharge au soleil."),
  SP("ronceforge", "Ronceforge", ["bio"], [60, 62, 63, 80, 80, 60], "photosynthese", 45, 142, "quad", ["#3cbf5a", "#2a3a1e"], "pousse", [36, "sylvatitan"], "Ses lianes en fibre optique transportent la lumière jusqu'à ses racines."),
  SP("sylvatitan", "Sylvatitan", ["bio", "seisme"], [80, 100, 100, 85, 95, 70], "photosynthese", 45, 236, "golem", ["#2fa04a", "#7a5a30"], "pousse", null, "Une forêt entière vit sur son dos. Le sol tremble à chacun de ses pas."),

  SP("ratzap", "Ratzap", ["chrome"], [30, 56, 35, 25, 35, 72], "impudence", 255, 51, "quad", ["#a8a0b8", "#ff2a6d"], "rat", [20, "ratalpha"], "Il ronge les câbles de la ville. On en trouve partout."),
  SP("ratalpha", "Ratalpha", ["chrome"], [55, 81, 60, 50, 70, 97], "impudence", 127, 145, "quad", ["#8f86a4", "#ff2a6d"], "rat", null, "Le chef de meute. Ses incisives traversent un blindage léger."),
  SP("pixapiaf", "Pixapiaf", ["chrome", "aero"], [40, 45, 40, 35, 35, 56], "turbo", 255, 50, "bird", ["#c9b38a", "#5a4a3a"], "piaf", [18, "drontech"], "Un petit drone-oiseau qui piaille en binaire."),
  SP("drontech", "Drontech", ["chrome", "aero"], [63, 60, 55, 50, 50, 71], "turbo", 120, 122, "bird", ["#b89a6a", "#4a3a2a"], "piaf", [34, "aquilux"], "Il patrouille au-dessus des toits et repère tout ce qui bouge."),
  SP("aquilux", "Aquilux", ["chrome", "aero"], [83, 80, 75, 70, 70, 101], "turbo", 45, 216, "bird", ["#d8b070", "#3a2a1a"], "piaf", null, "Un rapace de chrome. Son piqué dépasse le mur du son."),
  SP("voltik", "Voltik", ["volt"], [35, 55, 40, 50, 50, 90], "statique", 190, 112, "quad", ["#fcee0a", "#3a3010"], "volt", [26, "amperion"], "Une boule de nerfs électrique qui squatte les transformateurs."),
  SP("amperion", "Ampérion", ["volt"], [60, 90, 55, 90, 80, 110], "statique", 75, 218, "quad", ["#ffd700", "#2a2a10"], "volt", null, "Il peut alimenter un quartier entier pendant une nuit."),
  SP("larvabit", "Larvabit", ["virus"], [40, 35, 30, 20, 20, 50], "gardemagique", 255, 39, "bug", ["#b65ce6", "#2a1a3a"], "larve", [7, "coconexe"], "Une larve de code. Elle se nourrit de fichiers corrompus."),
  SP("coconexe", "Cocon.exe", ["virus"], [50, 20, 55, 25, 25, 30], "gardemagique", 120, 72, "blob", ["#9a4ad0", "#2a1a3a"], "larve", [12, "papillonde"], "Il compile en silence. Mieux vaut ne pas l'interrompre."),
  SP("papillonde", "Papillonde", ["virus", "aero"], [60, 45, 50, 90, 80, 70], "gardemagique", 45, 178, "bug", ["#c86cf0", "#3ae0ff"], "larve", null, "Ses ailes répandent une poussière de données hypnotique."),
  SP("rocbot", "Rocbot", ["seisme", "acier"], [40, 80, 100, 30, 30, 20], "fermete", 255, 60, "golem", ["#8a7a6a", "#c8a050"], "roc", [28, "golemax"], "Un robot de chantier abandonné qui s'est mis à vivre."),
  SP("golemax", "Golemax", ["seisme", "acier"], [80, 110, 130, 55, 65, 45], "fermete", 45, 223, "golem", ["#6a5a4a", "#e0b050"], "roc", null, "Une montagne de ferraille. Il ne recule jamais."),
  SP("fantomax", "Fantômax", ["glitch", "virus"], [30, 35, 30, 100, 35, 80], "levitation", 190, 62, "orb", ["#8a6cff", "#20103a"], "fantome", [25, "spectrogrin"], "Un bug d'affichage qui a pris conscience de lui-même."),
  SP("spectrogrin", "Spectrogrin", ["glitch", "virus"], [45, 50, 45, 115, 55, 95], "levitation", 90, 142, "orb", ["#7a5cff", "#1a0a30"], "fantome", [38, "neantome"], "Il se cache dans les écrans éteints et rit tout seul."),
  SP("neantome", "Néantome", ["glitch", "neant"], [60, 65, 60, 130, 75, 110], "levitation", 45, 225, "orb", ["#6a3cff", "#ff2a6d"], "fantome", null, "On dit qu'il a effacé une ville entière du réseau."),
  SP("cryopus", "Cryopus", ["cryo", "hydro"], [65, 45, 55, 45, 70, 45], "isograisse", 190, 58, "blob", ["#8ff0ff", "#2a5a7a"], "cryo", [30, "glaciator"], "Un phoque de liquide de refroidissement. Il adore les glaçons."),
  SP("glaciator", "Glaciator", ["cryo", "hydro"], [95, 75, 90, 85, 95, 65], "isograisse", 75, 180, "quad", ["#7ae0ff", "#1a4a6a"], "cryo", null, "Ses défenses sont des stalactites d'azote liquide."),
  SP("boxbot", "Boxbot", ["impact"], [70, 80, 50, 35, 35, 35], "impudence", 180, 88, "biped", ["#e0603a", "#3a3a4a"], "box", [28, "pugilatron"], "Un robot de sparring qui a refusé de perdre."),
  SP("pugilatron", "Pugilatron", ["impact"], [90, 130, 80, 65, 85, 55], "impudence", 45, 218, "biped", ["#d04a2a", "#2a2a3a"], "box", null, "Champion des arènes clandestines du port. Invaincu."),
  SP("psykitten", "Psykitten", ["psi"], [60, 55, 50, 75, 55, 85], "regenerateur", 190, 66, "quad", ["#ff5ab0", "#3a1a2a"], "psy", [30, "psychatte"], "Un chaton cybernétique qui lit dans les pensées… surtout la faim."),
  SP("psychatte", "Psychatte", ["psi"], [80, 65, 70, 115, 95, 105], "regenerateur", 60, 184, "quad", ["#ff3a9a", "#2a0a1a"], "psy", null, "Ses yeux projettent des hologrammes. Elle pue un peu, mais personne n'ose le dire."),
  SP("sablonyx", "Sablonyx", ["seisme"], [50, 75, 85, 20, 30, 40], "ensablement", 255, 60, "quad", ["#d4a656", "#6a4a2a"], "sable", [30, "dunerax"], "Il se roule en boule et file dans les dunes de silice."),
  SP("dunerax", "Dunérax", ["seisme"], [75, 100, 110, 45, 55, 65], "ensablement", 90, 158, "quad", ["#c89040", "#4a3018"], "sable", null, "Ses griffes creusent un tunnel en quelques secondes."),
  SP("cendrillard", "Cendrillard", ["plasma", "aero"], [65, 75, 60, 95, 70, 100], "corpsardent", 45, 175, "bird", ["#ff8a3d", "#fcee0a"], "cendre", null, "Un oiseau de feu qui niche dans les cheminées des fonderies."),
  SP("mycelix", "Mycélix", ["bio", "virus"], [45, 50, 55, 75, 65, 30], "regenerateur", 255, 64, "blob", ["#7acf4c", "#b65ce6"], "myco", [26, "toxiflore"], "Un champignon qui pousse sur les cartes mères humides."),
  SP("toxiflore", "Toxiflore", ["bio", "virus"], [75, 70, 85, 110, 90, 50], "regenerateur", 75, 184, "blob", ["#5abf3a", "#c84ce6"], "myco", null, "Son parfum fait planter les systèmes de sécurité."),
  SP("ferraille", "Ferraille", ["acier"], [50, 85, 100, 40, 70, 30], "fermete", 190, 70, "golem", ["#9fb3c4", "#3a4a5a"], "fer", [32, "blindocore"], "Un tas de pièces détachées qui s'assemble tout seul."),
  SP("blindocore", "Blindocore", ["acier"], [70, 110, 130, 60, 90, 40], "fermete", 60, 190, "golem", ["#8aa4b8", "#2a3a4a"], "fer", null, "Un char d'assaut vivant. Son cœur est un réacteur."),
  SP("draconet", "Draconet", ["neant"], [41, 64, 45, 50, 50, 50], "impudence", 45, 60, "quad", ["#a27bb0", "#ff2a6d"], "draco", [30, "dracodrive"], "Un bébé dragon très rare. Il mord tout ce qui brille."),
  SP("dracodrive", "Dracodrive", ["neant"], [61, 84, 65, 70, 70, 70], "impudence", 45, 147, "serpent", ["#8a5ba0", "#ff2a6d"], "draco", [48, "dracomega"], "Son corps ondule entre les ondes radio."),
  SP("dracomega", "Dracomega", ["neant", "aero"], [91, 134, 95, 100, 100, 80], "impudence", 45, 270, "dragon", ["#6a3a8a", "#ff2a6d"], "draco", null, "Le roi des cieux pourpres. Il ne se soumet qu'aux plus grands chasseurs."),
  SP("lumiole", "Lumiole", ["volt", "aero"], [55, 60, 55, 95, 75, 105], "statique", 75, 170, "bird", ["#fcee0a", "#3a9bff"], "lumi", null, "Une luciole géante qui guide les drones perdus."),
  SP("ombrelynx", "Ombrelynx", ["neant"], [65, 95, 60, 60, 60, 110], "intimidation", 60, 180, "quad", ["#4a3a5a", "#00f0ff"], "lynx", null, "Un félin furtif. On ne voit que ses yeux cyan dans la nuit."),
  SP("marmolosse", "Marmolosse", ["hydro", "seisme"], [95, 85, 85, 65, 65, 35], "fermete", 90, 172, "quad", ["#4a7aa0", "#8a6a40"], "marmo", null, "Un gros amphibien qui vit dans la boue des égouts."),
  SP("givrelame", "Givrelame", ["cryo", "acier"], [60, 100, 90, 50, 60, 85], "sniper", 60, 182, "biped", ["#bff6ff", "#4a6a8a"], "givre", null, "Un samouraï de glace. Sa lame ne fond jamais."),
  SP("poupix", "Poupix", ["glitch"], [55, 85, 60, 40, 60, 65], "sniper", 120, 70, "biped", ["#9a8aff", "#2a2a3a"], "poupix", [30, "pantinox"], "Une poupée possédée par un vieux programme de jeu."),
  SP("pantinox", "Pantinox", ["glitch", "psi"], [70, 115, 75, 70, 80, 90], "sniper", 45, 185, "biped", ["#7a6aff", "#ff5ab0"], "poupix", null, "Ses fils invisibles contrôlent les machines autour de lui."),
  // Titans légendaires
  SP("fulgurtitan", "Fulgurtitan", ["volt", "acier"], [90, 90, 85, 125, 90, 100], "absorbevolt", 3, 290, "titan", ["#fcee0a", "#3a4a5a"], "fulgur", null, "Le Titan de la foudre. La Centrale fut construite sur sa tanière."),
  SP("pyrotitan", "Pyrotitan", ["plasma", "seisme"], [90, 100, 90, 125, 85, 90], "secheresse", 3, 290, "titan", ["#ff5a1a", "#5a2a10"], "pyro", null, "Le Titan du magma. La Fonderie ne s'est jamais éteinte depuis son réveil."),
  SP("cryotitan", "Cryotitan", ["cryo", "psi"], [90, 85, 100, 125, 95, 85], "blizzardeur", 3, 290, "titan", ["#8ff0ff", "#ff5ab0"], "glace", null, "Le Titan du froid. Il dort sous le Pic depuis mille cycles."),
  SP("titanalpha", "Titan Alpha", ["acier", "seisme"], [100, 130, 140, 90, 100, 60], "fermete", 3, 300, "titan", ["#9fb3c4", "#fcee0a"], "alpha", null, "Le premier des Titans, forgé dans l'acier du premier serveur."),
  SP("titanomega", "Titan Omega", ["neant", "glitch"], [110, 130, 100, 140, 100, 110], "adaptabilite", 3, 340, "titan", ["#2a1a3a", "#ff2a6d"], "omega", null, "Le dernier. Il ne reste de lui que la colère.")
];

for (const s of SPECIES_LIST) s.learn = LEARN[s.line];
export const SPECIES = Object.fromEntries(SPECIES_LIST.map((s, i) => [s.id, { ...s, no: i + 1 }]));
export const SPECIES_IDS = SPECIES_LIST.map((s) => s.id);
export const STARTERS = ["braisinet", "aquabit", "pousseron"];

/* =========================================================
   ZONES, DRESSEURS, GARDIENS, CONSEIL
   wild : [espèce, poids] · lv : niveaux des créatures sauvages · trainers : noms des dresseurs du coin
========================================================= */

export const ZONES = [
  { id: "ruelles", name: "Ruelles Néon", lv: [3, 7], desc: "Les néons grésillent, les rats aussi.",
    wild: [["ratzap", 40], ["pixapiaf", 35], ["larvabit", 20], ["voltik", 5]], trainers: ["Gamin des rues", "Livreur à vélo", "Noctambule"] },
  { id: "egouts", name: "Égouts Hydro", lv: [8, 14], desc: "Des canalisations noyées de liquide de refroidissement.",
    wild: [["aquabit", 5], ["ratzap", 25], ["cryopus", 25], ["marmolosse", 10], ["mycelix", 25], ["coconexe", 10]], trainers: ["Égoutier", "Plongeuse", "Pirate du réseau"] },
  { id: "serres", name: "Serres Bio", lv: [13, 19], desc: "Une jungle hydroponique sous verre.",
    wild: [["mycelix", 30], ["pousseron", 5], ["larvabit", 15], ["psykitten", 20], ["drontech", 20], ["papillonde", 10]], trainers: ["Botaniste", "Apicultrice", "Chercheur fou"] },
  { id: "centrale", name: "Centrale Volt", lv: [19, 25], desc: "Des turbines géantes et l'odeur de l'ozone.",
    wild: [["voltik", 35], ["ferraille", 25], ["boxbot", 20], ["lumiole", 5], ["poupix", 15]], trainers: ["Technicien", "Électricienne", "Ingénieur"] },
  { id: "desert", name: "Désert de Silice", lv: [25, 31], desc: "Du sable de verre à perte de vue, et des tempêtes.",
    wild: [["sablonyx", 35], ["rocbot", 30], ["drontech", 15], ["ratalpha", 15], ["draconet", 5]], trainers: ["Nomade", "Pilleuse d'épaves", "Routier"] },
  { id: "fonderie", name: "Fonderie", lv: [30, 36], desc: "Les hauts fourneaux ne s'arrêtent jamais.",
    wild: [["fournaxe", 5], ["cendrillard", 15], ["ferraille", 25], ["golemax", 10], ["boxbot", 25], ["amperion", 20]], trainers: ["Forgeron", "Soudeuse", "Contremaître"] },
  { id: "pic", name: "Pic Cryo", lv: [35, 41], desc: "Une montagne gelée au-dessus des nuages de smog.",
    wild: [["glaciator", 25], ["givrelame", 15], ["cryopus", 20], ["aquilux", 15], ["dunerax", 15], ["draconet", 10]], trainers: ["Alpiniste", "Skieuse", "Ermite"] },
  { id: "datacentre", name: "Datacentre Hanté", lv: [40, 46], desc: "Des serveurs morts… mais quelque chose y vit encore.",
    wild: [["spectrogrin", 25], ["pantinox", 15], ["psychatte", 15], ["ombrelynx", 15], ["toxiflore", 15], ["dracodrive", 15]], trainers: ["Hackeuse", "Exorciste", "Netrunner"] }
];

// Équipe : [espèce, niveau, attaques (facultatif : sinon les 4 dernières apprises)]
export const LEADERS = [
  { id: "kiro", name: "Kiro", title: "Gardien des Ruelles", type: "chrome", badge: "Badge Chrome", skill: 1, potions: 1, reward: 1200,
    quote: "Dans ces ruelles, seuls les plus rapides survivent !",
    team: [["ratzap", 8], ["pixapiaf", 9], ["ratzap", 11, ["morsure", "vivattaque", "regardnoir", "charge"]]] },
  { id: "maru", name: "Maru", title: "Gardienne des Égouts", type: "hydro", badge: "Badge Flux", skill: 1, potions: 1, reward: 2500,
    quote: "L'eau use la pierre. Mes créatures vont t'user toi.",
    team: [["cryopus", 14], ["marmolosse", 15], ["torrentix", 17, ["cascade", "aquajet", "abri", "regardnoir"]]] },
  { id: "sylva", name: "Sylva", title: "Gardienne des Serres", type: "bio", badge: "Badge Sève", skill: 2, potions: 1, reward: 4500,
    quote: "Patience… le poison fait son œuvre lentement.",
    team: [["mycelix", 20], ["papillonde", 21, ["poudredodo", "bombbeurk", "chocmental", "lamedair"]], ["toxiflore", 23, ["vampigraine", "gigasangsue", "bombbeurk", "synthese"]]] },
  { id: "ohm", name: "Ohm", title: "Gardien de la Centrale", type: "volt", badge: "Badge Ampère", skill: 2, potions: 2, reward: 7000,
    quote: "Un million de volts. Tu tiens combien ?",
    team: [["voltik", 25], ["ferraille", 26], ["lumiole", 27], ["amperion", 29, ["tonnerre", "cageeclair", "overclock", "poingeclair"]]] },
  { id: "duna", name: "Duna", title: "Gardienne du Désert", type: "seisme", badge: "Badge Silice", skill: 2, potions: 2, reward: 10000,
    quote: "La tempête se lève. Tu ne verras même pas d'où viennent les coups.",
    team: [["sablonyx", 31], ["rocbot", 31], ["marmolosse", 32], ["dunerax", 34, ["seisme", "tranchenuit", "dansesabre", "griffeacier"]]] },
  { id: "forgia", name: "Forgia", title: "Gardienne de la Fonderie", type: "plasma", badge: "Badge Brasier", skill: 3, potions: 2, reward: 15000,
    quote: "Ici, on forge des champions. Ou on les fait fondre.",
    team: [["cendrillard", 36], ["blindocore", 37], ["golemax", 37], ["fournaxe", 39, ["lanceflammes", "dansesabre", "nitrocharge", "cassebrique"]]] },
  { id: "neva", name: "Neva", title: "Gardienne du Pic", type: "cryo", badge: "Badge Zéro", skill: 3, potions: 2, reward: 21000,
    quote: "Le froid ralentit tout. Même tes pensées.",
    team: [["cryopus", 41], ["givrelame", 42], ["aquilux", 42], ["glaciator", 44, ["blizzard", "grele", "surf", "repos"]]] },
  { id: "spectra", name: "Spectra", title: "Gardienne du Datacentre", type: "glitch", badge: "Badge Fantôme", skill: 3, potions: 3, reward: 30000,
    quote: "Tu entends les serveurs murmurer ? Ils t'attendaient.",
    team: [["pantinox", 46], ["psychatte", 46], ["toxiflore", 47], ["ombrelynx", 47], ["neantome", 49, ["ballombre", "machination", "vibrobscur", "psyko"]]] }
];

export const COUNCIL = [
  { id: "vex", name: "Vex", title: "Conseil — Virus", type: "virus", skill: 3, potions: 2, reward: 30000,
    quote: "Une fois infecté, on ne guérit jamais vraiment.",
    team: [["toxiflore", 50], ["papillonde", 50], ["neantome", 51], ["mycelix", 50], ["spectrogrin", 52]] },
  { id: "borea", name: "Boréa", title: "Conseil — Cryo", type: "cryo", skill: 3, potions: 2, reward: 32000,
    quote: "Mon cœur est plus froid que mes créatures.",
    team: [["glaciator", 51], ["givrelame", 52], ["leviacode", 52], ["cryopus", 51], ["glaciator", 53]] },
  { id: "krag", name: "Krag", title: "Conseil — Impact", type: "impact", skill: 3, potions: 2, reward: 34000,
    quote: "Pas de stratégie. Juste de la force brute !",
    team: [["pugilatron", 53], ["golemax", 52], ["volcanyx", 53], ["dunerax", 52], ["pugilatron", 54]] },
  { id: "lyra", name: "Lyra", title: "Conseil — Psi", type: "psi", skill: 3, potions: 3, reward: 36000,
    quote: "J'ai déjà vu comment ce combat se termine.",
    team: [["psychatte", 54], ["pantinox", 54], ["ombrelynx", 53], ["neantome", 54], ["psychatte", 55]] },
  { id: "axel", name: "Axel", title: "Champion des Titans", type: "neant", skill: 3, potions: 4, reward: 60000,
    quote: "Tu es arrivé jusqu'ici… Montre-moi ce que vaut un vrai chasseur de Titans !",
    team: [["aquilux", 56], ["amperion", 56], ["sylvatitan", 57], ["leviacode", 57], ["volcanyx", 57], ["dracomega", 59]] }
];

// Titans légendaires : un seul de chaque, à capturer. need : nombre de badges (ou "champion").
export const LEGENDS = [
  { id: "fulgurtitan", zone: "centrale", lv: 40, need: 4, hint: "Les turbines s'emballent toutes seules la nuit…" },
  { id: "pyrotitan", zone: "fonderie", lv: 45, need: 6, hint: "Une chaleur anormale monte des profondeurs." },
  { id: "cryotitan", zone: "pic", lv: 48, need: 7, hint: "Un blizzard éternel souffle au sommet." },
  { id: "titanalpha", zone: "datacentre", lv: 55, need: 8, hint: "Le serveur zéro bat comme un cœur." },
  { id: "titanomega", zone: "coeur", lv: 65, need: "champion", hint: "Au cœur du réseau, quelque chose s'est réveillé." }
];
