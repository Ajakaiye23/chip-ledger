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
        <ol className="card divide-y divide-white/5">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`flex items-center gap-3 px-4 py-3 ${row.isYou ? 'bg-brass-500/10' : ''}`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  i === 0
                    ? 'bg-brass-500 text-felt-950'
                    : i === 1 || i === 2
                      ? 'bg-white/15 text-ink-100'
                      : 'text-ink-500'
                }`}
              >
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {row.name}
                  {row.isYou ? <span className="ml-2 text-xs text-brass-400">you</span> : null}
                </p>
                <p className="text-xs text-ink-500">
                  {row.games} {row.games === 1 ? 'night' : 'nights'} · in{' '}
                  {formatMoney(row.buyInCents)}
                  {row.games > 1 ? ` · best ${formatMoney(row.bestCents)}` : ''}
                </p>
              </div>

              <Money cents={row.netCents} sign className="shrink-0 font-semibold" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
