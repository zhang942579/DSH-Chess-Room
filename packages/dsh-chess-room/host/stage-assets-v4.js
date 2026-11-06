import {readFile} from 'node:fs/promises';
import pet from '../assets/stage/whale-maid/pet.json' with {type:'json'};
export const STAGE_ASSET_BASE='/api/dsh-chess-room/stage-v4/whale-maid';
const safeName=/^[A-Za-z0-9_-]+\.(png|webp|gif|jpe?g)$/;
// Fixed paths derived only from the shipped manifest. No URL/body→filesystem path.
export function registerStageAssets(ctx,readAsset=readFile){
  const files=[['pet.json','application/json'],['chess-role.json','application/json'],['integrity.json','application/json'],['THIRD_PARTY_NOTICES.md','text/plain; charset=utf-8']];
  if(pet.renderer!=='frames2d'||pet.frames2d.dir!=='frames')throw new Error('invalid-owned-stage-pack');
  for(const [track,spec] of Object.entries(pet.frames2d.tracks)){
    if(!/^[a-z][a-z0-9-]{0,31}$/.test(track)||!Array.isArray(spec.frames))throw new Error('invalid-stage-track');
    for(const name of spec.frames){if(!safeName.test(name))throw new Error('unsafe-stage-frame');files.push([`frames/${track}/${name}`,'image/png']);}
  }
  for(const [relative,mime] of files){
    const file=new URL(`../assets/stage/whale-maid/${relative}`,import.meta.url);
    ctx.connection.fetch.register({path:`${STAGE_ASSET_BASE}/${relative}`,methods:['GET'],requestBody:'buffered',async fetch(){
      try{return new Response(await readAsset(file),{headers:{'content-type':mime,'cache-control':'private, max-age=86400','x-content-type-options':'nosniff'}});}
      catch{return Response.json({ok:false,code:'stage-asset-unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
    }});
  }
}
