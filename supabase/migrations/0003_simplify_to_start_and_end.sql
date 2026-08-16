-- The ledger stops following money round by round.
--
-- A night is now two numbers per player: what they started with (buy-ins) and
-- what they ended with (their final count). Everything else — the settlement, the
-- leaderboard, the stats — is derived from those, so nobody has to stop and score
-- a round mid-game.
--
-- The dealer button survives, because knowing whose deal it is has nothing to do
-- with the money. It moves to the game itself as a simple hand counter.

alter table public.games
  add column if not exists dealer_player_id uuid
    references public.game_players on delete set null,
  add column if not exists hand_number int not null default 0;

-- Where a player finished. Null until someone counts them up.
alter table public.game_players
  add column if not exists final_chips jsonb,
  add column if not exists final_stack_cents bigint;

-- Names are "first name, last initial", stored in parts so they can be re-formatted.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_initial text;

-- Carry the dealer across from whatever the last round knew, then drop rounds.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'rounds') then
    update public.games g
    set dealer_player_id = r.dealer_player_id,
        hand_number = r.number
    from (
      select distinct on (game_id) game_id, dealer_player_id, number
      from public.rounds order by game_id, number desc
    ) r
    where r.game_id = g.id and r.dealer_player_id is not null;
  end if;
end;
$$;

alter table public.ledger_entries drop column if exists round_id;
drop table if exists public.round_stacks;
drop table if exists public.rounds;

-- Advance the button one seat. Money is not involved, so any player may do it.
create or replace function public.next_hand(p_game_id uuid)
returns public.games
language plpgsql
security definer set search_path = public
as $$
declare
  target public.games;
  seats uuid[];
  current_index int;
begin
  if not public.is_game_member(p_game_id) then
    raise exception 'not at this table';
  end if;

  select array_agg(id order by joined_at, id) into seats
  from public.game_players
  where game_id = p_game_id and status <> 'left';

  if seats is null or array_length(seats, 1) = 0 then
    raise exception 'nobody is seated';
  end if;

  select * into target from public.games where id = p_game_id;

  current_index := array_position(seats, target.dealer_player_id);

  update public.games
  set dealer_player_id = case
        when current_index is null then seats[1]
        else seats[(current_index % array_length(seats, 1)) + 1]
      end,
      hand_number = hand_number + 1
  where id = p_game_id
  returning * into target;

  return target;
end;
$$;

grant execute on function public.next_hand(uuid) to authenticated;

-- Recording a final count is the one write that decides the money, so it is
-- limited to the host or the player themselves.
create or replace function public.set_final_count(
  p_player_id uuid,
  p_stack_cents bigint,
  p_chips jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  seat public.game_players;
begin
  select * into seat from public.game_players where id = p_player_id;
  if seat.id is null then
    raise exception 'no such player';
  end if;
  if not (public.is_game_host(seat.game_id) or seat.user_id = auth.uid()) then
    raise exception 'only the host or that player can record their count';
  end if;
  if p_stack_cents < 0 then
    raise exception 'a final count cannot be negative';
  end if;

  update public.game_players
  set final_stack_cents = p_stack_cents,
      final_chips = p_chips
  where id = p_player_id;
end;
$$;

grant execute on function public.set_final_count(uuid, bigint, jsonb) to authenticated;
