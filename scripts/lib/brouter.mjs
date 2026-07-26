// Detour spur routing via BRouter.
//
// The base route is trusted as drawn and is never sent here. BRouter is used
// only for the peak and swim spurs, where the old site drew straight lines
// between grid references instead of following paths.
//
// Profile: hiking-mountain. It prefers real paths and tracks, accepts open
// access land and unmade fell paths (essential in the Lakes, where summit
// approaches are often not formal rights of way), and returns per-point
// elevation plus a noise-filtered ascent figure.

import { JsonCache, fetchJsonWithRetry, sleep } from './cache.mjs';

const ENDPOINT = 'https://brouter.de/brouter';
const PROFILE = 'hiking-mountain';
const RATE_LIMIT_MS = 1200;

const keyFor = (waypoints, profile) =>
  `${profile}|${waypoints.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(';')}`;

export class RoutingService {
  constructor({ cachePath = 'cache/brouter.json', profile = PROFILE } = {}) {
    this.cache = new JsonCache(cachePath);
    this.profile = profile;
    this.requests = 0;
  }

  // Route through an ordered list of [lat, lon] waypoints. Returns
  // { points: [[lat,lon,ele]...], lengthM, ascentM } or null if unroutable.
  async route(waypoints, { label = '' } = {}) {
    if (!waypoints || waypoints.length < 2) return null;
    const k = keyFor(waypoints, this.profile);
    if (this.cache.has(k)) return this.cache.get(k);

    const lonlats = waypoints.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join('|');
    const url =
      `${ENDPOINT}?lonlats=${lonlats}&profile=${this.profile}` +
      '&alternativeidx=0&format=geojson';

    let body;
    try {
      body = await fetchJsonWithRetry(url, { label: label || 'brouter', attempts: 3 });
    } catch (err) {
      process.stderr.write(`  routing failed for ${label || k}: ${err.message}\n`);
      this.cache.set(k, null);
      this.cache.flush();
      return null;
    }

    const feature = body?.features?.[0];
    if (!feature?.geometry?.coordinates?.length) {
      process.stderr.write(`  routing returned no geometry for ${label || k}\n`);
      this.cache.set(k, null);
      this.cache.flush();
      return null;
    }

    const props = feature.properties ?? {};
    const result = {
      points: feature.geometry.coordinates.map(([lon, lat, ele]) =>
        typeof ele === 'number' ? [lat, lon, ele] : [lat, lon],
      ),
      lengthM: Number(props['track-length']) || null,
      ascentM: Number(props['filtered ascend']) || null,
      profile: this.profile,
    };

    this.cache.set(k, result);
    this.cache.flush();
    this.requests += 1;
    await sleep(RATE_LIMIT_MS);
    return result;
  }

  flush() {
    this.cache.flush();
  }
}
