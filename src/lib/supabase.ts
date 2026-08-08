import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Uploaded images. Private — /api/media proxies it, nothing reads it directly. */
export const MEDIA_BUCKET = 'site-media';

/**
 * The server-side Supabase client.
 *
 * `server-only` at the top of this file is the real guard: SUPABASE_SECRET_KEY
 * bypasses Row Level Security, so importing this module from a client component
 * has to be a build error rather than a code review question.
 *
 * There is no publishable-key client anywhere in this project on purpose.
 * Nothing in a browser talks to Supabase — the public pages are prerendered,
 * the admin runs in server actions, and images come through /api/media. That is
 * what lets every table sit behind RLS with no policies at all.
 */
let client: SupabaseClient<Database> | null = null;

/**
 * Throws when the environment is incomplete, and that is the whole point.
 *
 * The bug this migration exists to fix was a store read that failed quietly
 * during the build and let the bundled fallback bake into the HTML, so the site
 * reverted to old content at the next deploy with nothing in the log. A missing
 * variable now stops whatever is running instead — the prebuild check
 * (scripts/check-supabase.mjs) turns that into a failed build before Next
 * renders a single page.
 */
export function supabase(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_SECRET_KEY']
      .filter(Boolean)
      .join(' and ');
    throw new Error(
      `${missing} is not set. Locally: copy .env.example to .env.local and fill it in. ` +
        'On Netlify: Site configuration → Environment variables, scoped to BOTH ' +
        'Builds and Functions — the public pages read the store during the prerender.',
    );
  }

  client = createClient<Database>(url, key, {
    // No cookies, no refresh timer, no session storage: every call here is a
    // stateless server request authenticated by the secret key alone.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
