'use client';

import { formatMoney } from '@/lib/money';
import { monthLabel, type LeaderboardRow } from '@/lib/leaderboard';
import { Empty, Money } from './ui';

/** This calendar month only — it resets on the 1st, which is the point of it. */
export function Leaderboard({ rows, now }: { rows: LeaderboardRow[]; now?: number }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="plate text-ink-300">Leaderboard</h2>
        <span className="text-xs text-ink-500">{monthLabel(now)}</span>
      </div>

      {rows.length === 0 ? (
        <Empty>No games this month yet. It resets on the 1st.</Empty>
      ) : (
        <ol className="card">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`ledger-row flex items-center gap-3 px-4 py-2.5 last:border-b-0 ${
                row.isYou ? 'bg-brass-500/8' : ''
              }`}
            >
              <span
                className={`figure w-5 shrink-0 text-right text-sm ${
                  i === 0 ? 'text-brass-400' : 'text-ink-500'
                }`}
              >
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {row.name}
                  {row.isYou ? <span className="ml-2 text-xs text-brass-400">you</span> : null}
                </p>
                <p className="text-xs text-ink-500">
                  {row.games} {row.games === 1 ? 'night' : 'nights'} · in{' '}
                  {formatMoney(row.buyInCents)}
                  {row.games > 1 ? ` · best ${formatMoney(row.bestCents)}` : ''}
                </p>
              </div>

              <Money cents={row.netCents} sign className="figure shrink-0 text-base" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
