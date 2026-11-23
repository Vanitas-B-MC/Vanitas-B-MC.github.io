// js/plinko.js — logique pure du Plinko : 24 slots, 23 rangées de picots. Aucun accès au DOM.
//
// La bille descend de rangée en rangée : à chaque picot elle part à gauche (0) ou à droite (1), au hasard.
// Le slot d'arrivée est le nombre de « droite » (0 à 23), donc la répartition suit une loi binomiale :
// le centre est très fréquent, les bords rarissimes (et très bien payés).

import { MAX_CREDITS } from "./limits.js";

export const SLOTS = 24;
export const ROWS = SLOTS - 1;       // 23 rangées → 24 slots possibles
export const MIN_BET = 10;
export const MAX_BALLS = 40;         // billes en vol en même temps

// Multiplicateurs de la moitié du plateau : [0] = les 2 slots du centre … [11] = les 2 slots des bords.
// Le plateau est symétrique. Retour au joueur (RTP) : environ 96 %, quel que soit le risque.
export const RISKS = {
  low:    { label: "Faible", half: [0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.8, 3, 7, 18, 60, 300] },
  medium: { label: "Moyen",  half: [0.5, 0.7, 1, 1.2, 1.8, 2.8, 5, 14, 45, 200, 800, 3000] },
  high:   { label: "Élevé",  half: [0.3, 0.4, 0.6, 0.8, 1.6, 3.3, 9, 45, 250, 1000, 5000, 20000] }
};
export const RISK_IDS = Object.keys(RISKS);

// Distance d'un slot au centre : 0 pour les deux slots du milieu (11 et 12), 11 pour les bords (0 et 23).
const ring = (slot) => Math.abs(slot - (SLOTS - 1) / 2) - 0.5;

// Les 24 multiplicateurs, de gauche à droite.
export function multipliers(risk) {
  const half = (RISKS[risk] ?? RISKS.medium).half;
  return Array.from({ length: SLOTS }, (_, slot) => half[ring(slot)]);
}

// Chemin d'une bille : tableau de 23 valeurs 0 (gauche) ou 1 (droite).
export const dropPath = (rng = Math.random) => Array.from({ length: ROWS }, () => (rng() < 0.5 ? 0 : 1));

// Slot où s'arrête la bille.
export const slotOf = (path) => path.reduce((sum, step) => sum + step, 0);

// Gain total rendu au joueur (mise comprise) pour une mise et un multiplicateur.
export const payout = (bet, mult) => Math.min(Math.floor(bet * mult + 1e-9), MAX_CREDITS);

// Probabilité de chaque slot (loi binomiale B(23 ; 1/2)).
export function probabilities() {
  const odds = [1];
  for (let n = 1; n <= ROWS; n++) {
    for (let k = n; k >= 1; k--) odds[k] = (odds[k] ?? 0) + odds[k - 1];
  }
  const total = 2 ** ROWS;
  return odds.map((count) => count / total);
}

// Retour théorique au joueur (1 = rendu intégral de la mise).
export function rtp(risk) {
  const mult = multipliers(risk);
  return probabilities().reduce((sum, p, slot) => sum + p * mult[slot], 0);
}

// Affichage court d'un multiplicateur : 0,5 · 1,8 · 45 · 1,2 k
export function fmtMult(m) {
  if (m >= 1000) return `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`;
  if (m >= 10) return String(Math.round(m));
  return m.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// Famille d'un multiplicateur (pour les couleurs) : perte, quasi-neutre, gain, gros gain.
export function tier(m) {
  if (m < 1) return "lose";
  if (m < 2) return "even";
  if (m < 10) return "win";
  return "big";
}
