import { SITE } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import {
  projectSchema,
  settingsSchema,
  type ContentStore,
  type SiteSettings,
  type StoredProject,
} from './types';

/**
 * The content store, backed by Postgres.
 *
 * The rule that shapes this whole file: **a failed read throws.**
 *
 * The store this replaced did the opposite. Every read fell back to the bundled
 * catalogue on any error, which was defensible for an outage and catastrophic
 * during a build: the public pages are prerendered, the build container had no
 * Netlify Blobs context, so every prerender read failed, fell back, and baked
 * the bundled data into static HTML. The site showed the owner's real edits via
 * ISR and reverted to the original content at the next deploy, with nothing in
 * the log louder than a warning. Days of "it changed back on its own".
 *
 * Throwing turns that into a build that fails on the spot. Combined with
 * scripts/check-supabase.mjs, which runs before `next build` even starts, the
 * failure now happens in the one place where it is cheap to fix.
 *
 * Writes still throw, as they always did: a rejected save with a visible error
 * beats a silently corrupted store.
 */

type ProjectRow = Database['public']['Tables']['projects']['Row'];

/**
 * NULL is how the columns spell "absent"; `undefined` is how zod does. Passing
 * a literal null into `projectSchema` would fail the optional-string checks, so
 * the boundary is crossed here rather than loosening the schema.
 */
function rowToProject(row: ProjectRow): unknown {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    frame: row.frame,
    cover: row.cover,
    images: row.images,
    link: row.link ?? undefined,
    blurDataURL: row.blur_data_url ?? undefined,
  };
}

/**
 * Settings for a database that has rows but no settings row.
 *
 * Only reachable on a project that has never had `supabase/schema.sql` seeded —
 * the migration writes this row, and every admin save upserts it. It is a warn
 * rather than a throw because the alternative is an admin panel the owner
 * cannot open to fix the very thing that is missing, and it is not silent for
 * the same reason the reads above are not.
 */
function unconfiguredSettings(): SiteSettings {
  console.warn(
    '[content] site_settings has no row — serving defaults from SITE. ' +
      'Save the settings form once in /admin to create it.',
  );
  return settingsSchema.parse({
    whatsappNumber: SITE.whatsappNumber,
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

export const supabaseStore: ContentStore = {
  async getProjects(): Promise<StoredProject[]> {
    const { data, error } = await supabase()
      .from('projects')
      .select('*')
      // `position` is the display order. Sorting here rather than in the caller
      // keeps the array-is-the-order contract the rest of the app still relies
      // on, including moveProject.
      .order('position');

    if (error) {
      throw new Error(`[content] could not read projects: ${error.message}`);
    }

    // An empty catalogue is NOT an error here: it is what the admin sees after
    // deleting the last project, and throwing would lock the owner out of the
    // panel they need in order to add one back. The build-time gate
    // (scripts/check-supabase.mjs) is what refuses to ship an empty site.
    return projectSchema.array().parse(data.map(rowToProject));
  },

  async getSettings(): Promise<SiteSettings> {
    const { data, error } = await supabase()
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      throw new Error(`[content] could not read settings: ${error.message}`);
    }
    if (!data) return unconfiguredSettings();

    return settingsSchema.parse({
      whatsappNumber: data.whatsapp_number ?? undefined,
      email: data.email ?? undefined,
      socials: data.socials ?? {},
      heroStats: data.hero_stats,
      availableForWork: data.available_for_work,
    });
  },

  /**
   * One RPC, one transaction.
   *
   * The caller hands over the whole ordered array — the same shape the blob
   * held — and `replace_projects` derives `position` from array order, upserts
   * every row and deletes anything no longer in the list. Doing that as an
   * upsert plus a separate delete would be two transactions, and a failure
   * between them would leave a deleted project live on the site.
   */
  async saveProjects(next): Promise<void> {
    const payload = projectSchema.array().parse(next);
    const { error } = await supabase().rpc('replace_projects', { payload });
    if (error) throw new Error(`[content] could not save projects: ${error.message}`);
  },

  /**
   * `whatsappUrl` is dropped: it is derived by settingsSchema's .transform()
   * from the number in the row next to it, and storing both would give the same
   * fact two spellings that drift apart.
   */
  async saveSettings(next): Promise<void> {
    const parsed = settingsSchema.parse(next);
    const { error } = await supabase()
      .from('site_settings')
      .upsert(
        {
          id: 1,
          whatsapp_number: parsed.whatsappNumber ?? null,
          email: parsed.email ?? null,
          socials: parsed.socials,
          hero_stats: parsed.heroStats,
          available_for_work: parsed.availableForWork,
        },
        { onConflict: 'id' },
      );
    if (error) throw new Error(`[content] could not save settings: ${error.message}`);
  },
};
