/**
 * Dependency-free Gomoku engine with deterministic ordering and no randomness.
 * A timed search can complete different depths under different machine loads.
 * Hints and AI use the same
 * generateCandidates function. All difficulties win immediately before blocking
 * an opponent's immediate win. Internal scratch boards never escape or mutate
 * the caller's board. No timers, workers, randomness, or Harness API are needed.
 */
import { SIZE, EMPTY, DIRECTIONS, assertBoard, otherColor, inBounds,
  legalMoves, winningLineAt } from './rules.js';

export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
const WIN_SCORE = 1_000_000_000;
const BLOCK_SCORE = 900_000_000;
const MATE = 10_000_000;
const WINDOW_WEIGHTS = [0, 1, 12, 180, 6000, MATE];

function integerOption(options, name, fallback, min, max) {
  const value = options[name] ?? fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function readOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const timeLimitMs = options.timeLimitMs ?? 80;
  if (!Number.isFinite(timeLimitMs) || timeLimitMs < 0 || timeLimitMs > 250) {
    throw new RangeError('timeLimitMs must be from 0 to 250');
  }
  return {
    timeLimitMs,
    maxNodes: integerOption(options, 'maxNodes', 1600, 0, 10000),
    searchDepth: integerOption(options, 'searchDepth', 3, 1, 4),
    branchFactor: integerOption(options, 'branchFactor', 8, 1, 12),
    candidateLimit: integerOption(options, 'candidateLimit', 12, 1, SIZE * SIZE),
  };
}

function centerScore(row, col) {
  return SIZE - Math.abs(row - 7) - Math.abs(col - 7);
}

function nearby(board, row, col) {
  for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
    if (inBounds(row + dr, col + dc) && board[row + dr][col + dc] !== EMPTY) return true;
  }
  return false;
}

function emptyMoves(board, localOnly = false) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) {
    if (board[row][col] === EMPTY && (!localOnly || nearby(board, row, col))) {
      moves.push({ row, col });
    }
  }
  return moves;
}

function wouldWin(board, move, color) {
  board[move.row][move.col] = color;
  const wins = winningLineAt(board, move.row, move.col, color) !== null;
  board[move.row][move.col] = EMPTY;
  return wins;
}

// Score both straight and broken formations by windows containing the new stone.
function movePotential(board, move, color) {
  const { row, col } = move;
  const opponent = otherColor(color);
  let total = 0;
  board[row][col] = color;
  for (const [dr, dc] of DIRECTIONS) {
    let before = 0;
    let after = 0;
    while (inBounds(row - (before + 1) * dr, col - (before + 1) * dc)
      && board[row - (before + 1) * dr][col - (before + 1) * dc] === color) before += 1;
    while (inBounds(row + (after + 1) * dr, col + (after + 1) * dc)
      && board[row + (after + 1) * dr][col + (after + 1) * dc] === color) after += 1;
    const length = before + after + 1;
    const openBefore = inBounds(row - (before + 1) * dr, col - (before + 1) * dc)
      && board[row - (before + 1) * dr][col - (before + 1) * dc] === EMPTY;
    const openAfter = inBounds(row + (after + 1) * dr, col + (after + 1) * dc)
      && board[row + (after + 1) * dr][col + (after + 1) * dc] === EMPTY;
    const open = Number(openBefore) + Number(openAfter);
    if (length >= 5) total += MATE;
    else if (length === 4) total += open === 2 ? 60000 : open === 1 ? 12000 : 0;
    else if (length === 3) total += open === 2 ? 2200 : open === 1 ? 300 : 0;
    else if (length === 2) total += open === 2 ? 100 : open === 1 ? 20 : 0;
    for (let start = -4; start <= 0; start += 1) {
      if (!inBounds(row + start * dr, col + start * dc)
        || !inBounds(row + (start + 4) * dr, col + (start + 4) * dc)) continue;
      let stones = 0;
      let blocked = false;
      for (let offset = start; offset < start + 5; offset += 1) {
        const cell = board[row + offset * dr][col + offset * dc];
        if (cell === opponent) { blocked = true; break; }
        if (cell === color) stones += 1;
      }
      if (!blocked) total += WINDOW_WEIGHTS[stones];
    }
  }
  board[row][col] = EMPTY;
  return total;
}

function compareMoves(a, b) {
  return b.score - a.score || centerScore(b.row, b.col) - centerScore(a.row, a.col)
    || a.row - b.row || a.col - b.col;
}

function rankedMoves(board, color, moves, difficulty) {
  const opponent = otherColor(color);
  const wins = [];
  const blocks = [];
  for (const move of moves) {
    if (wouldWin(board, move, color)) {
      wins.push({ ...move, score: WIN_SCORE + centerScore(move.row, move.col), reason: 'win' });
    }
    if (wouldWin(board, move, opponent)) {
      blocks.push({ ...move, score: BLOCK_SCORE + centerScore(move.row, move.col), reason: 'block' });
    }
  }
  // Winning ourselves takes precedence even when the opponent also has a threat.
  if (wins.length) return wins.sort(compareMoves);
  if (blocks.length) {
    // Multiple independent winning threats can be impossible to parry in one move.
    // Still return only the squares that remove at least one immediate threat.
    return blocks.map(move => ({ ...move, score: move.score + movePotential(board, move, color) }))
      .sort(compareMoves);
  }
  const local = moves.filter(move => nearby(board, move.row, move.col));
  if (!local.length) {
    return [{ row: 7, col: 7, score: SIZE, reason: 'opening' }];
  }
  return local.map(move => {
    const attack = movePotential(board, move, color);
    const defense = movePotential(board, move, opponent);
    const center = centerScore(move.row, move.col);
    const score = difficulty === 'easy'
      ? attack * 0.5 + defense * 0.35 + center * 10
      : attack + defense * 1.1 + center;
    return { ...move, score, reason: attack >= defense ? 'attack' : 'defend' };
  }).sort(compareMoves);
}

// Zero-sum position evaluation: every unobstructed five-cell window plus center.
function staticEvaluation(board, color) {
  const opponent = otherColor(color);
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) {
    const cell = board[row][col];
    if (cell === color) score += centerScore(row, col);
    else if (cell === opponent) score -= centerScore(row, col);
    for (const [dr, dc] of DIRECTIONS) {
      if (!inBounds(row + dr * 4, col + dc * 4)) continue;
      let own = 0;
      let enemy = 0;
      for (let offset = 0; offset < 5; offset += 1) {
        const value = board[row + dr * offset][col + dc * offset];
        if (value === color) own += 1;
        else if (value === opponent) enemy += 1;
      }
      if (!enemy) score += WINDOW_WEIGHTS[own];
      if (!own) score -= WINDOW_WEIGHTS[enemy];
    }
  }
  return score;
}

function exhausted(context) {
  return context.nodes >= context.maxNodes || performance.now() >= context.deadline;
}

function negamax(board, color, depth, alpha, beta, lastMove, ply, context) {
  if (exhausted(context)) return null;
  context.nodes += 1;
  if (winningLineAt(board, lastMove.row, lastMove.col, otherColor(color))) return -MATE + ply;
  const moves = emptyMoves(board, true);
  if (!moves.length) return 0;
  if (depth === 0) return staticEvaluation(board, color);
  const candidates = rankedMoves(board, color, moves, 'normal').slice(0, context.branchFactor);
  let best = -Infinity;
  for (const move of candidates) {
    if (exhausted(context)) return null;
    board[move.row][move.col] = color;
    const value = negamax(board, otherColor(color), depth - 1, -beta, -alpha, move, ply + 1, context);
    board[move.row][move.col] = EMPTY;
    if (value === null) return null;
    best = Math.max(best, -value);
    alpha = Math.max(alpha, best);
    if (alpha >= beta) break;
  }
  return best;
}

function search(board, color, ranked, options, started) {
  const roots = ranked.slice(0, options.branchFactor);
  const context = { nodes: 0, maxNodes: options.maxNodes,
    deadline: started + options.timeLimitMs, branchFactor: options.branchFactor };
  let completed = null;
  // Commit only complete iterations. An interrupted iteration cannot distort
  // ordering by giving only the first root a deeper score than the other roots.
  for (let depth = 1; depth <= options.searchDepth; depth += 1) {
    const iteration = [];
    for (const move of roots) {
      if (exhausted(context)) return completed ?? ranked;
      board[move.row][move.col] = color;
      const value = negamax(board, otherColor(color), depth - 1, -Infinity, Infinity, move, 1, context);
      board[move.row][move.col] = EMPTY;
      if (value === null) return completed ?? ranked;
      iteration.push({ row: move.row, col: move.col,
        score: -value + move.score / WIN_SCORE, reason: 'search' });
    }
    completed = iteration.sort(compareMoves);
  }
  return completed ?? ranked;
}

/**
 * generateCandidates(board, color, difficulty='normal', options={})
 *   -> Array<{row:number,col:number,score:number,reason:string}>
 * Sorted best first; all entries are legal for the current turn. Heuristics
 * and tie-breaks are deterministic; time-bounded search depth can vary by load.
 * A terminal board or out-of-turn color yields []; malformed input throws.
 * reason: 'win' | 'block' | 'opening' | 'attack' | 'defend' | 'search'.
 * easy: shallow position score; normal: pattern attack/defense; hard: iterative
 * deepening alpha-beta search, with heuristic fallback when budget is exhausted.
 * Options: timeLimitMs=80 (0..250), maxNodes=1600 (0..10000), searchDepth=3 (1..4),
 * branchFactor=8 (1..12), candidateLimit=12 (1..225).
 * A zero time/node budget disables search, NOT mandatory win/block detection.
 * The deadline includes candidate preparation, but is a cooperative SEARCH
 * deadline, not a hard wall-clock guarantee: bounded 225-square safety checks,
 * scoring, and an in-progress node always finish synchronously.
 */
export function generateCandidates(board, color, difficulty = 'normal', options = {}) {
  const started = performance.now();
  assertBoard(board);
  otherColor(color); // Validate the explicit color.
  if (!DIFFICULTIES.includes(difficulty)) throw new RangeError('difficulty must be easy, normal, or hard');
  const settings = readOptions(options);
  const moves = legalMoves(board, color);
  if (!moves.length) return [];
  const scratch = board.map(row => row.slice());
  let ranked = rankedMoves(scratch, color, moves, difficulty);
  if (difficulty === 'hard' && ranked[0].reason !== 'win'
    && ranked[0].reason !== 'block' && ranked[0].reason !== 'opening') {
    ranked = search(scratch, color, ranked, settings, started);
  }
  return ranked.slice(0, settings.candidateLimit);
}

/** Same parameters as generateCandidates; returns the best candidate or null. */
export function chooseEngineMove(board, color, difficulty = 'normal', options = {}) {
  return generateCandidates(board, color, difficulty, options)[0] ?? null;
}
