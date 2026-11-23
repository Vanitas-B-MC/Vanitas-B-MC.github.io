// js/ui-crash.js — interface du Crash (la logique est dans crash.js).
//
// La mise est retirée au décollage ; on encaisse en cliquant, ou automatiquement à la cible choisie (facultative).
// Le point de crash est tiré au décollage : l'animation ne fait que le montrer. Après un encaissement, la courbe
// continue jusqu'au crash pour montrer jusqu'où elle serait montée (« Passer » saute à la fin).
// Si on quitte le jeu en pleine manche, la manche est réglée tout de suite : encaissement au multiplicateur du moment.

import {
  MIN_BET, MIN_TARGET, crashPoint, multiplierAt, timeAt, payout, parseTarget, autoResult, manualResult, tier, fmtMult
} from "./crash.js";
import { h, fmt, themeColor } from "./ui.js";

const CHIPS = [10, 50, 100, 500, 5000];
const W = 720;
const H = 340;
const PAD = { left: 52, right: 14, top: 14, bottom: 26 };

export function createCrashUI(root, wallet) {
  let bet = MIN_BET;
  let phase = "idle";                 // idle → running → ended
  let round = null;                   // { bet, crash, tc, target, start, cashed }
  let raf = 0;
  let active = false;
  const history = [];
  const stats = { rounds: 0, staked: 0, net: 0, best: 0 };
  let colors = readColors();
  let last = { t: 0, m: 1 };          // dernier état dessiné (pour redessiner après un changement de thème)

  function readColors() {
    return {
      line: themeColor("--cyan", "#00f0ff"),
      win: themeColor("--yellow", "#fcee0a"),
      lose: themeColor("--pink", "#ff2a6d"),
      grid: themeColor("--line-strong", "#3f3f5c"),
      text: themeColor("--muted", "#a3a3bb")
    };
  }

  /* ---------- Squelette ---------- */

  const canvas = h("canvas", { class: "cr-canvas", "aria-hidden": "true" });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const multEl = h("div", { class: "cr-multiplier", "data-state": "idle" }, "×1,00");
  const messageEl = h("p", { class: "cr-message", role: "status", "aria-live": "polite" },
    "Choisis ta mise, puis décolle. Encaisse avant le crash !");
  const statsEl = h("p", { class: "cr-stats", id: "cr-stats" });
  const historyEl = h("ol", { class: "cr-history", "aria-label": "Derniers points de crash" });

  const betValue = h("strong", { id: "cr-bet" }, fmt(bet));
  const betInput = h("input", {
    class: "bet-input", id: "cr-bet-input", type: "text", inputmode: "numeric", autocomplete: "off",
    pattern: "[0-9 ]*", "aria-label": "Mise exacte en crédits", placeholder: "Somme"
  });
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${fmt(value)}`));
  const halfButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(Math.floor(bet / 2)) }, "½");
  const twiceButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(bet * 2) }, "×2");
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");
  const targetInput = h("input", {
    class: "bet-input", id: "cr-target", type: "text", inputmode: "decimal", autocomplete: "off",
    "aria-label": "Encaissement automatique, multiplicateur", placeholder: "ex. 2,00"
  });
  const actionButton = h("button", { class: "button button-primary cr-action", type: "button", id: "cr-action", onclick: onAction }, "Miser et décoller");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Un multiplicateur monte de plus en plus vite, puis s'effondre à un moment imprévisible. ",
      "Encaisse avant : tu gagnes ta mise × le multiplicateur. Sinon, tu perds ta mise. ",
      `Tu peux fixer un encaissement automatique (à partir de ×${MIN_TARGET.toLocaleString("fr-FR")}) : plus il est haut, plus il est rare.`),
    h("div", { class: "cr-layout" },
      h("div", { class: "cr-board chamfer" }, canvas, multEl),
      h("div", { class: "cr-side bj-bet" },
        messageEl,
        h("p", { class: "bet-line" }, "Mise : ", betValue, " crédits"),
        h("label", { class: "bet-field" }, h("span", {}, "Saisir une somme"), betInput),
        h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" },
          chipButtons, halfButton, twiceButton, allInButton, clearButton),
        h("label", { class: "bet-field cr-target-field" }, h("span", {}, "Encaissement automatique (facultatif)"), targetInput),
        h("div", { class: "cr-actions" }, actionButton),
        hint,
        statsEl,
        historyEl
      )
    )
  );

  /* ---------- Dessin ---------- */

  function draw(t, m, state) {
    last = { t, m, state };
    ctx.clearRect(0, 0, W, H);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const tMax = Math.max(10, t * 1.12);
    const mMax = Math.max(2, m * 1.15);
    const x = (time) => PAD.left + (time / tMax) * plotW;
    const y = (mult) => PAD.top + plotH - ((mult - 1) / (mMax - 1)) * plotH;

    // Repères horizontaux : quelques multiplicateurs « ronds »
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (const mark of [1, 1.5, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 5000]) {
      if (mark > mMax) break;
      ctx.strokeStyle = colors.grid;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y(mark));
      ctx.lineTo(W - PAD.right, y(mark));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.text;
      ctx.fillText(`×${mark}`, PAD.left - 6, y(mark));
    }

    if (t <= 0) return;
    const color = state === "crashed" ? colors.lose : state === "cashed" ? colors.win : colors.line;
    const steps = 80;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const time = (t * i) / steps;
      const px = x(time);
      const py = y(Math.min(multiplierAt(time), m));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineTo(x(t), y(1));
    ctx.lineTo(x(0), y(1));
    ctx.closePath();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();                                   // tête de la courbe
    ctx.arc(x(t), y(m), 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ---------- Mise ---------- */

  function setBet(value) {
    bet = Math.max(0, Math.min(Math.floor(value) || 0, wallet.credits));
    betInput.value = bet ? String(bet) : "";
    updateControls();
  }
  betInput.addEventListener("input", () => {
    bet = Math.min(Number(betInput.value.replace(/\D/g, "")) || 0, wallet.credits);
    updateControls();
  });
  betInput.addEventListener("blur", () => { betInput.value = bet ? String(bet) : ""; });
  betInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); betInput.value = bet ? String(bet) : ""; if (phase !== "running") start(); }
  });
  targetInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); if (phase !== "running") start(); }
  });

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function updateControls() {
    const credits = wallet.credits;
    const running = phase === "running";
    if (!running && bet > credits) { bet = credits; betInput.value = bet ? String(bet) : ""; }
    betValue.textContent = fmt(bet);

    chipButtons.forEach((button, i) => { button.disabled = running || bet + CHIPS[i] > credits; });
    halfButton.disabled = running || bet < 2;
    twiceButton.disabled = running || bet === 0 || bet * 2 > credits;
    allInButton.disabled = running || credits < MIN_BET || bet === credits;
    clearButton.disabled = running || bet === 0;
    betInput.disabled = running;
    targetInput.disabled = running;

    if (!running) {
      actionButton.textContent = "Miser et décoller";
      actionButton.disabled = bet < MIN_BET || bet > credits;
    } else if (round.cashed === null) {
      actionButton.disabled = false;      // le libellé « Encaisser » est mis à jour à chaque image
    } else {
      actionButton.textContent = "Passer";
      actionButton.disabled = false;
    }
    hint.hidden = running || credits >= MIN_BET;
  }

  function renderStats() {
    statsEl.textContent = stats.rounds
      ? `${stats.rounds} manche${stats.rounds > 1 ? "s" : ""} · misé ${fmt(stats.staked)} · net ${stats.net > 0 ? "+" : ""}${fmt(stats.net)} · meilleur encaissement ${fmtMult(stats.best)}`
      : "";
    historyEl.replaceChildren(...history.map((p) => h("li", { class: `cr-pill is-${tier(p)}` }, fmtMult(p))));
  }

  /* ---------- Manche ---------- */

  function onAction() {
    if (phase !== "running") { start(); return; }
    if (round.cashed === null) cashOut(manualResult(round.crash, (performance.now() - round.start) / 1000));
    else skip();
  }

  function start() {
    if (phase === "running") return;
    if (bet < MIN_BET) { say(`La mise minimale est de ${MIN_BET} crédits.`, "lose"); return; }
    const raw = targetInput.value.trim();
    const target = raw ? parseTarget(raw) : null;
    if (raw && target === null) { say(`Encaissement automatique invalide : saisis un multiplicateur d'au moins ${MIN_TARGET.toLocaleString("fr-FR")}.`, "lose"); return; }
    const stake = bet;                                   // figé avant de payer
    if (!wallet.spendCredits(stake)) { say("Pas assez de crédits pour cette mise.", "lose"); return; }

    const crash = crashPoint();
    round = { bet: stake, crash, tc: timeAt(crash), target, start: performance.now(), cashed: null };
    phase = "running";
    multEl.dataset.state = "running";
    actionButton.textContent = "Encaisser";
    say(target ? `Décollage ! Encaissement automatique à ${fmtMult(target)}.` : "Décollage ! Encaisse avant le crash.");
    updateControls();
    raf = requestAnimationFrame(frame);
  }

  // Encaisse au résultat donné (de manualResult ou autoResult). Si c'est un échec, rien n'est versé.
  function cashOut(result) {
    if (!result.cashed || round.cashed !== null) return;
    const won = payout(round.bet, result.mult);
    wallet.addCredits(won);
    round.cashed = { mult: result.mult, won };
    multEl.dataset.state = "cashed";
    say(`Encaissé à ${fmtMult(result.mult)} : +${fmt(won - round.bet)} crédits !`, won > round.bet ? "win" : "push");
    updateControls();
  }

  function frame(now) {
    raf = 0;
    if (!round) return;                 // image restée en file après la fin de manche
    const t = (now - round.start) / 1000;
    if (round.cashed === null && round.target !== null && autoResult(round.crash, round.target) && t >= timeAt(round.target)) {
      cashOut(autoResult(round.crash, round.target));
    }
    if (t >= round.tc) { end(); return; }
    const m = Math.min(multiplierAt(t), round.crash);
    multEl.textContent = fmtMult(m);
    draw(t, m, round.cashed ? "cashed" : "running");
    if (round.cashed === null) {
      const won = payout(round.bet, m);
      actionButton.textContent = `Encaisser · ${fmt(won)} crédits`;
    }
    raf = requestAnimationFrame(frame);
  }

  // Fin de manche : le crash est montré, les compteurs mis à jour.
  function end() {
    window.cancelAnimationFrame(raf);
    raf = 0;
    const { crash } = round;
    const cashed = round.cashed;
    phase = "ended";
    multEl.textContent = fmtMult(crash);
    multEl.dataset.state = "crashed";
    draw(round.tc, crash, "crashed");

    stats.rounds += 1;
    stats.staked += round.bet;
    stats.net += (cashed ? cashed.won : 0) - round.bet;
    if (cashed) stats.best = Math.max(stats.best, cashed.mult);
    history.unshift(crash);
    history.length = Math.min(history.length, 14);

    if (cashed) say(`Encaissé à ${fmtMult(cashed.mult)} (+${fmt(cashed.won - round.bet)} crédits). Le crash était à ${fmtMult(crash)}.`, cashed.won > round.bet ? "win" : "push");
    else say(`CRASH à ${fmtMult(crash)} ! Tu perds ${fmt(round.bet)} crédits.`, "lose");
    round = null;
    renderStats();
    updateControls();
    if (active) actionButton.focus({ preventScroll: true });
  }

  function skip() {
    if (phase === "running") end();
  }

  // Quitter le jeu en pleine manche : on règle tout de suite, comme un encaissement au multiplicateur du moment.
  function settle() {
    if (phase !== "running") return;
    if (round.cashed === null) cashOut(manualResult(round.crash, (performance.now() - round.start) / 1000));
    end();
  }

  window.addEventListener("pagehide", settle);
  window.addEventListener("mc-theme", () => { colors = readColors(); draw(last.t, last.m, last.state); });
  wallet.subscribe(() => { if (active) updateControls(); });

  renderStats();
  draw(0, 1, "idle");
  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; settle(); }
  };
}
