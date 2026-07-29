import { z } from 'zod';
import type { Project } from '@/data/projects';
import {
  FOLLOW_KEYS,
  socialPlatform,
  type FollowKey,
  type SocialKey,
} from '@/lib/social';

/**
 * Every locale is required.
 *
 * A half-translated project is a compile error in the bundled catalogue
 * (`Record<Locale, string>`), so it has to be a validation error in the store
 * too — otherwise the admin becomes a way to introduce exactly the state the
 * type system exists to prevent.
 */
const localizedString = z.object({
  ar: z.string().min(1),
  en: z.string().min(1),
  fr: z.string().min(1),
});

export const projectSchema = z.object({
  /**
   * Immutable after creation: it names the image folder and appears in any
   * link already shared with a client.
   */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and hyphens only.'),
  title: localizedString,
  description: localizedString,
  /** Drives the filter pills and the lightbox layout. Not the same as `frame`. */
  category: z.enum(['web', 'app']),
  /** Drives the card cover only. Not the same as `category`. */
  frame: z.enum(['phone', 'browser']).default('browser'),
  cover: z.string().min(1),
  images: z.array(z.string().min(1)),
  /**
   * https only. A portfolio link is shown to prospective clients: an http link
   * is a mixed-content warning in the browser and a bad look in front of them.
   *
   * An empty string is normalised to absent rather than rejected: that is how
   * the bundled catalogue spells "no live link" (`link: ''` on ml-scores), the
   * UI already treats it as falsy, and an empty <input> posts the same thing.
   * Rejecting it would have meant editing the owner's data to satisfy a schema.
   */
  link: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().startsWith('https://').optional(),
  ),
  /** LQIP generated at upload time for admin-managed images. */
  blurDataURL: z.string().optional(),
});

export type StoredProject = z.infer<typeof projectSchema>;

/**
 * One optional field per platform.
 *
 * The normaliser in `@/lib/social` is the validator: it returns the canonical
 * value or `null`, and `null` is the only way this can fail. Running it here
 * rather than only in the admin action means every writer gets the same
 * treatment — including the migration below, which pushes legacy rows through
 * it and canonicalises them on the way past.
 *
 * Blank is `undefined`, never an issue. An empty field means "not published";
 * making it an error would stop the owner saving the seven fields they did
 * fill because of the one they did not.
 */
function platformField(key: SocialKey) {
  const platform = socialPlatform(key);
  return z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      const stored = platform.toStored(raw);
      if (stored === null) {
        ctx.addIssue({ code: 'custom', message: platform.invalid });
        return z.NEVER;
      }
      return stored;
    });
}

/**
 * Fold the pre-v2 `{platform, url, label}[]` into the keyed object.
 *
 * The owner's stored links predate the fixed platform set, so they arrive as
 * an array with a free-text platform name. Matching that name case-insensitively
 * against the known keys preserves everything recognisable; a row naming a
 * platform the site no longer renders is dropped rather than kept as data
 * nothing reads. Anything already in the new shape passes straight through, so
 * this is idempotent and safe to leave in place.
 */
function migrateSocials(value: unknown): unknown {
  if (!Array.isArray(value)) return value ?? {};

  const aliases: Record<string, FollowKey> = {
    twitter: 'x',
    'x (twitter)': 'x',
  };
  const known = new Set<string>(FOLLOW_KEYS);
  const migrated: Record<string, string> = {};

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as { platform?: unknown; url?: unknown };
    if (typeof row.platform !== 'string' || typeof row.url !== 'string') continue;
    const name = row.platform.trim().toLowerCase();
    const key = aliases[name] ?? (known.has(name) ? name : undefined);
    // First row wins: a duplicated platform in the old list is ambiguous, and
    // silently taking the last one would look like the edit had been lost.
    if (key && !migrated[key]) migrated[key] = row.url;
  }

  return migrated;
}

const socialsSchema = z.preprocess(
  migrateSocials,
  z.object({
    linkedin: platformField('linkedin'),
    github: platformField('github'),
    instagram: platformField('instagram'),
    facebook: platformField('facebook'),
    tiktok: platformField('tiktok'),
    x: platformField('x'),
  }),
);

export type Socials = z.infer<typeof socialsSchema>;

export const settingsSchema = z
  .object({
    /**
     * Optional like every other platform: an owner who has not published a
     * number should not be blocked from saving the rest. Consumers treat the
     * derived `whatsappUrl` as possibly absent and fall back to the contact
     * section.
     */
    whatsappNumber: platformField('whatsapp'),
    /**
     * Moved out of `SITE` so it is editable from the admin. The blob fallback
     * seeds it from `SITE.email`, so a cold store still publishes an address.
     */
    email: platformField('email'),
    socials: socialsSchema,
    heroStats: z.object({
      years: z.number().int().min(0),
      projects: z.number().int().min(0),
      stacks: z.number().int().min(0),
    }),
    availableForWork: z.boolean(),
  })
  /**
   * `whatsappUrl` is derived, never stored. Two fields holding the same number
   * drift apart eventually — the brief calls this out explicitly — so there is
   * only one field to edit and the URL is computed from it.
   */
  .transform((settings) => ({
    ...settings,
    whatsappUrl: settings.whatsappNumber
      ? socialPlatform('whatsapp').toHref(settings.whatsappNumber)
      : undefined,
  }));

export type SiteSettings = z.infer<typeof settingsSchema>;
/** What the admin form posts, before the derived field is added. */
export type SiteSettingsInput = z.input<typeof settingsSchema>;

export interface ContentStore {
  getProjects(): Promise<StoredProject[]>;
  getSettings(): Promise<SiteSettings>;
  saveProjects(next: StoredProject[]): Promise<void>;
  saveSettings(next: SiteSettingsInput): Promise<void>;
}

/**
 * Shape a bundled project for the store. The bundled catalogue is the fallback
 * the public site renders whenever the blob store is empty, cold or
 * unreachable, so it has to satisfy the same schema as anything the admin
 * writes.
 */
export function projectToStored(project: Project): StoredProject {
  return projectSchema.parse(project);
}
