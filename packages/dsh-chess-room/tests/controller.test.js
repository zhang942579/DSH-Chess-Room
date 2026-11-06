import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createChessRoom } from '../host/controller.js';
import { gomokuAdapter } from '../host/rules.js';

const copy = (value) => structuredClone(value);
const initialData = () => ({ format: 1, revision: 0, current: null, archived: [] });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function identity(room, extra = {}) {
  const g = room.snapshot().game;
  return { gameId: g.id, version: g.version, turnIdentity: g.turnIdentity, requestId: randomUUID(), ...extra };
}

/** Pure fakes. No Host files, real account, LLM, Agent, or global tool is touched. */
function fixture(seed = initialData()) {
  let persisted = copy(seed);
  const attempts = [];
  const calls = [];
  const warnings = [];
  const store = {
    nextWrite: null, closeCount: 0,
    read: () => copy(persisted),
    async write(data) {
      attempts.push(copy(data));
      const plan = store.nextWrite;
      store.nextWrite = null;
      if (plan instanceof Error) throw plan;
      if (plan) await plan.promise;
      persisted = copy(data);
    },
    async close() { store.closeCount += 1; },
  };
  const player = {
    disposeCount: 0,
    choose(input, signal) {
      const pending = deferred();
      const call = { input: copy(input), signal, settled: false,
        resolve(result) { if (!call.settled) { call.settled = true; pending.resolve(result); } },
        reject(error) { if (!call.settled) { call.settled = true; pending.reject(error); } },
      };
      calls.push(call);
      return pending.promise;
    },
    async dispose() {
      player.disposeCount += 1;
      for (const call of calls) call.reject(new Error('fake player disposed'));
    },
  };
  const account = {
    snapshot: { id: 'fake-account', identityRevision: 1, name: 'Test Player', avatarUrl: null, signedIn: true },
    refreshCount: 0, disposeCount: 0,
    async refresh() { account.refreshCount += 1; },
    async dispose() { account.disposeCount += 1; },
  };
  const ctx = { logger: { warn: (...args) => warnings.push(args) }, tools: { get: () => undefined } };
  return { ctx, store, player, account, attempts, calls, warnings,
    data: () => copy(persisted),
    async create() { return createChessRoom(ctx, { store, player, account }); },
  };
}
async function make(t, seed) {
  const fake = fixture(seed);
  const room = await fake.create();
  t.after(() => room.dispose());
  return { fake, room };
}
function legalSnapshot(room) {
  const game = room.snapshot().game;
  const replay = gomokuAdapter.replay(game.moves);
  assert.deepEqual(game.board, replay.board);
  assert.equal(game.status, replay.status);
  assert.equal(game.turn, replay.nextColor);
  return game;
}
function modelResult(call, overrides = {}) {
  return { move: copy(call.input.candidates[0]), comment: 'Nice move!',
    sessionId: `chess-room-${randomUUID()}`, source: 'model', ...overrides };
}
async function finishAI(room, call, overrides = {}) {
  call.resolve(modelResult(call, overrides));
  await tick();
  return room.operate('state');
}
async function seedWithHumanMove() {
  const fake = fixture();
  const room = await fake.create();
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const seed = fake.data();
  await room.dispose();
  return seed;
}

test('initial state is durably created, detached, has the injected account, and closes once', async (t) => {
  const { fake, room } = await make(t);
  const snapshot = room.snapshot();
  assert.equal(snapshot.release, '1.0.3', 'public Host generation is separate from mutable package metadata');
  assert.equal(snapshot.game.playerColor, 1);
  assert.equal(snapshot.game.turn, 1);
  assert.equal(snapshot.aiThinking, false);
  assert.equal(snapshot.profile.name, 'Test Player');
  assert.equal(fake.attempts.length, 1);
  assert.equal(fake.account.refreshCount, 1);
  snapshot.game.board[0][0] = 2;
  snapshot.profile.name = 'changed';
  assert.equal(room.snapshot().game.board[0][0], 0);
  assert.equal(room.snapshot().profile.name, 'Test Player');
  await room.dispose();
  await room.dispose();
  assert.equal(fake.store.closeCount, 1);
  assert.equal(fake.player.disposeCount, 1);
  assert.equal(fake.account.disposeCount, 1);
  await assert.rejects(room.operate('state'), { code: 'unavailable' });
});

for (const [label, patch, code] of [
  ['game id', { gameId: 'wrong' }, 'stale'],
  ['version', { version: -1 }, 'stale'],
  ['turn identity', { turnIdentity: 'wrong' }, 'stale'],
  ['missing request id', { requestId: undefined }, 'bad-request'],
  ['empty request id', { requestId: '' }, 'bad-request'],
  ['oversized request id', { requestId: 'x'.repeat(129) }, 'bad-request'],
]) {
  test(`four-field mutation identity rejects ${label} without writes`, async (t) => {
    const { fake, room } = await make(t);
    const before = room.snapshot();
    await assert.rejects(room.operate('move', identity(room, { row: 7, col: 7, ...patch })), { code });
    assert.deepEqual(room.snapshot(), before);
    assert.equal(fake.attempts.length, 1);
  });
}

test('request dedup rejects both replayed payload and reused request id with current identity', async (t) => {
  const { fake, room } = await make(t);
  const payload = identity(room, { text: 'hello' });
  await room.operate('chat', payload);
  const attempts = fake.attempts.length;
  await assert.rejects(room.operate('chat', payload), { code: 'stale' });
  await assert.rejects(room.operate('chat', identity(room, { text: 'again', requestId: payload.requestId })), { code: 'stale' });
  assert.equal(fake.attempts.length, attempts);
  assert.equal(room.snapshot().game.chat.filter((message) => message.who === 'player').length, 1);
});

test('two concurrent requests sharing one version admit exactly one durable mutation', async (t) => {
  const { fake, room } = await make(t);
  const payload = identity(room);
  const results = await Promise.allSettled([
    room.operate('move', { ...payload, row: 7, col: 7 }),
    room.operate('move', { ...payload, requestId: randomUUID(), row: 6, col: 6 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'stale');
  assert.equal(fake.attempts.length, 2);
  assert.equal(room.snapshot().game.moves.length, 1);
  assert.equal(fake.calls.length, 1);
});

test('human board and turn stay untouched until durable write succeeds', async (t) => {
  const { fake, room } = await make(t);
  const before = room.snapshot();
  const gate = deferred();
  fake.store.nextWrite = gate;
  const pending = room.operate('move', identity(room, { row: 7, col: 7 }));
  await tick();
  assert.deepEqual(room.snapshot(), before);
  assert.equal(fake.calls.length, 0);
  gate.resolve();
  const committed = await pending;
  assert.equal(committed.game.board[7][7], 1);
  assert.equal(committed.game.turn, 2);
  assert.equal(committed.aiThinking, true);
});

test('failed human write preserves board, identity, and request id for safe retry', async (t) => {
  const { fake, room } = await make(t);
  const before = room.snapshot();
  const payload = identity(room, { row: 7, col: 7 });
  fake.store.nextWrite = new Error('disk full');
  await assert.rejects(room.operate('move', payload), /disk full/);
  assert.deepEqual(room.snapshot(), before);
  assert.equal(fake.calls.length, 0);
  await room.operate('move', payload);
  assert.equal(room.snapshot().game.moves.length, 1);
});

test('failed mutation leaves an older pending AI task alive and able to commit', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const call = fake.calls[0];
  const before = room.snapshot();
  fake.store.nextWrite = new Error('disk full');
  await assert.rejects(room.operate('chat', identity(room, { text: 'hello' })), /disk full/);
  assert.deepEqual(room.snapshot(), before);
  assert.equal(call.signal.aborted, false);
  await finishAI(room, call);
  assert.equal(legalSnapshot(room).moves.length, 2);
});

test('AI board remains unchanged until its durable write succeeds', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const before = room.snapshot();
  const gate = deferred();
  fake.store.nextWrite = gate;
  fake.calls[0].resolve(modelResult(fake.calls[0]));
  await tick();
  assert.deepEqual(room.snapshot(), before);
  gate.resolve();
  await tick();
  await room.operate('state');
  assert.equal(legalSnapshot(room).moves.length, 2);
  assert.equal(room.snapshot().aiThinking, false);
});

test('human and model moves are legal and rejected wrong-turn/occupied/out-of-bounds moves do not commit', async (t) => {
  const { fake, room } = await make(t);
  await assert.rejects(room.operate('move', identity(room, { row: -1, col: 0 })), { code: 'illegal-move' });
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  await assert.rejects(room.operate('move', identity(room, { row: 7, col: 8 })), { code: 'wrong-turn' });
  await finishAI(room, fake.calls[0]);
  const before = fake.attempts.length;
  await assert.rejects(room.operate('move', identity(room, { row: 7, col: 7 })), { code: 'illegal-move' });
  assert.equal(fake.attempts.length, before);
  const game = legalSnapshot(room);
  assert.equal(game.moves[0].source, 'human');
  assert.equal(game.moves[1].source, 'model');
});

for (const [operation, extra, newTask] of [
  ['undo', {}, false], ['newGame', {}, false], ['resign', {}, false],
  ['chat', { text: 'Your turn!' }, true], ['settings', { comments: false }, true],
]) {
  test(`${operation} aborts an old AI reply and prevents stale board/comment/session commits`, async (t) => {
    const { fake, room } = await make(t);
    await room.operate('move', identity(room, { row: 7, col: 7 }));
    const stale = fake.calls[0];
    await room.operate(operation, identity(room, extra));
    assert.equal(stale.signal.aborted, true);
    const before = room.snapshot();
    await finishAI(room, stale, { comment: 'STALE COMMENT' });
    assert.deepEqual(room.snapshot().game, before.game);
    assert.equal(fake.calls.length, newTask ? 2 : 1);
    assert.equal(room.snapshot().game.chat.some((message) => message.text === 'STALE COMMENT'), false);
    if (newTask) {
      await finishAI(room, fake.calls[1]);
      assert.equal(legalSnapshot(room).moves.length, 2);
    }
  });
}

for (const scenario of ['timeout', 'outside candidates', 'occupied square', 'missing move']) {
  test(`AI ${scenario} uses a legal engine fallback`, async (t) => {
    const { fake, room } = await make(t);
    await room.operate('move', identity(room, { row: 7, col: 7 }));
    const call = fake.calls[0];
    if (scenario === 'timeout') call.reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
    else call.resolve(modelResult(call, { move: scenario === 'outside candidates' ? { row: 0, col: 0 }
      : scenario === 'occupied square' ? { row: 7, col: 7 } : undefined }));
    await tick();
    await room.operate('state');
    const game = legalSnapshot(room);
    assert.equal(game.moves.length, 2);
    assert.equal(game.lastSource, 'engine');
    assert.equal(game.sessionId, null);
  });
}

test('hint has no board effect and its snapshot cannot mutate live hint', async (t) => {
  const { fake, room } = await make(t);
  const board = room.snapshot().game.board;
  const result = await room.operate('hint', identity(room));
  assert.deepEqual(result.game.board, board);
  assert.equal(result.game.moves.length, 0);
  assert.ok(gomokuAdapter.isLegal(board, result.hint, 1));
  result.hint.row = -1;
  assert.notEqual(room.snapshot().hint.row, -1);
  assert.equal(fake.calls.length, 0);
});

test('white new game starts exactly one DSH black opening; white undo keeps the opening', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('newGame', identity(room, { playerColor: 2, difficulty: 'hard' }));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].input.color, 1);
  await room.operate('state');
  assert.equal(fake.calls.length, 1);
  await finishAI(room, fake.calls[0]);
  const opening = copy(room.snapshot().game.moves[0]);
  await room.operate('move', identity(room, { row: 0, col: 0 }));
  await finishAI(room, fake.calls[1]);
  assert.equal(legalSnapshot(room).moves.length, 3);
  await room.operate('undo', identity(room));
  const game = legalSnapshot(room);
  assert.deepEqual(game.moves, [opening]);
  assert.equal(game.turn, 2);
  assert.equal(fake.calls.length, 2);
});

test('black undo returns to before the latest human move and removes its AI reply/comment', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  await finishAI(room, fake.calls[0]);
  await room.operate('undo', identity(room));
  const game = legalSnapshot(room);
  assert.equal(game.moves.length, 0);
  assert.equal(game.turn, 1);
  assert.equal(game.chat.filter((message) => message.who === 'dsh').length, 0);
});

test('resign creates a terminal state and does not allow extra move/undo-less/hint commits', async (t) => {
  const { room } = await make(t);
  await room.operate('resign', identity(room));
  const game = room.snapshot().game;
  assert.equal(game.status, 'resigned');
  assert.equal(game.winner, 2);
  assert.equal(game.turn, null);
  await assert.rejects(room.operate('move', identity(room, { row: 0, col: 0 })), { code: 'game-over' });
  await assert.rejects(room.operate('hint', identity(room)), { code: 'game-over' });
  await assert.rejects(room.operate('undo', identity(room)), { code: 'no-undo' });
});

test('recovery durably rotates stale identity, clears hint, recomputes play, resumes AI exactly once', async (t) => {
  const seed = await seedWithHumanMove();
  seed.current.hint = { row: 8, col: 8 };
  const old = copy(seed.current);
  const { fake, room } = await make(t, seed);
  const snapshot = room.snapshot();
  assert.equal(snapshot.recovery, true);
  assert.equal(snapshot.game.version, old.version + 1);
  assert.notEqual(snapshot.game.turnIdentity, old.turnIdentity);
  assert.equal(snapshot.game.hint, null);
  assert.deepEqual(snapshot.game.board, old.board);
  assert.equal(fake.data().current.version, snapshot.game.version);
  assert.equal(fake.calls.length, 1);
  await room.operate('state');
  await room.operate('state');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].input.gameId, old.id);
  await assert.rejects(room.operate('chat', { gameId: old.id, version: old.version, turnIdentity: old.turnIdentity, requestId: randomUUID(), text: 'old tab' }), { code: 'stale' });
  await finishAI(room, fake.calls[0]);
  assert.equal(legalSnapshot(room).moves.length, 2);
});

for (const corruption of ['board', 'chat element', 'request id element', 'archive without current']) {
  test(`invalid persisted ${corruption} is rejected before any overwrite`, async () => {
    const seed = await seedWithHumanMove();
    if (corruption === 'board') seed.current.board[0][0] = 2;
    if (corruption === 'chat element') seed.current.chat.push(null);
    if (corruption === 'request id element') seed.current.requestIds.push(null);
    if (corruption === 'archive without current') { seed.current = null; seed.archived = [{ adapter: 'gomoku' }]; }
    const fake = fixture(seed);
    let room;
    try {
      await assert.rejects(async () => { room = await fake.create(); }, { code: 'unavailable' });
      assert.equal(fake.attempts.length, 0);
      assert.deepEqual(fake.data(), seed);
    } finally { if (room) await room.dispose(); else await fake.player.dispose(); }
  });
}

test('archive retains only six replayable games and exposes detached histories', async (t) => {
  const { room } = await make(t);
  for (let index = 0; index < 8; index += 1) {
    await room.operate('move', identity(room, { row: index, col: index }));
    await room.operate('newGame', identity(room));
  }
  const snapshot = room.snapshot();
  assert.equal(snapshot.savedGames.length, 6);
  assert.equal(new Set(snapshot.savedGames.map((game) => game.id)).size, 6);
  for (const game of snapshot.savedGames) assert.equal(gomokuAdapter.replay(game.moves).moves.length, 1);
  snapshot.savedGames[0].moves[0].row = -1;
  assert.notEqual(room.snapshot().savedGames[0].moves[0].row, -1);
});

test('comment toggle yields at most one bounded scheduled comment per committed turn', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  await room.operate('settings', identity(room, { comments: false }));
  assert.equal(fake.calls[1].input.commentsAllowed, false);
  await finishAI(room, fake.calls[0], { comment: 'stale' });
  await finishAI(room, fake.calls[1], { comment: 'should be omitted' });
  assert.equal(room.snapshot().game.chat.filter((message) => message.who === 'dsh').length, 0);
  await room.operate('state', { locale: 'en-US' });
  await room.operate('settings', identity(room, { comments: true }));
  const square = gomokuAdapter.legalMoves(room.snapshot().game.board, 1)[0];
  await room.operate('move', identity(room, square));
  const call = fake.calls[2];
  assert.equal(call.input.locale, 'en-us');
  assert.equal(call.input.commentsAllowed, true);
  await finishAI(room, call, { comment: '🙂'.repeat(80) + '\nextra' });
  await finishAI(room, call);
  const comments = room.snapshot().game.chat.filter((message) => message.who === 'dsh');
  assert.equal(comments.length, 1);
  assert.ok([...comments[0].text].length <= 60);
  assert.equal(new Set(comments.map((message) => message.turn)).size, comments.length);
});

test('AI durable write failure preserves position and restarts only one fresh task on next state', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const before = room.snapshot().game;
  fake.store.nextWrite = new Error('disk full during AI');
  fake.calls[0].resolve(modelResult(fake.calls[0]));
  await tick();
  assert.deepEqual(room.snapshot().game, before);
  assert.equal(fake.warnings.length, 1);
  await room.operate('state');
  await room.operate('state');
  assert.equal(fake.calls.length, 2);
  assert.notEqual(fake.calls[1].input.requestId, fake.calls[0].input.requestId);
  await finishAI(room, fake.calls[1]);
  assert.equal(legalSnapshot(room).moves.length, 2);
});

test('recovery preserves the dedicated model session id for the one resumed AI task', async (t) => {
  const original = await make(t);
  await original.room.operate('move', identity(original.room, { row: 7, col: 7 }));
  await finishAI(original.room, original.fake.calls[0]);
  await original.room.operate('move', identity(original.room, { row: 0, col: 0 }));
  const seed = original.fake.data();
  assert.match(seed.current.sessionId, /^chess-room-[0-9a-f-]{36}$/);
  const restored = await make(t, seed);
  assert.equal(restored.fake.calls.length, 1);
  assert.equal(restored.fake.calls[0].input.sessionId, seed.current.sessionId);
  assert.equal(restored.fake.calls[0].input.color, 2);
  await restored.room.operate('state');
  assert.equal(restored.fake.calls.length, 1);
});

test('request ids remain deduplicated across new games', async (t) => {
  const { room } = await make(t);
  const payload = identity(room);
  await room.operate('newGame', payload);
  await assert.rejects(room.operate('chat', identity(room, { requestId: payload.requestId, text: 'duplicate' })), { code: 'stale' });
});

test('control-only chat is rejected before creating an unrecoverable empty text record', async (t) => {
  const { fake, room } = await make(t);
  const before = room.snapshot();
  await assert.rejects(room.operate('chat', identity(room, { text: '\u0000\u0001' })), { code: 'bad-request' });
  assert.deepEqual(room.snapshot(), before);
  assert.equal(fake.attempts.length, 1);
});

test('terminal recovery rebuilds a won winning line from replay and never starts AI', async (t) => {
  const base = await make(t);
  const seed = base.fake.data();
  const moves = [];
  for (let index = 0; index < 5; index += 1) {
    moves.push({ row: 0, col: index, color: 1, source: 'human' });
    if (index < 4) moves.push({ row: 14, col: index * 2, color: 2, source: 'engine' });
  }
  const replay = gomokuAdapter.replay(moves);
  Object.assign(seed.current, { board: replay.board, moves, status: replay.status,
    winner: replay.winner, turn: replay.nextColor, winningLine: [{ row: 99, col: 99 }] });
  const restored = await make(t, seed);
  assert.equal(restored.room.snapshot().game.status, 'won');
  assert.deepEqual(restored.room.snapshot().game.winningLine, replay.winningLine);
  assert.equal(restored.fake.calls.length, 0);
});

test('resigned recovery preserves terminal winner and clears any bogus winning line', async (t) => {
  const original = await make(t);
  await original.room.operate('resign', identity(original.room));
  const seed = original.fake.data();
  seed.current.winningLine = [{ row: 99, col: 99 }];
  const restored = await make(t, seed);
  const game = restored.room.snapshot().game;
  assert.equal(game.status, 'resigned');
  assert.equal(game.turn, null);
  assert.equal(game.winner, 2);
  assert.deepEqual(game.winningLine, []);
  assert.equal(restored.fake.calls.length, 0);
});

test('real account projection with a fake service clears old identity and aborts AI before new profile arrives', async (t) => {
  const fake = fixture();
  let state = { status: 'signed-out' };
  let user = { id: 'account-A', name: 'Alice', avatarUrl: null, contact: 'private@example.invalid', token: 'secret-token' };
  let profileGate;
  const queued = [];
  const waiters = [];
  let ended = false;
  function emit(next) {
    state = next;
    if (waiters.length) waiters.shift()({ done: false, value: next });
    else queued.push(next);
  }
  fake.ctx.deepseekAccount = {
    async getState() { return state; },
    async getProfile() { return profileGate ? profileGate.promise : { status: 'ready', value: copy(user) }; },
    watch(signal, includeIdentity) {
      assert.equal(includeIdentity, true);
      signal.addEventListener('abort', () => { ended = true; while (waiters.length) waiters.shift()({ done: true }); }, { once: true });
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          if (ended) return Promise.resolve({ done: true });
          if (queued.length) return Promise.resolve({ done: false, value: queued.shift() });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
  const room = await createChessRoom(fake.ctx, { store: fake.store, player: fake.player });
  t.after(() => room.dispose());
  await tick();
  emit({ status: 'credential-stored' });
  await tick();
  await room.operate('state');
  assert.equal(room.snapshot().profile.name, 'Alice');
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const stale = fake.calls.at(-1);
  const old = room.snapshot();
  profileGate = deferred();
  emit({ status: 'credential-stored' });
  await tick();
  assert.equal(room.snapshot().profile.name, null);
  assert.equal(stale.signal.aborted, true);
  await room.operate('state');
  assert.ok(room.snapshot().game.version > old.game.version);
  assert.notEqual(room.snapshot().game.turnIdentity, old.game.turnIdentity);
  assert.equal(room.snapshot().game.sessionId, null);
  const before = room.snapshot().game;
  await finishAI(room, stale, { comment: 'old account reply' });
  assert.deepEqual(room.snapshot().game, before);
  user = { id: 'account-B', name: 'Bob', avatarUrl: null, email: 'hidden@example.invalid' };
  profileGate.resolve({ status: 'ready', value: user });
  await tick();
  await room.operate('state');
  assert.equal(room.snapshot().profile.name, 'Bob');
  assert.equal(JSON.stringify(room.snapshot().profile).includes('hidden@example.invalid'), false);
  const currentTask = fake.calls.at(-1);
  emit({ status: 'signed-out' });
  await tick();
  assert.equal(currentTask.signal.aborted, true);
  assert.equal(room.snapshot().profile.name, null);
  assert.equal(room.snapshot().profile.signedIn, false);
  await room.operate('state');
});

test('default lazy initialization shares one authority per plugin context, then releases it on disposal', async (t) => {
  const opening = deferred();
  let opens = 0, writes = 0, closes = 0;
  let stored;
  const ctx = {
    logger: { warn() {} }, tools: { get: () => undefined },
    effect(setup) { return setup(); },
    storageDomain: {
      async open(spec) {
        opens += 1;
        await opening.promise;
        stored ??= copy(spec.global.initial);
        return {
          global: {
            get: () => copy(stored),
            async set(value) { spec.global.schema.parse(value); stored = copy(value); writes += 1; },
          },
          async close() { closes += 1; },
        };
      },
    },
    deepseekAccount: {
      async getState() { return { status: 'signed-out' }; },
      async getProfile() { throw new Error('signed-out profile must not be queried'); },
      watch(signal, includeIdentity) {
        assert.equal(includeIdentity, true);
        return { async *[Symbol.asyncIterator]() { await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true })); } };
      },
    },
  };
  const firstPromise = createChessRoom(ctx);
  const secondPromise = createChessRoom(ctx);
  assert.equal(firstPromise, secondPromise);
  assert.equal(opens, 1);
  opening.resolve();
  const first = await firstPromise;
  t.after(() => first.dispose());
  assert.equal(await secondPromise, first);
  assert.equal(writes, 1);
  const runtimeId = first.snapshot().runtimeId;
  await first.dispose();
  assert.equal(closes, 1);
  const second = await createChessRoom(ctx);
  t.after(() => second.dispose());
  assert.notEqual(second, first);
  assert.notEqual(second.snapshot().runtimeId, runtimeId);
  assert.equal(opens, 2);
  assert.equal(writes, 2);
});

test('sustainable cadence emits one proactive sentence every two rounds and no waiting nudges', async (t) => {
  const { fake, room } = await make(t);
  for (let round = 0; round < 4; round++) {
    const square = gomokuAdapter.legalMoves(room.snapshot().game.board, 1).find(move => move.row === round * 3 && move.col === 0);
    await room.operate('move', identity(room, square));
    const call = fake.calls.at(-1);
    assert.equal(call.input.commentsAllowed, round % 2 === 1);
    assert.equal(call.input.replyMode, round % 2 === 1 ? 'proactive' : 'none');
    await room.operate('state');
    await room.operate('state');
    assert.equal(fake.calls.length, round + 1);
    await finishAI(room, call, {comment:'棋盘上接着较量，看看谁先沉不住气？'});
    assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, Math.floor((round + 1) / 2));
  }
  const comments = room.snapshot().game.chat.filter(message => message.who === 'dsh');
  assert.deepEqual(comments.map(message => message.turn), [4,8]);
  assert.equal(new Set(comments.map(message => message.turn)).size, comments.length);
});

test('explicit quiet aborts immediately before disk commit, persists, and unrelated chatter cannot re-enable', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, {row:7,col:7}));
  const old = fake.calls[0];
  const gate = deferred();
  fake.store.nextWrite = gate;
  const quiet = room.operate('chat', identity(room, {text:'请安静一点，我想专心下棋'}));
  await tick();
  assert.equal(old.signal.aborted, true, 'cancellation does not wait for durable storage');
  assert.equal(room.snapshot().game.settings.comments, true, 'durable settings do not advance early');
  old.resolve(modelResult(old, {comment:'STALE LOUD COMMENT'}));
  gate.resolve();
  await quiet;
  assert.equal(fake.data().current.settings.comments, false);
  assert.equal(fake.calls[1].input.commentsAllowed, false);
  assert.equal(fake.calls[1].input.replyMode, 'none');
  assert.equal(fake.calls[1].input.chat.length, 0);
  await room.operate('chat', identity(room, {text:'你这步有点意思，继续吧'}));
  assert.equal(room.snapshot().game.settings.comments, false);
  const muted = fake.calls.at(-1);
  await finishAI(room, muted, {comment:'不应该出现'});
  assert.equal(room.snapshot().game.chat.some(message => message.who === 'dsh'), false);
  assert.ok(room.snapshot().game.chat.filter(message => message.who === 'player').every(message => message.turn === 0));
  const recovered = await make(t, fake.data());
  assert.equal(recovered.room.snapshot().settings.comments, false);
  await recovered.room.operate('newGame', identity(recovered.room));
  assert.equal(recovered.room.snapshot().settings.comments, false);
  await room.operate('settings', identity(room, {comments:true}));
  await room.operate('chat', identity(room, {text:'来，接着斗嘴！'}));
  await room.operate('move', identity(room, {row:0,col:0}));
  const enabled = fake.calls.at(-1);
  assert.equal(enabled.input.commentsAllowed, true);
  assert.equal(enabled.input.replyMode, 'normal');
  assert.deepEqual(enabled.input.chat.map(message => message.text), ['来，接着斗嘴！']);
  await finishAI(room, enabled, {comment:'话先记着，咱们在棋盘上继续见真章。'});
  assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 1);
});

test('quiet disk failure preserves durable board/settings but still cancels old speech safely', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, {row:7,col:7}));
  const before = copy(room.snapshot().game);
  const old = fake.calls[0];
  fake.store.nextWrite = new Error('disk unavailable');
  await assert.rejects(room.operate('chat', identity(room, {text:'别再说话'})), /disk unavailable/);
  assert.deepEqual(room.snapshot().game, before);
  assert.equal(old.signal.aborted, true);
  await finishAI(room, old, {comment:'stale'});
  assert.deepEqual(room.snapshot().game, before);
  assert.equal(fake.calls.length, 2, 'next explicit state recovers one fresh legal-move task');
});

for (const [text, mode, limit] of [['接招吧', 'normal',60], ['介绍规则', 'rule',100], ['请详细讲解五子棋规则', 'detail',240]]) {
  test(`controller derives ${mode} limit from pending player request and consumes it once`, async (t) => {
    const { fake, room } = await make(t);
    await room.operate('chat', identity(room, {text}));
    assert.equal(fake.calls.length, 0, 'chat alone never plays the human move');
    await room.operate('move', identity(room, {row:7,col:7}));
    const call = fake.calls.at(-1);
    assert.equal(call.input.replyMode, mode);
    assert.equal(call.input.commentLimit, limit);
    assert.equal(call.input.commentsAllowed, true, 'requested reply bypasses proactive cadence');
    assert.deepEqual(call.input.chat.map(message => message.text), [text]);
    await finishAI(room, call, {comment:'棋'.repeat(limit)});
    const reply = room.snapshot().game.chat.findLast(message => message.who === 'dsh');
    assert.equal([...reply.text].length, limit);
    assert.equal(room.snapshot().game.chat.find(message => message.who === 'player').turn, 0);
    const restored = await make(t, fake.data());
    await restored.room.operate('move', identity(restored.room, {row:0,col:0}));
    assert.equal(restored.fake.calls[0].input.chat.length, 0);
    assert.equal(restored.fake.calls[0].input.replyMode, 'proactive');
  });
}

for (const comment of ['棋'.repeat(61), '一句。两句。三句。', '我必胜，这步形成活四！', '下一手我会下在H8', '候选评分最高']) {
  test(`controller independently drops unusable dialogue and preserves legal model choice: ${comment.slice(0,12)}`, async (t) => {
    const { fake, room } = await make(t);
    await room.operate('chat', identity(room, {text:'接着较量啊'}));
    await room.operate('move', identity(room, {row:7,col:7}));
    const call = fake.calls.at(-1);
    await finishAI(room, call, {comment});
    const g = legalSnapshot(room);
    assert.equal(g.moves.at(-1).source, 'model');
    assert.equal(g.chat.some(message => message.text === comment), false);
    assert.equal(g.chat.find(message => message.who === 'player').turn, 0);
    assert.ok(g.chat.filter(message => message.who === 'dsh').every(message => [...message.text].length <= 60));
    await room.operate('undo', identity(room));
    assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 0);
    await room.operate('move', identity(room, {row:6,col:6}));
    assert.equal(fake.calls.at(-1).input.chat.length, 0, 'undo never resurrects an answered request');
    assert.equal(fake.calls.at(-1).input.replyMode, 'none');
  });
}

for(const [first,second] of [['棋盘上接着较量！',' 棋盘上，接着较量。'],['哼，这手有点意思。','哼！你这回倒挺认真。'],['就这？接着来。','就这！换个花样试试。'],['你确定？棋盘上见。','你确定！别急着得意。']]) {
  test(`controller replaces consecutive repeated text/prefix with distinct safe banter: ${first}`, async (t) => {
    const {fake,room} = await make(t);
    await room.operate('chat',identity(room,{text:'接招吧'}));
    await room.operate('move',identity(room,{row:7,col:7}));
    await finishAI(room,fake.calls.at(-1),{comment:first});
    assert.equal(room.snapshot().game.chat.findLast(message=>message.who==='dsh').text,first);
    await room.operate('chat',identity(room,{text:'继续较量'}));
    await room.operate('move',identity(room,{row:6,col:6}));
    await finishAI(room,fake.calls.at(-1),{comment:second});
    const replies=room.snapshot().game.chat.filter(message=>message.who==='dsh');
    assert.equal(replies.length,2);
    assert.notEqual(replies[1].text,second.trim());
    assert.notEqual(replies[1].text,replies[0].text);
    assert.doesNotMatch(replies[1].text,/^(哼|就这|你确定)/);
    assert.equal(room.snapshot().game.moves.at(-1).source,'model');
    assert.ok(room.snapshot().game.chat.filter(message=>message.who==='player').every(message=>message.turn===0));
  });
}

for(const [question,mode,comment,accepted] of [['活四是什么？','rule','活四是两端都能续成五子的四连。',true],['请详细解释双四','detail','如果你形成双四，通常对方难以同时防住两个威胁。',true],['介绍双三规则','rule','双三是两个活三威胁；我的双三已经形成了。',false]]) {
  test(`controller preserves abstract ${mode} reply but never certifies this board: ${question}`,async(t)=>{
    const {fake,room}=await make(t);
    await room.operate('chat',identity(room,{text:question}));
    await room.operate('move',identity(room,{row:7,col:7}));
    const call=fake.calls.at(-1);
    assert.equal(call.input.replyMode,mode);
    await finishAI(room,call,{comment});
    assert.equal(room.snapshot().game.chat.some(message=>message.who==='dsh'&&message.text===comment),accepted);
    assert.equal(room.snapshot().game.moves.at(-1).source,'model');
  });
}

for(const text of ['只下棋不聊天','别斗嘴','不喜欢你的调侃']) test(`controller style-only quiet request persists without general instruction execution: ${text}`,async(t)=>{
  const {fake,room}=await make(t);
  await room.operate('move',identity(room,{row:7,col:7}));
  const old=fake.calls[0];
  await room.operate('chat',identity(room,{text}));
  assert.equal(old.signal.aborted,true);
  assert.equal(fake.data().current.settings.comments,false);
  assert.equal(fake.calls.at(-1).input.commentsAllowed,false);
  assert.equal(fake.calls.at(-1).input.chat.length,0);
});

test('new game discards old chat requests while archive and settings remain durable', async (t) => {
  const { fake, room } = await make(t);
  await room.operate('chat', identity(room, {text:'请详细讲讲规则'}));
  await room.operate('move', identity(room, {row:7,col:7}));
  const stale = fake.calls.at(-1);
  await room.operate('newGame', identity(room));
  assert.equal(stale.signal.aborted, true);
  assert.equal(room.snapshot().game.chat.length, 0);
  assert.equal(fake.data().archived[0].chat[0].text, '请详细讲讲规则');
  const restored = await make(t, fake.data());
  await restored.room.operate('move', identity(restored.room, {row:7,col:7}));
  assert.equal(restored.fake.calls[0].input.chat.length, 0);
  assert.equal(restored.fake.calls[0].input.replyMode, 'none');
});

async function terminalSeed(t, dshWins = false) {
  const base = await make(t);
  const seed = base.fake.data();
  const moves = [];
  for (let index = 0; index < 4; index++) {
    moves.push({row:dshWins?14:0,col:dshWins?index*2:index,color:1,source:'human'});
    moves.push({row:dshWins?0:14,col:dshWins?index:index*2,color:2,source:'model'});
  }
  if(dshWins)moves.push({row:12,col:12,color:1,source:'human'});
  const replay = gomokuAdapter.replay(moves);
  Object.assign(seed.current, {board:replay.board,moves,status:replay.status,winner:replay.winner,turn:replay.nextColor,winningLine:replay.winningLine});
  return seed;
}

test('human winning move receives one fact-confirmed gracious acknowledgement, never starts model', async (t) => {
  const { fake, room } = await make(t, await terminalSeed(t));
  await room.operate('move', identity(room, {row:0,col:4}));
  const g = legalSnapshot(room);
  assert.equal(g.status, 'won');
  assert.equal(g.winner, 1);
  assert.equal(fake.calls.length, 0);
  const comments = g.chat.filter(message => message.who === 'dsh');
  assert.equal(comments.length, 1);
  assert.match(comments[0].text, /你赢了.*漂亮.*再来/);
  assert.equal(comments[0].turn, 9);
  await room.operate('state');
  await room.operate('state');
  await room.operate('chat', identity(room, {text:'这局归我吧'}));
  await room.operate('settings', identity(room, {comments:true}));
  assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 1);
  const restored = await make(t, fake.data());
  assert.equal(restored.room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 1);
  assert.equal(restored.fake.calls.length, 0);
  await room.operate('undo', identity(room));
  assert.equal(room.snapshot().game.status, 'playing');
  assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 0);
});

test('DSH terminal result replaces provisional model claims/plans even on an unscheduled round', async (t) => {
  const { fake, room } = await make(t, await terminalSeed(t, true));
  const call = fake.calls[0];
  assert.equal(call.input.commentsAllowed, false);
  const win = call.input.candidates.find(move => move.row === 0 && move.col === 4);
  assert.ok(win);
  await finishAI(room, call, {move:win,comment:'候选H8下一手我会下，你已经输了'});
  const g = legalSnapshot(room);
  assert.equal(g.status, 'won');
  assert.equal(g.winner, 2);
  const comments = g.chat.filter(message => message.who === 'dsh');
  assert.equal(comments.length, 1);
  assert.match(comments[0].text, /五子已连成.*这局归我/);
  assert.doesNotMatch(comments[0].text, /候选|H8|下一手/);
  assert.equal(room.snapshot().expression, 'victory');
  await room.operate('state');
  assert.equal(fake.calls.length, 1);
});

test('quiet terminal move emits no acknowledgement even when outcome is confirmed', async (t) => {
  const seed = await terminalSeed(t);
  seed.current.settings.comments = false;
  const { room } = await make(t, seed);
  await room.operate('move', identity(room, {row:0,col:4}));
  assert.equal(room.snapshot().game.status, 'won');
  assert.equal(room.snapshot().game.chat.filter(message => message.who === 'dsh').length, 0);
});

test('view revision is monotonic within one runtime and runtime identity changes on recovery', async (t) => {
  const { fake, room } = await make(t);
  const first = room.snapshot();
  const after = await room.operate('chat', identity(room, { text: 'hello' }));
  assert.ok(after.revision > first.revision);
  assert.equal(after.runtimeId, first.runtimeId);
  assert.equal(typeof first.runtimeId, 'string');
  const another = await make(t, fake.data());
  assert.notEqual(another.room.snapshot().runtimeId, first.runtimeId);
});
