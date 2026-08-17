import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './lib/supabase/config';

const PROTECTED = ['/dashboard', '/game'];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes an expiring token and writes the new cookies onto the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = '/';
    signIn.searchParams.set('next', path);
    return NextResponse.redirect(signIn);
  }

  return response;
}

/**
 * Every path this matches costs a call to Supabase's auth API, so paths with
 * nothing to do with accounts are kept out of it. /preview runs entirely on
 * made-up data and /offline is a static card — neither reads a session, and
 * refreshing one for them is a request spent on nothing.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|preview|offline|.*\\.png$).*)',
  ],
};
