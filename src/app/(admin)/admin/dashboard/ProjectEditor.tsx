'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoredProject } from '@/lib/content/types';
import { createProject, updateProject, deleteProject, type Result } from '../actions';
import { Button, Field, Section, Select, TextArea, TextInput } from '../ui/primitives';
import { useToast } from '../ui/Toaster';
import { MediaGrid, type MediaItem } from './MediaGrid';

const LOCALES = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
] as const;

type LocaleCode = (typeof LOCALES)[number]['code'];

interface Draft {
  id: string;
  category: 'web' | 'app';
  frame: 'phone' | 'browser';
  link: string;
  title: Record<LocaleCode, string>;
  description: Record<LocaleCode, string>;
  images: MediaItem[];
  cover: string;
}

function toDraft(project: StoredProject | null): Draft {
  return {
    id: project?.id ?? '',
    category: project?.category ?? 'web',
    frame: project?.frame ?? 'browser',
    link: project?.link ?? '',
    title: {
      ar: project?.title.ar ?? '',
      en: project?.title.en ?? '',
      fr: project?.title.fr ?? '',
    },
    description: {
      ar: project?.description.ar ?? '',
      en: project?.description.en ?? '',
      fr: project?.description.fr ?? '',
    },
    images: (project?.images ?? []).map((path) => ({ path })),
    cover: project?.cover ?? '',
  };
}

function toFormData(draft: Draft): FormData {
  const formData = new FormData();
  formData.set('id', draft.id);
  formData.set('category', draft.category);
  formData.set('frame', draft.frame);
  formData.set('link', draft.link);
  formData.set('cover', draft.cover);
  for (const locale of LOCALES) {
    formData.set(`title.${locale.code}`, draft.title[locale.code]);
    formData.set(`description.${locale.code}`, draft.description[locale.code]);
  }
  for (const image of draft.images) formData.append('images', image.path);
  return formData;
}

/**
 * The full-width editor that replaces a row in place.
 *
 * Four sections rather than one stack of inputs: Identity, Content, Media,
 * Link. The three locales are tabs inside Content, and every locale's values
 * live in React state — not in hidden inputs — so switching tabs never loses
 * what was typed on the one before.
 */
export function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project: StoredProject | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initial = useMemo(() => toDraft(project), [project]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [locale, setLocale] = useState<LocaleCode>('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isEdit = project !== null;
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );

  /**
   * Unsaved-changes guard. A long form that silently loses work is worse than
   * one that never saved — and the media grid means real uploads can be sitting
   * in this draft.
   */
  useEffect(() => {
    if (!dirty) return;
    // preventDefault alone is the current contract; `returnValue` is deprecated
    // and every browser that still needs it also honours preventDefault.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const close = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }, [dirty, onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    const result: Result = isEdit
      ? await updateProject(project.id, toFormData(draft))
      : await createProject(toFormData(draft));
    setSaving(false);

    if (result.ok) {
      toast.push({
        tone: 'success',
        text: isEdit ? 'Project saved.' : 'Project created.',
      });
      onSaved();
    } else {
      setError(result.error);
    }
  }

  async function destroy() {
    if (!project) return;
    setSaving(true);
    const result = await deleteProject(project.id);
    setSaving(false);
    if (result.ok) {
      toast.push({ tone: 'success', text: `Deleted ${project.id}.` });
      onSaved();
    } else {
      setError(result.error);
      setConfirmingDelete(false);
    }
  }

  const activeLocale = LOCALES.find((entry) => entry.code === locale) ?? LOCALES[1];

  return (
    <div className="rounded-2xl border border-gold/30 bg-surface p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-fg">
          {isEdit ? project.title.en || project.id : 'New project'}
        </h2>
        {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
      </div>

      <div className="space-y-8">
        <Section
          title="Identity"
          description="How this project is filed. The id cannot change later."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="ID"
              required
              hint={isEdit ? 'Fixed after creation.' : 'Lowercase, digits, hyphens.'}
            >
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={draft.id}
                  readOnly={isEdit}
                  onChange={(event) => {
                    setDraft({ ...draft, id: event.target.value });
                  }}
                />
              )}
            </Field>

            <Field label="Category" hint="Filter pills and lightbox layout.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={draft.category}
                  onChange={(event) => {
                    setDraft({ ...draft, category: event.target.value as 'web' | 'app' });
                  }}
                >
                  <option value="web">Web</option>
                  <option value="app">App</option>
                </Select>
              )}
            </Field>

            <Field label="Frame" hint="Card cover only. Not the category.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={draft.frame}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      frame: event.target.value as 'phone' | 'browser',
                    });
                  }}
                >
                  <option value="browser">Browser</option>
                  <option value="phone">Phone</option>
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Content"
          description="All three languages are required — the public site has no fallback copy."
        >
          <div
            role="tablist"
            aria-label="Language"
            className="mb-4 inline-flex rounded-xl border border-border p-1"
          >
            {LOCALES.map((entry) => {
              const filled =
                draft.title[entry.code].trim() !== '' &&
                draft.description[entry.code].trim() !== '';
              return (
                <button
                  key={entry.code}
                  type="button"
                  role="tab"
                  aria-selected={locale === entry.code}
                  onClick={() => {
                    setLocale(entry.code);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    locale === entry.code
                      ? 'bg-surface-2 text-fg'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  {entry.label}
                  {/* A dot per tab, so an unfilled language is visible without
                      opening it — the constraint is all three or none. */}
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${filled ? 'bg-gold' : 'bg-border'}`}
                  />
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <Field label={`Title (${activeLocale.label})`} required>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  dir={activeLocale.dir}
                  value={draft.title[locale]}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      title: { ...draft.title, [locale]: event.target.value },
                    });
                  }}
                />
              )}
            </Field>
            <Field label={`Description (${activeLocale.label})`} required>
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  dir={activeLocale.dir}
                  rows={3}
                  value={draft.description[locale]}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      description: { ...draft.description, [locale]: event.target.value },
                    });
                  }}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Media"
          description="Drag to reorder. The star sets the card cover."
        >
          <MediaGrid
            projectId={draft.id}
            items={draft.images}
            cover={draft.cover}
            onChange={(images, cover) => {
              setDraft({ ...draft, images, cover });
            }}
          />
        </Section>

        <Section
          title="Link"
          description="Optional. Shown as the live-site button on the card."
        >
          <Field label="Live URL" hint="https only.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="url"
                placeholder="https://example.com"
                value={draft.link}
                onChange={(event) => {
                  setDraft({ ...draft, link: event.target.value });
                }}
              />
            )}
          </Field>
        </Section>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center gap-3 border-t border-border/60 pt-6">
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {isEdit ? 'Save changes' : 'Create project'}
        </Button>
        <Button variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
      </div>

      {/* Danger zone: bordered, separated, and never adjacent to Save. */}
      {isEdit ? (
        <div className="mt-8 rounded-xl border border-red-500/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">Delete this project</h3>
              <p className="mt-0.5 text-xs text-muted">
                Removes it from the public site immediately. This cannot be undone.
              </p>
            </div>
            {confirmingDelete ? (
              <div className="flex gap-2">
                <Button variant="danger" loading={saving} onClick={() => void destroy()}>
                  Yes, delete {project.id}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmingDelete(false);
                  }}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
