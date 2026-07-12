import type { Locale } from '../config';
import type { Dictionary } from './en';
import en from './en';
import ar from './ar';
import fr from './fr';

export const dictionaries: Record<Locale, Dictionary> = { en, ar, fr };
export type { Dictionary };
