// js/dungeon.js — logique pure de « Donjon » (aucun accès au DOM, testable sous Node).
// Action en temps réel, vue de dessus : on se déplace, le héros attaque tout seul l'ennemi le plus
// proche, et on active une compétence. Chaque étage = 3 salles (la dernière : élite, ou boss tous
// les 5 étages). Des coffres proposent des objets ; les âmes gagnées financent des améliorations
// permanentes et de nouvelles classes.

export const W = 720;
export const H = 480;
export const WALL = 32;               // épaisseur des murs : l'aire de jeu va de WALL à W-WALL / H-WALL
export const PLAYER_R = 9;
export const ROOMS_PER_FLOOR = 3;
export const BOSS_EVERY = 5;

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- Classes ---------- */

// attack.type : "melee" (arc devant soi) ou "shot" (projectiles). unlock : âmes.
export const CLASSES = [
  { id: "knight", name: "Chevalier", unlock: 0, color: "#00f0ff",
    desc: "Robuste. Frappe en arc devant lui. Compétence : Tourbillon.",
    hp: 120, speed: 120, attack: { type: "melee", dmg: 16, rate: 1.6, range: 48, arc: 1.7 },
    skill: { name: "Tourbillon", cd: 7, desc: "Frappe tout autour de toi" } },
  { id: "ranger", name: "Rôdeur", unlock: 400, color: "#4d9bff",
    desc: "Tire à distance. Compétence : Pluie de flèches.",
    hp: 90, speed: 135, attack: { type: "shot", dmg: 9, rate: 2.6, speed: 400, pierce: 0 },
    skill: { name: "Pluie de flèches", cd: 6, desc: "12 flèches dans toutes les directions" } },
  { id: "mage", name: "Mage", unlock: 900, color: "#b58cff",
    desc: "Projectiles magiques perforants. Compétence : Nova.",
    hp: 80, speed: 118, attack: { type: "shot", dmg: 15, rate: 1.5, speed: 310, pierce: 2 },
    skill: { name: "Nova", cd: 8, desc: "Onde qui blesse, ralentit et efface les tirs ennemis" } },
  { id: "rogue", name: "Voleur", unlock: 1600, color: "#ff2a6d",
    desc: "Très rapide, coups courts et fréquents. Compétence : Ombre.",
    hp: 95, speed: 150, attack: { type: "melee", dmg: 9, rate: 3.2, range: 36, arc: 1.3 },
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

/* ---------- Objets trouvés dans les coffres ---------- */

export const ITEMS = {
  blade:  { name: "Lame aiguisée",    desc: "+20 % de dégâts",                                   max: 6, apply: (s) => { s.damage *= 1.2; } },
  haste:  { name: "Gants rapides",    desc: "+15 % de vitesse d'attaque",                        max: 6, apply: (s) => { s.rate *= 1.15; } },
  heart:  { name: "Cœur de pierre",   desc: "+25 PV max et soigne 25 PV",                        max: 6, apply: (s, p) => { s.maxHp += 25; p.hp = Math.min(s.maxHp, p.hp + 25); } },
  boots:  { name: "Bottes ailées",    desc: "+10 % de vitesse de déplacement",                   max: 5, apply: (s) => { s.speed *= 1.1; } },
  lynx:   { name: "Œil de lynx",      desc: "+10 % de coups critiques (×2)",                     max: 5, apply: (s) => { s.crit += 0.1; } },
  vamp:   { name: "Croc de vampire",  desc: "+1 PV par ennemi vaincu",                           max: 5, apply: (s) => { s.vampire += 1; } },
  multi:  { name: "Multi-tir",        desc: "+1 projectile (distance) · portée et arc accrus (mêlée)", max: 3,
            apply: (s, p, cls) => { if (cls.attack.type === "shot") s.shots += 1; else { s.range *= 1.18; s.arc *= 1.15; } } },
  pierce: { name: "Perforation",      desc: "Les tirs traversent +1 ennemi (distance) · +10 % de dégâts (mêlée)", max: 3,
            apply: (s, p, cls) => { if (cls.attack.type === "shot") s.pierce += 1; else s.damage *= 1.1; } },
  fire:   { name: "Flammes",          desc: "Tes coups enflamment les ennemis",                  max: 3, apply: (s) => { s.burn += 1; } },
  frost:  { name: "Givre",            desc: "Tes coups ralentissent les ennemis",                max: 1, apply: (s) => { s.frost = 1; } },
  shield: { name: "Bouclier d'énergie", desc: "Absorbe un coup, se recharge (−2 s par niveau)",  max: 3, apply: (s, p) => { s.shieldMax += 1; p.shield = Math.min(s.shieldMax, p.shield + 1); s.shieldCd = Math.max(5, 15 - 2 * (s.shieldMax - 1)); } },
  bomb:   { name: "Détonateur",       desc: "Les ennemis vaincus explosent",                     max: 3, apply: (s) => { s.bomb += 1; } },
  magnet: { name: "Aimant",           desc: "+60 % de portée de ramassage",                      max: 3, apply: (s) => { s.magnet *= 1.6; } },
  clock:  { name: "Chronomètre",      desc: "Compétence rechargée 15 % plus vite",               max: 4, apply: (s) => { s.skillCd *= 0.85; } },
  regen:  { name: "Nanobots",         desc: "+0,5 PV par seconde",                               max: 4, apply: (s) => { s.regen += 0.5; } }
};
export const ITEM_IDS = Object.keys(ITEMS);
const HEAL_CHOICE = { name: "Réparation", desc: "Soigne 40 % des PV" };
export const describe = (id) => (id === "heal" ? { id, ...HEAL_CHOICE } : { id, ...ITEMS[id] });

/* ---------- Ennemis ---------- */

// ai : chase | flutter | archer | charger | mage. cost : budget de la salle. from : étage d'apparition.
export const ENEMIES = {
  slime:   { name: "Gelée",       hp: 22, speed: 46,  r: 9,  dmg: 8,  ai: "chase",   color: "#3ddc84", cost: 1,   from: 1 },
  bat:     { name: "Chauve-souris", hp: 12, speed: 100, r: 7, dmg: 6,  ai: "flutter", color: "#ff6bd6", cost: 1,   from: 1 },
  archer:  { name: "Archer",      hp: 18, speed: 52,  r: 8,  dmg: 8,  ai: "archer",  color: "#fcee0a", cost: 1.5, from: 2 },
  charger: { name: "Fonceur",     hp: 42, speed: 40,  r: 11, dmg: 14, ai: "charger", color: "#ff8a3d", cost: 2,   from: 3 },
  mage:    { name: "Sorcier",     hp: 28, speed: 42,  r: 9,  dmg: 9,  ai: "mage",    color: "#a066ff", cost: 2,   from: 4 },
  brute:   { name: "Brute",       hp: 95, speed: 36,  r: 14, dmg: 16, ai: "chase",   color: "#ff3b5c", cost: 3,   from: 6 }
};
export const ENEMY_IDS = Object.keys(ENEMIES);

export const BOSSES = [
  { id: "golem",  name: "Golem de données", hp: 520, speed: 34, r: 26, dmg: 18, color: "#ff8a3d" },
  { id: "spider", name: "Reine araignée",   hp: 440, speed: 55, r: 22, dmg: 14, color: "#ff2a6d" },
  { id: "lich",   name: "Liche virale",     hp: 480, speed: 40, r: 22, dmg: 14, color: "#b58cff" }
];
export const bossFor = (floor) => BOSSES[(Math.floor(floor / BOSS_EVERY) - 1 + BOSSES.length * 100) % BOSSES.length];

const hpMul = (floor, room) => 1 + 0.2 * (floor - 1) + 0.03 * (room - 1);
const dmgMul = (floor) => 1 + 0.07 * (floor - 1);

/* ---------- Création de la partie ---------- */

export function createState(rng = Math.random, { classId = FREE_CLASS, ranks = {} } = {}) {
  const cls = classById(classId);
  const a = cls.attack;
  const stats = {
    maxHp: cls.hp, speed: cls.speed, damage: a.dmg, rate: a.rate,
    range: a.range || 0, arc: a.arc || 0, projSpeed: a.speed || 0, pierce: a.pierce || 0, shots: 1,
    crit: 0.05, vampire: 0, burn: 0, frost: 0, shieldMax: 0, shieldCd: 15, bomb: 0, magnet: 60,
    skillCd: cls.skill.cd, regen: 0
  };
  const r = (id) => Math.min(ranks[id] || 0, META.find((m) => m.id === id).max);
  stats.maxHp += 10 * r("hp");
  stats.damage *= 1 + 0.08 * r("power");
  stats.speed *= 1 + 0.04 * r("speed");
  stats.crit += 0.04 * r("crit");

  const state = {
    rng, cls, stats, ranks: { ...ranks },
    time: 0, over: false, revived: false,
    floor: 1, room: 1, kind: "combat",
    player: { x: W / 2, y: H - 70, hp: stats.maxHp, inv: 0, cd: 0, skillCd: 0, shield: 0, shieldT: 0, facing: -Math.PI / 2, ghost: 0, crit100: 0, regenAcc: 0 },
    enemies: [], shots: [], bullets: [], pickups: [], fx: [], obstacles: [], spawnList: [], spawnClock: 0,
    exit: null, chest: null, cleared: false, choices: null, owned: {}, boss: null,
    kills: 0, coins: 0, bossKills: 0, nextId: 1, banner: null
  };
  startRoom(state);
  return state;
}

/* ---------- Salles ---------- */

const roomHasChest = (state) => state.room === 2 || state.room === ROOMS_PER_FLOOR;

function spawnPoint(state, minFromPlayer = 170) {
  for (let tries = 0; tries < 30; tries++) {
    const x = WALL + 20 + state.rng() * (W - 2 * WALL - 40);
    const y = WALL + 20 + state.rng() * (H - 2 * WALL - 40);
    if (dist2({ x, y }, state.player) < minFromPlayer ** 2) continue;
    if (state.obstacles.some((o) => x > o.x - 16 && x < o.x + o.w + 16 && y > o.y - 16 && y < o.y + o.h + 16)) continue;
    return { x, y };
  }
  return { x: W / 2, y: H / 3 };
}

function makeEnemy(state, type, x, y, opts = {}) {
  const def = type in ENEMIES ? ENEMIES[type] : opts.def;
  const mul = (opts.hpMul ?? hpMul(state.floor, state.room)) * (opts.elite ? 3 : 1);
  const hp = def.hp * mul;
  return {
    id: state.nextId++, type, x, y, hp, maxHp: hp, r: def.r * (opts.elite ? 1.3 : 1), dmg: def.dmg * dmgMul(state.floor),
    spawn: opts.spawn ?? 0.7, cd: 1 + state.rng(), st: "idle", t: 0, vx: 0, vy: 0, burn: 0, burnDps: 0, slow: 0, flash: 0,
    elite: !!opts.elite, boss: !!opts.boss, dead: false
  };
}

export function startRoom(state) {
  state.enemies = [];
  state.shots = [];
  state.bullets = [];
  state.pickups = [];
  state.fx = [];
  state.exit = null;
  state.chest = null;
  state.cleared = false;
  state.boss = null;
  state.spawnList = [];
  state.spawnClock = 0;
  const p = state.player;
  p.x = W / 2;
  p.y = H - 70;
  p.inv = Math.max(p.inv, 1);

  const isLast = state.room === ROOMS_PER_FLOOR;
  state.kind = isLast ? (state.floor % BOSS_EVERY === 0 ? "boss" : "elite") : "combat";

  // Piliers : un peu plus nombreux en descendant
  state.obstacles = [];
  const pillars = state.kind === "boss" ? 2 : Math.min(5, Math.floor(state.rng() * (1 + state.floor / 2)));
  for (let i = 0; i < pillars; i++) {
    const x = 100 + Math.floor(state.rng() * 14) * 36;
    const y = 90 + Math.floor(state.rng() * 7) * 36;
    if (Math.abs(x - W / 2) < 60 && y > H - 190) continue;   // ne bouche pas l'entrée
    if (Math.abs(x - W / 2) < 50 && y < 140) continue;       // ni la sortie
    state.obstacles.push({ x, y, w: 36, h: 36 });
  }

  if (state.kind === "boss") {
    const def = bossFor(state.floor);
    const mul = 1 + 0.25 * (state.floor / BOSS_EVERY - 1);
    const b = makeEnemy(state, def.id, W / 2, 120, { def, hpMul: mul, boss: true, spawn: 1.2 });
    b.name = def.name;
    state.enemies.push(b);
    state.boss = b;
  } else {
    let budget = 3 + state.floor * 1.1 + (state.room - 1) * 1.5;
    const pool = ENEMY_IDS.filter((id) => ENEMIES[id].from <= state.floor);
    let at = 0;
    while (budget > 0) {
      const type = pool[Math.floor(state.rng() * pool.length)];
      budget -= ENEMIES[type].cost;
      const pt = spawnPoint(state);
      state.spawnList.push({ at, type, x: pt.x, y: pt.y });
      at += 0.35 + state.rng() * 0.5;
    }
    if (state.kind === "elite") {
      const type = pool[Math.floor(state.rng() * pool.length)];
      const pt = spawnPoint(state);
      state.spawnList.push({ at: 0.5, type, x: pt.x, y: pt.y, elite: true });
    }
  }
  state.banner = { text: state.kind === "boss" ? `Étage ${state.floor} — BOSS` : `Étage ${state.floor} — Salle ${state.room}`, ttl: 2 };
}

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
  const coin = 1 + Math.floor(state.floor / 3);
  drop(state, e.x, e.y, "coin", e.elite ? coin * 4 : e.boss ? coin * 20 : coin);
  if (e.boss) {
    state.bossKills += 1;
    for (let i = 0; i < 6; i++) drop(state, e.x + (i - 2.5) * 12, e.y + 10, "coin", coin * 3);
    drop(state, e.x, e.y + 24, "heart", 0.5);
    state.player.hp = state.stats.maxHp;
    state.bullets = [];
  } else if (state.rng() < (e.elite ? 0.6 : 0.1)) {
    drop(state, e.x, e.y, "heart", 0.2);
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
  if (e.dead || e.spawn > 0) return;
  const s = state.stats;
  const crit = !noCrit && (state.player.crit100 > 0 || state.rng() < s.crit);
  const dmg = crit ? amount * 2 : amount;
  e.hp -= dmg;
  e.flash = 0.1;
  if (knock && !e.boss && from) {
    const d = Math.sqrt(dist2(from, e)) || 1;
    e.x = clamp(e.x + ((e.x - from.x) / d) * knock, WALL + e.r, W - WALL - e.r);
    e.y = clamp(e.y + ((e.y - from.y) / d) * knock, WALL + e.r, H - WALL - e.r);
  }
  if (!silent && state.fx.length < 60) state.fx.push({ kind: "num", x: e.x, y: e.y - e.r, text: String(Math.round(dmg)), ttl: 0.55, max: 0.55, color: crit ? "#fcee0a" : "#ffffff", crit });
  if (e.hp <= 0) killEnemy(state, e, depth);
}

function applyHitEffects(state, e) {
  const s = state.stats;
  if (e.dead) return;
  if (s.burn) { e.burn = 3; e.burnDps = 4 * s.burn * (s.damage / 12); }
  if (s.frost) e.slow = 1.6;
}

/* ---------- Collisions avec les piliers ---------- */

function pushOut(state, ent, r) {
  ent.x = clamp(ent.x, WALL + r, W - WALL - r);
  ent.y = clamp(ent.y, WALL + r, H - WALL - r);
  for (const o of state.obstacles) {
    const cx = clamp(ent.x, o.x, o.x + o.w);
    const cy = clamp(ent.y, o.y, o.y + o.h);
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 === 0) {   // centre à l'intérieur : sort par le côté le plus proche
      const left = ent.x - o.x, right = o.x + o.w - ent.x, up = ent.y - o.y, down = o.y + o.h - ent.y;
      const m = Math.min(left, right, up, down);
      if (m === left) ent.x = o.x - r; else if (m === right) ent.x = o.x + o.w + r; else if (m === up) ent.y = o.y - r; else ent.y = o.y + o.h + r;
    } else {
      const d = Math.sqrt(d2);
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
    }
  }
}

const inObstacle = (state, x, y) => state.obstacles.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);

/* ---------- Tirs et attaques ---------- */

function enemyShoot(state, e, angle, speed, dmgMul = 1, extra = {}) {
  state.bullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: e.dmg * dmgMul, life: 5, r: extra.r || 4, color: extra.color || "#ff3b5c", homing: extra.homing || 0 });
}

const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

function nearestEnemy(state, from, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const e of state.enemies) {
    if (e.dead || e.spawn > 0) continue;
    const d = dist2(from, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function playerAttack(state) {
  const { player, stats, cls } = state;
  const a = cls.attack;
  const reach = a.type === "melee" ? stats.range + 30 : 380;
  const target = nearestEnemy(state, player, reach);
  if (!target) return false;
  const ang = angleTo(player, target);
  player.facing = ang;
  if (a.type === "melee") {
    const range = stats.range;
    state.fx.push({ kind: "slash", x: player.x, y: player.y, angle: ang, arc: stats.arc, r: range, ttl: 0.16, max: 0.16, color: cls.color });
    for (const e of state.enemies) {
      if (e.dead || e.spawn > 0) continue;
      if (dist2(player, e) > (range + e.r) ** 2) continue;
      let diff = Math.abs(angleTo(player, e) - ang);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff <= stats.arc / 2 + 0.15) { damageEnemy(state, e, stats.damage, { knock: 10, from: player }); applyHitEffects(state, e); }
    }
  } else {
    const n = stats.shots;
    for (let i = 0; i < n; i++) {
      const dir = ang + (i - (n - 1) / 2) * 0.16;
      state.shots.push({ x: player.x, y: player.y, vx: Math.cos(dir) * stats.projSpeed, vy: Math.sin(dir) * stats.projSpeed, dmg: stats.damage, pierce: stats.pierce, life: 1.2, hit: new Set(), color: cls.color });
    }
  }
  return true;
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
  if (e.type !== "bat") pushOut(state, e, e.r);
  else { e.x = clamp(e.x, WALL + e.r, W - WALL - e.r); e.y = clamp(e.y, WALL + e.r, H - WALL - e.r); }
}

function bossAI(state, e, dt) {
  const p = state.player;
  const enraged = e.hp < e.maxHp * 0.5;
  const base = angleTo(e, p);
  e.cd -= dt;
  if (e.type === "golem") {
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
  } else if (e.type === "spider") {
    e.phase = (e.phase || 0) + dt;
    const ang = base + Math.PI / 2 * Math.sin(e.phase * 0.9);
    const d = Math.sqrt(dist2(e, p));
    const toward = d > 190 ? 1 : d < 120 ? -1 : 0;
    moveEnemy(state, e, Math.cos(base) * e.speedBase * toward + Math.cos(ang) * e.speedBase * 0.7, Math.sin(base) * e.speedBase * toward + Math.sin(ang) * e.speedBase * 0.7, dt);
    if (e.cd <= 0) {
      const n = enraged ? 7 : 5;
      for (let i = 0; i < n; i++) enemyShoot(state, e, base + (i - (n - 1) / 2) * 0.22, 190, 0.7, { color: "#ff2a6d" });
      e.cd = 1.8;
      e.summonT = (e.summonT || 0) + 1;
      if (e.summonT % 3 === 0 && state.enemies.length < 14) {
        for (let i = 0; i < 2; i++) state.enemies.push(makeEnemy(state, "bat", e.x + (i ? 24 : -24), e.y, { spawn: 0.4 }));
      }
    }
  } else if (e.type === "lich") {
    e.t = (e.t || 0) + dt;
    if (e.t > (enraged ? 3 : 4.2)) {
      e.t = 0;
      state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 30, ttl: 0.3, max: 0.3, color: "#b58cff" });
      const pt = spawnPoint(state, 140);
      e.x = pt.x; e.y = pt.y;
      const count = enraged ? 16 : 10;
      for (let i = 0; i < count; i++) enemyShoot(state, e, (i * Math.PI * 2) / count, 150, 0.6, { color: "#b58cff" });
      if (state.enemies.length < 12) state.enemies.push(makeEnemy(state, "archer", e.x, e.y + 30, { spawn: 0.5 }));
    }
    if (e.cd <= 0) {
      e.cd = enraged ? 1.1 : 1.6;
      enemyShoot(state, e, base, 120, 0.8, { color: "#e0c9ff", r: 5, homing: 1.2 });
    }
    moveEnemy(state, e, Math.cos(base + Math.PI / 2) * 24, Math.sin(base + Math.PI / 2) * 24, dt);
  }
}

function enemyAI(state, e, dt) {
  const p = state.player;
  const def = e.boss ? null : ENEMIES[e.type];
  const speed = e.boss ? e.speedBase : def.speed;
  const base = angleTo(e, p);
  const d = Math.sqrt(dist2(e, p));
  e.cd -= dt;
  switch (e.boss ? "boss" : def.ai) {
    case "boss": bossAI(state, e, dt); break;
    case "chase": moveEnemy(state, e, Math.cos(base) * speed, Math.sin(base) * speed, dt); break;
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
    default: break;
  }
  if (d < e.r + PLAYER_R) hurtPlayer(state, e.dmg);
}

/* ---------- Un pas de simulation ---------- */

// input : { dx, dy, skill }. Renvoie { over, roomCleared, advanced, choices }.
export function update(state, dt, input = { dx: 0, dy: 0, skill: false }) {
  const events = { over: false, roomCleared: false, advanced: false, choices: false };
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
  player.inv = Math.max(0, player.inv - dt);
  player.ghost = Math.max(0, player.ghost - dt);
  player.crit100 = Math.max(0, player.crit100 - dt);
  player.skillCd = Math.max(0, player.skillCd - dt);
  if (stats.regen) player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
  if (stats.shieldMax > 0 && player.shield < stats.shieldMax) {
    player.shieldT -= dt;
    if (player.shieldT <= 0) { player.shield += 1; player.shieldT = stats.shieldCd; }
  }

  /* Compétence et attaque automatique */
  if (input.skill && player.skillCd <= 0) useSkill(state, input);
  player.cd -= dt;
  if (player.cd <= 0) player.cd = playerAttack(state) ? 1 / stats.rate : 0.05;

  /* Apparition des ennemis de la salle */
  state.spawnClock += dt;
  while (state.spawnList.length && state.spawnList[0].at <= state.spawnClock) {
    const s = state.spawnList.shift();
    const e = makeEnemy(state, s.type, s.x, s.y, { elite: s.elite });
    e.speedBase = ENEMIES[s.type].speed;
    state.enemies.push(e);
  }

  /* Ennemis */
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.boss && e.speedBase === undefined) e.speedBase = bossFor(state.floor).speed;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;
    if (e.burn > 0) { e.burn -= dt; damageEnemy(state, e, e.burnDps * dt, { silent: true, noCrit: true }); if (e.dead) continue; }
    if (e.spawn > 0) { e.spawn -= dt; continue; }
    enemyAI(state, e, dt);
    if (state.over) break;
  }
  // Séparation douce entre ennemis
  for (let i = 0; i < state.enemies.length; i++) {
    const a = state.enemies[i];
    if (a.dead || a.spawn > 0 || a.boss) continue;
    for (let j = i + 1; j < state.enemies.length; j++) {
      const b = state.enemies[j];
      if (b.dead || b.spawn > 0 || b.boss) continue;
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
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.x < WALL || s.x > W - WALL || s.y < WALL || s.y > H - WALL || inObstacle(state, s.x, s.y)) s.life = 0;
    if (s.life <= 0) continue;
    for (const e of state.enemies) {
      if (e.dead || e.spawn > 0 || s.hit.has(e.id)) continue;
      if (dist2(s, e) <= (e.r + 3) ** 2) {
        s.hit.add(e.id);
        damageEnemy(state, e, s.dmg, { knock: 6, from: s });
        applyHitEffects(state, e);
        if (s.pierce <= 0) { s.life = 0; break; }
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
    if (b.x < WALL - 10 || b.x > W - WALL + 10 || b.y < WALL - 10 || b.y > H - WALL + 10 || inObstacle(state, b.x, b.y)) b.life = 0;
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
      if (pk.kind === "coin") state.coins += pk.v;
      else player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * pk.v);
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  /* Salle terminée ? */
  if (!state.cleared && !state.spawnList.length && !state.enemies.length) {
    state.cleared = true;
    events.roomCleared = true;
    state.exit = { x: W / 2, y: WALL + 14 };
    if (roomHasChest(state)) state.chest = { x: W / 2, y: H / 2, opened: false };
    state.bullets = [];
  }
  if (state.chest && !state.chest.opened && dist2(state.chest, player) < 26 * 26) {
    state.chest.opened = true;
    state.choices = rollChoices(state);
    events.choices = true;
  }
  if (state.exit && !state.choices && dist2(state.exit, player) < 26 * 26) {
    advance(state);
    events.advanced = true;
  }

  for (const f of state.fx) f.ttl -= dt;
  state.fx = state.fx.filter((f) => f.ttl > 0);

  if (state.over) events.over = true;
  return events;
}

function advance(state) {
  state.room += 1;
  if (state.room > ROOMS_PER_FLOOR) {
    state.room = 1;
    state.floor += 1;
    state.player.hp = Math.min(state.stats.maxHp, state.player.hp + state.stats.maxHp * 0.25);
  }
  startRoom(state);
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
    ITEMS[id].apply(state.stats, state.player, state.cls);
    state.owned[id] = (state.owned[id] || 0) + 1;
  }
  state.choices = null;
  return true;
}

/* ---------- Récompenses de fin de partie ---------- */

// Âmes : monnaie permanente (classes, améliorations). Crédits et pièces bleues : monnaies de l'arcade.
export function runRewards(state) {
  const floors = state.floor - 1 + (state.room - 1) / ROOMS_PER_FLOOR;
  const greed = 1 + 0.15 * (state.ranks.greed || 0);
  const souls = Math.floor((floors * 12 + state.kills / 4 + state.bossKills * 40 + state.coins / 3) * greed);
  const credits = Math.floor(state.floor * 6 + state.kills / 3);
  return { souls, credits, coins: state.bossKills, floor: state.floor };
}
