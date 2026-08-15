import type { GameData } from '@/hooks/use-game';
import { computeGameState } from './ledger';
import { monthlyLeaderboard, type LeaderboardRow } from './leaderboard';
import { playedAt, type GameSummary } from './stats';
import type { ChipDenomination, Game, GamePlayer, LedgerEntry, Round, RoundStack } from './types';

/**
 * A finished-ish Friday night, used by /preview so the app can be looked at
 * before any backend is wired up. Nothing here is written anywhere.
 */

export const PREVIEW_USER_ID = 'user-hannah';

// Set once when the table opened, and used to score every round.
const CHIPS: ChipDenomination[] = [
  { key: 'white', label: 'White', color: '#f4f4f5', valueCents: 10 },
  { key: 'red', label: 'Red', color: '#dc2626', valueCents: 25 },
  { key: 'blue', label: 'Blue', color: '#2563eb', valueCents: 50 },
  { key: 'green', label: 'Green', color: '#16a34a', valueCents: 100 },
  { key: 'black', label: 'Black', color: '#18181b', valueCents: 500 },
];

// Tonight, so the preview's rolling-window stats look like a real evening.
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
  created_at: t(0),
  ended_at: null,
};

const players: GamePlayer[] = [
  { id: 'p-hannah', game_id: game.id, user_id: PREVIEW_USER_ID, display_name: 'Hannah', status: 'active', joined_at: t(0), left_at: null },
  { id: 'p-sam', game_id: game.id, user_id: 'user-sam', display_name: 'Sam', status: 'active', joined_at: t(2), left_at: null },
  { id: 'p-dev', game_id: game.id, user_id: 'user-dev', display_name: 'Dev', status: 'active', joined_at: t(3), left_at: null },
  { id: 'p-riley', game_id: game.id, user_id: null, display_name: 'Riley', status: 'active', joined_at: t(65), left_at: null },
];

const rounds: Round[] = [
  { id: 'r1', game_id: game.id, number: 1, status: 'closed', chip_values: CHIPS, dealer_player_id: 'p-hannah', started_at: t(5), closed_at: t(60) },
  { id: 'r2', game_id: game.id, number: 2, status: 'closed', chip_values: CHIPS, dealer_player_id: 'p-sam', started_at: t(62), closed_at: t(120) },
  { id: 'r3', game_id: game.id, number: 3, status: 'open', chip_values: CHIPS, dealer_player_id: 'p-dev', started_at: t(125), closed_at: null },
];

const money = (
  id: string,
  playerId: string,
  roundId: string,
  kind: LedgerEntry['kind'],
  cents: number,
  at: string,
): LedgerEntry => ({
  id,
  game_id: game.id,
  player_id: playerId,
  round_id: roundId,
  kind,
  amount_cents: cents,
  chips: null,
  note: null,
  created_at: at,
});

const entries: LedgerEntry[] = [
  money('e1', 'p-hannah', 'r1', 'buy_in', 4000, t(5)),
  money('e2', 'p-sam', 'r1', 'buy_in', 4000, t(5)),
  money('e3', 'p-dev', 'r1', 'buy_in', 4000, t(6)),
  money('e4', 'p-dev', 'r2', 'buy_in', 2000, t(70)),   // rebuy after a rough round
  money('e5', 'p-riley', 'r2', 'buy_in', 4000, t(66)), // walked in at round two
];

const stack = (roundId: string, playerId: string, cents: number): RoundStack => ({
  id: `${roundId}-${playerId}`,
  round_id: roundId,
  player_id: playerId,
  chips: null,
  stack_cents: cents,
});

const stacks: RoundStack[] = [
  stack('r1', 'p-hannah', 5500),
  stack('r1', 'p-sam', 3000),
  stack('r1', 'p-dev', 3500),
  stack('r2', 'p-hannah', 5500),
  stack('r2', 'p-sam', 2500),
  stack('r2', 'p-dev', 6500),
  stack('r2', 'p-riley', 3500),
];

export const sampleGame: GameData = {
  game,
  players,
  rounds,
  entries,
  stacks,
  settlement: null,
};

/** The month's standings, as they'd look after a few nights with this crowd. */
export function sampleLeaderboard(): LeaderboardRow[] {
  return monthlyLeaderboard(
    [
      { game, state: computeGameState({ players, rounds, entries, stacks }), playedAt: Date.now() },
      {
        game: { ...game, id: 'past-a', code: 'PASTA0', name: 'Tuesday cash game' },
        playedAt: Date.now() - 3 * 86_400_000,
        state: computeGameState({
          players: players.slice(0, 3).map((p) => ({ ...p, id: `a-${p.id}` })),
          rounds: [{ ...rounds[0], id: 'a-r1', game_id: 'past-a' }],
          entries: players.slice(0, 3).map((p, i) => ({
            ...entries[0],
            id: `a-e${i}`,
            game_id: 'past-a',
            player_id: `a-${p.id}`,
            round_id: 'a-r1',
            amount_cents: 6000,
          })),
          stacks: players.slice(0, 3).map((p, i) => ({
            ...stacks[0],
            id: `a-s${i}`,
            round_id: 'a-r1',
            player_id: `a-${p.id}`,
            stack_cents: [3750, 8100, 6150][i],
          })),
        }),
      },
    ],
    PREVIEW_USER_ID,
  );
}

/** A few nights of history for the dashboard stats. */
export function sampleSummaries(): GameSummary[] {
  const mine = computeGameState({
    players: [players[0]],
    rounds,
    entries: entries.filter((e) => e.player_id === 'p-hannah'),
    stacks: stacks.filter((s) => s.player_id === 'p-hannah'),
  }).players[0];

  const past = [
    { name: 'Tuesday cash game', daysAgo: 3, buyIn: 6000, net: -2250 },
    { name: 'Poker night at Dev’s', daysAgo: 9, buyIn: 4000, net: 8175 },
    { name: 'Holiday tournament', daysAgo: 26, buyIn: 10000, net: -10000 },
    { name: 'Kitchen table hold’em', daysAgo: 44, buyIn: 3000, net: 1400 },
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
        totalBuyInCents: p.buyIn,
        totalCashOutCents: 0,
        currentStackCents: p.buyIn + p.net,
        netCents: p.net,
        rounds: [],
      },
      playedAt: new Date(when).getTime(),
    };
  });

  return [{ game, state: mine, playedAt: playedAt(game, rounds[1].closed_at) }, ...past];
}
