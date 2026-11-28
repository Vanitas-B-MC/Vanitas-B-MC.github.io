// js/avatar-art.js — dessin de l'avatar au canvas : personnage ANIME EN PIED (320 × 460 en coordonnées logiques).
// Style : grands yeux brillants, contours fins colorés, ombres douces (floutées) et lumière globale, cheveux en mèches avec reflet en anneau.
// Couches, de l'arrière vers l'avant : fond, effet (arrière), dos (ailes, cape), cheveux (arrière), jambes, bas,
// chaussures, torse et bras, haut, cou, tête (visage, tatouages, cyberware, yeux, bouche…), cheveux (avant),
// couvre-chef, lunettes, boucles, arme, mains, familier, effet (avant), cadre et bandeau (pseudo + titre).
// t : temps en secondes (animations : respiration, ailes, familier, pluie, glitch, couleurs holographiques…).

export const AV_W = 320;
export const AV_H = 460;

const TAU = Math.PI * 2;
const CX = 160;
const HY = 112;                // centre de la tête
const K = "#1c1424";           // contour sombre (pour les rares traits noirs)

const SKINS = {
  s1: "#fbe6d8", s2: "#f4d2b4", s3: "#efc2a0", s4: "#dfa877", s5: "#c48d60", s6: "#ab7d52", s7: "#86593a", s8: "#553624",
  pale: "#e2e6ea", chrome: "chrome", holo: "holo", synth: "#7ab4ff", green: "#8fcf6a", red: "#d04a4c", gold: "goldskin"
};
// Formes de visage (d'après les 8 morphologies classiques), adaptées au style anime.
// [demi-largeur aux pommettes, demi-hauteur, largeur du front, hauteur des pommettes,
//  largeur de la mâchoire, hauteur de la mâchoire, largeur du menton, souplesse mâchoire, souplesse menton]
// Les largeurs sont des fractions de la demi-largeur, les hauteurs des fractions de la demi-hauteur.
const FACE_SHAPES = {
  oval:     [40, 46, 0.86, 0.02, 0.70, 0.55, 0.26, 1, 1],       // ovale : pommettes les plus larges, menton doux
  long:     [36, 50, 0.90, 0.02, 0.78, 0.58, 0.30, 1, 1],       // oblong : comme l'ovale, mais plus long
  square:   [39, 46, 0.93, 0.00, 0.86, 0.60, 0.42, 0.55, 0.7],  // carré : mâchoire aussi large que le front, angles marqués
  rect:     [38, 50, 0.95, 0.00, 0.91, 0.62, 0.46, 0.45, 0.6],  // rectangle : carré allongé
  round:    [41, 45, 0.86, 0.05, 0.76, 0.52, 0.34, 1, 1],       // rond : joues pleines, tout en courbes
  triangle: [39, 47, 0.80, 0.08, 0.88, 0.60, 0.40, 0.65, 0.8],  // triangle : front plus étroit que la mâchoire
  sharp:    [40, 47, 0.95, 0.00, 0.62, 0.55, 0.20, 1, 1],       // triangle inversé (cœur) : front large, menton fin
  diamond:  [40, 47, 0.78, 0.06, 0.64, 0.56, 0.22, 0.85, 1]     // diamant : pommettes larges, front et menton plus étroits
};
const FACES = Object.fromEntries(Object.entries(FACE_SHAPES).map(([k, v]) => [k, [v[0], v[1]]]));

/* ---------- Couleurs ---------- */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const isHex = (c) => typeof c === "string" && c[0] === "#";
function shade(c, amt) {
  if (!isHex(c)) return amt < 0 ? "rgba(20,10,40,0.35)" : "rgba(255,255,255,0.35)";
  const [r, g, b] = hexToRgb(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(c, a) {
  if (!isHex(c)) return `rgba(255,255,255,${a})`;
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}
// Contour coloré façon anime : la couleur de base, très assombrie
const lineOf = (c) => (isHex(c) ? shade(c, -0.6) : "#2a2638");

function paint(ctx, c, t, x0 = 0, y0 = 0, x1 = AV_W, y1 = AV_H) {
  if (c === "holo") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const h = (t * 60) % 360;
    g.addColorStop(0, `hsl(${h},100%,70%)`);
    g.addColorStop(0.5, `hsl(${(h + 120) % 360},100%,72%)`);
    g.addColorStop(1, `hsl(${(h + 240) % 360},100%,70%)`);
    return g;
  }
  if (c === "chrome") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#f8f8ff"); g.addColorStop(0.35, "#8a8f9e"); g.addColorStop(0.55, "#e8ecf4"); g.addColorStop(1, "#4a4f5e");
    return g;
  }
  if (c === "void") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#05000a"); g.addColorStop(0.6, "#3a0f5a"); g.addColorStop(1, "#05000a");
    return g;
  }
  if (c === "goldskin") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#fff0a0"); g.addColorStop(0.45, "#d4af37"); g.addColorStop(1, "#8a6a18");
    return g;
  }
  return c;
}
const flat = (c, t = 0) => (c === "holo" ? `hsl(${(t * 60) % 360},100%,70%)` : c === "chrome" ? "#b8bcc8" : c === "void" ? "#2a0a45" : c === "goldskin" ? "#d4af37" : c);
// Couleur d'accent toujours « affichable » (pour les néons)
const acc = (look, t) => { const a = flat(look.accentColor, t); return isHex(a) || a.startsWith("hsl") ? a : "#ff2a6d"; };

/* ---------- Petits outils ---------- */

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
// Remplit le chemin courant et trace son contour (couleur dérivée de la base)
function fillLine(ctx, fill, base, lw = 1.8) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = lineOf(base);
  ctx.stroke();
}
// Pour compatibilité avec les fonds et cadres repris de la v1
function fillStroke(ctx, fill, lw = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = K;
  ctx.stroke();
}
// Pièce complète : forme + ombrage en aplat (dans la forme) + contour
function part(ctx, pathFn, base, t, shadowFn, box) {
  pathFn();
  ctx.fillStyle = paint(ctx, base, t, ...(box || [0, 0, AV_W, AV_H]));
  ctx.fill();
  ctx.save();
  pathFn();
  ctx.clip();
  if (shadowFn) {
    // ombre douce (bord flouté) dans une teinte froide, comme une illustration peinte
    ctx.fillStyle = isHex(base) ? shadeTone(base) : "rgba(30,10,60,0.28)";
    ctx.globalAlpha = 0.9;
    if (SOFT) ctx.filter = "blur(2.2px)";
    shadowFn();
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }
  // lumière globale venant d'en haut à gauche
  ctx.fillStyle = lightGrad(ctx);
  ctx.fillRect(-2000, -2000, 4000, 4000);
  // liseré de lumière le long des bords haut / gauche
  ctx.translate(1.6, 1.8);
  pathFn();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.stroke();
  ctx.restore();
  pathFn();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = lineOf(base);
  ctx.stroke();
}
function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow(ctx) { ctx.shadowBlur = 0; }
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const lerp = (a, b, k) => a + (b - a) * k;
// Flou disponible ? (ombres douces ; sinon ombres nettes)
const SOFT = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
// Teinte d'ombre : assombrie et tirée vers le violet, comme une ombre peinte
function shadeTone(c) {
  const [r, g, b] = hexToRgb(c);
  const m = (v, tint) => Math.round(v * 0.66 + tint * 0.14);
  return `rgb(${m(r, 80)},${m(g, 50)},${m(b, 140)})`;
}
// Ajoute une transparence à une couleur "#rrggbb" ou "rgb(r,g,b)"
function withAlpha(c, a) {
  if (isHex(c)) return rgba(c, a);
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : c;
}
// Lumière globale : claire en haut à gauche, plus sombre en bas à droite
function lightGrad(ctx) {
  const g = ctx.createLinearGradient(CX - 90, 40, CX + 90, 420);
  g.addColorStop(0, "rgba(255,250,240,0.16)");
  g.addColorStop(0.4, "rgba(255,255,255,0)");
  g.addColorStop(0.68, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(40,15,70,0.24)");
  return g;
}

/* =====================================================================
   Géométrie : tête et corps
===================================================================== */

function dims(look) {
  const [w, h] = FACES[look.face] || FACES.oval;
  return { w, h, top: HY - h, chin: HY + h, eyeY: HY + 12, mouthY: HY + h * 0.66 };
}

function body(look) {
  const b = look.body === "b";
  return {
    sh: b ? 41 : 34, waist: b ? 29 : 23, hip: b ? 31 : 33,
    shoulderY: 172, waistY: 240, hipY: 268, footY: 400
  };
}
// Points d'un bras (s = -1 à gauche de l'écran, +1 à droite) : épaule, coude, poignet
function armPts(look, s) {
  const B = body(look);
  if (s > 0) return [[CX + (B.sh - 6), B.shoulderY + 6], [CX + B.sh + 19, 214], [CX + B.waist + 7, 245]];
  return [[CX - (B.sh - 6), B.shoulderY + 6], [CX - (B.sh + 9), 222], [CX - (B.sh + 8), 268]];
}
// Points d'une jambe : hanche, genou, cheville
function legPts(look, s) {
  const B = body(look);
  return [[CX + s * (B.hip * 0.47), B.hipY - 4], [CX + s * (B.hip * 0.4), 332], [CX + s * (B.hip * 0.42), 390]];
}
// Bande le long d'une ligne brisée à 3 points, de t0 à t1 (0 = début, 1 = fin), largeurs w0 → w1 (+ extra)
function strip(pts, t0, t1, w0, w1, extra = 0) {
  const at = (t) => {
    const seg = t < 0.5 ? 0 : 1;
    const k = seg === 0 ? t / 0.5 : (t - 0.5) / 0.5;
    const [ax, ay] = pts[seg];
    const [bx, by] = pts[seg + 1];
    return [lerp(ax, bx, k), lerp(ay, by, k), bx - ax, by - ay];
  };
  const left = [];
  const right = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = lerp(t0, t1, i / n);
    const [x, y, dx, dy] = at(t);
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const w = (lerp(w0, w1, t) + extra) / 2;
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
  }
  return [...left, ...right.reverse()];
}
const armStrip = (look, s, t0, t1, extra = 0) => strip(armPts(look, s), t0, t1, 13, 8.5, extra);
const legStrip = (look, s, t0, t1, extra = 0) => strip(legPts(look, s), t0, t1, 23, 11.5, extra);
const handPos = (look, s) => { const p = armPts(look, s)[2]; return s > 0 ? [p[0] - 1, p[1] + 4] : [p[0], p[1] + 7]; };

// Silhouette du torse jusqu'à la hauteur y (encolure arrondie en haut)
function torsoPath(ctx, look, yEnd, flare = 0, neck = 14) {
  const B = body(look);
  const sy = B.shoulderY;
  ctx.beginPath();
  ctx.moveTo(CX - neck, sy - 8);
  ctx.quadraticCurveTo(CX - B.sh + 4, sy - 6, CX - B.sh, sy + 8);
  ctx.quadraticCurveTo(CX - B.sh + 2, 210, CX - B.waist, B.waistY);
  ctx.quadraticCurveTo(CX - B.hip - flare * 0.4, (B.waistY + yEnd) / 2, CX - B.hip - flare, yEnd);
  ctx.lineTo(CX + B.hip + flare, yEnd);
  ctx.quadraticCurveTo(CX + B.hip + flare * 0.4, (B.waistY + yEnd) / 2, CX + B.waist, B.waistY);
  ctx.quadraticCurveTo(CX + B.sh - 2, 210, CX + B.sh, sy + 8);
  ctx.quadraticCurveTo(CX + B.sh - 4, sy - 6, CX + neck, sy - 8);
  ctx.closePath();
}

/* =====================================================================
   Corps (peau) : jambes, torse, bras, mains, cou
===================================================================== */

function drawLegsSkin(ctx, look, t, skin) {
  for (const s of [-1, 1]) part(ctx, () => poly(ctx, legStrip(look, s, 0, 1)), skin, t, () => { ctx.fillRect(CX + s * 4 - (s < 0 ? 8 : 0), 0, 8, AV_H); });
}

function drawTorsoSkin(ctx, look, t, skin) {
  for (const s of [-1, 1]) part(ctx, () => poly(ctx, armStrip(look, s, 0, 1)), skin, t, null);
  part(ctx, () => torsoPath(ctx, look, body(look).hipY + 4), skin, t, () => { ctx.fillRect(CX + 8, 0, 60, AV_H); });
}

function drawNeckSkin(ctx, look, t, skin) {
  const { chin } = dims(look);
  part(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(CX - 9, chin - 16);
    ctx.lineTo(CX - 10.5, 172);
    ctx.quadraticCurveTo(CX, 179, CX + 10.5, 172);
    ctx.lineTo(CX + 9, chin - 16);
    ctx.closePath();
  }, skin, t, () => { ctx.beginPath(); ctx.ellipse(CX, chin - 1, 15, 9, 0, 0, TAU); ctx.fill(); });
}
function drawHands(ctx, look, t, skin) {
  for (const s of [-1, 1]) {
    if (look.weapon === "mantis") continue;
    const [x, y] = handPos(look, s);
    const rot = s > 0 ? 0.95 : -0.12;
    part(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 7, rot, 0, TAU);
      ctx.moveTo(x + (s > 0 ? -2 : 5), y - 3);
      ctx.ellipse(x + (s > 0 ? -4 : 4.5), y - 2.5, 2.2, 3.6, s > 0 ? 0.3 : -0.5, 0, TAU);
    }, skin, t, null);
  }
}
/* =====================================================================
   Visage anime
===================================================================== */

// Points de contrôle du contour du visage (spline fermée) : du haut du crâne, côté droit, menton, côté gauche
function facePts(look) {
  const S = FACE_SHAPES[look.face] || FACE_SHAPES.oval;
  const [w, h, fw, cy, jw, jy, cw, sj, sc] = S;
  // le crâne reste arrondi ; seule la largeur des tempes (le front) change vraiment
  const half = [
    [w * (0.2 + 0.44 * fw), -h * 0.92, 1],
    [w * fw, -h * 0.5, 1],
    [w, h * cy, 1],
    [w * jw, h * jy, sj],
    [w * cw, h * 0.93, sc]
  ];
  return [
    [0, -h, 1],
    ...half,
    [0, h + 1, 1],
    ...half.slice().reverse().map(([x, y, k]) => [-x, y, k])
  ].map(([x, y, k]) => [CX + x, HY + y, k]);
}
// Pour chaque segment : [p1, c1, c2, p2] (courbe de Bézier)
function faceSegs(look) {
  const pts = facePts(look);
  const n = pts.length;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    segs.push([
      [p1[0], p1[1]],
      [p1[0] + ((p2[0] - p0[0]) * p1[2]) / 6, p1[1] + ((p2[1] - p0[1]) * p1[2]) / 6],
      [p2[0] - ((p3[0] - p1[0]) * p2[2]) / 6, p2[1] - ((p3[1] - p1[1]) * p2[2]) / 6],
      [p2[0], p2[1]]
    ]);
  }
  return segs;
}

function headPath(ctx, look) {
  const segs = faceSegs(look);
  ctx.beginPath();
  ctx.moveTo(segs[0][0][0], segs[0][0][1]);
  for (const [, c1, c2, p2] of segs) ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
  ctx.closePath();
}

// Contour du visage échantillonné (côté droit, du haut vers le menton), mis en cache par forme
const outlineCache = {};
function faceRight(look) {
  const key = FACE_SHAPES[look.face] ? look.face : "oval";
  if (outlineCache[key]) return outlineCache[key];
  const segs = faceSegs(look).slice(0, 6);   // du haut du crâne jusqu'au bas du menton
  const out = [];
  for (const [p1, c1, c2, p2] of segs) {
    for (let k = 0; k < 10; k++) {
      const u = k / 10;
      const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
    }
  }
  const last = segs[segs.length - 1][3];
  out.push([last[0], last[1]]);
  return (outlineCache[key] = out);
}
// Demi-largeur du visage à la hauteur y (0 au-dessus du crâne ; largeur du menton en dessous)
function faceHalfW(look, y) {
  const pts = faceRight(look);
  if (y <= pts[0][1]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return Math.max(0, lerp(x0, x1, k) - CX);
    }
  }
  return 0;
}
function drawEarsSkin(ctx, look, t, skin) {
  const { w } = dims(look);
  for (const s of [-1, 1]) {
    part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX + s * (w - 1.5), HY + 9, 4.8, 8.5, s * 0.2, 0, TAU); }, skin, t, null);
  }
}

function drawHead(ctx, look, t, skin) {
  const { w, h, top, eyeY, chin } = dims(look);
  part(ctx, () => headPath(ctx, look), skin, t, () => {
    // ombre portée de la frange sur le front et côté droit de la mâchoire
    ctx.beginPath(); ctx.ellipse(CX, top + h * 0.6, w * 1.2, h * 0.3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(CX + w * 1.05, HY + h * 0.35, w * 0.3, h * 0.65, -0.3, 0, TAU); ctx.fill();
  }, [CX - w, top, CX + w, chin]);
  if (look.skin === "holo") {
    ctx.save(); headPath(ctx, look); ctx.clip();
    ctx.fillStyle = "rgba(0,240,255,0.15)";
    for (let y = top; y < HY + h; y += 4) ctx.fillRect(CX - w, y + ((t * 20) % 4), 2 * w, 1);
    ctx.restore();
  }
  // joues : rose diffus + petits traits obliques (le « blush » des animés)
  for (const s of [-1, 1]) {
    const bx = CX + s * 22;
    const by = eyeY + 16;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, 11);
    g.addColorStop(0, "rgba(255,105,130,0.26)");
    g.addColorStop(1, "rgba(255,105,130,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(bx, by, 11, 6, 0, 0, TAU); ctx.fill();
  }
  // nez : un simple petit trait et un reflet
  const sk = flat(skin, t);
  ctx.strokeStyle = isHex(sk) ? shade(sk, -0.38) : "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(CX + 1.2, eyeY + 15.5); ctx.lineTo(CX - 0.4, eyeY + 18.5); ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(CX - 1.6, eyeY + 14, 1, 0, TAU); ctx.fill();
}
const EYE = {
  normal: [8.5, 10, 0, 0], almond: [9.5, 8, -1.5, 0.05], round: [8.5, 11, 0, 0], sleepy: [9, 9.5, 0, 0.42],
  sharp: [9.5, 7.5, -3, 0.08], anime: [9.5, 11.5, 0, 0], cat: [9.5, 9, -3, 0], wink: [8.5, 10, 0, 0],
  glow: [8.5, 10, 0, 0], spiral: [8.5, 10, 0, 0], hearts: [8.5, 10.5, 0, 0], closed: [8.5, 10, 0, 0]
};

function drawEyes(ctx, look, t) {
  const { eyeY } = dims(look);
  const ec = flat(look.eyeColor, t);
  const base = isHex(ec) ? ec : "#5aa9ff";
  const blink = Math.sin(t * 1.3) > 0.985;
  const lash = "#2a1420";
  const [rx, ry, tilt, lid] = EYE[look.eyes] || EYE.normal;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of [-1, 1]) {
    const x = CX + s * 16;
    const y = eyeY + 2;
    // coin intérieur, coin extérieur et point de contrôle de la paupière
    const ix = x - s * rx, iy = y - ry * 0.05;
    const ox = x + s * rx * 1.04, oy = y - ry * 0.32 + tilt;
    const cx = x - s * rx * 0.05, cy = y - ry * (1.32 - lid * 1.7);
    const Q = (u) => [(1 - u) ** 2 * ix + 2 * u * (1 - u) * cx + u * u * ox, (1 - u) ** 2 * iy + 2 * u * (1 - u) * cy + u * u * oy];
    const closed = look.eyes === "closed" || (look.eyes === "wink" && s === 1) || blink;
    if (closed) {
      ctx.strokeStyle = lash; ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (look.eyes === "closed") { ctx.moveTo(ix, y + 2); ctx.quadraticCurveTo(x, y - ry * 0.75, ox, y + 1); }
      else { ctx.moveTo(ix, y - 1); ctx.quadraticCurveTo(x, y + ry * 0.45, ox, y - 2); ctx.lineTo(ox + s * 3, y - 4); }
      ctx.stroke();
      continue;
    }
    const sclera = () => {
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.quadraticCurveTo(cx, cy, ox, oy);
      ctx.bezierCurveTo(ox + s * 0.5, oy + ry * 0.7, x + s * rx * 0.55, y + ry * 1.0, x, y + ry * 0.97);
      ctx.bezierCurveTo(x - s * rx * 0.6, y + ry * 0.94, ix - s * 0.5, iy + ry * 0.55, ix, iy);
      ctx.closePath();
    };
    ctx.save();
    sclera();
    if (look.eyes === "glow") {
      glow(ctx, ec, 14); ctx.fillStyle = ec; ctx.fill(); noGlow(ctx);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 3.2, 4.4, -0.4, 0, TAU); ctx.fill();
    } else {
      const sg = ctx.createLinearGradient(0, y - ry, 0, y + ry * 0.4);
      sg.addColorStop(0, "#e2e0ee"); sg.addColorStop(1, "#ffffff");
      ctx.fillStyle = sg; ctx.fill();
      ctx.clip();
      const px = x + s * 0.8;
      const py = y + ry * 0.18;
      const irx = rx * 0.74;
      const iry = ry * 0.86;
      if (look.eyes === "hearts") {
        ctx.fillStyle = "#ff3a7a";
        ctx.beginPath(); ctx.moveTo(px, py + 9); ctx.bezierCurveTo(px - 14, py - 2, px - 6, py - 13, px, py - 5); ctx.bezierCurveTo(px + 6, py - 13, px + 14, py - 2, px, py + 9); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px - 4, py - 5, 2.2, 0, TAU); ctx.fill();
      } else if (look.eyes === "spiral") {
        ctx.strokeStyle = shade(base, -0.3); ctx.lineWidth = 1.7; ctx.beginPath();
        for (let k = 0; k < 48; k++) { const an = k * 0.45 + t * 4; const rr = k * 0.2; ctx.lineTo(px + Math.cos(an) * rr, py + Math.sin(an) * rr); }
        ctx.stroke();
      } else {
        // iris : dégradé du sombre (haut) au clair (bas), cercle foncé, éclat en bas et stries
        const g = ctx.createLinearGradient(0, py - iry, 0, py + iry);
        g.addColorStop(0, shade(base, -0.72)); g.addColorStop(0.38, shade(base, -0.22));
        g.addColorStop(0.72, base); g.addColorStop(1, shade(base, 0.55));
        ctx.fillStyle = look.eyeColor === "holo" ? paint(ctx, "holo", t, px - irx, py, px + irx, py) : g;
        ctx.beginPath(); ctx.ellipse(px, py, irx, iry, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = withAlpha(shade(base, 0.75), 0.55);
        ctx.beginPath(); ctx.ellipse(px, py + iry * 0.48, irx * 0.66, iry * 0.34, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.7;
        for (let k = 0; k < 7; k++) { const an = 0.25 * Math.PI + (k / 6) * 0.5 * Math.PI; ctx.beginPath(); ctx.moveTo(px + Math.cos(an) * irx * 0.4, py + Math.sin(an) * iry * 0.4); ctx.lineTo(px + Math.cos(an) * irx * 0.92, py + Math.sin(an) * iry * 0.92); ctx.stroke(); }
        ctx.fillStyle = shade(base, -0.85);
        if (look.eyes === "cat") { ctx.beginPath(); ctx.ellipse(px, py - 1, 1.9, iry * 0.75, 0, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(px, py - iry * 0.06, irx * 0.42, iry * 0.46, 0, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = shade(base, -0.75); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.ellipse(px, py, irx, iry, 0, 0, TAU); ctx.stroke();
        // reflets (lumière venant d'en haut à gauche)
        const big = look.eyes === "anime" ? 1.25 : 1;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.ellipse(px - irx * 0.32, py - iry * 0.38, 2.2 * big, 3 * big, -0.45, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(px + irx * 0.4, py + iry * 0.36, 1.1 * big, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(px + irx * 0.18, py - iry * 0.62, 1.1, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      }
      // ombre de la paupière supérieure sur l'œil
      ctx.fillStyle = "rgba(70,30,90,0.3)";
      ctx.beginPath(); ctx.ellipse(x, y - ry * 0.9, rx * 1.3, ry * 0.45, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // cils supérieurs : bande effilée, plus épaisse vers l'extérieur, avec un petit battement
    const thick = look.eyes === "anime" ? 1.1 : look.eyes === "sleepy" ? 0.7 : 0.85;
    const topEdge = [];
    const botEdge = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const [qx, qy] = Q(u);
      const th = (0.8 + 3.4 * u ** 1.3) * thick;
      topEdge.push([qx, qy - th]);
      botEdge.push([qx, qy + 0.7]);
    }
    ctx.fillStyle = lash;
    ctx.beginPath();
    topEdge.forEach(([px2, py2], i) => (i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2)));
    ctx.lineTo(ox + s * 3.5, oy + 1.2);
    ctx.lineTo(ox + s * 1, oy + 2.6);
    for (let i = botEdge.length - 1; i >= 0; i--) ctx.lineTo(botEdge[i][0], botEdge[i][1]);
    ctx.closePath(); ctx.fill();
    const [ax, ay] = Q(0.72);
    const [bx, by] = Q(0.92);
    poly(ctx, [[ax, ay - 2.4], [bx, by - 2.8], [ox + s * 4.5, oy - 4.5]]); ctx.fill();
    // pli de la paupière et cils inférieurs
    ctx.strokeStyle = "rgba(90,40,60,0.45)"; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 4; i <= 14; i++) { const [qx, qy] = Q(i / 14); const yy = qy - 4.6 * thick - 1.5; i === 4 ? ctx.moveTo(qx, yy) : ctx.lineTo(qx, yy); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(42,20,32,0.8)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(ox - s * 0.5, oy + 3.5); ctx.quadraticCurveTo(x + s * rx * 0.78, y + ry * 0.92, x + s * rx * 0.05, y + ry * 1.02); ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x - s * rx * 0.35, y + ry * 0.98); ctx.lineTo(x - s * rx * 0.6, y + ry * 0.88); ctx.stroke();
  }
  ctx.lineCap = "butt"; ctx.lineJoin = "round";
}
function drawBrows(ctx, look, t, hc) {
  if (look.brows === "none") return;
  const { eyeY } = dims(look);
  const col = isHex(flat(hc, t)) ? shade(flat(hc, t), -0.35) : "#3a2a3a";
  for (const s of [-1, 1]) {
    const x = CX + s * 16;
    const y = eyeY - 13;
    ctx.strokeStyle = col; ctx.lineCap = "round";
    ctx.lineWidth = look.brows === "thick" ? 3.4 : look.brows === "thin" ? 1.1 : 1.8;
    ctx.beginPath();
    if (look.brows === "angry") { ctx.moveTo(x + s * 10, y - 3); ctx.quadraticCurveTo(x, y - 1, x - s * 9, y + 4); }
    else if (look.brows === "raised") { ctx.moveTo(x - s * 7, y + 1); ctx.quadraticCurveTo(x, y - 7, x + s * 8, y - 1); }
    else { ctx.moveTo(x - s * 7, y + 1.5); ctx.quadraticCurveTo(x + s * 2, y - 3, x + s * 8.5, y + 1); }
    ctx.stroke();
    if (look.brows === "slit" && s === 1) { ctx.strokeStyle = isHex(SKINS[look.skin]) ? SKINS[look.skin] : "#efc2a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y - 5); ctx.lineTo(x + 1, y + 4); ctx.stroke(); }
    ctx.lineCap = "butt";
  }
}
function mouthShapes(ctx, look, t) {
  const { mouthY } = dims(look);
  const y = mouthY;
  const lc = "#6a2a3a";
  ctx.strokeStyle = lc; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  switch (look.mouth) {
    case "smile": ctx.beginPath(); ctx.arc(CX, y - 5, 7, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); break;
    case "grin":
      ctx.beginPath(); ctx.moveTo(CX - 9, y - 2); ctx.quadraticCurveTo(CX, y + 9, CX + 9, y - 2); ctx.closePath();
      ctx.fillStyle = "#8a2a3a"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff8aa0"; ctx.beginPath(); ctx.ellipse(CX, y + 3, 4, 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(CX - 6, y - 1.5, 12, 2.5);
      break;
    case "smirk": ctx.beginPath(); ctx.moveTo(CX - 6, y + 1); ctx.quadraticCurveTo(CX + 2, y + 3, CX + 8, y - 3); ctx.stroke(); break;
    case "frown": ctx.beginPath(); ctx.arc(CX, y + 6, 6, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); break;
    case "open": ctx.beginPath(); ctx.ellipse(CX, y + 1, 4, 5.5, 0, 0, TAU); ctx.fillStyle = "#8a2a3a"; ctx.fill(); ctx.stroke(); break;
    case "tongue":
      ctx.beginPath(); ctx.arc(CX, y - 4, 7, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#ff7a90"; ctx.beginPath(); ctx.ellipse(CX + 2, y + 4, 3.5, 4, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
      break;
    case "fangs":
      ctx.beginPath(); ctx.arc(CX, y - 5, 8, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#fff"; for (const s of [-1, 1]) { poly(ctx, [[CX + s * 5, y + 1], [CX + s * 2, y + 1.5], [CX + s * 4, y + 6]]); ctx.fill(); }
      break;
    case "teeth":
      ctx.beginPath(); ctx.rect(CX - 8, y - 2, 16, 6); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(CX - 8, y + 1); ctx.lineTo(CX + 8, y + 1); ctx.stroke();
      break;
    case "cyber":
      ctx.beginPath(); ctx.rect(CX - 9, y - 3, 18, 7); ctx.fillStyle = paint(ctx, "chrome", t, CX - 9, y, CX + 9, y); ctx.fill(); ctx.strokeStyle = "#3a3f55"; ctx.stroke();
      ctx.fillStyle = acc(look, t); for (let i = 0; i < 4; i++) ctx.fillRect(CX - 7 + i * 4.5, y, 2, 1.5);
      break;
    case "lipstick":
      ctx.beginPath(); ctx.moveTo(CX - 7, y); ctx.quadraticCurveTo(CX - 3, y - 4, CX, y - 1.5); ctx.quadraticCurveTo(CX + 3, y - 4, CX + 7, y); ctx.quadraticCurveTo(CX, y + 5, CX - 7, y);
      ctx.fillStyle = "#d81a3e"; ctx.fill(); ctx.strokeStyle = "#8a0a24"; ctx.stroke();
      break;
    default: ctx.beginPath(); ctx.moveTo(CX - 5, y); ctx.lineTo(CX + 5, y); ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawMouth(ctx, look, t) {
  const { mouthY } = dims(look);
  ctx.save();
  ctx.translate(CX, mouthY);
  ctx.scale(0.78, 0.78);
  ctx.translate(-CX, -mouthY);
  mouthShapes(ctx, look, t);
  ctx.restore();
}

function drawBeard(ctx, look, t, hc) {
  if (look.beard === "none") return;
  const { w, mouthY, chin } = dims(look);
  const base = flat(hc, t);
  const fill = paint(ctx, hc, t, CX - w, mouthY, CX + w, chin);
  switch (look.beard) {
    case "stubble":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "rgba(60,40,40,0.18)";
      ctx.beginPath(); ctx.ellipse(CX, chin - 6, w * 0.75, 18, 0, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    case "goatee":
      part(ctx, () => poly(ctx, [[CX - 6, mouthY + 6], [CX + 6, mouthY + 6], [CX + 4, chin + 6], [CX, chin + 9], [CX - 4, chin + 6]]), base, t, null);
      break;
    case "mustache":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX, mouthY - 6); ctx.quadraticCurveTo(CX - 9, mouthY - 9, CX - 14, mouthY - 1); ctx.quadraticCurveTo(CX - 6, mouthY - 3, CX, mouthY - 2.5); ctx.quadraticCurveTo(CX + 6, mouthY - 3, CX + 14, mouthY - 1); ctx.quadraticCurveTo(CX + 9, mouthY - 9, CX, mouthY - 6); }, base, t, null);
      break;
    default: {
      const neon = look.beard === "neon";
      if (neon) glow(ctx, acc(look, t), 12);
      part(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(CX - w + 3, HY + 6);
        ctx.quadraticCurveTo(CX - w + 2, chin + 4, CX, chin + (look.beard === "braided" ? 8 : 16));
        ctx.quadraticCurveTo(CX + w - 2, chin + 4, CX + w - 3, HY + 6);
        ctx.lineTo(CX + w - 9, HY + 10);
        ctx.quadraticCurveTo(CX + 14, mouthY - 6, CX, mouthY - 5);
        ctx.quadraticCurveTo(CX - 14, mouthY - 6, CX - w + 9, HY + 10);
        ctx.closePath();
      }, neon ? look.accentColor : base, t, null);
      noGlow(ctx);
      if (!neon) void fill;
      ctx.fillStyle = "#6a2a3a"; ctx.beginPath(); ctx.ellipse(CX, mouthY + 1, 6, 3, 0, 0, TAU); ctx.fill();
      if (look.beard === "braided") {
        for (let i = 0; i < 4; i++) part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, chin + 12 + i * 8, 5, 4.5, 0, 0, TAU); }, base, t, null);
        ctx.fillStyle = "#e8c547"; ctx.fillRect(CX - 5, chin + 40, 10, 4);
      }
    }
  }
}

/* =====================================================================
   Cheveux en mèches
===================================================================== */

// Une mèche : de la racine (x0, y0) à la pointe (x1, y1), largeur w à la racine, courbure bend
function lockPath(ctx, x0, y0, x1, y1, w, bend = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const mx = (x0 + x1) / 2 + nx * bend;
  const my = (y0 + y1) / 2 + ny * bend;
  ctx.moveTo(x0 - nx * w / 2, y0 - ny * w / 2);
  ctx.quadraticCurveTo(mx - nx * w * 0.35, my - ny * w * 0.35, x1, y1);
  ctx.quadraticCurveTo(mx + nx * w * 0.35, my + ny * w * 0.35, x0 + nx * w / 2, y0 + ny * w / 2);
}

function hairKit(ctx, look, t) {
  const { h, top, eyeY } = dims(look);
  const hw = (y) => faceHalfW(look, y);
  // largeur de référence : celle des tempes (toutes les coiffures s'y adaptent)
  const w = Math.max(hw(HY - 10), hw(HY + 4)) + 1;
  const base = look.hairColor;
  const fb = flat(base, t);
  const fill = () => paint(ctx, base, t, CX - w, top - 30, CX + w, HY + 60);
  const lineC = lineOf(fb);
  const shadowC = isHex(fb) ? shadeTone(fb) : "rgba(20,10,40,0.3)";
  const grad = ctx.createLinearGradient(0, top - 30, 0, HY + 150);
  grad.addColorStop(0, "rgba(255,255,255,0.2)");
  grad.addColorStop(0.3, "rgba(255,255,255,0)");
  grad.addColorStop(0.7, "rgba(20,0,40,0.12)");
  grad.addColorStop(1, "rgba(20,0,40,0.32)");
  const draw = (pathFn, withShade = true) => {
    ctx.beginPath(); pathFn();
    ctx.fillStyle = fill(); ctx.fill();
    ctx.save(); ctx.beginPath(); pathFn(); ctx.clip();
    ctx.fillStyle = grad; ctx.fillRect(-500, -500, 1400, 1400);
    if (withShade) {
      ctx.fillStyle = shadowC; ctx.globalAlpha = 0.85;
      if (SOFT) ctx.filter = "blur(4px)";
      ctx.beginPath(); ctx.ellipse(CX + w * 1.05, HY + 30, w * 0.5, 150, 0, 0, TAU); ctx.fill();
      ctx.filter = "none"; ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.beginPath(); pathFn();
    ctx.strokeStyle = lineC; ctx.lineWidth = 1.25; ctx.stroke();
  };
  // fines mèches dessinées à l'intérieur d'une mèche (texture des cheveux)
  const strand = (x0, y0, x1, y1, bend = 0) => {
    ctx.strokeStyle = lineC; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x0, y0 + 4); ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, lerp(x0, x1, 0.82), lerp(y0, y1, 0.82)); ctx.stroke();
    ctx.globalAlpha = 1;
  };
  // calotte : le contour du crâne, élargi vers l'extérieur (plus de volume en haut), jusqu'aux tempes
  const cap = (lift = 0, side = 6) => draw(() => {
    const yEnd = HY + side + 8;
    const right = faceRight(look).filter(([, y]) => y <= yEnd);
    const vol = (x, y) => {
      const k = Math.max(0, Math.min(1, (HY - y) / h));
      const v = 4 + (2.5 + 0.8 * lift) * k ** 1.2;
      const dx = x - CX, dy = y - (HY + 6);
      const l = Math.hypot(dx, dy) || 1;
      return [x + (dx / l) * v * 1.25, y + (dy / l) * v];
    };
    const outR = right.map(([x, y]) => vol(x, y));
    const outL = right.slice().reverse().map(([x, y]) => vol(2 * CX - x, y));
    // côté gauche (du bas vers le haut), puis côté droit (du haut vers le bas)
    outL.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    outR.forEach(([x, y]) => ctx.lineTo(x, y));
    // ligne des cheveux sur le front
    const hy = HY - 4;
    ctx.lineTo(CX + hw(hy) - 3, hy);
    ctx.quadraticCurveTo(CX, top + 6, CX - hw(hy) + 3, hy);
    ctx.closePath();
  });
  // frange : beaucoup de mèches pointues qui se chevauchent, les plus centrales par-dessus
  const bangs = (n, tipY, opts = {}) => {
    const span = opts.span || Math.max(hw(HY - 22), w * 0.8) - 1;
    const N = n + 1;
    const mid = (N - 1) / 2;
    const order = [...Array(N).keys()].sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));
    for (const i of order) {
      const k = N === 1 ? 0.5 : i / (N - 1);
      const rx = CX - span + k * span * 2;
      const ry = top + 6 + Math.abs(k - 0.5) * 12;
      const tipX = rx + (k - 0.5) * (opts.splay ?? 10) + (opts.sweep || 0) + (hash(i + 3) - 0.5) * 4;
      const tipYi = tipY + (i % 3 === 1 ? -9 : i % 3 === 2 ? -3 : 3) - Math.abs(k - 0.5) * 8 + (opts.jag ? hash(i) * opts.jag : 0);
      const bend = (k - 0.5) * -10 + (hash(i + 7) - 0.5) * 6;
      draw(() => lockPath(ctx, rx, ry, tipX, tipYi, ((span * 3.2) / N) * (0.85 + hash(i + 11) * 0.4), bend * 1.4), false);
      strand(rx, ry, tipX, tipYi, bend * 0.5);
    }
  };
  const sidelocks = (len, width = 10, out = 2) => {
    for (const s of [-1, 1]) {
      const y0 = HY - 18;
      const y1 = HY + len + 4;
      const x0 = hw(y0) - 2;
      const x1 = Math.max(hw(Math.min(y1, HY + h - 10)), w * 0.55) + out + 1;
      draw(() => lockPath(ctx, CX + s * x0, y0, CX + s * x1, y1, width + 5, s * -4), false);
      strand(CX + s * (x0 - 1), y0 + 2, CX + s * (x1 - 1), y1 - 4, s * -2);
    }
  };
  // reflets : quelques arcs brillants effilés qui suivent l'arrondi du crâne (pas un bandeau continu)
  const shine = () => {
    const c0 = CX - 2;
    const c1 = top + 38;
    const R = w * 0.86;
    const hl = isHex(fb) ? shade(fb, 0.55) : "#ffffff";
    ctx.fillStyle = hl;
    ctx.globalAlpha = 0.78;
    for (const [a0, a1, th] of [[1.2, 1.34, 4], [1.39, 1.58, 5.2], [1.63, 1.75, 3.8]]) {
      ctx.beginPath();
      const N = 10;
      for (let i = 0; i <= N; i++) { const a = lerp(a0, a1, i / N) * Math.PI; ctx.lineTo(c0 + Math.cos(a) * R, c1 + Math.sin(a) * R * 0.82); }
      for (let i = N; i >= 0; i--) {
        const a = lerp(a0, a1, i / N) * Math.PI;
        const r = R - th * Math.sin((i / N) * Math.PI) - (i % 2 ? 1.2 : 0);
        ctx.lineTo(c0 + Math.cos(a) * r, c1 + Math.sin(a) * r * 0.82);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(c0 - R * 0.42, c1 - R * 0.66, 2.6, 1.2, -0.55, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  };
  return { draw, cap, bangs, sidelocks, shine, strand, w, h, top, eyeY, fill, lineC, base };
}
function hairBack(ctx, look, t) {
  const H = hairKit(ctx, look, t);
  const { w, top, draw } = H;
  const big = (bottomY, spread = 14, tips = 7) => draw(() => {
    ctx.moveTo(CX - w - 6, HY - 10);
    ctx.bezierCurveTo(CX - w - 10, top - 30, CX + w + 10, top - 30, CX + w + 6, HY - 10);
    ctx.quadraticCurveTo(CX + w + spread + 6, (HY + bottomY) / 2, CX + w + spread, bottomY);
    for (let i = 1; i < tips; i++) {
      const x = CX + w + spread - (i / tips) * (2 * (w + spread));
      ctx.lineTo(x + (2 * (w + spread)) / tips / 2, bottomY - 14 - hash(i) * 8);
      ctx.lineTo(x, bottomY + (i % 2 ? 4 : 0));
    }
    ctx.lineTo(CX - w - spread, bottomY);
    ctx.quadraticCurveTo(CX - w - spread - 6, (HY + bottomY) / 2, CX - w - 6, HY - 10);
    ctx.closePath();
  });
  const sway = Math.sin(t * 1.6) * 3;
  switch (look.hairBack) {
    case "none": break;
    case "nape": big(HY + 30, 3, 5); break;
    case "wavy":
      // longs ondulés : bords en vagues, pointes arrondies
      draw(() => {
        const yEnd = 262 + sway;
        const edge = (s, y) => CX + s * (w + 8 + (y - HY) * 0.07 + Math.sin((y - HY) / 13 + (s > 0 ? 0 : 1.5)) * 4.5);
        ctx.moveTo(CX - w - 6, HY - 10);
        ctx.bezierCurveTo(CX - w - 10, top - 30, CX + w + 10, top - 30, CX + w + 6, HY - 10);
        for (let y = HY - 6; y <= yEnd; y += 6) ctx.lineTo(edge(1, y), y);
        const xr = edge(1, yEnd);
        const xl = edge(-1, yEnd);
        for (let i = 1; i <= 6; i++) { const x0 = lerp(xr, xl, (i - 1) / 6); const x1 = lerp(xr, xl, i / 6); ctx.quadraticCurveTo((x0 + x1) / 2, yEnd + 9, x1, yEnd + (i % 2 ? -2 : 2)); }
        for (let y = yEnd; y >= HY - 6; y -= 6) ctx.lineTo(edge(-1, y), y);
        ctx.closePath();
      });
      break;
    case "hime":
      // très longs et raides, coupés net (coupe « hime »)
      draw(() => {
        const yEnd = 322 + sway * 0.6;
        ctx.moveTo(CX - w - 6, HY - 10);
        ctx.bezierCurveTo(CX - w - 10, top - 30, CX + w + 10, top - 30, CX + w + 6, HY - 10);
        ctx.quadraticCurveTo(CX + w + 16, HY + 40, CX + w + 15, yEnd);
        for (let i = 1; i <= 8; i++) ctx.lineTo(lerp(CX + w + 15, CX - w - 15, i / 8), yEnd + (i % 2 ? 2.5 : 0));
        ctx.quadraticCurveTo(CX - w - 16, HY + 40, CX - w - 6, HY - 10);
        ctx.closePath();
      });
      ctx.save(); ctx.strokeStyle = H.lineC; ctx.globalAlpha = 0.3; ctx.lineWidth = 0.8;
      for (let i = 1; i < 8; i++) { const x = lerp(CX - w - 12, CX + w + 12, i / 8); ctx.beginPath(); ctx.moveTo(x, HY + 20); ctx.lineTo(x + (i - 4) * 0.4, 314); ctx.stroke(); }
      ctx.restore();
      break;
    case "long": big(252 + sway, 16, 8); break;
    case "bob": big(HY + 46, 6, 6); break;
    case "wild": big(236, 34, 9); break;
    case "afro":
      draw(() => { for (let i = 0; i <= 26; i++) { const an = (i / 26) * TAU; const rr = 70 + (i % 2 ? 6 : 0); const x = CX + Math.cos(an) * rr; const y = HY - 16 + Math.sin(an) * rr * 0.9; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); });
      break;
    case "ponytail":
      draw(() => lockPath(ctx, CX + w - 4, H.top + 14, CX + w + 26 + sway, 236, 30, -26));
      break;
    case "twintails":
      for (const s of [-1, 1]) {
        draw(() => lockPath(ctx, CX + s * (w - 2), H.top + 22, CX + s * (w + 32) + sway * s, 262, 34, s * 24));
        ctx.fillStyle = acc(look, t); ctx.beginPath(); ctx.arc(CX + s * (w - 1), H.top + 22, 5, 0, TAU); ctx.fill();
      }
      break;
    case "braids":
      for (const s of [-1, 1]) for (let k = 0; k < 8; k++) draw(() => { ctx.ellipse(CX + s * (w + 2 - k * 0.6), HY + 12 + k * 13, 8, 9, s * 0.2, 0, TAU); }, false);
      break;
    case "dreads":
      for (let i = 0; i < 10; i++) {
        const x = CX - w - 2 + (i / 9) * (2 * w + 4);
        if (Math.abs(x - CX) < w - 12) continue;
        draw(() => lockPath(ctx, x, HY - 20, x + (x < CX ? -6 : 6) + sway * 0.5, HY + 90 + hash(i) * 30, 9, 3), false);
      }
      draw(() => { ctx.ellipse(CX, HY - 10, w + 6, H.h + 6, 0, Math.PI, 0); ctx.closePath(); }, false);
      break;
    case "sideshave":
      draw(() => lockPath(ctx, CX + w - 2, HY - 30, CX + w + 16 + sway, HY + 96, 30, -10));
      break;
    case "emo":
      big(HY + 56, 4, 6);
      break;
    default: break;
  }
}

function hairFront(ctx, look, t) {
  const H = hairKit(ctx, look, t);
  const { w, top, eyeY, cap, bangs, sidelocks, shine, draw, strand } = H;
  const hw = (y) => faceHalfW(look, y);
  switch (look.hairFront) {
    case "curtain":
      // raie au milieu : deux grandes mèches qui s'écartent vers les tempes
      cap(2, 10);
      for (const s of [-1, 1]) {
        draw(() => lockPath(ctx, CX + s * 3, top + 4, CX + s * (w + 3), eyeY + 4, 30, s * -14), false);
        draw(() => lockPath(ctx, CX + s * 12, top + 8, CX + s * (w - 6), eyeY - 6, 18, s * -8), false);
        strand(CX + s * 4, top + 6, CX + s * (w + 1), eyeY, s * -8);
      }
      sidelocks(30, 10, 4);
      shine();
      return;
    case "hime": {
      // frange droite coupée net + mèches latérales raides jusqu'au menton
      cap(2, 12);
      const yb = eyeY - 11;
      draw(() => {
        ctx.moveTo(CX - w + 1, top + 8);
        ctx.quadraticCurveTo(CX, top - 2, CX + w - 1, top + 8);
        ctx.lineTo(CX + w - 3, yb);
        for (let i = 1; i <= 10; i++) ctx.lineTo(lerp(CX + w - 3, CX - w + 3, i / 10), yb + (i % 2 ? 1.6 : 0));
        ctx.closePath();
      }, false);
      for (let i = 1; i < 8; i++) { const x = lerp(CX - w + 6, CX + w - 6, i / 8); strand(x, top + 10, x, yb + 2, 0); }
      for (const s of [-1, 1]) {
        const x = CX + s * (hw(HY - 14) - 1);
        draw(() => {
          ctx.moveTo(x - 7, HY - 22);
          ctx.lineTo(x + 7, HY - 22);
          ctx.lineTo(x + 6 + s * 2, HY + 40);
          ctx.lineTo(x - 6 + s * 2, HY + 41);
          ctx.closePath();
        }, false);
        strand(x, HY - 20, x + s * 2, HY + 38, 0);
      }
      shine();
      return;
    }
    case "bald":
      ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.ellipse(CX - 12, top + 14, 13, 6, -0.4, 0, TAU); ctx.fill();
      return;
    case "buzz":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = rgba(isHex(flat(H.base, t)) ? flat(H.base, t) : "#333333", 0.7);
      ctx.beginPath(); ctx.ellipse(CX, top + 16, w + 4, H.h * 0.5, 0, Math.PI, 0); ctx.lineTo(CX + w + 4, HY - 12); ctx.lineTo(CX - w - 4, HY - 12); ctx.fill();
      ctx.restore();
      return;
    case "short": cap(2); bangs(6, eyeY - 16, { splay: 8 }); sidelocks(16, 9); shine(); return;
    case "undercut":
      cap(8);
      draw(() => lockPath(ctx, CX + w - 6, top + 4, CX - w - 8, eyeY - 24, 40, -14));
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(CX - w - 1, HY - 16, 5, 22); ctx.fillRect(CX + w - 4, HY - 16, 5, 22);
      shine(); return;
    case "bob": cap(2, 14); bangs(7, eyeY - 10, { splay: 2, jag: 3 }); sidelocks(40, 14, 4); shine(); return;
    case "long": cap(4, 16); bangs(7, eyeY - 8, { splay: 10 }); sidelocks(62, 13, 6); shine(); return;
    case "ponytail": cap(0); bangs(5, eyeY - 14, { splay: 12 }); sidelocks(24, 8); shine(); return;
    case "bun":
      cap(0); bangs(5, eyeY - 16); sidelocks(20, 8);
      draw(() => ctx.ellipse(CX, top - 10, 18, 15, 0, 0, TAU));
      shine(); return;
    case "samurai":
      cap(-2);
      draw(() => ctx.ellipse(CX, top - 10, 9, 13, 0, 0, TAU));
      ctx.fillStyle = acc(look, t); ctx.fillRect(CX - 10, top - 2, 20, 4);
      sidelocks(30, 7, 6); shine(); return;
    case "twintails": cap(0); bangs(7, eyeY - 12, { splay: 6, jag: 4 }); sidelocks(24, 8); shine(); return;
    case "mohawk":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(CX - w, top - 10, 2 * w, H.h * 0.7);
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const an = Math.PI * (1.2 + i * 0.12);
        draw(() => lockPath(ctx, CX + Math.cos(an) * 12, HY - 26 + Math.sin(an) * 30, CX + Math.cos(an) * (H.h + 34), HY - 6 + Math.sin(an) * (H.h + 34), 16, 4));
      }
      return;
    case "spiky":
      for (let i = 0; i < 9; i++) {
        const an = Math.PI * (0.95 + i * 0.14);
        draw(() => lockPath(ctx, CX + Math.cos(an) * w * 0.5, HY - 10 + Math.sin(an) * H.h * 0.5, CX + Math.cos(an) * (w + 30), HY - 6 + Math.sin(an) * (H.h + 30), 26, (i - 4) * 2));
      }
      cap(4); bangs(5, eyeY - 14, { splay: 18, jag: 6 }); shine(); return;
    case "afro": cap(14); bangs(6, top + 34, { splay: 4 }); return;
    case "sideshave":
      cap(6);
      draw(() => lockPath(ctx, CX - w + 8, top + 6, CX + w + 4, eyeY - 6, 46, 10));
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(CX - w - 1, top + 22, 6, 40);
      shine(); return;
    case "emo":
      cap(4, 12);
      draw(() => lockPath(ctx, CX + w - 6, top + 6, CX - 6, eyeY + 18, 50, -16));
      draw(() => lockPath(ctx, CX - w + 4, top + 12, CX - w - 2, HY + 34, 14, 4));
      shine(); return;
    case "dreads": cap(4); bangs(6, eyeY - 18, { splay: 6 }); return;
    case "braids": cap(2, 10); bangs(6, eyeY - 14, { splay: 4 }); shine(); return;
    case "wild": cap(14, 14); bangs(8, eyeY - 6, { splay: 22, jag: 10 }); sidelocks(50, 14, 10); shine(); return;
    default: cap(); bangs(6, eyeY - 16); shine();
  }
}

/* =====================================================================
   Fonds
===================================================================== */

function drawBg(ctx, look, t) {
  const a = look.accentColor;
  const W = AV_W;
  const H = AV_H;
  const grad = (stops) => { const g = ctx.createLinearGradient(0, 0, 0, H); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  switch (look.bg) {
    case "alley": {
      ctx.fillStyle = grad([[0, "#120818"], [1, "#05030a"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 40, 70, H); ctx.fillRect(250, 20, 70, H);
      const signs = [[12, 90, 40, 14, "#ff2a6d"], [262, 70, 46, 12, "#00f0ff"], [20, 160, 26, 40, "#fcee0a"], [270, 150, 30, 18, "#b06bff"]];
      for (const [x, y, w, hh, c] of signs) {
        const on = hash(x + Math.floor(t * 2)) > 0.08;
        glow(ctx, c, on ? 16 : 0); ctx.strokeStyle = on ? c : rgba(c, 0.3); ctx.lineWidth = 3; ctx.strokeRect(x, y, w, hh); noGlow(ctx);
      }
      ctx.fillStyle = "rgba(255,42,109,0.08)"; ctx.fillRect(0, 330, W, 70);
      break;
    }
    case "skyline": {
      ctx.fillStyle = grad([[0, "#2a0a4a"], [0.6, "#ff2a6d"], [1, "#1a0520"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(250, 70, 26, 0, TAU); ctx.fill();
      for (let i = 0; i < 14; i++) {
        const bw = 18 + hash(i) * 26;
        const bh = 120 + hash(i + 9) * 200;
        const x = i * 24 - 10;
        ctx.fillStyle = "#0c0614"; ctx.fillRect(x, H - bh, bw, bh);
        for (let wy = H - bh + 8; wy < H - 10; wy += 10) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if (hash(wx * 3 + wy) > 0.72) { ctx.fillStyle = hash(wx + wy) > 0.5 ? "#fcee0a" : "#00f0ff"; ctx.fillRect(wx, wy, 2, 3); }
      }
      break;
    }
    case "rain": {
      ctx.fillStyle = grad([[0, "#0a1a2a"], [1, "#030810"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(155,231,255,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 80; i++) { const x = hash(i) * W; const y = (hash(i + 50) * H + t * 420) % H; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16); }
      ctx.stroke();
      break;
    }
    case "matrix": {
      ctx.fillStyle = "#000805"; ctx.fillRect(0, 0, W, H);
      ctx.font = "12px monospace";
      for (let c = 0; c < 26; c++) {
        const speed = 40 + hash(c) * 80;
        const head = (t * speed + hash(c + 3) * H) % (H + 120);
        for (let k = 0; k < 14; k++) {
          const y = head - k * 13;
          if (y < 0 || y > H) continue;
          ctx.fillStyle = k === 0 ? "#d0ffd8" : `rgba(61,220,132,${1 - k / 14})`;
          ctx.fillText(String.fromCharCode(0x30a0 + Math.floor(hash(c * 31 + k + Math.floor(t * 4)) * 90)), c * 12.5, y);
        }
      }
      break;
    }
    case "sunset": {
      ctx.fillStyle = grad([[0, "#1a0533"], [0.55, "#ff2a6d"], [0.56, "#1a0533"], [1, "#05010a"]]);
      ctx.fillRect(0, 0, W, H);
      const sg = ctx.createLinearGradient(0, 80, 0, 220); sg.addColorStop(0, "#fcee0a"); sg.addColorStop(1, "#ff2a6d");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(CX, 200, 90, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#1a0533";
      for (let i = 0; i < 6; i++) ctx.fillRect(60, 150 + i * 10, 200, 2 + i);
      ctx.strokeStyle = "rgba(255,42,109,0.7)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const y = 222 + i * i * 2 + ((t * 20) % 8); ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let i = -8; i <= 8; i++) { ctx.moveTo(CX + i * 8, 222); ctx.lineTo(CX + i * 60, H); }
      ctx.stroke();
      break;
    }
    case "arasaka": {
      ctx.fillStyle = grad([[0, "#2a0005"], [1, "#050002"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0a0002";
      poly(ctx, [[110, H], [130, 30], [190, 30], [210, H]]); ctx.fill();
      ctx.fillStyle = "#ff1a1a";
      glow(ctx, "#ff1a1a", 20); ctx.beginPath(); ctx.arc(CX, 60, 10, 0, TAU); ctx.fill(); noGlow(ctx);
      for (let y = 80; y < H; y += 14) for (let x = 136; x < 186; x += 8) if (hash(x + y * 7) > 0.6) { ctx.fillStyle = "rgba(255,60,60,0.5)"; ctx.fillRect(x, y, 3, 4); }
      break;
    }
    case "badlands": {
      ctx.fillStyle = grad([[0, "#ff9a3d"], [0.5, "#ffcf7a"], [0.51, "#a0522d"], [1, "#4a2010"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(80, 90, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7a3a1a";
      poly(ctx, [[0, 210], [20, 150], [90, 150], [110, 210]]); ctx.fill();
      poly(ctx, [[200, 210], [215, 170], [300, 165], [320, 210]]); ctx.fill();
      break;
    }
    case "space": {
      ctx.fillStyle = "#02020a"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * hash(i + Math.floor(t * 2) * 0.01)})`; ctx.fillRect(hash(i) * W, hash(i + 7) * H, 1.5, 1.5); }
      const pg = ctx.createRadialGradient(260, 330, 10, 260, 330, 180); pg.addColorStop(0, "#5aa9ff"); pg.addColorStop(1, "#0a1a4a");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(280, 380, 160, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#3a3f55"; ctx.lineWidth = 14; ctx.strokeRect(-4, -4, W + 8, H + 8);
      break;
    }
    case "sakura": {
      ctx.fillStyle = grad([[0, "#ffd6e6"], [1, "#ff9ec4"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#5a2a2a"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(0, 60); ctx.quadraticCurveTo(90, 40, 150, 10); ctx.moveTo(60, 50); ctx.lineTo(80, 110); ctx.stroke();
      for (let i = 0; i < 26; i++) { ctx.fillStyle = "#fff0f6"; ctx.beginPath(); ctx.arc(hash(i) * 170, hash(i + 3) * 110, 6 + hash(i + 5) * 6, 0, TAU); ctx.fill(); }
      break;
    }
    case "blackwall": {
      ctx.fillStyle = "#0a0000"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) {
        const y = hash(i + Math.floor(t * 6)) * H;
        ctx.fillStyle = `rgba(255,20,40,${0.1 + hash(i) * 0.3})`;
        ctx.fillRect(0, y, W, 2 + hash(i + 2) * 6);
      }
      ctx.strokeStyle = "rgba(255,40,60,0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(CX, 120, 110, 140, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(100, 100); ctx.lineTo(140, 110); ctx.moveTo(220, 100); ctx.lineTo(180, 110); ctx.stroke();
      break;
    }
    case "afterlife": {
      ctx.fillStyle = grad([[0, "#0a0a14"], [1, "#140a0a"]]);
      ctx.fillRect(0, 0, W, H);
      for (let s = 0; s < 3; s++) {
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(0, 60 + s * 60, W, 6);
        for (let i = 0; i < 14; i++) {
          const c = ["#3ddc84", "#b06bff", "#ff8a1f", "#00f0ff"][(i + s) % 4];
          ctx.fillStyle = rgba(c, 0.6); ctx.fillRect(8 + i * 22, 30 + s * 60, 10, 30);
        }
      }
      glow(ctx, "#ff2a6d", 14); ctx.fillStyle = "#ff2a6d"; ctx.font = "bold 20px sans-serif"; ctx.fillText("AFTERLIFE", 104, 24); noGlow(ctx);
      break;
    }
    case "ocean": {
      ctx.fillStyle = grad([[0, "#0a4a7a"], [1, "#020a1a"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(155,231,255,0.08)";
      for (let i = 0; i < 5; i++) { poly(ctx, [[40 + i * 60, 0], [70 + i * 60, 0], [20 + i * 70 + Math.sin(t + i) * 10, H], [-10 + i * 70, H]]); ctx.fill(); }
      ctx.strokeStyle = "rgba(200,240,255,0.5)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 16; i++) { const y = H - ((t * 40 + hash(i) * H) % H); ctx.beginPath(); ctx.arc(hash(i + 4) * W + Math.sin(t * 2 + i) * 4, y, 3 + hash(i) * 4, 0, TAU); ctx.stroke(); }
      break;
    }
    case "circuit": {
      ctx.fillStyle = "#03140a"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(61,220,132,0.5)"; ctx.lineWidth = 2;
      for (let i = 0; i < 30; i++) {
        const x = Math.round(hash(i) * 16) * 20;
        const y = Math.round(hash(i + 1) * 20) * 20;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y); ctx.lineTo(x + 40, y + 40 * (hash(i + 2) > 0.5 ? 1 : -1)); ctx.stroke();
        ctx.fillStyle = "#3ddc84"; ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      const p = (t * 80) % 400;
      ctx.fillStyle = "#d0ffd8"; glow(ctx, "#3ddc84", 10); ctx.fillRect(p - 2, 100, 5, 5); ctx.fillRect(320 - p, 260, 5, 5); noGlow(ctx);
      break;
    }
    case "throne": {
      ctx.fillStyle = grad([[0, "#2a0a4a"], [1, "#0a0214"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#1a0630";
      for (const x of [20, 270]) ctx.fillRect(x, 0, 30, H);
      ctx.fillStyle = "#d4af37";
      poly(ctx, [[70, H], [70, 120], [100, 70], [CX, 40], [220, 70], [250, 120], [250, H]]); ctx.fill();
      ctx.fillStyle = "#6a0a2a";
      poly(ctx, [[85, H], [85, 130], [CX, 60], [235, 130], [235, H]]); ctx.fill();
      break;
    }
    case "heaven": {
      ctx.fillStyle = grad([[0, "#fff6e0"], [0.5, "#ffd8a8"], [1, "#f8c8e8"]]);
      ctx.fillRect(0, 0, W, H);
      const rg = ctx.createRadialGradient(CX, 60, 10, CX, 60, 260); rg.addColorStop(0, "rgba(255,255,255,0.9)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,240,180,0.5)"; ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) { const an = Math.PI * (0.1 + i * 0.07); ctx.beginPath(); ctx.moveTo(CX, 40); ctx.lineTo(CX + Math.cos(an) * 400, 40 + Math.sin(an) * 400); ctx.stroke(); }
      for (let i = 0; i < 7; i++) {
        const cx = ((i * 70 + t * 8) % (W + 120)) - 60;
        const cy = 300 + (i % 3) * 50;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k * 18, cy - (k % 2) * 10, 22, 0, TAU); ctx.fill(); }
      }
      break;
    }
    case "temple": {
      ctx.fillStyle = grad([[0, "#3a2a6a"], [0.6, "#c88ad8"], [1, "#2a1a40"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f0e8f8";
      poly(ctx, [[20, 110], [CX, 40], [300, 110]]); ctx.fill();
      ctx.fillRect(24, 110, 272, 14);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "#e4d8f0" : "#f0e8f8"; ctx.fillRect(34 + i * 48, 124, 22, 300); }
      ctx.fillStyle = "rgba(42,26,64,0.4)"; ctx.fillRect(0, 380, W, 80);
      ctx.fillStyle = "#e8c547"; glow(ctx, "#ffd060", 16); ctx.beginPath(); ctx.arc(CX, 82, 10, 0, TAU); ctx.fill(); noGlow(ctx);
      break;
    }
    case "forest": {
      ctx.fillStyle = grad([[0, "#0a2a2a"], [1, "#04140e"]]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) {
        const x = i * 40 - 10 + hash(i) * 20;
        ctx.fillStyle = i % 2 ? "#0e3a2e" : "#0a2e24";
        poly(ctx, [[x, H], [x + 30, 60 + hash(i + 2) * 80], [x + 60, H]]); ctx.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = (hash(i + 5) * W + Math.sin(t + i) * 10) % W;
        const y = (hash(i + 9) * H - t * 10 * (0.5 + hash(i))) % H;
        ctx.fillStyle = `rgba(200,255,150,${0.4 + 0.5 * Math.sin(t * 3 + i)})`;
        ctx.beginPath(); ctx.arc(x, y < 0 ? y + H : y, 2, 0, TAU); ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = grad([[0, "#10101c"], [1, "#05050a"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = rgba(flat(a, t), 0.08); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += 20) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
    }
  }
}

/* =====================================================================
   Effets (aura) : couche arrière et couche avant
===================================================================== */

function drawAuraBack(ctx, look, t) {
  const a = flat(look.accentColor, t);
  switch (look.aura) {
    case "glow": {
      const g = ctx.createRadialGradient(CX, 230, 40, CX, 230, 190);
      g.addColorStop(0, rgba(a.startsWith("#") ? a : "#ff2a6d", 0.45 + 0.1 * Math.sin(t * 2)));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, AV_W, AV_H);
      break;
    }
    case "halo": {
      const g = ctx.createRadialGradient(CX, 170, 30, CX, 170, 200);
      g.addColorStop(0, "rgba(255,240,180,0.8)"); g.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, AV_W, AV_H);
      ctx.strokeStyle = "rgba(255,230,150,0.6)"; ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU + t * 0.2; ctx.beginPath(); ctx.moveTo(CX + Math.cos(an) * 90, 170 + Math.sin(an) * 90); ctx.lineTo(CX + Math.cos(an) * 200, 170 + Math.sin(an) * 200); ctx.stroke(); }
      break;
    }
    case "void": {
      const g = ctx.createRadialGradient(CX, 200, 20, CX, 200, 200);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.6, "rgba(40,0,60,0.5)"); g.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, AV_W, AV_H);
      ctx.strokeStyle = "rgba(176,107,255,0.6)"; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const an = t * 0.8 + i; ctx.beginPath(); ctx.arc(CX, 200, 130 + i * 8, an, an + 1.2); ctx.stroke(); }
      break;
    }
    case "fire": {
      for (let i = 0; i < 18; i++) {
        const x = 30 + i * 15;
        const hgt = 60 + 40 * Math.sin(t * 6 + i * 1.7) + hash(i) * 40;
        const g = ctx.createLinearGradient(0, AV_H, 0, AV_H - hgt * 2);
        g.addColorStop(0, "rgba(255,80,20,0.8)"); g.addColorStop(1, "rgba(255,220,80,0)");
        ctx.fillStyle = g;
        poly(ctx, [[x - 14, AV_H], [x, AV_H - hgt * 2], [x + 14, AV_H]]); ctx.fill();
      }
      break;
    }
    default: break;
  }
}

function drawAuraFront(ctx, look, t) {
  const a = flat(look.accentColor, t);
  switch (look.aura) {
    case "glitch": {
      if (Math.floor(t * 6) % 4 === 0) {
        for (let i = 0; i < 4; i++) {
          const y = hash(i + Math.floor(t * 12)) * AV_H;
          const hh = 4 + hash(i + 7) * 14;
          const dx = (hash(i + 3) - 0.5) * 24;
          try { ctx.drawImage(ctx.canvas, 0, y * (ctx.canvas.height / AV_H), ctx.canvas.width, hh * (ctx.canvas.height / AV_H), dx, y, AV_W, hh); } catch { /* rien */ }
        }
      }
      ctx.fillStyle = "rgba(0,240,255,0.08)"; ctx.fillRect(-3, 0, AV_W, AV_H);
      break;
    }
    case "rain": {
      ctx.strokeStyle = "rgba(180,220,255,0.45)"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) { const x = hash(i + 11) * AV_W; const y = (hash(i + 40) * AV_H + t * 500) % AV_H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); }
      ctx.stroke();
      break;
    }
    case "sparks": {
      for (let i = 0; i < 24; i++) {
        const life = (t * 0.8 + hash(i)) % 1;
        const x = CX + (hash(i + 2) - 0.5) * 260 + Math.sin(t * 3 + i) * 6;
        const y = AV_H - life * 360;
        ctx.globalAlpha = 1 - life;
        ctx.fillStyle = i % 2 ? "#fcee0a" : (a.startsWith("#") ? a : "#ff2a6d");
        ctx.fillRect(x, y, 3, 3);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "binary": {
      ctx.font = "bold 13px monospace";
      for (let i = 0; i < 22; i++) {
        const life = (t * 0.35 + hash(i)) % 1;
        ctx.globalAlpha = Math.sin(life * Math.PI) * 0.8;
        ctx.fillStyle = "#3ddc84";
        ctx.fillText(hash(i + Math.floor(t)) > 0.5 ? "1" : "0", 20 + hash(i + 9) * 280, AV_H - life * 400);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "sakura":
    case "leaves": {
      for (let i = 0; i < 18; i++) {
        const life = (t * 0.15 + hash(i)) % 1;
        const x = (hash(i + 3) * AV_W + Math.sin(t + i) * 30 + life * 60) % AV_W;
        const y = life * AV_H;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + i);
        ctx.fillStyle = look.aura === "sakura" ? "#ffc0d8" : ["#ff8a1f", "#d4402a", "#e8b030"][i % 3];
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "lightning": {
      if (Math.floor(t * 3) % 3 === 0) {
        ctx.strokeStyle = "#e0f7ff"; ctx.lineWidth = 2; glow(ctx, "#7df9ff", 14);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          let x = CX + side * 120;
          ctx.moveTo(x, 0);
          for (let y = 0; y < AV_H; y += 30) { x += (hash(y + Math.floor(t * 9) + side) - 0.5) * 40; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        noGlow(ctx);
      }
      break;
    }
    case "stars": {
      for (let i = 0; i < 14; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 2);
        const x = 20 + hash(i + 21) * 280;
        const y = 20 + hash(i + 33) * 300;
        ctx.fillStyle = `rgba(255,250,200,${tw})`;
        poly(ctx, [[x, y - 6], [x + 1.5, y - 1.5], [x + 6, y], [x + 1.5, y + 1.5], [x, y + 6], [x - 1.5, y + 1.5], [x - 6, y], [x - 1.5, y - 1.5]]);
        ctx.fill();
      }
      break;
    }
    case "bubbles": {
      ctx.strokeStyle = "rgba(200,240,255,0.6)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 16; i++) {
        const life = (t * 0.25 + hash(i)) % 1;
        ctx.beginPath(); ctx.arc(30 + hash(i + 5) * 260 + Math.sin(t * 2 + i) * 6, AV_H - life * AV_H, 3 + hash(i) * 6, 0, TAU); ctx.stroke();
      }
      break;
    }
    case "fire": {
      for (let i = 0; i < 16; i++) {
        const life = (t * 0.7 + hash(i)) % 1;
        ctx.globalAlpha = 1 - life;
        ctx.fillStyle = "#ffcf5a";
        ctx.fillRect(40 + hash(i + 1) * 240, AV_H - life * 260, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default: break;
  }
}


/* =====================================================================
   Bas (pantalons, jupes…)
===================================================================== */

function drawBottom(ctx, look, t) {
  const B = body(look);
  const c = look.bottomColor;
  const a = acc(look, t);
  const hipBand = (y0 = 254, y1 = 300) => poly(ctx, [[CX - B.waist - 3, y0], [CX + B.waist + 3, y0], [CX + B.hip + 1, B.hipY + 4], [CX + 6, y1], [CX - 6, y1], [CX - B.hip - 1, B.hipY + 4]]);
  const pants = (t1 = 1, extra = 5, flare = 0) => {
    for (const s of [-1, 1]) {
      part(ctx, () => poly(ctx, strip(legPts(look, s), 0, t1, 23, 12 + flare, extra)), c, t, () => { ctx.fillRect(CX + s * 2 - (s < 0 ? 12 : 0), 0, 12, AV_H); });
      // plis au genou et à l'aine
      const [, knee] = legPts(look, s);
      ctx.strokeStyle = withAlpha(isHex(flat(c, t)) ? shade(flat(c, t), -0.45) : "rgb(20,10,30)", 0.55); ctx.lineWidth = 1; ctx.lineCap = "round";
      if (t1 > 0.6) for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(knee[0] - 6, knee[1] - 4 + i * 6); ctx.quadraticCurveTo(knee[0], knee[1] + i * 6, knee[0] + 5, knee[1] - 5 + i * 6); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(CX + s * 3, 286); ctx.quadraticCurveTo(CX + s * 8, 296, CX + s * 9, 312); ctx.stroke();
      ctx.lineCap = "butt";
    }
    part(ctx, () => hipBand(), c, t, null);
  };
  const skirt = (yEnd, spread, pleats = 0) => {
    part(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(CX - B.waist - 3, 252);
      ctx.quadraticCurveTo(CX - B.hip - spread * 0.6, (252 + yEnd) / 2, CX - B.hip - spread, yEnd);
      ctx.quadraticCurveTo(CX, yEnd + 8, CX + B.hip + spread, yEnd);
      ctx.quadraticCurveTo(CX + B.hip + spread * 0.6, (252 + yEnd) / 2, CX + B.waist + 3, 252);
      ctx.closePath();
    }, c, t, () => { ctx.fillRect(CX + 12, 0, 80, AV_H); });
    if (pleats) {
      ctx.strokeStyle = lineOf(flat(c, t)); ctx.lineWidth = 1;
      for (let i = 1; i < pleats; i++) { const k = i / pleats; ctx.beginPath(); ctx.moveTo(lerp(CX - B.waist, CX + B.waist, k), 256); ctx.lineTo(lerp(CX - B.hip - spread, CX + B.hip + spread, k), yEnd + 2); ctx.stroke(); }
    }
  };
  switch (look.bottom) {
    case "shorts": pants(0.36, 6); break;
    case "skirt": skirt(312, 10); break;
    case "pleated": skirt(306, 14, 8); ctx.fillStyle = a; ctx.fillRect(CX - B.hip - 12, 300, 2 * B.hip + 24, 3); break;
    case "longrobe": skirt(396, 22, 5); break;
    case "divine":
      ctx.globalAlpha = 0.9; skirt(398, 30, 7); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX - B.hip - 28, 394); ctx.quadraticCurveTo(CX, 404, CX + B.hip + 28, 394); ctx.stroke();
      ctx.fillStyle = "#e8c547"; ctx.fillRect(CX - B.waist - 3, 252, 2 * B.waist + 6, 6);
      break;
    case "hakama": pants(1, 12, 16); for (const s of [-1, 1]) { ctx.strokeStyle = lineOf(flat(c, t)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(CX + s * 10, 280); ctx.lineTo(CX + s * 22, 388); ctx.stroke(); } break;
    case "cargo":
      pants(1, 7);
      for (const s of [-1, 1]) { const [x, y] = [legPts(look, s)[1][0], 316]; part(ctx, () => { ctx.beginPath(); ctx.rect(x - 9 + s * 4, y, 16, 18); }, c, t, null); }
      break;
    case "sweat":
      pants(1, 6);
      for (const s of [-1, 1]) { const p = legPts(look, s)[2]; ctx.fillStyle = shade(flat(c, t), -0.3); ctx.fillRect(p[0] - 9, p[1] - 8, 18, 6); ctx.fillStyle = "#ffffff"; ctx.fillRect(legPts(look, s)[1][0] + s * 9, 280, 2, 100); }
      break;
    case "leggings":
      pants(1, 2);
      ctx.strokeStyle = a; ctx.lineWidth = 2.5; glow(ctx, a, 8);
      for (const s of [-1, 1]) { const [p0, p1, p2] = legPts(look, s); ctx.beginPath(); ctx.moveTo(p0[0] + s * 10, p0[1] + 6); ctx.lineTo(p1[0] + s * 8, p1[1]); ctx.lineTo(p2[0] + s * 6, p2[1] - 4); ctx.stroke(); }
      noGlow(ctx);
      break;
    case "tights":
      pants(1, 1);
      ctx.strokeStyle = a; ctx.lineWidth = 1.5; glow(ctx, a, 8);
      for (const s of [-1, 1]) { const [, p1] = legPts(look, s); ctx.beginPath(); ctx.moveTo(p1[0] - 8, p1[1] - 20); ctx.lineTo(p1[0], p1[1] - 6); ctx.lineTo(p1[0] + 8, p1[1] - 20); ctx.moveTo(p1[0], p1[1] - 6); ctx.lineTo(p1[0], p1[1] + 40); ctx.stroke(); }
      noGlow(ctx);
      break;
    case "greaves":
      pants(1, 6);
      for (const s of [-1, 1]) {
        part(ctx, () => poly(ctx, strip(legPts(look, s), 0.52, 0.95, 22, 12, 9)), "chrome", t, null, [CX - 60, 320, CX + 60, 390]);
        const [, p1] = legPts(look, s);
        part(ctx, () => { ctx.beginPath(); ctx.ellipse(p1[0], p1[1], 12, 9, 0, 0, TAU); }, "chrome", t, null, [p1[0] - 12, p1[1] - 9, p1[0] + 12, p1[1] + 9]);
      }
      break;
    default:   // jean
      pants(1, 5);
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 18, 262); ctx.quadraticCurveTo(CX + s * 26, 272, CX + s * 30, 270); ctx.stroke(); }
      ctx.fillStyle = "#c8a04a"; ctx.fillRect(CX - 2, 256, 4, 4);
  }
}

/* =====================================================================
   Chaussures
===================================================================== */

function drawShoes(ctx, look, t, skin) {
  const c = look.bottomColor;
  const a = acc(look, t);
  for (const s of [-1, 1]) {
    const [ax, ay] = legPts(look, s)[2];
    const fx = ax + s * 4;
    const fy = ay + 9;
    const foot = (rx = 13, ry = 7, col = c) => part(ctx, () => { ctx.beginPath(); ctx.ellipse(fx, fy, rx, ry, 0, 0, TAU); }, col, t, null);
    const shaft = (t0, col = c, extra = 7) => part(ctx, () => poly(ctx, strip(legPts(look, s), t0, 1, 22, 12, extra)), col, t, null);
    switch (look.shoes) {
      case "barefoot": foot(10, 6, look.skin in SKINS ? SKINS[look.skin] : "#efc2a0"); break;
      case "boots": shaft(0.78, "#4a3020"); foot(13, 7, "#4a3020"); break;
      case "combat": shaft(0.8, "#2a2a2a"); foot(14, 7.5, "#2a2a2a"); ctx.fillStyle = "#555"; ctx.fillRect(fx - 14, fy + 3, 28, 3); break;
      case "cyber":
        shaft(0.84, "#1a1a28"); foot(14, 7, "#1a1a28");
        ctx.fillStyle = a; glow(ctx, a, 12); ctx.fillRect(fx - 13, fy + 4, 26, 3); ctx.fillRect(ax - 7, ay - 18, 14, 2); noGlow(ctx);
        break;
      case "geta":
        foot(10, 5, skin in SKINS ? SKINS[skin] : "#efc2a0");
        ctx.fillStyle = "#6a3a1a"; ctx.fillRect(fx - 12, fy + 4, 24, 4); ctx.fillRect(fx - 9, fy + 8, 4, 5); ctx.fillRect(fx + 5, fy + 8, 4, 5);
        ctx.strokeStyle = "#c8102e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx - 4, fy + 3); ctx.lineTo(fx, fy - 4); ctx.lineTo(fx + 4, fy + 3); ctx.stroke();
        break;
      case "sandals":
        foot(10, 6, look.skin in SKINS ? SKINS[look.skin] : "#efc2a0");
        ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(fx - 8, fy - 2); ctx.lineTo(fx + 8, fy - 2); ctx.moveTo(ax - 6, ay - 8); ctx.lineTo(ax + 6, ay - 8); ctx.stroke();
        ctx.fillStyle = "#8a5a2b"; ctx.fillRect(fx - 12, fy + 4, 24, 3);
        break;
      case "heels":
        foot(12, 6, c);
        ctx.fillStyle = lineOf(flat(c, t)); ctx.fillRect(fx - s * 8 - 1.5, fy + 2, 3, 10);
        break;
      case "armored":
        shaft(0.75, "chrome", 9); foot(15, 8, "chrome");
        ctx.strokeStyle = "#3a3f55"; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(fx - 10 + k * 6, fy - 6); ctx.lineTo(fx - 8 + k * 6, fy + 6); ctx.stroke(); }
        break;
      case "winged": {
        foot(11, 6, "#f4e8c8");
        ctx.strokeStyle = "#c8a04a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax - 7, ay - 6); ctx.lineTo(ax + 7, ay - 6); ctx.stroke();
        const f = Math.sin(t * 8) * 3;
        part(ctx, () => { ctx.beginPath(); ctx.moveTo(ax + s * 6, ay - 4); ctx.quadraticCurveTo(ax + s * 24, ay - 18 - f, ax + s * 26, ay - 4); ctx.quadraticCurveTo(ax + s * 18, ay - 6, ax + s * 6, ay); ctx.closePath(); }, "#ffffff", t, null);
        break;
      }
      default:   // baskets
        foot(14, 7.5, "#f4f4f8");
        ctx.fillStyle = a; ctx.fillRect(fx - 9, fy - 2, 14, 3);
        ctx.fillStyle = "#c8c8d0"; ctx.fillRect(fx - 14, fy + 3, 28, 3);
    }
  }
}

/* =====================================================================
   Hauts
===================================================================== */

// len : bas du vêtement · sleeve : longueur des manches (0 à 1) · neck : largeur de l'encolure · flare : évasement
const TOPS = {
  tee: { len: 262, sleeve: 0.32 }, hoodie: { len: 270, sleeve: 1, neck: 16 }, tank: { len: 262, sleeve: 0, neck: 18 },
  jacket: { len: 272, sleeve: 1 }, samurai: { len: 276, sleeve: 1 }, trench: { len: 350, sleeve: 1, flare: 22 },
  netrunner: { len: 268, sleeve: 1, neck: 11 }, armor: { len: 270, sleeve: 0.55 }, kimono: { len: 300, sleeve: 0.75, flare: 8 },
  suit: { len: 274, sleeve: 1 }, bomber: { len: 266, sleeve: 1 }, nomad: { len: 280, sleeve: 0.9, flare: 6 },
  cape: { len: 268, sleeve: 1 }, diver: { len: 268, sleeve: 1, neck: 11 }, farmer: { len: 262, sleeve: 0.45 },
  king: { len: 330, sleeve: 1, flare: 18 }, survivor: { len: 270, sleeve: 0.4 }, edgerunner: { len: 270, sleeve: 1 },
  toga: { len: 300, sleeve: 0, neck: 18, flare: 10 }, paladin: { len: 280, sleeve: 0.6 }, priest: { len: 300, sleeve: 1, flare: 14 },
  school: { len: 266, sleeve: 1 }, witch: { len: 290, sleeve: 1, flare: 16 }
};

// Plis du tissu (taille, coudes, aisselles) : de simples traits ombrés, comme sur une illustration
function clothFolds(ctx, look, t, c, T) {
  const B = body(look);
  const fc = flat(c, t);
  ctx.save();
  ctx.strokeStyle = withAlpha(isHex(fc) ? shade(fc, -0.45) : "rgb(20,10,30)", 0.5);
  ctx.lineWidth = 1; ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(CX + s * (B.waist - 1), B.waistY - 6); ctx.quadraticCurveTo(CX + s * (B.waist - 8), B.waistY - 1, CX + s * (B.waist - 14), B.waistY + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + s * (B.sh - 6), B.shoulderY + 22); ctx.quadraticCurveTo(CX + s * (B.sh - 12), B.shoulderY + 30, CX + s * (B.sh - 14), B.shoulderY + 42); ctx.stroke();
    if (T.sleeve > 0.5) {
      const [, e] = armPts(look, s);
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(e[0] - 5, e[1] - 3 + i * 5); ctx.quadraticCurveTo(e[0], e[1] + 1 + i * 5, e[0] + 5, e[1] - 2 + i * 5); ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.moveTo(CX - B.sh + 8, B.shoulderY + 4); ctx.quadraticCurveTo(CX - B.sh + 4, B.shoulderY + 30, CX - B.waist + 3, B.waistY - 14); ctx.stroke();
  ctx.restore();
}

function drawTop(ctx, look, t) {
  const B = body(look);
  const T = TOPS[look.top] || TOPS.tee;
  const c = look.topColor;
  const a = acc(look, t);
  const dk = isHex(flat(c, t)) ? shade(flat(c, t), -0.35) : "#2a2a3a";
  const lt = isHex(flat(c, t)) ? shade(flat(c, t), 0.3) : "#e0e0e8";
  const sy = B.shoulderY;
  const sideShadow = () => { ctx.fillRect(CX + B.waist * 0.4, 0, 80, AV_H); };
  // manches
  if (T.sleeve > 0) {
    const flareS = look.top === "kimono" || look.top === "priest" || look.top === "witch" ? 10 : 4;
    for (const s of [-1, 1]) part(ctx, () => poly(ctx, strip(armPts(look, s), 0, T.sleeve, 15, 10 + (T.sleeve > 0.7 ? flareS : 0), 5)), c, t, () => { if (s > 0) ctx.fillRect(0, 0, AV_W, AV_H); });
  }
  // corps du vêtement
  part(ctx, () => torsoPath(ctx, look, T.len, T.flare || 0, T.neck || 13), c, t, sideShadow);
  clothFolds(ctx, look, t, c, T);
  const lapels = (inner, open = 15, depth = 222) => { ctx.fillStyle = inner; poly(ctx, [[CX - open, sy - 8], [CX + open, sy - 8], [CX, depth]]); ctx.fill(); ctx.strokeStyle = lineOf(flat(c, t)); ctx.lineWidth = 1.5; ctx.stroke(); };
  const belt = (y, col = "#3a2a1a", buckle = "#e8c547") => { ctx.fillStyle = col; ctx.fillRect(CX - B.waist - 2, y, 2 * B.waist + 4, 6); ctx.fillStyle = buckle; ctx.fillRect(CX - 4, y, 8, 6); };
  switch (look.top) {
    case "tee":
      ctx.fillStyle = a; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("◢◤", CX, 222); ctx.textAlign = "start";
      break;
    case "hoodie":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - 30, sy - 6); ctx.quadraticCurveTo(CX, sy + 22, CX + 30, sy - 6); ctx.quadraticCurveTo(CX, sy + 6, CX - 30, sy - 6); }, dk, t, null);
      ctx.strokeStyle = a; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(CX - 6, sy + 8); ctx.lineTo(CX - 7, 214); ctx.moveTo(CX + 6, sy + 8); ctx.lineTo(CX + 7, 214); ctx.stroke();
      ctx.fillStyle = dk; ctx.fillRect(CX - 22, 238, 44, 22);
      break;
    case "jacket":
      lapels("#22202a"); ctx.fillStyle = "#c0c0c8"; ctx.fillRect(CX + 14, 200, 2, 70);
      break;
    case "samurai":
      lapels("#151515", 12);
      ctx.fillStyle = a; ctx.fillRect(CX - B.sh, 236, 2 * B.sh, 4);
      ctx.strokeStyle = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX + 22, 210, 7, 0, TAU); ctx.stroke();
      break;
    case "trench":
      lapels("#1a1a1a", 17, 230);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 15, sy - 10], [CX + s * 36, sy - 4], [CX + s * 30, sy + 18], [CX + s * 12, sy + 12]]), dk, t, null);
      belt(244, dk, lt);
      break;
    case "netrunner":
      ctx.strokeStyle = a; ctx.lineWidth = 1.8; glow(ctx, a, 8);
      ctx.beginPath(); ctx.moveTo(CX, sy); ctx.lineTo(CX, 266); ctx.moveTo(CX - 20, sy + 10); ctx.lineTo(CX - 10, 220); ctx.lineTo(CX - 10, 266); ctx.moveTo(CX + 20, sy + 10); ctx.lineTo(CX + 10, 220); ctx.lineTo(CX + 10, 266); ctx.stroke();
      noGlow(ctx);
      break;
    case "armor":
      for (const s of [-1, 1]) part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX + s * (B.sh + 2), sy + 10, 20, 15, s * 0.35, 0, TAU); }, lt, t, null);
      part(ctx, () => poly(ctx, [[CX - 26, sy + 12], [CX + 26, sy + 12], [CX + 22, 252], [CX - 22, 252]]), dk, t, null);
      ctx.fillStyle = a; glow(ctx, a, 10); ctx.fillRect(CX - 7, 214, 14, 4); noGlow(ctx);
      break;
    case "kimono":
      part(ctx, () => poly(ctx, [[CX - 16, sy - 8], [CX + 6, 236], [CX + 16, sy - 8]]), "#f2ece0", t, null);
      ctx.strokeStyle = dk; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(CX - 16, sy - 8); ctx.lineTo(CX + 10, 238); ctx.stroke();
      ctx.fillStyle = a; ctx.fillRect(CX - B.waist - 4, 240, 2 * B.waist + 8, 14);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(CX - 24 + i * 12, 200 + (i % 2) * 22, 3, 0, TAU); ctx.fill(); }
      break;
    case "suit":
      lapels("#f4f4f4", 12, 230);
      ctx.fillStyle = a; poly(ctx, [[CX - 3, sy - 4], [CX + 3, sy - 4], [CX + 4, 220], [CX, 228], [CX - 4, 220]]); ctx.fill();
      ctx.fillStyle = "#ff1a1a"; ctx.beginPath(); ctx.arc(CX + 22, 200, 3, 0, TAU); ctx.fill();
      break;
    case "bomber":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, sy - 2, 34, 10, 0, 0, TAU); }, "#e0d0b0", t, null);
      ctx.fillStyle = "#c0c0c8"; ctx.fillRect(CX - 1, sy + 8, 2, 90);
      ctx.fillStyle = a; ctx.fillRect(CX - 30, 214, 16, 8);
      ctx.fillStyle = dk; ctx.fillRect(CX - B.waist - 4, 258, 2 * B.waist + 8, 8);
      break;
    case "nomad":
      part(ctx, () => poly(ctx, [[CX - B.sh - 6, sy + 6], [CX, sy - 2], [CX + B.sh + 6, sy + 6], [CX + 22, 240], [CX - 22, 240]]), "#9a6a3a", t, null);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? a : "#e8c547"; ctx.fillRect(CX - 30 + i * 16, 206, 10, 4); }
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, sy - 2, 28, 9, 0, 0, TAU); }, "#c08a5a", t, null);
      break;
    case "cape":
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 40, sy - 2], [CX + s * 28, sy - 26], [CX + s * 16, sy + 8]]), dk, t, null);
      ctx.fillStyle = a; glow(ctx, a, 10); ctx.beginPath(); ctx.arc(CX, sy + 6, 5, 0, TAU); ctx.fill(); noGlow(ctx);
      break;
    case "diver":
      ctx.strokeStyle = a; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 30, sy + 14); ctx.lineTo(CX + s * 26, 266); ctx.stroke(); }
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, sy - 2, 18, 7, 0, 0, TAU); }, dk, t, null);
      break;
    case "farmer":
      ctx.strokeStyle = "rgba(160,40,40,0.35)"; ctx.lineWidth = 1.5;
      ctx.save(); torsoPath(ctx, look, T.len); ctx.clip();
      for (let x = CX - 60; x < CX + 60; x += 8) { ctx.beginPath(); ctx.moveTo(x, 160); ctx.lineTo(x, 280); ctx.stroke(); }
      ctx.restore();
      part(ctx, () => poly(ctx, [[CX - 24, 226], [CX + 24, 226], [CX + B.waist + 2, 262], [CX - B.waist - 2, 262]]), "#3a5a8a", t, null);
      for (const s of [-1, 1]) { part(ctx, () => poly(ctx, [[CX + s * 22, sy - 4], [CX + s * 15, sy - 4], [CX + s * 14, 228], [CX + s * 21, 228]]), "#3a5a8a", t, null); ctx.fillStyle = "#e8c547"; ctx.beginPath(); ctx.arc(CX + s * 18, 224, 2.5, 0, TAU); ctx.fill(); }
      break;
    case "king":
      lapels("#f4f0e0", 16, 236);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 15, sy - 10], [CX + s * 56, sy + 2], [CX + s * 44, sy + 28], [CX + s * 13, sy + 26]]), "#f8f4ec", t, null);
      ctx.fillStyle = "#1c1424"; for (let i = 0; i < 8; i++) ctx.fillRect(CX - 46 + i * 13 + (i % 2) * 3, sy + 4 + (i % 3) * 6, 2, 4);
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(CX - 22, sy + 8); ctx.quadraticCurveTo(CX, 224, CX + 22, sy + 8); ctx.stroke();
      ctx.fillStyle = "#e8c547"; ctx.beginPath(); ctx.arc(CX, 220, 5, 0, TAU); ctx.fill();
      break;
    case "survivor":
      part(ctx, () => poly(ctx, [[CX - 30, sy + 4], [CX + 30, sy + 4], [CX + 28, 262], [CX - 28, 262]]), "#4a5440", t, null);
      for (const [x, y] of [[CX - 24, 206], [CX + 4, 206], [CX - 24, 232], [CX + 4, 232]]) part(ctx, () => { ctx.beginPath(); ctx.rect(x, y, 20, 18); }, "#5a6450", t, null);
      ctx.fillStyle = a; ctx.fillRect(CX + 20, 200, 6, 6);
      break;
    case "edgerunner":
      lapels("#151515", 10);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 11, sy - 8], [CX + s * 38, sy - 16], [CX + s * 32, sy + 14], [CX + s * 8, sy + 26]]), "#fcee0a", t, null);
      ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2.5; glow(ctx, "#00f0ff", 10);
      ctx.beginPath(); ctx.moveTo(CX - B.sh + 4, 250); ctx.lineTo(CX - 14, 232); ctx.moveTo(CX + B.sh - 4, 250); ctx.lineTo(CX + 14, 232); ctx.stroke(); noGlow(ctx);
      break;
    case "toga":
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(CX - B.sh + 4, sy + 4); ctx.quadraticCurveTo(CX, 230, CX + B.sh - 2, 260); ctx.stroke();
      ctx.strokeStyle = lineOf(flat(c, t)); ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(CX - 30 + i * 14, 250); ctx.quadraticCurveTo(CX - 26 + i * 14, 276, CX - 32 + i * 16, 298); ctx.stroke(); }
      ctx.fillStyle = "#e8c547"; ctx.beginPath(); ctx.arc(CX - B.sh + 6, sy + 6, 5, 0, TAU); ctx.fill();
      break;
    case "paladin":
      for (const s of [-1, 1]) part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX + s * (B.sh + 2), sy + 8, 21, 15, s * 0.3, 0, TAU); }, "chrome", t, null, [CX - 80, 150, CX + 80, 200]);
      part(ctx, () => poly(ctx, [[CX - 28, sy + 6], [CX + 28, sy + 6], [CX + 24, 256], [CX, 266], [CX - 24, 256]]), "chrome", t, null, [CX - 30, 170, CX + 30, 266]);
      ctx.fillStyle = "#e8c547"; ctx.fillRect(CX - 3, 196, 6, 40); ctx.fillRect(CX - 14, 208, 28, 6);
      ctx.fillStyle = a; ctx.fillRect(CX - B.hip - 2, 262, 2 * B.hip + 4, 16);
      break;
    case "priest":
      part(ctx, () => poly(ctx, [[CX - 8, sy - 6], [CX + 8, sy - 6], [CX + 10, 300], [CX - 10, 300]]), "#f4f0e8", t, null);
      ctx.fillStyle = "#e8c547"; ctx.fillRect(CX - 1.5, 200, 3, 30); ctx.fillRect(CX - 8, 208, 16, 3);
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX - B.sh, sy + 12); ctx.quadraticCurveTo(CX, sy + 30, CX + B.sh, sy + 12); ctx.stroke();
      break;
    case "school":
      part(ctx, () => poly(ctx, [[CX - 24, sy - 6], [CX + 24, sy - 6], [CX + B.sh, sy + 18], [CX, sy + 30], [CX - B.sh, sy + 18]]), "#1a2a5a", t, null);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(CX - B.sh + 6, sy + 16); ctx.lineTo(CX, sy + 26); ctx.lineTo(CX + B.sh - 6, sy + 16); ctx.stroke();
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX, sy + 22); ctx.lineTo(CX - 10, sy + 34); ctx.lineTo(CX, sy + 46); ctx.lineTo(CX + 10, sy + 34); ctx.closePath(); }, look.accentColor, t, null);
      break;
    case "witch":
      ctx.fillStyle = a; ctx.fillRect(CX - B.waist - 2, 240, 2 * B.waist + 4, 5);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = "#fff0a0"; ctx.beginPath(); ctx.arc(CX - 30 + hash(i) * 60, 200 + hash(i + 3) * 80, 1.6, 0, TAU); ctx.fill(); }
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, sy - 2, 32, 10, 0, 0, TAU); }, dk, t, null);
      break;
    default: break;
  }
}

/* =====================================================================
   Cou, tatouages, cyberware
===================================================================== */

function drawNeck(ctx, look, t) {
  const a = acc(look, t);
  const y = 170;
  switch (look.neck) {
    case "chain": ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(CX - 14, y - 2); ctx.quadraticCurveTo(CX, y + 26, CX + 14, y - 2); ctx.stroke(); break;
    case "choker": ctx.fillStyle = "#1c1424"; ctx.fillRect(CX - 12, y - 14, 24, 5); ctx.fillStyle = a; ctx.beginPath(); ctx.arc(CX, y - 7, 3, 0, TAU); ctx.fill(); break;
    case "scarf":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, y - 2, 26, 10, 0, 0, TAU); }, look.accentColor, t, null);
      part(ctx, () => poly(ctx, [[CX + 10, y + 2], [CX + 22, y + 2], [CX + 26, y + 40], [CX + 14, y + 42]]), look.accentColor, t, null);
      break;
    case "neon": ctx.strokeStyle = a; ctx.lineWidth = 3.5; glow(ctx, a, 14); ctx.beginPath(); ctx.ellipse(CX, y - 6, 15, 5, 0, 0, Math.PI); ctx.stroke(); noGlow(ctx); break;
    case "pendant":
      ctx.strokeStyle = "#c0c0c8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(CX - 12, y - 2); ctx.lineTo(CX, y + 22); ctx.lineTo(CX + 12, y - 2); ctx.stroke();
      ctx.fillStyle = a; glow(ctx, a, 10); poly(ctx, [[CX, y + 18], [CX + 5, y + 24], [CX, y + 32], [CX - 5, y + 24]]); ctx.fill(); noGlow(ctx);
      break;
    case "dogtag":
      ctx.strokeStyle = "#a0a0a8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(CX - 13, y - 2); ctx.lineTo(CX - 2, y + 20); ctx.moveTo(CX + 13, y - 2); ctx.lineTo(CX + 2, y + 20); ctx.stroke();
      ctx.fillStyle = "#d0d0d8"; ctx.fillRect(CX - 8, y + 18, 7, 11); ctx.fillRect(CX + 1, y + 19, 7, 11);
      break;
    case "fur": for (let i = 0; i < 11; i++) { const an = Math.PI * (0.05 + (i / 10) * 0.9); part(ctx, () => { ctx.beginPath(); ctx.arc(CX + Math.cos(an) * 34, y - 6 + Math.sin(an) * 12, 8, 0, TAU); }, "#eee6d8", t, null); } break;
    default: break;
  }
}

function drawMarks(ctx, look, t) {
  const { w, h, top, eyeY, mouthY } = dims(look);
  const a = acc(look, t);
  ctx.save(); headPath(ctx, look); ctx.clip();
  switch (look.marks) {
    case "scar": ctx.strokeStyle = "rgba(170,60,60,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX - 26, eyeY - 18); ctx.lineTo(CX - 12, eyeY + 18); ctx.stroke(); break;
    case "tribal": ctx.strokeStyle = a; ctx.lineWidth = 2; glow(ctx, a, 8); ctx.beginPath(); ctx.moveTo(CX + 24, eyeY - 20); ctx.quadraticCurveTo(CX + 38, eyeY, CX + 26, eyeY + 22); ctx.moveTo(CX + 30, eyeY - 6); ctx.lineTo(CX + 37, eyeY - 2); ctx.stroke(); noGlow(ctx); break;
    case "barcode": ctx.fillStyle = "#1c1424"; for (let i = 0; i < 12; i++) if (hash(i) > 0.3) ctx.fillRect(CX + 18 + i * 1.8, eyeY + 14, 1 + (i % 2), 9); break;
    case "tears": ctx.fillStyle = "#3a3a8a"; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(CX - 18, eyeY + 15 + i * 9, 1.8, 3, 0, 0, TAU); ctx.fill(); } break;
    case "circuit": ctx.strokeStyle = a; ctx.lineWidth = 1.2; glow(ctx, a, 6); ctx.beginPath(); ctx.moveTo(CX - w, eyeY + 16); ctx.lineTo(CX - 28, eyeY + 16); ctx.lineTo(CX - 22, eyeY + 24); ctx.lineTo(CX - 16, eyeY + 24); ctx.stroke(); ctx.fillStyle = a; ctx.fillRect(CX - 17, eyeY + 22, 3, 3); noGlow(ctx); break;
    case "freckles": ctx.fillStyle = "rgba(150,80,40,0.55)"; for (let i = 0; i < 16; i++) { const s = i % 2 ? 1 : -1; ctx.beginPath(); ctx.arc(CX + s * (12 + hash(i) * 16), eyeY + 13 + hash(i + 4) * 8, 1, 0, TAU); ctx.fill(); } break;
    case "blush": ctx.fillStyle = "rgba(255,90,120,0.35)"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * 22, eyeY + 16, 10, 5, 0, 0, TAU); ctx.fill(); } break;
    case "warpaint": ctx.fillStyle = "rgba(210,30,30,0.75)"; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ctx.fillRect(CX + s * 21 - 9, eyeY + 13 + i * 5, 18, 2.5); break;
    case "sakura": ctx.fillStyle = "#ff8ab4"; for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU; ctx.beginPath(); ctx.ellipse(CX + 26 + Math.cos(an) * 3.5, eyeY + 16 + Math.sin(an) * 3.5, 3, 2, an, 0, TAU); ctx.fill(); } break;
    case "moon": ctx.fillStyle = "#e8e0ff"; glow(ctx, "#b0a0ff", 8); ctx.beginPath(); ctx.arc(CX - 26, eyeY + 17, 5, 0, TAU); ctx.fill(); noGlow(ctx); ctx.fillStyle = flat(SKINS[look.skin] || "#efc2a0", t); ctx.beginPath(); ctx.arc(CX - 24, eyeY + 15.5, 4.2, 0, TAU); ctx.fill(); break;
    case "dragon": ctx.strokeStyle = "#1a5a3a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX - w, mouthY + 8); ctx.bezierCurveTo(CX - 30, mouthY - 20, CX - 38, eyeY - 6, CX - 24, eyeY - 30); ctx.stroke(); break;
    case "qr": for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (hash(i * 6 + j) > 0.45 || (i < 2 && j < 2)) { ctx.fillStyle = "#1c1424"; ctx.fillRect(CX + 20 + i * 2.3, eyeY + 12 + j * 2.3, 2.3, 2.3); } break;
    case "clown":
      ctx.fillStyle = "#e02020"; ctx.beginPath(); ctx.arc(CX, eyeY + 17, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2a5ad8"; for (const s of [-1, 1]) { poly(ctx, [[CX + s * 17, eyeY - 16], [CX + s * 20, eyeY - 3], [CX + s * 17, eyeY + 14], [CX + s * 14, eyeY - 3]]); ctx.fill(); }
      break;
    default: break;
  }
  void h; void top;
  ctx.restore();
}

function drawCyberFace(ctx, look, t) {
  const { w, h, eyeY, mouthY, chin, top } = dims(look);
  const a = acc(look, t);
  switch (look.cyber) {
    case "jaw":
      ctx.save(); headPath(ctx, look); ctx.clip();
      part(ctx, () => poly(ctx, [[CX - w, mouthY - 4], [CX - 12, mouthY + 2], [CX - 14, chin + 4], [CX - w, chin + 4]]), "chrome", t, null, [CX - w, mouthY, CX, chin]);
      ctx.fillStyle = a; ctx.fillRect(CX - w + 8, mouthY + 4, 10, 2);
      ctx.restore();
      break;
    case "temple": part(ctx, () => { ctx.beginPath(); ctx.rect(CX + w - 12, eyeY - 26, 10, 16); }, "#3a3f55", t, null); ctx.fillStyle = a; glow(ctx, a, 8); ctx.fillRect(CX + w - 10, eyeY - 22, 6, 2); ctx.fillRect(CX + w - 10, eyeY - 16, 6, 2); noGlow(ctx); break;
    case "antenna": ctx.strokeStyle = "#8a8f9e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX + w - 6, top + 20); ctx.lineTo(CX + w + 14, top - 22); ctx.stroke(); ctx.fillStyle = a; glow(ctx, a, 12); ctx.beginPath(); ctx.arc(CX + w + 14, top - 22, 3.5 + Math.sin(t * 4), 0, TAU); ctx.fill(); noGlow(ctx); break;
    case "halfchrome":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = paint(ctx, "chrome", t, CX, HY - h, CX + w, HY + h); ctx.fillRect(CX + 1, top - 10, w + 10, 2 * h + 20);
      ctx.strokeStyle = "#3a3f55"; ctx.lineWidth = 1; for (let y = top + 14; y < HY + h; y += 13) { ctx.beginPath(); ctx.moveTo(CX + 1, y); ctx.lineTo(CX + w, y + 3); ctx.stroke(); }
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX + 1, top - 10); ctx.lineTo(CX + 1, HY + h + 10); ctx.stroke();
      ctx.restore();
      break;
    case "port": ctx.fillStyle = "#2a2a3a"; ctx.beginPath(); ctx.arc(CX - w + 8, eyeY + 24, 3.5, 0, TAU); ctx.fill(); ctx.strokeStyle = a; ctx.lineWidth = 1.5; ctx.stroke(); break;
    case "cheek": ctx.fillStyle = a; glow(ctx, a, 8); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ctx.fillRect(CX + s * 24 - 1 + i * 3.5 * s, eyeY + 15, 2, 2); noGlow(ctx); break;
    case "skull":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "#ece8dc"; ctx.fillRect(CX - w - 4, mouthY - 3, w, 30);
      ctx.strokeStyle = "#3a3040"; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(CX - 6 - i * 6, mouthY - 2); ctx.lineTo(CX - 6 - i * 6, mouthY + 8); ctx.stroke(); }
      ctx.restore();
      break;
    case "arasaka": ctx.fillStyle = "#ff1a1a"; glow(ctx, "#ff1a1a", 10); for (const s of [-1, 1]) ctx.fillRect(CX + s * (w - 8) - 1.5, eyeY - 4, 3, 14); ctx.beginPath(); ctx.arc(CX, top + 18, 3.5, 0, TAU); ctx.fill(); noGlow(ctx); break;
    default: break;
  }
}

function drawCyberEyes(ctx, look, t) {
  const { w, eyeY } = dims(look);
  const a = acc(look, t);
  switch (look.cyber) {
    case "kiroshi":
      for (const s of [-1, 1]) { ctx.strokeStyle = a; ctx.lineWidth = 1.6; glow(ctx, a, 10); ctx.beginPath(); ctx.arc(CX + s * 17, eyeY + 1, 7, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(CX + s * 17, eyeY + 1, 3.5, t * 3, t * 3 + 4); ctx.stroke(); noGlow(ctx); }
      break;
    case "mantis": {
      part(ctx, () => poly(ctx, [[CX - w - 2, eyeY - 14], [CX + w + 2, eyeY - 14], [CX + w - 3, eyeY + 12], [CX - w + 3, eyeY + 12]]), "#1a1a28", t, null);
      const sweep = (Math.sin(t * 2) + 1) / 2;
      ctx.fillStyle = a; glow(ctx, a, 12); ctx.fillRect(CX - w + 6 + sweep * (2 * w - 24), eyeY - 3, 12, 5); noGlow(ctx);
      break;
    }
    case "eyepatch":
      part(ctx, () => { ctx.beginPath(); ctx.arc(CX + 17, eyeY, 11, 0, TAU); }, "chrome", t, null, [CX + 6, eyeY - 11, CX + 28, eyeY + 11]);
      ctx.fillStyle = "#ff1a1a"; glow(ctx, "#ff1a1a", 14); ctx.beginPath(); ctx.arc(CX + 17, eyeY, 4, 0, TAU); ctx.fill(); noGlow(ctx);
      break;
    default: break;
  }
}

function drawSandevistan(ctx, look, t) {
  if (look.cyber !== "sandevistan") return;
  const a = acc(look, t);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = "#3a3f55"; ctx.fillRect(CX - 9, 150 + i * 8, 18, 6); ctx.fillStyle = a; glow(ctx, a, 12); ctx.fillRect(CX - 6, 152 + i * 8, 12, 2); noGlow(ctx); }
  for (const s of [-1, 1]) { ctx.strokeStyle = a; ctx.lineWidth = 2; glow(ctx, a, 10); ctx.beginPath(); ctx.moveTo(CX + s * 9, 152); ctx.lineTo(CX + s * 40, 138); ctx.stroke(); noGlow(ctx); }
}

/* =====================================================================
   Couvre-chefs, lunettes, boucles
===================================================================== */

function drawHat(ctx, look, t) {
  const { w, h, top } = dims(look);
  const a = acc(look, t);
  const c = look.topColor;
  switch (look.hat) {
    case "cap":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 5, top + 26); ctx.bezierCurveTo(CX - w - 5, top - 24, CX + w + 5, top - 24, CX + w + 5, top + 26); ctx.closePath(); }, c, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX - 16, top + 26, 38, 8, -0.05, 0, Math.PI); ctx.closePath(); }, c, t, null);
      ctx.fillStyle = a; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("MC", CX, top + 10); ctx.textAlign = "start";
      break;
    case "beanie":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 5, top + 26); ctx.bezierCurveTo(CX - w - 8, top - 32, CX + w + 8, top - 32, CX + w + 5, top + 26); ctx.closePath(); }, c, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.rect(CX - w - 6, top + 16, 2 * w + 12, 12); }, look.accentColor, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.arc(CX, top - 18, 8, 0, TAU); }, "#f4f4f8", t, null);
      break;
    case "bandana":
      part(ctx, () => { ctx.beginPath(); ctx.rect(CX - w - 3, top + 20, 2 * w + 6, 10); }, look.accentColor, t, null);
      part(ctx, () => poly(ctx, [[CX + w, top + 22], [CX + w + 18, top + 18 + Math.sin(t * 3) * 3], [CX + w + 15, top + 34], [CX + w, top + 30]]), look.accentColor, t, null);
      break;
    case "cowboy":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, top + 18, w + 36, 10, 0, 0, TAU); }, "#8a5a2b", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w + 4, top + 16); ctx.lineTo(CX - w + 8, top - 24); ctx.quadraticCurveTo(CX, top - 14, CX + w - 8, top - 24); ctx.lineTo(CX + w - 4, top + 16); ctx.closePath(); }, "#8a5a2b", t, null);
      ctx.fillStyle = a; ctx.fillRect(CX - w + 5, top + 6, 2 * w - 10, 5);
      break;
    case "helmet":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, HY - 4, w + 13, h + 12, 0, 0, TAU); }, c, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 6, HY - 8); ctx.quadraticCurveTo(CX, HY - 24, CX + w + 6, HY - 8); ctx.lineTo(CX + w + 2, HY + 18); ctx.quadraticCurveTo(CX, HY + 6, CX - w - 2, HY + 18); ctx.closePath(); }, "#1a1a28", t, null);
      ctx.strokeStyle = a; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(CX - w - 4, HY - 14); ctx.quadraticCurveTo(CX, HY - 30, CX + w + 4, HY - 14); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(CX - 20, HY - 8, 14, 3);
      break;
    case "crown":
    case "blackcrown": {
      const gold = look.hat === "crown";
      if (!gold) glow(ctx, "#ff1a1a", 16);
      part(ctx, () => poly(ctx, [[CX - 30, top + 8], [CX - 33, top - 22], [CX - 16, top - 6], [CX, top - 30], [CX + 16, top - 6], [CX + 33, top - 22], [CX + 30, top + 8]]), gold ? "goldskin" : "#1a0008", t, null, [CX - 30, top - 30, CX + 30, top + 8]);
      noGlow(ctx);
      const gems = gold ? ["#ff2a6d", "#00f0ff", "#3ddc84"] : ["#ff1a1a", "#ff1a1a", "#ff1a1a"];
      [[CX - 20, top - 1], [CX, top - 6], [CX + 20, top - 1]].forEach(([x, y], i) => { ctx.fillStyle = gems[i]; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill(); });
      break;
    }
    case "catears":
      for (const s of [-1, 1]) {
        glow(ctx, a, 10);
        part(ctx, () => poly(ctx, [[CX + s * 14, top + 4], [CX + s * 32, top - 26], [CX + s * 38, top + 12]]), "#1c1c28", t, null);
        noGlow(ctx);
        ctx.fillStyle = a; poly(ctx, [[CX + s * 20, top + 2], [CX + s * 31, top - 16], [CX + s * 34, top + 8]]); ctx.fill();
      }
      break;
    case "halo": ctx.strokeStyle = "#fff0a0"; ctx.lineWidth = 4; glow(ctx, "#fff0a0", 16); ctx.beginPath(); ctx.ellipse(CX, top - 18 + Math.sin(t * 2) * 3, 28, 7, 0, 0, TAU); ctx.stroke(); noGlow(ctx); break;
    case "horns":
      for (const s of [-1, 1]) part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX + s * 18, top + 12); ctx.quadraticCurveTo(CX + s * 46, top - 6, CX + s * 40, top - 36); ctx.quadraticCurveTo(CX + s * 34, top - 6, CX + s * 9, top + 18); ctx.closePath(); }, "#3a0a14", t, null);
      break;
    case "netrunner":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, HY - 8, w + 6, h + 2, 0, Math.PI, 0); ctx.lineTo(CX + w + 6, HY - 2); ctx.lineTo(CX - w - 6, HY - 2); ctx.closePath(); }, "#1c1c2c", t, null);
      ctx.strokeStyle = a; ctx.lineWidth = 1.6; glow(ctx, a, 10);
      for (let i = 0; i < 5; i++) { const an = Math.PI * (1.15 + i * 0.17); ctx.beginPath(); ctx.moveTo(CX + Math.cos(an) * (w - 4), HY - 8 + Math.sin(an) * (h - 6)); ctx.lineTo(CX + Math.cos(an) * (w + 4), HY - 8 + Math.sin(an) * (h + 2)); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(CX - w - 2, HY - 6); ctx.lineTo(CX + w + 2, HY - 6); ctx.stroke(); noGlow(ctx);
      break;
    case "straw":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, top + 16, w + 38, 12, 0, 0, TAU); }, "#ecd07a", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, top + 4, w - 2, 20, 0, Math.PI, 0); ctx.closePath(); }, "#ecd07a", t, null);
      ctx.fillStyle = "#c8102e"; ctx.fillRect(CX - w + 2, top + 6, 2 * w - 4, 6);
      break;
    case "wizard":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, top + 18, w + 26, 9, 0, 0, TAU); }, c, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w + 2, top + 16); ctx.quadraticCurveTo(CX + 8, top - 30, CX + 40 + Math.sin(t) * 4, top - 62); ctx.quadraticCurveTo(CX + 16, top - 22, CX + w - 2, top + 16); ctx.closePath(); }, c, t, null);
      ctx.fillStyle = "#fff0a0"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(CX - 8 + i * 10, top - 6 - i * 8, 2, 0, TAU); ctx.fill(); }
      break;
    case "hood":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 16, HY + 52); ctx.bezierCurveTo(CX - w - 24, top - 32, CX + w + 24, top - 32, CX + w + 16, HY + 52); ctx.lineTo(CX + w + 3, HY + 30); ctx.bezierCurveTo(CX + w + 5, top - 2, CX - w - 5, top - 2, CX - w - 3, HY + 30); ctx.closePath(); }, c, t, null);
      break;
    case "fishhat":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 18, top + 26); ctx.lineTo(CX - w + 2, top - 4); ctx.quadraticCurveTo(CX, top - 20, CX + w - 2, top - 4); ctx.lineTo(CX + w + 18, top + 26); ctx.closePath(); }, "#5a7a4a", t, null);
      ctx.fillStyle = "#e8c547"; ctx.beginPath(); ctx.ellipse(CX + 18, top + 4, 6, 3, 0.3, 0, TAU); ctx.fill();
      break;
    default: break;
  }
}

function drawGlasses(ctx, look, t) {
  const { w, eyeY, mouthY, chin } = dims(look);
  const a = acc(look, t);
  const frame = "#2a2232";
  const lens = (fill, r = 11) => {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(CX + s * 17, eyeY + 1, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = frame; ctx.lineWidth = 1.8; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(CX - 6, eyeY - 1); ctx.lineTo(CX + 6, eyeY - 1); ctx.stroke();
  };
  switch (look.glasses) {
    case "round": lens("rgba(200,230,255,0.15)"); break;
    case "aviator":
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 5, eyeY - 7); ctx.lineTo(CX + s * 28, eyeY - 8); ctx.quadraticCurveTo(CX + s * 28, eyeY + 13, CX + s * 15, eyeY + 12); ctx.quadraticCurveTo(CX + s * 3, eyeY + 8, CX + s * 5, eyeY - 7); ctx.fillStyle = "rgba(70,40,20,0.8)"; ctx.fill(); ctx.strokeStyle = "#c8a04a"; ctx.lineWidth = 1.5; ctx.stroke(); }
      break;
    case "visor":
      glow(ctx, a, 14);
      part(ctx, () => poly(ctx, [[CX - w - 3, eyeY - 13], [CX + w + 3, eyeY - 13], [CX + w, eyeY + 12], [CX - w, eyeY + 12]]), look.accentColor, t, null);
      noGlow(ctx);
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(CX - w + 5, eyeY - 6, 2 * w - 10, 2);
      break;
    case "shades":
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(CX + s * 17 - 13.5, eyeY - 11, 27, 22); ctx.fillStyle = "#0c0a14"; ctx.fill(); ctx.strokeStyle = frame; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(CX + s * 17 - 9, eyeY - 4, 6, 1.5); }
      ctx.beginPath(); ctx.moveTo(CX - 5, eyeY - 3); ctx.lineTo(CX + 5, eyeY - 3); ctx.stroke();
      break;
    case "mask":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w + 6, HY + 18); ctx.quadraticCurveTo(CX, HY + 10, CX + w - 6, HY + 18); ctx.lineTo(CX + w - 12, chin - 4); ctx.quadraticCurveTo(CX, chin + 6, CX - w + 12, chin - 4); ctx.closePath(); }, "#2e3240", t, null);
      for (const s of [-1, 1]) { part(ctx, () => { ctx.beginPath(); ctx.arc(CX + s * 17, mouthY + 2, 6.5, 0, TAU); }, "#4a4f5e", t, null); ctx.fillStyle = a; ctx.fillRect(CX + s * 17 - 3, mouthY + 1, 6, 2); }
      break;
    case "oni":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "#c01828"; ctx.fillRect(CX - w - 4, HY - 34, 2 * w + 8, 120);
      ctx.fillStyle = "#0a0a0a"; for (const s of [-1, 1]) { poly(ctx, [[CX + s * 6, eyeY - 5], [CX + s * 28, eyeY - 10], [CX + s * 25, eyeY + 7], [CX + s * 8, eyeY + 5]]); ctx.fill(); }
      ctx.fillStyle = "#fcee0a"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(CX + s * 17, eyeY - 1, 2.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#fff"; ctx.fillRect(CX - 13, mouthY - 2, 26, 6);
      ctx.restore();
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 14, HY - 38], [CX + s * 26, HY - 70], [CX + s * 30, HY - 34]]), "#f0e8d0", t, null);
      break;
    case "bandana":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - w - 1, HY + 18); ctx.lineTo(CX + w + 1, HY + 18); ctx.lineTo(CX + w - 8, chin - 2); ctx.lineTo(CX, chin + 16); ctx.lineTo(CX - w + 8, chin - 2); ctx.closePath(); }, look.accentColor, t, null);
      break;
    case "monocle":
      ctx.beginPath(); ctx.arc(CX + 17, eyeY + 1, 11, 0, TAU); ctx.fillStyle = "rgba(200,230,255,0.2)"; ctx.fill(); ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX + 25, eyeY + 9); ctx.quadraticCurveTo(CX + 33, eyeY + 40, CX + 26, eyeY + 64); ctx.stroke();
      break;
    case "goggles":
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(CX - w - 3, eyeY - 4, 2 * w + 6, 8);
      for (const s of [-1, 1]) { part(ctx, () => { ctx.beginPath(); ctx.arc(CX + s * 17, eyeY + 1, 12, 0, TAU); }, "#6a5a4a", t, null); ctx.beginPath(); ctx.arc(CX + s * 17, eyeY + 1, 8, 0, TAU); ctx.fillStyle = "rgba(40,80,50,0.85)"; ctx.fill(); }
      break;
    case "vr":
      part(ctx, () => { ctx.beginPath(); ctx.rect(CX - w - 2, eyeY - 15, 2 * w + 4, 28); }, "#1c1c2c", t, null);
      ctx.fillStyle = a; glow(ctx, a, 12); ctx.fillRect(CX - w + 5, eyeY - 8, 2 * w - 10, 3); noGlow(ctx);
      break;
    case "kitsune":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "#faf6ee"; ctx.beginPath(); ctx.moveTo(CX - w - 4, HY - 40); ctx.lineTo(CX + w + 4, HY - 40); ctx.lineTo(CX + w + 4, HY + 22); ctx.lineTo(CX, HY + 56); ctx.lineTo(CX - w - 4, HY + 22); ctx.fill();
      ctx.fillStyle = "#d01838"; for (const s of [-1, 1]) { poly(ctx, [[CX + s * 7, eyeY + 2], [CX + s * 27, eyeY - 8], [CX + s * 24, eyeY + 4]]); ctx.fill(); ctx.fillRect(CX + s * 24 - 1.5, eyeY + 12, 3, 8); }
      ctx.restore();
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[CX + s * 16, HY - 44], [CX + s * 34, HY - 78], [CX + s * 38, HY - 36]]), "#faf6ee", t, null);
      break;
    case "hacker":
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(CX + s * 17 - 13.5, eyeY - 11, 27, 22); ctx.fillStyle = "rgba(0,24,12,0.88)"; ctx.fill(); ctx.strokeStyle = frame; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = "#3ddc84"; ctx.font = "6px monospace";
      for (const s of [-1, 1]) for (let r = 0; r < 3; r++) ctx.fillText(hash(r + s + Math.floor(t * 5)) > 0.5 ? "1010" : "0110", CX + s * 17 - 10, eyeY - 4 + r * 6);
      break;
    case "skull":
      ctx.save(); headPath(ctx, look); ctx.clip();
      ctx.fillStyle = "#ece8dc"; ctx.fillRect(CX - w - 4, HY - 70, 2 * w + 8, 160);
      ctx.fillStyle = "#1c1424"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * 17, eyeY, 11, 10, 0, 0, TAU); ctx.fill(); }
      poly(ctx, [[CX, eyeY + 12], [CX + 5, eyeY + 22], [CX - 5, eyeY + 22]]); ctx.fill();
      ctx.fillRect(CX - 14, mouthY - 2, 28, 9); ctx.fillStyle = "#ece8dc"; for (let i = 0; i < 6; i++) ctx.fillRect(CX - 13 + i * 4.6, mouthY - 1, 3, 7);
      ctx.fillStyle = "#ff1a1a"; glow(ctx, "#ff1a1a", 10); for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(CX + s * 17, eyeY, 2.5, 0, TAU); ctx.fill(); } noGlow(ctx);
      ctx.restore();
      break;
    case "scuba":
      ctx.beginPath(); ctx.ellipse(CX, eyeY + 1, w + 2, 16, 0, 0, TAU); ctx.fillStyle = "rgba(150,220,255,0.3)"; ctx.fill(); ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(CX + 10, mouthY); ctx.quadraticCurveTo(CX + 26, mouthY + 6, CX + w + 8, HY - 30); ctx.stroke();
      break;
    default: break;
  }
}

function drawEarrings(ctx, look, t) {
  const { w } = dims(look);
  const a = acc(look, t);
  for (const s of [-1, 1]) {
    const x = CX + s * (w - 1);
    const y = HY + 17;
    switch (look.ears) {
      case "stud": ctx.fillStyle = "#eeeef6"; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); break;
      case "hoop": ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y + 6, 6, 0, TAU); ctx.stroke(); break;
      case "cross": ctx.fillStyle = "#c8c8d0"; ctx.fillRect(x - 1, y, 2, 12); ctx.fillRect(x - 3.5, y + 3, 7, 2); break;
      case "neon": ctx.strokeStyle = a; ctx.lineWidth = 1.5; glow(ctx, a, 10); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 13 + Math.sin(t * 3 + s) * 2); ctx.stroke(); ctx.fillStyle = a; ctx.beginPath(); ctx.arc(x, y + 15, 2.5, 0, TAU); ctx.fill(); noGlow(ctx); break;
      case "cyber": part(ctx, () => { ctx.beginPath(); ctx.rect(x - 5, y - 13, 10, 16); }, "#2e3240", t, null); ctx.fillStyle = a; ctx.fillRect(x - 2, y - 8, 4, 4); break;
      case "feather": ctx.fillStyle = s === 1 ? "#ff8a1f" : "#3ddc84"; ctx.beginPath(); ctx.ellipse(x, y + 13, 3, 9, s * 0.2, 0, TAU); ctx.fill(); break;
      case "pearl": ctx.fillStyle = "#faf6ff"; ctx.beginPath(); ctx.arc(x, y + 4, 3.2, 0, TAU); ctx.fill(); ctx.strokeStyle = "#c8c8d8"; ctx.lineWidth = 0.8; ctx.stroke(); break;
      default: break;
    }
  }
}

/* =====================================================================
   Dos : ailes, cape, fourreau, jetpack…
===================================================================== */

function wing(ctx, s, t, color, feathers, span = 120, rise = 0) {
  const f = Math.sin(t * 2.2) * 6;
  const x0 = CX + s * 14;
  const y0 = 196;
  part(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + s * span * 0.5, y0 - 90 - rise - f, x0 + s * span, y0 - 70 - rise - f);
    for (let i = 0; i < feathers; i++) {
      const k = (i + 1) / feathers;
      ctx.lineTo(x0 + s * span * (1 - k * 0.75) + s * 6, y0 - 70 + k * 120 - rise * (1 - k) - f * (1 - k));
      ctx.lineTo(x0 + s * span * (1 - k * 0.75) - s * 4, y0 - 76 + k * 120 - rise * (1 - k) - f * (1 - k));
    }
    ctx.lineTo(x0 + s * 6, y0 + 50);
    ctx.closePath();
  }, color, t, () => { ctx.beginPath(); ctx.ellipse(x0 + s * span * 0.35, y0 + 20, span * 0.4, 40, 0, 0, TAU); ctx.fill(); });
}

function drawBack(ctx, look, t) {
  const a = acc(look, t);
  switch (look.back) {
    case "angel": for (const s of [-1, 1]) wing(ctx, s, t, "#fbfaff", 6, 118, 10); break;
    case "demon":
      for (const s of [-1, 1]) {
        const f = Math.sin(t * 2.2) * 6;
        part(ctx, () => {
          const x0 = CX + s * 14;
          ctx.beginPath(); ctx.moveTo(x0, 196); ctx.lineTo(x0 + s * 110, 110 - f);
          for (let i = 0; i < 4; i++) { const k = (i + 1) / 4; ctx.quadraticCurveTo(x0 + s * (110 - k * 80 + 6), 150 - f * (1 - k) + k * 30, x0 + s * (110 - k * 90), 120 - f * (1 - k) + k * 110); }
          ctx.closePath();
        }, "#4a0a24", t, null);
        ctx.strokeStyle = "#1c0010"; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const k = (i + 1) / 4; ctx.beginPath(); ctx.moveTo(CX + s * 14, 196); ctx.lineTo(CX + s * (14 + 110 - k * 90), 120 + k * 110); ctx.stroke(); }
      }
      break;
    case "mech":
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const an = -0.9 + i * 0.32 + Math.sin(t * 2 + i) * 0.04;
        ctx.save(); ctx.translate(CX + s * 16, 196); ctx.scale(s, 1); ctx.rotate(an);
        part(ctx, () => poly(ctx, [[0, -5], [100 - i * 12, -9], [108 - i * 12, 0], [100 - i * 12, 6], [0, 5]]), "chrome", t, null, [0, -9, 100, 6]);
        ctx.fillStyle = a; glow(ctx, a, 8); ctx.fillRect(70 - i * 12, -2, 24, 3); noGlow(ctx);
        ctx.restore();
      }
      break;
    case "cape":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(CX - 40, 172); ctx.quadraticCurveTo(CX - 78 + Math.sin(t) * 4, 300, CX - 70, 404); ctx.quadraticCurveTo(CX, 414, CX + 70, 404); ctx.quadraticCurveTo(CX + 78 + Math.sin(t + 1) * 4, 300, CX + 40, 172); ctx.closePath(); }, look.accentColor, t, () => { ctx.fillRect(CX, 0, 100, AV_H); });
      break;
    case "butterfly":
      for (const s of [-1, 1]) {
        const f = Math.sin(t * 3) * 0.12 + 1;
        ctx.save(); ctx.translate(CX + s * 12, 200); ctx.scale(s * f, 1);
        ctx.globalAlpha = 0.85;
        part(ctx, () => { ctx.beginPath(); ctx.ellipse(52, -46, 56, 40, -0.5, 0, TAU); }, look.accentColor, t, null);
        part(ctx, () => { ctx.beginPath(); ctx.ellipse(40, 30, 34, 26, 0.5, 0, TAU); }, look.accentColor, t, null);
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(70, -56, 10, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      break;
    case "sheath":
      ctx.save(); ctx.translate(CX, 230); ctx.rotate(-0.7);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-5, -110, 10, 170); }, "#1c1424", t, null);
      ctx.fillStyle = "#c8102e"; for (let i = 0; i < 6; i++) ctx.fillRect(-5, -128 - i * 7, 10, 4);
      ctx.fillStyle = "#e8c547"; ctx.fillRect(-9, -112, 18, 4);
      ctx.restore();
      break;
    case "jetpack":
      part(ctx, () => { ctx.beginPath(); ctx.rect(CX - 40, 186, 80, 14); }, "#3a3f55", t, null);
      for (const s of [-1, 1]) {
        const x = CX + s * 52;
        part(ctx, () => { ctx.beginPath(); ctx.moveTo(x - 11, 176); ctx.lineTo(x + 11, 176); ctx.lineTo(x + 11, 238); ctx.lineTo(x + 7, 246); ctx.lineTo(x - 7, 246); ctx.lineTo(x - 11, 238); ctx.closePath(); }, "#5a5f75", t, null);
        ctx.fillStyle = a; glow(ctx, a, 8); ctx.fillRect(x - 6, 186, 12, 3); noGlow(ctx);
        const fl = 34 + Math.sin(t * 30 + s) * 8;
        const g = ctx.createLinearGradient(0, 246, 0, 246 + fl);
        g.addColorStop(0, "#fff4c0"); g.addColorStop(0.4, "#ff9a3d"); g.addColorStop(1, "rgba(255,80,30,0)");
        ctx.fillStyle = g; poly(ctx, [[x - 7, 246], [x + 7, 246], [x, 246 + fl]]); ctx.fill();
      }
      break;
    case "ring":
      ctx.strokeStyle = "#fff0a0"; ctx.lineWidth = 5; glow(ctx, "#ffd060", 20);
      ctx.beginPath(); ctx.arc(CX, 120, 92, 0, TAU); ctx.stroke(); noGlow(ctx);
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU + t * 0.3; ctx.fillStyle = "#fff0a0"; ctx.beginPath(); ctx.arc(CX + Math.cos(an) * 92, 120 + Math.sin(an) * 92, 4, 0, TAU); ctx.fill(); }
      break;
    case "fairy":
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(CX + s * 10, 200); ctx.scale(s, 1); ctx.rotate(Math.sin(t * 6) * 0.08);
        ctx.globalAlpha = 0.6;
        part(ctx, () => { ctx.beginPath(); ctx.ellipse(40, -40, 46, 16, -0.7, 0, TAU); }, "#c8f4ff", t, null);
        part(ctx, () => { ctx.beginPath(); ctx.ellipse(30, 20, 34, 12, 0.6, 0, TAU); }, "#c8f4ff", t, null);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      break;
    case "dragon": for (const s of [-1, 1]) wing(ctx, s, t, "#2a6a4a", 4, 130, 20); break;
    case "data":
      for (const s of [-1, 1]) for (let i = 0; i < 16; i++) {
        const k = i / 16;
        const x = CX + s * (20 + k * 110);
        const y = 200 - Math.sin(k * Math.PI) * 90 + Math.sin(t * 3 + i) * 4;
        ctx.fillStyle = `rgba(255,40,60,${0.4 + 0.6 * hash(i + Math.floor(t * 6))})`;
        ctx.fillRect(x, y, 8, 8);
        ctx.fillRect(x, y + 14 + k * 30, 5, 5);
      }
      break;
    default: break;
  }
}

/* =====================================================================
   Armes (dans la main gauche de l'écran) et familiers
===================================================================== */

function drawWeapon(ctx, look, t) {
  if (look.weapon === "none") return;
  const a = acc(look, t);
  const [hx, hy] = handPos(look, -1);
  ctx.save();
  ctx.translate(hx, hy);
  switch (look.weapon) {
    case "katana":
      ctx.rotate(-0.35);
      part(ctx, () => poly(ctx, [[-2, -6], [2, -6], [3, -150], [0, -160], [-3, -150]]), "chrome", t, null, [-3, -160, 3, -6]);
      ctx.fillStyle = "#e8c547"; ctx.fillRect(-7, -8, 14, 4);
      ctx.fillStyle = "#1c1424"; ctx.fillRect(-3, -4, 6, 26);
      ctx.fillStyle = "#c8102e"; for (let i = 0; i < 4; i++) ctx.fillRect(-3, 0 + i * 6, 6, 2);
      break;
    case "pistol":
      ctx.scale(-1, 1);
      ctx.rotate(0.35);
      part(ctx, () => poly(ctx, [[-5, 8], [5, 8], [8, -6], [44, -6], [44, -18], [-8, -18], [-8, -6]]), "#6a6f85", t, null);
      ctx.fillStyle = "#3a3f55"; ctx.fillRect(30, -15, 14, 6);
      ctx.fillStyle = a; glow(ctx, a, 8); ctx.fillRect(4, -16, 24, 2.5); noGlow(ctx);
      break;
    case "sword":
      ctx.rotate(-0.15);
      part(ctx, () => poly(ctx, [[-4, -10], [4, -10], [4, -110], [0, -124], [-4, -110]]), "chrome", t, null, [-4, -124, 4, -10]);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-16, -12, 32, 5); }, "#e8c547", t, null);
      ctx.fillStyle = "#6a3a1a"; ctx.fillRect(-3, -7, 6, 20);
      ctx.fillStyle = "#e8c547"; ctx.beginPath(); ctx.arc(0, 15, 4, 0, TAU); ctx.fill();
      break;
    case "staff":
      ctx.strokeStyle = "#6a3a1a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(0, -140); ctx.stroke();
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -150, 12, 0, TAU); ctx.stroke();
      ctx.fillStyle = a; glow(ctx, a, 16); ctx.beginPath(); ctx.arc(0, -150, 7 + Math.sin(t * 3), 0, TAU); ctx.fill(); noGlow(ctx);
      break;
    case "mantis":
      ctx.restore(); ctx.save();
      for (const s of [-1, 1]) {
        const [, e, w] = armPts(look, s);
        ctx.save(); ctx.translate((e[0] + w[0]) / 2 + s * 6, (e[1] + w[1]) / 2); ctx.rotate(s * -0.55);
        glow(ctx, a, 10);
        part(ctx, () => poly(ctx, [[0, -6], [s * 9, 4], [s * 16, 92], [s * 5, 100]]), "chrome", t, null, [-16, -6, 16, 100]);
        noGlow(ctx);
        ctx.strokeStyle = a; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s * 6, 6); ctx.lineTo(s * 12, 88); ctx.stroke();
        ctx.restore();
      }
      break;
    case "bow":
      ctx.rotate(-0.1);
      ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(30, -10, 70, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke();
      ctx.strokeStyle = "#f4f4f8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30 + Math.cos(Math.PI * 0.7) * 70, -10 + Math.sin(Math.PI * 0.7) * 70); ctx.lineTo(30 + Math.cos(Math.PI * 1.3) * 70, -10 + Math.sin(Math.PI * 1.3) * 70); ctx.stroke();
      break;
    case "scythe":
      ctx.strokeStyle = "#2a1a1a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(4, 70); ctx.lineTo(-6, -150); ctx.stroke();
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(-6, -150); ctx.quadraticCurveTo(-60, -170, -96, -120); ctx.quadraticCurveTo(-60, -150, -6, -138); ctx.closePath(); }, "chrome", t, null, [-96, -170, -6, -120]);
      ctx.strokeStyle = a; ctx.lineWidth = 1.5; glow(ctx, a, 10); ctx.beginPath(); ctx.moveTo(-10, -146); ctx.quadraticCurveTo(-58, -162, -90, -124); ctx.stroke(); noGlow(ctx);
      break;
    case "rifle":
      ctx.rotate(-1.1);
      part(ctx, () => poly(ctx, [[-30, -6], [70, -6], [70, 2], [20, 2], [16, 14], [6, 14], [8, 2], [-30, 6]]), "#2e3240", t, null);
      ctx.fillStyle = a; ctx.fillRect(10, -4, 40, 2);
      ctx.fillStyle = "#1c1424"; ctx.fillRect(70, -4, 18, 3);
      break;
    case "shield":
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(-34, -40); ctx.lineTo(10, -40); ctx.lineTo(10, 10); ctx.quadraticCurveTo(-12, 40, -12, 44); ctx.quadraticCurveTo(-12, 40, -34, 10); ctx.closePath(); }, "chrome", t, null, [-34, -40, 10, 44]);
      ctx.fillStyle = look.accentColor === "holo" ? a : flat(look.accentColor, t); ctx.fillRect(-15, -30, 6, 56); ctx.fillRect(-28, -10, 32, 6);
      break;
    case "tome":
      ctx.rotate(-0.15);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-6, -40, 34, 44); }, "#5a1a3a", t, null);
      ctx.fillStyle = "#f4ecd8"; ctx.fillRect(26, -38, 3, 40);
      ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 1.5; ctx.strokeRect(-1, -35, 24, 34);
      ctx.fillStyle = a; glow(ctx, a, 12); ctx.beginPath(); ctx.arc(11, -18, 5, 0, TAU); ctx.fill(); noGlow(ctx);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba("#ffffff", 0.6); ctx.font = "9px serif"; ctx.fillText("✦", 30 + i * 6, -50 - ((t * 20 + i * 12) % 40)); }
      break;
    case "energy":
    case "godblade": {
      const god = look.weapon === "godblade";
      const col = god ? "#fff0a0" : a;
      ctx.rotate(-0.25);
      glow(ctx, col, 20);
      ctx.fillStyle = col; poly(ctx, [[-3.5, -10], [3.5, -10], [4, -140], [0, -154], [-4, -140]]); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(-1, -140, 2, 128);
      noGlow(ctx);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-10, -12, 20, 5); }, god ? "goldskin" : "#3a3f55", t, null, [-10, -12, 10, -7]);
      ctx.fillStyle = god ? "#e8c547" : "#2e3240"; ctx.fillRect(-3, -7, 6, 22);
      if (god) for (let i = 0; i < 5; i++) { const y = -30 - ((t * 60 + i * 26) % 120); ctx.fillStyle = "rgba(255,240,160,0.8)"; ctx.fillRect(6 + Math.sin(i + t * 3) * 4, y, 2, 2); }
      break;
    }
    case "wand":
      ctx.rotate(-0.5);
      ctx.strokeStyle = "#f4f4f8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -44); ctx.stroke();
      ctx.fillStyle = "#fcee0a"; glow(ctx, "#fcee0a", 12);
      poly(ctx, [[0, -60], [3, -51], [12, -51], [5, -46], [8, -37], [0, -42], [-8, -37], [-5, -46], [-12, -51], [-3, -51]]); ctx.fill(); noGlow(ctx);
      break;
    case "deck":
      ctx.rotate(0.1);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-20, -16, 40, 26); }, "#1c1c2c", t, null);
      ctx.fillStyle = a; glow(ctx, a, 10); ctx.fillRect(-15, -11, 30, 10); noGlow(ctx);
      ctx.fillStyle = "#3ddc84"; ctx.font = "6px monospace"; ctx.fillText(hash(Math.floor(t * 4)) > 0.5 ? "BREACH" : "ACCESS", -14, -3);
      break;
    default: break;
  }
  ctx.restore();
}

function drawPet(ctx, look, t) {
  if (look.pet === "none") return;
  const a = acc(look, t);
  const x = CX + 112;
  const y = 246 + Math.sin(t * 2) * 6;
  ctx.save();
  ctx.translate(x, y);
  const eye = (ex, ey, r = 2.4, col = "#1c1424") => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex - 0.8, ey - 0.9, r * 0.35, 0, TAU); ctx.fill(); };
  // ombre au sol
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 150 - Math.sin(t * 2) * 6, 16, 4, 0, 0, TAU); ctx.fill();
  switch (look.pet) {
    case "cat":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 10, 16, 13, 0, 0, TAU); }, "#24202c", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.arc(0, -8, 13, 0, TAU); }, "#24202c", t, null);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[s * 4, -18], [s * 12, -28], [s * 13, -12]]), "#24202c", t, null);
      ctx.strokeStyle = "#24202c"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(14, 14); ctx.quadraticCurveTo(28, 6 + Math.sin(t * 3) * 6, 24, -6); ctx.stroke();
      eye(-5, -8, 2.6, "#fcee0a"); eye(5, -8, 2.6, "#fcee0a");
      ctx.fillStyle = a; ctx.fillRect(-9, 2, 18, 3);
      break;
    case "drone":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 0, 18, 10, 0, 0, TAU); }, "#3a3f55", t, null);
      for (const s of [-1, 1]) { ctx.strokeStyle = "#8a8f9e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s * 14, -4); ctx.lineTo(s * 24, -10); ctx.stroke(); ctx.fillStyle = "rgba(200,220,255,0.5)"; ctx.beginPath(); ctx.ellipse(s * 24, -12, 12 * Math.abs(Math.sin(t * 30)), 2, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = a; glow(ctx, a, 10); ctx.beginPath(); ctx.arc(0, 1, 4, 0, TAU); ctx.fill(); noGlow(ctx);
      break;
    case "slime": {
      const sq = 1 + Math.sin(t * 4) * 0.08;
      ctx.scale(1 / sq, sq);
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(-20, 14); ctx.quadraticCurveTo(-22, -16, 0, -18); ctx.quadraticCurveTo(22, -16, 20, 14); ctx.closePath(); }, "#5ae08a", t, null);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.ellipse(-8, -8, 4, 6, -0.4, 0, TAU); ctx.fill();
      eye(-6, 0); eye(6, 0);
      break;
    }
    case "fox":
      ctx.globalAlpha = 0.95;
      for (let i = 0; i < 3; i++) part(ctx, () => { ctx.beginPath(); ctx.ellipse(14 + i * 4, 10 - i * 8, 16, 6, -0.6 + i * 0.4 + Math.sin(t * 3 + i) * 0.1, 0, TAU); }, "#ffb066", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 8, 13, 11, 0, 0, TAU); }, "#ff9a3d", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(0, 6); ctx.lineTo(12, -6); ctx.lineTo(8, -18); ctx.lineTo(-8, -18); ctx.closePath(); }, "#ff9a3d", t, null);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[s * 4, -16], [s * 11, -28], [s * 12, -12]]), "#ff9a3d", t, null);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, 0, 6, 5, 0, 0, TAU); ctx.fill();
      eye(-5, -8, 2); eye(5, -8, 2);
      ctx.fillStyle = "#9be7ff"; glow(ctx, "#9be7ff", 10); ctx.beginPath(); ctx.arc(22, -16 + Math.sin(t * 4) * 3, 3, 0, TAU); ctx.fill(); noGlow(ctx);
      ctx.globalAlpha = 1;
      break;
    case "dragon":
      for (const s of [-1, 1]) part(ctx, () => { ctx.beginPath(); ctx.moveTo(s * 6, 0); ctx.quadraticCurveTo(s * 24, -26 - Math.sin(t * 6) * 6, s * 30, -10); ctx.lineTo(s * 8, 8); ctx.closePath(); }, "#4ab07a", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 6, 12, 14, 0, 0, TAU); }, "#5ac88a", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, -14, 12, 10, 0, 0, TAU); }, "#5ac88a", t, null);
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[s * 4, -22], [s * 8, -32], [s * 10, -20]]), "#f4e8c8", t, null);
      ctx.fillStyle = "#f4e8c8"; ctx.beginPath(); ctx.ellipse(0, 10, 6, 8, 0, 0, TAU); ctx.fill();
      eye(-4, -15, 2.2, "#c8102e"); eye(4, -15, 2.2, "#c8102e");
      break;
    case "ghost":
      ctx.globalAlpha = 0.85;
      part(ctx, () => { ctx.beginPath(); ctx.arc(0, -4, 15, Math.PI, 0); for (let i = 0; i <= 4; i++) ctx.lineTo(15 - i * 7.5, 16 + (i % 2 ? -4 : 0) + Math.sin(t * 5 + i) * 2); ctx.closePath(); }, "#f4f0ff", t, null);
      eye(-5, -4); eye(5, -4);
      ctx.fillStyle = "rgba(255,120,150,0.5)"; ctx.beginPath(); ctx.ellipse(-8, 3, 3, 1.5, 0, 0, TAU); ctx.ellipse(8, 3, 3, 1.5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "phoenix":
      glow(ctx, "#ff8a1f", 16);
      for (const s of [-1, 1]) part(ctx, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 26, -30 - Math.sin(t * 6) * 8, s * 36, -16); ctx.quadraticCurveTo(s * 22, -8, s * 30, 4); ctx.closePath(); }, "#ff6a1f", t, null);
      noGlow(ctx);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 0, 9, 12, 0, 0, TAU); }, "#ffb030", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.arc(0, -14, 7, 0, TAU); }, "#ffb030", t, null);
      ctx.fillStyle = "#fcee0a"; poly(ctx, [[0, -12], [7, -10], [0, -8]]); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = "#ff4a1a"; poly(ctx, [[-4 + i * 4, 10], [-2 + i * 4, 30 + Math.sin(t * 5 + i) * 4], [i * 4, 10]]); ctx.fill(); }
      eye(-2, -15, 1.6);
      break;
    case "owl":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 4, 15, 18, 0, 0, TAU); }, "#8a6a4a", t, null);
      ctx.fillStyle = "#e8d8b8"; ctx.beginPath(); ctx.ellipse(0, 10, 9, 10, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s * 6, -6, 6, 0, TAU); ctx.fill(); eye(s * 6, -6, 3, "#1c1424"); }
      ctx.fillStyle = "#e8a030"; poly(ctx, [[-2, -1], [2, -1], [0, 4]]); ctx.fill();
      for (const s of [-1, 1]) part(ctx, () => poly(ctx, [[s * 7, -15], [s * 13, -22], [s * 12, -11]]), "#8a6a4a", t, null);
      break;
    case "fairy":
      ctx.globalAlpha = 0.6; ctx.fillStyle = "#c8f4ff";
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 10, -6, 12 * (1 + Math.sin(t * 20) * 0.2), 6, s * -0.5, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 6, 4, 9, 0, 0, TAU); }, look.accentColor, t, null);
      part(ctx, () => { ctx.beginPath(); ctx.arc(0, -6, 5.5, 0, TAU); }, "#fbe6d8", t, null);
      ctx.fillStyle = "#fcee0a"; glow(ctx, "#fcee0a", 14); ctx.beginPath(); ctx.arc(0, -6, 2, 0, TAU); ctx.globalAlpha = 0.2; ctx.arc(0, 0, 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; noGlow(ctx);
      break;
    case "robot":
      part(ctx, () => { ctx.beginPath(); ctx.rect(-13, -2, 26, 22); }, "#8a8f9e", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.rect(-11, -22, 22, 18); }, "#a8adbc", t, null);
      ctx.fillStyle = "#1c1424"; ctx.fillRect(-8, -18, 16, 8);
      ctx.fillStyle = a; glow(ctx, a, 8); ctx.fillRect(-6, -16, 4, 4); ctx.fillRect(2, -16, 4, 4); noGlow(ctx);
      ctx.strokeStyle = "#8a8f9e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -30); ctx.stroke();
      ctx.fillStyle = Math.floor(t * 2) % 2 ? "#ff2a2a" : "#3ddc84"; ctx.beginPath(); ctx.arc(0, -31, 2.5, 0, TAU); ctx.fill();
      break;
    case "fish":
      ctx.rotate(Math.sin(t * 1.5) * 0.15);
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 0, 18, 16, 0, 0, TAU); }, "#b8c8e0", t, null);
      part(ctx, () => poly(ctx, [[16, 0], [28, -10], [28, 10]]), "#b8c8e0", t, null);
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(2 + i * 4, 0, 10 - i * 2, -1, 1); ctx.stroke(); }
      eye(-9, -3, 2.6);
      break;
    case "chick":
      part(ctx, () => { ctx.beginPath(); ctx.ellipse(0, 6, 13, 12, 0, 0, TAU); }, "#ffe066", t, null);
      part(ctx, () => { ctx.beginPath(); ctx.arc(0, -10, 9, 0, TAU); }, "#ffe066", t, null);
      ctx.fillStyle = "#ff9a3d"; poly(ctx, [[-1, -9], [-8, -7], [-1, -5]]); ctx.fill();
      eye(-3, -12, 1.8);
      ctx.fillStyle = "#ffd030"; ctx.beginPath(); ctx.ellipse(6, 4, 6, 4, 0.5 + Math.sin(t * 8) * 0.3, 0, TAU); ctx.fill();
      break;
    default: break;
  }
  ctx.restore();
}

/* =====================================================================
   Cadre et bandeau
===================================================================== */

function drawFrame(ctx, look, t, name, title) {
  const a = flat(look.accentColor, t);
  const W = AV_W;
  const H = AV_H;
  // bandeau du bas
  const by = H - 50;
  const g = ctx.createLinearGradient(0, by, 0, H);
  g.addColorStop(0, "rgba(5,5,10,0)"); g.addColorStop(0.35, "rgba(5,5,10,0.85)"); g.addColorStop(1, "rgba(5,5,10,0.95)");
  ctx.fillStyle = g; ctx.fillRect(0, by - 20, W, 70);
  ctx.textAlign = "center";
  ctx.font = "bold 22px Rajdhani, 'Arial Narrow', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name.toUpperCase(), CX, H - 24);
  if (title) {
    ctx.font = "600 12px monospace";
    ctx.fillStyle = a.startsWith("#") || a.startsWith("hsl") ? a : "#fcee0a";
    ctx.fillText(`// ${title.toUpperCase()}`, CX, H - 9);
  }
  ctx.textAlign = "start";
  switch (look.frame) {
    case "simple":
      ctx.strokeStyle = a; ctx.lineWidth = 4; glow(ctx, a, 12); ctx.strokeRect(4, 4, W - 8, H - 8); noGlow(ctx);
      break;
    case "chamfer":
      ctx.strokeStyle = a; ctx.lineWidth = 4;
      poly(ctx, [[22, 4], [W - 4, 4], [W - 4, H - 22], [W - 22, H - 4], [4, H - 4], [4, 22]]); ctx.stroke();
      ctx.fillStyle = a; poly(ctx, [[0, 0], [20, 0], [0, 20]]); ctx.fill(); poly(ctx, [[W, H], [W - 20, H], [W, H - 20]]); ctx.fill();
      break;
    case "gold": {
      const gg = ctx.createLinearGradient(0, 0, W, H); gg.addColorStop(0, "#fff0a0"); gg.addColorStop(0.5, "#d4af37"); gg.addColorStop(1, "#7a5a10");
      ctx.strokeStyle = gg; ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.strokeStyle = "#7a5a10"; ctx.lineWidth = 2; ctx.strokeRect(14, 14, W - 28, H - 28);
      for (const [x, y] of [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]]) { ctx.fillStyle = "#ff2a6d"; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); }
      break;
    }
    case "glitch": {
      for (let i = 0; i < 3; i++) {
        const dx = Math.floor(t * 8 + i) % 3 === 0 ? (hash(i + Math.floor(t * 8)) - 0.5) * 8 : 0;
        ctx.strokeStyle = ["#ff2a6d", "#00f0ff", "#ffffff"][i]; ctx.lineWidth = 3;
        ctx.strokeRect(5 + dx + i, 5, W - 10, H - 10);
      }
      break;
    }
    case "thorns":
      ctx.strokeStyle = "#2a0a10"; ctx.lineWidth = 6; ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.fillStyle = "#4a0a18";
      for (let i = 0; i < 40; i++) {
        const p = i / 40;
        const [x, y] = p < 0.25 ? [6 + p * 4 * (W - 12), 6] : p < 0.5 ? [W - 6, 6 + (p - 0.25) * 4 * (H - 12)] : p < 0.75 ? [W - 6 - (p - 0.5) * 4 * (W - 12), H - 6] : [6, H - 6 - (p - 0.75) * 4 * (H - 12)];
        poly(ctx, [[x - 4, y], [x + 4, y], [x + (hash(i) - 0.5) * 6, y + (i % 2 ? 10 : -10)]]); ctx.fill();
      }
      break;
    case "holo": {
      const hg = ctx.createLinearGradient(0, 0, W, H);
      for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, `hsl(${(t * 80 + i * 60) % 360},100%,65%)`);
      ctx.strokeStyle = hg; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
      break;
    }
    case "legend":
      ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 6; glow(ctx, "#ffb347", 18); ctx.strokeRect(6, 6, W - 12, H - 12); noGlow(ctx);
      ctx.strokeStyle = "#fff0a0"; ctx.lineWidth = 1.5; ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.fillStyle = "#ffb347"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★ LÉGENDE ★", CX, 30); ctx.textAlign = "start";
      break;
    case "pixel":
      for (let x = 0; x < W; x += 10) for (const y of [0, H - 10]) { ctx.fillStyle = (x / 10) % 2 ? a : "#ffffff"; ctx.fillRect(x, y, 10, 10); }
      for (let y = 0; y < H; y += 10) for (const x of [0, W - 10]) { ctx.fillStyle = (y / 10) % 2 ? a : "#ffffff"; ctx.fillRect(x, y, 10, 10); }
      break;
    case "shell":
      ctx.strokeStyle = "#9be7ff"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
      for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
        ctx.fillStyle = "#ffd8e0";
        ctx.beginPath(); ctx.moveTo(x, y + 8); for (let k = 0; k <= 6; k++) { const an = Math.PI + (k / 6) * Math.PI; ctx.lineTo(x + Math.cos(an) * 12, y + Math.sin(an) * 12); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#c08090"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      break;
    default: break;
  }
}


/* =====================================================================
   Avatar complet
   opts : { t, name, title (texte), banner: bool }
===================================================================== */

// Tête (et tout ce qui s'y accroche) dessinée un peu plus petite, mise à l'échelle autour du cou :
// des proportions plus « dessin animé » que « chibi »
const HEAD_SCALE = 0.86;
const HEAD_PIVOT = 170;
function headScale(ctx) {
  ctx.translate(CX, HEAD_PIVOT);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  ctx.translate(-CX, -HEAD_PIVOT);
}

export function drawAvatar(ctx, look, opts = {}) {
  const t = opts.t || 0;
  const skin = SKINS[look.skin] || SKINS.s3;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  drawBg(ctx, look, t);
  drawAuraBack(ctx, look, t);
  drawBack(ctx, look, t);
  // légère respiration : le haut du corps monte et descend
  const breath = Math.sin(t * 1.8) * 1.2;
  if (look.hat === "hood") {
    const { w, top } = dims(look);
    ctx.save(); ctx.translate(0, breath); headScale(ctx);
    part(ctx, () => { ctx.beginPath(); ctx.ellipse(CX, HY - 4, w + 18, (HY - top) + 22, 0, 0, TAU); }, look.topColor, t, null);
    ctx.restore();
  }
  ctx.save(); ctx.translate(0, breath); headScale(ctx);
  hairBack(ctx, look, t);
  drawSandevistan(ctx, look, t);
  ctx.restore();
  drawLegsSkin(ctx, look, t, skin);
  drawBottom(ctx, look, t);
  drawShoes(ctx, look, t, skin);
  ctx.save(); ctx.translate(0, breath);
  drawTorsoSkin(ctx, look, t, skin);
  drawTop(ctx, look, t);
  drawNeckSkin(ctx, look, t, skin);
  drawNeck(ctx, look, t);
  ctx.save(); headScale(ctx);
  drawEarsSkin(ctx, look, t, skin);
  drawHead(ctx, look, t, skin);
  drawMarks(ctx, look, t);
  drawCyberFace(ctx, look, t);
  drawEyes(ctx, look, t);
  drawCyberEyes(ctx, look, t);
  drawBrows(ctx, look, t, look.hairColor);
  drawMouth(ctx, look, t);
  drawBeard(ctx, look, t, look.hairColor);
  if (look.hat !== "helmet" && look.hat !== "netrunner") hairFront(ctx, look, t);
  drawHat(ctx, look, t);
  drawGlasses(ctx, look, t);
  if (look.hat !== "helmet") drawEarrings(ctx, look, t);
  ctx.restore();
  drawWeapon(ctx, look, t);
  drawHands(ctx, look, t, skin);
  ctx.restore();
  drawPet(ctx, look, t);
  drawAuraFront(ctx, look, t);
  if (opts.banner !== false) drawFrame(ctx, look, t, opts.name || "Choom", opts.title || "");
  ctx.restore();
}

// Portrait réduit (tête et épaules, sans bandeau) dans un petit canvas : portefeuille, carte du hub.
let offscreen = null;
export function drawMini(canvas, look, t = 0) {
  if (typeof document === "undefined") return;
  if (!offscreen) { offscreen = document.createElement("canvas"); offscreen.width = AV_W * 2; offscreen.height = AV_H * 2; }
  const o = offscreen.getContext("2d");
  o.setTransform(2, 0, 0, 2, 0, 0);
  o.clearRect(0, 0, AV_W, AV_H);
  drawAvatar(o, look, { t, banner: false });
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const size = 136;
  ctx.drawImage(offscreen, (CX - size / 2) * 2, (HY + 22 - size / 2) * 2, size * 2, size * 2, 0, 0, canvas.width, canvas.height);
}

// Zones de cadrage des vignettes (selon la catégorie : visage, corps entier ou bas du corps)
export const CROPS = {
  head: [84, 52, 152, 190],
  full: [0, 30, 320, 400],
  legs: [72, 220, 176, 220],
  bust: [40, 30, 240, 300]
};
