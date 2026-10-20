import {mkdirSync,readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {randomBytes,createHash} from "node:crypto";
import {keccak256,toHex,parseEventLogs} from "viem";
import {localEnvironment} from "../examples/local-environment.js";
import {businessKey} from "../services/store.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {decodeFunctionData} from "viem";
process.umask(0o077);
const smoke=process.argv.includes("--smoke"),revision=process.argv[2]??"v1",build=resolve(".runtime/competition-video",revision),output=resolve("competition/video"),final=join(output,`mandate-wallet-demo-${revision}.mp4`);
if(existsSync(final)||existsSync(join(build,"summary.json")))throw Error("VIDEO_OUTPUT_EXISTS");
mkdirSync(build,{recursive:true,mode:0o700});mkdirSync(output,{recursive:true});mkdirSync(join(build,"frames"),{recursive:true});
const source=JSON.parse(readFileSync("competition/video/content.json","utf8")),runtime=process.env.RUNTIME_NODE_MODULES;if(!runtime)throw Error("VIDEO_RUNTIME_MODULES_REQUIRED");
const require=createRequire(join(runtime,"__runtime__.cjs")),{chromium}=require("playwright"),ffmpeg=process.env.MANDATE_FFMPEG??"/opt/homebrew/bin/ffmpeg",ffprobe=process.env.MANDATE_FFPROBE??"/opt/homebrew/bin/ffprobe";
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n",save=(name:string,v:unknown)=>writeFileSync(join(build,name),json(v));
function run(command:string,args:string[]){return new Promise<void>((yes,no)=>{const child=spawn(command,args,{stdio:["ignore","ignore","pipe"]});let diagnostic="";child.stderr.on("data",d=>{diagnostic+=d.toString();});child.once("error",no);child.once("exit",code=>{if(code===0)yes();else{writeFileSync(join(build,"command-error.txt"),diagnostic);no(Error("VIDEO_MEDIA_COMMAND_FAILED"));}});});}
const duration=(file:string)=>Number(execFileSync(ffprobe,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file],{encoding:"utf8"}).trim());
const clips:{file:string;duration:number}[]=[];
if(!smoke)for(const [i,s]of source.stages.entries()){
  const input=join(build,`voice-${i}.txt`),file=join(build,`voice-${i}.aiff`);writeFileSync(input,s.narration);
  await run("/usr/bin/say",["-v",source.voice,"-r",String(source.wordsPerMinute),"-f",input,"-o",file]);clips.push({file,duration:duration(file)});
}
const e=await localEnvironment({standaloneMerchant:true,failAfterPayment:true,signedOffersAndReceipts:true});
let child:ReturnType<typeof spawn>|undefined,browser:any,context:any,page:any,cdp:any,capturing=false,t0=0,currentStage="setup";
const frames:{file:string;timeMs:number;browserTimestamp:number}[]=[],timeline:any[]=[],safeResponses:any[]=[];
try{
  const credential=randomBytes(32).toString("hex"),config=join(e.directory,"video-gateway.json"),credentialFile=join(e.directory,"video-credential.json"),verification=join(e.directory,"video-verification.json");
  const privateSave=(p:string,v:unknown)=>writeFileSync(p,json(v),{mode:0o600});privateSave(credentialFile,{connectionToken:credential});
  for(const [name,account]of [["session",e.agentA],["operator",e.operator]] as const)privateSave(join(e.directory,name+".json"),{privateKey:toHex(account.getHdKey().privateKey!)});
  privateSave(config,{schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:String(e.context(0).startBlock),sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"purchases.sqlite",credentialSHA256:createHash("sha256").update(credential).digest("hex"),evmFeeReservationCapWei:"1000000000000000",confirmations:1,services:e.services.map((s,i)=>({serviceId:s.serviceId,stepId:s.stepId,method:s.method,url:s.url,body:null,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin],evidenceStoreFile:"video.evidence.sqlite"});
  privateSave(verification,{schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:true,result:true}});
  child=spawn(process.execPath,["--import","tsx","mandate/web/cli.ts","--config",config,"--credential-file",credentialFile,"--verification-file",verification],{env:{PATH:process.env.PATH??"",MANDATE_WEB_PORT:"0"},stdio:["ignore","pipe","pipe"]});
  const origin=await new Promise<string>((yes,no)=>{let out="",err="";const timer=setTimeout(()=>no(Error("VIDEO_WEB_START_TIMEOUT")),15000);child!.stderr!.on("data",d=>{err+=d.toString();});child!.stdout!.on("data",d=>{out+=d.toString();for(const line of out.split("\n")){try{const r=JSON.parse(line);if(r.origin&&r.ownerKeyLoaded===false){clearTimeout(timer);yes(r.origin);}}catch{}}});child!.once("exit",()=>{clearTimeout(timer);writeFileSync(join(build,"web-start-diagnostic.txt"),err);no(Error("VIDEO_WEB_EXITED"));});});
  async function api(operation:string,args:unknown={}){const r=await fetch(origin+"/api/workspace",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+credential},body:JSON.stringify({operation,...args as any})});const v=await r.json();if(!r.ok)throw Error("VIDEO_WORKSPACE_API_FAILED");return v as any;}
  browser=await chromium.launch({channel:"chrome",headless:true});context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});page=await context.newPage();
  await page.goto(origin+"/app.html");await page.locator("#endpoint").fill(origin);await page.locator("#credential").fill(credential);await page.locator("#connection-form button").click();await page.locator("#content .metric-grid").waitFor();
  if(await page.evaluate(()=>Boolean((window as any).ethereum)))throw Error("VIDEO_UNEXPECTED_WALLET_PROVIDER");
  await page.evaluate(()=>{
    const top=document.createElement("div"),bottom=document.createElement("div");top.id="recording-context";bottom.id="recording-caption";top.setAttribute("popover","manual");bottom.setAttribute("popover","manual");document.body.append(top,bottom);
    const annotation={position:"fixed",inset:"auto",margin:"0",width:"100%",maxWidth:"none",border:"0",boxSizing:"border-box",background:"#101e32",color:"#f7f5ef",zIndex:"2147483647",pointerEvents:"none"};
    Object.assign(top.style,annotation,{top:"0",left:"0",height:"34px",font:"15px sans-serif",textAlign:"center",padding:"7px"});
    Object.assign(bottom.style,annotation,{bottom:"0",left:"0",minHeight:"80px",font:"22px/1.4 sans-serif",padding:"18px 36px"});document.body.style.paddingTop="34px";document.body.style.paddingBottom="115px";
    top.showPopover();bottom.showPopover();
    const start=Date.now();setInterval(()=>{const t=Math.floor((Date.now()-start)/1000);top.textContent=`Recording annotation · Local EVM 31337 · mock USDC · trusted fixture owner · ${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;},1000);
  });
  cdp=await context.newCDPSession(page);let first:()=>void=()=>{};const firstFrame=new Promise<void>(yes=>{first=yes;});
  cdp.on("Page.screencastFrame",(event:any)=>{if(capturing){const now=performance.now();if(!t0)t0=now;const name=`${String(frames.length).padStart(6,"0")}.jpg`;writeFileSync(join(build,"frames",name),Buffer.from(event.data,"base64"));frames.push({file:"frames/"+name,timeMs:now-t0,browserTimestamp:event.metadata.timestamp});first();}void cdp.send("Page.screencastFrameAck",{sessionId:event.sessionId}).catch(()=>{});});
  capturing=true;await cdp.send("Page.startScreencast",{format:"jpeg",quality:92,maxWidth:1280,maxHeight:900,everyNthFrame:1});await Promise.race([firstFrame,new Promise((_,no)=>setTimeout(()=>no(Error("VIDEO_NO_SCREENCAST_FRAMES")),5000))]);
  const clickOp=async(operation:string,selector:string)=>{const response=page.waitForResponse((r:any)=>r.url().endsWith("/api/workspace")&&r.request().postDataJSON()?.operation===operation);await page.locator(selector).first().click();const r=await response;if(r.status()!==200)throw Error("VIDEO_UI_OPERATION_FAILED");return r.json();};
  const nav=async(name:string)=>{await page.locator(`[data-page="${name}"]`).click();await page.locator("#content h1").filter({hasText:name.charAt(0).toUpperCase()+name.slice(1)}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));};
  async function stage(id:string,action:()=>Promise<void>){currentStage=id;const i=source.stages.findIndex((s:any)=>s.id===id),s=source.stages[i];await action();await page.evaluate((text:string)=>{document.getElementById("recording-caption")!.textContent=text;for(const id of ["recording-context","recording-caption"]){const el=document.getElementById(id)!;el.hidePopover();el.showPopover();}},s.caption);const start=performance.now()-t0;timeline.push({id,startMs:start,caption:s.caption,narration:s.narration,voiceDurationSeconds:smoke?0:clips[i].duration});console.log(JSON.stringify({stage:id,elapsedSeconds:Math.round(start/1000),smoke}));await page.waitForTimeout(smoke?200:Math.ceil(clips[i].duration*1000)+1700);if(performance.now()-t0>285000)throw Error("VIDEO_EXCEEDS_CAPTURE_BUDGET");}
  const sid=e.services[0].serviceId,bid=e.services[1].serviceId,key=businessKey(31337,e.wallet,e.root,e.steps[0]);let firstHash:string|undefined,review:any;
  await stage("overview",async()=>{});
  await stage("scope",async()=>{await nav("mandates");});
  await stage("quote",async()=>{await nav("services");const q=await clickOp("quote",`[data-action="quote"][data-id="${sid}"]`);if(q.requirements.amount!=="10000")throw Error("VIDEO_UNEXPECTED_PRICE");});
  await stage("paid-failed",async()=>{const r=await clickOp("call",`[data-action="run"][data-id="${sid}"]`);await nav("payments");const p=e.store.get(key)!;if(p.paymentState!=="paid"||p.serviceState!=="failed"||p.resultState!=="unchecked")throw Error("VIDEO_EXPECTED_PAID_500");firstHash=p.settlementHash;safeResponses.push({stage:"paid-failed",payment:p.paymentState,service:p.serviceState,result:p.resultState,settlementHash:p.settlementHash,lastHttpStatus:p.lastHttpStatus});});
  await stage("recovery",async()=>{await clickOp("call",`[data-action="run"][data-id="${sid}"]`);const p=e.store.get(key)!;if(p.settlementHash!==firstHash||p.serviceState!=="returned"||p.resultState!=="valid")throw Error("VIDEO_RECOVERY_IDENTITY_CHANGED");safeResponses.push({stage:"recovery",payment:p.paymentState,service:p.serviceState,result:p.resultState,settlementHash:p.settlementHash});});
  let verified:any;
  await stage("evidence",async()=>{await nav("evidence");await page.locator(`#disclose-request-${e.steps[0]}`).check();await page.locator(`#disclose-result-${e.steps[0]}`).check();verified=await clickOp("check-evidence",`[data-action="check-evidence"][data-id="${sid}"]`);if(!verified.report.requiredChecksPassed||verified.report.overall!=="incomplete")throw Error("VIDEO_VERIFICATION_MISMATCH");await page.locator(`#evidence-report-${e.steps[0]}`).scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-140));save("verification.json",verified);});
  await stage("revoke-review",async()=>{await nav("security");review=await clickOp("owner-action",'[data-action="revokeSession"]');await page.locator("#review").waitFor();if(!await page.locator("#approve").isDisabled()||decodeFunctionData({abi:accountAbi,data:review.request.draft.transaction.data}).functionName!=="revokeSession")throw Error("VIDEO_OWNER_BOUNDARY_MISMATCH");});
  let ownerReceipt:any;
  await stage("revoke-applied",async()=>{ownerReceipt=await e.send(e.wallet,review.request.draft.transaction.data);const status=await api("owner-broadcast",{requestId:review.request.requestId,transactionHash:ownerReceipt.transactionHash});if(!status.actionApplied||status.grantStatus!=="revoked")throw Error("VIDEO_REVOKE_NOT_APPLIED");await page.locator("#recover-owner").click();await page.locator("#review-error").filter({hasText:"applied true"}).waitFor();await page.locator("#review").evaluate((el:HTMLElement)=>{el.scrollTop=el.scrollHeight;});});
  await stage("rejected",async()=>{await page.locator("#close-review").click();await nav("services");await clickOp("call",`[data-action="run"][data-id="${bid}"]`);await nav("payments");const r=e.store.get(businessKey(31337,e.wallet,e.root,e.steps[1]))!;if(r.paymentState!=="rejected")throw Error("VIDEO_REVOKED_PURCHASE_ACCEPTED");safeResponses.push({stage:"rejected",payment:r.paymentState,service:r.serviceState,result:r.resultState,errorCode:r.errorCode});});
  await stage("limits",async()=>{await nav("security");await page.locator("#content h2").first().scrollIntoViewIfNeeded();});
  const totalMs=performance.now()-t0;await cdp.send("Page.stopScreencast");capturing=false;await context.close();await browser.close();context=browser=undefined;
  const used=await e.pc.getLogs({address:e.asset,event:testTokenAbi.find(a=>a.type==="event"&&a.name==="AuthorizationUsed") as any,fromBlock:0n,toBlock:"latest"});const matching=used.filter((l:any)=>l.args.authorizer.toLowerCase()===e.wallet.toLowerCase());
  const cash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]}),merchant=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]});
  if(matching.length!==1||cash!==990000n||merchant!==10000n)throw Error("VIDEO_ACTUAL_PAYMENT_COUNT_MISMATCH");
  save("capture.json",{mode:"actual-Chrome-CDP-screencast",smoke,frames,timeline,totalMs,safeResponses,browserKeyProviderInjected:false,fixtureOwnerInSeparateDriverProcess:true,webServerOwnerKeyLoaded:false,merchantSeparateProcess:true,chainId:31337,wallet:e.wallet,asset:e.asset,merchant:e.merchantSigner.address,paidAtomic:"10000",paymentTransactions:1,sameSettlementHash:firstHash,ownerRevocationHash:ownerReceipt.transactionHash,privateConnectionCredentialExported:false,newPublicTransactions:0});
  if(!smoke){
    const concat=["ffconcat version 1.0"];
    for(let i=0;i<frames.length;i++){concat.push(`file '${frames[i].file}'`,`duration ${Math.max(.001,((frames[i+1]?.timeMs??totalMs)-frames[i].timeMs)/1000).toFixed(6)}`);}concat.push(`file '${frames.at(-1)!.file}'`);writeFileSync(join(build,"frames.ffconcat"),concat.join("\n")+"\n");
    const silent=join(build,"screen.mp4");await run(ffmpeg,["-hide_banner","-loglevel","error","-y","-safe","0","-f","concat","-i",join(build,"frames.ffconcat"),"-r","20","-c:v","libx264","-preset","fast","-threads","2","-crf","20","-pix_fmt","yuv420p","-t",String(totalMs/1000),silent]);
    const args=["-hide_banner","-loglevel","error","-y","-i",silent];for(const c of clips)args.push("-i",c.file);
    const filters=timeline.map((t,i)=>`[${i+1}:a]adelay=${Math.round(t.startMs)}:all=1[a${i}]`);filters.push(timeline.map((_,i)=>`[a${i}]`).join("")+`amix=inputs=${timeline.length}:normalize=0:duration=longest,apad=whole_dur=${totalMs/1000}[voice]`);
    args.push("-filter_complex",filters.join(";"),"-map","0:v:0","-map","[voice]","-c:v","copy","-c:a","aac","-b:a","128k","-t",String(totalMs/1000),"-movflags","+faststart",final);await run(ffmpeg,args);
    if(duration(final)>300)throw Error("VIDEO_FINAL_DURATION_EXCEEDS_FIVE_MINUTES");
  }
  save("summary.json",{smoke,allStagesPassed:timeline.length===10,actualPaymentTransactions:1,paidAtomic:"10000",sameHashOnRecovery:true,revocationApplied:true,laterStepRejected:true,financialChecksPassed:true,overall:"incomplete",capturedFrames:frames.length,captureDurationSeconds:totalMs/1000,videoDurationSeconds:smoke?null:duration(final),output:smoke?null:final,outputSHA256:smoke?null:createHash("sha256").update(readFileSync(final)).digest("hex"),newPublicTransactions:0});
  console.log(JSON.stringify({smoke,allStagesPassed:true,frames:frames.length,seconds:totalMs/1000,video:smoke?null:final}));
}catch(error){writeFileSync(join(build,"private-error.txt"),String(error));save("failure.json",{stage:currentStage,code:"VIDEO_CAPTURE_FAILED",smoke,newPublicTransactions:0});throw Error("VIDEO_CAPTURE_FAILED");}
finally{capturing=false;await context?.close().catch(()=>{});await browser?.close().catch(()=>{});if(child&&child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(yes=>child!.once("exit",yes)),new Promise(yes=>setTimeout(yes,4000))]);if(child.exitCode===null)child.kill("SIGKILL");}await e.close();}
