'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadGame } from '@/lib/queries';
import type { Game, GameDebt, GamePlayer, LedgerEntry, Settlement } from '@/lib/types';

export type GameData = {
  game: Game;
  players: GamePlayer[];
  entries: LedgerEntry[];
  settlement: Settlement | null;
  debts: GameDebt[];
};

/**
 * Postgres sends one event per changed row, but the things that happen at a
 * table change many rows at once — settling a game rewrites the settlement, the
 * game, and a debt row for every payment in the plan. Refetching on each of
 * those separately meant one tap produced a burst of round-trips from every
 * phone at the table at the same moment, which is a good way to get rate
 * limited by the API for a table of eight.
 *
 * A quarter of a second of quiet is long enough for a burst to land and short
 * enough that nobody notices the wait.
 */
const COALESCE_MS = 250;

/**
 * Keeps the table in sync for everyone sitting at it. Any write by any player
 * pushes a Postgres change through Supabase realtime; we refetch the whole game
 * rather than patching rows, because the game is small and a stale ledger is
 * worse than an extra round-trip.
 */
export function useGame(initial: GameData) {
  const gameId = initial.game.id;
  const [data, setData] = useState<GameData>(initial);
  const [syncing, setSyncing] = useState(false);

  // At most one refetch in flight, and at most one queued behind it. Without
  // this a slow network turns a burst into overlapping requests that can also
  // land out of order, briefly showing an older ledger than the one on screen.
  const run = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    busy: false,
    queued: false,
    mounted: true,
  });

  const refresh = useCallback(
    async function fetchGame(): Promise<void> {
      const s = run.current;
      if (s.busy) {
        s.queued = true;
        return;
      }
      s.busy = true;
      setSyncing(true);
      try {
        const bundle = await loadGame(createClient(), gameId);
        if (bundle && s.mounted) {
          setData({
            game: bundle.game,
            players: bundle.players,
            entries: bundle.entries,
            settlement: bundle.settlement,
            debts: bundle.debts,
          });
        }
      } finally {
        s.busy = false;
        if (s.mounted) setSyncing(false);
        if (s.queued && s.mounted) {
          s.queued = false;
          void fetchGame();
        }
      }
    },
    [gameId],
  );

  /** Coalesce a burst of row events into a single refetch. */
  const schedule = useCallback(() => {
    const s = run.current;
    if (s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      void refresh();
    }, COALESCE_MS);
  }, [refresh]);

  useEffect(() => {
    const s = run.current;
    s.mounted = true;

    const supabase = createClient();
    const gameFilter = `game_id=eq.${gameId}`;
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: gameFilter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: gameFilter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: gameFilter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: gameFilter }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, schedule)
      .subscribe();

    // Phones suspend websockets in the background; catch up when the app returns.
    const onVisible = () => document.visibilityState === 'visible' && schedule();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      s.mounted = false;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [gameId, schedule]);

  return { data, refresh, syncing };
}
