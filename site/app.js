/* Lakeland Way planner.
 *
 * All geometry, distance and ascent figures come precomputed from
 * scripts/build.mjs. This file selects between them, recomputes day totals as
 * detours are toggled, and assembles GPX in the browser so an export always
 * matches exactly what is ticked.
 */

// Supplied by site/config.js, which the build generates from OS_MAPS_KEY. Absent in a
// checkout with no key configured, in which case OpenStreetMap is used instead.
const OS_KEY = globalThis.APP_CONFIG?.osMapsKey ?? null;
const HAS_OS = Boolean(OS_KEY);
const TILES = {
  os: {
    url: `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=${OS_KEY}`,
    attribution: 'Contains OS data © Crown copyright and database rights 2026',
    maxZoom: 20,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
};

const state = {
  data: null,
  direction: 'cw',
  selected: new Set(),
  openDays: new Set([1]),
  basemap: HAS_OS ? 'os' : 'osm',
  mode: 'over', // 'over' | 'over-only' | 'back'
  dayFilter: {}, // per-day text filter, keyed by day number
  search: '',
  searchIndex: 0,
  paletteOpen: false,
  paletteRows: [],
  presets: [],
  basePresetName: null, // the saved preset being worked from, for re-saving
  restoring: false,
};

// Selection and filters survive a reload. Versioned and namespaced per route, and
// validated on load: a rebuild can rename or drop points, and stale ids must not
// resurrect as phantom selections.
const STORE_VERSION = 1;
const storeKey = () => `route-planner:${state.data.route.id}:v${STORE_VERSION}`;

function saveState() {
  if (!state.data || state.restoring) return;
  try {
    localStorage.setItem(
      storeKey(),
      JSON.stringify({
        direction: state.direction,
        mode: state.mode,
        basemap: state.basemap,
        selected: [...state.selected],
        openDays: [...state.openDays],
        dayFilter: state.dayFilter,
        basePresetName: state.basePresetName,
      }),
    );
  } catch {
    // Private browsing or a full quota: persistence is a convenience, not a
    // requirement, so carry on silently.
  }
}

function restoreState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(storeKey()) ?? 'null');
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return false;

  const validIds = new Set(allDetourItems().map((i) => i.id));
  const dayNumbers = new Set(currentDaysFor(saved.direction ?? state.direction).map((d) => d.day));

  if (saved.direction && state.data.directions[saved.direction]) state.direction = saved.direction;
  if (['over', 'over-only', 'back'].includes(saved.mode)) state.mode = saved.mode;
  if (['os', 'osm'].includes(saved.basemap)) state.basemap = saved.basemap;
  if (Array.isArray(saved.selected)) {
    state.selected = new Set(saved.selected.filter((id) => validIds.has(id)));
  }
  if (Array.isArray(saved.openDays)) {
    state.openDays = new Set(saved.openDays.filter((d) => dayNumbers.has(d)));
  }
  if (saved.dayFilter && typeof saved.dayFilter === 'object') state.dayFilter = saved.dayFilter;
  if (typeof saved.basePresetName === 'string' && loadPresets().some((p) => p.name === saved.basePresetName)) {
    state.basePresetName = saved.basePresetName;
  }
  return state.selected.size > 0 || Array.isArray(saved.selected);
}

/* ---------------- presets ---------------- */

// Saved presets live under their own key so clearing a selection never loses them.
const presetsKey = () => `route-planner:${state.data.route.id}:presets:v1`;

function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(presetsKey()) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const valid = new Set(allDetourItems().map((i) => i.id));
    return raw
      .filter((p) => p && typeof p.name === 'string' && Array.isArray(p.ids))
      .map((p) => ({
        name: p.name,
        // A saved preset can outlive the points it named; drop the missing ones.
        ids: p.ids.filter((id) => valid.has(id)),
        direction: state.data.directions[p.direction] ? p.direction : null,
        mode: ['over', 'over-only', 'back'].includes(p.mode) ? p.mode : null,
      }));
  } catch {
    return [];
  }
}

function storePresets(list) {
  try {
    localStorage.setItem(presetsKey(), JSON.stringify(list));
  } catch {
    /* persistence is a convenience */
  }
}

// Returns 'saved' | 'exists' | 'invalid'. A name collision is reported rather than
// silently overwritten — losing a saved plan to a reused name is not recoverable.
function savePreset(name, { overwrite = false } = {}) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return 'invalid';
  const list = loadPresets();
  const clash = list.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (clash && !overwrite) return 'exists';
  const kept = list.filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  // Keep the original position when overwriting, so the buttons do not jump about.
  const entry = { name: clash ? clash.name : clean, ids: [...state.selected], direction: state.direction, mode: state.mode };
  if (clash) kept.splice(list.indexOf(clash), 0, entry);
  else kept.push(entry);
  storePresets(kept);
  state.presets = kept;
  state.basePresetName = entry.name;
  return 'saved';
}

// "Coniston plan" -> "Coniston plan 2", skipping names already taken.
function uniquePresetName(base) {
  const taken = new Set(loadPresets().map((p) => p.name.toLowerCase()));
  const stem = base.trim().replace(/\s+\d+$/, '') || 'Preset';
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${stem} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} ${Date.now()}`;
}

function deletePreset(name) {
  const list = loadPresets().filter((p) => p.name !== name);
  storePresets(list);
  state.presets = list;
  if (state.basePresetName === name) state.basePresetName = null;
}

// The id set each built-in preset would produce, so the current selection can be
// matched against them and the right button highlighted.
function builtinSet(name) {
  const items = allDetourItems();
  const rec = new Set(state.data.recommended?.[state.direction]?.ids ?? []);
  if (name === 'none') return new Set();
  if (name === 'all') return new Set(items.map((i) => i.id));
  if (name === 'recommended') return rec;
  if (name === 'no-backtrack') {
    return new Set(state.data.recommendedNoBacktrack?.[state.direction]?.ids ?? []);
  }
  if (name === 'peaks' || name === 'swims') {
    const cat = name === 'peaks' ? 'peaks' : 'wild-swim-spots';
    return new Set(items.filter((i) => i.category === cat && rec.has(i.id)).map((i) => i.id));
  }
  return null;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const BUILTIN_PRESETS = [
  { key: 'none', label: 'Base route' },
  { key: 'recommended', label: 'Recommended' },
  { key: 'no-backtrack', label: 'No there-and-back' },
  { key: 'peaks', label: '+ Peaks' },
  { key: 'swims', label: '+ Swims' },
  { key: 'all', label: 'Everything' },
];

// Which preset the current selection corresponds to, if any. Null means the
// selection has been edited away from every preset — "modified".
function activePreset() {
  for (const p of BUILTIN_PRESETS) {
    const set = builtinSet(p.key);
    if (set && sameSet(state.selected, set)) return { kind: 'builtin', key: p.key, label: p.label };
  }
  for (const p of state.presets ?? []) {
    if (sameSet(state.selected, new Set(p.ids))) return { kind: 'custom', key: p.name, label: p.name };
  }
  return null;
}

const isModified = () => activePreset() == null;

// The saved preset that could be updated with the current selection: one you applied
// and have since edited. Null when there is nothing to update — either you are not
// working from a saved preset, or it already matches.
function updatablePreset() {
  if (!state.basePresetName || !isModified()) return null;
  return (state.presets ?? []).find((p) => p.name === state.basePresetName) ?? null;
}

/* ---------------- shareable URL ---------------- */

// State travels in the hash as: #v1.<fingerprint>.<direction>.<mode>.<hex bitmask>
//
// The bitmask is indexed by a canonical (sorted) list of point ids, which makes it
// compact but also build-dependent: adding or renaming a point shifts every bit
// after it. The fingerprint is a hash of that id list, so a link made before a
// rebuild is detected and declined rather than silently decoded into a different
// set of points.
const URL_VERSION = 'v1';

function canonicalIds() {
  return allDetourItems()
    .map((i) => i.id)
    .sort();
}

// FNV-1a, enough to detect that the point list has changed.
function fingerprint(ids) {
  let h = 0x811c9dc5;
  const s = ids.join(',');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

function encodeSelection(selected, ids) {
  const bytes = new Uint8Array(Math.ceil(ids.length / 8));
  ids.forEach((id, i) => {
    if (selected.has(id)) bytes[i >> 3] |= 1 << (i & 7);
  });
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeSelection(hex, ids) {
  const out = new Set();
  const bytes = hex.match(/../g) ?? [];
  ids.forEach((id, i) => {
    const byte = parseInt(bytes[i >> 3] ?? '0', 16);
    if (byte & (1 << (i & 7))) out.add(id);
  });
  return out;
}

function shareUrl() {
  const ids = canonicalIds();
  const hash = [
    URL_VERSION,
    fingerprint(ids),
    state.direction,
    state.mode,
    encodeSelection(state.selected, ids),
  ].join('.');
  const base = `${location.origin}${location.pathname}`;
  return `${base}#${hash}`;
}

function updateUrl() {
  if (state.restoring) return;
  try {
    const ids = canonicalIds();
    const hash = [URL_VERSION, fingerprint(ids), state.direction, state.mode, encodeSelection(state.selected, ids)].join('.');
    history.replaceState(null, '', `#${hash}`);
  } catch {
    // No history API, or a sandboxed frame: sharing is a convenience.
  }
}

// Returns 'ok', 'stale' (fingerprint mismatch) or null (nothing to read).
function readUrl() {
  let hash = '';
  try {
    hash = (location.hash ?? '').replace(/^#/, '');
  } catch {
    return null;
  }
  if (!hash) return null;
  const parts = hash.split('.');
  if (parts.length !== 5 || parts[0] !== URL_VERSION) return null;
  const [, fp, dir, mode, bits] = parts;
  const ids = canonicalIds();
  if (fp !== fingerprint(ids)) return 'stale';
  if (state.data.directions[dir]) state.direction = dir;
  if (['over', 'over-only', 'back'].includes(mode)) state.mode = mode;
  state.selected = decodeSelection(bits, ids);
  return 'ok';
}

function clearSaved() {
  try {
    localStorage.removeItem(storeKey());
  } catch {
    /* nothing to do */
  }
}

let map;
let tileLayer;
let baseLine;
let detourLayer;
let markerLayer;

const $ = (id) => document.getElementById(id);
const km = (v) => v.toFixed(1);

/* ---------------- geometry ---------------- */

const R = 6371008.8;
const toRad = Math.PI / 180;

function haversine(a, b) {
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestIndex(points, target) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = haversine(points[i], target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Insert a detour into a day's line where it leaves the route. Mirrors
// spliceDetour() in scripts/lib/geo.mjs so a browser export matches the build.
function spliceDetour(line, detour) {
  if (!detour || detour.length < 2) return line;
  const entry = nearestIndex(line, detour[0]);
  const exit = nearestIndex(line, detour[detour.length - 1]);
  const lo = Math.min(entry, exit);
  const hi = Math.max(entry, exit);
  const body = entry <= exit ? detour : detour.slice().reverse();
  if (lo === hi) return [...line.slice(0, lo + 1), ...body, ...line.slice(lo + 1)];
  return [...line.slice(0, lo + 1), ...body, ...line.slice(hi)];
}

/* ---------------- selection model ---------------- */

const detourCategories = () => state.data.categories.filter((c) => !c.category.includes('camp'));
const campCategory = () => state.data.categories.find((c) => c.category === 'wildcamp-spots');
const allDetourItems = () =>
  detourCategories().flatMap((c) => c.items.map((i) => ({ ...i, _cat: c })));

function itemsForDay(dayNumber) {
  return allDetourItems().filter((i) => i.dayByDirection[state.direction] === dayNumber);
}

// Resolution comes from site/resolve.js, which the build generates from
// scripts/lib/resolve.mjs — the same code the exports and verify use.
function dayFigures(day) {
  const dir = state.data.directions[state.direction];
  const r = window.resolveSelection({
    items: allDetourItems(),
    chains: state.mode === 'back' ? [] : (state.data.chains ?? []),
    dayNumber: day.day,
    direction: state.direction,
    selectedIds: state.selected,
    allowTraverses: state.mode !== 'back',
    excludeOutAndBack: state.mode === 'over-only',
    window: window.dayWindow(day, dir.reverse, state.data.route.totalKm),
  });
  return {
    ...r,
    totalKm: day.baseKm + r.addedKm,
    totalAscent: day.baseAscentM + r.addedAscentM,
    addedAscent: r.addedAscentM,
  };
}

// What a single point costs given how the day resolved it.
function itemCost(item, figures) {
  const mode = figures.modes.get(item.id);
  if (mode === 'chain') {
    const chain = (state.data.chains ?? []).find((c) => c.id === item.chainId);
    return { mode, addedKm: chain?.addedKm ?? 0, addedAscentM: chain?.addedAscentM ?? 0, chain };
  }
  if (mode === 'traverse') return { mode, ...item.traverse };
  return { mode, ...item.detour };
}

const currentDaysFor = (dir) => state.data.directions[dir]?.days ?? [];
const currentDays = () => currentDaysFor(state.direction);
const markerById = new Map();

/* ---------------- rendering ---------------- */

function renderStats() {
  const days = currentDays();
  const figs = days.map(dayFigures);
  const totalKm = figs.reduce((s, f) => s + f.totalKm, 0);
  const totalAscent = figs.reduce((s, f) => s + f.totalAscent, 0);
  const longest = Math.max(...figs.map((f) => f.totalKm));
  const base = state.data.route.totalKm;

  $('stat-distance').innerHTML =
    `${km(totalKm)}<small> km</small>` +
    (totalKm > base + 0.05 ? ` <span class="delta">+${km(totalKm - base)}</span>` : '');
  $('stat-ascent').innerHTML = `${Math.round(totalAscent).toLocaleString()}<small> m</small>`;
  $('stat-avg').innerHTML = `${km(totalKm / days.length)}<small> km</small>`;
  $('stat-longest').innerHTML = `${km(longest)}<small> km</small>`;
  $('stat-selected').innerHTML = `${state.selected.size}<small> of ${allDetourItems().length}</small>`;

  const p = state.data.route.planning;
  const lastDay = days.length;
  const capFor = (n) => (n === 1 || n === lastDay ? (p.endDayMaxKm ?? p.maxDayKm) : p.maxDayKm);
  const over = figs.filter((f, i) => f.totalKm > capFor(days[i].day)).length;
  const avg = totalKm / days.length;
  const note = $('budget-note');
  note.classList.toggle('warn', over > 0 || avg > p.targetAverageKm);
  const excluded = figs.reduce((s, f) => s + (f.excluded ?? 0), 0);
  const modeNote =
    state.mode === 'over-only'
      ? ` No peak doubles back${excluded ? `; ${excluded} peak${excluded > 1 ? 's' : ''} left out for needing it` : ''}. Swims and camps are unaffected.`
      : state.mode === 'back'
        ? ' Every peak doubles back from the drawn line.'
        : '';
  const easyCount = figs.filter((f, i) => days[i].day !== 1 && days[i].day !== lastDay && f.totalKm <= p.easyDayKm).length;
  const shortfall = Math.max(0, (p.minEasyMiddleDays ?? 0) - easyCount);
  const dayNote =
    ` Days 1 and ${lastDay} are travel days, capped at ${p.endDayMaxKm ?? p.maxDayKm} km.` +
    (p.minEasyMiddleDays
      ? shortfall
        ? ` <strong>Only ${easyCount} short day${easyCount === 1 ? '' : 's'}</strong> — you wanted ${p.minEasyMiddleDays}.`
        : ` ${easyCount} short day${easyCount === 1 ? '' : 's'} of ${p.easyDayKm} km or less.`
      : '');
  note.innerHTML = over
    ? `<strong>${over} day${over > 1 ? 's' : ''} over its ceiling.</strong> Untick a detour on the days marked in red.${dayNote}${modeNote}`
    : avg > p.targetAverageKm
      ? `<strong>Average ${km(avg)} km/day</strong> is above your ${p.targetAverageKm} km target, though every day is under the ${p.maxDayKm} km ceiling.`
      : `Every day is within its ceiling, averaging <strong>${km(avg)} km</strong>.${dayNote}${modeNote}`;
}

const MODE_LABEL = {
  chain: 'over the top, linked',
  traverse: 'over the top',
  collected: 'passed on the way',
  'out-and-back': 'there and back',
  'on-route': 'on the route',
  excluded: 'left out — needs doubling back',
  unselected: 'not selected',
};

function poiRow(item, dayOverBudget, figures) {
  const selected = state.selected.has(item.id);
  const resolved = selected ? itemCost(item, figures) : null;
  // Unselected rows preview the cheapest option they would use.
  const preview = item.traverse && state.mode !== 'back' ? item.traverse : item.detour;
  const shown = resolved ?? { ...preview, mode: resolved?.mode };
  const mode = resolved?.mode ?? (item.traverse && state.mode !== 'back' ? 'traverse' : item.detour.kind);

  let cost;
  if (mode === 'excluded') {
    cost = `<span class="poi-cost muted">left out — ${MODE_LABEL.excluded} (+${km(item.detour.addedKm ?? 0)} km)</span>`;
  } else if (mode === 'collected') {
    cost = '<span class="poi-cost free">free · passed on the way</span>';
  } else if ((shown.addedKm ?? 0) > 0) {
    const alt =
      item.traverse && mode !== 'traverse' && mode !== 'chain'
        ? ` <span class="alt-cost">(+${km(item.traverse.addedKm)} km over the top)</span>`
        : '';
    cost =
      `<span class="poi-cost">+${km(shown.addedKm)} km · +${shown.addedAscentM} m` +
      `<span class="mode"> ${MODE_LABEL[mode] ?? ''}</span></span>${alt}`;
  } else {
    cost = '<span class="poi-cost free">on the route</span>';
  }
  const height = item.heightM ? `<span class="h"> ${item.heightM} m</span>` : '';
  const star = item.starred ? '<span class="star">★</span> ' : '';
  const tags = (item.labels ?? []).map((l) => `<span class="tag">${l}</span>`).join('');
  const checked = selected ? 'checked' : '';
  // In over-only mode, anything that can only be reached by doubling back cannot
  // be added at all — say so rather than offering a tick that does nothing.
  const unavailable = state.mode === 'over-only' && item.category === 'peaks' && item.noBacktrack === false;
  const disabled = unavailable ? 'disabled' : '';
  const bypass =
    (mode === 'traverse' || mode === 'chain') && shown.replacedKm
      ? `<span class="poi-bypass">bypasses ${km(shown.replacedKm)} km of the base route</span>`
      : mode === 'chain' && shown.chain?.replacedKm
        ? `<span class="poi-bypass">linked with ${shown.chain.title} — bypasses ${km(shown.chain.replacedKm)} km</span>`
        : '';
  return `
    <label class="poi ${dayOverBudget ? 'over' : ''} ${mode === 'excluded' || unavailable ? 'dimmed' : ''}">
      <input type="checkbox" data-poi="${item.id}" ${checked} ${disabled}>
      <span class="poi-main">
        <span class="poi-title">${item._cat.glyph} ${star}${item.title}${height}</span> ${cost}
        ${item.description ? `<span class="poi-desc">${item.description}</span>` : ''}
        ${bypass}
        ${tags ? `<span class="poi-labels">${tags}</span>` : ''}
      </span>
    </label>`;
}

function renderDays() {
  const p = state.data.route.planning;
  const camps = campCategory()?.items ?? [];
  $('days').innerHTML = currentDays()
    .map((day) => {
      const f = dayFigures(day);
      const lastDay = currentDays().length;
      const isTravel = day.day === 1 || day.day === lastDay;
      const cap = isTravel ? (p.endDayMaxKm ?? p.maxDayKm) : p.maxDayKm;
      const isOver = f.totalKm > cap;
      const isLong = !isOver && f.totalKm >= p.longDayKm;
      const isEasy = !isTravel && f.totalKm <= p.easyDayKm;
      const camp = camps.find((c) => c.id === day.campId);
      const available = itemsForDay(day.day).sort(
        (a, b) => Number(b.starred) - Number(a.starred) || a.entryKm - b.entryKm,
      );
      const dateLabel = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      return `
      <div class="day ${state.openDays.has(day.day) ? 'open' : ''} ${isOver ? 'is-over' : isLong ? 'is-long' : ''}" data-day="${day.day}">
        <div class="day-head" data-toggle="${day.day}">
          <span class="day-n">${day.day}</span>
          <span class="day-date">${dateLabel}</span>
          ${isTravel ? '<span class="day-tag travel">travel</span>' : isEasy ? '<span class="day-tag easy">short</span>' : ''}
          <span class="day-figs">${km(f.totalKm)} km${f.addedKm > 0 ? ` <span class="plus">(+${km(f.addedKm)})</span>` : ''} <span class="asc">· ${Math.round(f.totalAscent)} m</span></span>
        </div>
        <div class="day-body">
          <div class="day-camp">${
            camp
              ? `Camp: ${camp.title} — ${camp.elevationM} m${camp.nearestWater ? `, water at ${camp.nearestWater}` : ''}${camp.nearestWaterM != null ? ` (${camp.nearestWaterM} m away)` : ''}`
              : 'Final day — returns to the start.'
          }</div>
          ${available.length > 3 ? `<input class="day-filter" data-filter="${day.day}" placeholder="Filter day ${day.day} — name or label…" value="${escapeAttr(state.dayFilter[day.day] ?? '')}">` : ''}
          ${f.excluded ? `<div class="day-note">${f.excluded} peak${f.excluded > 1 ? 's' : ''} left out — reachable only by doubling back.</div>` : ''}
          ${f.fallbacks && state.mode !== 'over-only' ? `<div class="day-note">${f.fallbacks} traverse${f.fallbacks > 1 ? 's' : ''} fell back to there-and-back: they would replace the same stretch of route as another selection.</div>` : ''}
          ${available.length ? available.map((i) => poiRow(i, isOver, f)).join('') : '<div class="poi-desc">Nothing within reach on this day.</div>'}
        </div>
      </div>`;
    })
    .join('');
}

function escapeAttr(v) {
  return String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* ---------------- search & filter ---------------- */

// Rank matches so the obvious answer comes first: a title starting with the query
// beats one merely containing it, which beats a label or description hit.
function matchScore(item, q) {
  const title = item.title.toLowerCase();
  if (title.startsWith(q)) return 100 - title.length / 100;
  if (title.includes(q)) return 70 - title.length / 100;
  const labels = (item.labels ?? []).join(' ').toLowerCase();
  if (labels.includes(q)) return 40;
  if ((item.description ?? '').toLowerCase().includes(q)) return 20;
  if ((item._cat?.label ?? '').toLowerCase().includes(q)) return 10;
  return 0;
}

function searchItems(query, { limit = 14 } = {}) {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  return allDetourItems()
    .map((item) => ({ item, score: matchScore(item, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.entryKm - b.item.entryKm)
    .slice(0, limit)
    .map((r) => r.item);
}

function highlight(text, query) {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return `${text.slice(0, i)}<mark>${text.slice(i, i + q.length)}</mark>${text.slice(i + q.length)}`;
}

// Every point's resolved mode across the whole trip, so a palette row can say how
// that point is currently reached.
function allModes() {
  const modes = new Map();
  for (const day of currentDays()) {
    for (const [id, m] of dayFigures(day).modes) modes.set(id, m);
  }
  return modes;
}

// --- command palette ----------------------------------------------------------
// Points and actions in one list, the way a command panel works: type to filter,
// arrows to move, Enter to go there, Shift-Enter to add or remove without leaving.

function paletteCommands() {
  const d = state.data;
  const cmds = [
    { id: 'dir:cw', group: 'Direction', title: 'Walk clockwise', hint: 'Day 1 starts at Eskdale', run: () => setDirection('cw'), active: () => state.direction === 'cw' },
    { id: 'dir:acw', group: 'Direction', title: 'Walk anticlockwise', hint: 'Reverses the loop', run: () => setDirection('acw'), active: () => state.direction === 'acw' },
    { id: 'mode:over', group: 'Peaks', title: 'Peaks: over the top', hint: 'Traverse where possible, double back otherwise', run: () => setMode('over'), active: () => state.mode === 'over' },
    { id: 'mode:only', group: 'Peaks', title: 'Peaks: no there-and-back', hint: 'Only summits you can walk over, chain or pass', run: () => setMode('over-only'), active: () => state.mode === 'over-only' },
    { id: 'mode:back', group: 'Peaks', title: 'Peaks: there and back', hint: 'Never leave the drawn line', run: () => setMode('back'), active: () => state.mode === 'back' },
    ...BUILTIN_PRESETS.map((p) => ({
      id: `preset:${p.key}`,
      group: 'Plan',
      title: `Preset: ${p.label}`,
      run: () => switchPreset(() => applyPreset(p.key)),
      active: () => activePreset()?.kind === 'builtin' && activePreset().key === p.key,
    })),
    ...(state.presets ?? []).map((p) => ({
      id: `preset:custom:${p.name}`,
      group: 'Plan',
      title: `Preset: ${p.name}`,
      hint: `${p.ids.length} point(s), saved by you`,
      run: () => switchPreset(() => applyCustomPreset(p.name)),
      active: () => activePreset()?.kind === 'custom' && activePreset().key === p.name,
    })),
    ...(updatablePreset()
      ? [
          {
            id: 'preset:update',
            group: 'Plan',
            title: `Update preset “${updatablePreset().name}”`,
            hint: `Re-save your ${state.selected.size} selected point(s) over it`,
            run: () => updateCurrentPreset(),
          },
        ]
      : []),
    { id: 'preset:save', group: 'Plan', title: 'Save this selection as a new preset', run: () => promptForPresetName() },
    { id: 'share:copy', group: 'Plan', title: 'Copy a shareable link', hint: 'Carries direction, peaks setting and selection', run: () => $('copy-link').click() },
    { id: 'preset:reset', group: 'Plan', title: 'Reset — forget saved changes', hint: 'Clears stored selection and returns to recommended', run: () => { clearSaved(); applyPreset('recommended'); } },
    { id: 'days:open', group: 'View', title: 'Expand every day', run: () => { for (const day of currentDays()) state.openDays.add(day.day); render(); saveState(); } },
    { id: 'days:close', group: 'View', title: 'Collapse every day', run: () => { state.openDays.clear(); render(); saveState(); } },
    { id: 'tiles:os', group: 'View', title: 'Basemap: Ordnance Survey', run: () => setBasemap('os'), active: () => state.basemap === 'os' },
    { id: 'tiles:osm', group: 'View', title: 'Basemap: OpenStreetMap', run: () => setBasemap('osm'), active: () => state.basemap === 'osm' },
    { id: 'gpx:full', group: 'Download', title: 'Download the whole route', hint: 'GPX, with your current selection', run: () => download(`${d.route.id}-${state.direction}-full.gpx`, fullGpx()) },
    { id: 'gpx:all', group: 'Download', title: 'Download every day separately', hint: `${currentDays().length} GPX files`, run: () => { const stamp = (n) => String(n).padStart(2, '0'); currentDays().forEach((day, i) => { setTimeout(() => download(`${d.route.id}-${state.direction}-day-${stamp(day.day)}.gpx`, dayGpx(day)), i * 350); }); } },
  ];
  for (const day of currentDays()) {
    cmds.push({
      id: `gpx:day:${day.day}`,
      group: 'Download',
      title: `Download day ${day.day}`,
      hint: day.date,
      run: () => download(`${d.route.id}-${state.direction}-day-${String(day.day).padStart(2, '0')}.gpx`, dayGpx(day)),
    });
  }
  return cmds;
}

function commandScore(cmd, q) {
  const t = cmd.title.toLowerCase();
  if (t.startsWith(q)) return 95;
  if (t.includes(q)) return 65;
  if (cmd.group.toLowerCase().startsWith(q)) return 45;
  if ((cmd.hint ?? '').toLowerCase().includes(q)) return 18;
  return 0;
}

// Rows for the palette: commands and points, merged. With no query, show the
// actions — that is what a command panel is for — rather than an arbitrary
// selection of points.
function paletteResults(query) {
  const q = query.trim().toLowerCase();
  const cmds = paletteCommands();
  if (!q) {
    return cmds.slice(0, 8).map((c) => ({ kind: 'command', cmd: c }));
  }
  const matchedCmds = cmds
    .map((cmd) => ({ cmd, score: commandScore(cmd, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => ({ kind: 'command', cmd: r.cmd }));
  const matchedItems = searchItems(query, { limit: 12 }).map((item) => ({ kind: 'item', item }));
  return [...matchedCmds, ...matchedItems];
}

function renderPalette() {
  const box = $('palette-results');
  const rows = paletteResults(state.search);
  state.paletteRows = rows;
  if (!rows.length) {
    box.innerHTML = '<div class="pr-empty">Nothing matches.</div>';
    return;
  }
  if (state.searchIndex < 0 || state.searchIndex >= rows.length) state.searchIndex = 0;

  const modes = allModes();
  let lastGroup = null;
  const html = [];
  rows.forEach((row, n) => {
    const group = row.kind === 'command' ? row.cmd.group : row.item._cat.label;
    if (group !== lastGroup) {
      html.push(`<div class="pr-section">${group}</div>`);
      lastGroup = group;
    }
    const selected = n === state.searchIndex ? 'true' : 'false';
    if (row.kind === 'command') {
      const on = row.cmd.active?.() ? '<span class="pr-in">✓ current</span>' : '';
      html.push(`<div class="pr" role="option" aria-selected="${selected}" data-row="${n}">
        <span class="pr-glyph">▸</span>
        <span class="pr-body"><span class="pr-title">${highlight(row.cmd.title, state.search)}</span>
        ${row.cmd.hint ? `<span class="pr-sub">${row.cmd.hint}</span>` : ''}</span>
        <span class="pr-meta">${on}</span>
      </div>`);
    } else {
      const item = row.item;
      const inPlan = state.selected.has(item.id);
      const mode = inPlan ? (modes.get(item.id) ?? 'out-and-back') : null;
      const day = item.dayByDirection[state.direction];
      html.push(`<div class="pr" role="option" aria-selected="${selected}" data-row="${n}">
        <span class="pr-glyph">${item._cat.glyph}</span>
        <span class="pr-body"><span class="pr-title">${highlight(item.title, state.search)}${item.heightM ? ` <span class="pr-meta">${item.heightM} m</span>` : ''}</span>
        ${item.description ? `<span class="pr-sub">${item.description.slice(0, 96)}${item.description.length > 96 ? '…' : ''}</span>` : ''}</span>
        <span class="pr-meta">${day ? `day ${day}` : ''}${mode && mode !== 'excluded' ? ` · ${MODE_LABEL[mode]}` : ''} ${inPlan ? '<span class="pr-in">✓</span>' : ''}</span>
      </div>`);
    }
  });
  box.innerHTML = html.join('');
  box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  state.paletteOpen = true;
  state.search = '';
  state.searchIndex = 0;
  $('palette').hidden = false;
  const input = $('palette-input');
  input.value = '';
  renderPalette();
  input.focus();
}

function closePalette() {
  state.paletteOpen = false;
  $('palette').hidden = true;
  state.search = '';
  $('palette-open')?.focus();
}

// Enter goes to the thing; Shift-Enter adds or removes it and keeps the palette up
// so several can be adjusted in one pass.
function runPaletteRow(n, { toggle = false } = {}) {
  const row = state.paletteRows?.[n];
  if (!row) return;
  if (row.kind === 'command') {
    closePalette();
    row.cmd.run();
    return;
  }
  const id = row.item.id;
  if (toggle) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    render();
    saveState();
    renderPalette();
    return;
  }
  closePalette();
  focusItem(id);
}

function applyDayFilters() {
  for (const dayEl of document.querySelectorAll('.day')) {
    const n = Number(dayEl.dataset.day);
    const q = (state.dayFilter[n] ?? '').trim().toLowerCase();
    for (const row of dayEl.querySelectorAll('.poi')) {
      if (!q) {
        row.classList.remove('hidden-by-filter');
        continue;
      }
      row.classList.toggle('hidden-by-filter', !row.textContent.toLowerCase().includes(q));
    }
  }
}

// Bring a point into view: open its day, scroll to its row, flash it, and centre
// the map on it with its popup open.
function focusItem(id) {
  const item = allDetourItems().find((i) => i.id === id);
  if (!item) return;
  const day = item.dayByDirection[state.direction];
  if (day != null && !state.openDays.has(day)) {
    state.openDays.add(day);
    renderDays();
    applyDayFilters();
    saveState();
  }
  const row = document.querySelector(`[data-poi="${id}"]`)?.closest('.poi');
  if (row) {
    row.classList.remove('hidden-by-filter');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1700);
  }
  const marker = markerById.get(id);
  if (map && marker) {
    map.panTo([item.lat, item.lon]);
    marker.openPopup();
  }
}

function renderMap() {
  if (!map) return; // Leaflet unavailable — the rest of the page still works.
  const days = currentDays();
  detourLayer.clearLayers();
  markerLayer.clearLayers();
  markerById.clear();
  if (baseLine) baseLine.remove();

  // Two lines, deliberately. The faint one is the route exactly as drawn; the bold
  // one is what you would actually walk once detours are resolved. Where a traverse
  // replaces a stretch, the faint line shows what is being bypassed. Drawing the
  // base line bold AND the detours separately made a replaced stretch look like a
  // doubling-back excursion, because both lines were shown as if walked.
  baseLine = L.polyline(
    days.flatMap((d) => d.points.map((p) => [p[0], p[1]])),
    { color: '#a9a294', weight: 2, opacity: 0.7, dashArray: '2 5', interactive: false },
  ).addTo(map);

  const modes = new Map();
  const walked = state.direction === 'cw' ? '#c75f2a' : '#3d6b7a';
  for (const day of days) {
    const f = dayFigures(day);
    for (const [id, m] of f.modes) modes.set(id, m);
    let pts = day.points.map((p) => [p[0], p[1], p[2]]);
    for (const part of f.parts) {
      if (part.points?.length) pts = spliceDetour(pts, part.points);
    }
    L.polyline(
      pts.map((p) => [p[0], p[1]]),
      { color: walked, weight: 3.5, opacity: 0.95 },
    ).addTo(detourLayer);
  }

  const STYLE = {
    traverse: { size: 24, opacity: 1, ring: '#fff' },
    chain: { size: 24, opacity: 1, ring: '#fff' },
    collected: { size: 21, opacity: 1, ring: '#fff' },
    'on-route': { size: 21, opacity: 1, ring: '#fff' },
    'out-and-back': { size: 21, opacity: 1, ring: '#fff' },
    excluded: { size: 15, opacity: 0.4, ring: '#e8e4dc' },
    unselected: { size: 14, opacity: 0.45, ring: '#e8e4dc' },
  };

  for (const item of allDetourItems()) {
    const mode = state.selected.has(item.id) ? (modes.get(item.id) ?? 'unselected') : 'unselected';
    // An excluded point is in the plan but not on the line, so it must not look
    // included. Same treatment as unselected, plus a note in the popup.
    const st = STYLE[mode] ?? STYLE.unselected;
    const bg = item._cat.category === 'peaks' ? '#8b6f4e' : '#3d6b7a';
    const day = item.dayByDirection[state.direction];
    const cost =
      mode === 'traverse' && item.traverse
        ? `+${km(item.traverse.addedKm)} km, +${item.traverse.addedAscentM} m`
        : mode === 'collected'
          ? 'free — passed on the way'
          : mode === 'on-route'
            ? 'on the route'
            : item.detour.addedKm > 0
              ? `+${km(item.detour.addedKm)} km, +${item.detour.addedAscentM} m`
              : 'on the route';
    const marker = L.marker([item.lat, item.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="pin" style="background:${bg};width:${st.size}px;height:${st.size}px;font-size:${st.size > 18 ? 11 : 8}px;opacity:${st.opacity};border-color:${st.ring}">${item._cat.glyph}</div>`,
        iconSize: [st.size, st.size],
        iconAnchor: [st.size / 2, st.size / 2],
      }),
      zIndexOffset: st.size > 18 ? 500 : 0,
    })
      .bindPopup(
        `<strong>${item.title}</strong>${item.heightM ? ` ${item.heightM} m` : ''}<br>` +
          `<em>Day ${day ?? '—'} · ${MODE_LABEL[mode] ?? 'not selected'}${mode === 'unselected' ? '' : ` · ${cost}`}</em>` +
          (mode === 'excluded'
            ? '<br><em>Left out of this plan: it can only be reached by doubling back.</em>'
            : '') +
          (item.description ? `<br>${item.description}` : '') +
          (item.needsEntryPoint ? '<br><em>Marker is the lake centre — choose your own shore access.</em>' : ''),
        { maxWidth: 260 },
      )
      .addTo(markerLayer);
    // Keep the reference so search results can open this popup directly.
    markerById.set(item.id, marker);
  }

  for (const camp of campCategory()?.items ?? []) {
    const dayNumber = days.find((d) => d.campId === camp.id)?.day ?? camp.night;
    L.marker([camp.lat, camp.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="pin" style="background:#1a1a18;width:22px;height:22px;font-size:10px">${dayNumber}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      zIndexOffset: 800,
    })
      .bindPopup(
        `<strong>Night ${dayNumber}</strong> — end of day ${dayNumber}<br><em>${camp.elevationM} m` +
          `${camp.nearestFell ? ` · below ${camp.nearestFell}` : ''}</em><br>${(camp.labels ?? []).join(' · ')}`,
      )
      .addTo(markerLayer);
  }
}

function render() {
  renderStats();
  renderDays();
  applyDayFilters();
  renderMap();
  renderExports();
  renderPresets();
  updateUrl();
  if (state.paletteOpen) renderPalette();
}

/* ---------------- GPX ---------------- */

function xmlEscape(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
}

function buildGpx({ name, desc, tracks = [], waypoints = [] }) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="route-planner"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${xmlEscape(name)}</name>`,
  ];
  if (desc) lines.push(`    <desc>${xmlEscape(desc)}</desc>`);
  lines.push('  </metadata>');
  for (const w of waypoints) {
    lines.push(`  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">`);
    if (w.ele != null) lines.push(`    <ele>${Number(w.ele).toFixed(1)}</ele>`);
    lines.push(`    <name>${xmlEscape(w.name)}</name>`);
    if (w.desc) lines.push(`    <desc>${xmlEscape(w.desc)}</desc>`);
    lines.push('  </wpt>');
  }
  for (const t of tracks) {
    lines.push('  <trk>', `    <name>${xmlEscape(t.name)}</name>`);
    if (t.desc) lines.push(`    <desc>${xmlEscape(t.desc)}</desc>`);
    lines.push('    <trkseg>');
    for (const p of t.points) {
      const open = `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">`;
      lines.push(p[2] == null ? `${open}</trkpt>` : `${open}<ele>${Number(p[2]).toFixed(1)}</ele></trkpt>`);
    }
    lines.push('    </trkseg>', '  </trk>');
  }
  lines.push('</gpx>');
  return `${lines.join('\n')}\n`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waypointFor(item) {
  return {
    lat: item.lat,
    lon: item.lon,
    ele: item.heightM ?? item.elevationM ?? null,
    name: item.heightM ? `${item.title} ${item.heightM}m` : item.title,
    desc: [
      item.description,
      item.detour.addedKm > 0
        ? `Detour: +${km((item.traverse ?? item.detour).addedKm)}km, +${(item.traverse ?? item.detour).addedAscentM}m ascent${item.traverse ? ' (walked over the top)' : ''}.`
        : 'On the route.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function dayGpx(day) {
  const f = dayFigures(day);
  let pts = day.points.map((p) => [p[0], p[1], p[2]]);
  for (const part of f.parts) {
    if (part.points?.length) pts = spliceDetour(pts, part.points);
  }
  const camp = (campCategory()?.items ?? []).find((c) => c.id === day.campId);
  const dirLabel = state.data.directions[state.direction].label;
  return buildGpx({
    name: `${state.data.route.name} — ${dirLabel} day ${day.day} (${day.date})`,
    desc:
      `${km(f.totalKm)}km, ${Math.round(f.totalAscent)}m ascent. ` +
      (f.picked.length ? `Includes: ${f.picked.map((i) => i.title).join(', ')}.` : 'Base route only.'),
    tracks: [{ name: `Day ${day.day}`, points: pts }],
    waypoints: [
      ...f.picked.map(waypointFor),
      ...(camp
        ? [
            {
              lat: camp.lat,
              lon: camp.lon,
              ele: camp.elevationM,
              name: `Night ${day.day} camp`,
              desc: (camp.labels ?? []).join(' · '),
            },
          ]
        : []),
    ],
  });
}

function fullGpx() {
  const days = currentDays();
  let pts = [];
  const chosen = [];
  for (const day of days) {
    const f = dayFigures(day);
    let seg = day.points.map((p) => [p[0], p[1], p[2]]);
    for (const part of f.parts) {
      if (part.points?.length) seg = spliceDetour(seg, part.points);
    }
    chosen.push(...f.picked);
    pts = pts.length ? [...pts, ...seg.slice(1)] : seg;
  }
  const figs = days.map(dayFigures);
  const totalKm = figs.reduce((s, f) => s + f.totalKm, 0);
  const totalAscent = figs.reduce((s, f) => s + f.totalAscent, 0);
  const dirLabel = state.data.directions[state.direction].label;
  return buildGpx({
    name: `${state.data.route.name} — ${dirLabel}, full route`,
    desc: `${km(totalKm)}km, ${Math.round(totalAscent)}m ascent, ${days.length} days, ${chosen.length} detours selected.`,
    tracks: [{ name: state.data.route.name, points: pts }],
    waypoints: [
      ...chosen.map(waypointFor),
      ...(campCategory()?.items ?? []).map((c) => ({
        lat: c.lat,
        lon: c.lon,
        ele: c.elevationM,
        name: `Night ${c.night} camp`,
        desc: (c.labels ?? []).join(' · '),
      })),
    ],
  });
}

function renderPresets() {
  const active = activePreset();
  const custom = state.presets ?? [];
  const parts = ['<span class="glabel">Preset</span>'];
  for (const p of BUILTIN_PRESETS) {
    const on = active?.kind === 'builtin' && active.key === p.key;
    parts.push(`<button data-preset="${p.key}" aria-pressed="${on}">${p.label}</button>`);
  }
  for (const p of custom) {
    const on = active?.kind === 'custom' && active.key === p.name;
    parts.push(
      `<span class="preset-custom"><button data-custom="${escapeAttr(p.name)}" aria-pressed="${on}">${p.name}</button>` +
        `<button class="preset-del" data-del="${escapeAttr(p.name)}" title="Delete this preset">×</button></span>`,
    );
  }
  if (!active) {
    parts.push(
      state.basePresetName
        ? `<span class="modified-badge" title="Edited away from your saved preset">modified from “${state.basePresetName}”</span>`
        : '<span class="modified-badge" title="Your selection does not match any preset">modified</span>',
    );
  }
  $('presets').innerHTML = parts.join('');

  // Update appears only when there is a saved preset your selection has moved away
  // from. Naming the target on the button makes the click unambiguous, so it needs no
  // confirmation of its own.
  const update = $('update-preset');
  if (update) {
    const target = updatablePreset();
    update.hidden = !target;
    if (target) {
      update.textContent = `Update “${target.name}”`;
      update.title = `Re-save your ${state.selected.size} selected point(s) over the "${target.name}" preset`;
    }
  }
}

function renderExports() {
  const days = currentDays();
  const figs = days.map(dayFigures);
  const totalKm = figs.reduce((s, f) => s + f.totalKm, 0);
  const dir = state.direction.toUpperCase();

  $('exports').innerHTML = [
    `<div class="export-row">
       <span><strong>Whole route</strong><br><span class="meta">${km(totalKm)} km · ${state.selected.size} detours · ${dir}</span></span>
       <button data-export="full">↓ GPX</button>
     </div>`,
    `<div class="export-row">
       <span><strong>Every day, separately</strong><br><span class="meta">${days.length} files · ${dir}</span></span>
       <button data-export="all-days">↓ ${days.length} GPX</button>
     </div>`,
    ...days.map(
      (day, i) => `<div class="export-row">
        <span>Day ${day.day} <span class="meta">${day.date}</span><br>
          <span class="meta">${km(figs[i].totalKm)} km · ${Math.round(figs[i].totalAscent)} m · ${figs[i].picked.length} detour${figs[i].picked.length === 1 ? '' : 's'}</span></span>
        <button data-export="day" data-day="${day.day}">↓ GPX</button>
      </div>`,
    ),
  ].join('');

  $('prebuilt').innerHTML = (state.data.exports ?? [])
    .filter((f) => f.includes('full') || f.includes('peaks') || f.includes('swim'))
    .map(
      (f) => `<div class="export-row">
        <span class="meta" style="font-size:0.68rem">${f}</span>
        <a class="btn" href="gpx/${state.data.route.id}/${f}" download>↓</a>
      </div>`,
    )
    .join('');
}

/* ---------------- dialog ---------------- */

// A small in-page dialog rather than window.confirm: it can carry three actions
// (discard / save first / cancel), doubles as the name prompt, and matches the page.
function showDialog({ title, body, okLabel = 'OK', altLabel = null, prompt = false, initial = '' }) {
  return new Promise((resolve) => {
    const el = $('confirm');
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body ?? '';
    $('confirm-ok').textContent = okLabel;
    const alt = $('confirm-alt');
    alt.hidden = !altLabel;
    if (altLabel) alt.textContent = altLabel;
    const wrap = $('confirm-input-wrap');
    wrap.hidden = !prompt;
    const input = $('confirm-input');
    if (prompt) input.value = initial;
    el.hidden = false;
    if (prompt) input.focus();

    const done = (result) => {
      el.hidden = true;
      state.dialogResolve = null;
      resolve(result);
    };
    // Stored so the wired handlers can reach the current resolver.
    state.dialogResolve = done;
    state.dialogIsPrompt = prompt;
  });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------------- presets & events ---------------- */

function applyPreset(name) {
  const set = builtinSet(name);
  if (!set) return;
  state.selected = new Set(set);
  // Applying a built-in means you are no longer working from a saved preset.
  state.basePresetName = null;
  render();
  saveState();
}

function applyCustomPreset(name) {
  const p = (state.presets ?? []).find((x) => x.name === name);
  if (!p) return;
  if (p.direction && p.direction !== state.direction) {
    state.direction = p.direction;
    $('dir-cw').setAttribute('aria-pressed', String(state.direction === 'cw'));
    $('dir-acw').setAttribute('aria-pressed', String(state.direction === 'acw'));
  }
  if (p.mode && p.mode !== state.mode) {
    state.mode = p.mode;
    $('mode-over').setAttribute('aria-pressed', String(state.mode === 'over'));
    $('mode-only').setAttribute('aria-pressed', String(state.mode === 'over-only'));
    $('mode-back').setAttribute('aria-pressed', String(state.mode === 'back'));
  }
  state.selected = new Set(p.ids);
  state.basePresetName = p.name;
  render();
  saveState();
}

// Switching preset throws away an edited selection, so ask first — and offer to keep
// it as a preset rather than forcing a choice between losing it and cancelling.
async function switchPreset(apply) {
  if (!isModified()) {
    apply();
    return;
  }
  const answer = await showDialog({
    title: 'Discard your changes?',
    body: `You have ${state.selected.size} point(s) selected that do not match any preset. Switching will replace them.`,
    okLabel: 'Discard and switch',
    altLabel: 'Save as preset first',
  });
  if (answer === 'cancel') return;
  if (answer === 'alt') {
    const named = await promptForPresetName();
    if (!named) return;
  }
  apply();
}

// Prompt, then handle a name collision by asking rather than deciding: overwrite the
// existing preset, or keep both under a new name. Loops so "save as new" lands back
// in the prompt with a suggested name the user can still edit.
// Overwrite the preset being worked from, directly. The button names it, so clicking
// it is the confirmation.
function updateCurrentPreset() {
  const target = updatablePreset();
  if (!target) return false;
  savePreset(target.name, { overwrite: true });
  renderPresets();
  toast(`Updated “${target.name}” — ${state.selected.size} point(s)`);
  return true;
}

async function promptForPresetName() {
  // Always starts empty: this flow creates a preset. Updating an existing one is the
  // Update button's job.
  let initial = '';
  for (let guard = 0; guard < 20; guard += 1) {
    const answer = await showDialog({
      title: initial ? 'Save preset' : 'Save preset',
      body: 'Give this selection a name. Presets are stored in this browser.',
      okLabel: 'Save',
      prompt: true,
      initial,
    });
    if (answer === 'cancel') return false;

    const name = $('confirm-input').value;
    const result = savePreset(name);

    if (result === 'invalid') {
      toast('That preset needs a name');
      initial = name;
      continue;
    }
    if (result === 'exists') {
      const existing = loadPresets().find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
      const choice = await showDialog({
        title: `"${existing.name}" already exists`,
        body: `It currently holds ${existing.ids.length} point(s). Overwrite it with your ${state.selected.size}, or keep both?`,
        okLabel: 'Overwrite it',
        altLabel: 'Keep both — save as new',
      });
      if (choice === 'cancel') return false;
      if (choice === 'ok') {
        savePreset(name, { overwrite: true });
        renderPresets();
        toast(`Updated "${existing.name}"`);
        return true;
      }
      initial = uniquePresetName(name);
      continue;
    }

    renderPresets();
    toast(`Saved preset "${name.trim()}"`);
    return true;
  }
  return false;
}

function setDirection(dir) {
  if (state.direction === dir) return;
  state.direction = dir;
  $('dir-cw').setAttribute('aria-pressed', String(dir === 'cw'));
  $('dir-acw').setAttribute('aria-pressed', String(dir === 'acw'));
  render();
  saveState();
}

// How detours are taken:
//   over       walk over the top where possible, double back otherwise
//   over-only  no summit doubles back: only peaks you can walk over, chain, or pass
//              on the way. Swims and campsites are unaffected — walking out to a
//              pool and back is normal. This also frees traverses that would
//              otherwise be withdrawn to protect an out-and-back.
//   back       always double back, never leave the drawn line
function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  $('mode-over').setAttribute('aria-pressed', String(mode === 'over'));
  $('mode-only').setAttribute('aria-pressed', String(mode === 'over-only'));
  $('mode-back').setAttribute('aria-pressed', String(mode === 'back'));
  // Switching to over-only swaps in the plan built for it, since dropping every
  // out-and-back would otherwise leave the days half empty.
  if (mode === 'over-only') {
    const plan = state.data.recommendedNoBacktrack?.[state.direction]?.ids;
    if (plan) state.selected = new Set(plan);
  }
  render();
  saveState();
}

function setBasemap(which) {
  if (state.basemap === which) return;
  state.basemap = which;
  $('tiles-os').setAttribute('aria-pressed', String(which === 'os'));
  $('tiles-osm').setAttribute('aria-pressed', String(which === 'osm'));
  if (tileLayer) tileLayer.remove();
  const cfg = TILES[which];
  tileLayer = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    maxZoom: cfg.maxZoom,
    minZoom: 8,
  }).addTo(map);
  $('map-attr').textContent = cfg.attribution;
  saveState();
}

function wireEvents() {
  $('dir-cw').addEventListener('click', () => setDirection('cw'));
  $('dir-acw').addEventListener('click', () => setDirection('acw'));
  $('presets').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const name = del.dataset.del;
      showDialog({
        title: `Delete "${name}"?`,
        body: 'This removes the saved preset. Your current selection is untouched.',
        okLabel: 'Delete',
      }).then((a) => {
        if (a !== 'ok') return;
        deletePreset(name);
        renderPresets();
        toast(`Deleted "${name}"`);
      });
      return;
    }
    const builtin = e.target.closest('[data-preset]');
    if (builtin) {
      const key = builtin.dataset.preset;
      // Clicking the preset you are already on is a no-op, not a discard prompt.
      if (activePreset()?.kind === 'builtin' && activePreset().key === key) return;
      switchPreset(() => applyPreset(key));
      return;
    }
    const custom = e.target.closest('[data-custom]');
    if (custom) {
      const name = custom.dataset.custom;
      if (activePreset()?.kind === 'custom' && activePreset().key === name) return;
      switchPreset(() => applyCustomPreset(name));
    }
  });

  $('update-preset').addEventListener('click', () => updateCurrentPreset());
  $('save-preset').addEventListener('click', () => promptForPresetName());

  $('copy-link').addEventListener('click', async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — it carries your direction, peaks setting and selection');
    } catch {
      // Clipboard blocked (no permission, or not a secure context): show it instead.
      await showDialog({ title: 'Shareable link', body: url, okLabel: 'Close' });
    }
  });

  const dialogAnswer = (which) => {
    if (state.dialogResolve) state.dialogResolve(which);
  };
  $('confirm-ok').addEventListener('click', () => dialogAnswer('ok'));
  $('confirm-alt').addEventListener('click', () => dialogAnswer('alt'));
  $('confirm-cancel').addEventListener('click', () => dialogAnswer('cancel'));
  $('confirm').addEventListener('click', (e) => {
    if (e.target.closest('[data-confirm-cancel]')) dialogAnswer('cancel');
  });
  $('confirm-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialogAnswer('ok');
    if (e.key === 'Escape') dialogAnswer('cancel');
  });
  $('mode-over').addEventListener('click', () => setMode('over'));
  $('mode-only').addEventListener('click', () => setMode('over-only'));
  $('mode-back').addEventListener('click', () => setMode('back'));
  // No key: the OS option cannot work, so say so rather than offering a dead button.
  if (!HAS_OS) {
    const btn = $('tiles-os');
    btn.disabled = true;
    btn.title = 'No OS Maps key configured — set OS_MAPS_KEY and rebuild';
    btn.setAttribute('aria-pressed', 'false');
    $('tiles-osm').setAttribute('aria-pressed', 'true');
  }
  $('tiles-os').addEventListener('click', () => setBasemap('os'));
  $('tiles-osm').addEventListener('click', () => setBasemap('osm'));

  $('palette-open').addEventListener('click', openPalette);

  const input = $('palette-input');
  input.addEventListener('input', () => {
    state.search = input.value;
    state.searchIndex = 0;
    renderPalette();
  });
  input.addEventListener('keydown', (e) => {
    const n = state.paletteRows?.length ?? 0;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      state.searchIndex = (state.searchIndex + 1) % n;
      renderPalette();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      state.searchIndex = (state.searchIndex - 1 + n) % n;
      renderPalette();
    } else if (e.key === 'Enter' && n) {
      e.preventDefault();
      runPaletteRow(state.searchIndex, { toggle: e.shiftKey });
    } else if (e.key === 'Tab') {
      // Keep focus inside the panel: it is the only thing there is to interact with.
      e.preventDefault();
    }
  });

  $('palette-results').addEventListener('click', (e) => {
    const row = e.target.closest('[data-row]');
    if (row) runPaletteRow(Number(row.dataset.row), { toggle: e.shiftKey });
  });

  $('palette').addEventListener('click', (e) => {
    if (e.target.closest('[data-palette-close]')) closePalette();
  });

  document.addEventListener('keydown', (e) => {
    const key = (e.key ?? '').toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'k') {
      e.preventDefault();
      if (state.paletteOpen) closePalette();
      else openPalette();
      return;
    }
    // A bare "/" is the other conventional way in, as long as you are not typing.
    if (key === '/' && !state.paletteOpen && !/^(input|textarea)$/i.test(e.target?.tagName ?? '')) {
      e.preventDefault();
      openPalette();
    }
  });

  $('days').addEventListener('input', (e) => {
    const filter = e.target.closest('[data-filter]');
    if (!filter) return;
    state.dayFilter[Number(filter.dataset.filter)] = filter.value;
    applyDayFilters();
    saveState();
  });

  $('days').addEventListener('click', (e) => {
    if (e.target.closest('.day-filter')) return;
    const head = e.target.closest('[data-toggle]');
    if (!head) return;
    const day = Number(head.dataset.toggle);
    if (state.openDays.has(day)) state.openDays.delete(day);
    else state.openDays.add(day);
    head.closest('.day').classList.toggle('open');
    saveState();
  });

  $('days').addEventListener('change', (e) => {
    const box = e.target.closest('[data-poi]');
    if (!box) return;
    if (box.checked) state.selected.add(box.dataset.poi);
    else state.selected.delete(box.dataset.poi);

    renderStats();
    renderMap();
    renderExports();

    // Update just this day's figures in place, so ticking a box does not
    // collapse the panel you are working in.
    const dayEl = box.closest('.day');
    const day = currentDays().find((d) => d.day === Number(dayEl.dataset.day));
    const f = dayFigures(day);
    const p = state.data.route.planning;
    const lastN = currentDays().length;
    const cap = day.day === 1 || day.day === lastN ? (p.endDayMaxKm ?? p.maxDayKm) : p.maxDayKm;
    dayEl.classList.toggle('is-over', f.totalKm > cap);
    dayEl.classList.toggle('is-long', f.totalKm <= cap && f.totalKm >= p.longDayKm);
    dayEl.querySelector('.day-figs').innerHTML =
      `${km(f.totalKm)} km${f.addedKm > 0 ? ` <span class="plus">(+${km(f.addedKm)})</span>` : ''} <span class="asc">· ${Math.round(f.totalAscent)} m</span>`;
    for (const row of dayEl.querySelectorAll('.poi')) {
      row.classList.toggle('over', f.totalKm > cap);
    }
    if (state.paletteOpen) renderPalette();
    saveState();
  });

  $('exports').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-export]');
    if (!btn) return;
    const id = state.data.route.id;
    const stamp = (d) => String(d).padStart(2, '0');
    if (btn.dataset.export === 'full') {
      download(`${id}-${state.direction}-full.gpx`, fullGpx());
    } else if (btn.dataset.export === 'day') {
      const day = currentDays().find((d) => d.day === Number(btn.dataset.day));
      download(`${id}-${state.direction}-day-${stamp(day.day)}.gpx`, dayGpx(day));
    } else if (btn.dataset.export === 'all-days') {
      // Staggered: browsers drop rapid successive downloads.
      currentDays().forEach((day, i) => {
        setTimeout(
          () => download(`${id}-${state.direction}-day-${stamp(day.day)}.gpx`, dayGpx(day)),
          i * 350,
        );
      });
    }
  });
}

/* ---------------- boot ---------------- */

// Bounding box of the whole route, straight from the data. Looped rather than
// spread so it is safe for a route with a very large point count.
function routeBounds() {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const dir of Object.values(state.data.directions)) {
    for (const day of dir.days) {
      for (const p of day.points) {
        if (p[0] < minLat) minLat = p[0];
        if (p[0] > maxLat) maxLat = p[0];
        if (p[1] < minLon) minLon = p[1];
        if (p[1] > maxLon) maxLon = p[1];
      }
    }
  }
  if (!Number.isFinite(minLat)) throw new Error('route data contains no coordinates');
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function initMapFailed(message) {
  const el = $('map');
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.textAlign = 'center';
  el.style.padding = '2rem';
  el.innerHTML =
    `<span style="font-family:var(--mono);font-size:0.7rem;color:var(--muted);line-height:1.9">` +
    `${message}<br>The day-by-day plan, distances and every GPX download below still work.</span>`;
  $('map-attr').textContent = '';
}

async function boot() {
  const res = await fetch('route-data.json');
  if (!res.ok) throw new Error(`route-data.json failed to load (HTTP ${res.status})`);
  state.data = await res.json();
  const r = state.data.route;

  document.title = `${r.name} — route planner`;
  $('route-name').textContent = r.name;
  const start = new Date(`${r.startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + r.days - 1);
  const fmt = (d) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  $('route-sub').textContent = `${r.days} days · ${r.closedLoop ? 'circular' : 'linear'} · ${fmt(start)} – ${fmt(end)} ${end.getUTCFullYear()}`;

  // The map is a bonus, not a dependency: the itinerary, the figures and every
  // GPX export work without it. If Leaflet is blocked or the map throws, say so
  // in the map panel and carry on rather than taking the whole page down.
  if (typeof L === 'undefined') {
    initMapFailed('The map library could not be loaded (Leaflet was blocked or unreachable).');
  } else {
    try {
      map = L.map('map', { scrollWheelZoom: true });

      // The view MUST be set before any layer is added. A polyline added to a
      // map with no centre/zoom throws inside _clipPoints, because the pixel
      // bounds it clips against do not exist yet. Fitting the route's own
      // bounds here establishes the view and keeps this route-agnostic.
      map.fitBounds(routeBounds(), { padding: [24, 24] });

      detourLayer = L.layerGroup().addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      const cfg = TILES[state.basemap];
      tileLayer = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
        minZoom: 8,
      }).addTo(map);
      $('map-attr').textContent = cfg.attribution;

      // An OS key restricted to a domain 401s elsewhere; fall back to OSM rather
      // than leave a blank grey map.
      let osFailures = 0;
      tileLayer.on('tileerror', () => {
        osFailures += 1;
        if (osFailures === 6 && state.basemap === 'os') setBasemap('osm');
      });
    } catch (err) {
      console.error('Map initialisation failed:', err);
      map = null;
      initMapFailed(`The map could not start: ${err.message}`);
    }
  }

  const g = state.data.generatedFrom;
  $('provenance').innerHTML = `
    <p><strong>Base route.</strong> Your own <code>${g.baseGpx}</code> — 4,697 points drawn in OS Maps —
    used exactly as supplied. Distance is measured along it directly at ${r.totalKm} km, with no
    correction factor.</p>
    <p><strong>Ascent.</strong> The GPX carries no elevation, so heights are sampled from ${g.elevation}
    and smoothed before gradients are summed. On a closed loop ascent and descent must be equal, and here
    they agree to within 12 m across ${r.ascentM.toLocaleString()} m of climbing.</p>
    <p><strong>Detours.</strong> Routed onto real paths with ${g.detourRouting} rather than drawn as
    straight lines, and costed along the routed spur.</p>
    <p><strong>Peaks.</strong> Positions converted from OS grid references and each verified against the
    DEM; any whose height did not match was rejected rather than published.</p>`;

  const camps = campCategory();
  $('footer').innerHTML =
    `${r.name} · ${r.days} days · ${r.totalKm} km base · built ${new Date().toLocaleDateString('en-GB')}<br>` +
    (camps?.legalNote ? `${camps.legalNote}<br>` : '') +
    'Leave no trace. Check the forecast — treat Sharp Edge, Striding Edge and Jack’s Rake as serious in poor conditions.';

  wireEvents();

  // Restore the previous session if there is one, otherwise start from the
  // recommended plan.
  state.presets = loadPresets();

  state.restoring = true;
  // A shared link is an explicit instruction and outranks whatever this browser
  // happens to have saved.
  const fromUrl = readUrl();
  const restored = fromUrl === 'ok' ? true : restoreState();
  state.restoring = false;
  if (fromUrl === 'stale') {
    setTimeout(
      () =>
        showDialog({
          title: 'That link is out of date',
          body:
            'It was made from an earlier build, where the points were numbered differently, so it cannot be decoded safely. Showing the recommended plan instead.',
          okLabel: 'Close',
        }),
      300,
    );
  }
  if (restored) {
    $('dir-cw').setAttribute('aria-pressed', String(state.direction === 'cw'));
    $('dir-acw').setAttribute('aria-pressed', String(state.direction === 'acw'));
    $('mode-over').setAttribute('aria-pressed', String(state.mode === 'over'));
    $('mode-only').setAttribute('aria-pressed', String(state.mode === 'over-only'));
    $('mode-back').setAttribute('aria-pressed', String(state.mode === 'back'));
    if (state.basemap === 'osm') {
      state.basemap = 'os'; // setBasemap only acts on a change
      setBasemap('osm');
    }
    render();
  } else {
    applyPreset('recommended');
  }
  if (map && baseLine) {
    const bounds = baseLine.getBounds();
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [24, 24] });
  }
}

boot().catch((err) => {
  $('route-sub').textContent = `Failed to load: ${err.message}`;
  console.error(err);
});
