-- Friends, invitations, and asking to join.
--
-- You can only befriend someone you've actually sat at a table with. That's the
-- whole anti-spam design: there is no user search, no directory, no way to find
-- a stranger. If you haven't played together, you can't reach each other at all.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One friendship per pair, whichever way round it was asked.
create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee on public.friendships (addressee_id, status);

-- An invitation to a table, or a request to be let into one.
create table if not exists public.game_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games on delete cascade,
  -- The person who would end up seated either way.
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('invite', 'request')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists game_requests_open
  on public.game_requests (game_id, user_id) where status = 'pending';

create index if not exists game_requests_user on public.game_requests (user_id, status);

-- ------------------------------------------------------------------ helpers --

/** Have these two ever sat at the same table? The gate on befriending anyone. */
create or replace function public.have_played_together(p_other uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.game_players mine
    join public.game_players theirs on theirs.game_id = mine.game_id
    where mine.user_id = auth.uid() and theirs.user_id = p_other
  );
$$;

create or replace function public.are_friends(p_other uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_other)
        or (f.addressee_id = auth.uid() and f.requester_id = p_other))
  );
$$;

-- ------------------------------------------------------------------ friends --

create or replace function public.send_friend_request(p_user_id uuid)
returns public.friendships
language plpgsql
security definer set search_path = public
as $$
declare
  row public.friendships;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_user_id = auth.uid() then raise exception 'you are already your own friend'; end if;
  if not public.have_played_together(p_user_id) then
    raise exception 'you can only add people you have played with';
  end if;

  -- If they already asked you, treat this as accepting.
  update public.friendships
    set status = 'accepted', responded_at = now()
  where requester_id = p_user_id and addressee_id = auth.uid() and status = 'pending'
  returning * into row;
  if row.id is not null then return row; end if;

  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing
  returning * into row;

  if row.id is null then
    select * into row from public.friendships
    where least(requester_id, addressee_id) = least(auth.uid(), p_user_id)
      and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_user_id);
  end if;

  return row;
end;
$$;

create or replace function public.respond_to_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  row public.friendships;
begin
  select * into row from public.friendships where id = p_id;
  if row.id is null then raise exception 'no such request'; end if;
  if row.addressee_id <> auth.uid() then
    raise exception 'that request was not sent to you';
  end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_id;
  else
    delete from public.friendships where id = p_id;
  end if;
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_user_id)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_user_id);
end;
$$;

/** Everyone you've played with, and where you stand with them. */
create or replace function public.people_i_have_played_with()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  nights_together bigint,
  friendship_status text,
  friendship_id uuid,
  they_asked boolean
)
language sql
stable security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    count(distinct theirs.game_id) as nights_together,
    coalesce(f.status, 'none') as friendship_status,
    f.id,
    coalesce(f.requester_id = p.id, false) as they_asked
  from public.game_players mine
  join public.game_players theirs on theirs.game_id = mine.game_id
  join public.profiles p on p.id = theirs.user_id
  left join public.friendships f
    on least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
   and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id)
  where mine.user_id = auth.uid()
    and theirs.user_id is not null
    and theirs.user_id <> auth.uid()
  group by p.id, p.display_name, p.avatar_url, f.status, f.id, f.requester_id
  order by count(distinct theirs.game_id) desc, p.display_name;
$$;

-- --------------------------------------------------------- tables and invites --

/** Your friends' tables that are still running, so you can ask to join one. */
create or replace function public.friends_open_games()
returns table (
  game_id uuid,
  name text,
  host_name text,
  seats_taken int,
  already_in boolean,
  pending_request boolean
)
language sql
stable security definer set search_path = public
as $$
  select distinct
    g.id,
    g.name,
    host.display_name,
    public.seats_taken(g.id),
    exists (select 1 from public.game_players gp
            where gp.game_id = g.id and gp.user_id = auth.uid() and gp.status <> 'left'),
    exists (select 1 from public.game_requests r
            where r.game_id = g.id and r.user_id = auth.uid() and r.status = 'pending')
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.status <> 'left'
  join public.profiles host on host.id = g.host_id
  where g.status = 'active'
    and public.are_friends(gp.user_id)
  order by g.name;
$$;

/** Invite a friend to a table you're sitting at. */
create or replace function public.invite_friend(p_game_id uuid, p_user_id uuid)
returns public.game_requests
language plpgsql
security definer set search_path = public
as $$
declare
  row public.game_requests;
begin
  if not public.is_game_member(p_game_id) then
    raise exception 'you are not at that table';
  end if;
  if not public.are_friends(p_user_id) then
    raise exception 'you can only invite friends';
  end if;
  if exists (select 1 from public.game_players
             where game_id = p_game_id and user_id = p_user_id and status <> 'left') then
    raise exception 'they are already at the table';
  end if;
  if public.seats_taken(p_game_id) >= 8 then
    raise exception 'that table is full (eight seats)';
  end if;

  insert into public.game_requests (game_id, user_id, kind, created_by)
  values (p_game_id, p_user_id, 'invite', auth.uid())
  on conflict do nothing
  returning * into row;

  return row;
end;
$$;

/** Ask a friend if you can join their table. */
create or replace function public.request_to_join(p_game_id uuid)
returns public.game_requests
language plpgsql
security definer set search_path = public
as $$
declare
  row public.game_requests;
  known boolean;
begin
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.status <> 'left' and public.are_friends(gp.user_id)
  ) into known;

  if not known then
    raise exception 'you have no friends at that table';
  end if;
  if exists (select 1 from public.game_players
             where game_id = p_game_id and user_id = auth.uid() and status <> 'left') then
    raise exception 'you are already at that table';
  end if;

  insert into public.game_requests (game_id, user_id, kind, created_by)
  values (p_game_id, auth.uid(), 'request', auth.uid())
  on conflict do nothing
  returning * into row;

  return row;
end;
$$;

/**
 * Accept or turn down an invitation (if it's yours) or a request to join (if
 * you're the host). Accepting seats them, which is where the eight-seat limit
 * gets its say.
 */
create or replace function public.respond_to_game_request(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  row public.game_requests;
  allowed boolean;
  name text;
begin
  select * into row from public.game_requests where id = p_id;
  if row.id is null then raise exception 'no such request'; end if;
  if row.status <> 'pending' then raise exception 'that has already been answered'; end if;

  allowed := case
    when row.kind = 'invite' then row.user_id = auth.uid()
    else public.is_game_host(row.game_id)
  end;
  if not allowed then raise exception 'that is not yours to answer'; end if;

  if not p_accept then
    update public.game_requests set status = 'declined', responded_at = now() where id = p_id;
    return;
  end if;

  if public.seats_taken(row.game_id) >= 8 then
    raise exception 'that table is full (eight seats)';
  end if;

  select display_name into name from public.profiles where id = row.user_id;

  -- Someone who sat here before keeps their seat and their history.
  if exists (select 1 from public.game_players
             where game_id = row.game_id and user_id = row.user_id) then
    update public.game_players set status = 'active', left_at = null
    where game_id = row.game_id and user_id = row.user_id;
  else
    insert into public.game_players (game_id, user_id, display_name)
    values (row.game_id, row.user_id, coalesce(name, 'Player'));
  end if;

  update public.game_requests set status = 'accepted', responded_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------- RLS --

alter table public.friendships enable row level security;
alter table public.game_requests enable row level security;

drop policy if exists "see my friendships" on public.friendships;
create policy "see my friendships" on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "see my game requests" on public.game_requests;
create policy "see my game requests" on public.game_requests
  for select using (
    user_id = auth.uid() or created_by = auth.uid() or public.is_game_host(game_id)
  );

-- Everything is written through the functions above, which do the checking.
revoke insert, update, delete on public.friendships from authenticated;
revoke insert, update, delete on public.game_requests from authenticated;
grant select on public.friendships to authenticated;
grant select on public.game_requests to authenticated;

grant execute on function public.have_played_together(uuid) to authenticated;
grant execute on function public.are_friends(uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.people_i_have_played_with() to authenticated;
grant execute on function public.friends_open_games() to authenticated;
grant execute on function public.invite_friend(uuid, uuid) to authenticated;
grant execute on function public.request_to_join(uuid) to authenticated;
grant execute on function public.respond_to_game_request(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_requests;
  end if;
exception when duplicate_object then
  null;
end;
$$;
