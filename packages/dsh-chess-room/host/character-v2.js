import { completedRounds } from './dialogue.js';

// Original character states/lines. An engine reason is not a verified shape label.
export const EXPRESSIONS = Object.freeze(['idle','thinking','smug','surprised','troubled','victory','defeat']);
export function expressionFor(game, thinking) {
  if (['won', 'resigned'].includes(game.status) && [1, 2].includes(game.winner)) return game.winner === game.playerColor ? 'defeat' : 'victory';
  if (game.status !== 'playing') return 'idle';
  return thinking ? 'thinking' : 'idle';
}
export function fallbackComment(game, _reason, locale = 'zh') {
  const zh = locale.startsWith('zh');
  if (game.status === 'draw') return zh ? '这一局打成平手，谁也没服谁，要不要再较量一盘？' : 'A draw, neither side gave in; rematch?';
  if (game.status === 'resigned' && game.winner === 3 - game.playerColor) return zh ? '你认输了，这局归我；下局敢不敢再来挑战？' : 'You resigned; dare to try a rematch?';
  if (game.status === 'won' && game.winner === game.playerColor) return zh ? '这局你赢了，最后这手漂亮；再来一盘，我要找回场子！' : 'You won, well played! Rematch?';
  if (game.status === 'won' && game.winner === 3 - game.playerColor) return zh ? '五子已连成，这局归我；敢不敢再来一盘翻回来？' : 'Five in a row, I won! Rematch?';
  if (game.status !== 'playing') return '';
  const human = game.moves.findLast(move => move.color === game.playerColor);
  if (!human) return zh ? '棋盘才刚铺开，敢不敢陪我认真较量一局？' : 'Fresh board; ready for a challenge?';
  const edge = [human.row, human.col].some(value => value === 0 || value === 14);
  const edgeLine = zh ? '这手落在边上了，敢不敢和我较量到最后？' : 'A move on the edge; dare to keep going?';
  if (edge && game.chat?.findLast(message => message.who === 'dsh')?.text !== edgeLine) return edgeLine;
  const rounds = completedRounds(game);
  return zh ? `已经较量${rounds}个回合了，接着来，看看谁先沉不住气？` : `${rounds} rounds played; who blinks first?`;
}
