/**
 * Security headers.
 *
 * These live here rather than in netlify.toml, and that is not a style choice.
 * netlify.toml `[[headers]]` are applied by the CDN to files it serves; HTML
 * documents come from the Next.js runtime's function, which bypasses them
 * entirely. Verified on deploy-preview-1: with the identical rule set in
 * netlify.toml, `/_next/static/*` carried every header and `/ar` carried none
 * of them except the `nosniff` and HSTS that Netlify adds by itself.
 *
 * `headers()` is served by the framework, so it reaches the document responses
 * that actually matter. netlify.toml keeps the immutable cache rules, which it
 * does apply correctly.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/**
 * `script-src` carries 'unsafe-inline' on public routes. This is measured, not
 * lazy.
 *
 * A statically prerendered route emits 22 inline scripts — 21 of them Next's
 * own RSC flight payload — and a browser ignores 'unsafe-inline' the moment any
 * hash or nonce is present. So hashing only the no-flash script would block the
 * other 21 and the page would never hydrate. A nonce has to be minted per
 * request, which forfeits the static prerendering the whole architecture exists
 * to produce.
 *
 * /admin is the opposite case: dynamic by nature, and the surface worth
 * spending strictness on because a session cookie lives there. It gets its own
 * policy below with no 'unsafe-inline' at all.
 *
 * Everything else is strict on both: no framing, no third-party connections,
 * no plugins, no base-tag hijacking, forms submit to this origin only.
 */
const CSP_SHARED = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

const PUBLIC_CSP = ["script-src 'self' 'unsafe-inline'", ...CSP_SHARED].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Next 16 defaults images.qualities to [75] and returns 400 for a direct
    // API request with an unlisted quality. The project renders cards at 70,
    // the lightbox stage at 78, and thumbnails at 55.
    qualities: [55, 70, 75, 78],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: PUBLIC_CSP },
        ],
      },
      {
        // Belt and braces alongside the route's own `robots` metadata: a header
        // is honoured for non-HTML responses and by crawlers that never parse
        // the document.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
