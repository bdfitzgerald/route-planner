// OS grid reference -> WGS84 lat/lon.
//
// Two stages: inverse transverse Mercator onto the Airy 1830 ellipsoid to get
// OSGB36 lat/lon, then a Helmert transformation to WGS84. Accurate to a few
// metres, which is well inside the precision of a grid reference itself (a
// 6-figure ref only locates a 100m square).

const AIRY = { a: 6377563.396, b: 6356256.909 };
const WGS84 = { a: 6378137.0, b: 6356752.3141 };
const F0 = 0.9996012717;
const LAT0 = (49 * Math.PI) / 180;
const LON0 = (-2 * Math.PI) / 180;
const E0 = 400000;
const N0 = -100000;

export function gridrefToEastingNorthing(ref) {
  const clean = ref.replace(/\s+/g, '').toUpperCase();
  const m = clean.match(/^([A-Z]{2})(\d+)$/);
  if (!m) throw new Error(`Malformed OS grid reference: "${ref}"`);
  const [, letters, digits] = m;
  if (digits.length % 2 !== 0) {
    throw new Error(`Grid reference "${ref}" has an odd number of digits`);
  }

  let l1 = letters.charCodeAt(0) - 65;
  let l2 = letters.charCodeAt(1) - 65;
  // 'I' is not used in the national grid, so letters after it shift down one.
  if (l1 > 7) l1 -= 1;
  if (l2 > 7) l2 -= 1;

  const e100km = (((l1 - 2) % 5) + 5) % 5 * 5 + (l2 % 5);
  const n100km = 19 - Math.floor(l1 / 5) * 5 - Math.floor(l2 / 5);

  const half = digits.length / 2;
  const scale = 10 ** (5 - half);
  return {
    easting: e100km * 100000 + Number(digits.slice(0, half)) * scale,
    northing: n100km * 100000 + Number(digits.slice(half)) * scale,
  };
}

function eastingNorthingToOsgb36(easting, northing) {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let lat = LAT0;
  let M = 0;
  // Iterate the meridional arc until the northing converges to 0.01mm.
  for (let guard = 0; Math.abs(northing - N0 - M) >= 0.00001; guard += 1) {
    if (guard > 100) throw new Error('Meridional arc failed to converge');
    lat += (northing - N0 - M) / (a * F0);
    const dl = lat - LAT0;
    const sl = lat + LAT0;
    const Ma = (1 + n + 1.25 * n * n + 1.25 * n ** 3) * dl;
    const Mb = (3 * n + 3 * n * n + 2.625 * n ** 3) * Math.sin(dl) * Math.cos(sl);
    const Mc = (1.875 * n * n + 1.875 * n ** 3) * Math.sin(2 * dl) * Math.cos(2 * sl);
    const Md = ((35 / 24) * n ** 3) * Math.sin(3 * dl) * Math.cos(3 * sl);
    M = b * F0 * (Ma - Mb + Mc - Md);
  }

  const sinLat = Math.sin(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sinLat * sinLat) ** 1.5;
  const eta2 = nu / rho - 1;

  const t = Math.tan(lat);
  const t2 = t * t;
  const sec = 1 / Math.cos(lat);

  const VII = t / (2 * rho * nu);
  const VIII = (t / (24 * rho * nu ** 3)) * (5 + 3 * t2 + eta2 - 9 * t2 * eta2);
  const IX = (t / (720 * rho * nu ** 5)) * (61 + 90 * t2 + 45 * t2 * t2);
  const X = sec / nu;
  const XI = (sec / (6 * nu ** 3)) * (nu / rho + 2 * t2);
  const XII = (sec / (120 * nu ** 5)) * (5 + 28 * t2 + 24 * t2 * t2);
  const XIIA = (sec / (5040 * nu ** 7)) * (61 + 662 * t2 + 1320 * t2 * t2 + 720 * t2 ** 3);

  const d = easting - E0;
  return {
    lat: lat - VII * d ** 2 + VIII * d ** 4 - IX * d ** 6,
    lon: LON0 + X * d - XI * d ** 3 + XII * d ** 5 - XIIA * d ** 7,
  };
}

function helmertToWgs84(latRad, lonRad, height = 0) {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const v = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);

  const x = (v + height) * Math.cos(latRad) * Math.cos(lonRad);
  const y = (v + height) * Math.cos(latRad) * Math.sin(lonRad);
  const z = ((1 - e2) * v + height) * Math.sin(latRad);

  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = -20.4894e-6;
  const asRad = (arcsec) => (arcsec / 3600) * (Math.PI / 180);
  const rx = asRad(0.1502);
  const ry = asRad(0.247);
  const rz = asRad(0.8421);

  const x2 = tx + x * (1 + s) - y * rz + z * ry;
  const y2 = ty + x * rz + y * (1 + s) - z * rx;
  const z2 = tz - x * ry + y * rx + z * (1 + s);

  const e22 = 1 - (WGS84.b * WGS84.b) / (WGS84.a * WGS84.a);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let lat2 = Math.atan2(z2, p * (1 - e22));
  for (let i = 0; i < 12; i += 1) {
    const v2 = WGS84.a / Math.sqrt(1 - e22 * Math.sin(lat2) ** 2);
    lat2 = Math.atan2(z2 + e22 * v2 * Math.sin(lat2), p);
  }

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (Math.atan2(y2, x2) * 180) / Math.PI,
  };
}

export function gridrefToWgs84(ref) {
  const { easting, northing } = gridrefToEastingNorthing(ref);
  const osgb36 = eastingNorthingToOsgb36(easting, northing);
  return helmertToWgs84(osgb36.lat, osgb36.lon);
}
