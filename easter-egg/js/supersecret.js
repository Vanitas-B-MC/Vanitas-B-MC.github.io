/* Crypte Néon — plateformer d'action 2D (façon roguelite « Dead Cells »)
 * Page secrète du portfolio. JS pur + canvas, aucune dépendance.
 */
(() => {
"use strict";

// ================================================================== constantes
const W = 960, H = 544, T = 32, GRAV = 1900, LAST = 5, MIDB = 2;   // 6 étages : boss intermédiaire à l'étage 3, boss final au 6e
const Z = 1.25, VW = W / Z, VH = H / Z;                  // zoom caméra : personnages plus lisibles
let ROWS = 40;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
cv.width = W; cv.height = H;
const ov = document.getElementById("ov");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const SOL = (t) => t === 1 || t === 4 || t === 5 || t === 6;          // tuiles pleines (4 = mur fissuré, 5 = sol fissuré)
const FLOOR = (t) => t === 1 || t === 2 || t === 4 || t === 5 || t === 6;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ================================================================== données
// sky : style des arrière-plans · amb : obscurité ambiante · mote : particules d'ambiance · plat : style des plateformes
const BIOMES = {
  cachots:   { tstyle: "block", name: "Les Cachots", bg: ["#0b0b1a", "#04040a"], far: "#10122a", near: "#161a36", accent: "#00f0ff", tile: "#1b2138", tile2: "#20284a", edge: "#2b3a78", moss: "#2f7d86", back: "#0e1124", sky: "castle", amb: .62, mote: "dust", plat: "wood", style: "net", nx: 6, ny: 3, diff: 1, fog: null,      mix: { zombie: .34, archer: .22, leaper: .18, bomber: .14, grenadier: .12 },             bat: .25, pit: .10, traps: .25, secret: .5,  reward: null,     rewardTxt: "Équilibré", cellMul: 1 },
  egouts:    { tstyle: "rock", name: "Les Égouts toxiques", bg: ["#06140f", "#030806"], far: "#0b241b", near: "#10301f", accent: "#3dff9a", tile: "#132a20", tile2: "#183326", edge: "#1f6a48", moss: "#4fbf3a", back: "#08150f", sky: "pipes", amb: .66, mote: "drip", plat: "metal", style: "prom", nx: 8, ny: 3, diff: 2, fog: "#3dff9a", mix: { zombie: .26, archer: .12, brute: .14, slime: .26, bomber: .14, grenadier: .08 }, bat: .45, pit: .18, traps: .3, secret: .45, reward: "cells",  rewardTxt: "Cellules ×1,5", cellMul: 1.5 },
  archives:  { tstyle: "panel", name: "Les Archives interdites", bg: ["#100a1e", "#06030c"], far: "#1a1030", near: "#241640", accent: "#b58bff", tile: "#211839", tile2: "#281d45", edge: "#5a3aa0", moss: "#8a5ad0", back: "#120c22", sky: "shelves", amb: .6, mote: "pages", plat: "wood", style: "net", nx: 5, ny: 4, diff: 2, fog: "#b58bff", mix: { zombie: .1, archer: .24, mage: .26, shield: .2, leaper: .1, brute: .08 }, bat: .25, pit: .10, traps: .2, secret: .6, reward: "weapon", rewardTxt: "Autel d'arme rare", cellMul: 1 },
  abysses:   { tstyle: "rock", name: "Les Abysses", bg: ["#060c1c", "#02040a"], far: "#0a1530", near: "#0e1c40", accent: "#4d8dff", tile: "#111c3a", tile2: "#152346", edge: "#2a52a8", moss: "#2a8acf", back: "#081022", sky: "caves", amb: .64, mote: "bubble", plat: "metal", style: "prom", nx: 7, ny: 4, diff: 3, fog: "#4d8dff", mix: { zombie: .13, brute: .16, charger: .19, mage: .14, slime: .13, shield: .1, leaper: .08, grenadier: .07 }, bat: .6, pit: .26, traps: .35, secret: .45, reward: "cells",  rewardTxt: "Cellules ×2 · très dangereux", cellMul: 2 },
  citadelle: { tstyle: "marble", name: "La Citadelle écarlate", bg: ["#17060e", "#08030a"], far: "#2a0d1b", near: "#3a1224", accent: "#ff2e97", tile: "#2c1420", tile2: "#351a27", edge: "#7a2448", moss: "#c0305a", back: "#170810", sky: "spires", amb: .58, mote: "ember", plat: "wood", style: "net", nx: 6, ny: 4, diff: 3, fog: "#ff2e97", mix: { brute: .18, shield: .22, charger: .18, mage: .14, bomber: .1, archer: .08, grenadier: .1 }, bat: .3, pit: .14, traps: .4, secret: .45, reward: "skill",  rewardTxt: "Autel de compétence", cellMul: 1 },
  bossArch:  { tstyle: "panel", name: "La Grande Bibliothèque", bg: ["#140a26", "#06030e"], far: "#20123a", near: "#2c1a4c", accent: "#c08bff", tile: "#261b40", tile2: "#2e2150", edge: "#6a44b8", moss: "#9a6ae0", back: "#150d28", sky: "shelves", amb: .5, mote: "pages", plat: "wood", cols: 46, diff: 3, fog: "#b58bff", boss: "archi", rewardTxt: "Boss · L'Archiviste" },
  bossSlime: { tstyle: "rock", name: "Le Bassin putride", bg: ["#071a10", "#020805"], far: "#0c2a1a", near: "#123822", accent: "#5aff7a", tile: "#16301f", tile2: "#1b3a26", edge: "#2a7a48", moss: "#6adf3a", back: "#0a1a10", sky: "pipes", amb: .52, mote: "drip", plat: "metal", cols: 56, diff: 3, fog: "#3dff9a", boss: "matri", rewardTxt: "Boss · La Matriarche" },
  boss:      { tstyle: "block", name: "La Salle du Concierge", bg: ["#1a1206", "#0a0703"], far: "#2a1d0a", near: "#38270e", accent: "#ffb020", tile: "#2a2016", tile2: "#33271b", edge: "#7a5a22", moss: "#a07a2a", back: "#1c140b", sky: "spires", amb: .45, mote: "ember", plat: "metal", cols: 52, diff: 4, fog: "#ffb020", boss: "boss", final: true, rewardTxt: "Boss final · Le Concierge" },
};
const POOLS = { 1: ["egouts", "archives", "abysses"], 3: ["archives", "abysses", "citadelle", "egouts"], 4: ["citadelle", "abysses", "archives"] };
const MID_BOSSES = ["bossArch", "bossSlime"];

const ENEMY = {
  zombie: { w: 22, h: 30, hp: 32, dmg: 10 },
  archer: { w: 20, h: 30, hp: 22, dmg: 8 },
  bat:    { w: 20, h: 14, hp: 14, dmg: 7, fly: true, contact: 7 },
  brute:  { w: 32, h: 42, hp: 90, dmg: 22, armor: true },
  bomber: { w: 22, h: 26, hp: 16, dmg: 26 },
  shield: { w: 26, h: 36, hp: 62, dmg: 14 },
  mage:   { w: 20, h: 32, hp: 26, dmg: 13 },
  leaper: { w: 22, h: 22, hp: 24, dmg: 13, contact: 6 },
  slime:  { w: 28, h: 20, hp: 34, dmg: 8, contact: 8 },
  slimeS: { w: 16, h: 12, hp: 9, dmg: 6, contact: 6 },
  charger:{ w: 42, h: 28, hp: 58, dmg: 22 },
  grenadier: { w: 22, h: 30, hp: 28, dmg: 17 },
  boss:   { w: 56, h: 76, hp: 760, dmg: 18, armor: true, contact: 9 },
  archi:  { w: 40, h: 58, hp: 560, dmg: 15, armor: true, contact: 8, fly: true },
  matri:  { w: 92, h: 62, hp: 640, dmg: 17, armor: true, contact: 10 },
};
const BOSS_T = { boss: 1, archi: 1, matri: 1 };
const BOSSINFO = {
  boss:  { name: "LE CONCIERGE", sub: "gardien des clés de la Crypte", col: "#ffb020", c3: "#ff2e97" },
  archi: { name: "L'ARCHIVISTE", sub: "celle qui a lu tous les livres interdits", col: "#c08bff", c3: "#ff4dd8" },
  matri: { name: "LA MATRIARCHE", sub: "mère de toutes les gelées", col: "#5aff7a", c3: "#d8ff3a" },
};
const ECOL = { archi: "#c08bff", matri: "#5aff7a", zombie: "#6f8f6f", archer: "#d6dcec", bat: "#7a3aaa", brute: "#8a3a3a", bomber: "#c23b2e", shield: "#7d8cab", mage: "#6a4aaa", leaper: "#a07a4a", slime: "#3dff9a", slimeS: "#3dff9a", charger: "#7d5a3a", grenadier: "#9a7a40", boss: "#ffb020" };
const ENAME = { zombie: "Zombie", archer: "Archer", bat: "Chauve-souris", brute: "Brute", bomber: "Kamikaze", shield: "Garde", mage: "Mage", leaper: "Bondisseur", slime: "Gelée", charger: "Taureau", grenadier: "Grenadier" };

// statistiques à la Dead Cells : chaque arme est liée à une couleur, les parchemins augmentent ces couleurs
const STATS = {
  brut: { n: "Brutalité", c: "#ff4d4d", ico: "✦" },
  tact: { n: "Tactique",  c: "#c06bff", ico: "✧" },
  surv: { n: "Survie",    c: "#3dff7a", ico: "✚" },
};
const RAR = [
  { n: "Commun", m: 1, c: "#c8d2f0", aff: 0 },
  { n: "Rare", m: 1.25, c: "#5ab0ff", aff: 1 },
  { n: "Épique", m: 1.55, c: "#d27bff", aff: 2 },
  { n: "Légendaire", m: 2, c: "#ffb020", aff: 2 },
];
const AFFIX = {
  burn:    { t: "Enflamme la cible", c: "#ff8a3a" },
  poison:  { t: "Empoisonne (cumulable)", c: "#8dff5a" },
  bleed:   { t: "Fait saigner (cumulable)", c: "#ff4d6d" },
  freeze:  { t: "20 % de chances de geler", c: "#9fd8ff" },
  stunDmg: { t: "+60 % contre les cibles étourdies ou gelées", c: "#ffd23f" },
  burnDmg: { t: "+50 % contre les cibles en feu", c: "#ffb060" },
  crit:    { t: "+20 % de chances de critique", c: "#ffd23f" },
  leech:   { t: "Vol de vie : 6 % des dégâts", c: "#3dff9a" },
  shock:   { t: "Chaque 3e coup déclenche un arc électrique", c: "#7af0ff" },
  cdr:     { t: "Élimination : compétences -1,5 s", c: "#c06bff" },
};
const AFF_KEYS = Object.keys(AFFIX);

const WEAPONS = {
  sword:  { name: "Épée rouillée", type: "melee", stat: "brut", col: "#9ffcff", desc: "Combo en 3 coups, équilibrée",
            steps: [{ dur: .24, dmg: 10, reach: 48, lunge: 110, kb: 150, hs: .05 }, { dur: .24, dmg: 12, reach: 48, lunge: 110, kb: 150, hs: .05 }, { dur: .36, dmg: 20, reach: 62, lunge: 230, kb: 270, hs: .09 }] },
  dagger: { name: "Dagues jumelles", type: "melee", stat: "brut", col: "#7dffb0", desc: "Très rapides, ×2 dans le dos", backstab: 2, atkSlow: .7,
            steps: [{ dur: .15, dmg: 6, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .15, dmg: 6, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .15, dmg: 7, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .24, dmg: 12, reach: 40, lunge: 170, kb: 150, hs: .06 }] },
  hammer: { name: "Marteau de guerre", type: "melee", stat: "surv", col: "#ffb020", desc: "Lent mais dévastateur : étourdit, brise les sols fissurés", a0: .45, a1: .82, atkSlow: .15,
            steps: [{ dur: .55, dmg: 30, reach: 58, lunge: 60, kb: 380, hs: .14, stun: .7, smash: 1 }, { dur: .62, dmg: 38, reach: 64, lunge: 80, kb: 460, hs: .16, stun: .9, smash: 1 }] },
  spear:  { name: "Lance", type: "melee", stat: "brut", col: "#ff8a5a", desc: "Longue portée, transperce les ennemis alignés",
            steps: [{ dur: .3, dmg: 14, reach: 88, lunge: 100, kb: 160, hs: .05, thin: 1 }, { dur: .4, dmg: 19, reach: 100, lunge: 140, kb: 240, hs: .07, thin: 1 }] },
  rapier: { name: "Rapière", type: "melee", stat: "brut", col: "#ff9ab0", desc: "Estocs rapides · critique garanti juste après une roulade", critRoll: 1, atkSlow: .6, locked: 1,
            steps: [{ dur: .2, dmg: 9, reach: 64, lunge: 130, kb: 90, hs: .04, thin: 1 }, { dur: .28, dmg: 14, reach: 72, lunge: 170, kb: 150, hs: .06, thin: 1 }] },
  fireblade: { name: "Lame ardente", type: "melee", stat: "brut", col: "#ff9a3a", desc: "Combo en 3 coups · enflamme la cible", aff0: ["burn"], locked: 1,
            steps: [{ dur: .25, dmg: 10, reach: 50, lunge: 110, kb: 150, hs: .05 }, { dur: .25, dmg: 12, reach: 50, lunge: 110, kb: 150, hs: .05 }, { dur: .38, dmg: 21, reach: 64, lunge: 230, kb: 270, hs: .09 }] },
  whip:   { name: "Fouet électrique", type: "melee", stat: "tact", col: "#7af0ff", desc: "Très longue portée · le 3e coup électrise", atkSlow: .5, locked: 1,
            steps: [{ dur: .3, dmg: 8, reach: 112, lunge: 0, kb: 60, hs: .03, thin: 1 }, { dur: .3, dmg: 8, reach: 112, lunge: 0, kb: 60, hs: .03, thin: 1 }, { dur: .38, dmg: 14, reach: 126, lunge: 0, kb: 140, hs: .06, thin: 1, shock: 1 }] },
  flail:  { name: "Fléau à chaînes", type: "melee", stat: "surv", col: "#c8d0e8", desc: "Moulinet : frappe devant ET derrière", a0: .25, a1: .85, atkSlow: .35, locked: 1,
            steps: [{ dur: .48, dmg: 20, reach: 62, lunge: 30, kb: 300, hs: .1, around: 1 }, { dur: .58, dmg: 28, reach: 68, lunge: 40, kb: 380, hs: .12, around: 1, stun: .5 }] },
  katana: { name: "Katana", type: "melee", stat: "brut", col: "#e8ecff", desc: "Rapide · 3e coup : fente éclair, toujours critique", atkSlow: .5, locked: 1,
            steps: [{ dur: .19, dmg: 9, reach: 54, lunge: 120, kb: 110, hs: .04 }, { dur: .19, dmg: 10, reach: 54, lunge: 120, kb: 110, hs: .04 }, { dur: .34, dmg: 20, reach: 72, lunge: 420, kb: 260, hs: .1, dash: 1 }] },
  scythe: { name: "Faux sanglante", type: "melee", stat: "surv", col: "#d0c0e0", desc: "Grands arcs lents qui font saigner", aff0: ["bleed"], a0: .3, a1: .8, atkSlow: .3, locked: 1,
            steps: [{ dur: .42, dmg: 18, reach: 74, lunge: 60, kb: 220, hs: .08 }, { dur: .5, dmg: 27, reach: 82, lunge: 90, kb: 300, hs: .11 }] },
  bow:    { name: "Arc court", type: "bow", stat: "tact", col: "#d9b45a", desc: "Tir rapide, 10 flèches", dmg: 12, max: 10, pierce: 0, chargeT: .5 },
  longbow:{ name: "Arc long", type: "bow", stat: "tact", col: "#e8c36a", desc: "Puissant, transperce, 6 flèches", dmg: 28, max: 6, pierce: 1, chargeT: .8 },
  crossbow:{ name: "Arbalète lourde", type: "bow", stat: "tact", col: "#b0ffd0", desc: "Carreaux perforants (×3), 5 tirs", dmg: 34, max: 5, pierce: 2, chargeT: .35, locked: 1 },
  shield: { name: "Bouclier en bois", type: "shield", stat: "surv", col: "#ffd23f", desc: "Bloque 60 % · parade parfaite = étourdit", block: .6, parry: .22 },
  tower:  { name: "Bouclier-tour", type: "shield", stat: "surv", col: "#8fd0ff", desc: "Bloque 80 % · parade plus stricte", block: .8, parry: .16 },
};
const WLIST = [["sword", .16], ["dagger", .13], ["hammer", .1], ["spear", .11], ["rapier", .1], ["fireblade", .09], ["whip", .08], ["flail", .07], ["katana", .07], ["scythe", .06], ["bow", .11], ["longbow", .07], ["crossbow", .06], ["shield", .08], ["tower", .05]];

const SKILLS = {
  grenade:  { name: "Grenade", cd: 7, stat: "tact", col: "#ff8a5a", desc: "Explose : dégâts de zone, brise murs et sols fissurés" },
  trap:     { name: "Piège à pointes", cd: 9, stat: "tact", col: "#ffd23f", desc: "Étourdit et blesse l'ennemi qui marche dessus" },
  turret:   { name: "Tourelle", cd: 18, stat: "tact", col: "#00f0ff", desc: "Tire seule sur les ennemis pendant 10 s" },
  pulse:    { name: "Onde de choc", cd: 12, stat: "surv", col: "#b58bff", desc: "Repousse, étourdit et efface les projectiles" },
  knives:   { name: "Couteaux de lancer", cd: 5, stat: "brut", col: "#ff6a8a", desc: "3 couteaux en éventail qui font saigner", locked: 1 },
  frost:    { name: "Souffle de givre", cd: 14, stat: "tact", col: "#9fd8ff", desc: "Gèle tous les ennemis proches pendant 3 s", locked: 1 },
  firebomb: { name: "Grenade incendiaire", cd: 10, stat: "tact", col: "#ffb040", desc: "Explosion qui embrase le sol pendant 4 s", locked: 1 },
};

const unlocked = (id) => !(WEAPONS[id] || SKILLS[id]).locked || !!save.unl[id];

const MUTS = [
  { id: "brut",  name: "Rage",             col: "#ff4d4d", desc: "+25 % de dégâts de mêlée",                       fn: () => { U.melee *= 1.25; } },
  { id: "tact",  name: "Précision",        col: "#b58bff", desc: "+30 % de dégâts à distance et de compétences",   fn: () => { U.ranged *= 1.3; } },
  { id: "surv",  name: "Endurance",        col: "#3dff9a", desc: "+25 PV max et soin complet",                     fn: () => { U.maxHp += 25; P.hp = U.maxHp; } },
  { id: "vamp",  name: "Soif de cellules", col: "#ff2e97", desc: "Chaque ennemi vaincu rend 3 PV",                 fn: () => { U.vamp += 3; } },
  { id: "agile", name: "Agilité",          col: "#00f0ff", desc: "Roulade plus longue, +10 % de vitesse",          fn: () => { U.rollMul *= 1.15; U.speed *= 1.1; } },
  { id: "flask", name: "Flasque amélioré", col: "#ffd23f", desc: "+1 flasque, les soins rendent 10 % de plus",     fn: () => { U.flasks++; P.flasks++; U.heal += 0.1; } },
  { id: "crit",  name: "Œil de lynx",      col: "#ffb020", desc: "+15 % de chances de coup critique (×2)",         fn: () => { U.crit += 0.15; } },
  { id: "quiv",  name: "Carquois profond", col: "#d9b45a", desc: "+4 flèches max pour tous les arcs (remplis)",    fn: () => { U.arrowBonus += 4; refillAmmo(); } },
  { id: "cd",    name: "Réflexes",         col: "#8fd0ff", desc: "Compétences rechargées 25 % plus vite",          fn: () => { U.cdMul *= 0.75; } },
];

const FORGE = [
  { k: "vit",   name: "Constitution",           desc: "+12 PV max par niveau",        max: 6, cost: (l) => 20 + 15 * l },
  { k: "brut",  name: "Lames affûtées",         desc: "+6 % de dégâts de mêlée",      max: 8, cost: (l) => 25 + 20 * l },
  { k: "tact",  name: "Maîtrise du tir",        desc: "+10 % de dégâts à distance",   max: 6, cost: (l) => 25 + 20 * l },
  { k: "flask", name: "Flasque supplémentaire", desc: "+1 flasque de soin par niveau", max: 2, cost: (l) => 60 + 60 * l },
];
const RUNES = [
  { k: "spider",  name: "Rune de l'Araignée", desc: "Escalade murale : colle-toi à un mur (direction vers lui) puis monte/descends. Ouvre les zones en hauteur.", cost: 45 },
  { k: "breaker", name: "Rune du Briseur",    desc: "Frappe plongeante (bas + attaque en l'air) : brise les sols fissurés et étourdit. Ouvre les salles cachées.", cost: 70 },
];

// ================================================================== sauvegarde
const SAVE_KEY = "mc-supersecret-v1";
let save = { cells: 0, up: { vit: 0, brut: 0, tact: 0, flask: 0 }, runes: { spider: false, breaker: false }, best: { stage: 0, loop: 0, kills: 0 }, found: {}, unl: {} };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s && typeof s === "object") {
    save.cells = Number(s.cells) || 0;
    Object.assign(save.up, s.up || {});
    Object.assign(save.runes, s.runes || {});
    Object.assign(save.best, s.best || {});
    Object.assign(save.found, s.found || {});
    Object.assign(save.unl, s.unl || {});
  }
} catch (e) { /* stockage indisponible : la partie fonctionne quand même */ }
const PLAN_COST = { katana: 70, scythe: 80, rapier: 60, fireblade: 75, whip: 70, flail: 80, crossbow: 70, knives: 55, frost: 85, firebomb: 65 };
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ================================================================== son
let AC = null, muted = false, NOISE = null, MBUS = null;
function audio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    MBUS = AC.createGain(); MBUS.gain.value = 0.16; MBUS.connect(AC.destination);
  }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function sfx(f1, f2, dur, type, vol) {
  if (muted) return;
  try {
    audio();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type || "square";
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) {}
}
function noise(dur, vol, freq, q, dest, at) {
  if (muted && !dest) return;
  try {
    audio();
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = at || AC.currentTime;
    s.buffer = NOISE; f.type = "bandpass"; f.frequency.value = freq || 1800; f.Q.value = q || 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || AC.destination);
    s.start(t, Math.random() * 0.5); s.stop(t + dur);
  } catch (e) {}
}

// ------------------------------------------------------------------ musique procédurale (une ambiance par biome)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];
const TRACKS = {
  menu:      { bpm: 70,  root: 45, sc: MINOR,  prog: [0, 5, 3, 4], drums: 0, arp: 0, lead: 0 },
  cachots:   { bpm: 100, root: 45, sc: MINOR,  prog: [0, 5, 2, 6], drums: 1, arp: 1, lead: 1 },
  egouts:    { bpm: 92,  root: 43, sc: DORIAN, prog: [0, 3, 0, 4], drums: 1, arp: 1, lead: 0 },
  archives:  { bpm: 84,  root: 47, sc: MINOR,  prog: [0, 3, 5, 4], drums: 0, arp: 2, lead: 1 },
  abysses:   { bpm: 76,  root: 41, sc: PHRYG,  prog: [0, 1, 0, 6], drums: 1, arp: 1, lead: 0 },
  citadelle: { bpm: 112, root: 46, sc: PHRYG,  prog: [0, 1, 5, 4], drums: 2, arp: 1, lead: 1 },
  boss:      { bpm: 132, root: 40, sc: PHRYG,  prog: [0, 1, 0, 5], drums: 2, arp: 2, lead: 1 },
};
const MUS = { key: null, cfg: null, next: 0, step: 0, timer: null };
function musicNote(type, freq, t, dur, vol, cut) {
  const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  f.type = "lowpass"; f.frequency.setValueAtTime(cut || 1800, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(MBUS); o.start(t); o.stop(t + dur + 0.05);
}
function musicStep(c, s, t) {
  const sixteenth = 60 / c.bpm / 4, bar = Math.floor(s / 16), st = s % 16;
  const deg = c.prog[bar % c.prog.length];
  const chord = [0, 2, 4].map((k) => { const i = deg + k; return c.root + c.sc[i % 7] + 12 * Math.floor(i / 7); });
  if (st === 0) for (const n of chord) musicNote("sine", mtof(n + 12), t, sixteenth * 16, 0.05, 900);   // nappe
  if ([0, 3, 6, 8, 11, 14].includes(st) && (st % 8 !== 3 || bar % 2)) musicNote("sawtooth", mtof(chord[0] - 12), t, sixteenth * 1.8, 0.16, 420);   // basse
  if (c.arp && st % (c.arp === 2 ? 1 : 2) === 0) musicNote("square", mtof(chord[(st >> (c.arp === 2 ? 0 : 1)) % 3] + 24), t, sixteenth * 0.9, 0.025, 2600);
  if (c.lead && bar % 4 >= 2 && [0, 4, 6, 10, 12].includes(st)) {
    const i = deg + [4, 2, 3, 1, 0][[0, 4, 6, 10, 12].indexOf(st)] + (bar % 2) * 2;
    musicNote("triangle", mtof(c.root + 24 + c.sc[i % 7] + 12 * Math.floor(i / 7)), t, sixteenth * 2.5, 0.06, 3200);
  }
  if (c.drums) {
    if (st % 8 === 0 || (c.drums === 2 && st === 10)) {                     // grosse caisse
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(MBUS); o.start(t); o.stop(t + 0.25);
    }
    if (st % 4 === 2) noise(0.05, 0.08, 7000, 1.2, MBUS, t);              // charleston
    if (c.drums === 2 && st % 8 === 4) noise(0.16, 0.22, 1600, 0.7, MBUS, t);   // caisse claire
  }
}
function musicTick() {
  if (!AC || !MUS.cfg) return;
  const c = MUS.cfg, sixteenth = 60 / c.bpm / 4;
  if (MUS.next < AC.currentTime) MUS.next = AC.currentTime + 0.05;
  while (MUS.next < AC.currentTime + 0.2) { try { musicStep(c, MUS.step, MUS.next); } catch (e) {} MUS.next += sixteenth; MUS.step++; }
}
function music(key) {
  if (MUS.key === key) return;
  MUS.key = key; MUS.cfg = TRACKS[key] || null; MUS.step = 0;
  if (!AC) return;
  MBUS.gain.cancelScheduledValues(AC.currentTime);
  MBUS.gain.setValueAtTime(0.0001, AC.currentTime); MBUS.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.16, AC.currentTime + 1.2);
  MUS.next = AC.currentTime + 0.1;
  if (!MUS.timer) MUS.timer = setInterval(musicTick, 60);
}
function musicWake() {                                    // le navigateur exige un geste de l'utilisateur
  try { audio(); const k = MUS.key; MUS.key = null; music(k || "menu"); } catch (e) {}
}
const SFX = {
  swing: () => sfx(380, 140, 0.09, "sawtooth", 0.035),
  hit:   () => sfx(220, 60, 0.12, "square", 0.06),
  jump:  () => sfx(260, 520, 0.1, "triangle", 0.05),
  roll:  () => sfx(180, 90, 0.18, "triangle", 0.05),
  shoot: () => sfx(700, 300, 0.1, "square", 0.04),
  hurt:  () => sfx(160, 40, 0.3, "sawtooth", 0.08),
  cell:  () => sfx(900, 1400, 0.07, "sine", 0.04),
  heal:  () => sfx(400, 800, 0.25, "sine", 0.06),
  boom:  () => sfx(120, 30, 0.45, "sawtooth", 0.09),
  alert: () => sfx(500, 500, 0.08, "square", 0.03),
  parry: () => sfx(1200, 1800, 0.18, "triangle", 0.08),
  block: () => sfx(300, 200, 0.1, "square", 0.06),
  swap:  () => sfx(500, 800, 0.07, "triangle", 0.04),
  gold:  () => sfx(1300, 1900, 0.06, "square", 0.025),
  crit:  () => { sfx(900, 300, 0.12, "sawtooth", 0.05); noise(0.08, 0.12, 3000, 1); },
  smash: () => noise(0.18, 0.18, 900, 0.6),
  slash: () => noise(0.07, 0.06, 4200, 1.5),
  curse: () => sfx(200, 60, 0.9, "sawtooth", 0.08),
  scroll:() => { sfx(500, 1000, 0.3, "sine", 0.06); setTimeout(() => sfx(750, 1500, 0.35, "sine", 0.05), 120); },
  roar:  () => { sfx(90, 40, 1.1, "sawtooth", 0.12); noise(0.9, 0.2, 400, 0.5); },
};
let woke = false;
function wake() { if (!woke) { woke = true; musicWake(); } }

// ================================================================== entrées
const ACT = {
  left:   ["KeyA", "ArrowLeft", "T_left"],
  right:  ["KeyD", "ArrowRight", "T_right"],
  up:     ["KeyW", "ArrowUp", "Space", "T_up"],
  down:   ["KeyS", "ArrowDown", "T_down"],
  attack: ["KeyJ", "M_left", "T_attack"],
  roll:   ["KeyK", "ShiftLeft", "ShiftRight", "T_roll"],
  swap:   ["KeyR", "Tab", "M_right", "T_swap"],
  sk1:    ["KeyU", "T_sk1"],
  sk2:    ["KeyI", "T_sk2"],
  heal:   ["KeyE", "T_heal"],
  use:    ["KeyF", "T_use"],
};
// event.code = position physique de la touche : ZQSD sur AZERTY, WASD sur QWERTY.
const keys = {}, pressed = {};
const down = (a) => ACT[a].some((k) => keys[k]);
const hit = (a) => ACT[a].some((k) => pressed[k]);
function press(code) { if (!keys[code]) pressed[code] = true; keys[code] = true; }
function release(code) { keys[code] = false; }

const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (GAME_KEYS.has(e.code) || (e.code === "Tab" && scene === "play")) e.preventDefault();
  const ae = document.activeElement;
  if (ae && ae.tagName === "BUTTON") ae.blur();
  if (e.repeat) return;
  wake();
  press(e.code);
  if (e.code === "Escape" || e.code === "KeyP") togglePause();
  if (e.code === "Enter") enterKey();
  if (e.code === "KeyM") toggleMute();
});
window.addEventListener("keyup", (e) => release(e.code));
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (scene === "play") pauseGame(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "play") pauseGame(); });

cv.addEventListener("mousedown", (e) => { e.preventDefault(); wake(); press(e.button === 2 ? "M_right" : "M_left"); });
window.addEventListener("pointerdown", wake);
window.addEventListener("mouseup", (e) => release(e.button === 2 ? "M_right" : "M_left"));
cv.addEventListener("contextmenu", (e) => e.preventDefault());

document.querySelectorAll(".tb").forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); press(k); b.classList.add("on"); };
  const off = (e) => { e.preventDefault(); release(k); b.classList.remove("on"); };
  b.addEventListener("pointerdown", on);
  ["pointerup", "pointercancel", "pointerleave"].forEach((n) => b.addEventListener(n, off));
  b.addEventListener("contextmenu", (e) => e.preventDefault());
});

const btnMute = document.getElementById("btn-mute");
const btnFs = document.getElementById("btn-fs");
function toggleMute() {
  muted = !muted; btnMute.textContent = "Son : " + (muted ? "off" : "on");
  if (MBUS) { MBUS.gain.cancelScheduledValues(AC.currentTime); MBUS.gain.setValueAtTime(muted ? 0.0001 : 0.16, AC.currentTime); }
}
btnMute.addEventListener("click", toggleMute);
btnFs.addEventListener("click", () => {
  const st = document.getElementById("stage");
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (st.requestFullscreen) st.requestFullscreen();
  } catch (e) {}
});

// ================================================================== état global
let scene = "menu";            // menu | play | pause | choice | dead | win
let depth = 0, loop = 0, S = BIOMES.cachots, nextKeys = [];
let COLS = 0, grid = [], cracks = new Map();
let enemies = [], shots = [], pickups = [], parts = [], torches = [], layers = [], motes = [];
let props = [], bombs = [], traps = [], turrets = [], doors = [], route = [], secrets = [];
let decos = [], rays = [], fgs = [], lights = [], ghosts = [], fires = [], pools = [], crackList = [];
let fade = 0, transT = 0, transDoor = null, slowmo = 0, kick = { x: 0, y: 0 }, bossIntro = 0;
let startPos = { x: 96, y: 960 }, seen = null, mmDirty = true, mmCanvas = null, hidMap = new Uint8Array(1), seenStamp = null, seenN = 0, lastSC = -1, lastSR = -1;
let P = null, U = null, run = null;
let pGR = 0;
let cam = { x: 0, y: 0 }, shake = 0, hitstop = 0, flashRed = 0, time = 0;
let bossDead = false, bossRef = null, toastT = 0, toastTxt = "", card = { t: 0, text: "", sub: "" };
let banked = false, uid = 1, pendingNext = "cachots", deathMsg = "", freshRun = false;

function newRunState() {
  U = {
    melee: 1 + save.up.brut * 0.06, ranged: 1 + save.up.tact * 0.1,
    maxHp: 100 + save.up.vit * 12, vamp: 0, rollMul: 1, speed: 1,
    flasks: 2 + save.up.flask, heal: 0.4, crit: 0, arrowBonus: 0, cdMul: 1,
    st: { brut: 0, tact: 0, surv: 0 },
  };
  run = { kills: 0, cells: 0, time: 0, gold: 0, scrolls: 0 };
  banked = false;
}

// ================================================================== objets
const statMul = (s) => 1 + 0.15 * (U.st[s] || 0);
function itemMul(it) {                                   // rareté × niveau de l'objet × couleur
  const d = WEAPONS[it.id] || SKILLS[it.id];
  return (RAR[it.rar || 0].m) * (1 + 0.1 * (it.lvl || 0)) * statMul(d.stat);
}
const itemAff = (it) => (it && WEAPONS[it.id] ? (WEAPONS[it.id].aff0 || []).concat(it.aff || []) : []);
function bowMax(it) { return WEAPONS[it.id].max + Math.round((RAR[it.rar].m - 1) * 6) + U.arrowBonus; }
function rollAff(n, R) {
  const pool = AFF_KEYS.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  return out;
}
function mkWeapon(id, rar, R) {
  const it = { kind: "weapon", id, rar, uid: uid++, ammo: 0, lvl: depth + loop * 2, aff: rollAff(RAR[rar].aff, R || Math.random) };
  if (WEAPONS[id].type === "bow") it.ammo = bowMax(it);
  return it;
}
function mkSkill(id) { return { kind: "skill", id, t: 0, uid: uid++, rar: 0, lvl: depth + loop * 2 }; }
function randRar(minRar, rf) {
  const r = rf(), p3 = 0.01 + 0.025 * depth, p2 = 0.04 + 0.05 * depth, p1 = 0.25 + 0.08 * depth;
  return Math.min(3, Math.max(minRar || 0, r < p3 ? 3 : r < p3 + p2 ? 2 : r < p3 + p2 + p1 ? 1 : 0));
}
function randWeapon(minRar, R) {
  const rf = R || Math.random, list = WLIST.filter(([k]) => unlocked(k));
  let tot = 0; for (const [, w] of list) tot += w;
  let x = rf() * tot, id = "sword";
  for (const [k, w] of list) { x -= w; if (x <= 0) { id = k; break; } }
  return mkWeapon(id, randRar(minRar, rf), rf);
}
function randSkill(R) { const ids = Object.keys(SKILLS).filter(unlocked); return mkSkill(ids[Math.floor((R || Math.random)() * ids.length)]); }
function randBlueprint() {
  const ids = Object.keys(PLAN_COST).filter((k) => !save.found[k] && !save.unl[k]);
  return ids.length ? { kind: "bp", id: ids[Math.floor(Math.random() * ids.length)] } : null;
}
const itemName = (it) => it.kind === "weapon" ? WEAPONS[it.id].name : it.kind === "skill" ? SKILLS[it.id].name : it.kind === "food" ? "Ration de survie" : it.kind === "scroll" ? "Parchemin de puissance" : it.kind === "bp" ? "Plan : " + (WEAPONS[it.id] || SKILLS[it.id]).name : "?";
const itemCol = (it) => it.kind === "weapon" ? RAR[it.rar].c : it.kind === "skill" ? SKILLS[it.id].col : it.kind === "food" ? "#3dff9a" : it.kind === "scroll" ? "#ffe9a0" : "#7af0ff";
const aw = () => P.wp[P.wi];
function refillAmmo() { for (const it of P.wp) if (it && WEAPONS[it.id].type === "bow") it.ammo = bowMax(it); }

function createPlayer() {
  P = {
    x: 0, y: 0, w: 18, h: 30, vx: 0, vy: 0, face: 1, onGround: false,
    coyote: 0, buf: 0, air: 1, roll: 0, rollDir: 1, rollCd: 0, dropT: 0, dropHold: 0,
    atk: null, atkBuf: 0, combo: 0, comboT: 0,
    hp: U.maxHp, inv: 0, hurtT: 0, flasks: U.flasks,
    safeX: 0, safeY: 0,
    wp: [null, null], wi: 0, sk: [null, null],
    guard: false, guardT: 0, guardCd: 0, drawing: false, draw: 0,
    wallDir: 0, wallVine: false, wallLast: 0, wallCoy: 0, wjLock: 0, clinging: false, pound: false,
    rune: { spider: !!save.runes.spider, breaker: !!save.runes.breaker },
    rally: 0, rallyT: 0, curse: 0, critRollT: 0, shockN: 0,
    sq: 1, runPh: 0, wasGround: true, dustT: 0, ghostT: 0, cape: null, scarf: null,
  };
  P.wp = [mkWeapon("sword", 0), null];                 // pas de classe : tout le monde part avec l'épée rouillée
}

// ================================================================== niveau
function tileAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 1;
  return grid[r][c];
}
const solidPx = (x, y) => SOL(tileAt(Math.floor(x / T), Math.floor(y / T)));

function weightedPick(mix, R) {
  let tot = 0; for (const k in mix) tot += mix[k];
  let x = R() * tot;
  for (const k in mix) { x -= mix[k]; if (x <= 0) return k; }
  return "zombie";
}
function pickNext(cur, d) {
  if (d + 1 >= LAST) return ["boss"];
  if (d + 1 === MIDB) return [MID_BOSSES[Math.floor(Math.random() * MID_BOSSES.length)]];
  const pool = POOLS[d + 1].filter((k) => k !== cur);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 2);
}

// ---------- agencement : cellules reliées en graphe (réseau ramifié ou « promenade » + puits)
const CW = 28, CH = 15;
function layoutCells(style, nx, ny, R) {
  const ri = (n) => Math.floor(R() * n);
  const used = []; for (let y = 0; y < ny; y++) used.push(new Array(nx).fill(false));
  const links = [];
  const isLinked = (ax, ay, bx, by) => links.some((l) => (l.ax === ax && l.ay === ay && l.bx === bx && l.by === by) || (l.ax === bx && l.ay === by && l.bx === ax && l.by === ay));
  const add = (ax, ay, bx, by) => { used[ay][ax] = true; used[by][bx] = true; links.push({ ax, ay, bx, by }); };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let sx = 0, sy = 0;
  if (style === "net") {
    sy = ri(ny); used[sy][0] = true;
    const list = [[0, sy]], target = Math.round(nx * ny * 0.72);
    let tries = 0;
    while (list.length < target && tries++ < 400) {
      const [cx, cy] = R() < 0.7 ? list[list.length - 1 - ri(Math.min(3, list.length))] : list[ri(list.length)];
      const d = DIRS[ri(4)], x = cx + d[0], y = cy + d[1];
      if (x < 0 || y < 0 || x >= nx || y >= ny || used[y][x]) continue;
      add(cx, cy, x, y); list.push([x, y]);
    }
    for (let k = 0, n = 0; k < 40 && n < 2; k++) {
      const x = ri(nx), y = ri(ny); if (!used[y][x]) continue;
      const d = DIRS[ri(4)], x2 = x + d[0], y2 = y + d[1];
      if (x2 < 0 || y2 < 0 || x2 >= nx || y2 >= ny || !used[y2][x2] || isLinked(x, y, x2, y2)) continue;
      add(x, y, x2, y2); n++;
    }
  } else {                                                   // promenade : grande allée en haut, puits qui descendent
    used[0][0] = true;
    for (let x = 0; x < nx - 1; x++) add(x, 0, x + 1, 0);
    const cols = []; for (let x = 0; x < nx; x++) cols.push(x);
    for (let i = cols.length - 1; i > 0; i--) { const j = ri(i + 1); [cols[i], cols[j]] = [cols[j], cols[i]]; }
    for (const x of cols.slice(0, Math.min(nx - 1, 3 + ri(2)))) {
      const depth = 1 + ri(ny - 1); let y = 0;
      for (let k = 0; k < depth; k++) { if (used[y + 1][x]) break; add(x, y, x, y + 1); y++; }
      if (y > 0 && R() < 0.6) { const dx = R() < 0.5 ? -1 : 1, x2 = x + dx; if (x2 >= 0 && x2 < nx && !used[y][x2]) add(x, y, x2, y); }
    }
  }
  return { used, links, sx, sy };
}

// sol praticable le plus bas d'une colonne (ligne d'air posée sur un sol), -1 sinon
function groundAt(col, rTop, rBot) {
  for (let r = rBot; r >= rTop; r--) {
    const t = tileAt(col, r);
    if (!SOL(t) && t !== 3 && !SOL(tileAt(col, r - 1)) && FLOOR(tileAt(col, r + 1))) return r;
  }
  return -1;
}
// recale les objets posés au sol : jamais dans un bloc, toujours sur un appui
function propFits(x, y, w, h) {
  const c0 = Math.floor((x + 1) / T), c1 = Math.floor((x + w - 1) / T), r0 = Math.floor((y + 1) / T), r1 = Math.floor((y + h - 1) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const t = tileAt(c, r); if (SOL(t) || t === 3 || t === 2) return false; }
  const below = Math.floor((y + h + 1) / T);
  return FLOOR(tileAt(Math.floor((x + w / 2) / T), below)) && Math.abs((y + h) - below * T) < 1;
}
function settleProps() {
  const keep = [];
  for (const p of props) {
    if (!["chest", "item", "vase", "totem", "merchant"].includes(p.kind) || p.drop) { keep.push(p); continue; }
    if (propFits(p.x, p.y, p.w, p.h)) { keep.push(p); continue; }
    const bc = Math.floor((p.x + p.w / 2) / T), br = Math.floor((p.y + p.h - 1) / T), off = (p.x + p.w / 2) - (bc * T + 16);
    let ok = false;
    for (let k = 0; k <= 16 && !ok; k++) {
      const dc = (k & 1 ? 1 : -1) * Math.ceil(k / 2);
      for (let dr = -4; dr <= 6 && !ok; dr++) {
        const r = br + dr, x = (bc + dc) * T + 16 + off - p.w / 2, y = (r + 1) * T - p.h;
        if (propFits(x, y, p.w, p.h)) { p.x = x; p.y = y; ok = true; }
      }
    }
    if (ok) keep.push(p);
  }
  props = keep;
  torches = torches.filter((t) => !SOL(tileAt(Math.floor(t.x / T), Math.floor(t.y / T))) && !SOL(tileAt(Math.floor(t.x / T), Math.floor((t.y - 20) / T))));
}

const gAt = (c, col) => groundAt(col, c.Y0 + 1, (c.deep && c.deep[col]) || c.floor - 1);
function genCaves(R, d, bk, withEnemies) {
  const ri = (n) => Math.floor(R() * n);
  const nx = S.nx, ny = S.ny;
  const L = layoutCells(S.style, nx, ny, R);
  const cells = new Map(), key = (x, y) => y * 100 + x;
  COLS = nx * CW + 1; ROWS = ny * CH + 10;
  grid = []; for (let r = 0; r < ROWS; r++) grid.push(new Uint8Array(COLS).fill(1));
  const prot = new Uint8Array(COLS * ROWS);
  const put = (r, c, v) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = v; };
  const carve = (r0, c0, r1, c1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(r, c, 0); };
  const protect = (r0, c0, r1, c1) => { for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) prot[r * COLS + c] = 1; };
  const fillS = (r, c) => { if (r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1 && !prot[r * COLS + c]) grid[r][c] = 1; };
  const cave = S.mote === "bubble" || S.mote === "drip";

  // 1. cellules et liens
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (L.used[y][x])
    cells.set(key(x, y), { cx: x, cy: y, X0: x * CW, Y0: y * CH, floor: (y + 1) * CH, res: [], holes: [], l: false, r: false, u: false, dn: false, vault: false, kind: "room", perches: [], plat: [], li: 0, rI: 0, ti: 0 });
  const C = (x, y) => cells.get(key(x, y));
  for (const l of L.links) {
    const a = C(l.ax, l.ay), b = C(l.bx, l.by);
    if (l.ay === l.by) { const lo = l.ax < l.bx ? a : b, hi = lo === a ? b : a; lo.r = true; hi.l = true; l.lo = lo; l.hi = hi; }
    else {
      const up = l.ay < l.by ? a : b, lw = up === a ? b : a;
      l.up = up; l.lw = lw; l.hc = up.X0 + 6 + ri(CW - 14);
      up.dn = true; lw.u = true; up.holes.push(l.hc); lw.holes.push(l.hc);
      up.res.push([l.hc - 3, l.hc + 6]); lw.res.push([l.hc - 3, l.hc + 6]);
    }
  }
  // distances depuis l'entrée (BFS dans le graphe de liens)
  const adj = new Map(); for (const c of cells.values()) adj.set(c, []);
  for (const l of L.links) { const a = C(l.ax, l.ay), b = C(l.bx, l.by); adj.get(a).push(b); adj.get(b).push(a); }
  const bfs = (src) => { const dist = new Map([[src, 0]]), q = [src]; while (q.length) { const c = q.shift(); for (const n of adj.get(c)) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); } } return dist; };
  const startC = C(L.sx, L.sy), B0 = bfs(startC);
  const byDist = [...cells.values()].sort((a, b) => B0.get(b) - B0.get(a));
  const exitA = byDist[0], BA = bfs(exitA);
  const exitB = byDist.find((c) => c !== exitA && BA.get(c) >= 3 && c !== startC) || null;
  startC.kind = "start"; exitA.kind = "exit"; if (exitB) exitB.kind = "exit";

  // salles-coffres cachées au-dessus (choisies avant de creuser : leur mur doit rester droit)
  const vaultPlans = [];
  for (const c of [...cells.values()].sort(() => R() - 0.5)) {
    if (vaultPlans.length >= (ny >= 4 ? 2 : 1)) break;
    if (c.kind === "start" || c.cy < 1 || L.used[c.cy - 1][c.cx]) continue;
    const side = !c.l ? "l" : !c.r ? "r" : null;
    if (!side) continue;
    L.used[c.cy - 1][c.cx] = true; c.vaultSide = side; vaultPlans.push(c);
  }

  // 2. formes des salles : retraits, voûtes, murs bosselés
  for (const c of cells.values()) {
    const calm = c.kind !== "room";
    c.li = calm ? ri(2) : R() < 0.65 ? 1 + ri(4) : 0;
    c.rI = calm ? ri(2) : R() < 0.65 ? 1 + ri(4) : 0;
    c.ti = calm ? ri(2) : ri(4);
    if (c.kind === "exit") c.rI = 0;
    if (c.vaultSide === "l") { c.li = 0; c.ti = 0; } else if (c.vaultSide === "r") { c.rI = 0; c.ti = 0; }
    for (const hc of c.holes) { c.li = Math.min(c.li, hc - 4 - (c.X0 + 1)); c.rI = Math.min(c.rI, c.X0 + CW - 1 - (hc + 7)); }
    c.li = Math.max(0, c.li); c.rI = Math.max(0, c.rI);
    c.left = c.X0 + 1 + c.li; c.right = c.X0 + CW - 1 - c.rI;
    const arch = R() < 0.45, amp = calm ? 1 : 1.5 + R() * 2.5, ph = R() * 6;
    c.ceil = {};
    for (let col = c.left; col <= c.right; col++) {
      const t = (col - c.left) / Math.max(1, c.right - c.left);
      let drop = arch ? Math.round((1 - Math.sin(t * Math.PI)) * (1.5 + amp)) : Math.round(amp * (0.5 + 0.5 * Math.sin(col * 0.42 + ph)) + (R() < 0.15 ? 1 : 0));
      if (c.vaultSide && ((c.vaultSide === "l" && col < c.left + 4) || (c.vaultSide === "r" && col > c.right - 4))) drop = 0;
      const top = Math.min(c.Y0 + 1 + c.ti + drop, c.floor - 10);
      c.ceil[col] = top;
      carve(top, col, c.floor - 1, col);
    }
    protect(c.floor - 4, c.left, c.floor - 1, c.right);                         // allée de marche
    // murs bosselés (au-dessus de l'allée)
    if (!calm) for (const side of [-1, 1]) {
      const ph2 = R() * 6, a2 = 1 + R() * 2;
      for (let r = c.Y0 + 1; r < c.floor - 5; r++) {
        const w = Math.max(0, Math.round(a2 * Math.sin(r * 0.55 + ph2)));
        for (let k = 0; k < w; k++) fillS(r, side < 0 ? c.left + k : c.right - k);
      }
    }
  }

  // 3. passages : couloirs, grandes halles ouvertes, puits verticaux
  for (const l of L.links) {
    if (l.lo) {
      const lo = l.lo, hi = l.hi, fr = lo.floor;
      carve(fr - 4, lo.right, fr - 1, hi.left); protect(fr - 4, lo.right, fr - 1, hi.left);
      if (lo.kind === "room" && hi.kind === "room" && R() < 0.45) {                 // les deux salles fusionnent en une halle
        const h = 6 + ri(4);
        carve(fr - h, lo.right - 2, fr - 1, hi.left + 2);
        if (R() < 0.5) for (let r = fr - h; r < fr - h + 2; r++) put(r, hi.X0, 1);   // linteau
      } else if (R() < 0.5) {                                                         // arche
        carve(fr - 6, lo.right, fr - 5, hi.left);
        put(fr - 6, lo.right, 1); put(fr - 6, hi.left, 1);
      }
    } else {
      const up = l.up, lw = l.lw, hc = l.hc, br = lw.Y0;
      carve(br, hc, br, hc + 3);
      carve(br + 1, hc - 2, lw.floor - 5, hc + 5); protect(br, hc - 3, lw.floor - 1, hc + 6);
      protect(up.floor - 6, hc - 2, up.floor - 1, hc + 5);
      for (let k = 0; k < 4; k++) {
        const row = br + CH - 3 * (k + 1), c0 = k === 3 ? hc : k % 2 === 0 ? hc - 2 : hc + 2;
        carve(row - 2, c0 - 1, row - 1, c0 + 4);
        for (let i = 0; i < 4; i++) put(row, c0 + i, 2);
        lw.plat.push({ row, c0, w: 4 });
      }
    }
  }

  // 4. relief des salles : plateaux en escalier, îlots flottants, roche érodée
  for (const c of cells.values()) {
    if (c.kind !== "room") continue;
    const fr = c.floor, free = (a, b) => !c.res.some((q) => a <= q[1] && b >= q[0]);
    for (let i = 0, n = ri(3); i < n; i++) {
      const w = 5 + ri(7), h = 1 + ri(R() < 0.3 ? 3 : 2), x0 = c.left + 4 + ri(Math.max(1, c.right - c.left - 8 - w));
      if (!free(x0 - 2, x0 + w + 2) || x0 + w > c.right - 3) continue;
      for (let k = 0; k < w; k++) { const hk = Math.min(h, k + 1, w - k); for (let j = 1; j <= hk; j++) put(fr - j, x0 + k, 1); }
    }
    // cuvettes : le sol s'enfonce quand rien n'est en dessous
    const belowFree0 = c.cy === ny - 1 || !L.used[c.cy + 1][c.cx];
    if (belowFree0 && !c.dn && R() < 0.6) {
      const w = 6 + ri(8), dep = 2 + ri(2), x0 = c.left + 5 + ri(Math.max(1, c.right - c.left - 10 - w));
      if (free(x0 - 2, x0 + w + 2) && x0 + w < c.right - 4) {
        c.deep = {}; c.basin = true;
        for (let k = 0; k < w; k++) {
          const dk = Math.min(dep, k + 1, w - k);
          if (fr - 1 >= 0 && grid[fr - 1][x0 + k] !== 0) continue;
          carve(fr, x0 + k, fr + dk - 1, x0 + k); c.deep[x0 + k] = fr + dk - 1;
        }
      }
    }
    const maxCeil = Math.max(...Object.values(c.ceil));
    if (fr - maxCeil >= 11 && R() < 0.6) {
      for (let i = 0, n = 1 + ri(2); i < n; i++) {
        const w = 3 + ri(4), th = 1 + ri(2), row = fr - 5 - ri(3), x0 = c.left + 6 + ri(Math.max(1, c.right - c.left - 12 - w));
        if (!free(x0 - 5, x0 + w + 5)) continue;
        let ok = true;
        for (let k = -1; k <= w; k++) for (let r = row - 3; r < row + th + 2; r++) if (SOL(tileAt(x0 + k, r)) || tileAt(x0 + k, r) === 2) ok = false;
        if (!ok) continue;
        for (let k = 0; k < w; k++) for (let r = row; r < row + th; r++) put(r, x0 + k, 1);
        if (th > 1) { put(row + th - 1, x0, 0); put(row + th - 1, x0 + w - 1, 0); }
        { const sr = row + 3 > fr - 3 ? fr - 3 : row + 3, sx = R() < 0.5 ? x0 - 4 : x0 + w + 1;      // marche pour y monter
          for (let q = 0; q < 3; q++) if (tileAt(sx + q, sr) === 0) put(sr, sx + q, 2); }
        c.perches.push({ x: (x0 + 1 + R() * (w - 2)) * T, y: row * T });
        if (R() < 0.25) props.push({ kind: "chest", x: (x0 + w / 2) * T - 15, y: row * T - 22, w: 30, h: 22, open: false });
      }
    }
    for (let i = 0, n = 1 + ri(3); i < n; i++) {                                     // stalactites
      const w = 2 + ri(3), x0 = c.left + 2 + ri(Math.max(1, c.right - c.left - 4)), top = c.ceil[x0] || c.Y0 + 1;
      if (!free(x0, x0 + w)) continue;
      for (let q = 0; q < w; q++) { const hq = 1 + ri(3) + (q > 0 && q < w - 1 ? 1 : 0); for (let r = top; r < top + hq; r++) fillS(r, x0 + q); }
    }
  }
  if (cave) {                                                                         // érosion « grotte » : bords organiques
    const inRoom = (r, cc) => { const c = C(Math.floor(cc / CW), Math.floor(r / CH)); return c && r < c.floor - 5; };
    for (let r = 1; r < ROWS - 1; r++) for (let cc = 1; cc < COLS - 1; cc++) {
      if (grid[r][cc] !== 0 || prot[r * COLS + cc] || !inRoom(r, cc)) continue;
      let n = 0; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (SOL(tileAt(cc + dc, r + dr))) n++;
      if (n > 0 && R() < 0.22 + n * 0.02) grid[r][cc] = 7;
    }
    for (let it = 0; it < 2; it++) {
      const nxt = grid.map((row) => row.slice());
      for (let r = 1; r < ROWS - 1; r++) for (let cc = 1; cc < COLS - 1; cc++) {
        if (prot[r * COLS + cc] || !inRoom(r, cc) || (grid[r][cc] !== 0 && grid[r][cc] !== 7)) continue;
        let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const t = tileAt(cc + dc, r + dr); if (SOL(t) || t === 7) n++; }
        nxt[r][cc] = n >= 5 ? 7 : 0;
      }
      grid = nxt;
    }
    for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) if (grid[r][cc] === 7) grid[r][cc] = 1;
  }

  // 5. salles-coffres cachées : grimper aux vignes (Rune de l'Araignée)
  for (const c of vaultPlans) {
    const side = c.vaultSide;
    const v = { cx: c.cx, cy: c.cy - 1, X0: c.X0, Y0: c.Y0 - CH, floor: c.Y0, res: [], vault: true, kind: "vault", perches: [], plat: [] };
    cells.set(key(v.cx, v.cy), v);
    const vl = c.X0 + 4 + ri(4), vr = c.X0 + CW - 4 - ri(4);
    for (let col = vl; col <= vr; col++) carve(v.Y0 + 3 + ri(2), col, v.floor - 1, col);
    carve(v.floor - 4, c.X0 + 1, v.floor - 1, c.X0 + CW - 1);
    const wc = side === "l" ? c.X0 : c.X0 + CW, hc = side === "l" ? c.X0 + 1 : c.X0 + CW - 2;
    carve(c.Y0, hc, c.ceil[hc] || c.Y0 + 1, hc + 1);
    carve(c.Y0 + 1, hc, c.floor - 5, hc + 1);
    for (let r = c.Y0 - 2; r <= c.floor - 5; r++) put(r, wc, 6);
    c.u = true; c.res.push([hc - 1, hc + 3]);
    const rx = (c.X0 + CW / 2) * T;
    props.push({ kind: "chest", x: rx - 70, y: v.floor * T - 22, w: 30, h: 22, open: false, secret: true });
    props.push({ kind: "chest", x: rx + 40, y: v.floor * T - 22, w: 30, h: 22, open: false, secret: true });
    props.push({ kind: "item", secret: true, item: R() < 0.35 ? { kind: "scroll" } : R() < 0.6 ? randWeapon(1, R) : randSkill(R), altar: true, x: rx - 11, y: v.floor * T - 30, w: 22, h: 22, bob: R() * 6 });
  }

  // 6. secrets, plateformes, pièges
  for (const c of cells.values()) {
    if (c.vault) continue;
    const fr = c.floor, free = (a, b) => !c.res.some((q) => a <= q[1] && b >= q[0]);
    const safeRoom = c.kind !== "room";
    // plateformes : une basse (atteignable du sol), parfois une haute posée en escalier au-dessus
    const lows = [];
    const tryPlat = (x0, w, row) => {
      if (!free(x0 - 1, x0 + w + 1) || x0 < c.left + 1 || x0 + w > c.right) return false;
      for (let q = -1; q <= w; q++) for (let r = row - 2; r <= row + 1; r++) if (tileAt(x0 + q, r) !== 0) return false;
      for (let q = 0; q < w; q++) put(row, x0 + q, 2);
      c.perches.push({ x: (x0 + 1 + R() * (w - 2)) * T, y: row * T });
      if (R() < 0.18) props.push({ kind: "chest", x: (x0 + w / 2) * T - 15, y: row * T - 22, w: 30, h: 22, open: false });
      return true;
    };
    for (let i = 0, np = 1 + ri(2); i < np; i++) {
      const w = 4 + ri(3), x0 = c.left + 2 + ri(Math.max(1, c.right - c.left - w - 4));
      if (tryPlat(x0, w, fr - 4)) lows.push([x0, w]);
    }
    for (const [lx, lw2] of lows) if (R() < 0.6) { const w = 4 + ri(3), x0 = lx + (R() < 0.5 ? -w + 1 - ri(2) : lw2 - 1 + ri(2)); tryPlat(x0, w, fr - 7 - ri(2) * 0); }
    // pointes au sol sur une portion plate
    if (!safeRoom && R() < S.pit * 2.2) {
      for (let tr = 0; tr < 8; tr++) {
        const x0 = c.left + 5 + ri(Math.max(1, c.right - c.left - 12));
        if (!free(x0 - 2, x0 + 5)) continue;
        if (![-1, 0, 1, 2, 3].every((q) => grid[fr - 1][x0 + q] === 0 && grid[fr - 2][x0 + q] === 0 && SOL(grid[fr][x0 + q]))) continue;
        for (let q = 0; q < 3; q++) put(fr - 1, x0 + q, 3);
        for (let q = -1; q < 4; q++) if (grid[fr - 4][x0 + q] === 0) put(fr - 4, x0 + q, 2);
        break;
      }
    }
    if (!safeRoom && R() < S.traps * 0.7) { const col = c.right - 1, g = gAt(c, col); if (g > 0) props.push({ kind: "totem", x: col * T - 8, y: (g + 1) * T - 34, w: 24, h: 34, face: -1, cd: 1 + R() * 1.5, flash: 0 }); }
    if (!safeRoom && R() < 0.14) { const col = c.left + 4 + ri(Math.max(1, c.right - c.left - 8)), g = gAt(c, col); if (g > 0) props.push({ kind: "chest", x: col * T + 1, y: (g + 1) * T - 22, w: 30, h: 22, open: false }); }
    // coffre secret sous le sol (frappe plongeante / grenade / marteau) si aucune salle dessous
    const belowFree = c.cy === ny - 1 || !L.used[c.cy + 1][c.cx];
    if (!c.dn && belowFree && !c.basin && R() < S.secret) {
      const x0 = c.left + 6 + ri(Math.max(1, c.right - c.left - 14));
      if (free(x0 - 3, x0 + 5) && grid[fr - 1][x0] === 0 && grid[fr - 1][x0 + 1] === 0) {
        carve(fr + 2, x0 - 3, fr + 5, x0 + 5);
        put(fr, x0, 5); put(fr, x0 + 1, 5); put(fr + 1, x0, 5); put(fr + 1, x0 + 1, 5);
        put(fr + 4, x0 + 4, 2); put(fr + 4, x0 + 5, 2);
        props.push({ kind: "chest", x: (x0 + 2) * T, y: (fr + 6) * T - 22, w: 30, h: 22, open: false, secret: true });
        secrets.push({ c0: x0 - 3, r0: fr + 2, c1: x0 + 5, r1: fr + 5, gates: [[x0, fr], [x0 + 1, fr], [x0, fr + 1], [x0 + 1, fr + 1]], open: false });
      }
    }
    // cache latérale derrière un mur fissuré (voisin libre)
    if (R() < S.secret) {
      const right = c.cx + 1 < nx && !L.used[c.cy][c.cx + 1] && !c.r && c.vaultSide !== "r", left = c.cx > 0 && !L.used[c.cy][c.cx - 1] && !c.l && c.vaultSide !== "l";
      const dir = right ? 1 : left ? -1 : 0;
      if (dir) {
        const bc = dir > 0 ? c.X0 + CW : c.X0, c0 = dir > 0 ? bc + 1 : bc - 9, c1 = dir > 0 ? bc + 9 : bc - 1;
        if (dir > 0) carve(fr - 3, c.right, fr - 1, bc - 1); else carve(fr - 3, bc + 1, fr - 1, c.left);
        carve(fr - 3, Math.min(c0, c1), fr - 1, Math.max(c0, c1));
        for (let r = fr - 3; r <= fr - 1; r++) put(r, bc, 4);
        props.push({ kind: "chest", x: (dir > 0 ? bc + 5 : bc - 5) * T, y: fr * T - 22, w: 30, h: 22, open: false, secret: true });
        secrets.push({ c0: Math.min(c0, c1), r0: fr - 3, c1: Math.max(c0, c1), r1: fr - 1, gates: [[bc, fr - 3], [bc, fr - 2], [bc, fr - 1]], open: false });
      }
    }
  }

  // 7. portes de sortie
  nextKeys = pickNext(bk, d);
  const exits = [exitA, exitB].filter(Boolean);
  nextKeys.forEach((k, i) => {
    const room = exits[Math.min(i, exits.length - 1)];
    const cands = [room.right - 5, room.right - 10, room.left + 6, (room.left + room.right) >> 1].filter((x) => !room.res.some((q) => x + 3 >= q[0] && x - 2 <= q[1]) && !doors.some((o) => Math.abs(o.x / T - x) < 4));
    const dc = cands[i >= exits.length ? Math.min(1, cands.length - 1) : 0] || room.right - 5;
    carve(room.floor - 3, dc - 1, room.floor - 1, dc + 2);
    for (let q = -1; q <= 2; q++) put(room.floor, dc + q, 1);
    doors.push({ x: dc * T, y: room.floor * T - 64, w: 40, h: 64, open: true, next: k });
  });
  { const sc = startC.left + 2, g = gAt(startC, sc); startPos = { x: sc * T, y: (g > 0 ? g + 1 : startC.floor) * T }; }

  // 8. objets : autels, marchand, parchemins, coffre maudit (toujours posés sur le sol réel)
  const mids = [...cells.values()].filter((c) => c.kind === "room");
  for (let i = mids.length - 1; i > 0; i--) { const j = ri(i + 1); [mids[i], mids[j]] = [mids[j], mids[i]]; }
  const altar = (c, item, dx, price, group) => {
    const cx0 = (c.left + c.right) / 2 * T + (dx || 0), col = Math.floor(cx0 / T);
    const g = gAt(c, col);
    if (g < 0) return false;
    props.push({ kind: "item", item, altar: true, price: price || 0, group, x: cx0 - 11, y: (g + 1) * T - 30, w: 22, h: 22, bob: R() * 6 });
    return true;
  };
  if (freshRun && d === 0) {                                                         // équipement de départ : un seul au choix
    const opts = [mkWeapon("bow", 0), mkWeapon("shield", 0), mkSkill("grenade")];
    opts.forEach((it, i) => altar(startC, it, (i - 1) * 84 + 40, 0, "start"));
  }
  const shopC = mids.length >= 3 ? mids.shift() : null;
  if (shopC) {
    shopC.kind = "shop";
    props = props.filter((p) => !(p.kind === "totem" && p.x >= shopC.X0 * T && p.x < (shopC.X0 + CW) * T && p.y < shopC.floor * T && p.y > shopC.Y0 * T));
    const goldK = 1 + depth * 0.6 + loop;
    const wares = [randWeapon(1, R), R() < 0.5 ? randSkill(R) : randWeapon(1, R), R() < 0.35 ? { kind: "scroll" } : { kind: "food" }];
    const base = [110, 90, wares[2].kind === "scroll" ? 260 : 70];
    wares.forEach((it, i) => altar(shopC, it, (i - 1) * 80 + 30, Math.round(base[i] * goldK * (it.rar ? 1 + it.rar * 0.45 : 1) / 5) * 5));
    const mc = Math.floor(((shopC.left + shopC.right) / 2 * T - 120) / T), g = gAt(shopC, mc);
    if (g > 0) { props.push({ kind: "merchant", x: mc * T, y: (g + 1) * T - 40, w: 26, h: 40, face: 1 }); torches.push({ x: mc * T + 20, y: (g - 2) * T, s: R() * 10, warm: 1 }); }
  }
  if (S.reward && mids.length) {
    const item = S.reward === "weapon" ? randWeapon(1, R) : S.reward === "skill" ? randSkill(R) : null;
    if (item) altar(mids[0], item, 0);
  }
  for (let i = 0, k = 1; i < 2 && k < mids.length + 4; k++) {
    const c = mids.length ? mids[(k + i) % mids.length] : exitA;
    if (altar(c, { kind: "scroll" }, i ? -110 : 110)) i++;
  }
  if (mids.length >= 2 && R() < 0.4 + 0.1 * depth) {
    const c = mids[mids.length - 1], col = c.left + 4 + ri(Math.max(1, c.right - c.left - 8)), g = gAt(c, col);
    if (g > 0) props.push({ kind: "chest", cursed: true, x: col * T, y: (g + 1) * T - 26, w: 34, h: 26, open: false });
  }

  // 9. ennemis
  if (withEnemies) {
    const dens = S.diff * 0.45 + 0.8 + d * 0.1;
    for (const c of cells.values()) {
      if (c.kind === "start" || c.kind === "shop" || c.vault) continue;
      let n = Math.round(dens * (0.8 + R() * 1.1));
      if (c.kind === "exit") n = Math.min(n, 2);
      for (let i = 0, tries = 0; i < n && tries < n * 4 && enemies.length < 90; tries++) {
        const type = weightedPick(S.mix, R), dd = ENEMY[type];
        const col = c.left + 2 + ri(Math.max(1, c.right - c.left - 4)), g = gAt(c, col);
        if (g < 0 || SOL(tileAt(col + 1, g)) || SOL(tileAt(col + 1, g - 1)) || !FLOOR(tileAt(col + 1, g + 1))) continue;
        if (dd.fly) { const fy = g - 3 - ri(4); if (SOL(tileAt(col, fy))) continue; spawn(type, col * T, fy * T); }
        else spawn(type, col * T + 2, (g + 1) * T - dd.h - 0.01);
        i++;
      }
      if (R() < S.bat * 0.5 && enemies.length < 90) { const col = c.left + 3 + ri(Math.max(1, c.right - c.left - 6)), g = gAt(c, col); if (g > 0 && !SOL(tileAt(col, g - 5))) spawn("bat", col * T, (g - 5) * T); }
      for (const p of c.perches) if (R() < 0.35 && enemies.length < 90) spawn("archer", p.x, p.y - ENEMY.archer.h - 0.01);
    }
    const cand = enemies.filter((e) => !e.fly && e.type !== "slimeS" && Math.abs(e.x - startPos.x) > 900);
    for (let i = 0, n = 1 + (d >= 2 ? 1 : 0) + loop; i < n && cand.length; i++) makeElite(cand.splice(Math.floor(R() * cand.length), 1)[0]);
  }
  // 10. vases, torches, puis recalage de tout ce qui est posé
  for (const c of cells.values()) {
    if (c.kind === "start" || c.vault) continue;
    for (let i = 0, n = ri(4); i < n; i++) {
      const col = c.left + 1 + ri(Math.max(1, c.right - c.left - 2)), g = gAt(c, col);
      if (g < 0) continue;
      const big = R() < 0.35;
      props.push({ kind: "vase", big, x: col * T + 16 - (big ? 11 : 8), y: (g + 1) * T - (big ? 26 : 20), w: big ? 22 : 16, h: big ? 26 : 20, v: ri(3) });
    }
    for (let k = 0; k < 2; k++) {
      const col = c.left + 3 + k * Math.floor((c.right - c.left) / 2) + ri(4), g = gAt(c, col);
      if (g > 0) torches.push({ x: col * T + 16, y: (g - 4) * T + 8, s: R() * 10 });
    }
  }
  settleProps();
  return cells;
}

// ---------- arènes de boss
function genArena(R, d, bk, withEnemies) {
  ROWS = 40; COLS = S.cols;
  const type = S.boss, top = type === "archi" ? 12 : type === "matri" ? 20 : 17, FL = 34;
  grid = []; for (let r = 0; r < ROWS; r++) grid.push(new Uint8Array(COLS));
  const put = (r, c, v) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = v; };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (r >= FL || r < top || c === 0 || c === COLS - 1) grid[r][c] = 1;
  for (let c = 1; c <= 4; c++) for (let r = 31; r < FL; r++) grid[r][c] = 1;                      // estrade d'entrée
  for (let c = COLS - 5; c < COLS - 1; c++) for (let r = 31; r < FL; r++) grid[r][c] = 1;          // estrade de sortie
  // voûte irrégulière et murs bosselés : jamais un simple rectangle
  for (let c = 1; c < COLS - 1; c++) {
    const h = Math.round(2 + 2 * Math.sin(c * 0.35 + R() * 0.5) + 1.5 * Math.sin(c * 0.13 + 2));
    for (let r = top; r < top + Math.max(0, h); r++) grid[r][c] = 1;
  }
  for (let r = top; r < 29; r++) { const w = Math.max(0, Math.round(1.5 + 1.5 * Math.sin(r * 0.6))); for (let k = 1; k <= w; k++) { put(r, k, 1); put(r, COLS - 1 - k, 1); } }
  // plateformes et piliers propres à chaque boss
  if (type === "archi") {
    for (const [a, b, r] of [[7, 12, 30], [COLS - 13, COLS - 8, 30], [17, 28, 26], [5, 10, 22], [COLS - 11, COLS - 6, 22], [19, 26, 19]]) for (let c = a; c <= b; c++) put(r, c, 2);
    for (const c of [15, COLS - 16]) for (let r = 32; r < FL; r++) { put(r, c, 1); put(r, c + 1, 1); }
  } else if (type === "matri") {
    for (const [a, b, r] of [[9, 14, 30], [COLS - 15, COLS - 10, 30], [24, 31, 28]]) for (let c = a; c <= b; c++) put(r, c, 2);
    for (const c of [20, 36]) { put(FL - 1, c, 1); put(FL - 1, c + 1, 1); put(FL - 1, c + 2, 1); }
  } else {
    for (const [a, b, r] of [[8, 13, 30], [COLS - 14, COLS - 9, 30], [17, 34, 27]]) for (let c = a; c <= b; c++) put(r, c, 2);
  }
  startPos = { x: 3 * T, y: 31 * T };
  if (S.final) doors.push({ x: (COLS - 3) * T - 20, y: 31 * T - 64, w: 40, h: 64, open: false, next: "boss" });
  else {
    nextKeys = pickNext(bk, d);
    nextKeys.forEach((k, i) => doors.push({ x: (COLS - 3 - i * 0) * T - 20 - i * 0, y: 31 * T - 64 - i * 0, w: 40, h: 64, open: false, next: k }));
    if (nextKeys.length > 1) { doors[1].x = (COLS - 8) * T; doors[1].y = FL * T - 64; }
  }
  if (withEnemies) {
    const e = ENEMY[type];
    bossRef = spawn(type, (COLS - 16) * T, (type === "archi" ? 26 : FL) * T - e.h);
  }
  for (let c = 6; c < COLS - 2; c += 9) torches.push({ x: c * T + 16, y: 28 * T + 8, s: R() * 10 });
  const wr = top + 5;
  for (const c of [Math.floor(COLS * 0.2), Math.floor(COLS * 0.5), Math.floor(COLS * 0.78)]) { decos.push({ kind: "window", x: c * T, y: wr * T, ph: R() * 6 }); rays.push({ x: c * T + 32, y: wr * T + 20, len: 380, w: 60, sl: 0.3, ph: R() * 6 }); }
  for (let c = 6; c < COLS - 4; c += 12) decos.push({ kind: "banner", x: c * T + 4, y: (wr - 1) * T, h: 70, ph: R() * 6 });
  for (let c = 13; c < COLS - 6; c += 8) decos.push({ kind: "chain", x: c * T + 16, y: (top + 6) * T, len: 90 + R() * 60, cage: c % 3 === 0, ph: R() * 6 });
}

function genLevel(bk, d, withEnemies) {
  S = BIOMES[bk];
  enemies = []; shots = []; pickups = []; parts = []; torches = []; layers = []; props = []; bombs = []; traps = []; turrets = []; route = []; doors = []; secrets = [];
  decos = []; rays = []; fgs = []; ghosts = []; fires = []; pools = [];
  cracks = new Map(); bossDead = false; bossRef = null; bossIntro = 0;
  const R = mulberry32(((Math.random() * 1e9) | 0) + d * 7919);
  const ri = (n) => Math.floor(R() * n);
  if (S.boss) {
    genArena(R, d, bk, withEnemies);
  } else {
    genCaves(R, d, bk, withEnemies);
  }
  seen = new Uint8Array(COLS * ROWS); seenStamp = new Uint32Array(COLS * ROWS); seenN = 0; lastSC = lastSR = -1; mmDirty = true; mmCanvas = null;
  hidMap = new Uint8Array(COLS * ROWS);
  for (const sc of secrets) for (let r = sc.r0; r <= sc.r1; r++) for (let c = sc.c0; c <= sc.c1; c++) hidMap[r * COLS + c] = 1;
  buildPalette(); resetChunks(); genDecor(R); genBackdrop(R);
}

function spawn(type, x, y) {
  const d = ENEMY[type];
  const hpm = (BOSS_T[type] ? 1 : 1 + 0.22 * depth) * (1 + 0.6 * loop);
  const e = {
    type, x, y, w: d.w, h: d.h, vx: 0, vy: 0, hp: d.hp * hpm, maxHp: d.hp * hpm,
    face: Math.random() < 0.5 ? -1 : 1, state: BOSS_T[type] ? "sleep" : "idle", boss: !!BOSS_T[type],
    t: 0, cd: 0.4 + Math.random(), flash: 0, armor: !!d.armor, fly: !!d.fly,
    dmg: d.dmg * (1 + 0.12 * depth) * (1 + 0.15 * loop), contact: d.contact ? d.contact * (1 + 0.15 * loop) : 0,
    bob: Math.random() * 6, wall: 0, onGround: false, struck: false, stun: 0, stuck: [],
    st: { burn: 0, poison: 0, pst: 0, bleed: 0, bst: 0, freeze: 0, tick: 0, base: 4 }, sq: 1, elite: false, phase: 1,
  };
  enemies.push(e);
  return e;
}
function makeElite(e) {
  e.elite = true; e.hp *= 3.5; e.maxHp = e.hp; e.dmg *= 1.25; e.contact *= 1.2;
}

function startLevel(bk) {
  genLevel(bk, depth, true);
  P.x = startPos.x; P.y = startPos.y - P.h; P.vx = P.vy = 0; P.atk = null; P.roll = 0; P.inv = 0.5;
  P.guard = false; P.drawing = false; P.pound = false; P.clinging = false;
  P.safeX = P.x; P.safeY = P.y; P.flasks = U.flasks; pGR = Math.floor((P.y + P.h + 2) / T);
  P.hp = Math.min(U.maxHp, P.hp + U.maxHp * 0.3); P.rally = 0;
  P.cape = null; P.scarf = null; P.sq = 1; P.wasGround = true;
  cam.x = clamp(P.x - VW / 2, 0, COLS * T - VW); cam.y = clamp(P.y - VH / 2, 0, ROWS * T - VH);
  card = { t: 3.2, text: S.name, sub: S.boss ? "Boss" : "Niveau " + (depth + 1) + " · " + "☠".repeat(S.diff) };
  fade = 1; music(S.boss ? "menu" : Object.keys(BIOMES).find((k) => BIOMES[k] === S));
}

// ================================================================== physique
function moveBody(b, dt, grav) {
  if (grav) b.vy = Math.min(b.vy + GRAV * dt, 820);

  b.x += b.vx * dt; b.wall = 0;
  if (b.vx !== 0) {
    const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
    const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
    let best = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (SOL(tileAt(c, r))) {
          if (b.vx > 0) { if (best === null || c < best) best = c; }
          else if (best === null || c > best) best = c;
        }
      }
    }
    if (best !== null) {
      if (b.vx > 0) { b.x = best * T - b.w; b.wall = 1; } else { b.x = (best + 1) * T; b.wall = -1; }
      b.vx = 0;
    }
  }

  const py = b.y;
  b.y += b.vy * dt; b.onGround = false;
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  if (b.vy >= 0) {
    const r = Math.floor((b.y + b.h) / T);
    for (let c = c0; c <= c1; c++) {
      const t = tileAt(c, r);
      if ((SOL(t) && py + b.h <= r * T + Math.max(4, b.vy * dt + 1)) ||
          (t === 2 && py + b.h <= r * T + 1 && !(b.dropT > 0))) {
        b.y = r * T - b.h; b.vy = 0; b.onGround = true; break;
      }
    }
  } else {
    const r = Math.floor(b.y / T);
    for (let c = c0; c <= c1; c++) {
      if (SOL(tileAt(c, r))) { b.y = (r + 1) * T; b.vy = 0; break; }
    }
  }
}

function floorAhead(e, dir) {
  const d = dir === undefined ? e.face : dir;
  const fx = e.x + (d > 0 ? e.w + 6 : -6);
  return FLOOR(tileAt(Math.floor(fx / T), Math.floor((e.y + e.h + 4) / T)));
}

// tuiles destructibles
function tileFx(c, r) { burst(c * T + 16, r * T + 16, 8, S.edge, 160, 0.6, 4); }
function breakTile(c, r) {
  const t = tileAt(c, r);
  if (t !== 4 && t !== 5) return;
  setTile(c, r, 0); tileFx(c, r); debris(c, r);
  const dirs = t === 4 ? [-1, 1] : [1];
  for (const d of dirs) {
    let rr = r + d;
    while (tileAt(c, rr) === t) { setTile(c, rr, 0); tileFx(c, rr); debris(c, rr); rr += d; }
  }
  shake = Math.max(shake, 6); SFX.boom(); SFX.smash();
}
function debris(c, r) {
  for (let i = 0; i < 4; i++) parts.push({ x: c * T + rnd(4, 28), y: r * T + rnd(4, 28), vx: rnd(-160, 160), vy: rnd(-300, -60), life: 1.4, max: 1.4, col: i % 2 ? PAL.base : PAL.cap, size: rnd(4, 8), grav: 1200, gib: 1, rot: rnd(0, 6), vr: rnd(-12, 12) });
}
function hitTile(c, r, n) {
  const key = r * COLS + c;
  const v = (cracks.get(key) || 0) + n;
  cracks.set(key, v);
  burst(c * T + 16, r * T + 16, 4, "#9a9ab0", 90, 0.3, 2);
  SFX.hit();
  if (v >= 2) breakTile(c, r);
}
function explode(x, y, r, dmg, stun) {
  for (const e of enemies) {
    if (e.dead || e.state === "sleep") continue;
    const d = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
    if (d < r + e.w / 2) damageEnemy(e, dmg * (1 - 0.4 * d / r), (e.x + e.w / 2 < x ? -1 : 1) * 260, 0.06, { stun });
  }
  for (let c = Math.floor((x - r) / T); c <= Math.floor((x + r) / T); c++) {
    for (let rr = Math.floor((y - r) / T); rr <= Math.floor((y + r) / T); rr++) {
      const t = tileAt(c, rr);
      if ((t === 4 || t === 5) && Math.hypot(c * T + 16 - x, rr * T + 16 - y) < r + 16) breakTile(c, rr);
    }
  }
  for (const p of props) if (p.kind === "vase" && !p.broken && Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y) < r + 10) breakVase(p);
  boomFx(x, y, r);
  shake = Math.max(shake, 11); SFX.boom();
}
function boomFx(x, y, r, col) {
  burst(x, y, 26, col || "#ff8a5a", 300, 0.6, 4); burst(x, y, 12, "#ffd23f", 200, 0.5, 3);
  parts.push({ x, y, ring: 1, rr: r * 1.1, life: 0.3, max: 0.3, col: "#fff4d0", vx: 0, vy: 0, grav: 0 });
  parts.push({ x, y, flash: 1, rr: r * 0.9, life: 0.18, max: 0.18, col: col || "#ffb060", vx: 0, vy: 0, grav: 0, light: r * 3 });
  for (let i = 0; i < 6; i++) parts.push({ x: x + rnd(-r / 2, r / 2), y: y + rnd(-r / 2, r / 3), vx: rnd(-40, 40), vy: rnd(-80, -20), life: 1.1, max: 1.1, col: "rgba(40,36,50,.7)", smoke: 1, size: rnd(14, 26), grav: -30 });
}

// ================================================================== effets
function burst(x, y, n, col, spd, life, size, grav) {
  for (let i = 0; i < n; i++) {
    const l = rnd((life || 0.4) * 0.6, life || 0.4);
    parts.push({ x, y, vx: rnd(-spd, spd), vy: rnd(-spd, spd * 0.4), life: l, max: l, col, size: size || 3, grav: grav === undefined ? 420 : grav });
  }
}
function addText(x, y, s, col) { parts.push({ x, y, vx: 0, vy: -55, life: 0.8, max: 0.8, col, txt: s, grav: 0 }); }
function toast(s) { toastTxt = s; toastT = 2.6; }

// ================================================================== joueur : armes
function swapWeapon() {
  if (!P.wp[1 - P.wi]) { toast("Pas de seconde arme"); return; }
  P.wi = 1 - P.wi; P.atk = null; P.atkBuf = 0; P.comboT = 0; P.drawing = false; P.draw = 0; P.guard = false; P.guardCd = 0.15;
  const it = aw(); toast(WEAPONS[it.id].name);
  SFX.swap();
}

function startAttack(dir) {
  const w = aw(), wd = WEAPONS[w.id], steps = wd.steps;
  const idx = P.comboT > 0 ? (P.combo + 1) % steps.length : 0;
  P.combo = idx;
  const s = steps[idx];
  if (dir) P.face = dir;
  P.atk = { idx, s, wid: w.id, it: w, t: 0, dur: s.dur, hit: new Set(), tiles: new Set(), mul: itemMul(w) };
  P.vx += P.face * s.lunge;
  if (s.dash) { P.inv = Math.max(P.inv, s.dur * 0.9); for (let k = 0; k < 4; k++) ghosts.push({ x: P.x - P.face * k * 10, y: P.y, a: 0, f: P.face, life: 0.25 }); sfx(1400, 300, 0.2, "sawtooth", 0.05); }
  P.atkBuf = 0;
  SFX.swing(); SFX.slash();
}

function startBash() {
  const w = aw();
  P.atk = { idx: 0, s: { dur: .28, dmg: 12, reach: 44, lunge: 90, kb: 320, hs: .07, stun: .6, bash: 1 }, wid: w.id, it: w, t: 0, dur: .28, hit: new Set(), tiles: new Set(), mul: itemMul(w) };
  P.vx += P.face * 90; SFX.swing();
}

function applyMelee() {
  const a = P.atk, s = a.s, wd = WEAPONS[a.wid];
  const f = a.t / a.dur, a0 = s.bash ? 0.2 : (wd.a0 || 0.22), a1 = s.bash ? 0.75 : (wd.a1 || 0.72);
  if (f < a0 || f > a1) return;
  const bx = s.around ? P.x + P.w / 2 - s.reach : P.face > 0 ? P.x + P.w - 2 : P.x - s.reach + 2;
  const bw = s.around ? s.reach * 2 : s.reach;
  const box = s.thin ? { x: bx, y: P.y + 8, w: bw, h: 14 } : { x: bx, y: P.y - 6, w: bw, h: P.h + 12 };
  for (const e of enemies) {
    if (e.dead || a.hit.has(e) || e.state === "sleep") continue;
    if (overlap(box, e)) {
      a.hit.add(e);
      let dmg = s.dmg * a.mul * U.melee;
      if (wd.backstab && e.face === P.face && !e.boss) { dmg *= wd.backstab; addText(e.x + e.w / 2, e.y - 22, "DANS LE DOS !", "#7dffb0"); }
      const dir = s.around ? (e.x + e.w / 2 < P.x + P.w / 2 ? -1 : 1) : P.face;
      playerHit(e, dmg, a.it, dir * s.kb, s.hs, { stun: s.stun, shock: s.shock, forceCrit: !!s.dash });
    }
  }
  for (const p of props) if (p.kind === "vase" && !p.broken && overlap(box, p)) breakVase(p);
  for (const sh of shots) {
    if (sh.from === "e" && sh.kind !== "wave" && sh.life > 0 && overlap(box, sh)) {
      sh.life = 0; burst(sh.x, sh.y, 6, "#ffd23f", 140, 0.3);
      addText(sh.x, sh.y - 10, "PARADE", "#ffd23f"); SFX.hit();
    }
  }
  // murs / sols fissurés
  const rows = s.smash ? [Math.floor((P.y - 6) / T), Math.floor((P.y + P.h + 10) / T)] : [Math.floor(box.y / T), Math.floor((box.y + box.h) / T)];
  for (let c = Math.floor(box.x / T); c <= Math.floor((box.x + box.w) / T); c++) {
    for (let r = rows[0]; r <= rows[1]; r++) {
      const t = tileAt(c, r), key = r * COLS + c;
      if (t === 4 && !a.tiles.has(key)) { a.tiles.add(key); hitTile(c, r, s.smash ? 2 : 1); }
      else if (t === 5 && s.smash && !a.tiles.has(key)) { a.tiles.add(key); breakTile(c, r); }
    }
  }
}

function fireBow(w, wd) {
  if (w.ammo <= 0) { toast("Plus de flèches !"); sfx(150, 100, 0.08, "square", 0.04); return; }
  const pw = 0.4 + 0.6 * clamp(P.draw / wd.chargeT, 0, 1);
  w.ammo--;
  const sp = 430 + 380 * pw;
  shots.push({ x: P.x + P.w / 2 - 8, y: P.y + 11, vx: P.face * sp, vy: -15, w: 16, h: 5, dmg: wd.dmg * itemMul(w) * U.ranged * (0.45 + 0.55 * pw), life: 1.6, from: "p", kind: w.id === "crossbow" ? "bolt2" : "arrow", bow: w, it: w, pierce: wd.pierce, hitSet: new Set(), grav: 420 * (1.15 - pw), trail: 1 });
  P.vx -= P.face * 30;
  muzzle(P.x + P.w / 2 + P.face * 14, P.y + 13, wd.col);
  SFX.shoot();
}
function muzzle(x, y, col) {
  for (let i = 0; i < 5; i++) parts.push({ x, y, vx: P.face * rnd(80, 260), vy: rnd(-60, 60), life: 0.16, max: 0.16, col, streak: 1, size: 2, grav: 0 });
}

function useSkill(i) {
  const s = P.sk[i];
  if (!s || s.t > 0 || P.hurtT > 0 || scene !== "play") return;
  const d = SKILLS[s.id], cx = P.x + P.w / 2, sm = itemMul(s) * U.ranged;
  s.t = d.cd * U.cdMul;
  if (s.id === "grenade" || s.id === "firebomb") {
    bombs.push({ x: cx - 5, y: P.y + 6, w: 10, h: 10, vx: P.face * 330 + P.vx * 0.4, vy: -380, t: 1.2, wall: 0, onGround: false, fire: s.id === "firebomb", m: sm });
    SFX.swing();
  } else if (s.id === "knives") {
    for (const a of [-0.12, 0, 0.12]) shots.push({ x: cx - 6, y: P.y + 12, vx: P.face * 620 * Math.cos(a), vy: 620 * Math.sin(a), w: 12, h: 4, dmg: 9 * sm, life: 0.8, from: "p", kind: "knife", hitSet: new Set(), pierce: 0, bleed: 1 });
    muzzle(cx + P.face * 10, P.y + 12, d.col); SFX.shoot();
  } else if (s.id === "frost") {
    for (const e of enemies) {
      if (e.dead || e.state === "sleep") continue;
      if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - (P.y + 15)) < 170) { freezeEnemy(e, 3); damageEnemy(e, 6 * sm, 0, 0.03, {}); }
    }
    parts.push({ x: cx, y: P.y + 15, ring: 1, rr: 170, life: 0.4, max: 0.4, col: "#9fd8ff", vx: 0, vy: 0, grav: 0 });
    for (let k = 0; k < 30; k++) { const a = Math.random() * 6.3, v = rnd(120, 340); parts.push({ x: cx, y: P.y + 15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, col: k % 2 ? "#ffffff" : "#9fd8ff", size: 3, grav: 0 }); }
    shake = Math.max(shake, 6); sfx(1600, 300, 0.4, "triangle", 0.06); noise(0.35, 0.12, 6000, 0.7);
  } else if (s.id === "trap") {
    if (traps.length >= 2) traps.shift();
    traps.push({ x: cx - 10, y: P.y + P.h - 6, w: 20, h: 6, arm: 0.6, t: 25 });
    SFX.swap();
  } else if (s.id === "turret") {
    turrets.length = 0;
    turrets.push({ x: cx - 10, y: P.y + P.h - 18, w: 20, h: 18, t: 10, cd: 0.3, ang: 0 });
    SFX.swap();
  } else if (s.id === "pulse") {
    for (const e of enemies) {
      if (e.dead || e.state === "sleep") continue;
      if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - (P.y + 15)) < 150)
        damageEnemy(e, 12 * sm, (e.x + e.w / 2 < cx ? -1 : 1) * 420, 0.05, { stun: 0.9 });
    }
    for (const sh of shots) if (sh.from === "e" && Math.hypot(sh.x - cx, sh.y - P.y) < 150) sh.life = 0;
    parts.push({ x: cx, y: P.y + 15, ring: 1, life: 0.35, max: 0.35, col: "#b58bff", vx: 0, vy: 0, grav: 0 });
    shake = Math.max(shake, 7); SFX.boom();
  }
  toast(d.name);
}

// ================================================================== joueur : interactions
function nearestProp() {
  let best = null, bd = 56;
  for (const p of props) {
    if (hidMap[Math.floor((p.y + p.h / 2) / T) * COLS + Math.floor((p.x + p.w / 2) / T)]) continue;
    if (p.kind !== "chest" && p.kind !== "item") continue;
    if (p.kind === "chest" && p.open) continue;
    const d = Math.hypot(p.x + p.w / 2 - (P.x + P.w / 2), p.y + p.h / 2 - (P.y + P.h / 2));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function dropItem(item, x, y) {
  props.push({ kind: "item", item, x: x - 11, y: y - 24, w: 22, h: 22, bob: Math.random() * 6, vx: rnd(-80, 80), vy: -260, drop: true, t: 0.5 });
}
function dropCoins(x, y, n) {
  for (let i = 0; i < n; i++) pickups.push({ x, y, w: 7, h: 7, vx: rnd(-150, 150), vy: rnd(-340, -120), kind: "gold", t: 0, wall: 0, v: 3 + depth * 2 + loop * 4 });
}
function dropCells(x, y, n) {
  for (let i = 0; i < n; i++) pickups.push({ x, y, w: 8, h: 8, vx: rnd(-150, 150), vy: rnd(-340, -140), kind: "cell", t: 0, wall: 0 });
}
function breakVase(p) {
  p.broken = true;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2, col = p.big ? "#6a4a2a" : ["#5a6a8a", "#7a5a6a", "#4a6a5a"][p.v];
  for (let i = 0; i < 8; i++) parts.push({ x: cx + rnd(-6, 6), y: cy + rnd(-6, 6), vx: rnd(-200, 200), vy: rnd(-320, -80), life: 1.3, max: 1.3, col, size: rnd(3, 7), grav: 1300, gib: 1, rot: rnd(0, 6), vr: rnd(-14, 14) });
  burst(cx, cy, 6, "#c8c0a0", 120, 0.4, 2);
  const r = Math.random();
  if (r < 0.55) dropCoins(cx, cy, 1 + Math.floor(Math.random() * (p.big ? 5 : 3)));
  else if (r < 0.62) dropCells(cx, cy, 1);
  else if (r < 0.66) pickups.push({ x: cx, y: cy, w: 10, h: 10, vx: 0, vy: -240, kind: "orb", t: 0, wall: 0 });
  SFX.smash(); sfx(700, 300, 0.08, "square", 0.03);
}
function interact() {
  const p = nearestProp();
  if (!p) { const d = nearDoor(); if (d) enterDoor(d); return; }
  if (p.kind === "chest") {
    p.open = true; SFX.cell();
    burst(p.x + 15, p.y, 16, p.cursed ? "#b58bff" : "#ffd23f", 180, 0.6, 3);
    if (p.cursed) {
      P.curse = 10; SFX.curse(); shake = Math.max(shake, 10); flashRed = 0.3;
      toast("MAUDIT ! Le prochain coup est fatal — élimine 10 ennemis");
      for (let i = 0; i < 24; i++) parts.push({ x: P.x + P.w / 2, y: P.y + 10, vx: rnd(-200, 200), vy: rnd(-260, 40), life: 1, max: 1, col: "#b58bff", size: 4, grav: -100 });
      dropItem(randWeapon(2), p.x + 10, p.y);
      dropItem(Math.random() < 0.5 ? randSkill() : randWeapon(1), p.x + 24, p.y);
      dropCoins(p.x + 17, p.y, 12); dropCells(p.x + 17, p.y, 6);
      return;
    }
    const r = Math.random();
    if (r < 0.45) dropItem(randWeapon(0), p.x + 15, p.y);
    else if (r < 0.65) dropItem(randSkill(), p.x + 15, p.y);
    else if (r < 0.72) dropItem({ kind: "food" }, p.x + 15, p.y);
    else {
      dropCells(p.x + 15, p.y, Math.round(rnd(6, 12) * (S.cellMul || 1)));
      if (Math.random() < 0.5) pickups.push({ x: p.x + 15, y: p.y, w: 10, h: 10, vx: 0, vy: -240, kind: "orb", t: 0, wall: 0 });
    }
    dropCoins(p.x + 15, p.y, 3 + Math.floor(Math.random() * 5));
    return;
  }
  const it = p.item;
  if (p.group) {                                                        // choix exclusif : les autres disparaissent
    for (const o of props.slice()) if (o !== p && o.group === p.group) { warpFx(o.x + 11, o.y + 11); props.splice(props.indexOf(o), 1); }
    toast("Équipement de départ choisi");
  }
  if (p.price) {
    if (run.gold < p.price) { toast("Pas assez d'or (" + p.price + " requis)"); sfx(150, 100, 0.1, "square", 0.04); return; }
    run.gold -= p.price; p.price = 0; SFX.gold(); SFX.cell();
    burst(p.x + 11, p.y + 11, 14, "#ffd23f", 160, 0.5, 3);
  }
  if (it.kind === "food") {
    const h = Math.round(U.maxHp * 0.4);
    P.hp = Math.min(U.maxHp, P.hp + h); addText(P.x + P.w / 2, P.y - 6, "+" + h, "#3dff9a");
    burst(P.x + P.w / 2, P.y + P.h / 2, 14, "#3dff9a", 120, 0.6, 3, -40);
    props.splice(props.indexOf(p), 1); SFX.heal(); return;
  }
  if (it.kind === "scroll") { props.splice(props.indexOf(p), 1); openScroll(); return; }
  if (it.kind === "bp") {
    save.found[it.id] = true; persist();
    toast("Plan découvert : " + (WEAPONS[it.id] || SKILLS[it.id]).name + " — à débloquer à la Forge");
    props.splice(props.indexOf(p), 1); SFX.scroll(); return;
  }
  if (it.kind === "weapon") {
    const other = 1 - P.wi;
    if (!P.wp[other]) { P.wp[other] = it; P.wi = other; P.atk = null; P.comboT = 0; }
    else { dropItem(aw(), P.x + P.w / 2, P.y + P.h); P.wp[P.wi] = it; P.atk = null; P.comboT = 0; }
    P.drawing = false; P.draw = 0; P.guard = false;
    toast(WEAPONS[it.id].name + " · " + RAR[it.rar].n);
  } else {
    const slot = !P.sk[0] ? 0 : !P.sk[1] ? 1 : 0;
    if (P.sk[slot]) dropItem(P.sk[slot], P.x + P.w / 2, P.y + P.h);
    P.sk[slot] = it;
    toast(SKILLS[it.id].name);
  }
  props.splice(props.indexOf(p), 1);
  SFX.heal();
}

// ================================================================== joueur : mise à jour
function startRoll(dir) {
  P.roll = 0.38; P.rollDir = dir || P.face; P.inv = Math.max(P.inv, 0.38);
  P.atk = null; P.atkBuf = 0; P.drawing = false; P.draw = 0; P.guard = false; P.clinging = false;
  burst(P.x + P.w / 2, P.y + P.h, 6, "#9ffcff", 90, 0.3, 2, 100);
  SFX.roll();
}

function updatePlayer(dt) {
  consumed = true;
  const dirIn = (down("right") ? 1 : 0) - (down("left") ? 1 : 0);
  const w = aw(), wd = w ? WEAPONS[w.id] : null, wt = wd ? wd.type : "none";
  P.inv = Math.max(0, P.inv - dt);
  P.rollCd -= dt; P.comboT -= dt; P.coyote -= dt; P.buf -= dt; P.atkBuf -= dt;
  P.dropT -= dt; P.hurtT -= dt; P.guardCd -= dt; P.wjLock -= dt; P.wallCoy -= dt; P.critRollT -= dt;
  for (const s of P.sk) if (s && s.t > 0) s.t -= dt;
  if (P.rally > 0) { P.rallyT -= dt; if (P.rallyT <= 0) P.rally = Math.max(0, P.rally - 28 * dt); }
  if (P.onGround) { P.coyote = 0.09; P.air = 1; }
  if (hit("up")) P.buf = 0.12;

  if (hit("swap")) swapWeapon();
  if (hit("use")) interact();
  if (hit("sk1")) useSkill(0);
  if (hit("sk2")) useSkill(1);
  if (hit("roll") && P.roll <= 0 && P.rollCd <= 0 && P.hurtT <= 0 && !P.pound) startRoll(dirIn);

  // contact avec un mur (détecté à mi-hauteur)
  P.wallDir = 0;
  if (!P.onGround) {
    const mid = P.y + P.h * 0.5, mr = Math.floor(mid / T);
    const lt = tileAt(Math.floor((P.x - 1.5) / T), mr), rt = tileAt(Math.floor((P.x + P.w + 1.5) / T), mr);
    const okW = (t) => SOL(t) && (t !== 6 || P.rune.spider);
    if (okW(lt)) { P.wallDir = -1; P.wallVine = lt === 6; } else if (okW(rt)) { P.wallDir = 1; P.wallVine = rt === 6; }
  }
  if (P.wallDir) { P.wallLast = P.wallDir; P.wallCoy = 0.1; }
  P.clinging = !!(P.rune.spider && P.wallVine && P.wallDir && !P.onGround && dirIn === P.wallDir && P.roll <= 0 && !P.pound && P.hurtT <= 0);

  // frappe plongeante (rune du Briseur)
  if (P.rune.breaker && !P.onGround && down("down") && hit("attack") && !P.pound && P.roll <= 0 && P.hurtT <= 0) {
    P.pound = true; P.atk = null; P.guard = false; P.drawing = false; P.clinging = false;
    SFX.swing();
  }

  // armes
  if (wt === "melee") {
    if (down("attack") && !P.pound) P.atkBuf = 0.2;
    if (P.atkBuf > 0 && !P.atk && P.roll <= 0 && P.hurtT <= 0 && !P.pound) startAttack(dirIn);
  } else if (wt === "bow") {
    if (down("attack") && P.roll <= 0 && P.hurtT <= 0 && !P.pound) { P.drawing = true; P.draw = Math.min(P.draw + dt, wd.chargeT); }
    else if (P.drawing) { if (P.draw >= 0.08 && P.roll <= 0) fireBow(w, wd); P.drawing = false; P.draw = 0; }
  } else if (wt === "shield") {
    const held = down("attack");
    if (held && P.roll <= 0 && P.hurtT <= 0 && P.guardCd <= 0 && !P.atk && !P.pound) {
      if (!P.guard) { P.guard = true; P.guardT = 0; }
      P.guardT += dt;
    } else if (P.guard) {
      P.guard = false;
      if (P.guardT < 0.15 && !P.atk && P.hurtT <= 0 && P.roll <= 0) startBash();
      P.guardCd = 0.18; P.guardT = 0;
    }
  } else { P.guard = false; }
  if (wt !== "bow") { P.drawing = false; P.draw = 0; }
  if (wt !== "shield" && P.guard) P.guard = false;

  if (P.atk) {
    P.atk.t += dt;
    applyMelee();                                       // (un coup peut tuer un kamikaze dont l'explosion annule l'attaque)
    if (P.atk && P.atk.t >= P.atk.dur) {
      P.comboT = (P.atk.s.bash || P.atk.idx === WEAPONS[P.atk.wid].steps.length - 1) ? 0 : 0.38;
      P.atk = null;
    }
  }

  // déplacement horizontal
  if (P.roll > 0) {
    P.roll -= dt;
    P.vx = P.rollDir * 400 * U.rollMul;
    P.ghostT -= dt;
    if (P.ghostT <= 0) { P.ghostT = 0.035; ghosts.push({ x: P.x, y: P.y, a: (1 - P.roll / 0.38) * Math.PI * 2 * P.rollDir, f: P.face, life: 0.25 }); }
    if (P.roll <= 0) { P.rollCd = 0.18; P.vx *= 0.4; P.critRollT = 1; }
  } else if (P.pound) {
    P.vx *= 0.5;
  } else if (P.hurtT > 0) {
    P.vx = approach(P.vx, 0, 600 * dt);
  } else if (P.wjLock > 0) {
    // élan du saut mural conservé
  } else {
    let tv = dirIn * 225 * U.speed;
    if (P.atk && P.onGround) tv *= (wd && wd.atkSlow !== undefined ? wd.atkSlow : 0.35);
    if (P.guard) tv *= 0.5;
    if (P.drawing) tv *= 0.6;
    P.vx = approach(P.vx, tv, (P.onGround ? 2800 : 1700) * dt);
    if (dirIn && !P.atk && !P.guard && !P.drawing) P.face = dirIn;
  }

  // descendre d'une plateforme fine : bas maintenu un instant, ou bas + saut
  {
    const fr = Math.floor((P.y + P.h + 1) / T), a = tileAt(Math.floor((P.x + 2) / T), fr), b = tileAt(Math.floor((P.x + P.w - 2) / T), fr);
    const thin = P.onGround && (a === 2 || b === 2) && !SOL(a) && !SOL(b);
    if (thin && down("down") && P.roll <= 0 && !P.atk && !P.guard) P.dropHold += dt; else P.dropHold = 0;
    if (thin && (P.dropHold > 0.12 || (down("down") && P.buf > 0))) {
      P.dropT = 0.28; P.onGround = false; P.coyote = 0; P.buf = 0; P.dropHold = 0; P.y += 3; P.vy = Math.max(P.vy, 60);
    }
  }

  // sauts : mur, sol, double saut
  const wallTouch = P.wallDir !== 0 || P.wallCoy > 0;
  if (P.clinging) P.buf = 0;
  if (P.buf > 0 && P.roll <= 0 && P.hurtT <= 0 && !P.pound) {
    if (P.coyote > 0) {
      P.vy = -545; P.coyote = 0; P.buf = 0; P.onGround = false; P.sq = 1.3;
      dust(P.x + P.w / 2, P.y + P.h, 6); SFX.jump();
    } else if (wallTouch && !P.onGround) {
      P.vy = -540; P.vx = -P.wallLast * 270; P.face = -P.wallLast; P.wjLock = 0.16; P.buf = 0; P.air = 1; P.wallCoy = 0; P.sq = 1.25;
      burst(P.x + (P.wallLast > 0 ? P.w : 0), P.y + P.h / 2, 8, "#9ffcff", 100, 0.3, 2, 60); SFX.jump();
    } else if (P.air > 0) {
      P.vy = -490; P.air--; P.buf = 0; P.sq = 1.25;
      parts.push({ x: P.x + P.w / 2, y: P.y + P.h, ring: 1, rr: 26, flat: 1, life: 0.25, max: 0.25, col: "#9ffcff", vx: 0, vy: 0, grav: 0 });
      burst(P.x + P.w / 2, P.y + P.h, 8, "#9ffcff", 110, 0.3, 2, 40); SFX.jump();
    }
  }
  if (!down("up") && P.vy < -230 && !P.pound) P.vy += 2400 * dt;       // saut plus court si on relâche

  // escalade (rune) ou glissade le long d'un mur
  if (P.clinging) {
    P.vy = down("up") ? -135 : (down("down") ? 135 : 0);
    P.air = 1;
    const wt = tileAt(Math.floor((P.wallDir > 0 ? P.x + P.w + 1.5 : P.x - 1.5) / T), Math.floor((P.y + 2) / T));
    if (down("up") && wt !== 6) { P.vy = -360; P.vx = (SOL(wt) ? -P.wallDir : P.wallDir) * 210; P.wjLock = 0.3; P.clinging = false; }   // franchit le rebord
  } else if (P.wallDir && P.vy > 0 && dirIn === P.wallDir && !P.pound) {
    P.vy = Math.min(P.vy, 95);
  }
  if (P.pound) P.vy = Math.max(P.vy, 820);

  // soin
  if (hit("heal") && P.flasks > 0 && P.hp < U.maxHp) {
    P.flasks--;
    const h = Math.round(U.maxHp * U.heal);
    P.hp = Math.min(U.maxHp, P.hp + h);
    addText(P.x + P.w / 2, P.y - 6, "+" + h, "#3dff9a");
    burst(P.x + P.w / 2, P.y + P.h / 2, 14, "#3dff9a", 120, 0.6, 3, -40);
    SFX.heal();
  }

  const vyBefore = P.vy;
  moveBody(P, dt, !P.clinging);
  if (P.onGround && !P.wasGround && vyBefore > 260) {                    // atterrissage : écrasement + poussière
    P.sq = vyBefore > 650 ? 0.62 : 0.78; dust(P.x + P.w / 2, P.y + P.h, vyBefore > 650 ? 12 : 6);
    if (vyBefore > 650) sfx(120, 60, 0.12, "triangle", 0.06);
  }
  P.wasGround = P.onGround;
  if (P.onGround && Math.abs(P.vx) > 120 && P.roll <= 0) { P.dustT -= dt; if (P.dustT <= 0) { P.dustT = 0.22; dust(P.x + P.w / 2 - P.face * 6, P.y + P.h, 2); } }
  P.runPh += Math.abs(P.vx) * dt * 0.05;

  if (P.wallDir && !P.clinging && P.vy > 0 && dirIn === P.wallDir) P.vy = Math.min(P.vy, 95);

  if (P.pound && P.onGround) {                                           // impact de la frappe plongeante
    P.pound = false; shake = Math.max(shake, 15); hitstop = Math.max(hitstop, 0.08); SFX.boom();
    const cx = P.x + P.w / 2;
    burst(cx, P.y + P.h, 24, "#ffb020", 280, 0.6, 4);
    for (const e of enemies) {
      if (e.dead || e.state === "sleep") continue;
      if (Math.abs(e.x + e.w / 2 - cx) < 100 && Math.abs(e.y + e.h - (P.y + P.h)) < 60)
        damageEnemy(e, 26 * U.melee * statMul("brut"), (e.x + e.w / 2 < cx ? -1 : 1) * 260, 0.06, { stun: 0.7 });
    }
    for (const p of props) if (p.kind === "vase" && !p.broken && Math.abs(p.x + p.w / 2 - cx) < 90 && Math.abs(p.y + p.h - (P.y + P.h)) < 40) breakVase(p);
    P.sq = 0.6; dust(cx, P.y + P.h, 14);
    parts.push({ x: cx, y: P.y + P.h, ring: 1, rr: 110, flat: 1, life: 0.35, max: 0.35, col: "#ffb020", vx: 0, vy: 0, grav: 0 });
    const fr = Math.floor((P.y + P.h + 2) / T);
    for (let c = Math.floor((cx - 40) / T); c <= Math.floor((cx + 40) / T); c++) if (tileAt(c, fr) === 5) breakTile(c, fr);
  }

  if (P.onGround) {
    const c = Math.floor((P.x + P.w / 2) / T), fr = Math.floor((P.y + P.h + 1) / T);
    let safe = true;
    for (let dc = -2; dc <= 2; dc++) if (!SOL(tileAt(c + dc, fr))) safe = false;
    if (safe) { P.safeX = P.x; P.safeY = P.y; }
  }

  // pointes
  const c0 = Math.floor(P.x / T), c1 = Math.floor((P.x + P.w) / T);
  const r0 = Math.floor(P.y / T), r1 = Math.floor((P.y + P.h) / T);
  let spiked = false;
  for (let r = r0; r <= r1 && !spiked; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tileAt(c, r) === 3 && overlap(P, { x: c * T, y: r * T + 16, w: T, h: 16 })) { spiked = true; break; }
    }
  }
  if (spiked && P.roll <= 0) {
    hurtPlayer(12, P.x + P.w / 2, { kind: "contact" });
    if (scene === "play") { P.x = P.safeX; P.y = P.safeY; P.vx = P.vy = 0; P.pound = false; }
  }

}
function nearDoor() {
  for (const d of doors) if (d.open && P.onGround && overlap(P, { x: d.x - 16, y: d.y, w: d.w + 32, h: d.h })) return d;
  return null;
}

// retourne 0 = touché, 1 = bloqué, 2 = parade parfaite
function hurtPlayer(d, srcX, o) {
  o = o || {};
  if (P.inv > 0 || scene !== "play") return 0;
  const front = (srcX - (P.x + P.w / 2)) * P.face >= -6;
  if (P.guard && front && P.roll <= 0 && aw()) {
    const it = aw(), sd = WEAPONS[it.id];
    if (P.guardT <= sd.parry + 0.03 * it.rar) {                        // parade parfaite
      P.inv = 0.45; hitstop = Math.max(hitstop, 0.14); shake = Math.max(shake, 7);
      const px = P.x + P.w / 2 + P.face * 14;
      burst(px, P.y + 14, 18, "#ffd23f", 260, 0.4, 3, 0);
      parts.push({ x: px, y: P.y + 14, ring: 1, life: 0.3, max: 0.3, col: "#ffd23f", vx: 0, vy: 0, grav: 0 });
      addText(P.x + P.w / 2, P.y - 10, "PARADE !", "#ffd23f");
      SFX.parry();
      if (o.e && !o.e.dead) stunEnemy(o.e, 1.4);
      if (o.s) { o.s.from = "p"; o.s.vx = -o.s.vx * 1.2; o.s.dmg *= 2; o.s.life = 1.6; o.s.hitSet = new Set(); o.s.owner = null; o.s.bow = null; o.s.pierce = 0; }
      return 2;
    }
    const blk = Math.min(0.92, sd.block + 0.1 * it.rar);
    d = d * (1 - (o.kind === "heavy" ? blk * 0.6 : blk));
    P.inv = 0.35; P.vx = -P.face * 130;
    burst(P.x + P.w / 2 + P.face * 12, P.y + 14, 8, "#9ffcff", 140, 0.3, 2);
    addText(P.x + P.w / 2, P.y - 10, "BLOQUÉ", "#9ffcff");
    SFX.block(); shake = Math.max(shake, 3);
    d = Math.round(d);
    if (d >= 1) { P.hp -= d; if (P.hp <= 0) { P.hp = 0; die(); } }
    return 1;
  }
  d = Math.round(d);
  const cursedHit = P.curse > 0;
  if (cursedHit) { d = P.hp + 999; deathMsg = "La malédiction t'a emporté…"; }
  P.rally = P.hp - d <= 0 ? 0 : Math.min(P.rally + d * 0.85, U.maxHp - (P.hp - d)); P.rallyT = 1.3;
  P.hp -= d; P.inv = 0.9; P.hurtT = 0.22; kick.x += (P.x + P.w / 2 < srcX ? -1 : 1) * 6;
  P.vx = (P.x + P.w / 2 < srcX ? -1 : 1) * 230; P.vy = -230;
  P.atk = null; P.roll = 0; P.drawing = false; P.draw = 0; P.pound = false; P.guard = false; P.clinging = false;
  shake = Math.max(shake, 9); hitstop = Math.max(hitstop, 0.07); flashRed = 0.25;
  addText(P.x + P.w / 2, P.y - 6, cursedHit ? "☠ MAUDIT" : "-" + d, cursedHit ? "#c58bff" : "#ff4d6d");
  burst(P.x + P.w / 2, P.y + P.h / 2, 10, "#ff4d6d", 200, 0.45);
  SFX.hurt();
  if (P.hp <= 0) { P.hp = 0; die(); }
  return 0;
}

// ================================================================== ennemis
function stunEnemy(e, t) {
  if (e.boss) {
    if (!["idle", "hover", "windC", "windS", "windM", "windR", "recC", "recS", "recM", "rest"].includes(e.state)) return;
    t = Math.min(t, 0.7); e.state = "idle"; e.cd = 0.8;
  } else {
    e.state = isRanged(e) ? "aim" : e.type === "bat" ? "hunt" : "chase"; e.cd = Math.max(e.cd, 0.7);
  }
  e.stun = Math.max(e.stun, t);
  e.struck = true;
}

function damageEnemy(e, d, kx, hs, opt) {
  opt = opt || {};
  if (e.type === "shield" && e.stun <= 0 && !opt.stun && kx !== 0 && Math.sign(kx) === -e.face && e.state !== "strike") {
    d = Math.max(1, Math.round(d * 0.12)); e.hp -= d; e.flash = 0.05;
    hitstop = Math.max(hitstop, 0.03); shake = Math.max(shake, 2);
    addText(e.x + e.w / 2, e.y - 4, "BLOQUÉ", "#9ffcff"); burst(e.x + e.w / 2 + e.face * 12, e.y + 14, 6, "#9ffcff", 140, 0.3, 2);
    SFX.block();
    if (e.hp <= 0 && !e.dead) killEnemy(e);
    return;
  }
  let crit = false;
  if (e.stun > 0 || e.st.freeze > 0) d *= 1.4;
  if (opt.forceCrit || Math.random() < U.crit + (opt.critAdd || 0)) { d *= 2; crit = true; }
  if (e.boss && e.roarT > 0) d *= 0.2;
  d = Math.round(d);
  e.hp -= d; e.flash = 0.12; e.sq = 0.75;
  if (!e.armor) {
    e.vx = e.elite ? kx * 0.35 : kx;
    if (e.type !== "bat") { if (!(e.stun > 0) && !e.elite) { e.state = "stagger"; e.t = 0.2; } } else e.vy = -60;
  }
  if (opt.stun) stunEnemy(e, e.elite ? opt.stun * 0.5 : opt.stun);
  if (e.state === "sleep") { e.state = "idle"; e.cd = 0.8; }
  hitstop = Math.max(hitstop, (hs || 0.04) * (crit ? 1.6 : 1));
  shake = Math.max(shake, crit ? 7 : 3.5);
  kick.x += Math.sign(kx || P.face) * (crit ? 5 : 2.5);
  // rally : frapper vite permet de récupérer les PV perdus au dernier coup reçu
  if (P.rally > 0 && scene === "play") { const g = Math.min(P.rally, Math.max(1, d * 0.4)); P.hp = Math.min(U.maxHp, P.hp + g); P.rally -= g; }
  const ex = e.x + e.w / 2, ey = e.y + e.h / 2, dir = Math.sign(kx) || (ex < P.x + P.w / 2 ? -1 : 1);
  parts.push({ x: ex, y: e.y - 6, vx: rnd(-20, 20) + dir * 30, vy: -120, life: crit ? 0.95 : 0.75, max: crit ? 0.95 : 0.75, col: crit ? "#ffd23f" : "#ffffff", txt: String(d) + (crit ? "!" : ""), big: crit, grav: 240 });
  for (let i = 0; i < (crit ? 8 : 5); i++) parts.push({ x: ex, y: ey, vx: dir * rnd(200, 520), vy: rnd(-260, 260), life: 0.14, max: 0.14, col: i % 2 ? "#ffffff" : (crit ? "#ffd23f" : ECOL[e.type]), streak: 1, size: 2.5, grav: 0 });
  parts.push({ x: ex, y: ey, flash: 1, rr: crit ? 20 : 12, life: 0.08, max: 0.08, col: "rgba(255,255,255,.7)", vx: 0, vy: 0, grav: 0 });
  burst(ex, ey, 6, e.boss ? "#ffb020" : "#ff4d6d", 180, 0.35);
  if (crit) SFX.crit(); else SFX.hit();
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

// coup porté par le joueur avec un objet : applique les affixes et les statuts
function playerHit(e, d, it, kx, hs, opt) {
  opt = opt || {};
  const aff = itemAff(it), wd = it && WEAPONS[it.id];
  if (aff.includes("stunDmg") && (e.stun > 0 || e.st.freeze > 0)) d *= 1.6;
  if (aff.includes("burnDmg") && e.st.burn > 0) d *= 1.5;
  if (aff.includes("crit")) opt.critAdd = 0.2;
  if (P.critRollT > 0 && wd && wd.critRoll) opt.forceCrit = true;
  const before = e.hp;
  damageEnemy(e, d, kx, hs, opt);
  const dealt = Math.max(0, before - Math.max(0, e.hp));
  if (aff.includes("leech") && dealt > 0) P.hp = Math.min(U.maxHp, P.hp + dealt * 0.06);
  if (e.dead) { if (aff.includes("cdr")) for (const s of P.sk) if (s) s.t = Math.max(0, s.t - 1.5); return; }
  if (aff.includes("burn")) burnEnemy(e, d);
  if (aff.includes("poison")) { e.st.pst = Math.min(5, e.st.pst + 1); e.st.poison = 5; e.st.base = Math.max(e.st.base, d * 0.12); }
  if (aff.includes("bleed") || opt.bleed) { e.st.bst = Math.min(5, e.st.bst + 1); e.st.bleed = 3.5; e.st.base = Math.max(e.st.base, d * 0.15); }
  if (aff.includes("freeze") && Math.random() < 0.2) freezeEnemy(e, 1.5);
  P.shockN++;
  if (opt.shock || (aff.includes("shock") && P.shockN % 3 === 0)) chainShock(e, d * 0.6);
}
function burnEnemy(e, d) { e.st.burn = 3.5; e.st.burnD = Math.max(e.st.burnD || 0, Math.max(2, d * 0.25)); }
function freezeEnemy(e, t) {
  if (e.boss) t = Math.min(t, 0.6);
  e.st.freeze = Math.max(e.st.freeze, t); e.vx = 0; e.st.burn = 0;
  if (e.state === "sleep") { e.state = "idle"; e.cd = 0.8; }
}
function chainShock(src, d) {
  let from = src;
  const done = new Set([src]);
  for (let k = 0; k < 3; k++) {
    let best = null, bd = 190;
    for (const e of enemies) {
      if (e.dead || done.has(e) || e.state === "sleep") continue;
      const dd = Math.hypot(e.x - from.x, e.y - from.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (!best) break;
    done.add(best);
    parts.push({ x: from.x + from.w / 2, y: from.y + from.h / 2, x2: best.x + best.w / 2, y2: best.y + best.h / 2, bolt: 1, life: 0.18, max: 0.18, col: "#7af0ff", vx: 0, vy: 0, grav: 0 });
    damageEnemy(best, d, 0, 0.02, { stun: 0.4 });
    from = best;
  }
  if (done.size === 1) parts.push({ x: src.x + src.w / 2, y: src.y + src.h / 2, flash: 1, rr: 30, life: 0.12, max: 0.12, col: "#7af0ff", vx: 0, vy: 0, grav: 0, light: 120 });
  sfx(1800, 600, 0.12, "sawtooth", 0.04);
}
function dotHit(e, d, col) {
  d = Math.max(1, Math.round(d));
  e.hp -= d; e.flash = Math.max(e.flash, 0.04);
  parts.push({ x: e.x + e.w / 2 + rnd(-8, 8), y: e.y, vx: 0, vy: -50, life: 0.55, max: 0.55, col, txt: String(d), small: 1, grav: 0 });
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}
function tickStatus(e, dt) {
  const s = e.st;
  if (s.freeze > 0) s.freeze -= dt;
  if (!(s.burn > 0 || s.poison > 0 || s.bleed > 0)) return;
  s.tick -= dt;
  const tk = s.tick <= 0;
  if (tk) s.tick = 0.5;
  const ex = e.x + e.w / 2;
  if (s.burn > 0) {
    s.burn -= dt;
    if (Math.random() < dt * 22) parts.push({ x: ex + rnd(-e.w / 2, e.w / 2), y: e.y + e.h * rnd(0.2, 0.9), vx: rnd(-20, 20), vy: rnd(-120, -60), life: 0.45, max: 0.45, col: Math.random() < 0.5 ? "#ffb040" : "#ff5a1a", size: 4, grav: -60 });
    if (tk) dotHit(e, s.burnD || 3, "#ff9a3a");
  }
  if (s.poison > 0) {
    s.poison -= dt; if (s.poison <= 0) s.pst = 0;
    if (Math.random() < dt * 6) parts.push({ x: ex + rnd(-8, 8), y: e.y + 4, vx: 0, vy: -40, life: 0.6, max: 0.6, col: "#8dff5a", size: 3, grav: -20 });
    if (tk && !e.dead) dotHit(e, s.base * s.pst, "#8dff5a");
  }
  if (s.bleed > 0) {
    s.bleed -= dt; if (s.bleed <= 0) s.bst = 0;
    if (Math.random() < dt * 8) parts.push({ x: ex + rnd(-6, 6), y: e.y + e.h * 0.4, vx: rnd(-20, 20), vy: 20, life: 0.6, max: 0.6, col: "#d0203a", size: 3, grav: 600 });
    if (tk && !e.dead) dotHit(e, s.base * s.bst * 1.2, "#ff4d6d");
  }
}

function killEnemy(e) {
  e.dead = true; run.kills++;
  const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  const n = Math.round(({ zombie: 1, archer: 1, bat: 1, brute: 3, boss: 30, archi: 22, matri: 22, bomber: 1, shield: 2, mage: 2, leaper: 1, slime: 1, slimeS: 0, charger: 2, grenadier: 1 }[e.type] + (e.elite ? 8 : 0)) * (S.cellMul || 1));
  dropCells(ex, ey, n);
  dropCoins(ex, ey, e.type === "slimeS" ? 0 : (e.elite ? 14 : e.boss ? 30 : Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0));
  if (!e.boss && Math.random() < 0.12) pickups.push({ x: ex, y: ey, w: 10, h: 10, vx: rnd(-60, 60), vy: -200, kind: "orb", t: 0, wall: 0 });
  if (e.elite) {
    dropItem(Math.random() < 0.6 ? randWeapon(2) : randSkill(), ex, ey);
    toast("Élite vaincu !"); hitstop = Math.max(hitstop, 0.2); slowmo = 0.6;
  }
  if (!e.boss && Math.random() < (e.elite ? 0.45 : 0.015)) { const bp = randBlueprint(); if (bp) dropItem(bp, ex, ey); }
  if (P.curse > 0) {
    P.curse--;
    if (P.curse === 0) { toast("Malédiction levée !"); SFX.scroll(); burst(P.x + P.w / 2, P.y + 10, 30, "#ffe9a0", 220, 0.7, 3, -60); }
  }
  // éclats du corps
  for (let i = 0, ng = e.boss ? 26 : 7 + Math.round(e.w / 8); i < ng; i++)
    parts.push({ x: ex + rnd(-e.w / 3, e.w / 3), y: ey + rnd(-e.h / 3, e.h / 3), vx: rnd(-260, 260) + (ex < P.x ? -80 : 80), vy: rnd(-420, -120), life: rnd(1.2, 2), max: 2, col: i % 3 ? ECOL[e.type] : "#2a1020", size: rnd(3, 7), grav: 1300, gib: 1, rot: rnd(0, 6), vr: rnd(-14, 14) });
  parts.push({ x: ex, y: ey, flash: 1, rr: 24, life: 0.12, max: 0.12, col: "rgba(255,255,255,.55)", vx: 0, vy: 0, grav: 0, light: 160 });
  if (U.vamp > 0) P.hp = Math.min(U.maxHp, P.hp + U.vamp);
  if (e.type === "bomber" && !e.boomed) { e.boomed = true; bombBlast(e); }
  if (e.type === "slime") for (const sg of [-1, 1]) { const m = spawn("slimeS", ex - 8 + sg * 6, e.y + e.h - ENEMY.slimeS.h - 2); m.state = "chase"; m.vx = sg * 140; m.vy = -220; }

  // les flèches plantées dans l'ennemi sont rendues
  if (e.stuck.length) {
    const m = new Map();
    for (const b of e.stuck) m.set(b, (m.get(b) || 0) + 1);
    let tot = 0;
    for (const [b, c] of m) { const g = Math.min(bowMax(b) - b.ammo, c); b.ammo += g; tot += g; }
    if (tot > 0) {
      addText(P.x + P.w / 2, P.y - 28, "+" + tot + " flèche" + (tot > 1 ? "s" : ""), "#ffd23f");
      for (let i = 0; i < tot; i++) parts.push({ x: ex, y: ey, vx: (P.x - ex) * 2.2 + rnd(-40, 40), vy: (P.y - ey) * 2.2 - 80, life: 0.45, max: 0.45, col: "#ffd23f", size: 4, grav: 0 });
      SFX.cell();
    }
    e.stuck = [];
  }

  burst(ex, ey, e.boss ? 60 : 16, e.boss ? BOSSINFO[e.type].col : "#ff2e97", e.boss ? 360 : 220, 0.7, 3);
  SFX.boom();
  shake = Math.max(shake, e.boss ? 16 : 5);
  if (e.boss) {
    bossDead = true; for (const d of doors) d.open = true; hitstop = 0.3;
    for (const o of enemies) if (!o.dead && o !== e) { o.dead = true; burst(o.x, o.y, 8, "#b58bff", 160, 0.5); }
    const bi = BOSSINFO[e.type];
    toast(bi.name.charAt(0) + bi.name.slice(1).toLowerCase() + " est vaincu — " + (S.final ? "la porte s'ouvre" : "les passages s'ouvrent")); slowmo = 1.5; music("menu");
    if (!S.final) { dropItem({ kind: "scroll" }, ex - 20, ey); dropItem(randWeapon(2), ex + 20, ey); for (const o of enemies) if (o.type === "slime" || o.type === "slimeS" || o.type === "mage" || o.type === "bat") o.dead = true; }
    for (let i = 0; i < 4; i++) setTimeout(() => { if (scene === "play") { boomFx(ex + rnd(-50, 50), ey + rnd(-40, 30), 50, BOSSINFO[e.type].col); SFX.boom(); shake = Math.max(shake, 10); } }, 120 + i * 180);
  }
}

const isRanged = (e) => e.type === "archer" || e.type === "mage" || e.type === "grenadier";
function meleeBox(e, reach) { return { x: e.face > 0 ? e.x + e.w : e.x - reach, y: e.y - 2, w: reach, h: e.h + 4 }; }

function findSpot(e, fr, px, minD, maxD) {
  const pc = Math.floor(px / T), need = Math.ceil(e.h / T), w = Math.ceil(e.w / T), list = [];
  for (let k = Math.ceil(minD / T); k <= Math.ceil(maxD / T); k++) for (const sg of [-1, 1]) {
    const c = pc + sg * k; let ok = true;
    for (let q = 0; q <= w && ok; q++) {
      const t0 = tileAt(c + q, fr);
      if (!FLOOR(t0)) { ok = false; break; }
      for (let h = 1; h <= need; h++) { const t1 = tileAt(c + q, fr - h); if (SOL(t1) || t1 === 3) { ok = false; break; } }
    }
    if (ok) list.push(c * T);
  }
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
function warpFx(x, y) {
  burst(x, y, 14, "#b58bff", 200, 0.5, 3, 0);
  parts.push({ x, y, ring: 1, life: 0.3, max: 0.3, col: "#b58bff", vx: 0, vy: 0, grav: 0 });
}
function relocate(e, x, fr) {
  warpFx(e.x + e.w / 2, e.y + e.h / 2);
  e.x = x + 4; e.y = fr * T - e.h - 0.01; e.vx = 0; e.vy = 0; e.tpIn = 0.45;
  e.face = (P.x + P.w / 2) > e.x + e.w / 2 ? 1 : -1;
  warpFx(e.x + e.w / 2, e.y + e.h / 2);
  sfx(700, 220, 0.22, "sine", 0.04);
}
function teleportEnemy(e) {
  const ranged = isRanged(e);
  const x = findSpot(e, pGR, P.x + P.w / 2, ranged ? 190 : 110, ranged ? 330 : 240);
  e.lostT = 0;
  if (x === null) { e.tpCd = 1.5; return; }
  relocate(e, x, pGR);
  e.tpCd = 7; e.state = ranged ? "aim" : "chase"; e.cd = Math.max(e.cd, 0.7);
}
function bombBlast(e) {
  const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  explode(ex, ey, 74, 18, 0);
  if (Math.hypot(P.x + P.w / 2 - ex, P.y + P.h / 2 - ey) < 78) hurtPlayer(e.dmg, ex, { kind: "heavy" });
}

function updateEnemy(e, dt) {
  e.flash -= dt; e.cd -= dt; e.t -= dt; e.bob += dt * 4;
  const px = P.x + P.w / 2, py = P.y + P.h / 2, ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  const dx = px - ex, dy = py - ey, ad = Math.abs(dx), ady = Math.abs(dy);
  e.sq += (1 - e.sq) * Math.min(1, dt * 12);
  tickStatus(e, dt);
  if (e.dead) return;

  if (e.stun > 0 || e.st.freeze > 0) {                                // étourdi ou gelé : ne fait rien
    e.stun -= dt;
    e.vx = approach(e.vx, 0, 1200 * dt);
    if (e.fly) e.vy = approach(e.vy, 0, 600 * dt);
    moveBody(e, dt, !e.fly);
    return;
  }

  if (P.onGround) pGR = Math.floor((P.y + P.h + 2) / T);
  e.tpCd = (e.tpCd || 0) - dt; if (e.tpIn > 0) e.tpIn -= dt;
  if (!e.fly && !e.boss && e.type !== "slimeS" && e.state !== "idle" && e.state !== "sleep") {
    const ranged = isRanged(e);
    const gap = Math.abs(pGR * T - (e.y + e.h));
    const stuck = e.state === "chase" && e.wall === e.face;
    if ((gap > (ranged ? 230 : 70) || stuck) && ad < 900) e.lostT = (e.lostT || 0) + dt; else e.lostT = Math.max(0, (e.lostT || 0) - dt * 2);
    if (e.lostT > 1.5 && e.tpCd <= 0 && e.state !== "wind" && e.state !== "strike" && e.state !== "fuse" && e.state !== "charge" && e.state !== "leap") teleportEnemy(e);
  }

  if (e.state === "stagger") {
    e.vx = approach(e.vx, 0, 900 * dt);
    if (e.t <= 0) e.state = isRanged(e) ? "aim" : "chase";
  } else if (e.type === "zombie") {
    if (e.state === "idle") {
      e.vx = e.face * 42;
      if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 240 && ady < 80) e.state = "chase";
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 108 : 0;
      if (ad < 36 && ady < 40 && e.cd <= 0) { e.state = "wind"; e.t = 0.5; e.vx = 0; SFX.alert(); }
      if (ad > 460) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0;
      if (e.t <= 0) { e.state = "strike"; e.t = 0.16; e.struck = false; }
    } else if (e.state === "strike") {
      e.vx = 0;
      if (!e.struck && overlap(meleeBox(e, 36), P)) { e.struck = true; hurtPlayer(e.dmg, ex, { e, kind: "melee" }); }
      if (e.t <= 0) { e.state = "chase"; e.cd = 1.1; }
    }
  } else if (e.type === "archer") {
    if (e.state === "idle") {
      e.vx = e.face * 30;
      if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 420 && ady < 120) e.state = "aim";
    } else if (e.state === "aim") {
      e.face = dx > 0 ? 1 : -1; e.vx = 0;
      if (ad < 150 && floorAhead(e, -e.face) && e.wall !== -e.face) e.vx = -e.face * 85;
      if (e.cd <= 0 && ad < 430) { e.state = "wind"; e.t = 0.55; e.vx = 0; SFX.alert(); }
      if (ad > 520) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) {
        shots.push({ x: ex - 7, y: ey - 6, vx: e.face * 320, vy: 0, w: 14, h: 4, dmg: e.dmg, life: 2.6, from: "e", kind: "arrow", owner: e });
        e.cd = 1.9; e.state = "aim"; SFX.shoot();
      }
    }
  } else if (e.type === "bat") {
    const dist = Math.hypot(dx, dy);
    if (e.state === "idle") {
      e.vx = Math.sin(e.bob * 0.5) * 20; e.vy = Math.sin(e.bob) * 18;
      if (dist < 300) e.state = "hunt";
    } else if (e.state === "hunt") {
      const tx = px + Math.sin(e.bob * 0.7) * 90, ty = py - 80 + Math.cos(e.bob) * 20;
      const ax = tx - ex, ay = ty - ey, m = Math.hypot(ax, ay) || 1;
      e.vx = approach(e.vx, ax / m * 130, 500 * dt);
      e.vy = approach(e.vy, ay / m * 130, 500 * dt);
      e.face = dx > 0 ? 1 : -1;
      if (e.cd <= 0 && dist < 240) {
        e.state = "dive"; e.t = 0.65;
        const m2 = dist || 1; e.vx = dx / m2 * 300; e.vy = dy / m2 * 300; SFX.alert();
      }
      if (dist > 520) e.state = "idle";
    } else if (e.state === "dive") {
      if (e.t <= 0) { e.state = "hunt"; e.cd = 1.5; e.vx *= 0.3; e.vy *= 0.3; }
    }
  } else if (e.type === "brute") {
    if (e.state === "idle") {
      e.vx = e.face * 30;
      if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 280 && ady < 80) e.state = "chase";
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 58 : 0;
      if (ad < 66 && ady < 50 && e.cd <= 0) { e.state = "wind"; e.t = 0.85; e.vx = 0; SFX.alert(); }
      if (ad > 520) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0;
      if (e.t <= 0) { e.state = "strike"; e.t = 0.22; e.struck = false; shake = Math.max(shake, 6); }
    } else if (e.state === "strike") {
      e.vx = 0;
      if (!e.struck && overlap(meleeBox(e, 70), P)) { e.struck = true; hurtPlayer(e.dmg, ex, { e, kind: "heavy" }); }
      if (e.t <= 0) { e.state = "chase"; e.cd = 2; }
    }
  } else if (e.type === "bomber") {
    if (e.state === "idle") {
      e.vx = e.face * 40; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 270 && ady < 90) { e.state = "chase"; SFX.alert(); }
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 150 : 0;
      if (ad < 46 && ady < 50) { e.state = "fuse"; e.t = 0.65; e.vx = 0; SFX.alert(); }
      if (ad > 480) e.state = "idle";
    } else if (e.state === "fuse") {
      e.vx = 0;
      if (e.t <= 0) { e.dead = true; e.boomed = true; bombBlast(e); return; }
    }
  } else if (e.type === "shield") {
    e.turnT = (e.turnT || 0) - dt;
    const side = dx > 0 ? 1 : -1;
    if (e.state === "idle") {
      e.vx = e.face * 30; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 260 && ady < 80) e.state = "chase";
    } else if (e.state === "chase") {
      if (e.turnT <= 0 && side !== e.face) { e.face = side; e.turnT = 0.9; }
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 56 : 0;
      if (ad < 58 && ady < 50 && e.cd <= 0 && side === e.face) { e.state = "wind"; e.t = 0.65; e.vx = 0; SFX.alert(); }
      if (ad > 480) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0;
      if (e.t <= 0) { e.state = "strike"; e.t = 0.16; e.struck = false; }
    } else if (e.state === "strike") {
      e.vx = e.face * 40;
      if (!e.struck && overlap(meleeBox(e, 52), P)) { e.struck = true; hurtPlayer(e.dmg, ex, { e, kind: "melee" }); }
      if (e.t <= 0) { e.state = "chase"; e.cd = 1.5; }
    }
  } else if (e.type === "mage") {
    if (e.state === "idle") {
      e.vx = e.face * 24; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 460 && ady < 220) e.state = "aim";
    } else if (e.state === "aim") {
      e.face = dx > 0 ? 1 : -1; e.vx = 0;
      if (ad < 120 && e.tpCd <= 0) {
        const fr = Math.floor((e.y + e.h + 2) / T), x = findSpot(e, fr, ex, 190, 320);
        if (x !== null) { relocate(e, x, fr); e.tpCd = 3.5; e.cd = Math.max(e.cd, 0.5); }
      }
      if (e.cd <= 0 && ad < 470) { e.state = "wind"; e.t = 0.7; SFX.alert(); }
      if (ad > 560) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) {
        shots.push({ x: ex - 7, y: ey - 7, vx: e.face * 150, vy: 0, w: 14, h: 14, dmg: e.dmg, life: 3.4, from: "e", kind: "orb", home: 1, owner: e });
        e.cd = 2.4; e.state = "aim"; SFX.shoot();
      }
    }
  } else if (e.type === "leaper") {
    if (e.state === "idle") {
      e.vx = e.face * 40; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 320 && ady < 170) e.state = "chase";
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 70 : 0;
      if (e.onGround && e.cd <= 0 && ad < 260 && ad > 50) { e.state = "wind"; e.t = 0.32; e.vx = 0; SFX.alert(); }
      if (ad > 520) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "leap"; e.t = 1.3; e.vx = e.face * clamp(ad * 1.6, 150, 300); e.vy = dy < -50 ? -640 : -470; e.onGround = false; }
    } else if (e.state === "leap") {
      if ((e.onGround && e.t < 1.2) || e.t <= 0) { e.state = "chase"; e.cd = 1.3; e.vx = 0; }
    }
  } else if (e.type === "slime" || e.type === "slimeS") {
    const sp = e.type === "slime" ? 52 : 95;
    if (e.state === "idle") {
      e.vx = e.face * 24; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 240 && ady < 90) e.state = "chase";
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * sp * (0.6 + 0.4 * Math.abs(Math.sin(e.bob))) : 0;
      if (ad > 520) e.state = "idle";
    }
  } else if (e.type === "charger") {
    e.armor = e.state === "charge";
    if (e.state === "idle") {
      e.vx = e.face * 35; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 360 && ady < 90) e.state = "chase";
    } else if (e.state === "chase") {
      e.face = dx > 0 ? 1 : -1;
      e.vx = (floorAhead(e) && e.wall !== e.face) ? e.face * 50 : 0;
      if (e.cd <= 0 && ad > 90 && ad < 380 && ady < 70) { e.state = "wind"; e.t = 0.8; e.vx = 0; SFX.alert(); }
      if (ad > 560) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0;
      if (e.t <= 0) { e.state = "charge"; e.t = 1.1; }
    } else if (e.state === "charge") {
      e.vx = e.face * 360;
      if (e.wall === e.face || !floorAhead(e) || e.t <= 0) {
        if (e.wall === e.face) { shake = Math.max(shake, 10); burst(ex + e.face * 20, ey, 12, "#ffb020", 220, 0.5); SFX.boom(); e.stun = 1.4; } else e.stun = 0.4;
        e.state = "chase"; e.cd = 2.2; e.vx = 0; e.armor = false;
      }
    }
  } else if (e.type === "grenadier") {
    if (e.state === "idle") {
      e.vx = e.face * 30; if (e.wall || !floorAhead(e)) e.face *= -1;
      if (ad < 400 && ady < 220) e.state = "aim";
    } else if (e.state === "aim") {
      e.face = dx > 0 ? 1 : -1; e.vx = 0;
      if (ad < 140 && floorAhead(e, -e.face) && e.wall !== -e.face) e.vx = -e.face * 80;
      if (e.cd <= 0 && ad < 420) { e.state = "wind"; e.t = 0.6; e.vx = 0; SFX.alert(); }
      if (ad > 560) e.state = "idle";
    } else if (e.state === "wind") {
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) {
        const tt = 0.85, g = 1500, tx = px + P.vx * 0.3;
        shots.push({ x: ex - 6, y: e.y, vx: (tx - ex) / tt, vy: (py - e.y - 0.5 * g * tt * tt) / tt, w: 12, h: 12, dmg: e.dmg, life: 3, from: "e", kind: "lob", grav: g, owner: e });
        e.cd = 2.6; e.state = "aim"; SFX.swing();
      }
    }
  } else if (e.type === "archi") {
    archiAI(e, dt, dx, ad, ex);
  } else if (e.type === "matri") {
    matriAI(e, dt, dx, ad, ex);
  } else if (e.type === "boss") {
    bossAI(e, dt, dx, ad, ex);
  }

  moveBody(e, dt, !e.fly);

  const charging = ((e.boss || e.type === "charger") && e.state === "charge") || (e.type === "archi" && e.state === "dive");
  const cdm = (charging || (e.type === "leaper" && e.state === "leap")) ? e.dmg : e.contact;
  if (cdm > 0 && e.state !== "sleep" && overlap(e, P)) hurtPlayer(cdm, ex, { e, kind: charging ? "heavy" : "contact" });
}

// ---------- tronc commun des boss : réveil + changement de phase
function bossCommon(e, dt, ex, onPhase) {
  const hpP = e.hp / e.maxHp, ph = hpP > 0.66 ? 1 : hpP > 0.33 ? 2 : 3, bi = BOSSINFO[e.type];
  e.roarT = (e.roarT || 0) - dt;
  if (e.state === "sleep") {
    e.vx = 0; e.vy = 0;
    if (Math.abs(P.x - ex) < 560) { e.state = "roar"; e.t = 1.6; e.roarT = 1.6; e.cd = 1; bossIntro = 2.6; music("boss"); SFX.roar(); shake = Math.max(shake, 14); }
    return true;
  }
  if (ph > e.phase && !["air", "charge", "dive"].includes(e.state)) {
    e.phase = ph; e.state = "roar"; e.t = 1.3; e.roarT = 1.3; e.vx = 0; e.vy = 0;
    SFX.roar(); shake = Math.max(shake, 16); flashRed = 0.15;
    parts.push({ x: ex, y: e.y + e.h / 2, ring: 1, rr: 260, life: 0.5, max: 0.5, col: ph === 3 ? bi.c3 : bi.col, vx: 0, vy: 0, grav: 0 });
    if (Math.abs(P.x - ex) < 220) { P.vx = Math.sign(P.x - ex || 1) * 420; P.vy = -280; }
    for (const s of shots) if (s.from === "e") s.life = 0;
    if (onPhase) onPhase(ph);
  }
  if (e.state === "roar") {
    e.vx = 0; e.vy = 0;
    if (Math.random() < dt * 30) parts.push({ x: ex + rnd(-30, 30), y: e.y + rnd(0, e.h), vx: rnd(-200, 200), vy: rnd(-200, -40), life: 0.5, max: 0.5, col: e.phase === 3 ? bi.c3 : bi.col, size: 3, grav: 0 });
    if (e.t <= 0) { e.state = e.type === "archi" ? "hover" : "idle"; e.cd = 0.6; }
    return true;
  }
  return false;
}
const ARENA_FLOOR = 34;

// ---------- L'Archiviste : lévite, tire des salves, fait pleuvoir des pages et plonge
function archiAI(e, dt, dx, ad, ex) {
  if (bossCommon(e, dt, ex, (ph) => {
    for (let i = 0; i < ph - 1; i++) { const m = spawn("mage", clamp(P.x + (i ? 260 : -260), 3 * T, (COLS - 4) * T), ARENA_FLOOR * T - ENEMY.mage.h); m.state = "aim"; warpFx(m.x + 10, m.y + 16); }
  })) return;
  const ph = e.phase, fast = ph === 1 ? 1 : ph === 2 ? 0.82 : 0.68, ey = e.y + e.h / 2;
  e.side = e.side || 1;
  switch (e.state) {
    case "hover": {
      const tx = P.x + P.w / 2 + e.side * (190 + Math.sin(time * 0.7) * 40), ty = ARENA_FLOOR * T - 190 + Math.sin(time * 2.2) * 18;
      e.vx = approach(e.vx, clamp((tx - ex) * 2.2, -260, 260), 900 * dt);
      e.vy = approach(e.vy, clamp((ty - ey) * 2.2, -220, 220), 900 * dt);
      e.face = dx > 0 ? 1 : -1;
      if (e.cd <= 0) {
        const r = Math.random();
        if (r < 0.3) { e.state = "windV"; e.t = 0.6 * fast; }
        else if (r < 0.5) { e.state = "windP"; e.t = 0.7 * fast; }
        else if (ph >= 2 && r < 0.72) { e.state = "windB"; e.t = 0.5; }
        else { e.state = "windD"; e.t = 0.55 * fast; }
        SFX.alert();
      }
      break;
    }
    case "windV":                                                       // salve d'orbes en éventail
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.t <= 0) {
        const n = ph === 3 ? 7 : 5, base = Math.atan2(P.y + P.h / 2 - ey, P.x + P.w / 2 - ex);
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.2; shots.push({ x: ex - 7, y: ey - 7, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, w: 14, h: 14, dmg: e.dmg * 0.8, life: 3.4, from: "e", kind: "orb", owner: e }); }
        SFX.shoot(); sfx(900, 300, 0.25, "sine", 0.06);
        e.state = "recA"; e.t = 0.5;
      }
      break;
    case "windP":                                                       // pluie de pages tranchantes
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.t <= 0) {
        const n = ph === 3 ? 10 : 7;
        for (let i = 0; i < n; i++) {
          const x = clamp(P.x + P.w / 2 + (i - (n - 1) / 2) * 68 + rnd(-16, 16), 2 * T, (COLS - 2) * T);
          shots.push({ x: x - 9, y: 21 * T, vx: 0, vy: 0, w: 18, h: 22, dmg: e.dmg * 0.8, life: 3, delay: 0.7 + i * 0.06, from: "e", kind: "rock", style: "page", grav: 1800, owner: null });
        }
        SFX.scroll(); e.state = "recA"; e.t = 0.8;
      }
      break;
    case "windB":                                                       // colonnes de lumière
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.t <= 0) {
        const n = ph === 3 ? 4 : 3, top = 13 * T;
        for (let i = 0; i < n; i++) {
          const x = clamp(P.x + P.w / 2 + (i - (n - 1) / 2) * 170, 2 * T, (COLS - 2) * T);
          shots.push({ x: x - 16, y: top, vx: 0, vy: 0, w: 32, h: ARENA_FLOOR * T - top, dmg: e.dmg * 1.1, life: 0.3, delay: 0.95, from: "e", kind: "beam", vert: 1, owner: e });
        }
        sfx(400, 1200, 0.9, "sine", 0.05); e.state = "recA"; e.t = 1.2;
      }
      break;
    case "windD":                                                       // plongeon
      e.vx *= 0.85; e.vy = approach(e.vy, -60, 600 * dt);
      if (e.t <= 0) {
        const tx = P.x + P.w / 2 - ex, ty = P.y + P.h - (e.y + e.h), m = Math.hypot(tx, ty) || 1;
        e.state = "dive"; e.t = 1.2; e.vx = tx / m * 640; e.vy = Math.max(200, ty / m * 640); SFX.swing();
      }
      break;
    case "dive":
      if (Math.random() < 0.7) parts.push({ x: ex, y: ey, vx: -e.vx * 0.1, vy: -e.vy * 0.1, life: 0.3, max: 0.3, col: BOSSINFO.archi.col, size: 4, grav: 0 });
      if (e.onGround || e.y + e.h >= ARENA_FLOOR * T - 2 || e.t <= 0 || e.wall) {
        e.vx = 0; e.vy = 0; e.state = "rest"; e.t = 1.6 * (ph === 3 ? 0.75 : 1);
        for (const dir of [-1, 1]) shots.push({ x: ex + dir * 24 - 13, y: ARENA_FLOOR * T - 16, vx: dir * (300 + 40 * ph), vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 2.2, from: "e", kind: "wave", owner: e, col: BOSSINFO.archi.col });
        shake = Math.max(shake, 14); SFX.boom(); SFX.smash(); dust(ex, e.y + e.h, 16);
        parts.push({ x: ex, y: e.y + e.h, ring: 1, rr: 150, flat: 1, life: 0.35, max: 0.35, col: BOSSINFO.archi.col, vx: 0, vy: 0, grav: 0 });
      }
      break;
    case "rest":                                                        // à terre : vulnérable
      e.vx = 0; e.vy = Math.min(e.vy + GRAV * dt, 600);
      if (e.t <= 0) { e.state = "hover"; e.cd = 0.8 * fast; e.vy = -260; }
      break;
    case "recA":
      e.vx *= 0.92; e.vy *= 0.92;
      if (e.t <= 0) {
        e.state = "hover"; e.cd = 1.1 * fast;
        if (Math.random() < 0.35 + 0.15 * ph) {                         // téléportation de l'autre côté
          warpFx(ex, ey); e.side = -e.side;
          e.x = clamp(P.x + e.side * 240, 3 * T, (COLS - 4) * T - e.w); e.y = ARENA_FLOOR * T - 230;
          warpFx(e.x + e.w / 2, e.y + e.h / 2); sfx(700, 220, 0.22, "sine", 0.05);
        }
      }
      break;
  }
}

// ---------- La Matriarche : gelée géante qui bondit, crache de l'acide et se divise
function matriAI(e, dt, dx, ad, ex) {
  if (bossCommon(e, dt, ex, (ph) => {
    for (let i = 0; i < ph; i++) { const m = spawn("slime", ex - 14 + (i - 1) * 30, e.y + e.h - ENEMY.slime.h - 4); m.state = "chase"; m.vx = (i - 1) * 200; m.vy = -300; }
  })) return;
  const ph = e.phase, fast = ph === 1 ? 1 : ph === 2 ? 0.82 : 0.66;
  switch (e.state) {
    case "idle":
      e.face = dx > 0 ? 1 : -1;
      e.vx = approach(e.vx, ad > 140 ? e.face * (50 + 20 * ph) : 0, 400 * dt);
      if (e.cd <= 0) {
        const r = Math.random();
        if (r < 0.42) { e.state = "windJ"; e.t = 0.5 * fast; }
        else if (r < 0.72) { e.state = "windS"; e.t = 0.6 * fast; }
        else { e.state = "windC"; e.t = 0.75 * fast; }
        SFX.alert();
      }
      break;
    case "windJ":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "air"; e.vy = -760; e.vx = clamp(dx * 1.2, -360, 360); e.t = 0.25; sfx(200, 500, 0.2, "sine", 0.08); }
      break;
    case "air":
      if (e.onGround && e.t <= 0) {
        const sp = 300 + 40 * ph;
        for (const dir of [-1, 1]) shots.push({ x: ex + dir * 40 - 13, y: e.y + e.h - 16, vx: dir * sp, vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 2.4, from: "e", kind: "wave", owner: e, col: BOSSINFO.matri.col });
        for (let i = 0; i < 4 + ph * 2; i++) parts.push({ x: ex + rnd(-40, 40), y: e.y + e.h - 10, vx: rnd(-260, 260), vy: rnd(-420, -150), life: 1, max: 1, col: "#5aff7a", size: rnd(4, 8), grav: 1300, gib: 1, rot: 0, vr: 0 });
        shake = Math.max(shake, 15); SFX.boom(); SFX.smash(); e.sq = 0.55;
        parts.push({ x: ex, y: e.y + e.h, ring: 1, rr: 170, flat: 1, life: 0.35, max: 0.35, col: "#5aff7a", vx: 0, vy: 0, grav: 0 });
        e.state = "recJ"; e.t = 0.7 * fast; e.vx = 0;
        if (ph >= 2 && Math.random() < 0.5) { e.state = "windJ"; e.t = 0.35; }   // double bond
      }
      break;
    case "windS":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) {
        const n = ph === 3 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const tt = 0.9 + i * 0.08, g = 1500, tx = P.x + P.w / 2 + (i - (n - 1) / 2) * 90;
          shots.push({ x: ex - 6, y: e.y + 6, vx: (tx - ex) / tt, vy: (P.y + P.h - 10 - e.y - 0.5 * g * tt * tt) / tt, w: 14, h: 14, dmg: e.dmg * 0.7, life: 3, from: "e", kind: "lob", acid: 1, grav: g, owner: e });
        }
        sfx(300, 120, 0.3, "sawtooth", 0.06); e.sq = 1.3;
        e.state = "recJ"; e.t = 0.8;
      }
      break;
    case "windC":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "charge"; e.t = 1.4; e.vx = e.face * (430 + 50 * ph); SFX.boom(); }
      break;
    case "charge":
      if (Math.random() < dt * 40) dust(ex - e.face * 40, e.y + e.h, 1);
      if (e.wall || e.t <= 0) {
        if (e.wall) { shake = Math.max(shake, 14); SFX.smash(); e.sq = 0.6; e.state = "rest"; e.t = 1.4; }
        else { e.state = "recJ"; e.t = 0.6; }
        e.vx = 0;
      }
      break;
    case "rest":                                                        // sonnée contre le mur : vulnérable
      e.vx = 0;
      if (e.t <= 0) { e.state = "idle"; e.cd = 0.6 * fast; }
      break;
    case "recJ":
      e.vx = approach(e.vx, 0, 1200 * dt);
      if (e.t <= 0) { e.state = "idle"; e.cd = 0.9 * fast; }
      break;
  }
}

function bossAI(e, dt, dx, ad, ex) {
  const hpP = e.hp / e.maxHp, ph = hpP > 0.66 ? 1 : hpP > 0.33 ? 2 : 3;
  const fast = ph === 1 ? 1 : ph === 2 ? 0.82 : 0.66;
  e.roarT = (e.roarT || 0) - dt;
  if (ph > e.phase && e.state !== "sleep" && e.state !== "air" && e.state !== "charge") {   // changement de phase : rugissement
    e.phase = ph; e.state = "roar"; e.t = 1.3; e.roarT = 1.3; e.vx = 0;
    SFX.roar(); shake = Math.max(shake, 16); flashRed = 0.15;
    toast(ph === 2 ? "Le Concierge fait pleuvoir ses clés !" : "Le Concierge devient fou furieux !");
    parts.push({ x: ex, y: e.y + 30, ring: 1, rr: 260, life: 0.5, max: 0.5, col: ph === 3 ? "#ff2e97" : "#ffb020", vx: 0, vy: 0, grav: 0 });
    if (Math.abs(P.x - ex) < 220) { P.vx = Math.sign(P.x - ex || 1) * 420; P.vy = -280; }
    for (const s of shots) if (s.from === "e") s.life = 0;
  }
  switch (e.state) {
    case "sleep":
      e.vx = 0;
      if (ad < 560) {
        e.state = "roar"; e.t = 1.6; e.roarT = 1.6; e.cd = 1;
        bossIntro = 2.6; music("boss"); SFX.roar(); shake = Math.max(shake, 14);
      }
      break;
    case "roar":
      e.vx = 0;
      if (Math.random() < dt * 30) parts.push({ x: ex + rnd(-30, 30), y: e.y + rnd(0, e.h), vx: rnd(-200, 200), vy: rnd(-200, -40), life: 0.5, max: 0.5, col: ph === 3 ? "#ff2e97" : "#ffb020", size: 3, grav: 0 });
      if (e.t <= 0) { e.state = "idle"; e.cd = 0.5; }
      break;
    case "idle": {
      e.face = dx > 0 ? 1 : -1;
      e.vx = approach(e.vx, ad > 150 ? e.face * (ph === 3 ? 110 : 75) : 0, 500 * dt);
      if (e.cd <= 0) {
        const bats = enemies.filter((o) => !o.dead && o.type === "bat").length;
        const r = Math.random();
        if (ph >= 3 && r < 0.22) { e.state = "windW"; e.t = 0.9; e.sweepY = P.y + P.h - 22; }
        else if (ph >= 2 && r < 0.45) { e.state = "windR"; e.t = 0.7 * fast; }
        else if (ad > 280 || r < 0.65) { e.state = "windC"; e.t = 0.7 * fast; }
        else if (r < 0.88 || bats >= 3) { e.state = "windS"; e.t = 0.65 * fast; }
        else { e.state = "windM"; e.t = 0.8; }
        SFX.alert();
      }
      break;
    }
    case "windC":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "charge"; e.t = 0.75; e.vx = e.face * (490 + 70 * (ph - 1)); SFX.boom(); }
      break;
    case "charge":
      if (Math.random() < dt * 40) dust(ex - e.face * 20, e.y + e.h, 1);
      if (e.wall || e.t <= 0) {
        if (e.wall) { shake = Math.max(shake, 12); burst(e.x + e.w / 2, e.y + e.h / 2, 16, "#ffb020", 240, 0.5); SFX.smash(); }
        if (ph === 3 && Math.random() < 0.6) { e.state = "windS"; e.t = 0.25; e.vx = 0; }            // enchaînement
        else { e.state = "recC"; e.t = 0.7 * fast; e.vx = 0; }
      }
      break;
    case "recC":
      e.vx = approach(e.vx, 0, 1600 * dt);
      if (e.t <= 0) { e.state = "idle"; e.cd = 0.9 * fast; }
      break;
    case "windS":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "air"; e.vy = -780; e.vx = clamp(dx * 1.1, -320, 320); e.t = 0.25; }
      break;
    case "air":
      if (e.onGround && e.t <= 0) {
        const sp = 310 + 50 * (ph - 1);
        for (const dir of [-1, 1]) shots.push({ x: ex + dir * 30 - 13, y: e.y + e.h - 16, vx: dir * sp, vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 2.4, from: "e", kind: "wave", owner: e });
        if (ph === 3) for (const dir of [-1, 1]) shots.push({ x: ex + dir * 30 - 13, y: e.y + e.h - 16, vx: dir * sp * 0.55, vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 3, from: "e", kind: "wave", owner: e });
        shake = Math.max(shake, 15); SFX.boom(); SFX.smash();
        burst(ex, e.y + e.h, 22, "#ffb020", 260, 0.6); dust(ex, e.y + e.h, 16);
        parts.push({ x: ex, y: e.y + e.h, ring: 1, rr: 160, flat: 1, life: 0.35, max: 0.35, col: "#ffb020", vx: 0, vy: 0, grav: 0 });
        e.state = "recS"; e.t = 0.8 * fast; e.vx = 0;
      }
      break;
    case "recS":
      e.vx = 0;
      if (e.t <= 0) { e.state = "idle"; e.cd = 0.9 * fast; }
      break;
    case "windM":
      e.vx = 0;
      if (e.t <= 0) {
        for (let i = 0; i < 2 + (ph === 3 ? 1 : 0); i++) { const b = spawn("bat", ex + (i - 1) * 60, e.y - 20); b.state = "hunt"; }
        burst(ex, e.y, 16, "#b58bff", 200, 0.5);
        e.state = "recM"; e.t = 0.6;
      }
      break;
    case "recM":
      e.vx = 0;
      if (e.t <= 0) { e.state = "idle"; e.cd = 1.0 * fast; }
      break;
    case "windR":                                          // pluie de clés : zones marquées au sol
      e.vx = 0;
      if (e.t <= 0) {
        const n = ph === 3 ? 9 : 6, base = P.x + P.w / 2;
        for (let i = 0; i < n; i++) {
          const x = clamp(base + (i - (n - 1) / 2) * 74 + rnd(-18, 18), 2 * T, (COLS - 2) * T);
          shots.push({ x: x - 9, y: 21 * T, vx: 0, vy: 0, w: 18, h: 26, dmg: e.dmg * 0.9, life: 3, delay: 0.75 + i * 0.07, from: "e", kind: "rock", grav: 2200, owner: null });
        }
        shake = Math.max(shake, 8); SFX.roar();
        e.state = "recM"; e.t = 0.9;
      }
      break;
    case "windW":                                          // balayage : une ligne laser à hauteur du joueur
      e.vx = 0;
      if (e.t <= 0) {
        shots.push({ x: T, y: e.sweepY, vx: 0, vy: 0, w: (COLS - 2) * T, h: 18, dmg: e.dmg * 1.1, life: 0.22, from: "e", kind: "beam", owner: e, nohit: 0 });
        shake = Math.max(shake, 12); sfx(1200, 80, 0.35, "sawtooth", 0.08);
        e.state = "recC"; e.t = 0.8;
      }
      break;
  }
}

// ================================================================== projectiles, objets, compétences
function lobBlast(s) {
  const x = s.x + s.w / 2, y = s.y + s.h / 2;
  if (s.acid) {                                                         // flaque d'acide
    burst(x, y, 16, "#5aff7a", 200, 0.5, 4); sfx(260, 90, 0.2, "sawtooth", 0.05);
    if (Math.hypot(P.x + P.w / 2 - x, P.y + P.h / 2 - y) < 40) hurtPlayer(s.dmg, x, { kind: "proj" });
    const fy = floorBelow(x, y - 8);
    pools.push({ x: x - 34, y: fy, w: 68, t: 4.5, tick: 0, dmg: s.dmg * 0.4 });
    return;
  }
  boomFx(x, y, 60, "#ff8a3a"); shake = Math.max(shake, 7); SFX.boom();
  if (Math.hypot(P.x + P.w / 2 - x, P.y + P.h / 2 - y) < 64) hurtPlayer(s.dmg, x, { kind: "heavy" });
  for (const p of props) if (p.kind === "vase" && !p.broken && Math.hypot(p.x - x, p.y - y) < 60) breakVase(p);
}
function updateShots(dt) {
  for (const s of shots) {
    if (s.delay > 0) { s.delay -= dt; continue; }                       // projectile annoncé (marqueur au sol)
    s.life -= dt;
    if (s.kind === "beam") {
      if (s.life > 0 && !s.done && overlap(s, P) && P.inv <= 0 && P.roll <= 0) { s.done = 1; hurtPlayer(s.dmg, P.x + P.w / 2 - P.face * 10, { kind: "heavy" }); }
      continue;
    }
    if (s.home && s.from === "e") {
      const sp = Math.hypot(s.vx, s.vy) || 1, a = Math.atan2(s.vy, s.vx), ta = Math.atan2(P.y + P.h / 2 - (s.y + s.h / 2), P.x + P.w / 2 - (s.x + s.w / 2));
      let da = ta - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const na = a + clamp(da, -1.5 * dt, 1.5 * dt); s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
    }
    if (s.grav) s.vy += s.grav * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.trail && Math.random() < 0.6) parts.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, vx: 0, vy: 0, life: 0.18, max: 0.18, col: s.kind === "bolt2" ? "#b0ffd0" : "#e8d9a0", size: 2, grav: 0 });
    if (s.life <= 0) { if (s.kind === "lob") lobBlast(s); continue; }
    const tc = Math.floor((s.x + s.w / 2) / T), tr = Math.floor((s.y + s.h / 2) / T);
    if (SOL(tileAt(tc, tr)) || (s.kind === "rock" && FLOOR(tileAt(tc, Math.floor((s.y + s.h) / T))) && s.vy > 0 && tileAt(tc, Math.floor((s.y + s.h) / T)) !== 2)) {
      s.life = 0;
      if (s.kind === "lob") lobBlast(s);
      else if (s.kind === "rock") { burst(s.x + 9, s.y + s.h, 12, "#ffb020", 220, 0.5, 3); dust(s.x + 9, s.y + s.h, 4); shake = Math.max(shake, 4); SFX.smash(); }
      else burst(s.x, s.y, 4, s.from === "p" ? "#9ffcff" : "#ffb020", 100, 0.25);
      continue;
    }
    if (s.from === "p") {
      for (const p of props) if (p.kind === "vase" && !p.broken && overlap(s, p)) { breakVase(p); if (!s.pierce) s.life = 0; }
      for (const e of enemies) {
        if (e.dead || e.state === "sleep" || (s.hitSet && s.hitSet.has(e)) || !overlap(s, e)) continue;
        if (s.hitSet) s.hitSet.add(e);
        const kx = s.vx > 0 ? 120 : -120;
        if (s.it) playerHit(e, s.dmg, s.it, kx, 0.03, {});
        else if (s.bleed) playerHit(e, s.dmg, null, kx, 0.03, { bleed: 1 });
        else damageEnemy(e, s.dmg, kx, 0.03);
        if (s.bow && !e.dead) e.stuck.push(s.bow);
        else if (s.bow && e.dead) s.bow.ammo = Math.min(bowMax(s.bow), s.bow.ammo + 1);
        if (s.pierce > 0) s.pierce--; else s.life = 0;
        break;
      }
    } else if (overlap(s, P) && P.inv <= 0) {
      if (s.kind === "lob") { s.life = 0; lobBlast(s); continue; }
      const res = hurtPlayer(s.dmg, s.x, { kind: s.kind === "wave" || s.kind === "rock" ? "heavy" : "proj", s, e: s.owner });
      if (res !== 2) s.life = 0;
    }
  }
  shots = shots.filter((s) => s.life > 0);
}

function updatePickups(dt) {
  const px = P.x + P.w / 2, py = P.y + P.h / 2;
  for (const p of pickups) {
    p.t += dt;
    const d = Math.hypot(px - p.x - 4, py - p.y - 4);
    if (p.t > 0.35 && d < 120) {
      const m = d || 1;
      p.x += (px - p.x - 4) / m * 460 * dt; p.y += (py - p.y - 4) / m * 460 * dt;
    } else {
      moveBody(p, dt, true);
      if (p.onGround) p.vx *= 0.9;
    }
    if (p.t > 0.2 && overlap(p, P)) {
      p.got = true;
      if (p.kind === "cell") { run.cells++; SFX.cell(); }
      else if (p.kind === "gold") { run.gold += p.v; SFX.gold(); }
      else { P.hp = Math.min(U.maxHp, P.hp + U.maxHp * 0.15); addText(px, P.y - 6, "+PV", "#3dff9a"); SFX.heal(); }
    }
  }
  pickups = pickups.filter((p) => !p.got);
}

function updateProps(dt) {
  for (const p of props) {
    if (p.kind === "item" && p.drop) {
      p.t -= dt; moveBody(p, dt, true);
      if (p.onGround) { p.vx *= 0.85; if (p.t <= 0) p.drop = false; }
    } else if (p.kind === "totem") {
      p.cd -= dt; p.flash -= dt;
      if (p.cd <= 0 && Math.abs(P.x - p.x) < 440 && P.x < p.x && Math.abs(P.y + P.h / 2 - (p.y + 14)) < 90) {
        shots.push({ x: p.x - 14, y: p.y + 12, vx: -340, vy: 0, w: 14, h: 4, dmg: 8, life: 2, from: "e", kind: "arrow" });
        p.cd = 2.4; p.flash = 0.15; SFX.shoot();
      }
    }
  }
}

function updateFx(dt) {
  for (const b of bombs) {
    b.t -= dt; moveBody(b, dt, true);
    if (b.onGround) b.vx *= 0.6;
    let boom = b.t <= 0;
    if (!boom && b.t < 1.1) for (const e of enemies) if (!e.dead && e.state !== "sleep" && overlap(b, e)) { boom = true; break; }
    if (boom) {
      b.dead = true; explode(b.x + 5, b.y + 5, 85, 45 * (b.m || 1), 0.5);
      if (b.fire) fires.push({ x: b.x + 5 - 90, y: b.y + 5, w: 180, t: 4, tick: 0, dmg: 6 * (b.m || 1) });
    }
  }
  bombs = bombs.filter((b) => !b.dead);

  for (const f of fires) {
    f.t -= dt; f.tick -= dt;
    if (Math.random() < dt * 40) parts.push({ x: f.x + Math.random() * f.w, y: f.y + rnd(-4, 10), vx: rnd(-20, 20), vy: rnd(-160, -60), life: 0.5, max: 0.5, col: Math.random() < 0.5 ? "#ffb040" : "#ff5a1a", size: rnd(3, 6), grav: -80 });
    if (f.tick <= 0) {
      f.tick = 0.5;
      for (const e of enemies) if (!e.dead && e.state !== "sleep" && e.x + e.w > f.x && e.x < f.x + f.w && Math.abs(e.y + e.h - f.y) < 50) { burnEnemy(e, f.dmg * 2); dotHit(e, f.dmg, "#ff9a3a"); }
    }
  }
  fires = fires.filter((f) => f.t > 0);
  for (const f of pools) {
    f.t -= dt; f.tick -= dt;
    if (Math.random() < dt * 10) parts.push({ x: f.x + Math.random() * f.w, y: f.y - 2, vx: 0, vy: rnd(-40, -15), life: 0.6, max: 0.6, col: "#8dff8a", size: 3, grav: 0 });
    if (f.tick <= 0 && P.x + P.w > f.x && P.x < f.x + f.w && Math.abs(P.y + P.h - f.y) < 10 && P.roll <= 0) { f.tick = 0.5; const inv = P.inv; P.inv = 0; hurtPlayer(f.dmg, P.x + P.w / 2 + P.face * 8, { kind: "contact" }); P.inv = Math.max(P.inv * 0.3, inv); }
  }
  pools = pools.filter((f) => f.t > 0);

  for (const t of traps) {
    t.arm -= dt; t.t -= dt;
    if (t.arm <= 0) {
      for (const e of enemies) {
        if (e.dead || e.fly || e.state === "sleep" || !overlap(t, { x: e.x, y: e.y + e.h - 10, w: e.w, h: 14 })) continue;
        t.t = 0; burst(t.x + 10, t.y, 14, "#ffd23f", 220, 0.4);
        damageEnemy(e, 30 * U.ranged * statMul("tact"), 0, 0.07, { stun: 1.5 });
        break;
      }
    }
  }
  traps = traps.filter((t) => t.t > 0);

  for (const t of turrets) {
    t.t -= dt; t.cd -= dt;
    let best = null, bd = 380;
    for (const e of enemies) {
      if (e.dead || e.state === "sleep") continue;
      const d = Math.hypot(e.x + e.w / 2 - t.x - 10, e.y + e.h / 2 - t.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const dx = best.x + best.w / 2 - t.x - 10, dy = best.y + best.h / 2 - t.y, m = Math.hypot(dx, dy) || 1;
      t.ang = Math.atan2(dy, dx);
      if (t.cd <= 0) {
        shots.push({ x: t.x + 8, y: t.y + 4, vx: dx / m * 560, vy: dy / m * 560, w: 8, h: 4, dmg: 8 * U.ranged * statMul("tact"), life: 0.8, from: "p", kind: "bolt", hitSet: new Set(), pierce: 0 });
        t.cd = 0.5; sfx(900, 500, 0.05, "square", 0.025);
      }
    }
  }
  turrets = turrets.filter((t) => t.t > 0);
}

function updateParts(dt) {
  for (const p of parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    if (p.gib) {
      p.rot += p.vr * dt;
      if (p.vy > 0 && solidPx(p.x, p.y + p.size / 2)) { p.y = Math.floor((p.y + p.size / 2) / T) * T - p.size / 2; p.vy *= -0.32; p.vx *= 0.55; p.vr *= 0.5; if (Math.abs(p.vy) < 40) p.vy = 0; }
      if (solidPx(p.x + Math.sign(p.vx) * p.size / 2, p.y)) p.vx *= -0.4;
    } else if (p.smoke) { p.vx *= 1 - 2 * dt; p.size += 14 * dt; }
    else if (p.dust) { p.vx *= 1 - 4 * dt; p.size += 10 * dt; }
  }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 700) parts.splice(0, parts.length - 700);
  for (const g of ghosts) g.life -= dt;
  ghosts = ghosts.filter((g) => g.life > 0);
}
function dust(x, y, n) {
  for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-8, 8), y: y - 3, vx: rnd(-90, 90), vy: rnd(-50, -5), life: rnd(0.35, 0.6), max: 0.6, col: "rgba(190,200,230,.35)", dust: 1, size: rnd(4, 8), grav: 0 });
}

// ================================================================== flux de jeu
function enterDoor(d) {
  if (scene !== "play") return;
  scene = "trans"; transT = 0.45; transDoor = d;
  sfx(300, 900, 0.4, "sine", 0.06);
  burst(d.x + d.w / 2, d.y + d.h / 2, 30, BIOMES[d.next].accent, 220, 0.6, 3, 0);
}
function doEnter(d) {
  scene = "play";
  refillAmmo();
  SFX.heal();
  if (S.final) { win(); return; }
  pendingNext = d.next;
  scene = "choice";
  const pool = MUTS.slice(), picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  showChoice(picks);
}

function bank() {
  if (banked) return;
  banked = true;
  save.cells += run.cells;
  save.best.stage = Math.max(save.best.stage, depth + 1);
  save.best.loop = Math.max(save.best.loop, loop);
  save.best.kills = Math.max(save.best.kills, run.kills);
  persist();
}
function openScroll() {
  scene = "scroll"; SFX.scroll();
  const cards = Object.keys(STATS).map((k) => {
    const st = STATS[k], nxt = U.st[k] + 1;
    const extra = k === "surv" ? "+15 % aux armes vertes · +25 PV max" : "+15 % aux armes et compétences " + (k === "brut" ? "rouges" : "violettes") + " · +10 PV max";
    return `<button class="mut" style="--c:${st.c}" data-act="scroll" data-arg="${k}"><b>${st.ico} ${st.n} ${nxt}</b><span>${extra}</span></button>`;
  }).join("");
  setOv(`<div class="card"><p class="tag">// parchemin de puissance</p><h2>Renforce une couleur</h2><div class="muts">${cards}</div>
    <p class="small">Les dégâts d'une arme dépendent du niveau de sa couleur. Spécialise-toi… ou reste polyvalent.</p></div>`);
}
function die() {
  scene = "dead"; bank(); SFX.boom(); slowmo = 1.2; music("menu");
  setTimeout(() => { if (scene === "dead") showEnd(false); }, 1100);
}
function win() {
  scene = "win";
  save.best.stage = Math.max(save.best.stage, LAST + 1);
  bank(); showEnd(true);
}
function pauseGame() {
  if (scene !== "play") return;
  scene = "pause";
  setOv(`<div class="card"><h2>Pause</h2><div class="btns"><button class="btn primary" data-act="resume">Reprendre</button><button class="btn" data-act="menu">Abandonner</button></div></div>`);
}
function togglePause() { if (scene === "play") pauseGame(); else if (scene === "pause") resumeGame(); }
function resumeGame() { if (scene === "pause") { scene = "play"; hideOv(); } }
function enterKey() {
  if (scene === "menu") act("play");
  else if (scene === "dead") act("play");
  else if (scene === "pause") resumeGame();
}

function updateSecrets() {
  const pc = Math.floor((P.x + P.w / 2) / T), pr = Math.floor((P.y + P.h / 2) / T);
  for (const sc of secrets) {
    if (sc.open) continue;
    const inside = pc >= sc.c0 && pc <= sc.c1 && pr >= sc.r0 && pr <= sc.r1;
    if (inside || sc.gates.some(([c, r]) => grid[r][c] === 0)) {
      sc.open = true;
      for (let r = sc.r0; r <= sc.r1; r++) for (let c = sc.c0; c <= sc.c1; c++) hidMap[r * COLS + c] = 0;
      dirtyRegion(sc.c0 - 1, sc.r0 - 1, sc.c1 + 1, sc.r1 + 1);
      if (!inside) { toast("Passage secret !"); SFX.cell(); }
      mmDirty = true;
    }
  }
}
function updateSeen() {
  const pc = Math.floor((P.x + P.w / 2) / T), pr = Math.floor((P.y + P.h / 2) / T);
  if (pc === lastSC && pr === lastSR) return;
  lastSC = pc; lastSR = pr;
  const stamp = ++seenN, q = [pc, pr, 0];
  seenStamp[pr * COLS + pc] = stamp;
  for (let i = 0; i < q.length; i += 3) {
    const c = q[i], r = q[i + 1], d = q[i + 2], idx = r * COLS + c;
    if (!seen[idx]) { seen[idx] = 1; mmDirty = true; }
    if (d >= 26) continue;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0) - (k === 1), nr = r + (k === 2) - (k === 3);
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const ni = nr * COLS + nc;
      if (seenStamp[ni] === stamp || Math.abs(nc - pc) > 15 || Math.abs(nr - pr) > 10) continue;
      seenStamp[ni] = stamp;
      if (SOL(grid[nr][nc]) || hidMap[ni]) { if (!seen[ni] && !hidMap[ni]) { seen[ni] = 2; mmDirty = true; } continue; }
      q.push(nc, nr, d + 1);
    }
  }
}

function step(dt) {
  time += dt;
  if (toastT > 0) toastT -= dt;
  if (card.t > 0) card.t -= dt;
  if (bossIntro > 0) bossIntro -= dt;
  flashRed = Math.max(0, flashRed - dt);
  shake *= Math.pow(0.0005, dt);
  if (shake < 0.2) shake = 0;
  kick.x *= Math.pow(0.0001, dt); kick.y *= Math.pow(0.0001, dt);
  if (fade > 0 && scene !== "trans") fade = Math.max(0, fade - dt * 2.2);

  if (scene === "menu") {
    cam.x = (Math.sin(time * 0.06) * 0.5 + 0.5) * Math.max(0, COLS * T - VW);
    updateParts(dt);
    return;
  }
  if (scene === "trans") {
    transT -= dt; fade = clamp(1 - transT / 0.45, 0, 1);
    updateParts(dt);
    if (transT <= 0) doEnter(transDoor);
    return;
  }
  if (scene === "pause" || scene === "choice" || scene === "win" || scene === "scroll") return;
  if (slowmo > 0) { slowmo -= dt; dt *= 0.35; }
  if (hitstop > 0) { hitstop -= dt; updateRig(dt * 0.2); return; }

  if (scene === "play") {
    run.time += dt;
    updatePlayer(dt);
    updateSecrets(); updateSeen();
    if (scene === "play") {
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - P.x) > 1100 || Math.abs(e.y - P.y) > 800) continue;   // trop loin : en sommeil
        updateEnemy(e, dt);
      }
      enemies = enemies.filter((e) => !e.dead);
      updateShots(dt); updatePickups(dt); updateProps(dt); updateFx(dt);
    }
  }
  updateParts(dt);
  updateRig(dt);

  let fx = P.x + P.w / 2 + P.face * 50, fy = P.y + P.h / 2;
  if (bossIntro > 0 && bossRef && !bossRef.dead) { fx = (fx + bossRef.x + bossRef.w / 2) / 2; }
  const tx = clamp(fx - VW / 2, 0, Math.max(0, COLS * T - VW));
  const ty = clamp(fy - VH * 0.56 + (down("down") && P.onGround && Math.abs(P.vx) < 10 ? 90 : 0), 0, Math.max(0, ROWS * T - VH));
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * (P.vy > 500 ? 9 : 5));
}

// physique « verlet » de la cape et de l'écharpe
function updateRig(dt) {
  if (!P) return;
  const f = P.face, cx = P.x + P.w / 2, top = P.y + P.h - 34 * P.sq;
  const ropes = [["cape", 6, 4.2, cx - f * 3, top + 9, 900], ["scarf", 7, 4.6, cx - f * 2, top + 8, 260]];
  for (const [k, n, len, ax, ay, g] of ropes) {
    if (!P[k] || Math.abs(P[k][0].x - ax) > 80 || Math.abs(P[k][0].y - ay) > 80) { P[k] = []; for (let i = 0; i < n; i++) P[k].push({ x: ax - f * i * len, y: ay + i * (k === "cape" ? len : 1), px: ax - f * i * len, py: ay }); }
    const pts = P[k];
    for (let i = 1; i < n; i++) {
      const p = pts[i], vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
      p.px = p.x; p.py = p.y;
      const wind = k === "scarf" ? Math.sin(time * 9 + i) * 40 - P.vx * 0.15 : -P.vx * 0.05;
      p.x += vx + wind * dt * dt * 60; p.y += vy + g * dt * dt;
    }
    pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
    for (let it = 0; it < 3; it++) for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, df = (d - len) / d;
      b.x -= dx * df; b.y -= dy * df;
    }
  }
  P.sq += (1 - P.sq) * Math.min(1, dt * 11);
}

// ================================================================== rendu
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
const hh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- palette du biome
let PAL = { base: "#1b2138", cap: "#2b3a78" };
function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixc(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
const shade = (a, t) => (t >= 0 ? mixc(a, "#ffffff", t) : mixc(a, "#000000", -t));
const rgba = (c, a) => { const [r, g, b] = hexRgb(c); return `rgba(${r},${g},${b},${a})`; };
function buildPalette() {
  PAL = {
    base: S.tile, base2: S.tile2, hi: shade(S.tile, 0.1), lo: shade(S.tile, -0.22), mortar: shade(S.tile, -0.5),
    mid: shade(S.tile, -0.5), deep: shade(S.tile, -0.78), cap: S.edge, capHi: shade(S.edge, 0.3), capLo: shade(S.edge, -0.35),
    moss: S.moss, moss2: shade(S.moss, -0.4), back: S.back, backHi: shade(S.back, 0.14), backMid: shade(S.back, 0.06), backDim: shade(S.back, -0.15), backLo: shade(S.back, -0.45), accent: S.accent,
  };
}

// ---------------------------------------------------------------- tuiles : rendu en blocs mis en cache
const CHK = 16, CPX = CHK * T;
let chunks = new Map();
const VS = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || SOL(grid[r][c]) || hidMap[r * COLS + c] === 1;
function sdepth(c, r) {
  for (let d = 1; d <= 3; d++) for (let k = -d; k <= d; k++)
    if (!VS(c + k, r - d) || !VS(c + k, r + d) || !VS(c - d, r + k) || !VS(c + d, r + k)) return d - 1;
  return 3;
}
function adepth(c, r) {
  for (let d = 1; d <= 4; d++) for (let k = -d; k <= d; k++)
    if (VS(c + k, r - d) || VS(c + k, r + d) || VS(c - d, r + k) || VS(c + d, r + k)) return d - 1;
  return 4;
}
function resetChunks() {
  chunks = new Map(); crackList = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 4 || grid[r][c] === 5) crackList.push(c, r);
}
function dirtyRegion(c0, r0, c1, r1) {
  for (let cy = Math.floor(r0 / CHK); cy <= Math.floor(r1 / CHK); cy++)
    for (let cx = Math.floor(c0 / CHK); cx <= Math.floor(c1 / CHK); cx++) chunks.delete(cy * 1000 + cx);
}
function setTile(c, r, v) { grid[r][c] = v; dirtyRegion(c - 2, r - 2, c + 2, r + 2); mmDirty = true; }
function getChunk(cx, cy) {
  const k = cy * 1000 + cx, ch = chunks.get(k);
  if (ch) { ch.used = time; return ch.cv; }
  if (chunks.size > 46) {
    let old = null, ot = Infinity;
    for (const [kk, v] of chunks) if (v.used < ot) { ot = v.used; old = kk; }
    chunks.delete(old);
  }
  const cv2 = document.createElement("canvas"); cv2.width = CPX; cv2.height = CPX;
  drawChunk(cv2.getContext("2d"), cx, cy);
  chunks.set(k, { cv: cv2, used: time });
  return cv2;
}

function rrect(g, x, y, w, h, tl, tr, br, bl) {
  g.beginPath(); g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); if (tr) g.quadraticCurveTo(x + w, y, x + w, y + tr); g.lineTo(x + w, y + h - br);
  if (br) g.quadraticCurveTo(x + w, y + h, x + w - br, y + h); g.lineTo(x + bl, y + h); if (bl) g.quadraticCurveTo(x, y + h, x, y + h - bl); g.lineTo(x, y + tl); if (tl) g.quadraticCurveTo(x, y, x + tl, y); g.closePath();
}
function solidTexture(g, x, y, c, r, dp) {
  const st = S.tstyle || "block";
  if (st === "rock") {
    g.fillStyle = PAL.base; g.fillRect(x, y, T, T);
    for (let k = 0; k < 4; k++) {
      const v = hh(c * 4 + k, r * 7 + 3), v2 = hh(c * 9 + k, r * 5 + 1);
      g.fillStyle = v < 0.4 ? PAL.lo : v < 0.75 ? PAL.base2 : PAL.hi;
      g.beginPath(); g.ellipse(x + v2 * T, y + v * T, 5 + v * 9, 4 + v2 * 6, v * 3, 0, 7); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.07)"; for (let k = 0; k < 3; k++) g.fillRect(x + hh(c, r * 3 + k) * 30, y + hh(r, c * 3 + k) * 30, 2, 2);
    if (hh(c, r + 77) < 0.25) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, y + 10); g.lineTo(x + 14, y + 16); g.lineTo(x + 12, y + 26); g.stroke(); }
  } else if (st === "panel") {
    g.fillStyle = PAL.mortar; g.fillRect(x, y, T, T);
    for (let k = 0; k < 4; k++) {
      const v = hh(c * 4 + k, r);
      g.fillStyle = v < 0.3 ? PAL.base2 : v > 0.8 ? PAL.hi : PAL.base; g.fillRect(x + k * 8 + 1, y, 7, T);
      g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x + k * 8 + 2, y + (v * 20) | 0, 1, 10);
    }
    g.fillStyle = PAL.capLo; g.fillRect(x, y + ((r & 1) ? 0 : 14), T, 3);
    g.fillStyle = rgba(S.accent, 0.12); g.fillRect(x, y + ((r & 1) ? 0 : 14), T, 1);
  } else if (st === "marble") {
    const gr = g.createLinearGradient(x, y, x + T, y + T); gr.addColorStop(0, PAL.hi); gr.addColorStop(1, PAL.base);
    g.fillStyle = gr; g.fillRect(x, y, T, T);
    g.strokeStyle = rgba("#ffffff", 0.1); g.lineWidth = 1;
    g.beginPath(); const v = hh(c, r); g.moveTo(x, y + v * T); g.bezierCurveTo(x + 10, y + v * 10, x + 20, y + T - v * 12, x + T, y + hh(c + 1, r) * T); g.stroke();
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T);
  } else {                                                                       // grosses pierres taillées
    g.fillStyle = PAL.mortar; g.fillRect(x, y, T, T);
    for (let i = 0; i < 2; i++) {
      const row = r * 2 + i, off = (row & 1) * 16, by = y + i * 16;
      for (let bx = -off; bx < T; bx += 32) {
        const v = hh(c * 2 + Math.floor((bx + off) / 32) * 31, row);
        const x0 = Math.max(x, x + bx + 1), x1 = Math.min(x + T, x + bx + 31);
        if (x1 <= x0) continue;
        g.fillStyle = v < 0.2 ? PAL.base2 : v > 0.86 ? PAL.hi : v > 0.68 ? PAL.lo : PAL.base;
        g.fillRect(x0, by + 1, x1 - x0, 14);
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x0, by + 1, x1 - x0, 1);
        g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x0, by + 14, x1 - x0, 1);
        if (v > 0.93) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 3, by + 3); g.lineTo(x0 + 8, by + 8); g.lineTo(x0 + 6, by + 13); g.stroke(); }
      }
    }
  }
  if (dp === 1) { g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(x, y, T, T); }
}
function drawSolid(g, x, y, c, r, t) {
  const dp = sdepth(c, r);
  if (t === 6 && !hidMap[r * COLS + c]) {                                // vigne (escalade avec la rune)
    g.fillStyle = shade(S.moss, -0.75); g.fillRect(x, y, T, T);
    g.strokeStyle = PAL.moss; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const vx = x + 5 + i * 10 + (hh(c, r + i) - 0.5) * 4;
      g.beginPath(); g.moveTo(vx, y); g.bezierCurveTo(vx + 6, y + 10, vx - 6, y + 20, vx, y + T); g.stroke();
      g.fillStyle = shade(S.moss, 0.25); g.fillRect(vx + 2, y + 6 + i * 7, 4, 3); g.fillRect(vx - 5, y + 16 + i * 4, 4, 3);
    }
    return;
  }
  if (dp >= 2) {
    g.fillStyle = PAL.deep; g.fillRect(x, y, T, T);
    if (hh(c, r) < 0.1) { g.fillStyle = "rgba(255,255,255,.025)"; g.beginPath(); g.ellipse(x + 16, y + 16, 10, 6, hh(r, c) * 3, 0, 7); g.fill(); }
    return;
  }
  const up = !VS(c, r - 1), dn = !VS(c, r + 1), lf = !VS(c - 1, r), rt = !VS(c + 1, r);
  const R0 = 10, tl = up && lf ? R0 : 0, tr = up && rt ? R0 : 0, br = dn && rt ? R0 : 0, bl = dn && lf ? R0 : 0;
  if (tl || tr || br || bl) drawBack(g, x, y, c, r);                       // le fond se voit dans les coins arrondis
  g.save(); rrect(g, x, y, T, T, tl, tr, br, bl); g.clip();
  solidTexture(g, x, y, c, r, dp);
  // contour sombre et lumière d'arête
  g.fillStyle = "rgba(2,3,8,.85)";
  if (lf) g.fillRect(x, y, 2, T); if (rt) g.fillRect(x + T - 2, y, 2, T); if (dn) g.fillRect(x, y + T - 2, T, 2);
  if (lf) { g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + 2, y, 2, T); }
  if (rt) { const gr = g.createLinearGradient(x + T - 12, 0, x + T, 0); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.4)"); g.fillStyle = gr; g.fillRect(x + T - 12, y, 12, T); }
  if (dn) { const gr = g.createLinearGradient(0, y + T - 12, 0, y + T); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.5)"); g.fillStyle = gr; g.fillRect(x, y + T - 12, T, 12); }
  if (up) {
    g.fillStyle = "rgba(2,3,8,.85)"; g.fillRect(x, y, T, 2);
    g.fillStyle = PAL.cap; g.fillRect(x, y + 2, T, 5);
    g.fillStyle = PAL.moss2;                                              // tapis de mousse aux bords irréguliers
    for (let k = 0; k < T; k += 4) g.fillRect(x + k, y + 5, 4, 2 + Math.floor(hh(c * 8 + k, r) * 5));
    g.fillStyle = PAL.moss; g.fillRect(x, y + 2, T, 3);
    g.fillStyle = rgba(S.accent, 0.4); g.fillRect(x, y + 2, T, 1);
  }
  g.restore();
}

function vnoise(c, r) {                                   // bruit lissé : grandes brèches dans le mur du fond
  const gx = c / 7, gy = r / 5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hh(x0, y0 + 50), b = hh(x0 + 1, y0 + 50), c2 = hh(x0, y0 + 51), d = hh(x0 + 1, y0 + 51);
  return (a + (b - a) * sx) * (1 - sy) + (c2 + (d - c2) * sx) * sy;
}
const isHole = (c, r) => !S.boss && vnoise(c, r) > 0.6 && adepth(c, r) >= 2;
function drawBack(g, x, y, c, r) {
  if (isHole(c, r)) {
    const edge = !isHole(c - 1, r) || !isHole(c + 1, r) || !isHole(c, r - 1) || !isHole(c, r + 1);
    if (edge) for (let i = 0; i < 4; i++) {                          // bord effrité de la brèche
      const v = hh(c * 5 + i, r * 3);
      if (v < 0.5) { g.globalAlpha = 0.9; g.fillStyle = v < 0.2 ? PAL.backMid : PAL.back; g.fillRect(x + (i % 2) * 16, y + (i >> 1) * 16 + 1, 15, 15); }
    }
    g.globalAlpha = 1;
    return;
  }
  g.globalAlpha = 0.9;
  const bst = S.tstyle || "block";
  if (bst === "rock") {
    g.fillStyle = PAL.back; g.fillRect(x, y, T, T);
    for (let k = 0; k < 3; k++) { const v = hh(c * 3 + k, r * 5 + 9), v2 = hh(c * 7 + k, r * 3 + 2); g.fillStyle = v < 0.5 ? PAL.backDim : PAL.backMid; g.beginPath(); g.ellipse(x + v2 * T, y + v * T, 8 + v * 10, 6 + v2 * 6, v * 3, 0, 7); g.fill(); }
  } else if (bst === "panel") {                                                      // rayonnages de livres
    g.fillStyle = PAL.backLo; g.fillRect(x, y, T, T);
    for (let k = 0; k < 6; k++) { const v = hh(c * 6 + k, r); g.fillStyle = v < 0.3 ? "#2a1830" : v < 0.6 ? "#1a2238" : v < 0.85 ? "#2a2416" : "#1a2a24"; g.fillRect(x + 1 + k * 5, y + 4 + (v * 5 | 0), 4, 24 - (v * 5 | 0)); }
    g.fillStyle = PAL.backMid; g.fillRect(x, y + 28, T, 4);
    if ((c % 4) === 0) { g.fillStyle = PAL.backMid; g.fillRect(x, y, 4, T); }
  } else if (bst === "marble") {                                                     // arcades gothiques
    g.fillStyle = PAL.back; g.fillRect(x, y, T, T);
    const m = ((c % 6) + 6) % 6, rr = ((r % 8) + 8) % 8;
    if (m === 0) { g.fillStyle = PAL.backMid; g.fillRect(x + 8, y, 16, T); g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x + 8, y, 2, T); }
    else if (rr >= 2) { g.fillStyle = PAL.backLo; g.fillRect(x, y, T, T); if (rr === 2) { g.fillStyle = PAL.back; g.beginPath(); g.moveTo(x, y); g.lineTo(x + T, y); g.lineTo(x + (m < 3 ? T : 0), y + T); g.fill(); } }
  } else {
    g.fillStyle = PAL.backLo; g.fillRect(x, y, T, T);
    for (let i = 0; i < 2; i++) {
      const row = r * 2 + i, off = (row & 1) * 16, by = y + i * 16;
      for (let bx = -off; bx < T; bx += 32) {
        const v = hh(c + Math.floor((bx + off) / 32) * 977, row * 3 + 7);
        const x0 = Math.max(x, x + bx + 1), x1 = Math.min(x + T, x + bx + 32);
        if (x1 <= x0) continue;
        g.fillStyle = v < 0.2 ? PAL.backMid : v > 0.85 ? PAL.backDim : PAL.back;
        g.fillRect(x0, by + 1, x1 - x0, 15);
      }
    }
    const pc = (c + 400) % 14;
    if (pc === 0 || pc === 1) {
      g.fillStyle = PAL.backMid; g.fillRect(x + (pc ? 0 : 14), y, 18, T);
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x + (pc ? 15 : 14), y, 3, T);
    }
  }
  g.globalAlpha = 1;
  // occlusion près des murs
  if (VS(c, r - 1)) { const gr = g.createLinearGradient(0, y, 0, y + 18); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x, y, T, 18); }
  if (VS(c, r + 1)) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, y + T - 6, T, 6); }
  if (VS(c - 1, r)) { const gr = g.createLinearGradient(x, 0, x + 14, 0); gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x, y, 14, T); }
  if (VS(c + 1, r)) { const gr = g.createLinearGradient(x + T, 0, x + T - 14, 0); gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x + T - 14, y, 14, T); }
}

function drawPlat(g, x, y, c, r) {
  const L = tileAt(c - 1, r) !== 2, Rr = tileAt(c + 1, r) !== 2;
  if (S.plat === "metal") {
    g.fillStyle = "#2a3142"; g.fillRect(x, y, T, 8);
    g.fillStyle = "#475066"; g.fillRect(x, y, T, 2);
    g.fillStyle = "#151a24"; for (let i = 3; i < T; i += 6) g.fillRect(x + i, y + 3, 3, 4);
    g.fillStyle = rgba(S.accent, 0.7); g.fillRect(x, y, T, 1);
    if (L || Rr) { g.fillStyle = "#8a93a8"; g.fillRect(x + (L ? 2 : T - 5), y + 2, 3, 3); }
    g.strokeStyle = "#20263a"; g.lineWidth = 2;
    if (L && VS(c - 1, r)) { g.beginPath(); g.moveTo(x, y + 18); g.lineTo(x + 12, y + 8); g.stroke(); }
    if (Rr && VS(c + 1, r)) { g.beginPath(); g.moveTo(x + T, y + 18); g.lineTo(x + T - 12, y + 8); g.stroke(); }
  } else {
    g.fillStyle = "#4a3220"; g.fillRect(x, y, T, 8);
    g.fillStyle = "#6e4c2e"; g.fillRect(x, y, T, 3);
    g.fillStyle = "#2a1c12"; g.fillRect(x + ((c * 11) % 16) + 8, y, 1, 8);
    g.fillStyle = "#c9a56a"; g.fillRect(x + 4, y + 4, 2, 2); g.fillRect(x + T - 6, y + 4, 2, 2);
    g.fillStyle = rgba(S.accent, 0.45); g.fillRect(x, y, T, 1);
    g.fillStyle = "#3a2618";
    if (L && VS(c - 1, r)) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 12, y + 8); g.lineTo(x, y + 22); g.fill(); }
    if (Rr && VS(c + 1, r)) { g.beginPath(); g.moveTo(x + T, y + 8); g.lineTo(x + T - 12, y + 8); g.lineTo(x + T, y + 22); g.fill(); }
    if ((L && !VS(c - 1, r)) || (Rr && !VS(c + 1, r))) { g.strokeStyle = "#7a6a4a"; g.lineWidth = 1; const rx = x + (L ? 4 : T - 4); g.beginPath(); g.moveTo(rx, y); g.lineTo(rx, y - 40); g.stroke(); }
  }
}

function drawSpikes(g, x, y) {
  g.fillStyle = "#1a1c26"; g.fillRect(x, y + T - 5, T, 5);
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 8;
    const gr = g.createLinearGradient(sx, 0, sx + 8, 0); gr.addColorStop(0, "#9aa3b8"); gr.addColorStop(1, "#3a4052");
    g.fillStyle = gr; g.beginPath(); g.moveTo(sx, y + T - 4); g.lineTo(sx + 4, y + 12); g.lineTo(sx + 8, y + T - 4); g.fill();
    g.fillStyle = "#ff2e97"; g.beginPath(); g.moveTo(sx + 3, y + 16); g.lineTo(sx + 4, y + 12); g.lineTo(sx + 5, y + 16); g.fill();
  }
}

function drawChunk(g, cx, cy) {
  const c0 = cx * CHK, r0 = cy * CHK;
  for (let r = r0; r < r0 + CHK; r++) for (let c = c0; c < c0 + CHK; c++) {
    const x = (c - c0) * T, y = (r - r0) * T;
    if (c >= COLS || r >= ROWS) { g.fillStyle = PAL.deep; g.fillRect(x, y, T, T); continue; }
    const t = grid[r][c], hid = hidMap[r * COLS + c] === 1;
    if (SOL(t) || hid) drawSolid(g, x, y, c, r, t);
    else {
      drawBack(g, x, y, c, r);
      if (t === 2) drawPlat(g, x, y, c, r);
      else if (t === 3) drawSpikes(g, x, y);
    }
  }
  // détails qui débordent : herbe, racines, crânes, toiles
  for (let r = r0 - 1; r <= r0 + CHK; r++) for (let c = c0; c < c0 + CHK; c++) {
    if (c >= COLS || r < 0 || r >= ROWS) continue;
    const x = (c - c0) * T, y = (r - r0) * T;
    if (!VS(c, r)) {
      const below = r + 1 < ROWS && SOL(grid[r + 1][c]) && !hidMap[(r + 1) * COLS + c] && grid[r + 1][c] !== 6;
      const above = r > 0 && SOL(grid[r - 1][c]) && !hidMap[(r - 1) * COLS + c];
      if (below) {
        const v = hh(c, r * 3 + 1), fy = y + T;
        g.strokeStyle = PAL.moss; g.lineWidth = 1.5;
        for (let k = 0, n = 3 + Math.floor(v * 7); k < n; k++) {
          const bx = x + hh(c * 7 + k, r) * T, bh = 3 + hh(k, c * 5 + r) * 9, lean = (hh(c, k * 11) - 0.5) * 6;
          g.strokeStyle = k % 3 ? PAL.moss : PAL.moss2;
          g.beginPath(); g.moveTo(bx, fy + 1); g.quadraticCurveTo(bx + lean * 0.3, fy - bh * 0.6, bx + lean, fy - bh); g.stroke();
        }
        g.fillStyle = PAL.moss2; g.fillRect(x, fy - 1, T, 2);
        if (v > 0.93) {                                                   // crâne
          g.fillStyle = "#c8c2b0"; g.beginPath(); g.arc(x + 16, fy - 6, 5, Math.PI, 0); g.fill(); g.fillRect(x + 12, fy - 6, 8, 5);
          g.fillStyle = "#1a1418"; g.fillRect(x + 13, fy - 7, 2, 2); g.fillRect(x + 17, fy - 7, 2, 2);
        } else if (v > 0.86) {                                            // champignons luminescents
          g.fillStyle = S.accent; g.globalAlpha = 0.8;
          g.beginPath(); g.arc(x + 10, fy - 5, 3, Math.PI, 0); g.fill(); g.beginPath(); g.arc(x + 16, fy - 7, 4, Math.PI, 0); g.fill();
          g.globalAlpha = 1; g.fillStyle = "#d8e0f0"; g.fillRect(x + 9.5, fy - 5, 1, 5); g.fillRect(x + 15.5, fy - 7, 1, 7);
        } else if (v > 0.8) {                                             // gravats
          g.fillStyle = PAL.lo; g.fillRect(x + 6, fy - 4, 6, 4); g.fillRect(x + 14, fy - 3, 4, 3); g.fillStyle = PAL.hi; g.fillRect(x + 6, fy - 4, 6, 1);
        }
      }
      if (above) {
        const v = hh(c * 3, r + 91);
        if (v < 0.35) {
          g.strokeStyle = PAL.moss2; g.lineWidth = 1.5;
          const len = 6 + hh(c, r) * 22;
          g.beginPath(); g.moveTo(x + 8 + v * 30, y); g.quadraticCurveTo(x + 4 + v * 30, y + len * 0.5, x + 10 + v * 30, y + len); g.stroke();
        } else if (v < 0.55) {
          g.fillStyle = PAL.lo; g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + 10, y + 7 + v * 14); g.lineTo(x + 14, y); g.fill();
        }
        // toile d'araignée dans les coins
        if (VS(c - 1, r) && hh(c, r + 5) < 0.45) {
          g.strokeStyle = "rgba(220,230,255,.18)"; g.lineWidth = 1;
          g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(x, y); g.lineTo(x + 18 - k * 4, y + k * 5); } g.moveTo(x + 6, y); g.quadraticCurveTo(x + 6, y + 6, x, y + 6); g.moveTo(x + 12, y); g.quadraticCurveTo(x + 11, y + 11, x, y + 12); g.stroke();
        }
      }
    }
  }
}

function drawTiles() {
  const cx0 = Math.max(0, Math.floor(cam.x / CPX)), cx1 = Math.floor((cam.x + VW) / CPX);
  const cy0 = Math.max(0, Math.floor(cam.y / CPX)), cy1 = Math.floor((cam.y + VH) / CPX);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    if (cx * CHK >= COLS || cy * CHK >= ROWS) continue;
    ctx.drawImage(getChunk(cx, cy), cx * CPX, cy * CPX);
  }
  // fissures : presque invisibles, elles se devinent de près
  const pcx = P.x + P.w / 2, pcy = P.y + P.h / 2;
  for (let i = 0; i < crackList.length; i += 2) {
    const c = crackList[i], r = crackList[i + 1], t = tileAt(c, r);
    if (t !== 4 && t !== 5) continue;
    const x = c * T, y = r * T;
    if (x + T < cam.x || x > cam.x + VW || y + T < cam.y || y > cam.y + VH) continue;
    const d = Math.hypot(x + 16 - pcx, y + 16 - pcy), near = clamp(1 - d / 110, 0, 1), hit2 = cracks.get(r * COLS + c);
    ctx.globalAlpha = 0.05 + 0.5 * near + (hit2 ? 0.45 : 0); ctx.strokeStyle = "#e8d9a0"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(x + 7, y + 5); ctx.lineTo(x + 15, y + 15); ctx.lineTo(x + 11, y + 21); ctx.lineTo(x + 21, y + 28);
    ctx.moveTo(x + 25, y + 4); ctx.lineTo(x + 18, y + 13); ctx.stroke();
    if (near > 0.2) { ctx.fillStyle = "#ffd23f"; ctx.globalAlpha = near * (0.3 + 0.3 * Math.sin(time * 4 + c)); ctx.fillRect(x + 12, y + 12, 3, 3); }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- décor vivant
function genDecor(R) {
  const free = (c, r) => !VS(c, r) && grid[r][c] === 0;
  for (let r = 1; r < ROWS - 1; r++) for (let c = 2; c < COLS - 2; c++) {
    if (!free(c, r)) continue;
    const ceil = VS(c, r - 1), v = R();
    if (ceil && v < 0.045) {
      let len = 0; while (len < 7 && free(c, r + len)) len++;
      if (len >= 3) decos.push({ kind: "chain", x: c * T + 16, y: r * T, len: (2 + Math.floor(R() * (len - 1))) * T * 0.8, cage: R() < 0.3, ph: R() * 6 });
    } else if (ceil && v < 0.075 && free(c, r + 1) && free(c, r + 2) && !S.boss) {
      decos.push({ kind: "banner", x: c * T + 4, y: r * T, h: 44 + R() * 30, ph: R() * 6 });
    } else if (!ceil && v < 0.012 && adepth(c, r) >= 2 && free(c + 1, r) && free(c, r + 1) && free(c + 1, r + 1) && free(c, r + 2) && free(c + 1, r + 2)) {
      decos.push({ kind: "window", x: c * T, y: r * T, ph: R() * 6 });
      if (R() < 0.7) rays.push({ x: c * T + 32, y: r * T + 20, len: 260 + R() * 220, w: 44 + R() * 30, sl: 0.35 + R() * 0.3, ph: R() * 6 });
    }
    if ((S.mote === "bubble" || S.mote === "pages") && VS(c, r + 1) && !VS(c, r - 1) && R() < 0.02) decos.push({ kind: "crystal", x: c * T + 16, y: (r + 1) * T, s: 0.7 + R() * 0.6, ph: R() * 6 });
  }
  if (decos.length > 160) decos.length = 160;
  // silhouettes au premier plan
  for (let x = 400 + R() * 400; x < COLS * T; x += 700 + R() * 900) fgs.push({ x, kind: R() < 0.5 ? "pillar" : "chain", w: 30 + R() * 40, ph: R() * 6 });
}

function drawDecos(layer) {
  for (const d of decos) {
    if (d.x < cam.x - 120 || d.x > cam.x + VW + 120 || d.y < cam.y - 300 || d.y > cam.y + VH + 120) continue;
    if (layer === 0 && d.kind === "window") {
      const x = d.x + 8, y = d.y + 10, w = 48, h = 70, fl = 0.75 + 0.25 * Math.sin(time * 0.8 + d.ph);
      ctx.fillStyle = "#05060c"; ctx.beginPath(); ctx.moveTo(x - 4, y + h + 4); ctx.lineTo(x - 4, y + 18); ctx.arc(x + w / 2, y + 18, w / 2 + 4, Math.PI, 0); ctx.lineTo(x + w + 4, y + h + 4); ctx.fill();
      const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(S.accent, 0.55 * fl)); gr.addColorStop(1, rgba(S.accent, 0.12));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + 18); ctx.arc(x + w / 2, y + 18, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.fill();
      ctx.fillStyle = PAL.backLo; ctx.fillRect(x + w / 2 - 2, y - 6, 4, h + 6); ctx.fillRect(x, y + 34, w, 3);
      addLight(x + w / 2, y + h / 2, 150, 0.45 * fl);
    } else if (layer === 1 && d.kind === "chain") {
      const sw = Math.sin(time * 1.3 + d.ph) * 0.06;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(sw);
      ctx.strokeStyle = "#3a3f52"; ctx.lineWidth = 2;
      for (let y = 0; y < d.len; y += 7) { ctx.beginPath(); if ((y / 7) & 1) ctx.ellipse(0, y + 3.5, 1.5, 4, 0, 0, 7); else ctx.ellipse(0, y + 3.5, 3, 4, 0, 0, 7); ctx.stroke(); }
      if (d.cage) {
        const cy = d.len;
        ctx.strokeStyle = "#4a5066"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, cy + 4, 14, 5, 0, 0, 7); ctx.stroke();
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 6, cy + 4); ctx.lineTo(k * 6.5, cy + 40); ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(0, cy + 40, 15, 4, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = "#c8c2b0"; ctx.beginPath(); ctx.arc(-2, cy + 33, 4, 0, 7); ctx.fill();
      } else { ctx.fillStyle = "#555a70"; ctx.beginPath(); ctx.moveTo(-5, d.len); ctx.lineTo(0, d.len + 10); ctx.lineTo(5, d.len); ctx.fill(); }
      ctx.restore();
    } else if (layer === 0 && d.kind === "banner") {
      const sw = Math.sin(time * 1.1 + d.ph) * 3;
      ctx.fillStyle = "#3a3020"; ctx.fillRect(d.x - 3, d.y + 2, 30, 3);
      ctx.fillStyle = shade(S.edge, -0.2);
      ctx.beginPath(); ctx.moveTo(d.x, d.y + 4); ctx.lineTo(d.x + 24, d.y + 4); ctx.lineTo(d.x + 24 + sw, d.y + d.h); ctx.lineTo(d.x + 12 + sw, d.y + d.h - 10); ctx.lineTo(d.x + sw, d.y + d.h); ctx.fill();
      ctx.fillStyle = rgba(S.accent, 0.75); ctx.beginPath(); ctx.arc(d.x + 12 + sw * 0.4, d.y + 22, 5, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(S.accent, 0.4); ctx.fillRect(d.x + 2 + sw * 0.1, d.y + 6, 2, d.h - 14);
    } else if (layer === 1 && d.kind === "crystal") {
      const p = 0.7 + 0.3 * Math.sin(time * 2 + d.ph);
      ctx.fillStyle = rgba(S.accent, 0.85);
      for (const [ox, h, a] of [[-6, 16, -0.3], [0, 24, 0], [6, 14, 0.35]]) { ctx.save(); ctx.translate(d.x + ox * d.s, d.y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-3 * d.s, 0); ctx.lineTo(0, -h * d.s); ctx.lineTo(3 * d.s, 0); ctx.fill(); ctx.restore(); }
      ctx.globalCompositeOperation = "lighter"; glow(d.x, d.y - 10, 40, S.accent, 0.35 * p); ctx.globalCompositeOperation = "source-over";
      addLight(d.x, d.y - 10, 120, 0.5 * p);
    }
  }
}
function drawRays() {
  ctx.globalCompositeOperation = "lighter";
  for (const r of rays) {
    if (r.x + r.len < cam.x - 200 || r.x - 200 > cam.x + VW || r.y > cam.y + VH || r.y + r.len < cam.y) continue;
    const a = 0.07 + 0.03 * Math.sin(time * 0.7 + r.ph);
    const ex = r.x + r.len * r.sl, ey = r.y + r.len;
    const gr = ctx.createLinearGradient(r.x, r.y, ex, ey); gr.addColorStop(0, rgba(S.accent, a)); gr.addColorStop(1, rgba(S.accent, 0));
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.moveTo(r.x - r.w * 0.3, r.y); ctx.lineTo(r.x + r.w * 0.3, r.y); ctx.lineTo(ex + r.w, ey); ctx.lineTo(ex - r.w, ey); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ---------------------------------------------------------------- arrière-plan en parallaxe
function genBackdrop(R) {
  layers = [];
  const cfg = [[0.1, S.far, 0.55], [0.25, mixc(S.far, S.near, 0.5), 0.75], [0.45, S.near, 1]];
  for (const [f, col, sc] of cfg) {
    const shapes = [];
    let x = -150;
    while (x < COLS * T * f + W * 1.5 + 200) {
      const w = (60 + R() * 120) * sc;
      shapes.push({ x, w, h: (180 + R() * 300) * sc, v: R(), win: Math.floor(R() * 4) });
      x += w + (20 + R() * 140) * sc;
    }
    layers.push({ f, shapes, col });
  }
  motes = [];
  for (let i = 0; i < 60; i++) motes.push({ x: R() * W, y: R() * H, s: 0.5 + R() * 2, p: R() * 6 });
}
function drawSkyShape(L, s, x, base) {
  const top = base - s.h, sky = S.sky;
  ctx.fillStyle = L.col;
  if (sky === "castle") {
    ctx.fillRect(x, top, s.w, H - top + 80);
    for (let k = 0; k < s.w; k += 14) ctx.fillRect(x + k, top - 10, 8, 10);
    if (s.v < 0.45) { ctx.beginPath(); ctx.moveTo(x - 6, top - 10); ctx.lineTo(x + s.w / 2, top - 10 - s.w * 0.7); ctx.lineTo(x + s.w + 6, top - 10); ctx.fill(); }
  } else if (sky === "spires") {
    ctx.fillRect(x, top, s.w, H - top + 80);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + s.w / 2, top - s.w * 1.6); ctx.lineTo(x + s.w, top); ctx.fill();
    ctx.fillRect(x + s.w / 2 - 1, top - s.w * 1.6 - 14, 2, 14);
  } else if (sky === "pipes") {
    ctx.fillRect(x + s.w * 0.35, top, s.w * 0.3, H - top + 80);
    const py = top + s.h * 0.25;
    ctx.fillRect(x - 40, py, s.w + 80, 18 + s.v * 22);
    ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.fillRect(x - 40, py, s.w + 80, 3);
    ctx.fillStyle = L.col; for (let k = -40; k < s.w + 40; k += 50) ctx.fillRect(x + k, py - 3, 8, 24 + s.v * 22);
  } else if (sky === "shelves") {
    ctx.fillRect(x, top, s.w, H - top + 80);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    for (let y = top + 16; y < H; y += 34) { ctx.fillRect(x + 4, y, s.w - 8, 26); }
    ctx.fillStyle = rgba(S.accent, 0.06);
    for (let y = top + 20; y < H; y += 34) for (let k = 6; k < s.w - 8; k += 7) if (((k * 13 + y) % 5) < 3) ctx.fillRect(x + k, y + ((k * 7) % 6), 4, 22 - ((k * 7) % 6));
  } else {                                                                 // grottes : stalactites et stalagmites
    ctx.beginPath(); ctx.moveTo(x, H + 80); ctx.lineTo(x + s.w * 0.5, top); ctx.lineTo(x + s.w, H + 80); ctx.fill();
    const ct = -40 + (base - H) * 0.6;
    ctx.beginPath(); ctx.moveTo(x + s.w * 0.2, ct); ctx.lineTo(x + s.w * 0.6, ct + s.h * 0.55); ctx.lineTo(x + s.w, ct); ctx.fill();
  }
  if (s.win && sky !== "caves" && sky !== "pipes") {                       // fenêtres éclairées au loin
    ctx.fillStyle = rgba(S.accent, 0.22 + 0.1 * Math.sin(time + s.v * 9));
    for (let k = 0; k < s.win; k++) ctx.fillRect(x + s.w * (0.25 + 0.5 * ((k * 0.37 + s.v) % 1)), top + 20 + k * 38, 4, 8);
  }
}
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // grande lueur lointaine
  const gx = W * 0.7 - cam.x * 0.03 % W, gy = H * 0.25 - cam.y * 0.04;
  ctx.globalCompositeOperation = "lighter"; glow(gx, gy, 320, S.accent, 0.12); glow(gx, gy, 90, S.accent, 0.1); ctx.globalCompositeOperation = "source-over";
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li], base = H + 60 - cam.y * Z * L.f * 0.45;
    for (const s of L.shapes) {
      const x = s.x - cam.x * Z * L.f;
      if (x > W + 60 || x + s.w < -60) continue;
      drawSkyShape(L, s, x, base);
    }
    // brume entre les couches
    const f = ctx.createLinearGradient(0, H * 0.35, 0, H);
    f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(1, rgba(S.fog || S.accent, 0.05 + li * 0.02));
    ctx.fillStyle = f; ctx.fillRect(0, H * 0.35, W, H * 0.65);
  }
  drawMotes(false);
}
function drawMotes(front) {
  const kind = S.mote;
  for (let i = front ? 0 : 1; i < motes.length; i += 2) {
    const m = motes[i];
    let x, y;
    if (kind === "ember" || kind === "bubble") { x = ((m.x - cam.x * 0.15 * m.s + Math.sin(time * 0.9 + m.p) * 18) % W + W) % W; y = ((m.y - time * 22 * m.s - cam.y * 0.15) % H + H) % H; }
    else if (kind === "drip") { x = ((m.x - cam.x * 0.2 * m.s) % W + W) % W; y = ((m.y + time * 160 * m.s - cam.y * 0.2) % H + H) % H; }
    else { x = ((m.x - cam.x * 0.12 * m.s + Math.sin(time * 0.4 + m.p) * 14) % W + W) % W; y = ((m.y - time * 6 * m.s - cam.y * 0.12) % H + H) % H; }
    const a = (0.2 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.6 + m.p))) * (front ? 1 : 0.6);
    ctx.globalAlpha = a;
    if (kind === "ember") { ctx.fillStyle = i % 3 ? "#ffb060" : S.accent; ctx.fillRect(x, y, 2 + m.s, 2 + m.s); }
    else if (kind === "bubble") { ctx.strokeStyle = S.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 1.5 + m.s * 1.5, 0, 7); ctx.stroke(); }
    else if (kind === "drip") { ctx.fillStyle = S.accent; ctx.fillRect(x, y, 1, 6 + m.s * 3); }
    else if (kind === "pages") { ctx.save(); ctx.translate(x, y); ctx.rotate(time * m.s + m.p); ctx.fillStyle = "#e6dcc0"; ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
    else { ctx.fillStyle = S.accent; ctx.fillRect(x, y, 2, 2); }
  }
  ctx.globalAlpha = 1;
}
function drawForeground() {
  for (const f of fgs) {
    const x = (f.x - cam.x * 1.35) * Z + W * 0.2;
    if (x < -150 || x > W + 150) continue;
    ctx.fillStyle = "rgba(1,1,4,.82)";
    if (f.kind === "pillar") {
      ctx.fillRect(x, 0, f.w, H);
      ctx.fillStyle = rgba(S.accent, 0.06); ctx.fillRect(x + f.w - 3, 0, 3, H);
      ctx.fillStyle = "rgba(1,1,4,.82)"; ctx.fillRect(x - 10, H - 60 - cam.y * 0.05 % 40, f.w + 20, 18);
    } else {
      const sw = Math.sin(time * 0.8 + f.ph) * 6;
      ctx.strokeStyle = "rgba(1,1,4,.85)"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x, -10); ctx.quadraticCurveTo(x + sw, H * 0.2, x + sw * 1.5, H * 0.34); ctx.stroke();
      ctx.fillRect(x + sw * 1.5 - 10, H * 0.34, 20, 16);
    }
  }
  // tas de gravats en bas de l'écran
  ctx.fillStyle = "rgba(1,1,4,.7)";
  for (let k = 0; k < 4; k++) {
    const x = ((k * 420 - cam.x * Z * 1.25) % (W + 400) + W + 400) % (W + 400) - 200;
    ctx.beginPath(); ctx.ellipse(x, H + 18, 120, 34, 0, Math.PI, 0); ctx.fill();
  }
}

function glow(x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- éclairage dynamique
const LS = 2, lc = document.createElement("canvas"); lc.width = W / LS; lc.height = H / LS;
const lx = lc.getContext("2d");
function addLight(x, y, r, a) { lights.push(x, y, r, a); }
function drawLighting() {
  lx.globalCompositeOperation = "source-over";
  lx.clearRect(0, 0, lc.width, lc.height);
  lx.fillStyle = `rgba(1,2,8,${S.amb})`; lx.fillRect(0, 0, lc.width, lc.height);
  lx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < lights.length; i += 4) {
    const sx = (lights[i] - cam.x) * Z / LS, sy = (lights[i + 1] - cam.y) * Z / LS, rr = lights[i + 2] * Z / LS, a = clamp(lights[i + 3], 0, 1);
    if (sx + rr < 0 || sy + rr < 0 || sx - rr > lc.width || sy - rr > lc.height) continue;
    const g = lx.createRadialGradient(sx, sy, 0, sx, sy, rr);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.55})`); g.addColorStop(1, "rgba(0,0,0,0)");
    lx.fillStyle = g; lx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
  }
  ctx.drawImage(lc, 0, 0, W, H);
}

function drawTorches() {
  const vis = (t) => t.x > cam.x - 140 && t.x < cam.x + VW + 140 && t.y > cam.y - 140 && t.y < cam.y + VH + 140;
  ctx.globalCompositeOperation = "lighter";
  for (const t of torches) {
    if (!vis(t)) continue;
    const fl = 0.8 + 0.2 * Math.sin(time * 9 + t.s) + 0.1 * Math.sin(time * 23 + t.s * 2);
    glow(t.x, t.y - 6, 90 * fl, t.warm ? "#ffb060" : S.accent, 0.3);
    addLight(t.x, t.y - 6, 230 * fl, 0.9);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const t of torches) {
    if (!vis(t)) continue;
    const col = t.warm ? "#ffb060" : S.accent;
    rect(t.x - 2, t.y, 4, 14, "#2a2f4a"); rect(t.x - 6, t.y - 2, 12, 4, "#3a4068"); rect(t.x - 4, t.y + 12, 8, 3, "#3a4068");
    const fl = 6 + Math.sin(time * 12 + t.s) * 2, sw = Math.sin(time * 7 + t.s) * 1.5;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(t.x - 5, t.y - 2); ctx.quadraticCurveTo(t.x - 4 + sw, t.y - 8 - fl, t.x + sw, t.y - 10 - fl); ctx.quadraticCurveTo(t.x + 4 + sw, t.y - 8 - fl, t.x + 5, t.y - 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(t.x - 2, t.y - 2); ctx.quadraticCurveTo(t.x + sw * 0.5, t.y - 4 - fl, t.x + 2, t.y - 2); ctx.fill();
    if (Math.random() < 0.06) parts.push({ x: t.x + rnd(-2, 2), y: t.y - 10, vx: rnd(-15, 15), vy: rnd(-70, -30), life: 0.6, max: 0.6, col, size: 2, grav: -20 });
  }
}

function drawDoors() {
  for (const d of doors) {
    const nb = BIOMES[d.next], col = nb.accent, cx = d.x + d.w / 2;
    // arche de pierre
    ctx.fillStyle = PAL.cap;
    ctx.beginPath(); ctx.moveTo(d.x - 12, d.y + d.h); ctx.lineTo(d.x - 12, d.y + 8); ctx.arc(cx, d.y + 8, d.w / 2 + 12, Math.PI, 0); ctx.lineTo(d.x + d.w + 12, d.y + d.h); ctx.lineTo(d.x + d.w + 2, d.y + d.h); ctx.lineTo(d.x + d.w + 2, d.y + 8); ctx.arc(cx, d.y + 8, d.w / 2 + 2, 0, Math.PI, true); ctx.lineTo(d.x - 2, d.y + d.h); ctx.fill();
    ctx.fillStyle = PAL.capHi; ctx.fillRect(d.x - 12, d.y + d.h - 4, 10, 4); ctx.fillRect(d.x + d.w + 2, d.y + d.h - 4, 10, 4);
    ctx.fillStyle = "#06070e"; ctx.beginPath(); ctx.moveTo(d.x - 2, d.y + d.h); ctx.lineTo(d.x - 2, d.y + 8); ctx.arc(cx, d.y + 8, d.w / 2 + 2, Math.PI, 0); ctx.lineTo(d.x + d.w + 2, d.y + d.h); ctx.fill();
    for (let k = 0; k < 5; k++) {                                         // runes
      const a = Math.PI + (k + 0.5) / 5 * Math.PI, rx = cx + Math.cos(a) * (d.w / 2 + 7), ry = d.y + 8 + Math.sin(a) * (d.w / 2 + 7);
      ctx.fillStyle = d.open ? rgba(col, 0.5 + 0.5 * Math.sin(time * 3 + k)) : "#3a3f52"; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    }
    if (d.open) {
      const p = 0.55 + 0.25 * Math.sin(time * 4);
      ctx.save(); ctx.beginPath(); ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x, d.y + 8); ctx.arc(cx, d.y + 8, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.clip();
      const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
      g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0.15));
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 4); ctx.fillStyle = g; ctx.fillRect(d.x, d.y - 20, d.w, d.h + 20);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(cx, d.y + d.h * 0.55, (8 + k * 7 + time * 20 % 7), (14 + k * 10 + time * 30 % 10), 0, 0, 7); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "lighter"; glow(cx, d.y + d.h / 2, 90, col, 0.35 * p + 0.1); ctx.globalCompositeOperation = "source-over";
      addLight(cx, d.y + d.h / 2, 200, 0.8);
      if (Math.random() < 0.3) parts.push({ x: d.x + Math.random() * d.w, y: d.y + d.h, vx: 0, vy: rnd(-90, -40), life: 0.8, max: 0.8, col, size: 2, grav: 0 });
    } else {
      ctx.strokeStyle = "#555a78"; ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(d.x + 4 + k * 10, d.y + 4); ctx.lineTo(d.x + 4 + k * 10, d.y + d.h); ctx.stroke(); }
    }
    if (d.open && scene === "play" && nearDoor() === d) {
      const lab = "F : " + (S.final ? "quitter la Crypte" : "entrer — " + nb.name);
      ctx.textAlign = "center"; ctx.font = "bold 14px 'Rajdhani', sans-serif";
      const tw = ctx.measureText(lab).width + 14;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(cx - tw / 2, d.y + d.h + 8, tw, 22);
      ctx.fillStyle = col; ctx.fillText(lab, cx, d.y + d.h + 23);
    }
    if (!S.final && Math.abs(P.x - d.x) < 520) {                       // étiquette de destination
      ctx.textAlign = "center";
      ctx.fillStyle = col; ctx.font = "bold 15px 'Rajdhani', sans-serif";
      ctx.fillText(nb.name.toUpperCase(), cx, d.y - 44);
      ctx.fillStyle = "#c8d2f0"; ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.fillText("☠".repeat(nb.diff) + (nb.rewardTxt ? " · " + nb.rewardTxt : ""), cx, d.y - 28);
    }
  }
}

// ---------------------------------------------------------------- armes : sprites détaillés (repère : main à l'origine, lame vers +x)
const WLEN = { sword: 27, dagger: 15, hammer: 28, spear: 46, rapier: 34, fireblade: 28, whip: 10, flail: 30, katana: 32, scythe: 34 };
function metal(x0, x1, y0, y1, hot, tint) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hot ? "#ffffff" : mixc(tint || "#c8d2e8", "#ffffff", 0.5)); g.addColorStop(0.45, hot ? "#f4fbff" : tint || "#c8d2e8"); g.addColorStop(1, hot ? "#d8f4ff" : mixc(tint || "#c8d2e8", "#1a1e2a", 0.55));
  return g;
}
function grip(len, col) {
  ctx.fillStyle = "#2a1a12"; ctx.fillRect(-7, -2, len, 4);
  ctx.fillStyle = col || "#5a3a22"; for (let k = -6; k < len - 7; k += 3) ctx.fillRect(k, -2, 1.5, 4);
  ctx.fillStyle = "#c9a54a"; ctx.beginPath(); ctx.arc(-8, 0, 2.6, 0, 7); ctx.fill();
}
function drawWeaponSprite(id, len, hot, col) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const L = len || WLEN[id] || 27;
  if (id === "sword" || id === "katana" || id === "fireblade") {
    grip(id === "katana" ? 10 : 8, id === "katana" ? "#3a2a4a" : null);
    if (id === "katana") { ctx.fillStyle = "#c9a54a"; ctx.beginPath(); ctx.ellipse(3, 0, 2, 5, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = "#c9a54a"; ctx.fillRect(1, -6, 4, 12); ctx.fillStyle = "#ffe08a"; ctx.fillRect(1, -6, 4, 2); ctx.fillStyle = "#ff2e97"; ctx.fillRect(2, -1, 2, 2); }
    if (id === "fireblade") {
      const g = ctx.createLinearGradient(5, 0, L + 6, 0); g.addColorStop(0, hot ? "#fff6d0" : "#ffcf6a"); g.addColorStop(0.5, "#ff8a2a"); g.addColorStop(1, "#ff3a1a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(5, -3.5);
      for (let k = 0; k <= 5; k++) ctx.lineTo(5 + (L - 2) * k / 5, -3.5 + (k % 2 ? -1.8 : 0.4) + k * 0.3);
      ctx.lineTo(L + 7, 0.5); ctx.lineTo(5, 3.5); ctx.fill();
      ctx.fillStyle = "rgba(255,240,180,.8)"; ctx.fillRect(6, -0.5, L - 6, 1);
      ctx.globalCompositeOperation = "lighter"; glow(L * 0.6, 0, 16, "#ff7a2a", hot ? 0.9 : 0.45); ctx.globalCompositeOperation = "source-over";
    } else if (id === "katana") {
      ctx.fillStyle = metal(0, 0, -2.5, 2.5, hot, "#dfe6f4");
      ctx.beginPath(); ctx.moveTo(5, -2); ctx.quadraticCurveTo(L * 0.6, -4.5, L + 6, -3.5); ctx.lineTo(L + 2, 0); ctx.quadraticCurveTo(L * 0.6, 0.5, 5, 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(6, -1.4); ctx.quadraticCurveTo(L * 0.6, -3.6, L + 4, -3.2); ctx.stroke();
    } else {
      ctx.fillStyle = metal(0, 0, -3, 3, hot, "#b8c2d6");
      ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(L, -2.5); ctx.lineTo(L + 6, 0); ctx.lineTo(L, 2.5); ctx.lineTo(5, 3); ctx.fill();
      ctx.fillStyle = "rgba(40,50,70,.55)"; ctx.fillRect(7, -0.6, L - 8, 1.2);
      if (!hot) { ctx.fillStyle = "rgba(150,80,40,.55)"; ctx.fillRect(L * 0.45, 1, 3, 1.5); ctx.fillRect(L * 0.7, -2.5, 2, 1.5); }
    }
  } else if (id === "dagger") {
    ctx.fillStyle = "#2a1a12"; ctx.fillRect(-5, -1.5, 7, 3); ctx.fillStyle = "#7dffb0"; ctx.fillRect(1, -4, 2, 8);
    ctx.fillStyle = metal(0, 0, -2.5, 2.5, hot, "#cfe8dc");
    ctx.beginPath(); ctx.moveTo(3, -2.5); ctx.quadraticCurveTo(L * 0.7, -4, L + 3, -1); ctx.lineTo(3, 2.5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(4, -1.5, L - 4, 0.8);
  } else if (id === "rapier") {
    ctx.fillStyle = "#2a1a12"; ctx.fillRect(-7, -1.5, 9, 3);
    ctx.strokeStyle = "#e0c060"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(2, 0, 6, -1.7, 1.7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 4, -2.4, -0.2); ctx.stroke();
    ctx.strokeStyle = hot ? "#ffffff" : "#e4ecf8"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(L + 8, 0); ctx.stroke();
    ctx.fillStyle = "#ff9ab0"; ctx.beginPath(); ctx.arc(-8, 0, 2.2, 0, 7); ctx.fill();
  } else if (id === "spear") {
    ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(L - 2, 0); ctx.stroke();
    ctx.strokeStyle = "#a5703a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -0.8); ctx.lineTo(L - 2, -0.8); ctx.stroke();
    ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.moveTo(L - 4, 0); ctx.lineTo(L - 10, 6); ctx.lineTo(L - 7, 0); ctx.lineTo(L - 10, -5); ctx.fill();
    ctx.fillStyle = metal(0, 0, -5, 5, hot, "#c8d2e8"); ctx.beginPath(); ctx.moveTo(L - 3, 0); ctx.quadraticCurveTo(L + 4, -6, L + 15, 0); ctx.quadraticCurveTo(L + 4, 6, L - 3, 0); ctx.fill();
    ctx.fillStyle = "rgba(30,40,60,.5)"; ctx.fillRect(L, -0.5, 11, 1);
  } else if (id === "hammer") {
    ctx.strokeStyle = "#5a3a22"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(L + 2, 0); ctx.stroke();
    ctx.fillStyle = "#c9a54a"; ctx.fillRect(L - 10, -2.5, 3, 5);
    ctx.fillStyle = metal(0, 0, -11, 11, hot, "#8a93a8"); ctx.fillRect(L - 4, -11, 16, 22);
    ctx.fillStyle = "#4a5066"; ctx.fillRect(L - 4, -11, 16, 3); ctx.fillRect(L - 4, 8, 16, 3);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(L - 4, -8, 2, 16);
    ctx.fillStyle = hot ? "#fff" : "#ffb020"; ctx.fillRect(L + 2, -3, 4, 6);
    if (!hot) { ctx.globalCompositeOperation = "lighter"; glow(L + 4, 0, 10, "#ffb020", 0.35); ctx.globalCompositeOperation = "source-over"; }
  } else if (id === "scythe") {
    ctx.strokeStyle = "#3a2a2a"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(L, 0); ctx.stroke();
    ctx.fillStyle = "#c9a54a"; ctx.fillRect(L - 3, -3, 4, 6);
    ctx.fillStyle = metal(0, 0, -16, 2, hot, "#c0b8d0");
    ctx.beginPath(); ctx.moveTo(L, -1); ctx.quadraticCurveTo(L + 4, -18, L - 22, -22); ctx.quadraticCurveTo(L - 4, -14, L - 2, 2); ctx.fill();
    ctx.strokeStyle = hot ? "#fff" : "#ff4d6d"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L - 21, -21.5); ctx.quadraticCurveTo(L + 3, -18, L, -1); ctx.stroke();
  } else if (id === "whip") {
    ctx.fillStyle = "#3a2a1a"; ctx.fillRect(-7, -2, 13, 4); ctx.fillStyle = "#7af0ff"; ctx.fillRect(5, -2.5, 2, 5);
    ctx.strokeStyle = "#7af0ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(7, 0);
    ctx.bezierCurveTo(16, 8, 4, 16, 12, 20); ctx.bezierCurveTo(18, 24, 10, 28, 6, 26); ctx.stroke();
    ctx.globalCompositeOperation = "lighter"; glow(10, 14, 12, "#7af0ff", 0.35); ctx.globalCompositeOperation = "source-over";
  } else if (id === "flail") {
    ctx.fillStyle = "#3a2618"; ctx.fillRect(-7, -2.5, 20, 5); ctx.fillStyle = "#c9a54a"; ctx.fillRect(12, -3, 2, 6);
    ctx.strokeStyle = "#8a93a8"; ctx.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(16 + k * 3.4, 1 + k * 0.6, 2, 1.4, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = metal(0, 0, -6, 12, hot, "#9aa3b8"); ctx.beginPath(); ctx.arc(L + 3, 4, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = hot ? "#fff" : "#d8dff0"; for (let k = 0; k < 8; k++) { const a = k * 0.785; ctx.beginPath(); ctx.moveTo(L + 3 + Math.cos(a) * 5, 4 + Math.sin(a) * 5); ctx.lineTo(L + 3 + Math.cos(a) * 10, 4 + Math.sin(a) * 10); ctx.lineTo(L + 3 + Math.cos(a + 0.3) * 5, 4 + Math.sin(a + 0.3) * 5); ctx.fill(); }
  } else if (id === "bow" || id === "longbow") {
    const R2 = id === "bow" ? 13 : 17;
    ctx.strokeStyle = "#7a4a22"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-4, 0, R2, -1.25, 1.25); ctx.stroke();
    ctx.strokeStyle = id === "bow" ? "#d9b45a" : "#e8c36a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-4, 0, R2 - 1.5, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-4 + Math.cos(-1.25) * R2, Math.sin(-1.25) * R2); ctx.lineTo(-4 + Math.cos(1.25) * R2, Math.sin(1.25) * R2); ctx.stroke();
    ctx.fillStyle = "#c9a54a"; ctx.fillRect(R2 - 6, -2, 3, 4);
  } else if (id === "crossbow") {
    ctx.fillStyle = "#4a3020"; ctx.fillRect(-8, -2.5, 22, 5);
    ctx.strokeStyle = "#8a93a8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, -12); ctx.quadraticCurveTo(18, 0, 12, 12); ctx.stroke();
    ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(12, -12); ctx.lineTo(4, 0); ctx.lineTo(12, 12); ctx.stroke();
    ctx.fillStyle = "#b0ffd0"; ctx.fillRect(4, -1, 14, 2);
  } else if (id === "shield" || id === "tower") {
    const big = id === "tower", w = big ? 14 : 12, h = big ? 18 : 13;
    ctx.fillStyle = big ? "#3a4a6a" : "#6a4422"; ctx.beginPath(); ctx.moveTo(-w, -h); ctx.lineTo(w, -h); ctx.lineTo(w, h * 0.3); ctx.quadraticCurveTo(w, h, 0, h + 4); ctx.quadraticCurveTo(-w, h, -w, h * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = big ? "#8fd0ff" : "#c9a54a"; ctx.lineWidth = 2; ctx.stroke();
    if (!big) { ctx.fillStyle = "rgba(0,0,0,.25)"; for (let k = -w + 5; k < w; k += 6) ctx.fillRect(k, -h + 1, 1, h * 1.8); }
    ctx.fillStyle = big ? "#8fd0ff" : "#ffd23f"; ctx.beginPath(); ctx.arc(0, -1, big ? 5 : 3.5, 0, 7); ctx.fill();
  }
}
function drawBlade(id, col, len, hot) { drawWeaponSprite(id, len, hot, col); }
function wIcon(id, x, y, s, col) {
  ctx.save(); ctx.translate(x + s / 2, y + s / 2);
  const wd = WEAPONS[id], L = WLEN[id] || 24;
  if (wd && (wd.type === "shield")) { const k = s / 40; ctx.scale(k, k); drawWeaponSprite(id, L, false, col); }
  else if (wd && wd.type === "bow") { const k = s / 38; ctx.scale(k, k); ctx.rotate(-0.785); ctx.translate(0, 0); drawWeaponSprite(id, L, false, col); }
  else {
    const tot = L + 22 + (id === "spear" ? 10 : 0), k = (s * 1.32) / tot;
    ctx.rotate(-0.785); ctx.scale(k, k); ctx.translate(-tot / 2 + 9, id === "scythe" ? 8 : 0);
    drawWeaponSprite(id, L, false, col);
    if (id === "dagger") { ctx.translate(-2, 8); drawWeaponSprite(id, L, false, col); }
  }
  ctx.restore();
}
function sIcon(id, x, y, s, col) {
  ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
  const k = s / 2 - 4;
  if (id === "grenade") { ctx.beginPath(); ctx.arc(0, 2, k * .7, 0, 7); ctx.stroke(); ctx.fillRect(-2, -k, 4, 5); }
  else if (id === "trap") { for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * k * .6 - 4, k * .6); ctx.lineTo(i * k * .6, -k * .5); ctx.lineTo(i * k * .6 + 4, k * .6); ctx.fill(); } }
  else if (id === "turret") { ctx.fillRect(-k * .6, 0, k * 1.2, k * .6); ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(k, -k * .6); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(0, 0, k * .5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, k, 0, 7); ctx.stroke(); }
  ctx.restore();
}


function itemIcon(it, x, y, s) {
  const col = itemCol(it);
  if (it.kind === "weapon") wIcon(it.id, x, y, s, it.rar ? col : WEAPONS[it.id].col);
  else if (it.kind === "skill") sIcon(it.id, x, y, s, col);
  else {
    ctx.save(); ctx.translate(x + s / 2, y + s / 2);
    if (it.kind === "scroll") {
      ctx.fillStyle = "#e9dcb0"; ctx.fillRect(-7, -9, 14, 18);
      ctx.fillStyle = "#b89a5a"; ctx.fillRect(-9, -11, 18, 4); ctx.fillRect(-9, 7, 18, 4);
      ctx.fillStyle = STATS[["brut", "tact", "surv"][Math.floor(time * 1.5) % 3]].c; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
    } else if (it.kind === "food") {
      ctx.fillStyle = "#c8643a"; ctx.beginPath(); ctx.ellipse(-1, 0, 9, 7, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = "#e8e0d0"; ctx.fillRect(5, -9, 3, 9); ctx.beginPath(); ctx.arc(6.5, -10, 3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(-6, -4, 6, 2);
    } else if (it.kind === "bp") {
      ctx.fillStyle = "#2a5aa0"; ctx.fillRect(-9, -7, 18, 14);
      ctx.strokeStyle = "#9fd8ff"; ctx.lineWidth = 1; ctx.strokeRect(-7, -5, 14, 10);
      ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(5, -3); ctx.stroke();
      ctx.fillStyle = "#1a3a70"; ctx.beginPath(); ctx.arc(9, 0, 4, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

function itemLines(it) {
  if (it.kind === "weapon") {
    const wd = WEAPONS[it.id], m = itemMul(it), st = STATS[wd.stat];
    const dmg = wd.type === "melee" ? Math.round(wd.steps.reduce((a, s) => a + s.dmg, 0) / wd.steps.length * m * U.melee) : wd.type === "bow" ? Math.round(wd.dmg * m * U.ranged) : null;
    const L = [[wd.desc, "#b9c8ea"], [st.ico + " " + st.n + (dmg ? " · " + dmg + " dégâts/coup" : wd.type === "shield" ? " · blocage " + Math.round((wd.block + 0.1 * it.rar) * 100) + " %" : ""), st.c]];
    for (const a of itemAff(it)) L.push(["◆ " + AFFIX[a].t, AFFIX[a].c]);
    return L;
  }
  if (it.kind === "skill") { const sd = SKILLS[it.id], st = STATS[sd.stat]; return [[sd.desc, "#b9c8ea"], [st.ico + " " + st.n + " · recharge " + sd.cd + " s", st.c]]; }
  if (it.kind === "food") return [["Rend 40 % des PV", "#3dff9a"]];
  if (it.kind === "scroll") return [["+1 dans la couleur de ton choix", "#ffe9a0"], ["et des PV max en plus", "#b9c8ea"]];
  if (it.kind === "bp") return [["Plan permanent : à débloquer à la Forge", "#9fd8ff"], [PLAN_COST[it.id] + " ◆ de cellules", "#00f0ff"]];
  return [];
}
function drawTooltip(p) {
  const it = p.item, lines = itemLines(it);
  const title = itemName(it) + (it.kind === "weapon" || it.kind === "skill" ? (it.kind === "weapon" ? " · " + RAR[it.rar].n : "") + (it.lvl ? " +" + it.lvl : "") : "");
  ctx.font = "bold 14px 'Rajdhani', sans-serif";
  let w = ctx.measureText(title).width;
  ctx.font = "12px 'Share Tech Mono', monospace";
  for (const [t] of lines) w = Math.max(w, ctx.measureText(t).width);
  ctx.font = "11px 'Share Tech Mono', monospace";
  w = Math.max(w, ctx.measureText(p.price ? "F : acheter" : it.kind === "weapon" ? "F : équiper (remplace l'arme active si plein)" : "F : prendre").width);
  w += 20;
  const h = 30 + lines.length * 15 + (p.price ? 18 : 0) + 14;
  const x = clamp(p.x + p.w / 2 - w / 2, cam.x + 6, cam.x + VW - w - 6), y = Math.max(cam.y + 6, p.y - h - 14);
  ctx.fillStyle = "rgba(6,8,18,.92)"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = itemCol(it); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = itemCol(it); ctx.fillRect(x, y, w, 2);
  ctx.textAlign = "left"; ctx.font = "bold 14px 'Rajdhani', sans-serif"; ctx.fillStyle = itemCol(it); ctx.fillText(title, x + 10, y + 19);
  ctx.font = "12px 'Share Tech Mono', monospace";
  lines.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, x + 10, y + 36 + i * 15); });
  let yy = y + 36 + lines.length * 15;
  if (p.price) { ctx.fillStyle = run.gold >= p.price ? "#ffd23f" : "#ff4d6d"; ctx.font = "bold 13px 'Share Tech Mono', monospace"; ctx.fillText("● " + p.price + " or", x + 10, yy + 2); yy += 18; }
  ctx.fillStyle = "#7f8fb5"; ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.fillText(p.price ? "F : acheter" : it.kind === "weapon" ? "F : équiper (remplace l'arme active si plein)" : "F : prendre", x + 10, yy + 4);
}

function drawProps() {
  for (const p of props) {
    if (p.x + p.w < cam.x - 60 || p.x > cam.x + VW + 60 || p.y > cam.y + VH + 60 || p.y + p.h < cam.y - 60) continue;
    if (hidMap[Math.floor((p.y + p.h / 2) / T) * COLS + Math.floor((p.x + p.w / 2) / T)]) continue;
    if (p.kind === "chest") {
      const cx = p.x + p.w / 2, cur = p.cursed, gc = cur ? "#b58bff" : "#ffd23f";
      if (!p.open) { ctx.globalCompositeOperation = "lighter"; glow(cx, p.y + 8, 46, gc, 0.3 + 0.15 * Math.sin(time * 4)); ctx.globalCompositeOperation = "source-over"; addLight(cx, p.y + 8, 90, 0.6); }
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(cx, p.y + p.h, p.w * 0.6, 4, 0, 0, 7); ctx.fill();
      rect(p.x, p.y + 8, p.w, p.h - 8, cur ? "#2a1a3a" : "#5a3a1a"); rect(p.x, p.y + 8, p.w, 3, cur ? "#4a2a6a" : "#8a5a2a");
      if (!p.open) {
        ctx.fillStyle = cur ? "#3a2250" : "#6a4220"; ctx.beginPath(); ctx.moveTo(p.x, p.y + 9); ctx.quadraticCurveTo(cx, p.y - 6, p.x + p.w, p.y + 9); ctx.fill();
        rect(cx - 3, p.y + 6, 6, 7, gc);
        if (cur) { ctx.fillStyle = "#e6d4ff"; ctx.beginPath(); ctx.arc(cx, p.y + 16, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#2a1a3a"; ctx.fillRect(cx - 3, p.y + 15, 2, 2); ctx.fillRect(cx + 1, p.y + 15, 2, 2); }
      } else { rect(p.x - 2, p.y - 8, 5, 16, cur ? "#3a2250" : "#6a4220"); }
      rect(p.x + 2, p.y + 8, 3, p.h - 8, cur ? "#b58bff" : "#c9a54a"); rect(p.x + p.w - 5, p.y + 8, 3, p.h - 8, cur ? "#b58bff" : "#c9a54a");
    } else if (p.kind === "item") {
      const it = p.item, bob = Math.sin(time * 3 + p.bob) * 3, col = itemCol(it), cx = p.x + 11;
      if (p.altar) {
        rect(p.x - 8, p.y + 22, p.w + 16, 8, PAL.capLo); rect(p.x - 5, p.y + 18, p.w + 10, 5, PAL.cap); rect(p.x - 5, p.y + 18, p.w + 10, 1, PAL.capHi);
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 2 + p.bob); ctx.fillStyle = col; ctx.fillRect(p.x - 5, p.y + 18, p.w + 10, 2); ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "lighter"; glow(cx, p.y + 11 + bob, it.rar === 3 ? 56 : 40, col, 0.42); ctx.globalCompositeOperation = "source-over";
      if (it.rar === 3 || it.kind === "scroll") for (let k = 0; k < 2; k++) { const a = time * 2 + k * Math.PI; ctx.fillStyle = col; ctx.fillRect(cx + Math.cos(a) * 18 - 1, p.y + 11 + bob + Math.sin(a) * 6 - 1, 3, 3); }
      addLight(cx, p.y + 11, 100, 0.6);
      itemIcon(it, p.x - 3, p.y - 3 + bob, 28);
      if (p.price) {
        ctx.textAlign = "center"; ctx.font = "bold 12px 'Share Tech Mono', monospace";
        ctx.fillStyle = run.gold >= p.price ? "#ffd23f" : "#ff6d8d"; ctx.fillText("● " + p.price, cx, p.y + 44);
      }
    } else if (p.kind === "totem") {
      rect(p.x, p.y, p.w, p.h, "#2a2f4a"); rect(p.x + 2, p.y + 2, p.w - 4, 6, "#3a4068");
      ctx.fillStyle = p.flash > 0 ? "#fff" : "#ff2e97"; ctx.fillRect(p.x + 4, p.y + 12, 6, 5); ctx.fillRect(p.x + 14, p.y + 12, 6, 5);
      rect(p.x - 4, p.y + 20, 8, 6, "#1a1e34");
      addLight(p.x + 12, p.y + 14, 50, 0.4);
    } else if (p.kind === "vase" && !p.broken) {
      const cx = p.x + p.w / 2;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(cx, p.y + p.h, p.w * 0.55, 3, 0, 0, 7); ctx.fill();
      if (p.big) {
        rect(p.x, p.y + 3, p.w, p.h - 3, "#5a3d22"); rect(p.x, p.y + 3, p.w, 3, "#7a5634");
        rect(p.x, p.y + 8, p.w, 2, "#3a2614"); rect(p.x, p.y + p.h - 7, p.w, 2, "#3a2614"); rect(p.x + 4, p.y + 3, 2, p.h - 3, "rgba(255,255,255,.08)");
      } else {
        const col = ["#5a6a8a", "#7a5a6a", "#4a6a5a"][p.v];
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - 4, p.y); ctx.lineTo(cx + 4, p.y); ctx.lineTo(cx + 3, p.y + 4); ctx.quadraticCurveTo(cx + 10, p.y + 8, cx + 6, p.y + p.h); ctx.lineTo(cx - 6, p.y + p.h); ctx.quadraticCurveTo(cx - 10, p.y + 8, cx - 3, p.y + 4); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(cx - 5, p.y + 8, 2, 7);
        ctx.fillStyle = rgba(S.accent, 0.5); ctx.fillRect(cx - 6, p.y + 11, 12, 1);
      }
    } else if (p.kind === "merchant") {
      const x = p.x, y = p.y, b = Math.sin(time * 2) * 0.8;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 13, y + 40, 16, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#3a2a4a"; ctx.beginPath(); ctx.moveTo(x + 1, y + 40); ctx.lineTo(x + 5, y + 14 + b); ctx.lineTo(x + 21, y + 14 + b); ctx.lineTo(x + 26, y + 40); ctx.fill();
      ctx.fillStyle = "#5a3a2a"; ctx.fillRect(x - 6, y + 18 + b, 12, 16);                     // sac à dos
      ctx.fillStyle = "#2a1e36"; ctx.beginPath(); ctx.arc(x + 13, y + 10 + b, 8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 5, y + 8 + b); ctx.lineTo(x + 13, y - 4 + b); ctx.lineTo(x + 21, y + 8 + b); ctx.fill();
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(x + 14, y + 9 + b, 3, 2); ctx.fillRect(x + 18, y + 9 + b, 2, 2);
      ctx.strokeStyle = "#8a7a5a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 24, y + 20 + b); ctx.lineTo(x + 30, y + 26 + b); ctx.stroke();
      const lf = 0.8 + 0.2 * Math.sin(time * 8);
      ctx.fillStyle = "#ffd890"; ctx.fillRect(x + 27, y + 26 + b, 6, 8);
      ctx.globalCompositeOperation = "lighter"; glow(x + 30, y + 30, 50, "#ffb060", 0.5 * lf); ctx.globalCompositeOperation = "source-over";
      addLight(x + 30, y + 30, 170, 0.8 * lf);
      if (Math.abs(P.x - x) < 200 && Math.abs(P.y - y) < 80) {
        ctx.textAlign = "center"; ctx.font = "12px 'Share Tech Mono', monospace"; ctx.fillStyle = "#ffd890";
        ctx.fillText(run.gold > 0 ? "« Jette un œil, voyageur. »" : "« Reviens avec de l'or. »", x + 13, y - 12);
      }
    }
  }
  // fiche de l'objet le plus proche
  const n = scene === "play" ? nearestProp() : null;
  if (n) {
    if (n.kind === "item") drawTooltip(n);
    else {
      ctx.textAlign = "center"; ctx.font = "bold 14px 'Rajdhani', sans-serif";
      const label = n.cursed ? "F : ouvrir le coffre maudit (risqué !)" : "F : ouvrir";
      ctx.fillStyle = "rgba(0,0,0,.7)"; const tw = ctx.measureText(label).width + 12; ctx.fillRect(n.x + n.w / 2 - tw / 2, n.y - 36, tw, 20);
      ctx.fillStyle = n.cursed ? "#b58bff" : "#ffd23f"; ctx.fillText(label, n.x + n.w / 2, n.y - 21);
    }
  }
}

function drawFx() {
  for (const f of pools) {
    const a = Math.min(1, f.t);
    ctx.globalAlpha = 0.75 * a; ctx.fillStyle = "#2f9a3a"; ctx.beginPath(); ctx.ellipse(f.x + f.w / 2, f.y - 1, f.w / 2, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8dff8a"; ctx.globalAlpha = 0.5 * a; ctx.beginPath(); ctx.ellipse(f.x + f.w / 2, f.y - 2, f.w / 2 - 6, 2, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    addLight(f.x + f.w / 2, f.y, 70, 0.4 * a);
  }
  for (const f of fires) {
    const a = Math.min(1, f.t);
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < f.w; k += 18) glow(f.x + k + 9, f.y + 4, 26, "#ff7a2a", 0.35 * a * (0.7 + 0.3 * Math.sin(time * 12 + k)));
    ctx.globalCompositeOperation = "source-over";
    addLight(f.x + f.w / 2, f.y, f.w, 0.6 * a);
  }
  for (const b of bombs) {
    ctx.fillStyle = b.fire ? "#5a2a1a" : "#2a2f4a"; ctx.beginPath(); ctx.arc(b.x + 5, b.y + 5, 6, 0, 7); ctx.fill();
    ctx.fillStyle = Math.floor(time * 12) % 2 ? "#ff4d4d" : "#ffd23f"; ctx.fillRect(b.x + 3, b.y - 3, 4, 4);
    addLight(b.x + 5, b.y, 50, 0.5);
  }
  for (const t of traps) {
    ctx.fillStyle = t.arm > 0 ? "#7f8fb5" : "#ffd23f";
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(t.x + i * 7, t.y + 6); ctx.lineTo(t.x + i * 7 + 3, t.y - 4); ctx.lineTo(t.x + i * 7 + 6, t.y + 6); ctx.fill(); }
  }
  for (const t of turrets) {
    rect(t.x, t.y + 8, t.w, 10, "#2a3a4a"); rect(t.x + 2, t.y + 8, t.w - 4, 3, "#00f0ff");
    ctx.save(); ctx.translate(t.x + 10, t.y + 6); ctx.rotate(t.ang); rect(0, -2, 14, 4, "#9ffcff"); ctx.restore();
    addLight(t.x + 10, t.y + 8, 60, 0.5);
  }
}

// ---------------------------------------------------------------- héros articulé
function drawRope(pts, col, w0, w1) {
  if (!pts) return;
  ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
    ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
  }
}
function heroBody(pose) {
  // repère local : pieds à l'origine, regard vers +x
  const { la, lb, ka, kb, arm, b, armBack } = pose;
  const leg = (ang, knee, col) => {
    const kx = Math.sin(ang) * 8, ky = -15 + Math.cos(ang) * 8, a2 = ang - knee, fx = kx + Math.sin(a2) * 8, fy = ky + Math.cos(a2) * 8;
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(fx - 2, fy - 2, 7, 4); ctx.fillStyle = "#00f0ff"; ctx.fillRect(fx - 2, fy + 1, 7, 1.5);
  };
  leg(lb, kb, "#080a16");
  // bras arrière
  ctx.strokeStyle = "#0a0d1c"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-2, -25 + b); ctx.lineTo(-2 + Math.sin(armBack) * 9, -25 + b + Math.cos(armBack) * 9); ctx.stroke();
  leg(la, ka, "#0d1020");
  // manteau
  const sw = Math.sin(P.runPh * 2) * 1.5;
  ctx.fillStyle = "#121933";
  ctx.beginPath(); ctx.moveTo(-7, -16); ctx.lineTo(7, -16); ctx.lineTo(8 + sw, -7); ctx.lineTo(-10 - sw, -7); ctx.fill();
  ctx.fillStyle = "#1a2340";
  ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(6, -14); ctx.lineTo(5, -27 + b); ctx.lineTo(-6, -27 + b); ctx.fill();
  ctx.fillStyle = "#ff2e97"; ctx.fillRect(-6, -16, 12, 2);
  ctx.fillStyle = "#00f0ff"; ctx.globalAlpha *= 0.8; ctx.fillRect(1, -26 + b, 2, 9); ctx.globalAlpha /= 0.8;
  ctx.fillStyle = "#26305a"; ctx.fillRect(-6, -27 + b, 11, 3);
  // tête encapuchonnée
  ctx.fillStyle = "#10152a";
  ctx.beginPath(); ctx.arc(1, -32 + b, 7, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -30 + b); ctx.lineTo(-3, -40 + b); ctx.lineTo(4, -38 + b); ctx.fill();
  ctx.fillStyle = "#04050a"; ctx.beginPath(); ctx.ellipse(4, -32 + b, 4, 4.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = P.curse > 0 ? "#c58bff" : "#00f0ff"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
  ctx.fillRect(3, -33.5 + b, 5, 2); ctx.shadowBlur = 0;
  // bras avant
  ctx.strokeStyle = "#1a2340"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(2, -25 + b); ctx.lineTo(2 + Math.sin(arm) * 9, -25 + b + Math.cos(arm) * 9); ctx.stroke();
  ctx.fillStyle = "#26305a"; ctx.beginPath(); ctx.arc(2 + Math.sin(arm) * 9, -25 + b + Math.cos(arm) * 9, 2.5, 0, 7); ctx.fill();
}
function heroPose() {
  const w = aw(), wd = w ? WEAPONS[w.id] : null;
  const moving = P.onGround && Math.abs(P.vx) > 25, ph = P.runPh;
  let la = 0.15, lb = -0.12, ka = 0.15, kb = 0.15, arm = 0.9, armBack = -0.3, b = 0;
  if (P.clinging || (P.wallDir && !P.onGround && P.vy > 0)) { la = 0.9; lb = 0.5; ka = 1.6; kb = 1.4; arm = 2.4; armBack = 2.2; }
  else if (!P.onGround) {
    const up = P.vy < 0;
    la = up ? 0.9 : 0.5; lb = up ? -0.2 : -0.5; ka = up ? 1.7 : 0.8; kb = up ? 0.9 : 0.4; arm = up ? 2.3 : 1.6; armBack = up ? -1.4 : -0.9;
  } else if (moving) {
    const s = Math.sin(ph), c = Math.cos(ph);
    la = s * 0.85; lb = -s * 0.85; ka = Math.max(0, c) * 1.1 + 0.15; kb = Math.max(0, -c) * 1.1 + 0.15;
    armBack = -s * 0.8; arm = 0.6 + s * 0.6; b = -Math.abs(c) * 1.5;
  } else { b = Math.sin(time * 2.4) * 0.6; }
  if (wd) {
    if (wd.type === "bow") arm = P.drawing ? 1.55 : 0.8;
    else if (wd.type === "shield") arm = P.guard ? 1.4 : 0.6;
    else if (P.atk) arm = 1.2 + clamp(P.atk.t / P.atk.dur, 0, 1) * 0.6;
  }
  return { la, lb, ka, kb, arm, b, armBack };
}
function drawPlayer() {
  const cx = P.x + P.w / 2, fy = P.y + P.h, f = P.face;
  const w = aw(), wd = w ? WEAPONS[w.id] : null;
  // images rémanentes de la roulade
  for (const g of ghosts) {
    ctx.globalAlpha = g.life / 0.25 * 0.4; ctx.fillStyle = "#00f0ff";
    ctx.beginPath(); ctx.arc(g.x + P.w / 2, g.y + P.h - 11, 11, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  addLight(cx, P.y + 8, 210, 0.95);
  // ombre au sol
  if (P.onGround) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(cx, fy, 12 * (2 - P.sq), 3, 0, 0, 7); ctx.fill(); }
  ctx.save();
  if (scene === "dead") {
    ctx.translate(cx, fy); ctx.rotate(f * Math.PI / 2); ctx.translate(-cx, -fy);
  } else if (P.inv > 0 && P.roll <= 0 && !P.guard && Math.floor(time * 26) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  if (P.curse > 0) { ctx.globalCompositeOperation = "lighter"; glow(cx, P.y + 12, 34, "#b58bff", 0.35 + 0.15 * Math.sin(time * 6)); ctx.globalCompositeOperation = "source-over"; }
  if (P.roll > 0) {
    const a = (1 - P.roll / 0.38) * Math.PI * 2 * P.rollDir;
    drawRope(P.scarf, "#ff2e97", 4, 1.5);
    ctx.translate(cx, fy - 11); ctx.rotate(a);
    ctx.fillStyle = "#1a2340"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#10152a"; ctx.beginPath(); ctx.arc(3 * f, -3, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11, a * 0, Math.PI * 1.2); ctx.stroke();
    ctx.restore();
    return;
  }
  // cape derrière le corps
  drawRope(P.cape, "#0e1430", 9, 4);
  drawRope(P.cape, "#18204a", 5, 2);
  const sx = 1 - (P.sq - 1) * 0.6, sy = 1 + (P.sq - 1) * 0.7;
  let lean = clamp(P.vx / 225, -1, 1) * 0.1 * (P.onGround ? 1 : 0.5);
  if (P.atk && !P.atk.s.bash && wd && wd.type === "melee") {
    const fr0 = P.atk.t / P.atk.dur, b0 = wd.a0 || 0.22, b1 = wd.a1 || 0.72;
    lean += f * (fr0 < b0 ? -0.12 : fr0 < b1 ? 0.2 : 0.08 * (1 - (fr0 - b1) / (1 - b1)));
  }
  ctx.save();
  ctx.translate(cx, fy); ctx.rotate(lean); ctx.scale(f * sx, sy);
  if (P.pound) { ctx.scale(0.85, 1.15); }
  heroBody(heroPose());
  ctx.restore();
  drawRope(P.scarf, "#ff2e97", 4, 1.5);
  if (P.pound) { ctx.globalCompositeOperation = "lighter"; glow(cx, fy + 6, 34, "#ffb020", 0.6); ctx.globalCompositeOperation = "source-over"; }

  // arme tenue
  const y = Math.round(P.y);
  if (wd) {
    ctx.lineCap = "round";
    if (wd.type === "shield") {
      const sh = P.guard ? 1 : 0, big = w.id === "tower";
      const sxx = cx + f * (sh ? 11 : -8), sw = sh ? (big ? 10 : 8) : 6, shh = sh ? (big ? 32 : 26) : 18;
      ctx.fillStyle = wd.col; ctx.fillRect(sxx - sw / 2, y + (sh ? -2 : 6), sw, shh);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(sxx - sw / 2, y + (sh ? -2 : 6), sw, 3);
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(sxx - sw / 2 + sw - 2, y + (sh ? -2 : 6), 2, shh);
      if (sh && P.guardT <= wd.parry + 0.03 * w.rar) { ctx.globalCompositeOperation = "lighter"; glow(sxx, y + 14, 34, "#ffd23f", 0.7); ctx.globalCompositeOperation = "source-over"; }
    } else if (wd.type === "bow") {
      const px = cx + f * 12;
      ctx.strokeStyle = wd.col; ctx.lineWidth = w.id === "crossbow" ? 4 : 3; ctx.beginPath();
      if (w.id === "crossbow") { ctx.moveTo(px - f * 8, y + 14); ctx.lineTo(px + f * 8, y + 14); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px + f * 4, y + 4); ctx.quadraticCurveTo(px + f * 9, y + 14, px + f * 4, y + 24); }
      else ctx.arc(px - f * 4, y + 14, 14, f > 0 ? -1.2 : Math.PI - 1.2, f > 0 ? 1.2 : Math.PI + 1.2);
      ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath();
      const pull = P.drawing ? clamp(P.draw / wd.chargeT, 0, 1) * 10 : 0;
      if (w.id !== "crossbow") { ctx.moveTo(px - f * 4 + Math.cos(f > 0 ? -1.2 : Math.PI - 1.2) * 14, y + 14 - 13); ctx.lineTo(px - f * (4 + pull), y + 14); ctx.lineTo(px - f * 4 + Math.cos(f > 0 ? 1.2 : Math.PI + 1.2) * 14, y + 14 + 13); ctx.stroke(); }
      if (P.drawing) {
        ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - f * (4 + pull), y + 14); ctx.lineTo(px + f * 14, y + 14); ctx.stroke();
        if (P.draw >= wd.chargeT) { ctx.globalCompositeOperation = "lighter"; glow(px + f * 14, y + 14, 16, "#ffd23f", 0.8); ctx.globalCompositeOperation = "source-over"; }
      }
    } else if (P.atk) {
      drawSwingWeapon(cx, y, f, w, wd);
    } else {
      ctx.save(); ctx.translate(cx + f * 7, y + 18); ctx.scale(f, 1); ctx.rotate(-1.15);
      drawBlade(w.id, wd.col, (WLEN[w.id] || 24) * 0.88, false);
      ctx.restore();
    }
  }
  ctx.restore();

  if (P.atk) {
    const a = P.atk, wdA = WEAPONS[a.wid], col = a.s.bash ? "#ffd23f" : wdA.col;
    const p = clamp((a.t / a.dur - 0.15) / 0.6, 0, 1);
    ctx.save();
    ctx.translate(cx, P.y + 16); ctx.scale(P.face, 1);
    ctx.globalAlpha = 0.9 * (1 - p * 0.5);
    ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.strokeStyle = col; ctx.lineCap = "round";
    if (a.wid === "whip") {                                            // fouet : une onde qui claque
      const fr = a.t / a.dur, ext = clamp((fr - 0.15) / 0.45, 0, 1), len = a.s.reach * ext;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, 0);
      for (let k = 1; k <= 12; k++) { const t2 = k / 12; ctx.lineTo(6 + len * t2, Math.sin(t2 * 9 - fr * 20) * 8 * (1 - t2) * (1 - ext * 0.6)); }
      ctx.stroke();
      if (ext > 0.9) { ctx.globalCompositeOperation = "lighter"; glow(6 + len, 0, 22, col, 0.8); }
      addLight(cx + P.face * len, P.y + 16, 70, 0.5);
    } else if (a.s.around) {                                           // fléau : moulinet complet
      const fr = a.t / a.dur, ang = -Math.PI / 2 + fr * Math.PI * 2.2;
      ctx.globalAlpha = 0.35 * (1 - p * 0.4); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, a.s.reach, ang - 1.6, ang); ctx.arc(0, 0, a.s.reach * 0.55, ang, ang - 1.6, true); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = "#8a93a8"; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(Math.cos(ang) * a.s.reach * 0.9, Math.sin(ang) * a.s.reach * 0.9); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(Math.cos(ang) * a.s.reach * 0.9, Math.sin(ang) * a.s.reach * 0.9, 7, 0, 7); ctx.fill();
    } else if (a.s.thin) {                                            // estoc
      const len = a.s.reach * (0.4 + 0.6 * Math.sin(p * Math.PI * 0.9 + 0.2));
      ctx.lineWidth = a.wid === "rapier" ? 3 : 5; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + len, 0); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(6 + len, -6); ctx.lineTo(6 + len + 14, 0); ctx.lineTo(6 + len, 6); ctx.fill();
      ctx.globalAlpha *= 0.4; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(6 + len * 0.8, -1); ctx.moveTo(6, 5); ctx.lineTo(6 + len * 0.8, 1); ctx.stroke();
    } else if (a.s.bash) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.5 * (1 - p); ctx.beginPath(); ctx.arc(22, 0, 14 + p * 20, 0, 7); ctx.fill();
    } else {
      const fr = a.t / a.dur, b0 = wdA.a0 || 0.22;
      if (fr >= b0 * 0.8) {
        const cur = swingAng(a), prv = swingAng({ idx: a.idx, wid: a.wid, dur: a.dur, t: Math.max(0, a.t - 0.075) });
        const Rr = 16 + a.s.reach * 0.8, r0 = Rr * 0.42, ccw = cur < prv;
        ctx.translate(4, -2);
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.5 * (1 - p * 0.5);
        const gr = ctx.createRadialGradient(0, 0, r0, 0, 0, Rr); gr.addColorStop(0, rgba(wdA.col.length === 7 ? wdA.col : "#ffffff", 0)); gr.addColorStop(1, a.wid === "fireblade" ? "#ff9a3a" : col);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, Rr, prv, cur, ccw); ctx.arc(0, 0, r0, cur, prv, !ccw); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.95 * (1 - p * 0.5); ctx.strokeStyle = "#fff"; ctx.lineWidth = a.wid === "hammer" ? 4 : 2;
        ctx.beginPath(); ctx.arc(0, 0, Rr, prv, cur, ccw); ctx.stroke();
        if (a.wid === "fireblade") addLight(cx + P.face * 30, P.y + 14, 90, 0.6);
      }
    }
    ctx.restore();
  }
}

const SWING = { sword: [[-2.3, 0.7], [1.0, -1.9], [-2.9, 1.3]], dagger: [[-0.7, 0.15], [0.6, -0.2], [-0.7, 0.15], [-1.5, 0.7]], hammer: [[-2.7, 1.1], [-2.9, 1.4]], spear: [[0, 0], [0, 0]], rapier: [[0, 0], [0, 0]], whip: [[0, 0], [0, 0], [0, 0]], fireblade: [[-2.3, 0.7], [1.0, -1.9], [-2.9, 1.3]], flail: [[-2.8, 2.6], [-2.9, 3.0]], katana: [[-2.2, 0.9], [1.0, -1.7], [-0.4, -0.1]], scythe: [[-3.0, 1.2], [1.6, -2.4]] };
function swingAng(a) {
  const wd = WEAPONS[a.wid], fr = clamp(a.t / a.dur, 0, 1), a0 = wd.a0 || 0.22, a1 = wd.a1 || 0.72;
  const pr = SWING[a.wid] || SWING.sword, pose = pr[Math.min(a.idx, pr.length - 1)], rest = -0.9;
  if (fr < a0) { const u = fr / a0; return rest + (pose[0] - rest) * (1 - (1 - u) * (1 - u)); }
  if (fr < a1) { const u = (fr - a0) / (a1 - a0); return pose[0] + (pose[1] - pose[0]) * (1 - Math.pow(1 - u, 2.2)); }
  const u = (fr - a1) / (1 - a1); return pose[1] + (rest - pose[1]) * (1 - (1 - u) * (1 - u));
}
function drawSwingWeapon(cx, y, f, w, wd) {
  const a = P.atk, fr = a.t / a.dur, a0 = wd.a0 || 0.22, a1 = wd.a1 || 0.72, strike = fr >= a0 && fr <= a1;
  const ang = swingAng(a), thrust = w.id === "spear" || w.id === "dagger" || w.id === "rapier" || w.id === "whip";
  const len = WLEN[w.id] || 27;
  let off = 0;
  if (thrust) off = fr < a0 ? -7 * (fr / a0) : strike ? -7 + 27 * ((fr - a0) / (a1 - a0)) : 20 * (1 - (fr - a1) / (1 - a1));
  ctx.save(); ctx.translate(cx + f * 4, y + 14); ctx.scale(f, 1);
  if (strike && !thrust) {
    for (let k = 3; k >= 1; k--) {
      const a2 = swingAng({ idx: a.idx, wid: a.wid, dur: a.dur, t: Math.max(0, a.t - k * 0.022) });
      ctx.save(); ctx.rotate(a2); ctx.globalAlpha = 0.28 / k; drawBlade(w.id, wd.col, len, false); ctx.restore();
    }
  }
  ctx.rotate(thrust ? (w.id === "dagger" ? ang * 0.5 : 0) : ang);
  ctx.translate(off, 0);
  if (strike) { ctx.shadowColor = wd.col; ctx.shadowBlur = 12; }
  drawBlade(w.id, wd.col, len, strike);
  if (w.id === "dagger") { ctx.translate(-4, 5); drawBlade("dagger", wd.col, 13, strike); }
  ctx.restore();
}

function limb(x1, y1, x2, y2, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function drawEnemy(e) {
  const cx = e.x + e.w / 2, x = Math.round(e.x), y = Math.round(e.y), f = e.face;
  const fl = e.flash > 0;
  const wind = e.state === "wind" || e.state === "windC" || e.state === "windS" || e.state === "windM" || e.state === "windR" || e.state === "windW" || e.state === "fuse";
  const frozen = e.st.freeze > 0;
  const col = (c) => (fl ? "#ffffff" : frozen ? mixc(c, "#9fd8ff", 0.55) : c);
  const walk = Math.abs(e.vx) > 15 && !frozen ? Math.sin(time * 12 + e.bob) : 0;
  const fy = e.y + e.h;
  if (!e.fly && e.onGround) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(cx, fy, e.w * 0.6 * (e.elite ? 1.25 : 1), 3, 0, 0, 7); ctx.fill(); }
  ctx.save();
  if (e.state === "sleep") ctx.globalAlpha = 0.85;
  if (e.tpIn > 0) ctx.globalAlpha = Math.max(0.1, 1 - e.tpIn / 0.45);
  const sc = e.elite ? 1.25 : 1, sqx = 1 + (1 - e.sq) * 0.6, sqy = e.sq;
  if (sc !== 1 || e.sq !== 1) { ctx.translate(cx, fy); ctx.scale(sc * sqx, sc * sqy); ctx.translate(-cx, -fy); }
  if (wind && !e.boss) { ctx.shadowColor = Math.floor(time * 16) % 2 ? "#ff3030" : "#ffd23f"; ctx.shadowBlur = 14; }
  else if (e.elite) { ctx.shadowColor = "#ffcc33"; ctx.shadowBlur = 8 + 4 * Math.sin(time * 5); }
  if (e.elite) addLight(cx, e.y + e.h / 2, 90, 0.4);
  if (e.type === "mage" || e.type === "bomber") addLight(cx, e.y + 6, 60, 0.4);

  if (e.type === "zombie") {
    const hip = y + 18, lean = wind ? -0.15 : e.state === "strike" ? 0.35 : 0.2;
    limb(cx - 2, hip, cx - 4 + walk * 5, y + e.h, 4, col("#1e2a1e"));
    limb(cx + 2, hip, cx + 4 - walk * 5, y + e.h, 4, col("#263626"));
    ctx.save(); ctx.translate(cx, hip); ctx.rotate(lean * f);
    ctx.fillStyle = col("#3f5a3f"); ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(8, -13); ctx.lineTo(-6, -12); ctx.fill();
    ctx.fillStyle = col("#2e432e"); ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-3, 4); ctx.lineTo(0, 0); ctx.lineTo(4, 5); ctx.lineTo(7, 0); ctx.fill();
    ctx.fillStyle = col("#5f7f5f"); ctx.fillRect(f > 0 ? 5 : -7, -13, 2, 12);
    ctx.fillStyle = col("#6f8f6f"); ctx.beginPath(); ctx.arc(f * 4, -16, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffd23f"; ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 6; ctx.fillRect(f * 6 - 1, -17, 3, 2); ctx.shadowBlur = 0;
    const armA = wind ? -1.3 : e.state === "strike" ? 0.6 : 0.15 + Math.sin(time * 4 + e.bob) * 0.15;
    limb(f * 2, -10, f * 2 + f * Math.cos(armA) * 13, -10 + Math.sin(armA) * 13, 3.5, col("#4f6e4f"));
    limb(-f * 1, -10, -f * 1 + f * Math.cos(armA + 0.3) * 11, -9 + Math.sin(armA + 0.3) * 11, 3, col("#3f5a3f"));
    ctx.restore();
    if (e.state === "strike") { ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(f > 0 ? e.x + e.w : e.x - 34, y + 4, 34, 20); }
  } else if (e.type === "archer") {
    const hip = y + 19;
    limb(cx - 2, hip, cx - 4 + walk * 4, y + e.h, 2.5, col("#c8ccd8"));
    limb(cx + 2, hip, cx + 3 - walk * 4, y + e.h, 2.5, col("#b0b6c6"));
    ctx.fillStyle = col("#3a2a4a"); ctx.beginPath(); ctx.moveTo(cx - 7, hip + 2); ctx.lineTo(cx + 7, hip + 2); ctx.lineTo(cx + 5, y + 9); ctx.lineTo(cx - 5, y + 9); ctx.fill();
    ctx.strokeStyle = col("#e6e9f2"); ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 4, y + 11 + i * 3); ctx.lineTo(cx + 4, y + 11 + i * 3); ctx.stroke(); }
    ctx.fillStyle = col("#eef1fa"); ctx.beginPath(); ctx.arc(cx + f, y + 5, 6, 0, 7); ctx.fill(); ctx.fillRect(cx - 3 + f, y + 8, 7, 3);
    ctx.fillStyle = "#ff4d6d"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 6; ctx.fillRect(cx + f * 3 - 1, y + 4, 2, 2); ctx.fillRect(cx + f * 0 - 1, y + 4, 2, 2); ctx.shadowBlur = 0;
    ctx.fillStyle = col("#5a3a2a"); ctx.fillRect(cx - f * 7 - 2, y + 7, 4, 12);
    ctx.strokeStyle = fl ? "#fff" : "#a5703a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx + f * 8, y + 14, 12, f > 0 ? -1.3 : Math.PI - 1.3, f > 0 ? 1.3 : Math.PI + 1.3); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1; const pull = e.state === "wind" ? 8 : 0;
    ctx.beginPath(); ctx.moveTo(cx + f * 8 + Math.cos(1.3) * 12 * f, y + 14 - Math.sin(1.3) * 12); ctx.lineTo(cx + f * (8 - pull), y + 14); ctx.lineTo(cx + f * 8 + Math.cos(1.3) * 12 * f, y + 14 + Math.sin(1.3) * 12); ctx.stroke();
    limb(cx, y + 11, cx + f * 8, y + 14, 2, col("#d6dcec"));
    if (e.state === "wind") { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + f * (8 - pull), y + 14); ctx.lineTo(cx + f * 24, y + 14); ctx.stroke(); }
  } else if (e.type === "bat") {
    const fl2 = Math.sin(time * 18 + e.bob) * 7;
    ctx.fillStyle = col("#5a2a8a");
    ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx - 20, y - 4 + fl2); ctx.lineTo(cx - 8, y + 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx + 20, y - 4 + fl2); ctx.lineTo(cx + 8, y + 12); ctx.fill();
    ctx.fillStyle = col("#3a1a5a"); ctx.beginPath(); ctx.ellipse(cx, y + 8, 7, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff4d6d"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 6; ctx.fillRect(cx - 4, y + 6, 2, 2); ctx.fillRect(cx + 2, y + 6, 2, 2); ctx.shadowBlur = 0;
  } else if (e.type === "brute") {
    const hip = y + 28;
    limb(cx - 6, hip, cx - 8 + walk * 4, y + e.h, 7, col("#1e1414"));
    limb(cx + 6, hip, cx + 8 - walk * 4, y + e.h, 7, col("#2a1a1a"));
    ctx.fillStyle = col("#5a2222"); ctx.beginPath(); ctx.moveTo(cx - 13, hip + 2); ctx.lineTo(cx + 13, hip + 2); ctx.lineTo(cx + 16, y + 10); ctx.lineTo(cx - 16, y + 10); ctx.fill();
    ctx.fillStyle = col("#3a1616"); ctx.fillRect(cx - 13, hip - 4, 26, 4);
    ctx.fillStyle = col("#8a8f9f"); ctx.beginPath(); ctx.ellipse(cx - 13, y + 11, 8, 6, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 13, y + 11, 8, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(cx - 18, y + 7, 8, 2); ctx.fillRect(cx + 8, y + 7, 8, 2);
    ctx.fillStyle = col("#4a4f60"); ctx.beginPath(); ctx.arc(cx + f * 2, y + 6, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 6 + f * 2, y + 6, 16, 6);
    ctx.fillStyle = col("#c8c0a8"); ctx.beginPath(); ctx.moveTo(cx - 6, y + 1); ctx.lineTo(cx - 12, y - 8); ctx.lineTo(cx - 3, y - 1); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx + 8, y + 1); ctx.lineTo(cx + 14, y - 8); ctx.lineTo(cx + 5, y - 1); ctx.fill();
    ctx.fillStyle = "#ff4d6d"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 8; ctx.fillRect(cx + f * 4 - 3, y + 6, 6, 2); ctx.shadowBlur = 0;
    const up = e.state === "wind";
    ctx.save(); ctx.translate(cx + f * 14, y + 14); ctx.rotate(up ? -f * 1.9 : e.state === "strike" ? f * 1.2 : f * 0.2);
    rect(-3, -2, 6, 30, col("#555a70")); ctx.fillStyle = col("#7a7f95"); ctx.beginPath(); ctx.moveTo(-9, 22); ctx.lineTo(9, 22); ctx.lineTo(11, 38); ctx.lineTo(-11, 38); ctx.fill();
    ctx.fillStyle = "#c8ccd8"; for (let k = -8; k <= 8; k += 4) ctx.fillRect(k, 38, 2, 3);
    ctx.restore();
  } else if (e.type === "bomber") {
    const fz = e.state === "fuse" && Math.floor(time * 18) % 2 === 0;
    limb(cx - 3, y + 18, cx - 4 + walk * 4, y + e.h, 3, col("#3a1a1a")); limb(cx + 3, y + 18, cx + 4 - walk * 4, y + e.h, 3, col("#3a1a1a"));
    ctx.fillStyle = col(fz ? "#ffffff" : "#c23b2e"); ctx.beginPath(); ctx.arc(cx, y + 12, e.state === "fuse" ? 12 : 11, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.arc(cx - 4, y + 8, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffd23f"; ctx.fillRect(cx + (f > 0 ? 2 : -7), y + 9, 5, 3);
    ctx.strokeStyle = "#a5703a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y + 1); ctx.quadraticCurveTo(cx + 4 * f, y - 6, cx + 2 * f, y - 9); ctx.stroke();
    if (Math.floor(time * 20) % 2 === 0) { ctx.fillStyle = "#ffd23f"; ctx.fillRect(cx + 2 * f - 2, y - 12, 4, 4); }
    if (e.state === "fuse") { ctx.globalCompositeOperation = "lighter"; glow(cx, y + 12, 50, "#ff4d1a", 0.5); ctx.globalCompositeOperation = "source-over"; }
  } else if (e.type === "shield") {
    const hip = y + 24;
    limb(cx - 3, hip, cx - 5 + walk * 3, y + e.h, 4.5, col("#2a3040")); limb(cx + 3, hip, cx + 4 - walk * 3, y + e.h, 4.5, col("#343c50"));
    ctx.fillStyle = col("#51607f"); ctx.beginPath(); ctx.moveTo(cx - 8, hip + 2); ctx.lineTo(cx + 8, hip + 2); ctx.lineTo(cx + 9, y + 11); ctx.lineTo(cx - 9, y + 11); ctx.fill();
    ctx.fillStyle = col("#3a4560"); ctx.fillRect(cx - 9, y + 17, 18, 3);
    ctx.fillStyle = col("#7d8cab"); ctx.beginPath(); ctx.arc(cx, y + 7, 7, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 7, y + 7, 14, 5);
    ctx.fillStyle = col("#ff2e97"); ctx.beginPath(); ctx.moveTo(cx - 2, y); ctx.quadraticCurveTo(cx - f * 10, y - 8, cx - f * 12, y + 2); ctx.lineTo(cx + 2, y + 1); ctx.fill();
    ctx.fillStyle = "#ff4d6d"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 6; ctx.fillRect(cx + (f > 0 ? 0 : -6), y + 7, 6, 2); ctx.shadowBlur = 0;
    ctx.strokeStyle = col("#a5703a"); ctx.lineWidth = 2.5; const adv0 = e.state === "strike" ? 14 : 0;
    ctx.beginPath(); ctx.moveTo(cx - f * 6, y + 16); ctx.lineTo(cx + f * (16 + adv0), y + 16); ctx.stroke();
    ctx.fillStyle = col("#e8eef8"); ctx.beginPath(); ctx.moveTo(cx + f * (16 + adv0), y + 12); ctx.lineTo(cx + f * (24 + adv0), y + 16); ctx.lineTo(cx + f * (16 + adv0), y + 20); ctx.fill();
    const adv = e.state === "strike" ? 8 : e.state === "wind" ? -4 : 0, sx0 = cx + f * (11 + adv) - 5;
    ctx.fillStyle = col("#b9c8ea"); ctx.beginPath(); ctx.moveTo(sx0, y + 4); ctx.lineTo(sx0 + 10, y + 4); ctx.lineTo(sx0 + 10, y + 28); ctx.lineTo(sx0 + 5, y + 34); ctx.lineTo(sx0, y + 28); ctx.fill();
    ctx.fillStyle = col("#ffffff"); ctx.fillRect(sx0, y + 4, 10, 2); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(f > 0 ? sx0 + 7 : sx0, y + 6, 3, 22);
    ctx.fillStyle = col("#ffd23f"); ctx.fillRect(sx0 + 4, y + 10, 2, 14); ctx.fillRect(sx0 + 2, y + 14, 6, 2);
    if (e.state === "wind") { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - f * 4, y + 16); ctx.lineTo(cx - f * 22, y + 8); ctx.stroke(); }
    if (e.state === "strike") { ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(f > 0 ? e.x + e.w : e.x - 52, y + 12, 52, 8); }
  } else if (e.type === "mage") {
    const lev = Math.sin(time * 3 + e.bob) * 2 - 2;
    ctx.translate(0, lev);
    const fl3 = Math.sin(time * 6 + e.bob) * 2;
    ctx.fillStyle = col("#2b1a50"); ctx.beginPath(); ctx.moveTo(cx - 11 - fl3, y + 32); ctx.lineTo(cx - 6, y + 10); ctx.lineTo(cx + 6, y + 10); ctx.lineTo(cx + 11 + fl3, y + 32); ctx.lineTo(cx + 4, y + 29); ctx.lineTo(cx, y + 32); ctx.lineTo(cx - 4, y + 29); ctx.fill();
    ctx.fillStyle = col("#3b2468"); ctx.beginPath(); ctx.moveTo(cx - 6, y + 10); ctx.lineTo(cx + 6, y + 10); ctx.lineTo(cx + 3, y + 26); ctx.lineTo(cx - 3, y + 26); ctx.fill();
    ctx.fillStyle = col("#b58bff"); ctx.fillRect(cx - 1, y + 12, 2, 13);
    ctx.fillStyle = col("#4a2a8a"); ctx.beginPath(); ctx.arc(cx, y + 6, 7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 6, y + 4); ctx.lineTo(cx - f * 3, y - 9); ctx.lineTo(cx + 6, y + 4); ctx.fill();
    ctx.fillStyle = "#05030c"; ctx.beginPath(); ctx.ellipse(cx + f * 2, y + 7, 4, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e6d4ff"; ctx.shadowColor = "#b58bff"; ctx.shadowBlur = 6; ctx.fillRect(cx + f * 2 - 3, y + 6, 2, 2); ctx.fillRect(cx + f * 2 + 1, y + 6, 2, 2); ctx.shadowBlur = 0;
    ctx.strokeStyle = "#a5703a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + f * 11, y + 34); ctx.lineTo(cx + f * 11, y + 4); ctx.stroke();
    limb(cx + f * 3, y + 13, cx + f * 11, y + 16, 2.5, col("#3b2468"));
    const rr = e.state === "wind" ? 4 + (1 - Math.max(0, e.t) / 0.7) * 6 : 4;
    ctx.globalCompositeOperation = "lighter"; glow(cx + f * 11, y + 2, 16 + rr * 2, "#b58bff", e.state === "wind" ? 0.9 : 0.5); ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#e6d4ff"; ctx.beginPath(); ctx.arc(cx + f * 11, y + 2, rr, 0, 7); ctx.fill();
    if (e.state === "wind") for (let k = 0; k < 3; k++) { const a = time * 8 + k * 2.1; ctx.fillStyle = "#b58bff"; ctx.fillRect(cx + f * 11 + Math.cos(a) * 12, y + 2 + Math.sin(a) * 12, 2, 2); }
  } else if (e.type === "leaper") {
    const cr = e.state === "wind" ? 0.7 : e.state === "leap" ? 1.2 : 1;
    ctx.translate(cx, y + e.h); ctx.scale(e.state === "leap" ? 0.85 : 1 / cr * 1.05, cr); ctx.translate(-cx, -(y + e.h));
    rect(cx - 9, y + 6, 18, 12, col("#7a5a3a"));
    rect(cx - 7, y, 14, 9, col("#a07a4a")); rect(cx + (f > 0 ? 1 : -6), y + 3, 5, 3, col("#ffd23f"));
    rect(cx - 12, y + 16, 7, 6, col("#5a3f26")); rect(cx + 5, y + 16, 7, 6, col("#5a3f26"));
    ctx.strokeStyle = col("#7a5a3a"); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - f * 9, y + 12); ctx.quadraticCurveTo(cx - f * 18, y + 4, cx - f * 14, y - 4); ctx.stroke();
  } else if (e.type === "slime" || e.type === "slimeS") {
    const sq = 1 + Math.sin(time * 8 + e.bob) * 0.12;
    ctx.translate(cx, y + e.h); ctx.scale(sq, 2 - sq); ctx.translate(-cx, -(y + e.h));
    ctx.fillStyle = col("#3dff9a"); ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.moveTo(x, y + e.h); ctx.quadraticCurveTo(x, y, cx, y); ctx.quadraticCurveTo(x + e.w, y, x + e.w, y + e.h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = col("#c8ffe3"); ctx.fillRect(cx - e.w * 0.28, y + e.h * 0.3, 3, 3); ctx.fillRect(cx + e.w * 0.12, y + e.h * 0.3, 3, 3);
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(x + 4, y + 3, 5, 2);
  } else if (e.type === "charger") {
    const pw = e.state === "wind" ? Math.sin(time * 30) * 2 : 0;
    rect(cx - 17 + walk * 3, y + 20, 8, 8, col("#3a2418")); rect(cx + 9 - walk * 3, y + 20, 8, 8, col("#3a2418"));
    rect(cx - 20, y + 6 + pw, 40, 18, col("#6a4a30"));
    rect(cx + f * 12 - 9, y + 2 + pw, 18, 16, col("#7d5a3a"));
    ctx.fillStyle = col("#e8e0d0"); ctx.beginPath(); ctx.moveTo(cx + f * 22, y + 4 + pw); ctx.lineTo(cx + f * 34, y - 2 + pw); ctx.lineTo(cx + f * 22, y + 12 + pw); ctx.fill();
    rect(cx + f * 14 - 2, y + 6 + pw, 4, 3, col("#ff4d6d"));
    if (e.state === "charge") { ctx.strokeStyle = "rgba(255,200,120,.5)"; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { const ly = y + 6 + k * 8, lx0 = f > 0 ? e.x - 6 : e.x + e.w + 6; ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx0 - f * (20 + ((k * 37 + time * 300) % 30)), ly); ctx.stroke(); } }
  } else if (e.type === "grenadier") {
    rect(cx - 6 + walk * 2, y + 21, 5, 9, col("#3a2a1a")); rect(cx + 1 - walk * 2, y + 21, 5, 9, col("#3a2a1a"));
    rect(cx - 8, y + 9, 16, 13, col("#7a5a30")); rect(cx - 8, y + 13, 16, 2, col("#3a2614"));
    for (let i = 0; i < 3; i++) { ctx.fillStyle = col("#3a4a2a"); ctx.beginPath(); ctx.arc(cx - 5 + i * 5, y + 18, 2, 0, 7); ctx.fill(); }
    rect(cx - 7, y, 14, 10, col("#9a7a40")); rect(cx - 8, y - 1, 16, 4, col("#5a4a2a"));
    rect(cx + (f > 0 ? 1 : -6), y + 4, 5, 2, col("#ff8a3a"));
    const up = e.state === "wind";
    ctx.save(); ctx.translate(cx - f * 4, y + 11); ctx.rotate(up ? -f * 2.4 : f * 0.4);
    rect(-2, -2, 4, 12, col("#7a5a30"));
    ctx.fillStyle = col("#2a2a32"); ctx.beginPath(); ctx.arc(0, 12, 5, 0, 7); ctx.fill();
    if (up && Math.floor(time * 20) % 2) { ctx.fillStyle = "#ffd23f"; ctx.fillRect(-1, 15, 3, 3); }
    ctx.restore();
  } else if (e.type === "archi") {
    const bi = BOSSINFO.archi, acc = e.phase === 3 ? bi.c3 : bi.col, b = Math.sin(time * 2.4) * 2, rest = e.state === "rest";
    addLight(cx, y + 24, 240, 0.7);
    ctx.globalCompositeOperation = "lighter"; glow(cx, y + 24, 110, acc, 0.22 + (wind ? 0.25 : 0)); ctx.globalCompositeOperation = "source-over";
    // livres en orbite
    for (let k = 0; k < 5; k++) {
      const a = time * (1.4 + e.phase * 0.4) + k * 1.257, ox = Math.cos(a) * 42, oy = Math.sin(a) * 14;
      if (oy < 0) continue;
      ctx.fillStyle = ["#7a3a5a", "#3a5a8a", "#6a5a2a", "#4a2a7a", "#2a6a5a"][k]; ctx.fillRect(cx + ox - 6, y + 26 + oy + b - 4, 12, 9);
      ctx.fillStyle = "#efe4c4"; ctx.fillRect(cx + ox - 5, y + 26 + oy + b - 3, 10, 2);
    }
    // robe flottante en lambeaux
    const fl3 = Math.sin(time * 5) * 3;
    ctx.fillStyle = col("#1e1236");
    ctx.beginPath(); ctx.moveTo(cx - 14, y + 16 + b);
    for (let k = 0; k <= 6; k++) ctx.lineTo(cx - 18 + k * 6 + (k % 2 ? fl3 : -fl3), y + e.h + (k % 2 ? -6 : 4) + b + (rest ? -6 : 0));
    ctx.lineTo(cx + 14, y + 16 + b); ctx.fill();
    ctx.fillStyle = col("#2e1c52"); ctx.beginPath(); ctx.moveTo(cx - 12, y + 16 + b); ctx.lineTo(cx + 12, y + 16 + b); ctx.lineTo(cx + 8, y + 44 + b); ctx.lineTo(cx - 8, y + 44 + b); ctx.fill();
    ctx.fillStyle = col("#c9a54a"); ctx.fillRect(cx - 12, y + 16 + b, 24, 2); ctx.fillRect(cx - 1, y + 18 + b, 2, 26);
    // bras levés
    const up = wind || e.state === "dive";
    limb(cx - 10, y + 20 + b, cx - 20, y + (up ? 4 : 30) + b, 4, col("#2e1c52"));
    limb(cx + 10, y + 20 + b, cx + 20, y + (up ? 4 : 30) + b, 4, col("#2e1c52"));
    ctx.fillStyle = acc; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(cx - 20, y + (up ? 4 : 30) + b, 4, 0, 7); ctx.arc(cx + 20, y + (up ? 4 : 30) + b, 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    // capuche et masque
    ctx.fillStyle = col("#241640"); ctx.beginPath(); ctx.arc(cx, y + 10 + b, 11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 10, y + 8 + b); ctx.lineTo(cx, y - 10 + b); ctx.lineTo(cx + 10, y + 8 + b); ctx.fill();
    ctx.fillStyle = col("#e8e0f4"); ctx.beginPath(); ctx.ellipse(cx + f * 2, y + 11 + b, 6, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = rest ? "#555" : acc; ctx.shadowColor = acc; ctx.shadowBlur = rest ? 0 : 10;
    ctx.fillRect(cx + f * 2 - 4, y + 9 + b, 3, 2); ctx.fillRect(cx + f * 2 + 1, y + 9 + b, 3, 2); ctx.shadowBlur = 0;
    // livre ouvert au-dessus de la tête
    ctx.save(); ctx.translate(cx, y - 18 + b * 1.5); ctx.rotate(Math.sin(time * 1.5) * 0.15);
    ctx.fillStyle = "#4a2a7a"; ctx.fillRect(-14, -2, 28, 12); ctx.fillStyle = "#efe4c4"; ctx.fillRect(-12, -4, 11, 12); ctx.fillRect(1, -4, 11, 12);
    ctx.fillStyle = acc; for (let k = 0; k < 3; k++) { ctx.fillRect(-10, -1 + k * 3, 7, 1); ctx.fillRect(3, -1 + k * 3, 7, 1); }
    ctx.restore();
    ctx.globalCompositeOperation = "lighter"; glow(cx, y - 16 + b, 26, acc, 0.5); ctx.globalCompositeOperation = "source-over";
    for (let k = 0; k < 5; k++) {
      const a = time * (1.4 + e.phase * 0.4) + k * 1.257, ox = Math.cos(a) * 42, oy = Math.sin(a) * 14;
      if (oy >= 0) continue;
      ctx.fillStyle = ["#7a3a5a", "#3a5a8a", "#6a5a2a", "#4a2a7a", "#2a6a5a"][k]; ctx.fillRect(cx + ox - 5, y + 26 + oy + b - 3, 10, 7);
    }
    if (rest) { ctx.fillStyle = "#ffd23f"; for (let i = 0; i < 3; i++) { const a = time * 7 + i * 2.1; ctx.fillRect(cx + Math.cos(a) * 16 - 2, y - 26 + Math.sin(a) * 4, 4, 4); } }
  } else if (e.type === "matri") {
    const bi = BOSSINFO.matri, acc = e.phase === 3 ? bi.c3 : bi.col, fy0 = y + e.h;
    addLight(cx, y + 30, 240, 0.65);
    const wob = Math.sin(time * 4) * 0.04, sq = (e.state === "windJ" ? 0.8 : e.state === "air" ? 1.15 : 1) + wob;
    ctx.save(); ctx.translate(cx, fy0); ctx.scale(1 / sq, sq); ctx.translate(-cx, -fy0);
    const g = ctx.createRadialGradient(cx - 16, y + 16, 6, cx, y + 36, 60);
    g.addColorStop(0, fl ? "#ffffff" : mixc(acc, "#ffffff", 0.45)); g.addColorStop(0.6, fl ? "#ffffff" : acc); g.addColorStop(1, fl ? "#ffffff" : mixc(acc, "#000000", 0.55));
    ctx.fillStyle = g; ctx.globalAlpha *= 0.9;
    ctx.beginPath(); ctx.moveTo(e.x - 4, fy0);
    ctx.bezierCurveTo(e.x - 8, y + 10, e.x + e.w * 0.25, y - 6, cx, y - 4);
    ctx.bezierCurveTo(e.x + e.w * 0.75, y - 6, e.x + e.w + 8, y + 10, e.x + e.w + 4, fy0);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // bulles et squelettes avalés
    for (let k = 0; k < 6; k++) { const bx = cx + Math.sin(time * 0.8 + k * 2) * 28, by = y + 40 - ((time * 18 + k * 13) % 40); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 2 + k % 3, 0, 7); ctx.stroke(); }
    ctx.fillStyle = "rgba(220,230,200,.35)"; ctx.beginPath(); ctx.arc(cx - 22, y + 40, 6, 0, 7); ctx.fill(); ctx.fillRect(cx + 14, y + 44, 14, 3); ctx.fillRect(cx + 18, y + 40, 3, 10);
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.ellipse(cx - 22, y + 10, 10, 5, -0.5, 0, 7); ctx.fill();
    // yeux et bouche
    const ex2 = cx + f * 12, ey2 = y + 18;
    for (const o of [-11, 11]) { ctx.fillStyle = "#0a1a10"; ctx.beginPath(); ctx.ellipse(ex2 + o, ey2, 7, wind ? 3 : 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = e.state === "rest" ? "#888" : "#fff8a0"; ctx.shadowColor = "#fff8a0"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(ex2 + o + f * 2, ey2 + 1, 2.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    ctx.fillStyle = "#0a1a10"; ctx.beginPath(); ctx.ellipse(ex2, y + 34, e.state === "windS" ? 12 : 9, e.state === "windS" ? 8 : 3, 0, 0, 7); ctx.fill();
    // couronne rouillée
    ctx.fillStyle = col("#c9a54a"); ctx.beginPath(); ctx.moveTo(cx - 16, y); for (let k = 0; k < 5; k++) { ctx.lineTo(cx - 16 + k * 8 + 4, y - 12); ctx.lineTo(cx - 16 + k * 8 + 8, y); } ctx.fill();
    ctx.fillStyle = "#ff2e97"; ctx.fillRect(cx - 2, y - 6, 4, 4);
    ctx.restore();
    // gouttes qui tombent
    if (Math.random() < 0.2) parts.push({ x: e.x + Math.random() * e.w, y: y + e.h * 0.6, vx: 0, vy: 30, life: 0.5, max: 0.5, col: acc, size: 3, grav: 900 });
    if (e.state === "rest") { ctx.fillStyle = "#ffd23f"; for (let i = 0; i < 3; i++) { const a = time * 7 + i * 2.1; ctx.fillRect(cx + Math.cos(a) * 20 - 2, y - 22 + Math.sin(a) * 4, 4, 4); } }
  } else if (e.type === "boss") {
    if (e.state === "windW") {                                        // télégraphe du balayage
      ctx.save(); ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 30);
      ctx.fillStyle = "#ff2e97"; ctx.fillRect(T, e.sweepY + 7, (COLS - 2) * T, 3);
      ctx.globalAlpha = 0.12; ctx.fillRect(T, e.sweepY, (COLS - 2) * T, 18);
      ctx.restore();
    }
    if (e.state === "roar") { ctx.globalCompositeOperation = "lighter"; glow(cx, y + 30, 160 + Math.sin(time * 30) * 20, e.phase === 3 ? "#ff2e97" : "#ffb020", 0.4); ctx.globalCompositeOperation = "source-over"; }
    addLight(cx, y + 30, 260, 0.7);
    const ph2 = e.phase >= 3, acc = ph2 ? "#ff2e97" : "#ffb020", hip = y + 50, br = e.state === "sleep" ? 0 : Math.sin(time * 3) * 1.5;
    ctx.globalCompositeOperation = "lighter";
    glow(cx, y + 34, 130, acc, 0.2 + (wind ? 0.22 : 0));
    ctx.globalCompositeOperation = "source-over";
    // jambes massives
    limb(cx - 10, hip, cx - 13 + walk * 6, y + e.h - 2, 11, col("#140f1c"));
    limb(cx + 10, hip, cx + 13 - walk * 6, y + e.h - 2, 11, col("#1c1526"));
    rect(cx - 21 + walk * 6, y + e.h - 6, 16, 6, col("#3a2f4a")); rect(cx + 5 - walk * 6, y + e.h - 6, 16, 6, col("#3a2f4a"));
    // manteau de geôlier
    ctx.fillStyle = col("#1e1628");
    ctx.beginPath(); ctx.moveTo(cx - 30, hip + 12); ctx.lineTo(cx - 26, y + 18 + br); ctx.lineTo(cx + 26, y + 18 + br); ctx.lineTo(cx + 30, hip + 12); ctx.lineTo(cx + 18, hip + 6); ctx.lineTo(cx + 6, hip + 14); ctx.lineTo(cx - 6, hip + 6); ctx.lineTo(cx - 18, hip + 14); ctx.fill();
    ctx.fillStyle = col("#2c2238"); ctx.fillRect(cx - 22, y + 20 + br, 44, 28);
    ctx.fillStyle = col("#c9a54a"); ctx.fillRect(cx - 22, hip - 4, 44, 4);
    for (let k = -2; k <= 2; k++) {                                     // trousseau de clés à la ceinture
      ctx.strokeStyle = col("#c9a54a"); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + k * 8, hip + 3 + Math.abs(k), 3, 0, 7); ctx.stroke();
      ctx.fillStyle = col("#c9a54a"); ctx.fillRect(cx + k * 8 - 1, hip + 5 + Math.abs(k), 2, 7);
    }
    // cœur-lanterne
    const lp = 0.7 + 0.3 * Math.sin(time * (ph2 ? 10 : 5));
    ctx.fillStyle = "#120c06"; ctx.fillRect(cx - 7, y + 26 + br, 14, 16);
    ctx.fillStyle = e.state === "sleep" ? "#5a3a10" : acc; ctx.globalAlpha *= lp; ctx.fillRect(cx - 5, y + 28 + br, 10, 12); ctx.globalAlpha /= lp;
    ctx.strokeStyle = col("#c9a54a"); ctx.lineWidth = 1.5; ctx.strokeRect(cx - 7, y + 26 + br, 14, 16); ctx.beginPath(); ctx.moveTo(cx, y + 26 + br); ctx.lineTo(cx, y + 42 + br); ctx.stroke();
    if (e.state !== "sleep") { ctx.globalCompositeOperation = "lighter"; glow(cx, y + 34 + br, 34, acc, 0.6 * lp); ctx.globalCompositeOperation = "source-over"; }
    // épaulières à pointes
    for (const sd of [-1, 1]) {
      ctx.fillStyle = col("#3a2f4a"); ctx.beginPath(); ctx.ellipse(cx + sd * 25, y + 20 + br, 12, 9, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(cx + sd * 25 - 12, y + 20 + br, 24, 5);
      ctx.fillStyle = col("#c9a54a"); ctx.beginPath(); ctx.moveTo(cx + sd * 25 - 3, y + 12 + br); ctx.lineTo(cx + sd * 30, y + 2 + br); ctx.lineTo(cx + sd * 25 + 3, y + 12 + br); ctx.fill();
    }
    // tête casquée et couronne de clés
    ctx.fillStyle = col("#2c2238"); ctx.beginPath(); ctx.arc(cx + f * 2, y + 10 + br, 12, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 10 + f * 2, y + 10 + br, 24, 10);
    ctx.fillStyle = "#06040a"; ctx.fillRect(cx - 8 + f * 4, y + 9 + br, 16, 5);
    ctx.fillStyle = e.state === "sleep" ? "#6a4a10" : acc;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.fillRect(cx - 6 + f * 5, y + 10 + br, 4, 3); ctx.fillRect(cx + 2 + f * 5, y + 10 + br, 4, 3); ctx.shadowBlur = 0;
    ctx.fillStyle = col("#ffb020");
    for (let k = -2; k <= 2; k++) { const kx = cx + f * 2 + k * 6, kh = 10 - Math.abs(k) * 2; ctx.fillRect(kx - 1, y - 2 - kh + br, 2, kh + 2); ctx.beginPath(); ctx.arc(kx, y - 3 - kh + br, 2.5, 0, 7); ctx.fill(); }
    // la grande clé
    ctx.save(); ctx.translate(cx + f * 28, y + 30 + br);
    ctx.rotate(e.state === "air" ? -f * 2.2 : wind ? -f * 1.6 : e.state === "charge" ? f * 1.4 : f * 0.3);
    limb(0, -6, 0, 6, 7, col("#2c2238"));
    ctx.fillStyle = col("#c9a54a"); ctx.fillRect(-3, -4, 6, 58); ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(-3, -4, 2, 58);
    ctx.fillStyle = col("#c9a54a"); ctx.fillRect(-3, 42, 16, 6); ctx.fillRect(-3, 51, 12, 5); ctx.fillRect(7, 42, 3, 14);
    ctx.strokeStyle = fl ? "#fff" : col("#c9a54a"); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -14, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(0, -14, 3, 0, 7); ctx.fill();
    ctx.restore();
    if (e.state === "charge") { ctx.strokeStyle = "rgba(255,200,120,.5)"; ctx.lineWidth = 2; for (let k = 0; k < 5; k++) { const ly = y + 12 + k * 13, lx0 = f > 0 ? e.x - 10 : e.x + e.w + 10; ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx0 - f * (30 + ((k * 37 + time * 300) % 40)), ly); ctx.stroke(); } }
  }

  ctx.shadowBlur = 0;
  if (frozen) {
    ctx.fillStyle = "rgba(170,225,255,.28)"; ctx.fillRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
    ctx.strokeStyle = "rgba(230,248,255,.8)"; ctx.lineWidth = 1.5; ctx.strokeRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
    ctx.beginPath(); ctx.moveTo(e.x, e.y + 6); ctx.lineTo(e.x + 6, e.y); ctx.moveTo(e.x + e.w - 2, e.y + e.h - 8); ctx.lineTo(e.x + e.w + 2, e.y + e.h - 14); ctx.stroke();
  }
  if (e.st.burn > 0) { ctx.globalCompositeOperation = "lighter"; glow(cx, e.y + e.h * 0.6, e.w + 10, "#ff7a2a", 0.4); ctx.globalCompositeOperation = "source-over"; addLight(cx, e.y + e.h / 2, 80, 0.5); }
  if (e.stun > 0) {                                                   // étoiles d'étourdissement
    ctx.fillStyle = "#ffd23f";
    for (let i = 0; i < 3; i++) { const a = time * 7 + i * 2.1; ctx.fillRect(cx + Math.cos(a) * 11 - 2, y - 10 + Math.sin(a) * 3, 4, 4); }
  } else if (wind && !e.boss) {
    ctx.fillStyle = "#ffd23f"; ctx.font = "bold 16px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("!", cx, y - 8);
  } else if (e.boss && wind) {
    ctx.fillStyle = "#ffd23f"; ctx.font = "bold 22px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("!", cx, y - 20);
  }
  ctx.restore();
  const by = e.y - (e.elite ? e.h * 0.25 + 18 : 14);
  if (e.elite && !e.boss) {
    ctx.textAlign = "center"; ctx.font = "bold 11px 'Share Tech Mono', monospace"; ctx.fillStyle = "#ffcc33";
    ctx.fillText("ÉLITE · " + (ENAME[e.type] || "").toUpperCase(), cx, by - 6);
    rect(cx - 24, by, 48, 4, "#2a0d14"); rect(cx - 24, by, 48 * clamp(e.hp / e.maxHp, 0, 1), 4, "#ffcc33");
  } else if (e.hp < e.maxHp && !e.boss) {
    rect(cx - 13, by, 26, 3, "#2a0d14"); rect(cx - 13, by, 26 * clamp(e.hp / e.maxHp, 0, 1), 3, "#ff4d6d");
  }
  let sx = cx - 10;                                                   // pastilles d'altérations
  for (const [on, c, n] of [[e.st.burn > 0, "#ff8a3a", 0], [e.st.poison > 0, "#8dff5a", e.st.pst], [e.st.bleed > 0, "#ff4d6d", e.st.bst], [frozen, "#9fd8ff", 0]]) {
    if (!on) continue;
    ctx.fillStyle = c; ctx.fillRect(sx, by + 6, 5, 5);
    if (n > 1) { ctx.font = "9px 'Share Tech Mono', monospace"; ctx.textAlign = "left"; ctx.fillText(n, sx + 6, by + 11); sx += 6; }
    sx += 7;
  }
}


function floorBelow(x, y) {
  const c = Math.floor(x / T);
  for (let r = Math.floor(y / T); r < ROWS; r++) if (FLOOR(tileAt(c, r))) return r * T;
  return ROWS * T;
}
function drawShots() {
  for (const s of shots) {
    if (s.delay > 0) {                                                  // zone d'impact annoncée
      if (!s.fy) s.fy = floorBelow(s.x + s.w / 2, s.y + s.h);
      const a = 0.5 + 0.5 * Math.sin(time * 24);
      if (s.kind === "beam") { ctx.fillStyle = `rgba(255,80,220,${0.08 + 0.1 * a})`; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.fillStyle = `rgba(255,120,230,${0.4 + 0.4 * a})`; ctx.fillRect(s.x + s.w / 2 - 1, s.y, 2, s.h); continue; }
      ctx.fillStyle = `rgba(255,60,90,${0.25 + 0.35 * a})`; ctx.fillRect(s.x - 6, s.fy - 4, s.w + 12, 4);
      ctx.globalAlpha = 0.18; ctx.fillStyle = "#ff2e97"; ctx.fillRect(s.x + s.w / 2 - 1, s.y, 2, s.fy - s.y); ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff4d6d"; ctx.beginPath(); ctx.moveTo(s.x + s.w / 2 - 6, s.fy - 16); ctx.lineTo(s.x + s.w / 2 + 6, s.fy - 16); ctx.lineTo(s.x + s.w / 2, s.fy - 8); ctx.fill();
      continue;
    }
    if (s.kind === "wave") {
      ctx.globalCompositeOperation = "lighter";
      glow(s.x + s.w / 2, s.y + s.h / 2, 34, s.col || "#ffb020", 0.7);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = s.col ? mixc(s.col, "#ffffff", 0.3) : "#ffd23f";
      ctx.beginPath(); ctx.moveTo(s.x, s.y + s.h); ctx.lineTo(s.x + s.w / 2, s.y - 4); ctx.lineTo(s.x + s.w, s.y + s.h); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(s.x + 6, s.y + s.h); ctx.lineTo(s.x + s.w / 2, s.y + 4); ctx.lineTo(s.x + s.w - 6, s.y + s.h); ctx.fill();
      addLight(s.x + s.w / 2, s.y, 110, 0.7);
      if (Math.random() < 0.5) dust(s.x + s.w / 2, s.y + s.h, 1);
    } else if (s.kind === "beam") {
      const a = clamp(s.life / 0.22, 0, 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba("#ff2e97", 0.6 * a); ctx.fillRect(s.x, s.y - 6, s.w, s.h + 12);
      ctx.fillStyle = rgba("#ffffff", 0.9 * a); ctx.fillRect(s.x, s.y + 5, s.w, s.h - 10);
      ctx.globalCompositeOperation = "source-over";
      for (let k = 0; k < 8; k++) addLight(s.x + (k + 0.5) * s.w / 8, s.y + 9, 140, 0.8 * a);
    } else if (s.kind === "rock" && s.style === "page") {
      ctx.save(); ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(Math.sin(time * 14 + s.x) * 0.5);
      ctx.fillStyle = "#efe4c4"; ctx.fillRect(-8, -10, 16, 20); ctx.fillStyle = "#b58bff"; for (let k = 0; k < 4; k++) ctx.fillRect(-5, -6 + k * 4, 10 - (k % 2) * 4, 1.5);
      ctx.restore(); addLight(s.x + s.w / 2, s.y + s.h / 2, 50, 0.4);
    } else if (s.kind === "rock") {
      ctx.save(); ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(Math.PI);
      ctx.fillStyle = "#ffb020"; ctx.strokeStyle = "#ffb020"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, -6, 6, 0, 7); ctx.stroke(); ctx.fillRect(-2, -1, 4, 14); ctx.fillRect(2, 8, 5, 3); ctx.fillRect(2, 3, 4, 3);
      ctx.restore();
      addLight(s.x + s.w / 2, s.y + s.h / 2, 60, 0.5);
    } else if (s.kind === "orb") {
      ctx.globalCompositeOperation = "lighter"; glow(s.x + 7, s.y + 7, 28, "#b58bff", 0.8); ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#e6d4ff"; ctx.beginPath(); ctx.arc(s.x + 7, s.y + 7, 5 + Math.sin(time * 20) * 1, 0, 7); ctx.fill();
      addLight(s.x + 7, s.y + 7, 80, 0.6);
    } else if (s.kind === "lob") {
      ctx.fillStyle = "#2a2a32"; ctx.beginPath(); ctx.arc(s.x + 6, s.y + 6, 6, 0, 7); ctx.fill();
      ctx.fillStyle = Math.floor(time * 20) % 2 ? "#ffd23f" : "#ff4d4d"; ctx.fillRect(s.x + 4, s.y - 3, 4, 4);
      addLight(s.x + 6, s.y, 50, 0.5);
    } else if (s.kind === "arrow" || s.kind === "bolt2" || s.kind === "knife") {
      const mine = s.from === "p";
      ctx.save(); ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(Math.atan2(s.vy, s.vx));
      if (s.kind === "knife") { ctx.fillStyle = "#e8eef8"; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(7, 0); ctx.lineTo(-6, 2); ctx.fill(); ctx.fillStyle = "#ff6a8a"; ctx.fillRect(-8, -1.5, 3, 3); }
      else {
        ctx.fillStyle = s.kind === "bolt2" ? "#b0ffd0" : mine ? "#e8d9a0" : "#ffb020"; ctx.fillRect(-s.w / 2, -1.5, s.w, 3);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(s.w / 2, -4); ctx.lineTo(s.w / 2 + 6, 0); ctx.lineTo(s.w / 2, 4); ctx.fill();
        ctx.fillStyle = mine ? "#00f0ff" : "#ff4d6d"; ctx.fillRect(-s.w / 2, -3, 4, 6);
      }
      ctx.restore();
      if (!mine) addLight(s.x, s.y, 40, 0.4);
    } else {
      ctx.fillStyle = "#9ffcff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
      ctx.fillRect(s.x, s.y, s.w, s.h); ctx.shadowBlur = 0;
      addLight(s.x, s.y, 40, 0.5);
    }
  }
}

function drawPickups() {
  let nl = 0;
  for (const p of pickups) {
    if (p.x < cam.x - 20 || p.x > cam.x + VW + 20 || p.y < cam.y - 20 || p.y > cam.y + VH + 20) continue;
    if (p.kind === "cell") {
      ctx.fillStyle = "#00f0ff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(p.x + 4, p.y - 2); ctx.lineTo(p.x + 9, p.y + 4); ctx.lineTo(p.x + 4, p.y + 10); ctx.lineTo(p.x - 1, p.y + 4); ctx.fill();
      ctx.shadowBlur = 0;
      if (nl++ < 12) addLight(p.x + 4, p.y + 4, 40, 0.5);
    } else if (p.kind === "gold") {
      const sw = Math.abs(Math.cos(time * 7 + p.x * 0.1));
      ctx.fillStyle = "#ffcf3a"; ctx.beginPath(); ctx.ellipse(p.x + 3.5, p.y + 3.5, 4 * sw + 0.8, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff3b0"; ctx.fillRect(p.x + 2.5, p.y + 1, Math.max(1, 2 * sw), 2);
    } else {
      ctx.fillStyle = "#3dff9a"; ctx.shadowColor = "#3dff9a"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x + 5, p.y + 5, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      rect(p.x + 3, p.y + 1, 4, 8, "#06140f"); rect(p.x + 1, p.y + 3, 8, 4, "#06140f");
      addLight(p.x + 5, p.y + 5, 50, 0.5);
    }
  }
}

function drawParts() {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.light) addLight(p.x, p.y, p.light * a, 0.9 * a);
    ctx.globalAlpha = a;
    if (p.ring) {
      const r = (1 - a) * (p.rr || 150) + 8;
      ctx.strokeStyle = p.col; ctx.lineWidth = 2 + 4 * a; ctx.beginPath();
      if (p.flat) ctx.ellipse(p.x, p.y, r, r * 0.25, 0, 0, 7); else ctx.arc(p.x, p.y, r, 0, 7);
      ctx.stroke();
    } else if (p.flash) {
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.rr * (0.5 + 0.5 * (1 - a)), 0, 7); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (p.txt) {
      const age = p.max - p.life, pop = 1 + Math.max(0, 0.12 - age) / 0.12 * 0.7;
      const fs = (p.big ? 22 : p.small ? 11 : 15) * pop;
      ctx.font = "bold " + fs.toFixed(1) + "px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y);
    } else if (p.gib) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7); ctx.restore();
    } else if (p.smoke || p.dust) {
      ctx.globalAlpha = a * (p.smoke ? 0.8 : 1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    } else if (p.streak) {
      ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
    } else if (p.bolt) {
      ctx.globalCompositeOperation = "lighter";
      for (const [lw, c] of [[4, p.col], [1.5, "#ffffff"]]) {
        ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p.x, p.y);
        for (let k = 1; k < 7; k++) { const t2 = k / 7; ctx.lineTo(p.x + (p.x2 - p.x) * t2 + rnd(-8, 8), p.y + (p.y2 - p.y) * t2 + rnd(-8, 8)); }
        ctx.lineTo(p.x2, p.y2); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      addLight((p.x + p.x2) / 2, (p.y + p.y2) / 2, 120, 0.7 * a);
    } else {
      ctx.fillStyle = p.col; const s = p.size * (0.4 + 0.6 * a); ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawMinimap(x0, y0, mw) {
  const sc = mw / COLS, mh = Math.round(ROWS * sc);
  if (!mmCanvas || mmDirty) {
    if (!mmCanvas) { mmCanvas = document.createElement("canvas"); mmCanvas.width = COLS; mmCanvas.height = ROWS; }
    const g = mmCanvas.getContext("2d"), im = g.createImageData(COLS, ROWS), d = im.data;
    for (let i = 0; i < COLS * ROWS; i++) {
      const v = seen[i];
      if (!v) continue;
      const t = grid[(i / COLS) | 0][i % COLS];
      let rgb = v === 2 ? [225, 235, 255, 235] : [62, 92, 210, 235];
      if (v === 1 && t === 2) rgb = [150, 185, 255, 255];
      if (v === 1 && t === 3) rgb = [255, 70, 140, 255];
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = rgb[3];
    }
    g.putImageData(im, 0, 0); mmDirty = false;
  }
  ctx.fillStyle = "rgba(4,8,26,.62)"; ctx.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
  ctx.strokeStyle = "rgba(0,240,255,.4)"; ctx.lineWidth = 1; ctx.strokeRect(x0 - 3.5, y0 - 3.5, mw + 7, mh + 7);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(mmCanvas, x0, y0, mw, mh); ctx.imageSmoothingEnabled = true;
  for (const d of doors) {
    const tc = Math.floor((d.x + d.w / 2) / T), tr = Math.floor((d.y + d.h / 2) / T);
    if (seen[tr * COLS + tc]) { ctx.fillStyle = "#ffb020"; ctx.fillRect(x0 + tc * sc - 2, y0 + tr * sc - 2, 6, 5); }
  }
  if (Math.floor(time * 3) % 2 === 0 || scene !== "play") { ctx.fillStyle = "#ff2e97"; ctx.fillRect(x0 + (P.x + P.w / 2) / T * sc - 2, y0 + (P.y + P.h / 2) / T * sc - 2, 4, 4); }
  return mh;
}



function hudPanel(x, y, w, h) {
  ctx.fillStyle = "rgba(4,6,16,.66)"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(0,240,255,.25)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function drawHUD() {
  const mx = 18, my = 14, bw = 250;
  // barre de vie avec « rally » (orange : récupérable en frappant vite)
  hudPanel(mx - 6, my - 6, bw + 12, 78);
  rect(mx, my, bw, 16, "#2a0d14");
  const hpP = clamp(P.hp / U.maxHp, 0, 1), raP = clamp((P.hp + P.rally) / U.maxHp, 0, 1);
  if (P.rally > 0) rect(mx, my, bw * raP, 16, Math.floor(time * 6) % 2 ? "#ff9a3a" : "#ffb060");
  const g = ctx.createLinearGradient(mx, 0, mx + bw, 0);
  g.addColorStop(0, P.curse > 0 ? "#8a4aff" : "#ff4d6d"); g.addColorStop(1, P.curse > 0 ? "#c58bff" : "#ff2e97");
  ctx.fillStyle = g; ctx.fillRect(mx, my, bw * hpP, 16);
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(mx, my, bw * hpP, 3);
  for (let i = 1; i < 10; i++) rect(mx + (bw / 10) * i, my, 1, 16, "rgba(0,0,0,.35)");
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px 'Share Tech Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(Math.ceil(P.hp) + " / " + U.maxHp, mx + 6, my + 12);
  // flasques
  for (let i = 0; i < U.flasks; i++) {
    const fx = mx + i * 19, fy = my + 24, full = i < P.flasks;
    ctx.fillStyle = full ? "#3dff9a" : "#1a3a2a";
    ctx.fillRect(fx + 4, fy, 6, 4); ctx.fillRect(fx, fy + 4, 14, 12);
    if (full) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(fx + 2, fy + 6, 3, 8); }
  }
  // statistiques (parchemins)
  let sx = mx;
  ctx.font = "bold 14px 'Share Tech Mono', monospace";
  for (const k of ["brut", "tact", "surv"]) {
    ctx.fillStyle = STATS[k].c; ctx.fillText(STATS[k].ico + " " + U.st[k], sx, my + 58); sx += 46;
  }
  ctx.fillStyle = "#ffcf3a"; ctx.fillText("● " + run.gold, sx + 6, my + 58);
  if (P.curse > 0) {
    ctx.fillStyle = "#c58bff"; ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.fillText("☠ MAUDIT · " + P.curse + " éliminations", mx + U.flasks * 19 + 10, my + 37);
  }
  if (P.rune.spider || P.rune.breaker) {
    ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillStyle = "#b58bff";
    ctx.fillText((P.rune.spider ? "◈ ARAIGNÉE  " : "") + (P.rune.breaker ? "◈ BRISEUR" : ""), mx, my + 82);
  }
  let ty = 30;
  if (!S.boss) ty = 14 + drawMinimap(W - 212, 12, 200) + 24;
  ctx.textAlign = "right"; ctx.fillStyle = "#00f0ff"; ctx.font = "bold 18px 'Share Tech Mono', monospace";
  ctx.fillText("◆ " + run.cells, W - 14, ty);
  ctx.fillStyle = "#7f8fb5"; ctx.font = "12px 'Share Tech Mono', monospace";
  ctx.fillText("ÉTAGE " + (depth + 1) + "/" + (LAST + 1) + (loop ? " · BOUCLE " + (loop + 1) : ""), W - 14, ty + 18);

  // armes (bas gauche)
  for (let i = 0; i < 2; i++) {
    const it = P.wp[i], x = 14 + i * 176, y = H - 60, act = i === P.wi;
    hudPanel(x, y, 168, 48);
    if (it) {
      const wdh = WEAPONS[it.id], st = STATS[wdh.stat];
      ctx.fillStyle = st.c; ctx.globalAlpha = act ? 1 : 0.5; ctx.fillRect(x, y, 4, 48); ctx.globalAlpha = 1;
      ctx.strokeStyle = act ? RAR[it.rar].c : "rgba(120,130,170,.4)"; ctx.lineWidth = act ? 2 : 1; ctx.strokeRect(x + 1, y + 1, 166, 46);
      ctx.globalAlpha = act ? 1 : 0.6;
      wIcon(it.id, x + 8, y + 8, 32, it.rar ? RAR[it.rar].c : wdh.col);
      ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 13px 'Rajdhani', sans-serif"; ctx.fillText(wdh.name + (it.lvl ? " +" + it.lvl : ""), x + 46, y + 19);
      ctx.fillStyle = RAR[it.rar].c; ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillText(RAR[it.rar].n, x + 46, y + 33);
      const af = itemAff(it);
      for (let k = 0; k < af.length; k++) { ctx.fillStyle = AFFIX[af[k]].c; ctx.fillRect(x + 46 + k * 8, y + 38, 5, 5); }
      if (wdh.type === "bow") {
        const mxA = bowMax(it);
        ctx.fillStyle = it.ammo > 0 ? "#ffd23f" : "#ff4d6d"; ctx.textAlign = "right"; ctx.font = "bold 13px 'Share Tech Mono', monospace";
        ctx.fillText("➶ " + it.ammo + "/" + mxA, x + 162, y + 33);
      }
      if (wdh.critRoll && P.critRollT > 0) { ctx.fillStyle = "#ffd23f"; ctx.textAlign = "right"; ctx.font = "bold 12px 'Share Tech Mono', monospace"; ctx.fillText("CRIT !", x + 162, y + 33); }
      ctx.globalAlpha = 1;
    } else { ctx.fillStyle = "#555a78"; ctx.font = "12px 'Share Tech Mono', monospace"; ctx.textAlign = "left"; ctx.fillText("— vide —", x + 46, y + 28); }
  }
  ctx.textAlign = "left"; ctx.fillStyle = "#7f8fb5"; ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.fillText("R : changer d'arme", 16, H - 66);

  // compétences (bas droite)
  for (let i = 0; i < 2; i++) {
    const s = P.sk[i], x = W - 14 - (2 - i) * 58, y = H - 60;
    hudPanel(x, y, 52, 48);
    if (s) {
      const sd = SKILLS[s.id];
      ctx.fillStyle = STATS[sd.stat].c; ctx.fillRect(x, y + 45, 52, 3);
      sIcon(s.id, x + 10, y + 6, 32, sd.col);
      if (s.t > 0) {
        const fr = s.t / (sd.cd * U.cdMul);
        ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x, y + 48 * (1 - fr), 52, 48 * fr);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 14px 'Share Tech Mono', monospace"; ctx.fillText(Math.ceil(s.t), x + 26, y + 29);
      }
    }
    ctx.fillStyle = "#7f8fb5"; ctx.textAlign = "center"; ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillText(i ? "I" : "U", x + 8, y + 12);
  }

  const boss = enemies.find((o) => o.boss && !o.dead && o.state !== "sleep");
  if (boss) {
    const bw2 = 380, bx = (W - bw2) / 2, by = 30;
    hudPanel(bx - 6, by - 22, bw2 + 12, 44);
    rect(bx, by, bw2, 14, "#2a1a08");
    const ph = boss.phase, bi = BOSSINFO[boss.type], bc = ph === 3 ? bi.c3 : ph === 2 ? mixc(bi.col, bi.c3, 0.5) : bi.col;
    rect(bx, by, bw2 * clamp(boss.hp / boss.maxHp, 0, 1), 14, bc);
    rect(bx, by, bw2 * clamp(boss.hp / boss.maxHp, 0, 1), 3, "rgba(255,255,255,.35)");
    for (const q of [0.33, 0.66]) rect(bx + bw2 * q - 1, by - 3, 2, 20, "#fff");
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.fillText(bi.name + " · PHASE " + ph, W / 2, by - 7);
  }

  if (card.t > 0) {
    const a = clamp(card.t / 0.8, 0, 1) * clamp((3.2 - card.t) / 0.5, 0, 1);
    ctx.globalAlpha = a; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(0, 108, W, 76);
    ctx.fillStyle = "#7f8fb5"; ctx.font = "14px 'Share Tech Mono', monospace"; ctx.fillText("// " + card.sub.toUpperCase(), W / 2, 132);
    ctx.fillStyle = S.accent; ctx.font = "bold 42px 'Rajdhani', sans-serif"; ctx.shadowColor = S.accent; ctx.shadowBlur = 16;
    ctx.fillText(card.text.toUpperCase(), W / 2, 172); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (toastT > 0) {
    ctx.globalAlpha = clamp(toastT, 0, 1); ctx.textAlign = "center"; ctx.font = "bold 20px 'Rajdhani', sans-serif";
    const tw = ctx.measureText(toastTxt).width + 30;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(W / 2 - tw / 2, 80, tw, 26);
    ctx.fillStyle = "#ffd23f"; ctx.fillText(toastTxt, W / 2, 99); ctx.globalAlpha = 1;
  }
}

function drawBossIntro() {
  const a = clamp(bossIntro / 0.5, 0, 1) * clamp((2.6 - bossIntro) / 0.4, 0, 1);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, 60 * a); ctx.fillRect(0, H - 60 * a, W, 60 * a);
  ctx.globalAlpha = a; ctx.textAlign = "center";
  const bi = BOSSINFO[bossRef ? bossRef.type : "boss"];
  ctx.fillStyle = bi.col; ctx.font = "bold 56px 'Rajdhani', sans-serif"; ctx.shadowColor = bi.col; ctx.shadowBlur = 20;
  ctx.fillText(bi.name, W / 2, H * 0.72); ctx.shadowBlur = 0;
  ctx.fillStyle = "#e0d8f0"; ctx.font = "15px 'Share Tech Mono', monospace";
  ctx.fillText("// " + bi.sub, W / 2, H * 0.72 + 26);
  ctx.globalAlpha = 1;
}

function render() {
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  lights = [];
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  ctx.save();
  ctx.translate(Math.round(sx + kick.x), Math.round(sy + kick.y));
  ctx.scale(Z, Z);
  ctx.translate(-Math.round(cam.x * Z) / Z, -Math.round(cam.y * Z) / Z);
  drawTiles();
  drawRays();
  drawDecos(0);
  drawTorches();
  drawDecos(1);
  drawDoors();
  if (scene !== "menu") {
    drawProps();
    drawFx();
    drawPickups();
    for (const e of enemies) if (e.x + e.w > cam.x - 80 && e.x < cam.x + VW + 80 && e.y + e.h > cam.y - 80 && e.y < cam.y + VH + 80) drawEnemy(e);
    drawPlayer();
    drawShots();
  }
  drawParts();
  ctx.restore();
  drawMotes(true);
  drawForeground();
  drawLighting();

  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.6)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (flashRed > 0) { ctx.fillStyle = "rgba(255,40,80," + (flashRed * 0.9) + ")"; ctx.fillRect(0, 0, W, H); }
  if (P && P.curse > 0 && scene === "play") { ctx.strokeStyle = `rgba(160,90,255,${0.25 + 0.15 * Math.sin(time * 4)})`; ctx.lineWidth = 10; ctx.strokeRect(0, 0, W, H); }
  if (scene === "dead" || slowmo > 0) { ctx.fillStyle = "rgba(20,0,10,.25)"; ctx.fillRect(0, 0, W, H); }
  if (scene === "play" || scene === "pause" || scene === "dead" || scene === "choice" || scene === "scroll" || scene === "trans") drawHUD();
  if (bossIntro > 0) drawBossIntro();
  if (fade > 0) { ctx.fillStyle = "rgba(0,0,0," + fade + ")"; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ================================================================== panneaux HTML
function setOv(html) { ov.innerHTML = html; ov.hidden = false; }
function hideOv() { ov.hidden = true; ov.innerHTML = ""; }

function showMenu() {
  scene = "menu";
  genLevel("cachots", 0, false);
  cam.y = clamp(startPos.y - VH * 0.6, 0, ROWS * T - VH);
  music("menu");
  setOv(`<div class="card">
    <p class="tag">// accès niveau 7 autorisé</p>
    <h1>CRYPTE <span>NÉON</span></h1>
    <p class="lead">Descends six étages dans les entrailles d'un réseau oublié. Pars avec une épée rouillée, forge ton build avec les armes et les parchemins trouvés en route, affronte l'Archiviste ou la Matriarche à mi-chemin… et le Concierge au fond. Rapporte des cellules à la Forge pour revenir plus fort.</p>
    <div class="btns">
      <button class="btn primary" data-act="play">Descendre</button>
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="help">Commandes</button>
    </div>
    <p class="small">Record : étage ${save.best.stage || 0}/${LAST + 1} · boucle ${save.best.loop + 1} · ${save.best.kills} ennemis vaincus en une partie</p>
  </div>`);
}

function showHelp() {
  setOv(`<div class="card">
    <h2>Commandes</h2>
    <table class="keys">
      <tr><td>Z Q S D · ← ↑ ↓ →</td><td>Courir</td></tr>
      <tr><td>Z · ↑ · Espace</td><td>Sauter · 2<sup>e</sup> appui en l'air : double saut</td></tr>
      <tr><td>Saut en touchant un mur</td><td>Saut mural. Avec la Rune de l'Araignée : colle-toi au mur (direction vers lui) puis ↑/↓ pour grimper</td></tr>
      <tr><td>K · Maj</td><td>Roulade : invincible, traverse les ennemis (dagues : ×2 dans le dos)</td></tr>
      <tr><td>J · clic gauche</td><td>Attaquer avec l'arme active. Arc : maintenir pour bander, relâcher pour tirer. Bouclier : maintenir pour bloquer — juste au moment de l'impact = parade parfaite (étourdit) ; appui bref = coup de bouclier</td></tr>
      <tr><td>R · Tab · clic droit</td><td>Changer d'arme (2 emplacements)</td></tr>
      <tr><td>U · I</td><td>Compétences (grenade, piège, tourelle, onde de choc)</td></tr>
      <tr><td>F</td><td>Ouvrir un coffre / ramasser ou acheter un objet / lire un parchemin</td></tr>
      <tr><td>E</td><td>Boire une flasque de soin</td></tr>
      <tr><td>S + saut</td><td>Traverser une plateforme fine · avec la Rune du Briseur : bas + attaque en l'air = frappe plongeante</td></tr>
      <tr><td>Échap · M</td><td>Pause · couper le son</td></tr>
    </table>
    <p class="small">Quand tu es touché, une partie des PV perdus (en orange) peut être récupérée en contre-attaquant vite. Les vases cachent de l'or pour le marchand. Les murs et sols fissurés cachent des salles secrètes (grenade, marteau, frappe plongeante). Les ennemis laissent parfois tomber des plans d'armes à débloquer à la Forge.</p>
    <div class="btns"><button class="btn primary" data-act="menu">Retour</button></div>
  </div>`);
}

function showForge() {
  const rows = FORGE.map((f) => {
    const lvl = save.up[f.k] || 0, maxed = lvl >= f.max, cost = f.cost(lvl);
    const pips = "■".repeat(lvl) + "□".repeat(f.max - lvl);
    return `<div class="row"><div><b>${f.name}</b><small>${f.desc}</small><span class="pips">${pips}</span></div>
      <button class="btn" data-act="buy" data-arg="${f.k}" ${maxed || save.cells < cost ? "disabled" : ""}>${maxed ? "Max" : cost + " ◆"}</button></div>`;
  }).join("");
  const runes = RUNES.map((r) => {
    const own = save.runes[r.k];
    return `<div class="row"><div><b>${r.name}</b><small>${r.desc}</small></div>
      <button class="btn" data-act="rune" data-arg="${r.k}" ${own || save.cells < r.cost ? "disabled" : ""}>${own ? "Acquise" : r.cost + " ◆"}</button></div>`;
  }).join("");
  const plans = Object.keys(PLAN_COST).map((k) => {
    const d = WEAPONS[k] || SKILLS[k], own = save.unl[k], found = save.found[k], c = PLAN_COST[k];
    const st = STATS[d.stat];
    return `<div class="row"><div><b style="color:${found || own ? st.c : "#555a78"}">${found || own ? d.name : "??? plan inconnu"}</b><small>${found || own ? d.desc : "Trouve ce plan sur un ennemi (les élites en portent souvent)"}</small></div>
      <button class="btn" data-act="unlock" data-arg="${k}" ${own || !found || save.cells < c ? "disabled" : ""}>${own ? "Débloqué" : found ? c + " ◆" : "—"}</button></div>`;
  }).join("");
  setOv(`<div class="card"><h2>La Forge</h2>
    <p class="lead">Cellules disponibles : <b style="color:#00f0ff">${save.cells} ◆</b></p>
    <div class="rows">${rows}<p class="tag" style="margin-top:6px;text-align:left">// runes permanentes</p>${runes}<p class="tag" style="margin-top:6px;text-align:left">// plans : de nouvelles armes et compétences dans les coffres</p>${plans}</div>
    <div class="btns"><button class="btn primary" data-act="menu">Retour</button></div></div>`);
}

function showChoice(picks) {
  const cards = picks.map((m) => `<button class="mut" style="--c:${m.col}" data-act="pick" data-arg="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join("");
  const nb = BIOMES[pendingNext];
  setOv(`<div class="card"><p class="tag">// niveau terminé · prochaine destination : ${nb.name}</p><h2>Choisis une mutation</h2><div class="muts">${cards}</div></div>`);
}

function showEnd(won) {
  const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60);
  setOv(`<div class="card">
    <h2 class="${won ? "good" : "bad"}">${won ? "Le Concierge est vaincu" : "Vous êtes mort"}</h2>
    <p class="lead">${won ? "La Crypte est à toi. Mais elle se referme et recommence, plus coriace… (tu gardes ton équipement)" : (deathMsg ? deathMsg + " " : "") + "Les cellules récoltées sont conservées pour la Forge."}</p>
    <div class="stats"><span>Étage <b>${depth + 1}</b></span><span>Ennemis <b>${run.kills}</b></span><span>Cellules <b>${run.cells} ◆</b></span><span>Or <b>${run.gold}</b></span><span>Build <b style="color:#ff4d4d">${U.st.brut}</b>/<b style="color:#c06bff">${U.st.tact}</b>/<b style="color:#3dff7a">${U.st.surv}</b></span><span>Temps <b>${m}:${String(s).padStart(2, "0")}</b></span></div>
    <div class="btns">
      ${won ? `<button class="btn primary" data-act="loop">Boucle suivante</button>` : `<button class="btn primary" data-act="play">Rejouer</button>`}
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="menu">Menu</button>
    </div></div>`);
}

function act(a, arg) {
  switch (a) {
    case "play":
      newRunState(); loop = 0; depth = 0; deathMsg = ""; slowmo = 0; createPlayer(null);
      freshRun = true; startLevel("cachots"); freshRun = false; scene = "play"; hideOv(); break;
    case "loop":
      loop++; depth = 0; banked = false; run.cells = 0; run.kills = 0; run.time = 0; startLevel("cachots"); scene = "play"; hideOv(); break;
    case "menu": showMenu(); break;
    case "help": showHelp(); break;
    case "forge": showForge(); break;
    case "buy": {
      const f = FORGE.find((x) => x.k === arg);
      if (!f) break;
      const lvl = save.up[f.k] || 0, cost = f.cost(lvl);
      if (lvl < f.max && save.cells >= cost) { save.cells -= cost; save.up[f.k] = lvl + 1; persist(); SFX.cell(); }
      showForge(); break;
    }
    case "rune": {
      const r = RUNES.find((x) => x.k === arg);
      if (r && !save.runes[r.k] && save.cells >= r.cost) { save.cells -= r.cost; save.runes[r.k] = true; persist(); SFX.heal(); }
      showForge(); break;
    }
    case "pick": {
      const m = MUTS.find((x) => x.id === arg);
      if (m) m.fn();
      depth++; startLevel(pendingNext); scene = "play"; hideOv(); break;
    }
    case "resume": resumeGame(); break;
    case "scroll": {
      if (!STATS[arg]) break;
      U.st[arg]++; run.scrolls++;
      const hp = arg === "surv" ? 25 : 10;
      U.maxHp += hp; P.hp = Math.min(U.maxHp, P.hp + hp);
      refillAmmo();
      scene = "play"; hideOv();
      toast(STATS[arg].n + " " + U.st[arg]);
      burst(P.x + P.w / 2, P.y + P.h / 2, 30, STATS[arg].c, 220, 0.8, 3, -80);
      parts.push({ x: P.x + P.w / 2, y: P.y + P.h / 2, ring: 1, rr: 90, life: 0.4, max: 0.4, col: STATS[arg].c, vx: 0, vy: 0, grav: 0 });
      break;
    }
    case "unlock": {
      const c = PLAN_COST[arg];
      if (c && save.found[arg] && !save.unl[arg] && save.cells >= c) { save.cells -= c; save.unl[arg] = true; persist(); SFX.scroll(); }
      showForge(); break;
    }
  }
}

ov.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  b.blur();
  act(b.dataset.act, b.dataset.arg);
});

// ================================================================== boucle
let last = performance.now(), consumed = false;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  consumed = false;
  try { step(dt); render(); } catch (err) { console.error(err); }
  if (consumed || scene !== "play") for (const k in pressed) delete pressed[k];   // pas de touche perdue pendant un arrêt sur image
  requestAnimationFrame(frame);
}


newRunState();
createPlayer(null);
showMenu();
if (/[?&]debug/.test(location.search)) {                // outils de test (ajouter ?debug à l'adresse)
  window.__CN = {
    go(bk, d) { if (d !== undefined) depth = d; startLevel(bk); scene = "play"; hideOv(); return S.name; },
    state() { return { scene, transT, fade, hitstop, slowmo, hp: P.hp, x: P.x, y: P.y, enemies: enemies.length, props: props.length, decos: decos.length, chunks: chunks.size, gold: run.gold, st: U.st }; },
    tp(x, y) { P.x = x; P.y = y; },
    near(kind) { const p = props.find((q) => q.kind === kind || (q.item && q.item.kind === kind)); if (p) { P.x = p.x; P.y = p.y + p.h - P.h - 2; } return !!p; },
    god() { U.maxHp = 99999; P.hp = 99999; },
    gold(n) { run.gold += n; },
    hit(n) { enemies.forEach((e) => { if (e.boss) e.hp = e.maxHp * n; }); },
    curse() { P.curse = 10; },
    menu() { showMenu(); },
    killBoss() { if (bossRef && !bossRef.dead) { bossRef.phase = 3; bossRef.state = "idle"; damageEnemy(bossRef, 1e7, 0, 0.05, {}); } return enemies.length; },
    map(k) {
      const c = document.createElement("canvas"); c.width = COLS * k; c.height = ROWS * k; const g = c.getContext("2d");
      const col = { 0: "#10131f", 1: "#5a6078", 2: "#c8a060", 3: "#ff2e97", 4: "#ffd23f", 5: "#ffd23f", 6: "#3dff9a" };
      for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) { g.fillStyle = hidMap[r * COLS + q] ? "#2a2240" : col[grid[r][q]] || "#f00"; g.fillRect(q * k, r * k, k, k); }
      for (const p of props) { g.fillStyle = p.kind === "chest" ? (p.cursed ? "#b58bff" : "#ffb020") : p.kind === "item" ? "#00f0ff" : p.kind === "vase" ? "#8a6a4a" : "#fff"; g.fillRect(p.x / T * k, p.y / T * k, Math.max(2, p.w / T * k), Math.max(2, p.h / T * k)); }
      for (const e of enemies) { g.fillStyle = e.elite ? "#ffcc33" : "#ff4d4d"; g.fillRect(e.x / T * k, e.y / T * k, e.w / T * k, e.h / T * k); }
      for (const d of doors) { g.fillStyle = "#3dff9a"; g.fillRect(d.x / T * k, d.y / T * k, d.w / T * k, d.h / T * k); }
      g.fillStyle = "#00ffff"; g.fillRect(startPos.x / T * k, startPos.y / T * k - 2 * k, k * 1.5, k * 2);
      return c.toDataURL();
    },
    reach() {                                            // accessibilité approximative depuis le départ (saut ≈ 4 cases)
      const ok = (c, r) => !SOL(tileAt(c, r)) && tileAt(c, r) !== 3 && !SOL(tileAt(c, r - 1)) && !hidMap[r * COLS + c];
      const stand = (c, r) => ok(c, r) && FLOOR(tileAt(c, r + 1));
      const fall = (c, r) => { while (r < ROWS - 1 && ok(c, r + 1) && !FLOOR(tileAt(c, r + 1))) r++; return stand(c, r) ? r : -1; };
      const seen = new Uint8Array(COLS * ROWS), q = [];
      const sc = Math.floor((startPos.x + 9) / T), sr = Math.floor(startPos.y / T) - 1;
      const push = (c, r) => { if (r >= 0 && stand(c, r) && !seen[r * COLS + c]) { seen[r * COLS + c] = 1; q.push(c, r); } };
      push(sc, fall(sc, sr) >= 0 ? fall(sc, sr) : sr);
      for (let i = 0; i < q.length; i += 2) {
        const c = q[i], r = q[i + 1];
        for (const dc of [-1, 1]) { if (ok(c + dc, r)) { const f = fall(c + dc, r); if (f >= 0) push(c + dc, f); } }
        if (tileAt(c, r + 1) === 2) { const f = fall(c, r + 1); if (f >= 0) push(c, f); }
        let top = r; while (top > r - 4 && ok(c, top - 1)) top--;
        for (let rr = top; rr <= r; rr++) for (let dc = -4; dc <= 4; dc++) {
          let clear = true; const st = Math.sign(dc);
          for (let k = st; k !== dc + st && dc !== 0; k += st) if (!ok(c + k, rr)) { clear = false; break; }
          if (!clear) continue;
          const f = fall(c + dc, rr); if (f >= 0) push(c + dc, f);
        }
      }
      const at = (x, y) => { const c = Math.floor(x / T), r = Math.floor(y / T) - 1; for (let dc = -1; dc <= 1; dc++) if (seen[r * COLS + c + dc]) return true; return false; };
      window.__UN = props.filter((p) => (p.kind === "chest" || p.kind === "item") && !p.secret && !at(p.x + p.w / 2, p.y + p.h)).map((p) => [p.kind, Math.floor(p.x / T), Math.floor(p.y / T), p.price ? 'shop' : p.group || '']);
      return { doors: doors.map((d) => at(d.x + d.w / 2, d.y + d.h)), items: props.filter((p) => (p.kind === "chest" || p.kind === "item") && !p.secret && !hidMap[Math.floor((p.y + p.h / 2) / T) * COLS + Math.floor((p.x + p.w / 2) / T)] && !at(p.x + p.w / 2, p.y + p.h)).length, total: props.filter((p) => p.kind === "chest" || p.kind === "item").length };
    },
    checkProps() { return props.filter((p) => ["chest", "item", "vase", "totem", "merchant"].includes(p.kind) && !p.drop && !propFits(p.x, p.y, p.w, p.h)).length; },
    cursed() { for (let i = 0; i < 12; i++) { const p = props.find((q) => q.cursed); if (p) { P.x = p.x; P.y = p.y + p.h - P.h - 2; return true; } startLevel("cachots"); } return false; },
    door() { const d = doors[0]; P.x = d.x + 10; P.y = d.y + d.h - P.h - 1; P.vy = 0; return d.next; },
    fps() { return new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }); },
    cost() { const t0 = performance.now(); for (let i = 0; i < 60; i++) { step(1 / 60); render(); } return ((performance.now() - t0) / 60).toFixed(2) + " ms/image"; },
    kill() { P.hp = 1; U.maxHp = 100; hurtPlayer(50, P.x + 50, {}); return scene; },
    foe(type, elite) { const e = enemies.find((q) => (!type || q.type === type) && (!elite || q.elite) && !q.fly); if (!e) return false; P.x = e.x - 70; P.y = e.y + e.h - P.h - 2; P.face = 1; return e.type + (e.elite ? "*" : ""); },
    give(id, rar, slot) { P.wp[slot || 0] = mkWeapon(id, rar || 0); return P.wp; },
    skill(id) { P.sk[1] = mkSkill(id); },
  };
}
requestAnimationFrame(frame);


})();
