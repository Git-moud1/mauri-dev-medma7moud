import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/config';
import { SITE_URL } from '@/lib/site';

/**
 * `robots.ts` has advertised `${SITE_URL}/sitemap.xml` since plan 2; this is the
 * file it points at.
 *
 * Every public page is a locale route, so the map is the cross product of the
 * locales and the two routes that exist. `/admin` and `/api` are excluded by
 * construction rather than by a filter — they are not in this list, and
 * robots.ts disallows them as well.
 *
 * Each entry carries the same `alternates.languages` set the page's own
 * `generateMetadata` emits as hreflang. Both are needed: hreflang in the
 * document tells a crawler that already has the page about its translations,
 * the sitemap tells it they exist before it has fetched anything.
 *
 * No `lastModified`. Content is editable from the admin without a redeploy, so
 * a build-time date would be a claim about freshness that the deploy has no way
 * to know — and stamping every URL with "changed" on each deploy is the kind of
 * signal crawlers learn to discount.
 */
const ROUTES = ['', '/projects'] as const;

function alternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = `${SITE_URL}/${locale}${path}`;
  // x-default points at Arabic, matching `DEFAULT_LOCALE` and the alternates
  // the layouts emit. A crawler with no locale preference lands where a visitor
  // with no locale preference does.
  languages['x-default'] = `${SITE_URL}/ar${path}`;
  return languages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      // The homepage is the entry point; the catalogue is one level in.
      priority: path === '' ? 1 : 0.8,
      changeFrequency: 'monthly' as const,
      alternates: { languages: alternates(path) },
    })),
  );
}
