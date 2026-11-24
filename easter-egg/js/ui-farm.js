// js/ui-farm.js — interface de « Pêche & Ferme » (la logique est dans farm.js, les dessins dans farm-art.js).
//
// Pêche (façon « Fisch ») : 1) maintiens le bouton pour charger le lancer et relâche au sommet (lancer parfait = touche plus
// rapide et poissons plus rares) ; 2) attends la touche et ferre ; 3) combat : maintiens pour monter la zone et garde le poisson
// dedans jusqu'à remplir la jauge. Poisson rare = poisson nerveux.
// Ferme : chaque plante se dessine en 3 stades (jeune pousse, croissance, presque mûre) puis brille quand elle est prête.
//
// Tout est payé et gagné en crédits ; la progression est enregistrée dans le portefeuille. Les cultures et le filet continuent
// de travailler page fermée (8 h au plus). Les éléments sont créés une fois puis mis à jour sur place.

import {
  CROPS, cropById, UPGRADES, UPGRADE_IDS, FISH, MAX_PLOTS, START_PLOTS,
  upgradeCost, plotCost, plotInfo, runBot, settleNet, netRate,
  rollCatch, biteDelay, biteWindow, reelParams, newReel, reelStep, castPower, castLuck, castWait, PERFECT_CAST
} from "./farm.js";
import { SIZE, stageOf, spriteFor, spriteRuns, fishSprite } from "./farm-art.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const TICK_MS = 500;
const COOLDOWN_MS = 800;                     // courte pause après une prise ou une fuite
const SVG_NS = "http://www.w3.org/2000/svg";
const STAGE_NAMES = ["", "Jeune pousse", "En croissance", "Presque mûre"];
const CAST_LABELS = {
  idle: "Maintenir pour lancer", charging: "Relâche au sommet !", waiting: "Rentrer la ligne",
  bite: "FERRER !", reel: "Maintiens pour tirer", done: "…"
};

// Dessin pixel-art → élément SVG (formes simples, sans image).
function svgFrom(sprite) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  for (const run of spriteRuns(sprite)) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(run.x));
    rect.setAttribute("y", String(run.y));
    rect.setAttribute("width", String(run.w));
    rect.setAttribute("height", "1");
    rect.setAttribute("fill", run.color);
    svg.append(rect);
  }
  return svg;
}

function fmtDuration(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

export function createFarmUI(root, wallet) {
  const farm = () => wallet.data.farm;        // relu à chaque fois : « Tout remettre à zéro » remplace l'objet
  let crop = "radis";                         // culture choisie pour planter
  let active = false;
  let timer = 0;

  /* ================= Pêche ================= */

  let fishState = "idle";                     // idle → charging → waiting → bite → reel → done → idle
  let chargeStart = 0;
  let chargeRaf = 0;
  let luck = 0;                               // bonus du lancer (niveaux d'appât en plus)
  let hooked = null;                          // { fish, size, value, params, reel }
  let reelRaf = 0;
  let lastFrame = 0;
  let pointerHeld = false;
  let keyHeld = false;
  let lastInput = 0;
  let biteTimer = 0;
  let windowTimer = 0;
  let cooldownTimer = 0;

  const bobber = h("span", { class: "fm-bobber", "aria-hidden": "true" });
  const meterFill = h("span", { class: "fm-meter-fill" });
  const meter = h("div", { class: "fm-meter", "aria-hidden": "true" }, meterFill, h("span", { class: "fm-meter-perfect" }));
  const meterLabel = h("span", { class: "fm-meter-label", "aria-hidden": "true" }, "Puissance du lancer");

  const reelName = h("p", { class: "fm-reel-name" });
  const zone = h("div", { class: "fm-zone" });
  const fishEl = h("div", { class: "fm-fish" });
  const track = h("div", { class: "fm-track" }, zone, fishEl);
  const progressFill = h("span");
  const progress = h("div", { class: "fm-progress", role: "progressbar", "aria-label": "Jauge de capture", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, progressFill);
  const reelArea = h("div", { class: "fm-reel" }, reelName, track, progress,
    h("p", { class: "fm-reel-hint" }, "Maintiens le bouton (ou Espace) : la zone monte vers la droite. Relâche : elle revient. Garde le poisson dedans !"));

  const scene = h("div", { class: "fm-scene", "data-state": "idle" }, bobber, meterLabel, meter, reelArea);
  const fishStatus = h("p", { class: "fm-status", role: "status", "aria-live": "polite" },
    "Maintiens le bouton, relâche au sommet de la jauge, puis ferre quand ça mord.");
  const castButton = h("button", { class: "button button-primary fm-cast", type: "button", id: "fm-cast" }, CAST_LABELS.idle);

  const bookEl = h("ul", { class: "fm-book", "aria-label": "Carnet de pêche" });
  const bookRows = FISH.map((f) => {
    const count = h("span", { class: "fm-book-count" });
    const icon = h("span", { class: "fm-fish-icon" }, svgFrom(fishSprite(f.color)));
    const item = h("li", { class: "is-unknown" }, icon, h("span", {}, f.name), h("span", { class: "fm-book-value" }, `${fmt(f.value)} ¤`), count);
    bookEl.append(item);
    return { item, count };
  });

  function setFishState(state) {
    fishState = state;
    scene.dataset.state = state;
    scene.setAttribute("data-state", state);
    castButton.textContent = CAST_LABELS[state];
    castButton.classList.toggle("is-alert", state === "bite");
    castButton.classList.toggle("is-hold", state === "reel" && (pointerHeld || keyHeld));
    castButton.disabled = state === "done";
  }

  function say(text, tone = "") {
    fishStatus.textContent = text;
    fishStatus.dataset.tone = tone;
  }

  function clearFishing() {
    window.clearTimeout(biteTimer);
    window.clearTimeout(windowTimer);
    window.clearTimeout(cooldownTimer);
    window.cancelAnimationFrame(chargeRaf);
    window.cancelAnimationFrame(reelRaf);
    chargeRaf = 0;
    reelRaf = 0;
    hooked = null;
    pointerHeld = false;
    keyHeld = false;
  }

  function cancelFishing() {
    clearFishing();
    meterFill.style.width = "0%";
    setFishState("idle");
  }

  // Pause courte puis retour à l'état de départ.
  function cooldown() {
    setFishState("done");
    cooldownTimer = window.setTimeout(() => { setFishState("idle"); render(); }, COOLDOWN_MS);
  }

  /* --- 1. Lancer : on charge la jauge, on relâche --- */

  function startCharge() {
    setFishState("charging");
    chargeStart = performance.now();
    say("Relâche quand la jauge atteint la zone jaune !");
    const frame = (now) => {
      if (fishState !== "charging") return;
      const power = castPower(now - chargeStart);
      meterFill.style.width = `${Math.round(power * 100)}%`;
      meterFill.style.background = power >= PERFECT_CAST ? "var(--yellow)" : "";
      chargeRaf = window.requestAnimationFrame(frame);
    };
    chargeRaf = window.requestAnimationFrame(frame);
  }

  function releaseCast(power) {
    window.cancelAnimationFrame(chargeRaf);
    chargeRaf = 0;
    meterFill.style.width = `${Math.round(power * 100)}%`;
    luck = castLuck(power);
    setFishState("waiting");
    const quality = power >= PERFECT_CAST ? "Lancer parfait !" : power >= 0.6 ? "Bon lancer." : "Lancer faible.";
    say(`${quality} La ligne est à l'eau… patience.`, power >= PERFECT_CAST ? "win" : "");
    biteTimer = window.setTimeout(onBite, biteDelay(farm().rod) * castWait(power));
  }

  /* --- 2. Touche : il faut ferrer à temps --- */

  function onBite() {
    setFishState("bite");
    say("Ça mord ! Ferre vite !", "push");
    windowTimer = window.setTimeout(() => {
      say("Trop lent : le poisson s'est échappé.", "lose");
      cancelFishing();
    }, biteWindow(farm().rod));
  }

  /* --- 3. Combat : garder le poisson dans la zone --- */

  function hook() {
    window.clearTimeout(windowTimer);
    const catchRoll = rollCatch(Math.random, farm().bait + luck);
    const params = reelParams(catchRoll.fish, farm().rod, prefersReducedMotion());
    hooked = { ...catchRoll, params, reel: newReel(params) };
    reelName.textContent = `${catchRoll.fish.name} !`;
    reelName.style.color = catchRoll.fish.color;
    fishEl.replaceChildren(svgFrom(fishSprite(catchRoll.fish.color)));
    zone.style.width = `${params.bar * 100}%`;
    setFishState("reel");
    say("Ferré ! Garde le poisson dans la zone.");
    drawReel();
    lastFrame = performance.now();
    reelRaf = window.requestAnimationFrame(reelFrame);
  }

  function drawReel() {
    const { reel, params } = hooked;
    zone.style.left = `${(reel.bar - params.bar / 2) * 100}%`;
    zone.classList.toggle("is-on", reel.inside);
    fishEl.style.left = `${reel.fish * 100}%`;
    fishEl.classList.toggle("fm-fish-flip", reel.target > reel.fish);
    progressFill.style.width = `${Math.round(reel.progress * 100)}%`;
    progress.setAttribute("aria-valuenow", String(Math.round(reel.progress * 100)));
  }

  function reelFrame(now) {
    reelRaf = 0;
    if (fishState !== "reel" || !hooked) return;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    reelStep(hooked.reel, dt, pointerHeld || keyHeld, hooked.params);
    drawReel();
    if (hooked.reel.status === "won") { land(); return; }
    if (hooked.reel.status === "lost") { escape(); return; }
    reelRaf = window.requestAnimationFrame(reelFrame);
  }

  function land() {
    const { fish, size, value } = hooked;
    const f = farm();
    f.caught += 1;
    f.fish[fish.id] += 1;
    f.bestFish = Math.max(f.bestFish, value);
    wallet.addCredits(value);
    wallet.saveFarm();
    const rare = fish.value >= 100;
    clearFishing();
    say(`Pris : ${fish.name} (${Math.round(size * 100)} %) : +${fmt(value)} crédits${rare ? " — belle prise !" : ""}`, rare ? "win" : "push");
    cooldown();
    render();
  }

  function escape() {
    const { fish } = hooked;
    clearFishing();
    say(`${fish.name} a cassé la ligne… il s'est échappé !`, "lose");
    cooldown();
  }

  /* --- Entrées : un seul bouton (souris, tactile, clavier) --- */

  // Appui : selon l'étape, charge le lancer, rentre la ligne, ferre ou tire.
  function press() {
    lastInput = performance.now();
    if (fishState === "idle") startCharge();
    else if (fishState === "waiting") { cancelFishing(); say("Tu as rentré la ligne trop tôt.", "lose"); }
    else if (fishState === "bite") hook();
    castButton.classList.toggle("is-hold", fishState === "reel");
  }

  // Relâchement : lance la ligne si on chargeait ; sinon arrête de tirer.
  function release() {
    if (pointerHeld || keyHeld) return;                    // une autre commande est encore maintenue
    lastInput = performance.now();
    if (fishState === "charging") releaseCast(castPower(performance.now() - chargeStart));
    castButton.classList.remove("is-hold");
  }

  castButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try { castButton.setPointerCapture(event.pointerId); } catch { /* sans importance */ }
    pointerHeld = true;
    press();
  });
  reelArea.addEventListener("pointerdown", (event) => {    // on peut aussi tirer en appuyant sur la scène
    if (fishState !== "reel") return;
    event.preventDefault();
    pointerHeld = true;
    press();
  });
  const pointerUp = () => { if (!pointerHeld) return; pointerHeld = false; release(); };
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);

  const isActionKey = (event) => event.key === " " || event.key === "Enter";
  castButton.addEventListener("keydown", (event) => {
    if (!isActionKey(event)) return;
    event.preventDefault();
    if (event.repeat || keyHeld) return;
    keyHeld = true;
    press();
  });
  castButton.addEventListener("keyup", (event) => {
    if (!isActionKey(event)) return;
    event.preventDefault();
    if (!keyHeld) return;
    keyHeld = false;
    release();
  });
  castButton.addEventListener("blur", () => { if (keyHeld) { keyHeld = false; release(); } });

  // Activation sans pointeur ni touche (lecteur d'écran, commande vocale) : un simple « clic » fait une action unique.
  castButton.addEventListener("click", (event) => {
    if (event.detail !== 0 || performance.now() - lastInput < 400) return;
    if (fishState === "idle") { startCharge(); releaseCast(0.5); }
    else if (fishState === "waiting" || fishState === "bite") press();
  });

  /* ================= Ferme ================= */

  const cropButtons = CROPS.map((c) =>
    h("button", {
      class: "chip chip-ghost fm-crop", type: "button", "aria-pressed": String(c.id === crop),
      title: `${c.name} : graine ${fmt(c.cost)} ¤, vendu ${fmt(c.sell)} ¤, pousse en ${fmtDuration(c.ms)}`,
      onclick: () => { crop = c.id; render(); }
    }, h("span", { class: "fm-crop-icon" }, svgFrom(spriteFor(c.id, 3))), `${c.name} · ${fmtShort(c.cost)} → ${fmtShort(c.sell)}`));
  const plantAllButton = h("button", { class: "button button-secondary", type: "button", id: "fm-plant-all", onclick: plantAll }, "Tout planter");
  const harvestAllButton = h("button", { class: "button button-secondary", type: "button", id: "fm-harvest-all", onclick: harvestAll }, "Tout récolter");

  const plotViews = Array.from({ length: MAX_PLOTS }, (_, i) => {
    const sprite = h("div", { class: "fm-sprite" });
    const field = h("div", { class: "fm-field", "aria-hidden": "true" }, sprite);
    const title = h("p", { class: "fm-plot-title" });
    const fill = h("span");
    const bar = h("div", { class: "fm-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
    const time = h("p", { class: "fm-plot-time" });
    const button = h("button", { class: "button button-secondary fm-plot-button", type: "button", onclick: () => onPlot(i) });
    const el = h("div", { class: "fm-plot" }, field, title, bar, time, button);
    return { el, sprite, title, fill, bar, time, button, last: "", art: "" };
  });
  const plotGrid = h("div", { class: "fm-plots" }, plotViews.map((p) => p.el));

  function plantOn(i, now = Date.now()) {
    const c = cropById(crop);
    if (!c || farm().plots[i] || i >= farm().plotCount) return false;
    if (!wallet.spendCredits(c.cost)) return false;
    farm().plots[i] = { crop: c.id, at: now };
    return true;
  }

  function harvestOn(i, now = Date.now()) {
    const info = plotInfo(farm(), i, now);
    if (info.state !== "ready") return 0;
    wallet.addCredits(info.crop.sell);
    farm().harvests += 1;
    farm().plots[i] = null;
    if (farm().bot && wallet.spendCredits(info.crop.cost)) farm().plots[i] = { crop: info.crop.id, at: now };   // le bot replante
    return info.crop.sell;
  }

  function onPlot(i) {
    if (i >= farm().plotCount) { buyPlot(); return; }
    const info = plotInfo(farm(), i);
    if (info.state === "empty") {
      if (!plantOn(i)) say("Pas assez de crédits pour cette graine.", "lose");
    } else if (info.state === "ready") {
      harvestOn(i);
    }
    wallet.saveFarm();
    render();
  }

  function plantAll() {
    let planted = 0;
    for (let i = 0; i < farm().plotCount; i++) if (!farm().plots[i] && plantOn(i)) planted += 1;
    if (planted) wallet.saveFarm();
    render();
  }

  function harvestAll() {
    let total = 0;
    const now = Date.now();
    for (let i = 0; i < farm().plotCount; i++) total += harvestOn(i, now);
    if (total) { say(`Récolte : +${fmt(total)} crédits.`, "win"); wallet.saveFarm(); }
    render();
  }

  /* ================= Améliorations ================= */

  const shopRows = [];
  const shopEl = h("ul", { class: "fm-shop", "aria-label": "Améliorations" });

  function addShopRow(id, label, desc, buy) {
    const level = h("span", { class: "fm-shop-level" });
    const button = h("button", { class: "button button-secondary", type: "button", onclick: buy });
    shopEl.append(h("li", { class: "fm-shop-row" }, h("div", {}, h("p", { class: "fm-shop-name" }, label, " ", level), h("p", { class: "fm-shop-desc" }, desc)), button));
    shopRows.push({ id, level, button });
  }

  addShopRow("plots", "Parcelle supplémentaire", `Jusqu'à ${MAX_PLOTS} parcelles (tu en as ${START_PLOTS} au départ).`, buyPlot);
  for (const id of UPGRADE_IDS) addShopRow(id, UPGRADES[id].label, UPGRADES[id].desc, () => buyUpgrade(id));

  function buyPlot() {
    const price = plotCost(farm().plotCount);
    if (price === null || !wallet.spendCredits(price)) return;
    farm().plotCount += 1;
    wallet.saveFarm();
    render();
  }

  function buyUpgrade(id) {
    const f = farm();
    const price = upgradeCost(id, f[id]);
    if (price === null) return;
    if (id === "net") settle();                      // verse d'abord ce que l'ancien niveau a rapporté
    if (!wallet.spendCredits(price)) return;
    if (id === "net" && f.net === 0) f.seen = Date.now();
    f[id] += 1;
    wallet.saveFarm();
    render();
  }

  /* ================= Squelette ================= */

  const summaryEl = h("p", { class: "fm-summary", id: "fm-summary" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Deux métiers, une seule monnaie. À la pêche : lance la ligne au bon moment, ferre, puis garde le poisson dans la zone pendant le combat ; plus il est rare, plus il se débat. ",
      "À la ferme : plante, regarde pousser (3 stades), récolte. Les cultures poussent même quand tu fermes la page. Le fermier-bot et le filet travaillent pour toi (8 h au maximum hors ligne)."),
    summaryEl,
    h("div", { class: "fm-layout" },
      h("section", { class: "fm-panel chamfer", "aria-labelledby": "fm-fish-title" },
        h("h3", { id: "fm-fish-title", class: "fm-title" }, "Pêche"),
        scene, fishStatus, castButton,
        h("h4", { class: "fm-sub" }, "Carnet de pêche"),
        bookEl),
      h("section", { class: "fm-panel chamfer", "aria-labelledby": "fm-farm-title" },
        h("h3", { id: "fm-farm-title", class: "fm-title" }, "Ferme"),
        h("p", { class: "fm-sub" }, "Culture à planter (graine → vente)"),
        h("div", { class: "chips fm-crops", role: "group", "aria-label": "Culture à planter" }, cropButtons),
        h("div", { class: "fm-toolbar" }, plantAllButton, harvestAllButton),
        plotGrid)
    ),
    h("section", { class: "fm-panel chamfer", "aria-labelledby": "fm-shop-title" },
      h("h3", { id: "fm-shop-title", class: "fm-title" }, "Améliorations"),
      shopEl)
  );

  /* ================= Affichage (mise à jour sur place) ================= */

  function render() {
    const f = farm();
    const now = Date.now();
    const credits = wallet.credits;

    for (let i = 0; i < MAX_PLOTS; i++) {
      const view = plotViews[i];
      let key;
      if (i >= f.plotCount) {
        const price = i === f.plotCount ? plotCost(f.plotCount) : null;
        key = `locked:${price}:${price !== null && price <= credits}`;
        if (view.last !== key) {
          view.last = key;
          view.el.className = "fm-plot is-locked";
          view.sprite.replaceChildren();
          view.art = "";
          view.title.textContent = "Parcelle verrouillée";
          view.fill.style.width = "0%";
          view.time.textContent = price !== null ? `Prix : ${fmt(price)} ¤` : "Achète les précédentes d'abord";
          view.button.textContent = price !== null ? "Acheter" : "—";
          view.button.disabled = price === null || price > credits;
        }
        continue;
      }
      const info = plotInfo(f, i, now);
      const c = cropById(crop);
      const pct = info.state === "empty" ? 0 : Math.round(info.progress * 100);
      const stage = info.state === "empty" ? 0 : info.state === "ready" ? 3 : stageOf(info.progress);
      key = `${info.state}:${info.crop?.id}:${stage}:${pct}:${info.state === "growing" ? fmtDuration(info.remaining) : ""}:${credits >= (c?.cost ?? 0)}:${crop}`;
      if (view.last === key) continue;
      view.last = key;
      view.el.className = `fm-plot is-${info.state}`;

      const art = info.state === "empty" ? "" : `${info.crop.id}:${stage}`;   // le dessin ne change qu'à chaque stade
      if (view.art !== art) {
        view.art = art;
        if (art) view.sprite.replaceChildren(svgFrom(spriteFor(info.crop.id, stage)));
        else view.sprite.replaceChildren();
      }

      view.title.textContent = info.state === "empty" ? `Parcelle ${i + 1} — vide` : `Parcelle ${i + 1} — ${info.crop.name}`;
      view.fill.style.width = `${pct}%`;
      view.bar.setAttribute("aria-valuenow", String(pct));
      view.time.textContent = info.state === "empty" ? "Prête à planter"
        : info.state === "ready" ? `Mûre : ${fmt(info.crop.sell)} ¤`
        : `${STAGE_NAMES[stage]} · ${fmtDuration(info.remaining)}`;
      view.button.textContent = info.state === "empty" ? `Planter (${fmtShort(c.cost)} ¤)` : info.state === "ready" ? "Récolter" : "Pousse…";
      view.button.disabled = info.state === "growing" || (info.state === "empty" && credits < c.cost);
    }

    cropButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(CROPS[i].id === crop)));
    plantAllButton.disabled = !Array.from({ length: f.plotCount }, (_, i) => i).some((i) => !f.plots[i]) || credits < cropById(crop).cost;
    harvestAllButton.disabled = !Array.from({ length: f.plotCount }, (_, i) => i).some((i) => plotInfo(f, i, now).state === "ready");

    for (const row of shopRows) {
      const isPlots = row.id === "plots";
      const level = isPlots ? f.plotCount - START_PLOTS : f[row.id];
      const max = isPlots ? MAX_PLOTS - START_PLOTS : UPGRADES[row.id].max;
      const price = isPlots ? plotCost(f.plotCount) : upgradeCost(row.id, level);
      row.level.textContent = max === 1 ? (level ? "(acheté)" : "") : `(niveau ${level}/${max})`;
      row.button.textContent = price === null ? "Maximum" : `Acheter · ${fmt(price)} ¤`;
      row.button.disabled = price === null || price > credits;
    }

    FISH.forEach((fish, i) => {
      const count = f.fish[fish.id];
      bookRows[i].count.textContent = `×${fmt(count)}`;
      bookRows[i].item.className = count ? "" : "is-unknown";
    });
    const rate = netRate(f.net);
    summaryEl.textContent = `Poissons : ${fmt(f.caught)} · meilleure prise : ${fmt(f.bestFish)} ¤ · récoltes : ${fmt(f.harvests)}`
      + (rate ? ` · filet : +${rate.toLocaleString("fr-FR")} ¤/s` : "");
  }

  // Fermier-bot et filet : appelé toutes les demi-secondes, et à l'arrivée sur le jeu (rattrapage hors ligne).
  function settle() {
    const f = farm();
    const now = Date.now();
    const bot = runBot(f, now);
    const net = settleNet(f, now);
    const gain = bot.net + net;
    if (gain > 0) wallet.addCredits(gain);
    if (bot.harvests || net) wallet.saveFarm();
    return gain;
  }

  function tick() {
    settle();
    render();
  }

  wallet.subscribe(() => { if (active) render(); });
  window.addEventListener("pagehide", () => { cancelFishing(); settle(); });
  render();

  return {
    activate() {
      active = true;
      const away = settle();
      if (away >= 100) say(`Pendant ton absence : +${fmt(away)} crédits.`, "win");
      render();
      window.clearInterval(timer);
      timer = window.setInterval(tick, TICK_MS);
    },
    deactivate() {
      active = false;
      window.clearInterval(timer);
      timer = 0;
      cancelFishing();
      settle();
    }
  };
}
