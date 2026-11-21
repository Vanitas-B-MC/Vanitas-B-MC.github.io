// js/wallet.js — portefeuille et progression partagés entre tous les jeux de l'arcade.
//   credits : monnaie du Clicker, du Blackjack et du Tower Defense (déblocage des tours)
//   blue    : pièces bleues, rares : trouvées dans le Snake, gagnées au Tetris,
//             jouées à la Roulette et dépensées en améliorations dans le Clicker
// Tout est sauvegardé dans le navigateur (localStorage). Si le stockage est indisponible
// (navigation privée, par exemple), le jeu marche quand même, simplement sans sauvegarde.

import { UPGRADES, BLUE_UPGRADES } from "./clicker.js";
import { TOWER_IDS, FREE_TOWER } from "./td.js";

const KEY = "mc-arcade-wallet-v1";
const START_CREDITS = 100;
const MAX = Number.MAX_SAFE_INTEGER;

export const CLICKER_IDS = UPGRADES.map((u) => u.id);
export const BLUE_IDS = BLUE_UPGRADES.map((u) => u.id);
export const BEST_KEYS = ["bestSnake", "bestTetris", "bestWave"];

function freshData() {
  return {
    credits: START_CREDITS,
    blue: 0,
    bestSnake: 0,
    bestTetris: 0,
    bestWave: 0,
    blueFound: 0,         // pièces bleues ramassées dans le Snake
    minedTotal: 0,        // crédits gagnés avec le Clicker, au total
    clicksTotal: 0,
    levels: Object.fromEntries(CLICKER_IDS.map((id) => [id, 0])),
    blueLevels: Object.fromEntries(BLUE_IDS.map((id) => [id, 0])),
    towers: [FREE_TOWER],  // tours du Tower Defense débloquées
    achievements: []
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
  for (const key of ["blue", "blueFound", "minedTotal", "clicksTotal", ...BEST_KEYS]) data[key] = toCount(raw[key]);

  for (const id of CLICKER_IDS) data.levels[id] = toCount(raw.levels?.[id]);
  for (const id of BLUE_IDS) data.blueLevels[id] = toCount(raw.blueLevels?.[id]);

  if (Array.isArray(raw.towers)) {
    for (const id of raw.towers) if (TOWER_IDS.includes(id) && !data.towers.includes(id)) data.towers.push(id);
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
      if (mined) data.minedTotal = addCapped(data.minedTotal, amount);
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

    // Tower Defense : débloque une tour contre des crédits. false si déjà débloquée ou trop cher.
    hasTower(id) { return data.towers.includes(id); },
    unlockTower(id, price) {
      if (!TOWER_IDS.includes(id) || data.towers.includes(id)) return false;
      if (!this.spendCredits(price)) return false;
      data.towers.push(id);
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
