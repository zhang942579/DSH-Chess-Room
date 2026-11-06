import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
// Test a staged executable before replacing the live artifact; default is the real published Client.
const source=await readFile(new URL(`../${process.env.DCR_TEST_CLIENT || 'client.js'}`,import.meta.url),'utf8');
function fixture(){let registeredFactory;const dictionaries=new Map(),occupants=[],disposers=[];let active='zh';const ctx={effect(factory){const dispose=factory();disposers.push(dispose);return dispose;},locale:{getLocale(){return {active,locales:[],revision:1};},register(ns,language,dict){const key=`${ns}:${language}`;assert.ok(!dictionaries.has(key),'no duplicate dictionaries');dictionaries.set(key,dict);return()=>dictionaries.delete(key);},bind(ns){return key=>(dictionaries.get(`${ns}:${active}`)||dictionaries.get(`${ns}:en`))[key]||key;}},slots:{inject(_name,callback){const dispose=callback();disposers.push(dispose);return dispose;},register(options,component){const entry={options,component};occupants.push(entry);return()=>{const index=occupants.indexOf(entry);if(index>=0)occupants.splice(index,1);};}}};const sandbox={window:{__ModuleLoader__:{load(value){registeredFactory=value;}}}};vm.runInNewContext(source,sandbox,{filename:'client.js'});const exported=registeredFactory.factory(id=>{assert.equal(id,'react');return {createElement(){throw new Error('Registration tests must not render UI');}};});return {registeredFactory,exported,ctx,occupants,dictionaries,setLocale(id){active=id;},dispose(){for(const cleanup of disposers.splice(0).reverse())cleanup();}};}
test('browser factory registers only its package, and stays free of DOM/render side effects',()=>{const f=fixture();assert.equal(f.registeredFactory.id,'@local/dsh-chess-room');assert.deepEqual([...f.exported.inject],['slots','locale']);assert.equal(f.occupants.length,0);assert.equal(f.dictionaries.size,0);});
test('Client applies against an object LocaleSnapshot and registers owned main/sidebar cells',()=>{const f=fixture();f.exported.apply(f.ctx);const main=f.occupants.find(v=>v.options.name==='main'),sidebar=f.occupants.find(v=>v.options.name==='sidebar.panellist');assert.equal(main.options.key,'dsh-chess-room');assert.equal(sidebar.options.id,'dsh-chess-room');assert.equal(sidebar.options.label(),'DSH 棋室');f.setLocale('en');assert.equal(sidebar.options.label(),'DSH Chess Room');f.dispose();});
test('Client unload cleans dictionaries/slots and can be applied again without refresh',()=>{const f=fixture();f.exported.apply(f.ctx);assert.equal(f.dictionaries.size,2);f.dispose();assert.equal(f.dictionaries.size,0);assert.equal(f.occupants.length,0);f.exported.apply(f.ctx);assert.equal(f.occupants.length,2);f.dispose();});
test('Client serializes active locale id and scopes runtime revisions across Host recovery',()=>{assert.ok(source.includes('locale:locale.getLocale().active'));assert.ok(source.includes('next.runtimeId===stateRef.current.runtimeId'));assert.ok(source.includes("h('style',null,css)"));assert.ok(!source.includes('document.head'));assert.ok(source.includes("new URL('/api/dsh-chess-room',window.location.href)"));});

test('reference board presents 15–1 without changing authoritative A1–O15 coordinates',()=>{
  const model=fixture().exported.viewModel;
  assert.deepEqual([...model.boardRows],Array.from({length:15},(_,index)=>14-index));
  assert.equal(model.coordinate({row:model.boardRows[0],col:0}),'A15');
  assert.equal(model.coordinate({row:model.boardRows.at(-1),col:14}),'O1');
  assert.equal(model.coordinate({row:7,col:7}),'H8');
  const labels=new Set();
  for(const row of model.boardRows)for(let col=0;col<15;col++)labels.add(model.coordinate({row,col}));
  assert.equal(labels.size,225);
  assert.ok(Object.isFrozen(model.boardRows));
});
test('replay presentation constructs detached positions for each step, never mutating moves',()=>{
  const model=fixture().exported.viewModel,moves=[{row:7,col:7,color:1},{row:6,col:7,color:2},{row:14,col:0,color:1}];
  const before=structuredClone(moves),board=model.replayBoard(moves,2);
  assert.equal(board[7][7],1);assert.equal(board[6][7],2);assert.equal(board[14][0],0);
  assert.equal(board.flat().filter(Boolean).length,2);
  board[7][7]=0;
  assert.equal(model.replayBoard(moves,2)[7][7],1);
  assert.equal(new Set(board).size,15,'board rows are independent arrays');
  assert.deepEqual(moves,before);
});
test('replay step bounds start at an empty board and stop at the last actual move',()=>{
  const model=fixture().exported.viewModel,moves=[{row:14,col:0,color:1}];
  assert.equal(model.replayBoard(moves,-1).flat().filter(Boolean).length,0);
  assert.equal(model.replayBoard(moves,99).flat().filter(Boolean).length,1);
  assert.equal(model.replayBoard([],0).flat().length,225);
});
test('compact move list keeps original step numbers, including replay prefixes',()=>{
  const model=fixture().exported.viewModel,moves=Array.from({length:18},(_,index)=>({row:index%15,col:Math.floor(index/15),color:index%2+1}));
  const before=structuredClone(moves),recent=model.recentMoves(moves);
  assert.deepEqual([...recent].map(item=>item.index),[12,13,14,15,16,17]);
  assert.equal(recent.at(-1).move,moves.at(-1));
  assert.deepEqual([...model.recentMoves(moves.slice(0,3))].map(item=>item.index),[0,1,2]);
  assert.equal(model.recentMoves(moves,225).length,18);
  assert.deepEqual(moves,before);
});
test('reference navigation and action labels have both locale dictionaries',()=>{
  const f=fixture();f.exported.apply(f.ctx);
  const translate=f.ctx.locale.bind('dsh-chess-room-v1');
  assert.equal(translate('records'),'对局记录');assert.equal(translate('roomTitle'),'鲸语棋室');assert.equal(translate('newGame'),'新对局');
  f.setLocale('en');
  assert.equal(translate('records'),'Game history');assert.equal(translate('showCoordinates'),'Coordinates');assert.equal(translate('unfinished'),'Unfinished');
  for(const dict of f.dictionaries.values())for(const key of ['room','records','settings','nextGame','activeComments','showCoordinates','viewAllMoves','replay','live'])assert.equal(typeof dict[key],'string');
  f.dispose();
});
test('reference UI follows actual Host comment/chat/fallback and archive contracts',()=>{
  assert.ok(source.includes('comments=state?.settings?.comments!==false'));
  assert.ok(source.includes("message.who==='player'"));assert.ok(!source.includes("message.who==='user'"));
  assert.ok(source.includes("g?.lastSource==='engine'"));assert.ok(!source.includes('lastMoveSource'));
  assert.ok(source.includes("game.difficulty||(game.status==='playing'?'unfinished'"));
  assert.ok(source.includes('!g?.moves?.length&&!state?.savedGames?.some(game=>game.moves.length)'));
  assert.ok(source.includes("'data-dcr-layout':'reference-v2'"));
  assert.ok(source.includes('container-name:chessroom'));assert.ok(source.includes('@container chessroom'));
  assert.ok(source.includes('.dcr .dcr-cell:disabled{opacity:1}'),'occupied stones do not inherit disabled-control fading');
  assert.ok(!source.includes("h('p',{className:'muted'},t('chatQueued'))"),'settings never pretend a message has been sent');
});
test('seven avatar source pairs use a fixed same-origin whitelist and escaped runtime cache identity',()=>{
  const model=fixture().exported.viewModel;
  assert.deepEqual([...model.expressions],['idle','thinking','smug','surprised','troubled','victory','defeat']);
  assert.ok(Object.isFrozen(model.expressions));
  for(const state of model.expressions) {
    const assets=model.expressionAssets(state,'runtime');
    assert.equal(assets.static,`/api/dsh-chess-room/avatar-v2/${state}.png?r=runtime`);
    assert.equal(assets.animated,`/api/dsh-chess-room/avatar-v2/${state}.webp?r=runtime`);
  }
  assert.equal(model.expressionAssets('../../outside','a&x=1').static,'/api/dsh-chess-room/avatar-v2/idle.png?r=a%26x%3D1');
});
test('actual Client artifact uses reduced-motion picture and recoverable static fallback, not the old SVG',()=>{
  assert.ok(source.includes("h('picture',{className:'dcr-character'"));
  assert.ok(source.includes("type:'image/webp',media:'(prefers-reduced-motion: no-preference)'"));
  assert.ok(source.includes('src:sources.static,width:448,height:448,alt:'));
  assert.ok(source.includes('failurePhase===0?'));
  assert.ok(source.includes('failurePhase>=2'));
  assert.ok(source.includes('React.useEffect(()=>setFailurePhase(0),[sources.static])'));
  assert.ok(!source.includes("viewBox:'0 0 150 130'"));
  assert.ok(!source.includes('dcr-bob'));
});
test('expression gallery changes preview only and restores game-following when closed',()=>{
  const gallery=source.match(/h\('details',\{className:'dcr-expression-gallery'[\s\S]*?t\('previewOnly'\)\)\)/);
  assert.ok(gallery);assert.ok(!gallery[0].includes('act('));
  assert.ok(gallery[0].includes('onClick:()=>setPreviewExpression(id)'));
  assert.ok(gallery[0].includes('if(!event.currentTarget.open)setPreviewExpression(null)'));
  assert.ok(gallery[0].includes("'aria-pressed':previewExpression===id"));
});
test('avatar and quiet-mode strings are localized and truthful about actual two-round cadence',()=>{
  const f=fixture();f.exported.apply(f.ctx);
  for(const dict of f.dictionaries.values())for(const key of ['expressionGallery','followGame','previewOnly','thinkingExpression','quietChatPlaceholder'])assert.equal(typeof dict[key],'string');
  const t=f.ctx.locale.bind('dsh-chess-room-v1');
  assert.ok(t('art').includes('用户提供'));assert.ok(t('commentsHint').includes('每两回合'));
  f.setLocale('en');assert.ok(t('art').includes('Your DSH avatar'));assert.ok(t('commentsHint').includes('two rounds'));
  assert.ok(source.includes("placeholder:t(comments?'chatPlaceholder':'quietChatPlaceholder')"));
  f.dispose();
});
