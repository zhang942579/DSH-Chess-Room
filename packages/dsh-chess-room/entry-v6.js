import {access} from 'node:fs/promises';
import {registerAvatarAssets} from './host/assets-v3.js';
import {registerStageAssets} from './host/stage-assets-v4.js';
export const inject=['connection','storageDomain','deepseekAccount','agents','tools','systemPrompt','agentDefaultModel','workspaceRegistry','sessionQuery','sessions'];
export function apply(ctx) {
  let roomPromise=null,room=null,disposed=false;
  registerAvatarAssets(ctx);registerStageAssets(ctx);
  async function getRoom() {
    if(disposed)throw Object.assign(new Error('unavailable'),{code:'unavailable'});
    if(!roomPromise) {
      try {await access(new URL('./host/ready-v6.json',import.meta.url));}
      catch {throw Object.assign(new Error('preparing'),{code:'preparing'});}
      if(!roomPromise)roomPromise=import('./host/room-v5.js').then(module=>module.createChessRoom(ctx)).then(value=>{
        if(disposed){void value.dispose();throw Object.assign(new Error('unavailable'),{code:'unavailable'});}
        room=value;return room;
      }).catch(error=>{roomPromise=null;throw error;});
    }
    return roomPromise;
  }
  const call=async(operation,payload={})=>(await getRoom()).operate(operation,payload);
  ctx.connection.fetch.register({path:'/api/dsh-chess-room',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({ok:false,code:'bad-request'},{status:415});
      const raw=await request.text();
      if(raw.length>8192)return Response.json({ok:false,code:'bad-request'},{status:413});
      let body;try {body=JSON.parse(raw);}catch {throw Object.assign(new Error('bad-request'),{code:'bad-request'});}
      if(!body||Array.isArray(body)||typeof body.operation!=='string'||(body.payload!==undefined&&(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))))throw Object.assign(new Error('bad-request'),{code:'bad-request'});
      // Catalogs and ordinary game operations share the same transport envelope.
      return Response.json({ok:true,state:await call(body.operation,body.payload)},{headers:{'cache-control':'no-store'}});
    }catch(error){
      const allowed=['bad-request','preparing','unavailable','stale','game-over','wrong-turn','illegal-move','no-undo','context-unavailable'];
      const code=allowed.includes(error?.code)?error.code:'unavailable';
      if(code==='unavailable')ctx.logger?.warn?.('DSH chess room operation failed: unavailable');
      return Response.json({ok:false,code},{status:code==='preparing'?503:400,headers:{'cache-control':'no-store'}});
    }
  }});
  const properties={
    operation:{type:'string',enum:['state','newGame','move','undo','hint','resign','chat','settings','contextCatalog','bindContext']},
    gameId:{type:'string'},version:{type:'integer',minimum:0},turnIdentity:{type:'string'},requestId:{type:'string'},
    row:{type:'integer',minimum:0,maximum:14},col:{type:'integer',minimum:0,maximum:14},playerColor:{type:'integer',enum:[1,2]},
    workspaceId:{type:['string','null'],maxLength:256,description:'Exact workspaceId from contextCatalog; null only with sessionId:null to unbind.'},
    sessionId:{type:['string','null'],maxLength:256,description:'Exact sessionId from the selected workspace catalog. Original source is strictly read-only.'},
    offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},text:{type:'string',maxLength:400},comments:{type:'boolean'},
  };
  ctx.tools.register({name:'chess_room',
    description:'Read/play the installed DSH Gomoku room. Read state first; mutations require gameId, version, turnIdentity and a fresh requestId. Rules alone validate and win on a 15×15 no-forbidden-move board; move plays the human color. The model judges independently; newGame sets playerColor. undo rewinds the latest human move; hint never moves. contextCatalog lists workspaces, then paged conversations. bindContext saves read-only history for names and style without resuming or rewriting the source. chat is bounded game talk only.',
    parameters:{type:'object',properties,required:['operation'],additionalProperties:false},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args){const {operation,...payload}=args;return call(operation,payload);},
  });
  ctx.effect(()=>async()=>{disposed=true;if(room)await room.dispose();else if(roomPromise)await roomPromise.then(value=>value.dispose(),()=>{});},'dsh-chess-room lifetime');
}
