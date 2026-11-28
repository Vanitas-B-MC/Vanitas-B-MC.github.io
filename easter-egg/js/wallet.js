// js/wallet.js — portefeuille et progression partagés entre tous les jeux de l'arcade.
//   credits : monnaie du Clicker, du Blackjack et du Tower Defense (déblocage des tours)
//   blue    : pièces bleues, rares : trouvées dans le Snake, gagnées au Tetris,
//             jouées à la Roulette et dépensées en améliorations dans le Clicker
// Tout est sauvegardé dans le navigateur (localStorage). Si le stockage est indisponible
// (navigation privée, par exemple), le jeu marche quand même, simplement sans sauvegarde.

import { UPGRADES, BLUE_UPGRADES, SKILLS, CORE } from "./clicker.js";
import { CHARACTER_IDS, FREE_CHARACTER } from "./survivors.js";
import { freshHunt, sanitizeHunt } from "./hunt.js";
import { TOWER_IDS, FREE_TOWER, MAP_IDS, FREE_MAP, HERO_IDS, FREE_HERO } from "./td.js";
import { freshRanch, sanitizeRanch } from "./ranch.js";
import { freshCity, sanitizeCity } from "./city.js";
import { freshAngler, sanitizeAngler } from "./fishing.js";
import { LEVEL_IDS } from "./mines.js";
import { QUEST_IDS, questById, applyRunToQuests } from "./hub.js";
import { MAX_CREDITS } from "./limits.js";
import { CLASS_IDS, FREE_CLASS, META, META_IDS, freshRanks, metaCost, classById, WEAPONS, WEAPON_IDS, FREE_WEAPONS, weaponById, ULT_IDS, FREE_ULTS, ultById } from "./dungeon.js";

const KEY = "mc-arcade-wallet-v1";
const OWNER_KEY = "mc-arcade-owner";     // quel onglet a le droit d'écrire la sauvegarde
const BACKUP_KEY = "mc-arcade-backups";  // copies automatiques (les 6 dernières, une toutes les 10 minutes au plus)
const BACKUP_EVERY = 10 * 60 * 1000;
const MAX_BACKUPS = 6;

// Version du code de l'arcade. À augmenter à chaque mise à jour qui ajoute des jeux, des tours, des cartes…
// Un onglet resté sur une ancienne version (ou servi depuis le cache du navigateur) voit qu'une sauvegarde a été
// écrite par une version plus récente : il passe en lecture seule au lieu d'écraser ce qu'il ne connaît pas.
export const BUILD = 4;
const START_CREDITS = 100;
const MAX = MAX_CREDITS;

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
    heroes: [FREE_HERO],   // héros du Tower Defense débloqués
    chars: [FREE_CHARACTER], // personnages de Survivor Arena débloqués
    achievements: [],
    hunt: freshHunt(),     // « Chasse aux Titans » : équipe, box, sac, badges et Titadex du RPG de capture
    trophies: 0,           // monnaie du RPG : gagnée uniquement en chassant
    bestHunt: 0,           // badges de Gardiens obtenus dans « Chasse aux Titans »
    bestDungeon: 0,        // étage le plus profond atteint dans « Donjon »
    dungeon: { souls: 0, ranks: freshRanks(), classes: [FREE_CLASS], weapons: FREE_WEAPONS.slice(), ults: FREE_ULTS.slice(), runs: 0,
      stats: { kills: 0, bosses: 0, rooms: 0, gold: 0, elite: 0, deepest: 0 }, quests: {} },   // âmes, améliorations permanentes, classes
    ranch: freshRanch(Math.floor(Math.random() * 1e9)),   // « Vallée Néon » : la ferme façon Stardew Valley
    angler: freshAngler(), // « Grand Bleu » : le jeu de pêche (perles, équipement, bestiaire)
    city: freshCity(),     // « Cité des Âges » : le city builder (carte, bâtiments, ressources, ère)
    mines: Object.fromEntries(LEVEL_IDS.map((id) => [id, 0])),  // Démineur : meilleur temps (secondes) par niveau, 0 = aucun
    build: BUILD           // version du code qui a écrit la sauvegarde
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
  data.hunt = sanitizeHunt(raw.hunt);
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
    if (Array.isArray(raw.dungeon.ults)) {
      for (const id of raw.dungeon.ults) if (ULT_IDS.includes(id) && !d.ults.includes(id)) d.ults.push(id);
    }
    if (Array.isArray(raw.dungeon.weapons)) {
      for (const id of raw.dungeon.weapons) if (WEAPON_IDS.includes(id) && !d.weapons.includes(id)) d.weapons.push(id);
    }
  }
  data.ranch = sanitizeRanch(raw.ranch);
  data.build = BUILD;
  data.angler = sanitizeAngler(raw.angler);
  data.city = sanitizeCity(raw.city);
  for (const id of LEVEL_IDS) data.mines[id] = toCount(raw.mines?.[id]);
  if (Array.isArray(raw.chars)) {
    for (const id of raw.chars) if (CHARACTER_IDS.includes(id) && !data.chars.includes(id)) data.chars.push(id);
  }
  if (Array.isArray(raw.maps)) {
    for (const id of raw.maps) if (MAP_IDS.includes(id) && !data.maps.includes(id)) data.maps.push(id);
  }
  if (Array.isArray(raw.heroes)) {
    for (const id of raw.heroes) if (HERO_IDS.includes(id) && !data.heroes.includes(id)) data.heroes.push(id);
  }
  if (Array.isArray(raw.achievements)) {
    for (const id of raw.achievements.slice(0, 200)) {
      if (typeof id === "string" && id.length <= 40 && !data.achievements.includes(id)) data.achievements.push(id);
    }
  }
  return data;
}

// Ce que ce code ne reconnaît pas dans une sauvegarde (jeu, tour, carte, amélioration d'une autre version) n'est
// plus jeté : on le met de côté et on le réécrit tel quel à chaque sauvegarde.
const LIST_IDS = () => ({ towers: TOWER_IDS, maps: MAP_IDS, heroes: HERO_IDS, chars: CHARACTER_IDS });
const DUNGEON_LIST_IDS = () => ({ classes: CLASS_IDS, weapons: WEAPON_IDS, ults: ULT_IDS });
const unknownIds = (list, ids) => (Array.isArray(list) ? list.filter((id) => typeof id === "string" && id.length <= 40 && !ids.includes(id)).slice(0, 200) : []);

export function extrasOf(raw) {
  const ex = { top: {}, lists: {}, dungeon: {}, levels: {}, blueLevels: {} };
  if (!raw || typeof raw !== "object") return ex;
  const known = new Set(Object.keys(freshData()));
  for (const [k, v] of Object.entries(raw)) if (!known.has(k)) ex.top[k] = v;
  for (const [k, ids] of Object.entries(LIST_IDS())) ex.lists[k] = unknownIds(raw[k], ids);
  if (raw.dungeon && typeof raw.dungeon === "object") for (const [k, ids] of Object.entries(DUNGEON_LIST_IDS())) ex.dungeon[k] = unknownIds(raw.dungeon[k], ids);
  for (const [k, ids] of [["levels", CLICKER_IDS], ["blueLevels", BLUE_IDS]]) {
    if (raw[k] && typeof raw[k] === "object") for (const [id, v] of Object.entries(raw[k])) if (!ids.includes(id) && id.length <= 40) ex[k][id] = toCount(v);
  }
  return ex;
}

export function serialize(data, ex) {
  const out = { ...ex.top, ...data };
  for (const [k, ids] of Object.entries(ex.lists)) if (ids.length) out[k] = [...data[k], ...ids.filter((id) => !data[k].includes(id))];
  const dun = Object.entries(ex.dungeon).filter(([, ids]) => ids.length);
  if (dun.length) { out.dungeon = { ...data.dungeon }; for (const [k, ids] of dun) out.dungeon[k] = [...data.dungeon[k], ...ids.filter((id) => !data.dungeon[k].includes(id))]; }
  for (const k of ["levels", "blueLevels"]) if (Object.keys(ex[k]).length) out[k] = { ...ex[k], ...data[k] };
  return JSON.stringify(out);
}

// Résumé lisible d'une sauvegarde (pour la liste des copies).
export function summarize(raw) {
  const d = sanitize(raw);
  return {
    credits: d.credits, blue: d.blue, towers: d.towers.length, maps: d.maps.length,
    species: Object.keys(d.angler.dex).length, farmDays: d.ranch.stats.days, rebirths: d.rebirths
  };
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
  let extras = extrasOf(null);
  let lock = null;               // null, "other-tab" (un autre onglet joue) ou "outdated" (ce code est trop vieux)
  let lastBackup = 0;
  const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const listeners = new Set();
  const lockListeners = new Set();

  const readRaw = () => { const saved = storage?.getItem(KEY); return saved ? JSON.parse(saved) : null; };
  const newer = (raw) => Number(raw?.build ?? 0) > BUILD;
  function setLock(reason) {
    if (lock === reason) return;
    lock = reason;
    lockListeners.forEach((fn) => fn(lock));
  }
  function adopt(raw) {
    extras = extrasOf(raw);
    data = raw ? sanitize(raw) : freshData();
  }

  try {
    const raw = readRaw();
    adopt(raw);
    if (newer(raw)) lock = "outdated";
  } catch {
    data = freshData();
    // Sauvegarde illisible : on ne l'écrase pas tant que le joueur n'a rien décidé (copie de secours d'abord).
    try { const bad = storage?.getItem(KEY); if (bad) storage.setItem(`${KEY}-corrupt-${Date.now()}`, bad); } catch { /* pas grave */ }
  }
  if (!lock) { try { storage?.setItem(OWNER_KEY, tabId); } catch { /* pas grave */ } }

  // Un seul onglet écrit la sauvegarde à la fois : le dernier ouvert (ou celui où l'on clique « Jouer ici »).
  // Les autres continuent d'afficher la progression mais n'écrivent plus rien. Sans ça, le gain passif du Clicker
  // (4 sauvegardes par seconde) d'un vieil onglet écrasait les tours, les cartes ou le bestiaire achetés ailleurs.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.storageArea !== storage) return;
      if (event.key === OWNER_KEY) {
        if (event.newValue && event.newValue !== tabId && !lock) setLock("other-tab");
        return;
      }
      if (event.key !== KEY) return;
      try {
        const raw = event.newValue ? JSON.parse(event.newValue) : null;
        if (newer(raw)) setLock("outdated");
        adopt(raw);
      } catch {
        return;
      }
      listeners.forEach((fn) => fn(data));
    });
  }

  function backup(force = false) {
    if (!storage) return;
    try {
      const list = JSON.parse(storage.getItem(BACKUP_KEY) || "[]");
      const now = Date.now();
      if (!force && list[0] && now - list[0].t < BACKUP_EVERY) { lastBackup = list[0].t; return; }
      const json = serialize(data, extras);
      if (list[0]?.d === json) return;
      list.unshift({ t: now, d: json });
      storage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, MAX_BACKUPS)));
      lastBackup = now;
    } catch { /* stockage plein ou indisponible : pas grave */ }
  }

  function commit() {
    if (!lock) {
      try { storage?.setItem(KEY, serialize(data, extras)); } catch { /* pas grave */ }
      if (Date.now() - lastBackup > BACKUP_EVERY) backup();
    }
    listeners.forEach((fn) => fn(data));
  }
  if (!lock) backup();

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

    // Vallée Néon et Grand Bleu : le jeu modifie `data.ranch` / `data.angler` directement, puis demande la sauvegarde.
    saveRanch() { commit(); },
    saveAngler() { commit(); },
    saveCity() { commit(); },

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

    dungeonUnlockUlt(ultId) {
      const u = ultById(ultId);
      if (!u || data.dungeon.ults.includes(ultId)) return false;
      if (data.dungeon.souls < u.unlock) return false;
      data.dungeon.souls -= u.unlock;
      data.dungeon.ults.push(ultId);
      commit();
      return true;
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
    // Chasse aux Titans : le jeu modifie `data.hunt` directement, puis demande la sauvegarde.
    saveHunt() { commit(); },
    addTrophies(n) {
      const amount = toCount(n);
      if (!amount) return;
      data.trophies = addCapped(data.trophies, amount);
      commit();
    },
    spendTrophies(n) {
      const amount = toCount(n);
      if (amount > data.trophies) return false;
      data.trophies -= amount;
      commit();
      return true;
    },
    hasMap(id) { return data.maps.includes(id); },
    unlockHero(id, price) {
      if (!HERO_IDS.includes(id) || data.heroes.includes(id)) return false;
      if (!this.spendCredits(price)) return false;
      data.heroes.push(id);
      commit();
      return true;
    },
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

    // Efface tout et repart de zéro (une copie est gardée dans les sauvegardes, au cas où).
    reset() {
      backup(true);
      data = freshData();
      extras = extrasOf(null);
      commit();
    },

    /* ----- Onglets et sauvegardes ----- */

    get locked() { return lock; },
    onLock(fn) { lockListeners.add(fn); return () => lockListeners.delete(fn); },

    // Reprend la main dans cet onglet : relit la sauvegarde la plus récente, puis devient l'onglet qui écrit.
    claim() {
      try {
        const raw = readRaw();
        if (newer(raw)) { setLock("outdated"); return false; }
        adopt(raw);
      } catch { /* on garde ce qu'on a */ }
      try { storage?.setItem(OWNER_KEY, tabId); } catch { /* pas grave */ }
      setLock(null);
      listeners.forEach((fn) => fn(data));
      return true;
    },

    // Copies automatiques : [{ t, summary }] de la plus récente à la plus ancienne.
    backups() {
      try {
        return JSON.parse(storage?.getItem(BACKUP_KEY) || "[]").map((b, index) => ({ index, t: b.t, summary: summarize(JSON.parse(b.d)) }));
      } catch { return []; }
    },
    restoreBackup(index) {
      try {
        const list = JSON.parse(storage?.getItem(BACKUP_KEY) || "[]");
        if (!list[index]) return false;
        return this.importJSON(list[index].d);
      } catch { return false; }
    },
    exportJSON() { return serialize(data, extras); },
    importJSON(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { return false; }
      if (!raw || typeof raw !== "object") return false;
      backup(true);
      adopt(raw);
      if (lock === "other-tab") { try { storage?.setItem(OWNER_KEY, tabId); } catch { /* pas grave */ } setLock(null); }
      commit();
      backup(true);
      return true;
    }
  };
}
