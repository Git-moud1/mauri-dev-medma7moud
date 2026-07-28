'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { StoredProject } from '@/lib/content/types';
import { deleteProject, moveProject, logout, type Result } from '../actions';
import { ProjectForm } from './ProjectForm';

export function ProjectsTable({ projects }: { projects: StoredProject[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<StoredProject | null | 'new'>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  function announce(result: Result, successText: string) {
    setToast(
      result.ok ? { ok: true, text: successText } : { ok: false, text: result.error },
    );
    if (result.ok) router.refresh();
  }

  function run(action: () => Promise<Result>, successText: string) {
    startTransition(() => {
      void action().then((result) => {
        announce(result, successText);
      });
    });
  }

  if (editing !== null) {
    return (
      <ProjectForm
        project={editing === 'new' ? null : editing}
        onCancel={() => {
          setEditing(null);
        }}
        onDone={(result) => {
          setEditing(null);
          announce(result, editing === 'new' ? 'Project created.' : 'Project saved.');
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            Order here is the order on the public site.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setEditing('new');
            }}
            className="btn-gold"
          >
            Add project
          </button>
          <button type="button" onClick={() => void logout()} className="btn-outline">
            Sign out
          </button>
        </div>
      </div>

      {toast ? (
        <p
          role="status"
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            toast.ok
              ? 'border-gold/40 bg-gold/10 text-fg'
              : 'border-red-500/40 bg-red-500/10 text-red-400'
          }`}
        >
          {toast.text}
        </p>
      ) : null}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-start text-muted">
            <th className="py-2 text-start font-medium">#</th>
            <th className="py-2 text-start font-medium">ID</th>
            <th className="py-2 text-start font-medium">Title (en)</th>
            <th className="py-2 text-start font-medium">Category</th>
            <th className="py-2 text-start font-medium">Images</th>
            <th className="py-2 text-end font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, index) => (
            <tr key={project.id} className="border-b border-border/60">
              <td className="py-3 text-muted">{index + 1}</td>
              <td className="py-3 font-mono text-xs">{project.id}</td>
              <td className="py-3">{project.title.en}</td>
              <td className="py-3">
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {project.category}
                </span>
              </td>
              <td className="py-3 text-muted">{project.images.length}</td>
              <td className="py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    aria-label={`Move ${project.id} up`}
                    disabled={pending || index === 0}
                    onClick={() => {
                      run(() => moveProject(project.id, -1), 'Order updated.');
                    }}
                    className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${project.id} down`}
                    disabled={pending || index === projects.length - 1}
                    onClick={() => {
                      run(() => moveProject(project.id, 1), 'Order updated.');
                    }}
                    className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(project);
                    }}
                    className="rounded-lg border border-border px-3 py-1 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(project.id);
                    }}
                    className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Deleting a project is not undoable — it is worth one interruption. */}
      {confirmingDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          className="mt-6 rounded-3xl border border-red-500/40 bg-surface p-6"
        >
          <p className="text-sm">
            Delete <strong className="font-mono">{confirmingDelete}</strong>? This cannot
            be undone.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const id = confirmingDelete;
                setConfirmingDelete(null);
                run(() => deleteProject(id), `Deleted ${id}.`);
              }}
              className="rounded-2xl border border-red-500/60 px-4 py-2 text-sm text-red-400"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(null);
              }}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
