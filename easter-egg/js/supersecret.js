/* Crypte Néon — plateformer d'action 2D (façon roguelite « Dead Cells »)
 * Page secrète du portfolio. JS pur + canvas, aucune dépendance.
 */
(() => {
"use strict";

// ================================================================== constantes
const W = 960, H = 544, T = 32, ROWS = 40, GRAV = 1900, LAST = 4;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
cv.width = W; cv.height = H;
const ov = document.getElementById("ov");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const SOL = (t) => t === 1 || t === 4 || t === 5;          // tuiles pleines (4 = mur fissuré, 5 = sol fissuré)
const FLOOR = (t) => t === 1 || t === 2 || t === 4 || t === 5;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ================================================================== données
const BIOMES = {
  cachots:   { name: "Les Cachots", bg: ["#0b0b1a", "#04040a"], far: "#10122a", near: "#161a36", accent: "#00f0ff", tile: "#151a2e", tile2: "#1a2038", edge: "#2b3a78", cols: 170, diff: 1, fog: null,      mix: { zombie: .6, archer: .4 },             bat: .25, pit: .10, traps: .25, secret: .5,  reward: null,     rewardTxt: "Équilibré", cellMul: 1 },
  egouts:    { name: "Les Égouts toxiques", bg: ["#06140f", "#030806"], far: "#0b241b", near: "#10301f", accent: "#3dff9a", tile: "#0f2119", tile2: "#13291f", edge: "#1f6a48", cols: 190, diff: 2, fog: "#3dff9a", mix: { zombie: .45, archer: .3, brute: .25 }, bat: .45, pit: .18, traps: .3, secret: .45, reward: "cells",  rewardTxt: "Cellules ×1,5", cellMul: 1.5 },
  archives:  { name: "Les Archives interdites", bg: ["#100a1e", "#06030c"], far: "#1a1030", near: "#241640", accent: "#b58bff", tile: "#1a1230", tile2: "#20163a", edge: "#5a3aa0", cols: 180, diff: 2, fog: "#b58bff", mix: { zombie: .2, archer: .55, brute: .25 }, bat: .25, pit: .10, traps: .2, secret: .6, reward: "weapon", rewardTxt: "Autel d'arme rare", cellMul: 1 },
  abysses:   { name: "Les Abysses", bg: ["#060c1c", "#02040a"], far: "#0a1530", near: "#0e1c40", accent: "#4d8dff", tile: "#0d1630", tile2: "#111d3b", edge: "#2a52a8", cols: 200, diff: 3, fog: "#4d8dff", mix: { zombie: .35, archer: .35, brute: .3 }, bat: .6, pit: .26, traps: .35, secret: .45, reward: "cells",  rewardTxt: "Cellules ×2 · très dangereux", cellMul: 2 },
  citadelle: { name: "La Citadelle écarlate", bg: ["#17060e", "#08030a"], far: "#2a0d1b", near: "#3a1224", accent: "#ff2e97", tile: "#241018", tile2: "#2c1520", edge: "#7a2448", cols: 190, diff: 3, fog: "#ff2e97", mix: { zombie: .25, archer: .3, brute: .45 }, bat: .3, pit: .14, traps: .4, secret: .45, reward: "skill",  rewardTxt: "Autel de compétence", cellMul: 1 },
  boss:      { name: "La Salle du Concierge", bg: ["#1a1206", "#0a0703"], far: "#2a1d0a", near: "#38270e", accent: "#ffb020", tile: "#1d160f", tile2: "#251c13", edge: "#7a5a22", cols: 44, diff: 4, fog: "#ffb020", boss: true, rewardTxt: "Boss" },
};
const POOLS = { 1: ["egouts", "archives", "abysses"], 2: ["archives", "abysses", "citadelle", "egouts"], 3: ["citadelle", "abysses", "archives"] };

const ENEMY = {
  zombie: { w: 22, h: 30, hp: 32, dmg: 10 },
  archer: { w: 20, h: 30, hp: 22, dmg: 8 },
  bat:    { w: 20, h: 14, hp: 14, dmg: 7, fly: true, contact: 7 },
  brute:  { w: 32, h: 42, hp: 90, dmg: 22, armor: true },
  boss:   { w: 56, h: 76, hp: 520, dmg: 18, armor: true, contact: 9 },
};

const RAR = [{ n: "Commun", m: 1, c: "#c8d2f0" }, { n: "Rare", m: 1.3, c: "#5ab0ff" }, { n: "Épique", m: 1.7, c: "#d27bff" }];

const WEAPONS = {
  sword:  { name: "Épée rouillée", type: "melee", col: "#9ffcff", desc: "Combo en 3 coups, équilibrée",
            steps: [{ dur: .24, dmg: 10, reach: 48, lunge: 110, kb: 150, hs: .05 }, { dur: .24, dmg: 12, reach: 48, lunge: 110, kb: 150, hs: .05 }, { dur: .36, dmg: 20, reach: 62, lunge: 230, kb: 270, hs: .09 }] },
  dagger: { name: "Dagues jumelles", type: "melee", col: "#7dffb0", desc: "Très rapides, ×2 dans le dos", backstab: 2, atkSlow: .7,
            steps: [{ dur: .15, dmg: 6, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .15, dmg: 6, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .15, dmg: 7, reach: 34, lunge: 90, kb: 60, hs: .03 }, { dur: .24, dmg: 12, reach: 40, lunge: 170, kb: 150, hs: .06 }] },
  hammer: { name: "Marteau de guerre", type: "melee", col: "#ffb020", desc: "Lent mais dévastateur : étourdit, brise les sols fissurés", a0: .45, a1: .82, atkSlow: .15,
            steps: [{ dur: .55, dmg: 30, reach: 58, lunge: 60, kb: 380, hs: .14, stun: .7, smash: 1 }, { dur: .62, dmg: 38, reach: 64, lunge: 80, kb: 460, hs: .16, stun: .9, smash: 1 }] },
  spear:  { name: "Lance", type: "melee", col: "#ff8a5a", desc: "Longue portée, transperce les ennemis alignés",
            steps: [{ dur: .3, dmg: 14, reach: 88, lunge: 100, kb: 160, hs: .05, thin: 1 }, { dur: .4, dmg: 19, reach: 100, lunge: 140, kb: 240, hs: .07, thin: 1 }] },
  bow:    { name: "Arc court", type: "bow", col: "#d9b45a", desc: "Tir rapide, 10 flèches", dmg: 12, max: 10, pierce: 0, chargeT: .5 },
  longbow:{ name: "Arc long", type: "bow", col: "#e8c36a", desc: "Puissant, transperce, 6 flèches", dmg: 28, max: 6, pierce: 1, chargeT: .8 },
  shield: { name: "Bouclier en bois", type: "shield", col: "#ffd23f", desc: "Bloque 60 % · parade parfaite = étourdit", block: .6, parry: .22 },
  tower:  { name: "Bouclier-tour", type: "shield", col: "#8fd0ff", desc: "Bloque 80 % · parade plus stricte", block: .8, parry: .16 },
};
const WLIST = [["sword", .2], ["dagger", .16], ["hammer", .12], ["spear", .14], ["bow", .14], ["longbow", .08], ["shield", .1], ["tower", .06]];

const SKILLS = {
  grenade: { name: "Grenade", cd: 7, col: "#ff8a5a", desc: "Explose : dégâts de zone, brise murs et sols fissurés" },
  trap:    { name: "Piège à pointes", cd: 9, col: "#ffd23f", desc: "Étourdit et blesse l'ennemi qui marche dessus" },
  turret:  { name: "Tourelle", cd: 18, col: "#00f0ff", desc: "Tire seule sur les ennemis pendant 10 s" },
  pulse:   { name: "Onde de choc", cd: 12, col: "#b58bff", desc: "Repousse, étourdit et efface les projectiles" },
};

const KITS = [
  { name: "Soldat",   desc: "Épée rouillée + Bouclier en bois + Grenade", w: [["sword", 0], ["shield", 0]], s: ["grenade"] },
  { name: "Assassin", desc: "Dagues jumelles + Arc court + Piège à pointes", w: [["dagger", 0], ["bow", 0]], s: ["trap"] },
  { name: "Brute",    desc: "Marteau de guerre + Lance + Onde de choc", w: [["hammer", 0], ["spear", 0]], s: ["pulse"] },
];

const MUTS = [
  { id: "brut",  name: "Brutalité",        col: "#ff4d4d", desc: "+25 % de dégâts de mêlée",                       fn: () => { U.melee *= 1.25; } },
  { id: "tact",  name: "Tactique",         col: "#b58bff", desc: "+30 % de dégâts à distance et de compétences",   fn: () => { U.ranged *= 1.3; } },
  { id: "surv",  name: "Survie",           col: "#3dff9a", desc: "+25 PV max et soin complet",                     fn: () => { U.maxHp += 25; P.hp = U.maxHp; } },
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
let save = { cells: 0, up: { vit: 0, brut: 0, tact: 0, flask: 0 }, runes: { spider: false, breaker: false }, best: { stage: 0, loop: 0, kills: 0 } };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s && typeof s === "object") {
    save.cells = Number(s.cells) || 0;
    Object.assign(save.up, s.up || {});
    Object.assign(save.runes, s.runes || {});
    Object.assign(save.best, s.best || {});
  }
} catch (e) { /* stockage indisponible : la partie fonctionne quand même */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ================================================================== son
let AC = null, muted = false;
function sfx(f1, f2, dur, type, vol) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
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
};

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
  press(e.code);
  if (e.code === "Escape" || e.code === "KeyP") togglePause();
  if (e.code === "Enter") enterKey();
  if (e.code === "KeyM") toggleMute();
});
window.addEventListener("keyup", (e) => release(e.code));
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (scene === "play") pauseGame(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "play") pauseGame(); });

cv.addEventListener("mousedown", (e) => { e.preventDefault(); press(e.button === 2 ? "M_right" : "M_left"); });
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
function toggleMute() { muted = !muted; btnMute.textContent = "Son : " + (muted ? "off" : "on"); }
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
let props = [], bombs = [], traps = [], turrets = [], doors = [], route = [];
let P = null, U = null, run = null;
let cam = { x: 0, y: 0 }, shake = 0, hitstop = 0, flashRed = 0, time = 0;
let bossDead = false, bossRef = null, toastT = 0, toastTxt = "", card = { t: 0, text: "", sub: "" };
let banked = false, uid = 1, pendingNext = "cachots";

function newRunState() {
  U = {
    melee: 1 + save.up.brut * 0.06, ranged: 1 + save.up.tact * 0.1,
    maxHp: 100 + save.up.vit * 12, vamp: 0, rollMul: 1, speed: 1,
    flasks: 2 + save.up.flask, heal: 0.4, crit: 0, arrowBonus: 0, cdMul: 1,
  };
  run = { kills: 0, cells: 0, time: 0 };
  banked = false;
}

// ================================================================== objets
function bowMax(it) { return WEAPONS[it.id].max + Math.round((RAR[it.rar].m - 1) * 8) + U.arrowBonus; }
function mkWeapon(id, rar) {
  const it = { kind: "weapon", id, rar, uid: uid++, ammo: 0 };
  if (WEAPONS[id].type === "bow") it.ammo = bowMax(it);
  return it;
}
function mkSkill(id) { return { kind: "skill", id, t: 0, uid: uid++ }; }
function randWeapon(minRar, R) {
  const rf = R || Math.random;
  let x = rf(), id = "sword";
  for (const [k, w] of WLIST) { x -= w; if (x <= 0) { id = k; break; } }
  const r = rf(), p2 = 0.04 + 0.04 * depth, p1 = 0.25 + 0.08 * depth;
  const rar = Math.max(minRar || 0, r < p2 ? 2 : r < p2 + p1 ? 1 : 0);
  return mkWeapon(id, rar);
}
function randSkill(R) { const ids = Object.keys(SKILLS); return mkSkill(ids[Math.floor((R || Math.random)() * ids.length)]); }
const aw = () => P.wp[P.wi];
function refillAmmo() { for (const it of P.wp) if (it && WEAPONS[it.id].type === "bow") it.ammo = bowMax(it); }

function createPlayer(kit) {
  P = {
    x: 0, y: 0, w: 18, h: 30, vx: 0, vy: 0, face: 1, onGround: false,
    coyote: 0, buf: 0, air: 1, roll: 0, rollDir: 1, rollCd: 0, dropT: 0,
    atk: null, atkBuf: 0, combo: 0, comboT: 0,
    hp: U.maxHp, inv: 0, hurtT: 0, flasks: U.flasks,
    safeX: 0, safeY: 0,
    wp: [null, null], wi: 0, sk: [null, null],
    guard: false, guardT: 0, guardCd: 0, drawing: false, draw: 0,
    wallDir: 0, wallLast: 0, wallCoy: 0, wjLock: 0, clinging: false, pound: false,
    rune: { spider: !!save.runes.spider, breaker: !!save.runes.breaker },
  };
  if (kit) {
    P.wp = kit.w.map(([id, r]) => mkWeapon(id, r));
    P.sk = [mkSkill(kit.s[0]), null];
  } else {
    P.wp = [mkWeapon("sword", 0), null];
  }
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
  const pool = POOLS[d + 1].filter((k) => k !== cur);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 2);
}

function genLevel(bk, d, withEnemies) {
  S = BIOMES[bk]; COLS = S.cols;
  grid = []; for (let r = 0; r < ROWS; r++) grid.push(new Uint8Array(COLS));
  enemies = []; shots = []; pickups = []; parts = []; torches = []; layers = []; props = []; bombs = []; traps = []; turrets = []; route = []; doors = [];
  cracks = new Map(); bossDead = false; bossRef = null;
  const R = mulberry32(((Math.random() * 1e9) | 0) + d * 7919);
  const ri = (n) => Math.floor(R() * n);
  const surf = new Array(COLS).fill(34);
  const ops = [], sections = [], perches = [];
  const put = (r, c, v) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = v; };
  let startG = 30, endG = 34;

  if (S.boss) {
    startG = 34;
    ops.push(() => {
      for (let r = 0; r < 22; r++) for (let c = 0; c < COLS; c++) grid[r][c] = 1;
      for (const [a, b] of [[7, 12], [COLS - 13, COLS - 8]]) for (let c = a; c <= b; c++) put(30, c, 2);
    });
    sections.push({ c0: 3, len: COLS - 6, top: 34, boss: true });
  } else {
    let c = 0, g = 30, force = 0;

    const flatFeatures = (c0, len, gg) => {
      if (c0 < 16 || c0 + len > COLS - 22) return;
      // plateformes à plusieurs hauteurs
      if (len >= 10 && gg - 9 >= 3 && R() < 0.55) {
        const pw = 4 + ri(3), pc = c0 + 1 + ri(Math.max(1, len - pw - 2));
        ops.push(() => { for (let i = 0; i < pw; i++) put(gg - 4, pc + i, 2); });
        perches.push({ x: (pc + 1 + R() * (pw - 2)) * T, y: (gg - 4) * T });
        if (R() < 0.45) {
          const pw2 = 3 + ri(2), pc2 = clamp(pc + ri(3) - 1, c0 + 1, c0 + len - pw2 - 1);
          ops.push(() => { for (let i = 0; i < pw2; i++) put(gg - 8, pc2 + i, 2); });
          perches.push({ x: (pc2 + 1) * T, y: (gg - 8) * T });
          if (R() < 0.4) props.push({ kind: "chest", x: (pc2 + 1) * T, y: (gg - 8) * T - 22, w: 30, h: 22, open: false });
        }
      }
      // salle secrète sous le sol (sol fissuré)
      if (len >= 11 && gg <= 30 && R() < S.secret * 0.6) {
        const cx = c0 + 1;
        ops.push(() => {
          for (let r = gg + 3; r <= gg + 6; r++) for (let i = 0; i < 8; i++) put(r, cx + i, 0);
          for (let r = gg; r <= gg + 2; r++) { put(r, cx + 2, 5); put(r, cx + 3, 5); }
          for (let i = 0; i < 2; i++) { put(gg + 5, cx + 4 + i, 2); put(gg + 3, cx + 2 + i, 2); }
        });
        props.push({ kind: "chest", x: (cx + 6) * T + 1, y: (gg + 7) * T - 22, w: 30, h: 22, open: false, secret: true });
      }
      // totem lance-flèches
      if (len >= 9 && R() < S.traps) props.push({ kind: "totem", x: (c0 + len - 3) * T, y: gg * T - 34, w: 24, h: 34, face: -1, cd: 1 + R() * 1.5, flash: 0 });
      // coffre au sol
      if (len >= 8 && R() < 0.14) props.push({ kind: "chest", x: (c0 + 2 + ri(len - 4)) * T, y: gg * T - 22, w: 30, h: 22, open: false });
    };
    const flat = (len, feat) => {
      for (let i = 0; i < len; i++) surf[c + i] = g;
      sections.push({ c0: c, len, top: g, start: !feat && c === 0 });
      if (feat) flatFeatures(c, len, g);
      c += len;
    };

    flat(14, false);
    route.push({ x: 3 * T + 16, y: 30 * T });

    while (c < COLS - 22) {
      if (force > 0) { force--; flat(6 + ri(5), true); continue; }
      const r = R();
      if (r < S.pit && g + 2 <= 38 && c > 16) {
        if (R() < 0.3) {                                    // pont de plateformes au-dessus de piques
          const L = 14, cc = c, gg = g;
          for (let i = 0; i < L; i++) surf[cc + i] = gg + 2;
          ops.push(() => { for (let i = 0; i < L; i++) put(gg + 1, cc + i, 3); for (const o of [0, 5, 10]) for (let i = 0; i < 4; i++) put(gg, cc + o + i, 2); });
          for (const o of [0, 5, 10]) route.push({ x: (cc + o + 2) * T, y: gg * T });
          c += L;
        } else {                                            // fosse à piques
          const w = 3 + (R() < 0.5 ? 1 : 0), cc = c, gg = g;
          for (let i = 0; i < w; i++) surf[cc + i] = gg + 1;
          ops.push(() => { for (let i = 0; i < w; i++) put(gg, cc + i, 3); });
          c += w;
        }
        force = 1; continue;
      }
      if (r < S.pit + 0.15 && c > 16) {                     // puits vertical avec plateformes en quinconce
        const n = 2 + ri(3), Hh = 3 * n + 1;
        if (g - Hh >= 6) {
          const hx = c, ix = c + 2, rx = ix + 6, gg = g;
          for (let i = 0; i < 2; i++) surf[hx + i] = gg;
          for (let i = 0; i < 6; i++) surf[ix + i] = gg;
          for (let i = 0; i < 2; i++) surf[rx + i] = gg - Hh;
          const secret = R() < S.secret;
          ops.push(() => {
            for (let r2 = gg - Hh; r2 <= gg - 4; r2++) { put(r2, hx, 1); put(r2, hx + 1, 1); }
            for (let k = 1; k <= n; k++) {
              const row = gg - 2 - 3 * (k - 1), right = ((n - k) % 2 === 0), c0 = right ? ix + 3 : ix;
              for (let i = 0; i < 3; i++) put(row, c0 + i, 2);
            }
            if (secret) {                                   // tunnel secret derrière un mur fissuré
              for (let cc = rx + 1; cc <= rx + 9; cc++) for (let r2 = gg - 2; r2 <= gg - 1; r2++) put(r2, cc, 0);
              for (let cc = rx + 5; cc <= rx + 9; cc++) for (let r2 = gg - 4; r2 <= gg - 1; r2++) put(r2, cc, 0);
              put(gg - 2, rx, 4); put(gg - 1, rx, 4);
            }
          });
          if (secret) props.push({ kind: "chest", x: (rx + 8) * T, y: gg * T - 22, w: 30, h: 22, open: false, secret: true });
          for (let k = 1; k <= n; k++) {
            const row = gg - 2 - 3 * (k - 1), right = ((n - k) % 2 === 0), c0 = right ? ix + 3 : ix;
            route.push({ x: (c0 + 1.5) * T, y: row * T });
            if (R() < 0.35) perches.push({ x: (c0 + 1) * T, y: row * T });
          }
          route.push({ x: (rx + 2.5) * T, y: (gg - Hh) * T });
          g = gg - Hh; c = rx + 2; force = 1; continue;
        }
      }
      if (r < S.pit + 0.24 && g + 6 <= 36) g = Math.min(36, g + 3 + ri(4));   // descente
      else if (R() < 0.35) g = clamp(g + (R() < 0.5 ? -1 : 1) * (1 + (R() < 0.4 ? 1 : 0)), 12, 36);
      flat(8 + ri(9), true);
    }
    const endC = c;
    while (c < COLS) surf[c++] = g;
    sections.push({ c0: endC, len: COLS - endC, top: g, end: true });
    endG = g;
  }

  // remplissage du terrain
  for (let c = 0; c < COLS; c++) for (let r = surf[c]; r < ROWS; r++) grid[r][c] = 1;
  for (const op of ops) op();
  for (let r = 0; r < ROWS; r++) { grid[r][0] = 1; grid[r][COLS - 1] = 1; }
  for (let c = 0; c < COLS; c++) grid[0][c] = 1;

  // portes de sortie
  if (S.boss) {
    doors.push({ x: (COLS - 6) * T, y: endG * T - 64, w: 40, h: 64, open: false, next: "boss" });
  } else {
    nextKeys = pickNext(bk, d);
    const xs = nextKeys.length === 1 ? [COLS - 8] : [COLS - 14, COLS - 7];
    nextKeys.forEach((k, i) => doors.push({ x: xs[i] * T, y: endG * T - 64, w: 40, h: 64, open: true, next: k }));
  }

  // autel de récompense
  if (!S.boss && S.reward) {
    const mid = sections.filter((s) => !s.start && !s.end);
    const sec = mid[Math.floor(mid.length * 0.45)] || mid[0];
    if (sec) {
      const item = S.reward === "weapon" ? randWeapon(1, R) : S.reward === "skill" ? randSkill(R) : null;
      if (item) props.push({ kind: "item", item, altar: true, x: (sec.c0 + sec.len / 2) * T - 11, y: sec.top * T - 30, w: 22, h: 22, bob: R() * 6 });
    }
  }

  // ennemis
  if (withEnemies) {
    if (S.boss) {
      bossRef = spawn("boss", (COLS - 12) * T, 34 * T - ENEMY.boss.h);
    } else {
      const dens = S.diff * 0.55 + 0.7 + d * 0.12;
      for (const s of sections) {
        if (s.start || s.end) continue;
        let n = Math.floor((s.len / 6) * dens * (0.6 + R() * 0.8));
        n = clamp(n, 0, Math.floor(s.len / 3));
        for (let i = 0; i < n && enemies.length < 70; i++) {
          const type = weightedPick(S.mix, R), dd = ENEMY[type];
          spawn(type, (s.c0 + 1 + R() * (s.len - 2)) * T - dd.w / 2, s.top * T - dd.h);
        }
        if (R() < S.bat * 0.5 && enemies.length < 70) spawn("bat", (s.c0 + R() * s.len) * T, Math.max(2, s.top - 4 - R() * 4) * T);
      }
      for (const p of perches) if (R() < 0.5 && enemies.length < 70) spawn("archer", p.x, p.y - ENEMY.archer.h);
    }
  }

  // décor
  for (let c = 6; c < COLS - 2; c += 7 + ri(4)) torches.push({ x: c * T + 16, y: (surf[c] - 5) * T + 8, s: R() * 10 });
  for (let l = 0; l < 2; l++) {
    const f = l === 0 ? 0.2 : 0.45, shapes = [];
    let x = -100;
    while (x < COLS * T * f + W + 200) {
      const w = 50 + R() * 110;
      shapes.push({ x, w, h: 160 + R() * 280, arch: R() < 0.45 });
      x += w + 30 + R() * 120;
    }
    layers.push({ f, shapes, col: l === 0 ? S.far : S.near });
  }
  motes = [];
  for (let i = 0; i < 42; i++) motes.push({ x: R() * W, y: R() * H, s: 0.5 + R() * 2, p: R() * 6 });
  return { startG };
}

function spawn(type, x, y) {
  const d = ENEMY[type];
  const hpm = (type === "boss" ? 1 : 1 + 0.22 * depth) * (1 + 0.6 * loop);
  const e = {
    type, x, y, w: d.w, h: d.h, vx: 0, vy: 0, hp: d.hp * hpm, maxHp: d.hp * hpm,
    face: Math.random() < 0.5 ? -1 : 1, state: type === "boss" ? "sleep" : "idle",
    t: 0, cd: 0.4 + Math.random(), flash: 0, armor: !!d.armor, fly: !!d.fly,
    dmg: d.dmg * (1 + 0.12 * depth) * (1 + 0.15 * loop), contact: d.contact ? d.contact * (1 + 0.15 * loop) : 0,
    bob: Math.random() * 6, wall: 0, onGround: false, struck: false, stun: 0, stuck: [],
  };
  enemies.push(e);
  return e;
}

function startLevel(bk) {
  genLevel(bk, depth, true);
  const sg = S.boss ? 34 : 30;
  P.x = 3 * T; P.y = sg * T - P.h; P.vx = P.vy = 0; P.atk = null; P.roll = 0; P.inv = 0.5;
  P.guard = false; P.drawing = false; P.pound = false; P.clinging = false;
  P.safeX = P.x; P.safeY = P.y; P.flasks = U.flasks;
  P.hp = Math.min(U.maxHp, P.hp + U.maxHp * 0.3);
  cam.x = 0; cam.y = clamp(P.y - H / 2, 0, ROWS * T - H);
  card = { t: 3.2, text: S.name, sub: S.boss ? "Boss" : "Niveau " + (depth + 1) + " · " + "☠".repeat(S.diff) };
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
  grid[r][c] = 0; tileFx(c, r);
  const dirs = t === 4 ? [-1, 1] : [1];
  for (const d of dirs) {
    let rr = r + d;
    while (tileAt(c, rr) === t) { grid[rr][c] = 0; tileFx(c, rr); rr += d; }
  }
  shake = Math.max(shake, 6); SFX.boom();
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
  burst(x, y, 26, "#ff8a5a", 300, 0.6, 4); burst(x, y, 12, "#ffd23f", 200, 0.5, 3);
  shake = Math.max(shake, 11); SFX.boom();
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
  P.atk = { idx, s, wid: w.id, t: 0, dur: s.dur, hit: new Set(), tiles: new Set(), mul: RAR[w.rar].m };
  P.vx += P.face * s.lunge;
  P.atkBuf = 0;
  SFX.swing();
}

function startBash() {
  const w = aw(), m = RAR[w.rar].m;
  P.atk = { idx: 0, s: { dur: .28, dmg: 12, reach: 44, lunge: 90, kb: 320, hs: .07, stun: .6, bash: 1 }, wid: w.id, t: 0, dur: .28, hit: new Set(), tiles: new Set(), mul: m };
  P.vx += P.face * 90; SFX.swing();
}

function applyMelee() {
  const a = P.atk, s = a.s, wd = WEAPONS[a.wid];
  const f = a.t / a.dur, a0 = s.bash ? 0.2 : (wd.a0 || 0.22), a1 = s.bash ? 0.75 : (wd.a1 || 0.72);
  if (f < a0 || f > a1) return;
  const bx = P.face > 0 ? P.x + P.w - 2 : P.x - s.reach + 2;
  const box = s.thin ? { x: bx, y: P.y + 8, w: s.reach, h: 14 } : { x: bx, y: P.y - 6, w: s.reach, h: P.h + 12 };
  for (const e of enemies) {
    if (e.dead || a.hit.has(e) || e.state === "sleep") continue;
    if (overlap(box, e)) {
      a.hit.add(e);
      let dmg = s.dmg * a.mul * U.melee;
      if (wd.backstab && e.face === P.face && e.type !== "boss") { dmg *= wd.backstab; addText(e.x + e.w / 2, e.y - 22, "DANS LE DOS !", "#7dffb0"); }
      damageEnemy(e, dmg, P.face * s.kb, s.hs, { stun: s.stun });
    }
  }
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
  shots.push({ x: P.x + P.w / 2 - 8, y: P.y + 11, vx: P.face * sp, vy: -15, w: 16, h: 5, dmg: wd.dmg * RAR[w.rar].m * U.ranged * (0.45 + 0.55 * pw), life: 1.6, from: "p", kind: "arrow", bow: w, pierce: wd.pierce, hitSet: new Set(), grav: 420 * (1.15 - pw) });
  P.vx -= P.face * 30;
  SFX.shoot();
}

function useSkill(i) {
  const s = P.sk[i];
  if (!s || s.t > 0 || P.hurtT > 0 || scene !== "play") return;
  const d = SKILLS[s.id], cx = P.x + P.w / 2;
  s.t = d.cd * U.cdMul;
  if (s.id === "grenade") {
    bombs.push({ x: cx - 5, y: P.y + 6, w: 10, h: 10, vx: P.face * 330 + P.vx * 0.4, vy: -380, t: 1.2, wall: 0, onGround: false });
    SFX.swing();
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
        damageEnemy(e, 12 * U.ranged, (e.x + e.w / 2 < cx ? -1 : 1) * 420, 0.05, { stun: 0.9 });
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
function interact() {
  const p = nearestProp();
  if (!p) return;
  if (p.kind === "chest") {
    p.open = true; SFX.cell();
    burst(p.x + 15, p.y, 16, "#ffd23f", 180, 0.6, 3);
    const r = Math.random();
    if (r < 0.5) dropItem(randWeapon(0), p.x + 15, p.y);
    else if (r < 0.7) dropItem(randSkill(), p.x + 15, p.y);
    else {
      const n = Math.round(rnd(8, 16) * (S.cellMul || 1));
      for (let i = 0; i < n; i++) pickups.push({ x: p.x + 15, y: p.y, w: 8, h: 8, vx: rnd(-150, 150), vy: rnd(-340, -140), kind: "cell", t: 0, wall: 0 });
      if (Math.random() < 0.5) pickups.push({ x: p.x + 15, y: p.y, w: 10, h: 10, vx: 0, vy: -240, kind: "orb", t: 0, wall: 0 });
    }
    return;
  }
  const it = p.item;
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
  const dirIn = (down("right") ? 1 : 0) - (down("left") ? 1 : 0);
  const w = aw(), wd = w ? WEAPONS[w.id] : null, wt = wd ? wd.type : "none";
  P.inv = Math.max(0, P.inv - dt);
  P.rollCd -= dt; P.comboT -= dt; P.coyote -= dt; P.buf -= dt; P.atkBuf -= dt;
  P.dropT -= dt; P.hurtT -= dt; P.guardCd -= dt; P.wjLock -= dt; P.wallCoy -= dt;
  for (const s of P.sk) if (s && s.t > 0) s.t -= dt;
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
    const mid = P.y + P.h * 0.5;
    if (solidPx(P.x - 1.5, mid)) P.wallDir = -1; else if (solidPx(P.x + P.w + 1.5, mid)) P.wallDir = 1;
  }
  if (P.wallDir) { P.wallLast = P.wallDir; P.wallCoy = 0.1; }
  P.clinging = !!(P.rune.spider && P.wallDir && !P.onGround && dirIn === P.wallDir && P.roll <= 0 && !P.pound && P.hurtT <= 0);

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
    applyMelee();
    if (P.atk.t >= P.atk.dur) {
      P.comboT = (P.atk.s.bash || P.atk.idx === WEAPONS[P.atk.wid].steps.length - 1) ? 0 : 0.38;
      P.atk = null;
    }
  }

  // déplacement horizontal
  if (P.roll > 0) {
    P.roll -= dt;
    P.vx = P.rollDir * 400 * U.rollMul;
    if (P.roll <= 0) { P.rollCd = 0.18; P.vx *= 0.4; }
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

  // sauts : mur, sol, double saut
  const wallTouch = P.wallDir !== 0 || P.wallCoy > 0;
  if (P.clinging) P.buf = 0;
  if (P.buf > 0 && P.roll <= 0 && P.hurtT <= 0 && !P.pound) {
    if (P.coyote > 0) {
      P.vy = -545; P.coyote = 0; P.buf = 0; P.onGround = false;
      burst(P.x + P.w / 2, P.y + P.h, 5, "#7f8fb5", 80, 0.25, 2, 60); SFX.jump();
    } else if (wallTouch && !P.onGround) {
      P.vy = -540; P.vx = -P.wallLast * 270; P.face = -P.wallLast; P.wjLock = 0.16; P.buf = 0; P.air = 1; P.wallCoy = 0;
      burst(P.x + (P.wallLast > 0 ? P.w : 0), P.y + P.h / 2, 8, "#9ffcff", 100, 0.3, 2, 60); SFX.jump();
    } else if (P.air > 0) {
      P.vy = -490; P.air--; P.buf = 0;
      burst(P.x + P.w / 2, P.y + P.h, 8, "#9ffcff", 110, 0.3, 2, 40); SFX.jump();
    }
  }
  if (!down("up") && P.vy < -230 && !P.pound) P.vy += 2400 * dt;       // saut plus court si on relâche

  // escalade (rune) ou glissade le long d'un mur
  if (P.clinging) {
    P.vy = down("up") ? -135 : (down("down") ? 135 : 0);
    if (down("up") && !solidPx(P.wallDir > 0 ? P.x + P.w + 1.5 : P.x - 1.5, P.y + 2)) { P.vy = -340; P.vx = P.wallDir * 140; }   // franchit le rebord
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

  moveBody(P, dt, !P.clinging);

  if (P.wallDir && !P.clinging && P.vy > 0 && dirIn === P.wallDir) P.vy = Math.min(P.vy, 95);

  if (P.pound && P.onGround) {                                           // impact de la frappe plongeante
    P.pound = false; shake = Math.max(shake, 15); hitstop = Math.max(hitstop, 0.08); SFX.boom();
    const cx = P.x + P.w / 2;
    burst(cx, P.y + P.h, 24, "#ffb020", 280, 0.6, 4);
    for (const e of enemies) {
      if (e.dead || e.state === "sleep") continue;
      if (Math.abs(e.x + e.w / 2 - cx) < 100 && Math.abs(e.y + e.h - (P.y + P.h)) < 60)
        damageEnemy(e, 26 * U.melee, (e.x + e.w / 2 < cx ? -1 : 1) * 260, 0.06, { stun: 0.7 });
    }
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

  // portes de sortie
  for (const d of doors) if (d.open && P.onGround && overlap(P, d)) { enterDoor(d); break; }
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
    const blk = sd.block + 0.1 * it.rar;
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
  P.hp -= d; P.inv = 0.9; P.hurtT = 0.22;
  P.vx = (P.x + P.w / 2 < srcX ? -1 : 1) * 230; P.vy = -230;
  P.atk = null; P.roll = 0; P.drawing = false; P.draw = 0; P.pound = false; P.guard = false; P.clinging = false;
  shake = Math.max(shake, 9); hitstop = Math.max(hitstop, 0.07); flashRed = 0.25;
  addText(P.x + P.w / 2, P.y - 6, "-" + d, "#ff4d6d");
  burst(P.x + P.w / 2, P.y + P.h / 2, 10, "#ff4d6d", 200, 0.45);
  SFX.hurt();
  if (P.hp <= 0) { P.hp = 0; die(); }
  return 0;
}

// ================================================================== ennemis
function stunEnemy(e, t) {
  if (e.type === "boss") {
    if (!["idle", "windC", "windS", "windM", "recC", "recS", "recM"].includes(e.state)) return;
    t = Math.min(t, 0.7); e.state = "idle"; e.cd = 0.8;
  } else {
    e.state = e.type === "archer" ? "aim" : e.type === "bat" ? "hunt" : "chase"; e.cd = Math.max(e.cd, 0.7);
  }
  e.stun = Math.max(e.stun, t);
  e.struck = true;
}

function damageEnemy(e, d, kx, hs, opt) {
  opt = opt || {};
  let crit = false;
  if (e.stun > 0) d *= 1.4;
  if (Math.random() < U.crit) { d *= 2; crit = true; }
  d = Math.round(d);
  e.hp -= d; e.flash = 0.12;
  if (!e.armor) {
    e.vx = kx;
    if (e.type !== "bat") { if (!(e.stun > 0)) { e.state = "stagger"; e.t = 0.2; } } else e.vy = -60;
  }
  if (opt.stun) stunEnemy(e, opt.stun);
  if (e.state === "sleep") { e.state = "idle"; e.cd = 0.8; }
  hitstop = Math.max(hitstop, hs || 0.04);
  shake = Math.max(shake, crit ? 7 : 3.5);
  addText(e.x + e.w / 2, e.y - 4, String(d), crit ? "#ffd23f" : "#ffffff");
  burst(e.x + e.w / 2, e.y + e.h / 2, 6, e.type === "boss" ? "#ffb020" : "#ff4d6d", 180, 0.35);
  SFX.hit();
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true; run.kills++;
  const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  const n = Math.round({ zombie: 1, archer: 1, bat: 1, brute: 3, boss: 30 }[e.type] * (S.cellMul || 1));
  for (let i = 0; i < n; i++) pickups.push({ x: ex, y: ey, w: 8, h: 8, vx: rnd(-130, 130), vy: rnd(-320, -120), kind: "cell", t: 0, wall: 0 });
  if (e.type !== "boss" && Math.random() < 0.12) pickups.push({ x: ex, y: ey, w: 10, h: 10, vx: rnd(-60, 60), vy: -200, kind: "orb", t: 0, wall: 0 });
  if (U.vamp > 0) P.hp = Math.min(U.maxHp, P.hp + U.vamp);

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

  burst(ex, ey, e.type === "boss" ? 60 : 16, e.type === "boss" ? "#ffb020" : "#ff2e97", e.type === "boss" ? 360 : 220, 0.7, 3);
  SFX.boom();
  shake = Math.max(shake, e.type === "boss" ? 16 : 5);
  if (e.type === "boss") {
    bossDead = true; for (const d of doors) d.open = true; hitstop = 0.3;
    for (const o of enemies) if (!o.dead && o !== e) { o.dead = true; burst(o.x, o.y, 8, "#b58bff", 160, 0.5); }
    toast("Le Concierge est tombé — la porte s'ouvre");
  }
}

function meleeBox(e, reach) { return { x: e.face > 0 ? e.x + e.w : e.x - reach, y: e.y - 2, w: reach, h: e.h + 4 }; }

function updateEnemy(e, dt) {
  e.flash -= dt; e.cd -= dt; e.t -= dt; e.bob += dt * 4;
  const px = P.x + P.w / 2, py = P.y + P.h / 2, ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  const dx = px - ex, dy = py - ey, ad = Math.abs(dx), ady = Math.abs(dy);

  if (e.stun > 0) {                                                   // étourdi : ne fait rien
    e.stun -= dt;
    e.vx = approach(e.vx, 0, 1200 * dt);
    if (e.fly) e.vy = approach(e.vy, 0, 600 * dt);
    moveBody(e, dt, !e.fly);
    return;
  }

  if (e.state === "stagger") {
    e.vx = approach(e.vx, 0, 900 * dt);
    if (e.t <= 0) e.state = e.type === "archer" ? "aim" : "chase";
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
  } else if (e.type === "boss") {
    bossAI(e, dt, dx, ad, ex);
  }

  moveBody(e, dt, !e.fly);

  const charging = e.type === "boss" && e.state === "charge";
  const cdm = charging ? e.dmg : e.contact;
  if (cdm > 0 && e.state !== "sleep" && overlap(e, P)) hurtPlayer(cdm, ex, { e, kind: charging ? "heavy" : "contact" });
}

function bossAI(e, dt, dx, ad, ex) {
  const ph2 = e.hp < e.maxHp * 0.5;
  switch (e.state) {
    case "sleep":
      e.vx = 0;
      if (ad < 520) { e.state = "idle"; e.cd = 1; toast("Le Concierge se réveille"); SFX.boom(); }
      break;
    case "idle": {
      e.face = dx > 0 ? 1 : -1;
      e.vx = approach(e.vx, ad > 150 ? e.face * 70 : 0, 400 * dt);
      if (e.cd <= 0) {
        const bats = enemies.filter((o) => !o.dead && o.type === "bat").length;
        const r = Math.random();
        if (ad > 280 || r < 0.38) { e.state = "windC"; e.t = ph2 ? 0.5 : 0.7; }
        else if (r < 0.75 || bats >= 3) { e.state = "windS"; e.t = ph2 ? 0.45 : 0.65; }
        else { e.state = "windM"; e.t = 0.8; }
        SFX.alert();
      }
      break;
    }
    case "windC":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "charge"; e.t = 0.7; e.vx = e.face * (ph2 ? 580 : 490); SFX.boom(); }
      break;
    case "charge":
      if (e.wall || e.t <= 0) {
        if (e.wall) { shake = Math.max(shake, 10); burst(e.x + e.w / 2, e.y + e.h / 2, 12, "#ffb020", 220, 0.5); }
        e.state = "recC"; e.t = 0.7; e.vx = 0;
      }
      break;
    case "recC":
      e.vx = approach(e.vx, 0, 1600 * dt);
      if (e.t <= 0) { e.state = "idle"; e.cd = ph2 ? 0.5 : 1.0; }
      break;
    case "windS":
      e.vx = 0; e.face = dx > 0 ? 1 : -1;
      if (e.t <= 0) { e.state = "air"; e.vy = -780; e.vx = clamp(dx * 1.1, -300, 300); e.t = 0.25; }
      break;
    case "air":
      if (e.onGround && e.t <= 0) {
        for (const dir of [-1, 1]) {
          shots.push({ x: ex + dir * 30 - 13, y: e.y + e.h - 16, vx: dir * (ph2 ? 380 : 310), vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 2.2, from: "e", kind: "wave", owner: e });
        }
        shake = Math.max(shake, 14); SFX.boom();
        burst(ex, e.y + e.h, 22, "#ffb020", 260, 0.6);
        e.state = "recS"; e.t = 0.8; e.vx = 0;
      }
      break;
    case "recS":
      e.vx = 0;
      if (e.t <= 0) { e.state = "idle"; e.cd = ph2 ? 0.5 : 1.0; }
      break;
    case "windM":
      e.vx = 0;
      if (e.t <= 0) {
        for (let i = 0; i < 2; i++) { const b = spawn("bat", ex + (i ? 60 : -60), e.y - 20); b.state = "hunt"; }
        burst(ex, e.y, 16, "#b58bff", 200, 0.5);
        e.state = "recM"; e.t = 0.6;
      }
      break;
    case "recM":
      e.vx = 0;
      if (e.t <= 0) { e.state = "idle"; e.cd = ph2 ? 0.6 : 1.1; }
      break;
  }
}

// ================================================================== projectiles, objets, compétences
function updateShots(dt) {
  for (const s of shots) {
    s.life -= dt;
    if (s.grav) s.vy += s.grav * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life <= 0) continue;
    const tc = Math.floor((s.x + s.w / 2) / T), tr = Math.floor((s.y + s.h / 2) / T);
    if (SOL(tileAt(tc, tr))) { s.life = 0; burst(s.x, s.y, 4, s.from === "p" ? "#9ffcff" : "#ffb020", 100, 0.25); continue; }
    if (s.from === "p") {
      for (const e of enemies) {
        if (e.dead || e.state === "sleep" || (s.hitSet && s.hitSet.has(e)) || !overlap(s, e)) continue;
        if (s.hitSet) s.hitSet.add(e);
        damageEnemy(e, s.dmg, s.vx > 0 ? 120 : -120, 0.03);
        if (s.bow && !e.dead) e.stuck.push(s.bow);
        else if (s.bow && e.dead) { /* déjà rendue via killEnemy ci-dessous */ s.bow.ammo = Math.min(bowMax(s.bow), s.bow.ammo + 1); }
        if (s.pierce > 0) s.pierce--; else s.life = 0;
        break;
      }
    } else if (overlap(s, P) && P.inv <= 0) {
      const res = hurtPlayer(s.dmg, s.x, { kind: s.kind === "wave" ? "heavy" : "proj", s, e: s.owner });
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
    if (boom) { b.dead = true; explode(b.x + 5, b.y + 5, 85, 45 * U.ranged, 0.5); }
  }
  bombs = bombs.filter((b) => !b.dead);

  for (const t of traps) {
    t.arm -= dt; t.t -= dt;
    if (t.arm <= 0) {
      for (const e of enemies) {
        if (e.dead || e.fly || e.state === "sleep" || !overlap(t, { x: e.x, y: e.y + e.h - 10, w: e.w, h: 14 })) continue;
        t.t = 0; burst(t.x + 10, t.y, 14, "#ffd23f", 220, 0.4);
        damageEnemy(e, 30 * U.ranged, 0, 0.07, { stun: 1.5 });
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
        shots.push({ x: t.x + 8, y: t.y + 4, vx: dx / m * 560, vy: dy / m * 560, w: 8, h: 4, dmg: 8 * U.ranged, life: 0.8, from: "p", kind: "bolt", hitSet: new Set(), pierce: 0 });
        t.cd = 0.5; sfx(900, 500, 0.05, "square", 0.025);
      }
    }
  }
  turrets = turrets.filter((t) => t.t > 0);
}

function updateParts(dt) {
  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}

// ================================================================== flux de jeu
function enterDoor(d) {
  if (scene !== "play") return;
  refillAmmo();
  SFX.heal();
  if (S.boss) { win(); return; }
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
function die() {
  scene = "dead"; bank(); SFX.boom();
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

function step(dt) {
  time += dt;
  if (toastT > 0) toastT -= dt;
  if (card.t > 0) card.t -= dt;
  flashRed = Math.max(0, flashRed - dt);
  shake *= Math.pow(0.0005, dt);
  if (shake < 0.2) shake = 0;

  if (scene === "menu") {
    cam.x = (Math.sin(time * 0.1) * 0.5 + 0.5) * Math.max(0, COLS * T - W);
    updateParts(dt);
    return;
  }
  if (scene === "pause" || scene === "choice" || scene === "win") return;
  if (hitstop > 0) { hitstop -= dt; return; }

  if (scene === "play") {
    run.time += dt;
    updatePlayer(dt);
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

  const tx = clamp(P.x + P.w / 2 + P.face * 60 - W / 2, 0, Math.max(0, COLS * T - W));
  const ty = clamp(P.y + P.h / 2 - H * 0.55, 0, ROWS * T - H);
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
}

// ================================================================== rendu
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  for (const L of layers) {
    ctx.fillStyle = L.col;
    const base = H + 40 - cam.y * L.f * 0.5;
    for (const s of L.shapes) {
      const x = s.x - cam.x * L.f;
      if (x > W || x + s.w < 0) continue;
      const top = base - s.h;
      ctx.fillRect(x, top, s.w, H - top + 60);
      if (s.arch) {
        ctx.fillStyle = S.bg[1];
        ctx.beginPath(); ctx.arc(x + s.w / 2, top + s.h * 0.45, s.w * 0.3, Math.PI, 0); ctx.lineTo(x + s.w / 2 + s.w * 0.3, top + s.h + 90); ctx.lineTo(x + s.w / 2 - s.w * 0.3, top + s.h + 90); ctx.fill();
        ctx.fillStyle = L.col;
      }
    }
  }
  if (S.fog) {
    const f = ctx.createLinearGradient(0, H * 0.55, 0, H);
    f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(1, S.fog);
    ctx.globalAlpha = 0.14; ctx.fillStyle = f; ctx.fillRect(0, H * 0.55, W, H * 0.45); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = S.accent;
  for (const m of motes) {
    const x = ((m.x - cam.x * 0.1 * m.s + Math.sin(time * 0.4 + m.p) * 14) % W + W) % W;
    const y = ((m.y - time * 6 * m.s - cam.y * 0.1) % H + H) % H;
    ctx.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.6 + m.p));
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawTiles() {
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(COLS - 1, c0 + Math.ceil(W / T) + 1);
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(ROWS - 1, r0 + Math.ceil(H / T) + 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = grid[r][c];
      if (!t) continue;
      const x = c * T, y = r * T;
      if (t === 1 || t === 4 || t === 5) {
        ctx.fillStyle = ((c * 7 + r * 13) % 5 === 0) ? S.tile2 : S.tile;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x, y + T - 2, T, 2); ctx.fillRect(x + T - 2, y, 2, T);
        if (t === 1 && !SOL(tileAt(c, r - 1))) {
          ctx.fillStyle = S.edge; ctx.fillRect(x, y, T, 4);
          ctx.globalAlpha = 0.6; ctx.fillStyle = S.accent; ctx.fillRect(x, y, T, 2); ctx.globalAlpha = 1;
        }
        if (t === 4 || t === 5) {                                     // fissures
          ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(x, y, T, T);
          ctx.strokeStyle = t === 4 ? "#c9a54a" : "#ffb020"; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + 14, y + 14); ctx.lineTo(x + 9, y + 20); ctx.lineTo(x + 20, y + 29);
          ctx.moveTo(x + 26, y + 3); ctx.lineTo(x + 18, y + 13);
          ctx.stroke();
          if (cracks.get(r * COLS + c)) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x, y, T, T); }
          const gl = 0.25 + 0.2 * Math.sin(time * 3 + c + r);
          ctx.globalAlpha = gl; ctx.fillStyle = "#ffd23f"; ctx.fillRect(x + 12, y + 12, 3, 3); ctx.globalAlpha = 1;
        }
      } else if (t === 2) {
        ctx.fillStyle = S.edge; ctx.fillRect(x, y, T, 7);
        ctx.fillStyle = S.accent; ctx.fillRect(x, y, T, 2);
        ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(x + 3, y + 7, 3, 6); ctx.fillRect(x + T - 6, y + 7, 3, 6);
      } else if (t === 3) {
        for (let i = 0; i < 3; i++) {
          const sx = x + i * 11 - 1;
          ctx.fillStyle = "#ff2e97";
          ctx.beginPath(); ctx.moveTo(sx, y + T); ctx.lineTo(sx + 5.5, y + 16); ctx.lineTo(sx + 11, y + T); ctx.fill();
          ctx.fillStyle = "#ffd0e8"; ctx.fillRect(sx + 5, y + 18, 1, 6);
        }
      }
    }
  }
}

function glow(x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}

function drawTorches() {
  const vis = (t) => t.x > cam.x - 120 && t.x < cam.x + W + 120 && t.y > cam.y - 120 && t.y < cam.y + H + 120;
  ctx.globalCompositeOperation = "lighter";
  for (const t of torches) {
    if (!vis(t)) continue;
    const fl = 0.8 + 0.2 * Math.sin(time * 9 + t.s) + 0.1 * Math.sin(time * 23 + t.s * 2);
    glow(t.x, t.y, 110 * fl, S.accent, 0.28);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const t of torches) {
    if (!vis(t)) continue;
    rect(t.x - 2, t.y, 4, 14, "#2a2f4a");
    rect(t.x - 5, t.y - 2, 10, 4, "#3a4068");
    const fl = 6 + Math.sin(time * 12 + t.s) * 2;
    ctx.fillStyle = S.accent;
    ctx.beginPath(); ctx.moveTo(t.x - 4, t.y - 2); ctx.lineTo(t.x, t.y - 2 - fl - 6); ctx.lineTo(t.x + 4, t.y - 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(t.x - 2, t.y - 2); ctx.lineTo(t.x, t.y - 2 - fl); ctx.lineTo(t.x + 2, t.y - 2); ctx.fill();
  }
}

function drawDoors() {
  for (const d of doors) {
    const nb = BIOMES[d.next], col = nb.accent;
    rect(d.x - 4, d.y - 6, d.w + 8, d.h + 6, "#0b0d1a");
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(d.x - 2, d.y - 4, d.w + 4, d.h + 4);
    if (d.open) {
      const p = 0.55 + 0.25 * Math.sin(time * 4);
      ctx.globalCompositeOperation = "lighter";
      glow(d.x + d.w / 2, d.y + d.h / 2, 90, col, 0.35 * p + 0.1);
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,.2)");
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 4); ctx.fillStyle = g; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.globalAlpha = 1;
    } else {
      rect(d.x, d.y, d.w, d.h, "#161320");
      ctx.strokeStyle = "#555a78"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y + 12); ctx.lineTo(d.x + d.w, d.y + 30); ctx.moveTo(d.x, d.y + 40); ctx.lineTo(d.x + d.w, d.y + 20); ctx.stroke();
    }
    if (!S.boss && Math.abs(P.x - d.x) < 520) {                       // étiquette de destination
      ctx.textAlign = "center";
      ctx.fillStyle = col; ctx.font = "bold 15px 'Rajdhani', sans-serif";
      ctx.fillText(nb.name.toUpperCase(), d.x + d.w / 2, d.y - 34);
      ctx.fillStyle = "#c8d2f0"; ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.fillText("☠".repeat(nb.diff) + (nb.rewardTxt ? " · " + nb.rewardTxt : ""), d.x + d.w / 2, d.y - 18);
    }
  }
}

function wIcon(id, x, y, s, col) {
  ctx.save(); ctx.translate(x + s / 2, y + s / 2);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(2, s / 9); ctx.lineCap = "round";
  const k = s / 2 - 3;
  if (id === "sword") { ctx.beginPath(); ctx.moveTo(-k * .7, k * .7); ctx.lineTo(k * .8, -k * .8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-k * .5, k * .1); ctx.lineTo(-k * .1, k * .5); ctx.stroke(); }
  else if (id === "dagger") { ctx.beginPath(); ctx.moveTo(-k * .8, k * .4); ctx.lineTo(0, -k * .5); ctx.moveTo(-k * .1, k * .8); ctx.lineTo(k * .8, -k * .2); ctx.stroke(); }
  else if (id === "hammer") { ctx.beginPath(); ctx.moveTo(-k * .6, k * .8); ctx.lineTo(k * .4, -k * .3); ctx.stroke(); ctx.fillRect(-k * .1, -k * .9, k * 1.1, k * .6); }
  else if (id === "spear") { ctx.beginPath(); ctx.moveTo(-k * .8, k * .8); ctx.lineTo(k * .6, -k * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k * .4, -k * .9); ctx.lineTo(k * .9, -k * .9); ctx.lineTo(k * .9, -k * .4); ctx.fill(); }
  else if (id === "bow" || id === "longbow") { ctx.beginPath(); ctx.arc(-k * .3, 0, k * (id === "bow" ? .9 : 1.1), -1.2, 1.2); ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-k * .3 + Math.cos(-1.2) * k, -Math.sin(1.2) * k); ctx.lineTo(-k * .3 + Math.cos(1.2) * k, Math.sin(1.2) * k); ctx.stroke(); }
  else if (id === "shield" || id === "tower") { ctx.beginPath(); const w2 = id === "tower" ? k * .8 : k * .7; ctx.moveTo(-w2, -k * .8); ctx.lineTo(w2, -k * .8); ctx.lineTo(w2, k * .1); ctx.lineTo(0, k * .95); ctx.lineTo(-w2, k * .1); ctx.closePath(); ctx.stroke(); }
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

function drawProps() {
  for (const p of props) {
    if (p.x + p.w < cam.x - 60 || p.x > cam.x + W + 60) continue;
    if (p.kind === "chest") {
      const cx = p.x + p.w / 2;
      if (!p.open) { ctx.globalCompositeOperation = "lighter"; glow(cx, p.y + 8, 40, "#ffd23f", 0.3 + 0.15 * Math.sin(time * 4)); ctx.globalCompositeOperation = "source-over"; }
      rect(p.x, p.y + 8, p.w, 14, "#5a3a1a"); rect(p.x, p.y + 8, p.w, 3, "#8a5a2a");
      if (!p.open) { rect(p.x, p.y, p.w, 9, "#6a4220"); rect(cx - 3, p.y + 6, 6, 7, "#ffd23f"); }
      else { rect(p.x - 2, p.y - 6, 5, 12, "#6a4220"); }
      rect(p.x + 2, p.y + 8, 3, 14, "#c9a54a"); rect(p.x + p.w - 5, p.y + 8, 3, 14, "#c9a54a");
    } else if (p.kind === "item") {
      const it = p.item, bob = Math.sin(time * 3 + p.bob) * 3;
      const col = it.kind === "weapon" ? RAR[it.rar].c : SKILLS[it.id].col;
      if (p.altar) { rect(p.x - 6, p.y + 22 + bob * 0, p.w + 12, 8, "#2a2f4a"); rect(p.x - 3, p.y + 18, p.w + 6, 6, "#3a4068"); }
      ctx.globalCompositeOperation = "lighter"; glow(p.x + 11, p.y + 11 + bob, 38, col, 0.4); ctx.globalCompositeOperation = "source-over";
      if (it.kind === "weapon") wIcon(it.id, p.x - 3, p.y - 3 + bob, 28, col); else sIcon(it.id, p.x - 3, p.y - 3 + bob, 28, col);
    } else if (p.kind === "totem") {
      rect(p.x, p.y, p.w, p.h, "#2a2f4a"); rect(p.x + 2, p.y + 2, p.w - 4, 6, "#3a4068");
      ctx.fillStyle = p.flash > 0 ? "#fff" : "#ff2e97"; ctx.fillRect(p.x + 4, p.y + 12, 6, 5); ctx.fillRect(p.x + 14, p.y + 12, 6, 5);
      rect(p.x - 4, p.y + 20, 8, 6, "#1a1e34");
    }
  }
  // indication d'interaction
  const n = scene === "play" ? nearestProp() : null;
  if (n) {
    ctx.textAlign = "center"; ctx.font = "bold 14px 'Rajdhani', sans-serif";
    let label = "F : ouvrir", col = "#ffd23f";
    if (n.kind === "item") {
      const it = n.item;
      if (it.kind === "weapon") { label = "F : " + WEAPONS[it.id].name + " (" + RAR[it.rar].n + ")"; col = RAR[it.rar].c; }
      else { label = "F : " + SKILLS[it.id].name; col = SKILLS[it.id].col; }
    }
    ctx.fillStyle = "rgba(0,0,0,.65)"; const tw = ctx.measureText(label).width + 12; ctx.fillRect(n.x + n.w / 2 - tw / 2, n.y - 36, tw, 20);
    ctx.fillStyle = col; ctx.fillText(label, n.x + n.w / 2, n.y - 21);
  }
}

function drawFx() {
  for (const b of bombs) {
    rect(b.x, b.y, b.w, b.h, "#2a2f4a");
    ctx.fillStyle = Math.floor(time * 12) % 2 ? "#ff4d4d" : "#ffd23f"; ctx.fillRect(b.x + 3, b.y - 3, 4, 4);
  }
  for (const t of traps) {
    ctx.fillStyle = t.arm > 0 ? "#7f8fb5" : "#ffd23f";
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(t.x + i * 7, t.y + 6); ctx.lineTo(t.x + i * 7 + 3, t.y - 4); ctx.lineTo(t.x + i * 7 + 6, t.y + 6); ctx.fill(); }
  }
  for (const t of turrets) {
    rect(t.x, t.y + 8, t.w, 10, "#2a3a4a"); rect(t.x + 2, t.y + 8, t.w - 4, 3, "#00f0ff");
    ctx.save(); ctx.translate(t.x + 10, t.y + 6); ctx.rotate(t.ang); rect(0, -2, 14, 4, "#9ffcff"); ctx.restore();
  }
}

function drawPlayer() {
  const cx = P.x + P.w / 2;
  const w = aw(), wd = w ? WEAPONS[w.id] : null;
  ctx.save();
  if (scene === "dead") {
    ctx.translate(cx, P.y + P.h); ctx.rotate(P.face * Math.PI / 2); ctx.translate(-cx, -(P.y + P.h));
  } else if (P.inv > 0 && P.roll <= 0 && !P.guard && Math.floor(time * 26) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  const y = Math.round(P.y), f = P.face;
  if (P.roll > 0) {
    const a = (1 - P.roll / 0.38) * Math.PI * 2 * f;
    ctx.translate(cx, P.y + P.h - 10); ctx.rotate(a);
    rect(-9, -10, 18, 18, "#1a2340");
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2; ctx.strokeRect(-9, -10, 18, 18);
    rect(-2 * f + 1, -7, 6, 3, "#00f0ff");
  } else if (P.pound) {
    ctx.translate(cx, P.y + P.h / 2); ctx.scale(0.8, 1.2); ctx.translate(-cx, -(P.y + P.h / 2));
    rect(cx - 8, y + 2, 16, 26, "#1a2340"); rect(cx - 8, y + 2, 16, 3, "#ffb020");
    glow(cx, y + 36, 30, "#ffb020", 0.5);
  } else {
    const runA = P.onGround && Math.abs(P.vx) > 25 ? Math.sin(time * 16) : 0;
    rect(cx - 7 + runA * 3, y + 22, 6, 8, "#0d1020"); rect(cx - 7 + runA * 3, y + 28, 7, 2, "#00f0ff");
    rect(cx + 1 - runA * 3, y + 22, 6, 8, "#0d1020"); rect(cx + 1 - runA * 3, y + 28, 7, 2, "#00f0ff");
    ctx.strokeStyle = "#ff2e97"; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(cx - f * 3, y + 11);
    ctx.lineTo(cx - f * (12 + Math.min(14, Math.abs(P.vx) * 0.04)), y + 12 + Math.sin(time * 10) * 3 + (P.vy > 0 ? -1.5 : 1.5));
    ctx.stroke();
    rect(cx - 9, y + 10, 18, 14, "#1a2340");
    rect(cx - 9, y + 10, 18, 2, P.clinging ? "#3dff9a" : "#00f0ff");
    ctx.fillStyle = "#10152a";
    ctx.beginPath(); ctx.moveTo(cx - f * 9, y + 11); ctx.lineTo(cx - f * 15, y + 25); ctx.lineTo(cx - f * 8, y + 25); ctx.fill();
    rect(cx - 7, y, 14, 12, "#10152a");
    rect(cx - 7, y, 14, 2, "#232c52");
    ctx.fillStyle = "#00f0ff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
    ctx.fillRect(cx + (f > 0 ? -1 : -7), y + 4, 8, 3);
    ctx.shadowBlur = 0;
    // arme tenue
    if (wd) {
      ctx.lineCap = "round";
      if (wd.type === "shield") {
        const sh = P.guard ? 1 : 0, big = w.id === "tower";
        const sx = cx + f * (sh ? 10 : -9), sw = sh ? (big ? 10 : 8) : 5, shh = sh ? (big ? 32 : 26) : 18;
        ctx.fillStyle = wd.col; ctx.fillRect(sx - sw / 2, y + (sh ? 0 : 8), sw, shh);
        ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(sx - sw / 2, y + (sh ? 0 : 8), sw, 3);
        if (sh && P.guardT <= wd.parry + 0.03 * w.rar) { ctx.globalCompositeOperation = "lighter"; glow(sx, y + 14, 34, "#ffd23f", 0.7); ctx.globalCompositeOperation = "source-over"; }
      } else if (wd.type === "bow") {
        const px = cx + f * 12;
        ctx.strokeStyle = wd.col; ctx.lineWidth = 3; ctx.beginPath();
        ctx.arc(px - f * 4, y + 14, 14, f > 0 ? -1.2 : Math.PI - 1.2, f > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath();
        const pull = P.drawing ? clamp(P.draw / wd.chargeT, 0, 1) * 10 : 0;
        ctx.moveTo(px - f * 4 + Math.cos(f > 0 ? -1.2 : Math.PI - 1.2) * 14, y + 14 - 13); ctx.lineTo(px - f * (4 + pull), y + 14); ctx.lineTo(px - f * 4 + Math.cos(f > 0 ? 1.2 : Math.PI + 1.2) * 14, y + 14 + 13); ctx.stroke();
        if (P.drawing) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - f * (4 + pull), y + 14); ctx.lineTo(px + f * 14, y + 14); ctx.stroke(); }
      } else if (!P.atk) {
        ctx.strokeStyle = wd.col; ctx.lineWidth = w.id === "hammer" ? 4 : 3; ctx.beginPath();
        if (w.id === "spear") { ctx.moveTo(cx + f * 6, y + 26); ctx.lineTo(cx + f * 12, y - 8); }
        else if (w.id === "hammer") { ctx.moveTo(cx + f * 7, y + 22); ctx.lineTo(cx + f * 14, y + 4); ctx.stroke(); ctx.fillStyle = wd.col; ctx.fillRect(cx + f * 14 - 6, y, 12, 7); ctx.beginPath(); }
        else { ctx.moveTo(cx + f * 8, y + 20); ctx.lineTo(cx + f * 15, y + 8); }
        ctx.stroke();
      }
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
    if (a.s.thin) {                                                   // lance : coup d'estoc
      const len = a.s.reach * (0.4 + 0.6 * Math.sin(p * Math.PI * 0.9 + 0.2));
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + len, 0); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(6 + len, -6); ctx.lineTo(6 + len + 14, 0); ctx.lineTo(6 + len, 6); ctx.fill();
    } else if (a.s.bash) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.5 * (1 - p); ctx.beginPath(); ctx.arc(22, 0, 14 + p * 20, 0, 7); ctx.fill();
    } else {
      const ang = (q) => (a.idx % 2 === 1 ? 1.1 - 2.3 * q : -1.2 + 2.3 * q);
      const p0 = Math.max(0, p - 0.55), R = a.s.reach * 0.82;
      ctx.lineWidth = a.wid === "hammer" ? 13 : a.wid === "dagger" ? 5 : (a.idx === 2 ? 11 : 7);
      ctx.beginPath(); ctx.arc(0, 0, R, Math.min(ang(p0), ang(p)), Math.max(ang(p0), ang(p))); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(Math.cos(ang(p)) * (R + 2), Math.sin(ang(p)) * (R + 2)); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawEnemy(e) {
  const cx = e.x + e.w / 2, x = Math.round(e.x), y = Math.round(e.y), f = e.face;
  const fl = e.flash > 0;
  const wind = e.state === "wind" || e.state === "windC" || e.state === "windS" || e.state === "windM";
  const col = (c) => (fl ? "#ffffff" : c);
  const walk = Math.abs(e.vx) > 15 ? Math.sin(time * 12 + e.bob) : 0;
  ctx.save();
  if (e.state === "sleep") ctx.globalAlpha = 0.85;

  if (e.type === "zombie") {
    rect(cx - 7 + walk * 3, y + 22, 6, 8, col("#2a3a2a")); rect(cx + 1 - walk * 3, y + 22, 6, 8, col("#2a3a2a"));
    rect(cx - 9, y + 9, 18, 14, col("#3f5a3f"));
    rect(cx - 7, y, 14, 11, col("#6f8f6f"));
    rect(cx + (f > 0 ? 1 : -5), y + 4, 4, 3, col("#ffd23f"));
    const ay = wind ? y + 2 : (e.state === "strike" ? y + 14 : y + 12);
    rect(cx + (f > 0 ? 4 : -22), ay, 18, 5, col("#4f6e4f"));
    if (e.state === "strike") { ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(f > 0 ? e.x + e.w : e.x - 34, y + 4, 34, 20); }
  } else if (e.type === "archer") {
    rect(cx - 5 + walk * 2, y + 21, 4, 9, col("#b9c0d4")); rect(cx + 1 - walk * 2, y + 21, 4, 9, col("#b9c0d4"));
    rect(cx - 7, y + 9, 14, 13, col("#d6dcec"));
    for (let i = 0; i < 3; i++) rect(cx - 6, y + 12 + i * 3, 12, 1, col("#7f8fb5"));
    rect(cx - 6, y, 12, 10, col("#eef1fa"));
    rect(cx + (f > 0 ? 1 : -5), y + 3, 3, 3, col("#10050a"));
    ctx.strokeStyle = fl ? "#fff" : "#a5703a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx + f * 10, y + 14, 12, f > 0 ? -1.3 : Math.PI - 1.3, f > 0 ? 1.3 : Math.PI + 1.3); ctx.stroke();
    if (e.state === "wind") { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + f * 2, y + 14); ctx.lineTo(cx + f * 22, y + 14); ctx.stroke(); }
  } else if (e.type === "bat") {
    const fl2 = Math.sin(time * 18 + e.bob) * 7;
    ctx.fillStyle = col("#5a2a8a");
    ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx - 20, y - 4 + fl2); ctx.lineTo(cx - 8, y + 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx + 20, y - 4 + fl2); ctx.lineTo(cx + 8, y + 12); ctx.fill();
    ctx.fillStyle = col("#3a1a5a"); ctx.beginPath(); ctx.ellipse(cx, y + 8, 7, 7, 0, 0, Math.PI * 2); ctx.fill();
    rect(cx - 4, y + 6, 2, 2, col("#ff4d6d")); rect(cx + 2, y + 6, 2, 2, col("#ff4d6d"));
  } else if (e.type === "brute") {
    rect(cx - 11 + walk * 2, y + 30, 9, 12, col("#2a1818")); rect(cx + 2 - walk * 2, y + 30, 9, 12, col("#2a1818"));
    rect(cx - 15, y + 10, 30, 22, col("#6a2a2a"));
    rect(cx - 17, y + 8, 12, 9, col("#8a8f9f")); rect(cx + 5, y + 8, 12, 9, col("#8a8f9f"));
    rect(cx - 8, y, 16, 12, col("#4a4f60"));
    rect(cx + (f > 0 ? 1 : -7), y + 4, 6, 3, col("#ff4d6d"));
    const up = e.state === "wind";
    ctx.save(); ctx.translate(cx + f * 14, y + 14); ctx.rotate(up ? -f * 1.9 : e.state === "strike" ? f * 1.2 : f * 0.2);
    rect(-3, -2, 6, 30, col("#555a70")); rect(-8, 24, 16, 12, col("#7a7f95")); ctx.restore();
  } else if (e.type === "boss") {
    const ph2 = e.hp < e.maxHp * 0.5;
    ctx.globalCompositeOperation = "lighter";
    glow(cx, y + 30, 120, ph2 ? "#ff2e97" : "#ffb020", 0.22 + (wind ? 0.2 : 0));
    ctx.globalCompositeOperation = "source-over";
    rect(cx - 18 + walk * 3, y + 56, 14, 20, col("#1a1424")); rect(cx + 4 - walk * 3, y + 56, 14, 20, col("#1a1424"));
    rect(cx - 26, y + 18, 52, 42, col("#231a2e"));
    rect(cx - 26, y + 18, 52, 4, col("#ffb020")); rect(cx - 26, y + 56, 52, 4, col("#ffb020"));
    rect(cx - 30, y + 14, 16, 14, col("#3a2f4a")); rect(cx + 14, y + 14, 16, 14, col("#3a2f4a"));
    rect(cx - 14, y, 28, 22, col("#2c2238"));
    ctx.fillStyle = col("#ffb020");
    ctx.beginPath(); ctx.moveTo(cx - 14, y); ctx.lineTo(cx - 10, y - 12); ctx.lineTo(cx - 4, y); ctx.lineTo(cx, y - 14); ctx.lineTo(cx + 4, y); ctx.lineTo(cx + 10, y - 12); ctx.lineTo(cx + 14, y); ctx.fill();
    ctx.fillStyle = e.state === "sleep" ? "#6a4a10" : (ph2 ? "#ff2e97" : "#ffd23f");
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.fillRect(cx + (f > 0 ? 0 : -12), y + 8, 12, 5); ctx.shadowBlur = 0;
    ctx.save(); ctx.translate(cx + f * 26, y + 30);
    ctx.rotate(e.state === "air" ? -f * 2.2 : wind ? -f * 1.6 : f * 0.3);
    rect(-3, -4, 6, 54, col("#c9a54a")); rect(-3, 40, 14, 5, col("#c9a54a")); rect(-3, 48, 10, 4, col("#c9a54a"));
    ctx.strokeStyle = fl ? "#fff" : "#c9a54a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -10, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (e.state === "charge") { ctx.fillStyle = "rgba(255,176,32,.25)"; ctx.fillRect(e.x - f * 40, y + 10, e.w, e.h - 10); }
  }

  if (e.stun > 0) {                                                   // étoiles d'étourdissement
    ctx.fillStyle = "#ffd23f";
    for (let i = 0; i < 3; i++) { const a = time * 7 + i * 2.1; ctx.fillRect(cx + Math.cos(a) * 11 - 2, y - 10 + Math.sin(a) * 3, 4, 4); }
  } else if (wind && e.type !== "boss") {
    ctx.fillStyle = "#ffd23f"; ctx.font = "bold 16px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("!", cx, y - 8);
  } else if (e.type === "boss" && wind) {
    ctx.fillStyle = "#ffd23f"; ctx.font = "bold 22px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("!", cx, y - 20);
  }
  if (e.hp < e.maxHp && e.type !== "boss") {
    rect(cx - 13, y - 14, 26, 3, "#2a0d14"); rect(cx - 13, y - 14, 26 * clamp(e.hp / e.maxHp, 0, 1), 3, "#ff4d6d");
  }
  ctx.restore();
}

function drawShots() {
  for (const s of shots) {
    if (s.kind === "wave") {
      ctx.globalCompositeOperation = "lighter";
      glow(s.x + s.w / 2, s.y + s.h / 2, 30, "#ffb020", 0.6);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath(); ctx.moveTo(s.x, s.y + s.h); ctx.lineTo(s.x + s.w / 2, s.y); ctx.lineTo(s.x + s.w, s.y + s.h); ctx.fill();
    } else if (s.kind === "arrow") {
      const mine = s.from === "p";
      ctx.save(); ctx.translate(s.x + s.w / 2, s.y + s.h / 2); ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = mine ? "#e8d9a0" : "#ffb020"; ctx.fillRect(-s.w / 2, -1.5, s.w, 3);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(s.w / 2, -4); ctx.lineTo(s.w / 2 + 6, 0); ctx.lineTo(s.w / 2, 4); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = "#9ffcff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
      ctx.fillRect(s.x, s.y, s.w, s.h); ctx.shadowBlur = 0;
    }
  }
}

function drawPickups() {
  for (const p of pickups) {
    if (p.kind === "cell") {
      ctx.fillStyle = "#00f0ff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(p.x + 4, p.y - 2); ctx.lineTo(p.x + 9, p.y + 4); ctx.lineTo(p.x + 4, p.y + 10); ctx.lineTo(p.x - 1, p.y + 4); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "#3dff9a"; ctx.shadowColor = "#3dff9a"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x + 5, p.y + 5, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      rect(p.x + 3, p.y + 1, 4, 8, "#06140f"); rect(p.x + 1, p.y + 3, 8, 4, "#06140f");
    }
  }
}

function drawParts() {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    if (p.ring) {
      ctx.strokeStyle = p.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, (1 - a) * 150 + 10, 0, 7); ctx.stroke();
    } else if (p.txt) {
      ctx.fillStyle = p.col; ctx.font = "bold 16px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText(p.txt, p.x, p.y);
    } else {
      ctx.fillStyle = p.col; const s = p.size * (0.4 + 0.6 * a); ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const mx = 20, my = 16, bw = 230;
  rect(mx - 3, my - 3, bw + 6, 20, "rgba(0,0,0,.55)");
  rect(mx, my, bw, 14, "#2a0d14");
  const hpP = clamp(P.hp / U.maxHp, 0, 1);
  const g = ctx.createLinearGradient(mx, 0, mx + bw, 0);
  g.addColorStop(0, "#ff4d6d"); g.addColorStop(1, "#ff2e97");
  ctx.fillStyle = g; ctx.fillRect(mx, my, bw * hpP, 14);
  for (let i = 1; i < 10; i++) rect(mx + (bw / 10) * i, my, 1, 14, "rgba(0,0,0,.35)");
  ctx.fillStyle = "#fff"; ctx.font = "13px 'Share Tech Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(Math.ceil(P.hp) + " / " + U.maxHp, mx + 6, my + 11);
  for (let i = 0; i < U.flasks; i++) {
    const fx = mx + i * 20, fy = my + 24, full = i < P.flasks;
    ctx.fillStyle = full ? "#3dff9a" : "#1a3a2a";
    ctx.fillRect(fx + 3, fy, 8, 4); ctx.fillRect(fx, fy + 4, 14, 12);
    if (full) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(fx + 2, fy + 6, 3, 8); }
  }
  if (P.rune.spider || P.rune.breaker) {
    ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillStyle = "#b58bff";
    ctx.fillText((P.rune.spider ? "◈ ARAIGNÉE  " : "") + (P.rune.breaker ? "◈ BRISEUR" : ""), mx, my + 52);
  }
  ctx.textAlign = "right"; ctx.fillStyle = "#00f0ff"; ctx.font = "bold 18px 'Share Tech Mono', monospace";
  ctx.fillText("◆ " + run.cells, W - 20, 30);
  ctx.fillStyle = "#7f8fb5"; ctx.font = "12px 'Share Tech Mono', monospace";
  ctx.fillText("ÉTAGE " + (depth + 1) + "/" + (LAST + 1) + (loop ? " · BOUCLE " + (loop + 1) : ""), W - 20, 48);

  // armes (bas gauche)
  for (let i = 0; i < 2; i++) {
    const it = P.wp[i], x = 14 + i * 166, y = H - 58, act = i === P.wi;
    ctx.fillStyle = "rgba(0,0,0,.62)"; ctx.fillRect(x, y, 158, 46);
    ctx.strokeStyle = it ? RAR[it.rar].c : "#333a55"; ctx.lineWidth = act ? 3 : 1; ctx.globalAlpha = act ? 1 : 0.6; ctx.strokeRect(x + 0.5, y + 0.5, 157, 45);
    if (it) {
      const wdh = WEAPONS[it.id];
      wIcon(it.id, x + 4, y + 7, 32, wdh.col);
      ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 13px 'Rajdhani', sans-serif"; ctx.fillText(wdh.name, x + 40, y + 19);
      ctx.fillStyle = RAR[it.rar].c; ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillText(RAR[it.rar].n, x + 40, y + 33);
      if (wdh.type === "bow") {
        const mxA = bowMax(it);
        ctx.fillStyle = it.ammo > 0 ? "#ffd23f" : "#ff4d6d"; ctx.textAlign = "right"; ctx.font = "bold 13px 'Share Tech Mono', monospace";
        ctx.fillText("➶ " + it.ammo + "/" + mxA, x + 152, y + 33);
      }
    } else { ctx.fillStyle = "#555a78"; ctx.font = "12px 'Share Tech Mono', monospace"; ctx.textAlign = "left"; ctx.fillText("— vide —", x + 40, y + 28); }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left"; ctx.fillStyle = "#7f8fb5"; ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.fillText("R : changer d'arme", 16, H - 64);

  // compétences (bas droite)
  for (let i = 0; i < 2; i++) {
    const s = P.sk[i], x = W - 14 - (2 - i) * 56, y = H - 58;
    ctx.fillStyle = "rgba(0,0,0,.62)"; ctx.fillRect(x, y, 50, 46);
    ctx.strokeStyle = s ? SKILLS[s.id].col : "#333a55"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 49, 45);
    if (s) {
      sIcon(s.id, x + 9, y + 5, 32, SKILLS[s.id].col);
      if (s.t > 0) {
        const fr = s.t / (SKILLS[s.id].cd * U.cdMul);
        ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x, y + 46 * (1 - fr), 50, 46 * fr);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 14px 'Share Tech Mono', monospace"; ctx.fillText(Math.ceil(s.t), x + 25, y + 28);
      }
    }
    ctx.fillStyle = "#7f8fb5"; ctx.textAlign = "center"; ctx.font = "11px 'Share Tech Mono', monospace"; ctx.fillText(i ? "I" : "U", x + 8, y + 12);
  }

  const boss = enemies.find((o) => o.type === "boss" && !o.dead && o.state !== "sleep");
  if (boss) {
    const bw2 = 360, bx = (W - bw2) / 2, by = 26;
    rect(bx - 3, by - 3, bw2 + 6, 22, "rgba(0,0,0,.65)");
    rect(bx, by, bw2, 16, "#2a1a08");
    const ph2 = boss.hp < boss.maxHp * 0.5;
    rect(bx, by, bw2 * clamp(boss.hp / boss.maxHp, 0, 1), 16, ph2 ? "#ff2e97" : "#ffb020");
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "13px 'Share Tech Mono', monospace";
    ctx.fillText("LE CONCIERGE", W / 2, by - 8);
  }

  if (card.t > 0) {
    const a = clamp(card.t / 0.8, 0, 1) * clamp((3.2 - card.t) / 0.5, 0, 1);
    ctx.globalAlpha = a; ctx.textAlign = "center";
    ctx.fillStyle = "#7f8fb5"; ctx.font = "14px 'Share Tech Mono', monospace"; ctx.fillText("// " + card.sub.toUpperCase(), W / 2, 130);
    ctx.fillStyle = S.accent; ctx.font = "bold 40px 'Rajdhani', sans-serif"; ctx.shadowColor = S.accent; ctx.shadowBlur = 16;
    ctx.fillText(card.text.toUpperCase(), W / 2, 168); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (toastT > 0) {
    ctx.globalAlpha = clamp(toastT, 0, 1); ctx.textAlign = "center";
    ctx.fillStyle = "#ffd23f"; ctx.font = "bold 20px 'Rajdhani', sans-serif"; ctx.fillText(toastTxt, W / 2, 96); ctx.globalAlpha = 1;
  }
}

function render() {
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));
  drawTiles();
  drawTorches();
  drawDoors();
  if (scene !== "menu") {
    drawProps();
    drawFx();
    drawPickups();
    for (const e of enemies) if (e.x + e.w > cam.x - 80 && e.x < cam.x + W + 80 && e.y + e.h > cam.y - 80 && e.y < cam.y + H + 80) drawEnemy(e);
    drawShots();
    drawPlayer();
    drawParts();
  }
  ctx.restore();

  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (flashRed > 0) { ctx.fillStyle = "rgba(255,40,80," + (flashRed * 0.9) + ")"; ctx.fillRect(0, 0, W, H); }
  if (scene === "play" || scene === "pause" || scene === "dead" || scene === "choice") drawHUD();
}

// ================================================================== panneaux HTML
function setOv(html) { ov.innerHTML = html; ov.hidden = false; }
function hideOv() { ov.hidden = true; ov.innerHTML = ""; }

function showMenu() {
  scene = "menu";
  genLevel("cachots", 0, false);
  cam.y = clamp(30 * T - H + 100, 0, ROWS * T - H);
  setOv(`<div class="card">
    <p class="tag">// accès niveau 7 autorisé</p>
    <h1>CRYPTE <span>NÉON</span></h1>
    <p class="lead">Descends cinq étages dans les entrailles d'un réseau oublié. Équipe deux armes, roule, parade, grimpe — et rapporte des cellules à la Forge pour revenir plus fort.</p>
    <div class="btns">
      <button class="btn primary" data-act="play">Descendre</button>
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="help">Commandes</button>
    </div>
    <p class="small">Record : étage ${save.best.stage || 0}/${LAST + 1} · boucle ${save.best.loop + 1} · ${save.best.kills} ennemis vaincus en une partie</p>
  </div>`);
}

function showKits() {
  const cards = KITS.map((k, i) => `<button class="mut" style="--c:${["#ffd23f", "#7dffb0", "#ff8a5a"][i]}" data-act="kit" data-arg="${i}"><b>${k.name}</b><span>${k.desc}</span></button>`).join("");
  setOv(`<div class="card"><p class="tag">// équipement de départ</p><h2>Choisis ton kit</h2><div class="muts">${cards}</div>
    <p class="small">Tu trouveras d'autres armes, boucliers, arcs et compétences dans les coffres, sur les autels et dans les salles secrètes.</p>
    <div class="btns"><button class="btn" data-act="menu">Retour</button></div></div>`);
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
      <tr><td>F</td><td>Ouvrir un coffre / ramasser une arme ou une compétence</td></tr>
      <tr><td>E</td><td>Boire une flasque de soin</td></tr>
      <tr><td>S + saut</td><td>Traverser une plateforme fine · avec la Rune du Briseur : bas + attaque en l'air = frappe plongeante</td></tr>
      <tr><td>Échap · M</td><td>Pause · couper le son</td></tr>
    </table>
    <p class="small">Cherche les murs et sols fissurés : grenade, marteau ou frappe plongeante les brisent et révèlent des salles secrètes. Les flèches qui touchent un ennemi te sont rendues à sa mort ; toutes sont rendues à la fin du niveau.</p>
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
  setOv(`<div class="card"><h2>La Forge</h2>
    <p class="lead">Cellules disponibles : <b style="color:#00f0ff">${save.cells} ◆</b></p>
    <div class="rows">${rows}<p class="tag" style="margin-top:6px;text-align:left">// runes permanentes</p>${runes}</div>
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
    <p class="lead">${won ? "La Crypte est à toi. Mais elle se referme et recommence, plus coriace… (tu gardes ton équipement)" : "Les cellules récoltées sont conservées pour la Forge."}</p>
    <div class="stats"><span>Étage <b>${depth + 1}</b></span><span>Ennemis <b>${run.kills}</b></span><span>Cellules <b>${run.cells} ◆</b></span><span>Temps <b>${m}:${String(s).padStart(2, "0")}</b></span></div>
    <div class="btns">
      ${won ? `<button class="btn primary" data-act="loop">Boucle suivante</button>` : `<button class="btn primary" data-act="play">Rejouer</button>`}
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="menu">Menu</button>
    </div></div>`);
}

function act(a, arg) {
  switch (a) {
    case "play": showKits(); break;
    case "kit":
      newRunState(); loop = 0; depth = 0; createPlayer(KITS[+arg]); startLevel("cachots"); scene = "play"; hideOv(); break;
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
  }
}

ov.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  b.blur();
  act(b.dataset.act, b.dataset.arg);
});

// ================================================================== boucle
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try { step(dt); render(); } catch (err) { console.error(err); }
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}

newRunState();
createPlayer(null);
showMenu();
requestAnimationFrame(frame);


})();
