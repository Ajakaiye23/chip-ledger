'use client';

import { GuideSheet, useGuide } from './guide';

/**
 * The landing page is the first thing a new player sees, so the walkthrough opens
 * itself here too. Seeing it once anywhere sets the flag, so it won't reappear on
 * the dashboard afterwards.
 */
export function GuideLink() {
  const guide = useGuide();
  return (
    <>
      <button
        onClick={guide.show}
        className="flex min-h-11 w-full items-center justify-center text-sm text-ink-500 underline underline-offset-4 hover:text-ink-300"
      >
        How this works
      </button>
      <GuideSheet open={guide.open} onClose={guide.close} />
    </>
  );
}
