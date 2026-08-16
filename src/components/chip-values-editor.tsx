'use client';

import { useState } from 'react';
import { formatMoney, parseMoney } from '@/lib/money';
import { CHIP_PALETTE, type ChipDenomination } from '@/lib/types';
import { Button, ChipDot, inputClass } from './ui';

/**
 * Which colours are in play, and what each is worth.
 *
 * Most sets have five colours and most home games use three of them, so colours
 * are toggled in and out rather than deleted — an unused colour is off, not gone,
 * and turning it back on remembers what it was worth.
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Values of colours switched off, so switching one back on is lossless.
  const [remembered, setRemembered] = useState<Record<string, ChipDenomination>>({});

  const inPlay = new Map(chips.map((c) => [c.key, c]));
  const rows = [
    ...CHIP_PALETTE.map((base) => inPlay.get(base.key) ?? remembered[base.key] ?? base),
    // Anything custom the host added on top of the standard set.
    ...chips.filter((c) => !CHIP_PALETTE.some((b) => b.key === c.key)),
  ];

  const byValue = (a: ChipDenomination, b: ChipDenomination) => a.valueCents - b.valueCents;

  function toggle(chip: ChipDenomination, on: boolean) {
    if (on) {
      onChange([...chips, remembered[chip.key] ?? chip].sort(byValue));
    } else {
      setRemembered((r) => ({ ...r, [chip.key]: chip }));
      onChange(chips.filter((c) => c.key !== chip.key));
    }
  }

  function setValue(chip: ChipDenomination, raw: string) {
    setDrafts((d) => ({ ...d, [chip.key]: raw }));
    const cents = parseMoney(raw);
    if (cents === null || cents < 0) return;
    if (inPlay.has(chip.key)) {
      onChange(chips.map((c) => (c.key === chip.key ? { ...c, valueCents: cents } : c)));
    } else {
      setRemembered((r) => ({ ...r, [chip.key]: { ...chip, valueCents: cents } }));
    }
  }

  function addColour() {
    const used = new Set(chips.map((c) => c.color));
    const spare = CHIP_PALETTE.find((p) => !used.has(p.color));
    const key = `chip-${Math.random().toString(36).slice(2, 7)}`;
    onChange([
      ...chips,
      { key, label: 'New chip', color: spare?.color ?? '#7c3aed', valueCents: 100 },
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
                onChange={(e) =>
                  onChange(chips.map((c) => (c.key === chip.key ? { ...c, color: e.target.value } : c)))
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${chip.label} colour`}
              />
            </label>

            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={chip.label}
              disabled={disabled || !on}
              aria-label={`${chip.label} name`}
              onChange={(e) =>
                onChange(chips.map((c) => (c.key === chip.key ? { ...c, label: e.target.value } : c)))
              }
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
                value={drafts[chip.key] ?? (chip.valueCents / 100).toFixed(2)}
                onChange={(e) => setValue(chip, e.target.value)}
                // Drop the raw draft on blur so the field snaps back to the stored value.
                onBlur={() => setDrafts(({ [chip.key]: _dropped, ...rest }) => rest)}
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
        {chips.length === 0
          ? 'No chips in play — switch at least one colour on.'
          : `In play: ${[...chips]
              .sort(byValue)
              .map((c) => `${c.label} ${formatMoney(c.valueCents)}`)
              .join(' · ')}`}
      </p>
    </div>
  );
}
