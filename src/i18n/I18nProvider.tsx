'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  STORAGE_KEY_LOCALE,
  type Locale,
} from './config';
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
  ready: boolean;
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

function applyDocument(locale: Locale) {
  const { dir, htmlLang } = LOCALE_META[locale];
  const html = document.documentElement;
  html.setAttribute('lang', htmlLang);
  html.setAttribute('dir', dir);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY_LOCALE);
    } catch {
      /* storage unavailable */
    }
    const next = (LOCALES as readonly string[]).includes(stored ?? '')
      ? (stored as Locale)
      : DEFAULT_LOCALE;
    setLocaleState(next);
    applyDocument(next);
    setReady(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    applyDocument(l);
    try {
      localStorage.setItem(STORAGE_KEY_LOCALE, l);
    } catch {
      /* ignore */
    }
  }, []);

  const dict = dictionaries[locale];

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      interpolate(resolve(dict, key), vars),
    [dict],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: LOCALE_META[locale].dir, setLocale, t, dict, ready }),
    [locale, setLocale, t, dict, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
