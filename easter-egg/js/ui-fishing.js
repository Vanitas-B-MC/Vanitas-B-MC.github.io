// js/ui-fishing.js — interface de « Grand Bleu » (la logique est dans fishing.js).
//
// Un seul bouton (ou Espace, ou un appui sur la scène) : maintenir pour charger le lancer, relâcher au sommet ;
// attendre la touche et appuyer pour ferrer ; puis maintenir pour faire monter la barre verte et garder le poisson dedans.
// La scène (ciel, décor, eau, météo) est dessinée au canvas selon le lieu, l'heure et le temps qu'il fait.

import * as F from "./fishing.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const LW = 640, LH = 360;              // taille logique de la scène
const WATER_Y = 214;
const ROD_TIP = { x: 168, y: 112 };
const TRACK = { x: 500, y: 34, w: 34, h: 292 };

function stat(label, valueEl) { return h("div", {}, h("dt", {}, label), h("dd", {}, valueEl)); }

/* ================= Dessin d'un poisson ================= */

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Dessine un poisson centré en (x, y), de longueur `len`, tourné vers la droite (ou la gauche si flip).
export function drawFish(ctx, shape, color, x, y, len, flip = false, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  const L = len, H = len * 0.36;
  const dark = shade(color, -0.35), light = shade(color, 0.45);
  const wag = Math.sin(t / 120) * 0.12;
  ctx.fillStyle = color;
  const tail = (tx, size) => { ctx.save(); ctx.translate(tx, 0); ctx.rotate(wag); ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * 0.7); ctx.lineTo(-size * 0.75, 0); ctx.lineTo(-size, size * 0.7); ctx.closePath(); ctx.fill(); ctx.restore(); };
  const eye = (ex, ey, r) => { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.fill(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(ex + r * 0.25, ey, r * 0.55, 0, 7); ctx.fill(); };
  switch (shape) {
    case "eel":
      ctx.strokeStyle = color; ctx.lineWidth = H * 0.7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-L / 2, 0);
      for (let k = 0; k <= 8; k++) ctx.lineTo(-L / 2 + (L * k) / 8, Math.sin(k * 1.1 + t / 150) * H * 0.35);
      ctx.stroke(); eye(L / 2 - H * 0.3, -H * 0.05, H * 0.15);
      break;
    case "squid":
      ctx.beginPath(); ctx.ellipse(L * 0.1, 0, L * 0.38, H * 0.62, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(L * 0.42, 0); ctx.lineTo(L * 0.58, -H * 0.5); ctx.lineTo(L * 0.58, H * 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, H * 0.12);
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-L * 0.26, (k - 2) * H * 0.18); ctx.quadraticCurveTo(-L * 0.4, (k - 2) * H * 0.4 + Math.sin(t / 140 + k) * H * 0.2, -L * 0.55, (k - 2) * H * 0.3); ctx.stroke(); }
      eye(-L * 0.12, -H * 0.12, H * 0.16);
      break;
    case "jelly":
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(0, 0, L * 0.3, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, L * 0.03);
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-L * 0.22 + k * L * 0.11, 0); ctx.quadraticCurveTo(-L * 0.22 + k * L * 0.11 + Math.sin(t / 200 + k) * L * 0.08, L * 0.25, -L * 0.22 + k * L * 0.11, L * 0.45); ctx.stroke(); }
      ctx.globalAlpha = 1;
      break;
    case "crab":
      ctx.beginPath(); ctx.ellipse(0, 0, L * 0.32, H * 0.55, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, L * 0.05);
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-L * 0.2, k * H * 0.3); ctx.lineTo(-L * 0.42, k * H * 0.5 + H * 0.2); ctx.moveTo(L * 0.2, k * H * 0.3); ctx.lineTo(L * 0.42, k * H * 0.5 + H * 0.2); ctx.stroke(); }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-L * 0.36, -H * 0.55, L * 0.1, 0, 7); ctx.arc(L * 0.36, -H * 0.55, L * 0.1, 0, 7); ctx.fill();
      eye(-L * 0.08, -H * 0.45, H * 0.12); eye(L * 0.08, -H * 0.45, H * 0.12);
      break;
    case "flat":
      ctx.beginPath(); ctx.moveTo(L * 0.35, 0); ctx.quadraticCurveTo(0, -H * 1.3, -L * 0.25, 0); ctx.quadraticCurveTo(0, H * 1.3, L * 0.35, 0); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, L * 0.03); ctx.beginPath(); ctx.moveTo(-L * 0.25, 0); ctx.lineTo(-L * 0.55, Math.sin(t / 160) * H * 0.3); ctx.stroke();
      eye(L * 0.15, -H * 0.15, H * 0.14);
      break;
    default: {
      const round = shape === "round", long = shape === "long", shark = shape === "shark";
      const bodyH = round ? H * 1.35 : long ? H * 0.75 : H;
      tail(-L * 0.36, shark ? L * 0.22 : L * 0.18);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, 0, L * 0.42, bodyH * 0.55, 0, 0, 7); ctx.fill();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(L * 0.02, bodyH * 0.2, L * 0.3, bodyH * 0.22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(-L * 0.12, -bodyH * 0.45); ctx.lineTo(shark ? L * 0.02 : L * 0.05, -bodyH * (shark ? 1.05 : 0.85)); ctx.lineTo(L * 0.14, -bodyH * 0.45); ctx.closePath(); ctx.fill();
      if (shark) { ctx.strokeStyle = dark; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(L * 0.18 + k * 3, -bodyH * 0.15); ctx.lineTo(L * 0.16 + k * 3, bodyH * 0.15); ctx.stroke(); } }
      eye(L * 0.27, -bodyH * 0.1, Math.max(1.2, bodyH * 0.13));
    }
  }
  ctx.restore();
}

function drawChest(ctx, x, y, s, open = false) {
  ctx.fillStyle = "#8a5a2a"; ctx.fillRect(x - s / 2, y - s * 0.3, s, s * 0.6);
  ctx.fillStyle = "#a8743a"; ctx.fillRect(x - s / 2, y - s * 0.5 - (open ? s * 0.2 : 0), s, s * 0.25);
  ctx.fillStyle = "#ffd23a"; ctx.fillRect(x - s * 0.08, y - s * 0.2, s * 0.16, s * 0.2);
}

/* ================= Interface ================= */

export function createFishingUI(root, wallet) {
  const A = () => wallet.data.angler;
  let active = false;
  let rafId = 0;
  let lastFrame = 0;
  let state = "idle";                 // idle → charging → waiting → bite → reel → result → idle
  let chargeStart = 0;
  let power = 0;
  let quality = 0;
  let bite = null;                    // { fish } ou { junk }
  let reel = null;                    // { params, s }
  let held = false;
  let biteTimer = 0, missTimer = 0;
  let castX = 380;
  let lineOut = 0;                    // animation du lancer (0 → 1)
  let splash = [];
  let shadows = [];
  let drops = [];
  let stars = Array.from({ length: 60 }, () => ({ x: Math.random() * LW, y: Math.random() * 190, s: Math.random() }));
  let flash = 0;
  let bookLoc = "all";
  let bookSel = null;
  let lowerTab = "book";
  const iconCache = new Map();

  /* ---------- Squelette ---------- */

  const board = h("canvas", { class: "gb-canvas", "aria-label": "Scène de pêche" });
  const ctx = board.getContext("2d");
  const card = h("div", { class: "gb-card", hidden: true, role: "status", "aria-live": "polite" });
  const stage = h("div", { class: "game-stage gb-stage" }, board, card);

  const locEl = h("strong", {});
  const clockEl = h("strong", {});
  const weatherEl = h("strong", {});
  const pearlsEl = h("strong", { class: "gb-pearls" });
  const levelEl = h("strong", {});
  const xpFill = h("span", { class: "sv-bar-fill sv-xp" });
  const xpText = h("span", { class: "sv-bar-text" });
  const status = h("p", { class: "gb-status", "aria-live": "polite" }, "Maintiens le bouton pour lancer, relâche au sommet de la jauge.");
  const castButton = h("button", { class: "button button-primary gb-cast", type: "button" }, "Maintenir pour lancer");
  const waitButton = h("button", { class: "map-button", type: "button", onclick: () => skipHour() }, "⏩ Attendre 1 h");
  const fsButton = h("button", { class: "map-button", type: "button", onclick: () => toggleFullscreen() }, "⛶ Plein écran");
  fsButton.hidden = !document.fullscreenEnabled;

  const locList = h("div", { class: "gb-locs" });
  const gearBox = h("div", { class: "gb-gear" });
  const availBox = h("div", { class: "gb-avail" });
  const lowerTabs = h("div", { class: "td-maps gb-tabs" }, [["book", "Bestiaire"], ["shop", "Boutique"], ["quests", "Quêtes du capitaine"]].map(([id, label]) =>
    h("button", { class: "map-button", type: "button", "data-tab": id, onclick: () => { lowerTab = id; renderLower(); } }, label)));
  const lowerBody = h("div", { class: "gb-lower-body" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Un vrai jeu de pêche : 6 lieux et 54 espèces à découvrir, chacune avec ses moments de la journée et sa météo. Lance, ferre à temps, puis garde le poisson dans la barre verte jusqu'à remplir la jauge — les poissons rares se débattent comme des fous. ",
      "Les prises se vendent en perles : achète cannes, appâts, accessoires et de nouveaux lieux. Chaque nouvelle espèce rapporte des crédits à l'arcade, les paliers du bestiaire et les légendaires des pièces bleues."),
    h("div", { class: "sv-layout gb-layout" },
      h("div", { class: "sv-main" },
        h("dl", { class: "td-stats gb-topbar" }, stat("Lieu", locEl), stat("Heure", clockEl), stat("Météo", weatherEl), stat("Perles", pearlsEl), stat("Niveau", levelEl)),
        h("div", { class: "sv-board-wrap chamfer gb-wrap" }, stage),
        h("div", { class: "sv-bars" }, h("div", { class: "sv-bar", role: "img", "aria-label": "Expérience de pêcheur" }, xpFill, xpText)),
        status, castButton,
        h("div", { class: "gb-tools" }, waitButton, fsButton)),
      h("aside", { class: "sv-side gb-side" },
        h("h3", { class: "subhead" }, "Lieux"), locList,
        h("h3", { class: "subhead" }, "Équipement"), gearBox,
        h("h3", { class: "subhead" }, "Ça mord en ce moment"), availBox)),
    h("section", { class: "gb-lower" }, lowerTabs, lowerBody)
  );

  /* ---------- Outils ---------- */

  function fishIcon(f, w = 64, hgt = 40) {
    const key = `${f.id}|${w}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement("canvas");
    c.width = w * 2; c.height = hgt * 2;
    const g = c.getContext("2d");
    g.scale(2, 2);
    drawFish(g, f.shape, f.color, w / 2, hgt / 2 + (f.shape === "jelly" ? -4 : 0), w * 0.8);
    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  }
  const img = (f, cls, w, hh) => h("img", { class: cls, alt: "", src: fishIcon(f, w, hh), width: String(w), height: String(hh) });

  let statusTimer = 0;
  function say(text, tone = "") { status.textContent = text; status.dataset.tone = tone; window.clearTimeout(statusTimer); }
  const save = () => wallet.saveAngler();

  const fsTarget = () => root.querySelector(".gb-wrap");
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else fsTarget()?.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === fsTarget();
    fsButton.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    fsTarget()?.classList.toggle("is-fullscreen", on);
    resize();
  });

  function resize() {
    const w = board.clientWidth || 640, hh = board.clientHeight || 360;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    board.width = Math.round(w * dpr);
    board.height = Math.round(hh * dpr);
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(board);

  function newDayCheck(changed) {
    if (!changed) return;
    const a = A();
    say(`Jour ${a.day} : ${F.WEATHERS[a.weather].icon} ${F.WEATHERS[a.weather].name}. Le capitaine a de nouvelles demandes.`, "push");
    renderLower();
  }

  function skipHour() {
    if (state !== "idle") return;
    newDayCheck(F.advance(A(), 60));
    save();
    renderSide();
    renderHud();
  }

  /* ---------- Pêche ---------- */

  const LABELS = { idle: "Maintenir pour lancer", charging: "Relâche au sommet !", waiting: "Remonter la ligne", bite: "FERRER !", reel: "Maintiens pour monter la barre", result: "Continuer" };
  function setState(s) {
    state = s;
    castButton.textContent = LABELS[s];
    castButton.classList.toggle("is-alert", s === "bite");
    waitButton.disabled = s !== "idle";
    locList.querySelectorAll("button").forEach((b) => { b.disabled = s !== "idle" || b.dataset.locked === "1"; });
  }

  function clearTimers() { window.clearTimeout(biteTimer); window.clearTimeout(missTimer); }

  function press() {
    if (state === "idle") { state = "charging"; chargeStart = performance.now(); setState("charging"); say("Relâche quand la jauge est au maximum !"); }
    else if (state === "waiting") { clearTimers(); setState("idle"); say("Tu as remonté la ligne trop tôt.", "lose"); lineOut = 0; }
    else if (state === "bite") hook();
    else if (state === "result") dismiss();
  }
  function release() {
    if (state === "charging") cast(F.castPower(performance.now() - chargeStart));
  }

  function cast(p) {
    const a = A();
    power = p;
    quality = F.castQuality(p);
    castX = 250 + p * 330;
    lineOut = 0.001;
    setState("waiting");
    const q = ["Lancer faible…", "Bon lancer.", "Lancer parfait !"][quality];
    say(`${q} La ligne est à l'eau. Patience…`, quality === 2 ? "win" : "");
    biteTimer = window.setTimeout(onBite, F.biteDelay(a, quality));
  }

  function onBite() {
    const a = A();
    bite = F.rollBite(a, quality);
    if (bite.fish) F.useBait(a);
    setState("bite");
    const sonar = F.hasTackle(a, "sonar") && bite.fish;
    say(sonar ? `Sonar : ${bite.fish.name} (${F.RARITY[bite.fish.rarity].name.toLowerCase()}) a mordu ! FERRE !` : "Ça mord ! FERRE !", "push");
    if (navigator.vibrate) try { navigator.vibrate(60); } catch { /* sans importance */ }
    splashAt(castX, WATER_Y, 10);
    missTimer = window.setTimeout(() => {
      setState("idle");
      lineOut = 0;
      say(bite.fish ? "Trop lent… le poisson a recraché l'hameçon." : "Trop lent… c'était sûrement une vieille botte.", "lose");
      bite = null;
    }, F.hookWindow(a));
  }

  function hook() {
    clearTimers();
    const a = A();
    if (bite.junk) {
      const res = F.landJunk(a, bite.junk);
      save();
      showResult({ junk: res.junk, value: res.value });
      return;
    }
    const params = F.reelParams(a, bite.fish);
    reel = { params, s: F.newReel(params) };
    setState("reel");
    say(`${F.hasTackle(a, "sonar") ? bite.fish.name : "Un poisson"} est ferré ! Garde-le dans la barre verte.`);
  }

  function endReel(won) {
    const a = A();
    const s = reel.s;
    const fish = bite.fish;
    let treasure = null;
    if (s.treasure?.got) { treasure = F.openTreasure(a); if (treasure.blue) wallet.addBlue(treasure.blue); }
    if (!won) {
      a.stats.escaped += 1;
      save();
      reel = null;
      setState("idle");
      lineOut = 0;
      say(`${F.hasTackle(a, "sonar") ? fish.name : "Le poisson"} s'est échappé !${treasure ? ` Mais tu as gardé le coffre : ${treasure.loot.map((l) => l.text).join(", ")}.` : ""}`, "lose");
      renderSide(); renderLower();
      return;
    }
    const size = F.rollSize(fish, F.luckOf(a, quality));
    const res = F.landFish(a, fish, size, s.perfect, { balance: wallet.credits });
    if (res.credits) wallet.addCredits(res.credits);
    if (res.blue) wallet.addBlue(res.blue);
    save();
    reel = null;
    showResult({ ...res, treasure });
  }

  function showResult(res) {
    setState("result");
    lineOut = 0;
    const parts = [];
    if (res.junk) {
      parts.push(h("p", { class: "gb-card-title" }, res.junk.name), h("p", { class: "gb-card-sub" }, `Pas un poisson… +${res.value} perle${res.value > 1 ? "s" : ""}.`));
      say(`Tu as pêché : ${res.junk.name}.`, "");
    } else {
      const f = res.fish;
      const r = F.RARITY[f.rarity];
      card.style.setProperty("--rc", r.color);
      parts.push(
        res.isNew ? h("p", { class: "gb-card-new" }, "Nouvelle espèce !") : res.record ? h("p", { class: "gb-card-new" }, "Nouveau record !") : null,
        img(f, "gb-card-img", 160, 90),
        h("p", { class: "gb-card-title" }, f.name),
        h("p", { class: "gb-card-rar" }, `${r.name}${res.q ? ` · ${"★".repeat(res.q)} ${F.QUALITY[res.q]}` : ""}${res.perfect ? " · Prise parfaite" : ""}`),
        h("p", { class: "gb-card-sub" }, `${res.size.toLocaleString("fr-FR")} cm · +${fmt(res.value)} perles · +${res.xp} XP`),
        res.credits ? h("p", { class: "gb-card-sub gb-cyan" }, `+${fmtShort(res.credits)} crédits d'arcade`) : null,
        res.blue ? h("p", { class: "gb-card-sub gb-blue" }, `+${res.blue} pièce${res.blue > 1 ? "s" : ""} bleue${res.blue > 1 ? "s" : ""} !`) : null,
        ...res.milestones.map((m) => h("p", { class: "gb-card-sub gb-blue" }, `Bestiaire : ${m.n} espèces !`)),
        ...res.quests.map((q) => h("p", { class: "gb-card-sub" }, `Quête réussie : ${F.questText(q)} (+${fmt(q.reward)} perles)`)),
        res.levelUp ? h("p", { class: "gb-card-new" }, `Niveau ${res.levelUp} !`) : null);
      say(`${f.name} — ${res.size.toLocaleString("fr-FR")} cm !`, f.rarity >= 2 ? "win" : "push");
    }
    if (res.treasure) parts.push(h("p", { class: "gb-card-sub gb-gold" }, `Coffre : ${res.treasure.loot.map((l) => l.text).join(", ")}`));
    parts.push(h("button", { class: "button button-secondary", type: "button", onclick: dismiss }, "Continuer"));
    card.replaceChildren(...parts.filter(Boolean));
    card.hidden = false;
    renderSide(); renderLower(); renderHud();
  }

  function dismiss() {
    card.hidden = true;
    bite = null;
    setState("idle");
    say("Maintiens le bouton pour relancer.");
  }

  function splashAt(x, y, n) {
    if (prefersReducedMotion()) return;
    for (let k = 0; k < n; k++) splash.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 70, life: 0.6 + Math.random() * 0.3 });
  }

  /* ---------- Entrées ---------- */

  castButton.addEventListener("pointerdown", (e) => { e.preventDefault(); try { castButton.setPointerCapture(e.pointerId); } catch { /* rien */ } held = true; press(); });
  const up = () => { if (!held) return; held = false; release(); };
  castButton.addEventListener("pointerup", up);
  castButton.addEventListener("pointercancel", up);
  castButton.addEventListener("click", (e) => { if (e.detail === 0) { if (state === "idle") { press(); cast(0.7); } else press(); } });
  board.addEventListener("pointerdown", (e) => { if (!active) return; e.preventDefault(); try { board.setPointerCapture(e.pointerId); } catch { /* rien */ } held = true; press(); });
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
  board.addEventListener("contextmenu", (e) => e.preventDefault());

  // Espace sert toujours à pêcher (même si un bouton du magasin a gardé le focus) ; Entrée active les boutons.
  const typing = (e) => e.target instanceof HTMLElement && !!e.target.closest("input, textarea, select");
  window.addEventListener("keydown", (e) => {
    if (!active || e.key !== " " || typing(e)) return;
    e.preventDefault();
    if (e.repeat || held) return;
    held = true;
    press();
  });
  window.addEventListener("keyup", (e) => { if (e.key === " " && active) { e.preventDefault(); up(); } });
  window.addEventListener("blur", up);

  /* ---------- Dessin de la scène ---------- */

  const SKY = {
    dawn: ["#ff9a6a", "#8a6aaa", "#3a3a7a"],
    day: ["#bfe8ff", "#7ac8ff", "#4a9ae8"],
    dusk: ["#ffb06a", "#e05a6a", "#3a2a6a"],
    night: ["#1a1a3a", "#0c0c24", "#05050f"]
  };

  function drawScene(now, dt) {
    const a = A();
    const W = board.width, H = board.height;
    const sx = W / LW, sy = H / LH;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    const p = F.period(a.time);
    const weather = F.currentWeather(a);
    const loc = a.loc;
    const underground = loc === "egouts" || loc === "abysse";

    // Ciel / plafond
    let g;
    if (loc === "egouts") {
      ctx.fillStyle = "#14101c"; ctx.fillRect(0, 0, LW, WATER_Y);
      for (let y = 0; y < WATER_Y; y += 14) for (let x = (y / 14) % 2 ? -14 : 0; x < LW; x += 28) { ctx.fillStyle = (x + y) % 3 ? "#241a2a" : "#2c2030"; ctx.fillRect(x + 1, y + 1, 26, 12); }
      ctx.fillStyle = "#0a0810";
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(80 + k * 160, WATER_Y, 70, Math.PI, 0); ctx.fill(); }
      const neon = (x, y, w, c) => { ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c; ctx.fillRect(x, y, w, 3); ctx.shadowBlur = 0; };
      neon(0, 40, LW, Math.sin(now / 400) > -0.9 ? "#ff2bd6" : "#401030");
      neon(0, 52, LW, "#00f0ff");
      ctx.fillStyle = "#3a3a4a"; ctx.fillRect(420, 0, 18, WATER_Y - 40); ctx.fillRect(420, WATER_Y - 46, 70, 16);
      ctx.fillStyle = "#6aff3a"; ctx.globalAlpha = 0.6; ctx.fillRect(480, WATER_Y - 30, 6, 30 + Math.sin(now / 200) * 2); ctx.globalAlpha = 1;
    } else if (loc === "abysse") {
      g = ctx.createLinearGradient(0, 0, 0, WATER_Y);
      g.addColorStop(0, "#020210"); g.addColorStop(1, "#06143a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, WATER_Y);
      for (const s of stars) { ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(now / 900 + s.s * 9)); ctx.fillStyle = s.s > 0.6 ? "#5affd0" : "#3aa9ff"; ctx.fillRect(s.x, s.y, 2, 2); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#04081a";
      ctx.beginPath(); ctx.moveTo(0, WATER_Y); ctx.lineTo(0, 60); ctx.lineTo(60, 90); ctx.lineTo(110, 50); ctx.lineTo(170, 120); ctx.lineTo(230, WATER_Y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(LW, WATER_Y); ctx.lineTo(LW, 40); ctx.lineTo(580, 110); ctx.lineTo(540, 70); ctx.lineTo(470, 150); ctx.lineTo(420, WATER_Y); ctx.fill();
    } else {
      const c = SKY[p];
      g = ctx.createLinearGradient(0, 0, 0, WATER_Y);
      g.addColorStop(0, c[2]); g.addColorStop(0.6, c[1]); g.addColorStop(1, c[0]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, WATER_Y);
      if (p === "night" || p === "dusk") for (const s of stars) { ctx.globalAlpha = (p === "night" ? 0.8 : 0.3) * (0.5 + 0.5 * Math.sin(now / 700 + s.s * 20)); ctx.fillStyle = "#fff"; ctx.fillRect(s.x, s.y * 0.7, 1.5, 1.5); }
      ctx.globalAlpha = 1;
      // Soleil ou lune
      const hour = (a.time / 60) % 24;
      const sun = hour >= 5 && hour < 20;
      const k = sun ? (hour - 5) / 15 : ((hour + 4) % 24) / 9;
      const bx = 40 + k * 560, by = 150 - Math.sin(k * Math.PI) * 120;
      if (weather === "sun" || weather === "fog") {
        ctx.fillStyle = sun ? (p === "day" ? "#fff6c0" : "#ffb070") : "#e8eeff";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(bx, by, sun ? 16 : 11, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
      if (weather !== "sun") {
        ctx.fillStyle = weather === "storm" ? "rgba(40,40,60,.7)" : "rgba(160,170,190,.55)";
        for (let k2 = 0; k2 < 6; k2++) { const cx = ((k2 * 130 + now / 120) % (LW + 200)) - 100; ctx.beginPath(); ctx.ellipse(cx, 40 + (k2 % 3) * 18, 70, 18, 0, 0, 7); ctx.fill(); }
      }
      drawBackdrop(loc, p, now);
    }

    // Eau
    g = ctx.createLinearGradient(0, WATER_Y, 0, LH);
    const deep = { etang: ["#3a7a6a", "#123a3a"], riviere: ["#4a8ab8", "#163a5a"], lac: ["#3a6a9a", "#0a1a3a"], mer: ["#2a5a9a", "#061a3a"], egouts: ["#2a3a1a", "#0a1006"], abysse: ["#0a2a6a", "#000208"] }[loc];
    const nightDim = !underground && p === "night" ? 0.5 : !underground && p === "dusk" ? 0.25 : 0;
    g.addColorStop(0, deep[0]); g.addColorStop(1, deep[1]);
    ctx.fillStyle = g; ctx.fillRect(0, WATER_Y, LW, LH - WATER_Y);
    ctx.strokeStyle = loc === "egouts" ? "rgba(140,255,80,.25)" : "rgba(255,255,255,.22)";
    ctx.lineWidth = 1.5;
    const flow = loc === "riviere" ? now / 12 : now / 40;
    for (let row = 0; row < 6; row++) {
      ctx.beginPath();
      for (let x = 0; x <= LW; x += 8) { const y = WATER_Y + 6 + row * 22 + Math.sin((x + flow + row * 50) / 30) * 2; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.globalAlpha = 0.6 - row * 0.08; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (loc === "mer" && (p === "night" || p === "dusk")) {   // reflets des néons
      for (let k = 0; k < 14; k++) { ctx.fillStyle = k % 2 ? "rgba(255,43,214,.25)" : "rgba(0,240,255,.25)"; ctx.fillRect(250 + k * 28 + Math.sin(now / 300 + k) * 3, WATER_Y + 8 + (k % 4) * 10, 14, 2); }
    }

    // Ombres de poissons (décor)
    if (shadows.length < 4 && Math.random() < dt * 0.4) { const left = Math.random() < 0.5; shadows.push({ x: left ? -40 : LW + 40, dir: left ? 1 : -1, y: WATER_Y + 40 + Math.random() * 100, v: 20 + Math.random() * 30, len: 20 + Math.random() * 40 }); }
    for (const s of shadows) {
      s.x += s.v * dt * s.dir;
      ctx.globalAlpha = loc === "abysse" ? 0.35 : 0.22;
      drawFish(ctx, "fish", loc === "abysse" ? "#5affd0" : "#000000", s.x, s.y, s.len, s.dir < 0, now);
    }
    ctx.globalAlpha = 1;
    shadows = shadows.filter((s) => s.x > -80 && s.x < LW + 80);

    // Ponton et pêcheur
    ctx.fillStyle = loc === "abysse" ? "#2a3a5a" : loc === "egouts" ? "#3a3a44" : "#7a4a22";
    ctx.fillRect(0, WATER_Y - 12, 190, 12);
    ctx.fillStyle = loc === "abysse" ? "#3a4a6a" : loc === "egouts" ? "#4a4a56" : "#a8743a";
    ctx.fillRect(0, WATER_Y - 14, 190, 3);
    for (let k = 0; k < 4; k++) { ctx.fillStyle = loc === "abysse" ? "#1a2a4a" : "#5a3418"; ctx.fillRect(20 + k * 50, WATER_Y - 2, 8, 40); }
    if (loc === "abysse") { ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, WATER_Y - 30); ctx.lineTo(190, WATER_Y - 30); ctx.stroke(); }
    const ax = 118, ay = WATER_Y - 14;
    const lean = state === "charging" ? -Math.min(1, (performance.now() - chargeStart) / 700) * 0.4 : state === "reel" ? 0.15 : 0;
    ctx.fillStyle = "#2a2a4a"; ctx.fillRect(ax - 6, ay - 18, 5, 18); ctx.fillRect(ax + 1, ay - 18, 5, 18);
    ctx.fillStyle = "#00b8d8"; ctx.fillRect(ax - 8, ay - 40, 16, 22);
    ctx.fillStyle = "#f0c8a0"; ctx.beginPath(); ctx.arc(ax, ay - 48, 8, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8c050"; ctx.fillRect(ax - 11, ay - 55, 22, 3); ctx.fillRect(ax - 6, ay - 61, 12, 6);
    ctx.fillStyle = "#000"; ctx.fillRect(ax + 3, ay - 50, 2, 2);
    // Canne
    const tipX = ROD_TIP.x + lean * 60, tipY = ROD_TIP.y + Math.abs(lean) * 30 + (state === "reel" ? 10 + Math.sin(now / 60) * 3 : 0);
    ctx.strokeStyle = "#5a3418"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax + 6, ay - 32); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = F.rodById(a.rod).id === "quantum" ? "#ff2bd6" : "#d8d8e0"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo((ax + 6 + tipX) / 2, (ay - 32 + tipY) / 2); ctx.lineTo(tipX, tipY); ctx.stroke();

    // Ligne et bouchon
    if (state === "waiting" || state === "bite" || state === "reel") {
      lineOut = Math.min(1, lineOut + dt * 2.2);
      const k = lineOut;
      const bx = tipX + (castX - tipX) * k;
      const arc = Math.sin(k * Math.PI) * 60;
      let byy = tipY + (WATER_Y - tipY) * k - arc;
      if (k >= 1) byy = WATER_Y + (state === "bite" ? 5 + Math.sin(now / 45) * 4 : Math.sin(now / 500) * 1.5) + (state === "reel" ? 6 : 0);
      const fx = state === "reel" && reel ? bx + (reel.s.fish - 0.5) * 40 : bx;
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + fx) / 2, Math.max(tipY, byy) + (state === "reel" ? -10 : 20), fx, byy); ctx.stroke();
      if (state !== "reel") {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, byy - 2, 4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ff2a3a"; ctx.beginPath(); ctx.arc(bx, byy + 1, 4, 0, Math.PI); ctx.fill();
        if (k >= 1) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(bx, WATER_Y + 3, 8 + (now / 60) % 12, 2, 0, 0, 7); ctx.stroke(); }
      } else { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(fx, WATER_Y + 3, 12, 3, 0, 0, 7); ctx.stroke(); if (Math.random() < 0.3) splashAt(fx, WATER_Y, 1); }
    }
    if (state === "bite") {
      const b = Math.sin(now / 80) * 3;
      ctx.fillStyle = "#fcee0a"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
      ctx.font = "bold 40px Rajdhani, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.strokeText("!", ax, ay - 70 + b); ctx.fillText("!", ax, ay - 70 + b);
    }

    // Jauge de lancer
    if (state === "charging") {
      power = F.castPower(performance.now() - chargeStart);
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(ax - 40, ay - 96, 12, 70);
      ctx.fillStyle = power >= 0.92 ? "#fcee0a" : power >= 0.65 ? "#3ddc84" : "#00f0ff";
      ctx.fillRect(ax - 38, ay - 28 - 66 * power, 8, 66 * power);
      ctx.strokeStyle = "#fcee0a"; ctx.lineWidth = 1; ctx.strokeRect(ax - 40, ay - 96, 12, 6);
    }

    // Éclaboussures
    for (const s of splash) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * dt; s.life -= dt; ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = "#cfe8ff"; ctx.fillRect(s.x, s.y, 2, 2); }
    ctx.globalAlpha = 1;
    splash = splash.filter((s) => s.life > 0 && s.y < WATER_Y + 4);

    // Météo et nuit
    if (!underground && (weather === "rain" || weather === "storm")) {
      while (drops.length < 160) drops.push({ x: Math.random() * LW, y: Math.random() * LH, v: 380 + Math.random() * 160 });
      ctx.strokeStyle = "rgba(180,200,255,.5)"; ctx.lineWidth = 1; ctx.beginPath();
      for (const d of drops) { d.y += d.v * dt; d.x -= d.v * 0.2 * dt; if (d.y > LH) { d.y = -10; d.x = Math.random() * (LW + 60); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + 10); }
      ctx.stroke();
      if (weather === "storm") {
        if (Math.random() < dt * 0.15) flash = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; ctx.fillRect(0, 0, LW, LH); flash -= dt * 3; }
      }
    } else drops.length = 0;
    if (weather === "fog") {
      for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(220,226,236,${0.16 + k * 0.04})`; ctx.fillRect(((now / (60 + k * 30)) % LW) - LW, 120 + k * 40, LW * 2, 50); }
    }
    if (nightDim) { ctx.fillStyle = `rgba(6,6,30,${nightDim * 0.6})`; ctx.fillRect(0, 0, LW, LH); }

    // Mini-jeu
    if (state === "reel" && reel) drawReel(now);
  }

  function drawBackdrop(loc, p, now) {
    const dim = p === "night" ? 0.55 : p === "dusk" ? 0.25 : 0;
    const col = (hex) => shade(hex, -dim);
    if (loc === "etang") {
      ctx.fillStyle = col("#4a8a4a"); ctx.beginPath(); ctx.ellipse(160, WATER_Y, 260, 60, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = col("#3a7a3a"); ctx.beginPath(); ctx.ellipse(520, WATER_Y, 220, 80, 0, Math.PI, 0); ctx.fill();
      for (let k = 0; k < 7; k++) { const x = 260 + k * 55; ctx.fillStyle = col("#5a3a1a"); ctx.fillRect(x, WATER_Y - 60, 5, 40); ctx.fillStyle = col(k % 2 ? "#2a6a3a" : "#3a8a4a"); ctx.beginPath(); ctx.arc(x + 2, WATER_Y - 66, 20, 0, 7); ctx.fill(); }
      ctx.strokeStyle = col("#6a8a3a"); ctx.lineWidth = 2;
      for (let k = 0; k < 14; k++) { const x = 560 + k * 6; ctx.beginPath(); ctx.moveTo(x, WATER_Y + 4); ctx.lineTo(x + Math.sin(now / 700 + k) * 3, WATER_Y - 22 - (k % 3) * 6); ctx.stroke(); }
    } else if (loc === "riviere") {
      ctx.fillStyle = col("#5a8a5a"); ctx.beginPath(); ctx.ellipse(500, WATER_Y, 300, 90, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = col("#3a6a3a"); for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.moveTo(260 + k * 34, WATER_Y - 20); ctx.lineTo(276 + k * 34, WATER_Y - 75 - (k % 3) * 12); ctx.lineTo(292 + k * 34, WATER_Y - 20); ctx.fill(); }
      ctx.fillStyle = col("#8a8a8a"); ctx.beginPath(); ctx.ellipse(420, WATER_Y + 2, 18, 7, 0, 0, 7); ctx.ellipse(560, WATER_Y + 3, 24, 8, 0, 0, 7); ctx.fill();
    } else if (loc === "lac") {
      const mountain = (x, w, hh, c) => { ctx.fillStyle = col(c); ctx.beginPath(); ctx.moveTo(x - w, WATER_Y); ctx.lineTo(x, WATER_Y - hh); ctx.lineTo(x + w, WATER_Y); ctx.fill(); ctx.fillStyle = col("#f0f6ff"); ctx.beginPath(); ctx.moveTo(x - w * 0.22, WATER_Y - hh * 0.78); ctx.lineTo(x, WATER_Y - hh); ctx.lineTo(x + w * 0.22, WATER_Y - hh * 0.78); ctx.fill(); };
      mountain(260, 170, 150, "#5a6a8a"); mountain(470, 200, 180, "#4a5a7a"); mountain(620, 120, 110, "#5a6a8a");
      ctx.fillStyle = col("#2a4a3a"); for (let k = 0; k < 16; k++) { ctx.beginPath(); ctx.moveTo(200 + k * 28, WATER_Y); ctx.lineTo(212 + k * 28, WATER_Y - 30 - (k % 4) * 6); ctx.lineTo(224 + k * 28, WATER_Y); ctx.fill(); }
    } else if (loc === "mer") {
      const lit = p === "night" || p === "dusk";
      for (let k = 0; k < 18; k++) {
        const x = 200 + k * 25, hh = 40 + ((k * 37) % 90);
        ctx.fillStyle = lit ? "#0c0c1e" : col("#5a6a8a");
        ctx.fillRect(x, WATER_Y - hh, 22, hh);
        if (lit) for (let w = 0; w < hh / 8; w++) for (let c = 0; c < 3; c++) if ((k * 7 + w * 3 + c) % 4) { ctx.fillStyle = (k + w) % 5 ? "rgba(255,220,120,.7)" : "rgba(0,240,255,.8)"; ctx.fillRect(x + 3 + c * 6, WATER_Y - hh + 4 + w * 8, 3, 3); }
      }
      if (lit) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = "#ff2bd6"; ctx.fillStyle = Math.sin(now / 300) > -0.8 ? "#ff2bd6" : "#401030"; ctx.fillRect(300, WATER_Y - 112, 40, 10);
        ctx.shadowColor = "#00f0ff"; ctx.fillStyle = "#00f0ff"; ctx.fillRect(470, WATER_Y - 96, 30, 8);
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawReel(now) {
    const { s, params } = reel;
    const T = TRACK;
    ctx.fillStyle = "rgba(7,7,11,.86)"; ctx.fillRect(T.x - 10, T.y - 10, T.w + 52, T.h + 20);
    ctx.strokeStyle = "#a8743a"; ctx.lineWidth = 3; ctx.strokeRect(T.x - 10, T.y - 10, T.w + 52, T.h + 20);
    const g = ctx.createLinearGradient(0, T.y, 0, T.y + T.h);
    g.addColorStop(0, "#2a5a9a"); g.addColorStop(1, "#0a1a3a");
    ctx.fillStyle = g; ctx.fillRect(T.x, T.y, T.w, T.h);
    // Barre verte
    const by = T.y + T.h * (1 - s.pos - params.bar);
    ctx.fillStyle = s.inside ? "rgba(61,255,143,.75)" : "rgba(61,255,143,.42)";
    ctx.fillRect(T.x + 2, by, T.w - 4, T.h * params.bar);
    ctx.strokeStyle = "#3dff8f"; ctx.lineWidth = 1.5; ctx.strokeRect(T.x + 2, by, T.w - 4, T.h * params.bar);
    // Trésor
    const t = s.treasure;
    if (t && t.shown && !t.got) {
      const ty = T.y + T.h * (1 - t.y);
      drawChest(ctx, T.x + T.w / 2, ty, 16);
      ctx.strokeStyle = "#ffd23a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(T.x + T.w / 2, ty, 13, -Math.PI / 2, -Math.PI / 2 + t.p * Math.PI * 2); ctx.stroke();
    }
    // Poisson
    const fy = T.y + T.h * (1 - s.fish);
    drawFish(ctx, bite.fish.shape === "jelly" || bite.fish.shape === "crab" || bite.fish.shape === "squid" ? bite.fish.shape : "fish", bite.fish.color, T.x + T.w / 2, fy, 30, s.target < s.fish, now);
    // Jauge de capture
    const px = T.x + T.w + 10, pw = 14;
    ctx.fillStyle = "#1a1a24"; ctx.fillRect(px, T.y, pw, T.h);
    const prog = s.progress;
    ctx.fillStyle = prog < 0.3 ? "#ff2a6d" : prog < 0.7 ? "#fcee0a" : "#3dff8f";
    ctx.fillRect(px + 2, T.y + T.h * (1 - prog), pw - 4, T.h * prog);
    if (s.perfect) { ctx.fillStyle = "#fcee0a"; ctx.font = "bold 11px Rajdhani, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("PARFAIT", T.x + T.w / 2 + 12, T.y + T.h + 22); }
  }

  /* ---------- Boucle ---------- */

  let lastHud = 0;
  function frame(now) {
    rafId = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const a = A();
    if (state !== "reel" && state !== "result") newDayCheck(F.advance(a, dt * F.MIN_PER_REAL_SEC));
    if (state === "reel" && reel) {
      F.reelStep(reel.s, dt, held, reel.params);
      if (reel.s.status === "won") endReel(true);
      else if (reel.s.status === "lost") endReel(false);
    }
    drawScene(now, dt);
    if (now - lastHud > 250) { lastHud = now; renderHud(); if (state === "idle") renderAvail(); }
    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------- Panneaux ---------- */

  function renderHud() {
    const a = A();
    const loc = F.locById(a.loc);
    locEl.textContent = loc.name;
    const p = F.period(a.time);
    clockEl.textContent = `${F.clockText(a.time)} · ${F.TIMES[p].name}`;
    const w = F.currentWeather(a);
    weatherEl.textContent = `${F.WEATHERS[w].icon} ${F.WEATHERS[w].name}${a.totem ? " (totem)" : ""}`;
    pearlsEl.textContent = fmtShort(a.pearls);
    pearlsEl.title = `${fmt(a.pearls)} perles`;
    const lvl = F.level(a);
    levelEl.textContent = String(lvl);
    const lo = lvl ? F.XP_LEVELS[lvl - 1] : 0, hi = F.XP_LEVELS[lvl] ?? lo;
    xpFill.style.width = `${lvl >= 10 ? 100 : ((a.xp - lo) / (hi - lo)) * 100}%`;
    xpText.textContent = lvl >= 10 ? "Pêcheur légendaire (niveau max)" : `Niveau ${lvl} — ${fmt(a.xp)} / ${fmt(hi)} XP`;
  }

  let availKey = "";
  function renderAvail() {
    const a = A();
    const bait = F.baitById(a.baitOn);
    const magic = !!(bait?.magic && a.bait[bait.id]);
    const list = F.available(a.loc, a.time, F.currentWeather(a), magic);
    const key = `${a.loc}|${list.map((f) => f.id).join()}|${Object.keys(a.dex).length}`;
    if (key === availKey) return;
    availKey = key;
    availBox.replaceChildren(h("ul", { class: "gb-avail-list" }, list.map((f) => {
      const known = !!a.dex[f.id];
      return h("li", { style: `--rc:${F.RARITY[f.rarity].color}` }, known ? img(f, "gb-mini", 40, 24) : h("span", { class: "gb-mini gb-unknown" }, "?"),
        h("span", {}, known ? f.name : "???"), h("em", {}, F.RARITY[f.rarity].name));
    })), h("p", { class: "gb-note" }, magic ? "Appât magique : moment et météo ignorés." : "Change l'heure ou attends une autre météo pour d'autres espèces."));
  }

  function renderSide() {
    const a = A();
    locList.replaceChildren(...F.LOCATIONS.map((l) => {
      const open = a.unlocked.includes(l.id);
      const total = F.FISH.filter((f) => f.loc === l.id).length;
      const got = F.FISH.filter((f) => f.loc === l.id && a.dex[f.id]).length;
      const b = h("button", { class: `map-button gb-loc${a.loc === l.id ? " is-active" : ""}${open ? "" : " is-locked"}`, type: "button", "data-locked": open ? "0" : "1",
        title: l.desc, onclick: () => { if (!open || state !== "idle") return; a.loc = l.id; availKey = ""; save(); renderSide(); renderHud(); renderAvail(); } },
        h("strong", {}, l.name), h("span", {}, open ? `${got} / ${total} espèces` : `Boutique · ${fmt(l.price)} perles${l.lvl ? ` · niv. ${l.lvl}` : ""}`));
      b.disabled = !open || state !== "idle";
      return b;
    }));

    const rod = F.rodById(a.rod);
    const rodSel = h("select", { class: "gb-select", "aria-label": "Canne" }, a.rods.map((id) => h("option", { value: id, selected: id === a.rod }, F.rodById(id).name)));
    rodSel.addEventListener("change", () => { F.equipRod(a, rodSel.value); save(); renderSide(); });
    const baitSel = h("select", { class: "gb-select", "aria-label": "Appât" },
      h("option", { value: "", selected: !a.baitOn }, "Sans appât"),
      F.BAITS.filter((b) => a.bait[b.id]).map((b) => h("option", { value: b.id, selected: a.baitOn === b.id }, `${b.name} (${a.bait[b.id]})`)));
    baitSel.addEventListener("change", () => { a.baitOn = baitSel.value || null; availKey = ""; save(); renderSide(); renderAvail(); });
    const tackles = F.TACKLE.filter((t) => a.tackle[t.id]);
    gearBox.replaceChildren(
      h("label", { class: "gb-field" }, h("span", {}, "Canne"), rodSel),
      h("p", { class: "gb-note" }, `Barre ${Math.round(F.barSize(a) * 100)} % · ${rod.slots} accessoire${rod.slots > 1 ? "s" : ""} · chance +${Math.round(F.luckOf(a) * 100)} %`),
      h("label", { class: "gb-field" }, h("span", {}, "Appât"), baitSel),
      h("p", { class: "gb-field-title" }, `Accessoires (${a.tackleOn.length} / ${rod.slots})`),
      tackles.length ? h("div", { class: "gb-tackles" }, tackles.map((t) => h("button", { class: `map-button${a.tackleOn.includes(t.id) ? " is-active" : ""}`, type: "button", title: t.desc,
        disabled: !a.tackleOn.includes(t.id) && a.tackleOn.length >= rod.slots,
        onclick: () => { F.toggleTackle(a, t.id); save(); renderSide(); } }, `${t.name} · ${a.tackle[t.id]}`))) : h("p", { class: "gb-note" }, rod.slots ? "Aucun accessoire : achète-en à la boutique." : "La canne en bambou n'accepte pas d'accessoire."));
    locList.querySelectorAll("button").forEach((b) => { b.disabled = state !== "idle" || b.dataset.locked === "1"; });
  }

  function renderLower() {
    const a = A();
    lowerTabs.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === lowerTab));
    const out = [];
    if (lowerTab === "book") {
      const species = Object.keys(a.dex).length;
      const next = F.MILESTONES.find((m) => !a.milestones.includes(m.n));
      out.push(h("p", { class: "gb-note gb-book-head" }, `${species} / ${F.FISH.length} espèces · ${fmt(a.stats.caught)} prises · ${fmt(a.stats.perfect)} parfaites · ${fmt(a.stats.treasure)} coffres · ${fmt(a.junk)} déchets${next ? ` · prochain palier : ${next.n} espèces (+${next.blue} pièce${next.blue > 1 ? "s" : ""} bleue${next.blue > 1 ? "s" : ""})` : " · bestiaire complet !"}`));
      out.push(h("div", { class: "td-maps" }, [["all", "Tous"], ...F.LOCATIONS.map((l) => [l.id, l.name])].map(([id, label]) =>
        h("button", { class: `map-button${bookLoc === id ? " is-active" : ""}`, type: "button", onclick: () => { bookLoc = id; renderLower(); } }, label))));
      const sel = bookSel && F.fishById(bookSel);
      if (sel) out.push(detail(a, sel));
      const grid = h("div", { class: "gb-book" });
      for (const f of F.FISH.filter((x) => bookLoc === "all" || x.loc === bookLoc)) {
        const d = a.dex[f.id];
        grid.append(h("button", { class: `gb-entry${d ? "" : " is-unknown"}${bookSel === f.id ? " is-sel" : ""}`, type: "button", style: `--rc:${F.RARITY[f.rarity].color}`,
          onclick: () => { bookSel = bookSel === f.id ? null : f.id; renderLower(); } },
          img(f, "gb-entry-img", 64, 40), h("strong", {}, d ? f.name : "???"), h("span", {}, d ? `×${fmt(d.n)} · ${d.best.toLocaleString("fr-FR")} cm` : F.RARITY[f.rarity].name)));
      }
      out.push(grid);
    }
    else if (lowerTab === "shop") {
      const lvl = F.level(a);
      const row = (name, desc, price, disabled, onclick, extra = "") => h("li", {}, h("div", { class: "rv-shop-text" }, h("strong", {}, name), h("span", {}, desc)),
        h("em", {}, `${price}${extra}`), h("button", { class: "button button-secondary rv-mini", type: "button", disabled, onclick }, "Acheter"));
      const act = (fn) => () => { const res = fn(); say(res.msg ?? "", res.ok ? "win" : "lose"); save(); renderLower(); renderSide(); renderHud(); availKey = ""; renderAvail(); };
      out.push(h("p", { class: "gb-note" }, `Tu as ${fmt(a.pearls)} perles · ${fmt(wallet.blue)} pièces bleues · niveau ${lvl}.`));
      out.push(h("h3", { class: "subhead" }, "Cannes"), h("ul", { class: "rv-list rv-shop" }, F.RODS.filter((r) => r.price).map((r) =>
        row(r.name, `Barre +${Math.round(r.bar * 100)} pts · ${r.slots} accessoire${r.slots > 1 ? "s" : ""} · touche ${Math.round((1 - r.bite) * 100)} % plus rapide${r.lvl ? ` · niveau ${r.lvl}` : ""}`,
          a.rods.includes(r.id) ? "Possédée" : `${fmt(r.price)} perles`, a.rods.includes(r.id) || lvl < r.lvl,
          act(() => F.buyRod(a, r.id, { blueBalance: wallet.blue, spendBlue: (n) => wallet.spendBlue(n) })), r.blue && !a.rods.includes(r.id) ? ` + ${r.blue} ◆` : ""))));
      out.push(h("h3", { class: "subhead" }, "Appâts"), h("ul", { class: "rv-list rv-shop" }, F.BAITS.map((b) =>
        row(`${b.name} ×${b.n}`, `${b.desc}${b.lvl ? ` · niveau ${b.lvl}` : ""} · tu en as ${a.bait[b.id] ?? 0}`, `${fmt(b.price)} perles`, lvl < b.lvl, act(() => F.buyBait(a, b.id))))));
      out.push(h("h3", { class: "subhead" }, "Accessoires"), h("ul", { class: "rv-list rv-shop" }, F.TACKLE.map((t) =>
        row(t.name, `${t.desc} ${t.uses} prises${t.lvl ? ` · niveau ${t.lvl}` : ""}`, `${fmt(t.price)} perles`, lvl < t.lvl, act(() => F.buyTackle(a, t.id))))));
      out.push(h("h3", { class: "subhead" }, "Lieux"), h("ul", { class: "rv-list rv-shop" }, F.LOCATIONS.filter((l) => l.price).map((l) =>
        row(l.name, `${l.desc}${l.lvl ? ` · niveau ${l.lvl}` : ""}`, a.unlocked.includes(l.id) ? "Débloqué" : `${fmt(l.price)} perles`, a.unlocked.includes(l.id) || lvl < l.lvl, act(() => F.unlockLoc(a, l.id))))));
      out.push(h("h3", { class: "subhead" }, "Divers"), h("ul", { class: "rv-list rv-shop" },
        row("Totem de pluie", F.RAIN_TOTEM.desc, `${F.RAIN_TOTEM.price} perles`, false, act(() => F.buyTotem(a)))));
    }
    else if (lowerTab === "quests") {
      out.push(h("p", { class: "gb-note" }, "Le capitaine du port affiche 3 demandes chaque jour (à 6 h). Elles se valident toutes seules à la prise, et rapportent perles et crédits d'arcade."));
      const list = h("ul", { class: "rv-list" });
      for (const q of a.quests) list.append(h("li", { class: q.done ? "is-done" : "" }, h("span", { class: "rv-ach-mark" }, q.done ? "✔" : "○"),
        h("div", { class: "rv-shop-text" }, h("strong", {}, F.questText(q)), h("span", {}, `${q.p} / ${q.n}`)), h("em", {}, `${fmt(q.reward)} perles`)));
      out.push(list);
    }
    lowerBody.replaceChildren(...out);
  }

  function detail(a, f) {
    const d = a.dex[f.id];
    const r = F.RARITY[f.rarity];
    const when = f.times.length ? f.times.map((t) => F.TIMES[t].name).join(", ") : "À toute heure";
    const weather = f.weather.length ? f.weather.map((w) => F.WEATHERS[w].name).join(", ") : "Par tous les temps";
    return h("div", { class: "gb-detail", style: `--rc:${r.color}` },
      d ? img(f, "gb-detail-img", 160, 90) : h("div", { class: "gb-detail-img gb-unknown" }, "?"),
      h("div", {},
        h("p", { class: "gb-detail-name" }, d ? f.name : "Espèce inconnue"),
        h("p", { class: "gb-detail-rar" }, `${r.name} · ${F.locById(f.loc).name}`),
        h("p", { class: "gb-detail-desc" }, d ? f.desc : "Attrape-la pour en savoir plus."),
        h("dl", { class: "td-stats gb-detail-stats" },
          stat("Moment", h("strong", {}, d ? when : "???")), stat("Météo", h("strong", {}, d ? weather : "???")),
          stat("Taille", h("strong", {}, d ? `${f.min}–${f.max} cm` : "???")), stat("Record", h("strong", {}, d ? `${d.best.toLocaleString("fr-FR")} cm` : "—")),
          stat("Comportement", h("strong", {}, d ? `${F.BEHAVIORS[f.behavior].name} (${f.diff})` : "???")), stat("Prix", h("strong", {}, d ? `${fmt(f.price)} perles` : "???")),
          stat("Prises", h("strong", {}, d ? fmt(d.n) : "0")), stat("Meilleure qualité", h("strong", {}, d?.q ? F.QUALITY[d.q] : "—")))));
  }

  wallet.subscribe(() => { if (active && lowerTab === "shop") { /* le solde de pièces bleues est relu au prochain affichage */ } });
  window.addEventListener("pagehide", () => save());

  resize();
  setState("idle");

  return {
    activate() {
      active = true;
      const a = A();
      if (!a.quests.length) a.quests = F.makeQuests(a);
      resize();
      renderHud(); renderSide(); renderLower(); availKey = ""; renderAvail();
      lastFrame = performance.now();
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    },
    deactivate() {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      clearTimers();
      held = false;
      if (state === "reel" || state === "bite" || state === "waiting" || state === "charging") { reel = null; bite = null; lineOut = 0; setState("idle"); }
      if (state === "result") dismiss();
      save();
    }
  };
}
