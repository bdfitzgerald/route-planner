// Elevation lookup via Open Topo Data.
//
// The Lakeland Way GPX was drawn in OS Maps and carries no <ele> data at all,
// so every ascent figure on the site depends on sampling a DEM here.
//
// Dataset choice: srtm30m. Validated against six Lakeland summits it reads
// 6-23m low (DEM cells smooth sharp summits), consistently and without gaps —
// eudem25m was no better and returned voids in places. The bias barely affects
// ascent totals, which depend on differences rather than absolute heights.

import { JsonCache, fetchJsonWithRetry, sleep } from './cache.mjs';

const ENDPOINT = 'https://api.opentopodata.org/v1';
const DATASET = 'srtm30m';
const BATCH = 100; // API maximum locations per request
const RATE_LIMIT_MS = 1100; // public instance allows 1 call/second

// 5dp is ~1.1m at this latitude — finer than the DEM's 30m posting, so this
// only merges genuinely identical points while keeping cache keys stable.
const key = (lat, lon) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

export class ElevationService {
  constructor({ cachePath = 'cache/elevation.json', dataset = DATASET } = {}) {
    this.cache = new JsonCache(cachePath);
    this.dataset = dataset;
    this.fetched = 0;
  }

  cachedOnly(lat, lon) {
    const k = key(lat, lon);
    return this.cache.has(k) ? this.cache.get(k) : null;
  }

  // Fill the cache for every supplied [lat, lon]. Returns the number fetched.
  async warm(points, { label = 'elevation' } = {}) {
    const missing = [];
    const seen = new Set();
    for (const p of points) {
      const k = key(p[0], p[1]);
      if (this.cache.has(k) || seen.has(k)) continue;
      seen.add(k);
      missing.push([p[0], p[1], k]);
    }
    if (!missing.length) return 0;

    const batches = Math.ceil(missing.length / BATCH);
    process.stdout.write(
      `  ${label}: ${missing.length} new points to sample (${batches} request${batches === 1 ? '' : 's'})\n`,
    );

    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const locations = chunk.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|');
      const url = `${ENDPOINT}/${this.dataset}?locations=${locations}`;
      const body = await fetchJsonWithRetry(url, {
        label: `${label} batch ${Math.floor(i / BATCH) + 1}/${batches}`,
      });
      if (body.status !== 'OK') {
        throw new Error(`Open Topo Data returned status "${body.status}": ${body.error ?? ''}`);
      }
      body.results.forEach((r, j) => {
        const elevation = typeof r.elevation === 'number' ? r.elevation : null;
        this.cache.set(chunk[j][2], elevation);
      });
      this.fetched += chunk.length;
      this.cache.flush();
      process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH, missing.length)}/${missing.length}   `);
      if (i + BATCH < missing.length) await sleep(RATE_LIMIT_MS);
    }
    process.stdout.write('\n');
    return this.fetched;
  }

  // Attach elevations to points, returning [lat, lon, ele]. Points with no DEM
  // value keep their existing third element if they had one.
  attach(points) {
    let missing = 0;
    const out = points.map((p) => {
      const e = this.cachedOnly(p[0], p[1]);
      if (e == null) {
        if (typeof p[2] === 'number') return [p[0], p[1], p[2]];
        missing += 1;
        return [p[0], p[1]];
      }
      return [p[0], p[1], e];
    });
    if (missing > 0) {
      process.stderr.write(`  warning: ${missing} point(s) had no elevation available\n`);
    }
    return out;
  }

  // Highest DEM cell within a search box, used to verify that a peak's stated
  // coordinate really sits on the summit rather than nearby.
  async findLocalMaximum(lat, lon, { radiusM = 300, steps = 9 } = {}) {
    const latStep = radiusM / 111320 / (steps / 2);
    const lonStep = latStep / Math.cos((lat * Math.PI) / 180);
    const grid = [];
    for (let i = 0; i < steps; i += 1) {
      for (let j = 0; j < steps; j += 1) {
        grid.push([lat + (i - (steps - 1) / 2) * latStep, lon + (j - (steps - 1) / 2) * lonStep]);
      }
    }
    await this.warm(grid, { label: `peak probe ${lat.toFixed(4)},${lon.toFixed(4)}` });
    let best = { lat, lon, elevation: -Infinity };
    for (const [gLat, gLon] of grid) {
      const e = this.cachedOnly(gLat, gLon);
      if (e != null && e > best.elevation) best = { lat: gLat, lon: gLon, elevation: e };
    }
    return best;
  }

  flush() {
    this.cache.flush();
  }
}
