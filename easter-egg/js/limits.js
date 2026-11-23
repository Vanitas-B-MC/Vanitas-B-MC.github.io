// js/limits.js — plafond commun des crédits et des gains.
// Un nombre JavaScript est exact jusqu'à 9 Qa (2^53). Au-delà il devient approximatif, ce qui est sans importance
// pour un idle game, et le plafond est repoussé à 1e66 (1 000 Vg) pour que les très grosses fortunes continuent de grandir.
export const MAX_CREDITS = 1e66;
