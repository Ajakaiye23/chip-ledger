'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGame, type GameData } from '@/hooks/use-game';
import { blindsFor } from '@/lib/blinds';
import { computeGameState } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { HistoryPanel } from './history-panel';
import { PlayersPanel } from './players-panel';
import { RoundsPanel } from './rounds-panel';
import { SettlePanel } from './settle-panel';
import { Money } from './ui';
import { YourTurnBanner, roleFor } from './your-turn';

type Tab = 'table' | 'rounds' | 'history' | 'settle';

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

  const state = useMemo(
    () =>
      computeGameState({
        players: data.players,
        rounds: data.rounds,
        entries: data.entries,
        stacks: data.stacks,
      }),
    [data],
  );

  const isHost = data.game.host_id === userId;
  const me = data.players.find((p) => p.user_id === userId) ?? null;
  const openRound = data.rounds.find((r) => r.status === 'open') ?? null;
  const settled = data.game.status === 'settled';
  const myBlinds = blindsFor(data.players, openRound?.dealer_player_id ?? null);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'table', label: 'Table' },
    { key: 'rounds', label: 'Round' },
    { key: 'history', label: 'History' },
    { key: 'settle', label: 'Settle' },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      {/* Opaque, not translucent: a blurred sticky bar repaints on every scroll frame. */}
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-brass-500/15 bg-felt-950 px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/dashboard" className="text-xs text-ink-500 hover:text-ink-300">
              ← All games
            </Link>
            <h1 className="display truncate text-2xl font-semibold">{data.game.name}</h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
              <span>
                {settled ? 'Settled' : openRound ? `Round ${openRound.number} in play` : 'Between rounds'}
              </span>
              {syncing ? <span className="text-brass-400">syncing…</span> : null}
            </p>
          </div>
          <ShareCode code={data.game.code} name={data.game.name} />
        </div>

        <div className="mt-3 flex gap-1 rounded-xl bg-black/30 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pressable flex-1 rounded-lg px-3 py-2 text-sm ${
                tab === t.key ? 'bg-white/10 font-medium text-ink-100' : 'text-ink-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {openRound && !settled ? (
        <YourTurnBanner
          role={roleFor(myBlinds, me?.id ?? null)}
          smallBlindCents={data.game.small_blind_cents}
          bigBlindCents={data.game.big_blind_cents}
          alsoDealer={myBlinds.dealer?.id === me?.id}
        />
      ) : null}

      <section className="card mb-4 flex items-center justify-between gap-4 p-4">
        <div>
          <p className="plate">On the table</p>
          <p className="display text-3xl font-semibold tabular">{formatMoney(state.potInCents)}</p>
        </div>
        <div className="text-right">
          <p className="plate">Your position</p>
          <p className="display text-3xl font-semibold">
            <Money cents={me ? (state.byPlayerId.get(me.id)?.netCents ?? 0) : 0} sign />
          </p>
        </div>
      </section>

      {state.imbalanceCents !== 0 ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Chips on the table don&apos;t match the money in it — off by{' '}
          <strong>{formatMoney(Math.abs(state.imbalanceCents))}</strong>. Someone&apos;s stack was
          probably typed wrong. Settling anyway will put the difference on the biggest position.
        </p>
      ) : null}

      {tab === 'table' ? (
        <PlayersPanel
          data={data}
          state={state}
          userId={userId}
          displayName={displayName}
          isHost={isHost}
          openRoundId={openRound?.id ?? null}
          settled={settled}
          onChange={onChange}
        />
      ) : null}

      {tab === 'rounds' ? (
        <RoundsPanel
          data={data}
          state={state}
          userId={userId}
          isHost={isHost}
          settled={settled}
          onChange={onChange}
        />
      ) : null}

      {tab === 'history' ? <HistoryPanel data={data} state={state} /> : null}

      {tab === 'settle' ? (
        <SettlePanel data={data} state={state} isHost={isHost} onChange={onChange} />
      ) : null}
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
      className="pressable shrink-0 rounded-xl border border-brass-500/40 bg-brass-500/10 px-3 py-2 text-right"
      aria-label="Share the join code"
    >
      <span className="block text-[10px] tracking-[0.14em] text-brass-400 uppercase">
        {copied ? 'Link copied' : 'Join code'}
      </span>
      <span className="block font-mono text-lg tracking-[0.2em] text-brass-400">{code}</span>
    </button>
  );
}
