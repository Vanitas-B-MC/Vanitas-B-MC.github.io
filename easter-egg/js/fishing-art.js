// js/fishing-art.js — graphismes de « Grand Bleu » : décors des 6 lieux, eau avec reflets, monde sous la surface,
// pêcheur, poissons, mini-jeu. Tout est dessiné au canvas.
//
// Le ciel et le décor lointain ne changent qu'avec le lieu, le moment de la journée et la météo : ils sont peints une
// fois dans deux canvas cachés, puis réutilisés à chaque image (et retournés pour faire le reflet dans l'eau).
// Coordonnées logiques : 640 × 360, surface de l'eau à y = 214.

import * as F from "./fishing.js";

export const LW = 640, LH = 360, WATER_Y = 214;
export const TRACK = { x: 512, y: 36, w: 36, h: 288 };
const DOCK_END = 190;
const ROD_BASE = { x: 128, y: 168 };

/* ================= Outils ================= */

const hash = (x, y = 0, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function hex(c) {
  if (c.startsWith("rgb")) return c.slice(c.indexOf("(") + 1, -1).split(",").slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255];
}
const rgb = (a) => `rgb(${a.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
export function shade(c, f) { const [r, g, b] = hex(c); const ch = (v) => (f > 0 ? v + (255 - v) * f : v * (1 + f)); return rgb([ch(r), ch(g), ch(b)]); }
function mixA(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function mix(a, b, t) { return rgb(mixA(hex(a), hex(b), t)); }
function circle(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); g.fill(); }
function ellipse(g, x, y, rx, ry, c, rot = 0) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); g.fill(); }
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function poly(g, pts, c) { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
function line(g, x0, y0, x1, y1, c, w = 1) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function glow(g, x, y, r, color, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
// Ligne de crête : bruit doux pour collines et montagnes.
const ridge = (x, seed, amp, freq) => amp * (Math.sin(x * freq + seed) * 0.5 + Math.sin(x * freq * 2.3 + seed * 1.7) * 0.3 + Math.sin(x * freq * 5.1 + seed * 0.3) * 0.2);
function hills(g, base, amp, freq, seed, color, top = 0) {
  g.fillStyle = color; g.beginPath(); g.moveTo(0, WATER_Y + 2);
  for (let x = 0; x <= LW; x += 4) g.lineTo(x, base - Math.abs(ridge(x, seed, amp, freq)) - top);
  g.lineTo(LW, WATER_Y + 2); g.closePath(); g.fill();
}

/* ================= Palettes ================= */

const SKY = {
  dawn:  { top: "#2e3470", mid: "#9a6a9e", hor: "#ffb47a", light: [1, 0.86, 0.78] },
  day:   { top: "#2f7fe0", mid: "#6eb8f2", hor: "#d6efff", light: [1, 1, 1] },
  dusk:  { top: "#241a56", mid: "#b44a78", hor: "#ffa452", light: [1, 0.72, 0.62] },
  night: { top: "#04050e", mid: "#0c1230", hor: "#1c2a52", light: [0.32, 0.36, 0.58] }
};
function skyPal(period, weather) {
  const p = SKY[period];
  const t = weather === "storm" ? 0.65 : weather === "rain" ? 0.45 : weather === "fog" ? 0.5 : 0;
  const to = weather === "fog" ? "#c6cbd4" : period === "night" ? "#10141e" : "#5e6474";
  return { top: t ? mix(p.top, to, t) : p.top, mid: t ? mix(p.mid, to, t) : p.mid, hor: t ? mix(p.hor, to, t * 0.9) : p.hor, light: p.light.map((v) => v * (weather === "storm" ? 0.7 : weather === "rain" ? 0.85 : 1)) };
}
// Couleur d'un élément de décor : assombrie par la lumière, fondue dans l'horizon selon la distance.
function tone(color, depth, pal) {
  const c = mixA(hex(color), hex(pal.hor), depth * 0.75);
  return rgb(c.map((v, i) => v * pal.light[i]));
}

/* ================= Décor pré-rendu ================= */

function paintSky(g, loc, period, weather) {
  const pal = skyPal(period, weather);
  if (loc === "egouts") {
    rect(g, 0, 0, LW, WATER_Y, "#120e18");
    // Briques en perspective, de plus en plus sombres vers le centre du tunnel
    for (let y = 0; y < WATER_Y; y += 12) for (let x = ((y / 12) % 2) * -13; x < LW; x += 26) {
      const d = Math.abs(x + 13 - LW / 2) / (LW / 2);
      g.fillStyle = rgb([34 + d * 22 + hash(x, y) * 10, 24 + d * 12, 38 + d * 16]);
      g.beginPath(); g.roundRect(x + 1, y + 1, 24, 10, 1.5); g.fill();
    }
    const tg = g.createRadialGradient(LW / 2, 130, 10, LW / 2, 130, 260);
    tg.addColorStop(0, "rgba(0,0,0,.85)"); tg.addColorStop(0.45, "rgba(0,0,0,.35)"); tg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = tg; g.fillRect(0, 0, LW, WATER_Y);
    return;
  }
  if (loc === "abysse") {
    const gr = g.createLinearGradient(0, 0, 0, WATER_Y);
    gr.addColorStop(0, "#0a2a5a"); gr.addColorStop(0.5, "#05163a"); gr.addColorStop(1, "#020a1e");
    g.fillStyle = gr; g.fillRect(0, 0, LW, WATER_Y);
    return;
  }
  const gr = g.createLinearGradient(0, 0, 0, WATER_Y);
  gr.addColorStop(0, pal.top); gr.addColorStop(0.55, pal.mid); gr.addColorStop(1, pal.hor);
  g.fillStyle = gr; g.fillRect(0, 0, LW, WATER_Y);
  if ((period === "night" || period === "dusk") && weather !== "storm" && weather !== "rain") {
    for (let k = 0; k < 140; k++) {
      const x = hash(k, 1) * LW, y = hash(k, 2) * 150, s = hash(k, 3);
      g.globalAlpha = (period === "night" ? 0.9 : 0.35) * (0.3 + s * 0.7) * (1 - y / 170);
      circle(g, x, y, 0.4 + s * 0.8, s > 0.9 ? "#ffe8c0" : "#ffffff");
    }
    g.globalAlpha = 1;
    if (period === "night") { // voie lactée
      for (let k = 0; k < 220; k++) { const t = hash(k, 7); const x = t * LW, y = 20 + t * 90 + (hash(k, 8) - 0.5) * 40; g.globalAlpha = 0.12; circle(g, x, y, 1 + hash(k, 9) * 3, "#b8c8ff"); }
      g.globalAlpha = 1;
    }
  }
  glow(g, LW / 2, WATER_Y, 340, rgb(hex(pal.hor)).slice(4, -1), period === "day" ? 0.25 : 0.4);
}

function paintBack(g, loc, period, weather) {
  const pal = skyPal(period, weather);
  const night = period === "night";
  const lit = period === "night" || period === "dusk";
  switch (loc) {
    case "etang": {
      hills(g, 168, 26, 0.012, 1, tone("#5a8a6a", 0.75, pal));
      // La ferme au loin
      const fx = 452, fy = 150;
      poly(g, [[fx, fy], [fx + 12, fy - 10], [fx + 24, fy]], tone("#8a2e5a", 0.6, pal)); rect(g, fx + 2, fy, 20, 9, tone("#e2cfa6", 0.6, pal));
      rect(g, fx + 9, fy + 3, 4, 4, night ? "#ffd86a" : tone("#5a9ac8", 0.6, pal));
      if (night) glow(g, fx + 11, fy + 5, 10, "255,210,120", 0.5);
      hills(g, 186, 22, 0.017, 4, tone("#4e8a4a", 0.45, pal));
      for (let k = 0; k < 16; k++) {
        const x = 200 + k * 30 + hash(k) * 14, s = 12 + hash(k, 2) * 10, by = 196 + hash(k, 3) * 6;
        rect(g, x - 1.5, by - s * 0.3, 3, s * 0.5, tone("#5a3a20", 0.3, pal));
        const c = hash(k, 4) > 0.5 ? "#3a8a4a" : "#2f7a44";
        circle(g, x, by - s * 0.8, s * 0.7, tone(shade(c, -0.25), 0.28, pal));
        circle(g, x - 2, by - s * 0.9, s * 0.55, tone(c, 0.25, pal));
        circle(g, x - s * 0.25, by - s * 1.05, s * 0.28, tone(shade(c, 0.3), 0.25, pal));
      }
      hills(g, 212, 6, 0.05, 9, tone("#3e7a3a", 0.08, pal));
      for (let k = 0; k < 30; k++) { const x = 560 + k * 2.6, h = 18 + hash(k, 5) * 16; line(g, x, 214, x + (hash(k, 6) - 0.5) * 4, 214 - h, tone("#4a7a3a", 0.05, pal), 1.2); if (k % 4 === 0) ellipse(g, x + 0.5, 214 - h + 5, 1.4, 4, tone("#6a4426", 0.05, pal)); }
      break;
    }
    case "riviere": {
      for (const [base, amp, seed, c, d] of [[120, 55, 2, "#6a7a9a", 0.8], [150, 40, 5, "#5a7a7a", 0.6]]) hills(g, base, amp, 0.009, seed, tone(c, d, pal));
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 26; k++) {
          const x = k * 26 + (row * 13) + hash(k, row) * 8, by = 170 + row * 15, s = 16 + hash(k, row + 3) * 14 - row * 2;
          const c = tone(row === 2 ? "#245a34" : "#2e6a3e", 0.55 - row * 0.2, pal);
          poly(g, [[x - s * 0.35, by], [x, by - s * 1.6], [x + s * 0.35, by]], c);
          poly(g, [[x, by - s * 1.6], [x + s * 0.35, by], [x + s * 0.05, by]], tone("#1a4a2a", 0.5 - row * 0.2, pal));
        }
      }
      // Falaise de la cascade (la chute d'eau est animée par-dessus)
      poly(g, [[440, 214], [452, 118], [470, 108], [512, 112], [526, 214]], tone("#6a6a72", 0.25, pal));
      poly(g, [[500, 214], [512, 112], [526, 214]], tone("#4e4e58", 0.25, pal));
      break;
    }
    case "lac": {
      const mtn = (x, w, h, c, d, snow = true) => {
        const pts = [[x - w, 214]];
        for (let k = 0; k <= 10; k++) { const t = k / 10; const px = x - w + t * w * 2; const py = 214 - h * (1 - Math.abs(t - 0.5) * 2) - (hash(k, x) - 0.5) * h * 0.12; pts.push([px, py]); }
        pts.push([x + w, 214]);
        poly(g, pts, tone(c, d, pal));
        poly(g, [[x, 214 - h], [x + w, 214], [x + w * 0.1, 214]], tone(shade(c, -0.18), d, pal));
        if (snow) poly(g, [[x - w * 0.24, 214 - h * 0.74], [x - w * 0.08, 214 - h * 0.8], [x, 214 - h], [x + w * 0.24, 214 - h * 0.74], [x + w * 0.1, 214 - h * 0.7], [x - w * 0.05, 214 - h * 0.76]], tone("#f4f8ff", d * 0.6, pal));
      };
      mtn(150, 170, 150, "#7a86a8", 0.75); mtn(380, 210, 185, "#6a7698", 0.7); mtn(590, 140, 130, "#7a86a8", 0.75);
      mtn(250, 130, 90, "#55627a", 0.45, false); mtn(520, 120, 80, "#55627a", 0.45, false);
      for (let k = 0; k < 40; k++) { const x = k * 17 + hash(k, 1) * 8, s = 10 + hash(k, 2) * 9; poly(g, [[x - s * 0.35, 212], [x, 212 - s * 1.7], [x + s * 0.35, 212]], tone("#1f4a32", 0.25, pal)); }
      // Chalet
      rect(g, 300, 186, 22, 14, tone("#7a4a2a", 0.2, pal)); poly(g, [[296, 187], [311, 175], [326, 187]], tone("#4a2a1a", 0.2, pal));
      rect(g, 306, 190, 5, 5, lit ? "#ffd86a" : tone("#9ac8e8", 0.2, pal)); if (lit) glow(g, 308, 192, 14, "255,200,110", 0.5);
      break;
    }
    case "mer": {
      // Mer jusqu'à l'horizon
      const sea = g.createLinearGradient(0, 176, 0, 214);
      sea.addColorStop(0, tone("#3a6aa0", 0.5, pal)); sea.addColorStop(1, tone("#24508a", 0.2, pal));
      g.fillStyle = sea; g.fillRect(0, 176, LW, 40);
      // Phare sur un rocher
      poly(g, [[30, 186], [44, 172], [70, 170], [88, 186]], tone("#3a3a44", 0.35, pal));
      poly(g, [[52, 172], [55, 128], [63, 128], [66, 172]], tone("#e8e8ee", 0.3, pal));
      for (let k = 0; k < 3; k++) rect(g, 53 + k * 0.6, 140 + k * 12, 12 - k * 1.2, 4, tone("#d0303a", 0.3, pal));
      rect(g, 53, 122, 12, 7, tone("#2a2a34", 0.3, pal)); poly(g, [[52, 122], [59, 114], [66, 122]], tone("#d0303a", 0.3, pal));
      rect(g, 55, 123, 8, 5, lit ? "#fff2a0" : "#a8d8f0");
      // Mégapole
      for (let k = 0; k < 24; k++) {
        const x = 200 + k * 18 + hash(k) * 6, w = 12 + hash(k, 1) * 12, hgt = 30 + hash(k, 2) * 80 + (k === 11 ? 50 : 0);
        const c = tone(k % 2 ? "#2a3050" : "#343a5a", 0.45, pal);
        rect(g, x, 176 - hgt, w, hgt, c);
        rect(g, x + w - 3, 176 - hgt, 3, hgt, tone("#20243c", 0.45, pal));
        if (k === 11) { line(g, x + w / 2, 176 - hgt, x + w / 2, 176 - hgt - 20, c, 1.2); if (lit) circle(g, x + w / 2, 176 - hgt - 20, 1.4, "#ff2a4a"); }
        if (lit) for (let wy = 176 - hgt + 4; wy < 172; wy += 5) for (let wx = x + 2; wx < x + w - 3; wx += 4) if (hash(wx, wy) > 0.45) rect(g, wx, wy, 2, 2.4, hash(wx, wy, 3) > 0.8 ? "rgba(0,240,255,.85)" : "rgba(255,214,130,.8)");
      }
      if (lit) {
        g.shadowBlur = 10;
        for (const [x, y, w, c] of [[300, 110, 34, "#ff2bd6"], [420, 94, 26, "#00f0ff"], [488, 128, 30, "#fcee0a"]]) { g.shadowColor = c; rect(g, x, y, w, 7, c); }
        g.shadowBlur = 0;
        g.font = "bold 6px Rajdhani, system-ui, sans-serif"; g.fillStyle = "#1a0a1a"; g.fillText("NIGHT CITY", 302, 116);
      }
      break;
    }
    case "egouts": {
      // Arches du tunnel
      for (const [cx, r, d] of [[LW / 2, 150, 0.9], [LW / 2, 110, 0.6]]) {
        g.strokeStyle = rgb([60 - d * 30, 44 - d * 20, 64 - d * 30]); g.lineWidth = 14;
        g.beginPath(); g.arc(cx, WATER_Y + 10, r, Math.PI, 0); g.stroke();
      }
      g.fillStyle = "#06040a"; g.beginPath(); g.arc(LW / 2, WATER_Y + 10, 92, Math.PI, 0); g.fill();
      // Tuyaux
      rect(g, 0, 40, LW, 10, "#3a4048"); rect(g, 0, 40, LW, 3, "#5a626c");
      for (let x = 20; x < LW; x += 90) rect(g, x, 38, 6, 14, "#2a3038");
      rect(g, 430, 0, 16, 160, "#3a4048"); rect(g, 430, 0, 4, 160, "#5a626c"); rect(g, 430, 150, 70, 14, "#3a4048"); rect(g, 430, 150, 70, 4, "#5a626c");
      ellipse(g, 498, 157, 3, 7, "#1a1e24");
      // Graffitis et enseignes
      g.font = "bold 22px Rajdhani, system-ui, sans-serif"; g.fillStyle = "rgba(255,43,109,.55)"; g.fillText("V", 92, 170); g.fillStyle = "rgba(0,240,255,.45)"; g.fillText("MC//", 540, 186);
      g.shadowBlur = 12;
      g.shadowColor = "#ff2bd6"; rect(g, 120, 70, 70, 16, "#ff2bd6"); g.fillStyle = "#1a0614"; g.font = "bold 11px Rajdhani, system-ui, sans-serif"; g.fillText("RAMEN 24/7", 124, 82);
      g.shadowColor = "#00f0ff"; rect(g, 0, 58, LW, 2, "#00f0ff");
      g.shadowBlur = 0;
      // Mousse et moisissures lumineuses
      for (let k = 0; k < 50; k++) circle(g, hash(k, 1) * LW, 196 + hash(k, 2) * 18, 1 + hash(k, 3) * 3, hash(k, 4) > 0.8 ? "rgba(106,255,58,.6)" : "#24301e");
      break;
    }
    case "abysse": {
      for (const [x, w, h, d] of [[60, 70, 190, 0.7], [180, 40, 120, 0.85], [470, 60, 170, 0.75], [600, 80, 200, 0.6], [330, 30, 80, 0.9]]) {
        const c = rgb([6 + d * 10, 18 + d * 22, 46 + d * 40]);
        const pts = [[x - w, 214]];
        for (let k = 0; k <= 8; k++) pts.push([x - w * 0.6 + (hash(k, x) - 0.5) * w * 0.4 + k * w * 0.15, 214 - h * (1 - Math.abs(k / 8 - 0.5) * 1.2)]);
        pts.push([x + w, 214]);
        poly(g, pts, c);
      }
      for (let k = 0; k < 70; k++) { const x = hash(k, 3) * LW, y = 120 + hash(k, 4) * 94; circle(g, x, y, 0.8 + hash(k, 5) * 1.5, hash(k, 6) > 0.5 ? "rgba(90,255,208,.8)" : "rgba(58,169,255,.7)"); }
      for (let k = 0; k < 9; k++) { const x = 30 + k * 72 + hash(k) * 20; for (let b = 0; b < 4; b++) { line(g, x + b * 3, 214, x + b * 3 + (hash(k, b) - 0.5) * 10, 186 - hash(k, b + 4) * 20, "rgba(255,43,214,.45)", 1.6); circle(g, x + b * 3 + (hash(k, b) - 0.5) * 10, 186 - hash(k, b + 4) * 20, 1.6, "#ff7ae8"); } }
      break;
    }
  }
}

/* ================= Poissons ================= */

// Dessine un poisson centré en (x, y), de longueur `len`, tourné vers la droite (ou la gauche si flip).
export function drawFish(ctx, shape, color, x, y, len, flip = false, t = 0, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  const L = len, H = len * 0.36;
  const dark = shade(color, -0.4), light = shade(color, 0.5), out = opts.outline === false ? null : "rgba(18,14,30,.9)";
  const lw = Math.max(0.8, L * 0.03);
  const wag = Math.sin(t / 120) * 0.14;
  const body = (path) => {
    const gr = ctx.createLinearGradient(0, -H, 0, H);
    gr.addColorStop(0, dark); gr.addColorStop(0.45, color); gr.addColorStop(1, light);
    ctx.fillStyle = gr; path(); ctx.fill();
    if (out) { ctx.strokeStyle = out; ctx.lineWidth = lw; ctx.stroke(); }
  };
  const fin = (pts, a = 0.85) => { ctx.globalAlpha = a; ctx.fillStyle = shade(color, -0.2); ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill(); if (out) { ctx.strokeStyle = out; ctx.lineWidth = lw * 0.8; ctx.stroke(); } ctx.globalAlpha = 1; };
  const eye = (ex, ey, r) => { circle(ctx, ex, ey, r, "#fff"); if (out) { ctx.strokeStyle = out; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.stroke(); } circle(ctx, ex + r * 0.2, ey, r * 0.58, "#101018"); circle(ctx, ex - r * 0.05, ey - r * 0.3, r * 0.22, "#fff"); };
  switch (shape) {
    case "eel": {
      ctx.lineCap = "round";
      const pts = [];
      for (let k = 0; k <= 12; k++) pts.push([-L / 2 + (L * k) / 12, Math.sin(k * 0.9 + t / 150) * H * 0.32]);
      if (out) { ctx.strokeStyle = out; ctx.lineWidth = H * 0.72 + lw * 2; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); }
      ctx.strokeStyle = color; ctx.lineWidth = H * 0.72; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      ctx.strokeStyle = light; ctx.lineWidth = H * 0.18; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py + H * 0.16) : ctx.moveTo(px, py + H * 0.16))); ctx.stroke();
      eye(L / 2 - H * 0.35, pts[12][1] - H * 0.06, H * 0.16);
      break;
    }
    case "squid": {
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = out ?? dark; ctx.lineWidth = H * 0.2 + lw; ctx.lineCap = "round"; const yy = (k - 2.5) * H * 0.17; ctx.beginPath(); ctx.moveTo(-L * 0.2, yy); ctx.quadraticCurveTo(-L * 0.38, yy * 2 + Math.sin(t / 140 + k) * H * 0.2, -L * 0.55, yy * 1.6); ctx.stroke(); ctx.strokeStyle = shade(color, -0.1); ctx.lineWidth = H * 0.2; ctx.stroke(); }
      body(() => { ctx.beginPath(); ctx.ellipse(L * 0.08, 0, L * 0.36, H * 0.6, 0, 0, Math.PI * 2); });
      fin([[L * 0.38, 0], [L * 0.58, -H * 0.55], [L * 0.52, 0], [L * 0.58, H * 0.55]], 1);
      for (let k = 0; k < 5; k++) circle(ctx, L * (k * 0.1 - 0.08), -H * 0.2 + (k % 2) * H * 0.3, H * 0.07, light);
      eye(-L * 0.12, -H * 0.12, H * 0.17);
      break;
    }
    case "jelly": {
      ctx.globalAlpha = 0.9;
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = light; ctx.lineWidth = Math.max(0.6, L * 0.025); const bx = -L * 0.24 + k * L * 0.095; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.bezierCurveTo(bx + Math.sin(t / 200 + k) * L * 0.08, L * 0.2, bx - Math.sin(t / 230 + k) * L * 0.08, L * 0.35, bx, L * 0.5); ctx.stroke(); }
      const gr = ctx.createRadialGradient(-L * 0.05, -L * 0.12, 1, 0, -L * 0.05, L * 0.32);
      gr.addColorStop(0, light); gr.addColorStop(0.6, color); gr.addColorStop(1, dark);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, L * 0.3, Math.PI, 0); ctx.quadraticCurveTo(0, L * 0.08, -L * 0.3, 0); ctx.fill();
      if (out) { ctx.strokeStyle = out; ctx.lineWidth = lw; ctx.stroke(); }
      ellipse(ctx, -L * 0.1, -L * 0.17, L * 0.07, L * 0.04, "rgba(255,255,255,.7)");
      ctx.globalAlpha = 1;
      break;
    }
    case "crab": {
      ctx.strokeStyle = out ?? dark; ctx.lineCap = "round";
      for (let k = -1; k <= 1; k++) for (const s of [-1, 1]) { ctx.lineWidth = L * 0.05; ctx.beginPath(); ctx.moveTo(s * L * 0.18, k * H * 0.25); ctx.lineTo(s * L * 0.36, k * H * 0.4 + H * 0.15); ctx.lineTo(s * L * 0.42, k * H * 0.4 + H * 0.5); ctx.stroke(); }
      body(() => { ctx.beginPath(); ctx.ellipse(0, 0, L * 0.3, H * 0.55, 0, 0, Math.PI * 2); });
      for (const s of [-1, 1]) { body(() => { ctx.beginPath(); ctx.ellipse(s * L * 0.36, -H * 0.6, L * 0.1, L * 0.07, s * 0.6, 0, Math.PI * 2); }); }
      eye(-L * 0.07, -H * 0.5, H * 0.13); eye(L * 0.07, -H * 0.5, H * 0.13);
      break;
    }
    case "flat": {
      ctx.strokeStyle = out ?? dark; ctx.lineWidth = L * 0.03; ctx.beginPath(); ctx.moveTo(-L * 0.22, 0); ctx.quadraticCurveTo(-L * 0.4, Math.sin(t / 160) * H * 0.3, -L * 0.58, Math.sin(t / 160 + 1) * H * 0.2); ctx.stroke();
      body(() => { ctx.beginPath(); ctx.moveTo(L * 0.34, 0); ctx.bezierCurveTo(L * 0.2, -H * 1.5, -L * 0.1, -H * 1.3, -L * 0.24, 0); ctx.bezierCurveTo(-L * 0.1, H * 1.3, L * 0.2, H * 1.5, L * 0.34, 0); });
      for (let k = 0; k < 6; k++) circle(ctx, L * (0.12 - k * 0.06), (hash(k, L) - 0.5) * H * 1.2, H * 0.08, dark);
      eye(L * 0.16, -H * 0.18, H * 0.13);
      break;
    }
    default: {
      const round = shape === "round", long = shape === "long", shark = shape === "shark";
      const bh = round ? H * 1.4 : long ? H * 0.78 : H;
      // Queue
      ctx.save(); ctx.translate(-L * 0.36, 0); ctx.rotate(wag);
      const ts = shark ? L * 0.24 : L * 0.19;
      fin(shark ? [[0, 0], [-ts * 0.6, -ts], [-ts * 0.2, 0], [-ts * 0.5, ts * 0.6]] : [[0, 0], [-ts, -ts * 0.75], [-ts * 0.7, 0], [-ts, ts * 0.75]], 0.95);
      ctx.restore();
      // Nageoires dorsale et ventrale
      fin(shark ? [[-L * 0.12, -bh * 0.45], [L * 0.0, -bh * 1.25], [L * 0.12, -bh * 0.45]] : [[-L * 0.2, -bh * 0.42], [-L * 0.02, -bh * 0.95], [L * 0.14, -bh * 0.45]], 0.85);
      fin([[-L * 0.08, bh * 0.42], [-L * 0.02, bh * 0.85], [L * 0.08, bh * 0.42]], 0.8);
      body(() => { ctx.beginPath(); ctx.moveTo(L * 0.44, bh * 0.05); ctx.bezierCurveTo(L * 0.4, -bh * 0.7, -L * 0.2, -bh * 0.75, -L * 0.38, 0); ctx.bezierCurveTo(-L * 0.2, bh * 0.72, L * 0.36, bh * 0.66, L * 0.44, bh * 0.05); });
      // Écailles
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, L * 0.4, bh * 0.6, 0, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = shade(color, -0.25); ctx.globalAlpha = shark ? 0 : 0.35; ctx.lineWidth = Math.max(0.4, L * 0.012);
      const sc = Math.max(2.5, L * 0.07);
      for (let sx = -L * 0.3; sx < L * 0.25; sx += sc) for (let sy = -bh * 0.5; sy < bh * 0.5; sy += sc * 0.9) { ctx.beginPath(); ctx.arc(sx + ((sy / sc) % 2) * sc * 0.5, sy, sc * 0.55, -1.1, 1.1); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
      // Ligne latérale, ouïe, ventre brillant
      ctx.strokeStyle = shade(color, -0.3); ctx.lineWidth = Math.max(0.5, L * 0.015);
      ctx.beginPath(); ctx.arc(L * 0.22, 0, bh * 0.45, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke();
      ellipse(ctx, L * 0.05, -bh * 0.32, L * 0.18, bh * 0.08, "rgba(255,255,255,.35)");
      if (shark) for (let k = 0; k < 3; k++) line(ctx, L * 0.18 + k * L * 0.03, -bh * 0.15, L * 0.16 + k * L * 0.03, bh * 0.2, shade(color, -0.35), Math.max(0.5, L * 0.012));
      eye(L * 0.3, -bh * 0.12, Math.max(1.2, bh * (shark ? 0.1 : 0.15)));
      circle(ctx, L * 0.43, bh * 0.12, Math.max(0.4, L * 0.012), dark);
    }
  }
  if (opts.glow) { ctx.globalCompositeOperation = "lighter"; glow(ctx, 0, 0, L * 0.7, opts.glow, 0.25); ctx.globalCompositeOperation = "source-over"; }
  ctx.restore();
}

export function drawChest(ctx, x, y, s, t = 0) {
  ctx.save(); ctx.translate(x, y);
  const o = "rgba(18,14,30,.95)";
  ctx.fillStyle = o; ctx.beginPath(); ctx.roundRect(-s / 2 - 1, -s * 0.55 - 1, s + 2, s * 1.05 + 2, 2.5); ctx.fill();
  rect(ctx, -s / 2, -s * 0.15, s, s * 0.65, "#8a5a2c");
  ctx.fillStyle = "#a8743a"; ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.55, s, s * 0.42, [s * 0.3, s * 0.3, 0, 0]); ctx.fill();
  rect(ctx, -s / 2, -s * 0.18, s, s * 0.08, "#ffd23a");
  rect(ctx, -s * 0.36, -s * 0.55, s * 0.08, s * 1.05, "#ffd23a"); rect(ctx, s * 0.28, -s * 0.55, s * 0.08, s * 1.05, "#ffd23a");
  rect(ctx, -s * 0.09, -s * 0.2, s * 0.18, s * 0.22, "#ffe88a");
  const tw = (Math.sin(t / 180) + 1) / 2;
  if (tw > 0.6) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(s * 0.35, -s * 0.7); ctx.lineTo(s * 0.4, -s * 0.55); ctx.lineTo(s * 0.55, -s * 0.5); ctx.lineTo(s * 0.4, -s * 0.45); ctx.lineTo(s * 0.35, -s * 0.3); ctx.lineTo(s * 0.3, -s * 0.45); ctx.lineTo(s * 0.15, -s * 0.5); ctx.lineTo(s * 0.3, -s * 0.55); ctx.fill(); }
  ctx.restore();
}

/* ================= Scène animée ================= */

export function createScene() {
  let cacheKey = "";
  let skyC = null, backC = null, mirrorC = null, cacheScale = 1;
  const splash = [], ripples = [], drops = [], bubbles = [], flies = [], swimmers = [], snow = [], gulls = [];
  let flash = 0, bolt = null;

  function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.ceil(w * cacheScale); c.height = Math.ceil(h * cacheScale); const g = c.getContext("2d"); g.scale(cacheScale, cacheScale); return [c, g]; }

  function ensure(loc, period, weather, k) {
    const key = `${loc}|${period}|${weather}|${k.toFixed(2)}`;
    if (key === cacheKey) return;
    cacheKey = key;
    cacheScale = k;
    let g;
    [skyC, g] = canvas(LW, WATER_Y); paintSky(g, loc, period, weather);
    [backC, g] = canvas(LW, WATER_Y + 2); paintBack(g, loc, period, weather);
    [mirrorC, g] = canvas(LW, WATER_Y);
    g.drawImage(skyC, 0, 0, LW, WATER_Y); g.drawImage(backC, 0, 0, LW, WATER_Y + 2);
  }

  function addSplash(x, y, n) { for (let k = 0; k < n; k++) splash.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 80, life: 0.5 + Math.random() * 0.4 }); ripples.push({ x, y, r: 2, life: 1 }); }

  function draw(ctx, W, H, a, v, now, dt, reduced) {
    const k = W / LW;
    ctx.setTransform(k, 0, 0, H / LH, 0, 0);
    const loc = a.loc, period = F.period(a.time), weather = F.currentWeather(a);
    const pal = skyPal(period, weather);
    const indoor = loc === "egouts" || loc === "abysse";
    const night = period === "night";
    ensure(loc, period, weather, k);

    /* ---- Ciel, astre, nuages, décor ---- */
    ctx.drawImage(skyC, 0, 0, LW, WATER_Y);
    let star = null;
    if (!indoor) {
      const hour = (a.time / 60) % 24;
      const sun = hour >= 5 && hour < 20;
      const t = sun ? (hour - 5) / 15 : ((hour + 4) % 24) / 9;
      star = { x: 40 + t * 560, y: 168 - Math.sin(t * Math.PI) * 135, sun };
      if (weather !== "storm") {
        const a2 = weather === "rain" ? 0.35 : weather === "fog" ? 0.55 : 1;
        ctx.globalAlpha = a2;
        if (sun) { glow(ctx, star.x, star.y, 70, period === "day" ? "255,250,220" : "255,170,110", 0.5); circle(ctx, star.x, star.y, 15, period === "day" ? "#fffbe8" : "#ffc08a"); circle(ctx, star.x, star.y, 12, period === "day" ? "#ffffff" : "#ffd8a8"); }
        else { glow(ctx, star.x, star.y, 50, "200,215,255", 0.35); circle(ctx, star.x, star.y, 11, "#eef2ff"); circle(ctx, star.x - 3, star.y - 2, 2.4, "#cdd4ec"); circle(ctx, star.x + 3, star.y + 3, 1.6, "#cdd4ec"); circle(ctx, star.x + 2, star.y - 4, 1.2, "#d8def2"); }
        ctx.globalAlpha = 1;
      }
      // Nuages
      const cloudCol = mixA(hex("#ffffff"), hex(pal.hor), 0.25).map((c, i) => c * pal.light[i]);
      const dark = weather === "storm" ? 0.55 : weather === "rain" ? 0.75 : 1;
      const n = weather === "sun" ? 4 : 8;
      for (let i = 0; i < n; i++) {
        const cx = ((i * 157 + now / (60 + i * 9)) % (LW + 240)) - 120, cy = 28 + (i % 4) * 22 + hash(i) * 10, s = 18 + hash(i, 2) * 16;
        const base = rgb(cloudCol.map((c) => c * dark));
        ctx.globalAlpha = weather === "sun" ? 0.85 : 0.92;
        for (const [ox, oy, r] of [[0, 0, 1], [-1.1, 0.25, 0.7], [1.1, 0.3, 0.75], [0.5, -0.4, 0.7], [-0.5, -0.3, 0.6]]) circle(ctx, cx + ox * s, cy + oy * s * 0.7, r * s * 0.75, base);
        ctx.globalAlpha = 0.55;
        for (const [ox, oy, r] of [[-0.2, -0.3, 0.55], [0.6, -0.5, 0.4]]) circle(ctx, cx + ox * s, cy + oy * s * 0.7, r * s * 0.75, rgb(cloudCol.map((c) => Math.min(255, c * dark * 1.12 + 10))));
        ctx.globalAlpha = 1;
      }
    }
    ctx.drawImage(backC, 0, 0, LW, WATER_Y + 2);

    // Décor animé
    if (loc === "riviere") {
      const wg = ctx.createLinearGradient(0, 112, 0, 214); wg.addColorStop(0, "rgba(220,240,255,.95)"); wg.addColorStop(1, "rgba(160,210,240,.85)");
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(468, 110); ctx.lineTo(500, 112); ctx.lineTo(506, 214); ctx.lineTo(462, 214); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 9; i++) { const yy = 112 + ((now / 6 + i * 13) % 100); line(ctx, 466 + i * 4.5, yy, 466 + i * 4.5 + 1, yy + 10, "rgba(255,255,255,.8)", 1); }
      for (let i = 0; i < 7; i++) circle(ctx, 462 + i * 7 + Math.sin(now / 200 + i) * 2, 210 + Math.sin(now / 150 + i * 2) * 2, 5 + (i % 3), "rgba(255,255,255,.85)");
    }
    if (loc === "mer" && (night || period === "dusk")) {
      const ang = now / 1300;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.18 + 0.1 * Math.cos(ang);
      ctx.fillStyle = "#fff6c0"; ctx.beginPath(); ctx.moveTo(59, 125); ctx.lineTo(59 + Math.cos(ang) * 260, 125 - 30 + Math.sin(ang) * 14); ctx.lineTo(59 + Math.cos(ang) * 260, 125 + 30 + Math.sin(ang) * 14); ctx.closePath(); ctx.fill();
      ctx.restore(); glow(ctx, 59, 125, 14, "255,240,170", 0.6);
    }
    if (loc === "mer" && period === "day" && weather !== "storm") {
      while (gulls.length < 3) gulls.push({ x: Math.random() * LW, y: 50 + Math.random() * 60, v: 12 + Math.random() * 10 });
      for (const gu of gulls) { gu.x += gu.v * dt; if (gu.x > LW + 20) gu.x = -20; const f = Math.sin(now / 160 + gu.y) * 3; ctx.strokeStyle = "#2a2a3a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(gu.x - 6, gu.y + f); ctx.quadraticCurveTo(gu.x - 3, gu.y - 2, gu.x, gu.y); ctx.quadraticCurveTo(gu.x + 3, gu.y - 2, gu.x + 6, gu.y + f); ctx.stroke(); }
    }
    if (loc === "egouts") {
      if (Math.sin(now / 900) > -0.92) { ctx.globalCompositeOperation = "lighter"; glow(ctx, 155, 78, 60, "255,43,214", 0.35); ctx.globalCompositeOperation = "source-over"; }
      const drip = (now / 900) % 1; circle(ctx, 498, 162 + drip * 52, 1.6, "rgba(106,255,58,.85)");
      if (drip > 0.95) ripples.push({ x: 498, y: WATER_Y + 3, r: 1, life: 0.7 });
    }
    if (loc === "abysse") {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) { const x = 80 + i * 150 + Math.sin(now / 3000 + i) * 30; ctx.globalAlpha = 0.07; poly(ctx, [[x - 20, 0], [x + 20, 0], [x + 70, WATER_Y], [x - 10, WATER_Y]], "#7ad8ff"); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) { const x = (i * 220 + now / 90) % (LW + 60) - 30, y = 70 + i * 35 + Math.sin(now / 900 + i) * 10; drawFish(ctx, "jelly", ["#5affd0", "#ff5ad8", "#7aa8ff"][i], x, y, 26, false, now + i * 500, { outline: false, glow: "120,255,220" }); }
      ctx.globalCompositeOperation = "source-over";
    }

    /* ---- Eau : fond, reflet ondulant, scintillement ---- */
    const deep = { etang: ["#2e6a6a", "#0e2a32"], riviere: ["#3a7ab0", "#0f2c4a"], lac: ["#2e5c8e", "#081a34"], mer: ["#245a96", "#04142e"], egouts: ["#2a3a1c", "#070c04"], abysse: ["#0a2a66", "#000208"] }[loc];
    const wl = indoor ? [1, 1, 1] : pal.light;
    const wg = ctx.createLinearGradient(0, WATER_Y, 0, LH);
    wg.addColorStop(0, rgb(hex(deep[0]).map((c, i) => c * wl[i]))); wg.addColorStop(1, rgb(hex(deep[1]).map((c, i) => c * wl[i])));
    ctx.fillStyle = wg; ctx.fillRect(0, WATER_Y, LW, LH - WATER_Y);
    const calm = loc === "lac" ? 0.6 : loc === "riviere" ? 0.3 : 0.45;
    const strips = 36, depth = 110;
    const rough = weather === "storm" ? 2.2 : weather === "rain" ? 1.5 : 1;
    ctx.globalAlpha = calm * (weather === "storm" ? 0.5 : 1);
    for (let i = 0; i < strips; i++) {
      const sh = WATER_Y / strips;
      const dy = (depth / strips) * i;
      const off = Math.sin(now / 420 + i * 0.7) * (0.6 + i * 0.18) * rough + (loc === "riviere" ? Math.sin(now / 120 + i) * 1.5 : 0);
      ctx.drawImage(mirrorC, 0, (WATER_Y - (i + 1) * sh) * cacheScale, LW * cacheScale, sh * cacheScale, off, WATER_Y + dy, LW, depth / strips + 0.6);
    }
    ctx.globalAlpha = 1;
    const fade = ctx.createLinearGradient(0, WATER_Y, 0, WATER_Y + depth + 10);
    fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, rgb(hex(deep[1]).map((c, i) => c * wl[i])));
    ctx.fillStyle = fade; ctx.fillRect(0, WATER_Y, LW, depth + 12);
    // Traînée de lumière de l'astre
    if (star && weather !== "storm") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 26; i++) {
        const yy = WATER_Y + 3 + i * 4, w = 4 + i * 1.3, tw = (Math.sin(now / 180 + i * 1.7) + 1) / 2;
        ctx.globalAlpha = (0.45 - i * 0.015) * tw * (weather === "sun" ? 1 : 0.5);
        rect(ctx, star.x - w / 2 + Math.sin(now / 300 + i) * 3, yy, w, 1.2, star.sun ? (period === "day" ? "#fff8d0" : "#ffb070") : "#dfe6ff");
      }
      ctx.restore();
    }
    // Néons de la ville et des égouts dans l'eau
    if ((loc === "mer" && (night || period === "dusk")) || loc === "egouts") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const [x, c] of loc === "mer" ? [[317, "255,43,214"], [433, "0,240,255"], [503, "252,238,10"]] : [[155, "255,43,214"], [320, "0,240,255"]]) for (let i = 0; i < 12; i++) { ctx.globalAlpha = 0.35 - i * 0.025; rect(ctx, x - 14 + Math.sin(now / 250 + i) * 3, WATER_Y + 4 + i * 5, 28 - i, 1.6, `rgb(${c})`); }
      ctx.restore();
    }

    // Sous la surface : rayons de soleil, poissons qui passent, bulles, fond
    if (period === "day" && !indoor && weather === "sun") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) { const x = 230 + i * 85 + Math.sin(now / 2200 + i * 2) * 20; ctx.globalAlpha = 0.05; poly(ctx, [[x, WATER_Y + 4], [x + 18, WATER_Y + 4], [x + 50, LH], [x + 10, LH]], "#cfefff"); }
      ctx.restore();
    }
    if (!reduced && swimmers.length < 5 && Math.random() < dt * 0.5) {
      const left = Math.random() < 0.5;
      const pool = F.FISH.filter((f) => f.loc === loc);
      const f = pool[Math.floor(Math.random() * pool.length)];
      swimmers.push({ x: left ? -40 : LW + 40, dir: left ? 1 : -1, y: WATER_Y + 60 + Math.random() * 80, v: 14 + Math.random() * 22, len: 18 + Math.random() * 28, f });
    }
    for (const s of swimmers) {
      s.x += s.v * s.dir * dt;
      ctx.globalAlpha = loc === "abysse" ? 0.55 : 0.32;
      drawFish(ctx, s.f.shape, loc === "abysse" ? s.f.color : rgb(hex(s.f.color).map((c) => c * 0.35)), s.x, s.y + Math.sin(now / 600 + s.y) * 3, s.len, s.dir < 0, now, { outline: false, glow: loc === "abysse" ? "90,255,208" : null });
    }
    ctx.globalAlpha = 1;
    for (let i = swimmers.length - 1; i >= 0; i--) if (swimmers[i].x < -80 || swimmers[i].x > LW + 80) swimmers.splice(i, 1);
    if (!reduced && Math.random() < dt * (loc === "abysse" ? 5 : 1.6)) bubbles.push({ x: 200 + Math.random() * 420, y: LH, r: 0.8 + Math.random() * 1.8, v: 18 + Math.random() * 20 });
    for (const b of bubbles) { b.y -= b.v * dt; b.x += Math.sin(now / 300 + b.r * 9) * 0.2; ctx.strokeStyle = "rgba(200,240,255,.55)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); }
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < WATER_Y + 8) bubbles.splice(i, 1);
    // Fond : rochers et algues
    for (let i = 0; i < 14; i++) {
      const x = 200 + i * 33 + hash(i, 11) * 14;
      ellipse(ctx, x, LH + 2, 14 + hash(i, 12) * 10, 7 + hash(i, 13) * 6, loc === "abysse" ? "#020814" : "rgba(4,14,20,.85)");
      if (i % 2 === 0) for (let b = 0; b < 3; b++) {
        const bx = x - 4 + b * 4, hh = 22 + hash(i, b) * 26;
        ctx.strokeStyle = loc === "abysse" ? "rgba(255,90,220,.5)" : loc === "egouts" ? "rgba(90,140,40,.55)" : "rgba(30,90,60,.6)";
        ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(bx, LH);
        ctx.quadraticCurveTo(bx + Math.sin(now / 900 + i + b) * 8, LH - hh * 0.5, bx + Math.sin(now / 700 + i * 2 + b) * 6, LH - hh); ctx.stroke();
      }
    }

    // Surface : vaguelettes, écume, nénuphars
    ctx.lineWidth = 1;
    for (let row = 0; row < 7; row++) {
      ctx.strokeStyle = loc === "egouts" ? `rgba(140,255,80,${0.25 - row * 0.03})` : `rgba(255,255,255,${0.32 - row * 0.04})`;
      ctx.beginPath();
      const speed = loc === "riviere" ? now / 9 : now / 45;
      for (let i = 0; i < 9; i++) {
        const sx = ((i * 83 + row * 41 + speed * (1 + row * 0.15)) % (LW + 80)) - 40, sy = WATER_Y + 3 + row * row * 2.4 + row * 3;
        const w = 10 + row * 3;
        ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + w / 2, sy - 1.5, sx + w, sy);
      }
      ctx.stroke();
    }
    rect(ctx, 0, WATER_Y - 0.5, LW, 1.2, loc === "egouts" ? "rgba(140,255,80,.35)" : "rgba(255,255,255,.35)");
    if (loc === "etang") for (const [x, y, r] of [[300, 226, 7], [372, 240, 5], [590, 232, 8], [520, 250, 6]]) {
      ellipse(ctx, x, y + 1, r * 1.5, r * 0.5, "rgba(0,0,0,.2)");
      ctx.fillStyle = tone("#3a9a4a", 0, pal); ctx.beginPath(); ctx.moveTo(x, y); ctx.ellipse(x, y, r * 1.4, r * 0.48, 0, 0.35, Math.PI * 2 - 0.1); ctx.closePath(); ctx.fill();
      if (r > 6 && period !== "night") { for (let i = 0; i < 6; i++) ellipse(ctx, x - 2 + Math.cos(i) * 2, y - 2 + Math.sin(i) * 0.8, 1.8, 1, "#ffc4e0"); circle(ctx, x - 2, y - 2.2, 1, "#ffe46a"); }
    }
    if (loc === "riviere") for (const [x, y, r] of [[330, 232, 9], [560, 246, 12], [420, 268, 7]]) {
      ellipse(ctx, x, y, r * 1.3, r * 0.55, tone("#7a7a84", 0, pal)); ellipse(ctx, x - 2, y - 2, r * 0.9, r * 0.3, tone("#9a9aa4", 0, pal));
      for (let i = 0; i < 5; i++) ellipse(ctx, x - r * 1.3 - i * 3 - ((now / 30) % 6), y + 1 + Math.sin(now / 100 + i) * 1.5, 3, 1, "rgba(255,255,255,.75)");
    }
    if (loc === "mer") for (let i = 0; i < 6; i++) { const x = ((i * 120 + now / 30) % (LW + 60)) - 30; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(x, WATER_Y + 12 + (i % 3) * 14, 14, 1.6, 0, 0, 7); ctx.fill(); }

    // Pluie qui tombe dans l'eau
    if (!indoor && (weather === "rain" || weather === "storm") && Math.random() < dt * 30) ripples.push({ x: Math.random() * LW, y: WATER_Y + 4 + Math.random() * 120, r: 1, life: 0.6 });
    for (const r of ripples) { r.r += dt * 18; r.life -= dt; ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, r.life) * 0.6})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * 1.6, r.r * 0.45, 0, 0, 7); ctx.stroke(); }
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].life <= 0) ripples.splice(i, 1);

    /* ---- Ponton et pêcheur ---- */
    drawDock(ctx, loc, pal, indoor, now);
    if (night || (indoor && loc !== "abysse")) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, 22, WATER_Y - 46, 60, "255,200,110", 0.45); ctx.restore(); }
    drawAngler(ctx, v, now, a);

    // Ligne et bouchon
    const tip = rodTip(v, now);
    if (v.state === "waiting" || v.state === "bite" || v.state === "reel") {
      const kk = v.lineOut;
      const bx = tip.x + (v.castX - tip.x) * kk;
      let by = tip.y + (WATER_Y - tip.y) * kk - Math.sin(kk * Math.PI) * 70;
      if (kk >= 1) by = WATER_Y + (v.state === "bite" ? 4 + Math.sin(now / 45) * 4 : Math.sin(now / 500) * 1.5);
      const fx = v.state === "reel" && v.reel ? v.castX + (v.reel.s.fish - 0.5) * 50 : bx;
      const fy = v.state === "reel" ? WATER_Y + 6 : by;
      ctx.strokeStyle = "rgba(240,248,255,.75)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo((tip.x + fx) / 2, Math.max(tip.y, fy) + (v.state === "reel" ? -6 : 24), fx, fy); ctx.stroke();
      if (v.state !== "reel") {
        ellipse(ctx, bx, by + 2, 6, 1.6, "rgba(0,0,0,.25)");
        ctx.fillStyle = "rgba(18,14,30,.9)"; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(bx, by, 4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ff2a3a"; ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI); ctx.fill();
        circle(ctx, bx - 1.5, by - 1.8, 1, "rgba(255,255,255,.9)");
        rect(ctx, bx - 0.5, by - 8, 1, 4, "#ffd23a");
        if (kk >= 1 && Math.random() < dt * (v.state === "bite" ? 12 : 0.8)) ripples.push({ x: bx, y: WATER_Y + 2, r: 2, life: 0.9 });
      } else {
        if (Math.random() < dt * 14) addSplash(fx + (Math.random() - 0.5) * 8, WATER_Y, 1);
        if (Math.random() < dt * 4) ripples.push({ x: fx, y: WATER_Y + 3, r: 3, life: 0.7 });
      }
    }
    if (v.state === "bite") {
      const b = Math.abs(Math.sin(now / 90)) * 4;
      const x = ROD_BASE.x - 6, y = 92 - b;
      ctx.fillStyle = "rgba(18,14,30,.95)"; ctx.beginPath(); ctx.roundRect(x - 10, y - 22, 20, 26, 5); ctx.fill();
      ctx.fillStyle = "#fcee0a"; ctx.beginPath(); ctx.roundRect(x - 8, y - 20, 16, 22, 4); ctx.fill();
      ctx.fillStyle = "#1a0e10"; ctx.font = "900 20px Rajdhani, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", x, y - 2);
    }
    if (v.state === "charging") {
      const p = v.power;
      const x = 60, y = 64;
      ctx.fillStyle = "rgba(18,14,30,.9)"; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, 16, 84, 4); ctx.fill();
      const gg = ctx.createLinearGradient(0, y + 80, 0, y);
      gg.addColorStop(0, "#00f0ff"); gg.addColorStop(0.65, "#3ddc84"); gg.addColorStop(0.92, "#fcee0a"); gg.addColorStop(1, "#fcee0a");
      ctx.fillStyle = "#1a1a28"; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, 10, 78, 3); ctx.fill();
      ctx.fillStyle = gg; ctx.beginPath(); ctx.roundRect(x + 1, y + 1 + 78 * (1 - p), 10, 78 * p, 3); ctx.fill();
      rect(ctx, x, y + 1 + 78 * 0.08, 12, 1, "rgba(255,255,255,.8)");
    }

    for (const s of splash) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 220 * dt; s.life -= dt; ctx.globalAlpha = Math.max(0, s.life * 1.5); circle(ctx, s.x, s.y, 1.2, "#dff2ff"); }
    ctx.globalAlpha = 1;
    for (let i = splash.length - 1; i >= 0; i--) if (splash[i].life <= 0 || splash[i].y > WATER_Y + 6) splash.splice(i, 1);

    // Lucioles, libellules
    if (!reduced && !indoor && (loc === "etang" || loc === "lac" || loc === "riviere") && weather !== "storm" && weather !== "rain") {
      const want = night ? 14 : period === "day" ? 3 : 0;
      while (flies.length < want) flies.push({ x: Math.random() * LW, y: 120 + Math.random() * 120, ph: Math.random() * 9 });
      flies.length = Math.min(flies.length, want);
      for (const f of flies) {
        f.ph += dt; f.x += Math.sin(f.ph * (night ? 0.7 : 2.5)) * (night ? 10 : 50) * dt; f.y += Math.cos(f.ph * (night ? 0.5 : 3)) * (night ? 8 : 20) * dt;
        if (night) { const b = (Math.sin(f.ph * 3) + 1) / 2; ctx.globalCompositeOperation = "lighter"; glow(ctx, f.x, f.y, 8, "200,255,120", 0.6 * b); ctx.globalCompositeOperation = "source-over"; circle(ctx, f.x, f.y, 0.9, "#eaffb0"); }
        else { const w = Math.abs(Math.sin(f.ph * 40)) * 4; line(ctx, f.x - 5, f.y, f.x + 5, f.y, "#2a8aa8", 1.4); ellipse(ctx, f.x - 1, f.y - 1, w, 1.2, "rgba(220,240,255,.7)"); ellipse(ctx, f.x + 1.5, f.y - 1, w, 1.2, "rgba(220,240,255,.7)"); }
      }
    } else flies.length = 0;
    if (loc === "abysse") { // neige marine
      while (snow.length < 60) snow.push({ x: Math.random() * LW, y: Math.random() * LH, v: 4 + Math.random() * 8 });
      for (const s of snow) { s.y += s.v * dt; s.x += Math.sin(now / 1500 + s.v) * 0.1; if (s.y > LH) { s.y = -4; s.x = Math.random() * LW; } circle(ctx, s.x, s.y, 0.7, "rgba(200,230,255,.6)"); }
    } else snow.length = 0;

    /* ---- Météo et finitions ---- */
    if (!indoor && (weather === "rain" || weather === "storm")) {
      while (drops.length < 170) drops.push({ x: Math.random() * LW, y: Math.random() * LH, v: 420 + Math.random() * 180 });
      ctx.strokeStyle = "rgba(190,210,255,.45)"; ctx.lineWidth = 0.9; ctx.beginPath();
      for (const d of drops) { d.y += d.v * dt; d.x -= d.v * 0.18 * dt; if (d.y > LH) { d.y = -10; d.x = Math.random() * (LW + 60); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2.5, d.y + 11); }
      ctx.stroke();
      if (weather === "storm") {
        if (!bolt && Math.random() < dt * 0.12) { const x = 260 + Math.random() * 340; const pts = [[x, 0]]; let y = 0; while (y < 170) { y += 12 + Math.random() * 18; pts.push([pts[pts.length - 1][0] + (Math.random() - 0.5) * 30, y]); } bolt = { pts, life: 0.35 }; flash = 1; }
        if (bolt) { ctx.strokeStyle = `rgba(240,245,255,${bolt.life * 2.6})`; ctx.lineWidth = 2.2; ctx.beginPath(); bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); bolt.life -= dt; if (bolt.life <= 0) bolt = null; }
        if (flash > 0) { ctx.fillStyle = `rgba(230,235,255,${flash * 0.45})`; ctx.fillRect(0, 0, LW, LH); flash -= dt * 3; }
      }
    } else drops.length = 0;
    if (weather === "fog") {
      for (let i = 0; i < 4; i++) {
        const y = 140 + i * 30, x = ((now / (50 + i * 25)) % LW);
        const fg = ctx.createLinearGradient(0, y - 20, 0, y + 20);
        fg.addColorStop(0, "rgba(220,226,236,0)"); fg.addColorStop(0.5, `rgba(220,226,236,${0.28 - i * 0.04})`); fg.addColorStop(1, "rgba(220,226,236,0)");
        ctx.fillStyle = fg; ctx.fillRect(x - LW, y - 20, LW * 2, 40);
      }
    }
    const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LW * 0.62);
    vg.addColorStop(0, "rgba(4,4,12,0)"); vg.addColorStop(1, `rgba(4,4,12,${night || indoor ? 0.55 : 0.3})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);

    if (v.state === "reel" && v.reel) drawReel(ctx, v.reel, now);
  }

  return { draw, splash: addSplash };
}

/* ================= Ponton et pêcheur ================= */

function drawDock(ctx, loc, pal, indoor, now) {
  const lt = indoor ? [0.85, 0.85, 0.9] : pal.light;
  const c = (col) => rgb(hex(col).map((v, i) => v * lt[i]));
  const metal = loc === "abysse" || loc === "egouts";
  // Pieux et leur reflet
  for (let i = 0; i < 4; i++) {
    const x = 14 + i * 52;
    ctx.globalAlpha = 0.35; rect(ctx, x + Math.sin(now / 400 + i) * 1.5, WATER_Y + 2, 8, 34, c(metal ? "#1a2030" : "#2a1a10")); ctx.globalAlpha = 1;
    rect(ctx, x, WATER_Y - 18, 8, 40, c(metal ? "#3a4458" : "#5a3418"));
    rect(ctx, x, WATER_Y - 18, 2.5, 40, c(metal ? "#5a667a" : "#7a4a24"));
    ellipse(ctx, x + 4, WATER_Y + 2, 8, 2, "rgba(255,255,255,.25)");
  }
  // Plancher
  ctx.fillStyle = "rgba(18,14,30,.95)"; ctx.beginPath(); ctx.roundRect(-4, WATER_Y - 26, DOCK_END + 6, 13, 2); ctx.fill();
  for (let i = 0; i < 12; i++) {
    const x = i * 16;
    const col = metal ? (i % 2 ? "#4a5468" : "#465064") : (i % 2 ? "#9a6232" : "#8e5a2c");
    rect(ctx, x, WATER_Y - 25, 15.4, 11, c(col));
    rect(ctx, x, WATER_Y - 25, 15.4, 2.2, c(metal ? "#6a768c" : "#c0844a"));
    circle(ctx, x + 2.5, WATER_Y - 20, 0.7, c(metal ? "#8a96aa" : "#4a2c16")); circle(ctx, x + 13, WATER_Y - 20, 0.7, c(metal ? "#8a96aa" : "#4a2c16"));
  }
  if (metal) { line(ctx, 0, WATER_Y - 40, DOCK_END, WATER_Y - 40, loc === "abysse" ? "#00f0ff" : "#5a667a", 1.4); for (let x = 10; x < DOCK_END; x += 45) rect(ctx, x, WATER_Y - 40, 2, 15, c("#5a667a")); }
  // Lanterne, seau, corde
  rect(ctx, 20, WATER_Y - 66, 3, 41, c("#3a2a1a"));
  ctx.fillStyle = "rgba(18,14,30,.95)"; ctx.beginPath(); ctx.roundRect(13.5, WATER_Y - 76, 16, 14, 3); ctx.fill();
  rect(ctx, 15, WATER_Y - 74, 13, 11, "#ffd86a"); rect(ctx, 15, WATER_Y - 74, 13, 2, c("#3a2a1a")); rect(ctx, 21, WATER_Y - 74, 1.2, 11, c("#3a2a1a"));
  ctx.fillStyle = "rgba(18,14,30,.95)"; ctx.beginPath(); ctx.roundRect(150, WATER_Y - 40, 18, 16, 3); ctx.fill();
  rect(ctx, 151.5, WATER_Y - 38.5, 15, 13, c("#6a7a8a")); rect(ctx, 151.5, WATER_Y - 38.5, 15, 3, c("#8a9aaa"));
  ctx.strokeStyle = c("#c8a870"); ctx.lineWidth = 2.2;
  for (const r of [6, 4]) { ctx.beginPath(); ctx.ellipse(100, WATER_Y - 28, r * 1.4, r * 0.5, 0, 0, 7); ctx.stroke(); }
}

function rodTip(v, now) {
  const lean = v.state === "charging" ? -Math.min(1, v.chargeT / 700) : 0;
  const reel = v.state === "reel" ? 1 : 0;
  return { x: ROD_BASE.x + 64 + lean * 70 - reel * 6, y: ROD_BASE.y - 78 + Math.abs(lean) * 30 + reel * (22 + Math.sin(now / 55) * 3) };
}

function drawAngler(ctx, v, now, a) {
  const o = "rgba(18,14,30,.95)";
  const x = ROD_BASE.x - 14, feet = WATER_Y - 25;
  const tip = rodTip(v, now);
  const breathe = Math.sin(now / 700) * 0.6;
  const hand = { x: x + 12, y: feet - 34 + breathe };
  const outlined = (fn, col) => { ctx.save(); ctx.lineWidth = 2.4; ctx.strokeStyle = o; ctx.lineJoin = "round"; fn(); ctx.stroke(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); };
  // Bottes et jambes
  outlined(() => { ctx.beginPath(); ctx.roundRect(x - 6, feet - 22, 6, 22, 2); }, "#2a3a6a");
  outlined(() => { ctx.beginPath(); ctx.roundRect(x + 1, feet - 22, 6, 22, 2); }, "#22305a");
  outlined(() => { ctx.beginPath(); ctx.roundRect(x - 7, feet - 6, 8, 6, [2, 3, 1, 1]); }, "#4a2a1a");
  outlined(() => { ctx.beginPath(); ctx.roundRect(x + 0.5, feet - 6, 9, 6, [2, 3, 1, 1]); }, "#3a2010");
  // Veste
  outlined(() => { ctx.beginPath(); ctx.roundRect(x - 9, feet - 46 + breathe, 18, 26, 5); }, "#00a8c8");
  rect(ctx, x - 9, feet - 26 + breathe, 18, 3, "#6a3a1a"); rect(ctx, x - 1.5, feet - 26 + breathe, 3, 3, "#ffd23a");
  rect(ctx, x - 7, feet - 43 + breathe, 3, 15, "rgba(255,255,255,.25)");
  rect(ctx, x + 3, feet - 40 + breathe, 5, 6, "#0a7a98");
  // Canne (fléchie quand le poisson tire)
  const bend = v.state === "reel" ? 26 : v.state === "bite" ? 10 : 0;
  ctx.lineCap = "round";
  ctx.strokeStyle = o; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(hand.x - 8, hand.y + 8); ctx.quadraticCurveTo((hand.x + tip.x) / 2, (hand.y + tip.y) / 2 - 10 + bend, tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = "#5a3418"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hand.x - 8, hand.y + 8); ctx.quadraticCurveTo((hand.x + tip.x) / 2, (hand.y + tip.y) / 2 - 10 + bend, tip.x, tip.y); ctx.stroke();
  const rodCol = a.rod === "quantum" ? "#ff2bd6" : a.rod === "iridium" ? "#b8a0ff" : a.rod === "carbone" ? "#2a2a34" : a.rod === "fibre" ? "#e8e8ee" : "#c8a060";
  ctx.strokeStyle = rodCol; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo((hand.x + tip.x) / 2, (hand.y + tip.y) / 2 - 6 + bend * 0.8); ctx.quadraticCurveTo((hand.x * 0.3 + tip.x * 0.7), (hand.y * 0.3 + tip.y * 0.7) - 6 + bend * 0.5, tip.x, tip.y); ctx.stroke();
  circle(ctx, hand.x - 3, hand.y + 3, 3.2, o); circle(ctx, hand.x - 3, hand.y + 3, 2.4, "#c8c8d0");
  // Bras
  outlined(() => { ctx.beginPath(); ctx.moveTo(x + 4, feet - 42 + breathe); ctx.lineTo(hand.x + 1, hand.y - 1); ctx.lineTo(hand.x - 1, hand.y + 4); ctx.lineTo(x + 1, feet - 36 + breathe); ctx.closePath(); }, "#0090b0");
  outlined(() => { ctx.beginPath(); ctx.arc(hand.x, hand.y + 1.5, 3, 0, 7); }, "#f0c8a0");
  // Tête
  const hy = feet - 54 + breathe;
  outlined(() => { ctx.beginPath(); ctx.arc(x + 1, hy, 8, 0, 7); }, "#f0c8a0");
  ctx.fillStyle = "#6a3018"; ctx.beginPath(); ctx.arc(x - 1, hy - 1, 8, Math.PI * 0.55, Math.PI * 1.6); ctx.fill();
  circle(ctx, x + 5, hy - 0.5, 1.2, "#1a1018"); circle(ctx, x + 5.4, hy - 1, 0.4, "#fff");
  circle(ctx, x + 5, hy + 3.2, 1.6, "rgba(255,120,120,.4)");
  ctx.strokeStyle = "#a0503a"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x + 6, hy + 3, 1.6, 0.2, 1.4); ctx.stroke();
  // Chapeau
  outlined(() => { ctx.beginPath(); ctx.ellipse(x + 1, hy - 6, 13, 3.4, -0.08, 0, 7); }, "#dcb24a");
  outlined(() => { ctx.beginPath(); ctx.roundRect(x - 6, hy - 15, 13, 9, [5, 5, 1, 1]); }, "#ecc860");
  rect(ctx, x - 6, hy - 9, 13, 2.4, "#ff2bd6");
}

/* ================= Mini-jeu ================= */

function drawReel(ctx, reel, now) {
  const { s, params, fish } = reel;
  const T = TRACK;
  const o = "rgba(18,14,30,.96)";
  // Cadre en bois
  ctx.fillStyle = o; ctx.beginPath(); ctx.roundRect(T.x - 14, T.y - 14, T.w + 58, T.h + 34, 8); ctx.fill();
  const wood = ctx.createLinearGradient(T.x - 12, 0, T.x + T.w + 42, 0);
  wood.addColorStop(0, "#8a5a2c"); wood.addColorStop(0.5, "#b07a40"); wood.addColorStop(1, "#7a4a24");
  ctx.fillStyle = wood; ctx.beginPath(); ctx.roundRect(T.x - 11, T.y - 11, T.w + 52, T.h + 28, 6); ctx.fill();
  for (let i = 0; i < 6; i++) rect(ctx, T.x - 11, T.y - 6 + i * 52, T.w + 52, 0.8, "rgba(60,30,10,.35)");
  for (const [x, y] of [[T.x - 6, T.y - 6], [T.x + T.w + 36, T.y - 6], [T.x - 6, T.y + T.h + 12], [T.x + T.w + 36, T.y + T.h + 12]]) { circle(ctx, x, y, 2, "#5a3418"); circle(ctx, x - 0.5, y - 0.5, 0.9, "#d0a060"); }
  // Piste d'eau
  ctx.save();
  ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 5); ctx.clip();
  const g = ctx.createLinearGradient(0, T.y, 0, T.y + T.h);
  g.addColorStop(0, "#3a86c8"); g.addColorStop(1, "#0c2448");
  ctx.fillStyle = g; ctx.fillRect(T.x, T.y, T.w, T.h);
  for (let i = 0; i < 8; i++) { const by = T.y + T.h - ((now / 25 + i * 37) % T.h); circle(ctx, T.x + 6 + (i * 7) % (T.w - 10), by, 1 + (i % 3) * 0.5, "rgba(200,240,255,.35)"); }
  for (let i = 0; i < 3; i++) { const x = T.x + 4 + i * 12; ctx.strokeStyle = "rgba(40,120,80,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, T.y + T.h); ctx.quadraticCurveTo(x + Math.sin(now / 600 + i) * 5, T.y + T.h - 20, x + 2, T.y + T.h - 34 - i * 6); ctx.stroke(); }
  // Barre verte
  const by = T.y + T.h * (1 - s.pos - params.bar), bh = T.h * params.bar;
  const bg = ctx.createLinearGradient(T.x, 0, T.x + T.w, 0);
  bg.addColorStop(0, s.inside ? "rgba(61,255,143,.55)" : "rgba(61,255,143,.3)"); bg.addColorStop(0.5, s.inside ? "rgba(120,255,180,.8)" : "rgba(80,220,140,.4)"); bg.addColorStop(1, s.inside ? "rgba(61,255,143,.55)" : "rgba(61,255,143,.3)");
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(T.x + 3, by, T.w - 6, bh, 4); ctx.fill();
  ctx.strokeStyle = s.inside ? "#b8ffd4" : "#3dff8f"; ctx.lineWidth = 1.6; ctx.stroke();
  rect(ctx, T.x + 6, by + 3, 3, bh - 6, "rgba(255,255,255,.35)");
  ctx.restore();
  ctx.strokeStyle = o; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 5); ctx.stroke();
  // Trésor
  const t = s.treasure;
  if (t && t.shown && !t.got) {
    const ty = T.y + T.h * (1 - t.y);
    drawChest(ctx, T.x + T.w / 2, ty, 15, now);
    ctx.strokeStyle = "rgba(18,14,30,.8)"; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(T.x + T.w / 2, ty - 1, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffd23a"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(T.x + T.w / 2, ty - 1, 13, -Math.PI / 2, -Math.PI / 2 + t.p * Math.PI * 2); ctx.stroke();
  }
  // Poisson
  const fy = T.y + T.h * (1 - s.fish);
  const shape = ["jelly", "crab", "squid", "eel", "flat"].includes(fish.shape) ? fish.shape : "fish";
  drawFish(ctx, shape, fish.color, T.x + T.w / 2, fy, 30, s.target < s.fish, now);
  // Jauge de capture
  const px = T.x + T.w + 12, pw = 16;
  ctx.fillStyle = o; ctx.beginPath(); ctx.roundRect(px - 2, T.y - 2, pw + 4, T.h + 4, 5); ctx.fill();
  ctx.fillStyle = "#141420"; ctx.beginPath(); ctx.roundRect(px, T.y, pw, T.h, 4); ctx.fill();
  const prog = s.progress;
  const pg = ctx.createLinearGradient(0, T.y + T.h, 0, T.y);
  pg.addColorStop(0, "#ff2a6d"); pg.addColorStop(0.45, "#fcee0a"); pg.addColorStop(1, "#3dff8f");
  ctx.save(); ctx.beginPath(); ctx.roundRect(px + 2, T.y + 2, pw - 4, T.h - 4, 3); ctx.clip();
  ctx.fillStyle = pg; ctx.fillRect(px + 2, T.y + T.h * (1 - prog), pw - 4, T.h * prog);
  rect(ctx, px + 4, T.y + T.h * (1 - prog), 2.4, T.h * prog, "rgba(255,255,255,.35)");
  ctx.restore();
  if (s.perfect) {
    ctx.font = "800 12px Rajdhani, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.strokeStyle = o; ctx.lineWidth = 3; ctx.strokeText("PARFAIT", T.x + T.w / 2 + 14, T.y + T.h + 13);
    ctx.fillStyle = "#fcee0a"; ctx.fillText("PARFAIT", T.x + T.w / 2 + 14, T.y + T.h + 13);
  }
}
