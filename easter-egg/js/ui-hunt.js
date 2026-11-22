// js/ui-hunt.js — affichage de « Chasse aux Titans », le RPG au tour par tour (logique dans hunt.js).
// Trois écrans : le camp (liste des monstres et forge), le combat, le résultat.
// Les boutons sont de vrais boutons : jouable au doigt, à la souris et au clavier.

import {
  MONSTERS, PARTS, PART_IDS, FAMILIES, FAMILY_IDS, SLOT_NAMES, SLOT_DESCS, TIER_NAMES, MAX_TIER,
  WEAPON_ATK, ARMOR_HP, ARMOR_DEF, START_POTIONS, ENERGY_MAX,
  hunterStats, gearOf, isUnlocked, nextPurchase, buyGear, createFight, act, canSkill,
  intentName, intentKind, rewardsOf, monsterById, START_BOMBS, HARD, WEAK_BONUS
} from "./hunt.js";
import { h, fmt, scrollToPlay } from "./ui.js";

const pct = (n) => `${Math.round(n * 100)} %`;

export function createHuntUI(root, wallet) {
  let active = false;
  let screen = "camp";            // camp | fight | result
  let fight = null;
  let target = "body";
  let result = null;
  let notice = "";                // dernier message d'achat dans la forge
  let view = null;                // éléments du combat, mis à jour sur place

  /* ---------- Textes d'équipement ---------- */

  function weaponText(family, tier) {
    const fam = FAMILIES[family];
    return `${TIER_NAMES[tier]} — attaque ${fmt(Math.round(WEAPON_ATK[tier] * fam.atk))}`;
  }
  const armorText = (tier) => `${TIER_NAMES[tier]} — +${fmt(ARMOR_HP[tier])} PV, −${pct(ARMOR_DEF[tier])} de dégâts`;
  const charmText = (tier) => `${TIER_NAMES[tier]} — critique ${pct(0.05 + 0.05 * tier)}, potions ${pct(0.45 + 0.05 * tier)}`;

  /* ---------- Camp ---------- */

  function renderCamp() {
    const hunt = wallet.data.hunt;
    const stats = hunterStats(gearOf(hunt));

    const monsterRows = MONSTERS.map((m) => {
      const open = isUnlocked(hunt, m.id);
      const kills = hunt.kills[m.id] || 0;
      const button = h("button", {
        class: "button button-primary hunt-go", type: "button", "data-monster": m.id, disabled: !open,
        onclick: () => startFight(m.id)
      }, open ? "Chasser" : "Verrouillé");
      const hardButton = kills > 0 ? h("button", {
        class: "button button-secondary hunt-hard", type: "button", "data-monster": m.id,
        title: `Version enragée : ${HARD.hp}× PV, ${HARD.atk}× dégâts, ${HARD.reward}× trophées`,
        onclick: () => startFight(m.id, true)
      }, "Traque enragée") : null;
      return h("li", { class: `hunt-monster${open ? "" : " is-locked"}`, "data-monster": m.id },
        h("div", { class: "hunt-monster-info" },
          h("strong", {}, open ? m.name : "???"),
          h("span", { class: "hunt-desc" }, open ? m.desc : `Vaincs d'abord : ${MONSTERS[MONSTERS.indexOf(m) - 1].name}.`),
          open ? h("span", { class: "hunt-meta" },
            `${fmt(m.hp)} PV · ${fmt(m.reward)} ✦ · ${m.part}${kills ? ` · vaincu ×${fmt(kills)}` : ""}`) : null,
          open ? h("span", { class: "hunt-weak" }, `Faible contre : ${FAMILIES[m.weak].name} (+${Math.round((WEAK_BONUS - 1) * 100)} %)`) : null),
        h("div", { class: "hunt-monster-actions" }, button, hardButton));
    });

    const forgeRows = [];
    for (const family of FAMILY_IDS) {
      const fam = FAMILIES[family];
      const tier = hunt.weapons[family];
      const owned = tier >= 0;
      forgeRows.push(forgeRow({
        title: `${fam.name}${hunt.equipped === family ? " (équipée)" : ""}`,
        text: owned ? weaponText(family, tier) : "Non forgée",
        extra: `${fam.skill} : ${fam.skillDesc}`,
        buy: nextPurchase(hunt, "weapon", family),
        owned,
        onBuy: () => purchase("weapon", family),
        onEquip: owned && hunt.equipped !== family ? () => { wallet.huntEquip(family); } : null
      }));
    }
    forgeRows.push(forgeRow({
      title: SLOT_NAMES.armor, text: armorText(hunt.armor), extra: SLOT_DESCS.armor,
      buy: nextPurchase(hunt, "armor"), owned: true, onBuy: () => purchase("armor")
    }));
    forgeRows.push(forgeRow({
      title: SLOT_NAMES.charm, text: charmText(hunt.charm), extra: SLOT_DESCS.charm,
      buy: nextPurchase(hunt, "charm"), owned: true, onBuy: () => purchase("charm")
    }));

    const parts = MONSTERS.filter((m) => (hunt.parts[m.id] || 0) > 0)
      .map((m) => h("li", {}, `${m.part} ×${fmt(hunt.parts[m.id])}`));

    root.replaceChildren(
      h("p", { class: "game-rules" },
        "Chasse des monstres mécaniques au tour par tour. Chaque victoire rapporte des trophées ✦ (une monnaie à part, qu'on ne gagne qu'ici) et des matériaux. À la forge, l'équipement coûte des trophées plus des matériaux du monstre précédent. Chaque monstre est faible contre un type d'arme ; une fois vaincu, tu peux le défier en version enragée."),
      h("div", { class: "hunt-layout" },
        h("section", { class: "hunt-col" },
          h("h3", { class: "subhead" }, "Chasses"),
          h("ul", { class: "hunt-monsters" }, monsterRows)),
        h("section", { class: "hunt-col" },
          h("h3", { class: "subhead" }, "Forge"),
          h("p", { class: "hunt-hunter", id: "hunt-stats" },
            `Chasseur : ${fmt(stats.maxHp)} PV · attaque ${fmt(Math.round(stats.atk))} · critique ${pct(stats.crit)}`),
          notice ? h("p", { class: "ck-message", id: "hunt-notice", role: "status" }, notice) : null,
          h("ul", { class: "hunt-forge" }, forgeRows),
          h("h3", { class: "subhead" }, "Matériaux"),
          h("ul", { class: "hunt-parts" }, parts.length ? parts : [h("li", { class: "hint" }, "Aucun pour l'instant")]))));
  }

  function forgeRow({ title, text, extra, buy, owned, onBuy, onEquip }) {
    let buyButton;
    if (!buy) {
      buyButton = h("span", { class: "hunt-max" }, "Maximum");
    } else {
      const haveParts = !buy.partId || (wallet.data.hunt.parts[buy.partId] || 0) >= buy.parts;
      const haveCredits = wallet.trophies >= buy.trophies;
      const cost = buy.partId
        ? `${fmt(buy.trophies)} ✦ + ${buy.parts} × ${buy.partName}`
        : `${fmt(buy.trophies)} ✦`;
      buyButton = h("button", {
        class: "button button-secondary hunt-buy", type: "button",
        disabled: !(haveParts && haveCredits), onclick: onBuy
      }, owned ? `Améliorer : ${cost}` : `Forger : ${cost}`);
    }
    return h("li", { class: "hunt-gear" },
      h("div", { class: "hunt-gear-info" },
        h("strong", {}, title),
        h("span", {}, text),
        h("span", { class: "hunt-desc" }, extra)),
      h("div", { class: "hunt-gear-actions" },
        onEquip ? h("button", { class: "button button-secondary hunt-equip", type: "button", onclick: onEquip }, "Équiper") : null,
        buyButton));
  }

  function purchase(slot, family) {
    // Valeurs figées avant l'achat : le portefeuille notifie ses écouteurs tout de suite.
    const buy = nextPurchase(wallet.data.hunt, slot, family);
    if (!buy) return;
    const label = slot === "weapon" ? FAMILIES[family].name : SLOT_NAMES[slot];
    notice = buyGear(wallet, slot, family)
      ? `${label} : ${TIER_NAMES[buy.tier]} !`
      : "Il manque des trophées ou des matériaux.";
    renderCamp();
  }

  /* ---------- Combat ---------- */

  function bar(kind) {
    const fill = h("span", { class: `sv-bar-fill ${kind}` });
    const text = h("span", { class: "sv-bar-text" });
    return { el: h("div", { class: "sv-bar hunt-bar" }, fill, text), fill, text };
  }

  function startFight(monsterId, hard = false) {
    const hunt = wallet.data.hunt;
    const stats = hunterStats(gearOf(hunt));
    fight = createFight(monsterId, stats, Math.random, { hard });
    target = "body";
    screen = "fight";
    result = { firstKill: (hunt.kills[monsterId] || 0) === 0, hard };
    buildFight();
    scrollToPlay(root.querySelector(".hunt-fight"));
  }

  function buildFight() {
    const def = monsterById(fight.monsterId);
    const monsterBar = bar("hunt-monster-hp");
    const hunterBar = bar("sv-hp");
    const partViews = {};
    const partButtons = PART_IDS.map((id) => {
      const fill = h("span", { class: "hunt-part-fill" });
      const state = h("em", {});
      const button = h("button", {
        class: "hunt-part", type: "button", "data-part": id, "aria-pressed": "false",
        onclick: () => { target = id; update(); }
      }, h("strong", {}, `${PART_IDS.indexOf(id) + 1}. ${PARTS[id].name}`), state, h("span", { class: "hunt-part-track" }, fill));
      partViews[id] = { button, fill, state };
      return button;
    });

    const intentEl = h("p", { class: "hunt-intent", id: "hunt-intent", "aria-live": "polite" });
    const energyEl = h("span", { class: "hunt-energy", id: "hunt-energy" });
    const potionsEl = h("span", { id: "hunt-potions" });
    const bombsEl = h("span", { id: "hunt-bombs" });
    const logEl = h("ul", { class: "hunt-log", id: "hunt-log", "aria-live": "polite" });

    const fam = FAMILIES[fight.stats.family];
    const attackBtn = h("button", { class: "button button-primary", id: "hunt-attack", type: "button", onclick: () => doAct({ type: "attack", part: target }) }, "Attaquer (A)");
    const skillBtn = h("button", { class: "button button-secondary", id: "hunt-skill", type: "button", title: fam.skillDesc, onclick: () => doAct({ type: "skill", part: target }) },
      `${fam.skill} — ${fam.skillCost} énergie (E)`);
    const guardBtn = h("button", { class: "button button-secondary", id: "hunt-guard", type: "button", onclick: () => doAct({ type: "guard" }) }, "Garde (G)");
    const bombBtn = h("button", { class: "button button-secondary", id: "hunt-bomb", type: "button", title: "Dégâts fixes (3× ton attaque), sans viser", onclick: () => doAct({ type: "bomb" }) }, "Bombe (B)");
    const potionBtn = h("button", { class: "button button-secondary", id: "hunt-potion", type: "button", onclick: () => doAct({ type: "potion" }) }, "Potion (V)");
    const fleeBtn = h("button", { class: "link-button", id: "hunt-flee", type: "button", onclick: () => flee() }, "Fuir");

    view = { monsterBar, hunterBar, partViews, intentEl, energyEl, potionsEl, bombsEl, logEl, attackBtn, skillBtn, guardBtn, potionBtn, bombBtn, fleeBtn };

    root.replaceChildren(
      h("div", { class: "hunt-fight" },
        h("div", { class: "hunt-arena chamfer" },
          h("h3", { class: "hunt-name" }, fight.hard ? `${def.name} (enragé)` : def.name),
          monsterBar.el,
          intentEl,
          h("div", { class: "hunt-parts-row", role: "group", "aria-label": "Partie visée" }, partButtons)),
        h("div", { class: "hunt-hunter-panel chamfer" },
          h("p", { class: "hunt-label" }, "Chasseur"),
          hunterBar.el,
          h("p", { class: "hunt-resources" }, "Énergie ", energyEl, " · Potions ", potionsEl, " · Bombes ", bombsEl),
          h("div", { class: "hunt-actions" }, attackBtn, skillBtn, guardBtn, potionBtn, bombBtn),
          fleeBtn),
        logEl));
    update();
  }

  function update() {
    if (!fight || !view) return;
    const { monster, hunter } = fight;
    view.monsterBar.fill.style.width = `${(monster.hp / monster.maxHp) * 100}%`;
    view.monsterBar.text.textContent = `${fmt(monster.hp)} / ${fmt(monster.maxHp)} PV${monster.enraged ? " — en rage" : ""}${monster.stunned ? " — assommé" : ""}`;
    view.hunterBar.fill.style.width = `${(hunter.hp / hunter.maxHp) * 100}%`;
    view.hunterBar.text.textContent = `${fmt(hunter.hp)} / ${fmt(hunter.maxHp)} PV`;

    for (const id of PART_IDS) {
      const p = monster.parts[id];
      const v = view.partViews[id];
      v.button.setAttribute("aria-pressed", String(target === id));
      v.button.classList.toggle("is-target", target === id);
      v.button.classList.toggle("is-broken", p.broken);
      v.fill.style.width = `${(p.hp / p.max) * 100}%`;
      v.state.textContent = p.broken ? "Brisée" : `${PARTS[id].mult === 1 ? "×1" : `×${String(PARTS[id].mult).replace(".", ",")}`}`;
    }

    if (!fight.over) {
      const kind = intentKind(fight);
      view.intentEl.textContent = kind === "heavy" ? `⚠ ${intentName(fight)} : attaque lourde ! Mets-toi en garde.`
        : kind === "rattle" ? `${intentName(fight)} : te déstabilise si tu ne te protèges pas.`
        : `Prochaine attaque : ${intentName(fight)}.`;
      view.intentEl.classList.toggle("is-heavy", kind === "heavy");
    } else {
      view.intentEl.textContent = "";
    }

    view.energyEl.textContent = `${"●".repeat(hunter.energy)}${"○".repeat(ENERGY_MAX - hunter.energy)} ${hunter.energy}/${ENERGY_MAX}`;
    view.potionsEl.textContent = `${hunter.potions} / ${START_POTIONS}`;
    view.bombsEl.textContent = `${hunter.bombs} / ${START_BOMBS}`;
    view.bombBtn.disabled = fight.over || hunter.bombs <= 0;
    view.skillBtn.disabled = !canSkill(fight);
    view.potionBtn.disabled = fight.over || hunter.potions <= 0 || hunter.hp >= hunter.maxHp;
    view.logEl.replaceChildren(...fight.log.slice(-6).reverse().map((line, i) => h("li", { class: i === 0 ? "is-new" : "" }, line)));
  }

  function doAct(action) {
    if (screen !== "fight" || !fight || !act(fight, action)) return;
    if (fight.over) { finishFight(); return; }
    update();
  }

  function flee() {
    fight = null;
    view = null;
    screen = "camp";
    notice = "Tu as fui : aucune récompense.";
    renderCamp();
  }

  function finishFight() {
    update();
    // Tout est figé avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const won = fight.won;
    const monsterId = fight.monsterId;
    const def = monsterById(monsterId);
    const gain = rewardsOf(fight, result.firstKill);
    const firstKill = result.firstKill;
    const log = fight.log.slice(-4);
    if (won) wallet.huntReward(monsterId, gain);
    result = { won, def, gain, firstKill, log, turns: fight.turn };
    screen = "result";
    renderResult();
  }

  function renderResult() {
    const { won, def, gain, firstKill, log, turns } = result;
    const next = MONSTERS[MONSTERS.indexOf(def) + 1];
    root.replaceChildren(
      h("div", { class: "hunt-result chamfer", id: "hunt-result" },
        h("p", { class: "overlay-title" }, won ? "Chasse réussie" : "Chasse ratée"),
        h("p", { class: "overlay-text" }, won
          ? `${def.name} est vaincu en ${turns} tours.\n+${fmt(gain.trophies)} ✦ trophées · +${gain.parts} × ${def.part}${firstKill ? "\n(première victoire : trophées doublés)" : ""}${next && firstKill ? `\nNouveau monstre : ${next.name}` : ""}`
          : "Tu es à terre. Améliore ton équipement à la forge, ou utilise ta garde et tes potions plus tôt."),
        h("ul", { class: "hunt-log" }, log.map((line) => h("li", {}, line))),
        h("div", { class: "hunt-actions" },
          h("button", { class: "button button-primary", id: "hunt-again", type: "button", onclick: () => startFight(def.id) }, "Rechasser"),
          h("button", { class: "button button-secondary", id: "hunt-camp", type: "button", onclick: () => backToCamp() }, "Retour au camp"))));
    root.querySelector("#hunt-again")?.focus({ preventScroll: true });
  }

  function backToCamp() {
    fight = null;
    view = null;
    screen = "camp";
    notice = "";
    renderCamp();
  }

  /* ---------- Clavier ---------- */

  document.addEventListener("keydown", (event) => {
    if (!active || screen !== "fight" || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button");
    if (/^[1-3]$/.test(key)) { target = PART_IDS[Number(key) - 1]; update(); return; }
    if (onButton && (key === "enter" || key === " ")) return;
    if (key === "a") doAct({ type: "attack", part: target });
    else if (key === "e") doAct({ type: "skill", part: target });
    else if (key === "g") doAct({ type: "guard" });
    else if (key === "v") doAct({ type: "potion" });
    else if (key === "b") doAct({ type: "bomb" });
  });

  // Quand le portefeuille change hors combat, la forge se met à jour (crédits, matériaux).
  wallet.subscribe(() => { if (active && screen === "camp") renderCamp(); });

  renderCamp();

  return {
    activate() {
      active = true;
      if (screen === "camp") renderCamp();
    },
    deactivate() { active = false; }   // un combat en cours reste tel quel (au tour par tour : rien ne s'écoule)
  };
}
