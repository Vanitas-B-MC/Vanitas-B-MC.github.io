// js/ui-farm.js — interface de « Pêche & Ferme » (la logique est dans farm.js).
// Tout est payé et gagné en crédits. La progression (parcelles, améliorations, carnet de pêche) est enregistrée
// dans le portefeuille ; les cultures et le filet continuent de travailler quand la page est fermée (8 h au plus).
//
// Les éléments sont créés une fois puis mis à jour sur place toutes les demi-secondes (aucune reconstruction),
// pour ne pas perdre le focus ni des clics.

import {
  CROPS, cropById, UPGRADES, UPGRADE_IDS, FISH, MAX_PLOTS, START_PLOTS,
  upgradeCost, plotCost, plotInfo, runBot, settleNet, netRate, rollCatch, biteDelay, biteWindow
} from "./farm.js";
import { h, fmt, fmtShort } from "./ui.js";

const TICK_MS = 500;
const CATCH_PAUSE_MS = 700;

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

  /* ---------- Pêche ---------- */

  let fishState = "idle";                     // idle → waiting → bite → (pause) → idle
  let biteTimer = 0;
  let windowTimer = 0;
  let pauseTimer = 0;

  const pond = h("div", { class: "fm-pond", "data-state": "idle", "aria-hidden": "true" }, h("span", { class: "fm-bobber" }));
  const fishStatus = h("p", { class: "fm-status", role: "status", "aria-live": "polite" }, "Lance la ligne, puis ferre dès que ça mord.");
  const castButton = h("button", { class: "button button-primary fm-cast", type: "button", id: "fm-cast", onclick: onCast }, "Lancer la ligne");
  const bookEl = h("ul", { class: "fm-book", "aria-label": "Carnet de pêche" });
  const bookRows = FISH.map((f) => {
    const count = h("span", { class: "fm-book-count" });
    bookEl.append(h("li", {}, h("span", {}, f.name), h("span", { class: "fm-book-value" }, `${fmt(f.value)} ¤`), count));
    return count;
  });

  function setFishState(state) {
    fishState = state;
    pond.dataset.state = state === "bite" ? "bite" : state === "waiting" ? "waiting" : "idle";
    castButton.textContent = state === "bite" ? "FERRER !" : state === "waiting" ? "Rentrer la ligne" : "Lancer la ligne";
    castButton.classList.toggle("is-alert", state === "bite");
  }

  function cancelFishing() {
    window.clearTimeout(biteTimer);
    window.clearTimeout(windowTimer);
    window.clearTimeout(pauseTimer);
    castButton.disabled = false;
    setFishState("idle");
  }

  function say(text, tone = "") {
    fishStatus.textContent = text;
    fishStatus.dataset.tone = tone;
  }

  function onCast() {
    if (fishState === "idle") {
      setFishState("waiting");
      say("La ligne est à l'eau… patience.");
      biteTimer = window.setTimeout(() => {
        setFishState("bite");
        say("Ça mord ! Ferre vite !", "push");
        windowTimer = window.setTimeout(() => {
          setFishState("idle");
          say("Trop lent : le poisson s'est échappé.", "lose");
        }, biteWindow(farm().rod));
      }, biteDelay(farm().rod));
    } else if (fishState === "waiting") {
      cancelFishing();
      say("Tu as rentré la ligne trop tôt.", "lose");
    } else if (fishState === "bite") {
      window.clearTimeout(windowTimer);
      const result = rollCatch(Math.random, farm().bait);
      const f = farm();
      f.caught += 1;
      f.fish[result.fish.id] += 1;
      f.bestFish = Math.max(f.bestFish, result.value);
      wallet.addCredits(result.value);
      wallet.saveFarm();
      const rare = result.fish.value >= 100;
      say(`${result.fish.name} (${Math.round(result.size * 100)} %) : +${fmt(result.value)} crédits${rare ? " — belle prise !" : ""}`, rare ? "win" : "push");
      setFishState("idle");
      castButton.disabled = true;                     // courte pause : évite de relancer par accident
      pauseTimer = window.setTimeout(() => { castButton.disabled = false; render(); }, CATCH_PAUSE_MS);
      render();
    }
  }

  /* ---------- Ferme ---------- */

  const cropButtons = CROPS.map((c) =>
    h("button", {
      class: "chip chip-ghost fm-crop", type: "button", "aria-pressed": String(c.id === crop),
      title: `${c.name} : graine ${fmt(c.cost)} ¤, vendu ${fmt(c.sell)} ¤, pousse en ${fmtDuration(c.ms)}`,
      onclick: () => { crop = c.id; render(); }
    }, `${c.name} · ${fmtShort(c.cost)} → ${fmtShort(c.sell)}`));
  const plantAllButton = h("button", { class: "button button-secondary", type: "button", id: "fm-plant-all", onclick: plantAll }, "Tout planter");
  const harvestAllButton = h("button", { class: "button button-secondary", type: "button", id: "fm-harvest-all", onclick: harvestAll }, "Tout récolter");

  const plotViews = Array.from({ length: MAX_PLOTS }, (_, i) => {
    const title = h("p", { class: "fm-plot-title" });
    const fill = h("span");
    const bar = h("div", { class: "fm-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
    const time = h("p", { class: "fm-plot-time" });
    const button = h("button", { class: "button button-secondary fm-plot-button", type: "button", onclick: () => onPlot(i) });
    const el = h("div", { class: "fm-plot" }, title, bar, time, button);
    return { el, title, fill, bar, time, button, last: "" };
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

  /* ---------- Améliorations ---------- */

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

  /* ---------- Squelette ---------- */

  const summaryEl = h("p", { class: "fm-summary", id: "fm-summary" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Deux métiers, une seule monnaie. À la pêche, ferre au bon moment. À la ferme, plante, attends que ça pousse, récolte : ",
      "les cultures poussent même quand tu fermes la page. Le fermier-bot et le filet automatique travaillent pour toi (8 h au maximum hors ligne)."),
    summaryEl,
    h("div", { class: "fm-layout" },
      h("section", { class: "fm-panel chamfer", "aria-labelledby": "fm-fish-title" },
        h("h3", { id: "fm-fish-title", class: "fm-title" }, "Pêche"),
        pond, fishStatus, castButton,
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

  /* ---------- Affichage (mise à jour sur place) ---------- */

  function render() {
    const f = farm();
    const now = Date.now();
    const credits = wallet.credits;

    // Parcelles
    for (let i = 0; i < MAX_PLOTS; i++) {
      const view = plotViews[i];
      let key;
      if (i >= f.plotCount) {
        const price = i === f.plotCount ? plotCost(f.plotCount) : null;
        key = `locked:${price}:${price !== null && price <= credits}`;
        if (view.last !== key) {
          view.last = key;
          view.el.className = "fm-plot is-locked";
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
      key = `${info.state}:${info.crop?.id}:${pct}:${info.state === "growing" ? fmtDuration(info.remaining) : ""}:${credits >= (c?.cost ?? 0)}:${crop}`;
      if (view.last === key) continue;
      view.last = key;
      view.el.className = `fm-plot is-${info.state}`;
      view.title.textContent = info.state === "empty" ? `Parcelle ${i + 1} — vide` : `Parcelle ${i + 1} — ${info.crop.name}`;
      view.fill.style.width = `${pct}%`;
      view.bar.setAttribute("aria-valuenow", String(pct));
      view.time.textContent = info.state === "empty" ? "Prête à planter"
        : info.state === "ready" ? `Prête : ${fmt(info.crop.sell)} ¤` : `Encore ${fmtDuration(info.remaining)}`;
      view.button.textContent = info.state === "empty" ? `Planter (${fmtShort(c.cost)} ¤)` : info.state === "ready" ? "Récolter" : "Pousse…";
      view.button.disabled = info.state === "growing" || (info.state === "empty" && credits < c.cost);
    }

    cropButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(CROPS[i].id === crop)));
    plantAllButton.disabled = !Array.from({ length: f.plotCount }, (_, i) => i).some((i) => !f.plots[i]) || credits < cropById(crop).cost;
    harvestAllButton.disabled = !Array.from({ length: f.plotCount }, (_, i) => i).some((i) => plotInfo(f, i, now).state === "ready");

    // Boutique
    for (const row of shopRows) {
      const isPlots = row.id === "plots";
      const level = isPlots ? f.plotCount - START_PLOTS : f[row.id];
      const max = isPlots ? MAX_PLOTS - START_PLOTS : UPGRADES[row.id].max;
      const price = isPlots ? plotCost(f.plotCount) : upgradeCost(row.id, level);
      row.level.textContent = max === 1 ? (level ? "(acheté)" : "") : `(niveau ${level}/${max})`;
      row.button.textContent = price === null ? "Maximum" : `Acheter · ${fmt(price)} ¤`;
      row.button.disabled = price === null || price > credits;
    }

    // Carnet et résumé
    FISH.forEach((fish, i) => { bookRows[i].textContent = `×${fmt(f.fish[fish.id])}`; });
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
