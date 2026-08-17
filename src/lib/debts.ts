import type { GameDebt, GamePlayer } from './types';

/**
 * Who is allowed to say a debt has been paid.
 *
 * The person owed, and nobody else — that is the entire point of the button. If
 * the debtor could clear their own debt it would mean "I say I paid", which is
 * worth nothing; coming from the creditor it means "I got the money".
 *
 * A guest seat has no account behind it, so there is nobody to tap the button.
 * The host already keeps the guest's seat and their buy-ins, so they keep this
 * too. The database enforces the same rule; this is just so the UI doesn't offer
 * a button that would be refused.
 */
export function canClearDebt(
  debt: Pick<GameDebt, 'to_player_id'>,
  {
    players,
    userId,
    isHost,
  }: { players: Pick<GamePlayer, 'id' | 'user_id'>[]; userId: string; isHost: boolean },
): boolean {
  const owed = players.find((p) => p.id === debt.to_player_id);
  if (!owed) return false;
  return owed.user_id ? owed.user_id === userId : isHost;
}

/** What's still owed, for the "N of M still to pay" line and the copy button. */
export function outstandingDebts(debts: GameDebt[]): GameDebt[] {
  return debts.filter((d) => d.status === 'outstanding');
}
