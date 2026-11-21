// js/theme.js — mode « Edgerunners » (rouge, vert, violet), activé par un easter egg.
// Le mode est mémorisé dans le navigateur. Les pages le remettent au chargement grâce à
// une petite ligne dans leur <head> (pour qu'il n'y ait pas de flash de l'ancien style).

const KEY = "mc-theme";
const NAME = "edgerunners";

export const isEdgerunners = () => document.documentElement.classList.contains(NAME);

export function setEdgerunners(on) {
  document.documentElement.classList.toggle(NAME, on);
  try {
    if (on) localStorage.setItem(KEY, NAME);
    else localStorage.removeItem(KEY);
  } catch { /* stockage indisponible : le mode vaut pour cette page seulement */ }

  // Les canvas (Snake, pluie de la Veille) relisent leurs couleurs.
  window.dispatchEvent(new Event("mc-theme"));
}

export const toggleEdgerunners = () => {
  const next = !isEdgerunners();
  setEdgerunners(next);
  return next;
};
