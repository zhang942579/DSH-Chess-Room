import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveEventFence, confirmedMoveMask, LIVE_EVENT_HISTORY_LIMIT, LIVE_EVENT_PENDING_LIMIT } from '../stage/live-events.js';
import { MotionDirector } from '../stage/motion-director.js';
import { measureGeometry } from '../stage/geometry.js';

const move = (id = 'm1', row = 7, col = 8, color = 2, source = 'model') =>
  ({ moveId: id, row, col, color, source });
const committed = (persisted = move(), version = 1, eventId = `e${version}`, extra = {}) =>
  ({ kind: 'move-committed', confirmed: true, gameId: 'g1', version, eventId,
    moveId: persisted.moveId, row: persisted.row, col: persisted.col, color: persisted.color, ...extra });
const victory = (version = 2, extra = {}) => ({ kind: 'human-victory', confirmed: true,
  gameId: 'g1', version, eventId: `victory${version}`, playerColor: 1, winner: 1, status: 'won', ...extra });
function snapshot({ version = 0, moves = [], events = [], runtimeId = 'r1', gameId = 'g1',
  status = 'playing', winner = null, playerColor = 1, epoch = 'epoch1', floor = 0, comments = true,
  headers = true } = {}) {
  const board = Array.from({ length: 15 }, () => Array(15).fill(0));
  for (const item of moves) board[item.row][item.col] = item.color;
  return { runtimeId, game: { id: gameId, version, board, moves: moves.map(item => ({ ...item })),
    status, winner, playerColor }, settings: { comments },
    stage: { format: 1, events: events.map(item => item === null ? null : ({ ...item })), epoch,
      ...(headers ? { gameId, version, replayThroughVersion: floor } : {}) } };
}
function ready(options) {
  const fence = new LiveEventFence(options);
  fence.consume(snapshot());
  return fence;
}
const visuals = actions => actions.filter(action => action.type === 'move' || action.type === 'defeat');
const authority = actions => actions.find(action => action.type === 'authority');
const model = event => ({ gameId: event.gameId, version: event.version,
  eventId: event.eventId, hiddenMoveId: event.moveId });
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
function fakeClock() {
  let now = 0, ticket = 0;
  const frames = new Map(), timers = new Map();
  return { now: () => now, request: cb => { frames.set(++ticket, cb); return ticket; },
    cancel: id => frames.delete(id), timeout: cb => { timers.set(++ticket, cb); return ticket; },
    clearTimeout: id => timers.delete(id),
    step(ms) { now += ms; const pending = [...frames.values()]; frames.clear(); for (const cb of pending) cb(now); },
    frames, timers };
}
function directorSetup() {
  const clock = fakeClock();
  const director = new MotionDirector({ clock, measure: () => measureGeometry({
    rootRect: { left: 0, top: 0, width: 800, height: 650 },
    boardRect: { left: 180, top: 70, width: 450, height: 450 },
    avatarRect: { left: 80, top: 480, width: 50, height: 50 } }) });
  const apply = actions => { for (const action of actions) {
    if (action.type === 'cancel') director.cancel(action.reason);
    if (action.type === 'authority' && action.reset) director.reset(action);
    if (action.type === 'move') assert.equal(director.playMove(action.event), true);
    if (action.type === 'defeat') assert.equal(director.playDefeat(action.event), true);
  } };
  return { director, clock, apply };
}

test('cold snapshot synchronizes board and skips all prior durable events, including terminal', () => {
  const persisted = move(), event = committed(persisted, 5);
  for (const terminal of [false, true]) {
    const fence = new LiveEventFence();
    const input = snapshot({ version: 5, moves: [persisted], events: [event, victory(5)],
      ...(terminal ? { status: 'won', winner: 1 } : {}) });
    const actions = fence.consume(input);
    assert.deepEqual(actions.map(action => action.type), ['cancel', 'authority']);
    assert.equal(actions[0].reason, 'first-snapshot');
    assert.equal(authority(actions).reset, true);
    assert.deepEqual(authority(actions).board, input.game.board);
    assert.deepEqual(fence.drain(), []);
    assert.deepEqual(visuals(fence.consume(input)), []);
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 6, moves: [persisted],
      events: [committed(persisted, 6, event.eventId)], ...(terminal ? { status: 'won', winner: 1 } : {}) }))), []);
  }
});

test('minimal original stage contract remains supported, without inferring missing events', () => {
  const fence = new LiveEventFence(), empty = snapshot({ headers: false });
  delete empty.stage.epoch;
  fence.consume(empty);
  const input = snapshot({ version: 1, moves: [move()], headers: false });
  delete input.stage.epoch;
  assert.deepEqual(visuals(fence.consume(input)), []);
  input.stage.events = [committed()];
  assert.deepEqual(visuals(fence.consume(input)).map(action => action.type), ['move']);
});

test('explicit reconnect and disconnect synchronize silently and discard pending/hidden stones', () => {
  const fence = ready(), event = committed(), input = snapshot({ version: 1, moves: [move()], events: [event] });
  assert.equal(visuals(fence.consume(input))[0].type, 'move');
  assert.equal(fence.boardFor(model(event))[7][8], 0);
  assert.deepEqual(fence.disconnect(), [{ type: 'cancel', reason: 'disconnect' }]);
  assert.equal(fence.boardFor(model(event))[7][8], 2);
  assert.deepEqual(fence.drain(), []);
  assert.equal(fence.consume(input)[0].reason, 'reconnect');
  assert.equal(fence.boardFor(model(event))[7][8], 2);
  const next = move('m2', 8, 8);
  fence.consume(snapshot({ version: 2, moves: [move(), next], events: [event, committed(next, 2)] }), { busy: true });
  assert.equal(fence.state.queued, 1);
  const reconnect = fence.consume(snapshot({ version: 2, moves: [move(), next], events: [committed(next, 2)] }),
    { reconnect: true, busy: true });
  assert.equal(reconnect[0].reason, 'reconnect');
  assert.equal(fence.state.queued, 0);
  assert.deepEqual(fence.drain(), []);
});

test('malformed reconnect response cancels, and stale reconnect cannot lower authority', () => {
  const fence = ready();
  fence.consume(snapshot({ version: 3 }));
  assert.deepEqual(fence.consume(null, { reconnect: true }), [{ type: 'cancel', reason: 'disconnect' }]);
  assert.equal(fence.state.needsBaseline, true);
  assert.equal(fence.consume(snapshot({ version: 2 }))[0].reason, 'disconnect');
  assert.equal(fence.state.snapshotVersion, 3);
  assert.equal(fence.consume(snapshot({ version: 3 }))[0].reason, 'reconnect');
});

test('runtime/game changes baseline with no replay and retired snapshots cannot switch back', () => {
  const fence = ready(), persisted = move();
  const gameChange = snapshot({ version: 4, gameId: 'g2', moves: [persisted],
    events: [committed(persisted, 4, 'g2e', { gameId: 'g2' })] });
  assert.equal(fence.consume(gameChange)[0].reason, 'game-change');
  assert.deepEqual(fence.consume(snapshot({ version: 99 })), []);
  const runtimeChange = snapshot({ version: 0, runtimeId: 'r2', gameId: 'g2' });
  assert.equal(fence.consume(runtimeChange)[0].reason, 'runtime-change');
  assert.deepEqual(fence.consume(gameChange), []);
  assert.equal(fence.state.runtimeId, 'r2');
  const input = snapshot({ version: 1, runtimeId: 'r2', gameId: 'g2', moves: [persisted],
    events: [committed(persisted, 1, 'foreign'), committed(persisted, 1, 'real', { gameId: 'g2' })] });
  assert.equal(visuals(fence.consume(input))[0].event.eventId, 'real');
});

test('snapshot authority is monotonic; changed equal-version board is rejected', () => {
  const fence = ready(), input = snapshot({ version: 2, moves: [move()] });
  fence.consume(input);
  assert.deepEqual(fence.consume(snapshot({ version: 1 })), []);
  assert.deepEqual(fence.consume(snapshot({ version: 2, moves: [move('different')] })), []);
  assert.equal(fence.state.snapshotVersion, 2);
  assert.equal(fence.boardFor(null)[7][8], 2);
  const actions = fence.consume(snapshot({ version: 3, moves: [move()], comments: false }));
  assert.equal(authority(actions).snapshotVersion, 3);
  assert.equal(authority(actions).version, 0); // unrelated commits do not raise visual stale floor
  assert.equal(authority(actions).comments, false);
});

test('snapshots/actions are detached and frozen caller input is never mutated', () => {
  const fence = ready(), event = committed();
  const input = freeze(snapshot({ version: 1, moves: [move()], events: [event] }));
  const before = JSON.stringify(input), actions = fence.consume(input, { busy: true });
  authority(actions).board[7][8] = 0;
  authority(actions).moves[0].moveId = 'changed';
  assert.equal(JSON.stringify(input), before);
  const dispatched = fence.drain()[0];
  dispatched.event.moveId = 'local-edit'; dispatched.event.confirmed = false;
  assert.equal(fence.boardFor(model(event))[7][8], 0);
  const board = fence.boardFor(null); board[7][8] = 0;
  assert.equal(fence.boardFor(null)[7][8], 2);
  const state = fence.state; state.queued = 999;
  assert.equal(fence.state.queued, 0);
});

test('mutating a snapshot after ingestion cannot alter queued confirmed envelopes', () => {
  const fence = ready(), input = snapshot({ version: 1, moves: [move()], events: [committed()] });
  fence.consume(input, { busy: true });
  input.stage.events[0].confirmed = false; input.stage.events[0].moveId = 'corrupt';
  input.game.moves[0].moveId = 'corrupt'; input.game.board[7][8] = 0;
  const actions = fence.drain();
  assert.equal(actions[0].event.confirmed, true);
  assert.equal(actions[0].event.moveId, 'm1');
  assert.equal(fence.boardFor(model(committed()))[7][8], 0);
});

test('duplicates, alternate event IDs for same move, stale/future and crossgame envelopes are rejected', () => {
  const fence = ready(), first = committed();
  assert.equal(visuals(fence.consume(snapshot({ version: 1, moves: [move()], events: [first, first] }))).length, 1);
  for (const event of [first, committed(move(), 2, 'alternate'), committed(move('m2', 8, 8), 0, 'stale'),
    committed(move('m2', 8, 8), 4, 'future'), committed(move('m2', 8, 8), 2, 'wrong-game', { gameId: 'elsewhere' })]) {
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 2, moves: [move(), move('m2', 8, 8)], events: [event] }))), []);
  }
  const valid = committed(move('m2', 8, 8), 2, 'valid');
  assert.equal(visuals(fence.consume(snapshot({ version: 2, moves: [move(), move('m2', 8, 8)], events: [valid] }))).length, 1);
});

test('malformed/unconfirmed/preview/human/mismatched moves never animate or reserve a valid event ID', () => {
  const invalid = [null, {}, committed(move(), 1, 'e1', { confirmed: false }),
    committed(move(), 1, 'e1', { confirmed: undefined }), committed(move(), 1, 'e1', { confirmed: 1 }),
    committed(move(), 1, 'e1', { preview: true }), committed(move(), 1, '', {}),
    committed(move(), 1, 'e1', { version: -1 }), committed(move(), 1, 'e1', { version: 1.5 }),
    committed(move(), 1, 'e1', { kind: 'local-drop' }), committed(move(), 1, 'e1', { row: 15 }),
    committed(move(), 1, 'e1', { col: -1 }), committed(move(), 1, 'e1', { row: '7' }),
    committed(move(), 1, 'e1', { color: 1 }), committed(move(), 1, 'e1', { moveId: 'not-persisted' }),
    committed(move(), 1, 'e1', { col: 9 }), committed(move(), 1, 'e1', { eventId: 'x'.repeat(513) })];
  for (const event of invalid) {
    const fence = ready(), input = snapshot({ version: 1, moves: [move()], events: [event] });
    assert.deepEqual(visuals(fence.consume(input)), [], JSON.stringify(event));
    input.stage.events = [committed()];
    assert.equal(visuals(fence.consume(input)).length, 1);
  }
  for (const persisted of [move('human', 7, 8, 1, 'human'), move('wrong-source', 7, 8, 2, 'human')]) {
    const fence = ready();
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 1, moves: [persisted], events: [committed(persisted)] }))), []);
  }
});

test('legacy moves without IDs synchronize but cannot authorize a fabricated ID', () => {
  const fence = ready(), persisted = { row: 7, col: 8, color: 2, source: 'engine' };
  const actions = fence.consume(snapshot({ version: 1, moves: [persisted], events: [committed()] }));
  assert.equal(authority(actions).board[7][8], 2);
  assert.deepEqual(visuals(actions), []);
});

test('malformed snapshot board, coordinates, IDs, status or size is rejected without authority mutation', () => {
  const mutations = [s => { s.runtimeId = ''; }, s => { s.game.version = -1; },
    s => { s.game.board.pop(); }, s => { s.game.board[0].push(0); }, s => { s.game.board[7][8] = 1; },
    s => { s.game.board[0][0] = 2; }, s => { s.game.moves.push({ ...s.game.moves[0] }); },
    s => { s.game.moves[0].moveId = {}; }, s => { s.game.moves[0].row = 15; },
    s => { s.game.moves[0].source = 'fabricated'; }, s => { s.game.status = 'failed'; },
    s => { s.game.playerColor = 0; }, s => { s.game.winner = 2; },
    s => { s.game.moves = Array(226).fill(move()); }];
  for (const mutate of mutations) {
    const fence = ready(), input = snapshot({ version: 1, moves: [move()], events: [committed()] });
    mutate(input); assert.deepEqual(fence.consume(input), []);
    assert.equal(fence.state.snapshotVersion, 0);
  }
});

test('unsupported/malformed stage metadata cannot animate or spuriously change epoch', () => {
  const mutations = [s => { s.stage.format = 2; }, s => { s.stage.events = {}; },
    s => { s.stage.events = Array(513).fill(committed()); }, s => { s.stage.epoch = {}; },
    s => { s.stage.gameId = 'other'; }, s => { s.stage.version = 9; },
    s => { s.stage.replayThroughVersion = 1.2; }, s => { s.stage.replayThroughVersion = 2; },
    s => { delete s.stage; }];
  for (const mutate of mutations) {
    const fence = ready(), input = snapshot({ version: 1, moves: [move()], events: [committed()] });
    mutate(input);
    const actions = fence.consume(input);
    assert.deepEqual(visuals(actions), []);
    assert.equal(authority(actions).reset, false);
    assert.equal(authority(actions).board[7][8], 2);
  }
});

test('AI of either player color is accepted; human victory winner must match current player color', () => {
  const fence = new LiveEventFence(), ai = move('white-player-ai', 7, 8, 1, 'engine');
  fence.consume(snapshot({ playerColor: 2 }));
  assert.equal(visuals(fence.consume(snapshot({ version: 1, playerColor: 2, moves: [ai], events: [committed(ai)] })))[0].type, 'move');
  const actions = fence.consume(snapshot({ version: 2, playerColor: 2, moves: [ai], status: 'won', winner: 2,
    events: [victory(2, { winner: 2, playerColor: 2 })] }), { busy: true });
  assert.equal(visuals(actions)[0].type, 'defeat');
});

test('busy queue survives unrelated authority increments and drains original confirmed version', () => {
  const fence = ready(), first = committed(), secondMove = move('m2', 8, 8), second = committed(secondMove, 2);
  const { director, clock, apply } = directorSetup();
  apply(new LiveEventFence().consume(snapshot()));
  apply(fence.consume(snapshot({ version: 1, moves: [move()], events: [first] })));
  clock.step(1000); assert.ok(director.model.heldStone);
  apply(fence.consume(snapshot({ version: 2, moves: [move(), secondMove], events: [first, second] }), { busy: director.busy }));
  assert.equal(fence.state.queued, 1);
  for (const version of [3, 4, 5]) {
    const actions = fence.consume(snapshot({ version, moves: [move(), secondMove], events: [first, second], comments: false }),
      { busy: director.busy });
    assert.equal(authority(actions).version, 1); assert.equal(authority(actions).snapshotVersion, version);
    assert.deepEqual(visuals(actions), []); apply(actions);
    assert.equal(director.model.hiddenMoveId, 'm1'); assert.ok(director.busy);
  }
  clock.step(6000); assert.equal(director.busy, false);
  const drained = fence.drain({ busy: director.busy });
  assert.equal(drained[0].event.version, 2); apply(drained);
  assert.equal(director.model.hiddenMoveId, 'm2'); assert.equal(director.version, 2);
  director.dispose(); assert.equal(clock.frames.size, 0); assert.equal(clock.timers.size, 0);
});

test('event first arriving after unrelated newer snapshot is not rejected by snapshotVersion', () => {
  const fence = ready(), persisted = move();
  fence.consume(snapshot({ version: 3, moves: [persisted] }), { busy: true });
  const input = snapshot({ version: 4, moves: [persisted], events: [committed(persisted, 1)] });
  assert.deepEqual(visuals(fence.consume(input, { busy: true })), []);
  assert.equal(fence.state.queued, 1);
  const action = fence.drain()[0]; assert.equal(action.event.version, 1);
  assert.equal(fence.state.visualVersion, 1);
});

test('journals are deterministically chronological and accepted event floor rejects late old events', () => {
  const fence = ready(), a = move('a', 0, 0), b = move('b', 0, 1), c = move('c', 0, 2);
  const actions = fence.consume(snapshot({ version: 3, moves: [a, b, c],
    events: [committed(c, 3), committed(a, 1), committed(b, 2)] }));
  assert.equal(visuals(actions)[0].event.moveId, 'a');
  assert.equal(fence.drain()[0].event.moveId, 'b');
  assert.equal(fence.drain()[0].event.moveId, 'c');
  const late = move('late', 0, 3);
  assert.deepEqual(visuals(fence.consume(snapshot({ version: 4, moves: [a, b, c, late],
    events: [committed(late, 2, 'late')] }))), []);
});

test('undo/reset cancels, clears queue/mask, synchronizes and never replays surviving old IDs', () => {
  for (const replaced of [false, true]) {
    const fence = ready(), a = move(), b = move('m2', 8, 8);
    fence.consume(snapshot({ version: 1, moves: [a], events: [committed(a)] }));
    fence.consume(snapshot({ version: 2, moves: [a, b], events: [committed(b, 2)] }), { busy: true });
    const survivor = replaced ? move('new-id-same-cell') : a;
    const actions = fence.consume(snapshot({ version: 3, moves: [survivor], events: [committed(a), committed(b, 2)] }), { busy: true });
    assert.equal(actions[0].reason, 'undo-or-reset'); assert.equal(authority(actions).reset, true);
    assert.equal(fence.state.queued, 0); assert.deepEqual(fence.drain(), []);
    assert.equal(fence.boardFor(model(committed(a)))[7][8], 2);
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 4, moves: [survivor], events: [committed(a)] }))), []);
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 5, moves: [survivor, b], events: [committed(b, 5, 'reused-old-id')] }))), []);
    const fresh = move('fresh-persisted-id', 8, 8);
    // Replacing an existing persisted ID is another reset baseline; the NEXT genuinely new ID can animate.
    assert.equal(fence.consume(snapshot({ version: 6, moves: [survivor, fresh] }))[0].reason, 'undo-or-reset');
    const newest = move('newest', 9, 8);
    assert.equal(visuals(fence.consume(snapshot({ version: 7, moves: [survivor, fresh, newest],
      events: [committed(newest, 7, 'fresh')] })))[0].type, 'move');
  }
});

test('epoch/replay fence changes cancel and rebase; replay floor never decreases', () => {
  for (const change of ['epoch', 'floor']) {
    const fence = ready(), a = move();
    fence.consume(snapshot({ version: 1, moves: [a], events: [committed(a)] }));
    const actions = fence.consume(snapshot({ version: 2, moves: [a], events: [committed(a)],
      ...(change === 'epoch' ? { epoch: 'epoch2' } : { floor: 1 }) }));
    assert.equal(actions[0].reason, change === 'epoch' ? 'epoch-change' : 'replay-fence');
    assert.equal(authority(actions).reset, true); assert.deepEqual(fence.drain(), []);
  }
  const fence = new LiveEventFence();
  fence.consume(snapshot({ version: 3, floor: 2 }));
  assert.deepEqual(fence.consume(snapshot({ version: 4, floor: 1 })), []);
  const actions = fence.consume(snapshot({ version: 4, floor: 2, moves: [move()], events: [committed(move(), 2)] }));
  assert.deepEqual(visuals(actions), []);
});

test('human victory preempts busy carrying and discards queued moves before confirmed defeat', () => {
  const fence = ready(), a = move(), b = move('m2', 8, 8), human = move('human', 9, 8, 1, 'human');
  const { director, clock, apply } = directorSetup(); apply(new LiveEventFence().consume(snapshot()));
  apply(fence.consume(snapshot({ version: 1, moves: [a], events: [committed(a)] })));
  clock.step(1000); assert.ok(director.model.heldStone);
  fence.consume(snapshot({ version: 2, moves: [a, b], events: [committed(b, 2)] }), { busy: true });
  const input = snapshot({ version: 3, moves: [a, b, human], status: 'won', winner: 1,
    events: [committed(a), committed(b, 2), victory(3)] });
  const actions = fence.consume(input, { busy: true });
  assert.deepEqual(actions.map(action => action.type), ['cancel', 'authority', 'defeat']);
  assert.equal(actions[0].reason, 'human-victory'); apply(actions);
  assert.equal(director.model.phase, 'pout'); assert.equal(director.model.hiddenMoveId, null);
  assert.equal(director.model.heldStone, null); assert.equal(fence.state.queued, 0);
  assert.deepEqual(fence.drain(), []); assert.deepEqual(visuals(fence.consume(input)), []);
  const repackaged = snapshot({ version: 4, moves: [a, b, human], status: 'won', winner: 1, events: [victory(4)] });
  assert.deepEqual(visuals(fence.consume(repackaged)), []);
  director.dispose(); assert.equal(clock.frames.size, 0); assert.equal(clock.timers.size, 0);
});

test('human-win snapshot without a valid confirmed victory cancels move but never fabricates defeat', () => {
  for (const event of [null, victory(2, { confirmed: false }), victory(2, { confirmed: undefined }),
    victory(2, { winner: 2 }), victory(2, { playerColor: 2 }), victory(2, { status: 'resigned' })]) {
    const fence = ready(), a = move(); fence.consume(snapshot({ version: 1, moves: [a], events: [committed(a)] }));
    const actions = fence.consume(snapshot({ version: 2, moves: [a], status: 'won', winner: 1, events: [event] }), { busy: true });
    assert.equal(actions[0].reason, 'human-victory-sync'); assert.deepEqual(visuals(actions), []);
    assert.equal(fence.boardFor(model(committed(a)))[7][8], 2);
  }
});

test('failed/AI terminal statuses cannot authorize human defeat; terminal regression rebases', () => {
  for (const [status, winner] of [['playing', null], ['draw', null], ['resigned', 2], ['won', 2]]) {
    const fence = ready();
    assert.deepEqual(visuals(fence.consume(snapshot({ version: 2, status, winner, events: [victory(2)] }))), []);
  }
  const fence = ready();
  fence.consume(snapshot({ version: 1, status: 'won', winner: 1, events: [victory(1)] }));
  const actions = fence.consume(snapshot({ version: 2 }));
  assert.equal(actions[0].reason, 'undo-or-reset'); assert.equal(authority(actions).reset, true);
});

test('bounded dedup and deterministic overflow cancel/rebase instead of retaining unbounded motion', () => {
  const fence = ready({ historyLimit: 4, pendingLimit: 2 }), moves = [];
  for (let index = 0; index < 10; index++) {
    const item = move(`m${index}`, 0, index); moves.push(item);
    fence.consume(snapshot({ version: index + 1, moves, events: [committed(item, index + 1)] }));
    assert.ok(fence.state.seenEvents <= 4); assert.ok(fence.state.seenMoves <= 4);
  }
  assert.deepEqual(visuals(fence.consume(snapshot({ version: 11, moves, events: [committed(moves[0], 1)] }))), []);
  const queued = ready({ pendingLimit: 2 }), three = [move('a', 0, 0), move('b', 0, 1), move('c', 0, 2)];
  const actions = queued.consume(snapshot({ version: 3, moves: three,
    events: three.map((item, index) => committed(item, index + 1)) }), { busy: true });
  assert.equal(actions[0].reason, 'pending-overflow'); assert.equal(authority(actions).reset, true);
  assert.equal(queued.state.queued, 0); assert.deepEqual(queued.drain(), []);
  assert.equal(LIVE_EVENT_HISTORY_LIMIT, 256); assert.equal(LIVE_EVENT_PENDING_LIMIT, 32);
  for (const options of [{ historyLimit: 0 }, { historyLimit: 513 }, { pendingLimit: 226 }, { pendingLimit: 1.5 }])
    assert.throws(() => new LiveEventFence(options), RangeError);
});

test('terminal priority beats a move queue overflow in the same snapshot', () => {
  const fence = ready({ pendingLimit: 1 }), moves = [move('a', 0, 0), move('b', 0, 1)];
  const actions = fence.consume(snapshot({ version: 3, moves, status: 'won', winner: 1,
    events: [committed(moves[0], 1), committed(moves[1], 2), victory(3)] }), { busy: true });
  assert.equal(actions[0].reason, 'human-victory'); assert.equal(visuals(actions)[0].type, 'defeat');
  assert.equal(fence.state.queued, 0);
});

test('confirmedMoveMask requires exact ledger event IDs/version AND persisted move/color/board', () => {
  const event = committed(), input = snapshot({ version: 3, moves: [move()], events: [event] }), actor = model(event);
  assert.deepEqual(confirmedMoveMask(input, actor), move());
  for (const change of [{ eventId: 'other' }, { hiddenMoveId: 'other' }, { gameId: 'other' },
    { version: 2 }, { hiddenMoveId: null }, { runtimeId: 'old-runtime' }])
    assert.equal(confirmedMoveMask(input, { ...actor, ...change }), null);
  const mutations = [s => { s.stage.events = []; }, s => { s.stage.events[0].confirmed = false; },
    s => { s.stage.events[0].moveId = 'other'; }, s => { s.stage.events[0].color = 1; },
    s => { s.stage.events[0].row = 8; }, s => { s.game.moves[0].moveId = 'replaced'; },
    s => { s.game.board[7][8] = 0; }, s => { s.stage.replayThroughVersion = 1; },
    s => { s.stage.gameId = 'other'; }];
  for (const mutate of mutations) {
    const changed = structuredClone(input); mutate(changed);
    assert.equal(confirmedMoveMask(changed, actor), null);
  }
  assert.equal(confirmedMoveMask(snapshot({ version: 3, moves: [move()], events: [event], status: 'won', winner: 1 }), actor), null);
  assert.equal(input.game.board[7][8], 2); assert.equal(input.game.moves[0].moveId, 'm1');
  const masked = confirmedMoveMask(input, actor); masked.moveId = 'local';
  assert.equal(confirmedMoveMask(input, actor).moveId, 'm1');
});

test('boardFor masks only dispatched exact confirmed move, never queued/local/coordinates-only models', () => {
  const fence = ready(), event = committed(), input = snapshot({ version: 1, moves: [move()], events: [event] });
  fence.consume(input, { busy: true });
  assert.equal(fence.boardFor(model(event))[7][8], 2);
  fence.drain(); assert.equal(fence.boardFor(model(event))[7][8], 0);
  assert.equal(fence.boardFor({ ...model(event), eventId: null, row: 7, col: 8 })[7][8], 2);
  assert.equal(fence.boardFor({ ...model(event), hiddenMoveId: 'wrong' })[7][8], 2);
  assert.equal(fence.boardFor({ ...model(event), hiddenMoveId: null })[7][8], 2);
  // Ledger eviction must reveal the authoritative stone, not use stale coordinates.
  fence.consume(snapshot({ version: 2, moves: [move()], events: [] }), { busy: true });
  assert.equal(fence.boardFor(model(event))[7][8], 2);
  assert.equal(new LiveEventFence().boardFor(null), null);
});
