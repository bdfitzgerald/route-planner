const U = 'https://lakeland-way.netlify.app';
const paths = ['/', '/app.js', '/config.js', '/share.js', '/resolve.js', '/styles.css',
  '/route-data.json', '/gpx/lakeland-way/lakeland-way-full-base.gpx',
  '/gpx/lakeland-way/lakeland-way-cw-day-07.gpx'];
let bad = 0;
console.log('=== production ===');
for (const p of paths) {
  const r = await fetch(U + p);
  const b = Buffer.from(await r.arrayBuffer());
  if (!r.ok) bad += 1;
  console.log(`  ${r.status}  ${String(b.length).padStart(9)}  ${(r.headers.get('content-type') || '').split(';')[0].padEnd(23)} ${p}`);
}
const data = await (await fetch(U + '/route-data.json')).json();
console.log(`\n  route      : ${data.route.name}, ${data.route.totalKm}km, ${data.route.days} days from ${data.route.startDate}`);
console.log(`  points     : ${data.categories.reduce((s, c) => s + c.items.length, 0)}`);
console.log(`  presets    : ${(data.shippedPresets ?? []).map((p) => `"${p.name}" (${p.ids.length})`).join(', ') || 'none'}`);
console.log(`  exports    : ${(data.exports ?? []).length} prebuilt GPX`);

const cfg = await (await fetch(U + '/config.js')).text();
const key = cfg.match(/"osMapsKey":"([^"]*)"/)?.[1];
const tile = await fetch(`https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/12/2010/1283.png?key=${key}`,
  { headers: { Referer: U + '/' } });
console.log(`  OS tiles   : key ${key ? 'present' : 'ABSENT'}, tile request ${tile.status} ${tile.ok ? '(authorised)' : '(refused)'}`);

const old = await fetch(U + '/index.html');
const html = await old.text();
console.log(`  old site   : ${/x1\.20|Cumbria Way reality/.test(html) ? 'STILL PRESENT' : 'replaced'}`);
console.log(bad ? `\n  ${bad} PATH(S) FAILED` : '\n  all paths serve correctly');
