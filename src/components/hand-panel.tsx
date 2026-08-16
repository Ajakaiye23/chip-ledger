'use client';

import { useState } from 'react';
import type { GameData } from '@/hooks/use-game';
import { nextHand, setChipValues } from '@/lib/actions';
import { blindsFor, blindsLabel } from '@/lib/blinds';
import { formatMoney } from '@/lib/money';
import type { ChipDenomination } from '@/lib/types';
import { ChipValuesEditor } from './chip-values-editor';
import { Button } from './ui';

/**
 * Whose deal it is, and who is forced in. This is the only thing the app tracks
 * hand by hand — it costs nothing to move a button, and it settles the argument
 * that comes up every single orbit.
 */
export function HandPanel({
  data,
  isHost,
  settled,
  onChange,
}: {
  data: GameData;
  isHost: boolean;
  settled: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [repricing, setRepricing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dealer, smallBlind, bigBlind } = blindsFor(data.players, data.game.dealer_player_id);
  const headsUp = dealer && smallBlind && dealer.id === smallBlind.id;

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      await nextHand(data.game.id);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the button.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-baseline justify-between border-b border-white/10 pb-2">
          <h2 className="display text-2xl">
            {data.game.hand_number > 0 ? `Hand ${data.game.hand_number}` : 'Ready to deal'}
          </h2>
          <span className="plate text-brass-400">
            blinds {blindsLabel(data.game.small_blind_cents, data.game.big_blind_cents)}
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Dealer', who: dealer?.display_name, amount: null },
            { label: 'Small blind', who: smallBlind?.display_name, amount: data.game.small_blind_cents },
            { label: 'Big blind', who: bigBlind?.display_name, amount: data.game.big_blind_cents },
          ].map((slot) => (
            <div key={slot.label} className="border border-white/10 px-2 py-3">
              <dt className="plate">{slot.label}</dt>
              <dd className="mt-1 truncate">{slot.who ?? '—'}</dd>
              {slot.amount != null && slot.who ? (
                <dd className="figure text-sm text-ink-500">{formatMoney(slot.amount)}</dd>
              ) : null}
            </div>
          ))}
        </dl>

        {headsUp ? (
          <p className="mt-2 text-xs text-ink-500">
            Heads-up: the dealer posts the small blind and acts first before the flop.
          </p>
        ) : null}

        {!settled ? (
          <Button className="mt-4 w-full" onClick={advance} disabled={busy || data.players.length === 0}>
            {busy ? 'Moving…' : 'Next hand — move the button'}
          </Button>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rouge-400">{error}</p> : null}

        <p className="mt-2 text-xs text-ink-500">
          The app doesn&apos;t score hands. Money is counted once, at the end of the night.
        </p>
      </section>

      <section>
        <h2 className="plate mb-1.5">Chip values</h2>
        <div className="border-l-2 border-white/15 pl-3">
          <ChipValuesEditor
            chips={data.game.default_chip_values}
            onChange={async (next: ChipDenomination[]) => {
              await setChipValues(data.game.id, next);
              onChange();
            }}
            disabled={!isHost || !repricing || settled}
          />
          <p className="mt-2 text-xs text-ink-500">
            {isHost
              ? 'Yours to set. Chosen when the table opened, and used for every count tonight.'
              : 'The host sets what the chips are worth. These are used for every count tonight.'}
          </p>
          {isHost && !settled ? (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setRepricing((v) => !v)}>
              {repricing ? 'Done' : 'Change them'}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
