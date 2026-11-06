import {randomUUID} from 'node:crypto';
import {gomokuAdapter} from './rules.js';
import {generateCandidates} from './engine.js';
import {createDshPlayer} from './dsh-player-v3.js';
import {createStorage,createStage,validateSavedGame,envelopeSchema,STAGE_EVENT_LIMIT} from './persistence-v5.js';
import {createContextBinding,parseSelection,unboundSelection,boundedMessages,MEMORY_LIMITS} from './context-binding.js';
import {createAccount} from './account.js';
import {expressionFor,fallbackComment} from './character-v2.js';
import {dialogueRequest,consumePlayerChat,requestsQuiet,normalizeComment,factSafeComment,distinctComment} from './dialogue.js';

const clone = value => structuredClone(value);
const fail = code => {throw Object.assign(new Error(code),{code});};
// One fixed, full-strength profile. The unchanged legacy engine retains its
// bounded hard-search deadline; no difficulty directive reaches the model/UI.
export const ENGINE_PROFILE=Object.freeze({timeLimitMs:250,maxNodes:10000,searchDepth:4,branchFactor:12,candidateLimit:12});
const candidatesFor=(board,color)=>generateCandidates(board,color,'hard',ENGINE_PROFILE);
function createGame(version=0, playerColor=1, requestIds=[]) {
  return {id:randomUUID(), adapter:'gomoku', version, turnIdentity:randomUUID(), playerColor,
    contextSelection:unboundSelection(),chessMemory:[],
    board:gomokuAdapter.initialBoard(),moves:[],turn:1,status:'playing',winner:null,winningLine:[],
    chat:[],sessionId:null,requestIds:requestIds.slice(-512),hint:null,lastSource:null,lastReason:null,
    settings:{comments:true},stage:createStage(version),createdAt:Date.now(),updatedAt:Date.now()};
}

/**
 * Durable MotionDirector contract: snapshot.stage is
 * {format:1,gameId,version,epoch,replayThroughVersion,events:[<=32]}.
 * Events are exact move-committed/human-victory records, not model proposals.
 * Consumers cancel on gameId/epoch change, ignore event.version <= the replay
 * fence, establish a current-version fence on cold attachment, and dedup eventId.
 * Recovery retains audited identities but fences all old events; undo purges
 * the ledger and rotates epoch. Non-board mutations do not invent events.
 */
function appendConfirmedStageEvents(next,previous) {
  const g=next.current;
  if(g.id!==previous.id||g.moves.length!==previous.moves.length+1)return;
  const move=g.moves.at(-1),identity={confirmed:true,gameId:g.id,version:g.version};
  let event;
  if(move.color!==g.playerColor&&['model','engine'].includes(move.source)) {
    event={kind:'move-committed',...identity,eventId:`move:${move.moveId}`,moveId:move.moveId,row:move.row,col:move.col,color:move.color};
  } else if(move.source==='human'&&g.status==='won'&&g.winner===g.playerColor) {
    event={kind:'human-victory',...identity,eventId:`human-win:${move.moveId}`,winner:g.playerColor,playerColor:g.playerColor,status:'won'};
  }
  if(event&&!g.stage.events.some(saved=>saved.eventId===event.eventId))g.stage.events=[...g.stage.events,event].slice(-STAGE_EVENT_LIMIT);
}
function addMove(game, move, source, reason) {
  const color=game.turn;
  game.board=gomokuAdapter.applyMove(game.board,move,color);
  game.moves.push({row:move.row,col:move.col,color,source,moveId:randomUUID()});
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
  const saved=store.read(),legacy=saved?.current&&!Object.hasOwn(saved.current,'contextSelection');
  const parsed=envelopeSchema.safeParse(saved);
  if(!parsed.success)fail('unavailable');
  let data=parsed.data;
  data.archived=data.archived.map(validateSavedGame).slice(-6);
  let disposed=false,task=null,tail=Promise.resolve(),viewRevision=data.revision;
  let profile={id:null,identityRevision:0,name:null,avatarUrl:null,signedIn:false},locale='zh';
  const recovery=data.current!==null;
  if(data.current) {
    data.current=validateSavedGame(data.current);
    if(legacy)data.current.sessionId=null; // Fence obsolete difficulty-bearing prompts only once on migration.
    data.current.turnIdentity=randomUUID();data.current.version++;
    data.current.stage.epoch=randomUUID();data.current.stage.replayThroughVersion=data.current.version;
    data.current.hint=null;
    data.current.chat.push({id:randomUUID(),who:'system',key:'recovered',at:Date.now()});
    data.current.chat=data.current.chat.slice(-60);
  } else data.current=createGame();
  // First initialization and restart invalidation are durable before exposure.
  data.revision++;
  if(!envelopeSchema.safeParse(data).success)fail('unavailable');
  await store.write(data);viewRevision=data.revision;
  const player=options.player||createDshPlayer(ctx,{timeoutMs:15000});
  const context=options.context||createContextBinding(ctx);
  let contextView=context.describe(data.current.contextSelection);
  // Restore the exact saved selection once, never by rescanning on renders.
  // This also exposes missing/deleted/archived sources before the first human turn.
  if(data.current.contextSelection.workspaceId!==null)
    contextView=(await context.refresh(data.current.contextSelection)).binding;
  function scopedGame(game){return {...game,chat:game.chat.filter(message=>
    (message.contextRevision??0)===game.contextSelection.revision)};}
  function continuity(game) {
    const messages=scopedGame(game).chat.filter(message=>['player','dsh'].includes(message.who))
      .map(message=>({role:message.who==='player'?'user':'assistant',text:message.text}));
    return boundedMessages([...game.chessMemory,...messages],MEMORY_LIMITS).messages;
  }
  function exposeContext() {
    const selection=data.current.contextSelection,status=context.lightStatus(selection);
    if(status!=='ready'||contextView.workspaceId!==selection.workspaceId||contextView.sessionId!==selection.sessionId
      ||contextView.revision!==selection.revision)contextView=context.describe(selection,status);
    return contextView;
  }

  function enqueue(fn) {const run=tail.then(fn);tail=run.catch(()=>{});return run;}
  function invalidate() {const old=task;task=null;if(old)old.abort.abort(new Error('game invalidated'));}
  async function commit(next, requestId=null) {
    next.revision=data.revision+1;
    next.current.version=data.current.version+1;next.current.turnIdentity=randomUUID();next.current.updatedAt=Date.now();
    if(requestId)next.current.requestIds=[...next.current.requestIds,requestId].slice(-512);
    next.current.chat=next.current.chat.slice(-60).map(message=>({...message,
      contextRevision:message.contextRevision??next.current.contextSelection.revision}));
    if(next.current.stage.epoch!==data.current.stage.epoch)next.current.stage.replayThroughVersion=next.current.version;
    appendConfirmedStageEvents(next,data.current);
    // Replay/schema certify the board and event together, even for injected stores.
    const validated=envelopeSchema.safeParse(next);
    if(!validated.success)fail('unavailable');
    next=validated.data;
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
    const {chessMemory,...publicGame}=data.current;
    return clone({release:'1.2.0',runtimeId,revision:viewRevision,game:publicGame,profile,settings:data.current.settings,
      contextBinding:exposeContext(),
      stage:{...data.current.stage,gameId:data.current.id,version:data.current.version},
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
    const status=exposeContext().status;
    if(!['unbound','ready'].includes(status))return;
    const candidates=candidatesFor(g.board,g.turn);
    if(!candidates.length)return;
    const dialogue=dialogueRequest(scopedGame(g));
    const expected={abort:new AbortController(),replyIds:dialogue.replyIds,input:{sessionId:g.sessionId,gameId:g.id,version:g.version,
      turnIdentity:g.turnIdentity,requestId:randomUUID(),board:clone(g.board),color:g.turn,
      candidates:clone(candidates),chat:dialogue.chat,facts:dialogue.facts,
      chessContinuity:dialogue.commentsAllowed?continuity(g):[],
      locale,commentsAllowed:dialogue.commentsAllowed,replyMode:dialogue.replyMode,commentLimit:dialogue.commentLimit}};
    expected.requestId=expected.input.requestId;
    task=expected;viewRevision++;
    // Model work never holds the mutation queue. Every result re-enters it.
    expected.done=(async()=>{
      let result;
      const selected=clone(g.contextSelection);
      const source=selected.workspaceId===null?{binding:context.describe(selected,'unbound'),messages:[]}
        :await context.refresh(selected,{signal:expected.abort.signal});
      if(!sameTurn(expected))return;
      contextView=source.binding;viewRevision++;
      if(!['ready','unbound'].includes(source.binding.status)){task=null;return;}
      if(source.binding.status==='ready'&&dialogue.commentsAllowed)expected.input.selectedConversationContext={
        workspaceId:selected.workspaceId,sessionId:selected.sessionId,bindingRevision:selected.revision,
        sourceVersion:source.binding.history.sourceVersion,messages:source.messages};
      try {result=await player.choose(expected.input,expected.abort.signal);}
      catch(error) {if(expected.abort.signal.aborted||disposed)return;result={move:candidates[0],source:'engine',comment:'',failureCode:typeof error?.code==='string'?error.code:'MODEL_FAILED'};}
      await enqueue(async()=>{
        if(!sameTurn(expected))return;
        const sourceStatus=await context.validate(data.current.contextSelection);
        if(!sameTurn(expected))return;
        if(!['ready','unbound'].includes(sourceStatus)) {
          contextView=context.describe(data.current.contextSelection,sourceStatus);invalidate();viewRevision++;return;
        }
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
      ctx.logger?.warn?.('DSH chess-room AI commit failed: %s','unavailable');
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
      await tail;
      if(!['ready','unbound'].includes(exposeContext().status)){invalidate();viewRevision++;}
      ensureAI();return snapshot();
    }
    if(operation==='contextCatalog') {
      await tail;
      const result=await context.catalog(data.current.contextSelection,payload);
      contextView=result.contextBinding;
      if(!['ready','unbound'].includes(contextView.status)){invalidate();viewRevision++;}
      return result;
    }
    return enqueue(async()=>{
      if(disposed)fail('unavailable');validateMutation(payload);
      const next=clone(data),g=next.current;
      switch(operation) {
        case 'bindContext': {
          const selection=parseSelection(payload);
          const status=await context.validate(selection);
          if(!['ready','unbound'].includes(status))fail('context-unavailable');
          if(selection.workspaceId===g.contextSelection.workspaceId&&selection.sessionId===g.contextSelection.sessionId) {
            const source=status==='unbound'?{binding:context.describe(g.contextSelection,'unbound')}:await context.refresh(g.contextSelection);
            if(!['ready','unbound'].includes(source.binding.status))fail('context-unavailable');
            contextView=source.binding;break;
          }
          const target={...selection,revision:g.contextSelection.revision+1};
          const source=status==='unbound'?{binding:context.describe(target,'unbound'),messages:[]}:await context.refresh(target);
          if(!['ready','unbound'].includes(source.binding.status))fail('context-unavailable');
          // Cancel/fence the old chess Agent before awaiting durable replacement.
          // Preserve board, visual chat and style; only scoped model continuity is reset.
          invalidate();g.contextSelection=target;g.sessionId=null;g.chessMemory=[];consumePlayerChat(g);
          await commit(next,payload.requestId);contextView=source.binding;ensureAI();return snapshot();
        }
        case 'newGame': {
          const color=payload.playerColor??g.playerColor;
          if(![1,2].includes(color)||payload.difficulty!==undefined)fail('bad-request');
          next.archived=[...next.archived,g].filter(value=>value.moves.length).slice(-6);
          next.current=createGame(g.version,color,g.requestIds);next.current.settings=clone(g.settings);
          next.current.contextSelection=clone(g.contextSelection);
          next.current.sessionId=g.sessionId;
          next.current.chessMemory=continuity(g);
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
          g.stage=createStage(g.version); // Removed authority must never replay, including retained opening events.
          g.chat=g.chat.filter(m=>m.who!=='dsh'||!Number.isInteger(m.turn)||m.turn<=index);
          // Undo invalidates conversational requests too, never resurrecting old replies.
          consumePlayerChat(g);
          g.hint=null;g.lastSource=g.moves.at(-1)?.source||null;g.lastReason=null;break;
        }
        case 'hint': {
          if(g.status!=='playing')fail('game-over');if(g.turn!==g.playerColor)fail('wrong-turn');
          const candidates=candidatesFor(g.board,g.playerColor);
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
      }).catch(error=>ctx.logger?.warn?.('Chess account transition failed: %s','unavailable'));
    }
  });
  if(account.snapshot)profile=clone(account.snapshot);
  if(account.refresh)void account.refresh().catch(()=>{});

  // The owned native tool shares exactly the UI controller. Normalize its renderer
  // after the lazy modules become available; no other plugin's tool is touched.
  const tool=ctx.tools?.get?.('chess_room');
  if(tool&&tool.description?.includes('installed DSH Gomoku room'))tool.output.render=(_args,value)=>{
    const s=value,g=s.game;
    if(!g)return [{type:'text',text:JSON.stringify(s)}];
    return [{type:'text',text:JSON.stringify({gameId:g.id,version:g.version,turnIdentity:g.turnIdentity,
      playerColor:g.playerColor,status:g.status,turn:g.turn,winner:g.winner,contextBinding:s.contextBinding,
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
