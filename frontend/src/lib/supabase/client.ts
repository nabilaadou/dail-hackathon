import { createBrowserClient } from '@supabase/ssr';

import { CONFIG } from 'src/global-config';

// ----------------------------------------------------------------------

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!CONFIG.supabase.url || !CONFIG.supabase.key) {
    throw new Error('Supabase URL and publishable key are not configured.');
  }

  client ??= createBrowserClient(CONFIG.supabase.url, CONFIG.supabase.key);

  return client;
}
