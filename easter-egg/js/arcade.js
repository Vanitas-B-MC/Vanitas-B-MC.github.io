// js/arcade.js — page arcade.html : choix du jeu, portefeuille, gain passif du Clicker.
// Chaque jeu a son fichier (ui-*.js) et sa logique pure (snake.js, blackjack.js…).

import { createWallet } from "./wallet.js";
import { idleGain, perSecond, bonusOf } from "./clicker.js";
import { createSnakeUI } from "./ui-snake.js";
import { createBlackjackUI } from "./ui-blackjack.js";
import { createRouletteUI } from "./ui-roulette.js";
import { createPlinkoUI } from "./ui-plinko.js";
import { createClickerUI } from "./ui-clicker.js";
import { createTetrisUI } from "./ui-tetris.js";
import { createTowerDefenseUI } from "./ui-td.js";
import { createSurvivorsUI } from "./ui-survivors.js";
import { createBreachUI } from "./ui-breach.js";
import { createHuntUI } from "./ui-hunt.js";
import { createDungeonUI } from "./ui-dungeon.js";
import { createMusic } from "./music.js";
import { fmt, fmtShort, fmtRate } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const wallet = createWallet();

const HUB_TITLE = "ARCADE // zone secrète — Mathieu Contamin";

const GAMES = {
  snake: { title: "Data Snake", ui: createSnakeUI($("#game-snake"), wallet) },
  blackjack: { title: "Blackjack", ui: createBlackjackUI($("#blackjack-root"), wallet) },
  roulette: { title: "Roulette", ui: createRouletteUI($("#roulette-root"), wallet) },
  plinko: { title: "Plinko", ui: createPlinkoUI($("#plinko-root"), wallet) },
  clicker: { title: "Mineur de données", ui: createClickerUI($("#clicker-root"), wallet) },
  tetris: { title: "Tetris", ui: createTetrisUI($("#tetris-root"), wallet) },
  td: { title: "Pare-feu", ui: createTowerDefenseUI($("#td-root"), wallet) },
  survivors: { title: "Survivor Arena", ui: createSurvivorsUI($("#survivors-root"), wallet) },
  breach: { title: "Breach Protocol", ui: createBreachUI($("#breach-root"), wallet) },
  hunt: { title: "Chasse aux Titans", ui: createHuntUI($("#hunt-root"), wallet) },
  dungeon: { title: "Donjon", ui: createDungeonUI($("#dungeon-root"), wallet) }
};

/* ---------- Portefeuille et infos du hub ---------- */

const blueEl = $("#wallet-blue");
const creditsEl = $("#wallet-credits");
const trophiesEl = $("#wallet-trophies");
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
  creditsEl.textContent = fmtShort(wallet.credits);
  creditsEl.title = fmt(wallet.credits);
  trophiesEl.textContent = fmt(wallet.trophies);
  if (wallet.blue > lastBlue) bump(blueEl);
  if (wallet.credits > lastCredits) bump(creditsEl);
  lastBlue = wallet.blue;
  lastCredits = wallet.credits;

  $("#meta-snake").textContent = `Record : ${fmt(wallet.data.bestSnake)} · ${fmt(wallet.data.blueFound)} pièce${wallet.data.blueFound > 1 ? "s" : ""} bleue${wallet.data.blueFound > 1 ? "s" : ""} trouvée${wallet.data.blueFound > 1 ? "s" : ""}`;
  const rate = perSecond(wallet.data.levels, wallet.data.blueLevels, bonusOf(wallet.data));
  $("#meta-clicker").textContent = `${fmtRate(rate)} crédit${rate >= 2 ? "s" : ""} / s`;
  $("#meta-tetris").textContent = `Record : ${fmt(wallet.data.bestTetris)}`;
  const best = wallet.data.bestSurvivor;
  $("#meta-survivors").textContent = `Record : ${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}`;
  $("#meta-dungeon").textContent = `Étage max : ${wallet.data.bestDungeon} · Âmes : ${fmt(wallet.data.dungeon.souls)}`;
  $("#meta-hunt").textContent = `Monstres vaincus : ${wallet.data.bestHunt} / 8`;
  $("#meta-breach").textContent = `Meilleur gain : ${fmt(wallet.data.bestBreach)} ¤`;
  const towers = wallet.data.towers.length;
  $("#meta-td").textContent = `Record : ${fmt(wallet.data.bestWave)} vague${wallet.data.bestWave > 1 ? "s" : ""} · ${towers} tour${towers > 1 ? "s" : ""}`;
}

wallet.subscribe(renderWallet);
renderWallet();

/* ---------- Choix du jeu (l'adresse #snake, #roulette… permet de revenir en arrière) ---------- */

const hub = $("#hub");
const sections = {
  snake: $("#game-snake"),
  blackjack: $("#game-blackjack"),
  roulette: $("#game-roulette"),
  plinko: $("#game-plinko"),
  clicker: $("#game-clicker"),
  tetris: $("#game-tetris"),
  td: $("#game-td"),
  survivors: $("#game-survivors"),
  breach: $("#game-breach"),
  hunt: $("#game-hunt"),
  dungeon: $("#game-dungeon")
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

  const gain = idleGain(wallet.data.levels, elapsed, carry, wallet.data.blueLevels, bonusOf(wallet.data));
  carry = gain.carry;
  if (gain.whole > 0) wallet.addCredits(gain.whole, { mined: true });
}, 250);

/* ---------- Musique (désactivée au départ : le navigateur exige un clic pour lancer le son) ---------- */

const music = createMusic();
const musicButton = $("#music-toggle");
const volumeInput = $("#music-volume");

music.subscribe(({ on, volume }) => {
  musicButton.setAttribute("aria-pressed", String(on));
  $("#music-state").textContent = on ? "on" : "off";
  volumeInput.value = Math.round(volume * 100);
});
volumeInput.value = Math.round(music.volume * 100);
musicButton.addEventListener("click", () => music.toggle());
volumeInput.addEventListener("input", () => music.setVolume(volumeInput.value / 100));

// Si le joueur l'avait activée la dernière fois, elle repart dès son premier clic ou appui de touche.
if (music.wantedOn) {
  const resume = (event) => {
    if (event.target instanceof Element && event.target.closest("#music-toggle, #music-volume")) return;
    document.removeEventListener("pointerdown", resume, true);
    document.removeEventListener("keydown", resume, true);
    music.start();
  };
  document.addEventListener("pointerdown", resume, true);
  document.addEventListener("keydown", resume, true);
}

/* ---------- Remise à zéro ---------- */

$("#reset").addEventListener("click", () => {
  if (!window.confirm("Remettre à zéro les crédits, les pièces bleues, les améliorations, les tours débloquées, les succès et les records ?")) return;
  wallet.reset();
  carry = 0;
});
