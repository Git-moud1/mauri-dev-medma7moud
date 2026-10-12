import { redirect } from 'next/navigation';
import { blobsStore, versionOf } from '@/lib/content';
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

  // Straight from the store with strong consistency, bypassing the tagged
  // cache: an admin must see what is actually stored, not what the public cache
  // last captured. A read that fails throws, and ./error.tsx says so in full —
  // there is no fallback catalogue and no read-only mode to hide behind.
  const [projects, settings] = await Promise.all([
    blobsStore.getProjects(),
    blobsStore.getSettings(),
  ]);

  // Stamped here, compared in the actions: a form saved after the same record
  // changed elsewhere is refused instead of overwriting that change.
  const projectVersions = Object.fromEntries(
    projects.map((project) => [project.id, versionOf(project)]),
  );

  return (
    <DashboardShell
      projects={projects}
      projectVersions={projectVersions}
      settings={settings}
      settingsVersion={versionOf(settings)}
    />
  );
}
