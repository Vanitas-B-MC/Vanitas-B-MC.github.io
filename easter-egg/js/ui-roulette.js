// js/ui-roulette.js — interface de la Roulette (la logique est dans roulette.js).
// On mise des pièces bleues, trouvées dans le Snake.
//
// Les mises sont retirées du portefeuille au moment où on pose les jetons, et les gains
// sont versés à la fin de l'animation (ou tout de suite si on quitte la page pendant le tour).

import { WHEEL, colorOf, betKey, resolve, pickNumber, spinTarget } from "./roulette.js";
import { h, fmt, prefersReducedMotion } from "./ui.js";

const CHIP_VALUES = [1, 2, 5, 10];
const FULL = Math.PI * 2;
const SPIN_MS = 4600;

const COLORS = { red: "#c4153a", black: "#14141f", green: "#0e8a4a" };

// Plateau : 3 lignes de 12 numéros, comme sur une vraie table.
const ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
];

const OUTSIDE = [
  { type: "low", label: "1–18" },
  { type: "even", label: "Pair" },
  { type: "red", label: "Rouge", tint: "red" },
  { type: "black", label: "Noir", tint: "black" },
  { type: "odd", label: "Impair" },
  { type: "high", label: "19–36" }
];

const DOZENS = [
  { type: "dozen", d: 1, label: "1re douzaine" },
  { type: "dozen", d: 2, label: "2e douzaine" },
  { type: "dozen", d: 3, label: "3e douzaine" }
];

export function createRouletteUI(root, wallet) {
  const bets = new Map();      // clé de mise -> { type, n?, d?, amount }
  const undo = [];             // clés dans l'ordre où on a posé les jetons
  const history = [];          // derniers numéros sortis
  const counts = new Map();    // combien de fois chaque numéro est sorti (cette session)
  let lastBets = [];           // mises du dernier tour, pour « Rejouer »
  let chip = 1;
  let spinning = false;
  let pending = null;          // gain en attente de versement pendant un tour
  let rotation = 0;
  let winningNumber = null;
  let active = false;

  /* ---------- Roue (canvas) ---------- */

  const canvas = h("canvas", { class: "wheel-canvas", width: 340, height: 340, "aria-label": "Roue de la roulette" });
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 340 * dpr;
  canvas.height = 340 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function drawWheel() {
    const size = 340;
    const c = size / 2;
    const outer = c - 6;
    const inner = outer * 0.62;
    const slice = FULL / WHEEL.length;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);

    // Les angles de roulette.js partent du haut, le canvas part de la droite : -90°.
    WHEEL.forEach((number, i) => {
      const a0 = i * slice - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
      ctx.arc(0, 0, outer, a0, a0 + slice);
      ctx.arc(0, 0, inner, a0 + slice, a0, true);
      ctx.closePath();
      ctx.fillStyle = COLORS[colorOf(number)];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(a0 + slice / 2);
      ctx.translate((outer + inner) / 2, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), 0, 0);
      ctx.restore();
    });

    // Moyeu
    ctx.beginPath();
    ctx.arc(0, 0, inner - 6, 0, FULL);
    ctx.fillStyle = "#0b0b14";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Cercle extérieur et repère fixe en haut
    ctx.beginPath();
    ctx.arc(c, c, outer + 2, 0, FULL);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#fcee0a";
    ctx.beginPath();
    ctx.moveTo(c - 9, 0);
    ctx.lineTo(c + 9, 0);
    ctx.lineTo(c, 20);
    ctx.closePath();
    ctx.fill();

    // Le numéro qui vient de sortir, au centre
    if (winningNumber !== null) {
      ctx.fillStyle = COLORS[colorOf(winningNumber)];
      ctx.beginPath();
      ctx.arc(c, c, 36, 0, FULL);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "700 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(winningNumber), c, c + 1);
    }
  }

  /* ---------- Plateau de mises ---------- */

  const cellRefs = new Map();   // clé -> { cell, badge }

  function betCell(def, className, content, gridStyle) {
    const key = betKey(def);
    const badge = h("span", { class: "bet-badge", hidden: true });
    const cell = h("button", {
      class: `bet-cell ${className}`,
      type: "button",
      "data-key": key,
      style: gridStyle,
      onclick: () => placeBet(def)
    }, content, badge);
    cellRefs.set(key, { cell, badge });
    return cell;
  }

  const numberCells = [];
  numberCells.push(betCell({ type: "straight", n: 0 }, "is-green is-zero", "0", "grid-column:1; grid-row:1 / span 3"));
  ROWS.forEach((row, r) => {
    row.forEach((n, c) => {
      numberCells.push(betCell({ type: "straight", n }, `is-${colorOf(n)}`, String(n), `grid-column:${c + 2}; grid-row:${r + 1}`));
    });
  });

  const dozenCells = DOZENS.map((def, i) =>
    betCell(def, "is-outside", def.label, `grid-column:${2 + i * 4} / span 4; grid-row:4`));
  const outsideCells = OUTSIDE.map((def, i) =>
    betCell(def, `is-outside${def.tint ? ` is-${def.tint}` : ""}`, def.label, `grid-column:${2 + i * 2} / span 2; grid-row:5`));

  // Colonnes (payées 2 pour 1) : à droite de chaque rangée de numéros.
  const columnCells = ROWS.map((_, r) =>
    betCell({ type: "column", c: 3 - r }, "is-outside", "2:1", `grid-column:14; grid-row:${r + 1}`));

  const board = h("div", { class: "rl-board", role: "group", "aria-label": "Plateau de mises" },
    numberCells, columnCells, dozenCells, outsideCells);

  /* ---------- Contrôles ---------- */

  const chipButtons = CHIP_VALUES.map((value) =>
    h("button", {
      class: "chip chip-blue",
      type: "button",
      "aria-pressed": String(value === chip),
      onclick: () => { chip = value; updateControls(); }
    }, String(value)));

  const spinButton = h("button", { class: "button button-primary", type: "button", id: "rl-spin", onclick: spin }, "Lancer la roue");
  const undoButton = h("button", { class: "button button-secondary", type: "button", id: "rl-undo", onclick: undoLast }, "Annuler");
  const clearButton = h("button", { class: "button button-secondary", type: "button", id: "rl-clear", onclick: clearBets }, "Tout retirer");
  const replayButton = h("button", { class: "button button-secondary", type: "button", id: "rl-replay", onclick: replayBets, title: "Repose les mises du tour précédent" }, "Rejouer");
  const doubleButton = h("button", { class: "button button-secondary", type: "button", id: "rl-double", onclick: doubleBets, title: "Double toutes les mises posées" }, "Doubler");
  const statsEl = h("p", { class: "rl-stats", id: "rl-stats" });

  const totalEl = h("strong", {}, "0");
  const messageEl = h("p", { class: "rl-message", role: "status", "aria-live": "polite" },
    "Pose des jetons sur le plateau, puis lance la roue.");
  const hint = h("p", { class: "hint", hidden: true },
    "Tu n'as pas de pièce bleue. ",
    h("a", { href: "#snake" }, "Trouves-en dans le Snake →"));
  const historyEl = h("ol", { class: "rl-history", "aria-label": "Derniers numéros" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Roulette européenne (0 à 36). Numéro plein payé 35 pour 1, douzaine et colonne 2 pour 1, le reste 1 pour 1. Le 0 fait perdre les mises extérieures."),
    h("div", { class: "rl-layout" },
      h("div", { class: "rl-wheel chamfer" }, canvas, historyEl, statsEl),
      h("div", { class: "rl-side" },
        h("div", { class: "rl-chips" },
          h("p", { class: "bet-line" }, "Jeton : "),
          h("div", { class: "chips", role: "group", "aria-label": "Valeur du jeton" }, chipButtons)),
        h("p", { class: "bet-line" }, "Mise totale : ", totalEl, " pièces bleues"),
        h("div", { class: "rl-buttons" }, spinButton, undoButton, clearButton, replayButton, doubleButton),
        messageEl,
        hint
      )
    ),
    h("div", { class: "rl-board-wrap" }, board)
  );

  /* ---------- Mises ---------- */

  const totalBet = () => [...bets.values()].reduce((sum, b) => sum + b.amount, 0);

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function placeBet(def) {
    if (spinning) return;
    // On fige la valeur du jeton AVANT de payer : retirer la pièce prévient les écrans, qui
    // peuvent changer `chip` (si le solde ne suffit plus) avant même qu'on enregistre la mise.
    const amount = chip;
    if (!wallet.spendBlue(amount)) {
      say("Pas assez de pièces bleues pour ce jeton.", "lose");
      return;
    }
    const key = betKey(def);
    const existing = bets.get(key);
    if (existing) existing.amount += amount;
    else bets.set(key, { ...def, amount });
    undo.push({ key, amount });
    updateControls();
  }

  // Repose les mises du tour précédent (si le solde le permet).
  function replayBets() {
    if (spinning || !lastBets.length) return;
    const need = lastBets.reduce((sum, b) => sum + b.amount, 0);
    if (need > wallet.blue) { say("Pas assez de pièces bleues pour rejouer ces mises.", "lose"); return; }
    for (const b of lastBets) {
      const amount = b.amount;                      // figé avant de payer
      if (!wallet.spendBlue(amount)) continue;
      const key = betKey(b);
      const existing = bets.get(key);
      if (existing) existing.amount += amount;
      else bets.set(key, { ...b, amount });
      undo.push({ key, amount });
    }
    updateControls();
  }

  // Double chaque mise posée (même répartition, montants x2).
  function doubleBets() {
    if (spinning || !bets.size) return;
    const current = [...bets.entries()].map(([key, b]) => ({ key, amount: b.amount, bet: b }));
    const need = current.reduce((sum, c) => sum + c.amount, 0);
    if (need > wallet.blue) { say("Pas assez de pièces bleues pour doubler.", "lose"); return; }
    for (const c of current) {
      if (!wallet.spendBlue(c.amount)) continue;
      c.bet.amount += c.amount;
      undo.push({ key: c.key, amount: c.amount });
    }
    updateControls();
  }

  function removeAmount(key, amount) {
    const bet = bets.get(key);
    if (!bet) return;
    bet.amount -= amount;
    if (bet.amount <= 0) bets.delete(key);
    wallet.addBlue(amount);
  }

  function undoLast() {
    if (spinning || !undo.length) return;
    const last = undo.pop();
    removeAmount(last.key, last.amount);
    updateControls();
  }

  function clearBets() {
    if (spinning || !bets.size) return;
    wallet.addBlue(totalBet());
    bets.clear();
    undo.length = 0;
    updateControls();
  }

  // Met à jour boutons, badges et compteurs sur place (le solde change en continu ailleurs).
  function updateControls() {
    const total = totalBet();
    totalEl.textContent = fmt(total);

    chipButtons.forEach((button, i) => {
      button.setAttribute("aria-pressed", String(CHIP_VALUES[i] === chip));
      button.disabled = spinning || CHIP_VALUES[i] > wallet.blue;
    });
    // Si le jeton choisi est trop cher, on retombe sur le plus grand qu'on peut payer.
    if (chip > wallet.blue && !spinning) {
      const affordable = CHIP_VALUES.filter((v) => v <= wallet.blue);
      chip = affordable.length ? affordable[affordable.length - 1] : 1;
      chipButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(CHIP_VALUES[i] === chip)));
    }

    replayButton.disabled = spinning || lastBets.length === 0;
    doubleButton.disabled = spinning || total === 0;
    spinButton.disabled = spinning || total === 0;
    undoButton.disabled = spinning || undo.length === 0;
    clearButton.disabled = spinning || total === 0;
    hint.hidden = wallet.blue > 0 || total > 0 || spinning;

    for (const [key, { cell, badge }] of cellRefs) {
      const bet = bets.get(key);
      badge.hidden = !bet;
      badge.textContent = bet ? String(bet.amount) : "";
      cell.disabled = spinning;
      cell.classList.toggle("has-bet", Boolean(bet));
    }
  }

  /* ---------- Tour de roue ---------- */

  function settle() {
    if (!pending) return;
    const { result } = pending;
    pending = null;
    spinning = false;

    if (result.returned > 0) wallet.addBlue(result.returned);

    winningNumber = result.number;
    counts.set(result.number, (counts.get(result.number) || 0) + 1);
    lastBets = result.lines.map(({ type, n, d, c, amount }) => ({ type, n, d, c, amount }));
    history.unshift(result.number);
    history.length = Math.min(history.length, 10);
    renderHistory();

    const label = `${result.number} (${{ red: "rouge", black: "noir", green: "vert" }[colorOf(result.number)]})`;
    if (result.net > 0) say(`Sorti : ${label}. Gain : +${fmt(result.net)} pièces bleues !`, "win");
    else if (result.net === 0) say(`Sorti : ${label}. Mises rendues.`, "push");
    else say(`Sorti : ${label}. Perdu : ${fmt(-result.net)} pièces bleues.`, "lose");

    // Vide le plateau pour le tour suivant, en gardant en évidence les mises gagnantes
    // et la case du numéro sorti (les marques disparaissent au prochain tour).
    bets.clear();
    undo.length = 0;
    updateControls();
    for (const line of result.lines) {
      if (line.win) cellRefs.get(betKey(line))?.cell.classList.add("is-win");
    }
    cellRefs.get(`straight:${result.number}`)?.cell.classList.add("is-landed");

    drawWheel();
    if (active) spinButton.focus({ preventScroll: true });
  }

  function renderStats() {
    const spins = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!spins) { statsEl.textContent = ""; return; }
    let red = 0; let black = 0; let zero = 0;
    for (const [n, k] of counts) { const col = colorOf(n); if (col === "red") red += k; else if (col === "black") black += k; else zero += k; }
    const hot = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    statsEl.textContent = `${spins} tirage${spins > 1 ? "s" : ""} : ${red} rouge · ${black} noir · ${zero} zéro. Plus fréquent : ${hot[0]} (×${hot[1]}).`;
  }

  function renderHistory() {
    renderStats();
    historyEl.replaceChildren(...history.map((n) =>
      h("li", { class: `pill is-${colorOf(n)}` }, String(n))));
  }

  function spin() {
    if (spinning || !bets.size) return;
    spinning = true;
    winningNumber = null;
    for (const { cell } of cellRefs.values()) cell.classList.remove("is-win", "is-landed");

    const number = pickNumber();
    pending = { result: resolve([...bets.values()], number) };
    say("La bille tourne…");
    updateControls();

    const from = rotation;
    const to = spinTarget(from, number, 5);

    if (prefersReducedMotion()) {
      rotation = to;
      drawWheel();
      setTimeout(settle, 500);
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / SPIN_MS, 1);
      const eased = 1 - (1 - t) ** 4;                 // freine de plus en plus
      rotation = from + (to - from) * eased;
      drawWheel();
      if (t < 1) requestAnimationFrame(tick);
      else { rotation = to; settle(); }
    };
    requestAnimationFrame(tick);
  }

  // Si on quitte la page en plein tour, on verse tout de suite le résultat (il est déjà tiré).
  window.addEventListener("pagehide", settle);

  // Le solde change aussi ailleurs : on met à jour les boutons sur place.
  wallet.subscribe(() => { if (active) updateControls(); });

  drawWheel();
  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; }
  };
}
