'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dashboard } from './dashboard';
import { GameRoomView } from './game-room';
import {
  PREVIEW_USER_ID,
  sampleGame,
  sampleKnownPlayers,
  sampleLeaderboard,
  sampleOpenGames,
  sampleDebts,
  sampleGlobalBoard,
  sampleRequests,
  sampleSummaries,
} from '@/lib/sample-game';

export function PreviewShell() {
  const [view, setView] = useState<'dashboard' | 'game'>('game');
  const summaries = sampleSummaries();

  return (
    <div>
      <div className="border-b border-brass-500/30 bg-brass-500/10">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="text-xs text-brass-400">
            <strong className="font-semibold">Preview</strong> — made-up players, nothing saved.
          </span>

          <div className="flex gap-1 text-xs">
            {(['game', 'dashboard'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`inline-flex min-h-9 items-center rounded px-2.5 ${
                  view === v ? 'bg-brass-500/25 font-medium text-brass-400' : 'text-ink-300 underline'
                }`}
              >
                {v === 'game' ? 'The table' : 'Your stats'}
              </button>
            ))}
          </div>

          <Link
            href="/"
            className="pressable ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brass-500 px-3 text-xs font-semibold text-night-950"
          >
            Exit preview
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      {view === 'game' ? (
        <GameRoomView
          userId={PREVIEW_USER_ID}
          displayName="Hannah B."
          data={sampleGame}
          syncing={false}
          friends={sampleKnownPlayers().filter((k) => k.friendship_status === 'accepted')}
          onChange={() => {}}
        />
      ) : (
        <Dashboard
          userId={PREVIEW_USER_ID}
          displayName="Hannah B."
          avatarUrl={null}
          summaries={summaries}
          leaderboard={sampleLeaderboard()}
          known={sampleKnownPlayers()}
          openGames={sampleOpenGames()}
          requests={sampleRequests()}
          debts={sampleDebts()}
          globalBoard={sampleGlobalBoard()}
        />
      )}
    </div>
  );
}
