// Verify the build output: GPX well-formedness, distance/ascent consistency,
// planning-constraint compliance, and that the browser's splice-and-export logic
// reproduces the figures shown in the UI.
//
// Usage: node scripts/verify.mjs [routeId]

import fs from 'node:fs';
import path from 'node:path';
import { parseGpx, flattenTrack } from './lib/gpx.mjs';
import { totalAscent, totalDescent, totalDistance, nearestIndex, haversine } from './lib/geo.mjs';
import { resolveSelection, dayWindow } from './lib/resolve.mjs';

const ROUTE_ID = process.argv[2] ?? 'lakeland-way';
const data = JSON.parse(fs.readFileSync('site/route-data.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join('routes', ROUTE_ID, 'route.json'), 'utf8'));
const ascentOpts = { threshold: cfg.ascent.thresholdM, smoothWindow: cfg.ascent.smoothWindow };

let failures = 0;
let checks = 0;
const check = (name, ok, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// Mirrors site/app.js spliceDetour exactly.
const spliceDetour = (line, detour) => {
  if (!detour || detour.length < 2) return line;
  const entry = nearestIndex(line, detour[0]).index;
  const exit = nearestIndex(line, detour[detour.length - 1]).index;
  const lo = Math.min(entry, exit);
  const hi = Math.max(entry, exit);
  const body = entry <= exit ? detour : detour.slice().reverse();
  if (lo === hi) return [...line.slice(0, lo + 1), ...body, ...line.slice(lo + 1)];
  return [...line.slice(0, lo + 1), ...body, ...line.slice(hi)];
};

const detourCats = data.categories.filter((c) => !c.category.includes('camp'));
const allItems = detourCats.flatMap((c) => c.items);

console.log('\n=== 1. day arithmetic ===');
for (const [key, dir] of Object.entries(data.directions)) {
  const sum = dir.days.reduce((s, d) => s + d.baseKm, 0);
  check(
    `${key}: base days sum to route length`,
    Math.abs(sum - data.route.totalKm) < 0.15,
    `${sum.toFixed(2)}km vs ${data.route.totalKm}km`,
  );
  const dayCount = dir.days.length;
  check(`${key}: ${cfg.days} days present`, dayCount === cfg.days, `got ${dayCount}`);
}

// Anticlockwise must be the clockwise legs in reverse order.
const cwLens = data.directions.cw.days.map((d) => Number(d.baseKm.toFixed(2)));
const acwLens = data.directions.acw.days.map((d) => Number(d.baseKm.toFixed(2)));
check(
  'acw day lengths are cw reversed',
  JSON.stringify(acwLens) === JSON.stringify(cwLens.slice().reverse()),
  `cw ${cwLens.join(',')} / acw ${acwLens.join(',')}`,
);

// Same resolver the build and the browser use — imported, not reimplemented.
const resolveDay = (dayNumber, dirKey, selectedIds, opts = {}) => {
  const dir = data.directions[dirKey];
  const day = dir.days.find((d) => d.day === dayNumber);
  return resolveSelection({
    items: allItems,
    chains: data.chains ?? [],
    dayNumber,
    direction: dirKey,
    selectedIds,
    window: day ? dayWindow(day, dir.reverse, data.route.totalKm) : null,
    ...opts,
  });
};

console.log('\n=== 2. planning constraints (as the browser resolves them) ===');
const P = data.route.planning;
for (const [key, dir] of Object.entries(data.directions)) {
  const rec = new Set(data.recommended[key].ids);
  let total = 0;
  let over = 0;
  let run = 0;
  let worstRun = 0;
  for (const day of dir.days) {
    const t = day.baseKm + resolveDay(day.day, key, rec).addedKm;
    total += t;
    if (t > P.maxDayKm + 1e-6) over += 1;
    run = t >= P.longDayKm ? run + 1 : 0;
    worstRun = Math.max(worstRun, run);
  }
  const avg = total / dir.days.length;
  check(`${key}: no day over ${P.maxDayKm}km`, over === 0, `${over} over`);
  // Travel days at both ends, and short days mid-trip.
  const endCap = P.endDayMaxKm ?? P.maxDayKm;
  const dayTotal = (n) => {
    const day = dir.days.find((d) => d.day === n);
    return day.baseKm + resolveDay(n, key, rec).addedKm;
  };
  const first = dayTotal(1);
  const last = dayTotal(dir.days.length);
  check(
    `${key}: day 1 within the ${endCap}km travel cap`,
    first <= endCap + 1e-6,
    `${first.toFixed(1)}km`,
  );
  check(
    `${key}: final day within the ${endCap}km travel cap`,
    last <= endCap + 1e-6,
    `${last.toFixed(1)}km`,
  );
  if (P.minEasyMiddleDays) {
    const easy = dir.days
      .filter((d) => d.day !== 1 && d.day !== dir.days.length)
      .map((d) => dayTotal(d.day))
      .filter((t) => t <= P.easyDayKm).length;
    check(
      `${key}: at least ${P.minEasyMiddleDays} short day(s) of <=${P.easyDayKm}km mid-trip`,
      easy >= P.minEasyMiddleDays,
      `${easy} found`,
    );
  }
  check(`${key}: average <= ${P.targetAverageKm}km`, avg <= P.targetAverageKm + 1e-6, `${avg.toFixed(2)}km`);
  check(
    `${key}: <= ${P.maxConsecutiveLongDays} consecutive days >= ${P.longDayKm}km`,
    worstRun <= P.maxConsecutiveLongDays,
    `longest run ${worstRun}`,
  );
}

console.log('\n=== 2b. over-the-top-only plan ===');
{
  const noBack = data.recommendedNoBacktrack ?? {};
  check('an over-the-top-only plan exists for both directions', Object.keys(noBack).length === 2);
  for (const [key, dir] of Object.entries(data.directions)) {
    const ids = new Set(noBack[key]?.ids ?? []);
    const totals = [];
    let outAndBack = 0;
    for (const day of dir.days) {
      const r = resolveDay(day.day, key, ids, { excludeOutAndBack: true });
      totals.push(day.baseKm + r.addedKm);
      for (const [id, m] of r.modes) {
        if (m !== 'out-and-back') continue;
        // Only peaks are barred from doubling back; swims and campsites may.
        if (allItems.find((i) => i.id === id)?.category === 'peaks') outAndBack += 1;
      }
    }
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    check(`${key}: no peak doubles back in the over-the-top plan`, outAndBack === 0, `${outAndBack} found`);
    check(`${key}: over-the-top plan no day over ${P.maxDayKm}km`, totals.every((t) => t <= P.maxDayKm + 1e-6), `max ${Math.max(...totals).toFixed(1)}km`);
    check(`${key}: over-the-top plan average <= ${P.targetAverageKm}km`, avg <= P.targetAverageKm + 1e-6, `${avg.toFixed(2)}km`);
    check(
      `${key}: every peak in it avoids doubling back`,
      [...ids]
        .map((id) => allItems.find((i) => i.id === id))
        .every((i) => !i || i.category !== 'peaks' || i.noBacktrack !== false),
    );
    check(
      `${key}: swims are not excluded by the peaks-only rule`,
      allItems.filter((i) => i.category === 'wild-swim-spots').every((i) => i.noBacktrack !== false),
    );
  }
  const f = 'lakeland-way-cw-full-over-the-top.gpx';
  check('over-the-top GPX was written', (data.exports ?? []).includes(f));
}

console.log('\n=== 3. detour data integrity ===');
const routed = allItems.filter((i) => i.detour?.kind === 'out-and-back' || i.detour?.kind === 'traverse');
check('every routed detour has geometry', routed.every((i) => i.detour.points?.length >= 2));
check('every routed detour has a positive cost', routed.every((i) => i.detour.addedKm > 0));
check(
  'routed detour length matches its geometry',
  routed.every((i) => {
    const measured = totalDistance(i.detour.points) / 1000;
    return Math.abs(measured - i.detour.addedKm) < 0.35;
  }),
  (() => {
    const worst = routed
      .map((i) => ({ t: i.title, d: Math.abs(totalDistance(i.detour.points) / 1000 - i.detour.addedKm) }))
      .sort((a, b) => b.d - a.d)[0];
    return worst ? `worst drift ${worst.d.toFixed(3)}km (${worst.t})` : '';
  })(),
);
const onRoute = allItems.filter((i) => i.detour?.kind === 'on-route');
check('on-route points cost nothing', onRoute.every((i) => i.detour.addedKm === 0));
check(
  'every point is assigned to a day in both directions',
  allItems.every((i) => i.dayByDirection.cw != null && i.dayByDirection.acw != null),
);
check(
  'no peak coordinate failed DEM verification',
  data.categories
    .find((c) => c.category === 'peaks')
    .items.every((i) => i.detour != null),
);

console.log('\n=== 3b. traverse integrity ===');
const withTraverse = allItems.filter((i) => i.traverse);
check('traverses were found', withTraverse.length > 0, `${withTraverse.length} points`);
check(
  'every traverse beats its out-and-back',
  withTraverse.every((i) => i.traverse.addedKm < i.detour.addedKm),
);
check(
  `no traverse bypasses more than ${data.route.planning.maxBypassKm ?? 10}km of base route`,
  withTraverse.every((i) => i.traverse.replacedKm <= (data.route.planning.maxBypassKm ?? 10) + 1e-6),
  (() => {
    const worst = withTraverse.slice().sort((a, b) => b.traverse.replacedKm - a.traverse.replacedKm)[0];
    return worst ? `worst ${worst.traverse.replacedKm}km (${worst.title})` : '';
  })(),
);
const campKm = (data.categories.find((c) => c.category === 'wildcamp-spots')?.items ?? []).map(
  (c) => c.entryKm,
);
check(
  'no traverse or chain skips a camp',
  [...withTraverse.map((i) => i.traverse), ...(data.chains ?? [])].every(
    (t) => !campKm.some((k) => k > t.fromKm + 0.01 && k < t.toKm - 0.01),
  ),
);
check(
  'traverse geometry length matches traverse + replaced',
  withTraverse.every((i) => {
    const measured = totalDistance(i.traverse.points) / 1000;
    return Math.abs(measured - i.traverse.traverseKm) < 0.35;
  }),
);
check(
  'every chain beats doing its members separately',
  (data.chains ?? []).every((c) => c.addedKm < c.separateKm),
);
check(
  'chain members all carry that chainId',
  (data.chains ?? []).every((c) =>
    c.memberIds.every((id) => allItems.find((i) => i.id === id)?.chainId === c.id),
  ),
);

console.log('\n=== 4. generated GPX files ===');
const gpxDir = path.join('routes', ROUTE_ID, 'gpx-exports');
const files = fs.readdirSync(gpxDir).filter((f) => f.endsWith('.gpx'));
check('gpx files were written', files.length > 0, `${files.length} files`);

let malformed = 0;
let emptyTracks = 0;
const dayFileFigures = [];
for (const file of files) {
  const xml = fs.readFileSync(path.join(gpxDir, file), 'utf8');
  let parsed;
  try {
    parsed = parseGpx(xml);
  } catch {
    malformed += 1;
    continue;
  }
  if (!xml.startsWith('<?xml') || !xml.includes('</gpx>')) malformed += 1;
  const pts = flattenTrack(parsed);
  const isWaypointOnly = /^lakeland-way-(peaks|wild-swim-spots)\.gpx$/.test(file);
  if (!pts.length && !isWaypointOnly && parsed.tracks.length) emptyTracks += 1;
  const m = file.match(/-(cw|acw)-day-(\d+)\.gpx$/);
  if (m && pts.length) {
    dayFileFigures.push({
      file,
      dir: m[1],
      day: Number(m[2]),
      km: totalDistance(pts) / 1000,
      ascentM: totalAscent(pts, ascentOpts),
    });
  }
}
check('all files parse as GPX', malformed === 0, `${malformed} malformed`);
check('no track is empty', emptyTracks === 0, `${emptyTracks} empty`);
check('per-day files exist for both directions', dayFileFigures.length === cfg.days * 2, `${dayFileFigures.length}`);

// A day file's measured length must match base + the detours the build chose.
let worstDrift = 0;
let worstLabel = '';
for (const f of dayFileFigures) {
  const day = data.directions[f.dir].days.find((d) => d.day === f.day);
  const rec = new Set(data.recommended[f.dir].ids);
  const expected = day.baseKm + resolveDay(f.day, f.dir, rec).addedKm;
  const drift = Math.abs(f.km - expected);
  if (drift > worstDrift) {
    worstDrift = drift;
    worstLabel = `${f.file}: file ${f.km.toFixed(2)}km vs expected ${expected.toFixed(2)}km`;
  }
}
check('day file length matches its stated figures', worstDrift < 0.6, worstLabel || 'exact');

console.log('\n=== 4b. deployability ===');
{
  // Netlify publishes site/, so anything the page requests must exist inside it.
  const need = ['index.html', 'app.js', 'resolve.js', 'styles.css', 'route-data.json'];
  const missing = need.filter((f) => !fs.existsSync(path.join('site', f)));
  check('publish dir has every asset the page loads', missing.length === 0, missing.join(', ') || 'all present');

  const servedDir = path.join('site', 'gpx', ROUTE_ID);
  const notServed = (data.exports ?? []).filter((f) => !fs.existsSync(path.join(servedDir, f)));
  check(
    'every advertised GPX is inside the publish dir',
    notServed.length === 0,
    notServed.length ? `${notServed.length} missing from ${servedDir}` : `${(data.exports ?? []).length} files in ${servedDir}`,
  );

  const appSrc = fs.readFileSync('site/app.js', 'utf8');
  // A credential in committed source is the thing this guards against.
  check(
    'no API key hardcoded in site/app.js',
    !/key\s*=\s*['"][A-Za-z0-9]{20,}['"]/.test(appSrc) && !/[A-Za-z0-9]{32}/.test(appSrc),
    'key must come from site/config.js, generated from OS_MAPS_KEY',
  );
  check('site/config.js is generated and present', fs.existsSync('site/config.js'));
  check(
    'no runtime path escapes the publish dir',
    !/["'`]\.\.\//.test(appSrc),
    /["'`]\.\.\//.test(appSrc) ? 'found a ../ link in app.js' : 'no ../ links',
  );
}

console.log('\n=== 5. browser export path (simulated) ===');
// Reproduce what site/app.js does for a day export and confirm the resulting
// track measures what the UI would display.
let uiWorst = 0;
let uiLabel = '';
for (const [key, dir] of Object.entries(data.directions)) {
  const rec = new Set(data.recommended[key].ids);
  for (const day of dir.days) {
    const r = resolveDay(day.day, key, rec);
    let pts = day.points.map((p) => [p[0], p[1], p[2]]);
    for (const part of r.parts) {
      if (part.points?.length) pts = spliceDetour(pts, part.points);
    }
    const measured = totalDistance(pts) / 1000;
    const shown = day.baseKm + r.addedKm;
    const drift = Math.abs(measured - shown);
    if (drift > uiWorst) {
      uiWorst = drift;
      uiLabel = `${key} day ${day.day}: spliced ${measured.toFixed(2)}km vs shown ${shown.toFixed(2)}km`;
    }
  }
}
check('spliced day matches the figure shown in the UI', uiWorst < 0.6, uiLabel || 'exact');

console.log('\n=== 6. ascent sanity ===');
// On a closed loop, total ascent must equal total descent.
const baseFile = path.join(gpxDir, `${ROUTE_ID}-full-base.gpx`);
const basePts = flattenTrack(parseGpx(fs.readFileSync(baseFile, 'utf8')));
const asc = totalAscent(basePts, ascentOpts);
const desc = totalDescent(basePts, ascentOpts);
check('closed loop: ascent equals descent', Math.abs(asc - desc) < 60, `${asc.toFixed(0)}m vs ${desc.toFixed(0)}m`);
check(
  'exported base file length matches route',
  Math.abs(totalDistance(basePts) / 1000 - data.route.totalKm) < 0.3,
  `${(totalDistance(basePts) / 1000).toFixed(2)}km`,
);
check(
  'loop closes',
  haversine(basePts[0], basePts[basePts.length - 1]) < 400,
  `${haversine(basePts[0], basePts[basePts.length - 1]).toFixed(0)}m gap`,
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`} (${checks} checks)\n`);
process.exit(failures === 0 ? 0 : 1);
