// js/blackjack.js — logique pure du Blackjack (aucun accès au DOM).
// Règles : le croupier tire jusqu'à 17 et s'arrête sur tous les 17.
// Blackjack payé 3 pour 2, victoire normale 1 pour 1, égalité = mise rendue.
// Actions : Tirer, Rester, Doubler (sur les deux premières cartes d'une main), Séparer une paire
// (jusqu'à 4 mains), Assurance (quand le croupier montre un as : coûte la moitié de la mise, paye 2 pour 1
// si le croupier a un blackjack). Après une séparation, un 21 n'est pas un blackjack et les as séparés
// ne reçoivent qu'une carte.

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const MIN_BET = 10;
export const MAX_HANDS = 4;

// Un sabot de plusieurs jeux de 52 cartes.
export function newShoe(decks = 4, rng = Math.random) {
  const shoe = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) shoe.push({ rank, suit });
    }
  }
  // Mélange de Fisher-Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function cardValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

// Total d'une main : les as valent 11, ou 1 si on dépasserait 21.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

// Une main du joueur.
const newHand = (bet, cards, fromSplit = false) => ({
  cards, bet, doubled: false, done: false, fromSplit, outcome: null, payout: 0
});

// Démarre une manche. `shoe` est modifié (les cartes sont retirées).
// Si le croupier montre un as, le blackjack du croupier n'est vérifié qu'à la première action :
// le joueur peut d'abord prendre l'assurance.
export function startRound(bet, shoe) {
  const round = {
    shoe,
    dealer: [],
    hands: [],
    active: 0,
    phase: "player",        // player | done
    insurance: 0,           // montant de l'assurance (0 = non prise)
    insurancePayout: 0,
    peeked: false,          // le croupier a-t-il déjà regardé sa carte cachée ?
    baseBet: bet
  };
  const p1 = shoe.pop();
  const d1 = shoe.pop();
  const p2 = shoe.pop();
  const d2 = shoe.pop();
  round.hands.push(newHand(bet, [p1, p2]));
  round.dealer.push(d1, d2);

  if (isBlackjack(round.hands[0].cards) || round.dealer[0].rank !== "A") {
    round.peeked = true;
    if (isBlackjack(round.hands[0].cards) || isBlackjack(round.dealer)) settle(round);
  }
  return round;
}

export const currentHand = (round) => round.hands[round.active];

// Le croupier regarde sa carte cachée avant la première action du joueur.
function peek(round) {
  if (round.peeked) return false;
  round.peeked = true;
  if (isBlackjack(round.dealer)) { settle(round); return true; }
  return false;
}

export const canInsure = (round) =>
  round.phase === "player" && !round.peeked && round.insurance === 0 && round.dealer[0].rank === "A";

export const insuranceCost = (round) => Math.max(1, Math.floor(round.baseBet / 2));

// L'appelant a déjà retiré le coût de l'assurance.
export function insure(round) {
  if (!canInsure(round)) return round;
  round.insurance = insuranceCost(round);
  peek(round);
  return round;
}

// Passe à la main suivante, ou fait jouer le croupier quand toutes les mains sont jouées.
function advance(round) {
  while (round.active < round.hands.length && round.hands[round.active].done) round.active += 1;
  if (round.active >= round.hands.length) {
    round.active = round.hands.length - 1;
    settle(round);
  }
}

export function hit(round) {
  if (round.phase !== "player" || peek(round)) return round;
  const hand = currentHand(round);
  hand.cards.push(round.shoe.pop());
  const { total } = handValue(hand.cards);
  if (total >= 21) hand.done = true;
  advance(round);
  return round;
}

export function stand(round) {
  if (round.phase !== "player" || peek(round)) return round;
  currentHand(round).done = true;
  advance(round);
  return round;
}

export function canDouble(round) {
  const hand = currentHand(round);
  return round.phase === "player" && hand.cards.length === 2 && !hand.doubled && !hand.done;
}

// Double la mise de la main (l'appelant a déjà retiré la mise supplémentaire), une seule carte, puis on reste.
export function double(round) {
  if (!canDouble(round) || peek(round)) return round;
  const hand = currentHand(round);
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(round.shoe.pop());
  hand.done = true;
  advance(round);
  return round;
}

export function canSplit(round) {
  const hand = currentHand(round);
  return round.phase === "player" && round.hands.length < MAX_HANDS && hand.cards.length === 2 &&
    !hand.doubled && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
}

// Sépare la paire en deux mains (l'appelant a déjà retiré la mise de la nouvelle main).
export function split(round) {
  if (!canSplit(round) || peek(round)) return round;
  const hand = currentHand(round);
  const [a, b] = hand.cards;
  const aces = a.rank === "A";
  hand.cards = [a, round.shoe.pop()];
  hand.fromSplit = true;
  const second = newHand(hand.bet, [b, round.shoe.pop()], true);
  round.hands.splice(round.active + 1, 0, second);
  if (aces) { hand.done = true; second.done = true; }       // as séparés : une seule carte chacun
  for (const x of [hand, second]) if (handValue(x.cards).total === 21) x.done = true;
  advance(round);
  return round;
}

// Le croupier joue (s'il reste une main en vie), puis chaque main est réglée.
export function settle(round) {
  const dealerBJ = isBlackjack(round.dealer);
  const alive = round.hands.some((hd) => handValue(hd.cards).total <= 21);
  if (alive && !dealerBJ) {
    while (handValue(round.dealer).total < 17) round.dealer.push(round.shoe.pop());
  }
  const dealer = handValue(round.dealer).total;

  for (const hand of round.hands) {
    const player = handValue(hand.cards).total;
    const playerBJ = round.hands.length === 1 && !hand.fromSplit && isBlackjack(hand.cards);
    if (playerBJ && dealerBJ) { hand.outcome = "push"; hand.payout = hand.bet; }
    else if (playerBJ) { hand.outcome = "blackjack"; hand.payout = hand.bet + Math.floor(hand.bet * 1.5); }
    else if (dealerBJ) { hand.outcome = "lose"; hand.payout = 0; }
    else if (player > 21) { hand.outcome = "bust"; hand.payout = 0; }
    else if (dealer > 21 || player > dealer) { hand.outcome = "win"; hand.payout = hand.bet * 2; }
    else if (player === dealer) { hand.outcome = "push"; hand.payout = hand.bet; }
    else { hand.outcome = "lose"; hand.payout = 0; }
    hand.done = true;
  }

  round.insurancePayout = round.insurance > 0 && dealerBJ ? round.insurance * 3 : 0;
  round.phase = "done";
  return round;
}

// Totaux de la manche : ce qui a été misé (mains + assurance) et ce qui revient au joueur.
export function totals(round) {
  const staked = round.hands.reduce((sum, hd) => sum + hd.bet, 0) + round.insurance;
  const payout = round.hands.reduce((sum, hd) => sum + hd.payout, 0) + round.insurancePayout;
  return { staked, payout, net: payout - staked };
}
