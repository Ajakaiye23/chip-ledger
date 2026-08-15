import type { ChipCounts, ChipDenomination, GamePlayer, LedgerEntry, Round, RoundStack } from './types';

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
    return { chips: {}, totalCents: 0, exact: cents === 0 };
  }

  // Every reachable amount is a multiple of the gcd, so work in those units.
  const step = usable.reduce((g, d) => gcd(g, d.valueCents), 0);
  const target = Math.floor(cents / step);

  if (target > MAX_DP_STEPS) return greedyChange(cents, usable);

  // best[i] = fewest chips making i units; from[i] = the denomination used last.
  const best = new Int32Array(target + 1).fill(-1);
  const from = new Int32Array(target + 1).fill(-1);
  best[0] = 0;

  for (let i = 1; i <= target; i++) {
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
  return { chips, totalCents, exact: totalCents === cents };
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
  return { chips, totalCents: cents - left, exact: left === 0 };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}


export type PlayerRoundResult = {
  roundId: string;
  roundNumber: number;
  /** Stack the player started the round with, before money added this round. */
  startCents: number;
  /** Buy-ins (and positive adjustments) recorded during this round. */
  addedCents: number;
  /** Cash-outs recorded during this round. */
  removedCents: number;
  /** Stack recorded at the end of the round. */
  endCents: number;
  /** What the player actually won or lost this round. */
  netCents: number;
  /** False when nobody has entered this player's stack for the round yet. */
  recorded: boolean;
};

export type PlayerState = {
  player: GamePlayer;
  totalBuyInCents: number;
  totalCashOutCents: number;
  /** Chips in front of the player right now (value of their last recorded stack). */
  currentStackCents: number;
  /** currentStack + cashed out - bought in. Positive means they're up. */
  netCents: number;
  rounds: PlayerRoundResult[];
};

export type GameState = {
  players: PlayerState[];
  byPlayerId: Map<string, PlayerState>;
  /** Total money that has been put on the table. */
  potInCents: number;
  /** Sum of every player's net. Non-zero means a stack entry is off somewhere. */
  imbalanceCents: number;
};

type Input = {
  players: GamePlayer[];
  rounds: Round[];
  entries: LedgerEntry[];
  stacks: RoundStack[];
};

/**
 * Rebuild the whole game from its append-only rows.
 *
 * The invariant that makes late joins, walk-aways and rejoins work without any
 * special cases: a player's stack at the end of a round is
 *     start + bought in - cashed out + won/lost
 * so their net for the round is just `end - (start + added - removed)`, and a
 * player who wasn't at the table simply has no rows for that round.
 */
export function computeGameState({ players, rounds, entries, stacks }: Input): GameState {
  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  const firstRoundId = ordered[0]?.id ?? null;

  const stackKey = (roundId: string, playerId: string) => `${roundId}:${playerId}`;
  const stackMap = new Map<string, RoundStack>();
  for (const s of stacks) stackMap.set(stackKey(s.round_id, s.player_id), s);

  const states: PlayerState[] = players.map((player) => {
    const mine = entries.filter((e) => e.player_id === player.id);

    const totalBuyInCents = mine
      .filter((e) => e.kind === 'buy_in')
      .reduce((sum, e) => sum + e.amount_cents, 0);
    const totalCashOutCents = mine
      .filter((e) => e.kind === 'cash_out')
      .reduce((sum, e) => sum + e.amount_cents, 0);

    let running = 0;
    let sawStack = false;
    const results: PlayerRoundResult[] = [];

    for (const round of ordered) {
      const inRound = mine.filter(
        (e) => e.round_id === round.id || (e.round_id === null && round.id === firstRoundId),
      );
      const addedCents = inRound
        .filter((e) => e.kind === 'buy_in' || e.kind === 'adjustment')
        .reduce((sum, e) => sum + e.amount_cents, 0);
      const removedCents = inRound
        .filter((e) => e.kind === 'cash_out')
        .reduce((sum, e) => sum + e.amount_cents, 0);

      const startCents = running;
      const baseline = startCents + addedCents - removedCents;
      const recordedStack = stackMap.get(stackKey(round.id, player.id));
      const endCents = recordedStack ? recordedStack.stack_cents : baseline;

      // A player with nothing at stake in this round doesn't get a row at all.
      const touched = recordedStack != null || addedCents !== 0 || removedCents !== 0 || baseline !== 0;
      if (touched) {
        results.push({
          roundId: round.id,
          roundNumber: round.number,
          startCents,
          addedCents,
          removedCents,
          endCents,
          netCents: endCents - baseline,
          recorded: recordedStack != null,
        });
      }
      if (recordedStack) sawStack = true;
      running = endCents;
    }

    // Before any round has been scored, chips in front of you are just what you bought.
    const currentStackCents = sawStack || ordered.length > 0
      ? running
      : totalBuyInCents - totalCashOutCents;

    return {
      player,
      totalBuyInCents,
      totalCashOutCents,
      currentStackCents,
      netCents: currentStackCents + totalCashOutCents - totalBuyInCents,
      rounds: results,
    };
  });

  const byPlayerId = new Map(states.map((s) => [s.player.id, s]));
  return {
    players: states,
    byPlayerId,
    potInCents: states.reduce((sum, s) => sum + s.totalBuyInCents, 0),
    imbalanceCents: states.reduce((sum, s) => sum + s.netCents, 0),
  };
}
