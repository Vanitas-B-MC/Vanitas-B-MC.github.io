// easter-egg/js/nightcity.js — « Night City la nuit » : un économiseur d'écran qui se lance tout seul après 10 minutes
// sans toucher à rien (souris, clavier, toucher, molette). Une skyline en pixel-art sous la pluie, des fenêtres qui
// s'allument et s'éteignent, des enseignes au néon, des aérodynes qui passent. La moindre action le ferme.
//
// Les couleurs viennent du thème actif (--yellow, --cyan, --pink) : la ville change avec le style du site.
// Deux façons de le voir tout de suite : taper « nightcity » (secret-code.js) ou ajouter ?idle=5 à l'adresse
// (délai d'inactivité en secondes, utile pour tester). Chargé à la demande par secret-code.js.

export const IDLE_MS = 10 * 60 * 1000;           // délai d'inactivité par défaut : 10 minutes (mettre 20 * 60 * 1000 pour 20 min)
const SCALE = 3;                                  // un pixel du dessin = 3 pixels d'écran (look pixel-art, et peu de calcul)
const FRAME_MS = 1000 / 30;                       // 30 images par seconde suffisent
const GRACE_MS = 1200;                            // juste après le lancement, on ignore les actions (frappes du code, etc.)

let lastActivity = typeof performance !== "undefined" ? performance.now() : 0;
let scene = null;
let watching = false;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Délai d'inactivité : ?idle=<secondes> dans l'adresse pour tester, sinon 10 minutes.
export function idleDelay() {
  const seconds = Number(new URLSearchParams(window.location.search).get("idle"));
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400 ? seconds * 1000 : IDLE_MS;
}

/* ---------- Surveillance de l'inactivité ---------- */

export function watchIdle(delay = idleDelay()) {
  if (watching) return;
  watching = true;
  let x = -1;
  let y = -1;
  const bump = () => { lastActivity = performance.now(); };

  for (const type of ["keydown", "mousedown", "wheel", "touchstart", "pointerdown"]) {
    window.addEventListener(type, bump, { passive: true });
  }
  window.addEventListener("mousemove", (event) => {
    // Les petits tremblements de la souris ne comptent pas : il faut vraiment la bouger.
    if (x < 0 || Math.hypot(event.clientX - x, event.clientY - y) > 4) { x = event.clientX; y = event.clientY; bump(); }
  }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) bump(); });

  window.setInterval(() => {
    if (!scene && !document.hidden && performance.now() - lastActivity >= delay) startNightCity();
  }, 1000);
}

/* ---------- Habillage ---------- */

const STYLE = `
.nightcity {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: #02020a;
  opacity: 0;
  transition: opacity 1.4s ease;
  cursor: none;
}
.nightcity.is-on { opacity: 1; }
.nightcity:not(.is-on) { transition-duration: .4s; }
.nightcity canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.nightcity::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, transparent 52%, rgba(0, 0, 0, .6) 100%),
    repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0, 0, 0, .2) 2px 3px);
}
.nightcity-caption {
  position: absolute;
  left: clamp(18px, 3vw, 40px);
  top: clamp(16px, 3vw, 34px);
  z-index: 1;
  margin: 0;
  color: var(--cyan, #00f0ff);
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  font-size: clamp(11px, 1.4vw, 14px);
  letter-spacing: .3em;
  text-transform: uppercase;
  text-shadow: 0 0 12px currentColor;
}
.nightcity-caption strong { display: block; color: var(--yellow, #fcee0a); font-size: clamp(20px, 3.4vw, 38px); letter-spacing: .22em; font-weight: 700; }
.nightcity-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(14px, 3vh, 30px);
  z-index: 1;
  margin: 0;
  color: var(--muted, #a3a3bb);
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  font-size: 11px;
  letter-spacing: .24em;
  text-align: center;
  text-transform: uppercase;
  opacity: 0;
  animation: nightcity-hint 3s ease 5s forwards;
}
@keyframes nightcity-hint { to { opacity: .75; } }
@media (prefers-reduced-motion: reduce) {
  .nightcity { transition: none; }
  .nightcity-hint { animation: none; opacity: .75; }
}
`;

function addStyle() {
  if (document.getElementById("nightcity-style")) return;
  const style = document.createElement("style");
  style.id = "nightcity-style";
  style.textContent = STYLE;
  document.head.append(style);
}

/* ---------- Couleurs ---------- */

const cssColor = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
};
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// Mélange une couleur avec une autre (t = part de la première) et renvoie « r, g, b ».
const mix = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t))).join(", ");
const rand = (rng, lo, hi) => lo + rng() * (hi - lo);

/* ---------- La scène ---------- */

// Trois plans de bâtiments qui défilent à des vitesses différentes (plus c'est loin, plus c'est lent et pâle).
const LAYERS = [
  { speed: 2.5, minH: 0.28, maxH: 0.52, minW: 9, maxW: 20, body: [30, 24, 58], windows: 0.3, signs: 0, edge: 0 },
  { speed: 6, minH: 0.36, maxH: 0.66, minW: 13, maxW: 28, body: [18, 14, 38], windows: 0.4, signs: 0.12, edge: 0.18 },
  { speed: 13, minH: 0.44, maxH: 0.82, minW: 18, maxW: 40, body: [8, 6, 18], windows: 0.5, signs: 0.3, edge: 0.4 }
];

function createScene(canvas, reduced) {
  const ctx = canvas.getContext("2d");
  const rng = Math.random;
  const yellow = rgb(cssColor("--yellow", "#fcee0a"));
  const cyan = rgb(cssColor("--cyan", "#00f0ff"));
  const pink = rgb(cssColor("--pink", "#ff2a6d"));
  const palette = [yellow, cyan, pink];

  let W = 0;
  let H = 0;
  let sky = null;
  let fog = null;
  let layers = [];
  let stars = [];
  let drops = [];
  let cars = [];
  let nextCar = 1;

  function makeLayer(cfg) {
    const period = W + 80;
    const buildings = [];
    let x = 0;
    while (x < period) {
      let w = Math.round(rand(rng, cfg.minW, cfg.maxW));
      if (period - x - w < 8) w = period - x;                           // le dernier bâtiment finit pile à la fin de la période
      const h = Math.round(H * rand(rng, cfg.minH, cfg.maxH));
      const top = H - h;
      const windows = [];
      for (let c = 0; c < Math.floor((w - 2) / 3); c++) {
        for (let r = 0; r < Math.floor((h - 5) / 4); r++) {
          if (rng() < cfg.windows) windows.push({ x: x + 2 + c * 3, y: top + 3 + r * 4, duty: 0.25 + rng() * 0.6, phase: rng(), warm: rng() < 0.72 });
        }
      }
      const building = { x, w, top, windows };
      if (rng() < cfg.signs) building.sign = { x: x + (rng() < 0.5 ? 0 : w - 2), y: top + 3 + Math.floor(rng() * 6), h: 8 + Math.floor(rng() * 12), color: palette[Math.floor(rng() * 3)], phase: rng() * 6 };
      if (rng() < 0.35) building.antenna = { x: x + Math.floor(w / 2), y: top - 3 - Math.floor(rng() * 4), phase: rng() * 4 };
      buildings.push(building);
      x += w;
    }
    return { cfg, buildings, period };
  }

  function resize(width, height) {
    W = width;
    H = height;
    canvas.width = W;
    canvas.height = H;
    // Ciel : du noir en haut vers une lueur de la couleur du thème à l'horizon (fabriqué une seule fois)
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 1;
    skyCanvas.height = H;
    const sc = skyCanvas.getContext("2d");
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgb(2, 2, 10)");
    g.addColorStop(0.5, `rgb(${mix(pink, [4, 3, 14], 0.16)})`);
    g.addColorStop(0.82, `rgb(${mix(yellow, [4, 3, 14], 0.24)})`);
    g.addColorStop(1, `rgb(${mix(cyan, [4, 3, 14], 0.3)})`);
    sc.fillStyle = g;
    sc.fillRect(0, 0, 1, H);
    sky = skyCanvas;
    fog = ctx.createLinearGradient(0, H * 0.68, 0, H);
    fog.addColorStop(0, `rgba(${cyan.join(", ")}, 0)`);
    fog.addColorStop(1, `rgba(${cyan.join(", ")}, .22)`);
    layers = LAYERS.map(makeLayer);
    stars = Array.from({ length: Math.round(W / 6) }, () => ({ x: rng() * W, y: rng() * H * 0.4, phase: rng() * 6 }));
    drops = reduced ? [] : Array.from({ length: Math.round((W * H) / 380) }, () => ({ x: rng() * W, y: rng() * H, vy: rand(rng, 90, 170), len: 2 + Math.floor(rng() * 3) }));
    cars = [];
  }

  function spawnCar() {
    const dir = rng() < 0.5 ? 1 : -1;
    const far = rng() < 0.5;
    cars.push({
      x: dir > 0 ? -12 : W + 12,
      y: Math.round(H * rand(rng, 0.14, 0.52)),
      vx: dir * (far ? rand(rng, 14, 28) : rand(rng, 38, 70)),
      size: far ? 1 : 2,
      tail: palette[Math.floor(rng() * 3)]
    });
  }

  function drawLayer(layer, t) {
    const { cfg, buildings, period } = layer;
    const off = (t * cfg.speed) % period;
    const body = `rgb(${cfg.body.join(", ")})`;
    for (let k = -1; k <= Math.ceil(W / period) + 1; k++) {
      const shift = k * period - off;
      for (const b of buildings) {
        const bx = b.x + shift;
        if (bx > W || bx + b.w < 0) continue;
        ctx.fillStyle = body;
        ctx.fillRect(bx, b.top, b.w, H - b.top);
        if (cfg.edge) {                                                      // liseré de lumière sur le toit
          ctx.fillStyle = `rgba(${cyan.join(", ")}, ${cfg.edge})`;
          ctx.fillRect(bx, b.top, b.w, 1);
        }
        for (const w of b.windows) {
          if (((t * 0.05 + w.phase) % 1) > w.duty) continue;                  // fenêtre éteinte (elles s'allument et s'éteignent lentement)
          ctx.fillStyle = w.warm ? "rgba(255, 214, 120, .85)" : `rgba(${cyan.join(", ")}, .8)`;
          ctx.fillRect(w.x + shift, w.y, 2, 2);
        }
        if (b.sign) {                                                        // enseigne verticale au néon, qui grésille
          const on = ((t * 0.8 + b.sign.phase) % 4) < 3.3;
          const sx = b.sign.x + shift;
          ctx.fillStyle = `rgba(${b.sign.color.join(", ")}, ${on ? 0.2 : 0.05})`;
          ctx.fillRect(sx - 2, b.sign.y - 1, 6, b.sign.h + 2);
          ctx.fillStyle = `rgba(${b.sign.color.join(", ")}, ${on ? 1 : 0.2})`;
          ctx.fillRect(sx, b.sign.y, 2, b.sign.h);
        }
        if (b.antenna) {                                                     // balise rouge de l'antenne
          const on = ((t + b.antenna.phase) % 2) < 0.4;
          ctx.fillStyle = "rgba(255, 60, 60, .9)";
          ctx.fillRect(b.antenna.x + shift, b.antenna.y, 1, 1);
          if (on) { ctx.fillStyle = "rgba(255, 60, 60, .3)"; ctx.fillRect(b.antenna.x + shift - 1, b.antenna.y - 1, 3, 3); }
        }
      }
    }
  }

  function frame(t, dt) {
    ctx.drawImage(sky, 0, 0, 1, H, 0, 0, W, H);

    for (const s of stars) {                                                 // quelques étoiles, par-dessus la pollution lumineuse
      const a = 0.25 + 0.35 * Math.sin(t * 1.3 + s.phase) ** 2;
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    }

    drawLayer(layers[0], t);
    drawLayer(layers[1], t);

    // aérodynes : entre le plan du milieu et le premier plan
    if (!reduced) {
      nextCar -= dt;
      if (nextCar <= 0) { spawnCar(); nextCar = rand(rng, 1.2, 3.6); }
      cars = cars.filter((c) => c.x > -40 && c.x < W + 40);
      for (const c of cars) {
        c.x += c.vx * dt;
        const dir = Math.sign(c.vx);
        for (let i = 1; i <= 9; i++) {                                       // traînée de feu arrière
          ctx.fillStyle = `rgba(${c.tail.join(", ")}, ${0.5 - i * 0.05})`;
          ctx.fillRect(Math.round(c.x - dir * (3 + i * c.size)), c.y, c.size, 1);
        }
        ctx.fillStyle = "rgb(12, 10, 24)";
        ctx.fillRect(Math.round(c.x - 2 * c.size), c.y - 1, 4 * c.size, c.size + 1);
        ctx.fillStyle = "rgba(255, 255, 255, .95)";
        ctx.fillRect(Math.round(c.x + (dir > 0 ? 2 : -3) * c.size), c.y, c.size, c.size);
      }
    }

    drawLayer(layers[2], t);

    ctx.fillStyle = fog;
    ctx.fillRect(0, H * 0.68, W, H * 0.32);

    ctx.fillStyle = "rgba(170, 210, 255, .3)";                               // pluie
    for (const d of drops) {
      d.y += d.vy * dt;
      d.x -= 14 * dt;
      if (d.y > H) { d.y = -d.len; d.x = rng() * (W + 30); }
      if (d.x < -2) d.x += W + 4;
      ctx.fillRect(d.x | 0, d.y | 0, 1, d.len);
    }
  }

  return { resize, frame };
}

/* ---------- Lancer et arrêter ---------- */

export function startNightCity() {
  if (scene) return;
  addStyle();
  const reduced = prefersReducedMotion();

  const root = document.createElement("div");
  root.className = "nightcity";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "Night City la nuit : un économiseur d'écran. Bouge la souris ou appuie sur une touche pour revenir.");
  const canvas = document.createElement("canvas");
  const caption = document.createElement("p");
  caption.className = "nightcity-caption";
  const title = document.createElement("strong");
  title.textContent = "Night City";
  caption.append(title, "02:77 · il n'y a pas de matin ici");
  const hint = document.createElement("p");
  hint.className = "nightcity-hint";
  hint.textContent = "bouge la souris ou touche une touche pour revenir";
  root.append(canvas, caption, hint);
  document.body.append(root);

  const sceneObj = createScene(canvas, reduced);
  const size = () => sceneObj.resize(Math.ceil(window.innerWidth / SCALE), Math.ceil(window.innerHeight / SCALE));
  size();

  const startedAt = performance.now();
  let raf = 0;
  let last = startedAt;
  let drawn = 0;
  let anchor = null;

  const loop = (now) => {
    raf = window.requestAnimationFrame(loop);
    if (now - drawn < (reduced ? 1500 : FRAME_MS)) return;                    // mouvement réduit : une image par seconde et demie
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    drawn = now;
    sceneObj.frame((now - startedAt) / 1000, reduced ? 0 : dt);
  };

  const onActivity = (event) => {
    if (performance.now() - startedAt < GRACE_MS) return;
    if (event.type === "mousemove") {
      if (!anchor) { anchor = { x: event.clientX, y: event.clientY }; return; }
      if (Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) < 6) return;
    }
    stopNightCity();
  };
  const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"];
  for (const type of events) window.addEventListener(type, onActivity, { passive: true, capture: true });
  window.addEventListener("resize", size);

  scene = {
    root,
    stop() {
      window.cancelAnimationFrame(raf);
      for (const type of events) window.removeEventListener(type, onActivity, { capture: true });
      window.removeEventListener("resize", size);
      lastActivity = performance.now();                                       // le compte à rebours repart de zéro
      root.classList.remove("is-on");
      window.setTimeout(() => root.remove(), reduced ? 0 : 500);
    }
  };

  raf = window.requestAnimationFrame(loop);
  window.requestAnimationFrame(() => root.classList.add("is-on"));
}

export function stopNightCity() {
  if (!scene) return;
  const current = scene;
  scene = null;
  current.stop();
}

export const isNightCityOn = () => scene !== null;
