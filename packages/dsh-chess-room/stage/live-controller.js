import {MotionDirector} from './motion-director.js';
import {LiveEventFence} from './live-events.js';

const bubbles=()=>({thinking:'',pickup:'',smug:'',pout:'stagePout',invite:'stageInvite'});
// Only a bounded, already-confirmed Host comment is reused. No extra proactive
// line is manufactured on every move: original Host dialogue cadence stays intact.
export function committedComment(snapshot,event){
  const index=snapshot?.game?.moves?.findIndex(m=>m.moveId===event.moveId)??-1;
  if(index<0||snapshot?.settings?.comments===false)return '';
  const message=snapshot.game.chat?.filter(m=>m.who==='dsh'&&m.turn===index+1).at(-1);
  return typeof message?.text==='string'&&Array.from(message.text).length<=60?message.text:'';
}

/** Pure orchestration. It has no RPC, DOM, mutation callback, or completion ACK. */
export class LiveStageController{
  constructor({measure,emit=()=>{},clock,actionProfile}={}){
    this.measure=measure;this.emit=emit;this.clock=clock;this.actionProfile=actionProfile;this.fence=new LiveEventFence();
    this.director=null;this.snapshot=null;this.enabled=false;this.online=false;
    this.quiet=false;this.reduced=false;this.disposed=false;this.model=null;
  }
  _create(gameId,version){
    this.director?.dispose();
    this.director=new MotionDirector({measure:this.measure,clock:this.clock,actionProfile:this.actionProfile,role:{bubbles:bubbles()},emit:model=>{this.model=model;this.emit(model);}});
    this.director.setQuiet(this.quiet);this.director.setReducedMotion(this.reduced);
    this.director.reset({gameId,version});
  }
  _apply(actions){
    for(const action of actions){
      if(action.type==='cancel')this.director?.cancel(action.reason);
      else if(action.type==='authority'&&action.reset)this._create(action.gameId,action.version);
      else if(action.type==='move'&&this.enabled&&this.online){
        if(!this.director)continue;
        this.director.role={bubbles:{...bubbles(),smug:committedComment(this.snapshot,action.event)}};
        this.director.playMove(action.event);
      }else if(action.type==='defeat'&&this.enabled&&this.online){
        if(!this.director)continue;
        this.director.role={bubbles:bubbles()};this.director.playDefeat(action.event);
      }
    }
    return actions;
  }
  ingest(snapshot,{enabled=true,online=true,quiet=false,reduced=false}={}){
    if(this.disposed)return [];
    const changed=enabled!==this.enabled||online!==this.online;
    this.snapshot=snapshot?structuredClone(snapshot):null;
    this.enabled=enabled;this.online=online;this.quiet=quiet||snapshot?.settings?.comments===false;this.reduced=!!reduced;
    this.director?.setQuiet(this.quiet);this.director?.setReducedMotion(this.reduced);
    if(!online||!snapshot){return this._apply(this.fence.disconnect());}
    return this._apply(this.fence.consume(this.snapshot,{busy:this.director?.busy??false,reconnect:changed||!enabled||this.reduced}));
  }
  drain(){
    if(this.disposed||!this.enabled||!this.online)return [];
    return this._apply(this.fence.drain({busy:this.director?.busy??false}));
  }
  cancel(reason='user-cancel'){
    if(this.disposed)return;
    // Discard all already-observed queued events as well, never replay after skip.
    if(this.snapshot)this._apply(this.fence.consume(this.snapshot,{reconnect:true}));
    this.director?.cancel(reason);
  }
  setQuiet(value){this.quiet=!!value;this.director?.setQuiet(this.quiet);}
  reflow(){this.director?.reflow();}
  roam(){if(this.enabled&&this.online&&!this.snapshot?.aiThinking)this.director?.roam();}
  dragTo(point){this.director?.dragTo(point);}
  get busy(){return !!this.director?.busy;}
  dispose(){if(this.disposed)return;this.disposed=true;this.director?.dispose();this.fence.disconnect();this.director=null;}
}
