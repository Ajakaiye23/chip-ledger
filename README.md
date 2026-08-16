# Chip Ledger

Bookkeeping for a home poker game. Everyone signs in with the Google or Apple
account already on their phone, one person opens a table, the rest join with a
six-character code, and the app keeps the ledger: buy-ins, what each chip colour
is worth in each round, what every player won or lost round by round, and — at
the end — who pays whom, in the fewest possible payments.

It installs to a phone home screen as a standalone app, and works the same on a
laptop.

## Look before you build

```bash
npm install
npm run dev
```

Then open http://localhost:3000/preview — a made-up Friday night you can click
through with no accounts and no backend. Nothing there is saved.

## What it does

**Accounts.** Google and Apple sign-in through Supabase Auth. Everyone picks a
name as first name plus last initial — "Ayo A." — which is enough for a room of
friends to tell two Sams apart and no more of anyone's name than that needs.

**Your numbers.** Money played through and net result over the last 24 hours,
7 days, 30 days, your last 10 games, and all time — plus a round-by-round feed.
A game counts toward a window based on when it wrapped up, so one long night
doesn't smear across two weeks.

**Handing over.** The host can pass the table to any seated player with an
account, from that player's seat — and leaving as host asks who takes over first,
since the host is the only one who can settle the night. Guests can't be handed
the table: there's no account behind them.

**Tables.** A shared room with a join code, seating up to eight. Anyone with the
code takes a seat; the host can also add people who don't have the app at all,
and keeps the books for them. The eight-seat limit is enforced in the database,
not the UI, because a join code is a link and two people can tap it at once.

**Only the chips you're using.** The host switches colours on and off — most home
games run three of the five — and sets what each is worth, once, when the table
opens; those values are used for every count that night. Nobody else can change
them: the row-level security policy on `games` only lets the host write, so a
player's attempt updates nothing rather than erroring. A colour switched off isn't
deleted; turning it back on remembers what it was worth.

**Blinds and the button.** Set the small and big blind when you open the table.
"Next hand" moves the button one seat, the app says who posts what, and it gets
heads-up right — with two players the dealer posts the small blind. When a hand is
on you, your phone flashes it at you. This is the only thing tracked hand by hand,
because it costs nothing and settles the argument that comes up every orbit.

**Buy in for whatever you like.** Type a dollar amount and see the chips it buys,
or count out the chips and see what they're worth. Rebuy as often as you want.
Cashing out takes money off the table without it counting as a loss.

**Two numbers a night.** What each player started with and what they ended with.
Nothing is scored hand by hand — you count chips once, at the end, by colour, and
the app does the arithmetic. Rebuys just add to what they started with.

**Leave and come back.** Sitting out, walking away, or joining at round nine are
all just rows in an append-only history. Rejoining reuses your seat rather than
making a new one, so nothing is ever orphaned.

**The night.** One screen: what everyone started with, what they ended with, the
difference, and the log of money going on and off the table.

**Ranks.** Points for nights you finish up — one for a win, two for up $10, three
for up $20 — carrying you from Rail bird to Legend in about a season of home
games. Losing nights cost nothing; this is a record of what you've done, not a
rating that punishes a bad beat.

**Monthly leaderboard.** Everyone you played with this calendar month, ranked by
what they're up. Resets on the 1st.

**Settling up.** At the end, the app computes the shortest list of payments that
squares everyone. See [How the settle-up works](#how-the-settle-up-works).

**A walkthrough.** A five-step guide opens the first time someone lands on the
site, and stays one tap away behind the `?` in the header afterwards.

**Installable.** Manifest, icons, service worker, iOS meta tags. Android offers a
real install prompt; iOS gets Share → Add to Home Screen instructions.

## Setting up the backend

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free
   tier is plenty for a home game).

2. **Run the migration.** Open the SQL editor and paste in
   `supabase/migrations/0001_init.sql`. That creates the tables, the row-level
   security policies, the join-by-code function, and turns on realtime.

3. **Turn on the providers.** Authentication → Providers:
   - **Google**: create an OAuth client in Google Cloud Console, paste the client
     ID and secret in. Add Supabase's callback URL
     (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised
     redirect URI.
   - **Apple**: needs a paid Apple Developer account ($99/yr) to create a
     Services ID and key. If you don't have one, Google alone works fine — the
     Apple button will just error until it's configured.

4. **Add redirect URLs.** Authentication → URL Configuration → Redirect URLs:
   add `http://localhost:3000/auth/callback` and your deployed
   `https://your-domain/auth/callback`.

5. **Point the app at it.**

   ```bash
   cp .env.example .env.local   # then fill in the URL and anon key
   npm run dev
   ```

The anon key is meant to be public — every table has row-level security on it,
so the database itself enforces that you only ever see games you're sitting at.

## Deploying

Any host that runs Next.js works. Vercel is the least effort:

```bash
npx vercel
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project's
environment variables, then add the deployed callback URL to Supabase (step 4).

Installing to a home screen requires HTTPS, which you get automatically on
Vercel/Netlify and on `localhost` for testing.

## How the settle-up works

Say four people finish a night at +$15, −$15, +$5, −$5. The obvious approach —
biggest loser pays biggest winner, repeat — always finishes in at most n−1
payments, and often takes exactly that many. But here the table splits into two
pairs that cancel out, so two payments do the whole job instead of three.

That generalises: every group of players whose balances already sum to zero can
settle among themselves, and each extra independent group saves one payment. So
the real problem is *split the table into as many zero-sum groups as possible*,
which is a subset-sum partition — NP-hard in general, trivial at eight players.
`src/lib/settle.ts` solves it exactly with a bitmask DP up to 15 players and
falls back to greedy above that (still correct, occasionally a payment longer).

If someone's chip count was typed wrong and the totals don't reconcile, the app
says so, and settling anyway puts the difference on the largest position rather
than producing a plan nobody can actually pay.

## Making change is not greedy

Breaking an amount into chips by taking the biggest denomination first is the
obvious approach, and it is wrong for the sets people actually use. Give it dimes,
quarters, halves and 75c chips and ask for 30c: it takes a quarter, then can't
place the last nickel — even though three dimes is sitting right there. Sets where
greedy works are the exception, not the rule.

So `makeChange` in `src/lib/ledger.ts` runs a real shortest-path DP over amounts
and returns the fewest chips that make the number exactly. When an amount genuinely
can't be built — 5c out of dimes and quarters — it says so and offers the closest
reachable amount, rather than quietly dropping the difference.

Note that a stack's *value* is finer-grained than any single chip: a quarter minus
two dimes is 5c, so a dime-and-quarter table can still land on nickels. That's why
the app tells you the smallest amount your chip set can express when you set the
blinds.

## How the maths works

A night reduces to one line per player:

```
net = ended with + cashed out - started with
```

`started with` is the sum of their buy-ins, `ended with` is the single final count,
and `cashed out` covers money taken off the table mid-game (which is not a loss).
Buy-ins are append-only rows, so a rebuy at midnight is just another row; the final
count lives on the player's seat because there is exactly one of them. See
`src/lib/ledger.ts` and its tests.

Nobody's number exists until they are counted, so an uncounted player sits at zero
rather than being guessed at, and the app won't let a game be settled until
everyone has been counted up.

## Tests

```bash
npm test          # settlement, ledger, blinds, ranks and names (49 tests)
npm run test:db   # schema, RLS policies and RPCs against a local Postgres
npm run typecheck
```

`test:db` needs a Postgres you can reach with `psql`. It creates a throwaway
database, stubs out the parts of Supabase the migration depends on (the `auth`
schema, `auth.uid()`, the `anon`/`authenticated` roles), applies the migration
and then plays out a game: a stranger is checked to be unable to read the table,
a player is checked to be able to record their own final count but not anybody
else's, rejoining is checked to reuse the existing seat, and a ninth player is
checked to be turned away from a full table.

## Layout

```
src/lib/settle.ts      minimum-payment settlement
src/lib/ledger.ts      started-with / ended-with maths, chips, and change-making
src/lib/blinds.ts      seating order and who posts what
src/lib/rank.ts        points per night and the rank ladder
src/lib/name.ts        "first name, last initial"
src/lib/stats.ts       the rolling account windows
src/lib/leaderboard.ts the monthly standings
src/lib/queries.ts     reads (a game; an account's whole history)
src/lib/actions.ts     writes (buy-ins, rounds, stacks, settlement)
src/hooks/use-game.ts  live sync for everyone at the table
src/components/        the UI
supabase/migrations/   schema, RLS, join-by-code
scripts/make-icons.mjs draws the PWA icons (no image dependencies)
```

## Notes and limits

- **Trust model.** This is a home game, so any player can record a buy-in or move
  the button. Chip values, the blinds, the table name and the settlement are the
  host's alone, and the host can hand that role to any seated player with an
  account. A final count can be recorded by the host or by that player for
  themselves, and nobody else. All of it is enforced by row-level security, not by
  the UI hiding buttons.
- **Offline.** The service worker keeps the app shell, not the ledger. Money data
  is always fetched fresh — a stale balance is worse than a spinner.
- **Currency.** Everything is integer cents with a `$` in front. There's no
  multi-currency support.
- **It doesn't run the game.** No cards, no pots, no betting. It knows the seating
  order, the blind structure, and what everyone started and ended with. Everything
  in between is your game.
- **Performance.** The look is built from things that cost nothing to run: system
  fonts (no download), CSS gradients rasterised once, and static shadows. No web
  fonts, no images beyond the icons, no filters or blurs on scrolling surfaces,
  and exactly one animation in the whole app — a compositor-only opacity pulse on
  the blind banner. The sticky header is opaque rather than translucent, because a
  blurred bar repaints on every scroll frame on a phone.
