import type { NextRequest } from 'next/server';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { CONFIG } from 'src/global-config';

// ----------------------------------------------------------------------

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;
  const authPages = ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password'];
  let user = null;

  try {
    const supabase = createServerClient(CONFIG.supabase.url, CONFIG.supabase.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // A temporary auth service/network failure must not crash public pages.
    console.error('Unable to refresh the Supabase session:', error);
  }

  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/sign-in';
    url.search = '';
    url.searchParams.set('returnTo', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && authPages.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
