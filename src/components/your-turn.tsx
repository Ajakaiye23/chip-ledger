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
 * Shown on your phone only, when the hand is on you. Half the point of a home
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
    // A short buzz if the phone does that. Browsers block (and noisily log) this
    // before the user has interacted with the page, so only ask once they have.
    if (navigator.userActivation?.hasBeenActive) {
      navigator.vibrate?.(role === 'dealer' ? 60 : [60, 80, 60]);
    }
  }, [role]);

  if (!role) return null;

  const copy = {
    dealer: { title: "You're the dealer", detail: 'Your deal this hand.' },
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
      className="relative mb-5 flex items-center gap-3 overflow-hidden border-l-2 border-brass-500 bg-brass-500/10 px-4 py-3"
    >
      {/* Only this overlay animates, and only its opacity. */}
      <span
        aria-hidden
        className="flash-ring pointer-events-none absolute inset-0 bg-brass-400/20"
      />
      <span
        aria-hidden
        className={`display text-3xl leading-none ${role === 'dealer' ? 'text-brass-400' : 'text-rouge-400'}`}
      >
        {role === 'dealer' ? '\u2660' : '\u2666'}
      </span>
      <div className="relative">
        <p className="display text-lg text-brass-400">{copy.title}</p>
        <p className="text-sm text-ink-300">{copy.detail}</p>
      </div>
    </div>
  );
}
