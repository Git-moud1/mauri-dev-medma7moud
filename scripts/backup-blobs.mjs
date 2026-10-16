// Read-only backup of the site's Netlify Blob stores to a local folder.
//
//   npm run backup:blobs                         # production stores
//   npm run backup:blobs -- --out <dir>          # default: ../MYW1-backups/<date>
//   npm run backup:blobs -- --prefix staging-    # the preview stores instead
//
// Uses the Netlify CLI on this machine (`netlify login`, linked to the site),
// and only its `blobs:list` and `blobs:get` commands — nothing here can write
// to, or delete from, a store.
//
// The output is laid out exactly like `npm run blobs:local -- --seed <dir>`
// expects, so a backup can be served locally to check it, or used to seed a
// staging store, without conversion. A SHA256SUMS.txt is written last; a backup
// without it did not finish.
//
// The folder holds everything the admin manages, including the failed-login
// records, so keep it private. It is deliberately NOT inside the repository.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const prefix = arg('prefix') ?? '';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(
  arg('out') ?? join(root, '..', 'MYW1-backups', `${prefix || 'production-'}${stamp}`),
);
if (existsSync(out)) {
  console.error(`${out} already exists — refusing to write into an existing backup.`);
  process.exit(1);
}

// The CLI is a .cmd shim on Windows, so it has to go through a shell. Every
// argument is checked against a strict character set first: store names and
// keys come from this script or from a listing, never from free text.
// Letters, digits, . _ : / \ ~ - and space (Windows paths, escaped file names),
// optionally quoted.
const SAFE = /^"?[A-Za-z0-9._:/\\ ~-]+"?$/;
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

/**
 * Key segment → file name. Windows forbids `:` and friends in file names, so a
 * segment is percent-encoded with `~` in place of `%` (`%` would be expanded by
 * cmd.exe, and app keys never contain `~`). Plain keys come out unchanged.
 * Reversed by `fromFileName` in local-blobs.mjs and seed-staging-blobs.mjs.
 */
const toFileName = (segment) => encodeURIComponent(segment).replace(/%/g, '~');

const STORES = [
  'site-content',
  'site-media',
  'auth-attempts',
  'admin-auth',
  'contact-messages',
];
let total = 0;
for (const base of STORES) {
  const store = prefix + base;
  const listed = JSON.parse(netlify(['blobs:list', store, '--json']));
  const keys = (listed.blobs ?? listed).map((blob) => blob.key);
  for (const key of keys) {
    // Each segment escaped on disk (toFileName): keys such as `quota:contact-ip:1.2.3.4`
    // contain characters Windows forbids in file names. Plain keys are unchanged.
    const target = join(out, base, ...key.split('/').map(toFileName));
    mkdirSync(dirname(target), { recursive: true });
    netlify(['blobs:get', store, `"${key}"`, '--output', `"${target}"`]);
    total++;
  }
  console.log(`${store}: ${keys.length} objects`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const lines = walk(out)
  .sort()
  .map(
    (file) =>
      `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${relative(out, file).split(sep).join('/')}`,
  );
writeFileSync(join(out, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`\n${total} objects → ${out}`);
