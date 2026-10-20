// Real, unmodified MetaMask UI; all chain activity is an isolated Anvil fixture.
import {mkdirSync,readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {randomBytes,createHash} from "node:crypto";
import {keccak256,toHex} from "viem";
import {localEnvironment} from "../examples/local-environment.js";
import {TEST_MNEMONIC} from "../examples/local-node.js";
import {businessKey} from "../services/store.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
// @ts-expect-error Optional material-authoring helper, browser dependencies external.
import {nativeUI} from "../../scripts/lib/native-wallet-ui.mjs";
process.umask(0o077);
const revision=process.argv[2],smoke=process.argv.includes("--smoke");
if(!revision||!/^[a-z0-9-]+$/.test(revision))throw Error("NEW_VIDEO_REVISION_REQUIRED");
const build=resolve(".runtime/competition-video",revision),final=resolve(`competition/video/mandate-wallet-demo-${revision}.mp4`);
if(existsSync(build)||existsSync(final))throw Error("VIDEO_REVISION_EXISTS");
mkdirSync(join(build,"frames"),{recursive:true,mode:0o700});
const source=JSON.parse(readFileSync("competition/video/wallet-content.json","utf8")),runtime=process.env.RUNTIME_NODE_MODULES;
if(!runtime)throw Error("VIDEO_RUNTIME_MODULES_REQUIRED");
const require=createRequire(join(runtime,"x.cjs")),{chromium}=require("playwright"),ffmpeg=process.env.MANDATE_FFMPEG??"/opt/homebrew/bin/ffmpeg",ffprobe=process.env.MANDATE_FFPROBE??"/opt/homebrew/bin/ffprobe";
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n",save=(name:string,v:unknown)=>writeFileSync(join(build,name),json(v),{mode:0o600});
const duration=(file:string)=>Number(execFileSync(ffprobe,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file],{encoding:"utf8"}).trim());
function command(cmd:string,args:string[]){return new Promise<void>((yes,no)=>{const p=spawn(cmd,args,{stdio:["ignore","ignore","pipe"]});let error="";p.stderr.on("data",d=>{error+=d;});p.once("error",no);p.once("exit",code=>{if(code===0)yes();else{writeFileSync(join(build,"private-media-error.txt"),error);no(Error("VIDEO_MEDIA_FAILED"));}});});}
const clips:{file:string;duration:number}[]=[];
if(!smoke)for(const [i,s]of source.stages.entries()){
  const input=join(build,`voice-${i}.txt`),file=join(build,`voice-${i}.aiff`);writeFileSync(input,s.narration);
  await command("/usr/bin/say",["-v",source.voice,"-r",String(source.wordsPerMinute),"-f",input,"-o",file]);clips.push({file,duration:duration(file)});
}
const extension=resolve(".runtime/browser-wallet/metamask-13.52.0"),zip=resolve(".runtime/browser-wallet/metamask-chrome-13.52.0.zip");
if(createHash("sha256").update(readFileSync(zip)).digest("hex")!=="8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a")throw Error("OFFICIAL_EXTENSION_HASH_MISMATCH");
const e=await localEnvironment({standaloneMerchant:true,failAfterPayment:true,signedOffersAndReceipts:true});
let child:ReturnType<typeof spawn>|undefined,ctx:any,page:any,wallet:any,ui:any,active:any,recording=false,t0=0,stageId="setup",captureTask:Promise<void>|undefined;
const frames:any[]=[],timeline:any[]=[],observations:any[]=[],ownerTransactions:any[]=[];
const wait=(ms:number)=>new Promise(yes=>setTimeout(yes,ms));
try{
  const connectionToken=randomBytes(32).toString("hex"),config=join(e.directory,"wallet-video.json"),credentialFile=join(e.directory,"wallet-video-credential.json"),verification=join(e.directory,"wallet-video-verification.json");
  const privateSave=(p:string,v:unknown)=>writeFileSync(p,json(v),{mode:0o600});privateSave(credentialFile,{connectionToken});
  for(const [name,a]of [["session",e.agentA],["operator",e.operator]] as const)privateSave(join(e.directory,name+".json"),{privateKey:toHex(a.getHdKey().privateKey!)});
  privateSave(config,{schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:String(e.context(0).startBlock),sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"purchases.sqlite",credentialSHA256:createHash("sha256").update(connectionToken).digest("hex"),evmFeeReservationCapWei:"1000000000000000",confirmations:1,services:e.services.map((s,i)=>({serviceId:s.serviceId,stepId:s.stepId,method:s.method,url:s.url,body:null,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin],evidenceStoreFile:"wallet-video.evidence.sqlite"});
  privateSave(verification,{schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:true,result:true}});
  child=spawn(process.execPath,["--import","tsx","mandate/web/cli.ts","--config",config,"--credential-file",credentialFile,"--verification-file",verification],{env:{PATH:process.env.PATH??"",MANDATE_WEB_PORT:"0"},stdio:["ignore","pipe","pipe"]});
  const origin=await new Promise<string>((yes,no)=>{let out="";const timer=setTimeout(()=>no(Error("VIDEO_WEB_TIMEOUT")),15000);child!.stdout!.on("data",d=>{out+=d;for(const line of out.split("\n")){try{const v=JSON.parse(line);if(v.origin&&v.ownerKeyLoaded===false){clearTimeout(timer);yes(v.origin);}}catch{}}});child!.once("exit",()=>{clearTimeout(timer);no(Error("VIDEO_WEB_EXITED"));});});
  const api=async(operation:string,args:any={})=>{const r=await fetch(origin+"/api/workspace",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+connectionToken},body:json({operation,...args})});const value=await r.json() as any;if(!r.ok){save("api-failure.json",{operation,code:value.code});throw Error("VIDEO_API_FAILED:"+operation+":"+String(value.code));}return value;};
  ctx=await chromium.launchPersistentContext(join(build,"profile"),{channel:"chromium",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension],viewport:{width:1280,height:900}});
  ctx.setDefaultTimeout(20000);console.log(JSON.stringify({setup:"isolated MetaMask onboarding",smoke}));
  const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent("serviceworker"),ext=new URL(worker.url()).host;
  wallet=ctx.pages().find((p:any)=>p.url().startsWith("chrome-extension://"))??await ctx.newPage();await wallet.goto(`chrome-extension://${ext}/home.html`);ui=await nativeUI(ctx,wallet);
  async function native(role:string,name:string){for(let i=0;i<100;i++){const c=(await ui.controls()).filter((c:any)=>c.role===role&&c.name===name&&!c.disabled);if(c.length===1)return c[0];await wait(150);}save("native-timeout.json",{role,name,url:wallet.url(),controls:(await ui.controls()).map((c:any)=>({role:c.role,name:c.name,disabled:c.disabled,checked:c.checked}))});throw Error("VIDEO_NATIVE_CONTROL_TIMEOUT");}
  async function click(role:string,name:string){await native(role,name);await ui.click(role,name);await wait(200);}
  await click("button","I have an existing wallet");await click("button","Import using Secret Recovery Phrase");
  const seedBox=await native("textbox","Add a space between each word and make sure no one is watching.");await ui.cdp.send("DOM.focus",{backendNodeId:seedBox.id});
  for(const letter of TEST_MNEMONIC){await ui.cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:letter,text:letter,unmodifiedText:letter});await ui.cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:letter});}
  await ui.cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab"});await ui.cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab"});await click("button","Continue");
  const password=randomBytes(24).toString("hex");privateSave(join(build,"password.json"),{password});
  await native("textbox","Create new password");await ui.fill("textbox","Create new password",password);await ui.fill("textbox","Confirm password",password);
  await click("checkbox","If I lose this password, MetaMask can’t reset it. Learn more");await click("button","Create password");await click("button","Maybe later");
  await native("checkbox","Gather basic usage data");if((await ui.controls()).find((c:any)=>c.name==="Gather basic usage data"&&c.role==="checkbox")?.checked==="true")await click("checkbox","Gather basic usage data");
  await click("button","Continue");await click("button","Open wallet");
  page=await ctx.newPage();await page.goto(origin+"/app.html");await page.locator("#credential").fill(connectionToken);await page.locator("#connection-form button").click();await page.locator("#content .metric-grid").waitFor();
  if(!await page.evaluate(()=>Boolean((window as any).ethereum?.isMetaMask)))throw Error("REAL_PROVIDER_MISSING");
  async function prompt(name="Confirm"){
    if(wallet.isClosed())wallet=await ctx.newPage();await wallet.goto(`chrome-extension://${ext}/notification.html`);ui=await nativeUI(ctx,wallet);await native("button",name);
  }
  await page.locator("#connect-owner").click();await prompt("Connect");await click("button","Connect");
  await page.locator("#error").filter({hasText:"different network"}).waitFor();
  await page.evaluate(({rpc}:any)=>{const w=window as any;w.__localNetwork={pending:true};w.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:"0x7a69",chainName:"Mandate local acceptance",rpcUrls:[rpc],nativeCurrency:{name:"Local Ether",symbol:"ETH",decimals:18}}]}).then(()=>w.__localNetwork={done:true});},{rpc:e.node.rpc});
  await prompt();await click("button","Confirm");await page.waitForFunction(()=>(window as any).__localNetwork.done);
  await page.locator("#connect-owner").click();await page.locator("#connect-owner").filter({hasText:"Owner connected"}).waitFor();
  const clickOp=async(operation:string,selector:string)=>{const response=page.waitForResponse((r:any)=>r.url().endsWith("/api/workspace")&&r.request().postDataJSON()?.operation===operation);await page.locator(selector).first().click();const r=await response;if(r.status()!==200)throw Error("VIDEO_UI_REQUEST_FAILED");return r.json();};
  async function ownerConfirmed(review:any){
    await click("button","Confirm");active=page;await page.bringToFront();await page.locator("#review").waitFor({state:"hidden"});
    const status=await api("owner-request",{requestId:review.request.requestId});if(!status.actionApplied||status.status!=="confirmed")throw Error("OWNER_ACTION_NOT_APPLIED");
    ownerTransactions.push({action:review.request.draft.action,requestId:status.requestId,transactionHash:status.transactionHash,blockNumber:status.blockNumber,status:status.status,actionApplied:status.actionApplied});
  }
  async function ensureOwner(){
    if(await page.locator("#approve").isDisabled()){
      await page.locator("#connect-review-owner").click();
      await wait(500);
      if(await page.locator("#approve").isDisabled()){await wallet.goto(`chrome-extension://${ext}/notification.html`);ui=await nativeUI(ctx,wallet);}
      for(let i=0;i<100&&await page.locator("#approve").isDisabled();i++){
        if((await ui.controls()).some((c:any)=>c.role==="button"&&c.name==="Connect"&&!c.disabled))await click("button","Connect");
        await wait(150);
      }
      try{await page.waitForFunction(()=>!(document.getElementById("approve") as HTMLButtonElement).disabled,null,{timeout:1000});}
      catch{save("owner-reconnect-diagnostic.json",{url:page.url(),error:await page.locator("#review-error").innerText(),button:await page.locator("#connect-owner").innerText(),walletUrl:wallet.url(),walletControls:await ui.controls()});throw Error("OWNER_RECONNECT_NOT_CONFIRMED");}
    }
  }
  await page.locator('[data-action="new"]').first().click();await page.locator("#task-description").fill("Compute approved ETH and BTC statistics");
  const created=await clickOp("create","#policy-form button");await page.locator("#review").waitFor();await ensureOwner();await page.locator("#approve").click();await prompt();await ownerConfirmed(created);console.log(JSON.stringify({setup:"actual MetaMask root creation confirmed",smoke}));
  const taskId=created.task.id,key=businessKey(31337,e.wallet,taskId,e.steps[0]),sid=e.services[0].serviceId,bid=e.services[1].serviceId;
  await page.evaluate(()=>{const n=document.createElement("div");n.id="recording-context";n.setAttribute("popover","manual");n.textContent="Recording · local EVM 31337 · mock USDC · actual MetaMask extension · automated UI";Object.assign(n.style,{position:"fixed",top:"0",left:"0",inset:"0 0 auto 0",margin:"0",width:"100%",maxWidth:"none",background:"#101e32",color:"#f7f5ef",font:"15px sans-serif",textAlign:"center",border:"0",padding:"8px",zIndex:"2147483647",pointerEvents:"none"});document.body.append(n);n.showPopover();document.body.style.paddingTop="36px";});
  const sessions=new Map<any,any>();active=page;
  async function capture(){const selected=active;if(!selected||selected.isClosed())return;let c=sessions.get(selected);if(!c){c=await ctx.newCDPSession(selected);await c.send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});sessions.set(selected,c);}const timeMs=performance.now()-t0;const shot=await c.send("Page.captureScreenshot",{format:"jpeg",quality:91,clip:{x:0,y:0,width:1280,height:900,scale:1},captureBeyondViewport:true});const name=String(frames.length).padStart(6,"0")+".jpg";writeFileSync(join(build,"frames",name),Buffer.from(shot.data,"base64"));frames.push({file:"frames/"+name,timeMs,surface:selected===page?"Mandate App":"actual MetaMask",stage:stageId});}
  t0=performance.now();recording=true;captureTask=(async()=>{while(recording){await capture();await wait(450);}})();
  const nav=async(name:string)=>{active=page;await page.bringToFront();await page.locator(`[data-page="${name}"]`).click();await page.locator("#content h1").filter({hasText:name.charAt(0).toUpperCase()+name.slice(1)}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));};
  async function stage(id:string,action:()=>Promise<void>){stageId=id;const i=source.stages.findIndex((s:any)=>s.id===id),s=source.stages[i];await action();const startMs=performance.now()-t0;timeline.push({id,startMs,caption:s.caption,narration:s.narration,voiceDurationSeconds:smoke?0:clips[i].duration});console.log(JSON.stringify({stage:id,elapsedSeconds:Math.round(startMs/1000),smoke}));await wait(smoke?250:clips[i].duration*1000+900);if(performance.now()-t0>285000)throw Error("VIDEO_CAPTURE_TOO_LONG");}
  let grant:any,revocation:any,hash:string|undefined;
  await stage("overview",async()=>{});
  await stage("grant-review",async()=>{await page.locator('[data-action="grant"]').first().click();grant=await clickOp("owner-action","#policy-form button");await page.locator("#review").waitFor();});
  await stage("grant-wallet",async()=>{await ensureOwner();await page.locator("#approve").click();await prompt();active=wallet;await wallet.bringToFront();});
  await ownerConfirmed(grant);
  await stage("active",async()=>{await nav("overview");if(!(await api("snapshot",{taskId})).context.grant.exists)throw Error("GRANT_MISSING");});
  await stage("quote",async()=>{await nav("services");const q=await clickOp("quote",`[data-action="quote"][data-id="${sid}"]`);if(q.requirements.amount!=="10000")throw Error("WRONG_PRICE");});
  const record=async()=>{const s=await api("snapshot",{taskId});return s.state.records.find((r:any)=>r.stepId===e.steps[0]);};
  await stage("paid-failed",async()=>{await clickOp("call",`[data-action="run"][data-id="${sid}"]`);await nav("payments");const p=await record();if(p.paymentState!=="paid"||p.serviceState!=="failed"||p.resultState!=="unchecked")throw Error("PAID_500_MISSING");hash=p.settlementHash;observations.push({stage:stageId,payment:p.paymentState,service:p.serviceState,result:p.resultState,settlementHash:hash});});
  await stage("recovery",async()=>{await clickOp("call",`[data-action="run"][data-id="${sid}"]`);const p=await record();if(p.settlementHash!==hash||p.serviceState!=="returned"||p.resultState!=="valid")throw Error("RECOVERY_CHANGED_PAYMENT");observations.push({stage:stageId,payment:p.paymentState,service:p.serviceState,result:p.resultState,settlementHash:p.settlementHash});});
  let verified:any;
  await stage("evidence",async()=>{await nav("evidence");await page.locator(`#disclose-request-${e.steps[0]}`).check();await page.locator(`#disclose-result-${e.steps[0]}`).check();verified=await clickOp("check-evidence",`[data-action="check-evidence"][data-id="${sid}"]`);if(!verified.report.requiredChecksPassed||verified.report.overall!=="incomplete")throw Error("VERIFICATION_MISMATCH");await page.locator(`#evidence-report-${e.steps[0]}`).scrollIntoViewIfNeeded();save("verification.json",verified);});
  await stage("revoke-review",async()=>{await nav("security");revocation=await clickOp("owner-action",'[data-action="revokeSession"]');await page.locator("#review").waitFor();});
  await stage("revoke-wallet",async()=>{await ensureOwner();await page.locator("#approve").click();await prompt();active=wallet;await wallet.bringToFront();});
  await ownerConfirmed(revocation);
  await stage("rejected",async()=>{await nav("services");await clickOp("call",`[data-action="run"][data-id="${bid}"]`);await nav("payments");const r=(await api("snapshot",{taskId})).state.records.find((r:any)=>r.stepId===e.steps[1]);if(r.paymentState!=="rejected"||r.registrationHash)throw Error("REVOKED_PURCHASE_ACCEPTED");observations.push({stage:stageId,payment:r.paymentState,errorCode:r.errorCode});});
  await stage("limits",async()=>{await nav("security");await page.locator("#content h2").first().scrollIntoViewIfNeeded();});
  const totalMs=performance.now()-t0;recording=false;await captureTask;
  const used=await e.pc.getLogs({address:e.asset,event:testTokenAbi.find(a=>a.type==="event"&&a.name==="AuthorizationUsed") as any,fromBlock:0n,toBlock:"latest"});
  const payments=used.filter((l:any)=>l.args.authorizer.toLowerCase()===e.wallet.toLowerCase()),cash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]}),merchant=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]});
  if(payments.length!==1||cash!==990000n||merchant!==10000n||ownerTransactions.length!==3)throw Error("ACTUAL_CHAIN_COUNTS_WRONG");
  save("capture.json",{schemaVersion:1,smoke,mode:"actual Chrome CDP screenshots at recorded wall-clock intervals; App and native MetaMask surfaces",frames,timeline,totalMs,observations,ownerTransactions,wallet:e.wallet,asset:e.asset,taskId,chainId:31337,paidAtomic:"10000",paymentTransactions:1,sessionGrantAndRevocationCaptured:true,rootCreationBeforeCapture:true,ownerAfterStartup:"actual MetaMask only; no fixture substitution",webServerOwnerKeyLoaded:false,providerInjected:false,officialExtensionVersion:"13.52.0",newPublicTransactions:0});
  if(!smoke){
    const concat=["ffconcat version 1.0"];for(let i=0;i<frames.length;i++)concat.push(`file '${frames[i].file}'`,`duration ${Math.max(.001,((frames[i+1]?.timeMs??totalMs)-frames[i].timeMs)/1000).toFixed(6)}`);concat.push(`file '${frames.at(-1).file}'`);writeFileSync(join(build,"frames.ffconcat"),concat.join("\n")+"\n");
    const screen=join(build,"screen.mp4");await command(ffmpeg,["-hide_banner","-loglevel","error","-y","-safe","0","-f","concat","-i",join(build,"frames.ffconcat"),"-r","20","-c:v","libx264","-preset","fast","-threads","2","-crf","20","-pix_fmt","yuv420p","-t",String(totalMs/1000),screen]);
    const args=["-hide_banner","-loglevel","error","-y","-i",screen];for(const clip of clips)args.push("-i",clip.file);
    const filters=timeline.map((t,i)=>`[${i+1}:a]adelay=${Math.round(t.startMs)}:all=1[a${i}]`);filters.push(timeline.map((_,i)=>`[a${i}]`).join("")+`amix=inputs=${timeline.length}:normalize=0:duration=longest,apad=whole_dur=${totalMs/1000}[voice]`);
    args.push("-filter_complex",filters.join(";"),"-map","0:v:0","-map","[voice]","-c:v","copy","-c:a","aac","-b:a","128k","-t",String(totalMs/1000),"-movflags","+faststart",final);await command(ffmpeg,args);if(duration(final)>300)throw Error("VIDEO_EXCEEDS_FIVE_MINUTES");
  }
  save("summary.json",{smoke,allStagesPassed:timeline.length===12,paymentTransactions:1,ownerWalletTransactions:3,sameHashOnRecovery:true,independentChecksPassed:true,overall:verified.report.overall,revocationConfirmed:true,laterStepRejected:true,providerInjected:false,actualMetaMask:true,humanRehearsal:false,physicalMobileDevice:false,newPublicTransactions:0,durationSeconds:smoke?totalMs/1000:duration(final),capturedFrames:frames.length,output:smoke?null:final,outputSHA256:smoke?null:createHash("sha256").update(readFileSync(final)).digest("hex")});
  console.log(JSON.stringify({complete:true,smoke,frames:frames.length,seconds:totalMs/1000,actualMetaMask:true,newPublicTransactions:0}));
}catch(error){writeFileSync(join(build,"private-error.txt"),String(error));save("failure.json",{stage:stageId,code:"ACTUAL_WALLET_VIDEO_FAILED",newPublicTransactions:0});throw Error("ACTUAL_WALLET_VIDEO_FAILED");}
finally{recording=false;await captureTask?.catch(()=>{});await ctx?.close().catch(()=>{});if(child&&child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(yes=>child!.once("exit",yes)),wait(3000)]);if(child.exitCode===null)child.kill("SIGKILL");}await e.close();}
