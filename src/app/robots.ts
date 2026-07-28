import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * `/admin` is disallowed here as well as carrying `noindex` headers and route
 * metadata. Belt and braces: robots.txt is advisory and only stops well-behaved
 * crawlers from fetching, while the header is what stops a page that was
 * fetched anyway from being indexed.
 *
 * `sitemap.xml` itself lands in plan 3; pointing at it now costs nothing and
 * saves editing this file twice.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
