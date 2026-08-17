import { describe, expect, it } from 'vitest';
import { pointsForNight, standingFor, standingForPoints, RANKS } from './rank';
import type { GameSummary } from './stats';
import type { Game } from './types';

/** A finished night: bought in for $40, finished up or down by `netDollars`. */
const night = (netDollars: number, startedDollars = 40): GameSummary =>
  ({
    game: { status: 'settled' } as Game,
    playedAt: Date.now(),
    state: {
      netCents: Math.round(netDollars * 100),
      startedWithCents: Math.round(startedDollars * 100),
      cashedOutCents: 0,
      endedWithCents: 0,
      counted: true,
      player: {} as never,
    },
  }) as GameSummary;

const nights = (count: number, netDollars: number) =>
  Array.from({ length: count }, () => night(netDollars));

describe('scoring a night', () => {
  it('scores on what you made relative to what you risked', () => {
    // $20 up off a $20 buy-in is a doubling. Off $200 it's barely anything.
    expect(pointsForNight(2000, 2000)).toBe(3);
    expect(pointsForNight(2000, 20000)).toBe(1);
  });

  it('rewards the size of the win, in returns', () => {
    expect(pointsForNight(4000, 4000)).toBe(3); // doubled
    expect(pointsForNight(2000, 4000)).toBe(2); // up 50%
    expect(pointsForNight(100, 4000)).toBe(1); // up a little
  });

  it('takes points off for losing, more for losing badly', () => {
    expect(pointsForNight(-1000, 4000)).toBe(-1); // down 25%
    expect(pointsForNight(-3000, 4000)).toBe(-2); // down 75%
    expect(pointsForNight(-4000, 4000)).toBe(-2); // lost the lot
  });

  it('scores a breakeven night as nothing either way', () => {
    expect(pointsForNight(0, 4000)).toBe(0);
  });

  it('counts a win as a win however thin it is', () => {
    // A cent up off a $200 buy-in is a return of 0.00005. It is still a night
    // the player finished ahead, and must never score as a losing one.
    expect(pointsForNight(1, 20000)).toBe(1);
    expect(pointsForNight(1, 1_000_000)).toBe(1);
    // And a cent down is still a loss.
    expect(pointsForNight(-1, 20000)).toBe(-1);
  });

  it('ignores a night where nothing was staked', () => {
    expect(pointsForNight(500, 0)).toBe(0);
  });
});

describe('the ladder', () => {
  it('will not promote on a hot streak alone', () => {
    // Five doublings is 15 points — plenty — but only five nights played.
    const hotStreak = standingFor(nights(5, 40));
    expect(hotStreak.points).toBe(15);
    expect(hotStreak.rank.name).toBe('Limper');
    expect(hotStreak.nightsToNext).toBeGreaterThan(0);
    expect(hotStreak.pointsToNext).toBe(0); // points are fine; it's the sample that isn't
  });

  it('will not promote on volume alone', () => {
    // Forty nights of losing gets you nowhere, however loyal.
    const grinder = standingFor(nights(40, -20));
    expect(grinder.points).toBe(0);
    expect(grinder.rank.name).toBe('Rail bird');
  });

  it('promotes someone who wins consistently over a real sample', () => {
    // 25 nights, winning about two thirds of them.
    const record = [
      ...nights(14, 20),  // up 50%: 2 points each
      ...nights(3, 45),   // doubled: 3 each
      ...nights(8, -15),  // down under half: -1 each
    ];
    const standing = standingFor(record);
    expect(standing.nights).toBe(25);
    expect(standing.points).toBe(14 * 2 + 3 * 3 - 8);
    expect(standing.rank.name).toBe('Shark');
  });

  it('drops nobody below the rail, however badly it goes', () => {
    const standing = standingFor(nights(20, -40));
    expect(standing.points).toBe(0);
    expect(standing.rank.name).toBe('Rail bird');
    expect(standing.progress).toBeGreaterThanOrEqual(0);
  });

  it('lets a losing run cost a rank', () => {
    const good = standingFor([...nights(15, 30)]);
    const thenBad = standingFor([...nights(15, 30), ...nights(10, -30)]);
    expect(thenBad.points).toBeLessThan(good.points);
    expect(RANKS.findIndex((r) => r.name === thenBad.rank.name)).toBeLessThanOrEqual(
      RANKS.findIndex((r) => r.name === good.rank.name),
    );
  });

  it('reports whichever requirement is actually holding you back', () => {
    const plentyOfPoints = standingForPoints(50, 4);
    expect(plentyOfPoints.pointsToNext).toBe(0);
    expect(plentyOfPoints.nightsToNext).toBeGreaterThan(0);

    const plentyOfNights = standingForPoints(0, 50);
    expect(plentyOfNights.nightsToNext).toBe(0);
    expect(plentyOfNights.pointsToNext).toBeGreaterThan(0);
  });

  it('tops out cleanly', () => {
    const top = standingForPoints(500, 500);
    expect(top.rank).toEqual(RANKS.at(-1));
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
    expect(top.pointsToNext).toBe(0);
  });

  it('ignores games still in progress', () => {
    const live = {
      ...night(100),
      game: { status: 'active' } as Game,
    } as GameSummary;
    expect(standingFor([live]).nights).toBe(0);
  });

  it('reports form as points per night', () => {
    const standing = standingFor(nights(10, 20));
    expect(standing.formPerNight).toBeCloseTo(2);
  });
});
