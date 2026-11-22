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
export const MAX_LEVEL = 4;          // niveaux 1 à 5 ; le niveau 5 est l'amélioration ultime
export const ULTIMATE_LEVEL = MAX_LEVEL;
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
  cryo:   { id: "cryo",   name: "Tour cryo",       desc: "Ralentit les ennemis de 50 % pendant 2 s. Évolue vers le gel.",            cost: 70,  unlock: 150,  range: 2.5, rate: 1.4,  dmg: 3,  color: "#7fd8ff", slow: 0.5,  slowTime: 2 },
  canon:  { id: "canon",  name: "Canon à plasma",  desc: "Dégâts de zone : idéal contre les groupes.",           cost: 95,  unlock: 400,  range: 2.9, rate: 0.8,  dmg: 34, color: "#ff8a3d", splash: 1.15 },
  sniper: { id: "sniper", name: "Sniper",          desc: "Portée immense et gros dégâts, mais lent.",            cost: 120, unlock: 900,  range: 6,   rate: 0.5,  dmg: 100, color: "#fcee0a" },
  tesla:  { id: "tesla",  name: "Tesla",           desc: "Un éclair qui rebondit sur 3 ennemis (plus en montant de niveau) et les étourdit.",                cost: 140, unlock: 1800, range: 2.7, rate: 1.2,  dmg: 26, color: "#b58cff", chain: 3 },
  venin:  { id: "venin",  name: "Injecteur viral", desc: "Empoisonne : dégâts sur la durée, ignore le blindage.", cost: 110, unlock: 1200, range: 2.6, rate: 1.3,  dmg: 6,  color: "#3ddc84", poisonDps: 18, poisonTime: 4 },
  mortier:{ id: "mortier", name: "Mortier",        desc: "Portée énorme, énormes dégâts de zone, très lent.",    cost: 150, unlock: 5000, range: 5,   rate: 0.3,  dmg: 90, color: "#ffb347", splash: 1.7 },
  gatling:{ id: "gatling", name: "Gatling",         desc: "Cadence folle, dégâts minuscules. Achève les essaims.", cost: 130, unlock: 7000, range: 2.4, rate: 6,    dmg: 4,  color: "#e6e6e6" },
  pulsar: { id: "pulsar", name: "Pulsar",          desc: "Onde qui touche tous les ennemis proches.",            cost: 160, unlock: 3000, range: 2.2, rate: 0.7,  dmg: 24, color: "#ff6bd6", pulse: true }
};
export const TOWER_IDS = Object.keys(TOWER_DEFS);

// Caractéristiques d'une tour selon son niveau : chaque tour a sa propre évolution
// (le niveau 5 est l'amélioration ultime : stats nettement plus hautes + une capacité en plus).
export function towerStats(def, level) {
  const ult = level >= ULTIMATE_LEVEL;
  const st = {
    damage: def.dmg * (1 + 0.35 * level) * (ult ? 1.5 : 1),
    range: def.range * (1 + 0.06 * level) * (ult ? 1.1 : 1) * CELL,   // en pixels
    rate: def.rate * (ult ? 1.25 : 1),
    targets: 1, splash: def.splash || 0, chain: def.chain || 0, chainFalloff: 0.85, chainReach: 2,
    stun: 0, slow: def.slow || 0, slowTime: def.slowTime || 0, freezeChance: 0, freezeTime: 0,
    poisonDps: def.poisonDps ? def.poisonDps * (1 + 0.35 * level) : 0, poisonTime: def.poisonTime || 0,
    spreadCount: 0, spreadRadius: 0, crit: 0, critMul: 3, pierce: false, execute: 0,
    pulseSlow: 0, pulseSlowTime: 0
  };
  switch (def.id) {
    case "laser":
      if (level >= 2) st.targets = 2;
      if (ult) { st.targets = 3; st.crit = 0.25; st.critMul = 2.5; }
      break;
    case "cryo":
      st.slow = Math.min(0.8, 0.5 + 0.08 * level);
      st.slowTime = 2 + 0.5 * level;
      if (level >= 2) { st.freezeChance = 0.2; st.freezeTime = 1; }
      if (ult) { st.freezeChance = 0.5; st.freezeTime = 1.5; st.splash = 1.3; }
      break;
    case "canon":
      st.splash += 0.1 * level;
      if (level >= 2) st.stun = 0.3;
      if (ult) { st.stun = 0.7; st.splash += 0.3; }
      break;
    case "sniper":
      if (level >= 1) st.crit = 0.1;
      if (level >= 2) { st.crit = 0.2; st.pierce = true; }
      if (ult) { st.crit = 0.35; st.execute = 0.25; }
      break;
    case "tesla":
      st.chain = 3 + level + (ult ? 2 : 0);
      st.chainReach = 2 + 0.25 * level;
      if (ult) st.chainFalloff = 0.95;
      if (level >= 1) st.stun = 0.2 + 0.08 * level;
      break;
    case "venin":
      st.poisonTime = 4 + level + (ult ? 2 : 0);
      if (level >= 2) { st.spreadCount = 1; st.spreadRadius = 1.2; }
      if (ult) { st.spreadCount = 4; st.spreadRadius = 1.8; }
      break;
    case "mortier":
      st.splash += 0.15 * level;
      if (level >= 2) st.stun = 0.4;
      if (ult) { st.targets = 2; st.stun = 0.8; }
      break;
    case "gatling":
      if (level >= 2) st.pierce = true;
      if (level >= 3) st.crit = 0.1;
      if (ult) st.rate *= 1.3;
      break;
    case "pulsar":
      if (level >= 1) { st.pulseSlow = 0.3; st.pulseSlowTime = 1.2; }
      if (level >= 2) st.stun = 0.3;
      if (ult) st.stun = 0.6;
      break;
  }
  return st;
}

export const towerDamage = (def, level) => towerStats(def, level).damage;
export const towerRange = (def, level) => towerStats(def, level).range;
// Les 3 premières améliorations coûtent cher progressivement ; l'ultime coûte 6 × le prix de pose.
export const upgradeCost = (def, level) => (level >= ULTIMATE_LEVEL - 1 ? Math.round(def.cost * 6) : Math.round(def.cost * 0.8 * (level + 1)));

// Ce que débloque chaque niveau (affiché dans le panneau de la tour sélectionnée).
export const TOWER_PERKS = {
  laser:  [[2, "Double tir : touche 2 ennemis"], [5, "ULTIME : 3 cibles, 25 % de coups critiques ×2,5"]],
  cryo:   [[1, "Ralentissement et durée accrus à chaque niveau"], [3, "20 % de chances de GELER 1 s"], [5, "ULTIME : gel 1,5 s (50 %) en zone"]],
  canon:  [[1, "Explosion plus large à chaque niveau"], [3, "Étourdit 0,3 s les ennemis touchés"], [5, "ULTIME : zone géante, étourdissement 0,7 s"]],
  sniper: [[2, "Critiques ×3 (20 %), ignore le blindage"], [5, "ULTIME : 35 % de critiques, exécute sous 25 % de PV"]],
  tesla:  [[1, "+1 rebond par niveau, étourdit brièvement"], [5, "ULTIME : +2 rebonds, plus aucune perte de dégâts"]],
  venin:  [[1, "Poison plus long à chaque niveau"], [3, "Le poison se propage à 1 voisin"], [5, "ULTIME : propagation à 4 voisins, poison 10 s"]],
  mortier:[[1, "Explosion plus large à chaque niveau"], [3, "Étourdit 0,4 s"], [5, "ULTIME : 2 obus par tir, étourdissement 0,8 s"]],
  gatling:[[3, "Balles perforantes : ignore le blindage"], [4, "10 % de critiques"], [5, "ULTIME : cadence +30 %"]],
  pulsar: [[2, "L'onde ralentit de 30 %"], [3, "L'onde étourdit 0,3 s"], [5, "ULTIME : étourdissement 0,6 s"]]
};

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

// Frappe orbitale : pouvoir actif coûteux, utilisable en pleine vague. Touche tous les ennemis (3 × les PV de base).
export const STRIKE_COOLDOWN = 30;
export const STRIKE_COST = 750;
export const strikeReady = (state) => state.phase === "wave" && state.strikeCd <= 0 && state.gold >= STRIKE_COST;

export function orbitalStrike(state) {
  if (!strikeReady(state)) return false;
  const events = { killed: 0, leaked: 0 };
  const damage = baseHp(state.wave) * 3 * state.map.hpMul;
  state.gold -= STRIKE_COST;
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
    dist: 0, x, y, slow: 0, poison: 0, poisonLeft: 0, stun: 0, dead: false, speed: def.speed * CELL
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

// Étourdissement : les boss y résistent (durée réduite).
function stunEnemy(e, time) {
  if (time <= 0) return;
  e.stun = Math.max(e.stun || 0, e.type === "boss" ? time * 0.4 : time);
}

// Effets secondaires d'un tir sur un ennemi touché (ralentissement, gel, étourdissement, poison).
function applyEffects(state, e, st) {
  if (e.dead) return;
  if (st.slow) { e.slow = Math.max(e.slow, st.slow); e.slowLeft = Math.max(e.slowLeft || 0, st.slowTime); }
  if (st.freezeChance && (state.rng || Math.random)() < st.freezeChance) stunEnemy(e, st.freezeTime);
  if (st.stun) stunEnemy(e, st.stun);
  if (st.poisonDps) {
    e.poison = Math.max(e.poison, st.poisonDps);
    e.poisonLeft = Math.max(e.poisonLeft, st.poisonTime);
  }
}

function fire(state, tower, events) {
  const def = TOWER_DEFS[tower.type];
  const st = towerStats(def, tower.level);
  const range = st.range;
  const cx = (tower.col + 0.5) * CELL;
  const cy = (tower.row + 0.5) * CELL;
  const origin = { x: cx, y: cy };
  const rng = state.rng || Math.random;

  // Cibles : les ennemis à portée les plus avancés sur le chemin.
  const inRange = state.enemies.filter((e) => !e.dead && dist2(origin, e) <= range * range).sort((a, b) => b.dist - a.dist);
  if (!inRange.length) return false;
  const target = inRange[0];

  const beam = (a, b) => state.fx.push({ kind: "beam", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ttl: 0.1, max: 0.1, color: def.color });
  // Dégâts d'un coup : critique et exécution (sniper) selon le niveau.
  const strike = (e, base) => {
    let damage = base;
    if (st.crit && rng() < st.crit) damage *= st.critMul;
    if (st.execute && e.type !== "boss" && e.hp - damage <= e.maxHp * st.execute) damage = Math.max(damage, e.hp);
    hit(state, e, damage, events, st.pierce);
  };

  if (def.pulse) {
    state.fx.push({ kind: "boom", x: cx, y: cy, r: range, ttl: 0.3, max: 0.3, color: def.color });
    for (const e of inRange) {
      strike(e, st.damage);
      if (st.pulseSlow && !e.dead) { e.slow = Math.max(e.slow, st.pulseSlow); e.slowLeft = Math.max(e.slowLeft || 0, st.pulseSlowTime); }
      applyEffects(state, e, { stun: st.stun });
    }
    return true;
  }

  for (const mainTarget of inRange.slice(0, st.targets)) {
    beam(origin, mainTarget);
    if (st.splash) {
      const radius = st.splash * CELL;
      state.fx.push({ kind: "boom", x: mainTarget.x, y: mainTarget.y, r: radius, ttl: 0.25, max: 0.25, color: def.color });
      for (const e of state.enemies) {
        if (e.dead || dist2(mainTarget, e) > radius * radius) continue;
        strike(e, st.damage);
        applyEffects(state, e, st);
      }
    } else if (st.chain) {
      const struck = new Set([mainTarget.id]);
      let from = mainTarget;
      let dmg = st.damage;
      strike(mainTarget, dmg);
      applyEffects(state, mainTarget, st);
      for (let n = 1; n < st.chain; n++) {
        let next = null;
        for (const e of state.enemies) {
          if (e.dead || struck.has(e.id) || dist2(from, e) > (st.chainReach * CELL) ** 2) continue;
          if (!next || dist2(from, e) < dist2(from, next)) next = e;
        }
        if (!next) break;
        struck.add(next.id);
        beam(from, next);
        dmg *= st.chainFalloff;
        strike(next, dmg);
        applyEffects(state, next, st);
        from = next;
      }
    } else {
      strike(mainTarget, st.damage);
      applyEffects(state, mainTarget, st);
      if (st.spreadCount) {
        // Contagion : le poison gagne les ennemis les plus proches de la cible.
        const reach = (st.spreadRadius * CELL) ** 2;
        const near = state.enemies
          .filter((e) => !e.dead && e !== mainTarget && dist2(mainTarget, e) <= reach)
          .sort((a, b) => dist2(mainTarget, a) - dist2(mainTarget, b))
          .slice(0, st.spreadCount);
        for (const e of near) { beam(mainTarget, e); applyEffects(state, e, { poisonDps: st.poisonDps * 0.7, poisonTime: st.poisonTime * 0.8 }); }
      }
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
    if (e.stun > 0) e.stun = Math.max(0, e.stun - dt);
    if (e.poisonLeft > 0) {
      e.poisonLeft -= dt;
      hit(state, e, e.poison * dt, events, true);
      if (e.dead) continue;
    }
    if (e.stun <= 0) e.dist += e.speed * (1 - e.slow) * dt;
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
    if (fire(state, tower, events)) tower.cooldown = 1 / towerStats(TOWER_DEFS[tower.type], tower.level).rate;
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
