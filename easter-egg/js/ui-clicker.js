// js/ui-clicker.js — interface du « Mineur de données », façon Cookie Clicker (la logique est dans clicker.js).
//
// Trois colonnes (une seule sur téléphone) :
//   gauche  : banque de données, le noyau à cliquer, pluie de bits, effets en cours ;
//   milieu  : fil d'actus et onglets (salle des machines, succès, formatage, surcadençage, statistiques) ;
//   droite  : boutique (améliorations en grille, puis bâtiments).
// La production tourne dans arcade.js (elle continue pendant les autres jeux) ; ici on ne fait qu'afficher.

import {
  BUILDINGS, BUILDING_IDS, UPGRADES, HEAVEN, ACHIEVEMENTS, BUFFS,
  buildingById, perSecond, clickValue, unitCps, buildingCps, globalMult, milk, prestigeLevel,
  buildingCost, sellValue, affordable, buyBuilding, sellBuilding, buildingVisible,
  availableUpgrades, upgradeCost, buyUpgrade, buyAllUpgrades, upgradeById,
  click, catchGold, nextGoldDelay, goldLifetime, activeBuffs,
  levelCost, pendingPrestige, nextPrestigeAt, format, heavenState, buyHeaven, offlineRate,
  checkAchievements, achievementCredits, newsFor,
  MINIGAMES, minigameUnlocked, GODS, SLOT_NAMES, SWAP_MAX, pantheonSwaps, nextSwapIn, placeGod, removeGod,
  ramMax, SPELLS, spellCost, castSpell, STOCKS, MARKET_TICK, MARKET_FEE, dollarValue, maxShares, sharesCost, sharesValue, buyShares, sellShares
} from "./clicker.js";
import { h, fmtShort, fmtRate, prefersReducedMotion, themeColor } from "./ui.js";

const fmt = (n) => fmtShort(Math.floor(n));
const MAX_POPUPS = 14;
const NEWS_MS = 9000;
const TOAST_MS = 6000;
const plural = (n, word, pl = `${word}s`) => (n > 1 ? pl : word);
// replaceChildren écrit « null » en texte : on retire d'abord les éléments vides.
const fill = (el, ...nodes) => el.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false));

export function createClickerUI(root, wallet) {
  const ck = () => wallet.data.ck;
  let active = false;
  let mode = "buy";              // "buy" ou "sell"
  let qty = 1;                   // 1, 10 ou 100
  let tab = "room";
  let selected = null;           // amélioration sélectionnée (affichée dans le cadre d'info)
  let lastPointer = "mouse";
  let goldTimer = 0;
  let goldHideTimer = 0;
  let newsTimer = 0;
  let rainFrame = 0;
  let confirmFormat = false;
  let confirmTimer = 0;
  const keys = { upgrades: "", room: "", ach: -1, heaven: "", level: "", mini: "" };

  /* ================================================================================================
     Colonne de gauche : banque + noyau
     ================================================================================================ */

  const bankEl = h("strong", { class: "ck2-bank-value" }, "0");
  const rateEl = h("span", { class: "ck2-rate" });
  const clickEl = h("span", { class: "ck2-clickval" });
  const core = h("button", { class: "ck2-core", type: "button", id: "mine", "aria-label": "Noyau de données : clique pour miner" },
    h("span", { class: "ck2-ring ck2-ring-a", "aria-hidden": "true" }),
    h("span", { class: "ck2-ring ck2-ring-b", "aria-hidden": "true" }),
    h("span", { class: "ck2-ring ck2-ring-c", "aria-hidden": "true" }),
    h("span", { class: "ck2-core-hex", "aria-hidden": "true" }),
    h("span", { class: "ck2-core-label" }, "MINER"));
  const rain = h("canvas", { class: "ck2-rain", "aria-hidden": "true" });
  const popups = h("div", { class: "ck2-popups", "aria-hidden": "true" });
  const buffsEl = h("ul", { class: "ck2-buffs", "aria-label": "Effets en cours" });
  const message = h("p", { class: "ck2-message", role: "status", "aria-live": "polite" });

  const left = h("section", { class: "ck2-left chamfer", "aria-label": "Noyau" },
    h("div", { class: "ck2-bank" },
      h("span", { class: "ck2-bank-label" }, "Banque de données"),
      bankEl,
      rateEl,
      clickEl),
    h("div", { class: "ck2-core-wrap" }, rain, core, popups),
    buffsEl,
    message,
    h("p", { class: "ck2-note" }, "Chaque donnée minée est aussi versée en crédit dans ton portefeuille."));

  /* ================================================================================================
     Colonne du milieu : actus + onglets
     ================================================================================================ */

  const news = h("button", { class: "ck2-news", type: "button", title: "Actu suivante" }, h("span", { class: "ck2-news-tag" }, "NEWS"), h("span", { class: "ck2-news-text" }));
  const newsText = news.querySelector(".ck2-news-text");

  const roomEl = h("div", { class: "ck2-room" });
  const achHead = h("p", { class: "ck2-hint" });
  const achGrid = h("div", { class: "ck2-ach" });
  const formatInfo = h("div", { class: "ck2-format" });
  const formatButton = h("button", { class: "button button-primary", type: "button", onclick: () => doFormat() });
  const chipsEl = h("p", { class: "ck2-hint" });
  const heavenGrid = h("ul", { class: "ck2-heaven" });
  const levelHead = h("p", { class: "ck2-hint" });
  const levelList = h("ul", { class: "ck2-levels" });
  const statsEl = h("dl", { class: "ck2-stats" });
  let miniTab = "deck";
  const miniNavButtons = MINIGAMES.map((m) => h("button", { class: "ck2-toggle", type: "button", "data-mini": m.id, onclick: () => { miniTab = m.id; keys.mini = ""; render(); } }, m.name));
  const miniNav = h("div", { class: "ck2-toggles ck2-mini-nav", role: "group", "aria-label": "Mini-jeux" }, miniNavButtons);
  const miniBody = h("div", { class: "ck2-mini" });

  const TABS = [
    { id: "room", label: "Machines", panel: h("div", {}, roomEl) },
    { id: "ach", label: "Succès", panel: h("div", {}, achHead, achGrid) },
    { id: "format", label: "Formatage", panel: h("div", {},
      h("p", { class: "ck2-hint" }, "Formater efface ta banque, tes bâtiments et tes améliorations. Tu gardes tes succès, ton surcadençage et l'arbre ci-dessous. "
        + "Chaque niveau de prestige donne +1 % de production à vie et 1 éclat à dépenser dans l'arbre."),
      formatInfo, formatButton, chipsEl, heavenGrid) },
    { id: "mini", label: "Mini-jeux", panel: h("div", {}, miniNav, miniBody) },
    { id: "level", label: "Surcadençage", panel: h("div", {}, levelHead, levelList) },
    { id: "stats", label: "Stats", panel: h("div", {}, statsEl) }
  ];
  const tabButtons = TABS.map((t) => h("button", {
    class: "ck-tab", type: "button", role: "tab", "aria-controls": `ck2-panel-${t.id}`, onclick: () => selectTab(t.id)
  }, t.label));
  TABS.forEach((t) => { t.panel.id = `ck2-panel-${t.id}`; t.panel.setAttribute("role", "tabpanel"); t.panel.className = "ck2-panel"; });

  const mid = h("section", { class: "ck2-mid", "aria-label": "Infos" },
    news,
    h("div", { class: "ck-tabs", role: "tablist", "aria-label": "Sections du Clicker" }, tabButtons),
    TABS.map((t) => t.panel));

  function selectTab(id) {
    tab = id;
    TABS.forEach((t, i) => { t.panel.hidden = t.id !== id; tabButtons[i].setAttribute("aria-selected", String(t.id === id)); });
    keys.room = ""; keys.ach = -1; keys.heaven = ""; keys.level = ""; keys.mini = "";
    render();
  }

  /* ================================================================================================
     Colonne de droite : boutique
     ================================================================================================ */

  const upgradeGrid = h("div", { class: "ck2-upgrades", role: "list", "aria-label": "Améliorations disponibles" });
  const buyAllButton = h("button", { class: "chip chip-ghost ck2-buyall", type: "button", onclick: () => {
    const n = buyAllUpgrades(ck());
    if (n) { say(`${n} amélioration${n > 1 ? "s" : ""} achetée${n > 1 ? "s" : ""}.`); afterChange(); }
  } }, "Tout acheter");
  const info = h("div", { class: "ck2-info", "aria-live": "polite" }, h("p", { class: "ck2-hint" }, "Survole (ou touche) une amélioration ou un bâtiment pour voir le détail."));

  const modeButtons = [["buy", "Acheter"], ["sell", "Vendre"]].map(([id, label]) =>
    h("button", { class: "ck2-toggle", type: "button", "data-mode": id, onclick: () => { mode = id; render(); } }, label));
  const qtyButtons = [1, 10, 100].map((n) =>
    h("button", { class: "ck2-toggle", type: "button", "data-qty": n, onclick: () => { qty = n; render(); } }, `×${n}`));

  const rows = BUILDINGS.map((b) => {
    const priceEl = h("span", { class: "ck2-b-price" });
    const ownedEl = h("span", { class: "ck2-b-owned" });
    const nameEl = h("strong", { class: "ck2-b-name" }, b.name);
    const button = h("button", { class: "ck2-building", type: "button", "data-id": b.id, style: `--c:${b.color}` },
      h("span", { class: "ck2-icon", "aria-hidden": "true" }, b.code),
      h("span", { class: "ck2-b-main" }, nameEl, priceEl),
      ownedEl);
    button.addEventListener("click", () => onBuilding(b.id));
    button.addEventListener("mouseenter", () => showBuildingInfo(b.id));
    button.addEventListener("focus", () => showBuildingInfo(b.id));
    return { b, button, priceEl, ownedEl, nameEl };
  });

  const right = h("section", { class: "ck2-store", "aria-label": "Boutique" },
    h("div", { class: "ck2-store-head" }, h("h3", { class: "subhead" }, "Améliorations"), buyAllButton),
    upgradeGrid,
    info,
    h("div", { class: "ck2-store-head" }, h("h3", { class: "subhead" }, "Bâtiments"),
      h("div", { class: "ck2-toggles", role: "group", "aria-label": "Mode" }, modeButtons),
      h("div", { class: "ck2-toggles", role: "group", "aria-label": "Quantité" }, qtyButtons)),
    h("div", { class: "ck2-buildings" }, rows.map((r) => r.button)));

  /* ================================================================================================
     Paquet doré + notifications
     ================================================================================================ */

  const gold = h("button", { class: "ck2-gold", type: "button", hidden: true, "aria-label": "Paquet doré : clique vite pour un bonus !" },
    h("span", { class: "ck2-gold-core", "aria-hidden": "true" }, "◆"));
  const toasts = h("div", { class: "ck2-toasts", "aria-live": "polite" });

  const game = h("div", { class: "ck2" }, left, mid, right, gold, toasts);
  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Clique sur le noyau pour miner des données, achète des bâtiments qui minent à ta place, puis des améliorations pour les rendre plus puissants. "
      + "Attrape les paquets dorés, collectionne les succès, et formate pour recommencer plus fort."),
    game);

  /* ================================================================================================
     Messages
     ================================================================================================ */

  let messageTimer = 0;
  function say(text) {
    message.textContent = text;
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { message.textContent = ""; }, 6000);
  }

  function toast(title, text, kind = "") {
    while (toasts.children.length >= 4) toasts.firstChild.remove();
    const node = h("div", { class: `ck2-toast ${kind}` }, h("strong", {}, title), h("span", {}, text));
    toasts.append(node);
    window.setTimeout(() => node.remove(), TOAST_MS);
  }

  /* ================================================================================================
     Clic sur le noyau
     ================================================================================================ */

  function popup(text, event, extra = "") {
    if (prefersReducedMotion()) return;
    while (popups.children.length >= MAX_POPUPS) popups.firstChild.remove();
    const box = popups.getBoundingClientRect();
    const x = event && event.clientX ? event.clientX - box.left : box.width / 2;
    const y = event && event.clientY ? event.clientY - box.top : box.height / 2;
    const node = h("span", { class: `ck2-pop ${extra}`, style: `left:${x}px; top:${y}px` }, text);
    node.addEventListener("animationend", () => node.remove());
    popups.append(node);
    const bit = h("span", { class: "ck2-bit", style: `left:${x}px; top:${y}px; --dx:${Math.round(Math.random() * 120 - 60)}px` }, Math.random() < 0.5 ? "0" : "1");
    bit.addEventListener("animationend", () => bit.remove());
    popups.append(bit);
  }

  core.addEventListener("click", (event) => {
    const gain = click(ck());
    wallet.minedData(gain, { clicks: 1 });
    popup(`+${fmt(gain)}`, event, activeBuffs(ck()).some((x) => x.id === "clickf") ? "is-mega" : "");
    core.classList.remove("is-hit");
    void core.offsetWidth;
    core.classList.add("is-hit");
    afterChange();
  });

  /* ================================================================================================
     Bâtiments
     ================================================================================================ */

  function onBuilding(id) {
    const c = ck();
    showBuildingInfo(id);
    if (mode === "buy") {
      const n = buyBuilding(c, id, qty);
      if (!n) return;
    } else {
      const before = BUILDING_IDS.reduce((s, x) => s + c.b[x], 0);
      const n = sellBuilding(c, id, qty);
      if (!n) return;
      const after = BUILDING_IDS.reduce((s, x) => s + c.b[x], 0);
      if (after === 0 && before >= 100) reward(checkAchievements(c, { soldAll: true }));
    }
    wallet.saveClicker();
    afterChange();
    showBuildingInfo(id);
  }

  function showBuildingInfo(id) {
    const c = ck();
    const b = buildingById(id);
    if (!buildingVisible(c, id)) { fill(info, h("p", { class: "ck2-hint" }, "Bâtiment encore inconnu. Mine davantage pour le découvrir.")); return; }
    const n = c.b[id];
    const each = unitCps(c, id) * globalMult(c);
    const total = buildingCps(c, id);
    const all = perSecond(c) || 1;
    fill(info, 
      h("div", { class: "ck2-info-head", style: `--c:${b.color}` }, h("span", { class: "ck2-icon" }, b.code), h("strong", {}, b.name),
        h("span", { class: "ck2-info-price" }, mode === "buy" ? `${fmt(buildingCost(c, id, qty))} ◆` : `+${fmt(sellValue(c, id, qty))} ◆`)),
      h("p", { class: "ck2-info-flavor" }, b.desc),
      h("p", {}, `Chaque ${b.name.toLowerCase()} mine ${fmtRate(each)} donnée${each >= 2 ? "s" : ""}/s.`),
      n ? h("p", {}, `Tes ${fmt(n)} ${plural(n, b.name.toLowerCase(), b.pl)} minent ${fmtRate(total)}/s (${Math.round((total / all) * 1000) / 10} % du total).`) : null,
      c.lv[id] ? h("p", {}, `Surcadençage niveau ${c.lv[id]} : +${c.lv[id]} %.`) : null);
  }

  /* ================================================================================================
     Améliorations
     ================================================================================================ */

  function showUpgradeInfo(u, canBuy) {
    const c = ck();
    const price = upgradeCost(c, u);
    fill(info, 
      h("div", { class: "ck2-info-head", style: `--c:${u.color}` }, h("span", { class: "ck2-icon" }, u.code, h("small", {}, u.mark)), h("strong", {}, u.name),
        h("span", { class: `ck2-info-price${c.data >= price ? "" : " is-poor"}` }, `${fmt(price)} ◆`)),
      h("p", {}, u.desc),
      canBuy && lastPointer === "touch" ? h("p", { class: "ck2-hint" }, "Touche encore pour acheter.") : null);
  }

  function buildUpgradeGrid(list) {
    fill(upgradeGrid, ...list.map((u) => {
      const tile = h("button", { class: "ck2-up", type: "button", role: "listitem", "data-id": u.id, style: `--c:${u.color}`, "aria-label": `${u.name} : ${u.desc}` },
        h("span", { class: "ck2-up-code" }, u.code), h("span", { class: "ck2-up-mark" }, u.mark));
      tile.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; });
      tile.addEventListener("mouseenter", () => showUpgradeInfo(u, false));
      tile.addEventListener("focus", () => showUpgradeInfo(u, false));
      tile.addEventListener("click", () => {
        if (lastPointer === "touch" && selected !== u.id) { selected = u.id; showUpgradeInfo(u, true); return; }
        selected = null;
        if (buyUpgrade(ck(), u.id)) { wallet.saveClicker(); say(`Amélioration : ${u.name}.`); afterChange(); }
        else showUpgradeInfo(u, false);
      });
      return tile;
    }));
    if (!list.length) upgradeGrid.append(h("p", { class: "ck2-hint ck2-empty" }, "Aucune amélioration pour l'instant : achète des bâtiments pour en débloquer."));
  }

  /* ================================================================================================
     Paquets dorés
     ================================================================================================ */

  function scheduleGold() {
    window.clearTimeout(goldTimer);
    goldTimer = window.setTimeout(showGold, nextGoldDelay(ck()));
  }

  function showGold() {
    if (!active) return;
    gold.style.left = `${4 + Math.random() * 84}%`;
    gold.style.top = `${6 + Math.random() * 70}%`;
    gold.hidden = false;
    gold.classList.remove("is-fading");
    const life = goldLifetime(ck());
    goldHideTimer = window.setTimeout(() => gold.classList.add("is-fading"), Math.max(0, life - 2000));
    goldTimer = window.setTimeout(() => { hideGold(); scheduleGold(); }, life);
  }

  function hideGold() {
    window.clearTimeout(goldHideTimer);
    gold.hidden = true;
  }

  gold.addEventListener("click", () => {
    window.clearTimeout(goldTimer);
    hideGold();
    const c = ck();
    const res = catchGold(c);
    if (res.gain) wallet.minedData(res.gain);
    if (res.blue) wallet.addBlue(res.blue);
    wallet.saveClicker();
    if (res.kind === "frenzy") toast("Frénésie !", "Production ×7 pendant " + Math.round((res.buff.until - Date.now()) / 1000) + " s.", "is-gold");
    else if (res.kind === "clickf") toast("Frénésie de clic !", "Clic ×777 pendant " + Math.round((res.buff.until - Date.now()) / 1000) + " s. Clique !", "is-gold");
    else if (res.kind === "surge") toast("Surcharge !", `${buildingById(res.buff.b).name} : production ×${fmtRate(res.buff.mult)} pendant ${Math.round((res.buff.until - Date.now()) / 1000)} s.`, "is-gold");
    else if (res.kind === "blue") toast("Paquet bleu !", `+1 pièce bleue et +${fmt(res.gain)} données.`, "is-blue");
    else toast("Coup de chance !", `+${fmt(res.gain)} données.`, "is-gold");
    scheduleGold();
    afterChange();
  });

  /* ================================================================================================
     Succès
     ================================================================================================ */

  function reward(list) {
    if (!list.length) return;
    let total = 0;
    for (const a of list) {
      const paid = achievementCredits(wallet.credits);
      wallet.addCredits(paid);
      total += paid;
    }
    if (list.length === 1) toast("Succès débloqué", `${list[0].name} — ${list[0].desc}`, "is-ach");
    else toast(`${list.length} succès débloqués`, list.slice(0, 4).map((x) => x.name).join(" · ") + (list.length > 4 ? ` · +${list.length - 4}` : ""), "is-ach");
    wallet.saveClicker();
    say(`Succès : +${fmtShort(total)} crédits versés au portefeuille. Signal : ${Math.round(milk(ck()) * 100)} %.`);
  }

  /* ================================================================================================
     Formatage
     ================================================================================================ */

  function doFormat() {
    const c = ck();
    if (pendingPrestige(c) < 1) return;
    if (!confirmFormat) {
      confirmFormat = true;
      window.clearTimeout(confirmTimer);
      confirmTimer = window.setTimeout(() => { confirmFormat = false; render(); }, 5000);
      render();
      return;
    }
    confirmFormat = false;
    const gained = format(c);
    wallet.saveClicker();
    toast("Formatage terminé", `+${fmtShort(gained)} niveau${gained > 1 ? "x" : ""} de prestige et éclat${gained > 1 ? "s" : ""}.`, "is-ach");
    keys.upgrades = "";
    afterChange();
  }

  /* ================================================================================================
     Rendu
     ================================================================================================ */

  function afterChange() {
    reward(checkAchievements(ck()));
    render();
  }

  function renderBank(c, cps) {
    bankEl.textContent = `${fmt(c.data)} données`;
    bankEl.title = Math.floor(c.data).toLocaleString("fr-FR");
    const frenzy = activeBuffs(c).some((x) => x.id === "frenzy");
    rateEl.textContent = `par seconde : ${fmtRate(cps)}`;
    rateEl.classList.toggle("is-boost", frenzy);
    clickEl.textContent = `par clic : ${fmtRate(clickValue(c))}`;

    const buffs = activeBuffs(c);
    fill(buffsEl, ...buffs.map((x) => {
      const left = Math.max(0, Math.ceil((x.until - Date.now()) / 1000));
      const desc = x.id === "surge" ? `${buildingById(x.b).name} ×${fmtRate(x.mult)}` : BUFFS[x.id].desc;
      return h("li", { class: `ck2-buff is-${x.id}` }, h("strong", {}, BUFFS[x.id].name), ` ${desc} · ${left} s`);
    }));
  }

  function renderStore(c) {
    const list = availableUpgrades(c);
    const key = list.map((u) => u.id).join(",");
    if (key !== keys.upgrades) { keys.upgrades = key; buildUpgradeGrid(list); }
    let canAny = false;
    for (const tile of upgradeGrid.children) {
      const u = upgradeById(tile.dataset.id);
      if (!u) continue;
      const ok = c.data >= upgradeCost(c, u);
      canAny ||= ok;
      tile.classList.toggle("is-ready", ok);
    }
    buyAllButton.disabled = !canAny;

    modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    qtyButtons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.qty) === qty)));

    let hiddenShown = 0;
    for (const r of rows) {
      const id = r.b.id;
      const visible = buildingVisible(c, id);
      const n = c.b[id];
      if (!visible) {
        hiddenShown += 1;
        r.button.hidden = hiddenShown > 2;               // les 2 prochains apparaissent en « ??? »
        r.button.classList.add("is-unknown");
        r.nameEl.textContent = "???";
        r.priceEl.textContent = `${fmt(buildingCost(c, id, 1))} ◆`;
        r.ownedEl.textContent = "";
        r.button.disabled = true;
        continue;
      }
      r.button.hidden = false;
      r.button.classList.remove("is-unknown");
      r.nameEl.textContent = r.b.name;
      r.ownedEl.textContent = n ? fmt(n) : "";
      if (mode === "buy") {
        const price = buildingCost(c, id, qty);
        r.priceEl.textContent = `${fmt(price)} ◆`;
        r.button.disabled = affordable(c, id, qty) < qty;
      } else {
        r.priceEl.textContent = n ? `+${fmt(sellValue(c, id, qty))} ◆` : "—";
        r.button.disabled = n === 0;
      }
    }
  }

  function renderRoom(c, cps) {
    const key = BUILDING_IDS.map((id) => c.b[id]).join(",");
    if (key !== keys.room) {
      keys.room = key;
      const owned = BUILDINGS.filter((b) => c.b[b.id] > 0);
      if (!owned.length) {
        fill(roomEl, h("p", { class: "ck2-hint" }, "La salle est vide. Achète ton premier script dans la boutique : il cliquera à ta place."));
      } else {
        fill(roomEl, ...owned.map((b) => {
          const n = c.b[b.id];
          const shown = Math.min(n, 48);
          const racks = Array.from({ length: shown }, (_, i) => h("span", { class: "ck2-rack", style: `animation-delay:${((i * 37) % 23) / 10}s` }));
          return h("div", { class: "ck2-room-row", style: `--c:${b.color}`, "data-id": b.id },
            h("div", { class: "ck2-room-label" }, h("span", { class: "ck2-icon" }, b.code), h("strong", {}, b.name), h("span", { class: "ck2-room-n" }, `×${fmt(n)}`),
              h("span", { class: "ck2-room-cps" })),
            h("div", { class: "ck2-racks" }, racks, n > shown ? h("span", { class: "ck2-more" }, `+${fmt(n - shown)}`) : null));
        }));
      }
    }
    for (const row of roomEl.querySelectorAll(".ck2-room-row")) {
      const v = buildingCps(c, row.dataset.id);
      row.querySelector(".ck2-room-cps").textContent = `${fmtRate(v)}/s · ${cps ? Math.round((v / cps) * 100) : 0} %`;
    }
  }

  function renderAchievements(c) {
    if (keys.ach === c.ach.length) return;
    keys.ach = c.ach.length;
    achHead.textContent = `${c.ach.length} / ${ACHIEVEMENTS.length} succès · signal ${Math.round(milk(c) * 100)} % (renforce les chats-bots). Chaque succès verse aussi des crédits.`;
    const groups = new Map();
    for (const a of ACHIEVEMENTS) { if (!groups.has(a.cat)) groups.set(a.cat, []); groups.get(a.cat).push(a); }
    fill(achGrid, ...[...groups].map(([cat, list]) => h("div", { class: "ck2-ach-group" },
      h("h4", {}, cat, h("span", {}, ` ${list.filter((a) => c.ach.includes(a.id)).length}/${list.length}`)),
      h("ul", {}, list.map((a) => {
        const done = c.ach.includes(a.id);
        const secret = a.cat === "Secrets" && !done;
        return h("li", { class: `ck2-ach-item${done ? " is-done" : ""}`, title: secret ? "Succès secret" : a.desc },
          h("strong", {}, secret ? "???" : a.name), h("span", {}, secret ? "Succès secret." : a.desc));
      })))));
  }

  function renderFormat(c) {
    const pending = pendingPrestige(c);
    const lvl = prestigeLevel(c);
    fill(formatInfo, h("dl", { class: "ck2-stats" },
      stat("Prestige", `${fmt(lvl)} (+${fmt(lvl * (c.heaven.includes("h_god") ? 2 : 1))} %)${c.legacy ? ` dont ${fmt(c.legacy)} hérités de l'ancien Clicker` : ""}`),
      stat("À gagner en formatant", `+${fmt(pending)} niveau${pending > 1 ? "x" : ""}`),
      stat("Prochain niveau à", `${fmt(nextPrestigeAt(c))} données minées depuis toujours`),
      stat("Minées depuis toujours", fmt(c.allTime))));
    formatButton.disabled = pending < 1;
    formatButton.textContent = pending < 1 ? "Formater (1 T de données minées au total pour commencer)"
      : confirmFormat ? "Confirmer le formatage ?" : `Formater (+${fmt(pending)} prestige)`;
    chipsEl.textContent = `Éclats : ${fmt(c.chips)}. Ils achètent l'arbre du formatage, permanent.`;

    const key = `${c.chips}|${c.heaven.join(",")}`;
    if (key === keys.heaven) return;
    keys.heaven = key;
    fill(heavenGrid, ...HEAVEN.map((node) => {
      const st = heavenState(c, node.id);
      const reqs = node.req.filter((r) => !c.heaven.includes(r)).map((r) => HEAVEN.find((x) => x.id === r).name);
      return h("li", {}, h("button", {
        class: `ck2-heaven-node is-${st}`, type: "button", disabled: st !== "ready",
        onclick: () => { if (buyHeaven(ck(), node.id)) { wallet.saveClicker(); toast("Arbre du formatage", node.name, "is-ach"); afterChange(); } }
      }, h("strong", {}, node.name), h("span", {}, node.desc),
        h("span", { class: "ck2-heaven-cost" }, st === "owned" ? "Acquis" : st === "locked" ? `Requiert : ${reqs.join(", ")}` : `${fmtShort(node.cost)} éclat${node.cost > 1 ? "s" : ""}`)));
    }));
  }

  function renderLevels(c) {
    levelHead.textContent = `Pièces bleues : ${fmtShort(wallet.blue)}. Surcadencer un bâtiment lui donne +1 % de production par niveau, pour toujours (même après un formatage). Le niveau suivant coûte une pièce de plus.`;
    const key = `${wallet.blue}|${BUILDING_IDS.map((id) => `${c.lv[id]}:${buildingVisible(c, id) ? 1 : 0}`).join(",")}`;
    if (key === keys.level) return;
    keys.level = key;
    fill(levelList, ...BUILDINGS.filter((b) => buildingVisible(c, b.id)).map((b) => {
      const cost = levelCost(c, b.id);
      return h("li", { class: "ck2-level", style: `--c:${b.color}` },
        h("span", { class: "ck2-icon" }, b.code),
        h("span", { class: "ck2-level-main" }, h("strong", {}, b.name), h("span", {}, `Niveau ${c.lv[b.id]} · +${c.lv[b.id]} %`)),
        h("button", { class: "button button-secondary", type: "button", disabled: wallet.blue < cost, onclick: () => {
          if (!wallet.spendBlue(cost)) return;
          ck().lv[b.id] += 1;
          wallet.saveClicker();
          afterChange();
        } }, h("span", { class: "coin", "aria-hidden": "true" }), ` ${cost}`));
    }));
  }

  /* ================================================================================================
     Mini-jeux
     ================================================================================================ */

  let miniRefs = null;

  function renderMini(c) {
    miniNavButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mini === miniTab)));
    const m = MINIGAMES.find((x) => x.id === miniTab);
    const unlocked = minigameUnlocked(c, m.id);
    const key = `${miniTab}|${unlocked}`;
    if (key !== keys.mini) {
      keys.mini = key;
      miniRefs = null;
      if (!unlocked) {
        fill(miniBody, h("p", { class: "ck2-hint" }, `${m.name} : ${m.desc}`),
          h("p", { class: "ck2-mini-lock" }, `Verrouillé. Achète au moins 1 ${buildingById(m.b).name.toLowerCase()} pour l'ouvrir.`));
        return;
      }
      miniRefs = miniTab === "deck" ? buildDeck() : miniTab === "pantheon" ? buildPantheon() : buildMarket();
    }
    if (miniRefs) miniRefs.update(c);
  }

  // ---------- Cyberdeck ----------
  function buildDeck() {
    const bar = h("div", { class: "ck2-ram-fill" });
    const label = h("span", { class: "ck2-ram-label" });
    const out = h("p", { class: "ck2-mini-out", role: "status" });
    const spells = SPELLS.map((sp) => {
      const cost = h("span", { class: "ck2-spell-cost" });
      const button = h("button", { class: "ck2-spell", type: "button", onclick: () => {
        const res = castSpell(ck(), sp.id);
        if (!res) return;
        if (res.gain) wallet.minedData(res.gain);
        wallet.saveClicker();
        out.textContent = `${sp.name} : ${res.text}`;
        out.dataset.tone = res.ok ? "win" : "lose";
        if (res.spawnGold) { window.clearTimeout(goldTimer); showGold(); }
        afterChange();
      } }, h("strong", {}, sp.name), h("span", {}, sp.desc), cost);
      return { sp, button, cost };
    });
    fill(miniBody,
      h("p", { class: "ck2-hint" }, "Ton cyberdeck lance des programmes avec sa RAM, qui se recharge toute seule. Plus tu as de cliniques de ripperdoc, plus tu as de RAM. Chaque programme a 15 % de chances d'échouer."),
      h("div", { class: "ck2-ram" }, bar, label),
      h("div", { class: "ck2-spells" }, spells.map((x) => x.button)),
      out);
    return { update(c) {
      const max = ramMax(c);
      const ram = c.mg.deck.ram;
      bar.style.width = `${max ? (ram / max) * 100 : 0}%`;
      label.textContent = `RAM ${Math.floor(ram)} / ${max}`;
      for (const x of spells) {
        const cost = spellCost(c, x.sp);
        x.cost.textContent = `${cost} RAM`;
        x.button.disabled = ram < cost;
      }
    } };
  }

  // ---------- Panthéon ----------
  function buildPantheon() {
    const swapsEl = h("p", { class: "ck2-hint" });
    const slotEls = SLOT_NAMES.map((name, i) => {
      const body = h("div", { class: "ck2-slot-body" });
      return { el: h("div", { class: "ck2-slot" }, h("span", { class: "ck2-slot-name" }, `${name} · ${["100", "≈60", "≈30"][i]} %`), body), body };
    });
    const list = h("ul", { class: "ck2-gods" });
    fill(miniBody,
      h("p", { class: "ck2-hint" }, "Installe jusqu'à 3 IA. L'emplacement Alpha donne tout leur effet, Bêta et Gamma un peu moins. Installer une IA coûte un échange ; les échanges se rechargent avec le temps."),
      swapsEl,
      h("div", { class: "ck2-slots" }, slotEls.map((x) => x.el)),
      list);
    let listKey = "";
    return { update(c) {
      const swaps = pantheonSwaps(c);
      const wait = Math.ceil(nextSwapIn(c) / 60000);
      swapsEl.textContent = `Échanges : ${swaps} / ${SWAP_MAX}${swaps < SWAP_MAX ? ` · prochain dans ${wait} min` : ""}`;
      const slots = c.mg.pantheon.slots;
      const key = `${swaps}|${slots.join(",")}`;
      if (key === listKey) return;
      listKey = key;
      slotEls.forEach((x, i) => {
        const g = GODS.find((y) => y.id === slots[i]);
        fill(x.body, g ? [h("strong", {}, g.name), h("span", {}, g.desc(g.value[i], i)),
          h("button", { class: "chip chip-ghost", type: "button", onclick: () => { if (removeGod(ck(), i)) { wallet.saveClicker(); afterChange(); } } }, "Retirer")]
          : h("span", { class: "ck2-hint" }, "Vide"));
      });
      fill(list, ...GODS.map((g) => {
        const at = slots.indexOf(g.id);
        return h("li", { class: `ck2-god${at >= 0 ? " is-placed" : ""}` },
          h("strong", {}, g.name), h("span", {}, g.desc(g.value[0], 0)),
          h("span", { class: "ck2-god-actions" }, SLOT_NAMES.map((name, i) => h("button", {
            class: "ck2-toggle", type: "button", disabled: at === i || swaps < 1, "aria-pressed": String(at === i), title: `Placer en ${name}`,
            onclick: () => { if (placeGod(ck(), g.id, i)) { wallet.saveClicker(); afterChange(); } }
          }, ["α", "β", "γ"][i]))));
      }));
    } };
  }

  // ---------- Bourse noire ----------
  function buildMarket() {
    const head = h("p", { class: "ck2-hint" });
    const rowsM = STOCKS.map((st, i) => {
      const price = h("span", { class: "ck2-st-price" });
      const ownedM = h("span", { class: "ck2-st-own" });
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 120 32"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "ck2-spark"); svg.setAttribute("aria-hidden", "true");
      svg.append(line);
      const act = (label, fn) => h("button", { class: "ck2-toggle", type: "button", onclick: () => { if (fn()) { wallet.saveClicker(); afterChange(); } } }, label);
      const buttons = [
        act("+1", () => buyShares(ck(), i, 1)), act("+10", () => buyShares(ck(), i, 10)), act("Max", () => buyShares(ck(), i, 1e9)),
        act("−1", () => sellShares(ck(), i, 1)), act("−10", () => sellShares(ck(), i, 10)), act("Tout", () => sellShares(ck(), i, 1e9))];
      const el = h("div", { class: "ck2-stock" },
        h("div", { class: "ck2-st-name" }, h("strong", {}, st.id), h("span", {}, st.name)),
        svg, price, ownedM,
        h("div", { class: "ck2-st-actions" }, buttons.slice(0, 3), h("span", { class: "ck2-st-sep" }), buttons.slice(3)));
      return { el, price, ownedM, line, buttons, last: "" };
    });
    fill(miniBody,
      h("p", { class: "ck2-hint" }, `Les cours sont en $ ; 1 $ vaut 1 seconde de ta production (sans Frénésie). Ils bougent chaque minute selon une tendance cachée. Commission de ${Math.round(MARKET_FEE * 100)} % à l'achat.`),
      head,
      h("div", { class: "ck2-market" }, rowsM.map((r) => r.el)));
    return { update(c) {
      const m = c.mg.market;
      const dollar = dollarValue(c);
      const left = Math.ceil((MARKET_TICK - m.t) / 1000);
      head.textContent = `1 $ = ${fmt(dollar)} données · max ${maxShares(c)} actions par corpo · bénéfice total ${m.profit >= 0 ? "+" : "−"}${fmt(Math.abs(m.profit))} · prochaine cotation dans ${left} s`;
      rowsM.forEach((r, i) => {
        const s = m.stocks[i];
        const prev = s.hist.length > 1 ? s.hist[s.hist.length - 2] : s.val;
        const up = s.val >= prev;
        r.price.textContent = `${s.val.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $ ${up ? "▲" : "▼"}`;
        r.price.dataset.tone = up ? "up" : "down";
        const avg = s.own ? s.paid / s.own / dollar / (1 + MARKET_FEE) : 0;
        r.ownedM.textContent = s.own ? `${s.own} / ${maxShares(c)} · valeur ${fmt(sharesValue(c, i, s.own))} · prix moyen ${avg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} $` : `0 / ${maxShares(c)}`;
        const unit = sharesCost(c, i, 1);
        r.buttons.slice(0, 3).forEach((b) => { b.disabled = c.data < unit || s.own >= maxShares(c); });
        r.buttons.slice(3).forEach((b) => { b.disabled = s.own < 1; });
        const key = `${s.hist.length}|${s.val}`;
        if (key !== r.last) {
          r.last = key;
          const lo = Math.min(...s.hist); const hi = Math.max(...s.hist); const span = hi - lo || 1;
          r.line.setAttribute("points", s.hist.map((v, k) => `${(k / Math.max(1, s.hist.length - 1)) * 120},${30 - ((v - lo) / span) * 28}`).join(" "));
        }
      });
    } };
  }

  function stat(label, value) { return h("div", {}, h("dt", {}, label), h("dd", {}, value)); }

  function renderStats(c, cps) {
    const minutes = Math.floor((Date.now() - c.runStart) / 60000);
    const total = BUILDING_IDS.reduce((s, id) => s + c.b[id], 0);
    fill(statsEl, 
      stat("Données en banque", fmt(c.data)),
      stat("Minées (cette partie)", fmt(c.earned)),
      stat("Minées (depuis toujours)", fmt(c.allTime)),
      stat("Production", `${fmtRate(cps)}/s (multiplicateur ×${fmtRate(globalMult(c))})`),
      stat("Par clic", fmtRate(clickValue(c))),
      stat("Clics", fmt(c.clicks)),
      stat("Minées à la main", fmt(c.hand)),
      stat("Bâtiments", fmt(total)),
      stat("Améliorations", `${c.up.length} / ${UPGRADES.length}`),
      stat("Paquets dorés attrapés", fmt(c.golds)),
      stat("Succès", `${c.ach.length} / ${ACHIEVEMENTS.length} (signal ${Math.round(milk(c) * 100)} %)`),
      stat("Formatages", fmt(c.runs)),
      stat("Durée de la partie", minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`),
      stat("Minage hors ligne", offlineRate(c) ? `${Math.round(offlineRate(c) * 100)} % (jusqu'à 3 jours)` : "Non (arbre du formatage)"),
      stat("Crédits versés au portefeuille", fmt(wallet.data.minedTotal)));
  }

  function render() {
    if (!active) return;
    const c = ck();
    const cps = perSecond(c);
    renderBank(c, cps);
    renderStore(c);
    if (tab === "room") renderRoom(c, cps);
    else if (tab === "ach") renderAchievements(c);
    else if (tab === "format") renderFormat(c);
    else if (tab === "level") renderLevels(c);
    else if (tab === "mini") renderMini(c);
    else renderStats(c, cps);
  }

  /* ================================================================================================
     Actus et pluie de bits
     ================================================================================================ */

  function nextNews() {
    newsText.classList.remove("is-in");
    void newsText.offsetWidth;
    newsText.textContent = newsFor(ck());
    newsText.classList.add("is-in");
    window.clearTimeout(newsTimer);
    newsTimer = window.setTimeout(nextNews, NEWS_MS);
  }
  news.addEventListener("click", nextNews);

  const drops = [];
  let lastFrame = 0;
  let spawn = 0;
  function rainLoop(t) {
    rainFrame = window.requestAnimationFrame(rainLoop);
    const dt = Math.min(0.05, (t - (lastFrame || t)) / 1000);
    lastFrame = t;
    const w = rain.clientWidth;
    const hgt = rain.clientHeight;
    if (!w || !hgt) return;
    if (rain.width !== w || rain.height !== hgt) { rain.width = w; rain.height = hgt; }
    const ctx = rain.getContext("2d");
    ctx.clearRect(0, 0, w, hgt);
    const cps = perSecond(ck());
    const rate = Math.min(70, cps > 0 ? 3 + 5 * Math.log10(1 + cps) : 0);
    spawn += rate * dt;
    while (spawn >= 1 && drops.length < 160) {
      spawn -= 1;
      drops.push({ x: Math.random() * w, y: -12, v: 40 + Math.random() * 90, c: Math.random() < 0.5 ? "0" : "1", a: 0.25 + Math.random() * 0.5 });
    }
    const color = themeColor("--cyan", "#00f0ff");
    ctx.font = "12px monospace";
    ctx.fillStyle = color;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.v * dt;
      if (d.y > hgt + 12) { drops.splice(i, 1); continue; }
      ctx.globalAlpha = d.a * Math.min(1, (hgt - d.y) / 60);
      ctx.fillText(d.c, d.x, d.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================================================
     Cycle de vie
     ================================================================================================ */

  wallet.subscribe(() => { if (active) render(); });
  // Vérifie les succès régulièrement (la production tourne toute seule dans arcade.js).
  window.setInterval(() => { if (active && !wallet.locked) reward(checkAchievements(ck())); }, 2000);

  selectTab("room");

  return {
    activate() {
      active = true;
      keys.upgrades = ""; keys.room = ""; keys.ach = -1; keys.heaven = ""; keys.level = ""; keys.mini = "";
      if (ck().notice === "rebalanced") {
        delete ck().notice;
        toast("Rééquilibrage", "Le prestige hérité de l'ancien Clicker était beaucoup trop fort : ta partie repart de zéro. Tu gardes tes éclats, l'arbre du formatage et le surcadençage.", "is-ach");
      }
      const off = ck().offline;
      if (off) {
        delete ck().offline;
        const hours = Math.floor(off.away / 3600e3);
        const minutes = Math.floor((off.away % 3600e3) / 60e3);
        toast("Pendant ton absence", `Le noyau a miné ${fmt(off.gain)} données (${hours ? `${hours} h ` : ""}${minutes} min).`, "is-ach");
      }
      afterChange();
      nextNews();
      scheduleGold();
      if (!prefersReducedMotion()) rainFrame = window.requestAnimationFrame(rainLoop);
    },
    deactivate() {
      active = false;
      window.clearTimeout(goldTimer);
      window.clearTimeout(newsTimer);
      hideGold();
      window.cancelAnimationFrame(rainFrame);
      lastFrame = 0;
    }
  };
}
