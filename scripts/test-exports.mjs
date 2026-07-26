// Prove what a GPX export actually depends on, and what it does not.
//
// The map is a view, not an input: exports are built from the selection, the
// direction and the peak mode. This asserts that panning or zooming leaves the
// output byte-identical, and that the export code never queries the map's centre,
// zoom or bounds — so nothing is ever clipped to what happens to be on screen.
//
// Usage: node scripts/test-exports.mjs
import fs from 'node:fs';
import vm from 'node:vm';

function boot() {
  function el(id){return{id,_html:'',_text:'',value:'',hidden:false,
    classList:{toggle(){},add(){},remove(){},contains(){return false}},dataset:{},style:{},children:{length:0},
    set innerHTML(v){this._html=String(v)},get innerHTML(){return this._html},
    set textContent(v){this._text=String(v)},get textContent(){return this._text},
    setAttribute(){},getAttribute(){return null},addEventListener(){},tagName:'DIV',
    querySelectorAll(){return[]},querySelector(){return null},closest(){return null},
    remove(){},appendChild(){},click(){},select(){},focus(){},blur(){},scrollIntoView(){},hidden:false,
    getBoundingClientRect(){return{height:500,width:900}}};}
  const reg=new Map();
  const document={title:'',addEventListener(){},
    getElementById(id){if(!reg.has(id))reg.set(id,el(id));return reg.get(id)},
    querySelectorAll(){return[]},createElement(){return el('c')},
    body:{appendChild(){},removeChild(){}}};
  // Track what the map is asked to do, and let the test move the view.
  const mapCalls=[];
  const layer=()=>({addTo(){return this},remove(){},clearLayers(){},on(){},
    bindPopup(){return this},openPopup(){},getBounds(){mapCalls.push('getBounds');return{isValid:()=>true,pad(){return this}}}});
  const mapObj={__isMap:true,
    setView(){mapCalls.push('setView');return this},
    fitBounds(){mapCalls.push('fitBounds');return this},
    panTo(){mapCalls.push('panTo')},setZoom(){mapCalls.push('setZoom')},
    getCenter(){mapCalls.push('getCenter');return{lat:0,lng:0}},
    getZoom(){mapCalls.push('getZoom');return 10},
    remove(){},on(){},invalidateSize(){},addLayer(){},removeLayer(){}};
  const L={map(){return mapObj},tileLayer(){return layer()},polyline(){return layer()},
    layerGroup(){return layer()},marker(){return layer()},divIcon(){return{}},latLngBounds(b){return b}};
  const data=JSON.parse(fs.readFileSync('site/route-data.json','utf8'));
  const store=new Map();
  const downloads=[];
  const ctx={document,L,console,
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    Blob:class{constructor(parts){this.parts=parts}},
    URL:{createObjectURL(b){downloads.push(b.parts.join(''));return 'blob:'},revokeObjectURL(){}},
    setTimeout,clearTimeout,Math,Date,JSON,Number,String,Array,Object,Set,Map,isNaN,Infinity,
    fetch:async()=>({ok:true,status:200,json:async()=>data})};
  ctx.location={origin:'http://route-planner.test',pathname:'/site/index.html',hash:''};
  ctx.history={replaceState(_a,_b,h){ctx.location.hash=String(h||'')}};
  ctx.navigator={clipboard:{writeText:async()=>{}}};
  ctx.APP_CONFIG={osMapsKey:'test-key-not-real'};
  ctx.globalThis=ctx; ctx.window=ctx;
  vm.createContext(ctx);
  for(const f of ['site/share.js','site/resolve.js','site/app.js'])
    new vm.Script(fs.readFileSync(f,'utf8'),{filename:f}).runInContext(ctx);
  return {ctx, evalIn:(c)=>new vm.Script(c).runInContext(ctx), mapCalls, downloads, mapObj};
}

let fails=0;
const check=(n,ok,d='')=>{if(!ok)fails++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?`  — ${d}`:''}`)};
const trkpts=(x)=>(x.match(/<trkpt/g)||[]).length;
const wpts=(x)=>(x.match(/<wpt/g)||[]).length;

const s=boot();
await new Promise(r=>setTimeout(r,400));

const g1=s.evalIn('fullGpx()');
check('export produces a GPX', g1.startsWith('<?xml') && g1.includes('</gpx>'));
check('track has points', trkpts(g1) > 1000, `${trkpts(g1)} trkpts`);
check('waypoints included', wpts(g1) > 10, `${wpts(g1)} wpts`);
check('elevation included', (g1.match(/<ele>/g)||[]).length > 1000);

// Move the map around, then export again
s.mapCalls.length = 0;
s.mapObj.panTo(); s.mapObj.setZoom(); 
const g2 = s.evalIn('fullGpx()');
check('panning/zooming does not change the export', g1 === g2, `${trkpts(g1)} vs ${trkpts(g2)} trkpts`);
check('export never queries map centre or zoom',
  !s.mapCalls.filter(c=>c==='getCenter'||c==='getZoom'||c==='getBounds').length,
  s.mapCalls.length ? `map calls seen: ${[...new Set(s.mapCalls)].join(',')}` : 'no viewport queries');

// Selection DOES change it
const st=s.evalIn('state');
const before=trkpts(g1);
st.selected.clear();
const g3=s.evalIn('fullGpx()');
check('clearing the selection shrinks the export', trkpts(g3) < before, `${before} -> ${trkpts(g3)} trkpts`);
check('base-only export still covers the whole loop', trkpts(g3) > 1000, `${trkpts(g3)} trkpts`);

// Direction changes it
s.evalIn("state.selected = new Set(state.data.recommended.cw.ids); state.direction='cw';");
const cw=s.evalIn('fullGpx()');
s.evalIn("state.direction='acw'; state.selected = new Set(state.data.recommended.acw.ids);");
const acw=s.evalIn('fullGpx()');
check('direction changes the export', cw !== acw, 'cw and acw differ');
check('both directions cover the full loop',
  Math.abs(trkpts(cw)-trkpts(acw)) < trkpts(cw)*0.25, `${trkpts(cw)} vs ${trkpts(acw)} trkpts`);

// A single day export is a subset
s.evalIn("state.direction='cw'; state.selected = new Set(state.data.recommended.cw.ids);");
const d7=s.evalIn('dayGpx(currentDays().find(d=>d.day===7))');
check('a day export is much smaller than the whole route', trkpts(d7) < trkpts(cw)/5,
  `day 7 ${trkpts(d7)} vs full ${trkpts(cw)} trkpts`);
check('day export names the day', /day 7/i.test(d7));

console.log(`\n${fails===0?'ALL EXPORT CHECKS PASSED':fails+' FAILED'}`);
process.exit(fails?1:0);
