// Isolated mechanism fixture. Never imports RPC, account mutations, or a Host service.
export const PREVIEW_RELEASE = '1.1.0-preview.1';
export function emptyPreview(gameId, version = 0) {
  return {id:gameId,version,board:Array.from({length:15},()=>Array(15).fill(0)),moves:[],status:'playing',winner:null,playerColor:1,turn:1,winningLine:[]};
}
export function previewFixture(kind, gameId, version, eventId) {
  const game=emptyPreview(gameId,version);
  const moves=kind==='defeat' ? [
    [7,5,1],[5,2,2],[7,6,1],[5,4,2],[7,7,1],[5,6,2],[7,8,1],[5,8,2],[7,9,1]
  ] : [[7,7,1],[7,8,2]];
  game.moves=moves.map(([row,col,color],index)=>({row,col,color,moveId:`${gameId}:${version}:move:${index}`,source:color===1?'human':'model'}));
  for(const m of game.moves)game.board[m.row][m.col]=m.color;
  if(kind==='defeat') {
    Object.assign(game,{status:'won',winner:1,turn:null,winningLine:Array.from({length:5},(_,i)=>({row:7,col:5+i}))});
    return {game,event:{kind:'human-victory',gameId,version,eventId,confirmed:true,status:'won',winner:1,playerColor:1,preview:true}};
  }
  const move=game.moves.at(-1);game.turn=1;
  return {game,event:{kind:'move-committed',gameId,version,eventId,confirmed:true,...move,preview:true}};
}
export function previewFingerprint(game) {
  return JSON.stringify({id:game.id,version:game.version,board:game.board,moves:game.moves,status:game.status,winner:game.winner});
}
