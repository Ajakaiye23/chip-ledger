'use client';

import { useEffect, useState } from 'react';
import { formatMoney, parseMoney } from '@/lib/money';
import { CHIP_PALETTE, type ChipDenomination } from '@/lib/types';
import { Button, ChipDot, inputClass } from './ui';

/**
 * Which colours are in play, and what each is worth.
 *
 * The editor owns a working copy. Every tick and keystroke lands there first, so
 * the controls respond instantly and typing "1.50" is one change rather than four
 * — the parent decides when that copy gets saved. Previously each keystroke went
 * straight to the parent, which meant a database write per character, and in the
 * preview (where nothing is saved) the controls simply snapped back and looked
 * broken.
 *
 * Colours are toggled in and out rather than deleted, since most home games use
 * three of the five a set comes with, and a colour switched off keeps its value
 * so switching it back on is lossless.
 */
export function ChipValuesEditor({
  chips,
  onChange,
  disabled = false,
}: {
  chips: ChipDenomination[];
  onChange: (next: ChipDenomination[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<ChipDenomination[]>(chips);
  const [text, setText] = useState<Record<string, string>>({});
  // Values of colours switched off, so switching one back on is lossless.
  const [remembered, setRemembered] = useState<Record<string, ChipDenomination>>({});

  // Follow the parent when it genuinely changes (someone else re-priced, or a
  // save landed), without stamping on what's being typed right now.
  const signature = chips.map((c) => `${c.key}:${c.valueCents}:${c.label}:${c.color}`).join('|');
  useEffect(() => {
    setDraft(chips);
    setText({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  function commit(next: ChipDenomination[]) {
    setDraft(next);
    onChange(next);
  }

  const inPlay = new Map(draft.map((c) => [c.key, c]));
  const rows = [
    ...CHIP_PALETTE.map((base) => inPlay.get(base.key) ?? remembered[base.key] ?? base),
    // Anything custom the host added on top of the standard set.
    ...draft.filter((c) => !CHIP_PALETTE.some((b) => b.key === c.key)),
  ];

  const byValue = (a: ChipDenomination, b: ChipDenomination) => a.valueCents - b.valueCents;

  function toggle(chip: ChipDenomination, on: boolean) {
    if (on) {
      commit([...draft, remembered[chip.key] ?? chip].sort(byValue));
    } else {
      setRemembered((r) => ({ ...r, [chip.key]: chip }));
      commit(draft.filter((c) => c.key !== chip.key));
    }
  }

  function edit(chip: ChipDenomination, patch: Partial<ChipDenomination>) {
    if (inPlay.has(chip.key)) {
      commit(draft.map((c) => (c.key === chip.key ? { ...c, ...patch } : c)));
    } else {
      // Editing a colour that's switched off just updates what it'll come back as.
      setRemembered((r) => ({ ...r, [chip.key]: { ...chip, ...patch } }));
    }
  }

  function setValue(chip: ChipDenomination, raw: string) {
    setText((t) => ({ ...t, [chip.key]: raw }));
    const cents = parseMoney(raw);
    if (cents === null || cents < 0) return;
    edit(chip, { valueCents: cents });
  }

  function addColour() {
    const used = new Set(draft.map((c) => c.color));
    const spare = CHIP_PALETTE.find((p) => !used.has(p.color));
    commit([
      ...draft,
      {
        key: `chip-${Math.random().toString(36).slice(2, 7)}`,
        label: 'New chip',
        color: spare?.color ?? '#7c3aed',
        valueCents: 100,
      },
    ]);
  }

  return (
    <div className="space-y-1">
      {rows.map((chip) => {
        const on = inPlay.has(chip.key);
        return (
          <div key={chip.key} className={`flex items-center gap-2.5 ${on ? '' : 'opacity-45'}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={(e) => toggle(chip, e.target.checked)}
              aria-label={`Use ${chip.label} chips`}
              className="h-11 w-5 shrink-0 accent-brass-500"
            />

            <label
              className="relative grid h-11 w-11 shrink-0 place-items-center"
              title="Chip colour"
            >
              <ChipDot chip={chip} size={30} />
              <input
                type="color"
                value={chip.color}
                disabled={disabled || !on}
                onChange={(e) => edit(chip, { color: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${chip.label} colour`}
              />
            </label>

            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={chip.label}
              disabled={disabled || !on}
              aria-label={`${chip.label} name`}
              onChange={(e) => edit(chip, { label: e.target.value })}
            />

            <div className="relative w-24 shrink-0">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500">
                $
              </span>
              <input
                className={`${inputClass} pl-6 text-right tabular`}
                inputMode="decimal"
                disabled={disabled || !on}
                aria-label={`${chip.label} value`}
                value={text[chip.key] ?? (chip.valueCents / 100).toFixed(2)}
                onChange={(e) => setValue(chip, e.target.value)}
                // Drop the raw text on blur so the field tidies itself to $0.10.
                onBlur={() => setText(({ [chip.key]: _typed, ...rest }) => rest)}
              />
            </div>
          </div>
        );
      })}

      {!disabled ? (
        <Button variant="ghost" size="sm" onClick={addColour} className="mt-1 w-full">
          Add another colour
        </Button>
      ) : null}

      <p className="pt-1 text-xs text-ink-500">
        {draft.length === 0
          ? 'No chips in play — switch at least one colour on.'
          : `In play: ${[...draft]
              .sort(byValue)
              .map((c) => `${c.label} ${formatMoney(c.valueCents)}`)
              .join(' · ')}`}
      </p>
    </div>
  );
}
