import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";

const workspaceDir=process.cwd(),modules=process.env.RUNTIME_NODE_MODULES,SKILL_DIR=process.env.PRESENTATIONS_SKILL_DIR,RUNTIME_PYTHON=process.env.RUNTIME_PYTHON;
if(!modules||!SKILL_DIR||!RUNTIME_PYTHON)throw Error("PRESENTATION_RUNTIME_PATHS_REQUIRED");
const require=createRequire(path.join(modules,"__runtime__.cjs"));
const {Presentation,PresentationFile,FileBlob}=await import(pathToFileURL(require.resolve("@oai/artifact-tool")).href);
const {resolvePresentationFont,applyPresentationChartFont,finalizePresentation}=await import(pathToFileURL(path.join(SKILL_DIR,"container_tools/artifact_tool_utils.mjs")).href);
const revision=process.argv[2]??"v1",build=path.join(workspaceDir,".runtime/presentation-build",revision),output=path.join(workspaceDir,"competition/presentation"),FINAL_PPTX=path.join(output,`mandate-wallet-${revision}.pptx`);
await fs.mkdir(build,{recursive:true});await fs.mkdir(output,{recursive:true});
const data=JSON.parse(await fs.readFile("competition/presentation/content.json","utf8")),audit=JSON.parse(await fs.readFile("artifacts/m7/benchmarks/audit.json","utf8")),publicBundle=JSON.parse(await fs.readFile("artifacts/m5/lifecycle/public-bundle.json","utf8"));
const font=resolvePresentationFont(),fontPolicy={basis:"design",families:[font]};
const C={ink:"#101e32",paper:"#f7f5ef",teal:"#168a78",light:"#e5f3ed",muted:"#66717a",line:"#dedfd8",amber:"#9a671c"};
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
const P={left:68,top:54,width:1144};
function text(s,value,x,y,w,h,size=28,color=C.ink,bold=false){const t=s.shapes.add({geometry:"textbox",name:value.slice(0,56),position:{left:x,top:y,width:w,height:h},fill:"none",line:{fill:"none",width:0}});t.text=value;t.text.style={typeface:font,fontSize:size,color,bold,wrap:"square",autoFit:"none",insets:0,verticalAlignment:"top"};return t;}
function footer(s,value,dark=false){text(s,value,68,644,1095,50,19,dark?"#bed2cd":C.muted);}
function add(info,dark=false){const s=presentation.slides.add();s.background.fill=dark?C.ink:C.paper;text(s,info.title,68,54,1144,78,44,dark?C.paper:C.ink,true);text(s,String(presentation.slides.items.length).padStart(2,"0"),1177,664,35,28,17,dark?"#bed2cd":C.muted);s.speakerNotes.text=info.narration+"\n\nSources (repository-relative):\n"+info.sources.join("\n");return s;}
function table(s,values,{x=68,y=178,w=1144,h=360,widths,small=26}={}){
  const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,values,columnWidths:widths});
  t.styleOptions={headerRow:true,bandedRows:false};t.borders.assign({fill:C.line,width:1,style:"solid"});
  for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){
    const cell=t.getCell(r,c);cell.fill=r===0?C.ink:C.paper;cell.text.style={typeface:font,fontSize:r===0?24:small,color:r===0?C.paper:C.ink,bold:r===0,insets:16,verticalAlignment:"middle",wrap:"square",autoFit:"none"};
  }
  return t;
}
async function screenshot(s,source,position,crop){const bytes=await fs.readFile(source);s.images.add({blob:bytes,contentType:"image/jpeg",alt:`Recorded local fixture: ${path.basename(source)}`,fit:"contain",position,...(crop?{crop}: {})});}

for(const info of data.slides){
  let s;
  switch(info.id){
    case "cover":
      s=add({...info,title:""},true);text(s,"Mandate Wallet",68,195,1144,115,86,C.paper,true);text(s,data.subtitle,72,328,1000,105,36,"#9edacb");text(s,"Topic F · Agent Wallet",72,490,1050,45,25,C.paper);footer(s,`Testnet engineering snapshot · ${data.snapshotDate}`,true);break;
    case "task":
      s=add(info);text(s,"Buy fixed ETH / BTC statistics",68,178,1144,65,40,C.teal,true);text(s,"Two agents share one owner-approved task",68,257,1144,50,28);
      text(s,"0.15",68,361,450,100,82,C.ink,true);text(s,"test USDC total budget",72,464,490,45,28);
      text(s,"0.10",670,361,450,100,82,C.ink,true);text(s,"test USDC per-payment limit",674,464,535,45,28);
      footer(s,"Controlled public dataset and merchant · artificial statistics · gas accounted separately");break;
    case "owner":
      s=add(info);text(s,"The owner controls",68,182,550,50,32,C.teal,true);text(s,"Asset and recipient\nExact requests and steps\nTask and session limits\nExpiry, replacement and revocation",68,256,555,260,30);
      await screenshot(s,"artifacts/m6/browser/owner-review-desktop.jpg",{left:713,top:153,width:430,height:463},{left:.302,top:.026,right:.301,bottom:.49});
      footer(s,"Recorded local fixture with a test wallet adapter · actual external-wallet acceptance remains open");break;
    case "authority":
      s=add(info);table(s,[["Stage","Chain or client check"],["1 · Register","Signed scope; reserve root + session budget"],["2 · Sign","Payment signature only after confirmed registration"],["3 · Settle","ERC-1271 checks current authority and exact digest"],["4 · Reconcile","Canonical token events; delivery/result checked separately"]],{h:382,widths:[285,859],small:27});
      footer(s,"Deployed, non-upgradeable wallet · x402 v2 exact / EIP-3009 · unsupported routes rejected");break;
    case "recovery":
      s=add(info);table(s,[["Observation","Payment","Service","Result"],["First call","paid","failed","unchecked"],["Same order retry","paid","returned","valid"]],{y:195,h:250,widths:[370,240,260,274],small:28});
      text(s,"One business step · one nonce · one payment",68,503,1144,55,34,C.teal,true);
      footer(s,"Actual paid-500 and response-loss cases · unknown settlement retains budget · retry reconciles first");break;
    case "public":
      s=add(info);table(s,[["Public network","Asset","Recorded execution"],["Base Sepolia","Native test USDC","Wallet + HTTP + MCP + evidence"],["Ethereum Sepolia","Controlled TestUSDC","Wallet/payment/refusal; Echo strict bundler separately"]],{y:180,h:265,widths:[310,320,514],small:26});
      text(s,"Example Base payment",68,486,1144,38,25,C.teal,true);text(s,publicBundle.record.settlementHash,68,538,1144,42,21);
      footer(s,"Real public transactions · controlled loopback merchant/reference facilitator · no mainnet spending");break;
    case "safety":
      s=add(info);text(s,"10,000",68,163,520,106,82,C.teal,true);text(s,"distinct explicitly invalid contract calls rejected",68,282,1144,55,30);
      table(s,[["Stateful case","Observed boundary"],["Two 0.10 requests; 0.15 root","Only one registers, using different senders in one block"],["Verify, then owner revokes","Actual settlement rejects; reservation remains"],["Direct session-key use","Unregistered amount / recipient changes reject"]],{y:369,h:239,widths:[460,684],small:24});
      footer(s,"6 legal controls passed · finite local experiments and manual arguments · independent review pending");break;
    case "evidence":
      s=add(info);text(s,"Financial checks can pass\nwhile the overall report\nremains incomplete",68,175,547,170,36,C.teal,true);text(s,"Hidden result stays unchecked.\nHTTPS provenance is separate.\nA known retained head detects\nomission of its recorded tail.",68,384,550,190,28);
      table(s,[["Minimal bundle","Verifier result"],["Financial links","confirmed"],["Hidden result","incomplete"],["HTTPS / history","incomplete"]],{x:660,y:215,w:552,h:330,widths:[300,252],small:25});
      footer(s,"Actual minimal-bundle reports · no paid-merchant HTTPS witness · same-host controller is not isolation");break;
    case "cost":{
      s=add(info);text(s,"120 tasks · 132 settlements · 0 duplicate payments",68,143,1144,44,30,C.teal,true);
      const categories=["EOA","Mandate","+ evidence","+ controller"],bs=["B1","B2","B3","B4"];
      const metrics=[{name:"Gas per task · P50",key:"gasPerTask",left:68,max:650000,fmt:"#,##0",unit:"Gas"},{name:"Full task · P50 (ms)",key:"fullTaskMs",left:671,max:450,fmt:"0.00",unit:"Milliseconds"}];
      for(const m of metrics){text(s,m.name,m.left,213,540,42,27,C.ink,true);const ch=s.charts.add("bar",{position:{left:m.left,top:274,width:540,height:315},categories,series:[{name:m.unit,values:bs.map(b=>Math.round(audit.byBaseline[b][m.key].p50*100)/100),fill:C.teal}],hasLegend:false,barOptions:{direction:"column",grouping:"clustered",gapWidth:100},chartFill:C.paper,plotAreaFill:C.paper,xAxis:{textStyle:{fontSize:18,fill:C.ink},line:{fill:C.line,width:1}},yAxis:{min:0,max:m.max,numberFormatCode:m.key==="gasPerTask"?"0,\"k\"":"0",textStyle:{fontSize:18,fill:C.muted},majorGridlines:{fill:C.line,width:1}},dataLabels:{showValue:true,position:"outEnd",numberFormatCode:m.fmt,textStyle:{fontSize:18,fill:C.ink}}});applyPresentationChartFont(ch,{fontFamily:font});}
      footer(s,"n=30 mixed local tasks/group · setup excluded · full task includes export/verification where applicable");break;
    }
    case "echo":
      s=add(info);table(s,[["Layer","Delivered work"],["Echo v2 repair","Operation signatures, swap checks, actual input accounting, strict EntryPoint/bundler"],["Mandate protocol","Registered payments, shared reservations, session subsets, x402 recovery"],["Research and product","Linked evidence, controller limits, MCP/SDK/App, formal counterexamples"]],{y:185,h:340,widths:[320,824],small:28});
      footer(s,"Echo swap spend and Mandate occupied budget differ · original upstream failures remain preserved");break;
    case "limits":
      s=add(info,true);text(s,"Owner approval and isolation",68,185,1144,45,32,"#9edacb",true);text(s,"Actual browser wallet + complete mobile owner flow still pending",68,239,1144,74,28,C.paper);
      text(s,"Independent security review",68,346,1144,45,32,"#9edacb",true);text(s,"Author tests and data audits do not replace it",68,400,1144,60,28,C.paper);
      text(s,"Final delivery",68,493,1144,45,32,"#9edacb",true);text(s,"Evidence/version/privacy checks and organizer confirmation remain",68,547,1144,60,28,C.paper);
      footer(s,"Correct token + canonical chain + trusted owner are assumptions · mainnet/submission require authorization",true);break;
    case "reproduce":
      s=add(info);text(s,"Run a purchase, recovery and revocation",68,183,1144,60,40,C.teal,true);text(s,"pnpm sdk:demo /absolute/new-output-directory",68,288,1144,55,30,C.ink,true);
      text(s,"Code and installation\nREADME.md · mandate/sdk/QUICKSTART.zh-CN.md",68,405,1144,95,28);
      text(s,"Public execution + raw experiments\nartifacts/m5/lifecycle · artifacts/m7/benchmarks",68,525,1144,95,28);
      footer(s,"Local demo uses mock funds · separate financial/delivery/result evidence · final submission not yet frozen");break;
    default:throw Error("UNKNOWN_SLIDE:"+info.id);
  }
}
const candidatePath=path.join(build,"candidate.pptx");await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const result=await finalizePresentation({workspaceDir,candidatePath,finalPath:FINAL_PPTX,pythonExecutable:RUNTIME_PYTHON,integrityValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_package_integrity.py"),layoutValidatorPath:path.join(SKILL_DIR,"container_tools/inspect_presentation_layout_geometry.py"),layoutArgs:["--expected-slide-size-emu","12192000,6858000","--validate-bullet-geometry","--validate-heading-fit",...[4,5,6,7,8,10].flatMap(n=>["--require-native-table-slide",String(n)])],requiredNativeTableOwnerSlides:[4,5,6,7,8,10],requiredNativeChartOwnerSlides:[9],materializeLiteralChartWorkbooks:true,fontPolicy,verifyArtifactToolImport:true,receiptPath:path.join(build,"validation.json")});
const final=await PresentationFile.importPptx(await FileBlob.load(FINAL_PPTX));
const rendered=[];
for(const [i,s]of final.slides.items.entries()){const file=path.join(build,`slide-${String(i+1).padStart(2,"0")}.png`),png=await final.export({slide:s,format:"png",scale:1});await fs.writeFile(file,new Uint8Array(await png.arrayBuffer()));rendered.push(file);}
const words=s=>s.match(/\b[\w]+(?:['’-][\w]+)*\b/g)?.length??0,totalWords=data.slides.reduce((n,s)=>n+words(s.narration),0),estimate=totalWords*60/data.spokenWordsPerMinute+data.transitionAndPauseSeconds;
if(estimate>600)throw Error("PRESENTATION_ESTIMATE_EXCEEDS_TEN_MINUTES");
const script=["# Mandate Wallet — speaker script","",`12 slides; ${totalWords} spoken words. At ${data.spokenWordsPerMinute} words/minute plus ${data.transitionAndPauseSeconds} seconds for transitions/pauses: ${Math.ceil(estimate)} seconds. This is a script estimate, not a measured human rehearsal.`,`Engineering snapshot: ${data.snapshotDate}.`];
for(const [i,s]of data.slides.entries())script.push("",`## ${i+1}. ${s.title}`,"",s.narration,"",`Sources: ${s.sources.map(p=>"["+p+"]("+path.relative(output,path.join(workspaceDir,p))+")").join(", ")}`);
await fs.writeFile(path.join(output,"SPEAKER_NOTES.en.md"),script.join("\n")+"\n");
const manifest={schemaVersion:1,revision,slideCount:final.slides.items.length,font,fontPolicy,spokenWords:totalWords,estimateSeconds:estimate,transitionAndPauseSeconds:data.transitionAndPauseSeconds,plannedSlideSeconds:data.slides.reduce((n,s)=>n+s.seconds,0),humanTimedRehearsal:false,output:FINAL_PPTX,outputSHA256:createHash("sha256").update(await fs.readFile(FINAL_PPTX)).digest("hex"),rendered,validationReceipt:path.join(build,"validation.json"),sources:["competition/presentation/content.json","scripts/competition-build-deck.mjs","artifacts/m7/benchmarks/audit.json","artifacts/m5/lifecycle/public-bundle.json",...new Set(data.slides.flatMap(s=>s.sources))].map(p=>({path:p,SHA256:null})),newPublicTransactions:0};
for(const source of manifest.sources)source.SHA256=createHash("sha256").update(await fs.readFile(path.join(workspaceDir,source.path))).digest("hex");
await fs.writeFile(path.join(build,"build-manifest.json"),JSON.stringify(manifest,null,2)+"\n");console.log(JSON.stringify({slideCount:manifest.slideCount,font,estimateSeconds:estimate,output:FINAL_PPTX,rendered:rendered.length}));
