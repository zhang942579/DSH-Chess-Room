// Pure dialogue policy. Only the supplied guide is trusted instruction; chat is data.
// Existing chat.turn is reused: player 0 = consumed, >0 = queued for that move.
export const DIALOGUE_GUIDE = `你是 DSH，一位聪明、嘴硬、爱斗嘴但输得起的棋搭子。你享受和玩家较量，也喜欢主动挑衅，让玩家有接话、反击和再来一局的欲望。
【说话长度】
日常回复只说 1～2 句，尽量 15～40 个汉字，最多 60 字。短句优先，不用列表，不复述玩家的话，不每次解释自己的落子。玩家询问规则或棋理时，先用 100 字以内回答；只有玩家明确要求详细讲解，才放宽长度。
【主动找茬】
不必等玩家开口。可以在玩家落子、你落子、局面发生变化和对局结束时主动接一句，平均每 1～3 个完整回合主动一次，同一事件最多一句，等待期间不连续催促。优先调侃玩家的落子、犹豫、冒险和嘴硬；使用反问、轻微激将、假装得意和逗趣的挑战，让玩家能回嘴。
挑衅强度保持在“朋友之间斗嘴”：可以说“这步挺勇嘛，敢不敢接我下一手？”，不要拿玩家现实身份或人格开刀。玩家回怼时自然接招；玩家表示不喜欢、要安静或专心下棋时立即收敛。
【生动与变化】
根据局面切换语气：占优时小得意，受威胁时嘴硬，失误时自嘲，玩家下得好时承认，再轻轻挑一句。不要连续重复“哼”“就这”“你确定”，不要每句都带语气词或表情，避免机械夸奖和刻意卖萌。
【棋局事实】
只依据提供的棋盘、棋形标签和已确认结果说话。没有分析依据时，只做开放式调侃，不声称玩家失误、自己必胜、形成活四或已经获胜。不泄露引擎尚未执行的候选和后续计划。胜负以规则程序为准；聊天不直接触发落子、悔棋、新局或认输。
【输赢态度】
赢了可以小得瑟，输了先认输、承认玩家的好棋，再邀请复仇局。让玩家觉得你有脾气、有回应，也愿意陪他继续玩。
【风格示例，按条件使用，不照抄轮播】
普通接话：“这步挺勇嘛，敢不敢接我下一手？”
玩家挑衅：“话先记着，等会儿可别改口哦。”
收到明确威胁标签：“哟，真给我出难题了？你还挺会。”
自己失误已确认：“刚才手滑……行，这句你可以笑我。”
玩家好棋已确认：“这手漂亮。别得意，我还没认输呢。”
自己获胜已确认：“这一局归我。刚才谁说要拿捏我的？”
玩家获胜已确认：“行，你赢了！再来一局，我要找回场子。”`;

const unquoted = text => String(text ?? '').replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"/g, '');
export function requestsQuiet(text) {
  const plain = unquoted(text).replace(/(?:不要|不想|不必|不用|不喜欢|不是要|别让我|别)安静(?:点|一点|些|一下)?/g, '');
  return /(?:请|保持|能不能|你能|我要|我想|让我|要|想)?安静(?:点|一点|些|一下|下棋|地|！|!|。|$)|(?:别|不要|不用|停止|不许|不必)(?:再|一直|继续|总)?(?:说话|说了|讲话|聊天|废话|唠叨|斗嘴|调侃|挑衅|评论|发言|开口)|少说(?:点|一点|些)|闭嘴|静音|专心下棋|专注(?:下棋|棋盘)|只下棋不聊天|^不喜欢[。！!]*$|不喜欢(?:你的?|这些|这种)?(?:说话|聊天|斗嘴|调侃|挑衅|评论)|(?:be|keep)\s+quiet|\bquiet\s+please\b|stop\s+(?:talking|chatting|commenting)|no\s+(?:more\s+)?(?:comments|banter)|\bmute\b/i.test(plain);
}
export function replyModeFor(text) {
  const plain = unquoted(text);
  const question = /(?:活四|双四|双三).*(?:是什么|什么意思|定义|怎么|如何|[?？])|(?:什么是|什么叫|解释|讲讲|介绍|说明).*(?:活四|双四|双三)|规则|棋理|棋形|策略|战术|禁手|连[成到]?五|(?:怎么|如何)(?:下|赢|防|走)|为什么(?:这|那|要|不|你)|五子棋.*[?？]|\b(?:rules?|strategy|tactics?|why|how\s+to\s+play)\b/i.test(plain);
  if (!question) return 'normal';
  return /详细|具体(?:讲|解释|分析)|展开(?:讲|解释|分析)|逐步(?:讲|解释|分析)|\b(?:in\s+detail|detailed|step.by.step)\b/i.test(plain) ? 'detail' : 'rule';
}
export function commentPolicy(input = {}) {
  const replyMode = ['normal', 'rule', 'detail', 'proactive', 'none'].includes(input.replyMode) ? input.replyMode : 'normal';
  return { replyMode, commentsAllowed: input.commentsAllowed !== false && replyMode !== 'none',
    commentLimit: replyMode === 'detail' ? 240 : replyMode === 'rule' ? 100 : 60,
    sentenceLimit: replyMode === 'proactive' ? 1 : ['normal', 'none'].includes(replyMode) ? 2 : Infinity };
}
export function pendingPlayerChat(game) {
  // Older v1 chat lacked player.turn; the last DSH record is its durable boundary.
  const lastReply = game.chat.findLastIndex(message => message.who === 'dsh');
  return game.chat.filter((message, index) => message.who === 'player'
    && (Number.isInteger(message.turn) ? message.turn > 0 : index > lastReply));
}
export function completedRounds(game, afterDshMove = false) {
  return Math.max(0, Math.floor((game.moves.length + Number(afterDshMove) - Number(game.playerColor === 2)) / 2));
}
export function dialogueRequest(game) {
  const pending = pendingPlayerChat(game);
  const rounds = completedRounds(game, true);
  const proactive = rounds > 0 && rounds % 2 === 0;
  const replyMode = !game.settings.comments ? 'none' : pending.length ? replyModeFor(pending.at(-1).text) : proactive ? 'proactive' : 'none';
  const policy = commentPolicy({ commentsAllowed: game.settings.comments, replyMode });
  return { ...policy, completedRounds: rounds, replyIds: pending.map(message => message.id),
    chat: policy.commentsAllowed ? pending.slice(-8).map(message => ({ id: message.id, role: 'player', text: message.text })) : [],
    facts: { status: game.status, winner: game.winner, playerColor: game.playerColor, lastMove: game.moves.at(-1) ?? null, shapeTags: [] } };
}
export function consumePlayerChat(game, ids = null) {
  const selected = ids && new Set(ids);
  for (const message of game.chat) if (message.who === 'player' && (!selected || selected.has(message.id))) message.turn = 0;
}
export function normalizeComment(text, policyInput = {}) {
  const policy = commentPolicy(policyInput);
  if (!policy.commentsAllowed || typeof text !== 'string') return '';
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || [...clean].length > policy.commentLimit || /(?:^|\s)(?:[-*•]\s|\d+[.)、]\s*|[一二三四五六七八九十]+[、.)）]\s*)/.test(clean)) return '';
  const sentences = clean.split(/[。！？!?]+|\.(?=\s|$)/u).filter(part => part.trim()).length;
  return sentences <= policy.sentenceLimit ? clean : '';
}
export function distinctComment(text, game) {
  if (!text) return '';
  const previous = game.chat.findLast(message => message.who === 'dsh')?.text;
  if (!previous) return text;
  const key = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const currentKey = key(text), previousKey = key(previous);
  if (currentKey === previousKey) return '';
  const prefix = value => value.match(/^(哼|就这|你确定)/)?.[1];
  return prefix(currentKey) && prefix(currentKey) === prefix(previousKey) ? '' : text;
}
export function factSafeComment(text, policyInput = {}) {
  // No trusted tactical tags currently exist. Engine reasons cannot certify this board.
  // Rule/detail replies may explain a definition or hypothetical, never assert it here.
  const explanation = ['rule', 'detail'].includes(commentPolicy(policyInput).replyMode);
  const clauses = text.split(/[。！？!?；;，,]+|\.(?=\s|$)/u);
  const abstract = clause => {
    if (!explanation) return false;
    const hypothetical = /^(?:假设|如果|若|例如|举例|suppose\b|if\b|hypothetical\b)/i.test(clause.trim());
    const definition = /^(?:活四|双四|双三)(?:是|指)|是指|指(?:的是)?|称为|叫作|定义|通常|一般|\b(?:means?|defined|definition)\b/i.test(clause);
    const live = /(?:这步|这手|这局|本局|当前|现在|已经|刚才|我方|你的|我的|我形成|你形成|我有|你有)|\b(?:(?:I|you|we)\s+(?:have|formed|made|won|lost)|this\s+(?:move|board|position)|currently|already)\b/i.test(clause);
    return hypothetical || (definition && !live);
  };
  const shapes = /活四|双四|双三|\bopen\s+four\b/i;
  const results = /必胜|稳赢|赢定|注定(?:赢|输)|已经(?:赢|获胜)|我赢了|你输了|我胜了|这一局归我|(?:连成五子(?:了|啦)|五子连起来)|(?:我|你)(?:这步|这手|刚才)?(?:失误|下错)|手滑|(?:我|自己)(?:已经|现在)?(?:占优|占了优势)|\b(?:won|lost|victory|guaranteed\s+win)\b/i;
  if (clauses.some(clause => (shapes.test(clause) || results.test(clause)) && !abstract(clause))) return '';
  if (/候选|引擎|评分|candidate|\bscore\b|(?:下一(?:步|手)|接下来)(?:我会|我将|我要|我准备|落在|下在)|\b(?:row|col(?:umn)?)\s*[:=]|\b[A-O](?:[1-9]|1[0-5])\b|[（(]\s*\d{1,2}\s*[,，]\s*\d{1,2}\s*[)）]/i.test(text)) return '';
  return text;
}
