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
    if (o.paragon) {
      // Paragon : un seul canon laser colossal, bobines dorées, lentille rouge incandescente
      rrect(ctx, -2, -7, 24, 14, 4, "#2a2d36");
      for (const x of [4, 9, 14]) rrect(ctx, x, -8.5, 3, 17, 1.2, GOLD, INK, 1.2);
      rrect(ctx, 20, -8, 6, 16, 2.5, "#3a2a2a");
      glow(ctx, 25, 0, 5, "#ff3b2a", 1);
      circle(ctx, 25, 0, 2.6, "#fff3d0", null);
      rrect(ctx, -12, -10, 16, 20, 5, "#4a4f60");
      circle(ctx, -4, 0, 5, "#ff3b2a", INK, 1.8);
      glow(ctx, -4, 0, 2.5, "#ffd23a", 1);
      shine(ctx, -4, 0, 9);
      return;
    }
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

// Lance-glu : réservoir de glu jaune-vert et buse large.
DRAW.glue = function glue(ctx, o, c) {
  base(ctx, c);
  ctx.rotate(o.angle);
  const n = 1 + (o.tiers[2] >= 2 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    ctx.save();
    ctx.translate(0, (k - (n - 1) / 2) * 6);
    barrel(ctx, 3, 13, 6, "#6b7a2a", INK);
    rrect(ctx, 14, -4.5, 4, 9, 2, "#3a4a10", INK, 1.2);
    ctx.restore();
  }
  circle(ctx, -2, 0, 8.5, "#e9f5c8");
  const lvl = 0.45 + 0.4 * Math.abs(Math.sin(o.time * 1.2));
  ctx.save();
  ctx.beginPath();
  ctx.arc(-2, 0, 7.3, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = o.tiers[1] >= 2 ? "#9be22d" : c;
  ctx.fillRect(-10, 7.3 - 14.6 * lvl, 16, 14.6 * lvl);
  ctx.restore();
  circle(ctx, -2, 0, 8.5, null);
  circle(ctx, -4.5, -2.5, 1.4, "#ffffff", null);
  circle(ctx, -0.5, 2, 1, "#ffffff", null);
  shine(ctx, -2, 0, 8.5);
};

// Alchimiste : chaudron sur un brasero, fiole qui bouillonne, bulles colorées.
DRAW.alchemist = function alchemist(ctx, o, c) {
  base(ctx, c, { shape: "hex" });
  ctx.rotate(o.angle);
  // fiole tenue vers la cible
  rrect(ctx, 5, -2, 9, 4, 1.5, "#cfd6e2", INK, 1.3);
  circle(ctx, 15, 0, 3.6, o.tiers[1] >= 2 ? "#9cff6b" : c, INK, 1.4);
  ctx.rotate(-o.angle);
  circle(ctx, 0, 0, 9, "#2b2f3a");
  circle(ctx, 0, 0, 6.8, "#3ddc84", INK, 1.5);
  ctx.fillStyle = o.tiers[2] >= 2 ? "#ffcf3a" : c;
  ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const t = (o.time * 0.9 + i / 3) % 1;
    ctx.globalAlpha = 1 - t;
    circle(ctx, Math.sin(i * 2.1 + o.time) * 3, 3 - t * 8, 1.2 + t * 1.3, "#ffffff", null);
  }
  ctx.globalAlpha = 1;
  if (o.tiers[0] >= 2) for (const a of [-2.2, 2.2]) circle(ctx, Math.cos(a) * 11, Math.sin(a) * 11, 2.2, "#f07cff", INK, 1);
  shine(ctx, 0, 0, 9, 0.25);
};

// Drone de patrouille : hangar (piste ronde avec un H) ; le drone, lui, vole autour (drawDrone).
DRAW.drone = function droneBase(ctx, o, c) {
  base(ctx, c);
  circle(ctx, 0, 0, 9.5, "#30364a");
  ctx.strokeStyle = "#e6ecf5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3.5, -4.5); ctx.lineTo(-3.5, 4.5);
  ctx.moveTo(3.5, -4.5); ctx.lineTo(3.5, 4.5);
  ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, 0);
  ctx.stroke();
  ctx.setLineDash([2, 2.5]);
  circle(ctx, 0, 0, 8, null, c, 1.2);
  ctx.setLineDash([]);
  const on = Math.sin(o.time * 5) > 0;
  circle(ctx, 0, -9.5, 1.5, on ? "#3ddc84" : "#1a3a2a", INK, 1);
};

/* ---------- Héros : des androïdes vus de dessus (épaules, tête, arme), sur un socle doré ---------- */

function heroBase(ctx, c) {
  base(ctx, c, { rim: GOLD });
  ctx.save();
  ctx.setLineDash([2, 2.5]);
  circle(ctx, 0, 0, 12.2, null, GOLD, 1);
  ctx.restore();
}

function shoulders(ctx, color, w = 11, h = 6.5) {
  ctx.beginPath();
  ctx.ellipse(-1.5, 0, h, w, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Nova : androïde cyan, visière, deux pistolets.
DRAW.nova = function nova(ctx, o, c) {
  heroBase(ctx, c);
  ctx.rotate(o.angle);
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(2, s * 6.5); barrel(ctx, 0, 11, 3.2, "#2a3446", c); ctx.restore(); }
  shoulders(ctx, "#1f8fb0");
  circle(ctx, 0, 0, 5.6, "#e6f7ff");
  rrect(ctx, 1.5, -3.6, 3, 7.2, 1.5, c, INK, 1.2);
  shine(ctx, 0, 0, 6);
};

// Kael : hacker en sweat vert, casque à antennes, ordinateur ouvert devant lui.
DRAW.kael = function kael(ctx, o, c) {
  heroBase(ctx, c);
  ctx.rotate(o.angle);
  rrect(ctx, 5, -6, 8, 12, 1.5, "#2b2f3a");
  rrect(ctx, 6.2, -4.8, 5.6, 9.6, 1, "#0e2a1a", null);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(o.time * 6);
  ctx.fillStyle = c;
  for (let i = 0; i < 3; i++) ctx.fillRect(7, -3.8 + i * 3, 3 + (i % 2) * 1.5, 1.2);
  ctx.globalAlpha = 1;
  shoulders(ctx, "#2f7d4f");
  circle(ctx, -1, 0, 5.4, "#c9d6e2");
  for (const s of [-1, 1]) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-1, s * 5); ctx.lineTo(-5, s * 9); ctx.stroke(); circle(ctx, -5, s * 9, 1.6, c, INK, 1); }
  rrect(ctx, 0.5, -3.5, 2.5, 7, 1, "#1a1a22", null);
};

// Ignis : pyromancienne, capuche rouge, chevelure de flammes, boule de feu dans les mains.
DRAW.ignis = function ignis(ctx, o, c) {
  heroBase(ctx, c);
  ctx.rotate(o.angle);
  shoulders(ctx, "#a8321e", 10.5, 7);
  // flammes derrière la tête
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i - 2) * 0.45;
    const l = 8 + 2 * Math.sin(o.time * 9 + i * 1.7);
    poly(ctx, [[Math.cos(a - 0.25) * 4, Math.sin(a - 0.25) * 4], [Math.cos(a) * l, Math.sin(a) * l], [Math.cos(a + 0.25) * 4, Math.sin(a + 0.25) * 4]], i % 2 ? "#ffb347" : "#ff5a1f", INK, 1);
  }
  circle(ctx, 0, 0, 5, "#ffd6b0");
  glow(ctx, 10, 0, 4, "#ffb347", 1);
  circle(ctx, 10, 0, 2, "#fff4d6", null);
};

// Volta : cape violette, couronne d'éclairs, bâton à orbe électrique.
DRAW.volta = function volta(ctx, o, c) {
  heroBase(ctx, c);
  ctx.rotate(o.angle);
  rrect(ctx, 2, 4.5, 15, 2.6, 1.2, "#8a6a3a", INK, 1.2);
  glow(ctx, 17, 5.8, 3.3, c, 1);
  circle(ctx, 17, 5.8, 3.3, null, INK, 1.2);
  shoulders(ctx, "#5b2f8a", 11, 7);
  circle(ctx, 0, 0, 5, "#e8dcff");
  ctx.fillStyle = "#fcee0a";
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 + o.time;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
    ctx.lineTo(Math.cos(a + 0.2) * 8, Math.sin(a + 0.2) * 8);
    ctx.lineTo(Math.cos(a + 0.35) * 5, Math.sin(a + 0.35) * 5);
    ctx.fill();
  }
};

// Atlas : titan en armure lourde, casque à crête, énorme marteau.
DRAW.atlas = function atlas(ctx, o, c) {
  heroBase(ctx, c);
  ctx.rotate(o.angle);
  rrect(ctx, 0, -1.6, 16, 3.2, 1.2, "#6b4a2a", INK, 1.3);
  rrect(ctx, 13, -7, 7, 14, 2, "#8a93a6");
  rrect(ctx, 13, -7, 7, 14, 2, null, INK, 2);
  shoulders(ctx, "#6d7488", 12.5, 7.5);
  for (const s of [-1, 1]) circle(ctx, -1.5, s * 8.5, 3.2, c, INK, 1.4);
  circle(ctx, 0, 0, 5.6, "#9aa3b5");
  rrect(ctx, -5, -1.2, 9, 2.4, 1, "#c0392b", INK, 1);
  rrect(ctx, 2, -3.5, 2.5, 7, 1, "#1a1a22", null);
};

// Un drone en vol : quadricoptère vu de dessus, hélices qui tournent, petite ombre au sol.
export function drawDrone(ctx, x, y, { angle = 0, time = 0, color = "#8fa8ff", big = false, armed = 0 } = {}) {
  const s = big ? 1.35 : 1;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(x + 5, y + 9, 7 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(angle);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
  ctx.strokeStyle = "#8a93a6";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  for (const [px, py] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) {
    circle(ctx, px, py, 3.6, "rgba(220, 230, 255, 0.25)", INK, 1);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(time * 40);
    ctx.strokeStyle = "#e6ecf5";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-3.3, 0); ctx.lineTo(3.3, 0); ctx.stroke();
    ctx.restore();
  }
  rrect(ctx, -4.5, -3.5, 9, 7, 2.5, color, INK, 1.5);
  if (armed >= 2) { rrect(ctx, -3, -6.2, 6, 2.2, 1, "#ff8a3d", INK, 1); rrect(ctx, -3, 4, 6, 2.2, 1, "#ff8a3d", INK, 1); }
  circle(ctx, 3, 0, 1.6, "#ff3b5c", null);
  ctx.restore();
}

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

/* ---------- 3 nouvelles tours ---------- */

// Lance-flammes : réservoirs de carburant et buse évasée.
DRAW.flame = function flame(ctx, o, c) {
  base(ctx, c);
  ctx.rotate(o.angle);
  ctx.beginPath();
  ctx.moveTo(6, -2.6); ctx.lineTo(17, -5); ctx.lineTo(17, 5); ctx.lineTo(6, 2.6); ctx.closePath();
  ctx.fillStyle = o.tiers[2] >= 3 ? "#5a6aa8" : "#4b4f5c";
  ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  const flick = 0.6 + 0.4 * Math.abs(Math.sin(o.time * 14));
  glow(ctx, 18, 0, 2.6 * flick + 1, o.tiers[2] >= 3 ? "#6bd0ff" : "#ffb347", 1);
  for (const s of [-1, 1]) rrect(ctx, -10, s * 5.5 - 3, 10, 6, 3, "#c0392b", INK, 1.4);
  circle(ctx, -2, 0, 4.5, "#3a3f4e", INK, 1.5);
  circle(ctx, -2, 0, 1.8, c, null);
  shine(ctx, -5, -5.5, 5);
};

// Satellite : antenne parabolique et panneaux solaires (la parabole pointe vers le ciel, elle tourne doucement).
DRAW.satellite = function satellite(ctx, o, c) {
  base(ctx, c, { shape: "hex" });
  ctx.rotate(o.time * 0.4);
  for (const s of [-1, 1]) {
    rrect(ctx, s > 0 ? 4 : -15, -3.5, 11, 7, 1, "#2c4a9a", INK, 1.4);
    ctx.strokeStyle = "#8fb3ff";
    ctx.lineWidth = 0.8;
    for (let k = 1; k < 3; k++) { const x = (s > 0 ? 4 : -15) + k * 3.7; ctx.beginPath(); ctx.moveTo(x, -3); ctx.lineTo(x, 3); ctx.stroke(); }
  }
  circle(ctx, 0, 0, 6, "#dfe6f5");
  circle(ctx, 0, 0, 3.6, "#b8c2d8", INK, 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7.5); ctx.stroke();
  const on = Math.sin(o.time * 4) > 0;
  circle(ctx, 0, -8, 1.8, on ? "#ff3b5c" : "#5a1a26", INK, 1);
  if (o.tiers[2] >= 2) for (const a of [0.8, 2.4, 4]) circle(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 1.4, "#fcee0a", null);
};

// Canon sonique : grand haut-parleur (membrane qui vibre) sur un pied.
DRAW.sonic = function sonic(ctx, o, c) {
  base(ctx, c);
  ctx.rotate(o.angle);
  rrect(ctx, -9, -8, 12, 16, 3, "#3a3f4e");
  ctx.beginPath();
  ctx.moveTo(2, -6); ctx.lineTo(13, -10); ctx.lineTo(13, 10); ctx.lineTo(2, 6); ctx.closePath();
  ctx.fillStyle = "#6b7286"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  const v = 1 + 0.12 * Math.sin(o.time * 30);
  ctx.beginPath(); ctx.ellipse(12, 0, 2.4, 8.5 * v, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
  circle(ctx, 12, 0, 1.6, "#ffffff", null);
  for (const y of [-4, 0, 4]) circle(ctx, -4, y, 1.2, "#ff6bd6", null);
  shine(ctx, -3, 0, 7);
};

/* ---------- Ennemis : chaque type a sa silhouette (orientée dans le sens de la marche) ---------- */

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function eyes(ctx, x, spread = 2.4, size = 1.5) {
  for (const s of [-1, 1]) { circle(ctx, x, s * spread, size, "#ffffff", INK, 0.8); circle(ctx, x + 0.4, s * spread, size * 0.45, INK, null); }
}

const ENEMY_ART = {
  // Drone : petit insecte numérique, six pattes qui bougent
  drone(ctx, r, c, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
      const w = Math.sin(t * 18 + i * 2 + (s > 0 ? 0 : Math.PI)) * 1.5;
      ctx.beginPath(); ctx.moveTo(i * r * 0.4, s * r * 0.5); ctx.lineTo(i * r * 0.5 + w, s * r * 1.25); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.8, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
    eyes(ctx, r * 0.45, r * 0.3, r * 0.22);
  },
  // Sprint : flèche aérodynamique avec traînée de vitesse
  runner(ctx, r, c, t) {
    ctx.strokeStyle = c; ctx.globalAlpha *= 0.6; ctx.lineWidth = 1.2;
    for (const y of [-r * 0.5, 0, r * 0.5]) { ctx.beginPath(); ctx.moveTo(-r * 1.2, y); ctx.lineTo(-r * 2.6 - (Math.sin(t * 20 + y) + 1) * 2, y); ctx.stroke(); }
    ctx.globalAlpha /= 0.6;
    poly(ctx, [[r * 1.5, 0], [-r, -r * 1.05], [-r * 0.45, 0], [-r, r * 1.05]], c, INK, 1.5);
    circle(ctx, r * 0.35, 0, r * 0.28, "#ffffff", INK, 0.8);
  },
  // Blindé : char d'assaut, chenilles et tourelle
  tank(ctx, r, c, t) {
    for (const s of [-1, 1]) {
      rrect(ctx, -r * 1.1, s * r * 0.72 - r * 0.3, r * 2.2, r * 0.6, 2, "#2b2f3a", INK, 1.2);
      ctx.strokeStyle = "#5a6070"; ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) { const x = -r + (((k * r * 0.55 - t * 20) % (r * 2.2)) + r * 2.2) % (r * 2.2); ctx.beginPath(); ctx.moveTo(x, s * r * 0.72 - r * 0.28); ctx.lineTo(x, s * r * 0.72 + r * 0.28); ctx.stroke(); }
    }
    rrect(ctx, -r * 0.9, -r * 0.55, r * 1.8, r * 1.1, 3, c, INK, 1.5);
    rrect(ctx, 0, -r * 0.14, r * 1.25, r * 0.28, 1, "#3a3f4e", INK, 1);
    circle(ctx, -r * 0.1, 0, r * 0.42, c, INK, 1.3);
  },
  // Cuirassé : hexagone de plaques rivetées
  armored(ctx, r, c) {
    const pts = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * r * 1.1, Math.sin((i * Math.PI) / 3) * r * 1.1]);
    poly(ctx, pts, "#6c7684", INK, 1.6);
    const inner = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * r * 0.62, Math.sin((i * Math.PI) / 3) * r * 0.62]);
    poly(ctx, inner, c, INK, 1.2);
    for (const [x, y] of pts) circle(ctx, x * 0.82, y * 0.82, 1, "#d8dde6", null);
    rrect(ctx, r * 0.1, -r * 0.18, r * 0.5, r * 0.36, 1, "#ff3b5c", null);
  },
  // Essaim : petite mouche aux ailes qui battent
  swarm(ctx, r, c, t) {
    const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 40));
    ctx.fillStyle = "rgba(230, 240, 255, 0.7)";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-r * 0.2, s * r * 0.9, r * 0.9, r * 0.45 * flap + 0.5, 0.3 * s, 0, Math.PI * 2); ctx.fill(); }
    poly(ctx, [[r * 1.2, 0], [-r * 0.8, -r * 0.6], [-r * 0.8, r * 0.6]], c, INK, 1.2);
  },
  // Furtif : feu follet avec une queue ondulante
  ghost(ctx, r, c, t) {
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arc(0, 0, r, 0, Math.PI * 0.5);
    for (let k = 0; k <= 6; k++) ctx.lineTo(-r * 0.4 - k * r * 0.35, r * (1 - k / 6) + Math.sin(t * 10 + k) * 2);
    ctx.lineTo(-r * 2.6, 0);
    for (let k = 6; k >= 0; k--) ctx.lineTo(-r * 0.4 - k * r * 0.35, -r * (1 - k / 6) + Math.sin(t * 10 + k + 1) * 2);
    ctx.arc(0, 0, r, Math.PI * 1.5, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    for (const s of [-1, 1]) circle(ctx, r * 0.35, s * r * 0.35, r * 0.2, "#1a1f3a", null);
  },
  // Régénérant : masse gélatineuse qui ondule, avec une croix
  regen(ctx, r, c, t) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (1 + 0.12 * Math.sin(a * 4 + t * 6));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.3, r * 1.1);
    ctx.fillRect(-r * 0.55, -r * 0.15, r * 1.1, r * 0.3);
  },
  // Bastion : forteresse ronde à créneaux
  shield(ctx, r, c) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const rr = i % 2 ? r * 0.88 : r * 1.05;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = "#b08a3a"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    circle(ctx, 0, 0, r * 0.6, c, INK, 1.2);
    eyes(ctx, r * 0.15, r * 0.25, r * 0.17);
  },
  // Cargo : conteneur sur roues, orienté dans le sens de la marche
  cargo(ctx, r, c) {
    for (const x of [-r * 0.7, 0, r * 0.7]) for (const s of [-1, 1]) circle(ctx, x, s * r * 0.72, r * 0.2, "#1a1a22", null);
    rrect(ctx, -r * 1.15, -r * 0.65, r * 2.3, r * 1.3, 2, c, INK, 1.6);
    ctx.strokeStyle = "#5d6678"; ctx.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * r * 0.38, -r * 0.6); ctx.lineTo(k * r * 0.38, r * 0.6); ctx.stroke(); }
    rrect(ctx, r * 1.15, -r * 0.5, r * 0.5, r, 2, "#3a3f4e", INK, 1.2);
  },
  // Virus (boss) : boule à pointes en couronne qui tourne, visage menaçant
  boss(ctx, r, c, t) {
    ctx.save();
    ctx.rotate(t * 1.5);
    for (let i = 0; i < 10; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 5);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(r * 0.8, 0); ctx.lineTo(r * 1.35, 0); ctx.stroke();
      circle(ctx, r * 1.4, 0, r * 0.18, "#ff2a6d", INK, 1);
      ctx.restore();
    }
    ctx.restore();
    circle(ctx, 0, 0, r, c, INK, 2);
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(r * 0.3, s * r * 0.35); ctx.rotate(s * 0.4); rrect(ctx, -r * 0.2, -r * 0.1, r * 0.45, r * 0.22, 1, "#ff2a6d", INK, 1); ctx.restore(); }
  },
  // Rootkit (boss) : engrenage rose avec un œil
  boss2(ctx, r, c, t) {
    ctx.save();
    ctx.rotate(-t * 1.2);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const rr = i % 3 === 0 ? r * 0.85 : r * 1.15;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    circle(ctx, 0, 0, r * 0.55, "#2b1030", INK, 1.5);
    circle(ctx, r * 0.1, 0, r * 0.3, "#ff6bd6", null);
    circle(ctx, r * 0.18, 0, r * 0.12, "#ffffff", null);
  },
  // Ver (boss) : tête à mandibules et anneaux qui suivent
  boss3(ctx, r, c, t) {
    for (let k = 4; k >= 1; k--) {
      const off = Math.sin(t * 6 - k) * r * 0.25;
      circle(ctx, -k * r * 0.85, off, r * (1 - k * 0.12), k % 2 ? "#2fa866" : c, INK, 1.6);
    }
    circle(ctx, 0, 0, r, c, INK, 2);
    for (const s of [-1, 1]) {
      const m = 0.25 + 0.2 * Math.sin(t * 8);
      ctx.save(); ctx.rotate(s * m);
      poly(ctx, [[r * 0.7, s * r * 0.2], [r * 1.5, s * r * 0.45], [r * 0.8, s * r * 0.6]], "#eaffef", INK, 1.2);
      ctx.restore();
    }
    eyes(ctx, r * 0.35, r * 0.4, r * 0.2);
  },
  // Ransomware (boss) : cadenas rouge avec un trou de serrure
  boss4(ctx, r, c, t) {
    ctx.rotate(Math.sin(t * 2) * 0.1);       // le cadenas reste « debout » (il ne tourne pas avec la marche)
    ctx.strokeStyle = INK; ctx.lineWidth = r * 0.45;
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.65, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = "#c9ced8"; ctx.lineWidth = r * 0.25;
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.65, Math.PI, 0); ctx.stroke();
    rrect(ctx, -r, -r * 0.35, r * 2, r * 1.4, r * 0.25, c, INK, 2);
    circle(ctx, 0, r * 0.15, r * 0.22, "#1a0a0a", null);
    rrect(ctx, -r * 0.08, r * 0.2, r * 0.16, r * 0.45, 1, "#1a0a0a", null);
  },
  // Botnet (boss) : nœud central relié à des machines zombies qui tournent autour
  boss5(ctx, r, c, t) {
    const pts = Array.from({ length: 5 }, (_, i) => { const a = t * 1.2 + (i * Math.PI * 2) / 5; return [Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35]; });
    ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (const [x, y] of pts) { ctx.moveTo(0, 0); ctx.lineTo(x, y); } ctx.stroke();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.globalAlpha *= 0.5; ctx.stroke(); ctx.globalAlpha /= 0.5;
    for (const [x, y] of pts) rrect(ctx, x - r * 0.28, y - r * 0.22, r * 0.56, r * 0.44, 1.5, "#2b3a30", INK, 1.2);
    circle(ctx, 0, 0, r * 0.85, c, INK, 2);
    ctx.fillStyle = "#0b2a18";
    for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.45, -r * 0.4 + i * r * 0.3, r * 0.9, r * 0.12);
  }
};

ENEMY_ART.boss4.upright = true;

// Dessine un ennemi. angle : direction de la marche. status : { slow, stun, camo }.
export function drawEnemy(ctx, type, x, y, r, { angle = 0, time = 0, color = "#ff2a6d", slow = false, stun = false, seed = 0 } = {}) {
  const art = ENEMY_ART[type];
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  if (!art || !art.upright) ctx.rotate(angle);
  ctx.lineJoin = "round";
  if (art) art(ctx, r, color, time + seed * 0.37);
  else circle(ctx, 0, 0, r, color, INK, 1.5);
  ctx.restore();
  if (slow) {
    // ralenti : contour givré
    ctx.strokeStyle = "rgba(127, 216, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (stun) {
    // étourdi : petites étoiles qui tournent au-dessus
    ctx.fillStyle = "#fcee0a";
    for (let i = 0; i < 3; i++) { const a = time * 6 + (i * Math.PI * 2) / 3; star(ctx, Math.cos(a) * r * 0.9, -r - 3 + Math.sin(a) * 2.5, 2.4); }
  }
  ctx.restore();
}
