// Focused edit of the existing native deck. Tables/charts/layouts are retained.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const modules=process.env.RUNTIME_NODE_MODULES,skill=process.env.PRESENTATIONS_SKILL_DIR,python=process.env.RUNTIME_PYTHON;
if(!modules||!skill||!python)throw Error('PRESENTATION_RUNTIME_REQUIRED');
const require=createRequire(path.join(modules,'x.cjs'));
const {PresentationFile,FileBlob}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const revision=process.argv[2]??'v4',root=process.cwd(),build=path.resolve('.runtime/presentation-build',revision+(process.argv[3]??'')),sourcePath=path.resolve('competition/presentation/mandate-wallet-v3.pptx'),finalPath=path.resolve(`competition/presentation/mandate-wallet-${revision}.pptx`);
await fs.mkdir(build,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=await fs.readFile(sourcePath),p=await PresentationFile.importPptx(await FileBlob.load(sourcePath));
const content=JSON.parse(await fs.readFile('competition/presentation/content.json','utf8'));
const inspection=await p.inspect({select:'$.slides[*]',include:['id','index','elements.id','elements.kind','elements.text','elements.position','notes.text']});
await fs.writeFile(path.join(build,'before.ndjson'),inspection.ndjson);
const beforeRecords=inspection.ndjson.trim().split('\n').map(line=>JSON.parse(line));
const copyPath='competition/presentation/copy-edits.v4.json';
const copy=JSON.parse(await fs.readFile(copyPath,'utf8'));
const editedSlides=new Set();
for(const edit of copy.edits){
  const hits=beforeRecords.flatMap(slide=>(slide.elements??[]).filter(e=>e.text===edit.old).map(e=>({slide:slide.index+1,id:e.id})));
  if(hits.length!==1)throw Error('COPY_ANCHOR_MUST_MATCH_ONCE:'+edit.old);
  const hit=hits[0];p.resolve(hit.id).text.replace(edit.old,edit.new);editedSlides.add(hit.slide);
}
for(const [i,info] of content.slides.entries())p.slides.items[i].speakerNotes.text=info.narration+'\n\nSources (repository-relative):\n'+info.sources.join('\n');
const candidate=path.join(build,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
const preserved=path.join(build,'preserved.pptx');execFileSync(python,['scripts/preserve-deck-chart-parts.py','--source',sourcePath,'--candidate',candidate,'--output',preserved,'--report',path.join(build,'workbook-preservation.json')]);
await finalizePresentation({workspaceDir:root,candidatePath:preserved,finalPath,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...[4,5,6,7,8,10].flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:[4,5,6,7,8,10],requiredNativeChartOwnerSlides:[9],requiredEmbeddedWorkbookChartOwnerSlides:[9],materializeLiteralChartWorkbooks:false,fontPolicy:{basis:'reference',families:['Helvetica Neue'],referencePath:sourcePath,referenceSha256:hash(sourceBytes)},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation.json')});
const final=await PresentationFile.importPptx(await FileBlob.load(finalPath)),rendered=[];
for(const[i,s]of final.slides.items.entries()){const file=path.join(build,`slide-${String(i+1).padStart(2,'0')}.png`);await fs.writeFile(file,new Uint8Array(await(await final.export({slide:s,format:'png',scale:1})).arrayBuffer()));rendered.push(file);}
await fs.writeFile(path.join(build,'after.ndjson'),(await final.inspect({select:'$.slides[*]',include:['id','index','elements.id','elements.kind','elements.text','elements.position','notes.text']})).ndjson);
const words=s=>s.match(/\b[\w]+(?:['’-][\w]+)*\b/g)?.length??0,totalWords=content.slides.reduce((n,s)=>n+words(s.narration),0),estimate=totalWords*60/content.spokenWordsPerMinute+content.transitionAndPauseSeconds;if(estimate>600)throw Error('PRESENTATION_TOO_LONG');
const lines=['# Mandate Wallet speaker script','',`12 slides; ${totalWords} spoken words. At ${content.spokenWordsPerMinute} words/minute plus ${content.transitionAndPauseSeconds} seconds for transitions/pauses: ${Math.ceil(estimate)} seconds. Script estimate, not a measured human rehearsal.`];
for(const[i,s]of content.slides.entries())lines.push('',`## ${i+1}. ${s.title}`,'',s.narration,'','Sources: '+s.sources.map(name=>`[${name}](${path.relative('competition/presentation',name)})`).join(', '));
await fs.writeFile('competition/presentation/SPEAKER_NOTES.en.md',lines.join('\n')+'\n');
const manifest={schemaVersion:1,revision,sourceDeck:sourcePath,sourceDeckSHA256:hash(sourceBytes),output:finalPath,outputSHA256:hash(await fs.readFile(finalPath)),slideCount:12,editedSlides:[...editedSlides].sort((a,b)=>a-b),nativeTablesAndChartsRetained:true,materializedNewWorkbookSnapshots:false,spokenWords:totalWords,estimateSeconds:estimate,humanTimedRehearsal:false,rendered,sourceFingerprint:{}};
for(const name of ['scripts/competition-edit-copy.mjs',copyPath,'competition/presentation/content.json','artifacts/m6/external-wallet/screenshots/create-owner-review.png','artifacts/m6/external-wallet/automation-acceptance.json','artifacts/m7/security/acceptance.json'])manifest.sourceFingerprint[name]=hash(await fs.readFile(name));
await fs.writeFile(path.join(build,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({output:finalPath,slideCount:12,editedSlides:manifest.editedSlides,spokenWords:totalWords,estimateSeconds:estimate}));
