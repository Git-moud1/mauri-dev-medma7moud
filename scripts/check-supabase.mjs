// Refuse to start a build that cannot read the content store.
//
//   node scripts/check-supabase.mjs
//
// This exists because of one specific bug. The public pages are statically
// prerendered, so `next build` reads the content store — and the old store,
// Netlify Blobs, had no runtime context inside the build container. Every read
// failed, the reader swallowed the error and returned the bundled catalogue,
// and the deploy shipped static HTML full of the original placeholder content.
// The owner's real edits appeared through ISR and then vanished at the next
// deploy. Nothing in the build log said anything was wrong.
//
// The reader throws now instead of falling back, which would surface that as a
// failed prerender. This check runs first anyway, because a five-line message
// naming the missing variable is worth more than a stack trace from inside a
// React Server Component — and because it catches the case a prerender cannot:
// credentials that connect but read nothing.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Already-set process.env WINS over .env.local.
 *
 * That order is what Netlify needs — its environment variables are exported,
 * and there is no .env.local on the build machine — and it is also what makes
 * this check testable: `$env:SUPABASE_URL='https://bogus.supabase.co'` in front
 * of `npm run build` overrides the real value and the build must fail.
 */
async function loadEnvLocal() {
  let text;
  try {
    text = await readFile(join(root, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

await loadEnvLocal();

/**
 * Print and stop.
 *
 * `process.exitCode` rather than `process.exit()`: killing the process while a
 * fetch is still unwinding crashes the Node runtime on Windows with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and an exit code of
 * -1073740791, which npm reports as a crash rather than a failed check. Setting
 * the code and letting the event loop drain exits 1, cleanly, everywhere.
 */
function refuse(lines) {
  console.error('\n  Build stopped: the content store is not usable.\n');
  for (const line of lines) console.error(`  ${line}`);
  console.error(
    '\n  Building anyway would publish the bundled placeholder catalogue over' +
      '\n  the real content. That is the exact failure this check exists to stop.\n',
  );
  process.exitCode = 1;
}

/**
 * One line out of a PostgrestError, whatever shape it arrived in.
 *
 * Two awkward cases, both seen while testing this check. A rejected API key
 * answers with a bare 401 and no body, so `message` is the empty string. A DNS
 * failure is not thrown — supabase-js catches it and hands back an error object
 * whose `details` is a multi-line stack, which dumped raw buries the one line
 * that identifies the problem. So: first line of each field, deduplicated.
 */
function describe(error) {
  const seen = new Set();
  for (const field of [error.message, error.details, error.hint, error.code]) {
    const line = typeof field === 'string' ? field.split('\n')[0].trim() : '';
    if (line) seen.add(line);
  }
  return seen.size > 0
    ? [...seen].join(' — ')
    : 'no message at all, which is what a rejected API key looks like';
}

/**
 * Never reached the database vs. reached it and was refused. The advice for the
 * two has nothing in common, and printing both lists means the reader has to
 * work out which half applies to them.
 */
function isUnreachable(text) {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up/i.test(
    text,
  );
}

// Wrapped in a function purely so a failed check can `return` — with
// process.exit() gone, the steps below have to stop themselves.
async function check() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return refuse([
      `Missing: ${[!url && 'SUPABASE_URL', !key && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(' and ')}`,
      '',
      'Locally:    copy .env.example to .env.local and fill both in.',
      'On Netlify: Site configuration → Environment variables. Scope them to',
      '            BOTH "Builds" and "Functions" — this check and the prerender',
      '            run in the build, the admin runs in a function.',
    ]);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // A real read, not a ping. "The host resolves" proves nothing: a wrong key, a
  // paused project and a database missing the schema all answer on the socket
  // and all produce a site with no content.
  //
  // `head: true` asks for the count and no rows, so this stays one cheap query
  // no matter how large the catalogue gets.
  let result;
  try {
    result = await supabase.from('projects').select('id', { count: 'exact', head: true });
  } catch (error) {
    // A DNS failure or a dead host rejects rather than returning an error
    // object, and an unhandled rejection here would print a stack trace instead
    // of the three lines below.
    return refuse([
      `Could not reach ${url}`,
      `  ${error instanceof Error ? error.message : String(error)}`,
      '',
      'Check SUPABASE_URL, and that the project still exists.',
    ]);
  }

  if (result.error) {
    const detail = describe(result.error);
    return refuse(
      isUnreachable(detail)
        ? [
            `Could not reach ${url}`,
            `  ${detail}`,
            '',
            'Check SUPABASE_URL for a typo, and that the project still exists',
            'and is not paused — free projects pause when idle.',
          ]
        : [
            `Reading the projects table failed: ${detail}`,
            '',
            'Likely causes, in the order they actually happen:',
            '  - SUPABASE_SECRET_KEY is wrong, or is a publishable key (RLS denies it)',
            '  - supabase/schema.sql was never applied to this project',
          ],
    );
  }

  // An empty table is a valid database and an invalid portfolio. The admin
  // still opens on zero projects — deleting the last one has to be recoverable
  // — but a deploy of a site with nothing in it is never what anyone meant.
  if (!result.count) {
    return refuse([
      'The projects table is empty.',
      '',
      'Run `npm run migrate:supabase` to copy the live catalogue in, or add a',
      'project in /admin first.',
    ]);
  }

  console.log(`Content store reachable — ${result.count} projects.`);
}

await check();
