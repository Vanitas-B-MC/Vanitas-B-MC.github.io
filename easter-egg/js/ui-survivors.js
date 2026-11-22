// js/ui-survivors.js — affichage et commandes de « Survivor Arena » (logique dans survivors.js).
// Déplacement : flèches, ZQSD/WASD, ou glisser le doigt sur l'arène. Le tir est automatique.

import {
  W, H, PLAYER_R, ENEMY_DEFS, CHARACTERS, FREE_CHARACTER, createState, update, chooseUpgrade, describe, xpNeeded,
  creditsFor, coinsFor, SECONDS_PER_COIN
} from "./survivors.js";
import { wealthBonus, survivorPct } from "./rewards.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const STEP = 1 / 60;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Dimensions logiques de l'arène : sur grand écran elle suit la largeur disponible (sprites à
// taille réelle, donc plus d'espace), sur téléphone elle garde le format 3:2 compact.
const WIDE_MIN = 900;
function arenaSize(root) {
  const avail = root ? (root.querySelector(".sv-main")?.clientWidth || 0) - 20 : 0;
  if (avail < WIDE_MIN) return { w: W, h: H };
  const w = Math.min(1400, Math.round(avail));
  const h = Math.min(Math.round(w * 0.58), Math.max(480, Math.round(window.innerHeight * 0.78)));
  return { w, h };
}

export function createSurvivorsUI(root, wallet) {
  let active = false;
  let charId = FREE_CHARACTER;
  let size = arenaSize(root);
  let state = createState(Math.random, charId, size);
  let status = "idle";           // idle | running | paused | over
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  const keys = new Set();
  let drag = null;               // { x, y } point de départ du glisser (en pixels écran)
  let dragVec = { dx: 0, dy: 0 };
  let stick = null;              // joystick affiché : { x0, y0, x1, y1 } en coordonnées du canvas
  let toastTimer = 0;
  let shownChoices = null;

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "sv-board", "aria-label": "Arène" });
  const toast = h("p", { class: "game-toast", id: "sv-toast", "aria-live": "polite" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Survivor Arena");
  const overlayText = h("p", { class: "overlay-text" });
  const startButton = h("button", { class: "button button-primary", id: "sv-start", type: "button" }, "Commencer");
  const overlay = h("div", { class: "game-overlay", id: "sv-overlay" }, overlayTitle, overlayText, startButton);

  const choiceList = h("div", { class: "sv-choices" });
  const levelPanel = h("div", { class: "game-overlay sv-levelup", id: "sv-levelup", hidden: true },
    h("p", { class: "overlay-title" }, "Niveau supérieur"),
    h("p", { class: "overlay-text" }, "Choisis une amélioration (touches 1, 2, 3)"),
    choiceList);

  const timeEl = h("strong", { id: "sv-time" }, "0:00");
  const levelEl = h("strong", { id: "sv-level" }, "1");
  const killsEl = h("strong", { id: "sv-kills" }, "0");
  const bestEl = h("strong", { id: "sv-best" }, "0:00");
  const hpBar = h("span", { class: "sv-bar-fill sv-hp" });
  const xpBar = h("span", { class: "sv-bar-fill sv-xp" });
  const hpText = h("span", { class: "sv-bar-text" });
  const stateEl = h("p", { class: "game-state", id: "sv-state", "aria-live": "polite" }, "Prêt");
  const ownedList = h("ul", { class: "sv-owned" });

  const charButtons = CHARACTERS.map((c) => ({ c, button: h("button", { class: "map-button", type: "button", "data-char": c.id, onclick: () => onChar(c.id) }) }));
  const charBar = h("div", { class: "td-maps", role: "group", "aria-label": "Personnage" }, charButtons.map((x) => x.button));

  const stage = h("div", { class: "game-stage sv-stage" }, board, toast, overlay, levelPanel);

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Survis le plus longtemps possible. Ton personnage tire tout seul : déplace-toi pour esquiver et choisis une amélioration à chaque niveau. Récompense : des crédits, et une pièce bleue toutes les 2 minutes."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        charBar,
        h("div", { class: "sv-board-wrap chamfer" },
          stage),
        h("div", { class: "sv-bars" },
          h("div", { class: "sv-bar", role: "img", "aria-label": "Points de vie" }, hpBar, hpText),
          h("div", { class: "sv-bar", role: "img", "aria-label": "Expérience" }, xpBar))),
      h("aside", { class: "sv-side" },
        h("dl", { class: "td-stats" },
          stat("Temps", timeEl), stat("Niveau", levelEl), stat("Éliminés", killsEl), stat("Record", bestEl)),
        stateEl,
        h("h3", { class: "subhead" }, "Améliorations"),
        ownedList,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : se déplacer"),
          h("li", {}, "Mobile : glisse le doigt sur l'arène"),
          h("li", {}, h("kbd", {}, "P"), " pause · ", h("kbd", {}, "Entrée"), " démarrer"))))
  );

  function stat(label, el) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, el));
  }

  /* ---------- Canvas ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = board.getContext("2d");
  function resizeBoard() {
    board.width = Math.round(state.w * dpr);
    board.height = Math.round(state.h * dpr);
    stage.style.aspectRatio = `${state.w} / ${state.h}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeBoard();

  // Hors partie, l'arène se recale sur la place disponible (changement de fenêtre, rotation…).
  function refitIdle() {
    if (status === "running" || status === "paused") return;
    const next = arenaSize(root);
    if (next.w === state.w && next.h === state.h) return;
    size = next;
    state = createState(Math.random, charId, size);
    resizeBoard();
    draw();
  }
  window.addEventListener("resize", () => { if (active) refitIdle(); });

  function draw() {
    const { player, stats } = state;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#08080f";
    ctx.fillRect(0, 0, state.w, state.h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < state.w; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, state.h); }
    for (let y = 40; y < state.h; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(state.w, y + 0.5); }
    ctx.stroke();

    // Gemmes
    ctx.fillStyle = "#3ddc84";
    for (const g of state.gems) {
      const r = g.xp >= 5 ? 5 : 3;
      ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
    }

    // Ondes de choc
    for (const f of state.fx) {
      const k = f.ttl / f.max;
      if (f.kind === "bolt") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = "#b58cff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo((f.x + f.x2) / 2 + (f.y2 - f.y) * 0.08, (f.y + f.y2) / 2 - (f.x2 - f.x) * 0.08);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
        continue;
      }
      if (f.kind === "blast") {
        ctx.globalAlpha = k * 0.6;
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        continue;
      }
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = "#b58cff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 - k * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Effets au sol : alerte des météores, flammes, trous noirs
    for (const z of state.zones) {
      if (z.kind === "meteor") {
        const k = 1 - z.delay / z.max;   // 0 → 1 jusqu'à l'impact
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = "#fcee0a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.12 + 0.3 * k;
        ctx.fillStyle = "#ff8a3d";
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * k, 0, Math.PI * 2);
        ctx.fill();
        // le météore qui tombe
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffd27a";
        ctx.shadowColor = "#ff8a3d";
        ctx.shadowBlur = 14;
        const fall = (1 - k) * 160;
        ctx.beginPath();
        ctx.arc(z.x - fall * 0.35, z.y - fall, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (z.kind === "fire") {
        const k = z.ttl / z.max;
        ctx.globalAlpha = 0.15 + 0.5 * k;
        ctx.fillStyle = k > 0.5 ? "#ff8a3d" : "#ff3b5c";
        ctx.shadowColor = "#ff6a2d";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (z.kind === "hole") {
        const k = Math.min(1, z.ttl / 0.5, (z.max - z.ttl) / 0.3 + 0.2);
        ctx.globalAlpha = 0.9 * Math.max(0, Math.min(1, k));
        ctx.fillStyle = "#05030a";
        ctx.shadowColor = "#b58cff";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#b58cff";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a0 = state.time * 3 + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * (0.6 + 0.15 * i), a0, a0 + 1.6);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Ennemis
    for (const e of state.enemies) {
      const def = ENEMY_DEFS[e.type];
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = e.type === "boss" ? 16 : 6;
      ctx.beginPath();
      ctx.arc(e.x, e.y, def.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (e.hp < e.maxHp && def.r > 9) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(e.x - def.r, e.y - def.r - 7, def.r * 2, 3);
        ctx.fillStyle = "#ff3b5c";
        ctx.fillRect(e.x - def.r, e.y - def.r - 7, def.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
      }
    }

    // Projectiles
    ctx.fillStyle = "#00f0ff";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 8;
    for (const s of state.shots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Missiles chercheurs (avec leur traînée)
    for (const m of state.missiles) {
      ctx.strokeStyle = "#ff8a3d";
      ctx.shadowColor = "#ff8a3d";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      m.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.fillStyle = "#fff4d6";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Rayons rotatifs
    if (stats.beam > 0) {
      const beams = 1 + Math.floor(stats.beam / 2);
      const length = 140 + stats.beam * 26;
      ctx.strokeStyle = "#ff2a6d";
      ctx.shadowColor = "#ff2a6d";
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      for (let b = 0; b < beams; b++) {
        const a = player.beam + (b * Math.PI * 2) / beams;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(a) * length, player.y + Math.sin(a) * length);
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.lineWidth = 3;
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Lames orbitales
    if (stats.orbit > 0) {
      ctx.fillStyle = "#fcee0a";
      for (let i = 0; i < stats.orbit; i++) {
        const a = player.spin + (i * Math.PI * 2) / stats.orbit;
        ctx.beginPath();
        ctx.arc(player.x + Math.cos(a) * 58, player.y + Math.sin(a) * 58, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Joystick virtuel (glisser du doigt)
    if (stick) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.x0, stick.y0, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(stick.x1, stick.y1, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Joueur (clignote quand il est invulnérable)
    if (!(player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0)) {
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fcee0a";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /* ---------- Affichage des chiffres ---------- */

  const cache = new Map();
  function setText(el, value) {
    const text = String(value);
    if (cache.get(el) === text) return;
    cache.set(el, text);
    el.textContent = text;
  }

  function say(text) {
    toast.textContent = text;
    toast.classList.remove("is-on");
    if (prefersReducedMotion()) {
      toast.style.opacity = "1";
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.style.opacity = ""; }, 1600);
      return;
    }
    void toast.offsetWidth;
    toast.classList.add("is-on");
  }

  const LABELS = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Terminé" };

  function setStatus(next) {
    status = next;
    setText(stateEl, LABELS[next]);
  }

  // Choix du personnage : seulement entre deux parties. Un personnage verrouillé se débloque avec des crédits.
  function onChar(id) {
    if (status === "running" || status === "paused") return;
    const c = CHARACTERS.find((x) => x.id === id);
    if (!wallet.data.chars.includes(id)) {
      const price = c.unlock;                        // figé avant l'achat (le solde change pendant l'achat)
      if (!wallet.unlockChar(id, price)) { say(`Il faut ${fmt(price)} crédits pour débloquer ${c.name}.`); return; }
      say(`${c.name} débloqué !`);
    }
    charId = id;
    size = arenaSize(root);
    state = createState(Math.random, charId, size);
    resizeBoard();
    updateHud();
    draw();
  }

  function updateHud() {
    for (const { c, button } of charButtons) {
      const owned = wallet.data.chars.includes(c.id);
      setText(button, owned ? c.name : `${c.name} · débloquer ${fmt(c.unlock)} ¤`);
      button.title = c.desc;
      button.classList.toggle("is-active", owned && charId === c.id);
      button.classList.toggle("is-locked", !owned);
      button.setAttribute("aria-pressed", String(owned && charId === c.id));
      button.disabled = status === "running" || status === "paused" || (!owned && wallet.credits < c.unlock);
    }
    const { player, stats } = state;
    setText(timeEl, clock(state.time));
    setText(levelEl, state.level);
    setText(killsEl, fmt(state.kills));
    setText(bestEl, clock(Math.max(wallet.data.bestSurvivor, Math.floor(state.time))));
    const hpRatio = Math.max(0, player.hp / stats.maxHp);
    hpBar.style.width = `${hpRatio * 100}%`;
    xpBar.style.width = `${Math.min(100, (state.xp / xpNeeded(state.level)) * 100)}%`;
    setText(hpText, `${Math.ceil(player.hp)} / ${stats.maxHp} PV`);

    const owned = Object.entries(state.owned);
    const sig = owned.map(([id, n]) => `${id}${n}`).join();
    if (ownedList.dataset.sig !== sig) {
      ownedList.dataset.sig = sig;
      ownedList.replaceChildren(...(owned.length
        ? owned.map(([id, n]) => h("li", {}, `${describe(id).name} ×${n}`))
        : [h("li", { class: "hint" }, "Aucune pour l'instant")]));
    }
  }

  function showChoices() {
    if (state.choices === shownChoices) return;
    shownChoices = state.choices;
    levelPanel.hidden = !state.choices;
    if (!state.choices) return;
    choiceList.replaceChildren(...state.choices.map((id, i) => {
      const info = describe(id);
      const owned = state.owned[id] || 0;
      return h("button", { class: "sv-choice", type: "button", "data-upgrade": id, onclick: () => pick(id) },
        h("strong", {}, `${i + 1}. ${info.name}`),
        h("span", {}, info.desc),
        id === "heal" ? null : h("em", {}, `Niveau ${owned + 1} / ${info.max}`));
    }));
    choiceList.firstElementChild?.focus({ preventScroll: true });
  }

  function pick(id) {
    if (chooseUpgrade(state, id)) {
      showChoices();
      updateHud();
      draw();
    }
  }

  function showOverlay(title, text, label, takeFocus = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = label;
    overlay.hidden = false;
    if (takeFocus) startButton.focus({ preventScroll: true });
  }

  /* ---------- Partie ---------- */

  function startGame() {
    scrollToPlay(root.querySelector(".sv-board-wrap"));
    size = arenaSize(root);
    state = createState(Math.random, charId, size);
    resizeBoard();
    shownChoices = null;
    keys.clear();
    setStatus("running");
    overlay.hidden = true;
    showChoices();
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame(showScreen = true) {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    if (showScreen && !state.choices) showOverlay("Pause", "P pour reprendre.", "Reprendre", false);
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
    const seconds = Math.floor(state.time);
    // Récompense de base + pourcentage de la fortune actuelle (calculé avant de payer).
    const credits = creditsFor(state) + wealthBonus(wallet.credits, survivorPct(seconds));
    const coins = coinsFor(state);
    // Valeurs figées avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const record = wallet.setBest("bestSurvivor", seconds);
    if (credits > 0) wallet.addCredits(credits);
    if (coins > 0) wallet.addBlue(coins);
    updateHud();
    draw();
    showChoices();
    const gains = [`+${fmt(credits)} crédits`, coins > 0 ? `+${coins} pièce${coins > 1 ? "s" : ""} bleue${coins > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
    showOverlay("Hors service",
      `${clock(seconds)} · ${fmt(state.kills)} éliminés · niveau ${state.level}\n${gains}${record && seconds > 0 ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function currentInput() {
    let dx = 0;
    let dy = 0;
    if (keys.has("left")) dx -= 1;
    if (keys.has("right")) dx += 1;
    if (keys.has("up")) dy -= 1;
    if (keys.has("down")) dy += 1;
    if (dx || dy) return { dx, dy };
    return dragVec;
  }

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.min(time - lastTime, 100) / 1000 : 0;
    lastTime = time;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 6 && status === "running") {
      acc -= STEP;
      steps += 1;
      const events = update(state, STEP, currentInput());
      if (events.levelUp) say("Niveau supérieur !");
      if (events.over) { finish(); return; }
    }
    if (steps === 6) acc = 0;
    showChoices();
    updateHud();
    draw();
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    lastTime = 0;
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- Clavier et doigt ---------- */

  const KEYMAP = {
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right",
    arrowup: "up", z: "up", w: "up",
    arrowdown: "down", s: "down"
  };

  document.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");

    if (state.choices && status === "running" && /^[1-3]$/.test(key)) {
      pick(state.choices[Number(key) - 1]);
      return;
    }
    if (key === "p" || key === "escape") {
      if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }
    if (key === "enter" && !onButton) {
      event.preventDefault();
      if (status === "paused") resumeGame();
      else if (status !== "running") startGame();
      return;
    }
    if (KEYMAP[key] && status === "running") {
      event.preventDefault();
      keys.add(KEYMAP[key]);
    }
  });

  document.addEventListener("keyup", (event) => {
    const dir = KEYMAP[event.key.toLowerCase()];
    if (dir) keys.delete(dir);
  });

  function toCanvas(event) {
    const rect = board.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * state.w, y: ((event.clientY - rect.top) / rect.height) * state.h };
  }

  board.addEventListener("pointerdown", (event) => {
    if (status !== "running") return;
    drag = { x: event.clientX, y: event.clientY };
    const p0 = toCanvas(event);
    stick = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y };
    board.setPointerCapture?.(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const len = Math.hypot(dx, dy);
    const p1 = toCanvas(event);
    if (stick) {
      const k = Math.min(1, 40 / Math.max(1, Math.hypot(p1.x - stick.x0, p1.y - stick.y0)));
      stick.x1 = stick.x0 + (p1.x - stick.x0) * k;
      stick.y1 = stick.y0 + (p1.y - stick.y0) * k;
    }
    dragVec = len < 8 ? { dx: 0, dy: 0 } : { dx: dx / Math.max(len, 40), dy: dy / Math.max(len, 40) };
  });
  const endDrag = () => { drag = null; stick = null; dragVec = { dx: 0, dy: 0 }; };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  startButton.addEventListener("click", () => (status === "paused" ? resumeGame() : startGame()));

  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", () => keys.clear());

  /* ---------- Démarrage ---------- */

  updateHud();
  draw();
  showOverlay("Survivor Arena", "Esquive, ramasse les gemmes vertes, monte de niveau.", "Commencer", false);

  return {
    activate() {
      active = true;
      refitIdle();
      updateHud();
      draw();
      if (status === "paused" && !state.choices) showOverlay("Pause", "P pour reprendre.", "Reprendre", false);
    },
    deactivate() {
      active = false;
      keys.clear();
      endDrag();
      pauseGame(false);
    }
  };
}
