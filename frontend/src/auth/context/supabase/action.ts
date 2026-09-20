'use client';

import { createClient } from 'src/lib/supabase/client';

// ----------------------------------------------------------------------

export type SignInParams = {
  email: string;
  password: string;
};

export type SignUpParams = SignInParams & {
  firstName: string;
  lastName: string;
};

export async function signInWithPassword({ email, password }: SignInParams) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw error;

  return data;
}

export async function signUp({ email, password, firstName, lastName }: SignUpParams) {
  const supabase = createClient();
  const fullName = `${firstName} ${lastName}`.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        display_name: fullName,
      },
    },
  });

  if (error) throw error;

  return data;
}

export async function resetPassword(email: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
  });

  if (error) throw error;
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) throw error;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}
