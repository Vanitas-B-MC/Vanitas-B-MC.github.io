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

/* ---------- Chemin des ennemis ---------- */

// Points de passage en cases (le chemin entre et sort hors de l'écran).
export const WAYPOINTS = [[-1, 1], [11, 1], [11, 4], [2, 4], [2, 7], [14, 7]];

const points = WAYPOINTS.map(([c, r]) => [(c + 0.5) * CELL, (r + 0.5) * CELL]);
const segments = [];
let total = 0;
for (let i = 0; i < points.length - 1; i++) {
  const [x1, y1] = points[i];
  const [x2, y2] = points[i + 1];
  const length = Math.hypot(x2 - x1, y2 - y1);
  segments.push({ x1, y1, x2, y2, length, start: total });
  total += length;
}
export const PATH_LENGTH = total;
export const PATH_POINTS = points;

// Cases du chemin : on ne peut pas y poser de tour.
const pathCells = new Set();
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const [c1, r1] = WAYPOINTS[i];
  const [c2, r2] = WAYPOINTS[i + 1];
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) pathCells.add(`${c},${r}`);
  }
}
export const isPathCell = (col, row) => pathCells.has(`${col},${row}`);

// Position (en pixels) d'un ennemi qui a parcouru `dist` pixels du chemin.
export function pointAt(dist) {
  const d = Math.min(Math.max(dist, 0), PATH_LENGTH);
  const seg = segments.find((s) => d <= s.start + s.length) || segments[segments.length - 1];
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
  tesla:  { id: "tesla",  name: "Tesla",           desc: "Un éclair qui rebondit sur 3 ennemis.",                cost: 140, unlock: 1800, range: 2.7, rate: 1.2,  dmg: 26, color: "#b58cff", chain: 3 }
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
  boss:   { name: "Virus",  hp: 26,   speed: 0.7, gold: 70, lives: 8, color: "#ffffff" }
};

export const baseHp = (wave) => 26 * 1.17 ** (wave - 1);
export const waveCredits = (wave) => 5 + 3 * wave;        // crédits versés quand la vague est repoussée
export const waveBonusGold = (wave) => 20 + 2 * wave;     // énergie offerte à la fin de la vague

// Liste des ennemis d'une vague, avec l'instant de leur apparition (en secondes).
export function waveSpec(wave) {
  const count = Math.min(6 + 2 * wave, 56);
  const gap = Math.max(0.32, 0.95 - 0.025 * wave);
  const hp = baseHp(wave);
  const list = [];
  for (let i = 0; i < count; i++) {
    let type = "drone";
    if (wave >= 3 && i % 3 === 2) type = "runner";
    if (wave >= 5 && i % 5 === 4) type = "tank";
    list.push({ type, hp: hp * ENEMY_DEFS[type].hp, at: i * gap });
  }
  if (wave % 10 === 0) list.push({ type: "boss", hp: hp * ENEMY_DEFS.boss.hp, at: count * gap + 1 });
  return list;
}

/* ---------- Partie ---------- */

export function createState(unlocked = [FREE_TOWER]) {
  return {
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
    kills: 0
  };
}

export const towerAt = (state, col, row) => state.towers.find((t) => t.col === col && t.row === row) || null;

export function canPlace(state, col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return !isPathCell(col, row) && !towerAt(state, col, row);
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

export function startWave(state) {
  if (state.phase !== "idle") return false;
  state.wave += 1;
  state.phase = "wave";
  state.spawnList = waveSpec(state.wave);
  state.spawnClock = 0;
  return true;
}

/* ---------- Simulation ---------- */

function spawn(state, entry) {
  const def = ENEMY_DEFS[entry.type];
  const { x, y } = pointAt(0);
  state.enemies.push({
    id: state.nextId++, type: entry.type, hp: entry.hp, maxHp: entry.hp,
    dist: 0, x, y, slow: 0, dead: false, speed: def.speed * CELL
  });
}

function hit(state, enemy, damage, events) {
  if (enemy.dead) return;
  enemy.hp -= damage;
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
    e.dist += e.speed * (1 - e.slow) * dt;
    if (e.dist >= PATH_LENGTH) {
      e.dead = true;
      e.leaked = true;
      state.lives -= ENEMY_DEFS[e.type].lives;
      events.leaked += 1;
      continue;
    }
    const p = pointAt(e.dist);
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
    const credits = waveCredits(state.wave);
    state.creditsEarned += credits;
    events.waveCleared = true;
    events.credits = credits;
  }
  return events;
}
