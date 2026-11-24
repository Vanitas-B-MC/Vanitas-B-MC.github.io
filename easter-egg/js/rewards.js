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

// Donjon : 0,3 % du solde par étage atteint (5 % maximum).
export const dungeonPct = (floor) => Math.min(0.05, Math.max(0, floor) * 0.003);

// Pêche : chaque prise ajoute un pourcentage du solde selon la rareté du poisson (de 0,01 % pour une sardine à 5 % pour un koï doré).
export const FISH_PCT = {
  sardine: 0.0001, carpe: 0.0002, truite: 0.0004, brochet: 0.001,
  anguille: 0.003, thon: 0.008, requin: 0.02, koi: 0.05
};
export const fishPct = (fishId) => FISH_PCT[fishId] || 0;

// Ferme : 0,15 % du solde par heure de pousse de la culture, à chaque récolte (une orchidée de 4 h rapporte 0,6 % du solde).
export const farmPct = (growMs) => 0.0015 * (Math.max(0, growMs) / 3600000);

// Filet automatique : par niveau, 0,000001 % du solde par seconde en plus de son revenu fixe.
export const NET_PCT_PER_SEC = 1e-8;
