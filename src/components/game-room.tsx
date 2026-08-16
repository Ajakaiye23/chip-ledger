'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGame, type GameData } from '@/hooks/use-game';
import { blindsFor } from '@/lib/blinds';
import { computeGameState } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { GuideButton, GuideSheet, useGuide } from './guide';
import { HandPanel } from './hand-panel';
import { NightPanel } from './night-panel';
import { PlayersPanel } from './players-panel';
import { SettlePanel } from './settle-panel';
import { Money } from './ui';
import { YourTurnBanner, roleFor } from './your-turn';

type Tab = 'table' | 'hand' | 'night' | 'settle';

export function GameRoom({
  userId,
  displayName,
  initial,
}: {
  userId: string;
  displayName: string;
  initial: GameData;
}) {
  const { data, refresh, syncing } = useGame(initial);
  return (
    <GameRoomView
      userId={userId}
      displayName={displayName}
      data={data}
      syncing={syncing}
      onChange={refresh}
    />
  );
}

/** The table itself, given data from anywhere — live subscription or a preview. */
export function GameRoomView({
  userId,
  displayName,
  data,
  syncing,
  onChange,
}: {
  userId: string;
  displayName: string;
  data: GameData;
  syncing: boolean;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>('table');
  const guide = useGuide();

  const state = useMemo(
    () =>
      computeGameState({ players: data.players, entries: data.entries }),
    [data],
  );

  const isHost = data.game.host_id === userId;
  const me = data.players.find((p) => p.user_id === userId) ?? null;
  const settled = data.game.status === 'settled';
  const myBlinds = blindsFor(data.players, data.game.dealer_player_id);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'table', label: 'Table' },
    { key: 'hand', label: 'Hand' },
    { key: 'night', label: 'Night' },
    { key: 'settle', label: 'Settle' },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      {/* Opaque, not translucent: a blurred sticky bar repaints on every scroll frame. */}
      <header className="sticky top-0 z-30 -mx-4 mb-5 border-b border-white/10 bg-night-950 px-4 pt-3 sm:-mx-6 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="-ml-1 inline-flex min-h-8 items-center px-1 text-xs text-ink-500 hover:text-ink-300"
            >
              ← All games
            </Link>
            <h1 className="display truncate text-2xl">{data.game.name}</h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
              <span>
                {settled
                  ? 'Settled'
                  : state.uncounted === 0 && state.potInCents > 0
                    ? 'Everyone counted'
                    : `${data.players.filter((p) => p.status !== 'left').length} at the table`}
              </span>
              {syncing ? <span className="text-brass-400">syncing…</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GuideButton onClick={guide.show} />
            <ShareCode code={data.game.code} name={data.game.name} />
          </div>
        </div>

        <nav className="mt-3 -mb-px flex gap-5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`plate flex min-h-11 items-end border-b-2 pb-2.5 transition-colors ${
                tab === t.key
                  ? 'border-brass-500 text-brass-400'
                  : 'border-transparent hover:text-ink-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {!settled ? (
        <YourTurnBanner
          role={roleFor(myBlinds, me?.id ?? null)}
          smallBlindCents={data.game.small_blind_cents}
          bigBlindCents={data.game.big_blind_cents}
          alsoDealer={myBlinds.dealer?.id === me?.id}
        />
      ) : null}

      <section className="mb-6 flex items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="plate">On the table</p>
          <p className="figure text-4xl">{formatMoney(state.potInCents)}</p>
        </div>
        <div className="text-right">
          <p className="plate">Your position</p>
          <p className="figure text-4xl">
            <Money cents={me ? (state.byPlayerId.get(me.id)?.netCents ?? 0) : 0} sign />
          </p>
        </div>
      </section>

      {state.uncounted === 0 && state.imbalanceCents !== 0 ? (
        <p className="mb-5 border-l-2 border-brass-500 bg-brass-500/5 px-3 py-2.5 text-sm text-brass-400">
          The counts add up to {formatMoney(Math.abs(state.imbalanceCents))}{' '}
          {state.imbalanceCents > 0 ? 'more' : 'less'} than the money that went on the table.
          Worth a recount — settling anyway puts the difference on the biggest position.
        </p>
      ) : null}

      {tab === 'table' ? (
        <PlayersPanel
          data={data}
          state={state}
          userId={userId}
          displayName={displayName}
          isHost={isHost}
          settled={settled}
          onChange={onChange}
        />
      ) : null}

      {tab === 'hand' ? (
        <HandPanel data={data} isHost={isHost} settled={settled} onChange={onChange} />
      ) : null}

      {tab === 'night' ? <NightPanel data={data} state={state} /> : null}

      {tab === 'settle' ? (
        <SettlePanel data={data} state={state} isHost={isHost} onChange={onChange} />
      ) : null}

      <GuideSheet open={guide.open} onClose={guide.close} />
    </main>
  );
}

function ShareCode({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/game/${code}`;
    const canShare = typeof navigator.share === 'function';
    if (canShare) {
      try {
        await navigator.share({ title: name, text: `Join my poker table — code ${code}`, url });
        return;
      } catch {
        // Cancelled; fall through to copying.
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      onClick={share}
      className="pressable shrink-0 border-l border-white/10 px-3 py-1 text-right"
      aria-label="Share the join code"
    >
      <span className="plate block">{copied ? 'Copied' : 'Code'}</span>
      <span className="block font-mono text-lg tracking-[0.18em] text-brass-400">{code}</span>
    </button>
  );
}
