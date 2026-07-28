import { redirect } from 'next/navigation';
import { blobStore } from '@/lib/content';
import { requireSession } from '../actions';
import { ProjectsTable } from './ProjectsTable';

/**
 * Always rendered per request: it shows a signed-in view of live content, so
 * caching it would be both a correctness bug and a privacy one.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // The proxy already redirects a signed-out request, but this page re-checks
  // for the same reason every action does: the proxy is a first pass, not the
  // security boundary.
  if (!(await requireSession())) redirect('/admin');

  // Read straight from the store, bypassing the tagged cache: an admin must see
  // what is actually stored, not what the public cache last captured.
  const projects = await blobStore.getProjects();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <ProjectsTable projects={projects} />
    </main>
  );
}
