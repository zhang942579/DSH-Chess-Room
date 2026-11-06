import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AI_MANIFEST,AI_SOURCE_MOVE,AI_SOURCE_DEFEAT,AI_MOVE,AI_DEFEAT,AI_ACTION_PROFILE,AI_TIME_SCALE,AI_HAS_IDLE,AI_RELEASE_AT,AI_HOLD_AT,PLACE_RELEASE,PUNCH_DURATION,PUNCH_CONTACT,PUNCH_SOURCE_DURATION,PUNCH_SOURCE_INDICES,aiPresentationMs,hasAiIdleTrack,sampleAiAction} from '../stage/ai-actions.js';
import {MotionDirector,motionDeadlineMs} from '../stage/motion-director.js';
import {measureGeometry,boardPoint} from '../stage/geometry.js';
const rect=(left,top,width,height)=>({left,top,width,height});
const geometry=(size=108)=>measureGeometry({rootRect:rect(0,0,900,800),rootSize:{width:900,height:800},boardRect:rect(180,180,450,450),avatarRect:rect(80,680,52,52),actorSize:{width:size,height:size}});
function fakeClock(){let time=0,id=0;const frames=new Map(),timers=new Map();return{now:()=>time,request:cb=>{frames.set(++id,cb);return id;},cancel:key=>frames.delete(key),timeout:(cb,ms)=>{timers.set(++id,{cb,at:time+ms});return id;},clearTimeout:key=>timers.delete(key),frames,timers,
  step(ms,runFrames=true){time+=ms;for(const [key,t] of [...timers])if(t.at<=time){timers.delete(key);t.cb();}if(runFrames){const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(time);}},
  advance(ms){while(ms>0){const n=Math.min(16,ms);this.step(n);ms-=n;}}};}
function setup(measure=geometry){const clock=fakeClock(),models=[];const director=new MotionDirector({measure,clock,actionProfile:AI_ACTION_PROFILE,emit:m=>models.push(m)});director.reset({gameId:'g1',version:0});return{director,clock,models};}
const move=extra=>({gameId:'g1',version:1,eventId:'e1',moveId:'m1',row:7,col:7,color:2,confirmed:true,...extra});
const defeat=extra=>({gameId:'g1',version:1,eventId:'d1',confirmed:true,status:'won',winner:1,playerColor:1,...extra});
const pose=(phase,phaseElapsed=0,extra={})=>sampleAiAction({actionClock:'dsh-chess-ai-v1',timeScale:AI_TIME_SCALE,phase,phaseElapsed,segmentIndex:0,eventId:'e',facing:'right',...extra});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const total=sequence=>sequence.reduce((n,s)=>n+s[1],0);
const carryStart=total(AI_MOVE.slice(0,2)),placeStart=total(AI_MOVE.slice(0,3));

test('normalized tracks preserve six action source timings and permit bounded generated idle/walk families',()=>{
  assert.equal(AI_MANIFEST.format,'dsh-chess-ai-actions-v1');assert.deepEqual(AI_MANIFEST.canvas,{width:384,height:384,feetY:367});
  const keys=Object.keys(AI_MANIFEST.tracks);assert.equal(keys.length,AI_HAS_IDLE?8:7);
  for(const [track,spec] of Object.entries(AI_MANIFEST.tracks)){
    if(track==='idle')assert(spec.frames.length>=48&&spec.frames.length<=64);
    else if(track==='walk-right')assert(spec.frames.length===8||(spec.frames.length>=32&&spec.frames.length<=48));
    else assert.equal(spec.frames.length,8);
    for(const [index,f] of spec.frames.entries()){
      assert.equal(f.index,index);assert(Number.isInteger(f.duration)&&f.duration>=16);
      assert.match(f.whitePath,/^(frames|prepared\/white)\/[a-z-]+\/[0-9]{2,3}\.png$/);
      assert.match(f.blackPath,/^(frames|prepared\/black)\/[a-z-]+\/[0-9]{2,3}\.png$/);
      if(!['idle','walk-right'].includes(track)){assert.equal(f.stoneRemoved,false);assert.equal(spec.frameMetadata[index].durationMs,f.duration);}
    }
  }
  assert.equal(total(AI_SOURCE_MOVE),7300);assert.equal(total(AI_SOURCE_DEFEAT),8380);
  assert.deepEqual(AI_MOVE.map(s=>s[1]),AI_SOURCE_MOVE.map(s=>aiPresentationMs(s[1])));
  assert.deepEqual(AI_DEFEAT.map(s=>s[1]),AI_SOURCE_DEFEAT.map(s=>aiPresentationMs(s[1])));
  assert.equal(AI_HOLD_AT,aiPresentationMs(1150));assert.equal(PLACE_RELEASE,aiPresentationMs(800));assert.equal(AI_RELEASE_AT,aiPresentationMs(4430));
  assert.equal(total(AI_MOVE),10220);assert.equal(total(AI_DEFEAT),11732);
});
test('single-strike subclip excludes source06 and restarts in each of three scaled segments',()=>{
  assert.deepEqual([...PUNCH_SOURCE_INDICES],[0,1,2,3,4,6,7]);assert.equal(PUNCH_SOURCE_DURATION,650);assert.equal(PUNCH_DURATION,910);assert.equal(PUNCH_CONTACT,224);
  const cycles=AI_DEFEAT.map((s,i)=>[s,i]).filter(([s])=>s[0]==='punch');assert.equal(cycles.length,3);
  let impacts=0;const keys=new Set();for(const [,segmentIndex] of cycles){let previous=false;keys.add(pose('punch',0,{segmentIndex}).cycleKey);assert.equal(pose('punch',0,{segmentIndex}).index,0);
    for(let ms=0;ms<PUNCH_DURATION;ms++){const p=pose('punch',ms,{segmentIndex});assert.notEqual(p.index,5);const impact=[2,3].includes(p.index);if(impact&&!previous)impacts++;previous=impact;}}
  assert.equal(impacts,3);assert.equal(keys.size,3);
});
test('frame sampler divides supplied phase clock exactly once, without timer/history replay',()=>{
  assert.equal(sampleAiAction({phase:'punch',phaseElapsed:280}),null);assert.equal(pose('punch',aiPresentationMs(200)).index,2);
  assert.equal(pose('pout',aiPresentationMs(299)).index,1);assert.equal(pose('stomp',0).index,2);assert.equal(pose('carrying',aiPresentationMs(1760)).index,0);
  assert.equal(pose('punch',223).index,1);assert.equal(pose('punch',224).index,2);
});
test('direction follows actual authored walk facing and unchanged rightward punch',()=>{
  const native=AI_MANIFEST.tracks['walk-right'].nativeFacing;
  for(const facing of ['left','right'])assert.equal(pose('retreat',0,{facing}).mirror,native!=='front'&&native!==facing);
  assert.equal(pose('punch',280,{facing:'left'}).mirror,true);assert.equal(pose('punch',280,{facing:'right'}).mirror,false);
  for(const phase of ['pickup','carrying','placing','arms-crossed'])assert.equal(pose(phase,0,{facing:'left'}).mirror,false);
});
test('optional idle and variable walk sample declared durations; no idle falls back cleanly',()=>{
  const idleFrames=Array.from({length:48},(_,index)=>({index,duration:50,stone:null}));
  const walkFrames=Array.from({length:32},(_,index)=>({index,duration:40,stone:null}));
  const metadata={...AI_MANIFEST,tracks:{...AI_MANIFEST.tracks,idle:{frames:idleFrames,nativeFacing:'front'},'walk-right':{frames:walkFrames,nativeFacing:'right',loop:true}}};
  const model={actionClock:'dsh-chess-ai-v1',timeScale:AI_TIME_SCALE,phase:'idle',phaseElapsed:0,ambientEpoch:7,facing:'right'};
  assert(hasAiIdleTrack(metadata));assert.equal(sampleAiAction({...model,phaseElapsed:70},metadata).index,1);
  const first=sampleAiAction(model,metadata),next=sampleAiAction({...model,phaseElapsed:3360},metadata);assert.equal(next.index,0);assert.notEqual(first.cycleKey,next.cycleKey);
  assert.equal(sampleAiAction({...model,phase:'roam',phaseElapsed:aiPresentationMs(31*40)},metadata).index,31);
  assert.equal(sampleAiAction({...model,phase:'roam',phaseElapsed:aiPresentationMs(32*40)},metadata).index,0);
  for(const frames of [[],Array.from({length:129},()=>({duration:16})),[{duration:NaN}],[{duration:60001}]])assert.equal(hasAiIdleTrack({tracks:{idle:{frames}}}),false);
  if(!AI_HAS_IDLE){assert.equal(pose('idle'),null);assert.equal(AI_ACTION_PROFILE.ambient,null);}
});
test('handover shows only place01–05 and switches at the same scaled exact boundary',()=>{
  assert.equal(pose('placing',PLACE_RELEASE-1).index,4);assert.equal(pose('placing',PLACE_RELEASE),null);
  const {director,clock}=setup();assert(director.playMove(move()));clock.advance(AI_RELEASE_AT-1);assert.equal(director.model.phase,'placing');assert.equal(director.model.hiddenMoveId,'m1');assert(director.model.heldStone);
  clock.step(1);assert.equal(director.model.phaseElapsed,PLACE_RELEASE);assert.equal(director.model.hiddenMoveId,null);assert.equal(director.model.heldStone,null);assert.equal(sampleAiAction(director.model),null);director.dispose();
});
test('pickup pre/contact and holding use the same scaled clock and baked-piece anchors',()=>{
  const {director,clock}=setup();director.playMove(move({color:1}));clock.advance(AI_HOLD_AT-1);assert.equal(director.model.heldStone,null);clock.step(1);assert.equal(director.model.heldStone.color,1);assert.equal(director.model.stoneColor,1);
  clock.advance(carryStart-AI_HOLD_AT);for(let i=0;i<70;i++){clock.step(16);const m=director.model,p=sampleAiAction(m);assert.equal(m.phase,'carrying');assert(p.stone);assert(distance(m.heldStone,{x:m.x+m.width*p.stone.x,y:m.y+m.height*p.stone.y})<1e-7);}director.dispose();
});
test('carrying→placing keeps world-piece continuity at derived phase boundary, including enlarged actor',()=>{
  for(const size of [108,144,88*4/3])for(const color of [1,2]){
    const {director,clock}=setup(()=>geometry(size));director.playMove(move({color}));clock.advance(placeStart-1);const last=director.model.heldStone;assert.equal(director.model.phase,'carrying');clock.step(1);
    assert.equal(director.model.phase,'placing');assert(distance(last,director.model.heldStone)<0.05);const p=sampleAiAction(director.model);assert(distance(director.model.heldStone,{x:director.model.x+size*p.stone.x,y:director.model.y+size*p.stone.y})<1e-7);director.dispose();
  }
});
test('placement approaches true committed intersection without invented extended limbs',()=>{
  const {director,clock}=setup();director.playMove(move());clock.advance(AI_RELEASE_AT-1);const target=boardPoint(geometry(),7,7);assert(distance(director.model.heldStone,target)<0.01);director.dispose();
});
test('late RAF releases mask without waiting for image decode',()=>{
  const {director,clock}=setup();director.playMove(move());clock.step(AI_RELEASE_AT+500);assert.equal(director.model.hiddenMoveId,null);assert.equal(director.model.heldStone,null);assert.equal(sampleAiAction(director.model),null);director.dispose();
});
test('confirmed victory gives exactly three pulses and completes11732ms before derived grace deadline',()=>{
  const {director,clock,models}=setup();assert(director.playDefeat(defeat()));assert.equal(director.active.deadlineMs,13732);clock.advance(total(AI_DEFEAT));
  const keys=new Set(models.filter(m=>m.avatarFeedback).map(m=>m.avatarFeedback.pulseId));assert.deepEqual([...keys],['d1:punch:1','d1:punch:2','d1:punch:3']);assert.equal(director.model.avatarFeedback,null);assert.equal(director.model.phase,'idle');assert.notEqual(director.lastCancelReason,'timeout');director.dispose();
});
test('source-clock wobble and impact window scale together with three separate contacts',()=>{
  const punchStart=total(AI_DEFEAT.slice(0,3));const {director,clock}=setup();director.playDefeat(defeat());clock.advance(punchStart+PUNCH_CONTACT-1);assert.equal(director.model.avatarFeedback,null);clock.step(1);assert.equal(director.model.avatarFeedback.shake,0);
  clock.step(aiPresentationMs(40));assert(Math.abs(director.model.avatarFeedback.shake-3)<1e-7);clock.advance(AI_ACTION_PROFILE.punchFeedbackEnd-PUNCH_CONTACT-aiPresentationMs(40));assert.equal(director.model.avatarFeedback,null);director.dispose();
});
test('paused RAF watchdog and tick share bounded deadline; late callbacks never resurrect state',()=>{
  const {director,clock}=setup();director.playDefeat(defeat());const stale=[...clock.frames.values()];clock.step(12001,false);assert.equal(director.active.deadlineMs,motionDeadlineMs(AI_DEFEAT,AI_ACTION_PROFILE));clock.step(1731,false);
  assert.equal(director.lastCancelReason,'timeout');assert.equal(clock.frames.size,0);assert.equal(clock.timers.size,0);const clean=director.model;for(const cb of stale)cb();assert.equal(director.model,clean);director.dispose();
});
test('unconfirmed/model-won outcomes never begin defeat art',()=>{
  for(const event of [defeat({confirmed:false}),defeat({winner:2}),defeat({status:'playing'})]){const {director}=setup();assert.equal(director.playDefeat(event),false);assert.equal(director.model.phase,'idle');director.dispose();}
});
test('skip/reduced/error/dispose invalidate pending callbacks and reveal board',()=>{
  for(const action of [d=>d.skip(),d=>d.setReducedMotion(true),d=>d.cancel('art-unavailable'),d=>d.dispose()]){const {director,clock}=setup();director.playMove(move());clock.advance(2400);const stale=[...clock.frames.values()];action(director);const clean=director.model;for(const cb of stale)cb();assert.equal(director.model,clean);assert.equal(clean.hiddenMoveId,null);assert.equal(clean.heldStone,null);assert.equal(clock.frames.size,0);assert.equal(clock.timers.size,0);director.dispose();}
});
test('repeated art errors cancel every new confirmed move, not just a string change',async()=>{
  const {director,clock}=setup();for(let i=1;i<=2;i++){assert(director.playMove(move({version:i,eventId:'e'+i,moveId:'m'+i})));clock.step(100);director.cancel('art-unavailable');assert.equal(director.model.hiddenMoveId,null);}director.dispose();
  const source=await readFile(new URL('../stage/live-ui.js',import.meta.url),'utf8');assert.match(source,/onArtError:message=>\{[\s\S]*?if\(cancelOnArtError\)controllerRef\.current\?\.cancel\('art-unavailable'\);[\s\S]*?setArtError\(message\)/);
});
test('clipped contact falls back to committed board, not false alignment',()=>{
  const {director,clock}=setup(()=>measureGeometry({rootRect:rect(0,0,300,300),boardRect:rect(0,0,300,300),actorSize:{width:144,height:144}}));director.playMove(move({row:14,col:0}));clock.advance(AI_RELEASE_AT-1);assert.equal(director.model.hiddenMoveId,null);assert.equal(director.model.heldStone,null);assert.equal(director.model.phase,'idle');director.dispose();
});
test('runtime reset prevents old image cycles/RAF from restoring masked/held state',()=>{
  const {director,clock}=setup();director.playMove(move());clock.advance(2400);const stale=[...clock.frames.values()];director.reset({gameId:'g2',version:4});for(const cb of stale)cb();assert.equal(director.model.gameId,'g2');assert.equal(director.model.hiddenMoveId,null);assert.equal(sampleAiAction(director.model),null);director.dispose();
});
test('compiled inline PNGs exactly equal current declared files, with no external transport',async()=>{
  const bundle=await readFile(new URL('../../dsh-chess-room-live-client/client.js',import.meta.url),'utf8');
  const encoded=[...bundle.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map(m=>Buffer.from(m[1],'base64'));
  const paths=new Set(Object.values(AI_MANIFEST.tracks).flatMap(s=>s.frames.flatMap(f=>[f.whitePath,f.blackPath])));assert.equal(encoded.length,paths.size);
  const actual=new Set(encoded.map(sha));for(const p of paths){const bytes=await readFile(new URL('../assets/actions-ai-v1/'+p,import.meta.url));assert(actual.has(sha(bytes)),p);}
  for(const bytes of encoded){assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),384);assert.equal(bytes.readUInt32BE(20),384);}for(const fake of ['pet.moveTo','pet.placeStone','pet.punchAvatar'])assert(!bundle.includes(fake));
});
test('artwork has no timers/RPC/prop overlays and shares scaled fallback cutoff/stale guards',async()=>{
  const source=await readFile(new URL('../stage/ai-artwork.js',import.meta.url),'utf8');for(const forbidden of ['setTimeout(', 'setInterval(', 'fetch(', 'rpc(', "h('svg'",'requestAnimationFrame('])assert(!source.includes(forbidden),forbidden);
  for(const required of ['errorGuard.current!==signature','!alive.current','heldStone:null',"image.src=''",'aiSourceElapsed(model.phaseElapsed','pose?.track'])assert(source.includes(required),required);
});
