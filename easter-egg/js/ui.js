// js/ui.js — petits outils partagés par les jeux de l'arcade.

// Crée un élément DOM. Le texte est toujours inséré comme texte (pas d'injection HTML).
//   h("button", { class: "x", onclick: fn, hidden: true }, "Texte", autreNoeud)
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

// Nombre lisible : 12 345
export const fmt = (n) => Number(n).toLocaleString("fr-FR");

// Nombre compact pour les gros chiffres : 1 234 → 1,23 K · 4 500 000 → 4,5 M · 7e9 → 7 B …
// En dessous de 1 000 le nombre reste exact (avec au plus `maxDecimals` décimales).
const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmtShort(n, maxDecimals = 0) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "∞";
  const abs = Math.abs(value);
  if (abs < 1000) return value.toLocaleString("fr-FR", { maximumFractionDigits: maxDecimals });
  let tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(abs) / 3));
  let scaled = abs / 1000 ** tier;
  // tronque (et n'arrondit pas) à 3 chiffres significatifs : jamais « 1000 K »
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = 10 ** digits;
  scaled = Math.floor(scaled * factor + 1e-9) / factor;
  const text = scaled.toLocaleString("fr-FR", { maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}${text} ${SUFFIXES[tier]}`.replace(" ", "\u00a0");
}

// Gains par seconde / par clic : une décimale au plus, compact au-delà de 1 000.
export const fmtRate = (n) => fmtShort(n, 1);

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lit une variable CSS du thème (change avec le mode Edgerunners).
export function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Sur téléphone, amène la zone de jeu en haut de l'écran au lancement d'une partie,
// pour voir le plateau et les commandes sans avoir à faire défiler la page.
export function scrollToPlay(el) {
  if (!el || !window.matchMedia("(max-width: 760px)").matches) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
