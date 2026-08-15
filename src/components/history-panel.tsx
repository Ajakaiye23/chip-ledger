'use client';

import type { GameData } from '@/hooks/use-game';
import type { GameState } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { Empty, Money } from './ui';

/**
 * The night's money, and nothing else. Every closed round is a column of what
 * each player won or lost in it; the last column is where they stand overall.
 * No chip counts, no buy-in mechanics — just who is up and who is down.
 */
export function HistoryPanel({ data, state }: { data: GameData; state: GameState }) {
  const closed = data.rounds.filter((r) => r.status === 'closed');
  const played = state.players.filter((p) => p.totalBuyInCents > 0 || p.rounds.length > 0);

  const up = [...played].filter((p) => p.netCents > 0).sort((a, b) => b.netCents - a.netCents);
  const down = [...played].filter((p) => p.netCents < 0).sort((a, b) => a.netCents - b.netCents);
  const even = played.filter((p) => p.netCents === 0);

  if (played.length === 0) {
    return <Empty>Nothing has been played yet.</Empty>;
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="plate text-ink-300">Where it stands</h2>
        <ul className="card divide-y divide-white/5">
          {[...up, ...down, ...even].map((p) => (
            <li key={p.player.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate">
                {p.player.display_name}
                <span className="ml-2 text-xs text-ink-500">
                  {p.netCents > 0 ? 'is owed' : p.netCents < 0 ? 'owes' : 'square'}
                </span>
              </span>
              <Money cents={p.netCents} sign className="display shrink-0 text-lg font-semibold" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="plate text-ink-300">Round by round</h2>
        {closed.length === 0 ? (
          <Empty>No rounds have been closed yet.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brass-500/20 text-left">
                  <th className="plate px-4 py-2.5 font-medium">Player</th>
                  {closed.map((r) => (
                    <th key={r.id} className="plate px-3 py-2.5 text-right font-medium">
                      R{r.number}
                    </th>
                  ))}
                  <th className="plate px-4 py-2.5 text-right font-medium text-brass-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {played.map((p) => (
                  <tr key={p.player.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.player.display_name}</td>
                    {closed.map((r) => {
                      const result = p.rounds.find((x) => x.roundId === r.id);
                      return (
                        <td key={r.id} className="px-3 py-2.5 text-right">
                          {result?.recorded ? (
                            <Money cents={result.netCents} sign />
                          ) : (
                            <span className="text-ink-500">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-semibold">
                      <Money cents={p.netCents} sign />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brass-500/20">
                  <td className="plate px-4 py-2.5">Pot</td>
                  {closed.map((r) => (
                    <td key={r.id} className="px-3 py-2.5 text-right text-xs text-ink-500 tabular">
                      {formatMoney(potAfter(state, r.id))}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-xs text-ink-500 tabular">
                    {formatMoney(state.potInCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Money on the table by the end of a given round. */
function potAfter(state: GameState, roundId: string): number {
  return state.players.reduce((sum, p) => {
    const upTo = p.rounds.slice(0, p.rounds.findIndex((r) => r.roundId === roundId) + 1);
    return sum + upTo.reduce((s, r) => s + r.addedCents - r.removedCents, 0);
  }, 0);
}
