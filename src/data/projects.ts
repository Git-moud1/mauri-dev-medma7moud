import type { Locale } from '@/i18n/config';

/**
 * The shape of a portfolio project. Types only: the projects themselves live in
 * the `site-content` Netlify Blob store and are edited from /admin (README §11).
 * The bundled catalogue that used to sit here was a silent fallback that
 * replaced the real content at every deploy; it was removed with it.
 */

export type ProjectCategory = 'web' | 'app';

export interface Project {
  id: string;
  /** Localized title (ar / en / fr). */
  title: Record<Locale, string>;
  /** Localized short description shown on the card and inside the gallery. */
  description: Record<Locale, string>;
  category: ProjectCategory;
  /**
   * How the screenshots are framed in the card and lightbox.
   * - 'phone'   → portrait mobile screenshots shown inside a device mockup.
   * - 'browser' → landscape shots shown edge-to-edge (default).
   */
  frame?: 'phone' | 'browser';
  /** Card cover image: `/projects/<id>/…` (in public/) or `/api/media/…` (uploaded). */
  cover: string;
  /** Gallery images, in display order. Same path forms as `cover`. */
  images: string[];
  /** Optional live link. Leave empty to hide the button. */
  link?: string;
}
