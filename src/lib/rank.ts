import type { GameSummary } from './stats';

/**
 * Ranks come from nights you finished up, not from how much money you have.
 *
 * A winning night is worth a point; a good winning night is worth more. Losing
 * nights cost nothing — this is a record of what you've done, not a rating that
 * punishes you for a bad beat, and a ladder that can drop you tends to stop
 * people playing.
 */
export const WIN_POINT_THRESHOLDS = [
  { atLeastCents: 0, points: 1 },      // up at all
  { atLeastCents: 2500, points: 2 },   // up $25
  { atLeastCents: 10000, points: 3 },  // up $100
] as const;

export function pointsForNight(netCents: number): number {
  if (netCents <= 0) return 0;
  return WIN_POINT_THRESHOLDS.reduce(
    (best, t) => (netCents >= t.atLeastCents ? Math.max(best, t.points) : best),
    0,
  );
}

export type Rank = {
  name: string;
  /** Points needed to reach it. */
  at: number;
};

export const RANKS: Rank[] = [
  { name: 'Rail bird', at: 0 },
  { name: 'Limper', at: 2 },
  { name: 'Grinder', at: 5 },
  { name: 'Regular', at: 10 },
  { name: 'Shark', at: 18 },
  { name: 'Rounder', at: 30 },
  { name: 'High roller', at: 45 },
  { name: 'Legend', at: 65 },
];

export type RankStanding = {
  points: number;
  rank: Rank;
  next: Rank | null;
  /** Points still needed for the next rank, or 0 at the top. */
  toNext: number;
  /** 0–1 through the current rank, for a progress bar. */
  progress: number;
  winningNights: number;
};

export function standingFor(summaries: GameSummary[]): RankStanding {
  const nights = summaries.filter((s) => s.game.status !== 'active');
  const points = nights.reduce((sum, s) => sum + pointsForNight(s.state.netCents), 0);
  return standingForPoints(points, nights.filter((s) => s.state.netCents > 0).length);
}

export function standingForPoints(points: number, winningNights = 0): RankStanding {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (points >= RANKS[i].at) index = i;

  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const span = next ? next.at - rank.at : 0;

  return {
    points,
    rank,
    next,
    toNext: next ? next.at - points : 0,
    progress: next && span > 0 ? Math.min(1, (points - rank.at) / span) : 1,
    winningNights,
  };
}
