// js/hub.js — logique pure du Hub du Donjon (aucun accès au DOM, testable sous Node).
// Une grande carte en défilement : le royaume médiéval de Valoria (ouest) et la cité cyberpunk de
// Néo-Aska (est), séparés par un fleuve et reliés par la Place des Deux Royaumes. Au sud, le portail
// du donjon. Des PNJ y donnent des quêtes, payées en pièces bleues.

export const TILE = 32;
export const COLS = 96;
export const ROWS = 60;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;
export const PLAYER_R = 8;
export const SPEED = 118;
export const MID = 48;                 // frontière entre les deux royaumes (colonne)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const tileHash = (tx, ty) => { const n = Math.sin(tx * 127.1 + ty * 311.7) * 43758.5453; return n - Math.floor(n); };

/* ---------- Quêtes ---------- */

// type : kills · rooms · floor (étage atteint) · boss · coins (pièces d'or ramassées) · elite · runs
export const QUEST_TYPES = {
  kills: "ennemis éliminés", rooms: "salles nettoyées", floor: "étage atteint", boss: "boss vaincus",
  coins: "pièces d'or ramassées", elite: "élites éliminés", runs: "expéditions"
};

export const QUESTS = [
  { id: "ald1", npc: "aldric", name: "Premiers pas",       type: "kills", target: 40,   reward: 1, desc: "Élimine 40 ennemis dans le donjon." },
  { id: "ald2", npc: "aldric", name: "Chasseur de monstres", type: "kills", target: 150,  reward: 2, desc: "Élimine 150 ennemis au total.", requires: "ald1" },
  { id: "ald3", npc: "aldric", name: "Fléau du donjon",    type: "kills", target: 400,  reward: 4, desc: "Élimine 400 ennemis au total.", requires: "ald2" },
  { id: "elw1", npc: "elwen",  name: "Nettoyage de printemps", type: "rooms", target: 12, reward: 1, desc: "Nettoie 12 salles du donjon." },
  { id: "elw2", npc: "elwen",  name: "Plus profond",       type: "floor", target: 4,    reward: 2, desc: "Atteins l'étage 4.", requires: "elw1" },
  { id: "elw3", npc: "elwen",  name: "Au cœur des ténèbres", type: "floor", target: 7,  reward: 4, desc: "Atteins l'étage 7.", requires: "elw2" },
  { id: "bra1", npc: "brann",  name: "Cible de choix",     type: "boss",  target: 1,    reward: 2, desc: "Vaincs un boss.", },
  { id: "bra2", npc: "brann",  name: "Tueur de géants",    type: "boss",  target: 4,    reward: 3, desc: "Vaincs 4 boss au total.", requires: "bra1" },
  { id: "bra3", npc: "brann",  name: "Légende vivante",    type: "boss",  target: 10,   reward: 5, desc: "Vaincs 10 boss au total.", requires: "bra2" },
  { id: "vex1", npc: "vex",    name: "Petit butin",        type: "coins", target: 150,  reward: 1, desc: "Ramasse 150 pièces d'or dans le donjon." },
  { id: "vex2", npc: "vex",    name: "Gros contrat",       type: "coins", target: 600,  reward: 2, desc: "Ramasse 600 pièces d'or au total.", requires: "vex1" },
  { id: "vex3", npc: "vex",    name: "Fortune express",    type: "coins", target: 1800, reward: 4, desc: "Ramasse 1 800 pièces d'or au total.", requires: "vex2" },
  { id: "nyx1", npc: "nyx",    name: "Échantillons",       type: "elite", target: 6,    reward: 1, desc: "Élimine 6 élites (anneau doré)." },
  { id: "nyx2", npc: "nyx",    name: "Greffes rares",      type: "elite", target: 20,   reward: 3, desc: "Élimine 20 élites au total.", requires: "nyx1" },
  { id: "nyx3", npc: "nyx",    name: "Cobaye parfait",     type: "elite", target: 50,   reward: 5, desc: "Élimine 50 élites au total.", requires: "nyx2" },
  { id: "rob1", npc: "r0b",    name: "Mise en service",    type: "runs",  target: 3,    reward: 1, desc: "Fais 3 expéditions dans le donjon." },
  { id: "rob2", npc: "r0b",    name: "Habitué",            type: "runs",  target: 12,   reward: 3, desc: "Fais 12 expéditions au total.", requires: "rob1" },
  { id: "rob3", npc: "r0b",    name: "Mercenaire certifié", type: "runs", target: 30,   reward: 5, desc: "Fais 30 expéditions au total.", requires: "rob2" }
];
export const QUEST_IDS = QUESTS.map((q) => q.id);
export const questById = (id) => QUESTS.find((q) => q.id === id);
export const questsOf = (npcId) => QUESTS.filter((q) => q.npc === npcId);

// Met à jour les quêtes acceptées avec le résumé d'une expédition (muté en place).
// quests : { [id]: { p, claimed } } ; sum : { kills, bossKills, rooms, gold, elite, floor }.
export function applyRunToQuests(quests, sum) {
  for (const [id, q] of Object.entries(quests)) {
    const def = questById(id);
    if (!def || q.claimed) continue;
    const add = { kills: sum.kills, rooms: sum.rooms, boss: sum.bossKills, coins: sum.gold, elite: sum.elite, runs: 1 }[def.type];
    if (def.type === "floor") q.p = Math.min(def.target, Math.max(q.p, sum.floor || 0));
    else q.p = Math.min(def.target, q.p + Math.max(0, Math.floor(add || 0)));
  }
}

/* ---------- PNJ ---------- */

// look : couleurs et accessoire dessinés par ui-hub.js. kingdom : med | cyb | none.
export const NPCS = [
  { id: "guide", name: "Mira", title: "Gardienne du portail", kingdom: "none", tx: 46.2, ty: 51.5, look: { skin: "#e9c7a4", body: "#9a7bff", hat: "hood", accent: "#00f0ff" },
    lines: ["Le portail mène au donjon : cave, crypte, forge, glacier, puis le Néant.", "Parle aux habitants des deux royaumes : leurs quêtes paient en pièces bleues.", "Plus tu descends, plus c'est dangereux. Une expédition réussie se prépare ici."] },
  { id: "aldric", name: "Sire Aldric", title: "Capitaine de la garde de Valoria", kingdom: "med", tx: 21.5, ty: 14.5, look: { skin: "#d9a98a", body: "#5f7fa8", hat: "helm", accent: "#fcee0a" },
    lines: ["Halte ! … Ah, un aventurier. Bienvenue à Valoria.", "Les monstres du donjon menacent nos routes. Chaque tête compte.", "Reviens quand tu auras fait tes preuves."] },
  { id: "elwen", name: "Elwen", title: "Aubergiste du Dragon Repu", kingdom: "med", tx: 9.5, ty: 26.5, look: { skin: "#f0cfae", body: "#b0583d", hat: "cap", accent: "#ffd8a8" },
    lines: ["Une chope ? Non ? Dommage. Alors, des nouvelles du donjon ?", "Les salles se vident, mais les cadavres, eux, restent… Je paie ceux qui nettoient.", "Les étages profonds ne pardonnent pas. Mange avant de descendre."] },
  { id: "brann", name: "Brann", title: "Forgeron nain", kingdom: "med", tx: 31, ty: 25.5, look: { skin: "#c98f6b", body: "#6b4a2b", hat: "beard", accent: "#ff8a3d" },
    lines: ["Du fer, du feu, du talent ! Et des boss à terrasser, si tu veux mon avis.", "Chaque boss que tu abats me donne une idée de lame.", "Ah, j'entends le donjon gronder… c'est bon signe."] },
  { id: "vex", name: "Vex", title: "Fixer du Néon Bleu", kingdom: "cyb", tx: 64.5, ty: 26.5, look: { skin: "#d9b49a", body: "#1b1b2f", hat: "mohawk", accent: "#ff2a6d" },
    lines: ["Chummer. Les crédits circulent, les pièces d'or aussi — dans le donjon surtout.", "J'achète du butin, pas des histoires. Rapporte-moi de l'or.", "Pas de rebut, pas de remords. Les affaires sont les affaires."] },
  { id: "nyx", name: "Dr. Nyx", title: "Ripperdoc de Néo-Aska", kingdom: "cyb", tx: 80.5, ty: 26.5, look: { skin: "#cfe3d6", body: "#2a4a44", hat: "visor", accent: "#3ddc84" },
    lines: ["Tes implants sont… corrects. Mais je préfère les échantillons d'élites.", "Les ennemis à anneau doré ont des organes très intéressants.", "Ne bouge pas, je prends tes constantes. … Excellent."] },
  { id: "r0b", name: "R0-B", title: "Droïde marchand", kingdom: "cyb", tx: 68.5, ty: 37.5, look: { skin: "#9aa4c7", body: "#4b5576", hat: "antenna", accent: "#00f0ff" },
    lines: ["BIP. Statistiques d'expéditions : insuffisantes. Veuillez augmenter.", "Mon algorithme prédit que tu reviendras. Probabilité : 94 %.", "Chaque expédition enregistrée augmente ma satisfaction. BIP."] }
];
export const npcById = (id) => NPCS.find((n) => n.id === id);

export const PORTAL = { tx: 48, ty: 55, x: 48 * TILE + TILE / 2, y: 55 * TILE };
export const SPAWN = { x: 48 * TILE + TILE / 2, y: 31 * TILE };

/* ---------- Sol ---------- */

const inR = (v, a, b) => v >= a && v <= b;

// Type de terrain d'une case : grass, forest, path, cobble, avenue, sand, water, asphalt, neon, metal
export function groundAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return "void";
  const med = tx < MID;
  // fleuve entre les royaumes (se jette dans la place)
  if (inR(tx, 46, 49) && ty < 24) return (tx === 46 || tx === 49) ? "shore" : "water";
  if (inR(tx, 45, 50) && inR(ty, 24, 25) && !(tx === 47 || tx === 48)) return "shore";
  // place des Deux Royaumes
  if (inR(tx, 43, 53) && inR(ty, 24, 34)) return med ? "cobble" : "neon";
  // avenue du portail
  if (inR(tx, 47, 49) && inR(ty, 35, 57)) return "avenue";
  if (inR(tx, 45, 51) && inR(ty, 52, 58)) return "avenue";
  if (med) {
    if (((tx - 10) / 8) ** 2 + ((ty - 46) / 5) ** 2 < 1) return "water";
    if (((tx - 10) / 9.4) ** 2 + ((ty - 46) / 6.2) ** 2 < 1) return "sand";
    if ((tx - 21) ** 2 + (ty - 29) ** 2 < 36) return "cobble";
    if (inR(ty, 28, 30) && tx >= 2) return "path";
    if (inR(tx, 20, 22) && inR(ty, 12, 48)) return "path";
    if (inR(tx, 34, 36) && inR(ty, 18, 30)) return "path";
    if (inR(tx, 8, 10) && inR(ty, 26, 30)) return "path";
    if (inR(tx, 30, 32) && inR(ty, 25, 30)) return "path";
    return "grass";
  }
  if ((tx - 71) ** 2 + (ty - 29) ** 2 < 36) return "neon";
  if (inR(ty, 28, 30)) return "metal";
  if (inR(tx, 70, 72) && inR(ty, 8, 52)) return "metal";
  if (inR(tx, 84, 86) && inR(ty, 30, 50)) return "metal";
  if (inR(tx, 63, 65) && inR(ty, 26, 30)) return "metal";
  if (inR(tx, 80, 82) && inR(ty, 26, 30)) return "metal";
  if (inR(tx, 67, 69) && inR(ty, 30, 37)) return "metal";
  return "asphalt";
}
export const isWaterTile = (tx, ty) => groundAt(tx, ty) === "water";

/* ---------- Décors, bâtiments, arbres ---------- */

// Bâtiments : footprint en cases (tx, ty = coin haut-gauche, tw × th). `roof` : débord visuel au-dessus.
export const BUILDINGS = [
  { kind: "castle",  tx: 14, ty: 4,  tw: 14, th: 8, roof: 60 },
  { kind: "tavern",  tx: 5,  ty: 21, tw: 7,  th: 4, roof: 44 },
  { kind: "forge",   tx: 28, ty: 20, tw: 6,  th: 4, roof: 40 },
  { kind: "house",   tx: 4,  ty: 33, tw: 4,  th: 3, roof: 30, v: 0 },
  { kind: "house",   tx: 10, ty: 33, tw: 4,  th: 3, roof: 30, v: 1 },
  { kind: "house",   tx: 28, ty: 33, tw: 5,  th: 3, roof: 32, v: 2 },
  { kind: "house",   tx: 36, ty: 33, tw: 4,  th: 3, roof: 30, v: 1 },
  { kind: "house",   tx: 4,  ty: 9,  tw: 4,  th: 3, roof: 30, v: 2 },
  { kind: "barn",    tx: 36, ty: 8,  tw: 6,  th: 4, roof: 44 },
  { kind: "stall",   tx: 24, ty: 26, tw: 2,  th: 1, roof: 24, v: 0 },
  { kind: "stall",   tx: 16, ty: 26, tw: 2,  th: 1, roof: 24, v: 1 },
  { kind: "tower",   tx: 56, ty: 3,  tw: 8,  th: 6, roof: 150, v: 0 },
  { kind: "tower",   tx: 76, ty: 2,  tw: 9,  th: 6, roof: 170, v: 1 },
  { kind: "tower",   tx: 58, ty: 40, tw: 8,  th: 6, roof: 140, v: 2 },
  { kind: "tower",   tx: 86, ty: 38, tw: 7,  th: 7, roof: 150, v: 0 },
  { kind: "club",    tx: 60, ty: 21, tw: 8,  th: 4, roof: 50 },
  { kind: "clinic",  tx: 77, ty: 21, tw: 7,  th: 4, roof: 50 },
  { kind: "kiosk",   tx: 66, ty: 34, tw: 5,  th: 2, roof: 36 },
  { kind: "kiosk",   tx: 76, ty: 33, tw: 4,  th: 2, roof: 36, v: 1 },
  { kind: "gate",    tx: 43, ty: 26, tw: 1,  th: 6, roof: 40, v: 0 },    // porte de Valoria
  { kind: "gate",    tx: 53, ty: 26, tw: 1,  th: 6, roof: 40, v: 1 }     // porte de Néo-Aska
];

// Éléments solides d'une case (1×1) : fontaine, pylônes, caisses, statue, portail…
export const PROPS = [
  { kind: "well",    tx: 21, ty: 29 },
  { kind: "monument", tx: 71, ty: 29 },
  { kind: "statue",  tx: 48, ty: 29 },
  { kind: "portal",  tx: 48, ty: 55 },
  { kind: "crate",   tx: 26, ty: 25 }, { kind: "barrel", tx: 12, ty: 25 }, { kind: "barrel", tx: 13, ty: 25 },
  { kind: "anvil",   tx: 30, ty: 24 },
  { kind: "pylon",   tx: 62, ty: 32 }, { kind: "pylon", tx: 74, ty: 32 }, { kind: "pylon", tx: 56, ty: 30 }, { kind: "pylon", tx: 88, ty: 30 },
  { kind: "billboard", tx: 53, ty: 37 }, { kind: "billboard", tx: 83, ty: 18 }, { kind: "billboard", tx: 69, ty: 14 }, { kind: "billboard", tx: 90, ty: 50 },
  { kind: "vent",    tx: 78, ty: 36 }, { kind: "vent", tx: 62, ty: 47 }, { kind: "vent", tx: 80, ty: 46 }
];

// Éléments non solides (éclairage, détails) : lanternes, lampadaires, fleurs, flaques.
export const DECOR = [];
const decorRng = mulberry(7);
for (const [tx, ty] of [[19, 27], [23, 31], [19, 31], [23, 27], [8, 27], [12, 27], [30, 26], [35, 27], [35, 20], [21, 14], [21, 22], [21, 36], [21, 44]]) DECOR.push({ kind: "lantern", x: tx * TILE + 16, y: ty * TILE + 28 });
for (const [tx, ty] of [[56, 27], [62, 31], [68, 27], [74, 31], [80, 27], [86, 31], [71, 18], [71, 40], [85, 40], [49, 40], [47, 46], [47, 50], [49, 50]]) DECOR.push({ kind: "streetlight", x: tx * TILE + 16, y: ty * TILE + 28 });
for (const [tx, ty] of [[44, 23], [52, 23], [44, 35], [52, 35], [46, 56], [50, 56]]) DECOR.push({ kind: tx < MID ? "lantern" : "streetlight", x: tx * TILE + 16, y: ty * TILE + 28 });
for (let i = 0; i < 70; i++) {
  const tx = 1 + Math.floor(decorRng() * 94), ty = 1 + Math.floor(decorRng() * 58);
  const g = groundAt(tx, ty);
  if (g === "grass") DECOR.push({ kind: "flowers", x: tx * TILE + 6 + decorRng() * 20, y: ty * TILE + 6 + decorRng() * 20, c: Math.floor(decorRng() * 4) });
  else if (g === "asphalt" || g === "metal") DECOR.push({ kind: "puddle", x: tx * TILE + 16, y: ty * TILE + 18, c: Math.floor(decorRng() * 3) });
}

/* ---------- Carte des obstacles ---------- */

export const TREES = [];
export const blocked = Array.from({ length: ROWS }, () => new Uint8Array(COLS));

function block(tx, ty, tw = 1, th = 1) {
  for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) if (blocked[y]?.[x] !== undefined) blocked[y][x] = 1;
}
for (const b of BUILDINGS) block(b.tx, b.ty, b.tw, b.th);
for (const p of PROPS) block(p.tx, p.ty);
for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
  const g = groundAt(tx, ty);
  if (g === "water") blocked[ty][tx] = 1;
}

// Bordure du monde et forêts / décors denses, semés de façon déterministe hors des chemins.
{
  const rng = mulberry(2024);
  const free = (tx, ty) => {
    const g = groundAt(tx, ty);
    if (blocked[ty]?.[tx] || !["grass", "asphalt"].includes(g)) return false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (BUILDINGS.some((b) => tx + dx >= b.tx - 1 && tx + dx < b.tx + b.tw + 1 && ty + dy >= b.ty - 1 && ty + dy < b.ty + b.th + 1)) return false;
    }
    for (const n of NPCS) if (Math.abs(n.tx - tx - 0.5) < 3 && Math.abs(n.ty - ty - 0.5) < 3) return false;
    return true;
  };
  const sea = (tx, ty) => groundAt(tx, ty) === "sand";
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    if (!free(tx, ty)) continue;
    const edge = tx < 2 || ty < 2 || tx > COLS - 3 || ty > ROWS - 3;
    const med = tx < MID;
    const clump = (Math.sin(tx * 0.35) + Math.cos(ty * 0.3) + Math.sin((tx + ty) * 0.17)) / 3;   // bosquets
    const p = edge ? 0.85 : med ? (clump > 0.35 ? 0.34 : 0.035) : (clump > 0.45 ? 0.12 : 0.012);
    if (sea(tx, ty) || rng() > p) continue;
    TREES.push({ kind: med ? (rng() < 0.45 ? "pine" : "oak") : (rng() < 0.5 ? "dead" : "holotree"), tx, ty, x: tx * TILE + 16, y: ty * TILE + 28, v: Math.floor(rng() * 3) });
    blocked[ty][tx] = 1;
  }
}

export function tileBlocked(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return blocked[ty][tx] === 1;
}

// Un cercle (x, y, r) touche-t-il un obstacle ?
export function collides(x, y, r = PLAYER_R) {
  if (x - r < 0 || y - r < 0 || x + r > WORLD_W || y + r > WORLD_H) return true;
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!tileBlocked(tx, ty)) continue;
    const cx = clamp(x, tx * TILE, tx * TILE + TILE), cy = clamp(y, ty * TILE, ty * TILE + TILE);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
  }
  return false;
}

/* ---------- État ---------- */

export const DAY_LENGTH = 240;      // secondes pour un cycle jour/nuit

export function createHub(rng = Math.random) {
  return {
    player: { x: SPAWN.x, y: SPAWN.y, facing: 1, moving: false, t: 0 },
    npcs: NPCS.map((n) => ({ id: n.id, x: n.tx * TILE, y: n.ty * TILE, hx: n.tx * TILE, hy: n.ty * TILE, dir: 1, t: rng() * 10, wait: 1 + rng() * 3, tx: n.tx * TILE, ty: n.ty * TILE })),
    time: DAY_LENGTH * 0.2,          // départ : début de matinée
    near: null,                       // { kind: "npc" | "portal", id }
    rng
  };
}

// Luminosité ambiante : 1 plein jour, 0 pleine nuit.
export function daylight(time) {
  const phase = (time % DAY_LENGTH) / DAY_LENGTH;           // 0 = aube
  return clamp(0.5 + 0.62 * Math.sin(phase * Math.PI * 2 - 0.4), 0.08, 1);
}

export const INTERACT_R = 46;

export function updateHub(hub, dt, { dx = 0, dy = 0 } = {}) {
  const p = hub.player;
  hub.time += dt;
  p.t += dt;
  const len = Math.hypot(dx, dy);
  p.moving = len > 0.05;
  if (p.moving) {
    const k = Math.min(1, len) / len, vx = dx * k * SPEED, vy = dy * k * SPEED;
    if (Math.abs(dx) > 0.1) p.facing = dx > 0 ? 1 : -1;
    if (!collides(p.x + vx * dt, p.y, PLAYER_R)) p.x += vx * dt;
    if (!collides(p.x, p.y + vy * dt, PLAYER_R)) p.y += vy * dt;
  }
  // PNJ : petites déambulations autour de leur poste, arrêt si le joueur est proche
  for (const n of hub.npcs) {
    n.t += dt;
    const close = dist2(n, p) < (INTERACT_R + 20) ** 2;
    if (close) { n.dir = p.x >= n.x ? 1 : -1; n.moving = false; continue; }
    n.wait -= dt;
    if (n.wait <= 0) {
      const a = hub.rng() * Math.PI * 2, d = 10 + hub.rng() * 34;
      const tx = n.hx + Math.cos(a) * d, ty = n.hy + Math.sin(a) * d * 0.5;
      if (!collides(tx, ty, 7)) { n.tx = tx; n.ty = ty; }
      n.wait = 2 + hub.rng() * 4;
    }
    const ddx = n.tx - n.x, ddy = n.ty - n.y, dd = Math.hypot(ddx, ddy);
    n.moving = dd > 1.5;
    if (n.moving) {
      const s = Math.min(dd, 26 * dt);
      const nx = n.x + (ddx / dd) * s, ny = n.y + (ddy / dd) * s;
      if (!collides(nx, ny, 7)) { n.x = nx; n.y = ny; } else { n.tx = n.x; n.ty = n.y; }
      if (Math.abs(ddx) > 1) n.dir = ddx > 0 ? 1 : -1;
    }
  }
  // Interaction la plus proche
  let near = null, best = INTERACT_R * INTERACT_R;
  for (const n of hub.npcs) { const d = dist2(n, p); if (d < best) { best = d; near = { kind: "npc", id: n.id }; } }
  if (dist2(PORTAL, p) < (INTERACT_R + 24) ** 2 && dist2(PORTAL, p) < best) near = { kind: "portal", id: "portal" };
  hub.near = near;
}

/* ---------- Quêtes : état d'affichage ---------- */

// Renvoie pour une quête son état : locked | available | active | ready | claimed
export function questState(quests, def) {
  const q = quests[def.id];
  if (q?.claimed) return "claimed";
  if (def.requires && !quests[def.requires]?.claimed) return "locked";
  if (!q) return "available";
  return q.p >= def.target ? "ready" : "active";
}

// Le PNJ a-t-il quelque chose à proposer ou à récompenser ? ("!" = nouvelle quête, "?" = à rendre)
export function npcMarker(quests, npcId) {
  let marker = null;
  for (const def of questsOf(npcId)) {
    const st = questState(quests, def);
    if (st === "ready") return "?";
    if (st === "available" && !marker) marker = "!";
  }
  return marker;
}
