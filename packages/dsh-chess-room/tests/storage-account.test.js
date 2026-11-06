import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createStorage } from '../host/storage.js';
import { createAccount } from '../host/account.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ready = (id, name = id, avatarUrl = null) => ({ status: 'ready', value: {
  id, name, avatarUrl, contact: 'secret@example.invalid', email: 'private@example.invalid',
  token: 'never-expose-this-token',
} });

function accountFixture({ signedIn = false, profile = async () => ready('user-1') } = {}) {
  let state = { status: signedIn ? 'credential-stored' : 'signed-out',
    links: { usageUrl: 'https://platform.invalid/usage', topUpUrl: 'https://platform.invalid/top-up' },
    attempt: null };
  const waiting = [];
  const queue = [];
  let ended = false;
  const calls = { state: 0, profile: [], watch: [], ended: 0 };
  function emit(value) {
    state = value;
    if (waiting.length) waiting.shift()({ done: false, value });
    else queue.push(value);
  }
  const service = {
    async getState() { calls.state += 1; return state; },
    async getProfile(metadata) { calls.profile.push({ ...metadata }); return profile(metadata); },
    watch(signal, includeIdentity) {
      calls.watch.push({ signal, includeIdentity });
      queue.push(state);
      signal.addEventListener('abort', () => {
        ended = true;
        calls.ended += 1;
        while (waiting.length) waiting.shift()({ done: true });
      }, { once: true });
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          if (ended) return Promise.resolve({ done: true });
          if (queue.length) return Promise.resolve({ done: false, value: queue.shift() });
          return new Promise(resolve => waiting.push(resolve));
        },
      };
    },
  };
  return { ctx: { deepseekAccount: service }, calls, service,
    emit, signOut: () => emit({ ...state, status: 'signed-out' }),
    signIn: () => emit({ ...state, status: 'credential-stored' }),
    identityChanged: () => emit({ ...state }),
  };
}

function safeKeys(snapshot) {
  assert.deepEqual(Object.keys(snapshot).sort(),
    ['avatarUrl', 'id', 'identityRevision', 'name', 'signedIn'].sort());
  const text = JSON.stringify(snapshot);
  assert.ok(!text.includes('secret@example.invalid'));
  assert.ok(!text.includes('never-expose-this-token'));
}

test('storage opens the exact declared domain with a real Zod envelope schema', async () => {
  let spec;
  let stored;
  let closes = 0;
  const storage = await createStorage({ storageDomain: {
    async open(value) {
      spec = value;
      stored = structuredClone(value.global.initial);
      return { global: { get: () => stored,
        async set(next) { stored = structuredClone(spec.global.schema.parse(next)); } },
      async close() { closes += 1; } };
    },
  } });
  assert.equal(spec.name, 'dsh_chess_room');
  assert.match(spec.name, /^[a-z][a-z0-9_]*$/); // Actual storage UNIT_NAME_RE.
  assert.equal(spec.version, 1);
  assert.equal(spec.layout, 'single');
  assert.deepEqual(spec.tables, {});
  assert.ok(spec.global.schema instanceof z.ZodObject);
  assert.deepEqual(storage.read(), { format: 1, revision: 0, current: null, archived: [] });
  const value = { format: 1, revision: 2, current: { moves: [{ row: 7, col: 7 }] },
    archived: [{ id: 'finished-game', arbitrary: true }] };
  await storage.write(value);
  assert.deepEqual(storage.read(), value);
  const detached = storage.read();
  detached.current.moves[0].row = 0;
  detached.archived[0].id = 'mutated';
  assert.deepEqual(storage.read(), value);
  await storage.close();
  assert.equal(closes, 1);
});

test('storage rejects malformed envelopes and does not fake full game validation', async () => {
  let schema;
  const storage = await createStorage({ storageDomain: {
    async open(spec) {
      schema = spec.global.schema;
      return { global: { get: () => spec.global.initial, async set(value) { schema.parse(value); } },
        async close() {} };
    },
  } });
  for (const value of [{ format: 2, revision: 0, current: null, archived: [] },
    { format: 1, revision: -1, current: null, archived: [] },
    { format: 1, revision: 0.1, current: null, archived: [] },
    { format: 1, revision: 0, current: null, archived: {} }]) {
    await assert.rejects(storage.write(value), z.ZodError);
  }
  // Game payloads are deliberately unknown; adapter replay is the controller's job.
  await storage.write({ format: 1, revision: 1, current: 'unvalidated-game', archived: [42] });
  await storage.close();
});

test('storage open/read/write/close failures propagate without fallback', async () => {
  const error = new Error('storage backend failed');
  await assert.rejects(createStorage({ storageDomain: { async open() { throw error; } } }), error);
  const storage = await createStorage({ storageDomain: { async open() {
    return { global: { get() { throw error; }, async set() { throw error; } },
      async close() { throw error; } };
  } } });
  assert.throws(() => storage.read(), error);
  await assert.rejects(storage.write({}), error);
  await assert.rejects(storage.close(), error);
});

test('account starts one identity-enabled watcher and exposes only a safe signed-out snapshot', async t => {
  const fixture = accountFixture();
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  t.after(() => account.dispose());
  await turn();
  const value = await account.refresh();
  assert.deepEqual(value, { identityRevision: 0, name: null, avatarUrl: null, signedIn: false, id: null });
  assert.equal(fixture.calls.watch.length, 1);
  assert.equal(fixture.calls.watch[0].includeIdentity, true);
  assert.equal(fixture.calls.profile.length, 0);
  assert.equal(changes.length, 0);
  safeKeys(value);
  value.name = 'external mutation';
  assert.equal(account.snapshot.name, null);
});

test('ready profile uses exact metadata and filters contact, email and tokens', async t => {
  const fixture = accountFixture({ signedIn: true,
    profile: async () => ready('id-123', '  Alice  ', 'https://images.invalid/avatar.png') });
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  t.after(() => account.dispose());
  await turn();
  const value = await account.refresh();
  assert.equal(value.signedIn, true);
  assert.equal(value.id, 'id-123');
  assert.equal(value.name, 'Alice');
  assert.equal(value.avatarUrl, 'https://images.invalid/avatar.png');
  safeKeys(value);
  changes.forEach(safeKeys);
  assert.ok(fixture.calls.profile.every(metadata =>
    JSON.stringify(metadata) === JSON.stringify({ version: '0.2.1-rc.3', locale: 'zh', timezoneOffsetSeconds: 0 })));
  const revision = value.identityRevision;
  const notifications = changes.length;
  await account.refresh();
  assert.equal(account.snapshot.identityRevision, revision);
  assert.equal(changes.length, notifications);
});

test('profile field changes advance identityRevision, unchanged reads do not', async t => {
  let result = ready('u', 'First', 'http://images.invalid/first.png');
  const fixture = accountFixture({ signedIn: true, profile: async () => result });
  const account = createAccount(fixture.ctx, () => {});
  t.after(() => account.dispose());
  await turn();
  await account.refresh();
  const first = account.snapshot.identityRevision;
  result = ready('u', 'Second', 'http://images.invalid/first.png');
  await account.refresh();
  assert.equal(account.snapshot.identityRevision, first + 1);
  result = ready('v', 'Second', 'https://images.invalid/second.png');
  await account.refresh();
  assert.equal(account.snapshot.identityRevision, first + 2);
  await account.refresh();
  assert.equal(account.snapshot.identityRevision, first + 2);
});

test('avatar accepts absolute HTTP(S) only and never exposes URL credentials', async t => {
  let avatar = null;
  const fixture = accountFixture({ signedIn: true, profile: async () => ready('u', 'User', avatar) });
  const account = createAccount(fixture.ctx, () => {});
  t.after(() => account.dispose());
  await turn();
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,aaa', 'file:///C:/secret',
    '/relative.png', 'not a URL', 'https://user:password@images.invalid/a.png', 42, null]) {
    avatar = value;
    await account.refresh();
    assert.equal(account.snapshot.avatarUrl, null);
  }
  for (const value of ['https://images.invalid/a.png', 'http://images.invalid/a.png']) {
    avatar = value;
    await account.refresh();
    assert.equal(account.snapshot.avatarUrl, value);
  }
});

test('logout invalidates a pending profile immediately and late completion cannot restore it', async t => {
  const old = deferred();
  const fixture = accountFixture({ signedIn: true, profile: () => old.promise });
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  t.after(() => account.dispose());
  await turn();
  const pending = account.refresh();
  await turn();
  fixture.signOut();
  await turn();
  assert.equal(account.snapshot.signedIn, false);
  assert.equal(account.snapshot.name, null);
  const revision = account.snapshot.identityRevision;
  old.resolve(ready('old', 'Old user', 'https://images.invalid/old.png'));
  await pending;
  await turn();
  assert.deepEqual(account.snapshot, { identityRevision: revision, name: null,
    avatarUrl: null, signedIn: false, id: null });
  assert.equal(changes.some(value => value.id === 'old'), false);
});

test('newer identity request wins even if older profile resolves last', async t => {
  const old = deferred();
  const latest = deferred();
  let source = old;
  const fixture = accountFixture({ signedIn: true, profile: () => source.promise });
  const account = createAccount(fixture.ctx, () => {});
  t.after(() => account.dispose());
  await turn();
  const pendingOld = account.refresh();
  await turn();
  source = latest;
  fixture.identityChanged();
  await turn();
  latest.resolve(ready('new-id', 'New user', 'https://images.invalid/new.png'));
  await turn();
  assert.equal(account.snapshot.id, 'new-id');
  const revision = account.snapshot.identityRevision;
  old.resolve(ready('old-id', 'Old user', 'https://images.invalid/old.png'));
  await pendingOld;
  await turn();
  assert.equal(account.snapshot.id, 'new-id');
  assert.equal(account.snapshot.name, 'New user');
  assert.equal(account.snapshot.identityRevision, revision);
});

test('failed, null and thrown profiles clear previous name and avatar without leaking errors', async t => {
  let result = ready('u', 'Known', 'https://images.invalid/known.png');
  const fixture = accountFixture({ signedIn: true, profile: async () => {
    if (result instanceof Error) throw result;
    return result;
  } });
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  t.after(() => account.dispose());
  await turn();
  for (const failure of [{ status: 'failed' }, null, new Error('token secret@example.invalid')]) {
    result = ready('u', 'Known', 'https://images.invalid/known.png');
    await account.refresh();
    result = failure;
    await account.refresh();
    assert.equal(account.snapshot.signedIn, true);
    assert.equal(account.snapshot.name, null);
    assert.equal(account.snapshot.avatarUrl, null);
    assert.equal(account.snapshot.id, null);
  }
  changes.forEach(safeKeys);
});

test('getState failure and watcher failure fail closed with no unhandled rejection', async t => {
  const fixture = accountFixture({ signedIn: true });
  const account = createAccount(fixture.ctx, () => { throw new Error('consumer failed'); });
  t.after(() => account.dispose());
  await turn();
  fixture.service.getState = async () => { throw new Error('read failed'); };
  await account.refresh();
  assert.equal(account.snapshot.signedIn, false);
  assert.equal(account.snapshot.name, null);
  const broken = createAccount({ deepseekAccount: {
    getState: async () => ({ status: 'signed-out' }), getProfile: async () => null,
    watch() { throw new Error('watch failed'); },
  } }, async () => { throw new Error('async consumer failed'); });
  t.after(() => broken.dispose());
  await turn();
  assert.equal(broken.snapshot.signedIn, false);
  const asyncConsumer = createAccount(accountFixture({ signedIn: true }).ctx,
    async () => { throw new Error('async consumer failed'); });
  t.after(() => asyncConsumer.dispose());
  await turn();
  await asyncConsumer.refresh();
  assert.equal(asyncConsumer.snapshot.signedIn, true);
});

test('identity notification caused by profile ID discovery settles without a refresh loop', async t => {
  let announced = false;
  let fixture;
  fixture = accountFixture({ signedIn: true, profile: async () => {
    if (!announced) { announced = true; fixture.identityChanged(); }
    return ready('stable-id', 'User');
  } });
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  t.after(() => account.dispose());
  await turn();
  await turn();
  assert.equal(account.snapshot.id, 'stable-id');
  assert.equal(fixture.calls.profile.length, 2);
  const count = fixture.calls.profile.length;
  const notifications = changes.length;
  await turn();
  assert.equal(fixture.calls.profile.length, count);
  assert.equal(changes.length, notifications);
});

test('setMetadata refreshes with latest exact values and invalidates older results', async t => {
  const old = deferred();
  const fixture = accountFixture({ signedIn: true, profile: metadata =>
    metadata.locale === 'zh' ? old.promise : Promise.resolve(ready('en-id', 'English')) });
  const account = createAccount(fixture.ctx, () => {});
  t.after(() => account.dispose());
  await turn();
  const pending = account.refresh();
  await turn();
  await account.setMetadata({ version: '0.2.1-rc.4', locale: 'en', timezoneOffsetSeconds: 28800 });
  assert.deepEqual(fixture.calls.profile.at(-1), {
    version: '0.2.1-rc.4', locale: 'en', timezoneOffsetSeconds: 28800,
  });
  assert.equal(account.snapshot.id, 'en-id');
  old.resolve(ready('old-id', 'Old metadata result'));
  await pending;
  assert.equal(account.snapshot.id, 'en-id');
  const calls = fixture.calls.profile.length;
  await account.setMetadata({ locale: 'en' });
  assert.equal(fixture.calls.profile.length, calls);
  assert.throws(() => account.setMetadata({ locale: '' }), TypeError);
  assert.throws(() => account.setMetadata({ timezoneOffsetSeconds: 0.5 }), TypeError);
});

test('dispose aborts once, waits bounded tasks, and rejects late publication', async () => {
  const pendingProfile = deferred();
  const fixture = accountFixture({ signedIn: true, profile: () => pendingProfile.promise });
  const changes = [];
  const account = createAccount(fixture.ctx, value => changes.push(value));
  await turn();
  const pending = account.refresh();
  await turn();
  const disposal = account.dispose();
  assert.equal(account.dispose(), disposal);
  assert.equal(fixture.calls.watch[0].signal.aborted, true);
  await disposal; // Finishes even though the profile promise is still unresolved.
  assert.equal(fixture.calls.ended, 1);
  const before = account.snapshot;
  const count = changes.length;
  pendingProfile.resolve(ready('too-late', 'After disposal'));
  await pending;
  await turn();
  assert.deepEqual(account.snapshot, before);
  assert.equal(changes.length, count);
  const requests = fixture.calls.profile.length;
  await account.refresh();
  await account.setMetadata({ locale: 'en' });
  assert.equal(fixture.calls.profile.length, requests);
});
