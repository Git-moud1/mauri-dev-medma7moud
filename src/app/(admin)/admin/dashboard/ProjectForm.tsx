'use client';

import { useState } from 'react';
import type { StoredProject } from '@/lib/content/types';
import { createProject, updateProject, type Result } from '../actions';

const LOCALES = [
  { code: 'ar', label: 'العربية (ar)' },
  { code: 'en', label: 'English (en)' },
  { code: 'fr', label: 'Français (fr)' },
] as const;

const field =
  'w-full rounded-2xl border border-border bg-bg px-4 py-2.5 text-sm text-fg transition-colors focus:border-gold focus:outline-none';

/**
 * Create/edit form with one tab per locale.
 *
 * All three locales are always mounted — hidden with `hidden`, not unmounted —
 * so a half-filled tab still posts its values and the server can reject the
 * whole project with one message. Unmounting would silently drop what the user
 * typed on a tab they navigated away from.
 */
export function ProjectForm({
  project,
  onDone,
  onCancel,
}: {
  project: StoredProject | null;
  onDone: (result: Result) => void;
  onCancel: () => void;
}) {
  const [activeLocale, setActiveLocale] = useState<'ar' | 'en' | 'fr'>('en');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEdit = project !== null;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = isEdit
      ? await updateProject(project.id, formData)
      : await createProject(formData);
    setPending(false);
    if (result.ok) onDone(result);
    else setError(result.error);
  }

  return (
    <form
      action={(formData) => void handleSubmit(formData)}
      className="rounded-3xl border border-border bg-surface p-6"
    >
      <h2 className="font-display text-lg font-bold">
        {isEdit ? `Edit ${project.id}` : 'New project'}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="id" className="mb-1.5 block text-sm font-medium">
            ID
          </label>
          <input
            id="id"
            name="id"
            defaultValue={project?.id ?? ''}
            readOnly={isEdit}
            required
            pattern="[a-z0-9-]+"
            className={`${field} ${isEdit ? 'opacity-60' : ''}`}
          />
          <p className="mt-1 text-xs text-muted">
            {isEdit
              ? 'Immutable — it names the image folder and any link already shared.'
              : 'Lowercase letters, digits and hyphens.'}
          </p>
        </div>

        <div>
          <label htmlFor="link" className="mb-1.5 block text-sm font-medium">
            Live link <span className="text-muted">(optional)</span>
          </label>
          <input
            id="link"
            name="link"
            type="url"
            defaultValue={project?.link ?? ''}
            placeholder="https://…"
            className={field}
          />
          <p className="mt-1 text-xs text-muted">https only.</p>
        </div>

        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={project?.category ?? 'web'}
            className={field}
          >
            <option value="web">Web</option>
            <option value="app">App</option>
          </select>
          <p className="mt-1 text-xs text-muted">
            Drives the filter pills and the lightbox layout.
          </p>
        </div>

        <div>
          <label htmlFor="frame" className="mb-1.5 block text-sm font-medium">
            Frame
          </label>
          <select
            id="frame"
            name="frame"
            defaultValue={project?.frame ?? 'browser'}
            className={field}
          >
            <option value="browser">Browser</option>
            <option value="phone">Phone</option>
          </select>
          <p className="mt-1 text-xs text-muted">
            Drives the card cover image only — not the same as Category.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="cover" className="mb-1.5 block text-sm font-medium">
          Cover image path
        </label>
        <input
          id="cover"
          name="cover"
          defaultValue={project?.cover ?? ''}
          required
          placeholder="/projects/my-project/cover.jpg"
          className={field}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="images" className="mb-1.5 block text-sm font-medium">
          Gallery image paths
        </label>
        <textarea
          id="images"
          name="images-raw"
          rows={4}
          defaultValue={(project?.images ?? []).join('\n')}
          placeholder={'/projects/my-project/1.jpg\n/projects/my-project/2.jpg'}
          className={`${field} resize-y font-mono text-xs`}
          onChange={(event) => {
            // Mirror the textarea into one hidden input per line: the action
            // reads `images` with getAll(), which keeps the same shape whether
            // they came from here or, later, from the uploader.
            const container = event.currentTarget.form?.querySelector('#images-hidden');
            if (!container) return;
            container.innerHTML = '';
            for (const line of event.currentTarget.value.split('\n')) {
              const value = line.trim();
              if (!value) continue;
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = 'images';
              input.value = value;
              container.append(input);
            }
          }}
        />
        <p className="mt-1 text-xs text-muted">One path per line.</p>
        <div id="images-hidden">
          {(project?.images ?? []).map((image) => (
            <input key={image} type="hidden" name="images" value={image} readOnly />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div role="tablist" className="flex gap-1 rounded-full border border-border p-1">
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              type="button"
              role="tab"
              aria-selected={activeLocale === locale.code}
              onClick={() => {
                setActiveLocale(locale.code);
              }}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                activeLocale === locale.code
                  ? 'bg-gold text-[rgb(20_18_14)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {locale.label}
            </button>
          ))}
        </div>

        {LOCALES.map((locale) => (
          <div
            key={locale.code}
            hidden={activeLocale !== locale.code}
            className="mt-4 space-y-4"
          >
            <div>
              <label
                htmlFor={`title-${locale.code}`}
                className="mb-1.5 block text-sm font-medium"
              >
                Title
              </label>
              <input
                id={`title-${locale.code}`}
                name={`title.${locale.code}`}
                defaultValue={project?.title[locale.code] ?? ''}
                dir={locale.code === 'ar' ? 'rtl' : 'ltr'}
                className={field}
              />
            </div>
            <div>
              <label
                htmlFor={`description-${locale.code}`}
                className="mb-1.5 block text-sm font-medium"
              >
                Description
              </label>
              <textarea
                id={`description-${locale.code}`}
                name={`description.${locale.code}`}
                rows={3}
                defaultValue={project?.description[locale.code] ?? ''}
                dir={locale.code === 'ar' ? 'rtl' : 'ltr'}
                className={`${field} resize-y`}
              />
            </div>
          </div>
        ))}
        <p className="mt-2 text-xs text-muted">
          All three languages are required — the public site has no fallback copy.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={pending} className="btn-gold">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}
