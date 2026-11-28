// easter-egg/js/trail.js — traînée de curseur : des petits carrés néon (pixel-art) qui suivent la souris (ou le doigt) et
// s'éteignent doucement. Activée / désactivée en tapant « trail » (secret-code.js) et mémorisée d'une visite à l'autre.
// Les couleurs viennent du thème actif (--yellow, --cyan, --pink). Désactivée si « mouvement réduit » est demandé.
// Chargé à la demande par secret-code.js.

const KEY = "mc-trail";
const CELL = 6;                      // taille d'un carré (px) : la traînée est posée sur une grille, comme du pixel-art
const LIFE = 720;                    // durée de vie d'un carré (ms)
const MAX_CELLS = 260;
const FALLBACK = ["#fcee0a", "#00f0ff", "#ff2a6d"];

let state = null;                    // { canvas, ctx, cells, raf, last, dist, colors, onMove, onLeave, onResize, onTheme }

export const isTrailOn = () => state !== null;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const remembered = () => { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } };
const remember = (on) => { try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* sans importance */ } };

function readColors() {
  const style = getComputedStyle(document.documentElement);
  return ["--yellow", "--cyan", "--pink"].map((name, i) => {
    const value = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : FALLBACK[i];
  });
}

function enable() {
  if (state) return;
  const canvas = document.createElement("canvas");
  canvas.className = "mc-trail";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147482000;";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const s = { canvas, ctx, cells: new Map(), raf: 0, last: null, dist: 0, colors: readColors() };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const fit = () => {
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();

  // Pose un carré sur la grille ; s'il y en a déjà un, il est rallumé.
  const stamp = (x, y, now) => {
    const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    s.cells.set(key, { x: Math.floor(x / CELL) * CELL, y: Math.floor(y / CELL) * CELL, born: now, color: Math.floor(s.dist / 70) % 3 });
    if (s.cells.size > MAX_CELLS) s.cells.delete(s.cells.keys().next().value);
  };

  const draw = (now) => {
    s.raf = 0;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const [key, cell] of s.cells) {
      const age = (now - cell.born) / LIFE;
      if (age >= 1) { s.cells.delete(key); continue; }
      const size = Math.max(2, Math.round(CELL * (1 - age * 0.55)));
      const offset = Math.floor((CELL - size) / 2);
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = s.colors[cell.color];
      ctx.shadowColor = s.colors[cell.color];
      ctx.shadowBlur = 8;
      ctx.fillRect(cell.x + offset, cell.y + offset, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (s.cells.size) s.raf = window.requestAnimationFrame(draw);               // quand tout est éteint, on arrête de dessiner
  };

  s.onMove = (event) => {
    const now = performance.now();
    const x = event.clientX;
    const y = event.clientY;
    if (s.last) {                                                              // on comble l'espace entre deux positions de la souris
      const dx = x - s.last.x;
      const dy = y - s.last.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL));
      for (let i = 1; i <= steps; i++) { s.dist += Math.hypot(dx, dy) / steps; stamp(s.last.x + (dx * i) / steps, s.last.y + (dy * i) / steps, now); }
    } else {
      stamp(x, y, now);
    }
    if (Math.random() < 0.12) stamp(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22, now);   // une étincelle de temps en temps
    s.last = { x, y };
    if (!s.raf) s.raf = window.requestAnimationFrame(draw);
  };
  s.onLeave = () => { s.last = null; };
  s.onResize = fit;
  s.onTheme = () => { s.colors = readColors(); };

  window.addEventListener("pointermove", s.onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", s.onLeave);
  window.addEventListener("resize", s.onResize);
  window.addEventListener("mc-theme", s.onTheme);
  state = s;
}

function disable() {
  if (!state) return;
  const s = state;
  state = null;
  window.cancelAnimationFrame(s.raf);
  window.removeEventListener("pointermove", s.onMove);
  document.documentElement.removeEventListener("pointerleave", s.onLeave);
  window.removeEventListener("resize", s.onResize);
  window.removeEventListener("mc-theme", s.onTheme);
  s.canvas.remove();
}

// Appelé par le code « trail » : bascule la traînée. Renvoie { on, blocked }.
export function toggleTrail() {
  if (state) { disable(); remember(false); return { on: false, blocked: false }; }
  if (reducedMotion()) return { on: false, blocked: true };
  enable();
  remember(true);
  return { on: true, blocked: false };
}

// Au chargement d'une page : remet la traînée si elle était activée.
export function restoreTrail() {
  if (remembered() && !reducedMotion()) enable();
}
