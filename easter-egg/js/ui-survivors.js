// js/ui-survivors.js — affichage et commandes de « Survivor Arena » (logique dans survivors.js).
// Déplacement : flèches, ZQSD/WASD, ou glisser le doigt sur l'arène. Le tir est automatique.
// Espace : ultime. 1-4 : choisir une amélioration · R relancer · X passer · B bannir.

import {
  W, H, PLAYER_R, ENEMY_DEFS, ENEMY_IDS, CHARACTERS, FREE_CHARACTER, WEAPONS, WEAPON_IDS, PASSIVES, RARITIES, MAPS, IMPLANTS, ULTS,
  HEAT_MAX, ELITE_AFFIXES, BLACKWALL_AT, MAX_WEAPONS, MAX_PASSIVES, SOURCE_NAMES,
  createState, update, resizeView, chooseUpgrade, reroll, skipChoice, banishChoice, closeChest, useUlt, describeChoice, xpNeeded,
  creditsFor, coinsFor, coresFor, applyRun, buyImplant, refundImplants, implantCost, mapById, mapUnlocked, heatInfo,
  challengeMet, challengeProgress, charById, statSheet, weaponOf, passiveOf, freshSv
} from "./survivors.js";
import { wealthBonus, survivorPct } from "./rewards.js";
import { h, fmt, fmtShort, scrollToPlay, prefersReducedMotion } from "./ui.js";

const STEP = 1 / 60;
const TAU = Math.PI * 2;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Taille logique de la vue : sur grand écran elle suit la place disponible (sprites à taille réelle, on voit
// plus loin) ; sur téléphone elle garde un format 3:2 compact ; en plein écran elle remplit l'écran.
const WIDE_MIN = 900;
function viewSize(root, full) {
  if (full) return { w: Math.max(640, window.innerWidth), h: Math.max(400, window.innerHeight) };
  const avail = root ? (root.querySelector(".sv-main")?.clientWidth || 0) - 20 : 0;
  if (avail < WIDE_MIN) return { w: W, h: H };
  const w = Math.min(1500, Math.round(avail));
  const h = Math.min(Math.round(w * 0.6), Math.max(480, Math.round(window.innerHeight * 0.76)));
  return { w, h };
}

const GEM_COLORS = [[1, "#3ddc84"], [3, "#00f0ff"], [10, "#5aa9ff"], [30, "#b06bff"], [Infinity, "#ff2a6d"]];
const gemColor = (v) => GEM_COLORS.find(([m]) => v <= m)[1];
const ITEM_LOOK = {
  heart: { glyph: "♥", color: "#ff2a6d", name: "Soin" },
  magnet: { glyph: "∩", color: "#00f0ff", name: "Aimant" },
  bomb: { glyph: "✹", color: "#ffffff", name: "Bombe" },
  clock: { glyph: "◷", color: "#fcee0a", name: "Horloge" },
  core: { glyph: "◈", color: "#b06bff", name: "Noyau" },
  chest: { glyph: "▣", color: "#ffb347", name: "Coffre" },
  bigchest: { glyph: "▣", color: "#ff2a2a", name: "Grand coffre" }
};

export function createSurvivorsUI(root, wallet) {
  const sv = () => wallet.data.sv || (wallet.data.sv = freshSv());
  let active = false;
  let charId = sv().last.char;
  let mapId = sv().last.map;
  let heat = sv().last.heat;
  if (!wallet.data.chars.includes(charId)) charId = FREE_CHARACTER;
  if (!mapUnlocked(sv(), mapId)) mapId = "alley";
  let full = false;
  let state = newState();
  let status = "idle";           // idle | running | paused | over
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  const keys = new Set();
  let drag = null;
  let dragVec = { dx: 0, dy: 0 };
  let stick = null;
  let toastTimer = 0;
  let shownChoices = null;
  let shownChest = null;
  let banishMode = false;
  let tab = "chars";

  function newState() {
    return createState(Math.random, { char: charId, map: mapId, heat, implants: sv().implants, size: viewSize(root, full) });
  }

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "sv-board", "aria-label": "Arène" });
  const toast = h("p", { class: "game-toast", id: "sv-toast", "aria-live": "polite" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Survivor Arena");
  const overlayText = h("p", { class: "overlay-text" });
  const overlayExtra = h("div", { class: "sv-summary" });
  const startButton = h("button", { class: "button button-primary", id: "sv-start", type: "button" }, "Commencer");
  const overlay = h("div", { class: "game-overlay", id: "sv-overlay" }, overlayTitle, overlayText, overlayExtra, startButton);

  const choiceList = h("div", { class: "sv-choices" });
  const rerollBtn = h("button", { class: "map-button", type: "button", onclick: () => doReroll() });
  const skipBtn = h("button", { class: "map-button", type: "button", onclick: () => doSkip() });
  const banishBtn = h("button", { class: "map-button", type: "button", onclick: () => { banishMode = !banishMode; shownChoices = null; showChoices(); } });
  const levelTitle = h("p", { class: "overlay-title" }, "Niveau supérieur");
  const levelHint = h("p", { class: "overlay-text" }, "Choisis une amélioration (touches 1 à 4)");
  const levelPanel = h("div", { class: "game-overlay sv-levelup", id: "sv-levelup", hidden: true },
    levelTitle, levelHint, choiceList, h("div", { class: "sv-choice-tools" }, rerollBtn, skipBtn, banishBtn));

  const chestList = h("ul", { class: "sv-chest-list" });
  const chestTitle = h("p", { class: "overlay-title" }, "Coffre");
  const chestButton = h("button", { class: "button button-primary", type: "button", onclick: () => doCloseChest() }, "Continuer");
  const chestPanel = h("div", { class: "game-overlay sv-chest", id: "sv-chest", hidden: true }, chestTitle, chestList, chestButton);

  const timeEl = h("strong", { id: "sv-time" }, "0:00");
  const levelEl = h("strong", { id: "sv-level" }, "1");
  const killsEl = h("strong", { id: "sv-kills" }, "0");
  const bestEl = h("strong", { id: "sv-best" }, "0:00");
  const coresEl = h("strong", { id: "sv-cores" }, "0");
  const hpBar = h("span", { class: "sv-bar-fill sv-hp" });
  const xpBar = h("span", { class: "sv-bar-fill sv-xp" });
  const ultBar = h("span", { class: "sv-bar-fill sv-ult" });
  const hpText = h("span", { class: "sv-bar-text" });
  const xpText = h("span", { class: "sv-bar-text" });
  const ultText = h("span", { class: "sv-bar-text" });
  const ultButton = h("button", { class: "map-button sv-ult-btn", type: "button", onclick: () => fireUlt() }, "⚡ Ultime");
  const stateEl = h("p", { class: "game-state", id: "sv-state", "aria-live": "polite" }, "Prêt");
  const weaponList = h("ul", { class: "sv-owned sv-arsenal" });
  const passiveList = h("ul", { class: "sv-owned sv-arsenal" });
  const sheetList = h("dl", { class: "sv-sheet" });

  const numbersToggle = h("button", { class: "map-button", type: "button", onclick: () => toggleOpt("numbers") });
  const shakeToggle = h("button", { class: "map-button", type: "button", onclick: () => toggleOpt("shake") });

  const fsButton = h("button", { class: "map-button dg-fs", id: "sv-fs", type: "button", onclick: () => toggleFullscreen() }, "⛶ Plein écran");
  fsButton.hidden = !document.fullscreenEnabled;
  const wrap = h("div", { class: "sv-board-wrap chamfer" });
  const stage = h("div", { class: "game-stage sv-stage" }, board, toast, overlay, levelPanel, chestPanel);
  wrap.append(stage);

  /* Menu de préparation (onglets) */
  const tabs = [
    ["chars", "Personnages"], ["maps", "Cartes"], ["implants", "Implants"], ["codex", "Codex"], ["records", "Statistiques"]
  ];
  const tabButtons = tabs.map(([id, label]) => h("button", { class: "map-button", type: "button", role: "tab", "data-tab": id, onclick: () => { tab = id; renderSetup(); } }, label));
  const setupBody = h("div", { class: "sv-setup-body" });
  const setupSummary = h("p", { class: "sv-setup-summary" });
  const setupPanel = h("div", { class: "sv-setup" }, h("div", { class: "td-maps sv-tabs", role: "tablist" }, tabButtons), setupBody);
  const setupToggle = h("button", { class: "map-button dg-setup-toggle", type: "button", "aria-expanded": "true", onclick: () => setSetupOpen(setupPanel.hidden) });
  function setSetupOpen(open) {
    setupPanel.hidden = !open;
    setupToggle.setAttribute("aria-expanded", String(open));
    setupToggle.textContent = `${open ? "▾" : "▸"} Préparation : personnage, carte, implants, codex`;
  }
  setSetupOpen(true);

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Survis le plus longtemps possible sur une grande carte qui défile. Ton personnage attaque tout seul : déplace-toi, ramasse les gemmes et choisis tes armes (6 max) et modules (6 max). Une arme au niveau 8 évolue en ouvrant un coffre si tu possèdes le bon module. Des élites, des boss toutes les 2 minutes, et le Blackwall à 20:00. Les noyaux gagnés financent des implants permanents."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        setupToggle,
        setupSummary,
        setupPanel,
        h("div", { class: "dg-toolbar" }, fsButton),
        wrap,
        h("div", { class: "sv-bars" },
          h("div", { class: "sv-bar", role: "img", "aria-label": "Points de vie" }, hpBar, hpText),
          h("div", { class: "sv-bar", role: "img", "aria-label": "Expérience" }, xpBar, xpText),
          h("div", { class: "sv-ult-row" },
            h("div", { class: "sv-bar", role: "img", "aria-label": "Ultime" }, ultBar, ultText),
            ultButton))),
      h("aside", { class: "sv-side" },
        h("dl", { class: "td-stats" },
          stat("Temps", timeEl), stat("Niveau", levelEl), stat("Éliminés", killsEl), stat("Record carte", bestEl), stat("Noyaux", coresEl)),
        stateEl,
        h("h3", { class: "subhead" }, `Armes (${MAX_WEAPONS} max)`),
        weaponList,
        h("h3", { class: "subhead" }, `Modules (${MAX_PASSIVES} max)`),
        passiveList,
        h("details", { class: "sv-details" }, h("summary", {}, "Statistiques du personnage"), sheetList),
        h("div", { class: "sv-opts" }, numbersToggle, shakeToggle),
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : se déplacer"),
          h("li", {}, h("kbd", {}, "Espace"), " : ultime (charge en éliminant)"),
          h("li", {}, h("kbd", {}, "1-4"), " choisir · ", h("kbd", {}, "R"), " relancer · ", h("kbd", {}, "X"), " passer · ", h("kbd", {}, "B"), " bannir"),
          h("li", {}, "Mobile : glisse le doigt sur l'arène"),
          h("li", {}, h("kbd", {}, "P"), " pause · ", h("kbd", {}, "Entrée"), " démarrer"))))
  );

  function stat(label, el) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, el));
  }

  /* ---------- Canvas ---------- */

  const ctx = board.getContext("2d");
  let dpr = 1;
  function resizeBoard() {
    dpr = Math.min(window.devicePixelRatio || 1, full ? 1.5 : 2);
    board.width = Math.round(state.w * dpr);
    board.height = Math.round(state.h * dpr);
    stage.style.aspectRatio = `${state.w} / ${state.h}`;
  }
  resizeBoard();

  function refit() {
    const next = viewSize(root, full);
    if (next.w === state.w && next.h === state.h) return;
    if (status === "running" || status === "paused") resizeView(state, next.w, next.h);
    else state = newState();
    resizeBoard();
    draw();
  }
  window.addEventListener("resize", () => { if (active) refit(); });

  const fsTarget = () => wrap;
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else fsTarget().requestFullscreen?.().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === fsTarget();
    full = on;
    fsButton.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    wrap.classList.toggle("is-fullscreen", on);
    // la taille change après la transition : on recalcule juste après
    requestAnimationFrame(() => refit());
  });

  /* ---------- Dessin ---------- */

  function draw() {
    const s = state;
    const { player: pl, cam, map } = s;
    const now = s.time;
    const opt = sv().opt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = map.bg;
    ctx.fillRect(0, 0, s.w, s.h);

    let sx = 0;
    let sy = 0;
    if (s.shake > 0 && opt.shake && !prefersReducedMotion()) {
      sx = (Math.random() - 0.5) * s.shake * 22;
      sy = (Math.random() - 0.5) * s.shake * 22;
    }
    ctx.setTransform(dpr, 0, 0, dpr, (-cam.x + sx) * dpr, (-cam.y + sy) * dpr);

    drawFloor(s);
    drawHazards(s, now);
    drawObstacles(s);
    drawProps(s, now);
    drawMines(s, now);
    drawZones(s, now);
    drawWarns(s, now);
    drawGems(s, now);
    drawItems(s, now);
    for (const e of s.enemies) if (onScreen(s, e.x, e.y, e.r + 30)) drawEnemy(e, now);
    drawBossExtras(s);
    drawShots(s, now);
    drawEnemyBullets(s);
    drawWeaponVisuals(s, now);
    drawPlayer(s, now);
    drawFx(s, now);
    if (opt.numbers) drawNumbers(s);

    // écran (HUD)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (map.dark) drawDarkness(s, sx, sy);
    for (const f of s.fx) {
      if (f.kind !== "screen") continue;
      ctx.globalAlpha = (f.ttl / f.max) * 0.35;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    if (s.buffs.freeze > 0) { ctx.fillStyle = "rgba(252,238,10,0.06)"; ctx.fillRect(0, 0, s.w, s.h); }
    if (s.player.hurtT > 0) {
      const g = ctx.createRadialGradient(s.w / 2, s.h / 2, Math.min(s.w, s.h) * 0.3, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.7);
      g.addColorStop(0, "rgba(255,0,60,0)");
      g.addColorStop(1, `rgba(255,0,60,${s.player.hurtT * 1.4})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.w, s.h);
    }
    drawArrows(s);
    drawHud(s);
    if (stick) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.x0, stick.y0, 40, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(stick.x1, stick.y1, 16, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  const onScreen = (s, x, y, m) => x > s.cam.x - m && x < s.cam.x + s.w + m && y > s.cam.y - m && y < s.cam.y + s.h + m;

  function drawFloor(s) {
    const { cam, map, world } = s;
    const step = 64;
    ctx.strokeStyle = map.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor(cam.x / step) * step);
    const y0 = Math.max(0, Math.floor(cam.y / step) * step);
    for (let x = x0; x <= Math.min(world.w, cam.x + s.w); x += step) { ctx.moveTo(x + 0.5, Math.max(0, cam.y)); ctx.lineTo(x + 0.5, Math.min(world.h, cam.y + s.h)); }
    for (let y = y0; y <= Math.min(world.h, cam.y + s.h); y += step) { ctx.moveTo(Math.max(0, cam.x), y + 0.5); ctx.lineTo(Math.min(world.w, cam.x + s.w), y + 0.5); }
    ctx.stroke();
    // motifs du sol propres à chaque carte (déterministes, d'après la case)
    const big = 256;
    for (let gx = Math.floor(cam.x / big); gx <= Math.floor((cam.x + s.w) / big); gx++) {
      for (let gy = Math.floor(cam.y / big); gy <= Math.floor((cam.y + s.h) / big); gy++) {
        const hsh = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
        if (hsh > 0.35) continue;
        const x = gx * big + hsh * 200;
        const y = gy * big + ((hsh * 7) % 1) * 200;
        ctx.globalAlpha = 0.5;
        if (map.id === "alley") { ctx.fillStyle = "rgba(255,42,109,0.08)"; ctx.fillRect(x, y, 60, 6); ctx.fillRect(x, y + 12, 34, 4); }
        else if (map.id === "datacenter") { ctx.strokeStyle = "rgba(0,240,255,0.12)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 80, y); ctx.lineTo(x + 80, y + 50); ctx.stroke(); ctx.fillStyle = "rgba(0,240,255,0.25)"; ctx.fillRect(x + 78, y + 48, 4, 4); }
        else if (map.id === "toxic") { ctx.fillStyle = "rgba(212,255,58,0.05)"; ctx.beginPath(); ctx.ellipse(x, y, 70, 22, 0.3, 0, TAU); ctx.fill(); }
        else if (map.id === "ice") { ctx.strokeStyle = "rgba(155,231,255,0.12)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y + 25); ctx.lineTo(x + 30, y + 60); ctx.moveTo(x + 40, y + 25); ctx.lineTo(x + 75, y + 20); ctx.stroke(); }
        else { ctx.fillStyle = "rgba(176,107,255,0.08)"; ctx.font = "14px monospace"; ctx.fillText(hsh > 0.17 ? "0101" : "1100", x, y); }
        ctx.globalAlpha = 1;
      }
    }
    // bordure du monde
    ctx.strokeStyle = map.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, world.w - 4, world.h - 4);
    ctx.globalAlpha = 1;
  }

  function drawHazards(s, now) {
    for (const z of s.hazards) {
      if (!onScreen(s, z.x, z.y, z.r)) continue;
      const pulse = 0.85 + Math.sin(now * 3 + z.phase) * 0.08;
      const fade = z.ttl === Infinity ? 1 : Math.min(1, z.ttl / 1);
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = "#9dff2a";
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = "#d4ff3a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#e9ff9a";
      for (let i = 0; i < 4; i++) {
        const a = z.phase + i * 1.7 + now * 0.5;
        const rr = ((now * 0.4 + i * 0.25) % 1) * z.r * 0.7;
        ctx.globalAlpha = 0.5 * fade;
        ctx.beginPath();
        ctx.arc(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 3, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawObstacles(s) {
    const m = s.map.obstacles;
    for (const o of s.obstacles) {
      if (o.kind === "rect") {
        if (!onScreen(s, o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h))) continue;
        ctx.fillStyle = "#0d1a24";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = "rgba(0,240,255,0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        for (let y = o.y + 10; y < o.y + o.h - 6; y += 14) {
          ctx.fillStyle = "#12283a";
          ctx.fillRect(o.x + 6, y, o.w - 12, 8);
          ctx.fillStyle = ((y * 7 + Math.floor(state.time * 3)) % 5) < 2 ? "#3ddc84" : "#00f0ff";
          ctx.fillRect(o.x + o.w - 12, y + 2, 3, 3);
        }
        continue;
      }
      if (!onScreen(s, o.x, o.y, o.r)) continue;
      if (m === "bins") {
        ctx.fillStyle = "#1a1420";
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,42,109,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * 0.6, 0, TAU);
        ctx.stroke();
      } else if (m === "dunes") {
        ctx.fillStyle = "#1b1d0c";
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const rr = o.r * (0.85 + 0.15 * Math.sin(i * 2.1 + o.v * 9));
          i ? ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr) : ctx.moveTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(212,255,58,0.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (m === "ice") {
        ctx.fillStyle = "rgba(155,231,255,0.14)";
        ctx.strokeStyle = "rgba(200,240,255,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + o.v;
          i ? ctx.lineTo(o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r) : ctx.moveTo(o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#12061a";
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(176,107,255,${0.4 + 0.3 * Math.sin(state.time * 2 + o.v * 10)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,42,42,0.6)";
        ctx.fillRect(o.x - 2, o.y - 2, 4, 4);
      }
    }
  }

  function drawProps(s, now) {
    for (const p of s.props) {
      if (p.broken > 0 || !onScreen(s, p.x, p.y, 20)) continue;
      const bob = Math.sin(now * 2 + p.x) * 1.5;
      ctx.fillStyle = "#3a2a14";
      ctx.fillRect(p.x - 10, p.y - 9 + bob, 20, 18);
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 10, p.y - 9 + bob, 20, 18);
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - 9 + bob);
      ctx.lineTo(p.x + 10, p.y + 9 + bob);
      ctx.stroke();
    }
  }

  function drawMines(s, now) {
    for (const m of s.pmines) {
      if (!onScreen(s, m.x, m.y, 20)) continue;
      ctx.fillStyle = m.arm > 0 ? "#555" : m.big ? "#ff2a6d" : "#ff8a3d";
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.big ? 8 : 6, 0, TAU);
      ctx.fill();
      if (m.arm <= 0 && Math.floor(now * 4) % 2) { ctx.fillStyle = "#fff"; ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3); }
    }
    for (const m of s.emines) {
      if (!onScreen(s, m.x, m.y, 20)) continue;
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x - 6, m.y); ctx.lineTo(m.x + 6, m.y); ctx.moveTo(m.x, m.y - 6); ctx.lineTo(m.x, m.y + 6);
      ctx.stroke();
      ctx.fillStyle = m.arm <= 0 && Math.floor(now * 5) % 2 ? "#ff2a2a" : "#7a5a20";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4, 0, TAU);
      ctx.fill();
      if (m.arm <= 0) { ctx.globalAlpha = 0.12; ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }

  function drawZones(s, now) {
    for (const z of s.zones) {
      if (!onScreen(s, z.x, z.y, z.r + 160)) continue;
      if (z.kind === "meteor") {
        const k = 1 - z.delay / z.max;
        const col = z.orbital ? "#00f0ff" : "#fcee0a";
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.1 + 0.3 * k;
        ctx.fillStyle = z.orbital ? "#00a0ff" : "#ff8a3d";
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * k, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (z.orbital) {
          ctx.strokeStyle = "#7df9ff";
          ctx.lineWidth = 3 * k;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y - 600);
          ctx.lineTo(z.x, z.y);
          ctx.stroke();
        } else {
          const fall = (1 - k) * 170;
          ctx.fillStyle = "#ffd27a";
          ctx.beginPath();
          ctx.arc(z.x - fall * 0.35, z.y - fall, 7, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,138,61,0.6)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(z.x - fall * 0.35, z.y - fall);
          ctx.lineTo(z.x - fall * 0.35 - 14, z.y - fall - 40);
          ctx.stroke();
        }
      } else if (z.kind === "fire") {
        const k = z.ttl / z.max;
        ctx.globalAlpha = 0.15 + 0.5 * k;
        ctx.fillStyle = z.lava ? "#ff3b1f" : k > 0.5 ? "#ff8a3d" : "#ff3b5c";
        const flick = 0.9 + Math.sin(now * 20 + z.x) * 0.1;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (0.6 + 0.4 * k) * flick, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.4 * k;
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.35 * flick, 0, TAU);
        ctx.fill();
      } else if (z.kind === "poison") {
        if (z.delay > 0) {
          // la fiole en vol
          const k = 1 - z.delay / z.max;
          const x = z.ox + (z.x - z.ox) * k;
          const y = z.oy + (z.y - z.oy) * k - Math.sin(k * Math.PI) * 60;
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#3ddc84";
          ctx.fillRect(x - 3, y - 5, 6, 10);
          continue;
        }
        const k = Math.min(1, z.ttl / 0.6);
        ctx.globalAlpha = 0.3 * k;
        ctx.fillStyle = z.slow ? "#2affb0" : "#3ddc84";
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.6 * k;
        ctx.strokeStyle = "#7dffb0";
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = now * 1.3 + i * 2.1 + z.x;
          ctx.beginPath();
          ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.5, 4 + ((now * 3 + i) % 1) * 4, 0, TAU);
          ctx.stroke();
        }
      } else if (z.kind === "hole") {
        const k = Math.max(0, Math.min(1, z.ttl / 0.5, (z.max - z.ttl) / 0.3 + 0.2));
        ctx.globalAlpha = 0.9 * k;
        const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        g.addColorStop(0, "#000");
        g.addColorStop(0.45, "#05030a");
        g.addColorStop(0.7, "rgba(120,60,200,0.5)");
        g.addColorStop(1, "rgba(120,60,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#b58cff";
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a0 = now * 3 + (i * TAU) / 4;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * (0.55 + 0.12 * i), a0, a0 + 1.4);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawWarns(s, now) {
    for (const w of s.warns) {
      const k = 1 - w.ttl / w.max;
      const col = w.color || "#ff3b5c";
      const blink = 0.5 + 0.5 * Math.sin(now * 30);
      if (w.kind === "circle") {
        ctx.globalAlpha = 0.15 + 0.25 * k;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * k, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.4 * blink;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, TAU);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.a);
        ctx.globalAlpha = w.track ? 0.4 + 0.5 * k : 0.12 + 0.25 * k;
        ctx.fillStyle = col;
        if (w.track) ctx.fillRect(0, -1, w.len, 2);
        else ctx.fillRect(0, -w.w, w.len, w.w * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGems(s, now) {
    for (const g of s.gems) {
      if (!onScreen(s, g.x, g.y, 10)) continue;
      const r = g.v >= 30 ? 7 : g.v >= 10 ? 6 : g.v >= 3 ? 5 : 4;
      ctx.fillStyle = gemColor(g.v);
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - r);
      ctx.lineTo(g.x + r * 0.7, g.y);
      ctx.lineTo(g.x, g.y + r);
      ctx.lineTo(g.x - r * 0.7, g.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(g.x - 1, g.y - r * 0.5, 2, 2);
    }
  }

  function drawItems(s, now) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const it of s.items) {
      if (!onScreen(s, it.x, it.y, 20)) continue;
      const look = ITEM_LOOK[it.kind];
      const bob = Math.sin(now * 4 + it.x) * 2;
      if (it.kind === "chest" || it.kind === "bigchest") {
        const big = it.kind === "bigchest" ? 1.4 : 1;
        ctx.shadowColor = look.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#3a2410";
        ctx.fillRect(it.x - 12 * big, it.y - 8 * big + bob, 24 * big, 16 * big);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = look.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(it.x - 12 * big, it.y - 8 * big + bob, 24 * big, 16 * big);
        ctx.fillStyle = look.color;
        ctx.fillRect(it.x - 12 * big, it.y - 2 + bob, 24 * big, 3);
        ctx.fillRect(it.x - 2, it.y - 4 + bob, 4, 6);
        continue;
      }
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(it.x, it.y + bob, 9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = look.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = look.color;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(look.glyph, it.x, it.y + bob + 1);
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  /* --- Ennemis : une silhouette par type --- */

  function poly(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function eyes(r, col = "#08080f", spread = 0.35, y = -0.1) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(r * 0.25, -r * spread, r * 0.16, 0, TAU);
    ctx.arc(r * 0.25, r * spread, r * 0.16, 0, TAU);
    ctx.fill();
  }

  function drawEnemy(e, now) {
    const def = ENEMY_DEFS[e.type];
    const r = e.r;
    const mv = Math.hypot(e.mvx || 0, e.mvy || 0);
    const face = mv > 5 ? Math.atan2(e.mvy, e.mvx) : Math.atan2(state.player.y - e.y, state.player.x - e.x);
    const col = e.flash > 0 ? "#ffffff" : def.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = e.phase ? 0.28 : e.decoy ? 0.75 : 1;
    if (e.elite) {
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 2;
      ctx.globalAlpha *= 0.6 + 0.3 * Math.sin(now * 6);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = e.phase ? 0.28 : 1;
    }
    if (e.shielded) {
      ctx.strokeStyle = "rgba(90,169,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, TAU);
      ctx.stroke();
    }
    if (e.boss) { ctx.shadowColor = def.color; ctx.shadowBlur = 18; }
    ctx.fillStyle = col;
    const sh = def.shape;
    switch (sh) {
      case "tri": ctx.rotate(face); poly([[r, 0], [-r * 0.8, r * 0.8], [-r * 0.4, 0], [-r * 0.8, -r * 0.8]]); ctx.fill(); eyes(r * 0.8); break;
      case "dot": ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = "#08080f"; ctx.fillRect(-1.5, -1.5, 3, 3); break;
      case "wing": {
        ctx.rotate(face);
        const f = Math.sin(now * 22 + e.seed) * 0.6;
        poly([[r * 0.4, 0], [-r * 0.6, -r * (1.3 + f)], [-r * 0.2, 0], [-r * 0.6, r * (1.3 + f)]]); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill(); break;
      }
      case "arrow": ctx.rotate(face); poly([[r * 1.2, 0], [-r, r * 0.9], [-r * 0.3, 0], [-r, -r * 0.9]]); ctx.fill(); ctx.fillStyle = "#08080f"; ctx.fillRect(r * 0.1, -2, r * 0.6, 4); break;
      case "diamond": ctx.rotate(now * 1.5); poly([[0, -r * 1.1], [r * 0.9, 0], [0, r * 1.1], [-r * 0.9, 0]]); ctx.fill(); ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.fill(); break;
      case "square": ctx.rotate(face); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2); eyes(r, "#fcee0a", 0.4); break;
      case "wedge": {
        ctx.rotate(e.st >= 1 && e.da !== undefined ? e.da : face);
        poly([[r * 1.3, 0], [-r * 0.9, r], [-r * 0.9, -r]]); ctx.fill();
        if (e.st === 1) { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.6; poly([[r * 1.3, 0], [-r * 0.9, r], [-r * 0.9, -r]]); ctx.fill(); }
        eyes(r * 0.9); break;
      }
      case "blob": {
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * TAU;
          const rr = r * (0.88 + 0.12 * Math.sin(now * 6 + i * 2 + e.seed));
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fill(); ctx.rotate(face); eyes(r); break;
      }
      case "bomb": {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.5, -r * 1.5); ctx.stroke();
        ctx.fillStyle = Math.floor(now * (e.st === 1 ? 20 : 6)) % 2 ? "#fff" : "#ff2a2a";
        ctx.beginPath(); ctx.arc(r * 0.5, -r * 1.5, 2.5, 0, TAU); ctx.fill();
        if (e.st === 1) { ctx.globalAlpha = 0.25; ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(0, 0, ENEMY_DEFS.bomber.boom.r, 0, TAU); ctx.fill(); }
        break;
      }
      case "ring": ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.stroke(); ctx.rotate(now * 4); ctx.fillRect(-r, -2, r * 2, 4); ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.fill(); break;
      case "cross": ctx.fillRect(-r * 0.35, -r, r * 0.7, r * 2); ctx.fillRect(-r, -r * 0.35, r * 2, r * 0.7); ctx.fillStyle = "#fff"; ctx.fillRect(-2, -2, 4, 4); break;
      case "ghost": {
        ctx.beginPath(); ctx.arc(0, -r * 0.1, r, Math.PI, 0);
        for (let i = 0; i <= 4; i++) ctx.lineTo(r - (i * r) / 2, r * 0.8 + (i % 2 ? -r * 0.3 : 0) + Math.sin(now * 8 + i) * 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.2, r * 0.18, 0, TAU); ctx.arc(r * 0.35, -r * 0.2, r * 0.18, 0, TAU); ctx.fill(); break;
      }
      case "star4": ctx.rotate(now * 3); poly([[0, -r * 1.2], [r * 0.3, -r * 0.3], [r * 1.2, 0], [r * 0.3, r * 0.3], [0, r * 1.2], [-r * 0.3, r * 0.3], [-r * 1.2, 0], [-r * 0.3, -r * 0.3]]); ctx.fill(); break;
      case "square2": ctx.rotate(now); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = "#08080f"; for (let i = -1; i <= 1; i++) ctx.fillRect(-r, i * r * 0.5 - 1.5, r * 2, 3); break;
      case "leech": ctx.rotate(face); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff8aa8"; ctx.beginPath(); ctx.arc(r * 1.1, 0, r * 0.35, 0, TAU); ctx.fill(); break;
      case "snow": {
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.rotate(now);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); }
        ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.fill(); break;
      }
      case "hex": {
        poly([0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i / 6) * TAU) * r, Math.sin((i / 6) * TAU) * r])); ctx.fill();
        ctx.strokeStyle = "rgba(90,169,255,0.12)"; ctx.lineWidth = 1; ctx.setLineDash([4, 8]); ctx.beginPath(); ctx.arc(0, 0, 110, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#08080f"; ctx.fillRect(-r * 0.5, -2, r, 4); break;
      }
      case "scope": {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#08080f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
        if (e.st === 1) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
        break;
      }
      case "hive": {
        for (const [ox, oy] of [[0, 0], [r * 0.6, -r * 0.4], [-r * 0.6, -r * 0.4], [0, r * 0.65]]) {
          poly([0, 1, 2, 3, 4, 5].map((i) => [ox + Math.cos((i / 6) * TAU) * r * 0.5, oy + Math.sin((i / 6) * TAU) * r * 0.5])); ctx.fill();
        }
        ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill(); break;
      }
      case "spiky": {
        ctx.rotate(now * 2);
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const rr = i % 2 ? r * 0.7 : r * 1.25; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill(); break;
      }
      case "mech": {
        ctx.rotate(Math.atan2(state.player.y - e.y, state.player.x - e.x));
        ctx.fillRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
        ctx.fillStyle = "#555a70"; ctx.fillRect(0, -r * 0.95, r * 1.3, r * 0.35); ctx.fillRect(0, r * 0.6, r * 1.3, r * 0.35);
        ctx.fillStyle = "#ff8a3d"; ctx.fillRect(r * 0.2, -r * 0.2, r * 0.4, r * 0.4); break;
      }
      case "golem": {
        poly([[-r, -r * 0.5], [-r * 0.4, -r], [r * 0.5, -r * 0.9], [r, -r * 0.2], [r * 0.8, r * 0.7], [0, r], [-r * 0.8, r * 0.7]]); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(r * 0.2, r * 0.1); ctx.lineTo(r * 0.1, r * 0.6); ctx.stroke();
        ctx.fillStyle = "#00f0ff"; ctx.fillRect(-r * 0.4, -r * 0.45, r * 0.25, r * 0.15); ctx.fillRect(r * 0.15, -r * 0.45, r * 0.25, r * 0.15); break;
      }
      case "thief": {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = "#08080f"; ctx.fillRect(-r, -r * 0.35, r * 2, r * 0.4);
        ctx.fillStyle = "#fff"; ctx.fillRect(-r * 0.5, -r * 0.25, 3, 3); ctx.fillRect(r * 0.3, -r * 0.25, 3, 3);
        ctx.fillStyle = "#b06bff"; ctx.beginPath(); ctx.arc(-r * 0.9, r * 0.6, r * 0.5, 0, TAU); ctx.fill(); break;
      }
      default: drawBoss(e, r, col, face, now);
    }
    ctx.restore();
    // barre de vie (élites et ennemis costauds blessés)
    if (!e.boss && (e.elite || r > 13) && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(e.x - r, e.y - r - 9, r * 2, 3);
      ctx.fillStyle = e.elite ? "#ffb347" : "#ff3b5c";
      ctx.fillRect(e.x - r, e.y - r - 9, r * 2 * Math.max(0, e.hp / e.maxHp), 3);
    }
    if (e.stun > 0.1 && !e.phase) {
      ctx.fillStyle = "#fcee0a";
      ctx.font = "10px sans-serif";
      ctx.fillText("✦", e.x - 4 + Math.cos(now * 8) * r * 0.6, e.y - r - 2);
    }
    if (e.poison) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#3ddc84"; ctx.beginPath(); ctx.arc(e.x, e.y - r - 4, 2.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  }

  function drawBoss(e, r, col, face, now) {
    const sh = ENEMY_DEFS[e.type].shape;
    switch (sh) {
      case "b-virus": {
        ctx.rotate(now * 0.8);
        ctx.beginPath();
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; const rr = i % 2 ? r * 0.8 : r * 1.15; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#ff2a6d"; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
        ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill(); break;
      }
      case "b-over": {
        poly([[0, -r * 1.1], [r * 0.4, -r * 0.5], [r, -r * 0.9], [r * 0.9, r * 0.6], [0, r], [-r * 0.9, r * 0.6], [-r, -r * 0.9], [-r * 0.4, -r * 0.5]]); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#08080f"; ctx.fillRect(-r * 0.5, -r * 0.1, r, r * 0.25);
        ctx.fillStyle = "#fcee0a"; ctx.fillRect(-r * 0.4, -r * 0.05, r * 0.2, r * 0.15); ctx.fillRect(r * 0.2, -r * 0.05, r * 0.2, r * 0.15); break;
      }
      case "b-jugg": {
        ctx.rotate(e.st >= 1 && e.da !== undefined ? e.da : face);
        poly([[r * 1.2, 0], [r * 0.5, r * 0.9], [-r, r], [-r * 0.8, 0], [-r, -r], [r * 0.5, -r * 0.9]]); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#3a0a14"; poly([[r * 1.2, 0], [r * 0.4, r * 0.4], [r * 0.4, -r * 0.4]]); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(r * 0.1, -r * 0.5, r * 0.25, r * 0.15); ctx.fillRect(r * 0.1, r * 0.35, r * 0.25, r * 0.15); break;
      }
      case "b-hydra": {
        ctx.rotate(face);
        ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.75, 0, TAU); ctx.fill();
        for (const a of [-0.7, 0, 0.7]) {
          const hx = Math.cos(a) * r * 0.85;
          const hy = Math.sin(a) * r * 0.85 + Math.sin(now * 5 + a * 3) * 3;
          ctx.beginPath(); ctx.arc(hx, hy, r * 0.38, 0, TAU); ctx.fill();
          ctx.fillStyle = "#08080f"; ctx.beginPath(); ctx.arc(hx + r * 0.15, hy, r * 0.08, 0, TAU); ctx.fill(); ctx.fillStyle = col;
        }
        break;
      }
      case "b-sent": {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#04141a"; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
        const a = Math.atan2(state.player.y - e.y, state.player.x - e.x);
        ctx.fillStyle = "#00f0ff"; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.3, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.rotate(now);
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.25, i * Math.PI / 2, i * Math.PI / 2 + 0.9); ctx.stroke(); }
        break;
      }
      case "b-queen": {
        ctx.rotate(face);
        ctx.beginPath(); ctx.ellipse(-r * 0.4, 0, r * 0.9, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.6, 0, r * 0.45, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff8c0";
        const f = Math.sin(now * 25) * 0.3;
        ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.8, r * 0.7, r * (0.3 + f * 0.2), -0.4, 0, TAU); ctx.ellipse(-r * 0.2, r * 0.8, r * 0.7, r * (0.3 + f * 0.2), 0.4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = "#08080f";
        for (let i = 0; i < 3; i++) ctx.fillRect(-r * 1.1 + i * r * 0.45, -r * 0.55, r * 0.12, r * 1.1);
        ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(r * 0.8, -r * 0.2, r * 0.1, 0, TAU); ctx.arc(r * 0.8, r * 0.2, r * 0.1, 0, TAU); ctx.fill(); break;
      }
      case "b-net": {
        const gl = Math.random() < 0.1 ? (Math.random() - 0.5) * 8 : 0;
        ctx.translate(gl, 0);
        poly([[0, -r * 1.3], [r * 0.8, 0], [0, r * 1.3], [-r * 0.8, 0]]); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#08080f"; ctx.fillRect(-r * 0.5, -r * 0.15, r, r * 0.3);
        ctx.fillStyle = "#ff2a6d"; ctx.fillRect(-r * 0.4, -r * 0.08, r * 0.8, r * 0.16);
        ctx.strokeStyle = "rgba(201,184,255,0.5)"; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const y = ((now * 40 + i * 20) % (r * 2.6)) - r * 1.3; ctx.beginPath(); ctx.moveTo(-r, y); ctx.lineTo(r, y); ctx.stroke(); }
        break;
      }
      case "b-titan": {
        ctx.rotate(Math.atan2(state.player.y - e.y, state.player.x - e.x));
        ctx.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#4a4f66"; ctx.fillRect(-r * 0.5, -r * 1.2, r * 1.4, r * 0.4); ctx.fillRect(-r * 0.5, r * 0.8, r * 1.4, r * 0.4);
        ctx.fillStyle = "#ff8a3d"; for (let i = 0; i < 3; i++) { ctx.fillRect(r * 0.6, -r * 1.15 + i * 0.1 * r, r * 0.3, r * 0.08); ctx.fillRect(r * 0.6, r * 0.85 + i * 0.1 * r, r * 0.3, r * 0.08); }
        ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 0.25, 0, TAU); ctx.fill(); break;
      }
      case "b-black": {
        ctx.fillStyle = "#050005";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = e.flash > 0 ? "#fff" : "#ff2a2a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.rotate(now * 0.6);
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.25 + Math.sin(now * 3 + i) * 4, i * TAU / 6, i * TAU / 6 + 0.6); ctx.stroke(); }
        ctx.rotate(-now * 1.2);
        ctx.fillStyle = "#ff2a2a";
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.fillRect(Math.cos(a) * r * 0.55 - 3, Math.sin(a) * r * 0.55 - 3, 6, 6); }
        ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
        if (Math.random() < 0.2) { ctx.fillStyle = "rgba(255,42,42,0.5)"; ctx.fillRect(-r * 1.4, (Math.random() - 0.5) * r * 2, r * 2.8, 3); }
        break;
      }
      default: ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    }
  }

  function drawBossExtras(s) {
    for (const e of s.enemies) {
      if (!e.lasers) continue;
      const L = e.lasers;
      for (let i = 0; i < L.n; i++) {
        const a = L.a + (i * TAU) / L.n;
        const x2 = e.x + Math.cos(a) * L.len;
        const y2 = e.y + Math.sin(a) * L.len;
        ctx.strokeStyle = L.active ? "#00f0ff" : "rgba(0,240,255,0.35)";
        ctx.lineWidth = L.active ? 8 : 2;
        ctx.globalAlpha = L.active ? 0.9 : 0.6;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (L.active) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawShots(s, now) {
    for (const sh of s.shots) {
      if (!onScreen(s, sh.x, sh.y, 30)) continue;
      if (sh.kind === "missile") {
        ctx.strokeStyle = "rgba(255,138,61,0.7)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        sh.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.fillStyle = "#fff4d6";
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, 3.5, 0, TAU);
        ctx.fill();
      } else if (sh.kind === "disc" || sh.kind === "saw") {
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.spin);
        ctx.fillStyle = sh.kind === "disc" ? "#3ddc84" : sh.src === "ult" ? "#fcee0a" : "#c8c8d8";
        ctx.beginPath();
        const teeth = sh.kind === "saw" ? 10 : 3;
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * TAU;
          const rr = i % 2 ? sh.r * 0.7 : sh.r;
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#08080f";
        ctx.beginPath();
        ctx.arc(0, 0, sh.r * 0.25, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (sh.kind === "laser") {
        ctx.strokeStyle = sh.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.04, sh.y - sh.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.fillStyle = sh.color || "#00f0ff";
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = sh.color || "#00f0ff";
        ctx.lineWidth = sh.r;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.025, sh.y - sh.vy * 0.025);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEnemyBullets(s) {
    for (const b of s.ebullets) {
      if (!onScreen(s, b.x, b.y, 10)) continue;
      ctx.fillStyle = b.color;
      if (b.fast) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#08080f";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
      ctx.fill();
    }
  }

  function wParams(w) {
    const p = w.evo ? WEAPONS[w.id].E : WEAPONS[w.id].P(w.lvl);
    const st = state.stats;
    return { ...p, n: p.n !== undefined ? p.n + (w.id === "frost" || w.id === "fire" || w.id === "nova" || w.id === "katana" || w.id === "hole" ? 0 : st.amount) : 0, r: (p.r || 0) * st.area, len: (p.len || 0) * st.area };
  }

  function drawWeaponVisuals(s, now) {
    const pl = s.player;
    for (const w of s.weapons) {
      if (w.id === "orbit") {
        const p = wParams(w);
        for (let i = 0; i < p.n; i++) {
          const a = w.a + (i * TAU) / p.n;
          const x = pl.x + Math.cos(a) * p.r;
          const y = pl.y + Math.sin(a) * p.r;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = w.evo ? "#ffffff" : "#fcee0a";
          const L = w.evo ? 16 : 9;
          poly([[0, -L], [L * 0.45, 0], [0, L], [-L * 0.45, 0]]);
          ctx.fill();
          ctx.restore();
        }
      } else if (w.id === "beam") {
        const p = wParams(w);
        for (let b = 0; b < p.n; b++) {
          const a = w.a + (b * TAU) / p.n;
          const col = w.evo ? `hsl(${(b * 60 + now * 120) % 360} 100% 60%)` : "#ff2a6d";
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = w.evo ? 12 : 8;
          ctx.beginPath();
          ctx.moveTo(pl.x, pl.y);
          ctx.lineTo(pl.x + Math.cos(a) * p.len, pl.y + Math.sin(a) * p.len);
          ctx.stroke();
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (w.id === "frost") {
        const p = wParams(w);
        ctx.globalAlpha = 0.12 + 0.04 * Math.sin(now * 3);
        ctx.fillStyle = "#9be7ff";
        ctx.beginPath();
        ctx.arc(pl.x, pl.y, p.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#d6f6ff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -now * 20;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else if (w.id === "drone") {
        for (const d of w.drones) {
          ctx.fillStyle = w.evo ? "#ff2a6d" : "#00f0ff";
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(now * 4);
          ctx.fillRect(-6, -2, 12, 4);
          ctx.fillRect(-2, -6, 4, 12);
          ctx.restore();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(d.x, d.y, 3, 0, TAU);
          ctx.fill();
        }
      }
    }
    if (s.buffs.inferno > 0) {
      const R = 210 * s.stats.area;
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(now * 12);
      ctx.strokeStyle = "#ff6a2d";
      ctx.lineWidth = 40;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, R - 25, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.buffs.whirl > 0) {
      for (let i = 0; i < 6; i++) {
        const a = s.time * 4 + (i * TAU) / 6;
        const R = 110 + Math.sin(s.time * 2) * 30;
        ctx.fillStyle = "#3ddc84";
        ctx.beginPath();
        ctx.arc(pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R, 18, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#08080f";
        ctx.beginPath();
        ctx.arc(pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R, 5, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawPlayer(s, now) {
    const pl = s.player;
    const c = charById(s.character);
    const b = s.buffs;
    // aimant
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#3ddc84";
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, s.stats.magnet, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (b.phase > 0) ctx.globalAlpha = 0.35;
    if (pl.inv > 0 && Math.floor(pl.inv * 20) % 2 === 0 && b.phase <= 0) ctx.globalAlpha = 0.4;
    const face = Math.atan2(pl.fy, pl.fx);
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.shadowColor = b.sprint > 0 ? "#00f0ff" : c.color;
    ctx.shadowBlur = b.sprint > 0 || b.inv > 0 ? 24 : 12;
    // corps
    ctx.fillStyle = "#14141f";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R + 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.rotate(face);
    ctx.fillStyle = "#08080f";
    ctx.fillRect(2, -5, 6, 10);          // visière
    ctx.fillStyle = "#fcee0a";
    ctx.fillRect(4, -4, 3, 3);
    ctx.fillRect(4, 1, 3, 3);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (b.inv > 0 || b.sprint > 0) {
      ctx.strokeStyle = b.sprint > 0 ? "#00f0ff" : "#3ddc84";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, PLAYER_R + 6 + Math.sin(now * 10) * 2, 0, TAU);
      ctx.stroke();
    }
    if (pl.slowT > 0) {
      ctx.fillStyle = "#9be7ff";
      ctx.font = "10px sans-serif";
      ctx.fillText("❄", pl.x - 4, pl.y - PLAYER_R - 6);
    }
  }

  function zigzag(x1, y1, x2, y2, seed, amp) {
    const n = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const off = (Math.sin(seed * 100 + i * 7.3) * amp);
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const l = Math.hypot(nx, ny) || 1;
      ctx.lineTo(x1 + (x2 - x1) * k + (nx / l) * off, y1 + (y2 - y1) * k + (ny / l) * off);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawFx(s, now) {
    for (const f of s.fx) {
      const k = f.ttl / f.max;
      switch (f.kind) {
        case "ring":
          ctx.globalAlpha = k * 0.8;
          ctx.strokeStyle = f.color || "#b58cff";
          ctx.lineWidth = (f.thick || 3) * k + 1;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (1 - k * 0.3), 0, TAU);
          ctx.stroke();
          break;
        case "blast":
          ctx.globalAlpha = k * 0.55;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = k;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case "flash":
          ctx.globalAlpha = k;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, TAU);
          ctx.fill();
          break;
        case "pop":
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 2;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + f.x;
            const r1 = f.r * (1.4 - k);
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
            ctx.lineTo(f.x + Math.cos(a) * (r1 + 5), f.y + Math.sin(a) * (r1 + 5));
            ctx.stroke();
          }
          break;
        case "zap":
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          zigzag(f.x, f.y, f.x2, f.y2, f.seed, 14);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          zigzag(f.x, f.y, f.x2, f.y2, f.seed, 14);
          break;
        case "chain":
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 2.5;
          for (let i = 1; i < f.pts.length; i++) zigzag(f.pts[i - 1].x, f.pts[i - 1].y, f.pts[i].x, f.pts[i].y, f.seed + i, 7);
          break;
        case "rail":
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.w * 2 * k + 1;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(1, f.w * 0.5 * k);
          ctx.stroke();
          break;
        case "slash": {
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 10 * k + 2;
          const sweep = (1 - k) * f.half * 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 0.85, f.a - f.half, f.a - f.half + Math.max(0.2, sweep));
          ctx.stroke();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
        case "glitch":
          ctx.globalAlpha = k;
          ctx.fillStyle = Math.random() < 0.5 ? "#00f0ff" : "#ff2a6d";
          ctx.fillRect(f.x - f.r - 4, f.y - 2 + (Math.random() - 0.5) * f.r, f.r * 2 + 8, 3);
          break;
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawNumbers(s) {
    ctx.textAlign = "center";
    for (const n of s.numbers) {
      ctx.globalAlpha = Math.min(1, n.ttl / 0.3);
      ctx.font = n.crit ? "bold 13px monospace" : "11px monospace";
      ctx.fillStyle = n.crit ? "#fcee0a" : "#ffffff";
      ctx.fillText(fmtShort(Math.round(n.v)), n.x, n.y);
    }
    ctx.textAlign = "start";
    ctx.globalAlpha = 1;
  }

  function drawDarkness(s, sx, sy) {
    const px = s.player.x - s.cam.x + sx;
    const py = s.player.y - s.cam.y + sy;
    const R = 230 * s.stats.area;
    const g = ctx.createRadialGradient(px, py, R * 0.35, px, py, R);
    g.addColorStop(0, "rgba(4,0,8,0)");
    g.addColorStop(1, "rgba(4,0,8,0.93)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.w, s.h);
  }

  // Flèches au bord de l'écran : boss, coffres, voleur, élites
  function drawArrows(s) {
    const targets = [];
    for (const e of s.enemies) {
      if (e.boss && !e.decoy) targets.push([e.x, e.y, "#ff2a2a", 11]);
      else if (e.type === "thief") targets.push([e.x, e.y, "#ffe066", 9]);
      else if (e.elite) targets.push([e.x, e.y, "#ffb347", 7]);
    }
    for (const it of s.items) if (it.kind === "chest" || it.kind === "bigchest") targets.push([it.x, it.y, "#ffb347", 9]);
    const cx = s.w / 2;
    const cy = s.h / 2;
    for (const [x, y, col, size] of targets.slice(0, 20)) {
      const vx = x - s.cam.x;
      const vy = y - s.cam.y;
      if (vx > 0 && vx < s.w && vy > 0 && vy < s.h) continue;
      const a = Math.atan2(vy - cy, vx - cx);
      const m = 18;
      const tx = Math.max(m, Math.min(s.w - m, cx + Math.cos(a) * s.w));
      const ty = Math.max(m, Math.min(s.h - m, cy + Math.sin(a) * s.h));
      const k = Math.min((s.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (s.h / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * k;
      const ay = cy + Math.sin(a) * k;
      ctx.save();
      ctx.translate(Number.isFinite(ax) ? ax : tx, Number.isFinite(ay) ? ay : ty);
      ctx.rotate(a);
      ctx.fillStyle = col;
      poly([[size, 0], [-size * 0.7, size * 0.7], [-size * 0.7, -size * 0.7]]);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHud(s) {
    // minuteur
    ctx.textAlign = "center";
    ctx.font = "bold 22px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(clock(s.time), s.w / 2 + 1, 29);
    ctx.fillStyle = s.time >= BLACKWALL_AT ? "#ff2a2a" : "#ffffff";
    ctx.fillText(clock(s.time), s.w / 2, 28);
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    const nextBoss = s.time < BLACKWALL_AT && !s.blackwallSpawned ? Math.min(s.nextBoss, BLACKWALL_AT) : s.nextBoss;
    ctx.fillText(`${s.map.name}${s.heat ? ` · Surtension ${s.heat}` : ""} · boss dans ${clock(Math.max(0, nextBoss - s.time))}`, s.w / 2, 44);
    // barre du boss
    const boss = s.bossId && s.enemies.find((e) => e.id === s.bossId);
    if (boss) {
      const bw = Math.min(520, s.w - 160);
      const bx = (s.w - bw) / 2;
      const by = 54;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
      ctx.fillStyle = ENEMY_DEFS[boss.type].color === "#ffffff" ? "#ff2a6d" : ENEMY_DEFS[boss.type].color;
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 10);
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(ENEMY_DEFS[boss.type].name.toUpperCase(), s.w / 2, by + 24);
    }
    ctx.textAlign = "start";
    // armes et modules (coin haut gauche)
    const size = s.w < 600 ? 20 : 24;
    ctx.font = `${size * 0.6}px sans-serif`;
    ctx.textBaseline = "middle";
    s.weapons.forEach((w, i) => hudIcon(8 + i * (size + 4), 8, size, WEAPONS[w.id].glyph, w.evo ? "#ffb347" : WEAPONS[w.id].color, w.evo ? "★" : w.lvl));
    s.passives.forEach((p, i) => hudIcon(8 + i * (size + 4), 12 + size, size, PASSIVES[p.id].glyph, "#c8c8d8", p.lvl));
    ctx.textBaseline = "alphabetic";
    // compteur à droite
    ctx.textAlign = "right";
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#ff2a6d";
    ctx.fillText(`☠ ${fmtShort(s.kills)}`, s.w - 10, 20);
    ctx.fillStyle = "#b06bff";
    ctx.fillText(`◈ ${s.run.cores}`, s.w - 10, 38);
    ctx.fillStyle = "#3ddc84";
    ctx.fillText(`NIV ${s.level}`, s.w - 10, 56);
    ctx.textAlign = "start";
    // buffs actifs
    const active = Object.entries({ sprint: "SPRINT", phase: "DÉPHASÉ", barrage: "BARRAGE", overclock: "SURCADENCÉ", whirl: "TOURBILLON", inferno: "INFERNO", freeze: "TEMPS FIGÉ", xpboost: "XP +50 %", inv: "INVULNÉRABLE" })
      .filter(([k]) => s.buffs[k] > 0);
    ctx.font = "bold 11px monospace";
    active.forEach(([k, label], i) => {
      ctx.fillStyle = "#00f0ff";
      ctx.fillText(`${label} ${s.buffs[k].toFixed(1)}s`, 8, s.h - 12 - i * 14);
    });
    if (s.ult >= s.ultMax && status === "running") {
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
      ctx.fillStyle = "#fcee0a";
      ctx.fillText("ULTIME PRÊT — ESPACE", s.w / 2, s.h - 14);
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
    }
  }

  function hudIcon(x, y, size, glyph, color, lvl) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(glyph, x + size / 2, y + size / 2);
    ctx.font = "bold 9px monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.fillText(String(lvl), x + size - 2, y + size - 4);
    ctx.font = `${size * 0.6}px sans-serif`;
    ctx.textAlign = "start";
  }

  /* ---------- Textes ---------- */

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
    const playing = next === "running" || next === "paused";
    for (const b of setupPanel.querySelectorAll("button:not([data-tab])")) b.disabled = playing || b.dataset.off === "1";
  }

  function toggleOpt(k) {
    sv().opt[k] = !sv().opt[k];
    wallet.saveSurvivor();
    renderOpts();
    draw();
  }
  function renderOpts() {
    setText(numbersToggle, `Chiffres de dégâts : ${sv().opt.numbers ? "oui" : "non"}`);
    setText(shakeToggle, `Secousses : ${sv().opt.shake ? "oui" : "non"}`);
  }

  /* ---------- Menu de préparation ---------- */

  function renderSetup() {
    for (const b of tabButtons) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    }
    const data = sv();
    const c = charById(charId);
    const m = mapById(mapId);
    setText(setupSummary, `${c.name} · ${m.name}${heat ? ` · Surtension ${heat}` : ""} · ${fmt(data.cores)} noyaux`);
    let body;
    if (tab === "chars") body = renderChars(data);
    else if (tab === "maps") body = renderMaps(data);
    else if (tab === "implants") body = renderImplants(data);
    else if (tab === "codex") body = renderCodex(data);
    else body = renderRecords(data);
    setupBody.replaceChildren(body);
    setStatus(status);
  }

  function charState(c) {
    if (wallet.data.chars.includes(c.id)) return "owned";
    if (c.challenge) return challengeMet(sv(), c) ? "ready" : "locked";
    return wallet.credits >= c.unlock ? "buy" : "poor";
  }

  function renderChars(data) {
    return h("div", { class: "sv-cards" }, CHARACTERS.map((c) => {
      const st = charState(c);
      const start = c.start.map((x) => WEAPONS[x.split(":")[0]]);
      let lock = null;
      if (st === "locked") lock = h("span", { class: "sv-lock" }, `🔒 ${c.challenge.text} (${Math.floor(challengeProgress(data, c) * 100)} %)`);
      else if (st === "ready") lock = h("span", { class: "sv-lock is-ready" }, "Défi réussi : clique pour débloquer");
      else if (st === "buy" || st === "poor") lock = h("span", { class: "sv-lock" }, `Débloquer : ${fmtShort(c.unlock)} crédits`);
      return h("button", {
        class: `sv-card${charId === c.id ? " is-active" : ""}${st === "owned" ? "" : " is-locked"}`, type: "button", "data-char": c.id,
        "data-off": st === "locked" || st === "poor" ? "1" : "0", style: `--cc:${c.color}`, onclick: () => onChar(c.id)
      },
      h("strong", {}, c.name),
      h("span", { class: "sv-card-weapon" }, start.map((w) => `${w.glyph} ${w.name}`).join(" + ")),
      h("span", {}, c.desc),
      h("em", {}, `Ultime : ${ULTS[c.ult].name} — ${ULTS[c.ult].desc}`),
      lock);
    }));
  }

  function renderMaps(data) {
    const maps = h("div", { class: "sv-cards" }, MAPS.map((m) => {
      const open = mapUnlocked(data, m.id);
      return h("button", {
        class: `sv-card${mapId === m.id ? " is-active" : ""}${open ? "" : " is-locked"}`, type: "button", "data-map": m.id,
        "data-off": open ? "0" : "1", style: `--cc:${m.accent}`, onclick: () => onMap(m.id)
      },
      h("strong", {}, m.name),
      h("span", {}, m.desc),
      h("em", {}, `Record : ${clock(data.best[m.id] || 0)}`),
      open ? null : h("span", { class: "sv-lock" }, `🔒 Survivre ${clock(m.req.time)} sur ${mapById(m.req.map).name}`));
    }));
    const heats = h("div", { class: "td-maps sv-heat" },
      Array.from({ length: HEAT_MAX + 1 }, (_, k) => h("button", {
        class: `map-button${heat === k ? " is-active" : ""}${k > data.heat ? " is-locked" : ""}`, type: "button", "data-heat": String(k),
        "data-off": k > data.heat ? "1" : "0", title: heatInfo(k).text, onclick: () => onHeat(k)
      }, k ? `⚡${k}` : "Normal")));
    return h("div", {},
      maps,
      h("h3", { class: "subhead" }, "Surtension"),
      h("p", { class: "hint" }, `${heatInfo(heat).text}. Survis 10 minutes au niveau le plus haut pour débloquer le suivant.`),
      heats);
  }

  function renderImplants(data) {
    const list = h("div", { class: "sv-implants" }, IMPLANTS.map((m) => {
      const rank = data.implants[m.id] || 0;
      const maxed = rank >= m.max;
      const cost = implantCost(m.id, rank);
      return h("button", {
        class: `sv-implant${maxed ? " is-max" : ""}`, type: "button", "data-implant": m.id, "data-off": maxed || data.cores < cost ? "1" : "0",
        onclick: () => onBuy(m.id)
      },
      h("strong", {}, m.name),
      h("span", {}, m.desc),
      h("span", { class: "sv-pips", "aria-label": `Rang ${rank} sur ${m.max}` }, Array.from({ length: m.max }, (_, i) => h("i", { class: i < rank ? "on" : "" }))),
      h("em", {}, maxed ? "Maximum" : `${fmtShort(cost)} ◈`));
    }));
    return h("div", {},
      h("p", { class: "sv-cores-line" }, h("strong", {}, `${fmt(data.cores)} ◈`), " noyaux — gagnés en survivant, sur les élites, les boss, le voleur et les caisses. Les implants s'appliquent à toutes les parties."),
      list,
      h("button", { class: "map-button sv-refund", type: "button", onclick: () => onRefund() }, "Rembourser tous les implants"));
  }

  function renderCodex(data) {
    const seen = ENEMY_IDS.filter((id) => data.codex[id]);
    const enemies = h("ul", { class: "sv-codex" }, ENEMY_IDS.map((id) => {
      const d = ENEMY_DEFS[id];
      const n = data.codex[id] || 0;
      return n
        ? h("li", { style: `--cc:${d.color}` }, h("strong", {}, `${d.boss ? "☠ " : ""}${d.name}`), h("span", {}, d.info), h("em", {}, `${fmt(n)} éliminé${n > 1 ? "s" : ""}`))
        : h("li", { class: "is-unknown" }, h("strong", {}, "???"), h("span", {}, d.boss ? "Boss inconnu" : "Ennemi inconnu"));
    }));
    const weapons = h("ul", { class: "sv-codex" }, WEAPON_IDS.map((id) => {
      const w = WEAPONS[id];
      const got = data.seenW.includes(id);
      const evo = data.seenE.includes(id);
      return h("li", { class: got ? "" : "is-unknown", style: `--cc:${w.color}` },
        h("strong", {}, `${w.glyph} ${w.name}`),
        h("span", {}, got ? w.desc : "Pas encore obtenue"),
        h("em", {}, `Évolution : ${evo ? w.evo.name : "???"} (${PASSIVES[w.evo.need].name})`));
    }));
    const affixes = Object.values(ELITE_AFFIXES).map((a) => a.name).join(", ");
    return h("div", {},
      h("h3", { class: "subhead" }, `Ennemis (${seen.length} / ${ENEMY_IDS.length})`),
      enemies,
      h("p", { class: "hint" }, `Élites (contour doré, lâchent un coffre) : ${affixes}.`),
      h("h3", { class: "subhead" }, `Armes et évolutions (${data.seenE.length} / ${WEAPON_IDS.length} évoluées)`),
      weapons);
  }

  function renderRecords(data) {
    const s = data.stats;
    const rows = [
      ["Parties", fmt(s.runs)], ["Temps total", clock(s.time)], ["Meilleur temps", clock(s.bestTime)], ["Ennemis éliminés", fmt(s.kills)],
      ["Record d'éliminations", fmt(s.bestRunKills)], ["Boss vaincus", fmt(s.bosses)], ["Élites", fmt(s.elites)], ["Gemmes", fmt(s.gems)],
      ["Évolutions", fmt(s.evos)], ["Niveau max", fmt(s.maxLevel)], ["Blackwall vaincu", fmt(s.blackwall)], ["Surtension débloquée", String(data.heat)]
    ];
    return h("dl", { class: "sv-sheet sv-records" }, rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
  }

  function onChar(id) {
    if (status === "running" || status === "paused") return;
    const c = charById(id);
    const st = charState(c);
    if (st === "locked") { say(c.challenge.text); return; }
    if (st === "poor") { say(`Il faut ${fmtShort(c.unlock)} crédits pour ${c.name}.`); return; }
    if (st === "ready" || st === "buy") {
      const price = st === "ready" ? 0 : c.unlock;
      if (!wallet.unlockChar(id, price)) { say("Déblocage impossible"); return; }
      say(`${c.name} débloqué !`);
    }
    charId = id;
    rememberChoice();
  }
  function onMap(id) {
    if (status === "running" || status === "paused" || !mapUnlocked(sv(), id)) return;
    mapId = id;
    rememberChoice();
  }
  function onHeat(k) {
    if (status === "running" || status === "paused" || k > sv().heat) return;
    heat = k;
    rememberChoice();
  }
  function rememberChoice() {
    sv().last = { char: charId, map: mapId, heat };
    wallet.saveSurvivor();
    state = newState();
    resizeBoard();
    renderSetup();
    updateHud();
    draw();
  }
  function onBuy(id) {
    if (status === "running" || status === "paused") return;
    if (buyImplant(sv(), id)) { wallet.saveSurvivor(); say("Implant installé"); state = newState(); }
    else say("Pas assez de noyaux");
    renderSetup();
    updateHud();
    draw();
  }
  function onRefund() {
    if (status === "running" || status === "paused") return;
    const n = refundImplants(sv());
    wallet.saveSurvivor();
    say(n ? `${fmt(n)} noyaux rendus` : "Aucun implant à rembourser");
    state = newState();
    renderSetup();
    updateHud();
    draw();
  }

  /* ---------- HUD (DOM) ---------- */

  function updateHud() {
    const { player, stats } = state;
    setText(timeEl, clock(state.time));
    setText(levelEl, state.level);
    setText(killsEl, fmtShort(state.kills));
    setText(bestEl, clock(Math.max(sv().best[state.mapId] || 0, Math.floor(state.time))));
    setText(coresEl, fmt(state.run.cores));
    hpBar.style.width = `${Math.max(0, player.hp / stats.maxHp) * 100}%`;
    xpBar.style.width = `${Math.min(100, (state.xp / xpNeeded(state.level)) * 100)}%`;
    ultBar.style.width = `${Math.min(100, (state.ult / state.ultMax) * 100)}%`;
    setText(hpText, `${Math.ceil(Math.max(0, player.hp))} / ${stats.maxHp} PV${state.revives ? ` · ${state.revives} vie${state.revives > 1 ? "s" : ""}` : ""}`);
    setText(xpText, `Niveau ${state.level} · ${Math.floor(state.xp)} / ${xpNeeded(state.level)} XP`);
    const u = ULTS[charById(state.character).ult];
    setText(ultText, state.ult >= state.ultMax ? `${u.name} : PRÊT` : `${u.name} · ${state.ult} / ${state.ultMax}`);
    ultButton.disabled = status !== "running" || state.ult < state.ultMax;
    ultButton.classList.toggle("is-ready", state.ult >= state.ultMax);

    const sig = state.weapons.map((w) => `${w.id}${w.lvl}${w.evo}`).join() + "|" + state.passives.map((p) => `${p.id}${p.lvl}`).join();
    if (weaponList.dataset.sig !== sig) {
      weaponList.dataset.sig = sig;
      weaponList.replaceChildren(...(state.weapons.length ? state.weapons.map((w) => {
        const W = WEAPONS[w.id];
        const ready = !w.evo && w.lvl >= 8 && passiveOf(state, W.evo.need);
        return h("li", { class: w.evo ? "sv-r-legendary" : ready ? "sv-r-epic" : "", style: `--rc:${w.evo ? RARITIES.legendary.color : RARITIES.epic.color}`, title: W.desc },
          `${W.glyph} ${w.evo ? W.evo.name : W.name} `, h("span", { class: "sv-lv" }, w.evo ? "★" : `niv. ${w.lvl}`),
          ready ? h("span", { class: "sv-syn" }, " · prête à évoluer (coffre)") : null);
      }) : [h("li", { class: "hint" }, "Aucune")]));
      passiveList.replaceChildren(...(state.passives.length ? state.passives.map((p) => {
        const P = PASSIVES[p.id];
        return h("li", { title: P.desc }, `${P.glyph} ${P.name} `, h("span", { class: "sv-lv" }, `niv. ${p.lvl}/${P.max}`));
      }) : [h("li", { class: "hint" }, "Aucun")]));
      sheetList.replaceChildren(...statSheet(state).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]).flat());
    }
  }

  /* ---------- Montée de niveau et coffres ---------- */

  function showChoices() {
    levelPanel.hidden = !state.choices || status === "over";
    if (state.choices === shownChoices) return;
    shownChoices = state.choices;
    if (!state.choices) { banishMode = false; return; }
    levelTitle.textContent = state.pending > 1 ? `Niveau supérieur (×${state.pending})` : "Niveau supérieur";
    levelHint.textContent = banishMode ? "Mode bannissement : clique sur une NOUVELLE arme ou un NOUVEAU module à bannir" : `Choisis une amélioration (touches 1 à ${state.choices.length})`;
    choiceList.replaceChildren(...state.choices.map((c, i) => {
      const d = describeChoice(state, c);
      const rar = RARITIES[d.rarity] || RARITIES.common;
      return h("button", {
        class: `sv-choice sv-r-${d.rarity}${banishMode ? " is-banish" : ""}`, type: "button", "data-upgrade": c.id, style: `--rc:${rar.color}`,
        onclick: () => (banishMode ? doBanish(i) : pick(i))
      },
      h("strong", {}, h("span", { class: "sv-glyph", style: `color:${d.color}` }, d.glyph), ` ${i + 1}. ${d.name}`),
      h("span", {}, d.desc),
      d.max ? h("em", {}, d.isNew ? `Nouveau !${d.to > 1 ? ` (niveau ${d.to})` : ""}` : `Niveau ${d.from} → ${d.to} / ${d.max}`) : null,
      d.rarity !== "common" ? h("em", { class: "sv-rar" }, `${rar.name} (+${rar.bonus} niveau${rar.bonus > 1 ? "x" : ""})`) : null,
      d.hint ? h("span", { class: "sv-hint" }, d.hint) : null);
    }));
    setText(rerollBtn, `⟳ Relancer (${state.rerolls}) [R]`);
    setText(skipBtn, `⏭ Passer (${state.skips}) [X]`);
    setText(banishBtn, banishMode ? "✕ Annuler le bannissement" : `⊘ Bannir (${state.banishes}) [B]`);
    rerollBtn.disabled = state.rerolls <= 0;
    skipBtn.disabled = state.skips <= 0;
    banishBtn.disabled = state.banishes <= 0 && !banishMode;
    choiceList.firstElementChild?.focus({ preventScroll: true });
  }

  function afterChoice() {
    shownChoices = null;
    showChoices();
    updateHud();
    draw();
  }
  function pick(i) { if (chooseUpgrade(state, i)) afterChoice(); }
  function doReroll() { if (reroll(state)) afterChoice(); }
  function doSkip() { if (skipChoice(state)) afterChoice(); }
  function doBanish(i) {
    if (banishChoice(state, i)) { banishMode = false; afterChoice(); say("Banni pour cette partie"); }
    else say("On ne peut bannir qu'une nouveauté");
  }

  function showChest() {
    chestPanel.hidden = !state.chest || status === "over";
    if (state.chest === shownChest) return;
    shownChest = state.chest;
    if (!state.chest) return;
    chestTitle.textContent = state.chest.items.some((x) => x.kind === "evo") ? "Évolution !" : state.chest.big ? "Grand coffre" : "Coffre";
    chestList.replaceChildren(...state.chest.items.map((it) => h("li", { class: `sv-chest-${it.kind}` },
      h("strong", {}, it.kind === "evo" ? `★ ${it.name}` : it.name), h("span", {}, it.desc))));
    chestButton.focus({ preventScroll: true });
  }
  function doCloseChest() {
    if (!state.chest) return;
    closeChest(state);
    showChest();
    if (state.pending > 0 && !state.choices) {
      // la montée de niveau en attente s'affichera au prochain pas
    }
    updateHud();
    draw();
  }

  function fireUlt() {
    if (status !== "running") return;
    if (useUlt(state)) { updateHud(); }
  }

  /* ---------- Partie ---------- */

  function showOverlay(title, text, label, takeFocus = true, extra = []) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayExtra.replaceChildren(...extra);
    overlayExtra.hidden = !extra.length;
    startButton.textContent = label;
    overlay.hidden = false;
    if (takeFocus) startButton.focus({ preventScroll: true });
  }

  // Sur PC : amène l'arène sous les bandeaux collants (en-tête, portefeuille) pour voir le haut de l'écran de jeu.
  function bringIntoView() {
    if (full) return;
    if (window.matchMedia("(max-width: 760px)").matches) { scrollToPlay(wrap); return; }
    let cover = 0;
    for (const el of document.querySelectorAll(".site-header, #wallet-bar")) {
      const pos = getComputedStyle(el).position;
      if (pos === "sticky" || pos === "fixed") cover = Math.max(cover, el.getBoundingClientRect().bottom);
    }
    const top = wrap.getBoundingClientRect().top;
    if (top >= cover && wrap.getBoundingClientRect().bottom <= window.innerHeight) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + top - cover - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function startGame() {
    state = newState();
    resizeBoard();
    shownChoices = null;
    shownChest = null;
    keys.clear();
    setSetupOpen(false);
    requestAnimationFrame(bringIntoView);   // après la fermeture du menu (la page a bougé)
    setStatus("running");
    overlay.hidden = true;
    showChoices();
    showChest();
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame(showScreen = true) {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    if (showScreen && !state.choices && !state.chest) showOverlay("Pause", "P pour reprendre.", "Reprendre", false, pauseExtra());
  }
  function pauseExtra() {
    return [h("dl", { class: "sv-sheet" }, statSheet(state).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))];
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
    // partie finie : plus de choix ni de coffre en attente
    state.choices = null;
    state.chest = null;
    state.pending = 0;
    banishMode = false;
    levelPanel.hidden = true;
    chestPanel.hidden = true;
    const seconds = Math.floor(state.time);
    // Récompense de base + pourcentage de la fortune actuelle (calculé avant de payer).
    const credits = creditsFor(state) + wealthBonus(wallet.credits, survivorPct(seconds));
    const coins = coinsFor(state);
    const res = applyRun(sv(), state);
    // défis réussis : personnages débloqués d'office
    for (const id of res.challenges) wallet.unlockChar(id, 0);
    const record = wallet.setBest("bestSurvivor", seconds);
    wallet.saveSurvivor();
    if (credits > 0) wallet.addCredits(credits);
    if (coins > 0) wallet.addBlue(coins);
    updateHud();
    draw();
    showChoices();
    showChest();
    const lines = [];
    lines.push(h("p", { class: "sv-gains" },
      `+${fmtShort(credits)} crédits · +${fmt(res.cores)} ◈ noyaux${coins > 0 ? ` · +${coins} pièce${coins > 1 ? "s" : ""} bleue${coins > 1 ? "s" : ""}` : ""}`));
    const news = [];
    if (res.record) news.push(`Nouveau record sur ${state.map.name} !`);
    if (record && !res.record) news.push("Nouveau record absolu !");
    if (res.heatUp) news.push(`Surtension ${sv().heat} débloquée !`);
    for (const id of res.unlockedMaps) news.push(`Carte débloquée : ${mapById(id).name}`);
    for (const id of res.challenges) news.push(`Personnage débloqué : ${charById(id).name}`);
    if (state.run.blackwall) news.push("Tu as vaincu le Blackwall !");
    for (const n of news) lines.push(h("p", { class: "sv-news" }, n));
    const killer = state.run.killer && ENEMY_DEFS[state.run.killer] ? ENEMY_DEFS[state.run.killer].name : state.run.killer === "acid" ? "l'acide" : null;
    if (killer) lines.push(h("p", { class: "hint" }, `Éliminé par : ${killer}`));
    const dmg = Object.entries(state.run.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (dmg.length) {
      const total = dmg.reduce((a, [, v]) => a + v, 0) || 1;
      lines.push(h("ul", { class: "sv-dmg" }, dmg.map(([src, v]) => h("li", {},
        h("span", {}, SOURCE_NAMES[src] || src), h("span", { class: "sv-dmg-bar", style: `--w:${Math.round((v / total) * 100)}%` }), h("em", {}, fmtShort(Math.round(v)))))));
    }
    showOverlay(state.run.blackwall ? "Légende" : "Hors service",
      `${clock(seconds)} · ${fmt(state.kills)} éliminés · niveau ${state.level} · ${state.run.bosses} boss`,
      "Rejouer", true, lines);
    renderSetup();
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
    while (acc >= STEP && steps < 5 && status === "running") {
      acc -= STEP;
      steps += 1;
      const events = update(state, STEP, currentInput());
      for (const m of state.msgs) say(m.text);
      state.msgs.length = 0;
      if (events.levelUp && !state.chest) say("Niveau supérieur !");
      if (events.over) { finish(); return; }
      if (state.choices || state.chest) break;
    }
    if (steps === 5) acc = 0;
    showChest();
    if (!state.chest) showChoices();
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
    const onButton = event.target instanceof Element && event.target.closest("a, button, input");

    if (state.chest && status === "running") {
      if (key === "enter" || key === " " || key === "e") { event.preventDefault(); doCloseChest(); }
      return;
    }
    if (state.choices && status === "running") {
      if (/^[1-4]$/.test(key) && Number(key) <= state.choices.length) { event.preventDefault(); const i = Number(key) - 1; banishMode ? doBanish(i) : pick(i); return; }
      if (key === "r") { doReroll(); return; }
      if (key === "x") { doSkip(); return; }
      if (key === "b") { if (state.banishes > 0 || banishMode) { banishMode = !banishMode; shownChoices = null; showChoices(); } return; }
    }
    if (key === "p" || key === "escape") {
      if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }
    if (key === " " && status === "running" && !onButton) {
      event.preventDefault();
      fireUlt();
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

  // Sauvegarde modifiée ailleurs (autre onglet, import) : on rafraîchit le menu hors partie
  wallet.subscribe(() => { if (active && status !== "running" && status !== "paused") renderSetup(); });

  /* ---------- Démarrage ---------- */

  renderOpts();
  renderSetup();
  updateHud();
  draw();
  showOverlay("Survivor Arena", "Esquive, ramasse les gemmes, fais évoluer tes armes et tiens jusqu'au Blackwall.", "Commencer", false);

  return {
    activate() {
      active = true;
      refit();
      renderSetup();
      updateHud();
      draw();
      if (status === "paused" && !state.choices && !state.chest) showOverlay("Pause", "P pour reprendre.", "Reprendre", false, pauseExtra());
    },
    deactivate() {
      active = false;
      keys.clear();
      endDrag();
      pauseGame(false);
    }
  };
}
