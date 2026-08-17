-- Exercises the schema the way the app does: host opens a table, someone joins by
-- code, money goes in, a round is scored, someone leaves and comes back, and the
-- game gets settled. Also checks that the RLS policies actually keep strangers out.
--
-- Run with: npm run test:db

\set ON_ERROR_STOP on

-- ------------------------------------------------------------- fixtures --

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'host@example.com', '{"full_name":"Host Hannah"}'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.com', '{"full_name":"Sam"}'),
  ('33333333-3333-3333-3333-333333333333', 'nosy@example.com', '{"full_name":"Nosy Neighbour"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.com', '{"full_name":"Never Played"}');

do $$
begin
  assert (select count(*) from public.profiles) = 4,
    'the auth trigger should have created a profile per user';
  assert (select display_name from public.profiles
          where id = '11111111-1111-1111-1111-111111111111') = 'Host Hannah',
    'display name should come from the OAuth metadata';
end;
$$;

-- --------------------------------------------------- host opens a table --

set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select public.create_game(
  'Friday night',
  '[{"key":"blue","label":"Blue","color":"#2563eb","valueCents":500}]'::jsonb,
  'Hannah'
) as game \gset

\set game_code `echo ''`
select code as game_code, id as game_id from public.games limit 1 \gset

do $$
begin
  assert (select count(*) from public.games) = 1, 'the game should exist';
  assert (select length(code) from public.games) = 6, 'join code should be six characters';
  assert (select count(*) from public.game_players) = 1, 'the host should be seated';
end;
$$;

-- ------------------------------------------------------- a stranger looks --

set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
begin
  assert (select count(*) from public.games) = 0,
    'RLS should hide a game from someone who is not in it';
  assert (select count(*) from public.game_players) = 0,
    'RLS should hide the seats too';
end;
$$;

-- ------------------------------------------------------- Sam joins by code --

set test.uid = '22222222-2222-2222-2222-222222222222';
select public.join_game(:'game_code', 'Sam') as joined \gset

do $$
begin
  assert (select count(*) from public.games) = 1, 'Sam can now see the game';
  assert (select count(*) from public.game_players) = 2, 'two seats at the table';
end;
$$;

-- Joining a second time must reuse the same seat, not create a new one.
select public.join_game(:'game_code', 'Sam') as rejoined \gset
do $$
begin
  assert (select count(*) from public.game_players) = 2,
    'rejoining should reuse the existing seat';
end;
$$;

-- ------------------------------------------------------- money and counting --

set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.ledger_entries (game_id, player_id, kind, amount_cents)
select :'game_id', id, 'buy_in', 4000 from public.game_players;

do $$
begin
  assert (select sum(amount_cents) from public.ledger_entries) = 8000, '$80 on the table';
end;
$$;

-- The button moves a seat at a time, and any player may move it.
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.next_hand(:'game_id') as h1 \gset
select public.next_hand(:'game_id') as h2 \gset

do $$
begin
  assert (select hand_number from public.games) = 2, 'two hands dealt';
  assert (select dealer_player_id from public.games) =
         (select id from public.game_players where display_name = 'Sam'),
    'the button should have moved to the second seat';
end;
$$;

-- A player may record their own final count.
select public.set_final_count(
  (select id from public.game_players where user_id = auth.uid()), 2500, null);

do $$
begin
  assert (select final_stack_cents from public.game_players where display_name = 'Sam') = 2500,
    'Sam should be counted at $25';
end;
$$;

-- But not someone else's.
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.set_final_count(
      (select id from public.game_players where display_name = 'Hannah'), 999999, null);
  exception when others then
    denied := true;
  end;
  assert denied, 'a player must not be able to count somebody else up';
end;
$$;

-- The host can count anyone.
set test.uid = '11111111-1111-1111-1111-111111111111';
select public.set_final_count(
  (select id from public.game_players where display_name = 'Hannah'), 5500, null);

do $$
begin
  assert (select sum(final_stack_cents) from public.game_players) = 8000,
    'chips counted off the table should match the money put on it';
end;
$$;

-- ------------------------------------------------- Sam leaves, then returns --

set test.uid = '22222222-2222-2222-2222-222222222222';
update public.game_players set status = 'left', left_at = now() where user_id = auth.uid();
select public.join_game(:'game_code', 'Sam') as back \gset

do $$
begin
  assert (select status from public.game_players
          where user_id = '22222222-2222-2222-2222-222222222222') = 'active',
    'rejoining should put Sam back in play';
  assert (select final_stack_cents from public.game_players where display_name = 'Sam') = 2500,
    'leaving must not touch a recorded count';
end;
$$;

-- ------------------------------------------------------------ chip values --

-- The host sets what the chips are worth.
set test.uid = '11111111-1111-1111-1111-111111111111';
update public.games
set default_chip_values = '[{"key":"red","label":"Red","color":"#dc2626","valueCents":25}]'::jsonb
where id = :'game_id';

do $$
begin
  assert (select (default_chip_values->0->>'valueCents')::int from public.games) = 25,
    'the host should be able to set chip values';
end;
$$;

-- A player at the table cannot. RLS filters the row out, so the update is a no-op
-- rather than an error — which is why this asserts on the value, not on a raise.
set test.uid = '22222222-2222-2222-2222-222222222222';
update public.games
set default_chip_values = '[{"key":"red","label":"Red","color":"#dc2626","valueCents":9999}]'::jsonb
where id = :'game_id';

do $$
begin
  assert (select (default_chip_values->0->>'valueCents')::int from public.games) = 25,
    'a non-host must not be able to change what the chips are worth';
end;
$$;

-- Nor the blinds, the name, or anything else on the game.
update public.games set small_blind_cents = 500, name = 'Hijacked' where id = :'game_id';

do $$
begin
  assert (select small_blind_cents from public.games) = 10, 'blinds are the host''s to set';
  assert (select name from public.games) = 'Friday night', 'so is the table name';
end;
$$;

-- --------------------------------------------------------- table capacity --

set test.uid = '11111111-1111-1111-1111-111111111111';

-- Two seats are taken; the host fills the rest with guests.
insert into public.game_players (game_id, display_name)
select :'game_id', 'Guest ' || i from generate_series(1, 6) i;

do $$
begin
  assert public.seats_taken((select id from public.games)) = 8, 'eight seats taken';
end;
$$;

-- A ninth must be refused, whether the host adds them...
do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.game_players (game_id, display_name)
    values ((select id from public.games), 'One too many');
  exception when others then
    denied := true;
  end;
  assert denied, 'a ninth seat should be refused';
end;
$$;

-- ...or somebody tries to join with the code.
select set_config('test.code', :'game_code', false);

set test.uid = '33333333-3333-3333-3333-333333333333';
do $do$
declare
  denied boolean := false;
begin
  begin
    perform public.join_game(current_setting('test.code'), 'Nosy');
  exception when others then
    denied := true;
  end;
  assert denied, 'joining a full table should be refused';
end;
$do$;

-- A seat freed up can be taken.
set test.uid = '11111111-1111-1111-1111-111111111111';
update public.game_players set status = 'left', left_at = now()
where display_name = 'Guest 6';

set test.uid = '33333333-3333-3333-3333-333333333333';
select public.join_game(:'game_code', 'Nosy') as late_join \gset

do $$
begin
  assert public.seats_taken((select id from public.games)) = 8, 'the freed seat was taken';
  assert exists (select 1 from public.game_players where display_name = 'Nosy'),
    'the late joiner should be seated';
end;
$$;

-- --------------------------------------------------------- handing it over --

-- A player can't take the table for themselves.
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.transfer_host(
      (select id from public.games),
      (select id from public.game_players where user_id = auth.uid()));
  exception when others then
    denied := true;
  end;
  assert denied, 'a player must not be able to make themselves host';
end;
$$;

set test.uid = '11111111-1111-1111-1111-111111111111';

-- Nor can the host hand it to a guest, who has no account to host with.
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.transfer_host(
      (select id from public.games),
      (select id from public.game_players where user_id is null limit 1));
  exception when others then
    denied := true;
  end;
  assert denied, 'a guest has no account and cannot be host';
end;
$$;

-- The host hands over to Sam.
select public.transfer_host(
  :'game_id',
  (select id from public.game_players where display_name = 'Sam')) as handed \gset

do $$
begin
  assert (select host_id from public.games) = '22222222-2222-2222-2222-222222222222',
    'Sam should now be the host';
end;
$$;

-- Sam can now do host things...
set test.uid = '22222222-2222-2222-2222-222222222222';
update public.games set name = 'Sam''s table' where id = :'game_id';
do $$
begin
  assert (select name from public.games) = 'Sam''s table', 'the new host can rename the table';
end;
$$;

-- ...and Hannah can't any more.
set test.uid = '11111111-1111-1111-1111-111111111111';
update public.games set name = 'Taking it back' where id = :'game_id';
do $$
begin
  assert (select name from public.games) = 'Sam''s table',
    'the old host should have lost their powers';
end;
$$;

-- Hand it back so the settlement test runs as the original host.
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.transfer_host(
  :'game_id',
  (select id from public.game_players where display_name = 'Hannah')) as handed_back \gset

-- ------------------------------------------------------------- settlement --

set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.settlements (game_id, payments, totals)
select :'game_id',
       jsonb_build_array(jsonb_build_object(
         'fromPlayerId', (select id from public.game_players
                          where display_name = 'Sam' and game_id = :'game_id'),
         'toPlayerId', (select id from public.game_players
                        where display_name = 'Hannah' and game_id = :'game_id'),
         'amountCents', 1000)),
       '[]'::jsonb;
update public.games set status = 'settled', ended_at = now() where id = :'game_id';

do $$
begin
  assert (select status from public.games) = 'settled', 'the game should be closed out';
end;
$$;

set test.uid = '44444444-4444-4444-4444-444444444444';
do $$
begin
  assert (select count(*) from public.settlements) = 0,
    'someone who never sat down must not see the settlement';
  assert (select count(*) from public.games) = 0,
    'nor the game itself';
end;
$$;

-- ------------------------------------------------------------------ friends --

-- You can only befriend someone you've actually played with.
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
begin
  assert public.have_played_together('22222222-2222-2222-2222-222222222222'),
    'Hannah and Sam shared a table';
  assert not public.have_played_together('44444444-4444-4444-4444-444444444444'),
    'nobody has played with the outsider';
end;
$$;

do $$
declare denied boolean := false;
begin
  begin
    perform public.send_friend_request('44444444-4444-4444-4444-444444444444');
  exception when others then denied := true;
  end;
  assert denied, 'befriending a stranger must be refused';
end;
$$;

select public.send_friend_request('22222222-2222-2222-2222-222222222222') as asked \gset

do $$
begin
  assert (select status from public.friendships) = 'pending', 'a request starts pending';
  assert not public.are_friends('22222222-2222-2222-2222-222222222222'),
    'pending is not yet friends';
end;
$$;

set test.uid = '22222222-2222-2222-2222-222222222222';
select public.respond_to_friend_request((select id from public.friendships), true);

do $$
begin
  assert public.are_friends('11111111-1111-1111-1111-111111111111'),
    'accepting makes them friends';
end;
$$;

set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
begin
  assert public.are_friends('22222222-2222-2222-2222-222222222222'),
    'friendship reads the same from either side';
  assert (select count(*) from public.people_i_have_played_with()) >= 1,
    'the people you have played with are listed';
end;
$$;

set test.uid = '44444444-4444-4444-4444-444444444444';
do $$
begin
  assert (select count(*) from public.friendships) = 0,
    'a friendship is private to the pair';
end;
$$;

-- ------------------------------------------------------- inviting a friend --

-- A second table, which Sam is not at.
set test.uid = '11111111-1111-1111-1111-111111111111';
select public.create_game('Second table', '[]'::jsonb, 'Hannah') as second \gset
select id as second_id from public.games where name = 'Second table' \gset

-- A stranger can't be invited.
do $$
declare denied boolean := false;
begin
  begin
    perform public.invite_friend(
      (select id from public.games where name = 'Second table'),
      '44444444-4444-4444-4444-444444444444');
  exception when others then denied := true;
  end;
  assert denied, 'only friends can be invited';
end;
$$;

select public.invite_friend(:'second_id', '22222222-2222-2222-2222-222222222222') as invited \gset

do $$
begin
  assert (select count(*) from public.game_requests where kind = 'invite') = 1,
    'the invitation was recorded';
end;
$$;

-- Hannah can't answer an invitation addressed to Sam.
do $$
declare denied boolean := false;
begin
  begin
    perform public.respond_to_game_request(
      (select id from public.game_requests where kind = 'invite'), true);
  exception when others then denied := true;
  end;
  assert denied, 'an invitation is the invitee''s to answer';
end;
$$;

-- Sam accepts and is seated.
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.respond_to_game_request(
  (select id from public.game_requests where kind = 'invite'), true);

do $$
begin
  assert exists (select 1 from public.game_players gp
                 join public.games g on g.id = gp.game_id
                 where g.name = 'Second table' and gp.user_id = auth.uid()),
    'accepting an invitation seats you';
  assert (select status from public.game_requests where kind = 'invite') = 'accepted',
    'and marks the invitation accepted';
end;
$$;

-- A friend's running table shows up, and asking to join it twice is refused.
do $$
begin
  assert (select count(*) from public.friends_open_games()) >= 1,
    'a friend''s open table is visible';
end;
$$;

do $$
declare denied boolean := false;
begin
  begin
    perform public.request_to_join((select id from public.games where name = 'Second table'));
  exception when others then denied := true;
  end;
  assert denied, 'you cannot ask to join a table you are already at';
end;
$$;

-- ------------------------------------------------------------------- debts --

-- Settling the first table produced a payment plan; that becomes debts.
do $$
begin
  assert (select count(*) from public.debts) = 1,
    'the settlement should have produced one debt';
  assert (select amount_cents from public.debts) = 1000, 'for the amount in the plan';
  assert (select status from public.debts) = 'outstanding', 'starting outstanding';
end;
$$;

-- The person who owes cannot mark it paid themselves.
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$
declare denied boolean := false;
begin
  begin
    perform public.mark_debt_paid((select id from public.debts));
  exception when others then denied := true;
  end;
  assert denied, 'the debtor must not be able to clear their own debt';
end;
$$;

-- The person owed can.
set test.uid = '11111111-1111-1111-1111-111111111111';
select public.mark_debt_paid((select id from public.debts));

do $$
begin
  assert (select status from public.debts) = 'paid', 'the creditor clears it';
  assert (select count(*) from public.my_debts()) = 0, 'and it drops off both screens';
end;
$$;

-- Re-settling must not resurrect a debt somebody already handed cash over for.
update public.settlements
set payments = jsonb_build_array(jsonb_build_object(
      'fromPlayerId', (select id from public.game_players
                       where display_name = 'Sam' and game_id = :'game_id'),
      'toPlayerId', (select id from public.game_players
                     where display_name = 'Hannah' and game_id = :'game_id'),
      'amountCents', 1000))
where game_id = :'game_id';

do $$
begin
  assert (select count(*) from public.debts where status = 'paid') = 1,
    'a paid debt survives a re-settle';
end;
$$;

-- A debt between two guests at your table is real, but it is not yours: it must
-- not be listed as "owed to you" or as "you owe". Two guest seats already exist
-- from the capacity test, so no new ones are needed (the table is full anyway).
-- The row goes in with the role reset, because nobody may write debts directly.
reset role;
insert into public.debts (game_id, from_player_id, to_player_id, amount_cents)
select :'game_id',
       (select id from public.game_players where display_name = 'Guest 1' and game_id = :'game_id'),
       (select id from public.game_players where display_name = 'Guest 2' and game_id = :'game_id'),
       500;
set role authenticated;

set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
begin
  assert not exists (select 1 from public.my_debts() where amount_cents = 500),
    'a debt between two other people is not mine in either direction';
end;
$$;

-- And the app cannot write debts by hand — only settling a game creates them.
do $$
declare denied boolean := false;
begin
  begin
    insert into public.debts (game_id, from_player_id, to_player_id, amount_cents)
    select d.game_id, d.to_player_id, d.from_player_id, 100 from public.debts d limit 1;
  exception when others then denied := true;
  end;
  assert denied, 'debts are written by the settlement trigger, not by hand';
end;
$$;

-- ------------------------------------------------------- global leaderboard --

do $$
declare
  mine record;
begin
  select * into mine from public.global_leaderboard(0)
  where user_id = '11111111-1111-1111-1111-111111111111';

  assert mine.user_id is not null, 'the leaderboard should include a settled player';
  assert mine.is_me, 'and flag which row is yours';
  assert mine.return_pct is not null, 'with a percentage return';
end;
$$;

-- The floor keeps out anyone who has barely staked anything.
do $$
begin
  assert (select count(*) from public.global_leaderboard(1000000)) = 0,
    'a high floor should empty the board';
end;
$$;

-- --------------------------------------------------- backfilling old debts --
--
-- A game settled before 0007 has a payment plan and no debts, because the
-- trigger that builds them did not exist when the settlement was written. 0008
-- rewrites every settlement onto itself to fire the trigger once per game. This
-- reproduces that: switch the trigger off, write a plan the way the old code
-- would have, switch it back on, and check the backfill picks it up.

reset role;

alter table public.settlements disable trigger settlements_to_debts;
delete from public.debts;

update public.settlements
set payments = jsonb_build_array(jsonb_build_object(
      'fromPlayerId', (select id from public.game_players
                       where display_name = 'Sam' and game_id = :'game_id'),
      'toPlayerId', (select id from public.game_players
                     where display_name = 'Hannah' and game_id = :'game_id'),
      'amountCents', 1000))
where game_id = :'game_id';

do $$
begin
  assert (select count(*) from public.debts) = 0,
    'a settlement written without the trigger leaves no debts behind';
end;
$$;

alter table public.settlements enable trigger settlements_to_debts;

-- This is the whole of 0008.
update public.settlements set payments = payments;

do $$
begin
  assert (select count(*) from public.debts) = 1,
    'the backfill should build the debt the old settlement implies';
  assert (select amount_cents from public.debts) = 1000, 'for the amount in the plan';
  assert (select status from public.debts) = 'outstanding', 'and leave it outstanding';
end;
$$;

-- Running it twice must not double anything up, since a nervous operator will.
update public.settlements set payments = payments;

do $$
begin
  assert (select count(*) from public.debts) = 1, 'the backfill is safe to re-run';
end;
$$;

-- And it must not undo a debt somebody has already been paid for.
update public.debts set status = 'paid';
update public.settlements set payments = payments;

do $$
begin
  assert (select count(*) from public.debts) = 1,
    're-running the backfill leaves a paid debt alone';
  assert (select status from public.debts) = 'paid', 'and does not reopen it';
end;
$$;

reset role;
\echo '--- schema smoke test passed ---'
