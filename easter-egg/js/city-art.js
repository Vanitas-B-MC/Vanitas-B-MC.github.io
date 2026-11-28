// js/city-art.js — dessins de « Cité des Âges » : vue isométrique, tout est dessiné au canvas (aucune image).
//
// Chaque bâtiment est fabriqué une fois en « sprite » (deux calques : le dessin et ses lumières de nuit),
// puis recopié à chaque image. Les volumes sont faits de petites primitives isométriques : boîtes, toits,
// cylindres, cônes, dômes, fenêtres. L'apparence dépend de l'ère : une maison de la préhistoire est une hutte,
// la même maison au Cyberpunk est une tour couverte de néons.

export const TW = 64, TH = 32;
const RX = 45.25, RY = 22.63;     // rayon (en px) d'un cercle d'une case une fois projeté

/* ===================== Couleurs ===================== */

function parse(c) {
  if (c[0] === "#") { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
}
export function shade(c, a) {
  const [r, g, b] = parse(c);
  const t = a < 0 ? 0 : 255, p = Math.min(1, Math.abs(a));
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
export function mix(c1, c2, t) {
  const a = parse(c1), b = parse(c2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
export const rgba = (c, a) => { const [r, g, b] = parse(c); return `rgba(${r},${g},${b},${a})`; };

// Palette de chaque ère.
export const PAL = [
  { wall: "#a7825a", wall2: "#8b6a46", roof: "#c8a45e", trim: "#5b4129", glass: "#2c2621", lit: "#ffae55", stone: "#9d968b", accent: "#c0563a" },
  { wall: "#eee2c6", wall2: "#dccaa3", roof: "#b9573a", trim: "#9b8560", glass: "#3b332c", lit: "#ffbd6b", stone: "#d9cfb6", accent: "#2e6ea6" },
  { wall: "#e6d8bb", wall2: "#cbb994", roof: "#6a5246", trim: "#4a3424", glass: "#2e2a28", lit: "#ffb257", stone: "#8f8b85", accent: "#a8322b" },
  { wall: "#ead6b2", wall2: "#d2b694", roof: "#56647b", trim: "#f3eee3", glass: "#38485a", lit: "#ffcf86", stone: "#c9c2b4", accent: "#c9a13a" },
  { wall: "#9a4a37", wall2: "#7f3b2c", roof: "#3f4148", trim: "#d9cdb6", glass: "#2c3138", lit: "#ffc66e", stone: "#7d7872", accent: "#3b5b45", metal: "#5d636b" },
  { wall: "#cdc8bb", wall2: "#a9b3ba", roof: "#6e7176", trim: "#ece8de", glass: "#4b6d8b", lit: "#fff0bf", stone: "#a5a39d", accent: "#d24a3a", metal: "#8a9097" },
  { wall: "#e3e9f0", wall2: "#bfcad6", roof: "#9aa7b4", trim: "#ffffff", glass: "#5aa6d6", lit: "#e9f7ff", stone: "#c6cbd1", accent: "#18b0a0", metal: "#aab4bf" },
  { wall: "#2b2938", wall2: "#1f1d2a", roof: "#16151e", trim: "#3d3a52", glass: "#2b2350", lit: "#ff63d0", stone: "#3b3947", accent: "#05d9e8", metal: "#4a4860" }
];
export const NEON = ["#ff2a6d", "#05d9e8", "#fcee0a", "#b026ff", "#39ff88", "#ff8a00"];

export const GRASS = ["#6eab4d", "#6cab4c", "#6aa64b", "#68a24b", "#65a04b", "#62a050", "#5f9f55", "#2f4a44"];

/* ===================== Primitives ===================== */

function poly(g, pts, fill, stroke, lw = 0.7) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function vgrad(g, x, y0, y1, c0, c1) {
  const gr = g.createLinearGradient(x, y0, x, y1);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1);
  return gr;
}

// Contexte de dessin d'un sprite : P(x, y, z) projette un point (cases, cases, pixels) à l'écran.
function makeCtx(g, L, ax, ay, rnd, era) {
  const P = (x, y, z = 0) => [ax + (x - y) * (TW / 2), ay + (x + y) * (TH / 2) - z];
  return { g, L, P, rnd, era, pal: PAL[era], emit: [], ax, ay };
}

// Boîte (prisme droit) de (x0, y0) à (x1, y1), de la hauteur z0 à z1. Faces visibles : dessus, gauche (y = y1), droite (x = x1).
function box(c, x0, y0, x1, y1, z0, z1, col, o = {}) {
  const { g, P } = c;
  const left = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
  const right = [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)];
  const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  const edge = o.edge === false ? null : rgba(shade(col, -0.6), 0.35);
  const lc = o.left || col, rc = o.right || shade(col, -0.24);
  poly(g, left, vgrad(g, 0, left[3][1], left[0][1], shade(lc, 0.05), shade(lc, -0.16)), edge);
  poly(g, right, vgrad(g, 0, right[3][1], right[0][1], shade(rc, 0.02), shade(rc, -0.2)), edge);
  if (o.top !== false) poly(g, top, o.top || shade(col, 0.16), edge);
  return { left, right, top };
}

// Plaque au sol (pavés, pelouse…)
function plate(c, x0, y0, x1, y1, col, z = 1.5) { box(c, x0, y0, x1, y1, 0, z, col, { edge: false }); }

// Fenêtres sur une face : "L" (face y = y1) ou "R" (face x = x1). u0..u1 le long de la face, z0..z1 la hauteur.
function windows(c, face, fixed, u0, u1, z0, z1, o = {}) {
  const { g, L, P, rnd } = c;
  const rows = o.rows ?? 1, cols = o.cols ?? 2;
  const fw = o.fw ?? 0.5, fh = o.fh ?? 0.55;
  const glass = o.glass || c.pal.glass;
  const lit = o.lit || c.pal.lit;
  const chance = o.chance ?? 0.55;
  const cw = (u1 - u0) / cols, rh = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const a = u0 + cw * (k + (1 - fw) / 2), b = a + cw * fw;
    const zb = z0 + rh * (r + (1 - fh) / 2), zt = zb + rh * fh;
    const q = face === "L"
      ? [P(a, fixed, zb), P(b, fixed, zb), P(b, fixed, zt), P(a, fixed, zt)]
      : [P(fixed, b, zb), P(fixed, a, zb), P(fixed, a, zt), P(fixed, b, zt)];
    const isLit = rnd() < chance;
    poly(g, q, face === "L" ? glass : shade(glass, -0.15));
    // reflet du ciel
    if (o.reflect !== false) poly(g, [q[3], q[2], [q[2][0] * 0.5 + q[1][0] * 0.5, q[2][1] * 0.6 + q[1][1] * 0.4], [q[3][0] * 0.5 + q[0][0] * 0.5, q[3][1] * 0.6 + q[0][1] * 0.4]], "rgba(255,255,255,.13)");
    if (o.frame) poly(g, q, null, o.frame, 0.6);
    if (isLit && L) {
      const col = Array.isArray(lit) ? lit[Math.floor(rnd() * lit.length)] : lit;
      L.shadowColor = col; L.shadowBlur = 5;
      poly(L, q, col);
      L.shadowBlur = 0;
    }
  }
}

// Bandeau lumineux (néon) sur une face. Visible le jour (plus pâle) et la nuit (calque lumière).
function neonStrip(c, face, fixed, u0, u1, z0, z1, col) {
  const { g, L, P } = c;
  const q = face === "L"
    ? [P(u0, fixed, z0), P(u1, fixed, z0), P(u1, fixed, z1), P(u0, fixed, z1)]
    : [P(fixed, u1, z0), P(fixed, u0, z0), P(fixed, u0, z1), P(fixed, u1, z1)];
  poly(g, q, col);
  if (L) { L.shadowColor = col; L.shadowBlur = 10; poly(L, q, col); poly(L, q, "rgba(255,255,255,.55)"); L.shadowBlur = 0; }
}

// Toit à deux pans. axis "x" : faîtage le long de x.
function gable(c, x0, y0, x1, y1, z, h, col, axis = "x", o = {}) {
  const { g, P } = c;
  const ov = o.over ?? 0.06;
  x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
  const edge = rgba(shade(col, -0.6), 0.4);
  if (axis === "x") {
    const ym = (y0 + y1) / 2;
    poly(g, [P(x0, y0, z), P(x1, y0, z), P(x1, ym, z + h), P(x0, ym, z + h)], shade(col, -0.18), edge);
    poly(g, [P(x0, ym, z + h), P(x1, ym, z + h), P(x1, y1, z), P(x0, y1, z)], vgrad(g, 0, P(x0, ym, z + h)[1], P(x0, y1, z)[1], shade(col, 0.12), shade(col, -0.05)), edge);
    poly(g, [P(x1, y0 + ov, z), P(x1, y1 - ov, z), P(x1, ym, z + h - 1)], o.end || shade(o.wall || col, -0.28), edge);
    if (o.tiles) for (let i = 1; i < 5; i++) { const t = i / 5; const a = P(x0 + (x1 - x0) * t, ym, z + h), b = P(x0 + (x1 - x0) * t, y1, z); g.strokeStyle = rgba(shade(col, -0.5), 0.25); g.lineWidth = 0.6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  } else {
    const xm = (x0 + x1) / 2;
    poly(g, [P(x0, y0, z), P(xm, y0, z + h), P(xm, y1, z + h), P(x0, y1, z)], shade(col, -0.05), edge);
    poly(g, [P(xm, y0, z + h), P(x1, y0, z), P(x1, y1, z), P(xm, y1, z + h)], vgrad(g, 0, P(xm, y0, z + h)[1], P(x1, y1, z)[1], shade(col, -0.12), shade(col, -0.3)), edge);
    poly(g, [P(x0 + ov, y1, z), P(x1 - ov, y1, z), P(xm, y1, z + h - 1)], o.end || shade(o.wall || col, -0.05), edge);
    if (o.tiles) for (let i = 1; i < 5; i++) { const t = i / 5; const a = P(xm, y0 + (y1 - y0) * t, z + h), b = P(x1, y0 + (y1 - y0) * t, z); g.strokeStyle = rgba(shade(col, -0.5), 0.25); g.lineWidth = 0.6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  }
}

// Toit en pyramide (4 pans).
function pyramid(c, x0, y0, x1, y1, z, h, col, o = {}) {
  const { g, P } = c;
  const ov = o.over ?? 0.05;
  x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
  const apex = P((x0 + x1) / 2, (y0 + y1) / 2, z + h);
  const edge = rgba(shade(col, -0.6), 0.4);
  poly(g, [P(x0, y0, z), P(x1, y0, z), apex], shade(col, -0.1), edge);
  poly(g, [P(x0, y0, z), P(x0, y1, z), apex], shade(col, 0.05), edge);
  poly(g, [P(x0, y1, z), P(x1, y1, z), apex], shade(col, 0.1), edge);
  poly(g, [P(x1, y0, z), P(x1, y1, z), apex], shade(col, -0.22), edge);
}

// Cylindre vertical (centre cx, cy ; rayon r en cases).
function cylinder(c, cx, cy, r, z0, z1, col, o = {}) {
  const { g, P } = c;
  const [X, Yb] = P(cx, cy, z0), Yt = P(cx, cy, z1)[1];
  const rx = r * RX, ry = r * RY;
  const gr = g.createLinearGradient(X - rx, 0, X + rx, 0);
  gr.addColorStop(0, shade(col, 0.12)); gr.addColorStop(0.45, col); gr.addColorStop(1, shade(col, -0.38));
  g.beginPath();
  g.moveTo(X - rx, Yt);
  g.lineTo(X - rx, Yb);
  g.ellipse(X, Yb, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(X + rx, Yt);
  g.closePath();
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba(shade(col, -0.6), 0.3); g.lineWidth = 0.6; g.stroke();
  if (o.top !== false) {
    g.beginPath(); g.ellipse(X, Yt, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = o.top || shade(col, 0.2); g.fill();
    g.strokeStyle = rgba(shade(col, -0.6), 0.3); g.stroke();
  }
}

function cone(c, cx, cy, r, z0, h, col) {
  const { g, P } = c;
  const [X, Y] = P(cx, cy, z0);
  const rx = r * RX, ry = r * RY;
  const gr = g.createLinearGradient(X - rx, 0, X + rx, 0);
  gr.addColorStop(0, shade(col, 0.15)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.35));
  g.beginPath();
  g.moveTo(X - rx, Y);
  g.lineTo(X, Y - h);
  g.lineTo(X + rx, Y);
  g.ellipse(X, Y, rx, ry, 0, 0, Math.PI, false);
  g.closePath();
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba(shade(col, -0.6), 0.3); g.lineWidth = 0.6; g.stroke();
}

function dome(c, cx, cy, r, z, h, col) {
  const { g, P } = c;
  const [X, Y] = P(cx, cy, z);
  const rx = r * RX, ry = r * RY;
  const gr = g.createRadialGradient(X - rx * 0.35, Y - h * 0.7, 1, X, Y - h * 0.3, rx * 1.2);
  gr.addColorStop(0, shade(col, 0.4)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.35));
  g.beginPath();
  g.ellipse(X, Y, rx, ry, 0, 0, Math.PI, false);
  g.ellipse(X, Y, rx, h, 0, Math.PI, 0, false);
  g.closePath();
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba(shade(col, -0.6), 0.3); g.lineWidth = 0.6; g.stroke();
}

function ellipseFill(c, cx, cy, z, rx, ry, col) {
  const [X, Y] = c.P(cx, cy, z);
  c.g.beginPath(); c.g.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); c.g.fillStyle = col; c.g.fill();
}

// Ombre douce au sol sous un bâtiment.
function groundShadow(c, x0, y0, x1, y1, h) {
  const { g, P } = c;
  const off = Math.min(0.45, h / 260);
  poly(g, [P(x0, y1, 0), P(x1, y1, 0), P(x1 + off * 0.2, y1 + off, 0), P(x0 + off * 0.2, y1 + off, 0)], "rgba(20,25,40,.14)");
  poly(g, [P(x1, y0, 0), P(x1, y1, 0), P(x1 + off, y1 + off * 0.2, 0), P(x1 + off, y0 + off * 0.2, 0)], "rgba(20,25,40,.09)");
}

function emit(c, x, y, z, kind) {
  const [sx, sy] = c.P(x, y, z);
  c.emit.push({ dx: sx - c.ax, dy: sy - c.ay, kind });
}

function chimney(c, x, y, z, h, col, smoke = true) {
  box(c, x, y, x + 0.12, y + 0.12, z, z + h, col);
  box(c, x - 0.015, y - 0.015, x + 0.135, y + 0.135, z + h, z + h + 2, shade(col, -0.2));
  if (smoke) emit(c, x + 0.06, y + 0.06, z + h + 3, "smoke");
}

function antenna(c, x, y, z, h, blink = true) {
  const { g, P } = c;
  const a = P(x, y, z), b = P(x, y, z + h);
  g.strokeStyle = "#555a66"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  if (blink) emit(c, x, y, z + h, "blink");
}

function flag(c, x, y, z, h, col) {
  const { g, P } = c;
  const a = P(x, y, z), b = P(x, y, z + h);
  g.strokeStyle = "#3a3330"; g.lineWidth = 1; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  poly(g, [b, [b[0] + 10, b[1] + 2], [b[0] + 9, b[1] + 6], [b[0], b[1] + 7]], col);
}

function crenels(c, x0, y0, x1, y1, z, col, n = 4) {
  const w = (x1 - x0) / (n * 2 - 1), d = (y1 - y0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) {
    box(c, x0 + i * 2 * w, y1 - 0.08, x0 + i * 2 * w + w, y1, z, z + 4, col, { edge: false });
    box(c, x1 - 0.08, y0 + i * 2 * d, x1, y0 + i * 2 * d + d, z, z + 4, col, { edge: false });
  }
}

function columns(c, face, fixed, u0, u1, z0, z1, n, col) {
  for (let i = 0; i < n; i++) {
    const u = u0 + (u1 - u0) * (i / (n - 1));
    if (face === "L") cylinder(c, u, fixed, 0.045, z0, z1, col, { top: false });
    else cylinder(c, fixed, u, 0.045, z0, z1, col, { top: false });
  }
}

// Arbres
function treeRound(c, x, y, s, col) {
  const { g, P } = c;
  const [X, Y] = P(x, y, 0);
  g.fillStyle = "rgba(20,30,20,.22)"; g.beginPath(); g.ellipse(X + 3 * s, Y + 1, 9 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#5b3f28"; g.fillRect(X - 1.2 * s, Y - 9 * s, 2.4 * s, 9 * s);
  const blob = (dx, dy, r, cc) => { const gr = g.createRadialGradient(X + dx - r * 0.4, Y + dy - r * 0.5, 1, X + dx, Y + dy, r); gr.addColorStop(0, shade(cc, 0.25)); gr.addColorStop(1, shade(cc, -0.25)); g.fillStyle = gr; g.beginPath(); g.arc(X + dx, Y + dy, r, 0, Math.PI * 2); g.fill(); };
  blob(-4 * s, -13 * s, 6 * s, col); blob(4 * s, -13 * s, 6 * s, shade(col, -0.05)); blob(0, -18 * s, 7 * s, col);
}
function treePine(c, x, y, s, col) {
  const { g, P } = c;
  const [X, Y] = P(x, y, 0);
  g.fillStyle = "rgba(20,30,20,.22)"; g.beginPath(); g.ellipse(X + 3 * s, Y + 1, 7 * s, 3.5 * s, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#4e3622"; g.fillRect(X - 1 * s, Y - 6 * s, 2 * s, 6 * s);
  for (let i = 0; i < 3; i++) {
    const w = (8 - i * 2) * s, yb = Y - (4 + i * 6) * s, yt = yb - 10 * s;
    g.beginPath(); g.moveTo(X - w, yb); g.lineTo(X, yt); g.lineTo(X + w, yb); g.closePath();
    const gr = g.createLinearGradient(X - w, 0, X + w, 0);
    gr.addColorStop(0, shade(col, 0.15)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.3));
    g.fillStyle = gr; g.fill();
  }
}
function bush(c, x, y, s, col) {
  const { g, P } = c;
  const [X, Y] = P(x, y, 0);
  const gr = g.createRadialGradient(X - 2 * s, Y - 5 * s, 1, X, Y - 3 * s, 6 * s);
  gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(1, shade(col, -0.25));
  g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y - 3 * s, 6 * s, 4.5 * s, 0, 0, Math.PI * 2); g.fill();
}
function person(c, x, y, col) {
  const { g, P } = c;
  const [X, Y] = P(x, y, 0);
  g.fillStyle = col; g.fillRect(X - 1, Y - 5, 2, 4);
  g.fillStyle = "#e9c9a5"; g.fillRect(X - 1, Y - 7, 2, 2);
}

/* ===================== Sprites ===================== */

// Crée un sprite : draw(c) dessine dans un contexte isométrique dont l'origine est le coin du haut de l'emprise.
export function makeSprite(size, headroom, scale, era, seed, draw, withLight = true) {
  const pad = 16;
  const w = size * TW + pad * 2, h = size * TH + headroom + pad;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale);
  const g = cv.getContext("2d");
  g.scale(scale, scale);
  let lc = null, L = null;
  if (withLight) {
    lc = document.createElement("canvas");
    lc.width = cv.width; lc.height = cv.height;
    L = lc.getContext("2d"); L.scale(scale, scale);
  }
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const c = makeCtx(g, L, pad + size * TW / 2, headroom, rnd, era);
  draw(c);
  return { c: cv, l: withLight ? lc : null, ax: pad + size * TW / 2, ay: headroom, w, h, emit: c.emit };
}

/* ---------- Habitations (selon l'ère et le niveau) ---------- */

function drawHouse(c, era, lv, v) {
  const p = c.pal, r = c.rnd;
  const hue = [p.wall, p.wall2, shade(p.wall, -0.08), mix(p.wall, p.accent, 0.15)][v % 4];
  switch (era) {
    case 0: {
      if (lv === 1) {
        cylinder(c, 0.5, 0.5, 0.26, 0, 8, "#9b7448", { top: false });
        cone(c, 0.5, 0.5, 0.33, 7, 20, p.roof);
        emit(c, 0.5, 0.95, 2, "glow");
      } else if (lv === 2) {
        cylinder(c, 0.32, 0.36, 0.2, 0, 7, "#9b7448", { top: false }); cone(c, 0.32, 0.36, 0.26, 6, 16, p.roof);
        cylinder(c, 0.66, 0.66, 0.22, 0, 7, "#8e6a42", { top: false }); cone(c, 0.66, 0.66, 0.28, 6, 18, shade(p.roof, -0.06));
      } else {
        box(c, 0.15, 0.25, 0.85, 0.75, 0, 9, "#8c6640");
        gable(c, 0.15, 0.25, 0.85, 0.75, 9, 13, p.roof, "x", { wall: "#8c6640" });
        windows(c, "L", 0.75, 0.2, 0.8, 1, 8, { cols: 2, fh: 0.8, glass: "#2a1d12", chance: 0.8 });
        treePine(c, 0.9, 0.2, 0.5, "#3f6b3a");
      }
      break;
    }
    case 1: {
      const H = [12, 16, 22][lv - 1];
      if (lv < 3) {
        box(c, 0.18, 0.2, 0.82, 0.8, 0, H, hue);
        windows(c, "L", 0.8, 0.18, 0.82, 2, H - 3, { cols: lv + 1, fh: 0.5, fw: 0.35 });
        windows(c, "R", 0.82, 0.2, 0.8, 2, H - 3, { cols: lv, fh: 0.5, fw: 0.35 });
        if (lv === 1) gable(c, 0.18, 0.2, 0.82, 0.8, H, 7, p.roof, "y", { wall: hue, tiles: true });
        else pyramid(c, 0.18, 0.2, 0.82, 0.8, H, 9, p.roof);
      } else {
        box(c, 0.08, 0.08, 0.92, 0.5, 0, H, hue);
        box(c, 0.08, 0.5, 0.5, 0.92, 0, H - 6, hue);
        windows(c, "L", 0.92, 0.08, 0.5, 2, H - 9, { cols: 2 });
        windows(c, "R", 0.92, 0.08, 0.5, 2, H - 3, { cols: 3, rows: 2 });
        gable(c, 0.08, 0.08, 0.92, 0.5, H, 7, p.roof, "x", { wall: hue, tiles: true });
        gable(c, 0.08, 0.5, 0.5, 0.92, H - 6, 6, p.roof, "y", { wall: hue });
        bush(c, 0.75, 0.8, 0.6, "#4c8a3e");
      }
      break;
    }
    case 2: {
      const floors = lv, H = 9 + floors * 9;
      box(c, 0.2, 0.22, 0.8, 0.78, 0, 6, p.stone);
      box(c, 0.17, 0.19, 0.83, 0.81, 6, H, hue);
      // colombages
      const { g, P } = c;
      g.strokeStyle = p.trim; g.lineWidth = 1.1;
      for (let i = 0; i <= 3; i++) { const u = 0.17 + i * 0.22; g.beginPath(); g.moveTo(...P(u, 0.81, 6)); g.lineTo(...P(u, 0.81, H)); g.stroke(); const w = 0.19 + i * 0.207; g.beginPath(); g.moveTo(...P(0.83, w, 6)); g.lineTo(...P(0.83, w, H)); g.stroke(); }
      for (let f = 1; f <= floors; f++) { const z = 6 + f * 9 - 0.5; g.beginPath(); g.moveTo(...P(0.17, 0.81, z)); g.lineTo(...P(0.83, 0.81, z)); g.lineTo(...P(0.83, 0.19, z)); g.stroke(); }
      g.beginPath(); g.moveTo(...P(0.17, 0.81, 6)); g.lineTo(...P(0.39, 0.81, 15)); g.stroke();
      windows(c, "L", 0.81, 0.17, 0.83, 7, H - 1, { rows: floors, cols: 2, fw: 0.3, fh: 0.5, chance: 0.6 });
      windows(c, "R", 0.83, 0.19, 0.81, 7, H - 1, { rows: floors, cols: 2, fw: 0.3, fh: 0.5, chance: 0.5 });
      gable(c, 0.17, 0.19, 0.83, 0.81, H, 15, v % 2 ? p.roof : "#7b5a3c", v % 2 ? "x" : "y", { wall: hue, tiles: true });
      chimney(c, 0.62, 0.3, H + 4, 10, p.stone, r() < 0.6);
      break;
    }
    case 3: {
      const floors = lv + 1, H = floors * 10 + 4;
      const col = ["#e8d5b0", "#d9b99a", "#c9d4d8", "#e5c7a1"][v % 4];
      box(c, 0.14, 0.14, 0.86, 0.86, 0, 4, p.stone);
      box(c, 0.16, 0.16, 0.84, 0.84, 4, H, col);
      windows(c, "L", 0.84, 0.16, 0.84, 5, H - 1, { rows: floors, cols: 3, fw: 0.42, fh: 0.6, frame: p.trim });
      windows(c, "R", 0.84, 0.16, 0.84, 5, H - 1, { rows: floors, cols: 3, fw: 0.42, fh: 0.6, frame: p.trim });
      box(c, 0.14, 0.14, 0.86, 0.86, H, H + 2, p.trim);
      // toit mansardé
      pyramid(c, 0.16, 0.16, 0.84, 0.84, H + 2, 10 + lv * 2, p.roof, { over: 0 });
      box(c, 0.56, 0.68, 0.7, 0.86, H + 2, H + 8, col);
      gable(c, 0.56, 0.68, 0.7, 0.86, H + 8, 4, p.roof, "y", { over: 0.01, wall: col });
      chimney(c, 0.28, 0.3, H + 4, 10, "#a2765a", false);
      break;
    }
    case 4: {
      const floors = [2, 4, 6][lv - 1], H = floors * 9 + 3;
      const col = [p.wall, p.wall2, "#8c5340", "#a4593f"][v % 4];
      box(c, 0.12, 0.12, 0.88, 0.88, 0, H, col);
      box(c, 0.12, 0.12, 0.88, 0.88, 0, 4, "#5f5650", { top: false });
      windows(c, "L", 0.88, 0.12, 0.88, 5, H - 2, { rows: floors, cols: 3, fw: 0.36, fh: 0.62, frame: "#e7dccb", chance: 0.6 });
      windows(c, "R", 0.88, 0.12, 0.88, 5, H - 2, { rows: floors, cols: 3, fw: 0.36, fh: 0.62, frame: "#e7dccb", chance: 0.5 });
      box(c, 0.1, 0.1, 0.9, 0.9, H, H + 2.5, "#6b625b");
      if (lv === 1) gable(c, 0.12, 0.12, 0.88, 0.88, H + 2.5, 9, p.roof, "x", { wall: col });
      chimney(c, 0.25, 0.2, H + 2, 12, "#7b4b3a");
      chimney(c, 0.65, 0.22, H + 2, 9, "#7b4b3a", r() < 0.6);
      if (lv === 3) { cylinder(c, 0.6, 0.55, 0.12, H + 2, H + 12, "#6b5240"); cone(c, 0.6, 0.55, 0.14, H + 12, 4, "#4a3a30"); }
      break;
    }
    case 5: {
      if (lv === 1) {
        plate(c, 0.04, 0.04, 0.96, 0.96, "#7fb862", 1);
        box(c, 0.2, 0.2, 0.7, 0.78, 1, 14, ["#e9e2d0", "#d8e0e8", "#f0d9c0", "#d9e4cf"][v % 4]);
        windows(c, "L", 0.78, 0.2, 0.7, 3, 12, { cols: 2, fw: 0.55, fh: 0.55 });
        windows(c, "R", 0.7, 0.2, 0.78, 3, 12, { cols: 2, fw: 0.45 });
        gable(c, 0.2, 0.2, 0.7, 0.78, 14, 7, ["#8a4a3a", "#55606e", "#6e6e6e", "#7b5c45"][v % 4], "y");
        box(c, 0.7, 0.45, 0.92, 0.78, 1, 9, "#d8d2c4");
        treeRound(c, 0.85, 0.2, 0.7, "#4f9440");
      } else {
        const floors = lv === 2 ? 6 : 12, H = floors * 7.5 + 4;
        const col = [p.wall, p.wall2, "#d9cbb5", "#b9c1c7"][v % 4];
        box(c, 0.14, 0.14, 0.86, 0.86, 0, H, col);
        windows(c, "L", 0.86, 0.14, 0.86, 3, H - 2, { rows: floors, cols: 4, fw: 0.7, fh: 0.55, chance: 0.5 });
        windows(c, "R", 0.86, 0.14, 0.86, 3, H - 2, { rows: floors, cols: 4, fw: 0.7, fh: 0.55, chance: 0.45 });
        box(c, 0.12, 0.12, 0.88, 0.88, H, H + 2, "#8b8f94");
        box(c, 0.3, 0.3, 0.55, 0.5, H + 2, H + 8, "#9da2a8");
        if (lv === 3) antenna(c, 0.7, 0.3, H + 2, 18);
      }
      break;
    }
    case 6: {
      if (lv === 1) {
        plate(c, 0.04, 0.04, 0.96, 0.96, "#82bd6b", 1);
        box(c, 0.16, 0.2, 0.84, 0.7, 1, 12, "#f4f6f8");
        box(c, 0.3, 0.2, 0.84, 0.7, 12, 22, "#e9edf1");
        windows(c, "L", 0.7, 0.16, 0.84, 2, 11, { cols: 3, fw: 0.85, fh: 0.75, glass: p.glass, chance: 0.5 });
        windows(c, "R", 0.84, 0.2, 0.7, 13, 21, { cols: 2, fw: 0.85, fh: 0.75, glass: p.glass, chance: 0.5 });
        box(c, 0.3, 0.72, 0.6, 0.95, 0, 1.5, "#5fb6e0", { edge: false });
        treeRound(c, 0.2, 0.85, 0.6, "#5aa34a");
      } else {
        const floors = lv === 2 ? 12 : 24, H = floors * 6 + 6;
        const glass = [p.glass, "#4f8fc9", "#6bb5c9", "#7d9fd6"][v % 4];
        box(c, 0.16, 0.16, 0.84, 0.84, 0, H, glass, { left: shade(glass, 0.05), right: shade(glass, -0.3) });
        for (let f = 1; f < floors; f++) { const z = f * 6; neonLine(c, 0.16, 0.84, z, "rgba(255,255,255,.35)"); }
        windows(c, "L", 0.84, 0.16, 0.84, 2, H - 2, { rows: floors, cols: 5, fw: 0.9, fh: 0.85, glass: rgba("#ffffff", 0), lit: p.lit, chance: 0.3, reflect: false });
        windows(c, "R", 0.84, 0.16, 0.84, 2, H - 2, { rows: floors, cols: 5, fw: 0.9, fh: 0.85, glass: rgba("#ffffff", 0), lit: p.lit, chance: 0.3, reflect: false });
        box(c, 0.2, 0.2, 0.8, 0.8, H, H + 4, "#dfe6ee");
        if (lv === 3) { box(c, 0.3, 0.3, 0.7, 0.7, H + 4, H + 16, glass); antenna(c, 0.5, 0.5, H + 16, 16); }
      }
      break;
    }
    default: {
      // Cyberpunk
      const neon = NEON[v % NEON.length], neon2 = NEON[(v + 2) % NEON.length];
      if (lv === 1) {
        box(c, 0.12, 0.12, 0.88, 0.88, 0, 12, "#3a3648");
        box(c, 0.18, 0.18, 0.62, 0.82, 12, 24, "#4a3f5c");
        box(c, 0.25, 0.55, 0.82, 0.86, 24, 34, "#2e3a4a");
        windows(c, "L", 0.88, 0.12, 0.88, 2, 10, { cols: 3, glass: "#1d1730", lit: NEON, chance: 0.7 });
        windows(c, "R", 0.62, 0.18, 0.82, 14, 22, { cols: 2, glass: "#1d1730", lit: NEON, chance: 0.7 });
        neonStrip(c, "L", 0.86, 0.3, 0.75, 27, 30, neon);
        box(c, 0.66, 0.2, 0.8, 0.34, 12, 18, "#555a66");
      } else {
        const H = lv === 2 ? 100 : 170;
        box(c, 0.12, 0.12, 0.88, 0.88, 0, 14, "#2c2a3c");
        box(c, 0.18, 0.18, 0.82, 0.82, 14, H, p.wall, { right: "#18161f" });
        windows(c, "L", 0.82, 0.18, 0.82, 16, H - 4, { rows: Math.floor(H / 7), cols: 4, fw: 0.6, fh: 0.4, glass: "#1a1626", lit: ["#ff63d0", "#7af7ff", "#ffe066", "#ffffff"], chance: 0.35, reflect: false });
        windows(c, "R", 0.82, 0.18, 0.82, 16, H - 4, { rows: Math.floor(H / 7), cols: 4, fw: 0.6, fh: 0.4, glass: "#14121d", lit: ["#ff63d0", "#7af7ff", "#ffffff"], chance: 0.3, reflect: false });
        neonStrip(c, "L", 0.82, 0.18, 0.2, 14, H, neon);
        neonStrip(c, "R", 0.82, 0.8, 0.82, 14, H, neon2);
        neonStrip(c, "L", 0.83, 0.3, 0.7, H * 0.55, H * 0.55 + 10, neon2);
        box(c, 0.25, 0.25, 0.75, 0.75, H, H + 10, "#3c3950");
        antenna(c, 0.5, 0.4, H + 10, 26);
        if (lv === 3) { neonStrip(c, "R", 0.83, 0.3, 0.7, H * 0.3, H * 0.3 + 14, NEON[(v + 4) % 6]); emit(c, 0.5, 0.5, H + 20, "holo"); }
        windows(c, "L", 0.88, 0.12, 0.88, 2, 12, { cols: 3, glass: "#1d1730", lit: NEON, chance: 0.8 });
      }
    }
  }
}

function neonLine(c, u0, u1, z, col) {
  const { g, P } = c;
  g.strokeStyle = col; g.lineWidth = 0.6;
  g.beginPath(); g.moveTo(...P(u0, 0.84, z)); g.lineTo(...P(0.84, 0.84, z)); g.lineTo(...P(0.84, u0, z)); g.stroke();
}

/* ---------- Centre-ville (change à chaque ère) ---------- */

function drawCenter(c, era) {
  const p = c.pal;
  switch (era) {
    case 0: {
      plate(c, 0.2, 0.2, 1.8, 1.8, "#a48d68", 1);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const x = 1 + Math.cos(a) * 0.32, y = 1 + Math.sin(a) * 0.32; box(c, x - 0.05, y - 0.05, x + 0.05, y + 0.05, 1, 4, "#8b857b", { edge: false }); }
      ellipseFill(c, 1, 1, 2, 12, 6, "#2a1a10");
      emit(c, 1, 1, 6, "fire"); emit(c, 1, 1, 4, "glow");
      for (const [x, y, s] of [[0.45, 0.45, 1], [1.55, 0.45, 0.9], [0.45, 1.55, 0.9]]) { cylinder(c, x, y, 0.2 * s, 1, 8, "#9b7448", { top: false }); cone(c, x, y, 0.26 * s, 7, 18 * s, p.roof); }
      box(c, 1.5, 1.5, 1.6, 1.6, 1, 34, "#7a5636");
      box(c, 1.42, 1.5, 1.68, 1.6, 26, 30, "#b8563a", { edge: false });
      break;
    }
    case 1: {
      plate(c, 0.1, 0.1, 1.9, 1.9, "#ddd2b8", 3);
      box(c, 0.35, 0.35, 1.65, 1.5, 3, 7, "#e9dfc8");
      columns(c, "L", 1.48, 0.42, 1.58, 7, 30, 6, "#f3ead6");
      columns(c, "R", 1.63, 0.45, 1.45, 7, 30, 4, "#f3ead6");
      box(c, 0.35, 0.35, 1.65, 1.5, 30, 35, "#efe6d2");
      gable(c, 0.35, 0.35, 1.65, 1.5, 35, 14, p.roof, "x", { wall: "#efe6d2", tiles: true });
      box(c, 1.7, 1.7, 1.85, 1.85, 3, 10, "#cfc4aa"); cylinder(c, 1.775, 1.775, 0.05, 10, 22, "#d9cfb8");
      break;
    }
    case 2: {
      plate(c, 0.05, 0.05, 1.95, 1.95, "#8d8a84", 2);
      box(c, 0.1, 0.1, 1.9, 1.9, 2, 26, "#9a958c");
      crenels(c, 0.1, 0.1, 1.9, 1.9, 26, "#9a958c", 6);
      box(c, 0.55, 0.55, 1.45, 1.45, 26, 80, "#a6a097");
      windows(c, "L", 1.45, 0.6, 1.4, 40, 76, { rows: 3, cols: 3, fw: 0.25, fh: 0.5, chance: 0.6 });
      windows(c, "R", 1.45, 0.6, 1.4, 40, 76, { rows: 3, cols: 3, fw: 0.25, fh: 0.5, chance: 0.6 });
      crenels(c, 0.55, 0.55, 1.45, 1.45, 80, "#a6a097", 4);
      for (const [x, y] of [[0.1, 1.75], [1.75, 0.1], [1.75, 1.75]]) { cylinder(c, x + 0.075, y + 0.075, 0.17, 2, 42, "#9e998f"); cone(c, x + 0.075, y + 0.075, 0.2, 42, 20, "#5b4a6e"); }
      box(c, 0.85, 1.88, 1.15, 1.92, 2, 16, "#3a2a1c", { edge: false });
      flag(c, 1, 1, 80, 22, p.accent);
      break;
    }
    case 3: {
      plate(c, 0.05, 0.05, 1.95, 1.95, "#c9c2b4", 2);
      box(c, 0.15, 0.3, 1.85, 1.7, 2, 40, "#ead8b6");
      windows(c, "L", 1.7, 0.15, 1.85, 5, 38, { rows: 3, cols: 7, fw: 0.4, frame: "#fff" });
      windows(c, "R", 1.85, 0.3, 1.7, 5, 38, { rows: 3, cols: 6, fw: 0.4, frame: "#fff" });
      box(c, 0.12, 0.27, 1.88, 1.73, 40, 43, "#f3eee3");
      pyramid(c, 0.15, 0.3, 1.85, 1.7, 43, 16, p.roof, { over: 0 });
      box(c, 0.75, 0.75, 1.25, 1.25, 43, 85, "#efe2c6");
      windows(c, "L", 1.25, 0.75, 1.25, 60, 80, { cols: 2, fw: 0.4 });
      ellipseFill(c, 1.25, 1.0, 70, 6, 6, "#f8f3e6");
      dome(c, 1, 1, 0.3, 85, 22, "#6d8fa6");
      antenna(c, 1, 1, 105, 14, false);
      break;
    }
    case 4: {
      plate(c, 0.05, 0.05, 1.95, 1.95, "#8a837b", 2);
      box(c, 0.12, 0.25, 1.88, 1.75, 2, 52, "#9a4a37");
      windows(c, "L", 1.75, 0.12, 1.88, 5, 50, { rows: 4, cols: 8, fw: 0.4, frame: "#e7dccb" });
      windows(c, "R", 1.88, 0.25, 1.75, 5, 50, { rows: 4, cols: 7, fw: 0.4, frame: "#e7dccb" });
      box(c, 0.1, 0.23, 1.9, 1.77, 52, 55, "#d9cdb6");
      gable(c, 0.12, 0.25, 1.88, 1.75, 55, 14, "#3f4148", "x", { wall: "#9a4a37" });
      box(c, 0.8, 0.8, 1.2, 1.2, 55, 120, "#a85a45");
      ellipseFill(c, 1.2, 1.0, 105, 7, 7, "#f4eddc");
      pyramid(c, 0.8, 0.8, 1.2, 1.2, 120, 24, "#3f4148");
      chimney(c, 0.3, 0.4, 58, 16, "#7b4b3a");
      flag(c, 1, 1, 144, 14, "#2a52a0");
      break;
    }
    case 5: {
      plate(c, 0.02, 0.02, 1.98, 1.98, "#b8b4aa", 2);
      plate(c, 1.3, 1.3, 1.9, 1.9, "#78b45f", 3);
      box(c, 0.15, 0.15, 1.3, 1.85, 2, 90, "#cfcabd");
      windows(c, "L", 1.85, 0.15, 1.3, 5, 88, { rows: 11, cols: 6, fw: 0.8, fh: 0.5, chance: 0.5 });
      windows(c, "R", 1.3, 0.15, 1.85, 5, 88, { rows: 11, cols: 8, fw: 0.8, fh: 0.5, chance: 0.5 });
      box(c, 1.3, 0.15, 1.85, 1.2, 2, 30, "#bdb7aa");
      windows(c, "R", 1.85, 0.15, 1.2, 4, 28, { rows: 3, cols: 5, fw: 0.8, chance: 0.5 });
      box(c, 0.13, 0.13, 1.32, 1.87, 90, 93, "#8b8f94");
      flag(c, 1.6, 1.6, 3, 34, "#2a52a0"); flag(c, 1.75, 1.45, 3, 34, "#d24a3a");
      break;
    }
    case 6: {
      plate(c, 0.02, 0.02, 1.98, 1.98, "#d8dde2", 2);
      plate(c, 0.1, 1.4, 0.9, 1.9, "#82bd6b", 3);
      cylinder(c, 1.05, 0.95, 0.72, 2, 150, "#5aa6d6");
      for (let z = 12; z < 150; z += 9) { const { g, P } = c; const [X, Y] = P(1.05, 0.95, z); g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 0.7; g.beginPath(); g.ellipse(X, Y, 0.72 * RX, 0.72 * RY, 0, 0, Math.PI); g.stroke(); if (c.L) { c.L.strokeStyle = "rgba(220,245,255,.6)"; c.L.lineWidth = 1.4; c.L.beginPath(); c.L.ellipse(X, Y, 0.72 * RX, 0.72 * RY, 0, 0.3, Math.PI - 0.3); c.L.stroke(); } }
      cylinder(c, 1.05, 0.95, 0.5, 150, 160, "#dfe6ee");
      antenna(c, 1.05, 0.95, 160, 24);
      break;
    }
    default: {
      plate(c, 0.02, 0.02, 1.98, 1.98, "#23212e", 2);
      box(c, 0.12, 0.12, 1.88, 1.88, 2, 30, "#2a2838");
      windows(c, "L", 1.88, 0.12, 1.88, 4, 28, { rows: 3, cols: 8, glass: "#1d1730", lit: NEON, chance: 0.6 });
      box(c, 0.3, 0.3, 1.7, 1.7, 30, 150, "#22202e", { right: "#14131b" });
      windows(c, "L", 1.7, 0.3, 1.7, 34, 146, { rows: 18, cols: 6, fw: 0.7, fh: 0.35, glass: "#15121f", lit: ["#fcee0a", "#ffffff", "#ff2a6d"], chance: 0.35, reflect: false });
      windows(c, "R", 1.7, 0.3, 1.7, 34, 146, { rows: 18, cols: 6, fw: 0.7, fh: 0.35, glass: "#100e17", lit: ["#fcee0a", "#ffffff"], chance: 0.3, reflect: false });
      neonStrip(c, "L", 1.7, 0.3, 0.34, 30, 150, "#fcee0a");
      neonStrip(c, "R", 1.7, 1.66, 1.7, 30, 150, "#ff2a6d");
      neonStrip(c, "L", 1.71, 0.5, 1.5, 110, 124, "#ff2a6d");
      neonStrip(c, "L", 1.89, 0.3, 1.7, 24, 28, "#05d9e8");
      box(c, 0.6, 0.6, 1.4, 1.4, 150, 160, "#2f2c40");
      antenna(c, 1, 0.8, 160, 30);
      emit(c, 1, 1, 185, "holo");
    }
  }
}

/* ---------- Tous les autres bâtiments ---------- */

const ART = {
  hunter(c) {
    plate(c, 0.1, 0.1, 0.9, 0.9, "#9c8a62", 1);
    cone(c, 0.38, 0.4, 0.26, 1, 24, "#b08655");
    const { g, P } = c; g.strokeStyle = "#5b3f28"; g.lineWidth = 1; for (const d of [-4, 0, 4]) { const [X, Y] = P(0.38, 0.4, 25); g.beginPath(); g.moveTo(X + d, Y - 4); g.lineTo(X, Y + 2); g.stroke(); }
    box(c, 0.65, 0.6, 0.68, 0.63, 1, 14, "#5b3f28"); box(c, 0.85, 0.6, 0.88, 0.63, 1, 14, "#5b3f28"); box(c, 0.62, 0.6, 0.9, 0.63, 12, 13, "#5b3f28");
    box(c, 0.7, 0.6, 0.8, 0.64, 6, 12, "#c9a27a", { edge: false });
    emit(c, 0.6, 0.85, 3, "fire");
  },
  gather(c) {
    plate(c, 0.1, 0.1, 0.9, 0.9, "#8fae5a", 1);
    for (const [x, y] of [[0.25, 0.3], [0.7, 0.3], [0.3, 0.7], [0.65, 0.68]]) bush(c, x, y, 0.8, "#3f7d36");
    for (const [x, y] of [[0.25, 0.3], [0.7, 0.3], [0.3, 0.7]]) ellipseFill(c, x, y, 5, 1.6, 1.6, "#c23b4a");
    cylinder(c, 0.5, 0.5, 0.1, 1, 6, "#b08655");
    person(c, 0.5, 0.8, "#8a5a3a");
  },
  lumber(c) {
    plate(c, 0.08, 0.08, 0.92, 0.92, "#8c7a5a", 1);
    box(c, 0.2, 0.2, 0.6, 0.6, 1, 10, "#8b6640"); gable(c, 0.2, 0.2, 0.6, 0.6, 10, 8, c.pal.roof, "x", { wall: "#8b6640" });
    for (let i = 0; i < 3; i++) cylinder(c, 0.72 + (i % 2) * 0.06, 0.5 + i * 0.1, 0.06, 1, 4, "#a07a4a");
    for (let i = 0; i < 3; i++) box(c, 0.55, 0.72 + i * 0.07, 0.9, 0.78 + i * 0.07, 1, 4, "#b88a54", { edge: false });
    box(c, 0.25, 0.7, 0.4, 0.8, 1, 4, "#6b4a2c");
  },
  stonecut(c) {
    plate(c, 0.08, 0.08, 0.92, 0.92, "#a59d8e", 1);
    box(c, 0.15, 0.2, 0.5, 0.55, 1, 9, "#8b6640"); pyramid(c, 0.15, 0.2, 0.5, 0.55, 9, 8, c.pal.roof);
    box(c, 0.55, 0.3, 0.8, 0.55, 1, 7, "#b6afa2"); box(c, 0.6, 0.6, 0.85, 0.85, 1, 5, "#a8a194"); box(c, 0.25, 0.65, 0.45, 0.85, 1, 6, "#bdb6a8");
    person(c, 0.52, 0.72, "#7a5a3a");
  },
  shaman(c) {
    plate(c, 0.1, 0.1, 0.9, 0.9, "#9e8c66", 1);
    cylinder(c, 0.5, 0.5, 0.32, 1, 12, "#7d5b3c", { top: false });
    cone(c, 0.5, 0.5, 0.38, 11, 26, "#6b4b33");
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const [X, Y] = c.P(0.5 + Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.28, 22); c.g.fillStyle = ["#c0563a", "#e8d27a", "#3d7a8a"][i % 3]; c.g.fillRect(X - 1, Y, 2, 5); }
    box(c, 0.82, 0.2, 0.86, 0.24, 1, 30, "#5b3f28"); ellipseFill(c, 0.84, 0.22, 30, 3, 3, "#f0e6d2");
    emit(c, 0.5, 0.86, 4, "glow"); emit(c, 0.5, 0.5, 38, "smoke");
  },
  fire(c) {
    plate(c, 0.15, 0.15, 0.85, 0.85, "#9c8a62", 1);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; box(c, 0.5 + Math.cos(a) * 0.17 - 0.03, 0.5 + Math.sin(a) * 0.17 - 0.03, 0.5 + Math.cos(a) * 0.17 + 0.03, 0.5 + Math.sin(a) * 0.17 + 0.03, 1, 3, "#7d776d", { edge: false }); }
    for (const [x, y] of [[0.2, 0.5], [0.5, 0.82], [0.8, 0.5]]) box(c, x - 0.07, y - 0.03, x + 0.07, y + 0.03, 1, 3, "#7a5636");
    ellipseFill(c, 0.5, 0.5, 2, 6, 3, "#2a1a10");
    emit(c, 0.5, 0.5, 4, "fire"); emit(c, 0.5, 0.5, 2, "glow");
  },
  healer(c) {
    plate(c, 0.1, 0.1, 0.9, 0.9, "#8fae5a", 1);
    box(c, 0.2, 0.25, 0.7, 0.7, 1, 11, "#9a7a52"); gable(c, 0.2, 0.25, 0.7, 0.7, 11, 11, "#a8b35e", "y", { wall: "#9a7a52" });
    for (const [x, y] of [[0.8, 0.3], [0.82, 0.55], [0.3, 0.82], [0.55, 0.85]]) { bush(c, x, y, 0.5, "#4f8a3e"); ellipseFill(c, x, y, 4, 1.2, 1.2, "#e6d36a"); }
    emit(c, 0.45, 0.72, 4, "glow");
  },
  totem(c) {
    plate(c, 0.3, 0.3, 0.7, 0.7, "#9c8a62", 1);
    const cols = ["#b8563a", "#3d7a8a", "#e0c35a", "#5b3f28"];
    for (let i = 0; i < 4; i++) box(c, 0.42, 0.42, 0.58, 0.58, 1 + i * 11, 12 + i * 11, cols[i]);
    box(c, 0.3, 0.46, 0.7, 0.54, 36, 39, "#e0c35a");
  },
  w0(c) {
    plate(c, 0.05, 0.05, 1.95, 1.95, "#88a65a", 1);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2; const x = 1 + Math.cos(a) * 0.72, y = 1 + Math.sin(a) * 0.72;
      box(c, x - 0.07, y - 0.07, x + 0.07, y + 0.07, 1, 30, "#9b968e");
    }
    for (let i = 0; i < 12; i += 2) {
      const a = i / 12 * Math.PI * 2, b = (i + 1) / 12 * Math.PI * 2;
      const x0 = 1 + Math.cos(a) * 0.72, y0 = 1 + Math.sin(a) * 0.72, x1 = 1 + Math.cos(b) * 0.72, y1 = 1 + Math.sin(b) * 0.72;
      box(c, Math.min(x0, x1) - 0.07, Math.min(y0, y1) - 0.07, Math.max(x0, x1) + 0.07, Math.max(y0, y1) + 0.07, 30, 35, "#a9a49b");
    }
    box(c, 0.88, 0.88, 1.12, 1.12, 1, 8, "#8d877d");
    emit(c, 1, 1, 10, "glow");
  },
  farm(c, era) {
    const crops = era >= 4 ? ["#d9b44a", "#7aa83c", "#c6a23e"] : ["#cfae4e", "#8cb04a", "#b9984a"];
    const rows = 7;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      if (i === 0 && j === 0) continue;
      const x0 = i * 1 + 0.05, y0 = j * 1 + 0.05;
      plate(c, x0, y0, x0 + 0.9, y0 + 0.9, "#8a6a42", 1);
      const col = crops[(i + j) % 3];
      for (let k = 0; k < rows; k++) box(c, x0 + 0.04, y0 + 0.05 + k * 0.12, x0 + 0.86, y0 + 0.1 + k * 0.12, 1, 3, col, { edge: false });
    }
    plate(c, 0.05, 0.05, 0.95, 0.95, "#8fae5a", 1);
    const wall = era >= 4 ? "#a33a2c" : era >= 2 ? "#e0d2b2" : "#e9dcc0";
    box(c, 0.15, 0.2, 0.8, 0.75, 1, 14, wall);
    gable(c, 0.15, 0.2, 0.8, 0.75, 14, 11, era >= 4 ? "#3f4148" : c.pal.roof, "x", { wall });
    windows(c, "L", 0.75, 0.15, 0.8, 3, 12, { cols: 2, fw: 0.3 });
    if (era >= 4) { cylinder(c, 0.85, 0.3, 0.12, 1, 30, "#b9bcc0"); dome(c, 0.85, 0.3, 0.12, 30, 6, "#9aa0a6"); }
    else { box(c, 0.83, 0.25, 0.95, 0.4, 1, 8, "#b8935a"); }
  },
  fishery(c) {
    plate(c, 0.05, 0.05, 0.95, 0.95, "#9f8259", 2);
    box(c, 0.15, 0.15, 0.6, 0.6, 2, 13, "#a8875e"); gable(c, 0.15, 0.15, 0.6, 0.6, 13, 9, c.pal.roof, "y", { wall: "#a8875e" });
    for (let i = 0; i < 3; i++) box(c, 0.65 + i * 0.1, 0.3, 0.68 + i * 0.1, 0.33, 2, 14, "#6b4a2c");
    const { g, P } = c; g.strokeStyle = "rgba(240,230,200,.7)"; g.lineWidth = 0.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(...P(0.65, 0.31, 12 - i * 2)); g.lineTo(...P(0.88, 0.31, 12 - i * 2)); g.stroke(); }
    box(c, 0.6, 0.65, 0.9, 0.9, 2, 4, "#7a5a3a");
  },
  well(c) {
    plate(c, 0.25, 0.25, 0.75, 0.75, c.pal.stone, 1);
    cylinder(c, 0.5, 0.5, 0.18, 1, 9, "#a8a294");
    ellipseFill(c, 0.5, 0.5, 9, 0.13 * RX, 0.13 * RY, "#3d74a0");
    box(c, 0.33, 0.48, 0.36, 0.52, 9, 24, "#6b4a2c"); box(c, 0.64, 0.48, 0.67, 0.52, 9, 24, "#6b4a2c");
    gable(c, 0.3, 0.38, 0.7, 0.62, 24, 6, c.pal.roof, "x");
  },
  market(c, era) {
    plate(c, 0.05, 0.05, 0.95, 0.95, c.pal.stone, 1.5);
    const cols = ["#c0563a", "#e0c35a", "#3d7a8a", "#e9dcc0"];
    for (let i = 0; i < 4; i++) {
      const x0 = 0.1 + (i % 2) * 0.45, y0 = 0.1 + Math.floor(i / 2) * 0.45;
      box(c, x0, y0, x0 + 0.38, y0 + 0.38, 1.5, 6, "#a07a4a");
      for (const [dx, dy] of [[0, 0], [0.36, 0], [0, 0.36], [0.36, 0.36]]) box(c, x0 + dx, y0 + dy, x0 + dx + 0.02, y0 + dy + 0.02, 6, 15, "#6b4a2c", { edge: false });
      gable(c, x0, y0, x0 + 0.38, y0 + 0.38, 15, 5, cols[i], i % 2 ? "x" : "y", { over: 0.03 });
    }
    person(c, 0.5, 0.52, "#3d5a8a"); person(c, 0.55, 0.9, "#8a3d3d");
  },
  temple(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#d9cfb6", 2);
    box(c, 0.08, 0.08, 0.92, 0.92, 2, 6, "#e5dbc3");
    box(c, 0.2, 0.25, 0.8, 0.75, 6, 26, "#e9dfc8");
    columns(c, "L", 0.86, 0.12, 0.88, 6, 34, 5, "#f5edda");
    columns(c, "R", 0.88, 0.14, 0.84, 6, 34, 4, "#f5edda");
    box(c, 0.08, 0.08, 0.92, 0.92, 34, 38, "#efe6d2");
    gable(c, 0.08, 0.08, 0.92, 0.92, 38, 12, c.pal.roof, "x", { wall: "#efe6d2", tiles: true });
    emit(c, 0.5, 0.78, 10, "glow");
  },
  library(c) {
    plate(c, 0.03, 0.03, 0.97, 0.97, "#d9cfb6", 2);
    box(c, 0.1, 0.12, 0.9, 0.88, 2, 30, "#e7dcc2");
    windows(c, "L", 0.88, 0.1, 0.9, 6, 28, { cols: 4, rows: 2, fw: 0.4 });
    windows(c, "R", 0.9, 0.12, 0.88, 6, 28, { cols: 4, rows: 2, fw: 0.4 });
    box(c, 0.08, 0.1, 0.92, 0.9, 30, 33, "#f1e9d6");
    pyramid(c, 0.1, 0.12, 0.9, 0.88, 33, 10, c.pal.roof);
  },
  baths(c) {
    plate(c, 0.03, 0.03, 0.97, 0.97, "#d9cfb6", 2);
    box(c, 0.1, 0.1, 0.62, 0.9, 2, 24, "#e5d9be");
    windows(c, "R", 0.62, 0.1, 0.9, 6, 20, { cols: 3, fw: 0.4, fh: 0.7 });
    dome(c, 0.36, 0.5, 0.25, 24, 16, "#c8b896");
    box(c, 0.66, 0.15, 0.94, 0.88, 2, 4, "#d2c7ae");
    box(c, 0.7, 0.2, 0.9, 0.84, 3, 4, "#4fa6d4", { edge: false });
    emit(c, 0.8, 0.5, 6, "steam");
  },
  amphi(c) {
    plate(c, 0.03, 0.03, 1.97, 1.97, "#cfc4a8", 1);
    for (let i = 0; i < 5; i++) {
      const r = 0.95 - i * 0.12;
      cylinder(c, 1, 1, r, 1, 26 - i * 5, i % 2 ? "#ddd2b6" : "#e7dcc2", { top: i === 4 ? "#c8b48a" : shade("#e2d6ba", 0.1) });
    }
    ellipseFill(c, 1, 1, 6, 0.36 * RX, 0.36 * RY, "#c2a87a");
    columns(c, "L", 1.9, 0.4, 1.6, 26, 34, 5, "#f0e7d4");
  },
  garden(c, era) {
    plate(c, 0.05, 0.05, 0.95, 0.95, era >= 7 ? "#2d5a45" : "#79b65c", 1.5);
    const { g, P } = c;
    poly(g, [P(0.45, 0.05, 1.6), P(0.55, 0.05, 1.6), P(0.55, 0.95, 1.6), P(0.45, 0.95, 1.6)], "#d8cba8");
    poly(g, [P(0.05, 0.45, 1.6), P(0.95, 0.45, 1.6), P(0.95, 0.55, 1.6), P(0.05, 0.55, 1.6)], "#d8cba8");
    for (const [x, y] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) { bush(c, x, y, 0.8, "#4b8a3c"); for (let i = 0; i < 3; i++) ellipseFill(c, x - 0.1 + i * 0.1, y + 0.1, 4, 1.4, 1.4, ["#f05a7a", "#f5d14a", "#ffffff"][i]); }
    treeRound(c, 0.5, 0.5, 0.6, "#4f9440");
  },
  statue(c) {
    plate(c, 0.2, 0.2, 0.8, 0.8, c.pal.stone, 1.5);
    box(c, 0.35, 0.35, 0.65, 0.65, 1.5, 14, "#d8cfb8");
    box(c, 0.32, 0.32, 0.68, 0.68, 14, 17, "#e5dcc6");
    cylinder(c, 0.5, 0.5, 0.06, 17, 36, c.era >= 4 ? "#5f8f7a" : "#e9e1cc", { top: false });
    ellipseFill(c, 0.5, 0.5, 40, 3.2, 3.6, c.era >= 4 ? "#6b9e88" : "#efe8d6");
    box(c, 0.42, 0.48, 0.58, 0.52, 30, 32, c.era >= 4 ? "#5f8f7a" : "#e9e1cc", { edge: false });
  },
  w1(c) {
    plate(c, 0.0, 0.0, 2, 2, "#e0cc98", 1);
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const m = 0.08 + i * 0.09;
      box(c, m, m, 2 - m, 2 - m, 1 + i * 10, 11 + i * 10, "#d9bf86", { edge: i % 2 === 0 });
    }
    pyramid(c, 0.89, 0.89, 1.11, 1.11, 91, 12, "#f0d070", { over: 0 });
    emit(c, 1, 1, 100, "glow");
  },
  mine(c) {
    plate(c, 0.05, 0.05, 0.95, 0.95, "#7d756a", 1);
    box(c, 0.15, 0.15, 0.55, 0.55, 1, 16, "#6d655c");
    box(c, 0.25, 0.53, 0.45, 0.56, 1, 12, "#1d1a17", { edge: false });
    box(c, 0.6, 0.2, 0.66, 0.26, 1, 34, "#5b3f28"); box(c, 0.84, 0.2, 0.9, 0.26, 1, 34, "#5b3f28"); box(c, 0.6, 0.2, 0.9, 0.26, 30, 34, "#5b3f28");
    cylinder(c, 0.75, 0.23, 0.08, 26, 30, "#8a8a8a");
    box(c, 0.6, 0.62, 0.85, 0.82, 1, 6, "#5e5850"); ellipseFill(c, 0.72, 0.72, 7, 6, 3, "#9c8a7a");
    emit(c, 0.35, 0.56, 6, "glow");
  },
  forge(c) {
    plate(c, 0.05, 0.05, 0.95, 0.95, "#7d756a", 1);
    box(c, 0.12, 0.15, 0.85, 0.75, 1, 18, "#8d877d");
    windows(c, "L", 0.75, 0.12, 0.85, 3, 14, { cols: 2, glass: "#3a1a0a", lit: "#ff7a2a", chance: 1 });
    gable(c, 0.12, 0.15, 0.85, 0.75, 18, 9, "#5b4a40", "x", { wall: "#8d877d" });
    chimney(c, 0.2, 0.25, 20, 16, "#6d655c");
    box(c, 0.5, 0.8, 0.75, 0.92, 1, 6, "#3d3a38");
    emit(c, 0.45, 0.8, 4, "spark");
  },
  mill(c) {
    plate(c, 0.1, 0.1, 0.9, 0.9, "#8fae5a", 1);
    cylinder(c, 0.5, 0.5, 0.25, 1, 40, "#e6dac0", { top: false });
    windows(c, "L", 0.74, 0.4, 0.6, 14, 34, { rows: 2, cols: 1, fw: 0.6 });
    cone(c, 0.5, 0.5, 0.29, 40, 18, c.pal.roof);
    emit(c, 0.72, 0.72, 44, "blades");
  },
  guard(c) {
    plate(c, 0.15, 0.15, 0.85, 0.85, c.pal.stone, 1);
    box(c, 0.25, 0.25, 0.75, 0.75, 1, 60, "#9a958c");
    windows(c, "L", 0.75, 0.3, 0.7, 20, 55, { rows: 3, cols: 1, fw: 0.3, fh: 0.5, chance: 0.7 });
    windows(c, "R", 0.75, 0.3, 0.7, 20, 55, { rows: 3, cols: 1, fw: 0.3, fh: 0.5, chance: 0.6 });
    box(c, 0.2, 0.2, 0.8, 0.8, 60, 64, "#a6a097");
    crenels(c, 0.2, 0.2, 0.8, 0.8, 64, "#a6a097", 3);
    flag(c, 0.5, 0.5, 64, 18, c.pal.accent);
    emit(c, 0.5, 0.5, 66, "torch");
  },
  tavern(c) {
    plate(c, 0.05, 0.05, 0.95, 0.95, "#8d8a84", 1);
    box(c, 0.12, 0.15, 0.85, 0.85, 1, 7, "#8f8a80");
    box(c, 0.1, 0.13, 0.87, 0.87, 7, 26, "#e6d8bb");
    const { g, P } = c; g.strokeStyle = "#4a3424"; g.lineWidth = 1.1;
    for (let i = 0; i <= 3; i++) { const u = 0.1 + i * 0.257; g.beginPath(); g.moveTo(...P(u, 0.87, 7)); g.lineTo(...P(u, 0.87, 26)); g.stroke(); }
    windows(c, "L", 0.87, 0.1, 0.87, 9, 25, { rows: 2, cols: 3, fw: 0.35, chance: 0.9 });
    windows(c, "R", 0.87, 0.13, 0.87, 9, 25, { rows: 2, cols: 2, fw: 0.35, chance: 0.9 });
    gable(c, 0.1, 0.13, 0.87, 0.87, 26, 14, "#6a5246", "y", { wall: "#e6d8bb" });
    box(c, 0.9, 0.4, 0.92, 0.42, 16, 22, "#4a3424"); box(c, 0.92, 0.36, 0.94, 0.5, 14, 20, "#c9a13a", { edge: false });
    chimney(c, 0.3, 0.3, 30, 10, "#8f8a80");
  },
  abbey(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#8d8a84", 1);
    box(c, 0.2, 0.55, 1.8, 1.45, 1, 44, "#b5ad9e");
    windows(c, "L", 1.45, 0.3, 1.8, 10, 40, { cols: 6, fw: 0.3, fh: 0.8, glass: "#3a3a6a", lit: ["#ffb257", "#ff7a7a", "#7ab0ff"], chance: 0.8 });
    gable(c, 0.2, 0.55, 1.8, 1.45, 44, 26, "#5b5f6b", "x", { wall: "#b5ad9e" });
    box(c, 1.2, 0.2, 1.75, 0.55, 1, 30, "#aaa293");
    box(c, 1.3, 1.45, 1.75, 1.85, 1, 26, "#aaa293");
    gable(c, 1.3, 1.45, 1.75, 1.85, 26, 12, "#5b5f6b", "y", { wall: "#aaa293" });
    box(c, 0.25, 0.7, 0.75, 1.3, 44, 110, "#bdb5a6");
    windows(c, "L", 1.3, 0.3, 0.7, 70, 100, { cols: 2, fw: 0.3, fh: 0.8 });
    windows(c, "R", 0.75, 0.75, 1.25, 70, 100, { cols: 2, fw: 0.3, fh: 0.8 });
    pyramid(c, 0.25, 0.7, 0.75, 1.3, 110, 34, "#5b5f6b");
    ellipseFill(c, 1.0, 1.45, 30, 6, 7, "#5a4a8a");
    if (c.L) { const [X, Y] = c.P(1.0, 1.45, 30); c.L.shadowColor = "#a07aff"; c.L.shadowBlur = 8; c.L.fillStyle = "#c8a8ff"; c.L.beginPath(); c.L.ellipse(X, Y, 5, 6, 0, 0, Math.PI * 2); c.L.fill(); c.L.shadowBlur = 0; }
  },
  w2(c) {
    plate(c, 0.0, 0.0, 2, 2, "#7d9c58", 1);
    box(c, 0.1, 0.1, 1.9, 1.9, 1, 34, "#9a958c");
    crenels(c, 0.1, 0.1, 1.9, 1.9, 34, "#a6a097", 7);
    box(c, 0.45, 0.4, 1.4, 1.35, 34, 90, "#aaa499");
    windows(c, "L", 1.35, 0.5, 1.35, 50, 85, { rows: 3, cols: 3, fw: 0.2, fh: 0.5, chance: 0.6 });
    windows(c, "R", 1.4, 0.45, 1.3, 50, 85, { rows: 3, cols: 3, fw: 0.2, fh: 0.5, chance: 0.6 });
    crenels(c, 0.45, 0.4, 1.4, 1.35, 90, "#b3ada2", 4);
    for (const [x, y, hh] of [[0.18, 0.18, 70], [1.82, 0.18, 70], [0.18, 1.82, 70], [1.82, 1.82, 74]]) { cylinder(c, x, y, 0.2, 1, hh, "#a29c92"); cone(c, x, y, 0.24, hh, 30, "#3d4e8a"); flag(c, x, y, hh + 30, 12, "#c8322b"); }
    box(c, 0.85, 1.86, 1.15, 1.92, 1, 22, "#3a2a1c", { edge: false });
    flag(c, 0.9, 0.85, 90, 30, "#c8322b");
  },
  workshop(c) {
    plate(c, 0.03, 0.03, 0.97, 0.97, "#c9c2b4", 1.5);
    box(c, 0.1, 0.12, 0.9, 0.85, 1.5, 30, "#d7b998");
    windows(c, "L", 0.85, 0.1, 0.9, 5, 28, { rows: 2, cols: 4, fw: 0.5, frame: "#f3eee3" });
    windows(c, "R", 0.9, 0.12, 0.85, 5, 28, { rows: 2, cols: 3, fw: 0.5, frame: "#f3eee3" });
    gable(c, 0.1, 0.12, 0.9, 0.85, 30, 14, c.pal.roof, "x", { wall: "#d7b998" });
    box(c, 0.25, 0.88, 0.45, 0.96, 1.5, 6, "#8b6640");
    chimney(c, 0.7, 0.3, 32, 10, "#a2765a");
  },
  bank(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#d9d2c4", 2);
    box(c, 0.1, 0.1, 0.9, 0.9, 2, 7, "#e5ddcd");
    box(c, 0.16, 0.16, 0.84, 0.84, 7, 46, "#efe6d4");
    columns(c, "L", 0.88, 0.16, 0.84, 7, 40, 5, "#ffffff");
    windows(c, "R", 0.84, 0.16, 0.84, 10, 44, { rows: 2, cols: 3, fw: 0.4, frame: "#fff" });
    box(c, 0.12, 0.12, 0.88, 0.9, 40, 48, "#f7f0e2");
    gable(c, 0.12, 0.12, 0.88, 0.9, 48, 9, "#b9b2a2", "y", { wall: "#f7f0e2", over: 0 });
    dome(c, 0.45, 0.45, 0.18, 48, 14, "#c9a13a");
  },
  theater(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#c9c2b4", 2);
    box(c, 0.1, 0.1, 0.9, 0.9, 2, 40, "#e4c9a6");
    windows(c, "L", 0.9, 0.1, 0.9, 20, 38, { cols: 5, fw: 0.5, fh: 0.8, frame: "#fff", chance: 0.9 });
    columns(c, "L", 0.94, 0.15, 0.85, 2, 20, 5, "#fff");
    box(c, 0.1, 0.1, 0.94, 0.94, 18, 21, "#f3eee3");
    windows(c, "R", 0.9, 0.1, 0.9, 6, 38, { rows: 2, cols: 3, fw: 0.4, frame: "#fff" });
    box(c, 0.08, 0.08, 0.92, 0.92, 40, 44, "#f3eee3");
    dome(c, 0.5, 0.5, 0.3, 44, 22, "#6d8f7a");
    ellipseFill(c, 0.5, 0.5, 70, 2.5, 2.5, "#c9a13a");
  },
  hospice(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#c9c2b4", 2);
    box(c, 0.08, 0.15, 0.92, 0.85, 2, 36, "#e9dcc6");
    windows(c, "L", 0.85, 0.08, 0.92, 5, 34, { rows: 3, cols: 5, fw: 0.4, frame: "#fff" });
    windows(c, "R", 0.92, 0.15, 0.85, 5, 34, { rows: 3, cols: 4, fw: 0.4, frame: "#fff" });
    gable(c, 0.08, 0.15, 0.92, 0.85, 36, 14, c.pal.roof, "x", { wall: "#e9dcc6", tiles: true });
    box(c, 0.38, 0.5, 0.48, 0.54, 52, 62, "#c8322b", { edge: false });
    box(c, 0.32, 0.5, 0.54, 0.54, 55, 59, "#c8322b", { edge: false });
  },
  univ(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#c9c2b4", 2);
    plate(c, 0.7, 0.7, 1.4, 1.4, "#79b65c", 3);
    box(c, 0.1, 0.1, 1.9, 0.65, 2, 44, "#e6d1ac");
    box(c, 0.1, 0.65, 0.65, 1.9, 2, 44, "#e6d1ac");
    windows(c, "R", 1.9, 0.1, 0.65, 5, 42, { rows: 3, cols: 3, fw: 0.45, frame: "#fff" });
    windows(c, "L", 1.9, 0.1, 0.65, 5, 42, { rows: 3, cols: 2, fw: 0.45, frame: "#fff" });
    windows(c, "R", 0.65, 0.65, 1.9, 5, 42, { rows: 3, cols: 6, fw: 0.45, frame: "#fff" });
    gable(c, 0.1, 0.1, 1.9, 0.65, 44, 14, c.pal.roof, "x", { wall: "#e6d1ac" });
    gable(c, 0.1, 0.65, 0.65, 1.9, 44, 14, c.pal.roof, "y", { wall: "#e6d1ac" });
    box(c, 0.2, 0.2, 0.55, 0.55, 44, 96, "#ecdcbc");
    windows(c, "L", 0.55, 0.2, 0.55, 70, 90, { cols: 2, fw: 0.4 });
    pyramid(c, 0.2, 0.2, 0.55, 0.55, 96, 28, c.pal.roof);
    treeRound(c, 1.1, 1.05, 0.7, "#4f9440"); treeRound(c, 1.5, 1.6, 0.7, "#4b8f3d");
  },
  fountain(c) {
    plate(c, 0.08, 0.08, 0.92, 0.92, c.pal.stone, 1.5);
    cylinder(c, 0.5, 0.5, 0.36, 1.5, 6, "#d8d0bf", { top: "#e2dccd" });
    ellipseFill(c, 0.5, 0.5, 6, 0.31 * RX, 0.31 * RY, "#4fa6d4");
    cylinder(c, 0.5, 0.5, 0.05, 6, 22, "#e5ddcc");
    cylinder(c, 0.5, 0.5, 0.15, 22, 24, "#e5ddcc", { top: "#4fa6d4" });
    emit(c, 0.5, 0.5, 26, "spray");
  },
  w3(c) {
    plate(c, 0.0, 0.0, 2, 2, "#d8d0bf", 2);
    box(c, 0.1, 0.1, 1.9, 1.9, 2, 46, "#efe4cc");
    windows(c, "L", 1.9, 0.1, 1.9, 6, 44, { rows: 2, cols: 8, fw: 0.4, fh: 0.7, frame: "#fff" });
    windows(c, "R", 1.9, 0.1, 1.9, 6, 44, { rows: 2, cols: 8, fw: 0.4, fh: 0.7, frame: "#fff" });
    box(c, 0.08, 0.08, 1.92, 1.92, 46, 50, "#f7f0e2");
    cylinder(c, 1, 1, 0.62, 50, 80, "#efe4cc");
    columns(c, "L", 1.6, 0.5, 1.5, 52, 78, 6, "#ffffff");
    dome(c, 1, 1, 0.62, 80, 56, "#c66a3c");
    cylinder(c, 1, 1, 0.1, 136, 150, "#f7f0e2");
    cone(c, 1, 1, 0.12, 150, 14, "#c9a13a");
  },
  coal(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#55524e", 1);
    box(c, 0.1, 0.5, 1.4, 1.9, 1, 46, "#8a4636");
    windows(c, "L", 1.9, 0.1, 1.4, 6, 40, { rows: 2, cols: 6, fw: 0.5, fh: 0.7, glass: "#2a2420", lit: "#ffaa55", chance: 0.7 });
    gable(c, 0.1, 0.5, 1.4, 1.9, 46, 12, "#3a3c42", "y", { wall: "#8a4636" });
    for (const x of [0.35, 0.8]) { cylinder(c, x, 0.3, 0.13, 1, 130, "#7b4b3a"); cylinder(c, x, 0.3, 0.15, 124, 130, "#5b5f66"); emit(c, x, 0.3, 134, "smokeBig"); }
    box(c, 1.5, 0.5, 1.9, 1.3, 1, 12, "#2a2826"); pyramid(c, 1.52, 0.52, 1.88, 1.28, 12, 10, "#1e1c1b");
  },
  factory(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#5d5a55", 1);
    box(c, 0.1, 0.1, 1.9, 1.9, 1, 34, "#7f3b2c");
    windows(c, "L", 1.9, 0.1, 1.9, 6, 30, { rows: 2, cols: 8, fw: 0.6, glass: "#3a3f45", lit: "#ffd27a", chance: 0.6 });
    windows(c, "R", 1.9, 0.1, 1.9, 6, 30, { rows: 2, cols: 8, fw: 0.6, glass: "#30353a", lit: "#ffd27a", chance: 0.6 });
    for (let i = 0; i < 4; i++) { const y0 = 0.1 + i * 0.45; gable(c, 0.1, y0, 1.9, y0 + 0.45, 34, 10, i % 2 ? "#4a4d54" : "#5b5f66", "x", { over: 0.01, end: "#9aa0a8" }); }
    cylinder(c, 0.35, 0.35, 0.11, 34, 110, "#6b4a3c"); emit(c, 0.35, 0.35, 114, "smokeBig");
    cylinder(c, 1.5, 0.4, 0.09, 34, 90, "#6b4a3c"); emit(c, 1.5, 0.4, 94, "smoke");
  },
  station(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#8a837b", 1.5);
    box(c, 0.1, 0.9, 1.9, 1.85, 1.5, 34, "#b0614a");
    windows(c, "L", 1.85, 0.1, 1.9, 6, 30, { rows: 2, cols: 8, fw: 0.45, frame: "#e7dccb" });
    box(c, 0.08, 0.88, 1.92, 1.87, 34, 38, "#d9cdb6");
    box(c, 0.1, 0.1, 1.9, 0.85, 1.5, 4, "#6d6862");
    const { g, P } = c;
    for (let i = 0; i <= 6; i++) { const x = 0.1 + i * 0.3; g.strokeStyle = "#3c3f45"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...P(x, 0.1, 4)); g.lineTo(...P(x, 0.1, 30)); g.stroke(); }
    poly(g, [P(0.1, 0.1, 30), P(1.9, 0.1, 30), P(1.9, 0.85, 44), P(0.1, 0.85, 44)], "rgba(170,200,220,.55)", "#3c3f45");
    box(c, 0.85, 1.4, 1.15, 1.7, 38, 74, "#b0614a");
    ellipseFill(c, 1.15, 1.55, 62, 6, 6, "#f4eddc");
    pyramid(c, 0.85, 1.4, 1.15, 1.7, 74, 16, "#3f4148");
  },
  watertower(c) {
    plate(c, 0.2, 0.2, 0.8, 0.8, "#8a837b", 1);
    for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) box(c, x - 0.03, y - 0.03, x + 0.03, y + 0.03, 1, 66, "#5d636b");
    const { g, P } = c; g.strokeStyle = "#5d636b"; g.lineWidth = 0.8;
    for (let z = 10; z < 60; z += 16) { g.beginPath(); g.moveTo(...P(0.3, 0.7, z)); g.lineTo(...P(0.7, 0.7, z + 14)); g.moveTo(...P(0.7, 0.3, z)); g.lineTo(...P(0.7, 0.7, z + 14)); g.stroke(); }
    cylinder(c, 0.5, 0.5, 0.3, 64, 92, "#a04a3a");
    cone(c, 0.5, 0.5, 0.32, 92, 12, "#5b5f66");
  },
  police(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#8a837b", 1.5);
    box(c, 0.1, 0.15, 0.9, 0.85, 1.5, 40, c.era >= 5 ? "#d6d2c8" : "#8f8578");
    windows(c, "L", 0.85, 0.1, 0.9, 5, 38, { rows: 3, cols: 4, fw: 0.45 });
    windows(c, "R", 0.9, 0.15, 0.85, 5, 38, { rows: 3, cols: 3, fw: 0.45 });
    box(c, 0.08, 0.13, 0.92, 0.87, 40, 43, "#2b3f6a");
    box(c, 0.3, 0.88, 0.7, 0.92, 26, 32, "#2b3f6a", { edge: false });
    emit(c, 0.5, 0.5, 46, "siren");
    flag(c, 0.8, 0.3, 43, 18, "#2a52a0");
  },
  school(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#a8a196", 1.5);
    plate(c, 0.55, 0.55, 0.95, 0.95, "#79b65c", 2);
    box(c, 0.08, 0.08, 0.5, 0.92, 1.5, 34, "#c66e4e");
    box(c, 0.5, 0.08, 0.92, 0.5, 1.5, 34, "#c66e4e");
    windows(c, "R", 0.5, 0.5, 0.92, 4, 32, { rows: 2, cols: 3, fw: 0.6, frame: "#fff" });
    windows(c, "L", 0.5, 0.5, 0.92, 4, 32, { rows: 2, cols: 3, fw: 0.6, frame: "#fff" });
    windows(c, "R", 0.92, 0.08, 0.5, 4, 32, { rows: 2, cols: 3, fw: 0.6, frame: "#fff" });
    box(c, 0.06, 0.06, 0.52, 0.94, 34, 37, "#e8e0d0"); box(c, 0.5, 0.06, 0.94, 0.52, 34, 37, "#e8e0d0");
    box(c, 0.2, 0.2, 0.32, 0.32, 37, 50, "#c66e4e"); pyramid(c, 0.2, 0.2, 0.32, 0.32, 50, 8, "#3f4148");
  },
  w4(c) {
    plate(c, 0.0, 0.0, 2, 2, "#7fae62", 1);
    const { g, P } = c;
    const legs = [[0.2, 0.2], [1.8, 0.2], [1.8, 1.8], [0.2, 1.8]];
    const lvl = [[0, 0.8], [60, 0.48], [130, 0.22], [210, 0.08], [240, 0.03]];
    const pt = (k, i) => { const [z, r] = lvl[k]; const [lx, ly] = legs[i]; return P(1 + (lx - 1) * r / 0.8, 1 + (ly - 1) * r / 0.8, z); };
    g.strokeStyle = "#6a5440"; g.lineWidth = 2.2;
    for (let k = 0; k < lvl.length - 1; k++) for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(...pt(k, i)); g.lineTo(...pt(k + 1, i)); g.stroke();
      g.lineWidth = 0.7; g.beginPath(); g.moveTo(...pt(k, i)); g.lineTo(...pt(k + 1, (i + 1) % 4)); g.moveTo(...pt(k, (i + 1) % 4)); g.lineTo(...pt(k + 1, i)); g.stroke(); g.lineWidth = 2.2;
    }
    for (const k of [1, 2]) { const [z, r] = lvl[k]; box(c, 1 - r - 0.05, 1 - r - 0.05, 1 + r + 0.05, 1 + r + 0.05, z, z + 5, "#7a604a"); }
    antenna(c, 1, 1, 240, 22);
    if (c.L) { c.L.fillStyle = "#ffcf6a"; c.L.shadowColor = "#ffcf6a"; c.L.shadowBlur = 6; for (let k = 0; k < lvl.length - 1; k++) for (let i = 0; i < 4; i++) { const a = pt(k, i), b = pt(k + 1, i); for (let t = 0; t <= 1; t += 0.2) c.L.fillRect(a[0] + (b[0] - a[0]) * t - 0.8, a[1] + (b[1] - a[1]) * t - 0.8, 1.6, 1.6); } c.L.shadowBlur = 0; }
  },
  wind(c) {
    plate(c, 0.3, 0.3, 0.7, 0.7, "#a5a39d", 1);
    cylinder(c, 0.5, 0.5, 0.05, 1, 110, "#eef0f2", { top: false });
    box(c, 0.46, 0.44, 0.6, 0.56, 106, 114, "#e2e6ea");
    emit(c, 0.62, 0.62, 110, "rotor");
  },
  nuclear(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#a5a39d", 1);
    const tower = (x, y) => {
      const { g, P } = c; const [X, Yb] = P(x, y, 1); const Yt = P(x, y, 100)[1]; const r0 = 0.42 * RX, r1 = 0.28 * RX, rm = 0.25 * RX;
      const gr = g.createLinearGradient(X - r0, 0, X + r0, 0); gr.addColorStop(0, "#e9ebec"); gr.addColorStop(0.5, "#cfd3d6"); gr.addColorStop(1, "#8f959b");
      g.beginPath(); g.moveTo(X - r0, Yb); g.quadraticCurveTo(X - rm, (Yb + Yt) / 2 + 10, X - r1, Yt); g.lineTo(X + r1, Yt); g.quadraticCurveTo(X + rm, (Yb + Yt) / 2 + 10, X + r0, Yb); g.ellipse(X, Yb, r0, r0 / 2, 0, 0, Math.PI); g.closePath(); g.fillStyle = gr; g.fill();
      g.beginPath(); g.ellipse(X, Yt, r1, r1 / 2, 0, 0, Math.PI * 2); g.fillStyle = "#6d7378"; g.fill();
      emit(c, x, y, 104, "steamBig");
    };
    tower(0.55, 0.5);
    box(c, 1.1, 1.05, 1.85, 1.85, 1, 30, "#d6d4cc");
    dome(c, 0.6, 1.45, 0.38, 1, 50, "#c9ccd0");
    tower(1.45, 0.5);
    windows(c, "L", 1.85, 1.1, 1.85, 6, 26, { rows: 2, cols: 4, fw: 0.5 });
  },
  recycle(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#9a9890", 1.5);
    box(c, 0.1, 0.1, 0.62, 0.9, 1.5, 34, "#5f8a6a");
    windows(c, "R", 0.62, 0.1, 0.9, 4, 30, { rows: 2, cols: 3, fw: 0.6 });
    gable(c, 0.1, 0.1, 0.62, 0.9, 34, 8, "#3f4148", "y", { wall: "#5f8a6a" });
    for (let i = 0; i < 3; i++) box(c, 0.68, 0.12 + i * 0.27, 0.92, 0.34 + i * 0.27, 1.5, 9, ["#3a8ad2", "#e0c35a", "#3a8a5a"][i]);
    box(c, 0.7, 0.5, 0.74, 0.54, 9, 46, "#6b737d"); box(c, 0.5, 0.48, 0.74, 0.54, 44, 47, "#e0c35a", { edge: false });
    emit(c, 0.3, 0.4, 44, "steam");
  },
  lab(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#b8b4aa", 1.5);
    box(c, 0.1, 0.1, 0.9, 0.9, 1.5, 50, "#e8e6e0");
    windows(c, "L", 0.9, 0.1, 0.9, 4, 48, { rows: 4, cols: 5, fw: 0.85, fh: 0.5, glass: "#4b6d8b", chance: 0.6 });
    windows(c, "R", 0.9, 0.1, 0.9, 4, 48, { rows: 4, cols: 5, fw: 0.85, fh: 0.5, glass: "#4b6d8b", chance: 0.6 });
    dome(c, 0.45, 0.45, 0.25, 50, 18, "#dfe3e6");
    antenna(c, 0.8, 0.25, 50, 20);
  },
  hospital(c) {
    plate(c, 0.02, 0.02, 1.98, 1.98, "#c9c6bd", 1.5);
    box(c, 0.1, 0.1, 1.9, 1.0, 1.5, 70, "#f2f2ee");
    box(c, 0.1, 1.0, 1.0, 1.9, 1.5, 44, "#ececE6");
    windows(c, "R", 1.9, 0.1, 1.0, 4, 68, { rows: 8, cols: 4, fw: 0.8, fh: 0.5, glass: "#5d84a3", chance: 0.6 });
    windows(c, "L", 1.0, 0.1, 1.9, 4, 68, { rows: 8, cols: 4, fw: 0.8, fh: 0.5, glass: "#5d84a3", chance: 0.6 });
    windows(c, "L", 1.9, 0.1, 1.0, 4, 42, { rows: 5, cols: 4, fw: 0.8, fh: 0.5, glass: "#5d84a3", chance: 0.6 });
    windows(c, "R", 1.0, 1.0, 1.9, 4, 42, { rows: 5, cols: 4, fw: 0.8, fh: 0.5, glass: "#5d84a3", chance: 0.6 });
    box(c, 0.5, 0.3, 1.5, 0.8, 70, 72, "#c8322b", { edge: false });
    cylinder(c, 1.5, 0.55, 0.2, 70, 71, "#c8c8c8", { top: "#5a5a5a" });
    neonStrip(c, "L", 1.0, 0.4, 0.75, 54, 64, "#ff3b3b");
  },
  stadium(c) {
    plate(c, 0.0, 0.0, 2, 2, "#9a9890", 1);
    cylinder(c, 1, 1, 0.95, 1, 36, "#d8d6d0", { top: "#bdbab2" });
    ellipseFill(c, 1, 1, 36, 0.78 * RX, 0.78 * RY, "#a8a59d");
    ellipseFill(c, 1, 1, 37, 0.6 * RX, 0.6 * RY, "#5fa64a");
    const { g, P } = c; const [X, Y] = P(1, 1, 37); g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 0.8; g.beginPath(); g.ellipse(X, Y, 0.2 * RX, 0.2 * RY, 0, 0, Math.PI * 2); g.moveTo(X - 0.6 * RX * 0.7, Y - 0.6 * RY * 0.7); g.lineTo(X + 0.6 * RX * 0.7, Y + 0.6 * RY * 0.7); g.stroke();
    for (const [x, y] of [[0.2, 0.2], [1.8, 0.2], [0.2, 1.8], [1.8, 1.8]]) { box(c, x - 0.03, y - 0.03, x + 0.03, y + 0.03, 1, 70, "#7d828a"); emit(c, x, y, 72, "flood"); }
  },
  mall(c) {
    plate(c, 0.0, 0.0, 2, 2, "#8a8d92", 1);
    box(c, 0.1, 0.1, 1.9, 1.5, 1, 40, "#dcd6c8");
    windows(c, "L", 1.5, 0.1, 1.9, 4, 18, { cols: 10, fw: 0.9, fh: 0.8, glass: "#4b6d8b", chance: 0.8 });
    windows(c, "R", 1.9, 0.1, 1.5, 4, 18, { cols: 8, fw: 0.9, fh: 0.8, glass: "#4b6d8b", chance: 0.8 });
    neonStrip(c, "L", 1.5, 0.4, 1.6, 26, 34, "#d24a3a");
    neonStrip(c, "R", 1.9, 0.5, 1.1, 26, 34, "#2a8ad2");
    box(c, 0.6, 0.4, 1.4, 1.1, 40, 52, "#bfc8d0");
    const { g, P } = c; for (let i = 0; i < 10; i++) { const [X, Y] = P(0.2 + (i % 5) * 0.35, 1.62 + Math.floor(i / 5) * 0.18, 1); g.fillStyle = ["#d24a3a", "#3a6ad2", "#e0e0e0", "#2a2a2a", "#e0c35a"][i % 5]; g.fillRect(X - 3, Y - 2, 6, 3); }
  },
  park(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#6fb558", 1.5);
    const { g, P } = c;
    g.strokeStyle = "#e0d6bc"; g.lineWidth = 3; g.beginPath(); g.moveTo(...P(0.02, 0.6, 1.6)); g.quadraticCurveTo(...P(0.5, 0.2, 1.6), ...P(0.98, 0.5, 1.6)); g.stroke();
    ellipseFill(c, 0.7, 0.75, 1.7, 0.18 * RX, 0.12 * RY, "#4fa6d4");
    for (const [x, y, s] of [[0.2, 0.25, 0.8], [0.3, 0.8, 0.7], [0.82, 0.25, 0.75], [0.55, 0.45, 0.6]]) treeRound(c, x, y, s, "#4b9440");
    box(c, 0.45, 0.85, 0.6, 0.9, 1.5, 3.5, "#7a5a3a");
  },
  w5(c) {
    plate(c, 0.0, 0.0, 2, 2, "#b8b4aa", 2);
    box(c, 0.2, 0.2, 1.8, 1.8, 2, 30, "#9aa7b4");
    const tiers = [[0.35, 30, 160], [0.55, 160, 250], [0.75, 250, 300]];
    for (const [m, z0, z1] of tiers) {
      box(c, m, m, 2 - m, 2 - m, z0, z1, "#5f8fb8", { left: "#6fa3cc", right: "#3d6c94" });
      windows(c, "L", 2 - m, m, 2 - m, z0 + 2, z1 - 2, { rows: Math.floor((z1 - z0) / 6), cols: 6, fw: 0.9, fh: 0.7, glass: "rgba(0,0,0,0)", lit: "#fff6d0", chance: 0.35, reflect: false });
      windows(c, "R", 2 - m, m, 2 - m, z0 + 2, z1 - 2, { rows: Math.floor((z1 - z0) / 6), cols: 6, fw: 0.9, fh: 0.7, glass: "rgba(0,0,0,0)", lit: "#fff6d0", chance: 0.3, reflect: false });
    }
    antenna(c, 1, 1, 300, 30);
  },
  solar(c, era) {
    plate(c, 0.02, 0.02, 0.98, 0.98, era >= 7 ? "#2a2a36" : "#9fae8e", 1);
    const { g, P } = c;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x0 = 0.08 + j * 0.46, y0 = 0.08 + i * 0.3;
      const q = [P(x0, y0, 10), P(x0 + 0.4, y0, 10), P(x0 + 0.4, y0 + 0.24, 3), P(x0, y0 + 0.24, 3)];
      box(c, x0 + 0.18, y0 + 0.1, x0 + 0.22, y0 + 0.14, 1, 6, "#8a9097", { edge: false });
      const gr = g.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]); gr.addColorStop(0, "#3b6fb0"); gr.addColorStop(0.5, "#1f3f78"); gr.addColorStop(1, "#5d8fd0");
      poly(g, q, gr, "#c9d2dc", 0.8);
      g.strokeStyle = "rgba(200,220,255,.4)"; g.lineWidth = 0.5; g.beginPath(); g.moveTo((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2); g.lineTo((q[3][0] + q[2][0]) / 2, (q[3][1] + q[2][1]) / 2); g.stroke();
    }
  },
  vfarm(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#c6cbd1", 1.5);
    const H = 150;
    box(c, 0.14, 0.14, 0.86, 0.86, 1.5, H, "#e8eef2");
    for (let f = 0; f < 12; f++) {
      const z = 6 + f * 12;
      box(c, 0.12, 0.12, 0.88, 0.88, z, z + 2, "#cdd6dc", { edge: false });
      neonStrip(c, "L", 0.885, 0.15, 0.85, z + 2, z + 4, f % 2 ? "#6edb5a" : "#4fc24a");
      neonStrip(c, "R", 0.885, 0.15, 0.85, z + 2, z + 4, "#58cf4e");
      if (c.L) { const a = c.P(0.15, 0.88, z + 9), b = c.P(0.88, 0.88, z + 9), d = c.P(0.88, 0.15, z + 9); c.L.strokeStyle = "rgba(255,120,240,.6)"; c.L.lineWidth = 2; c.L.beginPath(); c.L.moveTo(...a); c.L.lineTo(...b); c.L.lineTo(...d); c.L.stroke(); }
    }
    box(c, 0.2, 0.2, 0.8, 0.8, H, H + 4, "#dfe6ee");
    cylinder(c, 0.5, 0.5, 0.15, H + 4, H + 14, "#7fd0e8");
  },
  metro(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#c9ccd1", 1.5);
    box(c, 0.2, 0.25, 0.8, 0.75, 1.5, 4, "#8a9097");
    const { g, P } = c;
    poly(g, [P(0.15, 0.2, 26), P(0.85, 0.2, 26), P(0.85, 0.8, 22), P(0.15, 0.8, 22)], "rgba(120,190,230,.55)", "#dfe6ee");
    for (const [x, y] of [[0.18, 0.22], [0.82, 0.22], [0.82, 0.78], [0.18, 0.78]]) box(c, x - 0.02, y - 0.02, x + 0.02, y + 0.02, 1.5, 24, "#dfe6ee");
    box(c, 0.3, 0.3, 0.7, 0.4, 1.5, 14, "#2a3a4a");
    box(c, 0.7, 0.5, 0.78, 0.58, 1.5, 40, "#dfe6ee"); neonStrip(c, "L", 0.58, 0.7, 0.78, 30, 38, "#18b0a0");
  },
  datacenter(c) {
    plate(c, 0.0, 0.0, 2, 2, "#b9c0c8", 1.5);
    box(c, 0.1, 0.1, 1.9, 1.9, 1.5, 56, "#d9dee4");
    for (let i = 0; i < 6; i++) neonStrip(c, "L", 1.9, 0.2 + i * 0.28, 0.32 + i * 0.28, 8, 48, "#18b0a0");
    for (let i = 0; i < 6; i++) neonStrip(c, "R", 1.9, 0.2 + i * 0.28, 0.32 + i * 0.28, 8, 48, "#3a8ad2");
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { cylinder(c, 0.45 + i * 0.55, 0.45 + j * 0.55, 0.16, 56, 62, "#aab4bf", { top: "#6b7480" }); emit(c, 0.45 + i * 0.55, 0.45 + j * 0.55, 63, "heat"); }
  },
  campus(c) {
    plate(c, 0.0, 0.0, 2, 2, "#7fbd66", 1.5);
    const { g, P } = c;
    box(c, 0.1, 0.1, 1.0, 1.0, 1.5, 150, "#5fb0d8", { left: "#70bde2", right: "#3f86ad" });
    windows(c, "L", 1.0, 0.1, 1.0, 4, 146, { rows: 24, cols: 5, fw: 0.9, fh: 0.8, glass: "rgba(0,0,0,0)", lit: "#e9f7ff", chance: 0.3, reflect: false });
    windows(c, "R", 1.0, 0.1, 1.0, 4, 146, { rows: 24, cols: 5, fw: 0.9, fh: 0.8, glass: "rgba(0,0,0,0)", lit: "#e9f7ff", chance: 0.3, reflect: false });
    box(c, 0.1, 0.1, 1.0, 1.0, 150, 154, "#f2f6f9");
    cylinder(c, 1.45, 1.45, 0.42, 1.5, 34, "#f4f7fa");
    cylinder(c, 1.45, 1.45, 0.3, 34, 36, "#7fbd66", { top: "#6fae58" });
    poly(g, [P(1.0, 1.2, 1.6), P(1.95, 1.2, 1.6), P(1.95, 1.3, 1.6), P(1.0, 1.3, 1.6)], "#e0e4e8");
    treeRound(c, 0.4, 1.6, 0.7, "#55a345"); treeRound(c, 1.6, 0.4, 0.7, "#55a345");
  },
  w6(c) {
    plate(c, 0.0, 0.0, 2, 2, "#9aa3ad", 2);
    box(c, 0.1, 0.1, 1.9, 1.9, 2, 8, "#6b737d");
    box(c, 1.45, 0.3, 1.6, 1.7, 8, 230, "#8a929c");
    const { g, P } = c; g.strokeStyle = "#6b737d"; g.lineWidth = 0.8; for (let z = 20; z < 230; z += 18) { g.beginPath(); g.moveTo(...P(1.45, 1.7, z)); g.lineTo(...P(1.45, 0.3, z + 18)); g.stroke(); }
    box(c, 1.1, 0.95, 1.45, 1.05, 160, 166, "#8a929c");
    cylinder(c, 0.95, 1.0, 0.24, 8, 200, "#f4f5f7");
    for (const z of [60, 120, 170]) cylinder(c, 0.95, 1.0, 0.245, z, z + 6, "#222", { top: false });
    cone(c, 0.95, 1.0, 0.24, 200, 40, "#d84a3a");
    cylinder(c, 0.62, 1.1, 0.09, 8, 90, "#e4e6ea"); cone(c, 0.62, 1.1, 0.09, 90, 16, "#e4e6ea");
    cylinder(c, 1.15, 1.35, 0.09, 8, 90, "#e4e6ea"); cone(c, 1.15, 1.35, 0.09, 90, 16, "#e4e6ea");
    emit(c, 0.95, 1.0, 10, "steamBig");
    antenna(c, 1.52, 1.0, 230, 20);
  },
  fusion(c) {
    plate(c, 0.0, 0.0, 2, 2, "#1d1c27", 2);
    box(c, 0.1, 0.1, 1.9, 1.9, 2, 20, "#2b2938");
    windows(c, "L", 1.9, 0.1, 1.9, 4, 18, { cols: 10, glass: "#141220", lit: "#05d9e8", chance: 0.7 });
    cylinder(c, 1, 1, 0.75, 20, 60, "#34324a");
    const { g, P } = c; const [X, Y] = P(1, 1, 60);
    g.beginPath(); g.ellipse(X, Y, 0.75 * RX, 0.75 * RY, 0, 0, Math.PI * 2); g.fillStyle = "#1a1826"; g.fill();
    g.lineWidth = 6; g.strokeStyle = "#3fe8ff"; g.beginPath(); g.ellipse(X, Y, 0.55 * RX, 0.55 * RY, 0, 0, Math.PI * 2); g.stroke();
    if (c.L) { c.L.lineWidth = 7; c.L.strokeStyle = "#3fe8ff"; c.L.shadowColor = "#3fe8ff"; c.L.shadowBlur = 16; c.L.beginPath(); c.L.ellipse(X, Y, 0.55 * RX, 0.55 * RY, 0, 0, Math.PI * 2); c.L.stroke(); c.L.shadowBlur = 0; }
    cylinder(c, 1, 1, 0.2, 60, 140, "#3a3852");
    neonStrip(c, "L", 1.2, 0.85, 1.15, 70, 136, "#3fe8ff");
    emit(c, 1, 1, 145, "plasma");
    for (const [x, y] of [[0.25, 0.25], [1.75, 0.25], [0.25, 1.75], [1.75, 1.75]]) { box(c, x - 0.06, y - 0.06, x + 0.06, y + 0.06, 20, 90, "#2f2d40"); emit(c, x, y, 92, "blink"); }
  },
  arco(c) {
    plate(c, 0.0, 0.0, 2, 2, "#1d1c27", 2);
    const tiers = [[0.1, 2, 80, "#2c2a3c"], [0.3, 80, 200, "#26243a"], [0.5, 200, 300, "#2a2840"], [0.7, 300, 350, "#302d48"]];
    tiers.forEach(([m, z0, z1, col], k) => {
      box(c, m, m, 2 - m, 2 - m, z0, z1, col, { right: shade(col, -0.35) });
      windows(c, "L", 2 - m, m, 2 - m, z0 + 3, z1 - 3, { rows: Math.floor((z1 - z0) / 7), cols: 7 - k, fw: 0.7, fh: 0.4, glass: "#17141f", lit: ["#ff63d0", "#7af7ff", "#ffe066", "#ffffff"], chance: 0.4, reflect: false });
      windows(c, "R", 2 - m, m, 2 - m, z0 + 3, z1 - 3, { rows: Math.floor((z1 - z0) / 7), cols: 7 - k, fw: 0.7, fh: 0.4, glass: "#100e17", lit: ["#ff63d0", "#7af7ff", "#ffffff"], chance: 0.35, reflect: false });
      neonStrip(c, "L", 2 - m + 0.01, m, 2 - m, z1 - 3, z1, NEON[k]);
      neonStrip(c, "R", 2 - m + 0.01, m, 2 - m, z1 - 3, z1, NEON[k + 1]);
      if (k < 3) plate(c, m + 0.05, m + 0.05, m + 0.18, 2 - m - 0.05, "#3e7a5a", z1 + 2);
    });
    antenna(c, 1, 1, 350, 30);
    emit(c, 1.3, 1.3, 260, "holo");
  },
  nightmarket(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#1f1d2a", 1.5);
    for (let i = 0; i < 4; i++) {
      const x0 = 0.08 + (i % 2) * 0.46, y0 = 0.08 + Math.floor(i / 2) * 0.46;
      box(c, x0, y0, x0 + 0.38, y0 + 0.38, 1.5, 14, "#2e2b3e");
      box(c, x0 - 0.02, y0 - 0.02, x0 + 0.4, y0 + 0.4, 14, 16, "#3a3650");
      neonStrip(c, "L", y0 + 0.39, x0, x0 + 0.38, 10, 13, NEON[i]);
      neonStrip(c, "R", x0 + 0.39, y0, y0 + 0.38, 10, 13, NEON[(i + 1) % 6]);
    }
    box(c, 0.45, 0.45, 0.55, 0.55, 16, 50, "#3a3650");
    neonStrip(c, "L", 0.55, 0.3, 0.7, 36, 48, "#fcee0a");
    emit(c, 0.5, 0.5, 52, "steam");
  },
  braindance(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#1f1d2a", 1.5);
    box(c, 0.12, 0.12, 0.88, 0.88, 1.5, 70, "#24213a", { right: "#16141f" });
    neonStrip(c, "L", 0.88, 0.12, 0.88, 50, 66, "#b026ff");
    neonStrip(c, "R", 0.88, 0.12, 0.88, 50, 66, "#ff2a6d");
    windows(c, "L", 0.88, 0.12, 0.88, 6, 44, { rows: 4, cols: 3, glass: "#1a1626", lit: ["#b026ff", "#ff63d0"], chance: 0.6, reflect: false });
    dome(c, 0.5, 0.5, 0.3, 70, 26, "#6a3aa8");
    if (c.L) { const [X, Y] = c.P(0.5, 0.5, 70); c.L.fillStyle = "rgba(176,38,255,.6)"; c.L.shadowColor = "#b026ff"; c.L.shadowBlur = 14; c.L.beginPath(); c.L.ellipse(X, Y - 10, 12, 12, 0, 0, Math.PI * 2); c.L.fill(); c.L.shadowBlur = 0; }
    emit(c, 0.5, 0.5, 100, "holo");
  },
  ripper(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#1f1d2a", 1.5);
    box(c, 0.12, 0.2, 0.88, 0.85, 1.5, 34, "#34323f");
    windows(c, "L", 0.85, 0.12, 0.88, 4, 30, { rows: 2, cols: 3, glass: "#141220", lit: ["#39ff88", "#05d9e8"], chance: 0.8 });
    neonStrip(c, "R", 0.885, 0.3, 0.75, 20, 30, "#39ff88");
    box(c, 0.4, 0.86, 0.6, 0.9, 38, 52, "#39ff88", { edge: false });
    box(c, 0.32, 0.86, 0.68, 0.9, 42, 48, "#39ff88", { edge: false });
    if (c.L) { const q = [c.P(0.32, 0.9, 42), c.P(0.68, 0.9, 42), c.P(0.68, 0.9, 48), c.P(0.32, 0.9, 48)]; c.L.shadowColor = "#39ff88"; c.L.shadowBlur = 10; poly(c.L, q, "#39ff88"); c.L.shadowBlur = 0; }
    box(c, 0.2, 0.3, 0.5, 0.6, 34, 44, "#555a66");
  },
  drones(c) {
    plate(c, 0.02, 0.02, 0.98, 0.98, "#1f1d2a", 1.5);
    cylinder(c, 0.5, 0.5, 0.32, 1.5, 80, "#2e2c3e");
    neonStrip(c, "L", 0.82, 0.3, 0.7, 20, 76, "#05d9e8");
    cylinder(c, 0.5, 0.5, 0.42, 80, 86, "#3a3850", { top: "#22202e" });
    const { g, P } = c; const [X, Y] = P(0.5, 0.5, 86); g.strokeStyle = "#fcee0a"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(X, Y, 0.3 * RX, 0.3 * RY, 0, 0, Math.PI * 2); g.stroke();
    emit(c, 0.5, 0.5, 92, "drone"); emit(c, 0.5, 0.5, 86, "blink");
  },
  aicore(c) {
    plate(c, 0.0, 0.0, 2, 2, "#15141d", 2);
    box(c, 0.1, 0.1, 1.9, 1.9, 2, 40, "#22202e");
    for (let i = 0; i < 5; i++) neonStrip(c, "L", 1.9, 0.2 + i * 0.35, 0.32 + i * 0.35, 6, 36, "#ff2a6d");
    for (let i = 0; i < 5; i++) neonStrip(c, "R", 1.9, 0.2 + i * 0.35, 0.32 + i * 0.35, 6, 36, "#ff2a6d");
    for (const [x, y] of [[0.4, 0.4], [1.6, 0.4], [0.4, 1.6], [1.6, 1.6]]) { box(c, x - 0.08, y - 0.08, x + 0.08, y + 0.08, 40, 150, "#2b2938"); emit(c, x, y, 152, "blink"); }
    const { g, P } = c; const [X, Y] = P(1, 1, 120);
    const gr = g.createRadialGradient(X - 10, Y - 10, 2, X, Y, 34); gr.addColorStop(0, "#ffd0e0"); gr.addColorStop(0.4, "#ff2a6d"); gr.addColorStop(1, "#4a0a20");
    g.fillStyle = gr; g.beginPath(); g.arc(X, Y, 30, 0, Math.PI * 2); g.fill();
    if (c.L) { c.L.fillStyle = "rgba(255,42,109,.7)"; c.L.shadowColor = "#ff2a6d"; c.L.shadowBlur = 26; c.L.beginPath(); c.L.arc(X, Y, 28, 0, Math.PI * 2); c.L.fill(); c.L.shadowBlur = 0; }
    emit(c, 1, 1, 120, "core");
  },
  nanofab(c) {
    plate(c, 0.0, 0.0, 2, 2, "#15141d", 2);
    box(c, 0.1, 0.1, 1.9, 1.9, 2, 46, "#26243a", { right: "#16141f" });
    windows(c, "L", 1.9, 0.1, 1.9, 6, 42, { rows: 3, cols: 10, fw: 0.8, fh: 0.4, glass: "#141220", lit: ["#39ff88", "#05d9e8"], chance: 0.55, reflect: false });
    windows(c, "R", 1.9, 0.1, 1.9, 6, 42, { rows: 3, cols: 10, fw: 0.8, fh: 0.4, glass: "#100e17", lit: ["#39ff88"], chance: 0.5, reflect: false });
    neonStrip(c, "L", 1.9, 0.1, 1.9, 44, 46, "#39ff88");
    for (const [x, y] of [[0.55, 0.55], [1.45, 0.55], [0.55, 1.45], [1.45, 1.45]]) { cylinder(c, x, y, 0.24, 46, 84, "#3a3852"); cylinder(c, x, y, 0.27, 84, 88, "#2a2838", { top: "#39ff88" }); emit(c, x, y, 90, "plasma"); }
  },
  holo(c) {
    plate(c, 0.25, 0.25, 0.75, 0.75, "#2b2938", 1.5);
    cylinder(c, 0.5, 0.5, 0.16, 1.5, 6, "#3a3850", { top: "#05d9e8" });
    emit(c, 0.5, 0.5, 8, "hologram");
  },
  w7(c) {
    plate(c, 0.0, 0.0, 2, 2, "#15141d", 2);
    const tiers = [[0.08, 2, 120], [0.25, 120, 280], [0.42, 280, 400], [0.62, 400, 460]];
    tiers.forEach(([m, z0, z1], k) => {
      box(c, m, m, 2 - m, 2 - m, z0, z1, "#1f1d2c", { right: "#121119" });
      windows(c, "L", 2 - m, m, 2 - m, z0 + 3, z1 - 3, { rows: Math.floor((z1 - z0) / 6), cols: 8 - k, fw: 0.8, fh: 0.3, glass: "#151220", lit: ["#fcee0a", "#ffffff", "#ff2a6d"], chance: 0.35, reflect: false });
      windows(c, "R", 2 - m, m, 2 - m, z0 + 3, z1 - 3, { rows: Math.floor((z1 - z0) / 6), cols: 8 - k, fw: 0.8, fh: 0.3, glass: "#0f0d16", lit: ["#fcee0a", "#ffffff"], chance: 0.3, reflect: false });
      neonStrip(c, "L", 2 - m, m, m + 0.04, z0, z1, "#fcee0a");
      neonStrip(c, "R", 2 - m, 2 - m - 0.04, 2 - m, z0, z1, "#ff2a6d");
      neonStrip(c, "L", 2 - m + 0.01, m, 2 - m, z1 - 4, z1, "#05d9e8");
    });
    neonStrip(c, "L", 1.76, 0.6, 1.4, 200, 240, "#ff2a6d");
    cylinder(c, 1, 1, 0.2, 460, 470, "#2a2838");
    antenna(c, 1, 1, 470, 46);
    emit(c, 1, 1, 380, "holo"); emit(c, 1, 1, 470, "beacon");
  }
};

export function buildingSprite(def, b, era, scale) {
  const seed = (b.v || 1) + 7;
  return makeSprite(def.size, def.h, scale, era, seed, (c) => {
    groundShadow(c, 0.1, 0.1, def.size - 0.1, def.size - 0.1, Math.min(def.h, 120));
    if (def.id === "house") drawHouse(c, era, b.l, b.v);
    else if (def.id === "center") drawCenter(c, era);
    else ART[def.id]?.(c, era, b);
  });
}

// Petite image pour la palette de construction.
export function iconCanvas(def, era) {
  const sp = buildingSprite(def, { l: def.id === "house" ? 2 : 1, v: 3 }, Math.max(era, def.era), 1);
  const out = document.createElement("canvas");
  out.width = 64; out.height = 64;
  const g = out.getContext("2d");
  const k = Math.min(60 / sp.w, 60 / (sp.ay + def.size * TH + 4), 1.4);
  const w = sp.w * k, h = sp.h * k;
  g.drawImage(sp.c, (64 - w) / 2, 62 - (sp.ay + def.size * TH + 8) * k, w, h);
  return out;
}

/* ===================== Sol ===================== */

// Case de terrain (avec la lèvre de terre quand le voisin du bas est de l'eau). mask : bit 1 = eau en x+1, bit 2 = eau en y+1.
export function groundSprite(type, variant, era, mask, scale) {
  return makeSprite(1, 14, scale, era, variant * 31 + type * 7 + 3, (c) => {
    const { g, P, rnd } = c;
    const dia = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    let base;
    if (type === 1) {
      base = "#3a86bf";
      const gr = g.createLinearGradient(dia[0][0], dia[0][1], dia[2][0], dia[2][1]);
      gr.addColorStop(0, "#4a9bd0"); gr.addColorStop(1, "#2f74ad");
      poly(g, grow(dia), gr);
      return;
    }
    if (type === 5) base = ["#dcc68e", "#d8c088", "#e0cb94", "#d4bd84"][variant % 4];
    else {
      const gc = GRASS[era];
      base = shade(gc, [0, 0.04, -0.04, 0.02][variant % 4]);
    }
    poly(g, grow(dia), base);
    // petites touches de texture
    for (let i = 0; i < 18; i++) {
      const u = rnd(), v = rnd();
      const [X, Y] = P(u, v);
      g.fillStyle = rnd() < 0.5 ? rgba(shade(base, 0.18), 0.5) : rgba(shade(base, -0.18), 0.5);
      g.fillRect(X, Y, 1.4, 1);
    }
    if (type === 0 && era < 5 && rnd() < 0.5) for (let i = 0; i < 3; i++) { const [X, Y] = P(rnd(), rnd()); g.fillStyle = ["#f5e36a", "#ffffff", "#e86a9a"][i]; g.fillRect(X, Y, 1.5, 1.5); }
    if (type === 0 && era === 7) for (let i = 0; i < 2; i++) { const [X, Y] = P(rnd(), rnd()); g.fillStyle = "rgba(5,217,232,.25)"; g.fillRect(X, Y, 3, 1); }
    // bord légèrement plus sombre pour lire la grille
    g.strokeStyle = rgba(shade(base, -0.3), 0.18); g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(...dia[3]); g.lineTo(...dia[2]); g.lineTo(...dia[1]); g.stroke();
    // lèvres de terre au-dessus de l'eau
    const soil = type === 5 ? "#b49a68" : "#8a6a48";
    if (mask & 2) poly(g, [P(0, 1), P(1, 1), P(1, 1, -5), P(0, 1, -5)], vgrad(g, 0, P(0, 1)[1], P(0, 1, -5)[1], soil, shade(soil, -0.3)));
    if (mask & 1) poly(g, [P(1, 0), P(1, 1), P(1, 1, -5), P(1, 0, -5)], vgrad(g, 0, P(1, 0)[1], P(1, 0, -5)[1], shade(soil, -0.15), shade(soil, -0.4)));
  }, false);
}

function grow(d) {
  // agrandit le losange d'un demi-pixel pour éviter les joints entre cases
  return [[d[0][0], d[0][1] - 0.6], [d[1][0] + 0.9, d[1][1]], [d[2][0], d[2][1] + 0.6], [d[3][0] - 0.9, d[3][1]]];
}

// Objets naturels posés sur une case : forêt, roche, filon.
export function natureSprite(type, variant, era, scale) {
  return makeSprite(1, 40, scale, era, variant * 13 + type * 101 + 5, (c) => {
    const { rnd } = c;
    if (type === 2) {
      const n = 2 + Math.floor(rnd() * 3);
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6]);
      pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
      const greens = era === 7 ? ["#2f6b55", "#2a5e58", "#386a4a"] : ["#3f7a3a", "#4b8a3e", "#356b38", "#558f42"];
      for (const [x, y] of pts) {
        const s = 0.75 + rnd() * 0.45;
        if (rnd() < 0.55) treePine(c, x, y, s, greens[Math.floor(rnd() * greens.length)]);
        else treeRound(c, x, y, s * 0.85, greens[Math.floor(rnd() * greens.length)]);
      }
    } else {
      const ore = type === 4;
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const x = 0.25 + rnd() * 0.45, y = 0.25 + rnd() * 0.45, s = 0.12 + rnd() * 0.13, h = 6 + rnd() * 10;
        const col = ore ? "#6e6670" : ["#9a948a", "#8d877d", "#a39d92"][i % 3];
        rock(c, x, y, s, h, col);
        if (ore) for (let k = 0; k < 3; k++) {
          const [X, Y] = c.P(x + (rnd() - 0.5) * s, y + (rnd() - 0.5) * s, h * (0.3 + rnd() * 0.6));
          const cc = ["#ffcf4a", "#6ee7ff", "#ff7ad9"][Math.floor(rnd() * 3)];
          c.g.fillStyle = cc; c.g.beginPath(); c.g.moveTo(X, Y - 3); c.g.lineTo(X + 2, Y); c.g.lineTo(X, Y + 2); c.g.lineTo(X - 2, Y); c.g.fill();
          if (c.L) { c.L.fillStyle = cc; c.L.shadowColor = cc; c.L.shadowBlur = 5; c.L.fillRect(X - 1, Y - 1, 2, 2); c.L.shadowBlur = 0; }
        }
      }
      if (!ore && rnd() < 0.6) bush(c, 0.75, 0.72, 0.5, "#5b8a40");
    }
  });
}

function rock(c, x, y, s, h, col) {
  const { g, P } = c;
  const pts = [P(x - s, y, 0), P(x, y - s, 0), P(x + s, y, 0), P(x, y + s, 0)];
  const topP = P(x - s * 0.2, y - s * 0.2, h);
  g.fillStyle = "rgba(20,25,30,.2)"; g.beginPath(); g.ellipse(pts[3][0] + 3, pts[3][1] - 2, s * RX, s * RY * 0.8, 0, 0, Math.PI * 2); g.fill();
  poly(g, [pts[0], pts[3], topP], shade(col, 0.12));
  poly(g, [pts[3], pts[2], topP], shade(col, -0.2));
  poly(g, [pts[0], pts[1], topP], shade(col, 0.22));
  poly(g, [pts[1], pts[2], topP], shade(col, -0.05));
}

/* ===================== Routes ===================== */

// mask : 1 = route en x+1, 2 = en y+1, 4 = en x−1, 8 = en y−1.
export function roadSprite(era, mask, variant, scale) {
  return makeSprite(1, 12, scale, era, variant + mask * 17 + 9, (c) => {
    const { g, L, P, rnd } = c;
    const dia = grow([P(0, 0), P(1, 0), P(1, 1), P(0, 1)]);
    const style = [
      { w: 0.34, col: "#a98b5e", side: null },
      { w: 0.5, col: "#d6c8a4", side: null, joints: "#b9a982" },
      { w: 0.5, col: "#9b9488", side: null, cobble: true },
      { w: 0.56, col: "#8f9196", side: "#c8c1b2", cobble: true },
      { w: 0.66, col: "#58544f", side: "#a59f93" },
      { w: 0.66, col: "#4a4c50", side: "#b9b5ac", dash: "#f2f0e8" },
      { w: 0.7, col: "#3b3e44", side: "#cdd1d6", dash: "#ffffff", edgeLine: "#e8c64a" },
      { w: 0.72, col: "#1c1b26", side: "#2c2a3a", dash: "#05d9e8", neon: true }
    ][era];
    const gc = GRASS[era];
    poly(g, dia, style.side || shade(gc, [0, 0.03, -0.03, 0.02][variant % 4]));
    if (style.side) {
      g.strokeStyle = rgba(shade(style.side, -0.3), 0.3); g.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(...P(i / 4, 0)); g.lineTo(...P(i / 4, 1)); g.moveTo(...P(0, i / 4)); g.lineTo(...P(1, i / 4)); g.stroke(); }
    }
    const w = style.w, a = 0.5 - w / 2, b = 0.5 + w / 2;
    const rects = [[a, a, b, b]];
    if (mask & 1) rects.push([b, a, 1.02, b]);
    if (mask & 4) rects.push([-0.02, a, a, b]);
    if (mask & 2) rects.push([a, b, b, 1.02]);
    if (mask & 8) rects.push([a, -0.02, b, a]);
    if (!mask) rects.push([a - 0.1, a - 0.1, b + 0.1, b + 0.1]);
    for (const [x0, y0, x1, y1] of rects) poly(g, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], style.col);
    // bords
    if (era === 0) for (let i = 0; i < 10; i++) { const [X, Y] = P(a + rnd() * w, a + rnd() * w); g.fillStyle = rgba("#6b5233", 0.5); g.fillRect(X, Y, 2, 1); }
    if (style.cobble || style.joints) {
      for (const [x0, y0, x1, y1] of rects) for (let i = 0; i < 14; i++) {
        const [X, Y] = P(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0));
        g.fillStyle = rgba(rnd() < 0.5 ? shade(style.col, 0.2) : shade(style.col, -0.2), 0.7); g.fillRect(X - 1, Y - 0.5, 2.2, 1.2);
      }
    }
    if (style.dash) {
      g.strokeStyle = style.dash; g.lineWidth = 0.9; g.setLineDash([3, 3]);
      const lines = [];
      if (mask & 1) lines.push([[0.5, 0.5], [1, 0.5]]);
      if (mask & 4) lines.push([[0, 0.5], [0.5, 0.5]]);
      if (mask & 2) lines.push([[0.5, 0.5], [0.5, 1]]);
      if (mask & 8) lines.push([[0.5, 0], [0.5, 0.5]]);
      const straight = mask === 5 || mask === 10;
      if (straight || (mask && (mask & (mask - 1)) === 0)) for (const [p0, p1] of lines) { g.beginPath(); g.moveTo(...P(...p0)); g.lineTo(...P(...p1)); g.stroke(); }
      g.setLineDash([]);
      if (style.neon && L) {
        L.strokeStyle = "#05d9e8"; L.lineWidth = 1; L.shadowColor = "#05d9e8"; L.shadowBlur = 4;
        for (const [x0, y0, x1, y1] of rects.slice(0, 1)) { L.beginPath(); L.moveTo(...P(x0, y0)); L.lineTo(...P(x1, y0)); L.lineTo(...P(x1, y1)); L.lineTo(...P(x0, y1)); L.closePath(); L.stroke(); }
        L.strokeStyle = "#ff2a6d"; L.shadowColor = "#ff2a6d";
        const edges = [];
        if (mask & 1) edges.push([[b, a], [1, a]], [[b, b], [1, b]]);
        if (mask & 4) edges.push([[0, a], [a, a]], [[0, b], [a, b]]);
        if (mask & 2) edges.push([[a, b], [a, 1]], [[b, b], [b, 1]]);
        if (mask & 8) edges.push([[a, 0], [a, a]], [[b, 0], [b, a]]);
        for (const [p0, p1] of edges) { L.beginPath(); L.moveTo(...P(...p0)); L.lineTo(...P(...p1)); L.stroke(); }
        L.shadowBlur = 0;
      }
    }
    if (style.edgeLine) {
      g.strokeStyle = rgba(style.edgeLine, 0.6); g.lineWidth = 0.6;
      if (mask & 1 || mask & 4) { g.beginPath(); g.moveTo(...P(mask & 4 ? 0 : a, a + 0.04)); g.lineTo(...P(mask & 1 ? 1 : b, a + 0.04)); g.stroke(); }
    }
  }, era === 7);
}

// Lampadaire (objet trié avec les bâtiments).
export function lampSprite(era, scale) {
  return makeSprite(1, 40, scale, era, 3, (c) => {
    const { g, L, P } = c;
    const col = era >= 7 ? "#3a3850" : era >= 4 ? "#2f3338" : "#3a2f28";
    const h = era >= 5 ? 22 : 16;
    const [X, Y] = P(0.12, 0.12, 0);
    g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - h); g.stroke();
    const lc = era >= 7 ? "#ff63d0" : era >= 5 ? "#fff2c8" : "#ffc977";
    g.fillStyle = era >= 5 ? "#e8e8e0" : "#f0d090"; g.fillRect(X - 1.5, Y - h - 2, 3, 3);
    if (L) {
      const gr = L.createRadialGradient(X, Y - h, 0, X, Y - h, 14);
      gr.addColorStop(0, rgba(lc, 0.75)); gr.addColorStop(1, rgba(lc, 0));
      L.fillStyle = gr; L.fillRect(X - 14, Y - h - 14, 28, 28);
      const pool = L.createRadialGradient(X, Y, 0, X, Y, 18);
      pool.addColorStop(0, rgba(lc, 0.35)); pool.addColorStop(1, rgba(lc, 0));
      L.fillStyle = pool; L.beginPath(); L.ellipse(X, Y, 18, 9, 0, 0, Math.PI * 2); L.fill();
    }
  });
}

/* ===================== Petits personnages et véhicules (dessinés à chaque image) ===================== */

export function drawWalker(g, x, y, col, step, era) {
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x - 1.5, y - 0.5, 3, 1.2);
  const leg = Math.sin(step) * 1.2;
  g.fillStyle = "#2a2622"; g.fillRect(x - 1 + leg * 0.3, y - 2.5, 0.9, 2.5); g.fillRect(x + 0.1 - leg * 0.3, y - 2.5, 0.9, 2.5);
  g.fillStyle = col; g.fillRect(x - 1.3, y - 5.5, 2.6, 3.2);
  g.fillStyle = era === 7 ? "#c8a8ff" : "#e9c9a5"; g.fillRect(x - 0.9, y - 7.2, 1.8, 1.8);
}

export function drawCar(g, x, y, dir, col, era, L, night) {
  // dir : 0 = vers x+, 1 = vers y+, 2 = vers x−, 3 = vers y−
  const alongX = dir % 2 === 0;
  const len = 9, wid = 5, h = era >= 7 ? 3.5 : 4;
  const ux = alongX ? [16 / 17.9, 8 / 17.9] : [-16 / 17.9, 8 / 17.9];   // direction écran de l'axe
  const vx = alongX ? [-16 / 17.9, 8 / 17.9] : [16 / 17.9, 8 / 17.9];
  const pt = (a, b, z) => [x + ux[0] * a + vx[0] * b, y + ux[1] * a + vx[1] * b - z];
  const A = -len / 2, B = len / 2, C = -wid / 2, D = wid / 2;
  g.fillStyle = "rgba(0,0,0,.3)";
  g.beginPath(); g.moveTo(...pt(A, C, 0)); g.lineTo(...pt(B, C, 0)); g.lineTo(...pt(B, D, 0)); g.lineTo(...pt(A, D, 0)); g.fill();
  const side = shade(col, -0.25);
  const face = (p) => { g.beginPath(); g.moveTo(...p[0]); for (const q of p.slice(1)) g.lineTo(...q); g.closePath(); g.fill(); };
  g.fillStyle = side; face([pt(A, D, 0), pt(B, D, 0), pt(B, D, h), pt(A, D, h)]);
  g.fillStyle = shade(col, -0.4); face([pt(B, C, 0), pt(B, D, 0), pt(B, D, h), pt(B, C, h)]);
  g.fillStyle = col; face([pt(A, C, h), pt(B, C, h), pt(B, D, h), pt(A, D, h)]);
  g.fillStyle = era >= 7 ? "#1a1626" : "#2e3d4d"; face([pt(A * 0.4, C * 0.8, h + 0.1), pt(B * 0.5, C * 0.8, h + 0.1), pt(B * 0.5, D * 0.8, h + 0.1), pt(A * 0.4, D * 0.8, h + 0.1)]);
  if (L && night > 0.05) {
    const fwd = dir < 2 ? 1 : -1;
    const [hx, hy] = pt(fwd * B, 0, 1.5);
    const gr = L.createRadialGradient(hx, hy, 0, hx, hy, 12);
    gr.addColorStop(0, "rgba(255,245,210,.9)"); gr.addColorStop(1, "rgba(255,245,210,0)");
    L.fillStyle = gr; L.fillRect(hx - 12, hy - 12, 24, 24);
    const [tx, ty] = pt(-fwd * B, 0, 1.5);
    L.fillStyle = "rgba(255,40,40,.9)"; L.fillRect(tx - 1, ty - 1, 2, 2);
    if (era >= 7) { L.fillStyle = rgba(col, 0.6); L.fillRect(x - 4, y + 1, 8, 1.5); }
  }
}

export function drawCart(g, x, y, dir, era) {
  const alongX = dir % 2 === 0;
  g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(x, y, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8b6640"; g.fillRect(x - 3, y - 5, 6, 3);
  g.fillStyle = "#c9a65a"; g.fillRect(x - 3, y - 7, 6, 2);
  g.fillStyle = "#3a2a1c"; g.beginPath(); g.arc(x + (alongX ? -2 : 2), y - 1.5, 1.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = era >= 3 ? "#6b4a2c" : "#7a6a5a"; g.fillRect(x + (alongX ? 3 : -6), y - 5, 3, 3);
}
