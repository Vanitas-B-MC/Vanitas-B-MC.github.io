// js/rewards.js — récompenses proportionnelles à la fortune du joueur.
// Avec 1 Qa de crédits, gagner « 120 ¤ » ne veut rien dire : chaque jeu ajoute donc à sa
// récompense de base un pourcentage du solde actuel (plafonné pour rester raisonnable).

export const wealthBonus = (balance, pct) => Math.floor(Math.max(0, Number(balance) || 0) * Math.max(0, pct));

// Survivor Arena : 0,4 % du solde par minute survécue (6 % maximum par partie).
export const survivorPct = (seconds) => Math.min(0.06, (Math.max(0, seconds) / 60) * 0.004);

// Pare-feu : 0,25 % du solde par vague repoussée (× le coefficient de la carte).
export const wavePct = (mapReward = 1) => 0.0025 * (mapReward || 1);

// Breach Protocol : 0,5 / 1 / 2 % du solde selon la difficulté, au prorata des daemons piratés.
export const BREACH_PCT = { 1: 0.005, 2: 0.01, 3: 0.02 };
export const breachPct = (difficulty, hacked, total) => (BREACH_PCT[difficulty] || 0) * (total ? hacked / total : 0);

// Succès du Clicker : +0,5 % du solde.
export const ACHIEVEMENT_PCT = 0.005;
