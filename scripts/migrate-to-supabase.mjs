// One-way copy of the live content store from Netlify Blobs into Supabase.
//
//   node scripts/migrate-to-supabase.mjs --dry-run   # read and report, write nothing
//   node scripts/migrate-to-supabase.mjs             # copy for real
//
// Two properties this script is built around, both of which the rollback plan
// depends on:
//
//   1. It NEVER writes to or deletes from Netlify Blobs. Every Blobs call here
//      is a read. The old store stays a complete, untouched copy of the data
//      for as long as you leave it there, so rolling back is `git revert` plus
//      a redeploy — no data step at all.
//
//   2. It is idempotent. Rows are upserted by primary key and objects are
//      uploaded with upsert:true under content-addressed keys, so a re-run
//      converges on the same state instead of duplicating anything. A run that
//      dies halfway is fixed by running it again.
//
// Prerequisites: supabase/schema.sql applied, and the four variables below
// present in .env.local.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));

const CONTENT_STORE = 'site-content';
const MEDIA_STORE = 'site-media';
const PROJECTS_KEY = 'projects.json';
const SETTINGS_KEY = 'settings.json';
const BUCKET = 'site-media';

const DRY_RUN = process.argv.includes('--dry-run');

/** Collected and printed at the end, so one run reports every problem it saw. */
const problems = [];
const fail = (message) => problems.push(message);

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Read .env.local without a dependency.
 *
 * Already-set process.env wins, so CI or a shell export can override the file.
 * Values are taken literally: no $-expansion, which matters because
 * ADMIN_PASSWORD_HASH in the same file is an argon2 string full of $-signs and
 * a naive expander eats it.
 */
async function loadEnvLocal() {
  let text;
  try {
    text = await readFile(join(root, '.env.local'), 'utf8');
  } catch {
    return; // Absent is fine if the variables are already exported.
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

const REQUIRED = [
  ['NETLIFY_SITE_ID', 'Netlify site ID — Site configuration → General → Site ID'],
  ['NETLIFY_AUTH_TOKEN', 'Netlify personal access token — User settings → Applications'],
  ['SUPABASE_URL', 'https://<ref>.supabase.co'],
  ['SUPABASE_SECRET_KEY', 'sb_secret_… — Project Settings → API keys'],
];

const missing = REQUIRED.filter(([name]) => !process.env[name]);
if (missing.length > 0) {
  console.error('Missing from .env.local:\n');
  for (const [name, hint] of missing) console.error(`  ${name}   ${hint}`);
  console.error('\nNothing was read or written.');
  process.exit(1);
}

// The two Netlify values are only needed to reach Blobs from outside a Netlify
// runtime; `getStore` picks them up automatically inside one, and nowhere else.
const blobCredentials = {
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN,
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

console.log(DRY_RUN ? '── DRY RUN — nothing will be written ──\n' : '── MIGRATING ──\n');

// ---------------------------------------------------------------------------
// Step 1 — read the content blobs
// ---------------------------------------------------------------------------

const contentStore = getStore({ name: CONTENT_STORE, ...blobCredentials });

let storedProjects;
let storedSettings;
try {
  [storedProjects, storedSettings] = await Promise.all([
    contentStore.get(PROJECTS_KEY, { type: 'json' }),
    contentStore.get(SETTINGS_KEY, { type: 'json' }),
  ]);
} catch (error) {
  console.error(`Could not read ${CONTENT_STORE}: ${error.message}`);
  console.error('Check NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN. Nothing was written.');
  process.exit(1);
}

// The whole point of the migration is the data that is already there. Seeding
// from the bundled catalogue instead would silently produce the exact "reverted
// to original content" state this project is migrating away from, so an empty
// store stops the run rather than being papered over.
if (!Array.isArray(storedProjects) || storedProjects.length === 0) {
  console.error(`${CONTENT_STORE}/${PROJECTS_KEY} is missing or empty.`);
  console.error('Expected the live catalogue. Refusing to migrate nothing.');
  process.exit(1);
}

console.log(
  `Read ${storedProjects.length} projects and ${storedSettings ? '1' : '0'} settings blob.`,
);

// ---------------------------------------------------------------------------
// Step 2 — shape the rows
// ---------------------------------------------------------------------------

const LOCALES = ['ar', 'en', 'fr'];

/** Structural check mirroring projectSchema, so a bad row names itself here
 *  rather than surfacing as a Postgres constraint violation with no context. */
function checkProject(project, index) {
  const where = `projects[${index}] (${project?.id ?? 'no id'})`;
  if (typeof project?.id !== 'string' || !/^[a-z0-9-]+$/.test(project.id)) {
    fail(`${where}: id is missing or not a slug`);
  }
  for (const field of ['title', 'description']) {
    for (const locale of LOCALES) {
      if (!project?.[field]?.[locale]) fail(`${where}: ${field}.${locale} is empty`);
    }
  }
  if (!['web', 'app'].includes(project?.category)) fail(`${where}: bad category`);
  if (!['phone', 'browser'].includes(project?.frame ?? 'browser')) {
    fail(`${where}: bad frame`);
  }
  if (!project?.cover) fail(`${where}: no cover`);
  if (!Array.isArray(project?.images)) fail(`${where}: images is not an array`);
  if (project?.link && !String(project.link).startsWith('https://')) {
    fail(`${where}: link is not https`);
  }
}

storedProjects.forEach(checkProject);

// Stop here rather than letting a bad row ride along to the batch upsert, where
// it would come back as a Postgres constraint violation naming the constraint
// instead of the project.
if (problems.length > 0) report();

const projectRows = storedProjects.map((project, index) => ({
  id: project.id,
  // Array index IS the display order in the blob format — same rule the store
  // used, now made explicit.
  position: index,
  title: project.title,
  description: project.description,
  category: project.category,
  frame: project.frame ?? 'browser',
  cover: project.cover,
  images: project.images ?? [],
  // '' and undefined both mean "no live link"; NULL is how that is spelled here.
  link: project.link ? project.link : null,
  blur_data_url: project.blurDataURL ?? null,
}));

/**
 * `whatsappUrl` is dropped on the way past, deliberately.
 *
 * settingsSchema is an object with a .transform(), and saveSettings stored the
 * transform's OUTPUT — so the blob contains the derived URL alongside the
 * number it was derived from. The table stores the input shape only. Carrying
 * the derived field across would reintroduce the two-fields-one-number drift
 * the schema comment rules out.
 */
const settingsRow = {
  id: 1,
  whatsapp_number: storedSettings?.whatsappNumber ?? null,
  email: storedSettings?.email ?? null,
  socials: storedSettings?.socials ?? {},
  hero_stats: storedSettings?.heroStats ?? { years: 0, projects: 0, stacks: 0 },
  available_for_work: storedSettings?.availableForWork ?? true,
};

if (!storedSettings) {
  console.warn(
    `No ${SETTINGS_KEY} in the store — writing defaults for the singleton row.`,
  );
}

// ---------------------------------------------------------------------------
// Step 3 — enumerate the media blobs
// ---------------------------------------------------------------------------

const mediaStore = getStore({ name: MEDIA_STORE, ...blobCredentials });

const mediaKeys = [];
try {
  for await (const page of mediaStore.list({ paginate: true })) {
    for (const blob of page.blobs) mediaKeys.push(blob.key);
  }
} catch (error) {
  console.error(`Could not list ${MEDIA_STORE}: ${error.message}`);
  console.error('Nothing was written.');
  process.exit(1);
}
mediaKeys.sort();

console.log(`Found ${mediaKeys.length} media objects in ${MEDIA_STORE}.`);

// Cross-check: every /api/media/<key> path referenced by a project must exist
// as an object. A cover pointing at a key that was never stored is already
// broken today, and it is far cheaper to learn that here than after cutover.
const referenced = new Set();
for (const project of storedProjects) {
  for (const path of [project.cover, ...(project.images ?? [])]) {
    if (typeof path === 'string' && path.startsWith('/api/media/')) {
      referenced.add(path.slice('/api/media/'.length));
    }
  }
}
const stored = new Set(mediaKeys);
for (const key of referenced) {
  if (!stored.has(key))
    fail(`referenced by a project but absent from ${MEDIA_STORE}: ${key}`);
}
const orphans = mediaKeys.filter((key) => !referenced.has(key));
if (orphans.length > 0) {
  // Not an error: uploads land in the store before the project is saved, and
  // only the widest width is ever referenced. Reported so the count is not a
  // surprise, and migrated regardless — a copy is not the place to prune.
  console.log(`  (${orphans.length} not referenced by any project — copied anyway)`);
}

if (DRY_RUN) {
  console.log('\n── DRY RUN SUMMARY ──');
  console.log(`  projects:      ${projectRows.length} rows`);
  console.log(`  settings:      1 row`);
  console.log(`  media objects: ${mediaKeys.length}`);
  console.log(`  referenced:    ${referenced.size}`);
  report();
}

// ---------------------------------------------------------------------------
// Step 4 — bucket
// ---------------------------------------------------------------------------

const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) {
  console.error(`Could not reach Supabase Storage: ${bucketsError.message}`);
  process.exit(1);
}

if (!buckets.some((bucket) => bucket.name === BUCKET)) {
  // Private: /api/media reads it server-side with the secret key and proxies
  // the bytes, so nothing in a browser ever needs direct access.
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ['image/webp'],
  });
  if (error) {
    console.error(`Could not create the ${BUCKET} bucket: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created private bucket ${BUCKET}.`);
} else {
  console.log(`Bucket ${BUCKET} already exists.`);
}

// ---------------------------------------------------------------------------
// Step 5 — copy the media, key for key
// ---------------------------------------------------------------------------
//
// Storage object paths are byte-identical to the blob keys. That is the whole
// reason /api/media/<key> can stay a proxy: every path already stored inside
// projects.json keeps resolving, so no content data is rewritten and the CSP
// stays `img-src 'self'`.

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** key -> { bytes, digest } for the verification pass. */
const sourceDigests = new Map();
let copied = 0;

for (const key of mediaKeys) {
  let source;
  try {
    const arrayBuffer = await mediaStore.get(key, { type: 'arrayBuffer' });
    source = Buffer.from(arrayBuffer);
  } catch (error) {
    fail(`could not read ${key} from Blobs: ${error.message}`);
    continue;
  }

  // The failure this catches actually happened in this codebase: a
  // SharedArrayBuffer fell through `store.set`'s type branches and 26 bytes of
  // the text "[object SharedArrayBuffer]" were written under a media key while
  // the upload reported success. Anything that small is not an image.
  //
  // Whether that is fatal depends entirely on whether anything points at it.
  // A corrupt object a project renders is a broken image on the live site and
  // has to stop the run. A corrupt ORPHAN is debris from a project that was
  // already deleted — it renders nowhere, and failing the migration over it
  // would mean the run can never go green without editing the old store, which
  // this script is built never to touch.
  if (source.byteLength < 100) {
    const message = `${key} is only ${source.byteLength} bytes in Blobs — corrupt at the source, not copied`;
    if (referenced.has(key)) {
      fail(`${message} — and a project references it`);
    } else {
      console.warn(`  skipped: ${message} (orphan, referenced by nothing)`);
    }
    continue;
  }

  sourceDigests.set(key, { bytes: source.byteLength, digest: sha(source) });

  // supabase-js accepts a Node Buffer directly — the storage server takes
  // binary bodies, which is why the ArrayBuffer dance Netlify Blobs needed
  // (src/lib/images/process.ts toArrayBuffer) has no equivalent here.
  const { error } = await supabase.storage.from(BUCKET).upload(key, source, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: true,
  });

  if (error) {
    fail(`upload failed for ${key}: ${error.message}`);
    continue;
  }

  copied += 1;
  if (copied % 10 === 0) console.log(`  ${copied}/${mediaKeys.length} objects…`);
}

console.log(`Copied ${copied}/${mediaKeys.length} media objects.`);

// ---------------------------------------------------------------------------
// Step 6 — write the rows
// ---------------------------------------------------------------------------

const { error: projectsError } = await supabase
  .from('projects')
  .upsert(projectRows, { onConflict: 'id' });
if (projectsError) {
  fail(`projects upsert failed: ${projectsError.message}`);
} else {
  console.log(`Upserted ${projectRows.length} project rows.`);
}

const { error: settingsError } = await supabase
  .from('site_settings')
  .upsert(settingsRow, { onConflict: 'id' });
if (settingsError) {
  fail(`settings upsert failed: ${settingsError.message}`);
} else {
  console.log('Upserted the settings row.');
}

// ---------------------------------------------------------------------------
// Step 7 — verify what actually landed
// ---------------------------------------------------------------------------
//
// Read back rather than trusting the write calls. The corruption this project
// has already survived once was a write that returned success and stored the
// wrong bytes, so "no error" is not evidence of anything.

console.log('\nVerifying…');

/**
 * Stable JSON for comparing a jsonb column against what was sent.
 *
 * jsonb does not store object key order — it normalises keys by length, then
 * bytewise. So `{years, projects, stacks}` comes back as `{years, stacks,
 * projects}`, and a plain JSON.stringify comparison would report a round-trip
 * failure on a migration that copied every byte correctly. Sorting the keys on
 * both sides compares the values, which is the thing that actually matters.
 *
 * Arrays are left alone: jsonb preserves array order, and `images` is an
 * ordered list where a reordering WOULD be a real failure.
 */
const canonical = (value) =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((key) => [key, inner[key]]),
        )
      : inner,
  );

const { data: readBack, error: readBackError } = await supabase
  .from('projects')
  .select('*')
  .order('position');

if (readBackError) {
  fail(`could not read projects back: ${readBackError.message}`);
} else {
  if (readBack.length !== projectRows.length) {
    fail(`row count mismatch: wrote ${projectRows.length}, read ${readBack.length}`);
  }
  for (const [index, expected] of projectRows.entries()) {
    const actual = readBack[index];
    if (!actual) {
      fail(`row ${index} (${expected.id}) is missing after write`);
      continue;
    }
    if (actual.id !== expected.id) {
      fail(
        `position ${index}: expected ${expected.id}, got ${actual.id} — order not preserved`,
      );
    }
    for (const field of ['title', 'description', 'images']) {
      if (canonical(actual[field]) !== canonical(expected[field])) {
        fail(`${expected.id}: ${field} does not round-trip`);
      }
    }
    for (const field of ['category', 'frame', 'cover', 'link', 'blur_data_url']) {
      if ((actual[field] ?? null) !== (expected[field] ?? null)) {
        fail(`${expected.id}: ${field} does not round-trip`);
      }
    }
  }
  console.log(`  projects: ${readBack.length} rows, order and fields match`);
}

const { data: settingsBack, error: settingsBackError } = await supabase
  .from('site_settings')
  .select('*')
  .eq('id', 1)
  .maybeSingle();

if (settingsBackError || !settingsBack) {
  fail(`could not read the settings row back: ${settingsBackError?.message ?? 'no row'}`);
} else {
  for (const field of ['whatsapp_number', 'email', 'available_for_work']) {
    if ((settingsBack[field] ?? null) !== (settingsRow[field] ?? null)) {
      fail(`settings.${field} does not round-trip`);
    }
  }
  for (const field of ['socials', 'hero_stats']) {
    if (canonical(settingsBack[field]) !== canonical(settingsRow[field])) {
      fail(`settings.${field} does not round-trip`);
    }
  }
  console.log('  settings: 1 row, fields match');
}

// Every object: exists, and the bytes are identical to the source. A hash
// comparison rather than a size comparison, because the corruption mode this
// codebase has seen produced a *different* payload, not a truncated one.
let verified = 0;
for (const [key, expected] of sourceDigests) {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) {
    fail(`${key} is not readable from Supabase Storage: ${error?.message ?? 'no data'}`);
    continue;
  }
  const copiedBuffer = Buffer.from(await data.arrayBuffer());
  if (copiedBuffer.byteLength !== expected.bytes) {
    fail(
      `${key}: ${expected.bytes} bytes in Blobs, ${copiedBuffer.byteLength} in Supabase`,
    );
    continue;
  }
  if (sha(copiedBuffer) !== expected.digest) {
    fail(`${key}: bytes differ between Blobs and Supabase`);
    continue;
  }
  verified += 1;
}
console.log(`  media: ${verified}/${sourceDigests.size} objects byte-identical`);

// One real decode, so the run proves the copies are still images rather than
// merely the right number of bytes.
const spotKey = [...sourceDigests.keys()][Math.floor(Math.random() * sourceDigests.size)];
if (spotKey) {
  const { data, error } = await supabase.storage.from(BUCKET).download(spotKey);
  if (error || !data) {
    fail(`spot check could not download ${spotKey}`);
  } else {
    try {
      const meta = await sharp(Buffer.from(await data.arrayBuffer())).metadata();
      if (meta.format !== 'webp' || !meta.width) {
        fail(`spot check: ${spotKey} did not decode as WebP`);
      } else {
        console.log(
          `  spot check: ${spotKey} decodes as ${meta.width}×${meta.height} webp`,
        );
      }
    } catch (error) {
      fail(`spot check: ${spotKey} could not be decoded — ${error.message}`);
    }
  }
}

report();

// ---------------------------------------------------------------------------

function report() {
  if (problems.length === 0) {
    console.log(
      DRY_RUN
        ? '\nNothing wrong found. Re-run without --dry-run to migrate.'
        : '\nMigration complete and verified. Netlify Blobs was not modified.',
    );
    process.exit(0);
  }
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nNetlify Blobs was not modified. Fix and re-run — this script is idempotent.',
  );
  process.exit(1);
}
