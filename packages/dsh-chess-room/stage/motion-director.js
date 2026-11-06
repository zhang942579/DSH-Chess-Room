/**
 * Cosmetic, board-local motion director. Independently authored; no business
 * service calls, move submission, DOM, or timers at module evaluation time.
 * Design review: dsh-pet v0.4.14, Apache-2.0, PetSprite.tsx619-682.
 * No upstream code copied. Its private GameplayBus is NOT a sibling API.
 */
import { measureGeometry, boardPoint, clampActor } from './geometry.js';

export const RIGHT_PALM = Object.freeze({ x: .545, y: .676 });
export const MOTION_TIMEOUT_MS = 12000;
export const MAX_MOTION_TIMEOUT_MS = 60000;
// Profile-specific sequences have bounded grace; legacy keeps its exact 12s cap.
export function motionDeadlineMs(sequence, profile) {
  if (!profile) return MOTION_TIMEOUT_MS;
  const grace = profile.watchdogGraceMs ?? 2000;
  if (profile.timeScale !== undefined && (!Number.isFinite(profile.timeScale) || profile.timeScale <= 0 || profile.timeScale > 4)) return null;
  if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > 32
    || !sequence.every(s => Array.isArray(s) && Number.isFinite(s[1]) && s[1] >= 16)
    || !Number.isInteger(grace) || grace < 100 || grace > 10000) return null;
  const deadline = sequence.reduce((n, s) => n + s[1], 0) + grace;
  return Number.isFinite(deadline) && deadline <= MAX_MOTION_TIMEOUT_MS
    ? Math.max(MOTION_TIMEOUT_MS, deadline) : null;
}
const MOVE = Object.freeze([
  ['thinking', 550, 'thinking'], ['pickup', 550, 'pickup'], ['carrying', 1750, 'walk'],
  ['placing', 700, 'place'], ['smug', 700, 'smug'], ['retreat', 1650, 'walk'],
]);
const DEFEAT = Object.freeze([
  ['pout', 500, 'pout'], ['stomp', 550, 'stomp'], ['run-avatar', 1500, 'walk'],
  ['punch', 350, 'punch'], ['punch', 350, 'punch'], ['punch', 350, 'punch'],
  ['arms-crossed', 650, 'arms-crossed'], ['invite', 650, 'invite'], ['retreat', 1400, 'walk'],
]);
const RELEASE_AT = 550 + 550 + 1750 + 700 * .65;
const total = sequence => sequence.reduce((sum, item) => sum + item[1], 0);
const ease = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const validId = v => (typeof v === 'string' && v.trim().length > 0 && v.length <= 512)
  || (Number.isSafeInteger(v) && v >= 0);
const versionOK = v => Number.isSafeInteger(v) && v >= 0;
const colorOK = c => c === 1 || c === 2;
const contains = (g, p) => p && g.visible && p.x >= g.bounds.left && p.x <= g.bounds.right
  && p.y >= g.bounds.top && p.y <= g.bounds.bottom;
const clampHand = (g, p) => ({ x: Math.max(g.bounds.left, Math.min(g.bounds.right, p.x)),
  y: Math.max(g.bounds.top, Math.min(g.bounds.bottom, p.y)) });
// Segment/expanded-board slab test for a whole actor, with touching allowed.
const clearRoamPath = (g, a, b) => {
  if (!g.board || g.board.width <= 0 || g.board.height <= 0) return true;
  let enter = 0, exit = 1;
  for (const [axis, low, high] of [['x', g.board.left - g.actorSize.width, g.board.right],
    ['y', g.board.top - g.actorSize.height, g.board.bottom]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] <= low || a[axis] >= high) return true;
      continue;
    }
    const t1 = (low - a[axis]) / delta, t2 = (high - a[axis]) / delta;
    enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
    if (enter >= exit) return true;
  }
  return enter >= exit;
};

function defaultClock() {
  const g = globalThis;
  const now = () => g.performance?.now?.() ?? Date.now();
  return { now,
    request: callback => typeof g.requestAnimationFrame === 'function'
      ? g.requestAnimationFrame(callback) : g.setTimeout(() => callback(now()), 16),
    cancel: id => typeof g.cancelAnimationFrame === 'function'
      ? g.cancelAnimationFrame(id) : g.clearTimeout(id),
    timeout: (callback, ms) => g.setTimeout(callback, ms),
    clearTimeout: id => g.clearTimeout(id) };
}

/**
 * clock: {now():ms, request(cb):id, cancel(id), timeout(cb,ms):id, clearTimeout(id)}.
 * emit gets detached local-coordinate models. Right-facing unmirrored palm is
 * (.545,.676); left-facing palm X is mirrored. heldStone X/Y always == hand.
 * play* returns true only when a confirmed envelope is consumed, false on reject.
 * reset/updateAuthority establishes the game and monotonic version floor first.
 * role may provide {bubbles:{thinking,pickup,smug,pout,invite}}; otherwise short zh.
 */
export class MotionDirector {
  constructor({ measure, emit = () => {}, clock, role, actionProfile } = {}) {
    if (typeof measure !== 'function') throw new TypeError('MotionDirector requires measure()');
    this.measure = measure; this.emit = emit; this.clock = clock ?? defaultClock(); this.role = role;
    // Local presentation policy only; never a pet service or a gameplay callback.
    this.actionProfile = actionProfile;
    for (const method of ['now', 'request', 'cancel', 'timeout', 'clearTimeout'])
      if (typeof this.clock[method] !== 'function') throw new TypeError(`clock.${method} is required`);
    this.gameId = null; this.version = 0; this.quiet = false; this.reducedMotion = false;
    this.disposed = false; this.active = null; this.frame = null; this.watchdog = null;
    this.ambientEnabled = false; this.ambient = null;
    this.generation = 0; this.frameGeneration = 0;
    this.seenEvents = new Set(); this.seenMoves = new Set(); this.roamIndex = 0;
    const g = this._geometry();
    this.model = this._idle(g, g.home);
  }
  get busy() { return this.active !== null && this.active.kind !== 'roam'; }
  _geometry() {
    try {
      const g = this.measure();
      if (g?.bounds && g.actorSize && g.home) { this.geometry = g; return g; }
    } catch { /* Transient unmounted/layout measurements must never hold a stone. */ }
    return measureGeometry();
  }
  // Ambient frames use the director's one RAF lane, never gameplay active/busy.
  setAmbientEnabled(value) {
    if (this.disposed) return false;
    const duration = this.actionProfile?.ambient?.durationMs;
    this.ambientEnabled = !!value && !this.reducedMotion
      && Number.isFinite(duration) && duration >= 16 && duration <= 120000;
    if (!this.ambientEnabled && this.ambient) {
      this._cancelFrame(); this.ambient = null;
      this._publish(this._idle(this._geometry(), this.model));
    } else if (this.ambientEnabled) this._resumeAmbient();
    return this.ambientEnabled;
  }
  _resumeAmbient() {
    if (this.disposed || this.emitting || !this.ambientEnabled || this.reducedMotion || this.active
      || this.ambient || this.gameId === null) return;
    const g = this._geometry();
    if (!g.visible || g.safeIdle === false) return;
    const token = ++this.generation;
    this.ambient = { token, start: this.clock.now() };
    this._tickAmbient(token);
  }
  _tickAmbient(token) {
    if (this.disposed || !this.ambientEnabled || this.active || this.ambient?.token !== token) return;
    this.frame = null;
    const g = this._geometry(), elapsed = this.clock.now() - this.ambient.start;
    if (!g.visible || g.safeIdle === false || !Number.isFinite(elapsed)) {
      this.ambient = null; this._cancelFrame(); return;
    }
    const p = clearRoamPath(g, this.model, this.model) ? this.model : g.home;
    if (!clearRoamPath(g, p, p)) { this.ambient = null; return; }
    this._publish({ ...this._idle(g, p), actionClock: 'dsh-chess-ai-v1',
      timeScale: this.actionProfile.timeScale ?? 1, phaseElapsed: Math.max(0, elapsed),
      phaseDuration: this.actionProfile.ambient.durationMs, segmentIndex: 0, ambientEpoch: token });
    if (!this.disposed && !this.active && this.ambient?.token === token) {
      const ticket = ++this.frameGeneration;
      this.frame = this.clock.request(() => {
        if (ticket === this.frameGeneration) this._tickAmbient(token);
      });
    }
  }
  _hand(g, position, facing = 'right') {
    return clampHand(g, { x: position.x + g.actorSize.width * (facing === 'left' ? 1 - RIGHT_PALM.x : RIGHT_PALM.x),
      y: position.y + g.actorSize.height * RIGHT_PALM.y });
  }
  _idle(g, position) {
    const p = clampActor(g, position);
    return { phase: 'idle', ...p, width: g.actorSize.width, height: g.actorSize.height,
      facing: 'right', track: 'idle', hand: this._hand(g, p), heldStone: null,
      hiddenMoveId: null, avatarFeedback: null, bubble: null, eventId: null,
      gameId: this.gameId, version: this.version };
  }
  _publish(model) {
    this.model = model;
    // The consumer may decorate its copy without corrupting subsequent frames.
    const previous = this.emitting; this.emitting = true;
    try {
      this.emit({ ...model, hand: { ...model.hand },
        heldStone: model.heldStone && { ...model.heldStone },
        avatarFeedback: model.avatarFeedback && { ...model.avatarFeedback } });
    } finally { this.emitting = previous; }
  }
  _cancelFrame() {
    this.frameGeneration++;
    if (this.frame !== null) this.clock.cancel(this.frame);
    this.frame = null;
  }
  _clearTimers() {
    this._cancelFrame();
    if (this.watchdog !== null) this.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
  }
  _stop(reason, home = false) {
    this.generation++; this._clearTimers(); this.active = null; this.ambient = null;
    const g = this._geometry();
    this.lastCancelReason = reason;
    this._publish(this._idle(g, home ? g.home : this.model));
  }
  reset({ gameId, version } = {}) {
    if (this.disposed || !validId(gameId) || !versionOK(version)) return false;
    // Same-game reset cannot lower the stale-event floor or replay consumed IDs.
    if (this.gameId === gameId && version < this.version) return false;
    if (this.gameId !== gameId) { this.seenEvents.clear(); this.seenMoves.clear(); }
    this.gameId = gameId; this.version = version; this.ambientEnabled = false;
    this._stop('reset', true); return true;
  }
  updateAuthority(snapshot) {
    if (this.disposed) return false;
    const value = snapshot?.game ?? snapshot;
    const gameId = value?.gameId ?? value?.id, version = value?.version;
    if (!validId(gameId) || !versionOK(version)) return false;
    if (this.gameId !== gameId) return this.reset({ gameId, version });
    if (version < this.version) return false;
    if (version > this.version) { this.version = version; this._stop('authority-advanced'); }
    return true;
  }
  _accept(event, kind) {
    if (this.disposed || event?.confirmed !== true || this.gameId === null
      || event.gameId !== this.gameId || !versionOK(event.version) || event.version < this.version
      || !validId(event.eventId) || this.seenEvents.has(event.eventId)) return false;
    if (kind === 'move' && (!validId(event.moveId) || this.seenMoves.has(event.moveId)
      || !colorOK(event.color) || !Number.isInteger(event.row) || !Number.isInteger(event.col)
      || event.row < 0 || event.row > 14 || event.col < 0 || event.col > 14)) return false;
    if (kind === 'defeat' && (event.status !== 'won' || !colorOK(event.playerColor)
      || event.winner !== event.playerColor)) return false;
    this.version = event.version;
    this.seenEvents.add(event.eventId);
    if (kind === 'move') this.seenMoves.add(event.moveId);
    return true;
  }
  playMove(event) { return this._play(event, 'move'); }
  playDefeat(event) { return this._play(event, 'defeat'); }
  _play(event, kind) {
    if (!this._accept(event, kind)) return false;
    const stoppedGeneration = this.generation + 1;
    this._stop('superseded');
    // A synchronous consumer reset/disposal/new event must win over this one.
    if (this.disposed || this.generation !== stoppedGeneration
      || this.gameId !== event.gameId || this.version !== event.version) return true;
    const g = this._geometry();
    if (this.reducedMotion || !g.visible || (kind === 'move' && !contains(g, boardPoint(g, event.row, event.col)))) {
      this._publish(this._idle(g, g.home)); return true;
    }
    this._begin(kind, { ...event }, this.actionProfile?.[kind] ?? (kind === 'move' ? MOVE : DEFEAT));
    return true;
  }
  _begin(kind, event, sequence, target) {
    const deadlineMs = motionDeadlineMs(sequence, this.actionProfile);
    if (deadlineMs === null) { this.ambientEnabled = false; this._stop('invalid-profile', true); return false; }
    this._clearTimers(); this.ambient = null;
    const token = ++this.generation;
    this.active = { kind, event, sequence, target, token, deadlineMs, start: this.clock.now(),
      origin: { x: this.model.x, y: this.model.y }, segment: -1,
      segmentOrigin: { x: this.model.x, y: this.model.y }, released: false };
    this.watchdog = this.clock.timeout(() => {
      if (!this.disposed && this.active?.token === token) this._stop('timeout', true);
    }, deadlineMs);
    this._tick(token); return true;
  }
  _bubble(phase) {
    if (this.quiet) return null;
    const defaults = { thinking: '这步，想好了。', pickup: '拿稳了，看这里。', smug: '这手还不错吧？',
      pout: '哼，这局算你的。', invite: '再来一局！' };
    const custom = this.role?.bubbles?.[phase];
    // Custom values may be locale keys: the UI resolves them with t(), so never
    // truncate/translate them here. Only built-in visible copy is capped.
    if (typeof custom === 'string') return custom || null;
    return defaults[phase] ? Array.from(defaults[phase]).slice(0, 40).join('') : null;
  }
  _tick(token) {
    const a = this.active;
    if (this.disposed || !a || a.token !== token) return;
    this.frame = null;
    const elapsed = Math.max(0, this.clock.now() - a.start);
    if (!Number.isFinite(elapsed) || elapsed >= a.deadlineMs) { this._stop('timeout', true); return; }
    const g = this._geometry();
    const event = a.event;
    const board = a.kind === 'move' ? boardPoint(g, event.row, event.col) : null;
    if (!g.visible || (a.kind === 'move' && !contains(g, board))) { this._stop('layout-clipped', true); return; }
    if (elapsed >= total(a.sequence)) {
      const point = a.kind === 'roam' ? a.target(g) : g.home;
      this._clearTimers(); this.active = null;
      this._publish(this._idle(g, point)); this._resumeAmbient(); return;
    }
    let index = 0, start = 0;
    while (index < a.sequence.length - 1 && elapsed >= start + a.sequence[index][1]) {
      start += a.sequence[index++][1];
    }
    const [phase, duration, track] = a.sequence[index], progress = (elapsed - start) / duration;
    if (index !== a.segment) {
      a.segment = index;
      a.segmentOrigin = clampActor(g, this.model);
      a.segmentOriginHand = this.model.hand ? { ...this.model.hand } : null;
    }
    const origin = clampActor(g, a.segmentOrigin);
    let point = clampActor(g, this.model), facing = this.model.facing;
    const contactPalm = this.actionProfile?.releasePalm ?? RIGHT_PALM;
    const align = target => clampActor(g, { x: target.x - g.actorSize.width * contactPalm.x,
      y: target.y - g.actorSize.height * contactPalm.y });
    let target = null;
    if (phase === 'carrying') target = align(board);
    if (phase === 'run-avatar') target = g.avatarApproach ?? align(g.avatarTarget);
    if (phase === 'retreat') target = g.home;
    if (phase === 'roam') {
      target = a.target(g);
      if (!clearRoamPath(g, origin, target)) { this._stop('roam-path-blocked', true); return; }
    }
    if (target) {
      point = clampActor(g, mix(origin, target, ease(progress)));
      if (Math.abs(target.x - origin.x) > .1) facing = target.x >= origin.x ? 'right' : 'left';
    }
    // Holding poses follow a newly measured target, even when an avatar/card or
    // corner cell moves during animation. Body stays inside the visible room.
    if (phase === 'placing' || phase === 'smug') { point = align(board); facing = 'right'; }
    if (a.kind === 'defeat' && ['punch', 'arms-crossed', 'invite'].includes(phase)) {
      point = clampActor(g, g.avatarApproach ?? align(g.avatarTarget));
    }
    if (a.kind === 'defeat' && ['run-avatar', 'punch', 'arms-crossed', 'invite'].includes(phase))
      facing = g.avatarTarget.x >= point.x + g.actorSize.width / 2 ? 'right' : 'left';
    const profile = this.actionProfile, phaseElapsed = elapsed - start;
    const palm = profile?.palm?.(phase, phaseElapsed, facing) ?? (profile ? profile.releasePalm ?? RIGHT_PALM : null);
    let desiredStone = null;
    if (profile && (phase === 'carrying' || (phase === 'placing' && phaseElapsed < profile.placementMs))) {
      // Preserve the actual baked-piece world position across action boundaries.
      // Each frame's measured anchor translates the body underneath that path.
      const approach = { x: board.x + 20, y: board.y - 16 };
      const from = a.segmentOriginHand ?? approach;
      desiredStone = phase === 'carrying' ? mix(from, approach, ease(progress))
        : mix(from, board, ease(Math.min(1, phaseElapsed / profile.placementMs)));
      point = clampActor(g, { x: desiredStone.x - g.actorSize.width * palm.x,
        y: desiredStone.y - g.actorSize.height * palm.y });
    }
    let hand = palm ? clampHand(g, { x: point.x + g.actorSize.width * palm.x,
      y: point.y + g.actorSize.height * palm.y }) : this._hand(g, point, facing);
    if (!profile && phase === 'placing') hand = clampHand(g, mix(hand, board, ease(Math.min(1, progress / .65))));
    if (desiredStone) {
      if (Math.hypot(hand.x - desiredStone.x, hand.y - desiredStone.y) > 1) {
        // A clipped viewport must reveal the committed board, never fake contact.
        this._stop('anchor-clipped', true); return;
      }
    }
    let avatarFeedback = null;
    if (phase === 'punch') {
      const punch = a.sequence.slice(0, index + 1).filter(segment => segment[0] === 'punch').length;
      if (profile) {
        // One contiguous source03–04 impact per independently clocked segment.
        if (phaseElapsed >= profile.punchContact && phaseElapsed < profile.punchFeedbackEnd)
          avatarFeedback = { shake: 3 * Math.sin((phaseElapsed - profile.punchContact) / (profile.timeScale ?? 1) * Math.PI / 80),
            stars: 3, pulseId: `${event.eventId}:punch:${punch}` };
      } else {
        const reach = Math.sin(Math.PI * Math.min(1, progress));
        hand = clampHand(g, mix(hand, g.avatarTarget, reach));
        if (progress >= .35) avatarFeedback = { shake: 4 * Math.sin(progress * Math.PI * 6),
          stars: 3, pulseId: `${event.eventId}:punch:${punch}` };
      }
    }
    if (a.kind === 'move' && elapsed >= (profile?.releaseAt ?? RELEASE_AT)) a.released = true;
    const holding = a.kind === 'move' && !a.released && elapsed >= (profile?.holdAt ?? (550 + 550 * .5));
    this._publish({ phase, ...point, width: g.actorSize.width, height: g.actorSize.height,
      ...(profile ? { actionClock: 'dsh-chess-ai-v1', timeScale: profile.timeScale ?? 1, phaseElapsed, phaseDuration: duration,
        segmentIndex: index, stoneColor: event?.color ?? null } : {}),
      facing, track, hand, heldStone: holding ? { moveId: event.moveId, color: event.color, ...hand } : null,
      hiddenMoveId: a.kind === 'move' && !a.released ? event.moveId : null,
      avatarFeedback, bubble: this._bubble(phase), eventId: event?.eventId ?? null,
      gameId: this.gameId, version: this.version });
    // emit may synchronously cancel/reset/dispose the director.
    if (!this.disposed && this.active?.token === token) {
      const ticket = ++this.frameGeneration;
      this.frame = this.clock.request(() => {
        if (ticket === this.frameGeneration) this._tick(token);
      });
    }
  }
  /** ResizeObserver/scroll hook: remeasure now, preserving one RAF and the wall deadline. */
  reflow() {
    if (this.disposed || this.emitting) return false;
    if (this.active) {
      const token = this.active.token;
      this._cancelFrame(); this._tick(token);
    } else {
      const g = this._geometry();
      let point = clampActor(g, this.model);
      const overlaps = p => g.board && p.x < g.board.right && p.x + g.actorSize.width > g.board.left
        && p.y < g.board.bottom && p.y + g.actorSize.height > g.board.top;
      // A newly moved board must not cover an idle actor when a free band exists.
      if (overlaps(point) && !overlaps(g.home)) point = g.home;
      this._publish(this._idle(g, point));
      if (this.ambient) { const token = this.ambient.token; this._cancelFrame(); this._tickAmbient(token); }
      else this._resumeAmbient();
    }
    return true;
  }
  skip() { if (this.disposed) return false; this.ambientEnabled = false; this._stop('skip', true); return true; }
  cancel(reason = 'cancel') { if (this.disposed) return false; this.ambientEnabled = false; this._stop(reason); return true; }
  setQuiet(value) {
    if (this.disposed) return false;
    this.quiet = !!value;
    if (this.quiet) this._publish({ ...this.model, bubble: null });
    return true;
  }
  setReducedMotion(value) {
    if (this.disposed) return false;
    this.reducedMotion = !!value;
    if (this.reducedMotion) { this.ambientEnabled = false; this._stop('reduced-motion', true); }
    return true;
  }
  dragTo(point) {
    if (this.disposed || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
    this.ambientEnabled = false; this._stop('drag');
    const g = this._geometry(); this._publish(this._idle(g, point)); return true;
  }
  roam() {
    if (this.disposed || this.active || this.reducedMotion || this.gameId === null) return false;
    const g = this._geometry();
    if (!g.visible || !g.perimeter?.length) return false;
    const here = point => Math.abs(point.x - this.model.x) < .1 && Math.abs(point.y - this.model.y) < .1;
    let at = g.perimeter[this.roamIndex] && here(g.perimeter[this.roamIndex])
      ? this.roamIndex : g.perimeter.findIndex(here);
    let index;
    if (at >= 0) index = (at + 1) % g.perimeter.length;
    else {
      // An interrupted/dragged actor may only rejoin a reachable band anchor.
      index = g.perimeter.map((point, i) => ({ i, point,
        distance: Math.hypot(point.x - this.model.x, point.y - this.model.y) }))
        .filter(item => clearRoamPath(g, this.model, item.point))
        .sort((a, b) => a.distance - b.distance)[0]?.i;
    }
    if (index === undefined || !clearRoamPath(g, this.model, g.perimeter[index])) return false;
    this.roamIndex = index;
    return this._begin('roam', null, [['roam', this.actionProfile?.roamMs ?? 1700, 'walk']], current => current.perimeter[index] ?? current.home);
  }
  dispose() {
    if (this.disposed) return;
    // Set the terminal flag before emit, so cleanup cannot re-enter play().
    this.disposed = true; this.ambientEnabled = false; this._stop('dispose');
    this.seenEvents.clear(); this.seenMoves.clear();
  }
}
