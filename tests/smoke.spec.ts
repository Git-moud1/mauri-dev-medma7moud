import { test, expect } from '@playwright/test';
import { dictionaries } from '../src/i18n/dictionaries';

/**
 * The theme toggle's accessible name is localized, and the site's default
 * locale is Arabic — so an English-only matcher never finds the button.
 * Build the matcher from the dictionaries themselves so it holds for whichever
 * locale the page happens to render, and follows the copy if it ever changes.
 */
const THEME_TOGGLE_NAME = new RegExp(
  `^(${Object.values(dictionaries)
    .flatMap((dict) => [dict.theme.toLight, dict.theme.toDark])
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
  'i',
);

test('home page renders a single h1 and the hero CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('link', { name: /whatsapp/i }).first()).toBeVisible();
});

test('html carries a lang and a dir attribute', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', /^(ar|en|fr)$/);
  await expect(html).toHaveAttribute('dir', /^(rtl|ltr)$/);
});

test('theme toggle flips the dark class', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const before = await html.getAttribute('class');
  await page.getByRole('button', { name: THEME_TOGGLE_NAME }).click();
  await expect(html).not.toHaveClass(before ?? '');
});

test('clicking a project card opens the lightbox dialog', async ({ page }) => {
  await page.goto('/');
  await page.locator('#projects').scrollIntoViewIfNeeded();
  await page.locator('#projects article button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('no console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});
