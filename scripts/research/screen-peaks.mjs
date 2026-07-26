// Screen candidate summits against the base route.
//
// For each candidate: convert its grid reference, sample the DEM, and compare
// the reading to the published height. A mistyped grid reference lands on a
// hillside and shows up as a large negative delta, so bad data is caught rather
// than silently shipped. Then measure how far the summit lies from the route and
// where along it, so only genuine detour candidates are kept.
//
// Usage: node scripts/research/screen-peaks.mjs [maxOffRouteKm]

import fs from 'node:fs';
import { FELL_CANDIDATES } from './fell-candidates.mjs';
import { gridrefToWgs84 } from '../lib/osgb.mjs';
import { parseGpx, flattenTrack } from '../lib/gpx.mjs';
import { cumulativeDistances, haversine } from '../lib/geo.mjs';
import { ElevationService } from '../lib/elevation.mjs';

const MAX_OFF_ROUTE_KM = Number(process.argv[2] ?? 5);
const GPX = 'routes/lakeland-way/lakeland-way-original.gpx';

// DEM cells smooth sharp summits, so a reading below the published height is
// expected and can be substantial: a 30m cell across a rocky top like Castle
// Crag or Pike o' Stickle averages away tens of metres. A reading far below that
// means the coordinate is not on the summit at all.
const TOLERANCE_LOW = -60;
const TOLERANCE_HIGH = 25;

const route = flattenTrack(parseGpx(fs.readFileSync(GPX, 'utf8')));
const cum = cumulativeDistances(route);
const elevation = new ElevationService();

const candidates = FELL_CANDIDATES.map((f) => {
  const { lat, lon } = gridrefToWgs84(f.gridref);
  return { ...f, lat, lon };
});

await elevation.warm(candidates.map((c) => [c.lat, c.lon]), { label: 'summit check' });
elevation.flush();

const nearestOnRoute = (lat, lon) => {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const d = haversine([lat, lon], route[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return { offRouteKm: bestDist / 1000, routeKm: cum[best] / 1000 };
};

const isOk = (delta) => delta != null && delta >= TOLERANCE_LOW && delta <= TOLERANCE_HIGH;

const rows = candidates.map((c) => {
  const dem = elevation.cachedOnly(c.lat, c.lon);
  const delta = dem == null ? null : dem - c.heightM;
  return { ...c, dem, delta, ...nearestOnRoute(c.lat, c.lon), snapped: false };
});

// Second pass. A 6-figure grid reference only locates a 100m square, and a 30m
// DEM cell smooths sharp summits, so a single sample can read well below the
// true height without the reference being wrong. Probing for the local maximum
// resolves that and snaps the coordinate onto the actual summit.
const needProbe = rows.filter((r) => !isOk(r.delta));
if (needProbe.length) {
  process.stdout.write(`\nProbing ${needProbe.length} candidate(s) for a local summit maximum...\n`);
  for (const r of needProbe) {
    const peak = await elevation.findLocalMaximum(r.lat, r.lon, { radiusM: 450, steps: 9 });
    const delta = peak.elevation - r.heightM;
    // Only adopt the probe when it lands within tolerance of the published
    // height. A probe reading far ABOVE it has walked onto a neighbouring higher
    // fell — common for a small summit under a big ridge — so the original
    // sample is left untouched and judged on its own delta.
    if (isOk(delta) && peak.elevation > (r.dem ?? -Infinity)) {
      r.lat = peak.lat;
      r.lon = peak.lon;
      r.dem = peak.elevation;
      r.delta = delta;
      r.snapped = true;
      Object.assign(r, nearestOnRoute(r.lat, r.lon));
    }
  }
  elevation.flush();
}

for (const r of rows) r.suspect = !isOk(r.delta);

const suspect = rows.filter((r) => r.suspect);
const clean = rows.filter((r) => !r.suspect);
const inRange = clean
  .filter((r) => r.offRouteKm <= MAX_OFF_ROUTE_KM)
  .sort((a, b) => a.routeKm - b.routeKm);

console.log(`\nScreened ${rows.length} candidates against ${(cum[cum.length - 1] / 1000).toFixed(1)}km route`);
console.log(`  height check passed : ${clean.length}`);
console.log(`  height check failed : ${suspect.length}`);
console.log(`  within ${MAX_OFF_ROUTE_KM}km of route : ${inRange.length}\n`);

if (suspect.length) {
  console.log('=== FAILED HEIGHT CHECK (grid reference likely wrong — excluded) ===');
  for (const r of suspect) {
    const d = r.delta == null ? 'no DEM' : `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(0)}m`;
    console.log(
      `  ${r.name.padEnd(26)} ${r.gridref.padEnd(10)} stated ${String(r.heightM).padStart(4)}m  DEM ${
        r.dem == null ? '  ?' : r.dem.toFixed(0).padStart(4)
      }m  (${d})`,
    );
  }
  console.log();
}

console.log(`=== IN RANGE (<=${MAX_OFF_ROUTE_KM}km), ordered by position along route ===`);
console.log(`${'km'.padStart(6)}  ${'off'.padStart(5)}  ${'summit'.padEnd(26)} ${'height'.padStart(6)}`);
for (const r of inRange) {
  console.log(
    `${r.routeKm.toFixed(1).padStart(6)}  ${r.offRouteKm.toFixed(2).padStart(5)}  ${r.name.padEnd(26)} ${String(r.heightM).padStart(5)}m`,
  );
}

const outPath = 'scripts/research/screened-peaks.json';
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    inRange.map((r) => ({
      name: r.name,
      gridref: r.gridref,
      lat: Number(r.lat.toFixed(6)),
      lon: Number(r.lon.toFixed(6)),
      heightM: r.heightM,
      demM: r.dem == null ? null : Number(r.dem.toFixed(1)),
      offRouteKm: Number(r.offRouteKm.toFixed(3)),
      routeKm: Number(r.routeKm.toFixed(2)),
      wainwright: r.wainwright,
      snappedToDemMaximum: r.snapped,
    })),
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${outPath}`);
