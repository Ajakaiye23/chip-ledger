import type { GameData } from '@/hooks/use-game';
import { computeGameState } from './ledger';
import { monthlyLeaderboard, type LeaderboardRow } from './leaderboard';
import { playedAt, type GameSummary } from './stats';
import type { ChipDenomination, Game, GamePlayer, LedgerEntry } from './types';

/**
 * A made-up Friday night, used by /preview so the app can be looked at before any
 * backend is wired up. Nothing here is written anywhere.
 */

export const PREVIEW_USER_ID = 'user-hannah';

const CHIPS: ChipDenomination[] = [
  { key: 'white', label: 'White', color: '#f4f4f5', valueCents: 10 },
  { key: 'red', label: 'Red', color: '#dc2626', valueCents: 25 },
  { key: 'blue', label: 'Blue', color: '#2563eb', valueCents: 50 },
  { key: 'green', label: 'Green', color: '#16a34a', valueCents: 100 },
  { key: 'black', label: 'Black', color: '#18181b', valueCents: 500 },
];

const TABLE_OPENED = Date.now() - 3 * 60 * 60 * 1000;
const t = (minutes: number) => new Date(TABLE_OPENED + minutes * 60_000).toISOString();

const game: Game = {
  id: 'game-preview',
  code: 'K4P7QX',
  name: 'Friday night',
  host_id: PREVIEW_USER_ID,
  status: 'active',
  default_chip_values: CHIPS,
  small_blind_cents: 10,
  big_blind_cents: 25,
  dealer_player_id: 'p-dev',
  hand_number: 34,
  created_at: t(0),
  ended_at: null,
};

const seat = (
  id: string,
  name: string,
  userId: string | null,
  joinedAt: number,
  finalCents: number | null,
  finalChips: Record<string, number> | null = null,
): GamePlayer => ({
  id,
  game_id: game.id,
  user_id: userId,
  display_name: name,
  status: 'active',
  joined_at: t(joinedAt),
  left_at: null,
  final_stack_cents: finalCents,
  final_chips: finalChips,
});

const players: GamePlayer[] = [
  seat('p-hannah', 'Hannah B.', PREVIEW_USER_ID, 0, 5500, { black: 10, green: 4, red: 4 }),
  seat('p-sam', 'Sam K.', 'user-sam', 2, 2500, { black: 4, green: 4, red: 4 }),
  seat('p-dev', 'Dev R.', 'user-dev', 3, 6500),
  seat('p-riley', 'Riley T.', null, 65, null),
];

const money = (
  id: string,
  playerId: string,
  kind: LedgerEntry['kind'],
  cents: number,
  at: number,
): LedgerEntry => ({
  id,
  game_id: game.id,
  player_id: playerId,
  kind,
  amount_cents: cents,
  chips: null,
  note: null,
  created_at: t(at),
});

const entries: LedgerEntry[] = [
  money('e1', 'p-hannah', 'buy_in', 4000, 5),
  money('e2', 'p-sam', 'buy_in', 4000, 5),
  money('e3', 'p-dev', 'buy_in', 4000, 6),
  money('e4', 'p-dev', 'buy_in', 2000, 70), // rebuy after a rough stretch
  money('e5', 'p-riley', 'buy_in', 4000, 66), // walked in an hour late
];

export const sampleGame: GameData = { game, players, entries, settlement: null };

/** A few nights with this crowd, for the leaderboard. */
export function sampleLeaderboard(): LeaderboardRow[] {
  const past: Game = { ...game, id: 'past-a', code: 'PASTA0', name: 'Tuesday cash game' };
  const pastPlayers = players.slice(0, 3).map((p, i) => ({
    ...p,
    id: `a-${p.id}`,
    game_id: past.id,
    final_stack_cents: [3750, 8100, 6150][i],
  }));

  return monthlyLeaderboard(
    [
      { game, state: computeGameState({ players, entries }), playedAt: Date.now() },
      {
        game: past,
        playedAt: Date.now() - 3 * 86_400_000,
        state: computeGameState({
          players: pastPlayers,
          entries: pastPlayers.map((p, i) => ({
            ...entries[0],
            id: `a-e${i}`,
            game_id: past.id,
            player_id: p.id,
            amount_cents: 6000,
          })),
        }),
      },
    ],
    PREVIEW_USER_ID,
  );
}

/** Nights of history for the stats strip and the rank card. */
export function sampleSummaries(): GameSummary[] {
  const mine = computeGameState({
    players: [players[0]],
    entries: entries.filter((e) => e.player_id === 'p-hannah'),
  }).players[0];

  const past = [
    { name: 'Tuesday cash game', daysAgo: 3, startedWith: 6000, net: -2250 },
    { name: 'Poker night at Dev\u2019s', daysAgo: 9, startedWith: 4000, net: 8175 },
    { name: 'Holiday tournament', daysAgo: 26, startedWith: 10000, net: -10000 },
    { name: 'Kitchen table hold\u2019em', daysAgo: 44, startedWith: 3000, net: 1400 },
  ].map((p, i): GameSummary => {
    const when = new Date(Date.now() - p.daysAgo * 86_400_000).toISOString();
    const pastGame: Game = {
      ...game,
      id: `past-${i}`,
      code: `PAST${i}0`,
      name: p.name,
      status: 'settled',
      created_at: when,
      ended_at: when,
    };
    return {
      game: pastGame,
      state: {
        player: { ...players[0], id: `past-player-${i}`, game_id: pastGame.id },
        startedWithCents: p.startedWith,
        cashedOutCents: 0,
        endedWithCents: p.startedWith + p.net,
        counted: true,
        netCents: p.net,
      },
      playedAt: new Date(when).getTime(),
    };
  });

  return [{ game, state: mine, playedAt: playedAt(game) }, ...past];
}
