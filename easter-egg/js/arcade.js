// js/arcade.js — page arcade.html : choix du jeu, portefeuille, gain passif du Clicker.
// Chaque jeu a son fichier (ui-*.js) et sa logique pure (snake.js, blackjack.js…).

import { createWallet } from "./wallet.js";
import { idleGain, perSecond, bonusOf } from "./clicker.js";
import { createSnakeUI } from "./ui-snake.js";
import { createBlackjackUI } from "./ui-blackjack.js";
import { createRouletteUI } from "./ui-roulette.js";
import { createPlinkoUI } from "./ui-plinko.js";
import { createFarmUI } from "./ui-farm.js";
import { createRaceUI } from "./ui-race.js";
import { createMinesUI, fmtTime } from "./ui-mines.js";
import { createCrashUI } from "./ui-crash.js";
import { createSlotsUI } from "./ui-slots.js";
import { createClickerUI } from "./ui-clicker.js";
import { createTetrisUI } from "./ui-tetris.js";
import { createTowerDefenseUI } from "./ui-td.js";
import { createSurvivorsUI } from "./ui-survivors.js";
import { createBreachUI } from "./ui-breach.js";
import { createHuntUI } from "./ui-hunt.js";
import { createDungeonUI } from "./ui-dungeon.js";
import { sharedMusic } from "./music.js";
import { fmt, fmtShort, fmtRate } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const wallet = createWallet();

// Crée l'interface d'un jeu. Si elle échoue (élément manquant dans arcade.html, erreur de code…), ce jeu est désactivé
// et les autres continuent de fonctionner ; l'erreur est affichée dans la console du navigateur (F12).
function mount(create, selector) {
  try {
    const root = $(selector);
    if (!root) throw new Error(`élément ${selector} introuvable dans arcade.html`);
    return create(root, wallet);
  } catch (error) {
    console.error(`[arcade] ${selector} : jeu désactivé`, error);
    return { activate() {}, deactivate() {} };
  }
}

const HUB_TITLE = "ARCADE // zone secrète — Mathieu Contamin";

const GAMES = {
  snake: { title: "Data Snake", ui: mount(createSnakeUI, "#game-snake") },
  blackjack: { title: "Blackjack", ui: mount(createBlackjackUI, "#blackjack-root") },
  roulette: { title: "Roulette", ui: mount(createRouletteUI, "#roulette-root") },
  plinko: { title: "Plinko", ui: mount(createPlinkoUI, "#plinko-root") },
  farm: { title: "Pêche & Ferme", ui: mount(createFarmUI, "#farm-root") },
  race: { title: "Courses d'IA", ui: mount(createRaceUI, "#race-root") },
  mines: { title: "Démineur", ui: mount(createMinesUI, "#mines-root") },
  crash: { title: "Crash", ui: mount(createCrashUI, "#crash-root") },
  slots: { title: "Machine à sous", ui: mount(createSlotsUI, "#slots-root") },
  clicker: { title: "Mineur de données", ui: mount(createClickerUI, "#clicker-root") },
  tetris: { title: "Tetris", ui: mount(createTetrisUI, "#tetris-root") },
  td: { title: "Pare-feu", ui: mount(createTowerDefenseUI, "#td-root") },
  survivors: { title: "Survivor Arena", ui: mount(createSurvivorsUI, "#survivors-root") },
  breach: { title: "Breach Protocol", ui: mount(createBreachUI, "#breach-root") },
  hunt: { title: "Chasse aux Titans", ui: mount(createHuntUI, "#hunt-root") },
  dungeon: { title: "Donjon", ui: mount(createDungeonUI, "#dungeon-root") }
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
  $("#meta-farm").textContent = `Récoltes : ${fmt(wallet.data.farm.harvests)} · Poissons : ${fmt(wallet.data.farm.caught)}`;
  const records = ["easy", "medium", "hard"].map((id) => (wallet.data.mines[id] ? fmtTime(wallet.data.mines[id]) : "—"));
  $("#meta-mines").textContent = `Records : ${records.join(" · ")}`;
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
  farm: $("#game-farm"),
  race: $("#game-race"),
  mines: $("#game-mines"),
  crash: $("#game-crash"),
  slots: $("#game-slots"),
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
    if (!section) continue;                      // section absente du HTML : jeu ignoré
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

const music = sharedMusic();   // même instance que secret-code.js (code « blackwall »)
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
