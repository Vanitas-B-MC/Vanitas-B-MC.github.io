// js/ui-race.js — interface des Courses d'IA (la logique est dans race.js).
// On parie des crédits sur la victoire ou le podium d'un ou plusieurs robots, puis on regarde la course.
//
// Les mises sont retirées du portefeuille au moment du pari. Le résultat de la course est tiré au lancement :
// l'animation ne fait que le montrer, et les gains sont versés à l'arrivée (ou tout de suite si on quitte le jeu).

import {
  TRACK, DT, MIN_BET, MAX_BETS, KINDS, makeRoster, simulate, oddsFor, resolve
} from "./race.js";
import { h, fmt, prefersReducedMotion } from "./ui.js";

const CHIPS = [10, 50, 100, 500, 5000];
const LANE_COLORS = ["#ff2a6d", "#00f0ff", "#fcee0a", "#b266ff", "#3dff8f", "#ff8a1f"];
const COUNTDOWN_MS = 700;
const STAT_LABELS = [["speed", "Vitesse"], ["stamina", "Endurance"], ["steady", "Régularité"], ["burst", "Sprint"]];

const fmtOdds = (x) => `×${x.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const fmtSec = (s) => `${s.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
const statValue = (r, key) => (key === "speed" ? (r.speed - 0.95) / 0.1 : r[key]);

export function createRaceUI(root, wallet) {
  let roster = makeRoster();
  let odds = oddsFor(roster);
  let bets = [];                       // { racer, kind, amount, odds }
  let phase = "betting";               // betting → countdown → racing → done
  let bet = MIN_BET;
  let pending = null;                  // { sim, result } de la course en cours, tant que les gains ne sont pas versés
  let raf = 0;
  let timers = [];
  let active = false;
  const winners = [];                  // vainqueurs des dernières courses
  const stats = { races: 0, staked: 0, net: 0 };

  /* ---------- Squelette (créé une seule fois) ---------- */

  const messageEl = h("p", { class: "rc-message", role: "status", "aria-live": "polite" },
    "Choisis un robot et un type de pari, puis lance la course.");
  const statsEl = h("p", { class: "rc-stats", id: "rc-stats" });
  const historyEl = h("p", { class: "rc-history" });

  const betValue = h("strong", { id: "rc-bet" }, fmt(bet));
  const betInput = h("input", {
    class: "bet-input", id: "rc-bet-input", type: "text", inputmode: "numeric", autocomplete: "off",
    pattern: "[0-9 ]*", "aria-label": "Mise exacte en crédits", placeholder: "Somme"
  });
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${fmt(value)}`));
  const halfButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(Math.floor(bet / 2)) }, "½");
  const twiceButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(bet * 2) }, "×2");
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  const startButton = h("button", { class: "button button-primary", type: "button", id: "rc-start", onclick: () => startRace() }, "Lancer la course");
  const nextButton = h("button", { class: "button button-secondary", type: "button", id: "rc-next", hidden: true, onclick: () => nextRace() }, "Nouvelle course");

  const oddsBody = h("tbody");
  const slipEl = h("ul", { class: "rc-slip", "aria-label": "Ton ticket de paris" });
  const lanesEl = h("div", { class: "rc-track chamfer", "aria-hidden": "true" });
  const resultsEl = h("ol", { class: "rc-results", "aria-label": "Classement" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "6 robots, 100 mètres. Parie sur la victoire (le robot gagne) ou sur le podium (il finit dans les 3 premiers). ",
      "Les cotes viennent de milliers de courses simulées : un favori paie peu, un outsider paie gros. ",
      `Tu peux placer jusqu'à ${MAX_BETS} paris par course ; chaque pari utilise la mise choisie.`),
    lanesEl,
    messageEl,
    resultsEl,
    h("div", { class: "rc-layout" },
      h("div", { class: "rc-odds-wrap" },
        h("table", { class: "rc-odds" },
          h("thead", {}, h("tr", {},
            h("th", { scope: "col" }, "Robot"),
            h("th", { scope: "col" }, "Forme"),
            h("th", { scope: "col" }, "Victoire"),
            h("th", { scope: "col" }, "Podium"))),
          oddsBody)),
      h("div", { class: "rc-side bj-bet" },
        h("p", { class: "bet-line" }, "Mise par pari : ", betValue, " crédits"),
        h("label", { class: "bet-field" }, h("span", {}, "Saisir une somme"), betInput),
        h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" },
          chipButtons, halfButton, twiceButton, allInButton, clearButton),
        h("p", { class: "bet-line rc-slip-title" }, "Ton ticket"),
        slipEl,
        h("div", { class: "rc-actions" }, startButton, nextButton),
        hint,
        statsEl,
        historyEl
      )
    )
  );

  /* ---------- Piste et tableau des cotes ---------- */

  let runners = [];

  function buildTrack() {
    runners = roster.map((r, i) => {
      const dot = h("span", { class: "rc-runner", style: `--lane:${LANE_COLORS[i]}` });
      const lane = h("div", { class: "rc-lane" },
        h("span", { class: "rc-lane-name", style: `color:${LANE_COLORS[i]}` }, `${i + 1} · ${r.name}`),
        h("div", { class: "rc-lane-run" }, dot));
      return { lane, dot };
    });
    lanesEl.replaceChildren(...runners.map((x) => x.lane), h("span", { class: "rc-finish" }));
    placeRunners(null);
  }

  // positions : tableau de mètres, ou null pour la ligne de départ.
  function placeRunners(positions) {
    runners.forEach((x, i) => { x.dot.style.left = `${positions ? (positions[i] / TRACK) * 100 : 0}%`; });
  }

  let oddsButtons = [];   // { win, podium }

  function buildOdds() {
    oddsButtons = [];
    oddsBody.replaceChildren(...roster.map((r, i) => {
      const bars = STAT_LABELS.map(([key, label]) => {
        const pct = Math.round(Math.max(0, Math.min(1, statValue(r, key))) * 100);
        return h("span", { class: "rc-stat", role: "img", "aria-label": `${label} ${pct} %`, title: `${label} ${pct} %` },
          h("i", { style: `width:${pct}%` }));
      });
      const buttons = {};
      for (const kind of Object.keys(KINDS)) {
        buttons[kind] = h("button", {
          class: "button button-secondary rc-odd", type: "button",
          title: `${KINDS[kind].label} · ${r.name}`, "aria-label": `Parier sur ${KINDS[kind].label.toLowerCase()} de ${r.name}, cote ${fmtOdds(odds[i][kind])}`,
          onclick: () => placeBet(i, kind)
        }, fmtOdds(odds[i][kind]));
      }
      oddsButtons.push(buttons);
      return h("tr", {},
        h("th", { scope: "row", style: `color:${LANE_COLORS[i]}` }, `${i + 1} · ${r.name}`),
        h("td", {}, h("span", { class: "rc-stats-cell" }, bars)),
        h("td", {}, buttons.win),
        h("td", {}, buttons.podium));
    }));
  }

  /* ---------- Mise et ticket ---------- */

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

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function placeBet(racer, kind) {
    if (phase !== "betting") return;
    if (bets.length >= MAX_BETS) { say(`Ton ticket est plein (${MAX_BETS} paris).`, "lose"); return; }
    const amount = bet;                                  // figé avant de payer
    if (amount < MIN_BET) { say(`La mise minimale est de ${MIN_BET} crédits.`, "lose"); return; }
    if (!wallet.spendCredits(amount)) { say("Pas assez de crédits pour cette mise.", "lose"); return; }
    bets.push({ racer, kind, amount, odds: odds[racer][kind] });
    say(`Pari ajouté : ${KINDS[kind].label.toLowerCase()} de ${roster[racer].name}, ${fmt(amount)} crédits.`);
    renderSlip();
    updateControls();
  }

  function removeBet(index) {
    if (phase !== "betting") return;
    const [removed] = bets.splice(index, 1);
    if (removed) wallet.addCredits(removed.amount);       // mise remboursée
    renderSlip();
    updateControls();
  }

  function renderSlip(result = null) {
    if (!bets.length) {
      slipEl.replaceChildren(h("li", { class: "rc-slip-empty" }, "Aucun pari."));
      return;
    }
    slipEl.replaceChildren(...bets.map((b, i) => {
      const line = result?.lines[i];
      const label = `${KINDS[b.kind].label} · ${roster[b.racer].name} · ${fmt(b.amount)} à ${fmtOdds(b.odds)}`;
      if (line) {
        return h("li", { class: `rc-slip-line ${line.win ? "is-win" : "is-lose"}` },
          label, " — ", line.win ? `+${fmt(line.back - b.amount)}` : `−${fmt(b.amount)}`);
      }
      return h("li", { class: "rc-slip-line" }, label,
        h("button", { class: "link-button", type: "button", onclick: () => removeBet(i), "aria-label": `Retirer le pari ${label}` }, "Retirer"));
    }));
  }

  function updateControls() {
    const credits = wallet.credits;
    const betting = phase === "betting";
    if (betting && bet > credits) { bet = credits; betInput.value = bet ? String(bet) : ""; }
    betValue.textContent = fmt(bet);

    chipButtons.forEach((button, i) => { button.disabled = !betting || bet + CHIPS[i] > credits; });
    halfButton.disabled = !betting || bet < 2;
    twiceButton.disabled = !betting || bet === 0 || bet * 2 > credits;
    allInButton.disabled = !betting || credits < MIN_BET || bet === credits;
    clearButton.disabled = !betting || bet === 0;
    betInput.disabled = !betting;
    for (const b of oddsButtons) for (const button of Object.values(b)) button.disabled = !betting || bet < MIN_BET || bet > credits || bets.length >= MAX_BETS;

    startButton.disabled = !betting || bets.length === 0;
    startButton.hidden = phase === "done";
    nextButton.hidden = phase !== "done";
    hint.hidden = !betting || credits >= MIN_BET || bets.length > 0;
  }

  function renderStats() {
    statsEl.textContent = stats.races
      ? `${stats.races} course${stats.races > 1 ? "s" : ""} · misé ${fmt(stats.staked)} · net ${stats.net > 0 ? "+" : ""}${fmt(stats.net)}`
      : "";
    historyEl.textContent = winners.length ? `Derniers vainqueurs : ${winners.join(" · ")}` : "";
  }

  /* ---------- Course ---------- */

  const later = (fn, ms) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach((t) => window.clearTimeout(t)); timers = []; window.cancelAnimationFrame(raf); raf = 0; };

  function startRace() {
    if (phase !== "betting" || !bets.length) return;
    const sim = simulate(roster);
    pending = { sim, result: resolve(bets, sim.order) };     // tout est tiré maintenant ; on montre ensuite
    resultsEl.replaceChildren();
    updateControls();

    if (prefersReducedMotion()) { phase = "racing"; updateControls(); later(finishRace, 400); return; }

    phase = "countdown";
    updateControls();
    placeRunners(null);
    ["3…", "2…", "1…", "Partez !"].forEach((text, k) => later(() => say(text), k * COUNTDOWN_MS));
    later(() => {
      phase = "racing";
      const start = performance.now();
      const frames = pending.sim.frames;
      const frame = (now) => {
        const t = (now - start) / 1000 / DT;
        const k = Math.min(Math.floor(t), frames.length - 1);
        const next = frames[Math.min(k + 1, frames.length - 1)];
        const mix = Math.min(t - k, 1);
        placeRunners(frames[k].map((p, i) => p + (next[i] - p) * mix));
        if (k >= frames.length - 1) { raf = 0; finishRace(); return; }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, 4 * COUNTDOWN_MS);
  }

  // Classement, gains versés, ticket mis à jour. Appelé à l'arrivée, ou tout de suite si on quitte le jeu.
  function finishRace() {
    if (!pending) return;
    clearTimers();
    const { sim, result } = pending;
    pending = null;
    phase = "done";
    placeRunners(sim.frames.at(-1));

    if (result.returned > 0) wallet.addCredits(result.returned);
    stats.races += 1;
    stats.staked += result.staked;
    stats.net += result.net;
    winners.unshift(roster[sim.order[0]].name);
    winners.length = Math.min(winners.length, 5);

    resultsEl.replaceChildren(...sim.order.map((i, rank) =>
      h("li", { class: rank === 0 ? "is-first" : "", style: `color:${LANE_COLORS[i]}` },
        `${roster[i].name} — ${fmtSec(sim.finish[i])}`)));
    renderSlip(result);

    const winner = roster[sim.order[0]].name;
    if (result.net > 0) say(`${winner} gagne ! Tu empoches +${fmt(result.net)} crédits.`, "win");
    else if (result.net === 0) say(`${winner} gagne. Mises rendues.`, "push");
    else say(`${winner} gagne. Tu perds ${fmt(-result.net)} crédits.`, "lose");

    renderStats();
    updateControls();
    if (active) nextButton.focus({ preventScroll: true });
  }

  function nextRace() {
    if (phase !== "done") return;
    roster = makeRoster();
    odds = oddsFor(roster);
    bets = [];
    phase = "betting";
    resultsEl.replaceChildren();
    buildTrack();
    buildOdds();
    renderSlip();
    say("Nouvelle course : les formes et les cotes ont changé.");
    updateControls();
    if (active) startButton.focus({ preventScroll: true });
  }

  window.addEventListener("pagehide", finishRace);
  wallet.subscribe(() => { if (active) updateControls(); });

  buildTrack();
  buildOdds();
  renderSlip();
  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; finishRace(); }
  };
}
