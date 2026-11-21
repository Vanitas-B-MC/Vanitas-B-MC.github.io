// js/ui-snake.js — affichage et commandes du Snake (la logique est dans snake.js).
// Les pièces bleues ramassées vont directement dans le portefeuille.

import { DIRECTIONS, COIN_LIFETIME, createState, queueDirection, step, stepDelay } from "./snake.js";
import { prefersReducedMotion, themeColor } from "./ui.js";

const SIZE = 480;

export function createSnakeUI(root, wallet) {
  const $ = (selector) => root.querySelector(selector);
  const canvas = $("#board");
  const ctx = canvas.getContext("2d");
  const scoreEl = $("#score");
  const bestEl = $("#best");
  const coinsEl = $("#run-coins");
  const stateEl = $("#state");
  const toastEl = $("#snake-toast");
  const overlay = $("#overlay");
  const overlayTitle = $("#overlay-title");
  const overlayText = $("#overlay-text");
  const startButton = $("#start");

  /* ---------- Couleurs (suivent le thème du site) ---------- */

  let COLORS = {};
  function readColors() {
    COLORS = {
      bg: "#0a0a12",
      grid: "rgba(255, 255, 255, 0.04)",
      yellow: themeColor("--yellow", "#fcee0a"),
      cyan: themeColor("--cyan", "#00f0ff"),
      pink: themeColor("--pink", "#ff2a6d"),
      coin: themeColor("--coin", "#3aa9ff")
    };
  }
  readColors();
  window.addEventListener("mc-theme", () => { readColors(); draw(); });

  /* ---------- Taille du canvas (net sur les écrans haute densité) ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* ---------- État de la partie ---------- */

  let state = createState();
  let status = "idle";          // idle | running | paused | over
  let active = false;           // le jeu est-il affiché ?
  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let toastTimer = 0;

  const STATUS_LABELS = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Terminé" };

  function setStatus(next) {
    status = next;
    stateEl.textContent = STATUS_LABELS[next];
  }

  // takeFocus : met le focus sur le bouton (lancer / rejouer). Pas pour la pause :
  // la touche Espace qui vient de mettre en pause relâcherait sinon son « clic » sur
  // le bouton et relancerait aussitôt la partie.
  function showOverlay(title, text, buttonLabel, takeFocus = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonLabel;
    overlay.hidden = false;
    if (takeFocus && active) startButton.focus({ preventScroll: true });
  }

  const hideOverlay = () => { overlay.hidden = true; };

  function updateHud() {
    scoreEl.textContent = state.score;
    bestEl.textContent = wallet.data.bestSnake;
    coinsEl.textContent = state.coinsCollected;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove("is-on");
    void toastEl.offsetWidth;            // relance l'animation
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 1400);
  }

  /* ---------- Affichage ---------- */

  function drawGlow(fill, blur) {
    ctx.fillStyle = fill;
    ctx.shadowColor = fill;
    ctx.shadowBlur = blur;
  }

  function draw() {
    const cell = SIZE / state.size;
    const now = performance.now();

    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grille
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < state.size; i++) {
      ctx.moveTo(i * cell + 0.5, 0);
      ctx.lineTo(i * cell + 0.5, SIZE);
      ctx.moveTo(0, i * cell + 0.5);
      ctx.lineTo(SIZE, i * cell + 0.5);
    }
    ctx.stroke();

    // Fragment de données (losange rose qui pulse doucement)
    if (state.food) {
      const pulse = prefersReducedMotion() ? 0 : Math.sin(now / 180) * 1.5;
      const cx = state.food.x * cell + cell / 2;
      const cy = state.food.y * cell + cell / 2;
      const r = cell * 0.36 + pulse;
      drawGlow(COLORS.pink, 14);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Pièce bleue rare : clignote quand elle est sur le point de disparaître
    if (state.coin) {
      const fading = state.coin.ttl <= COIN_LIFETIME / 4;
      const visible = !fading || Math.floor(now / 140) % 2 === 0;
      if (visible) {
        const cx = state.coin.x * cell + cell / 2;
        const cy = state.coin.y * cell + cell / 2;
        const r = cell * 0.4;
        drawGlow(COLORS.coin, 18);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, .85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Serpent : tête cyan, corps jaune qui s'estompe vers la queue
    const length = state.snake.length;
    state.snake.forEach((segment, i) => {
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.35, 1 - (i / (length + 4)) * 0.7);
      drawGlow(i === 0 ? COLORS.cyan : COLORS.yellow, i === 0 ? 16 : 8);
      ctx.fillRect(segment.x * cell + 2, segment.y * cell + 2, cell - 4, cell - 4);
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /* ---------- Boucle de jeu ---------- */

  function frame(time) {
    rafId = requestAnimationFrame(frame);

    if (!lastTime) lastTime = time;
    // On plafonne l'écart pour éviter une rafale de pas après un ralentissement.
    accumulator += Math.min(time - lastTime, 250);
    lastTime = time;

    let delay = stepDelay(state.score);
    while (accumulator >= delay) {
      accumulator -= delay;
      step(state);

      if (state.coinPicked) {
        wallet.addBlue(1, { found: true });   // enregistré tout de suite : jamais perdu si on meurt après
        toast("+1 pièce bleue");
      }

      if (state.over) {
        finish();
        return;
      }
      delay = stepDelay(state.score);
    }

    updateHud();
    draw();
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    lastTime = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- Actions ---------- */

  function startGame() {
    state = createState();
    setStatus("running");
    hideOverlay();
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame() {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    showOverlay("Pause", "La partie est en attente. Espace pour reprendre.", "Reprendre", false);
  }

  function resumeGame() {
    if (status !== "paused") return;
    setStatus("running");
    hideOverlay();
    startLoop();
  }

  function finish() {
    stopLoop();
    setStatus("over");

    const record = wallet.setBestSnake(state.score);
    updateHud();
    draw();

    const coins = state.coinsCollected
      ? ` · ${state.coinsCollected} pièce${state.coinsCollected > 1 ? "s" : ""} bleue${state.coinsCollected > 1 ? "s" : ""}`
      : "";
    const title = state.won ? "Réseau saturé" : "Connexion perdue";
    const text = `Score : ${state.score}${coins}${record && state.score > 0 ? " — nouveau record !" : ""}`;
    showOverlay(title, text, "Rejouer");
  }

  // Un seul bouton pour lancer, reprendre ou rejouer, selon l'état.
  function primaryAction() {
    if (status === "paused") resumeGame();
    else startGame();
  }

  function togglePause() {
    if (status === "running") pauseGame();
    else if (status === "paused") resumeGame();
  }

  function turn(name) {
    if (status !== "running") return;
    queueDirection(state, DIRECTIONS[name]);
  }

  /* ---------- Commandes ---------- */

  const KEY_TO_DIRECTION = {
    arrowup: "up", z: "up", w: "up",
    arrowdown: "down", s: "down",
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right"
  };

  document.addEventListener("keydown", (event) => {
    if (!active) return;                              // un autre jeu est affiché
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const direction = KEY_TO_DIRECTION[key];

    if (direction) {
      event.preventDefault();   // évite que les flèches fassent défiler la page
      turn(direction);
      return;
    }

    const isAction = key === "enter" || key === " ";
    if (!isAction) return;

    // Sur un bouton ou un lien, Entrée/Espace font déjà leur travail : on ne double pas l'action.
    if (event.target instanceof Element && event.target.closest("a, button")) return;

    event.preventDefault();
    if (key === " ") togglePause();
    else primaryAction();
  });

  startButton.addEventListener("click", primaryAction);

  // Boutons tactiles. pointerdown pour réagir tout de suite, sans prendre le focus.
  root.querySelectorAll(".dpad [data-dir]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      turn(button.dataset.dir);
    });
  });

  // Glisser le doigt sur le plateau pour diriger le serpent.
  let swipeStart = null;

  canvas.addEventListener("pointerdown", (event) => {
    swipeStart = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? "right" : "left");
    else turn(dy > 0 ? "down" : "up");
  });

  canvas.addEventListener("pointercancel", () => { swipeStart = null; });

  // Pause automatique quand l'onglet n'est plus visible.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  /* ---------- Démarrage ---------- */

  updateHud();
  draw();
  showOverlay("Data Snake", "Appuie sur Entrée ou sur le bouton pour lancer.", "Lancer la partie", false);
  wallet.subscribe(() => { bestEl.textContent = wallet.data.bestSnake; });

  return {
    activate() {
      active = true;
      readColors();
      draw();
    },
    deactivate() {
      active = false;
      pauseGame();
    }
  };
}
