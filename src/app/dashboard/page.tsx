import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  loadAccountHistory,
  loadFriendsOpenGames,
  loadKnownPlayers,
  loadMonthGames,
  loadPendingRequests,
} from '@/lib/queries';
import { monthlyLeaderboard, startOfMonth } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!isSupabaseConfigured) redirect('/');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const [{ data: profile }, summaries, monthGames, known, openGames, requests] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    loadAccountHistory(supabase, user.id),
    loadMonthGames(supabase, user.id, startOfMonth()),
    loadKnownPlayers(supabase),
    loadFriendsOpenGames(supabase),
    loadPendingRequests(supabase, user.id),
  ]);

  const displayName =
    (profile?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    'Player';

  return (
    <Dashboard
      userId={user.id}
      needsName={!profile?.last_initial}
      displayName={displayName}
      avatarUrl={(profile?.avatar_url as string | null) ?? null}
      summaries={summaries}
      leaderboard={monthlyLeaderboard(monthGames, user.id)}
      known={known}
      openGames={openGames}
      requests={requests}
    />
  );
}
