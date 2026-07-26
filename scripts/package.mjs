// Build, verify, then zip the publish directory for Netlify Drop.
//
// The zip contains the CONTENTS of site/, not the site/ folder itself: Netlify Drop
// treats the archive root as the site root, so zipping the folder would serve the
// page at /site/index.html and every relative path would miss.
//
// Refuses to package if any check fails — the point of the step is that what you drop
// has been verified.
//
// Usage: node scripts/package.mjs [--skip-build] [--skip-tests]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const SITE = 'site';
const DIST = 'dist';

const run = (label, file, argv) => {
  process.stdout.write(`\n▸ ${label}\n`);
  try {
    execFileSync(file, argv, { stdio: 'inherit' });
  } catch {
    process.stderr.write(`\n✗ ${label} failed — not packaging.\n`);
    process.exit(1);
  }
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

if (!args.has('--skip-build')) run('Build', process.execPath, ['scripts/build.mjs']);
if (!args.has('--skip-tests')) {
  run('Verify output', process.execPath, ['scripts/verify.mjs']);
  run('Page boots', process.execPath, ['scripts/test-site.mjs']);
  run('Features', process.execPath, ['scripts/test-features.mjs']);
  run('Exports', process.execPath, ['scripts/test-exports.mjs']);
}

// --- sanity-check the publish dir before sealing it ---
process.stdout.write('\n▸ Package\n');
const required = ['index.html', 'app.js', 'config.js', 'resolve.js', 'styles.css', 'route-data.json'];
const missing = required.filter((f) => !fs.existsSync(path.join(SITE, f)));
if (missing.length) {
  process.stderr.write(`  ✗ ${SITE}/ is missing: ${missing.join(', ')}\n`);
  process.exit(1);
}

// The zip is what gets deployed, so a missing key here means a deployed site with no
// OS tiles. Warn loudly rather than shipping it silently.
const runtime = fs.readFileSync(path.join(SITE, 'config.js'), 'utf8');
if (/"osMapsKey":(null|"")/.test(runtime.replace(/\s/g, ''))) {
  process.stdout.write(
    '  ! no OS Maps key in this build — the deployed site will use OpenStreetMap tiles.\n' +
      '    Set OS_MAPS_KEY (or put it in .env) and re-run to include it.\n',
  );
}

const files = walk(SITE);
const stale = files.filter((f) => /\.(map|orig|rej|bak)$|(^|\/)\._/.test(f));
if (stale.length) {
  process.stdout.write(`  removing ${stale.length} stray file(s)\n`);
  for (const f of stale) fs.unlinkSync(f);
}

const stamp = new Date().toISOString().slice(0, 10);
const route = JSON.parse(fs.readFileSync(path.join(SITE, 'route-data.json'), 'utf8')).route;
const name = `${route.id}-${stamp}.zip`;

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, name);
if (fs.existsSync(out)) fs.unlinkSync(out);

// -r recurse, -q quiet, -X drop macOS extended attributes, and run from inside site/
// so paths in the archive are relative to the site root.
execFileSync('/usr/bin/zip', ['-r', '-q', '-X', path.join('..', out), '.', '-x', '.DS_Store'], {
  cwd: SITE,
  stdio: 'inherit',
});

// --- report ---
const raw = walk(SITE).reduce((s, f) => s + fs.statSync(f).size, 0);
const gz = walk(SITE).reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(f)).length, 0);
const zipSize = fs.statSync(out).size;

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

process.stdout.write(`
  ${out}
    ${walk(SITE).length} files
    ${mb(raw)} on disk
    ${mb(zipSize)} zipped   (what you drop)
    ${mb(gz)} gzipped  (what visitors download)

  Biggest files:
`);
for (const f of walk(SITE)
  .map((f) => ({ f, size: fs.statSync(f).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 6)) {
  process.stdout.write(`    ${kb(f.size).padStart(9)}  ${f.f}\n`);
}

// Verify the archive lists index.html at its root, not nested under site/.
const listing = execFileSync('/usr/bin/unzip', ['-Z1', out], { encoding: 'utf8' }).split('\n');
const rootIndex = listing.includes('index.html');
process.stdout.write(
  `\n  index.html at archive root: ${rootIndex ? 'yes' : 'NO — Netlify Drop would serve the wrong path'}\n`,
);
if (!rootIndex) process.exit(1);

process.stdout.write(`
  Drop it at https://app.netlify.com/drop
`);
