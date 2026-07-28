import { test, expect } from '@playwright/test';

/**
 * PROTECTED TESTS — do not weaken, skip, or delete.
 *
 * These assert what a browser actually receives, never what a config file
 * declares. Plan 1 declared the full header set in netlify.toml, the config was
 * correct, and every HTML response went out without CSP, Referrer-Policy or
 * Permissions-Policy for the entire life of the branch — because netlify.toml
 * headers reach files the CDN serves and pages come from the Next runtime's
 * function.
 *
 * Nothing local could have caught that: `next start` does not read netlify.toml
 * at all. A deployed response is the only honest gate, so these run against
 * PLAYWRIGHT_BASE_URL and skip otherwise rather than passing vacuously.
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL;

test.describe('delivered security headers', () => {
  test.skip(
    !BASE,
    'set PLAYWRIGHT_BASE_URL to a deployed URL — these cannot be verified locally',
  );

  const DOCUMENTS = ['/ar', '/en', '/fr', '/admin'] as const;

  for (const path of DOCUMENTS) {
    test(`${path} carries the full header set`, async ({ request }) => {
      const response = await request.get(path);
      const headers = response.headers();

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['strict-transport-security']).toMatch(/max-age=\d{7,}/);
      expect(headers['permissions-policy']).toContain('camera=()');
      expect(headers['permissions-policy']).toContain('microphone=()');
      expect(headers['permissions-policy']).toContain('geolocation=()');

      const csp = headers['content-security-policy'] ?? '';
      expect(csp, `${path} sent no CSP`).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  }

  test('/admin is not indexable', async ({ request }) => {
    const response = await request.get('/admin');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  });

  test('static assets stay immutably cached', async ({ request }) => {
    const body = await (await request.get('/ar')).text();
    const asset = body.match(/\/_next\/static\/[^"']+\.js/)?.[0];
    if (!asset) throw new Error('no /_next/static asset referenced in the page HTML');
    const response = await request.get(asset);
    expect(response.headers()['cache-control']).toContain('immutable');
  });

  /**
   * A CSP that blocks the no-flash script is invisible to every assertion
   * above: the header is present and correct-looking, and the only symptom is a
   * flash of the wrong theme on a real visitor's screen. The script sets
   * `color-scheme` on <html> before first paint, so reading it back is proof
   * the policy let it run.
   */
  test('the CSP does not block the no-flash theme script', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (!/content security policy|refused to execute/i.test(text)) return;

      /**
       * A deploy preview injects Netlify's own admin widget, which tries to
       * frame app.netlify.com and is correctly blocked by `frame-ancestors`
       * falling back to `default-src 'self'`. That violation is the policy
       * working, on markup we do not ship — production serves no such frame.
       *
       * Narrow on purpose: only a *framing* violation naming netlify.com is
       * ignored. A blocked script, style or font — including anything from
       * netlify.com — still fails this test.
       */
      const isPreviewFrame = /framing 'https:\/\/[^']*netlify\.com/i.test(text);
      if (!isPreviewFrame) violations.push(text);
    });

    await page.goto('/ar');

    const colorScheme = await page.evaluate(
      () => document.documentElement.style.colorScheme,
    );
    expect(colorScheme).toMatch(/^(dark|light)$/);
    expect(violations).toEqual([]);
  });
});
