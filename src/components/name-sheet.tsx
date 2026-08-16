'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfileName } from '@/lib/actions';
import { cleanFirstName, cleanInitial, formatPlayerName, splitPlayerName, validateName } from '@/lib/name';
import { Button, Field, Sheet, inputClass } from './ui';

/**
 * Everyone is "Ayo A." at the table. It opens by itself the first time, because a
 * table full of people called by their Google account name is how you end up with
 * two Sams and an argument.
 */
export function NameSheet({
  open,
  onClose,
  userId,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
}) {
  const router = useRouter();
  const initial = splitPlayerName(displayName);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastInitial, setLastInitial] = useState(initial.lastInitial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = validateName(firstName, lastInitial);
  const preview = formatPlayerName(firstName, lastInitial);

  async function save() {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await saveProfileName({
        userId,
        firstName: cleanFirstName(firstName),
        lastInitial: cleanInitial(lastInitial),
        displayName: preview,
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that name.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="What should people call you?">
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          Your first name and the initial of your surname. That&apos;s what everyone at the
          table sees.
        </p>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="First name">
              <input
                className={inputClass}
                value={firstName}
                autoCapitalize="words"
                placeholder="Ayo"
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Initial">
              <input
                className={`${inputClass} text-center uppercase`}
                value={lastInitial}
                maxLength={1}
                autoCapitalize="characters"
                placeholder="A"
                onChange={(e) => setLastInitial(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <p className="flex items-baseline justify-between border-t border-white/10 pt-3">
          <span className="plate">At the table</span>
          <span className="display text-xl">{preview || '—'}</span>
        </p>

        {problem === 'no-first-name' ? (
          <p className="text-sm text-rouge-400">A first name, please.</p>
        ) : problem === 'no-initial' ? (
          <p className="text-sm text-rouge-400">One letter for your surname.</p>
        ) : null}
        {error ? <p className="text-sm text-rouge-400">{error}</p> : null}

        <Button className="w-full" onClick={save} disabled={busy || problem !== null}>
          {busy ? 'Saving…' : `Call me ${preview || '…'}`}
        </Button>
      </div>
    </Sheet>
  );
}
