import manifest from '../assets/actions-ai-v1/manifest.json' with {type:'json'};

export const AI_RELEASE='1.3.0';
export const AI_MANIFEST=manifest;
export const AI_TIME_SCALE=1.4;
// This local presentation format is not pet.json or a sibling gameplay API.
// Preserve original source durations; scale the presentation clock exactly once.
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const frames=name=>manifest.tracks[name].frames;
const duration=name=>sum(frames(name).map(f=>f.duration));
export const aiPresentationMs=ms=>Math.round(ms*AI_TIME_SCALE);
export const aiSourceElapsed=(elapsed,timeScale=AI_TIME_SCALE)=>
  Math.max(0,Number.isFinite(elapsed)?elapsed:0)/(Number.isFinite(timeScale)&&timeScale>0?timeScale:AI_TIME_SCALE);
export const PUNCH_SOURCE_INDICES=Object.freeze([0,1,2,3,4,6,7]);
export const PUNCH_TIMES=Object.freeze([80,80,130,110,100,80,70]);
export const PUNCH_SOURCE_DURATION=sum(PUNCH_TIMES);
export const PUNCH_DURATION=aiPresentationMs(PUNCH_SOURCE_DURATION);
export const PUNCH_CONTACT=aiPresentationMs(160);
export const PLACE_RELEASE=aiPresentationMs(sum(frames('place-stone').slice(0,5).map(f=>f.duration)));
export const PICKUP_CONTACT=aiPresentationMs(sum(frames('take-stone').slice(0,4).map(f=>f.duration)));
export const AI_SOURCE_MOVE=Object.freeze([
  ['thinking',550,'thinking'],['pickup',duration('take-stone'),'pickup'],
  ['carrying',duration('hold-stone'),'carry'],['placing',duration('place-stone'),'place'],
  ['smug',700,'smug'],['retreat',1650,'walk']
].map(Object.freeze));
export const AI_SOURCE_DEFEAT=Object.freeze([
  ['pout',300,'pout'],['stomp',duration('pout-stomp')-300,'stomp'],
  ['run-avatar',1500,'walk'],['punch',PUNCH_SOURCE_DURATION,'punch'],
  ['punch',PUNCH_SOURCE_DURATION,'punch'],['punch',PUNCH_SOURCE_DURATION,'punch'],
  ['arms-crossed',duration('cross-arms'),'arms-crossed'],['invite',650,'invite'],
  ['retreat',1400,'walk']
].map(Object.freeze));
const presentation=sequence=>Object.freeze(sequence.map(([phase,ms,track])=>Object.freeze([phase,aiPresentationMs(ms),track])));
export const AI_MOVE=presentation(AI_SOURCE_MOVE);
export const AI_DEFEAT=presentation(AI_SOURCE_DEFEAT);
export const AI_RELEASE_AT=sum(AI_MOVE.slice(0,3).map(s=>s[1]))+PLACE_RELEASE;
export const AI_HOLD_AT=AI_MOVE[0][1]+PICKUP_CONTACT;
// Idle is optional until the genuine generated manifest/assets are supplied.
export function hasAiIdleTrack(metadata=manifest){
  const idle=metadata.tracks?.idle;
  return !!idle&&Array.isArray(idle.frames)&&idle.frames.length>=1&&idle.frames.length<=128
    &&idle.frames.every(f=>Number.isInteger(f.duration)&&f.duration>=16)
    &&sum(idle.frames.map(f=>f.duration))<=60000;
}
export const AI_HAS_IDLE=hasAiIdleTrack();
const phaseTracks={idle:'idle',pickup:'take-stone',carrying:'hold-stone',placing:'place-stone',pout:'pout-stomp',stomp:'pout-stomp',punch:'punch-small','arms-crossed':'cross-arms',retreat:'walk-right','run-avatar':'walk-right',roam:'walk-right'};
function indexAt(times,elapsed,loop=false){
  const total=sum(times);let t=Math.max(0,Number.isFinite(elapsed)?elapsed:0);
  t=loop?t%total:Math.min(t,total-0.001);
  let index=0;while(index<times.length-1&&t>=times[index])t-=times[index++];return index;
}
// Every pose/anchor uses the SAME director source clock, never a timer or ACK.
export function sampleAiAction(model,metadata=manifest){
  if(model?.actionClock!=='dsh-chess-ai-v1')return null;
  let time=aiSourceElapsed(model.phaseElapsed,model.timeScale??AI_TIME_SCALE);
  // Late shoe/stone frames remain preserved; switch artwork at handover.
  if(model.phase==='placing'&&time>=PLACE_RELEASE/AI_TIME_SCALE)return null;
  const track=phaseTracks[model.phase],spec=metadata.tracks[track];
  if(!spec||(track==='idle'&&!hasAiIdleTrack(metadata)))return null;
  if(model.phase==='stomp')time+=300;
  const index=model.phase==='punch'?PUNCH_SOURCE_INDICES[indexAt(PUNCH_TIMES,time)]
    :indexAt(spec.frames.map(f=>f.duration),time,track==='idle'||spec.loop);
  const frame=spec.frames[index];
  const directional=track==='walk-right'||track==='punch-small';
  const nativeFacing=track==='punch-small'?'right':spec.nativeFacing;
  const mirror=directional&&nativeFacing!=='front'&&model.facing!==nativeFacing;
  const point=frame.stone,canvas=metadata.canvas;
  const cycle=track==='idle'?Math.floor(time/sum(spec.frames.map(f=>f.duration))):0;
  return {track,index,frame,mirror,cycleKey:`${model.eventId??(track==='idle'?'idle:'+model.ambientEpoch:'roam')}:${model.segmentIndex??0}:${cycle}`,
    stone:point?{x:(mirror?canvas.width-point.x:point.x)/canvas.width,y:point.y/canvas.height}:null};
}
const releasePoint=frames('place-stone')[4].stone;
if(!releasePoint)throw new Error('AI place contact anchor is required');
export const AI_ACTION_PROFILE=Object.freeze({
  move:AI_MOVE,defeat:AI_DEFEAT,releaseAt:AI_RELEASE_AT,holdAt:AI_HOLD_AT,timeScale:AI_TIME_SCALE,
  watchdogGraceMs:2000,roamMs:aiPresentationMs(1700),
  ambient:AI_HAS_IDLE?Object.freeze({durationMs:aiPresentationMs(duration('idle'))}):null,
  releasePalm:Object.freeze({x:releasePoint.x/manifest.canvas.width,y:releasePoint.y/manifest.canvas.height}),
  placementMs:PLACE_RELEASE,punchContact:PUNCH_CONTACT,punchFeedbackEnd:aiPresentationMs(400),
  palm(phase,elapsed,facing){
    return sampleAiAction({phase,phaseElapsed:elapsed,facing,timeScale:AI_TIME_SCALE,actionClock:'dsh-chess-ai-v1'})?.stone??this.releasePalm;
  }
});
