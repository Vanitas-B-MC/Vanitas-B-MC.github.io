// js/ui-city.js — interface de « Cité des Âges » (logique : city.js · dessins : city-art.js).
//
// Souris : clic gauche = outil choisi (glisser pour tracer des routes, poser des habitations en rectangle ou démolir
// une zone) · clic droit / molette enfoncée ou outil « Inspecter » + glisser = déplacer la vue · molette = zoom.
// Tactile : un doigt = outil (ou déplacer avec « Inspecter »), deux doigts = déplacer et zoomer.
// Clavier : flèches / ZQSD = déplacer · + / − = zoom · Espace = pause · 1 2 3 = vitesse · Échap = inspecter.

import * as C from "./city.js";
import * as A from "./city-art.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";
import { wealthBonus } from "./rewards.js";

const { N } = C;
const HW = A.TW / 2, HH = A.TH / 2;
const SPEEDS = [0, 1, 2.5, 6];                  // mois par seconde
const SAVE_EVERY = 5000;
const SCALES = [0.75, 1.5, 3];                  // résolutions des sprites
const NIGHT_TINT = ["#4a5890", "#4a5890", "#48548c", "#48548c", "#4a4c78", "#465284", "#3e4e88", "#4a307e"];
const SKY_DAY = [["#9fd0e8", "#e9f2dc"], ["#a6d3ec", "#f1ecd6"], ["#9cc6e0", "#e6e8dc"], ["#a2c8e4", "#efe6d4"], ["#a9b6c0", "#d9cfbf"], ["#9cc2e0", "#e3ebf0"], ["#8fc7ef", "#eaf5fb"], ["#3a2a5c", "#a54a7a"]];
const SKY_NIGHT = ["#060914", "#141a33"];
const WALKER_COLORS = [
  ["#8a5a3a", "#6b4a2c", "#a07a4a"], ["#e9e2d0", "#b9573a", "#2e6ea6"], ["#7a3a2a", "#3a5a3a", "#6b5246"], ["#2e4a7a", "#8a2a3a", "#c9a13a"],
  ["#3a3a3a", "#5a4a3a", "#2a3a5a"], ["#d24a3a", "#2a52a0", "#e0c35a"], ["#18b0a0", "#e0e0e0", "#3a6ad2"], ["#ff2a6d", "#05d9e8", "#fcee0a"]
];
const CAR_COLORS = ["#d24a3a", "#2a52a0", "#e0e0e0", "#2a2a2a", "#e0c35a", "#3a8a5a", "#9a3ad2"];

const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function costText(cost) {
  const parts = Object.entries(cost).map(([k, v]) => `${C.RES_ICONS[k]} ${fmtShort(v)}`);
  return parts.length ? parts.join("  ") : "Gratuit";
}

export function createCityUI(root, wallet) {
  const S = () => wallet.data.city;
  let W = C.makeWorld(S());
  W._for = wallet.data.city;
  let active = false, rafId = 0, lastFrame = 0, acc = 0;
  let speed = 1;
  let tool = "inspect";             // inspect | road | bulldoze | build
  let buildId = null;
  let cat = "house";
  let tab = "era";
  let selected = -1;                // index du bâtiment inspecté
  let overlay = "none";
  let lightMode = "auto";           // auto | day | night
  let hover = null;                 // case sous la souris
  let drag = null;
  const pointers = new Map();
  let pinch = null;
  const keys = new Set();
  let cam = { x: 0, y: 0, z: 1.2 };
  let vw = 800, vh = 500, dpr = 1;
  let tod = 0.3;                    // moment de la journée (0 aube, 0,25 midi, 0,5 crépuscule, 0,75 minuit)
  let needSave = false, lastSave = 0, lastHud = 0, lastSide = 0, lastMini = 0;
  let objects = [], objVersion = -1, objEra = -1;
  let agents = [], flyers = [], particles = [];
  let rain = 0, rainTarget = 0, weatherTimer = 0;
  let clouds = [];
  let log = [];
  const cache = new Map();
  const iconCache = new Map();
  let built = 0;                    // sprites fabriqués pendant cette image (on étale le travail)

  /* ================= Squelette ================= */

  const board = h("canvas", { class: "cb-canvas", "aria-label": "La ville, vue en isométrique", tabindex: "0" });
  const g = board.getContext("2d");
  const toast = h("p", { class: "game-toast cb-toast", "aria-live": "polite" });
  const tip = h("div", { class: "cb-tip", hidden: true });
  const mini = h("canvas", { class: "cb-mini", width: String(N), height: String(N), title: "Mini-carte : clique pour t'y rendre" });
  const miniWrap = h("div", { class: "cb-mini-wrap" }, mini);
  const modalEl = h("div", { class: "cb-modal", hidden: true });

  const speedButtons = [["⏸", "Pause"], ["▶", "Vitesse normale"], ["▶▶", "Rapide"], ["▶▶▶", "Très rapide"]].map(([label, title], i) =>
    h("button", { class: "cb-chip-btn", type: "button", title, "aria-label": title, onclick: () => setSpeed(i) }, label));
  const lightButton = h("button", { class: "cb-chip-btn", type: "button", title: "Cycle jour / nuit", onclick: () => cycleLight() }, "◐");
  const fsButton = h("button", { class: "cb-chip-btn", type: "button", title: "Plein écran", onclick: () => toggleFullscreen() }, "⛶");
  fsButton.hidden = !document.fullscreenEnabled;
  const stageBar = h("div", { class: "cb-stagebar" }, h("div", { class: "cb-speed" }, speedButtons), lightButton, fsButton);

  const stage = h("div", { class: "game-stage cb-stage" }, board, stageBar, miniWrap, toast, tip, modalEl);

  // barre du haut : ère + ressources
  const eraEl = h("strong", { class: "cb-era-name" });
  const yearEl = h("span", { class: "cb-year" });
  const stat = (key, title) => {
    const v = h("strong", {});
    const r = h("small", {});
    const el = h("div", { class: `cb-res cb-res-${key}`, title }, h("span", { class: "cb-res-icon", "aria-hidden": "true" }, key === "pop" ? "👥" : key === "happy" ? "🙂" : C.RES_ICONS[key]), h("span", { class: "cb-res-val" }, v, r));
    return { el, v, r };
  };
  const hudStats = {
    pop: stat("pop", "Habitants (logements)"), happy: stat("happy", "Bonheur moyen"),
    food: stat("food", "Nourriture"), wood: stat("wood", "Bois"), stone: stat("stone", "Pierre"), metal: stat("metal", "Métal"),
    gold: stat("gold", "Or"), know: stat("know", "Savoir"), energy: stat("energy", "Énergie (produite / demandée)")
  };
  const hud = h("div", { class: "cb-hud" }, h("div", { class: "cb-era" }, eraEl, yearEl), h("div", { class: "cb-resbar" }, Object.values(hudStats).map((s) => s.el)));

  // outils + palette
  const toolButtons = {};
  const mkTool = (id, label, title) => (toolButtons[id] = h("button", { class: "cb-tool", type: "button", title, onclick: () => setTool(id) }, label));
  const tools = h("div", { class: "cb-tools" },
    mkTool("inspect", "🔍 Inspecter", "Inspecter un bâtiment, ou glisser pour déplacer la vue (Échap)"),
    mkTool("road", "🛣 Route", "Tracer des routes (glisser)"),
    mkTool("bulldoze", "💥 Démolir", "Démolir (glisser pour une zone). Rembourse 25 %. Rase aussi forêts et rochers."));
  const catTabs = h("div", { class: "cb-cats", role: "tablist" }, C.CATS.map(([id, label]) =>
    h("button", { class: "cb-cat", type: "button", role: "tab", "data-cat": id, onclick: () => { cat = id; renderPalette(); } }, label)));
  const palette = h("div", { class: "cb-palette" });
  const buildCard = h("div", { class: "cb-buildcard" });
  const toolbar = h("div", { class: "cb-toolbar" }, h("div", { class: "cb-toolrow" }, tools, catTabs), palette, buildCard);

  const sideTabs = [["era", "Ère"], ["city", "Ville"], ["info", "Infos"], ["help", "Aide"]];
  const sideTabBar = h("div", { class: "td-maps cb-sidetabs", role: "tablist" }, sideTabs.map(([id, label]) =>
    h("button", { class: "map-button", type: "button", role: "tab", "data-tab": id, onclick: () => { tab = id; renderSide(true); } }, label)));
  const sideBody = h("div", { class: "cb-side-body" });

  const main = h("div", { class: "cb-main" }, hud, h("div", { class: "sv-board-wrap chamfer cb-wrap" }, stage), toolbar);
  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Fais grandir ta cité de la préhistoire jusqu'au Cyberpunk. Trace des routes, loge tes habitants, nourris-les, couvre-les de services (eau, culte, santé, école, loisirs, commerce, sécurité) pour que leurs maisons montent de niveau, puis accumule savoir et ressources pour changer d'ère : toute la ville se transforme. ",
      "Chaque nouvelle ère et chaque succès rapportent des pièces bleues et des crédits à l'arcade."),
    h("div", { class: "cb-layout" }, main, h("aside", { class: "sv-side cb-side" }, sideTabBar, sideBody))
  );

  /* ================= Utilitaires ================= */

  let toastTimer = 0;
  function say(text, tone = "") {
    if (!text) return;
    toast.textContent = text;
    toast.dataset.tone = tone;
    toast.classList.remove("is-on"); void toast.offsetWidth; toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 3200);
  }
  function addLog(text, tone = "") {
    log.unshift({ text, tone, y: C.yearOf(S()) });
    log = log.slice(0, 10);
  }
  const touched = () => { needSave = true; };
  function save(force = false) {
    if (!force && !needSave) return;
    needSave = false;
    lastSave = performance.now();
    S().cam = { x: Math.round(cam.x), y: Math.round(cam.y), z: Math.round(cam.z * 100) / 100 };
    wallet.saveCity();
  }

  function icon(def) {
    const era = S().era;
    const key = `${def.id}|${def.id === "house" || def.id === "center" ? era : def.era}`;
    if (!iconCache.has(key)) iconCache.set(key, A.iconCanvas(def, def.id === "house" ? era : def.era).toDataURL());
    return iconCache.get(key);
  }

  function award(id) {
    const a = C.ACHIEVEMENTS.find((k) => k.id === id);
    if (!a) return;
    wallet.addBlue(a.blue);
    say(`Succès : ${a.name} ! +${a.blue} pièce${a.blue > 1 ? "s" : ""} bleue${a.blue > 1 ? "s" : ""}`, "win");
    addLog(`Succès « ${a.name} » (+${a.blue} pièces bleues)`, "win");
  }

  /* ================= Caméra et coordonnées ================= */

  const tileTop = (x, y) => [(x - y) * HW, (x + y) * HH];
  function screenToWorld(sx, sy) { return [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y]; }
  function screenToTile(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    const fx = (wy / HH + wx / HW) / 2, fy = (wy / HH - wx / HW) / 2;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }
  function clampCam() {
    cam.z = clamp(cam.z, 0.45, 3);
    cam.x = clamp(cam.x, -N * HW, N * HW);
    cam.y = clamp(cam.y, 0, N * A.TH);
  }
  function centerOn(x, y) { const [wx, wy] = tileTop(x, y); cam.x = wx; cam.y = wy + HH; clampCam(); }
  function zoomAt(sx, sy, factor) {
    const [wx, wy] = screenToWorld(sx, sy);
    cam.z = clamp(cam.z * factor, 0.45, 3);
    cam.x = wx - (sx - vw / 2) / cam.z;
    cam.y = wy - (sy - vh / 2) / cam.z;
    clampCam();
  }
  const scaleBucket = () => { const want = cam.z * dpr; return SCALES.find((s) => s >= want * 0.95) ?? SCALES[SCALES.length - 1]; };

  function resize() {
    const rect = board.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = Math.max(200, rect.width); vh = Math.max(150, rect.height);
    board.width = Math.round(vw * dpr); board.height = Math.round(vh * dpr);
  }
  const ro = new ResizeObserver(() => { if (active) resize(); });
  ro.observe(stage);

  const fsTarget = () => main;
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else fsTarget().requestFullscreen?.().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === fsTarget();
    fsTarget().classList.toggle("is-fullscreen", on);
    fsButton.textContent = on ? "✕" : "⛶";
    setTimeout(resize, 50);
  });

  /* ================= Sprites (avec cache) ================= */

  function sprite(key, make, allowBuild = true) {
    const sc = scaleBucket();
    const k = `${sc}|${key}`;
    let sp = cache.get(k);
    if (sp) return sp;
    if (!allowBuild || built > 30) {
      for (const s2 of SCALES) { const alt = cache.get(`${s2}|${key}`); if (alt) return alt; }
      if (built > 30) return null;
    }
    built++;
    sp = make(sc);
    cache.set(k, sp);
    if (cache.size > 2600) { // on oublie les plus vieux
      let n = 0; for (const key2 of cache.keys()) { cache.delete(key2); if (++n > 600) break; }
    }
    return sp;
  }

  function buildingKey(b, def, era) {
    if (def.id === "house") return `h|${era}|${b.l}|${b.v % 4}`;
    if (def.id === "center") return `c|${era}`;
    return `b|${def.id}`;
  }
  function spriteFor(b) {
    const def = C.BY_ID[b.t];
    const era = def.id === "house" || def.id === "center" ? S().era : def.era;
    return sprite(buildingKey(b, def, era), (sc) => A.buildingSprite(def, b, era, sc));
  }

  /* ================= Liste des objets triés (bâtiments, arbres, lampadaires) ================= */

  function rebuildObjects() {
    const st = S();
    objects = [];
    const era = st.era;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = C.idx(x, y);
      if (W.occ[k] >= 0 || W.road[k]) continue;
      const t = W.terr[k];
      if (t === C.T.FOREST || t === C.T.ROCK || t === C.T.ORE) objects.push({ d: x + y, x, y, s: 1, kind: "nature", t, v: hash(x, y) % 6 });
    }
    st.b.forEach((b, i) => {
      const s = C.BY_ID[b.t].size;
      objects.push({ d: b.x + b.y + (s - 1) * 2, x: b.x, y: b.y, s, kind: "b", i });
    });
    if (era >= 2) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!W.road[C.idx(x, y)] || hash(x, y) % 4 !== 0) continue;
      objects.push({ d: x + y - 0.4, x, y, s: 1, kind: "lamp" });
    }
    objects.sort((a, b) => a.d - b.d || a.x - b.x);
    objVersion = W.version; objEra = era;
  }

  /* ================= Habitants et véhicules ================= */

  const roadAt = (x, y) => C.inside(x, y) && W.road[C.idx(x, y)] === 1;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function randomRoad() {
    for (let i = 0; i < 40; i++) { const x = Math.floor(Math.random() * N), y = Math.floor(Math.random() * N); if (roadAt(x, y)) return [x, y]; }
    return null;
  }
  function nextDir(a) {
    const opts = [];
    for (let d = 0; d < 4; d++) { const [dx, dy] = DIRS[d]; if (roadAt(a.tx + dx, a.ty + dy)) opts.push(d); }
    if (!opts.length) return -1;
    const fwd = opts.filter((d) => d !== (a.dir + 2) % 4);
    const list = fwd.length ? fwd : opts;
    if (list.includes(a.dir) && Math.random() < 0.6) return a.dir;
    return list[Math.floor(Math.random() * list.length)];
  }
  function updateAgents(dt) {
    const st = S();
    let roads = 0; for (let i = 0; i < N * N; i++) roads += W.road[i];
    const wantWalk = Math.min(160, Math.floor(roads * 0.45), 4 + Math.floor(W.pop / 5));
    const wantCars = st.era >= 4 ? Math.min(70, Math.floor(roads * 0.18), Math.floor(W.pop / 25)) : st.era >= 1 ? Math.min(10, Math.floor(roads * 0.05)) : 0;
    const count = (kind) => agents.reduce((n, a) => n + (a.kind === kind), 0);
    const spawn = (kind) => {
      const r = randomRoad(); if (!r) return;
      const a = { kind, tx: r[0], ty: r[1], dir: Math.floor(Math.random() * 4), t: Math.random(), side: Math.random() < 0.5 ? -1 : 1, col: kind === "walk" ? WALKER_COLORS[st.era][Math.floor(Math.random() * 3)] : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], step: Math.random() * 6, speed: kind === "walk" ? 0.5 + Math.random() * 0.3 : kind === "cart" ? 0.7 : 1.6 + Math.random() * 0.8 };
      a.dir = nextDir(a); if (a.dir < 0) return;
      agents.push(a);
    };
    if (count("walk") < wantWalk) spawn("walk");
    const vehicle = st.era >= 4 ? "car" : "cart";
    if (count(vehicle) < wantCars) spawn(vehicle);
    agents = agents.filter((a) => a.kind === "walk" ? agents.length && wantWalk > 0 : (a.kind === vehicle));
    if (count("walk") > wantWalk + 10) agents.splice(agents.findIndex((a) => a.kind === "walk"), 1);
    for (const a of agents) {
      a.t += dt * a.speed;
      a.step += dt * 9;
      while (a.t >= 1) {
        a.t -= 1;
        const [dx, dy] = DIRS[a.dir];
        a.tx += dx; a.ty += dy;
        if (!roadAt(a.tx, a.ty)) { a.dead = true; break; }
        const nd = nextDir(a);
        if (nd < 0) { a.dead = true; break; }
        a.dir = nd;
      }
    }
    agents = agents.filter((a) => !a.dead);
    // voitures volantes (Cyberpunk) et drones (numérique)
    const wantFly = st.era >= 7 ? 26 : st.era >= 6 ? 6 : 0;
    if (flyers.length < wantFly && Math.random() < 0.1) {
      const lane = Math.floor(Math.random() * 4);
      const alongX = lane % 2 === 0;
      const p = Math.floor(4 + Math.random() * (N - 8));
      const fwd = lane < 2;
      flyers.push({ alongX, p, t: fwd ? -2 : N + 2, v: (fwd ? 1 : -1) * (2.5 + Math.random() * 3), z: 90 + Math.random() * 180, col: A.NEON[Math.floor(Math.random() * A.NEON.length)], drone: st.era === 6 });
    }
    for (const f of flyers) f.t += f.v * dt;
    flyers = flyers.filter((f) => f.t > -4 && f.t < N + 4 && wantFly > 0);
  }
  function agentPos(a) {
    const [dx, dy] = DIRS[a.dir];
    let fx = a.tx + 0.5 + dx * (a.t - 0.5), fy = a.ty + 0.5 + dy * (a.t - 0.5);
    const lateral = a.kind === "walk" ? 0.33 * a.side : 0.16 * (a.dir < 2 ? 1 : -1);
    if (dx) fy += lateral * (dx > 0 ? 1 : -1); else fx -= lateral * (dy > 0 ? 1 : -1);
    return [fx, fy];
  }

  /* ================= Particules ================= */

  function spawnParticle(kind, x, y) {
    if (particles.length > 700) return;
    const r = Math.random;
    switch (kind) {
      case "smoke": particles.push({ kind, x, y, vx: 4 + r() * 4, vy: -10 - r() * 6, life: 0, max: 3 + r() * 2, s: 2 + r() * 2, col: "120,118,115" }); break;
      case "smokeBig": particles.push({ kind: "smoke", x, y, vx: 5 + r() * 5, vy: -14 - r() * 8, life: 0, max: 5 + r() * 3, s: 4 + r() * 4, col: "90,88,86" }); break;
      case "steam": particles.push({ kind: "smoke", x, y, vx: 2 + r() * 3, vy: -8 - r() * 5, life: 0, max: 2.5, s: 2 + r() * 2, col: "235,238,240" }); break;
      case "steamBig": particles.push({ kind: "smoke", x: x + (r() - 0.5) * 10, y, vx: 4 + r() * 4, vy: -12 - r() * 6, life: 0, max: 4 + r() * 2, s: 6 + r() * 5, col: "240,242,244" }); break;
      case "heat": particles.push({ kind: "smoke", x, y, vx: 1, vy: -9, life: 0, max: 1.6, s: 2, col: "200,220,235" }); break;
      case "fire": particles.push({ kind: "fire", x: x + (r() - 0.5) * 6, y, vx: (r() - 0.5) * 4, vy: -16 - r() * 10, life: 0, max: 0.6 + r() * 0.4, s: 2 + r() * 2.5 }); break;
      case "spark": particles.push({ kind: "spark", x, y, vx: (r() - 0.5) * 30, vy: -20 - r() * 20, life: 0, max: 0.5, s: 1 }); break;
      case "spray": particles.push({ kind: "spray", x, y, vx: (r() - 0.5) * 14, vy: -16 - r() * 6, life: 0, max: 0.8, s: 1.2 }); break;
      case "plasma": particles.push({ kind: "plasma", x: x + (r() - 0.5) * 8, y, vx: (r() - 0.5) * 6, vy: -24 - r() * 10, life: 0, max: 1, s: 2 + r() * 2 }); break;
      default:
    }
  }
  const EMIT_RATE = { smoke: 2.4, smokeBig: 4, steam: 2.5, steamBig: 3, heat: 1.2, fire: 14, spark: 4, spray: 18, plasma: 8 };

  function updateParticles(dt) {
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "spark" || p.kind === "spray") p.vy += 50 * dt;
      if (p.kind === "smoke") { p.s += dt * 3; p.vx *= 0.995; }
    }
    particles = particles.filter((p) => p.life < p.max);
  }

  /* ================= Rendu ================= */

  function nightFactor() {
    if (lightMode === "day") return 0;
    if (lightMode === "night") return 1;
    // 0 → aube, 0,25 → midi, 0,5 → crépuscule, 0,75 → minuit
    const sun = Math.sin(tod * Math.PI * 2);
    return clamp(0.5 - sun * 1.4, 0, 1);
  }

  function drawSky(n, era) {
    const day = SKY_DAY[era];
    const top = A.mix(day[0], SKY_NIGHT[0], n), bottom = A.mix(day[1], era === 7 ? "#3a1550" : SKY_NIGHT[1], n);
    const gr = g.createLinearGradient(0, 0, 0, vh);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    if (n > 0.4) {
      g.fillStyle = `rgba(255,255,255,${(n - 0.4) * 0.9})`;
      for (let i = 0; i < 70; i++) { const x = (hash(i, 7) % 1000) / 1000 * vw, y = (hash(i, 13) % 1000) / 1000 * vh * 0.7; g.fillRect(x, y, 1.2, 1.2); }
    }
  }

  function drawIslandSides(era) {
    const depth = 46;
    const A0 = tileTop(0, N), B0 = tileTop(N, N), C0 = tileTop(N, 0);
    const soil = era === 7 ? ["#3a3550", "#24202f", "#14121c"] : ["#7a5a3c", "#5e4630", "#3c2f24"];
    const gl = g.createLinearGradient(0, A0[1], 0, B0[1] + depth);
    gl.addColorStop(0, soil[0]); gl.addColorStop(0.5, soil[1]); gl.addColorStop(1, soil[2]);
    g.beginPath(); g.moveTo(A0[0], A0[1]); g.lineTo(B0[0], B0[1]); g.lineTo(B0[0], B0[1] + depth); g.lineTo(A0[0], A0[1] + depth); g.closePath(); g.fillStyle = gl; g.fill();
    const gr = g.createLinearGradient(0, C0[1], 0, B0[1] + depth);
    gr.addColorStop(0, A.shade(soil[0], -0.15)); gr.addColorStop(1, A.shade(soil[2], -0.2));
    g.beginPath(); g.moveTo(B0[0], B0[1]); g.lineTo(C0[0], C0[1]); g.lineTo(C0[0], C0[1] + depth); g.lineTo(B0[0], B0[1] + depth); g.closePath(); g.fillStyle = gr; g.fill();
    // strates
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 1;
    for (const f of [0.35, 0.7]) { g.beginPath(); g.moveTo(A0[0], A0[1] + depth * f); g.lineTo(B0[0], B0[1] + depth * f); g.lineTo(C0[0], C0[1] + depth * f); g.stroke(); }
    if (era === 7) { g.strokeStyle = "rgba(5,217,232,.5)"; g.beginPath(); g.moveTo(A0[0], A0[1] + 2); g.lineTo(B0[0], B0[1] + 2); g.lineTo(C0[0], C0[1] + 2); g.stroke(); }
  }

  function visibleRange() {
    const pad = 3;
    const corners = [[0, 0], [vw, 0], [0, vh], [vw, vh]].map(([sx, sy]) => screenToTile(sx, sy + 260 * cam.z));
    const top = [screenToTile(0, -40), screenToTile(vw, -40)];
    const all = corners.concat(top);
    const xs = all.map((t) => t.fx), ys = all.map((t) => t.fy);
    return { x0: Math.max(0, Math.floor(Math.min(...xs)) - pad), x1: Math.min(N - 1, Math.ceil(Math.max(...xs)) + pad), y0: Math.max(0, Math.floor(Math.min(...ys)) - pad), y1: Math.min(N - 1, Math.ceil(Math.max(...ys)) + pad) };
  }
  function onScreen(wx, wy, w, hgt) {
    const sx = (wx - cam.x) * cam.z + vw / 2, sy = (wy - cam.y) * cam.z + vh / 2;
    return sx + w * cam.z > 0 && sx < vw && sy + hgt * cam.z > 0 && sy < vh;
  }
  function blit(sp, layer, wx, wy) {
    const cv = layer === "l" ? sp.l : sp.c;
    if (!cv) return;
    g.drawImage(cv, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
  }

  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    built = 0;
    if (wallet.data.city !== W._for) { W = C.makeWorld(S()); W._for = wallet.data.city; objVersion = -1; selected = -1; agents = []; }
    const st = S();

    // --- temps de la ville
    if (!modalEl.hidden) { /* menu ouvert : pause */ }
    else if (SPEEDS[speed] > 0) {
      acc += dt * SPEEDS[speed];
      let n = 0;
      while (acc >= 1 && n < 8) { acc -= 1; n++; runTick(); }
      tod = (tod + dt / (70 / Math.min(SPEEDS[speed], 2.5))) % 1;
    }
    // --- clavier
    const pan = 520 * dt / cam.z;
    if (keys.has("left")) cam.x -= pan;
    if (keys.has("right")) cam.x += pan;
    if (keys.has("up")) cam.y -= pan;
    if (keys.has("down")) cam.y += pan;
    if (keys.size) clampCam();

    if (W.dirty) C.rebuild(st, W);
    if (objVersion !== W.version || objEra !== st.era) rebuildObjects();
    updateAgents(dt);
    updateParticles(dt);
    updateWeather(dt);

    const n = nightFactor();
    const era = st.era;
    const lightA = era === 7 ? Math.max(n, 0.35) : n;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    drawSky(n, era);
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));
    g.imageSmoothingEnabled = true;
    drawIslandSides(era);

    // --- sol
    const R = visibleRange();
    const time = now / 1000;
    for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) {
      const k = C.idx(x, y);
      const [wx, wy] = tileTop(x, y);
      if (!onScreen(wx - HW, wy, A.TW, A.TH + 8)) continue;
      let sp;
      if (W.road[k]) {
        let mask = 0;
        if (roadAt(x + 1, y)) mask |= 1; if (roadAt(x, y + 1)) mask |= 2; if (roadAt(x - 1, y)) mask |= 4; if (roadAt(x, y - 1)) mask |= 8;
        const v = hash(x, y) % 4;
        sp = sprite(`r|${era}|${mask}|${v}`, (sc) => A.roadSprite(era, mask, v, sc));
      } else {
        const t = W.terr[k];
        const type = t === C.T.WATER ? 1 : t === C.T.SAND ? 5 : 0;
        let mask = 0;
        if (type !== 1) { if (x + 1 < N && W.terr[C.idx(x + 1, y)] === C.T.WATER) mask |= 1; if (y + 1 < N && W.terr[C.idx(x, y + 1)] === C.T.WATER) mask |= 2; }
        const v = hash(x, y) % 4;
        sp = sprite(`g|${type}|${v}|${era}|${mask}`, (sc) => A.groundSprite(type, v, era, mask, sc));
      }
      if (sp) blit(sp, "c", wx, wy);
      if (W.terr[k] === C.T.WATER) drawWaterFx(x, y, wx, wy, time, n);
    }
    if (overlay !== "none") drawOverlay(R);
    drawCloudShadows(n);

    // --- objets triés + habitants
    const dyn = agents.map((a) => { const [fx, fy] = agentPos(a); return { d: fx + fy - 1, fx, fy, a }; }).sort((a, b) => a.d - b.d);
    let di = 0;
    const lights = [];
    const drawDyn = (upTo) => {
      while (di < dyn.length && dyn[di].d <= upTo) {
        const { fx, fy, a } = dyn[di++];
        const wx = (fx - fy) * HW, wy = (fx + fy) * HH;
        if (!onScreen(wx - 10, wy - 12, 20, 16)) continue;
        if (a.kind === "walk") A.drawWalker(g, wx, wy, a.col, a.step, era);
        else if (a.kind === "car") { A.drawCar(g, wx, wy, a.dir, a.col, era, null, 0); lights.push({ kind: "car", wx, wy, a }); }
        else A.drawCart(g, wx, wy, a.dir, era);
      }
    };
    const sel = selected >= 0 ? st.b[selected] : null;
    for (const o of objects) {
      drawDyn(o.d);
      const [wx, wy] = tileTop(o.x, o.y);
      if (o.kind === "nature") {
        if (!onScreen(wx - HW, wy - 40, A.TW, A.TH + 60)) continue;
        const sp = sprite(`n|${o.t}|${o.v}|${era === 7 ? 7 : 0}`, (sc) => A.natureSprite(o.t, o.v, era === 7 ? 7 : 0, sc));
        if (sp) { blit(sp, "c", wx, wy); if (sp.l && o.t === C.T.ORE) lights.push({ kind: "sprite", sp, wx, wy }); }
      } else if (o.kind === "lamp") {
        if (!onScreen(wx - HW, wy - 40, A.TW, 60)) continue;
        const sp = sprite(`l|${era}`, (sc) => A.lampSprite(era, sc));
        if (sp) { blit(sp, "c", wx, wy); lights.push({ kind: "sprite", sp, wx, wy }); }
      } else {
        const b = st.b[o.i];
        if (!b) continue;
        const def = C.BY_ID[b.t];
        if (!onScreen(wx - def.size * HW - 16, wy - def.h, def.size * A.TW + 32, def.h + def.size * A.TH + 20)) continue;
        const sp = spriteFor(b);
        if (!sp) continue;
        if (sel === b) drawFootprint(b.x, b.y, def.size, "rgba(252,238,10,.35)", "#fcee0a");
        if (tool === "bulldoze" && hover && W.occ[C.idx(hover.x, hover.y)] === o.i && !def.fixed) { g.globalAlpha = 0.55; blit(sp, "c", wx, wy); g.globalAlpha = 1; drawFootprint(b.x, b.y, def.size, "rgba(255,42,109,.35)", "#ff2a6d"); }
        else blit(sp, "c", wx, wy);
        if (sp.l) lights.push({ kind: "sprite", sp, wx, wy });
        // émetteurs (fumée, feu…)
        for (const e of sp.emit) {
          const ex = wx + e.dx, ey = wy + e.dy;
          const rate = EMIT_RATE[e.kind];
          if (rate && Math.random() < rate * dt && !(e.kind.startsWith("smoke") && !W.access[o.i])) spawnParticle(e.kind, ex, ey);
          if (e.kind === "blades") drawBlades(ex, ey, time, 18, false);
          else if (e.kind === "rotor") drawBlades(ex, ey, time * 1.6, 26, true);
          else if (!rate) lights.push({ kind: e.kind, wx: ex, wy: ey, seed: o.i });
        }
        if (b.f) { const cx = wx + (def.size - def.size) * HW, cy = wy + def.size * HH; for (let i = 0; i < 3; i++) if (Math.random() < 0.9) spawnParticle("fire", cx + (Math.random() - 0.5) * 20 * def.size, cy - 10 - Math.random() * 20); if (Math.random() < 0.3) spawnParticle("smokeBig", cx, cy - 30); lights.push({ kind: "burn", wx: cx, wy: cy - 10 }); }
        if (!W.access[o.i] && !C.ROAD_FREE.has(def.cat) && Math.floor(time * 2) % 2 === 0) drawAlert(wx, wy - Math.min(def.h, 60) - 10, "🛣");
      }
    }
    drawDyn(Infinity);

    // --- particules
    for (const p of particles) {
      const k = p.life / p.max;
      if (p.kind === "smoke") { g.fillStyle = `rgba(${p.col},${0.45 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); }
      else if (p.kind === "fire") { g.fillStyle = `rgba(255,${Math.round(200 - 150 * k)},40,${1 - k})`; g.beginPath(); g.arc(p.x, p.y, p.s * (1 - k * 0.5), 0, Math.PI * 2); g.fill(); }
      else if (p.kind === "spark") { g.fillStyle = `rgba(255,200,80,${1 - k})`; g.fillRect(p.x, p.y, 1.2, 1.2); }
      else if (p.kind === "spray") { g.fillStyle = `rgba(200,235,255,${0.9 - k})`; g.fillRect(p.x, p.y, 1.2, 1.2); }
      else if (p.kind === "plasma") { g.fillStyle = `rgba(120,240,255,${1 - k})`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); }
    }

    // --- fantôme de construction
    drawToolPreview(st);

    // --- nuit : on assombrit tout puis on ajoute les lumières
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (n > 0.01) {
      g.globalCompositeOperation = "multiply";
      g.fillStyle = A.mix("#ffffff", NIGHT_TINT[era], n * 0.85);
      g.fillRect(0, 0, vw, vh);
      // lueur orangée du crépuscule
      if (lightMode === "auto" && n > 0.05 && n < 0.8) { g.globalCompositeOperation = "soft-light"; g.fillStyle = `rgba(255,140,60,${0.35 * (1 - Math.abs(n - 0.4) / 0.4)})`; g.fillRect(0, 0, vw, vh); }
    }
    g.globalCompositeOperation = "lighter";
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));
    drawLights(lights, lightA, time, era);
    drawFlyers(lightA, time, era);
    for (const p of particles) if (p.kind === "fire" || p.kind === "plasma") { g.globalAlpha = 0.3 * (1 - p.life / p.max); g.fillStyle = p.kind === "fire" ? "#ff7a2a" : "#3fe8ff"; g.beginPath(); g.arc(p.x, p.y, p.s * 2.5, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    // --- météo
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRain(dt, era, n);

    const t2 = performance.now();
    if (t2 - lastHud > 250) { lastHud = t2; renderHud(); }
    if (t2 - lastSide > 700) { lastSide = t2; renderSide(); refreshPalette(); }
    if (t2 - lastMini > 1500) { lastMini = t2; renderMini(); }
    if (needSave && t2 - lastSave > SAVE_EVERY) save();
    rafId = window.requestAnimationFrame(frame);
  }

  function drawWaterFx(x, y, wx, wy, time, n) {
    const ph = Math.sin(time * 1.6 + x * 0.9 + y * 1.7);
    if (ph > 0.55) {
      g.strokeStyle = `rgba(255,255,255,${(ph - 0.55) * 0.9})`;
      g.lineWidth = 1;
      const cx = wx, cy = wy + HH;
      g.beginPath(); g.moveTo(cx - 8, cy + 2); g.lineTo(cx + 4, cy - 1); g.stroke();
    }
    // écume sur les bords
    const shore = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (let d = 0; d < 4; d++) {
      const xx = x + shore[d][0], yy = y + shore[d][1];
      if (!C.inside(xx, yy) || W.terr[C.idx(xx, yy)] === C.T.WATER) continue;
      const pts = [[wx, wy], [wx + HW, wy + HH], [wx, wy + A.TH], [wx - HW, wy + HH]];
      const edge = [[pts[1], pts[2]], [pts[2], pts[3]], [pts[3], pts[0]], [pts[0], pts[1]]][d];
      const a = 0.35 + 0.25 * Math.sin(time * 2 + x + y * 2);
      g.strokeStyle = `rgba(235,248,255,${a})`; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(...edge[0]); g.lineTo(...edge[1]); g.stroke();
    }
  }

  function drawFootprint(x, y, s, fill, stroke) {
    const [ax, ay] = tileTop(x, y);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + s * HW, ay + s * HH); g.lineTo(ax, ay + s * A.TH); g.lineTo(ax - s * HW, ay + s * HH); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5 / cam.z; g.stroke(); }
  }
  function drawAlert(x, y, emoji) {
    g.fillStyle = "rgba(10,10,18,.75)"; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ff2a6d"; g.lineWidth = 1; g.stroke();
    g.font = "8px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText(emoji, x, y + 0.5);
  }

  function drawOverlay(R) {
    for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) {
      const k = C.idx(x, y);
      let col = null;
      if (overlay === "pol") { const p = W.pol[k]; if (p > 0.05) col = `rgba(160,60,20,${Math.min(0.7, p * 0.15)})`; }
      else if (overlay === "happy") { const bi = W.occ[k]; if (bi >= 0 && C.BY_ID[S().b[bi].t].cat === "house") { const hh = C.houseHappiness(S(), W, S().b[bi]).total; col = `hsla(${hh * 1.2},80%,50%,.55)`; } }
      else if (W.cover[overlay]?.[k]) col = "rgba(5,217,232,.32)";
      if (col) drawFootprint(x, y, 1, col, null);
    }
  }

  function drawCloudShadows(n) {
    if (n > 0.6) return;
    const t = performance.now() / 1000;
    g.fillStyle = `rgba(20,30,50,${0.08 * (1 - n)})`;
    for (const c of clouds) {
      const wx = ((c.x + t * c.v) % (N * A.TW * 1.6)) - N * A.TW * 0.8, wy = c.y;
      g.beginPath(); g.ellipse(wx, wy, c.r * 1.8, c.r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(wx + c.r, wy + c.r * 0.2, c.r * 1.2, c.r * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
  }

  function drawLights(lights, a, time, era) {
    for (const L of lights) {
      if (L.kind === "sprite") { if (a > 0.01) { g.globalAlpha = a; blit(L.sp, "l", L.wx, L.wy); } continue; }
      const { wx, wy } = L;
      switch (L.kind) {
        case "glow": case "torch": glow(wx, wy, 11, "255,170,80", a * 0.7 * (0.8 + 0.2 * Math.sin(time * 9 + wx))); break;
        case "fire": glow(wx, wy, 20, "255,140,50", Math.max(0.12, a * 0.8) * (0.8 + 0.2 * Math.sin(time * 11 + wx))); break;
        case "burn": glow(wx, wy, 50, "255,110,40", 0.7); break;
        case "blink": if (Math.sin(time * 4 + wx * 0.3) > 0.3) glow(wx, wy, 6, "255,40,40", Math.max(0.6, a)); break;
        case "siren": glow(wx, wy, 10, Math.sin(time * 8) > 0 ? "255,40,40" : "40,90,255", 0.4 + a * 0.6); break;
        case "flood": glow(wx, wy + 20, 34, "255,255,230", a * 0.8); break;
        case "core": glow(wx, wy, 60, "255,42,109", 0.25 + 0.15 * Math.sin(time * 2)); break;
        case "beacon": { g.globalAlpha = 0.25 + a * 0.4; const ang = time * 1.4; g.strokeStyle = "rgba(255,255,200,.8)"; g.lineWidth = 3; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(ang) * 300, wy + Math.sin(ang) * 120); g.stroke(); glow(wx, wy, 14, "255,255,220", 1); break; }
        case "holo": drawHolo(wx, wy, time, L.seed, Math.max(0.55, a)); break;
        case "hologram": drawHologram(wx, wy, time, L.seed); break;
        case "drone": { const ang = time * 1.5 + L.seed; for (let i = 0; i < 3; i++) { const dx = Math.cos(ang + i * 2.1) * 26, dy = Math.sin(ang + i * 2.1) * 12 - 12; glow(wx + dx, wy + dy, 5, "5,217,232", 1); } break; }
        case "car": { if (a > 0.05) { const { a: ag } = L; const fwd = ag.dir < 2 ? 1 : -1; const along = ag.dir % 2 === 0; const ox = (along ? 8 : -8) * fwd * 0.6, oy = 4 * fwd * 0.6; glow(wx + ox, wy + oy - 1, 7, "255,245,210", a * 0.55); glow(wx - ox, wy - oy - 1, 3, "255,40,40", a * 0.8); } break; }
        default:
      }
    }
    g.globalAlpha = 1;
  }
  function glow(x, y, r, rgb, a) {
    if (a <= 0.01) return;
    g.globalAlpha = Math.min(1, a);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // les ailes du moulin et les pales d'éolienne sont dessinées en mode normal (pas en lumière) : on change de mode le temps du dessin
  function drawBlades(x, y, t, len, white) {
    g.save();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.translate(x, y);
    g.strokeStyle = white ? "#f2f4f6" : "#6b4a2c"; g.lineWidth = white ? 2 : 1.6;
    for (let i = 0; i < (white ? 3 : 4); i++) {
      const ang = t * (white ? 2.2 : 1.2) + (i * Math.PI * 2) / (white ? 3 : 4);
      const ex = Math.cos(ang) * len * 0.7, ey = Math.sin(ang) * len;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(ex, ey); g.stroke();
      if (!white) { g.fillStyle = "rgba(230,220,190,.9)"; g.beginPath(); g.moveTo(ex * 0.3, ey * 0.3); g.lineTo(ex, ey); g.lineTo(ex + Math.sin(ang) * 3, ey - Math.cos(ang) * 4); g.lineTo(ex * 0.3 + Math.sin(ang) * 3, ey * 0.3 - Math.cos(ang) * 4); g.fill(); }
    }
    g.fillStyle = "#555"; g.beginPath(); g.arc(0, 0, 1.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawHolo(x, y, t, seed, a) {
    g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 13 + seed));
    const col = A.NEON[seed % A.NEON.length];
    const w = 26, hh = 16;
    g.fillStyle = A.rgba(col, 0.25); g.fillRect(x - w / 2, y - hh, w, hh);
    g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(x - w / 2, y - hh, w, hh);
    g.fillStyle = col; g.font = "bold 7px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    const words = ["NEON", "BD", "茶", "SAKE", "HACK", "2077", "免許", "CHROME"];
    g.fillText(words[(seed + Math.floor(t / 3)) % words.length], x, y - hh / 2);
  }
  function drawHologram(x, y, t, seed) {
    g.globalAlpha = 0.7 + 0.2 * Math.sin(t * 10);
    const col = A.NEON[seed % 3 === 0 ? 1 : seed % 3 === 1 ? 0 : 3];
    const r = 9, hgt = 60, rot = t * 1.5;
    g.strokeStyle = col; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2, b = a + Math.PI / 2;
      const p0 = [x + Math.cos(a) * r, y - hgt * 0.4 + Math.sin(a) * r * 0.5], p1 = [x + Math.cos(b) * r, y - hgt * 0.4 + Math.sin(b) * r * 0.5];
      g.beginPath(); g.moveTo(x, y - hgt); g.lineTo(...p0); g.lineTo(x, y - 4); g.stroke();
      g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke();
    }
    glow(x, y - hgt * 0.45, 22, "5,217,232", 0.5);
    g.globalAlpha = 0.4; g.fillStyle = A.rgba(col, 0.3); g.beginPath(); g.moveTo(x - 6, y - 4); g.lineTo(x + 6, y - 4); g.lineTo(x + 14, y - hgt); g.lineTo(x - 14, y - hgt); g.fill();
  }

  function drawFlyers(a, time, era) {
    for (const f of flyers) {
      const fx = f.alongX ? f.t : f.p, fy = f.alongX ? f.p : f.t;
      const wx = (fx - fy) * HW, wy = (fx + fy) * HH - f.z;
      const dir = f.alongX ? [HW, HH] : [-HW, HH];
      const sgn = Math.sign(f.v);
      g.globalAlpha = Math.max(0.6, a);
      if (!f.drone) {
        g.strokeStyle = A.rgba(f.col, 0.5); g.lineWidth = 2;
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - dir[0] * sgn * 0.8, wy - dir[1] * sgn * 0.8); g.stroke();
      }
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      g.fillStyle = f.drone ? "#3a3f48" : "#2a2838"; g.fillRect(wx - 4, wy - 2, 8, 3);
      g.globalCompositeOperation = "lighter";
      glow(wx + dir[0] * sgn * 0.12, wy + dir[1] * sgn * 0.12, 8, f.drone ? "255,60,60" : "255,250,220", Math.max(0.5, a));
    }
  }

  function updateWeather(dt) {
    const era = S().era;
    weatherTimer -= dt * Math.max(0.3, SPEEDS[speed]);
    if (weatherTimer <= 0) {
      weatherTimer = 25 + Math.random() * 40;
      rainTarget = era === 7 ? (Math.random() < 0.6 ? 0.5 + Math.random() * 0.5 : 0.15) : Math.random() < 0.18 ? 0.4 + Math.random() * 0.6 : 0;
    }
    rain += (rainTarget - rain) * Math.min(1, dt * 0.5);
    if (!clouds.length) for (let i = 0; i < 7; i++) clouds.push({ x: Math.random() * N * A.TW * 1.6, y: Math.random() * N * A.TH, r: 40 + Math.random() * 60, v: 6 + Math.random() * 6 });
  }
  const drops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: 0.7 + Math.random() * 0.6 }));
  function drawRain(dt, era, n) {
    if (rain < 0.03 || prefersReducedMotion()) return;
    const count = Math.floor(drops.length * rain);
    g.strokeStyle = era === 7 ? `rgba(170,220,255,${0.35 + n * 0.2})` : `rgba(200,215,235,${0.4})`;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y += dt * 1.6 * d.s; d.x -= dt * 0.25 * d.s;
      if (d.y > 1) { d.y -= 1; d.x = Math.random() * 1.1; }
      if (d.x < 0) d.x += 1.1;
      const x = d.x * vw, y = d.y * vh;
      g.moveTo(x, y); g.lineTo(x - 3, y + 11 * d.s);
    }
    g.stroke();
    g.fillStyle = `rgba(30,40,60,${rain * 0.12})`;
    g.fillRect(0, 0, vw, vh);
  }

  /* ================= Aperçu de l'outil ================= */

  function lineCells(a, b) {
    // chemin en L : d'abord le long de l'axe le plus long
    const cells = [];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      for (let x = a.x; x !== b.x + dx || (dx === 0 && x === a.x && !cells.length); x += dx || 1) { cells.push([x, a.y]); if (dx === 0) break; }
      for (let y = a.y + dy; dy !== 0 && y !== b.y + dy; y += dy) cells.push([b.x, y]);
    } else {
      for (let y = a.y; y !== b.y + dy || (dy === 0 && !cells.length); y += dy || 1) { cells.push([a.x, y]); if (dy === 0) break; }
      for (let x = a.x + dx; dx !== 0 && x !== b.x + dx; x += dx) cells.push([x, b.y]);
    }
    return cells;
  }
  function rectCells(a, b) {
    const cells = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push([x, y]);
    return cells;
  }
  function buildAnchor(t, def) {
    const off = def.size > 1 ? (def.size - 1) / 2 : 0;
    return { x: Math.round(t.fx - 0.5 - off), y: Math.round(t.fy - 0.5 - off) };
  }

  function drawToolPreview(st) {
    if (!hover) return;
    if (tool === "road") {
      const cells = drag?.kind === "road" ? lineCells(drag.start, hover) : [[hover.x, hover.y]];
      let cost = 0;
      for (const [x, y] of cells) { const err = C.roadError(st, W, x, y); drawFootprint(x, y, 1, err ? "rgba(255,42,109,.35)" : "rgba(5,217,232,.4)", err ? null : "#05d9e8"); if (!err) cost++; }
      if (drag?.kind === "road") showTip(`${cost} case${cost > 1 ? "s" : ""} · ${costText(Object.fromEntries(Object.entries(C.ROAD_COST[st.era]).map(([k, v]) => [k, v * cost])))}`);
    } else if (tool === "bulldoze") {
      const cells = drag?.kind === "rect" ? rectCells(drag.start, hover) : [[hover.x, hover.y]];
      for (const [x, y] of cells) if (C.inside(x, y)) drawFootprint(x, y, 1, "rgba(255,42,109,.25)", "#ff2a6d");
    } else if (tool === "build" && buildId) {
      const def = C.BY_ID[buildId];
      if (def.id === "house" && drag?.kind === "rect") {
        for (const [x, y] of rectCells(drag.start, hover)) drawFootprint(x, y, 1, C.placeError(st, W, "house", x, y) ? "rgba(255,42,109,.25)" : "rgba(57,255,136,.35)", null);
        return;
      }
      const at = buildAnchor(hover, def);
      const err = C.placeError(st, W, buildId, at.x, at.y);
      if (def.r && def.cover.length) {
        const cx = at.x + def.size / 2, cy = at.y + def.size / 2;
        for (let y = Math.floor(cy - def.r); y <= cy + def.r; y++) for (let x = Math.floor(cx - def.r); x <= cx + def.r; x++) if (C.inside(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= def.r) drawFootprint(x, y, 1, "rgba(5,217,232,.14)", null);
      }
      drawFootprint(at.x, at.y, def.size, err ? "rgba(255,42,109,.4)" : "rgba(57,255,136,.4)", err ? "#ff2a6d" : "#39ff88");
      const sp = spriteFor({ t: buildId, x: at.x, y: at.y, l: 1, v: 3 });
      if (sp) { g.globalAlpha = 0.72; const [wx, wy] = tileTop(at.x, at.y); blit(sp, "c", wx, wy); g.globalAlpha = 1; }
    }
  }
  function showTip(text) {
    tip.hidden = !text;
    tip.textContent = text || "";
  }

  /* ================= Mini-carte ================= */

  const mg = mini.getContext("2d");
  function renderMini() {
    const img = mg.createImageData(N, N);
    const st = S();
    const cols = { 0: [110, 171, 77], 1: [58, 134, 191], 2: [52, 104, 52], 3: [150, 144, 136], 4: [120, 100, 130], 5: [220, 198, 142] };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = C.idx(x, y);
      let c = cols[W.terr[k]];
      if (W.road[k]) c = st.era >= 7 ? [5, 217, 232] : [90, 88, 86];
      const bi = W.occ[k];
      if (bi >= 0) { const def = C.BY_ID[st.b[bi].t]; c = def.cat === "house" ? [240, 200, 90] : def.cat === "wonder" || def.fixed ? [255, 42, 109] : [230, 230, 240]; if (st.b[bi].f) c = [255, 90, 20]; }
      const i = k * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    mg.putImageData(img, 0, 0);
  }
  mini.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    // la mini-carte est tournée de 45° en CSS : on retrouve la case visée à partir du centre
    const r = miniWrap.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;   // 0..1 dans le losange
    const x = (u + v - 0.5) * N, y = (v - u + 0.5) * N;
    centerOn(clamp(x, 0, N - 1), clamp(y, 0, N - 1));
  });

  /* ================= Simulation ================= */

  function runTick() {
    const st = S();
    const events = C.tick(st, W);
    touched();
    for (const ev of events) {
      if (ev.type === "ach") award(ev.id);
      else if (ev.type === "victory") showVictory();
      else if (ev.text) { say(ev.text, ev.tone); addLog(ev.text, ev.tone); if (ev.type === "burned" && selected >= 0) selected = -1; }
    }
  }

  function doAdvance() {
    const st = S();
    const next = st.era + 1;
    if (!C.advance(st, W)) return;
    C.rebuild(st, W);
    iconCache.clear();
    const credit = 500 * next * next + wealthBonus(wallet.credits, 0.004 * next);
    wallet.addCredits(credit);
    award(`era${next}`);
    addLog(`Nouvelle ère : ${C.ERAS[next].name} ! (+${fmtShort(credit)} crédits)`, "win");
    touched(); save(true);
    flash(C.ERAS[next]);
    renderPalette(); renderSide(true);
  }

  function flash(era) {
    modalEl.hidden = false;
    modalEl.replaceChildren(h("div", { class: "cb-modal-inner chamfer cb-era-flash" },
      h("p", { class: "cb-flash-kicker" }, "Nouvelle ère"),
      h("p", { class: "cb-flash-title" }, era.name),
      h("p", {}, `An ${era.year < 0 ? `${-era.year} av. J.-C.` : era.year}. La ville se transforme et de nouveaux bâtiments sont disponibles.`),
      h("button", { class: "button button-primary", type: "button", onclick: () => { modalEl.hidden = true; board.focus({ preventScroll: true }); } }, "Continuer")));
  }
  function showVictory() {
    modalEl.hidden = false;
    modalEl.replaceChildren(h("div", { class: "cb-modal-inner chamfer cb-era-flash" },
      h("p", { class: "cb-flash-kicker" }, "Victoire"),
      h("p", { class: "cb-flash-title" }, "Night City est née"),
      h("p", {}, "La Méga-tour Néon perce les nuages. De la hutte au gratte-ciel, ta cité a traversé dix mille ans d'histoire. Tu peux continuer à l'agrandir autant que tu veux."),
      h("button", { class: "button button-primary", type: "button", onclick: () => { modalEl.hidden = true; } }, "Continuer à construire")));
  }

  /* ================= Actions ================= */

  function setTool(id, bid = null) {
    tool = id;
    buildId = bid;
    for (const [k, b] of Object.entries(toolButtons)) b.classList.toggle("is-active", k === id);
    drag = null;
    showTip("");
    renderPalette();
  }
  function setSpeed(i) {
    speed = i;
    speedButtons.forEach((b, k) => b.classList.toggle("is-active", k === i));
  }
  function cycleLight() {
    lightMode = lightMode === "auto" ? "day" : lightMode === "day" ? "night" : "auto";
    lightButton.textContent = { auto: "◐", day: "☀", night: "☾" }[lightMode];
    lightButton.title = { auto: "Cycle jour / nuit automatique", day: "Toujours le jour", night: "Toujours la nuit" }[lightMode];
  }

  function applyTool(t, endDrag = null) {
    const st = S();
    if (tool === "inspect") {
      const bi = C.inside(t.x, t.y) ? W.occ[C.idx(t.x, t.y)] : -1;
      selected = bi;
      if (bi >= 0) { tab = "info"; renderSide(true); }
      return;
    }
    if (tool === "road") {
      const cells = endDrag ? lineCells(endDrag, t) : [[t.x, t.y]];
      const nRoads = C.placeRoads(st, W, cells);
      if (!nRoads && cells.length === 1) say(C.roadError(st, W, t.x, t.y), "bad");
      if (nRoads) touched();
      return;
    }
    if (tool === "bulldoze") {
      const cells = endDrag ? rectCells(endDrag, t) : [[t.x, t.y]];
      let msg = "", n = 0;
      // les bâtiments d'abord (un seul coup même s'ils couvrent plusieurs cases)
      for (const [x, y] of cells) { const m = C.bulldoze(st, W, x, y); if (m) { n++; if (m !== "route") msg = m; } }
      if (n) { touched(); selected = -1; if (msg) say(msg); }
      return;
    }
    if (tool === "build" && buildId) {
      const def = C.BY_ID[buildId];
      if (def.id === "house" && endDrag) {
        let n = 0, last = "";
        for (const [x, y] of rectCells(endDrag, t)) { const err = C.place(st, W, "house", x, y); if (!err) n++; else last = err; }
        if (n) { touched(); say(`${n} habitation${n > 1 ? "s" : ""} construite${n > 1 ? "s" : ""}.`); }
        else if (last) say(last, "bad");
        return;
      }
      const at = buildAnchor(t, def);
      const err = C.place(st, W, buildId, at.x, at.y);
      if (err) say(err, "bad");
      else {
        touched();
        const [px, py] = tileTop(at.x + def.size / 2, at.y + def.size / 2);
        for (let i = 0; i < 10; i++) spawnParticle("steam", px + (Math.random() - 0.5) * 30 * def.size, py);
        if (def.wonder) { say(`Merveille construite : ${def.name} !`, "win"); addLog(`Merveille : ${def.name}`, "win"); }
        if (!C.ROAD_FREE.has(def.cat) && !C.touchesRoad(W, at.x, at.y, def.size)) say("Pense à relier ce bâtiment à une route !", "bad");
        if (!C.canAfford(st, def.cost)) renderPalette();
      }
    }
  }

  /* ================= Entrées ================= */

  const local = (e) => { const r = board.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  board.addEventListener("contextmenu", (e) => e.preventDefault());
  board.addEventListener("pointerdown", (e) => {
    board.focus({ preventScroll: true });
    board.setPointerCapture?.(e.pointerId);
    const [sx, sy] = local(e);
    pointers.set(e.pointerId, { sx, sy });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy), z: cam.z, mx: (p1.sx + p2.sx) / 2, my: (p1.sy + p2.sy) / 2 };
      drag = null;
      return;
    }
    const t = screenToTile(sx, sy);
    hover = t;
    const panning = e.button === 1 || e.button === 2 || tool === "inspect";
    if (panning) drag = { kind: "pan", sx, sy, cx: cam.x, cy: cam.y, moved: false, tile: t, button: e.button };
    else if (tool === "road") drag = { kind: "road", start: t, moved: false };
    else if (tool === "bulldoze" || (tool === "build" && buildId === "house")) drag = { kind: "rect", start: t, moved: false };
    else drag = { kind: "tap", start: t, sx, sy, moved: false };
  });
  board.addEventListener("pointermove", (e) => {
    const [sx, sy] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { sx, sy });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
      const mx = (p1.sx + p2.sx) / 2, my = (p1.sy + p2.sy) / 2;
      cam.x -= (mx - pinch.mx) / cam.z; cam.y -= (my - pinch.my) / cam.z;
      pinch.mx = mx; pinch.my = my;
      zoomAt(mx, my, (pinch.z * d / pinch.d) / cam.z);
      return;
    }
    hover = screenToTile(sx, sy);
    if (!drag) { updateHoverTip(); return; }
    if (drag.kind === "pan") {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 5) drag.moved = true;
      cam.x = drag.cx - (sx - drag.sx) / cam.z; cam.y = drag.cy - (sy - drag.sy) / cam.z; clampCam();
    } else if (hover.x !== drag.start.x || hover.y !== drag.start.y) drag.moved = true;
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    showTip("");
    if (e.type === "pointercancel") return;
    const [sx, sy] = local(e);
    const t = screenToTile(sx, sy);
    if (d.kind === "pan") { if (!d.moved && d.button === 0) applyTool(t); return; }
    if (d.kind === "road" || d.kind === "rect") { applyTool(t, d.moved ? d.start : null); return; }
    applyTool(t);
  };
  board.addEventListener("pointerup", end);
  board.addEventListener("pointercancel", end);
  board.addEventListener("pointerleave", () => { if (!drag) { hover = null; showTip(""); } });
  board.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function updateHoverTip() {
    if (!hover || !C.inside(hover.x, hover.y) || tool !== "inspect") { if (tool !== "road") showTip(""); return; }
    const k = C.idx(hover.x, hover.y);
    const bi = W.occ[k];
    if (bi >= 0) {
      const b = S().b[bi], def = C.BY_ID[b.t];
      showTip(def.cat === "house" ? `${def.name} niv. ${b.l} · ${b.p}/${C.houseCap(S().era, b.l, def)} hab.` : def.name);
    } else if (W.road[k]) showTip(C.ROAD_NAMES[S().era]);
    else showTip(C.TERRAIN_NAMES[W.terr[k]]);
  }

  const KEYMAP = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", q: "left", a: "left", d: "right", z: "up", w: "up", s: "down" };
  document.addEventListener("keydown", (e) => {
    if (!active || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase?.()];
    if (k) { keys.add(k); e.preventDefault(); return; }
    if (e.key === "+" || e.key === "=") zoomAt(vw / 2, vh / 2, 1.15);
    else if (e.key === "-" || e.key === "_") zoomAt(vw / 2, vh / 2, 1 / 1.15);
    else if (e.key === " ") { setSpeed(speed ? 0 : 1); e.preventDefault(); }
    else if (e.key === "1" || e.key === "2" || e.key === "3") setSpeed(Number(e.key));
    else if (e.key === "Escape") { if (!modalEl.hidden) modalEl.hidden = true; else setTool("inspect"); }
    else if (e.key === "r" || e.key === "R") setTool("road");
    else if (e.key === "x" || e.key === "X") setTool("bulldoze");
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase?.()];
    if (k) keys.delete(k);
  });

  /* ================= Barre du haut ================= */

  function rate(v) { const r = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v); return `${r >= 0 ? "+" : "−"}${fmtShort(Math.abs(r), 1)}`; }
  function renderHud() {
    const st = S();
    eraEl.textContent = C.ERAS[st.era].name;
    const y = C.yearOf(st);
    yearEl.textContent = y < 0 ? `${fmt(-y)} av. J.-C.` : `An ${y}`;
    let cap = 0;
    for (const b of st.b) { const def = C.BY_ID[b.t]; if (def.cat === "house") cap += C.houseCap(st.era, b.l, def); }
    hudStats.pop.v.textContent = fmtShort(W.pop);
    hudStats.pop.r.textContent = `/ ${fmtShort(cap)}`;
    hudStats.happy.v.textContent = Math.round(W.happy);
    hudStats.happy.r.textContent = W.happy >= 70 ? "😄" : W.happy >= 45 ? "🙂" : "😠";
    hudStats.happy.el.dataset.tone = W.happy < 35 ? "bad" : "";
    for (const k of C.RES) {
      const s = hudStats[k];
      s.v.textContent = fmtShort(Math.floor(st.res[k]));
      s.r.textContent = rate(W.rates[k] || 0);
      s.r.dataset.tone = (W.rates[k] || 0) < -0.05 ? "bad" : "";
      s.el.hidden = k === "metal" && st.era < 2 && st.res.metal <= 0;
    }
    const en = hudStats.energy;
    en.el.hidden = st.era < 4;
    en.v.textContent = fmtShort(Math.round(W.energy.prod));
    en.r.textContent = `/ ${fmtShort(Math.round(W.energy.need))}`;
    en.el.dataset.tone = W.energy.ratio < 0.99 ? "bad" : "";
    hudStats.food.el.dataset.tone = st.res.food <= 0 ? "bad" : "";
  }

  /* ================= Palette de construction ================= */

  // met à jour « trop cher / abordable » sans recréer les boutons
  function refreshPalette() {
    const st = S();
    for (const btn of palette.children) {
      const def = C.BY_ID[btn.dataset.id];
      if (def) btn.classList.toggle("is-poor", def.era <= st.era && !C.canAfford(st, def.cost));
    }
  }

  function renderPalette() {
    const st = S();
    for (const b of catTabs.children) b.classList.toggle("is-active", b.dataset.cat === cat);
    const list = C.BUILDINGS.filter((b) => b.cat === cat && !b.fixed);
    palette.replaceChildren(...list.map((def) => {
      const locked = def.era > st.era;
      const done = def.wonder && st.b.some((b) => b.t === def.id);
      const afford = C.canAfford(st, def.cost);
      const btn = h("button", {
        class: `cb-pal${tool === "build" && buildId === def.id ? " is-active" : ""}${locked ? " is-locked" : ""}${!afford && !locked ? " is-poor" : ""}${done ? " is-done" : ""}`,
        type: "button", title: `${def.name} — ${def.desc}`, "data-id": def.id,
        onclick: () => { if (locked || done) { say(locked ? `${def.name} : disponible à l'ère « ${C.ERAS[def.era].name} ».` : "Merveille déjà construite."); return; } setTool("build", def.id); }
      },
      locked ? h("span", { class: "cb-pal-lock" }, "🔒") : h("img", { src: icon(def), alt: "", width: "48", height: "48" }),
      h("span", { class: "cb-pal-name" }, def.name),
      h("span", { class: "cb-pal-cost" }, locked ? C.ERAS[def.era].short : done ? "Construite" : costText(def.cost)));
      return btn;
    }));
    // carte de détails du bâtiment choisi
    if (tool === "build" && buildId) {
      const def = C.BY_ID[buildId];
      const fx = [];
      for (const [k, v] of Object.entries(def.prod)) fx.push(`+${fmtShort(v * C.techMult(st, def), 1)} ${C.RES_NAMES[k].toLowerCase()}`);
      for (const [k, v] of Object.entries(def.use)) fx.push(`−${fmtShort(v, 1)} ${C.RES_NAMES[k].toLowerCase()}`);
      if (def.energy > 0) fx.push(`+${fmtShort(def.energy)} énergie`); else if (def.energy < 0) fx.push(`−${fmtShort(-def.energy)} énergie`);
      if (def.jobs) fx.push(`${def.jobs} emplois`);
      if (def.cover.length) fx.push(`${def.cover.map((n) => C.NEED_NAMES[n]).join(", ")} (rayon ${def.r})`);
      if (def.happy) fx.push(`+${def.happy} bonheur autour`);
      if (def.pol > 0) fx.push(`pollution ${def.pol}`);
      if (def.wonder) fx.push(`+${def.wonder} bonheur partout`);
      if (def.cat === "house") fx.push(`${fmt(C.houseCap(st.era, 1, def))} à ${fmt(C.houseCap(st.era, 3, def))} habitants`);
      buildCard.replaceChildren(h("strong", {}, def.name), h("span", {}, def.desc), h("span", { class: "cb-card-fx" }, fx.join(" · ")), h("span", { class: "cb-card-cost" }, `Coût : ${costText(def.cost)}${def.size > 1 ? ` · ${def.size}×${def.size} cases` : ""}${def.id === "house" ? " · glisse pour en poser plusieurs" : ""}`));
      buildCard.hidden = false;
    } else if (tool === "road") {
      buildCard.replaceChildren(h("strong", {}, C.ROAD_NAMES[st.era]), h("span", {}, "Glisse pour tracer une route. Presque tous les bâtiments doivent toucher une route pour fonctionner."), h("span", { class: "cb-card-cost" }, `Coût par case : ${costText(C.ROAD_COST[st.era])}`));
      buildCard.hidden = false;
    } else if (tool === "bulldoze") {
      buildCard.replaceChildren(h("strong", {}, "Démolir"), h("span", {}, "Clique ou glisse sur une zone. Les bâtiments rendent 25 % de leur coût ; raser une forêt donne du bois, une roche de la pierre (les filons ne se rasent pas)."));
      buildCard.hidden = false;
    } else buildCard.hidden = true;
  }

  /* ================= Panneau de droite ================= */

  // Le panneau n'est reconstruit que quand sa structure change (onglet, ère, bâtiment choisi…). Le reste du temps,
  // seules les valeurs sont mises à jour : un bouton n'est jamais remplacé sous le curseur (sinon le clic se perd).
  let sideKey = "", sideUpdate = null;
  function renderSide(force = false) {
    const st = S();
    for (const b of sideTabBar.children) b.classList.toggle("is-active", b.dataset.tab === tab);
    const sb = selected >= 0 ? st.b[selected] : null;
    const key = [tab, st.era, selected, sb ? `${sb.t}${sb.f ? "f" : ""}${W.access[selected] ? "a" : ""}` : "", overlay, log.length ? log[0].text + log.length : "", st.ach.length, st.won, !!C.advanceInfo(st, W)?.ok].join("|");
    if (force || key !== sideKey) {
      sideKey = key;
      const panel = tab === "era" ? eraPanel(st) : tab === "city" ? cityPanel(st) : tab === "info" ? infoPanel(st) : { nodes: helpPanel() };
      sideBody.replaceChildren(...panel.nodes);
      sideUpdate = panel.update || null;
    }
    sideUpdate?.();
  }

  function bar(have, need) {
    const pct = Math.min(100, (have / need) * 100);
    return h("span", { class: "cb-bar" }, h("span", { class: "cb-bar-fill", style: `width:${pct}%` }));
  }
  const statRows = (rows) => rows.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)));

  function eraPanel(st) {
    const nodes = [];
    nodes.push(h("div", { class: "cb-timeline" }, C.ERAS.map((e, i) => h("span", { class: `cb-dot${i < st.era ? " is-past" : i === st.era ? " is-now" : ""}`, title: e.name }))));
    nodes.push(h("p", { class: "cb-side-title" }, C.ERAS[st.era].name));
    const info = C.advanceInfo(st, W);
    let update = null;
    if (info) {
      const list = h("ul", { class: "cb-req" });
      const btn = h("button", { class: "button button-primary cb-advance", type: "button", onclick: () => doAdvance() });
      nodes.push(h("p", { class: "cb-muted" }, "Prochaine ère : ", h("strong", {}, C.ERAS[info.era].name)), list, btn);
      const unlocks = C.BUILDINGS.filter((b) => b.era === info.era).map((b) => b.name);
      nodes.push(h("p", { class: "cb-muted cb-small" }, `Débloque : ${unlocks.join(", ")}.`));
      update = () => {
        const inf = C.advanceInfo(S(), W);
        if (!inf) return;
        list.replaceChildren(...inf.rows.map((r) => h("li", { class: r.ok ? "is-ok" : "" },
          h("span", {}, `${r.ok ? "✓" : "•"} ${r.label}`), h("span", {}, `${fmtShort(Math.floor(r.have))} / ${fmtShort(r.need)}`), bar(r.have, r.need))));
        btn.disabled = !inf.ok;
        const label = inf.ok ? `Passer à l'ère « ${C.ERAS[inf.era].name} »` : "Pas encore prêt";
        if (btn.textContent !== label) btn.textContent = label;
      };
    } else {
      nodes.push(h("p", {}, st.won ? "Ta cité a atteint son apogée. Tu peux continuer à construire !" : "Dernière ère atteinte ! Construis la Méga-tour Néon pour terminer la partie."));
    }
    if (log.length) {
      nodes.push(h("p", { class: "cb-side-sub" }, "Journal"));
      nodes.push(h("ul", { class: "cb-log" }, log.map((l) => h("li", { "data-tone": l.tone }, h("span", { class: "cb-log-y" }, l.y < 0 ? `${-l.y} av.` : String(l.y)), ` ${l.text}`))));
    }
    return { nodes, update };
  }

  function cityPanel(st) {
    const nodes = [];
    const stats = h("dl", { class: "cb-stats" });
    const update = () => {
      const s2 = S();
      let cap = 0, houses = 0;
      const levels = [0, 0, 0];
      for (const b of s2.b) { const def = C.BY_ID[b.t]; if (def.cat === "house") { cap += C.houseCap(s2.era, b.l, def); houses++; levels[b.l - 1]++; } }
      const rows = [
        ["Habitants", `${fmt(W.pop)} / ${fmt(cap)}`],
        ["Habitations", `${houses} (niv. 1 : ${levels[0]} · 2 : ${levels[1]} · 3 : ${levels[2]})`],
        ["Travailleurs", `${fmt(W.workers)} pour ${fmt(W.jobs)} emplois`],
        ["Bonheur moyen", `${Math.round(W.happy)} / 100`],
        ["Impôts", `${rate(W.pop * (s2.tax / 100) * C.ERAS[s2.era].tax)} or / mois`],
        ["Entretien", `−${fmtShort(W.upkeep || 0, 1)} or / mois`]
      ];
      if (s2.era >= 4) rows.push(["Énergie", `${fmtShort(Math.round(W.energy.prod))} produite / ${fmtShort(Math.round(W.energy.need))} demandée`]);
      rows.push(["Record", `${fmt(s2.best)} habitants`]);
      stats.replaceChildren(...statRows(rows));
    };
    nodes.push(stats);
    const taxVal = h("strong", {}, `${st.tax} %`);
    const slider = h("input", { type: "range", min: "0", max: "20", value: String(st.tax), class: "cb-range", "aria-label": "Taux d'imposition" });
    slider.addEventListener("input", () => { S().tax = Number(slider.value); taxVal.textContent = `${S().tax} %`; touched(); });
    nodes.push(h("label", { class: "cb-tax" }, h("span", {}, "Taux d'imposition "), taxVal, slider, h("small", { class: "cb-muted" }, "Au-dessus de 8 %, les habitants sont moins heureux ; en dessous, ils le sont plus.")));
    nodes.push(h("p", { class: "cb-side-sub" }, "Calques de la carte"));
    const layers = [["none", "Aucun"], ...C.NEEDS.map((n) => [n, C.NEED_NAMES[n]]), ["pol", "Pollution"], ["happy", "Bonheur"]];
    nodes.push(h("div", { class: "cb-layers" }, layers.map(([id, label]) => h("button", { class: `map-button${overlay === id ? " is-active" : ""}`, type: "button", onclick: () => { overlay = id; renderSide(true); } }, label))));
    nodes.push(h("p", { class: "cb-side-sub" }, `Succès (${st.ach.length} / ${C.ACHIEVEMENTS.length})`));
    nodes.push(h("ul", { class: "cb-ach" }, C.ACHIEVEMENTS.map((a) => h("li", { class: st.ach.includes(a.id) ? "is-ok" : "" }, h("span", {}, `${st.ach.includes(a.id) ? "✓" : "○"} ${a.name}`), h("small", {}, `${a.text} · ${a.blue} pièce${a.blue > 1 ? "s" : ""} bleue${a.blue > 1 ? "s" : ""}`)))));
    nodes.push(h("button", { class: "button button-secondary cb-reset", type: "button", onclick: () => {
      if (!window.confirm("Raser la ville et recommencer une nouvelle partie sur une nouvelle carte ? (Les pièces bleues et succès déjà gagnés restent acquis.)")) return;
      const ach = S().ach.slice();
      wallet.data.city = C.freshCity();
      wallet.data.city.ach = ach;
      W = C.makeWorld(S());
      W._for = wallet.data.city;
      selected = -1; agents = []; particles = []; flyers = []; log = [];
      cam = { x: 0, y: 0, z: 1.3 }; centerOn(C.CENTER.x + 1, C.CENTER.y + 1);
      iconCache.clear();
      save(true); renderPalette(); renderSide(true);
    } }, "Nouvelle ville"));
    return { nodes, update };
  }

  function infoPanel(st) {
    const b = selected >= 0 ? st.b[selected] : null;
    if (!b) return { nodes: [h("p", { class: "cb-muted" }, "Choisis l'outil « Inspecter » puis clique sur un bâtiment pour voir ses détails.")] };
    const def = C.BY_ID[b.t];
    const nodes = [h("div", { class: "cb-info-head" }, h("img", { src: icon(def), alt: "", width: "56", height: "56" }), h("div", {}, h("p", { class: "cb-side-title" }, def.name), h("p", { class: "cb-muted cb-small" }, def.desc)))];
    if (b.f) nodes.push(h("p", { class: "cb-warn" }, "🔥 En feu !"), h("button", { class: "button button-primary", type: "button", onclick: () => { say(C.extinguish(S(), b)); touched(); renderSide(true); } }, `Éteindre (${fmt(C.extinguishPrice(st))} or)`));
    if (!W.access[selected]) nodes.push(h("p", { class: "cb-warn" }, "🛣 Aucune route à côté : ce bâtiment ne fonctionne pas."));
    const live = h("div", { class: "cb-live" });
    nodes.push(live);
    const update = () => {
      const s2 = S();
      const i = s2.b.indexOf(b);
      if (i < 0) return;
      const access = W.access[i];
      if (def.cat === "house") {
        const hh = C.houseHappiness(s2, W, b);
        const cap = C.houseCap(s2.era, b.l, def);
        const next = b.l === 1 ? "Niveau 2 : 2 services et 40 de bonheur." : b.l === 2 ? "Niveau 3 : 5 services, 55 de bonheur et peu de pollution." : "Niveau maximum !";
        const labels = { base: "Base", services: "Services", decor: "Décor", wonders: "Merveilles", pollution: "Pollution", tax: "Impôts", food: "Famine", energy: "Manque d'énergie", jobs: "Chômage", festival: "Fête" };
        live.replaceChildren(
          h("dl", { class: "cb-stats" }, statRows([["Niveau", `${b.l} / 3`], ["Habitants", `${fmt(b.p)} / ${fmt(cap)}`], ["Bonheur", `${Math.round(hh.total)} / 100`]])),
          h("p", { class: "cb-side-sub" }, "Services"),
          h("ul", { class: "cb-needs" }, C.NEEDS.map((n) => h("li", { class: hh.covered.includes(n) ? "is-ok" : "" }, `${hh.covered.includes(n) ? "✓" : "✗"} ${C.NEED_NAMES[n]}`))),
          h("p", { class: "cb-muted cb-small" }, next),
          h("ul", { class: "cb-break" }, Object.entries(hh.parts).filter(([, v]) => Math.round(v)).map(([k, v]) => h("li", { "data-tone": v < 0 ? "bad" : "" }, h("span", {}, labels[k]), h("span", {}, `${v > 0 ? "+" : ""}${Math.round(v)}`)))));
      } else {
        const rows = [];
        const eff = (def.jobs ? W.emp : 1) * W.site[i] * C.techMult(s2, def) * (def.energy < 0 ? W.energy.ratio : 1) * (access && !b.f ? 1 : 0);
        for (const [k, v] of Object.entries(def.prod)) rows.push([C.RES_NAMES[k], `+${fmtShort(v * eff, 1)} / mois`]);
        for (const [k, v] of Object.entries(def.use)) rows.push([`${C.RES_NAMES[k]} consommé`, `−${fmtShort(v * (def.jobs ? W.emp : 1), 1)} / mois`]);
        if (def.energy) rows.push(["Énergie", `${def.energy > 0 ? "+" : "−"}${fmtShort(Math.abs(def.energy))}`]);
        if (def.jobs) rows.push(["Emplois", `${def.jobs} (occupés à ${Math.round(W.emp * 100)} %)`]);
        if (def.site) rows.push(["Site", `${Math.round(W.site[i] * 100)} %`]);
        if (def.cover.length) rows.push(["Services", `${def.cover.map((n) => C.NEED_NAMES[n]).join(", ")} · rayon ${def.r}`]);
        if (def.happy) rows.push(["Bonheur autour", `+${def.happy} (rayon ${def.hr})`]);
        if (def.wonder) rows.push(["Merveille", `+${def.wonder} de bonheur partout`]);
        if (def.era < s2.era && Object.keys(def.prod).length) rows.push(["Progrès", `+${Math.round((C.techMult(s2, def) - 1) * 100)} % (ères suivantes)`]);
        live.replaceChildren(rows.length ? h("dl", { class: "cb-stats" }, statRows(rows)) : "");
      }
    };
    if (!def.fixed) nodes.push(h("button", { class: "button button-secondary", type: "button", onclick: () => { const m = C.bulldoze(S(), W, b.x, b.y); selected = -1; touched(); say(m); renderSide(true); } }, "Démolir"));
    return { nodes, update };
  }

  function helpPanel() {
    return [
      h("p", { class: "cb-side-sub" }, "Commandes"),
      h("ul", { class: "cb-help" },
        h("li", {}, "Clic gauche : utiliser l'outil. Glisser : tracer des routes, poser des habitations en rectangle, démolir une zone."),
        h("li", {}, "Clic droit (ou outil Inspecter) + glisser : déplacer la vue. Molette : zoom."),
        h("li", {}, "Tactile : un doigt = outil, deux doigts = déplacer et zoomer."),
        h("li", {}, "Clavier : flèches / ZQSD, + et −, Espace = pause, 1 2 3 = vitesse, R = route, X = démolir, Échap = inspecter.")),
      h("p", { class: "cb-side-sub" }, "Bien démarrer"),
      h("ol", { class: "cb-help" },
        h("li", {}, "Pose des habitations le long des sentiers, un bûcheron près de la forêt et un camp de chasseurs."),
        h("li", {}, "Ajoute un tailleur de pierre près d'une roche et la hutte du chaman pour le savoir."),
        h("li", {}, "Couvre les maisons de services (feu de camp, guérisseuse…) : elles montent de niveau et logent plus de monde."),
        h("li", {}, "Quand tout est prêt dans l'onglet « Ère », passe à l'époque suivante !")),
      h("p", { class: "cb-side-sub" }, "Astuces"),
      h("ul", { class: "cb-help" },
        h("li", {}, "Les vieux bâtiments produisent davantage à chaque nouvelle ère (progrès)."),
        h("li", {}, "À partir de l'ère industrielle, il faut de l'énergie : sans elle, usines et maisons souffrent."),
        h("li", {}, "La pollution empêche le niveau 3 : éloigne les usines, plante des jardins et des parcs."),
        h("li", {}, "L'eau (puits, fontaine, château d'eau) éteint les incendies plus vite. La sécurité les rend plus rares."),
        h("li", {}, "Les calques (onglet Ville) montrent la couverture de chaque service."))
    ];
  }

  /* ================= Démarrage ================= */

  function initCam() {
    const c = S().cam;
    if (c) cam = { x: c.x, y: c.y, z: c.z };
    else { cam = { x: 0, y: 0, z: 1.3 }; centerOn(C.CENTER.x + 1, C.CENTER.y + 1); }
    clampCam();
  }
  initCam();
  if (/[?&]debug\b/.test(location.search)) window.__city = { get S() { return S(); }, get W() { return W; }, C };
  setTool("inspect");
  setSpeed(1);
  renderPalette();

  return {
    activate() {
      if (wallet.data.city !== W._for) { W = C.makeWorld(S()); W._for = wallet.data.city; initCam(); objVersion = -1; selected = -1; agents = []; }
      active = true;
      resize();
      renderHud(); renderPalette(); renderSide(true); renderMini();
      lastFrame = performance.now();
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    },
    deactivate() {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      keys.clear();
      drag = null;
      save(true);
    }
  };
}
