import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import pet from '../assets/stage/whale-maid/pet.json' with {type:'json'};
import role from '../assets/stage/whale-maid/chess-role.json' with {type:'json'};
import integrity from '../assets/stage/whale-maid/integrity.json' with {type:'json'};
import {parsePetManifest} from '../vendor/dsh-pet-manifest/validator.js';
import {frameAt,frameDuration,frameUrl,motionTrack,palmAt} from '../stage/frames.js';
import {previewFixture,emptyPreview} from '../stage/preview-data.js';
import {createStagePreview,stageZh,stageEn,stageCss} from '../stage/ui.js';
import {registerStageAssets,STAGE_ASSET_BASE} from '../host/stage-assets-v4.js';
import {apply} from '../entry-v4.js';
const json=v=>JSON.parse(JSON.stringify(v));
const routes=(reader)=>{const out=[];registerStageAssets({connection:{fetch:{register:r=>out.push(r)}}},reader);return out;};

test('pack passes the actual audited v0.4.14 manifest parser without warnings',()=>{
  const result=parsePetManifest(pet,'owned whale-maid pet.json');assert.equal(result.ok,true,JSON.stringify(result.diagnostics));assert.deepEqual(result.diagnostics,[]);assert.equal(result.manifest.renderer,'frames2d');
});
test('audited parser rejects explicit dot directory and unknown phase verbs',()=>{
  const dot=json(pet);dot.frames2d.dir='.';assert.equal(parsePetManifest(dot,'dot').ok,false);
  const invalid=json(pet);invalid.frames2d.phases.punch='idle';assert.equal(parsePetManifest(invalid,'fake phase').ok,false);
  const custom=json(pet);custom.frames2d.tracks['take-stone']={frames:['000.png']};assert.equal(parsePetManifest(custom,'arbitrary metadata track').ok,true);
});
test('all 168 shipped frames match recorded hashes and 384px RGBA PNG headers',async()=>{
  assert.equal(integrity.frameCount,168);assert.equal(integrity.files.length,168);
  for(const file of integrity.files){
    assert.match(file.path,/^frames\/[a-z-]+\/\d{3}\.png$/);const bytes=await readFile(new URL(`../assets/stage/whale-maid/${file.path}`,import.meta.url));
    assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),384);assert.equal(bytes.readUInt32BE(20),384);assert.equal(bytes[25],6,'RGBA alpha retained');
  }
});
test('all declared expression tracks loop, map to valid roles and retain estimated palms',()=>{
  assert.equal(Object.keys(pet.frames2d.tracks).length,7);assert.deepEqual(role.dedicatedTracks,[]);assert.equal(role.mode,'mechanism-preview');assert.equal(role.missingActions.length,7);
  for(const [track,spec] of Object.entries(pet.frames2d.tracks)){
    assert.equal(spec.frames.length,24);
    for(let i=0;i<24;i++){const f=frameAt(pet,track,i*100);assert.equal(f.index,i);assert.equal(f.duration,100);assert.ok(new URL(frameUrl(pet,f),'http://localhost').pathname.endsWith(`/${track}/${spec.frames[i]}`));const p=palmAt(role,f),m=palmAt(role,f,'left');assert.ok(p.x>0&&p.x<1&&p.y>0&&p.y<1);assert.equal(m.x,1-p.x);assert.equal(m.y,p.y);}
    assert.equal(frameAt(pet,track,2400).index,0);
  }
  for(const phase of Object.keys(role.motions))assert.ok(pet.frames2d.tracks[motionTrack(role,pet,phase)]);
});
test('frame timing follows explicit > filename valid-ms tail > default',()=>{
  const p=json(pet);p.frames2d.defaultFrameMs=200;delete p.frames2d.tracks.idle.frameMs;p.frames2d.tracks.idle.frames=['first_37.png','second_000_45.png','bad_0.png','large_5001.png','plain.png'];
  assert.deepEqual(p.frames2d.tracks.idle.frames.map((_,i)=>frameDuration(p,'idle',i)),[37,45,200,200,200]);p.frames2d.tracks.idle.frameMs=[20,21,22,23,24];assert.equal(frameDuration(p,'idle',0),20);
});
test('nonloop tracks fall back and malformed fallback cycles cannot recurse forever',()=>{
  const p=json(pet);p.frames2d.tracks.thinking={frames:['000.png'],frameMs:[100],loop:false,fallback:'idle'};assert.equal(frameAt(p,'thinking',130).track,'idle');assert.equal(frameAt(p,'unknown',0).track,'idle');
  p.frames2d.tracks.idle={frames:['000.png'],frameMs:[100],loop:false,fallback:'idle'};assert.equal(frameAt(p,'idle',100000).name,'000.png');
});
test('frame URLs remain declared-path only and runtime identity is encoded',()=>{
  const f=frameAt(pet,'idle');assert.ok(frameUrl(pet,f,'x&y').endsWith('?r=x%26y'));assert.throws(()=>frameUrl(pet,{...f,name:'../../secret.png'}));assert.throws(()=>frameUrl(pet,{...f,track:'missing'}));
});
test('preview fixtures are detached and do not manufacture a production event',()=>{
  const a=emptyPreview('a'),b=emptyPreview('b');a.board[0][0]=1;assert.equal(b.board[0][0],0);
  const move=previewFixture('move','a',1,'event1');assert.equal(move.game.moves.length,2);assert.equal(move.event.preview,true);assert.equal(move.event.confirmed,true);assert.equal(move.game.moves.at(-1).moveId,move.event.moveId);
  const win=previewFixture('defeat','a',2,'event2');assert.equal(win.game.moves.length,9);assert.equal(win.game.winner,1);assert.equal(win.game.winningLine.length,5);for(const point of win.game.winningLine)assert.equal(win.game.board[point.row][point.col],1);
});
test('all proactive dialogue translations are at most60 Unicode characters',()=>{
  for(const dictionary of [stageZh,stageEn])for(const key of ['stageThought','stagePickup','stageSmug','stagePout','stageInvite'])assert.ok([...dictionary[key]].length<=60,`${key}: ${dictionary[key].length}`);
  assert.ok(stageZh.stageMissing.includes('不是专用动作帧'));assert.ok(stageZh.stageMissingDetail.includes('仍缺'));
});
test('stage fixed routes are buffered authenticated Connection registrations',()=>{
  const list=routes();assert.equal(list.length,172);assert.equal(new Set(list.map(r=>r.path)).size,172);
  for(const r of list){assert.deepEqual(r.methods,['GET']);assert.equal(r.requestBody,'buffered');assert.ok(r.path.startsWith(STAGE_ASSET_BASE+'/'));assert.ok(!r.path.includes('*')&&!r.path.includes(':'));assert.equal(new Request(`http://localhost${r.path}`).body,null);}
});
test('stage frame bytes preserve MIME, private cache and nosniff',async()=>{
  const r=routes().find(r=>r.path.endsWith('/idle/000.png'));const response=await r.fetch();assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.ok(response.headers.get('cache-control').startsWith('private,'));assert.equal(Buffer.from(await response.arrayBuffer()).readUInt32BE(16),384);
});
test('missing stage file fails closed without private path details',async()=>{
  const response=await routes(async()=>{throw new Error('secret host path');})[0].fetch();assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:false,code:'stage-asset-unavailable'});
});
test('stage metadata/notices are served by the same fixed route map',async()=>{
  for(const name of ['pet.json','chess-role.json','integrity.json','THIRD_PARTY_NOTICES.md']){const r=routes().find(r=>r.path.endsWith('/'+name));const response=await r.fetch();assert.equal(response.status,200);assert.ok((await response.text()).length>100);}
});
test('fresh Host entry adds only stage assets and retains the original buffered action tool',async()=>{
  const list=[],effects=[];let tool;
  apply({connection:{fetch:{register:r=>list.push(r)}},tools:{register:t=>{tool=t;}},logger:{warn(){}},effect:f=>effects.push(f())});
  assert.equal(list.length,187);const action=list.find(r=>r.path==='/api/dsh-chess-room');assert.deepEqual(action.methods,['POST']);assert.equal(action.requestBody,'buffered');assert.equal(tool.name,'chess_room');assert.equal(tool.parameters.properties.text.maxLength,400);assert.equal(tool.parameters.additionalProperties,false);
  for(const dispose of effects.reverse())await dispose();
});
test('generated Client is a native factory with isolated stage markers and clean owned slots',async()=>{
  const code=await readFile(new URL('../client-v4.js',import.meta.url),'utf8');let loaded;
  vm.runInNewContext(code,{window:{__ModuleLoader__:{load:x=>loaded=x}},console});assert.equal(loaded.id,'@local/dsh-chess-room');
  const plugin=loaded.factory(name=>{assert.equal(name,'react');return {createElement(){}};});assert.equal(plugin.viewModel.stageRelease,'1.1.0-preview.1');assert.equal(plugin.viewModel.stageMode,'isolated-mechanism-preview');assert.equal(plugin.viewModel.coordinate({row:14,col:0}),'A15');
  const effects=[],entries=[],disposed=[],dicts=[];plugin.apply({locale:{getLocale:()=>({active:'zh',locales:[],revision:1}),bind:()=>key=>stageZh[key]??key,register:(...args)=>{dicts.push(args);return()=>{};}},slots:{inject:(_name,f)=>effects.push(f()),register:(...args)=>{entries.push(args);return()=>disposed.push(args[0]);}},effect:f=>effects.push(f())});
  assert.equal(dicts.length,2);assert.ok(dicts.every(args=>args[2].motionPreview));assert.deepEqual(entries.map(args=>args[0].name),['main','sidebar.panellist']);assert.equal(entries[0][1].name,'ChessRoomPreviewV4');for(const dispose of effects.reverse())await dispose();assert.equal(disposed.length,2);
});
// Pure React-element shape checks; no DOM emulation, effects or browser pixel claims.
function shape(game,model){let index=0;const states=[game,model,false,false,false,false,false,false,'','',[]];const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useRef:initial=>({current:initial}),useState:initial=>{const i=index++;return [states[i]??(typeof initial==='function'?initial():initial),()=>{}];},useEffect(){}};return createStagePreview(React)({t:key=>stageZh[key]??key,profile:{name:'demo'},runtimeId:'demo',Avatar(){},roomRef:{current:null}});}
function all(tree,predicate){if(!tree||typeof tree!=='object')return [];return [...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(child=>Array.isArray(child)?child.flatMap(c=>all(c,predicate)):all(child,predicate))];}
test('preview paints native pieces and stars on a strictly read-only225cell board',()=>{
  const fixture=previewFixture('move','shape',1,'shape1'),tree=shape(fixture.game,null),cells=all(tree,e=>e.props.className?.startsWith('dcr-cell'));
  assert.equal(cells.length,225);assert.equal(cells[0].props.title,'A15');assert.equal(cells.at(-1).props.title,'O1');assert.ok(cells.every(e=>e.type==='button'&&e.props.disabled===true&&!e.props.onClick));
  assert.equal(all(tree,e=>e.props.className==='dcr-piece').length,1);assert.equal(all(tree,e=>e.props.className==='dcr-piece white').length,1);assert.equal(all(tree,e=>e.props.className==='dcr-star').length,9);assert.ok(cells.every(e=>!e.props.className.includes('dcr-star')));
});
test('only matching pending moveId is visually held; release reveals the native white piece',()=>{
  const fixture=previewFixture('move','shape',1,'shape1');const model={phase:'thinking',x:0,y:0,width:96,height:96,hand:{x:0,y:0},hiddenMoveId:fixture.event.moveId};
  assert.equal(all(shape(fixture.game,model),e=>e.props.className==='dcr-piece white').length,0);assert.equal(all(shape(fixture.game,{...model,hiddenMoveId:null}),e=>e.props.className==='dcr-piece white').length,1);
});
test('defeat fixture paints exactly five winning intersections and nine stones',()=>{
  const fixture=previewFixture('defeat','shape',2,'shape2'),tree=shape(fixture.game,null);assert.equal(all(tree,e=>e.props.className?.startsWith('dcr-cell')&&e.props.className.includes(' winning')).length,5);assert.equal(all(tree,e=>e.props.className?.startsWith('dcr-piece')).length,9);
});
test('scoped styling measures the40px avatar chain and shares artwork/hand stomp transform',()=>{
  assert.ok(stageCss.includes('.dcr-motion-avatar-anchor .dcr-avatar{display:block;width:100%;height:100%}'));assert.ok(stageCss.includes('.dcr-motion-avatar-inner{position:relative;width:100%;height:100%'));assert.ok(stageCss.includes('.dcr-motion-actor.phase-stomp .dcr-motion-art'));assert.ok(stageCss.includes('.dcr-motion-layer,.dcr-motion-layer *{pointer-events:none}'));
});
test('preview modules cannot call production RPC or global pet choreography',async()=>{
  for(const name of ['ui.js','preview-data.js','motion-director.js','geometry.js','frames.js']){const code=await readFile(new URL('../stage/'+name,import.meta.url),'utf8');assert.doesNotMatch(code,/fetch\s*\(|\brpc\s*\(|\bact\s*\(|pet\.(?:moveTo|placeStone|punchAvatar)|document\.(?:body|querySelector)/,name);}
});
