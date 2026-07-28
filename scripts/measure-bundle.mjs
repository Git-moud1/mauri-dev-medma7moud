/**
 * Measures what a browser actually transfers for a first load.
 *
 * Next 16's Turbopack build no longer prints the "First Load JS" column, so
 * bundle-budget checks read the real thing instead: fetch the HTML, pull out
 * every script and font it references, and sum their gzipped transfer sizes.
 * That is closer to the number that matters than the old build-table figure,
 * which counted parsed bytes rather than bytes on the wire.
 *
 * For a localhost target this script OWNS the server: it frees the port, starts
 * `next start` itself, measures, and tears it down. It does not measure against
 * a server it did not start, because a stale one serves an old build's HTML
 * without any outward sign — see scripts/port.mjs for the incident that put
 * this rule here.
 *
 * Usage:
 *   node scripts/measure-bundle.mjs [url]        # default http://localhost:3000/
 *
 * Run `npm run build` first. This script does not build; measuring a stale
 * .next is the same class of lie as measuring a stale server.
 *
 * Budget for plan 1: initial JS <= ~150 KB gzipped (baseline was ~183 KB).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ensurePortFree } from './port.mjs';

const NEXT_BIN = fileURLToPath(
  new URL('../node_modules/next/dist/bin/next', import.meta.url),
);

const target = process.argv[2] ?? 'http://localhost:3000/';
const KB = 1024;
const targetUrl = new URL(target);
const origin = targetUrl.origin;
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(targetUrl.hostname);
const port = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(300);
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

let serverStarted = false;

async function startServer() {
  console.log(`\nPreparing port ${port}…`);
  const killed = await ensurePortFree(port);
  if (killed > 0) {
    console.log(`  freed ${killed} stale listener(s) — they were serving an older build`);
  }

  console.log(`  starting next start -p ${port}`);
  // Spawn node on next's bin script rather than `npx`/`npm`. Node 24 refuses to
  // spawn a .cmd shim without shell: true, and shell: true would put an extra
  // process between us and the listener — which is what made an earlier
  // "stopped" server survive teardown and get measured anyway.
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    stdio: 'ignore',
  });
  child.unref();
  serverStarted = true;
  await waitForServer(target);
  console.log('  ready\n');
}

async function stopServer() {
  if (!serverStarted) return;
  // Reuse the port helper rather than child.kill(): on Windows the spawned
  // shell is not the process holding the port, so killing the child leaves the
  // real listener alive — which is how a "stopped" server survived to be
  // measured once already.
  try {
    await ensurePortFree(port);
  } catch (error) {
    console.error(`Warning: could not free port ${port} on teardown: ${error.message}`);
  }
}

async function main() {
  if (isLocal) await startServer();

  const pageResponse = await fetch(target);
  if (!pageResponse.ok) {
    console.error(`Failed to fetch ${target}: HTTP ${pageResponse.status}`);
    process.exitCode = 1;
    return;
  }
  const html = await pageResponse.text();

  const scripts = unique(html.match(/\/_next\/static\/chunks\/[^"'\\\s]+?\.js/g) ?? []);
  const fonts = unique(html.match(/\/_next\/static\/media\/[^"'\\\s]+?\.woff2/g) ?? []);
  const preloadedFonts = unique(
    [...html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.woff2)"/g)].map(
      (m) => m[1],
    ),
  );

  const scriptSizes = await Promise.all(scripts.map((p) => transferSize(origin + p)));
  const fontSizes = await Promise.all(fonts.map((p) => transferSize(origin + p)));

  const jsTotal = scriptSizes.reduce((sum, r) => sum + r.bytes, 0);
  const fontTotal = fontSizes.reduce((sum, r) => sum + r.bytes, 0);

  const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

  console.log(`Measured: ${target}\n`);
  console.log(`HTML                 ${fmt(Buffer.byteLength(html))}`);
  console.log(`\nJS chunks (${scriptSizes.length})`);
  for (const r of [...scriptSizes].sort((a, b) => b.bytes - a.bytes)) {
    const name = r.url.split('/').pop();
    console.log(
      `  ${fmt(r.bytes).padStart(10)}  ${name}${r.error ? '  [HTTP ' + r.status + ']' : ''}`,
    );
  }
  console.log(`  ${'—'.repeat(10)}`);
  console.log(`  ${fmt(jsTotal).padStart(10)}  TOTAL JS`);

  console.log(
    `\nFonts (${fontSizes.length} referenced, ${preloadedFonts.length} preloaded)`,
  );
  for (const r of [...fontSizes].sort((a, b) => b.bytes - a.bytes)) {
    const name = r.url.split('/').pop();
    const isPreloaded = preloadedFonts.some((f) => r.url.endsWith(f.split('/').pop()));
    console.log(
      `  ${fmt(r.bytes).padStart(10)}  ${name}${isPreloaded ? '  (preloaded)' : ''}`,
    );
  }
  console.log(`  ${'—'.repeat(10)}`);
  console.log(`  ${fmt(fontTotal).padStart(10)}  TOTAL FONTS`);

  /**
   * Any asset the HTML references but the server cannot serve invalidates the
   * whole measurement, and it invalidates it DOWNWARD — a missing chunk is
   * counted as zero bytes, so the total comes out flatteringly low. That is
   * precisely how a stale server produced 181.5 KB against a real 235.6 KB.
   * Fail loudly instead of printing a number that looks like progress.
   */
  const broken = [...scriptSizes, ...fontSizes].filter((r) => r.error);
  if (broken.length > 0) {
    console.error(`\n✗ ${broken.length} referenced asset(s) did not return 200:`);
    for (const r of broken) console.error(`    HTTP ${r.status}  ${r.url}`);
    console.error(
      '\nThe HTML and the assets on disk disagree. Rebuild, and make sure nothing\n' +
        'else is listening on the port. Measurement ABORTED — no number reported.\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nBudget: JS <= 150.0 KB  →  ${jsTotal / KB <= 150 ? 'PASS' : 'OVER'} (${fmt(jsTotal)})\n`,
  );
}

try {
  await main();
} finally {
  await stopServer();
}
