// js/ui-breach.js — affichage et commandes du « Breach Protocol » (logique dans breach.js).
// La grille est faite de vrais boutons : jouable à la souris, au doigt et au clavier
// (flèches pour se déplacer, Entrée ou Espace pour valider une case).

import {
  DIFFICULTIES, generate, createState, pick, canPick, isUsed, activeLine, bufferCodes, progress,
  tick, giveUp, rewards
} from "./breach.js";
import { h, fmt, scrollToPlay } from "./ui.js";

const REASONS = {
  done: "Tous les daemons sont piratés.",
  buffer: "Tampon plein.",
  stuck: "Plus aucune case jouable.",
  time: "Temps écoulé.",
  quit: "Connexion coupée."
};

export function createBreachUI(root, wallet) {
  let active = false;
  let difficulty = 1;
  let state = null;
  let timerId = 0;
  let lastTick = 0;
  let focus = { r: 0, c: 0 };
  let cells = [];
  let paid = false;          // la récompense n'est versée qu'une fois par partie

  /* ---------- Squelette ---------- */

  const grid = h("div", { class: "bp-grid", id: "bp-grid", role: "grid", "aria-label": "Matrice de codes" });
  const bufferEl = h("ol", { class: "bp-buffer", id: "bp-buffer", "aria-label": "Tampon" });
  const daemonEl = h("ul", { class: "bp-daemons", id: "bp-daemons" });
  const timeFill = h("span", { class: "sv-bar-fill bp-time-fill" });
  const timeText = h("span", { class: "sv-bar-text", id: "bp-time" }, "0 s");
  const resultTitle = h("p", { class: "overlay-title" });
  const resultText = h("p", { class: "overlay-text" });
  const againButton = h("button", { class: "button button-primary", id: "bp-again", type: "button", onclick: () => start() }, "Rejouer");
  const result = h("div", { class: "game-overlay bp-result", id: "bp-result", hidden: true }, resultTitle, resultText, againButton);
  const bestEl = h("strong", { id: "bp-best" }, "0");

  const diffButtons = Object.values(DIFFICULTIES).map((d) =>
    h("button", {
      class: "button button-secondary bp-diff", type: "button", "data-diff": d.id, "aria-pressed": "false",
      onclick: () => { difficulty = d.id; syncDifficulty(); }
    }, `${d.name} (${d.size}×${d.size})`));

  const startButton = h("button", { class: "button button-primary", id: "bp-start", type: "button", onclick: () => start() }, "Lancer le piratage");
  const quitButton = h("button", { class: "button button-secondary", id: "bp-quit", type: "button", hidden: true, onclick: () => { if (state) { giveUp(state); finish(); } } }, "Abandonner");

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Choisis des codes dans la matrice pour remplir le tampon : le 1er dans la ligne du haut, puis en alternant colonne et ligne à partir de la dernière case choisie. Pirate les daemons en alignant leurs codes d'affilée. Les crédits dépendent des daemons piratés ; pirate-les tous en Moyen ou Difficile pour gagner des pièces bleues."),
    h("div", { class: "bp-config" },
      h("div", { class: "bp-diffs", role: "group", "aria-label": "Difficulté" }, diffButtons),
      startButton, quitButton),
    h("div", { class: "bp-layout" },
      h("div", { class: "bp-board chamfer" },
        h("div", { class: "bp-timer sv-bar", role: "img", "aria-label": "Temps restant" }, timeFill, timeText),
        h("div", { class: "bp-stage" }, grid, result)),
      h("aside", { class: "bp-side" },
        h("h3", { class: "subhead" }, "Tampon"),
        bufferEl,
        h("h3", { class: "subhead" }, "Daemons"),
        daemonEl,
        h("p", { class: "hint" }, "Meilleur gain : ", bestEl, " ¤"))));

  function syncDifficulty() {
    diffButtons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.diff) === difficulty)));
  }

  /* ---------- Affichage ---------- */

  function buildGrid() {
    const { size, matrix } = state.puzzle;
    grid.style.setProperty("--n", size);
    cells = [];
    const rows = [];
    for (let r = 0; r < size; r++) {
      const row = h("div", { class: "bp-row", role: "row" });
      for (let c = 0; c < size; c++) {
        const cell = h("button", {
          class: "bp-cell", type: "button", role: "gridcell", "data-r": r, "data-c": c,
          tabindex: "-1", onclick: () => play(r, c), onfocus: () => { focus = { r, c }; }
        }, matrix[r][c]);
        cells.push(cell);
        row.append(cell);
      }
      rows.push(row);
    }
    grid.replaceChildren(...rows);
    focus = { r: 0, c: 0 };
  }

  const cellAt = (r, c) => cells[r * state.puzzle.size + c];

  function render() {
    if (!state) return;
    const line = activeLine(state);
    const { size } = state.puzzle;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = cellAt(r, c);
        const used = isUsed(state, r, c);
        const playable = canPick(state, r, c);
        const inLine = !state.over && (line.type === "row" ? r === line.index : c === line.index);
        cell.classList.toggle("is-used", used);
        cell.classList.toggle("is-line", inLine);
        cell.classList.toggle("is-playable", playable);
        cell.disabled = state.over || used;
        cell.setAttribute("aria-label", `${state.puzzle.matrix[r][c]}, ligne ${r + 1}, colonne ${c + 1}${used ? ", déjà pris" : playable ? "" : ", indisponible"}`);
        cell.tabIndex = r === focus.r && c === focus.c ? 0 : -1;
      }
    }

    const codes = bufferCodes(state);
    bufferEl.replaceChildren(...Array.from({ length: state.puzzle.bufferSize }, (_, i) =>
      h("li", { class: `bp-slot${codes[i] ? " is-filled" : ""}` }, codes[i] || "")));

    daemonEl.replaceChildren(...progress(state).map(({ seq, status }) =>
      h("li", { class: `bp-daemon is-${status}`, "data-status": status },
        h("strong", {}, seq.name),
        h("span", { class: "bp-codes" }, seq.codes.join(" ")),
        h("em", {}, status === "done" ? "Piraté" : status === "failed" ? "Échec" : `${fmt(seq.reward)} ¤`))));

    updateTimer();
  }

  function updateTimer() {
    if (!state) return;
    timeFill.style.width = `${(state.timeLeft / state.puzzle.time) * 100}%`;
    timeText.textContent = `${Math.ceil(state.timeLeft)} s`;
    timeFill.classList.toggle("is-low", state.timeLeft <= 10);
  }

  /* ---------- Partie ---------- */

  function start() {
    scrollToPlay(root.querySelector(".bp-board"));
    paid = false;
    state = createState(generate(Math.random, difficulty));
    result.hidden = true;
    startButton.hidden = true;
    quitButton.hidden = false;
    diffButtons.forEach((b) => { b.disabled = true; });
    buildGrid();
    render();
    cellAt(0, 0).focus({ preventScroll: true });
    startTimer();
  }

  function startTimer() {
    window.clearInterval(timerId);
    lastTick = performance.now();
    timerId = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - lastTick) / 1000, 1);
      lastTick = now;
      if (!state || state.over) return;
      if (tick(state, dt)) { finish(); return; }
      updateTimer();
    }, 100);
  }

  function stopTimer() {
    window.clearInterval(timerId);
    timerId = 0;
  }

  function play(r, c) {
    if (!state || !pick(state, r, c)) return;
    // Place le curseur clavier dans la ligne ou colonne à jouer
    const line = activeLine(state);
    if (!state.over) focus = line.type === "row" ? { r: line.index, c: firstFree(line) } : { r: firstFree(line), c: line.index };
    render();
    if (state.over) finish();
    else cellAt(focus.r, focus.c)?.focus({ preventScroll: true });
  }

  function firstFree(line) {
    const { size } = state.puzzle;
    for (let k = 0; k < size; k++) {
      const r = line.type === "row" ? line.index : k;
      const c = line.type === "row" ? k : line.index;
      if (canPick(state, r, c)) return k;
    }
    return 0;
  }

  function finish() {
    stopTimer();
    render();
    if (paid) return;
    paid = true;
    // Valeurs figées avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const gain = rewards(state);
    const reason = REASONS[state.reason] || "";
    if (gain.credits > 0) wallet.addCredits(gain.credits);
    if (gain.coins > 0) wallet.addBlue(gain.coins);
    const record = wallet.setBest("bestBreach", gain.credits);
    bestEl.textContent = fmt(wallet.data.bestBreach);

    const ok = gain.hacked > 0;
    resultTitle.textContent = gain.hacked === gain.total ? "Accès total" : ok ? "Piratage partiel" : "Échec du piratage";
    const parts = [`${gain.hacked} / ${gain.total} daemons`, `+${fmt(gain.credits)} crédits`];
    if (gain.coins > 0) parts.push(`+${gain.coins} pièce${gain.coins > 1 ? "s" : ""} bleue${gain.coins > 1 ? "s" : ""}`);
    resultText.textContent = `${reason}\n${parts.join(" · ")}${record && gain.credits > 0 ? " — nouveau record !" : ""}`;
    result.hidden = false;
    againButton.focus({ preventScroll: true });
    startButton.hidden = false;
    quitButton.hidden = true;
    diffButtons.forEach((b) => { b.disabled = false; });
  }

  /* ---------- Clavier : flèches dans la grille ---------- */

  grid.addEventListener("keydown", (event) => {
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const move = moves[event.key];
    if (!move || !state) return;
    event.preventDefault();
    const { size } = state.puzzle;
    focus = {
      r: Math.min(size - 1, Math.max(0, focus.r + move[0])),
      c: Math.min(size - 1, Math.max(0, focus.c + move[1]))
    };
    render();
    cellAt(focus.r, focus.c).focus({ preventScroll: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else if (active && state && !state.over) startTimer();
  });

  /* ---------- Démarrage ---------- */

  syncDifficulty();
  bestEl.textContent = fmt(wallet.data.bestBreach);
  grid.append(h("p", { class: "hint bp-placeholder" }, "Choisis une difficulté, puis lance le piratage."));

  return {
    activate() {
      active = true;
      bestEl.textContent = fmt(wallet.data.bestBreach);
      if (state && !state.over) startTimer();
    },
    deactivate() {
      active = false;
      stopTimer();   // le temps ne s'écoule pas quand on est ailleurs
    }
  };
}
