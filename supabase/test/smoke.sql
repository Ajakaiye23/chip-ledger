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

-- ------------------------------------------------------------- settlement --

set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.settlements (game_id, payments, totals)
values (:'game_id', '[{"fromPlayerId":"a","toPlayerId":"b","amountCents":1000}]'::jsonb, '[]'::jsonb);
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

reset role;
\echo '--- schema smoke test passed ---'
