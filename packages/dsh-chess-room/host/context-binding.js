// Selected conversation access is exclusively read-only, through inspected Host
// workspaceRegistry/sessionQuery and detached sessions.prepare methods.
// No source Agent, persistence writer or credential handles enter here.
import {randomUUID} from 'node:crypto';
export const HISTORY_LIMITS = Object.freeze({messages:24,characters:12000,perMessage:2000});
export const MEMORY_LIMITS = Object.freeze({messages:16,characters:4800,perMessage:400});
const clone=value=>structuredClone(value);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);
const dedicated=id=>/^chess-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id??'');
const label=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,160)||null:null;
export function parseSelection(payload) {
  if(payload?.workspaceId===null&&payload?.sessionId===null)return {workspaceId:null,sessionId:null};
  if(!identifier(payload?.workspaceId)||!identifier(payload?.sessionId)||dedicated(payload.sessionId))fail('bad-request');
  return {workspaceId:payload.workspaceId,sessionId:payload.sessionId};
}
export function redactSensitiveText(text) {
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[redacted credential]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g,'[redacted credential]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [redacted]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|secret|password|密码|密钥)\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,'$1[redacted]');
}
export function emptyHistory(){return {messageCount:0,characterCount:0,truncated:false,observedAt:null,sourceVersion:null,compacted:false};}
export function unboundSelection(){return {workspaceId:null,sessionId:null,revision:0};}
export function boundedMessages(messages,limits=HISTORY_LIMITS) {
  let characters=0,truncated=false;const selected=[];
  for(let i=messages.length-1;i>=0;i--) {
    const message=messages[i];
    if(!message||!['user','assistant'].includes(message.role)||typeof message.text!=='string'||!message.text.trim())continue;
    if(selected.length>=limits.messages||characters>=limits.characters){truncated=true;break;}
    const clean=message.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
    const size=Math.min(limits.perMessage,limits.characters-characters);
    let text=clean.slice(0,size);
    // Never expose half of a UTF-16 surrogate pair.
    if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);
    truncated ||= text.length<clean.length;
    if(text){selected.push({role:message.role,text});characters+=text.length;}
  }
  return {messages:selected.reverse(),messageCount:selected.length,characterCount:characters,truncated};
}
export function conversationalSurface(surface) {
  const messages=[];let compacted=false;
  for(const event of surface.events??[]) {
    if(event.surfaceOp?.kind==='replace')compacted=true;
    const message=event.type==='user/message'?event.data:event.type==='assistant/message'?event.data?.message:null;
    if(!message||!['user','assistant'].includes(message.role)||!Array.isArray(message.content))continue;
    // Reasoning, tool results/calls/arguments, attachments, system/developer text
    // and provisional streaming records are intentionally not conversational text.
    const text=message.content.filter(block=>block?.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n');
    if(text.trim())messages.push({role:message.role,text});
  }
  return {...boundedMessages(messages),compacted};
}
export function createContextBinding(ctx,{now=()=>Date.now()}={}) {
  const registry=ctx.workspaceRegistry,query=ctx.sessionQuery;
  let cache=null;
  const titles=new Map(),statuses=new Map();
  const selectionKey=selection=>JSON.stringify([selection.workspaceId,selection.sessionId,selection.revision]);
  function available(){return !!registry&&!!query&&!!ctx.sessions?.prepare;}
  function lightStatus(selection) {
    if(selection.workspaceId===null&&selection.sessionId===null)return 'unbound';
    if(!available())return 'unavailable';
    try {
      const workspace=registry.get(selection.workspaceId);
      if(!workspace)return 'missing-workspace';
      if(registry.archivedSessionIds.includes(selection.sessionId))return 'archived';
      if(!workspace.sessionIds.includes(selection.sessionId))return 'membership-mismatch';
      if(dedicated(selection.sessionId))return 'unavailable';
      return 'ready';
    }catch{return 'unavailable';}
  }
  async function validate(selection,{signal,records}={}) {
    const status=lightStatus(selection);if(status!=='ready')return status;
    try {
      signal?.throwIfAborted();
      const workspace=registry.get(selection.workspaceId);
      if(workspace.status&&await workspace.status()!=='ok')return 'missing-workspace';
      const all=records??await query.listSessions(signal);
      signal?.throwIfAborted();
      const record=all.find(item=>item.header?.id===selection.sessionId);
      if(!record)return 'missing-session';
      if(record.formatStatus==='migration-required')return 'unavailable';
      return lightStatus(selection);
    }catch{return 'unavailable';}
  }
  function describe(selection,status) {
    const light=lightStatus(selection);
    status=light==='ready'?(status??statuses.get(selectionKey(selection))??light):light;
    if(status!=='ready')titles.delete(selection.sessionId);
    statuses.set(selectionKey(selection),status);
    const ready=status==='ready',cached=ready&&cache?.workspaceId===selection.workspaceId&&cache?.sessionId===selection.sessionId?cache:null;
    return {...clone(selection),status,workspaceTitle:ready?label(registry.get(selection.workspaceId)?.title):null,
      sessionTitle:ready?titles.get(selection.sessionId)?.title??null:null,
      history:cached?clone(cached.history):emptyHistory()};
  }
  async function refresh(selection,{signal}={}) {
    const status=await validate(selection,{signal});
    if(status!=='ready'){cache=null;return {binding:describe(selection,status),messages:[]};}
    let observation;
    try {
      observation=await query.observeSession(selection.sessionId,{projectionMode:'none',...(signal?{signal}:{})});
      signal?.throwIfAborted();
      if(observation.header.id!==selection.sessionId)fail('unavailable');
      if(cache?.workspaceId===selection.workspaceId&&cache.sessionId===selection.sessionId
        &&cache.cursor===observation.cursor&&cache.revision===(observation.revision??null)) {
        // A source can be removed/archived while observation is awaiting its cut.
        // The same-cut cache is not permission to skip current membership checks.
        const after=await validate(selection,{signal});
        if(after!=='ready'){cache=null;return {binding:describe(selection,after),messages:[]};}
        return {binding:describe(selection,'ready'),messages:clone(cache.messages)};
      }
      // One immutable committed cut, interpreted by the exact public Session
      // surface/messages projection. A fresh detached read identity is NEVER
      // entered, announced, driven by an Agent, flushed, or attached to a store.
      const privateReadId=`chess-context-read-${randomUUID()}`;
      const detached=await ctx.sessions.prepare(privateReadId,{
        seed:clone(observation.events),meta:{...clone(observation.header),id:privateReadId},
        inheritedEventCount:observation.inheritedEventCount,eventState:'detached',
      });
      const projected=detached.deriveMessages();
      signal?.throwIfAborted();
      const cursor=observation.cursor;
      const after=await validate(selection,{signal});
      if(after!=='ready'){cache=null;return {binding:describe(selection,after),messages:[]};}
      const messages=projected.filter(message=>['user','assistant'].includes(message.role))
        .map(message=>({role:message.role,text:redactSensitiveText(Array.isArray(message.content)?message.content
          .filter(block=>block?.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n'):'')}));
      const window={...boundedMessages(messages),compacted:detached.surface.replaceGeneration>0};
      cache={workspaceId:selection.workspaceId,sessionId:selection.sessionId,cursor,
        revision:observation.revision??null,messages:window.messages,
        history:{messageCount:window.messageCount,characterCount:window.characterCount,truncated:window.truncated,
          compacted:window.compacted,observedAt:now(),sourceVersion:String(cursor)}};
      if(!titles.has(selection.sessionId))await readTitles([selection.sessionId],signal);
      return {binding:describe(selection,'ready'),messages:clone(cache.messages)};
    }catch(error) {
      cache=null;
      const status=error?.code==='SESSION_QUERY_SESSION_NOT_FOUND'?'missing-session':'unavailable';
      return {binding:describe(selection,status),messages:[]};
    }finally{observation?.[Symbol.dispose]?.();}
  }
  async function readTitles(ids,signal) {
    if(!ids.length)return;
    const results=await query.readTitleSnapshots(ids,signal);
    for(const item of results) {
      if(item.status==='fulfilled'&&item.value.session.id===item.sessionId)titles.set(item.sessionId,
        {title:label(item.value.title?.title),updatedAt:item.value.title?.updatedAt??item.value.session.createdAt});
      else titles.delete(item.sessionId);
    }
  }
  async function catalog(selection,payload={}) {
    if(!available())fail('unavailable');
    const offset=payload.offset??0,limit=payload.limit??50;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100
      ||(payload.workspaceId!==undefined&&!identifier(payload.workspaceId)))fail('bad-request');
    let workspaces,records;
    try {workspaces=registry.list();records=await query.listSessions();}catch{fail('unavailable');}
    // No first-workspace/session fallback: this dropdown remains explicitly unset.
    const selectedWorkspaceId=payload.workspaceId??selection.workspaceId;
    const workspace=selectedWorkspaceId===null?null:registry.get(selectedWorkspaceId);
    const archived=new Set(registry.archivedSessionIds);
    const byId=new Map(records.map(record=>[record.header.id,record]));
    const ids=(workspace?.sessionIds??[]).filter(id=>byId.has(id)&&!archived.has(id)&&!dedicated(id)
      &&byId.get(id).formatStatus!=='migration-required');
    const page=ids.slice(offset,offset+limit);
    try {await readTitles([...new Set([...page,...(selection.sessionId&&byId.has(selection.sessionId)?[selection.sessionId]:[])])]);}
    catch{fail('unavailable');}
    const conversations=page.map(id=>({sessionId:id,title:titles.get(id)?.title??null,
      createdAt:byId.get(id).header.createdAt,updatedAt:titles.get(id)?.updatedAt??byId.get(id).header.createdAt}));
    return {workspaces:workspaces.map(workspace=>({workspaceId:workspace.id,title:label(workspace.title)})),
      selectedWorkspaceId,conversations,total:ids.length,nextOffset:offset+page.length<ids.length?offset+page.length:null,
      contextBinding:describe(selection,await validate(selection,{records}))};
  }
  function clear(){cache=null;titles.clear();statuses.clear();}
  return {lightStatus,validate,describe,refresh,catalog,clear};
}
