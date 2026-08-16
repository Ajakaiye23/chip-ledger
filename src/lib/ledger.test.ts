import { describe, expect, it } from 'vitest';
import { chipsToCents, computeGameState, makeChange } from './ledger';
import {
  DEFAULT_CHIPS,
  chipGranularityCents,
  type ChipDenomination,
  type GamePlayer,
  type LedgerEntry,
} from './types';

const player = (id: string, finalCents: number | null = null): GamePlayer => ({
  id,
  game_id: 'g1',
  user_id: null,
  display_name: id,
  status: 'active',
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
  final_stack_cents: finalCents,
  final_chips: null,
});

const entry = (
  playerId: string,
  dollars: number,
  kind: LedgerEntry['kind'] = 'buy_in',
): LedgerEntry => ({
  id: `${playerId}-${kind}-${dollars}`,
  game_id: 'g1',
  player_id: playerId,
  kind,
  amount_cents: dollars * 100,
  chips: null,
  note: null,
  created_at: '2026-01-01T00:00:00Z',
});

describe('chip maths', () => {
  it('values a stack from its chip counts', () => {
    expect(chipsToCents({ red: 3, blue: 2 }, DEFAULT_CHIPS)).toBe(3 * 25 + 2 * 50);
  });

  it('breaks an amount into the fewest chips', () => {
    expect(makeChange(1_35, DEFAULT_CHIPS).chips).toEqual({ green: 1, red: 1, white: 1 });
    expect(makeChange(13_75, DEFAULT_CHIPS).chips).toEqual({ black: 2, green: 3, blue: 1, red: 1 });
  });

  // Greedy takes a quarter for 30c and then can't place the last nickel.
  it('makes change on denominations where biggest-first fails', () => {
    const awkward: ChipDenomination[] = [
      { key: 'a', label: 'Dime', color: '#fff', valueCents: 10 },
      { key: 'b', label: 'Quarter', color: '#f00', valueCents: 25 },
      { key: 'c', label: 'Half', color: '#00f', valueCents: 50 },
      { key: 'd', label: 'Three quarters', color: '#0f0', valueCents: 75 },
      { key: 'e', label: 'Dollar', color: '#000', valueCents: 100 },
    ];

    const thirty = makeChange(30, awkward);
    expect(thirty.exact).toBe(true);
    expect(thirty.chips).toEqual({ a: 3 });

    for (let cents = 5; cents <= 500; cents += 5) {
      const made = makeChange(cents, awkward);
      expect(chipsToCents(made.chips, awkward)).toBe(made.totalCents);
      if (made.exact) expect(made.totalCents).toBe(cents);
    }
  });

  it('says so when an amount cannot be made from these chips', () => {
    const dimesAndQuarters: ChipDenomination[] = [
      { key: 'a', label: 'Dime', color: '#fff', valueCents: 10 },
      { key: 'b', label: 'Quarter', color: '#f00', valueCents: 25 },
    ];

    const nickel = makeChange(5, dimesAndQuarters);
    expect(nickel.exact).toBe(false);
    expect(nickel.totalCents).toBe(0);

    const awkward = makeChange(37, dimesAndQuarters);
    expect(awkward.exact).toBe(false);
    expect(awkward.totalCents).toBe(35);
  });

  it('reports what the smallest expressible amount is', () => {
    expect(chipGranularityCents(DEFAULT_CHIPS)).toBe(5);
    expect(chipGranularityCents([{ key: 'a', label: 'A', color: '#fff', valueCents: 100 }])).toBe(100);
  });
});

describe('computeGameState', () => {
  it('nets a night from what people started and ended with', () => {
    const state = computeGameState({
      players: [player('p1', 5500), player('p2', 2500)],
      entries: [entry('p1', 40), entry('p2', 40)],
    });

    expect(state.byPlayerId.get('p1')!.netCents).toBe(1500);
    expect(state.byPlayerId.get('p2')!.netCents).toBe(-1500);
    expect(state.potInCents).toBe(8000);
    expect(state.imbalanceCents).toBe(0);
    expect(state.uncounted).toBe(0);
  });

  it('counts a rebuy as more money started with', () => {
    const state = computeGameState({
      players: [player('p1', 3000)],
      entries: [entry('p1', 20), entry('p1', 20)],
    });

    const p1 = state.byPlayerId.get('p1')!;
    expect(p1.startedWithCents).toBe(4000);
    expect(p1.netCents).toBe(-1000);
  });

  it('treats a cash-out as money off the table, not a loss', () => {
    const state = computeGameState({
      players: [player('p1', 0)],
      entries: [entry('p1', 20), entry('p1', 20, 'cash_out')],
    });
    expect(state.byPlayerId.get('p1')!.netCents).toBe(0);
  });

  it('leaves an uncounted player at zero rather than guessing', () => {
    const state = computeGameState({
      players: [player('counted', 5000), player('not-yet')],
      entries: [entry('counted', 40), entry('not-yet', 40)],
    });

    const pending = state.byPlayerId.get('not-yet')!;
    expect(pending.counted).toBe(false);
    expect(pending.endedWithCents).toBeNull();
    expect(pending.netCents).toBe(0);
    expect(state.uncounted).toBe(1);
  });

  it('flags a final count that does not reconcile', () => {
    const state = computeGameState({
      players: [player('p1', 6000), player('p2', 2500)],
      entries: [entry('p1', 40), entry('p2', 40)],
    });
    // $85 counted off a table that only had $80 on it.
    expect(state.imbalanceCents).toBe(500);
  });

  it('handles someone who never bought in', () => {
    const state = computeGameState({ players: [player('watcher')], entries: [] });
    const watcher = state.byPlayerId.get('watcher')!;
    expect(watcher.startedWithCents).toBe(0);
    expect(watcher.netCents).toBe(0);
    expect(state.uncounted).toBe(0);
  });
});
