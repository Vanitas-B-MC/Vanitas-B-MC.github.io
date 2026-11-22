// js/td.js — logique pure du Tower Defense « Pare-feu » (aucun accès au DOM, donc testable).
// Séparée de l'affichage (ui-td.js).
//
// Deux monnaies, à ne pas confondre :
//   - l'ÉNERGIE (state.gold) : sert à poser et améliorer des tours PENDANT une partie ;
//   - les CRÉDITS (portefeuille) : servent à DÉBLOQUER un type de tour pour de bon.
//     Chaque vague survivie rapporte aussi quelques crédits.

export const COLS = 14;
export const ROWS = 9;
export const CELL = 40;

export const START_LIVES = 20;
export const START_GOLD = 140;
export const MAX_LEVEL = 3;
export const SELL_RATIO = 0.6;

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
  cryo:   { id: "cryo",   name: "Tour cryo",       desc: "Ralentit les ennemis de 50 % pendant 2 s.",            cost: 70,  unlock: 150,  range: 2.5, rate: 1.4,  dmg: 3,  color: "#7fd8ff", slow: 0.5,  slowTime: 2 },
  canon:  { id: "canon",  name: "Canon à plasma",  desc: "Dégâts de zone : idéal contre les groupes.",           cost: 95,  unlock: 400,  range: 2.9, rate: 0.8,  dmg: 34, color: "#ff8a3d", splash: 1.15 },
  sniper: { id: "sniper", name: "Sniper",          desc: "Portée immense et gros dégâts, mais lent.",            cost: 120, unlock: 900,  range: 6,   rate: 0.5,  dmg: 100, color: "#fcee0a" },
  tesla:  { id: "tesla",  name: "Tesla",           desc: "Un éclair qui rebondit sur 3 ennemis.",                cost: 140, unlock: 1800, range: 2.7, rate: 1.2,  dmg: 26, color: "#b58cff", chain: 3 },
  venin:  { id: "venin",  name: "Injecteur viral", desc: "Empoisonne : dégâts sur la durée, ignore le blindage.", cost: 110, unlock: 1200, range: 2.6, rate: 1.3,  dmg: 6,  color: "#3ddc84", poisonDps: 18, poisonTime: 4 },
  mortier:{ id: "mortier", name: "Mortier",        desc: "Portée énorme, énormes dégâts de zone, très lent.",    cost: 150, unlock: 5000, range: 5,   rate: 0.3,  dmg: 90, color: "#ffb347", splash: 1.7 },
  gatling:{ id: "gatling", name: "Gatling",         desc: "Cadence folle, dégâts minuscules. Achève les essaims.", cost: 130, unlock: 7000, range: 2.4, rate: 6,    dmg: 4,  color: "#e6e6e6" },
  pulsar: { id: "pulsar", name: "Pulsar",          desc: "Onde qui touche tous les ennemis proches.",            cost: 160, unlock: 3000, range: 2.2, rate: 0.7,  dmg: 24, color: "#ff6bd6", pulse: true }
};
export const TOWER_IDS = Object.keys(TOWER_DEFS);

export const towerDamage = (def, level) => def.dmg * (1 + 0.35 * level);
export const towerRange = (def, level) => def.range * (1 + 0.06 * level) * CELL;   // en pixels
export const upgradeCost = (def, level) => Math.round(def.cost * 0.8 * (level + 1));

// Énergie dépensée au total pour une tour (pose + améliorations) : sert à calculer la revente.
export function invested(tower) {
  const def = TOWER_DEFS[tower.type];
  let sum = def.cost;
  for (let l = 0; l < tower.level; l++) sum += upgradeCost(def, l);
  return sum;
}

/* ---------- Ennemis et vagues ---------- */

// hp : multiplicateur de points de vie. speed : cases par seconde. gold : énergie gagnée à la mort.
export const ENEMY_DEFS = {
  drone:  { name: "Drone",  hp: 1,    speed: 1.5, gold: 4,  lives: 1, color: "#ff2a6d" },
  runner: { name: "Sprint", hp: 0.55, speed: 2.5, gold: 5,  lives: 1, color: "#fcee0a" },
  tank:   { name: "Blindé", hp: 3.4,  speed: 0.9, gold: 10, lives: 2, color: "#a066ff" },
  armored:{ name: "Cuirassé", hp: 2.2, speed: 1.1, gold: 9,  lives: 2, color: "#9aa5b1", armor: 5 },
  swarm:  { name: "Essaim",  hp: 0.25, speed: 2.0, gold: 2,  lives: 1, color: "#ffd1e8" },
  boss:   { name: "Virus",  hp: 26,   speed: 0.7, gold: 70, lives: 8, color: "#ffffff" }
};

export const baseHp = (wave) => 26 * 1.17 ** (wave - 1);
export const waveCredits = (wave, map = BUILT[FREE_MAP]) => Math.round((5 + 3 * wave) * (map.reward || 1));   // crédits versés quand la vague est repoussée
export const waveBonusGold = (wave) => 20 + 2 * wave;     // énergie offerte à la fin de la vague

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
  if (wave % 10 === 0) list.push({ type: "boss", hp: hp * ENEMY_DEFS.boss.hp, at: count * gap + 1 });
  return list.sort((x, y) => x.at - y.at);
}

/* ---------- Partie ---------- */

export function createState(unlocked = [FREE_TOWER], mapId = FREE_MAP) {
  return {
    map: builtMap(mapId),
    unlocked: unlocked.filter((id) => TOWER_IDS.includes(id)),
    gold: START_GOLD,
    lives: START_LIVES,
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
    strikeCd: 0             // temps restant avant de pouvoir relancer la frappe orbitale
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
  const tower = { id: state.nextId++, type: typeId, col, row, level: 0, cooldown: 0 };
  state.towers.push(tower);
  return { ok: true, tower };
}

export function upgradeTower(state, id) {
  const tower = state.towers.find((t) => t.id === id);
  if (!tower) return { ok: false, reason: "unknown" };
  if (state.phase === "over") return { ok: false, reason: "over" };
  if (tower.level >= MAX_LEVEL) return { ok: false, reason: "max" };
  const price = upgradeCost(TOWER_DEFS[tower.type], tower.level);
  if (state.gold < price) return { ok: false, reason: "gold" };
  state.gold -= price;
  tower.level += 1;
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

// Frappe orbitale : pouvoir actif, utilisable en pleine vague. Touche tous les ennemis (4 × les PV de base).
export const STRIKE_COOLDOWN = 50;
export const strikeReady = (state) => state.phase === "wave" && state.strikeCd <= 0;

export function orbitalStrike(state) {
  if (!strikeReady(state)) return false;
  const events = { killed: 0, leaked: 0 };
  const damage = baseHp(state.wave) * 4 * state.map.hpMul;
  for (const e of state.enemies) if (!e.dead) hit(state, e, damage, events);
  state.strikeCd = STRIKE_COOLDOWN;
  state.fx.push({ kind: "boom", x: (COLS * CELL) / 2, y: (ROWS * CELL) / 2, r: (COLS * CELL) / 2, ttl: 0.5, max: 0.5, color: "#ffffff" });
  return true;
}

export function startWave(state) {
  if (state.phase !== "idle") return false;
  state.wave += 1;
  state.phase = "wave";
  state.spawnList = waveSpec(state.wave, state.map.hpMul);
  state.spawnClock = 0;
  return true;
}

/* ---------- Simulation ---------- */

function spawn(state, entry) {
  const def = ENEMY_DEFS[entry.type];
  const { x, y } = pointAt(0, state.map);
  state.enemies.push({
    id: state.nextId++, type: entry.type, hp: entry.hp, maxHp: entry.hp,
    dist: 0, x, y, slow: 0, poison: 0, poisonLeft: 0, dead: false, speed: def.speed * CELL
  });
}

// pierce : le poison ignore le blindage ; un coup direct perd `armor` points (au moins 20 % passent).
function hit(state, enemy, damage, events, pierce = false) {
  if (enemy.dead) return;
  const armor = pierce ? 0 : ENEMY_DEFS[enemy.type].armor || 0;
  enemy.hp -= armor ? Math.max(damage * 0.2, damage - armor) : damage;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    state.gold += ENEMY_DEFS[enemy.type].gold;
    state.kills += 1;
    events.killed += 1;
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function fire(state, tower, events) {
  const def = TOWER_DEFS[tower.type];
  const range = towerRange(def, tower.level);
  const cx = (tower.col + 0.5) * CELL;
  const cy = (tower.row + 0.5) * CELL;
  const origin = { x: cx, y: cy };

  // Cible : l'ennemi à portée qui est le plus avancé sur le chemin.
  let target = null;
  for (const e of state.enemies) {
    if (e.dead || dist2(origin, e) > range * range) continue;
    if (!target || e.dist > target.dist) target = e;
  }
  if (!target) return false;

  const damage = towerDamage(def, tower.level);
  const beam = (a, b) => state.fx.push({ kind: "beam", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ttl: 0.1, max: 0.1, color: def.color });

  if (def.pulse) {
    state.fx.push({ kind: "boom", x: cx, y: cy, r: range, ttl: 0.3, max: 0.3, color: def.color });
    for (const e of state.enemies) if (!e.dead && dist2(origin, e) <= range * range) hit(state, e, damage, events);
    return true;
  }

  beam(origin, target);

  if (def.splash) {
    const radius = def.splash * CELL;
    state.fx.push({ kind: "boom", x: target.x, y: target.y, r: radius, ttl: 0.25, max: 0.25, color: def.color });
    for (const e of state.enemies) if (!e.dead && dist2(target, e) <= radius * radius) hit(state, e, damage, events);
  } else if (def.chain) {
    const struck = new Set([target.id]);
    let from = target;
    hit(state, target, damage, events);
    for (let n = 1; n < def.chain; n++) {
      let next = null;
      for (const e of state.enemies) {
        if (e.dead || struck.has(e.id) || dist2(from, e) > (2 * CELL) ** 2) continue;
        if (!next || dist2(from, e) < dist2(from, next)) next = e;
      }
      if (!next) break;
      struck.add(next.id);
      beam(from, next);
      hit(state, next, damage * 0.85, events);
      from = next;
    }
  } else {
    hit(state, target, damage, events);
    if (def.poisonDps) {
      target.poison = def.poisonDps * (1 + 0.35 * tower.level);
      target.poisonLeft = def.poisonTime;
    }
    if (def.slow) {
      target.slow = def.slow;
      target.slowLeft = def.slowTime;
    }
  }
  return true;
}

// Fait avancer la partie de `dt` secondes (petit pas : 1/60 s). Renvoie ce qui s'est passé.
export function update(state, dt) {
  const events = { killed: 0, leaked: 0, waveCleared: false, credits: 0, over: false };
  if (state.phase === "over") return events;
  state.time += dt;
  if (state.strikeCd > 0) state.strikeCd = Math.max(0, state.strikeCd - dt);

  // Apparitions
  if (state.phase === "wave") {
    state.spawnClock += dt;
    while (state.spawnList.length && state.spawnList[0].at <= state.spawnClock) spawn(state, state.spawnList.shift());
  }

  // Déplacement des ennemis
  for (const e of state.enemies) {
    if (e.slowLeft > 0) {
      e.slowLeft -= dt;
      if (e.slowLeft <= 0) e.slow = 0;
    }
    if (e.poisonLeft > 0) {
      e.poisonLeft -= dt;
      hit(state, e, e.poison * dt, events, true);
      if (e.dead) continue;
    }
    e.dist += e.speed * (1 - e.slow) * dt;
    if (e.dist >= state.map.length) {
      e.dead = true;
      e.leaked = true;
      state.lives -= ENEMY_DEFS[e.type].lives;
      events.leaked += 1;
      continue;
    }
    const p = pointAt(e.dist, state.map);
    e.x = p.x;
    e.y = p.y;
  }

  // Tirs des tours
  for (const tower of state.towers) {
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    if (fire(state, tower, events)) tower.cooldown = 1 / TOWER_DEFS[tower.type].rate;
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
    state.gold += waveBonusGold(state.wave);
    const credits = waveCredits(state.wave, state.map);
    state.creditsEarned += credits;
    events.waveCleared = true;
    events.credits = credits;
  }
  return events;
}
