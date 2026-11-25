// js/enemies2.js — 50 ennemis supplémentaires du Donjon (données pures).
// Chaque ennemi réutilise une IA existante (chase, flutter, charger, archer, mage, turret, bomber, hopper, orbiter, wisp, blink,
// sniper, healer, slammer, burrow, ember, necro, gravity, enrage) et ajoute des traits génériques gérés par dungeon.js :
//   shoot {every,n,spread,sp,dm,r}  tir en éventail vers le joueur   trail "fire"|"poison"|"ice"  laisse des flaques
//   regen (PV/s)                    burst {n,sp}  anneau de tirs à la mort    armor, splits, group, flying, still
// design : forme dessinée par ui-dungeon.js (sh, c2, horns, spikes, eyes, wings, ring, tail).

const ROWS = [
  // ---- Organiques (grotte, jungle, abysses) ----
  ["toadshroom", "Champi toxique", 40, 30, 10, 9, "chase", "#9cff3d", 2.5, 6, ["cave", "jungle"], { trail: "poison" }, { sh: "cap", c2: "#e8ffb0", eyes: 2 }],
  ["thornvine", "Ronce vivante", 60, 0, 11, 9, "turret", "#4caf50", 3, 6, ["jungle", "cave"], { still: true }, { sh: "star", c2: "#a8ff8a", spikes: 8, eyes: 1 }],
  ["sporebat", "Chauve-spore", 20, 95, 7, 7, "flutter", "#c4ff6b", 2, 6, ["cave", "jungle"], { flying: true, burst: { n: 8, sp: 110 } }, { sh: "orb", c2: "#6b8e23", wings: 1, eyes: 2 }],
  ["mantis", "Mante-lame", 55, 70, 10, 14, "charger", "#7be25b", 3.5, 8, ["jungle", "cave"], {}, { sh: "dia", c2: "#d6ff9a", horns: 2, eyes: 2 }],
  ["rootcrawler", "Rampant des racines", 90, 34, 12, 14, "chase", "#6b8e23", 3.5, 9, ["jungle", "cave"], { armor: 0.3, regen: 2 }, { sh: "hex", c2: "#3a5214", spikes: 6, eyes: 2 }],
  ["wasp", "Guêpe géante", 16, 110, 7, 8, "flutter", "#ffd84a", 1.2, 7, ["jungle", "cave", "desert"], { flying: true, group: 3, shoot: { every: 2.4, n: 1, sp: 150, dm: 0.8 } }, { sh: "orb", c2: "#1a1a1a", wings: 2, tail: 1, eyes: 2 }],
  ["gelcube", "Cube gluant", 70, 30, 11, 11, "chase", "#5affc8", 3, 7, ["cave", "abyss"], { splits: "slimelet" }, { sh: "sq", c2: "#b6ffe8", eyes: 2 }],
  ["venomsnail", "Escargot vénéneux", 110, 22, 12, 12, "chase", "#b4ff7a", 3.5, 10, ["jungle", "cave"], { armor: 0.35, trail: "poison" }, { sh: "orb", c2: "#6b8e23", ring: 1, eyes: 2 }],
  ["ogre", "Ogre des marais", 160, 30, 15, 20, "slammer", "#7a9b4a", 5, 11, ["cave", "jungle"], {}, { sh: "sq", c2: "#3a5214", horns: 2, eyes: 2 }],
  ["chimera", "Chimère", 75, 50, 11, 12, "archer", "#e07a3a", 4, 12, ["jungle", "forge", "desert"], { shoot: { every: 2.6, n: 3, spread: 0.3, sp: 160, dm: 0.7 } }, { sh: "tri", c2: "#ffd84a", horns: 2, tail: 1, eyes: 3 }],

  // ---- Morts-vivants et enfer ----
  ["ghoul", "Goule", 70, 62, 9, 11, "chase", "#8fb08a", 3, 6, ["crypt", "hell"], { regen: 3 }, { sh: "orb", c2: "#2c3d2a", eyes: 2 }],
  ["banshee", "Banshee", 34, 70, 9, 9, "wisp", "#d9e8ff", 3.5, 8, ["crypt", "void"], { flying: true, shoot: { every: 3.2, n: 8, spread: 0.785, sp: 120, dm: 0.7 } }, { sh: "tri", c2: "#ffffff", tail: 1, eyes: 2 }],
  ["skelarcher", "Squelette archer", 26, 45, 8, 9, "archer", "#e8e8e0", 2.5, 6, ["crypt", "hell", "desert"], {}, { sh: "orb", c2: "#07060c", eyes: 2 }],
  ["wraith", "Spectre faucheur", 60, 90, 10, 15, "blink", "#6a7bff", 4, 12, ["crypt", "hell", "void"], { flying: true }, { sh: "tri", c2: "#c9d1ff", horns: 1, tail: 1, eyes: 2 }],
  ["boneknight", "Chevalier d'os", 130, 40, 12, 18, "chase", "#d6d0b8", 4.5, 10, ["crypt", "hell", "desert"], { armor: 0.45 }, { sh: "sq", c2: "#8a8470", horns: 2, eyes: 2 }],
  ["imp", "Diablotin", 30, 100, 7, 8, "flutter", "#ff4d4d", 2.5, 7, ["hell", "forge"], { flying: true, shoot: { every: 1.8, n: 1, sp: 170, dm: 0.9 } }, { sh: "tri", c2: "#ffd84a", horns: 2, wings: 1, eyes: 2 }],
  ["hellhound", "Molosse infernal", 65, 85, 10, 14, "charger", "#ff5a1a", 4, 9, ["hell", "forge"], { trail: "fire" }, { sh: "dia", c2: "#ffd84a", horns: 2, tail: 1, eyes: 2 }],
  ["lesserlich", "Liche mineure", 80, 38, 10, 11, "mage", "#b58cff", 4.5, 13, ["crypt", "hell"], { shoot: { every: 2.8, n: 5, spread: 0.25, sp: 150, dm: 0.7 } }, { sh: "dia", c2: "#4dffd2", ring: 1, eyes: 2 }],
  ["darkpriest", "Prêtre noir", 60, 40, 10, 8, "healer", "#9b4dff", 4, 11, ["crypt", "hell", "void"], {}, { sh: "tri", c2: "#e0c8ff", ring: 1, eyes: 1 }],
  ["horned", "Démon cornu", 190, 44, 14, 22, "enrage", "#c9162a", 5.5, 14, ["hell"], {}, { sh: "sq", c2: "#ffd84a", horns: 2, spikes: 4, eyes: 2 }],

  // ---- Mécaniques, forge, désert, néon ----
  ["cogbot", "Automate", 60, 50, 10, 12, "chase", "#b0b8c8", 3, 6, ["forge", "neon", "desert"], { armor: 0.3 }, { sh: "hex", c2: "#4a5068", spikes: 6, eyes: 1 }],
  ["sawbot", "Scie-bot", 50, 95, 10, 15, "charger", "#ff8a3d", 3.5, 8, ["forge", "neon"], {}, { sh: "star", c2: "#ffd84a", spikes: 10, eyes: 1 }],
  ["laserturret", "Tourelle laser", 90, 20, 11, 22, "sniper", "#ff2a6d", 4, 9, ["forge", "neon", "desert"], {}, { sh: "hex", c2: "#07060c", eyes: 1 }],
  ["rocketeer", "Lance-roquettes", 55, 40, 10, 13, "archer", "#ffb347", 4, 10, ["forge", "desert", "neon"], { shoot: { every: 2.4, n: 1, sp: 140, dm: 1.7, r: 7 } }, { sh: "sq", c2: "#ff3b5c", horns: 1, eyes: 1 }],
  ["tank", "Char d'assaut", 260, 34, 17, 20, "chase", "#6b7b52", 6.5, 15, ["desert", "forge", "neon"], { armor: 0.5, shoot: { every: 2.2, n: 3, spread: 0.2, sp: 170, dm: 0.7 } }, { sh: "sq", c2: "#3a4530", horns: 1, eyes: 1 }],
  ["scorpion", "Scorpion", 60, 75, 10, 13, "chase", "#e0b04a", 3.5, 7, ["desert"], { trail: "poison" }, { sh: "dia", c2: "#8a5a1a", tail: 1, horns: 2, eyes: 2 }],
  ["sandworm", "Ver des sables", 85, 100, 11, 16, "burrow", "#d9b45a", 4, 9, ["desert"], {}, { sh: "orb", c2: "#8a5a1a", spikes: 8, eyes: 0 }],
  ["mummy", "Momie", 100, 32, 11, 13, "chase", "#e8d8a8", 3.5, 8, ["desert", "crypt"], { armor: 0.2, regen: 1 }, { sh: "sq", c2: "#a89868", eyes: 2 }],
  ["pharaoh", "Pharaon spectral", 110, 38, 11, 12, "mage", "#ffd24a", 5, 14, ["desert"], { flying: true, shoot: { every: 2.6, n: 7, spread: 0.2, sp: 150, dm: 0.6 } }, { sh: "tri", c2: "#4dffd2", horns: 1, ring: 1, eyes: 2 }],
  ["hacker", "Pirate réseau", 42, 55, 9, 10, "orbiter", "#00f0ff", 3.5, 8, ["neon"], { flying: true }, { sh: "sq", c2: "#07060c", eyes: 1, ring: 1 }],
  ["cyberwolf", "Loup cyber", 55, 110, 10, 14, "charger", "#4dffd2", 3.5, 9, ["neon", "ice"], {}, { sh: "dia", c2: "#ff2a6d", horns: 2, tail: 1, eyes: 1 }],
  ["mechspider", "Méca-araignée", 48, 0, 9, 12, "hopper", "#9aa4c7", 3.5, 10, ["neon", "forge"], {}, { sh: "hex", c2: "#00f0ff", spikes: 8, eyes: 3 }],
  ["droneswarm", "Essaim kamikaze", 6, 130, 5, 12, "bomber", "#4dffd2", 0.6, 12, ["neon", "forge", "hell"], { flying: true, group: 5 }, { sh: "orb", c2: "#ff3b5c", wings: 1, eyes: 1 }],
  ["sentinelbot", "Sentinelle mécanique", 140, 0, 13, 12, "turret", "#9aa4c7", 5, 12, ["neon", "forge", "desert"], { still: true, shoot: { every: 3, n: 8, spread: 0.785, sp: 120, dm: 0.6 } }, { sh: "hex", c2: "#ff2a6d", ring: 1, eyes: 1 }],

  // ---- Glace et abysses ----
  ["frostwolf", "Loup de givre", 55, 95, 10, 13, "charger", "#bfe9ff", 3.5, 6, ["ice"], { trail: "ice" }, { sh: "dia", c2: "#ffffff", horns: 2, tail: 1, eyes: 2 }],
  ["yeti", "Yéti", 170, 34, 15, 21, "slammer", "#e8f6ff", 5, 10, ["ice"], {}, { sh: "sq", c2: "#7fd8ff", horns: 0, eyes: 2 }],
  ["icewraith", "Spectre glacial", 36, 60, 9, 9, "wisp", "#7fd8ff", 3, 7, ["ice", "abyss"], { flying: true, shoot: { every: 2.4, n: 3, spread: 0.3, sp: 150, dm: 0.7, color: "#bfe9ff" } }, { sh: "tri", c2: "#ffffff", tail: 1, eyes: 2 }],
  ["snowgolem", "Golem de neige", 120, 30, 13, 15, "chase", "#f0f8ff", 4, 9, ["ice"], { armor: 0.3, burst: { n: 10, sp: 110 } }, { sh: "orb", c2: "#7fd8ff", spikes: 5, eyes: 2 }],
  ["jellyfish", "Méduse", 32, 40, 10, 8, "orbiter", "#ff9ef5", 3, 7, ["abyss"], { flying: true, shoot: { every: 3, n: 6, spread: 1.0, sp: 110, dm: 0.6 } }, { sh: "cap", c2: "#ffd6fb", tail: 1, eyes: 2 }],
  ["angler", "Baudroie", 80, 65, 12, 16, "chase", "#4d9bff", 4, 9, ["abyss"], {}, { sh: "orb", c2: "#fcee0a", horns: 1, spikes: 6, eyes: 1 }],
  ["kraken", "Tentacule", 120, 0, 13, 14, "turret", "#3a6bd9", 4.5, 11, ["abyss"], { still: true, shoot: { every: 2.6, n: 5, spread: 0.3, sp: 150, dm: 0.7 } }, { sh: "star", c2: "#9ad1ff", spikes: 6, eyes: 1 }],
  ["ghostshark", "Requin spectral", 70, 110, 11, 17, "charger", "#5a8bd9", 4, 10, ["abyss"], { flying: true }, { sh: "tri", c2: "#e8f6ff", tail: 1, eyes: 1 }],
  ["crystalguard", "Garde de cristal", 100, 44, 12, 15, "chase", "#7fd8ff", 4, 8, ["ice", "void"], { armor: 0.4 }, { sh: "dia", c2: "#ffffff", spikes: 4, eyes: 1 }],

  // ---- Néant et cosmique ----
  ["voidling", "Larve du vide", 22, 85, 7, 9, "blink", "#8e6bff", 2.5, 7, ["void", "neon"], {}, { sh: "orb", c2: "#07060c", eyes: 1 }],
  ["shootingstar", "Étoile filante", 50, 120, 8, 12, "flutter", "#fff27a", 3.5, 9, ["void", "neon"], { flying: true, shoot: { every: 2, n: 2, spread: 0.2, sp: 200, dm: 0.7 } }, { sh: "star", c2: "#ffffff", spikes: 5, eyes: 0 }],
  ["singularity", "Singularité", 110, 26, 12, 14, "gravity", "#7a5cff", 5, 13, ["void"], { flying: true }, { sh: "orb", c2: "#07060c", ring: 1, eyes: 0 }],
  ["chaoseye", "Œil du chaos", 90, 30, 12, 14, "mage", "#ff2a6d", 5, 15, ["void", "hell"], { flying: true, shoot: { every: 2.8, n: 9, spread: 0.18, sp: 150, dm: 0.6 } }, { sh: "orb", c2: "#ffffff", spikes: 6, eyes: 1 }],
  ["riftstalker", "Traqueur de faille", 85, 95, 10, 17, "blink", "#b020ff", 5, 16, ["void"], { shoot: { every: 2.4, n: 3, spread: 0.25, sp: 190, dm: 0.7 } }, { sh: "dia", c2: "#ffffff", horns: 2, tail: 1, eyes: 2 }],
  ["eclipsefrag", "Fragment d'éclipse", 120, 46, 11, 15, "orbiter", "#b020ff", 5.5, 18, ["void", "abyss"], { flying: true, shoot: { every: 2.6, n: 6, spread: 0.5, sp: 140, dm: 0.6 } }, { sh: "orb", c2: "#000000", ring: 1, spikes: 6, eyes: 1 }],
  ["nullknight", "Chevalier du Néant", 230, 46, 15, 24, "enrage", "#3d3d5c", 7, 20, ["void", "hell", "crypt"], { armor: 0.4 }, { sh: "sq", c2: "#b020ff", horns: 2, eyes: 1 }]
];

export const ENEMIES2 = {};
export const ENEMY2_THEMES = {};   // thème -> ids
for (const [id, name, hp, speed, r, dmg, ai, color, cost, minFloor, themes, extra, design] of ROWS) {
  ENEMIES2[id] = { name, hp, speed, r, dmg, ai, color, cost, minFloor, ...extra, design };
  for (const t of themes) (ENEMY2_THEMES[t] ||= []).push(id);
}
export const ENEMY2_COUNT = ROWS.length;
