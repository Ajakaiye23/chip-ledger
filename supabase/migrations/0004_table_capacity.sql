-- A table seats eight.
--
-- Enforced in the database rather than the UI, because the join code is a link
-- and two people can tap it at the same moment. Seats freed by someone leaving
-- can be taken by somebody new.

create or replace function public.seats_taken(p_game_id uuid)
returns int
language sql
stable security definer set search_path = public
as $$
  select count(*)::int from public.game_players
  where game_id = p_game_id and status <> 'left';
$$;

create or replace function public.enforce_table_capacity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only guard arrivals: someone coming back off 'left', or a brand new seat.
  if tg_op = 'UPDATE' and (new.status = 'left' or old.status <> 'left') then
    return new;
  end if;

  if public.seats_taken(new.game_id) >= 8 then
    raise exception 'this table is full (eight seats)';
  end if;

  return new;
end;
$$;

drop trigger if exists game_players_capacity on public.game_players;
create trigger game_players_capacity
  before insert or update on public.game_players
  for each row execute function public.enforce_table_capacity();

-- join_game checks first so it can say something useful rather than trip the trigger.
create or replace function public.join_game(p_code text, p_display_name text)
returns public.games
language plpgsql
security definer set search_path = public
as $$
declare
  target public.games;
  existing public.game_players;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select * into target from public.games where code = upper(trim(p_code));
  if target.id is null then
    raise exception 'no game with that code';
  end if;
  if target.status <> 'active' then
    raise exception 'that game is already settled';
  end if;

  select * into existing from public.game_players
  where game_id = target.id and user_id = auth.uid();

  if existing.id is not null then
    if existing.status = 'left' and public.seats_taken(target.id) >= 8 then
      raise exception 'that table is full — somebody took your seat';
    end if;
    update public.game_players
      set status = 'active',
          left_at = null,
          display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
    where id = existing.id;
  else
    if public.seats_taken(target.id) >= 8 then
      raise exception 'that table is full (eight seats)';
    end if;
    insert into public.game_players (game_id, user_id, display_name)
    values (target.id, auth.uid(),
            coalesce(nullif(trim(p_display_name), ''), 'Player'));
  end if;

  return target;
end;
$$;

grant execute on function public.seats_taken(uuid) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
