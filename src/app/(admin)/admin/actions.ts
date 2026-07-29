'use server';

import { cookies, headers } from 'next/headers';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth/session';
import { checkRateLimit, recordFailure, clearAttempts } from '@/lib/auth/rate-limit';
import { blobStore, CONTENT_TAG, projectSchema, settingsSchema } from '@/lib/content';

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

async function clientIp(): Promise<string> {
  const store = await headers();
  return (
    store.get('x-nf-client-connection-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Re-verify the session inside the action itself.
 *
 * The proxy guard is a first pass and nothing more: a matcher change, a route
 * that stops matching, or a directly invoked action would all bypass it. An
 * action that trusts the proxy is an action with no auth.
 */
export async function requireSession(): Promise<boolean> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
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

  if (!(await verifyPassword(parsed.data.password))) {
    await recordFailure(ip);
    return { error: GENERIC_ERROR };
  }

  await clearAttempts(ip);
  (await cookies()).set(SESSION_COOKIE, await createSession(), SESSION_COOKIE_OPTIONS);
  redirect('/admin/dashboard');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/admin');
}

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Run a store write, turning an unreachable store into a message instead of a
 * crash.
 *
 * Netlify Blobs only exists inside a Netlify runtime. `npm run dev` and
 * `next start` have no Blobs context, so every write throws there — reads are
 * fine because they fall back to the bundled catalogue. Without this the admin
 * would show an unhandled server-action error and give no hint that the fix is
 * `netlify dev` or a deploy.
 */
async function withStore(work: () => Promise<void>): Promise<Result> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/blob|store|environment|MissingBlobsEnvironmentError/i.test(message)) {
      return {
        ok: false,
        error:
          'The content store is unavailable. Netlify Blobs only runs inside Netlify — ' +
          'use `npx netlify dev` locally, or edit on the deploy.',
      };
    }
    return { ok: false, error: `Could not save: ${message}` };
  }
}

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

  const projects = await blobStore.getProjects();
  if (projects.some((project) => project.id === parsed.data.id)) {
    return { ok: false, error: `The id "${parsed.data.id}" is already taken.` };
  }

  const saved = await withStore(async () => {
    await blobStore.saveProjects([...projects, parsed.data]);
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

export async function updateProject(id: string, formData: FormData): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  // id is immutable after creation: it names the image folder and appears in
  // any link already shared with a client.
  const parsed = projectSchema.safeParse({ ...formDataToProject(formData), id });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const projects = await blobStore.getProjects();
  if (!projects.some((project) => project.id === id)) {
    return { ok: false, error: 'That project no longer exists.' };
  }

  const saved = await withStore(async () => {
    await blobStore.saveProjects(
      projects.map((project) => (project.id === id ? parsed.data : project)),
    );
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

export async function deleteProject(id: string): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const projects = await blobStore.getProjects();
  const saved = await withStore(async () => {
    await blobStore.saveProjects(projects.filter((project) => project.id !== id));
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

/**
 * Order in the stored array is display order — the same mechanism the bundled
 * catalogue used, so nothing downstream has to learn a new rule.
 */
export async function moveProject(id: string, direction: -1 | 1): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const projects = await blobStore.getProjects();
  const index = projects.findIndex((project) => project.id === id);
  const target = index + direction;
  if (index === -1) return { ok: false, error: 'That project no longer exists.' };
  if (target < 0 || target >= projects.length) {
    return { ok: false, error: 'Already at the end of the list.' };
  }

  const next = [...projects];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);

  const saved = await withStore(async () => {
    await blobStore.saveProjects(next);
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}

export async function updateSettings(formData: FormData): Promise<Result> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const socials: { platform: string; url: string; label: string }[] = [];
  const platforms = formData.getAll('social.platform').map(String);
  const urls = formData.getAll('social.url').map(String);
  const labels = formData.getAll('social.label').map(String);
  for (const [index, platform] of platforms.entries()) {
    const url = urls[index] ?? '';
    if (!platform.trim() && !url.trim()) continue;
    socials.push({
      platform: platform.trim(),
      url: url.trim(),
      label: (labels[index] ?? platform).trim(),
    });
  }

  const number = (key: string): number => {
    const value = Number(formData.get(key));
    return Number.isFinite(value) ? value : 0;
  };

  const parsed = settingsSchema.safeParse({
    whatsappNumber: fieldString(formData, 'whatsappNumber'),
    socials,
    heroStats: {
      years: number('heroStats.years'),
      projects: number('heroStats.projects'),
      stacks: number('heroStats.stacks'),
    },
    availableForWork: formData.get('availableForWork') === 'on',
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    if (path.startsWith('socials')) {
      return {
        ok: false,
        error: 'Social links must be full https:// URLs with a platform name.',
      };
    }
    if (path === 'whatsappNumber') {
      return {
        ok: false,
        error:
          'WhatsApp number must be digits only, including the country code (e.g. 22231317501).',
      };
    }
    return { ok: false, error: issue?.message ?? 'Invalid settings.' };
  }

  const saved = await withStore(async () => {
    await blobStore.saveSettings(parsed.data);
  });
  if (saved.ok) updateTag(CONTENT_TAG);
  return saved;
}
