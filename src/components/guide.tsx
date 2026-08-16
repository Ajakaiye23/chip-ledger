'use client';

import { useEffect, useState } from 'react';
import { Button, Sheet } from './ui';

const SEEN_KEY = 'chip-ledger:guide-seen';

type Step = {
  suit: string;
  suitClass: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    suit: '♠',
    suitClass: 'text-ink-100',
    title: 'One person opens the table',
    body:
      'Name it, switch on the chip colours you\u2019re actually using and set what they\u2019re worth, then set the blinds. That happens once, at the start. Everyone else joins with the six-character code — tap the code to text it round. Eight seats to a table.',
  },
  {
    suit: '♥',
    suitClass: 'text-rouge-400',
    title: 'Buy in for whatever you want',
    body:
      'Type a dollar amount and the app tells you which chips to take, or count out the chips you took and it works out the value. Rebuy as often as you like. Cashing out takes money off the table without counting as a loss.',
  },
  {
    suit: '♦',
    suitClass: 'text-rouge-400',
    title: 'Play, then count up once',
    body:
      'A round is as long as you want — one hand or the whole night. When it ends the host counts each player’s chips by colour, and the difference from what they started with is their profit. The button moves a seat and the app flashes at whoever is on the blinds.',
  },
  {
    suit: '♣',
    suitClass: 'text-ink-100',
    title: 'Leave, rejoin, or turn up late',
    body:
      'None of it breaks the books. Walk away for three rounds and your chips are still yours; sit down at round nine and you simply have no rows before that. The host can also track someone who doesn’t have the app at all.',
  },
  {
    suit: '♠',
    suitClass: 'text-brass-400',
    title: 'Settle up in the fewest payments',
    body:
      'History shows what everyone won or lost each round and where they stand. When you’re done, Settle works out the shortest possible list of payments — if two people’s debts cancel out, they just pay each other instead of passing money round the table.',
  },
];

export function GuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How this works">
      <div className="space-y-5">
        <p className="text-sm text-ink-300">
          It keeps the books for a home game. It doesn&apos;t deal cards or referee the
          betting — it tracks the money, so nobody has to remember who owes what at 1am.
        </p>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className={`display grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brass-500/25 bg-night-950/60 text-xl ${step.suitClass}`}
              >
                {step.suit}
              </span>
              <div>
                <p className="font-medium">
                  <span className="text-brass-400">{i + 1}.</span> {step.title}
                </p>
                <p className="mt-0.5 text-sm text-ink-300">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-brass-500/25 bg-night-950/50 p-3 text-sm text-ink-300">
          <p className="font-medium text-brass-400">Put it on your phone</p>
          <p className="mt-1">
            On iPhone: Share, then Add to Home Screen. On Android: the three dots, then
            Install. It gets its own icon and opens full-screen, like any other app.
          </p>
        </div>

        <Button className="w-full" onClick={onClose}>
          Deal me in
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * Opens itself the first time someone lands here, and stays available from the
 * help button afterwards. The flag is per-device, which is the right scope: the
 * question is "has this person seen the app on this phone".
 */
export function useGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // Private mode with storage blocked: just don't auto-open.
    }
  }, []);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Nothing to do — it will offer itself again next time.
    }
  }

  return { open, close, show: () => setOpen(true) };
}

export function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="How this works"
      title="How this works"
      className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full border border-brass-500/35 text-brass-400 hover:bg-brass-500/15"
    >
      ?
    </button>
  );
}
