// Geometry helpers. Points are [lat, lon] or [lat, lon, elevation].

const EARTH_RADIUS_M = 6371008.8;
const TO_RAD = Math.PI / 180;

export function haversine(a, b) {
  const dLat = (b[0] - a[0]) * TO_RAD;
  const dLon = (b[1] - a[1]) * TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * TO_RAD) * Math.cos(b[0] * TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function cumulativeDistances(points) {
  const out = new Float64Array(points.length);
  for (let i = 1; i < points.length; i += 1) {
    out[i] = out[i - 1] + haversine(points[i - 1], points[i]);
  }
  return out;
}

export function totalDistance(points) {
  const c = cumulativeDistances(points);
  return c.length ? c[c.length - 1] : 0;
}

export function nearestIndex(points, target) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = haversine(points[i], target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return { index: best, distance: bestDist };
}

// Moving average over the elevation channel. DEM samples along a track are
// noisy at 30m posting; smoothing before summing gradients stops that noise
// being counted as real climbing.
export function smoothElevations(points, window = 5) {
  if (window <= 1) return points.map((p) => p.slice());
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j += 1) {
      const e = points[j][2];
      if (typeof e === 'number' && Number.isFinite(e)) {
        sum += e;
        n += 1;
      }
    }
    const out = p.slice();
    if (n > 0) out[2] = sum / n;
    return out;
  });
}

// Total ascent with hysteresis: a rise only counts once it clears `threshold`
// above the running low, which rejects DEM jitter without discarding real
// climbs. Returns metres.
export function totalAscent(points, { threshold = 8, smoothWindow = 5 } = {}) {
  const pts = smoothElevations(points, smoothWindow).filter(
    (p) => typeof p[2] === 'number' && Number.isFinite(p[2]),
  );
  if (pts.length < 2) return 0;

  let ascent = 0;
  let reference = pts[0][2];
  let peak = pts[0][2];
  let climbing = false;

  for (let i = 1; i < pts.length; i += 1) {
    const e = pts[i][2];
    if (e > peak) peak = e;
    if (!climbing) {
      if (e > reference + threshold) {
        climbing = true;
        peak = e;
      } else if (e < reference) {
        reference = e;
      }
    } else if (e < peak - threshold) {
      ascent += peak - reference;
      reference = e;
      peak = e;
      climbing = false;
    }
  }
  if (climbing && peak > reference) ascent += peak - reference;
  return ascent;
}

export function totalDescent(points, opts) {
  const flipped = points.map((p) => [p[0], p[1], typeof p[2] === 'number' ? -p[2] : p[2]]);
  return totalAscent(flipped, opts);
}

// Inclusive slice of a route between two indices. On a closed loop the walk may
// wrap past the seam, so `from` greater than `to` wraps rather than reversing.
export function sliceRoute(points, from, to, { closed = false } = {}) {
  if (from <= to) return points.slice(from, to + 1);
  if (!closed) return points.slice(to, from + 1).reverse();
  return [...points.slice(from), ...points.slice(0, to + 1)];
}

// Replace the stretch of `route` between the detour's two junction points with
// the detour geometry itself. Used to splice a peak or swim spur into the day's
// line so distance and ascent reflect what is actually walked.
export function spliceDetour(route, detour, { closed = false } = {}) {
  if (!detour || detour.length < 2) return route.slice();
  const entry = nearestIndex(route, detour[0]);
  const exit = nearestIndex(route, detour[detour.length - 1]);
  const lo = Math.min(entry.index, exit.index);
  const hi = Math.max(entry.index, exit.index);
  const body = entry.index <= exit.index ? detour : detour.slice().reverse();
  // A spur whose junctions collapse onto the same point is an out-and-back:
  // insert it without removing any of the base route.
  if (lo === hi) return [...route.slice(0, lo + 1), ...body, ...route.slice(lo + 1)];
  if (closed && hi - lo > route.length / 2) {
    return [...route.slice(lo, hi + 1), ...body];
  }
  return [...route.slice(0, lo + 1), ...body, ...route.slice(hi)];
}

// Ramer-Douglas-Peucker simplification, for keeping exported GPX a sane size
// without visibly changing the line. `tolerance` is in metres.
export function simplify(points, tolerance = 2) {
  if (points.length < 3) return points.slice();

  const perpendicular = (p, a, b) => {
    const latToM = 111320;
    const lonToM = 111320 * Math.cos(((a[0] + b[0]) / 2) * TO_RAD);
    const px = (p[1] - a[1]) * lonToM;
    const py = (p[0] - a[0]) * latToM;
    const bx = (b[1] - a[1]) * lonToM;
    const by = (b[0] - a[0]) * latToM;
    const len2 = bx * bx + by * by;
    if (len2 === 0) return Math.hypot(px, py);
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    return Math.hypot(px - t * bx, py - t * by);
  };

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicular(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx !== -1 && maxDist > tolerance) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
