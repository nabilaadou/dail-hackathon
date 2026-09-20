import type { NextRequest } from 'next/server';

import { NextResponse } from 'next/server';

import { createClient } from 'src/lib/supabase/server';

// ----------------------------------------------------------------------

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const errorUrl = new URL('/auth/sign-in', origin);
  errorUrl.searchParams.set('error', 'The authentication link is invalid or has expired.');
  return NextResponse.redirect(errorUrl);
}
