import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { gomokuAdapter } from './rules.js';

export const STAGE_EVENT_LIMIT = 32;
const text = max => z.string().min(1).max(max);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const color = z.union([z.literal(1), z.literal(2)]);
const coordinate = z.number().int().min(0).max(14);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const moveId = text(128).regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|legacy-[0-9a-f]{64})$/);
const position = z.object({ row: coordinate, col: coordinate });
const eventIdentity = { confirmed: z.literal(true), gameId: text(128), version: integer.min(1), eventId: text(160) };
export const stageEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move-committed'), ...eventIdentity, moveId, row: coordinate, col: coordinate, color }).strict(),
  z.object({ kind: z.literal('human-victory'), ...eventIdentity, winner: color, playerColor: color, status: z.literal('won') }).strict(),
]);
export const stageSchema = z.object({
  format: z.literal(1), epoch: z.string().regex(uuidPattern), replayThroughVersion: integer,
  events: z.array(stageEventSchema).max(STAGE_EVENT_LIMIT),
}).strict();
const messageIdentity = { id: text(128), at: z.number().finite(), contextRevision: integer.optional() };
export const contextSelectionSchema=z.object({workspaceId:text(256).nullable(),sessionId:text(256).nullable(),revision:integer})
  .refine(value=>(value.workspaceId===null)===(value.sessionId===null));
const chessMemorySchema=z.array(z.object({role:z.enum(['user','assistant']),text:text(400)})).max(16)
  .refine(messages=>messages.reduce((sum,message)=>sum+message.text.length,0)<=4800);
const chatSchema = z.discriminatedUnion('who', [
  z.object({ who: z.literal('player'), ...messageIdentity, text: text(400), turn: integer.max(225).optional() }),
  z.object({ who: z.literal('dsh'), ...messageIdentity, text: text(480).refine(value => [...value].length <= 240), turn: integer.min(1).max(225).optional() }),
  z.object({ who: z.literal('system'), ...messageIdentity, key: z.literal('recovered'), turn: integer.min(1).max(225).optional() }),
]);

// Existing format-1 records may lack moveId/stage. Unknown legacy fields are
// projected away, never passed through; stage/events are strict, not extensible.
export const gameSchema = z.preprocess(input => {
  // StorageDomain parses before global.get(): detect legacy INPUT before defaults
  // erase the distinction from a new intentionally-unbound dedicated session.
  return input&&typeof input==='object'&&!Array.isArray(input)&&!Object.hasOwn(input,'contextSelection')
    ? {...input,sessionId:null}:input;
}, z.object({
  id: text(128), adapter: z.literal('gomoku'), version: integer, turnIdentity: text(128),
  playerColor: color,
  // Legacy difficulty is stripped rather than retained as a user/model directive.
  contextSelection: contextSelectionSchema.default({workspaceId:null,sessionId:null,revision:0}),
  chessMemory: chessMemorySchema.default([]),
  board: z.array(z.array(z.union([z.literal(0), color])).length(15)).length(15),
  moves: z.array(z.object({ row: coordinate, col: coordinate, color: color.optional(),
    source: z.enum(['human', 'model', 'engine']).optional(), moveId: moveId.optional() })).max(225),
  turn: color.nullable(), status: z.enum(['playing', 'won', 'draw', 'resigned']), winner: color.nullable(),
  // The original authority ignores/rebuilds saved winningLine and hint on recovery.
  winningLine: z.array(z.object({ row: z.number().int(), col: z.number().int() })).optional(),
  hint: position.nullable().optional(), chat: z.array(chatSchema).max(60),
  sessionId: z.string().regex(/^chess-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable(),
  requestIds: z.array(text(128)).max(512).refine(ids => new Set(ids).size === ids.length),
  settings: z.object({ comments: z.boolean() }), createdAt: z.number().finite(), updatedAt: z.number().finite(),
  lastSource: z.enum(['human', 'model', 'engine']).nullable().optional(), lastReason: text(128).nullable().optional(),
  lastFallbackReason: text(128).nullable().optional(), stage: stageSchema.optional(),
}).superRefine((game, ctx) => {
  const invalid = message => ctx.addIssue({ code: 'custom', message });
  let replay;
  try { replay = gomokuAdapter.replay(game.moves); } catch { invalid('illegal saved moves'); return; }
  if (JSON.stringify(game.board) !== JSON.stringify(replay.board)) invalid('board does not match replay');
  if (game.status === 'resigned') {
    if (replay.over || game.winner !== 3 - game.playerColor || game.turn !== null) invalid('invalid resignation');
  } else if (game.status !== replay.status || game.winner !== replay.winner || game.turn !== replay.nextColor) invalid('invalid rule result');
  const ids = game.moves.map(move => move.moveId).filter(id => id !== undefined);
  if (new Set(ids).size !== ids.length) invalid('duplicate moveId');
  if (!game.stage) return;
  if (game.stage.replayThroughVersion > game.version) invalid('future replay fence');
  const moves = new Map(game.moves.map((move, index) => [move.moveId, { move, index, color: replay.moves[index].color }]));
  const eventIds = new Set();
  let previousVersion = 0, previousMove = -1;
  for (const event of game.stage.events) {
    if (event.gameId !== game.id || event.version > game.version || event.version <= previousVersion || eventIds.has(event.eventId)) invalid('invalid event identity/order');
    eventIds.add(event.eventId); previousVersion = event.version;
    if (event.kind === 'move-committed') {
      const saved = moves.get(event.moveId);
      if (!saved || saved.color === game.playerColor || !['model', 'engine'].includes(saved.move.source)
        || event.row !== saved.move.row || event.col !== saved.move.col || event.color !== saved.color
        || game.board[event.row][event.col] !== event.color || event.eventId !== `move:${event.moveId}`
        || saved.index <= previousMove) invalid('event does not certify a DSH move');
      if (saved) previousMove = saved.index;
    } else {
      const last = game.moves.at(-1);
      if (replay.status !== 'won' || game.status !== 'won' || replay.winner !== game.playerColor
        || event.winner !== game.playerColor || event.playerColor !== game.playerColor
        || !last?.moveId || last.source !== 'human' || replay.moves.at(-1)?.color !== game.playerColor
        || event.eventId !== `human-win:${last.moveId}`) invalid('event does not certify a human victory');
      previousMove = game.moves.length - 1; // A terminal certificate is always the ledger's final event.
    }
  }
}));
export const envelopeSchema = z.object({
  format: z.literal(1), revision: integer, current: gameSchema.nullable(), archived: z.array(gameSchema),
});

export function createStage(replayThroughVersion = 0) {
  return { format: 1, epoch: randomUUID(), replayThroughVersion, events: [] };
}
export function validateSavedGame(value) {
  const parsed = gameSchema.safeParse(value);
  if (!parsed.success) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const game = parsed.data, replay = gomokuAdapter.replay(game.moves);
  game.moves = game.moves.map((move, index) => ({ ...move, color: replay.moves[index].color,
    moveId: move.moveId ?? `legacy-${createHash('sha256').update(JSON.stringify([game.id, index, move.row, move.col, replay.moves[index].color])).digest('hex')}` }));
  // No events are synthesized from history, including already-won legacy games.
  game.stage ??= createStage(game.version);
  game.winningLine = game.status === 'resigned' ? [] : replay.winningLine;
  game.hint = null;
  game.chat=game.chat.map(message=>({...message,contextRevision:message.contextRevision??0}));
  return game;
}

/** Same public storage domain/version/format as v3; no migration of its medium. */
export async function createStorage(ctx) {
  const domain = await ctx.storageDomain.open({
    name: 'dsh_chess_room', version: 1, layout: 'single',
    global: { schema: envelopeSchema, initial: { format: 1, revision: 0, current: null, archived: [] } }, tables: {},
  });
  return {
    read: () => structuredClone(domain.global.get()),
    write: async value => domain.global.set(envelopeSchema.parse(value)),
    close: () => domain.close(),
  };
}
