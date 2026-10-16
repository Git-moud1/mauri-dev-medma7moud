import { dictionaries } from './dictionaries';
import type { Locale } from './config';
import { makeT, type TFunction } from './translate';

export type { TKey, TFunction } from './translate';

/** `t()` for a server component. Client components use `useI18n()` instead. */
export function getT(locale: Locale): TFunction {
  return makeT(dictionaries[locale]);
}
