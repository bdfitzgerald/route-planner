// Experiment: can a summit be walked over as a traverse rather than tagged on as
// an out-and-back? Finds the places where the route passes closest to the summit
// (its local minima of distance), routes entry -> summit -> exit through real
// paths, and compares the net cost against the out-and-back already in the build.
//
// Usage: node scripts/research/try-traverse.mjs "Helvellyn" "Scafell Pike" ...

import fs from 'node:fs';
import { parseGpx, flattenTrack } from '../lib/gpx.mjs';
import { cumulativeDistances, haversine, totalAscent, totalDistance } from '../lib/geo.mjs';
import { ElevationService } from '../lib/elevation.mjs';
import { RoutingService } from '../lib/brouter.mjs';

const NAMES = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync('routes/lakeland-way/route.json', 'utf8'));
const ascentOpts = { threshold: cfg.ascent.thresholdM, smoothWindow: cfg.ascent.smoothWindow };
const data = JSON.parse(fs.readFileSync('site/route-data.json', 'utf8'));

const elevation = new ElevationService();
const track = elevation.attach(
  flattenTrack(parseGpx(fs.readFileSync('routes/lakeland-way/lakeland-way-original.gpx', 'utf8'))),
);
const cum = cumulativeDistances(track);
const routing = new RoutingService();

// Local minima of distance-to-summit along the route: each is a distinct place
// the route comes close, so a natural candidate for leaving or rejoining.
function approachPoints(target, { minSeparationM = 1200, limit = 5 } = {}) {
  const d = track.map((p) => haversine(p, target));
  const minima = [];
  for (let i = 1; i < d.length - 1; i += 1) {
    if (d[i] <= d[i - 1] && d[i] <= d[i + 1]) minima.push({ index: i, dist: d[i] });
  }
  minima.sort((a, b) => a.dist - b.dist);
  const kept = [];
  for (const m of minima) {
    if (kept.every((k) => Math.abs(cum[k.index] - cum[m.index]) > minSeparationM)) kept.push(m);
    if (kept.length >= limit) break;
  }
  return kept.sort((a, b) => cum[a.index] - cum[b.index]);
}

const allItems = data.categories.filter((c) => !c.category.includes('camp')).flatMap((c) => c.items);
const campKm = (data.categories.find((c) => c.category === 'wildcamp-spots')?.items ?? []).map(
  (c) => c.entryKm,
);

for (const name of NAMES) {
  const item = allItems.find((i) => i.title === name);
  if (!item) {
    console.log(`\n${name}: not found`);
    continue;
  }
  console.log(`\n=== ${name} ===`);
  console.log(
    `  current: ${item.detour.kind}, +${item.detour.addedKm}km, +${item.detour.addedAscentM}m (enters at km ${item.entryKm})`,
  );

  const approaches = approachPoints([item.lat, item.lon]);
  console.log(`  route passes near at: ${approaches.map((a) => `km${(cum[a.index] / 1000).toFixed(1)} (${(a.dist / 1000).toFixed(2)}km off)`).join(', ')}`);

  const results = [];
  for (let x = 0; x < approaches.length; x += 1) {
    for (let y = x + 1; y < approaches.length; y += 1) {
      const A = approaches[x];
      const B = approaches[y];
      const baseM = cum[B.index] - cum[A.index];
      if (baseM < 400 || baseM > 16000) continue;
      // A traverse that swallows a camp would skip a night's stop.
      const aKm = cum[A.index] / 1000;
      const bKm = cum[B.index] / 1000;
      if (campKm.some((k) => k > aKm + 0.01 && k < bKm - 0.01)) continue;

      const spur = await routing.route(
        [
          [track[A.index][0], track[A.index][1]],
          [item.lat, item.lon],
          [track[B.index][0], track[B.index][1]],
        ],
        { label: `${name} traverse km${aKm.toFixed(1)}->${bKm.toFixed(1)}` },
      );
      if (!spur?.points?.length) continue;
      const pts = elevation.attach(spur.points);
      const traverseKm = totalDistance(pts) / 1000;
      const netKm = traverseKm - baseM / 1000;
      results.push({
        aKm,
        bKm,
        baseKm: baseM / 1000,
        traverseKm,
        netKm,
        ascentM: totalAscent(pts, ascentOpts),
      });
    }
  }
  elevation.flush();

  if (!results.length) {
    console.log('  no viable traverse found');
    continue;
  }
  results.sort((a, b) => a.netKm - b.netKm);
  console.log(`  ${'entry'.padStart(7)} ${'exit'.padStart(7)} ${'replaces'.padStart(9)} ${'traverse'.padStart(9)} ${'NET'.padStart(8)} ${'ascent'.padStart(7)}`);
  for (const r of results.slice(0, 6)) {
    console.log(
      `  km${r.aKm.toFixed(1).padStart(5)} km${r.bKm.toFixed(1).padStart(5)} ${`${r.baseKm.toFixed(2)}km`.padStart(9)} ${`${r.traverseKm.toFixed(2)}km`.padStart(9)} ${`+${r.netKm.toFixed(2)}km`.padStart(8)} ${`+${r.ascentM.toFixed(0)}m`.padStart(7)}`,
    );
  }
  const best = results[0];
  const saving = item.detour.addedKm - best.netKm;
  console.log(
    `  BEST traverse +${best.netKm.toFixed(2)}km vs out-and-back +${item.detour.addedKm}km  ->  ${saving > 0 ? `saves ${saving.toFixed(2)}km` : `worse by ${(-saving).toFixed(2)}km`}`,
  );
}
routing.flush();
