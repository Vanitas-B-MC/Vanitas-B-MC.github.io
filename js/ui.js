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

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lit une variable CSS du thème (change avec le mode Edgerunners).
export function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
