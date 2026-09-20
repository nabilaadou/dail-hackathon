import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { SupabaseResetPasswordView } from 'src/auth/view/supabase';

export const metadata: Metadata = { title: `Forgot password | ${CONFIG.appName}` };

export default function Page() {
  return <SupabaseResetPasswordView />;
}
