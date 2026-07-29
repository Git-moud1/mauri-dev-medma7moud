import { getStore } from '@netlify/blobs';
import { projects as bundledProjects } from '@/data/projects';
import { SITE } from '@/lib/site';
import {
  projectSchema,
  projectToStored,
  settingsSchema,
  type ContentStore,
  type SiteSettings,
  type StoredProject,
} from './types';

const STORE = 'site-content';
const PROJECTS_KEY = 'projects.json';
const SETTINGS_KEY = 'settings.json';

/**
 * The bundled catalogue, which is also the fallback.
 *
 * Kept as a function rather than a module constant so a caller can never hold
 * a reference to it and mutate what the next fallback returns.
 */
function bundledFallbackProjects(): StoredProject[] {
  return bundledProjects.map(projectToStored);
}

function bundledFallbackSettings(): SiteSettings {
  return settingsSchema.parse({
    whatsappNumber: SITE.whatsappNumber,
    // Seeded, not blank: the email used to be hardcoded in `SITE` and rendered
    // unconditionally, so a cold store that published no address would be a
    // regression the owner never asked for. It is editable from the admin now,
    // and clearing it there is the only way to unpublish it.
    email: SITE.email,
    socials: {},
    heroStats: {
      years: SITE.yearsExperience,
      projects: SITE.projectsDelivered,
      stacks: SITE.stacksCount,
    },
    availableForWork: true,
  });
}

/**
 * "There is no Blobs runtime here" is a configuration fact, not a failure.
 *
 * It is the normal state of `npm run dev` and `next start`, where reads are
 * meant to fall back to the bundled catalogue. Logging it at error level made
 * Next 16's dev overlay throw a full-screen MissingBlobsEnvironmentError on
 * every page load — the fallback was working perfectly and the reporting level
 * was lying about it.
 *
 * A genuine failure — an outage, a malformed blob, a network error in
 * production — still logs at error level, because that one does need attention.
 */
function isMissingBlobsEnvironment(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'MissingBlobsEnvironmentError' ||
      /not been configured to use Netlify Blobs/i.test(error.message))
  );
}

/** Warned once per process, so it reads as a notice rather than a loop. */
let warnedMissingEnvironment = false;

function reportReadFailure(what: string, error: unknown): void {
  if (isMissingBlobsEnvironment(error)) {
    if (!warnedMissingEnvironment) {
      warnedMissingEnvironment = true;
      console.warn(
        '[content] No Netlify Blobs runtime — serving the bundled catalogue. ' +
          'Run `npx netlify dev` for the real store, or edit on the deploy.',
      );
    }
    return;
  }
  console.error(`[content] ${what} read failed, using bundled data`, error);
}

/**
 * Every read falls back to the bundled data, on every failure path: a missing
 * blob (which is what a first deploy looks like), a cold store, an outage, or
 * a stored value that no longer satisfies the schema.
 *
 * The public site rendering an empty portfolio is a worse failure than it
 * rendering slightly stale content — it is the one outcome that would embarrass
 * the owner in front of a client. So nothing here throws, and nothing returns
 * an empty array to signal a problem.
 *
 * Writes are the opposite: they validate and throw, because a rejected save
 * with a visible error is much better than a silently corrupted store.
 */
export const blobStore: ContentStore = {
  async getProjects() {
    try {
      const raw: unknown = await getStore(STORE).get(PROJECTS_KEY, { type: 'json' });
      if (raw === null || raw === undefined) return bundledFallbackProjects();

      const parsed = projectSchema.array().safeParse(raw);
      if (!parsed.success) {
        console.error('[content] stored projects failed validation, using bundled data');
        return bundledFallbackProjects();
      }
      return parsed.data;
    } catch (error) {
      reportReadFailure('projects', error);
      return bundledFallbackProjects();
    }
  },

  async getSettings() {
    try {
      const raw: unknown = await getStore(STORE).get(SETTINGS_KEY, { type: 'json' });
      if (raw === null || raw === undefined) return bundledFallbackSettings();

      const parsed = settingsSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('[content] stored settings failed validation, using bundled data');
        return bundledFallbackSettings();
      }
      return parsed.data;
    } catch (error) {
      reportReadFailure('settings', error);
      return bundledFallbackSettings();
    }
  },

  async saveProjects(next) {
    await getStore(STORE).setJSON(PROJECTS_KEY, projectSchema.array().parse(next));
  },

  async saveSettings(next) {
    await getStore(STORE).setJSON(SETTINGS_KEY, settingsSchema.parse(next));
  },
};
