// A Netlify Blobs server on this machine, for `next dev` / `next start` and for
// testing the admin without touching the real site.
//
//   npm run blobs:local                          # serve .blobs-local/ as it is
//   npm run blobs:local -- --seed <dir>          # also copy <dir> in first
//   npm run blobs:local -- --port 8971
//
// <dir> is laid out like a store export:
//   <dir>/site-content/projects.json
//   <dir>/site-content/settings.json
//   <dir>/site-media/<project>/<file>.webp
//
// Seeding NEVER overwrites: every object is written with onlyIfNew, so running
// it twice, or against a store you have been editing, changes nothing that is
// already there.
//
// It prints the NETLIFY_BLOBS_CONTEXT value to start the app with. That
// variable is the only thing the Blobs SDK reads to find a store, and it points
// at 127.0.0.1 — a process started with it cannot reach Netlify.
//
// Store names get the same `local-` prefix a local build compiles in (see
// next.config.mjs), so this serves exactly the names the app will ask for.
import { randomBytes } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';

const root = fileURLToPath(new URL('..', import.meta.url));
const NAMESPACE = 'local-';
const SITE_ID = 'local-site';
const STORES = ['site-content', 'site-media', 'auth-attempts'];

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const port = Number(arg('port') ?? 8971);
const seedDir = arg('seed');
const directory = resolve(arg('dir') ?? join(root, '.blobs-local'));
const token = randomBytes(16).toString('hex');

/**
 * The SDK's bundled server, with one gap closed: its GET answers without an
 * `etag` header (@netlify/blobs 10.7.10, server.js `get`), while its PUT checks
 * `If-Match` against an etag it computes from the file. Netlify's real store
 * returns the etag on reads, and the app refuses to write without one — so
 * without this the local admin could not save at all.
 *
 * The etag added here is the server's own `generateETag`, i.e. the exact value
 * its conditional PUT compares against. Nothing else about the server changes.
 */
class LocalBlobsServer extends BlobsServer {
  async get(req) {
    const res = await super.get(req);
    if (res.status !== 200 || res.headers.has('etag')) return res;

    const url = this.parseAPIRequest(req)?.url ?? new URL(req.url ?? '', this.address);
    const { dataPath, key } = this.getLocalPaths(url);
    if (!dataPath || !key) return res; // a listing, not an object

    const headers = new Headers(res.headers);
    headers.set('etag', await BlobsServer.generateETag(dataPath));
    return new Response(res.body, { status: res.status, headers });
  }
}

const server = new LocalBlobsServer({ directory, port, token, logger: () => {} });
const { port: actualPort } = await server.start();
const url = `http://127.0.0.1:${actualPort}`;

const context = { edgeURL: url, uncachedEdgeURL: url, siteID: SITE_ID, token };
const encoded = Buffer.from(JSON.stringify(context)).toString('base64');

/** Reverses `toFileName` in backup-blobs.mjs. */
const fromFileName = (name) => decodeURIComponent(name.replace(/~/g, '%'));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

if (seedDir) {
  const source = resolve(seedDir);
  for (const name of STORES) {
    const storeDir = join(source, name);
    const exists = await stat(storeDir).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (!exists) continue;

    const store = getStore({
      name: NAMESPACE + name,
      siteID: SITE_ID,
      token,
      edgeURL: url,
      uncachedEdgeURL: url,
    });
    let written = 0;
    let kept = 0;
    for (const file of await walk(storeDir)) {
      // Backups escape each key segment (see toFileName in backup-blobs.mjs).
      const key = relative(storeDir, file).split(sep).map(fromFileName).join('/');
      const bytes = await readFile(file);
      const body = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(body).set(bytes);
      const result = await store.set(key, body, { onlyIfNew: true });
      if (result.modified) written++;
      else kept++;
    }
    console.log(
      `seeded ${NAMESPACE}${name}: ${written} written, ${kept} already present`,
    );
  }
}

console.log(`\nLocal Blobs server: ${url}  (data in ${directory})`);
console.log('Start the app in another terminal with:\n');
console.log(`  NETLIFY_BLOBS_CONTEXT=${encoded} npm run dev\n`);
console.log('Ctrl+C to stop.');
