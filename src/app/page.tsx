import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GuideLink } from '@/components/guide-link';
import { SignIn } from '@/components/sign-in';
import { SetupNotice } from '@/components/setup-notice';
import { InstallHint } from '@/components/install-prompt';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next ?? '/dashboard');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-5 py-10 lg:flex-row lg:items-center lg:gap-16 lg:py-20">
      <section className="flex-1 space-y-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
          <span className="display text-xl font-semibold tracking-tight">Chip Ledger</span>
        </div>

        <p className="suits text-sm" aria-hidden />

        <h1 className="display text-4xl leading-[1.1] font-semibold sm:text-6xl">
          The home game,
          <br />
          <span className="text-brass-400">counted properly.</span>
        </h1>

        <p className="max-w-md text-ink-300">
          Open a table, everyone joins with a six-character code, and the ledger keeps
          itself: buy-ins, what each chip colour is worth this round, who won what, and
          who owes whom at the end — in the fewest payments possible.
        </p>

        <ul className="max-w-md space-y-2.5 text-sm text-ink-300">
          {[
            'Set what each chip colour is worth once, when you open the table.',
            'Buy in for as many chips as you like, rebuy any time.',
            'Leave and rejoin, or join at round nine — nothing is lost.',
            'Blinds, the dealer button, and a flash when a round is on you.',
            'Per-round profit, a monthly leaderboard, and lifetime stats.',
            'Settle up with the smallest possible number of payments.',
          ].map((line, i) => (
            <li key={line} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-0.5 shrink-0 ${i % 2 === 0 ? 'text-brass-400' : 'text-rouge-400'}`}
              >
                {i % 2 === 0 ? '♠' : '♦'}
              </span>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full lg:max-w-sm">
        <div className="card relative space-y-5 overflow-hidden p-6">
          <span className="card-back absolute inset-x-0 top-0 h-1" aria-hidden />
          <div>
            <h2 className="display text-xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-ink-500">
              Use the account you already have on your phone.
            </p>
          </div>

          {isSupabaseConfigured ? <SignIn next={next ?? '/dashboard'} /> : <SetupNotice />}

          {error ? (
            <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>
          ) : null}

          <div className="space-y-2">
            <GuideLink />
            <Link
              href="/preview"
              className="flex min-h-11 items-center justify-center text-sm text-ink-500 underline underline-offset-4 hover:text-ink-300"
            >
              Have a look around first
            </Link>
          </div>
        </div>
        <InstallHint />
      </section>
    </main>
  );
}
