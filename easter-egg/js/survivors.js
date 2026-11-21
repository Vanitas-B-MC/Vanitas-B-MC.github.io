// js/survivors.js — logique pure de « Survivor Arena » (aucun accès au DOM, testable sous Node).
// Le personnage tire tout seul sur l'ennemi le plus proche ; le joueur ne fait que se déplacer
// et choisir une amélioration à chaque niveau gagné.

export const W = 720;
export const H = 480;
export const PLAYER_R = 9;
export const MAX_ENEMIES = 160;
export const BOSS_EVERY = 120;         // secondes entre deux boss
export const SECONDS_PER_COIN = 120;   // une pièce bleue toute les 2 minutes survécues

/* ---------- Améliorations proposées à la montée de niveau ---------- */

// max : nombre de fois qu'on peut la prendre. apply(stats) modifie les statistiques du joueur.
export const UPGRADES = {
  damage:   { name: "Surcharge",         desc: "+25 % de dégâts",                      max: 8, apply: (s) => { s.damage *= 1.25; } },
  rate:     { name: "Cadence",           desc: "Tire 18 % plus vite",                  max: 8, apply: (s) => { s.cooldown *= 0.82; } },
  multi:    { name: "Tir multiple",      desc: "+1 projectile par salve",              max: 4, apply: (s) => { s.shots += 1; } },
  pierce:   { name: "Perforation",       desc: "Les tirs traversent +1 ennemi",        max: 4, apply: (s) => { s.pierce += 1; } },
  speed:    { name: "Servomoteurs",      desc: "+12 % de vitesse de déplacement",      max: 5, apply: (s) => { s.speed *= 1.12; } },
  hp:       { name: "Blindage",          desc: "+25 PV max et soigne 25 PV",           max: 6, apply: (s, p) => { s.maxHp += 25; p.hp = Math.min(s.maxHp, p.hp + 25); } },
  regen:    { name: "Nanobots",          desc: "+0,8 PV régénérés par seconde",        max: 5, apply: (s) => { s.regen += 0.8; } },
  magnet:   { name: "Aimant",            desc: "+40 % de portée de ramassage",         max: 4, apply: (s) => { s.magnet *= 1.4; } },
  crit:     { name: "Coup critique",     desc: "+10 % de chance de coup critique (×2)", max: 5, apply: (s) => { s.crit += 0.1; } },
  orbit:    { name: "Lames orbitales",   desc: "+1 lame qui tourne autour de toi",     max: 5, apply: (s) => { s.orbit += 1; } },
  nova:     { name: "Onde de choc",      desc: "Impulsion périodique autour de toi",   max: 5, apply: (s) => { s.nova += 1; } },
  projspeed:{ name: "Munitions rapides", desc: "+30 % de vitesse des projectiles",     max: 3, apply: (s) => { s.projSpeed *= 1.3; } }
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

const HEAL = { id: "heal", name: "Réparation", desc: "Soigne 40 PV" };

/* ---------- Ennemis ---------- */

export const ENEMY_DEFS = {
  grunt: { name: "Drone",   hp: 20,  speed: 55, r: 9,  dmg: 10, xp: 1,  color: "#ff2a6d" },
  swarm: { name: "Essaim",  hp: 8,   speed: 95, r: 6,  dmg: 6,  xp: 1,  color: "#fcee0a" },
  brute: { name: "Brute",   hp: 90,  speed: 38, r: 15, dmg: 20, xp: 5,  color: "#a066ff" },
  boss:  { name: "Virus",   hp: 700, speed: 42, r: 26, dmg: 30, xp: 40, color: "#ffffff" }
};

export const xpNeeded = (level) => Math.round(3 + level * 3 + level * level * 0.4);
const hpScale = (time) => 1 + time / 120;

/* ---------- Partie ---------- */

export function createState(rng = Math.random) {
  const stats = {
    maxHp: 140, speed: 130, damage: 14, cooldown: 0.5, shots: 1, pierce: 0,
    projSpeed: 340, magnet: 50, regen: 0, crit: 0, orbit: 0, nova: 0
  };
  return {
    rng,
    time: 0,
    over: false,
    player: { x: W / 2, y: H / 2, hp: stats.maxHp, inv: 0, cd: 0, nova: 0, spin: 0 },
    stats,
    level: 1,
    xp: 0,
    pending: 0,           // niveaux gagnés en attente de choix
    choices: null,        // 3 améliorations proposées (le jeu est en pause tant qu'elle est non nulle)
    owned: {},            // id → nombre de fois prise
    enemies: [],
    shots: [],
    gems: [],
    fx: [],
    kills: 0,
    spawnClock: 0,
    nextBoss: BOSS_EVERY,
    nextId: 1
  };
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function rollChoices(state) {
  const pool = UPGRADE_IDS.filter((id) => (state.owned[id] || 0) < UPGRADES[id].max);
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const i = Math.floor(state.rng() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  while (picks.length < 3) picks.push("heal");   // tout est au maximum : on propose du soin
  return picks;
}

export function describe(id) {
  return id === "heal" ? HEAL : { id, ...UPGRADES[id] };
}

// Applique le choix du joueur. Renvoie false si ce choix n'était pas proposé.
export function chooseUpgrade(state, id) {
  if (!state.choices || !state.choices.includes(id)) return false;
  if (id === "heal") {
    state.player.hp = Math.min(state.stats.maxHp, state.player.hp + 40);
  } else {
    UPGRADES[id].apply(state.stats, state.player);
    state.owned[id] = (state.owned[id] || 0) + 1;
  }
  state.pending -= 1;
  state.choices = state.pending > 0 ? rollChoices(state) : null;
  return true;
}

function spawnEnemy(state, type) {
  const def = ENEMY_DEFS[type];
  // Apparition sur un bord de l'arène, au hasard
  const side = Math.floor(state.rng() * 4);
  const t = state.rng();
  const m = def.r + 2;
  const x = side === 0 ? -m : side === 1 ? W + m : t * W;
  const y = side === 2 ? -m : side === 3 ? H + m : t * H;
  const hp = def.hp * hpScale(state.time);
  state.enemies.push({ id: state.nextId++, type, x, y, hp, maxHp: hp, hitCd: 0 });
}

function pickType(state) {
  const t = state.time;
  const r = state.rng();
  if (t > 60 && r < 0.14) return "brute";
  if (t > 30 && r < 0.35) return "swarm";
  return "grunt";
}

function damageEnemy(state, enemy, amount) {
  const crit = state.rng() < state.stats.crit;
  enemy.hp -= crit ? amount * 2 : amount;
  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.dead = true;
    state.kills += 1;
    state.gems.push({ x: enemy.x, y: enemy.y, xp: ENEMY_DEFS[enemy.type].xp });
  }
}

function nearest(state, from, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = dist2(from, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Un pas de simulation. input : { dx, dy } entre -1 et 1. Renvoie { levelUp, over }.
export function update(state, dt, input = { dx: 0, dy: 0 }) {
  const events = { levelUp: false, over: false };
  if (state.over || state.choices) return events;

  const { player, stats } = state;
  state.time += dt;

  /* Déplacement */
  let { dx, dy } = input;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  player.x = Math.min(W - PLAYER_R, Math.max(PLAYER_R, player.x + dx * stats.speed * dt));
  player.y = Math.min(H - PLAYER_R, Math.max(PLAYER_R, player.y + dy * stats.speed * dt));
  player.inv = Math.max(0, player.inv - dt);
  player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
  player.spin += dt * 3;

  /* Apparition des ennemis */
  state.spawnClock -= dt;
  if (state.spawnClock <= 0) {
    state.spawnClock = Math.max(0.25, 1.1 - state.time * 0.003);
    const count = 1 + Math.floor(state.time / 70);
    for (let i = 0; i < count && state.enemies.length < MAX_ENEMIES; i++) spawnEnemy(state, pickType(state));
  }
  if (state.time >= state.nextBoss) {
    state.nextBoss += BOSS_EVERY;
    spawnEnemy(state, "boss");
  }

  /* Tir automatique sur l'ennemi le plus proche */
  player.cd -= dt;
  if (player.cd <= 0) {
    const target = nearest(state, player, 420);
    if (target) {
      player.cd = stats.cooldown;
      const base = Math.atan2(target.y - player.y, target.x - player.x);
      const spread = 0.16;
      for (let i = 0; i < stats.shots; i++) {
        const a = base + (i - (stats.shots - 1) / 2) * spread;
        state.shots.push({
          x: player.x, y: player.y, vx: Math.cos(a) * stats.projSpeed, vy: Math.sin(a) * stats.projSpeed,
          life: 1.4, pierce: stats.pierce, hit: new Set()
        });
      }
    } else {
      player.cd = 0.05;
    }
  }

  /* Projectiles */
  for (const s of state.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) s.life = 0;
    if (s.life <= 0) continue;
    for (const e of state.enemies) {
      if (e.dead || s.hit.has(e.id)) continue;
      const r = ENEMY_DEFS[e.type].r + 3;
      if (dist2(s, e) <= r * r) {
        s.hit.add(e.id);
        damageEnemy(state, e, stats.damage);
        if (s.pierce <= 0) { s.life = 0; break; }
        s.pierce -= 1;
      }
    }
  }
  state.shots = state.shots.filter((s) => s.life > 0);

  /* Lames orbitales */
  if (stats.orbit > 0) {
    for (let i = 0; i < stats.orbit; i++) {
      const a = player.spin + (i * Math.PI * 2) / stats.orbit;
      const blade = { x: player.x + Math.cos(a) * 58, y: player.y + Math.sin(a) * 58 };
      for (const e of state.enemies) {
        if (e.dead || e.hitCd > 0) continue;
        const r = ENEMY_DEFS[e.type].r + 7;
        if (dist2(blade, e) <= r * r) {
          damageEnemy(state, e, stats.damage * 0.8);
          e.hitCd = 0.35;
        }
      }
    }
  }

  /* Onde de choc */
  if (stats.nova > 0) {
    player.nova -= dt;
    if (player.nova <= 0) {
      player.nova = Math.max(1.4, 5 - stats.nova * 0.6);
      const radius = 70 + stats.nova * 16;
      for (const e of state.enemies) {
        if (!e.dead && dist2(player, e) <= (radius + ENEMY_DEFS[e.type].r) ** 2) damageEnemy(state, e, stats.damage * (1.5 + stats.nova * 0.5));
      }
      state.fx.push({ kind: "ring", x: player.x, y: player.y, r: radius, ttl: 0.35, max: 0.35 });
    }
  }

  /* Ennemis : poursuite et contact */
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.hitCd = Math.max(0, e.hitCd - dt);
    const def = ENEMY_DEFS[e.type];
    const d = Math.sqrt(dist2(player, e)) || 1;
    e.x += ((player.x - e.x) / d) * def.speed * dt;
    e.y += ((player.y - e.y) / d) * def.speed * dt;
    if (d < def.r + PLAYER_R && player.inv <= 0) {
      player.hp -= def.dmg;
      player.inv = 0.6;
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead);

  /* Gemmes d'expérience */
  const pull = stats.magnet;
  for (const g of state.gems) {
    const d = Math.sqrt(dist2(player, g)) || 1;
    if (d < pull) {
      const v = 260 * dt;
      g.x += ((player.x - g.x) / d) * v;
      g.y += ((player.y - g.y) / d) * v;
    }
    if (d < PLAYER_R + 5) { state.xp += g.xp; g.taken = true; }
  }
  state.gems = state.gems.filter((g) => !g.taken);

  while (state.xp >= xpNeeded(state.level)) {
    state.xp -= xpNeeded(state.level);
    state.level += 1;
    state.pending += 1;
    events.levelUp = true;
  }
  if (state.pending > 0 && !state.choices) state.choices = rollChoices(state);

  /* Effets visuels et fin de partie */
  for (const f of state.fx) f.ttl -= dt;
  state.fx = state.fx.filter((f) => f.ttl > 0);

  if (player.hp <= 0) {
    player.hp = 0;
    state.over = true;
    events.over = true;
  }
  return events;
}

/* ---------- Récompenses ---------- */

export const creditsFor = (state) => Math.floor(state.kills / 4) + Math.floor(state.time / 10);
export const coinsFor = (state) => Math.floor(state.time / SECONDS_PER_COIN);
