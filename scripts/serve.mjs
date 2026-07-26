// Local development server.
//
// Serves site/ the way Netlify does, and adds a small API the page uses only in local
// mode to persist presets to disk:
//
//   GET    /api/presets        the current routes/<id>/presets.json
//   POST   /api/presets        { name, ids, direction, mode } -> saved permanently
//   DELETE /api/presets/:name  remove one
//
// The point of the split: planning happens here, on a machine with a filesystem, so a
// preset saved locally is written to a committed file and can be deployed. On the
// deployed site there is no filesystem and no login, so presets there live in the
// browser only — useful on a phone for a one-off tweak, but not something to rely on.
//
// Binds to localhost only. There is no auth because there is nothing to authenticate:
// it is your own machine, and it never runs anywhere else.
//
// Usage: node scripts/serve.mjs [port]

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const ROUTE_ID = process.env.ROUTE_ID ?? 'lakeland-way';
const SITE = path.resolve('site');
const PRESETS = path.join('routes', ROUTE_ID, 'presets.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gpx': 'application/gpx+xml',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const readPresets = () => {
  if (!fs.existsSync(PRESETS)) return { presets: [] };
  try {
    return JSON.parse(fs.readFileSync(PRESETS, 'utf8'));
  } catch {
    return { presets: [] };
  }
};

const writePresets = (data) => {
  fs.mkdirSync(path.dirname(PRESETS), { recursive: true });
  fs.writeFileSync(PRESETS, `${JSON.stringify(data, null, 2)}\n`);
};

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // A preset is a few kB at most; refuse anything absurd.
      if (raw.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = decodeURIComponent(url.pathname);

  // --- preset API ---
  if (route === '/api/presets' && req.method === 'GET') {
    return json(res, 200, readPresets());
  }

  if (route === '/api/presets' && req.method === 'POST') {
    let incoming;
    try {
      incoming = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const name = String(incoming?.name ?? '').trim().slice(0, 40);
    const ids = Array.isArray(incoming?.ids) ? incoming.ids.filter((i) => typeof i === 'string') : [];
    if (!name) return json(res, 400, { error: 'name is required' });
    if (!ids.length) return json(res, 400, { error: 'nothing selected' });

    const data = readPresets();
    const entry = {
      name,
      ids: [...ids].sort(),
      direction: incoming.direction ?? null,
      mode: incoming.mode ?? null,
    };
    const at = data.presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    const overwrote = at >= 0;
    // An explicit overwrite flag is required to replace, so a reused name cannot
    // quietly destroy a saved plan — the same rule the page applies in the browser.
    if (overwrote && !incoming.overwrite) {
      return json(res, 409, { error: 'exists', existing: data.presets[at] });
    }
    if (overwrote) data.presets[at] = entry;
    else data.presets.push(entry);
    writePresets(data);
    process.stdout.write(`  ${overwrote ? 'updated' : 'saved'} preset "${name}" (${ids.length} points) -> ${PRESETS}\n`);
    return json(res, 200, { saved: entry, overwrote, presets: data.presets });
  }

  if (route.startsWith('/api/presets/') && req.method === 'DELETE') {
    const name = route.slice('/api/presets/'.length);
    const data = readPresets();
    const before = data.presets.length;
    data.presets = data.presets.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
    if (data.presets.length === before) return json(res, 404, { error: 'not found' });
    writePresets(data);
    process.stdout.write(`  deleted preset "${name}" -> ${PRESETS}\n`);
    return json(res, 200, { presets: data.presets });
  }

  if (route.startsWith('/api/')) return json(res, 405, { error: 'method not allowed' });

  // --- static, scoped to site/ ---
  const file = path.resolve(path.join(SITE, route === '/' ? '/index.html' : route));
  if (!file.startsWith(SITE)) {
    res.writeHead(403).end('outside the publish root');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const count = readPresets().presets.length;
  process.stdout.write(
    `\nLocal planner on http://localhost:${PORT}\n` +
      `  serving   site/\n` +
      `  presets   ${PRESETS} (${count} saved) — saves here are permanent and deployable\n\n`,
  );
});
