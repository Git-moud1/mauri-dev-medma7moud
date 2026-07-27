/**
 * Measures what a browser actually transfers for a first load.
 *
 * Next 16's Turbopack build no longer prints the "First Load JS" column, so
 * bundle-budget checks read the real thing instead: fetch the HTML, pull out
 * every script and font it references, and sum their gzipped transfer sizes.
 * That is closer to the number that matters than the old build-table figure,
 * which counted parsed bytes rather than bytes on the wire.
 *
 * Usage:
 *   node scripts/measure-bundle.mjs [url]        # default http://localhost:3000/
 *
 * Budget for plan 1: initial JS <= ~150 KB gzipped (baseline was ~183 KB).
 */

import { gzipSync } from 'node:zlib';

const target = process.argv[2] ?? 'http://localhost:3000/';
const KB = 1024;

/**
 * Fetch a URL and return its GZIPPED size.
 *
 * Deliberately compresses the body here rather than trusting the origin's
 * content-length: `next start` serves uncompressed while Netlify serves
 * gzip/brotli, so reading the header would make local and deployed numbers
 * incomparable. Compressing locally makes the figure server-independent.
 */
async function transferSize(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return { url, bytes: 0, status: response.status, error: true };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const bytes = gzipSync(buffer, { level: 9 }).byteLength;
  return { url, bytes, status: response.status, error: false };
}

function unique(values) {
  return [...new Set(values)];
}

const origin = new URL(target).origin;

const pageResponse = await fetch(target);
if (!pageResponse.ok) {
  console.error(`Failed to fetch ${target}: HTTP ${pageResponse.status}`);
  process.exit(1);
}
const html = await pageResponse.text();

const scripts = unique(html.match(/\/_next\/static\/chunks\/[^"'\\\s]+?\.js/g) ?? []);
const fonts = unique(html.match(/\/_next\/static\/media\/[^"'\\\s]+?\.woff2/g) ?? []);
const preloadedFonts = unique(
  [...html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.woff2)"/g)].map((m) => m[1]),
);

const scriptSizes = await Promise.all(scripts.map((p) => transferSize(origin + p)));
const fontSizes = await Promise.all(fonts.map((p) => transferSize(origin + p)));

const jsTotal = scriptSizes.reduce((sum, r) => sum + r.bytes, 0);
const fontTotal = fontSizes.reduce((sum, r) => sum + r.bytes, 0);

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

console.log(`\nMeasured: ${target}\n`);
console.log(`HTML                 ${fmt(Buffer.byteLength(html))}`);
console.log(`\nJS chunks (${scriptSizes.length})`);
for (const r of [...scriptSizes].sort((a, b) => b.bytes - a.bytes)) {
  const name = r.url.split('/').pop();
  console.log(`  ${fmt(r.bytes).padStart(10)}  ${name}${r.error ? '  [HTTP ' + r.status + ']' : ''}`);
}
console.log(`  ${'—'.repeat(10)}`);
console.log(`  ${fmt(jsTotal).padStart(10)}  TOTAL JS`);

console.log(`\nFonts (${fontSizes.length} referenced, ${preloadedFonts.length} preloaded)`);
for (const r of [...fontSizes].sort((a, b) => b.bytes - a.bytes)) {
  const name = r.url.split('/').pop();
  const isPreloaded = preloadedFonts.some((f) => r.url.endsWith(f.split('/').pop()));
  console.log(`  ${fmt(r.bytes).padStart(10)}  ${name}${isPreloaded ? '  (preloaded)' : ''}`);
}
console.log(`  ${'—'.repeat(10)}`);
console.log(`  ${fmt(fontTotal).padStart(10)}  TOTAL FONTS`);

console.log(`\nBudget: JS <= 150.0 KB  →  ${jsTotal / KB <= 150 ? 'PASS' : 'OVER'} (${fmt(jsTotal)})\n`);
