import {createStageArtwork as createLegacyArtwork} from './ui.js';
import {sampleAiAction,AI_MANIFEST,AI_RELEASE,PLACE_RELEASE,AI_TIME_SCALE,aiSourceElapsed} from './ai-actions.js';
import {AI_FRAME_URLS} from './ai-assets-generated.js';
import {RIGHT_PALM} from './motion-director.js';

export function aiFrameUrl(pose,color=2){
  const urls=AI_FRAME_URLS[pose.track]?.[color===1?'black':'white'];
  const url=urls?.[pose.index];
  if(!url?.startsWith('data:image/'))throw new Error('undeclared-ai-frame');
  return url;
}
// Native React only; controller drives pose selection. No animation timer/RPC.
export function createAiStageArtwork(React){
  const h=React.createElement,LegacyActor=createLegacyArtwork(React);
  function Actor(props){
    const {model,runtimeId,reduced,t,dragEnabled,onPointerDown,onPointerMove,onPointerUp,onArtError}=props;
    const pose=reduced?null:sampleAiAction(model);
    const [failed,setFailed]=React.useState(false),alive=React.useRef(true),errorGuard=React.useRef('');
    const signature=`${runtimeId}:${model.gameId}:${model.version}:${pose?.track}:${pose?.cycleKey}:${pose?.index}`;
    errorGuard.current=signature;
    React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    React.useEffect(()=>setFailed(false),[runtimeId,model.eventId,model.phase]);
    React.useEffect(()=>{
      if(!pose||document.hidden)return;
      // Only the active track/color is warmed. Decode completion never advances
      // pose/time, restores a masked move, or invokes a gameplay operation.
      const images=AI_FRAME_URLS[pose.track][model.stoneColor===1?'black':'white'].map(src=>{
        const image=new Image();image.src=src;image.decode?.().catch(()=>{});return image;
      });
      return()=>{for(const image of images){image.onload=null;image.onerror=null;image.src='';}};
    },[pose?.track,model.stoneColor,runtimeId]);
    if(!pose||failed){
      const phase=model.phase==='placing'&&aiSourceElapsed(model.phaseElapsed,model.timeScale??AI_TIME_SCALE)>=PLACE_RELEASE/AI_TIME_SCALE?'smug':model.phase;
      // Clean fallback: suppress legacy sleeves/stones/crossed-arm overlays for
      // dedicated phases and during handover; do not draw over baked artwork.
      const legacyPhase=['pickup','carrying','pout','stomp','punch','arms-crossed','retreat','roam','run-avatar'].includes(phase)?'idle':phase;
      const clean={...model,phase:legacyPhase,facing:'right',heldStone:null,
        hand:{x:model.x+model.width*RIGHT_PALM.x,y:model.y+model.height*RIGHT_PALM.y}};
      return h(LegacyActor,{...props,model:clean});
    }
    return h('div',{className:`dcr-motion-actor phase-${model.phase}`,
      style:{width:model.width,height:model.height,transform:`translate(${model.x}px,${model.y}px)`},
      'data-drag':dragEnabled?'true':'false','data-phase':model.phase,
      'data-dcr-ai-track':pose.track,'data-dcr-ai-frame':pose.index+1,
      'data-dcr-ai-cycle':pose.cycleKey,'data-dcr-ai-generation':AI_RELEASE,
      onPointerDown,onPointerMove,onPointerUp,onPointerCancel:onPointerUp,onLostPointerCapture:onPointerUp},
      h('div',{className:'dcr-motion-art',style:{width:'100%',height:'100%'}},
        h('img',{key:signature,src:aiFrameUrl(pose,model.stoneColor),alt:t('art'),draggable:false,
          style:{transform:pose.mirror?'scaleX(-1)':undefined},
          onError:()=>{if(!alive.current||errorGuard.current!==signature)return;
            setFailed(true);onArtError('stageArtError');}})));
  }
  return Actor;
}
export {AI_MANIFEST};
