import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {keccak256,toHex,type Hex} from "viem";
import {signEnvelope,signControllerRequest,verifyStatement,type Envelope} from "../evidence/controller-model.js";
import {signCheckpoint} from "../evidence/checkpoint.js";
import {ControllerClient} from "../evidence/controller-http.js";
import {SafeHttp} from "../services/http.js";
import {canonicalJson} from "../sdk/model.js";
import {verifyExternalAnchors} from "../evidence/anchors.js";
process.umask(0o077);const root=process.cwd(),directory=".runtime/m5/controller",output="artifacts/m5/interference";mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(output,{recursive:true});
const bundle=JSON.parse(readFileSync("artifacts/m5/lifecycle/public-bundle.json","utf8")),trust=JSON.parse(readFileSync("artifacts/m5/lifecycle/trusted-config.json","utf8"));
const account=(path:string)=>privateKeyToAccount(JSON.parse(readFileSync(path,"utf8")).privateKey as Hex),owner=account(".runtime/keys/owner.json"),agent=account(".runtime/m3/keys/agent-a.json");
const keyFile=resolve(directory+"/key.json");if(!existsSync(keyFile))writeFileSync(keyFile,JSON.stringify({privateKey:generatePrivateKey()}),{mode:0o600});const controller=account(keyFile);
const envelopeFile=directory+"/envelope.json";let envelope:Envelope;
if(existsSync(envelopeFile))envelope=JSON.parse(readFileSync(envelopeFile,"utf8"));else{const now=Math.floor(Date.now()/1000);envelope=await signEnvelope(owner,{schemaVersion:2,scope:bundle.scope,mode:"historical-observer",stepIds:[bundle.payment.stepId],maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+3600,checkpointDeadlineSeconds:60,expectedKinds:["pre-payment","registration","payment","service"]});writeFileSync(envelopeFile,canonicalJson(envelope),{mode:0o600});}
const configFile=resolve(directory+"/config.json");writeFileSync(configFile,JSON.stringify({trust,envelope,controllerKeyFile:keyFile,storeFile:resolve(directory+"/controller.sqlite"),port:43404}),{mode:0o600});
const child=spawn(process.execPath,["--import","tsx","mandate/evidence/controller-cli.ts","--config",configFile],{env:{PATH:process.env.PATH??""},stdio:["ignore","pipe","pipe"]});writeFileSync(directory+"/process.json",JSON.stringify({pid:child.pid,command:"mandate/evidence/controller-cli.ts"}),{mode:0o600});
let initialized="",errors="";child.stderr.on("data",d=>{errors+=d.toString();});
try{
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("CONTROLLER_START_TIMEOUT")),15000);child.stdout.on("data",d=>{initialized+=d.toString();if(initialized.includes('"origin"')){clearTimeout(timer);resolve();}});child.once("exit",()=>{clearTimeout(timer);reject(new Error("CONTROLLER_START_FAILED"));});});
 const origin="http://127.0.0.1:43404",http=new SafeHttp({allowOrigins:[origin],testLoopbackOrigins:[origin]}),client=new ControllerClient(origin,envelope,agent,controller.address,http,resolve(directory+"/requests.json")),anchors=[];
 for(const entry of bundle.checkpoints){const statement=await client.anchor(entry.checkpoint);anchors.push({checkpoint:entry.checkpoint,statement});}
 const snapshot={lastSequence:anchors.at(-1)!.checkpoint.header.sequence,lastRoot:anchors.at(-1)!.checkpoint.root};
 await verifyExternalAnchors(anchors,bundle.checkpoints.map((c:any)=>c.checkpoint),{controller:controller.address,owner:owner.address,envelope,snapshot},bundle.scope);
 const root0=bundle.checkpoints[0].checkpoint,fork=await signCheckpoint(agent,{...root0.header,merkleRoot:keccak256(toHex("forged historical root"))}),request=await signControllerRequest(agent,envelope,{requestId:keccak256(toHex("fork")),stepId:bundle.payment.stepId,issuedAt:Math.floor(Date.now()/1000),kind:"anchor",payloadHash:keccak256(toHex(canonicalJson(fork)))});
 const denial=await http.json(origin+"/anchor",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.from(canonicalJson({request,checkpoint:fork}))}),statement=await verifyStatement((denial.data as any).statement,controller.address,bundle.scope);if(statement.code!=="CONTROLLER_CHECKPOINT_FORK")throw new Error("FORK_NOT_DETECTED");
 const queries=[];for(let i=0;i<4;i++)queries.push(await client.query(bundle.payment.stepId,keccak256(toHex("controlled-query:"+i))));if(queries[3].statement.code!=="CONTROLLER_QUERY_BUDGET_EXHAUSTED")throw new Error("QUERY_LIMIT_FAILED");
 const status=await http.json(origin+"/status");
 const extended={...bundle,externalAnchors:anchors},extendedTrust={...trust,controllerSigner:controller.address,controllerEnvelope:envelope,controllerSnapshot:snapshot};writeFileSync(output+"/anchored-bundle.json",JSON.stringify(extended,null,2)+"\n");writeFileSync(output+"/anchored-trust.json",JSON.stringify(extendedTrust,null,2)+"\n");
 writeFileSync(output+"/controller-process.json",JSON.stringify({observedAt:new Date().toISOString(),controller:controller.address,mode:"historical-observer",ownerKeyLoadedByController:false,sessionKeyLoadedByController:false,processSeparate:true,managementIsolation:false,anchorCount:anchors.length,forkDecision:statement,queryOutcomes:queries.map(q=>q.statement),status:status.data,financialTransactionsSubmitted:0,limits:["Imported after the original payment; does not prove pre-payment capture.","Same OS user; hostile-OS separation is not provided.","Synthetic controlled query adapter; not an actual LLM performance benchmark."]},null,2)+"\n");console.log(JSON.stringify({anchors:anchors.length,forkRejected:true,queryBudget:3,fourthQueryRejected:true,financialTransactionsSubmitted:0}));
}finally{child.kill("SIGTERM");await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once("exit",()=>resolve());});}
