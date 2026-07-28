import { dictionaries, type Dictionary } from './dictionaries';
import type { Locale } from './config';

/**
 * Dot-path keys into the dictionary, e.g. "hero.stats.years".
 *
 * Defined here rather than in I18nProvider so the server helper and the client
 * hook share one definition — a key that type-checks in a server section also
 * type-checks in an island, and a dictionary change breaks both at once.
 */
type Primitive = string;
type PathInto<T> = T extends Primitive
  ? ''
  : {
      [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${PathInto<T[K]>}`;
    }[keyof T & string];

export type TKey = PathInto<Dictionary>;

export type TFunction = (key: TKey, vars?: Record<string, string | number>) => string;

function resolve(dict: Dictionary, key: string): string {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, dict);
  // A miss returns the key itself: a visible "hero.stats.years" in the UI is a
  // better failure than an empty string that nobody notices.
  return typeof value === 'string' ? value : key;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Server-side counterpart to useI18n().t — same resolution and interpolation.
 *
 * Server components cannot call hooks, so every server-rendered section takes
 * the route's `locale` as a prop and builds its own `t` from it. This module is
 * deliberately free of React and carries no client directive, so it is
 * importable from both sides of the boundary.
 */
export function getT(locale: Locale): TFunction {
  const dict = dictionaries[locale];
  return (key, vars) => interpolate(resolve(dict, key), vars);
}

export function getDict(locale: Locale): Dictionary {
  return dictionaries[locale];
}
