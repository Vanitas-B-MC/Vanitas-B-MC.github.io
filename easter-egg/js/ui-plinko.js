// js/ui-plinko.js — interface du Plinko (la logique est dans plinko.js).
// On mise des crédits : par jetons, ou en tapant une somme exacte. Chaque bille lâchée coûte la mise.
//
// La mise est retirée du portefeuille quand on lâche la bille, et le gain est versé à son arrivée.
// Le slot est tiré au moment du lâcher (le chemin est connu d'avance) : l'animation ne fait que le montrer.
// Si on quitte le jeu ou la page pendant qu'il reste des billes, tous les gains sont versés tout de suite.

import {
  SLOTS, ROWS, MIN_BET, MAX_BALLS, RISKS, RISK_IDS, multipliers, dropPath, slotOf, payout, fmtMult, tier
} from "./plinko.js";
import { h, fmt, fmtShort, prefersReducedMotion, themeColor } from "./ui.js";

const CHIPS = [10, 50, 100, 500, 5000];

// Plateau (repère logique du canvas ; le CSS l'adapte à la largeur de l'écran)
const W = 720;
const H = 560;
const TOP = 34;
const PEG_BOTTOM = H - 40;
const SP = W / SLOTS;                          // 30 : écart entre deux picots = largeur d'un slot
const ROW_H = (PEG_BOTTOM - TOP) / (ROWS - 1);
const PEG_R = 3;
const BALL_R = 7;
const CONTACT = PEG_R + BALL_R;

const DROP_MS = 170;                           // chute jusqu'au premier picot
const ROW_MS = 90;                             // une rangée de picots
const TOTAL_MS = DROP_MS + ROWS * ROW_MS;
const AUTO_MS = 650;                           // délai entre deux billes en mode Auto

const pegX = (row, index) => W / 2 + (index - row / 2) * SP;
const pegY = (row) => TOP + row * ROW_H;

// Points de passage d'une bille : au-dessus du 1er picot, puis au-dessus de chaque picot touché, puis dans le slot.
function waypoints(path) {
  const pts = [{ x: W / 2, y: pegY(0) - CONTACT - 30 }, { x: W / 2, y: pegY(0) - CONTACT }];
  let rights = 0;
  for (let r = 0; r < ROWS; r++) {
    rights += path[r];
    pts.push({
      x: W / 2 + (rights - (r + 1) / 2) * SP,
      y: r + 1 < ROWS ? pegY(r + 1) - CONTACT : H - 14
    });
  }
  return pts;
}

export function createPlinkoUI(root, wallet) {
  let risk = "medium";
  let mults = multipliers(risk);
  let bet = MIN_BET;
  let active = false;
  let autoTimer = 0;
  let raf = 0;
  const balls = [];                            // billes en vol
  const glow = new Map();                      // picots touchés récemment : "rangée:indice" -> instant
  const history = [];
  const stats = { drops: 0, staked: 0, net: 0, best: 0 };
  let colors = readColors();

  function readColors() {
    return {
      peg: themeColor("--muted", "#8a8aa0"),
      pegHit: themeColor("--cyan", "#00f0ff"),
      ball: themeColor("--yellow", "#fcee0a")
    };
  }

  /* ---------- Squelette (créé une seule fois) ---------- */

  const canvas = h("canvas", { class: "pl-canvas", "aria-label": "Plateau de Plinko" });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const slotEls = Array.from({ length: SLOTS }, () => h("li", { class: "pl-slot" }));
  const slotsEl = h("ol", { class: "pl-slots", "aria-label": "Multiplicateurs des 24 slots" }, slotEls);

  const messageEl = h("p", { class: "pl-message", role: "status", "aria-live": "polite" },
    "Choisis ta mise, puis lâche une bille.");
  const statsEl = h("p", { class: "pl-stats", id: "pl-stats" });
  const historyEl = h("ol", { class: "pl-history", "aria-label": "Derniers multiplicateurs" });

  const betValue = h("strong", { id: "pl-bet" }, fmt(bet));
  const betInput = h("input", {
    class: "bet-input", id: "pl-bet-input", type: "text", inputmode: "numeric", autocomplete: "off",
    pattern: "[0-9 ]*", "aria-label": "Mise exacte en crédits", placeholder: "Somme"
  });
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${fmt(value)}`));
  const halfButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(Math.floor(bet / 2)) }, "½");
  const twiceButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(bet * 2) }, "×2");
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");

  const riskButtons = RISK_IDS.map((id) =>
    h("button", {
      class: "chip chip-ghost", type: "button", "aria-pressed": String(id === risk),
      title: `Risque ${RISKS[id].label.toLowerCase()} : plus il monte, plus les bords paient et plus le centre perd`,
      onclick: () => setRisk(id)
    }, RISKS[id].label));

  const dropButton = h("button", { class: "button button-primary", type: "button", id: "pl-drop", onclick: () => drop() }, "Lâcher la bille");
  const autoButton = h("button", {
    class: "button button-secondary", type: "button", id: "pl-auto", "aria-pressed": "false",
    title: "Lâche une bille toute seule, jusqu'à ce que tu l'arrêtes ou que les crédits manquent", onclick: toggleAuto
  }, "Auto : off");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      `Lâche une bille : elle rebondit sur ${ROWS} rangées de picots et tombe dans l'un des ${SLOTS} slots. `,
      "Le centre est le plus probable mais paie peu ; les bords sont rarissimes et paient très gros. ",
      "Chaque bille coûte la mise, tu peux en lâcher plusieurs à la suite."),
    h("div", { class: "pl-layout" },
      h("div", { class: "pl-board chamfer" }, canvas, slotsEl),
      h("div", { class: "pl-side" },
        messageEl,
        h("div", { class: "bj-bet pl-bet" },
          h("p", { class: "bet-line" }, "Mise par bille : ", betValue, " crédits"),
          h("label", { class: "bet-field" }, h("span", {}, "Saisir une somme"), betInput),
          h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" },
            chipButtons, halfButton, twiceButton, allInButton, clearButton),
          h("p", { class: "bet-line pl-risk-label" }, "Risque"),
          h("div", { class: "chips", role: "group", "aria-label": "Niveau de risque" }, riskButtons),
          h("div", { class: "pl-actions" }, dropButton, autoButton),
          hint
        ),
        statsEl,
        historyEl
      )
    )
  );

  /* ---------- Dessin ---------- */

  function draw(now = performance.now()) {
    ctx.clearRect(0, 0, W, H);

    for (let r = 0; r < ROWS; r++) {
      for (let j = 0; j <= r; j++) {
        const age = now - (glow.get(`${r}:${j}`) ?? -1e9);
        const lit = age < 260;
        ctx.beginPath();
        ctx.arc(pegX(r, j), pegY(r), lit ? PEG_R + 1.5 : PEG_R, 0, Math.PI * 2);
        ctx.fillStyle = lit ? colors.pegHit : colors.peg;
        ctx.globalAlpha = lit ? 1 : 0.75;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const ball of balls) {
      const { x, y } = ballPosition(ball, now);
      ctx.save();
      ctx.shadowColor = colors.ball;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = colors.ball;
      ctx.fill();
      ctx.restore();
    }
  }

  // Position d'une bille : un segment par rangée, qui accélère puis « rebondit » sur le picot suivant.
  function ballPosition(ball, now) {
    const elapsed = Math.min(Math.max(now - ball.start, 0), TOTAL_MS - 1);
    const seg = elapsed < DROP_MS ? 0 : 1 + Math.floor((elapsed - DROP_MS) / ROW_MS);
    const u = seg === 0 ? elapsed / DROP_MS : (elapsed - DROP_MS - (seg - 1) * ROW_MS) / ROW_MS;
    const a = ball.points[seg];
    const b = ball.points[seg + 1];
    const hop = seg === 0 ? 0 : ROW_H * 0.28;
    return {
      seg,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * (0.35 * u + 0.65 * u * u) - hop * 4 * u * (1 - u)
    };
  }

  /* ---------- Mise ---------- */

  function setBet(value) {
    bet = Math.max(0, Math.min(Math.floor(value) || 0, wallet.credits));
    betInput.value = bet ? String(bet) : "";
    updateControls();
  }

  betInput.addEventListener("input", () => {
    const digits = betInput.value.replace(/\D/g, "");
    bet = Math.min(Number(digits) || 0, wallet.credits);
    updateControls();
  });
  betInput.addEventListener("blur", () => { betInput.value = bet ? String(bet) : ""; });
  betInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); betInput.value = bet ? String(bet) : ""; drop(); }
  });

  function setRisk(id) {
    if (balls.length || id === risk) return;     // pas de changement pendant qu'une bille tombe
    risk = id;
    mults = multipliers(risk);
    renderSlots();
    updateControls();
  }

  function renderSlots() {
    slotEls.forEach((el, i) => {
      el.textContent = fmtMult(mults[i]);
      el.className = `pl-slot is-${tier(mults[i])}`;
      el.title = `×${mults[i].toLocaleString("fr-FR")}`;
    });
  }

  // Boutons, jetons et compteurs mis à jour sur place (le solde change aussi pendant qu'on joue au Clicker).
  function updateControls() {
    const credits = wallet.credits;
    if (bet > credits) { bet = credits; betInput.value = bet ? String(bet) : ""; }
    betValue.textContent = fmt(bet);

    chipButtons.forEach((button, i) => { button.disabled = bet + CHIPS[i] > credits; });
    halfButton.disabled = bet < 2;
    twiceButton.disabled = bet === 0 || bet * 2 > credits;
    allInButton.disabled = credits < MIN_BET || bet === credits;
    clearButton.disabled = bet === 0;
    riskButtons.forEach((button, i) => {
      button.setAttribute("aria-pressed", String(RISK_IDS[i] === risk));
      button.disabled = balls.length > 0;
    });

    dropButton.disabled = bet < MIN_BET || bet > credits || balls.length >= MAX_BALLS;
    autoButton.disabled = !autoTimer && (bet < MIN_BET || bet > credits);
    hint.hidden = credits >= MIN_BET;
  }

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function renderStats() {
    if (!stats.drops) { statsEl.textContent = ""; return; }
    const net = `${stats.net > 0 ? "+" : ""}${fmtShort(stats.net)}`;
    statsEl.textContent = `${fmt(stats.drops)} bille${stats.drops > 1 ? "s" : ""} · misé ${fmtShort(stats.staked)} · net ${net} · meilleur ×${fmtMult(stats.best)}`;
  }

  function renderHistory() {
    historyEl.replaceChildren(...history.map((m) =>
      h("li", { class: `pl-pill is-${tier(m)}` }, `×${fmtMult(m)}`)));
  }

  /* ---------- Billes ---------- */

  function drop() {
    if (balls.length >= MAX_BALLS || bet < MIN_BET) return false;
    const stake = bet;                           // figé avant de payer : le solde peut changer entre-temps
    if (!wallet.spendCredits(stake)) {
      say("Pas assez de crédits pour cette mise.", "lose");
      stopAuto();
      return false;
    }

    const path = dropPath();
    const slot = slotOf(path);
    const now = performance.now();
    balls.push({
      stake,
      slot,
      mult: mults[slot],
      prefix: path.map((_, r) => slotOf(path.slice(0, r))),    // indice du picot touché à chaque rangée
      points: waypoints(path),
      // Mouvement réduit : la bille n'apparaît que juste avant d'arriver.
      start: prefersReducedMotion() ? now - TOTAL_MS + 250 : now
    });
    stats.drops += 1;
    stats.staked += stake;
    say("La bille tombe…");
    updateControls();
    if (!raf) raf = requestAnimationFrame(frame);
    return true;
  }

  // Une bille arrive : on verse le gain, on met à jour les compteurs.
  function land(ball) {
    const won = payout(ball.stake, ball.mult);
    if (won > 0) wallet.addCredits(won);
    const net = won - ball.stake;
    stats.net += net;
    stats.best = Math.max(stats.best, ball.mult);
    history.unshift(ball.mult);
    history.length = Math.min(history.length, 12);

    const text = `Slot ${ball.slot + 1} : ×${ball.mult.toLocaleString("fr-FR")}`;
    if (net > 0) say(`${text}. Gain : +${fmt(net)} crédits !`, "win");
    else if (net === 0) say(`${text}. Mise rendue.`, "push");
    else say(`${text}. Perdu : ${fmt(-net)} crédits.`, "lose");

    const el = slotEls[ball.slot];
    el.classList.remove("is-hit");
    void el.offsetWidth;
    el.classList.add("is-hit");

    renderStats();
    renderHistory();
  }

  function frame(now) {
    raf = 0;
    let landed = false;
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (now - ball.start >= TOTAL_MS) {
        balls.splice(i, 1);
        land(ball);
        landed = true;
        continue;
      }
      const { seg } = ballPosition(ball, now);
      if (seg >= 1) glow.set(`${seg - 1}:${ball.prefix[seg - 1]}`, now);
    }
    draw(now);
    if (landed) updateControls();
    if (balls.length || now - Math.max(0, ...glow.values()) < 300) raf = requestAnimationFrame(frame);
    else glow.clear();
  }

  // Verse tout de suite les gains des billes encore en vol (changement de jeu ou fermeture de la page).
  function settleAll() {
    if (!balls.length) return;
    while (balls.length) land(balls.pop());
    draw();
    updateControls();
  }

  /* ---------- Mode Auto ---------- */

  function stopAuto() {
    if (!autoTimer) return;
    window.clearInterval(autoTimer);
    autoTimer = 0;
    autoButton.setAttribute("aria-pressed", "false");
    autoButton.textContent = "Auto : off";
    updateControls();
  }

  function toggleAuto() {
    if (autoTimer) { stopAuto(); return; }
    if (bet < MIN_BET || bet > wallet.credits) return;
    autoButton.setAttribute("aria-pressed", "true");
    autoButton.textContent = "Auto : on";
    drop();
    autoTimer = window.setInterval(() => {
      if (!active || bet < MIN_BET || bet > wallet.credits) { stopAuto(); return; }
      drop();
    }, AUTO_MS);
    updateControls();
  }

  window.addEventListener("pagehide", () => { stopAuto(); settleAll(); });
  window.addEventListener("mc-theme", () => { colors = readColors(); draw(); });
  wallet.subscribe(() => { if (active) updateControls(); });

  renderSlots();
  draw();
  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; stopAuto(); settleAll(); }
  };
}
