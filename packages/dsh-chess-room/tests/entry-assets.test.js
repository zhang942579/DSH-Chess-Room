import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {apply} from '../entry-v3.js';
import {registerAvatarAssets,AVATAR_BASE} from '../host/assets.js';
const states=['idle','thinking','smug','surprised','troubled','victory','defeat'];
function assetRoutes(){const routes=[];registerAvatarAssets({connection:{fetch:{register(route){routes.push(route);}}}});return routes;}

test('avatar routes are a fixed authenticated-Connection whitelist, never a filesystem wildcard',()=>{
  const routes=assetRoutes();
  assert.equal(routes.length,14);assert.equal(new Set(routes.map(route=>route.path)).size,14);
  for(const state of states)for(const format of ['png','webp']) {
    const route=routes.find(route=>route.path===`${AVATAR_BASE}/${state}.${format}`);
    assert.deepEqual(route.methods,['GET']);assert.equal(route.requestBody,'buffered');
  }
  assert.ok(routes.every(route=>!route.path.includes('*')&&!route.path.includes(':')));
});
test('native GET Request transport stays bodyless, unlike the missing-mode streaming fallback',async()=>{
  const streamedBody=new ReadableStream({start(controller){controller.close();}});
  assert.throws(()=>new Request('http://127.0.0.1/api/avatar.png',{method:'GET',body:streamedBody,duplex:'half'}),TypeError);
  for(const route of assetRoutes()) {
    assert.equal(route.requestBody,'buffered','the installed HTTP bridge selects bodyless empty GET construction only in buffered mode');
    const request=new Request(`http://127.0.0.1${route.path}?r=transport-regression`,{method:'GET'});
    assert.equal(request.body,null);
    assert.equal(new URL(request.url).pathname,route.path);
    const response=await route.fetch(request);
    assert.equal(response.status,200);
    assert.ok((await response.arrayBuffer()).byteLength>0);
  }
});
test('fresh release entry retains buffered mutations and dedicated tools beside read-only avatar routes',async()=>{
  const routes=[],effects=[];let tool;
  apply({connection:{fetch:{register(route){routes.push(route);}}},tools:{register(value){tool=value;}},logger:{warn(){}},effect(factory){effects.push(factory());}});
  assert.equal(routes.length,15);
  const action=routes.find(route=>route.path==='/api/dsh-chess-room');
  assert.deepEqual(action.methods,['POST']);assert.equal(action.requestBody,'buffered');
  assert.equal(tool.name,'chess_room');assert.equal(tool.parameters.properties.text.maxLength,400);
  assert.equal(tool.parameters.additionalProperties,false);
  for(const dispose of effects.reverse())await dispose();
});
test('missing avatar returns non-cacheable unavailability, never a filesystem error or fake image',async()=>{
  const routes=[];registerAvatarAssets({connection:{fetch:{register(route){routes.push(route);}}}},async()=>{throw new Error('private-host-path');});
  const response=await routes[0].fetch();
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{ok:false,code:'avatar-unavailable'});
});
test('PNG avatar responses preserve real bytes, private caching and a safe content type',async()=>{
  const route=assetRoutes().find(route=>route.path===`${AVATAR_BASE}/idle.png`),response=await route.fetch();
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.ok(response.headers.get('cache-control').startsWith('private,'));
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16),448);assert.equal(bytes.readUInt32BE(20),448);
  assert.ok(bytes.equals(await readFile(new URL('../assets/expressions/idle.png',import.meta.url))));
});
test('every state serves animated-alpha WebP and a real static PNG, without initializing the game',async()=>{
  for(const route of assetRoutes()) {
    const response=await route.fetch();assert.equal(response.status,200,route.path);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(route.path.endsWith('.webp')) {
      assert.equal(response.headers.get('content-type'),'image/webp');
      assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
      assert.equal(bytes.subarray(12,16).toString(),'VP8X');
      assert.ok(bytes[20]&2,'actual animation bit');assert.ok(bytes[20]&16,'alpha bit');
    }else assert.equal(bytes.subarray(1,4).toString(),'PNG');
  }
});
test('expression manifest matches seven looped downloadable state files',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/expressions/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(manifest.expressions).sort(),states.toSorted());
  for(const state of states) {
    const entry=manifest.expressions[state];
    assert.ok(entry.frameCount>1);assert.ok(entry.durationMs>0);assert.equal(entry.loop,0);
    for(const format of ['png','webp','gif'])assert.equal(entry[format],`${state}.${format}`);
    const gif=await readFile(new URL(`../assets/expressions/${state}.gif`,import.meta.url));
    assert.equal(gif.subarray(0,6).toString(),'GIF89a');
  }
});
