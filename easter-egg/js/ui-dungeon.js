// js/ui-dungeon.js — affichage et commandes de « Donjon » (logique dans dungeon.js).
// Déplacement : flèches, ZQSD/WASD, ou glisser le doigt sur l'arène. Attaque automatique.
// Compétence : Espace / Maj / E, ou le bouton à l'écran. Pause : P.

import {
  W, H, WALL, PLAYER_R, CLASSES, FREE_CLASS, META, ITEMS, ENEMIES, ROOMS_PER_FLOOR, classById, metaCost, describe,
  createState, update, chooseItem, runRewards
} from "./dungeon.js";
import { wealthBonus, dungeonPct } from "./rewards.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const STEP = 1 / 60;

export function createDungeonUI(root, wallet) {
  let active = false;
  let status = "idle";                 // idle | running | paused | over
  let classId = FREE_CLASS;
  let state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  const keys = new Set();
  let skillQueued = false;
  let drag = null;
  let dragVec = { dx: 0, dy: 0 };
  let stick = null;
  let shownChoices = null;

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "dg-board", "aria-label": "Donjon" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Donjon");
  const overlayText = h("p", { class: "overlay-text" });
  const startButton = h("button", { class: "button button-primary", id: "dg-start", type: "button" }, "Entrer");
  const overlay = h("div", { class: "game-overlay", id: "dg-overlay" }, overlayTitle, overlayText, startButton);

  const choiceList = h("div", { class: "sv-choices" });
  const choicePanel = h("div", { class: "game-overlay sv-levelup", id: "dg-choices", hidden: true },
    h("p", { class: "overlay-title" }, "Coffre ouvert"),
    h("p", { class: "overlay-text" }, "Choisis un objet (touches 1 à 4)"),
    choiceList);

  const stage = h("div", { class: "game-stage dg-stage" }, board, overlay, choicePanel);

  const hpBar = h("span", { class: "sv-bar-fill sv-hp" });
  const hpText = h("span", { class: "sv-bar-text" });
  const floorEl = h("strong", {}, "1");
  const roomEl = h("strong", {}, "1/3");
  const killsEl = h("strong", {}, "0");
  const coinsEl = h("strong", {}, "0");
  const bestEl = h("strong", {}, "0");
  const soulsEl = h("strong", { id: "dg-souls" }, "0");
  const stateEl = h("p", { class: "game-state", "aria-live": "polite" }, "Prêt");
  const ownedList = h("ul", { class: "sv-owned" });

  const skillButton = h("button", { class: "button button-secondary dg-skill", id: "dg-skill", type: "button", onclick: () => { skillQueued = true; } });

  const charBar = h("div", { class: "td-maps", role: "group", "aria-label": "Classe" });
  const forge = h("div", { class: "dg-forge" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Descends dans le donjon : 3 salles par étage, un boss tous les 5 étages. Ton héros attaque tout seul, à toi d'esquiver, d'ouvrir les coffres et d'utiliser ta compétence. Les âmes gagnées financent des améliorations permanentes et de nouvelles classes."),
    h("div", { class: "sv-layout" },
      h("div", { class: "sv-main" },
        charBar,
        h("div", { class: "sv-board-wrap chamfer" }, stage),
        h("div", { class: "sv-bars" },
          h("div", { class: "sv-bar", role: "img", "aria-label": "Points de vie" }, hpBar, hpText)),
        skillButton),
      h("aside", { class: "sv-side" },
        h("dl", { class: "td-stats" },
          stat("Étage", floorEl), stat("Salle", roomEl), stat("Éliminés", killsEl), stat("Pièces", coinsEl),
          stat("Record", bestEl), stat("Âmes", soulsEl)),
        stateEl,
        h("h3", { class: "subhead" }, "Objets"),
        ownedList,
        h("ul", { class: "game-help" },
          h("li", {}, h("kbd", {}, "←↑↓→"), " ou ", h("kbd", {}, "ZQSD"), " : se déplacer"),
          h("li", {}, h("kbd", {}, "Espace"), " : compétence · ", h("kbd", {}, "P"), " pause"),
          h("li", {}, "Mobile : glisse le doigt, bouton de compétence sous l'arène")))),
    h("h3", { class: "subhead" }, "Forge d'âmes"),
    forge
  );

  function stat(label, el) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, el));
  }

  /* ---------- Canvas ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  board.width = W * dpr;
  board.height = H * dpr;
  const ctx = board.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const reduced = prefersReducedMotion();

  const glow = (color, blur = 10) => { ctx.shadowColor = color; ctx.shadowBlur = reduced ? 0 : blur; };
  const noGlow = () => { ctx.shadowBlur = 0; };

  function drawRoom() {
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, W, H);
    // dalles
    for (let y = WALL; y < H - WALL; y += 36) {
      for (let x = WALL; x < W - WALL; x += 36) {
        ctx.fillStyle = ((x + y) / 36) % 2 === 0 ? "#0d0b16" : "#0a0912";
        ctx.fillRect(x, y, 36, 36);
      }
    }
    // murs
    ctx.strokeStyle = state.kind === "boss" ? "#ff2a6d" : state.kind === "elite" ? "#fcee0a" : "#00f0ff";
    ctx.lineWidth = 3;
    glow(ctx.strokeStyle, 14);
    ctx.strokeRect(WALL, WALL, W - 2 * WALL, H - 2 * WALL);
    noGlow();
    ctx.fillStyle = "rgba(0,240,255,.05)";
    ctx.fillRect(0, 0, W, WALL);
    ctx.fillRect(0, H - WALL, W, WALL);
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    // piliers
    for (const o of state.obstacles) {
      ctx.fillStyle = "#171326";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#3b3463";
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    }
    // porte de sortie (en haut)
    const open = !!state.exit;
    ctx.fillStyle = open ? "#00f0ff" : "#2a2440";
    glow("#00f0ff", open ? 18 : 0);
    ctx.fillRect(W / 2 - 22, 8, 44, WALL - 6);
    noGlow();
    if (open) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(state.time * 5);
      ctx.beginPath();
      ctx.arc(state.exit.x, state.exit.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = "#00f0ff";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // coffre
    if (state.chest && !state.chest.opened) {
      const c = state.chest;
      glow("#fcee0a", 16);
      ctx.fillStyle = "#c79a1c";
      ctx.fillRect(c.x - 13, c.y - 9, 26, 18);
      ctx.fillStyle = "#fcee0a";
      ctx.fillRect(c.x - 13, c.y - 9, 26, 6);
      ctx.fillRect(c.x - 3, c.y - 4, 6, 8);
      noGlow();
    }
  }

  function drawEnemy(e) {
    const def = e.boss ? null : ENEMIES[e.type];
    const color = e.boss ? { golem: "#ff8a3d", spider: "#ff2a6d", lich: "#b58cff" }[e.type] : def.color;
    if (e.spawn > 0) {
      ctx.globalAlpha = 0.3 + 0.4 * (1 - Math.min(1, e.spawn / 0.7));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 + e.spawn), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const hit = e.flash > 0;
    const fill = hit ? "#ffffff" : e.burn > 0 ? "#ff8a3d" : e.slow > 0 ? "#7fd8ff" : color;
    ctx.fillStyle = fill;
    glow(color, e.elite || e.boss ? 18 : 8);
    ctx.beginPath();
    const ai = e.boss ? "boss" : def.ai;
    if (ai === "flutter") {
      const flap = Math.sin(state.time * 22 + e.id) * 5;
      ctx.moveTo(e.x - e.r * 1.6, e.y - flap);
      ctx.lineTo(e.x, e.y - 3);
      ctx.lineTo(e.x + e.r * 1.6, e.y - flap);
      ctx.lineTo(e.x, e.y + e.r);
      ctx.closePath();
    } else if (ai === "charger") {
      const warn = e.st === "windup";
      if (warn) ctx.fillStyle = Math.floor(state.time * 14) % 2 ? "#ffffff" : "#ff3b5c";
      ctx.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    } else if (ai === "mage") {
      ctx.moveTo(e.x, e.y - e.r * 1.4);
      ctx.lineTo(e.x + e.r, e.y + e.r);
      ctx.lineTo(e.x - e.r, e.y + e.r);
      ctx.closePath();
    } else if (ai === "boss") {
      if (e.st === "windup") ctx.fillStyle = Math.floor(state.time * 14) % 2 ? "#ffffff" : "#ff3b5c";
      if (e.type === "spider") {
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + 0.4;
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(a) * e.r * 1.7, e.y + Math.sin(a) * e.r * 1.7);
        }
        ctx.strokeStyle = fill;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      } else if (e.type === "lich") {
        ctx.moveTo(e.x, e.y - e.r * 1.3);
        ctx.lineTo(e.x + e.r, e.y + e.r);
        ctx.lineTo(e.x - e.r, e.y + e.r);
        ctx.closePath();
      } else {
        ctx.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
      }
    } else {
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    }
    ctx.fill();
    noGlow();
    if (e.elite) {
      ctx.strokeStyle = "#fcee0a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // yeux
    ctx.fillStyle = "#07060c";
    ctx.fillRect(e.x - e.r * 0.45, e.y - e.r * 0.25, 3, 3);
    ctx.fillRect(e.x + e.r * 0.45 - 3, e.y - e.r * 0.25, 3, 3);
    // barre de vie (sauf boss : barre en haut)
    if (!e.boss && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
      ctx.fillStyle = "#ff3b5c";
      ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  function drawPlayer() {
    const p = state.player;
    const cls = state.cls;
    const blink = p.inv > 0 && Math.floor(state.time * 20) % 2 === 0;
    ctx.globalAlpha = p.ghost > 0 ? 0.35 : blink ? 0.45 : 1;
    ctx.fillStyle = cls.color;
    glow(cls.color, 14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    noGlow();
    // arme / direction
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.facing) * 4, p.y + Math.sin(p.facing) * 4);
    ctx.lineTo(p.x + Math.cos(p.facing) * (PLAYER_R + 6), p.y + Math.sin(p.facing) * (PLAYER_R + 6));
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (p.shield > 0) {
      ctx.strokeStyle = "#4dffd2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.crit100 > 0) {
      ctx.strokeStyle = "#fcee0a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFx() {
    for (const f of state.fx) {
      const k = Math.max(0, f.ttl / f.max);
      if (f.kind === "slash") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 6;
        glow(f.color, 12);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, f.angle - f.arc / 2, f.angle + f.arc / 2);
        ctx.stroke();
        noGlow();
      } else if (f.kind === "ring") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.2 - k * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === "blast") {
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.1 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === "num") {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = f.color;
        ctx.font = `bold ${f.crit ? 15 : 11}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y - (1 - k) * 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    drawRoom();
    // butin
    for (const pk of state.pickups) {
      if (pk.kind === "coin") {
        ctx.fillStyle = "#fcee0a";
        glow("#fcee0a", 8);
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#ff4d8d";
        glow("#ff4d8d", 8);
        ctx.fillRect(pk.x - 5, pk.y - 5, 10, 10);
      }
      noGlow();
    }
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();
    // tirs
    for (const s of state.shots) {
      ctx.fillStyle = s.color;
      glow(s.color, 10);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.bullets) {
      ctx.fillStyle = b.color;
      glow(b.color, 10);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();
    drawFx();
    // barre du boss
    if (state.boss && !state.boss.dead) {
      const b = state.boss;
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(W / 2 - 150, 42, 300, 10);
      ctx.fillStyle = "#ff2a6d";
      ctx.fillRect(W / 2 - 150, 42, 300 * Math.max(0, b.hp / b.maxHp), 10);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.name || "BOSS", W / 2, 38);
    }
    // bandeau d'étage
    if (state.banner) {
      ctx.globalAlpha = Math.min(1, state.banner.ttl);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      glow("#00f0ff", 14);
      ctx.fillText(state.banner.text, W / 2, H / 2 - 40);
      noGlow();
      ctx.globalAlpha = 1;
    }
    // joystick tactile
    if (stick) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.x0, stick.y0, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(stick.x1, stick.y1, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Interface ---------- */

  function setStatus(next) {
    status = next;
    stateEl.textContent = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Partie terminée" }[next];
  }

  function showOverlay(title, text, label) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = label;
    overlay.hidden = false;
  }

  function updateHud() {
    const p = state.player;
    const pct = Math.max(0, p.hp / state.stats.maxHp);
    hpBar.style.width = `${pct * 100}%`;
    hpText.textContent = `${Math.ceil(p.hp)} / ${Math.round(state.stats.maxHp)} PV${p.shield ? ` · bouclier ${p.shield}` : ""}`;
    floorEl.textContent = String(state.floor);
    roomEl.textContent = `${state.room}/${ROOMS_PER_FLOOR}`;
    killsEl.textContent = fmt(state.kills);
    coinsEl.textContent = fmt(state.coins);
    bestEl.textContent = String(wallet.data.bestDungeon);
    soulsEl.textContent = fmt(wallet.data.dungeon.souls);
    const sk = state.cls.skill;
    const ready = p.skillCd <= 0;
    skillButton.textContent = ready ? `${sk.name} (Espace)` : `${sk.name} : ${Math.ceil(p.skillCd)} s`;
    skillButton.disabled = status !== "running" || !ready;
    renderOwned();
  }

  let ownedKey = "";
  function renderOwned() {
    const key = JSON.stringify(state.owned);
    if (key === ownedKey) return;
    ownedKey = key;
    const entries = Object.entries(state.owned);
    ownedList.replaceChildren(...(entries.length
      ? entries.map(([id, n]) => h("li", { title: ITEMS[id].desc }, `${ITEMS[id].name} ×${n}`))
      : [h("li", { class: "sv-owned-empty" }, "Aucun objet (ouvre les coffres)")]));
  }

  function showChoices() {
    const has = !!state.choices && status === "running";
    if (!has) {
      shownChoices = null;
      choicePanel.hidden = true;
      return;
    }
    if (shownChoices === state.choices) return;
    shownChoices = state.choices;
    choiceList.replaceChildren(...state.choices.map((id, i) => {
      const d = describe(id);
      const owned = state.owned[id] || 0;
      return h("button", { class: "sv-choice", type: "button", onclick: () => pick(id) },
        h("span", { class: "sv-choice-key" }, String(i + 1)),
        h("strong", {}, d.name),
        h("span", {}, d.desc + (owned ? ` (niv. ${owned} → ${owned + 1})` : "")));
    }));
    choicePanel.hidden = false;
  }

  function pick(id) {
    if (chooseItem(state, id)) {
      showChoices();
      updateHud();
    }
  }

  /* ---------- Classes et forge ---------- */

  function renderMeta() {
    const d = wallet.data.dungeon;
    charBar.replaceChildren(...CLASSES.map((c) => {
      const unlocked = d.classes.includes(c.id);
      const label = unlocked ? c.name : `${c.name} · ${fmt(c.unlock)} âmes`;
      return h("button", {
        class: `map-button${classId === c.id ? " is-active" : ""}${unlocked ? "" : " is-locked"}`, type: "button", "data-class": c.id,
        title: `${c.desc} PV ${c.hp}.`,
        disabled: status === "running" || (!unlocked && d.souls < c.unlock),
        onclick: () => onClass(c.id)
      }, label);
    }));
    forge.replaceChildren(...META.map((m) => {
      const rank = d.ranks[m.id];
      const maxed = rank >= m.max;
      const cost = metaCost(m.id, rank);
      return h("button", {
        class: "dg-upgrade", type: "button", "data-meta": m.id, disabled: maxed || d.souls < cost, title: m.desc,
        onclick: () => { wallet.dungeonBuyRank(m.id); }
      }, h("strong", {}, m.name), h("span", {}, m.desc), h("em", {}, maxed ? "Max" : `${rank}/${m.max} · ${fmt(cost)} âmes`));
    }));
  }

  function onClass(id) {
    if (status === "running") return;
    if (!wallet.data.dungeon.classes.includes(id)) {
      if (!wallet.dungeonUnlock(id)) return;
    }
    classId = id;
    state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
    renderMeta();
    updateHud();
    draw();
  }

  /* ---------- Partie ---------- */

  function startGame() {
    scrollToPlay(root.querySelector(".sv-board-wrap"));
    state = createState(Math.random, { classId, ranks: wallet.data.dungeon.ranks });
    shownChoices = null;
    ownedKey = "";
    keys.clear();
    skillQueued = false;
    setStatus("running");
    overlay.hidden = true;
    renderMeta();
    showChoices();
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame() {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    draw();
    if (!state.choices) showOverlay("Pause", "P pour reprendre.", "Reprendre");
  }

  function resumeGame() {
    if (status !== "paused") return;
    setStatus("running");
    overlay.hidden = true;
    startLoop();
  }

  function finish() {
    stopLoop();
    setStatus("over");
    const rw = runRewards(state);
    // Valeurs figées avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const credits = rw.credits + wealthBonus(wallet.credits, dungeonPct(rw.floor));
    const record = wallet.setBest("bestDungeon", rw.floor);
    wallet.dungeonRun(rw.souls);
    if (credits > 0) wallet.addCredits(credits);
    if (rw.coins > 0) wallet.addBlue(rw.coins);
    showChoices();
    updateHud();
    draw();
    renderMeta();
    const gains = [`+${fmt(rw.souls)} âmes`, `+${fmt(credits)} crédits`, rw.coins ? `+${rw.coins} pièce${rw.coins > 1 ? "s" : ""} bleue${rw.coins > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
    showOverlay("Tombé au combat",
      `Étage ${rw.floor} · ${fmt(state.kills)} éliminés\n${gains}${record ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function currentInput() {
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1;
    if (keys.has("right")) dx += 1;
    if (keys.has("up")) dy -= 1;
    if (keys.has("down")) dy += 1;
    if (!dx && !dy) ({ dx, dy } = dragVec);
    const skill = skillQueued || keys.has("skill");
    return { dx, dy, skill };
  }

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.min(time - lastTime, 100) / 1000 : 0;
    lastTime = time;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 6 && status === "running") {
      acc -= STEP;
      steps += 1;
      const input = currentInput();
      const events = update(state, STEP, input);
      if (input.skill) skillQueued = false;
      if (events.roomCleared) stateEl.textContent = "Salle nettoyée — la porte est ouverte";
      if (events.advanced) stateEl.textContent = "En jeu";
      if (events.over) { finish(); return; }
    }
    if (steps === 6) acc = 0;
    showChoices();
    updateHud();
    draw();
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    lastTime = 0;
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- Clavier et doigt ---------- */

  const KEYMAP = {
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right",
    arrowup: "up", z: "up", w: "up",
    arrowdown: "down", s: "down"
  };

  document.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");

    if (state.choices && status === "running" && /^[1-4]$/.test(key)) {
      const id = state.choices[Number(key) - 1];
      if (id) pick(id);
      return;
    }
    if (key === "p" || key === "escape") {
      if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }
    if (key === "enter" && !onButton) {
      event.preventDefault();
      if (status === "paused") resumeGame();
      else if (status !== "running") startGame();
      return;
    }
    if ((key === " " || key === "shift" || key === "e") && status === "running") {
      event.preventDefault();
      keys.add("skill");
      return;
    }
    if (KEYMAP[key] && status === "running") {
      event.preventDefault();
      keys.add(KEYMAP[key]);
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "shift" || key === "e") keys.delete("skill");
    const dir = KEYMAP[key];
    if (dir) keys.delete(dir);
  });

  function toCanvas(event) {
    const rect = board.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  board.addEventListener("pointerdown", (event) => {
    if (status !== "running") return;
    drag = { x: event.clientX, y: event.clientY };
    const p0 = toCanvas(event);
    stick = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y };
    board.setPointerCapture?.(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const len = Math.hypot(dx, dy);
    const p1 = toCanvas(event);
    if (stick) {
      const k = Math.min(1, 40 / Math.max(1, Math.hypot(p1.x - stick.x0, p1.y - stick.y0)));
      stick.x1 = stick.x0 + (p1.x - stick.x0) * k;
      stick.y1 = stick.y0 + (p1.y - stick.y0) * k;
    }
    dragVec = len < 8 ? { dx: 0, dy: 0 } : { dx: dx / Math.max(len, 40), dy: dy / Math.max(len, 40) };
  });
  const endDrag = () => { drag = null; stick = null; dragVec = { dx: 0, dy: 0 }; };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  startButton.addEventListener("click", () => (status === "paused" ? resumeGame() : startGame()));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", () => keys.clear());

  // Le portefeuille notifie chaque seconde (revenu passif du Clicker) : on ne reconstruit la forge
  // que si les données du Donjon ont réellement changé.
  let lastMeta = JSON.stringify(wallet.data.dungeon);
  wallet.subscribe(() => {
    const now = JSON.stringify(wallet.data.dungeon);
    if (now === lastMeta) return;
    lastMeta = now;
    if (active) { renderMeta(); soulsEl.textContent = fmt(wallet.data.dungeon.souls); }
  });

  /* ---------- Démarrage ---------- */

  renderMeta();
  updateHud();
  draw();
  showOverlay("Donjon", "Descends le plus profond possible. Esquive, ouvre les coffres, bats les boss.", "Entrer");

  return {
    activate() {
      active = true;
      renderMeta();
      updateHud();
      draw();
    },
    deactivate() {
      active = false;
      keys.clear();
      if (status === "running") pauseGame();
    }
  };
}
