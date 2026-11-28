// js/survivors.js — logique pure de « Survivor Arena » (aucun accès au DOM, testable sous Node).
//
// Refonte « v2 » : une grande carte qui défile (caméra centrée sur le joueur), 19 armes à 8 niveaux
// qui évoluent avec le bon module passif, 16 modules passifs, plus de 20 ennemis aux comportements
// différents, des élites à affixes, 9 boss à patterns (dont le Blackwall à 20:00), des événements
// (ruées, encerclements, voleur de données), 5 cartes, 6 niveaux de Surtension, des ultimes propres à
// chaque personnage, des coffres, des implants permanents payés en noyaux et un codex des ennemis.
//
// Le personnage tire tout seul : le joueur se déplace, choisit ses améliorations et déclenche son ultime.

export const W = 720;                 // taille de la vue par défaut (la vue s'adapte à l'écran)
export const H = 480;
export const PLAYER_R = 10;
export const MAX_ENEMIES = 340;
export const BOSS_EVERY = 120;        // secondes entre deux boss
export const BLACKWALL_AT = 1200;     // le boss final arrive à 20:00
export const SECONDS_PER_COIN = 120;  // une pièce bleue toutes les 2 minutes survécues
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;
export const ULT_COST = 140;          // éliminations pour charger l'ultime

const TAU = Math.PI * 2;
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* =====================================================================
   Raretés (proposées à la montée de niveau : plus de niveaux d'un coup)
===================================================================== */

export const RARITIES = {
  common:    { name: "Commun",     color: "#c8c8d8", bonus: 0 },
  rare:      { name: "Rare",       color: "#3d9bff", bonus: 1 },
  epic:      { name: "Épique",     color: "#b06bff", bonus: 2 },
  legendary: { name: "Légendaire", color: "#ffb347", bonus: 3 }
};

/* =====================================================================
   Modules passifs (6 emplacements, niveau 1 à 5)
===================================================================== */

export const PASSIVES = {
  might:    { name: "Surcharge",          glyph: "✶", desc: "+10 % de dégâts",                     max: 5, mod: (s) => { s.might += 0.10; } },
  haste:    { name: "Cadence",            glyph: "⟳", desc: "−8 % de temps de recharge",           max: 5, mod: (s) => { s.haste *= 0.92; } },
  area:     { name: "Amplificateur",      glyph: "◉", desc: "+10 % de zone d'effet",               max: 5, mod: (s) => { s.area += 0.10; } },
  duration: { name: "Persistance",        glyph: "∞", desc: "+12 % de durée des effets",           max: 5, mod: (s) => { s.duration += 0.12; } },
  amount:   { name: "Duplicateur",        glyph: "❐", desc: "+1 projectile pour toutes les armes", max: 2, mod: (s) => { s.amount += 1; } },
  speed:    { name: "Servomoteurs",       glyph: "»", desc: "+10 % de vitesse de déplacement",     max: 5, mod: (s) => { s.speed *= 1.10; } },
  hp:       { name: "Blindage",           glyph: "▣", desc: "+25 PV max",                          max: 5, mod: (s) => { s.maxHp += 25; } },
  regen:    { name: "Nanobots",           glyph: "✚", desc: "+0,6 PV régénérés par seconde",       max: 5, mod: (s) => { s.regen += 0.6; } },
  magnet:   { name: "Aimant",             glyph: "∩", desc: "+35 % de portée de ramassage",        max: 5, mod: (s) => { s.magnet *= 1.35; } },
  crit:     { name: "Viseur",             glyph: "⌖", desc: "+6 % de coups critiques",             max: 5, mod: (s) => { s.crit += 0.06; } },
  armor:    { name: "Plaques d'acier",    glyph: "⛨", desc: "−6 % de dégâts subis",                max: 5, mod: (s) => { s.armor += 0.06; } },
  growth:   { name: "Décodeur",           glyph: "◆", desc: "+12 % d'expérience gagnée",           max: 5, mod: (s) => { s.growth += 0.12; } },
  luck:     { name: "Trèfle quantique",   glyph: "♣", desc: "+12 % de chance (raretés, butin)",    max: 5, mod: (s) => { s.luck += 0.12; } },
  velocity: { name: "Munitions rapides",  glyph: "➶", desc: "+15 % de vitesse des projectiles",    max: 5, mod: (s) => { s.velocity += 0.15; } },
  vampire:  { name: "Vol de vie",         glyph: "♥", desc: "+0,5 PV par ennemi éliminé",          max: 5, mod: (s) => { s.vampire += 0.5; } },
  greed:    { name: "Avidité",            glyph: "¤", desc: "+15 % de noyaux et de crédits",       max: 5, mod: (s) => { s.greed += 0.15; } }
};
export const PASSIVE_IDS = Object.keys(PASSIVES);

/* =====================================================================
   Armes (6 emplacements, niveau 1 à 8, puis évolution par coffre)
   P(l) : paramètres au niveau l. E : paramètres une fois évoluée.
   dmg dégâts · cd recharge (s) · n nombre · r zone · ttl durée · spd vitesse · pierce perforation
===================================================================== */

export const WEAPONS = {
  blaster: {
    name: "Blaster", glyph: "•", color: "#00f0ff", desc: "Tire sur l'ennemi le plus proche.",
    P: (l) => ({ dmg: 15 + 4 * (l - 1), cd: 0.5 * 0.93 ** (l - 1), n: 1 + Math.floor(l / 3), pierce: Math.floor((l - 1) / 3), spd: 400 }),
    evo: { need: "haste", name: "Gatling plasma", desc: "Un flot continu de plasma perforant." },
    E: { dmg: 24, cd: 0.08, n: 1, pierce: 3, spd: 560 }
  },
  orbit: {
    name: "Lames orbitales", glyph: "✧", color: "#fcee0a", desc: "Des lames tournent autour de toi.",
    P: (l) => ({ dmg: 9 + 3 * (l - 1), n: 1 + Math.floor(l / 2), r: 58 + 4 * l, spin: 2.8 + 0.18 * l }),
    evo: { need: "area", name: "Halo d'acier", desc: "Huit grandes lames qui repoussent tout." },
    E: { dmg: 34, n: 8, r: 96, spin: 3.4 }
  },
  nova: {
    name: "Onde de choc", glyph: "◎", color: "#b58cff", desc: "Impulsion périodique qui repousse.",
    P: (l) => ({ dmg: 16 + 7 * (l - 1), cd: 4.4 - 0.32 * (l - 1), r: 72 + 13 * l }),
    evo: { need: "armor", name: "Pulsar", desc: "Des ondes rapprochées qui ralentissent." },
    E: { dmg: 70, cd: 1.1, r: 175 }
  },
  lightning: {
    name: "Foudre", glyph: "ϟ", color: "#b58cff", desc: "Des éclairs frappent des ennemis au hasard.",
    P: (l) => ({ dmg: 22 + 8 * (l - 1), cd: 3.1 - 0.22 * (l - 1), n: 1 + Math.ceil(l / 2), r: 22 + 2 * l }),
    evo: { need: "luck", name: "Tempête ionique", desc: "Un orage permanent sur l'écran." },
    E: { dmg: 80, cd: 0.7, n: 7, r: 60 }
  },
  missiles: {
    name: "Missiles chercheurs", glyph: "➹", color: "#ff8a3d", desc: "Des missiles explosent sur les ennemis.",
    P: (l) => ({ dmg: 18 + 6 * (l - 1), cd: 3.2 - 0.24 * (l - 1), n: 1 + Math.floor(l / 2), r: 42 + 4 * l }),
    evo: { need: "amount", name: "Essaim de missiles", desc: "Des salves de dix missiles." },
    E: { dmg: 60, cd: 1.6, n: 10, r: 70 }
  },
  meteor: {
    name: "Pluie de météores", glyph: "☄", color: "#fcee0a", desc: "Des météores s'abattent sur les ennemis.",
    P: (l) => ({ dmg: 45 + 15 * (l - 1), cd: 5.2 - 0.4 * (l - 1), n: 1 + Math.floor(l / 3), r: 52 + 5 * l }),
    evo: { need: "duration", name: "Apocalypse", desc: "Les impacts laissent un sol en fusion." },
    E: { dmg: 170, cd: 1.6, n: 5, r: 105 }
  },
  fire: {
    name: "Traînée de feu", glyph: "♨", color: "#ff6a2d", desc: "Tu laisses des flammes derrière toi.",
    P: (l) => ({ dmg: 14 + 5 * (l - 1), r: 16 + 2 * l, ttl: 2 + 0.3 * l }),
    evo: { need: "speed", name: "Comète", desc: "Un brasier immense, même à l'arrêt." },
    E: { dmg: 65, r: 36, ttl: 4.5 }
  },
  beam: {
    name: "Rayon rotatif", glyph: "─", color: "#ff2a6d", desc: "Un laser balaie l'arène autour de toi.",
    P: (l) => ({ dmg: 10 + 3 * (l - 1), n: 1 + Math.floor(l / 3), len: 140 + 24 * l, spin: 1.4 + 0.18 * l }),
    evo: { need: "crit", name: "Prisme", desc: "Six rayons arc-en-ciel." },
    E: { dmg: 38, n: 6, len: 380, spin: 2 }
  },
  hole: {
    name: "Singularité", glyph: "●", color: "#b58cff", desc: "Un trou noir aspire et broie les ennemis.",
    P: (l) => ({ dmg: 12 + 4 * (l - 1), cd: 14 - (l - 1), r: 72 + 8 * l, ttl: 3 + 0.4 * l }),
    evo: { need: "magnet", name: "Horizon des événements", desc: "Un trou noir géant qui te suit." },
    E: { dmg: 55, cd: 6, r: 170, ttl: 6 }
  },
  disc: {
    name: "Disque boomerang", glyph: "◐", color: "#3ddc84", desc: "Un disque part et revient en traversant tout.",
    P: (l) => ({ dmg: 16 + 5 * (l - 1), cd: 1.7 - 0.08 * (l - 1), n: 1 + Math.floor(l / 4), r: 10 + l, len: 230 + 12 * l, spd: 330 }),
    evo: { need: "velocity", name: "Chakram fractal", desc: "Quatre chakrams géants et rapides." },
    E: { dmg: 55, cd: 0.9, n: 4, r: 20, len: 360, spd: 480 }
  },
  shotgun: {
    name: "Fusil à pompe", glyph: "⁂", color: "#ffd27a", desc: "Une gerbe de plombs à courte portée.",
    P: (l) => ({ dmg: 7 + 2.5 * (l - 1), cd: 1.4 - 0.07 * (l - 1), n: 5 + l, spd: 540, ttl: 0.34 }),
    evo: { need: "might", name: "Canon à fragmentation", desc: "Chaque plomb explose à l'impact." },
    E: { dmg: 26, cd: 0.7, n: 16, spd: 600, ttl: 0.4 }
  },
  katana: {
    name: "Lame mono-filament", glyph: "†", color: "#ff2a6d", desc: "Tranche devant toi (et derrière dès le niveau 4).",
    P: (l) => ({ dmg: 22 + 8 * (l - 1), cd: 1.25 - 0.06 * (l - 1), r: 72 + 7 * l }),
    evo: { need: "vampire", name: "Murasama", desc: "Tranche à 360° et vole de la vie." },
    E: { dmg: 95, cd: 0.6, r: 150 }
  },
  drone: {
    name: "Drone d'appui", glyph: "⌬", color: "#00f0ff", desc: "Un drone allié tire de son côté.",
    P: (l) => ({ dmg: 10 + 3 * (l - 1), cd: 0.7 - 0.035 * (l - 1), n: 1 + Math.floor(l / 4) }),
    evo: { need: "growth", name: "Escadrille", desc: "Trois drones aux lasers perforants." },
    E: { dmg: 34, cd: 0.32, n: 3 }
  },
  mines: {
    name: "Mines de proximité", glyph: "✹", color: "#ff8a3d", desc: "Pose des mines qui explosent au contact.",
    P: (l) => ({ dmg: 40 + 13 * (l - 1), cd: 2.2 - 0.12 * (l - 1), n: 1 + Math.floor(l / 4), r: 56 + 6 * l }),
    evo: { need: "greed", name: "Nids de mines", desc: "Des grappes de mines énormes." },
    E: { dmg: 150, cd: 0.9, n: 3, r: 110 }
  },
  frost: {
    name: "Champ cryo", glyph: "❄", color: "#9be7ff", desc: "Une aura de froid blesse et ralentit.",
    P: (l) => ({ dmg: 6 + 2.6 * (l - 1), r: 62 + 8 * l, slow: 0.2 + 0.03 * l }),
    evo: { need: "hp", name: "Zéro absolu", desc: "Aura géante qui gèle sur place." },
    E: { dmg: 34, r: 160, slow: 0.55 }
  },
  rail: {
    name: "Railgun", glyph: "⟶", color: "#e0f7ff", desc: "Un tir traversant sur l'ennemi le plus coriace.",
    P: (l) => ({ dmg: 50 + 18 * (l - 1), cd: 2.7 - 0.16 * (l - 1), n: 1 + Math.floor(l / 5), r: 6 + l }),
    evo: { need: "crit", name: "Lance de Gauss", desc: "Quatre tirs dévastateurs." },
    E: { dmg: 190, cd: 1.2, n: 4, r: 16 }
  },
  saw: {
    name: "Scies ricochet", glyph: "✺", color: "#c8c8d8", desc: "Des scies rebondissent sur les bords de l'écran.",
    P: (l) => ({ dmg: 12 + 4 * (l - 1), cd: 4 - 0.2 * (l - 1), n: 1 + Math.floor(l / 3), r: 10 + l, ttl: 3 + 0.3 * l, spd: 300 }),
    evo: { need: "regen", name: "Danse des scies", desc: "Des scies géantes, rapides et durables." },
    E: { dmg: 42, cd: 2.2, n: 5, r: 22, ttl: 7, spd: 420 }
  },
  poison: {
    name: "Fiole toxique", glyph: "⚗", color: "#3ddc84", desc: "Des flaques corrosives sur les ennemis.",
    P: (l) => ({ dmg: 12 + 4 * (l - 1), cd: 3.6 - 0.2 * (l - 1), n: 1 + Math.floor(l / 3), r: 40 + 5 * l, ttl: 2.5 + 0.3 * l }),
    evo: { need: "duration", name: "Marée corrosive", desc: "Des marées acides qui ralentissent." },
    E: { dmg: 48, cd: 1.6, n: 5, r: 92, ttl: 5 }
  },
  chain: {
    name: "Arc Tesla", glyph: "⌁", color: "#7df9ff", desc: "Un arc électrique saute d'ennemi en ennemi.",
    P: (l) => ({ dmg: 15 + 4.5 * (l - 1), cd: 1.9 - 0.1 * (l - 1), n: 3 + l }),
    evo: { need: "haste", name: "Réseau Tesla", desc: "Des arcs incessants qui ne faiblissent pas." },
    E: { dmg: 46, cd: 0.55, n: 14 }
  }
};
export const WEAPON_IDS = Object.keys(WEAPONS);
const W_MAX = 8;
// Armes qui profitent du Duplicateur (+1 projectile)
const USES_AMOUNT = new Set(["blaster", "orbit", "lightning", "missiles", "meteor", "beam", "disc", "shotgun", "drone", "mines", "rail", "saw", "poison", "chain"]);

// Libellés des paramètres (pour décrire la montée de niveau)
export const PARAM_LABELS = { dmg: "Dégâts", cd: "Recharge", n: "Nombre", r: "Zone", pierce: "Perforation", ttl: "Durée", len: "Portée", spin: "Rotation", slow: "Ralentissement", spd: "Vitesse" };

// Différences entre deux niveaux d'une arme : [{ label, from, to }]
export function weaponDelta(id, lvl) {
  const W = WEAPONS[id];
  if (!W) return [];
  const a = lvl > 0 ? W.P(lvl) : null;
  const b = lvl >= W_MAX ? W.E : W.P(lvl + 1);
  const out = [];
  for (const [k, v] of Object.entries(b)) {
    if (k === "spd") continue;
    const before = a ? a[k] : null;
    if (before !== null && Math.abs(before - v) < 1e-6) continue;
    out.push({ label: PARAM_LABELS[k] || k, from: before, to: v, key: k });
  }
  return out;
}

/* =====================================================================
   Personnages : arme de départ, bonus, ultime. Les 5 anciens se débloquent
   avec des crédits ; les nouveaux avec un défi (gratuit une fois réussi).
===================================================================== */

export const ULTS = {
  sprint:    { name: "Sprint néon",       desc: "5 s d'invulnérabilité, vitesse ×1,8 et contact mortel." },
  quake:     { name: "Séisme",            desc: "Une onde énorme qui assomme tout autour de toi." },
  hack:      { name: "Piratage",          desc: "Tous les ennemis à l'écran sont paralysés 3 s et blessés." },
  phase:     { name: "Déphasage",         desc: "5 s invisible et intouchable : les ennemis te perdent." },
  barrage:   { name: "Barrage",           desc: "3 s de tirs dans toutes les directions." },
  iaido:     { name: "Iaido",             desc: "Une coupe fulgurante sur tout l'écran." },
  overclock: { name: "Surcadençage",      desc: "8 s : toutes tes armes rechargent 2,5× plus vite." },
  inferno:   { name: "Inferno",           desc: "Un anneau de feu de 6 s autour de toi." },
  blizzard:  { name: "Blizzard",          desc: "Gèle tous les ennemis à l'écran pendant 4 s." },
  whirl:     { name: "Tourbillon",        desc: "6 disques géants tournent autour de toi 6 s." },
  strike:    { name: "Frappe orbitale",   desc: "14 impacts orbitaux sur l'écran." },
  short:     { name: "Court-circuit",     desc: "Un arc frappe tous les ennemis à l'écran." },
  judgement: { name: "Jugement",          desc: "25 éclairs dévastateurs." },
  plague:    { name: "Peste numérique",   desc: "Empoisonne tous les ennemis à l'écran." },
  sawstorm:  { name: "Tempête de scies",  desc: "10 scies géantes pendant 6 s." },
  orbital:   { name: "Lance céleste",     desc: "Huit rails géants dans toutes les directions." },
  buckshot:  { name: "Chevrotine",        desc: "Cinq décharges à 360° qui repoussent tout." }
};

export const CHARACTERS = [
  { id: "runner", name: "Coureur",     color: "#ffffff", start: ["blaster"], ult: "sprint",   unlock: 0,
    desc: "Équilibré. Le personnage de départ.", mod: () => {} },
  { id: "tank",   name: "Colosse",     color: "#a066ff", start: ["blaster", "nova"], ult: "quake", unlock: 800,
    desc: "+60 PV, 15 % plus lent, commence avec une onde de choc.", mod: (s) => { s.maxHp += 60; s.speed *= 0.85; } },
  { id: "hacker", name: "Hacker",      color: "#3ddc84", start: ["blaster", "orbit:2"], ult: "hack", unlock: 2500,
    desc: "−30 PV, +15 % de critiques, commence avec 2 lames orbitales.", mod: (s) => { s.maxHp -= 30; s.crit += 0.15; } },
  { id: "ghost",  name: "Fantôme",     color: "#c9b8ff", start: ["blaster"], ult: "phase", unlock: 6000,
    desc: "−40 PV, +25 % de vitesse, les projectiles traversent 2 ennemis de plus.", mod: (s) => { s.maxHp -= 40; s.speed *= 1.25; s.pierce += 2; } },
  { id: "gunner", name: "Artilleur",   color: "#ffb000", start: ["blaster:3"], ult: "barrage", unlock: 12000,
    desc: "Blaster niveau 3 et +1 projectile, mais 20 % plus lent à recharger.", mod: (s) => { s.amount += 1; s.haste *= 1.2; } },
  { id: "samurai", name: "Samouraï",   color: "#ff2a6d", start: ["katana"], ult: "iaido",
    challenge: { stat: "kills", need: 2000, text: "Éliminer 2 000 ennemis (au total)" },
    desc: "Lame mono-filament, +10 % de critiques et critiques ×2,5.", mod: (s) => { s.crit += 0.1; s.critMult = 2.5; } },
  { id: "techno", name: "Technomancienne", color: "#00f0ff", start: ["drone"], ult: "overclock",
    challenge: { stat: "maxLevel", need: 25, text: "Atteindre le niveau 25 en une partie" },
    desc: "Drone d'appui, −10 % de recharge.", mod: (s) => { s.haste *= 0.9; } },
  { id: "pyro", name: "Pyromane",      color: "#ff6a2d", start: ["fire", "blaster"], ult: "inferno",
    challenge: { stat: "bestTime", need: 480, text: "Survivre 8 minutes" },
    desc: "Traînée de feu, +15 % de zone, −10 PV.", mod: (s) => { s.area += 0.15; s.maxHp -= 10; } },
  { id: "frost", name: "Givre",        color: "#9be7ff", start: ["frost", "blaster"], ult: "blizzard",
    challenge: { stat: "bosses", need: 3, text: "Vaincre 3 boss (au total)" },
    desc: "Champ cryo, +20 PV, −5 % de dégâts subis.", mod: (s) => { s.maxHp += 20; s.armor += 0.05; } },
  { id: "nomad", name: "Nomade",       color: "#3ddc84", start: ["disc"], ult: "whirl",
    challenge: { stat: "gems", need: 4000, text: "Ramasser 4 000 gemmes (au total)" },
    desc: "Disque boomerang, +15 % de vitesse, +25 % d'aimant.", mod: (s) => { s.speed *= 1.15; s.magnet *= 1.25; } },
  { id: "demo", name: "Démolisseur",   color: "#ff8a3d", start: ["mines", "blaster"], ult: "strike",
    challenge: { stat: "evos", need: 1, text: "Faire évoluer une arme" },
    desc: "Mines de proximité, +40 PV, 10 % plus lent.", mod: (s) => { s.maxHp += 40; s.speed *= 0.9; } },
  { id: "netrunner", name: "Netrunneuse", color: "#7df9ff", start: ["chain"], ult: "short",
    challenge: { map: "datacenter", need: 600, text: "Survivre 10 minutes au Datacenter" },
    desc: "Arc Tesla, +15 % de chance.", mod: (s) => { s.luck += 0.15; } },
  { id: "oracle", name: "Oracle",      color: "#fcee0a", start: ["lightning"], ult: "judgement",
    challenge: { stat: "bestTime", need: 900, text: "Survivre 15 minutes" },
    desc: "Foudre, +15 % d'expérience.", mod: (s) => { s.growth += 0.15; } },
  { id: "chemist", name: "Chimiste",   color: "#7dffb0", start: ["poison", "blaster"], ult: "plague",
    challenge: { stat: "elites", need: 25, text: "Éliminer 25 élites (au total)" },
    desc: "Fiole toxique, +15 % de durée.", mod: (s) => { s.duration += 0.15; } },
  { id: "scrapper", name: "Ferrailleur", color: "#c8c8d8", start: ["saw"], ult: "sawstorm",
    challenge: { stat: "heat", need: 2, text: "Débloquer la Surtension 2" },
    desc: "Scies ricochet, −10 % de dégâts subis.", mod: (s) => { s.armor += 0.1; } },
  { id: "merc", name: "Mercenaire",    color: "#ffd27a", start: ["shotgun"], ult: "buckshot",
    challenge: { stat: "bestRunKills", need: 1500, text: "Éliminer 1 500 ennemis en une partie" },
    desc: "Fusil à pompe, +30 PV, +5 % de dégâts.", mod: (s) => { s.maxHp += 30; s.might += 0.05; } },
  { id: "sniper", name: "Tireuse d'élite", color: "#e0f7ff", start: ["rail"], ult: "orbital",
    challenge: { stat: "blackwall", need: 1, text: "Vaincre le Blackwall" },
    desc: "Railgun, +10 % de critiques, +10 % de vitesse des projectiles.", mod: (s) => { s.crit += 0.1; s.velocity += 0.1; } }
];
export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const FREE_CHARACTER = "runner";
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

/* =====================================================================
   Cartes et Surtension
===================================================================== */

export const MAPS = [
  { id: "alley", name: "Ruelles néon", desc: "Le quartier de départ : quelques poubelles, des caisses à briser.",
    world: { w: 2600, h: 1900 }, hp: 1, spd: 1, density: 1, reward: 1, offset: 0, req: null,
    bg: "#08080f", grid: "rgba(255,42,109,0.06)", accent: "#ff2a6d", obstacles: "bins" },
  { id: "datacenter", name: "Datacenter", desc: "Des rangées de serveurs qui forment des couloirs. ×1,3 récompenses.",
    world: { w: 2400, h: 2400 }, hp: 1.15, spd: 1, density: 1.1, reward: 1.3, offset: 0, req: { map: "alley", time: 600 },
    bg: "#050a10", grid: "rgba(0,240,255,0.07)", accent: "#00f0ff", obstacles: "racks" },
  { id: "toxic", name: "Désert toxique", desc: "Des mares d'acide brûlent les imprudents. ×1,6 récompenses.",
    world: { w: 3000, h: 2200 }, hp: 1.3, spd: 1.05, density: 1.15, reward: 1.6, offset: 60, req: { map: "datacenter", time: 600 },
    bg: "#0b0d05", grid: "rgba(212,255,58,0.06)", accent: "#d4ff3a", obstacles: "dunes", hazards: true },
  { id: "ice", name: "Station gelée", desc: "Le sol glisse : tu as de l'inertie. ×2 récompenses.",
    world: { w: 2600, h: 2600 }, hp: 1.45, spd: 1.05, density: 1.2, reward: 2, offset: 120, req: { map: "toxic", time: 600 },
    bg: "#060b12", grid: "rgba(155,231,255,0.08)", accent: "#9be7ff", obstacles: "ice", inertia: true },
  { id: "core", name: "Le Noyau", desc: "Le cœur du Blackwall : obscurité, ennemis enragés dès le début. ×2,8 récompenses.",
    world: { w: 2800, h: 2800 }, hp: 1.7, spd: 1.12, density: 1.3, reward: 2.8, offset: 240, req: { map: "ice", time: 600 },
    bg: "#07030a", grid: "rgba(180,40,255,0.07)", accent: "#b06bff", obstacles: "core", dark: true }
];
export const MAP_IDS = MAPS.map((m) => m.id);
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

export const HEAT_MAX = 5;
export const heatInfo = (k) => ({
  hp: 1 + 0.25 * k, spd: 1 + 0.05 * k, density: 1 + 0.15 * k, reward: 1 + 0.35 * k,
  text: k ? `Ennemis +${25 * k} % PV, +${5 * k} % vitesse, +${15 * k} % nombre · récompenses ×${(1 + 0.35 * k).toFixed(2).replace(".", ",")}` : "Difficulté normale"
});

/* =====================================================================
   Implants permanents (payés en noyaux, la monnaie propre à Survivor Arena)
===================================================================== */

export const IMPLANTS = [
  { id: "might",    name: "Puissance",      desc: "+5 % de dégâts",                       max: 10, base: 20,   mod: (s, r) => { s.might += 0.05 * r; } },
  { id: "vigor",    name: "Vigueur",        desc: "+10 PV max",                           max: 10, base: 18,   mod: (s, r) => { s.maxHp += 10 * r; } },
  { id: "recovery", name: "Récupération",   desc: "+0,15 PV/s",                           max: 5,  base: 40,   mod: (s, r) => { s.regen += 0.15 * r; } },
  { id: "armor",    name: "Armure",         desc: "−3 % de dégâts subis",                 max: 5,  base: 50,   mod: (s, r) => { s.armor += 0.03 * r; } },
  { id: "speed",    name: "Agilité",        desc: "+4 % de vitesse",                      max: 5,  base: 30,   mod: (s, r) => { s.speed *= 1 + 0.04 * r; } },
  { id: "haste",    name: "Réflexes",       desc: "−3 % de recharge",                     max: 5,  base: 60,   mod: (s, r) => { s.haste *= 0.97 ** r; } },
  { id: "area",     name: "Envergure",      desc: "+5 % de zone",                         max: 5,  base: 50,   mod: (s, r) => { s.area += 0.05 * r; } },
  { id: "duration", name: "Ténacité",       desc: "+6 % de durée",                        max: 5,  base: 40,   mod: (s, r) => { s.duration += 0.06 * r; } },
  { id: "velocity", name: "Balistique",     desc: "+6 % de vitesse des projectiles",      max: 5,  base: 25,   mod: (s, r) => { s.velocity += 0.06 * r; } },
  { id: "magnet",   name: "Attraction",     desc: "+15 % de portée de ramassage",         max: 5,  base: 20,   mod: (s, r) => { s.magnet *= 1 + 0.15 * r; } },
  { id: "growth",   name: "Croissance",     desc: "+5 % d'expérience",                    max: 5,  base: 40,   mod: (s, r) => { s.growth += 0.05 * r; } },
  { id: "luck",     name: "Chance",         desc: "+6 % de chance",                       max: 5,  base: 40,   mod: (s, r) => { s.luck += 0.06 * r; } },
  { id: "greed",    name: "Cupidité",       desc: "+8 % de noyaux et de crédits",         max: 5,  base: 50,   mod: (s, r) => { s.greed += 0.08 * r; } },
  { id: "crit",     name: "Précision",      desc: "+2 % de coups critiques",              max: 5,  base: 45,   mod: (s, r) => { s.crit += 0.02 * r; } },
  { id: "ultcharge",name: "Batterie",       desc: "Ultime chargé 8 % plus vite",          max: 5,  base: 60,   mod: (s, r) => { s.ultCharge += 0.08 * r; } },
  { id: "amount",   name: "Duplication",    desc: "+1 projectile pour toutes les armes",  max: 1,  base: 1500, mod: (s, r) => { s.amount += r; } },
  { id: "revive",   name: "Résurrection",   desc: "+1 vie supplémentaire par partie",     max: 2,  base: 600,  mod: (s, r) => { s.revives += r; } },
  { id: "reroll",   name: "Relance",        desc: "+2 relances par partie",               max: 5,  base: 30,   mod: (s, r) => { s.rerolls += 2 * r; } },
  { id: "skip",     name: "Passer",         desc: "+1 « passer » par partie (+expérience)", max: 5, base: 25,  mod: (s, r) => { s.skips += r; } },
  { id: "banish",   name: "Bannir",         desc: "+1 bannissement par partie",           max: 5,  base: 40,   mod: (s, r) => { s.banishes += r; } },
  { id: "choice",   name: "Quatrième choix", desc: "4 améliorations proposées au lieu de 3", max: 1, base: 900, mod: (s, r) => { s.choices += r; } }
];
export const IMPLANT_IDS = IMPLANTS.map((m) => m.id);
export const implantCost = (id, rank) => {
  const m = IMPLANTS.find((x) => x.id === id);
  return m ? Math.round(m.base * (1 + rank) ** 1.6) : Infinity;
};

/* =====================================================================
   Ennemis
   ai : chase · wave · ranged · dash · kamikaze · support · phase · blink · summon · sniper · layer · orbit · flee
===================================================================== */

export const ENEMY_DEFS = {
  grunt:    { name: "Drone",             hp: 14,  speed: 58,  r: 9,  dmg: 8,  xp: 1,  color: "#ff2a6d", shape: "tri",     ai: "chase",  from: 0,    w: 10, info: "Fonce droit sur toi." },
  swarm:    { name: "Essaim",            hp: 7,   speed: 100, r: 6,  dmg: 5,  xp: 1,  color: "#fcee0a", shape: "dot",     ai: "chase",  from: 40,   w: 6,  info: "Petit, rapide, toujours en groupe." },
  bat:      { name: "Nuée",              hp: 10,  speed: 118, r: 7,  dmg: 6,  xp: 1,  color: "#ff9de2", shape: "wing",    ai: "wave",   from: 75,   w: 5,  info: "Vole en zigzag." },
  stalker:  { name: "Rôdeur",            hp: 30,  speed: 86,  r: 10, dmg: 10, xp: 2,  color: "#ff5e3a", shape: "arrow",   ai: "chase",  from: 110,  w: 5,  info: "Un chasseur rapide et tenace." },
  gunner:   { name: "Tireur",            hp: 28,  speed: 55,  r: 10, dmg: 8,  xp: 3,  color: "#ffb000", shape: "diamond", ai: "ranged", from: 140,  w: 4,  info: "Garde ses distances et tire.",
    range: 250, fire: 2.4, bullet: { spd: 175, dmg: 9, r: 4, color: "#ffb000" } },
  brute:    { name: "Brute",             hp: 80,  speed: 40,  r: 15, dmg: 16, xp: 4,  color: "#a066ff", shape: "square",  ai: "chase",  from: 170,  w: 3,  heavy: 0.5, info: "Lente mais très résistante." },
  charger:  { name: "Chargeur",          hp: 45,  speed: 50,  r: 12, dmg: 14, xp: 3,  color: "#ff3b5c", shape: "wedge",   ai: "dash",   from: 200,  w: 3,  info: "Vise, puis charge en ligne droite." },
  splitter: { name: "Scindeur",          hp: 50,  speed: 45,  r: 13, dmg: 10, xp: 3,  color: "#3ddc84", shape: "blob",    ai: "chase",  from: 240,  w: 3,  split: "shard", info: "Se divise en fragments à sa mort." },
  shard:    { name: "Fragment",          hp: 12,  speed: 92,  r: 6,  dmg: 5,  xp: 1,  color: "#9effc4", shape: "blob",    ai: "chase",  noSpawn: true, info: "Morceau d'un Scindeur." },
  bomber:   { name: "Kamikaze",          hp: 18,  speed: 108, r: 9,  dmg: 0,  xp: 2,  color: "#ff8a3d", shape: "bomb",    ai: "kamikaze", from: 270, w: 3, boom: { r: 62, dmg: 24 }, info: "Explose près de toi. Abattu, il blesse ses voisins." },
  orbiter:  { name: "Satellite",         hp: 28,  speed: 98,  r: 9,  dmg: 9,  xp: 2,  color: "#ff6ad5", shape: "ring",    ai: "orbit",  from: 300,  w: 3,  info: "Tourne autour de toi, puis plonge." },
  medic:    { name: "Médic",             hp: 40,  speed: 48,  r: 11, dmg: 8,  xp: 4,  color: "#7dffb0", shape: "cross",   ai: "support", from: 330, w: 2,  heal: true, info: "Soigne les ennemis proches. Priorité !" },
  ghost:    { name: "Spectre",           hp: 35,  speed: 72,  r: 10, dmg: 10, xp: 3,  color: "#c9b8ff", shape: "ghost",   ai: "phase",  from: 360,  w: 3,  ghost: true, info: "Devient intangible par moments et traverse les murs." },
  blinker:  { name: "Sauteur",           hp: 32,  speed: 60,  r: 10, dmg: 11, xp: 3,  color: "#00f0ff", shape: "star4",   ai: "blink",  from: 400,  w: 3,  info: "Se téléporte à côté de toi." },
  layer:    { name: "Poseur",            hp: 40,  speed: 64,  r: 11, dmg: 8,  xp: 3,  color: "#ffd27a", shape: "square2", ai: "layer",  from: 440,  w: 2,  info: "Tourne autour de toi en semant des mines." },
  leech:    { name: "Sangsue",           hp: 38,  speed: 78,  r: 10, dmg: 7,  xp: 3,  color: "#b30047", shape: "leech",   ai: "chase",  from: 480,  w: 3,  leech: true, info: "Se soigne en te mordant." },
  cryo:     { name: "Cryo",              hp: 34,  speed: 52,  r: 10, dmg: 6,  xp: 3,  color: "#9be7ff", shape: "snow",    ai: "ranged", from: 520,  w: 2,  info: "Ses tirs te ralentissent.",
    range: 230, fire: 2.8, bullet: { spd: 150, dmg: 6, r: 5, color: "#9be7ff", slow: true } },
  bastion:  { name: "Bastion",           hp: 90,  speed: 42,  r: 14, dmg: 12, xp: 5,  color: "#5aa9ff", shape: "hex",     ai: "support", from: 560, w: 1.5, shield: true, heavy: 0.4, info: "Ses alliés proches subissent 40 % de dégâts en moins." },
  sniper:   { name: "Sniper",            hp: 30,  speed: 40,  r: 10, dmg: 0,  xp: 4,  color: "#ff2a2a", shape: "scope",   ai: "sniper", from: 600,  w: 2,  info: "Vise longuement (ligne rouge) puis tire très fort." },
  hive:     { name: "Ruche",             hp: 160, speed: 26,  r: 18, dmg: 14, xp: 8,  color: "#e8c547", shape: "hive",    ai: "summon", from: 650,  w: 1,  heavy: 0.7, spawn: "swarm", info: "Libère des essaims en continu." },
  mutant:   { name: "Virus mutant",      hp: 70,  speed: 74,  r: 12, dmg: 14, xp: 5,  color: "#d4ff3a", shape: "spiky",   ai: "chase",  from: 700,  w: 4,  regen: 0.03, info: "Se régénère rapidement." },
  mech:     { name: "Mécha",             hp: 220, speed: 34,  r: 18, dmg: 20, xp: 10, color: "#8a8fa8", shape: "mech",    ai: "ranged", from: 780,  w: 1.5, heavy: 0.8, info: "Blindé, tire des rafales.",
    range: 280, fire: 3.2, burst: 3, bullet: { spd: 210, dmg: 12, r: 5, color: "#ff8a3d" } },
  golem:    { name: "Golem de données",  hp: 420, speed: 28,  r: 22, dmg: 26, xp: 16, color: "#4b6bff", shape: "golem",   ai: "chase",  from: 900,  w: 1,  heavy: 1, info: "Une montagne de données, insensible au recul." },
  thief:    { name: "Voleur de données", hp: 140, speed: 150, r: 11, dmg: 0,  xp: 20, color: "#ffe066", shape: "thief",   ai: "flee",   noSpawn: true, info: "Fuit avec un butin de noyaux. Attrape-le !" },
  /* Boss */
  virus:     { name: "Virus",              hp: 900,   speed: 46, r: 28, dmg: 24, xp: 50,  color: "#ffffff", shape: "b-virus",  boss: "rings",    info: "Projette des anneaux de projectiles." },
  overlord:  { name: "Overlord",           hp: 1300,  speed: 40, r: 30, dmg: 28, xp: 60,  color: "#ff8a3d", shape: "b-over",   boss: "summon",   info: "Invoque des drones et tire en éventail." },
  juggernaut:{ name: "Juggernaut",         hp: 1800,  speed: 44, r: 32, dmg: 32, xp: 70,  color: "#ff3b5c", shape: "b-jugg",   boss: "charge",   info: "Charges dévastatrices suivies d'une onde." },
  hydra:     { name: "Hydre",              hp: 1400,  speed: 52, r: 30, dmg: 24, xp: 40,  color: "#3ddc84", shape: "b-hydra",  boss: "hydra",    info: "Se divise deux fois quand on la tue." },
  sentinel:  { name: "Sentinelle",         hp: 2200,  speed: 30, r: 30, dmg: 26, xp: 80,  color: "#00f0ff", shape: "b-sent",   boss: "lasers",   info: "Des lasers rotatifs balaient l'arène." },
  queen:     { name: "Reine de l'essaim",  hp: 2400,  speed: 38, r: 32, dmg: 26, xp: 80,  color: "#e8c547", shape: "b-queen",  boss: "queen",    info: "Pond des essaims et crache de l'acide." },
  netghost:  { name: "Netrunner fantôme",  hp: 2000,  speed: 62, r: 24, dmg: 24, xp: 80,  color: "#c9b8ff", shape: "b-net",    boss: "teleport", info: "Se téléporte, crée des leurres, tire des projectiles guidés." },
  titan:     { name: "Titan mécanique",    hp: 3400,  speed: 32, r: 38, dmg: 34, xp: 100, color: "#8a8fa8", shape: "b-titan",  boss: "barrage",  info: "Bombarde des zones autour de toi." },
  blackwall: { name: "Le Blackwall",       hp: 20000, speed: 40, r: 46, dmg: 40, xp: 400, color: "#ff2a2a", shape: "b-black",  boss: "final",    info: "Le boss final, à 20:00. Quatre phases." }
};
export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
const BOSS_ORDER = ["virus", "overlord", "juggernaut", "hydra", "sentinel", "queen", "netghost", "titan"];
const SPAWN_POOL = ENEMY_IDS.filter((id) => !ENEMY_DEFS[id].boss && !ENEMY_DEFS[id].noSpawn);

export const ELITE_AFFIXES = {
  swift:     { name: "Rapide" },
  armored:   { name: "Blindé" },
  vampiric:  { name: "Vampirique" },
  explosive: { name: "Explosif" },
  giant:     { name: "Géant" },
  summoner:  { name: "Invocateur" }
};
const AFFIX_IDS = Object.keys(ELITE_AFFIXES);

export const xpNeeded = (level) => Math.round(4 + level * 4.5 + level * level * 0.35);

/* =====================================================================
   Sauvegarde propre à Survivor Arena (wallet.data.sv)
===================================================================== */

const STAT_KEYS = ["runs", "kills", "time", "bosses", "elites", "gems", "evos", "maxLevel", "bestTime", "bestRunKills", "blackwall"];

export function freshSv() {
  return {
    cores: 0,
    implants: Object.fromEntries(IMPLANT_IDS.map((id) => [id, 0])),
    best: Object.fromEntries(MAP_IDS.map((id) => [id, 0])),
    heat: 0,                       // plus haut niveau de Surtension débloqué
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    codex: {},                     // type d'ennemi → nombre éliminé
    seenW: [],                     // armes déjà obtenues (codex)
    seenE: [],                     // évolutions réalisées (codex)
    last: { char: FREE_CHARACTER, map: "alley", heat: 0 },
    opt: { numbers: true, shake: true }
  };
}

const num = (v, max = 1e15) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

export function sanitizeSv(raw) {
  const sv = freshSv();
  if (!raw || typeof raw !== "object") return sv;
  sv.cores = num(raw.cores);
  for (const m of IMPLANTS) sv.implants[m.id] = Math.min(num(raw.implants?.[m.id]), m.max);
  for (const id of MAP_IDS) sv.best[id] = num(raw.best?.[id], 1e7);
  sv.heat = Math.min(HEAT_MAX, num(raw.heat));
  for (const k of STAT_KEYS) sv.stats[k] = num(raw.stats?.[k]);
  if (raw.codex && typeof raw.codex === "object") for (const id of ENEMY_IDS) if (raw.codex[id]) sv.codex[id] = num(raw.codex[id]);
  if (Array.isArray(raw.seenW)) sv.seenW = raw.seenW.filter((id) => WEAPON_IDS.includes(id));
  if (Array.isArray(raw.seenE)) sv.seenE = raw.seenE.filter((id) => WEAPON_IDS.includes(id));
  if (raw.last && typeof raw.last === "object") {
    if (CHARACTER_IDS.includes(raw.last.char)) sv.last.char = raw.last.char;
    if (MAP_IDS.includes(raw.last.map)) sv.last.map = raw.last.map;
    sv.last.heat = Math.min(sv.heat, num(raw.last.heat));
  }
  if (raw.opt && typeof raw.opt === "object") { sv.opt.numbers = raw.opt.numbers !== false; sv.opt.shake = raw.opt.shake !== false; }
  return sv;
}

export function mapUnlocked(sv, id) {
  const m = mapById(id);
  return !m.req || (sv.best[m.req.map] || 0) >= m.req.time;
}

export function challengeMet(sv, c) {
  const ch = c.challenge;
  if (!ch) return true;
  if (ch.map) return (sv.best[ch.map] || 0) >= ch.need;
  if (ch.stat === "heat") return sv.heat >= ch.need;
  return (sv.stats[ch.stat] || 0) >= ch.need;
}
export function challengeProgress(sv, c) {
  const ch = c.challenge;
  if (!ch) return 1;
  const v = ch.map ? sv.best[ch.map] || 0 : ch.stat === "heat" ? sv.heat : sv.stats[ch.stat] || 0;
  return Math.min(1, v / ch.need);
}

/* =====================================================================
   Statistiques du joueur (recalculées à chaque changement)
===================================================================== */

function baseStats() {
  return {
    maxHp: 120, speed: 135, might: 1, haste: 1, area: 1, duration: 1, amount: 0, velocity: 1, magnet: 60, regen: 0,
    crit: 0.05, critMult: 2, armor: 0, growth: 1, luck: 1, greed: 1, vampire: 0, pierce: 0, ultCharge: 1,
    revives: 0, rerolls: 0, skips: 0, banishes: 0, choices: 3
  };
}

function computeStats(state) {
  const s = baseStats();
  for (const m of IMPLANTS) { const r = state.implants[m.id] || 0; if (r) m.mod(s, r); }
  charById(state.character).mod(s);
  for (const p of state.passives) for (let i = 0; i < p.lvl; i++) PASSIVES[p.id].mod(s);
  s.armor = Math.min(0.7, s.armor);
  s.crit = Math.min(0.9, s.crit);
  s.maxHp = Math.max(30, Math.round(s.maxHp));
  return s;
}

function refreshStats(state) {
  const ratio = state.player.hp / Math.max(1, state.stats?.maxHp || 1);
  const before = state.stats?.maxHp;
  state.stats = computeStats(state);
  if (before && state.stats.maxHp > before) state.player.hp += state.stats.maxHp - before;   // les PV gagnés sont rendus
  else if (before) state.player.hp = Math.min(state.stats.maxHp, Math.max(1, ratio * state.stats.maxHp));
}

/* =====================================================================
   Obstacles, caisses et dangers de la carte
===================================================================== */

function genMap(state) {
  const { rng } = state;
  const m = state.map;
  const { w, h } = state.world;
  const cx = w / 2;
  const cy = h / 2;
  const obstacles = [];
  const free = (x, y, r) => Math.hypot(x - cx, y - cy) > 160 + r;
  if (m.obstacles === "racks") {
    for (let x = 180; x < w - 180; x += 260) {
      for (let y = 150; y < h - 150; y += 340) {
        if (rng() < 0.18) continue;
        const rw = 40;
        const rh = 180 + Math.floor(rng() * 3) * 20;
        if (!free(x + rw / 2, y + rh / 2, 120)) continue;
        obstacles.push({ kind: "rect", x, y, w: rw, h: rh });
      }
    }
  } else {
    const count = Math.round((w * h) / (m.obstacles === "core" ? 110000 : m.obstacles === "dunes" ? 140000 : 90000));
    for (let i = 0; i < count; i++) {
      const r = m.obstacles === "bins" ? 14 + rng() * 14 : m.obstacles === "ice" ? 18 + rng() * 30 : m.obstacles === "core" ? 20 + rng() * 26 : 26 + rng() * 34;
      const x = 80 + rng() * (w - 160);
      const y = 80 + rng() * (h - 160);
      if (!free(x, y, r)) continue;
      if (obstacles.some((o) => o.kind === "circle" && Math.hypot(o.x - x, o.y - y) < o.r + r + 60)) continue;
      obstacles.push({ kind: "circle", x, y, r, v: rng() });
    }
  }
  state.obstacles = obstacles;
  // Mares d'acide (désert toxique)
  state.hazards = [];
  if (m.hazards) {
    for (let i = 0; i < 18; i++) {
      const r = 50 + rng() * 60;
      const x = 120 + rng() * (w - 240);
      const y = 120 + rng() * (h - 240);
      if (!free(x, y, r + 40)) continue;
      state.hazards.push({ kind: "acid", x, y, r, dps: 9, ttl: Infinity, phase: rng() * TAU });
    }
  }
  // Caisses de ravitaillement (se brisent au contact, réapparaissent)
  state.props = [];
  const nProps = Math.round((w * h) / 260000);
  for (let i = 0; i < nProps; i++) {
    const p = placeFree(state, 12, 60);
    if (p) state.props.push({ x: p.x, y: p.y, r: 11, broken: 0 });
  }
}

function placeFree(state, r, margin = 40) {
  const { w, h } = state.world;
  for (let i = 0; i < 20; i++) {
    const x = margin + state.rng() * (w - 2 * margin);
    const y = margin + state.rng() * (h - 2 * margin);
    if (!blocked(state, x, y, r)) return { x, y };
  }
  return null;
}

function blocked(state, x, y, r) {
  for (const o of state.obstacles) {
    if (o.kind === "circle") { if ((x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + r) ** 2) return true; }
    else if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
  }
  return false;
}

// Repousse un cercle hors des obstacles
function pushOut(state, obj, r) {
  for (const o of state.obstacles) {
    if (o.kind === "circle") {
      const dx = obj.x - o.x;
      const dy = obj.y - o.y;
      const min = o.r + r;
      const dd = dx * dx + dy * dy;
      if (dd < min * min) {
        const d = Math.sqrt(dd) || 1;
        obj.x = o.x + (dx / d) * min;
        obj.y = o.y + (dy / d) * min;
      }
    } else {
      const nx = clamp(obj.x, o.x, o.x + o.w);
      const ny = clamp(obj.y, o.y, o.y + o.h);
      const dx = obj.x - nx;
      const dy = obj.y - ny;
      const dd = dx * dx + dy * dy;
      if (dd < r * r) {
        if (dd > 0) {
          const d = Math.sqrt(dd);
          obj.x = nx + (dx / d) * r;
          obj.y = ny + (dy / d) * r;
        } else {
          // centre dans le rectangle : sortie par le côté le plus proche
          const l = obj.x - o.x, ri = o.x + o.w - obj.x, t = obj.y - o.y, b = o.y + o.h - obj.y;
          const m = Math.min(l, ri, t, b);
          if (m === l) obj.x = o.x - r; else if (m === ri) obj.x = o.x + o.w + r; else if (m === t) obj.y = o.y - r; else obj.y = o.y + o.h + r;
        }
      }
    }
  }
}

/* =====================================================================
   Création de la partie
   cfg : { char, map, heat, implants, size: { w, h } }
===================================================================== */

export function createState(rng = Math.random, cfg = {}) {
  // compatibilité avec l'ancienne signature createState(rng, characterId, size)
  if (typeof cfg === "string") cfg = { char: cfg, size: arguments[2] };
  const map = mapById(cfg.map);
  const heat = clamp(Math.floor(cfg.heat || 0), 0, HEAT_MAX);
  const size = cfg.size || {};
  const state = {
    rng,
    w: Math.max(320, Math.round(size.w || W)),       // taille de la vue (caméra)
    h: Math.max(240, Math.round(size.h || H)),
    map, mapId: map.id,
    heat, heatK: heatInfo(heat),
    world: { ...map.world },
    cam: { x: 0, y: 0 },
    time: 0,
    over: false,
    won: false,
    character: CHARACTER_IDS.includes(cfg.char) ? cfg.char : FREE_CHARACTER,
    implants: { ...(cfg.implants || {}) },
    player: { x: map.world.w / 2, y: map.world.h / 2, vx: 0, vy: 0, hp: 1, inv: 0, fx: 1, fy: 0, slowT: 0, hurtT: 0 },
    stats: null,
    weapons: [],          // [{ id, lvl, evo, t, ... }]
    passives: [],         // [{ id, lvl }]
    banished: [],
    level: 1,
    xp: 0,
    pending: 0,
    choices: null,        // améliorations proposées (le jeu est en pause tant qu'elle est non nulle)
    chest: null,          // contenu d'un coffre en cours d'ouverture (pause aussi)
    enemies: [],
    shots: [],            // projectiles du joueur
    ebullets: [],         // projectiles ennemis
    zones: [],            // effets au sol du joueur
    hazards: [],          // dangers au sol (acide…)
    warns: [],            // télégraphes (cercles, lignes)
    pmines: [],           // mines du joueur
    emines: [],           // mines ennemies
    gems: [],
    items: [],            // soins, aimants, bombes, horloges, noyaux, coffres
    props: [],
    obstacles: [],
    fx: [],
    numbers: [],          // chiffres de dégâts
    msgs: [],             // messages pour l'interface (toasts)
    kills: 0,
    ult: 0,
    ultMax: ULT_COST,
    buffs: { inv: 0, sprint: 0, phase: 0, barrage: 0, overclock: 0, whirl: 0, freeze: 0, inferno: 0, xpboost: 0 },
    spawnClock: 1,
    nextBoss: BOSS_EVERY,
    bossCount: 0,
    nextElite: 45,
    nextEvent: 90,
    eventIndex: 0,
    blackwallSpawned: false,
    bossId: 0,
    shake: 0,
    nextId: 1,
    run: { kills: 0, codex: {}, bosses: 0, elites: 0, gems: 0, cores: 0, evos: 0, dmgBy: {}, takenBy: {}, killer: null, taken: 0, ults: 0, bossKills: [], chests: 0 }
  };
  genMap(state);
  state.stats = computeStats(state);
  state.player.hp = state.stats.maxHp;
  state.revives = state.stats.revives;
  state.rerolls = state.stats.rerolls;
  state.skips = state.stats.skips;
  state.banishes = state.stats.banishes;
  state.ultMax = Math.round(ULT_COST / state.stats.ultCharge);
  for (const spec of charById(state.character).start) {
    const [id, lv] = spec.split(":");
    addWeapon(state, id, Number(lv) || 1);
  }
  updateCamera(state);
  return state;
}

// Change la taille de la vue (plein écran, rotation…) en cours de partie
export function resizeView(state, w, h) {
  state.w = Math.max(320, Math.round(w));
  state.h = Math.max(240, Math.round(h));
  updateCamera(state);
}

function updateCamera(state) {
  const { player, world } = state;
  state.cam.x = world.w <= state.w ? (world.w - state.w) / 2 : clamp(player.x - state.w / 2, 0, world.w - state.w);
  state.cam.y = world.h <= state.h ? (world.h - state.h) / 2 : clamp(player.y - state.h / 2, 0, world.h - state.h);
}

const inView = (state, x, y, m = 0) => x > state.cam.x - m && x < state.cam.x + state.w + m && y > state.cam.y - m && y < state.cam.y + state.h + m;

/* =====================================================================
   Inventaire : armes et modules
===================================================================== */

export const weaponOf = (state, id) => state.weapons.find((w) => w.id === id);
export const passiveOf = (state, id) => state.passives.find((p) => p.id === id);

function addWeapon(state, id, lvl = 1) {
  if (!WEAPONS[id]) return;
  const w = weaponOf(state, id);
  if (w) { w.lvl = Math.min(W_MAX, w.lvl + lvl); return; }
  if (state.weapons.length >= MAX_WEAPONS) return;
  state.weapons.push({ id, lvl: Math.min(W_MAX, lvl), evo: false, t: 0.3 + state.rng() * 0.5, a: state.rng() * TAU, drones: [] });
}

function addPassive(state, id, lvl = 1) {
  const p = passiveOf(state, id);
  if (p) p.lvl = Math.min(PASSIVES[id].max, p.lvl + lvl);
  else if (state.passives.length < MAX_PASSIVES) state.passives.push({ id, lvl: Math.min(PASSIVES[id].max, lvl) });
  refreshStats(state);
}

// Armes pouvant évoluer maintenant (niveau max + bon module possédé)
export function evolvable(state) {
  return state.weapons.filter((w) => !w.evo && w.lvl >= W_MAX && passiveOf(state, WEAPONS[w.id].evo.need));
}

/* =====================================================================
   Montée de niveau : choix, relance, passer, bannir
===================================================================== */

function rollRarity(state) {
  const luck = state.stats.luck;
  const r = state.rng();
  if (r < 0.025 * luck) return "legendary";
  if (r < 0.08 * luck) return "epic";
  if (r < 0.22 * luck) return "rare";
  return "common";
}

export function rollChoices(state) {
  const pool = [];
  const ban = new Set(state.banished);
  for (const w of state.weapons) if (!w.evo && w.lvl < W_MAX) pool.push({ kind: "weapon", id: w.id, wt: 1.3 });
  for (const p of state.passives) if (p.lvl < PASSIVES[p.id].max) pool.push({ kind: "passive", id: p.id, wt: 1.1 });
  if (state.weapons.length < MAX_WEAPONS) for (const id of WEAPON_IDS) if (!weaponOf(state, id) && !ban.has(id)) pool.push({ kind: "weapon", id, wt: 0.75 });
  if (state.passives.length < MAX_PASSIVES) for (const id of PASSIVE_IDS) if (!passiveOf(state, id) && !ban.has(id)) pool.push({ kind: "passive", id, wt: 0.8 });
  const n = state.stats.choices;
  const picks = [];
  while (picks.length < n && pool.length) {
    const total = pool.reduce((a, c) => a + c.wt, 0);
    let r = state.rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].wt; if (r <= 0) break; }
    const c = pool.splice(i, 1)[0];
    picks.push({ kind: c.kind, id: c.id, rarity: rollRarity(state) });
  }
  // Plus rien à prendre : soins, noyaux
  const fill = [{ kind: "heal", id: "heal", rarity: "common" }, { kind: "cores", id: "cores", rarity: "common" }, { kind: "xpboost", id: "xpboost", rarity: "common" }];
  while (picks.length < Math.min(3, n)) picks.push(fill[picks.length % fill.length]);
  return picks;
}

// Description d'un choix (pour l'interface)
export function describeChoice(state, c) {
  const rar = RARITIES[c.rarity] || RARITIES.common;
  const extra = rar.bonus;
  if (c.kind === "weapon") {
    const W = WEAPONS[c.id];
    const w = weaponOf(state, c.id);
    const cur = w ? w.lvl : 0;
    const to = Math.min(W_MAX, cur + 1 + extra);
    const delta = weaponDelta(c.id, cur);
    const evoHint = `Évolue en « ${W.evo.name} » avec ${PASSIVES[W.evo.need].name}.`;
    return {
      name: W.name, glyph: W.glyph, color: W.color, isNew: !w, from: cur, to, max: W_MAX, rarity: c.rarity,
      desc: w ? delta.map((d) => `${d.label} ${fmtNum(d.from)} → ${fmtNum(d.to)}`).join(" · ") || W.desc : W.desc,
      hint: evoHint
    };
  }
  if (c.kind === "passive") {
    const P = PASSIVES[c.id];
    const p = passiveOf(state, c.id);
    const cur = p ? p.lvl : 0;
    const evoFor = WEAPON_IDS.filter((id) => WEAPONS[id].evo.need === c.id).map((id) => WEAPONS[id].name);
    return {
      name: P.name, glyph: P.glyph, color: "#fcee0a", isNew: !p, from: cur, to: Math.min(P.max, cur + 1 + extra), max: P.max, rarity: c.rarity,
      desc: P.desc + (extra ? ` (×${Math.min(P.max, cur + 1 + extra) - cur})` : ""),
      hint: evoFor.length ? `Fait évoluer : ${evoFor.join(", ")}.` : ""
    };
  }
  if (c.kind === "heal") return { name: "Réparation", glyph: "✚", color: "#3ddc84", desc: "Soigne 50 PV", rarity: "common" };
  if (c.kind === "cores") return { name: "Cache de noyaux", glyph: "◈", color: "#b06bff", desc: "+5 noyaux", rarity: "common" };
  return { name: "Données brutes", glyph: "◆", color: "#3ddc84", desc: "+50 % d'expérience pendant 30 s", rarity: "common" };
}
const fmtNum = (v) => (v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1).replace(".", ","));

export function chooseUpgrade(state, index) {
  const c = typeof index === "number" ? state.choices?.[index] : state.choices?.find((x) => x.id === index);
  if (!c) return false;
  const lv = 1 + (RARITIES[c.rarity]?.bonus || 0);
  if (c.kind === "weapon") addWeapon(state, c.id, lv);
  else if (c.kind === "passive") addPassive(state, c.id, lv);
  else if (c.kind === "heal") state.player.hp = Math.min(state.stats.maxHp, state.player.hp + 50);
  else if (c.kind === "cores") state.run.cores += 5;
  else state.buffs.xpboost = 30;
  nextChoice(state);
  return true;
}

function nextChoice(state) {
  state.pending -= 1;
  state.choices = state.pending > 0 ? rollChoices(state) : null;
}

export function reroll(state) {
  if (!state.choices || state.rerolls <= 0) return false;
  state.rerolls -= 1;
  state.choices = rollChoices(state);
  return true;
}

export function skipChoice(state) {
  if (!state.choices || state.skips <= 0) return false;
  state.skips -= 1;
  state.xp += xpNeeded(state.level) * 0.25;
  nextChoice(state);
  return true;
}

// Bannit un choix (il ne sera plus proposé de la partie) et relance la sélection
export function banishChoice(state, index) {
  const c = state.choices?.[index];
  if (!c || state.banishes <= 0 || (c.kind !== "weapon" && c.kind !== "passive")) return false;
  if ((c.kind === "weapon" && weaponOf(state, c.id)) || (c.kind === "passive" && passiveOf(state, c.id))) return false;
  state.banishes -= 1;
  state.banished.push(c.id);
  state.choices = rollChoices(state);
  return true;
}

/* =====================================================================
   Coffres
===================================================================== */

function openChest(state, big = false) {
  const items = [];
  const evo = evolvable(state);
  if (evo.length) {
    const w = evo[Math.floor(state.rng() * evo.length)];
    w.evo = true;
    w.t = 0;
    state.run.evos += 1;
    items.push({ kind: "evo", id: w.id, name: WEAPONS[w.id].evo.name, desc: WEAPONS[w.id].evo.desc });
  }
  const luck = state.stats.luck;
  let count = big ? 5 : state.rng() < 0.06 * luck ? 5 : state.rng() < 0.25 * luck ? 3 : 1;
  if (evo.length) count = Math.max(0, count - 1);
  for (let i = 0; i < count; i++) {
    const up = [...state.weapons.filter((w) => !w.evo && w.lvl < W_MAX).map((w) => ({ k: "w", id: w.id })),
      ...state.passives.filter((p) => p.lvl < PASSIVES[p.id].max).map((p) => ({ k: "p", id: p.id }))];
    if (!up.length) break;
    const u = up[Math.floor(state.rng() * up.length)];
    if (u.k === "w") { addWeapon(state, u.id, 1); items.push({ kind: "weapon", id: u.id, name: WEAPONS[u.id].name, desc: `Niveau ${weaponOf(state, u.id).lvl}` }); }
    else { addPassive(state, u.id, 1); items.push({ kind: "passive", id: u.id, name: PASSIVES[u.id].name, desc: `Niveau ${passiveOf(state, u.id).lvl}` }); }
  }
  const cores = (big ? 25 : 3) + Math.floor(state.rng() * (big ? 20 : 5));
  state.run.cores += cores;
  state.run.chests += 1;
  items.push({ kind: "cores", name: `+${cores} noyaux`, desc: "Monnaie des implants" });
  state.chest = { items, big };
}

export function closeChest(state) {
  state.chest = null;
}

/* =====================================================================
   Ennemis : apparition
===================================================================== */

const effTime = (state) => state.time + state.map.offset;
const hpMul = (state) => {
  const t = effTime(state);
  return (1 + t / 150 + (t / 480) ** 2) * state.map.hp * state.heatK.hp * (state.won ? 1.5 : 1);
};
const spdMul = (state) => state.map.spd * state.heatK.spd * (1 + Math.min(0.25, effTime(state) / 2400));
const dmgMul = (state) => 1 + effTime(state) / 600 + state.heat * 0.1;

function spawnPoint(state, extra = 30) {
  const { player, world } = state;
  const radius = Math.hypot(state.w, state.h) / 2 + extra;
  for (let i = 0; i < 8; i++) {
    const a = state.rng() * TAU;
    const x = clamp(player.x + Math.cos(a) * radius, 20, world.w - 20);
    const y = clamp(player.y + Math.sin(a) * radius, 20, world.h - 20);
    if (!inView(state, x, y, 0) && !blocked(state, x, y, 12)) return { x, y };
  }
  const a = state.rng() * TAU;
  return { x: clamp(player.x + Math.cos(a) * radius, 20, world.w - 20), y: clamp(player.y + Math.sin(a) * radius, 20, world.h - 20) };
}

function makeEnemy(state, type, x, y, opts = {}) {
  const def = ENEMY_DEFS[type];
  let hp = def.hp * hpMul(state) * (opts.hpK || 1);
  let r = def.r * (opts.rK || 1);
  const e = {
    id: state.nextId++, type, x, y, r, hp, maxHp: hp, spd: def.speed * (def.boss ? 1 : spdMul(state)), dmg: def.dmg * dmgMul(state), xp: def.xp,
    kx: 0, ky: 0, slow: 0, slowT: 0, stun: 0, flash: 0, hc: {}, t: state.rng() * 2, st: 0, sa: 0, elite: null, boss: !!def.boss,
    phase: false, gen: opts.gen || 0, seed: state.rng() * TAU, decoy: !!opts.decoy, age: 0, root: opts.root || 0
  };
  if (!e.root) e.root = e.id;
  if (opts.elite) {
    const affix = AFFIX_IDS[Math.floor(state.rng() * AFFIX_IDS.length)];
    e.elite = affix;
    e.hp = e.maxHp = hp * 7 * (affix === "giant" ? 1.6 : 1);
    e.r = r * (affix === "giant" ? 1.9 : 1.45);
    e.xp = def.xp * 10 + 10;
    e.dmg *= 1.4;
    if (affix === "swift") e.spd *= 1.5;
  }
  if (def.boss) {
    const k = 1 + state.bossCount * 0.55;
    e.hp = e.maxHp = def.hp * Math.max(1, hpMul(state) * 0.55) * k * state.heatK.hp * (opts.hpK || 1);
    e.dmg = def.dmg * (1 + state.bossCount * 0.12) * dmgMul(state) * 0.8;
    e.spd = def.speed * state.heatK.spd;
    if (opts.rK) e.r = def.r * opts.rK;
  }
  if (opts.decoy) { e.hp = e.maxHp = 30 * hpMul(state); e.xp = 0; }
  state.enemies.push(e);
  return e;
}

function spawnEnemy(state, type, opts) {
  const p = spawnPoint(state, opts?.boss ? 60 : 30);
  return makeEnemy(state, type, p.x, p.y, opts);
}

function pickType(state) {
  const t = effTime(state);
  let total = 0;
  const weights = [];
  for (const id of SPAWN_POOL) {
    const def = ENEMY_DEFS[id];
    if (def.from > t) continue;
    const age = t - def.from;
    const w = def.w * (age > 600 ? 0.45 : 1) * (age < 30 ? 0.5 : 1);
    weights.push([id, w]);
    total += w;
  }
  let r = state.rng() * total;
  for (const [id, w] of weights) { r -= w; if (r <= 0) return id; }
  return weights.length ? weights[weights.length - 1][0] : "grunt";
}

function spawnBoss(state, type) {
  state.bossCount += 1;
  const e = spawnEnemy(state, type, { boss: true });
  state.bossId = e.id;
  state.msgs.push({ text: `⚠ Boss : ${ENEMY_DEFS[type].name}`, kind: "boss" });
  return e;
}

const EVENT_CYCLE = ["rush", "ring", "thief", "rush", "swarmstorm", "ring", "elitepack", "thief"];
function runEvent(state) {
  const kind = EVENT_CYCLE[state.eventIndex % EVENT_CYCLE.length];
  state.eventIndex += 1;
  const { player } = state;
  const t = effTime(state);
  if (kind === "rush") {
    // une colonne d'ennemis rapides traverse l'écran
    const a = state.rng() * TAU;
    const type = t > 300 ? "bat" : "swarm";
    const count = 22 + Math.floor(t / 30);
    const ox = player.x - Math.cos(a) * (state.w * 0.7);
    const oy = player.y - Math.sin(a) * (state.h * 0.7);
    for (let i = 0; i < count && state.enemies.length < MAX_ENEMIES; i++) {
      const off = (i - count / 2) * 14;
      const x = clamp(ox - Math.sin(a) * off, 20, state.world.w - 20);
      const y = clamp(oy + Math.cos(a) * off, 20, state.world.h - 20);
      const e = makeEnemy(state, type, x, y);
      e.rush = { vx: Math.cos(a), vy: Math.sin(a), ttl: 7 };
    }
    state.msgs.push({ text: "Ruée !", kind: "event" });
  } else if (kind === "ring") {
    const type = t > 600 ? "mutant" : t > 240 ? "stalker" : "grunt";
    const count = 30 + Math.floor(t / 25);
    const radius = Math.min(state.w, state.h) * 0.48 + 40;
    for (let i = 0; i < count && state.enemies.length < MAX_ENEMIES; i++) {
      const a = (i / count) * TAU;
      makeEnemy(state, type, clamp(player.x + Math.cos(a) * radius, 20, state.world.w - 20), clamp(player.y + Math.sin(a) * radius, 20, state.world.h - 20));
    }
    state.msgs.push({ text: "Encerclement !", kind: "event" });
  } else if (kind === "thief") {
    const e = spawnEnemy(state, "thief");
    e.fleeT = 22;
    state.msgs.push({ text: "Un voleur de données ! Attrape-le", kind: "event" });
  } else if (kind === "swarmstorm") {
    for (let i = 0; i < 40 + t / 15 && state.enemies.length < MAX_ENEMIES; i++) spawnEnemy(state, "swarm");
    state.msgs.push({ text: "Tempête d'essaims !", kind: "event" });
  } else if (kind === "elitepack") {
    for (let i = 0; i < 3; i++) spawnEnemy(state, pickType(state), { elite: true });
    state.msgs.push({ text: "Meute d'élites !", kind: "event" });
  }
}

function spawning(state, dt) {
  const t = effTime(state);
  const density = state.map.density * state.heatK.density * (state.won ? 1.4 : 1);
  state.spawnClock -= dt;
  if (state.spawnClock <= 0) {
    const view = Math.sqrt((state.w * state.h) / (W * H));
    state.spawnClock = Math.max(0.24, 1.5 - t * 0.0012) / (density * Math.min(1.4, view ** 0.7));
    const count = 1 + Math.floor(t / 80);
    for (let i = 0; i < count && state.enemies.length < MAX_ENEMIES; i++) spawnEnemy(state, pickType(state));
  }
  // Effectif minimum (la pression ne retombe jamais complètement)
  const minimum = Math.min(MAX_ENEMIES * 0.75, (5 + t * 0.16) * density);
  let extra = 0;
  while (state.enemies.length < minimum && extra < 3) { spawnEnemy(state, pickType(state)); extra++; }

  if (state.time >= state.nextElite) {
    state.nextElite += Math.max(25, 45 - t / 60);
    spawnEnemy(state, pickType(state), { elite: true });
  }
  if (state.time >= state.nextEvent) {
    state.nextEvent += 75;
    runEvent(state);
  }
  if (!state.blackwallSpawned && state.time >= BLACKWALL_AT) {
    state.blackwallSpawned = true;
    spawnBoss(state, "blackwall");
    state.nextBoss = state.time + BOSS_EVERY * 1.5;
  }
  if (state.time >= state.nextBoss) {
    state.nextBoss += BOSS_EVERY;
    const type = BOSS_ORDER[(state.bossCount) % BOSS_ORDER.length];
    spawnBoss(state, type);
    if (state.time > BLACKWALL_AT + 60) spawnBoss(state, BOSS_ORDER[(state.bossCount) % BOSS_ORDER.length]);   // en mode infini : deux boss à la fois
  }
}

/* =====================================================================
   Grille spatiale (collisions rapides)
===================================================================== */

const CELL = 80;
const cellKey = (cx, cy) => (cx + 16) * 4096 + (cy + 16);
function buildGrid(state) {
  const g = new Map();
  for (const e of state.enemies) {
    if (e.dead) continue;
    const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let c = g.get(k);
    if (!c) { c = []; g.set(k, c); }
    c.push(e);
  }
  state.grid = g;
}
function around(state, x, y, r, fn) {
  const g = state.grid;
  const x0 = Math.floor((x - r - 50) / CELL);
  const x1 = Math.floor((x + r + 50) / CELL);
  const y0 = Math.floor((y - r - 50) / CELL);
  const y1 = Math.floor((y + r + 50) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const c = g.get(cellKey(cx, cy));
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const e = c[i];
        if (e.dead) continue;
        const rr = r + e.r;
        if ((e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) { if (fn(e) === false) return; }
      }
    }
  }
}

function nearestEnemy(state, from, maxDist = 520, filter) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const e of state.enemies) {
    if (e.dead || e.phase || (filter && !filter(e))) continue;
    const d = d2(from, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function visibleEnemies(state, margin = 0) {
  return state.enemies.filter((e) => !e.dead && !e.phase && inView(state, e.x, e.y, margin));
}

/* =====================================================================
   Dégâts
===================================================================== */

// Cadence de touche par source pour les dégâts continus (renvoie true si on peut toucher)
function canHit(state, e, key, cd) {
  const t = e.hc[key];
  if (t !== undefined && t > state.time) return false;
  e.hc[key] = state.time + cd;
  return true;
}

function hit(state, e, base, src, o = {}) {
  if (e.dead || e.phase) return 0;
  const st = state.stats;
  let dmg = base * st.might;
  const crit = !o.noCrit && state.rng() < st.crit;
  if (crit) dmg *= st.critMult;
  if (e.elite === "armored") dmg *= 0.5;
  if (e.shielded) dmg *= 0.6;
  e.hp -= dmg;
  e.flash = 0.08;
  state.run.dmgBy[src] = (state.run.dmgBy[src] || 0) + dmg;
  if (state.numbers.length < 70 && (crit || dmg > 4)) state.numbers.push({ x: e.x + (state.rng() - 0.5) * 10, y: e.y - e.r, v: dmg, crit, ttl: 0.6 });
  const heavy = e.boss ? 1 : ENEMY_DEFS[e.type].heavy || 0;
  if (o.kb && heavy < 1) {
    const dx = e.x - (o.fx ?? state.player.x);
    const dy = e.y - (o.fy ?? state.player.y);
    const d = Math.hypot(dx, dy) || 1;
    const k = o.kb * (1 - heavy);
    e.kx += (dx / d) * k;
    e.ky += (dy / d) * k;
  }
  if (o.slow) { e.slow = Math.max(e.slow, e.boss ? o.slow * 0.5 : o.slow); e.slowT = Math.max(e.slowT, o.slowT || 1); }
  if (o.stun && !e.boss) e.stun = Math.max(e.stun, o.stun);
  if (o.stun && e.boss && e.type !== "blackwall") e.stun = Math.max(e.stun, o.stun * 0.25);
  if (o.lifesteal) state.player.hp = Math.min(st.maxHp, state.player.hp + o.lifesteal);
  if (e.hp <= 0) kill(state, e, src);
  return dmg;
}

function hitArea(state, x, y, r, dmg, src, o) {
  around(state, x, y, r, (e) => { hit(state, e, dmg, src, { fx: x, fy: y, ...o }); });
}

function dropItem(state, kind, x, y) {
  if (state.items.length > 80 && kind !== "chest") return;
  state.items.push({ kind, x, y, t: 0 });
}

function kill(state, e, src = "") {
  if (e.dead) return;
  e.dead = true;
  const def = ENEMY_DEFS[e.type];
  const st = state.stats;
  state.kills += 1;
  state.run.kills += 1;
  if (!e.decoy) state.run.codex[e.type] = (state.run.codex[e.type] || 0) + 1;
  if (e.xp > 0) state.gems.push({ x: e.x, y: e.y, v: e.xp, pull: false });
  if (st.vampire) state.player.hp = Math.min(st.maxHp, state.player.hp + st.vampire);
  if (state.ult < state.ultMax) state.ult = Math.min(state.ultMax, state.ult + (e.boss ? 40 : e.elite ? 10 : 1));
  state.fx.push({ kind: "pop", x: e.x, y: e.y, r: e.r, color: def.color, ttl: 0.32, max: 0.32 });
  const luck = st.luck;
  const r = state.rng();
  if (r < 0.010 * luck) dropItem(state, "heart", e.x, e.y);
  else if (r < 0.014 * luck) dropItem(state, "magnet", e.x, e.y);
  else if (r < 0.017 * luck) dropItem(state, "bomb", e.x, e.y);
  else if (r < 0.020 * luck) dropItem(state, "clock", e.x, e.y);
  else if (r < 0.034 * luck) dropItem(state, "core", e.x, e.y);
  if (e.elite) {
    state.run.elites += 1;
    dropItem(state, "chest", e.x, e.y);
    if (e.elite === "explosive") ringBullets(state, e.x, e.y, 12, 150, 10 * dmgMul(state), "#ff8a3d", e.seed);
  }
  if (e.boss && !e.decoy) {
    // l'Hydre ne compte comme vaincue qu'une fois tous ses morceaux détruits
    const hydraLeft = e.type === "hydra" && (e.gen < 2 || state.enemies.some((o) => o !== e && !o.dead && o.root === e.root));
    if (!hydraLeft) {
      state.run.bosses += 1;
      state.run.bossKills.push(e.type);
      dropItem(state, "chest", e.x, e.y);
      dropItem(state, "heart", e.x + 20, e.y);
      for (let i = 0; i < 4; i++) dropItem(state, "core", e.x + (state.rng() - 0.5) * 60, e.y + (state.rng() - 0.5) * 60);
      state.msgs.push({ text: `${def.name} vaincu !`, kind: "win" });
      state.shake = Math.max(state.shake, 0.5);
    }
    if (e.type === "hydra" && e.gen < 2) {
      for (let i = 0; i < 2; i++) {
        const c = makeEnemy(state, "hydra", e.x + (i ? 20 : -20), e.y, { boss: true, gen: e.gen + 1, root: e.root, rK: 0.75 ** (e.gen + 1) });
        c.hp = c.maxHp = e.maxHp * 0.45;
        if (state.bossId === e.id) state.bossId = c.id;
      }
    }
    if (e.type === "blackwall") {
      state.won = true;
      state.run.blackwall = 1;
      state.run.cores += 60;
      state.msgs.push({ text: "BLACKWALL VAINCU — mode infini", kind: "win" });
      dropItem(state, "bigchest", e.x, e.y);
    }
  }
  if (def.split) {
    for (let i = 0; i < 3 && state.enemies.length < MAX_ENEMIES + 20; i++) {
      const a = (i / 3) * TAU + e.seed;
      const s = makeEnemy(state, def.split, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
      s.kx = Math.cos(a) * 160; s.ky = Math.sin(a) * 160;
    }
  }
  if (e.type === "bomber" && !e.selfBoom) {
    // abattu : il explose sur ses voisins
    hitArea(state, e.x, e.y, def.boom.r, 30 * hpMul(state) * 0.3, "kamikaze", { noCrit: true });
    state.fx.push({ kind: "blast", x: e.x, y: e.y, r: def.boom.r, ttl: 0.3, max: 0.3, color: "#ff8a3d" });
  }
  if (e.type === "thief") {
    for (let i = 0; i < 12; i++) dropItem(state, "core", e.x + (state.rng() - 0.5) * 80, e.y + (state.rng() - 0.5) * 80);
    dropItem(state, "chest", e.x, e.y);
    state.msgs.push({ text: "Voleur attrapé !", kind: "win" });
  }
}

function hurt(state, amount, opts = {}) {
  const p = state.player;
  if (state.buffs.inv > 0 || state.buffs.sprint > 0 || state.buffs.phase > 0) return;
  if (!opts.dot && p.inv > 0) return;
  const dmg = amount * (1 - state.stats.armor);
  p.hp -= dmg;
  state.run.taken += dmg;
  const src = opts.src || state.curSrc || "?";
  state.run.takenBy[src] = (state.run.takenBy[src] || 0) + dmg;
  if (p.hp <= 0) state.run.killer = src;
  if (!opts.dot) { p.inv = 0.5; p.hurtT = 0.25; state.shake = Math.max(state.shake, 0.18); }
}

function ringBullets(state, x, y, n, spd, dmg, color, off = 0, r = 5) {
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    state.ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, dmg, ttl: 4, color, src: state.curSrc });
  }
}
function aimBullets(state, e, n, spread, spd, dmg, color, opts = {}) {
  const base = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i - (n - 1) / 2) * spread : 0);
    state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: opts.r || 5, dmg, ttl: opts.ttl || 4, color, slow: opts.slow, homing: opts.homing, src: e.type });
  }
}

/* =====================================================================
   Armes : un pas de simulation par arme
===================================================================== */

function params(state, w) {
  const W = WEAPONS[w.id];
  const p = { ...(w.evo ? W.E : W.P(w.lvl)) };
  const st = state.stats;
  const oc = state.buffs.overclock > 0 ? 0.4 : 1;
  if (p.cd) p.cd = Math.max(0.05, p.cd * st.haste * oc);
  if (p.n !== undefined && USES_AMOUNT.has(w.id)) p.n += st.amount;
  if (p.r) p.r *= st.area;
  if (p.len) p.len *= st.area;
  if (p.ttl) p.ttl *= st.duration;
  if (p.spd) p.spd *= st.velocity;
  if (p.pierce !== undefined) p.pierce += st.pierce;
  return p;
}

function fireBullet(state, x, y, a, spd, dmg, src, o = {}) {
  state.shots.push({
    kind: o.kind || "bullet", x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: o.r || 4, dmg, src,
    pierce: o.pierce || 0, ttl: o.ttl || 1.4, hit: new Set(), color: o.color, kb: o.kb || 0, boom: o.boom || 0
  });
}

const TICK = {
  blaster(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    const pl = state.player;
    const target = nearestEnemy(state, pl, 520);
    if (!target) { w.t = 0.05; return; }
    w.t = p.cd;
    const base = Math.atan2(target.y - pl.y, target.x - pl.x);
    for (let i = 0; i < p.n; i++) {
      const a = base + (i - (p.n - 1) / 2) * 0.13 + (w.evo ? (state.rng() - 0.5) * 0.12 : 0);
      fireBullet(state, pl.x, pl.y, a, p.spd, p.dmg, "blaster", { pierce: p.pierce, color: w.evo ? "#7df9ff" : "#00f0ff", r: w.evo ? 4.5 : 4 });
    }
  },
  orbit(state, w, dt, p) {
    w.a += dt * p.spin;
    const pl = state.player;
    for (let i = 0; i < p.n; i++) {
      const a = w.a + (i * TAU) / p.n;
      const bx = pl.x + Math.cos(a) * p.r;
      const by = pl.y + Math.sin(a) * p.r;
      around(state, bx, by, w.evo ? 14 : 8, (e) => {
        if (canHit(state, e, "orbit", 0.35)) hit(state, e, p.dmg, "orbit", { kb: w.evo ? 260 : 90 });
      });
    }
  },
  nova(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    hitArea(state, pl.x, pl.y, p.r, p.dmg, "nova", { kb: 320, slow: w.evo ? 0.5 : 0, slowT: 1.5 });
    state.fx.push({ kind: "ring", x: pl.x, y: pl.y, r: p.r, ttl: 0.35, max: 0.35, color: w.evo ? "#fcee0a" : "#b58cff" });
  },
  lightning(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pool = visibleEnemies(state, 40);
    for (let i = 0; i < p.n && pool.length; i++) {
      const e = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
      hitArea(state, e.x, e.y, p.r, p.dmg, "lightning", {});
      state.fx.push({ kind: "zap", x: e.x, y: e.y - 400, x2: e.x, y2: e.y, ttl: 0.22, max: 0.22, color: w.evo ? "#7df9ff" : "#b58cff", seed: state.rng() });
      state.fx.push({ kind: "blast", x: e.x, y: e.y, r: p.r, ttl: 0.2, max: 0.2, color: "#b58cff" });
    }
  },
  missiles(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    const pool = visibleEnemies(state, 120);
    if (!pool.length) { w.t = 0.3; return; }
    for (let i = 0; i < p.n; i++) {
      const e = pool[Math.floor(state.rng() * pool.length)];
      const a = state.rng() * TAU;
      state.shots.push({ kind: "missile", x: pl.x, y: pl.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 4, dmg: p.dmg, boom: p.r, src: "missiles", target: e.id, ttl: 3, trail: [], hit: new Set(), pierce: 0 });
    }
  },
  meteor(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pool = visibleEnemies(state, 0);
    for (let i = 0; i < p.n && pool.length; i++) {
      const e = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
      state.zones.push({ kind: "meteor", x: e.x, y: e.y, delay: 0.85, max: 0.85, r: p.r, dmg: p.dmg, src: "meteor", lava: w.evo });
    }
  },
  fire(state, w, dt, p) {
    const pl = state.player;
    const moving = Math.hypot(pl.vx, pl.vy) > 10;
    if (!moving && !w.evo) return;
    w.t -= dt;
    if (w.t > 0 || state.zones.length > 140) return;
    w.t = w.evo ? 0.16 : 0.2;
    state.zones.push({ kind: "fire", x: pl.x + (state.rng() - 0.5) * 8, y: pl.y + (state.rng() - 0.5) * 8, ttl: p.ttl, max: p.ttl, r: p.r, dps: p.dmg, src: "fire", tick: 0 });
  },
  beam(state, w, dt, p) {
    w.a += dt * p.spin;
    const pl = state.player;
    for (let b = 0; b < p.n; b++) {
      const a = w.a + (b * TAU) / p.n;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      around(state, pl.x + ux * p.len / 2, pl.y + uy * p.len / 2, p.len / 2, (e) => {
        const px = e.x - pl.x;
        const py = e.y - pl.y;
        const along = px * ux + py * uy;
        const across = Math.abs(px * uy - py * ux);
        if (along > 0 && along < p.len && across <= e.r + (w.evo ? 8 : 5) && canHit(state, e, "beam", 0.25)) hit(state, e, p.dmg, "beam", {});
      });
    }
  },
  hole(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    if (w.evo) {
      state.zones.push({ kind: "hole", x: pl.x, y: pl.y, ttl: p.ttl, max: p.ttl, r: p.r, dps: p.dmg, src: "hole", follow: true, tick: 0 });
      return;
    }
    const pool = visibleEnemies(state, 0);
    if (!pool.length) { w.t = 0.5; return; }
    const e = pool[Math.floor(state.rng() * pool.length)];
    state.zones.push({ kind: "hole", x: e.x, y: e.y, ttl: p.ttl, max: p.ttl, r: p.r, dps: p.dmg, src: "hole", tick: 0 });
  },
  disc(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    const target = nearestEnemy(state, pl, 600);
    const base = target ? Math.atan2(target.y - pl.y, target.x - pl.x) : Math.atan2(pl.fy, pl.fx);
    for (let i = 0; i < p.n; i++) {
      const a = base + (i - (p.n - 1) / 2) * (p.n > 2 ? 0.7 : 0.5);
      state.shots.push({ kind: "disc", x: pl.x, y: pl.y, vx: Math.cos(a) * p.spd, vy: Math.sin(a) * p.spd, r: p.r, dmg: p.dmg, src: "disc", ttl: 6, out: p.len, back: false, hit: new Set(), pierce: 999, spin: 0 });
    }
  },
  shotgun(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    const pl = state.player;
    const target = nearestEnemy(state, pl, 300);
    if (!target) { w.t = 0.1; return; }
    w.t = p.cd;
    const base = Math.atan2(target.y - pl.y, target.x - pl.x);
    for (let i = 0; i < p.n; i++) {
      const a = base + (state.rng() - 0.5) * 0.85;
      fireBullet(state, pl.x, pl.y, a, p.spd * (0.8 + state.rng() * 0.4), p.dmg, "shotgun", { kind: "pellet", ttl: p.ttl, kb: 120, r: 3, color: "#ffd27a", boom: w.evo ? 34 : 0 });
    }
    state.fx.push({ kind: "flash", x: pl.x + Math.cos(base) * 14, y: pl.y + Math.sin(base) * 14, r: 14, ttl: 0.08, max: 0.08, color: "#ffd27a" });
  },
  katana(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    const near = nearestEnemy(state, pl, p.r + 60);
    const face = near ? Math.atan2(near.y - pl.y, near.x - pl.x) : Math.atan2(pl.fy, pl.fx);
    const arcs = w.evo ? [[face, Math.PI]] : w.lvl >= 4 ? [[face, 1.15], [face + Math.PI, 1.15]] : [[face, 1.15]];
    for (const [a, half] of arcs) {
      around(state, pl.x, pl.y, p.r, (e) => {
        let da = Math.atan2(e.y - pl.y, e.x - pl.x) - a;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) <= half + 0.2) hit(state, e, p.dmg, "katana", { kb: 140, lifesteal: w.evo ? 0.6 : 0 });
      });
      state.fx.push({ kind: "slash", x: pl.x, y: pl.y, a, half, r: p.r, ttl: 0.2, max: 0.2, color: w.evo ? "#ff2a2a" : "#ff6ad5" });
    }
  },
  drone(state, w, dt, p) {
    const pl = state.player;
    w.a += dt * 1.2;
    while (w.drones.length < p.n) w.drones.push({ t: state.rng() * 0.5, x: pl.x, y: pl.y });
    w.drones.length = p.n;
    w.drones.forEach((d, i) => {
      const a = w.a + (i * TAU) / p.n;
      const tx = pl.x + Math.cos(a) * 70;
      const ty = pl.y + Math.sin(a) * 70 - 10;
      d.x += (tx - d.x) * Math.min(1, dt * 6);
      d.y += (ty - d.y) * Math.min(1, dt * 6);
      d.t -= dt;
      if (d.t > 0) return;
      const target = nearestEnemy(state, d, 420);
      if (!target) { d.t = 0.1; return; }
      d.t = p.cd;
      const ang = Math.atan2(target.y - d.y, target.x - d.x);
      fireBullet(state, d.x, d.y, ang, 460 * state.stats.velocity, p.dmg, "drone", { color: w.evo ? "#ff2a6d" : "#7df9ff", pierce: w.evo ? 4 : 0, r: w.evo ? 3.5 : 3, kind: w.evo ? "laser" : "bullet" });
    });
  },
  mines(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    for (let i = 0; i < p.n; i++) {
      if (state.pmines.length >= 24) state.pmines.shift();
      const a = state.rng() * TAU;
      const dd = i === 0 ? 0 : 30 + state.rng() * 40;
      state.pmines.push({ x: pl.x + Math.cos(a) * dd, y: pl.y + Math.sin(a) * dd, arm: 0.5, r: p.r, dmg: p.dmg, ttl: 25, big: w.evo });
    }
  },
  frost(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = 0.5;
    const pl = state.player;
    hitArea(state, pl.x, pl.y, p.r, p.dmg * 0.5, "frost", { noCrit: true, slow: p.slow, slowT: 0.7, stun: w.evo && state.rng() < 0.2 ? 0.8 : 0 });
  },
  rail(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    const pl = state.player;
    const pool = visibleEnemies(state, 60).sort((a, b) => b.hp - a.hp);
    if (!pool.length) { w.t = 0.2; return; }
    w.t = p.cd;
    for (let i = 0; i < p.n; i++) {
      const target = pool[i % pool.length];
      const a = Math.atan2(target.y - pl.y, target.x - pl.x) + (i >= pool.length ? (i - pool.length + 1) * 0.3 : 0);
      railLine(state, pl.x, pl.y, a, 1100, p.r, p.dmg, "rail", w.evo ? "#fcee0a" : "#e0f7ff");
    }
  },
  saw(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    for (let i = 0; i < p.n; i++) {
      const a = state.rng() * TAU;
      state.shots.push({ kind: "saw", x: pl.x, y: pl.y, vx: Math.cos(a) * p.spd, vy: Math.sin(a) * p.spd, r: p.r, dmg: p.dmg, src: "saw", ttl: p.ttl, hit: new Set(), pierce: 999, spin: 0 });
    }
  },
  poison(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = p.cd;
    const pl = state.player;
    const pool = visibleEnemies(state, 0);
    for (let i = 0; i < p.n; i++) {
      const e = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
      const x = e ? e.x : pl.x + (state.rng() - 0.5) * 300;
      const y = e ? e.y : pl.y + (state.rng() - 0.5) * 300;
      state.zones.push({ kind: "poison", x, y, ox: pl.x, oy: pl.y, delay: 0.5, max: 0.5, ttl: p.ttl, ttlMax: p.ttl, r: p.r, dps: p.dmg, src: "poison", tick: 0, slow: w.evo ? 0.4 : 0 });
    }
  },
  chain(state, w, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    const pl = state.player;
    let cur = nearestEnemy(state, pl, 380);
    if (!cur) { w.t = 0.1; return; }
    w.t = p.cd;
    chainFrom(state, pl, cur, p.n, p.dmg, w.evo ? 1 : 0.9, "chain", w.evo ? "#ffffff" : "#7df9ff");
  }
};

function chainFrom(state, from, first, jumps, dmg, decay, src, color, range = 150) {
  const pts = [{ x: from.x, y: from.y }];
  const done = new Set();
  let cur = first;
  let d = dmg;
  for (let j = 0; j < jumps && cur; j++) {
    done.add(cur.id);
    pts.push({ x: cur.x, y: cur.y });
    hit(state, cur, d, src, {});
    d *= decay;
    const prev = cur;
    cur = nearestEnemy(state, prev, range, (e) => !done.has(e.id));
  }
  state.fx.push({ kind: "chain", pts, ttl: 0.2, max: 0.2, color, seed: state.rng() });
}

function railLine(state, x, y, a, len, width, dmg, src, color) {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  for (const e of state.enemies) {
    if (e.dead) continue;
    const px = e.x - x;
    const py = e.y - y;
    const along = px * ux + py * uy;
    if (along < 0 || along > len) continue;
    if (Math.abs(px * uy - py * ux) <= e.r + width) hit(state, e, dmg, src, { kb: 80 });
  }
  state.fx.push({ kind: "rail", x, y, x2: x + ux * len, y2: y + uy * len, w: width, ttl: 0.25, max: 0.25, color });
}

/* =====================================================================
   Ultimes
===================================================================== */

const ULT_FIRE = {
  sprint(s) { s.buffs.sprint = 5; },
  quake(s) {
    const p = s.player;
    hitArea(s, p.x, p.y, 330 * s.stats.area, 140 * ultScale(s), "ult", { kb: 500, stun: 1.6 });
    s.fx.push({ kind: "ring", x: p.x, y: p.y, r: 330 * s.stats.area, ttl: 0.6, max: 0.6, color: "#a066ff", thick: 10 });
    s.shake = 0.6;
  },
  hack(s) {
    for (const e of visibleEnemies(s, 20)) { hit(s, e, 70 * ultScale(s), "ult", { stun: 3 }); s.fx.push({ kind: "glitch", x: e.x, y: e.y, r: e.r, ttl: 0.5, max: 0.5 }); }
  },
  phase(s) { s.buffs.phase = 5; },
  barrage(s) { s.buffs.barrage = 3; },
  iaido(s) {
    for (const e of visibleEnemies(s, 20)) hit(s, e, 220 * ultScale(s), "ult", {});
    s.fx.push({ kind: "screen", ttl: 0.35, max: 0.35, color: "#ff2a6d" });
    s.shake = 0.4;
  },
  overclock(s) { s.buffs.overclock = 8; },
  inferno(s) { s.buffs.inferno = 6; },
  blizzard(s) {
    for (const e of visibleEnemies(s, 20)) hit(s, e, 45 * ultScale(s), "ult", { stun: 4, slow: 0.6, slowT: 6 });
    s.fx.push({ kind: "screen", ttl: 0.5, max: 0.5, color: "#9be7ff" });
  },
  whirl(s) { s.buffs.whirl = 6; },
  strike(s) {
    for (let i = 0; i < 14; i++) {
      s.zones.push({ kind: "meteor", x: s.cam.x + s.rng() * s.w, y: s.cam.y + s.rng() * s.h, delay: 0.4 + i * 0.08, max: 0.4 + i * 0.08, r: 90 * s.stats.area, dmg: 160 * ultScale(s), src: "ult", orbital: true });
    }
  },
  short(s) {
    const list = visibleEnemies(s, 20);
    const p = s.player;
    for (const e of list) hit(s, e, 80 * ultScale(s), "ult", { stun: 1 });
    if (list.length) s.fx.push({ kind: "chain", pts: [{ x: p.x, y: p.y }, ...list.slice(0, 40).map((e) => ({ x: e.x, y: e.y }))], ttl: 0.4, max: 0.4, color: "#7df9ff", seed: s.rng() });
  },
  judgement(s) {
    const pool = visibleEnemies(s, 20);
    for (let i = 0; i < 25; i++) {
      const e = pool.length ? pool[Math.floor(s.rng() * pool.length)] : null;
      const x = e ? e.x : s.cam.x + s.rng() * s.w;
      const y = e ? e.y : s.cam.y + s.rng() * s.h;
      hitArea(s, x, y, 50 * s.stats.area, 130 * ultScale(s), "ult", {});
      s.fx.push({ kind: "zap", x, y: y - 500, x2: x, y2: y, ttl: 0.35, max: 0.35, color: "#fcee0a", seed: s.rng() });
    }
    s.shake = 0.4;
  },
  plague(s) {
    for (const e of visibleEnemies(s, 20)) e.poison = { dps: 40 * ultScale(s), ttl: 6 };
    s.fx.push({ kind: "screen", ttl: 0.5, max: 0.5, color: "#3ddc84" });
  },
  sawstorm(s) {
    const p = s.player;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      s.shots.push({ kind: "saw", x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 26, dmg: 60 * ultScale(s), src: "ult", ttl: 6, hit: new Set(), pierce: 999, spin: 0 });
    }
  },
  orbital(s) {
    const p = s.player;
    for (let i = 0; i < 8; i++) railLine(s, p.x, p.y, (i / 8) * TAU, 1400, 26, 260 * ultScale(s), "ult", "#fcee0a");
    s.shake = 0.5;
  },
  buckshot(s) {
    const p = s.player;
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + k * 0.13;
        fireBullet(s, p.x, p.y, a, 520 + k * 40, 40 * ultScale(s), "ult", { kind: "pellet", ttl: 0.6, kb: 260, r: 4, color: "#ffd27a" });
      }
    }
  }
};
const ultScale = (s) => Math.max(1, hpMul(s) * 0.7) * (1 + s.level * 0.02);

export function useUlt(state) {
  if (state.over || state.choices || state.chest || state.ult < state.ultMax) return false;
  state.ult = 0;
  state.run.ults += 1;
  ULT_FIRE[charById(state.character).ult](state);
  state.msgs.push({ text: ULTS[charById(state.character).ult].name + " !", kind: "ult" });
  return true;
}

/* =====================================================================
   IA des ennemis et des boss
===================================================================== */

function moveToward(e, tx, ty, spd, dt) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d) * spd * dt;
  e.y += (dy / d) * spd * dt;
  return d;
}

function enemyAI(state, e, dt) {
  const def = ENEMY_DEFS[e.type];
  const pl = state.player;
  const lost = state.buffs.phase > 0;
  const tx = lost ? e.x + Math.cos(e.seed + state.time * 0.3) * 100 : pl.x;
  const ty = lost ? e.y + Math.sin(e.seed + state.time * 0.3) * 100 : pl.y;
  const slowK = e.slowT > 0 ? 1 - Math.min(0.85, e.slow) : 1;
  const spd = e.spd * slowK;
  const dist = Math.hypot(pl.x - e.x, pl.y - e.y);
  e.t -= dt;

  if (e.rush) {
    e.x += e.rush.vx * spd * 1.6 * dt;
    e.y += e.rush.vy * spd * 1.6 * dt;
    e.rush.ttl -= dt;
    if (e.rush.ttl <= 0) e.rush = null;
    return;
  }
  if (e.boss) { bossAI(state, e, dt, spd, dist, tx, ty); return; }

  switch (def.ai) {
    case "wave": {
      const a = Math.atan2(ty - e.y, tx - e.x);
      const wob = Math.sin(state.time * 5 + e.seed) * 0.9;
      e.x += Math.cos(a + wob) * spd * dt;
      e.y += Math.sin(a + wob) * spd * dt;
      break;
    }
    case "ranged": {
      if (dist > def.range * 0.85) moveToward(e, tx, ty, spd, dt);
      else if (dist < def.range * 0.5) moveToward(e, tx, ty, -spd * 0.6, dt);
      else { const a = Math.atan2(ty - e.y, tx - e.x) + Math.PI / 2; e.x += Math.cos(a) * spd * 0.4 * dt; e.y += Math.sin(a) * spd * 0.4 * dt; }
      if (e.t <= 0 && dist < def.range + 80 && !lost) {
        e.t = def.fire * (0.8 + state.rng() * 0.4);
        const b = def.bullet;
        const dm = b.dmg * dmgMul(state);
        if (def.burst) { e.burst = def.burst; e.bt = 0; }
        else aimBullets(state, e, 1, 0, b.spd, dm, b.color, { r: b.r, slow: b.slow });
      }
      if (e.burst) {
        e.bt -= dt;
        if (e.bt <= 0) { e.bt = 0.15; e.burst -= 1; aimBullets(state, e, 1, 0, def.bullet.spd, def.bullet.dmg * dmgMul(state), def.bullet.color, { r: def.bullet.r }); }
      }
      break;
    }
    case "dash": {
      if (e.st === 0) {
        moveToward(e, tx, ty, spd, dt);
        if (e.t <= 0 && dist < 320) { e.st = 1; e.t = 0.6; e.da = Math.atan2(pl.y - e.y, pl.x - e.x); state.warns.push({ kind: "line", x: e.x, y: e.y, a: e.da, len: 260, w: e.r, ttl: 0.6, max: 0.6, follow: e.id }); }
      } else if (e.st === 1) {
        if (e.t <= 0) { e.st = 2; e.t = 0.45; }
      } else {
        e.x += Math.cos(e.da) * e.spd * 6 * dt;
        e.y += Math.sin(e.da) * e.spd * 6 * dt;
        if (e.t <= 0) { e.st = 0; e.t = 2 + state.rng(); }
      }
      break;
    }
    case "kamikaze": {
      if (e.st === 0) {
        moveToward(e, tx, ty, spd, dt);
        if (dist < 44 && !lost) { e.st = 1; e.t = 0.5; }
      } else if (e.t <= 0) {
        const b = def.boom;
        if (dist < b.r + PLAYER_R) hurt(state, b.dmg * dmgMul(state), { src: "bomber" });
        state.fx.push({ kind: "blast", x: e.x, y: e.y, r: b.r, ttl: 0.35, max: 0.35, color: "#ff8a3d" });
        e.selfBoom = true;
        e.dead = true;   // explosion volontaire : ni expérience ni butin
      }
      break;
    }
    case "support": {
      if (dist > 170) moveToward(e, tx, ty, spd, dt);
      else moveToward(e, tx, ty, -spd * 0.3, dt);
      if (def.heal && e.t <= 0) {
        e.t = 1.2;
        around(state, e.x, e.y, 120, (o) => { if (o !== e && !o.boss && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.08); o.healFx = 0.3; } });
        state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 120, ttl: 0.3, max: 0.3, color: "#7dffb0" });
      }
      break;
    }
    case "phase": {
      const cyc = (state.time + e.seed) % 4.2;
      e.phase = cyc > 3;
      moveToward(e, tx, ty, e.phase ? spd * 1.4 : spd, dt);
      break;
    }
    case "blink": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0 && !lost) {
        if (!e.bl) {
          const a = state.rng() * TAU;
          const r = 70 + state.rng() * 50;
          e.bl = { x: clamp(pl.x + Math.cos(a) * r, 20, state.world.w - 20), y: clamp(pl.y + Math.sin(a) * r, 20, state.world.h - 20) };
          e.t = 0.45;
          state.warns.push({ kind: "circle", x: e.bl.x, y: e.bl.y, r: e.r + 6, ttl: 0.45, max: 0.45, color: "#00f0ff" });
        } else {
          state.fx.push({ kind: "pop", x: e.x, y: e.y, r: e.r, color: "#00f0ff", ttl: 0.25, max: 0.25 });
          e.x = e.bl.x; e.y = e.bl.y; e.bl = null; e.t = 3.2 + state.rng();
        }
      }
      break;
    }
    case "summon": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        e.t = 4;
        for (let i = 0; i < 3 && state.enemies.length < MAX_ENEMIES; i++) makeEnemy(state, def.spawn, e.x + (state.rng() - 0.5) * 30, e.y + (state.rng() - 0.5) * 30);
      }
      break;
    }
    case "sniper": {
      if (dist > 380) moveToward(e, tx, ty, spd, dt);
      else if (dist < 260) moveToward(e, tx, ty, -spd, dt);
      if (e.st === 0 && e.t <= 0 && dist < 460 && !lost) {
        e.st = 1; e.t = 1.1;
        e.aim = Math.atan2(pl.y - e.y, pl.x - e.x);
        e.warn = { kind: "line", x: e.x, y: e.y, a: e.aim, len: 700, w: 2, ttl: 1.1, max: 1.1, follow: e.id, color: "#ff2a2a", track: true };
        state.warns.push(e.warn);
      } else if (e.st === 1) {
        if (e.t > 0.25) { e.aim = Math.atan2(pl.y - e.y, pl.x - e.x); if (e.warn) e.warn.a = e.aim; }
        if (e.t <= 0) {
          e.st = 0; e.t = 3.5 + state.rng();
          state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(e.aim) * 680, vy: Math.sin(e.aim) * 680, r: 4, dmg: 22 * dmgMul(state), ttl: 1.5, color: "#ff2a2a", fast: true, src: "sniper" });
        }
      }
      break;
    }
    case "layer": {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x) + 0.8;
      const ox = pl.x + Math.cos(a) * 170;
      const oy = pl.y + Math.sin(a) * 170;
      moveToward(e, ox, oy, spd, dt);
      if (e.t <= 0) {
        e.t = 2.4;
        if (state.emines.length < 40) state.emines.push({ x: e.x, y: e.y, arm: 0.9, r: 50, dmg: 16 * dmgMul(state), ttl: 18, src: "layer" });
      }
      break;
    }
    case "orbit": {
      if (e.st === 0) {
        const a = Math.atan2(e.y - pl.y, e.x - pl.x) + 0.5;
        const R = 150;
        moveToward(e, pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R, spd * 1.2, dt);
        if (e.t <= 0) { e.st = 1; e.t = 1.4; }
      } else {
        moveToward(e, tx, ty, spd * 1.5, dt);
        if (e.t <= 0) { e.st = 0; e.t = 2.5 + state.rng(); }
      }
      break;
    }
    case "flee": {
      moveToward(e, tx, ty, -spd, dt);
      e.fleeT -= dt;
      if (e.fleeT <= 0) { e.dead = true; e.gone = true; state.msgs.push({ text: "Le voleur s'est enfui…", kind: "event" }); }
      break;
    }
    default:
      moveToward(e, tx, ty, spd, dt);
  }
  if (def.regen) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.regen * dt);
  if (e.elite === "vampiric") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
  if (e.elite === "summoner") {
    e.sum = (e.sum ?? 3) - dt;
    if (e.sum <= 0) { e.sum = 4; for (let i = 0; i < 2 && state.enemies.length < MAX_ENEMIES; i++) makeEnemy(state, "grunt", e.x + (i ? 16 : -16), e.y); }
  }
}

function bossAI(state, e, dt, spd, dist, tx, ty) {
  const def = ENEMY_DEFS[e.type];
  const pl = state.player;
  const ratio = e.hp / e.maxHp;
  const phase2 = ratio < 0.5;
  const bdm = e.dmg * 0.55;
  let pattern = def.boss;
  if (e.decoy) pattern = "teleport";
  if (pattern === "final") {
    const ph = ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
    if (ph !== e.fph) { e.fph = ph; state.msgs.push({ text: `Blackwall — phase ${ph + 1}`, kind: "boss" }); e.t = 1; e.st = 0; }
    pattern = ["rings", "lasers", "barrage", "teleport"][ph];
    if (ph === 3) { e.t2 = (e.t2 ?? 2) - dt; if (e.t2 <= 0) { e.t2 = 2.2; ringBullets(state, e.x, e.y, 20, 150, bdm, "#ff2a2a", state.time); } }
  }
  switch (pattern) {
    case "rings": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        e.t = phase2 ? 1.8 : 2.8;
        ringBullets(state, e.x, e.y, phase2 ? 24 : 16, 140, bdm, "#ffffff", e.sa);
        e.sa += 0.2;
        if (phase2) { e.spiral = 10; }
      }
      if (e.spiral) {
        e.st2 = (e.st2 || 0) - dt;
        if (e.st2 <= 0) { e.st2 = 0.08; e.spiral -= 1; e.sa += 0.45; ringBullets(state, e.x, e.y, 3, 170, bdm * 0.8, "#ff6ad5", e.sa, 4); }
      }
      break;
    }
    case "summon": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        e.t = phase2 ? 3.5 : 5;
        for (let i = 0; i < (phase2 ? 6 : 4) && state.enemies.length < MAX_ENEMIES; i++) makeEnemy(state, state.rng() < 0.5 ? "grunt" : "stalker", e.x + (state.rng() - 0.5) * 60, e.y + (state.rng() - 0.5) * 60);
      }
      e.t2 = (e.t2 ?? 1.5) - dt;
      if (e.t2 <= 0) { e.t2 = phase2 ? 1.4 : 2.2; aimBullets(state, e, phase2 ? 5 : 3, 0.22, 190, bdm, "#ff8a3d"); }
      break;
    }
    case "charge": {
      if (e.st === 0) {
        moveToward(e, tx, ty, spd, dt);
        if (e.t <= 0) { e.st = 1; e.t = phase2 ? 0.6 : 0.85; e.da = Math.atan2(pl.y - e.y, pl.x - e.x); state.warns.push({ kind: "line", x: e.x, y: e.y, a: e.da, len: 520, w: e.r, ttl: e.t, max: e.t, follow: e.id, color: "#ff3b5c" }); }
      } else if (e.st === 1) {
        if (e.t <= 0) { e.st = 2; e.t = 0.7; }
      } else {
        e.x += Math.cos(e.da) * 640 * dt;
        e.y += Math.sin(e.da) * 640 * dt;
        if (e.t <= 0) {
          e.st = 0; e.t = phase2 ? 1.6 : 2.6;
          ringBullets(state, e.x, e.y, phase2 ? 18 : 12, 160, bdm, "#ff3b5c", state.rng());
          state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 90, ttl: 0.4, max: 0.4, color: "#ff3b5c" });
          state.shake = Math.max(state.shake, 0.25);
        }
      }
      break;
    }
    case "hydra": {
      moveToward(e, tx, ty, spd * (1 + e.gen * 0.25), dt);
      if (e.t <= 0) { e.t = 2 - e.gen * 0.3; aimBullets(state, e, 3, 0.3, 180, bdm, "#3ddc84"); }
      break;
    }
    case "lasers": {
      moveToward(e, tx, ty, spd * 0.7, dt);
      const n = phase2 ? 4 : 2;
      e.la = (e.la || 0) + dt * (phase2 ? 0.75 : 0.55);
      e.lt = (e.lt ?? 0) + dt;
      const cycle = e.lt % 7;
      const active = cycle > 1.5 && cycle < 5.5;
      e.lasers = { n, a: e.la, len: 620, active, warm: cycle <= 1.5 };
      if (active) {
        for (let i = 0; i < n; i++) {
          const a = e.la + (i * TAU) / n;
          const ux = Math.cos(a), uy = Math.sin(a);
          const px = pl.x - e.x, py = pl.y - e.y;
          const along = px * ux + py * uy;
          if (along > 0 && along < 620 && Math.abs(px * uy - py * ux) < 10 + PLAYER_R) hurt(state, bdm * 1.2);
        }
      }
      if (e.t <= 0) { e.t = 3; for (let i = 0; i < 2 && state.enemies.length < MAX_ENEMIES; i++) makeEnemy(state, "gunner", e.x + (i ? 40 : -40), e.y); }
      break;
    }
    case "queen": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        e.t = phase2 ? 2.2 : 3;
        for (let i = 0; i < (phase2 ? 9 : 6) && state.enemies.length < MAX_ENEMIES; i++) makeEnemy(state, "swarm", e.x + (state.rng() - 0.5) * 50, e.y + (state.rng() - 0.5) * 50);
      }
      e.t2 = (e.t2 ?? 2) - dt;
      if (e.t2 <= 0) {
        e.t2 = phase2 ? 1.3 : 2;
        const x = pl.x + (state.rng() - 0.5) * 60;
        const y = pl.y + (state.rng() - 0.5) * 60;
        state.warns.push({ kind: "circle", x, y, r: 55, ttl: 0.9, max: 0.9, color: "#d4ff3a", then: { kind: "acid", dps: 14 * dmgMul(state), ttl: 6, src: e.type } });
      }
      break;
    }
    case "teleport": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        if (!e.bl) {
          const a = state.rng() * TAU;
          e.bl = { x: clamp(pl.x + Math.cos(a) * 180, 40, state.world.w - 40), y: clamp(pl.y + Math.sin(a) * 180, 40, state.world.h - 40) };
          e.t = 0.6;
          state.warns.push({ kind: "circle", x: e.bl.x, y: e.bl.y, r: e.r + 10, ttl: 0.6, max: 0.6, color: "#c9b8ff" });
        } else {
          state.fx.push({ kind: "pop", x: e.x, y: e.y, r: e.r * 1.4, color: "#c9b8ff", ttl: 0.3, max: 0.3 });
          e.x = e.bl.x; e.y = e.bl.y; e.bl = null; e.t = phase2 ? 2.2 : 3.2;
          aimBullets(state, e, phase2 ? 10 : 6, 0.5, 120, bdm, "#c9b8ff", { homing: 1.6, ttl: 5 });
          if (phase2 && !e.decoy && state.enemies.filter((x) => x.decoy && !x.dead).length < 4) {
            for (let i = 0; i < 2; i++) makeEnemy(state, e.type === "blackwall" ? "netghost" : e.type, e.x + (i ? 50 : -50), e.y, { decoy: true });
          }
        }
      }
      break;
    }
    case "barrage": {
      moveToward(e, tx, ty, spd, dt);
      if (e.t <= 0) {
        e.t = phase2 ? 2.8 : 4;
        const n = phase2 ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + state.rng();
          const r = 30 + state.rng() * 150;
          const x = clamp(pl.x + Math.cos(a) * r, 0, state.world.w);
          const y = clamp(pl.y + Math.sin(a) * r, 0, state.world.h);
          state.warns.push({ kind: "circle", x, y, r: 48, ttl: 1.1, max: 1.1, color: "#ff8a3d", then: { kind: "blast", dmg: bdm * 1.4, src: e.type } });
        }
      }
      e.t2 = (e.t2 ?? 2.5) - dt;
      if (e.t2 <= 0) { e.t2 = phase2 ? 1.6 : 2.5; aimBullets(state, e, 5, 0.18, 220, bdm, "#ff8a3d"); }
      if (dist < e.r + 60) {
        e.t3 = (e.t3 ?? 0) - dt;
        if (e.t3 <= 0) { e.t3 = 2; ringBullets(state, e.x, e.y, 16, 200, bdm, "#8a8fa8"); state.fx.push({ kind: "ring", x: e.x, y: e.y, r: 110, ttl: 0.4, max: 0.4, color: "#8a8fa8" }); }
      }
      break;
    }
    default:
      moveToward(e, tx, ty, spd, dt);
  }
  if (pattern !== "lasers") e.lasers = null;
  if (e.decoy) { e.age += dt; if (e.age > 12) { e.dead = true; e.gone = true; } }
}

/* =====================================================================
   Pas de simulation
   input : { dx, dy } entre -1 et 1. Renvoie { levelUp, over, chest, revived }.
===================================================================== */

export function update(state, dt, input = { dx: 0, dy: 0 }) {
  const events = { levelUp: false, over: false, chest: false, revived: false };
  if (state.over || state.choices || state.chest) return events;
  const { player: pl, stats: st, buffs } = state;
  state.time += dt;
  for (const k of Object.keys(buffs)) if (buffs[k] > 0) buffs[k] = Math.max(0, buffs[k] - dt);
  state.shake = Math.max(0, state.shake - dt);

  /* ----- Joueur ----- */
  let { dx, dy } = input;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  if (len > 0.05) { const l = Math.hypot(dx, dy) || 1; pl.fx = dx / l; pl.fy = dy / l; }
  let speed = st.speed * (buffs.sprint > 0 ? 1.8 : 1) * (pl.slowT > 0 ? 0.6 : 1);
  pl.slowT = Math.max(0, pl.slowT - dt);
  if (state.map.inertia) {
    const k = Math.min(1, dt * 3.2);
    pl.vx += (dx * speed - pl.vx) * k;
    pl.vy += (dy * speed - pl.vy) * k;
  } else {
    pl.vx = dx * speed;
    pl.vy = dy * speed;
  }
  pl.x = clamp(pl.x + pl.vx * dt, PLAYER_R, state.world.w - PLAYER_R);
  pl.y = clamp(pl.y + pl.vy * dt, PLAYER_R, state.world.h - PLAYER_R);
  pushOut(state, pl, PLAYER_R);
  pl.inv = Math.max(0, pl.inv - dt);
  pl.hurtT = Math.max(0, pl.hurtT - dt);
  pl.hp = Math.min(st.maxHp, pl.hp + st.regen * dt);
  updateCamera(state);

  // Dangers au sol (acide)
  for (const z of state.hazards) {
    if (z.ttl !== Infinity) z.ttl -= dt;
    if (d2(pl, z) < (z.r * 0.92) ** 2) hurt(state, z.dps * dt * (1 + effTime(state) / 900), { dot: true, src: z.src || "acid" });
  }
  state.hazards = state.hazards.filter((z) => z.ttl > 0);

  // Caisses de ravitaillement
  for (const p of state.props) {
    if (p.broken > 0) { p.broken -= dt; continue; }
    if (d2(pl, p) < (p.r + PLAYER_R + 2) ** 2) {
      p.broken = 45;
      const r = state.rng() * state.stats.luck;
      const kind = r > 0.95 ? "chest" : r > 0.7 ? "core" : r > 0.5 ? "heart" : r > 0.35 ? "magnet" : r > 0.2 ? "bomb" : r > 0.1 ? "clock" : "core";
      dropItem(state, kind, p.x, p.y - 4);
      state.fx.push({ kind: "pop", x: p.x, y: p.y, r: 12, color: "#c8a060", ttl: 0.3, max: 0.3 });
    }
  }

  /* ----- Apparitions ----- */
  spawning(state, dt);
  buildGrid(state);

  // Bastions : bouclier sur leurs voisins
  for (const e of state.enemies) e.shielded = false;
  for (const e of state.enemies) {
    if (e.dead || !ENEMY_DEFS[e.type].shield) continue;
    around(state, e.x, e.y, 110, (o) => { if (o !== e) o.shielded = true; });
  }

  /* ----- Armes ----- */
  for (const w of state.weapons) TICK[w.id](state, w, dt, params(state, w));

  // Ultimes à durée
  if (buffs.barrage > 0) {
    state.bar = (state.bar || 0) - dt;
    if (state.bar <= 0) { state.bar = 0.035; const a = state.time * 9; for (let i = 0; i < 3; i++) fireBullet(state, pl.x, pl.y, a + (i * TAU) / 3, 520, 26 * ultScale(state), "ult", { pierce: 2, color: "#ffb000" }); }
  }
  if (buffs.sprint > 0) {
    around(state, pl.x, pl.y, PLAYER_R + 6, (e) => { if (canHit(state, e, "sprint", 0.3)) hit(state, e, 50 * ultScale(state), "ult", { kb: 300 }); });
  }
  if (buffs.inferno > 0) {
    const R = 210 * st.area;
    around(state, pl.x, pl.y, R, (e) => {
      if (Math.hypot(e.x - pl.x, e.y - pl.y) > R - 50 && canHit(state, e, "inferno", 0.25)) hit(state, e, 30 * ultScale(state), "ult", { noCrit: true });
    });
  }
  if (buffs.whirl > 0) {
    for (let i = 0; i < 6; i++) {
      const a = state.time * 4 + (i * TAU) / 6;
      const R = 110 + Math.sin(state.time * 2) * 30;
      around(state, pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R, 22, (e) => { if (canHit(state, e, "whirl", 0.2)) hit(state, e, 32 * ultScale(state), "ult", { kb: 200 }); });
    }
  }

  /* ----- Projectiles du joueur ----- */
  for (const s of state.shots) {
    s.ttl -= dt;
    if (s.kind === "missile") {
      let target = state.enemies.find((e) => e.id === s.target && !e.dead);
      if (!target) { target = nearestEnemy(state, s, 320); if (target) s.target = target.id; }
      if (target) {
        const a = Math.atan2(target.y - s.y, target.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        let diff = a - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = cur + clamp(diff, -6 * dt, 6 * dt);
        const v = 320 * st.velocity;
        s.vx = Math.cos(turn) * v;
        s.vy = Math.sin(turn) * v;
      }
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.shift();
    } else if (s.kind === "disc") {
      s.spin += dt * 14;
      if (!s.back) {
        s.out -= Math.hypot(s.vx, s.vy) * dt;
        if (s.out <= 0) { s.back = true; s.hit.clear(); }
      } else {
        const a = Math.atan2(pl.y - s.y, pl.x - s.x);
        const v = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(a) * v * 1.02;
        s.vy = Math.sin(a) * v * 1.02;
        if (d2(s, pl) < 18 * 18) s.ttl = 0;
      }
    } else if (s.kind === "saw") {
      s.spin += dt * 18;
      const c = state.cam;
      if (s.x < c.x + s.r || s.x > c.x + state.w - s.r) { s.vx = -s.vx; s.x = clamp(s.x, c.x + s.r, c.x + state.w - s.r); s.hit.clear(); }
      if (s.y < c.y + s.r || s.y > c.y + state.h - s.r) { s.vy = -s.vy; s.y = clamp(s.y, c.y + s.r, c.y + state.h - s.r); s.hit.clear(); }
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.kind !== "saw" && s.kind !== "disc" && !inView(state, s.x, s.y, 120)) s.ttl = 0;
    if (s.ttl <= 0) continue;
    const multi = s.kind === "disc" || s.kind === "saw";
    around(state, s.x, s.y, s.r, (e) => {
      if (s.hit.has(e.id)) return true;
      s.hit.add(e.id);
      if (s.kind === "missile") { s.ttl = 0; return false; }
      hit(state, e, s.dmg, s.src, { kb: s.kb, fx: s.x - s.vx * 0.02, fy: s.y - s.vy * 0.02 });
      if (s.boom) { hitArea(state, s.x, s.y, s.boom, s.dmg * 0.6, s.src, { noCrit: true }); state.fx.push({ kind: "blast", x: s.x, y: s.y, r: s.boom, ttl: 0.18, max: 0.18, color: "#ffd27a" }); }
      if (multi) return true;
      if (s.pierce <= 0) { s.ttl = 0; return false; }
      s.pierce -= 1;
      return true;
    });
    if (s.kind === "missile" && s.ttl <= 0) {
      hitArea(state, s.x, s.y, s.boom, s.dmg, "missiles", {});
      state.fx.push({ kind: "blast", x: s.x, y: s.y, r: s.boom, ttl: 0.3, max: 0.3, color: "#ff8a3d" });
    }
  }
  state.shots = state.shots.filter((s) => s.ttl > 0);

  /* ----- Mines du joueur ----- */
  for (const m of state.pmines) {
    m.arm -= dt;
    m.ttl -= dt;
    if (m.arm > 0) continue;
    let trig = false;
    around(state, m.x, m.y, 18, () => { trig = true; return false; });
    if (trig || m.ttl <= 0) {
      m.done = true;
      hitArea(state, m.x, m.y, m.r, m.dmg, "mines", { kb: 200 });
      state.fx.push({ kind: "blast", x: m.x, y: m.y, r: m.r, ttl: 0.3, max: 0.3, color: m.big ? "#ff2a6d" : "#ff8a3d" });
    }
  }
  state.pmines = state.pmines.filter((m) => !m.done);

  /* ----- Zones du joueur ----- */
  for (const z of state.zones) {
    if (z.kind === "meteor") {
      z.delay -= dt;
      if (z.delay <= 0) {
        z.done = true;
        hitArea(state, z.x, z.y, z.r, z.dmg, z.src, { kb: 160 });
        state.fx.push({ kind: "blast", x: z.x, y: z.y, r: z.r, ttl: 0.4, max: 0.4, color: z.orbital ? "#00f0ff" : "#fcee0a" });
        state.shake = Math.max(state.shake, 0.12);
        if (z.lava) state.zones.push({ kind: "fire", x: z.x, y: z.y, ttl: 3, max: 3, r: z.r * 0.7, dps: z.dmg * 0.25, src: "meteor", tick: 0, lava: true });
      }
    } else if (z.kind === "fire" || z.kind === "poison" || z.kind === "hole") {
      if (z.delay > 0) { z.delay -= dt; continue; }
      z.ttl -= dt;
      if (z.follow) { z.x += (pl.x - z.x) * Math.min(1, dt * 2); z.y += (pl.y - z.y) * Math.min(1, dt * 2); }
      if (z.kind === "hole") {
        const pull = z.r * 1.8;
        around(state, z.x, z.y, pull, (e) => {
          const d = Math.hypot(z.x - e.x, z.y - e.y) || 1;
          const v = (e.boss ? 25 : 110) * dt;
          e.x += ((z.x - e.x) / d) * Math.min(v, d);
          e.y += ((z.y - e.y) / d) * Math.min(v, d);
        });
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        const r = z.kind === "hole" ? z.r * 0.6 : z.r;
        hitArea(state, z.x, z.y, r, z.dps * 0.25, z.src, { noCrit: true, slow: z.slow || 0, slowT: 0.5 });
      }
    }
  }
  state.zones = state.zones.filter((z) => !z.done && (z.kind === "meteor" || z.ttl > 0));

  /* ----- Ennemis ----- */
  const viewR = Math.hypot(state.w, state.h) * 0.75 + 120;
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slowT > 0) e.slowT -= dt;
    if (e.poison) {
      e.poison.ttl -= dt;
      e.pt = (e.pt || 0) - dt;
      if (e.pt <= 0) { e.pt = 0.5; hit(state, e, e.poison.dps * 0.5, "ult", { noCrit: true }); }
      if (e.poison.ttl <= 0) e.poison = null;
      if (e.dead) continue;
    }
    if (buffs.freeze > 0 && !e.boss) { e.stun = Math.max(e.stun, 0.05); }
    const ox = e.x;
    const oy = e.y;
    state.curSrc = e.type;
    if (e.stun > 0) e.stun -= dt;
    else enemyAI(state, e, dt);
    if (e.dead) continue;
    // recul
    e.x += e.kx * dt;
    e.y += e.ky * dt;
    const damp = Math.pow(0.0015, dt);
    e.kx *= damp;
    e.ky *= damp;
    // séparation (évite que tout s'empile en un seul point)
    if (!e.boss) {
      let n = 0;
      around(state, e.x, e.y, e.r * 0.6, (o) => {
        if (o === e || o.boss) return true;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const dd = Math.hypot(dx, dy) || 0.01;
        const min = (e.r + o.r) * 0.8;
        if (dd < min) { const push = (min - dd) * 0.35; e.x += (dx / dd) * push; e.y += (dy / dd) * push; }
        return ++n < 5;
      });
    }
    if (!e.phase && !ENEMY_DEFS[e.type].ghost) pushOut(state, e, e.r * 0.9);
    e.x = clamp(e.x, e.r, state.world.w - e.r);
    e.y = clamp(e.y, e.r, state.world.h - e.r);
    e.mvx = (e.x - ox) / dt;
    e.mvy = (e.y - oy) / dt;
    // contact
    if (!e.phase && e.dmg > 0) {
      const rr = e.r + PLAYER_R - 2;
      if (d2(pl, e) < rr * rr) {
        hurt(state, e.dmg, { src: e.type });
        if (ENEMY_DEFS[e.type].leech) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25);
      }
    }
    // trop loin : on le replace près du joueur
    if (!e.boss && !e.rush && !e.elite && e.type !== "thief" && d2(pl, e) > viewR * viewR) {
      const p = spawnPoint(state);
      e.x = p.x; e.y = p.y;
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead);
  if (state.bossId && !state.enemies.some((e) => e.id === state.bossId)) {
    const nb = state.enemies.find((e) => e.boss && !e.decoy);
    state.bossId = nb ? nb.id : 0;
  }

  /* ----- Projectiles, mines et télégraphes ennemis ----- */
  for (const b of state.ebullets) {
    b.ttl -= dt;
    if (b.homing) {
      b.homing -= dt;
      const a = Math.atan2(pl.y - b.y, pl.x - b.x);
      const cur = Math.atan2(b.vy, b.vx);
      let diff = a - cur;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const v = Math.hypot(b.vx, b.vy);
      const t = cur + clamp(diff, -2 * dt, 2 * dt);
      b.vx = Math.cos(t) * v; b.vy = Math.sin(t) * v;
      if (b.homing <= 0) b.homing = 0;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (d2(b, pl) < (b.r + PLAYER_R - 2) ** 2) {
      hurt(state, b.dmg, { src: b.src });
      if (b.slow) pl.slowT = 1.6;
      b.ttl = 0;
    }
  }
  state.ebullets = state.ebullets.filter((b) => b.ttl > 0 && inView(state, b.x, b.y, 300));
  if (state.ebullets.length > 400) state.ebullets.splice(0, state.ebullets.length - 400);

  for (const m of state.emines) {
    m.arm -= dt;
    m.ttl -= dt;
    if (m.arm <= 0 && (d2(m, pl) < 22 * 22 || m.ttl <= 0)) {
      m.done = true;
      if (d2(m, pl) < (m.r + PLAYER_R) ** 2) hurt(state, m.dmg, { src: m.src });
      state.fx.push({ kind: "blast", x: m.x, y: m.y, r: m.r, ttl: 0.3, max: 0.3, color: "#ffd27a" });
    }
  }
  state.emines = state.emines.filter((m) => !m.done);

  for (const wn of state.warns) {
    wn.ttl -= dt;
    if (wn.follow) {
      const e = state.enemies.find((x) => x.id === wn.follow);
      if (e) { wn.x = e.x; wn.y = e.y; } else wn.ttl = 0;
    }
    if (wn.ttl <= 0 && wn.then) {
      if (wn.then.kind === "blast") {
        if (d2(wn, pl) < (wn.r + PLAYER_R) ** 2) hurt(state, wn.then.dmg, { src: wn.then.src });
        state.fx.push({ kind: "blast", x: wn.x, y: wn.y, r: wn.r, ttl: 0.3, max: 0.3, color: wn.color });
      } else if (wn.then.kind === "acid") {
        state.hazards.push({ kind: "acid", x: wn.x, y: wn.y, r: wn.r, dps: wn.then.dps, ttl: wn.then.ttl, phase: 0, src: wn.then.src });
      }
    }
  }
  state.warns = state.warns.filter((w) => w.ttl > 0);

  /* ----- Ramassage ----- */
  const magnet = st.magnet;
  const gemCount = state.gems.length;
  for (const g of state.gems) {
    const dd = d2(pl, g);
    if (g.pull || dd < magnet * magnet) {
      g.pull = true;
      const d = Math.sqrt(dd) || 1;
      const v = Math.max(300, d * 4) * dt;
      g.x += ((pl.x - g.x) / d) * Math.min(v, d);
      g.y += ((pl.y - g.y) / d) * Math.min(v, d);
    }
    if (d2(pl, g) < (PLAYER_R + 6) ** 2) {
      g.taken = true;
      state.xp += g.v * st.growth * (buffs.xpboost > 0 ? 1.5 : 1);
      state.run.gems += 1;
    }
  }
  state.gems = state.gems.filter((g) => !g.taken);
  // trop de gemmes : les plus anciennes fusionnent en une grosse gemme rouge
  if (gemCount > 450) {
    const old = state.gems.splice(0, 80);
    const v = old.reduce((a, g) => a + g.v, 0);
    state.gems.push({ x: old[0].x, y: old[0].y, v, pull: false });
  }

  for (const it of state.items) {
    it.t += dt;
    const dd = d2(pl, it);
    if (it.kind !== "chest" && it.kind !== "bigchest" && dd < (magnet * 0.6) ** 2) {
      const d = Math.sqrt(dd) || 1;
      it.x += ((pl.x - it.x) / d) * Math.min(260 * dt, d);
      it.y += ((pl.y - it.y) / d) * Math.min(260 * dt, d);
    }
    if (d2(pl, it) < (PLAYER_R + 12) ** 2) {
      it.taken = true;
      pickItem(state, it, events);
    }
  }
  state.items = state.items.filter((it) => !it.taken);

  /* ----- Niveaux ----- */
  while (state.xp >= xpNeeded(state.level)) {
    state.xp -= xpNeeded(state.level);
    state.level += 1;
    state.pending += 1;
    events.levelUp = true;
  }
  if (state.pending > 0 && !state.choices && !state.chest) state.choices = rollChoices(state);

  /* ----- Effets ----- */
  for (const f of state.fx) f.ttl -= dt;
  state.fx = state.fx.filter((f) => f.ttl > 0);
  if (state.fx.length > 260) state.fx.splice(0, state.fx.length - 260);
  for (const n of state.numbers) { n.ttl -= dt; n.y -= 30 * dt; }
  state.numbers = state.numbers.filter((n) => n.ttl > 0);

  /* ----- Mort / résurrection ----- */
  if (pl.hp <= 0) {
    if (state.revives > 0) {
      state.revives -= 1;
      pl.hp = st.maxHp * 0.5;
      buffs.inv = 3;
      hitArea(state, pl.x, pl.y, 260, 999999, "revive", { kb: 600, noCrit: true });
      state.fx.push({ kind: "ring", x: pl.x, y: pl.y, r: 260, ttl: 0.6, max: 0.6, color: "#3ddc84", thick: 8 });
      state.msgs.push({ text: "Résurrection !", kind: "win" });
      events.revived = true;
    } else {
      pl.hp = 0;
      state.over = true;
      events.over = true;
    }
  }
  return events;
}

function pickItem(state, it, events) {
  const pl = state.player;
  switch (it.kind) {
    case "heart": pl.hp = Math.min(state.stats.maxHp, pl.hp + 30); break;
    case "magnet": for (const g of state.gems) g.pull = true; break;
    case "bomb":
      for (const e of visibleEnemies(state, 20)) {
        if (e.boss) hit(state, e, e.maxHp * 0.05 / state.stats.might, "bomb", { noCrit: true });
        else { state.run.dmgBy.bomb = (state.run.dmgBy.bomb || 0) + e.hp; kill(state, e, "bomb"); }
      }
      state.fx.push({ kind: "screen", ttl: 0.4, max: 0.4, color: "#ffffff" });
      state.shake = 0.4;
      break;
    case "clock": state.buffs.freeze = 6; state.msgs.push({ text: "Temps figé !", kind: "event" }); break;
    case "core": state.run.cores += 1; break;
    case "chest": openChest(state, false); events.chest = true; break;
    case "bigchest": openChest(state, true); events.chest = true; break;
    default: break;
  }
}

/* =====================================================================
   Fin de partie : récompenses et mise à jour de la sauvegarde
===================================================================== */

export const rewardMult = (state) => state.map.reward * state.heatK.reward * state.stats.greed;

export function creditsFor(state) {
  const r = state.run;
  return Math.floor((state.kills / 4 + state.time / 10 + r.bosses * 40 + r.elites * 10) * rewardMult(state));
}
export function coinsFor(state) {
  return Math.floor(state.time / SECONDS_PER_COIN) + (state.run.blackwall ? 3 : 0);
}
export function coresFor(state) {
  const r = state.run;
  return Math.floor((state.time / 20 + r.bosses * 6 + r.elites * 2 + r.cores) * rewardMult(state));
}

// Met à jour la sauvegarde (sv) avec la partie terminée. Renvoie ce qui a changé.
export function applyRun(sv, state) {
  const out = { cores: coresFor(state), record: false, heatUp: false, unlockedMaps: [], challenges: [] };
  const before = { maps: MAP_IDS.filter((id) => mapUnlocked(sv, id)), chars: CHARACTERS.filter((c) => c.challenge && challengeMet(sv, c)).map((c) => c.id) };
  const t = Math.floor(state.time);
  const s = sv.stats;
  s.runs += 1;
  s.kills += state.run.kills;
  s.time += t;
  s.bosses += state.run.bosses;
  s.elites += state.run.elites;
  s.gems += state.run.gems;
  s.evos += state.run.evos;
  s.maxLevel = Math.max(s.maxLevel, state.level);
  s.bestTime = Math.max(s.bestTime, t);
  s.bestRunKills = Math.max(s.bestRunKills, state.run.kills);
  if (state.run.blackwall) s.blackwall += 1;
  if (t > (sv.best[state.mapId] || 0)) { sv.best[state.mapId] = t; out.record = true; }
  if (t >= 600 && state.heat >= sv.heat && sv.heat < HEAT_MAX) { sv.heat = state.heat + 1; out.heatUp = true; }
  for (const [id, n] of Object.entries(state.run.codex)) if (n > 0) sv.codex[id] = (sv.codex[id] || 0) + n;
  for (const w of state.weapons) {
    if (!sv.seenW.includes(w.id)) sv.seenW.push(w.id);
    if (w.evo && !sv.seenE.includes(w.id)) sv.seenE.push(w.id);
  }
  sv.cores = Math.min(1e15, sv.cores + out.cores);
  sv.last = { char: state.character, map: state.mapId, heat: state.heat };
  out.unlockedMaps = MAP_IDS.filter((id) => mapUnlocked(sv, id) && !before.maps.includes(id));
  out.challenges = CHARACTERS.filter((c) => c.challenge && challengeMet(sv, c) && !before.chars.includes(c.id)).map((c) => c.id);
  return out;
}

// Achat d'un implant (modifie sv). Renvoie false si impossible.
export function buyImplant(sv, id) {
  const m = IMPLANTS.find((x) => x.id === id);
  if (!m) return false;
  const rank = sv.implants[id] || 0;
  if (rank >= m.max) return false;
  const cost = implantCost(id, rank);
  if (sv.cores < cost) return false;
  sv.cores -= cost;
  sv.implants[id] = rank + 1;
  return true;
}

// Rembourse tous les implants (pour redistribuer)
export function refundImplants(sv) {
  let total = 0;
  for (const m of IMPLANTS) {
    for (let r = 0; r < (sv.implants[m.id] || 0); r++) total += implantCost(m.id, r);
    sv.implants[m.id] = 0;
  }
  sv.cores += total;
  return total;
}

// Statistiques lisibles du joueur (pour l'interface)
export function statSheet(state) {
  const s = state.stats;
  const pct = (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)} %`;
  return [
    ["PV max", String(s.maxHp)], ["Régénération", `${s.regen.toFixed(1).replace(".", ",")}/s`], ["Armure", `−${Math.round(s.armor * 100)} %`],
    ["Vitesse", String(Math.round(s.speed))], ["Dégâts", pct(s.might - 1)], ["Recharge", pct(s.haste - 1)],
    ["Zone", pct(s.area - 1)], ["Durée", pct(s.duration - 1)], ["Projectiles", `+${s.amount}`],
    ["Critiques", `${Math.round(s.crit * 100)} % ×${String(s.critMult).replace(".", ",")}`], ["Aimant", String(Math.round(s.magnet))],
    ["Expérience", pct(s.growth - 1)], ["Chance", pct(s.luck - 1)], ["Avidité", pct(s.greed - 1)]
  ];
}

export const SOURCE_NAMES = {
  ...Object.fromEntries(WEAPON_IDS.map((id) => [id, WEAPONS[id].name])),
  ult: "Ultime", bomb: "Bombe", kamikaze: "Kamikazes abattus", revive: "Résurrection"
};
