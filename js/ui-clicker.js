// js/ui-clicker.js — interface du Clicker « Mineur de données » (logique dans clicker.js).
// Les crédits gagnés ici servent au Blackjack.

import { UPGRADES, costOf, clickPower, perSecond, buy } from "./clicker.js";
import { h, fmt, prefersReducedMotion } from "./ui.js";

const MAX_POPUPS = 12;

export function createClickerUI(root, wallet) {
  let active = false;

  /* ---------- Squelette ---------- */

  const mineButton = h("button", { class: "mine-button", type: "button", id: "mine" },
    h("span", { class: "mine-label" }, "Miner"),
    h("span", { class: "mine-sub" }, "clic ou Entrée"));
  const popups = h("div", { class: "mine-popups", "aria-hidden": "true" });
  const powerEl = h("strong", {}, "1");
  const rateEl = h("strong", {}, "0");
  const totalClicksEl = h("strong", {}, "0");

  const rows = UPGRADES.map((upgrade) => {
    const owned = h("span", { class: "up-owned" });
    const cost = h("span", { class: "up-cost" });
    const button = h("button", {
      class: "upgrade",
      type: "button",
      "data-id": upgrade.id,
      onclick: () => { buy(wallet, upgrade.id); update(); }
    },
      h("span", { class: "up-main" },
        h("strong", {}, upgrade.name),
        h("span", { class: "up-desc" }, upgrade.desc)),
      owned,
      cost);
    return { upgrade, owned, cost, button };
  });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Mine des crédits en cliquant, puis achète des améliorations qui minent à ta place. Les crédits servent au Blackjack."),
    h("div", { class: "ck-layout" },
      h("div", { class: "ck-mine chamfer" },
        h("div", { class: "mine-wrap" }, mineButton, popups),
        h("dl", { class: "ck-stats" },
          h("div", {}, h("dt", {}, "Par clic"), h("dd", {}, powerEl)),
          h("div", {}, h("dt", {}, "Par seconde"), h("dd", {}, rateEl)),
          h("div", {}, h("dt", {}, "Clics (session)"), h("dd", {}, totalClicksEl)))),
      h("div", { class: "ck-shop" },
        h("h3", { class: "subhead" }, "Améliorations"),
        h("ul", { class: "upgrade-list" }, rows.map((row) => h("li", {}, row.button))))
    )
  );

  /* ---------- Clic ---------- */

  let clicks = 0;

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
    const gain = clickPower(wallet.data.levels);
    wallet.addCredits(gain);
    clicks += 1;
    popup(gain, event);
    update();
  });

  /* ---------- Mise à jour sur place ---------- */

  function update() {
    const levels = wallet.data.levels;
    powerEl.textContent = fmt(clickPower(levels));
    rateEl.textContent = fmt(perSecond(levels));
    totalClicksEl.textContent = fmt(clicks);

    for (const { upgrade, owned, cost, button } of rows) {
      const count = levels[upgrade.id] || 0;
      const price = costOf(upgrade, count);
      owned.textContent = `×${count}`;
      cost.textContent = `${fmt(price)} crédits`;
      button.disabled = wallet.credits < price;
    }
  }

  wallet.subscribe(() => { if (active) update(); });
  update();

  return {
    activate() { active = true; update(); },
    deactivate() { active = false; }
  };
}
