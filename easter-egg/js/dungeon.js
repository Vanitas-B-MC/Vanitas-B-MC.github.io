// js/dungeon.js — logique pure de « Donjon » (aucun accès au DOM, testable sous Node).
// Un vrai donjon à la Binding of Isaac : chaque étage est une carte de salles reliées par des portes
// (combat, élite, trésor, boutique, boss). Les portes se verrouillent tant qu'il reste des ennemis.
// Action en temps réel : le héros attaque seul l'ennemi le plus proche, on esquive et on utilise une
// compétence. Les âmes gagnées financent des améliorations permanentes et de nouvelles classes.

export const W = 720;
export const H = 480;
export const TILE = 32;
export const X0 = 40;                 // coin haut-gauche de l'aire de jeu
export const Y0 = 48;
export const PLAYER_R = 9;

// Les salles ont des tailles différentes : les dimensions courantes sont des liaisons « live »
// (ré-assignées à chaque entrée de salle). W × H reste la taille de la fenêtre de jeu (la caméra défile).
export const ROOM_SIZES = { normal: [20, 12], wide: [32, 12], tall: [20, 20], large: [32, 20] };
export let COLS = 20;
export let ROWS = 12;
export let X1 = X0 + COLS * TILE;     // 680 pour une salle normale
export let Y1 = Y0 + ROWS * TILE;     // 432
export let WORLD_W = X1 + X0;
export let WORLD_H = Y1 + (H - 12 * TILE - Y0);
export function setRoomSize(size) {
  const [c, r] = ROOM_SIZES[size] || ROOM_SIZES.normal;
  COLS = c; ROWS = r;
  X1 = X0 + COLS * TILE; Y1 = Y0 + ROWS * TILE;
  WORLD_W = X1 + X0; WORLD_H = Y1 + (H - 12 * TILE - Y0);
  DOORS.u.x = DOORS.d.x = (X0 + X1) / 2; DOORS.u.y = Y0; DOORS.d.y = Y1;
  DOORS.l.x = X0; DOORS.r.x = X1; DOORS.l.y = DOORS.r.y = (Y0 + Y1) / 2;
}
export { WEAPONS, WEAPON_IDS, FREE_WEAPONS, weaponById } from "./weapons.js";
import { weaponById } from "./weapons.js";

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

/* ---------- Classes ---------- */

export const CLASSES = [
  { id: "knight", name: "Chevalier", unlock: 0, color: "#00f0ff",
    desc: "Robuste. Frappe en arc devant lui. Compétence : Tourbillon.",
    hp: 120, speed: 120, weapon: "sword",
    skill: { name: "Tourbillon", cd: 7, desc: "Frappe tout autour de toi" } },
  { id: "ranger", name: "Rôdeur", unlock: 400, color: "#4d9bff",
    desc: "Tire à distance. Compétence : Pluie de flèches.",
    hp: 90, speed: 135, weapon: "bow",
    skill: { name: "Pluie de flèches", cd: 6, desc: "12 flèches dans toutes les directions" } },
  { id: "mage", name: "Mage", unlock: 900, color: "#b58cff",
    desc: "Projectiles magiques perforants. Compétence : Nova.",
    hp: 80, speed: 118, weapon: "wand",
    skill: { name: "Nova", cd: 8, desc: "Onde qui blesse, ralentit et efface les tirs ennemis" } },
  { id: "rogue", name: "Voleur", unlock: 1600, color: "#ff2a6d",
    desc: "Très rapide, coups courts et fréquents. Compétence : Ombre.",
    hp: 95, speed: 150, weapon: "dagger",
    skill: { name: "Ombre", cd: 5, desc: "Bond invulnérable, puis 4 s de coups critiques" } }
];
export const CLASS_IDS = CLASSES.map((c) => c.id);
export const FREE_CLASS = "knight";
export const classById = (id) => CLASSES.find((c) => c.id === id) || CLASSES[0];

/* ---------- Améliorations permanentes (payées en âmes) ---------- */

export const META = [
  { id: "hp",     name: "Vitalité",        desc: "+10 PV max",                     max: 8, cost: (n) => 40 + 30 * n },
  { id: "power",  name: "Force",           desc: "+8 % de dégâts",                 max: 8, cost: (n) => 50 + 35 * n },
  { id: "speed",  name: "Agilité",         desc: "+4 % de vitesse",                max: 5, cost: (n) => 60 + 40 * n },
  { id: "crit",   name: "Précision",       desc: "+4 % de coups critiques",        max: 5, cost: (n) => 70 + 45 * n },
  { id: "greed",  name: "Cupidité",        desc: "+15 % d'âmes gagnées",           max: 5, cost: (n) => 90 + 60 * n },
  { id: "luck",   name: "Chance",          desc: "4 choix dans les coffres",       max: 1, cost: () => 500 },
  { id: "revive", name: "Seconde chance",  desc: "Une résurrection par partie (50 % PV)", max: 1, cost: () => 700 }
];
export const META_IDS = META.map((m) => m.id);
export const freshRanks = () => Object.fromEntries(META_IDS.map((id) => [id, 0]));
export const metaCost = (id, rank) => META.find((m) => m.id === id)?.cost(rank) ?? Infinity;

/* ---------- Objets ---------- */

export const ITEMS = {
  blade:  { name: "Lame aiguisée",    desc: "+20 % de dégâts",                                   max: 6, apply: (s) => { s.damage *= 1.2; } },
  haste:  { name: "Gants rapides",    desc: "+15 % de vitesse d'attaque",                        max: 6, apply: (s) => { s.rate *= 1.15; } },
  heart:  { name: "Cœur de pierre",   desc: "+25 PV max et soigne 25 PV",                        max: 6, apply: (s, p) => { s.maxHp += 25; p.hp = Math.min(s.maxHp, p.hp + 25); } },
  boots:  { name: "Bottes ailées",    desc: "+10 % de vitesse de déplacement",                   max: 5, apply: (s) => { s.speed *= 1.1; } },
  lynx:   { name: "Œil de lynx",      desc: "+10 % de coups critiques (×2)",                     max: 5, apply: (s) => { s.crit += 0.1; } },
  vamp:   { name: "Croc de vampire",  desc: "+1 PV par ennemi vaincu",                           max: 5, apply: (s) => { s.vampire += 1; } },
  multi:  { name: "Multi-tir",        desc: "+1 projectile (distance) · portée et arc accrus (mêlée)", max: 3,
            apply: (s, p, cls) => { if (cls.type === "shot") s.shots += 1; else { s.range *= 1.18; s.arc *= 1.15; } } },
  pierce: { name: "Perforation",      desc: "Les tirs traversent +1 ennemi (distance) · +10 % de dégâts (mêlée)", max: 3,
            apply: (s, p, cls) => { if (cls.type === "shot") s.pierce += 1; else s.damage *= 1.1; } },
  fire:   { name: "Flammes",          desc: "Tes coups enflamment les ennemis",                  max: 3, apply: (s) => { s.burn += 1; } },
  frost:  { name: "Givre",            desc: "Tes coups ralentissent les ennemis",                max: 1, apply: (s) => { s.frost = 1; } },
  shield: { name: "Bouclier d'énergie", desc: "Absorbe un coup, se recharge (−2 s par niveau)",  max: 3, apply: (s, p) => { s.shieldMax += 1; p.shield = Math.min(s.shieldMax, p.shield + 1); s.shieldCd = Math.max(5, 15 - 2 * (s.shieldMax - 1)); } },
  bomb:   { name: "Détonateur",       desc: "Les ennemis vaincus explosent",                     max: 3, apply: (s) => { s.bomb += 1; } },
  magnet: { name: "Aimant",           desc: "+60 % de portée de ramassage",                      max: 3, apply: (s) => { s.magnet *= 1.6; } },
  clock:  { name: "Chronomètre",      desc: "Compétence rechargée 15 % plus vite",               max: 4, apply: (s) => { s.skillCd *= 0.85; } },
  regen:  { name: "Nanobots",         desc: "+0,5 PV par seconde",                               max: 4, apply: (s) => { s.regen += 0.5; } },
  orbit:  { name: "Orbes gardiens",   desc: "+1 orbe qui tourne autour de toi : blesse et bloque les tirs", max: 4, apply: (s) => { s.orbs += 1; } },
  thorns: { name: "Armure d'épines",  desc: "Les ennemis qui te touchent sont blessés",          max: 3, apply: (s) => { s.thorns += 1; } },
  rage:   { name: "Sang chaud",       desc: "Jusqu'à +40 % de dégâts quand tes PV sont bas",     max: 3, apply: (s) => { s.berserk += 1; } },
  gold:   { name: "Main d'or",        desc: "Les pièces valent 50 % de plus",                    max: 3, apply: (s) => { s.coinMul += 0.5; } },
  glass:  { name: "Canon de verre",   desc: "+50 % de dégâts, −15 % de PV max",                  max: 1, apply: (s, p) => { s.damage *= 1.5; s.maxHp = Math.round(s.maxHp * 0.85); p.hp = Math.min(p.hp, s.maxHp); } }
};
export const ITEM_IDS = Object.keys(ITEMS);
const HEAL_CHOICE = { name: "Réparation", desc: "Soigne 40 % des PV" };
export const describe = (id) => (id === "heal" ? { id, ...HEAL_CHOICE } : { id, ...ITEMS[id] });

/* ---------- Ennemis ---------- */

// ai : chase | flutter | archer | charger | mage | turret | bomber | hopper | spawner | orbiter | wisp
export const ENEMIES = {
  slime:    { name: "Gelée",          hp: 22, speed: 46,  r: 9,  dmg: 8,  ai: "chase",   color: "#3ddc84", cost: 1 },
  bat:      { name: "Chauve-souris",  hp: 12, speed: 100, r: 7,  dmg: 6,  ai: "flutter", color: "#ff6bd6", cost: 1, flying: true },
  archer:   { name: "Archer",         hp: 18, speed: 52,  r: 8,  dmg: 8,  ai: "archer",  color: "#fcee0a", cost: 1.5 },
  charger:  { name: "Fonceur",        hp: 42, speed: 40,  r: 11, dmg: 14, ai: "charger", color: "#ff8a3d", cost: 2 },
  mage:     { name: "Sorcier",        hp: 28, speed: 42,  r: 9,  dmg: 9,  ai: "mage",    color: "#a066ff", cost: 2 },
  brute:    { name: "Brute",          hp: 95, speed: 36,  r: 14, dmg: 16, ai: "chase",   color: "#ff3b5c", cost: 3 },
  turret:   { name: "Tourelle",       hp: 40, speed: 0,   r: 11, dmg: 8,  ai: "turret",  color: "#9aa4c7", cost: 2, still: true },
  splitter: { name: "Gelée mère",     hp: 40, speed: 34,  r: 13, dmg: 10, ai: "chase",   color: "#7be25b", cost: 2, splits: "slimelet" },
  slimelet: { name: "Gelée mini",     hp: 10, speed: 70,  r: 6,  dmg: 5,  ai: "chase",   color: "#a9f08a", cost: 0 },
  bomber:   { name: "Kamikaze",       hp: 20, speed: 80,  r: 9,  dmg: 18, ai: "bomber",  color: "#ff5a36", cost: 2 },
  wisp:     { name: "Spectre",        hp: 16, speed: 60,  r: 8,  dmg: 8,  ai: "wisp",    color: "#bfe9ff", cost: 1.5, flying: true },
  hopper:   { name: "Sauteur",        hp: 30, speed: 0,   r: 10, dmg: 10, ai: "hopper",  color: "#ffd84a", cost: 2 },
  spawner:  { name: "Nid",            hp: 60, speed: 0,   r: 13, dmg: 6,  ai: "spawner", color: "#c97bff", cost: 3, still: true },
  orbiter:  { name: "Orbiteur",       hp: 24, speed: 70,  r: 8,  dmg: 8,  ai: "orbiter", color: "#4dffd2", cost: 2, flying: true },
  knight:   { name: "Chevalier noir", hp: 70, speed: 38,  r: 12, dmg: 14, ai: "chase",   color: "#6b7bb0", cost: 3, armor: 0.5 }
};
export const ENEMY_IDS = Object.keys(ENEMIES);

export const BOSSES = [
  { id: "golem",     name: "Golem de données",  hp: 560, speed: 34, r: 26, dmg: 18, color: "#ff8a3d" },
  { id: "spider",    name: "Reine araignée",    hp: 470, speed: 55, r: 22, dmg: 14, color: "#ff2a6d", flying: true },
  { id: "lich",      name: "Liche virale",      hp: 520, speed: 40, r: 22, dmg: 14, color: "#b58cff", flying: true },
  { id: "sentinel",  name: "Sentinelle",        hp: 620, speed: 0,  r: 28, dmg: 16, color: "#9aa4c7", flying: true, still: true },
  { id: "slimeking", name: "Roi gélatineux",    hp: 680, speed: 0,  r: 30, dmg: 18, color: "#5bdc6b" },
  { id: "reaper",    name: "Faucheur",          hp: 540, speed: 60, r: 20, dmg: 16, color: "#e8e8ff", flying: true }
];
export const bossFor = (floor) => BOSSES[(floor - 1 + BOSSES.length * 100) % BOSSES.length];

// Un thème par étage : couleurs et ennemis propres, pour que les étages ne se ressemblent pas.
export const THEMES = [
  { id: "cave",   name: "Caverne",  wall: "#3ddc84", a: "#0c1611", b: "#09120d", rock: "#1c3326", pool: ["slime", "bat", "splitter", "hopper", "archer", "brute", "bomber"] },
  { id: "crypt",  name: "Crypte",   wall: "#b58cff", a: "#120d1c", b: "#0e0a17", rock: "#2a2145", pool: ["wisp", "archer", "mage", "bat", "knight", "turret", "spawner"] },
  { id: "forge",  name: "Forge",    wall: "#ff8a3d", a: "#1a0f0a", b: "#150b07", rock: "#3a2418", pool: ["charger", "bomber", "turret", "slime", "brute", "spawner", "knight"] },
  { id: "ice",    name: "Glacier",  wall: "#7fd8ff", a: "#0b1520", b: "#08111a", rock: "#1f3a52", pool: ["orbiter", "archer", "hopper", "wisp", "charger", "mage", "splitter"] },
  { id: "void",   name: "Néant",    wall: "#ff2a6d", a: "#150a14", b: "#10070f", rock: "#3d1630", pool: ["wisp", "orbiter", "bomber", "mage", "knight", "turret", "hopper", "spawner", "charger", "brute"] }
];
export const themeFor = (floor) => THEMES[(floor - 1 + THEMES.length * 100) % THEMES.length];

const hpMul = (floor) => 1 + 0.2 * (floor - 1);
const dmgMul = (floor) => 1 + 0.07 * (floor - 1);

/* ---------- Dispositions de salle (20 × 12 cases) : . vide · # rocher · o trou · x piques ---------- */

function blank() { return Array.from({ length: ROWS }, () => Array(COLS).fill(".")); }
function box(g, c, r, w, h, ch) { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (g[y]?.[x] !== undefined) g[y][x] = ch; }

export const LAYOUTS = [
  { id: "open",     build: () => blank() },
  { id: "pillars",  build: () => { const g = blank(); for (const [c, r] of [[3, 2], [15, 2], [3, 8], [15, 8]]) box(g, c, r, 2, 2, "#"); return g; } },
  { id: "cross",    build: () => { const g = blank(); box(g, 8, 3, 4, 1, "#"); box(g, 8, 8, 4, 1, "#"); box(g, 4, 5, 1, 2, "#"); box(g, 15, 5, 1, 2, "#"); return g; } },
  { id: "pitring",  build: () => { const g = blank(); box(g, 6, 3, 8, 6, "o"); box(g, 7, 4, 6, 4, "."); box(g, 9, 3, 2, 1, "."); box(g, 9, 8, 2, 1, "."); return g; } },
  { id: "corridors", build: () => { const g = blank(); box(g, 3, 3, 6, 1, "#"); box(g, 11, 3, 6, 1, "#"); box(g, 3, 8, 6, 1, "#"); box(g, 11, 8, 6, 1, "#"); return g; } },
  { id: "spikes",   build: () => { const g = blank(); box(g, 4, 3, 3, 2, "x"); box(g, 13, 3, 3, 2, "x"); box(g, 8, 8, 4, 2, "x"); box(g, 8, 4, 4, 2, "#"); return g; } },
  { id: "checker",  build: () => { const g = blank(); for (let r = 2; r < 10; r += 2) for (let c = 4; c < 16; c += 3) g[r][c + (r % 4 ? 1 : 0)] = "#"; return g; } },
  { id: "lanes",    build: () => { const g = blank(); box(g, 5, 1, 2, 4, "o"); box(g, 5, 7, 2, 4, "o"); box(g, 13, 1, 2, 4, "o"); box(g, 13, 7, 2, 4, "o"); return g; } },
  { id: "diamond",  build: () => { const g = blank(); for (const [c, r] of [[9, 2], [8, 3], [10, 3], [7, 4], [11, 4], [7, 7], [11, 7], [8, 8], [10, 8], [9, 9]]) g[r][c] = "#"; return g; } },
  { id: "corners",  build: () => { const g = blank(); box(g, 2, 2, 3, 1, "#"); box(g, 2, 2, 1, 3, "#"); box(g, 15, 2, 3, 1, "#"); box(g, 17, 2, 1, 3, "#"); box(g, 2, 9, 3, 1, "#"); box(g, 2, 7, 1, 3, "#"); box(g, 15, 9, 3, 1, "#"); box(g, 17, 7, 1, 3, "#"); return g; } },
  { id: "bigpit",   build: () => { const g = blank(); box(g, 7, 4, 6, 4, "o"); box(g, 3, 2, 1, 1, "#"); box(g, 16, 2, 1, 1, "#"); box(g, 3, 9, 1, 1, "#"); box(g, 16, 9, 1, 1, "#"); return g; } },
  { id: "arena",    build: () => { const g = blank(); box(g, 3, 2, 5, 1, "#"); box(g, 12, 2, 5, 1, "#"); box(g, 3, 9, 5, 1, "#"); box(g, 12, 9, 5, 1, "#"); box(g, 3, 3, 1, 2, "#"); box(g, 16, 3, 1, 2, "#"); box(g, 3, 7, 1, 2, "#"); box(g, 16, 7, 1, 2, "#"); return g; } },
  { id: "islands",  build: () => { const g = blank(); box(g, 4, 3, 3, 2, "o"); box(g, 13, 3, 3, 2, "o"); box(g, 4, 7, 3, 2, "o"); box(g, 13, 7, 3, 2, "o"); box(g, 9, 5, 2, 2, "#"); return g; } }
];

// Grandes salles : générées selon COLS × ROWS (passages toujours garantis, voir dg3.mjs).
const bigLayouts = [
  { id: "scatter", big: true, build: (rnd, g = blank()) => { for (let r = 3; r < ROWS - 3; r += 5) for (let c = 4; c < COLS - 4; c += 6) box(g, c + (r % 2), r, 2, 2, "#"); return g; } },
  { id: "partitions", big: true, build: (rnd, g = blank()) => {
      const c1 = Math.floor(COLS / 3), c2 = Math.floor((2 * COLS) / 3), m = Math.floor(ROWS / 2);
      box(g, c1, 1, 1, ROWS - 2, "#"); box(g, c2, 1, 1, ROWS - 2, "#");
      box(g, c1, m - 2, 1, 4, "."); box(g, c2, 1, 1, 4, "."); box(g, c2, ROWS - 5, 1, 4, ".");
      box(g, c1 - 3, 3, 2, 2, "o"); box(g, c2 + 3, ROWS - 5, 2, 2, "o");
      return g; } },
  { id: "moat", big: true, build: (rnd, g = blank()) => {
      const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
      box(g, cx - 7, cy - 4, 14, 8, "o");
      box(g, cx - 8, cy - 1, 16, 2, "."); box(g, cx - 1, cy - 5, 2, 10, ".");
      box(g, cx - 4, cy - 2, 2, 1, "#"); box(g, cx + 2, cy + 1, 2, 1, "#");
      return g; } },
  { id: "spikefield", big: true, build: (rnd, g = blank()) => {
      for (let i = 0; i < Math.floor((COLS * ROWS) / 40); i++) box(g, 3 + Math.floor(rnd() * (COLS - 8)), 2 + Math.floor(rnd() * (ROWS - 5)), 3, 2, "x");
      for (let r = 4; r < ROWS - 3; r += 6) box(g, Math.floor(COLS / 2) - 2, r, 4, 1, "#");
      return g; } },
  { id: "archipelago", big: true, build: (rnd, g = blank()) => {
      for (let r = 1; r + 5 < ROWS; r += 6) for (let c = 2; c + 5 < COLS; c += 6) {
        if (rnd() < 0.6) box(g, c + 1 + Math.floor(rnd() * 3), r + 1 + Math.floor(rnd() * 3), 2, 2, rnd() < 0.5 ? "o" : "#");
      }
      return g; } },
  { id: "cathedral", big: true, build: (rnd, g = blank()) => {
      for (let c = 4; c < COLS - 3; c += 4) { box(g, c, 3, 1, 2, "#"); box(g, c, ROWS - 5, 1, 2, "#"); }
      const m = Math.floor(ROWS / 2); for (let c = 6; c < COLS - 5; c += 8) box(g, c, m - 1, 2, 2, "#");
      return g; } }
];
for (const l of bigLayouts) LAYOUTS.push(l);
export const NORMAL_LAYOUTS = LAYOUTS.map((l, i) => (l.big ? -1 : i)).filter((i) => i >= 0);
export const BIG_LAYOUTS = LAYOUTS.map((l, i) => (l.big ? i : -1)).filter((i) => i >= 0);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function clearDoorways(g) {
  const mc = Math.floor(COLS / 2), mr = Math.floor(ROWS / 2);
  box(g, mc - 2, 0, 4, 2, "."); box(g, mc - 2, ROWS - 2, 4, 2, ".");
  box(g, 0, mr - 2, 2, 4, "."); box(g, COLS - 2, mr - 2, 2, 4, ".");
  const centre = g[mr - 1][mc - 1];
  if (COLS === 20 && ROWS === 12) box(g, mc - 2, mr - 2, 4, 4, centre === "#" ? "#" : centre === "o" ? "o" : "."); // garde le centre tel quel s'il est plein
  else { box(g, mc - 2, 2, 4, ROWS - 4, "."); box(g, 2, mr - 2, COLS - 4, 4, "."); }
  return g;
}

// Construit la grille d'une salle (après setRoomSize).
export const buildLayout = (room) => clearDoorways(LAYOUTS[room.layout].build(mulberry(room.seed || 1)));

/* ---------- Carte d'étage ---------- */

const DIRS = { u: { dx: 0, dy: -1, opp: "d" }, d: { dx: 0, dy: 1, opp: "u" }, l: { dx: -1, dy: 0, opp: "r" }, r: { dx: 1, dy: 0, opp: "l" } };

// Position des portes dans le mur et point d'arrivée quand on entre par la porte opposée.
export const DOORS = { u: { x: 0, y: 0 }, d: { x: 0, y: 0 }, l: { x: 0, y: 0 }, r: { x: 0, y: 0 } };
setRoomSize("normal");
const arrive = (d) => ({ u: { x: DOORS.u.x, y: Y0 + 30 }, d: { x: DOORS.d.x, y: Y1 - 30 }, l: { x: X0 + 30, y: DOORS.l.y }, r: { x: X1 - 30, y: DOORS.r.y } }[d]);

export function generateFloor(rng, floor) {
  const count = Math.min(12, 6 + floor);
  const rooms = new Map();
  const key = (x, y) => `${x},${y}`;
  const add = (x, y, type) => { const r = { gx: x, gy: y, type, doors: {}, visited: false, cleared: false, depth: 0, layout: null, waves: 0, taken: false, stands: null, size: "normal", seed: 0, trap: false, bossChest: false }; rooms.set(key(x, y), r); return r; };
  add(0, 0, "start");
  let guard = 0;
  while (rooms.size < count && guard++ < 500) {
    const list = [...rooms.values()];
    const from = list[Math.floor(rng() * list.length)];
    const dir = Object.keys(DIRS)[Math.floor(rng() * 4)];
    const nx = from.gx + DIRS[dir].dx;
    const ny = from.gy + DIRS[dir].dy;
    if (rooms.has(key(nx, ny))) continue;
    // une seule salle voisine à la création : pas de boucle involontaire
    let neighbours = 0;
    for (const d of Object.values(DIRS)) if (rooms.has(key(nx + d.dx, ny + d.dy))) neighbours++;
    if (neighbours > 1) continue;
    const room = add(nx, ny, "combat");
    room.depth = from.depth + 1;
  }
  for (const room of rooms.values()) {
    for (const [d, v] of Object.entries(DIRS)) if (rooms.has(key(room.gx + v.dx, room.gy + v.dy))) room.doors[d] = true;
  }
  // salles spéciales : les culs-de-sac, du plus éloigné (boss) au plus proche
  const degree = (r) => Object.keys(r.doors).length;
  const leaves = [...rooms.values()].filter((r) => r.type === "combat" && degree(r) === 1).sort((a, b) => b.depth - a.depth);
  const others = [...rooms.values()].filter((r) => r.type === "combat" && degree(r) > 1).sort((a, b) => b.depth - a.depth);
  const pool = [...leaves, ...others];
  const boss = pool.shift();
  boss.type = "boss";
  const treasure = pool.shift();
  if (treasure) treasure.type = "treasure";
  const shop = pool.shift();
  if (shop) shop.type = "shop";
  // quelques salles d'élite parmi les salles de combat éloignées
  const combats = [...rooms.values()].filter((r) => r.type === "combat" && r.depth >= 2);
  for (const r of combats) if (rng() < 0.25 + 0.03 * floor) r.type = "elite";
  for (const r of rooms.values()) {
    r.seed = 1 + Math.floor(rng() * 1e9);
    const fight = r.type === "combat" || r.type === "elite" || r.type === "boss";
    const roll = rng();
    r.size = !fight ? "normal" : r.type === "boss" ? (roll < 0.5 ? "large" : roll < 0.75 ? "wide" : "normal") : roll < 0.14 ? "large" : roll < 0.26 ? "wide" : roll < 0.38 ? "tall" : "normal";
    const choices = r.size !== "normal" ? BIG_LAYOUTS : r.type === "boss" ? [0, 1, 11, 12] : r.type === "start" || r.type === "treasure" || r.type === "shop" ? [0] : NORMAL_LAYOUTS;
    r.layout = choices[Math.floor(rng() * choices.length)];
    r.waves = r.type === "combat" || r.type === "elite" ? (floor >= 3 && rng() < 0.5 ? 2 : 1) : 0;
  }
  return { rooms: [...rooms.values()], start: rooms.get(key(0, 0)) };
}

/* ---------- Création de la partie ---------- */

export function createState(rng = Math.random, { classId = FREE_CLASS, ranks = {}, weaponId = null } = {}) {
  const cls = classById(classId);
  const a = weaponById(weaponId || cls.weapon);
  const stats = {
    maxHp: cls.hp, speed: cls.speed, damage: a.dmg, rate: a.rate,
    range: a.range || 0, arc: a.arc || 0, projSpeed: a.speed || 0, pierce: a.pierce || 0, shots: 1,
    crit: 0.05, vampire: 0, burn: 0, frost: 0, shieldMax: 0, shieldCd: 15, bomb: 0, magnet: 60,
    skillCd: cls.skill.cd, regen: 0, orbs: 0, thorns: 0, berserk: 0, coinMul: 1
  };
  const r = (id) => Math.min(ranks[id] || 0, META.find((m) => m.id === id).max);
  stats.maxHp += 10 * r("hp");
  stats.damage *= 1 + 0.08 * r("power");
  stats.speed *= 1 + 0.04 * r("speed");
  stats.crit += 0.04 * r("crit");

  const state = {
    rng, cls, weapon: a, stats, ranks: { ...ranks }, zones: [], delayed: [], spin: 0,
    time: 0, over: false, revived: false,
    floor: 1, map: null, room: null, theme: themeFor(1), grid: blank(),
    player: { x: (X0 + X1) / 2, y: Y1 - 40, hp: stats.maxHp, inv: 0, cd: 0, skillCd: 0, shield: 0, shieldT: 0, facing: -Math.PI / 2, ghost: 0, crit100: 0, spikeT: 0 },
    enemies: [], shots: [], bullets: [], pickups: [], fx: [], spawnList: [], spawnClock: 0, wavesLeft: 0,
    cleared: true, chest: null, trapdoor: null, choices: null, owned: {}, boss: null,
    kills: 0, coins: 0, coinsEarned: 0, bossKills: 0, roomsCleared: 0, nextId: 1, banner: null, orbAngle: 0, rain: 0
  };
  startFloor(state);
  return state;
}

function startFloor(state) {
  state.theme = themeFor(state.floor);
  state.map = generateFloor(state.rng, state.floor);
  state.trapdoor = null;
  enterRoom(state, state.map.start, null);
  state.banner = { text: `Étage ${state.floor} — ${state.theme.name}`, ttl: 2.4 };
}

/* ---------- Salles ---------- */

function spawnPoint(state, minFromPlayer = 160) {
  for (let tries = 0; tries < 40; tries++) {
    const c = 1 + Math.floor(state.rng() * (COLS - 2));
    const r = 1 + Math.floor(state.rng() * (ROWS - 2));
    if (state.grid[r][c] !== ".") continue;
    const x = X0 + c * TILE + TILE / 2;
    const y = Y0 + r * TILE + TILE / 2;
    if (dist2({ x, y }, state.player) < minFromPlayer ** 2) continue;
    return { x, y };
  }
  return { x: (X0 + X1) / 2, y: Y0 + 90 };
}

function makeEnemy(state, type, x, y, opts = {}) {
  const def = type in ENEMIES ? ENEMIES[type] : opts.def;
  const mul = (opts.hpMul ?? hpMul(state.floor)) * (opts.elite ? 3 : 1);
  const hp = def.hp * mul;
  return {
    id: state.nextId++, type, x, y, hp, maxHp: hp, r: def.r * (opts.elite ? 1.3 : 1), dmg: def.dmg * dmgMul(state.floor),
    spawn: opts.spawn ?? 0.7, cd: 1 + state.rng(), st: "idle", t: 0, vx: 0, vy: 0, burn: 0, burnDps: 0, slow: 0, flash: 0, orbCd: 0,
    elite: !!opts.elite, boss: !!opts.boss, flying: !!def.flying, speedBase: def.speed, dead: false, parent: opts.parent || 0
  };
}

function planWave(state, isFirst) {
  const room = state.room;
  const depth = room.depth;
  let budget = ((2.5 + state.floor * 0.9 + depth * 0.35) / (room.waves > 1 ? 1.4 : 1)) * Math.pow((COLS * ROWS) / 240, 0.75);
  const count = Math.min(state.theme.pool.length, 2 + state.floor);
  const pool = state.theme.pool.slice(0, count);
  let at = 0;
  while (budget > 0) {
    const type = pool[Math.floor(state.rng() * pool.length)];
    budget -= ENEMIES[type].cost;
    const pt = spawnPoint(state);
    state.spawnList.push({ at, type, x: pt.x, y: pt.y });
    at += 0.3 + state.rng() * 0.45;
  }
  if (isFirst && room.type === "elite") {
    const type = pool[Math.floor(state.rng() * pool.length)];
    const pt = spawnPoint(state);
    state.spawnList.push({ at: 0.5, type, x: pt.x, y: pt.y, elite: true });
  }
  state.spawnClock = 0;
}

function enterRoom(state, room, fromDir) {
  setRoomSize(room.size);
  state.room = room;
  state.zones = [];
  state.delayed = [];
  state.trapdoor = null;
  room.visited = true;
  state.enemies = [];
  state.shots = [];
  state.bullets = [];
  state.pickups = [];
  state.fx = [];
  state.spawnList = [];
  state.spawnClock = 0;
  state.chest = null;
  state.boss = null;
  state.rain = 0;
  const g = buildLayout(room);
  state.grid = g;
  const p = state.player;
  const at = fromDir ? arrive(fromDir) : { x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 + 40 };
  p.x = at.x;
  p.y = at.y;
  p.inv = Math.max(p.inv, 0.8);

  if (room.cleared) {
    state.cleared = true;
    state.wavesLeft = 0;
    if (room.type === "boss") {   // la trappe et le coffre restent dans la salle du boss
      if (room.trap) state.trapdoor = { x: (X0 + X1) / 2 + 60, y: (Y0 + Y1) / 2 + 30 };
      if (room.bossChest) state.chest = { x: (X0 + X1) / 2 - 60, y: (Y0 + Y1) / 2 + 30, opened: false, kind: "boss" };
    }
  } else if (room.type === "boss") {
    state.cleared = false;
    state.wavesLeft = 0;
    const def = bossFor(state.floor);
    const mul = 0.75 + 0.2 * (state.floor - 1);
    const b = makeEnemy(state, def.id, (X0 + X1) / 2, Y0 + 110, { def, hpMul: mul, boss: true, spawn: 1.4 });
    b.name = def.name;
    b.marks = [0.75, 0.5, 0.25];
    state.enemies.push(b);
    state.boss = b;
    state.banner = { text: `BOSS — ${def.name}`, ttl: 2.4 };
  } else if (room.type === "combat" || room.type === "elite") {
    state.cleared = false;
    state.wavesLeft = room.waves - 1;
    planWave(state, true);
  } else {
    state.cleared = true;
    room.cleared = true;
    if (room.type === "treasure" && !room.taken) state.chest = { x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, opened: false, kind: "treasure" };
    if (room.type === "shop") {
      if (!room.stands) {
        const pool = ITEM_IDS.filter((id) => (state.owned[id] || 0) < ITEMS[id].max);
        const pick = () => pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
        const price = 10 + 2 * state.floor;
        room.stands = [
          { x: (X0 + X1) / 2 - 100, y: (Y0 + Y1) / 2, kind: "heart", price: 4 + state.floor, sold: false },
          { x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, kind: "item", id: pick() || "blade", price, sold: false },
          { x: (X0 + X1) / 2 + 100, y: (Y0 + Y1) / 2, kind: "item", id: pick() || "haste", price: price + 4, sold: false }
        ];
      }
    }
  }
  if (room.type !== "boss") state.banner = state.banner && state.banner.ttl > 0.5 && fromDir === null ? state.banner : { text: roomLabel(room), ttl: 1.2 };
}

export const roomLabel = (room) => ({ start: "Entrée", combat: "Salle", elite: "Salle d'élite", treasure: "Salle au trésor", shop: "Boutique", boss: "Boss" }[room.type]);

/* ---------- Dégâts, mort, butin ---------- */

function hurtPlayer(state, amount) {
  const p = state.player;
  if (state.over || p.inv > 0 || p.ghost > 0) return;
  if (p.shield > 0) {
    p.shield -= 1;
    p.shieldT = state.stats.shieldCd;
    p.inv = 0.6;
    state.fx.push({ kind: "ring", x: p.x, y: p.y, r: 24, ttl: 0.3, max: 0.3, color: "#4dffd2" });
    return;
  }
  p.hp -= amount;
  p.inv = 0.7;
  state.fx.push({ kind: "num", x: p.x, y: p.y - 12, text: `-${Math.round(amount)}`, ttl: 0.7, max: 0.7, color: "#ff3b5c" });
  if (p.hp <= 0) {
    if (state.ranks.revive && !state.revived) {
      state.revived = true;
      p.hp = state.stats.maxHp * 0.5;
      p.inv = 2.5;
      state.bullets = [];
      state.fx.push({ kind: "ring", x: p.x, y: p.y, r: 120, ttl: 0.6, max: 0.6, color: "#fcee0a" });
    } else {
      p.hp = 0;
      state.over = true;
    }
  }
}

function drop(state, x, y, kind, v) {
  if (state.pickups.length < 80) state.pickups.push({ kind, x, y, v });
}

function killEnemy(state, e, depth = 0) {
  if (e.dead) return;
  e.dead = true;
  state.kills += 1;
  const def = e.boss ? null : ENEMIES[e.type];
  const worth = Math.round((1 + Math.floor(state.floor / 3)) * state.stats.coinMul);
  if (e.type !== "slimelet") drop(state, e.x, e.y, "coin", e.elite ? worth * 4 : e.boss ? worth * 6 : worth);
  if (e.boss) {
    state.bossKills += 1;
    for (let i = 0; i < 6; i++) drop(state, e.x + (i - 2.5) * 12, e.y + 10, "coin", worth * 3);
    drop(state, e.x, e.y + 24, "heart", 0.5);
    state.player.hp = state.stats.maxHp;
    state.bullets = [];
    for (const o of state.enemies) if (!o.dead && o !== e) { o.dead = true; }
  } else if (state.rng() < (e.elite ? 0.6 : 0.09)) {
    drop(state, e.x, e.y, "heart", 0.2);
  }
  if (def?.splits && depth < 2) {
    for (let i = 0; i < 2; i++) state.enemies.push(makeEnemy(state, def.splits, e.x + (i ? 12 : -12), e.y, { spawn: 0.25, hpMul: hpMul(state.floor) }));
  }
  const s = state.stats;
  if (s.vampire) state.player.hp = Math.min(s.maxHp, state.player.hp + s.vampire);
  if (s.bomb && depth < 2) {
    const radius = 52;
    state.fx.push({ kind: "blast", x: e.x, y: e.y, r: radius, ttl: 0.3, max: 0.3, color: "#ff8a3d" });
    for (const o of state.enemies) {
      if (!o.dead && o !== e && dist2(e, o) <= (radius + o.r) ** 2) damageEnemy(state, o, 14 * s.bomb * (s.damage / 12), { depth: depth + 1, silent: true });
    }
  }
}

export function damageEnemy(state, e, amount, { silent = false, depth = 0, noCrit = false, knock = 0, from = null } = {}) {
  if (e.dead || e.spawn > 0 || e.untouchable) return;
  const s = state.stats;
  const crit = !noCrit && (state.player.crit100 > 0 || state.rng() < s.crit);
  let dmg = crit ? amount * 2 : amount;
  if (s.berserk) dmg *= 1 + 0.4 * s.berserk * (1 - state.player.hp / s.maxHp) / 1.5;
  const armor = e.boss ? 0 : ENEMIES[e.type]?.armor || 0;
  dmg *= 1 - armor;
  e.hp -= dmg;
  e.flash = 0.1;
  if (knock && !e.boss && !(ENEMIES[e.type]?.still) && from) {
    const d = Math.sqrt(dist2(from, e)) || 1;
    e.x = clamp(e.x + ((e.x - from.x) / d) * knock, X0 + e.r, X1 - e.r);
    e.y = clamp(e.y + ((e.y - from.y) / d) * knock, Y0 + e.r, Y1 - e.r);
  }
  if (!silent && state.fx.length < 60) state.fx.push({ kind: "num", x: e.x, y: e.y - e.r, text: String(Math.round(dmg)), ttl: 0.55, max: 0.55, color: crit ? "#fcee0a" : "#ffffff", crit });
  if (e.hp <= 0) killEnemy(state, e, depth);
}

function applyHitEffects(state, e, extra = null) {
  const s = state.stats;
  if (e.dead) return;
  if (s.burn || extra?.burn) { e.burn = 3; e.burnDps = 4 * Math.max(s.burn, 1) * (s.damage / 12); }
  if (s.frost) e.slow = 1.6;
  if (extra?.slow) e.slow = Math.max(e.slow, extra.slow);
}

/* ---------- Collisions avec les cases ---------- */

const tileSolid = (state, c, r, flying) => {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  const ch = state.grid[r][c];
  return ch === "#" || (ch === "o" && !flying);
};

function pushOut(state, ent, rad, flying = false) {
  ent.x = clamp(ent.x, X0 + rad, X1 - rad);
  ent.y = clamp(ent.y, Y0 + rad, Y1 - rad);
  const c0 = Math.floor((ent.x - X0) / TILE);
  const r0 = Math.floor((ent.y - Y0) / TILE);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (!tileSolid(state, c, r, flying)) continue;
      const rx = X0 + c * TILE, ry = Y0 + r * TILE;
      const cx = clamp(ent.x, rx, rx + TILE);
      const cy = clamp(ent.y, ry, ry + TILE);
      const dx = ent.x - cx, dy = ent.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rad * rad) continue;
      if (d2 === 0) {
        const left = ent.x - rx, right = rx + TILE - ent.x, up = ent.y - ry, down = ry + TILE - ent.y;
        const m = Math.min(left, right, up, down);
        if (m === left) ent.x = rx - rad; else if (m === right) ent.x = rx + TILE + rad; else if (m === up) ent.y = ry - rad; else ent.y = ry + TILE + rad;
      } else {
        const d = Math.sqrt(d2);
        ent.x = cx + (dx / d) * rad;
        ent.y = cy + (dy / d) * rad;
      }
    }
  }
}

const rockAt = (state, x, y) => {
  const c = Math.floor((x - X0) / TILE), r = Math.floor((y - Y0) / TILE);
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && state.grid[r][c] === "#";
};
export const tileAtPoint = (state, x, y) => {
  const c = Math.floor((x - X0) / TILE), r = Math.floor((y - Y0) / TILE);
  return c >= 0 && r >= 0 && c < COLS && r < ROWS ? state.grid[r][c] : "#";
};

/* ---------- Tirs et attaques ---------- */

function enemyShoot(state, e, angle, speed, dmgMul = 1, extra = {}) {
  state.bullets.push({ x: extra.x ?? e.x, y: extra.y ?? e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: e.dmg * dmgMul, life: extra.life || 5, r: extra.r || 4, color: extra.color || "#ff3b5c", homing: extra.homing || 0 });
}

function nearestEnemy(state, from, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const e of state.enemies) {
    if (e.dead || e.spawn > 0 || e.untouchable) continue;
    const d = dist2(from, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ---------- Armes : une trentaine de comportements d'attaque ---------- */

const rndSign = (state) => state.rng() * 2 - 1;

function newShot(state, x, y, ang, speed, extra = {}) {
  const st = state.stats, w = state.weapon;
  const s = { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: st.damage, pierce: st.pierce, life: 1.2, hit: new Set(), color: w.color, r: 3.5, shape: "dot", age: 0, ...extra };
  if (s.trail) s.tr = [];
  if (state.shots.length < 260) state.shots.push(s);
  return s;
}

function blastAt(state, x, y, r, dmg, opts = {}) {
  state.fx.push({ kind: "blast", x, y, r, ttl: 0.32, max: 0.32, color: opts.color || state.weapon.color });
  if (opts.sky) state.fx.push({ kind: "ring", x, y, r: r * 1.15, ttl: 0.4, max: 0.4, color: "#ffffff" });
  for (const e of state.enemies) {
    if (e.dead || e.spawn > 0 || dist2({ x, y }, e) > (r + e.r) ** 2) continue;
    damageEnemy(state, e, dmg, { knock: opts.knock ?? 14, from: { x, y }, silent: opts.silent });
    applyHitEffects(state, e, opts);
  }
}

function hitSegment(state, x1, y1, x2, y2, width, dmg, opts = {}) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  for (const e of state.enemies) {
    if (e.dead || e.spawn > 0) continue;
    const t = clamp(((e.x - x1) * dx + (e.y - y1) * dy) / l2, 0, 1);
    const px = x1 + dx * t, py = y1 + dy * t;
    if ((e.x - px) ** 2 + (e.y - py) ** 2 <= (width / 2 + e.r) ** 2) {
      damageEnemy(state, e, dmg, { knock: opts.knock || 0, from: { x: x1, y: y1 }, silent: opts.silent });
      applyHitEffects(state, e, opts);
    }
  }
}

function meleeArc(state, ang, range, arc, dmg, knock = 10) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.dead || e.spawn > 0 || dist2(p, e) > (range + e.r) ** 2) continue;
    let diff = Math.abs(angleTo(p, e) - ang);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff <= arc / 2 + 0.15) { damageEnemy(state, e, dmg, { knock, from: p }); applyHitEffects(state, e); }
  }
}

function beamEnd(state, x, y, ang, len) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  let d = 0;
  while (d < len) {
    const nx = x + cx * (d + 8), ny = y + cy * (d + 8);
    if (nx < X0 || nx > X1 || ny < Y0 || ny > Y1 || rockAt(state, nx, ny)) break;
    d += 8;
  }
  return { x: x + cx * d, y: y + cy * d };
}

function chainLightning(state, first, jumps, dmg, range = 120) {
  const p = state.player, pts = [{ x: p.x, y: p.y }], seen = new Set();
  let cur = first, d = dmg;
  for (let i = 0; i <= jumps && cur; i++) {
    pts.push({ x: cur.x, y: cur.y });
    seen.add(cur.id);
    damageEnemy(state, cur, d, { knock: 4, from: pts[pts.length - 2] });
    applyHitEffects(state, cur);
    d *= 0.88;
    let best = null, bd = range * range;
    for (const e of state.enemies) {
      if (e.dead || e.spawn > 0 || seen.has(e.id)) continue;
      const q = dist2(cur, e);
      if (q < bd) { bd = q; best = e; }
    }
    cur = best;
  }
  state.fx.push({ kind: "bolt", pts, ttl: 0.24, max: 0.24, color: state.weapon.color, seed: state.rng() * 1000 });
}

function dropZone(state, z) {
  if (state.zones.length >= 24) state.zones.shift();
  state.zones.push({ tick: 0, max: z.ttl, ...z });
}

function aimPoint(state, tp, ang, reach) {
  const p = state.player;
  const t = tp || { x: p.x + Math.cos(ang) * reach * 0.7, y: p.y + Math.sin(ang) * reach * 0.7 };
  const d = Math.sqrt(dist2(p, t)) || 1;
  const k = Math.min(1, reach / d);
  return { x: clamp(p.x + (t.x - p.x) * k, X0 + 8, X1 - 8), y: clamp(p.y + (t.y - p.y) * k, Y0 + 8, Y1 - 8) };
}

// Renvoie false si l'arme n'a rien à viser (le cooldown est alors court).
function fireWeapon(state, ang, target, pt) {
  const { player: p, stats: st, weapon: w } = state;
  const n = st.shots, D = st.damage, c = w.color;
  const fan = (base, spread, make) => { for (let i = 0; i < base + n - 1; i++) make(ang + (i - (base + n - 2) / 2) * spread, i); };
  const speed = st.projSpeed;
  switch (w.kind) {
    case "arc":
      state.fx.push({ kind: "slash", x: p.x, y: p.y, angle: ang, arc: st.arc, r: st.range, ttl: 0.16, max: 0.16, color: c });
      meleeArc(state, ang, st.range, st.arc, D);
      break;
    case "whip":
      state.fx.push({ kind: "whip", x: p.x, y: p.y, angle: ang, r: st.range, ttl: 0.2, max: 0.2, color: c, seed: state.rng() * 100 });
      meleeArc(state, ang, st.range, st.arc, D, 6);
      break;
    case "thrust": {
      const x2 = p.x + Math.cos(ang) * st.range, y2 = p.y + Math.sin(ang) * st.range;
      state.fx.push({ kind: "thrust", x: p.x, y: p.y, x2, y2, ttl: 0.18, max: 0.18, color: c });
      hitSegment(state, p.x, p.y, x2, y2, 14 + (st.arc - 0.4) * 30, D, { knock: 14 });
      break;
    }
    case "slam": {
      const x = p.x + Math.cos(ang) * 34, y = p.y + Math.sin(ang) * 34;
      const r = st.range * (1 + (n - 1) * 0.1);
      state.fx.push({ kind: "slam", x, y, r, ttl: 0.38, max: 0.38, color: c });
      blastAt(state, x, y, r, D, { knock: 26, slow: 1.3, color: c, silent: false });
      break;
    }
    case "dash": {
      const ox = p.x, oy = p.y;
      p.x += Math.cos(ang) * st.range; p.y += Math.sin(ang) * st.range;
      pushOut(state, p, PLAYER_R);
      p.inv = Math.max(p.inv, 0.3);
      state.fx.push({ kind: "dash", x: ox, y: oy, x2: p.x, y2: p.y, ttl: 0.3, max: 0.3, color: c });
      hitSegment(state, ox, oy, p.x, p.y, 34, D, { knock: 12 });
      break;
    }
    case "flurry":
      for (let i = 0; i < 3; i++) {
        const a = ang + (i - 1) * 1.15;
        state.fx.push({ kind: "slash", x: p.x, y: p.y, angle: a, arc: st.arc, r: st.range, ttl: 0.12 + i * 0.05, max: 0.12 + i * 0.05, color: c });
        meleeArc(state, a, st.range, st.arc, D, 6);
      }
      break;
    case "shot": case "frost": case "fireball": case "homing": case "boomerang": {
      const base = w.fan || 1;
      fan(base, w.kind === "frost" ? 0.3 : 0.16, (a) => {
        const ex = { shape: w.shape || "dot" };
        if (w.kind === "frost") Object.assign(ex, { slow: 2, trail: true, life: 0.95 });
        if (w.kind === "fireball") Object.assign(ex, { explode: 62, burn: true, trail: true, r: 6, life: 1.3 });
        if (w.kind === "homing") Object.assign(ex, { homing: 5, trail: true, explode: 26, life: 2.2, r: 4 });
        if (w.kind === "boomerang") Object.assign(ex, { boom: 0.45, ghost: true, life: 2.2, r: 6, rehit: 0, spin: true });
        if (w.shape === "bolt") ex.trail = true;
        if (w.shape === "orb") { ex.trail = true; ex.r = 5; }
        newShot(state, p.x, p.y, a, speed, ex);
      });
      break;
    }
    case "spread": {
      const count = w.pellets + (n - 1) * 2;
      for (let i = 0; i < count; i++) {
        const a = ang + rndSign(state) * (w.spread / 2);
        newShot(state, p.x, p.y, a, speed * (0.8 + state.rng() * 0.4), { life: 0.36, r: 2.6, shape: "pellet", trail: true });
      }
      state.fx.push({ kind: "ring", x: p.x + Math.cos(ang) * 14, y: p.y + Math.sin(ang) * 14, r: 22, ttl: 0.12, max: 0.12, color: c });
      break;
    }
    case "burst":
      fan(1, 0.16, (a) => newShot(state, p.x, p.y, a + rndSign(state) * 0.1, speed, { life: 0.9, r: 2.6, trail: true, quiet: true }));
      break;
    case "bounce":
      fan(1, 0.3, (a) => newShot(state, p.x, p.y, a, speed, { bounce: w.bounces, life: w.life || 2.6, r: w.shape === "saw" ? 11 : 7, shape: w.shape, rehit: w.rehit || 0, spin: true, quiet: !!w.rehit }));
      break;
    case "chain": {
      if (!target) return false;
      chainLightning(state, target, w.jumps + st.pierce + (n - 1), D);
      break;
    }
    case "tesla": {
      const list = state.enemies.filter((e) => !e.dead && e.spawn <= 0 && dist2(p, e) <= (w.reach + e.r) ** 2).sort((a, b) => dist2(p, a) - dist2(p, b)).slice(0, w.targets + n - 1);
      if (!list.length) return false;
      for (const e of list) {
        damageEnemy(state, e, D, { knock: 3, from: p });
        applyHitEffects(state, e);
        state.fx.push({ kind: "bolt", pts: [{ x: p.x, y: p.y }, { x: e.x, y: e.y }], ttl: 0.2, max: 0.2, color: c, seed: state.rng() * 1000 });
      }
      state.fx.push({ kind: "ring", x: p.x, y: p.y, r: 30, ttl: 0.2, max: 0.2, color: c });
      break;
    }
    case "beam":
      fan(1, 0.2, (a) => {
        const end = beamEnd(state, p.x, p.y, a, w.len);
        state.fx.push({ kind: "beam", x: p.x, y: p.y, x2: end.x, y2: end.y, width: w.width, ttl: 0.18, max: 0.18, color: c });
        hitSegment(state, p.x, p.y, end.x, end.y, w.width, D, { knock: w.knock || 0, silent: false });
      });
      break;
    case "spiral": {
      state.spin += 0.55;
      const arms = 2 + (n - 1);
      for (let i = 0; i < arms; i++) newShot(state, p.x, p.y, state.spin + (i * Math.PI * 2) / arms, speed, { life: 1.5, r: 3, trail: true, quiet: true });
      break;
    }
    case "nova": {
      const k = 8 + (n - 1) * 2;
      for (let i = 0; i < k; i++) newShot(state, p.x, p.y, (i * Math.PI * 2) / k + state.spin, speed, { life: 0.6, r: 3.5, trail: true });
      state.spin += 0.2;
      state.fx.push({ kind: "ring", x: p.x, y: p.y, r: 40, ttl: 0.25, max: 0.25, color: c });
      break;
    }
    case "mine":
      for (let i = 0; i < n; i++) dropZone(state, { kind: "mine", x: p.x + Math.cos(ang) * 14 + i * 14, y: p.y + Math.sin(ang) * 14, r: w.radius, ttl: 5, arm: 0.5, dmg: D, color: c });
      break;
    case "grenade":
      for (let i = 0; i < n; i++) {
        const q = aimPoint(state, pt, ang, w.reach);
        q.x += (i ? rndSign(state) * 28 : 0); q.y += (i ? rndSign(state) * 28 : 0);
        state.delayed.push({ t: 0.65, max: 0.65, kind: "blast", x: q.x, y: q.y, r: w.radius, dmg: D, ox: p.x, oy: p.y, shape: "grenade", color: c, knock: 20 });
      }
      break;
    case "poison": {
      const q = aimPoint(state, pt, ang, w.reach);
      state.delayed.push({ t: 0.5, max: 0.5, kind: "zone", x: q.x, y: q.y, r: 10, ox: p.x, oy: p.y, shape: "grenade", color: c,
        zone: { kind: "poison", x: q.x, y: q.y, r: w.radius, ttl: 3.4, dps: D * 1.4, color: c } });
      break;
    }
    case "meteor": {
      const pool = state.enemies.filter((e) => !e.dead && e.spawn <= 0 && dist2(p, e) <= w.reach ** 2);
      const picks = [];
      if (pt && !target) picks.push({ x: pt.x, y: pt.y });
      while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0]);
      if (!picks.length) return false;
      for (const e of picks) state.delayed.push({ t: 0.85, max: 0.85, kind: "blast", x: e.x, y: e.y, r: w.radius, dmg: D, shape: "meteor", color: c, burn: true, knock: 18, sky: true });
      break;
    }
    case "hole":
      fan(1, 0.3, (a) => newShot(state, p.x, p.y, a, speed, { life: 0.95, r: 9, shape: "hole", pierce: 99, endZone: { kind: "hole", r: w.radius, ttl: 2.4, dps: D * 1.1, color: c }, ghost: false }));
      break;
    case "turret": {
      const mine = state.zones.filter((z) => z.kind === "turret");
      if (mine.length >= 3 + (n - 1)) mine[0].ttl = 0;
      dropZone(state, { kind: "turret", x: p.x + rndSign(state) * 26, y: p.y + rndSign(state) * 26, r: 10, ttl: 6, dmg: D * 0.8, color: c });
      break;
    }
    case "flame":
      fan(1, 0.22, (a) => newShot(state, p.x, p.y, a + rndSign(state) * 0.22, speed * (0.8 + state.rng() * 0.4), { life: 0.3, r: 5, shape: "flame", burn: true, quiet: true, pierce: st.pierce + 2 }));
      break;
    case "echo":
      fan(1, 0.16, (a) => {
        newShot(state, p.x, p.y, a, speed, { shape: "echo", r: 5, trail: true });
        for (const [t, k] of [[0.14, 0.8], [0.28, 0.6]]) state.delayed.push({ t, max: t, kind: "shot", ang: a, speed, extra: { shape: "echo", r: 5, trail: true, dmg: D * k } });
      });
      break;
    default: return false;
  }
  return true;
}

function playerAttack(state, manual) {
  const { player, stats, weapon: w } = state;
  const reach = w.reach ?? (w.type === "melee" ? stats.range + 30 : 380);
  let ang, target, pt;
  if (manual) {
    pt = manual;
    ang = angleTo(player, pt);
    target = nearestEnemy(state, pt, 150) || nearestEnemy(state, player, reach);
  } else {
    target = nearestEnemy(state, player, reach);
    if (!target) return false;
    pt = target;
    ang = angleTo(player, target);
  }
  player.facing = ang;
  return fireWeapon(state, ang, target, pt);
}

// Zones (poison, vortex, mines, tourelles) et frappes retardées (grenades, météores, échos).
function updateAux(state, dt) {
  const { player } = state;
  for (const d of state.delayed) {
    d.t -= dt;
    if (d.t > 0) continue;
    d.done = true;
    if (d.kind === "blast") blastAt(state, d.x, d.y, d.r, d.dmg, { burn: d.burn, knock: d.knock, sky: d.sky, color: d.color });
    else if (d.kind === "zone") dropZone(state, d.zone);
    else if (d.kind === "shot") newShot(state, player.x, player.y, d.ang, d.speed, d.extra);
  }
  state.delayed = state.delayed.filter((d) => !d.done);

  for (const z of state.zones) {
    z.ttl -= dt;
    z.tick -= dt;
    if (z.kind === "poison" || z.kind === "hole") {
      for (const e of state.enemies) {
        if (e.dead || e.spawn > 0 || dist2(z, e) > (z.r + e.r) ** 2) continue;
        if (z.kind === "hole" && !e.boss && !ENEMIES[e.type]?.still) {
          const d = Math.sqrt(dist2(z, e)) || 1;
          e.x += ((z.x - e.x) / d) * 90 * dt; e.y += ((z.y - e.y) / d) * 90 * dt;
          pushOut(state, e, e.r, e.flying);
        }
        if (z.kind === "poison") e.slow = Math.max(e.slow, 0.3);
        if (z.tick <= 0) damageEnemy(state, e, z.dps * 0.25, { silent: true, noCrit: true });
      }
      if (z.tick <= 0) z.tick = 0.25;
    } else if (z.kind === "mine") {
      z.arm -= dt;
      if (z.arm <= 0) for (const e of state.enemies) if (!e.dead && e.spawn <= 0 && dist2(z, e) <= (28 + e.r) ** 2) { z.ttl = 0; break; }
      if (z.ttl <= 0) blastAt(state, z.x, z.y, z.r, z.dmg, { knock: 22, color: z.color });
    } else if (z.kind === "turret" && z.tick <= 0) {
      const t = nearestEnemy(state, z, 340);
      if (t) { z.tick = 0.4; newShot(state, z.x, z.y, angleTo(z, t), 430, { dmg: z.dmg, pierce: 0, life: 0.9, r: 3, trail: true, quiet: true, color: z.color }); }
      else z.tick = 0.1;
    }
  }
  state.zones = state.zones.filter((z) => z.ttl > 0);
}

// Fin de vie d'un projectile : explosion ou vortex éventuels.
function endShot(state, s) {
  if (s.done) return;
  s.done = true;
  if (s.endZone) dropZone(state, { ...s.endZone, x: s.x, y: s.y });
  else if (s.explode) blastAt(state, s.x, s.y, s.explode, s.dmg * 0.7, { burn: s.burn, color: s.color, knock: 10 });
}


function useSkill(state, input) {
  const { player, stats, cls } = state;
  player.skillCd = stats.skillCd;
  const id = cls.id;
  if (id === "knight") {
    const r = 86;
    state.fx.push({ kind: "ring", x: player.x, y: player.y, r, ttl: 0.35, max: 0.35, color: cls.color });
    for (const e of state.enemies) {
      if (!e.dead && dist2(player, e) <= (r + e.r) ** 2) { damageEnemy(state, e, stats.damage * 2.4, { knock: 22, from: player }); applyHitEffects(state, e); }
    }
  } else if (id === "ranger") {
    for (let i = 0; i < 12; i++) {
      const dir = (i * Math.PI * 2) / 12;
      state.shots.push({ x: player.x, y: player.y, vx: Math.cos(dir) * 360, vy: Math.sin(dir) * 360, dmg: stats.damage * 1.3, pierce: stats.pierce + 1, life: 1.1, hit: new Set(), color: cls.color });
    }
  } else if (id === "mage") {
    const r = 140;
    state.fx.push({ kind: "blast", x: player.x, y: player.y, r, ttl: 0.4, max: 0.4, color: cls.color });
    state.bullets = state.bullets.filter((b) => dist2(player, b) > r * r);
    for (const e of state.enemies) {
      if (!e.dead && dist2(player, e) <= (r + e.r) ** 2) { damageEnemy(state, e, stats.damage * 3, { knock: 30, from: player }); e.slow = 2; applyHitEffects(state, e); }
    }
  } else if (id === "rogue") {
    let dx = input.dx, dy = input.dy;
    if (!dx && !dy) { dx = Math.cos(player.facing); dy = Math.sin(player.facing); }
    const len = Math.hypot(dx, dy) || 1;
    state.fx.push({ kind: "ring", x: player.x, y: player.y, r: 20, ttl: 0.25, max: 0.25, color: cls.color });
    player.x += (dx / len) * 110;
    player.y += (dy / len) * 110;
    pushOut(state, player, PLAYER_R);
    player.ghost = 0.5;
    player.crit100 = 4;
  }
}

/* ---------- IA des ennemis ---------- */

function moveEnemy(state, e, vx, vy, dt) {
  const k = e.slow > 0 ? 0.55 : 1;
  e.x += vx * k * dt;
  e.y += vy * k * dt;
  if (e.type === "wisp") { e.x = clamp(e.x, X0 + e.r, X1 - e.r); e.y = clamp(e.y, Y0 + e.r, Y1 - e.r); }
  else pushOut(state, e, e.r, e.flying);
}

function explode(state, e, radius, dmgMul = 1) {
  state.fx.push({ kind: "blast", x: e.x, y: e.y, r: radius, ttl: 0.35, max: 0.35, color: "#ff5a36" });
  if (dist2(e, state.player) <= (radius + PLAYER_R) ** 2) hurtPlayer(state, e.dmg * dmgMul);
}

function summon(state, type, x, y, parent = 0) {
  if (state.enemies.length >= 16) return;
  state.enemies.push(makeEnemy(state, type, x, y, { spawn: 0.5, parent }));
}

function bossAI(state, e, dt) {
  const p = state.player;
  const enraged = e.hp < e.maxHp * 0.5;
  const base = angleTo(e, p);
  e.cd -= dt;
  switch (e.type) {
    case "golem":
      if (e.st === "windup") {
        e.t -= dt;
        if (e.t <= 0) { e.st = "dash"; e.t = 0.7; e.vx = Math.cos(e.dir) * 330; e.vy = Math.sin(e.dir) * 330; }
      } else if (e.st === "dash") {
        e.t -= dt;
        moveEnemy(state, e, e.vx, e.vy, dt);
        if (e.t <= 0) { e.st = "idle"; e.cd = enraged ? 1.5 : 2.4; }
      } else {
        moveEnemy(state, e, Math.cos(base) * e.speedBase, Math.sin(base) * e.speedBase, dt);
        if (e.cd <= 0) {
          e.n = (e.n || 0) + 1;
          if (e.n % 3 === 0) { e.st = "windup"; e.t = 0.8; e.dir = base; }
          else {
            const count = enraged ? 20 : 14;
            const off = state.rng() * 6;
            for (let i = 0; i < count; i++) enemyShoot(state, e, off + (i * Math.PI * 2) / count, 130, 0.6, { color: "#ff8a3d" });
            e.cd = enraged ? 1.8 : 2.8;
          }
        }
      }
      break;
    case "spider": {
      e.phase = (e.phase || 0) + dt;
      const ang = base + (Math.PI / 2) * Math.sin(e.phase * 0.9);
      const d = Math.sqrt(dist2(e, p));
      const toward = d > 190 ? 1 : d < 120 ? -1 : 0;
      moveEnemy(state, e, Math.cos(base) * e.speedBase * toward + Math.cos(ang) * e.speedBase * 0.7, Math.sin(base) * e.speedBase * toward + Math.sin(ang) * e.speedBase * 0.7, dt);
      if (e.cd <= 0) {
        const n = enraged ? 7 : 5;
        for (let i = 0; i < n; i++) enemyShoot(state, e, base + (i - (n - 1) / 2) * 0.22, 190, 0.7, { color: "#ff2a6d" });
        e.cd = 1.8;
        e.summonT = (e.summonT || 0) + 1;
        if (e.summonT % 3 === 0) for (let i = 0; i < 2; i++) summon(state, "bat", e.x + (i ? 24 : -24), e.y);
      }
      break;
    }
    case "lich":
      e.t = (e.t || 0) + dt;
      if (e.t > (enraged ? 3 : 4.2)) {
        e.t = 0;
        state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 30, ttl: 0.3, max: 0.3, color: "#b58cff" });
        const pt = spawnPoint(state, 140);
        e.x = pt.x; e.y = pt.y;
        const count = enraged ? 16 : 10;
        for (let i = 0; i < count; i++) enemyShoot(state, e, (i * Math.PI * 2) / count, 150, 0.6, { color: "#b58cff" });
        summon(state, "archer", e.x, e.y + 30);
      }
      if (e.cd <= 0) {
        e.cd = enraged ? 1.1 : 1.6;
        enemyShoot(state, e, base, 120, 0.8, { color: "#e0c9ff", r: 5, homing: 1.2 });
      }
      moveEnemy(state, e, Math.cos(base + Math.PI / 2) * 24, Math.sin(base + Math.PI / 2) * 24, dt);
      break;
    case "sentinel": {
      // Immobile : motifs de tirs en spirale puis salves ciblées ; des tourelles à mi-vie.
      e.mt = (e.mt || 0) + dt;
      e.mode = e.mode || "spiral";
      e.shotCd = (e.shotCd || 0) - dt;
      if (e.mode === "spiral") {
        if (e.shotCd <= 0) {
          e.shotCd = enraged ? 0.09 : 0.13;
          e.spin = (e.spin || 0) + 0.33;
          const arms = enraged ? 4 : 3;
          for (let i = 0; i < arms; i++) enemyShoot(state, e, e.spin + (i * Math.PI * 2) / arms, 125, 0.55, { color: "#9aa4c7" });
        }
        if (e.mt > 4.5) { e.mode = "volley"; e.mt = 0; e.burst = 0; }
      } else {
        if (e.shotCd <= 0) {
          e.shotCd = 0.55;
          e.burst += 1;
          for (let i = -3; i <= 3; i++) enemyShoot(state, e, base + i * 0.2, 175, 0.7, { color: "#e0e6ff" });
          if (e.burst >= 4) { e.mode = "spiral"; e.mt = 0; }
        }
      }
      if (enraged && !e.turrets) {
        e.turrets = true;
        summon(state, "turret", X0 + 70, Y0 + 70);
        summon(state, "turret", X1 - 70, Y0 + 70);
      }
      break;
    }
    case "slimeking": {
      if (e.st === "hop") {
        e.t -= dt;
        moveEnemy(state, e, e.vx, e.vy, dt);
        if (e.t <= 0) {
          e.st = "idle"; e.cd = enraged ? 0.7 : 1.1;
          const count = enraged ? 14 : 10;
          for (let i = 0; i < count; i++) enemyShoot(state, e, (i * Math.PI * 2) / count + state.rng(), 140, 0.55, { color: "#5bdc6b" });
          state.fx.push({ kind: "ring", x: e.x, y: e.y, r: e.r + 30, ttl: 0.3, max: 0.3, color: "#5bdc6b" });
        }
      } else if (e.cd <= 0) {
        e.st = "hop"; e.t = 0.5; e.vx = Math.cos(base) * 230; e.vy = Math.sin(base) * 230;
      }
      // à 75 %, 50 % et 25 % de vie : il se divise en gelées
      while (e.marks.length && e.hp <= e.maxHp * e.marks[0]) {
        e.marks.shift();
        for (let i = 0; i < 3; i++) summon(state, i === 1 ? "splitter" : "slime", e.x + (i - 1) * 34, e.y + 20);
        state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 80, ttl: 0.4, max: 0.4, color: "#5bdc6b" });
      }
      break;
    }
    case "reaper": {
      e.rainT = (e.rainT || 0) + dt;
      if (e.st === "windup") {
        e.t -= dt;
        if (e.t <= 0) { e.st = "dash"; e.t = 0.5; e.vx = Math.cos(e.dir) * 540; e.vy = Math.sin(e.dir) * 540; }
      } else if (e.st === "dash") {
        e.t -= dt;
        moveEnemy(state, e, e.vx, e.vy, dt);
        if (e.t <= 0) {
          e.st = "idle"; e.cd = enraged ? 1.4 : 2.2;
          for (let i = -2; i <= 2; i++) enemyShoot(state, e, angleTo(e, p) + i * 0.25, 170, 0.7, { color: "#e8e8ff" });
        }
      } else {
        const ang = base + Math.PI / 2;
        const d = Math.sqrt(dist2(e, p));
        const toward = d > 200 ? 1 : d < 130 ? -1 : 0;
        moveEnemy(state, e, Math.cos(base) * e.speedBase * toward + Math.cos(ang) * 40, Math.sin(base) * e.speedBase * toward + Math.sin(ang) * 40, dt);
        if (e.cd <= 0) { e.st = "windup"; e.t = 0.8; e.dir = base; }
      }
      // pluie de projectiles verticaux
      if (e.rainT > (enraged ? 2.6 : 3.8)) {
        e.rainT = 0;
        for (let i = 0; i < 6; i++) {
          const x = X0 + 40 + state.rng() * (X1 - X0 - 80);
          state.bullets.push({ x, y: Y0 + 4, vx: 0, vy: 170, dmg: e.dmg * 0.6, life: 4, r: 5, color: "#9aa4ff", homing: 0 });
        }
      }
      if (enraged && !e.wisps) { e.wisps = true; for (let i = 0; i < 3; i++) summon(state, "wisp", e.x + (i - 1) * 40, e.y); }
      break;
    }
    default: break;
  }
}

function enemyAI(state, e, dt) {
  const p = state.player;
  const def = e.boss ? null : ENEMIES[e.type];
  const speed = e.speedBase;
  const base = angleTo(e, p);
  const d = Math.sqrt(dist2(e, p));
  e.cd -= dt;
  switch (e.boss ? "boss" : def.ai) {
    case "boss": bossAI(state, e, dt); break;
    case "chase": moveEnemy(state, e, Math.cos(base) * speed, Math.sin(base) * speed, dt); break;
    case "wisp": {
      // traverse les murs, lent mais obstiné ; ondule légèrement
      const wob = base + Math.sin(state.time * 2 + e.id) * 0.5;
      moveEnemy(state, e, Math.cos(wob) * speed, Math.sin(wob) * speed, dt);
      break;
    }
    case "flutter": {
      const wob = base + Math.sin(state.time * 5 + e.id) * 0.9;
      moveEnemy(state, e, Math.cos(wob) * speed, Math.sin(wob) * speed, dt);
      break;
    }
    case "archer": {
      const dir = d > 230 ? 1 : d < 150 ? -1 : 0;
      const side = Math.sin(state.time + e.id) * 0.6;
      moveEnemy(state, e, Math.cos(base) * speed * dir + Math.cos(base + Math.PI / 2) * speed * side, Math.sin(base) * speed * dir + Math.sin(base + Math.PI / 2) * speed * side, dt);
      if (e.cd <= 0) { enemyShoot(state, e, base, 175); e.cd = 1.9; }
      break;
    }
    case "mage": {
      const dir = d > 240 ? 1 : d < 170 ? -1 : 0;
      moveEnemy(state, e, Math.cos(base) * speed * dir, Math.sin(base) * speed * dir, dt);
      if (e.cd <= 0) {
        for (let i = -1; i <= 1; i++) enemyShoot(state, e, base + i * 0.28, 145, 1, { color: "#a066ff" });
        e.cd = 2.8;
      }
      break;
    }
    case "charger": {
      if (e.st === "windup") {
        e.t -= dt;
        if (e.t <= 0) { e.st = "dash"; e.t = 0.6; }
      } else if (e.st === "dash") {
        e.t -= dt;
        moveEnemy(state, e, Math.cos(e.dir) * 290, Math.sin(e.dir) * 290, dt);
        if (e.t <= 0) { e.st = "idle"; e.cd = 1.6; }
      } else {
        moveEnemy(state, e, Math.cos(base) * speed, Math.sin(base) * speed, dt);
        if (d < 210 && e.cd <= 0) { e.st = "windup"; e.t = 0.7; e.dir = base; }
      }
      break;
    }
    case "turret": {
      e.spin = (e.spin || 0) + dt * 0.8;
      if (e.cd <= 0) {
        e.cd = 2.2;
        e.alt = !e.alt;
        if (e.alt) for (let i = 0; i < 4; i++) enemyShoot(state, e, e.spin + (i * Math.PI) / 2, 130, 0.9, { color: "#9aa4c7" });
        else for (let i = -1; i <= 1; i++) enemyShoot(state, e, base + i * 0.18, 160, 0.9, { color: "#9aa4c7" });
      }
      break;
    }
    case "bomber": {
      if (e.st === "fuse") {
        e.t -= dt;
        if (e.t <= 0) { explode(state, e, 62); e.hp = 0; killEnemy(state, e); }
      } else {
        moveEnemy(state, e, Math.cos(base) * speed, Math.sin(base) * speed, dt);
        if (d < 50) { e.st = "fuse"; e.t = 0.8; }
      }
      break;
    }
    case "hopper": {
      if (e.st === "hop") {
        e.t -= dt;
        moveEnemy(state, e, Math.cos(e.dir) * 230, Math.sin(e.dir) * 230, dt);
        if (e.t <= 0) { e.st = "idle"; e.cd = 0.7; }
      } else if (e.cd <= 0) { e.st = "hop"; e.t = 0.35; e.dir = base + (state.rng() - 0.5) * 0.5; }
      break;
    }
    case "spawner": {
      if (e.cd <= 0) {
        e.cd = 4;
        const mine = state.enemies.filter((o) => !o.dead && o.parent === e.id).length;
        if (mine < 3) summon(state, "bat", e.x, e.y + e.r + 6, e.id);
      }
      break;
    }
    case "orbiter": {
      e.ang = (e.ang ?? Math.atan2(e.y - p.y, e.x - p.x)) + dt * 0.9;
      const tx = p.x + Math.cos(e.ang) * 150, ty = p.y + Math.sin(e.ang) * 150;
      const dx = tx - e.x, dy = ty - e.y;
      const l = Math.hypot(dx, dy) || 1;
      moveEnemy(state, e, (dx / l) * Math.min(speed * 1.6, l * 4), (dy / l) * Math.min(speed * 1.6, l * 4), dt);
      if (e.cd <= 0) { enemyShoot(state, e, base, 150, 0.9, { color: "#4dffd2" }); e.cd = 2.1; }
      break;
    }
    default: break;
  }
  if (e.st !== "fuse" && d < e.r + PLAYER_R) hurtPlayer(state, e.dmg);
}

/* ---------- Un pas de simulation ---------- */

// input : { dx, dy, skill }. Renvoie { over, roomCleared, moved, floorUp, choices }.
export function update(state, dt, input = { dx: 0, dy: 0, skill: false }) {
  const events = { over: false, roomCleared: false, moved: false, floorUp: false, choices: false, bought: false };
  if (state.over || state.choices) return events;
  const { player, stats } = state;
  state.time += dt;
  if (state.banner) { state.banner.ttl -= dt; if (state.banner.ttl <= 0) state.banner = null; }

  /* Déplacement */
  let { dx, dy } = input;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  player.x += dx * stats.speed * dt;
  player.y += dy * stats.speed * dt;
  pushOut(state, player, PLAYER_R);
  if (dx || dy) player.facing = Math.atan2(dy, dx);
  if (input.manual && input.aim) player.facing = angleTo(player, input.aim);
  player.inv = Math.max(0, player.inv - dt);
  player.ghost = Math.max(0, player.ghost - dt);
  player.crit100 = Math.max(0, player.crit100 - dt);
  player.skillCd = Math.max(0, player.skillCd - dt);
  if (stats.regen) player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
  if (stats.shieldMax > 0 && player.shield < stats.shieldMax) {
    player.shieldT -= dt;
    if (player.shieldT <= 0) { player.shield += 1; player.shieldT = stats.shieldCd; }
  }
  // piques au sol
  if (tileAtPoint(state, player.x, player.y) === "x") {
    player.spikeT -= dt;
    if (player.spikeT <= 0) { player.spikeT = 0.6; hurtPlayer(state, 6 + state.floor); }
  }

  /* Compétence et attaque automatique */
  if (input.skill && player.skillCd <= 0) useSkill(state, input);
  player.cd -= dt;
  if (player.cd <= 0) {
    if (input.manual) {
      if (input.fire) player.cd = playerAttack(state, input.aim || { x: player.x + Math.cos(player.facing) * 120, y: player.y + Math.sin(player.facing) * 120 }) ? 1 / stats.rate : 0.04;
      else player.cd = 0;
    } else player.cd = playerAttack(state, null) ? 1 / stats.rate : 0.05;
  }
  updateAux(state, dt);

  /* Apparition des ennemis de la vague */
  state.spawnClock += dt;
  while (state.spawnList.length && state.spawnList[0].at <= state.spawnClock) {
    const s = state.spawnList.shift();
    state.enemies.push(makeEnemy(state, s.type, s.x, s.y, { elite: s.elite }));
  }

  /* Orbes gardiens */
  if (stats.orbs) state.orbAngle += dt * 2.6;
  const orbPos = (i) => ({ x: player.x + Math.cos(state.orbAngle + (i * Math.PI * 2) / stats.orbs) * 38, y: player.y + Math.sin(state.orbAngle + (i * Math.PI * 2) / stats.orbs) * 38 });

  /* Ennemis */
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;
    if (e.burn > 0) { e.burn -= dt; damageEnemy(state, e, e.burnDps * dt, { silent: true, noCrit: true }); if (e.dead) continue; }
    if (e.spawn > 0) { e.spawn -= dt; continue; }
    enemyAI(state, e, dt);
    if (state.over) break;
    if (e.dead) continue;
    if (stats.thorns && dist2(e, player) < (e.r + PLAYER_R + 8) ** 2) damageEnemy(state, e, 10 * stats.thorns * dt, { silent: true, noCrit: true });
    if (stats.orbs) {
      e.orbCd = Math.max(0, (e.orbCd || 0) - dt);
      for (let i = 0; i < stats.orbs && e.orbCd <= 0; i++) {
        if (dist2(orbPos(i), e) <= (e.r + 8) ** 2) { damageEnemy(state, e, stats.damage * 0.8, { knock: 8, from: player }); e.orbCd = 0.4; }
      }
    }
  }
  // Séparation douce entre ennemis
  for (let i = 0; i < state.enemies.length; i++) {
    const a = state.enemies[i];
    if (a.dead || a.spawn > 0 || a.boss || ENEMIES[a.type]?.still) continue;
    for (let j = i + 1; j < state.enemies.length; j++) {
      const b = state.enemies[j];
      if (b.dead || b.spawn > 0 || b.boss || ENEMIES[b.type]?.still) continue;
      const min = a.r + b.r;
      const d2 = dist2(a, b);
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        a.x += ((a.x - b.x) / d) * push; a.y += ((a.y - b.y) / d) * push;
        b.x -= ((a.x - b.x) / d) * push; b.y -= ((a.y - b.y) / d) * push;
      }
    }
  }

  /* Projectiles du joueur */
  for (const s of state.shots) {
    s.age += dt;
    if (s.homing) {
      const t = nearestEnemy(state, s, 280);
      if (t) {
        const cur = Math.atan2(s.vy, s.vx);
        let diff = angleTo(s, t) - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const sp = Math.hypot(s.vx, s.vy), a = cur + clamp(diff, -s.homing * dt, s.homing * dt);
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
      }
    }
    if (s.boom && s.age > s.boom) {
      if (!s.back) { s.back = true; s.hit.clear(); }
      const sp = Math.max(Math.hypot(s.vx, s.vy), 300), a = angleTo(s, player);
      s.vx = Math.cos(a) * sp * 1.1; s.vy = Math.sin(a) * sp * 1.1;
      if (dist2(s, player) < 16 * 16) { s.life = 0; s.done = true; }
    }
    if (s.rehit) { s.rt = (s.rt || 0) + dt; if (s.rt > s.rehit) { s.rt = 0; s.hit.clear(); } }
    const ox = s.x, oy = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.trail) { s.tr.push({ x: ox, y: oy }); if (s.tr.length > 7) s.tr.shift(); }
    const outX = s.x < X0 || s.x > X1, outY = s.y < Y0 || s.y > Y1;
    if (outX || outY || rockAt(state, s.x, s.y)) {
      if (s.ghost) { s.x = clamp(s.x, X0, X1); s.y = clamp(s.y, Y0, Y1); }
      else if (s.bounce > 0) {
        const hx = outX || rockAt(state, s.x, oy), hy = outY || rockAt(state, ox, s.y);
        if (hx || !hy) s.vx *= -1;
        if (hy || !hx) s.vy *= -1;
        s.x = ox; s.y = oy; s.bounce -= 1;
        state.fx.push({ kind: "ring", x: s.x, y: s.y, r: 12, ttl: 0.15, max: 0.15, color: s.color });
      } else s.life = 0;
    }
    if (s.life <= 0) { endShot(state, s); continue; }
    for (const e of state.enemies) {
      if (e.dead || e.spawn > 0 || s.hit.has(e.id)) continue;
      if (dist2(s, e) <= (e.r + s.r) ** 2) {
        s.hit.add(e.id);
        damageEnemy(state, e, s.dmg, { knock: s.explode ? 0 : 6, from: s, silent: !!s.quiet });
        applyHitEffects(state, e, s);
        if (s.pierce <= 0) { s.life = 0; endShot(state, s); break; }
        s.pierce -= 1;
      }
    }
  }
  state.shots = state.shots.filter((s) => s.life > 0);

  /* Projectiles ennemis */
  for (const b of state.bullets) {
    if (b.homing) {
      const cur = Math.atan2(b.vy, b.vx);
      let diff = angleTo(b, player) - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = cur + clamp(diff, -b.homing * dt, b.homing * dt);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(turn) * sp;
      b.vy = Math.sin(turn) * sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.x < X0 - 8 || b.x > X1 + 8 || b.y < Y0 - 8 || b.y > Y1 + 8 || rockAt(state, b.x, b.y)) b.life = 0;
    if (b.life > 0 && stats.orbs) {
      for (let i = 0; i < stats.orbs; i++) if (dist2(orbPos(i), b) <= 11 * 11) { b.life = 0; break; }
    }
    if (b.life > 0 && dist2(b, player) <= (PLAYER_R + b.r - 2) ** 2) { hurtPlayer(state, b.dmg); b.life = 0; }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
  state.enemies = state.enemies.filter((e) => !e.dead);

  /* Butin au sol */
  for (const pk of state.pickups) {
    const d = Math.sqrt(dist2(pk, player)) || 1;
    if (d < stats.magnet) {
      const v = 240 * dt;
      pk.x += ((player.x - pk.x) / d) * v;
      pk.y += ((player.y - pk.y) / d) * v;
    }
    if (d < PLAYER_R + 8) {
      pk.taken = true;
      if (pk.kind === "coin") { state.coins += pk.v; state.coinsEarned += pk.v; }
      else player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * pk.v);
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  /* Vague suivante ou salle terminée */
  if (!state.cleared && !state.spawnList.length && !state.enemies.some((e) => !e.dead)) {
    if (state.wavesLeft > 0) {
      state.wavesLeft -= 1;
      planWave(state, false);
      state.banner = { text: "Deuxième vague !", ttl: 1.2 };
    } else {
      state.cleared = true;
      state.room.cleared = true;
      state.roomsCleared += 1;
      events.roomCleared = true;
      state.bullets = [];
      if (state.room.type === "boss") {
        state.chest = { x: (X0 + X1) / 2 - 60, y: (Y0 + Y1) / 2 + 30, opened: false, kind: "boss" };
        state.trapdoor = { x: (X0 + X1) / 2 + 60, y: (Y0 + Y1) / 2 + 30 };
        state.room.trap = true;
        state.room.bossChest = true;
      } else if (state.rng() < 0.5) {
        drop(state, (X0 + X1) / 2, (Y0 + Y1) / 2, state.rng() < 0.5 ? "heart" : "coin", state.rng() < 0.5 ? 0.2 : 3);
      }
    }
  }

  /* Coffre, boutique, trappe, portes */
  if (state.chest && !state.chest.opened && dist2(state.chest, player) < 26 * 26) {
    state.chest.opened = true;
    if (state.room.type === "treasure") state.room.taken = true;
    if (state.room.type === "boss") state.room.bossChest = false;
    state.choices = rollChoices(state);
    events.choices = true;
  }
  if (state.room.stands) {
    for (const s of state.room.stands) {
      if (s.sold || dist2(s, player) > 22 * 22 || state.coins < s.price) continue;
      state.coins -= s.price;
      s.sold = true;
      if (s.kind === "heart") player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.4);
      else { ITEMS[s.id].apply(stats, player, state.weapon); state.owned[s.id] = (state.owned[s.id] || 0) + 1; }
      state.fx.push({ kind: "ring", x: s.x, y: s.y, r: 30, ttl: 0.3, max: 0.3, color: "#fcee0a" });
      events.bought = true;
    }
  }
  if (state.trapdoor && !state.choices && dist2(state.trapdoor, player) < 24 * 24) {
    state.floor += 1;
    player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.3);
    startFloor(state);
    events.floorUp = true;
  } else if (state.cleared && !state.choices) {
    for (const [d, door] of Object.entries(DOORS)) {
      if (!state.room.doors[d]) continue;
      const near = d === "u" ? player.y <= Y0 + PLAYER_R + 3 && Math.abs(player.x - door.x) < 26
        : d === "d" ? player.y >= Y1 - PLAYER_R - 3 && Math.abs(player.x - door.x) < 26
        : d === "l" ? player.x <= X0 + PLAYER_R + 3 && Math.abs(player.y - door.y) < 26
        : player.x >= X1 - PLAYER_R - 3 && Math.abs(player.y - door.y) < 26;
      if (!near) continue;
      const v = DIRS[d];
      const next = state.map.rooms.find((r) => r.gx === state.room.gx + v.dx && r.gy === state.room.gy + v.dy);
      if (next) { enterRoom(state, next, v.opp); events.moved = true; }
      break;
    }
  }

  for (const f of state.fx) f.ttl -= dt;
  state.fx = state.fx.filter((f) => f.ttl > 0);

  if (state.over) events.over = true;
  return events;
}

/* ---------- Coffres ---------- */

export function rollChoices(state) {
  const pool = ITEM_IDS.filter((id) => (state.owned[id] || 0) < ITEMS[id].max);
  const count = state.ranks.luck ? 4 : 3;
  const picks = [];
  while (picks.length < count && pool.length) picks.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0]);
  while (picks.length < Math.min(count, 3)) picks.push("heal");
  return picks;
}

export function chooseItem(state, id) {
  if (!state.choices || !state.choices.includes(id)) return false;
  if (id === "heal") {
    state.player.hp = Math.min(state.stats.maxHp, state.player.hp + state.stats.maxHp * 0.4);
  } else {
    ITEMS[id].apply(state.stats, state.player, state.weapon);
    state.owned[id] = (state.owned[id] || 0) + 1;
  }
  state.choices = null;
  return true;
}

/* ---------- Récompenses de fin de partie ---------- */

// Âmes : monnaie permanente (classes, améliorations). Crédits et pièces bleues : monnaies de l'arcade.
export function runRewards(state) {
  const greed = 1 + 0.15 * (state.ranks.greed || 0);
  const souls = Math.floor(((state.floor - 1) * 14 + state.roomsCleared * 2 + state.kills / 4 + state.bossKills * 30 + state.coinsEarned / 3) * greed);
  const credits = Math.floor(state.floor * 8 + state.roomsCleared * 2 + state.kills / 3);
  return { souls, credits, coins: state.bossKills, floor: state.floor };
}
