import { test, expect } from '@playwright/test';
import { isLocale, negotiateLocale, dirFor, LOCALE_COOKIE } from '../src/i18n/locale';

test.describe('locale primitives', () => {
  test('isLocale accepts only the three supported codes', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  test('dirFor maps Arabic to rtl and the rest to ltr', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('fr')).toBe('ltr');
  });

  test('negotiateLocale picks the highest-quality supported match', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
    expect(negotiateLocale('ar-MR,ar;q=0.9')).toBe('ar');
  });

  test('negotiateLocale respects q-values over source order', () => {
    expect(negotiateLocale('de;q=1.0,en;q=0.9,fr;q=0.95')).toBe('fr');
  });

  test('negotiateLocale falls back to Arabic', () => {
    expect(negotiateLocale(null)).toBe('ar');
    expect(negotiateLocale('')).toBe('ar');
    expect(negotiateLocale('de-DE,de;q=0.9')).toBe('ar');
  });

  test('the cookie name matches the legacy localStorage key', () => {
    expect(LOCALE_COOKIE).toBe('bc-locale');
  });
});
