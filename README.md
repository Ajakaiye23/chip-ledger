# Chip Ledger

Bookkeeping for a home poker game. Everyone signs in with the Google account
already on their phone, one person opens a table, the rest join with a
six-character code, and the app keeps the ledger: what each chip colour is worth,
what everyone bought in for, what they counted up at the end, and — once the
night is over — who pays whom, in the fewest possible payments.

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

**Accounts.** Google sign-in through Supabase Auth. Everyone picks a name as
first name plus last initial — "Ayo A." — which is enough for a room of friends
to tell two Sams apart and no more of anyone's name than that needs. (Apple
sign-in is wired up but switched off; see the setup notes.)

**Your numbers.** Money played through and net result over the last 24 hours,
7 days, 30 days, your last 10 games, and all time. A game counts toward a window
based on when it wrapped up, so one long night doesn't smear across two weeks.

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

**Ranks that mean something.** Three things keep a lucky streak from carrying
anyone up the ladder: nights are scored on *return* (what you made against what
you put in, so a $20 win on a $20 buy-in beats $20 on $200), losing nights take
points off, and every rank needs a minimum number of nights as well as points.
Four brilliant sessions won't make you a Shark — variance over a handful of nights
is enormous, and an honest rating has to wait for the sample. Winning is worth
more than losing costs, so a break-even player still drifts slowly up.

**Friends.** You can befriend anyone you've actually sat at a table with — there
is no search, no directory, no way to reach a stranger, which is the entire
anti-spam design. Friends can be invited straight to a table, and you can ask to
join a friend's table without needing the code.

**Monthly leaderboard.** Everyone you played with this calendar month, ranked by
what they're up. Resets on the 1st.

**Global board.** Everyone who plays, ranked by *percentage return* rather than
dollars — $60 up off $40 of buy-ins is a better night's poker than $60 up off
$600, and ranking on raw money would just sort by who plays the biggest game. You
need $10 staked across settled games to appear, which keeps out anyone who won one
small pot and would otherwise sit on top at +100% forever.

**Settling up.** At the end, the app computes the shortest list of payments that
squares everyone. See [How the settle-up works](#how-the-settle-up-works).

**Who owes you.** Those payments become debts you tick off as the cash actually
arrives, on the settle screen and on your dashboard. Only the person being paid
can tick one — that's what makes it mean anything: "I got the money", not "I say
I paid" — and the moment they do, it clears off the other person's screen too. A
guest has no account to tick with, so the host does theirs, same as their seat.
Reopening a game to fix a miscount rebuilds the plan but never resurrects a debt
somebody already handed cash over for.

**A walkthrough.** A five-step guide opens the first time someone lands on the
site, and stays one tap away behind the `?` in the header afterwards.

**Installable.** Manifest, icons, service worker, iOS meta tags. Android offers a
real install prompt; iOS gets Share → Add to Home Screen instructions.

## Setting up the backend

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free
   tier is plenty for a home game).

2. **Run the migrations.** Open the SQL editor and run every file in
   `supabase/migrations/` **in numbered order** — `0001` first, then `0002`, and
   so on through the last one. Paste one file, run it, then the next; each builds
   on the ones before it, so skipping or reordering will fail. Between them they
   create the tables, the row-level security policies, join-by-code, the eight-seat
   limit, host hand-over, friends and invitations, the debts ledger and the global
   board, and turn on realtime.

3. **Turn on the providers.** Authentication → Providers:
   - **Google**: create an OAuth client in Google Cloud Console, paste the client
     ID and secret in. Add Supabase's callback URL
     (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised
     redirect URI.
   - **Apple** (optional, and the button is currently hidden in the UI): needs a
     paid Apple Developer account ($99/yr). Create
     an App ID, a Services ID (that's the client ID), and a Sign in with Apple
     key. Point the Services ID's return URL at Supabase's callback. Apple gives
     you a private key rather than a secret, so generate the secret locally:

     ```bash
     npm run apple-secret -- --team TEAMID --key-id KEYID \
       --services-id com.you.chipledger.web --p8 ./AuthKey_KEYID.p8
     ```

     Don't use the websites that offer to do this — the .p8 is the credential
     that lets anyone sign people into your app. Apple caps the secret at six
     months, so it needs regenerating twice a year or the button stops working.
     Google alone works fine on iPhones if you'd rather skip all this.

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
can't be built — 5c out of dimes and quarters — it says so and offers the nearest
reachable amounts on *both* sides, rather than quietly dropping the difference.
Looking only downward isn't enough: the nearest amount below 5c on a dime table is
nothing at all, and "take $0.00 instead" is not an offer.

**Amounts that can't exist are refused, not rounded.** Buying in, cashing out and
counting up are all physical movements of chips, so the app won't record one the
chips can't make. This matters most on cash-out, where it's tempting to type a
number and move on: an impossible entry balances nowhere, and the discrepancy
surfaces at the end of the night as an imbalance pinned on whoever happened to be
counted last. Refusing it up front keeps that check meaning what it says — if the
totals don't reconcile, somebody really did miscount.

What the app deliberately does *not* model is which chips a particular player is
holding at a given moment. It knows what everyone bought in for and what they
counted up, not the stack in front of them mid-game. So if you want $7.15 off the
table and you're holding three quarters and a stack of dimes, making the change is
a job for the table, not the app — and swapping chips of equal value never changes
anyone's numbers, so there is nothing to record.

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
npm test          # settlement, ledger, blinds, ranks, names, debts (62 tests)
npm run test:db   # schema, RLS policies and RPCs against a local Postgres
npm run typecheck
npm run test:e2e  # a browser over every screen (needs the app running)
```

`test:db` needs a Postgres you can reach with `psql`. It creates a throwaway
database, stubs out the parts of Supabase the migrations depend on (the `auth`
schema, `auth.uid()`, the `anon`/`authenticated` roles), applies every migration
in order and then plays out a game: a stranger is checked to be unable to read
the table, a player is checked to be able to record their own final count but not
anybody else's, rejoining is checked to reuse the existing seat, a ninth player
is checked to be turned away from a full table, a debtor is checked to be unable
to clear their own debt, and a debt between two other people is checked not to
appear on your dashboard in either direction.

`test:e2e` drives a real Chromium over every screen at four viewport widths and
fails on horizontal overflow, tap targets under 28px, clipped text, buttons that
do nothing, sheets that won't close, and any console or page error.

## Layout

```
src/lib/settle.ts      minimum-payment settlement
src/lib/ledger.ts      started-with / ended-with maths, chips, and change-making
src/lib/blinds.ts      seating order and who posts what
src/lib/rank.ts        points per night and the rank ladder
src/lib/name.ts        "first name, last initial"
src/lib/debts.ts       who is allowed to say a debt has been paid
src/lib/stats.ts       the rolling account windows
src/lib/leaderboard.ts the monthly standings
src/lib/queries.ts     reads (a game; an account's history; debts; the boards)
src/lib/actions.ts     writes (buy-ins, counts, settlement, friends, debts)
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
