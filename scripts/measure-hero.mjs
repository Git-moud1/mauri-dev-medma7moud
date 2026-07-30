/**
 * Compares the hero concepts on the numbers that decide between them.
 *
 *   node scripts/measure-hero.mjs measure   # the nine-run table
 *   node scripts/measure-hero.mjs verify    # frame captures + the glow check
 *   node scripts/measure-hero.mjs weight    # per-concept gzipped chunk weight
 *
 * Add `--base=<url>` to measure a deployed target instead of a local build:
 *
 *   node scripts/measure-hero.mjs measure --base=https://deploy-preview-1--medmoudsite.netlify.app
 *
 * Use it whenever the result will sit beside an existing figure, because §11's
 * A1/A2 rows were taken against the deploy preview and a localhost row is not the
 * same measurement: the preview answers through Netlify's edge and its Next
 * runtime function, over real TLS at real RTT, and `next start` has none of that.
 * The target is printed with the table, written into every row of `runs.json` and
 * stamped on the progress log, so a number cannot be quoted without it.
 *
 * With no `--base`, run `npm run build` first. This measures `.next` as it stands
 * and does not build; measuring a stale build is the same class of lie as
 * measuring a stale server, and for the same reason it fails flatteringly.
 *
 * --- Why this script exists at all ------------------------------------------
 *
 * §11 of MIGRATION.md recorded its numbers from an ad-hoc Playwright + CDP probe
 * and then noted the probe "was not kept — a script that only ever answered one
 * question is not worth maintaining". It has now been asked the same question
 * three times, and the second time the answer was wrong in a way a kept script
 * would have prevented: the §11 correction exists because those runs did not warm
 * the URL first. Warming is a property of the harness, not of the operator's
 * memory, so the harness is now a file.
 *
 * --- The conditions, and why each one is fixed ------------------------------
 *
 *   390×844, 4× CPU throttle, slow 4G.  The same cell as §11's corrected table,
 *     so the rows here can be read against it.
 *   Nine runs, medians.  §11 measured run-to-run variance above one second under
 *     identical conditions. Any single-run before/after number here is noise.
 *   Every URL warmed before its first counted run.  This is the §11 correction.
 *   Engagement verified per run.  A run where `data-hero-layer` did not settle on
 *     the concept under test is discarded rather than averaged in — a concept
 *     that silently fell back to the poster would otherwise measure as
 *     spectacularly fast.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { ensurePortFree } from './port.mjs';

const NEXT_BIN = fileURLToPath(
  new URL('../node_modules/next/dist/bin/next', import.meta.url),
);

const MODE = process.argv[2] ?? 'measure';
/*
 * The third positional argument, if there is one — but never a `--flag`. Reading
 * `process.argv[3]` unconditionally made `measure --route=/en` try to create an
 * output directory literally named `--route=/en`.
 */
const OUT_DIR =
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : fileURLToPath(new URL('../.hero-measure', import.meta.url));
/**
 * Where to measure. `--base=https://deploy-preview-1--medmoudsite.netlify.app`
 * targets the deployed preview; with no flag the script owns a local
 * `next start` on PORT, as the other measure scripts do.
 *
 * This exists because a number is only comparable to numbers taken the same way,
 * and §11's A1/A2 rows were taken against the deploy preview. A localhost row and
 * a preview row differ in more than hostname: the preview goes through Netlify's
 * edge, its Next runtime function, real TLS and real RTT, and `next start` has
 * none of that. Putting the two in one table would be the §11 warm/cold mistake
 * in a new costume.
 */
const BASE = arg('base');
const PORT = 3210;
const ORIGIN = BASE ? BASE.replace(/\/$/, '') : `http://localhost:${PORT}`;
const IS_LOCAL = !BASE;
/** Unbuffered progress, one line per completed cell. See the note at its write. */
const PROGRESS_LOG = `${OUT_DIR}/progress.log`;

/** The test viewport, unchanged from every earlier measurement on this site. */
const VIEWPORT = { width: 390, height: 844 };
const DEVICE_SCALE = 2;

/** Lighthouse's "Slow 4G": 1.6 Mbit down, 750 kbit up, 150 ms RTT. */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU_THROTTLE = 4;

const RUNS = 9;

/** How long each frame-time sample runs, at rest and under pointer motion. */
const FRAME_SAMPLE_MS = 1200;

/** Stabilise after the concept has engaged, before frame timing starts. */
const SETTLE_MS = 800;

/**
 * Cap on waiting for a concept to engage. Past this the run is discarded, not
 * counted slow — a concept that never drew is not a concept that drew late.
 */
const ENGAGE_TIMEOUT_MS = 20_000;

/**
 * The cells.
 *
 * `control` is the pre-hero baseline, and it is worth being exact about what it
 * is: the same permalink and the same build, with `prefers-reduced-motion`
 * emulated. That makes the capability probe return `still`, so no concept chunk
 * is ever requested and no canvas is created — the page is the server-rendered
 * poster and nothing else. It is not a checkout of the pre-hero commit, and the
 * difference is that reduced motion also stops the page's CSS animations. Stated
 * here rather than left for the reader to assume.
 */
const CELLS = [
  { id: 'control', query: '', expect: 'still', reducedMotion: 'reduce' },
  { id: 'a1', query: '', expect: 'a1', reducedMotion: 'no-preference' },
  { id: 'a2', query: '?hero=a2', expect: 'a2', reducedMotion: 'no-preference' },
  { id: 'a3', query: '?hero=a3', expect: 'a3', reducedMotion: 'no-preference' },
  {
    id: 'a3-notrail',
    query: '?hero=a3&trail=0',
    expect: 'a3',
    reducedMotion: 'no-preference',
  },
];
const ROUTES = ['/ar', '/en'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads `--name=value` from argv. */
function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ---------------------------------------------------------------- server --- */

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(300);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

let serverStarted = false;

async function startServer() {
  if (!IS_LOCAL) {
    /*
     * A remote target is measured as found. Deliberately no rebuild, no deploy
     * trigger and no cache purge from here: the point of measuring the preview is
     * to measure what a visitor gets, and a script that tampered with it first
     * would be measuring something else. Warming the URL is the harness's job and
     * it still happens, per cell, inside that cell's own browser.
     */
    console.log(`\nMeasuring the deployed target: ${ORIGIN}`);
    await waitForServer(`${ORIGIN}/en`);
    console.log('  reachable\n');
    return;
  }
  console.log(`\nPreparing port ${PORT}…`);
  const killed = await ensurePortFree(PORT);
  if (killed > 0) console.log(`  freed ${killed} stale listener(s)`);
  // node on next's bin script, not npx — see measure-bundle.mjs for the incident.
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
    stdio: 'ignore',
  });
  child.unref();
  serverStarted = true;
  await waitForServer(`${ORIGIN}/en`);
  console.log('  ready\n');
}

async function stopServer() {
  if (!IS_LOCAL || !serverStarted) return;
  try {
    await ensurePortFree(PORT);
  } catch (error) {
    console.error(`Warning: could not free port ${PORT}: ${error.message}`);
  }
}

/**
 * SwiftShader, explicitly.
 *
 * Headless Chromium has no GPU, and without these flags `WebGPURenderer` finds
 * neither a WebGPU adapter nor a usable WebGL2 context and every concept falls
 * back to the poster — which would make A3 measure as the cheapest of the three
 * by never running. The per-run engagement check would catch that, but it is
 * better to make the runs valid than to discard all of them.
 *
 * It also means the frame times below are software-rasterised and are NOT phone
 * GPU numbers. They are comparable *between* the concepts on this machine, which
 * is what the decision needs, and they are not a claim about a real device.
 */
function launchBrowser() {
  return chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
}

/* ----------------------------------------------------------- measurement --- */

/**
 * Instrumentation installed before any page script runs.
 *
 * `buffered: true` on each observer matters: LCP and FCP both fire before an
 * observer registered from an evaluated script would exist, and reading them
 * afterwards without buffering silently yields nothing.
 */
const PROBE = () => {
  window.__probe = { lcp: 0, fcp: 0, longTasks: [], frames: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__probe.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') window.__probe.fcp = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });

  window.__sampleFrames = (ms) =>
    new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      const end = last + ms;
      const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve(deltas);
      };
      requestAnimationFrame(tick);
    });
};

async function newThrottledPage(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile: true,
    hasTouch: true,
    reducedMotion,
    // Fixed rather than left at Playwright's default of `light`. The site's theme
    // follows `prefers-color-scheme`, so leaving it unset measured the light
    // palette — which is not the one the hero is designed in, and not the same
    // one across concepts if a default ever changes.
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.addInitScript(PROBE);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  return { context, page, cdp };
}

/**
 * Total Blocking Time.
 *
 * Summed over long tasks that start after FCP, counting only the part of each
 * beyond 50 ms — the standard definition. The window ends at the last sample
 * taken rather than at TTI, which is not observable from inside the page; that
 * makes this figure slightly *more* pessimistic than Lighthouse's, consistently
 * across every cell, which is the property a comparison needs.
 */
function totalBlockingTime(probe) {
  return probe.longTasks
    .filter((task) => task.start >= probe.fcp)
    .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
}

/**
 * One run. Returns `{ engaged: false }` when the concept did not engage — or when
 * the run failed outright.
 *
 * A transient navigation timeout used to propagate and kill the whole table: nine
 * of ten cells had been measured, and the tenth threw on a 30 s `goto` during its
 * warm-up, which took the process down before any of the completed rows were
 * written to `runs.json`. Discarding the run is the right response and the one the
 * harness already has machinery for — it is exactly what the engagement check does
 * — so an exception now takes the same path a non-engaging run does. If the
 * failure is systematic rather than transient the cell reports 0/9 and says so;
 * if it is transient, eight good runs are not thrown away with it.
 */
async function runOnce(browser, route, cell, { withPointer }) {
  const { context, page } = await newThrottledPage(browser, cell.reducedMotion);
  try {
    return await runOnceIn(page, route, cell, { withPointer });
  } catch (error) {
    return { engaged: false, layer: null, status: 0, error: String(error).slice(0, 120) };
  } finally {
    await context.close();
  }
}

async function runOnceIn(page, route, cell, { withPointer }) {
  {
    /*
     * `domcontentloaded`, not `load`, and this is a 20x difference in wall clock
     * rather than a style preference.
     *
     * `load` waits for every subresource on the page — which on this site means
     * the entire projects grid's imagery, several megabytes of it, none of it
     * above the fold and none of it anything the hero waits for. Over emulated
     * slow 4G that turned a run that should take ten seconds into two minutes,
     * and a full table into several hours. Nothing here reads the `load` event:
     * LCP, FCP and long tasks all arrive through buffered observers, and TTFB
     * comes off the navigation entry.
     */
    const response = await page.goto(`${ORIGIN}${route}${cell.query}`, {
      waitUntil: 'domcontentloaded',
    });
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return { ttfb: nav ? nav.responseStart : 0 };
    });

    /*
     * Wait for the concept to actually engage rather than for a fixed interval.
     *
     * A fixed settle has to be long enough for the slowest cell — A3's 414 KB
     * chunk over slow 4G — which means every other cell pays for it. Waiting on
     * the attribute itself takes exactly as long as each cell needs, and a run
     * that never engages is caught by the check below and discarded rather than
     * averaged in.
     */
    await page
      .locator(`[data-hero-layer="${cell.expect}"]`)
      .waitFor({ timeout: ENGAGE_TIMEOUT_MS })
      .catch(() => {
        // Handled by the engagement check immediately below.
      });
    // A short stabilise so the first drawn frame is not the one that starts the
    // frame-time clock.
    await page.waitForTimeout(SETTLE_MS);

    const layer = await page.locator('[data-hero-layer]').getAttribute('data-hero-layer');
    if (layer !== cell.expect) {
      return { engaged: false, layer, status: response ? response.status() : 0 };
    }

    // Frame time at rest.
    const restFrames = await page.evaluate(
      (ms) => window.__sampleFrames(ms),
      FRAME_SAMPLE_MS,
    );

    /*
     * Frame time under pointer motion.
     *
     * Taken separately and reported separately. The trail is the only part of A3
     * that responds to input, so a median over an idle page misses its cost
     * entirely — the same mistake as the unwarmed URLs in §11, in a different
     * dimension.
     */
    let moveFrames = null;
    if (withPointer) {
      // The duration has to be passed in, not closed over: this arrow is
      // serialised and evaluated in the page, where Node's module scope does not
      // exist. Closing over it throws `FRAME_SAMPLE_MS is not defined` inside the
      // browser, which surfaces as a rejected promise several frames later.
      const sampling = page.evaluate((ms) => window.__sampleFrames(ms), FRAME_SAMPLE_MS);
      const w = VIEWPORT.width;
      const h = VIEWPORT.height;
      await page.mouse.move(w * 0.2, h * 0.7);
      /*
       * Deliberately few steps. Every intermediate point is a separate awaited
       * CDP round trip, and the first version of this loop dispatched 144 of them
       * per run — which on a contended machine became the dominant cost of the
       * measurement rather than a stimulus for it, stretching a 40 s run past four
       * minutes and threatening to time the harness instead of the hero.
       *
       * Nothing is lost: the trail samples the pointer at 30 Hz, so more than a
       * few points per sweep were being coalesced into the same ring-buffer slot
       * anyway.
       */
      for (let i = 0; i < 3; i++) {
        await page.mouse.move(w * 0.85, h * 0.45, { steps: 5 });
        await page.mouse.move(w * 0.2, h * 0.72, { steps: 5 });
      }
      moveFrames = await sampling;
    }

    const probe = await page.evaluate(() => window.__probe);

    return {
      engaged: true,
      lcpMinusTtfb: probe.lcp > 0 ? probe.lcp - timing.ttfb : null,
      tbt: totalBlockingTime(probe),
      restFrameMs: median(restFrames),
      moveFrameMs: moveFrames ? median(moveFrames) : null,
    };
  }
}

/**
 * One browser process per cell, not one for the whole table.
 *
 * A shared browser is a plausible way for earlier cells to leave later ones
 * running on a heavier process — on a software rasteriser the concept canvases
 * are not free to set up and tear down — and the cells run in increasing order of
 * cost, so any such drift would push in the same direction as the effect being
 * measured. Isolating per cell costs about a second of launch each and forecloses
 * the question.
 *
 * **No drift was ever measured.** This guard was added after a run was abandoned
 * on the belief that it had slowed to a crawl, and that belief turned out to be a
 * misreading of a block-buffered progress stream rather than a real effect — see
 * the note at PROGRESS_LOG's write. It stays because it is cheap insurance, not
 * because it fixed something observed. Saying so matters: an unexplained "fix"
 * that is really a superstition is how a harness accumulates ritual.
 *
 * Per *cell* rather than per *run*, deliberately: a fresh browser has a cold HTTP
 * cache, and warming the URL inside it is the whole point of the warm-up
 * navigation. Per-run isolation would throw away the §11 correction to guard
 * against this one.
 */
async function measure() {
  const rows = [];
  mkdirSync(OUT_DIR, { recursive: true });
  /*
   * The target is written into the log and into every row of runs.json, not just
   * into the console banner. A figure that has been copied out of here and into a
   * document has lost its provenance unless the provenance travels with it, and
   * "which URL was this?" is exactly the question that invalidated §11's table.
   */
  appendFileSync(
    PROGRESS_LOG,
    `\n--- run started ${new Date().toISOString()}  target ${ORIGIN} ---\n`,
  );

  {
    /*
     * Optional filters, so one cell can be re-measured without repeating the
     * other nine:  measure-hero.mjs measure --route=/en --cell=a3-notrail
     *
     * Cells are independent by construction — each gets its own browser and warms
     * its own URL — so a single-cell re-run is the same measurement it would have
     * been in sequence. `runs.json` is still overwritten with only what this
     * invocation measured; the surviving rows live in progress.log.
     */
    const routeFilter = arg('route');
    const cellFilter = arg('cell');

    for (const route of ROUTES.filter((r) => !routeFilter || r === routeFilter)) {
      for (const cell of CELLS.filter((c) => !cellFilter || c.id === cellFilter)) {
        const url = `${route}${cell.query}`;
        process.stdout.write(`${url.padEnd(28)} warming…`);

        const browser = await launchBrowser();
        let results;
        let rejected = 0;
        try {
          // The §11 correction, made structural: one throwaway navigation per
          // URL before any counted run, so no measured run pays a cold path.
          // Inside this cell's own browser, so it warms this cell's cache.
          await runOnce(browser, route, cell, { withPointer: false });
          process.stdout.write(' run');

          results = [];
          for (let i = 0; i < RUNS; i++) {
            const result = await runOnce(browser, route, cell, { withPointer: true });
            if (!result.engaged) {
              rejected++;
              process.stdout.write('x');
              continue;
            }
            results.push(result);
            process.stdout.write('.');
          }
        } finally {
          await browser.close();
        }

        const row = {
          target: ORIGIN,
          route,
          cell: cell.id,
          counted: results.length,
          rejected,
          lcpMinusTtfb: median(
            results.map((r) => r.lcpMinusTtfb).filter((v) => v != null),
          ),
          tbt: median(results.map((r) => r.tbt)),
          restFrameMs: median(results.map((r) => r.restFrameMs).filter((v) => v != null)),
          moveFrameMs: median(results.map((r) => r.moveFrameMs).filter((v) => v != null)),
        };
        rows.push(row);
        /*
         * Appended synchronously to a file as well as written to stdout.
         *
         * Node block-buffers stdout when it is a pipe rather than a TTY, so a
         * run redirected to a log shows nothing for minutes and then everything
         * at once — which reads exactly like a hung harness, and cost this
         * session three wrong diagnoses of a run that was progressing normally.
         * `appendFileSync` cannot be buffered away.
         */
        appendFileSync(
          PROGRESS_LOG,
          `${new Date().toISOString()}  ${url}  TBT ${fmt(row.tbt, 0, 'ms')}  ` +
            `LCP-TTFB ${fmt(row.lcpMinusTtfb, 0, 'ms')}  ` +
            `frame ${fmt(row.restFrameMs, 1, 'ms')}/${fmt(row.moveFrameMs, 1, 'ms')}  ` +
            `(${row.counted}/${RUNS})\n`,
        );
        console.log(
          `  LCP−TTFB ${fmt(row.lcpMinusTtfb, 0, 'ms')}  TBT ${fmt(row.tbt, 0, 'ms')}` +
            `  frame rest ${fmt(row.restFrameMs, 1, 'ms')} / moving ${fmt(row.moveFrameMs, 1, 'ms')}` +
            `  (${row.counted}/${RUNS}${rejected ? `, ${rejected} rejected` : ''})`,
        );
      }
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}/runs.json`, JSON.stringify(rows, null, 2));

  console.log(`\n\nAll rows below measured against: ${ORIGIN}`);
  console.log('\n| Route | Cell | LCP−TTFB | TBT | frame @rest | frame @pointer |');
  console.log('| ----- | ---- | -------- | --- | ----------- | -------------- |');
  for (const row of rows) {
    console.log(
      `| \`${row.route}\` | ${row.cell} | ${fmt(row.lcpMinusTtfb, 0, ' ms')} | ` +
        `${fmt(row.tbt, 0, ' ms')} | ${fmt(row.restFrameMs, 1, ' ms')} | ` +
        `${fmt(row.moveFrameMs, 1, ' ms')} |`,
    );
  }
  console.log(`\nwritten to ${OUT_DIR}/runs.json`);
}

function fmt(value, digits, unit) {
  return value == null ? '—' : `${value.toFixed(digits)}${unit}`;
}

/* ---------------------------------------------------------------- weight --- */

/**
 * The gzipped weight of each concept's own chunks, and the first-load JS with
 * every concept lazy.
 *
 * Measured the way a browser sees it: load the page, record which
 * `/_next/static` scripts were actually requested, and gzip each response body
 * locally. The difference between the control's set and a concept's set is that
 * concept's cost — which is the only figure that answers "does the dynamic import
 * leak into the entry chunk", because a leak shows up as the *control* growing,
 * not as the concept shrinking.
 */
async function weigh() {
  const browser = await launchBrowser();
  const sizes = new Map();
  const perCell = new Map();

  try {
    for (const cell of CELLS) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        reducedMotion: cell.reducedMotion,
        // See newThrottledPage: A3 declines the light palette.
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      const requested = new Set();
      page.on('response', (response) => {
        const url = response.url();
        if (
          url.includes('/_next/static/') &&
          url.endsWith('.js') &&
          response.status() === 200
        ) {
          requested.add(url);
        }
      });
      await page.goto(`${ORIGIN}/en${cell.query}`, { waitUntil: 'load' });
      await page.waitForTimeout(3500);
      perCell.set(cell.id, requested);
      await context.close();

      for (const url of requested) {
        if (sizes.has(url)) continue;
        const response = await fetch(url);
        const body = Buffer.from(await response.arrayBuffer());
        sizes.set(url, gzipSync(body, { level: 9 }).byteLength);
      }
    }
  } finally {
    await browser.close();
  }

  const total = (urls) => [...urls].reduce((sum, url) => sum + (sizes.get(url) ?? 0), 0);
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const control = perCell.get('control');

  console.log(`\nGzipped JS actually transferred, /en, per cell — target ${ORIGIN}\n`);
  for (const cell of CELLS) {
    const urls = perCell.get(cell.id);
    const own = [...urls].filter((url) => !control.has(url));
    console.log(
      `  ${cell.id.padEnd(12)} total ${kb(total(urls)).padStart(10)}` +
        `   beyond first-load ${kb(total(own)).padStart(10)}   (${own.length} chunk${own.length === 1 ? '' : 's'})`,
    );
  }
  console.log(
    `\n  first-load JS (control, no concept chunk fetched): ${kb(total(control))}` +
      `\n  A leak of the dynamic import into the entry chunk would show up here,` +
      `\n  as the control growing — not as a concept shrinking.\n`,
  );

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    `${OUT_DIR}/weight.json`,
    JSON.stringify(
      Object.fromEntries(
        CELLS.map((cell) => {
          const urls = perCell.get(cell.id);
          return [
            cell.id,
            {
              totalBytes: total(urls),
              beyondFirstLoadBytes: total([...urls].filter((u) => !control.has(u))),
              chunks: [...urls].map((u) => ({
                url: u.split('/').pop(),
                bytes: sizes.get(u),
              })),
            },
          ];
        }),
      ),
      null,
      2,
    ),
  );
}

/* ---------------------------------------------------------------- verify --- */

const LUMA = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG relative luminance from 0..255 sRGB. */
function relativeLuminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * How far a pixel has to lean blue before it counts as the emitter rather than
 * as the photograph.
 *
 * This threshold is the whole reason the check works. The first version of this
 * function took the brightest pixel on the canvas and reported 255 every time —
 * because the brightest pixel on the canvas is the white card in the app
 * screenshot, not the glow. The base image contains white, orange and green UI
 * and none of it leads blue by 24 counts; the emitter is `--glow-2` renormalised,
 * whose blue channel leads its red by more than 190 before any bloom.
 */
const BLUE_LEAD = 24;

/**
 * Frame captures plus the glow check the palette decision needs.
 *
 * Two questions, with opposite worst cases, so both are asked:
 *
 *   - Clipping, at the *brightest* frame. Two over-unity emitters through one
 *     bloom pass is the named failure mode — the scan line and the trail crossing
 *     and blowing out to a white smear. Measured as the increment in fully
 *     saturated pixels between the trail on and the trail off, so the photo's own
 *     white does not count as clipping.
 *   - The non-text 3:1 floor, at the *dimmest lit* frame. A glow that varies has
 *     to clear the floor at its weakest rather than on average — the same rule
 *     the WhatsApp pill and the floating button were fixed under.
 *
 * Both are measured in the dark palette, which is the one the asset is authored
 * for. A light-theme frame is captured too, and it is captured because A3 has a
 * real limitation there rather than to tick a box: the base image bakes a
 * charcoal backdrop, so unlike A1 — which is procedural and re-reads `--bg` — A3
 * keeps its own dark composition on a light page.
 */
async function verify() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();

  try {
    for (const route of ['/en', '/ar']) {
      const label = route.replace('/', '');
      const trials = [];

      for (const [variant, query] of [
        ['trail', '?hero=a3'],
        ['notrail', '?hero=a3&trail=0'],
      ]) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 840 },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        const problems = [];
        page.on('pageerror', (error) => problems.push(String(error).slice(0, 300)));
        page.on('console', (message) => {
          if (message.type() === 'error') problems.push(message.text().slice(0, 300));
        });

        await page.goto(`${ORIGIN}${route}${query}`, { waitUntil: 'load' });
        await page.waitForTimeout(2000);

        const layer = await page
          .locator('[data-hero-layer]')
          .getAttribute('data-hero-layer');
        const bg = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        );
        const [bgR, bgG, bgB] = bg.split(/\s+/).map(Number);
        const bgLum = relativeLuminance(bgR, bgG, bgB);

        const canvas = page.locator('#top canvas');
        const frames = [];

        // A full scan sweep is ~11 s. Twelve captures ~1 s apart cross it, with
        // the pointer moving throughout so the trail is alive in every one.
        for (let i = 0; i < 12; i++) {
          await page.mouse.move(1120, 620);
          await page.mouse.move(700 + i * 12, 470, { steps: 10 });
          const png = await canvas.screenshot();
          frames.push({ i, ...(await summarise(png)) });
          if (variant === 'trail' && i % 4 === 0) {
            await writeFile(`${OUT_DIR}/a3-${label}-frame${i}.png`, png);
          }
          await page.waitForTimeout(880);
        }

        trials.push({ variant, layer, bg, bgLum, frames, problems });
        await context.close();
      }

      const [withTrail, withoutTrail] = trials;
      const litFrames = withTrail.frames.filter((f) => f.emitterPixels > 200);
      const brightest = withTrail.frames.reduce((a, b) =>
        b.emitterP99 > a.emitterP99 ? b : a,
      );
      const dimmest = litFrames.length
        ? litFrames.reduce((a, b) => (b.emitterP99 < a.emitterP99 ? b : a))
        : brightest;

      const ratio = (frame) => contrastRatio(frame.emitterP99RelLum, withTrail.bgLum);
      const clipIncrement =
        Math.max(...withTrail.frames.map((f) => f.clipped)) -
        Math.max(...withoutTrail.frames.map((f) => f.clipped));

      console.log(
        `\n${route}?hero=a3   layer=${withTrail.layer}   --bg = ${withTrail.bg}`,
      );
      console.log(
        `  emitter pixels, brightest frame  p99 luma ${brightest.emitterP99.toFixed(0)}` +
          `  contrast vs --bg ${ratio(brightest).toFixed(2)}:1`,
      );
      console.log(
        `  emitter pixels, dimmest lit      p99 luma ${dimmest.emitterP99.toFixed(0)}` +
          `  contrast vs --bg ${ratio(dimmest).toFixed(2)}:1` +
          `   ${ratio(dimmest) >= 3 ? 'PASS (>= 3:1)' : 'UNDER 3:1'}`,
      );
      console.log(
        `  saturated pixels: ${(Math.max(...withTrail.frames.map((f) => f.clipped)) * 100).toFixed(3)}%` +
          ` with trail, ${(Math.max(...withoutTrail.frames.map((f) => f.clipped)) * 100).toFixed(3)}% without` +
          `  →  emitters add ${(clipIncrement * 100).toFixed(3)}%`,
      );
      if (clipIncrement > 0.002) {
        console.log(
          `  ! the two emitters are stacking into a white smear.` +
            ` Lower TRAIL_GAIN or raise BLOOM_THRESHOLD.`,
        );
      }
      const problems = [...withTrail.problems, ...withoutTrail.problems];
      if (problems.length) console.log('  console:', problems.slice(0, 4).join(' | '));
    }

    // One light-theme frame, for the record. See the note above this function.
    const lightContext = await browser.newContext({
      viewport: { width: 1280, height: 840 },
      colorScheme: 'light',
    });
    const lightPage = await lightContext.newPage();
    await lightPage.goto(`${ORIGIN}/en?hero=a3`, { waitUntil: 'load' });
    await lightPage.waitForTimeout(2500);
    await writeFile(
      `${OUT_DIR}/a3-en-light-theme.png`,
      await lightPage.locator('#top').screenshot(),
    );
    await lightContext.close();
  } finally {
    await browser.close();
  }
  console.log(`\nframes written to ${OUT_DIR}`);
}

/**
 * Emitter statistics for one captured frame.
 *
 * `emitterP99` is the 99th-percentile luminance *among blue-dominant pixels* —
 * a percentile rather than the maximum, because a single bloomed pixel at the
 * very core of the trail is not what a reader perceives as the glow's
 * brightness, and one outlier would set the whole figure.
 */
async function summarise(png) {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const emitterLuma = [];
  let clipped = 0;
  const pixels = info.width * info.height;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= 254 && g >= 254 && b >= 254) clipped++;
    if (b - Math.max(r, g) >= BLUE_LEAD) emitterLuma.push([LUMA(r, g, b), r, g, b]);
  }

  if (emitterLuma.length === 0) {
    return {
      emitterPixels: 0,
      emitterP99: 0,
      emitterP99RelLum: 0,
      clipped: clipped / pixels,
    };
  }
  emitterLuma.sort((a, b) => a[0] - b[0]);
  const at =
    emitterLuma[Math.min(emitterLuma.length - 1, Math.floor(emitterLuma.length * 0.99))];

  return {
    emitterPixels: emitterLuma.length,
    emitterP99: at[0],
    emitterP99RelLum: relativeLuminance(at[1], at[2], at[3]),
    clipped: clipped / pixels,
  };
}

/* ------------------------------------------------------------------ main --- */

try {
  await startServer();
  if (MODE === 'measure') await measure();
  else if (MODE === 'verify') await verify();
  else if (MODE === 'weight') await weigh();
  else {
    console.error(`Unknown mode "${MODE}". Use: measure | verify | weight`);
    process.exitCode = 1;
  }
} finally {
  await stopServer();
}
