import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {confirmedMoveMask} from '../stage/live-events.js';
import {LiveStageController} from '../stage/live-controller.js';
import {measureGeometry} from '../stage/geometry.js';
import {measureLiveGeometry,safeLiveActorRest} from '../stage/live-ui.js';
import {AI_ACTION_PROFILE} from '../stage/ai-actions.js';
import {requestsQuiet} from '../host/dialogue.js';

// Native factory execution, source contracts and pure controller tests only.
// These checks do not emulate React/DOM and do not establish browser/pixel correctness.
const source=await readFile(new URL('../client-v5.js',import.meta.url),'utf8');
const liveSource=await readFile(new URL('../stage/live-ui.js',import.meta.url),'utf8');
const controllerSource=await readFile(new URL('../stage/live-controller.js',import.meta.url),'utf8');
const buildSource=await readFile(new URL('../scripts/build-live-client.mjs',import.meta.url),'utf8');
const editableSource=await readFile(new URL('../client-live-src.js',import.meta.url),'utf8');
const bootstrap=await readFile(new URL('../client-live-bootstrap.js',import.meta.url),'utf8');

function nativeFactory(){
  let registration,active='zh';const dictionaries=new Map(),occupants=[],disposers=[];
  const sandbox={window:{__ModuleLoader__:{load(value){assert.equal(registration,undefined);registration=value;}}}};
  vm.runInNewContext(source,sandbox,{filename:'client-v5.js'});
  const exported=registration.factory(id=>{assert.equal(id,'react');return {createElement(){throw new Error('Factory tests must not render React');}};});
  const ctx={effect(callback){const cleanup=callback();disposers.push(cleanup);return cleanup;},
    locale:{getLocale:()=>({active,locales:[],revision:1}),
      register(ns,language,dictionary){const key=`${ns}:${language}`;assert.equal(dictionaries.has(key),false);dictionaries.set(key,dictionary);return()=>dictionaries.delete(key);},
      bind:ns=>key=>(dictionaries.get(`${ns}:${active}`)??dictionaries.get(`${ns}:en`))?.[key]??key},
    slots:{inject(_name,callback){const cleanup=callback();disposers.push(cleanup);return cleanup;},
      register(options,component){const item={options,component};occupants.push(item);return()=>{const index=occupants.indexOf(item);if(index>=0)occupants.splice(index,1);};}}};
  return {registration,exported,ctx,dictionaries,occupants,locale:id=>{active=id;},
    dispose(){for(const cleanup of disposers.splice(0).reverse())cleanup?.();}};
}
const copy=value=>structuredClone(value);
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;}
function snapshot(version=0,moves=[],events=[],extra={}){
  const board=Array.from({length:15},()=>Array(15).fill(0));for(const move of moves)board[move.row][move.col]=move.color;
  return {runtimeId:'runtime1',revision:version,aiThinking:false,settings:{comments:true},
    game:{id:'game1',version,moves,board,status:'playing',winner:null,playerColor:1,turn:1,chat:[],winningLine:[]},
    stage:{format:1,gameId:'game1',version,epoch:'epoch1',replayThroughVersion:0,events},...extra};
}
const move=(id='move1',row=7,col=8)=>({moveId:id,row,col,color:2,source:'model'});
const event=(item=move(),version=1)=>({kind:'move-committed',confirmed:true,gameId:'game1',version,eventId:`event${version}`,
  moveId:item.moveId,row:item.row,col:item.col,color:item.color});
const actor=(item=event())=>({gameId:item.gameId,version:item.version,eventId:item.eventId,hiddenMoveId:item.moveId,phase:'carrying'});
function clock(){
  let now=0,ticket=0;const frames=new Map(),timers=new Map();
  return {now:()=>now,request:callback=>{frames.set(++ticket,callback);return ticket;},cancel:id=>frames.delete(id),
    timeout:(callback,ms)=>{timers.set(++ticket,{callback,at:now+ms});return ticket;},clearTimeout:id=>timers.delete(id),frames,timers,
    step(ms=16){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}
      const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);}};
}
function pureController(t){
  const time=clock(),models=[];
  const controller=new LiveStageController({clock:time,emit:model=>models.push(model),measure:()=>measureGeometry({
    rootRect:{left:0,top:0,width:800,height:650},rootSize:{width:800,height:650},
    boardRect:{left:180,top:70,width:450,height:450},avatarRect:{left:80,top:480,width:52,height:52}})});
  t.after(()=>controller.dispose());return {controller,time,models};
}
const visuals=actions=>actions.filter(action=>action.type==='move'||action.type==='defeat');

// Real native ModuleLoader factory semantics, without rendering a substitute UI.
test('generated ModuleLoader factory registers only its package and has no registration/DOM side effects before apply',()=>{
  const f=nativeFactory();assert.equal(f.registration.id,'@local/dsh-chess-room');
  assert.deepEqual([...f.exported.inject],['slots','locale']);assert.equal(f.occupants.length,0);assert.equal(f.dictionaries.size,0);
  assert.equal(f.exported.viewModel.stageRelease,'1.1.0');assert.equal(f.exported.viewModel.stageMode,'confirmed-live-mechanism');
});
test('native factory applies object LocaleSnapshot, owned ChessRoomLiveV5 main and localized sidebar slots',()=>{
  const f=nativeFactory();f.exported.apply(f.ctx);
  const main=f.occupants.find(item=>item.options.name==='main'),sidebar=f.occupants.find(item=>item.options.name==='sidebar.panellist');
  assert.equal(main.options.key,'dsh-chess-room');assert.equal(main.component.name,'ChessRoomLiveV5');
  assert.equal(sidebar.options.id,'dsh-chess-room');assert.equal(sidebar.options.label(),'DSH 棋室');
  f.locale('en');assert.equal(sidebar.options.label(),'DSH Chess Room');f.dispose();
});
test('native owned slots/dictionaries clean up and reapply without duplicate registration',()=>{
  const f=nativeFactory();for(let pass=0;pass<2;pass++){
    f.exported.apply(f.ctx);assert.equal(f.occupants.length,2);assert.equal(f.dictionaries.size,2);
    f.dispose();assert.equal(f.occupants.length,0);assert.equal(f.dictionaries.size,0);
  }
});
test('both native dictionaries cover live/preview controls and truthfully disclose mechanism—not dedicated poses',()=>{
  const f=nativeFactory();f.exported.apply(f.ctx);
  for(const dictionary of f.dictionaries.values())for(const key of ['liveStageTitle','liveStageMechanism','liveStageReduce',
    'liveStageDrag','liveStageRoam','liveStageMuted','liveStageReplay','motionPreview','stageMissing','stageMissingDetail','stageSkip','stageRestore'])
    assert.equal(typeof dictionary[key],'string',key);
  const en=f.dictionaries.get('dsh-chess-room-v1:en');assert.match(en.liveStageMechanism,/not dedicated poses/);
  assert.match(en.stageMissingDetail,/Dedicated walk.*still missing/);assert.match(en.stageIsolated,/No move, result or account writes/);f.dispose();
});

// Static source contracts: wiring verification, not assertions about mounted pixels.
test('live and isolated preview source paths use owned native room refs and disable live during records/replay',()=>{
  assert.match(editableSource,/const liveStageEnabled=tab==='room'&&!viewing/);
  assert.match(editableSource,/\['room','records','motionPreview'\]\.map/);
  assert.match(editableSource,/tab==='motionPreview'\?h\(CharacterStagePreview,\{t,profile,runtimeId:state\?\.runtimeId\?\?'',Avatar,roomRef:roomRootRef\}\):tab==='records'\?renderRecords\(\)/);
  assert.match(editableSource,/h\(CharacterStageLive,\{snapshot:state,enabled:liveStageEnabled,online:connected,quiet:stageLocalQuiet\|\|!comments/);
  assert.match(editableSource,/tab==='motionPreview'\?null:renderFooter\(\)/);
  assert.match(editableSource,/tab==='motionPreview'\?null:h\('div',\{className:'dcr-mode-controls'\}/);
});
test('exact-ID mask source changes only piece visibility, keeping authoritative occupied disabled cell and ARIA',()=>{
  assert.match(editableSource,/const board=viewing\?viewModel\.replayBoard\(moves,step\):g\?\.board/);
  assert.match(editableSource,/const maskedMove=liveStageEnabled&&connected\?confirmedMoveMask\(state,stageVisual\?\.model\):null/);
  assert.match(editableSource,/disabled:!canMove\|\|!!cell,'aria-label':/);
  assert.match(editableSource,/t\(cell===1\?'black':'white'\)/);
  assert.match(editableSource,/style:\{visibility:maskedMove\?\.row===row&&maskedMove\?\.col===col\?'hidden':undefined\}/);
  assert.match(editableSource,/'data-dcr-move-id':visibleMoves\.find\(m=>m\.row===row&&m\.col===col\)\?\.moveId,'aria-hidden':true/);
});
test('source attaches stage refs only to native room, board, player avatar wrapper and player card',()=>{
  assert.match(editableSource,/className:'dcr',ref:roomRootRef/);
  assert.match(editableSource,/className:'dcr-board',ref:boardRef/);
  assert.match(editableSource,/h\('section',\{className:'dcr-card',ref:playerCardRef\}/);
  assert.match(editableSource,/className:'dcr-live-avatar',ref:playerAvatarRef/);
  assert.match(editableSource,/rootRef:roomRootRef,boardRef,avatarRef:playerAvatarRef,cardRef:playerCardRef,apiRef:stageApiRef/);
  assert.equal((editableSource.match(/ref:playerAvatarRef/g)??[]).length,1);
  assert.match(liveSource,/new Set\(\[rootRef\.current,boardRef\.current,avatarRef\.current,cardRef\.current\]\.filter\(Boolean\)\)/);
  assert.match(liveSource,/observer\?\.unobserve\(element\)/);assert.match(liveSource,/observer\?\.observe\(element\)/);
});
test('existing requestsQuiet helper is imported and intercepted before the existing RPC; stage skip exposes no RPC',()=>{
  assert.match(editableSource,/import \{requestsQuiet\} from '\.\/host\/dialogue\.js'/);
  const action=editableSource.slice(editableSource.indexOf('async function act('),editableSource.indexOf('const g=state?.game'));
  assert.match(action,/operation==='chat'&&requestsQuiet\(extra\.text\)/);
  assert.ok(action.indexOf('stageApiRef.current?.setQuiet(true)')<action.indexOf('await rpc(operation,'));
  assert.match(action,/operation==='settings'&&extra\.comments===false/);
  assert.match(editableSource,/comments&&!stageLocalQuiet\?h\('div',\{className:'dcr-speech'\}/);
  assert.match(liveSource,/text&&!quiet&&snapshot\?\.settings\?\.comments!==false&&bubble/);
  assert.match(liveSource,/apiRef\.current=\{cancel:reason=>\{clearCapture\(\);return controller\.cancel\(reason\);\},setQuiet:value=>controller\.setQuiet\(value\)\}/);
  assert.match(liveSource,/onClick:\(\)=>apiRef\.current\?\.cancel\('skip'\)/);
  for(const [text,wanted] of [['请安静一点',true],['quiet please',true],['stop talking',true],['不要安静',false],['引用：“闭嘴” 这是什么棋理？',false]])
    assert.equal(requestsQuiet(text),wanted,text);
});
test('source balances resize/capture-scroll/visualViewport/media/page listeners, interval and owned teardown',()=>{
  for(const [owner,type,callback,capture] of [['window','resize','layout',''],['window','scroll','layout',',true'],
    ['window','pagehide','close',''],['document','visibilitychange','hidden',''],
    ['window.visualViewport?','resize','layout',''],['window.visualViewport?','scroll','layout',''],['mq','change','sync','']]){
    assert.ok(liveSource.includes(`${owner}.addEventListener('${type}',${callback}${capture})`));
    assert.ok(liveSource.includes(`${owner}.removeEventListener('${type}',${callback}${capture})`));
  }
  for(const seam of ['alive=false;clearCapture();clearInterval(roaming)','observer?.disconnect()','controller.dispose()',
    'controllerRef.current=null;apiRef.current=null','onVisual({model:null,artError:\'\',systemReduce:false})'])assert.ok(liveSource.includes(seam),seam);
});
test('source owns pointer capture only on the actor, clears it on context changes, and fences hidden tabs until fresh poll',()=>{
  assert.match(liveSource,/element:e\.currentTarget/);assert.match(liveSource,/e\.currentTarget\.setPointerCapture\(e\.pointerId\)/);
  assert.match(liveSource,/hasPointerCapture\?\.\(p\.pointerId\)\)p\.element\.releasePointerCapture\(p\.pointerId\)/);
  assert.match(liveSource,/\[enabled,online,snapshot\?\.runtimeId,snapshot\?\.game\?\.id,snapshot\?\.stage\?\.epoch,prefs\.drag,interactionBusy\]/);
  assert.match(liveSource,/if\(!prefs\.drag\|\|interactionBusy\|\|c\?\.busy\|\|e\.button!==0\|\|!model\)return/);
  assert.match(liveSource,/if\(document\.hidden\)\{controller\.cancel\('page-hidden'\);controller\.ingest\(propsRef\.current\.snapshot,\{enabled:false,online:false/);
  assert.match(liveSource,/else layout\(\)/);
  assert.match(liveSource,/ingest\(snapshot,\{enabled:enabled&&!document\.hidden,online,quiet,reduced:prefs\.reduce\|\|systemReduce\}/);
  assert.match(editableSource,/timer=setTimeout\(sync,1000\)/);
  assert.match(editableSource,/interactionBusy:busy/);
  assert.match(liveSource,/!document\.hidden&&!p\.interactionBusy&&[^;]*?p\.prefs\.roam/);
  assert.match(liveSource,/if\(!prefs\.drag\|\|interactionBusy\|\|c\?\.busy\)\{release\(e\);return;\}/);
  assert.match(liveSource,/dragEnabled:prefs\.drag&&!interactionBusy&&!controllerRef\.current\?\.busy/);
});
test('build retains native factory/bootstrap with unambiguous owned seams and no replacement DOM/RPC renderer',()=>{
  assert.match(buildSource,/missing\/ambiguous live seam/);assert.match(buildSource,/owned-live-source-in-memory/);
  assert.match(buildSource,/write:false/);assert.match(bootstrap,/import \{factory\} from '\.\/client-live-src\.js'/);
  assert.match(bootstrap,/window\.__ModuleLoader__\.load\(\{id:'@local\/dsh-chess-room',factory\}\)/);
  for(const code of [liveSource,controllerSource])assert.doesNotMatch(code,
    /fetch\s*\(|\brpc\s*\(|document\.(?:body|querySelector)|getElementsBy|elementFromPoint|pet\.(?:moveTo|placeStone|punchAvatar)|\bmousemove\b|dispatchEvent\s*\(/);
  assert.doesNotMatch(editableSource,/animation-complete|stage-ack|visual-complete/);
});

// Pure exact-ID/controller behavior; no browser, DOM, React, business service or live game calls.
test('confirmedMoveMask returns only exact persisted ID and never changes occupied authoritative board',()=>{
  const item=move(),committed=event(item),input=freeze(snapshot(1,[item],[committed])),before=JSON.stringify(input);
  const masked=confirmedMoveMask(input,actor(committed));assert.deepEqual(masked,item);
  assert.equal(input.game.board[7][8],2);assert.equal(JSON.stringify(input),before);
  for(const invalid of [{eventId:'other'},{hiddenMoveId:'other'},{gameId:'other'},{version:2},{runtimeId:'other'}])
    assert.equal(confirmedMoveMask(input,{...actor(committed),...invalid}),null);
  const replacement=copy(input);replacement.game.moves[0].moveId='replacement-id';
  assert.equal(confirmedMoveMask(replacement,actor(committed)),null);
});
test('pure controller skip/restored enabled/online modes discard observed history, leaving original board untouched',t=>{
  const f=pureController(t),a=move(),first=freeze(snapshot(1,[a],[event(a)]));f.controller.ingest(snapshot());
  assert.equal(visuals(f.controller.ingest(first)).length,1);assert.equal(f.controller.model.hiddenMoveId,'move1');
  f.controller.cancel('skip');assert.equal(f.controller.model.hiddenMoveId,null);
  f.controller.ingest(first,{enabled:false});assert.equal(visuals(f.controller.ingest(first,{enabled:true})).length,0);
  f.controller.ingest(first,{online:false});assert.equal(visuals(f.controller.ingest(first,{online:true})).length,0);
  const b=move('move2',8,8);assert.equal(visuals(f.controller.ingest(snapshot(2,[a,b],[event(a),event(b,2)]))).length,1);
  assert.equal(f.controller.model.hiddenMoveId,'move2');assert.equal(first.game.board[7][8],2);
});
test('hidden disconnect waits for first fresh native poll baseline and never replays missed confirmed events',t=>{
  const f=pureController(t),a=move();f.controller.ingest(snapshot());f.controller.ingest(snapshot(1,[a],[event(a)]));
  f.controller.cancel('page-hidden');f.controller.ingest(f.controller.snapshot,{enabled:false,online:false});
  assert.equal(f.controller.online,false);assert.equal(f.controller.enabled,false);assert.deepEqual(f.controller.drain(),[]);
  const b=move('missed',8,8),fresh=snapshot(3,[a,b],[event(a),event(b,2)]);
  assert.equal(visuals(f.controller.ingest(fresh,{enabled:true,online:true})).length,0);
  assert.equal(f.controller.model.hiddenMoveId,null);assert.deepEqual(f.controller.fence.boardFor(f.controller.model),fresh.game.board);
  const c=move('future',9,8);assert.equal(visuals(f.controller.ingest(snapshot(4,[a,b,c],[event(a),event(b,2),event(c,4)]))).length,1);
  assert.equal(f.controller.model.hiddenMoveId,'future');
});
test('pure controller reduced motion discards queued history and disposal leaves no frame/timer completion leaks',t=>{
  const f=pureController(t),a=move(),b=move('queued',8,8);f.controller.ingest(snapshot());
  f.controller.ingest(snapshot(1,[a],[event(a)]));f.controller.ingest(snapshot(2,[a,b],[event(a),event(b,2)]));
  const callbacks=[...f.time.frames.values()];f.controller.ingest(f.controller.snapshot,{reduced:true});
  assert.equal(f.controller.model.hiddenMoveId,null);assert.deepEqual(f.controller.drain(),[]);
  assert.equal(f.time.frames.size,0);assert.equal(f.time.timers.size,0);
  f.controller.dispose();const count=f.models.length;for(const callback of callbacks)callback(1000);
  assert.equal(f.models.length,count);assert.deepEqual(f.controller.ingest(snapshot()),[]);assert.deepEqual(f.controller.drain(),[]);
});

// Pure source-backed AI controller constructor: PNG imports are bundler-only.
const aiLiveSource=await readFile(new URL('../stage/ai-live-ui.js',import.meta.url),'utf8');
const aiClassSource=aiLiveSource.slice(aiLiveSource.indexOf('export class AiLiveStageController'),aiLiveSource.indexOf('export function createLiveStage'));
const AiController=new Function('LiveStageController','AI_ACTION_PROFILE',aiClassSource.replace('export class','class')+';return AiLiveStageController;')(LiveStageController,AI_ACTION_PROFILE);
const rect=(left,top,width,height)=>({left,top,width,height});
function aiController(){const time=clock(),models=[];const controller=new AiController({measure:()=>measureGeometry({rootRect:rect(0,0,900,800),rootSize:{width:900,height:800},boardRect:rect(180,180,450,450)}),clock:time,emit:m=>models.push(m),actionProfile:{...AI_ACTION_PROFILE,ambient:{durationMs:3360}}});return {controller,time,models};}
const pureVisual=actions=>actions.filter(a=>['move','defeat'].includes(a.type));
test('legacy measured88/108px and52px account avatar stay unchanged; AI scale is optional4/3',()=>{
  for(const width of [390,900]){const input={rootRect:rect(0,0,width,800),rootSize:{width,height:800},boardRect:rect(100,150,width-200,400)};const base=width<480?88:108;
    assert.equal(measureLiveGeometry(input).actorSize.width,base);assert.equal(measureLiveGeometry(input,{actorScale:4/3,safeRest:true}).actorSize.width,base*4/3);}
  assert.match(liveSource,/width:52px;height:52px/);assert.match(aiLiveSource,/actorScale:4\/3,safeRest:true/);assert.match(liveSource,/data-dcr-live-stage':stageRelease/);
});
test('AI scale compromises to a genuine free strip, never hides invalid fit with CSS enlargement',()=>{
  const input={rootRect:rect(0,0,600,300),rootSize:{width:600,height:300},boardRect:rect(100,0,500,300)};
  const g=measureLiveGeometry(input,{actorScale:4/3,safeRest:true});assert.equal(g.actorSize.width,100);assert.equal(g.safeIdle,true);assert(safeLiveActorRest(g,{...g.home,width:100,height:100}));assert(g.perimeter.length>0);
  const full=measureLiveGeometry({...input,boardRect:rect(0,0,600,300)},{actorScale:4/3,safeRest:true});assert.equal(full.safeIdle,false);assert.equal(full.perimeter.length,0);assert.equal(safeLiveActorRest(full,{...full.home,width:144,height:144}),false);
  const sliver=measureLiveGeometry({...input,boardRect:rect(20,0,580,300)},{actorScale:4/3,safeRest:true});assert.equal(sliver.safeIdle,false);assert.equal(sliver.perimeter.length,0);
});
test('AI measured scale uses independent viewport transforms and honors partial visible room',()=>{
  const g=measureLiveGeometry({rootRect:rect(100,200,1200,1200),rootSize:{width:600,height:400},viewportRect:rect(100,200,1200,900),boardRect:rect(500,200,600,750)},{actorScale:4/3,safeRest:true});
  assert.deepEqual(g.scale,{x:2,y:3});assert.equal(g.actorSize.width,144);assert.equal(g.bounds.height,300);assert(g.safeIdle);assert(safeLiveActorRest(g,{...g.home,width:144,height:144}));
});
test('AI ambient controller does not block future confirmed move or drain/create fake events',()=>{
  const f=aiController();assert.equal(pureVisual(f.controller.ingest(snapshot())).length,0);f.controller.setAmbientEnabled(true);assert.equal(f.controller.busy,false);assert.equal(f.time.frames.size,1);assert.equal(f.time.timers.size,0);
  const a=move();assert.equal(pureVisual(f.controller.ingest(snapshot(1,[a],[event(a)]))).length,1);assert.equal(f.controller.model.hiddenMoveId,a.moveId);assert.equal(f.controller.busy,true);assert.equal(f.time.frames.size,1);assert.equal(f.time.timers.size,1);
  f.controller.cancel('skip');assert.deepEqual(f.controller.drain(),[]);assert.equal(f.time.frames.size,0);assert.equal(f.time.timers.size,0);f.controller.dispose();
});
test('AI controller idle stop gates cover offline/disabled/reduced/ai-thinking/drag/error/disposal',()=>{
  for(const options of [{online:false},{enabled:false},{reduced:true}]){const f=aiController();f.controller.ingest(snapshot());f.controller.setAmbientEnabled(true);const old=[...f.time.frames.values()];f.controller.ingest(snapshot(),options);assert.equal(f.time.frames.size,0);const model=f.controller.model;for(const cb of old)cb();assert.equal(f.controller.model,model);f.controller.dispose();}
  const f=aiController();f.controller.ingest(snapshot());f.controller.setAmbientEnabled(true);f.controller.ingest(snapshot(0,[],[],{aiThinking:true}));assert.equal(f.time.frames.size,0);f.controller.ingest(snapshot());assert.equal(f.time.frames.size,1);
  f.controller.dragTo({x:10,y:10});assert.equal(f.time.frames.size,0);f.controller.setAmbientEnabled(true);f.controller.cancel('art-unavailable');assert.equal(f.time.frames.size,0);f.controller.dispose();assert.equal(f.time.timers.size,0);
});
test('hidden baseline reconnect does not replay missed events; explicit fresh ambient permission may resume',()=>{
  const f=aiController();f.controller.ingest(snapshot());f.controller.setAmbientEnabled(true);f.controller.cancel('page-hidden');f.controller.ingest(snapshot(),{enabled:false,online:false});const a=move();
  assert.equal(pureVisual(f.controller.ingest(snapshot(1,[a],[event(a)]),{enabled:true,online:true})).length,0);assert.equal(f.controller.model.hiddenMoveId,null);assert.equal(f.time.frames.size,0);f.controller.setAmbientEnabled(true);assert.equal(f.time.frames.size,1);f.controller.dispose();
});
test('UI gates ambient by visibility/reduced/error/interaction/drag and waits fresh poll on visible',()=>{
  for(const guard of ['!document.hidden','!p.prefs.reduce','!p.systemReduce','!p.artError','!p.interactionBusy','!p.snapshot?.aiThinking','!dragRef.current'])assert(liveSource.includes(guard),guard);
  assert.match(liveSource,/else layout\(\)/);assert(!liveSource.includes('controller.ingest(p.snapshot'));assert.match(liveSource,/propsRef.current.artError=message;controllerRef.current\?\.setAmbientEnabled\?\.\(false\)/);
  assert.match(liveSource,/safeLiveActorRest\(geometry,model\)/);assert(!aiLiveSource.includes("kind:'idle'"));
});
