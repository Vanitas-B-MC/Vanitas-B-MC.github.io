// js/theme.js — thèmes secrets (Edgerunners : rouge, vert, violet ; Neon : rose, cyan ; Blackwall : noir, rouge sang, ambre ; Arasaka, Militech, Afterlife, Braindance, Dogtown ; Chatquipue, une private joke : chat en pixel-art sur fond vert néon), activés par des easter eggs.
// Un seul thème est actif à la fois. Il est mémorisé dans le navigateur. Les pages le remettent
// au chargement grâce à une petite ligne dans leur <head> (pour qu'il n'y ait pas de flash de l'ancien style).
//
// Pour ajouter un thème : l'ajouter dans THEMES, créer css/<nom>.css (règles sous html.<nom>),
// le lier dans les pages, ajouter son nom dans la ligne du <head>, puis lui donner un code dans secret-code.js.

const KEY = "mc-theme";
export const THEMES = ["edgerunners", "neon", "blackwall", "arasaka", "militech", "afterlife", "braindance", "dogtown", "chatquipue"];

// Nom du thème actif, ou null si le site a son style normal.
export const currentTheme = () =>
  THEMES.find((name) => document.documentElement.classList.contains(name)) ?? null;

// Active un thème (et désactive les autres), ou rétablit le style normal avec null.
export function setTheme(name) {
  const next = THEMES.includes(name) ? name : null;
  for (const theme of THEMES) document.documentElement.classList.toggle(theme, theme === next);
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch { /* stockage indisponible : le mode vaut pour cette page seulement */ }

  // Les canvas (Snake, pluie de la Veille) relisent leurs couleurs.
  window.dispatchEvent(new Event("mc-theme"));
}

// Bascule un thème : l'active s'il ne l'est pas, sinon revient au style normal.
// Renvoie true si le thème demandé est maintenant actif.
export function toggleTheme(name) {
  const turnOn = currentTheme() !== name;
  setTheme(turnOn ? name : null);
  return turnOn;
}

// --- Compatibilité avec le code existant ---
export const isEdgerunners = () => currentTheme() === "edgerunners";
export const isNeon = () => currentTheme() === "neon";

export function setEdgerunners(on) {
  if (on) setTheme("edgerunners");
  else if (isEdgerunners()) setTheme(null);
}

export const toggleEdgerunners = () => toggleTheme("edgerunners");
export const toggleNeon = () => toggleTheme("neon");
export const isBlackwall = () => currentTheme() === "blackwall";
export const toggleBlackwall = () => toggleTheme("blackwall");
