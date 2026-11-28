// js/arcade.js — page arcade.html : choix du jeu, portefeuille, gain passif du Clicker.
// Chaque jeu a son fichier (ui-*.js) et sa logique pure (snake.js, blackjack.js…).

import { createWallet } from "./wallet.js";
import { idleGain, perSecond, bonusOf } from "./clicker.js";
import { createSnakeUI } from "./ui-snake.js";
import { createBlackjackUI } from "./ui-blackjack.js";
import { createRouletteUI } from "./ui-roulette.js";
import { createPlinkoUI } from "./ui-plinko.js";
import { createRanchUI } from "./ui-ranch.js";
import { createFishingUI } from "./ui-fishing.js";
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
import { SPECIES_IDS } from "./hunt-data.js";
import { createDungeonUI } from "./ui-dungeon.js";
import { createCityUI } from "./ui-city.js";
import { ERAS as CITY_ERAS } from "./city.js";
import { createMusic } from "./music.js";
import { fmt, fmtShort, fmtRate } from "./ui.js";
import { FISH } from "./fishing.js";

const HUNT_SPECIES = SPECIES_IDS.length;

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
  ranch: { title: "Vallée Néon", ui: mount(createRanchUI, "#ranch-root") },
  fishing: { title: "Grand Bleu", ui: mount(createFishingUI, "#fishing-root") },
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
  dungeon: { title: "Donjon", ui: mount(createDungeonUI, "#dungeon-root") },
  city: { title: "Cité des Âges", ui: mount(createCityUI, "#city-root") }
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
  const hunt = wallet.data.hunt;
  $("#meta-hunt").textContent = hunt.team.length || hunt.box.length
    ? `Badges : ${hunt.badges} / 8 · Titadex : ${hunt.dex.caught.length} / ${HUNT_SPECIES}${hunt.champion ? " · Champion" : ""}`
    : "Choisis ta première créature";
  $("#meta-breach").textContent = `Meilleur gain : ${fmt(wallet.data.bestBreach)} ¤`;
  const rn = wallet.data.ranch;
  $("#meta-ranch").textContent = `${["Printemps", "Été", "Automne", "Hiver"][rn.season]} ${rn.day}, an ${rn.year} · ${fmtShort(rn.gold)} or`;
  $("#meta-fishing").textContent = `Bestiaire : ${Object.keys(wallet.data.angler.dex).length} / ${FISH.length} · ${fmtShort(wallet.data.angler.pearls)} perles`;
  const records = ["easy", "medium", "hard"].map((id) => (wallet.data.mines[id] ? fmtTime(wallet.data.mines[id]) : "—"));
  $("#meta-mines").textContent = `Records : ${records.join(" · ")}`;
  const towers = wallet.data.towers.length;
  const city = wallet.data.city;
  const cityPop = city.b.reduce((n, b) => n + (b.t === "house" || b.t === "arco" ? b.p : 0), 0);
  const metaCity = $("#meta-city");
  if (metaCity) metaCity.textContent = `${CITY_ERAS[city.era].name} · ${fmt(cityPop)} habitant${cityPop > 1 ? "s" : ""}`;
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
  ranch: $("#game-ranch"),
  fishing: $("#game-fishing"),
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
  dungeon: $("#game-dungeon"),
  city: $("#game-city")
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

/* ---------- Portefeuille repliable ----------
   Dans les jeux, la barre (collée en haut sur PC) cache une partie de l'écran : un bouton la replie en une petite
   étiquette qui n'est plus collée en haut. Le choix est mémorisé. */

const walletBar = $("#wallet-bar");
const walletToggle = $("#wallet-toggle");
function setWalletCollapsed(collapsed) {
  walletBar.classList.toggle("is-collapsed", collapsed);
  document.documentElement.classList.toggle("wallet-collapsed", collapsed);
  walletToggle.setAttribute("aria-expanded", String(!collapsed));
  walletToggle.title = collapsed ? "Afficher le portefeuille" : "Cacher le portefeuille (il ne couvrira plus le jeu)";
  walletToggle.querySelector(".wallet-toggle-sr").textContent = collapsed ? "Afficher le portefeuille" : "Cacher le portefeuille";
}
let walletCollapsed = false;
try { walletCollapsed = localStorage.getItem("mc-arcade-wallet-hidden") === "1"; } catch { /* stockage indisponible */ }
setWalletCollapsed(walletCollapsed);
walletToggle.addEventListener("click", () => {
  walletCollapsed = !walletCollapsed;
  setWalletCollapsed(walletCollapsed);
  try { localStorage.setItem("mc-arcade-wallet-hidden", walletCollapsed ? "1" : "0"); } catch { /* pas grave */ }
});

/* ---------- Remise à zéro ---------- */

/* ---------- Un seul onglet écrit la sauvegarde ---------- */

const lockBox = $("#tab-lock");
function renderLock(reason) {
  lockBox.hidden = !reason;
  if (!reason) return;
  const outdated = reason === "outdated";
  $("#tab-lock-title").textContent = outdated ? "Nouvelle version disponible" : "Arcade ouverte dans un autre onglet";
  $("#tab-lock-text").textContent = outdated
    ? "Ta sauvegarde a été écrite par une version plus récente de l'arcade. Cet onglet utilise une ancienne version (souvent à cause du cache) : il ne sauvegarde plus rien pour ne pas effacer tes progrès. Recharge la page (Ctrl + F5)."
    : "Pour ne pas mélanger deux progressions, un seul onglet sauvegarde à la fois. Celui-ci est en pause : ce que tu y fais ne sera pas enregistré.";
  $("#tab-lock-button").textContent = outdated ? "Recharger" : "Jouer dans cet onglet";
}
$("#tab-lock-button").addEventListener("click", () => {
  if (wallet.locked === "outdated") { window.location.reload(); return; }
  wallet.claim();
  carry = 0;
  lastTick = Date.now();
});
wallet.onLock(renderLock);
renderLock(wallet.locked);

/* ---------- Sauvegardes : copies automatiques, export, import ---------- */

const savesDialog = $("#saves-dialog");
function renderSaves() {
  const list = $("#saves-list");
  list.replaceChildren();
  const items = wallet.backups();
  if (!items.length) { const li = document.createElement("li"); li.textContent = "Aucune copie pour l'instant."; list.append(li); }
  for (const b of items) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    const s = b.summary;
    text.textContent = `${new Date(b.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} — ${fmtShort(s.credits)} crédits · ${s.towers} tours · ${s.maps} cartes · bestiaire ${s.species} · ferme ${s.farmDays} j`;
    const btn = document.createElement("button");
    btn.className = "button button-secondary saves-restore";
    btn.type = "button";
    btn.textContent = "Restaurer";
    btn.addEventListener("click", () => {
      if (!window.confirm("Remplacer ta progression actuelle par cette copie ? (Ta progression actuelle est d'abord copiée, tu pourras revenir en arrière.)")) return;
      if (wallet.restoreBackup(b.index)) { carry = 0; renderSaves(); window.alert("Copie restaurée."); }
    });
    li.append(text, btn);
    list.append(li);
  }
}
$("#saves").addEventListener("click", () => {
  renderSaves();
  if (typeof savesDialog.showModal === "function") savesDialog.showModal(); else savesDialog.setAttribute("open", "");
});
$("#saves-close").addEventListener("click", () => {
  if (typeof savesDialog.close === "function") savesDialog.close(); else savesDialog.removeAttribute("open");
});
$("#save-export").addEventListener("click", () => {
  const blob = new Blob([wallet.exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `arcade-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$("#save-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!window.confirm("Remplacer ta progression actuelle par ce fichier ? (Ta progression actuelle est d'abord copiée dans les sauvegardes.)")) return;
  const ok = wallet.importJSON(await file.text());
  window.alert(ok ? "Sauvegarde importée." : "Ce fichier n'est pas une sauvegarde de l'arcade.");
  if (ok) { carry = 0; renderSaves(); }
});

$("#reset").addEventListener("click", () => {
  if (!window.confirm("Remettre à zéro les crédits, les pièces bleues, les améliorations, les tours débloquées, les succès et les records ?")) return;
  wallet.reset();
  carry = 0;
});
