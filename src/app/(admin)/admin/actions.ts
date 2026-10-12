'use server';

import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifyAgainst } from '@/lib/auth/password';
import { readCredential } from '@/lib/auth/credential';
import { clientIp, hasValidSession } from '@/lib/auth/request';
import {
  createSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth/session';
import { checkRateLimit, recordFailure, clearAttempts } from '@/lib/auth/rate-limit';
import {
  blobsStore,
  versionOf,
  ContentConflictError,
  CONTENT_TAG,
  projectSchema,
  settingsSchema,
} from '@/lib/content';
import { isMissingBlobsEnvironment } from '@/lib/blobs';
import { FOLLOW_KEYS } from '@/lib/social';

/**
 * One message for every authentication failure.
 *
 * Distinguishing "no such password" from "wrong password" from "that account is
 * locked" tells an attacker which half they got right. The single exception is
 * the lockout notice below, and that is a deliberate trade: telling a locked-out
 * owner to come back in twelve minutes is worth more than the sliver it reveals,
 * and the lockout is already observable through timing anyway.
 */
const GENERIC_ERROR = 'Incorrect password.';

const loginSchema = z.object({ password: z.string().min(1).max(200) });

export interface ActionState {
  error: string;
}

/**
 * Re-verify the session inside the action itself.
 *
 * The proxy guard is a first pass and nothing more: a matcher change, a route
 * that stops matching, or a directly invoked action would all bypass it. An
 * action that trusts the proxy is an action with no auth.
 *
 * It also checks the session version against the stored credential, which the
 * proxy cannot: after a password change, older sessions fail here.
 */
export async function requireSession(): Promise<boolean> {
  return hasValidSession();
}

export async function login(
  _previous: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: GENERIC_ERROR };

  const ip = await clientIp();

  const limit = await checkRateLimit(ip);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { error: `Too many attempts. Try again in ${minutes} minutes.` };
  }

  // The stored credential once a password has been changed, the bootstrap
  // variable until then. A store error refuses sign-in rather than falling back
  // to the variable, which may hold a password that has since been replaced.
  let credential;
  try {
    credential = await readCredential();
  } catch {
    return {
      error: 'Sign-in is unavailable right now — the credential store did not answer.',
    };
  }

  if (!(await verifyAgainst(credential?.hash, parsed.data.password)) || !credential) {
    await recordFailure(ip);
    return { error: GENERIC_ERROR };
  }

  await clearAttempts(ip);
  (await cookies()).set(
    SESSION_COOKIE,
    await createSession(credential.sessionVersion),
    SESSION_COOKIE_OPTIONS,
  );
  redirect('/admin/dashboard');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/admin');
}

export type Result =
  | { ok: true }
  /**
   * `fieldErrors` is keyed by the form's input name. A settings form with
   * eight independent fields cannot report "one of these is wrong" at the top
   * of the page and expect the owner to find which — every issue is carried
   * back to the input that caused it. `error` stays for failures that belong
   * to no single field (an unreachable store, a lost session).
   */
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Run a store write, turning an unreachable store into a message instead of a
 * crash.
 *
 * A save is the one moment where the owner is holding text they will lose. An
 * unhandled server-action error would drop them on a generic screen with the
 * form gone; a returned message keeps the editor open with the draft in it.
 *
 * The environment case is called out separately because it is the only failure
 * with a fix the owner can act on without reading a log.
 */
async function withStore(work: () => Promise<Result | undefined>): Promise<Result> {
  try {
    // Returning a Result lets the work itself report a business failure — "that
    // id is taken" — from inside the same guard that catches an unreachable
    // store. Every one of these actions has to read before it writes, and since
    // reads throw now, a read left outside this boundary would be an unhandled
    // server-action error with the owner's unsaved form behind it.
    return (await work()) ?? { ok: true };
  } catch (error) {
    if (isMissingBlobsEnvironment(error)) {
      return {
        ok: false,
        error:
          'The content store is not available here — Netlify Blobs exists inside a ' +
          'Netlify deploy, or locally under `npm run blobs:local`.',
      };
    }
    // Already a full sentence telling the owner what to do; no prefix.
    if (error instanceof ContentConflictError) return { ok: false, error: error.message };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not save: ${message}` };
  }
}

/**
 * The version stamp the dashboard put on the form when it was loaded.
 * See `versionOf` — it is what stops a form left open in one tab from
 * overwriting a save made in another.
 */
function expectedVersion(formData: FormData): string {
  const value = formData.get('expectedVersion');
  return typeof value === 'string' ? value : '';
}

const STALE_PROJECT =
  'This project was changed since the editor was opened — probably in another tab. ' +
  'Nothing was saved. Reload to see the current version, then make the change again.';

/**
 * One FormData field as a trimmed string.
 *
 * FormDataEntryValue is `string | File`, and a File stringifies to
 * "[object File]" rather than failing, so non-strings are dropped rather than
 * coerced. Not exported: a 'use server' module may only export async functions.
 */
function fieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads the per-locale fields the form posts as `title.ar`, `title.en`, … */
function formDataToProject(formData: FormData): Record<string, unknown> {
  // FormDataEntryValue is string | File. A File stringifies to "[object File]"
  // rather than failing, so non-strings are dropped instead of coerced.
  const str = (key: string): string => {
    const value = formData.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  return {
    id: str('id'),
    title: { ar: str('title.ar'), en: str('title.en'), fr: str('title.fr') },
    description: {
      ar: str('description.ar'),
      en: str('description.en'),
      fr: str('description.fr'),
    },
    category: str('category'),
    frame: str('frame') || 'browser',
    cover: str('cover'),
    images: formData
      .getAll('images')
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
    link: str('link'),
  };
}

/** Turns a zod failure into one sentence a human can act on. */
function firstError(issues: { path: PropertyKey[]; message: string }[]): string {
  const localeIssue = issues.find((issue) =>
    /^(title|description)$/.test(String(issue.path[0])),
  );
  if (localeIssue) {
    return 'Title and description are required in all three languages.';
  }
  return issues[0]?.message ?? 'Invalid project.';
}

/**
 * `updateTag`, not `revalidateTag`.
 *
 * Next 16 made `revalidateTag`'s second argument required, and with a cacheLife
 * profile it is stale-while-revalidate: the next visitor still gets the old
 * content while the refresh happens behind them. The whole point of this panel
 * is that the owner edits a project and sees it on the public site, so the
 * expiry has to be immediate. `updateTag` is the API for exactly that case in a
 * Server Action.
 */
export async function createProject(formData: FormData): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const parsed = projectSchema.safeParse(formDataToProject(formData));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const saved = await withStore(() =>
    blobsStore.updateProjects((projects) =>
      projects.some((project) => project.id === parsed.data.id)
        ? `The id "${parsed.data.id}" is already taken.`
        : [...projects, parsed.data],
    ),
  );
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

export async function updateProject(id: string, formData: FormData): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  // id is immutable after creation: it names the image folder and appears in
  // any link already shared with a client.
  const parsed = projectSchema.safeParse({ ...formDataToProject(formData), id });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const expected = expectedVersion(formData);
  const saved = await withStore(() =>
    blobsStore.updateProjects((projects) => {
      const current = projects.find((project) => project.id === id);
      if (!current) return 'That project no longer exists.';
      if (versionOf(current) !== expected) return STALE_PROJECT;
      return projects.map((project) => (project.id === id ? parsed.data : project));
    }),
  );
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

/**
 * `version` is the stamp the editor was opened with. Deleting a project that
 * was edited elsewhere in the meantime is refused, for the same reason saving
 * over it is.
 *
 * Only the record goes. Its images stay in the media store, unreferenced:
 * nothing here deletes uploaded files, so a deletion is recoverable from the
 * store plus a backup of projects.json.
 */
export async function deleteProject(id: string, version: string): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const saved = await withStore(() =>
    blobsStore.updateProjects((projects) => {
      const current = projects.find((project) => project.id === id);
      if (!current) return 'That project no longer exists.';
      if (versionOf(current) !== version) return STALE_PROJECT;
      return projects.filter((project) => project.id !== id);
    }),
  );
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

/**
 * Order in the stored array is display order — the same mechanism the bundled
 * catalogue used, so nothing downstream has to learn a new rule.
 */
export async function moveProject(id: string, direction: -1 | 1): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  // No version stamp: a move is relative to wherever the project is NOW, so
  // applying it to a list that changed elsewhere is still what the owner asked
  // for. The etag inside updateProjects still refuses an overlapping write.
  const saved = await withStore(() =>
    blobsStore.updateProjects((projects) => {
      const index = projects.findIndex((project) => project.id === id);
      const target = index + direction;
      if (index === -1) return 'That project no longer exists.';
      if (target < 0 || target >= projects.length)
        return 'Already at the end of the list.';

      const next = [...projects];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    }),
  );
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

export async function updateSettings(formData: FormData): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  /**
   * Each platform posts under its own name, so the parallel-array reassembly
   * this used to do — three `getAll` calls zipped by index — is gone, and with
   * it the chance of a row's URL landing against another row's platform.
   */
  const socials = Object.fromEntries(
    FOLLOW_KEYS.map((key) => [key, fieldString(formData, `social.${key}`)]),
  );

  const number = (key: string): number => {
    const value = Number(formData.get(key));
    return Number.isFinite(value) ? value : 0;
  };

  const parsed = settingsSchema.safeParse({
    whatsappNumber: fieldString(formData, 'whatsappNumber'),
    email: fieldString(formData, 'email'),
    socials,
    heroStats: {
      years: number('heroStats.years'),
      projects: number('heroStats.projects'),
      stacks: number('heroStats.stacks'),
    },
    availableForWork: formData.get('availableForWork') === 'on',
  });

  if (!parsed.success) {
    // `socials.github` is the schema path; `social.github` is the input name.
    // Every other path is already its own input name.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const name = path.startsWith('socials.')
        ? path.replace(/^socials\./, 'social.')
        : path;
      fieldErrors[name] ??= issue.message;
    }

    const count = Object.keys(fieldErrors).length;
    return {
      ok: false,
      error:
        count === 1
          ? 'One field needs fixing — see the message under it.'
          : `${count} fields need fixing — see the messages under them.`,
      fieldErrors,
    };
  }

  const expected = expectedVersion(formData);
  const saved = await withStore(async () => {
    await blobsStore.saveSettings(parsed.data, expected);
    return undefined;
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}
