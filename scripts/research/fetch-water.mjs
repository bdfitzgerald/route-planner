// Discover water bodies near the route from OpenStreetMap via Overpass.
//
// Discovery rather than recall: querying OSM gives verified positions and real
// names for every tarn, lake, river pool and waterfall in the route corridor,
// instead of relying on a hand-typed list.
//
// Centroids only (`out center`). A full-geometry query over this bbox is heavy
// enough that the public Overpass instances reject it with 429, so we take the
// light query that they will serve.
//
// Consequence, handled downstream: a centroid is the right swim marker for a
// tarn (small enough that the middle is metres from the shore) but wrong for a
// big lake, where it sits well offshore. Large waters are flagged
// `needsEntryPoint` by screen-swims.mjs and given a curated shore access point
// instead of trusting the centroid.
//
// The response is cached to cache/osm-water.json; delete that file to re-fetch.

import fs from 'node:fs';
import path from 'node:path';

const CACHE = 'cache/osm-water.json';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Route bounds (54.3304..54.6049, -3.4108..-2.8636) padded by ~0.03 deg.
const BBOX = '54.30,-3.45,54.64,-2.82';

const QUERY = `[out:json][timeout:180];
(
  way["natural"="water"](${BBOX});
  rel["natural"="water"](${BBOX});
  node["waterway"="waterfall"](${BBOX});
  way["waterway"="waterfall"](${BBOX});
);
out tags center;`;

if (fs.existsSync(CACHE)) {
  const stat = fs.statSync(CACHE);
  console.log(`${CACHE} already present (${(stat.size / 1e6).toFixed(1)} MB) — delete it to re-fetch.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overpass answers 429 when a slot is busy, which is routine rather than fatal —
// the public instances are shared. Rotate endpoints and back off.
let body = null;
let lastError;
outer: for (let round = 0; round < 4; round += 1) {
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`querying ${new URL(endpoint).host} (round ${round + 1}) ...`);
      const res = await fetch(endpoint, { method: 'POST', body: QUERY });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      body = await res.json();
      break outer;
    } catch (err) {
      lastError = err;
      console.error(`  failed: ${err.message}`);
      await sleep(5000);
    }
  }
  if (round < 3) {
    const wait = 45000 * (round + 1);
    console.log(`  all endpoints busy; waiting ${wait / 1000}s before retrying`);
    await sleep(wait);
  }
}
if (!body) throw new Error(`All Overpass endpoints failed: ${lastError?.message}`);

// Keep only what the screening step needs, so the committed cache stays small.
const slim = body.elements
  .map((e) => {
    const tags = e.tags ?? {};
    return {
      id: `${e.type}/${e.id}`,
      name: tags.name ?? null,
      kind: tags.waterway === 'waterfall' ? 'waterfall' : tags.water ?? tags.natural ?? null,
      lat: e.lat ?? e.center?.lat ?? null,
      lon: e.lon ?? e.center?.lon ?? null,
    };
  })
  .filter((e) => e.lat != null && e.lon != null);

fs.mkdirSync(path.dirname(CACHE), { recursive: true });
fs.writeFileSync(CACHE, `${JSON.stringify(slim)}\n`);
const stat = fs.statSync(CACHE);
console.log(
  `wrote ${CACHE}: ${slim.length} features, ${slim.filter((s) => s.name).length} named, ${(stat.size / 1e6).toFixed(1)} MB`,
);
