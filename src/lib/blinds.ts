import type { GamePlayer } from './types';

/**
 * Who deals, and who is forced to bet before the cards come out.
 *
 * The app doesn't run the hand — it doesn't know what the pot is or who folded.
 * What it does know is the seating order and where the button was last round, so
 * it can tell the table whose deal it is and who posts what, which is the part
 * people actually argue about at 1am.
 */

export type BlindAssignment = {
  dealer: GamePlayer | null;
  smallBlind: GamePlayer | null;
  bigBlind: GamePlayer | null;
};

/** Seating order is join order — the order people actually sat down. */
export function seatedPlayers(players: GamePlayer[]): GamePlayer[] {
  return players
    .filter((p) => p.status !== 'left')
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id));
}

/**
 * Heads-up (two players) is the special case every home game gets wrong: the
 * dealer posts the small blind and acts first before the flop, rather than the
 * button being skipped.
 */
export function blindsFor(players: GamePlayer[], dealerId: string | null): BlindAssignment {
  const seats = seatedPlayers(players);
  const byId = (id: string | null) => seats.find((p) => p.id === id) ?? null;

  if (seats.length === 0 || !dealerId) {
    return { dealer: byId(dealerId), smallBlind: null, bigBlind: null };
  }

  const dealerIndex = seats.findIndex((p) => p.id === dealerId);
  if (dealerIndex === -1) return { dealer: null, smallBlind: null, bigBlind: null };

  const dealer = seats[dealerIndex];
  if (seats.length === 1) return { dealer, smallBlind: null, bigBlind: null };
  if (seats.length === 2) {
    return { dealer, smallBlind: dealer, bigBlind: seats[(dealerIndex + 1) % 2] };
  }

  return {
    dealer,
    smallBlind: seats[(dealerIndex + 1) % seats.length],
    bigBlind: seats[(dealerIndex + 2) % seats.length],
  };
}

/** "10¢ / 25¢" — the shorthand people say out loud. */
export function blindsLabel(smallCents: number, bigCents: number): string {
  const show = (cents: number) =>
    cents < 100 ? `${cents}¢` : `$${(cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  return `${show(smallCents)} / ${show(bigCents)}`;
}
