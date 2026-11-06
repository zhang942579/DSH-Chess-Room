/**
 * Pure, bounded fence for durable Host stage events. No imports, RPC, timers,
 * storage, callbacks, move submission, or event inference from board changes.
 * Keep ONE instance per mounted component, including subscription reconnects.
 */
export const LIVE_EVENT_HISTORY_LIMIT = 256;
export const LIVE_EVENT_PENDING_LIMIT = 32;
const MAX_EVENTS = 512;
const MAX_MOVES = 225;
const idOK = value => (typeof value === 'string' && value.trim().length > 0 && value.length <= 512)
  || (Number.isSafeInteger(value) && value >= 0);
const versionOK = value => Number.isSafeInteger(value) && value >= 0;
const colorOK = value => value === 1 || value === 2;
const cellOK = value => Number.isInteger(value) && value >= 0 && value < 15;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const humanWin = game => game.status === 'won' && game.winner === game.playerColor;
const sameMove = (a, b) => a.row === b.row && a.col === b.col && a.color === b.color && a.moveId === b.moveId;
const copyMove = move => ({ row: move.row, col: move.col, color: move.color,
  ...(move.moveId !== undefined ? { moveId: move.moveId } : {}),
  ...(move.source !== undefined ? { source: move.source } : {}) });
const copyEvent = event => ({ ...event });
const eventFields = ['kind', 'confirmed', 'gameId', 'version', 'eventId', 'moveId', 'row', 'col',
  'color', 'status', 'winner', 'playerColor', 'preview'];
function projectEvent(event) {
  if (!record(event)) return null;
  const projected = {};
  for (const key of eventFields) {
    const value = event[key];
    // Never retain arbitrary objects or oversized strings from malformed input.
    projected[key] = (typeof value === 'string' && value.length <= 512)
      || typeof value === 'number' || typeof value === 'boolean' || value === null ? value : undefined;
  }
  return projected;
}

function boundedLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(`limit must be an integer from 1 to ${maximum}`);
  return value;
}

// Legacy persisted moves without IDs may be synchronized, but NEVER animated.
// Verify board/move agreement without evaluating or inventing game outcomes.
function readSnapshot(snapshot) {
  const game = snapshot?.game;
  if (!record(snapshot) || !idOK(snapshot.runtimeId) || !record(game)
    || !idOK(game.id) || !versionOK(game.version) || !colorOK(game.playerColor)
    || !['playing', 'won', 'draw', 'resigned'].includes(game.status)
    || (['playing', 'draw'].includes(game.status) ? game.winner !== null : !colorOK(game.winner))
    || !Array.isArray(game.board) || game.board.length !== 15
    || !Array.isArray(game.moves) || game.moves.length > MAX_MOVES) return null;
  const board = [];
  for (const row of game.board) {
    if (!Array.isArray(row) || row.length !== 15 || row.some(cell => cell !== 0 && !colorOK(cell))) return null;
    board.push([...row]);
  }
  const cells = new Set(), ids = new Set(), moves = [];
  for (const move of game.moves) {
    if (!record(move) || !cellOK(move.row) || !cellOK(move.col) || !colorOK(move.color)
      || (move.moveId !== undefined && !idOK(move.moveId))
      || (move.source !== undefined && !['human', 'model', 'engine'].includes(move.source))) return null;
    const cell = move.row * 15 + move.col;
    if (cells.has(cell) || board[move.row][move.col] !== move.color
      || (move.moveId !== undefined && ids.has(move.moveId))) return null;
    cells.add(cell); if (move.moveId !== undefined) ids.add(move.moveId);
    moves.push(copyMove(move));
  }
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++)
    if (board[row][col] !== 0 && !cells.has(row * 15 + col)) return null;
  const stage = snapshot.stage;
  const stageOK = record(stage) && stage.format === 1 && Array.isArray(stage.events)
    && stage.events.length <= MAX_EVENTS && (stage.epoch === undefined || idOK(stage.epoch))
    && (stage.gameId === undefined || stage.gameId === game.id)
    && (stage.version === undefined || stage.version === game.version)
    && (stage.replayThroughVersion === undefined || (versionOK(stage.replayThroughVersion)
      && stage.replayThroughVersion <= game.version));
  return { runtimeId: snapshot.runtimeId, gameId: game.id, version: game.version,
    board, moves, status: game.status, winner: game.winner, playerColor: game.playerColor,
    comments: typeof snapshot.settings?.comments === 'boolean' ? snapshot.settings.comments : true,
    epoch: stageOK ? stage.epoch : undefined, stageOK,
    replayThroughVersion: stageOK ? stage.replayThroughVersion ?? 0 : 0,
    events: stageOK ? stage.events.map(projectEvent) : [] };
}

function matchesMove(event, game) {
  const move = game.moves.find(value => value.moveId === event.moveId);
  return !!move && sameMove(move, event) && move.color === 3 - game.playerColor
    && move.source !== 'human' && game.board[move.row][move.col] === move.color;
}

function readEvent(event, game) {
  if (!record(event) || event.confirmed !== true || event.preview === true
    || event.gameId !== game.gameId || !versionOK(event.version) || event.version > game.version
    || event.version <= game.replayThroughVersion
    || !idOK(event.eventId)) return null;
  const base = { kind: event.kind, confirmed: event.confirmed, gameId: event.gameId,
    version: event.version, eventId: event.eventId };
  if (event.kind === 'move-committed') {
    if (!idOK(event.moveId) || !cellOK(event.row) || !cellOK(event.col) || !colorOK(event.color)
      || !matchesMove(event, game)) return null;
    return { ...base, moveId: event.moveId, row: event.row, col: event.col, color: event.color };
  }
  if (event.kind === 'human-victory' && event.status === 'won' && colorOK(event.playerColor)
    && event.playerColor === game.playerColor && event.winner === game.winner
    && event.winner === event.playerColor && humanWin(game))
    return { ...base, status: event.status, winner: event.winner, playerColor: event.playerColor };
  return null;
}

function confirmedMask(game, model) {
  if (!game?.stageOK || humanWin(game) || !idOK(model?.hiddenMoveId) || !idOK(model?.eventId)
    || model.gameId !== game.gameId || !versionOK(model.version)
    || (model.runtimeId !== undefined && model.runtimeId !== game.runtimeId)) return null;
  const event = game.events.map(value => readEvent(value, game)).find(value => value?.kind === 'move-committed'
    && value.eventId === model.eventId && value.moveId === model.hiddenMoveId && value.version === model.version);
  return event ? copyMove(game.moves.find(move => move.moveId === event.moveId)) : null;
}

/** Exact durable ledger AND current persisted move match; no coordinate fallback. */
export function confirmedMoveMask(snapshot, model) {
  return confirmedMask(readSnapshot(snapshot), model);
}

/**
 * Actions are detached values:
 *   cancel:    {type:'cancel', reason}
 *   authority: {type:'authority', reset, runtimeId, gameId, version,
 *               snapshotVersion, board, moves, status, winner, playerColor, comments}
 *   move/defeat: {type:'move'|'defeat', event:<original confirmed fields>}
 *
 * consume(snapshot,{busy:director.busy,reconnect:false}) synchronizes authority
 * and emits at most ONE visual event; drain({busy:director.busy}) emits the next.
 * Confirmed human victory immediately cancels/discards prior move animations and
 * emits defeat even while busy. Human-win state alone cancels but cannot animate.
 * Call drain after the director becomes idle, not recursively inside its emit.
 * disconnect() cancels and makes the NEXT valid snapshot a no-replay baseline.
 *
 * IMPORTANT: authority.version is the VISUAL floor, not snapshotVersion. On
 * reset=true call director.reset({gameId,version}); otherwise authority is
 * informational (do NOT call updateAuthority(rawSnapshot): it cancels motion on
 * unrelated settings/chat commits and can reject a legitimately delayed event).
 * playMove/playDefeat receive action.event unchanged. Cancel precedes reset/play.
 * A new runtime with the same game but a lower version needs a fresh director:
 * MotionDirector intentionally rejects lowering its same-game floor.
 *
 * Baselines (first/reconnect/runtime/game/epoch/replay-fence/undo/reset) skip ALL
 * events in that snapshot. Optional stage gameId/version headers must match;
 * replayThroughVersion is a monotonic no-replay floor. Normal events may arrive
 * after unrelated version increments, but must be newer than the baseline AND
 * last accepted visual event (one durable AI move or human-win event per commit),
 * and match CURRENT persisted IDs/board or CURRENT human-win state. History,
 * pending queue, snapshot projection, input event scan, and action count bounded.
 * Pending overflow intentionally cancels/rebases instead of hiding stale stones.
 */
export class LiveEventFence {
  constructor({ historyLimit, pendingLimit } = {}) {
    this.historyLimit = boundedLimit(historyLimit, LIVE_EVENT_HISTORY_LIMIT, MAX_EVENTS);
    this.pendingLimit = boundedLimit(pendingLimit, LIVE_EVENT_PENDING_LIMIT, MAX_MOVES);
    this.current = null; this.baselineVersion = 0; this.acceptedVersion = 0;
    this.visualVersion = 0; this.needsBaseline = false;
    this.seenEvents = new Set(); this.seenMoves = new Set(); this.pending = [];
    this.retiredRuntimes = new Set(); this.retiredGames = new Set();
    this.dispatched = null; this.victoryConsumed = false;
  }
  _remember(set, id) {
    if (!idOK(id)) return;
    set.add(id);
    while (set.size > this.historyLimit) set.delete(set.values().next().value);
  }
  _skipEvents(game) {
    for (const event of game.events) if (record(event)) {
      this._remember(this.seenEvents, event.eventId);
      this._remember(this.seenMoves, event.moveId);
    }
  }
  _authority(reset = false) {
    const game = this.current;
    return { type: 'authority', reset, runtimeId: game.runtimeId, gameId: game.gameId,
      version: this.visualVersion, snapshotVersion: game.version,
      board: game.board.map(row => [...row]), moves: game.moves.map(copyMove),
      status: game.status, winner: game.winner, playerColor: game.playerColor, comments: game.comments };
  }
  _baseline(game, reason) {
    if (reason === 'runtime-change') {
      this._remember(this.retiredRuntimes, this.current.runtimeId); this.retiredGames.clear();
    } else if (reason === 'game-change') this._remember(this.retiredGames, this.current.gameId);
    this.current = game; this.needsBaseline = false;
    this.baselineVersion = this.acceptedVersion = this.visualVersion = game.version;
    this.pending = []; this.dispatched = null; this.victoryConsumed = humanWin(game);
    // Clear on authority lifetime change; retain per-component history on undo/reconnect.
    if (['first-snapshot', 'runtime-change', 'game-change'].includes(reason)) {
      this.seenEvents.clear(); this.seenMoves.clear();
    }
    this._skipEvents(game);
    return [{ type: 'cancel', reason }, this._authority(true)];
  }
  consume(snapshot, { busy = false, reconnect = false } = {}) {
    if (reconnect) this.needsBaseline = true;
    const game = readSnapshot(snapshot);
    if (!game) {
      // Reconnect must cancel even when its first response is malformed.
      if (this.needsBaseline) return this.disconnect();
      return [];
    }
    const previous = this.current;
    if (!previous) return this._baseline(game, 'first-snapshot');
    if (previous.runtimeId !== game.runtimeId) {
      if (this.retiredRuntimes.has(game.runtimeId)) return [];
      return this._baseline(game, 'runtime-change');
    }
    if (previous.gameId !== game.gameId) {
      if (this.retiredGames.has(game.gameId)) return [];
      return this._baseline(game, 'game-change');
    }
    if (game.version < previous.version) return this.needsBaseline ? this.disconnect() : [];
    if (this.needsBaseline) return this._baseline(game, 'reconnect');
    // A malformed/unsupported stage must not cause spurious epoch rebasing.
    if (game.stageOK && previous.epoch !== game.epoch) return this._baseline(game, 'epoch-change');
    if (game.stageOK && game.replayThroughVersion > previous.replayThroughVersion)
      return this._baseline(game, 'replay-fence');
    if (game.stageOK && game.replayThroughVersion < previous.replayThroughVersion) return [];
    if (!game.stageOK) {
      game.epoch = previous.epoch; game.replayThroughVersion = previous.replayThroughVersion;
    }
    const sameState = previous.playerColor === game.playerColor && previous.status === game.status
      && previous.winner === game.winner && previous.moves.length === game.moves.length
      && previous.moves.every((move, index) => sameMove(move, game.moves[index]));
    if (game.version === previous.version && !sameState) return [];
    const extendsMoves = previous.moves.length <= game.moves.length
      && previous.moves.every((move, index) => sameMove(move, game.moves[index]));
    if (!extendsMoves || previous.playerColor !== game.playerColor
      || (previous.status !== 'playing' && (previous.status !== game.status || previous.winner !== game.winner)))
      return this._baseline(game, 'undo-or-reset');
    this.current = game;
    if (this.dispatched?.kind === 'human-victory' && !humanWin(game))
      return this._baseline(game, 'terminal-invalidated');
    // Stable chronological ordering, regardless of the journal's array order.
    const events = game.events.map((event, index) => ({ event: readEvent(event, game), index }))
      .filter(value => value.event).sort((a, b) => a.event.version - b.event.version || a.index - b.index);
    const victory = events.map(value => value.event).find(event => event.kind === 'human-victory'
      && event.version > this.baselineVersion && event.version > this.acceptedVersion
      && !this.seenEvents.has(event.eventId) && !this.victoryConsumed);
    if (victory) {
      // Terminal authority outranks old carrying/smug/queued move choreography.
      this.pending = []; this.victoryConsumed = true;
      this.acceptedVersion = this.visualVersion = victory.version;
      this.dispatched = copyEvent(victory);
      for (const { event } of events) if (event.version <= victory.version) {
        this._remember(this.seenEvents, event.eventId);
        if (event.kind === 'move-committed') this._remember(this.seenMoves, event.moveId);
      }
      return [{ type: 'cancel', reason: 'human-victory' }, this._authority(false),
        { type: 'defeat', event: copyEvent(victory) }];
    }
    const terminalCancel = humanWin(game) && (!humanWin(previous)
      || this.dispatched?.kind === 'move-committed' || this.pending.some(event => event.kind === 'move-committed'));
    if (terminalCancel) { this.pending = []; this.dispatched = null; }
    for (const { event } of events) {
      if (humanWin(game) || event.version <= this.baselineVersion || event.version <= this.acceptedVersion
        || this.seenEvents.has(event.eventId)
        || (event.kind === 'move-committed' && this.seenMoves.has(event.moveId))
        || (event.kind === 'human-victory' && this.victoryConsumed)) continue;
      this._remember(this.seenEvents, event.eventId);
      if (event.kind === 'move-committed') this._remember(this.seenMoves, event.moveId);
      else this.victoryConsumed = true;
      this.acceptedVersion = event.version;
      if (this.pending.length >= this.pendingLimit) return this._baseline(game, 'pending-overflow');
      this.pending.push(event);
    }
    const visual = this.drain({ busy });
    return [...(terminalCancel ? [{ type: 'cancel', reason: 'human-victory-sync' }] : []),
      this._authority(false), ...visual];
  }
  drain({ busy = false } = {}) {
    if (busy || this.needsBaseline || !this.current) return [];
    while (this.pending.length) {
      const event = this.pending.shift();
      if (!readEvent(event, this.current) || event.version < this.visualVersion) continue;
      this.visualVersion = event.version; this.dispatched = copyEvent(event);
      return [{ type: event.kind === 'move-committed' ? 'move' : 'defeat', event: copyEvent(event) }];
    }
    return [];
  }
  disconnect() {
    this.needsBaseline = true; this.pending = []; this.dispatched = null;
    return [{ type: 'cancel', reason: 'disconnect' }];
  }
  /** Detached board; only the exact dispatched confirmed stone may be masked. */
  boardFor(model) {
    if (!this.current) return null;
    const board = this.current.board.map(row => [...row]), event = this.dispatched;
    if (!this.needsBaseline && event?.kind === 'move-committed'
      && model?.gameId === event.gameId && model.version === event.version
      && model.eventId === event.eventId && model.hiddenMoveId === event.moveId
      && confirmedMask(this.current, model)) board[event.row][event.col] = 0;
    return board;
  }
  get state() {
    return { runtimeId: this.current?.runtimeId ?? null, gameId: this.current?.gameId ?? null,
      snapshotVersion: this.current?.version ?? null, visualVersion: this.visualVersion,
      baselineVersion: this.baselineVersion, queued: this.pending.length,
      seenEvents: this.seenEvents.size, seenMoves: this.seenMoves.size,
      needsBaseline: this.needsBaseline };
  }
}
