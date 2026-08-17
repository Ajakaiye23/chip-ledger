'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markDebtPaid } from '@/lib/actions';
import { formatMoney } from '@/lib/money';
import type { Debt } from '@/lib/types';
import { Button } from './ui';

/**
 * Who still owes you, and who you still owe.
 *
 * Only the person owed can clear a debt, which is what makes it mean anything:
 * marking it paid is "I got the money", not "I say I paid". The moment they do,
 * it drops off the other person's screen too.
 *
 * The dashboard only mounts this when something is outstanding — an empty
 * "nobody owes anybody" card is a row of dashboard nobody needs to read.
 */
export function DebtsPanel({ debts }: { debts: Debt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const owedToMe = debts.filter((d) => d.direction === 'owed_to_me');
  const iOwe = debts.filter((d) => d.direction === 'i_owe');

  const owedTotal = owedToMe.reduce((sum, d) => sum + d.amount_cents, 0);
  const oweTotal = iOwe.reduce((sum, d) => sum + d.amount_cents, 0);

  async function clear(debt: Debt) {
    setBusy(debt.id);
    setError(null);
    try {
      await markDebtPaid(debt.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear that.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rouge-400">{error}</p> : null}

      {owedToMe.length > 0 ? (
        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="plate text-brass-400">Owed to you</h2>
            <span className="figure text-sm text-emerald-400">+{formatMoney(owedTotal)}</span>
          </div>
          <ul className="card">
            {owedToMe.map((d) => (
              <li
                key={d.id}
                className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.other_name}</span>
                  <span className="text-xs text-ink-500">{d.game_name}</span>
                </span>
                <span className="figure shrink-0 text-lg">{formatMoney(d.amount_cents)}</span>
                <Button size="sm" disabled={busy === d.id} onClick={() => clear(d)}>
                  {busy === d.id ? '…' : 'Paid'}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-500">
            Tapping <span className="text-ink-300">Paid</span> clears it from their screen too.
            Only you can do it, so it means the money actually arrived.
          </p>
        </section>
      ) : null}

      {iOwe.length > 0 ? (
        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="plate">You owe</h2>
            <span className="figure text-sm text-rouge-400">−{formatMoney(oweTotal)}</span>
          </div>
          <ul className="card">
            {iOwe.map((d) => (
              <li
                key={d.id}
                className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.other_name}</span>
                  <span className="text-xs text-ink-500">{d.game_name}</span>
                </span>
                <span className="figure shrink-0 text-lg">{formatMoney(d.amount_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-500">
            These clear when the person you owe marks them paid.
          </p>
        </section>
      ) : null}
    </div>
  );
}
