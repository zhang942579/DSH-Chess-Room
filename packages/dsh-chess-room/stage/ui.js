import pet from '../assets/stage/whale-maid/pet.json' with {type:'json'};
import role from '../assets/stage/whale-maid/chess-role.json' with {type:'json'};
import {MotionDirector,RIGHT_PALM} from './motion-director.js';
import {measureGeometry,bubblePosition,boardPoint} from './geometry.js';
import {frameAt,frameUrl,motionTrack,palmAt} from './frames.js';
import {emptyPreview,previewFixture,PREVIEW_RELEASE} from './preview-data.js';

export const stageZh={
  motionPreview:'动作预览',motionTitle:'鲸娘 · 棋边动作台',motionSubtitle:'先看机制演出，真实棋局原样保留。',
  stageIsolated:'隔离预览 · 不提交落子，不改胜负或账号',stageMissing:'当前是位置、手掌锚点与道具组合预览，不是专用动作帧。',
  stageMissingDetail:'仍缺专用走路、取子、持子、放子、鼓脸跺脚、出拳和抱臂帧。头发、女仆头饰、衣服、鲸围裙及尾巴继续使用原形象。',
  stageMove:'预览落子',stageDefeat:'预览我赢／轻锤三下',stageSkip:'跳过演出',stageRestore:'模拟恢复（不重播）',stageReset:'清空预览',
  stageDuplicate:'重复同一事件',stageDuplicateIgnored:'重复或过期事件已忽略；没有提交任何落子。',stageRoam:'棋盘外围走一圈',
  stageAvatarMove:'移动头像',stageAvatarHide:'隐藏头像／验证退路',stageQuiet:'安静（仅此预览）',stageReduce:'减弱动态',stageDrag:'允许拖动角色',
  stageSimulated:'模拟确认结果',stageBoard:'只读演示棋盘',stageSeat:'预览座位',stageHistory:'预览台词记录',stageNoHistory:'还没有台词。',
  stagePhase:'演出阶段',stageTarget:'定位目标',stageAvatar:'头像',stageCard:'玩家卡片',stageRestpoint:'可见休息点',stageTurn:'下一手：黑棋',
  stageWinner:'示例黑棋已连成五子；不代表你的真实棋局结果。',stageReadonly:'这里的按钮只操纵独立演示状态。返回「棋室」继续原来的对局。',
  stageArtError:'动作帧加载失败，正在尝试原表情图。若仍空白请告诉我，无须自行刷新。',stageArtUnavailable:'动作帧与原表情都未能显示，当前显示占位文字；无需自行刷新。',stageSystemReduce:'系统启用了减弱动态；直接显示已确认结果。',
  stageThought:'这一手让我想想，棋盘上可不能光靠嘴硬。',stagePickup:'拿好棋子啦，只按已经确认的落点摆。',
  stageSmug:'哼，落得稳稳的。下一手就看你的啦。',stagePout:'这局五子被你连上了……我、我才没急呢。',stageInvite:'小拳拳只轻轻三下，输赢我认。要再来一局吗？',
  phaseIdle:'待机',phaseThinking:'思考',phasePickup:'取子',phaseCarrying:'持子走到交点',phasePlacing:'手掌放子',phaseSmug:'得意',phaseRetreat:'退回外围',
  phasePout:'小鼓脸',phaseStomp:'跺脚组合',phaseRunAvatar:'跑到头像旁',phasePunch:'轻锤',phaseArmsCrossed:'抱臂组合',phaseInvite:'邀请再战',phaseRoam:'外围漫游',
};
export const stageEn={
  motionPreview:'Motion preview',motionTitle:'Whale maid · Board-side stage',motionSubtitle:'Mechanism preview first; your real game stays intact.',
  stageIsolated:'Isolated preview · No move, result or account writes',stageMissing:'Position, palm-anchor and prop composition — not dedicated action poses.',
  stageMissingDetail:'Dedicated walk, take, hold, place, puff/stomp, punch and folded-arm frames are still missing. The original hair, maid headdress, outfit, whale apron and tail are retained.',
  stageMove:'Preview a move',stageDefeat:'Preview your win / three soft punches',stageSkip:'Skip animation',stageRestore:'Simulate recovery (no replay)',stageReset:'Clear preview',
  stageDuplicate:'Repeat the same event',stageDuplicateIgnored:'Duplicate or stale event ignored. No move was submitted.',stageRoam:'Roam around the board',
  stageAvatarMove:'Move avatar',stageAvatarHide:'Hide avatar / test fallback',stageQuiet:'Quiet (preview only)',stageReduce:'Reduce motion',stageDrag:'Allow character dragging',
  stageSimulated:'Simulated confirmed result',stageBoard:'Read-only demonstration board',stageSeat:'Preview seat',stageHistory:'Preview dialogue history',stageNoHistory:'No dialogue yet.',
  stagePhase:'Animation phase',stageTarget:'Target',stageAvatar:'Avatar',stageCard:'Player card',stageRestpoint:'Visible rest point',stageTurn:'Next: black',
  stageWinner:'The example black stones form five. This is not your real game result.',stageReadonly:'These controls affect only the isolated demo. Return to Room to resume your original game.',
  stageArtError:'Motion frames failed to load; trying the original expression. Please report blank art — no refresh is needed.',stageArtUnavailable:'Neither motion frames nor the original expression loaded; showing a placeholder. No refresh is needed.',stageSystemReduce:'System reduced motion is on; confirmed results are shown immediately.',
  stageThought:'Let me think. This board needs more than bravado.',stagePickup:'Stone in hand. Only the confirmed intersection counts.',
  stageSmug:'There, neatly placed. Your next move will speak for itself.',stagePout:'You connected five this time… I am not getting flustered.',stageInvite:'Just three soft taps. I accept the result. Fancy a rematch?',
  phaseIdle:'Idle',phaseThinking:'Thinking',phasePickup:'Taking stone',phaseCarrying:'Carrying to intersection',phasePlacing:'Placing by hand',phaseSmug:'Smug',phaseRetreat:'Retreating',
  phasePout:'Playful pout',phaseStomp:'Stomp composition',phaseRunAvatar:'Running beside avatar',phasePunch:'Soft punch',phaseArmsCrossed:'Folded-arm composition',phaseInvite:'Rematch invitation',phaseRoam:'Roaming',
};
const PHASE_KEYS={idle:'phaseIdle',thinking:'phaseThinking',pickup:'phasePickup',carrying:'phaseCarrying',placing:'phasePlacing',smug:'phaseSmug',retreat:'phaseRetreat',pout:'phasePout',stomp:'phaseStomp','run-avatar':'phaseRunAvatar',punch:'phasePunch','arms-crossed':'phaseArmsCrossed',invite:'phaseInvite',roam:'phaseRoam'};
export const stageCss=`
.dcr-motion-preview{max-width:1050px;margin:auto}.dcr-motion-banner{border:1px solid var(--dcr-line);background:var(--dcr-surface);padding:16px;border-radius:16px;margin-bottom:14px}.dcr-motion-banner strong{display:block;color:var(--dcr-accent,#78b9ed);margin-bottom:6px}.dcr-motion-banner p{font-size:13px;line-height:1.65;margin:4px 0}.dcr-motion-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.dcr-motion-toolbar button{font-size:12px}.dcr-motion-toggles{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px;font-size:12px}.dcr-motion-toggles label{display:flex;gap:6px;align-items:center}.dcr-motion-scene{position:relative;isolation:isolate;overflow:hidden;background:var(--dcr-surface);box-shadow:0 0 0 1px var(--dcr-line);border-radius:18px;padding:90px 26px 136px;touch-action:pan-y;min-height:390px}.dcr-motion-demo{width:min(100%,440px);margin:auto}.dcr-motion-demo .dcr-board-frame{padding:0;border:0}.dcr-motion-demo .dcr-board{width:100%;aspect-ratio:1;border:0;gap:0}.dcr-motion-scene .dcr-cell{cursor:default;opacity:1!important}.dcr-motion-labels{display:flex;justify-content:space-around;font:10px monospace;padding:4px 0;color:var(--dcr-muted)}.dcr-motion-seat{position:absolute;right:16px;top:14px;display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--dcr-surface);border:1px solid var(--dcr-line);border-radius:12px;min-width:112px;max-width:50%}.dcr-motion-seat.left{left:16px;right:auto}.dcr-motion-seat small{display:block;font-size:10px;color:var(--dcr-muted)}.dcr-motion-seat strong{font-size:12px;max-width:96px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dcr-motion-avatar-anchor{position:relative;width:40px;height:40px;flex-shrink:0}.dcr-motion-avatar-anchor .dcr-avatar{display:block;width:100%;height:100%}.dcr-motion-avatar-inner{position:relative;width:100%;height:100%;will-change:transform}.dcr-motion-art-unavailable{display:grid;place-items:center;color:var(--dcr-muted);font-size:15px}.dcr-motion-stars{position:absolute;inset:-12px;color:#f5cd75;font-size:15px;pointer-events:none}.dcr-motion-stars span:nth-child(1){position:absolute;left:-3px;top:10px}.dcr-motion-stars span:nth-child(2){position:absolute;right:-3px;top:0}.dcr-motion-stars span:nth-child(3){position:absolute;right:8px;bottom:-3px}.dcr-motion-layer,.dcr-motion-layer *{pointer-events:none}.dcr-motion-layer{position:absolute;inset:0;z-index:4;overflow:hidden}.dcr-motion-actor{position:absolute;will-change:transform;user-select:none;touch-action:none}.dcr-motion-actor[data-drag=true]{pointer-events:auto;cursor:grab}.dcr-motion-actor img{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 4px 3px #0002)}.dcr-motion-actor svg{position:absolute;inset:0;overflow:visible;width:100%;height:100%}.dcr-motion-actor.phase-stomp .dcr-motion-art{animation:dcr-preview-stomp .45s ease-in-out 1}.dcr-motion-bubble{position:absolute;box-sizing:border-box;padding:9px 12px;background:var(--dcr-surface);color:var(--dcr-text);border:1px solid var(--dcr-line);border-radius:13px;box-shadow:0 5px 16px #0002;font-size:12px;line-height:1.5;overflow:hidden}.dcr-motion-target{position:absolute;border:1px dashed #65a9df;border-radius:50%;width:18px;height:18px;transform:translate(-50%,-50%);opacity:.6}.dcr-motion-debug{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--dcr-muted);margin:12px 0}.dcr-motion-history{font-size:12px;margin:12px 0}.dcr-motion-history p{line-height:1.6}.dcr-motion-log{max-height:180px;overflow:auto}.dcr-motion-warning{font-size:12px;color:var(--dcr-muted);line-height:1.65}.dcr-motion-foot{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dcr-muted)}@keyframes dcr-preview-stomp{0%,100%{translate:0 0}35%{translate:0 -4px}70%{translate:0 2px}}@media(prefers-reduced-motion:reduce){.dcr-motion-actor.phase-stomp .dcr-motion-art{animation:none}}@container chessroom (max-width:550px){.dcr-motion-scene{padding:88px 14px 130px}.dcr-motion-toolbar button{flex:1 1 130px}.dcr-motion-banner{padding:12px}}
`;

// Factory is pure: no DOM, timers or registrations until an owned component mounts.
export function createStageArtwork(React){
  const h=React.createElement;
  function useFrame(track,runtimeId,reduced){
    const [frame,setFrame]=React.useState(()=>frameAt(pet,track,0));
    React.useEffect(()=>{
      let timer,stopped=false,start=performance.now();
      const tick=()=>{if(stopped)return;const f=frameAt(pet,track,reduced?0:performance.now()-start);setFrame(f);if(!reduced&&!document.hidden)timer=setTimeout(tick,f.duration);};
      const visibility=()=>{clearTimeout(timer);start=performance.now();tick();};
      tick();document.addEventListener('visibilitychange',visibility);
      return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
    },[track,runtimeId,reduced]);
    // A track switch must not show the old track for one render.
    return frame.track===track?frame:frameAt(pet,track,0);
  }
  function Actor({model,runtimeId,reduced,t,dragEnabled,onPointerDown,onPointerMove,onPointerUp,onArtError}){
    const track=motionTrack(role,pet,model.phase),frame=useFrame(track,runtimeId,reduced);
    const [failure,setFailure]=React.useState(0);
    React.useEffect(()=>setFailure(0),[runtimeId,track]);
    if(failure>=2)return h('div',{className:'dcr-motion-actor dcr-motion-art-unavailable',style:{width:model.width,height:model.height,transform:`translate(${model.x}px,${model.y}px)`}},'DSH');
    const base={x:RIGHT_PALM.x,y:RIGHT_PALM.y},p=palmAt(role,frame,model.facing),mirror=model.facing==='left';
    const native={x:p.x*model.width,y:p.y*model.height};
    const original={x:(mirror?1-base.x:base.x)*model.width,y:base.y*model.height};
    const contact=['placing','punch'].includes(model.phase);
    const hand={x:model.hand.x-model.x+(contact?0:native.x-original.x),y:model.hand.y-model.y+(contact?0:native.y-original.y)};
    const extension=Math.hypot(hand.x-native.x,hand.y-native.y)>1.5,stone=model.heldStone;
    const r=Math.max(3.5,model.width*.052),skin='#ffd7c6',cuff='#24475d';
    const svgChildren=[];
    if(extension){svgChildren.push(h('line',{key:'sleeve',x1:native.x,y1:native.y,x2:hand.x,y2:hand.y,stroke:cuff,strokeWidth:8,strokeLinecap:'round'}),h('circle',{key:'palm',cx:hand.x,cy:hand.y,r:5.5,fill:skin,stroke:'#c79d97',strokeWidth:.7}));}
    if(stone){svgChildren.push(h('circle',{key:'stone',cx:hand.x,cy:hand.y,r,fill:stone.color===2?'#f4f5f5':'#26303b',stroke:stone.color===2?'#8b9aab':'#111c26',strokeWidth:1}),h('path',{key:'front-fingers',d:`M ${hand.x+r*.9} ${hand.y-r*.6} q ${-r*.15} ${r} ${-r*.65} ${r*1.1}`,fill:'none',stroke:skin,strokeWidth:2.8,strokeLinecap:'round'}));}
    if(model.phase==='pout')svgChildren.push(h('ellipse',{key:'puff',cx:model.width*.23,cy:model.height*.41,rx:6,ry:4,fill:'#d7e5ee',opacity:.8}));
    if(model.phase==='arms-crossed')svgChildren.push(h('path',{key:'crossed',d:`M ${model.width*.34} ${model.height*.67} L ${model.width*.60} ${model.height*.70} M ${model.width*.65} ${model.height*.65} L ${model.width*.41} ${model.height*.70}`,stroke:cuff,strokeWidth:7,strokeLinecap:'round',fill:'none'}));
    return h('div',{className:`dcr-motion-actor phase-${model.phase}`,style:{width:model.width,height:model.height,transform:`translate(${model.x}px,${model.y}px)`},'data-drag':dragEnabled?'true':'false','data-phase':model.phase,onPointerDown,onPointerMove,onPointerUp,onPointerCancel:onPointerUp,onLostPointerCapture:onPointerUp},
      h('div',{className:'dcr-motion-art',style:{width:'100%',height:'100%'}},h('img',{src:failure===1?`/api/dsh-chess-room/avatar-v2/${track}.png?r=${encodeURIComponent(runtimeId)}`:frameUrl(pet,frame,runtimeId),alt:t('art'),draggable:false,style:{transform:mirror?'scaleX(-1)':undefined},onError:()=>{setFailure(value=>Math.min(2,value+1));onArtError(failure===0?'stageArtError':'stageArtUnavailable');}}),h('svg',{viewBox:`0 0 ${model.width} ${model.height}`,'aria-hidden':true},...svgChildren)));
  }
  return Actor;
}
export function createStagePreview(React){
  const h=React.createElement,Actor=createStageArtwork(React);
  return function CharacterStagePreview({t,profile,runtimeId,Avatar,roomRef}){
    const sceneRef=React.useRef(null),boardRef=React.useRef(null),avatarRef=React.useRef(null),cardRef=React.useRef(null),directorRef=React.useRef(null),geometryRef=React.useRef(null),dragRef=React.useRef(null);
    const idRef=React.useRef(null),versionRef=React.useRef(0),lastEventRef=React.useRef(null);
    if(idRef.current===null)idRef.current=`preview-${crypto.randomUUID()}`;
    const [game,setGame]=React.useState(()=>emptyPreview(idRef.current)),[model,setModel]=React.useState(null),[quiet,setQuiet]=React.useState(false),[reduce,setReduce]=React.useState(false),[systemReduce,setSystemReduce]=React.useState(false),[drag,setDrag]=React.useState(false),[avatarLeft,setAvatarLeft]=React.useState(false),[avatarHidden,setAvatarHidden]=React.useState(false),[notice,setNotice]=React.useState(''),[artError,setArtError]=React.useState(''),[history,setHistory]=React.useState([]);
    const measure=()=>{
      const root=sceneRef.current,v=window.visualViewport;
      const viewport={left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??window.innerWidth,height:v?.height??window.innerHeight};
      const g=measureGeometry({rootRect:root?.getBoundingClientRect(),rootSize:{width:root?.clientWidth??0,height:root?.clientHeight??0},boardRect:boardRef.current?.getBoundingClientRect(),avatarRect:avatarRef.current?.getBoundingClientRect(),cardRect:cardRef.current?.getBoundingClientRect(),roomRect:roomRef?.current?.getBoundingClientRect(),viewportRect:viewport,actorSize:{width:root?.clientWidth<380?88:108,height:root?.clientWidth<380?88:108}});
      geometryRef.current=g;return g;
    };
    React.useEffect(()=>{
      let alive=true;
      const director=new MotionDirector({measure,emit:next=>{if(alive)setModel(next);},role:{bubbles:{thinking:'stageThought',pickup:'stagePickup',smug:'stageSmug',pout:'stagePout',invite:'stageInvite'}}});
      directorRef.current=director;director.reset({gameId:idRef.current,version:versionRef.current});
      const layout=()=>director.reflow?.();
      const hidden=()=>{if(document.hidden)director.cancel('page-hidden');};
      const close=()=>director.cancel('pagehide');
      const observer=typeof ResizeObserver==='function'?new ResizeObserver(layout):null;
      for(const element of [sceneRef.current,boardRef.current,cardRef.current,avatarRef.current,roomRef?.current])if(element)observer?.observe(element);
      window.addEventListener('resize',layout);window.addEventListener('scroll',layout,true);window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',hidden);
      window.visualViewport?.addEventListener('resize',layout);window.visualViewport?.addEventListener('scroll',layout);
      const roaming=setInterval(()=>{if(!document.hidden&&!dragRef.current)director.roam();},9000);
      return()=>{alive=false;clearInterval(roaming);observer?.disconnect();window.removeEventListener('resize',layout);window.removeEventListener('scroll',layout,true);window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',hidden);window.visualViewport?.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('scroll',layout);director.dispose();directorRef.current=null;};
    },[]);
    React.useEffect(()=>{const mq=window.matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setSystemReduce(mq.matches);sync();mq.addEventListener('change',sync);return()=>mq.removeEventListener('change',sync);},[]);
    React.useEffect(()=>{directorRef.current?.setQuiet(quiet);},[quiet]);
    React.useEffect(()=>{directorRef.current?.setReducedMotion(reduce||systemReduce);},[reduce,systemReduce]);
    React.useEffect(()=>{directorRef.current?.reflow?.();},[avatarLeft,avatarHidden]);
    React.useEffect(()=>{if(model?.bubble&&!quiet)setHistory(items=>items.at(-1)===model.bubble?items:[...items.slice(-17),model.bubble]);},[model?.bubble,quiet]);
    const start=kind=>{
      const version=++versionRef.current,eventId=`${idRef.current}:${version}:${kind}`;
      const fixture=previewFixture(kind,idRef.current,version,eventId);setGame(fixture.game);lastEventRef.current=fixture.event;setNotice('');
      const d=directorRef.current;d.reset({gameId:idRef.current,version});kind==='move'?d.playMove(fixture.event):d.playDefeat(fixture.event);
    };
    const restore=()=>{directorRef.current?.reset({gameId:idRef.current,version:++versionRef.current});setNotice('stageRestore');};
    const clear=()=>{directorRef.current?.reset({gameId:idRef.current,version:++versionRef.current});setGame(emptyPreview(idRef.current,versionRef.current));lastEventRef.current=null;setNotice('');};
    const repeat=()=>{const event=lastEventRef.current;if(!event)return;const accepted=event.kind==='human-victory'?directorRef.current.playDefeat(event):directorRef.current.playMove(event);if(!accepted)setNotice('stageDuplicateIgnored');};
    const pointerDown=e=>{if(!drag||directorRef.current?.busy||e.button!==0)return;const g=measure();dragRef.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,origin:{x:model.x,y:model.y},scale:g.scale};e.currentTarget.setPointerCapture(e.pointerId);directorRef.current.cancel('drag-start');};
    const pointerMove=e=>{const p=dragRef.current;if(!p||p.pointerId!==e.pointerId)return;if(!drag||directorRef.current?.busy){dragRef.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);return;}directorRef.current.dragTo({x:p.origin.x+(e.clientX-p.x)/p.scale.x,y:p.origin.y+(e.clientY-p.y)/p.scale.y});};
    const pointerUp=e=>{if(dragRef.current?.pointerId===e.pointerId){dragRef.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}};
    const geometry=geometryRef.current,bubble=model&&geometry?bubblePosition(geometry,model,{width:210,height:68}):null;
    const feedback=model?.avatarFeedback,punch=feedback?.pulseId?.split(':').at(-1),target=geometry?.avatarTarget;
    const cells=[];
    for(let row=14;row>=0;row--)for(let col=0;col<15;col++){
      const move=game.moves.find(m=>m.row===row&&m.col===col),hidden=move?.moveId===model?.hiddenMoveId,color=hidden?0:game.board[row][col];
      const star=[3,7,11].includes(row)&&[3,7,11].includes(col),winning=game.winningLine.some(m=>m.row===row&&m.col===col);
      cells.push(h('button',{key:`${row}:${col}`,type:'button',disabled:true,className:`dcr-cell${row===14?' edge-top':''}${row===0?' edge-bottom':''}${col===0?' edge-left':''}${col===14?' edge-right':''}${winning?' winning':''}`,title:`${String.fromCharCode(65+col)}${row+1}`,'aria-label':`${String.fromCharCode(65+col)}${row+1} · ${color?t(color===2?'white':'black'):t('stageBoard')}`},star?h('span',{className:'dcr-star','aria-hidden':true}):null,color?h('span',{className:`dcr-piece${color===2?' white':''}`,'aria-hidden':true}):null));
    }
    const button=(key,action,disabled=false)=>h('button',{type:'button',key,onClick:action,disabled},t(key));
    const toggle=(key,value,set)=>h('label',{key},h('input',{type:'checkbox',checked:value,onChange:e=>set(e.target.checked)}),t(key));
    return h('section',{className:'dcr-motion-preview','data-dcr-stage-release':PREVIEW_RELEASE},
      h('style',null,stageCss),h('div',{className:'dcr-motion-banner'},h('strong',null,t('stageIsolated')),h('p',null,t('stageMissing')),h('p',{className:'dcr-motion-warning'},t('stageMissingDetail'))),
      h('div',{className:'dcr-motion-toolbar'},button('stageMove',()=>start('move')),button('stageDefeat',()=>start('defeat')),button('stageSkip',()=>directorRef.current?.skip()),button('stageRestore',restore),button('stageReset',clear),button('stageDuplicate',repeat,!lastEventRef.current),button('stageRoam',()=>directorRef.current?.roam()),button('stageAvatarMove',()=>setAvatarLeft(v=>!v)),button('stageAvatarHide',()=>setAvatarHidden(v=>!v))),
      h('div',{className:'dcr-motion-toggles'},toggle('stageQuiet',quiet,setQuiet),toggle('stageReduce',reduce,setReduce),toggle('stageDrag',drag,setDrag)),
      h('div',{className:'dcr-motion-scene',ref:sceneRef},
        h('div',{className:`dcr-motion-seat${avatarLeft?' left':''}`,ref:cardRef},h('div',{className:'dcr-motion-avatar-anchor',ref:avatarRef,style:{display:avatarHidden?'none':undefined}},h('div',{className:'dcr-motion-avatar-inner',style:{transform:feedback?`translateX(${feedback.shake}px) rotate(${feedback.shake*.8}deg)`:undefined}},h(Avatar,{profile,t})),feedback?h('div',{className:'dcr-motion-stars','aria-hidden':true},[0,1,2].map(i=>h('span',{key:i},'✦'))):null),h('div',null,h('small',null,t('stageSeat')),h('strong',null,profile?.name||t('player')))),
        h('div',{className:'dcr-motion-demo'},h('div',{className:'dcr-motion-labels'},Array.from({length:15},(_,i)=>h('span',{key:i},String.fromCharCode(65+i)))),h('div',{className:'dcr-board',ref:boardRef,'aria-label':t('stageBoard')},...cells)),
        model?h('div',{className:'dcr-motion-layer','aria-hidden':true},h(Actor,{model,runtimeId,reduced:reduce||systemReduce,t,dragEnabled:drag&&!directorRef.current?.busy,onPointerDown:pointerDown,onPointerMove:pointerMove,onPointerUp:pointerUp,onArtError:key=>setArtError(key)}),!quiet&&model.bubble&&bubble?h('div',{className:'dcr-motion-bubble',style:{left:bubble.x,top:bubble.y,width:bubble.width,height:bubble.height}},t(model.bubble)):null,target&&model.phase==='punch'?h('div',{className:'dcr-motion-target',style:{left:target.x,top:target.y}}):null):null),
      h('div',{className:'dcr-motion-debug'},h('span',null,`${t('stagePhase')}：${t(PHASE_KEYS[model?.phase]??'phaseIdle')}${model?.phase==='punch'&&punch?` ${punch}/3`:''}`),h('span',null,`${t('stageTarget')}：${t(target?.source==='avatar'?'stageAvatar':target?.source==='card'?'stageCard':'stageRestpoint')}`),h('span',null,t(game.status==='won'?'stageWinner':'stageTurn'))),
      notice?h('p',{role:'status',className:'dcr-motion-warning'},t(notice)):null,artError?h('p',{role:'status',className:'dcr-motion-warning'},t(artError)):null,systemReduce?h('p',{className:'dcr-motion-warning'},t('stageSystemReduce')):null,
      h('details',{className:'dcr-motion-history'},h('summary',null,t('stageHistory')),h('div',{className:'dcr-motion-log'},history.length?history.map((key,i)=>h('p',{key:i},t(key))):h('p',null,t('stageNoHistory')))),
      h('div',{className:'dcr-motion-foot'},h('span',null,t('stageReadonly')),h('span',null,PREVIEW_RELEASE)));
  };
}
