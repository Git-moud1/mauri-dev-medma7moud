import { z } from 'zod';
import type { Project } from '@/data/projects';

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

const socialSchema = z.object({
  platform: z.string().min(1),
  url: z.url().startsWith('https://'),
  label: z.string().min(1),
});

export type Social = z.infer<typeof socialSchema>;

export const settingsSchema = z
  .object({
    whatsappNumber: z
      .string()
      .regex(/^\d{8,15}$/, 'Digits only, including the country code.'),
    socials: z.array(socialSchema),
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
    whatsappUrl: `https://wa.me/${settings.whatsappNumber}`,
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
