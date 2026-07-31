import type { Metadata } from 'next';
import { LOCALES, type Locale } from '@/i18n/config';
import { SITE } from '@/lib/site';

/**
 * Open Graph wants `language_TERRITORY`, not the bare language tag that `lang`
 * and `hreflang` carry. Arabic is pinned to Mauritania, which is where the work
 * is done and where the audience is.
 */
const OG_LOCALES: Record<Locale, string> = {
  ar: 'ar_MR',
  en: 'en_US',
  fr: 'fr_FR',
};

/**
 * The `openGraph` and `twitter` blocks for one page.
 *
 * Next merges metadata one level deep: a page that declares `openGraph` at all
 * replaces its layout's entirely, `type` and `siteName` included. So every page
 * has to emit the whole block, and this function is what stops the three
 * spellings of it from drifting apart.
 *
 * Neither block names an image. The `opengraph-image` / `twitter-image`
 * conventions fill those in, with the width, height, type and alt attached, and
 * naming a URL here would override that with a poorer entry. The same merge
 * rule means those files have to exist in the folder of every page that calls
 * this — the declaration takes the parent's image entries down with it.
 */
export function socialMetadata(options: {
  locale: Locale;
  /** As it should read on the card, already including the site name if wanted. */
  title: string;
  description: string;
  /** Root-relative, resolved against `metadataBase`. */
  path: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const { locale, title, description, path } = options;

  return {
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      title,
      description,
      url: path,
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other],
      ),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
