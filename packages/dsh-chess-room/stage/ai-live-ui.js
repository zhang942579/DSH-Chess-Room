import {createLiveStage as createBaseLiveStage} from './live-ui.js';
import {LiveStageController} from './live-controller.js';
import {AI_ACTION_PROFILE,AI_RELEASE,AI_HAS_IDLE} from './ai-actions.js';
import {createAiStageArtwork} from './ai-artwork.js';
export const LIVE_RELEASE=AI_RELEASE;
export const liveStageZh={
  liveStageTitle:'棋边鲸娘',liveStageMechanism:(AI_HAS_IDLE?'八组 AI 专用动作（含独立待机）':'七组 AI 专用动作（待机素材尚未接入）')+' · 已确认棋步驱动',
  liveStageReduce:'减弱动态',liveStageDrag:'允许拖动角色',liveStageRoam:'空闲时外围漫游',
  liveStageMuted:'安静时立即收起舞台台词；不会补交或重放棋步。',
  liveStageReplay:'复盘、记录和预览期间不演出真实棋局历史。',
  motionPreview:'旧机制预览',motionSubtitle:'这是旧版组合机制预览，不是 AI 专用动作的实时画面。',
  stageMissing:'已接入素材与保留的组合部分',
  stageMissingDetail:'已使用你授权的 AI 走路、取子、持子、放子、鼓脸跺脚、轻拳与抱臂帧。持子移动仍为路径组合；原表情继续保留。放子到接触帧后交给棋盘显示，避免后续帧重复的地面棋子。轻拳裁成单击片段，恰好三次。'
};
export const liveStageEn={
  liveStageTitle:'Board-side whale maid',liveStageMechanism:(AI_HAS_IDLE?'Eight AI tracks including independent idle':'Seven AI action tracks; idle assets pending')+' · Confirmed moves only',
  liveStageReduce:'Reduce motion',liveStageDrag:'Allow dragging',liveStageRoam:'Roam at rest',
  liveStageMuted:'Quiet hides dialogue immediately; no replay or move submission.',
  liveStageReplay:'Replay, records and previews never animate real-game history.',
  motionPreview:'Legacy mechanism preview',motionSubtitle:'Legacy composition preview, not the AI-action live stage.',
  stageMissing:'Connected assets and retained composition',
  stageMissingDetail:'Your authorized AI walk, take, hold, place, pout/stomp, punch and folded-arm tracks are connected. Carrying still uses path composition; expression tracks remain. Placement hands over to the board after contact, excluding late duplicate ground stones. Punches use a single-strike subclip repeated exactly three times.'
};
export class AiLiveStageController extends LiveStageController{
  constructor(options={}){super({...options,actionProfile:options.actionProfile??AI_ACTION_PROFILE});this.ambientAllowed=false;}
  _syncAmbient(){
    this.director?.setAmbientEnabled(this.ambientAllowed&&this.enabled&&this.online
      &&!this.reduced&&!this.snapshot?.aiThinking);
  }
  setAmbientEnabled(value){this.ambientAllowed=!!value;this._syncAmbient();}
  ingest(snapshot,options){const result=super.ingest(snapshot,options);this._syncAmbient();return result;}
  drain(){const result=super.drain();this._syncAmbient();return result;}
  cancel(reason){this.setAmbientEnabled(false);return super.cancel(reason);}
  dragTo(point){this.setAmbientEnabled(false);return super.dragTo(point);}
  dispose(){this.setAmbientEnabled(false);super.dispose();}
}
export function createLiveStage(React){
  return createBaseLiveStage(React,{Artwork:createAiStageArtwork,Controller:AiLiveStageController,
    release:AI_RELEASE,cancelOnArtError:true,actorScale:4/3,safeRest:true});
}
