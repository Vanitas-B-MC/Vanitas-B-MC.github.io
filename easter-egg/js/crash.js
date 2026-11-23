// js/crash.js — logique pure du Crash. Aucun accès au DOM.
//
// Un multiplicateur monte de ×1,00 de plus en plus vite. Il s'effondre à un moment tiré au hasard (le « point de crash »)
// qu'on ne connaît pas. Il faut encaisser avant : on gagne mise × multiplicateur, sinon on perd la mise.
//
// Le point de crash suit une loi « 1 / x » : la probabilité qu'il atteigne au moins ×x est HOUSE_RTP / x.
// Quelle que soit la stratégie (viser ×1,5, ×2 ou ×50), le retour moyen est donc d'environ 95 à 96 %
// (les multiplicateurs sont arrondis vers le bas au centième).

import { MAX_CREDITS } from "./limits.js";

export const MIN_BET = 10;
export const HOUSE_RTP = 0.96;
export const MAX_MULT = 10000;                 // point de crash maximal
export const MIN_TARGET = 1.01;                // encaissement automatique minimal
const RATE = 0.12;                             // croissance : m(t) = e^(RATE × t), soit ×2 en ~5,8 s et ×10 en ~19 s

// Point de crash (au centième près, au moins 1,00). rng() ∈ [0, 1[.
export function crashPoint(rng = Math.random) {
  const raw = (HOUSE_RTP * 100) / (1 - rng());
  return Math.min(MAX_MULT * 100, Math.max(100, Math.floor(raw))) / 100;
}

// Multiplicateur au bout de t secondes (au centième près, vers le bas : on ne montre jamais plus que la réalité).
export const multiplierAt = (t) => Math.floor(Math.exp(RATE * Math.max(0, t)) * 100) / 100;

// Instant (en secondes) où le multiplicateur atteint m.
export const timeAt = (m) => Math.log(Math.max(1, m)) / RATE;

// Gain total rendu (mise comprise) quand on encaisse à ×mult.
export const payout = (bet, mult) => Math.min(Math.floor(bet * mult + 1e-9), MAX_CREDITS);

// Lit un multiplicateur saisi (« 2 », « 2,5 », « 2.50 »). Renvoie null s'il est vide ou invalide.
export function parseTarget(text) {
  const value = Number(String(text).trim().replace(",", "."));
  if (!Number.isFinite(value) || value < MIN_TARGET) return null;
  return Math.min(Math.floor(value * 100) / 100, MAX_MULT);
}

// Une partie : on connaît d'avance le point de crash, l'animation ne fait que le montrer.
// target : encaissement automatique (null = manuel). Renvoie le résultat si l'automatique gagne, sinon null.
export function autoResult(crash, target) {
  return target !== null && target < crash ? { cashed: true, mult: target } : null;
}

// Résultat d'un encaissement manuel à l'instant t (secondes) : gagné si le crash n'a pas encore eu lieu.
export function manualResult(crash, t) {
  if (t >= timeAt(crash)) return { cashed: false, mult: crash };
  return { cashed: true, mult: Math.min(multiplierAt(t), crash) };
}

// Famille d'un multiplicateur (pour les couleurs de l'historique).
export const tier = (m) => (m < 2 ? "lose" : m < 10 ? "win" : "big");

export const fmtMult = (m) => `×${m.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
