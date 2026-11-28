// js/ranch-art.js — graphismes de « Vallée Néon » (tout est dessiné au canvas, sans fichier image).
//
// Deux idées pour que ce soit joli sans ralentir :
//  1. Le sol (herbe, chemins, étang, carrière, lisière de forêt, clôtures) est peint une seule fois par saison dans un
//     grand canvas caché, avec des bords arrondis, des nuances et des milliers de brins d'herbe. Ensuite on n'en copie
//     que la partie visible à chaque image.
//  2. Chaque objet (arbre, culture, bâtiment, animal, fermier…) est dessiné une fois dans un petit canvas, avec un
//     contour sombre façon pixel-art soigné, puis réutilisé. Seules les ombres, les balancements et les effets bougent.
// Unité : 1 = un pixel du monde, une case = 16.

import { TILE, MAP_W, MAP_H, G, GROUND, BUILDINGS, GREENHOUSE, POND, cropById, itemInfo, FORAGE, idx, groundAt } from "./ranch.js";

const T = TILE;
const SPR_SCALE = 4;                 // résolution des sprites (pixels par unité du monde)
const OUTLINE = "rgba(28,18,34,.92)";

/* ================= Outils ================= */

export const hash = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function shade(c, f) {
  const [r, g, b] = hex(c);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
}
function smoothNoise(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, k), b = hash(xi + 1, yi, k), c = hash(xi, yi + 1, k), d = hash(xi + 1, yi + 1, k);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const fbm = (x, y, k) => smoothNoise(x, y, k) * 0.6 + smoothNoise(x * 2.1, y * 2.1, k + 3) * 0.3 + smoothNoise(x * 4.3, y * 4.3, k + 7) * 0.1;

function circle(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ellipse(g, x, y, rx, ry, c, rot = 0) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); g.fill(); }
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function rrect(g, x, y, w, h, r, c) { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
function poly(g, pts, c) { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
function line(g, x0, y0, x1, y1, c, w = 1) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
// Feuille en amande, de (x, y) vers l'angle `a`.
function leaf(g, x, y, len, wid, a, c, vein) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = c; g.beginPath(); g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
  if (vein) { g.strokeStyle = vein; g.lineWidth = 0.35; g.beginPath(); g.moveTo(0.5, 0); g.lineTo(len * 0.85, 0); g.stroke(); }
  g.restore();
}
function sparkle(g, x, y, s, c = "#fff") { g.fillStyle = c; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y); g.lineTo(x + s * 0.25, y + s * 0.25); g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25); g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25); g.closePath(); g.fill(); }

/* ================= Sprites mis en cache (avec contour) ================= */

// Ajoute un contour sombre autour de tout ce qui n'est pas transparent dans le canvas `src`.
export function outlineCanvas(src, px = 3, color = OUTLINE) {
  const out = document.createElement("canvas");
  out.width = src.width; out.height = src.height;
  const g = out.getContext("2d");
  const steps = 12;
  for (let k = 0; k < steps; k++) { const a = (k / steps) * Math.PI * 2; g.drawImage(src, Math.cos(a) * px, Math.sin(a) * px); }
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color; g.fillRect(0, 0, out.width, out.height);
  g.globalCompositeOperation = "source-over";
  g.drawImage(src, 0, 0);
  return out;
}

const CACHE = new Map();
// w, h : taille du sprite (unités du monde) ; ax, ay : où se trouve le coin haut-gauche de la case dans le sprite.
function sprite(key, w, h, ax, ay, draw, outline = true) {
  let s = CACHE.get(key);
  if (s) return s;
  const pad = 2;
  const c = document.createElement("canvas");
  c.width = Math.ceil((w + pad * 2) * SPR_SCALE); c.height = Math.ceil((h + pad * 2) * SPR_SCALE);
  const g = c.getContext("2d");
  g.scale(SPR_SCALE, SPR_SCALE); g.translate(pad, pad);
  draw(g);
  s = { c: outline ? outlineCanvas(c, SPR_SCALE * 0.7) : c, w: w + pad * 2, h: h + pad * 2, ax: ax + pad, ay: ay + pad };
  CACHE.set(key, s);
  if (CACHE.size > 900) CACHE.delete(CACHE.keys().next().value);
  return s;
}
function blit(ctx, s, x, y, opts) {
  if (!opts) { ctx.drawImage(s.c, x - s.ax, y - s.ay, s.w, s.h); return; }
  ctx.save();
  ctx.translate(x + (opts.px ?? 8), y + (opts.py ?? 16));
  if (opts.skew) ctx.transform(1, 0, opts.skew, 1, 0, 0);
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.sy) ctx.scale(1, opts.sy);
  ctx.drawImage(s.c, -(opts.px ?? 8) - s.ax, -(opts.py ?? 16) - s.ay, s.w, s.h);
  ctx.restore();
}
function shadow(ctx, x, y, rx, ry, a = 0.28) { ctx.fillStyle = `rgba(20,14,30,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

/* ================= Palettes de saison ================= */

const SEASON = [
  { grass: ["#4f9a3e", "#62b04a", "#7cc65a"], blade: "#3c7f2e", tip: "#9ad86c", leaf: ["#3f9a46", "#58b65a", "#8ad86e"], flower: ["#ffe46a", "#ff9ad0", "#ffffff", "#b8a0ff"] },
  { grass: ["#3f8a32", "#4f9e3a", "#68b448"], blade: "#2f6e26", tip: "#86c85a", leaf: ["#2a7a36", "#3a9442", "#62b456"], flower: ["#ffd23a", "#ff6a5a", "#ffffff", "#6ac8ff"] },
  { grass: ["#7c8a36", "#94983e", "#b4a24a"], blade: "#5e6a26", tip: "#d8b85a", leaf: ["#c85a1e", "#e8842a", "#f6b844"], flower: ["#ff8a2a", "#c83a2a", "#ffd23a", "#a0522d"] },
  { grass: ["#dfe8f0", "#eaf1f7", "#f8fbfd"], blade: "#b9c8d6", tip: "#ffffff", leaf: ["#2f5a46", "#3c6e56", "#4c8268"], flower: ["#ffffff", "#e8f4ff", "#ffffff", "#d0e8ff"] }
];

/* ================= Sol pré-rendu ================= */

let groundCache = null;   // { key, c, scale }

const isT = (t) => (x, y) => groundAt(x, y) === t;
const isAny = (...ts) => (x, y) => ts.includes(groundAt(x, y));

// Remplit les cases où `test` est vrai en arrondissant les coins extérieurs, et en débordant de `grow` sur les bords libres.
function blob(g, test, color, grow = 0, rad = 5, x0 = 0, y0 = 0, x1 = MAP_W - 1, y1 = MAP_H - 1) {
  g.fillStyle = color;
  g.beginPath();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!test(x, y)) continue;
    const L = !test(x - 1, y), R = !test(x + 1, y), U = !test(x, y - 1), D = !test(x, y + 1);
    const X = x * T - (L ? grow : 0), Y = y * T - (U ? grow : 0);
    const W = T + (L ? grow : 0) + (R ? grow : 0) + (R ? 0 : 0.3), H = T + (U ? grow : 0) + (D ? grow : 0) + (D ? 0 : 0.3);
    g.roundRect(X, Y, W, H, [L && U ? rad : 0, R && U ? rad : 0, R && D ? rad : 0, L && D ? rad : 0]);
  }
  g.fill();
}

function paintGround(season, ghBuilt, scale) {
  const P = SEASON[season];
  const c = document.createElement("canvas");
  c.width = MAP_W * T * scale; c.height = MAP_H * T * scale;
  const g = c.getContext("2d");
  g.scale(scale, scale);
  const rng = mulberry(9100 + season);

  // 1. Herbe : grandes taches douces (bruit) agrandies avec lissage.
  const n = document.createElement("canvas");
  n.width = MAP_W * 3; n.height = MAP_H * 3;
  const ng = n.getContext("2d");
  const img = ng.createImageData(n.width, n.height);
  const [c0, c1, c2] = P.grass.map(hex);
  for (let y = 0; y < n.height; y++) for (let x = 0; x < n.width; x++) {
    const v = fbm(x / 7, y / 7, season * 11 + 1);
    const t = Math.min(1, Math.max(0, (v - 0.25) * 1.6));
    const a = t < 0.5 ? c0 : c1, b = t < 0.5 ? c1 : c2, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const o = (y * n.width + x) * 4;
    img.data[o] = a[0] + (b[0] - a[0]) * k; img.data[o + 1] = a[1] + (b[1] - a[1]) * k; img.data[o + 2] = a[2] + (b[2] - a[2]) * k; img.data[o + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(n, 0, 0, MAP_W * T, MAP_H * T);

  // Enclos : herbe un peu piétinée.
  blob(g, isT(G.PEN), season === 3 ? "rgba(200,210,220,.35)" : "rgba(150,120,70,.16)", 0, 4);

  // 2. Brins d'herbe, fleurs, feuilles mortes, neige.
  const grassy = isAny(G.GRASS, G.PEN, G.BUILD);
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (!grassy(x, y)) continue;
    const X = x * T, Y = y * T;
    const tufts = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < tufts; k++) {
      const bx = X + rng() * T, by = Y + rng() * T;
      const hgt = 1.6 + rng() * 2.2;
      g.lineCap = "round";
      g.strokeStyle = P.blade; g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 0.8, by - hgt); g.moveTo(bx + 0.6, by); g.lineTo(bx + 0.9, by - hgt * 1.15); g.moveTo(bx + 1.2, by); g.lineTo(bx + 2.1, by - hgt * 0.8); g.stroke();
      if (rng() < 0.5) { g.strokeStyle = P.tip; g.lineWidth = 0.4; g.beginPath(); g.moveTo(bx + 0.6, by - hgt * 0.4); g.lineTo(bx + 0.9, by - hgt * 1.1); g.stroke(); }
    }
    const v = fbm(x / 5, y / 5, 77 + season);
    if (season < 3 && v > 0.62 && rng() < 0.55) {
      const fc = P.flower[Math.floor(rng() * P.flower.length)];
      for (let k = 0; k < 1 + Math.floor(rng() * 3); k++) {
        const fx = X + 2 + rng() * 12, fy = Y + 2 + rng() * 12;
        if (season === 2) { leaf(g, fx, fy, 2.6, 1.2, rng() * 6.28, fc); continue; }
        for (let p = 0; p < 5; p++) circle(g, fx + Math.cos(p * 1.256) * 0.9, fy + Math.sin(p * 1.256) * 0.9, 0.75, fc);
        circle(g, fx, fy, 0.55, season === 0 ? "#ffd23a" : "#fff6a0");
      }
    }
    if (season === 3 && rng() < 0.25) sparkle(g, X + rng() * 16, Y + rng() * 16, 0.8, "#ffffff");
    if (season === 0 && rng() < 0.05) { // trèfles
      const fx = X + 3 + rng() * 10, fy = Y + 3 + rng() * 10;
      for (let p = 0; p < 3; p++) circle(g, fx + Math.cos(p * 2.1) * 1, fy + Math.sin(p * 2.1) * 1, 0.9, "#3f8a32");
    }
  }

  // 3. Sable de l'étang (forme organique), carrière, chemins.
  const pcx = (POND.cx + 0.5) * T, pcy = (POND.cy + 0.5) * T;
  const wobbly = (rx, ry, k) => {
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const f = 1 + 0.045 * Math.sin(a * 3 + k) + 0.03 * Math.sin(a * 5 + k * 2) + 0.02 * Math.sin(a * 9);
      const x = pcx + Math.cos(a) * rx * f, y = pcy + Math.sin(a) * ry * f;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  };
  const SR = 1.27, sand = season === 3 ? ["#c4ccd6", "#e4e9ef"] : ["#bfa06a", "#e6d29c"];
  wobbly(POND.rx * T * SR + 1.4, POND.ry * T * SR + 1.4, 1); g.fillStyle = sand[0]; g.fill();
  wobbly(POND.rx * T * SR, POND.ry * T * SR, 1); g.fillStyle = sand[1]; g.fill();
  for (let k = 0; k < 260; k++) {
    const a = rng() * Math.PI * 2, d = 0.8 + rng() * 0.45;
    circle(g, pcx + Math.cos(a) * POND.rx * T * d, pcy + Math.sin(a) * POND.ry * T * d, 0.4 + rng() * 0.5, season === 3 ? "#b8c2cc" : "#c4a874");
  }
  for (let k = 0; k < 9; k++) {
    const a = rng() * Math.PI * 2;
    const x = pcx + Math.cos(a) * POND.rx * T * 1.12, y = pcy + Math.sin(a) * POND.ry * T * 1.14;
    ellipse(g, x, y + 0.6, 2.6, 1.6, "#6d727c"); ellipse(g, x - 0.4, y, 2.1, 1.2, "#9aa0a8");
  }

  const quarry = isT(G.GRAVEL);
  blob(g, quarry, "#5c564e", 1.4, 7);
  blob(g, quarry, "#8a8378", 0, 7);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!quarry(x, y)) continue;
    for (let k = 0; k < 7; k++) {
      const px = x * T + rng() * 16, py = y * T + rng() * 16, r = 0.5 + rng() * 1.3;
      ellipse(g, px, py + 0.3, r, r * 0.7, "#6a645b"); ellipse(g, px - 0.2, py - 0.1, r * 0.8, r * 0.55, rng() < 0.5 ? "#a39c90" : "#958e82");
    }
    if (season === 3) for (let k = 0; k < 3; k++) ellipse(g, x * T + rng() * 16, y * T + rng() * 16, 2 + rng() * 2, 1 + rng(), "rgba(245,250,255,.75)");
  }

  const path = isT(G.PATH);
  blob(g, path, season === 3 ? "#b4aea6" : "#8f6c44", 1.1, 6);
  blob(g, path, season === 3 ? "#d6d1c9" : "#c9a676", 0, 6);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!path(x, y)) continue;
    for (let k = 0; k < 5; k++) {
      const px = x * T + 1.5 + rng() * 13, py = y * T + 1.5 + rng() * 13, r = 0.6 + rng() * 1.1;
      ellipse(g, px, py + 0.35, r, r * 0.7, season === 3 ? "#aaa39a" : "#a8875c");
      ellipse(g, px - 0.2, py - 0.1, r * 0.75, r * 0.5, season === 3 ? "#e8e4de" : "#dcc08e");
    }
    if (season === 3) ellipse(g, x * T + 8 + (rng() - 0.5) * 8, y * T + 8 + (rng() - 0.5) * 8, 5, 2.5, "rgba(250,252,255,.55)");
  }

  // 4. Étang : berge, dégradé de profondeur, écume, nénuphars, roseaux.
  const WR = 1.04;
  wobbly(POND.rx * T * WR + 1.6, POND.ry * T * WR + 1.6, 4); g.fillStyle = season === 3 ? "#a8c4d8" : "#6a8a5a"; g.fill();
  wobbly(POND.rx * T * WR, POND.ry * T * WR, 4);
  const wg = g.createRadialGradient(pcx, pcy + 4, 4, pcx, pcy, POND.rx * T * 1.05);
  if (season === 3) { wg.addColorStop(0, "#9cc0de"); wg.addColorStop(1, "#d8e8f4"); }
  else { wg.addColorStop(0, "#17457e"); wg.addColorStop(0.6, "#2a6cb2"); wg.addColorStop(1, "#5aaee0"); }
  g.fillStyle = wg; g.fill();
  g.save(); g.clip();
  if (season === 3) { for (let k = 0; k < 40; k++) line(g, pcx - 60 + rng() * 120, pcy - 40 + rng() * 80, pcx - 60 + rng() * 120, pcy - 40 + rng() * 80, "rgba(255,255,255,.35)", 0.4); }
  else { const lg = g.createLinearGradient(0, pcy - POND.ry * T, 0, pcy - POND.ry * T + 10); lg.addColorStop(0, "rgba(10,30,20,.35)"); lg.addColorStop(1, "rgba(10,30,20,0)"); g.fillStyle = lg; g.fillRect(pcx - 100, pcy - POND.ry * T - 4, 200, 16); }
  g.restore();
  wobbly(POND.rx * T * WR - 1.2, POND.ry * T * WR - 1.2, 4);
  g.strokeStyle = season === 3 ? "rgba(255,255,255,.85)" : "rgba(230,250,255,.6)"; g.lineWidth = 0.9; g.setLineDash([5, 3, 2, 4]); g.stroke(); g.setLineDash([]);
  const cx = pcx, cy = pcy;
  if (season !== 3) {
    for (const [lx, ly, r] of [[7.4, 29.2, 2.4], [8.4, 30.6, 1.8], [12.3, 31.2, 2.2], [11.6, 28.6, 1.6]]) {
      const X = lx * T, Y = ly * T;
      g.fillStyle = "#3e9a4a"; g.beginPath(); g.moveTo(X, Y); g.arc(X, Y, r * 2.2, 0.3, Math.PI * 2 - 0.1); g.closePath(); g.fill();
      g.fillStyle = "#5cbc5a"; g.beginPath(); g.moveTo(X, Y); g.arc(X - 0.4, Y - 0.4, r * 1.6, 0.4, Math.PI * 1.6); g.closePath(); g.fill();
      if (season < 2 && r > 2) { for (let p = 0; p < 6; p++) circle(g, X + 1 + Math.cos(p) * 1.1, Y - 1 + Math.sin(p) * 1.1, 0.9, "#ffc0e0"); circle(g, X + 1, Y - 1, 0.7, "#ffe46a"); }
    }
    for (let k = 0; k < 18; k++) {
      const a = rng() * Math.PI * 2;
      const rx = cx + Math.cos(a) * POND.rx * T * 1.07, ry = cy + Math.sin(a) * POND.ry * T * 1.12;
      if (Math.sin(a) < -0.2 && rng() < 0.6) continue;
      for (let b = 0; b < 4; b++) {
        const bx = rx + (rng() - 0.5) * 4, h = 6 + rng() * 6;
        line(g, bx, ry + 2, bx + (rng() - 0.5) * 2, ry + 2 - h, season === 2 ? "#a88a3a" : "#4a8a3a", 0.7);
        if (b === 0 && rng() < 0.6) ellipse(g, bx + 0.2, ry - h + 4, 0.8, 2.2, "#6a4a2a");
      }
    }
  }

  // 5. Lisière de forêt : des sapins serrés, de plus en plus sombres vers le bord.
  const wall = isT(G.WALL);
  blob(g, wall, season === 3 ? "#5c6e6a" : "#183424", 0, 0);
  const pines = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (wall(x, y)) for (let k = 0; k < 2; k++) pines.push([x * T + rng() * 16, y * T + rng() * 16 + 4, 6 + rng() * 4]);
  pines.sort((a, b) => a[1] - b[1]);
  for (const [px, py, s] of pines) drawPine(g, px, py, s, season);

  // 6. Clôtures des enclos.
  const fence = isT(G.FENCE);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!fence(x, y)) continue;
    const X = x * T, Y = y * T;
    const lr = fence(x - 1, y) || fence(x + 1, y);
    const ud = fence(x, y - 1) || fence(x, y + 1);
    ellipse(g, X + 8, Y + 14, 4, 1.4, "rgba(20,14,30,.25)");
    if (lr) {
      for (const ry of [5.5, 10]) { rect(g, fence(x - 1, y) ? X : X + 7, Y + ry, (fence(x - 1, y) ? 8 : 1) + (fence(x + 1, y) ? 8 : 1), 1.8, "#7a4a24"); rect(g, fence(x - 1, y) ? X : X + 7, Y + ry, (fence(x - 1, y) ? 8 : 1) + (fence(x + 1, y) ? 8 : 1), 0.7, "#b88250"); }
    }
    if (ud && !lr) { rect(g, X + 6.6, Y, 2.8, 16, "#7a4a24"); rect(g, X + 6.6, Y, 0.9, 16, "#b88250"); }
    rect(g, X + 6, Y + 2, 4, 12.5, "#2c1a10");
    rect(g, X + 6.5, Y + 2.5, 3, 11.5, "#8a5a2c");
    rect(g, X + 6.5, Y + 2.5, 1, 11.5, "#b88250");
    rect(g, X + 5.6, Y + 1.6, 4.8, 1.6, season === 3 ? "#ffffff" : "#5a3a1c");
  }

  // 7. Serre : dallage et murets vitrés.
  for (let y = GREENHOUSE.y; y < GREENHOUSE.y + GREENHOUSE.h; y++) for (let x = GREENHOUSE.x; x < GREENHOUSE.x + GREENHOUSE.w; x++) {
    const t = groundAt(x, y), X = x * T, Y = y * T;
    if (t === G.GH) {
      rect(g, X, Y, T, T, ghBuilt ? "#6b5c4e" : "#4a423e");
      for (let k = 0; k < 4; k++) rrect(g, X + (k % 2) * 8 + 0.5, Y + Math.floor(k / 2) * 8 + 0.5, 7, 7, 1, ghBuilt ? (hash(x, y, k) > 0.5 ? "#7d6c5c" : "#76665a") : "#544a44");
      if (!ghBuilt && hash(x, y) > 0.55) { ellipse(g, X + 5, Y + 9, 3, 2, "#6e6e6e"); poly(g, [[X + 9, Y + 4], [X + 13, Y + 5], [X + 11, Y + 8]], "rgba(170,230,240,.7)"); }
      if (!ghBuilt && hash(x, y, 4) > 0.7) for (let k = 0; k < 4; k++) leaf(g, X + 3 + k * 3, Y + 12, 3, 1.2, -1.2 - k * 0.3, "#3a7a3a");
    } else if (t === G.GHWALL || t === G.GHDOOR) {
      rect(g, X, Y, T, T, "#3a4a50");
      const glass = g.createLinearGradient(X, Y, X + T, Y + T);
      glass.addColorStop(0, ghBuilt ? "#d8f6ff" : "#7a9aa0"); glass.addColorStop(0.5, ghBuilt ? "#8fd4e8" : "#5a7a80"); glass.addColorStop(1, ghBuilt ? "#c0ecf8" : "#6a8a90");
      g.fillStyle = glass; g.fillRect(X + 1, Y + 1, T - 2, T - 2);
      rect(g, X + 7.3, Y, 1.4, T, "#e8f0f2"); rect(g, X, Y + 7.3, T, 1.4, "#e8f0f2");
      line(g, X + 2, Y + 6, X + 6, Y + 2, "rgba(255,255,255,.7)", 0.6);
      if (!ghBuilt) { line(g, X + 3, Y + 4, X + 12, Y + 13, "#2a3a40", 0.6); line(g, X + 10, Y + 3, X + 6, Y + 11, "#2a3a40", 0.5); if (hash(x, y) > 0.5) for (let k = 0; k < 3; k++) leaf(g, X + 2 + k * 4, Y + 15, 4, 1.4, -1.4 + k * 0.4, "#3a8a3a"); }
      if (t === G.GHDOOR) {
        rect(g, X + 2, Y, 12, T, ghBuilt ? "#4a3420" : "#5a3a1a");
        rect(g, X + 3, Y + 1, 10, 7, ghBuilt ? "#a8e4f0" : "#3a3030");
        circle(g, X + 11.5, Y + 10, 0.9, "#ffd23a");
        if (!ghBuilt) { rect(g, X - 1, Y + 4, T + 2, 2.6, "#9a6a34"); rect(g, X - 1, Y + 10, T + 2, 2.6, "#9a6a34"); }
      }
    }
  }

  // 8. Ombres douces au pied des bâtiments et de la lisière.
  for (const b of BUILDINGS) {
    const gr = g.createLinearGradient(0, (b.y + b.h) * T - 2, 0, (b.y + b.h) * T + 5);
    gr.addColorStop(0, "rgba(20,14,30,.3)"); gr.addColorStop(1, "rgba(20,14,30,0)");
    g.fillStyle = gr; g.fillRect(b.x * T - 2, (b.y + b.h) * T - 2, b.w * T + 4, 7);
  }
  for (let x = 1; x < MAP_W - 1; x++) { const gr = g.createLinearGradient(0, T, 0, T + 8); gr.addColorStop(0, "rgba(10,20,15,.35)"); gr.addColorStop(1, "rgba(10,20,15,0)"); g.fillStyle = gr; g.fillRect(x * T, T, T, 8); }

  return c;
}

function drawPine(g, x, y, s, season) {
  const dark = season === 3 ? "#2c4a40" : "#1d4a2e", mid = season === 3 ? "#3a5e50" : "#28623a", light = season === 3 ? "#4c7262" : "#3a7a46";
  ellipse(g, x, y + 1, s * 0.7, s * 0.22, "rgba(0,0,0,.3)");
  rect(g, x - 0.8, y - 3, 1.6, 4, "#4a2e1a");
  for (let k = 0; k < 3; k++) {
    const w = s * (1 - k * 0.22), yy = y - 2 - k * s * 0.55;
    poly(g, [[x - w, yy], [x, yy - s * 0.95], [x + w, yy]], k % 2 ? mid : dark);
    poly(g, [[x - w * 0.15, yy - s * 0.6], [x, yy - s * 0.95], [x + w * 0.85, yy]], light);
    if (season === 3) poly(g, [[x - w * 0.6, yy - s * 0.32], [x, yy - s * 0.95], [x + w * 0.35, yy - s * 0.55]], "rgba(250,252,255,.9)");
  }
}

// Copie la partie visible du sol. `scale` : résolution souhaitée du cache (on la plafonne pour la mémoire).
export function drawGroundLayer(ctx, season, ghBuilt, zoom, view) {
  const scale = Math.max(2, Math.min(4, Math.ceil(zoom)));
  const key = `${season}|${ghBuilt}|${scale}`;
  if (!groundCache || groundCache.key !== key) groundCache = { key, c: paintGround(season, ghBuilt, scale), scale };
  const { c } = groundCache;
  const sx = Math.max(0, view.x), sy = Math.max(0, view.y);
  const sw = Math.min(MAP_W * T - sx, view.w), sh = Math.min(MAP_H * T - sy, view.h);
  if (sw <= 0 || sh <= 0) return;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, sx * scale, sy * scale, sw * scale, sh * scale, sx, sy, sw, sh);
}

// Reflets animés sur l'étang (par-dessus le sol pré-rendu).
export function drawWaterFx(ctx, x0, y0, x1, y1, time, season) {
  if (season === 3) return;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (GROUND[idx(x, y)] !== G.WATER) continue;
    const X = x * T, Y = y * T;
    for (let k = 0; k < 2; k++) {
      const ph = (time / 1800 + hash(x, y, k)) % 1;
      const a = Math.sin(ph * Math.PI);
      ctx.strokeStyle = `rgba(220,245,255,${0.45 * a})`;
      ctx.lineWidth = 0.7;
      const wx = X + 2 + hash(x, y, k + 2) * 10 + ph * 3, wy = Y + 3 + hash(x, y, k + 4) * 10;
      if (((wx / T - POND.cx - 0.5) / POND.rx) ** 2 + ((wy / T - POND.cy - 0.5) / POND.ry) ** 2 > 0.9) continue;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 2, wy - 0.8, wx + 4, wy); ctx.stroke();
    }
    if (hash(x, y, 9) > 0.8) { const tw = (Math.sin(time / 300 + x * 3 + y) + 1) / 2; if (tw > 0.85) sparkle(ctx, X + hash(x, y, 3) * 14 + 1, Y + hash(x, y, 5) * 14 + 1, 1.3 * tw, "rgba(255,255,255,.9)"); }
  }
}

/* ================= Terre labourée ================= */

export function drawSoil(ctx, x, y, soil, season, has) {
  const X = x * T, Y = y * T;
  const L = !has(x - 1, y), R = !has(x + 1, y), U = !has(x, y - 1), D = !has(x, y + 1);
  const r = 3.5, rad = [L && U ? r : 0, R && U ? r : 0, R && D ? r : 0, L && D ? r : 0];
  const wet = soil.w;
  const base = wet ? "#3f2616" : season === 3 ? "#7a6458" : "#7a4e2c";
  const top = wet ? "#5a3820" : season === 3 ? "#94806f" : "#986338";
  ctx.fillStyle = shade(base, -0.25);
  ctx.beginPath(); ctx.roundRect(X + (L ? 0.6 : 0), Y + (U ? 0.6 : 0), T - (L ? 0.6 : 0) - (R ? 0.6 : 0) + 0.3, T - (U ? 0.6 : 0) + 0.3, rad); ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.roundRect(X + (L ? 1.1 : 0), Y + (U ? 1.1 : 0), T - (L ? 1.1 : 0) - (R ? 1.1 : 0) + 0.3, T - (U ? 1.1 : 0) - (D ? 2 : 0) + 0.3, rad); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const fy = Y + 3.5 + k * 4.5;
    ctx.fillStyle = wet ? "rgba(20,10,4,.45)" : "rgba(60,32,14,.45)";
    ctx.fillRect(X + (L ? 2 : 0), fy, T - (L ? 2 : 0) - (R ? 2 : 0), 1.1);
    ctx.fillStyle = wet ? "rgba(140,110,90,.22)" : "rgba(200,150,100,.3)";
    ctx.fillRect(X + (L ? 2 : 0), fy - 0.8, T - (L ? 2 : 0) - (R ? 2 : 0), 0.6);
  }
  if (wet) { ctx.fillStyle = "rgba(150,200,255,.18)"; ctx.beginPath(); ctx.ellipse(X + 5 + hash(x, y) * 6, Y + 5 + hash(x, y, 1) * 6, 2.5, 1, 0, 0, 7); ctx.fill(); }
  if (soil.f) {
    const c = soil.f === "speed" ? "#3affb0" : soil.f === "q2" ? "#ffd23a" : "#e8d0a0";
    for (let k = 0; k < 5; k++) circle(ctx, X + 2 + hash(x, y, k) * 12, Y + 2 + hash(x, y, k + 9) * 12, 0.55, c);
  }
}

/* ================= Cultures ================= */

const LEAF = ["#2f8a3a", "#45a64a", "#7ad06a"];

function cropSprite(cropId, stage, dead) {
  return sprite(`crop|${cropId}|${stage}|${dead}`, 16, 26, 0, 10, (g) => {
    const crop = cropById(cropId);
    const cx = 8, by = 14 + 10;
    const col = crop.color;
    const [d, m, l] = LEAF;
    if (dead) {
      line(g, cx, by, cx - 1, by - 8, "#6a4a24", 1);
      leaf(g, cx - 1, by - 5, 4, 1.4, Math.PI + 0.6, "#8a6a34"); leaf(g, cx, by - 7, 4, 1.4, -0.4, "#7a5a2a");
      return;
    }
    if (stage === 0) { ellipse(g, cx, by - 1, 3.5, 1.4, "#5a3820"); circle(g, cx - 1.5, by - 1.6, 0.8, "#e8d098"); circle(g, cx + 1.4, by - 1.2, 0.8, "#e8d098"); return; }
    if (stage === 1) { line(g, cx, by, cx, by - 4, d, 0.8); leaf(g, cx, by - 3.5, 3.5, 1.5, -2.5, m, d); leaf(g, cx, by - 3.5, 3.5, 1.5, -0.6, l, d); return; }
    const big = stage >= 3;
    switch (crop.shape) {
      case "root":
        for (const [a, c] of [[-2.3, d], [-1.9, m], [-1.3, l], [-1.05, m], [-0.7, d]]) leaf(g, cx, by - 2, big ? 9 : 6.5, 1.8, a, c, d);
        if (stage >= 3) {
          const r = stage === 4 ? 3.6 : 2.6;
          ellipse(g, cx, by - 0.5, r, r * 0.75, col); ellipse(g, cx - 1, by - 1.3, r * 0.4, r * 0.25, shade(col, 0.5));
        }
        break;
      case "leafy":
        for (let k = 0; k < 7; k++) leaf(g, cx, by - 2, big ? 7.5 : 5, 2.6, -Math.PI + 0.25 + k * 0.45, k % 2 ? m : d, d);
        if (stage === 4) {
          if (crop.id === "choufleur") { for (let k = 0; k < 6; k++) circle(g, cx - 2.5 + (k % 3) * 2.5, by - 6 + Math.floor(k / 3) * 2, 2, k % 2 ? col : shade(col, -0.08)); }
          else { circle(g, cx, by - 5, 4.2, col); circle(g, cx - 1.3, by - 6.3, 1.6, shade(col, 0.35)); leaf(g, cx, by - 5, 4, 1.5, -2.2, shade(col, -0.25)); leaf(g, cx, by - 5, 4, 1.5, -0.9, shade(col, -0.2)); }
        } else circle(g, cx, by - 4, big ? 3 : 2, l);
        break;
      case "bush":
        circle(g, cx, by - 6, big ? 6.4 : 4.2, d); circle(g, cx - 2, by - 8, big ? 4.2 : 3, m); circle(g, cx + 2.4, by - 6.4, big ? 3.4 : 2.4, m); circle(g, cx - 2.4, by - 9.2, 1.6, l);
        if (stage === 4) for (let k = 0; k < 6; k++) { const fx = cx - 4.5 + hash(k, cropId.length) * 9, fy = by - 11 + hash(k, 3, cropId.length) * 9; circle(g, fx, fy, 1.4, col); circle(g, fx - 0.4, fy - 0.4, 0.5, shade(col, 0.6)); }
        break;
      case "tall": {
        const hgt = big ? 17 : 11;
        line(g, cx, by, cx, by - hgt, d, 1.4);
        for (let k = 0; k < 4; k++) leaf(g, cx, by - 3 - k * (hgt / 5), 6, 1.6, k % 2 ? -0.5 : Math.PI + 0.5, k % 2 ? m : l, d);
        if (stage === 4) {
          if (crop.id === "rhubarbe") { for (let k = -1; k <= 1; k++) { line(g, cx + k * 2, by, cx + k * 3, by - 12, col, 1.8); leaf(g, cx + k * 3, by - 12, 5, 3, -1.6 + k * 0.6, m, d); } }
          else if (crop.id === "ble") { for (let k = -1; k <= 1; k++) ellipse(g, cx + k * 2.2, by - hgt + 1 - Math.abs(k), 1.2, 3.4, col, k * 0.25); }
          else { ellipse(g, cx + 2.5, by - 10, 2, 4.2, col, 0.25); leaf(g, cx + 2, by - 7, 5, 1.6, -1.2, m); ellipse(g, cx + 2.2, by - 11.5, 0.8, 1.5, shade(col, 0.5), 0.25); }
        }
        break;
      }
      case "vine":
        rect(g, cx - 5.5, by - 18, 1.4, 18, "#8a5a2c"); rect(g, cx + 4.1, by - 18, 1.4, 18, "#8a5a2c"); rect(g, cx - 5.5, by - 15.5, 11, 1, "#b8844a"); rect(g, cx - 5.5, by - 9, 11, 1, "#b8844a");
        for (let k = 0; k < (big ? 7 : 4); k++) leaf(g, cx + (k % 2 ? 2 : -2), by - 2 - k * 2.2, 5, 2.4, k % 2 ? -0.5 : Math.PI + 0.5, k % 3 ? m : d, d);
        if (stage === 4) for (let k = 0; k < 5; k++) { const fx = cx - 3 + (k % 3) * 3, fy = by - 15 + Math.floor(k / 2) * 4.5; circle(g, fx, fy, crop.id === "raisin" ? 1.4 : 1.8, col); circle(g, fx - 0.5, fy - 0.5, 0.55, shade(col, 0.55)); }
        break;
      case "gourd":
        for (const a of [-2.6, -1.6, -0.5]) leaf(g, cx, by - 1, 7, 3, a, a === -1.6 ? m : d, d);
        line(g, cx - 6, by - 0.5, cx + 6, by - 0.5, d, 0.8);
        if (stage >= 3) {
          const R = stage === 4 ? 6 : 3.4;
          ellipse(g, cx, by - R * 0.8, R, R * 0.8, stage === 4 ? col : "#8ac05a");
          if (stage === 4) {
            g.strokeStyle = shade(col, -0.25); g.lineWidth = 0.5;
            for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(cx, by - R * 0.8, R * Math.abs(k) + 0.6, R * 0.78, 0, 0, Math.PI * 2); g.stroke(); }
            ellipse(g, cx - R * 0.4, by - R * 1.1, R * 0.3, R * 0.18, shade(col, 0.55));
            rect(g, cx - 0.6, by - R * 1.6 - 1.5, 1.2, 2.2, "#5a6a2a");
          }
        }
        break;
      case "flower": {
        const hgt = big ? 13 : 8;
        line(g, cx, by, cx, by - hgt, d, 0.9);
        leaf(g, cx, by - 3, 5, 1.8, Math.PI + 0.5, m, d); leaf(g, cx, by - 5, 5, 1.8, -0.5, l, d);
        if (stage >= 3) {
          const R = stage === 4 ? (crop.id === "tournesol" ? 4.8 : 3.4) : 1.8;
          const pc = stage === 4 ? col : "#a8d880";
          for (let p = 0; p < 7; p++) ellipse(g, cx + Math.cos(p * 0.9) * R * 0.75, by - hgt + Math.sin(p * 0.9) * R * 0.75, R * 0.5, R * 0.32, pc, p * 0.9);
          circle(g, cx, by - hgt, R * 0.42, stage === 4 ? (crop.id === "tournesol" ? "#6a3a1a" : "#fff2a0") : "#c8e8a0");
        }
        break;
      }
      default: circle(g, cx, by - 6, 4, m);
    }
  });
}

export function drawCrop(ctx, x, y, cropId, stage, dead, time) {
  const s = cropSprite(cropId, stage, dead);
  const sway = dead || stage < 2 ? 0 : Math.sin(time / 700 + x * 1.7 + y * 0.9) * 0.05;
  if (stage >= 2 && !dead) shadow(ctx, x * T + 8, y * T + 14, 5, 1.6, 0.2);
  blit(ctx, s, x * T, y * T, sway ? { skew: sway, px: 8, py: 14 } : null);
  if (cropId === "neonfleur" && stage === 4) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time / 220);
    const gr = ctx.createRadialGradient(x * T + 8, y * T + 1, 0, x * T + 8, y * T + 1, 9); gr.addColorStop(0, "#ff2bd6"); gr.addColorStop(1, "rgba(255,43,214,0)");
    ctx.fillStyle = gr; ctx.fillRect(x * T - 2, y * T - 9, 20, 20); ctx.restore();
  }
}

/* ================= Objets de la carte ================= */

const TREE_PAL = [
  [["#2f7a3e", "#46a052", "#74c66a"], ["#357e3a", "#4ea64e", "#86cc66"], ["#2a7046", "#3c9258", "#6cba72"]],
  [["#24683a", "#338a44", "#58aa52"], ["#2a6e30", "#3a8e3a", "#66b04a"], ["#226040", "#2f8050", "#56a866"]],
  [["#b8481c", "#e0762a", "#f6b044"], ["#a8301e", "#d0502a", "#f08a3a"], ["#c8861e", "#e8b02a", "#ffd65a"]],
  [["#5a3a22", "#6a4628", "#8a5a34"], ["#5a3a22", "#6a4628", "#8a5a34"], ["#5a3a22", "#6a4628", "#8a5a34"]]
];

function treeSprite(season, v) {
  return sprite(`tree|${season}|${v}`, 40, 58, 12, 42, (g) => {
    const cx = 20, by = 56;
    // Tronc et racines
    poly(g, [[cx - 4.5, by], [cx - 2.4, by - 22], [cx + 2.4, by - 22], [cx + 4.5, by], [cx + 7, by + 0.5], [cx - 7, by + 0.5]], "#6a4024");
    poly(g, [[cx + 0.8, by], [cx + 1.2, by - 22], [cx + 2.4, by - 22], [cx + 4.5, by], [cx + 7, by + 0.5]], "#4e2e18");
    line(g, cx - 1.8, by - 2, cx - 1, by - 18, "#8e5a32", 0.9);
    line(g, cx - 0.6, by - 6, cx - 0.2, by - 11, "#3e2412", 0.5);
    const [dk, md, lt] = TREE_PAL[season][v];
    if (season === 3) {
      g.lineCap = "round";
      for (const [x1, y1, x2, y2, w] of [[cx, by - 20, cx - 10, by - 36, 1.8], [cx, by - 22, cx + 9, by - 40, 1.8], [cx - 5, by - 29, cx - 13, by - 31, 1], [cx + 4, by - 30, cx + 13, by - 33, 1], [cx, by - 21, cx + 1, by - 46, 1.6], [cx + 1, by - 38, cx - 5, by - 47, 0.9]]) line(g, x1, y1, x2, y2, "#5a3a22", w);
      for (const [x, y, w] of [[cx - 10, by - 36.5, 4], [cx + 9, by - 40.5, 4], [cx + 1, by - 46.5, 3.5], [cx - 13, by - 31.5, 2.5], [cx + 13, by - 33.5, 2.5]]) ellipse(g, x, y, w, 1.1, "#ffffff");
      return;
    }
    const blobs = [[cx, by - 34, 15], [cx - 10, by - 28, 9.5], [cx + 10, by - 28, 9.5], [cx - 7, by - 42, 9], [cx + 7, by - 43, 9], [cx, by - 48, 8]];
    for (const [x, y, r] of blobs) circle(g, x, y + 2, r, dk);
    for (const [x, y, r] of blobs) circle(g, x - 1, y, r * 0.86, md);
    for (const [x, y, r] of blobs) circle(g, x - r * 0.32, y - r * 0.34, r * 0.42, lt);
    for (let k = 0; k < 14; k++) leaf(g, cx - 13 + hash(k, v, season) * 26, by - 52 + hash(k, 2, v) * 30, 2.6, 1.1, hash(k, 5) * 6.28, k % 2 ? lt : dk);
    if (season === 0 && v !== 1) for (let k = 0; k < 9; k++) { const px = cx - 12 + hash(k, 9, v) * 24, py = by - 50 + hash(k, 4, v) * 26; for (let p = 0; p < 5; p++) circle(g, px + Math.cos(p * 1.25) * 0.8, py + Math.sin(p * 1.25) * 0.8, 0.7, "#ffc4e0"); circle(g, px, py, 0.4, "#fff2a0"); }
    if (season === 1 && v === 2) for (let k = 0; k < 6; k++) { const px = cx - 10 + hash(k, 1, 7) * 20, py = by - 46 + hash(k, 2, 7) * 22; circle(g, px, py, 1.6, "#e8342a"); circle(g, px - 0.5, py - 0.5, 0.5, "#ffb0a0"); }
  });
}

function rockSprite(kind, v) {
  const big = kind === "boulder";
  return sprite(`rock|${kind}|${v}`, big ? 20 : 16, big ? 20 : 16, big ? 2 : 0, big ? 4 : 0, (g) => {
    const cx = big ? 10 : 8, cy = big ? 13 : 11;
    const r = big ? 8.2 : 5.4;
    const pts = [];
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const rr = r * (0.82 + hash(k, v, big ? 3 : 1) * 0.3); pts.push([cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr * 0.82]); }
    const ore = { ore_cu: "#e8884a", ore_fe: "#dfe8f2", ore_au: "#ffd23a" }[kind];
    poly(g, pts, ore ? "#5e5650" : "#6d727c");
    poly(g, pts.map(([x, y]) => [cx + (x - cx) * 0.86 - 0.7, cy + (y - cy) * 0.8 - 1]), ore ? "#7e766e" : "#8f959e");
    ellipse(g, cx - r * 0.35, cy - r * 0.45, r * 0.4, r * 0.22, ore ? "#9a928a" : "#b6bcc4");
    line(g, cx + r * 0.2, cy - r * 0.2, cx + r * 0.45, cy + r * 0.3, "rgba(40,40,50,.5)", 0.5);
    if (ore) {
      for (let k = 0; k < (big ? 5 : 4); k++) {
        const ox = cx - r * 0.6 + hash(k, 7, v) * r * 1.2, oy = cy - r * 0.5 + hash(k, 8, v) * r * 0.9;
        poly(g, [[ox, oy - 1.4], [ox + 1.3, oy], [ox, oy + 1.4], [ox - 1.3, oy]], ore);
        circle(g, ox - 0.3, oy - 0.4, 0.4, "#ffffff");
      }
    }
  });
}

function weedSprite(season, v) {
  return sprite(`weed|${season}|${v}`, 16, 16, 0, 0, (g) => {
    const c = season === 2 ? ["#8a6a1e", "#a88a2a", "#c8a83a"] : season === 3 ? ["#7a8c8c", "#94a6a6", "#b0c0c0"] : ["#24702e", "#34903a", "#58b04a"];
    for (let k = 0; k < 7; k++) leaf(g, 8 + (hash(k, v) - 0.5) * 3, 15, 6 + hash(k, v, 2) * 4, 1.5, -Math.PI / 2 + (k - 3) * 0.32, c[k % 3], c[0]);
    if (v === 1 && season < 2) for (let k = 0; k < 3; k++) circle(g, 4 + k * 4, 6 + (k % 2) * 2, 1, season === 0 ? "#fff" : "#ffd23a");
  });
}

function grassSprite(season) {
  return sprite(`tall|${season}`, 16, 18, 0, 2, (g) => {
    const c = season === 2 ? ["#9a7a2a", "#c8a03e", "#e0c060"] : ["#2f8a36", "#48a848", "#72c860"];
    g.lineCap = "round";
    for (let k = 0; k < 9; k++) {
      const bx = 2 + k * 1.5, h = 9 + hash(k, season) * 7;
      g.strokeStyle = c[k % 3]; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(bx, 17); g.quadraticCurveTo(bx + (k - 4) * 0.3, 17 - h * 0.6, bx + (k - 4) * 0.6, 17 - h); g.stroke();
    }
  });
}

function stumpSprite() {
  return sprite("stump", 18, 16, 1, 0, (g) => {
    poly(g, [[2, 12], [3, 6], [15, 6], [16, 12], [18, 14], [0, 14]], "#5e3a20");
    poly(g, [[9, 13], [9.5, 6], [15, 6], [16, 12], [18, 14]], "#4a2c16");
    ellipse(g, 9, 6.2, 6.2, 2.6, "#c8945a");
    g.strokeStyle = "#9a6a3a"; g.lineWidth = 0.4;
    for (const r of [1.4, 2.8, 4.2]) { g.beginPath(); g.ellipse(9, 6.2, r, r * 0.42, 0, 0, Math.PI * 2); g.stroke(); }
  });
}

function branchSprite(v) {
  return sprite(`branch|${v}`, 16, 16, 0, 0, (g) => {
    const a = v ? -0.35 : 0.3;
    g.save(); g.translate(8, 11); g.rotate(a);
    line(g, -6, 0, 6, 0, "#6a4022", 1.8); line(g, -6, -0.4, 6, -0.4, "#9a6a3a", 0.6);
    line(g, 1, 0, 3.5, -3.5, "#6a4022", 1.1); line(g, -2, 0, -4, 3, "#6a4022", 1);
    leaf(g, 3.5, -3.5, 2.8, 1.2, -1, "#4a9a3a"); leaf(g, 6, 0, 2.6, 1.1, 0.4, "#3a8a34");
    g.restore();
  });
}

function scarecrowSprite() {
  return sprite("scarecrow", 18, 30, 1, 14, (g) => {
    rect(g, 8.3, 4, 1.6, 26, "#6a4022");
    rect(g, 1, 13, 16, 1.6, "#6a4022");
    poly(g, [[4, 13], [14, 13], [15.5, 22], [2.5, 22]], "#3a7ac8");
    rect(g, 3, 13, 12, 1.4, "#2a5a9a");
    rect(g, 8, 13, 2, 9, "#c8a03a");
    for (const [x, y] of [[1, 14.5], [17, 14.5]]) for (let k = 0; k < 3; k++) line(g, x, y, x + (x < 9 ? -1.4 : 1.4), y + k * 1.2, "#e8c860", 0.6);
    circle(g, 9, 8.5, 4.2, "#e8a040");
    circle(g, 7.6, 7.4, 1.4, "#f8c060");
    poly(g, [[7, 8.5], [8, 7.5], [8.4, 8.8]], "#3a2010"); poly(g, [[10.2, 8.5], [11, 7.5], [11.4, 8.8]], "#3a2010");
    poly(g, [[6.6, 10.4], [11.6, 10.4], [9, 11.8]], "#3a2010");
    ellipse(g, 9, 4.6, 7, 1.6, "#7a4ab0"); poly(g, [[5.4, 4.6], [6.4, -0.4], [11.6, -0.4], [12.6, 4.6]], "#7a4ab0"); rect(g, 5.8, 3, 6.6, 1.2, "#ff2bd6");
  });
}

function sprinklerSprite(t) {
  const c = t === "sprinkler1" ? ["#9aa2ac", "#d4dae2"] : t === "sprinkler2" ? ["#c8961e", "#ffd23a"] : ["#a01a8a", "#ff5ae0"];
  return sprite(`spr|${t}`, 16, 16, 0, 0, (g) => {
    ellipse(g, 8, 12.5, 5, 2.4, "#4a5058"); ellipse(g, 8, 12, 4.2, 1.8, "#6a7078");
    rect(g, 7, 5, 2, 7, c[0]); rect(g, 7, 5, 0.7, 7, c[1]);
    ellipse(g, 8, 5, 3.2, 1.6, c[0]); ellipse(g, 7.6, 4.6, 1.8, 0.8, c[1]);
    if (t !== "sprinkler1") for (let k = 0; k < 4; k++) circle(g, 8 + Math.cos(k * 1.57) * 2.4, 5 + Math.sin(k * 1.57) * 1.2, 0.5, "#3ab0ff");
  });
}

function machineSprite(t, item) {
  const col = item ? itemInfo(item)?.color ?? "#f80" : null;
  return sprite(`mach|${t}|${col}`, 16, 22, 0, 6, (g) => {
    if (t === "jar") {
      rrect(g, 2.5, 6, 11, 15, 2.5, "rgba(200,235,255,.85)");
      if (col) rrect(g, 3.5, 11, 9, 9, 2, col);
      rect(g, 2, 4, 12, 3, "#b8843a"); rect(g, 2, 4, 12, 1, "#e0b060");
      line(g, 4.5, 8, 4.5, 18, "rgba(255,255,255,.75)", 0.9);
      rect(g, 5, 13, 6, 3.4, "#f4ecd8"); rect(g, 5, 13, 6, 0.8, "#c83a3a");
    } else if (t === "keg") {
      ellipse(g, 8, 21, 6.5, 1.6, "#4a2c16");
      poly(g, [[2, 6], [14, 6], [15, 13.5], [14, 21], [2, 21], [1, 13.5]], "#8a5a2c");
      for (let k = 0; k < 4; k++) rect(g, 2.5 + k * 3, 6.5, 0.5, 14, "#6a4220");
      rect(g, 1.2, 8.5, 13.6, 1.3, "#4a4a52"); rect(g, 1, 17.5, 14, 1.3, "#4a4a52");
      ellipse(g, 8, 6, 6, 1.8, "#b07a40"); ellipse(g, 8, 6, 4.4, 1.1, "#8a5a2c");
      rect(g, 7, 13, 2, 2.2, "#c8c8d0");
    } else if (t === "press") {
      rect(g, 1.5, 11, 13, 10, "#9a6a34"); rect(g, 1.5, 11, 13, 1.6, "#c89050");
      rect(g, 3, 13.5, 10, 6, "#7a4e26");
      rect(g, 7.2, 2, 1.6, 10, "#6a7078"); for (let k = 0; k < 4; k++) rect(g, 6.8, 3 + k * 2, 2.4, 0.6, "#9aa2ac");
      rect(g, 3, 1.5, 10, 1.6, "#4a5058"); circle(g, 3, 2.3, 1.2, "#c83a3a"); circle(g, 13, 2.3, 1.2, "#c83a3a");
    } else if (t === "loom") {
      rect(g, 1, 3, 2, 18, "#7a4a24"); rect(g, 13, 3, 2, 18, "#7a4a24"); rect(g, 1, 3, 14, 2, "#9a6a34");
      rect(g, 3, 8, 10, 8, col ?? "#ece4d4");
      for (let k = 0; k < 5; k++) line(g, 3.5 + k * 2.2, 5, 3.5 + k * 2.2, 16, "rgba(120,90,60,.5)", 0.4);
      rect(g, 2, 16, 12, 1.4, "#9a6a34"); circle(g, 8, 19, 1.6, "#c8a03a");
    }
  });
}

function forageSprite(item) {
  return sprite(`forage|${item}`, 16, 16, 0, 0, (g) => { g.save(); g.translate(2, 2); g.scale(0.75, 0.75); drawIconRaw(g, item, 0); g.restore(); });
}

export function drawObject(ctx, x, y, o, season, time, extra = {}) {
  const X = x * T, Y = y * T;
  const v = Math.floor(hash(x, y, 5) * 3);
  switch (o.t) {
    case "tree": {
      shadow(ctx, X + 8, Y + 14.5, 9, 3, 0.3);
      const sway = Math.sin(time / 1100 + x * 0.7 + y) * 0.025;
      blit(ctx, treeSprite(season, v), X, Y, { skew: sway, px: 8, py: 14 });
      break;
    }
    case "stump": shadow(ctx, X + 8, Y + 14, 7, 2.2); blit(ctx, stumpSprite(), X, Y); break;
    case "branch": blit(ctx, branchSprite(v % 2), X, Y); break;
    case "stone": case "boulder": case "ore_cu": case "ore_fe": case "ore_au":
      shadow(ctx, X + 8, Y + 14, o.t === "boulder" ? 9 : 6.5, 2.2);
      blit(ctx, rockSprite(o.t === "stone" ? "stone" : o.t === "boulder" ? "boulder" : o.t, v), X, Y);
      if (o.t === "ore_au" || o.t === "ore_fe") { const tw = (Math.sin(time / 260 + x * 2) + 1) / 2; if (tw > 0.75) sparkle(ctx, X + 4 + v * 3, Y + 6, 1.8 * tw, "rgba(255,255,255,.95)"); }
      break;
    case "weed": blit(ctx, weedSprite(season, v % 2), X, Y, { skew: Math.sin(time / 600 + x + y) * 0.05, px: 8, py: 15 }); break;
    case "grass": blit(ctx, grassSprite(season), X, Y, { skew: Math.sin(time / 520 + x * 2 + y) * 0.12, px: 8, py: 15 }); break;
    case "forage": {
      const bob = Math.sin(time / 380 + x) * 0.7;
      shadow(ctx, X + 8, Y + 14, 4, 1.3, 0.22);
      blit(ctx, forageSprite(o.item), X, Y + bob - 1);
      const tw = (Math.sin(time / 200 + y * 3) + 1) / 2; if (tw > 0.7) sparkle(ctx, X + 13, Y + 3 + bob, 1.6 * tw);
      break;
    }
    case "scarecrow": shadow(ctx, X + 8, Y + 14.5, 5, 1.6); blit(ctx, scarecrowSprite(), X, Y); break;
    case "sprinkler1": case "sprinkler2": case "sprinkler3":
      shadow(ctx, X + 8, Y + 13.5, 5, 1.6, 0.2);
      blit(ctx, sprinklerSprite(o.t), X, Y);
      if (extra.morning) {
        ctx.save(); ctx.globalAlpha = 0.6;
        for (let k = 0; k < 8; k++) { const a = k * 0.785 + time / 300; const d = ((time / 15 + k * 7) % 14); circle(ctx, X + 8 + Math.cos(a) * d, Y + 5 + Math.sin(a) * d * 0.55 - Math.sin(d / 14 * Math.PI) * 4, 0.7, "#9ad4ff"); }
        ctx.restore();
      }
      break;
    case "jar": case "keg": case "press": case "loom":
      shadow(ctx, X + 8, Y + 14.8, 6, 1.8);
      blit(ctx, machineSprite(o.t, o.item && o.left > 0 && (o.t === "jar" || o.t === "loom") ? o.item : null), X, Y);
      break;
    default: break;
  }
  if (o.item && o.left <= 0 && ["jar", "keg", "press", "loom"].includes(o.t)) bubble(ctx, X + 8, Y - 9 + Math.sin(time / 250) * 1.2, o.item);
}

function bubble(ctx, x, y, item) {
  ctx.fillStyle = "rgba(28,18,34,.9)"; ctx.beginPath(); ctx.arc(x, y, 6.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.arc(x, y, 5.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 2, y + 5); ctx.lineTo(x, y + 8); ctx.lineTo(x + 2, y + 5); ctx.fill();
  ctx.save(); ctx.translate(x - 4.2, y - 4.2); ctx.scale(0.52, 0.52); drawIconRaw(ctx, item, 0); ctx.restore();
}

/* ================= Bâtiments ================= */

function planks(g, x, y, w, h, c, step = 4) {
  rect(g, x, y, w, h, c);
  for (let k = 0; k * step < h; k++) {
    rect(g, x, y + k * step, w, 0.6, shade(c, -0.22));
    rect(g, x, y + k * step + 0.6, w, 0.5, shade(c, 0.18));
    const off = (k % 2) * 9;
    for (let s = off; s < w; s += 18) rect(g, x + s, y + k * step, 0.5, step, shade(c, -0.18));
  }
}
function shingles(g, pts, base, rows, season) {
  g.save(); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  rect(g, x0, y0, x1 - x0, y1 - y0, base);
  const step = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y0 + r * step;
    for (let x = x0 - ((r % 2) * 3); x < x1; x += 6) {
      g.fillStyle = shade(base, (r % 2 ? -0.08 : 0.04) + hash(x, r) * 0.08 - 0.04);
      g.beginPath(); g.roundRect(x, yy, 6, step + 1, [0, 0, 2.5, 2.5]); g.fill();
      rect(g, x, yy + step - 0.5, 6, 0.6, shade(base, -0.3));
    }
  }
  if (season === 3) { for (let r = 0; r < rows; r += 1) rect(g, x0, y0 + r * step, x1 - x0, step * 0.45, "rgba(250,252,255,.85)"); }
  g.restore();
}
function window_(g, x, y, w, h, night, box, season) {
  rect(g, x - 1, y - 1, w + 2, h + 2, "#f4ecd8");
  const gl = g.createLinearGradient(x, y, x + w, y + h);
  if (night) { gl.addColorStop(0, "#ffe08a"); gl.addColorStop(1, "#ffb84a"); } else { gl.addColorStop(0, "#bfe8ff"); gl.addColorStop(1, "#5a9ac8"); }
  g.fillStyle = gl; g.fillRect(x, y, w, h);
  rect(g, x + w / 2 - 0.4, y, 0.8, h, "#f4ecd8"); rect(g, x, y + h / 2 - 0.4, w, 0.8, "#f4ecd8");
  if (!night) line(g, x + 1, y + h - 1.5, x + w / 2 - 1.5, y + 1, "rgba(255,255,255,.7)", 0.7);
  if (box) {
    rect(g, x - 1.5, y + h + 1, w + 3, 2.6, "#8a5a2c");
    if (season < 3) for (let k = 0; k < 5; k++) circle(g, x + k * (w / 4), y + h + 0.6, 1.1, season === 2 ? "#e88a2a" : ["#ff6a8a", "#ffd23a", "#ff9ad0", "#ffffff", "#b8a0ff"][k]);
  }
}

function buildingSprite(b, built, season, night) {
  const W = b.w * T, H = b.h * T;
  const extra = { house: 30, shop: 14, coop: 18, barn: 22, well: 18, board: 10, bin: 4 }[b.id] ?? 0;
  return sprite(`bld|${b.id}|${built}|${season}|${night}`, W + 8, H + extra + 2, 4, extra, (g) => {
    g.translate(4, extra);
    switch (b.id) {
      case "house": {
        rect(g, 2, 50, W - 4, 14, "#7e7a76");
        for (let k = 0; k < 12; k++) rrect(g, 3 + k * 7.6 + (k % 2), 52 + (k % 2) * 5, 7, 4.5, 1, k % 3 ? "#9a958e" : "#8a857e");
        planks(g, 4, 22, W - 8, 30, "#e2cfa6", 3.6);
        rect(g, 4, 22, 3, 30, "#c8b086"); rect(g, W - 7, 22, 3, 30, "#c8b086");
        // Toit
        shingles(g, [[-3, 26], [W / 2, -26], [W + 3, 26]], "#8a2e5a", 9, season);
        poly(g, [[-3, 26], [W / 2, -26], [W / 2, -22], [1, 26]], "rgba(255,255,255,.12)");
        rect(g, -4, 24.5, W + 8, 3, "#5a1a3c");
        rect(g, 8, 28, W - 16, 1.2, "#00f0ff");
        // Cheminée
        rect(g, W - 26, -12, 10, 22, "#9a5a44"); for (let k = 0; k < 5; k++) rect(g, W - 26, -12 + k * 4.4, 10, 0.6, "#6a3a2a");
        rect(g, W - 27.5, -14, 13, 3, "#6a3a2a");
        if (season === 3) rect(g, W - 27.5, -15.5, 13, 2, "#fff");
        // Porte et porche
        rect(g, 31, 34, 18, 18, "#5a3018"); rect(g, 32.5, 35.5, 15, 16.5, "#8a4e26");
        for (let k = 0; k < 3; k++) rect(g, 34 + k * 4.5, 37, 3, 13, "#7a4220");
        circle(g, 45, 44, 1, "#ffd23a");
        rect(g, 29, 32, 22, 2.6, "#5a3018");
        rect(g, 28, 52, 24, 3, "#a8a29a"); rect(g, 30, 55, 20, 3, "#8a857e");
        circle(g, 54, 36, 2, night ? "#ffd86a" : "#c8a040"); rect(g, 53.4, 33, 1.2, 1.5, "#3a2a1a");
        window_(g, 10, 34, 14, 11, night, true, season);
        window_(g, 62, 34, 14, 11, night, true, season);
        window_(g, W / 2 - 5, 4, 10, 9, night, false, season);
        break;
      }
      case "well":
        ellipse(g, 8, 12, 8.5, 5, "#6a6e76");
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; rrect(g, 8 + Math.cos(a) * 6.5 - 2, 12 + Math.sin(a) * 3.8 - 1.4, 4, 2.8, 0.8, k % 2 ? "#9aa0a8" : "#8a9098"); }
        ellipse(g, 8, 11, 5, 2.6, "#123a6a"); ellipse(g, 7, 10.5, 2, 0.8, "#3a7ac8");
        rect(g, 0.5, -10, 2, 20, "#6a4022"); rect(g, 13.5, -10, 2, 20, "#6a4022");
        rect(g, 1, -6, 14, 1, "#4a2c16"); line(g, 8, -6, 8, 3, "#8a6a4a", 0.5); rrect(g, 6, 2, 4, 3.4, 0.6, "#8a5a2c");
        shingles(g, [[-4, -6], [8, -17], [20, -6]], "#9a3a2a", 3, season);
        break;
      case "bin":
        rect(g, 0.5, 2, W - 1, H - 2, "#7a4a24");
        for (let k = 0; k < 3; k++) rect(g, 1 + k * 10.5, 3, 9.5, H - 4, k % 2 ? "#9a6232" : "#8e5a2c");
        rrect(g, -1, -3, W + 2, 6, 1.5, "#a8743a"); rect(g, -1, -3, W + 2, 1.4, "#d4a060");
        rect(g, W / 2 - 3, -1, 6, 3, "#ffd23a"); rect(g, W / 2 - 1.5, 0, 3, 1, "#8a6a1a");
        break;
      case "board":
        rect(g, 3, 10, 3, 22, "#6a4022"); rect(g, W - 6, 10, 3, 22, "#6a4022");
        rect(g, -1, -2, W + 2, 22, "#7a4a24"); planks(g, 1, 0, W - 2, 18, "#a8743a", 4.5);
        shingles(g, [[-3, 0], [W / 2, -9], [W + 3, 0]], "#5a3a5a", 2, season);
        rect(g, 4, 3, 9, 10, "#f4ecd8"); for (let k = 0; k < 4; k++) rect(g, 5.5, 5 + k * 2, 6, 0.6, "#8a8070");
        rect(g, 16, 4, 10, 9, "#ffe8a8"); for (let k = 0; k < 3; k++) rect(g, 17.5, 6 + k * 2, 7, 0.6, "#8a7050");
        circle(g, 8.5, 3.5, 0.9, "#c83a3a"); circle(g, 21, 4.5, 0.9, "#3a7ac8");
        break;
      case "shop": {
        rect(g, 2, 14, W - 4, H - 14, "#4a3a5a");
        planks(g, 3, 16, W - 6, 18, "#6a5a7a", 4);
        // Étal et produits
        rect(g, 1, 30, W - 2, 12, "#9a6a34"); rect(g, 1, 30, W - 2, 2, "#d0984e");
        for (let k = 0; k < 4; k++) {
          const cx = 10 + k * 19;
          rect(g, cx - 7, 25, 14, 6, "#b8844a"); rect(g, cx - 7, 25, 14, 1, "#e0b070");
          const col = ["#ff6a3a", "#ffd23a", "#7ad86a", "#ff3355"][k];
          for (let j = 0; j < 4; j++) circle(g, cx - 4.5 + j * 3, 24.5 - (j % 2), 2, col);
        }
        // Robin
        circle(g, 54, 18, 4, "#f0c8a0"); rect(g, 50, 21.5, 8, 4, "#3a8ac8"); poly(g, [[49.5, 17], [54, 12], [58.5, 17]], "#ff7a1a"); circle(g, 52.5, 18, 0.6, "#000"); circle(g, 55.5, 18, 0.6, "#000");
        // Auvent
        rect(g, -2, -2, W + 4, 4, season === 3 ? "#f4f8fc" : "#2a1a3a");
        for (let k = 0; k < 10; k++) {
          g.fillStyle = k % 2 ? "#ff2bd6" : "#00f0ff";
          g.beginPath(); g.moveTo(k * 8, 2); g.lineTo(k * 8 + 8, 2); g.lineTo(k * 8 + 8, 12); g.arc(k * 8 + 4, 12, 4, 0, Math.PI); g.closePath(); g.fill();
          rect(g, k * 8, 2, 8, 1.4, "rgba(255,255,255,.35)");
        }
        rrect(g, W / 2 - 14, -11, 28, 8, 1.5, "#1a1028"); g.fillStyle = "#fcee0a"; g.font = "bold 6px Rajdhani, system-ui, sans-serif"; g.textAlign = "center"; g.fillText("ROBIN", W / 2, -4.8);
        break;
      }
      case "coop": case "barn": {
        if (!built) {
          rect(g, 0, 6, W, H - 6, "#7a7064");
          for (let k = 0; k < b.w * 2; k++) for (let j = 0; j < (b.h - 1) * 2; j++) rrect(g, k * 8 + 0.5, 6.5 + j * 8, 7, 7, 1, (k + j) % 2 ? "#958a7c" : "#8a8072");
          for (const [x, y] of [[2, 4], [W - 4, 4], [2, H - 3], [W - 4, H - 3]]) { rect(g, x, y - 6, 2, 8, "#8a5a2c"); }
          line(g, 3, -1, W - 3, -1, "#e8d060", 0.5);
          rect(g, W / 2 - 1, -12, 2, 18, "#6a4022");
          rrect(g, W / 2 - 13, -16, 26, 11, 1.5, "#e8d6a0"); rect(g, W / 2 - 9, -13, 18, 0.8, "#6a4a2a"); rect(g, W / 2 - 7, -10, 14, 0.8, "#6a4a2a");
          break;
        }
        const wall = b.id === "barn" ? "#b8362a" : "#d89c4a";
        planks(g, 2, 8, W - 4, H - 8, wall, 4);
        rect(g, 2, 8, 2.5, H - 8, "#f4ecd8"); rect(g, W - 4.5, 8, 2.5, H - 8, "#f4ecd8");
        const peak = b.id === "barn" ? -22 : -18;
        shingles(g, [[-4, 12], [W / 2, peak], [W + 4, 12]], b.id === "barn" ? "#4a3a44" : "#6a3a2a", 6, season);
        rect(g, -5, 10.5, W + 10, 2.6, "#f4ecd8");
        const dw = b.id === "barn" ? 26 : 14;
        rect(g, W / 2 - dw / 2 - 1.5, H - 22, dw + 3, 22, "#f4ecd8");
        rect(g, W / 2 - dw / 2, H - 20.5, dw, 20.5, "#6a2a1a");
        g.strokeStyle = "#f4ecd8"; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(W / 2 - dw / 2, H - 20.5); g.lineTo(W / 2 + dw / 2, H); g.moveTo(W / 2 + dw / 2, H - 20.5); g.lineTo(W / 2 - dw / 2, H); g.stroke();
        if (b.id === "barn") rect(g, W / 2 - 0.5, H - 20.5, 1, 20.5, "#f4ecd8");
        window_(g, 8, 16, 9, 8, night, false, season);
        if (b.id === "barn") {
          window_(g, W / 2 - 5, -6, 10, 8, night, false, season);
          rect(g, W - 4, -18, 14, H + 18, "#8f969e"); for (let k = 0; k < 9; k++) rect(g, W - 4, -16 + k * 9, 14, 0.8, "#6a7078");
          ellipse(g, W + 3, -18, 7, 4.5, season === 3 ? "#ffffff" : "#5a6068"); rect(g, W - 2, -14, 2, H + 14, "rgba(255,255,255,.25)");
        }
        break;
      }
      default: break;
    }
  });
}

export function drawBuilding(ctx, b, state, season, time, night) {
  const s = buildingSprite(b, !!state.built, season, night);
  blit(ctx, s, b.x * T, b.y * T);
  const X = b.x * T, Y = b.y * T, W = b.w * T;
  if (b.id === "house" && season !== 3) {
    ctx.save(); ctx.globalAlpha = 0.35;
    for (let k = 0; k < 3; k++) { const p = ((time / 2400 + k / 3) % 1); circle(ctx, X + W - 21 + Math.sin(p * 6 + k) * 3, Y - 16 - p * 22, 2.2 + p * 3, "#d8d8e0"); }
    ctx.restore();
  }
  if (b.id === "bin" && state.binCount) { const p = 0.6 + 0.3 * Math.sin(time / 300); ctx.globalAlpha = p; circle(ctx, X + W - 2, Y - 6, 2.4, "#3dff8f"); ctx.globalAlpha = 1; }
  if (b.id === "board" && state.requestOpen) {
    const bob = Math.sin(time / 250) * 1.5;
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.roundRect(X + W / 2 - 2.6, Y - 24 + bob, 5.2, 12, 1.5); ctx.fill();
    rect(ctx, X + W / 2 - 1.5, Y - 23 + bob, 3, 7, "#fcee0a"); rect(ctx, X + W / 2 - 1.5, Y - 15 + bob, 3, 2.4, "#fcee0a");
  }
  if (b.id === "shop" && !state.shopOpen) { ctx.fillStyle = "rgba(10,6,20,.45)"; ctx.fillRect(X, Y, W, b.h * T); }
}

/* ================= Fermier ================= */

function farmerSprite(face, frame) {
  return sprite(`farmer|${face}|${frame}`, 16, 28, 0, 12, (g) => {
    const x = 8, y = 26;
    const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    const side = face === 1 || face === 3;
    // Jambes et bottes
    const lA = side ? step * 1.5 : 0, lB = side ? -step * 1.5 : 0;
    const lyA = side ? 0 : Math.max(0, step), lyB = side ? 0 : Math.max(0, -step);
    rect(g, x - 3 + lA, y - 7, 2.6, 6 - lyA, "#2a3a6a"); rect(g, x + 0.4 + lB, y - 7, 2.6, 6 - lyB, "#22305a");
    rrect(g, x - 3.4 + lA, y - 1.8 - lyA, 3.2, 1.9, 0.6, "#4a2a1a"); rrect(g, x + 0.2 + lB, y - 1.8 - lyB, 3.2, 1.9, 0.6, "#3a2010");
    // Corps
    rrect(g, x - 4.4, y - 15.5, 8.8, 9, 2, "#00a8c8");
    rect(g, x - 4.4, y - 8.6, 8.8, 1.4, "#6a3a1a"); rect(g, x - 0.8, y - 8.6, 1.6, 1.4, "#ffd23a");
    rect(g, x - 2.4, y - 15.5, 4.8, 1.4, "#0a6a8a");
    if (face !== 0) { rect(g, x - 3.6, y - 14, 1, 5, "rgba(255,255,255,.25)"); }
    // Bras
    const arm = side ? 0 : step * 1.2;
    if (!side) { rrect(g, x - 6, y - 14.6 + arm, 2, 6.5, 1, "#0090b0"); rrect(g, x + 4, y - 14.6 - arm, 2, 6.5, 1, "#0090b0"); circle(g, x - 5, y - 8 + arm, 1.1, "#f0c8a0"); circle(g, x + 5, y - 8 - arm, 1.1, "#f0c8a0"); }
    else { const d = face === 1 ? 1 : -1; rrect(g, x - 1 + d * step * 1.2, y - 14.6, 2.2, 6.5, 1, "#0090b0"); circle(g, x + d * step * 1.2, y - 8, 1.1, "#f0c8a0"); }
    // Tête
    circle(g, x, y - 19.5, 4.6, "#f0c8a0");
    if (face === 0) { circle(g, x, y - 20, 4.7, "#6a3018"); }
    else if (face === 2) {
      g.fillStyle = "#6a3018"; g.beginPath(); g.arc(x, y - 20.5, 4.8, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      rect(g, x - 2.4, y - 19.6, 1.2, 1.6, "#2a1a1a"); rect(g, x + 1.2, y - 19.6, 1.2, 1.6, "#2a1a1a");
      circle(g, x - 2.9, y - 17.4, 0.9, "rgba(255,120,120,.45)"); circle(g, x + 2.9, y - 17.4, 0.9, "rgba(255,120,120,.45)");
      rect(g, x - 0.8, y - 16.9, 1.6, 0.5, "#a0503a");
    } else {
      const d = face === 1 ? 1 : -1;
      g.fillStyle = "#6a3018"; g.beginPath(); g.arc(x - d * 1, y - 20.5, 4.6, 0, Math.PI * 2); g.fill();
      circle(g, x + d * 1.8, y - 19, 3, "#f0c8a0");
      rect(g, x + d * 2.6 - 0.6, y - 19.8, 1.2, 1.6, "#2a1a1a");
      circle(g, x + d * 3, y - 17.4, 0.8, "rgba(255,120,120,.45)");
    }
    // Chapeau de paille
    ellipse(g, x, y - 23, 7.2, 2, "#d8b048"); ellipse(g, x, y - 23.4, 6.6, 1.4, "#ecc860");
    rrect(g, x - 3.6, y - 27.4, 7.2, 4.4, [2.5, 2.5, 0, 0], "#ecc860"); rect(g, x - 3.6, y - 24.4, 7.2, 1.2, "#ff2bd6");
  });
}

const TIER_COLORS = ["#9aa2ac", "#e0864a", "#e4ecf4", "#ffd23a"];

export function drawFarmer(ctx, wx, wy, face, walk, swing, toolId, tier = 0) {
  const frame = walk ? (Math.floor(walk / 2.2) % 4 === 1 ? 1 : Math.floor(walk / 2.2) % 4 === 3 ? 2 : 0) : 0;
  shadow(ctx, wx, wy, 5, 1.8, 0.32);
  const bob = walk && frame ? -0.6 : 0;
  const drawTool = () => {
    if (!(swing > 0 && toolId)) return;
    const base = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][face];
    const ang = base + (0.9 - swing * 1.8) * (face === 3 ? -1 : 1);
    ctx.save(); ctx.translate(wx, wy - 10); ctx.rotate(ang + Math.PI / 4);
    ctx.drawImage(iconCanvas(toolId, tier), 0, -14, 14, 14);
    ctx.restore();
  };
  if (face === 0) drawTool();
  const s = farmerSprite(face, frame);
  blit(ctx, s, wx - 8, wy - 14 + bob);
  if (face !== 0) drawTool();
}

/* ================= Animaux ================= */

function animalSprite(kind, frame) {
  const bird = kind === "poule" || kind === "canard";
  return sprite(`ani|${kind}|${frame}`, bird ? 14 : 22, bird ? 14 : 18, 0, 0, (g) => {
    if (bird) {
      const body = kind === "poule" ? "#f6f2ea" : "#f0e8b0";
      const leg = frame ? 1 : 0;
      line(g, 6, 11, 6 - leg, 13.5, "#e89a2a", 0.7); line(g, 8, 11, 8 + leg, 13.5, "#e89a2a", 0.7);
      ellipse(g, 7, 8.5, 5.2, 3.8, body);
      poly(g, [[2, 8], [0.2, 4.5], [3.5, 6.5]], shade(body, -0.08));
      ellipse(g, 6, 9, 3, 1.8, shade(body, -0.1));
      circle(g, 10.5, 4.6 + (frame ? 0.6 : 0), 2.8, kind === "canard" ? "#3a8a4a" : body);
      poly(g, [[12.8, 4.4 + frame * 0.6], [14.6, 5.2 + frame * 0.6], [12.8, 6 + frame * 0.6]], "#ff9a2a");
      if (kind === "poule") { circle(g, 10, 1.8 + frame * 0.6, 1, "#e8342a"); circle(g, 11.2, 1.6 + frame * 0.6, 1, "#e8342a"); circle(g, 12.6, 6.6 + frame * 0.6, 0.6, "#e8342a"); }
      circle(g, 11.3, 4.2 + frame * 0.6, 0.6, "#1a1a1a");
      return;
    }
    const body = { vache: "#f6f4f0", chevre: "#dccab0", mouton: "#ffffff" }[kind];
    const leg = frame ? 1 : 0;
    for (const [x, d] of [[4, leg], [7, -leg], [14, -leg], [17, leg]]) rect(g, x + d * 0.6, 11, 2, 6, kind === "mouton" ? "#3a3a3a" : shade(body, -0.35));
    ellipse(g, 11, 9, 9, 5.4, body);
    if (kind === "vache") { ellipse(g, 8, 8, 3, 2.4, "#3a2a2a"); ellipse(g, 14, 10.5, 2.4, 1.8, "#3a2a2a"); ellipse(g, 11, 13.4, 2.4, 1.2, "#ffb0c0"); }
    if (kind === "mouton") for (let k = 0; k < 6; k++) circle(g, 4.5 + k * 2.6, 6 + (k % 2) * 1.2, 2.8, k % 2 ? "#f4f4f4" : "#ffffff");
    ellipse(g, 11, 11, 7, 2.6, "rgba(0,0,0,.06)");
    const hx = 19.5, hy = 6 + (frame ? 0.5 : 0);
    ellipse(g, hx, hy, 3.6, 3.2, kind === "mouton" ? "#3a3a3a" : body);
    ellipse(g, hx + 2, hy + 1.6, 1.8, 1.3, kind === "vache" ? "#ffb0c0" : shade(body, -0.15));
    circle(g, hx + 0.6, hy - 0.8, 0.65, kind === "mouton" ? "#fff" : "#1a1a1a");
    ellipse(g, hx - 2.6, hy - 2.2, 1.8, 0.9, kind === "mouton" ? "#2a2a2a" : shade(body, -0.12), -0.5);
    if (kind === "chevre") { line(g, hx - 1, hy - 2.8, hx - 3, hy - 6, "#8a7a6a", 0.9); line(g, hx + 0.5, hy - 2.8, hx - 1, hy - 6.4, "#8a7a6a", 0.9); poly(g, [[hx + 1, hy + 3], [hx + 2, hy + 6], [hx + 3, hy + 3]], "#c8b898"); }
    if (kind === "vache") { line(g, hx - 1.4, hy - 2.8, hx - 2.6, hy - 4.4, "#e8e0c8", 0.8); line(g, hx + 1, hy - 2.8, hx + 2, hy - 4.6, "#e8e0c8", 0.8); }
    line(g, 2.4, 7, 0.6, 10 + (frame ? 0.8 : 0), shade(body, -0.3), 0.8);
  });
}

export function drawAnimal(ctx, kind, wx, wy, flip, t, ready) {
  const bird = kind === "poule" || kind === "canard";
  const frame = Math.floor(t / 260) % 2;
  shadow(ctx, wx, wy, bird ? 4.5 : 8.5, bird ? 1.4 : 2.2, 0.26);
  const s = animalSprite(kind, frame);
  const w = bird ? 14 : 22, h = bird ? 14 : 18;
  blit(ctx, s, wx - w / 2, wy - h + 0.5, flip ? { flip: true, px: w / 2, py: h } : null);
  if (ready) {
    const b = Math.sin(t / 250) * 1.5;
    const y = wy - h - 6 + b;
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(wx, y, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.arc(wx, y, 3.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff4a7a"; ctx.beginPath(); ctx.moveTo(wx, y + 2); ctx.bezierCurveTo(wx - 3.6, y - 0.6, wx - 1.6, y - 3.4, wx, y - 1.4); ctx.bezierCurveTo(wx + 1.6, y - 3.4, wx + 3.6, y - 0.6, wx, y + 2); ctx.fill();
  }
}

/* ================= Icônes d'objets ================= */

const iconCache = new Map();
// Icône 16 × 16 (×4) avec contour, mise en cache.
export function iconCanvas(id, tier = 0) {
  const key = `${id}|${tier}`;
  let c = iconCache.get(key);
  if (c) return c;
  const raw = document.createElement("canvas");
  raw.width = 72; raw.height = 72;
  const g = raw.getContext("2d");
  g.scale(4, 4); g.translate(1, 1);
  drawIconRaw(g, id, tier);
  c = outlineCanvas(raw, 2.6);
  iconCache.set(key, c);
  return c;
}
export function drawIcon(ctx, id, tier = 0) { ctx.drawImage(iconCanvas(id, tier), -1, -1, 18, 18); }

function drawIconRaw(g, id, tier = 0) {
  const info = itemInfo(id);
  if (!info) return;
  const c = info.color ?? "#ccc";
  const metal = TIER_COLORS[tier] ?? TIER_COLORS[0];
  const handle = "#8a5a2c", handleL = "#b8844a";
  const stick = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, handle, 1.8); line(g, x0 - 0.3, y0 - 0.3, x1 - 0.3, y1 - 0.3, handleL, 0.5); };
  switch (id) {
    case "hoe": stick(3, 14, 12, 4); poly(g, [[9, 1.5], [15, 2], [14.5, 5], [10.5, 4.5]], metal); rect(g, 10, 2, 4, 0.7, "rgba(255,255,255,.5)"); break;
    case "axe": stick(3.5, 14.5, 11.5, 2.5); poly(g, [[9.5, 2], [14.5, 1], [15.5, 7], [11, 6.5]], metal); line(g, 14.5, 1.5, 15.2, 6.5, "rgba(255,255,255,.6)", 0.6); break;
    case "pick": stick(8, 15, 8, 4); g.strokeStyle = metal; g.lineWidth = 2.2; g.lineCap = "round"; g.beginPath(); g.arc(8, 10, 7, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 0.6; g.beginPath(); g.arc(8, 10, 7.5, Math.PI * 1.25, Math.PI * 1.7); g.stroke(); break;
    case "scythe": stick(4, 15, 9, 2); g.strokeStyle = "#d8e0e8"; g.lineWidth = 1.8; g.beginPath(); g.arc(14, 7, 6, Math.PI * 0.62, Math.PI * 1.22); g.stroke(); break;
    case "can": rrect(g, 2.5, 6, 9.5, 8.5, 1.5, metal); rect(g, 3, 7, 2, 6, "rgba(255,255,255,.35)"); poly(g, [[11.5, 9], [15, 5], [15.8, 6], [12.5, 11]], metal); g.strokeStyle = shade(metal, -0.3); g.lineWidth = 1.3; g.beginPath(); g.arc(7, 6, 3, Math.PI, 0); g.stroke(); break;
    case "bois": rrect(g, 1.5, 6, 12, 6.5, 2, "#8a5a2c"); ellipse(g, 13, 9.2, 2.4, 3.2, "#d4a060"); ellipse(g, 13, 9.2, 1.2, 1.6, "#a8743a"); rect(g, 2, 7.5, 9, 0.6, "#6a4022"); rect(g, 2, 10, 9, 0.6, "#6a4022"); break;
    case "pierre": ellipse(g, 8, 10, 6, 4.5, "#7a808a"); ellipse(g, 7, 9, 4.4, 3.2, "#a2a8b0"); ellipse(g, 5.5, 7.8, 1.6, 0.9, "#ccd2d8"); break;
    case "fibre": for (let k = 0; k < 5; k++) { g.strokeStyle = k % 2 ? "#5ab84a" : "#3a9a3a"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(5 + k * 1.5, 15); g.quadraticCurveTo(4 + k * 2, 8, 2 + k * 3, 2); g.stroke(); } break;
    case "cuivre": case "fer": case "or": ellipse(g, 8, 10, 6.2, 4.6, "#5e5650"); ellipse(g, 7.4, 9.2, 4.8, 3.4, "#7e766e"); for (const [x, y] of [[5, 8.5], [9.5, 10.5], [8.5, 6.8]]) { poly(g, [[x, y - 1.6], [x + 1.5, y], [x, y + 1.6], [x - 1.5, y]], c); circle(g, x - 0.3, y - 0.5, 0.45, "#fff"); } break;
    case "oeuf": case "oeufcanard": ellipse(g, 8, 9, 4.8, 6, c); ellipse(g, 6.4, 6.6, 1.4, 2, "rgba(255,255,255,.8)"); if (id === "oeufcanard") for (let k = 0; k < 3; k++) circle(g, 7 + k * 1.5, 10 + (k % 2), 0.5, "#8ab88a"); break;
    case "lait": case "laitchevre": rrect(g, 4.5, 5, 7, 10.5, 1.5, "#f8f8ff"); rect(g, 5.5, 2, 5, 3.4, "#e0e4f0"); rect(g, 5, 1, 6, 1.4, id === "lait" ? "#3a8ac8" : "#c87a3a"); rect(g, 4.5, 9, 7, 3.4, id === "lait" ? "#3a8ac8" : "#c87a3a"); rect(g, 5.4, 5.5, 1, 9, "rgba(255,255,255,.8)"); break;
    case "laine": for (let k = 0; k < 6; k++) circle(g, 4 + (k % 3) * 4, 6.5 + Math.floor(k / 3) * 4, 3.4, k % 2 ? "#ffffff" : "#ececec"); break;
    case "tissu": rrect(g, 1.5, 4, 13, 9, 1, c); for (let k = 0; k < 4; k++) rect(g, 1.5, 5.5 + k * 2.2, 13, 0.6, "#a8a0e0"); rect(g, 12, 4, 2.5, 9, "#a8a0e0"); break;
    case "fromage": case "chevrotin": poly(g, [[1.5, 13], [14.5, 13], [14.5, 6], [6, 6]], c); poly(g, [[1.5, 13], [6, 6], [14.5, 6], [10, 4]], shade(c, 0.25)); circle(g, 11, 10, 1.1, shade(c, -0.25)); circle(g, 6, 11, 0.8, shade(c, -0.25)); break;
    case "mayo": case "mayocanard": rrect(g, 3.5, 4, 9, 11, 2, "rgba(220,240,255,.95)"); rrect(g, 4.5, 7, 7, 7, 1.5, c); rect(g, 3.5, 2.5, 9, 2.4, "#3a8ac8"); rect(g, 5, 4.5, 1, 9, "rgba(255,255,255,.8)"); break;
    case "engrais": case "engraisplus": case "accel": poly(g, [[3, 4], [13, 4], [14, 15], [2, 15]], "#c8a878"); rect(g, 3, 3, 10, 2.4, "#8a6a4a"); circle(g, 8, 10, 3, c); rect(g, 3.5, 6, 1, 8, "rgba(255,255,255,.35)"); break;
    case "epouvantail": rect(g, 7.2, 4, 1.6, 12, handle); rect(g, 2.5, 8, 11, 1.6, handle); circle(g, 8, 4.5, 3.2, "#e8a040"); ellipse(g, 8, 2, 5, 1.2, "#7a4ab0"); rect(g, 5.5, -0.5, 5, 2.4, "#7a4ab0"); break;
    case "arroseur": case "arroseur2": case "arroseur3": { const k = id === "arroseur" ? "#c8d0dc" : id === "arroseur2" ? "#ffd23a" : "#ff5ae0"; ellipse(g, 8, 13, 5.5, 2.6, "#4a5058"); rect(g, 6.8, 5, 2.4, 8, k); ellipse(g, 8, 5, 3.4, 1.7, k); ellipse(g, 7.4, 4.6, 1.6, 0.7, "#fff"); break; }
    case "bocal": rrect(g, 3, 4, 10, 11, 2, "rgba(200,235,255,.9)"); rect(g, 2.5, 2.5, 11, 2.6, "#c8943a"); line(g, 4.5, 6, 4.5, 13, "rgba(255,255,255,.8)", 0.8); break;
    case "fut": poly(g, [[3, 2], [13, 2], [14, 8.5], [13, 15], [3, 15], [2, 8.5]], "#8a5a2c"); rect(g, 2.2, 4.5, 11.6, 1.1, "#4a4a52"); rect(g, 2.2, 11.5, 11.6, 1.1, "#4a4a52"); for (let k = 0; k < 3; k++) rect(g, 5 + k * 3, 2.5, 0.5, 12, "#6a4022"); break;
    case "presse": rect(g, 2.5, 8, 11, 7.5, "#a8743a"); rect(g, 2.5, 8, 11, 1.4, "#d0984e"); rect(g, 7.2, 1, 1.6, 8, "#6a7078"); rect(g, 3.5, 1, 9, 1.6, "#4a5058"); break;
    case "metier": rect(g, 2, 2, 1.8, 13, handle); rect(g, 12.2, 2, 1.8, 13, handle); rect(g, 2, 2, 12, 1.6, handleL); rect(g, 4, 5, 8, 6.5, "#ece4d4"); break;
    default:
      if (info.cat === "seed") {
        poly(g, [[3, 3], [13, 3], [13.5, 15], [2.5, 15]], "#efe0bc"); rect(g, 3, 3, 10, 2.6, "#a8844a"); for (let k = 0; k < 5; k++) rect(g, 3.5 + k * 2, 2.2, 1, 1.4, "#a8844a");
        circle(g, 8, 10.5, 3.4, c); circle(g, 7, 9.5, 1.1, shade(c, 0.5)); leaf(g, 8, 7.5, 3.4, 1.3, -1.9, "#3a9a3a");
      } else if (info.cat === "artisan") {
        if (id.startsWith("wine:")) { rect(g, 6.2, 0.5, 3.6, 4.5, "#1e3a26"); rrect(g, 4, 4.5, 8, 11, 2, "#1e3a26"); rrect(g, 5, 7.5, 6, 5, 1, c); rect(g, 5, 5, 1, 9, "rgba(255,255,255,.35)"); rect(g, 6, 0.2, 4, 1.4, "#c8a040"); }
        else { rrect(g, 3, 4, 10, 11, 2, "rgba(220,240,255,.95)"); rrect(g, 4, 6.5, 8, 7.5, 1.5, c); rect(g, 2.5, 2.4, 11, 2.6, "#c8943a"); rect(g, 5, 9, 6, 3, "#f4ecd8"); }
      } else if (info.cat === "forage") {
        if (/morille|girolle/.test(id)) { rect(g, 6.5, 9, 3, 6, "#f0e0c0"); ellipse(g, 8, 8, 5.5, 4.2, c); ellipse(g, 6.5, 6.6, 1.8, 1, shade(c, 0.4)); }
        else if (/cristal/.test(id)) { poly(g, [[8, 1], [13, 7], [8, 15], [3, 7]], c); poly(g, [[8, 1], [8, 15], [3, 7]], shade(c, 0.35)); }
        else if (/houx/.test(id)) { leaf(g, 8, 9, 7, 2.6, -2.6, "#2a7a3a"); leaf(g, 8, 9, 7, 2.6, -0.5, "#3a9a4a"); for (let k = 0; k < 3; k++) circle(g, 7 + k * 1.6, 9 + (k % 2), 1.5, c); }
        else if (/poireau|racine/.test(id)) { ellipse(g, 8, 11, 3.2, 4, c); leaf(g, 8, 7, 7, 1.6, -1.7, "#4ab04a"); leaf(g, 8, 7, 6, 1.6, -1.2, "#3a9a3a"); }
        else if (/jonquille|pois/.test(id)) { line(g, 8, 15, 8, 6, "#3a9a3a", 1); for (let p = 0; p < 6; p++) ellipse(g, 8 + Math.cos(p) * 2.4, 5 + Math.sin(p) * 2.4, 1.8, 1.1, c, p); circle(g, 8, 5, 1.4, "#ff9a2a"); }
        else { circle(g, 6, 10, 3.2, c); circle(g, 10.4, 9.2, 3.2, c); circle(g, 8, 6, 2.8, c); circle(g, 5, 8.8, 1, shade(c, 0.5)); leaf(g, 8, 4, 4, 1.6, -1.2, "#3a9a3a"); }
      } else {
        const crop = cropById(info.crop);
        const hl = shade(c, 0.5);
        if (crop?.shape === "root") { leaf(g, 8, 6, 6, 1.6, -2, "#3fae4a"); leaf(g, 8, 6, 6, 1.6, -1.2, "#2a8a3a"); ellipse(g, 8, 10.5, 4.4, 4.8, c); ellipse(g, 6.6, 9, 1.4, 1.8, hl); line(g, 8, 15, 8.5, 16, shade(c, -0.3), 0.6); }
        else if (crop?.shape === "flower") { line(g, 8, 15, 8, 8, "#2a8a3a", 1); leaf(g, 8, 12, 4, 1.4, -0.6, "#3fae4a"); for (let p = 0; p < 7; p++) ellipse(g, 8 + Math.cos(p * 0.9) * 3, 6 + Math.sin(p * 0.9) * 3, 2.2, 1.4, c, p * 0.9); circle(g, 8, 6, 1.8, crop.id === "tournesol" ? "#6a3a1a" : "#fff2a0"); }
        else if (crop?.shape === "gourd") { ellipse(g, 8, 10, 7, 5.4, c); g.strokeStyle = shade(c, -0.25); g.lineWidth = 0.5; for (const k of [2, 4.5]) { g.beginPath(); g.ellipse(8, 10, k, 5.2, 0, 0, Math.PI * 2); g.stroke(); } ellipse(g, 5, 8, 2, 1.2, hl); rect(g, 7.3, 3, 1.4, 2.6, "#5a7a2a"); }
        else if (crop?.shape === "bush") { for (const [x, y] of [[5.5, 10], [10.5, 10], [8, 6]]) { circle(g, x, y, 3.3, c); circle(g, x - 1, y - 1, 1, hl); } leaf(g, 8, 3.5, 3.6, 1.4, -1.1, "#3a9a3a"); }
        else if (crop?.shape === "tall") { ellipse(g, 8, 9, 3.6, 6.4, c); for (let k = 0; k < 4; k++) rect(g, 6.2, 5 + k * 2.6, 3.6, 0.5, shade(c, -0.2)); leaf(g, 8, 15, 7, 2, -1.9, "#3fae4a"); leaf(g, 8, 15, 6, 2, -1.2, "#2a8a3a"); }
        else if (crop?.shape === "leafy") { for (let k = 0; k < 5; k++) leaf(g, 8, 13, 6, 2.4, -Math.PI + 0.4 + k * 0.6, k % 2 ? "#2f8a3a" : "#45a64a"); circle(g, 8, 9, 4.2, c); circle(g, 6.8, 7.8, 1.4, hl); }
        else { circle(g, 8, 9.5, 5.5, c); circle(g, 6.2, 7.6, 1.6, hl); leaf(g, 8, 4, 4, 1.6, -1.2, "#3a9a3a"); }
      }
  }
}
