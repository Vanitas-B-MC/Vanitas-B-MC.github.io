// js/ui-td.js — affichage et commandes du Tower Defense « Pare-feu » (logique dans td.js).
// Débloquer une sorte de tour coûte des CRÉDITS (définitif). Poser et améliorer les tours
// coûte de l'ÉNERGIE, gagnée pendant la partie.

import {
  W, H, COLS, ROWS, CELL, TOWER_RADIUS, PATH_HALF, MAX_TIER, PATH_COUNT, MAPS, FREE_MAP, DIFFICULTIES, DEFAULT_DIFFICULTY, TOWER_DEFS, TOWER_IDS, ENEMY_DEFS,
  PATH_NAMES, ABILITIES, TARGET_LABELS,
  createState, placeIssue, placeTower, upgradeTower, upgradeInfo, sellTower, startWave, useAbility, cycleTargetMode, setAim, setAimMode,
  update, towerAt, towerStats, beaconBuff, describeFx, ownedUpgrades, invested, SELL_RATIO, START_LIVES, waveBonusGold, isBoss,
  paragonInfo, makeParagon, PARAGON_MAX_DEGREE, PARAGON_COMPLETE_BONUS, PARAGONS
} from "./td.js";
import { wealthBonus, wavePct } from "./rewards.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const STEP = 1 / 60;                       // pas de simulation (secondes)
const SPEEDS = [1, 2, 3, 5, 10];           // vitesses de jeu (×5 et ×10 pour les longues parties)
const MAX_STEPS = 40;                      // pas de simulation par image, au maximum
const PATH_COLORS = ["#00f0ff", "#ff6bd6", "#fcee0a"];
const SPIKE_COLORS = ["#9aa5b1", "#d6d6e6", "#7fd8ff", "#ff9f5a", "#ff2a6d", "#fcee0a"];

const REASONS = {
  gold: "Pas assez d'énergie.",
  bounds: "Trop près du bord du plateau.",
  path: "Trop près du chemin : les tours se posent à côté, pas dessus.",
  obstacle: "Un obstacle (arbre, étang) bloque cet endroit.",
  tower: "Trop près d'une autre tour.",
  locked: "Cette tour n'est pas encore débloquée.",
  max: "Ce chemin est déjà au palier maximum.",
  paths: "Une tour n'utilise que 2 chemins d'amélioration.",
  crossed: "Un seul chemin peut dépasser le palier 2.",
  idle: "Les capacités s'utilisent pendant une vague.",
  cd: "Capacité en recharge.",
  none: "Cette tour n'a pas de capacité (palier 4 du chemin 3).",
  have: "Ce type de tour a déjà un paragon.",
  notmax: "Il faut un chemin au palier 4 pour fusionner en paragon.",
  need: "Il faut 3 tours de ce type avec un chemin au palier 4."
};

// Chiffres clés d'une tour, affichés à côté de son nom dans la palette.
const num = (n, d = 1) => Number(n).toFixed(d).replace(".", ",").replace(/,0$/, "");
function towerBrief(def) {
  const st = towerStats(def, [0, 0, 0]);
  if (def.support) return `Aura ${num(st.range / CELL)} · +${Math.round(st.boostDamage * 100)} % dég. · +${Math.round(st.boostRate * 100)} % cad.`;
  if (def.income) return `+${st.income} énergie / vague`;
  if (def.line) return `Dég ${Math.round(st.damage)} · Portée ∞ · ${num(st.rate)}/s`;
  return `Dég ${Math.round(st.damage)} · Port ${num(st.range / CELL)} · ${num(st.rate)}/s`;
}

export function createTowerDefenseUI(root, wallet) {
  let active = false;
  let mapId = FREE_MAP;
  let diffId = DEFAULT_DIFFICULTY;
  let state = createState(wallet.data.towers, mapId, diffId);
  let status = "idle";           // idle | running | paused | over
  let placing = null;            // type de tour en cours de pose
  let selectedId = null;         // tour sélectionnée (pour améliorer ou vendre)
  let hover = null;              // point (en pixels) sous la souris
  let cursor = { x: W / 2, y: H / 2 };     // curseur clavier
  let aimPicking = false;        // le prochain clic définit le point visé du Dartling sélectionné
  let paragonSteps = 0;          // curseur d'investissement du paragon (nombre de pas)
  let showCursor = false;        // le curseur clavier ne s'affiche qu'après un appui sur une flèche
  let speed = 1;
  let rafId = 0;
  let lastTime = 0;
  let acc = 0;
  let toastTimer = 0;
  let panelSig = "";             // signature du panneau de la tour (on ne le reconstruit que s'il change)

  /* ---------- Squelette ---------- */

  const board = h("canvas", { id: "td-board", width: W, height: H, "aria-label": "Plateau du Tower Defense" });
  const toast = h("p", { class: "game-toast", id: "td-toast", "aria-live": "polite" });
  const overlayTitle = h("p", { class: "overlay-title" }, "Pare-feu");
  const overlayText = h("p", { class: "overlay-text" });
  const startButton = h("button", { class: "button button-primary", id: "td-start", type: "button" }, "Commencer");
  const overlay = h("div", { class: "game-overlay", id: "td-overlay" }, overlayTitle, overlayText, startButton);

  const goldEl = h("strong", { id: "td-gold" }, "0");
  const livesEl = h("strong", { id: "td-lives" }, "0");
  const waveEl = h("strong", { id: "td-wave-num" }, "0");
  const bestEl = h("strong", { id: "td-best" }, "0");
  const stateEl = h("p", { class: "game-state", id: "td-state", "aria-live": "polite" }, "Prêt");

  const waveButton = h("button", { class: "button button-primary", id: "td-wave", type: "button", onclick: () => launchWave() }, "Lancer la vague 1");
  const speedButton = h("button", { class: "button button-secondary", id: "td-speed", type: "button", title: "Vitesse du jeu (S)", onclick: () => toggleSpeed() }, "Vitesse ×1");

  const mapButtons = MAPS.map((m) => {
    const button = h("button", { class: "map-button", type: "button", "data-map": m.id, onclick: () => onMap(m.id) });
    return { m, button };
  });
  const mapBar = h("div", { class: "td-maps", role: "group", "aria-label": "Carte" }, mapButtons.map((x) => x.button));

  const diffButtons = DIFFICULTIES.map((d) => {
    const button = h("button", { class: "map-button", type: "button", "data-diff": d.id, title: d.desc, onclick: () => onDifficulty(d.id) }, d.name);
    return { d, button };
  });
  const diffBar = h("div", { class: "td-maps", role: "group", "aria-label": "Difficulté" }, diffButtons.map((x) => x.button));

  const palette = TOWER_IDS.map((id, index) => {
    const def = TOWER_DEFS[id];
    const main = h("span", { class: "tw-main" },
      h("strong", {}, `${index + 1}. ${def.name}`),
      h("span", { class: "tw-stats" }, towerBrief(def)));
    const cost = h("span", { class: "tw-cost" });
    // La description complète est dans l'infobulle ; les chiffres clés sont affichés à côté du nom.
    const button = h("button", { class: "tower-button", type: "button", "data-tower": id, title: def.desc, onclick: () => onPalette(id) }, main, cost);
    button.style.setProperty("--tw", def.color);
    return { id, def, cost, button };
  });

  const selTitle = h("strong", { class: "sel-title" });
  const selStats = h("span", { class: "sel-stats" });
  const selOwned = h("span", { class: "sel-owned" });
  const targetButton = h("button", { class: "button button-secondary", id: "td-target", type: "button", title: "Choisit quel ennemi la tour vise en priorité (T)", onclick: () => doTarget() });
  const abilityButton = h("button", { class: "button button-secondary", id: "td-ability", type: "button", onclick: () => doAbility() });
  const aimModeButton = h("button", { class: "button button-secondary", id: "td-aimmode", type: "button", title: "Point fixe : la tour tire toujours vers le même endroit. Souris : elle suit ton curseur sur le plateau (M)", onclick: () => doAimMode() });
  const aimPickButton = h("button", { class: "button button-secondary", id: "td-aimpick", type: "button", title: "Puis clique sur le plateau pour choisir le point visé (C)", onclick: () => doAimPick() });
  const aimRow = h("div", { class: "sel-buttons", hidden: true }, aimModeButton, aimPickButton);
  const selPaths = h("div", { class: "sel-paths" });
  const paragonBox = h("div", { class: "sel-paragon", hidden: true });
  let paragonConfirm = null;     // tour pour laquelle la fusion attend sa confirmation
  const sellButton = h("button", { class: "button button-secondary", id: "td-sell", type: "button", onclick: () => doSell() });
  const selection = h("div", { class: "td-selection chamfer", id: "td-selection", hidden: true },
    selTitle, selStats, selOwned,
    h("div", { class: "sel-buttons" }, targetButton, abilityButton),
    aimRow,
    selPaths,
    paragonBox,
    h("div", { class: "sel-buttons" }, sellButton));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      `Des ennemis suivent un ou plusieurs chemins : arrête-les avant la sortie (${START_LIVES} vies en Normal). Pose des tours où tu veux (ni sur le chemin, ni sur un obstacle) avec l'énergie gagnée en jeu, puis améliore-les : 3 chemins par tour, 2 au maximum, un seul au-delà du palier 2. Le palier 4 du 3e chemin donne une capacité active (son temps de recharge ne tourne que pendant les vagues). Trois tours d'un même type au palier 4 peuvent fusionner en un paragon. Un boss arrive toutes les 10 vagues. Débloque de nouvelles tours et cartes avec tes crédits.`),
    h("div", { class: "td-layout" },
      h("div", { class: "td-main" },
        mapBar,
        diffBar,
        h("div", { class: "td-board-wrap chamfer" },
          h("div", { class: "game-stage td-stage" }, board, toast, overlay)),
        h("div", { class: "td-actions" }, waveButton, speedButton, stateEl)),
      h("aside", { class: "td-side" },
        h("dl", { class: "td-stats" },
          stat("Énergie", goldEl), stat("Vies", livesEl), stat("Vague", waveEl), stat("Record", bestEl)),
        selection,
        h("h3", { class: "subhead" }, "Tours"),
        h("ul", { class: "tower-list" }, palette.map((p) => h("li", {}, p.button))),
        h("ul", { class: "game-help" },
          h("li", {}, "Clique une case pour poser, une tour pour la sélectionner"),
          h("li", {}, h("kbd", {}, "1"), "–", h("kbd", {}, "0"), " choisir · ", h("kbd", {}, "←↑↓→"), " curseur · ", h("kbd", {}, "Espace"), " poser"),
          h("li", {}, h("kbd", {}, "Entrée"), " vague · ", h("kbd", {}, "U"), " améliorer · ", h("kbd", {}, "T"), " ciblage · ", h("kbd", {}, "A"), " capacité"),
          h("li", {}, h("kbd", {}, "S"), " vitesse · ", h("kbd", {}, "G"), " paragon · ", h("kbd", {}, "V"), " vendre · ", h("kbd", {}, "P"), " pause"),
          h("li", {}, h("kbd", {}, "M"), " visée souris/point · ", h("kbd", {}, "C"), " choisir le point · ", h("kbd", {}, ", ."), " tour préc./suiv."))))
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

  const towerRangePx = (tower) => tower.st.range * beaconBuff(state, tower).range;
  const enemyRadius = (e) => (e.type === "boss3" ? 14 : isBoss(e) ? 13 : e.type === "tank" ? 10 : e.type === "runner" ? 6 : 8);

  function draw() {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, W, H);

    // Grille légère (simple repère)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, H); }
    for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(W, r * CELL + 0.5); }
    ctx.stroke();

    // Chemins (un ou plusieurs)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const lane of state.map.lanes) {
      ctx.beginPath();
      lane.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
      ctx.lineWidth = PATH_HALF * 2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    // Obstacles : on ne peut pas construire dessus
    for (const o of state.map.obstacles) {
      ctx.fillStyle = "rgba(61, 220, 132, 0.07)";
      ctx.strokeStyle = "rgba(61, 220, 132, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Pointes de la Spike Factory : l'aspect suit les améliorations du chemin « Pointes », la taille l'empilement
    for (const sp of state.spikes) {
      const n = 3 + Math.min(sp.look, 4);
      const r = 3.5 + sp.stack * 0.9 + Math.min(sp.look, 4) * 0.4;
      ctx.fillStyle = SPIKE_COLORS[sp.look] || SPIKE_COLORS[0];
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = sp.look >= 3 ? 7 : 0;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const ang = (i * Math.PI) / n - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        ctx.lineTo(sp.x + Math.cos(ang) * rad, sp.y + Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    const target = hover || (showCursor ? cursor : null);
    const selected = state.towers.find((t) => t.id === selectedId);

    // Visée des Dartling : un rayon pointillé jusqu'au bord du plateau, et le point visé
    for (const t of state.towers) {
      if (!t.aim) continue;
      const aim = t.aimMode === "mouse" && state.cursor ? state.cursor : t.aim;
      const len = Math.hypot(aim.x - t.x, aim.y - t.y);
      if (len < 2) continue;
      ctx.strokeStyle = TOWER_DEFS[t.type].color;
      ctx.globalAlpha = t.id === selectedId ? 0.6 : 0.22;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + ((aim.x - t.x) / len) * 1300, t.y + ((aim.y - t.y) / len) * 1300);
      ctx.stroke();
      ctx.setLineDash([]);
      if (t.aimMode !== "mouse") {
        ctx.beginPath();
        ctx.arc(t.aim.x, t.aim.y, 5, 0, Math.PI * 2);
        ctx.moveTo(t.aim.x - 8, t.aim.y);
        ctx.lineTo(t.aim.x + 8, t.aim.y);
        ctx.moveTo(t.aim.x, t.aim.y - 8);
        ctx.lineTo(t.aim.x, t.aim.y + 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Portée de la tour sélectionnée, ou fantôme de la tour en cours de pose
    if (selected) {
      const def = TOWER_DEFS[selected.type];
      if (def.range && !def.line) drawRange(selected.x, selected.y, towerRangePx(selected), def.color);
    } else if (placing && target) {
      const def = TOWER_DEFS[placing];
      const ok = !placeIssue(state, target.x, target.y) && state.gold >= def.cost;
      const color = ok ? def.color : "#ff3b5c";
      if (!def.line) drawRange(target.x, target.y, towerStats(def, [0, 0, 0]).range, color);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, TOWER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Tours
    for (const tower of state.towers) {
      const def = TOWER_DEFS[tower.type];
      const x = tower.x;
      const y = tower.y;
      const total = tower.tiers.reduce((a, b) => a + b, 0);
      const maxed = tower.tiers.some((t) => t >= MAX_TIER);
      if (def.support) {
        // Aura du Beacon : disque qui pulse doucement autour de la tour
        ctx.globalAlpha = (tower.fury > 0 ? 0.22 : 0.12) + 0.08 * Math.sin(state.time * 3);
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(x, y, tower.st.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#14141f";
      ctx.beginPath();
      ctx.arc(x, y, TOWER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tower.jam > 0 ? "#ff2a6d" : def.color;
      ctx.lineWidth = tower.id === selectedId ? 3 : 1.5;
      if (tower.jam > 0) ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tower.jam > 0 ? "#6b6b7a" : def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = tower.fury > 0 ? 16 : 8;
      const grow = Math.min(total, 6) * 0.45;
      ctx.beginPath();
      if (tower.paragon) {
        for (let i = 0; i < 16; i++) {
          const ang = (i * Math.PI) / 8 - Math.PI / 2;
          const rad = i % 2 === 0 ? 10 : 4.5;
          ctx.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
        }
        ctx.closePath();
      }
      else if (def.income) ctx.rect(x - 5 - grow, y - 5 - grow, 10 + grow * 2, 10 + grow * 2);
      else if (def.support) { ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath(); }
      else if (def.spikes) { ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 7, y); ctx.closePath(); }
      else ctx.arc(x, y, 5 + grow, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Paliers : une rangée de petits carrés par chemin, de la couleur du chemin
      for (let p = 0; p < PATH_COUNT; p++) {
        ctx.fillStyle = PATH_COLORS[p];
        for (let i = 0; i < tower.tiers[p]; i++) ctx.fillRect(x - 16 + p * 11 + i * 2.5, y + TOWER_RADIUS + 3, 2, 4);
      }
      if (maxed && !tower.paragon) { ctx.strokeStyle = "#fcee0a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, TOWER_RADIUS + 2.5, 0, Math.PI * 2); ctx.stroke(); }
      if (tower.paragon) {
        // Paragon : anneau doré qui tourne et degré
        ctx.strokeStyle = "#fcee0a";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -state.time * 18;
        ctx.beginPath();
        ctx.arc(x, y, TOWER_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.fillStyle = "#fcee0a";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`★${tower.st.degree}`, x, y - TOWER_RADIUS - 7);
        ctx.textAlign = "start";
      }
      // Capacité : pastille verte quand elle est prête
      if (tower.st.ability) {
        const ready = tower.abilityCd <= 0 && state.phase === "wave";
        ctx.fillStyle = ready ? "#3ddc84" : tower.abilityCd > 0 ? "#6b6b7a" : "#9aa5b1";
        ctx.beginPath();
        ctx.arc(x + TOWER_RADIUS - 1, y - TOWER_RADIUS + 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ennemis
    for (const e of state.enemies) {
      const def = ENEMY_DEFS[e.type];
      const r = enemyRadius(e);
      ctx.fillStyle = e.stun > 0 ? "#fcee0a" : e.slow > 0 ? "#7fd8ff" : def.color;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isBoss(e)) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.stunImmune > 0) {
        // Immunisé à l'étourdissement : fin anneau gris
        ctx.strokeStyle = "rgba(200, 200, 220, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      const barW = isBoss(e) ? 36 : 24;
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(e.x - barW / 2, e.y - r - 7, barW, 4);
      ctx.fillStyle = ratio > 0.5 ? "#3ddc84" : ratio > 0.25 ? "#fcee0a" : "#ff3b5c";
      ctx.fillRect(e.x - barW / 2, e.y - r - 7, barW * ratio, 4);
      if (isBoss(e)) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(def.name, e.x, e.y - r - 11);
        ctx.textAlign = "start";
      }
    }

    // Boomerangs en vol
    for (const pr of state.projs) {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.theta * 5);
      ctx.strokeStyle = pr.color;
      ctx.shadowColor = pr.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-8, -3);
      ctx.quadraticCurveTo(0, 6, 8, -3);
      ctx.stroke();
      ctx.restore();
    }

    // Tirs et explosions
    for (const f of state.fx) {
      const k = Math.max(0, f.ttl / f.max);
      ctx.globalAlpha = k;
      if (f.kind === "beam") {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.w || 2;
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
      } else {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.2 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Repère du curseur clavier, ou du point visé en cours de choix
    const mark = aimPicking && hover ? hover : showCursor ? cursor : null;
    if (mark) {
      ctx.strokeStyle = aimPicking ? "#fcee0a" : "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mark.x - 9, mark.y);
      ctx.lineTo(mark.x + 9, mark.y);
      ctx.moveTo(mark.x, mark.y - 9);
      ctx.lineTo(mark.x, mark.y + 9);
      ctx.stroke();
    }
  }

  function drawRange(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------- Affichage des chiffres ---------- */

  const cache = new Map();
  function setText(el, value) {
    const text = String(value);
    if (cache.get(el) === text) return;
    cache.set(el, text);
    el.textContent = text;
  }

  const STATUS_LABELS = { idle: "Prêt", running: "En jeu", paused: "Pause", over: "Terminé" };

  function setStatus(next) {
    status = next;
    setText(stateEl, STATUS_LABELS[next]);
  }

  function say(text) {
    toast.textContent = text;
    toast.classList.remove("is-on");
    if (prefersReducedMotion()) {
      toast.style.opacity = "1";
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.style.opacity = ""; }, 1600);
      return;
    }
    void toast.offsetWidth;
    toast.classList.add("is-on");
  }

  const bestWave = () => Math.max(wallet.data.bestWave, state.diff.record ? clearedWaves() : 0);
  // Vagues repoussées : la vague en cours (ou celle qui a fait perdre) ne compte pas.
  const clearedWaves = () => Math.max(0, state.wave - (state.phase === "idle" ? 0 : 1));

  // Panneau de la tour sélectionnée : les 3 chemins d'amélioration. Reconstruit seulement quand il change.
  function renderPaths(tower, def) {
    selPaths.replaceChildren(...Array.from({ length: PATH_COUNT }, (_, p) => {
      const tier = tower.tiers[p];
      const info = upgradeInfo(state, tower, p);
      const pips = h("span", { class: "path-pips", "aria-label": `Palier ${tier} sur ${MAX_TIER}` },
        Array.from({ length: MAX_TIER }, (_, i) => h("span", { class: i < tier ? "is-on" : "" })));
      pips.style.setProperty("--pc", PATH_COLORS[p]);
      let button;
      if (info.locked === "max") {
        button = h("button", { class: "path-btn is-max", type: "button", disabled: true }, h("span", { class: "pb-name" }, "Palier maximum"));
      } else {
        const detail = describeFx(info.up.fx);
        const lockText = info.locked ? REASONS[info.locked] : null;
        button = h("button", {
          class: `path-btn${info.locked ? " is-locked" : ""}`, type: "button", title: `${info.up.name} — ${detail}`,
          disabled: !!info.locked || !info.affordable || state.phase === "over", onclick: () => doUpgrade(p)
        },
        h("span", { class: "pb-name" }, `${tier + 1}. ${info.up.name}`),
        h("span", { class: "pb-desc" }, lockText || detail),
        info.locked ? null : h("span", { class: "pb-cost" }, `${fmt(info.price)} ⚡`));
      }
      const row = h("div", { class: "path-row" }, h("span", { class: "path-name" }, PATH_NAMES[def.id][p]), pips, button);
      row.style.setProperty("--pc", PATH_COLORS[p]);
      return row;
    }));
  }

  // Bloc « Paragon » : progression vers la fusion, curseur d'investissement (seulement au moment de la fusion) ou degré du paragon.
  function renderParagon(tower, def, info) {
    paragonBox.replaceChildren();
    if (info.is) {
      paragonBox.append(
        h("strong", { class: "sel-paragon-title" }, `★ ${PARAGONS[tower.type].name} — degré ${info.degree}/${PARAGON_MAX_DEGREE}`),
        h("p", {}, `${PARAGONS[tower.type].desc} ${tower.kills} éliminations. Sa capacité recharge deux fois plus vite. Le degré monte encore avec les éliminations (jusqu'à +10), mais on ne peut plus investir d'énergie.`));
      return;
    }
    const spec = PARAGONS[tower.type];
    const marks = info.covered.map((c, i) => `${PATH_NAMES[def.id][i]} ${c ? "✓" : "✗"}`).join(" · ");
    const lines = [
      h("strong", { class: "sel-paragon-title" }, `★ Paragon : ${spec.name}`),
      h("p", {}, `${spec.desc} Une tour à part, pas la somme des chemins.`),
      h("p", {}, `Fusionne 3 tours « ${def.name} » au palier max (prêtes : ${info.ready}/${info.need}). Chemins couverts : ${marks}. ${info.complete ? `Fusion complète : +${PARAGON_COMPLETE_BONUS} degrés.` : `Une tour par chemin donne +${PARAGON_COMPLETE_BONUS} degrés ; trois tours du même chemin marchent aussi.`}`),
      h("p", {}, `Prix (selon la puissance) : ${fmt(info.cost)} ⚡. Une seule par type.`)
    ];
    const maxSteps = Math.max(0, Math.min(info.maxSteps, Math.floor((state.gold - info.cost) / info.step)));
    paragonSteps = Math.min(paragonSteps, maxSteps);
    const blocked = !!info.reason && info.reason !== "gold";
    const label = h("span", { class: "pg-label" });
    const button = h("button", { class: "button button-primary", type: "button", disabled: !!info.reason, onclick: () => doParagon(), title: blocked ? REASONS[info.reason] : "Sacrifie les 2 autres tours prêtes (les plus investies)" });
    const refresh = () => {
      const extra = paragonSteps * info.step;
      const degree = Math.min(PARAGON_MAX_DEGREE, info.base + paragonSteps);
      label.textContent = `Investissement en plus : ${fmt(extra)} ⚡ → degré ${degree}/${PARAGON_MAX_DEGREE}`;
      const total = info.cost + extra;
      button.textContent = paragonConfirm === tower.id && !info.reason
        ? `Confirmer : sacrifier 2 tours (−${fmt(total)} ⚡)`
        : info.reason === "gold" ? `Énergie insuffisante (${fmt(total)} ⚡)` : `Fusionner (${fmt(total)} ⚡) · G`;
    };
    if (info.maxSteps > 0 && !blocked) {
      const slider = h("input", { class: "pg-slider", type: "range", min: 0, max: Math.max(0, maxSteps), step: 1, value: paragonSteps, "aria-label": "Énergie investie en plus pour monter le degré du paragon" });
      slider.disabled = maxSteps === 0;
      slider.addEventListener("input", () => { paragonSteps = Number(slider.value); paragonConfirm = null; refresh(); });
      lines.push(label, slider, h("p", { class: "pg-note" }, "Possible uniquement maintenant : une fois fusionné, le degré ne se paie plus."));
    }
    refresh();
    lines.push(button);
    paragonBox.append(...lines);
  }

  function updateHud() {
    setText(goldEl, fmt(state.gold));
    setText(livesEl, fmt(state.lives));
    setText(waveEl, fmt(state.wave));
    setText(bestEl, fmt(bestWave()));

    const inWave = state.phase === "wave";
    waveButton.disabled = status !== "running" || inWave || state.phase === "over";
    setText(waveButton, inWave ? `Vague ${state.wave} en cours…` : `Lancer la vague ${state.wave + 1}`);
    setText(speedButton, `Vitesse ×${speed}`);

    for (const { m, button } of mapButtons) {
      const owned = wallet.data.maps.includes(m.id);
      setText(button, owned ? `${m.name}${m.reward > 1 ? ` (×${m.reward} ¤)` : ""}` : `${m.name} · débloquer ${fmt(m.unlock)} ¤`);
      button.title = m.desc;
      button.classList.toggle("is-active", owned && mapId === m.id);
      button.classList.toggle("is-locked", !owned);
      button.setAttribute("aria-pressed", String(owned && mapId === m.id));
      button.disabled = status === "running" || status === "paused" || (!owned && wallet.credits < m.unlock);
    }

    for (const { d, button } of diffButtons) {
      button.classList.toggle("is-active", diffId === d.id);
      button.setAttribute("aria-pressed", String(diffId === d.id));
      button.disabled = status === "running" || status === "paused";
    }

    for (const { id, def, cost, button } of palette) {
      const unlocked = state.unlocked.includes(id);
      button.classList.toggle("is-locked", !unlocked);
      button.classList.toggle("is-active", placing === id);
      button.setAttribute("aria-pressed", placing === id ? "true" : "false");
      if (unlocked) {
        setText(cost, `${fmt(def.cost)} ⚡`);
        button.disabled = false;
      } else {
        setText(cost, `🔒 ${fmt(def.unlock)} ¤`);
        button.disabled = wallet.credits < def.unlock;
      }
    }

    const tower = state.towers.find((t) => t.id === selectedId);
    selection.hidden = !tower;
    if (!tower) { panelSig = ""; return; }

    const def = TOWER_DEFS[tower.type];
    const ts = tower.st;
    const total = tower.tiers.reduce((a, b) => a + b, 0);
    setText(selTitle, tower.paragon ? `★ ${PARAGONS[tower.type].name}` : `${def.name} — ${tower.tiers.join(" · ")}`);
    const pct = (v) => `+${Math.round(v * 100)} %`;
    const buffed = beaconBuff(state, tower);
    setText(selStats, def.support
      ? `Aura ${num(ts.range / CELL)} cases · dégâts ${pct(ts.boostDamage)} · cadence ${pct(ts.boostRate)}`
      : def.line
        ? `Dégâts ${Math.round(ts.damage * buffed.damage)} · portée infinie · ${num(ts.rate * buffed.rate)} tirs/s · transperce ${ts.pierceN >= 50 ? "toute la ligne" : `${ts.pierceN} ennemis`}${ts.targets > 1 ? ` · ${ts.targets} rayons` : ""}`
      : def.spikes
        ? `Pointes : ${Math.round(ts.damage * buffed.damage)} dégâts × ${ts.pierceN} passages · ${ts.batch} tas toutes les ${num(1 / (ts.rate * buffed.rate))} s · portée ${num((ts.range * buffed.range) / CELL)} cases`
      : def.income
        ? `Produit ${fmt(Math.round(ts.income))} énergie${ts.interest ? ` + ${num(ts.interest * 100)} % d'intérêts` : ""} à la fin de chaque vague`
        : `Dégâts ${Math.round(ts.damage * buffed.damage)} · portée ${num((ts.range * buffed.range) / CELL)} cases · ${num(ts.rate * buffed.rate)} tirs/s${ts.targets > 1 ? ` · ${ts.targets} cibles` : ""}`);
    setText(selOwned, tower.paragon ? `Paragon ${def.name} : ${PARAGONS[tower.type].desc}` : total ? ownedUpgrades(tower).map((u) => u.name).join(" · ") : "Aucune amélioration : choisis un chemin ci-dessous.");

    const shoots = !def.support && !def.income && !def.spikes && !def.line;
    targetButton.hidden = !shoots;
    aimRow.hidden = !tower.aim;
    if (tower.aim) {
      setText(aimModeButton, `Visée : ${tower.aimMode === "mouse" ? "souris" : "point fixe"} (M)`);
      setText(aimPickButton, aimPicking ? "Clique sur le plateau…" : "Choisir le point (C)");
      aimPickButton.disabled = tower.aimMode === "mouse";
    }
    if (shoots) setText(targetButton, `Ciblage : ${TARGET_LABELS[tower.target]} (T)`);

    const ab = tower.st.ability ? ABILITIES[tower.st.ability] : null;
    abilityButton.hidden = !ab;
    if (ab) {
      const wait = tower.abilityCd > 0;
      abilityButton.disabled = wait || state.phase !== "wave" || status !== "running";
      abilityButton.title = ab.desc;
      setText(abilityButton, wait ? `${ab.name} : ${Math.ceil(tower.abilityCd)} s${state.phase === "wave" ? "" : " ⏸"}` : `${ab.name} (A)`);
      abilityButton.title = wait && state.phase !== "wave" ? `${ab.desc} (la recharge est en pause entre les vagues)` : ab.desc;
    }

    const affordBits = Array.from({ length: PATH_COUNT }, (_, p) => { const i = upgradeInfo(state, tower, p); return i.locked || (i.affordable ? 1 : 0); }).join("");
    const pinfo = paragonInfo(state, tower);
    const showParagon = pinfo.is || tower.tiers.some((t) => t >= MAX_TIER) || pinfo.reason === "have";
    const sig = `${tower.id}|${tower.tiers}|${affordBits}|${state.phase}|${pinfo.is ? pinfo.degree + "/" + Math.floor(tower.kills / 10) : `${pinfo.reason}${pinfo.ready}`}|${paragonConfirm === tower.id}`;
    if (sig !== panelSig) {
      panelSig = sig;
      selPaths.hidden = pinfo.is;
      if (!pinfo.is) renderPaths(tower, def);
      paragonBox.hidden = !showParagon;
      if (showParagon) renderParagon(tower, def, pinfo);
    }

    setText(sellButton, `Vendre (+${fmt(Math.floor(invested(tower) * SELL_RATIO))})`);
    sellButton.disabled = state.phase === "over";
  }

  function showOverlay(title, text, buttonLabel, takeFocus = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonLabel;
    overlay.hidden = false;
    if (takeFocus) startButton.focus({ preventScroll: true });
  }

  /* ---------- Actions ---------- */

  function syncUnlocked() {
    for (const id of wallet.data.towers) if (!state.unlocked.includes(id)) state.unlocked.push(id);
  }

  function resetState() {
    state = createState(wallet.data.towers, mapId, diffId);
    placing = null;
    selectedId = null;
    panelSig = "";
  }

  // Choix de la carte : seulement entre deux parties. Une carte verrouillée se débloque avec des crédits.
  function onMap(id) {
    if (status === "running" || status === "paused") return;
    const m = MAPS.find((x) => x.id === id);
    if (!wallet.data.maps.includes(id)) {
      const price = m.unlock;                       // figé avant l'achat (le solde change pendant l'achat)
      if (!wallet.unlockMap(id, price)) { say(`Il faut ${fmt(price)} crédits pour débloquer cette carte.`); return; }
      say(`Carte ${m.name} débloquée !`);
    }
    mapId = id;
    resetState();
    if (status === "over") { setStatus("idle"); showOverlay("Pare-feu", `Carte ${m.name} : ${m.desc}`, "Commencer", false); }
    updateHud();
    draw();
  }

  // Choix de la difficulté : seulement entre deux parties.
  function onDifficulty(id) {
    if (status === "running" || status === "paused") return;
    diffId = id;
    resetState();
    const d = state.diff;
    if (status === "over") setStatus("idle");
    showOverlay("Pare-feu", `Difficulté ${d.name} : ${d.desc}`, "Commencer", false);
    updateHud();
    draw();
  }

  function onPalette(id) {
    if (!state.unlocked.includes(id)) {
      // Débloquer : on fige le prix avant de payer (le solde change pendant l'achat).
      const price = TOWER_DEFS[id].unlock;
      if (wallet.unlockTower(id, price)) {
        syncUnlocked();
        say(`${TOWER_DEFS[id].name} débloquée !`);
      } else {
        say(`Il faut ${fmt(price)} crédits pour débloquer cette tour.`);
      }
    } else {
      placing = placing === id ? null : id;
      selectedId = null;
    }
    updateHud();
    draw();
  }

  function tryPlace(x, y) {
    const existing = towerAt(state, x, y);
    if (existing) {
      if (selectedId !== existing.id) { paragonConfirm = null; aimPicking = false; }
      selectedId = existing.id;
      placing = null;
    } else if (placing) {
      const result = placeTower(state, placing, x, y);
      if (!result.ok) say(REASONS[result.reason] || "Impossible.");
      else if (result.tower.aim) {
        // Dartling : on le sélectionne tout de suite pour régler sa visée.
        selectedId = result.tower.id;
        placing = null;
        say("Dartling posé : choisis son point visé (clic sur « Choisir le point ») ou passe en visée souris (M).");
      }
    } else {
      selectedId = null;
      aimPicking = false;
    }
    updateHud();
    draw();
  }

  function doAimMode() {
    const tower = state.towers.find((t) => t.id === selectedId);
    if (!tower || !tower.aim) return;
    aimPicking = false;
    const mode = tower.aimMode === "mouse" ? "point" : "mouse";
    setAimMode(state, tower.id, mode);
    say(mode === "mouse" ? "Visée à la souris : la tour suit ton curseur sur le plateau." : "Visée à point fixe.");
    updateHud();
    draw();
  }

  function doAimPick() {
    const tower = state.towers.find((t) => t.id === selectedId);
    if (!tower || !tower.aim) return;
    if (tower.aimMode === "mouse") setAimMode(state, tower.id, "point");
    aimPicking = !aimPicking;
    if (aimPicking) say("Clique sur le plateau pour choisir le point visé.");
    updateHud();
    draw();
  }

  function doUpgrade(path) {
    if (selectedId === null) return;
    const result = upgradeTower(state, selectedId, path);
    if (!result.ok) say(REASONS[result.reason] || "Impossible.");
    else {
      const ab = result.tower.st.ability;
      if (ab && result.tower.tiers[path] === MAX_TIER) say(`Capacité débloquée : ${ABILITIES[ab].name} — ${ABILITIES[ab].desc}`);
    }
    updateHud();
    draw();
  }

  // Raccourci U : améliore le chemin le plus avancé de la tour (ou le premier chemin si elle est neuve).
  function doUpgradeMain() {
    const tower = state.towers.find((t) => t.id === selectedId);
    if (!tower) return;
    const order = [0, 1, 2].sort((a, b) => tower.tiers[b] - tower.tiers[a] || a - b);
    const path = order.find((p) => !upgradeInfo(state, tower, p).locked);
    if (path === undefined) { say(REASONS.max); return; }
    doUpgrade(path);
  }

  function doTarget() {
    if (selectedId === null) return;
    const mode = cycleTargetMode(state, selectedId);
    if (mode) say(`Ciblage : ${TARGET_LABELS[mode]}`);
    updateHud();
  }

  function doAbility() {
    if (selectedId === null || status !== "running") return;
    const result = useAbility(state, selectedId);
    if (result.ok) say(`${result.name} !`);
    else say(REASONS[result.reason] || "Impossible.");
    updateHud();
    draw();
  }

  function doParagon() {
    const tower = state.towers.find((t) => t.id === selectedId);
    if (!tower) return;
    const info = paragonInfo(state, tower);
    if (info.is) return;
    if (info.reason) { say(REASONS[info.reason] || "Pas assez d'énergie."); return; }
    if (paragonConfirm !== tower.id) {
      paragonConfirm = tower.id;
      say("Confirme pour fusionner : 2 autres tours seront sacrifiées.");
      panelSig = "";
      updateHud();
      return;
    }
    paragonConfirm = null;
    const steps = Math.max(0, Math.min(paragonSteps, info.maxSteps, Math.floor((state.gold - info.cost) / info.step)));
    const result = makeParagon(state, tower.id, steps);
    if (result.ok) say(`PARAGON ! ${TOWER_DEFS[tower.type].name} — degré ${result.tower.st.degree}`);
    else say(REASONS[result.reason] || "Impossible.");
    paragonSteps = 0;
    panelSig = "";
    updateHud();
    draw();
  }

  function stepPalette(delta) {
    const unlocked = TOWER_IDS.filter((id) => state.unlocked.includes(id));
    if (!unlocked.length) return;
    const at = unlocked.indexOf(placing);
    onPalette(unlocked[(at < 0 ? (delta > 0 ? 0 : unlocked.length - 1) : (at + delta + unlocked.length) % unlocked.length)]);
  }

  function doSell() {
    if (selectedId === null) return;
    const result = sellTower(state, selectedId);
    if (result.ok) {
      say(`Tour vendue : +${fmt(result.refund)} énergie.`);
      selectedId = null;
    }
    updateHud();
    draw();
  }

  function launchWave() {
    if (status !== "running" || !startWave(state)) return;
    const boss = state.spawnList.find((e) => ENEMY_DEFS[e.type].boss);
    if (boss) say(`BOSS : ${ENEMY_DEFS[boss.type].name} — ${ENEMY_DEFS[boss.type].power}`);
    updateHud();
  }

  function toggleSpeed() {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    updateHud();
  }

  function startGame() {
    scrollToPlay(root.querySelector(".td-board-wrap"));
    resetState();
    placing = state.unlocked.includes("laser") ? "laser" : null;
    setStatus("running");
    overlay.hidden = true;
    updateHud();
    draw();
    startLoop();
  }

  function pauseGame(showScreen = true) {
    if (status !== "running") return;
    stopLoop();
    setStatus("paused");
    updateHud();
    draw();
    if (showScreen) showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
  }

  function resumeGame() {
    if (status !== "paused") return;
    setStatus("running");
    overlay.hidden = true;
    updateHud();
    startLoop();
  }

  function finish() {
    stopLoop();
    setStatus("over");
    const reached = clearedWaves();
    // Le mode Facile ne bat pas le record (sinon il suffirait de le choisir pour gagner des vagues).
    const record = state.diff.record ? wallet.setBest("bestWave", reached) : false;
    updateHud();
    draw();
    const credits = state.creditsEarned ? ` · +${fmt(state.creditsEarned)} crédits` : "";
    showOverlay("Réseau compromis",
      `${fmt(reached)} vague${reached > 1 ? "s" : ""} repoussée${reached > 1 ? "s" : ""}${credits}${record && reached > 0 ? " — nouveau record !" : ""}`,
      "Rejouer");
  }

  function primaryAction() {
    if (status === "paused") resumeGame();
    else startGame();
  }

  /* ---------- Boucle ---------- */

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.min(time - lastTime, 100) / 1000 : 0;   // plafonné : pas de rafale après un ralentissement
    lastTime = time;
    acc += dt * speed;

    // À ×5 et ×10 on enchaîne beaucoup de pas par image : on s'arrête si l'image prend trop de temps.
    const t0 = performance.now();
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS && status === "running") {
      acc -= STEP;
      steps += 1;
      const events = update(state, STEP);

      if (events.credits > 0) {
        // Crédits de base + pourcentage de la fortune actuelle (le coefficient de la difficulté s'applique aux deux).
        const total = events.credits + wealthBonus(wallet.credits, wavePct(state.map.reward * state.diff.reward));
        state.creditsEarned += total - events.credits;
        wallet.addCredits(total);
        say(`Vague ${state.wave} repoussée : +${fmt(total)} crédits, +${fmt(waveBonusGold(state.wave) + (events.mined || 0))} énergie${events.mined ? ` (dont ${fmt(events.mined)} minés)` : ""}.`);
      }
      if (events.over) { finish(); return; }
      if (steps % 8 === 0 && performance.now() - t0 > 14) break;
    }
    if (acc >= STEP) acc = 0;     // retard trop grand : on l'abandonne plutôt que d'accélérer ensuite

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

  /* ---------- Souris, doigt, clavier ---------- */

  function pointFromEvent(event) {
    const rect = board.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  board.addEventListener("pointermove", (event) => {
    hover = pointFromEvent(event);
    state.cursor = hover;                   // le Dartling en visée souris suit ce point
    showCursor = false;
    if (status !== "running") draw();
  });
  board.addEventListener("pointerleave", () => { hover = null; if (status !== "running") draw(); });
  board.addEventListener("pointerdown", (event) => {
    if (status !== "running") return;
    const point = pointFromEvent(event);
    hover = point;
    state.cursor = point;
    if (aimPicking && selectedId !== null) {
      setAim(state, selectedId, point.x, point.y);
      aimPicking = false;
      say("Point visé défini.");
      updateHud();
      draw();
      return;
    }
    tryPlace(point.x, point.y);
  });

  startButton.addEventListener("click", primaryAction);

  document.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");

    if (key === "p" || key === "escape") {
      if (key === "escape" && status === "running" && (placing || selectedId !== null || aimPicking)) {
        aimPicking = false;
        placing = null;
        selectedId = null;
        updateHud();
        draw();
      } else if (status === "running") pauseGame();
      else if (status === "paused") resumeGame();
      return;
    }

    if (key === "enter") {
      if (onButton) return;
      event.preventDefault();
      if (status === "running") launchWave();
      else primaryAction();
      return;
    }

    if (status !== "running") return;

    const moves = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (moves[key]) {
      event.preventDefault();
      showCursor = true;
      hover = null;
      cursor = {
        x: Math.min(W - 1, Math.max(1, cursor.x + moves[key][0] * 12)),
        y: Math.min(H - 1, Math.max(1, cursor.y + moves[key][1] * 12))
      };
      draw();
      return;
    }

    if (/^[0-9]$/.test(key)) {
      const id = TOWER_IDS[(key === "0" ? 10 : Number(key)) - 1];
      if (id) onPalette(id);
      return;
    }
    if (key === " " && !onButton) {
      event.preventDefault();
      tryPlace(cursor.x, cursor.y);
      showCursor = true;
      return;
    }
    if (key === "u") doUpgradeMain();
    if (key === "g") doParagon();
    if (key === "m") doAimMode();
    if (key === "c") doAimPick();
    if (key === "," ) stepPalette(-1);
    if (key === ".") stepPalette(1);
    if (key === "t") doTarget();
    if (key === "a") doAbility();
    if (key === "s") toggleSpeed();
    if (key === "v" || key === "delete") doSell();
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  wallet.subscribe(() => { if (active) { syncUnlocked(); updateHud(); } });

  /* ---------- Démarrage ---------- */

  updateHud();
  draw();
  showOverlay("Pare-feu",
    "Pose des tours sur le plateau, puis lance les vagues. Les crédits servent à débloquer de nouvelles tours.",
    "Commencer", false);

  return {
    activate() {
      active = true;
      syncUnlocked();
      updateHud();
      draw();
      if (status === "paused") showOverlay("Pause", "La partie est en attente. P pour reprendre.", "Reprendre", false);
    },
    deactivate() { active = false; pauseGame(false); }
  };
}
