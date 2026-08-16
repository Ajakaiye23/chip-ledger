'use client';

import { createClient } from './supabase/client';
import type { ChipCounts, ChipDenomination, LedgerKind, Payment, PlayerStatus } from './types';

/** Thin wrappers over the tables. Every write is guarded by RLS on the server. */

export async function recordMoney(args: {
  gameId: string;
  playerId: string;
  kind: LedgerKind;
  amountCents: number;
  chips?: ChipCounts | null;
  note?: string | null;
  userId: string;
}) {
  const { error } = await createClient().from('ledger_entries').insert({
    game_id: args.gameId,
    player_id: args.playerId,
    kind: args.kind,
    amount_cents: args.amountCents,
    chips: args.chips ?? null,
    note: args.note ?? null,
    created_by: args.userId,
  });
  if (error) throw new Error(error.message);
}

/** What a player had in front of them at the end. The number that decides the night. */
export async function setFinalCount(playerId: string, stackCents: number, chips: ChipCounts | null) {
  const { error } = await createClient().rpc('set_final_count', {
    p_player_id: playerId,
    p_stack_cents: stackCents,
    p_chips: chips,
  });
  if (error) throw new Error(error.message);
}

export async function clearFinalCount(playerId: string) {
  const { error } = await createClient()
    .from('game_players')
    .update({ final_stack_cents: null, final_chips: null })
    .eq('id', playerId);
  if (error) throw new Error(error.message);
}

/** Move the button one seat. Any player can do it; no money is involved. */
export async function nextHand(gameId: string) {
  const { error } = await createClient().rpc('next_hand', { p_game_id: gameId });
  if (error) throw new Error(error.message);
}

export async function addGuestPlayer(gameId: string, displayName: string) {
  const { error } = await createClient()
    .from('game_players')
    .insert({ game_id: gameId, display_name: displayName, user_id: null });
  if (error) throw new Error(error.message);
}

export async function setPlayerStatus(playerId: string, status: PlayerStatus) {
  const { error } = await createClient()
    .from('game_players')
    .update({ status, left_at: status === 'left' ? new Date().toISOString() : null })
    .eq('id', playerId);
  if (error) throw new Error(error.message);
}

export async function setChipValues(gameId: string, chipValues: ChipDenomination[]) {
  const { error } = await createClient()
    .from('games')
    .update({ default_chip_values: chipValues })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

/** Locks the game: stores the payment plan and stops further edits. */
export async function finishGame(args: {
  gameId: string;
  payments: Payment[];
  totals: Array<{ playerId: string; netCents: number; startedWithCents: number }>;
}) {
  const supabase = createClient();
  const { error: settleError } = await supabase.from('settlements').upsert(
    { game_id: args.gameId, payments: args.payments, totals: args.totals },
    { onConflict: 'game_id' },
  );
  if (settleError) throw new Error(settleError.message);

  const { error } = await supabase
    .from('games')
    .update({ status: 'settled', ended_at: new Date().toISOString() })
    .eq('id', args.gameId);
  if (error) throw new Error(error.message);
}

export async function reopenGame(gameId: string) {
  const { error } = await createClient()
    .from('games')
    .update({ status: 'active', ended_at: null })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

/** "Ayo A." — stored whole for display, in parts so it can be edited later. */
export async function saveProfileName(args: {
  userId: string;
  firstName: string;
  lastInitial: string;
  displayName: string;
}) {
  const { error } = await createClient()
    .from('profiles')
    .update({
      first_name: args.firstName,
      last_initial: args.lastInitial,
      display_name: args.displayName,
    })
    .eq('id', args.userId);
  if (error) throw new Error(error.message);
}

/** Hand the table to another player. Only the current host may do this. */
export async function transferHost(gameId: string, newHostPlayerId: string) {
  const { error } = await createClient().rpc('transfer_host', {
    p_game_id: gameId,
    p_new_host_player_id: newHostPlayerId,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

// ------------------------------------------------------------------ friends --

export async function sendFriendRequest(userId: string) {
  const { error } = await createClient().rpc('send_friend_request', { p_user_id: userId });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

export async function respondToFriendRequest(id: string, accept: boolean) {
  const { error } = await createClient().rpc('respond_to_friend_request', {
    p_id: id,
    p_accept: accept,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

export async function removeFriend(userId: string) {
  const { error } = await createClient().rpc('remove_friend', { p_user_id: userId });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

export async function inviteFriend(gameId: string, userId: string) {
  const { error } = await createClient().rpc('invite_friend', {
    p_game_id: gameId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

export async function requestToJoin(gameId: string) {
  const { error } = await createClient().rpc('request_to_join', { p_game_id: gameId });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}

export async function respondToGameRequest(id: string, accept: boolean) {
  const { error } = await createClient().rpc('respond_to_game_request', {
    p_id: id,
    p_accept: accept,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
}
