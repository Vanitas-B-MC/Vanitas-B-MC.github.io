// js/wallet.js — portefeuille partagé entre tous les jeux de l'arcade.
//   credits : monnaie du Clicker et du Blackjack
//   blue    : pièces bleues, rares, trouvées dans le Snake et jouées à la Roulette
// Tout est sauvegardé dans le navigateur (localStorage). Si le stockage est indisponible
// (navigation privée, par exemple), le jeu marche quand même, simplement sans sauvegarde.

const KEY = "mc-arcade-wallet-v1";
const START_CREDITS = 100;

export const CLICKER_IDS = ["click", "script", "botnet", "farm"];

function freshData() {
  return {
    credits: START_CREDITS,
    blue: 0,
    bestSnake: 0,
    blueFound: 0,
    levels: Object.fromEntries(CLICKER_IDS.map((id) => [id, 0]))
  };
}

const toCount = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Reprend une sauvegarde en vérifiant chaque champ (le contenu du navigateur n'est pas fiable).
export function sanitize(raw) {
  const data = freshData();
  if (!raw || typeof raw !== "object") return data;
  data.credits = toCount(raw.credits, data.credits);
  data.blue = toCount(raw.blue);
  data.bestSnake = toCount(raw.bestSnake);
  data.blueFound = toCount(raw.blueFound);
  for (const id of CLICKER_IDS) data.levels[id] = toCount(raw.levels?.[id]);
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

    addCredits(n) {
      const amount = toCount(n);
      if (!amount) return;
      data.credits += amount;
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

    addBlue(n, { found = false } = {}) {
      const amount = toCount(n);
      if (!amount) return;
      data.blue += amount;
      if (found) data.blueFound += amount;
      commit();
    },

    spendBlue(n) {
      const amount = toCount(n);
      if (amount > data.blue) return false;
      data.blue -= amount;
      commit();
      return true;
    },

    setBestSnake(score) {
      if (toCount(score) <= data.bestSnake) return false;
      data.bestSnake = toCount(score);
      commit();
      return true;
    },

    levelUp(id) {
      if (!(id in data.levels)) return;
      data.levels[id] += 1;
      commit();
    },

    // Efface tout et repart de zéro.
    reset() {
      data = freshData();
      commit();
    }
  };
}
