import { describe, expect, it } from 'vitest';
import { pointsForNight, standingForPoints, standingFor, RANKS } from './rank';
import type { GameSummary } from './stats';
import type { Game } from './types';

const night = (netDollars: number, status: Game['status'] = 'settled'): GameSummary =>
  ({
    game: { status } as Game,
    playedAt: Date.now(),
    state: {
      netCents: Math.round(netDollars * 100),
      startedWithCents: 4000,
      cashedOutCents: 0,
      endedWithCents: 0,
      counted: true,
      player: {} as never,
    },
  }) as GameSummary;

describe('points', () => {
  it('gives nothing for a losing or breakeven night', () => {
    expect(pointsForNight(-5000)).toBe(0);
    expect(pointsForNight(0)).toBe(0);
  });

  it('gives a point for finishing up at all', () => {
    expect(pointsForNight(1)).toBe(1);
    expect(pointsForNight(2400)).toBe(1);
  });

  it('gives more for a bigger night', () => {
    expect(pointsForNight(2500)).toBe(2);
    expect(pointsForNight(9999)).toBe(2);
    expect(pointsForNight(10000)).toBe(3);
    expect(pointsForNight(50000)).toBe(3);
  });
});

describe('ranks', () => {
  it('starts everyone on the rail', () => {
    const standing = standingForPoints(0);
    expect(standing.rank.name).toBe('Rail bird');
    expect(standing.next?.name).toBe('Limper');
    expect(standing.toNext).toBe(2);
  });

  it('moves up as points accumulate', () => {
    expect(standingForPoints(2).rank.name).toBe('Limper');
    expect(standingForPoints(5).rank.name).toBe('Grinder');
    expect(standingForPoints(10).rank.name).toBe('Regular');
    expect(standingForPoints(18).rank.name).toBe('Shark');
  });

  it('tops out without a next rank or a broken progress bar', () => {
    const top = standingForPoints(1000);
    expect(top.rank).toEqual(RANKS.at(-1));
    expect(top.next).toBeNull();
    expect(top.toNext).toBe(0);
    expect(top.progress).toBe(1);
  });

  it('reports progress through the current rank', () => {
    // Grinder is 5, Regular is 10: 7 points is two of the five along.
    expect(standingForPoints(7).progress).toBeCloseTo(0.4);
  });

  it('never goes backwards for a losing night', () => {
    const before = standingFor([night(30), night(30)]);
    const after = standingFor([night(30), night(30), night(-200)]);
    expect(after.points).toBe(before.points);
    expect(after.rank.name).toBe(before.rank.name);
  });

  it('ignores a game that is still running', () => {
    const standing = standingFor([night(100, 'active')]);
    expect(standing.points).toBe(0);
  });

  it('counts winning nights for display', () => {
    expect(standingFor([night(10), night(-10), night(80)]).winningNights).toBe(2);
  });
});
