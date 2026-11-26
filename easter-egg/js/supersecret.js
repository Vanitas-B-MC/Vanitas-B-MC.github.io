/* Crypte Néon — plateformer d'action 2D (façon roguelite « Dead Cells »)
 * Page secrète du portfolio. JS pur + canvas, aucune dépendance.
 */
(() => {
"use strict";

// ------------------------------------------------------------------ constantes
const W = 960, H = 544, T = 32, ROWS = 17, GRAV = 1900;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
cv.width = W; cv.height = H;
const ov = document.getElementById("ov");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAGES = [
  { name: "Les Cachots", sub: "Étage 1", bg: ["#0b0b1a", "#04040a"], far: "#10122a", near: "#161a36", accent: "#00f0ff", tile: "#151a2e", tile2: "#1a2038", edge: "#2b3a78", cols: 96, fog: null },
  { name: "Les Égouts toxiques", sub: "Étage 2", bg: ["#06140f", "#030806"], far: "#0b241b", near: "#10301f", accent: "#3dff9a", tile: "#0f2119", tile2: "#13291f", edge: "#1f6a48", cols: 110, fog: "#3dff9a" },
  { name: "La Citadelle écarlate", sub: "Étage 3", bg: ["#17060e", "#08030a"], far: "#2a0d1b", near: "#3a1224", accent: "#ff2e97", tile: "#241018", tile2: "#2c1520", edge: "#7a2448", cols: 124, fog: "#ff2e97" },
  { name: "La Salle du Concierge", sub: "Boss", bg: ["#1a1206", "#0a0703"], far: "#2a1d0a", near: "#38270e", accent: "#ffb020", tile: "#1d160f", tile2: "#251c13", edge: "#7a5a22", cols: 36, fog: "#ffb020", boss: true },
];

const ENEMY = {
  zombie: { w: 22, h: 30, hp: 32, dmg: 10 },
  archer: { w: 20, h: 30, hp: 22, dmg: 8 },
  bat:    { w: 20, h: 14, hp: 14, dmg: 7, fly: true, contact: 7 },
  brute:  { w: 32, h: 42, hp: 90, dmg: 22, armor: true },
  boss:   { w: 56, h: 76, hp: 480, dmg: 18, armor: true, contact: 9 },
};

// ------------------------------------------------------------------ sauvegarde
const SAVE_KEY = "mc-supersecret-v1";
let save = { cells: 0, up: { vit: 0, brut: 0, tact: 0, flask: 0 }, best: { stage: 0, loop: 0, kills: 0 } };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s && typeof s === "object") {
    save.cells = Number(s.cells) || 0;
    Object.assign(save.up, s.up || {});
    Object.assign(save.best, s.best || {});
  }
} catch (e) { /* stockage indisponible : la partie fonctionne quand même */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

const FORGE = [
  { k: "vit",   name: "Constitution",          desc: "+12 PV max par niveau",        max: 6, cost: (l) => 20 + 15 * l },
  { k: "brut",  name: "Lames affûtées",        desc: "+6 % de dégâts de mêlée",      max: 8, cost: (l) => 25 + 20 * l },
  { k: "tact",  name: "Carquois renforcé",     desc: "+10 % de dégâts à distance",   max: 6, cost: (l) => 25 + 20 * l },
  { k: "flask", name: "Flasque supplémentaire", desc: "+1 flasque de soin par étage", max: 2, cost: (l) => 60 + 60 * l },
];

const MUTS = [
  { id: "brut",  name: "Brutalité",       col: "#ff4d4d", desc: "+25 % de dégâts de mêlée",                      fn: () => { U.melee *= 1.25; } },
  { id: "tact",  name: "Tactique",        col: "#b58bff", desc: "+30 % de dégâts à distance, tir plus rapide",   fn: () => { U.ranged *= 1.3; U.shootCd *= 0.8; } },
  { id: "surv",  name: "Survie",          col: "#3dff9a", desc: "+25 PV max et soin complet",                    fn: () => { U.maxHp += 25; P.hp = U.maxHp; } },
  { id: "vamp",  name: "Soif de cellules", col: "#ff2e97", desc: "Chaque ennemi vaincu rend 3 PV",               fn: () => { U.vamp += 3; } },
  { id: "agile", name: "Agilité",         col: "#00f0ff", desc: "Roulade plus longue, +10 % de vitesse",         fn: () => { U.rollMul *= 1.15; U.speed *= 1.1; } },
  { id: "flask", name: "Flasque amélioré", col: "#ffd23f", desc: "+1 flasque, les soins rendent 10 % de plus",   fn: () => { U.flasks++; P.flasks++; U.heal += 0.1; } },
  { id: "crit",  name: "Œil de lynx",     col: "#ffb020", desc: "+15 % de chances de coup critique (×2)",        fn: () => { U.crit += 0.15; } },
];

// ------------------------------------------------------------------ son
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
};

// ------------------------------------------------------------------ entrées
const ACT = {
  left:   ["KeyA", "ArrowLeft", "T_left"],
  right:  ["KeyD", "ArrowRight", "T_right"],
  up:     ["KeyW", "ArrowUp", "Space", "T_up"],
  down:   ["KeyS", "ArrowDown"],
  attack: ["KeyJ", "M_left", "T_attack"],
  roll:   ["KeyK", "ShiftLeft", "ShiftRight", "T_roll"],
  shoot:  ["KeyL", "M_right", "T_shoot"],
  heal:   ["KeyE", "T_heal"],
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
  if (GAME_KEYS.has(e.code)) e.preventDefault();
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

// ------------------------------------------------------------------ état global
let scene = "menu";            // menu | play | pause | choice | dead | win
let stageIdx = 0, loop = 0, S = STAGES[0];
let COLS = 0, grid = [];
let enemies = [], shots = [], pickups = [], parts = [], torches = [], layers = [], motes = [];
let door = { x: 0, y: 0, w: 40, h: 64, open: false };
let P = null, U = null, run = null;
let cam = { x: 0 }, shake = 0, hitstop = 0, flashRed = 0, time = 0;
let bossDead = false, bossRef = null, toastT = 0, toastTxt = "", card = { t: 0, text: "", sub: "" };
let banked = false;

function newRunState() {
  U = {
    melee: 1 + save.up.brut * 0.06,
    ranged: 1 + save.up.tact * 0.1,
    maxHp: 100 + save.up.vit * 12,
    vamp: 0, rollMul: 1, speed: 1,
    flasks: 2 + save.up.flask, heal: 0.4, crit: 0, shootCd: 0.7,
  };
  run = { kills: 0, cells: 0, time: 0 };
  banked = false;
}

function createPlayer() {
  P = {
    x: 0, y: 0, w: 18, h: 30, vx: 0, vy: 0, face: 1, onGround: false,
    coyote: 0, buf: 0, air: 1, roll: 0, rollDir: 1, rollCd: 0, dropT: 0,
    atk: null, atkBuf: 0, combo: 0, comboT: 0,
    hp: U.maxHp, inv: 0, hurtT: 0, flasks: U.flasks, shootCd: 0,
    safeX: 0, safeY: 0,
  };
}

// ------------------------------------------------------------------ niveau
function tileAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 1;
  return grid[r][c];
}

function genLevel(idx, withEnemies) {
  S = STAGES[idx];
  COLS = S.cols;
  grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Uint8Array(COLS));
  enemies = []; shots = []; pickups = []; parts = []; torches = []; layers = [];
  bossDead = false; bossRef = null;
  const R = mulberry32(idx * 977 + 13 + loop * 31 + ((Math.random() * 1e6) | 0));
  const surf = new Array(COLS).fill(15);
  const sections = [];

  if (!S.boss) {
    let c = 8, cur = 15;
    while (c < COLS - 12) {
      const kind = R();
      if (kind < 0.18 && c > 12) {
        const w = 3;
        for (let i = 0; i < w; i++) surf[c + i] = 16;
        c += w;
        continue;
      }
      const len = 6 + Math.floor(R() * 9);
      if (kind < 0.45) cur = clamp(cur + (R() < 0.5 ? -1 : 1) * (1 + Math.floor(R() * 2)), 11, 15);
      const end = Math.min(c + len, COLS - 12);
      for (let i = c; i < end; i++) surf[i] = cur;
      sections.push({ c0: c, len: end - c, top: cur });
      c = end;
    }
    for (let i = c; i < COLS; i++) surf[i] = 15;
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = surf[c]; r < ROWS; r++) grid[r][c] = 1;
    if (surf[c] === 16) grid[15][c] = 3;
  }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = 1; grid[r][COLS - 1] = 1; }
  for (let c = 0; c < COLS; c++) grid[0][c] = 1;

  // plateformes traversables + ennemis
  if (withEnemies && !S.boss) {
    for (const s of sections) {
      if (s.c0 < 12 || s.c0 + s.len > COLS - 12) continue;
      let platform = null;
      if (s.len >= 7 && s.top - 4 >= 3 && R() < 0.55) {
        const pw = Math.min(s.len - 2, 4 + Math.floor(R() * 3));
        const pc = s.c0 + 1 + Math.floor(R() * (s.len - pw - 1));
        for (let i = 0; i < pw; i++) grid[s.top - 4][pc + i] = 2;
        platform = { c: pc, w: pw, row: s.top - 4 };
      }
      const n = Math.min(Math.floor(s.len / 4), R() < 0.3 + 0.12 * idx ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const roll = R();
        let type = "zombie";
        if (idx === 0) type = roll < 0.6 ? "zombie" : "archer";
        else if (idx === 1) type = roll < 0.4 ? "zombie" : roll < 0.72 ? "archer" : "brute";
        else type = roll < 0.3 ? "zombie" : roll < 0.6 ? "archer" : "brute";
        const d = ENEMY[type];
        spawn(type, (s.c0 + 1 + R() * (s.len - 2)) * T - d.w / 2, s.top * T - d.h);
      }
      if (platform && R() < 0.5) {
        spawn("archer", (platform.c + R() * (platform.w - 1)) * T, platform.row * T - ENEMY.archer.h);
      }
      if (R() < 0.3 + 0.1 * idx) spawn("bat", (s.c0 + R() * s.len) * T, Math.max(2, s.top - 5) * T);
    }
  }

  // décor : torches + couches de parallaxe
  for (let c = 6; c < COLS - 2; c += 7 + Math.floor(R() * 4)) torches.push({ x: c * T + 16, y: 3 * T + 8, s: R() * 10 });
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

  // sortie
  const dc = COLS - 4;
  door = { x: dc * T - 4, y: surf[dc] * T - 64, w: 40, h: 64, open: !S.boss };
}

function spawn(type, x, y) {
  const d = ENEMY[type];
  const hpm = (type === "boss" ? 1 : 1 + 0.28 * stageIdx) * (1 + 0.6 * loop);
  const e = {
    type, x, y, w: d.w, h: d.h, vx: 0, vy: 0, hp: d.hp * hpm, maxHp: d.hp * hpm,
    face: Math.random() < 0.5 ? -1 : 1, state: type === "boss" ? "sleep" : "idle",
    t: 0, cd: 0.4 + Math.random(), flash: 0, armor: !!d.armor, fly: !!d.fly,
    dmg: d.dmg * (1 + 0.15 * loop), contact: d.contact ? d.contact * (1 + 0.15 * loop) : 0,
    bob: Math.random() * 6, wall: 0, onGround: false, struck: false,
  };
  enemies.push(e);
  return e;
}

function startStage(idx) {
  stageIdx = idx;
  genLevel(idx, true);
  const surf0 = 15;
  P.x = 3 * T; P.y = surf0 * T - P.h; P.vx = P.vy = 0; P.atk = null; P.roll = 0; P.inv = 0.5;
  P.safeX = P.x; P.safeY = P.y; P.flasks = U.flasks;
  P.hp = Math.min(U.maxHp, P.hp + U.maxHp * 0.3);
  cam.x = 0;
  if (S.boss) bossRef = spawn("boss", (COLS - 10) * T, 15 * T - ENEMY.boss.h);
  card = { t: 3.2, text: S.name, sub: S.sub };
}

// ------------------------------------------------------------------ physique
function moveBody(b, dt, grav) {
  if (grav) b.vy = Math.min(b.vy + GRAV * dt, 820);

  b.x += b.vx * dt; b.wall = 0;
  if (b.vx !== 0) {
    const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
    const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
    let best = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (tileAt(c, r) === 1) {
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
      if ((t === 1 && py + b.h <= r * T + Math.max(4, b.vy * dt + 1)) ||
          (t === 2 && py + b.h <= r * T + 1 && !(b.dropT > 0))) {
        b.y = r * T - b.h; b.vy = 0; b.onGround = true; break;
      }
    }
  } else {
    const r = Math.floor(b.y / T);
    for (let c = c0; c <= c1; c++) {
      if (tileAt(c, r) === 1) { b.y = (r + 1) * T; b.vy = 0; break; }
    }
  }
}

function floorAhead(e, dir) {
  const d = dir === undefined ? e.face : dir;
  const fx = e.x + (d > 0 ? e.w + 6 : -6);
  const t = tileAt(Math.floor(fx / T), Math.floor((e.y + e.h + 4) / T));
  return t === 1 || t === 2;
}

// ------------------------------------------------------------------ effets
function burst(x, y, n, col, spd, life, size, grav) {
  for (let i = 0; i < n; i++) {
    const l = rnd((life || 0.4) * 0.6, life || 0.4);
    parts.push({ x, y, vx: rnd(-spd, spd), vy: rnd(-spd, spd * 0.4), life: l, max: l, col, size: size || 3, grav: grav === undefined ? 420 : grav });
  }
}
function addText(x, y, s, col) { parts.push({ x, y, vx: 0, vy: -55, life: 0.75, max: 0.75, col, txt: s, grav: 0 }); }
function toast(s) { toastTxt = s; toastT = 2.6; }

// ------------------------------------------------------------------ joueur
function startRoll(dir) {
  P.roll = 0.38; P.rollDir = dir || P.face; P.inv = Math.max(P.inv, 0.38); P.atk = null; P.atkBuf = 0;
  burst(P.x + P.w / 2, P.y + P.h, 6, "#9ffcff", 90, 0.3, 2, 100);
  SFX.roll();
}

function startAttack(dir) {
  const step = P.comboT > 0 ? (P.combo + 1) % 3 : 0;
  P.combo = step;
  if (dir) P.face = dir;
  const dur = [0.24, 0.24, 0.36][step];
  P.atk = { step, t: 0, dur, hit: new Set(), dmg: [10, 12, 20][step] * U.melee };
  P.vx += P.face * (step === 2 ? 230 : 110);
  P.atkBuf = 0;
  SFX.swing();
}

function applyMelee() {
  const a = P.atk, f = a.t / a.dur;
  if (f < 0.22 || f > 0.72) return;
  const reach = a.step === 2 ? 62 : 48;
  const box = { x: P.face > 0 ? P.x + P.w - 2 : P.x - reach + 2, y: P.y - 6, w: reach, h: P.h + 12 };
  for (const e of enemies) {
    if (e.dead || a.hit.has(e) || e.state === "sleep") continue;
    if (overlap(box, e)) {
      a.hit.add(e);
      damageEnemy(e, a.dmg, P.face * (a.step === 2 ? 270 : 150), a.step === 2 ? 0.09 : 0.05);
    }
  }
  for (const s of shots) {
    if (s.from === "e" && s.kind !== "wave" && s.life > 0 && overlap(box, s)) {
      s.life = 0; burst(s.x, s.y, 6, "#ffd23f", 140, 0.3);
      addText(s.x, s.y - 10, "PARADE", "#ffd23f"); SFX.hit();
    }
  }
}

function updatePlayer(dt) {
  const dir = (down("right") ? 1 : 0) - (down("left") ? 1 : 0);
  P.inv = Math.max(0, P.inv - dt);
  P.rollCd -= dt; P.shootCd -= dt; P.comboT -= dt; P.coyote -= dt;
  P.buf -= dt; P.atkBuf -= dt; P.dropT -= dt; P.hurtT -= dt;
  if (P.onGround) { P.coyote = 0.09; P.air = 1; }
  if (hit("up")) P.buf = 0.12;
  if (down("attack")) P.atkBuf = 0.2;

  // traverser une plateforme fine (bas + saut)
  if (P.buf > 0 && down("down") && P.onGround &&
      tileAt(Math.floor((P.x + P.w / 2) / T), Math.floor((P.y + P.h + 2) / T)) === 2) {
    P.dropT = 0.2; P.buf = 0; P.onGround = false; P.coyote = 0; P.y += 2;
  }

  if (hit("roll") && P.roll <= 0 && P.rollCd <= 0 && P.hurtT <= 0) startRoll(dir);

  if (P.roll > 0) {
    P.roll -= dt;
    P.vx = P.rollDir * 400 * U.rollMul;
    if (P.roll <= 0) { P.rollCd = 0.18; P.vx *= 0.4; }
  } else if (P.hurtT <= 0) {
    let tv = dir * 215 * U.speed;
    if (P.atk && P.onGround) tv *= 0.35;
    P.vx = approach(P.vx, tv, (P.onGround ? 2600 : 1600) * dt);
    if (dir && !P.atk) P.face = dir;
  } else {
    P.vx = approach(P.vx, 0, 600 * dt);
  }

  if (P.atkBuf > 0 && !P.atk && P.roll <= 0 && P.hurtT <= 0) startAttack(dir);
  if (P.atk) {
    P.atk.t += dt;
    applyMelee();
    if (P.atk.t >= P.atk.dur) { P.comboT = P.atk.step === 2 ? 0 : 0.38; P.atk = null; }
  }

  if (P.buf > 0 && P.roll <= 0 && P.hurtT <= 0) {
    if (P.coyote > 0) {
      P.vy = -545; P.coyote = 0; P.buf = 0; P.onGround = false;
      burst(P.x + P.w / 2, P.y + P.h, 5, "#7f8fb5", 80, 0.25, 2, 60); SFX.jump();
    } else if (P.air > 0) {
      P.vy = -490; P.air--; P.buf = 0;
      burst(P.x + P.w / 2, P.y + P.h, 8, "#9ffcff", 110, 0.3, 2, 40); SFX.jump();
    }
  }
  if (!down("up") && P.vy < -230) P.vy += 2400 * dt;   // saut plus court si on relâche

  if (hit("heal") && P.flasks > 0 && P.hp < U.maxHp) {
    P.flasks--;
    const h = Math.round(U.maxHp * U.heal);
    P.hp = Math.min(U.maxHp, P.hp + h);
    addText(P.x + P.w / 2, P.y - 6, "+" + h, "#3dff9a");
    burst(P.x + P.w / 2, P.y + P.h / 2, 14, "#3dff9a", 120, 0.6, 3, -40);
    SFX.heal();
  }

  if (hit("shoot") && P.shootCd <= 0 && P.roll <= 0 && P.hurtT <= 0) {
    P.shootCd = U.shootCd;
    shots.push({ x: P.x + P.w / 2 - 7, y: P.y + 10, vx: P.face * 640, vy: 0, w: 14, h: 5, dmg: 15 * U.ranged, life: 0.9, from: "p", kind: "knife" });
    P.vx -= P.face * 40;
    SFX.shoot();
  }

  moveBody(P, dt, true);

  if (P.onGround) {
    const c = Math.floor((P.x + P.w / 2) / T), fr = Math.floor((P.y + P.h + 1) / T);
    let safe = true;
    for (let dc = -2; dc <= 2; dc++) if (tileAt(c + dc, fr) !== 1) safe = false;
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
    hurtPlayer(12, P.x + P.w / 2);
    if (scene === "play") { P.x = P.safeX; P.y = P.safeY; P.vx = P.vy = 0; }
  }

  // sortie
  if (door.open && P.onGround && overlap(P, door)) stageComplete();
}

function hurtPlayer(d, srcX) {
  if (P.inv > 0 || scene !== "play") return;
  d = Math.round(d);
  P.hp -= d; P.inv = 0.9; P.hurtT = 0.22;
  P.vx = (P.x + P.w / 2 < srcX ? -1 : 1) * 230; P.vy = -230;
  P.atk = null; P.roll = 0;
  shake = Math.max(shake, 9); hitstop = Math.max(hitstop, 0.07); flashRed = 0.25;
  addText(P.x + P.w / 2, P.y - 6, "-" + d, "#ff4d6d");
  burst(P.x + P.w / 2, P.y + P.h / 2, 10, "#ff4d6d", 200, 0.45);
  SFX.hurt();
  if (P.hp <= 0) { P.hp = 0; die(); }
}

// ------------------------------------------------------------------ ennemis
function damageEnemy(e, d, kx, hs) {
  let crit = false;
  if (Math.random() < U.crit) { d *= 2; crit = true; }
  d = Math.round(d);
  e.hp -= d; e.flash = 0.12;
  if (!e.armor) {
    e.vx = kx;
    if (e.type !== "bat") { e.state = "stagger"; e.t = 0.2; } else e.vy = -60;
  }
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
  const n = { zombie: 1, archer: 1, bat: 1, brute: 3, boss: 30 }[e.type];
  for (let i = 0; i < n; i++) pickups.push({ x: ex, y: ey, w: 8, h: 8, vx: rnd(-130, 130), vy: rnd(-320, -120), kind: "cell", t: 0, wall: 0 });
  if (e.type !== "boss" && Math.random() < 0.12) pickups.push({ x: ex, y: ey, w: 10, h: 10, vx: rnd(-60, 60), vy: -200, kind: "orb", t: 0, wall: 0 });
  if (U.vamp > 0) { P.hp = Math.min(U.maxHp, P.hp + U.vamp); }
  burst(ex, ey, e.type === "boss" ? 60 : 16, e.type === "boss" ? "#ffb020" : "#ff2e97", e.type === "boss" ? 360 : 220, 0.7, 3);
  SFX.boom();
  shake = Math.max(shake, e.type === "boss" ? 16 : 5);
  if (e.type === "boss") {
    bossDead = true; door.open = true; hitstop = 0.3;
    for (const o of enemies) if (!o.dead && o !== e) { o.dead = true; burst(o.x, o.y, 8, "#b58bff", 160, 0.5); }
    toast("Le Concierge est tombé — la porte s'ouvre");
  }
}

function meleeBox(e, reach) { return { x: e.face > 0 ? e.x + e.w : e.x - reach, y: e.y - 2, w: reach, h: e.h + 4 }; }

function updateEnemy(e, dt) {
  e.flash -= dt; e.cd -= dt; e.t -= dt; e.bob += dt * 4;
  const px = P.x + P.w / 2, py = P.y + P.h / 2, ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  const dx = px - ex, dy = py - ey, ad = Math.abs(dx), ady = Math.abs(dy);

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
      if (!e.struck && overlap(meleeBox(e, 36), P)) { hurtPlayer(e.dmg, ex); if (P.inv > 0.5) e.struck = true; }
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
        shots.push({ x: ex - 7, y: ey - 6, vx: e.face * 320, vy: 0, w: 14, h: 4, dmg: e.dmg, life: 2.6, from: "e", kind: "arrow" });
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
      if (!e.struck && overlap(meleeBox(e, 70), P)) { hurtPlayer(e.dmg, ex); if (P.inv > 0.5) e.struck = true; }
      if (e.t <= 0) { e.state = "chase"; e.cd = 2; }
    }
  } else if (e.type === "boss") {
    bossAI(e, dt, dx, ad, ex);
  }

  moveBody(e, dt, !e.fly);

  const cdm = (e.type === "boss" && e.state === "charge") ? e.dmg : e.contact;
  if (cdm > 0 && e.state !== "sleep" && overlap(e, P)) hurtPlayer(cdm, ex);
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
          shots.push({ x: ex + dir * 30 - 13, y: e.y + e.h - 16, vx: dir * (ph2 ? 380 : 310), vy: 0, w: 26, h: 16, dmg: e.dmg * 0.8, life: 2.2, from: "e", kind: "wave" });
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

// ------------------------------------------------------------------ projectiles, objets, particules
function updateShots(dt) {
  for (const s of shots) {
    s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life <= 0) continue;
    if (tileAt(Math.floor((s.x + s.w / 2) / T), Math.floor((s.y + s.h / 2) / T)) === 1) {
      s.life = 0; burst(s.x, s.y, 4, s.from === "p" ? "#9ffcff" : "#ffb020", 100, 0.25); continue;
    }
    if (s.from === "p") {
      for (const e of enemies) {
        if (!e.dead && e.state !== "sleep" && overlap(s, e)) { damageEnemy(e, s.dmg, s.vx > 0 ? 120 : -120, 0.03); s.life = 0; break; }
      }
    } else if (overlap(s, P) && P.inv <= 0) {
      hurtPlayer(s.dmg, s.x); s.life = 0;
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

function updateParts(dt) {
  for (const p of parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
  }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}

// ------------------------------------------------------------------ flux de jeu
function stageComplete() {
  if (scene !== "play") return;
  SFX.heal();
  if (stageIdx >= STAGES.length - 1) { win(); return; }
  scene = "choice";
  const pool = MUTS.slice();
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  showChoice(picks);
}

function bank() {
  if (banked) return;
  banked = true;
  save.cells += run.cells;
  save.best.stage = Math.max(save.best.stage, stageIdx + 1);
  save.best.loop = Math.max(save.best.loop, loop);
  save.best.kills = Math.max(save.best.kills, run.kills);
  persist();
}

function die() {
  scene = "dead";
  bank();
  SFX.boom();
  setTimeout(() => { if (scene === "dead") showEnd(false); }, 1100);
}

function win() {
  scene = "win";
  save.best.stage = Math.max(save.best.stage, STAGES.length);
  bank();
  showEnd(true);
}

function pauseGame() {
  if (scene !== "play") return;
  scene = "pause";
  setOv(`<div class="card"><h2>Pause</h2><div class="btns"><button class="btn primary" data-act="resume">Reprendre</button><button class="btn" data-act="menu">Abandonner</button></div></div>`);
}
function togglePause() {
  if (scene === "play") pauseGame();
  else if (scene === "pause") resumeGame();
}
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
      for (const e of enemies) if (!e.dead) updateEnemy(e, dt);
      enemies = enemies.filter((e) => !e.dead);
      updateShots(dt);
      updatePickups(dt);
    }
  }
  updateParts(dt);

  const target = clamp(P.x + P.w / 2 + P.face * 60 - W / 2, 0, Math.max(0, COLS * T - W));
  cam.x += (target - cam.x) * Math.min(1, dt * 6);
}

// ------------------------------------------------------------------ rendu
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  for (const L of layers) {
    ctx.fillStyle = L.col;
    for (const s of L.shapes) {
      const x = s.x - cam.x * L.f;
      if (x > W || x + s.w < 0) continue;
      const top = H - 90 - s.h;
      ctx.fillRect(x, top, s.w, s.h + 90);
      if (s.arch) {
        ctx.fillStyle = S.bg[1];
        ctx.beginPath(); ctx.arc(x + s.w / 2, top + s.h * 0.55, s.w * 0.3, Math.PI, 0); ctx.lineTo(x + s.w / 2 + s.w * 0.3, top + s.h + 90); ctx.lineTo(x + s.w / 2 - s.w * 0.3, top + s.h + 90); ctx.fill();
        ctx.fillStyle = L.col;
      }
    }
  }
  if (S.fog) {
    const f = ctx.createLinearGradient(0, H * 0.55, 0, H);
    f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(1, S.fog);
    ctx.globalAlpha = 0.16; ctx.fillStyle = f; ctx.fillRect(0, H * 0.55, W, H * 0.45); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = S.accent;
  for (const m of motes) {
    const x = ((m.x - cam.x * 0.1 * m.s + Math.sin(time * 0.4 + m.p) * 14) % W + W) % W;
    const y = ((m.y - time * 6 * m.s) % H + H) % H;
    ctx.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.6 + m.p));
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawTiles() {
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(COLS - 1, c0 + Math.ceil(W / T) + 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = grid[r][c];
      if (!t) continue;
      const x = c * T, y = r * T;
      if (t === 1) {
        ctx.fillStyle = ((c * 7 + r * 13) % 5 === 0) ? S.tile2 : S.tile;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x, y + T - 2, T, 2); ctx.fillRect(x + T - 2, y, 2, T);
        if (tileAt(c, r - 1) !== 1) {
          ctx.fillStyle = S.edge; ctx.fillRect(x, y, T, 4);
          ctx.globalAlpha = 0.6; ctx.fillStyle = S.accent; ctx.fillRect(x, y, T, 2); ctx.globalAlpha = 1;
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
  ctx.globalCompositeOperation = "lighter";
  for (const t of torches) {
    if (t.x < cam.x - 120 || t.x > cam.x + W + 120) continue;
    const fl = 0.8 + 0.2 * Math.sin(time * 9 + t.s) + 0.1 * Math.sin(time * 23 + t.s * 2);
    glow(t.x, t.y, 110 * fl, S.accent, 0.28);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const t of torches) {
    if (t.x < cam.x - 20 || t.x > cam.x + W + 20) continue;
    rect(t.x - 2, t.y, 4, 14, "#2a2f4a");
    rect(t.x - 5, t.y - 2, 10, 4, "#3a4068");
    const fl = 6 + Math.sin(time * 12 + t.s) * 2;
    ctx.fillStyle = S.accent;
    ctx.beginPath(); ctx.moveTo(t.x - 4, t.y - 2); ctx.lineTo(t.x, t.y - 2 - fl - 6); ctx.lineTo(t.x + 4, t.y - 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(t.x - 2, t.y - 2); ctx.lineTo(t.x, t.y - 2 - fl); ctx.lineTo(t.x + 2, t.y - 2); ctx.fill();
  }
}

function drawDoor() {
  const d = door;
  rect(d.x - 4, d.y - 6, d.w + 8, d.h + 6, "#0b0d1a");
  ctx.strokeStyle = S.accent; ctx.lineWidth = 3; ctx.strokeRect(d.x - 2, d.y - 4, d.w + 4, d.h + 4);
  if (d.open) {
    const p = 0.55 + 0.25 * Math.sin(time * 4);
    ctx.globalCompositeOperation = "lighter";
    glow(d.x + d.w / 2, d.y + d.h / 2, 90, S.accent, 0.35 * p + 0.1);
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
    g.addColorStop(0, S.accent); g.addColorStop(1, "rgba(0,0,0,.2)");
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 4); ctx.fillStyle = g; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.globalAlpha = 1;
  } else {
    rect(d.x, d.y, d.w, d.h, "#161320");
    ctx.strokeStyle = "#555a78"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d.x, d.y + 12); ctx.lineTo(d.x + d.w, d.y + 30); ctx.moveTo(d.x, d.y + 40); ctx.lineTo(d.x + d.w, d.y + 20); ctx.stroke();
  }
}

function drawPlayer() {
  const cx = P.x + P.w / 2;
  ctx.save();
  if (scene === "dead") {
    ctx.translate(cx, P.y + P.h); ctx.rotate(P.face * Math.PI / 2); ctx.translate(-cx, -(P.y + P.h));
  } else if (P.inv > 0 && P.roll <= 0 && Math.floor(time * 26) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  const y = Math.round(P.y), f = P.face;
  if (P.roll > 0) {
    const a = (1 - P.roll / 0.38) * Math.PI * 2 * f;
    ctx.translate(cx, P.y + P.h - 10); ctx.rotate(a);
    rect(-9, -10, 18, 18, "#1a2340");
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2; ctx.strokeRect(-9, -10, 18, 18);
    rect(-2 * f + 1, -7, 6, 3, "#00f0ff");
  } else {
    const run_ = P.onGround && Math.abs(P.vx) > 25 ? Math.sin(time * 16) : 0;
    // jambes
    rect(cx - 7 + run_ * 3, y + 22, 6, 8, "#0d1020"); rect(cx - 7 + run_ * 3, y + 28, 7, 2, "#00f0ff");
    rect(cx + 1 - run_ * 3, y + 22, 6, 8, "#0d1020"); rect(cx + 1 - run_ * 3, y + 28, 7, 2, "#00f0ff");
    // écharpe
    ctx.strokeStyle = "#ff2e97"; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(cx - f * 3, y + 11);
    ctx.lineTo(cx - f * (12 + Math.min(14, Math.abs(P.vx) * 0.04)), y + 12 + Math.sin(time * 10) * 3 + (P.vy > 0 ? -3 : 3) * 0.5);
    ctx.stroke();
    // torse / cape
    rect(cx - 9, y + 10, 18, 14, "#1a2340");
    rect(cx - 9, y + 10, 18, 2, "#00f0ff");
    ctx.fillStyle = "#10152a";
    ctx.beginPath(); ctx.moveTo(cx - f * 9, y + 11); ctx.lineTo(cx - f * 15, y + 25); ctx.lineTo(cx - f * 8, y + 25); ctx.fill();
    // tête / capuche + visière
    rect(cx - 7, y, 14, 12, "#10152a");
    rect(cx - 7, y, 14, 2, "#232c52");
    ctx.fillStyle = "#00f0ff"; ctx.shadowColor = "#00f0ff"; ctx.shadowBlur = 8;
    ctx.fillRect(cx + (f > 0 ? -1 : -7), y + 4, 8, 3);
    ctx.shadowBlur = 0;
    if (!P.atk) { // lame au repos
      ctx.strokeStyle = "#9ffcff"; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(cx + f * 8, y + 20); ctx.lineTo(cx + f * 15, y + 8); ctx.stroke();
    }
  }
  ctx.restore();

  if (P.atk) {
    const a = P.atk, step_ = a.step;
    const p = clamp((a.t / a.dur - 0.15) / 0.6, 0, 1);
    const ang = (q) => (step_ === 1 ? 1.1 - 2.3 * q : -1.2 + 2.3 * q);
    const p0 = Math.max(0, p - 0.55);
    const R = step_ === 2 ? 52 : 40;
    ctx.save();
    ctx.translate(cx, P.y + 16); ctx.scale(P.face, 1);
    ctx.globalAlpha = 0.9 * (1 - p * 0.5);
    ctx.strokeStyle = step_ === 2 ? "#ff2e97" : "#9ffcff";
    ctx.lineWidth = step_ === 2 ? 11 : 7; ctx.lineCap = "round";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 0, R, Math.min(ang(p0), ang(p)), Math.max(ang(p0), ang(p))); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(Math.cos(ang(p)) * (R + 2), Math.sin(ang(p)) * (R + 2)); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(cx + f * 10, y + 14, 12, f > 0 ? -1.3 : Math.PI - 1.3 + 0.0, f > 0 ? 1.3 : Math.PI + 1.3); ctx.stroke();
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
    // grosse clé
    ctx.save(); ctx.translate(cx + f * 26, y + 30);
    ctx.rotate(e.state === "air" ? -f * 2.2 : wind ? -f * 1.6 : f * 0.3);
    rect(-3, -4, 6, 54, col("#c9a54a")); rect(-3, 40, 14, 5, col("#c9a54a")); rect(-3, 48, 10, 4, col("#c9a54a"));
    ctx.strokeStyle = fl ? "#fff" : "#c9a54a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -10, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (e.state === "charge") { ctx.fillStyle = "rgba(255,176,32,.25)"; ctx.fillRect(e.x - f * 40, y + 10, e.w, e.h - 10); }
  }

  if (wind && e.type !== "boss") {
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
      rect(s.x, s.y, s.w, s.h - 1, "#ffb020"); rect(s.vx > 0 ? s.x + s.w - 4 : s.x, s.y - 1, 4, s.h + 1, "#fff");
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
    if (p.txt) {
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
  ctx.textAlign = "right"; ctx.fillStyle = "#00f0ff"; ctx.font = "bold 18px 'Share Tech Mono', monospace";
  ctx.fillText("◆ " + run.cells, W - 20, 30);
  ctx.fillStyle = "#7f8fb5"; ctx.font = "12px 'Share Tech Mono', monospace";
  ctx.fillText("ÉTAGE " + (stageIdx + 1) + "/" + STAGES.length + (loop ? " · BOUCLE " + (loop + 1) : ""), W - 20, 48);

  if (bossRef && !bossRef.dead && bossRef.state !== "sleep") {
    const bw2 = 460, bx = (W - bw2) / 2, by = H - 40;
    rect(bx - 3, by - 3, bw2 + 6, 22, "rgba(0,0,0,.65)");
    rect(bx, by, bw2, 16, "#2a1a08");
    const ph2 = bossRef.hp < bossRef.maxHp * 0.5;
    rect(bx, by, bw2 * clamp(bossRef.hp / bossRef.maxHp, 0, 1), 16, ph2 ? "#ff2e97" : "#ffb020");
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
  if (door.open && !S.boss && Math.abs(P.x - door.x) < 360 && Math.abs(P.x - door.x) > 40) {
    // petite indication de la sortie
  }
}

function render() {
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  ctx.translate(Math.round(-cam.x + sx), Math.round(sy));
  drawTiles();
  drawTorches();
  drawDoor();
  if (scene !== "menu") {
    drawPickups();
    for (const e of enemies) if (e.x + e.w > cam.x - 80 && e.x < cam.x + W + 80) drawEnemy(e);
    drawShots();
    drawPlayer();
    drawParts();
  }
  ctx.restore();

  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (flashRed > 0) { ctx.fillStyle = "rgba(255,40,80," + (flashRed * 0.9) + ")"; ctx.fillRect(0, 0, W, H); }
  if (scene === "play" || scene === "pause" || scene === "dead" || scene === "choice") drawHUD();
}

// ------------------------------------------------------------------ panneaux HTML
function setOv(html) { ov.innerHTML = html; ov.hidden = false; }
function hideOv() { ov.hidden = true; ov.innerHTML = ""; }

function showMenu() {
  scene = "menu";
  genLevel(0, false);
  setOv(`<div class="card">
    <p class="tag">// accès niveau 7 autorisé</p>
    <h1>CRYPTE <span>NÉON</span></h1>
    <p class="lead">Quatre étages à descendre dans les entrailles d'un réseau oublié. Roule, tranche, tire — et rapporte des cellules à la Forge pour revenir plus fort.</p>
    <div class="btns">
      <button class="btn primary" data-act="play">Descendre</button>
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="help">Commandes</button>
    </div>
    <p class="small">Record : étage ${save.best.stage || 0}/4 · boucle ${save.best.loop + 1} · ${save.best.kills} ennemis vaincus en une partie</p>
  </div>`);
}

function showHelp() {
  setOv(`<div class="card">
    <h2>Commandes</h2>
    <table class="keys">
      <tr><td>Z Q S D · ← ↑ ↓ →</td><td>Se déplacer</td></tr>
      <tr><td>Z · ↑ · Espace</td><td>Sauter (appuie une 2<sup>e</sup> fois en l'air : double saut)</td></tr>
      <tr><td>J · clic gauche</td><td>Attaquer (combo en 3 coups, le 3<sup>e</sup> est le plus fort)</td></tr>
      <tr><td>K · Maj</td><td>Roulade : invincible pendant la roulade</td></tr>
      <tr><td>L · clic droit</td><td>Lancer un couteau (parer les flèches avec l'épée !)</td></tr>
      <tr><td>E</td><td>Boire une flasque de soin</td></tr>
      <tr><td>S / ↓ + saut</td><td>Traverser une plateforme fine</td></tr>
      <tr><td>Échap · M</td><td>Pause · couper le son</td></tr>
    </table>
    <p class="small">Sur mobile, utilise les boutons à l'écran. Les ennemis jaunes « ! » vont frapper : roule au bon moment.</p>
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
  setOv(`<div class="card"><h2>La Forge</h2>
    <p class="lead">Cellules disponibles : <b style="color:#00f0ff">${save.cells} ◆</b></p>
    <div class="rows">${rows}</div>
    <div class="btns"><button class="btn primary" data-act="menu">Retour</button></div></div>`);
}

function showChoice(picks) {
  const cards = picks.map((m) => `<button class="mut" style="--c:${m.col}" data-act="pick" data-arg="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join("");
  setOv(`<div class="card"><p class="tag">// étage terminé</p><h2>Choisis une mutation</h2><div class="muts">${cards}</div></div>`);
}

function showEnd(won) {
  const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60);
  setOv(`<div class="card">
    <h2 class="${won ? "good" : "bad"}">${won ? "Le Concierge est vaincu" : "Vous êtes mort"}</h2>
    <p class="lead">${won ? "La Crypte est à toi. Mais elle se referme et recommence, plus coriace…" : "Les cellules récoltées sont conservées pour la Forge."}</p>
    <div class="stats"><span>Étage <b>${stageIdx + 1}</b></span><span>Ennemis <b>${run.kills}</b></span><span>Cellules <b>${run.cells} ◆</b></span><span>Temps <b>${m}:${String(s).padStart(2, "0")}</b></span></div>
    <div class="btns">
      ${won ? `<button class="btn primary" data-act="loop">Boucle suivante</button>` : `<button class="btn primary" data-act="play">Rejouer</button>`}
      <button class="btn" data-act="forge">Forge (${save.cells} ◆)</button>
      <button class="btn" data-act="menu">Menu</button>
    </div></div>`);
}

function act(a, arg) {
  switch (a) {
    case "play":
      newRunState(); loop = 0; createPlayer(); startStage(0); scene = "play"; hideOv(); break;
    case "loop":
      loop++; banked = false; run.cells = 0; run.kills = 0; run.time = 0; startStage(0); scene = "play"; hideOv(); break;
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
    case "pick": {
      const m = MUTS.find((x) => x.id === arg);
      if (m) m.fn();
      startStage(stageIdx + 1); scene = "play"; hideOv(); break;
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

// ------------------------------------------------------------------ boucle
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try { step(dt); render(); } catch (err) { console.error(err); }
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}

newRunState();
createPlayer();
showMenu();
requestAnimationFrame(frame);

})();
