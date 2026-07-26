// Behavioural tests for the page's persistence and search, run against the real
// site/app.js and the real route-data.json in a stubbed DOM.
//
// Covers what a boot-only smoke test cannot: that a session is restored, that a
// stale id left over from an earlier build is discarded rather than resurrected as a
// phantom selection, that corrupt storage falls back instead of breaking the page,
// and that search ranks a prefix match above a substring one.
//
// Usage: node scripts/test-features.mjs
import fs from 'node:fs';
import vm from 'node:vm';

function makeCtx(store) {
  const handlers = {};
  function el(id) {
    return {
      id, _html: '', _text: '', value: '', hidden: false,
      classList: { toggle(){}, add(){}, remove(){}, contains(){return false} },
      dataset: {}, style: {}, children: { length: 0 },
      set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
      set textContent(v){ this._text = String(v); }, get textContent(){ return this._text; },
      setAttribute(){}, getAttribute(){return null},
      addEventListener(ev, fn){ handlers[`${id}:${ev}`] = fn; },
      querySelectorAll(){ return [] }, querySelector(){ return null }, tagName: 'DIV',
      closest(){ return null }, remove(){}, appendChild(){}, click(){},
      select(){}, focus(){}, blur(){}, scrollIntoView(){}, setSelectionRange(){},
      getBoundingClientRect(){ return { height: 500, width: 900 } },
    };
  }
  const registry = new Map();
  const document = {
    title: '', addEventListener(){},
    getElementById(id){ if(!registry.has(id)) registry.set(id, el(id)); return registry.get(id); },
    querySelectorAll(){ return [] }, querySelector(){ return el('q') }, createElement(){ return el('c') },
    body: { appendChild(){}, removeChild(){} },
    execCommand(){ return true },
  };
  const layer = () => ({ addTo(){ return this }, remove(){}, clearLayers(){}, on(){},
    bindPopup(){ return this }, openPopup(){}, getBounds(){ return { isValid: () => true, pad(){return this} } } });
  const L = {
    map(){ return { __isMap:true, setView(){return this},
      fitBounds(){return this}, remove(){}, on(){}, invalidateSize(){},
      addLayer(){}, removeLayer(){}, panTo(){} } },
    tileLayer(){ return layer() }, polyline(){ return layer() }, layerGroup(){ return layer() },
    marker(){ return layer() }, divIcon(){ return {} }, latLngBounds(b){ return b },
  };
  const data = JSON.parse(fs.readFileSync('site/route-data.json','utf8'));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const ctx = { document, L, console, localStorage, Blob: class {},
    URL:{createObjectURL(){return 'b:'},revokeObjectURL(){}},
    setTimeout, clearTimeout, Math, Date, JSON, Number, String, Array, Object, Set, Map, isNaN, Infinity,
    fetch: async () => ({ ok:true, status:200, json: async () => data }) };
  ctx.location = { origin: 'http://route-planner.test', pathname: '/site/index.html', hash: '' };
  ctx.history = { replaceState(_a, _b, h) { ctx.location.hash = String(h || ''); } };
  ctx.navigator = { clipboard: { writeText: async () => {} } };
  ctx.APP_CONFIG = { osMapsKey: 'test-key-not-real' };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['site/share.js','site/resolve.js','site/app.js']) {
    new vm.Script(fs.readFileSync(f,'utf8'), { filename: f }).runInContext(ctx);
  }
  // Top-level `const` is lexical, not a property of globalThis, so reach it by
  // evaluating in the same context.
  const evalIn = (code) => new vm.Script(code).runInContext(ctx);
  return { ctx, registry, handlers, evalIn };
}

let fails = 0;
const check = (n, ok, d='') => { if(!ok) fails++; console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?`  — ${d}`:''}`); };

// --- session 1: change things, confirm they persist ---
const store = new Map();
const s1 = makeCtx(store);
await new Promise(r=>setTimeout(r,400));
const st1 = s1.evalIn('state');
check('state is reachable for testing', st1 != null);
const initialCount = st1.selected.size;
check('starts from the recommended plan', initialCount > 0, `${initialCount} selected`);

// mutate: switch direction, mode, drop a selection, set a day filter
st1.direction = 'acw';
st1.mode = 'over-only';
const dropped = [...st1.selected][0];
st1.selected.delete(dropped);
st1.dayFilter[3] = 'tarn';
st1.openDays.add(7);
s1.evalIn('saveState()');
check('something was written to storage', store.size === 1, `${store.size} key(s)`);
const key = [...store.keys()][0];
check('storage key is namespaced and versioned', /^route-planner:lakeland-way:v\d+$/.test(key), key);

// --- session 2: fresh boot, should restore ---
const s2 = makeCtx(store);
await new Promise(r=>setTimeout(r,400));
const st2 = s2.evalIn('state');
check('direction restored', st2.direction === 'acw', st2.direction);
check('mode restored', st2.mode === 'over-only', st2.mode);
check('selection restored', !st2.selected.has(dropped) && st2.selected.size === st1.selected.size,
      `${st2.selected.size} vs ${st1.selected.size}`);
check('day filter restored', st2.dayFilter[3] === 'tarn', JSON.stringify(st2.dayFilter));
check('open days restored', st2.openDays.has(7));

// --- stale ids must be dropped ---
const poisoned = new Map(store);
const saved = JSON.parse(poisoned.get(key));
saved.selected.push('peak-does-not-exist', 'swim-nope');
poisoned.set(key, JSON.stringify(saved));
const s3 = makeCtx(poisoned);
await new Promise(r=>setTimeout(r,400));
check('unknown ids are discarded on restore',
      !s3.evalIn('state').selected.has('peak-does-not-exist'), 'phantom id rejected');

// --- corrupt storage must not break boot ---
const broken = new Map([[key, '{not json']]);
const s4 = makeCtx(broken);
await new Promise(r=>setTimeout(r,400));
check('corrupt storage falls back to recommended',
      s4.evalIn('state').selected.size > 0, `${s4.evalIn('state').selected.size} selected`);

// --- search ---
const search = (q, o) => s4.evalIn('searchItems')(q, o);
const r1 = search('scafell');
check('search finds Scafell Pike', r1.some(i=>i.title==='Scafell Pike'), r1.map(i=>i.title).join(', '));
check('exact prefix ranks first', r1[0].title.toLowerCase().startsWith('scafell'), r1[0].title);
const r2 = search('black moss');
check('search finds Black Moss Pot', r2[0]?.title === 'Black Moss Pot', r2[0]?.title);
const r3 = search('scramble');
check('search matches labels', r3.length > 0, `${r3.length} hits for "scramble"`);
const r4 = search('deepest');
check('search matches descriptions', r4.length > 0, `${r4.length} hits for "deepest"`);
check('empty query returns nothing', search('').length === 0);
check('nonsense query returns nothing', search('zzzqqq').length === 0);
check('results are capped', search('e', {limit:14}).length <= 14, `${search('e').length}`);

// --- command palette ---
const pr = (q) => s4.evalIn('paletteResults')(q);
const open = () => s4.evalIn('openPalette()');
const close = () => s4.evalIn('closePalette()');

const empty = pr('');
check('palette shows actions when empty', empty.length > 0 && empty.every(r => r.kind === 'command'),
      `${empty.length} rows, all commands`);
const mixed = pr('peak');
check('palette mixes commands and points', mixed.some(r=>r.kind==='command') && mixed.some(r=>r.kind==='item'),
      mixed.map(r=>r.kind).join(','));
check('commands come before points',
      mixed.findIndex(r=>r.kind==='command') < mixed.findIndex(r=>r.kind==='item'));
const dl = pr('download');
check('download commands are findable', dl.length > 0 && dl.every(r=>r.kind==='command'), `${dl.length} rows`);
check('per-day download commands exist', s4.evalIn('paletteCommands()').some(c=>c.id==='gpx:day:7'));
const acw = pr('anticlock');
check('direction command is findable', acw[0]?.cmd?.id === 'dir:acw', acw[0]?.cmd?.id);
const sp = pr('scafell pike');
check('a point is still findable', sp.some(r=>r.kind==='item' && r.item.title==='Scafell Pike'));
check('nothing matches nonsense', pr('zzzqqq').length === 0);

open();
const st = s4.evalIn('state');
check('open sets paletteOpen and clears the query', st.paletteOpen === true && st.search === '');
check('open selects the first row', st.searchIndex === 0);
close();
check('close resets paletteOpen', s4.evalIn('state').paletteOpen === false);

// Shift-Enter on a point toggles it without closing
open();
s4.evalIn("state.search='black moss'; state.searchIndex=0;");
s4.evalIn('renderPalette()');
const rows = s4.evalIn('state').paletteRows;
const firstItem = rows.findIndex(r=>r.kind==='item');
check('a point row is present for toggling', firstItem >= 0);
const targetId = rows[firstItem].item.id;
const before = s4.evalIn('state').selected.has(targetId);
s4.evalIn(`runPaletteRow(${firstItem}, { toggle: true })`);
const after = s4.evalIn('state').selected.has(targetId);
check('shift-enter toggles selection', before !== after, `${before} -> ${after}`);
check('shift-enter keeps the palette open', s4.evalIn('state').paletteOpen === true);
close();

// --- shareable URL ---
const ev = s4.evalIn;
const ids = ev('canonicalIds(allDetourItems())');
check('canonical id order is stable and complete', ids.length === all_count(s4) && ids.join() === [...ids].sort().join(),
      `${ids.length} ids, sorted`);
const url = ev('shareUrl()');
check('share url has the documented shape', /#v1\.[0-9a-f]{6}\.(cw|acw)\.(over|over-only|back)\.[0-9a-f]+$/.test(url), url.slice(-70));
// round-trip
const sel = ev('state').selected;
const hex = ev('encodeSelection(state.selected, canonicalIds(allDetourItems()))');
const back = ev(`decodeSelection('${hex}', canonicalIds(allDetourItems()))`);
check('selection round-trips through the url encoding',
      back.size === sel.size && [...sel].every(x => back.has(x)), `${sel.size} ids`);
const emptyHex = ev('encodeSelection(new Set(), canonicalIds(allDetourItems()))');
check('empty selection round-trips', ev(`decodeSelection('${emptyHex}', canonicalIds(allDetourItems()))`).size === 0);
const allHex = ev('encodeSelection(new Set(canonicalIds(allDetourItems())), canonicalIds(allDetourItems()))');
check('full selection round-trips', ev(`decodeSelection('${allHex}', canonicalIds(allDetourItems()))`).size === ids.length);
check('url stays a sane length', url.length < 200, `${url.length} chars`);

// a stale fingerprint must be refused, not mis-decoded
ev("location.hash = '#v1.000000.cw.over.ff00ff00';");
check('a link from an older build is reported stale', ev('readUrl()') === 'stale');
ev(`location.hash = '${url.split('#')[1] ? '#' + url.split('#')[1] : ''}';`);
check('a current link decodes', ev('readUrl()') === 'ok');
ev("location.hash = '';");
check('no hash reads as nothing', ev('readUrl()') === null);
ev("location.hash = '#garbage';");
check('malformed hash is ignored', ev('readUrl()') === null);

// --- presets ---
ev("state.presets = []; state.selected = new Set(builtinSet('recommended'));");
check('recommended is detected as the active preset',
      ev('activePreset()')?.key === 'recommended', JSON.stringify(ev('activePreset()')));
check('unmodified when on a preset', ev('isModified()') === false);
ev("state.selected.delete([...state.selected][0]);");
check('modified once the selection is edited', ev('isModified()') === true);
check('no active preset when modified', ev('activePreset()') === null);

check('saving a preset works', ev("savePreset('My plan')") === 'saved');
check('saved preset becomes the active one', ev('activePreset()')?.key === 'My plan', JSON.stringify(ev('activePreset()')));
check('an empty name is refused', ev("savePreset('   ')") === 'invalid');
check('preset persists to storage', ev('loadPresets()').some(p => p.name === 'My plan'));
// A collision must be reported, never silently overwritten.
check('re-using a name reports a collision', ev("savePreset('My plan')") === 'exists');
check('a refused save leaves the stored preset untouched',
      ev('loadPresets()').filter(p => p.name === 'My plan').length === 1);
const beforeIds = ev("loadPresets().find(p => p.name === 'My plan').ids").length;
ev("state.selected = new Set([...canonicalIds(allDetourItems())].slice(0, 3));");
check('overwrite only happens when asked for', ev("savePreset('My plan')") === 'exists');
check('and the old contents survive that refusal',
      ev("loadPresets().find(p => p.name === 'My plan').ids").length === beforeIds, `${beforeIds} ids`);
check('explicit overwrite replaces the contents',
      ev("savePreset('My plan', { overwrite: true })") === 'saved'
        && ev("loadPresets().find(p => p.name === 'My plan').ids").length === 3);
check('overwrite is case-insensitive on the name',
      ev("savePreset('MY PLAN')") === 'exists');
check('overwrite keeps its position in the list',
      ev("loadPresets()").findIndex(p => p.name === 'My plan') === 0);
check('overwriting keeps the original capitalisation',
      ev("loadPresets().find(p => p.name.toLowerCase() === 'my plan').name") === 'My plan');
// unique-name suggestion
ev("savePreset('Coniston plan', { overwrite: true })");
check('suggests an unused name for "save as new"',
      ev("uniquePresetName('Coniston plan')") === 'Coniston plan 2',
      ev("uniquePresetName('Coniston plan')"));
ev("savePreset('Coniston plan 2', { overwrite: true })");
check('and skips names already taken',
      ev("uniquePresetName('Coniston plan')") === 'Coniston plan 3',
      ev("uniquePresetName('Coniston plan')"));
check('suggestion does not stack numbers',
      ev("uniquePresetName('Coniston plan 2')") === 'Coniston plan 3',
      ev("uniquePresetName('Coniston plan 2')"));
// the preset being worked from, for re-saving
ev("state.basePresetName = null; applyCustomPreset('My plan');");
check('applying a custom preset records it as the base',
      ev('state').basePresetName === 'My plan');
ev("applyPreset('recommended');");
check('applying a built-in clears the base', ev('state').basePresetName === null);
ev("applyCustomPreset('My plan'); deletePreset('My plan');");
check('deleting the base preset clears the reference', ev('state').basePresetName === null);
ev("deletePreset('Coniston plan'); deletePreset('Coniston plan 2');");

// --- update button ---
ev("state.presets = []; storePresets([]); state.basePresetName = null;");
ev("state.selected = new Set(builtinSet('recommended')); savePreset('Trip A');");
check('nothing to update right after saving', ev('updatablePreset()') === null);
ev("applyCustomPreset('Trip A');");
check('still nothing to update while it matches', ev('updatablePreset()') === null);
ev("state.selected.delete([...state.selected][0]);");
check('update becomes available once edited', ev('updatablePreset()')?.name === 'Trip A',
      ev('updatablePreset()')?.name ?? 'null');
const countBefore = ev("loadPresets().find(p => p.name === 'Trip A').ids").length;
check('update overwrites without prompting', (await ev('updateCurrentPreset()')) === true);
const countAfter = ev("loadPresets().find(p => p.name === 'Trip A').ids").length;
check('the preset now holds the edited selection', countAfter === countBefore - 1,
      `${countBefore} -> ${countAfter}`);
check('and there is nothing left to update', ev('updatablePreset()') === null);
check('the preset is active again after updating', ev('activePreset()')?.key === 'Trip A');
ev("applyPreset('all');");
check('no update offered after switching to a built-in', ev('updatablePreset()') === null);
ev("applyCustomPreset('Trip A'); state.selected.clear(); deletePreset('Trip A');");
check('no update offered once the preset is deleted', ev('updatablePreset()') === null);
check('updateCurrentPreset is a no-op with no target', (await ev('updateCurrentPreset()')) === false);
ev("storePresets([]); state.presets = [];");
check('deleting a preset works', !ev('loadPresets()').some(p => p.name === 'My plan'));
check('base route preset is detected', (() => { ev("state.selected = new Set();"); return ev('activePreset()')?.key === 'none'; })());
check('selecting everything now reads as modified, not a preset',
      (() => { ev("state.selected = new Set(canonicalIds(allDetourItems()));"); return ev('activePreset()') === null; })());
check('only base and recommended are built in',
      ev('BUILTIN_PRESETS').map((p) => p.key).join(',') === 'none,recommended',
      ev('BUILTIN_PRESETS').map((p) => p.key).join(','));
check('a removed preset key resolves to nothing', ev("builtinSet('all')") === null);

function all_count(sess) { return sess.evalIn('allDetourItems()').length; }

// --- shipped presets (baked in by scripts/preset.mjs, present on every origin) ---
ev("storePresets([]); state.presets = []; state.basePresetName = null;");
const shipped = ev('shippedPresets()');
check('shipped presets load from the build', Array.isArray(shipped), `${shipped.length} shipped`);
check('shipped presets are marked as such', shipped.every(p => p.shipped === true));
check('shipped presets appear in the combined list',
      ev('allPresets()').length === shipped.length, `${ev('allPresets()').length}`);
if (shipped.length) {
  const name = shipped[0].name;
  ev(`applyCustomPreset(${JSON.stringify(name)})`);
  check('a shipped preset can be applied', ev('activePreset()')?.key === name, ev('activePreset()')?.key);
  check('and is recognised as shipped', ev('activePreset()')?.shipped === true);
  ev("state.selected.delete([...state.selected][0]);");
  check('a shipped preset cannot be updated from the browser', ev('updatablePreset()') === null);
}
// a local preset of the same name must not shadow a shipped one
if (shipped.length) {
  ev(`state.selected = new Set(canonicalIds(allDetourItems()).slice(0,3)); savePreset(${JSON.stringify(shipped[0].name)}, { overwrite: true });`);
  check('a local preset cannot shadow a shipped name',
        ev('loadPresets()').every(p => p.name.toLowerCase() !== shipped[0].name.toLowerCase()));
}
ev("storePresets([]); state.presets = [];");

// --- a saved preset survives a refresh and stays active ---
// Regression: savePreset stored the preset but not the selection, so after a reload the
// selection reverted to whatever was last persisted and the preset looked inactive —
// indistinguishable from the save not having worked.
{
  const store2 = new Map();
  const a = makeCtx(store2);
  await new Promise((r) => setTimeout(r, 350));
  const sa = a.evalIn('state');
  sa.selected = new Set(a.evalIn('canonicalIds(allDetourItems())').slice(0, 7));
  check('saving reports success', a.evalIn("savePreset('Refresh test')") === 'saved');
  check('active immediately after saving', a.evalIn('activePreset()')?.key === 'Refresh test');

  const b = makeCtx(store2);
  await new Promise((r) => setTimeout(r, 350));
  check('after a refresh the preset still exists',
        b.evalIn('allPresets()').some((p) => p.name === 'Refresh test'));
  check('after a refresh the selection is the one that was saved',
        b.evalIn('state').selected.size === 7, `${b.evalIn('state').selected.size} points`);
  check('after a refresh it is still the active preset',
        b.evalIn('activePreset()')?.key === 'Refresh test',
        JSON.stringify(b.evalIn('activePreset()')));
  check('and it is remembered as the one being worked from',
        b.evalIn('state').basePresetName === 'Refresh test', b.evalIn('state').basePresetName ?? 'null');
}

// --- clipboard ---
// navigator.clipboard is unavailable over plain http, which is how a local dev domain
// is served, so the fallback path is the one that actually matters day to day.
check('copies when navigator.clipboard exists', (await ev("copyToClipboard('x')")) === true);
ev("navigator.clipboard = undefined;");
check('still copies without it, via execCommand', (await ev("copyToClipboard('y')")) === true);
ev("navigator.clipboard = { writeText: async () => {} };");

// --- share encoding comes from the generated module, shared with the CLI ---
check('the generated share module is loaded', typeof ev('window.encodeShare') === 'function');
const hash = ev('shareHash()');
check('encodes to the documented shape', /^v1\.[0-9a-f]{6}\.(cw|acw)\.(over|over-only|back)\.[0-9a-f]+$/.test(hash), hash.slice(0, 40));
const rt = ev(`window.decodeShare(${JSON.stringify(hash)}, allDetourItems())`);
check('round-trips through decodeShare', rt.ok === true && rt.ids.length === ev('state').selected.size,
      `${rt.ids?.length} vs ${ev('state').selected.size}`);
check('a stale fingerprint is refused',
      ev("window.decodeShare('v1.000000.cw.over.ff00', allDetourItems()).stale") === true);

console.log(`\n${fails === 0 ? 'ALL FEATURE CHECKS PASSED' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
