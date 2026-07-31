import { test, expect, type APIRequestContext } from '@playwright/test';
import { LOCALES } from '../src/i18n/config';

/**
 * The SEO surface, asserted against what the server actually sends.
 *
 * Every claim here has failed silently at least once in some project: a
 * sitemap advertised in robots.txt that 404s, an `og:image` URL that resolves
 * to an error page, a JSON-LD block that is valid HTML and invalid JSON. None
 * of it is visible on the rendered page, so nobody notices until a share link
 * renders bare or Search Console reports the property unverified.
 *
 * They run against `next start` locally and against a deploy when
 * `PLAYWRIGHT_BASE_URL` is set — unlike the header suite, none of it depends on
 * the CDN, so both are honest.
 */

/** The <head> is identical for both projects, so one pass over it is enough. */
test.describe.configure({ mode: 'parallel' });

async function head(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path);
  expect(response.status(), `${path} did not return 200`).toBe(200);
  return await response.text();
}

function attribute(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1];
}

/**
 * The value, or a failure naming what was missing.
 *
 * `expect(...).toBeTruthy()` asserts but does not narrow, so every use of a
 * matched value afterwards would need a non-null assertion — which this repo's
 * lint config forbids, and rightly: the assertion would be the second place
 * that has to stay in step with the first.
 */
function required(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Expected the document to carry ${what}.`);
  return value;
}

test.describe('sitemap', () => {
  test('robots.txt points at a sitemap that exists', async ({ request }) => {
    const robots = await head(request, '/robots.txt');
    const advertised = required(
      attribute(robots, /Sitemap:\s*(\S+)/),
      'a Sitemap line in robots.txt',
    );

    // The path, not the origin: locally the origin in the file is the
    // production one, and the point of the assertion is that the URL resolves.
    const response = await request.get(new URL(advertised).pathname);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
  });

  test('every public route is listed once, with its alternates', async ({ request }) => {
    const xml = await head(request, '/sitemap.xml');
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    );

    // Two routes per locale: the homepage and the catalogue.
    expect(locations).toHaveLength(LOCALES.length * 2);
    expect(new Set(locations).size, 'a URL is listed twice').toBe(locations.length);

    for (const locale of LOCALES) {
      expect(locations.some((url) => url.endsWith(`/${locale}`))).toBe(true);
      expect(locations.some((url) => url.endsWith(`/${locale}/projects`))).toBe(true);
      expect(xml).toContain(`hreflang="${locale}"`);
    }
    expect(xml).toContain('hreflang="x-default"');
  });
});

test.describe('tab icon', () => {
  for (const path of ['/icon.png', '/apple-icon.png']) {
    test(`${path} is served as a PNG`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
      // A stub or an error page would still be a 200 with the wrong body.
      expect((await response.body()).byteLength).toBeGreaterThan(1000);
    });
  }

  test('the document links the icon', async ({ request }) => {
    const html = await head(request, '/en');
    expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/icon\.png/);
  });
});

for (const locale of LOCALES) {
  test.describe(`/${locale} share metadata`, () => {
    test('declares a card, and the card renders', async ({ request }) => {
      const html = await head(request, `/${locale}`);

      expect(attribute(html, /property="og:type" content="([^"]+)"/)).toBe('website');
      expect(attribute(html, /name="twitter:card" content="([^"]+)"/)).toBe(
        'summary_large_image',
      );
      expect(attribute(html, /property="og:title" content="([^"]+)"/)).toBeTruthy();
      expect(attribute(html, /property="og:description" content="([^"]+)"/)).toBeTruthy();
      expect(attribute(html, /property="og:image:width" content="([^"]+)"/)).toBe('1200');
      expect(attribute(html, /property="og:image:height" content="([^"]+)"/)).toBe('630');

      const image = new URL(
        required(attribute(html, /property="og:image" content="([^"]+)"/), 'an og:image'),
      );

      // The whole point of the file convention is that this URL is real.
      const card = await request.get(image.pathname + image.search);
      expect(card.status(), `${image.href} did not render`).toBe(200);
      expect(card.headers()['content-type']).toContain('image/png');

      required(
        attribute(html, /name="twitter:image" content="([^"]+)"/),
        'a twitter:image',
      );
    });

    test('publishes a structured-data graph that parses', async ({ request }) => {
      const html = await head(request, `/${locale}`);
      const block = required(
        attribute(html, /<script type="application\/ld\+json">(.*?)<\/script>/s),
        'an ld+json block',
      );

      // JSON.parse is the assertion: a consumer that cannot parse it treats the
      // page as having no structured data at all.
      const graph = JSON.parse(block) as {
        '@context': string;
        '@graph': { '@type': string; itemListElement?: unknown[] }[];
      };
      expect(graph['@context']).toBe('https://schema.org');

      const types = graph['@graph'].map((node) => node['@type']);
      expect(types).toContain('Person');
      expect(types).toContain('WebSite');
      expect(types).toContain('ProfessionalService');
      expect(types).toContain('ItemList');

      // The list describes the grid on the page, so it cannot be empty.
      const list = graph['@graph'].find((node) => node['@type'] === 'ItemList');
      expect(list?.itemListElement?.length ?? 0).toBeGreaterThan(0);
    });
  });
}

test('the catalogue page carries its own card copy, not the homepage’s', async ({
  request,
}) => {
  const home = await head(request, '/en');
  const catalogue = await head(request, '/en/projects');

  const title = (html: string) =>
    attribute(html, /property="og:title" content="([^"]+)"/);
  expect(title(catalogue)).toBeTruthy();
  expect(title(catalogue)).not.toBe(title(home));

  // The image is inherited on purpose — one card per locale, not per page.
  const image = (html: string) =>
    attribute(html, /property="og:image" content="([^"]+)"/);
  expect(image(catalogue)).toBeTruthy();
});
