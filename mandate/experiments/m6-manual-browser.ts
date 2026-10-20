// Human-operated local UAT browser. No wallet setup, signing or provider injection.
import {createRequire} from "node:module";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {createInterface} from "node:readline";
import {createPublicClient,http} from "viem";
process.umask(0o077);
const [file,revision,...flags]=process.argv.slice(2),smoke=flags.includes("--smoke");
if(!file||!revision||!/^[a-z0-9-]+$/.test(revision)||flags.some(f=>f!=="--smoke"))throw Error("FIXTURE_AND_FRESH_REVISION_REQUIRED");
if(!smoke&&!process.stdin.isTTY)throw Error("INTERACTIVE_TERMINAL_REQUIRED");
const config=JSON.parse(readFileSync(file,"utf8"));if(config.chainId!==31337)throw Error("LOCAL_TEST_CHAIN_REQUIRED");
for(const value of [config.origin,config.rpc]){const u=new URL(value);if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||u.username||u.password||u.search||u.hash)throw Error("LOOPBACK_FIXTURE_ONLY");}
const out=resolve(".runtime/manual-uat",revision);if(existsSync(out))throw Error("FRESH_REVISION_REQUIRED");mkdirSync(out,{recursive:true,mode:0o700});
const runtime=process.env.RUNTIME_NODE_MODULES;if(!runtime)throw Error("OPTIONAL_BROWSER_RUNTIME_REQUIRED");const r=createRequire(join(runtime,"x.cjs")),{chromium}=r("playwright");
const extension=resolve(".runtime/browser-wallet/metamask-13.52.0"),zip=resolve(".runtime/browser-wallet/metamask-chrome-13.52.0.zip");
if(createHash("sha256").update(readFileSync(zip)).digest("hex")!=="8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a")throw Error("OFFICIAL_EXTENSION_ARCHIVE_CHANGED");
const save=(p:string,v:unknown)=>writeFileSync(join(out,p),JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n",{mode:0o600});
const pc=createPublicClient({transport:http(config.rpc,{timeout:5000,retryCount:0})});if(await pc.getChainId()!==31337)throw Error("RPC_NOT_LOCAL_TEST_CHAIN");
const api=async(operation="connect",args:Record<string,unknown>={})=>{const r=await fetch(config.origin+"/api/workspace",{method:"POST",headers:{authorization:"Bearer "+config.connectionToken,"content-type":"application/json"},body:JSON.stringify({operation,...args}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("FIXTURE_AUTHENTICATION_FAILED");return r.json() as Promise<any>;};
const before=await api(),nonce=await pc.getTransactionCount({address:before.owner});
const ctx=await chromium.launchPersistentContext(join(out,"profile"),{channel:"chromium",headless:smoke,args:["--disable-extensions-except="+extension,"--load-extension="+extension],viewport:{width:1280,height:900}});let input:ReturnType<typeof createInterface>|undefined;
try{
  const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent("serviceworker"),ext=new URL(worker.url()).host;
  const wallet=ctx.pages().find((p:any)=>p.url().startsWith("chrome-extension://"))??await ctx.newPage();await wallet.goto(`chrome-extension://${ext}/home.html`);
  const app=await ctx.newPage();await app.goto(config.origin+"/app.html");await app.waitForFunction(()=>Boolean((window as any).ethereum?.isMetaMask));
  await app.locator("#credential").fill(config.connectionToken);await app.locator("#connection-form button").click();await app.locator("#content .metric-grid").waitFor();if(await app.locator("#credential").inputValue()!=="")throw Error("CREDENTIAL_NOT_CLEARED");
  const observe=async(label:string)=>{
    if(!/^[a-z0-9-]+$/.test(label)||existsSync(join(out,label+".json")))throw Error("FRESH_CHECKPOINT_LABEL_REQUIRED");
    const s=await api(),tasks=await Promise.all(s.tasks.map((t:any)=>api("snapshot",{taskId:t.id})));const project=(v:any)=>({id:v.task.id,policy:v.context.policy,grant:v.context.grant,requests:v.ownerRequests.map((q:any)=>({requestId:q.requestId,action:q.draft.action,status:q.status,actionApplied:q.actionApplied,transactionHash:q.transactionHash})),records:v.state.records.map((q:any)=>({stepId:q.stepId,paymentState:q.paymentState,serviceState:q.serviceState,resultState:q.resultState,settlementHash:q.settlementHash}))});const record={schemaVersion:1,label,mode:smoke?"launcher smoke; no human actions":"human-operated browser; checkpoint is not human acceptance",chainId:31337,tasks:tasks.map(project),owner:s.owner,wallet:s.context.wallet,ownerNonce:await pc.getTransactionCount({address:s.owner}),walletBalanceAtomic:s.context.walletBalanceAtomic,policy:s.context.policy,requests:s.ownerRequests.map((q:any)=>({requestId:q.requestId,action:q.draft.action,status:q.status,actionApplied:q.actionApplied,transactionHash:q.transactionHash})),records:s.state.records.map((q:any)=>({stepId:q.stepId,paymentState:q.paymentState,serviceState:q.serviceState,resultState:q.resultState,settlementHash:q.settlementHash})),newPublicTransactions:0,humanAcceptance:false,providerInjected:false};save(label+".json",record);return record;
  };
  await observe("startup");
  if(smoke){const s=await api();if(await pc.getTransactionCount({address:s.owner})!==nonce||s.context.walletBalanceAtomic!==before.context.walletBalanceAtomic||s.context.policy.version!==before.context.policy.version||!await app.locator("#approve").isDisabled())throw Error("LAUNCHER_CHANGED_AUTHORITY");save("smoke.json",{schemaVersion:1,launcherReady:true,actualMetaMaskPresent:true,providerInjected:false,walletSetupAutomated:false,ownerSigningAutomated:false,ownerNonceBefore:nonce,ownerNonceAfter:nonce,walletBalanceAtomic:s.context.walletBalanceAtomic,policyVersion:s.context.policy.version,humanAcceptance:false,newPublicTransactions:0,sourceSHA256:createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex")});console.log(JSON.stringify({launcherSmokePassed:true,ownerSigningCalls:0,humanAcceptance:false,newPublicTransactions:0}));}
  else{
    await wallet.bringToFront();console.log(JSON.stringify({ready:true,humanActionsRequired:true,chainId:31337,owner:before.owner,localGateway:config.origin,localRPC:config.rpc,fixtureOnLocalhost:true,credentialPrinted:false,commands:["status","capture LABEL","viewport 390","viewport 1280","stop"],guide:"planning/M6_MANUAL_UAT.zh-CN.md"}));
    input=createInterface({input:process.stdin,crlfDelay:Infinity});for await(const line of input){const command=line.trim();if(command==="stop")break;if(command==="status"){const s=await api();console.log(JSON.stringify({policyVersion:s.context.policy.version,paused:s.context.policy.paused,revoked:s.context.policy.revoked,ownerRequests:s.ownerRequests.length,purchaseRecords:s.state.records.length,humanAcceptance:false}));}else if(command==="viewport 390"||command==="viewport 1280"){const width=Number(command.slice(9));await app.setViewportSize({width,height:900});console.log(JSON.stringify({width,physicalMobileDevice:false}));}else if(command.startsWith("capture ")){const label=command.slice(8);await observe(label);await app.screenshot({path:join(out,label+".png"),fullPage:true});console.log(JSON.stringify({checkpointSaved:label,humanAcceptance:false}));}else console.log(JSON.stringify({commands:["status","capture LABEL","viewport 390","viewport 1280","stop"]}));}
  }
}finally{input?.close();await ctx.close();}
