// js/ui-tetris.js — affichage et commandes du Tetris (la logique est dans tetris.js).
// Toutes les 6 lignes, une pièce bleue est ajoutée au portefeuille.

import {
  COLS, ROWS, TYPES, LINES_PER_COIN, NEXT_COUNT,
  createState, tryMove, rotate, softDrop, hardDrop, gravity, isGrounded, ghostY,
  holdPiece, cellsOf, dropInterval
} from "./tetris.js";
import { h, fmt, scrollToPlay, prefersReducedMotion, themeColor } from "./ui.js";

const CELL = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const SIDE_W = 120;
const SIDE_H = 330;

const LOCK_DELAY = 500;       // ms pendant lesquelles on peut encore glisser une pièce posée
const MAX_LOCK_RESETS = 15;   // pour éviter de repousser la pose indéfiniment

export function createTetrisUI(root, wallet) {
  let active = false;
  let state = createState();
  let status = "idle";        // idle | running | paused | over
  let rafId = 0;
  let lastTime = 0;
  let gravityAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let toastTimer = 0;

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "tt-board", width: BOARD_W, height: BOARD_H, "aria-label": "Grille de Tetris" });
  const sideCanvas = h("canvas", { id: "tt-side", "aria-hidden": "true", width: SIDE_W, height: SIDE_H });
  const toast = h("p", { class: "game-toast", id: "tt-toast", "aria-live": "polite" });

  const overlayTitle = h("p", { class: "overlay-title" }, "Tetris");
  const overlayText = h("p", { class: "overlay-text" }, "Lance la partie. Sur téléphone : toucher = tourner, glisser = bouger, coup sec vers le bas = chute.");
  const startButton = h("button", { class: "button button-primary", id: "tt-start", type: "button" }, "Lancer la partie");
  const overlay = h("div", { class: "game-overlay", id: "tt-overlay" }, overlayTitle, overlayText, startButton);

  const scoreEl = h("strong", { id: "tt-score" }, "0");
  const bestEl = h("strong", { id: "tt-best" }, "0");
  const linesEl = h("strong", { id: "tt-lines" }, "0");
  const levelEl = h("strong", { id: "tt-level" }, "1");
  const coinsEl = h("strong", { id: "tt-coins" }, "0");
  const stateEl = h("p", { class: "game-state", id: "tt-state", "aria-live": "polite" }, "Prêt");
  const progressBar = h("span", { class: "tt-progress-bar" });
  const progressText = h("span", { class: "tt-progress-text" });

  const touch = h("div", { class: "tt-touch", "aria-label": "Commandes tactiles" },
    touchButton("rotate", "⟳", "Tourner"),
    touchButton("left", "◀", "Gauche", true),
    touchButton("down", "▼", "Descendre", true),
    touchButton("right", "▶", "Droite", true),
    touchButton("drop", "⤓", "Chute"),
    touchButton("hold", "Garder", "Garder la pièce"));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      `Complète des lignes pour les faire disparaître. Toutes les ${LINES_PER_COIN} lignes, tu gagnes une pièce bleue (Roulette, paliers du Clicker).`),
    h("div", { class: "tt-layout" },
      h("div", { class: "tt-board-wrap chamfer" },
        h("div", { class: "game-stage tt-stage" }, board, toast, overlay)),
      h("aside", { class: "tt-side" },
        h("dl", { class: "tt-stats" },
          stat("Score", scoreEl), stat("Record", bestEl), stat("Lignes", linesEl),
          stat("Niveau", levelEl),
          h("div", {}, h("dt", {}, h("span", { class: "coin", "aria-hidden": "true" }), " Pièces"), h("dd", {}, coinsEl))),
        h("div", { class: "tt-progress", "aria-live": "off" },
          h("p", {}, progressText),
          h("span", { class: "tt-progress-track" }, progressBar)),
        sideCanvas,
        stateEl,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←"), h("kbd", {}, "→"), " ou ", h("kbd", {}, "Q"), h("kbd", {}, "D"), " bouger"),
          h("li", {}, h("kbd", {}, "↑"), " ou ", h("kbd", {}, "Z"), " tourner · ", h("kbd", {}, "X"), " sens inverse"),
          h("li", {}, h("kbd", {}, "↓"), " ou ", h("kbd", {}, "S"), " descendre · ", h("kbd", {}, "Espace"), " chute"),
          h("li", {}, h("kbd", {}, "C"), " garder · ", h("kbd", {}, "P"), " pause")))),
    touch
  );

  function stat(label, el) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, el));
  }

  function touchButton(act, label, aria, repeat = false) {
    return h("button", { type: "button", "data-act": act, "data-repeat": repeat ? "1" : null, "aria-label": aria }, label);
  }

  /* ---------- Canvas (net sur les écrans haute densité) ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const [canvas, w, hgt] of [[board, BOARD_W, BOARD_H], [sideCanvas, SIDE_W, SIDE_H]]) {
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
  }
  const ctx = board.getContext("2d");
  const sideCtx = sideCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sideCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let colors = {};
  function loadColors() {
    colors = {
      I: themeColor("--cyan", "#00f0ff"),
      O: themeColor("--yellow", "#fcee0a"),
      T: "#a066ff",
      S: "#3ddc84",
      Z: themeColor("--pink", "#ff2a6d"),
      J: "#4d7cff",
      L: "#ff9f1c",
      bg: "#0a0a12",
      grid: "rgba(255, 255, 255, 0.045)",
      text: "#8c8fa8"
    };
    if (active) draw();
  }
  loadColors();
  window.addEventListener("mc-theme", loadColors);

  /* ---------- Dessin ---------- */

  function drawCell(c, x, y, size, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = alpha === 1 ? 8 : 0;
    c.fillRect(x + 1, y + 1, size - 2, size - 2);
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255, 255, 255, 0.25)";
    c.fillRect(x + 1, y + 1, size - 2, 3);
    c.globalAlpha = 1;
  }

  function drawMini(type, cx, cy, size, alpha = 1) {
    const cells = cellsOf({ type, rot: 0, x: 0, y: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const hgt = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = cx - (w * size) / 2 - Math.min(...xs) * size;
    const oy = cy - (hgt * size) / 2 - Math.min(...ys) * size;
    for (const [x, y] of cells) drawCell(sideCtx, ox + x * size, oy + y * size, size, colors[type], alpha);
  }

  function draw() {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, BOARD_H); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(BOARD_W, y * CELL + 0.5); }
    ctx.stroke();

    state.grid.forEach((row, y) => row.forEach((id, x) => {
      if (id) drawCell(ctx, x * CELL, y * CELL, CELL, colors[TYPES[id - 1]]);
    }));

    if (!state.over) {
      // Fantôme : l'endroit où la pièce va se poser.
      const ghost = { ...state.piece, y: ghostY(state) };
      for (const [x, y] of cellsOf(ghost)) if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, colors[state.piece.type], 0.25);
      for (const [x, y] of cellsOf(state.piece)) if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, colors[state.piece.type]);
    }

    drawSide();
  }

  function drawSide() {
    sideCtx.clearRect(0, 0, SIDE_W, SIDE_H);
    sideCtx.fillStyle = colors.text;
    sideCtx.font = "12px 'Share Tech Mono', monospace";
    sideCtx.textAlign = "center";

    sideCtx.fillText("GARDÉE", SIDE_W / 2, 16);
    if (state.hold) drawMini(state.hold, SIDE_W / 2, 56, 20, state.canHold ? 1 : 0.35);

    sideCtx.fillStyle = colors.text;
    sideCtx.fillText("SUIVANTES", SIDE_W / 2, 112);
    state.queue.slice(0, NEXT_COUNT).forEach((type, i) => drawMini(type, SIDE_W / 2, 156 + i * 62, 20));
  }

  /* ---------- Affichage des chiffres ---------- */

  function updateHud() {
    scoreEl.textContent = fmt(state.score);
    bestEl.textContent = fmt(Math.max(wallet.data.bestTetris, state.score));
    linesEl.textContent = fmt(state.lines);
    levelEl.textContent = fmt(state.level + 1);
    coinsEl.textContent = fmt(state.coins);
    progressText.textContent = `Prochaine pièce bleue : ${state.lineCarry} / ${LINES_PER_COIN} lignes`;
    progressBar.style.width = `${(state.lineCarry / LINES_PER_COIN) * 100}%`;
  }

  const STATUS_LABELS = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Terminé" };

  function setStatus(next) {
    status = next;
    stateEl.textContent = STATUS_LABELS[next];
  }

  function say(text) {
    toast.textContent = text;
    toast.classList.remove("is-on");
    if (prefersReducedMotion()) { toast.style.opacity = "1"; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.style.opacity = ""; }, 1400); return; }
    void toast.offsetWidth;
    toast.classList.add("is-on");
  }

  // takeFocus : pas pour la pause, sinon la touche qui vient de mettre en pause relancerait le jeu.
  function showOverlay(title, text, buttonLabel, takeFocus = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonLabel;
    overlay.hidden = false;
    if (takeFocus) startButton.focus({ preventScroll: true });
  }

  /* ---------- Boucle de jeu ---------- */

  function newPieceReset() {
    gravityAcc = 0;
    lockTimer = 0;
    lockResets = 0;
  }

  // Résultat d'une pose : pièces bleues, lignes, fin de partie.
  function afterLock(result) {
    if (!result) return;
    newPieceReset();

    if (result.coins > 0) {
      wallet.addBlue(result.coins);
      const label = `+${result.coins} pièce${result.coins > 1 ? "s" : ""} bleue${result.coins > 1 ? "s" : ""}`;
      say(result.cleared === 4 ? `Tetris ! ${label}` : label);
    } else if (result.cleared === 4) {
      say("Tetris !");
    }

    updateHud();
    if (state.over) finish();
  }

  // Un déplacement réussi sur une pièce posée repousse un peu sa fixation.
  function moved() {
    if (lockTimer > 0 && lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets += 1;
    }
  }

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.min(time - lastTime, 100) : 0;   // on plafonne : pas de rafale après un ralentissement
    lastTime = time;

    if (isGrounded(state)) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY) afterLock(gravity(state));
    } else {
      lockTimer = 0;
      gravityAcc += dt;
      const interval = dropInterval(state.level);
      while (gravityAcc >= interval) {
        gravityAcc -= interval;
        if (!tryMove(state, 0, 1)) break;
      }
    }

    if (status === "running") draw();
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- Actions ---------- */

  function startGame() {
    scrollToPlay(root.querySelector(".tt-layout"));
    state = createState();
    newPieceReset();
    setStatus("running");
    overlay.hidden = true;
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame(showScreen = true) {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    if (showScreen) showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
  }

  function resumeGame() {
    if (status !== "paused") return;
    setStatus("running");
    overlay.hidden = true;
    startLoop();
  }

  function finish() {
    stopLoop();
    setStatus("over");
    const record = wallet.setBest("bestTetris", state.score);
    updateHud();
    draw();
    const coins = state.coins ? ` · ${state.coins} pièce${state.coins > 1 ? "s" : ""} bleue${state.coins > 1 ? "s" : ""}` : "";
    showOverlay("Pile saturée",
      `Score : ${fmt(state.score)} · ${fmt(state.lines)} ligne${state.lines > 1 ? "s" : ""}${coins}${record && state.score > 0 ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function primaryAction() {
    if (status === "paused") resumeGame();
    else startGame();
  }

  const running = () => status === "running" && !state.over;

  const actions = {
    left() { if (running() && tryMove(state, -1, 0)) { moved(); draw(); } },
    right() { if (running() && tryMove(state, 1, 0)) { moved(); draw(); } },
    down() {
      if (!running()) return;
      if (softDrop(state)) { gravityAcc = 0; updateHud(); draw(); }
    },
    rotate() { if (running() && rotate(state, 1)) { moved(); draw(); } },
    rotateBack() { if (running() && rotate(state, -1)) { moved(); draw(); } },
    drop() { if (running()) { afterLock(hardDrop(state)); draw(); } },
    hold() {
      if (running() && holdPiece(state)) {
        newPieceReset();
        if (state.over) finish();
        else { updateHud(); draw(); }
      }
    }
  };

  /* ---------- Commandes ---------- */

  const KEYS = {
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right",
    arrowdown: "down", s: "down",
    arrowup: "rotate", z: "rotate", w: "rotate",
    x: "rotateBack",
    " ": "drop",
    c: "hold", shift: "hold"
  };
  const REPEATABLE = new Set(["left", "right", "down"]);

  document.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");

    if (key === "p" || key === "escape") {
      if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }

    if (key === "enter") {
      if (onButton) return;          // sur un bouton, Entrée fait déjà son travail
      event.preventDefault();
      primaryAction();
      return;
    }

    const action = KEYS[key];
    if (!action) return;
    if (key === " " && onButton) return;
    if (status === "running") event.preventDefault();   // les flèches et Espace ne font pas défiler la page
    if (event.repeat && !REPEATABLE.has(action)) return;
    actions[action]();
  });

  startButton.addEventListener("click", primaryAction);

  // Boutons tactiles : un appui agit tout de suite, et les directions se répètent tant qu'on maintient.
  touch.querySelectorAll("[data-act]").forEach((button) => {
    let delay = 0;
    let repeat = 0;
    const stop = () => { window.clearTimeout(delay); window.clearInterval(repeat); };

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (status !== "running") { if (status !== "paused") primaryAction(); return; }
      actions[button.dataset.act]();
      if (button.dataset.repeat) {
        stop();
        delay = window.setTimeout(() => { repeat = window.setInterval(actions[button.dataset.act], 85); }, 240);
      }
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(type, stop);
  });

  // Gestes sur le plateau (téléphone) : toucher = tourner, glisser = bouger / descendre, coup sec vers le bas = chute.
  let gesture = null;
  board.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || status !== "running") return;
    gesture = { x: event.clientX, y: event.clientY, t: performance.now(), stepX: 0, stepY: 0, moved: false };
    board.setPointerCapture?.(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    if (!gesture) return;
    const cell = board.clientWidth / COLS;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const wantX = Math.trunc(dx / cell);
    while (gesture.stepX < wantX) { actions.right(); gesture.stepX += 1; gesture.moved = true; }
    while (gesture.stepX > wantX) { actions.left(); gesture.stepX -= 1; gesture.moved = true; }
    const wantY = Math.trunc(dy / cell);
    while (gesture.stepY < wantY) { actions.down(); gesture.stepY += 1; gesture.moved = true; }
  });
  const endGesture = (event) => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const quick = performance.now() - gesture.t < 260;
    if (!gesture.moved && Math.hypot(dx, dy) < 10 && quick) actions.rotate();
    else if (quick && dy > 70 && Math.abs(dx) < 40 && gesture.stepX === 0) actions.drop();
    gesture = null;
  };
  board.addEventListener("pointerup", endGesture);
  board.addEventListener("pointercancel", () => { gesture = null; });

  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });

  /* ---------- Démarrage ---------- */

  updateHud();
  draw();
  showOverlay("Tetris", "Lance la partie. Sur téléphone : toucher = tourner, glisser = bouger, coup sec vers le bas = chute.", "Lancer la partie", false);
  overlay.hidden = false;

  return {
    activate() {
      active = true;
      updateHud();
      draw();
      // Revenu sur le jeu après l'avoir quitté en pleine partie : il est en pause, on le dit.
      if (status === "paused") showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
    },
    deactivate() { active = false; pauseGame(false); }
  };
}
