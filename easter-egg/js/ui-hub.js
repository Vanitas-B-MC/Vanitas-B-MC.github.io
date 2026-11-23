// js/ui-hub.js — le Hub du Donjon : une grande carte en défilement (Valoria, royaume médiéval, et
// Néo-Aska, cité cyberpunk) avec des PNJ qui donnent des quêtes payées en pièces bleues.
// Logique pure dans hub.js. Déplacement : flèches / ZQSD ou glisser ; E / Entrée : parler.

import * as HUB from "./hub.js";
import { h, fmt, prefersReducedMotion } from "./ui.js";

const { TILE, COLS, ROWS, WORLD_W, WORLD_H, MID, tileHash, groundAt, NPCS, QUESTS, PORTAL } = HUB;
const W = 720, H = 480, STEP = 1 / 60, TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const AREAS = [
  [(tx, ty) => tx >= 43 && tx <= 53 && ty >= 24 && ty <= 34, "Place des Deux Royaumes"],
  [(tx, ty) => tx >= 45 && tx <= 51 && ty >= 35, "Avenue du portail"],
  [(tx) => tx < MID, "Valoria — royaume médiéval"],
  [() => true, "Néo-Aska — cité cyberpunk"]
];
const areaAt = (tx, ty) => AREAS.find(([f]) => f(tx, ty))[1];

export function createHubUI(root, wallet, { onEnter = () => {} } = {}) {
  const reduced = prefersReducedMotion();
  const hub = HUB.createHub();
  const cam = { x: 0, y: 0 };

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "hub-board", width: W, height: H, "aria-label": "Hub : Valoria et Néo-Aska" });
  const stage = h("div", { class: "game-stage dg-stage hub-stage" }, board);
  const actionButton = h("button", { class: "button button-primary hub-action", id: "hub-action", type: "button", hidden: true, onclick: () => interact() });
  const dialog = h("div", { class: "hub-dialog chamfer", id: "hub-dialog", hidden: true, role: "dialog", "aria-label": "Dialogue" });
  const journal = h("div", { class: "hub-journal" });
  const careerStats = h("dl", { class: "td-stats dg-hero-stats" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Le hub relie deux royaumes : Valoria, médiéval, à l'ouest, et Néo-Aska, cyberpunk, à l'est. Explore la carte, parle aux habitants (E ou le bouton) et accepte leurs quêtes : elles se remplissent pendant tes expéditions dans le donjon et rapportent des pièces bleues. Le portail du donjon se trouve au sud, au bout de l'avenue."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        h("div", { class: "sv-board-wrap chamfer" }, stage),
        actionButton,
        dialog),
      h("aside", { class: "sv-side" },
        h("h3", { class: "subhead" }, "Journal de quêtes"),
        journal,
        h("h3", { class: "subhead" }, "Statistiques de carrière"),
        careerStats,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : marcher"),
          h("li", {}, h("kbd", {}, "E"), " : parler / entrer · ", h("kbd", {}, "Échap"), " : fermer"),
          h("li", {}, "Mobile : glisse le doigt, touche un habitant ou le bouton")))));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  board.width = W * dpr; board.height = H * dpr;
  const ctx = board.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* ---------- Outils de dessin ---------- */

  const rect = (x, y, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, hh); };
  const circ = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  const glow = (c, b = 10) => { ctx.shadowColor = c; ctx.shadowBlur = reduced ? 0 : b; };
  const noGlow = () => { ctx.shadowBlur = 0; };
  const neonText = (txt, x, y, color, size, seed = 0) => {
    const flick = reduced ? 1 : (Math.sin(time * 11 + seed) > 0.96 ? 0.35 : 1);
    ctx.globalAlpha = flick;
    ctx.font = `bold ${size}px monospace`; ctx.textAlign = "center";
    glow(color, 12); ctx.fillStyle = color; ctx.fillText(txt, x, y); noGlow();
    ctx.globalAlpha = 1;
  };
  let time = 0;
  const lights = [];        // lumières ajoutées pendant le dessin : [x, y, rayon, couleur, intensité]
  const addLight = (x, y, r, c, a = 1) => lights.push([x, y, r, c, a]);
  const lightSprites = new Map();
  function lightSprite(color) {
    let c = lightSprites.get(color);
    if (!c) {
      c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, color); gr.addColorStop(0.35, color + "88"); gr.addColorStop(1, color + "00");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      lightSprites.set(color, c);
    }
    return c;
  }
  const shade = (hex, k) => {   // éclaircit (k>0) ou assombrit (k<0) une couleur #rrggbb
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };

  /* ---------- Sol ---------- */

  function drawTile(tx, ty) {
    const x = tx * TILE, y = ty * TILE, g = groundAt(tx, ty), r = tileHash(tx, ty);
    switch (g) {
      case "grass":
        rect(x, y, TILE, TILE, ["#22432b", "#26492f", "#1f3d27"][Math.floor(r * 3)]);
        if (r > 0.72) { ctx.strokeStyle = "#356b3f"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 6, y + 16); ctx.moveTo(x + 12, y + 22); ctx.lineTo(x + 13, y + 15); ctx.moveTo(x + 22, y + 10); ctx.lineTo(x + 20, y + 5); ctx.stroke(); }
        break;
      case "path":
        rect(x, y, TILE, TILE, r > 0.5 ? "#6f5c40" : "#675538");
        circ(x + 6 + r * 18, y + 8 + r * 14, 1.6, "#4d3e29"); circ(x + 22 - r * 10, y + 24, 1.2, "#8a7552");
        break;
      case "cobble":
        rect(x, y, TILE, TILE, "#666675");
        ctx.strokeStyle = "#4e4e5b"; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 15, 15); ctx.strokeRect(x + 16.5, y + 0.5, 15, 15); ctx.strokeRect(x + 8.5, y + 16.5, 15, 15);
        if (r > 0.6) rect(x + 3, y + 3, 9, 4, "#74748a");
        break;
      case "avenue": {
        const left = tx < MID;
        rect(x, y, TILE, TILE, left ? ((tx + ty) % 2 ? "#5a5a68" : "#52525f") : ((tx + ty) % 2 ? "#1d1d30" : "#191929"));
        if (tx === MID) { rect(x, y, 2, TILE, "#00f0ff55"); rect(x + TILE - 2, y, 2, TILE, "#ff2a6d55"); }
        break;
      }
      case "sand":
        rect(x, y, TILE, TILE, r > 0.5 ? "#b5a474" : "#ac9c6c");
        if (r > 0.8) circ(x + 10, y + 12, 1.5, "#8d7f58");
        break;
      case "water":
      case "shore": {
        rect(x, y, TILE, TILE, g === "water" ? "#18486f" : "#256a8c");
        ctx.strokeStyle = g === "water" ? "#2f79a6" : "#7fd0e8"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
        const ph = reduced ? 0 : time * 1.3;
        for (let i = 0; i < 2; i++) { const yy = y + 8 + i * 14 + Math.sin(ph + tx * 0.9 + i) * 2; ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.quadraticCurveTo(x + 16, yy - 3, x + 29, yy); ctx.stroke(); }
        ctx.globalAlpha = 1;
        break;
      }
      case "asphalt":
        rect(x, y, TILE, TILE, r > 0.5 ? "#101018" : "#12121c");
        if (r > 0.92) { ctx.strokeStyle = "#1e1e30"; ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x + 12, y + 26); ctx.stroke(); }
        break;
      case "metal":
        rect(x, y, TILE, TILE, "#1a1a2a");
        ctx.strokeStyle = "#2a2a44"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        if ((tx + ty) % 4 === 0) rect(x + 12, y + 14, 8, 2, "#fcee0a66");
        break;
      case "neon":
        rect(x, y, TILE, TILE, "#13132a");
        ctx.strokeStyle = "rgba(0,240,255,.28)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        if (r > 0.8) rect(x + 10, y + 10, 12, 12, "rgba(255,42,109,.12)");
        break;
      default: rect(x, y, TILE, TILE, "#000");
    }
  }

  /* ---------- Bâtiments ---------- */

  const windowLit = (bx, by, i, j) => tileHash(bx + i * 3, by + j * 7) < 0.55;

  function drawBuilding(b) {
    const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, hh = b.th * TILE, bottom = y + hh;
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x + 4, bottom - 2, w, 8);
    switch (b.kind) {
      case "castle": {
        rect(x + 40, y - 6, w - 80, hh + 6, "#8b8b9b");
        for (let i = 0; i < 12; i++) rect(x + 40 + i * ((w - 80) / 12) + 2, y - 16, ((w - 80) / 12) - 6, 12, "#8b8b9b");   // créneaux
        ctx.strokeStyle = "#6c6c7c"; ctx.lineWidth = 1;
        for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.moveTo(x + 40, y + j * 40); ctx.lineTo(x + w - 40, y + j * 40); ctx.stroke(); }
        for (const tx of [x, x + w - 70]) {   // tours d'angle + toits coniques
          rect(tx, y - 50, 70, hh + 50, "#9a9aaa"); rect(tx, y - 50, 70, 8, "#6c6c7c");
          poly([[tx - 8, y - 50], [tx + 35, y - 120], [tx + 78, y - 50]], "#3b4f78"); poly([[tx + 35, y - 120], [tx + 78, y - 50], [tx + 35, y - 50]], "#2d3d5e");
          rect(tx + 31, y - 140, 2, 22, "#555"); poly([[tx + 33, y - 140], [tx + 55, y - 133], [tx + 33, y - 126]], "#d33b4f");
          for (let k = 0; k < 3; k++) { rect(tx + 26, y - 30 + k * 60, 18, 28, "#161628"); if (windowLit(b.tx, b.ty, k, 1)) { rect(tx + 28, y - 28 + k * 60, 14, 24, "#ffd27a"); addLight(tx + 35, y - 16 + k * 60, 40, "#ffb347", 0.6); } }
        }
        const gx = x + w / 2 - 34;   // porche
        rect(gx - 8, bottom - 78, 84, 78, "#767686"); rect(gx, bottom - 68, 68, 68, "#171726");
        ctx.fillStyle = "#171726"; ctx.beginPath(); ctx.arc(gx + 34, bottom - 68, 34, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "#5b4a35"; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(gx + 8 + i * 13, bottom - 90); ctx.lineTo(gx + 8 + i * 13, bottom); ctx.stroke(); }
        for (const bx of [x + 100, x + w - 112]) { rect(bx, y + 10, 14, 54, "#d33b4f"); poly([[bx, y + 64], [bx + 7, y + 74], [bx + 14, y + 64]], "#d33b4f"); rect(bx + 5, y + 20, 4, 14, "#fcee0a"); }
        break;
      }
      case "tavern": case "forge": case "barn": case "house": {
        const roofC = b.kind === "tavern" ? "#a43a2c" : b.kind === "forge" ? "#3a3a48" : b.kind === "barn" ? "#7a2b2b" : ["#a43a2c", "#3b5c8a", "#b08a3a"][b.v || 0];
        const wallC = b.kind === "forge" ? "#7b7b88" : b.kind === "barn" ? "#9b3a34" : "#d8c7a0";
        rect(x, y, w, hh, wallC);
        if (b.kind === "tavern" || b.kind === "house") { ctx.strokeStyle = "#5b3d24"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, hh - 3); for (let i = 1; i < b.tw; i++) { ctx.beginPath(); ctx.moveTo(x + i * TILE, y); ctx.lineTo(x + i * TILE, bottom); ctx.stroke(); } }
        poly([[x - 12, y + 4], [x + w / 2, y - b.roof], [x + w + 12, y + 4]], roofC);
        poly([[x + w / 2, y - b.roof], [x + w + 12, y + 4], [x + w / 2, y + 4]], shade(roofC, -0.25));
        ctx.strokeStyle = shade(roofC, -0.4); ctx.lineWidth = 1;
        for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(x - 12 + r * 6, y + 4 - r * (b.roof / 4)); ctx.lineTo(x + w + 12 - r * 6, y + 4 - r * (b.roof / 4)); ctx.stroke(); }
        rect(x + w / 2 - 12, bottom - 30, 24, 30, "#3b2616"); circ(x + w / 2 + 7, bottom - 14, 1.6, "#fcee0a");
        for (let i = 0; i < Math.max(1, b.tw - 3); i++) {
          const wx = x + 16 + i * 52, lit = windowLit(b.tx, b.ty, i, 0);
          if (wx + 20 > x + w - 8) continue;
          rect(wx, y + 18, 20, 20, lit ? "#ffd27a" : "#2a2a3e"); ctx.strokeStyle = "#5b3d24"; ctx.lineWidth = 2; ctx.strokeRect(wx, y + 18, 20, 20);
          if (lit) addLight(wx + 10, y + 28, 36, "#ffb347", 0.55);
        }
        if (b.kind === "tavern") { rect(x + w - 40, y + 6, 3, 24, "#3b2616"); rect(x + w - 56, y + 28, 36, 22, "#7b4a24"); ctx.strokeStyle = "#fcee0a"; ctx.strokeRect(x + w - 56, y + 28, 36, 22); ctx.fillStyle = "#fcee0a"; ctx.font = "bold 8px monospace"; ctx.textAlign = "center"; ctx.fillText("AUBERGE", x + w - 38, y + 42); }
        if (b.kind === "forge") { rect(x + w - 34, y - b.roof - 18, 18, 40, "#4a4a58"); addLight(x + w / 2, bottom - 14, 70, "#ff8a3d", 0.9); rect(x + w / 2 - 12, bottom - 30, 24, 30, "#ff8a3d"); rect(x + w / 2 - 6, bottom - 24, 12, 24, "#ffd166"); }
        if (b.kind === "barn") { ctx.strokeStyle = "#f1e6d0"; ctx.lineWidth = 3; ctx.strokeRect(x + w / 2 - 24, bottom - 50, 48, 50); ctx.beginPath(); ctx.moveTo(x + w / 2 - 24, bottom - 50); ctx.lineTo(x + w / 2 + 24, bottom); ctx.moveTo(x + w / 2 + 24, bottom - 50); ctx.lineTo(x + w / 2 - 24, bottom); ctx.stroke(); }
        if (!reduced && (b.kind === "tavern" || b.kind === "forge" || b.kind === "house")) {   // fumée
          const cx = b.kind === "forge" ? x + w - 25 : x + w - 22, cy = (b.kind === "forge" ? y - b.roof - 18 : y - b.roof * 0.55);
          for (let i = 0; i < 4; i++) { const ph = (time * 0.5 + i / 4) % 1; ctx.globalAlpha = 0.35 * (1 - ph); circ(cx + Math.sin(ph * 5 + i) * 6, cy - ph * 34, 4 + ph * 8, "#aab"); }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "stall": {
        rect(x + 4, y + 8, w - 8, hh - 8, "#6b4a2b");
        const c1 = b.v ? "#2f6fb0" : "#c8402f";
        for (let i = 0; i < 6; i++) rect(x + 2 + i * ((w - 4) / 6), y - 14, (w - 4) / 6, 20, i % 2 ? "#f3ead2" : c1);
        circ(x + 16, y + 6, 4, "#e6b04a"); circ(x + 28, y + 7, 4, "#c8402f"); circ(x + w - 18, y + 6, 4, "#7fb069");
        break;
      }
      case "gate": {
        const med = b.v === 0;
        if (med) { rect(x - 8, y - 20, 48, hh + 20, "#8b8b9b"); rect(x - 8, y - 30, 48, 12, "#6c6c7c"); rect(x + 8, y + 4, 4, 28, "#ffb347"); addLight(x + 10, y + 12, 50, "#ffb347", 0.9); }
        else { rect(x - 16, y - 20, 48, hh + 20, "#15152a"); rect(x - 16, y - 20, 48, 3, "#00f0ff"); rect(x - 16, y + hh - 3, 48, 3, "#ff2a6d"); glow("#00f0ff", 14); rect(x + 14, y, 3, hh - 4, "#00f0ff"); noGlow(); addLight(x + 14, y + 30, 60, "#00f0ff", 0.7); }
        break;
      }
      case "tower": {
        const col = ["#00f0ff", "#ff2a6d", "#fcee0a"][b.v || 0], top = y - b.roof;
        rect(x, top, w, hh + b.roof, "#10101e");
        rect(x, top, w, 4, col); rect(x, top, 3, hh + b.roof, shade("#10101e", 0.25)); rect(x + w - 3, top, 3, hh + b.roof, "#07070e");
        for (let j = 0; j < Math.floor((hh + b.roof - 24) / 18); j++) for (let i = 0; i < Math.floor((w - 12) / 14); i++) {
          const lit = windowLit(b.tx + i, b.ty + j, i, j);
          rect(x + 8 + i * 14, top + 14 + j * 18, 9, 11, lit ? (tileHash(i, j) > 0.7 ? "#ff7ad9" : "#9ee7ff") : "#17172a");
        }
        rect(x + w / 2 - 1, top - 26, 2, 26, "#555"); circ(x + w / 2, top - 26, 2.5, !reduced && Math.sin(time * 4 + b.tx) > 0 ? "#ff2a6d" : "#5a1020");
        rect(x, bottom - 22, w, 22, "#0a0a14"); rect(x + w / 2 - 14, bottom - 22, 28, 22, "#00f0ff22");
        glow(col, 10); rect(x, bottom - 24, w, 2, col); noGlow();
        addLight(x + w / 2, bottom - 4, 80, col, 0.55);
        break;
      }
      case "club": {
        rect(x, y, w, hh, "#0c0c18"); rect(x - 6, y - 14, w + 12, 18, "#151528");
        rect(x, y, w, 3, "#ff2a6d");
        neonText("NÉON BLEU", x + w / 2, y - 18 + 6, "#00f0ff", 16, 3);
        rect(x + w / 2 - 14, bottom - 34, 28, 34, "#1a0a22"); rect(x + w / 2 - 12, bottom - 32, 24, 32, "#ff2a6d33");
        for (const bx of [x + 14, x + w - 34]) { rect(bx, bottom - 40, 20, 40, "#07070e"); circ(bx + 10, bottom - 28, 6, "#1d1d33"); circ(bx + 10, bottom - 12, 4, "#1d1d33"); }
        addLight(x + w / 2, bottom - 10, 90, "#ff2a6d", 0.65); addLight(x + w / 2, y - 6, 100, "#00f0ff", 0.55);
        break;
      }
      case "clinic": {
        rect(x, y, w, hh, "#d7e6df"); rect(x - 6, y - 14, w + 12, 18, "#b5cdc3");
        rect(x, y, w, 3, "#3ddc84");
        rect(x + w / 2 - 14, y - 40, 28, 28, "#0b1a14"); glow("#3ddc84", 12); rect(x + w / 2 - 3, y - 36, 6, 20, "#3ddc84"); rect(x + w / 2 - 10, y - 29, 20, 6, "#3ddc84"); noGlow();
        rect(x + 18, y + 22, 58, 40, "#10202a"); rect(x + 22, y + 26, 50, 32, "#2a6a5a"); rect(x + 30, y + 40, 34, 8, "#cfe3d6");
        rect(x + w - 66, y + 22, 50, 40, "#10202a"); neonText("RIPPER", x + w - 41, y + 40, "#3ddc84", 9, 1); neonText("DOC", x + w - 41, y + 54, "#3ddc84", 9, 2);
        rect(x + w / 2 - 12, bottom - 30, 24, 30, "#10202a"); rect(x + w / 2 - 10, bottom - 28, 20, 28, "#3ddc8433");
        addLight(x + w / 2, bottom - 14, 80, "#3ddc84", 0.6);
        break;
      }
      case "kiosk": {
        const col = b.v ? "#ff2a6d" : "#00f0ff";
        rect(x, y - 6, w, hh + 6, "#2a2f45"); for (let i = 0; i < w; i += 8) rect(x + i, y - 6, 3, hh + 6, "#232840");
        rect(x - 4, y - 18, w + 8, 14, "#1a1a2e"); for (let i = 0; i < 8; i++) rect(x - 4 + i * ((w + 8) / 8), y - 18, (w + 8) / 16, 14, col + "99");
        rect(x + 10, y + 4, w - 20, hh - 14, "#0a0a14"); glow(col, 8); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x + 10, y + 4, w - 20, hh - 14); noGlow();
        if (!reduced) { ctx.fillStyle = col; for (let i = 0; i < 3; i++) ctx.fillRect(x + 16, y + 10 + i * 6, 14 + ((Math.sin(time * 3 + i) + 1) * (w - 50)) / 2, 2); }
        addLight(x + w / 2, y + 10, 70, col, 0.55);
        break;
      }
      default: rect(x, y, w, hh, "#444");
    }
  }

  /* ---------- Éléments, arbres, personnages ---------- */

  function drawProp(p) {
    const x = p.tx * TILE + 16, y = p.ty * TILE + 30;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y, 13, 5, 0, 0, TAU); ctx.fill();
    switch (p.kind) {
      case "well":
        rect(x - 14, y - 16, 28, 16, "#8b8b9b"); rect(x - 10, y - 14, 20, 8, "#102a46");
        rect(x - 15, y - 36, 3, 22, "#5b3d24"); rect(x + 12, y - 36, 3, 22, "#5b3d24");
        poly([[x - 20, y - 34], [x, y - 48], [x + 20, y - 34]], "#a43a2c"); rect(x - 1, y - 34, 2, 12, "#c9b89a"); rect(x - 4, y - 24, 8, 6, "#6b4a2b");
        break;
      case "monument": {
        rect(x - 14, y - 10, 28, 10, "#22223a"); rect(x - 9, y - 18, 18, 8, "#2d2d4d");
        const ph = reduced ? 0 : time;
        glow("#00f0ff", 16); ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y - 40, 16, 6 + Math.sin(ph * 1.5) * 3, ph, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "#ff2a6d"; ctx.beginPath(); ctx.ellipse(x, y - 40, 6 + Math.cos(ph * 1.5) * 3, 16, ph * 0.8, 0, TAU); ctx.stroke();
        circ(x, y - 40, 5, "#ffffff"); noGlow();
        addLight(x, y - 40, 110, "#00f0ff", 0.8);
        break;
      }
      case "statue":
        rect(x - 14, y - 12, 28, 12, "#7b7b8a"); rect(x - 10, y - 18, 20, 7, "#8b8b9b");
        rect(x - 9, y - 44, 8, 26, "#b0b0c0"); circ(x - 5, y - 49, 5, "#c8c8d6"); poly([[x - 12, y - 40], [x - 18, y - 24], [x - 10, y - 26]], "#d33b4f");   // chevalier
        rect(x + 1, y - 44, 8, 26, "#2a2f45"); rect(x + 2, y - 54, 6, 6, "#4b5576"); rect(x + 3, y - 52, 4, 2, "#00f0ff"); rect(x + 8, y - 42, 4, 2, "#ff2a6d");   // droïde
        addLight(x + 5, y - 52, 40, "#00f0ff", 0.4);
        break;
      case "portal": {
        const cx = x, cy = y - 34, ph = reduced ? 0 : time;
        rect(cx - 36, cy - 8, 12, 46, "#5b5b6c"); rect(cx + 24, cy - 8, 12, 46, "#5b5b6c"); rect(cx - 38, cy - 34, 76, 14, "#6c6c7c");
        rect(cx - 30, cy - 28, 8, 14, "#4a4a58"); rect(cx + 22, cy - 28, 8, 14, "#4a4a58");
        ctx.fillStyle = "#07040f"; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 24, 30, 0, 0, TAU); ctx.fill();
        glow("#b58cff", 22);
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = i % 2 ? "#00f0ff" : "#ff2a6d"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85 - i * 0.13;
          ctx.beginPath(); ctx.ellipse(cx, cy + 6, 22 - i * 4, 28 - i * 5, 0, ph * (2 - i * 0.3) + i, ph * (2 - i * 0.3) + i + 4.3); ctx.stroke();
        }
        ctx.globalAlpha = 1; noGlow();
        addLight(cx, cy + 6, 150, "#b58cff", 1);
        break;
      }
      case "crate": rect(x - 11, y - 20, 22, 20, "#8a6a3b"); ctx.strokeStyle = "#5b3d24"; ctx.lineWidth = 2; ctx.strokeRect(x - 10, y - 19, 20, 18); ctx.beginPath(); ctx.moveTo(x - 10, y - 19); ctx.lineTo(x + 10, y - 1); ctx.stroke(); break;
      case "barrel": rect(x - 9, y - 22, 18, 22, "#7a5230"); rect(x - 9, y - 16, 18, 3, "#3a3a44"); rect(x - 9, y - 7, 18, 3, "#3a3a44"); break;
      case "anvil": rect(x - 10, y - 10, 20, 10, "#3a3a46"); rect(x - 14, y - 18, 28, 8, "#555566"); poly([[x + 14, y - 18], [x + 22, y - 14], [x + 14, y - 12]], "#555566"); circ(x - 4, y - 20, 2, "#ff8a3d"); break;
      case "pylon": {
        rect(x - 6, y - 56, 12, 56, "#161628"); rect(x - 6, y - 56, 12, 3, "#ff2a6d"); glow("#ff2a6d", 12); rect(x - 1, y - 50, 2, 44, "#ff2a6d"); noGlow();
        circ(x, y - 60, 4, !reduced && Math.sin(time * 3 + p.tx) > 0 ? "#00f0ff" : "#0a4a52"); addLight(x, y - 30, 80, "#ff2a6d", 0.55);
        break;
      }
      case "billboard": {
        const hue = reduced ? 300 : (time * 40 + p.tx * 20) % 360;
        rect(x - 3, y - 40, 6, 40, "#161628"); rect(x - 30, y - 78, 60, 38, "#0a0a14");
        glow(`hsl(${hue},100%,60%)`, 14); ctx.strokeStyle = `hsl(${hue},100%,60%)`; ctx.lineWidth = 2; ctx.strokeRect(x - 29, y - 77, 58, 36); noGlow();
        rect(x - 24, y - 72, 48, 26, `hsl(${hue},80%,18%)`);
        ctx.fillStyle = `hsl(${hue},100%,70%)`; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
        ctx.fillText(["NEURALINK", "ARASAKA", "CYBER-RAMEN", "NÉO-ASKA"][p.tx % 4], x, y - 56);
        rect(x - 18, y - 52, 36, 2, `hsl(${hue},100%,70%)`);
        addLight(x, y - 60, 90, `#ff2a6d`, 0.45);
        break;
      }
      case "vent": {
        rect(x - 10, y - 14, 20, 14, "#2a2f45"); rect(x - 8, y - 12, 16, 3, "#10101e"); rect(x - 8, y - 7, 16, 3, "#10101e");
        if (!reduced) for (let i = 0; i < 3; i++) { const ph = (time * 0.6 + i / 3) % 1; ctx.globalAlpha = 0.35 * (1 - ph); circ(x + Math.sin(ph * 6 + i) * 4, y - 16 - ph * 30, 3 + ph * 7, "#9ab"); }
        ctx.globalAlpha = 1;
        break;
      }
      default: break;
    }
  }

  function drawTree(t) {
    const x = t.x, y = t.y, s = 1 + t.v * 0.08;
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x, y, 13 * s, 5, 0, 0, TAU); ctx.fill();
    const sway = reduced ? 0 : Math.sin(time * 1.2 + t.tx * 0.7) * 1.5;
    switch (t.kind) {
      case "oak":
        rect(x - 4, y - 22, 8, 22, "#5b3d24");
        circ(x + sway * 0.5, y - 36 * s, 17 * s, "#2c6b34"); circ(x - 9 * s + sway, y - 28 * s, 11 * s, "#32793c"); circ(x + 10 * s + sway, y - 30 * s, 11 * s, "#245c2d"); circ(x + 2 + sway, y - 44 * s, 9 * s, "#3a8a45");
        break;
      case "pine":
        rect(x - 3, y - 14, 6, 14, "#4b3320");
        for (let i = 0; i < 3; i++) poly([[x - 17 * s + i * 3 + sway * (i + 1) * 0.3, y - 10 - i * 15], [x + sway * (i + 1) * 0.5, y - 36 * s - i * 15], [x + 17 * s - i * 3 + sway * (i + 1) * 0.3, y - 10 - i * 15]], i % 2 ? "#1f5a3a" : "#1a4d32");
        break;
      case "dead":
        ctx.strokeStyle = "#2c2c40"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 24); ctx.moveTo(x - 2, y - 18); ctx.lineTo(x - 12, y - 32); ctx.moveTo(x - 2, y - 24); ctx.lineTo(x + 11, y - 38); ctx.stroke();
        glow("#ff2a6d", 6); ctx.strokeStyle = "#ff2a6d"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 2, y - 24); ctx.lineTo(x + 11, y - 38); ctx.stroke(); noGlow();
        break;
      case "holotree": {
        rect(x - 3, y - 18, 6, 18, "#1d2a3a");
        const ph = reduced ? 0 : time * 2;
        ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 1.2; glow("#00f0ff", 8); ctx.globalAlpha = 0.75 + Math.sin(ph + t.tx) * 0.2;
        ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x - 15, y - 38); ctx.lineTo(x, y - 58); ctx.lineTo(x + 15, y - 38); ctx.closePath(); ctx.moveTo(x - 15, y - 38); ctx.lineTo(x + 15, y - 38); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 58); ctx.stroke();
        ctx.globalAlpha = 1; noGlow();
        break;
      }
      default: break;
    }
  }

  function drawPerson(x, y, look, dir, moving, seed, label) {
    const bob = moving ? Math.sin(time * 14 + seed) * 1.6 : Math.sin(time * 2 + seed) * 0.6;
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(x, y, 9, 3.5, 0, 0, TAU); ctx.fill();
    const step = moving ? Math.sin(time * 14 + seed) * 3 : 0;
    rect(x - 4 + step, y - 8, 3, 8, shade(look.body, -0.45)); rect(x + 1 - step, y - 8, 3, 8, shade(look.body, -0.45));
    const by = y - 21 + bob * 0.3;
    if (look.hat === "cape") poly([[x - 8 * -dir, by], [x - 12 * dir + 0, y - 4], [x - 4 * dir, y - 4]], look.accent);
    rect(x - 6, by, 12, 14, look.body);
    rect(x - 6, by + 10, 12, 3, look.accent);
    rect(x - 8, by + 1, 3, 9, shade(look.body, -0.2)); rect(x + 5, by + 1, 3, 9, shade(look.body, -0.2));
    const hy = by - 7 + bob * 0.2;
    if (look.hat === "antenna") {
      rect(x - 6, hy - 3, 12, 11, "#8e98b8"); rect(x - 4, hy + 1, 8, 4, "#07060c"); circ(x + dir * 2, hy + 3, 1.6, "#00f0ff");
      rect(x - 0.5, hy - 10, 1.5, 8, "#8e98b8"); circ(x, hy - 11, 2, !reduced && Math.sin(time * 5) > 0 ? "#ff2a6d" : "#5a1020");
    } else {
      circ(x, hy + 2, 6, look.skin);
      if (look.hat === "helm") { ctx.fillStyle = "#9aa0b4"; ctx.beginPath(); ctx.arc(x, hy + 1, 7, Math.PI, 0); ctx.fill(); rect(x - 7, hy + 1, 14, 2, "#7c8296"); rect(x - 1, hy - 8, 2, 5, "#d33b4f"); rect(x + dir * 1, hy + 2, 5 * dir, 1.5, "#2a2f45"); }
      else if (look.hat === "hood") { ctx.fillStyle = look.body; ctx.beginPath(); ctx.arc(x, hy + 1, 7.5, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); rect(x - 7.5, hy + 1, 3, 7, look.body); rect(x + 4.5, hy + 1, 3, 7, look.body); }
      else if (look.hat === "cap") { rect(x - 7, hy - 3, 14, 4, "#f3ead2"); rect(x - 5, hy - 6, 10, 4, "#f3ead2"); }
      else if (look.hat === "beard") { rect(x - 6, hy + 3, 12, 8, "#b5651d"); ctx.fillStyle = "#9aa0b4"; ctx.beginPath(); ctx.arc(x, hy, 6.5, Math.PI, 0); ctx.fill(); poly([[x - 7, hy], [x - 11, hy - 6], [x - 5, hy - 2]], "#e8e8f0"); poly([[x + 7, hy], [x + 11, hy - 6], [x + 5, hy - 2]], "#e8e8f0"); }
      else if (look.hat === "mohawk") { for (let i = -2; i <= 2; i++) poly([[x + i * 2 - 1, hy - 2], [x + i * 2, hy - 10 + Math.abs(i)], [x + i * 2 + 1, hy - 2]], "#ff2a6d"); rect(x - 5, hy + 1, 10, 2, "#07060c"); }
      else if (look.hat === "visor") { rect(x - 6, hy, 12, 3.5, "#07060c"); glow("#3ddc84", 6); rect(x - 5, hy + 0.8, 10, 1.6, "#3ddc84"); noGlow(); rect(x - 6, by, 12, 14, "#e8f1ee"); rect(x - 1, by, 2, 14, "#3ddc84"); }
      else { rect(x + dir * 1.5, hy + 1, 2, 2, "#07060c"); }
      if (look.hat !== "visor" && look.hat !== "mohawk") rect(x + dir * 2 - 1, hy + 1, 2, 2, "#07060c");
    }
    if (label) { ctx.font = "bold 10px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.55)"; const tw = ctx.measureText(label).width + 8; ctx.fillRect(x - tw / 2, y - 56, tw, 13); ctx.fillStyle = "#fff"; ctx.fillText(label, x, y - 46); }
  }

  function drawDecor(d) {
    if (d.kind === "lantern") {
      rect(d.x - 1.5, d.y - 30, 3, 30, "#3a2a1c"); rect(d.x - 5, d.y - 38, 10, 9, "#2a1d12"); rect(d.x - 3, d.y - 36, 6, 5, "#ffd27a");
      addLight(d.x, d.y - 32, 80, "#ffb347", 0.8);
    } else if (d.kind === "streetlight") {
      rect(d.x - 1.5, d.y - 46, 3, 46, "#222238"); rect(d.x - 1.5, d.y - 46, 12, 3, "#222238"); rect(d.x + 6, d.y - 44, 7, 3, d.x % 2 ? "#00f0ff" : "#ff2a6d");
      addLight(d.x + 9, d.y - 42, 90, d.x % 2 ? "#00f0ff" : "#ff7ad9", 0.75);
    }
  }
  function drawGroundDecor(d) {
    if (d.kind === "flowers") { const c = ["#ffd166", "#ff8fab", "#c9b3ff", "#ffffff"][d.c]; circ(d.x, d.y, 2, c); circ(d.x + 5, d.y + 3, 1.6, c); circ(d.x - 4, d.y + 2, 1.6, c); }
    else if (d.kind === "puddle") {
      const c = ["#00f0ff", "#ff2a6d", "#fcee0a"][d.c];
      ctx.fillStyle = "rgba(20,24,48,.9)"; ctx.beginPath(); ctx.ellipse(d.x, d.y, 11, 5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(d.x - 6, d.y); ctx.lineTo(d.x + 6, d.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  /* ---------- Scène ---------- */

  const NPC_LOOK = Object.fromEntries(NPCS.map((n) => [n.id, n]));
  const PLAYER_LOOK = { skin: "#e8c9a8", body: "#0e5a66", hat: "cape", accent: "#00f0ff" };
  let areaName = "", areaT = 0, minimap = null;

  function drawScene() {
    const p = hub.player;
    const maxX = WORLD_W - W, maxY = WORLD_H - H;
    const tx = clamp(p.x - W / 2, 0, maxX), ty = clamp(p.y - H / 2 - 20, 0, maxY);
    if (reduced) { cam.x = tx; cam.y = ty; } else { cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12; }
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.setTransform(dpr, 0, 0, dpr, -cx * dpr, -cy * dpr);
    lights.length = 0;
    const t0 = Math.floor(cx / TILE), t1 = Math.min(COLS - 1, Math.ceil((cx + W) / TILE)), r0 = Math.floor(cy / TILE), r1 = Math.min(ROWS - 1, Math.ceil((cy + H) / TILE));
    for (let ry = Math.max(0, r0); ry <= r1; ry++) for (let rx = Math.max(0, t0); rx <= t1; rx++) drawTile(rx, ry);
    const inView = (x, y, m = 100) => x > cx - m && x < cx + W + m && y > cy - m - 140 && y < cy + H + m + 60;
    for (const d of HUB.DECOR) if (inView(d.x, d.y, 20)) drawGroundDecor(d);

    const items = [];
    for (const b of HUB.BUILDINGS) { const by = (b.ty + b.th) * TILE; if (inView((b.tx + b.tw / 2) * TILE, by, b.tw * 16 + 60)) items.push([by, () => drawBuilding(b)]); }
    for (const t of HUB.TREES) if (inView(t.x, t.y, 40)) items.push([t.y, () => drawTree(t)]);
    for (const pr of HUB.PROPS) if (inView(pr.tx * TILE, pr.ty * TILE, 80)) items.push([pr.ty * TILE + 30, () => drawProp(pr)]);
    for (const d of HUB.DECOR) if ((d.kind === "lantern" || d.kind === "streetlight") && inView(d.x, d.y, 30)) items.push([d.y, () => drawDecor(d)]);
    for (const n of hub.npcs) {
      const def = NPC_LOOK[n.id];
      items.push([n.y, () => {
        drawPerson(n.x, n.y, def.look, n.dir, n.moving, n.x, hub.near?.id === n.id ? def.name : "");
        const m = HUB.npcMarker(wallet.data.dungeon.quests, n.id);
        if (m) { const by = n.y - 60 + Math.sin(time * 4 + n.x) * 3; ctx.font = "bold 18px monospace"; ctx.textAlign = "center"; glow(m === "!" ? "#fcee0a" : "#3ddc84", 10); ctx.fillStyle = m === "!" ? "#fcee0a" : "#3ddc84"; ctx.fillText(m, n.x, by); noGlow(); }
      }]);
    }
    items.push([p.y, () => drawPerson(p.x, p.y + 2, PLAYER_LOOK, p.facing, p.moving, 3, "")]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, fn] of items) fn();

    // Nuit : voile sombre puis lumières additives (lanternes, néons, fenêtres)
    const dl = HUB.daylight(hub.time), night = 1 - dl;
    if (night > 0.04) { ctx.fillStyle = `rgba(6,8,30,${(night * 0.62).toFixed(3)})`; ctx.fillRect(cx, cy, W, H); }
    ctx.globalCompositeOperation = "lighter";
    for (const [x, y, r, c, a] of lights) {
      if (x < cx - r || x > cx + W + r || y < cy - r || y > cy + H + r) continue;
      ctx.globalAlpha = Math.min(1, a * (0.18 + night * 0.9));
      ctx.drawImage(lightSprite(c), x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    if (!reduced) {
      // Pluie fine sur Néo-Aska, lucioles de Valoria la nuit
      if (p.x > MID * TILE - 120) { ctx.strokeStyle = "rgba(150,200,255,.22)"; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 50; i++) { const rx = cx + ((i * 97 + time * 60) % W), ry = cy + ((i * 61 + time * 380) % H); ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 9); } ctx.stroke(); }
      if (night > 0.3 && p.x < (MID + 4) * TILE) for (let i = 0; i < 18; i++) { const fx = cx + ((i * 131 + Math.sin(time * 0.6 + i) * 40 + 400) % W), fy = cy + ((i * 71 + Math.cos(time * 0.5 + i * 2) * 30 + 200) % H); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3 + i); circ(fx, fy, 1.8, "#d9ff7a"); ctx.globalAlpha = 1; }
    }

    // Interface (coordonnées écran)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud(p, dl);
  }

  function buildMinimap() {
    const c = document.createElement("canvas"), k = 2;
    c.width = COLS * k; c.height = ROWS * k;
    const g = c.getContext("2d");
    const COL = { grass: "#2a5a35", path: "#7a6644", cobble: "#777788", avenue: "#666676", sand: "#b5a474", water: "#1f5a8a", shore: "#3a86a8", asphalt: "#151522", metal: "#26263c", neon: "#1c1c40" };
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) { g.fillStyle = COL[groundAt(tx, ty)] || "#000"; g.fillRect(tx * k, ty * k, k, k); }
    for (const b of HUB.BUILDINGS) { g.fillStyle = b.tx < MID ? "#a9663a" : "#5a4ab0"; g.fillRect(b.tx * k, b.ty * k, b.tw * k, b.th * k); }
    for (const t of HUB.TREES) { g.fillStyle = t.tx < MID ? "#1b4a26" : "#123a4a"; g.fillRect(t.tx * k, t.ty * k, k, k); }
    return c;
  }

  function drawHud(p, dl) {
    // Nom de zone
    const name = areaAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    if (name !== areaName) { areaName = name; areaT = 3.2; }
    if (areaT > 0) {
      ctx.globalAlpha = Math.min(1, areaT); ctx.textAlign = "center";
      ctx.font = "bold 18px monospace"; ctx.fillStyle = "#000"; ctx.fillText(areaName, W / 2 + 1, 41);
      glow(areaName.startsWith("Néo") ? "#00f0ff" : areaName.startsWith("Val") ? "#fcee0a" : "#ff2a6d", 12);
      ctx.fillStyle = "#fff"; ctx.fillText(areaName, W / 2, 40); noGlow(); ctx.globalAlpha = 1;
    }
    // Heure
    const phase = ((hub.time % HUB.DAY_LENGTH) / HUB.DAY_LENGTH + 0.25) % 1, hh = Math.floor(phase * 24), mm = Math.floor((phase * 24 - hh) * 60 / 10) * 10;
    ctx.font = "bold 11px monospace"; ctx.textAlign = "left"; ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(10, 10, 74, 20);
    ctx.fillStyle = dl > 0.5 ? "#ffd166" : "#9ab4ff"; ctx.fillText(`${dl > 0.5 ? "☀" : "☾"} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, 16, 24);
    // Minimap
    if (!minimap) minimap = buildMinimap();
    const mw = COLS * 2, mh = ROWS * 2, mx = W - mw - 10, my = H - mh - 10;
    ctx.globalAlpha = 0.9; ctx.fillStyle = "#000"; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4); ctx.drawImage(minimap, mx, my);
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1; ctx.strokeRect(mx + (cam.x / TILE) * 2, my + (cam.y / TILE) * 2, (W / TILE) * 2, (H / TILE) * 2);
    for (const n of hub.npcs) { const m = HUB.npcMarker(wallet.data.dungeon.quests, n.id); circ(mx + (n.x / TILE) * 2, my + (n.y / TILE) * 2, m ? 2.6 : 1.8, m === "?" ? "#3ddc84" : m ? "#fcee0a" : "#cfd6ff"); }
    circ(mx + (PORTAL.x / TILE) * 2, my + (PORTAL.y / TILE) * 2, 2.6, "#b58cff");
    circ(mx + (p.x / TILE) * 2, my + (p.y / TILE) * 2, 2.6, "#ffffff");
    ctx.globalAlpha = 1;
    if (stick) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(stick.x0, stick.y0, 40, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(stick.x1, stick.y1, 14, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  /* ---------- Dialogue et quêtes ---------- */

  let openNpc = null, lineIdx = 0;
  const questsOf = () => wallet.data.dungeon.quests;

  function questCard(def) {
    const q = questsOf(), st = HUB.questState(q, def), p = q[def.id]?.p || 0;
    const pct = Math.min(100, (p / def.target) * 100);
    const act = st === "available" ? h("button", { class: "button button-secondary", type: "button", "data-quest": def.id, onclick: () => wallet.questAccept(def.id) }, "Accepter")
      : st === "ready" ? h("button", { class: "button button-primary", type: "button", "data-quest": def.id, onclick: () => wallet.questClaim(def.id) }, `Rendre · +${def.reward} 🔵`)
      : st === "claimed" ? h("span", { class: "hub-quest-done" }, "Terminée ✓")
      : st === "locked" ? h("span", { class: "hub-quest-lock" }, "Termine la quête précédente")
      : null;
    return h("div", { class: `hub-quest is-${st}` },
      h("div", { class: "hub-quest-head" }, h("strong", {}, def.name), h("em", {}, `+${def.reward} 🔵`)),
      h("p", {}, def.desc),
      st === "active" || st === "ready" ? h("div", { class: "hub-quest-bar", role: "img", "aria-label": `${p} sur ${def.target}` }, h("span", { style: `width:${pct}%` }), h("b", {}, `${fmt(p)} / ${fmt(def.target)}`)) : null,
      act);
  }

  let dialogKey = "";
  function renderDialog() {
    if (!openNpc) { dialog.hidden = true; return; }
    const def = HUB.npcById(openNpc);
    const quests = HUB.questsOf(openNpc);
    const key = JSON.stringify([openNpc, lineIdx, quests.map((d) => questsOf()[d.id])]);
    if (key === dialogKey && !dialog.hidden) return;
    dialogKey = key;
    dialog.hidden = false;
    dialog.style.setProperty("--kc", def.kingdom === "cyb" ? "var(--cyan)" : def.kingdom === "med" ? "var(--yellow)" : "var(--magenta, #ff2a6d)");
    dialog.replaceChildren(
      h("div", { class: "hub-dialog-head" },
        h("div", {}, h("strong", {}, def.name), h("span", {}, def.title)),
        h("button", { class: "button button-secondary", type: "button", id: "hub-close", onclick: closeDialog }, "Fermer")),
      h("p", { class: "hub-line" }, `« ${def.lines[lineIdx % def.lines.length]} »`),
      quests.length ? h("div", { class: "hub-quests" }, ...quests.map(questCard)) : h("p", { class: "hub-quest-lock" }, "Elle n'a pas de quête, mais ses conseils valent de l'or."));
  }
  function openDialog(id) { openNpc = id; lineIdx = Math.floor(Math.random() * 3); dialogKey = ""; renderDialog(); dialog.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); }
  function closeDialog() { openNpc = null; dialog.hidden = true; }

  function renderJournal() {
    const q = questsOf();
    const active = QUESTS.filter((d) => ["active", "ready"].includes(HUB.questState(q, d)));
    journal.replaceChildren(...(active.length
      ? active.map((d) => {
          const p = q[d.id].p;
          return h("div", { class: `hub-journal-item${p >= d.target ? " is-ready" : ""}` },
            h("strong", {}, d.name), h("span", {}, `${HUB.npcById(d.npc).name} · ${fmt(p)} / ${fmt(d.target)} · +${d.reward} 🔵`),
            h("div", { class: "hub-quest-bar" }, h("span", { style: `width:${Math.min(100, (p / d.target) * 100)}%` })));
        })
      : [h("p", { class: "hub-quest-lock" }, "Aucune quête active. Parle aux habitants de Valoria et de Néo-Aska.")]));
    const d = wallet.data.dungeon, s = d.stats;
    const rows = [["Expéditions", d.runs], ["Étage record", wallet.data.bestDungeon], ["Ennemis", s.kills], ["Boss", s.bosses], ["Élites", s.elite], ["Salles", s.rooms], ["Or ramassé", s.gold], ["Âmes", d.souls]];
    careerStats.replaceChildren(...rows.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, h("strong", {}, fmt(v))))));
  }

  /* ---------- Commandes ---------- */

  const keys = new Set();
  const KEYMAP = { arrowleft: "left", q: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", z: "up", w: "up", arrowdown: "down", s: "down" };
  let drag = null, stick = null, dragVec = { dx: 0, dy: 0 }, active = false;

  function interact() {
    const n = hub.near;
    if (!n) return;
    if (n.kind === "portal") { closeDialog(); onEnter(); return; }
    if (openNpc === n.id) lineIdx += 1;
    openDialog(n.id);
  }

  document.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button, input, select, textarea");
    if (key === "escape") { closeDialog(); return; }
    if ((key === "e" || key === "enter") && !onButton) { event.preventDefault(); interact(); return; }
    if (KEYMAP[key]) { event.preventDefault(); keys.add(KEYMAP[key]); }
  });
  document.addEventListener("keyup", (event) => { const k = KEYMAP[event.key.toLowerCase()]; if (k) keys.delete(k); });
  window.addEventListener("blur", () => keys.clear());

  const toCanvas = (event) => { const r = board.getBoundingClientRect(); return { x: ((event.clientX - r.left) / r.width) * W, y: ((event.clientY - r.top) / r.height) * H }; };
  board.addEventListener("pointerdown", (event) => {
    const c = toCanvas(event);
    drag = { x: event.clientX, y: event.clientY, moved: false };
    stick = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
    board.setPointerCapture?.(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const c = toCanvas(event), dx = event.clientX - drag.x, dy = event.clientY - drag.y, len = Math.hypot(dx, dy);
    if (len > 8) drag.moved = true;
    const k = Math.min(1, 40 / Math.max(1, Math.hypot(c.x - stick.x0, c.y - stick.y0)));
    stick.x1 = stick.x0 + (c.x - stick.x0) * k; stick.y1 = stick.y0 + (c.y - stick.y0) * k;
    dragVec = len < 8 ? { dx: 0, dy: 0 } : { dx: dx / Math.max(len, 40), dy: dy / Math.max(len, 40) };
  });
  const endDrag = (event) => {
    // Simple toucher sur un habitant proche : on lui parle.
    if (drag && !drag.moved && event.type === "pointerup") {
      const c = toCanvas(event), wx = c.x + cam.x, wy = c.y + cam.y;
      const hit = hub.npcs.find((n) => Math.hypot(n.x - wx, n.y - 16 - wy) < 30);
      if (hit && hub.near?.id === hit.id) interact();
      else if (Math.hypot(PORTAL.x - wx, PORTAL.y - 30 - wy) < 50 && hub.near?.kind === "portal") interact();
    }
    drag = null; stick = null; dragVec = { dx: 0, dy: 0 };
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  function readInput() {
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1; if (keys.has("right")) dx += 1; if (keys.has("up")) dy -= 1; if (keys.has("down")) dy += 1;
    if (!dx && !dy) { dx = dragVec.dx; dy = dragVec.dy; }
    return { dx, dy };
  }

  /* ---------- Boucle ---------- */

  let raf = 0, last = 0, acc = 0, promptKey = "";
  function syncPrompt() {
    const n = hub.near;
    const key = n ? `${n.kind}:${n.id}` : "";
    if (key === promptKey) return;
    promptKey = key;
    if (!n) { actionButton.hidden = true; if (openNpc) closeDialog(); return; }
    actionButton.hidden = false;
    actionButton.textContent = n.kind === "portal" ? "Entrer dans le donjon (E)" : `Parler à ${HUB.npcById(n.id).name} (E)`;
    if (openNpc && openNpc !== n.id) closeDialog();
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts; acc += dt;
    while (acc >= STEP) { HUB.updateHub(hub, STEP, openNpc ? { dx: 0, dy: 0 } : readInput()); time += STEP; areaT = Math.max(0, areaT - STEP); acc -= STEP; }
    drawScene();
    syncPrompt();
  }

  let lastSig = "";
  wallet.subscribe(() => {
    const sig = JSON.stringify([wallet.data.dungeon.quests, wallet.data.dungeon.stats, wallet.data.dungeon.runs, wallet.data.dungeon.souls, wallet.data.bestDungeon]);
    if (sig === lastSig) return;
    lastSig = sig;
    if (active) { renderJournal(); renderDialog(); }
  });

  root.hubState = () => hub;   // lecture seule : utile aux tests
  renderJournal();

  return {
    activate() {
      active = true;
      renderJournal();
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    deactivate() {
      active = false;
      cancelAnimationFrame(raf);
      keys.clear(); drag = null; stick = null; dragVec = { dx: 0, dy: 0 };
    }
  };
}
