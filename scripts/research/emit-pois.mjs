// Combine machine-screened candidates with hand curation into the route's POI
// data files. Re-runnable: it regenerates the files from the screened JSON plus
// curation.mjs, so fixing a description means editing curation and re-running.
//
// Usage: node scripts/research/emit-pois.mjs

import fs from 'node:fs';
import path from 'node:path';
import { PEAK_NOTES, SWIM_NOTES, WATER_EXCLUDE } from './curation.mjs';

const ROUTE_DIR = 'routes/lakeland-way';
const peaks = JSON.parse(fs.readFileSync('scripts/research/screened-peaks.json', 'utf8'));
const swims = JSON.parse(fs.readFileSync('scripts/research/screened-swims.json', 'utf8'));

const write = (relPath, payload) => {
  const full = path.join(ROUTE_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`  ${relPath.padEnd(40)} ${payload.items.length} items`);
};

// --- peaks ---
const peakItems = peaks.map((p) => {
  const note = PEAK_NOTES[p.name] ?? {};
  return {
    id: `peak-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    title: p.name,
    lat: p.lat,
    lon: p.lon,
    gridref: p.gridref,
    heightM: p.heightM,
    labels: note.labels ?? [],
    starred: Boolean(note.star),
    description: note.description ?? null,
    offRouteKm: p.offRouteKm,
    routeKm: p.routeKm,
    wainwright: p.wainwright,
    verified: {
      demM: p.demM,
      deltaM: p.demM == null ? null : Number((p.demM - p.heightM).toFixed(1)),
      snappedToDemMaximum: p.snappedToDemMaximum ?? false,
    },
  };
});

write('peaks/peaks.json', {
  category: 'peaks',
  label: 'Peaks',
  glyph: '▲',
  source:
    'OS grid references converted to WGS84, each validated against SRTM 30m elevation; positions failing the height check were excluded.',
  items: peakItems.sort((a, b) => a.routeKm - b.routeKm),
});

// --- wild swims ---
const swimItems = swims
  .filter((s) => !WATER_EXCLUDE.has(s.name))
  .map((s) => {
    const note = SWIM_NOTES[s.name] ?? {};
    return {
      id: `swim-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      title: s.name,
      lat: s.lat,
      lon: s.lon,
      kind: s.kind,
      elevationM: s.elevationM,
      labels: note.labels ?? (s.kind === 'waterfall' ? ['waterfall'] : []),
      starred: Boolean(note.star),
      description: note.description ?? null,
      offRouteKm: s.offRouteKm,
      routeKm: s.routeKm,
      needsEntryPoint: s.needsEntryPoint,
      osmId: s.osmId,
    };
  });

write('wild-swim-spots/wild-swim-spots.json', {
  category: 'wild-swim-spots',
  label: 'Wild swims',
  glyph: '~',
  source:
    'Discovered from OpenStreetMap water features within 4km of the route, then curated. Positions are OSM centroids: accurate for tarns and pools, but flagged needsEntryPoint for large lakes where the centroid lies offshore.',
  items: swimItems.sort((a, b) => a.routeKm - b.routeKm),
});

console.log(`\npeaks: ${peakItems.length} (${peakItems.filter((p) => p.starred).length} starred, ${peakItems.filter((p) => p.description).length} described)`);
console.log(`swims: ${swimItems.length} (${swimItems.filter((s) => s.starred).length} starred, ${swimItems.filter((s) => s.description).length} described)`);
console.log(`excluded as non-swimmable: ${swims.length - swimItems.length}`);
