// Manage the presets that ship with the site.
//
// These live in routes/<route-id>/presets.json, are committed, and are baked into
// route-data.json by the build — so they appear on every origin with no login, no
// localStorage and nothing to import. That is the whole point: there is no auth here,
// so a preset that only exists in one browser is a preset you will lose.
//
// The input is the "Copy link" URL from the planner, which already encodes direction,
// peaks mode and the full selection.
//
//   node scripts/preset.mjs list
//   node scripts/preset.mjs add "Peaks and swims" "<paste the copied link>"
//   node scripts/preset.mjs remove "Peaks and swims"
//
// Then `npm run deploy` (or `npm run build`) bakes it in.

import fs from 'node:fs';
import path from 'node:path';
import { decodeShare } from './lib/share.mjs';

const ROUTE_ID = process.env.ROUTE_ID ?? 'lakeland-way';
const ROUTE_DIR = path.join('routes', ROUTE_ID);
const PRESETS = path.join(ROUTE_DIR, 'presets.json');
const CATEGORY_DIRS = ['peaks', 'wild-swim-spots', 'wildcamp-spots', 'camp-spots', 'misc-poi'];

const die = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

// The same item set, in the same order, that the browser encodes against: every
// non-camp point, which is what allDetourItems() yields.
const loadItems = () => {
  const items = [];
  for (const dir of CATEGORY_DIRS) {
    if (dir === 'wildcamp-spots' || dir === 'camp-spots') continue;
    const full = path.join(ROUTE_DIR, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.json'))) {
      const payload = JSON.parse(fs.readFileSync(path.join(full, file), 'utf8'));
      for (const item of payload.items ?? []) items.push(item);
    }
  }
  return items;
};

const load = () => (fs.existsSync(PRESETS) ? JSON.parse(fs.readFileSync(PRESETS, 'utf8')) : { presets: [] });
const save = (data) => {
  fs.mkdirSync(ROUTE_DIR, { recursive: true });
  fs.writeFileSync(PRESETS, `${JSON.stringify(data, null, 2)}\n`);
};

const [command, ...rest] = process.argv.slice(2);
const items = loadItems();
const data = load();

if (!command || command === 'list') {
  if (!data.presets.length) {
    process.stdout.write(`No shipped presets in ${PRESETS}\n`);
  } else {
    process.stdout.write(`\n${data.presets.length} preset(s) in ${PRESETS}\n\n`);
    for (const p of data.presets) {
      process.stdout.write(
        `  ${p.name}\n    ${p.ids.length} point(s) · ${p.direction ?? 'any direction'} · ${p.mode ?? 'any mode'}\n`,
      );
    }
    process.stdout.write('\n');
  }
  process.exit(0);
}

if (command === 'add') {
  const [name, link] = rest;
  if (!name || !link) {
    die('Usage: node scripts/preset.mjs add "Name" "<copied link>"');
  }
  const decoded = decodeShare(link, items);
  if (decoded.stale) {
    die(
      'That link was made against a different build — the point list has changed since, so the\n' +
        'selection cannot be decoded safely. Open the current site, re-copy the link, and try again.',
    );
  }
  if (!decoded.ok) {
    die(`Could not read that link (${decoded.reason}). Paste the whole "Copy link" URL.`);
  }
  if (!decoded.ids.length) {
    die('That link has nothing selected.');
  }

  const clean = name.trim().slice(0, 40);
  const existing = data.presets.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase());
  const entry = { name: clean, ids: decoded.ids.sort(), direction: decoded.direction, mode: decoded.mode };
  if (existing >= 0) {
    data.presets[existing] = entry;
    process.stdout.write(`Updated "${clean}"`);
  } else {
    data.presets.push(entry);
    process.stdout.write(`Added "${clean}"`);
  }
  save(data);
  process.stdout.write(
    ` — ${entry.ids.length} point(s), ${entry.direction}, ${entry.mode}\n` +
      `Written to ${PRESETS}. Run npm run build (or npm run deploy) to bake it in.\n`,
  );
  process.exit(0);
}

if (command === 'remove') {
  const [name] = rest;
  if (!name) die('Usage: node scripts/preset.mjs remove "Name"');
  const before = data.presets.length;
  data.presets = data.presets.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase());
  if (data.presets.length === before) die(`No preset called "${name}".`);
  save(data);
  process.stdout.write(`Removed "${name}". Run npm run build to apply.\n`);
  process.exit(0);
}

die(`Unknown command "${command}". Use list, add or remove.`);
