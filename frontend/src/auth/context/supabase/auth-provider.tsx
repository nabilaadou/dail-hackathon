'use client';

import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { UserType, AuthState } from '../../types';

import { useSetState } from 'minimal-shared/hooks';
import { useMemo, useEffect, useCallback } from 'react';

import { createClient } from 'src/lib/supabase/client';

import { AuthContext } from '../auth-context';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
};

function mapUser(user: User | null): UserType {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const displayName =
    metadata.display_name ??
    metadata.full_name ??
    metadata.name ??
    user.email?.split('@')[0] ??
    'User';

  return {
    ...metadata,
    id: user.id,
    email: user.email,
    displayName,
    photoURL: metadata.avatar_url ?? metadata.picture ?? null,
    phoneNumber: user.phone ?? null,
    role: metadata.role ?? 'user',
    emailVerified: Boolean(user.email_confirmed_at),
    createdAt: user.created_at,
  };
}

export function AuthProvider({ children }: Props) {
  const { state, setState } = useSetState<AuthState>({ user: null, loading: true });

  const checkUserSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) throw error;

      setState({ user: mapUser(user), loading: false });
    } catch (error) {
      console.error('Unable to load the Supabase session:', error);
      setState({ user: null, loading: false });
    }
  }, [setState]);

  useEffect(() => {
    const supabase = createClient();

    checkUserSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setState({ user: mapUser(session?.user ?? null), loading: false });
    });

    return () => subscription.unsubscribe();
  }, [checkUserSession, setState]);

  const status = state.loading ? 'loading' : state.user ? 'authenticated' : 'unauthenticated';

  const value = useMemo(
    () => ({
      user: state.user,
      checkUserSession,
      loading: status === 'loading',
      authenticated: status === 'authenticated',
      unauthenticated: status === 'unauthenticated',
    }),
    [checkUserSession, state.user, status]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
