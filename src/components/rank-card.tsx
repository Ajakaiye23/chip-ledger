'use client';

import { useMemo } from 'react';
import { RANKS, standingFor } from '@/lib/rank';
import type { GameSummary } from '@/lib/stats';

/**
 * Where you sit on the ladder. Points come from nights you finished up — one for
 * a win, more for a good one — and never come off, so this reads as a record of
 * what you've done rather than a rating that punishes a bad night.
 */
export function RankCard({ summaries }: { summaries: GameSummary[] }) {
  const standing = useMemo(() => standingFor(summaries), [summaries]);
  const index = RANKS.findIndex((r) => r.name === standing.rank.name);

  return (
    <section>
      <h2 className="plate mb-1.5">Rank</h2>
      <div className="card px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="display text-2xl text-brass-400">{standing.rank.name}</p>
          <p className="plate">
            {standing.points} {standing.points === 1 ? 'pt' : 'pts'} · {standing.nights}{' '}
            {standing.nights === 1 ? 'night' : 'nights'}
          </p>
        </div>

        <div className="mt-3 h-1 w-full bg-white/10">
          <div
            className="h-full bg-brass-500"
            style={{ width: `${Math.round(standing.progress * 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-ink-500">
          {standing.next ? (
            <>
              <span className="text-ink-300">{standing.next.name}</span> needs{' '}
              {[
                standing.pointsToNext > 0
                  ? `${standing.pointsToNext} more ${standing.pointsToNext === 1 ? 'point' : 'points'}`
                  : null,
                standing.nightsToNext > 0
                  ? `${standing.nightsToNext} more ${standing.nightsToNext === 1 ? 'night' : 'nights'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' and ')}
              . Nights are scored on what you made against what you put in: doubling up is
              three points, up 50% is two, any win is one — and losing takes points off.
            </>
          ) : (
            <>Top of the ladder. Nothing left to prove.</>
          )}
        </p>

        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {RANKS.map((rank, i) => (
            <li
              key={rank.name}
              className={
                i === index ? 'text-brass-400' : i < index ? 'text-ink-300' : 'text-ink-500/60'
              }
            >
              {rank.name}
            </li>
          ))}
        </ol>

        {standing.nights > 0 ? (
          <p className="mt-3 border-t border-white/10 pt-2 text-xs text-ink-500">
            {standing.winningNights} winning of {standing.nights} · form{' '}
            <span className={standing.formPerNight >= 0 ? 'text-emerald-400' : 'text-rouge-400'}>
              {standing.formPerNight >= 0 ? '+' : ''}
              {standing.formPerNight.toFixed(2)}
            </span>{' '}
            a night
          </p>
        ) : null}
      </div>
    </section>
  );
}
