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
  lightning:{ name: "Foudre",           desc: "Des éclairs frappent des ennemis au hasard", max: 5, apply: (s) => { s.lightning += 1; } },
  vampire:  { name: "Vol de vie",        desc: "+0,6 PV par ennemi éliminé",           max: 5, apply: (s) => { s.vampire += 1; } },
  armor:    { name: "Plaques d'acier",   desc: "−8 % de dégâts subis",                 max: 5, apply: (s) => { s.armor += 0.08; } },
  xpgain:   { name: "Décodeur",         desc: "+25 % d'expérience gagnée",           max: 4, apply: (s) => { s.xpGain += 0.25; } },
  projspeed:{ name: "Munitions rapides", desc: "+30 % de vitesse des projectiles",     max: 3, apply: (s) => { s.projSpeed *= 1.3; } },
  /* Pouvoirs spectaculaires */
  missiles: { name: "Missiles chercheurs", desc: "Des missiles à tête chercheuse explosent sur les ennemis", max: 5, apply: (s) => { s.missiles += 1; } },
  meteor:   { name: "Pluie de météores",   desc: "Des météores s'abattent sur les ennemis (zone ciblée)",    max: 5, apply: (s) => { s.meteor += 1; } },
  fire:     { name: "Traînée de feu",      desc: "Tu laisses derrière toi des flammes qui brûlent",          max: 5, apply: (s) => { s.fire += 1; } },
  beam:     { name: "Rayon rotatif",       desc: "Un rayon laser balaie l'arène autour de toi",              max: 5, apply: (s) => { s.beam += 1; } },
  hole:     { name: "Singularité",         desc: "Un trou noir aspire et broie les ennemis",                 max: 3, apply: (s) => { s.hole += 1; } }
};
// Personnages : unlock = crédits pour le débloquer. apply modifie les statistiques de départ.
export const CHARACTERS = [
  { id: "runner", name: "Coureur", desc: "Équilibré. Le personnage de départ.", unlock: 0, apply: () => {} },
  { id: "tank",   name: "Colosse", desc: "+60 PV, 15 % plus lent, commence avec une onde de choc.", unlock: 800,
    apply: (st, p, owned) => { st.maxHp += 60; p.hp = st.maxHp; st.speed *= 0.85; st.nova = 1; owned.nova = 1; } },
  { id: "hacker", name: "Hacker",  desc: "−30 PV, +15 % de critiques, commence avec 2 lames orbitales.", unlock: 2500,
    apply: (st, p, owned) => { st.maxHp -= 30; p.hp = st.maxHp; st.crit += 0.15; st.orbit = 2; owned.orbit = 2; } },
  { id: "ghost",  name: "Fantôme", desc: "−40 PV, +25 % de vitesse, les tirs traversent 2 ennemis.", unlock: 6000,
    apply: (st, p, owned) => { st.maxHp -= 40; p.hp = st.maxHp; st.speed *= 1.25; st.pierce += 2; owned.pierce = 2; } },
  { id: "gunner", name: "Artilleur", desc: "Tire 2 projectiles par salve, mais 25 % plus lentement.", unlock: 12000,
    apply: (st, p, owned) => { st.shots = 2; st.cooldown *= 1.25; owned.multi = 1; } }
];
export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const FREE_CHARACTER = "runner";

export const UPGRADE_IDS = Object.keys(UPGRADES);

const HEAL = { id: "heal", name: "Réparation", desc: "Soigne 40 PV" };

/* ---------- Ennemis ---------- */

export const ENEMY_DEFS = {
  grunt: { name: "Drone",   hp: 20,  speed: 55, r: 9,  dmg: 10, xp: 1,  color: "#ff2a6d" },
  swarm: { name: "Essaim",  hp: 8,   speed: 95, r: 6,  dmg: 6,  xp: 1,  color: "#fcee0a" },
  brute: { name: "Brute",   hp: 90,  speed: 38, r: 15, dmg: 20, xp: 5,  color: "#a066ff" },
  elite: { name: "Élite",   hp: 160, speed: 50, r: 13, dmg: 18, xp: 12, color: "#00f0ff" },
  boss:  { name: "Virus",   hp: 700, speed: 42, r: 26, dmg: 30, xp: 40, color: "#ffffff" },
  overlord: { name: "Overlord", hp: 1100, speed: 38, r: 28, dmg: 35, xp: 60, color: "#ff8a3d" }
};

export const xpNeeded = (level) => Math.round(3 + level * 3 + level * level * 0.4);
const hpScale = (time) => 1 + time / 120;

/* ---------- Partie ---------- */

// `size` : dimensions logiques de l'arène (la vue les adapte à l'écran : plus grande sur PC).
export function createState(rng = Math.random, characterId = FREE_CHARACTER, size = {}) {
  const w = Math.max(360, Math.round(size.w || W));
  const h = Math.max(240, Math.round(size.h || H));
  const stats = {
    maxHp: 140, speed: 130, damage: 14, cooldown: 0.5, shots: 1, pierce: 0,
    projSpeed: 340, magnet: 50, regen: 0, crit: 0, orbit: 0, nova: 0, lightning: 0, vampire: 0, armor: 0, xpGain: 0,
    missiles: 0, meteor: 0, fire: 0, beam: 0, hole: 0
  };
  const state = {
    rng,
    w, h,
    time: 0,
    over: false,
    player: { x: w / 2, y: h / 2, hp: stats.maxHp, inv: 0, cd: 0, nova: 0, spin: 0, bolt: 1, pm: 1, pt: 2, ph: 6, pf: 0, beam: 0 },
    stats,
    level: 1,
    xp: 0,
    pending: 0,           // niveaux gagnés en attente de choix
    choices: null,        // 3 améliorations proposées (le jeu est en pause tant qu'elle est non nulle)
    owned: {},            // id → nombre de fois prise
    enemies: [],
    shots: [],
    missiles: [],         // missiles chercheurs en vol
    zones: [],            // effets au sol : météores (alerte), flammes, trous noirs
    gems: [],
    fx: [],
    kills: 0,
    spawnClock: 0,
    nextBoss: BOSS_EVERY,
    bossCount: 0,
    nextElite: 50,
    nextId: 1,
    character: characterId
  };
  (CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0]).apply(stats, state.player, state.owned);
  return state;
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
  const x = side === 0 ? -m : side === 1 ? state.w + m : t * state.w;
  const y = side === 2 ? -m : side === 3 ? state.h + m : t * state.h;
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
    if (state.stats.vampire) state.player.hp = Math.min(state.stats.maxHp, state.player.hp + 0.6 * state.stats.vampire);
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
  player.x = Math.min(state.w - PLAYER_R, Math.max(PLAYER_R, player.x + dx * stats.speed * dt));
  player.y = Math.min(state.h - PLAYER_R, Math.max(PLAYER_R, player.y + dy * stats.speed * dt));
  player.inv = Math.max(0, player.inv - dt);
  player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
  player.spin += dt * 3;

  /* Apparition des ennemis */
  state.spawnClock -= dt;
  if (state.spawnClock <= 0) {
    // arène plus vaste → un peu plus d'ennemis, pour garder la même pression
    state.spawnClock = Math.max(0.25, 1.1 - state.time * 0.003) / Math.sqrt((state.w * state.h) / (W * H));
    const count = 1 + Math.floor(state.time / 70);
    for (let i = 0; i < count && state.enemies.length < MAX_ENEMIES; i++) spawnEnemy(state, pickType(state));
  }
  if (state.time >= state.nextBoss) {
    state.nextBoss += BOSS_EVERY;
    state.bossCount += 1;
    spawnEnemy(state, state.bossCount % 2 === 0 ? "overlord" : "boss");   // un boss sur deux invoque des drones
  }
  if (state.time >= state.nextElite) {
    state.nextElite += 50;
    spawnEnemy(state, "elite");
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
    if (s.x < -20 || s.x > state.w + 20 || s.y < -20 || s.y > state.h + 20) s.life = 0;
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

  /* Foudre : des éclairs sur des ennemis au hasard */
  if (stats.lightning > 0) {
    player.bolt -= dt;
    if (player.bolt <= 0) {
      player.bolt = Math.max(1.1, 3 - stats.lightning * 0.35);
      const near = state.enemies.filter((e) => !e.dead && dist2(player, e) < 380 * 380);
      for (let i = 0; i < 1 + stats.lightning && near.length; i++) {
        const e = near.splice(Math.floor(state.rng() * near.length), 1)[0];
        damageEnemy(state, e, stats.damage * 2);
        state.fx.push({ kind: "bolt", x: player.x, y: player.y, x2: e.x, y2: e.y, ttl: 0.18, max: 0.18 });
      }
    }
  }

  /* Missiles chercheurs */
  if (stats.missiles > 0) {
    player.pm -= dt;
    if (player.pm <= 0) {
      player.pm = Math.max(1.2, 3.2 - stats.missiles * 0.4);
      const targets = state.enemies.filter((e) => !e.dead && dist2(player, e) < 460 * 460);
      for (let i = 0; i < 1 + stats.missiles && targets.length; i++) {
        const e = targets.splice(Math.floor(state.rng() * targets.length), 1)[0];
        const a = state.rng() * Math.PI * 2;
        state.missiles.push({ x: player.x, y: player.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, target: e.id, life: 3, trail: [] });
      }
    }
  }
  for (const m of state.missiles) {
    m.life -= dt;
    let target = state.enemies.find((e) => e.id === m.target && !e.dead);
    if (!target) { target = nearest(state, m, 300); if (target) m.target = target.id; }
    if (target) {
      const a = Math.atan2(target.y - m.y, target.x - m.x);
      const cur = Math.atan2(m.vy, m.vx);
      let diff = a - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = cur + Math.max(-6 * dt, Math.min(6 * dt, diff));
      m.vx = Math.cos(turn) * 300;
      m.vy = Math.sin(turn) * 300;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 8) m.trail.shift();
    const hitEnemy = state.enemies.find((e) => !e.dead && dist2(m, e) <= (ENEMY_DEFS[e.type].r + 5) ** 2);
    if (hitEnemy || m.life <= 0) {
      m.life = 0;
      const radius = 46 + stats.missiles * 4;
      for (const e of state.enemies) {
        if (!e.dead && dist2(m, e) <= (radius + ENEMY_DEFS[e.type].r) ** 2) damageEnemy(state, e, stats.damage * (1.8 + stats.missiles * 0.3));
      }
      state.fx.push({ kind: "blast", x: m.x, y: m.y, r: radius, ttl: 0.3, max: 0.3, color: "#ff8a3d" });
    }
  }
  state.missiles = state.missiles.filter((m) => m.life > 0);

  /* Pluie de météores : un cercle d'alerte, puis l'impact */
  if (stats.meteor > 0) {
    player.pt -= dt;
    if (player.pt <= 0) {
      player.pt = Math.max(1.8, 5.2 - stats.meteor * 0.6);
      const near = state.enemies.filter((e) => !e.dead && dist2(player, e) < 440 * 440);
      for (let i = 0; i < 1 + stats.meteor && near.length; i++) {
        const e = near.splice(Math.floor(state.rng() * near.length), 1)[0];
        state.zones.push({ kind: "meteor", x: e.x, y: e.y, delay: 0.9, max: 0.9, r: 56 + stats.meteor * 5 });
      }
    }
  }

  /* Traînée de feu */
  if (stats.fire > 0 && (dx || dy)) {
    player.pf -= dt;
    if (player.pf <= 0 && state.zones.length < 90) {
      player.pf = 0.22;
      state.zones.push({ kind: "fire", x: player.x, y: player.y, ttl: 2 + stats.fire * 0.4, max: 2 + stats.fire * 0.4, r: 17 + stats.fire * 2 });
    }
  }

  /* Rayon rotatif */
  if (stats.beam > 0) {
    player.beam += dt * (1.4 + stats.beam * 0.2);
    const beams = 1 + Math.floor(stats.beam / 2);
    const length = 140 + stats.beam * 26;
    for (let b = 0; b < beams; b++) {
      const a = player.beam + (b * Math.PI * 2) / beams;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (const e of state.enemies) {
        if (e.dead || (e.beamCd || 0) > 0) continue;
        const px = e.x - player.x;
        const py = e.y - player.y;
        const along = px * ux + py * uy;
        const across = Math.abs(px * uy - py * ux);
        if (along > 0 && along < length && across <= ENEMY_DEFS[e.type].r + 5) {
          damageEnemy(state, e, stats.damage * 0.9);
          e.beamCd = 0.25;
        }
      }
    }
  }

  /* Singularité : trou noir qui aspire */
  if (stats.hole > 0) {
    player.ph -= dt;
    if (player.ph <= 0) {
      player.ph = Math.max(7, 15 - stats.hole * 2.5);
      const near = state.enemies.filter((e) => !e.dead && dist2(player, e) < 400 * 400);
      if (near.length) {
        const e = near[Math.floor(state.rng() * near.length)];
        const ttl = 3 + stats.hole;
        state.zones.push({ kind: "hole", x: e.x, y: e.y, ttl, max: ttl, r: 80 + stats.hole * 12 });
      }
    }
  }

  /* Effets au sol : mise à jour (météores, flammes, trous noirs) */
  for (const z of state.zones) {
    if (z.kind === "meteor") {
      z.delay -= dt;
      if (z.delay <= 0) {
        z.done = true;
        for (const e of state.enemies) {
          if (!e.dead && dist2(z, e) <= (z.r + ENEMY_DEFS[e.type].r) ** 2) damageEnemy(state, e, stats.damage * (3.5 + stats.meteor * 0.7));
        }
        state.fx.push({ kind: "blast", x: z.x, y: z.y, r: z.r, ttl: 0.4, max: 0.4, color: "#fcee0a" });
      }
    } else if (z.kind === "fire") {
      z.ttl -= dt;
      for (const e of state.enemies) {
        if (!e.dead && dist2(z, e) <= (z.r + ENEMY_DEFS[e.type].r) ** 2) damageEnemy(state, e, stats.damage * (0.9 + stats.fire * 0.25) * dt);
      }
    } else if (z.kind === "hole") {
      z.ttl -= dt;
      const pullR = z.r * 1.7;
      for (const e of state.enemies) {
        if (e.dead) continue;
        const d = Math.sqrt(dist2(z, e)) || 1;
        if (d < pullR) {
          const boss = e.type === "boss" || e.type === "overlord";
          const v = (boss ? 25 : 95) * dt;
          e.x += ((z.x - e.x) / d) * Math.min(v, d);
          e.y += ((z.y - e.y) / d) * Math.min(v, d);
        }
        if (d < z.r) damageEnemy(state, e, stats.damage * (1.2 + stats.hole * 0.3) * dt);
      }
    }
  }
  state.zones = state.zones.filter((z) => !z.done && (z.kind === "meteor" || z.ttl > 0));
  for (const e of state.enemies) if (e.beamCd > 0) e.beamCd -= dt;

  /* Ennemis : poursuite et contact */
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.hitCd = Math.max(0, e.hitCd - dt);
    const def = ENEMY_DEFS[e.type];
    if (e.type === "overlord") {
      e.summon = (e.summon ?? 4) - dt;
      if (e.summon <= 0) {
        e.summon = 5;
        for (let i = 0; i < 3 && state.enemies.length < MAX_ENEMIES; i++) {
          const g = ENEMY_DEFS.grunt;
          const hp = g.hp * hpScale(state.time);
          state.enemies.push({ id: state.nextId++, type: "grunt", x: e.x + (i - 1) * 18, y: e.y + 14, hp, maxHp: hp, hitCd: 0, fresh: true });
        }
      }
    }
    const d = Math.sqrt(dist2(player, e)) || 1;
    e.x += ((player.x - e.x) / d) * def.speed * dt;
    e.y += ((player.y - e.y) / d) * def.speed * dt;
    if (d < def.r + PLAYER_R && player.inv <= 0) {
      player.hp -= def.dmg * (1 - Math.min(0.6, stats.armor));
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
    if (d < PLAYER_R + 5) { state.xp += g.xp * (1 + stats.xpGain); g.taken = true; }
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
