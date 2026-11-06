import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const file=p=>readFile(new URL(p,import.meta.url),'utf8');
const [source,editable,bootstrap,entry,manifest,baseline]=await Promise.all([
  file('../../dsh-chess-room-live-client/client.js'),file('../../dsh-chess-room-live-client/fresh-client-source.js'),
  file('../../dsh-chess-room-live-client/fresh-client-bootstrap.js'),file('../../dsh-chess-room-live-client/index.js'),
  // Certify the frozen published 1.2.0 generation, independent of later context-selector metadata.
  file('./fixtures/client-1.2.0-package.json'),file('../client-live-src.js')]);
const pkg=JSON.parse(manifest);
function factory(){let registered;vm.runInNewContext(source,{window:{__ModuleLoader__:{load(def){assert.equal(registered,undefined);registered=def;}}}},{timeout:2000});
  const exported=registered.factory(name=>{assert.equal(name,'react');return{createElement(){throw Error('Never render substitute React/DOM for Client verification');}};});
  return{registered,exported};}
function context(){const dictionaries=new Map(),entries=[],disposers=[],navigation=[];let active='zh';
  const ctx={get:name=>name==='layout'?{selectPanel:id=>navigation.push(id)}:undefined,
    effect:fn=>{const dispose=fn();disposers.push(dispose);return dispose;},
    locale:{register:(ns,lang,dict)=>{const k=ns+':'+lang;assert(!dictionaries.has(k));dictionaries.set(k,dict);return()=>dictionaries.delete(k);},
      bind:ns=>key=>dictionaries.get(ns+':'+active)?.[key]??key},
    slots:{inject:(_name,fn)=>{const dispose=fn();disposers.push(dispose);return dispose;},register:(options,component)=>{const item={options,component};entries.push(item);return()=>entries.splice(entries.indexOf(item),1);}}};
  return{ctx,dictionaries,entries,navigation,locale:lang=>{active=lang;},dispose:()=>{for(const fn of disposers.splice(0).reverse())fn?.();}};}
test('lazy Client id stays exact while authorized action generation advances',()=>{const f=factory();assert.equal(f.registered.id,pkg.name);assert.equal(pkg.name,'@local/dsh-chess-room-live-client');assert.equal(pkg.version,'1.2.0');assert(bootstrap.includes(pkg.name));});
test('new Client declares original package ordering but imports only native React',()=>{assert(pkg.dsh.client.inject.includes('@local/dsh-chess-room'));assert.equal(pkg.dependencies,undefined);factory();assert(!source.includes("require('@deepseek-ai/"));});
test('side-effect-free factory exports dedicated action generation',()=>{const f=factory();assert.equal(f.exported.viewModel.clientGeneration,'1.2.0');assert.equal(f.exported.viewModel.stageRelease,'1.2.0');assert.equal(f.exported.viewModel.stageMode,'confirmed-live-ai-actions');assert.deepEqual([...f.exported.inject],['slots','locale']);});
test('factory apply registers original navigation id, not a substitute rendered mount',()=>{const c=context(),f=factory();f.exported.apply(c.ctx);const main=c.entries.find(e=>e.options.name==='main'),icon=c.entries.find(e=>e.options.name==='sidebar.panellist');assert.equal(main.options.key,'dsh-chess-room');assert.equal(main.options.priority,-1201);assert.equal(main.component.name,'ChessRoomWhaleMaidLive120');assert.equal(icon.options.id,'dsh-chess-room');assert.equal(icon.options.priority,-1201);assert(!c.entries.some(e=>e.options.priority===-1202),'mount proof must NOT come from mere apply');assert.equal(c.navigation.length,0);c.dispose();assert.equal(c.entries.length,0);});
test('fresh dictionaries keep bilingual labels and visible generation',()=>{const c=context();factory().exported.apply(c.ctx);assert.equal(c.dictionaries.size,2);assert([...c.dictionaries.keys()].every(k=>k.startsWith('dsh-chess-room-live-client-v1:')));const sidebar=c.entries.find(e=>e.options.name==='sidebar.panellist');assert.equal(sidebar.options.label(),'DSH 棋室');c.locale('en');assert.equal(sidebar.options.label(),'DSH Chess Room');for(const dict of c.dictionaries.values())assert(dict.clientReady.includes('1.2.0'));c.dispose();assert.equal(c.dictionaries.size,0);});
test('distinct -1202 marker lives ONLY in actual Main React mount effect',()=>{assert.match(editable,/function ChessRoomWhaleMaidLive120\(\) \{\s*React\.useEffect\(\(\)=>ctx\.slots\.inject\('sidebar\.panellist',\(\)=>ctx\.slots\.register\(\{name:'sidebar\.panellist',id:'dsh-chess-room',order:45,priority:-1202,[^\n]+Icon\)\),\[\]\);/);assert.equal((editable.match(/priority:-1202/g)??[]).length,1);});
test('action upgrade removes repair-only auto-navigation and never refreshes or synthesizes clicks',()=>{assert(!editable.includes('.selectPanel('));assert(!editable.includes('location.reload'));assert(!editable.includes('.click('));const c=context();factory().exported.apply(c.ctx);assert.deepEqual(c.navigation,[]);c.dispose();});
test('rendering-only upgrade preserves Host, avatars, confirmed fences and busy gates',()=>{assert.match(entry,/export function apply\(\) \{\}/);assert(!entry.includes('storage'));assert(editable.includes("new URL('/api/dsh-chess-room',window.location.href)"));assert(editable.includes('interactionBusy:busy'));assert(editable.includes('confirmedMoveMask(state,stageVisual?.model)'));assert(editable.includes("referrerPolicy:'no-referrer'"));assert(baseline.includes('function ChessRoomLiveV5()'));assert(!baseline.includes('priority:-1202'));assert(editable.includes("'data-dcr-client-ready':'1.2.0'"));});
