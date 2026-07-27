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
    title: '',
    // Capture-phase listeners get their own key: the popup add/remove button is
    // delegated on document with capture, and would otherwise overwrite a bubble-phase
    // listener for the same event.
    addEventListener(ev, fn, capture){ handlers[`document:${ev}${capture ? ':capture' : ''}`] = fn; },
    getElementById(id){ if(!registry.has(id)) registry.set(id, el(id)); return registry.get(id); },
    querySelectorAll(){ return [] }, querySelector(){ return el('q') }, createElement(){ return el('c') },
    body: { appendChild(){}, removeChild(){} },
    execCommand(){ return true },
  };
  // Popup content is recorded rather than discarded, so a test can assert what a marker
  // actually offers, and how often it was re-opened. Children are tracked too, so a test
  // can prove a layer group still holds what was added to it after a re-render.
  const layer = (kind) => ({
    _kind: kind, _children: [],
    addTo(p){ if (Array.isArray(p?._children)) p._children.push(this); return this },
    remove(){}, on(){},
    clearLayers(){ this._children.length = 0; },
    bindPopup(html){ this._popupHtml = String(html); return this },
    openPopup(){ this._opened = (this._opened ?? 0) + 1; },
    setLatLng(ll){ this._latlng = ll; return this },
    setRadius(r){ this._radius = r; return this },
    getBounds(){ return { isValid: () => true, pad(){return this} } },
  });
  const L = {
    map(){ return { __isMap:true, setView(){return this},
      fitBounds(){return this}, remove(){}, on(){}, invalidateSize(){},
      addLayer(){}, removeLayer(){}, panTo(){}, getZoom(){ return 11 } } },
    tileLayer(){ return layer('tile') }, polyline(){ return layer('polyline') },
    layerGroup(){ return layer('group') }, marker(){ return layer('marker') },
    circle(){ return layer('circle') },
    divIcon(){ return {} }, latLngBounds(b){ return b },
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
  // Fake geolocation that records rather than acts, so a test can drive the callbacks and
  // assert nothing asks for a position unless the button was pressed.
  const geoCalls = { watch: 0, clear: 0, clearedId: null, options: null, cb: null };
  ctx.navigator = {
    clipboard: { writeText: async () => {} },
    geolocation: {
      watchPosition(ok, err, options){
        geoCalls.watch += 1;
        geoCalls.options = options;
        geoCalls.cb = { ok, err };
        return 42;
      },
      clearWatch(id){ geoCalls.clear += 1; geoCalls.clearedId = id; },
    },
  };
  ctx.isSecureContext = true;
  ctx.APP_CONFIG = { osMapsKey: 'test-key-not-real' };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['site/share.js','site/resolve.js','site/app.js']) {
    new vm.Script(fs.readFileSync(f,'utf8'), { filename: f }).runInContext(ctx);
  }
  // Top-level `const` is lexical, not a property of globalThis, so reach it by
  // evaluating in the same context.
  const evalIn = (code) => new vm.Script(code).runInContext(ctx);
  return { ctx, registry, handlers, evalIn, geoCalls };
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

// Enter on a point toggles it without closing
open();
s4.evalIn("state.search='black moss'; state.searchIndex=0;");
s4.evalIn('renderPalette()');
const rows = s4.evalIn('state').paletteRows;
const firstItem = rows.findIndex(r=>r.kind==='item');
check('a point row is present for toggling', firstItem >= 0);
const targetId = rows[firstItem].item.id;
const before = s4.evalIn('state').selected.has(targetId);
s4.evalIn(`runPaletteRow(${firstItem})`);
const after = s4.evalIn('state').selected.has(targetId);
check('enter toggles selection', before !== after, `${before} -> ${after}`);
check('enter keeps the palette open', s4.evalIn('state').paletteOpen === true);
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

// --- overlapping traverses: why a ticked peak can be left out ---
// Scafell, Great Gable and Scafell Pike all want the same stretch of route. Only one can
// have it, so the others were silently dropped: ticking them appeared to do nothing, and
// the row still advertised the traverse cost it could not deliver.
{
  const items = ev('allDetourItems()');
  const find = (n) => items.find((i) => i.title === n);
  const sp = find('Scafell Pike');
  const sf = find('Scafell');
  const gg = find('Great Gable');
  check('the three summits share a day', sp && sf && gg && sf.dayByDirection.cw === sp.dayByDirection.cw);
  check('and their traverse stretches overlap',
        sf.traverse.fromKm < sp.traverse.toKm && sf.traverse.toKm > sp.traverse.fromKm);

  ev("setMode('over-only'); setDirection('cw'); state.selected = new Set();");
  ev(`state.selected.add(${JSON.stringify(sp.id)}); state.selected.add(${JSON.stringify(sf.id)}); state.selected.add(${JSON.stringify(gg.id)});`);
  const f = ev(`dayFigures(currentDays().find((d) => d.day === ${sp.dayByDirection.cw}))`);
  const mode = (id) => f.modes.get(id);
  // Was: "the cheapest traverse wins the stretch". It no longer should — winning the
  // stretch alone meant dropping the other two summits, which was the bug.
  check('the stretch is used by a chain, not a lone traverse', mode(sp.id) === 'chain', mode(sp.id));
  // With every combination routed, all three are walked as one line instead of two of
  // them winning and the third being dropped.
  check('all three are included, as one chained walk',
        mode(sp.id) === 'chain' && mode(sf.id) === 'chain' && mode(gg.id) === 'chain',
        `${mode(sf.id)}/${mode(gg.id)}/${mode(sp.id)}`);
  check('nothing is excluded', f.excluded === 0, `${f.excluded}`);

  // And the whole cluster at once.
  const cluster = ['Illgill Head', 'Scafell', 'Emerald Pools', 'Great Gable', 'Scafell Pike', 'Bowfell', 'Crinkle Crags']
    .map((n) => find(n))
    .filter(Boolean);
  ev(`state.selected = new Set(${JSON.stringify(cluster.map((i) => i.id))});`);
  const fAll = ev(`dayFigures(currentDays().find((d) => d.day === ${sp.dayByDirection.cw}))`);
  check(`all ${cluster.length} summits in the cluster can be walked together`,
        fAll.excluded === 0 && cluster.every((i) => fAll.modes.get(i.id) === 'chain'),
        `excluded=${fAll.excluded}`);

  // Every point stays tickable now, so the reason has somewhere to be shown.
  check('nothing is disabled in the day list',
        !ev("renderDays(); document.getElementById('days').innerHTML").includes('disabled'));
  ev("state.selected = new Set(); setMode('over');");
}

// --- saving is offered locally only ---
{
  // The harness runs in production mode, so the save affordances must be absent.
  ev('renderPresets()');
  check('Save preset is hidden in production', ev("document.getElementById('save-preset').hidden") === true);
  check('and the palette does not offer it',
        !ev('paletteCommands()').some((c) => c.id === 'preset:save'));
  check('Copy link is still there', ev("typeof document.getElementById('copy-link')") === 'object');
  check('and shipping a browser preset is still offered',
        typeof ev('copyDeployCommand') === 'function');
}

// --- promoting a browser preset to a shipped one ---
// The gap this closes: a preset in localStorage cannot reach the deployed site, and
// working that out from the UI was not obvious.
{
  ev("storePresets([]); state.presets = []; state.basePresetName = null;");
  const NAME = '__test browser preset__';
  check('the test name does not clash with a shipped preset',
        !ev('shippedPresets()').some((p) => p.name === NAME));
  ev(`state.selected = new Set(canonicalIds(allDetourItems()).slice(0, 9)); savePreset(${JSON.stringify(NAME)});`);
  const preset = ev(`allPresets().find((p) => p.name === ${JSON.stringify(NAME)})`);
  check('the browser preset exists', Boolean(preset), `${preset?.ids?.length} points`);
  const cmd = ev(`deployCommandFor(allPresets().find((p) => p.name === ${JSON.stringify(NAME)}))`);
  check('a deploy command is produced', cmd.startsWith('npm run preset add'), cmd.slice(0, 40) + '…');
  check('it quotes the name', cmd.includes(JSON.stringify(NAME)));
  check('it carries a share link', /#v1\.[0-9a-f]{6}\.(cw|acw)\.(over|over-only|back)\./.test(cmd));

  // the link in that command must decode back to exactly the preset's points
  const url = cmd.match(/"(https?:[^"]+)"/)?.[1];
  const decoded = ev(`window.decodeShare(${JSON.stringify(url)}, allDetourItems())`);
  check('the link decodes', decoded.ok === true);
  check('to the same 9 points', decoded.ids.length === 9, `${decoded.ids.length}`);
  check('and the same direction and mode',
        decoded.direction === preset.direction && decoded.mode === preset.mode,
        `${decoded.direction}/${decoded.mode}`);
  ev("storePresets([]); state.presets = [];");
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

// --- the palette is a control surface, not just a jump list ---
// Enter used to navigate and close, which meant ticking three peaks was three round
// trips through the page. It now toggles in place and the panel stays up.
console.log('\nPalette toggling');
const s5 = makeCtx(new Map());
await new Promise(r=>setTimeout(r,400));
const st5 = s5.evalIn('state');
const ev5 = (code) => s5.evalIn(code);
ev5('openPalette()');
st5.search = 'scafell pike';
ev5('renderPalette()');
const paletteHtml = () => s5.registry.get('palette-results').innerHTML;
const rows5 = st5.paletteRows;
const idx5 = rows5.findIndex((r) => r.kind === 'item' && r.item.title === 'Scafell Pike');
check('the palette lists a searched point', idx5 >= 0, `row ${idx5} of ${rows5.length}`);
const id5 = rows5[idx5].item.id;

check('every item row shows its day', /class="pr-day">Day \d+</.test(paletteHtml()),
      (paletteHtml().match(/class="pr-day">Day \d+/) ?? ['none'])[0]);
check('and a checkbox, so it reads as a toggle', /class="pr-check/.test(paletteHtml()) && /[☐☑]/.test(paletteHtml()));
check('and its own go-to-the-map button', new RegExp(`class="pr-go" data-go="${id5}"`).test(paletteHtml()));

const was5 = st5.selected.has(id5);
ev5(`runPaletteRow(${idx5})`);
check('plain Enter adds or removes', st5.selected.has(id5) === !was5, `${was5} -> ${st5.selected.has(id5)}`);
check('and the palette stays open for the next one', st5.paletteOpen === true);
check('the row redraws with the new state', paletteHtml().includes(!was5 ? '☑' : '☐'));
ev5(`runPaletteRow(${idx5})`);
check('toggling again puts it back', st5.selected.has(id5) === was5);
check('still open', st5.paletteOpen === true);

ev5(`runPaletteRow(${idx5}, { jump: true })`);
check('Shift-Enter goes to it and closes instead', st5.paletteOpen === false);
check('leaving the selection alone', st5.selected.has(id5) === was5);

// A command row must still run and close, not try to toggle something.
ev5('openPalette()');
st5.search = 'anticlockwise';
ev5('renderPalette()');
const cmdIdx = st5.paletteRows.findIndex((r) => r.kind === 'command');
check('command rows are still matched', cmdIdx >= 0);
ev5(`runPaletteRow(${cmdIdx})`);
check('and running one closes the palette', st5.paletteOpen === false);

// --- add and remove from a map popup ---
console.log('\nMap popup toggling');
const markers5 = ev5('markerById');
check('markers are registered', markers5.size > 0, `${markers5.size} markers`);
const before5 = markers5.get(id5);
check('a popup offers add/remove', /data-popup-toggle="/.test(before5?._popupHtml ?? ''));
check('labelled for the current state',
      (before5?._popupHtml ?? '').includes(was5 ? 'Remove from route' : 'Add to route'),
      was5 ? 'selected -> Remove' : 'unselected -> Add');

const onPopupClick = s5.handlers['document:click:capture'];
check('the popup button is delegated on document, in capture phase', typeof onPopupClick === 'function');
const fakeBtn = { dataset: { popupToggle: id5 } };
let defaultPrevented = false;
onPopupClick({
  target: { closest: (sel) => (sel === '[data-popup-toggle]' ? fakeBtn : null) },
  preventDefault(){ defaultPrevented = true; },
  stopPropagation(){},
});
check('clicking it toggles the point', st5.selected.has(id5) === !was5, `${was5} -> ${st5.selected.has(id5)}`);
check('and swallows the event, so the map does not also handle it', defaultPrevented === true);
const after5 = ev5('markerById').get(id5);
check('the marker was rebuilt by the re-render', after5 !== before5);
check('and its popup re-opened, so you keep your place', (after5?._opened ?? 0) > 0, `${after5?._opened} open(s)`);
check('with the label flipped', (after5?._popupHtml ?? '').includes(!was5 ? 'Remove from route' : 'Add to route'));
check('a click landing elsewhere is ignored',
      onPopupClick({ target: { closest: () => null } }) === undefined);

// --- showing your own position ------------------------------------------------------
console.log('\nMy location');
const s6 = makeCtx(new Map());
await new Promise(r=>setTimeout(r,400));
const ev6 = (code) => s6.evalIn(code);
const geo6 = s6.geoCalls;

// The invariant that matters most: a page load must never ask where you are.
check('booting asks for no position at all', geo6.watch === 0, `${geo6.watch} call(s)`);
check('and starts with no watch running', ev6('geo').watchId === null);
check('the location layer exists and is separate from the marker layer',
      ev6('locationLayer') != null && ev6('locationLayer') !== ev6('markerLayer'));

const locateClick = s6.handlers['locate:click'];
check('the button is wired', typeof locateClick === 'function');
locateClick();
check('pressing it starts a watch', geo6.watch === 1, `${geo6.watch} call(s)`);
check('asking for the best available fix', geo6.options?.enableHighAccuracy === true);
check('with a timeout, so it cannot hang forever', typeof geo6.options?.timeout === 'number', `${geo6.options?.timeout} ms`);
check('the button reads as pressed', s6.registry.get('locate').textContent === 'Stop locating');
check('and says it is waiting', s6.registry.get('locate-status').textContent.includes('Waiting'));

// Deliver a fix.
geo6.cb.ok({ coords: { latitude: 54.4542, longitude: -3.2119, accuracy: 12 } });
const locLayer = ev6('locationLayer');
check('a fix draws a dot and an accuracy ring', locLayer._children.length === 2, `${locLayer._children.length} layer(s)`);
check('the ring is a circle sized to the accuracy',
      locLayer._children.some(c => c._kind === 'circle'), locLayer._children.map(c=>c._kind).join('+'));
check('the accuracy is reported in metres', s6.registry.get('locate-status').textContent.includes('±12 m'),
      s6.registry.get('locate-status').textContent);

// The regression this design exists to prevent: ticking a peak re-renders the map, and
// markerLayer.clearLayers() must not take the position dot with it.
ev6('renderMap()');
check('a map re-render leaves your position alone', ev6('locationLayer')._children.length === 2,
      `${ev6('locationLayer')._children.length} layer(s) after renderMap`);

// A second fix should move the existing dot, not stack another one on top.
geo6.cb.ok({ coords: { latitude: 54.4550, longitude: -3.2100, accuracy: 8 } });
check('a later fix moves the dot rather than adding one', ev6('locationLayer')._children.length === 2,
      `${ev6('locationLayer')._children.length} layer(s)`);
check('and resizes the ring', ev6('geo').ring._radius === 8, `${ev6('geo').ring._radius} m`);
check('the readout follows', s6.registry.get('locate-status').textContent.includes('±8 m'));

// Pressing again stops and tidies up.
locateClick();
check('pressing again clears the watch', geo6.clear === 1 && geo6.clearedId === 42);
check('the dot is removed', ev6('locationLayer')._children.length === 0);
check('the button resets', s6.registry.get('locate').textContent === 'Locate me');
check('and so does the status line', s6.registry.get('locate-status').textContent === '');

// Errors must be legible, and must not leave the button stuck on.
for (const [code, expect] of [[1, 'permission'], [2, 'No position'], [3, 'Timed out']]) {
  locateClick();
  geo6.cb.err({ code });
  const msg = s6.registry.get('locate-status').textContent;
  check(`error ${code} explains itself`, msg.toLowerCase().includes(expect.toLowerCase()), msg.slice(0, 58));
  check(`error ${code} resets the button`, ev6('geo').watchId === null &&
        s6.registry.get('locate').textContent === 'Locate me');
}

// No geolocation at all: the button must be disabled with a reason, not silently dead.
const s7 = makeCtx(new Map());
s7.ctx.navigator = { clipboard: { writeText: async () => {} } };
await new Promise(r=>setTimeout(r,400));
check('without geolocation support the reason is stated',
      /no location support/i.test(s7.evalIn('locateUnavailableReason()') ?? ''),
      s7.evalIn('locateUnavailableReason()'));
s7.ctx.isSecureContext = false;
s7.ctx.navigator.geolocation = { watchPosition(){ return 1 }, clearWatch(){} };
check('over plain http it says https is needed',
      /https/i.test(s7.evalIn('locateUnavailableReason()') ?? ''),
      s7.evalIn('locateUnavailableReason()'));
check('and pressing the button then does nothing but explain',
      (() => { s7.evalIn('startLocate()'); return s7.evalIn('geo').watchId === null; })());

console.log(`\n${fails === 0 ? 'ALL FEATURE CHECKS PASSED' : fails + ' FAILED'}`);
process.exit(fails ? 1 : 0);
