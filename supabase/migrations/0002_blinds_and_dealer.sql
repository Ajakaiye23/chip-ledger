-- Blinds and the dealer button, and chip values that are set when the table opens.
--
-- Chip values still live on each round as a snapshot: that is what keeps a closed
-- round's numbers correct forever. What changes here is who sets them and when —
-- they're chosen at table creation and carried into every round, rather than being
-- something you fiddle with mid-game.

alter table public.games
  add column if not exists small_blind_cents bigint not null default 10,
  add column if not exists big_blind_cents bigint not null default 25;

alter table public.rounds
  add column if not exists dealer_player_id uuid
    references public.game_players on delete set null;

-- The old three-argument version has to go, or calls with three arguments become
-- ambiguous against the new one's defaults.
drop function if exists public.create_game(text, jsonb, text);

create or replace function public.create_game(
  p_name text,
  p_chip_values jsonb,
  p_display_name text,
  p_small_blind_cents bigint default 10,
  p_big_blind_cents bigint default 25
)
returns public.games
language plpgsql
security definer set search_path = public
as $$
declare
  new_game public.games;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if p_small_blind_cents < 0 or p_big_blind_cents < p_small_blind_cents then
    raise exception 'the big blind has to be at least the small blind';
  end if;

  insert into public.games (code, name, host_id, default_chip_values,
                            small_blind_cents, big_blind_cents)
  values (public.generate_game_code(), coalesce(nullif(trim(p_name), ''), 'Home game'),
          auth.uid(), coalesce(p_chip_values, '[]'::jsonb),
          p_small_blind_cents, p_big_blind_cents)
  returning * into new_game;

  insert into public.game_players (game_id, user_id, display_name)
  values (new_game.id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Host'));

  return new_game;
end;
$$;

grant execute on function public.create_game(text, jsonb, text, bigint, bigint) to authenticated;
