import {readFile,writeFile,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateAiAssets} from './validate-ai-manifest.mjs';
const root=new URL('../',import.meta.url),out=new URL('../../dsh-chess-room-live-client/',import.meta.url);
const require=createRequire(new URL('../tools/client-build/package.json',import.meta.url)),{build}=require('esbuild');
const assetRoot=new URL('assets/actions-ai-v1/',root),metadata=JSON.parse(await readFile(new URL('manifest.json',assetRoot),'utf8'));
// No new version may be published merely by stretching/repeating the old walk.
const validation=await validateAiAssets(metadata,fileURLToPath(assetRoot),{requireRefresh:true});
if(process.argv.includes('--validate-only')){console.log(`Validated ${validation.trackCount} tracks and ${validation.verified.size} declared RGBA PNGs; no files published.`);process.exit(0);}
const imports=[],urls={},unique=new Map();
function declaredAsset(path){
  if(!validation.paths.has(path))throw new Error('undeclared action path');
  if(!unique.has(path)){const id='aiFrame'+unique.size;unique.set(path,id);imports.push(`import ${id} from ${JSON.stringify('../assets/actions-ai-v1/'+path)};`);}
  return unique.get(path);
}
for(const [track,spec] of Object.entries(metadata.tracks)){
  urls[track]={};
  for(const color of ['white','black'])urls[track][color]=spec.frames.map(f=>declaredAsset(f[color+'Path']));
}
const map=Object.entries(urls).map(([track,colors])=>`${JSON.stringify(track)}:{white:[${colors.white.join(',')}],black:[${colors.black.join(',')}]}`).join(',\n');
await writeFile(new URL('stage/ai-assets-generated.js',root),imports.join('\n')+'\nexport const AI_FRAME_URLS={'+map+'};\n');
let source=await readFile(new URL('client-live-src.js',root),'utf8');
function change(old,next){if(!source.includes(old)||source.indexOf(old)!==source.lastIndexOf(old))throw new Error('missing/ambiguous client seam: '+old.slice(0,90));source=source.replace(old,next);}
change("from './stage/live-ui.js'","from './stage/ai-live-ui.js'");
source=source.replaceAll('ChessRoomLiveV5','ChessRoomWhaleMaidLive130').replaceAll('dsh-chess-room-v1','dsh-chess-room-live-client-v1');
change('stageRelease:LIVE_RELEASE,stageMode:',"clientGeneration:'1.3.0',stageRelease:LIVE_RELEASE,stageMode:");
change('"confirmed-live-mechanism"','"confirmed-live-ai-actions"');
change("Object.assign(zh,stageZh,liveStageZh);Object.assign(en,stageEn,liveStageEn);","Object.assign(zh,stageZh,liveStageZh,{clientReady:'新待机与双腿步态 · 1.3.0'});Object.assign(en,stageEn,liveStageEn,{clientReady:'New idle and alternating gait · 1.3.0'});");
change("'data-dcr-stage-live':LIVE_RELEASE}","'data-dcr-stage-live':LIVE_RELEASE,'data-dcr-client-generation':'1.3.0'}");
change("h('p',null,t(tab==='records'?'saved':tab==='motionPreview'?'motionSubtitle':'roomSubtitle')))","h('p',null,t(tab==='records'?'saved':tab==='motionPreview'?'motionSubtitle':'roomSubtitle')),h('span',{className:'pill','data-dcr-client-ready':'1.3.0'},t('clientReady')))");
change("key:'dsh-chess-room'},ChessRoomWhaleMaidLive130)","key:'dsh-chess-room',priority:-1301},ChessRoomWhaleMaidLive130)");
change("id:'dsh-chess-room',order:45,label:()=>t('title')},Icon)","id:'dsh-chess-room',order:45,priority:-1301,label:()=>t('title')},Icon)");
// This distinct marker must be produced by a real native Main mount, not mere apply.
change('function ChessRoomWhaleMaidLive130() {',`function ChessRoomWhaleMaidLive130() {
        React.useEffect(()=>ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'dsh-chess-room',order:45,priority:-1302,label:()=>t('title')},Icon)),[]);`);
// Do not regenerate repair-only navigation, page reloads, or synthetic clicks.
const bootstrap="import {factory} from './fresh-client-source.js';\nwindow.__ModuleLoader__.load({id:'@local/dsh-chess-room-live-client',factory});\n";
const target=fileURLToPath(new URL('client.js',out));
const result=await build({stdin:{contents:bootstrap,sourcefile:'fresh-client-bootstrap.js',resolveDir:fileURLToPath(root),loader:'js'},outfile:target,bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:false,legalComments:'inline',loader:{'.png':'dataurl'},plugins:[{name:'owned-client-source',setup(builder){builder.onResolve({filter:/^\.\/fresh-client-source\.js$/},()=>({path:'fresh-client-source.js',namespace:'owned'}));builder.onLoad({filter:/.*/,namespace:'owned'},()=>({contents:source,resolveDir:fileURLToPath(root),loader:'js'}));}}]});
await writeFile(new URL('fresh-client-source.js',out),source);await writeFile(new URL('fresh-client-bootstrap.js',out),bootstrap);
for(const [sourceName,targetName] of [['origin.json','asset-origin.json'],['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md']])await writeFile(new URL(targetName,out),await readFile(new URL(sourceName,assetRoot)));
// Atomic publication protects package artifact readers from partial bundles;
// it does not prove an active dev:web watcher or promise no-refresh GUI updates.
const temporary=target+'.'+randomUUID()+'.tmp';
if(dirname(resolve(target))!==resolve(fileURLToPath(out))||basename(target)!=='client.js'||dirname(temporary)!==dirname(target))throw new Error('unsafe artifact target');
console.log('Checked atomic artifact target:',resolve(target));
await writeFile(temporary,result.outputFiles[0].contents);await rename(temporary,target);
console.log(`Built Client1.3.0: ${unique.size} immutable inline PNGs, ${result.outputFiles[0].contents.length} bytes. Original Host/artifacts unchanged; no auto-navigation.`);
