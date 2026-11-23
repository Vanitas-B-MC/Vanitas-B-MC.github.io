// js/wallet.js — portefeuille et progression partagés entre tous les jeux de l'arcade.
//   credits : monnaie du Clicker, du Blackjack et du Tower Defense (déblocage des tours)
//   blue    : pièces bleues, rares : trouvées dans le Snake, gagnées au Tetris,
//             jouées à la Roulette et dépensées en améliorations dans le Clicker
// Tout est sauvegardé dans le navigateur (localStorage). Si le stockage est indisponible
// (navigation privée, par exemple), le jeu marche quand même, simplement sans sauvegarde.

import { UPGRADES, BLUE_UPGRADES, SKILLS, CORE } from "./clicker.js";
import { CHARACTER_IDS, FREE_CHARACTER } from "./survivors.js";
import { MONSTERS, FAMILIES, FAMILY_IDS, MAX_TIER, freshHunt } from "./hunt.js";
import { TOWER_IDS, FREE_TOWER, MAP_IDS, FREE_MAP } from "./td.js";
import { freshFarm, sanitizeFarm } from "./farm.js";
import { LEVEL_IDS } from "./mines.js";
import { QUEST_IDS, questById, applyRunToQuests } from "./hub.js";
import { CLASS_IDS, FREE_CLASS, META, META_IDS, freshRanks, metaCost, classById, WEAPONS, WEAPON_IDS, FREE_WEAPONS, weaponById } from "./dungeon.js";

const KEY = "mc-arcade-wallet-v1";
const START_CREDITS = 100;
const MAX = Number.MAX_SAFE_INTEGER;

export const CLICKER_IDS = UPGRADES.map((u) => u.id);
export const BLUE_IDS = BLUE_UPGRADES.map((u) => u.id);
export const SKILL_IDS = SKILLS.map((x) => x.id);
export const CORE_IDS = CORE.map((x) => x.id);
export const BEST_KEYS = ["bestSnake", "bestTetris", "bestWave", "bestSurvivor", "bestBreach", "bestHunt", "bestDungeon"];

function freshData() {
  return {
    credits: START_CREDITS,
    blue: 0,
    bestSnake: 0,
    bestTetris: 0,
    bestWave: 0,
    bestSurvivor: 0,      // secondes survécues dans Survivor Arena
    bestBreach: 0,        // meilleur gain (crédits) d'un Breach Protocol
    blueFound: 0,         // pièces bleues ramassées dans le Snake
    minedTotal: 0,        // crédits gagnés avec le Clicker, au total
    clicksTotal: 0,
    minedRun: 0,          // crédits minés depuis le dernier formatage (Rebirth)
    shards: 0,            // éclats disponibles (monnaie du Rebirth)
    shardsTotal: 0,       // éclats gagnés à vie : chacun donne +2 % aux gains
    rebirths: 0,
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])),   // arbre de compétences de la partie
    core: Object.fromEntries(CORE_IDS.map((id) => [id, 0])),      // arbre permanent du Rebirth
    levels: Object.fromEntries(CLICKER_IDS.map((id) => [id, 0])),
    blueLevels: Object.fromEntries(BLUE_IDS.map((id) => [id, 0])),
    towers: [FREE_TOWER],  // tours du Tower Defense débloquées
    maps: [FREE_MAP],      // cartes du Tower Defense débloquées
    chars: [FREE_CHARACTER], // personnages de Survivor Arena débloqués
    achievements: [],
    hunt: freshHunt(),     // équipement, matériaux et victoires du RPG « Chasse aux Titans »
    trophies: 0,           // monnaie du RPG : gagnée uniquement en chassant
    bestHunt: 0,           // nombre de monstres différents vaincus
    bestDungeon: 0,        // étage le plus profond atteint dans « Donjon »
    dungeon: { souls: 0, ranks: freshRanks(), classes: [FREE_CLASS], weapons: FREE_WEAPONS.slice(), runs: 0,
      stats: { kills: 0, bosses: 0, rooms: 0, gold: 0, elite: 0, deepest: 0 }, quests: {} },   // âmes, améliorations permanentes, classes
    farm: freshFarm(),     // « Pêche & Ferme » : parcelles, améliorations, carnet de pêche
    mines: Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]))   // Démineur : meilleur temps (secondes) par niveau, 0 = aucun
  };
}

const toCount = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX) : fallback;
};

const addCapped = (a, b) => Math.min(a + b, MAX);

// Reprend une sauvegarde en vérifiant chaque champ (le contenu du navigateur n'est pas fiable).
export function sanitize(raw) {
  const data = freshData();
  if (!raw || typeof raw !== "object") return data;

  data.credits = toCount(raw.credits, data.credits);
  for (const key of ["blue", "blueFound", "minedTotal", "clicksTotal", "minedRun", "shards", "trophies", "shardsTotal", "rebirths", ...BEST_KEYS]) data[key] = toCount(raw[key]);

  for (const id of CLICKER_IDS) data.levels[id] = toCount(raw.levels?.[id]);
  for (const id of BLUE_IDS) data.blueLevels[id] = toCount(raw.blueLevels?.[id]);
  for (const sk of SKILLS) data.skills[sk.id] = Math.min(toCount(raw.skills?.[sk.id]), sk.max);
  for (const node of CORE) data.core[node.id] = Math.min(toCount(raw.core?.[node.id]), node.max);

  if (Array.isArray(raw.towers)) {
    for (const id of raw.towers) if (TOWER_IDS.includes(id) && !data.towers.includes(id)) data.towers.push(id);
  }
  if (raw.hunt && typeof raw.hunt === "object") {
    const h = data.hunt;
    const tier = (v, min = 0) => Math.min(Math.max(min, Math.floor(Number(v)) || 0), MAX_TIER);
    for (const f of FAMILY_IDS) h.weapons[f] = f === "sword" ? tier(raw.hunt.weapons?.[f]) : tier(raw.hunt.weapons?.[f] ?? -1, -1);
    h.armor = tier(raw.hunt.armor);
    h.charm = tier(raw.hunt.charm);
    h.equipped = FAMILY_IDS.includes(raw.hunt.equipped) && h.weapons[raw.hunt.equipped] >= 0 ? raw.hunt.equipped : "sword";
    for (const m of MONSTERS) {
      h.parts[m.id] = toCount(raw.hunt.parts?.[m.id]);
      h.kills[m.id] = toCount(raw.hunt.kills?.[m.id]);
    }
  }
  if (raw.dungeon && typeof raw.dungeon === "object") {
    const d = data.dungeon;
    d.souls = toCount(raw.dungeon.souls);
    d.runs = toCount(raw.dungeon.runs);
    for (const m of META) d.ranks[m.id] = Math.min(toCount(raw.dungeon.ranks?.[m.id]), m.max);
    if (Array.isArray(raw.dungeon.classes)) {
      for (const id of raw.dungeon.classes) if (CLASS_IDS.includes(id) && !d.classes.includes(id)) d.classes.push(id);
    }
    for (const k of Object.keys(d.stats)) d.stats[k] = toCount(raw.dungeon.stats?.[k]);
    if (raw.dungeon.quests && typeof raw.dungeon.quests === "object") {
      for (const id of QUEST_IDS) {
        const q = raw.dungeon.quests[id];
        if (q && typeof q === "object") d.quests[id] = { p: Math.min(toCount(q.p), questById(id).target), claimed: !!q.claimed };
      }
    }
    if (Array.isArray(raw.dungeon.weapons)) {
      for (const id of raw.dungeon.weapons) if (WEAPON_IDS.includes(id) && !d.weapons.includes(id)) d.weapons.push(id);
    }
  }
  data.farm = sanitizeFarm(raw.farm);
  for (const id of LEVEL_IDS) data.mines[id] = toCount(raw.mines?.[id]);
  if (Array.isArray(raw.chars)) {
    for (const id of raw.chars) if (CHARACTER_IDS.includes(id) && !data.chars.includes(id)) data.chars.push(id);
  }
  if (Array.isArray(raw.maps)) {
    for (const id of raw.maps) if (MAP_IDS.includes(id) && !data.maps.includes(id)) data.maps.push(id);
  }
  if (Array.isArray(raw.achievements)) {
    for (const id of raw.achievements.slice(0, 200)) {
      if (typeof id === "string" && id.length <= 40 && !data.achievements.includes(id)) data.achievements.push(id);
    }
  }
  return data;
}

function defaultStorage() {
  try {
    const probe = "__mc_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createWallet(storage = defaultStorage()) {
  let data;
  try {
    const saved = storage?.getItem(KEY);
    data = saved ? sanitize(JSON.parse(saved)) : freshData();
  } catch {
    data = freshData();
  }

  const listeners = new Set();

  function commit() {
    try { storage?.setItem(KEY, JSON.stringify(data)); } catch { /* pas grave */ }
    listeners.forEach((fn) => fn(data));
  }

  return {
    get data() { return data; },
    get trophies() { return data.trophies; },
    get credits() { return data.credits; },
    get blue() { return data.blue; },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // mined : ces crédits viennent du Clicker (ils comptent pour les succès). clicks : nombre de clics.
    addCredits(n, { mined = false, clicks = 0 } = {}) {
      const amount = toCount(n);
      const clickCount = toCount(clicks);
      if (!amount && !clickCount) return;
      data.credits = addCapped(data.credits, amount);
      if (mined) {
        data.minedTotal = addCapped(data.minedTotal, amount);
        data.minedRun = addCapped(data.minedRun, amount);
      }
      data.clicksTotal = addCapped(data.clicksTotal, clickCount);
      commit();
    },

    // Renvoie false (sans rien retirer) si le solde est insuffisant.
    spendCredits(n) {
      const amount = toCount(n);
      if (amount > data.credits) return false;
      data.credits -= amount;
      commit();
      return true;
    },

    // found : pièce ramassée dans le Snake (compte pour la statistique « pièces trouvées »).
    addBlue(n, { found = false } = {}) {
      const amount = toCount(n);
      if (!amount) return;
      data.blue = addCapped(data.blue, amount);
      if (found) data.blueFound = addCapped(data.blueFound, amount);
      commit();
    },

    spendBlue(n) {
      const amount = toCount(n);
      if (amount > data.blue) return false;
      data.blue -= amount;
      commit();
      return true;
    },

    // Enregistre un record (bestSnake, bestTetris, bestWave). Renvoie true si c'est un nouveau record.
    setBest(key, score) {
      if (!BEST_KEYS.includes(key)) return false;
      const value = toCount(score);
      if (value <= data[key]) return false;
      data[key] = value;
      commit();
      return true;
    },
    setBestSnake(score) { return this.setBest("bestSnake", score); },

    // Pêche & Ferme : le jeu modifie `data.farm` directement, puis demande la sauvegarde.
    saveFarm() { commit(); },

    // Démineur : enregistre un meilleur temps (en secondes). Renvoie true si c'est un nouveau record.
    setMinesBest(level, seconds) {
      if (!(level in data.mines)) return false;
      const value = Math.max(1, toCount(seconds));
      if (data.mines[level] && value >= data.mines[level]) return false;
      data.mines[level] = value;
      commit();
      return true;
    },

    // Donjon : fin de partie (âmes gagnées), améliorations permanentes et classes payées en âmes.
    dungeonRun(souls, sum = {}) {
      const st = data.dungeon.stats;
      st.kills = addCapped(st.kills, toCount(sum.kills));
      st.bosses = addCapped(st.bosses, toCount(sum.bossKills));
      st.rooms = addCapped(st.rooms, toCount(sum.rooms));
      st.gold = addCapped(st.gold, toCount(sum.gold));
      st.elite = addCapped(st.elite, toCount(sum.elite));
      st.deepest = Math.max(st.deepest, toCount(sum.floor));
      applyRunToQuests(data.dungeon.quests, sum);
      data.dungeon.souls = addCapped(data.dungeon.souls, toCount(souls));
      data.dungeon.runs = addCapped(data.dungeon.runs, 1);
      commit();
    },
    dungeonBuyRank(id) {
      const m = META.find((x) => x.id === id);
      if (!m) return false;
      const rank = data.dungeon.ranks[id];
      const cost = metaCost(id, rank);
      if (rank >= m.max || data.dungeon.souls < cost) return false;
      data.dungeon.souls -= cost;
      data.dungeon.ranks[id] = rank + 1;
      commit();
      return true;
    },
    dungeonUnlock(classId) {
      if (!CLASS_IDS.includes(classId) || data.dungeon.classes.includes(classId)) return false;
      const cost = classById(classId).unlock;
      if (data.dungeon.souls < cost) return false;
      data.dungeon.souls -= cost;
      data.dungeon.classes.push(classId);
      commit();
      return true;
    },

    // Quêtes du hub : accepter, puis réclamer la récompense (pièces bleues) une fois l'objectif atteint.
    questAccept(id) {
      const def = questById(id);
      if (!def || data.dungeon.quests[id]) return false;
      if (def.requires && !data.dungeon.quests[def.requires]?.claimed) return false;
      data.dungeon.quests[id] = { p: 0, claimed: false };
      commit();
      return true;
    },
    questClaim(id) {
      const def = questById(id);
      const q = data.dungeon.quests[id];
      if (!def || !q || q.claimed || q.p < def.target) return 0;
      q.claimed = true;
      const reward = def.reward;
      this.addBlue(reward);   // (commit inclus)
      return reward;
    },

    dungeonUnlockWeapon(weaponId) {
      if (!WEAPON_IDS.includes(weaponId) || data.dungeon.weapons.includes(weaponId)) return false;
      const cost = weaponById(weaponId).unlock;
      if (data.dungeon.souls < cost) return false;
      data.dungeon.souls -= cost;
      data.dungeon.weapons.push(weaponId);
      commit();
      return true;
    },

    // Améliorations du Clicker : en crédits (levelUp) ou en pièces bleues (blueLevelUp).
    levelUp(id) {
      if (!(id in data.levels)) return;
      data.levels[id] = addCapped(data.levels[id], 1);
      commit();
    },
    blueLevelUp(id) {
      if (!(id in data.blueLevels)) return;
      data.blueLevels[id] = addCapped(data.blueLevels[id], 1);
      commit();
    },

    // Compétences de la partie, éclats et arbre du Rebirth. Les règles (prix, prérequis) sont dans clicker.js.
    skillUp(id) {
      if (!(id in data.skills)) return;
      data.skills[id] = addCapped(data.skills[id], 1);
      commit();
    },
    coreUp(id) {
      if (!(id in data.core)) return;
      data.core[id] = addCapped(data.core[id], 1);
      commit();
    },
    spendShards(n) {
      const amount = toCount(n);
      if (amount > data.shards) return false;
      data.shards -= amount;
      commit();
      return true;
    },
    // Formatage : on garde crédits, pièces bleues, paliers bleus, tours, succès et arbre du Rebirth.
    rebirth({ shards = 0, credits = 0, start = {} } = {}) {
      data.shards = addCapped(data.shards, toCount(shards));
      data.shardsTotal = addCapped(data.shardsTotal, toCount(shards));
      data.credits = addCapped(data.credits, toCount(credits));
      data.rebirths = addCapped(data.rebirths, 1);
      data.minedRun = 0;
      for (const id of CLICKER_IDS) data.levels[id] = toCount(start[id]);
      for (const id of SKILL_IDS) data.skills[id] = 0;
      commit();
    },

    // Tower Defense : débloque une tour contre des crédits. false si déjà débloquée ou trop cher.
    hasTower(id) { return data.towers.includes(id); },
    unlockTower(id, price) {
      if (!TOWER_IDS.includes(id) || data.towers.includes(id)) return false;
      if (!this.spendCredits(price)) return false;
      data.towers.push(id);
      commit();
      return true;
    },

    unlockChar(id, price) {
      if (!CHARACTER_IDS.includes(id) || data.chars.includes(id)) return false;
      if (!this.spendCredits(price)) return false;
      data.chars.push(id);
      commit();
      return true;
    },
    // RPG : récompense d'une chasse, équipement. Les règles (prix, prérequis) sont dans hunt.js.
    huntReward(monsterId, { trophies = 0, parts = 0 } = {}) {
      if (!(monsterId in data.hunt.kills)) return;
      data.hunt.kills[monsterId] = addCapped(data.hunt.kills[monsterId], 1);
      data.hunt.parts[monsterId] = addCapped(data.hunt.parts[monsterId], toCount(parts));
      data.trophies = addCapped(data.trophies, toCount(trophies));
      data.bestHunt = Object.values(data.hunt.kills).filter((k) => k > 0).length;
      commit();
    },
    // Achat atomique : crédits ET matériaux, ou rien du tout.
    huntPurchase(slot, family, buy) {
      const hunt = data.hunt;
      if (buy.trophies > data.trophies) return false;
      if (buy.partId && (hunt.parts[buy.partId] || 0) < buy.parts) return false;
      data.trophies -= buy.trophies;
      if (buy.partId) hunt.parts[buy.partId] -= buy.parts;
      if (slot === "weapon") {
        hunt.weapons[family] = buy.tier;
        hunt.equipped = family;
      } else {
        hunt[slot] = buy.tier;
      }
      commit();
      return true;
    },
    huntEquip(family) {
      if (!FAMILIES[family] || data.hunt.weapons[family] < 0) return false;
      data.hunt.equipped = family;
      commit();
      return true;
    },
    hasMap(id) { return data.maps.includes(id); },
    unlockMap(id, price) {
      if (!MAP_IDS.includes(id) || data.maps.includes(id)) return false;
      if (!this.spendCredits(price)) return false;
      data.maps.push(id);
      commit();
      return true;
    },

    // Succès du Clicker : renvoie true la première fois seulement.
    unlockAchievement(id) {
      if (typeof id !== "string" || data.achievements.includes(id)) return false;
      data.achievements.push(id);
      commit();
      return true;
    },

    // Efface tout et repart de zéro.
    reset() {
      data = freshData();
      commit();
    }
  };
}
