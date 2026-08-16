import type { GameSummary } from './stats';

/**
 * Ranks come from nights you finished up, not from how much money you have.
 *
 * A winning night is worth a point, up $10 is worth two, up $20 is worth three.
 * The numbers are deliberately low: this is a dime-blind home game, so a good
 * night is twenty dollars, not two hundred, and a ladder nobody climbs is just
 * decoration. Losing nights cost nothing — a rating that can drop you for a bad
 * beat tends to stop people playing.
 */
export const WIN_POINT_THRESHOLDS = [
  { atLeastCents: 0, points: 1 },     // up at all
  { atLeastCents: 1000, points: 2 },  // up $10
  { atLeastCents: 2000, points: 3 },  // up $20
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
  { name: 'Limper', at: 1 },
  { name: 'Grinder', at: 3 },
  { name: 'Regular', at: 6 },
  { name: 'Shark', at: 10 },
  { name: 'Rounder', at: 15 },
  { name: 'High roller', at: 22 },
  { name: 'Legend', at: 30 },
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
