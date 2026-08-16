'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  removeFriend,
  requestToJoin,
  respondToFriendRequest,
  respondToGameRequest,
  sendFriendRequest,
} from '@/lib/actions';
import type { GameRequest, KnownPlayer, OpenGame } from '@/lib/types';
import { Button, Empty } from './ui';

type PendingRequest = GameRequest & { game_name: string; other_name: string };

/**
 * Friends, and the two things friendship is for: getting invited to a table, and
 * asking to join one.
 *
 * There's no search box and no directory — the only people who can appear here
 * are people you've already sat at a table with. That's the whole spam model.
 */
export function FriendsPanel({
  known,
  openGames,
  requests,
}: {
  known: KnownPlayer[];
  openGames: OpenGame[];
  requests: PendingRequest[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, work: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await work();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const friends = known.filter((k) => k.friendship_status === 'accepted');
  const waitingOnMe = known.filter((k) => k.friendship_status === 'pending' && k.they_asked);
  const asked = known.filter((k) => k.friendship_status === 'pending' && !k.they_asked);
  const strangers = known.filter((k) => k.friendship_status === 'none');
  const joinable = openGames.filter((g) => !g.already_in);

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rouge-400">{error}</p> : null}

      {requests.length > 0 ? (
        <section>
          <h2 className="plate mb-1.5 text-brass-400">Waiting on you</h2>
          <ul className="card">
            {requests.map((r) => (
              <li key={r.id} className="ledger-row px-4 py-3 last:border-b-0">
                <p className="text-sm">
                  {r.kind === 'invite' ? (
                    <>
                      You&apos;re invited to <span className="text-ink-100">{r.game_name}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-ink-100">{r.other_name}</span> wants to join{' '}
                      {r.game_name}
                    </>
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() => run(r.id, () => respondToGameRequest(r.id, true))}
                  >
                    {r.kind === 'invite' ? 'Join' : 'Let them in'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === r.id}
                    onClick={() => run(r.id, () => respondToGameRequest(r.id, false))}
                  >
                    No thanks
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {waitingOnMe.length > 0 ? (
        <section>
          <h2 className="plate mb-1.5 text-brass-400">Friend requests</h2>
          <ul className="card">
            {waitingOnMe.map((k) => (
              <li key={k.user_id} className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1 truncate">{k.display_name}</span>
                <Button
                  size="sm"
                  disabled={busy === k.user_id}
                  onClick={() =>
                    run(k.user_id, () => respondToFriendRequest(k.friendship_id!, true))
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === k.user_id}
                  onClick={() =>
                    run(k.user_id, () => respondToFriendRequest(k.friendship_id!, false))
                  }
                >
                  Ignore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {joinable.length > 0 ? (
        <section>
          <h2 className="plate mb-1.5">Friends playing now</h2>
          <ul className="card">
            {joinable.map((g) => (
              <li
                key={g.game_id}
                className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{g.name}</span>
                  <span className="text-xs text-ink-500">
                    {g.host_name}&apos;s table · {g.seats_taken}/8 seats
                  </span>
                </span>
                {g.pending_request ? (
                  <span className="plate shrink-0">asked</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy === g.game_id || g.seats_taken >= 8}
                    onClick={() => run(g.game_id, () => requestToJoin(g.game_id))}
                  >
                    {g.seats_taken >= 8 ? 'Full' : 'Ask to join'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="plate mb-1.5">Friends</h2>
        {friends.length === 0 ? (
          <Empty>No friends yet. Add someone you&apos;ve played with, below.</Empty>
        ) : (
          <ul className="card">
            {friends.map((k) => (
              <li key={k.user_id} className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{k.display_name}</span>
                  <span className="text-xs text-ink-500">
                    {k.nights_together} {k.nights_together === 1 ? 'night' : 'nights'} together
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === k.user_id}
                  onClick={() => run(k.user_id, () => removeFriend(k.user_id))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {strangers.length > 0 || asked.length > 0 ? (
        <section>
          <h2 className="plate mb-1.5">People you&apos;ve played with</h2>
          <ul className="card">
            {[...strangers, ...asked].map((k) => (
              <li key={k.user_id} className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{k.display_name}</span>
                  <span className="text-xs text-ink-500">
                    {k.nights_together} {k.nights_together === 1 ? 'night' : 'nights'} together
                  </span>
                </span>
                {k.friendship_status === 'pending' ? (
                  <span className="plate shrink-0">asked</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === k.user_id}
                    onClick={() => run(k.user_id, () => sendFriendRequest(k.user_id))}
                  >
                    Add friend
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {known.length === 0 ? (
        <Empty>Play a night with someone and they&apos;ll show up here.</Empty>
      ) : null}
    </div>
  );
}
