'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_META, type Locale } from './config';
import { LOCALE_COOKIE } from './locale';
import { dictionaries, type Dictionary } from './dictionaries';

/** Dot-path keys into the dictionary, e.g. "hero.stats.years". */
type Primitive = string;
type PathInto<T> = T extends Primitive
  ? ''
  : {
      [K in keyof T & string]: T[K] extends Primitive
        ? K
        : `${K}.${PathInto<T[K]>}`;
    }[keyof T & string];

export type TKey = PathInto<Dictionary>;

interface I18nContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  /** Translate a dot-path key, with optional {placeholder} interpolation. */
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  dict: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(dict: Dictionary, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

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

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      interpolate(resolve(dict, key), vars),
    [dict],
  );

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
