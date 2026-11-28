// js/ui-slots.js — interface de la Machine à sous (la logique est dans slots.js).
//
// Système « rouleaux adjacents » : pas de lignes, un symbole gagne s'il est visible sur 3 rouleaux côte à côte ou plus.
// La mise totale est retirée au lancement ; le tirage est fait à ce moment-là et les rouleaux ne font que le montrer.
// Les gains sont versés quand le dernier rouleau s'arrête. Les tours gratuits s'enchaînent tout seuls (sans mise, gains ×2).
// Si on quitte le jeu en plein tour, le gain est versé tout de suite, et les tours gratuits restants sont joués d'un coup.

import {
  REEL_COUNT, ROW_COUNT, MIN_BET, MIN_RUN, FREE_MULT, PAYTABLE, SCATTER_PAYS, FREE_SPINS, SYMBOLS,
  spin, addFreeSpins, randomSymbol, comboWin
} from "./slots.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const cr = (n) => `${fmt(n)} crédit${Math.abs(n) > 1 ? "s" : ""}`;
const fmtMult = (m) => m.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const CHIPS = [100, 500, 1000, 10000, 100000];
const FLICKER_MS = 70;
const STOP_FIRST_MS = 520;                 // arrêt du 1er rouleau
const STOP_STEP_MS = 230;                  // écart entre deux rouleaux
const REDUCED_MS = 200;
const FREE_GAP_MS = 1500;                  // pause entre deux tours gratuits
const AUTO_GAP_MS = 750;                   // pause entre deux tours en mode Auto

export function createSlotsUI(root, wallet) {
  let bet = MIN_BET;
  let active = false;
  let spinning = false;
  let auto = false;
  let freeLeft = 0;                        // tours gratuits restants
  let freeBet = 0;                         // mise du tour qui les a déclenchés
  let freeWon = 0;                         // gains cumulés pendant la série
  let current = null;                      // tour en cours : { result, stake, free }
  let flicker = 0;
  let timers = [];
  const stats = { spins: 0, staked: 0, net: 0, best: 0 };

  /* ---------- Squelette ---------- */

  const cells = Array.from({ length: ROW_COUNT }, () => Array.from({ length: REEL_COUNT }, () => h("div", { class: "sl-cell" })));
  const reelEls = Array.from({ length: REEL_COUNT }, (_, reel) =>
    h("div", { class: "sl-reel" }, cells.map((row) => row[reel])));
  const machine = h("div", { class: "sl-machine chamfer", role: "img", "aria-label": "Rouleaux de la machine à sous" }, reelEls);

  const messageEl = h("p", { class: "sl-message", role: "status", "aria-live": "polite" }, "Choisis ta mise et lance les rouleaux.");
  const freeEl = h("p", { class: "sl-free", hidden: true });
  const linesEl = h("ul", { class: "sl-lines", "aria-label": "Détail des gains" });
  const statsEl = h("p", { class: "sl-stats", id: "sl-stats" });

  const betValue = h("strong", { id: "sl-bet" }, fmt(bet));
  const betInput = h("input", {
    class: "bet-input", id: "sl-bet-input", type: "text", inputmode: "numeric", autocomplete: "off",
    pattern: "[0-9 ]*", "aria-label": "Mise totale exacte en crédits", placeholder: "Somme"
  });
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${fmtShort(value)}`));
  const halfButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(Math.floor(bet / 2)) }, "½");
  const twiceButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(bet * 2) }, "×2");
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");
  const spinButton = h("button", { class: "button button-primary sl-spin", type: "button", id: "sl-spin", onclick: () => onSpin() }, "Lancer");
  const autoButton = h("button", {
    class: "button button-secondary", type: "button", id: "sl-auto", "aria-pressed": "false",
    title: "Relance automatiquement jusqu'à ce que tu l'arrêtes ou que les crédits manquent", onclick: toggleAuto
  }, "Auto : off");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  const payRows = Object.entries(PAYTABLE).map(([id, pays]) =>
    h("tr", {}, h("th", { scope: "row" }, h("span", { class: `sl-glyph sym-${id}` }, SYMBOLS[id].glyph), ` ${SYMBOLS[id].name}`),
      ...pays.map((m) => h("td", {}, `×${fmtMult(m)}`))));
  const paytable = h("details", { class: "sl-paytable" },
    h("summary", {}, "Table des gains"),
    h("p", {}, "Pas de lignes : un symbole gagne dès qu'il apparaît sur au moins 3 rouleaux côte à côte, "
      + "dans n'importe quelle rangée et n'importe où sur la machine. Gains en multiples de ta mise, pour 3, 4 ou 5 rouleaux."),
    h("p", {}, "Combinaisons : si le symbole apparaît 2 fois sur un rouleau de la série, le gain est doublé (3 fois → triplé), "
      + "et ça se cumule d'un rouleau à l'autre."),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Symbole"), h("th", { scope: "col" }, "3 rouleaux"), h("th", { scope: "col" }, "4"), h("th", { scope: "col" }, "5"))),
      h("tbody", {}, payRows)),
    h("p", {}, h("span", { class: "sl-glyph sym-wild" }, SYMBOLS.wild.glyph), " Wild : remplace tous les symboles sauf le Scatter (rouleaux 2, 3 et 4)."),
    h("p", {}, h("span", { class: "sl-glyph sym-scatter" }, SYMBOLS.scatter.glyph),
      ` Scatter : 3, 4 ou 5 n'importe où paient ${SCATTER_PAYS[3]}, ${SCATTER_PAYS[4]} ou ${SCATTER_PAYS[5]} fois la mise totale `
      + `et offrent ${FREE_SPINS[3]}, ${FREE_SPINS[4]} ou ${FREE_SPINS[5]} tours gratuits (gains ×${FREE_MULT}, relançables).`));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      `5 rouleaux, aucune ligne à viser : un symbole visible sur ${MIN_RUN} rouleaux côte à côte (ou plus), dans n'importe quelle rangée, gagne. `,
      "Trois ✸ Scatter ou plus déclenchent des tours gratuits."),
    h("div", { class: "sl-layout" },
      h("div", { class: "sl-main" }, machine, messageEl, freeEl, linesEl),
      h("div", { class: "sl-side bj-bet" },
        h("p", { class: "bet-line" }, "Mise : ", betValue, " crédits"),
        h("label", { class: "bet-field" }, h("span", {}, "Saisir une somme"), betInput),
        h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" },
          chipButtons, halfButton, twiceButton, allInButton, clearButton),
        h("div", { class: "sl-actions" }, spinButton, autoButton),
        hint,
        statsEl,
        paytable
      )
    )
  );

  /* ---------- Affichage de la grille ---------- */

  const ids = Array.from({ length: ROW_COUNT }, () => new Array(REEL_COUNT).fill("club"));   // symbole affiché dans chaque case

  function showCell(row, reel, id, spinning = false) {
    const cell = cells[row][reel];
    ids[row][reel] = id;
    cell.className = `sl-cell sym-${id}${spinning ? " is-spinning" : ""}`;
    cell.textContent = SYMBOLS[id].glyph;
    cell.setAttribute("aria-label", SYMBOLS[id].name);
  }

  function showReel(reel, column) {
    for (let row = 0; row < ROW_COUNT; row++) showCell(row, reel, column[row]);
  }

  function highlight(winCells) {
    for (const key of winCells) {
      const [row, reel] = key.split(",").map(Number);
      cells[row][reel].classList.add("is-win");
    }
    machine.classList.toggle("has-win", winCells.length > 0);
  }

  function clearHighlight() {
    for (const row of cells) for (const cell of row) cell.classList.remove("is-win");
    machine.classList.remove("has-win");
  }

  for (let reel = 0; reel < REEL_COUNT; reel++) {                // grille de départ
    showReel(reel, Array.from({ length: ROW_COUNT }, () => randomSymbol(reel)));
  }

  /* ---------- Mise ---------- */

  function setBet(value) {
    bet = Math.max(0, Math.min(Math.floor(value) || 0, wallet.credits));
    betInput.value = bet ? String(bet) : "";
    updateControls();
  }
  betInput.addEventListener("input", () => {
    bet = Math.min(Number(betInput.value.replace(/\D/g, "")) || 0, wallet.credits);
    updateControls();
  });
  betInput.addEventListener("blur", () => { betInput.value = bet ? String(bet) : ""; });
  betInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); betInput.value = bet ? String(bet) : ""; onSpin(); }
  });

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  const busy = () => spinning || freeLeft > 0;

  function updateControls() {
    const credits = wallet.credits;
    const locked = busy();
    if (!locked && bet > credits) { bet = credits; betInput.value = bet ? String(bet) : ""; }
    betValue.textContent = fmt(bet);

    chipButtons.forEach((button, i) => { button.disabled = locked || bet + CHIPS[i] > credits; });
    halfButton.disabled = locked || bet < 2;
    twiceButton.disabled = locked || bet === 0 || bet * 2 > credits;
    allInButton.disabled = locked || credits < MIN_BET || bet === credits;
    clearButton.disabled = locked || bet === 0;
    betInput.disabled = locked;

    spinButton.disabled = locked || bet < MIN_BET || bet > credits;
    autoButton.disabled = !auto && (locked || bet < MIN_BET || bet > credits);
    autoButton.setAttribute("aria-pressed", String(auto));
    autoButton.textContent = `Auto : ${auto ? "on" : "off"}`;
    hint.hidden = locked || credits >= MIN_BET;

    freeEl.hidden = freeLeft === 0;
    if (freeLeft > 0) freeEl.textContent = `Tours gratuits : ${freeLeft} restant${freeLeft > 1 ? "s" : ""} · gains ×${FREE_MULT} · total ${fmt(freeWon)} crédits`;
  }

  function renderStats() {
    statsEl.textContent = stats.spins
      ? `${fmt(stats.spins)} tour${stats.spins > 1 ? "s" : ""} · misé ${fmtShort(stats.staked)} · net ${stats.net > 0 ? "+" : ""}${fmtShort(stats.net)} · meilleur gain ${fmtShort(stats.best)}`
      : "";
  }

  /* ---------- Tours ---------- */

  const later = (fn, ms) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach((t) => window.clearTimeout(t)); timers = []; window.clearInterval(flicker); flicker = 0; };

  function onSpin() {
    if (busy() || bet < MIN_BET) return;
    startSpin(bet, false);
  }

  function startSpin(stake, free) {
    if (!free && !wallet.spendCredits(stake)) { say("Pas assez de crédits pour cette mise.", "lose"); stopAuto(); return; }
    const result = spin(stake, Math.random, free);
    current = { result, stake, free };
    spinning = true;
    clearHighlight();
    linesEl.replaceChildren();
    say(free ? "Tour gratuit…" : "Les rouleaux tournent…");
    updateControls();

    const reduced = prefersReducedMotion();
    const stopAt = (reel) => (reduced ? REDUCED_MS : STOP_FIRST_MS + reel * STOP_STEP_MS);
    const stopped = new Array(REEL_COUNT).fill(false);

    if (!reduced) {
      flicker = window.setInterval(() => {
        for (let reel = 0; reel < REEL_COUNT; reel++) {
          if (stopped[reel]) continue;
          for (let row = ROW_COUNT - 1; row > 0; row--) showCell(row, reel, ids[row - 1][reel], true);   // les symboles défilent vers le bas
          showCell(0, reel, randomSymbol(reel), true);
        }
      }, FLICKER_MS);
    }
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      later(() => {
        stopped[reel] = true;
        showReel(reel, Array.from({ length: ROW_COUNT }, (_, row) => result.grid[row][reel]));
        if (reel === REEL_COUNT - 1) land();
      }, stopAt(reel));
    }
  }

  // Tous les rouleaux sont arrêtés : gains versés, message, suite (tours gratuits ou Auto).
  function land() {
    window.clearInterval(flicker);
    flicker = 0;
    const { result, stake, free } = current;
    current = null;
    spinning = false;
    applyResult(result, stake, free);
    highlight(result.cells);
    showDetail(result, stake, free);
    messageFor(result, stake, free);
    renderStats();
    updateControls();
    next(free && freeLeft === 0);
  }

  // Versement et compteurs (aussi utilisé quand on règle un tour d'un coup en quittant le jeu).
  function applyResult(result, stake, free) {
    if (result.win > 0) wallet.addCredits(result.win);
    stats.spins += 1;
    if (!free) { stats.staked += stake; stats.net -= stake; }
    stats.net += result.win;
    stats.best = Math.max(stats.best, result.win);
    if (free) freeWon += result.win;
    if (result.freeSpins) {
      if (freeLeft === 0) { freeBet = stake; freeWon = free ? freeWon : 0; }
      freeLeft = addFreeSpins(freeLeft, result.freeSpins);
    }
  }

  // Une ligne par symbole gagnant : rouleaux concernés, combinaisons et montant.
  function showDetail(result, stake, free) {
    const items = result.wins.map((w) => {
      const reels = `rouleaux ${w.start + 1} à ${w.start + w.count}`;   // ex. « rouleaux 2 à 4 »
      const ways = w.ways > 1 ? ` · ${w.ways} combinaisons` : "";
      return h("li", {}, h("span", { class: `sl-glyph sym-${w.symbol}` }, SYMBOLS[w.symbol].glyph),
        ` ${SYMBOLS[w.symbol].name} sur les ${reels}${ways} → +${fmt(comboWin(stake, w, free))}`);
    });
    if (result.scatterMult) {
      items.push(h("li", {}, h("span", { class: "sl-glyph sym-scatter" }, SYMBOLS.scatter.glyph),
        ` ${result.scatters}× Scatter → +${fmt(Math.floor(stake * result.scatterMult * (free ? FREE_MULT : 1)))} et ${result.freeSpins} tours gratuits`));
    }
    linesEl.replaceChildren(...items);
  }

  function messageFor(result, stake, free) {
    const extra = result.freeSpins ? ` ${result.freeSpins} tours gratuits !` : "";
    if (result.win <= 0) { say(`Pas de gain.${extra}`, extra ? "win" : "lose"); return; }
    if (free) { say(`Gain : +${cr(result.win)}.${extra}`, "win"); return; }
    const net = result.win - stake;
    if (net > 0) say(`Gagné : +${cr(result.win)} (bénéfice +${fmt(net)}).${extra}`, "win");
    else if (net === 0) say(`Gain : ${cr(result.win)}, mise remboursée.${extra}`, "push");
    else say(`Petit gain : ${cr(result.win)} sur ${fmt(stake)} misés.${extra}`, "push");
  }

  // Après un tour : tour gratuit suivant, tour automatique, ou fin de série.
  function next(seriesEnded) {
    if (freeLeft > 0 && active) {
      later(() => {
        if (freeLeft <= 0) return;
        freeLeft -= 1;
        updateControls();
        startSpin(freeBet, true);
      }, FREE_GAP_MS);
      return;
    }
    if (seriesEnded) say(`Tours gratuits terminés : ${fmt(freeWon)} crédits gagnés !`, freeWon > 0 ? "win" : "push");
    if (auto && active) {
      later(() => {
        if (!auto || busy() || bet < MIN_BET || bet > wallet.credits) { stopAuto(); return; }
        startSpin(bet, false);
      }, AUTO_GAP_MS);
    }
  }

  function toggleAuto() {
    auto = !auto;
    if (auto && !busy()) onSpin();
    updateControls();
  }

  function stopAuto() {
    if (!auto) return;
    auto = false;
    updateControls();
  }

  // Quitter le jeu : le tour en cours est payé, les tours gratuits restants sont joués d'un coup.
  function settle() {
    clearTimers();
    if (current) {
      const { result, stake, free } = current;
      current = null;
      spinning = false;
      for (let reel = 0; reel < REEL_COUNT; reel++) showReel(reel, Array.from({ length: ROW_COUNT }, (_, row) => result.grid[row][reel]));
      applyResult(result, stake, free);
      highlight(result.cells);
    }
    let played = 0;
    const before = freeWon;
    while (freeLeft > 0) {
      freeLeft -= 1;
      const r = spin(freeBet, Math.random, true);
      applyResult(r, freeBet, true);
      played += 1;
    }
    if (played) say(`Tours gratuits terminés : ${fmt(freeWon)} crédits gagnés (${fmt(freeWon - before)} pendant ton absence).`, "win");
    renderStats();
    updateControls();
  }

  window.addEventListener("pagehide", () => { stopAuto(); settle(); });
  wallet.subscribe(() => { if (active) updateControls(); });

  renderStats();
  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; stopAuto(); settle(); }
  };
}
