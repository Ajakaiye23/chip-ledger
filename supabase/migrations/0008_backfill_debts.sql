-- Build debts for games that were settled before 0007 existed.
--
-- 0007 turns a settlement into debt rows with a trigger, and a trigger only ever
-- sees writes made after it was created. Any night that was already settled
-- therefore has a payment plan and no debts, so nothing shows up under "who owes
-- you money" for the games most likely to have money still outstanding.
--
-- Rewriting each settlement onto itself fires that same trigger once per game,
-- so the backfill has no copy of the expansion logic to drift out of step with
-- the real thing. The trigger clears outstanding rows and rebuilds them, and
-- skips any pair already marked paid, which makes this safe to run more than
-- once — and safe to run on a database that never needed it.

do $$
declare
  settled_games integer;
  built integer;
begin
  select count(*) into settled_games from public.settlements;

  update public.settlements set payments = payments;

  select count(*) into built from public.debts;

  raise notice 'backfill: % settled game(s), % debt row(s) now recorded',
    settled_games, built;
end;
$$;
