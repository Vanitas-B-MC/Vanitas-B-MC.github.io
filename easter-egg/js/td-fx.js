// js/td-fx.js — dessin des tirs et des explosions du Tower Defense « Pare-feu ».
// La logique (td.js) ne fait qu'ajouter des effets dans state.fx ; chaque effet est dessiné ici selon son `style`
// (le type de tour qui a tiré) : boule de plasma, obus en cloche, éclair, éclat de glace, balle traçante…
//
// Un effet a une durée de vie `max` (s) et `ttl` (temps restant). `delay` : l'effet n'apparaît qu'après ce délai
// (l'explosion d'un obus attend que l'obus arrive). p va de 0 (début) à 1 (fin).

const INK = "#0d0d16";

// Petit générateur pseudo-aléatoire : un effet garde la même forme d'une image à l'autre.
function rand(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

function line(ctx, x1, y1, x2, y2, color, width, glow = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function orb(ctx, x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function flash(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.4 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Éclair : ligne brisée entre deux points, qui change de forme quelques fois pendant sa vie.
function lightning(ctx, f, p, glowColor, coreColor) {
  const r = rand(f.seed + Math.floor(p * 4) * 977);
  const dx = f.x2 - f.x1, dy = f.y2 - f.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const n = Math.max(3, Math.round(len / 14));
  const pts = [[f.x1, f.y1]];
  for (let i = 1; i < n; i++) {
    const off = (r() - 0.5) * 14;
    pts.push([f.x1 + (dx * i) / n + nx * off, f.y1 + (dy * i) / n + ny * off]);
  }
  pts.push([f.x2, f.y2]);
  const trace = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.globalAlpha = 1 - p * 0.7;
  ctx.lineJoin = "round";
  ctx.strokeStyle = glowColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3.5;
  trace();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = 1.3;
  trace();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawShot(ctx, f, p) {
  const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
  const at = (t) => [lerp(f.x1, f.x2, t), lerp(f.y1, f.y2, t)];
  const fade = 1 - p;
  switch (f.style) {
    case "laser": {
      ctx.globalAlpha = fade;
      line(ctx, f.x1, f.y1, f.x2, f.y2, f.color, f.paragon ? 5 : 3, 10);
      line(ctx, f.x1, f.y1, f.x2, f.y2, "#ffffff", 1.2);
      flash(ctx, f.x2, f.y2, 5, "#ffffff", fade);
      break;
    }
    case "super": {
      // Deux traits d'énergie bleus parallèles, comme des rafales
      const nx = -Math.sin(ang) * 3, ny = Math.cos(ang) * 3;
      const t1 = Math.min(1, p * 1.8), t0 = Math.max(0, t1 - 0.45);
      const [ax, ay] = at(t0), [bx, by] = at(t1);
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        line(ctx, ax + nx * s, ay + ny * s, bx + nx * s, by + ny * s, "#6bd0ff", 3, 8);
        line(ctx, ax + nx * s, ay + ny * s, bx + nx * s, by + ny * s, "#e8f8ff", 1.2);
      }
      break;
    }
    case "sniper":
    case "desperado":
    case "gatling": {
      // Balle traçante : un court trait lumineux qui file vers la cible, flamme à la sortie du canon
      const speed = f.style === "gatling" ? 1.3 : 1.6;
      const t1 = Math.min(1, p * speed), t0 = Math.max(0, t1 - (f.style === "sniper" ? 0.5 : 0.22));
      const [ax, ay] = at(t0), [bx, by] = at(t1);
      const col = f.style === "sniper" ? "#fff3a0" : f.style === "desperado" ? "#ffc27a" : "#ffe08a";
      ctx.lineCap = "round";
      if (t1 < 1) line(ctx, ax, ay, bx, by, col, f.style === "gatling" ? 1.8 : 2.4, 6);
      if (p < 0.35) flash(ctx, f.x1 + Math.cos(ang) * 12, f.y1 + Math.sin(ang) * 12, f.style === "gatling" ? 4 : 6, "#ffd166", 1 - p / 0.35);
      if (t1 >= 1) flash(ctx, f.x2, f.y2, 4, "#ffffff", fade);
      break;
    }
    case "canon": {
      // Boule de plasma avec une traînée
      for (let k = 3; k >= 1; k--) {
        const [tx, ty] = at(Math.max(0, p - k * 0.08));
        ctx.globalAlpha = 0.25 / k;
        orb(ctx, tx, ty, 7 - k, "#ffb347", "rgba(255,90,20,0)");
      }
      ctx.globalAlpha = 1;
      const [x, y] = at(p);
      ctx.shadowColor = "#ff8a3d";
      ctx.shadowBlur = 12;
      orb(ctx, x, y, 8, "#ffd27a", "rgba(255,110,30,0.15)");
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff4d6";
      ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "mortier": {
      // Obus tiré en cloche : ombre au sol, obus en hauteur, mèche qui fume
      const dist = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
      const hgt = Math.sin(Math.PI * p) * Math.min(70, 20 + dist * 0.35);
      const [gx, gy] = at(p);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(gx, gy, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      for (let k = 1; k <= 3; k++) {
        const q = Math.max(0, p - k * 0.06);
        const [sx, sy] = at(q);
        const sh = Math.sin(Math.PI * q) * Math.min(70, 20 + dist * 0.35);
        ctx.globalAlpha = 0.3 / k;
        ctx.fillStyle = "#c8c8d0";
        ctx.beginPath(); ctx.arc(sx, sy - sh, 2.5 + k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const s = 5.5 + Math.sin(Math.PI * p) * 2.5;    // plus gros en haut de la cloche
      ctx.fillStyle = "#8f98ab";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gx, gy - hgt, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#d9deea";
      ctx.beginPath(); ctx.arc(gx - s * 0.3, gy - hgt - s * 0.3, s * 0.35, 0, Math.PI * 2); ctx.fill();
      flash(ctx, gx + s * 0.7, gy - hgt - s * 0.7, 4.5, "#ffb347", 1);
      break;
    }
    case "cryo": {
      // Éclat de glace (losange) avec quelques flocons derrière
      const [x, y] = at(p);
      for (let k = 1; k <= 3; k++) {
        const [tx, ty] = at(Math.max(0, p - k * 0.1));
        ctx.globalAlpha = 0.5 / k;
        ctx.fillStyle = "#e6f9ff";
        ctx.beginPath(); ctx.arc(tx, ty, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = "#bff0ff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#7fd8ff";
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, -4); ctx.lineTo(-7, 0); ctx.lineTo(0, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      if (p > 0.85) flash(ctx, f.x2, f.y2, 6, "#e6f9ff", (1 - p) / 0.15);
      break;
    }
    case "venin": {
      // Goutte de toxine verte
      const [x, y] = at(p);
      for (let k = 1; k <= 2; k++) {
        const [tx, ty] = at(Math.max(0, p - k * 0.12));
        ctx.globalAlpha = 0.4 / k;
        ctx.fillStyle = "#3ddc84";
        ctx.beginPath(); ctx.arc(tx, ty, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = "#3ddc84";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "#3ddc84";
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#c9ffe0";
      ctx.beginPath(); ctx.arc(2, -1.5, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case "wizard": {
      // Boule de feu (chemin Feu) ou orbe arcanique violet, avec étincelles
      const [x, y] = at(p);
      const r = rand(f.seed);
      const fire = f.fire;
      for (let k = 0; k < 5; k++) {
        const q = Math.max(0, p - 0.05 - r() * 0.2);
        const [tx, ty] = at(q);
        ctx.globalAlpha = 0.5 * (1 - (p - q) * 4);
        ctx.fillStyle = fire ? (k % 2 ? "#ffb347" : "#ff5a1f") : (k % 2 ? "#e2c6ff" : "#b06bff");
        ctx.beginPath(); ctx.arc(tx + (r() - 0.5) * 5, ty + (r() - 0.5) * 5, 1.5 + r() * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = fire ? "#ff5a1f" : "#b06bff";
      ctx.shadowBlur = 12;
      if (fire) orb(ctx, x, y, 8.5, "#ffd27a", "rgba(255,70,20,0.1)");
      else orb(ctx, x, y, 8, "#d7b5ff", "rgba(140,60,255,0.1)");
      ctx.shadowBlur = 0;
      break;
    }
    case "tesla":
    case "chain":
      lightning(ctx, f, p, "#b58cff", "#f3ecff");
      break;
    case "arcane":
      lightning(ctx, f, p, "#ff6bd6", "#ffe6fa");
      break;
    case "spread": {
      // Contagion : pointillés verts qui relient la cible à ses voisins
      ctx.globalAlpha = fade * 0.9;
      ctx.setLineDash([2, 4]);
      ctx.lineDashOffset = -p * 20;
      line(ctx, f.x1, f.y1, f.x2, f.y2, "#3ddc84", 2);
      ctx.setLineDash([]);
      break;
    }
    case "glue": {
      // Paquet de glu qui s'étire en vol, avec des filaments
      const [x, y] = at(p);
      const [tx, ty] = at(Math.max(0, p - 0.18));
      ctx.lineCap = "round";
      line(ctx, tx, ty, x, y, "rgba(212, 255, 58, 0.45)", 3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = "#d4ff3a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 4.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f6ffd0";
      ctx.beginPath(); ctx.arc(2, -1.5, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (p > 0.85) flash(ctx, f.x2, f.y2, 7, "#d4ff3a", (1 - p) / 0.15);
      break;
    }
    case "alchemist": {
      // Fiole d'acide qui tournoie en cloche, gouttes vertes derrière
      const dist = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
      const hgt = Math.sin(Math.PI * p) * Math.min(30, dist * 0.25);
      const [x, y] = at(p);
      for (let k = 1; k <= 3; k++) {
        const [tx, ty] = at(Math.max(0, p - k * 0.08));
        ctx.globalAlpha = 0.45 / k;
        ctx.fillStyle = "#9cff6b";
        ctx.beginPath(); ctx.arc(tx, ty - Math.sin(Math.PI * Math.max(0, p - k * 0.08)) * Math.min(30, dist * 0.25), 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y - hgt);
      ctx.rotate(p * 12);
      ctx.fillStyle = "#cfd6e2";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(-1.5, -7, 3, 4, 1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case "potion": {
      // Potion lancée à une tour alliée : arc rose et étincelles à l'arrivée
      const hgt = Math.sin(Math.PI * p) * 22;
      const [x, y] = at(p);
      ctx.fillStyle = "#f07cff";
      ctx.shadowColor = "#f07cff";
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y - hgt, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (p > 0.8) {
        const r = rand(f.seed || 3);
        ctx.globalAlpha = (1 - p) / 0.2;
        ctx.fillStyle = "#ffd6fb";
        for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2, d = 6 + r() * 8; ctx.beginPath(); ctx.arc(f.x2 + Math.cos(a) * d, f.y2 + Math.sin(a) * d, 1.4, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "satellite": {
      // Rayon orbital : il tombe du haut de l'écran sur la cible
      const sx = f.x2, sy = -20;
      const w = (f.paragon ? 12 : 8) * (1 - p * 0.6);
      ctx.globalAlpha = 1 - p * 0.8;
      ctx.lineCap = "round";
      line(ctx, sx, sy, f.x2, f.y2, "#8fb3ff", w * 1.8, 16);
      line(ctx, sx, sy, f.x2, f.y2, "#e0e6ff", w * 0.8, 8);
      line(ctx, sx, sy, f.x2, f.y2, "#ffffff", w * 0.3);
      flash(ctx, f.x2, f.y2, 10 * (1 - p) + 4, "#ffffff", 1 - p);
      break;
    }
    case "sonic": {
      // Onde de choc : trois arcs qui filent le long de la ligne
      const w = (f.w || 14) + 2;
      for (let k = 0; k < 3; k++) {
        const q = Math.min(1, p * 1.3 + k * 0.12);
        if (q >= 1) continue;
        const [x, y] = at(q);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.strokeStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-w * 0.6, 0, w, -0.9, 0.9);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "drone": {
      // Rafale de mitrailleuse du drone
      const t1 = Math.min(1, p * 1.5), t0 = Math.max(0, t1 - 0.35);
      const [ax, ay] = at(t0), [bx, by] = at(t1);
      ctx.lineCap = "round";
      if (t1 < 1) line(ctx, ax, ay, bx, by, "#cfe0ff", 1.8, 6);
      if (p < 0.3) flash(ctx, f.x1, f.y1, 3.5, "#ffe08a", 1 - p / 0.3);
      if (t1 >= 1) flash(ctx, f.x2, f.y2, 3.5, "#ffffff", fade);
      break;
    }
    default: {
      ctx.globalAlpha = fade;
      line(ctx, f.x1, f.y1, f.x2, f.y2, f.color, 2.5, 6);
    }
  }
}

// Pointes du Tack Shooter : elles partent de la tour et filent jusqu'au bout de la portée.
function drawTack(ctx, f, p) {
  const d = 10 + (f.len - 10) * p;
  const x = f.x1 + f.ux * d, y = f.y1 + f.uy * d;
  ctx.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(f.uy, f.ux));
  if (f.fire) {
    ctx.fillStyle = "rgba(255, 138, 61, 0.45)";
    ctx.beginPath(); ctx.ellipse(-6, 0, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  const len = f.blade ? 12 : 9;
  ctx.fillStyle = f.fire ? "#ffb347" : f.blade ? "#f2f6ff" : "#e3e7ef";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-4, -3.2);
  ctx.lineTo(-4, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

const BOOM_COLORS = { glue: ["#f6ffd0", "#b8e62a"], alchemist: ["#e8ffd6", "#7be04a"], canon: ["#fff1c1", "#ff8a3d"], mortier: ["#fff1c1", "#ff6a1f"], wizard: ["#ffe2a8", "#ff5a1f"], cryo: ["#ffffff", "#7fd8ff"], super: ["#ffffff", "#6bd0ff"] };

function drawBoom(ctx, f, p) {
  const fade = 1 - p;
  if (f.style === "ring") {
    // Onde du Pulsar : deux anneaux qui s'élargissent
    for (const lag of [0, 0.25]) {
      const q = Math.max(0, p - lag) / (1 - lag);
      if (q <= 0) continue;
      ctx.globalAlpha = (1 - q) * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4 * (1 - q) + 1;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * q, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (f.style === "paragon") {
    // Naissance d'un paragon : anneaux dorés et rayons
    ctx.globalAlpha = fade;
    ctx.strokeStyle = "#fcee0a";
    ctx.shadowColor = "#fcee0a";
    ctx.shadowBlur = 16;
    for (const k of [0.5, 0.8, 1]) { ctx.lineWidth = 3 * fade + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * p * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 + p;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(a) * f.r * p * 0.3, f.y + Math.sin(a) * f.r * p * 0.3);
      ctx.lineTo(f.x + Math.cos(a) * f.r * p * 1.1, f.y + Math.sin(a) * f.r * p * 1.1);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    return;
  }
  // Explosion : boule de feu (dégradé), onde de choc, éclats, puis un peu de fumée
  const [inner, outer] = BOOM_COLORS[f.style] || ["#ffffff", f.color];
  const grow = 0.45 + 0.65 * Math.sqrt(p);
  ctx.globalAlpha = fade;
  const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * grow);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r * grow, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = outer;
  ctx.lineWidth = 2.5 * fade + 0.5;
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + 0.6 * p), 0, Math.PI * 2); ctx.stroke();
  const r = rand(f.seed || 1);
  ctx.strokeStyle = inner;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2;
    const d0 = f.r * (0.3 + 0.7 * p), d1 = d0 + 4 + r() * 5;
    ctx.beginPath();
    ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0);
    ctx.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1);
    ctx.stroke();
  }
  if (f.style === "canon" || f.style === "mortier") {
    ctx.globalAlpha = 0.25 * Math.sin(Math.PI * p);
    ctx.fillStyle = "#8a8f9c";
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * f.r * 0.4, f.y + Math.sin(a) * f.r * 0.4 - p * 6, f.r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Cône de flammes du Lance-flammes : langues de feu (orange, ou bleues en plasma) dans l'angle du tir.
function drawCone(ctx, f, p) {
  const r = rand(f.seed || 1);
  const n = 14;
  const hot = f.plasma ? ["#e8f8ff", "#6bd0ff", "#3a6bff"] : ["#fff1c1", "#ffb347", "#ff5a1f"];
  for (let i = 0; i < n; i++) {
    const a = f.a + (r() - 0.5) * 2 * f.spread;
    const d = f.r * (0.35 + 0.65 * Math.min(1, p * 1.8 + r() * 0.3));
    const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
    const size = 3 + r() * 5 * (0.5 + d / f.r);
    ctx.globalAlpha = (1 - p) * 0.75;
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, hot[0]);
    g.addColorStop(0.5, hot[1]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFx(ctx, f) {
  const elapsed = f.max - f.ttl;
  const delay = f.delay || 0;
  if (elapsed < delay) return;
  const p = Math.max(0, Math.min(1, (elapsed - delay) / Math.max(0.001, f.max - delay)));
  ctx.save();
  if (f.kind === "shot") drawShot(ctx, f, p);
  else if (f.kind === "tack") drawTack(ctx, f, p);
  else if (f.kind === "cone") drawCone(ctx, f, p);
  else if (f.kind === "boom") drawBoom(ctx, f, p);
  else if (f.kind === "beam") {
    // Rayons des capacités (Tir fatal, Tempête…)
    ctx.globalAlpha = 1 - p;
    line(ctx, f.x1, f.y1, f.x2, f.y2, f.color, (f.w || 2) + 1.5, 10);
    line(ctx, f.x1, f.y1, f.x2, f.y2, "#ffffff", 1);
  }
  ctx.restore();
}
