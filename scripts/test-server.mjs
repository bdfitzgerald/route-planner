// Tests the local dev server's preset API against a real file on disk.
//
// This is the mechanism that makes local presets permanent, so it is worth testing for
// real rather than mocking: it starts the server, exercises save / collision /
// overwrite / delete, and checks routes/<id>/presets.json actually changes and is
// restored afterwards.
//
// Usage: node scripts/test-server.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Vary the port so a leftover server from an interrupted run does not collide.
const PORT = 8123 + Number(process.hrtime.bigint() % 40n);
const PRESETS = path.join('routes', 'lakeland-way', 'presets.json');
const backup = fs.existsSync(PRESETS) ? fs.readFileSync(PRESETS, 'utf8') : null;

const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'ignore' });
const stop = () => {
  server.kill();
  if (backup === null) fs.rmSync(PRESETS, { force: true });
  else fs.writeFileSync(PRESETS, backup);
};
process.on('exit', stop);

await new Promise((r) => setTimeout(r, 900));

const B = `http://localhost:${PORT}`;
const j = async (m, p, body) => {
  // Build the init without a body key at all for GET/DELETE: passing body: undefined is
  // still passing a body, which is invalid for those methods.
  const init = { method: m };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const r = await fetch(B + p, init);
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const ck = (n, ok, d = '') => {
  if (!ok) fails += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`);
};

let r = await j('GET', '/api/presets');
ck('GET returns the file', r.status === 200 && Array.isArray(r.body.presets), `${r.body?.presets?.length} presets`);
const before = r.body.presets.length;

r = await j('POST', '/api/presets', { name: 'API test', ids: ['peak-helvellyn', 'peak-cat-bells'], direction: 'cw', mode: 'over' });
ck('POST saves a new preset', r.status === 200 && r.body.saved.name === 'API test');
ck('ids are sorted, for a stable diff', JSON.stringify(r.body.saved.ids) === JSON.stringify(['peak-cat-bells', 'peak-helvellyn']));
ck('it reached the file on disk', JSON.parse(fs.readFileSync(PRESETS, 'utf8')).presets.some((p) => p.name === 'API test'));

r = await j('POST', '/api/presets', { name: 'API test', ids: ['peak-scafell-pike'] });
ck('a reused name is refused, not overwritten', r.status === 409 && r.body.error === 'exists');
r = await j('GET', '/api/presets');
ck('the original survived that refusal', r.body.presets.find((p) => p.name === 'API test').ids.length === 2);

r = await j('POST', '/api/presets', { name: 'API test', ids: ['peak-scafell-pike'], overwrite: true });
ck('explicit overwrite replaces it', r.status === 200 && r.body.overwrote === true);
ck('contents really changed', (await j('GET', '/api/presets')).body.presets.find((p) => p.name === 'API test').ids.length === 1);

ck('empty name refused', (await j('POST', '/api/presets', { name: '', ids: ['x'] })).status === 400);
ck('empty selection refused', (await j('POST', '/api/presets', { name: 'Nope', ids: [] })).status === 400);

r = await j('DELETE', '/api/presets/API%20test');
ck('DELETE removes it', r.status === 200 && !r.body.presets.some((p) => p.name === 'API test'));
ck('deleting a missing preset 404s', (await j('DELETE', '/api/presets/Not%20there')).status === 404);
ck('back to the original count', (await j('GET', '/api/presets')).body.presets.length === before);

const page = await fetch(`${B}/`);
ck('still serves the page', page.status === 200 && (await page.text()).includes('Lakeland Way'));
const esc = await fetch(`${B}/../package.json`);
ck('cannot escape the publish root', esc.status === 403 || esc.status === 404, `got ${esc.status}`);

console.log(fails ? `\n${fails} FAILED` : '\nALL DEV SERVER CHECKS PASSED');
stop();
process.exit(fails ? 1 : 0);
