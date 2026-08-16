import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGameState, type GameState } from './ledger';
import type { MonthGame } from './leaderboard';
import { playedAt, type GameSummary } from './stats';
import type { Game, GamePlayer, LedgerEntry, Settlement } from './types';

export type GameBundle = {
  game: Game;
  players: GamePlayer[];
  entries: LedgerEntry[];
  settlement: Settlement | null;
  state: GameState;
};

/** Everything one game needs, in four round-trips. */
export async function loadGame(
  supabase: SupabaseClient,
  gameId: string,
): Promise<GameBundle | null> {
  const [gameRes, playersRes, entriesRes, settlementRes] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
    supabase.from('game_players').select('*').eq('game_id', gameId).order('joined_at'),
    supabase.from('ledger_entries').select('*').eq('game_id', gameId).order('created_at'),
    supabase.from('settlements').select('*').eq('game_id', gameId).maybeSingle(),
  ]);

  const game = gameRes.data as Game | null;
  if (!game) return null;

  const players = (playersRes.data ?? []) as GamePlayer[];
  const entries = (entriesRes.data ?? []) as LedgerEntry[];

  return {
    game,
    players,
    entries,
    settlement: (settlementRes.data ?? null) as Settlement | null,
    state: computeGameState({ players, entries }),
  };
}

export async function findGameByCode(supabase: SupabaseClient, code: string) {
  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  return (data ?? null) as Game | null;
}

/**
 * Every game this account has ever sat in, reduced to that account's own
 * numbers. This is what the stats, the rank and the history are built from.
 */
export async function loadAccountHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<GameSummary[]> {
  const { data: seats } = await supabase
    .from('game_players')
    .select('*, games(*)')
    .eq('user_id', userId);

  const rows = (seats ?? []) as Array<GamePlayer & { games: Game | null }>;
  const withGame = rows.filter((r) => r.games);
  if (withGame.length === 0) return [];

  const { data: entryRows } = await supabase
    .from('ledger_entries')
    .select('*')
    .in('player_id', withGame.map((r) => r.id));
  const entries = (entryRows ?? []) as LedgerEntry[];

  return withGame
    .map((seat) => {
      const game = seat.games as Game;
      const state = computeGameState({
        players: [seat],
        entries: entries.filter((e) => e.player_id === seat.id),
      }).players[0];
      return { game, state, playedAt: playedAt(game) };
    })
    .sort((a, b) => b.playedAt - a.playedAt);
}

/**
 * Every table you sat at since `since`, with all of its players — the leaderboard
 * needs everyone's numbers, not just yours. Row-level security means this can only
 * ever return games you were actually in.
 */
export async function loadMonthGames(
  supabase: SupabaseClient,
  userId: string,
  since: number,
): Promise<MonthGame[]> {
  const { data: seats } = await supabase
    .from('game_players')
    .select('game_id, games(*)')
    .eq('user_id', userId);

  const rows = (seats ?? []) as unknown as Array<{ game_id: string; games: Game | null }>;
  const games = rows.map((r) => r.games).filter((g): g is Game => g !== null);
  if (games.length === 0) return [];

  const gameIds = games.map((g) => g.id);
  const [playersRes, entriesRes] = await Promise.all([
    supabase.from('game_players').select('*').in('game_id', gameIds),
    supabase.from('ledger_entries').select('*').in('game_id', gameIds),
  ]);

  const allPlayers = (playersRes.data ?? []) as GamePlayer[];
  const allEntries = (entriesRes.data ?? []) as LedgerEntry[];

  return games
    .map((game) => ({
      game,
      playedAt: playedAt(game),
      state: computeGameState({
        players: allPlayers.filter((p) => p.game_id === game.id),
        entries: allEntries.filter((e) => e.game_id === game.id),
      }),
    }))
    .filter((g) => g.playedAt >= since)
    .sort((a, b) => b.playedAt - a.playedAt);
}
