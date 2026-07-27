import { DEFAULT_LOCALE, LOCALES, LOCALE_META, type Locale } from './config';

/**
 * Cookie name for the visitor's chosen locale. Deliberately identical to the
 * legacy localStorage key so the migration shim in no-flash.tsx can move a
 * value across without a second name to keep track of.
 */
export const LOCALE_COOKIE = 'bc-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return LOCALE_META[locale].dir;
}

/**
 * Parse an Accept-Language header and return the best supported match.
 * Compares on the primary subtag, so "fr-FR" matches "fr". Sorts by q-value
 * descending; entries without an explicit q default to 1.0 per RFC 9110.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      const primary = tag.trim().toLowerCase().split('-')[0] ?? '';
      return { primary, q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.primary.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (isLocale(entry.primary)) return entry.primary;
  }
  return DEFAULT_LOCALE;
}
