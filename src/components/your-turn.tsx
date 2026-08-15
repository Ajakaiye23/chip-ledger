'use client';

import { useEffect, useRef } from 'react';
import { formatMoney } from '@/lib/money';
import type { BlindAssignment } from '@/lib/blinds';

export type MyRole = 'dealer' | 'small' | 'big' | null;

export function roleFor(assignment: BlindAssignment, myPlayerId: string | null): MyRole {
  if (!myPlayerId) return null;
  // Heads-up the dealer is also the small blind; posting money is the louder fact.
  if (assignment.smallBlind?.id === myPlayerId) return 'small';
  if (assignment.bigBlind?.id === myPlayerId) return 'big';
  if (assignment.dealer?.id === myPlayerId) return 'dealer';
  return null;
}

/**
 * Shown on your phone only, when this round is on you. Half the point of a home
 * game app is not having to ask "wait, am I the big blind?" every three minutes.
 */
export function YourTurnBanner({
  role,
  smallBlindCents,
  bigBlindCents,
  alsoDealer,
}: {
  role: MyRole;
  smallBlindCents: number;
  bigBlindCents: number;
  alsoDealer: boolean;
}) {
  const buzzedFor = useRef<MyRole>(null);

  useEffect(() => {
    if (!role || buzzedFor.current === role) return;
    buzzedFor.current = role;
    // A short buzz if the phone does that; silently ignored where it doesn't.
    navigator.vibrate?.(role === 'dealer' ? 60 : [60, 80, 60]);
  }, [role]);

  if (!role) return null;

  const copy = {
    dealer: { title: "You're the dealer", detail: 'Your deal this round.' },
    small: {
      title: "You're the small blind",
      detail: `Post ${formatMoney(smallBlindCents)}${alsoDealer ? ' — heads-up, so you act first pre-flop' : ''}.`,
    },
    big: { title: "You're the big blind", detail: `Post ${formatMoney(bigBlindCents)}.` },
  }[role];

  return (
    <div
      role="status"
      aria-live="polite"
      className="card relative mb-4 flex items-center gap-3 overflow-hidden border-brass-500/50 bg-brass-500/10 p-4"
    >
      {/* Only this overlay animates, and only its opacity. */}
      <span
        aria-hidden
        className="flash-ring pointer-events-none absolute inset-0 rounded-[var(--radius-card)] ring-2 ring-brass-400"
      />
      <span
        aria-hidden
        className={`display text-3xl leading-none ${role === 'dealer' ? 'text-brass-400' : 'text-rouge-400'}`}
      >
        {role === 'dealer' ? '\u2660' : '\u2666'}
      </span>
      <div className="relative">
        <p className="display text-lg font-semibold text-brass-400">{copy.title}</p>
        <p className="text-sm text-ink-300">{copy.detail}</p>
      </div>
    </div>
  );
}
