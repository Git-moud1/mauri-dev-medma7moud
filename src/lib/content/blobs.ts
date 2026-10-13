import 'server-only';
import { createHash } from 'node:crypto';
import { contentStore, CONTENT_STORE, BlobWriteUnverifiedError } from '@/lib/blobs';
import {
  projectSchema,
  settingsSchema,
  type SiteSettings,
  type SiteSettingsInput,
  type StoredProject,
} from './types';

/**
 * The content store, backed by Netlify Blobs.
 *
 * Two documents, the same two the site used before Supabase and the same keys
 * the recovered data still sits under:
 *
 *   site-content/projects.json   the ordered project array — array order IS
 *                                display order
 *   site-content/settings.json   the settings object
 *
 * Rules this file is built around:
 *
 * 1. **A failed or impossible read throws.** A missing document, a malformed
 *    one, or one that fails the schema is an error with its name on it. There
 *    is no bundled fallback anywhere: the bundled catalogue standing in for the
 *    real one is the bug that cost this site its content once already.
 *
 * 2. **Every write is conditional.** It names the etag it read, so a write that
 *    lost a race is refused (412) instead of overwriting someone else's save.
 *
 * 3. **Every write is verified** by reading it back — see
 *    `BlobWriteUnverifiedError` for why the SDK's own answer is not enough.
 */

const PROJECTS_KEY = 'projects.json';
const SETTINGS_KEY = 'settings.json';

/** A save that lost a race with another save. Nothing was written. */
export class ContentConflictError extends Error {
  constructor(what: string) {
    super(
      `${what} changed since this page was loaded — probably in another tab. ` +
        'Nothing was saved. Reload to see the current version, then make the change again.',
    );
    this.name = 'ContentConflictError';
  }
}

interface Doc {
  value: unknown;
  /** Absent only if the store answered without one; see `readDocForUpdate`. */
  etag: string | undefined;
}

async function readDoc(key: string): Promise<Doc> {
  const result = await contentStore().getWithMetadata(key, { type: 'text' });
  if (result === null) {
    throw new Error(
      `[content] ${CONTENT_STORE}/${key} does not exist. Nothing is served in its place. ` +
        'If this is a new deploy context, its store has not been seeded.',
    );
  }
  try {
    return { value: JSON.parse(result.data), etag: result.etag };
  } catch {
    throw new Error(`[content] ${CONTENT_STORE}/${key} is not valid JSON.`);
  }
}

/**
 * A read that a write will follow. Without an etag there is nothing to make
 * the write conditional on, so it refuses rather than writing blind. The public
 * pages use `readDoc` and do not depend on it.
 */
async function readDocForUpdate(key: string): Promise<Doc & { etag: string }> {
  const doc = await readDoc(key);
  if (!doc.etag) {
    throw new Error(
      `[content] ${CONTENT_STORE}/${key} was read without an etag, so a safe ` +
        'conditional write is impossible. Nothing was saved.',
    );
  }
  return { value: doc.value, etag: doc.etag };
}

/**
 * Replace a document only if it still has the etag the caller read.
 * Returns the new etag.
 */
async function writeDoc(
  key: string,
  value: unknown,
  expectedEtag: string,
): Promise<string> {
  const store = contentStore();
  const body = JSON.stringify(value);

  // `set` with a string, never `setJSON` — see BlobWriteUnverifiedError.
  const result = await store.set(key, body, { onlyIfMatch: expectedEtag });
  if (!result.modified) {
    throw new ContentConflictError(
      key === PROJECTS_KEY ? 'The project list' : 'The settings',
    );
  }
  if (!result.etag) {
    throw new BlobWriteUnverifiedError(CONTENT_STORE, key, 'no etag in the response');
  }

  const check = await store.getWithMetadata(key, { type: 'text' });
  if (check === null) {
    throw new BlobWriteUnverifiedError(CONTENT_STORE, key, 'the document is gone');
  }
  if (check.etag !== result.etag || check.data !== body) {
    throw new BlobWriteUnverifiedError(CONTENT_STORE, key, 'the stored document differs');
  }
  return result.etag;
}

function parseProjects(value: unknown): StoredProject[] {
  const parsed = projectSchema.array().safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[content] ${CONTENT_STORE}/${PROJECTS_KEY} failed validation: ` +
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
    );
  }
  return parsed.data;
}

function parseSettings(value: unknown): SiteSettings {
  const parsed = settingsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[content] ${CONTENT_STORE}/${SETTINGS_KEY} failed validation: ` +
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
    );
  }
  return parsed.data;
}

/**
 * A short, stable fingerprint of a value as the admin sees it.
 *
 * The dashboard hands it to each form; the action compares it with what is
 * stored at save time. That catches the case the etag alone cannot: a form
 * that sat open while the same project was saved from another tab. The etag
 * protects the read-modify-write inside one action; this protects the minutes
 * between loading a form and pressing Save.
 */
export function versionOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

/**
 * The settings as stored: the schema INPUT shape. `whatsappUrl` is derived by
 * settingsSchema's transform and never written — the recovered document still
 * carries one from the old store, and it is simply ignored on read.
 */
function settingsToStored(settings: SiteSettings): SiteSettingsInput {
  return {
    whatsappNumber: settings.whatsappNumber,
    email: settings.email,
    socials: settings.socials,
    heroStats: settings.heroStats,
    availableForWork: settings.availableForWork,
  };
}

export const blobsStore = {
  async getProjects(): Promise<StoredProject[]> {
    return parseProjects((await readDoc(PROJECTS_KEY)).value);
  },

  async getSettings(): Promise<SiteSettings> {
    return parseSettings((await readDoc(SETTINGS_KEY)).value);
  },

  /**
   * Read the project list, let `change` derive the next one, and write it back
   * only if nothing else wrote in between.
   *
   * `change` may return a string instead of a list: a business refusal ("that
   * id is taken") that stops the write without being an error.
   *
   * No automatic retry. A refused write means two saves overlapped, and
   * re-running one of them on top of the other is exactly the silent overwrite
   * this exists to prevent. The owner reloads and decides.
   */
  async updateProjects(
    change: (current: StoredProject[]) => StoredProject[] | string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const doc = await readDocForUpdate(PROJECTS_KEY);
    const current = parseProjects(doc.value);
    const next = change(current);
    if (typeof next === 'string') return { ok: false, error: next };

    // Validated again on the way out, so nothing this module writes can fail
    // its own read.
    await writeDoc(PROJECTS_KEY, parseProjects(next), doc.etag);
    return { ok: true };
  },

  /**
   * Replace the settings, provided they are still the version the form was
   * loaded with.
   */
  async saveSettings(next: SiteSettings, expectedVersion: string): Promise<void> {
    const doc = await readDocForUpdate(SETTINGS_KEY);
    if (versionOf(parseSettings(doc.value)) !== expectedVersion) {
      throw new ContentConflictError('The settings');
    }
    await writeDoc(SETTINGS_KEY, settingsToStored(next), doc.etag);
  },
};
