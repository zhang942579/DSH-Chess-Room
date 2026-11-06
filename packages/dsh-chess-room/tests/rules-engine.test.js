import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, EMPTY, BLACK, WHITE, DIRECTIONS, initialBoard, assertBoard,
  otherColor, inBounds, nextColor, winningLineAt, evaluate, isLegal,
  legalMoves, applyMove, replay, gomokuAdapter } from '../host/rules.js';
import { DIFFICULTIES, generateCandidates, chooseEngineMove } from '../host/engine.js';

function put(board, color, positions) {
  for (const [row, col] of positions) board[row][col] = color;
  return board;
}

function fillers(count, row = 0) {
  return Array.from({ length: count }, (_, index) => [row, index * 2]);
}

function fourFor(color = BLACK, blocked = false) {
  const board = initialBoard();
  put(board, color, [[7, 3], [7, 4], [7, 5], [7, 6]]);
  const opponent = otherColor(color);
  const needed = color === BLACK ? 4 : 5;
  if (blocked) {
    put(board, opponent, [[7, 2]]);
    put(board, opponent, fillers(needed - 1));
  } else put(board, opponent, fillers(needed));
  return board;
}

function fullDraw() {
  // Horizontal alternation; vertical and diagonal runs are at most two long.
  return Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => (row + 2 * col) % 4 < 2 ? BLACK : WHITE));
}

function freezeBoard(board) {
  for (const row of board) Object.freeze(row);
  return Object.freeze(board);
}

test('adapter exposes a complete independent controller contract', () => {
  assert.equal(gomokuAdapter.id, 'gomoku');
  assert.equal(gomokuAdapter.size, 15);
  assert.ok(Object.isFrozen(gomokuAdapter));
  for (const name of ['initialBoard', 'legalMoves', 'isLegal', 'applyMove', 'evaluate', 'replay']) {
    assert.equal(typeof gomokuAdapter[name], 'function');
  }
  const board = gomokuAdapter.initialBoard();
  assert.equal(board.length, 15);
  assert.ok(board.every(row => row.length === 15 && row.every(cell => cell === EMPTY)));
  assert.notEqual(board[0], board[1]);
  assert.notEqual(board, gomokuAdapter.initialBoard());
  assert.deepEqual(gomokuAdapter.evaluate(board), {
    status: 'playing', winner: null, draw: false, over: false,
    nextColor: BLACK, winningLine: [],
  });
});

test('black starts, colors alternate, immutable application and occupancy rejection', () => {
  const board = freezeBoard(initialBoard());
  assert.equal(nextColor(board), BLACK);
  assert.equal(isLegal(board, { row: 7, col: 7 }, WHITE), false);
  assert.equal(legalMoves(board, WHITE).length, 0);
  const afterBlack = applyMove(board, { row: 7, col: 7 });
  assert.equal(board[7][7], EMPTY);
  assert.equal(afterBlack[7][7], BLACK);
  assert.notEqual(afterBlack[0], board[0]);
  assert.equal(nextColor(afterBlack), WHITE);
  assert.equal(isLegal(afterBlack, { row: 7, col: 7 }, WHITE), false);
  assert.throws(() => applyMove(afterBlack, { row: 7, col: 7 }, WHITE), RangeError);
  assert.equal(isLegal(afterBlack, { row: 7, col: 8 }, BLACK), false);
  const afterWhite = applyMove(afterBlack, { row: 7, col: 8, color: WHITE });
  assert.equal(afterWhite[7][8], WHITE);
  assert.equal(nextColor(afterWhite), BLACK);
  assert.equal(isLegal(afterWhite, { row: 1, col: 1, color: WHITE }, BLACK), false);
});

test('coordinates include both edges but reject overflow, fractional and malformed moves', () => {
  const board = initialBoard();
  for (const move of [{ row: 0, col: 0 }, { row: 14, col: 14 }]) {
    assert.equal(isLegal(board, move, BLACK), true);
  }
  for (const move of [null, {}, { row: -1, col: 0 }, { row: 15, col: 0 },
    { row: 0, col: -1 }, { row: 0, col: 15 }, { row: 0.5, col: 0 },
    { row: '0', col: 0 }, { row: NaN, col: 0 }]) {
    assert.equal(isLegal(board, move, BLACK), false);
    assert.throws(() => applyMove(board, move, BLACK), RangeError);
  }
  assert.equal(isLegal(board, { row: 0, col: 0 }, null), false);
  assert.equal(inBounds(14, 14), true);
  assert.equal(inBounds(15, 14), false);
});

for (const [name, start, direction] of [
  ['horizontal at top edge', [0, 10], [0, 1]],
  ['vertical at right edge', [10, 14], [1, 0]],
  ['descending diagonal at bottom-right', [10, 10], [1, 1]],
  ['ascending diagonal at bottom-left', [10, 4], [1, -1]],
]) {
  test(`five wins: ${name}`, () => {
    const board = initialBoard();
    const positions = Array.from({ length: 5 }, (_, index) =>
      [start[0] + direction[0] * index, start[1] + direction[1] * index]);
    put(board, BLACK, positions);
    const snapshot = structuredClone(board);
    const state = evaluate(freezeBoard(board), { row: 8, col: 8 });
    assert.equal(state.status, 'won');
    assert.equal(state.winner, BLACK);
    assert.equal(state.over, true);
    assert.equal(state.draw, false);
    assert.equal(state.nextColor, null);
    assert.deepEqual(state.winningLine, positions.map(([row, col]) => ({ row, col })));
    assert.equal(legalMoves(board).length, 0);
    assert.equal(isLegal(board, { row: 8, col: 8 }), false);
    assert.deepEqual(board, snapshot);
  });
}

test('white can win; six and longer overlines win without forbidden-move rules', () => {
  for (const length of [5, 6, 9, 15]) {
    const board = initialBoard();
    put(board, WHITE, Array.from({ length }, (_, col) => [14, col]));
    const state = evaluate(board, { row: 14, col: length - 1 });
    assert.equal(state.winner, WHITE);
    assert.equal(state.winningLine.length, length);
    assert.equal(winningLineAt(board, 14, 0, WHITE).length, length);
  }
  const board = initialBoard();
  put(board, BLACK, [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]]);
  put(board, WHITE, fillers(5));
  assert.equal(isLegal(board, { row: 7, col: 5 }, BLACK), true);
  const result = applyMove(board, { row: 7, col: 5 }, BLACK);
  assert.equal(evaluate(result).winningLine.length, 6);
});

test('freestyle allows double-three and double-four moves', () => {
  for (const positions of [
    [[7, 6], [7, 8], [6, 7], [8, 7]],
    [[7, 5], [7, 6], [7, 8], [5, 7], [6, 7], [8, 7]],
  ]) {
    const board = put(initialBoard(), BLACK, positions);
    put(board, WHITE, fillers(positions.length));
    const move = { row: 7, col: 7 };
    assert.equal(isLegal(board, move, BLACK), true);
    const after = applyMove(board, move, BLACK);
    assert.equal(after[7][7], BLACK);
    assert.equal(evaluate(after).status, 'playing');
  }
});

test('four, gaps, edge wrapping, and blocked runs are not wins', () => {
  const cases = [
    [[7, 2], [7, 3], [7, 4], [7, 5]],
    [[7, 2], [7, 3], [7, 5], [7, 6], [7, 7]],
    [[0, 12], [0, 13], [0, 14], [1, 0], [1, 1]],
    [[0, 0], [1, 1], [2, 2], [4, 4], [5, 5]],
  ];
  for (const positions of cases) {
    assert.equal(evaluate(put(initialBoard(), BLACK, positions)).winner, null);
  }
  const board = put(initialBoard(), BLACK, [[7, 2], [7, 3], [7, 5], [7, 6], [7, 7]]);
  board[7][4] = WHITE;
  assert.equal(evaluate(board).over, false);
});

test('full non-winning board is a draw and offers no moves', () => {
  const board = freezeBoard(fullDraw());
  const state = evaluate(board);
  assert.deepEqual(state, { status: 'draw', winner: null, draw: true,
    over: true, nextColor: null, winningLine: [] });
  assert.equal(legalMoves(board).length, 0);
  assert.equal(isLegal(board, { row: 0, col: 0 }, WHITE), false);
  for (const difficulty of DIFFICULTIES) {
    assert.deepEqual(generateCandidates(board, WHITE, difficulty), []);
    assert.equal(chooseEngineMove(board, WHITE, difficulty), null);
  }
});

test('last legal square completes a draw; a win takes precedence over fullness', () => {
  const board = fullDraw();
  const last = { row: 14, col: 1 };
  assert.equal(board[last.row][last.col], BLACK);
  board[last.row][last.col] = EMPTY;
  assert.equal(evaluate(board).nextColor, BLACK);
  assert.deepEqual(legalMoves(board), [last]);
  assert.equal(evaluate(applyMove(board, last)).status, 'draw');
  const won = fullDraw();
  for (let col = 0; col < 6; col += 1) won[0][col] = BLACK;
  assert.equal(evaluate(won).status, 'won');
  assert.equal(evaluate(won).draw, false);
});

test('replay infers colors, validates history, and rejects moves after a win', () => {
  const moves = [];
  for (let col = 0; col < 4; col += 1) {
    moves.push({ row: 7, col }, { row: 0, col: col * 2 });
  }
  moves.push({ row: 7, col: 4, color: BLACK });
  const original = structuredClone(moves);
  const result = gomokuAdapter.replay(moves);
  assert.equal(result.winner, BLACK);
  assert.equal(result.moves.length, 9);
  assert.equal(result.moves[0].color, BLACK);
  assert.equal(result.moves[1].color, WHITE);
  assert.deepEqual(moves, original);
  assert.throws(() => replay([...moves, { row: 10, col: 10 }]), /index 9/);
  assert.throws(() => replay([{ row: 0, col: 0, color: WHITE }]), /index 0/);
  assert.throws(() => replay([{ row: 0, col: 0 }, { row: 0, col: 0 }]), /index 1/);
  assert.throws(() => replay({}), TypeError);
  assert.deepEqual(replay([]).board, initialBoard());
});

test('malformed boards and inconsistent turns do not produce legal moves', () => {
  for (const board of [null, [], [[0]], Array.from({ length: 15 }, () => Array(15).fill(3))]) {
    assert.throws(() => assertBoard(board), TypeError);
    assert.throws(() => evaluate(board), TypeError);
    assert.throws(() => generateCandidates(board, BLACK), TypeError);
    assert.equal(isLegal(board, { row: 0, col: 0 }, BLACK), false);
  }
  const board = initialBoard();
  board[7][7] = WHITE;
  assert.equal(nextColor(board), null);
  assert.equal(evaluate(board).nextColor, null);
  assert.deepEqual(legalMoves(board, BLACK), []);
  assert.deepEqual(generateCandidates(board, BLACK), []);
  assert.throws(() => otherColor(0), RangeError);
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty}: opening, candidate legality, ordering, uniqueness, immutable hint/AI agreement`, () => {
    const opening = generateCandidates(initialBoard(), BLACK, difficulty);
    assert.deepEqual(opening, [{ row: 7, col: 7, score: 15, reason: 'opening' }]);
    const board = freezeBoard(replay([
      { row: 7, col: 7 }, { row: 7, col: 8 },
      { row: 8, col: 7 }, { row: 6, col: 7 },
    ]).board);
    const before = structuredClone(board);
    // A zero search budget makes hint/AI comparison deterministic even under load.
    const options = { timeLimitMs: 0, maxNodes: 0 };
    const candidates = generateCandidates(board, BLACK, difficulty, options);
    assert.ok(candidates.length > 0 && candidates.length <= 12);
    assert.equal(new Set(candidates.map(move => `${move.row},${move.col}`)).size, candidates.length);
    for (const candidate of candidates) {
      assert.equal(isLegal(board, candidate, BLACK), true);
      assert.ok(Number.isFinite(candidate.score));
      assert.equal(typeof candidate.reason, 'string');
    }
    for (let index = 1; index < candidates.length; index += 1) {
      assert.ok(candidates[index - 1].score >= candidates[index].score);
    }
    assert.deepEqual(chooseEngineMove(board, BLACK, difficulty, options), candidates[0]);
    assert.deepEqual(board, before);
    assert.deepEqual(generateCandidates(board, WHITE, difficulty), []);
    assert.equal(chooseEngineMove(board, WHITE, difficulty), null);
  });

  test(`${difficulty}: take immediate black and white wins`, () => {
    for (const color of [BLACK, WHITE]) {
      const board = freezeBoard(fourFor(color, true));
      const choice = chooseEngineMove(board, color, difficulty);
      assert.equal(choice.row, 7);
      assert.equal(choice.col, 7);
      assert.equal(choice.reason, 'win');
      assert.equal(isLegal(board, choice, color), true);
      assert.equal(evaluate(applyMove(board, choice, color)).winner, color);
    }
  });

  test(`${difficulty}: block the opponent's sole immediate winning square`, () => {
    const board = initialBoard();
    put(board, WHITE, [[7, 3], [7, 4], [7, 5], [7, 6]]);
    put(board, BLACK, [[7, 2], ...fillers(3)]);
    const choice = chooseEngineMove(freezeBoard(board), BLACK, difficulty);
    assert.equal(choice.row, 7);
    assert.equal(choice.col, 7);
    assert.equal(choice.reason, 'block');
    assert.equal(isLegal(board, choice, BLACK), true);
    const after = applyMove(board, choice, BLACK);
    assert.equal(generateCandidates(after, WHITE, difficulty).some(move => move.reason === 'win'), false);
  });

  test(`${difficulty}: winning ourselves has priority over blocking`, () => {
    const board = initialBoard();
    put(board, BLACK, [[7, 3], [7, 4], [7, 5], [7, 6]]);
    put(board, WHITE, [[10, 3], [10, 4], [10, 5], [10, 6]]);
    const candidates = generateCandidates(board, BLACK, difficulty);
    assert.ok(candidates.every(move => move.reason === 'win'));
    assert.equal(evaluate(applyMove(board, candidates[0], BLACK)).winner, BLACK);
  });
}

test('engine detects winning gaps and forced blocks in all four directions, at boundaries', () => {
  for (const [dr, dc] of DIRECTIONS) {
    const start = dc === -1 ? [9, 5] : [9, 9];
    const positions = [0, 1, 3, 4].map(offset =>
      [start[0] + dr * offset, start[1] + dc * offset]);
    const gap = { row: start[0] + dr * 2, col: start[1] + dc * 2 };
    for (const color of [BLACK, WHITE]) {
      const board = put(initialBoard(), color, positions);
      put(board, otherColor(color), fillers(color === BLACK ? 4 : 5));
      const choice = chooseEngineMove(board, color, 'normal');
      assert.equal(choice.row, gap.row);
      assert.equal(choice.col, gap.col);
      assert.equal(choice.reason, 'win');
    }
    const blocked = put(initialBoard(), WHITE, positions);
    put(blocked, BLACK, fillers(4));
    const choice = chooseEngineMove(blocked, BLACK, 'hard', { timeLimitMs: 0 });
    assert.equal(choice.row, gap.row);
    assert.equal(choice.col, gap.col);
    assert.equal(choice.reason, 'block');
  }
  const edge = put(initialBoard(), BLACK, [[14, 11], [14, 12], [14, 13], [14, 14]]);
  put(edge, WHITE, fillers(4));
  assert.equal(chooseEngineMove(edge, BLACK).col, 10);
});

test('engine offers only legal blocks for an unavoidably open four', () => {
  const board = initialBoard();
  put(board, WHITE, [[7, 3], [7, 4], [7, 5], [7, 6]]);
  put(board, BLACK, fillers(4));
  const candidates = generateCandidates(board, BLACK, 'hard');
  assert.equal(candidates.length, 2);
  assert.deepEqual(new Set(candidates.map(move => move.col)), new Set([2, 7]));
  assert.ok(candidates.every(move => move.reason === 'block' && isLegal(board, move, BLACK)));
});

test('hard performs finite search; time/node exhaustion falls back legally', () => {
  const board = freezeBoard(replay([
    { row: 7, col: 7 }, { row: 7, col: 8 },
    { row: 8, col: 7 }, { row: 6, col: 7 },
  ]).board);
  const snapshot = structuredClone(board);
  // One root and one ply guarantee a complete searchable iteration without
  // relying on machine speed or a timing-based assertion.
  const searched = generateCandidates(board, BLACK, 'hard', {
    timeLimitMs: 250, maxNodes: 10000, searchDepth: 1, branchFactor: 1,
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].reason, 'search');
  assert.equal(isLegal(board, searched[0], BLACK), true);
  for (const options of [{ timeLimitMs: 0 }, { maxNodes: 0 },
    { timeLimitMs: 250, maxNodes: 1, searchDepth: 4, branchFactor: 8 }]) {
    const candidates = generateCandidates(board, BLACK, 'hard', options);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every(move => isLegal(board, move, BLACK)));
    assert.notEqual(candidates[0].reason, 'search');
  }
  assert.deepEqual(board, snapshot);
  const winning = fourFor(BLACK, true);
  assert.equal(chooseEngineMove(winning, BLACK, 'hard', { timeLimitMs: 0, maxNodes: 0 }).reason, 'win');
});

test('engine validates difficulty/options and honors candidateLimit', () => {
  const board = applyMove(initialBoard(), { row: 7, col: 7 });
  assert.throws(() => generateCandidates(board, WHITE, 'expert'), RangeError);
  assert.throws(() => generateCandidates(board, 0), RangeError);
  assert.throws(() => generateCandidates(board, WHITE, 'hard', null), TypeError);
  for (const options of [{ timeLimitMs: -1 }, { timeLimitMs: Infinity }, { timeLimitMs: 251 },
    { maxNodes: -1 }, { maxNodes: 10001 }, { maxNodes: 1.5 }, { searchDepth: 0 },
    { searchDepth: 5 }, { branchFactor: 13 }, { candidateLimit: 0 }]) {
    assert.throws(() => generateCandidates(board, WHITE, 'hard', options), RangeError);
  }
  assert.equal(generateCandidates(board, WHITE, 'normal', { candidateLimit: 1 }).length, 1);
});
