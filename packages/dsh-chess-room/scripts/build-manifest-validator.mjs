// Development-only reproducible provenance build; no pet plugin installation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,relative,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=resolve(root,'vendor/dsh-pet-manifest');
const upstream=resolve(target,'source');
const require=createRequire(new URL('../tools/client-build/package.json',import.meta.url));
const {build}=require('esbuild');
await mkdir(target,{recursive:true});
const commit='9ed843bccee3d2604ce0ac31f55cbde9bda97c7f';
const result=await build({absWorkingDir:root,entryPoints:[resolve(upstream,'src/manifest-v2.ts')],outfile:resolve(target,'validator.js'),write:false,bundle:true,platform:'node',format:'esm',target:'node24',metafile:true,legalComments:'inline',banner:{js:`/* dsh-pet v0.4.14 manifest parser, Apache-2.0. Source commit ${commit}.\n   Adaptation: TypeScript erased and local imports bundled by esbuild; validation logic unchanged.\n   See LICENSE and UPSTREAM.json in this directory. Development verification only; not a business Service. */`}});
const inputs=[];
for(const input of Object.keys(result.metafile.inputs)){
  const file=resolve(root,input),name=relative(upstream,file).replaceAll('\\','/');
  if(name.startsWith('../'))throw new Error('unexpected upstream input');
  const bytes=await readFile(file),copy=resolve(target,'source',name);await mkdir(dirname(copy),{recursive:true});await writeFile(copy,bytes);
  inputs.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(resolve(target,'validator.js'),result.outputFiles[0].contents);
// The full upstream license already accompanies the vendored source; no audit checkout is required.
await readFile(resolve(target,'LICENSE'));
await writeFile(resolve(target,'UPSTREAM.json'),JSON.stringify({package:'@linxin666/dsh-pet',version:'0.4.14',commit,source:`https://github.com/zhu1090093659/dsh-pet/tree/${commit}`,license:'Apache-2.0',modifications:'TypeScript erased, local modules bundled with esbuild 0.25.12. Validation logic unchanged. Original source bytes and full license retained. Development validation only; not imported by Client or Host entry.',inputs},null,2)+'\n');
console.log(JSON.stringify({validator:resolve(target,'validator.js'),inputs:inputs.length,commit}));
