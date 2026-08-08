import { redirect } from 'next/navigation';
import { supabaseStore } from '@/lib/content';
import { requireSession } from '../actions';
import { DashboardShell } from './DashboardShell';

/**
 * Always rendered per request: it shows a signed-in view of live content, so
 * caching it would be both a correctness bug and a privacy one.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // The proxy already redirects a signed-out request. This re-checks for the
  // same reason every action does: the proxy is a first pass, not the boundary.
  if (!(await requireSession())) redirect('/admin');

  // Straight from the store, bypassing the tagged cache: an admin must see what
  // is actually stored, not what the public cache last captured.
  //
  // There is no "can this runtime write?" probe any more, and no read-only
  // banner. That pair existed because Netlify Blobs could be readable-by-
  // fallback and unwritable at the same time — locally, reads quietly returned
  // the bundled catalogue while every save threw. With one database behind one
  // credential the asymmetry is gone: if these reads returned, saving works. If
  // they did not, they threw, and ./error.tsx says so in full.
  const [projects, settings] = await Promise.all([
    supabaseStore.getProjects(),
    supabaseStore.getSettings(),
  ]);

  return <DashboardShell projects={projects} settings={settings} />;
}
