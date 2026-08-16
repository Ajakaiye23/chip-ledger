import type { GameSummary } from './stats';

/**
 * A rank you can only reach by being good, over time.
 *
 * Three things stop a lucky streak from carrying someone:
 *
 * 1. Nights are scored on return, not on dollars. Winning $20 off a $20 buy-in
 *    is a doubling; winning $20 off a $200 buy-in is a rounding error. Scoring
 *    raw profit would just rank whoever plays the biggest game.
 * 2. Losing nights take points off. A ladder that only goes up measures how long
 *    you've been showing up, not how well you play.
 * 3. Ranks need volume as well as points. You cannot be a Shark off four good
 *    nights, however good they were — variance is enormous over a handful of
 *    sessions, and any honest rating has to wait for the sample.
 *
 * Winning is worth more than losing costs, so a genuinely break-even player
 * drifts up very slowly rather than being stuck on the rail forever.
 */

export type NightScore = { atLeastReturn: number; points: number };

/** Return = profit ÷ what you put on the table. +1 means you doubled your money. */
export const NIGHT_SCORES: NightScore[] = [
  { atLeastReturn: 1, points: 3 },      // doubled up or better
  { atLeastReturn: 0.5, points: 2 },    // up 50%
  { atLeastReturn: 0.0001, points: 1 }, // up at all
  { atLeastReturn: -0.5, points: -1 },  // down, but less than half
  { atLeastReturn: -Infinity, points: -2 }, // lost half your money or worse
];

export function pointsForNight(netCents: number, startedWithCents: number): number {
  if (startedWithCents <= 0) return 0;
  if (netCents === 0) return 0;
  const ret = netCents / startedWithCents;
  return NIGHT_SCORES.find((s) => ret >= s.atLeastReturn)?.points ?? 0;
}

export type Rank = {
  name: string;
  /** Points needed. */
  points: number;
  /** And nights played, so a hot streak can't carry you on its own. */
  nights: number;
};

export const RANKS: Rank[] = [
  { name: 'Rail bird', points: 0, nights: 0 },
  { name: 'Limper', points: 2, nights: 3 },
  { name: 'Grinder', points: 6, nights: 8 },
  { name: 'Regular', points: 12, nights: 15 },
  { name: 'Shark', points: 22, nights: 25 },
  { name: 'Rounder', points: 36, nights: 40 },
  { name: 'High roller', points: 55, nights: 60 },
  { name: 'Legend', points: 80, nights: 85 },
];

export type RankStanding = {
  points: number;
  nights: number;
  rank: Rank;
  next: Rank | null;
  /** What's still missing for the next rank. */
  pointsToNext: number;
  nightsToNext: number;
  /** 0–1 through the current rank, whichever requirement is furthest behind. */
  progress: number;
  winningNights: number;
  /** Average points per night — the number that actually says how you're playing. */
  formPerNight: number;
};

export function standingFor(summaries: GameSummary[]): RankStanding {
  const played = summaries.filter(
    (s) => s.game.status !== 'active' && s.state.startedWithCents > 0 && s.state.counted,
  );

  const points = played.reduce(
    (sum, s) => sum + pointsForNight(s.state.netCents, s.state.startedWithCents),
    0,
  );

  return standingForPoints(
    points,
    played.length,
    played.filter((s) => s.state.netCents > 0).length,
  );
}

export function standingForPoints(points: number, nights: number, winningNights = 0): RankStanding {
  // Points can go negative on the night, but the ladder bottoms out at the rail.
  const floored = Math.max(0, points);

  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (floored >= RANKS[i].points && nights >= RANKS[i].nights) index = i;
  }

  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;

  const pointsToNext = next ? Math.max(0, next.points - floored) : 0;
  const nightsToNext = next ? Math.max(0, next.nights - nights) : 0;

  // Show whichever requirement is holding you back, so the bar never lies.
  const progress = next
    ? Math.min(
        (floored - rank.points) / Math.max(1, next.points - rank.points),
        (nights - rank.nights) / Math.max(1, next.nights - rank.nights),
      )
    : 1;

  return {
    points: floored,
    nights,
    rank,
    next,
    pointsToNext,
    nightsToNext,
    progress: Math.max(0, Math.min(1, progress)),
    winningNights,
    formPerNight: nights > 0 ? points / nights : 0,
  };
}
