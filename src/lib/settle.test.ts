import { describe, expect, it } from 'vitest';
import { settle, type Balance } from './settle';
import type { Payment } from './types';

/** Applies a payment plan and checks everyone lands on zero. */
function verifyPlan(balances: Balance[], payments: Payment[]): boolean {
  const net = new Map(balances.map((b) => [b.playerId, b.netCents]));
  for (const p of payments) {
    net.set(p.fromPlayerId, (net.get(p.fromPlayerId) ?? 0) + p.amountCents);
    net.set(p.toPlayerId, (net.get(p.toPlayerId) ?? 0) - p.amountCents);
  }
  return [...net.values()].every((v) => v === 0);
}

const b = (playerId: string, dollars: number): Balance => ({
  playerId,
  netCents: Math.round(dollars * 100),
});

describe('settle', () => {
  it('returns nothing when everyone is even', () => {
    expect(settle([b('a', 0), b('b', 0)])).toEqual([]);
  });

  it('handles the simple two-player case', () => {
    const plan = settle([b('a', -20), b('b', 20)]);
    expect(plan).toEqual([{ fromPlayerId: 'a', toPlayerId: 'b', amountCents: 2000 }]);
  });

  it('never needs more than n-1 payments', () => {
    const balances = [b('a', -30), b('b', -10), b('c', 15), b('d', 25)];
    const plan = settle(balances);
    expect(plan.length).toBeLessThanOrEqual(balances.length - 1);
    expect(verifyPlan(balances, plan)).toBe(true);
  });

  it('splits independent zero-sum groups instead of chaining everyone together', () => {
    // a/b square up between themselves, c/d likewise. Greedy chaining would take 3.
    const balances = [b('a', -25), b('b', 25), b('c', -25), b('d', 25)];
    const plan = settle(balances);
    expect(plan).toHaveLength(2);
    expect(verifyPlan(balances, plan)).toBe(true);
    // Two payments means nobody is a middleman: each is a debtor paying a creditor in full.
    expect(plan.every((p) => p.amountCents === 2500)).toBe(true);
  });

  it('finds the three-way split hidden in a six-player game', () => {
    const balances = [
      b('a', -10), b('b', 10),
      b('c', -40), b('d', 40),
      b('e', -5), b('f', 5),
    ];
    expect(settle(balances)).toHaveLength(3);
  });

  it('beats naive chaining on a mixed game', () => {
    const balances = [b('a', -60), b('b', 20), b('c', 40), b('d', -15), b('e', 15)];
    const plan = settle(balances);
    // {a,b,c} settles in 2, {d,e} in 1. Chaining everyone would take 4.
    expect(plan).toHaveLength(3);
    expect(verifyPlan(balances, plan)).toBe(true);
  });

  it('absorbs a miscounted stack instead of producing an unpayable plan', () => {
    const balances = [b('a', -20), b('b', 25)];
    const plan = settle(balances);
    const paid = plan.reduce((sum, p) => sum + p.amountCents, 0);
    expect(paid).toBe(2000);
    expect(plan).toHaveLength(1);
  });

  it('ignores players who broke even', () => {
    const balances = [b('a', -10), b('b', 0), b('c', 10)];
    const plan = settle(balances);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ fromPlayerId: 'a', toPlayerId: 'c', amountCents: 1000 });
  });

  it('stays correct on a full table of odd amounts', () => {
    const balances = [
      b('a', -13.37), b('b', 42.5), b('c', -100.05), b('d', 7.92),
      b('e', 63), b('f', -0.4), b('g', 12.15), b('h', -11.75),
    ];
    const plan = settle(balances);
    expect(verifyPlan(balances, plan)).toBe(true);
    expect(plan.length).toBeLessThanOrEqual(7);
    expect(plan.every((p) => p.amountCents > 0)).toBe(true);
  });

  it('settles awkward cents exactly, with nothing left over', () => {
    const balances = [
      b('ash', -7.15), b('bo', 29.95), b('cam', -12.4), b('dee', -18.6), b('eli', 8.2),
    ];
    const plan = settle(balances);

    expect(verifyPlan(balances, plan)).toBe(true);
    // Total paid equals total owed: no rounding, nothing invented, nothing dropped.
    expect(plan.reduce((sum, p) => sum + p.amountCents, 0)).toBe(715 + 1240 + 1860);
    expect(plan.every((p) => Number.isInteger(p.amountCents))).toBe(true);
  });

  it('still pairs people off when the odd amounts happen to cancel', () => {
    const balances = [b('ash', -7.15), b('bo', 7.15), b('cam', -29.95), b('dee', 29.95)];
    const plan = settle(balances);
    expect(plan).toHaveLength(2);
    expect(verifyPlan(balances, plan)).toBe(true);
  });

  it('falls back to greedy above the exact-solver limit without breaking', () => {
    const balances = Array.from({ length: 18 }, (_, i) =>
      b(`p${i}`, i % 2 === 0 ? 10 : -10),
    );
    const plan = settle(balances);
    expect(verifyPlan(balances, plan)).toBe(true);
    expect(plan.length).toBeLessThanOrEqual(17);
  });
});
