// js/ui-dungeon.js — affichage et commandes de « Donjon » (logique dans dungeon.js).
// Déplacement : flèches, ZQSD/WASD, ou glisser (doigt, ou souris si l'option est activée). Attaque automatique
// ou manuelle (maintenir le clic : on vise le curseur). Les grandes salles défilent avec la caméra.
// Compétence : Espace / Maj / E, ou le bouton à l'écran. Pause : P.

import {
  W, H, X0, Y0, X1, Y1, TILE, COLS, ROWS, WORLD_W, WORLD_H, DOORS, PLAYER_R, CLASSES, FREE_CLASS, META, ITEMS, ENEMIES, BOSSES, WEAPONS, weaponById, roomLabel,
  createState, update, chooseItem, runRewards
} from "./dungeon.js";
import { describe, metaCost } from "./dungeon.js";
import { wealthBonus, dungeonPct } from "./rewards.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";
import { createHubUI } from "./ui-hub.js";

const STEP = 1 / 60;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function createRunUI(root, wallet) {
  let active = false;
  let status = "idle";                 // idle | running | paused | over
  const OPT_KEY = "mc-dungeon-opts-v1";
  const opts = { move: "keys", attack: "auto", weapon: null };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY) || "{}")); } catch { /* stockage indisponible */ }
  if (!["keys", "mouse"].includes(opts.move)) opts.move = "keys";
  if (!["auto", "manual"].includes(opts.attack)) opts.attack = "auto";
  const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch { /* ignoré */ } };
  let classId = FREE_CLASS;
  const currentWeapon = () => {
    const unlocked = wallet.data.dungeon.weapons || [];
    return opts.weapon && unlocked.includes(opts.weapon) ? opts.weapon : CLASSES.find((c) => c.id === classId).weapon;
  };
  const newState = () => createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks, weaponId: currentWeapon() });
  let state = newState();
  const cam = { x: 0, y: 0, room: null };
  let aim = null;                      // curseur en coordonnées « monde » (visée manuelle)
  let firing = false;
  let touchOnly = false;               // dernier contact = doigt : visée manuelle indisponible
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  const keys = new Set();
  let skillQueued = false;
  let drag = null;
  let dragVec = { dx: 0, dy: 0 };
  let stick = null;
  let shownChoices = null;

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "dg-board", "aria-label": "Donjon" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Donjon");
  const overlayText = h("p", { class: "overlay-text" });
  const startButton = h("button", { class: "button button-primary", id: "dg-start", type: "button" }, "Entrer");
  const overlay = h("div", { class: "game-overlay", id: "dg-overlay" }, overlayTitle, overlayText, startButton);

  const choiceList = h("div", { class: "sv-choices" });
  const choicePanel = h("div", { class: "game-overlay sv-levelup", id: "dg-choices", hidden: true },
    h("p", { class: "overlay-title" }, "Coffre ouvert"),
    h("p", { class: "overlay-text" }, "Choisis un objet (touches 1 à 4)"),
    choiceList);

  const stage = h("div", { class: "game-stage dg-stage" }, board, overlay, choicePanel);

  const hpBar = h("span", { class: "sv-bar-fill sv-hp" });
  const hpText = h("span", { class: "sv-bar-text" });
  const floorEl = h("strong", {}, "1");
  const roomEl = h("strong", {}, "1/3");
  const killsEl = h("strong", {}, "0");
  const coinsEl = h("strong", {}, "0");
  const bestEl = h("strong", {}, "0");
  const soulsEl = h("strong", { id: "dg-souls" }, "0");
  const stateEl = h("p", { class: "game-state", "aria-live": "polite" }, "Prêt");
  const ownedList = h("ul", { class: "sv-owned" });

  const skillButton = h("button", { class: "button button-secondary dg-skill", id: "dg-skill", type: "button", onclick: () => { skillQueued = true; } });

  const charBar = h("div", { class: "td-maps", role: "group", "aria-label": "Classe" });
  const weaponBar = h("div", { class: "dg-weapons", role: "group", "aria-label": "Arme de départ" });
  const weaponInfo = h("p", { class: "dg-weapon-info" });
  const optionBar = h("div", { class: "dg-options", role: "group", "aria-label": "Commandes" });
  const weaponEl = h("strong", {}, "—");
  const heroStats = h("dl", { class: "td-stats dg-hero-stats" });
  const forge = h("div", { class: "dg-forge" });

  const setupPanel = h("div", { class: "dg-setup", id: "dg-setup" },
    charBar,
    h("h3", { class: "subhead" }, "Arme de départ"),
    weaponBar,
    weaponInfo,
    optionBar);
  const setupToggle = h("button", { class: "map-button dg-setup-toggle", id: "dg-setup-toggle", type: "button", "aria-expanded": "true", onclick: () => setSetupOpen(setupPanel.hidden) }, "▾ Classe, arme et commandes");
  function setSetupOpen(open) {
    setupPanel.hidden = !open;
    setupToggle.setAttribute("aria-expanded", String(open));
    setupToggle.textContent = `${open ? "▾" : "▸"} Classe, arme et commandes`;
  }
  const fsButton = h("button", { class: "map-button dg-fs", id: "dg-fs", type: "button", title: "Plein écran (F11 non requis)", onclick: () => toggleFullscreen() }, "⛶ Plein écran");
  fsButton.hidden = !document.fullscreenEnabled;
  const fsTarget = () => root.querySelector(".sv-board-wrap");
  function toggleFullscreen() {
    const el = fsTarget();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el?.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === fsTarget();
    fsButton.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    fsTarget()?.classList.toggle("is-fullscreen", on);
  });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Explore la carte de chaque étage salle par salle (minimap en haut à droite) : combats, salles d'élite, trésor, boutique, puis le boss et sa trappe vers l'étage suivant. Les portes se verrouillent tant qu'il reste des ennemis. Choisis ton arme de départ (34 armes, à débloquer avec les âmes) : le héros attaque tout seul, ou à la main si tu préfères viser. Certaines salles sont plus grandes et la caméra défile. Les âmes gagnées financent des améliorations permanentes et de nouvelles classes."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        setupToggle,
        setupPanel,
        h("div", { class: "dg-toolbar" }, fsButton),
        h("div", { class: "sv-board-wrap chamfer" }, stage),
        h("div", { class: "sv-bars" },
          h("div", { class: "sv-bar", role: "img", "aria-label": "Points de vie" }, hpBar, hpText)),
        skillButton),
      h("aside", { class: "sv-side" },
        h("dl", { class: "td-stats" },
          stat("Étage", floorEl), stat("Salle", roomEl), stat("Éliminés", killsEl), stat("Pièces", coinsEl),
          stat("Record", bestEl), stat("Âmes", soulsEl), stat("Arme", weaponEl)),
        stateEl,
        h("h3", { class: "subhead" }, "Statistiques du héros"),
        heroStats,
        h("h3", { class: "subhead" }, "Objets"),
        ownedList,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : se déplacer (ou souris, voir options)"),
          h("li", {}, "Attaque manuelle : maintiens le clic gauche (clic droit si le déplacement est à la souris), tu vises le curseur"),
          h("li", {}, h("kbd", {}, "Espace"), " : compétence · ", h("kbd", {}, "P"), " pause"),
          h("li", {}, "Mobile : glisse le doigt, bouton de compétence sous l'arène")))),
    h("h3", { class: "subhead" }, "Forge d'âmes"),
    forge
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
  const reduced = prefersReducedMotion();

  const glow = (color, blur = 10) => { ctx.shadowColor = color; ctx.shadowBlur = reduced ? 0 : blur; };
  const noGlow = () => { ctx.shadowBlur = 0; };
  const TYPE_COLOR = { boss: "#ff2a6d", treasure: "#fcee0a", shop: "#3ddc84", elite: "#ff8a3d", start: "#9aa4c7", combat: "#5b5a7a" };

  function drawRoom() {
    const th = state.theme;
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // sol
    const rA = Math.max(0, Math.floor((cam.y - Y0) / TILE)), rB = Math.min(ROWS, Math.ceil((cam.y + H - Y0) / TILE) + 1);
    const cA = Math.max(0, Math.floor((cam.x - X0) / TILE)), cB = Math.min(COLS, Math.ceil((cam.x + W - X0) / TILE) + 1);
    for (let r = rA; r < rB; r++) {
      for (let c = cA; c < cB; c++) {
        const x = X0 + c * TILE, y = Y0 + r * TILE;
        ctx.fillStyle = (r + c) % 2 === 0 ? th.a : th.b;
        ctx.fillRect(x, y, TILE, TILE);
        const ch = state.grid[r][c];
        if (ch === "#") {
          ctx.fillStyle = th.rock;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = th.wall;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = th.wall;
          ctx.fillRect(x + 5, y + 5, TILE - 10, 4);
          ctx.globalAlpha = 1;
        } else if (ch === "o") {
          ctx.fillStyle = "#020104";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = th.wall;
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          ctx.globalAlpha = 1;
        } else if (ch === "x") {
          ctx.fillStyle = "#ff3b5c";
          ctx.globalAlpha = 0.9;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(x + 4 + i * 9, y + TILE - 5);
            ctx.lineTo(x + 8.5 + i * 9, y + 6);
            ctx.lineTo(x + 13 + i * 9, y + TILE - 5);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    // murs
    ctx.strokeStyle = state.room.type === "boss" ? "#ff2a6d" : state.room.type === "treasure" ? "#fcee0a" : state.room.type === "shop" ? "#3ddc84" : th.wall;
    ctx.lineWidth = 3;
    glow(ctx.strokeStyle, 14);
    ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    noGlow();
    ctx.fillStyle = "rgba(255,255,255,.035)";
    ctx.fillRect(0, 0, WORLD_W, Y0);
    ctx.fillRect(0, Y1, WORLD_W, WORLD_H - Y1);
    ctx.fillRect(0, Y0, X0, Y1 - Y0);
    ctx.fillRect(X1, Y0, WORLD_W - X1, Y1 - Y0);
    // portes : ouverte (lumineuse) ou verrouillée (barres)
    for (const [d, door] of Object.entries(DOORS)) {
      if (!state.room.doors[d]) continue;
      const open = state.cleared;
      const horizontal = d === "u" || d === "d";
      const w = horizontal ? 56 : 12, hgt = horizontal ? 12 : 56;
      const x = d === "l" ? door.x - 14 : d === "r" ? door.x + 2 : door.x - w / 2;
      const y = d === "u" ? door.y - 14 : d === "d" ? door.y + 2 : door.y - hgt / 2;
      ctx.fillStyle = open ? "#0a0a12" : "#2a1620";
      ctx.fillRect(x, y, w, hgt);
      ctx.strokeStyle = open ? "#00f0ff" : "#ff3b5c";
      ctx.lineWidth = 2;
      glow(ctx.strokeStyle, open ? 12 : 4);
      ctx.strokeRect(x, y, w, hgt);
      noGlow();
      if (!open) {
        ctx.strokeStyle = "#ff3b5c";
        ctx.lineWidth = 1.5;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(x + (w / 4) * i, y); ctx.lineTo(x + (w / 4) * i, y + hgt); }
          else { ctx.moveTo(x, y + (hgt / 4) * i); ctx.lineTo(x + w, y + (hgt / 4) * i); }
          ctx.stroke();
        }
      }
    }
    // coffre
    if (state.chest && !state.chest.opened) {
      const c = state.chest;
      glow("#fcee0a", 16);
      ctx.fillStyle = "#c79a1c";
      ctx.fillRect(c.x - 13, c.y - 9, 26, 18);
      ctx.fillStyle = "#fcee0a";
      ctx.fillRect(c.x - 13, c.y - 9, 26, 6);
      ctx.fillRect(c.x - 3, c.y - 4, 6, 8);
      noGlow();
    }
    // trappe vers l'étage suivant
    if (state.trapdoor) {
      const t = state.trapdoor;
      ctx.fillStyle = "#000";
      glow("#00f0ff", 18);
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      noGlow();
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("ÉTAGE SUIVANT", t.x, t.y - 22);
    }
    // boutique
    if (state.room.stands) {
      for (const s of state.room.stands) {
        ctx.fillStyle = "#1b1830";
        ctx.fillRect(s.x - 16, s.y + 8, 32, 8);
        if (s.sold) continue;
        const color = s.kind === "heart" ? "#ff4d8d" : "#4dffd2";
        ctx.fillStyle = color;
        glow(color, 12);
        ctx.beginPath();
        if (s.kind === "heart") ctx.arc(s.x, s.y - 2, 9, 0, Math.PI * 2);
        else ctx.rect(s.x - 9, s.y - 11, 18, 18);
        ctx.fill();
        noGlow();
        ctx.textAlign = "center";
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = state.coins >= s.price ? "#fcee0a" : "#ff3b5c";
        ctx.fillText(`${s.price} ⛁`, s.x, s.y + 28);
        ctx.fillStyle = "#cfd6ff";
        ctx.fillText(s.kind === "heart" ? "Soin 40 %" : ITEMS[s.id].name, s.x, s.y - 20);
      }
    }
  }

  function drawMinimap() {
    const rooms = state.map.rooms;
    const known = (r) => r.visited || rooms.some((o) => o.visited && Math.abs(o.gx - r.gx) + Math.abs(o.gy - r.gy) === 1 && o.doors[(r.gx - o.gx === 1 ? "r" : r.gx - o.gx === -1 ? "l" : r.gy - o.gy === 1 ? "d" : "u")]);
    const cell = 15;
    const xs = rooms.map((r) => r.gx), ys = rooms.map((r) => r.gy);
    const ox = W - 14 - (Math.max(...xs) - Math.min(...xs) + 1) * cell - 4;
    const oy = 8;
    ctx.globalAlpha = 0.9;
    for (const r of rooms) {
      if (!known(r)) continue;
      const x = ox + (r.gx - Math.min(...xs)) * cell;
      const y = oy + (r.gy - Math.min(...ys)) * cell;
      ctx.fillStyle = r.visited ? (r.type === "combat" || r.type === "start" ? "#3a3858" : TYPE_COLOR[r.type]) : "#1d1b2e";
      if (!r.visited && r.type !== "combat") ctx.fillStyle = "#2a2840";
      ctx.fillRect(x, y, cell - 2, cell - 2);
      if (r === state.room) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1, y - 1, cell, cell);
      }
      if (!r.visited && (r.type === "boss" || r.type === "treasure" || r.type === "shop")) {
        ctx.fillStyle = TYPE_COLOR[r.type];
        ctx.fillRect(x + 3, y + 3, cell - 8, cell - 8);
      }
    }
    ctx.globalAlpha = 1;
  }

  const angleBetween = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  function drawEnemy(e) {
    const isBoss = e.boss;
    const def = isBoss ? BOSSES.find((b) => b.id === e.type) : ENEMIES[e.type];
    const color = def.color;
    if (e.spawn > 0) {
      ctx.globalAlpha = 0.3 + 0.4 * (1 - Math.min(1, e.spawn / 0.7));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 + Math.min(e.spawn, 1)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const t = state.time;
    // avertissements (ligne de charge, mèche de kamikaze)
    if (e.st === "windup" && (e.type === "charger" || e.type === "reaper" || e.type === "golem")) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ff3b5c";
      ctx.lineWidth = e.r * 1.6;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.dir) * 520, e.y + Math.sin(e.dir) * 520);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.type === "bomber" && e.st === "fuse") {
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 30);
      ctx.fillStyle = "#ff3b5c";
      ctx.beginPath();
      ctx.arc(e.x, e.y, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.type === "sniper" && e.st === "aim") {
      ctx.globalAlpha = e.t > 0.85 ? 0.9 : 0.3 + 0.2 * Math.sin(t * 30);
      ctx.strokeStyle = "#ff2a2a"; ctx.lineWidth = e.t > 0.85 ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 900, e.y + Math.sin(e.aim) * 900); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.type === "shade" && e.st === "wind") {
      ctx.globalAlpha = 0.3; ctx.strokeStyle = "#8e6bff"; ctx.lineWidth = e.r * 1.4;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 140, e.y + Math.sin(e.aim) * 140); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.hidden) {
      ctx.globalAlpha = 0.5;
      if (e.type === "burrower") {
        ctx.fillStyle = "#6b4a2a";
        for (let i = 0; i < 6; i++) { const a = i + t * 3; ctx.fillRect(e.x + Math.cos(a) * 11 - 2, e.y + Math.sin(a) * 6 - 2 - Math.abs(Math.sin(t * 9 + i)) * 4, 4, 4); }
        ctx.strokeStyle = "#b5651d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, 14, 6, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = "#8e6bff";
        for (let i = 0; i < 4; i++) ctx.fillRect(e.x + Math.sin(t * 7 + i * 2) * 9, e.y + Math.cos(t * 6 + i * 3) * 9, 3, 3);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const hit = e.flash > 0;
    const fill = hit ? "#ffffff" : e.burn > 0 ? "#ff8a3d" : e.slow > 0 ? "#7fd8ff" : color;
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    glow(color, e.elite || isBoss ? 18 : 8);
    const r = e.r;
    const flash = Math.floor(t * 14) % 2 === 0;
    switch (e.type) {
      case "bat": {
        const flap = Math.sin(t * 22 + e.id) * 5;
        ctx.beginPath();
        ctx.moveTo(e.x - r * 1.7, e.y - flap); ctx.lineTo(e.x, e.y - 3); ctx.lineTo(e.x + r * 1.7, e.y - flap); ctx.lineTo(e.x, e.y + r);
        ctx.closePath(); ctx.fill();
        break;
      }
      case "wisp": {
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 4 + e.id);
        ctx.beginPath();
        ctx.moveTo(e.x - r, e.y + r * 1.2); ctx.quadraticCurveTo(e.x - r * 1.2, e.y - r * 1.4, e.x, e.y - r * 1.2);
        ctx.quadraticCurveTo(e.x + r * 1.2, e.y - r * 1.4, e.x + r, e.y + r * 1.2);
        ctx.lineTo(e.x + r * 0.4, e.y + r * 0.7); ctx.lineTo(e.x, e.y + r * 1.2); ctx.lineTo(e.x - r * 0.4, e.y + r * 0.7);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "charger":
        if (e.st === "windup" && flash) ctx.fillStyle = "#ffffff";
        ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
        ctx.fillStyle = "#07060c";
        ctx.fillRect(e.x - r * 0.6, e.y - r - 4, 4, 5); ctx.fillRect(e.x + r * 0.6 - 4, e.y - r - 4, 4, 5);
        break;
      case "mage":
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - r * 1.5); ctx.lineTo(e.x + r, e.y + r); ctx.lineTo(e.x - r, e.y + r);
        ctx.closePath(); ctx.fill();
        break;
      case "turret": case "sentinel": {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 8; ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.lineWidth = isBoss ? 5 : 3;
        const spin = (e.spin || 0) * (isBoss ? 1.2 : 1);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(spin + (i * Math.PI) / 2) * (r + 7), e.y + Math.sin(spin + (i * Math.PI) / 2) * (r + 7));
          ctx.stroke();
        }
        break;
      }
      case "bomber":
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fillStyle = e.st === "fuse" && flash ? "#ffffff" : fill;
        ctx.fill();
        ctx.strokeStyle = "#fcee0a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r); ctx.lineTo(e.x + 5, e.y - r - 7); ctx.stroke();
        break;
      case "hopper": {
        const squash = e.st === "hop" ? 0.75 : 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + (e.st === "hop" ? -4 : 0), r * (2 - squash), r * squash, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "spawner":
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#07060c";
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(e.x + Math.cos(i * 2.1 + t) * r * 0.5, e.y + Math.sin(i * 2.1 + t) * r * 0.5, 3, 0, Math.PI * 2); ctx.fill(); }
        break;
      case "orbiter":
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x + Math.cos(t * 6) * r, e.y + Math.sin(t * 6) * r, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case "shade": {
        ctx.globalAlpha = e.t < 0.25 && e.st === "fade" ? 0.9 - e.t * 3 : 0.9;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r * 1.5); ctx.quadraticCurveTo(e.x + r * 1.4, e.y, e.x + r, e.y + r * 1.3);
        for (let i = 0; i < 3; i++) ctx.lineTo(e.x + r - (i + 1) * (r * 2 / 3), e.y + r * (i % 2 ? 1.3 : 0.7) + Math.sin(t * 8 + i) * 2);
        ctx.quadraticCurveTo(e.x - r * 1.4, e.y, e.x, e.y - r * 1.5); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e8ffff"; ctx.fillRect(e.x - 5, e.y - 3, 3, 4); ctx.fillRect(e.x + 2, e.y - 3, 3, 4);
        break;
      }
      case "sniper": {
        ctx.beginPath(); ctx.ellipse(e.x, e.y, r * 0.8, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
        const a = e.aim ?? angleBetween(e, state.player);
        ctx.strokeStyle = "#2b2b36"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * r * 2.4, e.y + Math.sin(a) * r * 2.4); ctx.stroke();
        ctx.fillStyle = e.st === "aim" ? "#ff2a2a" : "#7a1c1c"; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * r * 2.4, e.y + Math.sin(a) * r * 2.4, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "priest": {
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r); ctx.lineTo(e.x + r, e.y + r); ctx.lineTo(e.x - r, e.y + r); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#fff6c9"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y - r - 4 + Math.sin(t * 3) * 1.5, 7, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#c9a227"; ctx.fillRect(e.x - 1.5, e.y - 2, 3, 9); ctx.fillRect(e.x - 4, e.y + 1, 8, 3);
        break;
      }
      case "colossus": {
        const wind = e.st === "wind";
        const sh = wind ? Math.sin(t * 50) * 1.5 : 0;
        ctx.fillRect(e.x - r + sh, e.y - r * 0.7, r * 2, r * 1.7);
        ctx.fillRect(e.x - r * 1.5 + sh, e.y - r * 0.6, r * 0.6, r * 1.1); ctx.fillRect(e.x + r * 0.9 + sh, e.y - r * 0.6, r * 0.6, r * 1.1);
        ctx.fillRect(e.x - r * 0.6 + sh, e.y - r * 1.2, r * 1.2, r * 0.7);
        ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(e.x - 4, e.y - r * 0.7); ctx.lineTo(e.x + 1, e.y); ctx.lineTo(e.x - 3, e.y + r * 0.9); ctx.moveTo(e.x + 6, e.y - 2); ctx.lineTo(e.x + 10, e.y + 6); ctx.stroke();
        ctx.fillStyle = wind ? "#ff5a36" : "#ffd24a"; ctx.fillRect(e.x - 5, e.y - r * 1.0, 3, 3); ctx.fillRect(e.x + 2, e.y - r * 1.0, 3, 3);
        break;
      }
      case "burrower": {
        const n = 5;
        for (let i = n - 1; i >= 0; i--) {
          const k = i / n, rr = r * (1 - k * 0.5);
          ctx.beginPath(); ctx.arc(e.x - Math.cos(e.id) * i * 6, e.y + i * 4 + Math.sin(t * 8 + i) * 2, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#f3d9a8"; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a1d08"; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
        if (e.st === "stun") { ctx.strokeStyle = "#fcee0a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y - r - 4, 6, t * 6, t * 6 + 4); ctx.stroke(); }
        break;
      }
      case "drone": {
        ctx.fillRect(e.x - r * 0.7, e.y - r * 0.5, r * 1.4, r);
        ctx.strokeStyle = "#e8fffa"; ctx.lineWidth = 1.5;
        const w = Math.cos(t * 40) * r * 1.2;
        ctx.beginPath(); ctx.moveTo(e.x - w, e.y - r * 0.8); ctx.lineTo(e.x + w, e.y - r * 0.8); ctx.stroke();
        ctx.fillStyle = "#ff2a6d"; ctx.fillRect(e.x - 1, e.y - 1, 2, 2);
        break;
      }
      case "ember": {
        const fl = Math.sin(t * 14 + e.id) * 2;
        ctx.beginPath(); ctx.moveTo(e.x - r, e.y); ctx.quadraticCurveTo(e.x - r * 0.6, e.y - r * 1.8 - fl, e.x, e.y - r * 2.2 - fl);
        ctx.quadraticCurveTo(e.x + r * 0.6, e.y - r * 1.8 + fl, e.x + r, e.y); ctx.arc(e.x, e.y, r, 0, Math.PI); ctx.fill();
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(e.x, e.y - 1, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a0a00"; ctx.fillRect(e.x - 4, e.y - 3, 3, 3); ctx.fillRect(e.x + 1, e.y - 3, 3, 3); ctx.fillRect(e.x - 3, e.y + 2, 6, 2);
        break;
      }
      case "necro": {
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r * 1.2); ctx.lineTo(e.x + r * 1.1, e.y + r); ctx.lineTo(e.x - r * 1.1, e.y + r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#0a1a10"; ctx.beginPath(); ctx.arc(e.x, e.y - r * 0.5, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#6bffb0"; ctx.fillRect(e.x - 3, e.y - r * 0.6, 2, 2); ctx.fillRect(e.x + 1, e.y - r * 0.6, 2, 2);
        for (let i = 0; i < 3; i++) { const a = t * 2.4 + (i * Math.PI * 2) / 3; ctx.fillStyle = "#d9ffe9"; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * (r + 9), e.y + Math.sin(a) * (r + 9) * 0.6, 3, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case "skeleton": {
        ctx.beginPath(); ctx.arc(e.x, e.y - 2, r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(e.x - 1, e.y + 2, 2, r); ctx.fillRect(e.x - r * 0.7, e.y + 4, r * 1.4, 2);
        ctx.fillStyle = "#07060c"; ctx.fillRect(e.x - 3, e.y - 4, 2, 3); ctx.fillRect(e.x + 1, e.y - 4, 2, 3);
        break;
      }
      case "magnetar": {
        ctx.fillStyle = "#07060c"; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = fill; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(e.x, e.y, r + 6 + i * 5, (r + 6 + i * 5) * 0.4, t * (1.5 + i * 0.6) + i, 0, Math.PI * 2); ctx.globalAlpha = 0.8 - i * 0.2; ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "berserker": {
        const rage = 1 - e.hp / e.maxHp;
        if (rage > 0.1) { ctx.globalAlpha = 0.15 + rage * 0.35 + Math.sin(t * 20) * 0.05; ctx.fillStyle = "#ff1a1a"; ctx.beginPath(); ctx.arc(e.x, e.y, r * (1.5 + rage * 0.6), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = fill; }
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e8e0d0";
        ctx.beginPath(); ctx.moveTo(e.x - r * 0.8, e.y - r * 0.5); ctx.lineTo(e.x - r * 1.5, e.y - r * 1.5); ctx.lineTo(e.x - r * 0.2, e.y - r * 0.9); ctx.fill();
        ctx.beginPath(); ctx.moveTo(e.x + r * 0.8, e.y - r * 0.5); ctx.lineTo(e.x + r * 1.5, e.y - r * 1.5); ctx.lineTo(e.x + r * 0.2, e.y - r * 0.9); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(e.x - 5, e.y - 3, 4, 2); ctx.fillRect(e.x + 1, e.y - 3, 4, 2);
        break;
      }
      case "knight":
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#cfd6ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
        break;
      case "golem":
        if (e.st === "windup" && flash) ctx.fillStyle = "#ffffff";
        ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
        ctx.fillStyle = "#07060c"; ctx.fillRect(e.x - r * 0.55, e.y - r * 0.4, r * 0.35, r * 0.25); ctx.fillRect(e.x + r * 0.2, e.y - r * 0.4, r * 0.35, r * 0.25);
        break;
      case "spider":
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + 0.4 + Math.sin(t * 8 + i) * 0.12;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * r * 1.7, e.y + Math.sin(a) * r * 1.7); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        break;
      case "lich":
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r * 1.4); ctx.lineTo(e.x + r, e.y + r); ctx.lineTo(e.x - r, e.y + r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fcee0a"; ctx.fillRect(e.x - 8, e.y - r * 1.4 - 5, 16, 4);
        break;
      case "slimeking": {
        const sq = e.st === "hop" ? 0.8 : 1 + Math.sin(t * 4) * 0.04;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, r * (2 - sq), r * sq, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fcee0a";
        ctx.beginPath(); ctx.moveTo(e.x - 14, e.y - r * sq); ctx.lineTo(e.x - 8, e.y - r * sq - 12); ctx.lineTo(e.x, e.y - r * sq - 4); ctx.lineTo(e.x + 8, e.y - r * sq - 12); ctx.lineTo(e.x + 14, e.y - r * sq); ctx.closePath(); ctx.fill();
        break;
      }
      case "reaper":
        if (e.st === "windup" && flash) ctx.fillStyle = "#ff3b5c";
        ctx.beginPath(); ctx.moveTo(e.x, e.y - r * 1.5); ctx.quadraticCurveTo(e.x + r * 1.4, e.y, e.x + r, e.y + r * 1.2); ctx.lineTo(e.x - r, e.y + r * 1.2); ctx.quadraticCurveTo(e.x - r * 1.4, e.y, e.x, e.y - r * 1.5); ctx.fill();
        ctx.strokeStyle = "#9aa4ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(e.x + r, e.y + r); ctx.lineTo(e.x + r * 1.6, e.y - r * 1.2); ctx.quadraticCurveTo(e.x + r * 2.4, e.y - r * 1.6, e.x + r * 2, e.y - r * 0.4); ctx.stroke();
        break;
      default:   // slime, slimelet, splitter, brute, archer…
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
        if (e.type === "splitter") { ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(e.x - r * 0.35, e.y + r * 0.2, r * 0.4, 0, Math.PI * 2); ctx.arc(e.x + r * 0.4, e.y + r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill(); }
        if (e.type === "archer") { ctx.strokeStyle = "#07060c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x + 6, e.y, r * 0.9, -1.2, 1.2); ctx.stroke(); }
        if (e.type === "brute") { ctx.fillStyle = "#07060c"; ctx.fillRect(e.x - r * 0.7, e.y - r * 0.5, r * 1.4, 3); }
    }
    noGlow();
    if (e.elite) {
      ctx.strokeStyle = "#fcee0a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!["bat", "wisp", "turret", "sentinel", "spider", "reaper", "orbiter", "lich", "shade", "sniper", "priest", "colossus", "burrower", "drone", "ember", "necro", "skeleton", "magnetar", "berserker"].includes(e.type)) {
      ctx.fillStyle = "#07060c";
      ctx.fillRect(e.x - e.r * 0.45, e.y - e.r * 0.25, 3, 3);
      ctx.fillRect(e.x + e.r * 0.45 - 3, e.y - e.r * 0.25, 3, 3);
    }
    if (!isBoss && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
      ctx.fillStyle = "#ff3b5c";
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  function drawPlayer() {
    const p = state.player;
    const cls = state.cls;
    const blink = p.inv > 0 && Math.floor(state.time * 20) % 2 === 0;
    ctx.globalAlpha = p.ghost > 0 ? 0.35 : blink ? 0.45 : 1;
    ctx.fillStyle = cls.color;
    glow(cls.color, 14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    noGlow();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.facing) * 4, p.y + Math.sin(p.facing) * 4);
    ctx.lineTo(p.x + Math.cos(p.facing) * (PLAYER_R + 6), p.y + Math.sin(p.facing) * (PLAYER_R + 6));
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (p.shield > 0) {
      ctx.strokeStyle = "#4dffd2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.crit100 > 0) {
      ctx.strokeStyle = "#fcee0a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // orbes gardiens
    const n = state.stats.orbs;
    for (let i = 0; i < n; i++) {
      const a = state.orbAngle + (i * Math.PI * 2) / n;
      ctx.fillStyle = "#4dffd2";
      glow("#4dffd2", 10);
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 38, p.y + Math.sin(a) * 38, 6, 0, Math.PI * 2);
      ctx.fill();
      noGlow();
    }
  }

  function drawFx() {
    for (const f of state.fx) {
      const k = Math.max(0, f.ttl / f.max);
      if (drawExtraFx(f, k)) { ctx.globalAlpha = 1; continue; }
      if (f.kind === "slash") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 6;
        glow(f.color, 12);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, f.angle - f.arc / 2, f.angle + f.arc / 2);
        ctx.stroke();
        noGlow();
      } else if (f.kind === "ring") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.2 - k * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === "blast") {
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.1 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === "num") {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = f.color;
        ctx.font = `bold ${f.crit ? 15 : 11}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y - (1 - k) * 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Armes : effets visuels ---------- */

  const TAU = Math.PI * 2;
  const fract = (v) => v - Math.floor(v);

  // Effets propres aux armes. Renvoie true si l'effet a été dessiné.
  function drawExtraFx(f, k) {
    const t = 1 - k;
    switch (f.kind) {
      case "beam": {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        glow(f.color, 22);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.width * (0.5 + k);
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        noGlow();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, f.width * 0.35 * k);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x2, f.y2, f.width * 0.8 * k + 2, 0, TAU); ctx.fill();
        return true;
      }
      case "bolt": {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        const draw1 = (w, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = w;
          ctx.beginPath();
          for (let i = 1; i < f.pts.length; i++) {
            const a = f.pts[i - 1], b = f.pts[i];
            const segs = Math.max(2, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 16));
            ctx.moveTo(a.x, a.y);
            for (let j = 1; j <= segs; j++) {
              const u = j / segs;
              const jit = j === segs ? 0 : (Math.sin(f.seed * 7.3 + j * 12.9 + i * 3.1 + t * 40) * 9);
              const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
              ctx.lineTo(a.x + (b.x - a.x) * u + (nx / nl) * jit, a.y + (b.y - a.y) * u + (ny / nl) * jit);
            }
          }
          ctx.stroke();
        };
        glow(f.color, 16);
        draw1(3.5, f.color);
        noGlow();
        draw1(1.4, "#ffffff");
        return true;
      }
      case "slam": {
        ctx.globalAlpha = k * 0.7;
        ctx.strokeStyle = f.color; ctx.lineWidth = 4;
        glow(f.color, 14);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + t * 0.8), 0, TAU); ctx.stroke();
        noGlow();
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const a = (i * TAU) / 9 + 0.3;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * f.r * 0.25, f.y + Math.sin(a) * f.r * 0.25);
          ctx.lineTo(f.x + Math.cos(a + 0.12) * f.r * (0.55 + t * 0.4), f.y + Math.sin(a + 0.12) * f.r * (0.55 + t * 0.4));
          ctx.stroke();
        }
        ctx.globalAlpha = k * 0.25; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + t * 0.7), 0, TAU); ctx.fill();
        return true;
      }
      case "dash": {
        for (let i = 0; i < 5; i++) {
          const u = i / 4;
          ctx.globalAlpha = k * (1 - u) * 0.7;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x + (f.x2 - f.x) * u, f.y + (f.y2 - f.y) * u, PLAYER_R * (1 - u * 0.4), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = k;
        glow(f.color, 14); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        noGlow();
        return true;
      }
      case "thrust": {
        ctx.globalAlpha = k;
        const a = Math.atan2(f.y2 - f.y, f.x2 - f.x), len = Math.hypot(f.x2 - f.x, f.y2 - f.y);
        const reach = len * (0.4 + t * 0.6);
        ctx.fillStyle = f.color; glow(f.color, 14);
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * reach, f.y + Math.sin(a) * reach);
        ctx.lineTo(f.x + Math.cos(a + 1.6) * 6 + Math.cos(a) * len * 0.25 * t, f.y + Math.sin(a + 1.6) * 6 + Math.sin(a) * len * 0.25 * t);
        ctx.lineTo(f.x + Math.cos(a - 1.6) * 6 + Math.cos(a) * len * 0.25 * t, f.y + Math.sin(a - 1.6) * 6 + Math.sin(a) * len * 0.25 * t);
        ctx.closePath(); ctx.fill(); noGlow();
        return true;
      }
      case "whip": {
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3; glow(f.color, 12);
        ctx.beginPath();
        const reach = f.r * Math.min(1, 0.3 + t * 3);
        for (let i = 0; i <= 18; i++) {
          const u = i / 18, d = reach * u;
          const wob = Math.sin(u * 9 + f.seed + t * 30) * 9 * u * k;
          const px = f.x + Math.cos(f.angle) * d - Math.sin(f.angle) * wob;
          const py = f.y + Math.sin(f.angle) * d + Math.cos(f.angle) * wob;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke(); noGlow();
        return true;
      }
      default: return false;
    }
  }

  function drawShot(s) {
    if (s.tr && s.tr.length) {
      ctx.strokeStyle = s.color; ctx.lineCap = "round";
      for (let i = 1; i < s.tr.length; i++) {
        ctx.globalAlpha = (i / s.tr.length) * 0.55;
        ctx.lineWidth = Math.max(1, s.r * 1.4 * (i / s.tr.length));
        ctx.beginPath(); ctx.moveTo(s.tr[i - 1].x, s.tr[i - 1].y); ctx.lineTo(s.tr[i].x, s.tr[i].y); ctx.stroke();
      }
      ctx.lineCap = "butt"; ctx.globalAlpha = 1;
    }
    const a = Math.atan2(s.vy, s.vx), t = s.age;
    ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
    glow(s.color, 10);
    switch (s.shape) {
      case "arrow":
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - Math.cos(a) * 9, s.y - Math.sin(a) * 9); ctx.lineTo(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 9); ctx.lineTo(s.x + Math.cos(a + 2.5) * 5, s.y + Math.sin(a + 2.5) * 5); ctx.lineTo(s.x + Math.cos(a - 2.5) * 5, s.y + Math.sin(a - 2.5) * 5); ctx.fill();
        break;
      case "bolt":
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.x - Math.cos(a) * 12, s.y - Math.sin(a) * 12); ctx.lineTo(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10, 2, 0, TAU); ctx.fill();
        break;
      case "orb":
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r + Math.sin(t * 18) * 0.8, 0, TAU); ctx.fill();
        noGlow(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, TAU); ctx.fill();
        break;
      case "pellet":
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, TAU); ctx.fill();
        break;
      case "blade": {   // boomerang : croissant qui tourne
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, 9, t * 22, t * 22 + 2.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x, s.y, 9, t * 22 + Math.PI, t * 22 + Math.PI + 2.3); ctx.stroke();
        break;
      }
      case "ring": {   // chakram
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const b = t * 14 + (i * TAU) / 4; ctx.beginPath(); ctx.moveTo(s.x + Math.cos(b) * s.r, s.y + Math.sin(b) * s.r); ctx.lineTo(s.x + Math.cos(b) * (s.r + 4), s.y + Math.sin(b) * (s.r + 4)); ctx.stroke(); }
        break;
      }
      case "saw": {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const b = t * 16 + (i * TAU) / 16, rr = i % 2 ? s.r - 3 : s.r + 2; ctx.lineTo(s.x + Math.cos(b) * rr, s.y + Math.sin(b) * rr); }
        ctx.closePath(); ctx.fill();
        noGlow(); ctx.fillStyle = "#07060c"; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, TAU); ctx.fill();
        break;
      }
      case "missile":
        ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8); ctx.lineTo(s.x + Math.cos(a + 2.5) * 5, s.y + Math.sin(a + 2.5) * 5); ctx.lineTo(s.x + Math.cos(a - 2.5) * 5, s.y + Math.sin(a - 2.5) * 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(s.x - Math.cos(a) * 6, s.y - Math.sin(a) * 6, 2.5 + Math.sin(t * 40), 0, TAU); ctx.fill();
        break;
      case "fire": {
        const rr = s.r + Math.sin(t * 25) * 1.5;
        ctx.fillStyle = "#ff8a3d"; ctx.beginPath(); ctx.arc(s.x, s.y, rr + 2, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(s.x, s.y, rr - 1, 0, TAU); ctx.fill();
        break;
      }
      case "shard":
        ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8); ctx.lineTo(s.x + Math.cos(a + 1.57) * 3, s.y + Math.sin(a + 1.57) * 3); ctx.lineTo(s.x - Math.cos(a) * 6, s.y - Math.sin(a) * 6); ctx.lineTo(s.x + Math.cos(a - 1.57) * 3, s.y + Math.sin(a - 1.57) * 3); ctx.closePath(); ctx.fill();
        break;
      case "hole": {
        noGlow();
        ctx.fillStyle = "#07060c"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        glow(s.color, 16); ctx.lineWidth = 2; ctx.strokeStyle = s.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 2, t * 6, t * 6 + 4.2); ctx.stroke();
        break;
      }
      case "flame": {
        const k = Math.max(0, s.life / 0.3);
        ctx.globalAlpha = 0.25 + k * 0.6;
        ctx.fillStyle = k > 0.5 ? "#ffd166" : "#ff4a1a";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1.6 - k * 0.6), 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "echo": {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 1, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(s.x - Math.cos(a) * 7, s.y - Math.sin(a) * 7, s.r - 1, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      default:
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    noGlow();
  }

  function drawAux() {
    const t = state.time;
    for (const z of state.zones) {
      const life = Math.min(1, z.ttl / 0.6);
      if (z.kind === "poison") {
        ctx.globalAlpha = 0.22 * life; ctx.fillStyle = z.color;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7 * life; ctx.strokeStyle = z.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const ph = fract(t * 0.7 + i / 6), a = i * 2.1;
          ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.6 * ((i % 3) / 3 + 0.3), z.y + Math.sin(a) * z.r * 0.6 - ph * 18, 2 + ph * 3, 0, TAU); ctx.stroke();
        }
      } else if (z.kind === "hole") {
        ctx.globalAlpha = life;
        ctx.fillStyle = "#07060c"; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.35, 0, TAU); ctx.fill();
        ctx.strokeStyle = z.color; ctx.lineWidth = 2; glow(z.color, 14);
        for (let i = 0; i < 4; i++) {
          const rr = z.r * (0.3 + fract(t * 0.8 + i / 4) * 0.7);
          ctx.globalAlpha = life * (1 - (rr / z.r) * 0.8);
          ctx.beginPath(); ctx.arc(z.x, z.y, rr, t * 5 + i, t * 5 + i + 3.6); ctx.stroke();
        }
        noGlow();
      } else if (z.kind === "mine") {
        const armed = z.arm <= 0, pulse = 0.5 + 0.5 * Math.sin(t * (armed ? 14 : 5));
        ctx.globalAlpha = 0.9; ctx.fillStyle = armed ? "#ff3b5c" : z.color; glow(armed ? "#ff3b5c" : z.color, 8 + pulse * 8);
        ctx.beginPath(); ctx.arc(z.x, z.y, 6, 0, TAU); ctx.fill(); noGlow();
        ctx.globalAlpha = 0.18 + pulse * 0.1; ctx.strokeStyle = armed ? "#ff3b5c" : z.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      } else if (z.kind === "turret") {
        ctx.globalAlpha = Math.min(1, z.ttl); ctx.strokeStyle = z.color; ctx.fillStyle = "#07060c"; ctx.lineWidth = 2; glow(z.color, 10);
        ctx.beginPath(); ctx.moveTo(z.x, z.y - 9); ctx.lineTo(z.x + 8, z.y); ctx.lineTo(z.x, z.y + 9); ctx.lineTo(z.x - 8, z.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        noGlow();
        ctx.beginPath(); ctx.arc(z.x, z.y, 3, 0, TAU); ctx.fillStyle = z.color; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const d of state.delayed) {
      const u = 1 - d.t / d.max;
      if (d.kind === "shot") continue;
      if (d.shape === "grenade") {
        const px = d.ox + (d.x - d.ox) * Math.min(1, u * 1.3), py = d.oy + (d.y - d.oy) * Math.min(1, u * 1.3) - Math.sin(Math.min(1, u * 1.3) * Math.PI) * 40;
        ctx.fillStyle = d.color; glow(d.color, 8);
        ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill(); noGlow();
      }
      if (d.r > 12) {
        ctx.globalAlpha = 0.15 + u * 0.25; ctx.fillStyle = d.shape === "meteor" ? "#ff3b5c" : d.color;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * u, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = d.shape === "meteor" ? "#ff3b5c" : d.color; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (d.shape === "meteor") {
        const k = 1 - u;
        const mx = d.x + 90 * k, my = d.y - 340 * k;
        ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 5; ctx.globalAlpha = 0.6; glow("#ff6a1a", 18);
        ctx.beginPath(); ctx.moveTo(mx + 36 * k, my - 120 * k); ctx.lineTo(mx, my); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = "#ffe08a";
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, TAU); ctx.fill(); noGlow();
      }
    }
  }

  function updateCamera() {
    const maxX = Math.max(0, WORLD_W - W), maxY = Math.max(0, WORLD_H - H);
    const p = state.player;
    const tx = clamp(p.x - W / 2, 0, maxX), ty = clamp(p.y - H / 2, 0, maxY);
    if (cam.room !== state.room || reduced) { cam.x = tx; cam.y = ty; cam.room = state.room; }
    else { cam.x += (tx - cam.x) * 0.14; cam.y += (ty - cam.y) * 0.14; }
    cam.x = clamp(cam.x, 0, maxX); cam.y = clamp(cam.y, 0, maxY);
  }

  function drawAimMark() {
    if (opts.attack !== "manual" || !aim || status !== "running") return;
    ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 9, 0, TAU); ctx.moveTo(aim.x - 14, aim.y); ctx.lineTo(aim.x - 5, aim.y); ctx.moveTo(aim.x + 5, aim.y); ctx.lineTo(aim.x + 14, aim.y);
    ctx.moveTo(aim.x, aim.y - 14); ctx.lineTo(aim.x, aim.y - 5); ctx.moveTo(aim.x, aim.y + 5); ctx.lineTo(aim.x, aim.y + 14); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    updateCamera();
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    drawRoom();
    drawAux();
    for (const pk of state.pickups) {
      if (pk.kind === "coin") {
        ctx.fillStyle = "#fcee0a";
        glow("#fcee0a", 8);
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#ff4d8d";
        glow("#ff4d8d", 8);
        ctx.fillRect(pk.x - 5, pk.y - 5, 10, 10);
      }
      noGlow();
    }
    for (const h of state.hazards || []) {
      if (h.kind === "fire") {
        const k = Math.min(1, h.t / 0.6);
        ctx.globalAlpha = 0.55 * k; glow("#ff6a1a", 10); ctx.fillStyle = "#ff6a1a";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (0.8 + 0.15 * Math.sin(state.time * 14 + h.x)), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.45, 0, Math.PI * 2); ctx.fill();
        noGlow(); ctx.globalAlpha = 1;
      } else {
        const k = 1 - h.t / h.max;
        ctx.globalAlpha = 0.18 + 0.2 * k; ctx.fillStyle = "#ff2a2a";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (0.35 + 0.65 * k), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();
    for (const s of state.shots) drawShot(s);
    for (const b of state.bullets) {
      ctx.fillStyle = b.color;
      glow(b.color, 10);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();
    drawFx();
    drawAimMark();
    ctx.restore();
    drawMinimap();
    if (state.boss && !state.boss.dead && state.boss.spawn <= 0) {
      const b = state.boss;
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(W / 2 - 150, 22, 300, 10);
      ctx.fillStyle = "#ff2a6d";
      ctx.fillRect(W / 2 - 150, 22, 300 * Math.max(0, b.hp / b.maxHp), 10);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.name || "BOSS", W / 2, 18);
    }
    if (state.banner) {
      ctx.globalAlpha = Math.min(1, state.banner.ttl);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      glow(state.theme.wall, 14);
      ctx.fillText(state.banner.text, W / 2, H / 2 - 50);
      noGlow();
      ctx.globalAlpha = 1;
    }
    if (stick) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.x0, stick.y0, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(stick.x1, stick.y1, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Interface ---------- */

  function setStatus(next) {
    status = next;
    stateEl.textContent = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Partie terminée" }[next];
  }

  function showOverlay(title, text, label) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = label;
    overlay.hidden = false;
  }

  function updateHud() {
    const p = state.player;
    const pct = Math.max(0, p.hp / state.stats.maxHp);
    hpBar.style.width = `${pct * 100}%`;
    hpText.textContent = `${Math.ceil(p.hp)} / ${Math.round(state.stats.maxHp)} PV${p.shield ? ` · bouclier ${p.shield}` : ""}`;
    floorEl.textContent = `${state.floor} · ${state.theme.name}`;
    roomEl.textContent = roomLabel(state.room);
    killsEl.textContent = fmt(state.kills);
    coinsEl.textContent = fmt(state.coins);
    bestEl.textContent = String(wallet.data.bestDungeon);
    soulsEl.textContent = fmt(wallet.data.dungeon.souls);
    weaponEl.textContent = state.weapon.name;
    renderHeroStats();
    const sk = state.cls.skill;
    const ready = p.skillCd <= 0;
    skillButton.textContent = ready ? `${sk.name} (Espace)` : `${sk.name} : ${Math.ceil(p.skillCd)} s`;
    skillButton.disabled = status !== "running" || !ready;
    renderOwned();
  }

  // Statistiques détaillées du héros (classe, arme, forge d'âmes et objets cumulés).
  let heroKey = "";
  function renderHeroStats() {
    const st = state.stats, w = state.weapon;
    const key = [...Object.values(st).map((v) => Math.round(v * 100)), state.coins, w.id, state.player.hp > 0 ? Math.round(state.player.hp / 10) : 0].join(",");
    if (key === heroKey) return;
    heroKey = key;
    const pct = (v) => `${Math.round(v * 100)} %`;
    const melee = w.type === "melee";
    const rows = [
      ["PV max", Math.round(st.maxHp)],
      ["Dégâts", st.damage.toFixed(1)],
      ["Cadence", `${st.rate.toFixed(2)} /s`],
      ["DPS estimé", (st.damage * st.rate).toFixed(1)],
      ["Vitesse", Math.round(st.speed)],
      ["Critiques", pct(st.crit)],
      melee ? ["Portée", Math.round(st.range)] : ["Projectiles", st.shots],
      melee ? ["Arc", `${Math.round((st.arc * 180) / Math.PI)}°`] : ["Perforation", st.pierce],
      ["Vol de vie", st.vampire ? `+${st.vampire} PV / kill` : "—"],
      ["Régénération", st.regen ? `${st.regen.toFixed(1)} PV/s` : "—"],
      ["Brûlure", st.burn ? `niv. ${st.burn}` : "—"],
      ["Givre", st.frost ? "actif" : "—"],
      ["Bouclier", st.shieldMax ? `${st.shieldMax} (${st.shieldCd.toFixed(0)} s)` : "—"],
      ["Orbes", st.orbs || "—"],
      ["Épines", st.thorns || "—"],
      ["Détonateur", st.bomb ? `niv. ${st.bomb}` : "—"],
      ["Sang chaud", st.berserk ? `+${st.berserk * 13} % max` : "—"],
      ["Aimant", Math.round(st.magnet)],
      ["Pièces", Math.floor(state.coins)],
      ["Bonus pièces", `×${st.coinMul.toFixed(1)}`],
      ["Compétence", `${st.skillCd.toFixed(1)} s`]
    ];
    heroStats.replaceChildren(...rows.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, h("strong", {}, String(v))))));
  }

  let ownedKey = "";
  function renderOwned() {
    const key = JSON.stringify(state.owned);
    if (key === ownedKey) return;
    ownedKey = key;
    const entries = Object.entries(state.owned);
    ownedList.replaceChildren(...(entries.length
      ? entries.map(([id, n]) => h("li", { title: ITEMS[id].desc }, `${ITEMS[id].name} ×${n}`))
      : [h("li", { class: "sv-owned-empty" }, "Aucun objet (ouvre les coffres)")]));
  }

  function showChoices() {
    const has = !!state.choices && status === "running";
    if (!has) {
      shownChoices = null;
      choicePanel.hidden = true;
      return;
    }
    if (shownChoices === state.choices) return;
    shownChoices = state.choices;
    choiceList.replaceChildren(...state.choices.map((id, i) => {
      const d = describe(id);
      const owned = state.owned[id] || 0;
      return h("button", { class: "sv-choice", type: "button", onclick: () => pick(id) },
        h("span", { class: "sv-choice-key" }, String(i + 1)),
        h("strong", {}, d.name),
        h("span", {}, d.desc + (owned ? ` (niv. ${owned} → ${owned + 1})` : "")));
    }));
    choicePanel.hidden = false;
  }

  function pick(id) {
    if (chooseItem(state, id)) {
      showChoices();
      updateHud();
    }
  }

  /* ---------- Classes et forge ---------- */

  function renderMeta() {
    const d = wallet.data.dungeon;
    charBar.replaceChildren(...CLASSES.map((c) => {
      const unlocked = d.classes.includes(c.id);
      const label = unlocked ? c.name : `${c.name} · ${fmt(c.unlock)} âmes`;
      return h("button", {
        class: `map-button${classId === c.id ? " is-active" : ""}${unlocked ? "" : " is-locked"}`, type: "button", "data-class": c.id,
        title: `${c.desc} PV ${c.hp}.`,
        disabled: status === "running" || (!unlocked && d.souls < c.unlock),
        onclick: () => onClass(c.id)
      }, label);
    }));
    renderWeapons();
    renderOptions();
    forge.replaceChildren(...META.map((m) => {
      const rank = d.ranks[m.id];
      const maxed = rank >= m.max;
      const cost = metaCost(m.id, rank);
      return h("button", {
        class: "dg-upgrade", type: "button", "data-meta": m.id, disabled: maxed || d.souls < cost, title: m.desc,
        onclick: () => { wallet.dungeonBuyRank(m.id); }
      }, h("strong", {}, m.name), h("span", {}, m.desc), h("em", {}, maxed ? "Max" : `${rank}/${m.max} · ${fmt(cost)} âmes`));
    }));
  }

  function renderWeapons() {
    const d = wallet.data.dungeon;
    const have = d.weapons || [];
    const sel = currentWeapon();
    weaponBar.replaceChildren(...WEAPONS.map((w) => {
      const unlocked = have.includes(w.id);
      return h("button", {
        class: `dg-weapon${sel === w.id ? " is-active" : ""}${unlocked ? "" : " is-locked"}`, type: "button", "data-weapon": w.id,
        title: `${w.name} — ${w.desc}`,
        disabled: status === "running" || (!unlocked && d.souls < w.unlock),
        style: `--wc:${w.color}`,
        onclick: () => onWeapon(w.id)
      }, h("span", { class: "dg-weapon-icon", "aria-hidden": "true" }, w.icon),
        h("span", { class: "dg-weapon-name" }, w.name),
        unlocked ? null : h("em", {}, `${fmt(w.unlock)} âmes`));
    }));
    const w = weaponById(sel);
    weaponInfo.textContent = `${w.name} — ${w.desc}`;
  }

  function renderOptions() {
    const group = (label, key, choices) => h("div", { class: "dg-option" },
      h("span", { class: "dg-option-label" }, label),
      ...choices.map(([value, text, title]) => h("button", {
        class: `map-button${opts[key] === value ? " is-active" : ""}`, type: "button", title, "data-opt": `${key}:${value}`,
        onclick: () => { opts[key] = value; saveOpts(); renderOptions(); }
      }, text)));
    optionBar.replaceChildren(
      group("Déplacement", "move", [["keys", "Clavier", "Flèches / ZQSD"], ["mouse", "Souris", "Maintiens le clic gauche et glisse, comme le joystick du téléphone"]]),
      group("Attaque", "attack", [["auto", "Automatique", "Le héros vise l'ennemi le plus proche"], ["manual", "Manuelle", "Maintiens le clic (ou F) : tu vises le curseur"]]));
  }

  function onWeapon(id) {
    if (status === "running") return;
    if (!(wallet.data.dungeon.weapons || []).includes(id)) {
      if (!wallet.dungeonUnlockWeapon(id)) return;
    }
    opts.weapon = id;
    saveOpts();
    state = newState();
    renderMeta();
    updateHud();
    draw();
  }

  function onClass(id) {
    if (status === "running") return;
    if (!wallet.data.dungeon.classes.includes(id)) {
      if (!wallet.dungeonUnlock(id)) return;
    }
    classId = id;
    opts.weapon = null;
    saveOpts();
    state = newState();
    renderMeta();
    updateHud();
    draw();
  }

  /* ---------- Partie ---------- */

  function startGame() {
    scrollToPlay(root.querySelector(".sv-board-wrap"));
    state = newState();
    shownChoices = null;
    ownedKey = "";
    keys.clear();
    firing = false;
    skillQueued = false;
    setStatus("running");
    overlay.hidden = true;
    setSetupOpen(false);
    renderMeta();
    showChoices();
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame() {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    if (!state.choices) showOverlay("Pause", "P pour reprendre.", "Reprendre");
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
    setSetupOpen(true);
    const rw = runRewards(state);
    // Valeurs figées avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const credits = rw.credits + wealthBonus(wallet.credits, dungeonPct(rw.floor));
    const record = wallet.setBest("bestDungeon", rw.floor);
    wallet.dungeonRun(rw.souls, rw);
    if (credits > 0) wallet.addCredits(credits);
    if (rw.coins > 0) wallet.addBlue(rw.coins);
    showChoices();
    updateHud();
    draw();
    renderMeta();
    const gains = [`+${fmt(rw.souls)} âmes`, `+${fmt(credits)} crédits`, rw.coins ? `+${rw.coins} pièce${rw.coins > 1 ? "s" : ""} bleue${rw.coins > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
    showOverlay("Tombé au combat",
      `Étage ${rw.floor} · ${fmt(state.kills)} éliminés\n${gains}${record ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function currentInput() {
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1;
    if (keys.has("right")) dx += 1;
    if (keys.has("up")) dy -= 1;
    if (keys.has("down")) dy += 1;
    if (!dx && !dy) ({ dx, dy } = dragVec);
    const skill = skillQueued || keys.has("skill");
    const manual = opts.attack === "manual" && !touchOnly;
    return { dx, dy, skill, manual, aim: manual ? aim : null, fire: manual && (firing || keys.has("fire")) };
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
      const input = currentInput();
      const events = update(state, STEP, input);
      if (input.skill) skillQueued = false;
      if (events.roomCleared) stateEl.textContent = "Salle nettoyée — la porte est ouverte";
      if (events.advanced) stateEl.textContent = "En jeu";
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

    if (state.choices && status === "running" && /^[1-4]$/.test(key)) {
      const id = state.choices[Number(key) - 1];
      if (id) pick(id);
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
    if ((key === " " || key === "shift" || key === "e") && status === "running") {
      event.preventDefault();
      keys.add("skill");
      return;
    }
    if (key === "f" && status === "running" && opts.attack === "manual") {
      event.preventDefault();
      keys.add("fire");
      return;
    }
    if (KEYMAP[key] && status === "running") {
      event.preventDefault();
      keys.add(KEYMAP[key]);
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "shift" || key === "e") keys.delete("skill");
    if (key === "f") keys.delete("fire");
    const dir = KEYMAP[key];
    if (dir) keys.delete(dir);
  });

  function toCanvas(event) {
    const rect = board.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }
  const toWorld = (c) => ({ x: c.x + cam.x, y: c.y + cam.y });

  board.addEventListener("contextmenu", (event) => { if (status === "running") event.preventDefault(); });
  board.addEventListener("pointerdown", (event) => {
    if (status !== "running") return;
    touchOnly = event.pointerType === "touch" || event.pointerType === "pen";
    const c0 = toCanvas(event);
    aim = toWorld(c0);
    const moveMouse = opts.move === "mouse";
    // Souris : clic gauche = déplacement (si option) sinon tir manuel ; clic droit = tir manuel.
    if (event.pointerType === "mouse" && (event.button === 2 || (event.button === 0 && !moveMouse && opts.attack === "manual"))) {
      firing = true;
      board.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.pointerType === "mouse" && !moveMouse) return;
    drag = { x: event.clientX, y: event.clientY };
    stick = { x0: c0.x, y0: c0.y, x1: c0.x, y1: c0.y };
    board.setPointerCapture?.(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    const p1 = toCanvas(event);
    aim = toWorld(p1);
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const len = Math.hypot(dx, dy);
    if (stick) {
      const k = Math.min(1, 40 / Math.max(1, Math.hypot(p1.x - stick.x0, p1.y - stick.y0)));
      stick.x1 = stick.x0 + (p1.x - stick.x0) * k;
      stick.y1 = stick.y0 + (p1.y - stick.y0) * k;
    }
    dragVec = len < 8 ? { dx: 0, dy: 0 } : { dx: dx / Math.max(len, 40), dy: dy / Math.max(len, 40) };
  });
  const endDrag = (event) => {
    if (event.type === "pointercancel") { firing = false; drag = null; stick = null; dragVec = { dx: 0, dy: 0 }; return; }
    if (event.pointerType === "mouse" && event.button === 2) { firing = false; return; }
    if (!drag) firing = false;
    drag = null; stick = null; dragVec = { dx: 0, dy: 0 };
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") firing = false; });

  startButton.addEventListener("click", () => (status === "paused" ? resumeGame() : startGame()));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", () => { keys.clear(); firing = false; });

  // Le portefeuille notifie chaque seconde (revenu passif du Clicker) : on ne reconstruit la forge
  // que si les données du Donjon ont réellement changé.
  let lastMeta = JSON.stringify(wallet.data.dungeon);
  wallet.subscribe(() => {
    const now = JSON.stringify(wallet.data.dungeon);
    if (now === lastMeta) return;
    lastMeta = now;
    if (active) { renderMeta(); soulsEl.textContent = fmt(wallet.data.dungeon.souls); }
  });

  /* ---------- Démarrage ---------- */

  root.dgState = () => state;   // lecture seule : utile aux tests
  renderMeta();
  updateHud();
  draw();
  showOverlay("Donjon", "Descends le plus profond possible. Esquive, ouvre les coffres, bats les boss.", "Entrer");

  return {
    activate() {
      active = true;
      renderMeta();
      updateHud();
      draw();
    },
    deactivate() {
      active = false;
      keys.clear();
      if (status === "running") pauseGame();
    }
  };
}

// Page « Donjon » : deux onglets — le Hub (carte, PNJ, quêtes) et l'expédition (le donjon lui-même).
export function createDungeonUI(root, wallet) {
  let tab = "hub", running = false;
  const hubRoot = h("div", { id: "dg-hub", class: "dg-pane" });
  const runRoot = h("div", { id: "dg-run", class: "dg-pane", hidden: true });
  const hubTab = h("button", { class: "map-button is-active", type: "button", id: "dg-tab-hub", role: "tab", onclick: () => show("hub") }, "🏰 Hub");
  const runTab = h("button", { class: "map-button", type: "button", id: "dg-tab-run", role: "tab", onclick: () => show("run") }, "⚔ Expédition");
  root.replaceChildren(h("div", { class: "td-maps dg-tabs", role: "tablist", "aria-label": "Donjon" }, hubTab, runTab), hubRoot, runRoot);
  const run = createRunUI(runRoot, wallet);
  const hub = createHubUI(hubRoot, wallet, { onEnter: () => show("run") });

  function show(next) {
    tab = next;
    hubRoot.hidden = next !== "hub";
    runRoot.hidden = next !== "run";
    hubTab.classList.toggle("is-active", next === "hub");
    runTab.classList.toggle("is-active", next === "run");
    hubTab.setAttribute("aria-selected", String(next === "hub"));
    runTab.setAttribute("aria-selected", String(next === "run"));
    if (!running) return;
    if (next === "hub") { run.deactivate(); hub.activate(); } else { hub.deactivate(); run.activate(); }
    root.scrollIntoView?.({ block: "start", behavior: "auto" });
  }

  return {
    activate() { running = true; show(tab); },
    deactivate() { running = false; run.deactivate(); hub.deactivate(); }
  };
}
