// js/ui-blackjack.js — interface du Blackjack (la logique est dans blackjack.js).
// On mise des crédits : par jetons, ou en tapant une somme exacte.
//
// Les boutons sont créés une seule fois puis mis à jour sur place : le solde change
// en continu (le Clicker produit des crédits), donc on ne reconstruit jamais l'interface
// à ce moment-là, sinon on perdrait le focus et certains clics.

import {
  MIN_BET, newShoe, startRound, hit, stand, double, split, insure, canDouble, canSplit, canInsure,
  insuranceCost, currentHand, handValue, totals
} from "./blackjack.js";
import { h, fmt } from "./ui.js";

const CHIPS = [10, 50, 100, 500, 5000];
const RED_SUITS = new Set(["♥", "♦"]);

const OUTCOMES = {
  blackjack: { text: "Blackjack ! Payé 3 pour 2.", tone: "win", short: "blackjack" },
  win: { text: "Gagné !", tone: "win", short: "gagnée" },
  push: { text: "Égalité : mise rendue.", tone: "push", short: "égalité" },
  lose: { text: "Perdu : le croupier l'emporte.", tone: "lose", short: "perdue" },
  bust: { text: "Tu as dépassé 21.", tone: "lose", short: "dépassée" }
};

export function createBlackjackUI(root, wallet) {
  let shoe = newShoe();
  let round = null;
  let bet = MIN_BET;
  let lastStake = 0;
  let active = false;
  const stats = { rounds: 0, wins: 0, streak: 0, bestStreak: 0 };

  /* ---------- Squelette (créé une seule fois) ---------- */

  const dealerCards = h("div", { class: "hand-cards" });
  const dealerTotal = h("span", { class: "hand-total" });
  const playerHands = h("div", { class: "bj-hands" });
  const messageEl = h("p", { class: "bj-message", role: "status", "aria-live": "polite" },
    "Place ta mise, puis distribue.");
  const statsEl = h("p", { class: "bj-stats", id: "bj-stats" });

  const betValue = h("strong", { id: "bj-bet" }, fmt(bet));
  const betInput = h("input", {
    class: "bet-input", id: "bj-bet-input", type: "text", inputmode: "numeric", autocomplete: "off",
    pattern: "[0-9 ]*", "aria-label": "Mise exacte en crédits", placeholder: "Somme"
  });
  const chipButtons = CHIPS.map((value) =>
    h("button", { class: "chip", type: "button", onclick: () => setBet(bet + value) }, `+${fmt(value)}`));
  const halfButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(Math.floor(bet / 2)) }, "½");
  const twiceButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(bet * 2) }, "×2");
  const rebetButton = h("button", { class: "chip chip-ghost", type: "button", id: "bj-rebet", onclick: () => setBet(lastStake) }, "Dernière mise");
  const allInButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(wallet.credits) }, "Tapis");
  const clearButton = h("button", { class: "chip chip-ghost", type: "button", onclick: () => setBet(0) }, "Effacer");
  const dealButton = h("button", { class: "button button-primary", type: "button", id: "bj-deal", onclick: deal }, "Distribuer");
  const hint = h("p", { class: "hint", hidden: true },
    `Il te faut au moins ${MIN_BET} crédits. `,
    h("a", { href: "#clicker" }, "Va en miner dans le Clicker →"));

  const betPanel = h("div", { class: "bj-bet" },
    h("p", { class: "bet-line" }, "Mise : ", betValue, " crédits"),
    h("label", { class: "bet-field" }, h("span", {}, "Saisir une somme"), betInput),
    h("div", { class: "chips", role: "group", "aria-label": "Jetons de mise" },
      chipButtons, halfButton, twiceButton, rebetButton, allInButton, clearButton),
    h("div", { class: "bj-deal" }, dealButton, hint)
  );

  const hitButton = h("button", { class: "button button-primary", type: "button", id: "bj-hit", onclick: onHit }, "Tirer");
  const standButton = h("button", { class: "button button-secondary", type: "button", id: "bj-stand", onclick: onStand }, "Rester");
  const doubleButton = h("button", {
    class: "button button-secondary", type: "button", id: "bj-double",
    title: "Double la mise, une seule carte, puis tu restes", onclick: onDouble
  }, "Doubler");
  const splitButton = h("button", {
    class: "button button-secondary", type: "button", id: "bj-split", hidden: true,
    title: "Sépare une paire en deux mains (même mise sur chacune)", onclick: onSplit
  }, "Séparer");
  const insureButton = h("button", {
    class: "button button-secondary", type: "button", id: "bj-insure", hidden: true,
    title: "Moitié de la mise : payée 2 pour 1 si le croupier a un blackjack", onclick: onInsure
  }, "Assurance");
  const actionPanel = h("div", { class: "bj-actions", hidden: true },
    hitButton, standButton, doubleButton, splitButton, insureButton);

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Atteins 21 sans dépasser. Le croupier s'arrête à 17. Blackjack payé 3 pour 2. Tu peux doubler, séparer une paire (jusqu'à 4 mains) et prendre l'assurance quand le croupier montre un as."),
    h("div", { class: "bj-table chamfer" },
      h("div", { class: "hand" }, h("p", { class: "hand-label" }, "Croupier ", dealerTotal), dealerCards),
      messageEl,
      playerHands
    ),
    statsEl,
    betPanel,
    actionPanel
  );

  /* ---------- Cartes (seules les nouvelles cartes sont animées) ---------- */

  function cardNode(card, key, hidden) {
    if (hidden) return h("div", { class: "card card-back", "data-key": key, "aria-label": "Carte cachée" });
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

  /* ---------- Mains du joueur (une par main, créées au besoin) ---------- */

  const handViews = [];

  function syncHandViews() {
    while (handViews.length < round.hands.length) {
      const label = h("p", { class: "hand-label" });
      const cards = h("div", { class: "hand-cards" });
      const el = h("div", { class: "hand bj-hand" }, label, cards);
      handViews.push({ el, label, cards });
      playerHands.append(el);
    }
    while (handViews.length > round.hands.length) handViews.pop().el.remove();
  }

  function renderHands() {
    if (!round) return;
    const inRound = playing();
    syncCards(dealerCards, round.dealer, inRound ? 1 : -1);   // la 2e carte du croupier reste cachée
    dealerTotal.textContent = inRound
      ? `(${handValue([round.dealer[0]]).total} + ?)`
      : `(${totalText(round.dealer)})`;

    syncHandViews();
    const many = round.hands.length > 1;
    round.hands.forEach((hand, i) => {
      const view = handViews[i];
      syncCards(view.cards, hand.cards);
      const isActive = inRound && i === round.active;
      view.el.classList.toggle("is-active", isActive && many);
      const name = many ? `Main ${i + 1}` : "Toi";
      const result = hand.outcome ? ` — ${OUTCOMES[hand.outcome].short}` : "";
      view.label.textContent = `${name} (${totalText(hand.cards)}) · mise ${fmt(hand.bet)}${result}`;
    });
  }

  /* ---------- Mise à jour de l'affichage ---------- */

  const playing = () => Boolean(round) && round.phase === "player";

  function say(text, tone = "") {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function renderStats() {
    statsEl.textContent = stats.rounds === 0
      ? ""
      : `Manches : ${stats.rounds} · gagnées : ${stats.wins} · série : ${stats.streak} (record ${stats.bestStreak})`;
  }

  function setBet(value) {
    bet = Math.max(0, Math.min(Math.floor(value) || 0, wallet.credits));
    betInput.value = bet ? String(bet) : "";
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
      halfButton.disabled = bet < 2;
      twiceButton.disabled = bet === 0 || bet * 2 > credits;
      rebetButton.disabled = lastStake === 0 || lastStake > credits || lastStake === bet;
      allInButton.disabled = credits < MIN_BET || bet === credits;
      clearButton.disabled = bet === 0;
      dealButton.disabled = bet < MIN_BET;
      hint.hidden = credits >= MIN_BET;
    } else {
      const hand = currentHand(round);
      doubleButton.disabled = !canDouble(round) || wallet.credits < hand.bet;
      splitButton.hidden = !canSplit(round);
      splitButton.disabled = wallet.credits < hand.bet;
      insureButton.hidden = !canInsure(round);
      insureButton.disabled = wallet.credits < insuranceCost(round);
    }
  }

  // Saisie d'une somme : on lit ce que le joueur tape sans réécrire le champ pendant la frappe.
  betInput.addEventListener("input", () => {
    const digits = betInput.value.replace(/\D/g, "");
    bet = Math.min(Number(digits) || 0, wallet.credits);
    updateControls();
  });
  betInput.addEventListener("blur", () => { betInput.value = bet ? String(bet) : ""; });
  betInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); betInput.value = bet ? String(bet) : ""; deal(); }
  });

  // Remet le focus sur le bouton utile (clavier et lecteurs d'écran).
  function focusMain() {
    if (!active) return;
    (playing() ? hitButton : dealButton).focus({ preventScroll: true });
  }

  /* ---------- Déroulement ---------- */

  function finishRound() {
    // Tout est calculé avant d'écrire dans le portefeuille (ses écouteurs réagissent tout de suite).
    const { payout, net } = totals(round);
    const stake = round.baseBet;
    const results = round.hands.map((hand) => hand.outcome);
    const insured = round.insurance > 0;
    const insuranceWon = round.insurancePayout > 0;
    if (payout > 0) wallet.addCredits(payout);

    const wonRound = net > 0;
    stats.rounds += 1;
    if (wonRound) { stats.wins += 1; stats.streak += 1; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); }
    else if (net < 0) stats.streak = 0;

    const gain = net > 0 ? ` +${fmt(net)} crédits.` : net < 0 ? ` −${fmt(-net)} crédits.` : "";
    let text;
    let tone;
    if (results.length === 1) {
      const outcome = OUTCOMES[results[0]];
      text = outcome.text;
      tone = outcome.tone;
    } else {
      text = results.map((r, i) => `Main ${i + 1} : ${OUTCOMES[r].short}`).join(" · ") + ".";
      tone = net > 0 ? "win" : net < 0 ? "lose" : "push";
    }
    if (insured) text += insuranceWon ? " Assurance payée 2 pour 1." : " Assurance perdue.";
    say(text + gain, tone);

    // La mise de la prochaine manche reprend celle-ci (sans doublage ni séparation).
    lastStake = stake;
    bet = Math.min(stake, wallet.credits);
    betInput.value = bet ? String(bet) : "";
    renderStats();
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
    if (shoe.length < 40) shoe = newShoe();   // on remélange avant que le sabot soit vide

    // Nouvelle manche : on repart d'une table vide pour que toutes les cartes s'animent.
    dealerCards.replaceChildren();
    playerHands.replaceChildren();
    handViews.length = 0;

    round = startRound(stake, shoe);
    say(canInsure(round) ? "Le croupier montre un as : assurance ?" : "À toi : tirer, rester, doubler ou séparer ?");
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
    if (!playing() || !canDouble(round)) return;
    const extra = currentHand(round).bet;          // figé avant de payer
    if (!wallet.spendCredits(extra)) return;
    double(round);
    afterAction();
  }

  function onSplit() {
    if (!playing() || !canSplit(round)) return;
    const extra = currentHand(round).bet;
    if (!wallet.spendCredits(extra)) return;
    split(round);
    say("Paire séparée : joue la main en surbrillance.");
    afterAction();
  }

  function onInsure() {
    if (!playing() || !canInsure(round)) return;
    const cost = insuranceCost(round);
    if (!wallet.spendCredits(cost)) return;
    insure(round);
    if (round.phase === "player") say("Pas de blackjack pour le croupier. À toi !");
    afterAction();
  }

  // Le solde change aussi ailleurs (le Clicker produit des crédits) : mise à jour sur place.
  wallet.subscribe(() => { if (active) updateControls(); });

  setBet(MIN_BET);

  return {
    activate() { active = true; updateControls(); },
    deactivate() { active = false; }
  };
}
