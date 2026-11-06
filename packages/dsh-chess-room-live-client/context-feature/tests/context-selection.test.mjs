import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextSelectionController } from '../src/context-selection.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const binding = (workspaceId = null, sessionId = null, revision = 0, status = workspaceId ? 'ready' : 'unbound') => ({
  workspaceId, sessionId, revision, status, workspaceTitle: workspaceId && 'Workspace ' + workspaceId,
  sessionTitle: sessionId && 'Conversation ' + sessionId, history: { messageCount: 8, characterCount: 700, truncated: true, observedAt: '2026-11-05T00:00:00Z' }
});
const catalog = (workspaceId = '', sessions = [], b = binding(), extra = {}) => ({
  workspaces: ['a', 'b', 'c'].map(workspaceId => ({ workspaceId, title: 'Workspace ' + workspaceId })),
  selectedWorkspaceId: workspaceId || null, conversations: sessions.map(sessionId => ({ sessionId, title: 'Conversation ' + sessionId })),
  contextBinding: b, total: sessions.length, nextOffset: null, ...extra
});
function harness(initial = binding(), runtimeId = 'r1') {
  const catalogs = [], binds = [], emissions = [];
  const pending = queue => payload => new Promise((resolve, reject) => queue.push({ payload, resolve, reject }));
  const controller = createContextSelectionController({ catalog: pending(catalogs), bind: pending(binds) }, state => emissions.push(state));
  controller.snapshot(initial, runtimeId);
  return { controller, catalogs, binds, emissions, state: () => controller.getState() };
}
async function root(h, selected = '', rows = [], b = binding(), extra = {}) {
  const promise = h.controller.refresh();
  h.catalogs.at(-1).resolve(catalog(selected, rows, b, extra));
  await promise;
}
async function workspace(h, selected, rows = ['s1'], b = binding(), extra = {}) {
  h.controller.selectWorkspace(selected);
  h.catalogs.at(-1).resolve(catalog(selected, rows, b, extra));
  await tick();
}
test('Unbound root catalog never auto-selects a workspace or conversation', async () => {
  const h = harness(); await root(h);
  assert.deepEqual(h.catalogs[0].payload, { offset: 0, limit: 30 });
  assert.equal(h.state().workspaceId, ''); assert.equal(h.state().sessionId, ''); assert.equal(h.binds.length, 0);
});
test('Workspace is staged; late A cannot overwrite newer B', async () => {
  const h = harness(); await root(h);
  h.controller.selectWorkspace('a'); const a = h.catalogs.at(-1);
  h.controller.selectWorkspace('b'); const b = h.catalogs.at(-1);
  b.resolve(catalog('b', ['b1'])); await tick(); a.resolve(catalog('a', ['a1'])); await tick();
  assert.equal(h.state().workspaceId, 'b'); assert.deepEqual(h.state().conversations.map(x => x.sessionId), ['b1']);
  assert.equal(h.state().sessionId, ''); assert.equal(h.binds.length, 0);
});
test('Unknown workspace IDs cannot trigger a catalog or persistence operation', async () => {
  const h = harness(); await root(h);
  assert.equal(h.controller.selectWorkspace('alien'), false); assert.equal(h.catalogs.length, 1); assert.equal(h.binds.length, 0);
});
test('Only an explicitly chosen conversation in the current page invokes guarded bind adapter', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1']);
  assert.equal(await h.controller.selectConversation('alien'), false);
  const promise = h.controller.selectConversation('a1');
  assert.deepEqual(h.binds[0].payload, { workspaceId: 'a', sessionId: 'a1' }); assert.equal(h.state().mutating, true);
  assert.equal(h.controller.selectWorkspace('b'), false); assert.equal(await h.controller.selectConversation('a1'), false);
  h.binds[0].resolve({ contextBinding: binding('a', 'a1', 1) }); assert.equal(await promise, true);
  assert.equal(h.state().binding.sessionId, 'a1'); assert.equal(h.state().binding.revision, 1); assert.equal(h.state().mutating, false);
});
test('Null pair clears binding; stale pending catalog does not restore it', async () => {
  const old = binding('a', 'a1', 1), h = harness(old);
  const load = h.controller.refresh(), stale = h.catalogs.at(-1);
  const reset = h.controller.unbind(); assert.deepEqual(h.binds[0].payload, { workspaceId: null, sessionId: null });
  h.binds[0].resolve({ contextBinding: binding(null, null, 2) }); await reset;
  stale.resolve(catalog('a', ['a1'], old)); await load;
  h.catalogs.at(-1).resolve(catalog('', [], old)); await tick();
  assert.equal(h.state().binding.sessionId, null); assert.equal(h.state().binding.revision, 2); assert.equal(h.state().workspaceId, '');
});
test('Late load-more for previous workspace is discarded', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1'], binding(), { total: 60, nextOffset: 30 });
  const more = h.controller.loadMore(), stale = h.catalogs.at(-1);
  assert.equal(stale.payload.offset, 30);
  await workspace(h, 'b', ['b1']); stale.resolve(catalog('a', ['a2'])); await more;
  assert.deepEqual(h.state().conversations.map(x => x.sessionId), ['b1']);
});
test('Pagination deduplicates rows and rejects repeated non-advancing cursors', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1'], binding(), { total: 90, nextOffset: 30 });
  const more = h.controller.loadMore(); assert.equal(await h.controller.loadMore(), false);
  h.catalogs.at(-1).resolve(catalog('a', ['a1', 'a2'], binding(), { total: 90, nextOffset: 30 })); await more;
  assert.deepEqual(h.state().conversations.map(x => x.sessionId), ['a1', 'a2']); assert.equal(h.state().nextOffset, null);
});
test('Disposed catalog cannot emit or modify state', async () => {
  const h = harness(), p = h.controller.refresh(); const count = h.emissions.length;
  h.controller.dispose(); h.catalogs[0].resolve(catalog('', ['s1'])); await p;
  assert.equal(h.emissions.length, count); assert.equal(h.state().conversations.length, 0);
});
test('Disposed mutation cannot emit completion state', async () => {
  const h = harness(), p = h.controller.unbind(); const count = h.emissions.length;
  h.controller.dispose(); h.binds[0].resolve({ contextBinding: binding(null, null, 1) }); await p;
  assert.equal(h.emissions.length, count); assert.equal(h.state().binding.revision, 0);
});
test('New external binding snapshot realigns and invalidates pending staged catalog', async () => {
  const h = harness(); await root(h); h.controller.start();
  h.catalogs.at(-1).resolve(catalog()); await tick();
  h.controller.selectWorkspace('a'); const stale = h.catalogs.at(-1);
  const next = binding('b', 'b1', 3); h.controller.snapshot(next, 'r1');
  h.catalogs.at(-1).resolve(catalog('b', ['b1'], next)); await tick(); stale.resolve(catalog('a', ['a1'])); await tick();
  assert.equal(h.state().workspaceId, 'b'); assert.equal(h.state().sessionId, 'b1'); assert.equal(h.state().binding.revision, 3);
});
test('Older or conflicting same-revision snapshots cannot restore an old selection', () => {
  const h = harness(binding('b', 'b1', 3));
  assert.equal(h.controller.snapshot(binding('a', 'a1', 2), 'r1'), false);
  assert.equal(h.controller.snapshot(binding('a', 'a1', 3), 'r1'), false);
  assert.equal(h.state().binding.sessionId, 'b1');
});
test('External newer binding fences a delayed select result and keeps failure visible', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1']);
  const p = h.controller.selectConversation('a1'); h.controller.snapshot(binding('b', 'b1', 3), 'r1');
  h.binds[0].resolve({ contextBinding: binding('a', 'a1', 2) }); assert.equal(await p, false);
  assert.equal(h.state().binding.sessionId, 'b1'); assert.equal(h.state().error, 'stale');
  h.catalogs.at(-1).resolve(catalog('b', ['b1'], binding('b', 'b1', 3))); await tick(); assert.equal(h.state().error, 'stale');
});
test('Host runtime replacement fences the old mutation and releases busy state', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1']); const p = h.controller.selectConversation('a1');
  h.controller.snapshot(binding(), 'r2'); h.binds[0].resolve({ contextBinding: binding('a', 'a1', 1) }); await p;
  assert.equal(h.state().binding.sessionId, null); assert.equal(h.state().mutating, false);
});
test('Catalog failure preserves current binding and supports explicit retry', async () => {
  const h = harness(binding('a', 'a1', 1)); const p = h.controller.refresh();
  h.catalogs[0].reject({ code: 'unavailable' }); assert.equal(await p, false);
  assert.equal(h.state().binding.sessionId, 'a1'); assert.equal(h.state().catalogError, 'unavailable');
  await root(h, 'a', ['a1'], binding('a', 'a1', 1)); assert.equal(h.state().catalogError, '');
});
test('Catalog selected-workspace mismatch fails closed without changing selection', async () => {
  const h = harness(), p = h.controller.refresh(); h.catalogs[0].resolve(catalog('a', ['a1'])); await p;
  assert.equal(h.state().workspaceId, ''); assert.equal(h.state().catalogError, 'stale'); assert.equal(h.state().conversations.length, 0);
});
test('Malformed catalog arrays fail without loading arbitrary data', async () => {
  const h = harness(), p = h.controller.refresh(); h.catalogs[0].resolve(catalog('', [], binding(), { conversations: { text: 'secret' } })); await p;
  assert.equal(h.state().catalogError, 'unavailable'); assert.equal(h.state().conversations.length, 0);
});
test('Client state retains only thin names/IDs and bounded history counters, never source text', async () => {
  const h = harness(), b = { ...binding(), originalMessages: ['secret'], history: { ...binding().history, messages: ['secret'], prompt: 'secret' } };
  await root(h, '', [], b, { workspaces: [{ workspaceId: 'a', title: 'A', path: 'secret', preview: 'secret' }], originalHistory: ['secret'] });
  assert.equal(JSON.stringify(h.state()).includes('secret'), false); assert.deepEqual(h.state().workspaces, [{ workspaceId: 'a', title: 'A' }]);
  assert.equal(h.state().binding.history.truncated, true);
});
test('Newer binding in catalog aligns to that binding, not the first workspace', async () => {
  const h = harness(), p = h.controller.refresh(), b = binding('c', 'c1', 5);
  h.catalogs[0].resolve(catalog('', [], b)); await p;
  assert.equal(h.state().workspaceId, 'c'); assert.equal(h.catalogs[1].payload.workspaceId, 'c');
  h.catalogs[1].resolve(catalog('c', ['c1'], b)); await tick(); assert.equal(h.state().binding.sessionId, 'c1'); assert.equal(h.binds.length, 0);
});
test('Bind response without authoritative contextBinding cannot falsely acknowledge success', async () => {
  const h = harness(); await root(h); await workspace(h, 'a', ['a1']); const p = h.controller.selectConversation('a1');
  h.binds[0].resolve({ ok: true }); assert.equal(await p, false); assert.equal(h.state().error, 'unavailable'); assert.equal(h.state().binding.sessionId, null);
});
test('Overlapping explicit catalog refreshes use the newest generation only', async () => {
  const h = harness(), old = h.controller.refresh(), newer = h.controller.refresh();
  h.catalogs[1].resolve(catalog('', [], binding(), { workspaces: [{ workspaceId: 'b', title: 'Newest' }] })); await newer;
  h.catalogs[0].resolve(catalog('', [], binding(), { workspaces: [{ workspaceId: 'a', title: 'Old' }] })); await old;
  assert.deepEqual(h.state().workspaces.map(x => x.title), ['Newest']);
});
test('A newer metadata snapshot cannot be overwritten by an older in-flight catalog', async () => {
  const b = binding('a', 'a1', 1), h = harness(b), p = h.controller.refresh();
  h.controller.snapshot({ ...b, status: 'missing-session', sessionTitle: 'Latest missing name' }, 'r1');
  h.catalogs[0].resolve(catalog('a', ['a1'], b)); await p;
  assert.equal(h.state().binding.status, 'missing-session'); assert.equal(h.state().binding.sessionTitle, 'Latest missing name');
});
test('Missing and archived status updates do not discard an explicitly staged workspace', async () => {
  const b = binding('b', 'b1', 1), h = harness(b); await root(h, 'b', ['b1'], b);
  await workspace(h, 'a', ['a1'], { ...b, status: 'archived' });
  assert.equal(h.state().workspaceId, 'a'); assert.equal(h.state().binding.status, 'archived'); assert.equal(h.state().binding.workspaceId, 'b');
});
