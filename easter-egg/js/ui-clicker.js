// js/ui-clicker.js — interface du Clicker « Mineur de données » (logique dans clicker.js).
// Les crédits servent au Blackjack et au Tower Defense ; les pièces bleues achètent des paliers.

import {
  UPGRADES, BLUE_UPGRADES, ACHIEVEMENTS, PACKET_LIFETIME, SKILLS, SKILL_BRANCHES, CORE, REBIRTH_MIN, CRIT_MULTIPLIER,
  costOf, blueCostOf, clickPower, clickGain, perSecond, buy, buyBlue, bonusOf,
  nextPacketDelay, packetReward, packetBlueChance, checkAchievements,
  pointsEarned, pointsFree, nextThreshold, skillState, skillUp,
  shardsFor, canRebirth, refundFor, startLevels, rebirth, coreCostOf, buyCore
} from "./clicker.js";
import { h, fmt, fmtRate, prefersReducedMotion } from "./ui.js";

const MAX_POPUPS = 12;

export function createClickerUI(root, wallet) {
  let active = false;
  let clickCarry = 0;
  let checking = false;
  let packetTimer = 0;
  let packetHideTimer = 0;
  let messageTimer = 0;

  /* ---------- Squelette ---------- */

  const mineButton = h("button", { class: "mine-button", type: "button", id: "mine" },
    h("span", { class: "mine-label" }, "Miner"),
    h("span", { class: "mine-sub" }, "clic ou Entrée"));
  const popups = h("div", { class: "mine-popups", "aria-hidden": "true" });
  const packet = h("button", {
    class: "packet", type: "button", id: "packet", hidden: true,
    "aria-label": "Paquet de données : clique pour récupérer un bonus"
  }, "◆ Paquet");
  const message = h("p", { class: "ck-message", role: "status", "aria-live": "polite" });

  const powerEl = h("strong", {}, "1");
  const rateEl = h("strong", {}, "0");
  const minedEl = h("strong", {}, "0");

  const rows = UPGRADES.map((upgrade) => {
    const owned = h("span", { class: "up-owned" });
    const cost = h("span", { class: "up-cost" });
    const button = h("button", {
      class: "upgrade", type: "button", "data-id": upgrade.id,
      onclick: () => { buy(wallet, upgrade.id); afterChange(); }
    },
      h("span", { class: "up-main" }, h("strong", {}, upgrade.name), h("span", { class: "up-desc" }, upgrade.desc)),
      owned, cost);
    return { upgrade, owned, cost, button };
  });

  const blueRows = BLUE_UPGRADES.map((upgrade) => {
    const owned = h("span", { class: "up-owned" });
    const cost = h("span", { class: "up-cost" });
    const button = h("button", {
      class: "upgrade upgrade-blue", type: "button", "data-id": upgrade.id,
      onclick: () => { buyBlue(wallet, upgrade.id); afterChange(); }
    },
      h("span", { class: "up-main" }, h("strong", {}, upgrade.name), h("span", { class: "up-desc" }, upgrade.desc)),
      owned, cost);
    return { upgrade, owned, cost, button };
  });

  /* ---------- Onglets : boutique, compétences, rebirth ---------- */

  const shopPanel = h("div", { class: "ck-panel", id: "ck-panel-shop", role: "tabpanel" },
    h("h3", { class: "subhead" }, "Améliorations"),
    h("ul", { class: "upgrade-list" }, rows.map((row) => h("li", {}, row.button))),
    h("h3", { class: "subhead subhead-blue" }, h("span", { class: "coin", "aria-hidden": "true" }), " Paliers en pièces bleues"),
    h("p", { class: "hint" }, "Permanents. Chaque palier coûte un peu plus cher que le précédent."),
    h("ul", { class: "upgrade-list" }, blueRows.map((row) => h("li", {}, row.button))));

  // Compétences : un arbre par partie, remis à zéro au formatage.
  const pointsEl = h("strong", { id: "sk-points" }, "0");
  const nextPointEl = h("span", { class: "hint", id: "sk-next" });
  const skillNodes = SKILLS.map((sk) => {
    const rankEl = h("span", { class: "up-owned" });
    const costEl = h("span", { class: "up-cost" });
    const reqEl = h("span", { class: "sk-req" });
    const button = h("button", {
      class: "upgrade skill-node", type: "button", "data-skill": sk.id,
      onclick: () => { if (skillUp(wallet, sk.id)) afterChange(); }
    }, h("span", { class: "up-main" }, h("strong", {}, sk.name), h("span", { class: "up-desc" }, sk.desc), reqEl), rankEl, costEl);
    return { sk, rankEl, costEl, reqEl, button };
  });
  const skillsPanel = h("div", { class: "ck-panel", id: "ck-panel-skills", role: "tabpanel", hidden: true },
    h("p", { class: "hint" }, "Points de compétence : ", pointsEl, " ", nextPointEl),
    h("p", { class: "hint" }, "Gagnés en minant pendant la partie. Remis à zéro au formatage (Rebirth)."),
    SKILL_BRANCHES.map((branch) =>
      h("div", { class: "skill-branch" },
        h("h3", { class: "subhead" }, branch.name),
        h("ul", { class: "upgrade-list" }, skillNodes.filter((n) => n.sk.branch === branch.id).map((n) => h("li", {}, n.button))))));

  // Rebirth : on formate pour gagner des éclats, qui achètent un arbre permanent.
  const runEl = h("strong", { id: "rb-run" }, "0");
  const gainEl = h("strong", { id: "rb-gain" }, "0");
  const shardsEl = h("strong", { id: "rb-shards" }, "0");
  const rebirthInfo = h("p", { class: "hint", id: "rb-info" });
  let confirmRebirth = false;
  const rebirthButton = h("button", { class: "button button-primary", id: "rb-button", type: "button", onclick: () => doRebirth() });
  const coreRows = CORE.map((node) => {
    const rankEl = h("span", { class: "up-owned" });
    const costEl = h("span", { class: "up-cost" });
    const button = h("button", {
      class: "upgrade upgrade-shard", type: "button", "data-core": node.id,
      onclick: () => { if (buyCore(wallet, node.id)) afterChange(); }
    }, h("span", { class: "up-main" }, h("strong", {}, node.name), h("span", { class: "up-desc" }, node.desc)), rankEl, costEl);
    return { node, rankEl, costEl, button };
  });
  const rebirthPanel = h("div", { class: "ck-panel", id: "ck-panel-rebirth", role: "tabpanel", hidden: true },
    h("p", { class: "hint" },
      `Formater remet à zéro tes améliorations en crédits et tes compétences (dès ${fmt(REBIRTH_MIN)} crédits minés dans la partie). Tu gardes crédits, pièces bleues, paliers bleus, tours et succès, et tu gagnes des éclats : +2 % à tous les gains chacun, à vie, et monnaie de l'arbre ci-dessous.`),
    h("dl", { class: "ck-stats" },
      h("div", {}, h("dt", {}, "Minés (partie)"), h("dd", {}, runEl)),
      h("div", {}, h("dt", {}, "Éclats à gagner"), h("dd", {}, gainEl)),
      h("div", {}, h("dt", {}, "Éclats"), h("dd", {}, shardsEl))),
    rebirthInfo,
    rebirthButton,
    h("h3", { class: "subhead subhead-shard" }, "Arbre du Rebirth (permanent)"),
    h("ul", { class: "upgrade-list" }, coreRows.map((row) => h("li", {}, row.button))));

  const TABS = [
    { id: "shop", label: "Améliorations", panel: shopPanel },
    { id: "skills", label: "Compétences", panel: skillsPanel },
    { id: "rebirth", label: "Rebirth", panel: rebirthPanel }
  ];
  const tabButtons = TABS.map((tab) =>
    h("button", { class: "ck-tab", type: "button", role: "tab", "data-tab": tab.id, "aria-controls": `ck-panel-${tab.id}`, onclick: () => selectTab(tab.id) }, tab.label));
  const tabBar = h("div", { class: "ck-tabs", role: "tablist", "aria-label": "Sections du Clicker" }, tabButtons);

  function selectTab(id) {
    TABS.forEach((tab, i) => {
      tab.panel.hidden = tab.id !== id;
      tabButtons[i].setAttribute("aria-selected", String(tab.id === id));
    });
  }
  selectTab("shop");

  const achievementRows = ACHIEVEMENTS.map((a) => {
    const item = h("li", { class: "achievement", "data-id": a.id },
      h("strong", {}, a.name),
      h("span", { class: "ach-desc" }, a.desc),
      h("span", { class: "ach-reward" }, `+${fmt(a.reward)} ¤`));
    return { a, item };
  });
  const achievementCount = h("span", { class: "ach-count" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Mine des crédits en cliquant, puis achète des améliorations qui minent à ta place. Les crédits servent au Blackjack et à débloquer les tours du Tower Defense. Les pièces bleues (Snake, Tetris) achètent des paliers permanents."),
    h("div", { class: "ck-layout" },
      h("div", { class: "ck-mine chamfer" },
        h("div", { class: "mine-wrap" }, mineButton, popups, packet),
        message,
        h("dl", { class: "ck-stats" },
          h("div", {}, h("dt", {}, "Par clic"), h("dd", {}, powerEl)),
          h("div", {}, h("dt", {}, "Par seconde"), h("dd", {}, rateEl)),
          h("div", {}, h("dt", {}, "Crédits minés"), h("dd", {}, minedEl)))),
      h("div", { class: "ck-shop" },
        tabBar,
        shopPanel,
        skillsPanel,
        rebirthPanel)
    ),
    h("section", { class: "ck-achievements", "aria-label": "Succès" },
      h("h3", { class: "subhead" }, "Succès ", achievementCount),
      h("ul", { class: "achievement-list" }, achievementRows.map((row) => row.item)))
  );

  /* ---------- Messages ---------- */

  function say(text) {
    message.textContent = text;
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { message.textContent = ""; }, 5000);
  }

  /* ---------- Clic ---------- */

  function popup(amount, event, crit = false) {
    if (prefersReducedMotion()) return;
    while (popups.children.length >= MAX_POPUPS) popups.firstChild.remove();

    const box = popups.getBoundingClientRect();
    // Au clavier (pas de coordonnées de souris), on part du centre du bouton.
    const x = event && event.clientX ? event.clientX - box.left : box.width / 2;
    const y = event && event.clientY ? event.clientY - box.top : box.height / 2;
    const node = h("span", { class: `popup${crit ? " popup-crit" : ""}`, style: `left:${x}px; top:${y}px` }, `${crit ? "CRIT ×" + CRIT_MULTIPLIER + " " : ""}+${fmt(amount)}`);
    node.addEventListener("animationend", () => node.remove());
    popups.append(node);
  }

  mineButton.addEventListener("click", (event) => {
    const gain = clickGain(wallet.data.levels, wallet.data.blueLevels, clickCarry, bonusOf(wallet.data));
    clickCarry = gain.carry;
    wallet.addCredits(gain.whole, { mined: true, clicks: 1 });
    popup(gain.whole, event, gain.crit);
    afterChange();
  });

  /* ---------- Paquet de données : bonus aléatoire, cliquable quelques secondes ---------- */

  function hidePacket() {
    window.clearTimeout(packetHideTimer);
    packet.hidden = true;
  }

  function schedulePacket() {
    window.clearTimeout(packetTimer);
    packetTimer = window.setTimeout(showPacket, nextPacketDelay(Math.random, bonusOf(wallet.data)));
  }

  function showPacket() {
    if (!active) return;
    packet.style.left = `${8 + Math.random() * 62}%`;
    packet.style.top = `${6 + Math.random() * 78}%`;
    packet.hidden = false;
    say("Un paquet de données est apparu : clique vite !");
    packetHideTimer = window.setTimeout(() => { hidePacket(); schedulePacket(); }, PACKET_LIFETIME);
  }

  packet.addEventListener("click", () => {
    const bonus = bonusOf(wallet.data);
    const reward = packetReward(wallet.data.levels, wallet.data.blueLevels, bonus);
    const blueDrop = Math.random() < packetBlueChance(bonus);
    wallet.addCredits(reward, { mined: true });
    if (blueDrop) wallet.addBlue(1);
    hidePacket();
    say(`Paquet récupéré : +${fmt(reward)} crédits${blueDrop ? " et 1 pièce bleue !" : "."}`);
    schedulePacket();
    afterChange();
  });

  /* ---------- Succès + mise à jour ---------- */

  // Après chaque clic ou achat : on vérifie les succès, puis on rafraîchit l'écran.
  function afterChange() {
    if (!checking) {
      checking = true;
      try {
        const unlocked = checkAchievements(wallet);
        if (unlocked.length) {
          say(`Succès : ${unlocked.map((a) => `${a.name} (+${fmt(a.reward)} ¤)`).join(", ")}`);
        }
      } finally {
        checking = false;
      }
    }
    update();
  }


  function updateSkills() {
    const data = wallet.data;
    pointsEl.textContent = pointsFree(data);
    const next = nextThreshold(data);
    nextPointEl.textContent = next === null ? "(tous les points sont gagnés)" : `(prochain à ${fmt(next)} crédits minés)`;
    for (const { sk, rankEl, costEl, reqEl, button } of skillNodes) {
      const st = skillState(data, sk.id);
      rankEl.textContent = `${st.current} / ${sk.max}`;
      costEl.textContent = st.state === "max" ? "Maximum" : `${sk.cost} pt${sk.cost > 1 ? "s" : ""}`;
      reqEl.textContent = st.state === "locked" ? `Requiert : ${st.missing.map((m) => `${SKILLS.find((x) => x.id === m.id).name} ${m.rank}`).join(", ")}` : "";
      button.disabled = st.state !== "ready";
      button.classList.toggle("is-locked", st.state === "locked");
      button.classList.toggle("is-maxed", st.state === "max");
    }
  }

  function updateRebirth() {
    const data = wallet.data;
    const gain = shardsFor(data);
    runEl.textContent = fmt(data.minedRun);
    gainEl.textContent = fmt(gain);
    shardsEl.textContent = fmt(data.shards);
    const refund = refundFor(data);
    const start = startLevels(data);
    const startText = Object.keys(start).length ? ` Tu repartiras avec ${start.script} scripts et ${start.botnet} bot${start.botnet > 1 ? "s" : ""}.` : "";
    rebirthInfo.textContent = canRebirth(data)
      ? `Formater maintenant : +${fmt(gain)} éclat${gain > 1 ? "s" : ""}${refund ? `, +${fmt(refund)} crédits` : ""}.${startText}`
      : `Il faut ${fmt(REBIRTH_MIN)} crédits minés dans la partie pour obtenir au moins 1 éclat.`;
    rebirthButton.disabled = !canRebirth(data);
    rebirthButton.textContent = confirmRebirth ? "Confirmer le formatage ?" : `Formater (${data.rebirths} déjà fait${data.rebirths > 1 ? "s" : ""})`;

    for (const { node, rankEl, costEl, button } of coreRows) {
      const count = data.core[node.id] || 0;
      const price = coreCostOf(node, count);
      rankEl.textContent = `rang ${count} / ${node.max}`;
      costEl.textContent = price === null ? "Maximum" : `${fmt(price)} éclat${price > 1 ? "s" : ""}`;
      button.disabled = price === null || data.shards < price;
    }
  }

  let confirmTimer = 0;
  function doRebirth() {
    if (!canRebirth(wallet.data)) return;
    if (!confirmRebirth) {
      confirmRebirth = true;
      window.clearTimeout(confirmTimer);
      confirmTimer = window.setTimeout(() => { confirmRebirth = false; updateRebirth(); }, 5000);
      updateRebirth();
      return;
    }
    confirmRebirth = false;
    window.clearTimeout(confirmTimer);
    const result = rebirth(wallet);
    clickCarry = 0;
    if (result) say(`Formatage terminé : +${fmt(result.shards)} éclat${result.shards > 1 ? "s" : ""}.`);
    afterChange();
  }

  function update() {
    const { levels, blueLevels, achievements } = wallet.data;
    const bonus = bonusOf(wallet.data);
    powerEl.textContent = fmtRate(clickPower(levels, blueLevels, bonus));
    rateEl.textContent = fmtRate(perSecond(levels, blueLevels, bonus));
    minedEl.textContent = fmt(wallet.data.minedTotal);

    for (const { upgrade, owned, cost, button } of rows) {
      const count = levels[upgrade.id] || 0;
      const price = costOf(upgrade, count, blueLevels, bonus);
      owned.textContent = `×${count}`;
      cost.textContent = `${fmt(price)} crédits`;
      button.disabled = wallet.credits < price;
    }

    for (const { upgrade, owned, cost, button } of blueRows) {
      const count = blueLevels[upgrade.id] || 0;
      const price = blueCostOf(upgrade, count);
      owned.textContent = `niv. ${count} / ${upgrade.max}`;
      cost.textContent = price === null ? "Maximum" : `${fmt(price)} pièce${price > 1 ? "s" : ""} bleue${price > 1 ? "s" : ""}`;
      button.disabled = price === null || wallet.blue < price;
    }

    updateSkills();
    updateRebirth();

    for (const { a, item } of achievementRows) item.classList.toggle("is-done", achievements.includes(a.id));
    achievementCount.textContent = `${achievements.length} / ${ACHIEVEMENTS.length}`;
  }

  wallet.subscribe(() => { if (active) update(); });
  update();

  return {
    activate() {
      active = true;
      afterChange();
      schedulePacket();
    },
    deactivate() {
      active = false;
      window.clearTimeout(packetTimer);
      hidePacket();
    }
  };
}
