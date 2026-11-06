import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateAiManifest,validateAiAssets} from '../scripts/validate-ai-manifest.mjs';
const assetRoot=new URL('../assets/actions-ai-v1/',import.meta.url);
const legacy=JSON.parse(await readFile(new URL('./fixtures/actions-1.2.0.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(legacy);
// Metadata-only fixtures below are NOT authored images or generation evidence.
function refreshFixture(){
  const m=clone();
  function sequence(track,count,duration,folder){
    const frames=Array.from({length:count},(_,index)=>{
      const path=`frames/${folder}/${String(index+1).padStart(2,'0')}.png`;
      const hash=createHash('sha256').update('TEST-FIXTURE-ONLY:'+track+':'+index).digest('hex');
      return {index,name:String(index+1).padStart(2,'0'),duration,path,whitePath:path,blackPath:path,stone:null,stoneRemoved:false,sha256:hash,decodedRgbaSha256:hash};
    });
    return {label:track,loop:true,nativeFacing:track==='idle'?'front':'left',frames,durations:frames.map(f=>f.duration),durationMs:count*duration};
  }
  m.tracks['walk-right']=sequence('walk-right',32,50,'walk-ai-v2');
  m.tracks.idle=sequence('idle',48,80,'idle-ai-v2');
  return m;
}

test('legacy archive remains a valid bounded seven-family declaration',()=>{
  const result=validateAiManifest(clone());assert.equal(result.trackCount,7);assert(result.paths.size>=80);
});
test('publication fails closed while genuine idle is absent',()=>{
  assert.throws(()=>validateAiManifest(clone(),{requireRefresh:true}),/without newly generated idle/);
});
test('metadata-only48-idle32-walk fixture validates family/path/count rules',()=>{
  const result=validateAiManifest(refreshFixture(),{requireRefresh:true});assert.equal(result.trackCount,8);
});
test('repeated decoded poses cannot satisfy refresh publication',()=>{
  const m=refreshFixture();m.tracks.idle.frames[1].decodedRgbaSha256=m.tracks.idle.frames[0].decodedRgbaSha256;
  assert.throws(()=>validateAiManifest(m,{requireRefresh:true}),/repeated decoded poses/);
});
test('new source requires independently recorded normalized and decoded hashes',()=>{
  const m=refreshFixture();delete m.tracks.idle.frames[0].sha256;
  assert.throws(()=>validateAiManifest(m,{requireRefresh:true}),/normalized-byte hash/);
});
test('reject traversal, Windows separators, remote URLs and wrong filenames',()=>{
  for(const path of ['frames/idle-ai-v2/../01.png','frames\\idle-ai-v2\\01.png','https://example.invalid/01.png','frames/idle-ai-v2/00.png','frames/idle-ai-v2/02.png']){
    const m=refreshFixture();m.tracks.idle.frames[0].path=path;
    assert.throws(()=>validateAiManifest(m),/path|family/);
  }
});
test('black prepared color cannot resolve to a white prepared declaration',()=>{
  const m=clone();m.tracks['take-stone'].frames[0].blackPath='prepared/white/take-stone/01.png';
  assert.throws(()=>validateAiManifest(m),/wrong family, color/);
});
test('frame numbering, duration totals and bounded frame counts are enforced',()=>{
  let m=refreshFixture();m.tracks.idle.frames[0].index=1;assert.throws(()=>validateAiManifest(m),/nonsequential/);
  m=refreshFixture();m.tracks.idle.frames[0].duration=15;assert.throws(()=>validateAiManifest(m),/duration/);
  m=refreshFixture();m.tracks.idle.durationMs++;assert.throws(()=>validateAiManifest(m),/total duration/);
  m=refreshFixture();m.tracks['cross-arms'].frames.push({...m.tracks['cross-arms'].frames[0]});assert.throws(()=>validateAiManifest(m),/eight original poses/);
});
test('idle/walk cannot accidentally declare a chess stone',()=>{
  const m=refreshFixture();m.tracks.idle.frames[0].stone={x:10,y:10};
  assert.throws(()=>validateAiManifest(m),/must not declare held stone/);
});
test('unknown tracks, invalid canvas/facing and out-of-bounds stone fail closed',()=>{
  let m=clone();m.tracks.invented=m.tracks['cross-arms'];assert.throws(()=>validateAiManifest(m),/unexpected action track/);
  m=clone();m.canvas.width=512;assert.throws(()=>validateAiManifest(m),/canvas/);
  m=clone();m.tracks['walk-right'].nativeFacing='up';assert.throws(()=>validateAiManifest(m),/native facing/);
  m=clone();m.tracks['take-stone'].frames[0].stone={x:500,y:20};assert.throws(()=>validateAiManifest(m),/stone anchor/);
});
test('actual original declared files remain384-square8-bitRGBA within owned root',async()=>{
  const result=await validateAiAssets(clone(),fileURLToPath(assetRoot));
  assert.equal(result.verified.size,result.paths.size);assert(result.verified.size>=80);
});
test('metadata-only fixtures cannot stand in for missing physical generated artwork',async()=>{
  await assert.rejects(validateAiAssets(refreshFixture(),fileURLToPath(assetRoot),{requireRefresh:true}),/ENOENT/);
});
