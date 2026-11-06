import {createStageArtwork,stageCss,stageZh} from './ui.js';
import {measureGeometry,bubblePosition} from './geometry.js';
import {LiveStageController} from './live-controller.js';
export const LIVE_RELEASE='1.1.0';
export const liveStageZh={liveStageTitle:'棋边鲸娘',liveStageMechanism:'已确认事件驱动 · 动作仍为机制组合',liveStageReduce:'减弱动态',liveStageDrag:'允许拖动角色',liveStageRoam:'空闲时外围漫游',liveStageMuted:'安静时立即收起舞台台词；不会补交或重放棋步。',liveStageReplay:'复盘、记录和预览期间不演出真实棋局历史。'};
export const liveStageEn={liveStageTitle:'Board-side whale maid',liveStageMechanism:'Confirmed events · Composed mechanisms, not dedicated poses',liveStageReduce:'Reduce motion',liveStageDrag:'Allow dragging',liveStageRoam:'Roam at rest',liveStageMuted:'Quiet hides dialogue immediately; no replay or move submission.',liveStageReplay:'Replay, records and previews never animate real-game history.'};
export const liveCss=`
.dcr[data-dcr-stage-live]{position:relative;isolation:isolate}
.dcr-live-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:6}
.dcr-live-layer .dcr-motion-actor{position:absolute;left:0;top:0;pointer-events:none}
.dcr-live-layer .dcr-motion-actor[data-drag=true]{pointer-events:auto;touch-action:none;cursor:grab}
.dcr-live-layer .dcr-motion-bubble{position:absolute;pointer-events:none}
.dcr-live-controls strong{display:block;margin-bottom:8px}.dcr-live-controls small{display:block;color:var(--dcr-muted);line-height:1.6}
.dcr-live-controls label{display:flex;gap:7px;align-items:center;font-size:12px;margin-top:7px}
.dcr-live-controls button{margin-top:9px;font-size:12px}.dcr-live-controls details{font-size:11px;margin-top:8px}
.dcr-live-avatar{position:relative;flex-shrink:0;width:52px;height:52px}
.dcr-live-avatar-inner{width:100%;height:100%;will-change:transform}
.dcr-live-avatar .dcr-avatar{width:100%;height:100%;display:block}
.dcr-live-avatar .dcr-motion-stars{position:absolute;inset:-8px;pointer-events:none}
.dcr-live-avatar .dcr-motion-stars span{position:absolute;color:var(--dcr-accent);font-size:13px}
.dcr-live-avatar .dcr-motion-stars span:nth-child(1){left:0;top:0}.dcr-live-avatar .dcr-motion-stars span:nth-child(2){right:0;top:4px}.dcr-live-avatar .dcr-motion-stars span:nth-child(3){right:4px;bottom:0}
.dcr-live-fallback-stars{position:absolute;font-size:14px;color:var(--dcr-accent);pointer-events:none}
`;

// Enlargement belongs to measured geometry, not a CSS transform. Legacy defaults
// are identical; AI-only callers may compromise scale to keep a genuine free band.
export function measureLiveGeometry(input,{actorScale=1,safeRest=false}={}){
  const base=input.rootSize?.width<480?88:108;
  const scale=Number.isFinite(actorScale)&&actorScale>0&&actorScale<=4?actorScale:1;
  const measure=size=>measureGeometry({...input,actorSize:{width:size,height:size}});
  let g=measure(base*scale);
  if(!safeRest)return g;
  if(g.visible&&g.board){
    const b=g.bounds,board=g.board;
    const available=Math.max(board.left-b.left,b.right-board.right,board.top-b.top,b.bottom-board.bottom,0);
    const fitted=Math.min(base*scale,b.width,b.height,available);
    // Never shrink to a meaningless sliver just to claim safe visible artwork.
    if(fitted>=Math.min(base,48)&&fitted<g.actorSize.width)g=measure(fitted);
  }
  const p=g.home,b=g.board;
  g.safeIdle=!!g.visible&&(!b||p.x+g.actorSize.width<=b.left||p.x>=b.right
    ||p.y+g.actorSize.height<=b.top||p.y>=b.bottom);
  if(!g.safeIdle)g.perimeter=[];
  return g;
}
export function safeLiveActorRest(geometry,model){
  const b=geometry?.board;
  return !!geometry?.visible&&geometry.safeIdle!==false&&(!b||model.x+model.width<=b.left
    ||model.x>=b.right||model.y+model.height<=b.top||model.y>=b.bottom);
}

export function createLiveStage(React,{Artwork=createStageArtwork,Controller=LiveStageController,release=LIVE_RELEASE,cancelOnArtError=false,actorScale=1,safeRest=false}={}){
  const h=React.createElement,Actor=Artwork(React),stageRelease=release;
  function CharacterStageControls({t,apiRef,prefs,onPrefs,visual,enabled}){
    const toggle=(key,name)=>h('label',{key},h('input',{type:'checkbox',checked:!!prefs[name],disabled:!enabled,onChange:e=>onPrefs(old=>({...old,[name]:e.target.checked}))}),t(key));
    return h('section',{className:'dcr-card dcr-live-controls','data-dcr-live-controls':release},h('strong',null,t('liveStageTitle')),h('small',null,t('liveStageMechanism')),
      toggle('liveStageReduce','reduce'),toggle('liveStageDrag','drag'),toggle('liveStageRoam','roam'),
      h('button',{type:'button',disabled:!enabled||!visual?.model||visual.model.phase==='idle',onClick:()=>apiRef.current?.cancel('skip')},t('stageSkip')),
      visual?.artError?h('small',{role:'status'},t(visual.artError)):null,visual?.systemReduce?h('small',null,t('stageSystemReduce')):null,
      h('details',null,h('summary',null,t('stageMissing')),h('p',null,t('stageMissingDetail')),h('p',null,t(enabled?'liveStageMuted':'liveStageReplay'))));
  }
  function CharacterStageLive({snapshot,enabled,online,quiet,prefs,t,rootRef,boardRef,avatarRef,cardRef,apiRef,onVisual,interactionBusy=false}){
    const controllerRef=React.useRef(null),geometryRef=React.useRef(null),dragRef=React.useRef(null),propsRef=React.useRef(null),signatureRef=React.useRef('');
    const [model,setModel]=React.useState(null),[artError,setArtError]=React.useState(''),[systemReduce,setSystemReduce]=React.useState(false);
    propsRef.current={snapshot,enabled,online,quiet,prefs,t,onVisual,artError,systemReduce,interactionBusy};
    const report=next=>{
      const p=propsRef.current,f=next?.avatarFeedback;
      const sig=JSON.stringify([next?.phase,next?.hiddenMoveId,next?.eventId,next?.gameId,next?.version,f?.pulseId,f?.shake,p.artError,p.systemReduce]);
      if(sig!==signatureRef.current){signatureRef.current=sig;p.onVisual({model:next,artError:p.artError,systemReduce:p.systemReduce});}
    };
    const measure=()=>{
      const root=rootRef.current,v=window.visualViewport;
      const g=measureLiveGeometry({rootRect:root?.getBoundingClientRect(),rootSize:{width:root?.clientWidth??0,height:root?.clientHeight??0},boardRect:boardRef.current?.getBoundingClientRect(),avatarRect:avatarRef.current?.getBoundingClientRect(),cardRect:cardRef.current?.getBoundingClientRect(),roomRect:root?.getBoundingClientRect(),viewportRect:{left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??window.innerWidth,height:v?.height??window.innerHeight}},{actorScale,safeRest});
      geometryRef.current=g;return g;
    };
    React.useEffect(()=>{
      let alive=true;
      const controller=new Controller({measure,emit:next=>{if(alive){setModel(next);report(next);}}});controllerRef.current=controller;
      apiRef.current={cancel:reason=>{clearCapture();return controller.cancel(reason);},setQuiet:value=>controller.setQuiet(value)};
      const observed=new Set(),observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>layout()):null;
      const syncAmbient=()=>{
        const p=propsRef.current;
        controller.setAmbientEnabled?.(alive&&p.enabled&&p.online&&!document.hidden&&!p.prefs.reduce
          &&!p.systemReduce&&!p.artError&&!p.interactionBusy&&!p.snapshot?.aiThinking&&!dragRef.current);
      };
      controller.syncAmbient=syncAmbient;
      const layout=()=>{
        const targets=new Set([rootRef.current,boardRef.current,avatarRef.current,cardRef.current].filter(Boolean));
        for(const element of observed)if(!targets.has(element)){observer?.unobserve(element);observed.delete(element);}
        for(const element of targets)if(!observed.has(element)){observer?.observe(element);observed.add(element);}
        controller.reflow();syncAmbient();
      };
      controller.layout=layout;
      // Visibility return only reflows: FIRST fresh native poll must establish
      // the reconnect baseline before missed-history fences/ambient can resume.
      const hidden=()=>{clearCapture();if(document.hidden){controller.cancel('page-hidden');controller.ingest(propsRef.current.snapshot,{enabled:false,online:false,quiet:propsRef.current.quiet,reduced:propsRef.current.prefs.reduce||propsRef.current.systemReduce});}else layout();};
      const close=()=>{clearCapture();controller.cancel('pagehide');};
      window.addEventListener('resize',layout);window.addEventListener('scroll',layout,true);window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',hidden);
      window.visualViewport?.addEventListener('resize',layout);window.visualViewport?.addEventListener('scroll',layout);
      const mq=window.matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setSystemReduce(mq.matches);sync();mq.addEventListener('change',sync);
      const roaming=setInterval(()=>{const p=propsRef.current;if(!document.hidden&&!p.interactionBusy&&!p.artError&&!p.prefs.reduce&&!p.systemReduce&&p.prefs.roam&&!dragRef.current)controller.roam();},9000);
      layout();
      return()=>{alive=false;clearCapture();clearInterval(roaming);observer?.disconnect();mq.removeEventListener('change',sync);window.removeEventListener('resize',layout);window.removeEventListener('scroll',layout,true);window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',hidden);window.visualViewport?.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('scroll',layout);controller.dispose();controllerRef.current=null;apiRef.current=null;propsRef.current.onVisual({model:null,artError:'',systemReduce:false});};
    },[]);
    React.useEffect(()=>{
      const c=controllerRef.current;c?.ingest(snapshot,{enabled:enabled&&!document.hidden,online,quiet,reduced:prefs.reduce||systemReduce});c?.layout();
    },[snapshot,enabled,online,quiet,prefs.reduce,systemReduce]);
    React.useEffect(()=>{if(controllerRef.current?.busy)clearCapture();else if(!dragRef.current)controllerRef.current?.drain();controllerRef.current?.syncAmbient?.();},[model?.phase,enabled]);
    React.useEffect(()=>{controllerRef.current?.syncAmbient?.();},[enabled,online,prefs.reduce,systemReduce,artError,interactionBusy,snapshot?.aiThinking]);
    React.useEffect(()=>{clearCapture();},[enabled,online,snapshot?.runtimeId,snapshot?.game?.id,snapshot?.stage?.epoch,prefs.drag,interactionBusy]);
    React.useEffect(()=>{
      report(controllerRef.current?.model);
    },[artError,systemReduce]);
    React.useEffect(()=>{setArtError('');},[snapshot?.runtimeId]);
    const clearCapture=()=>{const p=dragRef.current;dragRef.current=null;if(p?.element?.hasPointerCapture?.(p.pointerId))p.element.releasePointerCapture(p.pointerId);if(p)controllerRef.current?.syncAmbient?.();};
    const release=e=>{if(dragRef.current?.pointerId===e.pointerId)clearCapture();};
    const down=e=>{
      const c=controllerRef.current;if(!prefs.drag||interactionBusy||c?.busy||e.button!==0||!model)return;
      const g=measure();dragRef.current={pointerId:e.pointerId,element:e.currentTarget,x:e.clientX,y:e.clientY,origin:{x:model.x,y:model.y},scale:g.scale};e.currentTarget.setPointerCapture(e.pointerId);c.cancel('drag-start');
    };
    const move=e=>{const p=dragRef.current,c=controllerRef.current;if(!p||p.pointerId!==e.pointerId)return;if(!prefs.drag||interactionBusy||c?.busy){release(e);return;}c.dragTo({x:p.origin.x+(e.clientX-p.x)/p.scale.x,y:p.origin.y+(e.clientY-p.y)/p.scale.y});};
    const geometry=geometryRef.current,bubble=model&&geometry?bubblePosition(geometry,model,{width:210,height:68}):null;
    const displayModel=model&&snapshot?.aiThinking&&model.phase==='idle'?{...model,phase:'thinking'}:model;
    const text=model?.bubble?(Object.hasOwn(stageZh,model.bubble)?t(model.bubble):model.bubble):null;
    return h(React.Fragment,null,h('style',null,stageCss+liveCss),enabled&&online&&model&&(!safeRest||!['idle','roam'].includes(model.phase)||safeLiveActorRest(geometry,model))?h('div',{className:'dcr-live-layer','data-dcr-live-stage':stageRelease},
      h(Actor,{model:displayModel,runtimeId:snapshot.runtimeId,reduced:prefs.reduce||systemReduce,t,dragEnabled:prefs.drag&&!interactionBusy&&!controllerRef.current?.busy,onPointerDown:down,onPointerMove:move,onPointerUp:release,onArtError:message=>{
        // Cosmetic failure must reveal a masked confirmed move EACH time, even
        // when React would bail out of a repeated identical error string.
        propsRef.current.artError=message;controllerRef.current?.setAmbientEnabled?.(false);
        if(cancelOnArtError)controllerRef.current?.cancel('art-unavailable');
        setArtError(message);
      }}),
      text&&!quiet&&snapshot?.settings?.comments!==false&&bubble?h('div',{className:'dcr-motion-bubble',style:{left:bubble.x,top:bubble.y,width:bubble.width,maxHeight:bubble.height},'aria-live':'polite'},text):null,
      model.avatarFeedback&&geometry?.avatarTarget?.source!=='avatar'?h('div',{className:'dcr-live-fallback-stars','aria-hidden':true,style:{left:geometry?.avatarTarget?.x??0,top:geometry?.avatarTarget?.y??0}},'✦ ✦ ✦'):null):null);
  }
  return {CharacterStageLive,CharacterStageControls};
}
