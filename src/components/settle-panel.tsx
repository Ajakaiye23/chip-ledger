'use client';

import { useMemo, useState } from 'react';
import type { GameData } from '@/hooks/use-game';
import type { GameState } from '@/lib/ledger';
import { finishGame, markDebtPaid, reopenGame } from '@/lib/actions';
import { canClearDebt, outstandingDebts } from '@/lib/debts';
import { formatMoney } from '@/lib/money';
import { settle } from '@/lib/settle';
import type { GameDebt, Payment } from '@/lib/types';
import { Button, Empty, Money } from './ui';

export function SettlePanel({
  data,
  state,
  userId,
  isHost,
  onChange,
}: {
  data: GameData;
  state: GameState;
  userId: string;
  isHost: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const settled = data.game.status === 'settled';

  const balances = useMemo(
    () => state.players.map((p) => ({ playerId: p.player.id, netCents: p.netCents })),
    [state],
  );

  // A locked settlement is the record of what people actually agreed to pay.
  const payments: Payment[] = useMemo(
    () => (settled && data.settlement ? data.settlement.payments : settle(balances)),
    [settled, data.settlement, balances],
  );

  const nameOf = (playerId: string) =>
    state.byPlayerId.get(playerId)?.player.display_name ?? 'Player';

  const inPlay = balances.filter((b) => b.netCents !== 0).length;
  const naive = Math.max(inPlay - 1, 0);

  // Once the game is locked, the plan stops being a suggestion and becomes a
  // list of debts people tick off as the cash actually changes hands.
  const debts = settled ? data.debts : [];
  const outstanding = outstandingDebts(debts);
  const canClear = (debt: GameDebt) =>
    canClearDebt(debt, { players: data.players, userId, isHost });

  async function toggleDebt(debt: GameDebt) {
    setClearing(debt.id);
    setClearError(null);
    try {
      await markDebtPaid(debt.id, debt.status === 'outstanding');
      onChange();
    } catch (e) {
      setClearError(e instanceof Error ? e.message : 'Could not update that.');
    } finally {
      setClearing(null);
    }
  }

  async function copySummary() {
    // Once things are being ticked off, copy what's still owed, not the history.
    const owing =
      debts.length > 0
        ? outstanding.map((d) => ({
            fromPlayerId: d.from_player_id,
            toPlayerId: d.to_player_id,
            amountCents: d.amount_cents,
          }))
        : payments;
    const lines = [
      `${data.game.name} — settle up`,
      ...owing.map((p) => `${nameOf(p.fromPlayerId)} pays ${nameOf(p.toPlayerId)} ${formatMoney(p.amountCents)}`),
    ];
    await navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="plate mb-1.5">Where everyone stands</h2>
        <ul className="card">
          {state.players.map((p) => (
            <li
              key={p.player.id}
              className="ledger-row flex items-center justify-between px-4 py-2.5 text-sm last:border-b-0"
            >
              <span>
                {p.player.display_name}
                <span className="ml-2 text-xs text-ink-500">
                  in {formatMoney(p.startedWithCents)} · out{' '}
                  {p.counted ? formatMoney((p.endedWithCents ?? 0) + p.cashedOutCents) : '—'}
                </span>
              </span>
              <Money cents={p.netCents} sign className="font-semibold" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="plate">Who pays whom</h2>
          {debts.length > 0 ? (
            <span className="text-xs text-ink-500">
              {outstanding.length === 0
                ? 'all settled up'
                : `${outstanding.length} of ${debts.length} still to pay`}
            </span>
          ) : payments.length > 0 ? (
            <span className="text-xs text-ink-500">
              {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
              {naive > payments.length ? ` instead of ${naive}` : ''}
            </span>
          ) : null}
        </div>

        {clearError ? <p className="text-sm text-rouge-400">{clearError}</p> : null}

        {debts.length > 0 ? (
          <>
            <ul className="card">
              {debts.map((d) => {
                const paid = d.status === 'paid';
                const mine = canClear(d);
                return (
                  <li
                    key={d.id}
                    className={`ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0 ${
                      paid ? 'text-ink-500' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{nameOf(d.from_player_id)}</span>
                    <span aria-hidden className={paid ? 'text-ink-500' : 'text-brass-400'}>
                      →
                    </span>
                    <span className="min-w-0 flex-1 truncate">{nameOf(d.to_player_id)}</span>
                    <span className={`figure shrink-0 text-lg ${paid ? 'line-through' : ''}`}>
                      {formatMoney(d.amount_cents)}
                    </span>
                    {mine ? (
                      <Button
                        size="sm"
                        variant={paid ? 'ghost' : 'primary'}
                        disabled={clearing === d.id}
                        onClick={() => toggleDebt(d)}
                      >
                        {clearing === d.id ? '…' : paid ? 'Undo' : 'Paid'}
                      </Button>
                    ) : (
                      <span className="w-16 shrink-0 text-right text-xs text-ink-500">
                        {paid ? 'paid' : 'waiting'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-ink-500">
              Only the person being paid can tick one off, so it means the money actually
              arrived. Guests have no account to tick with, so the host does theirs.
            </p>
            <Button variant="ghost" className="w-full" onClick={copySummary}>
              {copied ? 'Copied' : "Copy what's left"}
            </Button>
          </>
        ) : payments.length === 0 ? (
          <Empty>Nobody owes anybody. Either the night hasn&apos;t started or it ended dead even.</Empty>
        ) : (
          <>
            <ul className="card">
              {payments.map((p, i) => (
                <li
                  key={`${p.fromPlayerId}-${p.toPlayerId}-${i}`}
                  className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">{nameOf(p.fromPlayerId)}</span>
                  <span aria-hidden className="text-brass-400">→</span>
                  <span className="min-w-0 flex-1 truncate">{nameOf(p.toPlayerId)}</span>
                  <span className="figure shrink-0 text-lg">{formatMoney(p.amountCents)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-500">
              Fewest possible transfers: anyone whose debts already cancel out inside a smaller
              group settles there instead of passing money around the whole table.
            </p>
            <Button variant="ghost" className="w-full" onClick={copySummary}>
              {copied ? 'Copied' : 'Copy the list'}
            </Button>
          </>
        )}
      </section>

      {isHost ? (
        <section className="space-y-3 border-t border-white/10 pt-5">
          {settled ? (
            <>
              <p className="text-sm text-ink-300">
                This game is settled and locked. Reopening lets you fix a miscount, and the
                payment plan will be recalculated.
              </p>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await reopenGame(data.game.id);
                    onChange();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reopen the game
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-300">
                {state.uncounted > 0
                  ? `${state.uncounted} ${state.uncounted === 1 ? 'player still needs' : 'players still need'} counting before this can be settled.`
                  : "Locking the game freezes these numbers into everyone's history and stops further buy-ins."}
              </p>
              <Button
                className="w-full"
                disabled={busy || payments.length === 0 || state.uncounted > 0}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await finishGame({
                      gameId: data.game.id,
                      payments,
                      totals: state.players.map((p) => ({
                        playerId: p.player.id,
                        netCents: p.netCents,
                        startedWithCents: p.startedWithCents,
                      })),
                    });
                    onChange();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not settle the game.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Settling…' : 'Settle and close the game'}
              </Button>
              {error ? <p className="text-sm text-rouge-400">{error}</p> : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
