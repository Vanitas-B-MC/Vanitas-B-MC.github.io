// js/blackjack.js — logique pure du Blackjack (aucun accès au DOM).
// Règles : le croupier tire jusqu'à 17 et s'arrête sur tous les 17.
// Blackjack payé 3 pour 2, victoire normale 1 pour 1, égalité = mise rendue.
// Actions : Tirer, Rester, Doubler (sur les deux premières cartes). Pas de split ni d'assurance.

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const MIN_BET = 10;

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

// Démarre une manche. `shoe` est modifié (les cartes sont retirées).
export function startRound(bet, shoe) {
  const round = {
    bet,
    player: [shoe.pop(), shoe.pop()],
    dealer: [shoe.pop(), shoe.pop()],
    shoe,
    phase: "player",        // player | done
    outcome: null,          // blackjack | win | push | lose | bust
    payout: 0,              // total rendu au joueur (mise comprise)
    doubled: false
  };

  // Blackjack d'un côté ou de l'autre : la manche est jouée tout de suite.
  if (isBlackjack(round.player) || isBlackjack(round.dealer)) settle(round);
  return round;
}

export function hit(round) {
  if (round.phase !== "player") return round;
  round.player.push(round.shoe.pop());
  const { total } = handValue(round.player);
  if (total > 21) settle(round);
  else if (total === 21) stand(round);
  return round;
}

export function canDouble(round) {
  return round.phase === "player" && round.player.length === 2 && !round.doubled;
}

// Double la mise (l'appelant a déjà retiré la mise supplémentaire), une seule carte, puis on reste.
export function double(round) {
  if (!canDouble(round)) return round;
  round.bet *= 2;
  round.doubled = true;
  round.player.push(round.shoe.pop());
  if (handValue(round.player).total > 21) settle(round);
  else stand(round);
  return round;
}

export function stand(round) {
  if (round.phase !== "player") return round;
  while (handValue(round.dealer).total < 17) round.dealer.push(round.shoe.pop());
  settle(round);
  return round;
}

// Calcule le résultat et le gain.
export function settle(round) {
  const player = handValue(round.player).total;
  const dealer = handValue(round.dealer).total;
  const playerBJ = isBlackjack(round.player);
  const dealerBJ = isBlackjack(round.dealer);

  if (playerBJ && dealerBJ) {
    round.outcome = "push";
    round.payout = round.bet;
  } else if (playerBJ) {
    round.outcome = "blackjack";
    round.payout = round.bet + Math.floor(round.bet * 1.5);
  } else if (dealerBJ) {
    round.outcome = "lose";
    round.payout = 0;
  } else if (player > 21) {
    round.outcome = "bust";
    round.payout = 0;
  } else if (dealer > 21 || player > dealer) {
    round.outcome = "win";
    round.payout = round.bet * 2;
  } else if (player === dealer) {
    round.outcome = "push";
    round.payout = round.bet;
  } else {
    round.outcome = "lose";
    round.payout = 0;
  }

  round.phase = "done";
  return round;
}
