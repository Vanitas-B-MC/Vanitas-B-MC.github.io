// js/clicker.js — logique pure du Clicker « Mineur de données ».
// Les crédits gagnés servent ensuite au Blackjack. Aucun accès au DOM.

// kind "click" : ajoute des crédits par clic. kind "auto" : ajoute des crédits par seconde.
export const UPGRADES = [
  { id: "click",  kind: "click", name: "Implant neuronal", desc: "+1 crédit par clic",  base: 25,   growth: 1.18, value: 1 },
  { id: "script", kind: "auto",  name: "Script automatique", desc: "+1 crédit / seconde",  base: 60,   growth: 1.15, value: 1 },
  { id: "botnet", kind: "auto",  name: "Réseau de bots", desc: "+8 crédits / seconde", base: 650,  growth: 1.15, value: 8 },
  { id: "farm",   kind: "auto",  name: "Ferme de serveurs", desc: "+50 crédits / seconde", base: 6000, growth: 1.15, value: 50 }
];

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);

// Prix de la prochaine amélioration, quand on en possède déjà `owned`.
export function costOf(upgrade, owned) {
  return Math.ceil(upgrade.base * upgrade.growth ** owned);
}

// Crédits gagnés par clic.
export function clickPower(levels) {
  let power = 1;
  for (const u of UPGRADES) if (u.kind === "click") power += u.value * (levels[u.id] || 0);
  return power;
}

// Crédits gagnés par seconde, sans rien faire.
export function perSecond(levels) {
  let rate = 0;
  for (const u of UPGRADES) if (u.kind === "auto") rate += u.value * (levels[u.id] || 0);
  return rate;
}

// Achète une amélioration avec un portefeuille (voir wallet.js). Renvoie true si l'achat a eu lieu.
export function buy(wallet, id) {
  const upgrade = upgradeById(id);
  if (!upgrade) return false;
  const price = costOf(upgrade, wallet.data.levels[id] || 0);
  if (!wallet.spendCredits(price)) return false;
  wallet.levelUp(id);
  return true;
}

// Gain passif pendant `ms` millisecondes, avec une réserve de fractions de crédit
// (un crédit est entier : on garde le reste pour le prochain passage).
export function idleGain(levels, ms, carry = 0) {
  const exact = (perSecond(levels) * ms) / 1000 + carry;
  const whole = Math.floor(exact);
  return { whole, carry: exact - whole };
}
