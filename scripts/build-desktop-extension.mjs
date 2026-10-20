import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
const fromTsx=createRequire(import.meta.resolve('tsx')),esbuild=fromTsx('esbuild');
if(fromTsx('esbuild/package.json').version!=='0.27.7')throw Error('PINNED_BUILDER_MISMATCH');
const out=resolve(process.env.MANDATE_DESKTOP_STAGE??'.runtime/claude-desktop-guide/package');
mkdirSync(join(out,'server'),{recursive:true});
const result=await esbuild.build({entryPoints:['mandate/desktop/cli.ts'],outfile:join(out,'server/mandate-desktop.cjs'),bundle:true,platform:'node',format:'cjs',target:'node24',metafile:true,sourcemap:false,legalComments:'eof'});
if(Object.values(result.metafile.outputs).flatMap(o=>o.imports).some(i=>i.external&&!i.path.startsWith('node:')))throw Error('UNBUNDLED_RUNTIME_DEPENDENCY');
if(Object.keys(result.metafile.inputs).some(p=>p.includes('.runtime/')||p.includes('PRIVATE_CONNECTION')))throw Error('PRIVATE_BUILD_INPUT');
copyFileSync('mandate/desktop/manifest.json',join(out,'manifest.json'));
copyFileSync('mandate/desktop/README.zh-CN.md',join(out,'README.zh-CN.md'));
copyFileSync('docs/manual/LICENSE',join(out,'LICENSE'));
// Keep the notices shipped by every included package alongside the bundled code.
const licenses=new Map();
for(const input of Object.keys(result.metafile.inputs)){
 if(!input.includes('node_modules'))continue;
 let dir=dirname(resolve(input));
 while(dir!==dirname(dir)){
  try{const p=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));if(p.name&&p.version){
   const key=p.name+'@'+p.version;
   if(!licenses.has(key)){
    let license='';for(const n of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT']){try{license=readFileSync(join(dir,n),'utf8');break;}catch{}}
    licenses.set(key,{name:p.name,version:p.version,license:p.license??null,notice:license});
   }break;
  }}catch{}dir=dirname(dir);
 }
}
writeFileSync(join(out,'THIRD_PARTY_NOTICES.json'),JSON.stringify([...licenses.values()],null,2)+'\n');
const report={schemaVersion:1,builder:'esbuild@0.27.7',entry:'mandate/desktop/cli.ts',manifestVersion:'0.3',runtime:'Node >=24.2 <25; macOS',inputCount:Object.keys(result.metafile.inputs).length,bundleSHA256:createHash('sha256').update(readFileSync(join(out,'server/mandate-desktop.cjs'))).digest('hex'),externalImports:Object.values(result.metafile.outputs).flatMap(o=>o.imports).filter(i=>i.external).map(i=>i.path),privateRuntimeFilesBundled:false};
writeFileSync(join(out,'build.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({stage:out,...report}));
