// Builds portfolio mockup screens: injects real photography into SVG templates
// (scripts/mockups/<project>/*.svg) and rasterizes to high-res WebP under
// public/projects/<project>/. Templates reference photos via __PH_<token>__
// placeholders inside <image href>.
//   node scripts/gen-mockups.mjs
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { dataUri, SOURCES } from './photos.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = join(root, 'scripts', 'mockups');
const outRoot = join(root, 'public', 'projects');

// Per-project rasterization scale (× the SVG's intrinsic width/height).
const SCALE = { 'swift-eats': 3, ecommerce: 2, 'pulse-analytics': 2 };
const DEFAULT_SCALE = 2;

// Pre-resolve every photo token once (network).
console.log('Fetching photography…');
const uris = {};
for (const token of Object.keys(SOURCES)) {
  uris[token] = await dataUri(token);
  process.stdout.write('.');
}
console.log('');

const projects = (await readdir(srcRoot, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const project of projects) {
  const srcDir = join(srcRoot, project);
  const outDir = join(outRoot, project);
  await mkdir(outDir, { recursive: true });
  const scale = SCALE[project] ?? DEFAULT_SCALE;
  const files = (await readdir(srcDir)).filter((f) => f.endsWith('.svg')).sort();

  for (const f of files) {
    let svg = await readFile(join(srcDir, f), 'utf8');
    const w = Number(svg.match(/<svg[^>]*\bwidth="(\d+)"/)?.[1]);
    const h = Number(svg.match(/<svg[^>]*\bheight="(\d+)"/)?.[1]);
    if (!w || !h) throw new Error(`${project}/${f}: missing width/height on <svg>`);

    svg = svg.replace(/__PH_([a-z0-9_]+)__/g, (_m, token) => {
      if (!uris[token]) throw new Error(`Unknown photo token in ${project}/${f}: ${token}`);
      return uris[token];
    });

    const out = join(outDir, basename(f, '.svg') + '.webp');
    await sharp(Buffer.from(svg), { density: 96 * scale })
      .resize(w * scale, h * scale, { fit: 'cover' })
      .webp({ quality: 80, effort: 6 })
      .toFile(out);
    const kb = ((await readFile(out)).length / 1024).toFixed(0);
    console.log(`✓ ${project}/${basename(out)}  ${kb} KB  ${w * scale}×${h * scale}`);
  }
}
console.log('Done.');
