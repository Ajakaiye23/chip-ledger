-- Handing over the table.
--
-- The host is the only one who can set chip values, the blinds and the
-- settlement, so a host who goes home without passing it on leaves a table
-- nobody can close out. This lets them nominate a successor.

create or replace function public.transfer_host(p_game_id uuid, p_new_host_player_id uuid)
returns public.games
language plpgsql
security definer set search_path = public
as $$
declare
  target public.games;
  seat public.game_players;
begin
  if not public.is_game_host(p_game_id) then
    raise exception 'only the host can hand over the table';
  end if;

  select * into seat from public.game_players
  where id = p_new_host_player_id and game_id = p_game_id;

  if seat.id is null then
    raise exception 'that player is not at this table';
  end if;
  if seat.user_id is null then
    raise exception 'a guest has no account to host with';
  end if;
  if seat.status = 'left' then
    raise exception 'that player has left the table';
  end if;
  if seat.user_id = auth.uid() then
    raise exception 'you are already the host';
  end if;

  update public.games set host_id = seat.user_id
  where id = p_game_id
  returning * into target;

  return target;
end;
$$;

grant execute on function public.transfer_host(uuid, uuid) to authenticated;
