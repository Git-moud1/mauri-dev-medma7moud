import { test, expect, type Page } from '@playwright/test';
import { dictionaries } from '../src/i18n/dictionaries';
import { SITE } from '../src/lib/site';
import { FOLLOW_KEYS } from '../src/lib/social';

const LOCALES = ['ar', 'en', 'fr'] as const;

/**
 * What the site renders here comes from the store, and against a local server
 * there is no Blobs runtime — so these run against the bundled fallback:
 * WhatsApp and Email published, all six follow platforms blank. That is
 * exactly the mix worth asserting locally, because it covers both a filled
 * field and an empty one. Filling the follow platforms needs the admin, which
 * needs a deploy; that pass is the owner's, and the checklist in PROGRESS.md
 * says what to look for.
 */

/** The contact section and the footer both render the blocks. */
function regions(page: Page) {
  return [page.locator('#contact'), page.locator('footer')];
}

for (const locale of LOCALES) {
  const dict = dictionaries[locale];

  test(`${locale}: both contact pills render in the contact section and the footer`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);

    for (const region of regions(page)) {
      const whatsapp = region.getByRole('link', {
        name: new RegExp(dict.social.names.whatsapp),
      });
      await expect(whatsapp.first()).toBeVisible();
      await expect(whatsapp.first()).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+/);

      const email = region.getByRole('link', {
        name: new RegExp(dict.social.names.email),
      });
      await expect(email.first()).toBeVisible();
      await expect(email.first()).toHaveAttribute('href', `mailto:${SITE.email}`);
    }
  });

  test(`${locale}: the contact heading is present and the follow block is absent`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);

    await expect(
      page.getByRole('heading', { name: dict.social.contact }).first(),
    ).toBeVisible();

    // No published follow platforms, so the whole block — heading included —
    // must leave nothing behind. An empty group that still rendered its title
    // is the failure this is here to catch.
    await expect(page.getByRole('heading', { name: dict.social.follow })).toHaveCount(0);
    for (const key of FOLLOW_KEYS) {
      await expect(
        page.getByRole('link', { name: new RegExp(dict.social.names[key]) }),
      ).toHaveCount(0);
    }
  });
}

test('the phone number keeps its LTR direction inside Arabic', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // <bdi dir="ltr"> is what stops the bidi algorithm reordering the digits
  // against the Arabic label beside them. Assert the isolation is actually on
  // the element, and that the digits read in the stored order.
  const value = page.locator('footer bdi[dir="ltr"]').first();
  await expect(value).toHaveText(new RegExp(`^\\+${SITE.whatsappNumber}$`));
});

test('every follow tile would carry an accessible name', async ({ page }) => {
  await page.goto('/en');
  // Nothing in the follow group is published locally, so this asserts the
  // shape rather than the count: no link anywhere in these blocks may be
  // nameless, which is the failure mode of an icon-only tile.
  for (const region of regions(page)) {
    const nameless = region.locator('a:not([aria-label])').filter({ hasText: '' });
    for (const link of await nameless.all()) {
      const text = ((await link.textContent()) ?? '').trim();
      const label = await link.getAttribute('aria-label');
      expect(text.length > 0 || Boolean(label)).toBe(true);
    }
  }
});
