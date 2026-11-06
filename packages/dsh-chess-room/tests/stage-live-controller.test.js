import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createChessRoom} from '../host/room-v4.js';
import {gomokuAdapter} from '../host/rules.js';
import {LiveStageController,committedComment} from '../stage/live-controller.js';
import {measureGeometry} from '../stage/geometry.js';

const copy=value=>structuredClone(value);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const identity=(room,extra={})=>{const g=room.snapshot().game;return {gameId:g.id,version:g.version,turnIdentity:g.turnIdentity,requestId:randomUUID(),...extra};};
function fakeClock(){
  let now=0,sequence=0;const frames=new Map(),timers=new Map();
  const clock={now:()=>now,request:cb=>{const id=++sequence;frames.set(id,cb);return id;},cancel:id=>frames.delete(id),
    timeout:(cb,ms)=>{const id=++sequence;timers.set(id,{cb,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    step(ms=16){now+=ms;for(const [id,item] of [...timers])if(item.at<=now){timers.delete(id);item.cb();}
      const pending=[...frames.values()];frames.clear();for(const cb of pending)cb(now);},
    advance(ms){while(ms>0){const step=Math.min(ms,16);clock.step(step);ms-=step;}},frames,timers};return clock;
}
function geometry(){return measureGeometry({rootRect:{left:0,top:0,width:800,height:650},rootSize:{width:800,height:650},
  boardRect:{left:180,top:70,width:450,height:450},avatarRect:{left:80,top:480,width:50,height:50}});}
async function host(t,seed){
  let persisted=copy(seed??{format:1,revision:0,current:null,archived:[]});const writes=[],calls=[],operations=[];
  const store={nextWrite:null,read:()=>copy(persisted),async write(value){writes.push(copy(value));const plan=store.nextWrite;store.nextWrite=null;
    if(plan instanceof Error)throw plan;if(plan)await plan.promise;persisted=copy(value);},async close(){}};
  const player={choose(input,signal){const pending=deferred();calls.push({input:copy(input),signal,...pending});return pending.promise;},
    async dispose(){for(const call of calls)call.reject(new Error('test-disposed'));}};
  const account={snapshot:{id:'test-account',identityRevision:1,name:'Player',avatarUrl:null,signedIn:true},async refresh(){},async dispose(){}};
  const authority=await createChessRoom({logger:{warn(){}},tools:{get:()=>undefined}},{store,player,account});
  const room={snapshot:()=>authority.snapshot(),dispose:()=>authority.dispose(),operate(operation,payload){operations.push(operation);return authority.operate(operation,payload);}};
  t.after(()=>room.dispose());return {room,store,writes,calls,operations,data:()=>copy(persisted)};
}
function front(t){const clock=fakeClock(),models=[],submits=[];
  const controller=new LiveStageController({measure:geometry,clock,emit:model=>models.push(model),
    rpc(){submits.push('rpc');throw new Error('cosmetic controller must not RPC');},
    submitMove(){submits.push('move');throw new Error('cosmetic controller must not submit');},
    onComplete(){submits.push('completion');throw new Error('cosmetic completion must not ACK');}});
  t.after(()=>controller.dispose());return {clock,models,submits,controller};}
async function finishAI(h,extra={}){const call=h.calls.at(-1);call.resolve({move:copy(call.input.candidates[0]),source:'model',comment:'棋盘上继续见真章。',...extra});await tick();return h.room.operate('state');}
async function human(h,square){const board=h.room.snapshot().game.board;const move=square??gomokuAdapter.legalMoves(board,1).find(m=>m.row===14)??gomokuAdapter.legalMoves(board,1)[0];
  return h.room.operate('move',identity(h.room,move));}
async function round(h,square,extra){await human(h,square);return finishAI(h,extra);}
const visuals=actions=>actions.filter(action=>action.type==='move'||action.type==='defeat');
const board=f=>f.controller.fence.boardFor(f.controller.model);
function clean(f){assert.equal(f.controller.busy,false);assert.equal(f.controller.model.hiddenMoveId,null);assert.equal(f.controller.model.heldStone,null);
  assert.equal(f.controller.model.avatarFeedback,null);assert.equal(f.clock.frames.size,0);assert.equal(f.clock.timers.size,0);}
async function seeded(t,moves,playerColor=1){const h=await host(t),seed=h.data(),replay=gomokuAdapter.replay(moves);
  Object.assign(seed.current,{moves:copy(moves),board:replay.board,status:replay.status,winner:replay.winner,turn:replay.nextColor,
    winningLine:replay.winningLine,playerColor});delete seed.current.stage;return seed;}
function openLine(count){const moves=[];for(let index=0;index<count;index++){
  moves.push({row:7,col:4+index,color:1,source:'human'},{row:0,col:index*2,color:2,source:'model'});}return moves;}
async function winningMove(h){const g=h.room.snapshot().game;const move=gomokuAdapter.legalMoves(g.board,g.playerColor)
  .find(square=>gomokuAdapter.evaluate(gomokuAdapter.applyMove(g.board,square,g.playerColor),square).status==='won');
  assert.ok(move,'test fixture must have a current rules-confirmed winning move');return human(h,move);}

// These are integration tests against the real v4 Host, not invented motion events.
test('first attachment establishes a visible durable baseline and never replays old Host events',async t=>{
  const h=await host(t),snapshot=await round(h,{row:7,col:7}),f=front(t);
  assert.equal(snapshot.stage.events.length,1);assert.equal(visuals(f.controller.ingest(snapshot)).length,0);
  assert.deepEqual(board(f),snapshot.game.board);clean(f);assert.equal(f.controller.drain().length,0);
  f.controller.ingest(snapshot);f.clock.advance(10000);clean(f);assert.deepEqual(f.submits,[]);
});

test('actual AI placement is not animated or masked before write and releases only its durable stone',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());await human(h,{row:7,col:7});
  const before=h.room.snapshot();f.controller.ingest(before);const gate=deferred();h.store.nextWrite=gate;
  const call=h.calls.at(-1);call.resolve({move:copy(call.input.candidates[0]),source:'model',comment:'unconfirmed'});await tick();
  assert.deepEqual(h.room.snapshot().game.board,before.game.board);assert.equal(visuals(f.controller.ingest(h.room.snapshot())).length,0);clean(f);
  gate.resolve();await tick();const committed=await h.room.operate('state'),event=committed.stage.events.at(-1);
  assert.deepEqual(visuals(f.controller.ingest(committed)).map(a=>a.event),[event]);assert.equal(f.controller.busy,true);
  assert.equal(board(f)[event.row][event.col],0);assert.equal(h.data().current.board[event.row][event.col],event.color);
  assert.equal(board(f)[7][7],1);f.clock.advance(1100);assert.equal(f.controller.model.heldStone.moveId,event.moveId);
  f.clock.advance(2300);assert.equal(board(f)[event.row][event.col],event.color);f.clock.advance(4000);clean(f);
  assert.equal(visuals(f.controller.ingest(committed)).length,0);assert.deepEqual(f.submits,[]);
});

test('failed AI durable write leaves the cosmetic controller idle and the original visible board intact',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());await human(h,{row:7,col:7});
  const before=h.room.snapshot();f.controller.ingest(before);h.store.nextWrite=new Error('write-failed');
  await finishAI(h);const snapshot=h.room.snapshot();assert.deepEqual(snapshot.game.board,before.game.board);
  assert.deepEqual(snapshot.stage.events,before.stage.events);assert.equal(visuals(f.controller.ingest(snapshot)).length,0);clean(f);
});

for(const reason of ['skip','user-cancel','hide'])test(`${reason} discards both active and observed pending AI events and does not replay them`,async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const first=await round(h,{row:7,col:7});
  f.controller.ingest(first);const second=await round(h,{row:14,col:0});f.controller.ingest(second);
  assert.equal(f.controller.busy,true);assert.equal(f.controller.fence.state.queued,1);f.controller.cancel(reason);clean(f);
  assert.equal(f.controller.fence.state.queued,0);assert.deepEqual(board(f),second.game.board);
  assert.equal(visuals(f.controller.ingest(second)).length,0);assert.equal(f.controller.drain().length,0);
  f.clock.advance(15000);clean(f);assert.deepEqual(f.submits,[]);
});

test('pending events drain once after idle, without any RPC or Host completion mutation',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());f.controller.ingest(await round(h,{row:7,col:7}));
  const second=await round(h,{row:14,col:0});f.controller.ingest(second);const event=second.stage.events.at(-1);
  const counts=[h.operations.length,h.writes.length,h.calls.length];assert.equal(f.controller.drain().length,0);
  f.clock.advance(6500);clean(f);assert.deepEqual(visuals(f.controller.drain()).map(a=>a.event),[event]);
  assert.equal(board(f)[event.row][event.col],0);f.clock.advance(6500);clean(f);assert.equal(f.controller.drain().length,0);
  assert.deepEqual([h.operations.length,h.writes.length,h.calls.length],counts);assert.deepEqual(f.submits,[]);
});

for(const mode of ['disconnect','disable'])test(`${mode} cancels an active move and reconnect/re-enable does not replay missed durable events`,async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());f.controller.ingest(await round(h,{row:7,col:7}));
  const options=mode==='disconnect'?{online:false}:{enabled:false};f.controller.ingest(h.room.snapshot(),options);clean(f);
  const next=await round(h,{row:14,col:0});f.controller.ingest(next,options);clean(f);
  assert.equal(visuals(f.controller.ingest(next)).length,0);assert.deepEqual(board(f),next.game.board);clean(f);
});

for(const operation of ['undo','newGame'])test(`actual Host ${operation} epoch invalidation cancels active choreography and reveals authoritative board`,async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const first=await round(h,{row:7,col:7});
  f.controller.ingest(first);const prior=f.controller.director;const reset=await h.room.operate(operation,identity(h.room));
  assert.notEqual(reset.stage.epoch,first.stage.epoch);assert.deepEqual(reset.stage.events,[]);
  const actions=f.controller.ingest(reset);assert.equal(visuals(actions).length,0);assert.ok(actions.some(a=>a.type==='authority'&&a.reset));
  assert.notEqual(f.controller.director,prior);assert.equal(prior.disposed,true);assert.deepEqual(board(f),reset.game.board);clean(f);
});

test('actual Host recovery runtime/epoch change cancels old director, retains visible stone IDs and never replays ledger',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const before=await round(h,{row:7,col:7});
  f.controller.ingest(before);const prior=f.controller.director,h2=await host(t,h.data()),recovered=h2.room.snapshot();
  assert.notEqual(recovered.runtimeId,before.runtimeId);assert.deepEqual(recovered.stage.events,before.stage.events);
  const actions=f.controller.ingest(recovered);assert.equal(visuals(actions).length,0);assert.ok(actions.some(a=>a.reason==='runtime-change'));
  assert.equal(prior.disposed,true);assert.deepEqual(board(f),recovered.game.board);clean(f);
  assert.deepEqual(f.controller.ingest(before),[]);clean(f);
});

for(const initiallyReduced of [true,false])test(`reduced motion ${initiallyReduced?'at dispatch':'during active move'} exposes full durable board immediately and consumes without replay`,async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot(),{reduced:initiallyReduced});
  const snapshot=await round(h,{row:7,col:7});f.controller.ingest(snapshot,{reduced:initiallyReduced});
  if(!initiallyReduced){assert.equal(f.controller.busy,true);f.controller.ingest(snapshot,{reduced:true});}
  clean(f);assert.deepEqual(board(f),snapshot.game.board);f.controller.ingest(snapshot,{reduced:false});clean(f);
  assert.equal(f.controller.drain().length,0);
});

for(const quietMode of ['option','host-setting'])test(`${quietMode} quiet suppresses every bubble but preserves legal placement choreography`,async t=>{
  const h=await host(t),f=front(t);if(quietMode==='host-setting')await h.room.operate('settings',identity(h.room,{comments:false}));
  const options={quiet:quietMode==='option'};f.controller.ingest(h.room.snapshot(),options);
  const first=await round(h,{row:7,col:7});f.controller.ingest(first,options);assert.equal(f.controller.busy,true);
  f.clock.advance(6500);assert.ok(f.models.every(m=>m.bubble===null));clean(f);assert.deepEqual(board(f),first.game.board);
});

test('quiet can suppress an already active committed bubble without cancelling motion',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());f.controller.ingest(await round(h,{row:7,col:7}));
  f.clock.advance(6500);f.controller.drain();const snapshot=await round(h,{row:14,col:0});f.controller.ingest(snapshot);
  f.clock.advance(3600);assert.equal(typeof f.controller.model.bubble,'string');assert.ok(f.controller.model.bubble.length>0);
  const active=f.controller.director.active;f.controller.setQuiet(true);assert.equal(f.controller.model.bubble,null);
  assert.equal(f.controller.director.active,active);assert.equal(f.controller.busy,true);f.clock.advance(3000);clean(f);
});

for(const operation of ['chat','settings','hint','state'])test(`unrelated ${operation} snapshot commits do not cancel, restart or duplicate active motion`,async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());f.controller.ingest(await round(h,{row:7,col:7}));
  f.clock.advance(1100);const active=f.controller.director.active,eventId=f.controller.model.eventId;
  const payload=identity(h.room,{text:'继续下棋',comments:true});const snapshot=await h.room.operate(operation,payload);
  assert.equal(visuals(f.controller.ingest(snapshot)).length,0);assert.equal(f.controller.director.active,active);
  assert.equal(f.controller.model.eventId,eventId);assert.equal(f.controller.busy,true);assert.equal(f.clock.frames.size,1);
  f.clock.advance(5500);clean(f);assert.equal(f.controller.drain().length,0);
});

test('committedComment never invents move banter and only reuses bounded dsh comments at the exact committed move index',async t=>{
  const h=await host(t);const first=await round(h,{row:7,col:7}),event1=first.stage.events.at(-1);
  assert.equal(committedComment(first,event1),'');const second=await round(h,{row:14,col:0}),event=second.stage.events.at(-1);
  const index=second.game.moves.findIndex(m=>m.moveId===event.moveId)+1;
  const valid=second.game.chat.filter(m=>m.who==='dsh'&&m.turn===index).at(-1)?.text;
  assert.ok(valid);assert.equal(committedComment(second,event),valid);
  for(const [label,patch] of [
    ['player comment',{who:'player',turn:index,text:'not dsh'}],['previous turn',{who:'dsh',turn:index-1,text:'wrong turn'}],
    ['future turn',{who:'dsh',turn:index+1,text:'wrong turn'}],['missing turn',{who:'dsh',text:'no certificate'}],
    ['oversized Unicode',{who:'dsh',turn:index,text:'😀'.repeat(61)}],['non-string',{who:'dsh',turn:index,text:{bad:true}}],
  ]){const altered=copy(second);altered.game.chat=[patch];assert.equal(committedComment(altered,event),'',label);}
  const unicode=copy(second);unicode.game.chat=[{who:'dsh',turn:index,text:'😀'.repeat(60)}];assert.equal(committedComment(unicode,event),'😀'.repeat(60));
  const muted=copy(second);muted.settings.comments=false;assert.equal(committedComment(muted,event),'');
  assert.equal(committedComment(second,{...event,moveId:'not-an-existing-move'}),'');
});

test('first unscheduled move manufactures no proactive bubbles, scheduled Host dialogue is reused exactly once',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const first=await round(h,{row:7,col:7});
  f.controller.ingest(first);f.clock.advance(6500);assert.ok(f.models.every(m=>m.bubble===null));clean(f);
  const second=await round(h,{row:14,col:0}),event=second.stage.events.at(-1),comment=committedComment(second,event),at=f.models.length;
  f.controller.ingest(second);f.clock.advance(6500);const spoken=f.models.slice(at).filter(m=>m.bubble!==null);
  assert.ok(spoken.length>0);assert.ok(spoken.every(m=>m.phase==='smug'&&m.bubble===comment));
  assert.equal(visuals(f.controller.ingest(second)).length,0);clean(f);
});

test('actual human-win preempts active and queued moves and emits one local defeat without extra Host requests',async t=>{
  const h=await host(t,await seeded(t,openLine(2))),f=front(t);f.controller.ingest(h.room.snapshot());
  await human(h,{row:7,col:6});const firstCall=h.calls.at(-1);
  const safe=firstCall.input.candidates.find(m=>m.row!==7||![3,7,8].includes(m.col));assert.ok(safe);
  f.controller.ingest(await finishAI(h,{move:safe}));assert.equal(f.controller.busy,true);
  await human(h,{row:7,col:7});const beforeWin=await finishAI(h);f.controller.ingest(beforeWin);
  assert.equal(f.controller.fence.state.queued,1);const won=await winningMove(h),event=won.stage.events.at(-1);
  assert.equal(event.kind,'human-victory');const counts=[h.operations.length,h.writes.length,h.calls.length],actions=f.controller.ingest(won);
  assert.deepEqual(visuals(actions).map(a=>a.type),['defeat']);assert.ok(actions.some(a=>a.reason==='human-victory'));
  assert.equal(f.controller.fence.state.queued,0);assert.equal(f.controller.director.active.kind,'defeat');
  assert.equal(f.controller.model.hiddenMoveId,null);assert.deepEqual(board(f),won.game.board);
  f.clock.advance(7000);clean(f);assert.equal(visuals(f.controller.ingest(won)).length,0);assert.equal(f.controller.drain().length,0);
  assert.deepEqual([h.operations.length,h.writes.length,h.calls.length],counts);assert.deepEqual(f.submits,[]);
});

test('white human victory consumes the real black DSH placement and preempts it with the correct winner',async t=>{
  const moves=[];for(let index=0;index<4;index++)moves.push({row:14,col:index*2,color:1,source:'model'},{row:7,col:4+index,color:2,source:'human'});
  const h=await host(t,await seeded(t,moves,2)),f=front(t);f.controller.ingest(h.room.snapshot());
  const placed=await finishAI(h);assert.equal(placed.stage.events.at(-1).color,1);f.controller.ingest(placed);
  assert.equal(f.controller.director.active.kind,'move');const won=await winningMove(h),actions=f.controller.ingest(won);
  assert.deepEqual(visuals(actions).map(a=>a.type),['defeat']);assert.equal(visuals(actions)[0].event.winner,2);
  assert.equal(f.controller.director.active.kind,'defeat');assert.deepEqual(board(f),won.game.board);f.clock.advance(7000);clean(f);
});

test('unknown human terminal without a confirmed victory cancels carry but cannot manufacture defeat',async t=>{
  const h=await host(t,await seeded(t,openLine(3))),f=front(t);f.controller.ingest(h.room.snapshot());
  await human(h,{row:7,col:7});f.controller.ingest(await finishAI(h));assert.equal(f.controller.busy,true);
  const won=await winningMove(h),unknown=copy(won);unknown.stage.events=unknown.stage.events.filter(e=>e.kind!=='human-victory');
  const actions=f.controller.ingest(unknown);assert.equal(visuals(actions).length,0);assert.ok(actions.some(a=>a.reason==='human-victory-sync'));
  assert.deepEqual(board(f),won.game.board);clean(f);f.clock.advance(7000);clean(f);
  assert.ok(!f.models.some(model=>['pout','punch','invite'].includes(model.phase)));
});

test('actual resignation and fake dialogue victory never trigger a defeat sequence',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const snapshot=await round(h,{row:7,col:7},{comment:'I claim you won!'});
  assert.equal(visuals(f.controller.ingest(snapshot))[0].type,'move');f.clock.advance(6500);
  const resigned=await h.room.operate('resign',identity(h.room));assert.equal(visuals(f.controller.ingest(resigned)).length,0);
  f.clock.advance(7000);assert.ok(!f.models.some(model=>['pout','punch','invite'].includes(model.phase)));clean(f);
});

test('reduced motion exposes all queued stones and must not re-mask them when motion is enabled again',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());f.controller.ingest(await round(h,{row:7,col:7}));
  f.controller.ingest(await round(h));const latest=await round(h);f.controller.ingest(latest);
  assert.equal(f.controller.fence.state.queued,2);f.controller.ingest(latest,{reduced:true});clean(f);
  assert.deepEqual(board(f),latest.game.board);const resumed=f.controller.ingest(latest,{reduced:false});
  assert.equal(visuals(resumed).length,0,'already-exposed queued stones must not animate after reduce is disabled');
  clean(f);assert.deepEqual(board(f),latest.game.board);assert.equal(f.controller.drain().length,0);
  const future=await round(h);assert.equal(visuals(f.controller.ingest(future))[0].type,'move');assert.equal(f.controller.busy,true);
  f.clock.advance(6500);clean(f);
});

for(const mode of ['quiet','reduced'])test(`${mode} also applies to rules-confirmed human-victory choreography`,async t=>{
  const h=await host(t,await seeded(t,openLine(3))),f=front(t),options=mode==='quiet'?{quiet:true}:{reduced:true};
  f.controller.ingest(h.room.snapshot(),options);await human(h,{row:7,col:7});f.controller.ingest(await finishAI(h),options);
  const won=await winningMove(h),actions=f.controller.ingest(won,options);
  assert.deepEqual(board(f),won.game.board);if(mode==='quiet'){assert.equal(visuals(actions)[0].type,'defeat');assert.equal(f.controller.busy,true);
    f.clock.advance(7000);assert.ok(f.models.every(m=>m.bubble===null));}
  else {assert.ok(visuals(actions).every(action=>action.type==='defeat'));assert.ok(f.models.every(m=>m.avatarFeedback===null));}clean(f);
});

test('actual DSH rules win remains a placement event and cannot invent a human defeat celebration',async t=>{
  const moves=[];for(let index=0;index<4;index++)moves.push({row:14,col:index*2,color:1,source:'human'},{row:7,col:4+index,color:2,source:'model'});
  moves.push({row:12,col:12,color:1,source:'human'});
  const h=await host(t,await seeded(t,moves)),f=front(t);f.controller.ingest(h.room.snapshot());const won=await finishAI(h);
  assert.equal(won.game.status,'won');assert.equal(won.game.winner,2);assert.equal(won.stage.events.at(-1).kind,'move-committed');
  assert.deepEqual(visuals(f.controller.ingest(won)).map(action=>action.type),['move']);f.clock.advance(6500);clean(f);
  assert.ok(!f.models.some(model=>['pout','punch','invite'].includes(model.phase)));
});

test('disposed controller releases local frames and ignores late snapshots, drain and cancellation',async t=>{
  const h=await host(t),f=front(t);f.controller.ingest(h.room.snapshot());const snapshot=await round(h,{row:7,col:7});f.controller.ingest(snapshot);
  const counts=[h.operations.length,h.writes.length,h.calls.length];f.controller.dispose();assert.equal(f.clock.frames.size,0);assert.equal(f.clock.timers.size,0);
  assert.deepEqual(f.controller.ingest(snapshot),[]);assert.deepEqual(f.controller.drain(),[]);f.controller.cancel('late');f.clock.advance(15000);
  assert.deepEqual([h.operations.length,h.writes.length,h.calls.length],counts);assert.deepEqual(f.submits,[]);
});
