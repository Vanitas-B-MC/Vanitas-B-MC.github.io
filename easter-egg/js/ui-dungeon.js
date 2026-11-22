// js/ui-dungeon.js — affichage et commandes de « Donjon » (logique dans dungeon.js).
// Déplacement : flèches, ZQSD/WASD, ou glisser le doigt sur l'arène. Attaque automatique.
// Compétence : Espace / Maj / E, ou le bouton à l'écran. Pause : P.

import {
  W, H, X0, Y0, X1, Y1, TILE, COLS, ROWS, DOORS, PLAYER_R, CLASSES, FREE_CLASS, META, ITEMS, ENEMIES, BOSSES, roomLabel,
  createState, update, chooseItem, runRewards
} from "./dungeon.js";
import { describe, metaCost } from "./dungeon.js";
import { wealthBonus, dungeonPct } from "./rewards.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const STEP = 1 / 60;

export function createDungeonUI(root, wallet) {
  let active = false;
  let status = "idle";                 // idle | running | paused | over
  let classId = FREE_CLASS;
  let state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
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
  const forge = h("div", { class: "dg-forge" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Explore la carte de chaque étage salle par salle (minimap en haut à droite) : combats, salles d'élite, trésor, boutique, puis le boss et sa trappe vers l'étage suivant. Les portes se verrouillent tant qu'il reste des ennemis. Ton héros attaque tout seul, à toi d'esquiver et d'utiliser ta compétence. Les âmes gagnées financent des améliorations permanentes et de nouvelles classes."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        charBar,
        h("div", { class: "sv-board-wrap chamfer" }, stage),
        h("div", { class: "sv-bars" },
          h("div", { class: "sv-bar", role: "img", "aria-label": "Points de vie" }, hpBar, hpText)),
        skillButton),
      h("aside", { class: "sv-side" },
        h("dl", { class: "td-stats" },
          stat("Étage", floorEl), stat("Salle", roomEl), stat("Éliminés", killsEl), stat("Pièces", coinsEl),
          stat("Record", bestEl), stat("Âmes", soulsEl)),
        stateEl,
        h("h3", { class: "subhead" }, "Objets"),
        ownedList,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : se déplacer"),
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
    ctx.fillRect(0, 0, W, H);
    // sol
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
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
    ctx.fillRect(0, 0, W, Y0);
    ctx.fillRect(0, Y1, W, H - Y1);
    ctx.fillRect(0, Y0, X0, Y1 - Y0);
    ctx.fillRect(X1, Y0, W - X1, Y1 - Y0);
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
    if (!["bat", "wisp", "turret", "sentinel", "spider", "reaper", "orbiter", "lich"].includes(e.type)) {
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

  function draw() {
    drawRoom();
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
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();
    for (const s of state.shots) {
      ctx.fillStyle = s.color;
      glow(s.color, 10);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.bullets) {
      ctx.fillStyle = b.color;
      glow(b.color, 10);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();
    drawFx();
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
    const sk = state.cls.skill;
    const ready = p.skillCd <= 0;
    skillButton.textContent = ready ? `${sk.name} (Espace)` : `${sk.name} : ${Math.ceil(p.skillCd)} s`;
    skillButton.disabled = status !== "running" || !ready;
    renderOwned();
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

  function onClass(id) {
    if (status === "running") return;
    if (!wallet.data.dungeon.classes.includes(id)) {
      if (!wallet.dungeonUnlock(id)) return;
    }
    classId = id;
    state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
    renderMeta();
    updateHud();
    draw();
  }

  /* ---------- Partie ---------- */

  function startGame() {
    scrollToPlay(root.querySelector(".sv-board-wrap"));
    state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
    shownChoices = null;
    ownedKey = "";
    keys.clear();
    skillQueued = false;
    setStatus("running");
    overlay.hidden = true;
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
    const rw = runRewards(state);
    // Valeurs figées avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const credits = rw.credits + wealthBonus(wallet.credits, dungeonPct(rw.floor));
    const record = wallet.setBest("bestDungeon", rw.floor);
    wallet.dungeonRun(rw.souls);
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
    return { dx, dy, skill };
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
    if (KEYMAP[key] && status === "running") {
      event.preventDefault();
      keys.add(KEYMAP[key]);
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "shift" || key === "e") keys.delete("skill");
    const dir = KEYMAP[key];
    if (dir) keys.delete(dir);
  });

  function toCanvas(event) {
    const rect = board.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
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
