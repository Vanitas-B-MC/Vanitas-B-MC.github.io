// js/td-art.js — dessin des tours du Tower Defense « Pare-feu », vues de dessus, style « cartoon » à la Bloons TD6
// (gros contours sombres, couleurs vives, reflets), mais en machines : pas de singes.
// Utilisé pour le plateau ET pour les icônes de la palette.
//
// drawTower(ctx, type, { x, y, angle, tiers, time, jam, fury, paragon, selected, scale })
//   angle : direction de la tourelle en radians (0 = vers la droite). Le socle ne tourne pas.
//   tiers : [chemin 1, chemin 2, chemin 3] : quelques détails apparaissent avec les améliorations.

const INK = "#0d0d16";          // contour
const STEEL = "#3a4256";
const STEEL_D = "#262c3b";
const STEEL_L = "#5d6880";
const GOLD = "#ffcf3a";

function circle(ctx, x, y, r, fill, stroke = INK, lw = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function rrect(ctx, x, y, w, h, r, fill, stroke = INK, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function poly(ctx, pts, fill, stroke = INK, lw = 2) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// Petit reflet blanc en haut à gauche, qui donne le côté « jouet » des tours de BTD6.
function shine(ctx, x, y, r, alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.38, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function glow(ctx, x, y, r, color, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 2.2;
  circle(ctx, x, y, r, color, null);
  ctx.restore();
}

// Socle commun : ombre portée, plateau métallique avec un liseré de la couleur de la tour.
function base(ctx, accent, { shape = "round", rim = null } = {}) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(1.5, 3, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (shape === "hex") {
    const pts = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 13.5, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 13.5]);
    poly(ctx, pts, STEEL_D);
  } else if (shape === "square") {
    rrect(ctx, -12.5, -12.5, 25, 25, 4, STEEL_D);
  } else {
    circle(ctx, 0, 0, 13, STEEL_D);
  }
  circle(ctx, 0, 0, 10.5, null, rim || accent, 2.2);
}

// Canon : rectangle arrondi qui part du centre vers la droite (la tourelle est déjà tournée).
function barrel(ctx, from, len, w, fill = STEEL_L, tip = null) {
  rrect(ctx, from, -w / 2, len, w, Math.min(2, w / 2), fill);
  if (tip) rrect(ctx, from + len - 3, -w / 2 - 1, 4, w + 2, 1.5, tip);
}

const DRAW = {
  // Laser : tourelle compacte, un canon émetteur par faisceau (chemin Optique), lentille qui brille.
  laser(ctx, o, c) {
    base(ctx, c, { shape: "hex" });
    ctx.rotate(o.angle);
    const n = 1 + (o.tiers[0] >= 2 ? 1 : 0) + (o.tiers[0] >= 3 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.translate(0, (k - (n - 1) / 2) * 5);
      barrel(ctx, 2, 15 + o.tiers[2], 4, STEEL_L, c);
      ctx.restore();
    }
    rrect(ctx, -7, -6.5, 13, 13, 4, "#1f8fb0");
    circle(ctx, 0, 0, 3.4, c, INK, 1.5);
    shine(ctx, 0, 0, 7);
    if (o.tiers[1] >= 2) { circle(ctx, -4.5, -6.5, 1.6, "#ff2a6d", INK, 1); circle(ctx, -4.5, 6.5, 1.6, "#ff2a6d", INK, 1); }
  },

  // Tour cryo : dôme de glace avec un flocon, cristaux autour.
  cryo(ctx, o, c) {
    base(ctx, c);
    const spikes = 6;
    ctx.rotate(o.time * 0.4);
    for (let i = 0; i < spikes; i++) {
      const a = (i * Math.PI * 2) / spikes;
      poly(ctx, [[Math.cos(a - 0.22) * 8, Math.sin(a - 0.22) * 8], [Math.cos(a) * (13 + o.tiers[0]), Math.sin(a) * (13 + o.tiers[0])], [Math.cos(a + 0.22) * 8, Math.sin(a + 0.22) * 8]], "#bfefff", INK, 1.5);
    }
    circle(ctx, 0, 0, 8, "#7fd8ff");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
      ctx.lineTo(-Math.cos(a) * 5.5, -Math.sin(a) * 5.5);
    }
    ctx.stroke();
    shine(ctx, 0, 0, 8, 0.5);
  },

  // Canon à plasma : grosse tourelle trapue, canon large à la bouche orange.
  canon(ctx, o, c) {
    base(ctx, c, { shape: "square" });
    ctx.rotate(o.angle);
    const twin = o.tiers[2] >= 3;
    if (twin) {
      ctx.save(); ctx.translate(0, -4); barrel(ctx, 0, 14, 6.5, "#4a4f63", c); ctx.restore();
      ctx.save(); ctx.translate(0, 4); barrel(ctx, 0, 14, 6.5, "#4a4f63", c); ctx.restore();
    } else {
      barrel(ctx, 0, 15 + (o.tiers[2] >= 2 ? 3 : 0), 8.5, "#4a4f63", c);
    }
    circle(ctx, -1, 0, 8.5, "#c4571f");
    circle(ctx, -1, 0, 4, "#ffb347", INK, 1.5);
    shine(ctx, -1, 0, 8.5);
  },

  // Sniper : long fusil avec lunette, sur un socle en sacs de sable.
  sniper(ctx, o, c) {
    base(ctx, c);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.save(); ctx.rotate(a); rrect(ctx, 8, -3, 5, 6, 2.5, "#b9a36b", INK, 1.2); ctx.restore();
    }
    ctx.rotate(o.angle);
    barrel(ctx, 0, 21 + (o.tiers[2] >= 3 ? 3 : 0), 3, "#4b5563", INK);
    rrect(ctx, -6, -4.5, 13, 9, 3, "#6b7a3a");
    rrect(ctx, -2, -7.5, 9, 3.2, 1.5, "#222", INK, 1.2);
    circle(ctx, 7, -5.9, 1.3, o.tiers[0] >= 2 ? "#ff2a6d" : c, null);
    shine(ctx, 0, 0, 7);
  },

  // Tesla : bobine de cuivre et sphère violette, avec des étincelles.
  tesla(ctx, o, c) {
    base(ctx, c);
    for (let r = 10; r >= 5; r -= 2.5) circle(ctx, 0, 0, r, r % 5 === 0 ? "#c77d3a" : "#e0a060", INK, 1.5);
    glow(ctx, 0, 0, 4.5, c, 0.95);
    circle(ctx, 0, 0, 4.5, null, INK, 1.5);
    ctx.strokeStyle = "#e8dcff";
    ctx.lineWidth = 1.3;
    const n = 2 + Math.min(3, o.tiers[0]);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = o.time * 3 + (i * Math.PI * 2) / n;
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a + 0.3) * 9, Math.sin(a + 0.3) * 9);
      ctx.lineTo(Math.cos(a - 0.1) * 13, Math.sin(a - 0.1) * 13);
    }
    ctx.stroke();
  },

  // Injecteur viral : réservoir de liquide vert et aiguille.
  venin(ctx, o, c) {
    base(ctx, c);
    ctx.rotate(o.angle);
    const n = 1 + (o.tiers[2] >= 2 ? 1 : 0) + (o.tiers[2] >= 3 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.translate(0, (k - (n - 1) / 2) * 5);
      barrel(ctx, 6, 13, 2, "#d0d6e0", INK);
      ctx.restore();
    }
    rrect(ctx, -9, -6, 16, 12, 5, "#e6edf5");
    rrect(ctx, -7.5, -4, 12 * (0.55 + 0.45 * Math.abs(Math.sin(o.time * 1.5))), 8, 3, c, null);
    rrect(ctx, -9, -6, 16, 12, 5, null);
    circle(ctx, -3, -1, 1.4, "#b6ffcf", null);
    circle(ctx, 0, 1.8, 1, "#b6ffcf", null);
    shine(ctx, -1, 0, 8);
  },

  // Mortier : tube vu de dessus (on voit le trou), sur un anneau de sacs de sable.
  mortier(ctx, o, c) {
    base(ctx, c);
    for (let i = 0; i < 10; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 5); rrect(ctx, 7.5, -3, 5.5, 6, 2.5, "#9c8a5c", INK, 1.1); ctx.restore();
    }
    ctx.rotate(o.angle);
    circle(ctx, 1.5, 0, 7.5 + (o.tiers[0] >= 3 ? 1 : 0), "#56603f");
    circle(ctx, 2.5, 0, 4.5, "#151515", INK, 1.5);
    circle(ctx, 2.5, 0, 2, c, null);
    shine(ctx, 1.5, 0, 7.5);
  },

  // Gatling : barillet de canons qui tourne.
  gatling(ctx, o, c) {
    base(ctx, c, { shape: "hex" });
    ctx.rotate(o.angle);
    const n = 1 + Math.min(2, o.tiers[2]);
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.translate(0, (k - (n - 1) / 2) * 7);
      barrel(ctx, 3, 14, 6.5, "#8a93a6", INK);
      ctx.save();
      ctx.translate(16, 0);
      ctx.rotate(o.time * 18);
      for (let i = 0; i < 3; i++) circle(ctx, Math.cos((i * Math.PI * 2) / 3) * 1.8, Math.sin((i * Math.PI * 2) / 3) * 1.8, 1.1, "#222", null);
      ctx.restore();
      ctx.restore();
    }
    rrect(ctx, -8, -7, 12, 14, 3, "#c9ced8");
    rrect(ctx, -6, -3, 6, 6, 1.5, "#f0b429", INK, 1.2);
    shine(ctx, -2, 0, 7);
  },

  // Pulsar : émetteur rose à anneaux qui pulsent.
  pulsar(ctx, o, c) {
    base(ctx, c);
    const p = (o.time * 1.4) % 1;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    circle(ctx, 0, 0, 5 + p * 9, null, c, 2);
    ctx.restore();
    circle(ctx, 0, 0, 9, "#7a2f6e");
    circle(ctx, 0, 0, 6, "#b2449f", INK, 1.5);
    glow(ctx, 0, 0, 3.3, "#ffd6f4", 1);
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 2 + Math.PI / 4); rrect(ctx, 8, -2, 5, 4, 1.5, STEEL_L, INK, 1.2); ctx.restore();
    }
    shine(ctx, 0, 0, 9);
  },

  // Beacon : antenne-radar qui tourne et clignote.
  beacon(ctx, o, c) {
    base(ctx, c, { shape: "hex" });
    poly(ctx, [[0, -9], [8, 7], [-8, 7]], "#2f8f7f");
    ctx.save();
    ctx.rotate(o.time * 1.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3.5, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = "#cfe9e4";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    const on = Math.sin(o.time * 6) > 0 || o.fury;
    if (on) glow(ctx, 0, 0, 3, c, 1);
    circle(ctx, 0, 0, 3, on ? c : "#1c5a50", INK, 1.2);
  },

  // Data Miner : baie de serveurs avec des diodes qui clignotent.
  miner(ctx, o, c) {
    base(ctx, c, { shape: "square" });
    rrect(ctx, -8.5, -9, 17, 18, 2.5, "#1f3c78");
    for (let r = 0; r < 4; r++) {
      rrect(ctx, -6.5, -7 + r * 4, 13, 2.8, 1, "#0e1b36", null);
      for (let k = 0; k < 3; k++) {
        const on = Math.sin(o.time * (3 + r) + k * 2 + r) > 0.2;
        circle(ctx, 2 + k * 1.8, -5.6 + r * 4, 0.7, on ? (k === 0 ? "#3ddc84" : c) : "#203050", null);
      }
    }
    if (o.tiers[0] >= 3) rrect(ctx, -8.5, -9, 17, 18, 2.5, null, GOLD, 1.5);
    shine(ctx, 0, 0, 9, 0.25);
  },

  // Dartling : grosse mitrailleuse à fléchettes jaune, poignées, réservoir ; canon laser quand le chemin 1 est au palier 3.
  dartling(ctx, o, c) {
    base(ctx, c, { shape: "square" });
    ctx.rotate(o.angle);
    const n = 1 + Math.min(2, o.tiers[2] >= 2 ? (o.tiers[2] >= 3 ? 2 : 1) : 0);
    const laser = o.tiers[0] >= 3;
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.translate(0, (k - (n - 1) / 2) * 6.5);
      if (laser) {
        barrel(ctx, 2, 17, 6, "#30343f", INK);
        glow(ctx, 18, 0, 2.6, o.tiers[0] >= 4 ? "#ff3b5c" : "#ff6b6b", 1);
      } else {
        barrel(ctx, 2, 16, 5.5, "#7a6a2a", INK);
        rrect(ctx, 14, -3.8, 4.5, 7.6, 1.5, "#3a3a3a", INK, 1.3);
      }
      ctx.restore();
    }
    rrect(ctx, -10, -8, 15, 16, 4, laser ? "#5a5f70" : c);
    rrect(ctx, -12, -3, 4, 6, 1.5, "#333", INK, 1.2);
    circle(ctx, -3, 0, 3.4, laser ? "#ff3b5c" : "#3a3a3a", INK, 1.5);
    shine(ctx, -3, 0, 8);
  },

  // Desperado : barillet de revolver et long canon, chapeau de cowboy posé dessus.
  desperado(ctx, o, c) {
    base(ctx, c);
    ctx.rotate(o.angle);
    barrel(ctx, 3, 16 + (o.tiers[0] >= 3 ? 2 : 0), 3.6, "#6e7480", INK);
    if (o.tiers[2] >= 3) { ctx.save(); ctx.translate(0, 5); barrel(ctx, 3, 13, 3, "#6e7480", INK); ctx.restore(); }
    ctx.save();
    ctx.rotate(-o.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 9, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "#8a5a2b";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 5, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "#b07438";
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.8, 5.8, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    shine(ctx, 0, 0, 9);
  },

  // Tack Shooter : corps rond rouge avec des buses tout autour (comme dans BTD6).
  tack(ctx, o, c) {
    base(ctx, c);
    const n = Math.min(16, 8 + o.tiers[0] * 2);
    ctx.save();
    ctx.rotate(o.spin || 0);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / n);
      rrect(ctx, 6, -1.8, 7 + (o.tiers[1] >= 1 ? 1.5 : 0), 3.6, 1.2, o.tiers[2] >= 1 ? "#ff8a3d" : "#b8bfcc", INK, 1.2);
      ctx.restore();
    }
    ctx.restore();
    circle(ctx, 0, 0, 8, "#e0443e");
    circle(ctx, 0, 0, 3.5, "#ffd1c4", INK, 1.5);
    shine(ctx, 0, 0, 8);
  },

  // Boomerang : bras lanceur avec un boomerang en V.
  boomerang(ctx, o, c) {
    base(ctx, c);
    ctx.rotate(o.angle);
    rrect(ctx, -2, -2.5, 11, 5, 2, "#8a93a6", INK, 1.5);
    ctx.save();
    ctx.translate(-1, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(4, 0); ctx.lineTo(-6, 8); ctx.stroke();
    ctx.strokeStyle = o.tiers[0] >= 2 ? "#e6e6e6" : "#e3a64c";
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.restore();
    circle(ctx, -3, 0, 3.2, c, INK, 1.5);
  },

  // Wizard : chapeau pointu violet étoilé et orbe magique (sans personnage).
  wizard(ctx, o, c) {
    base(ctx, c);
    ctx.rotate(o.angle);
    circle(ctx, 9, 0, 3.6, o.tiers[0] >= 1 ? "#ff8a3d" : "#c9a8ff");
    glow(ctx, 9, 0, 2, o.tiers[0] >= 1 ? "#ffd27a" : "#f2e6ff", 1);
    ctx.rotate(-o.angle);
    circle(ctx, 0, 0, 10, "#4b2a7a");
    poly(ctx, [[0, -8.5], [6, 5], [-6, 5]], "#7b3fe0", INK, 1.6);
    ctx.fillStyle = GOLD;
    for (const [x, y] of [[-4, -4], [4.5, 7], [-6.5, 4]]) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 ? 0.8 : 1.9;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.fill();
    }
    shine(ctx, 0, 0, 10);
  },

  // Spike Factory : petite usine carrée, engrenage qui tourne, tas de pointes en sortie.
  spikes(ctx, o, c) {
    base(ctx, c, { shape: "square" });
    rrect(ctx, -9.5, -9.5, 19, 19, 3, "#8c94a6");
    rrect(ctx, -9.5, 3, 19, 6.5, 2, "#5b6272");
    ctx.save();
    ctx.translate(-3, -3);
    ctx.rotate(o.time * 1.2);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? 4.2 : 5.6;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#d8dde6";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    circle(ctx, 0, 0, 1.6, "#5b6272", INK, 1);
    ctx.restore();
    rrect(ctx, 3.5, -8, 4, 8, 1, "#4a4f5c", INK, 1.2);
    const tip = o.tiers[1] >= 3 ? "#ff2a6d" : o.tiers[1] >= 1 ? "#7fd8ff" : "#e6e6f0";
    for (let k = 0; k < 3; k++) poly(ctx, [[-6 + k * 5, 8], [-4 + k * 5, 4], [-2 + k * 5, 8]], tip, INK, 1);
    if (o.tiers[2] >= 1) { circle(ctx, 6, 6, 2.6, "#ff2a6d", INK, 1.2); circle(ctx, 6, 6, 0.9, "#fff", null); }
  },

  // Super tour : noyau d'énergie bleu en lévitation, anneau doré, deux émetteurs.
  super(ctx, o, c) {
    base(ctx, c, { rim: GOLD });
    ctx.rotate(o.angle);
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(0, s * 5.5); barrel(ctx, 2, 13, 3.5, "#e6ecf5", c); ctx.restore(); }
    ctx.save();
    ctx.rotate(o.time * 2);
    ctx.setLineDash([4, 3]);
    circle(ctx, 0, 0, 9.5, null, GOLD, 1.6);
    ctx.setLineDash([]);
    ctx.restore();
    circle(ctx, 0, 0, 7.5, "#1e5fc9");
    glow(ctx, 0, 0, 4, "#bfe8ff", 1);
    circle(ctx, 0, 0, 4, null, INK, 1.2);
    shine(ctx, 0, 0, 7.5, 0.5);
  }
};

export function drawTower(ctx, type, opts = {}) {
  const draw = DRAW[type];
  if (!draw) return;
  const o = { angle: -Math.PI / 2, tiers: [0, 0, 0], time: 0, scale: 1, ...opts };
  ctx.save();
  ctx.translate(o.x || 0, o.y || 0);
  ctx.scale(o.scale, o.scale);
  ctx.lineJoin = "round";
  if (o.jam) ctx.filter = "grayscale(1) brightness(0.7)";
  draw(ctx, o, opts.color || "#ffffff");
  ctx.restore();
  ctx.filter = "none";
}

// Icône d'une tour pour la palette (un petit canvas).
export function towerIcon(type, color, size = 40) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.className = "tw-icon";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTower(ctx, type, { x: size / 2, y: size / 2 - 1, angle: -Math.PI / 4, color, scale: size / 36, time: 0.6 });
  return canvas;
}
