// Fresh local player of the supported dsh-pet v0.4.14 frames2d manifest format.
// Reference: src/manifest-v2.ts and registry.ts at 9ed843bccee3d2604ce0ac31f55cbde9bda97c7f.
// No upstream mounted renderer/GameplayBus or sibling-plugin API is used.
export const STAGE_ASSET_BASE='/api/dsh-chess-room/stage-v4/whale-maid';
export function frameDuration(manifest,track,index) {
  const spec=manifest.frames2d.tracks[track];
  if(spec.frameMs)return spec.frameMs[index];
  const encoded=spec.frames[index].match(/_(\d+)\.[^.]+$/);
  const ms=encoded?Number(encoded[1]):NaN;
  return Number.isInteger(ms)&&ms>=16&&ms<=5000?ms:manifest.frames2d.defaultFrameMs??200;
}
export function frameAt(manifest,track,elapsed=0,depth=0) {
  if(!manifest.frames2d.tracks[track])track=manifest.frames2d.phases.idle;
  const spec=manifest.frames2d.tracks[track],times=spec.frames.map((_,i)=>frameDuration(manifest,track,i));
  const duration=times.reduce((a,b)=>a+b,0), time=Math.max(0,Number.isFinite(elapsed)?elapsed:0);
  if(spec.loop===false&&time>=duration){
    if(depth>=64){const index=spec.frames.length-1;return {track,index,name:spec.frames[index],duration:times[index]};}
    return frameAt(manifest,spec.fallback??manifest.frames2d.phases.idle,time-duration,depth+1);
  }
  let remaining=time%duration,index=0;
  while(index<times.length-1&&remaining>=times[index])remaining-=times[index++];
  return {track,index,name:spec.frames[index],duration:times[index]};
}
export function frameUrl(manifest,frame,runtimeId='') {
  const allowed=manifest.frames2d.tracks[frame.track]?.frames.includes(frame.name);
  if(!allowed)throw new Error('undeclared-frame');
  return `${STAGE_ASSET_BASE}/${manifest.frames2d.dir??''}${manifest.frames2d.dir?'/':''}${frame.track}/${frame.name}?r=${encodeURIComponent(runtimeId)}`;
}
export function motionTrack(role,manifest,phase) {
  const track=role.motions[phase]?.track;
  return manifest.frames2d.tracks[track]?track:manifest.frames2d.phases.idle;
}
export function palmAt(role,frame,facing='right') {
  const p=role.palms.right.frames[frame.track]?.[frame.index]??role.palms.right.default;
  return {x:facing==='left'?1-p.x:p.x,y:p.y};
}
