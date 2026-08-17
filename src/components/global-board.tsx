'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/money';
import { GLOBAL_BOARD_MIN_STAKED_CENTS, type GlobalStanding } from '@/lib/types';
import { Empty } from './ui';

const SHOWN = 20;

/**
 * Everyone who plays, ranked by percentage return rather than by dollars — a
 * $60 profit off $40 buy-ins is a better night's poker than $60 off $600, and
 * ranking on raw money would just sort by who plays the biggest game.
 *
 * The floor keeps out anyone who won a single small pot and would otherwise sit
 * on top at +100% for ever.
 */
export function GlobalBoard({ rows }: { rows: GlobalStanding[] }) {
  const [expanded, setExpanded] = useState(false);

  const myIndex = rows.findIndex((r) => r.is_me);
  const top = expanded ? rows : rows.slice(0, SHOWN);
  // If you're not in the visible slice, show your row underneath anyway.
  const showMineSeparately = myIndex >= 0 && myIndex >= top.length;

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="plate">Global board</h2>
        <span className="plate">Return</span>
      </div>

      {rows.length === 0 ? (
        <Empty>
          Nobody has staked {formatMoney(GLOBAL_BOARD_MIN_STAKED_CENTS)} across settled games yet.
        </Empty>
      ) : (
        <>
          <ol className="card">
            {top.map((row, i) => (
              <Row key={row.user_id} row={row} place={i + 1} />
            ))}
            {showMineSeparately ? (
              <Row key={rows[myIndex].user_id} row={rows[myIndex]} place={myIndex + 1} />
            ) : null}
          </ol>

          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="text-xs text-ink-500">
              Ranked by percentage return, not dollars. {formatMoney(GLOBAL_BOARD_MIN_STAKED_CENTS)}{' '}
              staked to qualify.
            </p>
            {rows.length > SHOWN ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 text-xs text-brass-400 underline underline-offset-2"
              >
                {expanded ? 'Show less' : `All ${rows.length}`}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ row, place }: { row: GlobalStanding; place: number }) {
  // Dead even is neither a win nor a loss, and must not read as "−$0.00".
  const up = row.net_cents > 0;
  const even = row.net_cents === 0;
  const tone = even ? 'text-ink-300' : up ? 'text-emerald-400' : 'text-rouge-400';
  const sign = even ? '' : up ? '+' : '−';
  return (
    <li
      className={`ledger-row flex items-center gap-3 px-4 py-2.5 last:border-b-0 ${
        row.is_me ? 'bg-brass-500/8' : ''
      }`}
    >
      <span
        className={`figure w-6 shrink-0 text-right text-sm ${
          place === 1 ? 'text-brass-400' : 'text-ink-500'
        }`}
      >
        {place}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {row.display_name}
          {row.is_me ? <span className="ml-2 text-xs text-brass-400">you</span> : null}
        </span>
        <span className="text-xs text-ink-500">
          {row.nights} {row.nights === 1 ? 'night' : 'nights'} · staked{' '}
          {formatMoney(row.staked_cents)}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className={`figure block text-lg ${tone}`}>
          {up ? '+' : ''}
          {row.return_pct}%
        </span>
        <span className="text-xs text-ink-500">
          {sign}
          {formatMoney(Math.abs(row.net_cents))}
        </span>
      </span>
    </li>
  );
}
