import { createStagePreview, stageZh, stageEn, createLiveStage2, LIVE_RELEASE2, liveStageZh, liveStageEn, confirmedMoveMask, requestsQuiet } from './frozen-runtime.mjs';
import { createContextPicker, contextZh, contextEn, contextCss } from './context-picker.js';
export function factory(require2) {
    const React = require2("react"), h = React.createElement;
    const CharacterStagePreview = createStagePreview(React), { CharacterStageLive } = createLiveStage2(React);
    const ContextPicker = createContextPicker(React);
    const zh = {
      title: "DSH \u68CB\u5BA4",
      subtitle: "\u966A\u4F60\u4E0B\u68CB\uFF0C\u987A\u4FBF\u6597\u5634",
      room: "\u68CB\u5BA4",
      records: "\u5BF9\u5C40\u8BB0\u5F55",
      roomTitle: "\u9CB8\u8BED\u68CB\u5BA4",
      roomSubtitle: "\u843D\u5B50\u89C1\u62DB\uFF0C\u6597\u5634\u4E5F\u522B\u8BA4\u8F93\u3002",
      gomoku: "\u4E94\u5B50\u68CB",
      freestyle: "\u81EA\u7531\u4E94\u5B50\u68CB",
      settings: "\u8BBE\u7F6E",
      opponent: "\u4F60\u7684\u5BF9\u624B",
      seat: "\u4F60\u7684\u5EA7\u4F4D",
      agreement: "\u672C\u5C40\u7EA6\u5B9A",
      connected: "\u5DF2\u5C31\u5EA7",
      disconnected: "\u8FDE\u63A5\u4E2D",
      characterReady: "\u51C6\u5907\u597D\u4E86\uFF0C\u4ECE\u7B2C\u4E00\u624B\u5F00\u59CB\u5427\u3002",
      characterNote: "\u7231\u6597\u5634\uFF0C\u4E5F\u8F93\u5F97\u8D77",
      art: "\u7528\u6237\u63D0\u4F9B\u7684 DSH \u5934\u50CF \xB7 \u52A8\u6001\u8868\u60C5",
      expressionGallery: "\u4E03\u8868\u60C5\u56FE\u9274",
      followGame: "\u8DDF\u968F\u68CB\u5C40",
      preview: "\u9884\u89C8",
      previewOnly: "\u53EA\u9884\u89C8\u8868\u60C5\uFF0C\u4E0D\u5F71\u54CD\u68CB\u5C40\uFF1B\u52A8\u6001\u9075\u5FAA\u7CFB\u7EDF\u51CF\u5F31\u52A8\u6001\u6548\u679C\u8BBE\u7F6E\u3002",
      thinkingExpression: "\u601D\u8003",
      quietChatPlaceholder: "\u77ED\u8BC4\u5DF2\u5173\u95ED\uFF0C\u53EF\u7528\u5F00\u5173\u91CD\u65B0\u5F00\u542F",
      nextGame: "\u6267\u5B50\u4E0E\u96BE\u5EA6\u5728\u65B0\u5BF9\u5C40\u751F\u6548",
      currentGame: "\u5F53\u524D\u68CB\u5C40",
      unfinished: "\u672A\u7ED3\u675F",
      viewAllMoves: "\u67E5\u770B\u5B8C\u6574\u68CB\u8C31",
      collapseMoves: "\u6536\u8D77\u5B8C\u6574\u68CB\u8C31",
      moveNumber: "\u624B\u6570",
      stones: "\u6267\u5B50",
      position: "\u4F4D\u7F6E",
      latest: "\u6700\u65B0",
      showCoordinates: "\u663E\u793A\u5750\u6807",
      noLastMove: "\u68CB\u76D8\u5C31\u7EEA\uFF0C\u7B49\u4F60\u843D\u4E0B\u7B2C\u4E00\u5B50\u3002",
      lastPlayed: "DSH \u521A\u521A\u843D\u5728",
      activeComments: "\u4E3B\u52A8\u77ED\u8BC4",
      commentsHint: "\u6BCF\u4E24\u56DE\u5408\u77ED\u8BC4 \xB7 \u804A\u5929\u968F\u843D\u5B50\u56DE\u5E94",
      commentOff: "\u77ED\u8BC4\u5DF2\u5173\u95ED",
      movePrompt: "\u843D\u5B50\u8F7B\u4E00\u70B9\uFF0C\u6311\u6218\u54CD\u4E00\u70B9\u3002",
      waiting: "\u7B49\u5F85 DSH \u843D\u5B50",
      loading: "\u68CB\u5BA4\u51C6\u5907\u4E2D\u2026",
      offline: "\u8FDE\u63A5\u6682\u4E0D\u53EF\u7528\uFF0C\u5C06\u81EA\u52A8\u91CD\u8FDE\u3002",
      guest: "\u68CB\u53CB",
      player: "\u4F60",
      black: "\u9ED1\u68CB",
      white: "\u767D\u68CB",
      turn: "\u5F53\u524D\u56DE\u5408",
      thinking: "DSH \u6B63\u5728\u60F3\u68CB\u2026",
      yourTurn: "\u8F6E\u5230\u4F60\u4E86",
      win: "\u4F60\u8D62\u4E86\uFF01",
      lose: "DSH \u83B7\u80DC",
      draw: "\u548C\u68CB",
      resigned: "\u4F60\u5DF2\u8BA4\u8F93",
      newGame: "\u65B0\u5BF9\u5C40",
      undo: "\u6094\u68CB",
      hint: "\u63D0\u793A",
      resign: "\u8BA4\u8F93",
      replay: "\u590D\u76D8",
      live: "\u56DE\u5230\u68CB\u5C40",
      color: "\u6267\u5B50",
      difficulty: "\u96BE\u5EA6",
      easy: "\u8F7B\u677E\u96BE\u5EA6",
      normal: "\u666E\u901A\u96BE\u5EA6",
      hard: "\u6311\u6218\u96BE\u5EA6",
      moves: "\u68CB\u8C31",
      chat: "\u6597\u5634\u65F6\u95F4",
      send: "\u53D1\u9001",
      chatPlaceholder: "\u56DE\u4E00\u53E5\u2026\uFF08\u4E0B\u6B21\u843D\u5B50\u65F6\u56DE\u5E94\uFF09",
      emptyMoves: "\u7B2C\u4E00\u6B65\uFF0C\u4ECE\u5929\u5143\u5F00\u59CB\u4E5F\u4E0D\u9519\u3002",
      emptyChat: "\u68CB\u76D8\u4E0A\u89C1\u771F\u7AE0\uFF0C\u804A\u5929\u53EA\u8C08\u68CB\uFF5E",
      comments: "\u68CB\u8FB9\u77ED\u8BC4\uFF08\u7EA6\u6BCF\u4E24\u56DE\u5408\uFF09",
      saved: "\u6700\u8FD1\u68CB\u5C40",
      rules: "15 \xD7 15 \u68CB\u76D8 \xB7 \u65E0\u7981\u624B",
      winRule: "\u8FDE\u6210\u4E94\u5B50\u6216\u4EE5\u4E0A\u5373\u53EF\u83B7\u80DC",
      model: "\u72EC\u7ACB DSH \u5BF9\u5F08\u4F1A\u8BDD",
      fallback: "\u5F15\u64CE\u63A5\u7BA1",
      last: "\u4E0A\u4E00\u624B",
      tip: "\u63D0\u793A\u843D\u70B9",
      preparing: "\u68CB\u5BA4\u6A21\u5757\u6B63\u5728\u521D\u59CB\u5316\uFF0C\u8BF7\u7A0D\u5019\u3002",
      stale: "\u68CB\u5C40\u5DF2\u66F4\u65B0\uFF0C\u5DF2\u540C\u6B65\u6700\u65B0\u68CB\u76D8\uFF0C\u8BF7\u518D\u8BD5\u3002",
      "wrong-turn": "\u73B0\u5728\u4E0D\u662F\u4F60\u7684\u56DE\u5408\u3002",
      "illegal-move": "\u8FD9\u91CC\u4E0D\u80FD\u843D\u5B50\u3002",
      "game-over": "\u68CB\u5C40\u5DF2\u7ED3\u675F\uFF0C\u53EF\u4EE5\u65B0\u5F00\u4E00\u5C40\u3002",
      "bad-request": "\u64CD\u4F5C\u53C2\u6570\u65E0\u6548\u3002",
      unavailable: "\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u68CB\u5C40\u4E0D\u4F1A\u4E22\u5931\u3002",
      "no-undo": "\u8FD8\u6CA1\u6709\u53EF\u4EE5\u64A4\u56DE\u7684\u73A9\u5BB6\u843D\u5B50\u3002",
      confirmNew: "\u5F00\u59CB\u65B0\u5C40\uFF1F\u5F53\u524D\u68CB\u5C40\u4F1A\u4FDD\u7559\u4EE5\u4FBF\u590D\u76D8\u3002",
      confirmResign: "\u786E\u8BA4\u8BA4\u8F93\uFF1F",
      idle: "\u5F85\u673A",
      smug: "\u5F97\u610F",
      surprised: "\u60CA\u8BB6",
      troubled: "\u82E6\u607C",
      victory: "\u80DC\u5229",
      defeat: "\u5931\u8D25",
      recovered: "\u5DF2\u6062\u590D\u68CB\u5C40",
      step: "\u624B",
      replayEmpty: "\u8FD8\u6CA1\u6709\u53EF\u590D\u76D8\u7684\u68CB\u5C40\u3002",
      storage: "\u68CB\u5C40\u5DF2\u6301\u4E45\u4FDD\u5B58",
      system: "\u68CB\u5BA4",
      hintOnly: "\u63D0\u793A\u53EA\u6807\u8BB0\u4F4D\u7F6E\uFF0C\u4E0D\u81EA\u52A8\u843D\u5B50\u3002",
      chatQueued: "\u5DF2\u53D1\u9001\uFF0C\u4E0B\u6B21 DSH \u843D\u5B50\u65F6\u56DE\u5E94\u3002"
    };
    const en = {
      title: "DSH Chess Room",
      subtitle: "A game, a little friendly banter",
      room: "Room",
      records: "Game history",
      roomTitle: "Whale Talk Room",
      roomSubtitle: "Play your move. Keep the banter friendly.",
      gomoku: "Gomoku",
      freestyle: "Freestyle Gomoku",
      settings: "Settings",
      opponent: "Your opponent",
      seat: "Your seat",
      agreement: "Table rules",
      connected: "Seated",
      disconnected: "Connecting",
      characterReady: "Ready when you are. Make the first move.",
      characterNote: "Playful in victory, graceful in defeat",
      art: "Your DSH avatar \xB7 Animated expressions",
      expressionGallery: "Seven-expression gallery",
      followGame: "Follow game",
      preview: "Preview",
      previewOnly: "Expression preview only; the board is unchanged. Animation respects reduced motion.",
      thinkingExpression: "Thinking",
      quietChatPlaceholder: "Comments off; use the switch to enable replies",
      nextGame: "Color and difficulty apply to the next game",
      currentGame: "Current game",
      unfinished: "Unfinished",
      viewAllMoves: "View full move list",
      collapseMoves: "Collapse move list",
      moveNumber: "Move",
      stones: "Stones",
      position: "Position",
      latest: "Latest",
      showCoordinates: "Coordinates",
      noLastMove: "The board is ready for your first move.",
      lastPlayed: "DSH just played",
      activeComments: "Short comments",
      commentsHint: "Banter every two rounds; chat replies with a move",
      commentOff: "Comments off",
      movePrompt: "A gentle move. A worthy challenge.",
      waiting: "Waiting for DSH to move",
      loading: "Preparing the room\u2026",
      offline: "Connection unavailable; reconnecting automatically.",
      guest: "Player",
      player: "You",
      black: "Black",
      white: "White",
      turn: "Turn",
      thinking: "DSH is thinking\u2026",
      yourTurn: "Your turn",
      win: "You win!",
      lose: "DSH wins",
      draw: "Draw",
      resigned: "You resigned",
      newGame: "New game",
      undo: "Undo",
      hint: "Hint",
      resign: "Resign",
      replay: "Replay",
      live: "Back to live game",
      color: "Your stones",
      difficulty: "Difficulty",
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
      moves: "Moves",
      chat: "Table talk",
      send: "Send",
      chatPlaceholder: "Reply\u2026 (DSH responds on its next move)",
      emptyMoves: "The center is a fine first move.",
      emptyChat: "Friendly game talk, one move at a time.",
      comments: "Game comments (about every two rounds)",
      saved: "Recent games",
      rules: "15 \xD7 15 board \xB7 No forbidden moves",
      winRule: "Five or more consecutive stones wins",
      model: "Dedicated DSH game session",
      fallback: "Engine fallback",
      last: "Last move",
      tip: "Suggested move",
      preparing: "The game modules are initializing. Please wait.",
      stale: "The game changed. Board synchronized; try again.",
      "wrong-turn": "It is not your turn.",
      "illegal-move": "That move is not legal.",
      "game-over": "Game over. Start a new game.",
      "bad-request": "Invalid action parameters.",
      unavailable: "Temporarily unavailable; your game is safe.",
      "no-undo": "No human move to undo yet.",
      confirmNew: "Start a new game? This one will be kept for replay.",
      confirmResign: "Resign this game?",
      idle: "Idle",
      smug: "Smug",
      surprised: "Surprised",
      troubled: "Troubled",
      victory: "Victory",
      defeat: "Defeat",
      recovered: "Game restored",
      step: "moves",
      replayEmpty: "No game to replay yet.",
      storage: "Game saved durably",
      system: "Room",
      hintOnly: "Hints mark a square; they never play for you.",
      chatQueued: "Sent; DSH responds with its next move."
    };
    Object.assign(zh, stageZh, liveStageZh, { clientReady: "\u4E03\u7EC4\u4E13\u7528\u52A8\u4F5C\u5DF2\u63A5\u5165 \xB7 1.2.0" });
    Object.assign(en, stageEn, liveStageEn, { clientReady: "Seven action tracks connected \xB7 1.2.0" });
    Object.assign(zh, contextZh, {nextGame: "执子选择在新对局生效", clientReady: "棋室界面 1.2.1"});
    Object.assign(en, contextEn, {nextGame: "Color applies to the next game", clientReady: "Chess room UI 1.2.1"});
    const expressions = Object.freeze(["idle", "thinking", "smug", "surprised", "troubled", "victory", "defeat"]);
    const viewModel = {
      clientGeneration: "1.2.1",
      stageRelease: LIVE_RELEASE2,
      stageMode: "confirmed-live-ai-actions",
      expressions,
      expressionAssets(expression, runtimeId = "") {
        const state = expressions.includes(expression) ? expression : "idle", base = "/api/dsh-chess-room/avatar-v2";
        const revision = `?r=${encodeURIComponent(runtimeId)}`;
        return { static: `${base}/${state}.png${revision}`, animated: `${base}/${state}.webp${revision}` };
      },
      boardRows: Object.freeze(Array.from({ length: 15 }, (_, index) => 14 - index)),
      coordinate: (move) => `${String.fromCharCode(65 + move.col)}${move.row + 1}`,
      replayBoard(moves, step) {
        const board = Array.from({ length: 15 }, () => Array(15).fill(0));
        for (const move of moves.slice(0, Math.max(0, Math.min(moves.length, step)))) board[move.row][move.col] = move.color;
        return board;
      },
      recentMoves(moves, limit = 6) {
        const start = Math.max(0, moves.length - limit);
        return moves.slice(start).map((move, index) => ({ move, index: start + index }));
      }
    };
    const css = `
.dcr{--dcr-accent:var(--dsw-alias-brand-primary);--dcr-text:var(--dsw-alias-label-primary);--dcr-muted:var(--dsw-alias-label-secondary);--dcr-line:var(--dsw-alias-border-l1);--dcr-surface:var(--dsw-alias-bg-layer-1);--dcr-soft:color-mix(in srgb,var(--dcr-accent) 7%,var(--dcr-surface));--dcr-wood:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 28%,var(--dcr-surface));--dcr-grid:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 55%,var(--dcr-muted));--dcr-stone-black:#273344;--dcr-stone-white:#fffdf8;height:100%;min-height:0;overflow:auto;container-type:inline-size;container-name:chessroom;color:var(--dcr-text);background:color-mix(in srgb,var(--dcr-accent) 3%,var(--dsw-alias-bg-base));font:14px/1.5 system-ui,-apple-system,sans-serif;scroll-padding:90px}
.dcr *{box-sizing:border-box}.dcr h1,.dcr h2,.dcr h3,.dcr p{margin:0}.dcr h1{font-size:27px;line-height:1.25;letter-spacing:-.6px;font-weight:760}.dcr h2{font-size:19px;line-height:1.35;font-weight:730}.dcr h3{font-size:16px}.dcr .muted{color:var(--dcr-muted);font-size:12px}.dcr .label-row,.dcr .heading-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.dcr .label-row{margin-bottom:12px}.dcr .heading-row{margin-bottom:16px}.dcr .dcr-icon{width:20px;height:20px;flex:none}.dcr button,.dcr input,.dcr select,.dcr summary{font:inherit;color:inherit}.dcr button{border:1px solid var(--dcr-line);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:8px 12px;min-height:36px;cursor:pointer}.dcr button:hover:not(:disabled){border-color:var(--dcr-accent);background:var(--dcr-soft)}.dcr button:disabled{opacity:.42;cursor:default}.dcr button:focus-visible,.dcr input:focus-visible,.dcr select:focus-visible,.dcr summary:focus-visible{outline:2px solid var(--dcr-accent);outline-offset:3px}.dcr button.primary{background:var(--dcr-accent);border-color:var(--dcr-accent);color:var(--dsw-alias-bg-base)}.dcr button.text-button{border:0;background:transparent;color:var(--dcr-accent)}.dcr input,.dcr select{min-height:38px;min-width:0;padding:8px 10px;border:1px solid var(--dcr-line);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dcr input[type=checkbox]{min-height:0;padding:0;accent-color:var(--dcr-accent);width:15px;height:15px}.dcr .pill{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:999px;padding:6px 15px;font-size:12px;white-space:nowrap;background:var(--dcr-soft);color:var(--dcr-accent)}.dcr .status-dot{width:6px;height:6px;display:inline-block;border-radius:50%;background:currentColor;flex:none}.dcr .stone{display:inline-block;width:13px;height:13px;border-radius:50%;background:var(--dcr-stone-black);border:1px solid var(--dcr-muted);vertical-align:-2px;margin-right:6px}.dcr .stone.white{background:var(--dcr-stone-white)}
.dcr-topbar{background:var(--dcr-surface);border-bottom:1px solid var(--dcr-line)}.dcr-topbar-inner{max-width:1800px;margin:auto;padding:18px 30px;display:flex;align-items:center;gap:28px}.dcr-brand{display:flex;align-items:center;gap:12px;flex:1;min-width:0}.dcr-brand-mark{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--dcr-soft);color:var(--dcr-accent);flex:none}.dcr-brand-mark svg{width:29px;height:29px}.dcr-brand strong{font-size:23px;letter-spacing:-.5px}.dcr-nav{display:flex;align-self:stretch;gap:24px;align-items:center}.dcr .dcr-nav button{background:transparent;border:0;border-radius:0;position:relative;padding:10px 2px;color:var(--dcr-muted);white-space:nowrap}.dcr .dcr-nav button.active{color:var(--dcr-accent);font-weight:700}.dcr-nav button.active:after{content:'';position:absolute;height:3px;left:0;right:0;bottom:-18px;background:var(--dcr-accent)}.dcr-top-actions{display:flex;gap:18px;align-items:center;justify-content:flex-end;flex:1;min-width:0}.dcr-user-mini{display:flex;gap:9px;align-items:center;min-width:0;max-width:160px}.dcr-user-mini>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dcr .dcr-user-mini .dcr-avatar{width:32px;height:32px}.dcr-settings{position:relative}.dcr-settings summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:7px;color:var(--dcr-muted);padding:6px}.dcr-settings summary::-webkit-details-marker{display:none}.dcr-settings-popover{position:absolute;right:0;top:calc(100% + 12px);z-index:6;width:260px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dcr-line);border-radius:16px;padding:18px;box-shadow:0 12px 36px color-mix(in srgb,var(--dcr-text) 10%,transparent)}.dcr-settings-popover label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.dcr-settings-popover .muted{margin-top:12px}
.dcr-page{max-width:1800px;margin:auto;padding:28px 30px 18px}.dcr-room-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:0 0 24px}.dcr-room-heading p{margin-top:7px;color:var(--dcr-muted)}.dcr-mode-controls{display:flex;gap:10px;align-items:center}.dcr-mode-controls select{border-radius:999px;color:var(--dcr-accent);background:var(--dcr-soft);border-color:transparent;max-width:170px}.dcr-card{min-width:0;background:var(--dcr-surface);border:1px solid var(--dcr-line);border-radius:24px;padding:22px;box-shadow:0 8px 28px color-mix(in srgb,var(--dcr-text) 3%,transparent)}.dcr-layout{display:grid;grid-template-columns:minmax(190px,270px) minmax(340px,1fr) minmax(230px,300px);gap:22px;align-items:start}.dcr-left,.dcr-right{display:flex;flex-direction:column;gap:18px;min-width:0}.dcr-connected{color:var(--dsw-alias-state-success-primary);font-size:12px;display:flex;align-items:center;gap:6px}.dcr-connected.offline{color:var(--dcr-muted)}.dcr-opponent-name{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.dcr-opponent-name strong{font-size:29px;font-weight:760}.dcr-character-stage{display:grid;place-items:center;aspect-ratio:1/1.08;border-radius:20px;background:color-mix(in srgb,var(--dcr-accent) 4%,var(--dcr-surface));overflow:hidden}.dcr-character{width:90%;height:auto;max-height:300px;overflow:visible}.dcr-speech{position:relative;background:var(--dcr-soft);border-radius:16px;padding:15px 16px;margin-top:18px;color:var(--dcr-accent);font-size:15px;line-height:1.6;overflow-wrap:anywhere}.dcr-speech:before{content:'';position:absolute;left:28px;top:-7px;width:14px;height:14px;transform:rotate(45deg);background:var(--dcr-soft)}.dcr-character-note{margin-top:17px;color:var(--dcr-muted);font-size:12px;display:flex;align-items:center;gap:7px}.dcr-character-note .status-dot{color:var(--dcr-accent)}.dcr-avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;background:var(--dcr-soft);flex:none}.dcr-player-body{display:flex;gap:13px;align-items:center;min-width:0}.dcr-player-info{flex:1;min-width:0}.dcr-player-info strong{display:block;font-size:19px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dcr-player-info p{font-size:12px;color:var(--dcr-accent);margin-top:4px}.dcr-player-body .pill{padding:5px 9px}.dcr-rules p{margin-top:12px;color:var(--dcr-muted);font-size:13px}.dcr-rules svg{display:block;width:23px;height:23px;margin:16px 0 0 auto;color:var(--dcr-accent);opacity:.45}
.dcr-board-card{padding:24px;min-width:0}.dcr-board-card h2{font-size:24px}.dcr-status{display:inline-flex;align-items:center;gap:7px;padding:7px 17px;border-radius:999px;font-size:13px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,var(--dcr-surface));color:var(--dsw-alias-state-success-primary);max-width:50%;text-align:center}.dcr-status.thinking{background:var(--dcr-soft);color:var(--dcr-accent)}.dcr-board-subtitle{font-size:12px;color:var(--dcr-muted);margin-top:4px!important}.dcr-board-stage{max-width:790px;width:100%;margin:23px auto 0}.dcr-board-frame{display:grid;grid-template-columns:23px minmax(0,1fr);grid-template-rows:23px minmax(0,1fr);gap:3px;padding:12px 15px 17px 9px;border:7px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,var(--dcr-surface));border-radius:20px;background:repeating-linear-gradient(0deg,transparent 0,transparent 9px,color-mix(in srgb,var(--dsw-alias-state-warn-primary) 5%,transparent) 10px,transparent 11px),var(--dcr-wood);box-shadow:0 12px 24px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,transparent),inset 0 0 0 1px color-mix(in srgb,var(--dcr-grid) 18%,transparent)}.dcr-axis-x,.dcr-axis-y{display:grid;align-items:center;justify-items:center;color:var(--dcr-grid);font-size:11px;user-select:none}.dcr-axis-x{grid-template-columns:repeat(15,minmax(0,1fr))}.dcr-axis-y{grid-template-rows:repeat(15,minmax(0,1fr))}.dcr-board-frame.no-coordinates .dcr-axis-x,.dcr-board-frame.no-coordinates .dcr-axis-y{visibility:hidden}.dcr-board{display:grid;width:100%;aspect-ratio:1;grid-template-columns:repeat(15,minmax(0,1fr));grid-template-rows:repeat(15,minmax(0,1fr))}.dcr .dcr-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:0;padding:0;border:0;border-radius:0;background:transparent;isolation:isolate;opacity:1}.dcr .dcr-cell:disabled{opacity:1}.dcr .dcr-cell:hover:not(:disabled){background:transparent}.dcr-cell:before,.dcr-cell:after{content:'';position:absolute;background:var(--dcr-grid);z-index:-1;pointer-events:none}.dcr-cell:before{height:1px;left:0;right:0;top:50%}.dcr-cell:after{width:1px;top:0;bottom:0;left:50%}.dcr-cell.edge-left:before{left:50%}.dcr-cell.edge-right:before{right:50%}.dcr-cell.edge-top:after{top:50%}.dcr-cell.edge-bottom:after{bottom:50%}.dcr-star{position:absolute;width:5px;height:5px;border-radius:50%;background:var(--dcr-grid);pointer-events:none}.dcr-piece{position:relative;display:grid;place-items:center;width:85%;height:85%;border-radius:50%;border:1px solid color-mix(in srgb,var(--dcr-stone-black) 70%,var(--dcr-stone-white));background:radial-gradient(circle at 32% 25%,color-mix(in srgb,var(--dcr-stone-white) 12%,var(--dcr-stone-black)),var(--dcr-stone-black) 64%);box-shadow:1px 2px 1px color-mix(in srgb,var(--dcr-stone-black) 23%,transparent);color:var(--dcr-stone-white);font-size:clamp(9px,1.1cqw,14px);font-weight:700}.dcr-piece.white{background:radial-gradient(circle at 32% 25%,var(--dcr-stone-white) 55%,color-mix(in srgb,var(--dcr-stone-black) 10%,var(--dcr-stone-white)));border-color:color-mix(in srgb,var(--dcr-stone-black) 20%,var(--dcr-stone-white));color:var(--dcr-stone-black)}.dcr-cell.last .dcr-piece{outline:2px solid var(--dcr-accent);outline-offset:2px}.dcr-cell.winning .dcr-piece{outline:3px solid var(--dsw-alias-state-success-primary);outline-offset:1px}.dcr-hint{width:76%;height:76%;border:2px solid var(--dcr-accent);border-radius:50%;display:grid;place-items:center;color:var(--dcr-accent);font-size:12px}.dcr-hover-piece{width:80%;height:80%;border-radius:50%;background:var(--dcr-accent);opacity:0}.dcr-cell:hover:not(:disabled) .dcr-hover-piece{opacity:.15}.dcr-board-footer{margin-top:17px;display:flex;justify-content:space-between;align-items:center;gap:10px;color:var(--dcr-muted);font-size:12px}.dcr-board-footer>span{display:flex;align-items:center;gap:7px;min-width:0}.dcr-coordinate-toggle{display:flex;align-items:center;gap:8px;white-space:nowrap}.dcr-replay-controls{display:flex;gap:9px;align-items:center;margin-top:18px}.dcr-replay-controls input{flex:1;min-width:0;padding:0}.dcr-replay-controls button{padding:6px 10px}
.dcr-move-table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.dcr-move-table th{font-weight:400;color:var(--dcr-muted);font-size:12px;padding:11px 6px;border-top:1px solid var(--dcr-line)}.dcr-move-table td{padding:7px 6px;white-space:nowrap}.dcr-move-table td:first-child{color:var(--dcr-muted);width:20%}.dcr-move-table tbody tr.current{background:var(--dcr-soft)}.dcr-move-table tbody tr.current td:first-child{color:var(--dcr-accent)}.dcr-move-table .latest{font-size:10px;color:var(--dcr-accent);margin-left:5px;font-weight:400}.dcr .dcr-move-table button{padding:3px 0;min-height:26px;border:0;background:transparent;font-weight:700}.dcr .dcr-move-table button:hover{color:var(--dcr-accent)}.dcr-move-scroll{max-height:335px;overflow:auto}.dcr-move-empty{padding:25px 0;color:var(--dcr-muted);font-size:13px}.dcr-move-more{border-top:1px solid var(--dcr-line);margin-top:14px;padding-top:10px;text-align:center}.dcr-move-more button{font-size:12px}.dcr-comment-control{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding-bottom:15px;border-bottom:1px solid var(--dcr-line);margin-bottom:17px}.dcr-comment-control label{display:flex;gap:7px;align-items:center;background:var(--dcr-soft);color:var(--dcr-accent);border-radius:999px;padding:5px 9px;font-size:12px}.dcr-messages{display:flex;flex-direction:column;gap:16px;max-height:360px;min-height:190px;overflow:auto;overflow-wrap:anywhere}.dcr-message{max-width:95%;align-self:flex-start;font-size:13px}.dcr-message.user{align-self:flex-end;text-align:right}.dcr-message-name{font-size:11px;font-weight:650;color:var(--dcr-accent);margin-bottom:5px}.dcr-message.user .dcr-message-name{color:var(--dcr-muted)}.dcr-message-body{border-radius:14px;padding:12px 13px;background:var(--dcr-soft);color:var(--dcr-accent);text-align:left}.dcr-message.user .dcr-message-body{background:var(--dsw-alias-bg-layer-2);color:var(--dcr-text)}.dcr-message.system{align-self:center;text-align:center;max-width:100%;color:var(--dcr-muted);font-size:11px}.dcr-chat-form{display:flex;align-items:center;gap:6px;border:1px solid var(--dcr-line);border-radius:12px;padding:4px;background:var(--dsw-alias-bg-layer-2);margin-top:18px}.dcr .dcr-chat-form input{border:0;background:transparent;flex:1;width:0;padding:7px 8px;font-size:12px}.dcr .dcr-chat-form button{min-height:32px;padding:5px 8px;border-radius:9px}.dcr-chat-form svg{width:19px;height:19px}.dcr-error{border:1px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,var(--dcr-surface));color:var(--dsw-alias-state-error-primary);padding:10px 14px;border-radius:12px;margin-bottom:18px;overflow-wrap:anywhere}
.dcr-footer{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin-top:24px;position:sticky;bottom:12px;z-index:3}.dcr-toolbar button span{overflow:hidden;text-overflow:ellipsis}.dcr-footer-note{color:var(--dcr-muted);font-size:11px}.dcr-footer-note:last-child{text-align:right}.dcr-toolbar{display:flex;align-items:center;gap:7px;padding:6px;border:1px solid var(--dcr-line);border-radius:18px;background:var(--dcr-surface);position:relative;box-shadow:0 4px 18px color-mix(in srgb,var(--dcr-text) 4%,transparent)}.dcr .dcr-toolbar button{display:flex;justify-content:center;align-items:center;gap:7px;background:transparent;border:0;padding:9px 13px;white-space:nowrap;color:var(--dcr-muted);min-height:39px}.dcr .dcr-toolbar button.primary{background:var(--dcr-accent);color:var(--dsw-alias-bg-base);min-width:108px}.dcr .dcr-toolbar button:hover:not(:disabled):not(.primary){background:var(--dcr-soft);color:var(--dcr-accent)}.dcr-records{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:20px}.dcr-record-card .record-count{font-size:28px;font-weight:750;margin:18px 0 5px}.dcr-record-card .record-details{display:flex;gap:12px;flex-wrap:wrap;margin:15px 0}.dcr-record-card button{width:100%;margin-top:15px}.dcr-records-empty{grid-column:1/-1;padding:26px;text-align:center;color:var(--dcr-muted)}
@container chessroom (max-width:1120px){.dcr-topbar-inner{padding:16px 22px;gap:20px}.dcr-page{padding:24px 22px 16px}.dcr-layout{grid-template-columns:210px minmax(0,1fr);gap:18px}.dcr-right{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;align-items:start}.dcr-nav button.active:after{bottom:-16px}.dcr-footer{grid-template-columns:1fr;justify-items:center}.dcr-footer-note{display:none}.dcr-top-actions{gap:12px}.dcr-board-stage{max-width:710px}}
@container chessroom (max-width:760px){.dcr-topbar-inner{padding:14px 16px;flex-wrap:wrap;gap:12px}.dcr-brand{flex:1}.dcr-brand strong{font-size:20px}.dcr-brand .muted{font-size:10px}.dcr-brand-mark{width:38px;height:38px}.dcr-top-actions{flex:0;gap:9px}.dcr-user-mini{max-width:90px}.dcr-nav{width:100%;justify-content:center;gap:32px;order:3}.dcr .dcr-nav button{font-size:13px;padding:6px 4px}.dcr-nav button.active:after{bottom:-14px}.dcr-settings summary>span{display:none}.dcr-page{padding:22px 14px 15px}.dcr-room-heading{align-items:flex-start;gap:10px;margin-bottom:18px}.dcr h1{font-size:24px}.dcr-room-heading p{font-size:12px}.dcr-mode-controls{flex-direction:column;gap:6px;align-items:flex-end}.dcr-mode-controls .pill{font-size:10px;padding:4px 9px}.dcr-mode-controls select{font-size:11px;min-height:30px;padding:4px 7px;max-width:122px}.dcr-layout{grid-template-columns:minmax(0,1fr);gap:16px}.dcr-board-card{grid-row:1;padding:18px 14px}.dcr-left{grid-row:2;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.dcr-role{grid-row:1/3;padding:15px}.dcr-left .dcr-card:not(.dcr-role){padding:15px}.dcr-character-stage{aspect-ratio:1}.dcr-opponent-name strong{font-size:23px}.dcr-speech{font-size:12px;padding:11px;margin-top:12px}.dcr-character-note{font-size:10px}.dcr-player-body{flex-wrap:wrap;gap:8px}.dcr-avatar{width:40px;height:40px}.dcr-player-info strong{font-size:16px}.dcr-player-body .pill{font-size:10px}.dcr-rules p{font-size:11px;margin-top:8px}.dcr-rules h3{font-size:14px}.dcr-rules svg{margin-top:10px}.dcr-right{grid-column:auto;grid-row:3;display:grid;grid-template-columns:1fr}.dcr-card{border-radius:20px;padding:18px}.dcr-board-stage{margin-top:18px}.dcr-board-card h2{font-size:21px}.dcr-status{padding:6px 10px;font-size:11px}.dcr-board-footer{font-size:10px}.dcr-board-frame{padding:7px 9px 12px 4px;border-width:5px;border-radius:15px;grid-template-columns:19px minmax(0,1fr);grid-template-rows:19px minmax(0,1fr);gap:1px}.dcr-axis-x,.dcr-axis-y{font-size:9px}.dcr-top-actions .dcr-settings{order:2}.dcr-settings-popover{right:-5px;width:min(240px,calc(100cqw - 36px))}.dcr-footer{margin-top:18px}.dcr-toolbar{width:100%;gap:3px;border-radius:14px}.dcr .dcr-toolbar button{flex:1;min-width:0;padding:9px 5px;gap:5px;font-size:12px}.dcr .dcr-toolbar button.primary{min-width:0}.dcr-toolbar svg{width:16px;height:16px}}
@container chessroom (max-width:440px){.dcr .dcr-toolbar svg{display:none}.dcr-left{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.dcr-connected{font-size:10px}.dcr-left .pill{padding:4px 7px}.dcr-character-note{line-height:1.4}.dcr-board-footer{flex-wrap:wrap}.dcr .dcr-user-mini .dcr-avatar{width:28px;height:28px}.dcr-user-mini>span{max-width:70px}.dcr-label-row{gap:5px}}
.dcr .dcr-character{display:block;object-fit:contain}.dcr .dcr-expression-img{display:block;width:100%;height:auto;object-fit:contain}.dcr .dcr-character-unavailable{display:grid;place-items:center;aspect-ratio:1;color:var(--dcr-muted);font-size:32px;font-weight:750}.dcr .dcr-expression-caption{margin-top:6px;text-align:center;font-size:11px;color:var(--dcr-muted)}.dcr .dcr-expression-gallery{border-top:1px solid var(--dcr-line);margin-top:12px;padding-top:9px;font-size:11px;color:var(--dcr-muted)}.dcr .dcr-expression-gallery summary{cursor:pointer}.dcr .dcr-expression-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:9px}.dcr .dcr-expression-grid button{min-height:28px;padding:4px 6px;font-size:11px}.dcr .dcr-expression-grid button[aria-pressed=true]{border-color:var(--dcr-accent);color:var(--dcr-accent);background:var(--dcr-soft)}.dcr .dcr-expression-gallery p{margin-top:7px;font-size:10px}
`;
    function Character({ expression, label, revision }) {
      const sources = viewModel.expressionAssets(expression, revision), [failurePhase, setFailurePhase] = React.useState(0);
      React.useEffect(() => setFailurePhase(0), [sources.static]);
      if (failurePhase >= 2) return h("div", { className: "dcr-character dcr-character-unavailable", role: "img", "aria-label": `DSH \xB7 ${label}` }, "DSH");
      return h(
        "picture",
        { className: "dcr-character", "data-dcr-avatar": "user-v2" },
        failurePhase === 0 ? h("source", { type: "image/webp", media: "(prefers-reduced-motion: no-preference)", srcSet: sources.animated }) : null,
        h("img", { className: "dcr-expression-img", src: sources.static, width: 448, height: 448, alt: `DSH \xB7 ${label}`, decoding: "async", draggable: false, onError: () => setFailurePhase((value) => value + 1) })
      );
    }
    function Avatar({ profile, t }) {
      const [failed, setFailed] = React.useState(false);
      React.useEffect(() => setFailed(false), [profile.identityRevision, profile.avatarUrl]);
      return profile.avatarUrl && !failed ? h("img", { key: `${profile.identityRevision}:${profile.avatarUrl}`, className: "dcr-avatar", src: profile.avatarUrl, alt: profile.name || t("guest"), referrerPolicy: "no-referrer", onError: () => setFailed(true) }) : h("svg", { className: "dcr-avatar", viewBox: "0 0 64 64", role: "img", "aria-label": t("guest") }, h("circle", { cx: 32, cy: 23, r: 11, fill: "var(--dsw-alias-label-secondary)" }), h("path", { d: "M12 56q0-21 20-21t20 21", fill: "var(--dsw-alias-label-secondary)" }));
    }
    function Glyph({ name }) {
      const paths = { plus: "M12 5v14M5 12h14", undo: "M8 7H3V2M3 7a9 9 0 1 1 0 10", hint: "M9 19h6M10 22h4M8 15a7 7 0 1 1 8 0l-1 2H9z", resign: "M5 22V3m0 0h15l-4 5 4 5H5", replay: "M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 5h6m-6 4h6m-6 4h6", send: "m3 11 17-8-6 18-3-8-8-2zm8 2 9-10", settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" };
      return h("svg", { className: "dcr-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: paths[name] || paths.replay }));
    }
    function Whale() {
      return h("svg", { viewBox: "0 0 40 32", fill: "currentColor", "aria-hidden": true }, h("path", { d: "M29 12q5-5 9-5-1 7-7 9 6 3 7 8-6 0-10-6-4 8-14 8C-1 26-1 9 14 9q10 0 15 3M12 6q-2-5-5-1-3-6 3-5 6 0 5 7z" }), h("circle", { cx: 10, cy: 16, r: 1.4, fill: "var(--dsw-alias-bg-layer-1)" }));
    }
    return { viewModel, inject: ["slots", "locale"], apply(ctx) {
      ctx.effect(() => ctx.locale.register("dsh-chess-room-context-client-v121", "zh", zh), "dsh-chess-room zh dictionary");
      ctx.effect(() => ctx.locale.register("dsh-chess-room-context-client-v121", "en", en), "dsh-chess-room en dictionary");
      const locale = ctx.locale, t = locale.bind("dsh-chess-room-context-client-v121");
      function ChessRoomWhaleMaidContext121() {
        React.useEffect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-chess-room", order: 45, priority: -1212, label: () => t("title") }, Icon)), []);
        const [, setLocale] = React.useState(0), [state, setState] = React.useState(null), [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false), [text, setText] = React.useState(""), [playerColor, setPlayerColor] = React.useState(1), [replay, setReplay] = React.useState(null), [step, setStep] = React.useState(0), [tab, setTab] = React.useState("room"), [coordinates, setCoordinates] = React.useState(true), [fullMoves, setFullMoves] = React.useState(false);
        const roomRootRef = React.useRef(null), boardRef = React.useRef(null), playerAvatarRef = React.useRef(null), playerCardRef = React.useRef(null), stageApiRef = React.useRef(null);
        const [stageVisual, setStageVisual] = React.useState(null), [stageLocalQuiet, setStageLocalQuiet] = React.useState(false), [stagePrefs, setStagePrefs] = React.useState({ reduce: false, drag: false, roam: true });
        React.useEffect(() => {
          if (state?.settings?.comments === false) setStageLocalQuiet(false);
        }, [state?.settings?.comments]);
        const stateRef = React.useRef(null), lock = React.useRef(false), alive = React.useRef(true), requests = React.useRef(/* @__PURE__ */ new Set());
        const accept = (next) => {
          if (!alive.current) return;
          if (stateRef.current && next.runtimeId === stateRef.current.runtimeId && next.revision < stateRef.current.revision) return;
          stateRef.current = next;
          setState(next);
        };
        async function rpc(operation, payload = {}) {
          const controller = new AbortController();
          requests.current.add(controller);
          const timer = setTimeout(() => controller.abort(), 8e3);
          try {
            const response = await fetch(new URL("/api/dsh-chess-room", window.location.href), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, payload }), signal: controller.signal });
            const value = await response.json();
            if (!value.ok) throw Object.assign(new Error(value.code), { code: value.code });
            return value.state;
          } finally {
            clearTimeout(timer);
            requests.current.delete(controller);
          }
        }
        React.useEffect(() => locale.subscribe(() => setLocale((x) => x + 1)), []);
        React.useEffect(() => {
          alive.current = true;
          let stopped = false, timer;
          async function sync() {
            try {
              const next = await rpc("state", { locale: locale.getLocale().active, timezoneOffsetSeconds: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60 });
              if (!stopped) {
                accept(next);
                setError("");
              }
            } catch (e) {
              if (!stopped) setError(e.code || "offline");
            }
            if (!stopped) timer = setTimeout(sync, 1e3);
          }
          void sync();
          return () => {
            stopped = true;
            alive.current = false;
            clearTimeout(timer);
            for (const c of requests.current) c.abort();
          };
        }, []);
        React.useEffect(() => {
          if (state?.game) {
            setPlayerColor(state.game.playerColor);
          }
        }, [state?.game?.id]);
        async function bindContext(selection) {
          const before = stateRef.current;
          if (lock.current || !before?.game || !alive.current) throw Object.assign(new Error("Room busy"), { code: "unavailable" });
          lock.current = true;
          setBusy(true);
          try {
            const game = before.game;
            const next = await rpc("bindContext", { gameId: game.id, version: game.version, turnIdentity: game.turnIdentity,
              requestId: crypto.randomUUID(), workspaceId: selection.workspaceId, sessionId: selection.sessionId });
            if (!alive.current || stateRef.current?.runtimeId !== before.runtimeId) throw Object.assign(new Error("Room changed"), { code: "stale" });
            accept(next);
            return stateRef.current;
          } catch (error) {
            if (alive.current && stateRef.current?.runtimeId === before.runtimeId) {
              try {
                const recovered = await rpc("state");
                if (alive.current && stateRef.current?.runtimeId === before.runtimeId) accept(recovered);
              } catch {}
            }
            throw error;
          } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
          }
        }
        async function act(operation, extra = {}) {
          if (lock.current || !stateRef.current?.game) return;
          lock.current = true;
          setBusy(true);
          setError("");
          const g2 = stateRef.current.game;
          if (["newGame", "undo", "resign"].includes(operation)) stageApiRef.current?.cancel(operation);
          if (operation === "settings" && extra.comments === false || operation === "chat" && requestsQuiet(extra.text)) {
            setStageLocalQuiet(true);
            stageApiRef.current?.setQuiet(true);
          }
          if (operation === "settings" && extra.comments === true) setStageLocalQuiet(false);
          try {
            const next = await rpc(operation, { gameId: g2.id, version: g2.version, turnIdentity: g2.turnIdentity, requestId: crypto.randomUUID(), ...extra });
            accept(next);
            if (!alive.current) return;
            if (operation === "newGame") {
              setReplay(null);
              setTab("room");
            }
            if (operation === "chat") setText("");
          } catch (e) {
            if (!alive.current) return;
            setError(e.code || "offline");
            try {
              accept(await rpc("state"));
            } catch {
            }
          } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
          }
        }
        const g = state?.game, viewing = replay !== null, shown = viewing ? replay : g, moves = shown?.moves || [], visibleMoves = viewing ? moves.slice(0, step) : moves;
        const board = viewing ? viewModel.replayBoard(moves, step) : g?.board || viewModel.replayBoard([], 0);
        const last = visibleMoves.at(-1), profile = state?.profile || {}, canMove = !busy && !viewing && g?.status === "playing" && g.turn === g.playerColor && !state?.aiThinking;
        const liveStatus = !g ? t("loading") : g.status === "playing" ? state.aiThinking ? t("thinking") : g.turn === g.playerColor ? t("yourTurn") : t("waiting") : g.status === "draw" ? t("draw") : g.winner === g.playerColor ? t("win") : g.status === "resigned" ? t("resigned") : t("lose");
        const status = viewing ? `${t("replay")} \xB7 ${step} / ${moves.length} ${t("step")}` : liveStatus;
        const expression = state?.expression || "idle", comments = state?.settings?.comments !== false, lastComment = g?.chat?.filter((message) => message.who === "dsh").at(-1), connected = !!state && error !== "offline" && error !== "unavailable";
        const expressionLabel = (id) => t(id === "thinking" ? "thinkingExpression" : id), shownExpression = expression;
        const startReplay = (game, at = 0) => {
          if (!game) return;
          setReplay(game);
          setStep(at);
          setTab("room");
        };
        const backToLive = () => {
          setReplay(null);
          setTab("room");
        };
        const liveStageEnabled = tab === "room" && !viewing;
        const maskedMove = liveStageEnabled && connected ? confirmedMoveMask(state, stageVisual?.model) : null;
        const feedback = liveStageEnabled && connected ? stageVisual?.model?.avatarFeedback : null;
        const cells = [];
        for (const row of viewModel.boardRows) for (let col = 0; col < 15; col++) {
          const cell = board[row][col], isLast = last?.row === row && last?.col === col, win = !viewing && g?.winningLine?.some((p) => p.row === row && p.col === col), hint = !viewing && state?.hint?.row === row && state?.hint?.col === col;
          const coord = viewModel.coordinate({ row, col }), star = [3, 7, 11].includes(row) && [3, 7, 11].includes(col);
          const classes = ["dcr-cell", col === 0 ? "edge-left" : "", col === 14 ? "edge-right" : "", row === 14 ? "edge-top" : "", row === 0 ? "edge-bottom" : "", isLast ? "last" : "", win ? "winning" : ""].filter(Boolean).join(" ");
          cells.push(h(
            "button",
            { key: `${row}:${col}`, className: classes, disabled: !canMove || !!cell, "aria-label": `${coord}${cell ? ` \xB7 ${t(cell === 1 ? "black" : "white")}` : ""}${isLast ? ` \xB7 ${t("last")}` : ""}${hint ? ` \xB7 ${t("tip")}` : ""}`, title: hint ? t("hintOnly") : coord, onClick: () => void act("move", { row, col }) },
            star ? h("span", { className: "dcr-star", "aria-hidden": true }) : null,
            cell ? h("span", { className: `dcr-piece${cell === 2 ? " white" : ""}`, style: { visibility: maskedMove?.row === row && maskedMove?.col === col ? "hidden" : void 0 }, "data-dcr-move-id": visibleMoves.find((m) => m.row === row && m.col === col)?.moveId, "aria-hidden": true }, isLast ? visibleMoves.length : null) : hint ? h("span", { className: "dcr-hint", "aria-hidden": true }, "?") : h("span", { className: "dcr-hover-piece", "aria-hidden": true })
          ));
        }
        const colorSelect = () => h("select", { value: playerColor, disabled: busy || !g, "aria-label": t("color"), onChange: (event) => setPlayerColor(Number(event.target.value)) }, h("option", { value: 1 }, t("black")), h("option", { value: 2 }, t("white")));
        const commentsToggle = () => h("input", { type: "checkbox", checked: comments, disabled: busy || !g, "aria-label": t("comments"), onChange: (event) => void act("settings", { comments: event.target.checked }) });
        const renderHeader = () => h("div", { className: "dcr-topbar" }, h(
          "div",
          { className: "dcr-topbar-inner" },
          h("div", { className: "dcr-brand" }, h("span", { className: "dcr-brand-mark" }, h(Whale)), h("div", null, h("strong", null, t("title")), h("p", { className: "muted" }, t("subtitle")))),
          h("nav", { className: "dcr-nav", "aria-label": t("title") }, ["room", "records"].map((value) => h("button", { key: value, className: tab === value ? "active" : "", "aria-current": tab === value ? "page" : void 0, onClick: () => setTab(value) }, t(value)))),
          h("div", { className: "dcr-top-actions" }, tab === "motionPreview" ? null : h("details", { className: "dcr-settings" }, h("summary", { "aria-label": t("settings") }, h(Glyph, { name: "settings" }), h("span", null, t("settings"))), h("div", { className: "dcr-settings-popover" }, h("h3", null, t("settings")), h("label", null, t("color"), colorSelect()), h("label", { style: { flexDirection: "row", alignItems: "center" } }, commentsToggle(), t("comments")), h("p", { className: "muted" }, t("nextGame")))), h("div", { className: "dcr-user-mini" }, h(Avatar, { profile, t }), h("span", { title: profile.name || t("player") }, profile.name || t("player"))))
        ));
        const renderLeft = () => h(
          "aside",
          { className: "dcr-left", "aria-label": t("opponent") },
          h(
            "section",
            { className: `dcr-card dcr-role${state?.aiThinking ? " thinking" : ""}`, title: t("art") },
            h("div", { className: "label-row" }, h("span", { className: "muted" }, t("opponent")), h("span", { className: `dcr-connected${connected ? "" : " offline"}` }, h("i", { className: "status-dot", "aria-hidden": true }), t(connected ? "connected" : "disconnected"))),
            h("div", { className: "dcr-opponent-name" }, h("strong", null, "DSH"), h("span", { className: "pill" }, h("i", { className: `stone${g?.playerColor === 1 ? " white" : ""}`, "aria-hidden": true }), t(g?.playerColor === 1 ? "white" : "black"))),
            h("div", { className: "dcr-character-stage" }, h(Character, { expression: shownExpression, label: expressionLabel(shownExpression), revision: state?.runtimeId })),
            h("p", { className: "dcr-expression-caption" }, expressionLabel(shownExpression)),
            comments && !stageLocalQuiet ? h("div", { className: "dcr-speech" }, lastComment?.text || t(g ? "characterReady" : "loading")) : null
          ),
          h(ContextPicker, { snapshot: state, catalog: payload => rpc("contextCatalog", payload), bind: bindContext, t, busy, online: connected }),
          h("section", { className: "dcr-card", ref: playerCardRef }, h("div", { className: "label-row" }, h("span", { className: "muted" }, t("seat"))), h("div", { className: "dcr-player-body" }, h("div", { className: "dcr-live-avatar", ref: playerAvatarRef }, h("div", { className: "dcr-live-avatar-inner", style: { transform: feedback ? `translateX(${feedback.shake}px) rotate(${feedback.shake * 0.8}deg)` : void 0 } }, h(Avatar, { profile, t })), feedback ? h("div", { className: "dcr-motion-stars", "aria-hidden": true }, [0, 1, 2].map((i) => h("span", { key: i }, "\u2726"))) : null), h("div", { className: "dcr-player-info" }, h("strong", { title: profile.name || t("player") }, profile.name || t("player")), h("p", null, liveStatus)), h("span", { className: "pill" }, t(g?.playerColor === 2 ? "white" : "black")))),
          h("section", { className: "dcr-card dcr-rules" }, h("h3", null, t("agreement")), h("p", null, t("rules")), h("p", null, t("winRule")), h(Whale))
        );
        const renderBoard = () => h(
          "section",
          { className: "dcr-card dcr-board-card", "aria-label": t("gomoku") },
          h("div", { className: "heading-row" }, h("div", null, h("h2", null, t("gomoku")), h("p", { className: "dcr-board-subtitle" }, `${visibleMoves.length + (!viewing && g?.status === "playing" ? 1 : 0)} ${t("step")} \xB7 ${t((viewing ? last?.color : g?.turn) === 2 ? "white" : "black")}`)), h("div", { className: `dcr-status${state?.aiThinking || viewing ? " thinking" : ""}`, role: "status", "aria-live": "polite" }, h("i", { className: "status-dot", "aria-hidden": true }), status)),
          h("div", { className: "dcr-board-stage" }, h("div", { className: `dcr-board-frame${coordinates ? "" : " no-coordinates"}` }, h("span", { "aria-hidden": true }), h("div", { className: "dcr-axis-x", "aria-hidden": true }, Array.from({ length: 15 }, (_, col) => h("span", { key: col }, String.fromCharCode(65 + col)))), h("div", { className: "dcr-axis-y", "aria-hidden": true }, viewModel.boardRows.map((row) => h("span", { key: row }, row + 1))), h("div", { className: "dcr-board", ref: boardRef, "aria-label": t("rules") }, cells))),
          h("div", { className: "dcr-board-footer" }, h("span", null, h("i", { className: `stone${last?.color === 2 ? " white" : ""}`, "aria-hidden": true }), last ? `${last.source === "model" || last.source === "engine" ? t("lastPlayed") : t("last")} ${viewModel.coordinate(last)}` : t("noLastMove")), h("label", { className: "dcr-coordinate-toggle" }, t("showCoordinates"), h("input", { type: "checkbox", checked: coordinates, onChange: (event) => setCoordinates(event.target.checked) }))),
          viewing ? h("div", { className: "dcr-replay-controls" }, h("button", { onClick: () => setStep(Math.max(0, step - 1)), disabled: step === 0, "aria-label": `${t("replay")} \u22121` }, "\u2039"), h("input", { type: "range", min: 0, max: moves.length, value: step, "aria-label": t("replay"), onChange: (event) => setStep(Number(event.target.value)) }), h("button", { onClick: () => setStep(Math.min(moves.length, step + 1)), disabled: step === moves.length, "aria-label": `${t("replay")} +1` }, "\u203A"), h("button", { className: "text-button", onClick: backToLive }, t("live"))) : null
        );
        const renderMoves = () => h(
          "section",
          { className: "dcr-card" },
          h("div", { className: "heading-row" }, h("h2", null, t("moves")), h("span", { className: "muted" }, `${visibleMoves.length} ${t("step")}`)),
          visibleMoves.length ? h("div", { className: "dcr-move-scroll" }, h("table", { className: "dcr-move-table" }, h("thead", null, h("tr", null, ["moveNumber", "stones", "position"].map((key) => h("th", { key, scope: "col" }, t(key))))), h("tbody", null, viewModel.recentMoves(visibleMoves, fullMoves ? 225 : 6).map(({ move, index }) => h("tr", { key: index, className: index === visibleMoves.length - 1 ? "current" : "" }, h("td", null, index + 1), h("td", null, h("i", { className: `stone${move.color === 2 ? " white" : ""}`, "aria-hidden": true }), t(move.color === 1 ? "black" : "white")), h("td", null, h("button", { onClick: () => startReplay(shown, index + 1), "aria-label": `${t("replay")} ${index + 1} \xB7 ${viewModel.coordinate(move)}` }, viewModel.coordinate(move)), index === visibleMoves.length - 1 ? h("span", { className: "latest" }, t("latest")) : null)))))) : h("p", { className: "dcr-move-empty" }, t("emptyMoves")),
          h("div", { className: "dcr-move-more" }, h("button", { className: "text-button", disabled: !visibleMoves.length, onClick: () => setFullMoves(!fullMoves) }, `${t(fullMoves ? "collapseMoves" : "viewAllMoves")} ${fullMoves ? "\u2191" : "\u2192"}`))
        );
        const renderChat = () => h(
          "section",
          { className: "dcr-card" },
          h("div", { className: "heading-row" }, h("h2", null, t("chat")), h("details", { className: "dcr-settings" }, h("summary", { "aria-label": t("settings") }, h(Glyph, { name: "settings" })), h("div", { className: "dcr-settings-popover" }, h("label", { style: { flexDirection: "row", alignItems: "center" } }, commentsToggle(), t("comments")), h("p", { className: "muted" }, t(comments ? "commentsHint" : "commentOff"))))),
          h("div", { className: "dcr-comment-control" }, h("label", null, commentsToggle(), t("activeComments")), h("span", { className: "muted" }, t(comments ? "commentsHint" : "commentOff"))),
          h("div", { className: "dcr-messages" }, g?.chat?.length ? g.chat.slice(-20).map((message) => message.who === "system" ? h("div", { key: message.id, className: "dcr-message system" }, message.key ? t(message.key) : message.text) : h("div", { key: message.id, className: `dcr-message${message.who === "player" ? " user" : ""}` }, h("div", { className: "dcr-message-name" }, message.who === "dsh" ? "DSH" : profile.name || t("player")), h("div", { className: "dcr-message-body" }, message.text))) : h("p", { className: "muted" }, t("emptyChat"))),
          h("form", { className: "dcr-chat-form", onSubmit: (event) => {
            event.preventDefault();
            if (text.trim()) void act("chat", { text: text.trim() });
          } }, h("input", { value: text, maxLength: 400, placeholder: t(comments ? "chatPlaceholder" : "quietChatPlaceholder"), "aria-label": t("chat"), disabled: busy || !g, onChange: (event) => setText(event.target.value) }), h("button", { type: "submit", className: "primary", disabled: busy || !text.trim() || !g, "aria-label": t("send"), title: t("send") }, h(Glyph, { name: "send" })))
        );
        const renderRecords = () => h("div", { className: "dcr-records" }, [...g ? [{ game: g, current: true }] : [], ...(state?.savedGames || []).map((game) => ({ game, current: false }))].map(({ game, current }) => h("section", { key: game.id, className: "dcr-card dcr-record-card" }, h("div", { className: "heading-row" }, h("h2", null, t(current ? "currentGame" : "replay")), h("span", { className: "pill" }, t((game.status === "playing" ? "unfinished" : game.status === "draw" ? "draw" : game.winner === game.playerColor ? "win" : "lose")))), h("div", { className: "record-count" }, `${game.moves.length} ${t("step")}`), h("p", { className: "muted" }, game.updatedAt ? new Date(game.updatedAt).toLocaleString() : ""), h("div", { className: "record-details" }, h("span", null, h("i", { className: `stone${game.playerColor === 2 ? " white" : ""}`, "aria-hidden": true }), t(game.playerColor === 1 ? "black" : "white")), h("span", { className: "muted" }, game.status === "playing" ? t(current ? "currentGame" : "unfinished") : game.status === "draw" ? t("draw") : game.winner === game.playerColor ? t("win") : t("lose"))), h("button", { onClick: () => startReplay(game, 0), disabled: !game.moves.length }, t("replay")))), !g?.moves?.length && !state?.savedGames?.some((game) => game.moves.length) ? h("p", { className: "dcr-records-empty" }, t("replayEmpty")) : null);
        const renderFooter = () => h(
          "footer",
          { className: "dcr-footer" },
          h("span", { className: "dcr-footer-note" }, !state ? t("loading") : g?.lastSource === "engine" ? t("fallback") : t("storage")),
          h(
            "div",
            { className: "dcr-toolbar", "aria-label": t("room") },
            h("button", { className: "primary", disabled: busy || !g, onClick: () => {
              if (!g?.moves?.length || window.confirm(t("confirmNew"))) void act("newGame", { playerColor });
            } }, h(Glyph, { name: "plus" }), h("span", null, t("newGame"))),
            h("button", { disabled: busy || viewing || !g?.moves?.some((move) => move.color === g.playerColor), onClick: () => void act("undo") }, h(Glyph, { name: "undo" }), h("span", null, t("undo"))),
            h("button", { disabled: !canMove, title: t("hintOnly"), onClick: () => void act("hint") }, h(Glyph, { name: "hint" }), h("span", null, t("hint"))),
            h("button", { disabled: busy || viewing || !g || g.status !== "playing", onClick: () => {
              if (window.confirm(t("confirmResign"))) void act("resign");
            } }, h(Glyph, { name: "resign" }), h("span", null, t("resign"))),
            h("button", { disabled: busy || !g || !viewing && !g.moves.length && tab === "room", onClick: () => {
              if (viewing || tab === "records") backToLive();
              else startReplay(g, 0);
            } }, h(Glyph, { name: "replay" }), h("span", null, t(viewing || tab === "records" ? "live" : "replay")))
          ),
          h("span", { className: "dcr-footer-note" }, t("movePrompt"))
        );
        return h("div", { className: "dcr", ref: roomRootRef, "data-dcr-layout": "reference-v2", "data-dcr-stage-live": LIVE_RELEASE2, "data-dcr-client-generation": "1.2.1" }, h("style", null, css + contextCss), renderHeader(), h(
          "div",
          { className: "dcr-page" },
          h("div", { className: "dcr-room-heading" }, h("div", null, h("h1", null, t(tab === "records" ? "records" : tab === "motionPreview" ? "motionTitle" : "roomTitle")), h("p", null, t(tab === "records" ? "saved" : tab === "motionPreview" ? "motionSubtitle" : "roomSubtitle"))), tab === "motionPreview" ? null : h("div", { className: "dcr-mode-controls" }, h("span", { className: "pill" }, t("freestyle")))),
          error ? h("div", { className: "dcr-error", role: "alert" }, t(error) || t("unavailable")) : null,
          tab === "motionPreview" ? h(CharacterStagePreview, { t, profile, runtimeId: state?.runtimeId ?? "", Avatar, roomRef: roomRootRef }) : tab === "records" ? renderRecords() : h("div", { className: "dcr-layout" }, renderLeft(), renderBoard(), h("aside", { className: "dcr-right", "aria-label": t("moves") }, renderMoves(), renderChat())),
          tab === "motionPreview" ? null : renderFooter()
        ), h(CharacterStageLive, { snapshot: state, enabled: liveStageEnabled, online: connected, quiet: stageLocalQuiet || !comments, prefs: stagePrefs, t, rootRef: roomRootRef, boardRef, avatarRef: playerAvatarRef, cardRef: playerCardRef, apiRef: stageApiRef, onVisual: setStageVisual, interactionBusy: busy }));
      }
      function Icon({ size = 20 }) {
        return h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true }, h("rect", { x: 3, y: 3, width: 18, height: 18, rx: 4 }), h("path", { d: "M8 5v14m8-14v14M5 8h14M5 16h14" }), h("circle", { cx: 12, cy: 12, r: 3, fill: "currentColor" }));
      }
      ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "dsh-chess-room", priority: -1211 }, ChessRoomWhaleMaidContext121));
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-chess-room", order: 45, priority: -1211, label: () => t("title") }, Icon));
    } };
  }

