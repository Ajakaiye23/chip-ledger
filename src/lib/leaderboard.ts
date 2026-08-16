import type { GameState } from './ledger';
import type { Game } from './types';

export type LeaderboardRow = {
  key: string;
  name: string;
  netCents: number;
  buyInCents: number;
  games: number;
  /** Biggest single-game win and loss this month. */
  bestCents: number;
  worstCents: number;
  isYou: boolean;
};

export type MonthGame = {
  game: Game;
  state: GameState;
  playedAt: number;
};

/** First moment of the calendar month `at` falls in, local time. */
export function startOfMonth(at = Date.now()): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function monthLabel(at = Date.now()): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Everyone you've played with this calendar month, ranked by what they're up.
 *
 * People are grouped by account where there is one. Guests — players the host
 * tracks who have no account — are grouped by name instead, which is what you
 * want when the same "Riley" shows up at three different tables, and is the
 * best that can be done without an account to tie them to.
 */
export function monthlyLeaderboard(
  games: MonthGame[],
  myUserId: string,
  now = Date.now(),
): LeaderboardRow[] {
  const since = startOfMonth(now);
  const rows = new Map<string, LeaderboardRow>();

  for (const { state, playedAt } of games) {
    if (playedAt < since) continue;

    for (const player of state.players) {
      // Someone who never put money in isn't a participant, just an empty seat.
      if (player.startedWithCents === 0 && player.netCents === 0) continue;

      const key = player.player.user_id
        ? `user:${player.player.user_id}`
        : `name:${player.player.display_name.trim().toLowerCase()}`;

      const existing = rows.get(key);
      if (existing) {
        existing.netCents += player.netCents;
        existing.buyInCents += player.startedWithCents;
        existing.games += 1;
        existing.bestCents = Math.max(existing.bestCents, player.netCents);
        existing.worstCents = Math.min(existing.worstCents, player.netCents);
      } else {
        rows.set(key, {
          key,
          name: player.player.display_name,
          netCents: player.netCents,
          buyInCents: player.startedWithCents,
          games: 1,
          bestCents: player.netCents,
          worstCents: player.netCents,
          isYou: player.player.user_id === myUserId,
        });
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.netCents - a.netCents || b.games - a.games || a.name.localeCompare(b.name),
  );
}
