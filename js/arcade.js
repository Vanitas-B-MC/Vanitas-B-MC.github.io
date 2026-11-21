// js/arcade.js — page arcade.html : choix du jeu, portefeuille, gain passif du Clicker.
// Chaque jeu a son fichier (ui-*.js) et sa logique pure (snake.js, blackjack.js…).

import { createWallet } from "./wallet.js";
import { idleGain, perSecond } from "./clicker.js";
import { createSnakeUI } from "./ui-snake.js";
import { createBlackjackUI } from "./ui-blackjack.js";
import { createRouletteUI } from "./ui-roulette.js";
import { createClickerUI } from "./ui-clicker.js";
import { fmt } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const wallet = createWallet();

const HUB_TITLE = "ARCADE // zone secrète — Mathieu Contamin";

const GAMES = {
  snake: { title: "Data Snake", ui: createSnakeUI($("#game-snake"), wallet) },
  blackjack: { title: "Blackjack", ui: createBlackjackUI($("#blackjack-root"), wallet) },
  roulette: { title: "Roulette", ui: createRouletteUI($("#roulette-root"), wallet) },
  clicker: { title: "Mineur de données", ui: createClickerUI($("#clicker-root"), wallet) }
};

/* ---------- Portefeuille et infos du hub ---------- */

const blueEl = $("#wallet-blue");
const creditsEl = $("#wallet-credits");
let lastBlue = wallet.blue;
let lastCredits = wallet.credits;

// Petite animation quand une valeur augmente.
function bump(el) {
  el.classList.remove("is-bump");
  void el.offsetWidth;
  el.classList.add("is-bump");
}

function renderWallet() {
  blueEl.textContent = fmt(wallet.blue);
  creditsEl.textContent = fmt(wallet.credits);
  if (wallet.blue > lastBlue) bump(blueEl);
  if (wallet.credits > lastCredits) bump(creditsEl);
  lastBlue = wallet.blue;
  lastCredits = wallet.credits;

  $("#meta-snake").textContent = `Record : ${fmt(wallet.data.bestSnake)} · ${fmt(wallet.data.blueFound)} pièce${wallet.data.blueFound > 1 ? "s" : ""} bleue${wallet.data.blueFound > 1 ? "s" : ""} trouvée${wallet.data.blueFound > 1 ? "s" : ""}`;
  $("#meta-clicker").textContent = `${fmt(perSecond(wallet.data.levels))} crédit${perSecond(wallet.data.levels) > 1 ? "s" : ""} / s`;
}

wallet.subscribe(renderWallet);
renderWallet();

/* ---------- Choix du jeu (l'adresse #snake, #roulette… permet de revenir en arrière) ---------- */

const hub = $("#hub");
const sections = {
  snake: $("#game-snake"),
  blackjack: $("#game-blackjack"),
  roulette: $("#game-roulette"),
  clicker: $("#game-clicker")
};
let current = null;

function show(id) {
  if (id === current) return;
  current = id;

  hub.hidden = id !== null;
  for (const [name, section] of Object.entries(sections)) {
    section.hidden = name !== id;
    if (name === id) GAMES[name].ui.activate();
    else GAMES[name].ui.deactivate();
  }

  document.title = id ? `${GAMES[id].title} — ARCADE` : HUB_TITLE;

  // Remonte en haut et place le focus sur le titre (clavier et lecteurs d'écran).
  window.scrollTo(0, 0);
  (id ? $(`#title-${id}`) : $("#hub-title")).focus({ preventScroll: true });
}

function route() {
  const id = location.hash.slice(1);
  show(id in GAMES ? id : null);
}

window.addEventListener("hashchange", route);
route();

/* ---------- Gain passif du Clicker (continue même quand on joue à autre chose) ---------- */

let carry = 0;
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const elapsed = Math.min(now - lastTick, 30000);   // un onglet en veille ne doit pas rapporter une fortune
  lastTick = now;

  const gain = idleGain(wallet.data.levels, elapsed, carry);
  carry = gain.carry;
  if (gain.whole > 0) wallet.addCredits(gain.whole);
}, 250);

/* ---------- Remise à zéro ---------- */

$("#reset").addEventListener("click", () => {
  if (!window.confirm("Remettre à zéro les crédits, les pièces bleues, les améliorations et le record ?")) return;
  wallet.reset();
  carry = 0;
});
