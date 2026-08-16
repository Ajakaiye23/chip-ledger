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
  ('33333333-3333-3333-3333-333333333333', 'nosy@example.com', '{"full_name":"Nosy Neighbour"}');

do $$
begin
  assert (select count(*) from public.profiles) = 3,
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

set test.uid = '33333333-3333-3333-3333-333333333333';
do $$
begin
  assert (select count(*) from public.settlements) = 0,
    'a stranger must not see the settlement either';
end;
$$;

reset role;
\echo '--- schema smoke test passed ---'
