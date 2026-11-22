// js/ui-mines.js — interface du Démineur (la logique est dans mines.js).
//
// Commandes : clic = ouvrir · clic droit, appui long (tactile) ou « Mode drapeau » = drapeau ·
// clic sur un chiffre (ou clic du milieu) = accord · clavier : flèches, Espace/Entrée = ouvrir, F = drapeau.
// Les cases sont créées une fois par niveau puis mises à jour sur place (jamais reconstruites pendant la partie).

import { LEVELS, LEVEL_IDS, newGame, reveal, toggleFlag, chord, cellView, minesLeft, isOver } from "./mines.js";
import { h, fmt } from "./ui.js";

const CELL_PX = { easy: 38, medium: 30, hard: 28 };
const LONG_PRESS_MS = 450;

export const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);

export function createMinesUI(root, wallet) {
  let level = "easy";
  let game = newGame(level);
  let flagMode = false;
  let active = false;
  let focused = 0;
  let baseMs = 0;                 // temps déjà écoulé (hors pauses)
  let startAt = 0;                // début du segment en cours
  let timer = 0;
  let longFlagAt = -1e9;          // dernier drapeau posé par appui long (évite le doublon avec « contextmenu »)
  let pressTimer = 0;
  let cells = [];                 // boutons de la grille
  let shown = [];                 // dernier affichage de chaque case

  /* ---------- Squelette ---------- */

  const levelButtons = LEVEL_IDS.map((id) =>
    h("button", {
      class: "chip chip-ghost", type: "button", "aria-pressed": String(id === level),
      title: `${LEVELS[id].cols} × ${LEVELS[id].rows}, ${LEVELS[id].mines} mines`,
      onclick: () => setLevel(id)
    }, LEVELS[id].label));
  const newButton = h("button", { class: "button button-primary", type: "button", id: "mn-new", onclick: () => restart() }, "Nouvelle partie");
  const flagButton = h("button", {
    class: "button button-secondary", type: "button", id: "mn-flag", "aria-pressed": "false",
    title: "Pour jouer au tactile : chaque appui pose ou retire un drapeau", onclick: () => { flagMode = !flagMode; updateHud(); }
  }, "Mode drapeau : off");
  const minesEl = h("strong", { id: "mn-mines" }, "0");
  const timeEl = h("strong", { id: "mn-time" }, "0 s");
  const messageEl = h("p", { class: "mn-message", role: "status", "aria-live": "polite" }, "Ouvre une case pour commencer : le premier clic est toujours sûr.");
  const recordsEl = h("p", { class: "mn-records" });
  const grid = h("div", { class: "mn-grid", role: "grid", "aria-label": "Grille du démineur" });
  const scroller = h("div", { class: "mn-scroll chamfer" }, grid);

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Ouvre toutes les cases sans mine. Un chiffre indique combien de mines touchent la case (diagonales comprises). ",
      "Clic droit ou appui long : drapeau. Clic sur un chiffre déjà entouré du bon nombre de drapeaux : ouvre les cases restantes. ",
      "Gagner rapporte des crédits (25 / 120 / 600), plus une pièce bleue en Difficile."),
    h("div", { class: "mn-bar" },
      h("div", { class: "chips", role: "group", "aria-label": "Difficulté" }, levelButtons),
      h("p", { class: "bet-line" }, "Mines : ", minesEl),
      h("p", { class: "bet-line" }, "Temps : ", timeEl),
      h("div", { class: "mn-buttons" }, newButton, flagButton)
    ),
    messageEl,
    scroller,
    recordsEl
  );

  /* ---------- Grille ---------- */

  function buildBoard() {
    grid.style.setProperty("--cell", `${CELL_PX[level]}px`);
    grid.style.setProperty("--cols", String(game.cols));
    grid.setAttribute("aria-rowcount", String(game.rows));
    grid.setAttribute("aria-colcount", String(game.cols));
    cells = Array.from({ length: game.size }, (_, i) => h("button", {
      class: "mn-cell", type: "button", tabindex: "-1", "data-i": String(i),
      role: "gridcell", "aria-rowindex": String(Math.floor(i / game.cols) + 1), "aria-colindex": String((i % game.cols) + 1)
    }));
    grid.replaceChildren(...cells);
    shown = new Array(game.size).fill("");
    focused = Math.min(focused, game.size - 1);
    cells[focused].tabIndex = 0;
    renderCells();
  }

  const describe = (view, i) => {
    const where = `Ligne ${Math.floor(i / game.cols) + 1}, colonne ${(i % game.cols) + 1}`;
    if (view === "open") return `${where}, ${game.adjacent[i] ? `${game.adjacent[i]} mine${game.adjacent[i] > 1 ? "s" : ""} voisine${game.adjacent[i] > 1 ? "s" : ""}` : "vide"}`;
    return `${where}, ${{ closed: "fermée", flag: "drapeau", mine: "mine", boom: "mine explosée", wrong: "mauvais drapeau" }[view]}`;
  };

  // Met à jour seulement les cases dont l'affichage a changé.
  function renderCells() {
    for (let i = 0; i < game.size; i++) {
      const view = cellView(game, i);
      const key = view === "open" ? `open${game.adjacent[i]}` : view;
      if (shown[i] === key) continue;
      shown[i] = key;
      const cell = cells[i];
      const n = game.adjacent[i];
      cell.className = `mn-cell is-${view}${view === "open" && n ? ` n${n}` : ""}`;
      cell.textContent = view === "open" ? (n ? String(n) : "")
        : view === "flag" ? "⚑" : view === "mine" || view === "boom" ? "✸" : view === "wrong" ? "✕" : "";
      cell.setAttribute("aria-label", describe(view, i));
    }
  }

  /* ---------- Temps ---------- */

  const elapsed = () => Math.floor((baseMs + (startAt ? performance.now() - startAt : 0)) / 1000);
  const tick = () => { timeEl.textContent = fmtTime(Math.min(elapsed(), 999)); };

  function startTimer() {
    if (timer || isOver(game)) return;
    startAt = performance.now();
    timer = window.setInterval(tick, 250);
    tick();
  }
  function pauseTimer() {
    if (startAt) baseMs += performance.now() - startAt;
    startAt = 0;
    window.clearInterval(timer);
    timer = 0;
  }

  /* ---------- Actions ---------- */

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function updateHud() {
    minesEl.textContent = String(minesLeft(game));
    flagButton.setAttribute("aria-pressed", String(flagMode));
    flagButton.textContent = `Mode drapeau : ${flagMode ? "on" : "off"}`;
    levelButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(LEVEL_IDS[i] === level)));
    const best = LEVEL_IDS.map((id) => `${LEVELS[id].label} : ${wallet.data.mines[id] ? fmtTime(wallet.data.mines[id]) : "—"}`);
    recordsEl.textContent = `Meilleurs temps — ${best.join(" · ")}`;
  }

  function restart() {
    pauseTimer();
    baseMs = 0;
    game = newGame(level);
    buildBoard();
    tick();
    say("Ouvre une case pour commencer : le premier clic est toujours sûr.");
    updateHud();
    if (active) cells[focused].focus({ preventScroll: true });
  }

  function setLevel(id) {
    if (id === level) return;
    level = id;
    focused = 0;
    restart();
  }

  function act(i, kind) {
    if (isOver(game)) return;
    focused = i;
    const before = game.status;
    if (kind === "flag") toggleFlag(game, i);
    else if (game.open[i]) chord(game, i);
    else reveal(game, i);

    if (before === "ready" && game.status === "playing") startTimer();
    renderCells();
    updateHud();
    if (game.status === "won") win();
    else if (game.status === "lost") lose();
  }

  function lose() {
    pauseTimer();
    tick();
    say("Boum ! Tu as touché une mine. Relance une partie.", "lose");
  }

  function win() {
    pauseTimer();
    const seconds = Math.max(1, Math.round(baseMs / 1000));
    tick();
    const prize = LEVELS[level];
    if (prize.credits) wallet.addCredits(prize.credits);
    if (prize.blue) wallet.addBlue(prize.blue);
    const record = wallet.setMinesBest(level, seconds);
    const gains = `+${fmt(prize.credits)} crédits${prize.blue ? ` et +${prize.blue} pièce bleue` : ""}`;
    say(`Gagné en ${fmtTime(seconds)} ! ${gains}.${record ? " Nouveau record !" : ""}`, "win");
    updateHud();
  }

  /* ---------- Entrées (souris, tactile, clavier) ---------- */

  const indexOf = (event) => {
    const cell = event.target instanceof Element ? event.target.closest(".mn-cell") : null;
    return cell ? Number(cell.dataset.i) : -1;
  };

  grid.addEventListener("click", (event) => {
    const i = indexOf(event);
    if (i < 0) return;
    if (performance.now() - longFlagAt < 700) return;      // l'appui long vient de poser un drapeau
    act(i, flagMode && !game.open[i] ? "flag" : "open");
  });
  grid.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const i = indexOf(event);
    if (i < 0 || performance.now() - longFlagAt < 700) return;
    act(i, "flag");
  });
  grid.addEventListener("auxclick", (event) => {            // clic du milieu = accord
    if (event.button !== 1) return;
    const i = indexOf(event);
    if (i >= 0) { event.preventDefault(); act(i, "open"); }
  });
  grid.addEventListener("pointerdown", (event) => {
    const i = indexOf(event);
    if (i < 0 || event.pointerType === "mouse") return;
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      if (isOver(game) || game.open[i]) return;
      longFlagAt = performance.now();
      act(i, "flag");
    }, LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    grid.addEventListener(type, () => window.clearTimeout(pressTimer));
  }

  grid.addEventListener("keydown", (event) => {
    const i = indexOf(event);
    if (i < 0) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -game.cols, ArrowDown: game.cols };
    if (event.key in moves) {
      event.preventDefault();
      const col = i % game.cols;
      if ((event.key === "ArrowLeft" && col === 0) || (event.key === "ArrowRight" && col === game.cols - 1)) return;
      const next = i + moves[event.key];
      if (next < 0 || next >= game.size) return;
      cells[focused].tabIndex = -1;
      focused = next;
      cells[next].tabIndex = 0;
      cells[next].focus();
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      act(i, flagMode && !game.open[i] ? "flag" : "open");
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      act(i, "flag");
    }
  });

  buildBoard();
  updateHud();

  return {
    activate() {
      active = true;
      if (game.status === "playing") startTimer();
      updateHud();
    },
    deactivate() {
      active = false;
      window.clearTimeout(pressTimer);
      pauseTimer();               // le temps ne court pas pendant qu'on joue à autre chose
      tick();
    }
  };
}
