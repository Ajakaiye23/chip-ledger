import type { ChipCounts, ChipDenomination, GamePlayer, LedgerEntry } from './types';

export function chipsToCents(chips: ChipCounts | null | undefined, denoms: ChipDenomination[]): number {
  if (!chips) return 0;
  return denoms.reduce((sum, d) => sum + (chips[d.key] ?? 0) * d.valueCents, 0);
}

export type ChipBreakdown = {
  chips: ChipCounts;
  /** What the breakdown is actually worth — equals the amount asked for when `exact`. */
  totalCents: number;
  /** False when these denominations can't make the amount at all. */
  exact: boolean;
  /**
   * The smallest amount above the one asked for that these chips *can* make.
   *
   * Rounding down alone is not a usable suggestion: the nearest amount below 7c
   * on a dime table is nothing at all, and "take $0.00 instead" is not an offer.
   * Null when the amount was exact, or when the fallback path ran.
   */
  nextUpCents: number | null;
};

const MAX_DP_STEPS = 2_000_000;

/**
 * Break an amount into chips, using as few chips as possible.
 *
 * Taking the biggest denomination first is the obvious approach and it is WRONG
 * for the sets people actually use. With dimes, quarters, halves and 75c chips,
 * greedy makes 30c into one quarter and then can't place the last nickel — even
 * though three dimes is right there. Sets where greedy works ("canonical" ones)
 * are the exception, not the rule, so this does the real thing: a shortest-path
 * DP over amounts.
 *
 * When an amount simply cannot be made — 5c out of dimes and quarters — it
 * returns the closest reachable amount below it and flags `exact: false`, so the
 * UI can say so instead of quietly pocketing the difference.
 */
export function makeChange(cents: number, denoms: ChipDenomination[]): ChipBreakdown {
  const usable = denoms.filter((d) => d.valueCents > 0);
  if (cents <= 0 || usable.length === 0) {
    return { chips: {}, totalCents: 0, exact: cents === 0, nextUpCents: null };
  }

  // Every reachable amount is a multiple of the gcd, so work in those units.
  const step = usable.reduce((g, d) => gcd(g, d.valueCents), 0);
  const target = Math.floor(cents / step);
  const smallest = Math.min(...usable.map((d) => d.valueCents)) / step;

  // Run past the target by one chip. If L is the largest reachable amount at or
  // below the target then L + smallest is reachable and above it, so the nearest
  // amount above the target is always found inside that margin.
  const ceiling = target + smallest;
  if (ceiling > MAX_DP_STEPS) return greedyChange(cents, usable);

  // best[i] = fewest chips making i units; from[i] = the denomination used last.
  const best = new Int32Array(ceiling + 1).fill(-1);
  const from = new Int32Array(ceiling + 1).fill(-1);
  best[0] = 0;

  for (let i = 1; i <= ceiling; i++) {
    for (let d = 0; d < usable.length; d++) {
      const units = usable[d].valueCents / step;
      if (units > i) continue;
      const prev = best[i - units];
      if (prev < 0) continue;
      if (best[i] < 0 || prev + 1 < best[i]) {
        best[i] = prev + 1;
        from[i] = d;
      }
    }
  }

  // Walk down to the largest amount we can actually build.
  let at = target;
  while (at > 0 && best[at] < 0) at--;

  const chips: ChipCounts = {};
  let cursor = at;
  while (cursor > 0) {
    const d = usable[from[cursor]];
    chips[d.key] = (chips[d.key] ?? 0) + 1;
    cursor -= d.valueCents / step;
  }

  const totalCents = at * step;
  if (totalCents === cents) {
    return { chips, totalCents, exact: true, nextUpCents: null };
  }

  let up = target + 1;
  while (up <= ceiling && best[up] < 0) up++;

  return {
    chips,
    totalCents,
    exact: false,
    nextUpCents: up <= ceiling ? up * step : null,
  };
}

/** Fallback for absurdly large amounts, where the exact DP isn't worth the memory. */
function greedyChange(cents: number, denoms: ChipDenomination[]): ChipBreakdown {
  const sorted = [...denoms].sort((a, b) => b.valueCents - a.valueCents);
  const chips: ChipCounts = {};
  let left = cents;
  for (const d of sorted) {
    const n = Math.floor(left / d.valueCents);
    if (n > 0) {
      chips[d.key] = n;
      left -= n * d.valueCents;
    }
  }
  return { chips, totalCents: cents - left, exact: left === 0, nextUpCents: null };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export type PlayerState = {
  player: GamePlayer;
  /** Money put on the table: buy-ins and rebuys. */
  startedWithCents: number;
  /** Money taken back off the table mid-game. */
  cashedOutCents: number;
  /** The final count, once someone has made it. */
  endedWithCents: number | null;
  /** True once this player has been counted up. */
  counted: boolean;
  /** endedWith + cashedOut - startedWith. Zero until they're counted. */
  netCents: number;
};

export type GameState = {
  players: PlayerState[];
  byPlayerId: Map<string, PlayerState>;
  /** Total money that has been put on the table. */
  potInCents: number;
  /** How many players still need counting. */
  uncounted: number;
  /**
   * Counted chips minus money in. Non-zero means somebody's final count is off,
   * because poker is zero-sum: what comes off the table is what went onto it.
   */
  imbalanceCents: number;
};

/**
 * The whole night, from two numbers per player.
 *
 * Buy-ins are append-only rows so a rebuy at midnight is just another row; the
 * final count lives on the player's seat because there is exactly one of them.
 * Nothing here needs to know about rounds, hands, or who won which pot — which
 * is the point: at the table you count chips once, at the end.
 */
export function computeGameState({
  players,
  entries,
}: {
  players: GamePlayer[];
  entries: LedgerEntry[];
}): GameState {
  const states: PlayerState[] = players.map((player) => {
    const mine = entries.filter((e) => e.player_id === player.id);

    const startedWithCents = mine
      .filter((e) => e.kind === 'buy_in' || e.kind === 'adjustment')
      .reduce((sum, e) => sum + e.amount_cents, 0);
    const cashedOutCents = mine
      .filter((e) => e.kind === 'cash_out')
      .reduce((sum, e) => sum + e.amount_cents, 0);

    const counted = player.final_stack_cents != null;
    const endedWithCents = counted ? player.final_stack_cents : null;

    return {
      player,
      startedWithCents,
      cashedOutCents,
      endedWithCents,
      counted,
      netCents: counted ? (endedWithCents ?? 0) + cashedOutCents - startedWithCents : 0,
    };
  });

  const counted = states.filter((s) => s.counted);

  return {
    players: states,
    byPlayerId: new Map(states.map((s) => [s.player.id, s])),
    potInCents: states.reduce((sum, s) => sum + s.startedWithCents, 0),
    uncounted: states.filter((s) => !s.counted && s.startedWithCents > 0).length,
    // Only meaningful once everyone has been counted, so the UI checks that first.
    imbalanceCents: counted.reduce((sum, s) => sum + s.netCents, 0),
  };
}
