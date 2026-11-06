import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createChessRoom } from '../host/room-v4.js';
import { createStorage, envelopeSchema, gameSchema, validateSavedGame, createStage, STAGE_EVENT_LIMIT } from '../host/persistence-v4.js';
import { gomokuAdapter } from '../host/rules.js';

const copy = value => structuredClone(value);
const initial = () => ({ format: 1, revision: 0, current: null, archived: [] });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function identity(room, extra = {}) {
  const g = room.snapshot().game;
  return { gameId: g.id, version: g.version, turnIdentity: g.turnIdentity, requestId: randomUUID(), ...extra };
}
function fixture(seed = initial()) {
  let persisted = copy(seed);
  const attempts = [], calls = [], warnings = [];
  const store = {
    nextWrite: null,
    read: () => copy(persisted),
    async write(value) {
      attempts.push(copy(value));
      const plan = store.nextWrite; store.nextWrite = null;
      if (plan instanceof Error) throw plan;
      if (plan) await plan.promise;
      persisted = copy(value);
    },
    async close() {},
  };
  const player = {
    choose(input, signal) {
      const pending = deferred();
      const call = { input: copy(input), signal, resolve: pending.resolve, reject: pending.reject };
      calls.push(call); return pending.promise;
    },
    async dispose() { for (const call of calls) call.reject(new Error('disposed fixture')); },
  };
  const account = { snapshot: { id: 'fake-account', identityRevision: 1, name: 'Player', avatarUrl: null, signedIn: true }, async refresh() {}, async dispose() {} };
  const ctx = { logger: { warn: (...args) => warnings.push(args) }, tools: { get: () => undefined } };
  return { ctx, store, player, account, attempts, calls, warnings, data: () => copy(persisted),
    create: () => createChessRoom(ctx, { store, player, account }) };
}
async function make(t, seed) {
  const fake = fixture(seed), room = await fake.create();
  t.after(() => room.dispose()); return { fake, room };
}
function modelResult(call, extra = {}) {
  return { move: copy(call.input.candidates[0]), source: 'model', comment: '棋盘上继续见真章。', sessionId: `chess-room-${randomUUID()}`, ...extra };
}
async function finishAI(room, call, extra = {}) {
  call.resolve(modelResult(call, extra)); await tick(); return room.operate('state');
}
async function pair(t, seed) {
  const value = await make(t, seed);
  await value.room.operate('move', identity(value.room, { row: 7, col: 7 }));
  await finishAI(value.room, value.fake.calls.at(-1)); return value;
}
async function seeded(t, moves, playerColor = 1) {
  const { fake } = await make(t);
  const seed = fake.data(), replay = gomokuAdapter.replay(moves);
  Object.assign(seed.current, { moves: copy(moves), board: replay.board, status: replay.status, winner: replay.winner,
    turn: replay.nextColor, winningLine: replay.winningLine, playerColor });
  delete seed.current.stage; return seed;
}
function almostWon(humanWins = true, playerColor = 1) {
  const winner = humanWins ? playerColor : 3 - playerColor, moves = [];
  for (let index = 0; index < 4; index++) {
    for (const color of [1, 2]) moves.push({ row: color === winner ? 0 : 14, col: color === winner ? index : index * 2,
      color, source: color === playerColor ? 'human' : 'model' });
  }
  // Make the potential winner the next color, with legal turn alternation.
  if (winner === 2) moves.push({ row: 12, col: 12, color: 1, source: playerColor === 1 ? 'human' : 'model' });
  return moves;
}

// A completely drawn legal board: no horizontal, vertical, or diagonal five.
function drawMoves() {
  const squares = { 1: [], 2: [] };
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    const color = (Math.floor(row / 2) + col) % 2 + 1;
    squares[color].push({ row, col, color, source: color === 1 ? 'human' : 'engine' });
  }
  const moves = [];
  for (let i = 0; i < 225; i++) moves.push(squares[i % 2 + 1].shift());
  assert.equal(gomokuAdapter.replay(moves).status, 'draw'); return moves;
}

test('v4 is isolated, durably initializes stage format 1, and exposes detached snapshot structures', async t => {
  const { fake, room } = await pair(t);
  const snapshot = room.snapshot();
  assert.equal(snapshot.release, '1.1.0');
  assert.equal(snapshot.stage.format, 1);
  assert.equal(snapshot.stage.gameId, snapshot.game.id);
  assert.equal(snapshot.stage.version, snapshot.game.version);
  assert.equal(snapshot.stage.events.length, 1);
  assert.deepEqual(fake.data().current.stage, snapshot.game.stage);
  snapshot.stage.events[0].row = -1; snapshot.game.stage.events[0].moveId = 'bad';
  snapshot.game.moves[0].moveId = 'bad'; snapshot.savedGames.push({ id: 'fake' });
  assert.notEqual(room.snapshot().stage.events[0].row, -1);
  assert.notEqual(room.snapshot().game.stage.events[0].moveId, 'bad');
  assert.notEqual(room.snapshot().game.moves[0].moveId, 'bad');
  assert.equal(room.snapshot().savedGames.length, 0);
});

test('failed human persistence exposes neither board, move IDs nor stage events; retry is safe', async t => {
  const { fake, room } = await make(t), before = room.snapshot(), payload = identity(room, { row: 7, col: 7 });
  fake.store.nextWrite = new Error('human disk failed');
  await assert.rejects(room.operate('move', payload), /human disk failed/);
  assert.deepEqual(room.snapshot(), before); assert.deepEqual(fake.data().current.moves, []);
  const result = await room.operate('move', payload);
  assert.equal(result.stage.events.length, 0, 'ordinary human placement does not trigger DSH choreography');
  assert.match(result.game.moves[0].moveId, /^[0-9a-f-]{36}$/);
  assert.equal(fake.calls.length, 1);
});

test('pending human winning persistence and failed write expose no victory until a successful retry', async t => {
  const seed = await seeded(t, almostWon());
  const { fake, room } = await make(t, seed), before = room.snapshot();
  const payload = identity(room, { row: 0, col: 4 }), gate = deferred();
  fake.store.nextWrite = gate;
  const pending = room.operate('move', payload); await tick();
  assert.deepEqual(room.snapshot(), before);
  assert.equal(fake.attempts.at(-1).current.stage.events[0].kind, 'human-victory', 'unexposed attempted disk record');
  gate.reject(new Error('victory disk failed'));
  await assert.rejects(pending, /victory disk failed/);
  assert.deepEqual(room.snapshot(), before);
  const won = await room.operate('move', payload);
  assert.equal(won.stage.events.length, 1); assert.equal(won.game.status, 'won');
});

for (const source of ['model', 'engine']) test(`${source} AI persistence is atomic and certifies durable exact event identities`, async t => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const before = room.snapshot(), gate = deferred(); fake.store.nextWrite = gate;
  fake.calls[0].resolve(modelResult(fake.calls[0], { source })); await tick();
  assert.deepEqual(room.snapshot(), before);
  assert.equal(fake.data().current.stage.events.length, 0);
  gate.resolve(); await tick(); const snapshot = await room.operate('state'), move = snapshot.game.moves.at(-1);
  assert.deepEqual(snapshot.stage.events, [{ kind: 'move-committed', confirmed: true, gameId: snapshot.game.id,
    version: snapshot.game.version, eventId: `move:${move.moveId}`, moveId: move.moveId, row: move.row, col: move.col, color: move.color }]);
  assert.equal(move.source, source); assert.equal(move.color, 2);
  assert.deepEqual(fake.data().current.stage.events, snapshot.stage.events);
  assert.equal(envelopeSchema.safeParse(fake.data()).success, true);
  await room.operate('state'); assert.deepEqual(room.snapshot().stage.events, snapshot.stage.events);
});

test('failed AI persistence exposes no move/event and starts exactly one fresh retry task on explicit state', async t => {
  const { fake, room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 }));
  const before = room.snapshot(); fake.store.nextWrite = new Error('AI disk failed');
  fake.calls[0].resolve(modelResult(fake.calls[0])); await tick();
  assert.deepEqual(room.snapshot().game, before.game); assert.deepEqual(room.snapshot().stage, before.stage);
  assert.equal(fake.data().current.stage.events.length, 0); assert.equal(fake.warnings.length, 1);
  await room.operate('state'); await room.operate('state'); assert.equal(fake.calls.length, 2);
  await finishAI(room, fake.calls[1]); assert.equal(room.snapshot().stage.events.length, 1);
});

for (const playerColor of [1, 2]) test(`rules-confirmed human ${playerColor} win emits exactly one human-victory, regardless of quiet setting`, async t => {
  const seed = await seeded(t, almostWon(true, playerColor), playerColor); seed.current.settings.comments = false;
  const { fake, room } = await make(t, seed);
  const won = await room.operate('move', identity(room, { row: 0, col: 4 })), move = won.game.moves.at(-1);
  assert.deepEqual(won.stage.events, [{ kind: 'human-victory', confirmed: true, gameId: won.game.id, version: won.game.version,
    eventId: `human-win:${move.moveId}`, winner: playerColor, playerColor, status: 'won' }]);
  assert.equal(won.game.winner, playerColor); assert.equal(fake.calls.length, 0);
  assert.equal(won.game.chat.some(m => m.who === 'dsh'), false);
  await room.operate('state'); await room.operate('state');
  await room.operate('chat', identity(room, { text: '我赢了！' })); await room.operate('settings', identity(room, { comments: true }));
  assert.deepEqual(room.snapshot().stage.events, won.stage.events);
  await assert.rejects(room.operate('move', identity(room, { row: 1, col: 1 })), { code: 'game-over' });
});

test('rules-confirmed DSH win emits placement only, no fake human victory or model outcome claim', async t => {
  const { fake, room } = await make(t, await seeded(t, almostWon(false)));
  const call = fake.calls[0], win = call.input.candidates.find(move => move.row === 0 && move.col === 4);
  assert.ok(win); await finishAI(room, call, { move: win, comment: '你赢了，快打我吧！' });
  const snapshot = room.snapshot();
  assert.equal(snapshot.game.status, 'won'); assert.equal(snapshot.game.winner, 2);
  assert.equal(snapshot.stage.events.length, 1); assert.equal(snapshot.stage.events[0].kind, 'move-committed');
  assert.equal(snapshot.game.chat.some(m => m.text === '你赢了，快打我吧！'), false);
});

test('resignation and a full rules-confirmed draw never emit human-victory', async t => {
  const resigned = await make(t); await resigned.room.operate('resign', identity(resigned.room));
  assert.equal(resigned.room.snapshot().stage.events.length, 0);
  const moves = drawMoves(), seed = await seeded(t, moves.slice(0, -1));
  const drawn = await make(t, seed), last = moves.at(-1);
  const result = await drawn.room.operate('move', identity(drawn.room, last));
  assert.equal(result.game.status, 'draw'); assert.equal(result.game.winner, null); assert.equal(result.stage.events.length, 0);
});

test('recovery durably preserves move/event identities, rotates authority and fences old ledger without replay', async t => {
  const original = await pair(t), old = original.room.snapshot();
  const restored = await make(t, original.fake.data()), snapshot = restored.room.snapshot();
  assert.equal(snapshot.recovery, true); assert.equal(snapshot.game.version, old.game.version + 1);
  assert.notEqual(snapshot.game.turnIdentity, old.game.turnIdentity); assert.notEqual(snapshot.runtimeId, old.runtimeId);
  assert.notEqual(snapshot.stage.epoch, old.stage.epoch); assert.equal(snapshot.stage.replayThroughVersion, snapshot.game.version);
  assert.deepEqual(snapshot.stage.events, old.stage.events); assert.deepEqual(snapshot.game.moves, old.game.moves);
  assert.deepEqual(snapshot.stage.events.filter(event => event.version > snapshot.stage.replayThroughVersion), []);
  assert.deepEqual(restored.fake.data().current.stage, snapshot.game.stage);
  assert.equal(restored.fake.calls.length, 0);
  await restored.room.operate('move', identity(restored.room, { row: 0, col: 0 }));
  await finishAI(restored.room, restored.fake.calls[0]);
  assert.equal(restored.room.snapshot().stage.events.filter(event => event.version > snapshot.stage.replayThroughVersion).length, 1);
});

test('won recovery retains terminal event identity but fences it and never synthesizes another victory', async t => {
  const original = await make(t, await seeded(t, almostWon()));
  await original.room.operate('move', identity(original.room, { row: 0, col: 4 }));
  const restored = await make(t, original.fake.data());
  assert.deepEqual(restored.room.snapshot().stage.events, original.room.snapshot().stage.events);
  assert.equal(restored.fake.calls.length, 0);
  assert.equal(restored.room.snapshot().stage.events.filter(e => e.version > restored.room.snapshot().stage.replayThroughVersion).length, 0);
});

for (const operation of ['undo', 'newGame']) test(`${operation} durably purges replayable ledger, rotates epoch and rejects late AI`, async t => {
  const { fake, room } = await pair(t), old = room.snapshot();
  await room.operate('move', identity(room, { row: 0, col: 0 })); const stale = fake.calls.at(-1);
  const gate = deferred(); fake.store.nextWrite = gate;
  const pending = room.operate(operation, identity(room)); await tick();
  assert.equal(room.snapshot().stage.epoch, old.stage.epoch); assert.deepEqual(room.snapshot().stage.events, old.stage.events);
  gate.resolve(); const next = await pending;
  assert.notEqual(next.stage.epoch, old.stage.epoch); assert.equal(next.stage.replayThroughVersion, next.game.version);
  assert.deepEqual(next.stage.events, []); assert.equal(stale.signal.aborted, true);
  if (operation === 'undo') assert.equal(next.game.id, old.game.id); else assert.notEqual(next.game.id, old.game.id);
  await finishAI(room, stale, { comment: 'stale reply' }); assert.deepEqual(room.snapshot().stage, next.stage);
  assert.deepEqual(fake.data().current.stage.events, []);
});

test('undo invalidates a human victory and winning again creates a new move/event identity', async t => {
  const { room } = await make(t, await seeded(t, almostWon()));
  await room.operate('move', identity(room, { row: 0, col: 4 })); const old = room.snapshot();
  await room.operate('undo', identity(room)); const reverted = room.snapshot();
  assert.equal(reverted.game.status, 'playing'); assert.deepEqual(reverted.stage.events, []);
  assert.notEqual(reverted.stage.epoch, old.stage.epoch); assert.equal(reverted.stage.replayThroughVersion, reverted.game.version);
  await room.operate('move', identity(room, { row: 0, col: 4 })); const won = room.snapshot();
  assert.equal(won.stage.events.length, 1); assert.equal(won.stage.events[0].kind, 'human-victory');
  assert.notEqual(won.stage.events[0].eventId, old.stage.events[0].eventId);
  assert.ok(won.stage.events[0].version > won.stage.replayThroughVersion);
});

test('failed undo preserves epoch, durable ledger and the active AI task', async t => {
  const { fake, room } = await pair(t);
  await room.operate('move', identity(room, { row: 0, col: 0 })); const before = room.snapshot(), old = fake.calls.at(-1);
  fake.store.nextWrite = new Error('undo disk failed'); await assert.rejects(room.operate('undo', identity(room)), /undo disk failed/);
  assert.deepEqual(room.snapshot(), before); assert.equal(old.signal.aborted, false);
  await finishAI(room, old); assert.equal(room.snapshot().stage.events.length, 2);
});

test('white undo retains stable DSH opening move ID but purges even its now-historical event', async t => {
  const { fake, room } = await make(t);
  await room.operate('newGame', identity(room, { playerColor: 2 })); await finishAI(room, fake.calls[0]);
  const opening = copy(room.snapshot().game.moves[0]);
  await room.operate('move', identity(room, { row: 0, col: 0 })); await finishAI(room, fake.calls[1]);
  await room.operate('undo', identity(room)); assert.deepEqual(room.snapshot().game.moves, [opening]);
  assert.deepEqual(room.snapshot().stage.events, []);
});

test('legacy current and archived moves migrate stable deterministic IDs without synthesizing historical events', async t => {
  const original = await pair(t), seed = original.fake.data();
  delete seed.current.stage; for (const move of seed.current.moves) { delete move.moveId; delete move.color; }
  seed.archived = [copy(seed.current)];
  const first = await make(t, seed), second = await make(t, seed);
  const ids = first.room.snapshot().game.moves.map(move => move.moveId);
  assert.deepEqual(second.room.snapshot().game.moves.map(move => move.moveId), ids);
  assert.equal(new Set(ids).size, ids.length); ids.forEach(id => assert.match(id, /^legacy-[0-9a-f]{64}$/));
  assert.deepEqual(first.room.snapshot().savedGames[0].moves.map(move => move.moveId), ids);
  assert.deepEqual(first.room.snapshot().stage.events, []);
  const reloaded = await make(t, first.fake.data()); assert.deepEqual(reloaded.room.snapshot().game.moves.map(move => move.moveId), ids);
  assert.deepEqual(reloaded.room.snapshot().stage.events, []);
});

test('legacy won histories migrate IDs and rebuild winning line with no historical victory event', async t => {
  const moves = almostWon(); moves.push({ row: 0, col: 4, color: 1, source: 'human' });
  const seed = await seeded(t, moves); seed.current.winningLine = [{ row: 99, col: 99 }];
  const { room } = await make(t, seed);
  assert.equal(room.snapshot().game.status, 'won'); assert.equal(room.snapshot().stage.events.length, 0);
  assert.deepEqual(room.snapshot().game.winningLine, gomokuAdapter.replay(moves).winningLine);
});

test('new move identities are not reused after undoing and placing the same coordinates', async t => {
  const { room } = await make(t);
  await room.operate('move', identity(room, { row: 7, col: 7 })); const old = room.snapshot().game.moves[0].moveId;
  await room.operate('undo', identity(room)); await room.operate('move', identity(room, { row: 7, col: 7 }));
  assert.notEqual(room.snapshot().game.moves[0].moveId, old);
});

test('ledger remains bounded to the last 32 durable AI events and reload keeps their dedup IDs', async t => {
  const moves = drawMoves().slice(0, 80).map(move => ({ ...move, moveId: randomUUID() }));
  const seed = await seeded(t, moves); seed.current.version = 100;
  seed.current.stage = createStage(0);
  seed.current.stage.events = moves.filter(move => move.color === 2).slice(-32).map((move, index) => ({
    kind: 'move-committed', confirmed: true, gameId: seed.current.id, version: 9 + index * 2,
    eventId: `move:${move.moveId}`, moveId: move.moveId, row: move.row, col: move.col, color: move.color,
  }));
  const { fake, room } = await make(t, seed), old = room.snapshot().stage.events;
  assert.equal(STAGE_EVENT_LIMIT, 32);
  const human = drawMoves()[80]; await room.operate('move', identity(room, human)); await finishAI(room, fake.calls[0]);
  const events = room.snapshot().stage.events;
  assert.equal(events.length, 32); assert.deepEqual(events.slice(0, -1), old.slice(1));
  const restored = await make(t, fake.data()); assert.deepEqual(restored.room.snapshot().stage.events, events);
});

test('hint, chat, settings, state, and fake dialogue wins invent no events and keep epoch stable', async t => {
  const { room } = await make(t), before = room.snapshot();
  await room.operate('hint', identity(room)); await room.operate('chat', identity(room, { text: '我已经赢了！' }));
  await room.operate('settings', identity(room, { comments: false })); await room.operate('state');
  assert.deepEqual(room.snapshot().stage.events, []); assert.equal(room.snapshot().stage.epoch, before.stage.epoch);
});

const corruptions = [
  ['invalid moveId', seed => { seed.current.moves[0].moveId = 'not-an-id'; }],
  ['duplicate moveId', seed => { seed.current.moves[1].moveId = seed.current.moves[0].moveId; }],
  ['null moveId', seed => { seed.current.moves[0].moveId = null; }],
  ['board mismatch', seed => { seed.current.board[0][0] = 2; }],
  ['invalid board dimensions', seed => { seed.current.board.pop(); }],
  ['invalid epoch', seed => { seed.current.stage.epoch = 'not-an-epoch'; }],
  ['future replay fence', seed => { seed.current.stage.replayThroughVersion = seed.current.version + 1; }],
  ['unknown stage property', seed => { seed.current.stage.claim = 'trust me'; }],
  ['unknown event property', seed => { seed.current.stage.events[0].claim = 'won'; }],
  ['unconfirmed event', seed => { seed.current.stage.events[0].confirmed = false; }],
  ['event gameId', seed => { seed.current.stage.events[0].gameId = 'wrong'; }],
  ['event eventId', seed => { seed.current.stage.events[0].eventId = 'wrong'; }],
  ['event moveId', seed => { seed.current.stage.events[0].moveId = randomUUID(); }],
  ['event row', seed => { seed.current.stage.events[0].row = 0; }],
  ['event color', seed => { seed.current.stage.events[0].color = 1; }],
  ['event coordinate bounds', seed => { seed.current.stage.events[0].col = 15; }],
  ['future event version', seed => { seed.current.stage.events[0].version = seed.current.version + 1; }],
  ['fractional event version', seed => { seed.current.stage.events[0].version = 1.5; }],
  ['duplicate event', seed => { seed.current.stage.events.push(copy(seed.current.stage.events[0])); }],
  ['oversized ledger', seed => { seed.current.stage.events = Array(33).fill(seed.current.stage.events[0]); }],
  ['human move masquerades as DSH event', seed => { seed.current.moves[1].source = 'human'; }],
  ['fake human victory on playing board', seed => { seed.current.stage.events = [{ kind: 'human-victory', confirmed: true,
    gameId: seed.current.id, version: seed.current.version, eventId: `human-win:${seed.current.moves[0].moveId}`, winner: 1, playerColor: 1, status: 'won' }]; }],
  ['invalid archive', seed => { seed.archived = [{ id: 'bad' }]; seed.current = null; }],
  ['invalid session identity', seed => { seed.current.sessionId = 'chess-room-forged'; }],
];
for (const [label, corrupt] of corruptions) test(`schema fails closed before write for ${label}`, async t => {
  const original = await pair(t), seed = original.fake.data(); corrupt(seed);
  assert.equal(envelopeSchema.safeParse(seed).success, false);
  const fake = fixture(seed); await assert.rejects(fake.create(), { code: 'unavailable' });
  assert.equal(fake.attempts.length, 0); assert.deepEqual(fake.data(), seed); await fake.player.dispose();
});

test('terminal certificate must reference the current final human winning move, not another move or winner', async t => {
  const { fake, room } = await make(t, await seeded(t, almostWon()));
  await room.operate('move', identity(room, { row: 0, col: 4 })); const valid = fake.data();
  for (const corrupt of [
    seed => { seed.current.stage.events[0].winner = 2; },
    seed => { seed.current.stage.events[0].playerColor = 2; },
    seed => { seed.current.stage.events[0].eventId = `human-win:${seed.current.moves[0].moveId}`; },
    seed => { seed.current.stage.events[0].status = 'resigned'; },
    seed => { seed.current.moves.at(-1).source = 'model'; },
  ]) { const seed = copy(valid); corrupt(seed); assert.equal(envelopeSchema.safeParse(seed).success, false); }
});

test('schema projects unknown legacy fields away rather than exposing or durably passing them through', async t => {
  const { fake } = await pair(t), seed = fake.data();
  seed.secret = 'envelope'; seed.current.secret = 'game'; seed.current.settings.secret = 'settings';
  seed.current.moves[0].secret = 'move'; seed.current.chat.push({ id: randomUUID(), who: 'player', text: 'hello', at: Date.now(), secret: 'chat' });
  const { room, fake: restored } = await make(t, seed);
  assert.equal(JSON.stringify(room.snapshot()).includes('secret'), false);
  assert.equal(JSON.stringify(restored.data()).includes('secret'), false);
});

test('v4 storage retains exact domain/version/format and validates full game/event boards using a real Zod schema', async t => {
  const { fake } = await pair(t); let spec, stored;
  const storage = await createStorage({ storageDomain: { async open(value) {
    spec = value; stored = copy(value.global.initial);
    return { global: { get: () => copy(stored), async set(value) { stored = copy(spec.global.schema.parse(value)); } }, async close() {} };
  } } });
  t.after(() => storage.close());
  assert.equal(spec.name, 'dsh_chess_room'); assert.equal(spec.version, 1); assert.equal(spec.layout, 'single');
  assert.deepEqual(spec.tables, {}); assert.ok(spec.global.schema instanceof z.ZodObject);
  await storage.write(fake.data()); assert.deepEqual(storage.read(), fake.data());
  const bad = fake.data(); bad.current.stage.events[0].confirmed = false;
  await assert.rejects(storage.write(bad), z.ZodError); assert.deepEqual(storage.read(), fake.data());
  await assert.rejects(storage.write({ format: 1, revision: 1, current: 'unvalidated-game', archived: [42] }), z.ZodError);
});

test('migration fails closed for invalid pre-existing IDs and unsafe version exhaustion without overwriting', async t => {
  const { fake } = await pair(t), seed = fake.data();
  delete seed.current.stage; seed.current.moves[0].moveId = 'invalid';
  assert.throws(() => validateSavedGame(seed.current), { code: 'unavailable' });
  seed.current.moves[0].moveId = randomUUID(); seed.current.version = Number.MAX_SAFE_INTEGER;
  const exhausted = fixture(seed); await assert.rejects(exhausted.create(), { code: 'unavailable' }); assert.equal(exhausted.attempts.length, 0);
  assert.equal(gameSchema.safeParse(seed.current).success, true, 'representable old version is valid but cannot be incremented');
});
