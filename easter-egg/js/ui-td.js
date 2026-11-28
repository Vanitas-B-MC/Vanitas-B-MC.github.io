// js/ui-td.js — affichage et commandes du Tower Defense « Pare-feu » (logique dans td.js).
// Débloquer une sorte de tour coûte des CRÉDITS (définitif). Poser et améliorer les tours
// coûte de l'ÉNERGIE, gagnée pendant la partie.

import {
  W, H, COLS, ROWS, CELL, PATH_HALF, MAX_TIER, PATH_COUNT, MAPS, FREE_MAP, DIFFICULTIES, DEFAULT_DIFFICULTY, TOWER_DEFS, TOWER_IDS, ENEMY_DEFS,
  PATH_NAMES, ABILITIES, TARGET_LABELS,
  createState, placeIssue, placeTower, upgradeTower, upgradeInfo, sellTower, startWave, useAbility, cycleTargetMode, setAim, setAimMode,
  update, towerAt, towerStats, beaconBuff, describeFx, ownedUpgrades, invested, SELL_RATIO, START_LIVES, waveBonusGold, isBoss,
  paragonInfo, makeParagon, addTotem, PARAGON_MAX_DEGREE, TOTEM_POWER, POWER_CAPS, PARAGONS, SPIKE_SPOT, LINE_WIDTH,
  towerRadius, snapPlacement, degreeFromPower as degreeOf, powerForDegree as powerFor, POWERS, usePower, powerCost, dronePos,
  HERO_DEFS, HERO_IDS, FREE_HERO, HERO_ABILITY_LEVELS, HERO_MAX_LEVEL, xpForLevel, heroTower, useHeroAbility, pointAt,
  CHALLENGES, CHALLENGE_IDS, challengeReward, wavePreview, sellValue, sellRatio, snapshot, restoreState, TD_ACHIEVEMENTS, newAchievements
} from "./td.js";
import { drawTower, towerIcon, drawDrone, drawEnemy } from "./td-art.js";
import { drawFx } from "./td-fx.js";
import { wealthBonus, wavePct } from "./rewards.js";
import { h, fmt, prefersReducedMotion } from "./ui.js";

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
  maxdeg: "Ce paragon est déjà au degré 100.",
  need: "Il faut une tour de ce type au palier 4 sur chacun des 3 chemins.",
  nosell: "Défi « Sans vente » : impossible de revendre.",
  hero: "Ton héros est déjà sur le plateau (un seul héros par partie).",
  heroUp: "Un héros ne s'améliore pas : il gagne des niveaux en combattant.",
  level: "Capacité pas encore débloquée."
};

// Chiffres clés d'une tour, affichés à côté de son nom dans la palette.
const num = (n, d = 1) => Number(n).toFixed(d).replace(".", ",").replace(/,0$/, "");
function towerBrief(def) {
  const st = towerStats(def, [0, 0, 0]);
  if (def.support) return `Aura ${num(st.range / CELL)} · +${Math.round(st.boostDamage * 100)} % dég. · +${Math.round(st.boostRate * 100)} % cad.`;
  if (def.income) return `+${st.income} énergie / vague`;
  if (def.line) return `Dég ${Math.round(st.damage)} · Portée ∞ · ${num(st.rate)}/s`;
  if (def.spikes) return `Dég ${Math.round(st.damage)} · Port ${num(st.range / CELL)} · ${num(st.rate)} tas/s`;
  return `Dég ${Math.round(st.damage)} · Port ${num(st.range / CELL)} · ${num(st.rate)}/s`;
}

export function createTowerDefenseUI(root, wallet) {
  let active = false;
  let rulesEl = null;
  function closeRules(remember) {
    if (!rulesEl) return;
    rulesEl.open = false;
    if (remember) try { localStorage.setItem("mc-td-rules-read", "1"); } catch { /* pas grave */ }
  }
  const SAVE_KEY = "mc-td-save";
  let challenges = [];
  try { challenges = JSON.parse(localStorage.getItem("mc-td-challenges") || "[]").filter((id) => CHALLENGE_IDS.includes(id)); } catch { challenges = []; }
  let autoWave = false;
  try { autoWave = localStorage.getItem("mc-td-auto") === "1"; } catch { /* stockage indisponible */ }
  let autoClock = 0;
  let showRanges = false;
  let achClock = 0;
  let mapId = FREE_MAP;
  let diffId = DEFAULT_DIFFICULTY;
  // Héros choisi (un seul par partie) : mémorisé d'une partie à l'autre.
  let heroId = FREE_HERO;
  try { const saved = localStorage.getItem("mc-td-hero"); if (HERO_IDS.includes(saved)) heroId = saved; } catch { /* stockage indisponible */ }
  if (!(wallet.data.heroes || [FREE_HERO]).includes(heroId)) heroId = FREE_HERO;
  let state = createState(wallet.data.towers, mapId, diffId);
  let status = "idle";           // idle | running | paused | over
  let placing = null;            // type de tour en cours de pose
  let selectedId = null;         // tour sélectionnée (pour améliorer ou vendre)
  let hover = null;              // point (en pixels) sous la souris
  let cursor = { x: W / 2, y: H / 2 };     // curseur clavier
  let aimPicking = false;        // le prochain clic définit le point visé du Dartling sélectionné
  let paragonSteps = 0;          // totems de puissance achetés à la fusion du paragon
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
  // Reprendre la partie sauvegardée (elle est enregistrée à la fin de chaque vague)
  const resumeButton = h("button", { class: "button button-secondary", id: "td-resume", type: "button", hidden: true, onclick: () => resumeSaved() });
  const overlay = h("div", { class: "game-overlay", id: "td-overlay" }, overlayTitle, overlayText, startButton, resumeButton);

  const goldEl = h("strong", { id: "td-gold" }, "0");
  const livesEl = h("strong", { id: "td-lives" }, "0");
  const waveEl = h("strong", { id: "td-wave-num" }, "0");
  const bestEl = h("strong", { id: "td-best" }, "0");
  const stateEl = h("p", { class: "game-state", id: "td-state", "aria-live": "polite" }, "Prêt");

  const waveButton = h("button", { class: "button button-primary", id: "td-wave", type: "button", onclick: () => launchWave() }, "Lancer la vague 1");
  const speedButton = h("button", { class: "button button-secondary", id: "td-speed", type: "button", title: "Vitesse du jeu (S)", onclick: () => toggleSpeed() }, "Vitesse ×1");
  const autoButton = h("button", { class: "button button-secondary td-small-btn", id: "td-auto", type: "button", title: "Lancer les vagues automatiquement (N)", onclick: () => toggleAuto() });
  const rangesButton = h("button", { class: "button button-secondary td-small-btn", id: "td-ranges", type: "button", title: "Afficher la portée de toutes les tours (O)", onclick: () => toggleRanges() }, "Portées");
  // Aperçu de la prochaine vague
  const previewEl = h("p", { class: "td-preview", id: "td-preview", "aria-live": "off" });
  let previewSig = "";
  // Aimant : une tour posée près d'une autre vient se coller contre elle (ou dans le creux entre deux tours).
  let magnet = true;
  try { magnet = localStorage.getItem("mc-td-magnet") !== "0"; } catch { /* stockage indisponible */ }
  const magnetButton = h("button", { class: "button button-secondary", id: "td-magnet", type: "button", title: "Coller les tours les unes aux autres en les posant (X)", onclick: () => toggleMagnet() });

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
      h("strong", {}, index < 10 ? h("span", { class: "tw-key" }, `${(index + 1) % 10}`) : null, def.name),
      h("span", { class: "tw-stats" }, towerBrief(def)));
    const cost = h("span", { class: "tw-cost" });
    // Icône (le dessin de la tour), nom et prix ; la description et les chiffres clés sont dans l'infobulle et sous la liste.
    const button = h("button", { class: "tower-button", type: "button", "data-tower": id, title: `${def.desc}\n${towerBrief(def)}`, onclick: () => onPalette(id) },
      towerIcon(id, def.color), main, cost);
    button.style.setProperty("--tw", def.color);
    button.addEventListener("pointerenter", () => { hoverTower = id; updateShopInfo(); });
    button.addEventListener("pointerleave", () => { hoverTower = null; updateShopInfo(); });
    return { id, def, cost, button };
  });
  let hoverTower = null;         // tour survolée dans la palette (sa description s'affiche sous la liste)
  const shopInfo = h("p", { class: "td-shop-info", "aria-live": "polite" });

  const selTitle = h("strong", { class: "sel-title" });
  const selIconBox = h("span", { class: "sel-icon" });
  let selIconType = null;
  const closeButton = h("button", { class: "sel-close", type: "button", title: "Fermer et revenir aux tours (Échap)", "aria-label": "Fermer", onclick: () => closeSelection() }, "✕");
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
  // Détail du héros dans le panneau de sélection (perks par niveau, capacités)
  const heroPanel = h("div", { class: "sel-hero", hidden: true });
  let heroPanelSig = "";
  const selection = h("div", { class: "td-selection chamfer", id: "td-selection", hidden: true },
    h("div", { class: "sel-head" }, selIconBox, selTitle, closeButton),
    selStats, selOwned,
    h("div", { class: "sel-buttons" }, targetButton, abilityButton),
    aimRow,
    heroPanel,
    selPaths,
    paragonBox,
    h("div", { class: "sel-buttons" }, sellButton));

  // Choix du héros (avant la partie) : un seul héros par partie ; les autres se débloquent avec des crédits.
  const heroButtons = HERO_IDS.map((id) => {
    const d = HERO_DEFS[id];
    const label = h("span", {});
    const button = h("button", { class: "map-button hero-button", type: "button", "data-hero": id, title: `${d.title} — ${d.desc}`, onclick: () => onHero(id) },
      towerIcon(id, d.color, 22), label);
    button.style.setProperty("--tw", d.color);
    return { id, d, button, label };
  });
  const heroChoice = h("div", { class: "td-maps td-heroes", role: "group", "aria-label": "Héros" }, h("span", { class: "td-heroes-label" }, "Héros"), heroButtons.map((x) => x.button));

  // En partie, le choix de la carte et de la difficulté laisse la place aux compteurs (énergie, vies, vague, record).
  // Défis : à cocher avant la partie ; chacun multiplie les crédits gagnés.
  const challengeButtons = CHALLENGES.map((c) => {
    const button = h("button", { class: "map-button chal-button", type: "button", "data-challenge": c.id, title: `${c.desc} Crédits ×${String(c.reward).replace(".", ",")}.`, onclick: () => onChallenge(c.id) },
      `${c.name} ×${String(c.reward).replace(".", ",")}`);
    return { c, button };
  });
  const challengeTotal = h("span", { class: "chal-total" });
  const challengeBar = h("div", { class: "td-maps td-challenges", role: "group", "aria-label": "Défis" },
    h("span", { class: "td-heroes-label" }, "Défis"), challengeButtons.map((x) => x.button), challengeTotal);
  const setupBox = h("div", { class: "td-setup" }, mapBar, diffBar, heroChoice, challengeBar);
  // Succès du Tower Defense
  const achSummary = h("summary", {});
  const achList = h("ul", {});
  const achBox = h("details", { class: "td-bestiary td-ach" }, achSummary, achList);
  let achSig = "";

  // Carte du héros dans la liste : poser le héros (touche H), ou le sélectionner une fois posé.
  const heroCardIcon = h("span", { class: "hero-card-icon" });
  const heroCardName = h("strong", {});
  const heroCardInfo = h("span", { class: "hero-card-info" });
  const heroCard = h("button", { class: "hero-card", type: "button", id: "td-hero-card", title: "Poser ou sélectionner ton héros (H)", onclick: () => onHeroCard() },
    heroCardIcon, h("span", { class: "hero-card-text" }, heroCardName, heroCardInfo));
  let heroCardFor = null;

  // Barre du héros en jeu : niveau, XP et ses deux capacités (touches F et J).
  const heroBarIcon = h("span", { class: "hero-card-icon" });
  const heroBarName = h("strong", {});
  const heroXpFill = h("span", {});
  const heroBarXp = h("span", { class: "hero-xp" }, heroXpFill);
  const heroAbilityButtons = [0, 1].map((slot) => h("button", { class: "td-power hero-ability", type: "button", onclick: () => doHeroAbility(slot) },
    h("kbd", {}, slot ? "J" : "F"), h("span", { class: "pw-name" }), h("span", { class: "pw-info" })));
  // Liste rapide des capacités des tours : un bouton par tour qui en a une, prête ou en recharge (touche Z = la 1re prête).
  const abilityStrip = h("div", { class: "td-abilities", hidden: true, role: "group", "aria-label": "Capacités des tours" });
  let stripSig = "";
  let stripButtons = [];
  let hoverAbility = null;
  const heroBar = h("div", { class: "td-hero-bar", hidden: true },
    h("div", { class: "hero-bar-id" }, heroBarIcon, h("span", { class: "hero-card-text" }, heroBarName, heroBarXp)), ...heroAbilityButtons);
  let heroBarFor = null;

  const hud = h("dl", { class: "td-hud", hidden: true },
    stat("Énergie", goldEl, "⚡"), stat("Vies", livesEl, "♥"), stat("Vague", waveEl, "≋"), stat("Record", bestEl, "★"));
  // Panneau de droite : la liste des tours, remplacée par le panneau d'amélioration quand une tour est sélectionnée
  // (comme dans BTD6) : rien ne se décale, on n'a plus besoin de faire défiler la page.
  const shopBox = h("div", { class: "td-shop" },
    h("h3", { class: "subhead" }, "Héros"),
    heroCard,
    h("h3", { class: "subhead" }, "Tours"),
    h("ul", { class: "tower-list" }, palette.map((p) => h("li", {}, p.button))),
    shopInfo,
    h("ul", { class: "game-help" },
      h("li", {}, "Clique sur le plateau pour poser, sur une tour pour l'améliorer"),
      h("li", {}, h("kbd", {}, "1"), "–", h("kbd", {}, "0"), " choisir · ", h("kbd", {}, "←↑↓→"), " curseur · ", h("kbd", {}, "Espace"), " poser"),
      h("li", {}, h("kbd", {}, "Entrée"), " vague · ", h("kbd", {}, "U"), " améliorer · ", h("kbd", {}, "T"), " ciblage · ", h("kbd", {}, "A"), " capacité"),
      h("li", {}, h("kbd", {}, "S"), " vitesse · ", h("kbd", {}, "G"), " paragon · ", h("kbd", {}, "V"), " vendre · ", h("kbd", {}, "P"), " pause"),
      h("li", {}, h("kbd", {}, "M"), " visée souris/point · ", h("kbd", {}, "C"), " choisir le point · ", h("kbd", {}, ", ."), " tour préc./suiv."),
      h("li", {}, h("kbd", {}, "X"), " aimant (coller les tours) · ", h("kbd", {}, "G"), " paragon / totem"),
      h("li", {}, h("kbd", {}, "N"), " vagues automatiques · ", h("kbd", {}, "O"), " toutes les portées · survole un ennemi pour voir ses PV"),
      h("li", {}, h("kbd", {}, "Q"), h("kbd", {}, "W"), h("kbd", {}, "E"), h("kbd", {}, "R"), " pouvoirs · ", h("kbd", {}, "H"), " héros · ", h("kbd", {}, "F"), h("kbd", {}, "J"), " capacités du héros · ", h("kbd", {}, "Z"), " 1re capacité prête")),
    bestiary(),
    achBox);
  // Pouvoirs : achetés en énergie pendant une vague, avec une recharge (touches Q, W, E, R).
  const powerButtons = POWERS.map((pw) => {
    const label = h("span", { class: "pw-name" }, pw.name);
    const info = h("span", { class: "pw-info" });
    const button = h("button", { class: "td-power", type: "button", "data-power": pw.id, title: `${pw.desc} (${pw.key.toUpperCase()})`, onclick: () => doPower(pw.id) },
      h("kbd", {}, pw.key.toUpperCase()), label, info);
    button.style.setProperty("--pw", pw.color);
    return { pw, button, info };
  });
  const powersRow = h("div", { class: "td-powers", role: "group", "aria-label": "Pouvoirs" }, powerButtons.map((x) => x.button));

  const layout = h("div", { class: "td-layout" },
    h("div", { class: "td-main" },
      setupBox,
      hud,
      h("div", { class: "td-board-wrap chamfer" },
        h("div", { class: "game-stage td-stage" }, board, toast, overlay)),
      h("div", { class: "td-actions" }, waveButton, speedButton, magnetButton, autoButton, rangesButton, stateEl),
      previewEl,
      powersRow,
      heroBar,
      abilityStrip),
    h("aside", { class: "td-side" }, selection, shopBox));

  root.replaceChildren(
    rulesBox(
      `Des ennemis suivent un ou plusieurs chemins : arrête-les avant la sortie (${START_LIVES} vies en Normal). Pose des tours où tu veux (ni sur le chemin, ni sur un obstacle) avec l'énergie gagnée en jeu, puis améliore-les : 3 chemins par tour, 2 au maximum, un seul au-delà du palier 2. Le palier 4 du 3e chemin donne une capacité active (son temps de recharge ne tourne que pendant les vagues). Avec une tour d'un même type au palier 4 sur chacun des 3 chemins, tu peux créer son paragon : il sacrifie toutes les tours de ce type et son degré (1 à 100) dépend de leur puissance. Un boss arrive toutes les 10 vagues (5 boss différents). Attention aux Furtifs : seules les tours qui détectent peuvent les viser. Choisis un héros avant de jouer (un seul par partie) : il gagne de l'expérience, monte jusqu'au niveau 20 et débloque deux capacités. Pendant une vague, tu peux aussi acheter des pouvoirs (frappe orbitale, gel…) avec ton énergie. Débloque de nouvelles tours et cartes avec tes crédits.`),
    layout
  );

  // Règles : ouvertes la première fois ; « J'ai compris » les replie (et on s'en souvient). Elles se replient aussi
  // au lancement d'une partie. Un clic sur « Règles du jeu » les rouvre.
  function rulesBox(text) {
    let read = false;
    try { read = localStorage.getItem("mc-td-rules-read") === "1"; } catch { /* stockage indisponible */ }
    const box = h("details", { class: "td-rules" },
      h("summary", {}, "Règles du jeu"),
      h("p", { class: "game-rules" }, text),
      h("button", { class: "button button-secondary td-rules-ok", type: "button", onclick: () => closeRules(true) }, "J'ai compris"));
    box.open = !read;
    rulesEl = box;
    return box;
  }

  // Bestiaire : tous les ennemis et boss, avec leurs particularités.
  function bestiary() {
    const items = Object.entries(ENEMY_DEFS).map(([id, d]) => {
      const dot = h("span", { class: "bst-dot", "aria-hidden": "true" });
      dot.style.background = d.color;
      const traits = [`PV ×${String(d.hp).replace(".", ",")}`, `vitesse ${String(d.speed).replace(".", ",")}`, `${d.lives} vie${d.lives > 1 ? "s" : ""}`];
      if (d.armor) traits.push(`blindage ${d.armor}`);
      return h("li", { class: d.boss ? "is-boss" : "" }, dot,
        h("strong", {}, d.boss ? `Boss : ${d.name}` : d.name),
        h("small", {}, traits.join(" · ")),
        d.power || d.info ? h("span", {}, d.power || d.info) : null);
    });
    return h("details", { class: "td-bestiary" }, h("summary", {}, `Bestiaire (${items.length} ennemis)`), h("ul", {}, items));
  }

  function stat(label, el, icon = "") {
    return h("div", {}, h("dt", {}, icon ? h("span", { class: "hud-icon", "aria-hidden": "true" }, icon) : null, label), h("dd", {}, el));
  }

  function updateShopInfo() {
    const id = hoverTower || placing;
    if (!id) { setText(shopInfo, "Choisis une tour, puis clique sur le plateau pour la poser."); return; }
    const def = TOWER_DEFS[id];
    setText(shopInfo, `${def.name} · ${towerBrief(def)} — ${def.desc}`);
  }

  function closeSelection() {
    selectedId = null;
    aimPicking = false;
    paragonConfirm = null;
    updateHud();
    draw();
  }

  /* ---------- Canvas ---------- */

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  board.width = W * dpr;
  board.height = H * dpr;
  const ctx = board.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const towerRangePx = (tower) => tower.st.range * beaconBuff(state, tower).range;
  const ENEMY_R = { boss3: 14, boss5: 15, cargo: 15, tank: 10, shield: 9, runner: 6, swarm: 6, ghost: 7 };
  const enemyRadius = (e) => ENEMY_R[e.type] || (isBoss(e) ? 13 : 8);

  function drawEnemyTip(e) {
    const d = ENEMY_DEFS[e.type];
    const traits = [];
    if (d.boss) traits.push("boss");
    if (e.camo) traits.push("furtif");
    if (d.armor && !(e.shred > 0)) traits.push(`blindage ${d.armor}`);
    if (e.shred > 0) traits.push("blindage rongé");
    if (d.regen) traits.push("régénère");
    if (e.markUntil > state.time) traits.push("marqué");
    if (e.slow > 0) traits.push("ralenti");
    if (e.stun > 0) traits.push("étourdi");
    const lines = [d.name, `PV ${fmtBig(Math.max(0, e.hp))} / ${fmtBig(e.maxHp)}${e.shield > 0 ? ` · bouclier ${fmtBig(e.shield)}` : ""}`];
    if (traits.length) lines.push(traits.join(" · "));
    ctx.font = "11px monospace";
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
    const hgt = lines.length * 14 + 8;
    let x = e.x + 14, y = e.y - hgt - 8;
    if (x + w > W - 4) x = e.x - w - 14;
    if (y < 4) y = e.y + 14;
    ctx.fillStyle = "rgba(8, 8, 16, 0.92)";
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, hgt, 4); ctx.fill(); ctx.stroke();
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? d.color : i === 1 ? "#e6e6f0" : "#a0a6b8";
      ctx.fillText(l, x + 7, y + 16 + i * 14);
    });
  }

  function draw() {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.map.space ? "#05050d" : "#0a0a12";
    ctx.fillRect(0, 0, W, H);
    if (state.map.space) {
      // Orbite : champ d'étoiles qui scintillent
      for (let i = 0; i < 70; i++) {
        const x = (i * 97.3) % W, y = (i * 53.7 + (i % 7) * 11) % H;
        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(state.time * 1.5 + i));
        ctx.fillStyle = i % 9 === 0 ? "#b58cff" : "#e0e6ff";
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
    }

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
      if (state.map.rocks) {
        // Canyon : rochers anguleux
        ctx.fillStyle = "#4a3f36";
        ctx.strokeStyle = "#1c1612";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + o.x; const rr = o.r * (0.8 + 0.2 * Math.sin(i * 2.7 + o.y)); ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr); }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.35, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (state.map.lava) {
        // Volcan : coulées de lave qui pulsent
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, "#ffd166");
        g.addColorStop(0.5, `rgba(255, 90, 31, ${0.75 + 0.15 * Math.sin(state.time * 2 + o.x)})`);
        g.addColorStop(1, "rgba(120, 20, 10, 0.6)");
        ctx.fillStyle = g;
        ctx.strokeStyle = "#3a1208";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
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

    // Spike Factory ciblée : la zone où tombent les pointes
    for (const t of state.towers) {
      if (!t.aim || !TOWER_DEFS[t.type].spikes || !t.st.aimSpikes) continue;
      ctx.strokeStyle = TOWER_DEFS[t.type].color;
      ctx.globalAlpha = t.id === selectedId ? 0.8 : 0.3;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(t.aim.x, t.aim.y, SPIKE_SPOT * CELL, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(t.aim.x - 5, t.aim.y); ctx.lineTo(t.aim.x + 5, t.aim.y);
      ctx.moveTo(t.aim.x, t.aim.y - 5); ctx.lineTo(t.aim.x, t.aim.y + 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Visée des Dartling : un rayon pointillé jusqu'au bord du plateau, et le point visé
    for (const t of state.towers) {
      if (!t.aim || !TOWER_DEFS[t.type].line) continue;
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
      if (def.patrol) drawRange(selected.x, selected.y, selected.st.patrolR * CELL + towerRangePx(selected), def.color);
      else if (def.range && !def.line && def.range < 20) drawRange(selected.x, selected.y, towerRangePx(selected), def.color);
    } else if (placing && target && !towerAt(state, target.x, target.y)) {
      const def = TOWER_DEFS[placing];
      const spot = placeSpot(placing, target.x, target.y);
      const at = spot || target;
      const ok = !!spot && state.gold >= def.cost;
      const color = ok ? def.color : "#ff3b5c";
      const r = towerRadius(placing);
      if (!def.line && def.range < 20) drawRange(at.x, at.y, towerStats(def, [0, 0, 0]).range, color);
      if (spot && spot.snapped) {
        // L'aimant a déplacé la tour : petit trait jusqu'au curseur et contour des tours touchées
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(target.x, target.y); ctx.lineTo(at.x, at.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#4dffd2";
        ctx.lineWidth = 1.5;
        for (const t of state.towers) {
          const rt = towerRadius(t.type);
          if (Math.hypot(t.x - at.x, t.y - at.y) <= r + rt + 1.5) { ctx.beginPath(); ctx.arc(t.x, t.y, rt + 1.5, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 0.8;
      drawTower(ctx, placing, { x: at.x, y: at.y, color: def.color, time: state.time, jam: !ok, scale: r / 13 });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? (spot.snapped ? "#4dffd2" : "rgba(255, 255, 255, 0.35)") : "#ff3b5c";
      ctx.lineWidth = ok ? 1.5 : 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Tours
    for (const tower of state.towers) {
      const def = TOWER_DEFS[tower.type];
      const x = tower.x;
      const y = tower.y;
      const maxed = tower.tiers.some((t) => t >= MAX_TIER);
      const R = towerRadius(tower.type);
      const art = (R / 13) * (tower.paragon ? 1.35 : 1);       // un paragon est nettement plus gros
      if (def.support) {
        // Aura du Beacon : disque qui pulse doucement autour de la tour
        ctx.globalAlpha = (tower.fury > 0 ? 0.22 : 0.12) + 0.08 * Math.sin(state.time * 3);
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(x, y, tower.st.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Capacité en cours (fureur) : halo de la couleur de la tour
      if (tower.fury > 0) {
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(state.time * 12);
        ctx.beginPath();
        ctx.arc(x, y, R * (tower.paragon ? 1.35 : 1) + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (tower.id === selectedId) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -state.time * 10;
        ctx.beginPath();
        ctx.arc(x, y, R * (tower.paragon ? 1.35 : 1) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
      if (tower.paragon) {
        // Paragon : halo doré en étoile qui tourne sous la tour
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(state.time * 0.8);
        ctx.fillStyle = "rgba(252, 238, 10, 0.16)";
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          const rr = i % 2 ? R * 1.5 : R * 2.1;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      drawTower(ctx, tower.type, { scale: art,
        x, y, angle: tower.angle ?? -Math.PI / 2, tiers: tower.tiers, time: state.time, spin: tower.spin,
        jam: tower.jam > 0, fury: tower.fury > 0, paragon: !!tower.paragon, color: tower.paragon ? "#fcee0a" : def.color
      });
      if (def.hero) {
        // Héros : anneau doré et niveau au-dessus
        ctx.strokeStyle = "#fcee0a";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(x, y, R + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#0a0a12";
        ctx.strokeText(`★${tower.level}`, x, y - R - 6);
        ctx.fillStyle = "#fcee0a";
        ctx.fillText(`★${tower.level}`, x, y - R - 6);
        ctx.textAlign = "start";
      }
      if (tower.jam > 0) {
        ctx.strokeStyle = "#ff2a6d";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, R + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Paliers : une rangée de petits carrés par chemin, de la couleur du chemin
      for (let p = 0; p < PATH_COUNT; p++) {
        ctx.fillStyle = PATH_COLORS[p];
        if (!tower.paragon) for (let i = 0; i < tower.tiers[p]; i++) ctx.fillRect(x - 16 + p * 11 + i * 2.5, y + R + 3, 2, 4);
      }
      if (maxed && !tower.paragon) { ctx.strokeStyle = "#fcee0a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R + 2.5, 0, Math.PI * 2); ctx.stroke(); }
      if (tower.paragon) {
        // Paragon : anneau doré qui tourne et degré
        ctx.strokeStyle = "#fcee0a";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -state.time * 18;
        ctx.beginPath();
        ctx.arc(x, y, R * 1.35 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.fillStyle = "#fcee0a";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#0a0a12";
        ctx.strokeText(`★${tower.st.degree}`, x, y - R * 1.35 - 7);
        ctx.fillText(`★${tower.st.degree}`, x, y - R * 1.35 - 7);
        ctx.textAlign = "start";
      }
      // Capacité : pastille verte quand elle est prête
      if (tower.st.ability) {
        const ready = tower.abilityCd <= 0 && state.phase === "wave";
        ctx.fillStyle = ready ? "#3ddc84" : tower.abilityCd > 0 ? "#6b6b7a" : "#9aa5b1";
        ctx.beginPath();
        ctx.arc(x + R * art - 1, y - R * art + 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ennemis
    for (const e of state.enemies) {
      const def = ENEMY_DEFS[e.type];
      const r = enemyRadius(e);
      // Silhouette propre à chaque ennemi, tournée dans le sens de la marche
      const lane = state.map.lanes[e.lane || 0];
      const ahead = pointAt(Math.min(lane.length, e.dist + 4), lane);
      const heading = Math.hypot(ahead.x - e.x, ahead.y - e.y) > 0.1 ? Math.atan2(ahead.y - e.y, ahead.x - e.x) : (e.heading || 0);
      e.heading = heading;
      if (e.camo) ctx.globalAlpha = 0.45 + 0.1 * Math.sin(state.time * 6 + e.id);     // furtif : à moitié transparent
      ctx.shadowColor = def.color;
      ctx.shadowBlur = isBoss(e) ? 14 : 6;
      drawEnemy(ctx, e.type, e.x, e.y, r, { angle: heading, time: state.time, color: def.color, slow: e.slow > 0, stun: e.stun > 0, seed: e.id });
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (e.camo) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#c9d6ff";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      if (e.shield > 0) {
        // Bouclier : hexagone doré, d'autant plus épais qu'il reste de bouclier
        ctx.strokeStyle = "#ffd166";
        ctx.globalAlpha = 0.5 + 0.4 * (e.shield / Math.max(1, e.maxShield || e.shield));
        ctx.lineWidth = 1 + 2.5 * (e.shield / Math.max(1, e.maxShield || e.shield));
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + state.time; ctx.lineTo(e.x + Math.cos(a) * (r + 4), e.y + Math.sin(a) * (r + 4)); }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (e.shred > 0) {
        // Rongé par l'acide : gouttes vertes
        ctx.fillStyle = "#9cff6b";
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(e.x + (i ? 3 : -3), e.y + r - ((state.time * 12 + i * 5) % 6), 1.3, 0, Math.PI * 2); ctx.fill(); }
      }
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

    // Tour survolée dans la liste des capacités : on la montre sur le plateau
    if (hoverAbility !== null) {
      const t = state.towers.find((x) => x.id === hoverAbility);
      if (t) {
        ctx.strokeStyle = "#fcee0a";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -state.time * 20;
        ctx.beginPath(); ctx.arc(t.x, t.y, towerRadius(t.type) * (t.paragon ? 1.35 : 1) + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
    }

    // Drones de patrouille (au-dessus des ennemis), potions des Alchimistes sur les tours boostées
    for (const t of state.towers) {
      const tdef = TOWER_DEFS[t.type];
      if (tdef.patrol) {
        const n = Math.max(1, Math.round(t.st.drones));
        if (t.id === selectedId) {
          ctx.strokeStyle = tdef.color;
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.arc(t.x, t.y, t.st.patrolR * CELL, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        for (let k = 0; k < n; k++) {
          const p = dronePos(t, k, state.time);
          drawDrone(ctx, p.x, p.y, { angle: p.a + Math.PI / 2, time: state.time, color: t.paragon ? "#fcee0a" : tdef.color, big: !!t.paragon, armed: t.tiers[0] });
        }
      }
      if (t.brew && t.brew.until > state.time) {
        const R = towerRadius(t.type);
        ctx.fillStyle = "#f07cff";
        ctx.shadowColor = "#f07cff";
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(t.x - R + 1, t.y - R + 1, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(t.x - R, t.y - R - 4.5, 2, 3);
      }
    }
    if (state.elixirUntil > state.time || state.overclockUntil > state.time) {
      // Élixir ou Surcadence : liseré coloré autour du plateau
      ctx.strokeStyle = state.elixirUntil > state.time ? "#f07cff" : "#fcee0a";
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(state.time * 8);
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.globalAlpha = 1;
    }

    // Lasers continus des Dartling (chemin 1 au palier 3 ou 4)
    for (const t of state.towers) {
      if (!t.st.beam || !(t.beamUntil > state.time) || !t.aim) continue;
      const aim = t.aimMode === "mouse" && state.cursor ? state.cursor : t.aim;
      const len = Math.hypot(aim.x - t.x, aim.y - t.y);
      if (len < 2) continue;
      const ux0 = (aim.x - t.x) / len;
      const uy0 = (aim.y - t.y) / len;
      const n = Math.round(t.st.targets);
      const wide = t.st.beam >= 2;
      const flick = 0.85 + 0.15 * Math.sin(state.time * 40 + t.id);
      if (t.st.beam >= 3) {
        // Paragon : un laser colossal, en couches (halo rouge, flamme dorée, cœur blanc), qui ondule et lâche des étincelles
        const ex = t.x + ux0 * 1300, ey = t.y + uy0 * 1300;
        const sx = t.x + ux0 * 22, sy = t.y + uy0 * 22;
        const pulse = 1 + 0.12 * Math.sin(state.time * 18);
        ctx.lineCap = "round";
        for (const [color, w, a, blur] of [["#ff2a4a", 46, 0.28, 30], ["#ff7a2a", 30, 0.55, 20], ["#ffd23a", 17, 0.9, 14], ["#fff8e6", 7, 1, 0]]) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = a * flick;
          ctx.lineWidth = w * pulse;
          ctx.shadowColor = color;
          ctx.shadowBlur = blur;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // étincelles le long du rayon
        ctx.fillStyle = "#fff1b0";
        for (let i = 0; i < 14; i++) {
          const d = ((state.time * 520 + i * 97) % 900) + 20;
          const off = Math.sin(i * 12.9 + state.time * 9) * 20;
          ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.arc(t.x + ux0 * d - uy0 * off, t.y + uy0 * d + ux0 * off, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        // anneau d'énergie à la sortie du canon
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = "#ffd23a";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 14 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
        continue;
      }
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * 0.06;
        const ux = ux0 * Math.cos(a) - uy0 * Math.sin(a);
        const uy = ux0 * Math.sin(a) + uy0 * Math.cos(a);
        const sx = t.x + ux * 16, sy = t.y + uy * 16;
        const ex = t.x + ux * 1300, ey = t.y + uy * 1300;
        ctx.lineCap = "round";
        ctx.strokeStyle = wide ? "#ff2a4a" : "#ff5a6e";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.55 * flick;
        ctx.lineWidth = (wide ? LINE_WIDTH + 7 : LINE_WIDTH) * 1.2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#fff4f6";
        ctx.lineWidth = wide ? 5 : 2.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.lineCap = "butt";
      }
    }

    // Projectiles en vol : fléchettes du Dartling et boomerangs
    for (const pr of state.projs) {
      if (pr.kind === "dart") {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.atan2(pr.uy, pr.ux));
        ctx.strokeStyle = "#0d0d16";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.fillStyle = "#e6e6e6";
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -2.5); ctx.lineTo(4, 2.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ff2a6d";
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -3.5); ctx.lineTo(-6, 0); ctx.lineTo(-12, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
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

    // Tirs et explosions (dessinés par td-fx.js)
    for (const f of state.fx) drawFx(ctx, f);
    ctx.globalAlpha = 1;

    // Toutes les portées (touche O)
    if (showRanges) {
      for (const t of state.towers) {
        const d = TOWER_DEFS[t.type];
        if (d.line || d.range >= 20 || d.income) continue;
        const r = d.patrol ? t.st.patrolR * CELL + towerRangePx(t) : towerRangePx(t);
        ctx.strokeStyle = d.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = d.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Infobulle de l'ennemi survolé : nom, PV, bouclier, particularités
    if (hover && !placing) {
      let best = null, bd = 18 * 18;
      for (const e of state.enemies) {
        if (e.dead) continue;
        const d2 = (e.x - hover.x) ** 2 + (e.y - hover.y) ** 2;
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (best) drawEnemyTip(best);
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
    const playing = next === "running" || next === "paused";
    setupBox.hidden = playing;
    hud.hidden = !playing;
    root.classList.toggle("is-playing", playing);
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

  // Bloc « Paragon » (comme BTD6) : conditions, tours sacrifiées, puissance → degré, totems ; ou degré du paragon et achat de totems.
  const fmtK = (n) => (n >= 10000 ? `${fmt(Math.round(n / 1000))} k` : fmt(n));
  function powerBar(value, from, to) {
    const fill = h("span", {});
    fill.style.width = `${Math.max(0, Math.min(100, ((value - from) / Math.max(1, to - from)) * 100))}%`;
    return h("span", { class: "pg-bar", "aria-hidden": "true" }, fill);
  }

  function renderParagon(tower, def, info) {
    paragonBox.replaceChildren();
    const spec = PARAGONS[tower.type];
    if (info.is) {
      const button = h("button", { class: "button button-primary", type: "button", disabled: info.maxed || !info.affordable || state.phase === "over", onclick: () => doParagon() },
        info.maxed ? "Degré maximum atteint" : `Totem de puissance (+${fmt(TOTEM_POWER)}) · ${fmt(info.totemCost)} ⚡ · G`);
      paragonBox.append(
        h("strong", { class: "sel-paragon-title" }, `★ ${spec.name} — degré ${info.degree}/${PARAGON_MAX_DEGREE}`),
        h("p", {}, `${spec.desc} Sa capacité recharge deux fois plus vite. Chaque degré : +2 % dégâts, +0,5 % cadence, +1 % contre les boss ; au degré 100, +25 % de dégâts en plus.`),
        h("p", { class: "pg-power" }, info.maxed ? `Puissance ${fmt(info.power)} : degré maximum.` : `Puissance ${fmt(info.power)} / ${fmt(info.next)} pour le degré ${info.degree + 1}`),
        info.maxed ? null : powerBar(info.power, powerFor(info.degree), info.next),
        button);
      return;
    }
    const marks = info.covered.map((c, i) => h("span", { class: c ? "pg-ok" : "pg-ko" }, `${c ? "✓" : "✗"} ${PATH_NAMES[def.id][i]}`));
    const lines = [
      h("strong", { class: "sel-paragon-title" }, `★ Paragon : ${spec.name}`),
      h("p", {}, `${spec.desc} Une tour à part, pas la somme des chemins.`),
      h("p", { class: "pg-req" }, "Une tour au palier 4 sur chaque chemin : ", ...marks),
      h("p", {}, info.sacrifice.length
        ? `La fusion sacrifie toutes les autres tours « ${def.name} » (${info.sacrifice.length}). Leur puissance donne le degré :`
        : `Aucune autre tour « ${def.name} » à sacrifier. Puissance :`),
      h("ul", { class: "pg-sources" },
        h("li", {}, `Énergie investie : ${fmtK(info.power.spent)}`, h("small", {}, ` / ${fmtK(POWER_CAPS.spent)}`)),
        h("li", {}, `Éliminations : ${fmtK(info.power.kills)}`, h("small", {}, ` / ${fmtK(POWER_CAPS.kills)}`)),
        h("li", {}, `Améliorations : ${fmtK(info.power.upgrades)}`, h("small", {}, ` / ${fmtK(POWER_CAPS.upgrades)}`)))
    ];
    const blocked = !!info.reason && info.reason !== "gold";
    const maxTotems = Math.max(0, Math.min(info.maxTotems, Math.floor((state.gold - info.cost) / info.totemCost)));
    paragonSteps = Math.min(paragonSteps, maxTotems);
    const label = h("span", { class: "pg-label" });
    const button = h("button", { class: "button button-primary", type: "button", disabled: !!info.reason, onclick: () => doParagon(), title: blocked ? REASONS[info.reason] : "Sacrifie toutes les autres tours de ce type" });
    const refresh = () => {
      const power = info.power.total + paragonSteps * TOTEM_POWER;
      const degree = degreeOf(power);
      label.textContent = `Totems achetés à la fusion : ${paragonSteps} (${fmt(paragonSteps * info.totemCost)} ⚡) → puissance ${fmtK(power)}, degré ${degree}/${PARAGON_MAX_DEGREE}`;
      const total = info.cost + paragonSteps * info.totemCost;
      button.textContent = blocked ? REASONS[info.reason]
        : paragonConfirm === tower.id && !info.reason
          ? `Confirmer : sacrifier ${info.sacrifice.length} tour${info.sacrifice.length > 1 ? "s" : ""} (−${fmt(total)} ⚡)`
          : info.reason === "gold" ? `Énergie insuffisante (${fmt(total)} ⚡)` : `Créer le paragon (${fmt(total)} ⚡) · G`;
    };
    if (!blocked) {
      const slider = h("input", { class: "pg-slider", type: "range", min: 0, max: maxTotems, step: 1, value: paragonSteps, "aria-label": "Totems de puissance achetés à la fusion" });
      slider.disabled = maxTotems === 0;
      slider.addEventListener("input", () => { paragonSteps = Number(slider.value); paragonConfirm = null; refresh(); });
      lines.push(label, slider, h("p", { class: "pg-note" }, `Un totem coûte ${fmt(info.totemCost)} ⚡ et ajoute ${fmt(TOTEM_POWER)} de puissance ; tu pourras aussi en acheter plus tard.`));
    } else {
      lines.push(h("p", { class: "pg-note" }, `Degré prévu avec les tours actuelles : ${info.degree}/${PARAGON_MAX_DEGREE}.`));
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
    setText(magnetButton, `Aimant : ${magnet ? "oui" : "non"}`);
    magnetButton.setAttribute("aria-pressed", String(magnet));
    for (const { pw, button, info } of powerButtons) {
      const cd = state.powerCd[pw.id] || 0;
      const cost = powerCost(state, pw.id);
      const active = pw.id === "overclock" && state.overclockUntil > state.time;
      setText(info, active ? `actif ${Math.ceil(state.overclockUntil - state.time)} s` : cd > 0 ? `${Math.ceil(cd)} s` : `${fmt(cost)} ⚡`);
      button.disabled = status !== "running" || state.phase !== "wave" || cd > 0 || state.gold < cost;
      button.classList.toggle("is-cd", cd > 0);
    }

    for (const { m, button } of mapButtons) {
      const owned = wallet.data.maps.includes(m.id);
      setText(button, owned ? `${m.name}${m.reward > 1 ? ` (×${m.reward} ¤)` : ""}` : `${m.name} · débloquer ${fmt(m.unlock)} ¤`);
      button.title = m.desc;
      button.classList.toggle("is-active", owned && mapId === m.id);
      button.classList.toggle("is-locked", !owned);
      button.setAttribute("aria-pressed", String(owned && mapId === m.id));
      button.disabled = status === "running" || status === "paused" || (!owned && wallet.credits < m.unlock);
    }

    for (const { id, d, button, label } of heroButtons) {
      const owned = wallet.data.heroes.includes(id);
      setText(label, owned ? d.name : `${d.name} · ${fmt(d.unlock)} ¤`);
      button.classList.toggle("is-active", owned && heroId === id);
      button.classList.toggle("is-locked", !owned);
      button.setAttribute("aria-pressed", String(owned && heroId === id));
      button.disabled = status === "running" || status === "paused" || (!owned && wallet.credits < d.unlock);
    }
    updateHeroWidgets();
    updateAbilityStrip();
    renderAchievements();
    updateResumeButton();
    setText(autoButton, `Auto : ${autoWave ? "oui" : "non"}`);
    autoButton.setAttribute("aria-pressed", String(autoWave));
    rangesButton.setAttribute("aria-pressed", String(showRanges));
    for (const { c, button } of challengeButtons) {
      const on = challenges.includes(c.id);
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", String(on));
      button.disabled = status === "running" || status === "paused";
    }
    const mul = challengeReward(challenges);
    setText(challengeTotal, challenges.length ? `crédits ×${mul.toFixed(2).replace(".", ",")}` : "aucun défi");
    updatePreview();

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
    if (!tower && selectedId !== null) selectedId = null;       // tour vendue ou sacrifiée
    selection.hidden = !tower;
    shopBox.hidden = !!tower;
    updateShopInfo();
    if (!tower) { panelSig = ""; return; }

    const def = TOWER_DEFS[tower.type];
    if (selIconType !== tower.type) { selIconType = tower.type; selIconBox.replaceChildren(towerIcon(tower.type, def.color, 34)); }
    const ts = tower.st;
    heroPanel.hidden = !def.hero;
    if (def.hero) {
      const buffedH = beaconBuff(state, tower);
      const aura = [ts.auraDmg ? `+${Math.round(ts.auraDmg * 100)} % dégâts` : "", ts.auraRate ? `+${Math.round(ts.auraRate * 100)} % cadence` : "", ts.auraRange ? `+${Math.round(ts.auraRange * 100)} % portée` : ""].filter(Boolean).join(", ");
      setText(selTitle, `★ ${def.name} — niveau ${tower.level}`);
      setText(selStats, `Dégâts ${Math.round(ts.damage * buffedH.damage)} · portée ${num((ts.range * buffedH.range) / CELL)} cases · ${num(ts.rate * buffedH.rate)} tirs/s${ts.targets > 1 ? ` · ${ts.targets} cibles` : ""}${ts.chain ? ` · ${ts.chain} rebonds` : ""}${ts.detect ? " · voit les furtifs" : ""}`);
      setText(selOwned, `${def.title}${aura ? ` · aura : ${aura} pour les tours à portée` : ""}${ts.goldGen ? ` · +${fmt(Math.round(ts.goldGen))} énergie par vague` : ""} · ${fmtBig(tower.dmg || 0)} dégâts infligés, ${fmt(tower.kills)} éliminations`);
      targetButton.hidden = false;
      setText(targetButton, `Ciblage : ${TARGET_LABELS[tower.target]} (T)`);
      abilityButton.hidden = true;
      aimRow.hidden = true;
      selPaths.hidden = true;
      paragonBox.hidden = true;
      renderHeroPanel(tower, def);
      panelSig = "";
      setText(sellButton, state.noSell ? "Vente impossible (défi)" : `Vendre (+${fmt(sellValue(state, tower))}) · garde son XP`);
      sellButton.disabled = state.phase === "over" || state.noSell;
      return;
    }
    const total = tower.tiers.reduce((a, b) => a + b, 0);
    setText(selTitle, tower.paragon ? `★ ${PARAGONS[tower.type].name}` : `${def.name} — ${tower.tiers.join(" · ")}`);
    const pct = (v) => `+${Math.round(v * 100)} %`;
    const buffed = beaconBuff(state, tower);
    setText(selStats, def.support
      ? `Aura ${num(ts.range / CELL)} cases · dégâts ${pct(ts.boostDamage)} · cadence ${pct(ts.boostRate)}`
      : def.line && ts.beam
        ? `Laser continu : ${Math.round(ts.damage * buffed.damage * buffed.rate)} dégâts toutes les 0,13 s à tous les ennemis de la ligne${ts.targets > 1 ? ` · ${ts.targets} rayons` : ""}`
      : def.line
        ? `Dégâts ${Math.round(ts.damage * buffed.damage)} · portée infinie · ${num(ts.rate * buffed.rate)} tirs/s · transperce ${ts.pierceN >= 50 ? "toute la ligne" : `${ts.pierceN} ennemis`}${ts.targets > 1 ? ` · ${ts.targets} rayons` : ""}`
      : def.spikes
        ? `Pointes : ${Math.round(ts.damage * buffed.damage)} dégâts × ${ts.pierceN} passages · ${ts.batch} tas toutes les ${num(1 / (ts.rate * buffed.rate))} s · portée ${num((ts.range * buffed.range) / CELL)} cases${ts.aimSpikes ? " · zone choisie" : ""}`
      : def.income
        ? `Produit ${fmt(Math.round(ts.income))} énergie${ts.interest ? ` + ${num(ts.interest * 100)} % d'intérêts` : ""} à la fin de chaque vague`
        : `Dégâts ${Math.round(ts.damage * buffed.damage)} · portée ${num((ts.range * buffed.range) / CELL)} cases · ${num(ts.rate * buffed.rate)} tirs/s${ts.targets > 1 ? ` · ${ts.targets} cibles` : ""}`);
    setText(selOwned, `${tower.paragon ? `Paragon ${def.name} : ${PARAGONS[tower.type].desc}` : total ? ownedUpgrades(tower).map((u) => u.name).join(" · ") : "Aucune amélioration : choisis un chemin ci-dessous."} — ${fmtBig(tower.dmg || 0)} dégâts infligés, ${fmt(tower.kills)} éliminations`);

    const shoots = !def.support && !def.income && !def.spikes && !def.line;
    targetButton.hidden = !shoots;
    aimRow.hidden = !tower.aim;
    if (tower.aim) {
      aimModeButton.hidden = !def.line;
      setText(aimModeButton, `Visée : ${tower.aimMode === "mouse" ? "souris" : "point fixe"} (M)`);
      setText(aimPickButton, aimPicking ? "Clique sur le plateau…" : def.spikes ? "Choisir où tombent les pointes (C)" : "Choisir le point (C)");
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
    const sig = `${tower.id}|${tower.tiers}|${affordBits}|${state.phase}|${pinfo.is ? `${pinfo.degree}/${pinfo.power}/${pinfo.affordable}` : `${pinfo.reason}${pinfo.covered}${pinfo.sacrifice.length}/${pinfo.power.total}/${Math.floor((state.gold - pinfo.cost) / pinfo.totemCost)}`}|${paragonConfirm === tower.id}`;
    if (sig !== panelSig) {
      panelSig = sig;
      selPaths.hidden = pinfo.is;
      if (!pinfo.is) renderPaths(tower, def);
      paragonBox.hidden = !showParagon;
      if (showParagon) renderParagon(tower, def, pinfo);
    }

    setText(sellButton, state.noSell ? "Vente impossible (défi)" : sellRatio(state, tower) === 1 ? `Annuler (+${fmt(sellValue(state, tower))}, 100 %)` : `Vendre (+${fmt(sellValue(state, tower))})`);
    sellButton.disabled = state.phase === "over" || state.noSell;
  }

  function updateAbilityStrip() {
    const list = state.towers.filter((t) => t.st.ability && !TOWER_DEFS[t.type].hero);
    const sig = list.map((t) => `${t.id}:${t.st.ability}:${t.paragon ? 1 : 0}`).join(",");
    abilityStrip.hidden = !list.length;
    if (sig !== stripSig) {
      stripSig = sig;
      stripButtons = list.map((t) => {
        const def = TOWER_DEFS[t.type];
        const ab = ABILITIES[t.st.ability];
        const info = h("span", { class: "pw-info" });
        const button = h("button", { class: "td-power ab-chip", type: "button", title: `${ab.name} (${t.paragon ? PARAGONS[t.type].name : def.name}) — ${ab.desc}`, onclick: () => fireAbility(t.id) },
          towerIcon(t.type, t.paragon ? "#fcee0a" : def.color, 22), h("span", { class: "pw-name" }, ab.name), info);
        button.style.setProperty("--pw", t.paragon ? "#fcee0a" : def.color);
        button.addEventListener("pointerenter", () => { hoverAbility = t.id; });
        button.addEventListener("pointerleave", () => { hoverAbility = null; });
        return { id: t.id, button, info };
      });
      abilityStrip.replaceChildren(h("span", { class: "td-abilities-label" }, "Capacités", h("kbd", {}, "Z")), ...stripButtons.map((x) => x.button));
    }
    for (const { id, button, info } of stripButtons) {
      const t = state.towers.find((x) => x.id === id);
      if (!t) continue;
      const cd = t.abilityCd;
      setText(info, cd > 0 ? `${Math.ceil(cd)} s${state.phase === "wave" ? "" : " ⏸"}` : "prête");
      button.disabled = cd > 0 || state.phase !== "wave" || status !== "running";
      button.classList.toggle("is-ready", !(cd > 0) && state.phase === "wave");
    }
  }

  function fireAbility(id) {
    if (status !== "running") return;
    const r = useAbility(state, id);
    say(r.ok ? `${r.name} !` : REASONS[r.reason] || "Impossible.");
    updateHud();
    draw();
  }

  // Touche Z : la première capacité prête de la liste.
  function fireFirstReady() {
    const t = stripButtons.map((x) => state.towers.find((y) => y.id === x.id)).find((y) => y && !(y.abilityCd > 0));
    if (t) fireAbility(t.id);
    else say(stripButtons.length ? "Aucune capacité prête." : "Aucune tour n'a de capacité (palier 4 du 3e chemin).");
  }

  function updatePreview() {
    const pv = wavePreview(state);
    const sig = `${pv.wave}|${state.phase}|${state.bossEvery}`;
    if (sig === previewSig) return;
    previewSig = sig;
    const entries = Object.entries(pv.counts).sort((a, b) => (ENEMY_DEFS[b[0]].boss ? 1 : 0) - (ENEMY_DEFS[a[0]].boss ? 1 : 0) || b[1] - a[1]);
    previewEl.replaceChildren(h("span", { class: "pv-label" }, state.phase === "wave" ? `Ensuite, vague ${pv.wave} :` : `Vague ${pv.wave} :`),
      ...entries.map(([type, n]) => {
        const d = ENEMY_DEFS[type];
        const dot = h("span", { class: "bst-dot", "aria-hidden": "true" });
        dot.style.background = d.color;
        return h("span", { class: `pv-item${d.boss ? " is-boss" : ""}`, title: d.info || d.power || "" }, dot, d.boss ? `BOSS ${d.name}` : `${n} ${d.name}`);
      }));
  }

  function updateHeroWidgets() {
    const hs = state.hero;
    heroCard.hidden = !hs;
    if (!hs) { heroBar.hidden = true; return; }
    const d = HERO_DEFS[hs.id];
    const placed = heroTower(state);
    if (heroCardFor !== hs.id) {
      heroCardFor = hs.id;
      heroCardIcon.replaceChildren(towerIcon(hs.id, d.color, 40));
      heroCard.style.setProperty("--tw", d.color);
    }
    setText(heroCardName, `${d.name} — ${d.title}`);
    setText(heroCardInfo, placed ? `Niveau ${placed.level} · sur le plateau (clic pour le voir)` : `${fmt(d.cost)} ⚡ · un seul par partie · touche H`);
    heroCard.classList.toggle("is-active", placing === hs.id);
    heroCard.classList.toggle("is-placed", !!placed);
    heroCard.disabled = !placed && status !== "running" && status !== "idle";
    heroBar.hidden = !placed;
    if (!placed) return;
    if (heroBarFor !== hs.id) { heroBarFor = hs.id; heroBarIcon.replaceChildren(towerIcon(hs.id, d.color, 34)); heroBar.style.setProperty("--tw", d.color); }
    const lvl = placed.level;
    const from = xpForLevel(lvl), to = xpForLevel(lvl + 1);
    setText(heroBarName, lvl >= HERO_MAX_LEVEL ? `${d.name} · niveau MAX` : `${d.name} · niveau ${lvl} · ${fmt(hs.xp - from)}/${fmt(to - from)} XP`);
    heroXpFill.style.width = `${lvl >= HERO_MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((hs.xp - from) / (to - from)) * 100))}%`;
    heroAbilityButtons.forEach((button, slot) => {
      const ab = ABILITIES[d.abilities[slot]];
      const need = HERO_ABILITY_LEVELS[slot];
      const cd = placed.heroCd[slot];
      setText(button.children[1], ab.name);
      setText(button.children[2], lvl < need ? `niveau ${need}` : cd > 0 ? `${Math.ceil(cd)} s` : "prête");
      button.title = `${ab.desc} (${slot ? "J" : "F"})`;
      button.disabled = lvl < need || cd > 0 || state.phase !== "wave" || status !== "running";
      button.classList.toggle("is-cd", lvl < need || cd > 0);
    });
  }

  function renderHeroPanel(tower, d) {
    const sig = `${tower.id}|${tower.level}`;
    if (sig === heroPanelSig) return;
    heroPanelSig = sig;
    heroPanel.replaceChildren(
      h("p", {}, d.desc),
      h("ul", { class: "hero-perks" },
        d.perks.filter(([, , name]) => name).map(([lvl, , name]) => h("li", { class: lvl <= tower.level ? "is-on" : "" }, h("span", {}, `Niv. ${lvl}`), name)),
        d.abilities.map((abId, slot) => {
          const ab = ABILITIES[abId];
          const need = HERO_ABILITY_LEVELS[slot];
          return h("li", { class: `is-ability${need <= tower.level ? " is-on" : ""}` }, h("span", {}, `Niv. ${need}`), `Capacité (${slot ? "J" : "F"}) : ${ab.name} — ${ab.desc}`);
        })));
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
    state = createState(wallet.data.towers, mapId, diffId, heroId, challenges);
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

  // Choix du héros : seulement entre deux parties. Un héros verrouillé se débloque avec des crédits.
  function onHero(id) {
    if (status === "running" || status === "paused") return;
    const d = HERO_DEFS[id];
    if (!wallet.data.heroes.includes(id)) {
      const price = d.unlock;
      if (!wallet.unlockHero(id, price)) { say(`Il faut ${fmt(price)} crédits pour débloquer ${d.name}.`); return; }
      say(`${d.name} débloqué !`);
    }
    heroId = id;
    try { localStorage.setItem("mc-td-hero", id); } catch { /* pas grave */ }
    resetState();
    if (status === "over") setStatus("idle");
    showOverlay("Pare-feu", `Héros : ${d.name}, ${d.title}. ${d.desc}`, "Commencer", false);
    updateHud();
    draw();
  }

  function onHeroCard() {
    if (!state.hero) return;
    const placed = heroTower(state);
    if (placed) { selectedId = placed.id; placing = null; }
    else { placing = placing === state.hero.id ? null : state.hero.id; selectedId = null; }
    updateHud();
    draw();
  }

  const HERO_REASONS = { none: "Pose d'abord ton héros.", level: "", idle: "Les capacités s'utilisent pendant une vague.", cd: "Capacité en recharge.", unknown: "Impossible." };
  function doHeroAbility(slot) {
    if (status !== "running") return;
    const r = useHeroAbility(state, slot);
    say(r.ok ? `${r.name} !` : r.reason === "level" ? `Débloquée au niveau ${r.level}.` : HERO_REASONS[r.reason]);
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
    // Cliquer SUR une tour la sélectionne toujours ; l'aimant agit quand on vise à côté d'une tour (la nouvelle vient s'y coller).
    const existing = towerAt(state, x, y);
    const spot = placing && !existing ? placeSpot(placing, x, y) : null;
    if (existing) {
      if (selectedId !== existing.id) { paragonConfirm = null; aimPicking = false; }
      selectedId = existing.id;
      placing = null;
    } else if (placing) {
      const result = placeTower(state, placing, spot ? spot.x : x, spot ? spot.y : y);
      if (!result.ok) say(REASONS[result.reason] || "Impossible.");
      else if (TOWER_DEFS[result.tower.type].hero) {
        placing = null;
        say(`${TOWER_DEFS[result.tower.type].name} entre en jeu (niveau ${result.tower.level}) !`);
      } else if (result.tower.aim) {
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
      else if (TOWER_DEFS[result.tower.type].spikes && path === 2 && result.tower.tiers[2] === 1) {
        aimPicking = true;
        say("Lance-pointes : clique sur le plateau (dans la portée) pour choisir où tombent les pointes.");
      }
    }
    updateHud();
    draw();
  }

  // Raccourci U : améliore le chemin le plus avancé de la tour (ou le premier chemin si elle est neuve).
  function doUpgradeMain() {
    const tower = state.towers.find((t) => t.id === selectedId);
    if (!tower) return;
    if (TOWER_DEFS[tower.type].hero) { say(REASONS.heroUp); return; }
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
    if (!tower || TOWER_DEFS[tower.type].hero) return;
    const info = paragonInfo(state, tower);
    if (info.is) {
      // Déjà paragon : G achète un totem de puissance
      const r = addTotem(state, tower.id);
      if (!r.ok) say(REASONS[r.reason] || "Pas assez d'énergie.");
      else say(r.up ? `Totem : degré ${r.degree} !` : `Totem : +${fmt(TOTEM_POWER)} de puissance.`);
      panelSig = "";
      updateHud();
      draw();
      return;
    }
    if (info.reason) { say(REASONS[info.reason] || "Pas assez d'énergie."); return; }
    if (paragonConfirm !== tower.id) {
      paragonConfirm = tower.id;
      say(`Confirme : ${info.sacrifice.length} tour${info.sacrifice.length > 1 ? "s" : ""} « ${TOWER_DEFS[tower.type].name} » seront sacrifiées.`);
      panelSig = "";
      updateHud();
      return;
    }
    paragonConfirm = null;
    const totems = Math.max(0, Math.min(paragonSteps, info.maxTotems, Math.floor((state.gold - info.cost) / info.totemCost)));
    const result = makeParagon(state, tower.id, totems);
    if (result.ok) say(`PARAGON ! ${PARAGONS[tower.type].name} — degré ${result.degree}`);
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

  const seenTypes = new Set();          // ennemis déjà vus dans la partie (pour présenter les nouveaux)
  function launchWave() {
    if (status !== "running" || !startWave(state)) return;
    const boss = state.spawnList.find((e) => ENEMY_DEFS[e.type].boss);
    const fresh = [...new Set(state.spawnList.map((e) => e.type))].find((t) => !seenTypes.has(t) && ENEMY_DEFS[t].info);
    for (const e of state.spawnList) seenTypes.add(e.type);
    if (boss) say(`BOSS : ${ENEMY_DEFS[boss.type].name} — ${ENEMY_DEFS[boss.type].power}`);
    else if (fresh) say(`Nouvel ennemi : ${ENEMY_DEFS[fresh].name} — ${ENEMY_DEFS[fresh].info}`);
    updateHud();
  }

  const POWER_REASONS = { idle: "Les pouvoirs s'utilisent pendant une vague.", cd: "Ce pouvoir se recharge.", gold: "Pas assez d'énergie.", unknown: "Impossible." };
  function doPower(id) {
    if (status !== "running") return;
    const r = usePower(state, id);
    say(r.ok ? `${r.name} !` : POWER_REASONS[r.reason]);
    updateHud();
    draw();
  }

  function onChallenge(id) {
    if (status === "running" || status === "paused") return;
    challenges = challenges.includes(id) ? challenges.filter((x) => x !== id) : [...challenges, id];
    try { localStorage.setItem("mc-td-challenges", JSON.stringify(challenges)); } catch { /* pas grave */ }
    resetState();
    if (status === "over") setStatus("idle");
    updateHud();
    draw();
  }

  function toggleAuto() {
    autoWave = !autoWave;
    autoClock = 0;
    try { localStorage.setItem("mc-td-auto", autoWave ? "1" : "0"); } catch { /* pas grave */ }
    say(autoWave ? "Vagues automatiques : la suivante part toute seule après chaque vague." : "Vagues automatiques désactivées.");
    updateHud();
  }

  function toggleRanges() {
    showRanges = !showRanges;
    updateHud();
    draw();
  }

  // Succès : vérifiés à chaque fin de vague et régulièrement pendant la partie.
  function checkAchievements() {
    for (const a of newAchievements(state, wallet.data.achievements)) {
      if (!wallet.unlockAchievement(a.id)) continue;
      wallet.addCredits(a.credits);
      say(`Succès : ${a.name} ! +${fmt(a.credits)} crédits`);
    }
  }

  function renderAchievements() {
    const owned = wallet.data.achievements;
    const got = TD_ACHIEVEMENTS.filter((a) => owned.includes(a.id)).length;
    const sig = `${got}`;
    if (sig === achSig) return;
    achSig = sig;
    achSummary.textContent = `Succès (${got}/${TD_ACHIEVEMENTS.length})`;
    achList.replaceChildren(...TD_ACHIEVEMENTS.map((a) => {
      const ok = owned.includes(a.id);
      return h("li", { class: ok ? "is-ok" : "" }, h("span", { class: "ach-mark", "aria-hidden": "true" }, ok ? "✓" : "○"),
        h("strong", {}, a.name), h("small", {}, `${a.text} · ${fmt(a.credits)} ¤`));
    }));
  }

  // Sauvegarde de la partie en cours : à chaque fin de vague (reprise possible après avoir fermé la page).
  function saveGame() {
    const snap = snapshot(state);
    if (!snap) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); } catch { /* pas grave */ }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* pas grave */ } }
  function readSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch { return null; } }
  function updateResumeButton() {
    const snap = readSave();
    const ok = !!snap && status !== "running" && status !== "paused";
    resumeButton.hidden = !ok;
    if (ok) {
      const m = MAPS.find((x) => x.id === snap.mapId);
      resumeButton.textContent = `Reprendre la partie (vague ${snap.wave}${m ? ` · ${m.name}` : ""})`;
    }
  }
  function resumeSaved() {
    const snap = readSave();
    const restored = restoreState(snap, wallet.data.towers);
    if (!restored) { clearSave(); updateResumeButton(); say("Sauvegarde illisible."); return; }
    closeRules(true);
    state = restored;
    mapId = snap.mapId;
    diffId = snap.diffId;
    if (snap.heroId) heroId = snap.heroId;
    challenges = snap.challenges || [];
    placing = null;
    selectedId = null;
    panelSig = "";
    setStatus("running");
    overlay.hidden = true;
    scrollToGame();
    say(`Partie reprise : vague ${state.wave} repoussée, lance la suivante quand tu es prêt.`);
    updateHud();
    startLoop();
  }

  function toggleMagnet() {
    magnet = !magnet;
    try { localStorage.setItem("mc-td-magnet", magnet ? "1" : "0"); } catch { /* pas grave */ }
    say(magnet ? "Aimant activé : les tours se collent les unes aux autres." : "Aimant désactivé : placement libre.");
    updateHud();
    draw();
  }

  // Où la tour en cours de pose irait vraiment (aimant compris) : { x, y, snapped } ou null.
  function placeSpot(type, x, y) {
    if (!magnet) return placeIssue(state, x, y, type) ? null : { x, y, snapped: false };
    return snapPlacement(state, type, x, y);
  }

  function toggleSpeed() {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    updateHud();
  }

  function startGame() {
    closeRules(true);
    clearSave();
    resetState();
    placing = state.unlocked.includes("laser") ? "laser" : null;
    setStatus("running");
    overlay.hidden = true;
    scrollToGame();
    updateHud();
    draw();
    startLoop();
  }

  // Au lancement : on cale le jeu (compteurs en haut, plateau, panneau) juste sous ce qui reste collé en haut de l'écran
  // (en-tête du site, barre du portefeuille sur PC), pour jouer sans faire défiler la page.
  function scrollToGame() {
    let offset = 0;
    for (const el of document.querySelectorAll("header, .wallet-bar")) {
      const pos = getComputedStyle(el).position;
      if (pos === "sticky" || pos === "fixed") offset = Math.max(offset, el.getBoundingClientRect().bottom);
    }
    const top = layout.getBoundingClientRect().top + window.scrollY - offset - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
    clearSave();
    checkAchievements();
    const credits = state.creditsEarned ? ` · +${fmt(state.creditsEarned)} crédits` : "";
    // Récap : les tours qui ont fait le plus de dégâts
    const best = [...state.towers].filter((t) => t.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 3)
      .map((t) => `${t.paragon ? PARAGONS[t.type].name : TOWER_DEFS[t.type].name} ${fmtBig(t.dmg)}`);
    showOverlay("Réseau compromis",
      `${fmt(reached)} vague${reached > 1 ? "s" : ""} repoussée${reached > 1 ? "s" : ""}${credits}${record && reached > 0 ? " — nouveau record !" : ""}` +
      ` · ${fmt(state.kills)} éliminations${best.length ? ` · Meilleures tours : ${best.join(", ")}` : ""}`,
      "Rejouer");
  }

  function fmtBig(n) {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e4 ? `${fmt(Math.round(n / 1000))} k` : fmt(Math.round(n));
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
      if (state.alerts.length) say(state.alerts.splice(0).pop());

      if (events.credits > 0) {
        // Crédits de base + pourcentage de la fortune actuelle (le coefficient de la difficulté s'applique aux deux).
        const total = events.credits + wealthBonus(wallet.credits, wavePct(state.map.reward * state.diff.reward));
        state.creditsEarned += total - events.credits;
        wallet.addCredits(total);
        say(`Vague ${state.wave} repoussée : +${fmt(total)} crédits, +${fmt(waveBonusGold(state.wave) + (events.mined || 0))} énergie${events.mined ? ` (dont ${fmt(events.mined)} minés)` : ""}.`);
        checkAchievements();
        saveGame();
        autoClock = 0;
      }
      if (events.over) { finish(); return; }
      if (steps % 8 === 0 && performance.now() - t0 > 14) break;
    }
    if (acc >= STEP) acc = 0;     // retard trop grand : on l'abandonne plutôt que d'accélérer ensuite
    // Vagues automatiques : la suivante part 1,5 s (de jeu) après la fin de la précédente
    if (status === "running" && autoWave && state.phase === "idle" && state.wave >= 1) {
      autoClock += dt * speed;
      if (autoClock >= 1.5) { autoClock = 0; launchWave(); }
    }
    achClock += dt;
    if (achClock >= 1 && status === "running") { achClock = 0; checkAchievements(); }

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
    if (key === "x") toggleMagnet();
    const pw = POWERS.find((x) => x.key === key);
    if (pw) doPower(pw.id);
    if (key === "h") onHeroCard();
    if (key === "z") fireFirstReady();
    if (key === "n") toggleAuto();
    if (key === "o") toggleRanges();
    if (key === "f") doHeroAbility(0);
    if (key === "j") doHeroAbility(1);
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
