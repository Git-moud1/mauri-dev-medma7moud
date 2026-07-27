export const LOCALES = ['ar', 'en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_META: Record<
  Locale,
  { label: string; native: string; dir: 'rtl' | 'ltr'; htmlLang: string }
> = {
  ar: { label: 'AR', native: 'العربية', dir: 'rtl', htmlLang: 'ar' },
  en: { label: 'EN', native: 'English', dir: 'ltr', htmlLang: 'en' },
  fr: { label: 'FR', native: 'Français', dir: 'ltr', htmlLang: 'fr' },
};

export const STORAGE_KEY_THEME = 'bc-theme';
