import { access } from 'node:fs/promises';
import { registerAvatarAssets } from './host/assets.js';

export const inject = ['connection', 'storageDomain', 'deepseekAccount', 'agents', 'tools', 'systemPrompt', 'agentDefaultModel'];
export function apply(ctx) {
  let roomPromise = null, room = null, disposed = false;
  registerAvatarAssets(ctx);
  // A fresh entry URL and dialogue-module generation avoid old ESM instances.
  // Installation still has to report live application; this is not a Web server.
  async function getRoom() {
    if (disposed) throw Object.assign(new Error('room disposed'), {code:'unavailable'});
    if (!roomPromise) {
      try { await access(new URL('./host/ready.json', import.meta.url)); }
      catch { throw Object.assign(new Error('room preparing'), {code:'preparing'}); }
      if (!roomPromise) roomPromise = import('./host/room-v2.js').then(m => m.createChessRoom(ctx)).then(value => {
        if (disposed) { void value.dispose(); throw new Error('room disposed'); }
        room = value; return room;
      }).catch(error => { roomPromise = null; throw error; });
    }
    return roomPromise;
  }
  const call = async (operation, payload = {}) => (await getRoom()).operate(operation, payload);
  ctx.connection.fetch.register({
    path: '/api/dsh-chess-room', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ok:false,code:'bad-request'}, {status:415});
        const raw = await request.text();
        if (raw.length > 8192) return Response.json({ok:false,code:'bad-request'}, {status:413});
        let body;
        try { body = JSON.parse(raw); } catch { throw Object.assign(new Error('bad request'), {code:'bad-request'}); }
        if (!body || Array.isArray(body) || typeof body.operation !== 'string' || (body.payload !== undefined && (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)))) throw Object.assign(new Error('bad request'), {code:'bad-request'});
        const state = await call(body.operation, body.payload);
        return Response.json({ok:true,state}, {headers:{'cache-control':'no-store'}});
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'unavailable';
        if (code === 'unavailable') ctx.logger.warn('DSH chess room operation failed: %s', String(error?.message));
        return Response.json({ok:false,code}, {status:code==='preparing'?503:400, headers:{'cache-control':'no-store'}});
      }
    },
  });
  const properties = {
    operation:{type:'string',enum:['state','newGame','move','undo','hint','resign','chat','settings']},
    gameId:{type:'string'}, version:{type:'integer',minimum:0}, turnIdentity:{type:'string'}, requestId:{type:'string'},
    row:{type:'integer',minimum:0,maximum:14}, col:{type:'integer',minimum:0,maximum:14},
    playerColor:{type:'integer',enum:[1,2]}, difficulty:{type:'string',enum:['easy','normal','hard']},
    text:{type:'string',maxLength:400}, comments:{type:'boolean'},
  };
  ctx.tools.register({
    name:'chess_room', description:'Read or operate the installed DSH Gomoku room. First call state. All mutations require its gameId, version, turnIdentity and a fresh requestId; stale requests are rejected. Black starts on a 15×15 no-forbidden-move board; rules alone validate/win. move plays only the human color. newGame accepts playerColor and easy/normal/hard. undo returns to before the latest human move. hint never changes the board. Chat is bounded game talk, not general task execution.',
    parameters:{type:'object',properties,required:['operation'],additionalProperties:false},
    output:{schema:{type:'object',additionalProperties:true},render: (_args, value) => [{type:'text',text:JSON.stringify(value)}]},
    async execute(args) { const {operation,...payload}=args; return call(operation,payload); },
  });
  ctx.effect(() => async () => { disposed = true; if (room) await room.dispose(); else if(roomPromise) await roomPromise.then(value=>value.dispose(),()=>{}); }, 'dsh-chess-room lifetime');
}
