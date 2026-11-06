/**
 * Pure freestyle Gomoku rules and the controller-facing GameAdapter.
 * Coordinates are zero-based. Cells: 0 empty, 1 black, 2 white.
 * Black moves first; turns alternate; an unbroken run of >= 5 wins.
 * No forbidden moves (overlines, double threes, etc.). Inputs are never mutated.
 */
export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const DIRECTIONS = Object.freeze([
  Object.freeze([0, 1]), Object.freeze([1, 0]),
  Object.freeze([1, 1]), Object.freeze([1, -1]),
]);

/** @returns {number[][]} A fresh 15 x 15 board. */
export function initialBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

/** Throw for malformed boards; return the board unchanged for convenience. */
export function assertBoard(board) {
  if (!Array.isArray(board) || board.length !== SIZE) {
    throw new TypeError(`board must contain ${SIZE} rows`);
  }
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== SIZE) {
      throw new TypeError(`every board row must contain ${SIZE} cells`);
    }
    for (const cell of row) {
      if (cell !== EMPTY && cell !== BLACK && cell !== WHITE) {
        throw new TypeError('board cells must be 0, 1, or 2');
      }
    }
  }
  return board;
}

export function otherColor(color) {
  if (color !== BLACK && color !== WHITE) throw new RangeError('color must be 1 or 2');
  return color === BLACK ? WHITE : BLACK;
}

export function inBounds(row, col) {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function stoneCounts(board) {
  let black = 0;
  let white = 0;
  for (const row of board) for (const cell of row) {
    if (cell === BLACK) black += 1;
    else if (cell === WHITE) white += 1;
  }
  return { black, white };
}

/** Return the count-derived next color, or null for inconsistent stone counts. */
export function nextColor(board) {
  assertBoard(board);
  const { black, white } = stoneCounts(board);
  if (black === white) return BLACK;
  if (black === white + 1) return WHITE;
  return null;
}

/**
 * Find a complete winning run through an occupied square (including overlines).
 * This low-level helper does not enforce turns and is also used by search.
 * @returns {{row:number,col:number}[] | null}
 */
export function winningLineAt(board, row, col, color = board?.[row]?.[col]) {
  if (!inBounds(row, col) || (color !== BLACK && color !== WHITE)
    || board[row][col] !== color) return null;
  for (const [dr, dc] of DIRECTIONS) {
    let firstRow = row;
    let firstCol = col;
    while (inBounds(firstRow - dr, firstCol - dc)
      && board[firstRow - dr][firstCol - dc] === color) {
      firstRow -= dr;
      firstCol -= dc;
    }
    const line = [];
    for (let r = firstRow, c = firstCol; inBounds(r, c) && board[r][c] === color;
      r += dr, c += dc) {
      line.push({ row: r, col: c });
    }
    if (line.length >= 5) return line;
  }
  return null;
}

/**
 * Evaluate any well-shaped board. lastMove is an optional scan-order hint, not
 * a trusted shortcut: a win elsewhere is still found. Impossible counts produce
 * nextColor=null. If both colors win on an invalid position, the first scanned
 * winning line is reported; adapter-produced positions never have this issue.
 * @returns {{status:'playing'|'won'|'draw',winner:1|2|null,draw:boolean,
 *   over:boolean,nextColor:1|2|null,winningLine:{row:number,col:number}[]}}
 */
export function evaluate(board, lastMove = undefined) {
  assertBoard(board);
  let line = lastMove && winningLineAt(board, lastMove.row, lastMove.col);
  if (!line) {
    outer: for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (board[row][col] === EMPTY) continue;
        // Only scan the start of each run, so long lines are not rescanned.
        const color = board[row][col];
        for (const [dr, dc] of DIRECTIONS) {
          if (inBounds(row - dr, col - dc) && board[row - dr][col - dc] === color) continue;
          const run = [];
          for (let r = row, c = col; inBounds(r, c) && board[r][c] === color; r += dr, c += dc) {
            run.push({ row: r, col: c });
          }
          if (run.length >= 5) { line = run; break outer; }
        }
      }
    }
  }
  if (line) {
    return { status: 'won', winner: board[line[0].row][line[0].col], draw: false,
      over: true, nextColor: null, winningLine: line };
  }
  const { black, white } = stoneCounts(board);
  const draw = black + white === SIZE * SIZE;
  const turn = black === white ? BLACK : black === white + 1 ? WHITE : null;
  return { status: draw ? 'draw' : 'playing', winner: null, draw,
    over: draw, nextColor: draw ? null : turn, winningLine: [] };
}

/**
 * isLegal(board, {row,col}, color?) -> boolean.
 * Omitted color uses the count-derived turn. Rejects out-of-turn moves,
 * malformed positions/coordinates, occupied squares, and terminal games.
 * A move.color field, when present, must agree with the requested color.
 */
export function isLegal(board, move, color = undefined) {
  try { assertBoard(board); } catch { return false; }
  if (!move || !inBounds(move.row, move.col) || board[move.row][move.col] !== EMPTY) return false;
  const state = evaluate(board);
  const requested = color === undefined ? (move.color ?? state.nextColor) : color;
  return !state.over && state.nextColor !== null && requested === state.nextColor
    && (move.color === undefined || move.color === requested);
}

/** @returns {{row:number,col:number}[]} All playable squares in row-major order. */
export function legalMoves(board, color = undefined) {
  const state = evaluate(board);
  const requested = color === undefined ? state.nextColor : color;
  if (state.over || state.nextColor === null || requested !== state.nextColor) return [];
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) {
    if (board[row][col] === EMPTY) moves.push({ row, col });
  }
  return moves;
}

/** applyMove(board, {row,col,color?}, color?) -> NEW board; throws RangeError if illegal. */
export function applyMove(board, move, color = undefined) {
  if (!isLegal(board, move, color)) throw new RangeError('illegal Gomoku move');
  const result = board.map(row => row.slice());
  result[move.row][move.col] = color ?? move.color ?? nextColor(board);
  return result;
}

/**
 * replay([{row,col,color?}, ...]) -> {board,moves,...evaluate(board)}.
 * Starts from empty, infers alternating colors, and throws with the zero-based
 * index on the first illegal move (including attempts to continue after a win).
 */
export function replay(moves) {
  if (!Array.isArray(moves)) throw new TypeError('moves must be an array');
  let board = initialBoard();
  const history = [];
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    const color = move?.color ?? nextColor(board);
    if (!isLegal(board, move, color)) throw new RangeError(`illegal Gomoku move at index ${index}`);
    board = applyMove(board, move, color);
    history.push({ row: move.row, col: move.col, color });
  }
  return { board, moves: history, ...evaluate(board, history.at(-1)) };
}

/**
 * Independent GameAdapter contract for a controller (no Harness dependencies).
 * id:string, size:number, initialBoard():Board,
 * legalMoves(Board,color?):Move[], isLegal(Board,Move,color?):boolean,
 * applyMove(Board,Move,color?):Board, evaluate(Board,lastMove?):Evaluation,
 * replay(Move[]):{board:Board,moves:ColoredMove[],...Evaluation}.
 * Persist the returned board after applyMove; then use evaluate for game status.
 */
export const gomokuAdapter = Object.freeze({
  id: 'gomoku', size: SIZE, initialBoard, legalMoves, isLegal, applyMove, evaluate, replay,
});
