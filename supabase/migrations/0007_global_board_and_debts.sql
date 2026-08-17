-- A global leaderboard, and a record of who still owes whom.

-- ------------------------------------------------------------------- debts --
--
-- Settling a game produces a payment plan. Those payments are what people
-- actually owe each other, so they get their own rows: one per payment, cleared
-- by the person who is owed. The debtor cannot mark their own debt paid — the
-- whole point is that clearing it is the creditor saying "I got it".

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games on delete cascade,
  from_player_id uuid not null references public.game_players on delete cascade,
  to_player_id uuid not null references public.game_players on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'outstanding' check (status in ('outstanding', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  marked_by uuid references public.profiles(id) on delete set null
);

create index if not exists debts_game on public.debts (game_id);
create index if not exists debts_to on public.debts (to_player_id, status);
create index if not exists debts_from on public.debts (from_player_id, status);

/**
 * Turn a settlement's payment plan into debt rows.
 *
 * Runs whenever a settlement is written, including a re-settle after the host
 * reopens and fixes a count. Anything already marked paid is left alone: someone
 * having handed over cash is a fact about the world, not something a recount
 * should quietly undo.
 */
create or replace function public.expand_settlement_to_debts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.debts
  where game_id = new.game_id and status = 'outstanding';

  -- Both ends are joined back to real seats at this table, so a malformed or
  -- stale plan produces no debts rather than failing the settlement outright.
  insert into public.debts (game_id, from_player_id, to_player_id, amount_cents)
  select new.game_id, payer.id, owed.id, parsed.amount
  from (
    select
      case when p->>'fromPlayerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (p->>'fromPlayerId')::uuid end as from_id,
      case when p->>'toPlayerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (p->>'toPlayerId')::uuid end as to_id,
      case when p->>'amountCents' ~ '^[0-9]+$' then (p->>'amountCents')::bigint else 0 end as amount
    from jsonb_array_elements(new.payments) p
  ) parsed
  join public.game_players payer on payer.id = parsed.from_id and payer.game_id = new.game_id
  join public.game_players owed on owed.id = parsed.to_id and owed.game_id = new.game_id
  where parsed.amount > 0
    -- Don't recreate one that's already been settled up in cash.
    and not exists (
      select 1 from public.debts d
      where d.game_id = new.game_id
        and d.from_player_id = parsed.from_id
        and d.to_player_id = parsed.to_id
        and d.status = 'paid'
    );

  return new;
end;
$$;

drop trigger if exists settlements_to_debts on public.settlements;
create trigger settlements_to_debts
  after insert or update on public.settlements
  for each row execute function public.expand_settlement_to_debts();

/** The person owed marks it paid. Nobody else can. */
create or replace function public.mark_debt_paid(p_debt_id uuid, p_paid boolean default true)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  owed_to uuid;
begin
  select gp.user_id into owed_to
  from public.debts d
  join public.game_players gp on gp.id = d.to_player_id
  where d.id = p_debt_id;

  if owed_to is null then
    -- A guest is owed: the host keeps their books, so the host clears it.
    if not exists (
      select 1 from public.debts d where d.id = p_debt_id and public.is_game_host(d.game_id)
    ) then
      raise exception 'only the person owed can clear this';
    end if;
  elsif owed_to <> auth.uid() then
    raise exception 'only the person owed can clear this';
  end if;

  update public.debts
  set status = case when p_paid then 'paid' else 'outstanding' end,
      paid_at = case when p_paid then now() else null end,
      marked_by = case when p_paid then auth.uid() else null end
  where id = p_debt_id;
end;
$$;

/**
 * Everything outstanding in both directions, for the dashboard.
 *
 * Strictly debts you are a party to. A debt between two guests at a table you
 * host is real, but it isn't yours — it belongs on that game's settle screen,
 * and listing it here would have to call it either "owed to you" or "you owe",
 * both of which are lies.
 */
create or replace function public.my_debts()
returns table (
  id uuid,
  game_id uuid,
  game_name text,
  amount_cents bigint,
  direction text,
  other_name text,
  status text,
  settled_at timestamptz
)
language sql
stable security definer set search_path = public
as $$
  select
    d.id,
    d.game_id,
    g.name,
    d.amount_cents,
    case when owed.user_id = auth.uid() then 'owed_to_me' else 'i_owe' end,
    case when owed.user_id = auth.uid() then payer.display_name else owed.display_name end,
    d.status,
    g.ended_at
  from public.debts d
  join public.games g on g.id = d.game_id
  join public.game_players payer on payer.id = d.from_player_id
  join public.game_players owed on owed.id = d.to_player_id
  where d.status = 'outstanding'
    and (owed.user_id = auth.uid() or payer.user_id = auth.uid())
  order by g.ended_at desc nulls last, d.amount_cents desc;
$$;

alter table public.debts enable row level security;

drop policy if exists "see debts i am part of" on public.debts;
create policy "see debts i am part of" on public.debts
  for select using (
    public.is_game_member(game_id)
  );

revoke insert, update, delete on public.debts from authenticated;
grant select on public.debts to authenticated;
grant execute on function public.mark_debt_paid(uuid, boolean) to authenticated;
grant execute on function public.my_debts() to authenticated;

-- ------------------------------------------------------- global leaderboard --
--
-- Ranked by percentage return, not by dollars, so the biggest game doesn't win
-- by default. A floor of $10 staked keeps out someone who won a single dime
-- pot and would otherwise sit on top at +100% forever.

create or replace function public.global_leaderboard(p_min_staked_cents bigint default 1000)
returns table (
  user_id uuid,
  display_name text,
  staked_cents bigint,
  net_cents bigint,
  return_pct numeric,
  nights bigint,
  is_me boolean
)
language sql
stable security definer set search_path = public
as $$
  with per_night as (
    select
      gp.user_id,
      gp.game_id,
      coalesce(sum(e.amount_cents) filter (where e.kind in ('buy_in', 'adjustment')), 0) as staked,
      coalesce(sum(e.amount_cents) filter (where e.kind = 'cash_out'), 0) as cashed,
      max(gp.final_stack_cents) as ended
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    left join public.ledger_entries e on e.player_id = gp.id
    where gp.user_id is not null
      and gp.final_stack_cents is not null
      and g.status = 'settled'
    group by gp.user_id, gp.game_id
  ),
  totals as (
    select
      user_id,
      sum(staked) as staked,
      sum(ended + cashed - staked) as net,
      count(*) as nights
    from per_night
    where staked > 0
    group by user_id
  )
  select
    t.user_id,
    p.display_name,
    t.staked,
    t.net,
    round((t.net::numeric / t.staked) * 100, 1),
    t.nights,
    t.user_id = auth.uid()
  from totals t
  join public.profiles p on p.id = t.user_id
  where t.staked >= p_min_staked_cents
  order by (t.net::numeric / t.staked) desc, t.staked desc;
$$;

grant execute on function public.global_leaderboard(bigint) to authenticated;

-- Marking a debt paid has to clear off the other person's screen while they're
-- still looking at it, so debts ride the same realtime channel as the game.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.debts;
  end if;
exception when duplicate_object then
  null;
end;
$$;
