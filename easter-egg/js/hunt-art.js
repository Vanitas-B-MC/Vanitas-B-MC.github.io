// js/hunt-art.js — sprites des créatures de « Chasse aux Titans », dessinés au canvas (aucune image externe).
// Chaque espèce a une silhouette (shape), deux couleurs et la couleur de son type pour les yeux et les circuits.
// Les évolutions sont plus grandes et plus hérissées. Les images sont mises en cache (data URL).

import { SPECIES, TYPES } from "./hunt-data.js";

const OUT = "#07070d";
const cache = new Map();

// Stade d'évolution : 0 (base), 1, 2 ; 3 pour les Titans.
const stageOf = (() => {
  const memo = {};
  return (id) => {
    if (id in memo) return memo[id];
    let stage = 0;
    let cur = id;
    for (let i = 0; i < 3; i++) {
      const prev = Object.values(SPECIES).find((s) => s.evo && s.evo[1] === cur);
      if (!prev) break;
      stage += 1;
      cur = prev.id;
    }
    if (SPECIES[id].shape === "titan") stage = 3;
    return (memo[id] = stage);
  };
})();

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/* ---------- Petites primitives ---------- */

function painter(ctx, pal) {
  const fillStroke = (fill, lw = 3) => {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = pal.out;
    ctx.stroke();
  };
  return {
    ell(x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); fillStroke(fill); },
    poly(pts, fill, lw) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); fillStroke(fill, lw); },
    rect(x, y, w, h, fill, r = 4) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); fillStroke(fill); },
    line(pts, color, lw) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.stroke(); },
    glow(x, y, r, color) {
      if (pal.sil) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    },
    eye(x, y, r = 3.4) {
      if (pal.sil) return;
      this.glow(x, y, r * 3.2, pal.eyeGlow);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = pal.eye; ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    },
    circuit(pts) { if (!pal.sil) this.line(pts, pal.eye, 1.4); }
  };
}

function spikes(p, pal, from, to, n, len, fill) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    p.poly([[x - 4, y + 2], [x + 1, y - len], [x + 5, y + 2]], fill, 2);
  }
}

/* ---------- Silhouettes (vers la droite, dans une boîte de 100 × 100) ---------- */

const SHAPES = {
  quad(p, c, st, r) {
    const body = c.main, dark = c.dark, acc = c.acc;
    // queue
    p.line([[26, 60], [14, 52], [10, 38 - st * 4]], c.out, 9);
    p.line([[26, 60], [14, 52], [10, 38 - st * 4]], body, 5.5);
    if (st >= 1) p.poly([[6, 40 - st * 4], [10, 26 - st * 5], [15, 39 - st * 4]], acc, 2);
    // pattes arrière
    p.rect(30, 62, 9, 20, dark, 3); p.rect(62, 62, 9, 20, dark, 3);
    p.ell(48, 60, 27 + st * 2, 15 + st, body);
    p.rect(40, 64, 9, 19, body, 3); p.rect(70, 63, 9, 19, body, 3);
    // tête
    p.ell(74, 42 - st, 14 + st, 12 + st, body);
    const ear = 8 + Math.floor(r() * 9);
    if (r() < 0.5) {
      p.poly([[66, 32 - st], [64, 26 - ear - st * 3], [74, 29 - st]], dark, 2.5);
      p.poly([[78, 30 - st], [84, 25 - ear - st * 3], [86, 33 - st]], dark, 2.5);
    } else {
      p.ell(66, 28 - st - ear / 3, 5, ear / 2 + 2, dark, -0.3);
      p.ell(82, 27 - st - ear / 3, 5, ear / 2 + 2, dark, 0.3);
    }
    p.rect(80, 44 - st, 10 + Math.floor(r() * 6), 7, shade(body, -0.15), 3);
    p.eye(79, 39 - st);
    if (st >= 1) spikes(p, c, [30, 47], [62, 45], 3 + st, 7 + st * 3, acc);
    p.circuit([[34, 58], [44, 58], [48, 54], [60, 54]]);
    if (r() > 0.5) p.circuit([[38, 66], [52, 66]]);
  },
  biped(p, c, st) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.rect(36, 66, 11, 22, dark, 3); p.rect(54, 66, 11, 22, dark, 3);
    p.rect(32 - st, 36 - st * 2, 37 + st * 2, 36 + st * 2, body, 9);
    p.rect(20 - st, 40 - st, 12, 26 + st * 2, shade(body, -0.12), 5);
    p.rect(68 + st, 40 - st, 12, 26 + st * 2, shade(body, -0.12), 5);
    p.ell(26 - st, 68 + st, 8 + st, 7 + st, acc); p.ell(74 + st, 68 + st, 8 + st, 7 + st, acc);
    p.ell(51, 24 - st * 2, 14 + st, 13 + st, body);
    p.rect(44, 19 - st * 2, 20, 7, OUT, 3);
    p.eye(56, 22.5 - st * 2, 2.6); p.eye(62, 22.5 - st * 2, 2.6);
    if (st >= 1) spikes(p, c, [40, 12 - st * 2], [62, 12 - st * 2], 2 + st, 6 + st * 3, acc);
    p.ell(50, 52 - st, 6, 6, acc); p.glow(50, 52 - st, 13, c.eyeGlow);
    p.circuit([[38, 44], [44, 50], [44, 62]]);
  },
  bird(p, c, st) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.poly([[20, 62], [4, 56 - st * 2], [8, 70], [22, 70]], dark);
    p.line([[42, 70], [40, 86]], c.out, 4); p.line([[54, 70], [56, 86]], c.out, 4);
    p.ell(44, 58, 22 + st * 2, 16 + st, body);
    p.poly([[34, 50], [14 - st * 3, 18 - st * 5], [30, 26], [44, 22 - st * 3], [56, 48]], shade(body, -0.1));
    p.circuit([[24, 30], [36, 42], [44, 30]]);
    p.ell(66, 40 - st, 12 + st, 11 + st, body);
    p.poly([[76, 38 - st], [92, 43 - st], [76, 47 - st]], acc, 2.5);
    if (st >= 1) p.poly([[60, 30 - st], [56, 16 - st * 4], [66, 28 - st]], acc, 2);
    p.eye(70, 37 - st);
    p.ell(44, 62, 12, 8, shade(body, 0.25));
  },
  fish(p, c, st) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.poly([[22, 54], [4, 38 - st * 3], [8, 56], [4, 72 + st * 3]], dark);
    p.poly([[40, 40], [52, 22 - st * 4], [62, 40]], acc, 2.5);
    p.ell(50, 56, 30 + st * 2, 18 + st, body);
    p.ell(50, 64, 20, 8, shade(body, 0.3));
    p.poly([[46, 66], [40, 80], [54, 70]], dark, 2.5);
    p.eye(70, 50, 4);
    p.line([[78, 60], [72, 62]], OUT, 2.5);
    p.circuit([[30, 52], [40, 52], [44, 48], [56, 48]]);
  },
  serpent(p, c, st, r) {
    const body = c.main, acc = c.acc;
    const pts = [];
    for (let i = 0; i < 7; i++) pts.push([14 + i * 9.5, 72 - Math.sin(i * 0.9 + 0.5) * 12 - i * 3]);
    pts.forEach(([x, y], i) => p.ell(x, y, 9 + i * 0.7 + st, 8 + i * 0.6 + st, i % 2 ? shade(body, -0.1) : body));
    pts.forEach(([x, y], i) => { if (i > 1 && i % 2 === 0) p.poly([[x - 3, y - 7 - st], [x + 1, y - 15 - st * 3], [x + 5, y - 7 - st]], acc, 2); });
    const [hx, hy] = [80, 30];
    p.ell(hx, hy, 15 + st, 11 + st, body);
    p.poly([[hx + 4, hy + 4], [hx + 20, hy + 6], [hx + 6, hy + 12]], shade(body, -0.2), 2.5);
    p.poly([[hx - 8, hy - 8], [hx - 14, hy - 22 - st * 3], [hx - 2, hy - 10]], acc, 2);
    p.eye(hx + 4, hy - 3);
    if (r() > 0.4) p.circuit([[24, 66], [34, 62], [44, 60]]);
  },
  blob(p, c, st) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.ell(50, 62, 30 + st * 3, 24 + st * 2, body);
    p.ell(36, 80, 8, 6, body); p.ell(64, 80, 8, 6, body);
    p.ell(50, 70, 18, 10, shade(body, 0.25));
    p.line([[50, 38 - st * 2], [50, 26 - st * 4]], c.out, 4);
    p.ell(44 - st, 22 - st * 4, 9 + st, 5 + st, acc, -0.5);
    p.ell(58 + st, 22 - st * 4, 9 + st, 5 + st, acc, 0.5);
    if (st >= 1) { p.ell(26, 50, 6, 10, dark, -0.4); p.ell(74, 50, 6, 10, dark, 0.4); }
    p.eye(42, 56, 4); p.eye(60, 56, 4);
    p.circuit([[30, 66], [38, 70], [38, 76]]);
  },
  bug(p, c, st) {
    const body = c.main, acc = c.acc;
    p.ell(36, 38, 18 + st * 4, 22 + st * 4, `${acc}88`, -0.4);
    p.ell(58, 36, 16 + st * 4, 20 + st * 4, `${acc}77`, 0.3);
    p.ell(26, 64, 13, 11, shade(body, -0.15));
    p.ell(42, 62, 13, 12, body);
    p.ell(58, 60, 12, 11, shade(body, -0.1));
    for (const x of [36, 48, 58]) p.line([[x, 70], [x - 3, 82]], c.out, 3);
    p.ell(72, 54, 12, 11, body);
    p.line([[74, 44], [80, 28]], c.out, 2.5); p.line([[78, 46], [90, 34]], c.out, 2.5);
    p.ell(80, 28, 3, 3, acc); p.ell(90, 34, 3, 3, acc);
    p.eye(77, 52);
  },
  golem(p, c, st) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.rect(30 - st, 68, 15 + st, 20, dark, 2); p.rect(56, 68, 15 + st, 20, dark, 2);
    p.rect(22 - st * 2, 30 - st * 3, 56 + st * 4, 42 + st * 2, body, 4);
    p.rect(12 - st * 2, 30 - st * 3, 16, 18, shade(body, -0.15), 3); p.rect(72 + st * 2, 30 - st * 3, 16, 18, shade(body, -0.15), 3);
    p.rect(12 - st * 2, 48 - st, 13, 26, dark, 3); p.rect(75 + st * 2, 48 - st, 13, 26, dark, 3);
    p.rect(38, 16 - st * 4, 26, 18, shade(body, 0.1), 3);
    p.rect(44, 22 - st * 4, 18, 6, OUT, 2);
    p.eye(54, 25 - st * 4, 2.8); p.eye(60, 25 - st * 4, 2.2);
    p.rect(40, 44 - st * 2, 20, 16, acc, 3); p.glow(50, 52 - st * 2, 16, c.eyeGlow);
    if (st >= 1) spikes(p, c, [24, 30 - st * 3], [76, 30 - st * 3], 3 + st, 5 + st * 3, acc);
    p.circuit([[28, 64], [36, 64], [36, 58]]);
  },
  orb(p, c, st) {
    const body = c.main, acc = c.acc;
    for (let i = 0; i < 3; i++) p.line([[40 + i * 9, 66], [34 + i * 10, 84 + (i % 2) * 4]], `${body}`, 5 - i);
    p.ell(50, 46, 26 + st * 3, 26 + st * 3, body);
    p.ell(50, 48, 40 + st * 4, 8 + st, "rgba(0,0,0,0)", -0.15);
    p.line([[14 - st * 3, 54], [86 + st * 3, 42]], acc, 2);
    p.ell(56, 42, 10 + st, 10 + st, "#0b0b18");
    p.eye(58, 42, 5 + st);
    if (st >= 1) { p.poly([[34, 26], [28, 6 - st * 3], [42, 22]], acc, 2); p.poly([[62, 22], [70, 4 - st * 3], [72, 26]], acc, 2); }
    p.circuit([[34, 54], [40, 60], [50, 60]]);
  },
  dragon(p, c, st) {
    p.poly([[40, 46], [6, 6], [30, 22], [36, 8], [52, 40]], shade(c.main, -0.2));
    p.poly([[56, 44], [92, 10], [78, 34], [90, 30], [66, 52]], shade(c.main, -0.25));
    SHAPES.quad(p, c, 2, () => 0.2);
    p.poly([[70, 26], [64, 6], [76, 22]], c.acc, 2);
  },
  titan(p, c) {
    const body = c.main, dark = c.dark, acc = c.acc;
    p.glow(50, 50, 48, `${c.eye}33`);
    p.rect(30, 70, 15, 20, dark, 2); p.rect(56, 70, 15, 20, dark, 2);
    p.poly([[22, 32], [78, 32], [72, 74], [28, 74]], body);
    p.rect(6, 26, 24, 16, acc, 4); p.rect(70, 26, 24, 16, acc, 4);
    p.rect(8, 42, 15, 32, dark, 4); p.rect(77, 42, 15, 32, dark, 4);
    p.ell(15, 78, 10, 8, body); p.ell(85, 78, 10, 8, body);
    p.rect(38, 12, 26, 20, shade(body, 0.08), 4);
    p.poly([[38, 14], [36, 0], [44, 10], [51, -2], [58, 10], [66, 0], [64, 14]], acc, 2);
    p.rect(42, 19, 18, 6, OUT, 2);
    p.eye(48, 22, 2.6); p.eye(55, 22, 2.6);
    p.ell(50, 50, 9, 9, acc); p.glow(50, 50, 22, c.eyeGlow); p.eye(50, 50, 4);
    p.circuit([[30, 40], [38, 46], [38, 64]]); p.circuit([[70, 40], [62, 46], [62, 64]]);
    const id = c.id;
    if (id === "fulgurtitan") { p.poly([[10, 26], [4, 10], [12, 14], [8, 0], [20, 20], [14, 18]], c.eye, 2); p.poly([[90, 26], [96, 10], [88, 14], [92, 0], [80, 20], [86, 18]], c.eye, 2); }
    if (id === "pyrotitan") { for (const x of [12, 18, 82, 88]) p.poly([[x - 4, 27], [x, 12 + (x % 3) * 3], [x + 4, 27]], "#fcee0a", 2); }
    if (id === "cryotitan") { for (const [x, y] of [[18, 22], [82, 22], [30, 30], [70, 30]]) p.poly([[x, y - 12], [x + 4, y], [x, y + 4], [x - 4, y]], "#e8fdff", 2); }
    if (id === "titanalpha") { p.rect(2, 22, 28, 10, c.dark, 3); p.rect(70, 22, 28, 10, c.dark, 3); }
    if (id === "titanomega") { p.poly([[24, 40], [0, 10], [10, 34], [2, 30], [22, 56]], c.acc, 2); p.poly([[76, 40], [100, 10], [90, 34], [98, 30], [78, 56]], c.acc, 2); }
  }
};

/* ---------- Rendu ---------- */

export function drawMon(ctx, speciesId, size, { flip = false, silhouette = false } = {}) {
  const sp = SPECIES[speciesId];
  if (!sp) return;
  const st = stageOf(speciesId);
  const typeColor = TYPES[sp.types[0]].color;
  const accColor = sp.types[1] ? TYPES[sp.types[1]].color : sp.col[1];
  const pal = silhouette
    ? { main: "#1a1a26", dark: "#14141e", acc: "#22222e", out: "#3a3a4e", eye: "#3a3a4e", eyeGlow: "rgba(0,0,0,0)", sil: true }
    : { main: sp.col[0], dark: sp.col[1], acc: accColor, out: OUT, eye: typeColor, eyeGlow: `${typeColor}aa`, sil: false };
  const scale = size / 100 * (st === 3 ? 0.92 : 0.8 + st * 0.07);
  ctx.save();
  // ombre au sol
  if (!silhouette) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    const floating = sp.shape === "orb" || sp.shape === "bird" || sp.shape === "bug";
    ctx.ellipse(size / 2, size * 0.92, size * (floating ? 0.22 : 0.32), size * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(size / 2, size);
  if (flip) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  ctx.translate(-50, -100);
  ctx.lineJoin = "round";
  const p = painter(ctx, pal);
  pal.id = speciesId;
  (SHAPES[sp.shape] || SHAPES.blob)(p, pal, Math.min(st, 2), hash(speciesId));
  ctx.restore();
}

// Image (data URL) mise en cache. size en pixels CSS ; rendu en 2× pour les écrans haute densité.
export function monSrc(speciesId, size = 96, opts = {}) {
  const key = `${speciesId}|${size}|${opts.flip ? 1 : 0}|${opts.silhouette ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  const px = size * 2;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  drawMon(ctx, speciesId, size, opts);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export function monImg(speciesId, size = 96, opts = {}) {
  const img = document.createElement("img");
  img.src = monSrc(speciesId, size, opts);
  img.width = size;
  img.height = size;
  img.alt = opts.silhouette ? "Créature inconnue" : SPECIES[speciesId]?.name || "";
  img.className = opts.className || "tt-sprite";
  img.draggable = false;
  return img;
}
