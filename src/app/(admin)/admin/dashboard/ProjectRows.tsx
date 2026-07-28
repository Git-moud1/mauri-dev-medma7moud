'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { StoredProject } from '@/lib/content/types';
import { moveProject, type Result } from '../actions';
import { Badge, Button, EmptyState, IconButton, Skeleton } from '../ui/primitives';
import { useToast } from '../ui/Toaster';
import { ProjectEditor } from './ProjectEditor';

/**
 * Direction B — "Stack".
 *
 * Media-forward rows: the cover on the leading edge and the project's other
 * thumbnails inline, so the list shows the actual work rather than a filename
 * count. Editing expands the row in place and gets the full column width, which
 * is what the media grid needs.
 */
export function ProjectRows({ projects }: { projects: StoredProject[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const run = useCallback(
    (action: () => Promise<Result>, successText: string) => {
      startTransition(() => {
        void action().then((result) => {
          if (result.ok) {
            toast.push({ tone: 'success', text: successText });
            router.refresh();
          } else {
            toast.push({ tone: 'error', text: result.error });
          }
        });
      });
    },
    [router, toast],
  );

  if (creating) {
    return (
      <ProjectEditor
        project={null}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={() => {
          setCreating(false);
          router.refresh();
        }}
      />
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="The public site falls back to the bundled catalogue until something is stored here. Add your first project and it appears on the site without a redeploy."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true);
            }}
          >
            Add project
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {projects.length} projects · order here is the order on the site
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setCreating(true);
          }}
        >
          Add project
        </Button>
      </div>

      <ul className="space-y-2">
        {projects.map((project, index) => {
          const isOpen = openId === project.id;
          const gallery = project.images
            .filter((image) => image !== project.cover)
            .slice(0, 6);

          return (
            <li key={project.id}>
              <div
                className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors duration-150 ${
                  isOpen
                    ? 'border-gold/30 bg-surface'
                    : 'border-border bg-surface hover:border-border/80'
                }`}
              >
                <div className="flex flex-col">
                  <IconButton
                    label={`Move ${project.id} up`}
                    disabled={pending || index === 0}
                    onClick={() => {
                      run(() => moveProject(project.id, -1), 'Order updated.');
                    }}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${project.id} down`}
                    disabled={pending || index === projects.length - 1}
                    onClick={() => {
                      run(() => moveProject(project.id, 1), 'Order updated.');
                    }}
                  >
                    ↓
                  </IconButton>
                </div>

                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {project.cover ? (
                    <Image
                      src={project.cover}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized={project.cover.startsWith('/api/media/')}
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-fg">
                      {project.title.en || project.id}
                    </h3>
                    <Badge>{project.category}</Badge>
                    {project.frame === 'phone' ? <Badge>phone</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {project.description.en}
                  </p>
                </div>

                {/* The work itself, inline. */}
                <ul className="hidden shrink-0 items-center gap-1 lg:flex">
                  {gallery.map((image) => (
                    <li
                      key={image}
                      className="relative h-9 w-9 overflow-hidden rounded-md bg-surface-2"
                    >
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                        unoptimized={image.startsWith('/api/media/')}
                      />
                    </li>
                  ))}
                  {project.images.length > gallery.length + 1 ? (
                    <li className="ps-1 text-xs tabular-nums text-muted">
                      +{project.images.length - gallery.length - 1}
                    </li>
                  ) : null}
                </ul>

                <Button
                  onClick={() => {
                    setOpenId(isOpen ? null : project.id);
                  }}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Close' : 'Edit'}
                </Button>
              </div>

              {isOpen ? (
                <div className="mt-2">
                  <ProjectEditor
                    project={project}
                    onClose={() => {
                      setOpenId(null);
                    }}
                    onSaved={() => {
                      setOpenId(null);
                      router.refresh();
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Shown while the dashboard's server component resolves. */
export function ProjectRowsSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2, 3].map((row) => (
        <li
          key={row}
          className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5"
        >
          <Skeleton className="h-16 w-24" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </li>
      ))}
    </ul>
  );
}
