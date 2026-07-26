// Site wild camps on genuinely campable ground, then split the route into days.
//
// Replaces the old site's twelve camps, which were simply the loop divided into
// twelve equal 17.36km pieces and landed wherever that fell.
//
// These are fell pitches, not valley ones. Height is the dominant term: a night on
// a col or shoulder at 500-700m is the point of the trip, and a pitch in enclosed
// valley land is both duller and harder to justify. An earlier version weighted
// day-evenness about ten times too heavily and put seven of eleven camps below
// 300m; the balance here lets altitude win, bounded by a hard minimum and maximum
// day length rather than by a penalty.
//
// Scoring uses real terrain data:
//   altitude   - high on the fell, short of the worst exposure
//   gradient   - flat enough to pitch, measured from the DEM
//   water      - a tarn or beck within reach for water and for swimming
//   fell        - close to a named summit, so the pitch has a fell to it
//   spacing    - bounded, not optimised: any day between the limits is acceptable
//
// One camp set serves both directions: on a closed loop walked the other way the
// same pitches come round in reverse, so the anticlockwise day lengths are the
// clockwise ones reversed. There is no need for a second invented set.
//
// Usage: node scripts/research/site-camps.mjs

import fs from 'node:fs';
import { parseGpx, flattenTrack } from '../lib/gpx.mjs';
import { cumulativeDistances, haversine } from '../lib/geo.mjs';
import { ElevationService } from '../lib/elevation.mjs';

const ROUTE_DIR = 'routes/lakeland-way';
const route = JSON.parse(fs.readFileSync(`${ROUTE_DIR}/route.json`, 'utf8'));
const DAYS = route.days;
const MAX_DAY_KM = route.planning.maxDayKm;
// The first and last legs are travel days. Capped at both ends, not one: walked the
// other way round, today's final leg becomes day 1, so a one-ended cap would be
// broken simply by choosing anticlockwise.
const END_DAY_MAX_KM = route.planning.endDayMaxKm ?? route.planning.maxDayKm;

// A pitch wants to be well up the fell and off enclosed farmland, without sitting
// on an exposed summit plateau. Low ground is allowed only because parts of this
// route offer nothing else — km 128-152 tops out at 260m over 24km — but it is
// scored down hard.
// Hard floor, set by what the route can actually support rather than by taste.
// Measured largest gap between pitchable ground above each floor:
//   200m -> 15.7km  feasible
//   250m -> 31.3km  fails the 30km day ceiling by 1.3km
//   300m -> 33.9km  fails
// So 200m it is, and the scoring below does the rest: the ramp is steep enough that
// anything under PREFERRED_ALT only wins where the fells genuinely offer nothing,
// which on this route is the Grasmere-Rydal stretch around km 124-155.
const MIN_ALT = 200;
const PREFERRED_ALT = 380;
const IDEAL_ALT = [450, 700];
const SOFT_MAX_ALT = 780;
const MAX_GRADIENT = 0.14; // ~8 degrees
const WATER_IDEAL_M = 400;
const FELL_IDEAL_M = 1500;
const MIN_DAY_KM = 7;

const pts = flattenTrack(parseGpx(fs.readFileSync(`${ROUTE_DIR}/${route.baseGpx}`, 'utf8')));
const elevation = new ElevationService();
const track = elevation.attach(pts);
const cum = cumulativeDistances(track);
const totalKm = cum[cum.length - 1] / 1000;

const water = JSON.parse(fs.readFileSync('cache/osm-water.json', 'utf8')).filter(
  (w) => w.kind !== 'waterfall',
);

// Named fells, so each pitch can be described by the fell it is on rather than as
// an anonymous point on a hillside. Small tops are poor anchors, so only real fells.
const fells = JSON.parse(fs.readFileSync(`${ROUTE_DIR}/peaks/peaks.json`, 'utf8')).items.filter(
  (p) => p.heightM >= 350,
);

// Candidate pitches every ~250m along the line.
const SPACING_M = 250;
const candidates = [];
let nextAt = SPACING_M;
for (let i = 1; i < track.length - 1; i += 1) {
  if (cum[i] < nextAt) continue;
  nextAt = cum[i] + SPACING_M;
  const ele = track[i][2];
  if (typeof ele !== 'number') continue;

  // Local gradient along the line, over a ~200m window either side.
  let lo = i;
  let hi = i;
  while (lo > 0 && cum[i] - cum[lo] < 200) lo -= 1;
  while (hi < track.length - 1 && cum[hi] - cum[i] < 200) hi += 1;
  const run = cum[hi] - cum[lo];
  const rise = Math.abs((track[hi][2] ?? ele) - (track[lo][2] ?? ele));
  const gradient = run > 0 ? rise / run : 1;

  let waterM = Infinity;
  let waterName = null;
  for (const w of water) {
    const d = haversine([track[i][0], track[i][1]], [w.lat, w.lon]);
    if (d < waterM) {
      waterM = d;
      waterName = w.name;
    }
  }

  let fellM = Infinity;
  let fell = null;
  for (const f of fells) {
    const d = haversine([track[i][0], track[i][1]], [f.lat, f.lon]);
    if (d < fellM) {
      fellM = d;
      fell = f;
    }
  }

  candidates.push({
    index: i,
    lat: track[i][0],
    lon: track[i][1],
    ele,
    gradient,
    km: cum[i] / 1000,
    waterM,
    waterName,
    fellM: Number.isFinite(fellM) ? fellM : null,
    fellName: fell?.title ?? null,
    fellHeightM: fell?.heightM ?? null,
  });
}

const score = (c) => {
  if (c.ele < MIN_ALT) return -Infinity;
  if (c.gradient > MAX_GRADIENT) return -Infinity;
  let s = 0;

  // Altitude, and by a wide margin the most important thing.
  if (c.ele >= IDEAL_ALT[0] && c.ele <= IDEAL_ALT[1]) s += 100;
  else if (c.ele < IDEAL_ALT[0]) {
    // Ramp up from nothing at MIN_ALT to full marks at the ideal band, with a
    // deliberate cliff below PREFERRED_ALT so valley pitches lose badly.
    const frac = (c.ele - MIN_ALT) / (IDEAL_ALT[0] - MIN_ALT);
    s += 100 * frac ** 2;
    if (c.ele < PREFERRED_ALT) s -= 25;
  } else {
    s += Math.max(55, 100 - (c.ele - IDEAL_ALT[1]) / 4); // very high = exposed
    if (c.ele > SOFT_MAX_ALT) s -= 20;
  }

  // Flat enough to pitch.
  s += 25 * (1 - Math.min(1, c.gradient / MAX_GRADIENT));

  // Water on hand.
  if (c.waterM <= WATER_IDEAL_M) s += 20;
  else if (c.waterM <= 1500) s += 20 * (1 - (c.waterM - WATER_IDEAL_M) / (1500 - WATER_IDEAL_M));

  // A named fell to camp on rather than an anonymous bit of hillside.
  if (c.fellM != null && c.fellM <= FELL_IDEAL_M) s += 20 * (1 - c.fellM / FELL_IDEAL_M);

  return s;
};

for (const c of candidates) c.score = score(c);
const viable = candidates.filter((c) => Number.isFinite(c.score));

console.log(`route ${totalKm.toFixed(1)}km, ${candidates.length} candidate pitches, ${viable.length} viable on terrain\n`);

// Choose DAYS-1 interior camps by dynamic programming: maximise total pitch
// quality minus a penalty for days straying from even, and forbid any day over
// the hard ceiling.
const targetKm = totalKm / DAYS;
const byKm = viable.slice().sort((a, b) => a.km - b.km);

// Day length is a constraint, not an objective: anything between the bounds is
// acceptable, with only a gentle pull towards the average so the itinerary does not
// become wildly lopsided. Weighted far below pitch quality on purpose.
const dayCost = (len) => {
  if (len > MAX_DAY_KM || len < MIN_DAY_KM) return -Infinity;
  return -0.35 * (len - targetKm) ** 2;
};

// best[d][i] = best total value using d camps, the last at candidate i
const n = byKm.length;
const NEG = -Infinity;
let prev = new Float64Array(n).fill(NEG);
const backptr = [];
for (let i = 0; i < n; i += 1) {
  // day 1 runs from the start to this first camp
  if (byKm[i].km > END_DAY_MAX_KM) continue;
  const c = dayCost(byKm[i].km);
  if (c !== NEG) prev[i] = c + byKm[i].score;
}
backptr.push(new Int32Array(n).fill(-1));

for (let d = 2; d <= DAYS - 1; d += 1) {
  const cur = new Float64Array(n).fill(NEG);
  const bp = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (prev[j] === NEG) continue;
      const len = byKm[i].km - byKm[j].km;
      if (len > MAX_DAY_KM) continue;
      const v = prev[j] + dayCost(len) + byKm[i].score;
      if (v > cur[i]) {
        cur[i] = v;
        bp[i] = j;
      }
    }
  }
  prev = cur;
  backptr.push(bp);
}

// close the loop: final day runs from the last camp back to the start
let bestEnd = -1;
let bestVal = NEG;
for (let i = 0; i < n; i += 1) {
  if (prev[i] === NEG) continue;
  // the final leg runs from the last camp back to the start
  if (totalKm - byKm[i].km > END_DAY_MAX_KM) continue;
  const v = prev[i] + dayCost(totalKm - byKm[i].km);
  if (v > bestVal) {
    bestVal = v;
    bestEnd = i;
  }
}
if (bestEnd < 0) {
  throw new Error(
    `No feasible camp plan: ${DAYS} days, ${MIN_DAY_KM}-${MAX_DAY_KM}km each, ` +
      `first and last legs capped at ${END_DAY_MAX_KM}km, pitches at or above ${MIN_ALT}m.`,
  );
}

const chosen = [];
let idx = bestEnd;
for (let d = DAYS - 1; d >= 1; d -= 1) {
  chosen.push(byKm[idx]);
  idx = backptr[d - 1][idx];
  if (idx < 0) break;
}
chosen.reverse();

const bounds = [0, ...chosen.map((c) => c.km), totalKm];
const dayLengths = bounds.slice(1).map((b, i) => b - bounds[i]);

console.log('=== CAMPS (clockwise order) ===');
console.log(`${'night'.padStart(5)} ${'km'.padStart(7)} ${'day'.padStart(6)} ${'alt'.padStart(5)} ${'grad'.padStart(5)} ${'water'.padStart(6)}  nearest fell (dist)`);
chosen.forEach((c, i) => {
  console.log(
    `${String(i + 1).padStart(5)} ${c.km.toFixed(1).padStart(7)} ${dayLengths[i].toFixed(1).padStart(6)} ${`${c.ele.toFixed(0)}m`.padStart(5)} ${(c.gradient * 100).toFixed(1).padStart(4)}% ${`${c.waterM < 2000 ? `${c.waterM.toFixed(0)}m` : '-'}`.padStart(6)}  ${c.fellName ?? '-'}${c.fellM != null && c.fellM < 4000 ? ` (${(c.fellM / 1000).toFixed(1)}km)` : ''}`,
  );
});
console.log(`${'end'.padStart(5)} ${totalKm.toFixed(1).padStart(7)} ${dayLengths[DAYS - 1].toFixed(1).padStart(6)}`);

console.log(`\nday lengths (cw) : ${dayLengths.map((d) => d.toFixed(1)).join(', ')}`);
console.log(`day lengths (acw): ${dayLengths.slice().reverse().map((d) => d.toFixed(1)).join(', ')}`);
console.log(`min ${Math.min(...dayLengths).toFixed(1)}km  max ${Math.max(...dayLengths).toFixed(1)}km  mean ${(totalKm / DAYS).toFixed(1)}km`);

const longRun = (() => {
  let run = 0;
  let worst = 0;
  for (const d of dayLengths) {
    run = d >= route.planning.longDayKm ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  return worst;
})();
console.log(`longest run of days >=${route.planning.longDayKm}km: ${longRun}`);

const out = {
  category: 'wildcamp-spots',
  label: 'Wild camps',
  glyph: '▲',
  source:
    'Sited by scoring the route every 250m on DEM altitude and gradient, distance to open water, and proximity to a named fell, then choosing the day boundaries by dynamic programming. Height dominates the score: these are fell pitches, not valley ones. Day length is bounded (7-30km) rather than optimised, so a good pitch is not passed over for an even itinerary. One set serves both directions.',
  legalNote:
    'There is no general right to wild camp in the Lake District. These pitches are chosen to suit the accepted convention: high ground well above the enclosed valley land, arriving late, leaving early, one night only, no fires, and no trace. Pitches near a farm or in a valley bottom may need the landowner\'s permission.',
  items: chosen.map((c, i) => ({
    id: `camp-night-${i + 1}`,
    title: `Night ${i + 1}`,
    night: i + 1,
    lat: Number(c.lat.toFixed(6)),
    lon: Number(c.lon.toFixed(6)),
    routeKm: Number(c.km.toFixed(2)),
    elevationM: Number(c.ele.toFixed(0)),
    gradient: Number(c.gradient.toFixed(4)),
    nearestWater: c.waterName,
    nearestWaterM: Number.isFinite(c.waterM) ? Number(c.waterM.toFixed(0)) : null,
    nearestFell: c.fellName,
    nearestFellM: c.fellM == null ? null : Number(c.fellM.toFixed(0)),
    nearestFellHeightM: c.fellHeightM,
    labels: [
      c.ele >= 600 ? 'high fell pitch' : c.ele >= 380 ? 'fell pitch' : 'low pitch',
      c.waterM <= WATER_IDEAL_M ? 'water on site' : 'water nearby',
      ...(c.fellM != null && c.fellM <= FELL_IDEAL_M ? [`below ${c.fellName}`] : []),
    ],
    description: null,
  })),
};

fs.mkdirSync(`${ROUTE_DIR}/wildcamp-spots`, { recursive: true });
fs.writeFileSync(`${ROUTE_DIR}/wildcamp-spots/wildcamp-spots.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log('\nwrote routes/lakeland-way/wildcamp-spots/wildcamp-spots.json');
