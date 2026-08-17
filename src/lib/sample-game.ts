import type { GameData } from '@/hooks/use-game';
import { computeGameState } from './ledger';
import { monthlyLeaderboard, type LeaderboardRow } from './leaderboard';
import { playedAt, type GameSummary } from './stats';
import type {
  ChipDenomination,
  Game,
  GamePlayer,
  GameRequest,
  KnownPlayer,
  LedgerEntry,
  OpenGame,
} from './types';
import type { Debt, GlobalStanding } from './types';

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

// The preview table is still running, so nothing is owed yet — debts only exist
// once a game has been settled and the plan is frozen.
export const sampleGame: GameData = { game, players, entries, settlement: null, debts: [] };

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

/** People this account has played with, in every friendship state. */
export function sampleKnownPlayers(): KnownPlayer[] {
  return [
    {
      user_id: 'user-sam',
      display_name: 'Sam K.',
      avatar_url: null,
      nights_together: 6,
      friendship_status: 'accepted',
      friendship_id: 'f1',
      they_asked: false,
    },
    {
      user_id: 'user-dev',
      display_name: 'Dev R.',
      avatar_url: null,
      nights_together: 4,
      friendship_status: 'pending',
      friendship_id: 'f2',
      they_asked: true,
    },
    {
      user_id: 'user-mo',
      display_name: 'Mo T.',
      avatar_url: null,
      nights_together: 2,
      friendship_status: 'none',
      friendship_id: null,
      they_asked: false,
    },
  ];
}

/** A friend's table that's still running. */
export function sampleOpenGames(): OpenGame[] {
  return [
    {
      game_id: 'game-sams',
      name: "Sam's Saturday",
      host_name: 'Sam K.',
      seats_taken: 5,
      already_in: false,
      pending_request: false,
    },
  ];
}

/** An invitation waiting to be answered. */
export function sampleRequests(): Array<GameRequest & { game_name: string; other_name: string }> {
  return [
    {
      id: 'r1',
      game_id: 'game-sams',
      user_id: PREVIEW_USER_ID,
      kind: 'invite',
      status: 'pending',
      created_by: 'user-sam',
      created_at: new Date().toISOString(),
      game_name: "Sam's Saturday",
      other_name: 'Sam K.',
    },
  ];
}

/** Money still owed after a couple of settled nights. */
export function sampleDebts(): Debt[] {
  return [
    {
      id: 'd1',
      game_id: 'past-0',
      game_name: 'Tuesday cash game',
      amount_cents: 1250,
      direction: 'owed_to_me',
      other_name: 'Dev R.',
      status: 'outstanding',
      settled_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
    {
      id: 'd2',
      game_id: 'past-1',
      game_name: 'Poker night at Dev\u2019s',
      amount_cents: 800,
      direction: 'owed_to_me',
      other_name: 'Mo T.',
      status: 'outstanding',
      settled_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    },
    {
      id: 'd3',
      game_id: 'past-2',
      game_name: 'Holiday tournament',
      amount_cents: 2000,
      direction: 'i_owe',
      other_name: 'Sam K.',
      status: 'outstanding',
      settled_at: new Date(Date.now() - 26 * 86_400_000).toISOString(),
    },
  ];
}

/** The global board, ranked on percentage return. */
export function sampleGlobalBoard(): GlobalStanding[] {
  return [
    { user_id: 'u1', display_name: 'Priya N.', staked_cents: 24000, net_cents: 9600, return_pct: 40, nights: 9, is_me: false },
    { user_id: 'u2', display_name: 'Dev R.', staked_cents: 61000, net_cents: 14030, return_pct: 23, nights: 21, is_me: false },
    { user_id: 'u3', display_name: 'Tom W.', staked_cents: 12000, net_cents: 1800, return_pct: 15, nights: 4, is_me: false },
    { user_id: 'user-sam', display_name: 'Sam K.', staked_cents: 44000, net_cents: 3520, return_pct: 8, nights: 16, is_me: false },
    { user_id: PREVIEW_USER_ID, display_name: 'Hannah B.', staked_cents: 27000, net_cents: -1175, return_pct: -4.4, nights: 5, is_me: true },
    { user_id: 'u5', display_name: 'Mo T.', staked_cents: 15500, net_cents: -3100, return_pct: -20, nights: 6, is_me: false },
  ];
}
