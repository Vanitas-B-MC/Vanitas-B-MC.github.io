// js/ui-blackjack.js — interface du Blackjack (la logique est dans blackjack.js).
// On mise des crédits (gagnés dans le Clicker).
//
// Les boutons sont créés une seule fois puis mis à jour sur place : le solde change
// en continu (le Clicker produit des crédits), donc on ne reconstruit jamais l'interface
// à ce moment-là, sinon on perdrait le focus et certains clics.

import { MIN_BET, newShoe, startRound, hit, stand, double, canDouble, handValue } from "./blackjack.js";
import { h, fmt } from "./ui.js";

const CHIPS = [10, 50, 100, 500];
const RED_SUITS = new Set(["♥", "♦"]);

const OUTCOMES = {
  blackjack: { text: "Blackjack ! Payé 3 pour 2.", tone: "win" },
  win: { text: "Gagné !", tone: "win" },
  push: { text: "Égalité : mise rendue.", tone: "push" },
  lose: { text: "Perdu : le croupier l'emporte.", tone: "lose" },
  bust: { text: "Tu as dépassé 21.", tone: "lose" }
};

export function createBlackjackUI(root, wallet) {
  let shoe = newShoe();
  let round = null;
  let bet = MIN_BET;
  let active = false;

  /* ---------- Squelette (créé une seule fois) ---------- */

  const dealerCards = h("div", { class: "hand-cards" });
  const dealerTotal = h("span", { class: "hand-total" });
  const playerCards = h("div", { class: "hand-cards" });
  const playerTotal = h("span", { class: "hand-total" });
  const messageEl = h("p", { class: "bj-message", role: "status", "aria-live": "polite" },
    "Place ta mise, puis distribue.");

  const betValue = h("strong", {}, fmt(bet));
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${value}`));
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");
  const dealButton = h("button", { class: "button button-primary", type: "button", id: "bj-deal", onclick: deal }, "Distribuer");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  const betPanel = h("div", { class: "bj-bet" },
    h("p", { class: "bet-line" }, "Mise : ", betValue, " crédits"),
    h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" }, chipButtons, allInButton, clearButton),
    h("div", { class: "bj-deal" }, dealButton, hint)
  );

  const hitButton = h("button", { class: "button button-primary", type: "button", id: "bj-hit", onclick: onHit }, "Tirer");
  const standButton = h("button", { class: "button button-secondary", type: "button", id: "bj-stand", onclick: onStand }, "Rester");
  const doubleButton = h("button", {
    class: "button button-secondary",
    type: "button",
    id: "bj-double",
    title: "Double la mise, une seule carte, puis tu restes",
    onclick: onDouble
  }, "Doubler");
  const actionPanel = h("div", { class: "bj-actions", hidden: true }, hitButton, standButton, doubleButton);

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Atteins 21 sans dépasser. Le croupier s'arrête à 17. Blackjack payé 3 pour 2."),
    h("div", { class: "bj-table chamfer" },
      h("div", { class: "hand" }, h("p", { class: "hand-label" }, "Croupier ", dealerTotal), dealerCards),
      messageEl,
      h("div", { class: "hand" }, h("p", { class: "hand-label" }, "Toi ", playerTotal), playerCards)
    ),
    betPanel,
    actionPanel
  );

  /* ---------- Cartes (seules les nouvelles cartes sont animées) ---------- */

  function cardNode(card, key, hidden) {
    if (hidden) {
      return h("div", { class: "card card-back", "data-key": key, "aria-label": "Carte cachée" });
    }
    return h("div", {
      class: `card${RED_SUITS.has(card.suit) ? " is-red" : ""}`,
      "data-key": key,
      "aria-label": `${card.rank} ${card.suit}`
    },
      h("span", { class: "card-rank" }, card.rank),
      h("span", { class: "card-suit" }, card.suit)
    );
  }

  // Aligne le conteneur sur la liste de cartes : garde celles qui n'ont pas changé.
  function syncCards(container, cards, hiddenIndex = -1) {
    const wanted = cards.map((card, i) => (i === hiddenIndex ? "back" : `${card.rank}${card.suit}#${i}`));
    while (container.children.length > wanted.length) container.lastChild.remove();

    wanted.forEach((key, i) => {
      const current = container.children[i];
      if (current && current.dataset.key === key) return;
      const node = cardNode(cards[i], key, i === hiddenIndex);
      if (current) current.replaceWith(node);
      else container.append(node);
    });
  }

  const totalText = (cards) => {
    const { total, soft } = handValue(cards);
    return soft && total < 21 ? `${total - 10}/${total}` : String(total);
  };

  /* ---------- Mise à jour de l'affichage ---------- */

  const playing = () => Boolean(round) && round.phase === "player";

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function setBet(value) {
    bet = Math.max(0, Math.min(value, wallet.credits));
    updateControls();
  }

  // Met à jour les boutons selon le solde et l'état de la manche, sans rien reconstruire.
  function updateControls() {
    const inRound = playing();
    betPanel.hidden = inRound;
    actionPanel.hidden = !inRound;

    if (!inRound) {
      const credits = wallet.credits;
      if (bet > credits) bet = credits;
      betValue.textContent = fmt(bet);
      chipButtons.forEach((button, i) => { button.disabled = bet + CHIPS[i] > credits; });
      allInButton.disabled = credits < MIN_BET || bet === credits;
      clearButton.disabled = bet === 0;
      dealButton.disabled = bet < MIN_BET;
      hint.hidden = credits >= MIN_BET;
    } else {
      doubleButton.disabled = !canDouble(round) || wallet.credits < round.bet;
    }
  }

  function renderHands() {
    if (!round) return;
    const inRound = playing();
    syncCards(dealerCards, round.dealer, inRound ? 1 : -1);   // la 2e carte du croupier reste cachée
    syncCards(playerCards, round.player);
    dealerTotal.textContent = inRound
      ? `(${handValue([round.dealer[0]]).total} + ?)`
      : `(${totalText(round.dealer)})`;
    playerTotal.textContent = `(${totalText(round.player)})`;
  }

  // Remet le focus sur le bouton utile (clavier et lecteurs d'écran).
  function focusMain() {
    if (!active) return;
    (playing() ? hitButton : dealButton).focus({ preventScroll: true });
  }

  /* ---------- Déroulement ---------- */

  function finishRound() {
    const outcome = OUTCOMES[round.outcome];
    if (round.payout > 0) wallet.addCredits(round.payout);

    const net = round.payout - round.bet;
    const gain = net > 0 ? ` +${fmt(net)} crédits.` : net < 0 ? ` −${fmt(-net)} crédits.` : "";
    say(outcome.text + gain, outcome.tone);

    // La mise de la prochaine manche reprend celle-ci (sans le doublage).
    bet = Math.min(round.doubled ? round.bet / 2 : round.bet, wallet.credits);
  }

  function afterAction() {
    if (round.phase === "done") finishRound();
    renderHands();
    updateControls();
    focusMain();
  }

  function deal() {
    // La mise est figée AVANT de payer : retirer les crédits prévient l'écran, qui ramène `bet`
    // au solde restant (ex. 100 crédits, mise 60 : il en reste 40, la mise passerait à 40).
    const stake = bet;
    if (stake < MIN_BET || !wallet.spendCredits(stake)) return;
    if (shoe.length < 30) shoe = newShoe();   // on remélange avant que le sabot soit vide

    // Nouvelle manche : on repart d'une table vide pour que toutes les cartes s'animent.
    dealerCards.replaceChildren();
    playerCards.replaceChildren();

    round = startRound(stake, shoe);
    say("À toi : tirer, rester ou doubler ?");
    afterAction();
  }

  function onHit() {
    if (!playing()) return;
    hit(round);
    afterAction();
  }

  function onStand() {
    if (!playing()) return;
    stand(round);
    afterAction();
  }

  function onDouble() {
    if (!playing() || !canDouble(round) || !wallet.spendCredits(round.bet)) return;
    double(round);
    afterAction();
  }

  // Le solde change aussi ailleurs (le Clicker produit des crédits) : mise à jour sur place.
  wallet.subscribe(() => { if (active) updateControls(); });

  updateControls();

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; }
  };
}
