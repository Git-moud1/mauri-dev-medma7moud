// Copy a backup into the STAGING stores (staging-site-content, staging-site-media)
// that deploy previews and branch deploys read — see next.config.mjs.
//
//   npm run seed:staging -- --from <backup dir>
//
// <dir> is a folder written by `npm run backup:blobs` (or the same layout).
//
// Guard rails, because this is the one script in the repo that writes to the
// real site's Blob storage:
//
// - Every store name it writes to is built as `staging-` + name and checked
//   again right before the write. There is no option to change the prefix.
// - It refuses to run if a staging store already holds anything: seeding is a
//   one-time copy, and anything already there is someone's test data.
// - It verifies the backup's SHA256SUMS.txt before writing a single object.
// - Production stores are only ever listed by `backup:blobs`, never here.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PREFIX = 'staging-';
const STORES = ['site-content', 'site-media'];

const fromIndex = process.argv.indexOf('--from');
const from = fromIndex === -1 ? undefined : resolve(process.argv[fromIndex + 1]);
if (!from || !existsSync(join(from, 'SHA256SUMS.txt'))) {
  console.error(
    'Usage: npm run seed:staging -- --from <backup dir containing SHA256SUMS.txt>',
  );
  process.exit(1);
}

// The CLI is a .cmd shim on Windows, so it has to go through a shell. Every
// argument is checked against a strict character set first: store names and
// keys come from this script or from a listing, never from free text.
// Letters, digits, . _ : / \ ~ - and space (Windows paths, escaped file names),
// optionally quoted.
const SAFE = /^"?[A-Za-z0-9._:/\\ ~-]+"?$/;

/** Reverses `toFileName` in backup-blobs.mjs. */
const fromFileName = (name) => decodeURIComponent(name.replace(/~/g, '%'));
function netlify(args) {
  for (const value of args) {
    if (!SAFE.test(value)) throw new Error(`refusing unsafe CLI argument: ${value}`);
  }
  return execSync(['netlify', ...args].join(' '), {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// 1. The backup is intact.
const entries = readFileSync(join(from, 'SHA256SUMS.txt'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [hash, ...rest] = line.split('  ');
    return { hash, path: rest.join('  ') };
  });
for (const { hash, path } of entries) {
  const actual = createHash('sha256')
    .update(readFileSync(join(from, ...path.split('/'))))
    .digest('hex');
  if (actual !== hash) {
    console.error(`Checksum mismatch: ${path}. Nothing was written.`);
    process.exit(1);
  }
}

// 2. The staging stores are empty.
for (const base of STORES) {
  const listed = JSON.parse(netlify(['blobs:list', PREFIX + base, '--json']));
  const count = (listed.blobs ?? listed).length;
  if (count > 0) {
    console.error(
      `${PREFIX}${base} already holds ${count} objects. Nothing was written.`,
    );
    process.exit(1);
  }
}

// 3. Copy.
let written = 0;
for (const { path } of entries) {
  const [base, ...keyParts] = path.split('/');
  if (!STORES.includes(base)) continue; // auth-attempts is not copied
  const store = PREFIX + base;
  if (!store.startsWith(PREFIX) || store === base)
    throw new Error(`refusing to write to ${store}`);
  netlify([
    'blobs:set',
    store,
    `"${keyParts.map(fromFileName).join('/')}"`,
    '--input',
    `"${join(from, ...path.split('/'))}"`,
    '--force',
  ]);
  written++;
}
console.log(
  `${written} objects copied into ${STORES.map((s) => PREFIX + s).join(', ')}.`,
);
