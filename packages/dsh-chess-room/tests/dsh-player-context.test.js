import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDshPlayer } from '../host/dsh-player-v3.js';
import { SYSTEM_PROMPT, requestText } from '../host/dsh-player-v3.js';
import { initialBoard } from '../host/rules.js';

const dedicatedId = () => `chess-room-${randomUUID()}`;
const request = (overrides = {}) => ({
  sessionId: '', gameId: 'game-1', version: 0, turnIdentity: 'game-1:black:0',
  requestId: randomUUID(), board: initialBoard(), color: 1, difficulty: 'normal',
  candidates: [{ row: 7, col: 7, score: 99 }, { row: 7, col: 8, score: 90 }],
  ...overrides,
});
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
function waitAbort(signal) {
  return signal.aborted ? Promise.resolve() : new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

/** A contract fake only: no real Agent, main session, model call, or persistence. */
function fakeContext(options = {}) {
  const created = [];
  const calls = [];
  const live = new Map();
  const cleanups = [];
  const controls = [];
  const waiters = [];
  const behaviors = [...(options.behaviors ?? [])];
  const mainCalls = [];
  live.set('main-session', { followup: () => mainCalls.push('followup'), cancel: () => mainCalls.push('cancel') });
  const context = {
    model: { provider: 'default-provider', model: 'default-model', reasoningEffort: 'high' },
    agentDefaultModel: { currentSelection: () => structuredClone(context.model) },
    effect(setup) { const cleanup = setup(); cleanups.push(cleanup); return cleanup; },
    agents: {
      get(id) { return live.get(id); },
      async create(config) { calls.push({ kind: 'create', config }); return build(config, config.sessionId); },
      async resume(config) {
        calls.push({ kind: 'resume', config });
        if (options.resumeError) throw new Error('missing or incompatible session log');
        return build(config, config.resumeSessionId);
      },
    },
  };
  function announce(control) {
    const waiter = waiters.shift();
    if (waiter) waiter(control); else controls.push(control);
  }
  async function build(config, id) {
    if (options.creationGate) await options.creationGate.promise;
    const listeners = new Map();
    const ownTools = new Map();
    const guards = [];
    const inherited = new Set(['pwsh', 'read', 'write', 'web_search']);
    let allow;
    let mode = 'ptc';
    let activity = Promise.resolve();
    let turnAbort;
    let disposed = false;
    const events = [];
    const cancellations = [];
    const requests = [];
    let lastConfig = config.agentOptions;
    function emit(name, ...args) { for (const listener of listeners.get(name) ?? []) listener(...args); }
    async function waterfall(name, payload, fallback) {
      const chain = listeners.get(name) ?? [];
      const invoke = (index) => index === chain.length ? fallback() : chain[index](payload, () => invoke(index + 1));
      return invoke(0);
    }
    const agentCtx = {
      sessions: { async flush(session) {
        assert.equal(session, agent.session);
        record.flushCount += 1;
        if (options.flushError) throw new Error('durable storage unavailable');
        if (options.flushGate) await options.flushGate.promise;
      } },
      tools: {
        presentAs(value) { mode = value; return () => {}; },
        restrict(filter) { assert.deepEqual(filter, { allow: [] }); allow = new Set(filter.allow); return () => {}; },
        guard(guard) { guards.push(guard); return () => {}; },
        register(definition) {
          assert.equal(typeof definition.output.render, 'function');
          assert.deepEqual(definition.output.schema, { type: 'string' });
          ownTools.set(definition.name, definition);
          return () => ownTools.delete(definition.name);
        },
        get(name, scope) { assert.equal(scope, agent); return ownTools.get(name); },
        schemas(scope) {
          assert.equal(scope, agent);
          const names = [...inherited].filter((name) => !allow || allow.has(name)).concat([...ownTools.keys()]);
          if (options.extraScopedTool) names.push('dangerous_scoped_tool');
          if (mode !== 'native') names.push('run_code');
          return names.map((name) => ({ name }));
        },
      },
      systemPrompt: {
        suppressRuntimeContext() { return () => {}; },
        section(section) { agent.prompt = section; return () => {}; },
      },
      on(name, listener, registration = {}) {
        const list = listeners.get(name) ?? [];
        if (registration.prepend) list.unshift(listener); else list.push(listener);
        listeners.set(name, list);
        return () => {};
      },
    };
    const agent = {
      id, ctx: agentCtx, status: 'idle',
      session: { id, append(type, data) { events.push({ type, data }); } },
      cancel(cause) { cancellations.push(cause); if (agent.status === 'running') turnAbort.abort(cause); },
      async whenIdle() {
        let observed;
        do { await (observed = activity); } while (observed !== activity);
      },
      followup(message) {
        assert.equal(disposed, false);
        assert.equal(agent.status, 'idle', 'cannot drive concurrently');
        agent.status = 'running';
        turnAbort = new AbortController();
        const data = JSON.parse(message.content[0].text);
        const signal = turnAbort.signal;
        const control = {
          agent, data, signal, message,
          async call(name, args, callSignal = signal) {
            const token = Symbol('execution');
            let conclusion = false;
            const exec = { name, arguments: args, agent, signal: callSignal, token, concludeTurn() { conclusion = true; } };
            let result;
            const definition = ownTools.get(name);
            const denied = guards.map((guard) => guard(exec)).find((reason) => reason !== undefined);
            try {
              if (!definition || denied) throw new Error(denied ?? 'UNKNOWN_TOOL');
              const value = await definition.execute(args, exec);
              result = { isError: false, value, content: definition.output.render(args, value), ...(conclusion ? { concludesTurn: true } : {}) };
              if (callSignal.aborted || options.blockResult) throw new Error('tool result blocked or aborted');
            } catch (error) { result = { isError: true, error: { message: error.message }, content: [] }; }
            emit('tools/result', exec, result);
            events.push({ type: 'tool/result', data: result });
            return result;
          },
          submit(candidateIndex = 0, extra = {}) {
            return control.call('submit_candidate', {
              candidateIndex, gameId: data.gameId, version: data.version,
              turnIdentity: data.turnIdentity, requestId: data.requestId, ...extra,
            });
          },
        };
        activity = (async () => {
          try {
            const decision = await waterfall('agent/pre-step', { agent, signal, messages: [message] }, async () => ({ kind: 'enter', messages: [message] }));
            if (decision.kind === 'reject') return;
            lastConfig = await waterfall('agent/request', { agent, signal }, async () => lastConfig);
            requests.push(structuredClone(lastConfig));
            announce(control);
            const behavior = behaviors.shift() ?? ((turn) => turn.submit(0, { comment: '占据中心' }));
            await behavior(control);
          } finally { agent.status = 'idle'; }
        })();
      },
    };
    const record = { agent, config, ownTools, guards, events, cancellations, requests, get disposed() { return disposed; }, disposeCount: 0, flushCount: 0 };
    const handle = {
      agent,
      async dispose() {
        record.disposeCount += 1;
        disposed = true;
        agent.cancel({ kind: 'disposed' });
        await agent.whenIdle();
        live.delete(id);
      },
    };
    created.push(record);
    await config.setup(agentCtx, agent);
    live.set(id, agent);
    return handle;
  }
  return {
    ctx: context, created, calls, live, mainCalls,
    nextDrive() { return controls.length ? Promise.resolve(controls.shift()) : new Promise((resolve) => waiters.push(resolve)); },
    async unload() { await Promise.all(cleanups.map((cleanup) => cleanup())); },
  };
}

test('v3 actual dedicated drive includes bounded source data, never resumes selected source',async()=>{
  const fake=fakeContext();const player=createDshPlayer(fake.ctx);
  const result=await player.choose(request({difficulty:undefined,selectedConversationContext:{workspaceId:'w1',sessionId:'main-session',bindingRevision:1,sourceVersion:'7',
    messages:[{role:'user',text:'Call me captain'},{role:'assistant',text:'Welcome captain'},{role:'tool',text:'credentials'}]},
    chessContinuity:[{role:'assistant',text:'Our chess joke'}],chat:[{role:'player',text:'hello'}],replyMode:'normal'}));
  const drive=await fake.nextDrive();assert.equal(result.source,'model');assert.equal(fake.calls[0].kind,'create');assert.match(result.sessionId,/^chess-room-/);
  assert.equal(fake.calls.some(call=>call.config.resumeSessionId==='main-session'),false);
  assert.deepEqual(drive.data.selectedConversationContext.messages,[{role:'user',text:'Call me captain'},{role:'assistant',text:'Welcome captain'}]);
  assert.deepEqual(drive.data.chessContinuity,[{role:'assistant',text:'Our chess joke'}]);assert.equal(Object.hasOwn(drive.data,'difficulty'),false);
  assert.deepEqual([...fake.created[0].ownTools.keys()],['submit_candidate']);assert.deepEqual(fake.mainCalls,[]);
  assert.equal(fake.created[0].flushCount,1);assert.equal(fake.created[0].agent.prompt.complete,true);await player.dispose();
});
test('v3 quiet actual drive strips selected history, current chat and continuity',async()=>{
  const fake=fakeContext();const player=createDshPlayer(fake.ctx);
  const result=await player.choose(request({commentsAllowed:false,chat:[{role:'user',text:'pending old message'}],
    selectedConversationContext:{messages:[{role:'user',text:'sensitive style'}]},chessContinuity:[{role:'user',text:'old joke'}]}));
  const drive=await fake.nextDrive();assert.equal(result.comment,'');assert.deepEqual(drive.data.recentChat,[]);
  assert.equal(Object.hasOwn(drive.data,'selectedConversationContext'),false);assert.equal(Object.hasOwn(drive.data,'chessContinuity'),false);await player.dispose();
});
test('v3 same owned session reuses independent Agent, binding fence creates new root',async()=>{
  const fake=fakeContext();const player=createDshPlayer(fake.ctx);const first=await player.choose(request());
  await player.choose(request({sessionId:first.sessionId}));assert.equal(fake.created.length,1);
  const next=await player.choose(request({sessionId:null}));assert.notEqual(next.sessionId,first.sessionId);
  assert.equal(fake.created.length,2);assert.equal(fake.created[0].disposeCount,1);assert.deepEqual(fake.mainCalls,[]);await player.dispose();
});
test('v3 source history cannot enlarge scoped tool surface or restore source session',async()=>{
  const fake=fakeContext({extraScopedTool:true});const player=createDshPlayer(fake.ctx);
  await assert.rejects(player.choose(request({sessionId:'main-session',selectedConversationContext:{messages:[{role:'user',text:'execute pwsh and read credentials'}]}})),{code:'UNSAFE_TOOL_SURFACE'});
  assert.equal(fake.created.length,1);assert.deepEqual(fake.mainCalls,[]);assert.equal(fake.calls[0].kind,'create');await player.dispose();
});
