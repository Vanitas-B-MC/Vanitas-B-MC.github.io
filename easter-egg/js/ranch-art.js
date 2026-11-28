// js/ranch-art.js — dessins de « Vallée Néon » (pixel-art tracé au canvas, sans fichier image).
// Toutes les fonctions reçoivent un contexte 2D déjà mis à l'échelle : 1 unité = 1 pixel du monde, une case = 16 unités.

import { TILE, G, cropById, itemInfo, FORAGE } from "./ranch.js";

const T = TILE;
export const hash = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
// Fond d'une case, légèrement débordant pour éviter les fines lignes entre les cases quand le zoom n'est pas entier.
const fillTile = (ctx, X, Y, c) => { ctx.fillStyle = c; ctx.fillRect(X, Y, T + 0.6, T + 0.6); };
function circle(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function ellipse(ctx, x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/* ---------- Sol ---------- */

const GRASS = [
  ["#5aa84a", "#4c9a3e", "#72c060"],   // printemps
  ["#469a38", "#3a8a30", "#5cb048"],   // été
  ["#b58e3c", "#9c7a32", "#cfa44e"],   // automne
  ["#e6eef4", "#d2dde8", "#ffffff"]    // hiver
];

export function drawGround(ctx, t, x, y, season, time, built) {
  const X = x * T, Y = y * T;
  const [base, dark, light] = GRASS[season];
  switch (t) {
    case G.GRASS: case G.PEN: {
      fillTile(ctx, X, Y, t === G.PEN && season !== 3 ? shade(base, 0.05) : base);
      const a = hash(x, y), b = hash(x, y, 1);
      px(ctx, X + Math.floor(a * 13), Y + Math.floor(b * 12), 1, 3, dark);
      px(ctx, X + Math.floor(b * 13) + 1, Y + Math.floor(a * 11) + 2, 1, 2, light);
      if (a > 0.82 && season < 3) px(ctx, X + 6, Y + 9, 2, 2, ["#ffe46a", "#ff9ad0", "#ff6a3a"][Math.floor(b * 3) % 3]);
      break;
    }
    case G.PATH:
      fillTile(ctx, X, Y, season === 3 ? "#d8d4cc" : "#c9a676");
      px(ctx, X + Math.floor(hash(x, y) * 12), Y + Math.floor(hash(x, y, 2) * 12), 3, 2, season === 3 ? "#bdb8ae" : "#ad8a5c");
      px(ctx, X + Math.floor(hash(x, y, 3) * 12), Y + Math.floor(hash(x, y, 4) * 12), 2, 2, "#e0c08e");
      break;
    case G.SAND:
      fillTile(ctx, X, Y, season === 3 ? "#e8e4dc" : "#e6d29c");
      px(ctx, X + Math.floor(hash(x, y) * 13), Y + Math.floor(hash(x, y, 2) * 13), 2, 1, "#c8b07a");
      break;
    case G.GRAVEL:
      fillTile(ctx, X, Y, "#8c8578");
      for (let k = 0; k < 4; k++) px(ctx, X + Math.floor(hash(x, y, k) * 14), Y + Math.floor(hash(x, y, k + 9) * 14), 2, 2, k % 2 ? "#a49d90" : "#6e685d");
      break;
    case G.WATER: {
      fillTile(ctx, X, Y, "#2a6cc0");
      const ph = (time / 700 + hash(x, y) * 6) % 6;
      px(ctx, X + 2 + Math.floor(ph * 2), Y + 4 + Math.floor(hash(x, y, 1) * 8), 4, 1, "#6aa8ff");
      px(ctx, X + 10 - Math.floor(ph), Y + 11, 3, 1, "#4a8ae8");
      if (season === 3) { ctx.globalAlpha = 0.45; px(ctx, X, Y, T, T, "#e8f4ff"); ctx.globalAlpha = 1; }
      break;
    }
    case G.WALL: {
      fillTile(ctx, X, Y, season === 3 ? "#5a6a6a" : "#1e4a2c");
      const c = season === 2 ? "#8a5a22" : season === 3 ? "#e8f0f4" : "#2a6a3a";
      circle(ctx, X + 4 + hash(x, y) * 8, Y + 5 + hash(x, y, 1) * 6, 6, c);
      circle(ctx, X + 10 - hash(x, y, 2) * 4, Y + 10, 5, season === 3 ? "#cfdbe2" : shade(c, -0.15));
      break;
    }
    case G.FENCE:
      drawGround(ctx, G.GRASS, x, y, season, time);
      px(ctx, X + 6, Y + 2, 4, 13, "#8a5a2a");
      px(ctx, X, Y + 5, T, 2, "#a8743a");
      px(ctx, X, Y + 10, T, 2, "#a8743a");
      px(ctx, X + 6, Y + 2, 4, 1, "#c8945a");
      break;
    case G.GH:
      fillTile(ctx, X, Y, built ? "#6a5848" : "#4e4440");
      px(ctx, X, Y, T, 1, built ? "#7a6858" : "#5a504a");
      px(ctx, X, Y, 1, T, built ? "#7a6858" : "#5a504a");
      if (!built && hash(x, y) > 0.5) { px(ctx, X + 4, Y + 6, 5, 3, "#7a7a7a"); px(ctx, X + 9, Y + 3, 3, 2, "#9fd8e8"); }
      break;
    case G.GHWALL: case G.GHDOOR: {
      fillTile(ctx, X, Y, built ? "#a8e4f0" : "#6a8a90");
      px(ctx, X, Y, T, 2, "#e8f8ff");
      px(ctx, X + 7, Y, 2, T, "#4a6a74");
      px(ctx, X, Y + 7, T, 2, "#4a6a74");
      if (!built) { ctx.strokeStyle = "#2a3a40"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 2, Y + 3); ctx.lineTo(X + 12, Y + 13); ctx.stroke(); }
      if (t === G.GHDOOR) {
        px(ctx, X + 2, Y, 12, T, built ? "#3a2a1a" : "#5a3a1a");
        if (!built) { px(ctx, X, Y + 4, T, 3, "#8a5a2a"); px(ctx, X, Y + 10, T, 3, "#8a5a2a"); }
        else px(ctx, X + 11, Y + 8, 2, 2, "#ffd23a");
      }
      break;
    }
    case G.BUILD:
      fillTile(ctx, X, Y, GRASS[season][0]);
      break;
    default:
      fillTile(ctx, X, Y, "#000");
  }
}

export function drawSoil(ctx, x, y, soil, season) {
  const X = x * T, Y = y * T;
  const wet = soil.w;
  px(ctx, X + 1, Y + 1, T - 2, T - 2, wet ? "#4a2e1a" : season === 3 ? "#8a7466" : "#8a5a32");
  px(ctx, X + 2, Y + 4, T - 4, 1, wet ? "#3a2212" : "#6e4626");
  px(ctx, X + 2, Y + 8, T - 4, 1, wet ? "#3a2212" : "#6e4626");
  px(ctx, X + 2, Y + 12, T - 4, 1, wet ? "#3a2212" : "#6e4626");
  if (soil.f) {
    const c = soil.f === "speed" ? "#3affb0" : soil.f === "q2" ? "#ffd23a" : "#d8b878";
    px(ctx, X + 3, Y + 2, 1, 1, c); px(ctx, X + 11, Y + 6, 1, 1, c); px(ctx, X + 6, Y + 10, 1, 1, c); px(ctx, X + 12, Y + 13, 1, 1, c);
  }
}

/* ---------- Cultures ---------- */

// (x, y) = coin haut-gauche de la case. stage 0 à 4 ; sway : petit balancement.
export function drawCrop(ctx, x, y, cropId, stage, dead, time) {
  const crop = cropById(cropId);
  const X = x * T, Y = y * T;
  const cx = X + 8, by = Y + 14;
  const sway = Math.sin(time / 600 + x * 1.7 + y) * 0.6;
  if (dead) {
    px(ctx, cx - 1, by - 7, 2, 7, "#7a5a30");
    px(ctx, cx - 4, by - 5, 3, 1, "#8a6a3a"); px(ctx, cx + 1, by - 6, 3, 1, "#8a6a3a");
    return;
  }
  const leaf = "#3fae4a", leafD = "#2a8a3a", leafL = "#7ad86a";
  if (stage === 0) { px(ctx, cx - 3, by - 3, 2, 2, "#d8c088"); px(ctx, cx + 1, by - 4, 2, 2, "#d8c088"); return; }
  if (stage === 1) {
    px(ctx, cx, by - 4, 1, 4, leafD);
    px(ctx, cx - 2 + sway, by - 6, 2, 2, leafL); px(ctx, cx + 1 + sway, by - 6, 2, 2, leaf);
    return;
  }
  const big = stage >= 3;
  const col = crop.color;
  switch (crop.shape) {
    case "root":
      ellipse(ctx, cx - 3 + sway, by - 7, 2.5, 4, leaf); ellipse(ctx, cx + 3 + sway, by - 7, 2.5, 4, leafD); ellipse(ctx, cx + sway, by - 9, 2, 5, leafL);
      if (stage >= 3) ellipse(ctx, cx, by - 1, stage === 4 ? 4 : 3, 2.5, col);
      if (stage === 4) px(ctx, cx - 2, by - 2, 2, 1, shade(col, 0.4));
      break;
    case "leafy":
      ellipse(ctx, cx - 4, by - 4, 4, 3, leafD); ellipse(ctx, cx + 4, by - 4, 4, 3, leafD); ellipse(ctx, cx + sway, by - 6, 4, big ? 5 : 3, leaf);
      if (stage === 4) { circle(ctx, cx, by - 6, 4.5, col); circle(ctx, cx - 1.5, by - 7.5, 1.5, shade(col, 0.4)); }
      break;
    case "bush":
      circle(ctx, cx + sway, by - 6, big ? 6 : 4, leafD); circle(ctx, cx - 2 + sway, by - 8, big ? 4 : 3, leaf);
      if (stage === 4) for (let k = 0; k < 5; k++) circle(ctx, cx - 4 + hash(x, y, k) * 8, by - 10 + hash(x, y, k + 5) * 8, 1.6, col);
      break;
    case "tall":
      px(ctx, cx - 1 + sway, by - (big ? 15 : 10), 2, big ? 15 : 10, leafD);
      ellipse(ctx, cx - 3 + sway, by - 7, 3, 1.5, leaf); ellipse(ctx, cx + 3 + sway, by - 10, 3, 1.5, leaf);
      if (stage === 4) { ellipse(ctx, cx + 2 + sway, by - 12, 2, 3.5, col); if (crop.id === "rhubarbe") px(ctx, cx - 3, by - 13, 6, 13, col); }
      break;
    case "vine":
      px(ctx, cx - 5, by - 16, 2, 16, "#9a6a3a"); px(ctx, cx + 4, by - 16, 2, 16, "#9a6a3a"); px(ctx, cx - 5, by - 14, 11, 1, "#b8844a");
      ellipse(ctx, cx + sway, by - (big ? 9 : 5), 5, big ? 7 : 4, leaf); ellipse(ctx, cx - 2 + sway, by - 11, 3, 3, leafL);
      if (stage === 4) for (let k = 0; k < 4; k++) circle(ctx, cx - 3 + (k % 2) * 6, by - 13 + Math.floor(k / 2) * 6, 2, col);
      break;
    case "gourd":
      ellipse(ctx, cx - 4, by - 4, 4, 2.5, leafD); ellipse(ctx, cx + 4, by - 5, 4, 2.5, leaf); px(ctx, cx - 6, by - 2, 12, 1, leafD);
      if (stage >= 3) ellipse(ctx, cx, by - 5, stage === 4 ? 6.5 : 3.5, stage === 4 ? 5 : 3, stage === 4 ? col : "#8ac05a");
      if (stage === 4) { px(ctx, cx - 1, by - 11, 2, 2, "#5a7a2a"); px(ctx, cx - 3, by - 7, 2, 1, shade(col, 0.35)); }
      break;
    case "flower":
      px(ctx, cx + sway, by - (big ? 12 : 8), 1, big ? 12 : 8, leafD);
      ellipse(ctx, cx - 2, by - 4, 2.5, 1.5, leaf); ellipse(ctx, cx + 3, by - 6, 2.5, 1.5, leaf);
      if (stage >= 3) {
        const r = stage === 4 ? (crop.id === "tournesol" ? 4.5 : 3.5) : 1.8;
        circle(ctx, cx + sway, by - 13, r, stage === 4 ? col : "#a0d070");
        if (stage === 4) circle(ctx, cx + sway, by - 13, r * 0.4, crop.id === "tournesol" ? "#6a3a1a" : "#fff6a0");
      }
      break;
    default:
      circle(ctx, cx, by - 6, 4, leaf);
  }
  if (cropId === "neonfleur" && stage === 4) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time / 200); circle(ctx, cx, by - 13, 7, col); ctx.globalAlpha = 1; }
}

/* ---------- Objets de la carte ---------- */

// Les arbres et objets hauts dépassent de leur case vers le haut : on les dessine dans l'ordre des y.
export function drawObject(ctx, x, y, o, season, time, extra = {}) {
  const X = x * T, Y = y * T;
  const cx = X + 8;
  switch (o.t) {
    case "tree": {
      ellipse(ctx, cx, Y + 14, 7, 2.5, "rgba(0,0,0,.25)");
      px(ctx, cx - 2, Y + 2, 4, 13, "#6a4220");
      px(ctx, cx - 2, Y + 2, 1, 13, "#8a5a2a");
      const sway = Math.sin(time / 900 + x) * 0.8;
      if (season === 3) {
        px(ctx, cx - 7, Y - 6, 14, 2, "#5a3a1a"); px(ctx, cx - 1, Y - 14, 2, 16, "#5a3a1a");
        circle(ctx, cx + sway, Y - 10, 8, "rgba(240,248,255,.85)");
      } else {
        const c = season === 2 ? ["#c85a1a", "#e88a2a", "#a8401a"] : season === 1 ? ["#2a8a3a", "#3aa84a", "#1e6a2a"] : ["#3a9a4a", "#5ac060", "#2a7a3a"];
        circle(ctx, cx + sway, Y - 6, 11, c[2]);
        circle(ctx, cx - 3 + sway, Y - 9, 8, c[0]);
        circle(ctx, cx + 4 + sway, Y - 6, 6, c[0]);
        circle(ctx, cx - 4 + sway, Y - 12, 4, c[1]);
        if (season === 0 && hash(x, y) > 0.6) { circle(ctx, cx + 3, Y - 12, 1.5, "#ffc0e0"); circle(ctx, cx - 6, Y - 4, 1.5, "#ffc0e0"); }
      }
      break;
    }
    case "stump":
      ellipse(ctx, cx, Y + 12, 6, 4, "#5a3818"); px(ctx, cx - 6, Y + 7, 12, 5, "#6a4220"); ellipse(ctx, cx, Y + 7, 6, 3, "#b8844a"); ellipse(ctx, cx, Y + 7, 3, 1.5, "#8a5a2a");
      break;
    case "branch":
      ctx.strokeStyle = "#7a4a22"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X + 3, Y + 12); ctx.lineTo(X + 13, Y + 8); ctx.moveTo(X + 8, Y + 10); ctx.lineTo(X + 9, Y + 5); ctx.stroke();
      break;
    case "stone":
      ellipse(ctx, cx, Y + 11, 5.5, 4, "#7a7e86"); ellipse(ctx, cx - 1, Y + 10, 4.5, 3, "#9aa0a8"); px(ctx, cx - 3, Y + 8, 2, 1, "#c8ccd2");
      break;
    case "boulder":
      ellipse(ctx, cx, Y + 13, 8, 3, "rgba(0,0,0,.25)"); ellipse(ctx, cx, Y + 8, 8, 7, "#6a6e76"); ellipse(ctx, cx - 1, Y + 6, 6, 5, "#8a9098"); px(ctx, cx - 4, Y + 3, 3, 2, "#b8bec6");
      break;
    case "ore_cu": case "ore_fe": case "ore_au": {
      const c = o.t === "ore_cu" ? "#e0864a" : o.t === "ore_fe" ? "#e4ecf4" : "#ffd23a";
      ellipse(ctx, cx, Y + 10, 7, 5, "#6a6460"); ellipse(ctx, cx - 1, Y + 9, 5.5, 4, "#857e78");
      px(ctx, cx - 4, Y + 8, 2, 2, c); px(ctx, cx + 1, Y + 10, 2, 2, c); px(ctx, cx + 2, Y + 6, 2, 1, c);
      if (o.t === "ore_au") { ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time / 250 + x); circle(ctx, cx, Y + 8, 6, c); ctx.globalAlpha = 1; }
      break;
    }
    case "weed": {
      const c = season === 2 ? "#9a8a2a" : season === 3 ? "#8aa0a0" : "#2f8a3a";
      px(ctx, X + 4, Y + 7, 2, 8, c); px(ctx, X + 7, Y + 5, 2, 10, shade(c, 0.2)); px(ctx, X + 10, Y + 8, 2, 7, c);
      px(ctx, X + 3, Y + 7, 1, 2, c); px(ctx, X + 11, Y + 8, 1, 2, c);
      break;
    }
    case "grass": {
      const sway = Math.sin(time / 500 + x * 2 + y) * 1.2;
      const c = season === 2 ? "#c09a3a" : "#4aa83a";
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = 0; k < 5; k++) { const bx = X + 3 + k * 2.5; ctx.moveTo(bx, Y + 15); ctx.lineTo(bx + sway + (k - 2) * 0.6, Y + 4 + (k % 2) * 3); }
      ctx.stroke();
      break;
    }
    case "forage": {
      const f = FORAGE.find((k) => k.id === o.item);
      const bob = Math.sin(time / 300 + x) * 0.8;
      ellipse(ctx, cx, Y + 13, 4, 1.5, "rgba(0,0,0,.25)");
      circle(ctx, cx, Y + 8 + bob, 3.5, f?.color ?? "#fff");
      px(ctx, cx - 1, Y + 3 + bob, 2, 3, "#3a8a3a");
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time / 180 + y); px(ctx, cx + 4, Y + 3 + bob, 1, 1, "#fff"); ctx.globalAlpha = 1;
      break;
    }
    case "scarecrow":
      px(ctx, cx - 1, Y - 4, 2, 18, "#7a4a22"); px(ctx, cx - 7, Y + 1, 14, 2, "#7a4a22");
      circle(ctx, cx, Y - 5, 4, "#e8d098"); px(ctx, cx - 6, Y - 10, 12, 2, "#5a3a8a"); px(ctx, cx - 3, Y - 14, 6, 4, "#5a3a8a");
      px(ctx, cx - 4, Y + 2, 8, 7, "#3a8ac8"); px(ctx, cx - 2, Y - 6, 1, 1, "#000"); px(ctx, cx + 1, Y - 6, 1, 1, "#000");
      break;
    case "sprinkler1": case "sprinkler2": case "sprinkler3": {
      const c = o.t === "sprinkler1" ? "#c8d0dc" : o.t === "sprinkler2" ? "#ffd23a" : "#ff2bd6";
      ellipse(ctx, cx, Y + 11, 4.5, 3, "#5a6068"); px(ctx, cx - 1, Y + 4, 2, 7, c); circle(ctx, cx, Y + 4, 2.5, c);
      if (extra.morning) { ctx.globalAlpha = 0.5; circle(ctx, cx, Y + 6, 7 + Math.sin(time / 120) * 1.5, "#8ac8ff"); ctx.globalAlpha = 1; }
      break;
    }
    case "jar":
      ellipse(ctx, cx, Y + 14, 5, 1.5, "rgba(0,0,0,.25)");
      px(ctx, cx - 5, Y + 2, 10, 12, "rgba(190,230,255,.75)"); px(ctx, cx - 5, Y + 1, 10, 2, "#c8a060");
      if (o.item) px(ctx, cx - 4, Y + 6, 8, 7, itemInfo(o.item)?.color ?? "#f80");
      break;
    case "keg":
      ellipse(ctx, cx, Y + 14, 6, 2, "rgba(0,0,0,.25)");
      px(ctx, cx - 6, Y, 12, 14, "#8a5a2a"); px(ctx, cx - 6, Y + 3, 12, 1, "#4a4a4a"); px(ctx, cx - 6, Y + 10, 12, 1, "#4a4a4a"); px(ctx, cx - 1, Y + 6, 2, 2, "#3a2a1a");
      break;
    case "press":
      px(ctx, cx - 6, Y + 4, 12, 10, "#a8743a"); px(ctx, cx - 1, Y - 3, 2, 8, "#5a5a6a"); px(ctx, cx - 5, Y - 3, 10, 2, "#5a5a6a"); px(ctx, cx - 6, Y + 4, 12, 2, "#c8944a");
      break;
    case "loom":
      px(ctx, cx - 7, Y, 2, 14, "#8a5a2a"); px(ctx, cx + 5, Y, 2, 14, "#8a5a2a"); px(ctx, cx - 7, Y + 1, 14, 2, "#a8743a"); px(ctx, cx - 5, Y + 5, 10, 6, o.item ? "#c8c0ff" : "#e8e0d0");
      break;
    default:
      break;
  }
  if (MACHINE_READY(o)) {
    const bob = Math.sin(time / 250) * 1.5;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(cx, Y - 8 + bob, 5.5, 0, Math.PI * 2); ctx.fill();
    circle(ctx, cx, Y - 8 + bob, 3.5, itemInfo(o.item)?.color ?? "#fc0");
  }
}
const MACHINE_READY = (o) => o.item && o.left <= 0 && ["jar", "keg", "press", "loom"].includes(o.t);

/* ---------- Bâtiments ---------- */

export function drawBuilding(ctx, b, state, season, time, night) {
  const X = b.x * T, Y = b.y * T, W = b.w * T, H = b.h * T;
  const snowRoof = season === 3;
  ellipse(ctx, X + W / 2, Y + H - 1, W / 2 + 2, 4, "rgba(0,0,0,.25)");
  switch (b.id) {
    case "house": {
      px(ctx, X + 4, Y + 26, W - 8, H - 26, "#e8d6b0");
      for (let k = 0; k < 4; k++) px(ctx, X + 4, Y + 30 + k * 8, W - 8, 1, "#d0bc94");
      ctx.fillStyle = snowRoof ? "#f2f6fa" : "#7a2a5a";
      ctx.beginPath(); ctx.moveTo(X - 2, Y + 30); ctx.lineTo(X + W / 2, Y - 4); ctx.lineTo(X + W + 2, Y + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = snowRoof ? "#cdd8e2" : "#5a1a42";
      ctx.beginPath(); ctx.moveTo(X + 6, Y + 30); ctx.lineTo(X + W / 2, Y + 4); ctx.lineTo(X + W - 6, Y + 30); ctx.closePath(); ctx.fill();
      px(ctx, X + W - 22, Y, 8, 14, "#8a7a6a");
      if (!snowRoof) { ctx.globalAlpha = 0.35; circle(ctx, X + W - 18 + Math.sin(time / 500) * 2, Y - 6 - (time / 60 % 10), 3, "#ccc"); ctx.globalAlpha = 1; }
      px(ctx, X + 34, Y + 40, 12, 24, "#6a3a1a"); px(ctx, X + 43, Y + 52, 2, 2, "#ffd23a");
      const win = night ? "#ffd86a" : "#9fd8f0";
      px(ctx, X + 10, Y + 40, 14, 12, "#5a3a2a"); px(ctx, X + 12, Y + 42, 10, 8, win);
      px(ctx, X + 62, Y + 40, 14, 12, "#5a3a2a"); px(ctx, X + 64, Y + 42, 10, 8, win);
      if (night) { ctx.globalAlpha = 0.18; circle(ctx, X + 17, Y + 58, 14, "#ffd86a"); circle(ctx, X + 69, Y + 58, 14, "#ffd86a"); ctx.globalAlpha = 1; }
      px(ctx, X + 8, Y + 36, W - 16, 2, "#00f0ff");
      break;
    }
    case "well":
      ellipse(ctx, X + 8, Y + 11, 8, 5, "#7a7e86"); ellipse(ctx, X + 8, Y + 10, 5.5, 3, "#1a3a6a");
      px(ctx, X + 1, Y - 10, 2, 20, "#6a4220"); px(ctx, X + 13, Y - 10, 2, 20, "#6a4220");
      ctx.fillStyle = snowRoof ? "#eef" : "#8a3a2a"; ctx.beginPath(); ctx.moveTo(X - 3, Y - 8); ctx.lineTo(X + 8, Y - 16); ctx.lineTo(X + 19, Y - 8); ctx.closePath(); ctx.fill();
      break;
    case "bin":
      px(ctx, X + 1, Y + 2, W - 2, H - 2, "#8a5a2a"); px(ctx, X, Y - 2, W, 5, "#a8743a");
      px(ctx, X + 6, Y + 6, W - 12, 2, "#5a3a1a"); px(ctx, X + W / 2 - 2, Y - 1, 4, 2, "#ffd23a");
      if (state.binCount) { ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time / 300); circle(ctx, X + W - 3, Y - 4, 3, "#3dff8f"); ctx.globalAlpha = 1; }
      break;
    case "board":
      px(ctx, X + 4, Y + 10, 3, 22, "#6a4220"); px(ctx, X + W - 7, Y + 10, 3, 22, "#6a4220");
      px(ctx, X, Y, W, 20, "#8a5a2a"); px(ctx, X + 2, Y + 2, W - 4, 16, "#a8743a");
      px(ctx, X + 5, Y + 4, 8, 9, "#f4ecd8"); px(ctx, X + 16, Y + 5, 9, 8, "#f4ecd8");
      if (state.requestOpen) {
        const bob = Math.sin(time / 250) * 1.5;
        px(ctx, X + W / 2 - 1, Y - 12 + bob, 3, 7, "#fcee0a"); px(ctx, X + W / 2 - 1, Y - 3 + bob, 3, 2, "#fcee0a");
      }
      break;
    case "shop": {
      px(ctx, X + 2, Y + 18, W - 4, H - 18, "#5a4a6a");
      px(ctx, X + 4, Y + 30, W - 8, 10, "#a8743a"); px(ctx, X + 4, Y + 30, W - 8, 2, "#c8944a");
      for (let k = 0; k < 10; k++) px(ctx, X + k * 8, Y + 4, 8, 14, k % 2 ? "#ff2bd6" : "#00f0ff");
      ctx.fillStyle = snowRoof ? "#f4f8fc" : "#2a1a3a"; ctx.fillRect(X - 2, Y, W + 4, 5);
      for (let k = 0; k < 10; k++) { ctx.fillStyle = k % 2 ? "#ff2bd6" : "#00f0ff"; ctx.beginPath(); ctx.arc(X + k * 8 + 4, Y + 18, 4, 0, Math.PI); ctx.fill(); }
      circle(ctx, X + 20, Y + 27, 3, "#ff6a3a"); circle(ctx, X + 28, Y + 28, 3, "#ffd23a"); circle(ctx, X + 52, Y + 27, 3, "#7ad86a");
      // Robin, le vendeur
      circle(ctx, X + 40, Y + 22, 4, "#f0c8a0"); px(ctx, X + 36, Y + 26, 8, 5, "#3a8ac8"); px(ctx, X + 36, Y + 17, 8, 3, "#ff7a1a");
      if (!state.shopOpen) { ctx.globalAlpha = 0.6; px(ctx, X + 2, Y + 18, W - 4, H - 18, "#000"); ctx.globalAlpha = 1; }
      break;
    }
    case "coop": case "barn": {
      if (!state.built) {
        px(ctx, X, Y + 8, W, H - 8, "#8a7a6a"); px(ctx, X + 2, Y + 10, W - 4, H - 12, "#9a8a78");
        for (let k = 0; k < b.w; k++) px(ctx, X + k * T + 2, Y + 14, 10, 2, "#7a6a5a");
        px(ctx, X + W / 2 - 1, Y - 8, 2, 18, "#6a4220"); px(ctx, X + W / 2 - 12, Y - 10, 24, 10, "#e8d6a0");
        px(ctx, X + W / 2 - 9, Y - 7, 18, 1, "#6a4a2a"); px(ctx, X + W / 2 - 7, Y - 4, 14, 1, "#6a4a2a");
        break;
      }
      const wall = b.id === "barn" ? "#b8342a" : "#d8a050";
      px(ctx, X + 2, Y + 16, W - 4, H - 16, wall);
      for (let k = 0; k < b.w * 2; k++) px(ctx, X + 2 + k * 8, Y + 16, 1, H - 16, shade(wall, -0.2));
      ctx.fillStyle = snowRoof ? "#f2f6fa" : "#4a3a3a";
      ctx.beginPath(); ctx.moveTo(X - 3, Y + 18); ctx.lineTo(X + W / 2, Y - 6); ctx.lineTo(X + W + 3, Y + 18); ctx.closePath(); ctx.fill();
      const dw = b.id === "barn" ? 28 : 16;
      px(ctx, X + W / 2 - dw / 2, Y + H - 22, dw, 22, "#5a2a1a");
      ctx.strokeStyle = "#f4e8d8"; ctx.lineWidth = 1.5; ctx.strokeRect(X + W / 2 - dw / 2 + 1, Y + H - 21, dw - 2, 20);
      ctx.beginPath(); ctx.moveTo(X + W / 2 - dw / 2 + 1, Y + H - 21); ctx.lineTo(X + W / 2 + dw / 2 - 1, Y + H - 1); ctx.stroke();
      px(ctx, X + 8, Y + 22, 10, 8, night ? "#ffd86a" : "#3a2a2a");
      if (b.id === "barn") {   // silo
        px(ctx, X + W - 6, Y - 10, 12, H + 10, "#9aa0a8"); ellipse(ctx, X + W, Y - 10, 6, 4, snowRoof ? "#eef" : "#6a7078");
      }
      break;
    }
    default:
      break;
  }
}

/* ---------- Personnage et animaux ---------- */

export function drawFarmer(ctx, wx, wy, face, walk, swing, tool) {
  const x = Math.round(wx), y = Math.round(wy);   // (x, y) = pieds
  const step = walk ? Math.round(Math.sin(walk) * 1.5) : 0;
  ellipse(ctx, x, y, 5, 2, "rgba(0,0,0,.3)");
  px(ctx, x - 3, y - 5 + Math.max(0, step), 2, 5 - Math.max(0, step), "#2a2a4a");
  px(ctx, x + 1, y - 5 + Math.max(0, -step), 2, 5 - Math.max(0, -step), "#2a2a4a");
  px(ctx, x - 4, y - 12, 8, 7, "#00b8d8");
  px(ctx, x - 4, y - 12, 8, 1, "#00f0ff");
  px(ctx, x - 5, y - 11, 1, 5, "#f0c8a0"); px(ctx, x + 4, y - 11, 1, 5, "#f0c8a0");
  px(ctx, x - 4, y - 19, 8, 7, "#f0c8a0");
  px(ctx, x - 4, y - 20, 8, 3, "#5a2a1a");
  if (face === 0) px(ctx, x - 4, y - 19, 8, 5, "#5a2a1a");
  else if (face === 2) { px(ctx, x - 2, y - 16, 1, 1, "#000"); px(ctx, x + 1, y - 16, 1, 1, "#000"); }
  else if (face === 1) { px(ctx, x + 1, y - 16, 1, 1, "#000"); px(ctx, x - 4, y - 19, 3, 4, "#5a2a1a"); }
  else { px(ctx, x - 2, y - 16, 1, 1, "#000"); px(ctx, x + 1, y - 19, 3, 4, "#5a2a1a"); }
  px(ctx, x - 5, y - 21, 10, 2, "#e8c050"); px(ctx, x - 3, y - 23, 6, 2, "#e8c050");   // chapeau de paille
  if (swing > 0 && tool) {
    const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][face] + (swing - 0.5) * 1.6 * (face === 3 ? -1 : 1);
    const hx = x + Math.cos(ang) * 9, hy = y - 9 + Math.sin(ang) * 9;
    ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(hx, hy); ctx.stroke();
    circle(ctx, hx, hy, 2.5, tool);
  }
}

export function drawAnimal(ctx, kind, wx, wy, flip, t, ready) {
  const x = Math.round(wx), y = Math.round(wy);
  const bob = Math.round(Math.sin(t / 200) * 0.6);
  const f = flip ? -1 : 1;
  ellipse(ctx, x, y, kind === "poule" || kind === "canard" ? 4 : 8, 2, "rgba(0,0,0,.25)");
  if (kind === "poule" || kind === "canard") {
    const body = kind === "poule" ? "#f4f0e8" : "#e8e0a0";
    ellipse(ctx, x, y - 4 + bob, 4.5, 3.5, body);
    circle(ctx, x + 3 * f, y - 8 + bob, 2.5, body);
    px(ctx, x + 5 * f - (f < 0 ? 2 : 0), y - 8 + bob, 2, 1, "#ff9a2a");
    if (kind === "poule") px(ctx, x + 2 * f, y - 11 + bob, 2, 2, "#e8342a");
    px(ctx, x + 3 * f, y - 9 + bob, 1, 1, "#000");
  } else {
    const body = { vache: "#f4f4f4", chevre: "#d8c8b0", mouton: "#fafafa" }[kind];
    px(ctx, x - 7, y - 3, 2, 3, "#5a4a3a"); px(ctx, x + 5, y - 3, 2, 3, "#5a4a3a");
    ellipse(ctx, x, y - 6 + bob, 8, 5, body);
    if (kind === "vache") { circle(ctx, x - 2, y - 7 + bob, 2.5, "#3a2a2a"); circle(ctx, x + 3, y - 5 + bob, 2, "#3a2a2a"); }
    if (kind === "mouton") for (let k = 0; k < 4; k++) circle(ctx, x - 5 + k * 3.5, y - 9 + bob, 3, "#ffffff");
    circle(ctx, x + 8 * f, y - 9 + bob, 3.5, kind === "mouton" ? "#3a3a3a" : body);
    px(ctx, x + 9 * f, y - 10 + bob, 1, 1, kind === "mouton" ? "#fff" : "#000");
    if (kind === "chevre") { px(ctx, x + 7 * f, y - 14 + bob, 1, 3, "#8a7a6a"); px(ctx, x + 9 * f, y - 14 + bob, 1, 3, "#8a7a6a"); }
  }
  if (ready) {
    const b = Math.sin(t / 250) * 1.5;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(x, y - 20 + b, 4, 0, Math.PI * 2); ctx.fill();
    circle(ctx, x, y - 20 + b, 2.2, "#ff5a8a");
  }
}

/* ---------- Icônes d'objets (sac, barre rapide) ---------- */

const TIER_COLORS = ["#9aa0a8", "#e0864a", "#e4ecf4", "#ffd23a"];

// Dessine l'icône de l'objet `id` dans un carré de 16 × 16 (le contexte est déjà à l'échelle).
export function drawIcon(ctx, id, tier = 0) {
  const info = itemInfo(id);
  if (!info) return;
  const c = info.color ?? "#ccc";
  const metal = TIER_COLORS[tier] ?? TIER_COLORS[0];
  const handle = "#8a5a2a";
  const line = (x0, y0, x1, y1, col, w = 2) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  switch (id) {
    case "hoe": line(3, 14, 12, 4, handle); px(ctx, 10, 2, 5, 3, metal); break;
    case "axe": line(4, 14, 11, 3, handle); ellipse(ctx, 12, 5, 3, 4, metal); break;
    case "pick": line(8, 15, 8, 4, handle); ctx.strokeStyle = metal; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(8, 9, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
    case "scythe": line(4, 15, 9, 2, handle); ctx.strokeStyle = "#d0d8e0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(14, 6, 6, Math.PI * 0.6, Math.PI * 1.25); ctx.stroke(); break;
    case "can": px(ctx, 3, 6, 9, 8, metal); px(ctx, 11, 7, 4, 2, metal); px(ctx, 14, 5, 2, 2, metal); ctx.strokeStyle = shade(metal, -0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(7, 6, 3, Math.PI, 0); ctx.stroke(); break;
    case "bois": px(ctx, 2, 6, 12, 6, "#8a5a2a"); ellipse(ctx, 13, 9, 2, 3, "#c8944a"); px(ctx, 2, 7, 10, 1, "#6a4220"); break;
    case "pierre": ellipse(ctx, 8, 10, 6, 4.5, "#8a9098"); ellipse(ctx, 7, 9, 4, 3, "#aab0b8"); break;
    case "fibre": for (let k = 0; k < 4; k++) line(4 + k * 2.5, 15, 6 + k * 2, 3, "#5ab84a", 1.5); break;
    case "cuivre": case "fer": case "or": ellipse(ctx, 8, 10, 6, 4.5, "#6a6460"); px(ctx, 4, 8, 3, 3, c); px(ctx, 9, 10, 3, 3, c); px(ctx, 8, 6, 2, 2, c); break;
    case "oeuf": case "oeufcanard": ellipse(ctx, 8, 9, 4.5, 6, c); px(ctx, 6, 5, 2, 2, "#fff"); break;
    case "lait": case "laitchevre": px(ctx, 5, 5, 6, 10, "#f8f8ff"); px(ctx, 6, 2, 4, 3, "#e0e4f0"); px(ctx, 5, 9, 6, 3, id === "lait" ? "#3a8ac8" : "#c87a3a"); break;
    case "laine": for (let k = 0; k < 5; k++) circle(ctx, 4 + (k % 3) * 4, 7 + Math.floor(k / 3) * 4, 3.5, k % 2 ? "#fff" : "#eee"); break;
    case "tissu": px(ctx, 2, 4, 12, 9, c); px(ctx, 2, 6, 12, 1, "#a8a0e0"); px(ctx, 2, 10, 12, 1, "#a8a0e0"); break;
    case "fromage": case "chevrotin": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(2, 13); ctx.lineTo(14, 13); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill(); circle(ctx, 11, 10, 1, "#e0b030"); break;
    case "mayo": case "mayocanard": px(ctx, 4, 4, 8, 11, "rgba(220,240,255,.9)"); px(ctx, 5, 7, 6, 7, c); px(ctx, 4, 3, 8, 2, "#3a8ac8"); break;
    case "engrais": case "engraisplus": case "accel": px(ctx, 3, 4, 10, 11, "#c8a878"); px(ctx, 3, 4, 10, 2, "#8a6a4a"); circle(ctx, 8, 10, 3, c); break;
    case "epouvantail": px(ctx, 7, 4, 2, 12, handle); px(ctx, 3, 8, 10, 2, handle); circle(ctx, 8, 4, 3, "#e8d098"); px(ctx, 4, 1, 8, 2, "#5a3a8a"); break;
    case "arroseur": case "arroseur2": case "arroseur3": {
      const k = id === "arroseur" ? "#c8d0dc" : id === "arroseur2" ? "#ffd23a" : "#ff2bd6";
      ellipse(ctx, 8, 13, 5, 2.5, "#5a6068"); px(ctx, 7, 5, 2, 8, k); circle(ctx, 8, 5, 3, k); break;
    }
    case "bocal": px(ctx, 3, 3, 10, 12, "rgba(190,230,255,.85)"); px(ctx, 3, 2, 10, 2, "#c8a060"); break;
    case "fut": px(ctx, 3, 2, 10, 13, "#8a5a2a"); px(ctx, 3, 5, 10, 1, "#444"); px(ctx, 3, 11, 10, 1, "#444"); break;
    case "presse": px(ctx, 3, 7, 10, 8, "#a8743a"); px(ctx, 7, 1, 2, 7, "#5a5a6a"); px(ctx, 4, 1, 8, 2, "#5a5a6a"); break;
    case "metier": px(ctx, 2, 2, 2, 13, handle); px(ctx, 12, 2, 2, 13, handle); px(ctx, 4, 5, 8, 6, "#e8e0d0"); break;
    default:
      if (info.cat === "seed") {
        px(ctx, 3, 2, 10, 13, "#e8d8b0"); px(ctx, 3, 2, 10, 3, "#a8844a");
        circle(ctx, 8, 10, 3.2, c);
        px(ctx, 7, 5, 2, 2, "#3a8a3a");
      } else if (info.cat === "artisan") {
        const wine = id.startsWith("wine:");
        if (wine) { px(ctx, 6, 1, 4, 4, "#2a4a2a"); px(ctx, 4, 5, 8, 10, "#2a4a2a"); px(ctx, 5, 8, 6, 5, c); }
        else { px(ctx, 3, 4, 10, 11, "rgba(220,240,255,.9)"); px(ctx, 4, 7, 8, 7, c); px(ctx, 3, 3, 10, 2, "#c8a060"); }
      } else if (info.cat === "forage") {
        circle(ctx, 8, 9, 5, c); px(ctx, 7, 2, 2, 4, "#3a8a3a"); px(ctx, 5, 6, 2, 2, shade(c, 0.4));
      } else {
        const crop = cropById(info.crop);
        if (crop?.shape === "root") { ellipse(ctx, 8, 10, 4.5, 5, c); px(ctx, 5, 1, 2, 5, "#3fae4a"); px(ctx, 9, 1, 2, 5, "#2a8a3a"); }
        else if (crop?.shape === "flower") { px(ctx, 7, 8, 2, 8, "#2a8a3a"); circle(ctx, 8, 6, 5, c); circle(ctx, 8, 6, 2, "#fff6a0"); }
        else if (crop?.shape === "gourd") { ellipse(ctx, 8, 10, 7, 5.5, c); px(ctx, 7, 3, 2, 3, "#5a7a2a"); }
        else if (crop?.shape === "bush") { circle(ctx, 6, 10, 3.5, c); circle(ctx, 10, 9, 3.5, c); circle(ctx, 8, 5, 3, c); px(ctx, 7, 1, 2, 2, "#3a8a3a"); }
        else if (crop?.shape === "tall") { ellipse(ctx, 8, 9, 3.5, 6.5, c); ellipse(ctx, 5, 10, 2, 5, "#3fae4a"); }
        else { circle(ctx, 8, 9, 5.5, c); px(ctx, 7, 2, 2, 3, "#3a8a3a"); px(ctx, 5, 6, 2, 2, shade(c, 0.4)); }
      }
  }
}
