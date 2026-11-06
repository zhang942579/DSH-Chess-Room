import {randomUUID} from 'node:crypto';
import {gomokuAdapter} from './rules.js';
import {generateCandidates} from './engine.js';
import {createDshPlayer} from './dsh-player-v2.js';
import {createStorage} from './persistence.js';
import {createAccount} from './account.js';
import {expressionFor,fallbackComment} from './character-v2.js';
import {dialogueRequest,consumePlayerChat,requestsQuiet,normalizeComment,factSafeComment,distinctComment} from './dialogue.js';

const clone = value => structuredClone(value);
const fail = code => {throw Object.assign(new Error(code),{code});};
const difficulties=['easy','normal','hard'];
function createGame(version=0, playerColor=1, difficulty='normal', requestIds=[]) {
  return {id:randomUUID(), adapter:'gomoku', version, turnIdentity:randomUUID(), playerColor,difficulty,
    board:gomokuAdapter.initialBoard(),moves:[],turn:1,status:'playing',winner:null,winningLine:[],
    chat:[],sessionId:null,requestIds:requestIds.slice(-512),hint:null,lastSource:null,lastReason:null,
    settings:{comments:true},createdAt:Date.now(),updatedAt:Date.now()};
}
function validateSaved(game) {
  const text=(v,max=128)=>typeof v==='string'&&v.length>0&&v.length<=max;
  if(!game||game.adapter!=='gomoku'||!text(game.id)||!Number.isSafeInteger(game.version)||game.version<0
    ||!['playing','won','draw','resigned'].includes(game.status)||![1,2].includes(game.playerColor)
    ||!difficulties.includes(game.difficulty)||!Array.isArray(game.moves)||game.moves.length>225
    ||!Array.isArray(game.chat)||game.chat.length>60||!Array.isArray(game.requestIds)||game.requestIds.length>512
    ||!game.requestIds.every(v=>text(v))||new Set(game.requestIds).size!==game.requestIds.length||!text(game.turnIdentity)
    ||!game.settings||typeof game.settings.comments!=='boolean'
    ||!Number.isFinite(game.createdAt)||!Number.isFinite(game.updatedAt)
    ||(game.sessionId!==null&&(typeof game.sessionId!=='string'||!/^chess-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(game.sessionId)))) fail('unavailable');
  for(const m of game.moves)if(!m||!['human','model','engine',undefined].includes(m.source))fail('unavailable');
  for(const m of game.chat) {
    if(!m||!text(m.id)||!['player','dsh','system'].includes(m.who)||!Number.isFinite(m.at)
      ||(m.who==='system'?m.key!=='recovered':!text(m.text,m.who==='dsh'?480:400))
      ||(m.who==='dsh'&&[...m.text].length>240)
      ||(m.turn!==undefined&&(!Number.isInteger(m.turn)||m.turn<(m.who==='player'?0:1)||m.turn>225)))fail('unavailable');
  }
  let replay;try{replay=gomokuAdapter.replay(game.moves);}catch{fail('unavailable');}
  if(JSON.stringify(game.board)!==JSON.stringify(replay.board)) fail('unavailable');
  if(game.status==='resigned') {
    if(replay.over||game.winner!==3-game.playerColor||game.turn!==null) fail('unavailable');
  } else if(game.status!==replay.status||game.winner!==replay.winner||game.turn!==replay.nextColor) fail('unavailable');
  const restored=clone(game);
  restored.winningLine=game.status==='resigned'?[]:replay.winningLine;
  restored.hint=null;
  return restored;
}
function addMove(game, move, source, reason) {
  const color=game.turn;
  game.board=gomokuAdapter.applyMove(game.board,move,color);
  game.moves.push({row:move.row,col:move.col,color,source});
  const outcome=gomokuAdapter.evaluate(game.board,move);
  game.status=outcome.status;game.winner=outcome.winner;game.winningLine=outcome.winningLine;game.turn=outcome.nextColor;
  game.lastSource=source;game.lastReason=reason||null;game.hint=null;
}

// Both browser tabs and the native tool may hit the lazy entry simultaneously.
// Share one construction promise per live plugin context, not two authorities.
const liveRooms=new WeakMap();
export function createChessRoom(ctx,options={}) {
  if(Object.keys(options).length)return buildChessRoom(ctx,options);
  let pending=liveRooms.get(ctx);
  if(!pending){pending=buildChessRoom(ctx,options).catch(error=>{liveRooms.delete(ctx);throw error;});liveRooms.set(ctx,pending);}
  return pending;
}
/** Sole board mutator. Dependencies can be replaced only by pure test fixtures. */
async function buildChessRoom(ctx, options={}) {
  const store=options.store||await createStorage(ctx);
  const runtimeId=randomUUID();
  let data=store.read();
  if(!data||data.format!==1||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.archived)
    ||(data.current!==null&&(!data.current||typeof data.current!=='object')))fail('unavailable');
  data.archived=data.archived.map(validateSaved).slice(-6);
  let disposed=false,task=null,tail=Promise.resolve(),viewRevision=data.revision;
  let profile={id:null,identityRevision:0,name:null,avatarUrl:null,signedIn:false},locale='zh';
  const recovery=data.current!==null;
  if(data.current) {
    data.current=validateSaved(data.current);
    data.current.turnIdentity=randomUUID();data.current.version++;
    data.current.hint=null;
    data.current.chat.push({id:randomUUID(),who:'system',key:'recovered',at:Date.now()});
    data.current.chat=data.current.chat.slice(-60);
  } else data.current=createGame();
  // First initialization and restart invalidation are durable before exposure.
  data.revision++;await store.write(data);viewRevision=data.revision;
  const player=options.player||createDshPlayer(ctx,{timeoutMs:15000});

  function enqueue(fn) {const run=tail.then(fn);tail=run.catch(()=>{});return run;}
  function invalidate() {const old=task;task=null;if(old)old.abort.abort(new Error('game invalidated'));}
  async function commit(next, requestId=null) {
    next.revision=data.revision+1;
    next.current.version=data.current.version+1;next.current.turnIdentity=randomUUID();next.current.updatedAt=Date.now();
    if(requestId)next.current.requestIds=[...next.current.requestIds,requestId].slice(-512);
    next.current.chat=next.current.chat.slice(-60);
    await store.write(next); // Board/identity/settings never advance on disk failure; quiet may already have cancelled speech.
    invalidate();data=next;viewRevision=Math.max(viewRevision+1,data.revision);
  }
  function sameTurn(expected) {
    const g=data.current;return !disposed&&task===expected&&!expected.abort.signal.aborted
      &&g.id===expected.input.gameId&&g.version===expected.input.version&&g.turnIdentity===expected.input.turnIdentity
      &&expected.input.requestId===expected.requestId&&!g.requestIds.includes(expected.requestId)
      &&g.status==='playing'&&g.turn!==g.playerColor;
  }
  function snapshot() {
    return clone({release:'1.0.2',runtimeId,revision:viewRevision,game:data.current,profile,settings:data.current.settings,
      aiThinking:!!task,expression:expressionFor(data.current,!!task),hint:data.current.hint,
      savedGames:data.archived.map(g=>({id:g.id,adapter:g.adapter,moves:g.moves,status:g.status,winner:g.winner,playerColor:g.playerColor,updatedAt:g.updatedAt})),
      recovery});
  }
  function addTerminalComment(g) {
    if(!g.settings.comments||g.status==='playing')return;
    const text=normalizeComment(fallbackComment(g,null,locale),{commentsAllowed:true,replyMode:'normal'});
    if(text)g.chat.push({id:randomUUID(),who:'dsh',text,at:Date.now(),...(g.moves.length?{turn:g.moves.length}:{})});
    consumePlayerChat(g);
  }
  function setComments(g,enabled) {
    g.settings.comments=enabled;
    if(!enabled) {
      // Silence cancels immediately, including while its durable write is pending.
      // No board/settings memory is exposed before commit; disk failure still propagates.
      consumePlayerChat(g);invalidate();
    }
  }
  function ensureAI() {
    const g=data.current;
    if(disposed||task||g.status!=='playing'||g.turn===g.playerColor)return;
    const candidates=generateCandidates(g.board,g.turn,g.difficulty);
    if(!candidates.length)return;
    const dialogue=dialogueRequest(g);
    const expected={abort:new AbortController(),replyIds:dialogue.replyIds,input:{sessionId:g.sessionId,gameId:g.id,version:g.version,
      turnIdentity:g.turnIdentity,requestId:randomUUID(),board:clone(g.board),color:g.turn,difficulty:g.difficulty,
      candidates:clone(candidates),chat:dialogue.chat,facts:dialogue.facts,
      locale,commentsAllowed:dialogue.commentsAllowed,replyMode:dialogue.replyMode,commentLimit:dialogue.commentLimit}};
    expected.requestId=expected.input.requestId;
    task=expected;viewRevision++;
    // Model work never holds the mutation queue. Every result re-enters it.
    expected.done=(async()=>{
      let result;
      try {result=await player.choose(expected.input,expected.abort.signal);}
      catch(error) {if(expected.abort.signal.aborted||disposed)return;result={move:candidates[0],source:'engine',comment:'',failureCode:typeof error?.code==='string'?error.code:'MODEL_FAILED'};}
      await enqueue(async()=>{
        if(!sameTurn(expected))return;
        let chosen=candidates.find(m=>m.row===result?.move?.row&&m.col===result?.move?.col),source=result?.source==='model'?'model':'engine';
        if(!chosen||!gomokuAdapter.isLegal(data.current.board,chosen,data.current.turn)){chosen=candidates[0];source='engine';}
        if(!gomokuAdapter.isLegal(data.current.board,chosen,data.current.turn))return;
        const next=clone(data),g=next.current;
        addMove(g,chosen,source,chosen.reason);
        g.lastFallbackReason=source==='engine'?(result.failureCode||'INVALID_CANDIDATE'):null;
        if(source==='model'&&typeof result.sessionId==='string'&&/^chess-room-[0-9a-f-]+$/i.test(result.sessionId))g.sessionId=result.sessionId;
        consumePlayerChat(g,expected.replyIds);
        if(g.status!=='playing') addTerminalComment(g);
        else if(g.settings.comments&&expected.input.commentsAllowed) {
          const comment=source==='model'?distinctComment(factSafeComment(normalizeComment(result.comment,expected.input),expected.input),g):'';
          const text=comment||distinctComment(normalizeComment(fallbackComment(g,chosen.reason,locale),expected.input),g);
          if(text)g.chat.push({id:randomUUID(),who:'dsh',text,at:Date.now(),turn:g.moves.length});
        }
        await commit(next,expected.input.requestId);ensureAI();
      });
    })().catch(error=>{
      if(task===expected){task=null;viewRevision++;}
      ctx.logger?.warn?.('DSH chess-room AI commit failed: %s',String(error?.message));
    });
  }
  function validateMutation(payload) {
    if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('bad-request');
    const g=data.current;
    if(payload.gameId!==g.id||payload.version!==g.version||payload.turnIdentity!==g.turnIdentity)fail('stale');
    if(typeof payload.requestId!=='string'||!payload.requestId||payload.requestId.length>128)fail('bad-request');
    if(g.requestIds.includes(payload.requestId))fail('stale');
  }
  async function operate(operation,payload={}) {
    if(disposed)fail('unavailable');
    if(operation==='state') {
      if(typeof payload.locale==='string'&&payload.locale.length<=32) {
        locale=payload.locale.toLowerCase();
        if(account?.setMetadata)void account.setMetadata({locale,timezoneOffsetSeconds:Number.isFinite(payload.timezoneOffsetSeconds)?payload.timezoneOffsetSeconds:0}).catch(()=>{});
      }
      await tail;ensureAI();return snapshot();
    }
    return enqueue(async()=>{
      if(disposed)fail('unavailable');validateMutation(payload);
      const next=clone(data),g=next.current;
      switch(operation) {
        case 'newGame': {
          const color=payload.playerColor??g.playerColor,difficulty=payload.difficulty??g.difficulty;
          if(![1,2].includes(color)||!difficulties.includes(difficulty))fail('bad-request');
          next.archived=[...next.archived,g].filter(v=>v.moves.length).slice(-6);
          next.current=createGame(g.version,color,difficulty,g.requestIds);next.current.settings=clone(g.settings);
          break;
        }
        case 'move':
          if(g.status!=='playing')fail('game-over');
          if(g.turn!==g.playerColor)fail('wrong-turn');
          if(!gomokuAdapter.isLegal(g.board,{row:payload.row,col:payload.col},g.playerColor))fail('illegal-move');
          addMove(g,{row:payload.row,col:payload.col},'human',null);
          if(g.status!=='playing')addTerminalComment(g);break;
        case 'undo': {
          let index=-1;for(let i=g.moves.length-1;i>=0;i--)if(g.moves[i].color===g.playerColor){index=i;break;}
          if(index<0)fail('no-undo');
          const replay=gomokuAdapter.replay(g.moves.slice(0,index));
          g.board=replay.board;g.moves=g.moves.slice(0,index);g.status=replay.status;g.winner=replay.winner;g.turn=replay.nextColor;g.winningLine=replay.winningLine;
          g.chat=g.chat.filter(m=>m.who!=='dsh'||!Number.isInteger(m.turn)||m.turn<=index);
          // Undo invalidates conversational requests too, never resurrecting old replies.
          consumePlayerChat(g);
          g.hint=null;g.lastSource=g.moves.at(-1)?.source||null;g.lastReason=null;break;
        }
        case 'hint': {
          if(g.status!=='playing')fail('game-over');if(g.turn!==g.playerColor)fail('wrong-turn');
          const candidates=generateCandidates(g.board,g.playerColor,g.difficulty);
          g.hint=candidates.length?{row:candidates[0].row,col:candidates[0].col}:null;break;
        }
        case 'resign':
          if(g.status!=='playing')fail('game-over');g.status='resigned';g.winner=3-g.playerColor;g.turn=null;g.winningLine=[];g.hint=null;
          addTerminalComment(g);break;
        case 'chat': {
          if(typeof payload.text!=='string'||payload.text.length>400)fail('bad-request');
          const text=payload.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
          if(!text)fail('bad-request');
          if(requestsQuiet(text))setComments(g,false);
          const turn=g.settings.comments&&g.status==='playing'?Math.min(225,g.moves.length+(g.turn===g.playerColor?2:1)):0;
          g.chat.push({id:randomUUID(),who:'player',text,at:Date.now(),turn});break;
        }
        case 'settings':
          if(typeof payload.comments!=='boolean')fail('bad-request');setComments(g,payload.comments);break;
        default: fail('bad-request');
      }
      await commit(next,payload.requestId);ensureAI();return snapshot();
    });
  }
  const account=options.account||createAccount(ctx, nextProfile=>{
    if(disposed)return;
    const changed=profile.id!==nextProfile.id||profile.signedIn!==nextProfile.signedIn;
    profile=clone(nextProfile);viewRevision++;
    if(changed) {
      invalidate();
      void enqueue(async()=>{
        if(disposed)return;
        // Switching accounts never lets an older model/profile callback commit.
        const next=clone(data);next.current.sessionId=null;await commit(next);ensureAI();
      }).catch(error=>ctx.logger?.warn?.('Chess account transition failed: %s',String(error?.message)));
    }
  });
  if(account.snapshot)profile=clone(account.snapshot);
  if(account.refresh)void account.refresh().catch(()=>{});

  // The owned native tool shares exactly the UI controller. Normalize its renderer
  // after the lazy modules become available; no other plugin's tool is touched.
  const tool=ctx.tools?.get?.('chess_room');
  if(tool&&tool.description?.includes('installed DSH Gomoku room'))tool.output.render=(_args,value)=>{
    const s=value,g=s.game;
    return [{type:'text',text:JSON.stringify({gameId:g.id,version:g.version,turnIdentity:g.turnIdentity,
      playerColor:g.playerColor,difficulty:g.difficulty,status:g.status,turn:g.turn,winner:g.winner,
      aiThinking:s.aiThinking,board:g.board,lastMove:g.moves.at(-1)||null,moveCount:g.moves.length,lastFallbackReason:g.lastFallbackReason||null,
      profile:{name:s.profile.name,signedIn:s.profile.signedIn},hint:s.hint,comments:s.settings.comments,
      recentChat:g.chat.slice(-4),savedGames:s.savedGames.map(v=>({id:v.id,moveCount:v.moves.length,status:v.status}))})}];
  };
  ensureAI();
  return {operate,snapshot,async dispose(){
    if(disposed)return;disposed=true;invalidate();await tail;
    await account.dispose?.();await player.dispose?.();await store.close?.();liveRooms.delete(ctx);
  }};
}
