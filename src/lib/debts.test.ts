import { describe, expect, it } from 'vitest';
import { canClearDebt, outstandingDebts } from './debts';
import type { GameDebt } from './types';

const players = [
  { id: 'p-host', user_id: 'u-host' },
  { id: 'p-sam', user_id: 'u-sam' },
  { id: 'p-guest', user_id: null },
];

const debt = (to: string): Pick<GameDebt, 'to_player_id'> => ({ to_player_id: to });

describe('canClearDebt', () => {
  it('lets the person owed clear it', () => {
    expect(canClearDebt(debt('p-sam'), { players, userId: 'u-sam', isHost: false })).toBe(true);
  });

  it('does not let the person who owes clear it', () => {
    expect(canClearDebt(debt('p-sam'), { players, userId: 'u-host', isHost: true })).toBe(false);
  });

  it('does not let a bystander clear it', () => {
    expect(canClearDebt(debt('p-sam'), { players, userId: 'u-nobody', isHost: false })).toBe(false);
  });

  it('gives a guest’s money to the host, who keeps their books', () => {
    expect(canClearDebt(debt('p-guest'), { players, userId: 'u-host', isHost: true })).toBe(true);
  });

  it('but not to another player at the table', () => {
    expect(canClearDebt(debt('p-guest'), { players, userId: 'u-sam', isHost: false })).toBe(false);
  });

  it('refuses a debt pointing at a seat that is gone', () => {
    expect(canClearDebt(debt('p-ghost'), { players, userId: 'u-host', isHost: true })).toBe(false);
  });
});

describe('outstandingDebts', () => {
  it('drops the ones already handed over in cash', () => {
    const debts = [
      { status: 'outstanding' } as GameDebt,
      { status: 'paid' } as GameDebt,
      { status: 'outstanding' } as GameDebt,
    ];
    expect(outstandingDebts(debts)).toHaveLength(2);
  });
});
