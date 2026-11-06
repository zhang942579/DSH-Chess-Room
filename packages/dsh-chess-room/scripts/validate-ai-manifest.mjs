import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

const ORIGINAL_TRACKS=['walk-right','take-stone','hold-stone','place-stone','pout-stomp','punch-small','cross-arms'];
const STONE_TRACKS=new Set(['take-stone','hold-stone','place-stone']);
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function check(value,message){if(!value)throw new Error(message);}
const finite=Number.isFinite;

/** Validate bounded local artwork declarations. This is NOT a pet/business API. */
export function validateAiManifest(metadata,{requireRefresh=false}={}){
  check(metadata?.format==='dsh-chess-ai-actions-v1','invalid AI action manifest format');
  check(metadata.canvas?.width===384&&metadata.canvas?.height===384,'AI artwork requires a common384 canvas');
  check(finite(metadata.canvas.feetY)&&metadata.canvas.feetY>=0&&metadata.canvas.feetY<384,'invalid feet baseline');
  check(metadata.tracks&&typeof metadata.tracks==='object'&&!Array.isArray(metadata.tracks),'missing action tracks');
  const keys=Object.keys(metadata.tracks);
  check(keys.length>=7&&keys.length<=8&&keys.every(k=>ORIGINAL_TRACKS.includes(k)||k==='idle'),'unexpected action track');
  check(ORIGINAL_TRACKS.every(k=>Object.hasOwn(metadata.tracks,k)),'missing original action family');
  if(requireRefresh)check(Object.hasOwn(metadata.tracks,'idle'),'refusing refresh publication without newly generated idle');
  const paths=new Map();
  for(const [track,spec] of Object.entries(metadata.tracks)){
    check(spec&&Array.isArray(spec.frames),'invalid action frames');
    const count=spec.frames.length;
    if(track==='idle')check(Number.isInteger(count)&&count>=24&&count<=96,'idle frame count outside bounded range');
    else if(track==='walk-right')check(count===8||(Number.isInteger(count)&&count>=16&&count<=64),'walk frame count outside bounded range');
    else check(count===8,'unchanged action source must retain its eight original poses');
    if(requireRefresh&&track==='idle')check(count>=48&&count<=64,'refresh idle must contain48–64 real source frames');
    if(requireRefresh&&track==='walk-right')check(count>=32&&count<=48,'refresh walk must contain32–48 real source frames');
    check(['left','right','front'].includes(spec.nativeFacing),'invalid native facing');
    check(typeof spec.loop==='boolean','invalid loop declaration');
    let total=0;
    const decodedHashes=[];
    const folders=track==='idle'?['idle','idle-ai-v2']:track==='walk-right'?['walk-right','walk-ai-v2']:[track];
    for(const [index,f] of spec.frames.entries()){
      check(f?.index===index,'nonsequential action frame index');
      check(Number.isInteger(f.duration)&&f.duration>=16&&f.duration<=2000,'invalid action frame duration');
      total+=f.duration;
      check(f.stone===null||(f.stone&&finite(f.stone.x)&&finite(f.stone.y)&&f.stone.x>=0&&f.stone.x<=384&&f.stone.y>=0&&f.stone.y<=384),'invalid baked-stone anchor');
      if(!STONE_TRACKS.has(track))check(f.stone===null,'nonstone track must not declare held stone');
      const number=String(index+1).padStart(2,'0');
      for(const role of ['path','whitePath','blackPath']){
        const path=f[role];
        check(typeof path==='string'&&/^(frames|prepared\/(white|black))\/[a-z0-9-]+\/[0-9]{2}\.png$/.test(path),'invalid declared action path');
        const normal=folders.some(folder=>path===`frames/${folder}/${number}.png`);
        const color=role==='whitePath'?'white':role==='blackPath'?'black':null;
        const prepared=color&&STONE_TRACKS.has(track)&&path===`prepared/${color}/${track}/${number}.png`;
        check(normal||prepared,'declared PNG belongs to wrong family, color, or frame');
        const hash=role==='path'?f.sha256:role==='whitePath'?f.whiteSha256:f.blackSha256;
        if(hash!==undefined)check(/^[0-9a-f]{64}$/.test(hash),'invalid declared SHA256');
        const prior=paths.get(path);
        if(prior&&hash)check(!prior.hash||prior.hash===hash,'conflicting hashes for shared PNG');
        paths.set(path,{hash:hash??prior?.hash});
      }
      if(f.decodedRgbaSha256!==undefined){
        check(/^[0-9a-f]{64}$/.test(f.decodedRgbaSha256),'invalid decoded pixel hash');
        decodedHashes.push(f.decodedRgbaSha256);
      }
      if(requireRefresh&&(track==='idle'||track==='walk-right')){
        check(/^[0-9a-f]{64}$/.test(f.sha256??''),'new frame requires normalized-byte hash');
        check(/^[0-9a-f]{64}$/.test(f.decodedRgbaSha256??''),'new frame requires decoded-RGBA hash');
      }
    }
    check(Number.isInteger(total)&&total>0&&total<=60000,'invalid total action duration');
    check(spec.durationMs===total,'action total duration disagrees with source frame durations');
    check(Array.isArray(spec.durations)&&spec.durations.length===count&&spec.durations.every((n,i)=>n===spec.frames[i].duration),'duration array disagrees with frames');
    if(requireRefresh&&(track==='idle'||track==='walk-right'))check(new Set(decodedHashes).size===count,'new sequence contains repeated decoded poses');
  }
  return {paths,trackCount:keys.length};
}

/** Read exact declared PNGs, reject escapes/symlink escapes, check IHDR and hashes. */
export async function validateAiAssets(metadata,assetDirectory,options={}){
  const declaration=validateAiManifest(metadata,options);
  const root=await realpath(assetDirectory);
  const verified=new Map();
  for(const [name,spec] of declaration.paths){
    const target=await realpath(resolve(root,name));
    const rel=relative(root,target);
    check(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'declared asset escapes owned directory');
    const info=await stat(target);
    check(info.isFile()&&info.size>=33&&info.size<=8*1024*1024,'invalid PNG file size/type');
    const bytes=await readFile(target);
    check(bytes.subarray(0,8).equals(PNG_SIGNATURE)&&bytes.toString('ascii',12,16)==='IHDR','invalid PNG header');
    check(bytes.readUInt32BE(16)===384&&bytes.readUInt32BE(20)===384&&bytes[24]===8&&bytes[25]===6,'declared PNG must be384 square8-bit RGBA');
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(spec.hash)check(sha256===spec.hash,'declared PNG hash mismatch: '+name);
    verified.set(name,{size:bytes.length,sha256});
  }
  return {...declaration,verified};
}
