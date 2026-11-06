import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { buildClient, workRoot } from '../scripts/build-client-context.mjs';
import { createContextPicker, contextZh, contextEn } from '../src/context-picker.js';
const { bundle, report } = buildClient();
const baseline = fs.readFileSync(path.join(workRoot, 'baseline/client-1.2.0.js'), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
function hooks(stateOverrides = {}, refOverrides = {}) {
  let stateIndex = 0, refIndex = 0, effectIndex = 0, queue = [];
  const states = [], refs = [], effects = [];
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false) }),
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = i in stateOverrides ? stateOverrides[i] : typeof initial === 'function' ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) {
      const i = refIndex++;
      if (!(i in refs)) refs[i] = { current: i in refOverrides ? refOverrides[i] : initial };
      return refs[i];
    },
    useEffect(fn, deps) {
      const i = effectIndex++, previous = effects[i];
      if (!previous || !deps || previous.deps.length !== deps.length || deps.some((x, j) => !Object.is(x, previous.deps[j]))) {
        queue.push(() => { previous?.cleanup?.(); const cleanup = fn(); effects[i] = { deps: deps || [], cleanup }; });
      }
    }
  };
  return { React, states, refs,
    render(Component, props) { stateIndex = refIndex = effectIndex = 0; queue = []; return Component(props); },
    flush() { const pending = queue; queue = []; for (const fn of pending) fn(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); }
  };
}
function allNodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.children || []).flatMap(allNodes)];
}
function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || tree.type === 'style') return '';
  return (tree.children || []).map(textOf).join(' ');
}
const b = (status = 'ready', revision = 1) => ({ workspaceId: 'a', sessionId: 'off-page', workspaceTitle: 'Project Omega',
  sessionTitle: 'Original conversation', status, revision, history: { messageCount: 8, characterCount: 400, truncated: true, observedAt: '2026-11-05T00:00:00Z' } });
const roomState = (extra = {}) => ({ runtimeId: 'runtime1', revision: 10, expression: 'victory',
  profile: { name: 'Player' }, settings: { comments: true }, contextBinding: b(), records: [], aiThinking: false,
  game: { id: 'game1', version: 4, turnIdentity: 'turn4', playerColor: 1, turn: 1, status: 'playing', difficulty: 'hard', moves: [], chat: [],
    board: Array.from({ length: 15 }, () => Array(15).fill(0)) }, ...extra });
function mountedRoom(snapshot = roomState(), language = 'en', fetchImpl = async () => { throw new Error('Unexpected network'); }) {
  const h = hooks({ 1: snapshot }, { 5: snapshot });
  let loaded; const slots = [], dictionaries = {};
  let requestId = 0;
  const sandbox = { console, URL, AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
    crypto: { randomUUID: () => 'request-' + (++requestId) },
    window: { location: { href: 'http://127.0.0.1:53870/' }, confirm: () => true, __ModuleLoader__: { load(value) { loaded = value; } } } };
  vm.runInNewContext(bundle, sandbox, { filename: 'client-context-121.js' });
  const plugin = loaded.factory(name => { assert.equal(name, 'react'); return h.React; });
  const ctx = { effect: fn => fn(), slots: { inject: (_, fn) => fn(), register: (options, Component) => { slots.push({ options, Component }); return () => {}; } },
    locale: { register: (namespace, language, values) => { (dictionaries[namespace] ||= {})[language] = values; return () => {}; },
      bind: namespace => key => dictionaries[namespace][language][key] || key, getLocale: () => ({ active: language }), subscribe: () => () => {} } };
  plugin.apply(ctx);
  const Component = slots.find(slot => slot.options.name === 'main').Component;
  return { ...h, plugin, slots, loaded, Component, tree: h.render(Component), dictionaries, sandbox };
}
function catalog(binding = b(), extra = {}) { return { workspaces: [{ workspaceId: 'a', title: 'Project Omega' }, { workspaceId: 'b', title: 'Second workspace' }],
  selectedWorkspaceId: 'a', conversations: [{ sessionId: 's1', title: 'Available conversation' }], total: 31, nextOffset: 30, contextBinding: binding, ...extra }; }
function pickerHarness(binding = b(), language = 'en') {
  const h = hooks(), calls = [], binds = [], t = key => (language === 'zh' ? contextZh : contextEn)[key] || key;
  const snapshot = { runtimeId: 'r1', contextBinding: binding };
  const props = { snapshot, catalog: payload => new Promise((resolve, reject) => calls.push({ payload, resolve, reject })),
    bind: payload => new Promise((resolve, reject) => binds.push({ payload, resolve, reject })), t, online: true };
  const Component = createContextPicker(h.React);
  h.render(Component, props); h.flush();
  return { ...h, Component, props, calls, binds, tree: () => h.render(Component, props) };
}
test('Compiled bundle retains the entire original runtime/artwork prefix byte for byte', () => {
  assert.equal(sha(baseline), report.baselineSha256);
  const prefix = fs.readFileSync(path.join(workRoot, 'baseline/frozen-prefix.txt'), 'utf8');
  assert.equal(sha(prefix), report.frozenPrefixSha256); assert.equal(bundle.slice(0, prefix.length), prefix);
  const start = baseline.indexOf('  // stage/motion-director.js\n'), end = baseline.indexOf('  // stage/frames.js\n');
  assert.equal(bundle.slice(start, end), baseline.slice(start, end));
});
test('Every original embedded PNG decodes to the exact same asset hash', () => {
  const assets = text => [...text.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map(match => sha(Buffer.from(match[1], 'base64')));
  const old = assets(baseline); assert.ok(old.length >= 56); assert.deepEqual(assets(bundle), old);
});
test('Cold factory, slots, namespace and client metadata are 1.2.1; actor stays 1.2.0', () => {
  const m = mountedRoom(); assert.equal(m.loaded.id, '@local/dsh-chess-room-live-client');
  assert.equal(m.Component.name, 'ChessRoomWhaleMaidContext121'); assert.equal(m.plugin.viewModel.clientGeneration, '1.2.1');
  assert.equal(m.plugin.viewModel.stageRelease, '1.2.0');
  assert.ok(m.slots.some(x => x.options.name === 'main' && x.options.priority === -1211));
  assert.ok(m.slots.some(x => x.options.name === 'sidebar.panellist' && x.options.priority === -1211));
  assert.ok(m.dictionaries['dsh-chess-room-context-client-v121']);
});
test('Room has no gallery, tagline, whale controls, difficulty controls or preview navigation', () => {
  const m = mountedRoom(), nodes = allNodes(m.tree), text = textOf(m.tree);
  assert.ok(!nodes.some(x => ['CharacterStageControls', 'CharacterStagePreview'].includes(x.type?.name)));
  assert.ok(!nodes.some(x => x.props.className === 'dcr-expression-gallery' || x.props.className === 'dcr-character-note'));
  for (const forbidden of ['Expression gallery', 'Difficulty', 'Legacy mechanism preview', 'Seven action tracks connected', 'Quick-witted, a good sport']) assert.ok(!text.includes(forbidden), forbidden);
  const selects = nodes.filter(x => x.type === 'select'); assert.equal(selects.length, 1); assert.equal(selects[0].props['aria-label'], 'Your stones');
  assert.ok(text.includes('Color applies to the next game')); assert.ok(nodes.some(x => x.type?.name === 'ContextPicker'));
});
test('Actual seven avatar expressions and frozen actor lifecycle props remain available', () => {
  const m = mountedRoom(), nodes = allNodes(m.tree);
  assert.equal(Array.from(m.plugin.viewModel.expressions).join(','), 'idle,thinking,smug,surprised,troubled,victory,defeat');
  assert.ok(nodes.some(x => x.type?.name === 'Character' && x.props.expression === 'victory'));
  const actor = nodes.find(x => x.props.apiRef && x.props.snapshot);
  assert.ok(actor); assert.equal(actor.props.snapshot.expression, 'victory'); assert.equal(actor.props.prefs.reduce, false);
  assert.equal(actor.props.prefs.drag, false); assert.equal(actor.props.prefs.roam, true); assert.equal(actor.props.enabled, true);
  assert.ok(actor.props.rootRef && actor.props.boardRef && actor.props.avatarRef && actor.props.cardRef);
  assert.match(m.plugin.viewModel.expressionAssets('victory', 'r').animated, /avatar-v2\/victory\.webp\?r=r$/);
});
test('Archives show outcome badges, not historical difficulty labels', () => {
  const snapshot = roomState({ savedGames: [{ id: 'archived', status: 'draw', winner: null, playerColor: 1, difficulty: 'hard', moves: [], chat: [], createdAt: 0 }] });
  const m = mountedRoom(snapshot); m.states[8] = 'records'; const tree = m.render(m.Component), text = textOf(tree);
  assert.ok(text.includes('Draw')); assert.ok(!text.includes('Hard')); assert.ok(!text.includes('Difficulty'));
});
test('Picker native selects are accessible, cascade without auto-selection and retain off-page selected names', async () => {
  const p = pickerHarness(); p.calls[0].resolve(catalog()); await tick(); const tree = p.tree(), nodes = allNodes(tree);
  const selects = nodes.filter(x => x.type === 'select'); assert.equal(selects.length, 2);
  assert.equal(selects[0].props['aria-label'], 'Workspace'); assert.equal(selects[1].props['aria-label'], 'Conversation');
  assert.equal(selects[1].props.value, 'off-page'); assert.ok(textOf(selects[1]).includes('Original conversation'));
  assert.ok(textOf(tree).includes('Project Omega / Original conversation')); assert.equal(p.binds.length, 0);
  assert.ok(nodes.some(x => x.props.role === 'status' && x.props['aria-live'] === 'polite' && x.props['aria-atomic'] === true));
  assert.ok(textOf(tree).includes('Load more conversations')); assert.ok(textOf(tree).includes('Read-only recent context'));
  selects[0].props.onChange({ target: { value: 'b' } }); assert.equal(p.binds.length, 0); assert.equal(p.calls.at(-1).payload.workspaceId, 'b');
  p.unmount();
});
test('Every missing/archived/unavailable state is localized and selected names remain visible', async () => {
  for (const status of ['missing-workspace', 'missing-session', 'archived', 'membership-mismatch', 'unavailable']) {
    const p = pickerHarness(b(status), 'zh'); p.calls[0].resolve(catalog(b(status))); await tick();
    const text = textOf(p.tree()); assert.ok(text.includes(contextZh['contextState-' + status]), status); assert.ok(text.includes('Original conversation'));
    p.unmount();
  }
});
test('Picker external busy/online state prevents mutations and clear button sends only null pair', async () => {
  const p = pickerHarness(); p.calls[0].resolve(catalog()); await tick(); p.props.busy = true;
  assert.ok(allNodes(p.tree()).filter(x => x.type === 'select' || x.type === 'button').every(x => x.props.disabled));
  p.props.busy = false; p.props.online = false; assert.ok(allNodes(p.tree()).filter(x => x.type === 'select' || x.type === 'button').every(x => x.props.disabled));
  p.props.online = true;
  allNodes(p.tree()).find(x => x.type === 'button' && textOf(x) === 'Clear binding').props.onClick();
  assert.deepEqual(p.binds[0].payload, { workspaceId: null, sessionId: null }); p.binds[0].resolve({ contextBinding: { workspaceId: null, sessionId: null, revision: 2, status: 'unbound' } }); await tick();
  p.unmount();
});
test('Full HTTP binding adapter uses same-origin endpoint, fresh guard and value.state only', async () => {
  const calls = [], next = roomState({ revision: 11, contextBinding: { ...b(), sessionId: 's1', revision: 2 } });
  const m = mountedRoom(roomState(), 'en', async (url, options) => { calls.push({ url, options }); return { json: async () => ({ ok: true, state: next }) }; });
  const picker = allNodes(m.tree).find(x => x.type?.name === 'ContextPicker');
  const result = await picker.props.bind({ workspaceId: 'a', sessionId: 's1', ignored: 'not sent' });
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(String(calls[0].url), 'http://127.0.0.1:53870/api/dsh-chess-room'); assert.equal(calls[0].options.credentials, 'same-origin');
  assert.deepEqual(sent, { operation: 'bindContext', payload: { gameId: 'game1', version: 4, turnIdentity: 'turn4', requestId: 'request-1', workspaceId: 'a', sessionId: 's1' } });
  assert.equal(result.contextBinding.sessionId, 's1'); assert.equal(m.states[3], false);
});
test('Binding API errors trigger read-only state recovery and stay rejected for the selector', async () => {
  const calls = [], m = mountedRoom(roomState(), 'en', async (_, options) => {
    const input = JSON.parse(options.body); calls.push(input);
    return { json: async () => input.operation === 'bindContext' ? { ok: false, code: 'stale' } : { ok: true, state: roomState() } };
  });
  const picker = allNodes(m.tree).find(x => x.type?.name === 'ContextPicker');
  await assert.rejects(picker.props.bind({ workspaceId: 'a', sessionId: 's1' }), error => error.code === 'stale');
  assert.deepEqual(calls.map(x => x.operation), ['bindContext', 'state']); assert.equal(m.states[3], false);
});
test('Stale binding completion after Host runtime replacement cannot overwrite the new room', async () => {
  let resolveFetch;
  const m = mountedRoom(roomState(), 'en', async () => new Promise(resolve => { resolveFetch = resolve; }));
  const picker = allNodes(m.tree).find(x => x.type?.name === 'ContextPicker');
  const pending = picker.props.bind({ workspaceId: 'a', sessionId: 's1' });
  m.refs[5].current = roomState({ runtimeId: 'runtime2', revision: 1, contextBinding: { workspaceId: null, sessionId: null, status: 'unbound', revision: 0 } });
  resolveFetch({ json: async () => ({ ok: true, state: roomState({ revision: 11, contextBinding: b() }) }) });
  await assert.rejects(pending, error => error.code === 'stale'); assert.equal(m.refs[5].current.runtimeId, 'runtime2');
});
test('New-game UI payload retains color and omits all difficulty fields', async () => {
  const calls = [], m = mountedRoom(roomState(), 'en', async (_, options) => { calls.push(JSON.parse(options.body)); return { json: async () => ({ ok: true, state: roomState() }) }; });
  const button = allNodes(m.tree).find(x => x.type === 'button' && /New game/i.test(textOf(x)));
  assert.ok(button); button.props.onClick(); await tick();
  assert.equal(calls[0].operation, 'newGame'); assert.equal(calls[0].payload.playerColor, 1); assert.ok(!('difficulty' in calls[0].payload));
});
