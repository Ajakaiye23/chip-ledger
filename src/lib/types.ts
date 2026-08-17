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
  /** Whose deal it is. Rotates with the hand counter; nothing to do with money. */
  dealer_player_id: string | null;
  hand_number: number;
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
  /** What they had in front of them at the end. Null until they're counted up. */
  final_stack_cents: number | null;
  final_chips: ChipCounts | null;
};

export type LedgerEntry = {
  id: string;
  game_id: string;
  player_id: string;
  kind: LedgerKind;
  amount_cents: number;
  chips: ChipCounts | null;
  note: string | null;
  created_at: string;
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

/** The colours a standard set comes with, and what they're worth by default. */
export const CHIP_PALETTE: ChipDenomination[] = [
  { key: 'white', label: 'White', color: '#f4f4f5', valueCents: 10 },
  { key: 'red', label: 'Red', color: '#dc2626', valueCents: 25 },
  { key: 'blue', label: 'Blue', color: '#2563eb', valueCents: 50 },
  { key: 'green', label: 'Green', color: '#16a34a', valueCents: 100 },
  { key: 'black', label: 'Black', color: '#18181b', valueCents: 500 },
];

/**
 * What a new table starts with. Three colours, because most home games only ever
 * use three — the rest are a switch away in the chip editor.
 */
export const DEFAULT_CHIPS: ChipDenomination[] = CHIP_PALETTE.filter((c) =>
  ['white', 'red', 'blue'].includes(c.key),
);

/** A table seats eight. */
export const MAX_SEATS = 8;

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

export type FriendshipStatus = 'none' | 'pending' | 'accepted';

/** Someone you've sat at a table with, and where you stand with them. */
export type KnownPlayer = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  nights_together: number;
  friendship_status: FriendshipStatus;
  friendship_id: string | null;
  /** True when they asked you, so you're the one who answers. */
  they_asked: boolean;
};

/** A friend's table that's still running. */
export type OpenGame = {
  game_id: string;
  name: string;
  host_name: string;
  seats_taken: number;
  already_in: boolean;
  pending_request: boolean;
};

export type GameRequest = {
  id: string;
  game_id: string;
  user_id: string;
  kind: 'invite' | 'request';
  status: 'pending' | 'accepted' | 'declined';
  created_by: string;
  created_at: string;
};

/** A row on the global, percentage-return leaderboard. */
export type GlobalStanding = {
  user_id: string;
  display_name: string;
  staked_cents: number;
  net_cents: number;
  return_pct: number;
  nights: number;
  is_me: boolean;
};

/**
 * A debt as it sits on the game that produced it. The settle screen reads these
 * raw, because at the table it matters who owes whom by seat — including guests,
 * who have no account for the dashboard version below to hang off.
 */
export type GameDebt = {
  id: string;
  game_id: string;
  from_player_id: string;
  to_player_id: string;
  amount_cents: number;
  status: 'outstanding' | 'paid';
  paid_at: string | null;
};

/** Money still owed, in either direction, for the account-level view. */
export type Debt = {
  id: string;
  game_id: string;
  game_name: string;
  amount_cents: number;
  direction: 'owed_to_me' | 'i_owe';
  other_name: string;
  status: 'outstanding' | 'paid';
  settled_at: string | null;
};

/** The floor to appear on the global board: $10 staked, all time. */
export const GLOBAL_BOARD_MIN_STAKED_CENTS = 1000;
