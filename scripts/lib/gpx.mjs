// Minimal GPX reader/writer. Deliberately dependency-free: the input files are
// well-formed exports from OS Maps / AllTrails, and the output only needs the
// subset of GPX 1.1 that OS Maps, Komoot, Garmin and Gaia all read.

function decodeXmlText(raw) {
  if (raw == null) return '';
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .trim();
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function childText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXmlText(m[1]) : null;
}

export function parseGpx(xml) {
  const metadataBlock = xml.match(/<metadata[\s\S]*?<\/metadata>/i)?.[0] ?? '';
  const name =
    childText(metadataBlock, 'name') ??
    childText(xml.match(/<trk>[\s\S]*?<\/trk>/i)?.[0] ?? '', 'name') ??
    null;

  const waypoints = [];
  const wptRe = /<wpt\s[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/wpt>)/gi;
  for (let m = wptRe.exec(xml); m; m = wptRe.exec(xml)) {
    const body = m[3] ?? '';
    waypoints.push({
      lat: Number(m[1]),
      lon: Number(m[2]),
      name: childText(body, 'name'),
      desc: childText(body, 'desc'),
      ele: body ? Number(childText(body, 'ele')) || null : null,
    });
  }

  const tracks = [];
  const trkRe = /<trk>([\s\S]*?)<\/trk>/gi;
  for (let t = trkRe.exec(xml); t; t = trkRe.exec(xml)) {
    const trkBody = t[1];
    const segments = [];
    const segRe = /<trkseg>([\s\S]*?)<\/trkseg>/gi;
    for (let s = segRe.exec(trkBody); s; s = segRe.exec(trkBody)) {
      const points = [];
      const ptRe = /<trkpt\s[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
      for (let p = ptRe.exec(s[1]); p; p = ptRe.exec(s[1])) {
        const body = p[3] ?? '';
        const eleRaw = body ? childText(body, 'ele') : null;
        const ele = eleRaw == null || eleRaw === '' ? null : Number(eleRaw);
        points.push(
          ele == null || !Number.isFinite(ele)
            ? [Number(p[1]), Number(p[2])]
            : [Number(p[1]), Number(p[2]), ele],
        );
      }
      if (points.length) segments.push(points);
    }
    tracks.push({ name: childText(trkBody, 'name'), segments });
  }

  return { name, waypoints, tracks };
}

// Flatten every track segment in a parsed GPX into one continuous point list.
export function flattenTrack(parsed) {
  return parsed.tracks.flatMap((t) => t.segments.flat());
}

function renderWaypoint(w, tag = 'wpt') {
  const parts = [`  <${tag} lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">`];
  if (typeof w.ele === 'number' && Number.isFinite(w.ele)) {
    parts.push(`    <ele>${w.ele.toFixed(1)}</ele>`);
  }
  if (w.name) parts.push(`    <name>${escapeXml(w.name)}</name>`);
  if (w.desc) parts.push(`    <desc>${escapeXml(w.desc)}</desc>`);
  if (w.symbol) parts.push(`    <sym>${escapeXml(w.symbol)}</sym>`);
  if (w.type) parts.push(`    <type>${escapeXml(w.type)}</type>`);
  parts.push(`  </${tag}>`);
  return parts.join('\n');
}

function renderTrack(track) {
  const lines = ['  <trk>'];
  if (track.name) lines.push(`    <name>${escapeXml(track.name)}</name>`);
  if (track.desc) lines.push(`    <desc>${escapeXml(track.desc)}</desc>`);
  if (track.type) lines.push(`    <type>${escapeXml(track.type)}</type>`);
  lines.push('    <trkseg>');
  for (const p of track.points) {
    const hasEle = typeof p[2] === 'number' && Number.isFinite(p[2]);
    const open = `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">`;
    lines.push(hasEle ? `${open}<ele>${p[2].toFixed(1)}</ele></trkpt>` : `${open}</trkpt>`);
  }
  lines.push('    </trkseg>', '  </trk>');
  return lines.join('\n');
}

export function buildGpx({ name, desc, waypoints = [], tracks = [], time = null }) {
  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="route-planner"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`,
  ];
  if (desc) head.push(`    <desc>${escapeXml(desc)}</desc>`);
  if (time) head.push(`    <time>${time}</time>`);
  head.push('  </metadata>');

  const body = [
    ...waypoints.map((w) => renderWaypoint(w)),
    ...tracks.filter((t) => t.points?.length).map((t) => renderTrack(t)),
  ];

  return `${[...head, ...body, '</gpx>'].join('\n')}\n`;
}
