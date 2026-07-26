// Tidy-up report. Read-only: it finds things, it never changes them.
//
// Deliberately dependency-free, and aimed at what actually matters for this project
// rather than generic lint noise:
//   - payload weight, and which fields in route-data.json cause it
//   - CSS rules nothing references
//   - exported helpers nothing imports
//   - data gaps: points with no description, unroutable spurs, suspect coordinates
//   - duplication between the two copies of the GPX exports
//
// Usage: node scripts/analyse.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SITE = 'site';
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const pct = (n, of) => `${((n / of) * 100).toFixed(1)}%`;

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      })
    : [];

const section = (t) => process.stdout.write(`\n${t}\n${'-'.repeat(t.length)}\n`);
const note = (s) => process.stdout.write(`  ${s}\n`);
const findings = [];
const flag = (s) => {
  findings.push(s);
  process.stdout.write(`  → ${s}\n`);
};

/* ---------- payload ---------- */
section('Payload');
const siteFiles = walk(SITE);
const sizes = siteFiles
  .map((f) => ({ f, raw: fs.statSync(f).size, gz: zlib.gzipSync(fs.readFileSync(f)).length }))
  .sort((a, b) => b.raw - a.raw);
const rawTotal = sizes.reduce((s, x) => s + x.raw, 0);
const gzTotal = sizes.reduce((s, x) => s + x.gz, 0);
note(`${siteFiles.length} files · ${kb(rawTotal)} raw · ${kb(gzTotal)} gzipped`);
for (const s of sizes.slice(0, 8)) {
  note(`${kb(s.raw).padStart(10)} → ${kb(s.gz).padStart(9)} gz   ${s.f}`);
}

/* ---------- what makes route-data.json big ---------- */
section('route-data.json composition');
const dataPath = path.join(SITE, 'route-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const weigh = (v) => JSON.stringify(v ?? null).length;
const total = weigh(data);

const parts = [
  ['directions[].days[].points (display geometry)', Object.values(data.directions).reduce((s, d) => s + d.days.reduce((a, day) => a + weigh(day.points), 0), 0)],
  ['detour[].points (out-and-back geometry)', data.categories.flatMap((c) => c.items).reduce((s, i) => s + weigh(i.detour?.points), 0)],
  ['traverse[].points', data.categories.flatMap((c) => c.items).reduce((s, i) => s + weigh(i.traverse?.points), 0)],
  ['chains[].points', (data.chains ?? []).reduce((s, c) => s + weigh(c.points), 0)],
  ['descriptions', data.categories.flatMap((c) => c.items).reduce((s, i) => s + weigh(i.description), 0)],
];
for (const [label, bytes] of parts.sort((a, b) => b[1] - a[1])) {
  note(`${kb(bytes).padStart(10)}  ${pct(bytes, total).padStart(6)}  ${label}`);
}
const geometry = parts.filter(([l]) => l.includes('points')).reduce((s, [, b]) => s + b, 0);
note(`${kb(geometry).padStart(10)}  ${pct(geometry, total).padStart(6)}  ALL geometry`);
if (geometry / total > 0.8) {
  flag(
    `Geometry is ${pct(geometry, total)} of the payload. Raising DISPLAY_TOLERANCE_M in ` +
      'build.mjs thins the on-screen line without touching export accuracy.',
  );
}

// Duplicate geometry: a traverse whose points are also stored on its detour
const dupes = data.categories
  .flatMap((c) => c.items)
  .filter((i) => i.traverse?.points && i.detour?.points)
  .filter((i) => JSON.stringify(i.traverse.points) === JSON.stringify(i.detour.points));
if (dupes.length) flag(`${dupes.length} point(s) store identical traverse and detour geometry.`);

/* ---------- unreferenced CSS ---------- */
section('CSS');
const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
const consumers = ['index.html', 'app.js', 'resolve.js']
  .map((f) => path.join(SITE, f))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
const classes = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const leafletOwned = (c) => c.startsWith('leaflet');
const unused = [...classes].filter((c) => !leafletOwned(c) && !consumers.includes(c)).sort();
note(`${classes.size} classes defined`);
if (unused.length) flag(`${unused.length} unreferenced: ${unused.join(', ')}`);
else note('every class is referenced');

// #a8452a is a colour, not an id. Anything that is entirely hex digits and 3, 4, 6
// or 8 characters long is a colour literal.
const isHexColour = (s) => /^[0-9a-fA-F]+$/.test(s) && [3, 4, 6, 8].includes(s.length);
const ids = new Set(
  [...css.matchAll(/#([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((i) => !isHexColour(i)),
);
const unusedIds = [...ids].filter((i) => !consumers.includes(i)).sort();
if (unusedIds.length) flag(`${unusedIds.length} unreferenced id selector(s): ${unusedIds.join(', ')}`);
else note(`${ids.size} id selectors, all referenced`);

/* ---------- unused exports ---------- */
section('Module exports');
const libFiles = walk('scripts').filter((f) => f.endsWith('.mjs'));
let unusedExports = 0;
for (const f of libFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const names = [
    ...[...src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  ];
  for (const n of names) {
    // Count references outside the defining file.
    const others = libFiles.filter((o) => o !== f).map((o) => fs.readFileSync(o, 'utf8')).join('\n') + consumers;
    const re = new RegExp(`\\b${n}\\b`);
    if (re.test(others)) continue;
    // Distinguish two very different things: a helper used inside its own module
    // that need not be exported at all, and one nothing calls anywhere.
    const usedInOwnFile = new RegExp(`\\b${n}\\b`, 'g');
    const ownUses = (src.match(usedInOwnFile) ?? []).length;
    if (ownUses > 1) {
      note(`${f}: ${n}() is exported but only used inside its own module — could be private`);
    } else {
      flag(`${f}: ${n}() is exported and never called anywhere — dead code`);
      unusedExports += 1;
    }
  }
}
if (!unusedExports) note('no dead exports');

/* ---------- data quality ---------- */
section('Data quality');
const items = data.categories.flatMap((c) => c.items.map((i) => ({ ...i, cat: c.category })));
const noDesc = items.filter((i) => !i.description);
const unroutable = items.filter((i) => i.detour?.kind === 'unroutable');
const relocated = items.filter((i) => i.entryRelocated);
const farOff = items.filter((i) => (i.offRouteM ?? 0) > 5000);
note(`${items.length} points across ${data.categories.length} categories`);
note(`${items.length - noDesc.length} described, ${noDesc.length} without a description`);
if (unroutable.length) flag(`${unroutable.length} point(s) could not be routed: ${unroutable.map((i) => i.title).join(', ')}`);
if (relocated.length) note(`${relocated.length} entry point(s) relocated by the build (expected)`);
if (farOff.length) flag(`${farOff.length} point(s) more than 5km off route: ${farOff.map((i) => i.title).join(', ')}`);
const noElev = items.filter((i) => i.cat === 'peaks' && !i.heightM);
if (noElev.length) flag(`${noElev.length} peak(s) with no height`);

/* ---------- duplicate export copies ---------- */
section('GPX exports');
const canonical = walk(path.join('routes', data.route.id, 'gpx-exports'));
const served = walk(path.join(SITE, 'gpx', data.route.id));
note(`${canonical.length} canonical, ${served.length} served`);
const drift = canonical
  .map((f) => path.basename(f))
  .filter((base) => {
    const a = path.join('routes', data.route.id, 'gpx-exports', base);
    const b = path.join(SITE, 'gpx', data.route.id, base);
    return !fs.existsSync(b) || fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8');
  });
if (drift.length) flag(`${drift.length} served GPX differ from canonical — re-run the build: ${drift.slice(0, 4).join(', ')}`);
else note('served copies match the canonical ones');
const dupBytes = served.reduce((s, f) => s + fs.statSync(f).size, 0);
note(`the served copy adds ${kb(dupBytes)} to the repo (unavoidable: it must live under the publish root)`);

/* ---------- external tools worth adding ---------- */
section('Tools you could add (none installed, all zero-config via npx)');
note('npx oxlint@latest site scripts     — very fast linter, catches dead code and bad patterns');
note('npx knip@latest                    — unused files, exports and dependencies');
note('npx prettier@latest --check .       — consistent formatting');
note('npx lighthouse <url> --view         — performance and accessibility on the deployed site');
note('npx @lhci/cli autorun               — the same, in CI');
note('npx serve site                      — serve the publish dir the way Netlify does');

section('Summary');
if (findings.length) {
  note(`${findings.length} thing(s) worth a look:`);
  findings.forEach((f, i) => note(`  ${i + 1}. ${f}`));
} else {
  note('nothing flagged');
}
process.stdout.write('\n');
