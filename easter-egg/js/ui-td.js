// js/ui-td.js — affichage et commandes du Tower Defense « Pare-feu » (logique dans td.js).
// Débloquer une sorte de tour coûte des CRÉDITS (définitif). Poser et améliorer les tours
// coûte de l'ÉNERGIE, gagnée pendant la partie.

import {
  COLS, ROWS, CELL, MAX_LEVEL, MAPS, FREE_MAP, TOWER_DEFS, TOWER_IDS, ENEMY_DEFS,
  createState, canPlace, placeTower, upgradeTower, sellTower, startWave, update, towerAt,
  towerRange, towerDamage, upgradeCost, invested, waveCredits, SELL_RATIO, START_LIVES
} from "./td.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const W = COLS * CELL;
const H = ROWS * CELL;
const STEP = 1 / 60;          // pas de simulation (secondes)

const REASONS = {
  gold: "Pas assez d'énergie.",
  blocked: "Impossible de poser une tour ici (chemin ou case occupée).",
  locked: "Cette tour n'est pas encore débloquée.",
  max: "Cette tour est déjà au niveau maximum."
};

export function createTowerDefenseUI(root, wallet) {
  let active = false;
  let mapId = FREE_MAP;
  let state = createState(wallet.data.towers, mapId);
  let status = "idle";           // idle | running | paused | over
  let placing = null;            // type de tour en cours de pose
  let selectedId = null;         // tour sélectionnée (pour améliorer ou vendre)
  let hover = null;              // case sous la souris
  let cursor = { col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2) };
  let showCursor = false;        // le curseur clavier ne s'affiche qu'après un appui sur une flèche
  let speed = 1;
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  let toastTimer = 0;

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "td-board", width: W, height: H, "aria-label": "Plateau du Tower Defense" });
  const toast = h("p", { class: "game-toast", id: "td-toast", "aria-live": "polite" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Pare-feu");
  const overlayText = h("p", { class: "overlay-text" });
  const startButton = h("button", { class: "button button-primary", id: "td-start", type: "button" }, "Commencer");
  const overlay = h("div", { class: "game-overlay", id: "td-overlay" }, overlayTitle, overlayText, startButton);

  const goldEl = h("strong", { id: "td-gold" }, "0");
  const livesEl = h("strong", { id: "td-lives" }, "0");
  const waveEl = h("strong", { id: "td-wave-num" }, "0");
  const bestEl = h("strong", { id: "td-best" }, "0");
  const stateEl = h("p", { class: "game-state", id: "td-state", "aria-live": "polite" }, "Prêt");

  const waveButton = h("button", { class: "button button-primary", id: "td-wave", type: "button", onclick: () => launchWave() }, "Lancer la vague 1");
  const speedButton = h("button", { class: "button button-secondary", id: "td-speed", type: "button", onclick: () => toggleSpeed() }, "Vitesse ×1");

  const mapButtons = MAPS.map((m) => {
    const button = h("button", { class: "map-button", type: "button", "data-map": m.id, onclick: () => onMap(m.id) });
    return { m, button };
  });
  const mapBar = h("div", { class: "td-maps", role: "group", "aria-label": "Carte" }, mapButtons.map((x) => x.button));

  const palette = TOWER_IDS.map((id, index) => {
    const def = TOWER_DEFS[id];
    const main = h("span", { class: "tw-main" },
      h("strong", {}, `${index + 1}. ${def.name}`),
      h("span", { class: "tw-desc" }, def.desc));
    const cost = h("span", { class: "tw-cost" });
    const button = h("button", { class: "tower-button", type: "button", "data-tower": id, onclick: () => onPalette(id) }, main, cost);
    button.style.setProperty("--tw", def.color);
    return { id, def, cost, button };
  });

  const selTitle = h("strong", { class: "sel-title" });
  const selStats = h("span", { class: "sel-stats" });
  const upgradeButton = h("button", { class: "button button-secondary", id: "td-upgrade", type: "button", onclick: () => doUpgrade() });
  const sellButton = h("button", { class: "button button-secondary", id: "td-sell", type: "button", onclick: () => doSell() });
  const selection = h("div", { class: "td-selection chamfer", id: "td-selection", hidden: true },
    selTitle, selStats, h("div", { class: "sel-buttons" }, upgradeButton, sellButton));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      `Des ennemis suivent le chemin : arrête-les avant la sortie (${START_LIVES} vies). Pose des tours avec l'énergie gagnée en jeu. Débloque de nouvelles tours et de nouvelles cartes avec tes crédits ; chaque vague repoussée t'en rapporte.`),
    h("div", { class: "td-layout" },
      h("div", { class: "td-main" },
        mapBar,
        h("div", { class: "td-board-wrap chamfer" },
          h("div", { class: "game-stage td-stage" }, board, toast, overlay)),
        h("div", { class: "td-actions" }, waveButton, speedButton, stateEl)),
      h("aside", { class: "td-side" },
        h("dl", { class: "td-stats" },
          stat("Énergie", goldEl), stat("Vies", livesEl), stat("Vague", waveEl), stat("Record", bestEl)),
        h("h3", { class: "subhead" }, "Tours"),
        h("ul", { class: "tower-list" }, palette.map((p) => h("li", {}, p.button))),
        selection,
        h("ul", { class: "game-help" },
          h("li", {}, "Clique une case pour poser, une tour pour la sélectionner"),
          h("li", {}, h("kbd", {}, "1"), "–", h("kbd", {}, "7"), " choisir · ", h("kbd", {}, "←↑↓→"), " curseur · ", h("kbd", {}, "Espace"), " poser"),
          h("li", {}, h("kbd", {}, "Entrée"), " vague · ", h("kbd", {}, "U"), " améliorer · ", h("kbd", {}, "V"), " vendre · ", h("kbd", {}, "P"), " pause"))))
  );

  function stat(label, el) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, el));
  }

  /* ---------- Canvas ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  board.width = W * dpr;
  board.height = H * dpr;
  const ctx = board.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function draw() {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, W, H);

    // Grille
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, H); }
    for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(W, r * CELL + 0.5); }
    ctx.stroke();

    // Chemin
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.beginPath();
    state.map.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = CELL - 4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Portée de la tour sélectionnée ou en cours de pose
    const target = hover || (showCursor ? cursor : null);
    const selected = state.towers.find((t) => t.id === selectedId);
    if (selected) {
      const def = TOWER_DEFS[selected.type];
      drawRange((selected.col + 0.5) * CELL, (selected.row + 0.5) * CELL, towerRange(def, selected.level), def.color);
    } else if (placing && target) {
      const def = TOWER_DEFS[placing];
      const ok = canPlace(state, target.col, target.row) && state.gold >= def.cost;
      drawRange((target.col + 0.5) * CELL, (target.row + 0.5) * CELL, towerRange(def, 0), ok ? def.color : "#ff3b5c");
    }

    // Tours
    for (const tower of state.towers) {
      const def = TOWER_DEFS[tower.type];
      const x = tower.col * CELL;
      const y = tower.row * CELL;
      ctx.fillStyle = "#14141f";
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = tower.id === selectedId ? 3 : 1.5;
      ctx.strokeRect(x + 3.5, y + 3.5, CELL - 7, CELL - 7);
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x + CELL / 2, y + CELL / 2, 7 + tower.level, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      for (let i = 0; i < tower.level; i++) ctx.fillRect(x + 7 + i * 7, y + CELL - 9, 5, 3);   // un trait par niveau
    }

    // Ennemis
    for (const e of state.enemies) {
      const def = ENEMY_DEFS[e.type];
      const r = e.type === "boss" ? 13 : e.type === "tank" ? 10 : e.type === "runner" ? 6 : 8;
      ctx.fillStyle = e.slow > 0 ? "#7fd8ff" : def.color;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(e.x - 12, e.y - r - 7, 24, 4);
      ctx.fillStyle = ratio > 0.5 ? "#3ddc84" : ratio > 0.25 ? "#fcee0a" : "#ff3b5c";
      ctx.fillRect(e.x - 12, e.y - r - 7, 24 * ratio, 4);
    }

    // Tirs et explosions
    for (const f of state.fx) {
      const k = Math.max(0, f.ttl / f.max);
      ctx.globalAlpha = k;
      if (f.kind === "beam") {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
      } else {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.2 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Case visée (clavier ou souris)
    if (target && target.col >= 0 && target.col < COLS && target.row >= 0 && target.row < ROWS) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(target.col * CELL + 1, target.row * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  function drawRange(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------- Affichage des chiffres ---------- */

  const cache = new Map();
  function setText(el, value) {
    const text = String(value);
    if (cache.get(el) === text) return;
    cache.set(el, text);
    el.textContent = text;
  }

  const STATUS_LABELS = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Terminé" };

  function setStatus(next) {
    status = next;
    setText(stateEl, STATUS_LABELS[next]);
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

  const bestWave = () => Math.max(wallet.data.bestWave, clearedWaves());
  // Vagues repoussées : la vague en cours (ou celle qui a fait perdre) ne compte pas.
  const clearedWaves = () => Math.max(0, state.wave - (state.phase === "idle" ? 0 : 1));

  function updateHud() {
    setText(goldEl, fmt(state.gold));
    setText(livesEl, fmt(state.lives));
    setText(waveEl, fmt(state.wave));
    setText(bestEl, fmt(bestWave()));

    const inWave = state.phase === "wave";
    waveButton.disabled = status !== "running" || inWave || state.phase === "over";
    setText(waveButton, inWave ? `Vague ${state.wave} en cours…` : `Lancer la vague ${state.wave + 1}`);
    setText(speedButton, `Vitesse ×${speed}`);

    for (const { m, button } of mapButtons) {
      const owned = wallet.data.maps.includes(m.id);
      setText(button, owned ? `${m.name}${m.reward > 1 ? ` (×${m.reward} ¤)` : ""}` : `${m.name} · débloquer ${fmt(m.unlock)} ¤`);
      button.title = m.desc;
      button.classList.toggle("is-active", owned && mapId === m.id);
      button.classList.toggle("is-locked", !owned);
      button.setAttribute("aria-pressed", String(owned && mapId === m.id));
      button.disabled = status === "running" || status === "paused" || (!owned && wallet.credits < m.unlock);
    }

    for (const { id, def, cost, button } of palette) {
      const unlocked = state.unlocked.includes(id);
      button.classList.toggle("is-locked", !unlocked);
      button.classList.toggle("is-active", placing === id);
      button.setAttribute("aria-pressed", placing === id ? "true" : "false");
      if (unlocked) {
        setText(cost, `${fmt(def.cost)} énergie`);
        button.disabled = false;
      } else {
        setText(cost, `Débloquer : ${fmt(def.unlock)} ¤`);
        button.disabled = wallet.credits < def.unlock;
      }
    }

    const tower = state.towers.find((t) => t.id === selectedId);
    selection.hidden = !tower;
    if (tower) {
      const def = TOWER_DEFS[tower.type];
      setText(selTitle, `${def.name} — niveau ${tower.level + 1} / ${MAX_LEVEL + 1}`);
      setText(selStats, `Dégâts ${Math.round(towerDamage(def, tower.level))} · portée ${(towerRange(def, tower.level) / CELL).toFixed(1).replace(".", ",")} cases`);
      const price = tower.level >= MAX_LEVEL ? null : upgradeCost(def, tower.level);
      setText(upgradeButton, price === null ? "Niveau maximum" : `Améliorer (${fmt(price)})`);
      upgradeButton.disabled = price === null || state.gold < price || state.phase === "over";
      setText(sellButton, `Vendre (+${fmt(Math.floor(invested(tower) * SELL_RATIO))})`);
      sellButton.disabled = state.phase === "over";
    }
  }

  function showOverlay(title, text, buttonLabel, takeFocus = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonLabel;
    overlay.hidden = false;
    if (takeFocus) startButton.focus({ preventScroll: true });
  }

  /* ---------- Actions ---------- */

  function syncUnlocked() {
    for (const id of wallet.data.towers) if (!state.unlocked.includes(id)) state.unlocked.push(id);
  }

  // Choix de la carte : seulement entre deux parties. Une carte verrouillée se débloque avec des crédits.
  function onMap(id) {
    if (status === "running" || status === "paused") return;
    const m = MAPS.find((x) => x.id === id);
    if (!wallet.data.maps.includes(id)) {
      const price = m.unlock;                       // figé avant l'achat (le solde change pendant l'achat)
      if (!wallet.unlockMap(id, price)) { say(`Il faut ${fmt(price)} crédits pour débloquer cette carte.`); return; }
      say(`Carte ${m.name} débloquée !`);
    }
    mapId = id;
    state = createState(wallet.data.towers, mapId);
    placing = null;
    selectedId = null;
    if (status === "over") { setStatus("idle"); showOverlay("Pare-feu", `Carte ${m.name} : ${m.desc}`, "Commencer", false); }
    updateHud();
    draw();
  }

  function onPalette(id) {
    if (!state.unlocked.includes(id)) {
      // Débloquer : on fige le prix avant de payer (le solde change pendant l'achat).
      const price = TOWER_DEFS[id].unlock;
      if (wallet.unlockTower(id, price)) {
        syncUnlocked();
        say(`${TOWER_DEFS[id].name} débloquée !`);
      } else {
        say(`Il faut ${fmt(price)} crédits pour débloquer cette tour.`);
      }
    } else {
      placing = placing === id ? null : id;
      selectedId = null;
    }
    updateHud();
    draw();
  }

  function tryPlace(col, row) {
    const existing = towerAt(state, col, row);
    if (existing) {
      selectedId = existing.id;
      placing = null;
    } else if (placing) {
      const result = placeTower(state, placing, col, row);
      if (!result.ok) say(REASONS[result.reason] || "Impossible.");
    } else {
      selectedId = null;
    }
    updateHud();
    draw();
  }

  function doUpgrade() {
    if (selectedId === null) return;
    const result = upgradeTower(state, selectedId);
    if (!result.ok) say(REASONS[result.reason] || "Impossible.");
    updateHud();
    draw();
  }

  function doSell() {
    if (selectedId === null) return;
    const result = sellTower(state, selectedId);
    if (result.ok) {
      say(`Tour vendue : +${fmt(result.refund)} énergie.`);
      selectedId = null;
    }
    updateHud();
    draw();
  }

  function launchWave() {
    if (status !== "running" || !startWave(state)) return;
    updateHud();
  }

  function toggleSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    updateHud();
  }

  function startGame() {
    scrollToPlay(root.querySelector(".td-board-wrap"));
    state = createState(wallet.data.towers, mapId);
    placing = TOWER_DEFS.laser && state.unlocked.includes("laser") ? "laser" : null;
    selectedId = null;
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
    updateHud();
    draw();
    if (showScreen) showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
  }

  function resumeGame() {
    if (status !== "paused") return;
    setStatus("running");
    overlay.hidden = true;
    updateHud();
    startLoop();
  }

  function finish() {
    stopLoop();
    setStatus("over");
    const reached = clearedWaves();
    const record = wallet.setBest("bestWave", reached);
    updateHud();
    draw();
    const credits = state.creditsEarned ? ` · +${fmt(state.creditsEarned)} crédits` : "";
    showOverlay("Réseau compromis",
      `${fmt(reached)} vague${reached > 1 ? "s" : ""} repoussée${reached > 1 ? "s" : ""}${credits}${record && reached > 0 ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function primaryAction() {
    if (status === "paused") resumeGame();
    else startGame();
  }

  /* ---------- Boucle ---------- */

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.min(time - lastTime, 100) / 1000 : 0;   // plafonné : pas de rafale après un ralentissement
    lastTime = time;
    acc += dt * speed;

    let steps = 0;
    while (acc >= STEP && steps < 12 && status === "running") {
      acc -= STEP;
      steps += 1;
      const events = update(state, STEP);

      if (events.credits > 0) {
        wallet.addCredits(events.credits);
        say(`Vague ${state.wave} repoussée : +${fmt(events.credits)} crédits, +${fmt(20 + 2 * state.wave)} énergie.`);
      }
      if (events.over) { finish(); return; }
    }
    if (steps === 12) acc = 0;

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

  /* ---------- Souris, doigt, clavier ---------- */

  function cellFromEvent(event) {
    const rect = board.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const y = ((event.clientY - rect.top) / rect.height) * H;
    return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
  }

  board.addEventListener("pointermove", (event) => {
    hover = cellFromEvent(event);
    showCursor = false;
    if (status !== "running") draw();
  });
  board.addEventListener("pointerleave", () => { hover = null; if (status !== "running") draw(); });
  board.addEventListener("pointerdown", (event) => {
    if (status !== "running") return;
    const { col, row } = cellFromEvent(event);
    hover = { col, row };
    tryPlace(col, row);
  });

  startButton.addEventListener("click", primaryAction);

  document.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");

    if (key === "p" || key === "escape") {
      if (key === "escape" && status === "running" && (placing || selectedId !== null)) {
        placing = null;
        selectedId = null;
        updateHud();
        draw();
      } else if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }

    if (key === "enter") {
      if (onButton) return;
      event.preventDefault();
      if (status === "running") launchWave();
      else primaryAction();
      return;
    }

    if (status !== "running") return;

    const moves = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (moves[key]) {
      event.preventDefault();
      showCursor = true;
      hover = null;
      cursor = {
        col: Math.min(COLS - 1, Math.max(0, cursor.col + moves[key][0])),
        row: Math.min(ROWS - 1, Math.max(0, cursor.row + moves[key][1]))
      };
      draw();
      return;
    }

    if (/^[1-7]$/.test(key)) {
      onPalette(TOWER_IDS[Number(key) - 1]);
      return;
    }
    if (key === " " && !onButton) {
      event.preventDefault();
      tryPlace(cursor.col, cursor.row);
      showCursor = true;
      return;
    }
    if (key === "u") doUpgrade();
    if (key === "v" || key === "delete") doSell();
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  wallet.subscribe(() => { if (active) { syncUnlocked(); updateHud(); } });

  /* ---------- Démarrage ---------- */

  updateHud();
  draw();
  showOverlay("Pare-feu",
    "Pose des tours sur le plateau, puis lance les vagues. Les crédits servent à débloquer de nouvelles tours.",
    "Commencer", false);

  return {
    activate() {
      active = true;
      syncUnlocked();
      updateHud();
      draw();
      if (status === "paused") showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
    },
    deactivate() { active = false; pauseGame(false); }
  };
}
