// Screen OSM water features against the base route to find swim candidates.
//
// Usage: node scripts/research/screen-swims.mjs [maxOffRouteKm]

import fs from 'node:fs';
import { parseGpx, flattenTrack } from '../lib/gpx.mjs';
import { cumulativeDistances, haversine } from '../lib/geo.mjs';
import { ElevationService } from '../lib/elevation.mjs';

const MAX_OFF_ROUTE_KM = Number(process.argv[2] ?? 4);
const GPX = 'routes/lakeland-way/lakeland-way-original.gpx';
const WATER = 'cache/osm-water.json';

// Waters big enough that an OSM centroid sits well offshore. For these the
// centroid is a label position, not somewhere you can get in, so they are
// flagged for a hand-picked shore access point.
const LARGE_WATERS = new Set([
  'Windermere', 'Ullswater', 'Derwent Water', 'Bassenthwaite Lake', 'Coniston Water',
  'Wast Water', 'Wastwater', 'Thirlmere', 'Haweswater Reservoir', 'Ennerdale Water',
  'Crummock Water', 'Buttermere', 'Loweswater', 'Esthwaite Water', 'Grasmere',
  'Rydal Water', 'Elter Water', 'Devoke Water', 'Brothers Water', 'Bassenthwaite',
]);

const route = flattenTrack(parseGpx(fs.readFileSync(GPX, 'utf8')));
const cum = cumulativeDistances(route);
const water = JSON.parse(fs.readFileSync(WATER, 'utf8'));

const named = water.filter((w) => w.name);

const rows = [];
for (const w of named) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const d = haversine([w.lat, w.lon], route[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const offRouteKm = bestDist / 1000;
  if (offRouteKm > MAX_OFF_ROUTE_KM) continue;
  rows.push({
    ...w,
    offRouteKm,
    routeKm: cum[best] / 1000,
    needsEntryPoint: LARGE_WATERS.has(w.name),
  });
}

// Collapse duplicates: OSM often holds the same water as several ways plus a
// relation. Keep whichever copy sits closest to the route.
const byName = new Map();
for (const r of rows) {
  const existing = byName.get(r.name);
  if (!existing || r.offRouteKm < existing.offRouteKm) byName.set(r.name, r);
}
const unique = [...byName.values()].sort((a, b) => a.routeKm - b.routeKm);

const elevation = new ElevationService();
await elevation.warm(unique.map((u) => [u.lat, u.lon]), { label: 'water elevation' });
elevation.flush();
for (const u of unique) u.elevationM = elevation.cachedOnly(u.lat, u.lon);

console.log(`\n${named.length} named water features; ${unique.length} unique within ${MAX_OFF_ROUTE_KM}km of route\n`);
console.log(`${'km'.padStart(6)}  ${'off'.padStart(5)}  ${'ele'.padStart(5)}  ${'name'.padEnd(32)} kind`);
for (const u of unique) {
  const flag = u.needsEntryPoint ? ' *' : '';
  console.log(
    `${u.routeKm.toFixed(1).padStart(6)}  ${u.offRouteKm.toFixed(2).padStart(5)}  ${
      u.elevationM == null ? '    ?' : `${u.elevationM.toFixed(0)}m`.padStart(5)
    }  ${(u.name + flag).padEnd(32)} ${u.kind ?? ''}`,
  );
}
console.log('\n* centroid is offshore — needs a curated shore access point');

const outPath = 'scripts/research/screened-swims.json';
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    unique.map((u) => ({
      name: u.name,
      osmId: u.id,
      kind: u.kind,
      lat: u.lat,
      lon: u.lon,
      elevationM: u.elevationM == null ? null : Number(u.elevationM.toFixed(0)),
      offRouteKm: Number(u.offRouteKm.toFixed(3)),
      routeKm: Number(u.routeKm.toFixed(2)),
      needsEntryPoint: u.needsEntryPoint,
    })),
    null,
    2,
  )}\n`,
);
console.log(`wrote ${outPath}`);
