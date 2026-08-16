'use client';

import type { GameData } from '@/hooks/use-game';
import type { GameState } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { Empty, Money } from './ui';

/**
 * The night on one page: what each player started with, what they ended with,
 * and the difference. Plus the buy-in log underneath, because "did I rebuy twice
 * or three times?" is the one thing people genuinely forget.
 */
export function NightPanel({ data, state }: { data: GameData; state: GameState }) {
  const played = state.players.filter((p) => p.startedWithCents > 0);

  if (played.length === 0) {
    return <Empty>Nobody has bought in yet.</Empty>;
  }

  const ordered = [...played].sort((a, b) => b.netCents - a.netCents);
  const buyIns = data.entries.filter((e) => e.kind !== 'adjustment');

  return (
    <div className="space-y-6">
      <section>
        <h2 className="plate mb-1.5">The night</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/12 text-left">
                <th className="plate px-4 py-2.5 font-medium">Player</th>
                <th className="plate px-3 py-2.5 text-right font-medium">Started</th>
                <th className="plate px-3 py-2.5 text-right font-medium">Ended</th>
                <th className="plate px-4 py-2.5 text-right font-medium text-brass-400">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {ordered.map((p) => (
                <tr key={p.player.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{p.player.display_name}</td>
                  <td className="figure px-3 py-2.5 text-right">
                    {formatMoney(p.startedWithCents)}
                  </td>
                  <td className="figure px-3 py-2.5 text-right">
                    {p.counted ? (
                      formatMoney((p.endedWithCents ?? 0) + p.cashedOutCents)
                    ) : (
                      <span className="text-ink-500">not counted</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {p.counted ? <Money cents={p.netCents} sign /> : <span className="text-ink-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/12">
                <td className="plate px-4 py-2.5">Total</td>
                <td className="figure px-3 py-2.5 text-right text-ink-500">
                  {formatMoney(state.potInCents)}
                </td>
                <td className="figure px-3 py-2.5 text-right text-ink-500">
                  {formatMoney(
                    state.players.reduce(
                      (sum, p) => sum + (p.counted ? (p.endedWithCents ?? 0) + p.cashedOutCents : 0),
                      0,
                    ),
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {state.uncounted === 0 && state.imbalanceCents !== 0 ? (
                    <Money cents={state.imbalanceCents} sign />
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {state.uncounted > 0 ? (
          <p className="mt-2 text-xs text-ink-500">
            {state.uncounted} {state.uncounted === 1 ? 'player' : 'players'} still to count.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="plate mb-1.5">Money on and off the table</h2>
        <ul className="card">
          {buyIns.map((e) => {
            const who = state.byPlayerId.get(e.player_id)?.player.display_name ?? 'Someone';
            return (
              <li
                key={e.id}
                className="ledger-row flex items-baseline justify-between px-4 py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  {who}
                  <span className="ml-2 text-xs text-ink-500">
                    {e.kind === 'buy_in' ? 'bought in' : 'cashed out'} ·{' '}
                    {new Date(e.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <span className="figure shrink-0">
                  {e.kind === 'buy_in' ? '' : '−'}
                  {formatMoney(e.amount_cents)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
