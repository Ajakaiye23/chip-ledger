export type ChipDenomination = {
  /** Stable key used in chip-count maps. Lowercase colour slug, e.g. "blue". */
  key: string;
  label: string;
  /** CSS colour used to render the chip. */
  color: string;
  valueCents: number;
};

/** { chipKey: count } */
export type ChipCounts = Record<string, number>;

export type GameStatus = 'active' | 'settled';
export type RoundStatus = 'open' | 'closed';
export type PlayerStatus = 'active' | 'away' | 'left';
export type LedgerKind = 'buy_in' | 'cash_out' | 'adjustment';

export type Game = {
  id: string;
  code: string;
  name: string;
  host_id: string;
  status: GameStatus;
  default_chip_values: ChipDenomination[];
  small_blind_cents: number;
  big_blind_cents: number;
  created_at: string;
  ended_at: string | null;
};

export type GamePlayer = {
  id: string;
  game_id: string;
  user_id: string | null;
  display_name: string;
  status: PlayerStatus;
  joined_at: string;
  left_at: string | null;
};

export type Round = {
  id: string;
  game_id: string;
  number: number;
  status: RoundStatus;
  chip_values: ChipDenomination[];
  /** Who deals this round; the button moves one seat each round. */
  dealer_player_id: string | null;
  started_at: string;
  closed_at: string | null;
};

export type LedgerEntry = {
  id: string;
  game_id: string;
  player_id: string;
  round_id: string | null;
  kind: LedgerKind;
  amount_cents: number;
  chips: ChipCounts | null;
  note: string | null;
  created_at: string;
};

export type RoundStack = {
  id: string;
  round_id: string;
  player_id: string;
  chips: ChipCounts | null;
  stack_cents: number;
};

export type Settlement = {
  id: string;
  game_id: string;
  payments: Payment[];
  created_at: string;
};

export type Payment = {
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
};

/** Dime up: small enough for a 10c/25c blind structure without silly chip counts. */
export const DEFAULT_CHIPS: ChipDenomination[] = [
  { key: 'white', label: 'White', color: '#f4f4f5', valueCents: 10 },
  { key: 'red', label: 'Red', color: '#dc2626', valueCents: 25 },
  { key: 'blue', label: 'Blue', color: '#2563eb', valueCents: 50 },
  { key: 'green', label: 'Green', color: '#16a34a', valueCents: 100 },
  { key: 'black', label: 'Black', color: '#18181b', valueCents: 500 },
];

export const DEFAULT_SMALL_BLIND_CENTS = 10;
export const DEFAULT_BIG_BLIND_CENTS = 25;

/**
 * The smallest amount these chips can express. A dime/quarter set can make 5c
 * (quarter minus two dimes), which is why stacks and payouts can land on a
 * nickel even when no nickel chip exists.
 */
export function chipGranularityCents(chips: ChipDenomination[]): number {
  const values = chips.map((c) => c.valueCents).filter((v) => v > 0);
  if (values.length === 0) return 1;
  return values.reduce((g, v) => {
    let [a, b] = [g, v];
    while (b) [a, b] = [b, a % b];
    return a;
  });
}
