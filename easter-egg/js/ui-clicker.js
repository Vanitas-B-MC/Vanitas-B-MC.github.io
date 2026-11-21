// js/ui-clicker.js — interface du Clicker « Mineur de données » (logique dans clicker.js).
// Les crédits servent au Blackjack et au Tower Defense ; les pièces bleues achètent des paliers.

import {
  UPGRADES, BLUE_UPGRADES, ACHIEVEMENTS, PACKET_LIFETIME,
  costOf, blueCostOf, clickPower, clickGain, perSecond, buy, buyBlue,
  nextPacketDelay, packetReward, checkAchievements
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
        h("h3", { class: "subhead" }, "Améliorations"),
        h("ul", { class: "upgrade-list" }, rows.map((row) => h("li", {}, row.button))),
        h("h3", { class: "subhead subhead-blue" }, h("span", { class: "coin", "aria-hidden": "true" }), " Paliers en pièces bleues"),
        h("p", { class: "hint" }, "Permanents. Chaque palier coûte un peu plus cher que le précédent."),
        h("ul", { class: "upgrade-list" }, blueRows.map((row) => h("li", {}, row.button))))
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

  function popup(amount, event) {
    if (prefersReducedMotion()) return;
    while (popups.children.length >= MAX_POPUPS) popups.firstChild.remove();

    const box = popups.getBoundingClientRect();
    // Au clavier (pas de coordonnées de souris), on part du centre du bouton.
    const x = event && event.clientX ? event.clientX - box.left : box.width / 2;
    const y = event && event.clientY ? event.clientY - box.top : box.height / 2;
    const node = h("span", { class: "popup", style: `left:${x}px; top:${y}px` }, `+${fmt(amount)}`);
    node.addEventListener("animationend", () => node.remove());
    popups.append(node);
  }

  mineButton.addEventListener("click", (event) => {
    const gain = clickGain(wallet.data.levels, wallet.data.blueLevels, clickCarry);
    clickCarry = gain.carry;
    wallet.addCredits(gain.whole, { mined: true, clicks: 1 });
    popup(gain.whole, event);
    afterChange();
  });

  /* ---------- Paquet de données : bonus aléatoire, cliquable quelques secondes ---------- */

  function hidePacket() {
    window.clearTimeout(packetHideTimer);
    packet.hidden = true;
  }

  function schedulePacket() {
    window.clearTimeout(packetTimer);
    packetTimer = window.setTimeout(showPacket, nextPacketDelay());
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
    const reward = packetReward(wallet.data.levels, wallet.data.blueLevels);
    wallet.addCredits(reward, { mined: true });
    hidePacket();
    say(`Paquet récupéré : +${fmt(reward)} crédits.`);
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

  function update() {
    const { levels, blueLevels, achievements } = wallet.data;
    powerEl.textContent = fmtRate(clickPower(levels, blueLevels));
    rateEl.textContent = fmtRate(perSecond(levels, blueLevels));
    minedEl.textContent = fmt(wallet.data.minedTotal);

    for (const { upgrade, owned, cost, button } of rows) {
      const count = levels[upgrade.id] || 0;
      const price = costOf(upgrade, count, blueLevels);
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
