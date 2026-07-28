import { redirect } from 'next/navigation';
import { getStore } from '@netlify/blobs';
import { blobStore } from '@/lib/content';
import { requireSession } from '../actions';
import { DashboardShell } from './DashboardShell';

/**
 * Always rendered per request: it shows a signed-in view of live content, so
 * caching it would be both a correctness bug and a privacy one.
 */
export const dynamic = 'force-dynamic';

/**
 * Can this runtime actually write?
 *
 * Reads always succeed because they fall back to the bundled catalogue, so
 * "the list rendered" proves nothing about whether saving will work. Probing
 * once here lets the UI say so up front instead of letting each save discover
 * it separately.
 */
async function isStoreAvailable(): Promise<boolean> {
  try {
    await getStore('site-content').get('projects.json', { type: 'json' });
    return true;
  } catch {
    return false;
  }
}

export default async function DashboardPage() {
  // The proxy already redirects a signed-out request. This re-checks for the
  // same reason every action does: the proxy is a first pass, not the boundary.
  if (!(await requireSession())) redirect('/admin');

  // Straight from the store, bypassing the tagged cache: an admin must see what
  // is actually stored, not what the public cache last captured.
  const [projects, settings, storeAvailable] = await Promise.all([
    blobStore.getProjects(),
    blobStore.getSettings(),
    isStoreAvailable(),
  ]);

  return (
    <DashboardShell
      projects={projects}
      settings={settings}
      storeAvailable={storeAvailable}
    />
  );
}
