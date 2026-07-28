/**
 * Measures Cumulative Layout Shift on a scripted scroll through the page.
 *
 * Task 11 defers below-the-fold painting with `content-visibility: auto`, which
 * trades a real risk for the paint saving: if `contain-intrinsic-size` guesses
 * a section's height badly, the scrollbar and everything under it jump when the
 * section is finally rendered. Owner's instruction is explicit — layout shift
 * is not an acceptable price for deferred paint, so the number has to be taken
 * before and after rather than assumed.
 *
 * Reports two figures per route:
 *   - total: every layout-shift entry summed. Catches shifts that Lighthouse's
 *     windowing would discount but a scrolling human still sees.
 *   - worst window: the largest 5s session window with a 1s gap, which is the
 *     definition Core Web Vitals actually scores.
 *
 * Owns the server exactly like measure-bundle.mjs, and for the same reason.
 *
 * Usage:
 *   node scripts/measure-cls.mjs [url ...]     # default /ar and /en on :3000
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { ensurePortFree } from './port.mjs';

const NEXT_BIN = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));

const targets =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['http://localhost:3000/ar', 'http://localhost:3000/en'];

const port = Number(new URL(targets[0]).port || 80);
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(new URL(targets[0]).hostname);

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
  // node on next's bin script, not npx — see measure-bundle.mjs.
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    stdio: 'ignore',
  });
  child.unref();
  serverStarted = true;
  await waitForServer(targets[0]);
  console.log('  ready\n');
}

/**
 * Load the page on a throttled mobile profile, scroll it end to end in
 * viewport-sized steps, and collect every layout shift that was not the result
 * of user input. The scroll is what exercises `content-visibility`: a section
 * only renders when it approaches the viewport, and that is the moment a bad
 * `contain-intrinsic-size` estimate shows up as a jump.
 */
async function measure(browser, url) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__shifts.push({ value: entry.value, time: entry.startTime });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(url, { waitUntil: 'load' });

  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y += window.innerHeight;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 250);
        else setTimeout(resolve, 1000);
      };
      step();
    });
  });

  const shifts = await page.evaluate(() => window.__shifts ?? []);
  await context.close();

  const total = shifts.reduce((sum, s) => sum + s.value, 0);

  // Core Web Vitals session window: entries at most 1s apart, window capped at
  // 5s. The score is the largest such window, not the sum.
  let worst = 0;
  let windowValue = 0;
  let windowStart = 0;
  let previous = 0;
  for (const shift of shifts) {
    if (windowValue > 0 && (shift.time - previous > 1000 || shift.time - windowStart > 5000)) {
      windowValue = 0;
      windowStart = shift.time;
    }
    if (windowValue === 0) windowStart = shift.time;
    windowValue += shift.value;
    previous = shift.time;
    worst = Math.max(worst, windowValue);
  }

  return { url, total, worst, count: shifts.length };
}

async function main() {
  if (isLocal) await startServer();

  const browser = await chromium.launch();
  const results = [];
  for (const url of targets) {
    results.push(await measure(browser, url));
  }
  await browser.close();

  console.log('CLS (mobile profile, full-page scroll)\n');
  for (const r of results) {
    console.log(
      `  ${r.url}\n` +
        `    worst 5s window  ${r.worst.toFixed(4)}   ${r.worst < 0.05 ? 'OK' : 'OVER BUDGET (0.05)'}\n` +
        `    total shift      ${r.total.toFixed(4)}   (${r.count} entries)\n`,
    );
  }
}

try {
  await main();
} finally {
  if (serverStarted) {
    try {
      await ensurePortFree(port);
    } catch (error) {
      console.error(`Warning: could not free port ${port} on teardown: ${error.message}`);
    }
  }
}
