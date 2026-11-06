import test from 'node:test';
import assert from 'node:assert/strict';
import { measureGeometry, boardPoint, clampActor, bubblePosition } from '../stage/geometry.js';
import { MotionDirector, RIGHT_PALM, MOTION_TIMEOUT_MS, MAX_MOTION_TIMEOUT_MS, motionDeadlineMs } from '../stage/motion-director.js';

const rectangle = (x, y, width, height) => ({ left: x, top: y, width, height });
const overlaps = (actor, obstacle) => actor.x < obstacle.right && actor.x + actor.width > obstacle.left
  && actor.y < obstacle.bottom && actor.y + actor.height > obstacle.top;
const restingLayouts = [
  { rootRect: rectangle(0, 0, 390, 620), boardRect: rectangle(20, 90, 350, 350), actorSize: { width: 88, height: 88 } },
  { rootRect: rectangle(0, 0, 800, 800), boardRect: rectangle(200, 200, 400, 400) },
  { rootRect: rectangle(0, 0, 500, 500), boardRect: rectangle(120, 0, 380, 300) },
  { rootRect: rectangle(0, 0, 600, 300), boardRect: rectangle(150, 0, 300, 300) },
  { rootRect: rectangle(0, 0, 500, 300), boardRect: rectangle(0, 0, 380, 300) },
  { rootRect: rectangle(0, 0, 300, 500), boardRect: rectangle(0, 120, 300, 380) },
  { rootRect: rectangle(0, 0, 300, 400), boardRect: rectangle(0, 0, 300, 304) },
];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const geometry = extra => measureGeometry({ rootRect: rectangle(0, 0, 800, 650),
  rootSize: { width: 800, height: 650 }, boardRect: rectangle(180, 70, 450, 450),
  avatarRect: rectangle(80, 480, 50, 50), ...extra });
function fakeClock() {
  let time = 0, id = 0;
  const frames = new Map(), timers = new Map();
  const clock = { now: () => time,
    request: cb => { const key = ++id; frames.set(key, cb); return key; },
    cancel: key => frames.delete(key),
    timeout: (cb, ms) => { const key = ++id; timers.set(key, { cb, at: time + ms }); return key; },
    clearTimeout: key => timers.delete(key),
    step(ms = 16, runFrames = true) {
      time += ms;
      const due = [...timers.entries()].filter(([, value]) => value.at <= time);
      for (const [key, value] of due) { timers.delete(key); value.cb(); }
      if (runFrames) {
        const pending = [...frames.values()]; frames.clear();
        for (const callback of pending) callback(time);
      }
    },
    advance(ms) { while (ms > 0) { const n = Math.min(ms, 16); clock.step(n); ms -= n; } },
    frames, timers };
  return clock;
}
function setup(measure = () => geometry()) {
  const clock = fakeClock(), models = [];
  const director = new MotionDirector({ measure, emit: value => models.push(value), clock });
  assert.equal(director.reset({ gameId: 'g1', version: 0 }), true);
  return { clock, models, director };
}
const move = extra => ({ gameId: 'g1', version: 1, eventId: 'e1', moveId: 'm1',
  row: 0, col: 0, color: 2, confirmed: true, ...extra });
const defeat = extra => ({ gameId: 'g1', version: 1, eventId: 'd1', confirmed: true,
  winner: 1, playerColor: 1, status: 'won', ...extra });
function within(model, g) {
  assert.ok(model.x >= g.bounds.left - 1e-7 && model.y >= g.bounds.top - 1e-7);
  assert.ok(model.x + model.width <= g.bounds.right + 1e-7);
  assert.ok(model.y + model.height <= g.bounds.bottom + 1e-7);
  assert.ok(model.hand.x >= g.bounds.left - 1e-7 && model.hand.x <= g.bounds.right + 1e-7);
  assert.ok(model.hand.y >= g.bounds.top - 1e-7 && model.hand.y <= g.bounds.bottom + 1e-7);
}
function clean(director, clock) {
  assert.equal(director.model.hiddenMoveId, null);
  assert.equal(director.model.heldStone, null);
  assert.equal(director.model.avatarFeedback, null);
  assert.equal(clock.frames.size, 0); assert.equal(clock.timers.size, 0);
}

test('15x15 centers use reversed displayed rows and true grid bounds at all corners', () => {
  const g = geometry();
  assert.deepEqual(boardPoint(g, 14, 0), { x: 195, y: 85 });
  assert.deepEqual(boardPoint(g, 14, 14), { x: 615, y: 85 });
  assert.deepEqual(boardPoint(g, 0, 0), { x: 195, y: 505 });
  assert.deepEqual(boardPoint(g, 0, 14), { x: 615, y: 505 });
  assert.deepEqual(boardPoint(g, 7, 7), { x: 405, y: 295 });
  for (const [r, c] of [[-1, 0], [0, 15], [1.5, 0], ['0', 0]]) assert.equal(boardPoint(g, r, c), null);
});

test('root viewport-to-local conversion accounts for independent scaling and offset', () => {
  const g = measureGeometry({ rootRect: rectangle(100, 50, 1000, 800),
    rootSize: { width: 500, height: 400 }, boardRect: rectangle(200, 150, 600, 600),
    avatarRect: rectangle(300, 250, 100, 100) });
  assert.deepEqual(g.scale, { x: 2, y: 2 });
  assert.deepEqual(boardPoint(g, 14, 0), { x: 60, y: 60 });
  assert.deepEqual(boardPoint(g, 0, 14), { x: 340, y: 340 });
  assert.equal(g.avatarTarget.x, 125); assert.equal(g.avatarTarget.y, 125);
  const stretched = measureGeometry({ rootRect: rectangle(20, 10, 600, 200),
    rootSize: { clientWidth: 300, clientHeight: 200 }, boardRect: rectangle(80, 30, 300, 150) });
  assert.deepEqual(stretched.scale, { x: 2, y: 1 });
  assert.deepEqual(boardPoint(stretched, 14, 0), { x: 35, y: 25 });
});

test('bounds intersect room, root and viewport; actor, home, perimeter and bubble remain inside', () => {
  const g = measureGeometry({ rootRect: rectangle(0, 0, 500, 500),
    roomRect: rectangle(30, 40, 430, 430), viewportRect: rectangle(50, 70, 350, 350) });
  assert.equal(g.bounds.left, 50); assert.equal(g.bounds.top, 70);
  assert.equal(g.bounds.right, 400); assert.equal(g.bounds.bottom, 420);
  assert.deepEqual(clampActor(g, { x: -5, y: -9 }), { x: 50, y: 70 });
  assert.deepEqual(clampActor(g, { x: 1000, y: 1000 }), { x: 304, y: 324 });
  for (const point of [g.home, ...g.perimeter]) assert.deepEqual(clampActor(g, point), point);
  const bubble = bubblePosition(g, { x: -20, y: -20 }, { width: 900, height: 800 });
  assert.equal(bubble.width, 350); assert.equal(bubble.height, 350);
  assert.equal(bubble.x, 50); assert.equal(bubble.y, 70);
  const narrow = measureGeometry({ rootRect: rectangle(0, 0, 30, 60) });
  assert.deepEqual(narrow.actorSize, { width: 30, height: 30 });
  const disjoint = measureGeometry({ rootRect: rectangle(0, 0, 50, 50),
    viewportRect: rectangle(1000, 1000, 20, 20) });
  assert.equal(disjoint.visible, false);
  assert.equal(disjoint.bounds.left, 50); assert.equal(disjoint.bounds.top, 50);
});

test('avatar target uses visible avatar then visible card then safe restpoint', () => {
  const g = geometry({ avatarRect: rectangle(770, 620, 100, 100) });
  assert.deepEqual(g.avatarTarget, { x: 785, y: 635, source: 'avatar' });
  const fallback = geometry({ avatarRect: rectangle(1000, 1000, 20, 20),
    cardRect: rectangle(30, 100, 100, 80) });
  assert.deepEqual(fallback.avatarTarget, { x: 80, y: 140, source: 'card' });
  const rest = geometry({ avatarRect: null, cardRect: null });
  assert.equal(rest.avatarTarget.source, 'restpoint');
  assert.ok(rest.avatarTarget.x >= rest.bounds.left && rest.avatarTarget.x <= rest.bounds.right);
});

test('move follows named phases, stone stays on palm and board unhides exactly once at release', () => {
  const { director, clock, models } = setup();
  assert.equal(director.playMove(move()), true);
  assert.equal(director.roam(), false);
  assert.equal(director.model.hiddenMoveId, 'm1');
  clock.advance(6100);
  const phases = [...new Set(models.filter(m => m.eventId === 'e1').map(m => m.phase))];
  assert.deepEqual(phases, ['thinking', 'pickup', 'carrying', 'placing', 'smug', 'retreat']);
  for (const m of models) {
    within(m, geometry());
    if (m.heldStone) {
      assert.equal(m.heldStone.moveId, 'm1'); assert.equal(m.heldStone.color, 2);
      near(m.heldStone.x, m.hand.x); near(m.heldStone.y, m.hand.y);
    }
  }
  let previous = null, releases = 0, release;
  for (const m of models) {
    if (previous === 'm1' && m.hiddenMoveId === null) { releases++; release = m; }
    previous = m.hiddenMoveId;
  }
  assert.equal(releases, 1);
  assert.equal(release.phase, 'placing');
  const target = boardPoint(geometry(), 0, 0);
  near(release.hand.x, target.x); near(release.hand.y, target.y);
  clean(director, clock);
});

test('all corners use temporary hand extension while actor remains viewport-clamped', () => {
  const g = measureGeometry({ rootRect: rectangle(0, 0, 300, 300), boardRect: rectangle(0, 0, 300, 300) });
  for (const [row, col] of [[0, 0], [0, 14], [14, 0], [14, 14]]) {
    const { director, clock, models } = setup(() => g);
    director.playMove(move({ row, col })); clock.advance(3400);
    const release = models.find(m => m.eventId === 'e1' && m.phase === 'placing' && m.hiddenMoveId === null);
    assert.ok(release);
    const target = boardPoint(g, row, col);
    near(release.hand.x, target.x); near(release.hand.y, target.y);
    for (const model of models) within(model, g);
    director.dispose(); clean(director, clock);
  }
});

test('skip, cancel, reset, drag and reduced motion clear held stone and feedback immediately', () => {
  for (const action of [d => d.skip(), d => d.cancel('test'),
    d => d.reset({ gameId: 'g2', version: 2 }), d => d.dragTo({ x: -100, y: -100 }),
    d => d.setReducedMotion(true), d => d.dispose()]) {
    const { director, clock } = setup();
    director.playMove(move()); clock.advance(1000);
    assert.ok(director.model.heldStone); action(director); clean(director, clock);
  }
  const { director, clock } = setup();
  director.playDefeat(defeat()); clock.advance(2720);
  assert.ok(director.model.avatarFeedback);
  director.skip(); clean(director, clock);
});

test('events require authority identity/version, confirmed status, valid coordinates and dedup IDs', () => {
  const { director, clock } = setup();
  for (const event of [move({ confirmed: false }), move({ gameId: 'other' }), move({ version: -1 }),
    move({ version: 1.5 }), move({ eventId: '' }), move({ moveId: null }),
    move({ row: 15 }), move({ color: 3 })]) assert.equal(director.playMove(event), false);
  assert.equal(director.playMove(move({ version: 2 })), true);
  director.skip();
  assert.equal(director.playMove(move({ version: 3 })), false); // duplicate event
  assert.equal(director.playMove(move({ version: 3, eventId: 'new' })), false); // duplicate move
  assert.equal(director.playMove(move({ version: 1, eventId: 'old', moveId: 'old' })), false);
  assert.equal(director.reset({ gameId: 'g1', version: 1 }), false);
  assert.equal(director.updateAuthority({ game: { id: 'g1', version: 4 } }), true);
  assert.equal(director.playMove(move({ version: 3, eventId: 'e2', moveId: 'm2' })), false);
  assert.equal(director.playMove(move({ version: 4, eventId: 'e2', moveId: 'm2' })), true);
  assert.equal(director.updateAuthority({ gameId: 'g1', version: 5 }), true);
  clean(director, clock);
  assert.equal(director.reset({ gameId: 'g2', version: 0 }), true);
  assert.equal(director.playMove(move({ version: 99, eventId: 'late', moveId: 'late' })), false);
});

test('defeat requires confirmed human win, does three avatar pulses, invite then retreat', () => {
  const { director, clock, models } = setup();
  for (const event of [defeat({ confirmed: false }), defeat({ status: 'resigned' }),
    defeat({ winner: 2 }), defeat({ playerColor: 0 })]) assert.equal(director.playDefeat(event), false);
  assert.equal(director.playDefeat(defeat()), true);
  clock.advance(6500);
  assert.deepEqual([...new Set(models.filter(m => m.eventId === 'd1').map(m => m.phase))],
    ['pout', 'stomp', 'run-avatar', 'punch', 'arms-crossed', 'invite', 'retreat']);
  assert.deepEqual([...new Set(models.map(m => m.avatarFeedback?.pulseId).filter(Boolean))],
    ['d1:punch:1', 'd1:punch:2', 'd1:punch:3']);
  assert.ok(models.some(m => m.phase === 'invite' && m.bubble));
  assert.ok(models.every(m => m.hiddenMoveId === null && m.heldStone === null));
  clean(director, clock);
});

test('layout and avatar targets are re-measured during motion; clipped cells are safely unhidden', () => {
  let g = geometry();
  const { director, clock } = setup(() => g);
  director.playDefeat(defeat()); clock.advance(2700);
  g = geometry({ avatarRect: rectangle(690, 90, 60, 60) });
  clock.step(25);
  assert.equal(director.model.phase, 'punch');
  near(director.model.x, g.avatarApproach.x);
  near(director.model.y, g.avatarApproach.y);
  assert.equal(director.model.facing, 'right');
  director.skip();
  director.playMove(move({ version: 2, eventId: 'e2' })); clock.advance(2000);
  g = geometry({ viewportRect: rectangle(500, 0, 300, 650) });
  clock.step(); clean(director, clock);
  assert.equal(director.lastCancelReason, 'layout-clipped');
  assert.equal(director.playMove(move({ version: 3, eventId: 'e3', moveId: 'm3' })), true);
  clean(director, clock); // initially clipped confirmed cell is consumed but never hidden
});

test('wall-clock watchdog cleans up even when RAF is paused; late callback cannot resurrect old game', () => {
  const { director, clock } = setup();
  director.playMove(move()); clock.advance(1000);
  const late = [...clock.frames.values()][0];
  clock.step(MOTION_TIMEOUT_MS, false);
  assert.equal(director.lastCancelReason, 'timeout'); clean(director, clock);
  director.reset({ gameId: 'g2', version: 0 });
  director.playMove(move({ gameId: 'g2', eventId: 'next', moveId: 'next' }));
  const currentFrame = director.frame;
  late(clock.now());
  assert.equal(director.frame, currentFrame);
  assert.equal(director.model.gameId, 'g2'); assert.equal(director.model.hiddenMoveId, 'next');
  director.dispose(); clean(director, clock);
});

test('quiet immediately clears bubble without interrupting primary choreography', () => {
  const { director, clock } = setup();
  director.playMove(move()); assert.ok(director.model.bubble);
  director.setQuiet(true); assert.equal(director.model.bubble, null);
  clock.advance(3800); assert.equal(director.model.bubble, null); assert.equal(director.busy, true);
  director.setQuiet(false); clock.step(); assert.ok(director.model.bubble);
  director.dispose(); clean(director, clock);
});

test('reduced motion consumes confirmed events without hiding or scheduling; roam/drag are local only', () => {
  const { director, clock, models } = setup();
  director.setReducedMotion(true);
  assert.equal(director.playMove(move()), true); clean(director, clock);
  assert.equal(director.playMove(move()), false);
  assert.equal(director.playDefeat(defeat({ version: 2 })), true); clean(director, clock);
  assert.ok(models.every(m => m.hiddenMoveId === null && !m.avatarFeedback));
  assert.equal(director.roam(), false);
  director.setReducedMotion(false); assert.equal(director.roam(), true);
  clock.advance(1900); clean(director, clock);
  assert.equal(director.dragTo({ x: 9999, y: -99 }), true);
  assert.equal(director.model.x, 704); assert.equal(director.model.y, 0);
  assert.equal(director.dragTo({ x: NaN, y: 0 }), false);
  director.dispose();
  assert.equal(director.playMove(move({ eventId: 'after', moveId: 'after', version: 4 })), false);
  assert.equal(director.reset({ gameId: 'g1', version: 8 }), false);
  assert.equal(director.roam(), false); assert.equal(director.cancel(), false);
  clock.step(50000); clean(director, clock);
});

test('superseding a move clears old hold before the new one and has only one watchdog', () => {
  const { director, clock, models } = setup();
  director.playMove(move()); clock.advance(1000);
  director.playMove(move({ version: 2, eventId: 'e2', moveId: 'm2', row: 14, col: 14 }));
  assert.equal(director.model.hiddenMoveId, 'm2');
  assert.equal(clock.frames.size, 1); assert.equal(clock.timers.size, 1);
  assert.ok(models.some(m => m.version === 2 && m.hiddenMoveId === null && m.heldStone === null));
  director.cancel(); clean(director, clock);
});

test('changing grid location while carrying aims at newly measured cell at release', () => {
  let g = geometry(), reads = 0;
  const { director, clock, models } = setup(() => { reads++; return g; });
  director.playMove(move({ row: 7, col: 7 })); clock.advance(1800);
  g = geometry({ boardRect: rectangle(280, 120, 360, 360) });
  clock.advance(1600);
  const release = models.find(m => m.eventId === 'e1' && m.phase === 'placing' && m.hiddenMoveId === null);
  assert.ok(release); assert.ok(reads > 100);
  const target = boardPoint(g, 7, 7); near(release.hand.x, target.x); near(release.hand.y, target.y);
  director.dispose(); clean(director, clock);
});

test('unmounted/throwing measure cannot leave board hidden', () => {
  let mounted = true;
  const { director, clock } = setup(() => { if (!mounted) throw new Error('detached'); return geometry(); });
  director.playMove(move()); clock.advance(1000);
  mounted = false; clock.step(); clean(director, clock);
  assert.equal(director.lastCancelReason, 'layout-clipped');
});

test('synchronous emit reset and disposal cannot resurrect a consumed old event', () => {
  const clock = fakeClock(); let director, action;
  director = new MotionDirector({ measure: () => geometry(), clock, emit: () => {
    const current = action; action = null; current?.();
  } });
  director.reset({ gameId: 'g1', version: 0 });
  action = () => director.reset({ gameId: 'g2', version: 0 });
  assert.equal(director.playMove(move()), true);
  assert.equal(director.model.gameId, 'g2'); clean(director, clock);
  director.reset({ gameId: 'g1', version: 0 });
  director.playMove(move());
  action = () => { assert.equal(director.playMove(move({ eventId: 'late', moveId: 'late', version: 2 })), false); };
  director.dispose(); clean(director, clock);
});

test('peripheral bands keep resting anchors AND every interpolated closed-route segment off board', () => {
  for (const input of restingLayouts) {
    const g = measureGeometry(input);
    assert.equal(overlaps({ ...g.home, ...g.actorSize }, g.board), false);
    for (let index = 0; index < g.perimeter.length; index++) {
      const a = g.perimeter[index], b = g.perimeter[(index + 1) % g.perimeter.length];
      for (let step = 0; step <= 100; step++) {
        const point = { x: a.x + (b.x - a.x) * step / 100,
          y: a.y + (b.y - a.y) * step / 100, ...g.actorSize };
        assert.deepEqual(clampActor(g, point), { x: point.x, y: point.y });
        assert.equal(overlaps(point, g.board), false, `unsafe segment ${index} at ${step}%`);
      }
    }
  }
  const phone = measureGeometry(restingLayouts[0]);
  assert.ok(phone.home.y >= phone.board.bottom + 8);
  assert.equal(phone.perimeter.length, 2);
  assert.ok(phone.perimeter.every(point => point.y === phone.home.y));
});

test('repeated roaming follows safe band routes, including backtracking and mobile wrap', () => {
  for (const input of restingLayouts) {
    const g = measureGeometry(input), { director, clock, models } = setup(() => g);
    for (let step = 0; step < g.perimeter.length * 3; step++) {
      assert.equal(director.roam(), true); clock.advance(1720); clean(director, clock);
    }
    for (const model of models) { within(model, g); assert.equal(overlaps(model, g.board), false); }
    director.dispose();
  }
});

test('reflow clamps idle actors and chooses peripheral restpoint if board moved over old home', () => {
  let g = geometry(); const { director, clock } = setup(() => g);
  g = geometry({ boardRect: rectangle(0, 450, 450, 190) });
  assert.equal(overlaps(director.model, g.board), true);
  assert.equal(director.reflow(), true); within(director.model, g);
  assert.equal(overlaps(director.model, g.board), false); clean(director, clock);
  director.dragTo({ x: 799, y: 649 });
  g = measureGeometry({ rootRect: rectangle(0, 0, 360, 420), boardRect: rectangle(0, 0, 360, 300) });
  director.reflow(); within(director.model, g); clean(director, clock);
  director.dispose(); assert.equal(director.reflow(), false);
});

test('active reflow keeps exactly one RAF/watchdog and ignores canceled RAF from SAME event', () => {
  let g = geometry(); const { director, clock, models } = setup(() => g);
  director.playMove(move()); clock.advance(1000);
  const late = [...clock.frames.values()][0], deadline = [...clock.timers.values()][0].at;
  for (let index = 0; index < 20; index++) {
    assert.equal(director.reflow(), true);
    assert.equal(clock.frames.size, 1); assert.equal(clock.timers.size, 1);
    assert.equal([...clock.timers.values()][0].at, deadline);
    assert.equal(director.model.hiddenMoveId, 'm1');
  }
  const emitted = models.length, frame = director.frame;
  late(clock.now()); assert.equal(models.length, emitted); assert.equal(director.frame, frame);
  assert.equal(clock.frames.size, 1);
  g = geometry({ viewportRect: rectangle(500, 0, 300, 650) });
  director.reflow(); clean(director, clock);
  assert.equal(director.lastCancelReason, 'layout-clipped');
});

test('reflow cannot recursively emit or create a duplicate RAF from emit callback', () => {
  const clock = fakeClock(); let director, armed = false;
  director = new MotionDirector({ measure: () => geometry(), clock, emit: () => {
    if (armed) assert.equal(director.reflow(), false);
  } });
  director.reset({ gameId: 'g1', version: 0 }); armed = true;
  director.playMove(move()); clock.advance(1000);
  director.reflow(); assert.equal(clock.frames.size, 1); assert.equal(clock.timers.size, 1);
  director.dispose(); clean(director, clock);
});

test('avatar approach stands beside avatar/card with side, bottom, top and restpoint fallbacks', () => {
  const examples = [
    geometry({ avatarRect: rectangle(300, 300, 50, 50) }),
    geometry({ avatarRect: rectangle(10, 300, 50, 50) }),
    geometry({ avatarRect: null, cardRect: rectangle(300, 250, 100, 100) }),
    measureGeometry({ rootRect: rectangle(0, 0, 300, 400), avatarRect: rectangle(0, 100, 300, 50) }),
    measureGeometry({ rootRect: rectangle(0, 0, 300, 200), avatarRect: rectangle(0, 140, 300, 60) }),
  ];
  assert.deepEqual(examples.map(g => g.avatarApproach.side), ['left', 'right', 'left', 'bottom', 'top']);
  assert.equal(examples[2].avatarTarget.source, 'card');
  for (const g of examples) {
    const approach = { ...g.avatarApproach, ...g.actorSize };
    assert.deepEqual(clampActor(g, approach), { x: approach.x, y: approach.y });
    assert.equal(overlaps(approach, g.avatarBounds), false);
  }
  const missing = geometry({ avatarRect: null, cardRect: null });
  assert.equal(missing.avatarBounds, null); assert.equal(missing.avatarApproach.side, 'restpoint');
});

test('defeat remains beside dynamically moved avatar and extends palm to center with exactly three pulses', () => {
  let g = geometry(); const { director, clock, models } = setup(() => g);
  director.playDefeat(defeat()); clock.advance(2550); clock.step(175);
  near(director.model.hand.x, g.avatarTarget.x); near(director.model.hand.y, g.avatarTarget.y);
  assert.equal(director.model.facing, 'left');
  const cutoff = models.length;
  const old = g; g = geometry({ avatarRect: rectangle(690, 90, 60, 60) });
  director.reflow(); near(director.model.hand.x, g.avatarTarget.x); near(director.model.hand.y, g.avatarTarget.y);
  assert.equal(director.model.facing, 'right'); clock.advance(4000);
  for (const [collection, target] of [[models.slice(0, cutoff), old], [models.slice(cutoff), g]]) {
    for (const model of collection.filter(m => ['punch', 'arms-crossed', 'invite'].includes(m.phase))) {
      assert.equal(overlaps(model, target.avatarBounds), false); within(model, target);
      near(model.x, target.avatarApproach.x); near(model.y, target.avatarApproach.y);
    }
  }
  assert.deepEqual([...new Set(models.map(m => m.avatarFeedback?.pulseId).filter(Boolean))],
    ['d1:punch:1', 'd1:punch:2', 'd1:punch:3']); clean(director, clock);
});

test('role locale keys/localized text are preserved; invalid values fall back to capped visible text', () => {
  const clock = fakeClock(), key = 'stage.motion.' + 'thinking.'.repeat(10);
  const localized = '这一手我已经仔细想好了，请看我把棋子稳稳放到棋盘上！';
  const director = new MotionDirector({ measure: () => geometry(), clock,
    role: { bubbles: { thinking: key, pickup: localized, smug: 12345 } } });
  director.reset({ gameId: 'g1', version: 0 }); director.playMove(move());
  assert.equal(director.model.bubble, key);
  clock.advance(700); assert.equal(director.model.bubble, localized);
  clock.advance(3000); assert.equal(typeof director.model.bubble, 'string');
  assert.ok(Array.from(director.model.bubble).length <= 40);
  director.setQuiet(true); assert.equal(director.model.bubble, null);
  director.dispose(); clean(director, clock);
});

test('large frame gaps release once and emit no stale hold; consumer mutation cannot detach stone', () => {
  const { director, clock, models } = setup();
  director.playMove(move()); clock.advance(1000);
  const current = models.at(-1); current.hand.x = -999; current.heldStone.x = -999;
  assert.notEqual(director.model.hand.x, -999);
  clock.step(3500);
  assert.equal(director.model.hiddenMoveId, null); assert.equal(director.model.heldStone, null);
  clock.step(2000); clean(director, clock);
});

const ambientProfile = { timeScale: 1.4, ambient: { durationMs: 3360 }, roamMs: 2380, watchdogGraceMs: 2000 };
function ambientSetup(measure = () => geometry()) {
  const clock = fakeClock(), models = [];
  const director = new MotionDirector({ measure, clock, actionProfile: ambientProfile, emit: m => models.push(m) });
  director.reset({ gameId: 'g1', version: 0 });
  return { director, clock, models };
}
test('bounded profile deadline derives sequence+grace while exact legacy12s stays unchanged', () => {
  assert.equal(motionDeadlineMs([['thinking', 16000]], null), MOTION_TIMEOUT_MS);
  assert.equal(motionDeadlineMs([['thinking', 16000]], ambientProfile), 18000);
  assert.equal(motionDeadlineMs([['thinking', 58000]], ambientProfile), MAX_MOTION_TIMEOUT_MS);
  const invalid = [[], [['thinking', 58001]], [['thinking', Infinity]], [['thinking', NaN]], [['thinking', -1]], [['thinking', 0]], Array.from({length:33}, () => ['thinking',16])];
  for (const sequence of invalid) assert.equal(motionDeadlineMs(sequence, ambientProfile), null);
  for (const grace of [0, 99, 10001, NaN, Infinity]) assert.equal(motionDeadlineMs([['thinking',16000]], {watchdogGraceMs:grace}), null);
});
test('future longer action finishes within derived grace and reflow never extends deadline', () => {
  const clock=fakeClock(), director=new MotionDirector({measure:()=>geometry(),clock,actionProfile:{move:[['thinking',16000,'thinking']],watchdogGraceMs:2000}});
  director.reset({gameId:'g1',version:0});director.playMove(move());const token=director.active.token,deadline=[...clock.timers.values()][0].at;
  clock.advance(15000);for(let i=0;i<10;i++)director.reflow();assert.equal(director.active.token,token);assert.equal([...clock.timers.values()][0].at,deadline);assert.equal(clock.frames.size,1);
  clock.advance(1000);assert.notEqual(director.lastCancelReason,'timeout');clean(director,clock);director.dispose();
});
test('invalid long profile fails closed and reveals confirmed move without timers', () => {
  const clock=fakeClock(), director=new MotionDirector({measure:()=>geometry(),clock,actionProfile:{move:[['thinking',60000,'thinking']]}});
  director.reset({gameId:'g1',version:0});assert(director.playMove(move()));assert.equal(director.lastCancelReason,'invalid-profile');clean(director,clock);director.dispose();
});
test('ambient owns one director RAF, no watchdog/gameplay active/stone/bubble/busy', () => {
  const {director,clock}=ambientSetup();assert.equal(director.setAmbientEnabled(true),true);
  const epoch=director.model.ambientEpoch;assert.equal(director.active,null);assert.equal(director.busy,false);assert.equal(director.model.eventId,null);assert.equal(director.model.bubble,null);assert.equal(clock.timers.size,0);assert.equal(clock.frames.size,1);
  clock.step(3500);assert.equal(director.model.phase,'idle');assert.equal(director.model.phaseElapsed,3500);assert.equal(director.model.ambientEpoch,epoch);assert.equal(director.model.timeScale,1.4);
  for(let i=0;i<20;i++){director.reflow();director.setAmbientEnabled(true);assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,0);assert.equal(director.model.ambientEpoch,epoch);}
  director.dispose();clean(director,clock);
});
test('ambient is taken over by2380ms roam then resumes without becoming gameplay busy', () => {
  const {director,clock}=ambientSetup();director.setAmbientEnabled(true);const old=[...clock.frames.values()],epoch=director.model.ambientEpoch;
  assert(director.roam());assert.equal(director.active.kind,'roam');assert.equal(director.active.sequence[0][1],2380);assert.equal(director.busy,false);assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,1);
  const model=director.model;for(const cb of old)cb();assert.equal(director.model,model);clock.advance(2380);
  assert.equal(director.active,null);assert.equal(director.model.phase,'idle');assert.notEqual(director.model.ambientEpoch,epoch);assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,0);director.dispose();clean(director,clock);
});
test('confirmed action supersedes idle RAF; stale ambient callback cannot overwrite authority', () => {
  const {director,clock}=ambientSetup();director.setAmbientEnabled(true);const old=[...clock.frames.values()];director.playMove(move());assert.equal(director.busy,true);assert.equal(director.ambient,null);assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,1);
  const model=director.model;for(const cb of old)cb();assert.equal(director.model,model);director.cancel();clean(director,clock);director.dispose();
});
test('ambient stop matrix clears callbacks on cancel/skip/reset/reduced/drag/dispose', () => {
  const stops=[d=>d.cancel('art-unavailable'),d=>d.cancel('page-hidden'),d=>d.skip(),d=>d.reset({gameId:'g2',version:1}),d=>d.setReducedMotion(true),d=>d.dragTo({x:10,y:20}),d=>d.dispose()];
  for(const stop of stops){const {director,clock}=ambientSetup();director.setAmbientEnabled(true);const old=[...clock.frames.values()];stop(director);const model=director.model;for(const cb of old)cb();assert.equal(director.model,model);clean(director,clock);director.dispose();}
});
test('ambient starts only with authority, real optional policy, visible safe geometry', () => {
  const legacy=setup();assert.equal(legacy.director.setAmbientEnabled(true),false);clean(legacy.director,legacy.clock);legacy.director.dispose();
  for(const g of [{...geometry(),visible:false},{...geometry(),safeIdle:false}]){const {director,clock}=ambientSetup(()=>g);director.setAmbientEnabled(true);assert.equal(director.ambient,null);clean(director,clock);director.dispose();}
  const clock=fakeClock(),director=new MotionDirector({measure:()=>geometry(),clock,actionProfile:ambientProfile});director.setAmbientEnabled(true);assert.equal(director.ambient,null);assert.equal(clock.frames.size,0);director.dispose();
});
test('ambient reflow cancels invisible frame and safely resumes when visible geometry returns', () => {
  let g=geometry();const {director,clock}=ambientSetup(()=>g);director.setAmbientEnabled(true);const old=[...clock.frames.values()];g={...g,visible:false};director.reflow();clean(director,clock);const model=director.model;for(const cb of old)cb();assert.equal(director.model,model);
  g=geometry();director.reflow();assert.equal(clock.frames.size,1);assert.equal(director.active,null);director.dispose();clean(director,clock);
});
test('synchronous emit cancellation cannot create a replacement ambient RAF', () => {
  const clock=fakeClock();let director,armed=false;
  director=new MotionDirector({measure:()=>geometry(),clock,actionProfile:ambientProfile,emit:()=>{if(armed){armed=false;director.cancel('listener');}}});director.reset({gameId:'g1',version:0});armed=true;director.setAmbientEnabled(true);clean(director,clock);director.dispose();
});
test('synchronous cosmetic ambient permission cannot steal a confirmed action during stop emit', () => {
  const clock=fakeClock();let director,armed=false;
  director=new MotionDirector({measure:()=>geometry(),clock,actionProfile:ambientProfile,emit:model=>{if(armed&&model.phase==='idle'){armed=false;director.setAmbientEnabled(true);}}});director.reset({gameId:'g1',version:0});armed=true;
  assert(director.playMove(move()));assert.equal(director.active.kind,'move');assert.equal(director.ambient,null);assert.equal(director.busy,true);assert.equal(clock.frames.size,1);assert.equal(clock.timers.size,1);director.dispose();clean(director,clock);
});
test('invalid profile presentation scales fail closed rather than divide contact clocks by zero', () => {
  for(const timeScale of [0,-1,NaN,Infinity,5])assert.equal(motionDeadlineMs([['thinking',16000]],{...ambientProfile,timeScale}),null);
});
