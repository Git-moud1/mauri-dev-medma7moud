'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_META, type Locale } from './config';
import { LOCALE_COOKIE } from './locale';
import { dictionaries, type Dictionary } from './dictionaries';
import { getT, type TKey } from './server';

/** Dot-path keys into the dictionary, e.g. "hero.stats.years". Defined in
 * ./server so server sections and client islands share one key type. */
export type { TKey };

interface I18nContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  /** Translate a dot-path key, with optional {placeholder} interpolation. */
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  dict: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * The active locale is resolved on the server from the `[locale]` route segment
 * and handed down as a prop, so the first client render already has the right
 * dictionary — no localStorage hydration pass, and therefore no content flash.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dict = dictionaries[locale];

  const setLocale = useCallback(
    (next: Locale) => {
      // 1 year, lax so the redirect on / can read it.
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      router.push(`/${next}`);
    },
    [router],
  );

  // Same resolver the server sections use, so a string renders identically on
  // either side of the boundary.
  const t = useMemo(() => getT(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: LOCALE_META[locale].dir, setLocale, t, dict }),
    [locale, setLocale, t, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
