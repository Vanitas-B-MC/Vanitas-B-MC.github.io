// js/hunt.js — logique pure de « Chasse aux Titans », le RPG au tour par tour (aucun accès au DOM).
//
// On chasse des monstres mécaniques. Chaque victoire rapporte des TROPHÉES (une monnaie propre au RPG, qu'on ne peut
// pas gagner ailleurs) et des matériaux ; à la forge, l'équipement (arme, armure, talisman) s'achète
// avec des trophées plus des matériaux du monstre précédent. Un meilleur équipement permet de chasser le monstre suivant.

/* ---------- Équipement ---------- */

export const TIER_NAMES = ["Rouillé", "Acier", "Plasma", "Néon", "Chrome", "Quantique", "Légendaire", "Mythique", "Titanesque"];
export const MAX_TIER = TIER_NAMES.length - 1;

export const WEAPON_ATK = [16, 36, 80, 175, 380, 820, 1700, 3500, 7000];
export const ARMOR_HP = [0, 40, 110, 250, 520, 1100, 2300, 4600, 9000];
export const ARMOR_DEF = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.33, 0.36];

// Prix en trophées du tier 1 à 8 (le tier 0 est gratuit), et nombre de matériaux du monstre précédent.
export const GEAR_COST = [0, 300, 1800, 9000, 45000, 220000, 1100000, 5500000, 25000000];
export const GEAR_PARTS = [0, 2, 3, 3, 4, 4, 5, 5, 6];
export const NEW_WEAPON_COST = 250;      // acheter une nouvelle famille d'arme (au tier 0)

export const FAMILIES = {
  sword:  { id: "sword",  name: "Épée",    atk: 1.0,  crit: 0,    guard: 0.25, skill: "Taillade",  skillDesc: "Coup puissant (×2)", skillCost: 3 },
  hammer: { id: "hammer", name: "Marteau", atk: 1.15, crit: 0,    guard: 0.30, skill: "Fracas",    skillDesc: "Coup lourd (×2,4) qui assomme sur la tête", skillCost: 4 },
  bow:    { id: "bow",    name: "Arc",     atk: 0.9,  crit: 0.10, guard: 0.30, skill: "Rafale",    skillDesc: "3 tirs (×0,75) sur des parties au hasard", skillCost: 3 }
};
export const FAMILY_IDS = Object.keys(FAMILIES);

export const SLOTS = ["weapon", "armor", "charm"];
export const SLOT_NAMES = { weapon: "Arme", armor: "Armure", charm: "Talisman" };
export const SLOT_DESCS = {
  weapon: "Dégâts de base du chasseur.",
  armor: "Points de vie et réduction des dégâts.",
  charm: "Chances de coup critique (+5 % par tier) et efficacité des potions."
};

/* ---------- Monstres ---------- */

// part : matériau lâché. reward : trophées d'une victoire. Un monstre se débloque en battant le précédent.
export const MONSTERS = [
  { id: "m0", name: "Rat glitché",        weak: "bow",    hp: 150,   atk: 14,  reward: 180,    part: "Puce rongée",        desc: "Un rongeur de câbles, vif mais fragile.",
    moves: ["Coup de griffe", "Morsure", "Grincement", "Décharge"] },
  { id: "m1", name: "Loup néon",          weak: "sword", hp: 400,   atk: 28,  reward: 700,    part: "Croc fluorescent",   desc: "Chasse en meute dans les ruelles éclairées.",
    moves: ["Coup de patte", "Morsure électrique", "Hurlement", "Charge néon"] },
  { id: "m2", name: "Wyverne chromée",    weak: "bow", hp: 1000,  atk: 55,  reward: 3000,   part: "Écaille chromée",    desc: "Un prédateur aérien aux ailes de métal.",
    moves: ["Coup d'aile", "Morsure", "Cri strident", "Souffle de plasma"] },
  { id: "m3", name: "Béhémoth rouillé",   weak: "hammer", hp: 2400,  atk: 100, reward: 12000,  part: "Plaque de blindage", desc: "Un colosse de ferraille qui écrase tout.",
    moves: ["Coup de poing", "Coup de corne", "Beuglement", "Piétinement"] },
  { id: "m4", name: "Hydre quantique",    weak: "sword", hp: 5500,  atk: 190, reward: 50000,  part: "Noyau instable",     desc: "Ses têtes se régénèrent entre deux dimensions.",
    moves: ["Coup de queue", "Triple morsure", "Sifflement", "Rayon quantique"] },
  { id: "m5", name: "Léviathan du réseau", weak: "hammer", hp: 12000, atk: 380, reward: 200000, part: "Fragment de serveur", desc: "L'ancien gardien du réseau. Personne ne l'a vaincu.",
    moves: ["Coup de nageoire", "Morsure abyssale", "Chant du vide", "Raz-de-marée"] },
  { id: "m6", name: "Titan Alpha",        weak: "bow",    hp: 26000, atk: 760, reward: 800000,  part: "Cœur de titan",      desc: "Le premier des Titans, forgé dans l'acier du premier serveur.",
    moves: ["Coup de poing titanesque", "Écrasement", "Rugissement d'acier", "Onde de destruction"] },
  { id: "m7", name: "Titan Omega",        weak: "sword",  hp: 60000, atk: 1500, reward: 3000000, part: "Couronne d'Omega",  desc: "Le dernier. Il ne reste de lui que la colère.",
    moves: ["Frappe finale", "Faux de néant", "Cri de fin du monde", "Extinction"] }
];
export const monsterById = (id) => MONSTERS.find((m) => m.id === id);

// Intentions de monstre : mult = dégâts, weight = fréquence, kind = effet spécial.
const MOVES = [
  { slot: 0, mult: 1.0, weight: 5, kind: "hit" },
  { slot: 1, mult: 1.4, weight: 3, kind: "hit" },
  { slot: 2, mult: 0.4, weight: 2, kind: "rattle" },   // rugissement : le prochain coup du chasseur est affaibli
  { slot: 3, mult: 2.4, weight: 2, kind: "heavy" }     // attaque lourde : à parer !
];

// Parties du monstre : mult = dégâts infligés au monstre en la visant, hp = part de ses PV avant de se briser.
export const PARTS = {
  head: { id: "head", name: "Tête",   mult: 1.3, hp: 0.20, effect: "Brisée : le monstre fait 25 % de dégâts en moins." },
  body: { id: "body", name: "Corps",  mult: 1.0, hp: 0.35, effect: "Brisé : un matériau en plus." },
  tail: { id: "tail", name: "Queue",  mult: 0.8, hp: 0.15, effect: "Brisée : ses attaques lourdes perdent 30 %." }
};
export const PART_IDS = Object.keys(PARTS);

/* ---------- Chasseur ---------- */

export const START_POTIONS = 3;
export const START_BOMBS = 2;
export const WEAK_BONUS = 1.25;          // dégâts en plus avec l'arme à laquelle le monstre est faible
export const HARD = { hp: 1.8, atk: 1.4, reward: 2.5 };   // « traque enragée » : version plus dure d'un monstre déjà vaincu
export const ENERGY_MAX = 6;

// Statistiques du chasseur à partir de l'équipement (un objet { family, weapon, armor, charm }).
export function hunterStats(gear) {
  const fam = FAMILIES[gear.family] || FAMILIES.sword;
  const weapon = Math.min(Math.max(0, gear.weapon | 0), MAX_TIER);
  const armor = Math.min(Math.max(0, gear.armor | 0), MAX_TIER);
  const charm = Math.min(Math.max(0, gear.charm | 0), MAX_TIER);
  return {
    family: fam.id,
    maxHp: 100 + ARMOR_HP[armor],
    def: ARMOR_DEF[armor],
    atk: WEAPON_ATK[weapon] * fam.atk,
    crit: 0.05 + 0.05 * charm + fam.crit,
    potionHeal: 0.45 + 0.05 * charm,
    guard: fam.guard
  };
}

/* ---------- Combat ---------- */

export function createFight(monsterId, stats, rng = Math.random, { hard = false } = {}) {
  const def = monsterById(monsterId);
  if (!def) return null;
  const parts = {};
  for (const p of PART_IDS) {
    const max = Math.max(1, Math.round(def.hp * (hard ? HARD.hp : 1) * PARTS[p].hp));
    parts[p] = { hp: max, max, broken: false };
  }
  const fight = {
    rng,
    monsterId,
    stats,
    hard,
    monster: { hp: Math.round(def.hp * (hard ? HARD.hp : 1)), maxHp: Math.round(def.hp * (hard ? HARD.hp : 1)), atk: Math.round(def.atk * (hard ? HARD.atk : 1)), parts, stunned: false, enraged: false },
    hunter: { hp: stats.maxHp, maxHp: stats.maxHp, energy: 3, potions: START_POTIONS, bombs: START_BOMBS, rattled: false },
    intent: null,
    turn: 1,
    log: [],
    breaks: 0,
    over: false,
    won: false
  };
  fight.intent = pickIntent(fight, null);
  say(fight, hard ? `${def.name} enragé apparaît !` : `${def.name} apparaît !`);
  return fight;
}

function say(fight, text) {
  fight.log.push(text);
  if (fight.log.length > 60) fight.log.shift();
}

// Choix de la prochaine attaque ; jamais deux attaques lourdes d'affilée.
function pickIntent(fight, previous) {
  const pool = MOVES.filter((m) => !(previous && previous.kind === "heavy" && m.kind === "heavy"));
  const total = pool.reduce((s, m) => s + m.weight, 0);
  let roll = fight.rng() * total;
  for (const m of pool) {
    roll -= m.weight;
    if (roll < 0) return m;
  }
  return pool[0];
}

export function intentName(fight) {
  return monsterById(fight.monsterId).moves[fight.intent.slot];
}

// « light » (coup normal), « heavy » (à parer), « rattle » (rugissement) : pour l'affichage.
export const intentKind = (fight) => fight.intent.kind;

const variance = (fight) => 0.9 + fight.rng() * 0.2;

// Dégâts infligés par le chasseur. Renvoie le nombre de points retirés au monstre.
function strike(fight, partId, mult, label) {
  const { stats, monster, hunter } = fight;
  const part = PARTS[partId];
  const crit = fight.rng() < stats.crit;
  let damage = stats.atk * mult * part.mult * variance(fight) * (crit ? 1.5 : 1);
  if (hunter.rattled) damage *= 0.7;
  if (monsterById(fight.monsterId).weak === stats.family) damage *= WEAK_BONUS;
  damage = Math.max(1, Math.round(damage));
  monster.hp = Math.max(0, monster.hp - damage);
  say(fight, `${label} sur ${part.name.toLowerCase()} : ${damage} dégâts${crit ? " (critique !)" : ""}.`);

  const p = monster.parts[partId];
  if (!p.broken) {
    p.hp = Math.max(0, p.hp - damage);
    if (p.hp === 0) {
      p.broken = true;
      fight.breaks += 1;
      say(fight, `${part.name} brisée ! ${part.effect}`);
    }
  }
  return damage;
}

// Dégâts reçus par le chasseur pour l'intention en cours.
function monsterAttack(fight, guarding) {
  const { monster, hunter, stats } = fight;
  const move = fight.intent;
  const def = monsterById(fight.monsterId);
  let damage = monster.atk * move.mult * variance(fight);
  if (monster.enraged) damage *= 1.3;
  if (monster.parts.head.broken) damage *= 0.75;
  if (move.kind === "heavy" && monster.parts.tail.broken) damage *= 0.7;
  damage *= 1 - stats.def;
  if (guarding) damage *= stats.guard;   // l'épée pare mieux (25 % des dégâts passent), les autres 30 %
  damage = Math.max(1, Math.round(damage));
  hunter.hp = Math.max(0, hunter.hp - damage);
  say(fight, `${def.name} : ${def.moves[move.slot]} ! ${damage} dégâts${guarding ? " (paré)" : ""}.`);
  if (move.kind === "rattle" && !guarding) {
    hunter.rattled = true;
    say(fight, "Tu es déstabilisé : ta prochaine attaque sera affaiblie.");
  }
}

// Actions : { type: "attack" | "skill", part } ou { type: "guard" } ou { type: "potion" }.
// Renvoie false si l'action est impossible (rien ne se passe).
export function act(fight, action) {
  if (fight.over) return false;
  const { hunter, monster, stats } = fight;
  const fam = FAMILIES[stats.family];
  let guarding = false;

  switch (action.type) {
    case "attack":
    case "skill": {
      if (!PARTS[action.part]) return false;
      const skill = action.type === "skill";
      if (skill && hunter.energy < fam.skillCost) return false;
      if (skill) hunter.energy -= fam.skillCost;

      if (stats.family === "bow" && skill) {
        for (let i = 0; i < 3 && monster.hp > 0; i++) strike(fight, PART_IDS[Math.floor(fight.rng() * PART_IDS.length)], 0.75, fam.skill);
      } else {
        const mult = skill ? (stats.family === "hammer" ? 2.4 : 2.0) : 1.0;
        strike(fight, action.part, mult, skill ? fam.skill : "Attaque");
        if (stats.family === "hammer" && monster.hp > 0) {
          const stun = skill ? action.part === "head" : fight.rng() < 0.25;
          if (stun) { monster.stunned = true; say(fight, "Le monstre est assommé !"); }
        }
      }
      hunter.rattled = false;
      break;
    }
    case "guard":
      guarding = true;
      hunter.energy = Math.min(ENERGY_MAX, hunter.energy + 1);
      hunter.rattled = false;
      say(fight, "Tu te mets en garde.");
      break;
    case "bomb": {
      if (hunter.bombs <= 0) return false;
      hunter.bombs -= 1;
      let damage = stats.atk * 3 * variance(fight);
      if (monsterById(fight.monsterId).weak === stats.family) damage *= WEAK_BONUS;
      damage = Math.max(1, Math.round(damage));
      monster.hp = Math.max(0, monster.hp - damage);
      say(fight, `Bombe : ${damage} dégâts.`);
      hunter.rattled = false;
      break;
    }
    case "potion": {
      if (hunter.potions <= 0 || hunter.hp >= hunter.maxHp) return false;
      hunter.potions -= 1;
      const heal = Math.min(hunter.maxHp - hunter.hp, Math.round(hunter.maxHp * stats.potionHeal));
      hunter.hp += heal;
      say(fight, `Potion : +${heal} PV.`);
      break;
    }
    default:
      return false;
  }

  // Victoire ?
  if (monster.hp <= 0) {
    fight.over = true;
    fight.won = true;
    say(fight, `${monsterById(fight.monsterId).name} est vaincu !`);
    return true;
  }

  // Rage à 30 % de points de vie
  if (!monster.enraged && monster.hp <= monster.maxHp * 0.3) {
    monster.enraged = true;
    say(fight, "Le monstre entre en rage ! Ses coups sont plus violents.");
  }

  // Tour du monstre
  if (monster.stunned) {
    monster.stunned = false;
    say(fight, "Le monstre, sonné, ne peut pas attaquer.");
  } else {
    monsterAttack(fight, guarding);
  }
  if (hunter.hp <= 0) {
    fight.over = true;
    fight.won = false;
    say(fight, "Tu es à terre… la chasse est un échec.");
    return true;
  }

  fight.intent = pickIntent(fight, fight.intent);
  hunter.energy = Math.min(ENERGY_MAX, hunter.energy + 1);
  fight.turn += 1;
  return true;
}

export const canSkill = (fight) => !fight.over && fight.hunter.energy >= FAMILIES[fight.stats.family].skillCost;

/* ---------- Récompenses ---------- */

// Matériaux lâchés : 1 de base, +1 par partie brisée (les récompenses sont fixes : pas de hasard).
export function rewardsOf(fight, firstKill = false) {
  if (!fight.won) return { trophies: 0, parts: 0 };
  const def = monsterById(fight.monsterId);
  const bonus = 1 + 0.1 * fight.breaks;
  return {
    trophies: Math.round(def.reward * bonus * (firstKill && !fight.hard ? 2 : 1) * (fight.hard ? HARD.reward : 1)),
    parts: 1 + fight.breaks + (firstKill && !fight.hard ? 1 : 0) + (fight.hard ? 1 : 0)
  };
}

/* ---------- Forge ---------- */

// État de l'équipement dans la sauvegarde : weapons = niveau le plus haut par famille (-1 = pas possédée).
export const freshHunt = () => ({
  weapons: { sword: 0, hammer: -1, bow: -1 },
  armor: 0,
  charm: 0,
  equipped: "sword",
  parts: Object.fromEntries(MONSTERS.map((m) => [m.id, 0])),
  kills: Object.fromEntries(MONSTERS.map((m) => [m.id, 0]))
});

export const gearOf = (hunt) => ({
  family: hunt.equipped,
  weapon: hunt.weapons[hunt.equipped] ?? 0,
  armor: hunt.armor,
  charm: hunt.charm
});

export const isUnlocked = (hunt, monsterId) => {
  const i = MONSTERS.findIndex((m) => m.id === monsterId);
  return i === 0 || (i > 0 && (hunt.kills[MONSTERS[i - 1].id] || 0) >= 1);
};

// Prochain achat d'un emplacement : { tier, trophies, parts, partId, partName } ou null si au maximum.
// Pour une arme : family indique la famille (une famille non possédée coûte NEW_WEAPON_COST au tier 0).
export function nextPurchase(hunt, slot, family = hunt.equipped) {
  let current;
  if (slot === "weapon") current = hunt.weapons[family] ?? -1;
  else current = hunt[slot];
  const tier = current + 1;
  if (tier > MAX_TIER) return null;
  if (slot === "weapon" && tier === 0) return { tier: 0, trophies: NEW_WEAPON_COST, parts: 0, partId: null, partName: null };
  const previous = MONSTERS[tier - 1];
  return {
    tier,
    trophies: Math.round(GEAR_COST[tier] * (slot === "charm" ? 0.8 : 1)),
    parts: GEAR_PARTS[tier],
    partId: previous.id,
    partName: previous.part
  };
}

// Achète l'amélioration suivante. Renvoie true si l'achat a eu lieu.
export function buyGear(wallet, slot, family = wallet.data.hunt.equipped) {
  if (!SLOTS.includes(slot) || (slot === "weapon" && !FAMILIES[family])) return false;
  const buy = nextPurchase(wallet.data.hunt, slot, family);
  if (!buy) return false;
  return wallet.huntPurchase(slot, family, buy);
}
