// js/deck-art.js — portraits des ennemis de « Grimoire Néon », dessinés au canvas (160 × 160, néon sur fond sombre).
// drawEnemy(canvas, art) : art = { kind, c1, c2 } (voir les tables d'ennemis dans deck.js).

const TAU = Math.PI * 2;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const grad = (ctx, c, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(c, 0.35));
  g.addColorStop(0.55, c);
  g.addColorStop(1, shade(c, -0.45));
  return g;
};
function body(ctx, fill, line = "rgba(10,6,20,0.9)", lw = 2.5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  ctx.stroke();
}
function eyes(ctx, pts, color, r = 4) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  ctx.fillStyle = "#fff";
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function glowLine(ctx, color, w, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  fn();
  ctx.stroke();
  ctx.restore();
}
function wing(ctx, s, c, cx, cy, span, feathers = 5) {
  for (let i = 0; i < feathers; i++) {
    const a = -0.9 + i * 0.32;
    ctx.beginPath();
    ctx.ellipse(cx + s * (18 + i * 7), cy - 6 + i * 4, span * (1 - i * 0.12), 7, s * a, 0, TAU);
    body(ctx, shade(c, 0.15 - i * 0.08), "rgba(10,6,20,0.6)", 1.5);
  }
}

const KINDS = {
  drone(ctx, c1, c2) {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(80 + s * 42, 58, 22, 5, 0, 0, TAU); body(ctx, "rgba(200,220,255,0.25)", c1, 1.5);
      ctx.beginPath(); ctx.rect(80 + s * 22 - 4, 60, 8, 14); body(ctx, shade(c1, -0.3));
    }
    ctx.beginPath(); ctx.ellipse(80, 88, 38, 26, 0, 0, TAU); body(ctx, grad(ctx, c1, 50, 60, 110, 116));
    ctx.beginPath(); ctx.ellipse(80, 90, 18, 14, 0, 0, TAU); body(ctx, "#0a0a14");
    eyes(ctx, [[80, 90]], c2, 7);
    ctx.beginPath(); ctx.moveTo(62, 112); ctx.lineTo(56, 128); ctx.moveTo(98, 112); ctx.lineTo(104, 128); ctx.strokeStyle = shade(c1, -0.4); ctx.lineWidth = 3; ctx.stroke();
  },
  rat(ctx, c1, c2) {
    ctx.beginPath(); ctx.moveTo(122, 112); ctx.quadraticCurveTo(150, 100, 146, 70); ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(90, 104, 40, 26, 0, 0, TAU); body(ctx, grad(ctx, c1, 50, 80, 130, 130));
    ctx.beginPath(); ctx.moveTo(60, 84); ctx.quadraticCurveTo(30, 92, 22, 106); ctx.quadraticCurveTo(44, 118, 66, 112); ctx.closePath(); body(ctx, grad(ctx, c1, 20, 80, 70, 120));
    for (const x of [52, 68]) { ctx.beginPath(); ctx.ellipse(x, 78, 9, 12, -0.3, 0, TAU); body(ctx, shade(c1, 0.2)); }
    eyes(ctx, [[40, 98]], c2, 4);
    glowLine(ctx, c2, 2, () => { ctx.moveTo(84, 90); ctx.lineTo(112, 92); ctx.lineTo(118, 104); });
    ctx.fillStyle = "#fff"; ctx.fillRect(25, 108, 3, 5); ctx.fillRect(30, 108, 3, 5);
  },
  slime(ctx, c1, c2) {
    ctx.beginPath();
    ctx.moveTo(30, 128);
    ctx.quadraticCurveTo(22, 70, 80, 52);
    ctx.quadraticCurveTo(138, 70, 130, 128);
    for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(120 - i * 22, 140 - (i % 2) * 8, 108 - i * 20, 128);
    ctx.closePath();
    ctx.save(); ctx.globalAlpha = 0.9; body(ctx, grad(ctx, c1, 40, 50, 120, 130)); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(62, 72, 12, 6, -0.5, 0, TAU); ctx.fill();
    for (const [x, y, r] of [[96, 104, 5], [52, 112, 4], [108, 84, 3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); body(ctx, c2, "rgba(0,0,0,0.3)", 1); }
    eyes(ctx, [[66, 94], [94, 94]], "#111", 5);
    ctx.beginPath(); ctx.arc(80, 108, 9, 0.1 * Math.PI, 0.9 * Math.PI); ctx.strokeStyle = "#111"; ctx.lineWidth = 2.5; ctx.stroke();
  },
  ghoul(ctx, c1, c2) {
    ctx.beginPath(); ctx.moveTo(40, 140); ctx.lineTo(48, 86); ctx.quadraticCurveTo(80, 70, 112, 86); ctx.lineTo(120, 140); ctx.closePath(); body(ctx, grad(ctx, c2, 40, 80, 120, 140));
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(80 + s * 30, 92); ctx.quadraticCurveTo(80 + s * 56, 104, 80 + s * 50, 132); ctx.lineWidth = 9; ctx.strokeStyle = c1; ctx.stroke();
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(80 + s * 50, 132); ctx.lineTo(80 + s * (54 + k * 4), 146); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    }
    ctx.beginPath(); ctx.ellipse(80, 62, 24, 28, 0, 0, TAU); body(ctx, grad(ctx, c1, 56, 34, 104, 90));
    eyes(ctx, [[70, 58], [90, 58]], "#ff2a6d", 4.5);
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.ellipse(80, 76, 10, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; for (let i = -2; i <= 2; i++) ctx.fillRect(78 + i * 4, 72, 2, 4);
  },
  cultist(ctx, c1, c2) {
    ctx.beginPath(); ctx.moveTo(80, 28); ctx.quadraticCurveTo(116, 60, 124, 146); ctx.lineTo(36, 146); ctx.quadraticCurveTo(44, 60, 80, 28); ctx.closePath(); body(ctx, grad(ctx, c1, 40, 30, 120, 146));
    ctx.beginPath(); ctx.ellipse(80, 66, 18, 20, 0, 0, TAU); body(ctx, "#08060f");
    eyes(ctx, [[73, 66], [87, 66]], c2, 3.5);
    glowLine(ctx, c2, 2.5, () => { ctx.moveTo(80, 96); ctx.lineTo(80, 134); ctx.moveTo(68, 108); ctx.lineTo(92, 108); });
    glowLine(ctx, c2, 1.5, () => { ctx.arc(80, 112, 26, 0, TAU); });
  },
  mage(ctx, c1, c2) {
    ctx.beginPath(); ctx.moveTo(80, 18); ctx.lineTo(106, 64); ctx.lineTo(54, 64); ctx.closePath(); body(ctx, grad(ctx, c2, 54, 18, 106, 64));
    ctx.beginPath(); ctx.ellipse(80, 64, 34, 6, 0, 0, TAU); body(ctx, shade(c2, -0.2));
    ctx.beginPath(); ctx.moveTo(56, 70); ctx.quadraticCurveTo(46, 120, 40, 146); ctx.lineTo(120, 146); ctx.quadraticCurveTo(114, 120, 104, 70); ctx.closePath(); body(ctx, grad(ctx, c2, 40, 70, 120, 146));
    ctx.beginPath(); ctx.ellipse(80, 82, 15, 15, 0, 0, TAU); body(ctx, "#0a0814");
    eyes(ctx, [[74, 82], [86, 82]], c1, 3.5);
    glowLine(ctx, "#c8a060", 3, () => { ctx.moveTo(128, 46); ctx.lineTo(118, 146); });
    ctx.save(); ctx.shadowColor = c1; ctx.shadowBlur = 18; ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(129, 40, 8, 0, TAU); ctx.fill(); ctx.restore();
  },
  knight(ctx, c1, c2) {
    ctx.beginPath(); ctx.moveTo(44, 146); ctx.lineTo(50, 90); ctx.quadraticCurveTo(80, 78, 110, 90); ctx.lineTo(116, 146); ctx.closePath(); body(ctx, grad(ctx, c1, 44, 80, 116, 146));
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(80 + s * 34, 92, 16, 11, 0, 0, TAU); body(ctx, grad(ctx, c1, 50, 80, 110, 104)); }
    ctx.beginPath(); ctx.moveTo(58, 74); ctx.quadraticCurveTo(58, 34, 80, 32); ctx.quadraticCurveTo(102, 34, 102, 74); ctx.closePath(); body(ctx, grad(ctx, c1, 58, 32, 102, 74));
    ctx.fillStyle = "#0a0a12"; ctx.fillRect(64, 52, 32, 6);
    glowLine(ctx, c2, 3, () => { ctx.moveTo(66, 55); ctx.lineTo(94, 55); });
    ctx.beginPath(); ctx.moveTo(80, 32); ctx.quadraticCurveTo(92, 14, 104, 20); ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.stroke();
    glowLine(ctx, "#e8ecf4", 4, () => { ctx.moveTo(26, 150); ctx.lineTo(40, 40); });
    ctx.fillStyle = c2; ctx.fillRect(28, 112, 20, 5);
  },
  hydra(ctx, c1, c2) {
    for (const [dx, h, a] of [[-34, 46, -0.4], [0, 58, 0], [34, 46, 0.4]]) {
      ctx.beginPath(); ctx.moveTo(80 + dx * 0.4, 130); ctx.quadraticCurveTo(80 + dx * 1.4, 110 - h * 0.4, 80 + dx, 120 - h); ctx.lineWidth = 15; ctx.strokeStyle = shade(c1, -0.2); ctx.lineCap = "round"; ctx.stroke();
      ctx.save(); ctx.translate(80 + dx, 116 - h); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); body(ctx, grad(ctx, c1, -15, -11, 15, 11));
      ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(0, 16); ctx.lineTo(6, 6); ctx.fillStyle = "#300"; ctx.fill();
      ctx.restore();
      eyes(ctx, [[80 + dx - 5, 112 - h], [80 + dx + 5, 112 - h]], c2, 2.5);
    }
    ctx.beginPath(); ctx.ellipse(80, 136, 46, 20, 0, 0, TAU); body(ctx, grad(ctx, c1, 34, 116, 126, 156));
  },
  golem(ctx, c1, c2) {
    const block = (x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); body(ctx, grad(ctx, c1, x, y, x + w, y + h)); };
    block(48, 72, 64, 54);
    block(24, 78, 22, 44); block(114, 78, 22, 44);
    block(20, 120, 28, 20); block(112, 120, 28, 20);
    block(56, 126, 18, 22); block(86, 126, 18, 22);
    block(62, 40, 36, 32);
    glowLine(ctx, c2, 3, () => { ctx.moveTo(56, 86); ctx.lineTo(72, 100); ctx.lineTo(66, 116); ctx.moveTo(104, 80); ctx.lineTo(92, 96); ctx.lineTo(100, 112); });
    eyes(ctx, [[72, 56], [88, 56]], c2, 4);
  },
  archon(ctx, c1, c2) {
    ctx.save(); ctx.shadowColor = c1; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.moveTo(80, 10); ctx.lineTo(122, 70); ctx.lineTo(80, 150); ctx.lineTo(38, 70); ctx.closePath(); body(ctx, grad(ctx, c1, 38, 10, 122, 150), "rgba(255,255,255,0.7)", 2);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(80, 10); ctx.lineTo(80, 150); ctx.moveTo(38, 70); ctx.lineTo(122, 70); ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(80 + s * 46, 50); ctx.lineTo(80 + s * 64, 70); ctx.lineTo(80 + s * 46, 96); ctx.lineTo(80 + s * 40, 70); ctx.closePath(); body(ctx, grad(ctx, c2, 30, 50, 130, 96), "rgba(255,255,255,0.5)", 1.5); }
    eyes(ctx, [[80, 64]], c2, 8);
    glowLine(ctx, "#ffffff", 2, () => { ctx.arc(80, 70, 52, 1.1 * Math.PI, 1.9 * Math.PI); });
  },
  crystal(ctx, c1) {
    ctx.save(); ctx.shadowColor = c1; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(80, 40); ctx.lineTo(108, 84); ctx.lineTo(80, 130); ctx.lineTo(52, 84); ctx.closePath(); body(ctx, grad(ctx, c1, 52, 40, 108, 130), "rgba(255,255,255,0.7)", 2);
    ctx.restore();
    eyes(ctx, [[80, 82]], "#fff", 5);
  },
  angel(ctx, c1, c2) {
    for (const s of [-1, 1]) wing(ctx, s, c1, 80, 82, 40);
    ctx.beginPath(); ctx.moveTo(62, 84); ctx.quadraticCurveTo(80, 76, 98, 84); ctx.lineTo(108, 146); ctx.lineTo(52, 146); ctx.closePath(); body(ctx, grad(ctx, c1, 52, 76, 108, 146));
    ctx.beginPath(); ctx.ellipse(80, 62, 15, 17, 0, 0, TAU); body(ctx, grad(ctx, "#f4d2b4", 65, 45, 95, 80));
    eyes(ctx, [[74, 62], [86, 62]], c2, 3);
    glowLine(ctx, "#fcee0a", 3, () => { ctx.ellipse(80, 38, 18, 5, 0, 0, TAU); });
    glowLine(ctx, c2, 2, () => { ctx.moveTo(80, 92); ctx.lineTo(80, 140); });
  },
  boss2(ctx, c1, c2) {
    for (const s of [-1, 1]) wing(ctx, s, "#e8ecf4", 80, 70, 52, 6);
    ctx.beginPath(); ctx.moveTo(50, 150); ctx.lineTo(56, 84); ctx.quadraticCurveTo(80, 72, 104, 84); ctx.lineTo(110, 150); ctx.closePath(); body(ctx, grad(ctx, "#1c1c2c", 50, 72, 110, 150));
    ctx.beginPath(); ctx.moveTo(72, 84); ctx.lineTo(80, 120); ctx.lineTo(88, 84); ctx.closePath(); body(ctx, c1);
    ctx.beginPath(); ctx.ellipse(80, 58, 16, 19, 0, 0, TAU); body(ctx, grad(ctx, "#f4d2b4", 64, 40, 96, 78));
    ctx.fillStyle = "#0a0a14"; ctx.fillRect(66, 52, 28, 7);
    glowLine(ctx, c2, 2, () => { ctx.moveTo(67, 55); ctx.lineTo(93, 55); });
    ctx.beginPath(); ctx.moveTo(62, 46); ctx.quadraticCurveTo(80, 26, 98, 46); ctx.quadraticCurveTo(104, 70, 98, 76); ctx.lineTo(96, 52); ctx.lineTo(64, 52); ctx.lineTo(62, 76); ctx.quadraticCurveTo(56, 70, 62, 46); body(ctx, c1);
    glowLine(ctx, "#fcee0a", 3, () => { ctx.ellipse(80, 26, 22, 6, 0, 0, TAU); });
  },
  ghost(ctx, c1, c2) {
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(40, 140);
    ctx.quadraticCurveTo(30, 40, 80, 32); ctx.quadraticCurveTo(130, 40, 120, 140);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(110 - i * 20, 124, 100 - i * 20, 140);
    ctx.closePath(); body(ctx, grad(ctx, c1, 40, 32, 120, 140), c2, 2);
    ctx.restore();
    ctx.fillStyle = "#05030a"; for (const x of [64, 96]) { ctx.beginPath(); ctx.ellipse(x, 74, 9, 13, 0, 0, TAU); ctx.fill(); }
    eyes(ctx, [[64, 76], [96, 76]], c2, 3);
    ctx.fillStyle = "#05030a"; ctx.beginPath(); ctx.ellipse(80, 104, 10, 15, 0, 0, TAU); ctx.fill();
  },
  dragon(ctx, c1, c2) {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(80 + s * 16, 90); ctx.lineTo(80 + s * 70, 50); ctx.lineTo(80 + s * 60, 100); ctx.lineTo(80 + s * 50, 92); ctx.lineTo(80 + s * 40, 110); ctx.closePath(); body(ctx, grad(ctx, shade(c1, -0.3), 20, 50, 140, 110)); }
    ctx.beginPath(); ctx.ellipse(80, 112, 30, 30, 0, 0, TAU); body(ctx, grad(ctx, c1, 50, 82, 110, 142));
    ctx.beginPath(); ctx.ellipse(80, 118, 16, 20, 0, 0, TAU); body(ctx, shade(c2, 0.3), "rgba(0,0,0,0.3)", 1);
    ctx.beginPath(); ctx.moveTo(60, 70); ctx.quadraticCurveTo(80, 40, 100, 70); ctx.quadraticCurveTo(100, 92, 80, 96); ctx.quadraticCurveTo(60, 92, 60, 70); body(ctx, grad(ctx, c1, 60, 40, 100, 96));
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(80 + s * 12, 54); ctx.lineTo(80 + s * 22, 30); ctx.lineTo(80 + s * 18, 58); ctx.closePath(); body(ctx, shade(c2, -0.1)); }
    eyes(ctx, [[72, 70], [88, 70]], c2, 3.5);
  },
  boss3(ctx, c1, c2) {
    ctx.save(); ctx.shadowColor = c1; ctx.shadowBlur = 20;
    glowLine(ctx, c1, 3, () => { ctx.arc(80, 76, 66, 0, TAU); });
    ctx.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath(); ctx.moveTo(80 + Math.cos(a) * 44, 76 + Math.sin(a) * 44); ctx.lineTo(80 + Math.cos(a + 0.15) * 62, 76 + Math.sin(a + 0.15) * 62); ctx.lineTo(80 + Math.cos(a - 0.15) * 62, 76 + Math.sin(a - 0.15) * 62); ctx.closePath();
      body(ctx, i % 2 ? c1 : c2, "rgba(0,0,0,0.5)", 1.5);
    }
    ctx.beginPath(); ctx.arc(80, 76, 44, 0, TAU); body(ctx, grad(ctx, "#2a2f45", 36, 32, 124, 120));
    ctx.beginPath(); ctx.arc(80, 76, 28, 0, TAU); body(ctx, "#05030a", c2, 2);
    eyes(ctx, [[80, 76]], c1, 12);
    glowLine(ctx, c2, 2, () => { ctx.moveTo(52, 76); ctx.lineTo(108, 76); });
    ctx.beginPath(); ctx.moveTo(54, 118); ctx.lineTo(80, 152); ctx.lineTo(106, 118); body(ctx, grad(ctx, "#2a2f45", 54, 118, 106, 152));
  }
};

export function drawEnemy(canvas, art) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width / 160;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, 160, 160);
  ctx.lineJoin = "round";
  // ombre au sol
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(80, 150, 46, 7, 0, 0, TAU); ctx.fill();
  (KINDS[art.kind] || KINDS.drone)(ctx, art.c1 || "#5aa9ff", art.c2 || "#ff2a6d");
}
