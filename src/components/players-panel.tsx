'use client';

import { useState } from 'react';
import type { GameData } from '@/hooks/use-game';
import type { GameState, PlayerState } from '@/lib/ledger';
import {
  addGuestPlayer,
  clearFinalCount,
  recordMoney,
  setFinalCount,
  setPlayerStatus,
  transferHost,
} from '@/lib/actions';
import { inviteFriend } from '@/lib/actions';
import { blindsFor, type BlindAssignment } from '@/lib/blinds';
import { formatMoney } from '@/lib/money';
import {
  MAX_SEATS,
  type ChipCounts,
  type ChipDenomination,
  type GamePlayer,
  type KnownPlayer,
} from '@/lib/types';
import { StackInput, type StackValue } from './stack-input';
import { Button, ChipDot, Empty, Field, Money, Sheet, inputClass } from './ui';

type Role = 'dealer' | 'small' | 'big' | null;

export function PlayersPanel({
  data,
  state,
  userId,
  displayName,
  isHost,
  settled,
  friends = [],
  onChange,
}: {
  data: GameData;
  state: GameState;
  userId: string;
  displayName: string;
  isHost: boolean;
  settled: boolean;
  /** Friends who could be invited to this table. */
  friends?: KnownPlayer[];
  onChange: () => void;
}) {
  const [acting, setActing] = useState<PlayerState | null>(null);
  const [counting, setCounting] = useState<PlayerState | null>(null);
  const [handingOver, setHandingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [money, setMoneySheet] = useState<{ player: GamePlayer; kind: 'buy_in' | 'cash_out' } | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [inviting, setInviting] = useState(false);

  const me = data.players.find((p) => p.user_id === userId) ?? null;
  const chipValues = data.game.default_chip_values;
  const blinds = blindsFor(data.players, data.game.dealer_player_id);

  const seated = state.players.filter((p) => p.player.status !== 'left');
  const gone = state.players.filter((p) => p.player.status === 'left');
  const full = seated.length >= MAX_SEATS;
  // Guests have no account to host with, and you can't hand the table to yourself.
  const successors = seated.filter(
    (p) => p.player.user_id != null && p.player.user_id !== userId,
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="plate">
            Seats <span className="text-ink-500/70">{seated.length}/{MAX_SEATS}</span>
          </h2>
          <span className="plate">Stack · net</span>
        </div>

        {seated.length === 0 ? (
          <Empty>Nobody has sat down yet.</Empty>
        ) : (
          <ul className="card">
            {seated.map((p) => (
              <PlayerLine
                key={p.player.id}
                entry={p}
                isMe={p.player.user_id === userId}
                role={roleOf(blinds, p.player.id)}
                chipValues={chipValues}
                heldChips={heldChipsFor(data, p.player.id)}
                onOpen={() => setActing(p)}
              />
            ))}
          </ul>
        )}
      </section>

      {gone.length > 0 ? (
        <section>
          <h2 className="plate mb-1.5">Away from the table</h2>
          <ul className="card">
            {gone.map((p) => (
              <PlayerLine
                key={p.player.id}
                entry={p}
                isMe={p.player.user_id === userId}
                role={null}
                chipValues={chipValues}
                heldChips={heldChipsFor(data, p.player.id)}
                onOpen={() => setActing(p)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {!settled ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {friends.length > 0 ? (
            <Button
              variant="ghost"
              className="flex-1"
              disabled={full}
              onClick={() => setInviting(true)}
            >
              {full ? 'Table is full' : 'Invite a friend'}
            </Button>
          ) : null}
          {isHost ? (
            <Button
              variant="ghost"
              className="flex-1"
              disabled={full}
              onClick={() => setAddingGuest(true)}
            >
              {full ? 'Table is full' : 'Add a player without the app'}
            </Button>
          ) : null}
          {me ? (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                // A host walking out would take the settle button with them.
                if (isHost && me.status !== 'left' && successors.length > 0) {
                  setHandingOver(true);
                  return;
                }
                await setPlayerStatus(me.id, me.status === 'left' ? 'active' : 'left');
                onChange();
              }}
            >
              {me.status === 'left' ? "I'm back" : 'Leave the table'}
            </Button>
          ) : null}
        </div>
      ) : null}

      <PlayerSheet
        entry={acting}
        onClose={() => setActing(null)}
        canManage={acting != null && (isHost || acting.player.user_id === userId)}
        settled={settled}
        isHostOfTable={acting?.player.user_id === data.game.host_id}
        canMakeHost={
          isHost && acting != null && acting.player.user_id != null &&
          acting.player.user_id !== userId && acting.player.status !== 'left'
        }
        onMakeHost={async () => {
          if (!acting) return;
          try {
            await transferHost(data.game.id, acting.player.id);
            setActing(null);
            onChange();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not hand over the table.');
          }
        }}
        onMoney={(kind) => {
          if (!acting) return;
          setMoneySheet({ player: acting.player, kind });
          setActing(null);
        }}
        onStatus={async (status) => {
          if (!acting) return;
          await setPlayerStatus(acting.player.id, status);
          setActing(null);
          onChange();
        }}
        onCount={() => {
          setCounting(acting);
          setActing(null);
        }}
      />

      <FinalCountSheet
        entry={counting}
        chipValues={chipValues}
        onClose={() => setCounting(null)}
        onDone={onChange}
      />

      <MoneySheet
        open={money !== null}
        onClose={() => setMoneySheet(null)}
        player={money?.player ?? null}
        kind={money?.kind ?? 'buy_in'}
        chipValues={chipValues}
        gameId={data.game.id}
        userId={userId}
        onDone={onChange}
      />

      <HandOverSheet
        open={handingOver}
        onClose={() => setHandingOver(false)}
        candidates={successors}
        onPick={async (playerId, thenLeave) => {
          try {
            await transferHost(data.game.id, playerId);
            if (thenLeave && me) await setPlayerStatus(me.id, 'left');
            setHandingOver(false);
            onChange();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not hand over the table.');
          }
        }}
        onLeaveAnyway={async () => {
          if (me) await setPlayerStatus(me.id, 'left');
          setHandingOver(false);
          onChange();
        }}
      />

      {error ? <p className="text-sm text-rouge-400">{error}</p> : null}

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        gameId={data.game.id}
        friends={friends.filter(
          (f) => !data.players.some((p) => p.user_id === f.user_id && p.status !== 'left'),
        )}
      />

      <AddGuestSheet
        open={addingGuest}
        onClose={() => setAddingGuest(false)}
        gameId={data.game.id}
        suggestion={`${displayName}'s friend`}
        onDone={onChange}
      />
    </div>
  );
}

/** One ruled line in the book: who, what they're holding, where they stand. */
function PlayerLine({
  entry,
  isMe,
  role,
  chipValues,
  heldChips,
  onOpen,
}: {
  entry: PlayerState;
  isMe: boolean;
  role: Role;
  chipValues: ChipDenomination[];
  heldChips: ChipCounts | null;
  onOpen: () => void;
}) {
  const { player } = entry;
  const held = heldChips ? chipValues.filter((c) => heldChips[c.key]) : [];

  return (
    <li className="ledger-row last:border-b-0">
      <button
        onClick={onOpen}
        className="pressable flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate">{player.display_name}</span>
            {isMe ? <span className="text-[11px] text-brass-400">you</span> : null}
            {role ? (
              <span
                className={`text-[11px] tracking-wider ${
                  role === 'dealer' ? 'text-ink-300' : 'text-rouge-400'
                }`}
              >
                {role === 'dealer' ? 'DEALER' : role === 'small' ? 'SB' : 'BB'}
              </span>
            ) : null}
            {player.user_id === null ? (
              <span className="text-[11px] text-ink-500">guest</span>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-500">
            {held.length > 0 ? (
              held.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1">
                  <ChipDot chip={c} size={11} />
                  <span className="tabular text-ink-300">{heldChips?.[c.key]}</span>
                </span>
              ))
            ) : (
              <span>{entry.counted ? `in ${formatMoney(entry.startedWithCents)}` : 'not counted yet'}</span>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {entry.counted ? (
            <>
              <span className="figure block text-lg">
                {formatMoney((entry.endedWithCents ?? 0) + entry.cashedOutCents)}
              </span>
              <Money cents={entry.netCents} sign className="block text-[11px]" />
            </>
          ) : (
            <>
              <span className="figure block text-lg text-ink-300">
                {formatMoney(entry.startedWithCents)}
              </span>
              <span className="block text-[11px] text-ink-500">in</span>
            </>
          )}
        </span>

        <span aria-hidden className="shrink-0 text-ink-500">
          ›
        </span>
      </button>
    </li>
  );
}

/** Tapping a seat opens their page in the book, with the actions on it. */
function PlayerSheet({
  entry,
  onClose,
  canManage,
  settled,
  onMoney,
  onStatus,
  onCount,
  isHostOfTable,
  canMakeHost,
  onMakeHost,
}: {
  entry: PlayerState | null;
  onClose: () => void;
  canManage: boolean;
  settled: boolean;
  onMoney: (kind: 'buy_in' | 'cash_out') => void;
  onStatus: (status: 'active' | 'left') => void;
  onCount: () => void;
  isHostOfTable: boolean;
  canMakeHost: boolean;
  onMakeHost: () => void;
}) {
  if (!entry) return null;

  return (
    <Sheet open onClose={onClose} title={entry.player.display_name}>
      <div className="space-y-5">
        {isHostOfTable ? <p className="plate text-brass-400">Host of this table</p> : null}
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Started with', value: formatMoney(entry.startedWithCents) },
            {
              label: 'Ended with',
              value: entry.counted
                ? formatMoney((entry.endedWithCents ?? 0) + entry.cashedOutCents)
                : '—',
            },
            { label: 'Net', value: null },
          ].map((cell) => (
            <div key={cell.label} className="border border-white/10 px-2 py-3">
              <dt className="plate">{cell.label}</dt>
              <dd className="figure mt-1 text-lg">
                {cell.value ?? <Money cents={entry.netCents} sign />}
              </dd>
            </div>
          ))}
        </dl>


        {canManage && !settled ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className="col-span-2" onClick={onCount}>
              {entry.counted ? 'Change their final count' : 'Count them up'}
            </Button>
            <Button variant="ghost" onClick={() => onMoney('buy_in')}>
              Buy in
            </Button>
            <Button variant="ghost" onClick={() => onMoney('cash_out')}>
              Cash out
            </Button>
            <Button
              variant="ghost"
              className="col-span-2"
              onClick={() => onStatus(entry.player.status === 'left' ? 'active' : 'left')}
            >
              {entry.player.status === 'left' ? 'Back at the table' : 'Mark away'}
            </Button>
            {canMakeHost ? (
              <Button variant="ghost" className="col-span-2" onClick={onMakeHost}>
                Make {entry.player.display_name} the host
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            {settled
              ? 'This game is settled.'
              : 'Only this player or the host can change their money.'}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function MoneySheet({
  open,
  onClose,
  player,
  kind,
  chipValues,
  gameId,
  userId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  player: GamePlayer | null;
  kind: 'buy_in' | 'cash_out';
  chipValues: ChipDenomination[];
  gameId: string;
  userId: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState<StackValue>({ cents: 0, chips: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!player || value.cents <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await recordMoney({
        gameId,
        playerId: player.id,
        kind,
        amountCents: value.cents,
        chips: value.chips,
        userId,
      });
      setValue({ cents: 0, chips: null });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${kind === 'buy_in' ? 'Buy in' : 'Cash out'} — ${player?.display_name ?? ''}`}
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          {kind === 'buy_in'
            ? 'Money onto the table. Buy as many chips as you like, as often as you like.'
            : 'Chips off the table and money back in a pocket. This is not a win or a loss.'}
        </p>
        <StackInput chips={chipValues} value={value} onChange={setValue} autoFocus />
        {error ? <p className="text-sm text-rouge-400">{error}</p> : null}
        <Button className="w-full" onClick={submit} disabled={busy || value.cents <= 0}>
          {busy
            ? 'Saving…'
            : value.cents <= 0
              ? kind === 'buy_in'
                ? 'Buy in'
                : 'Cash out'
              : `${kind === 'buy_in' ? 'Buy in for' : 'Cash out'} ${formatMoney(value.cents)}`}
        </Button>
      </div>
    </Sheet>
  );
}

function AddGuestSheet({
  open,
  onClose,
  gameId,
  suggestion,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  suggestion: string;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title="Add a player">
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          For someone at the table without the app. You keep their ledger; they can claim a
          seat later by joining with the code.
        </p>
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            placeholder={suggestion}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-rouge-400">{error}</p> : null}
        <Button
          className="w-full"
          disabled={busy || name.trim().length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await addGuestPlayer(gameId, name.trim());
              setName('');
              onDone();
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not add them.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Adding…' : 'Add to the table'}
        </Button>
      </div>
    </Sheet>
  );
}

function roleOf(blinds: BlindAssignment, playerId: string): Role {
  if (blinds.smallBlind?.id === playerId) return 'small';
  if (blinds.bigBlind?.id === playerId) return 'big';
  if (blinds.dealer?.id === playerId) return 'dealer';
  return null;
}

/** The chips someone was counted with, if whoever counted used chip counts. */
function heldChipsFor(data: GameData, playerId: string): ChipCounts | null {
  return data.players.find((p) => p.id === playerId)?.final_chips ?? null;
}


/** The one count that decides a player's night. */
function FinalCountSheet({
  entry,
  chipValues,
  onClose,
  onDone,
}: {
  entry: PlayerState | null;
  chipValues: ChipDenomination[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState<StackValue>({ cents: 0, chips: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  async function save() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await setFinalCount(entry.player.id, value.cents, value.chips);
      setValue({ cents: 0, chips: null });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that count.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Count up — ${entry.player.display_name}`}>
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          Everything in front of them right now. They started with{' '}
          {formatMoney(entry.startedWithCents)}
          {entry.cashedOutCents > 0
            ? ` and took ${formatMoney(entry.cashedOutCents)} off the table earlier`
            : ''}
          .
        </p>

        <StackInput chips={chipValues} value={value} onChange={setValue} defaultMode="chips" />

        <p className="flex items-baseline justify-between border-t border-white/10 pt-3">
          <span className="plate">That makes their night</span>
          <Money
            cents={value.cents + entry.cashedOutCents - entry.startedWithCents}
            sign
            className="figure text-xl"
          />
        </p>

        {error ? <p className="text-sm text-rouge-400">{error}</p> : null}

        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save their count'}
        </Button>

        {entry.counted ? (
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await clearFinalCount(entry.player.id);
                onDone();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Clear the count
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * Shown when the host tries to leave. The host is the only one who can set chip
 * values or lock the settlement, so walking out without passing it on leaves a
 * table nobody can close — but it's still their call, hence the escape hatch.
 */
function HandOverSheet({
  open,
  onClose,
  candidates,
  onPick,
  onLeaveAnyway,
}: {
  open: boolean;
  onClose: () => void;
  candidates: PlayerState[];
  onPick: (playerId: string, thenLeave: boolean) => void;
  onLeaveAnyway: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title="Who takes over the table?">
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          You&apos;re the host, so you&apos;re the only one who can change the chip values or
          settle the night. Pass it to someone who&apos;s staying.
        </p>

        <ul className="card">
          {candidates.map((p) => (
            <li key={p.player.id} className="ledger-row last:border-b-0">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    onPick(p.player.id, true);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="pressable flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="truncate">{p.player.display_name}</span>
                <span aria-hidden className="text-ink-500">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Button variant="ghost" className="w-full" disabled={busy} onClick={onLeaveAnyway}>
          Leave without handing it over
        </Button>
        <p className="text-xs text-ink-500">
          You can hand the table over at any time from a player&apos;s seat, and you keep your
          chips and your history either way.
        </p>
      </div>
    </Sheet>
  );
}

/** Invite a friend to this table. They get it on their dashboard. */
function InviteSheet({
  open,
  onClose,
  gameId,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  friends: KnownPlayer[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title="Invite a friend">
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          They&apos;ll see the invitation on their dashboard and can take a seat from there.
          No code to type.
        </p>

        {friends.length === 0 ? (
          <Empty>Every one of your friends is already at this table.</Empty>
        ) : (
          <ul className="card">
            {friends.map((f) => (
              <li
                key={f.user_id}
                className="ledger-row flex items-center gap-3 px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate">{f.display_name}</span>
                {sent.includes(f.user_id) ? (
                  <span className="plate shrink-0 text-brass-400">invited</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy === f.user_id}
                    onClick={async () => {
                      setBusy(f.user_id);
                      setError(null);
                      try {
                        await inviteFriend(gameId, f.user_id);
                        setSent((s) => [...s, f.user_id]);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Could not invite them.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Invite
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="text-sm text-rouge-400">{error}</p> : null}
      </div>
    </Sheet>
  );
}
