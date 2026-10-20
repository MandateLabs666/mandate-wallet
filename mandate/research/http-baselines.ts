import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {encodeFunctionData,keccak256,toHex,type Hex} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {localEnvironment} from "../examples/local-environment.js";
import {TEST_MNEMONIC} from "../examples/local-node.js";
import {EOABaselineClient} from "./eoa-client.js";
import {startEOAMerchant} from "./eoa-merchant.js";
import {PurchaseStore,type PurchaseRecord} from "../services/store.js";
import {PurchaseClient} from "../services/client.js";
import {SafeHttp} from "../services/http.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {decodePayment,canonicalJson,MandateError} from "../sdk/model.js";
import {independentlyVerify} from "../sdk/independent-verification.js";
import {EvidenceJournal} from "../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../evidence/recorder.js";
import {exportPurchaseBundle,type VerifierTrust} from "../evidence/bundle.js";
import {SessionController} from "../evidence/controller.js";
import {ControllerClient,serveController} from "../evidence/controller-http.js";
import {signEnvelope} from "../evidence/controller-model.js";
import {expectedStats} from "../services/datasets.js";

const protocol=JSON.parse(readFileSync("mandate/research/protocol.json","utf8")),directory=resolve(process.argv[2]??"artifacts/m7/benchmarks/http"),smoke=process.argv.includes("--smoke");
mkdirSync(directory,{recursive:true});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x,2)+"\n",save=(name:string,v:unknown)=>{const path=directory+"/"+name;mkdirSync(resolve(path,".."),{recursive:true});writeFileSync(path,json(v));};
if(existsSync(directory+"/summary.json"))throw Error("BASELINE_OUTPUT_ALREADY_EXISTS");
const results:any[]=[];
type ResearchBundle=Awaited<ReturnType<typeof exportPurchaseBundle>>&{externalAnchors?:ReturnType<SessionController["exportAnchors"]>};
const compiledArtifacts:Record<string,unknown>={};
for(const name of ["MandateAccount","TestUSDC"]){
  const path=`mandate/contracts/out/${name}.sol/${name}.json`,raw=readFileSync(path),artifact=JSON.parse(raw.toString());
  for(const [file,value] of Object.entries(artifact.metadata.sources) as [string,{keccak256:Hex}][])if(keccak256(readFileSync(resolve("mandate/contracts",file)))!==value.keccak256)throw Error("HTTP_BASELINE_COMPILED_SOURCE_MISMATCH");
  compiledArtifacts[name]={artifactSHA256:createHash("sha256").update(raw).digest("hex"),compiler:artifact.metadata.compiler.version,allCompiledSourcesMatchCurrentFiles:true};
}
function instrument(object:any,name:string,phase:string,phases:Record<string,number>,counts:Record<string,number>){
  const original=object[name].bind(object);object[name]=async(...args:any[])=>{const start=performance.now();counts[phase]=(counts[phase]??0)+1;try{return await original(...args);}finally{phases[phase]=(phases[phase]??0)+performance.now()-start;}};
}
async function trial(baseline:string,task:any,repeat:number){
  // Existing signed-offer discovery and live-controller clocks use wall time.
  // Keep their checks enabled; record each trial's wall-aligned local genesis.
  const genesisTimestamp=Math.floor(Date.now()/1000),e=await localEnvironment({timestamp:genesisTimestamp,priceAtomic:task.priceAtomic,failAfterPayment:task.mode==="paid-500-recover",signedOffersAndReceipts:true});
  let ordinary:Awaited<ReturnType<typeof startEOAMerchant>>|undefined,ordinaryStore:PurchaseStore|undefined,journal:EvidenceJournal|undefined;
  const controllers:SessionController[]=[],controllerServers:Awaited<ReturnType<typeof serveController>>[]=[],controllerClients:ControllerClient[]=[],envelopes:any[]=[];
  const phases:Record<string,number>={},counts:Record<string,number>={},attempts:any[]=[];
  try{
    const services=e.services.map(s=>({...s}));let clients:(PurchaseClient|EOABaselineClient)[],recorders:PurchaseEvidenceRecorder[]=[];
    if(baseline==="B1"){
      await e.send(e.asset,encodeFunctionData({abi:testTokenAbi,functionName:"mint",args:[e.agentA.address,1000000n]}));
      ordinary=await startEOAMerchant(e,{priceAtomic:task.priceAtomic,failAfterPayment:task.mode==="paid-500-recover"});
      for(let i=0;i<services.length;i++)services[i].url=ordinary.origin+"/stats?asset="+(i===0?"ETH":"BTC");
      ordinaryStore=new PurchaseStore(join(e.directory,"eoa-client.sqlite"));const http=new SafeHttp({allowOrigins:[ordinary.origin],testLoopbackOrigins:[ordinary.origin]});instrument(http,"request","clientHTTP",phases,counts);
      clients=[0,1].map(i=>new EOABaselineClient(e,ordinaryStore!,http,services,"agent-"+i));
    }else{
      if(baseline!=="B2")journal=new EvidenceJournal(join(e.directory,"bench-evidence.sqlite"));
      for(let i=0;i<2;i++){
        if(baseline==="B4"&&(task.mode==="two-agents"||i===0)){
          const now=Math.floor(Date.now()/1000),scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[i],policyVersion:"1",sessionEpoch:"1",signer:i===0?e.agentA.address:e.agentB.address};
          const usedSteps=task.mode==="two-agents"?[e.steps[i]]:[e.steps[task.asset==="BTC"?1:0]];
          const signer=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:6+i}),envelope=await signEnvelope(e.owner,{schemaVersion:2,scope,mode:"live",stepIds:usedSteps,maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+3600,checkpointDeadlineSeconds:300,expectedKinds:["pre-payment","registration","payment","service"]});
          const controller=await SessionController.create(join(e.directory,"controller-"+i+".sqlite"),envelope,signer,async step=>expectedStats(step===e.steps[0]?"ETH":"BTC"),{owner:e.owner.address,scope}),server=await serveController(controller);
          const client=new ControllerClient(server.origin,envelope,i===0?e.agentA:e.agentB,signer.address,new SafeHttp({allowOrigins:[server.origin],testLoopbackOrigins:[server.origin]}),join(e.directory,"controller-request-"+i+".json"));
          instrument(client,"query","controllerQuery",phases,counts);instrument(client,"anchor","controllerAnchor",phases,counts);controllers.push(controller);controllerServers.push(server);controllerClients.push(client);envelopes.push(envelope);
        }
        if(journal)recorders.push(new PurchaseEvidenceRecorder(journal,e.reader,e.context(i),controllerClients[i]));
      }
      clients=[0,1].map(i=>new PurchaseClient(e.context(i),e.reader,e.transactions,e.http,e.store,recorders[i]));instrument(e.http,"request","clientHTTP",phases,counts);
    }
    for(const account of [e.agentA,e.agentB])instrument(account,"signTypedData","agentSigning",phases,counts);
    instrument(e.transactions,"prepare","registrationPrepare",phases,counts);instrument(e.transactions,"send","registrationSubmit",phases,counts);instrument(e.facilitator,"verify","facilitatorVerify",phases,counts);instrument(e.facilitator,"settle","facilitatorSettle",phases,counts);
    if(journal){instrument(journal,"append","journalAppend",phases,counts);instrument(journal,"action","actionProof",phases,counts);}
    let loseOnce=task.mode==="lost-http-recover";
    const transport=baseline==="B1"?(clients[0] as EOABaselineClient).http:e.http,request=transport.request.bind(transport);
    transport.request=async(url,options)=>{const response=await request(url,options);if(loseOnce&&options?.headers?.["PAYMENT-SIGNATURE"]){loseOnce=false;throw new MandateError("BENCH_HTTP_RESPONSE_LOST_AFTER_SERVER_COMPLETED");}return response;};
    const payer=baseline==="B1"?e.agentA.address:e.wallet,initialCash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[payer]}),started=performance.now(),queried=new Set<string>();
    const selected=task.asset==="BTC"?1:0;
    async function call(agent:number,index:number){
      const service=services[index];
      if(baseline==="B4"&&!queried.has(agent+":"+service.stepId)){
        const response=await controllerClients[agent].query(service.stepId,keccak256(toHex(`bench:${task.id}:${repeat}:${agent}:${service.stepId}`)));
        if(response.statement.outcome!=="completed"||!service.checkResult(response.result))throw Error("BENCH_CONTROLLER_QUERY_FAILED");queried.add(agent+":"+service.stepId);
      }
      const t=performance.now(),record=await clients[agent].call(service.serviceId);attempts.push({agent,stepId:service.stepId,elapsedMs:performance.now()-t,payment:record.paymentState,service:record.serviceState,result:record.resultState,settlementHash:record.settlementHash,errorCode:record.errorCode??null});return record;
    }
    const targets=task.mode==="two-agents"?[{agent:0,index:0},{agent:1,index:1}]:[{agent:0,index:selected}];
    let records=await Promise.all(targets.map(t=>call(t.agent,t.index)));
    if(task.mode==="duplicate-step")records=[await call(0,selected)];
    if(["paid-500-recover","lost-http-recover"].includes(task.mode))records=[await call(0,selected)];
    for(let retry=0;retry<3&&records.some(r=>r.paymentState!=="paid"||r.serviceState!=="returned"||r.resultState!=="valid");retry++)records=await Promise.all(targets.map((t,i)=>records[i]?.paymentState==="paid"&&records[i]?.serviceState==="returned"&&records[i]?.resultState==="valid"?records[i]:call(t.agent,t.index)));
    const purchaseMs=performance.now()-started;
    if(records.some(r=>r.paymentState!=="paid"||r.serviceState!=="returned"||r.resultState!=="valid"||r.receiptEvidence?.status!=="confirmed"))throw Error("BENCH_PURCHASE_RESULT_FAILED");
    const checkStart=performance.now(),cash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[payer]}),merchant=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]}),expected=BigInt(task.priceAtomic)*BigInt(task.expectedPayments);
    if(initialCash!==1000000n||initialCash-cash!==expected||merchant!==expected||e.facilityStore.transactionRows().length!==task.expectedPayments)throw Error("BENCH_ACTUAL_PAYMENT_OR_DUPLICATE_MISMATCH");
    const occupied=baseline==="B1"?ordinaryStore!.all().filter(r=>!!r.payment).reduce((n,r)=>n+BigInt(r.payment!.value),0n):(await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied;if(occupied!==expected)throw Error("BENCH_OCCUPANCY_MISMATCH");
    const transactionRows=[...e.facilityStore.transactionRows().map(r=>({...r,kind:"settlement"})),...e.store.transactionRows().map(r=>({...r,kind:"registration"}))],transactions=[];
    if(transactionRows.filter(t=>t.kind==="registration").length!==(baseline==="B1"?0:task.expectedPayments))throw Error("BENCH_REGISTRATION_COUNT_MISMATCH");
    for(const row of transactionRows){const r=await e.pc.getTransactionReceipt({hash:row.hash});if(r.status!=="success"||(await e.pc.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash)throw Error("BENCH_RECEIPT_NOT_CANONICAL");transactions.push({kind:row.kind,hash:r.transactionHash,blockNumber:String(r.blockNumber),blockHash:r.blockHash,gasUsed:String(r.gasUsed),effectiveGasPrice:String(r.effectiveGasPrice),transactionFeeWei:String(r.gasUsed*r.effectiveGasPrice),logs:r.logs});}
    const runtimeHashes={token:keccak256((await e.pc.getCode({address:e.asset}))!),mandateAccount:baseline==="B1"?null:keccak256((await e.pc.getCode({address:e.wallet}))!)};phases.postChecks=performance.now()-checkStart;
    const evidence:any[]=[],contexts:{record:PurchaseRecord;p:ReturnType<typeof decodePayment>;recorder:PurchaseEvidenceRecorder;bundle:ResearchBundle;trust:VerifierTrust;agent:number;prefix:string}[]=[];let fullVerificationMs=0,fullExportMs=0;
    if(journal)for(let i=0;i<records.length;i++){
      const record=records[i],target=targets[i],recorder=recorders[target.agent],p=decodePayment(record.payment!),t=performance.now(),bundle=await exportPurchaseBundle(recorder,record,p,{discloseRequest:true,discloseResult:true}) as ResearchBundle;
      fullExportMs+=performance.now()-t;
      const trust:VerifierTrust={schemaVersion:2,chainId:31337,wallet:e.wallet,asset:e.asset,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),owner:e.owner.address,mandateId:e.root,sessionId:p.sessionId,sessionSigner:recorder.context.signer.address,merchantId:p.merchantId,merchantSigner:e.merchantSigner.address,payTo:e.merchantSigner.address,resourceUrl:services[target.index].url,requestHash:p.requestHash,rootBudgetAtomic:"150000",maxPerPaymentAtomic:"100000",startBlock:String(e.context(0).startBlock),rpcs:[e.node.rpc],confirmations:1,resultChecker:target.index===0?"ETH-stats-v2":"BTC-stats-v2"};
      if(baseline==="B4"){
        const anchors=controllers[target.agent].exportAnchors();bundle.externalAnchors=anchors;trust.controllerSigner=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:6+target.agent}).address;trust.controllerEnvelope=envelopes[target.agent];trust.controllerSnapshot={lastSequence:anchors.at(-1)!.checkpoint.header.sequence,lastRoot:anchors.at(-1)!.checkpoint.root};
      }
      const verifyStart=performance.now(),verified=await independentlyVerify(bundle,trust);fullVerificationMs+=performance.now()-verifyStart;
      if(!verified.report.requiredChecksPassed)throw Error("BENCH_INDEPENDENT_VERIFICATION_FAILED");
      const prefix=`${baseline}-${task.id}-${repeat}/evidence-${i}`;save(prefix+"-bundle.json",bundle);save(prefix+"-trust.json",trust);save(prefix+"-verification.json",verified);
      evidence.push({prefix,fullBytes:Buffer.byteLength(JSON.stringify(bundle)),checkpointCount:bundle.checkpoints.length,requiredChecksPassed:verified.report.requiredChecksPassed,overall:verified.report.overall,controllerAnchors:bundle.externalAnchors?.length??0});
      contexts.push({record,p,recorder,bundle,trust,agent:target.agent,prefix});
    }
    phases.fullExport=fullExportMs;phases.independentVerification=fullVerificationMs;
    const fullTaskMs=performance.now()-started;
    const row={baseline,caseId:task.id,repeat,bindings:{payer,asset:e.asset,owner:e.owner.address,root:e.root,merchant:e.merchantSigner.address,registrationOperator:e.operator.address},runtimeHashes,genesisTimestamp,clockMode:"wall-aligned-genesis-and-one-second-block-interval",mode:task.mode,dataset:task.asset,priceAtomic:task.priceAtomic,actualPaidAtomic:String(initialCash-cash),merchantReceivedAtomic:String(merchant),occupiedAtomic:String(occupied),budgetAuthority:baseline==="B1"?"honest-local-state":"on-chain-shared-root",payerCashAtomic:String(cash),paymentCount:e.facilityStore.transactionRows().length,expectedPaymentCount:task.expectedPayments,duplicatePayments:Math.max(0,e.facilityStore.transactionRows().length-task.expectedPayments),payment:"paid",service:"returned",result:"valid",attempts,phasesMs:{...phases,purchase:purchaseMs,total:fullTaskMs},phaseCounters:{...counts},nestedPhaseTotalsMustNotBeSummed:true,transactions,totalGasUsed:String(transactions.reduce((n,r)=>n+BigInt(r.gasUsed),0n)),totalTransactionFeeWei:String(transactions.reduce((n,r)=>n+BigInt(r.transactionFeeWei),0n)),evidence,newPublicTransactions:0,setupExcluded:true,unusedMandateInitializerInB1:baseline==="B1"};
    if(baseline==="B4")for(let i=0;i<controllers.length;i++){const inspection=await controllers[i].inspect();if(inspection.queries.some((q:any)=>q.charged>3))throw Error("BENCH_QUERY_BUDGET_EXCEEDED");save(`${baseline}-${task.id}-${repeat}/controller-${i}.json`,inspection);}
    save(`${baseline}-${task.id}-${repeat}/result.json`,row);
    // Secondary disclosure and interference probes are outside primary task timing.
    for(const c of contexts){
      const t=performance.now(),minimal=await exportPurchaseBundle(c.recorder,c.record,c.p,{discloseRequest:false,discloseResult:false}) as ResearchBundle;
      if(c.bundle.externalAnchors)minimal.externalAnchors=c.bundle.externalAnchors;
      const checked=await independentlyVerify(minimal,c.trust);if(!checked.report.requiredChecksPassed||checked.report.checks.find(x=>x.name==="result")?.status!=="incomplete")throw Error("BENCH_MINIMAL_DISCLOSURE_CHECK_FAILED");
      save(c.prefix+"-minimal-bundle.json",minimal);save(c.prefix+"-minimal-check.json",{...checked,bytes:Buffer.byteLength(JSON.stringify(minimal)),elapsedMs:performance.now()-t,excludedFromPrimaryTiming:true});
    }
    if(task.id==="N03"&&repeat===0&&contexts.length){
      const c=contexts[0],damaged=JSON.parse(JSON.stringify(c.bundle));damaged.checkpoints[0].disclosures[0].value="tampered-fixture";
      const tamper=await independentlyVerify(damaged,c.trust);if(tamper.report.requiredChecksPassed)throw Error("BENCH_TAMPER_ACCEPTED");
      save(c.prefix+"-tamper-check.json",tamper);
      const extra=await journal!.append(c.recorder.context.signer,c.recorder.scope(c.p),c.p.stepId,"decision","bench-neutral-tail",{errorCode:"BENCH_NEUTRAL_TAIL_OBSERVATION"});
      if(baseline==="B4")await controllerClients[c.agent].anchor(extra);
      const tail=await exportPurchaseBundle(c.recorder,c.record,c.p,{discloseRequest:true,discloseResult:true}) as ResearchBundle,trust={...c.trust};
      if(baseline==="B4"){tail.externalAnchors=controllers[c.agent].exportAnchors();trust.controllerSnapshot={lastSequence:extra.header.sequence,lastRoot:extra.root};}
      const complete=await independentlyVerify(tail,trust);if(!complete.report.requiredChecksPassed)throw Error("BENCH_TAIL_CONTROL_REJECTED");
      const prefix=JSON.parse(JSON.stringify(tail));prefix.checkpoints.pop();const omitted=await independentlyVerify(prefix,trust);
      if(omitted.report.requiredChecksPassed!==(baseline==="B3"))throw Error("BENCH_TAIL_BOUNDARY_MISMATCH");
      save(c.prefix+"-tail-probe.json",{baseline,extraRoot:extra.root,fullAccepted:complete.report.requiredChecksPassed,omittedTailAccepted:omitted.report.requiredChecksPassed,expected:baseline==="B3"?"unanchored tail cannot be proven absent":"pinned retained head detects omitted tail",report:omitted,excludedFromPrimaryTiming:true});
      if(baseline==="B4"){
        const responses=[];for(let i=0;i<3;i++)responses.push((await controllerClients[c.agent].query(c.p.stepId,keccak256(toHex("bench-grinding:"+i)))).statement);
        const inspected=await controllers[c.agent].inspect();if(responses.filter(r=>r.outcome==="completed").length!==2||responses[2].outcome!=="rejected"||!(inspected.queries as any[]).every(q=>q.charged===3))throw Error("BENCH_GRINDING_BUDGET_FAILED");
        save(c.prefix+"-grinding-probe.json",{responses,inspection:inspected,excludedFromPrimaryTiming:true,limitation:"limits this controller envelope only; out-of-band calls remain outside its guarantee"});
      }
    }
    return row;
  }catch(error){save(`${baseline}-${task.id}-${repeat}/failure.json`,{baseline,caseId:task.id,repeat,code:error instanceof MandateError?error.code:error instanceof Error?error.message.split("\n")[0]:"BENCH_UNKNOWN",attempts,phasesMs:phases,newPublicTransactions:0});throw error;}
  finally{for(const server of controllerServers)await server.close();for(const controller of controllers)controller.close();journal?.close();ordinaryStore?.close();await ordinary?.close();await e.close();}
}
const tasks=smoke?protocol.normalTasks.filter((t:any)=>["N03","N07","N09","N10"].includes(t.id)):protocol.normalTasks;
const repetitions=smoke?1:protocol.normalRepetitions;
for(const task of tasks)for(let repeat=0;repeat<repetitions;repeat++){
  const base=["B1","B2","B3","B4"],rotation=(Number(task.id.slice(1))+repeat)%base.length,order=[...base.slice(rotation),...base.slice(0,rotation)];
  for(const baseline of order){const row=await trial(baseline,task,repeat);results.push(row);save("progress.json",{completed:results.length,latest:{baseline,caseId:task.id,repeat},smoke});console.log(JSON.stringify({baseline,caseId:task.id,repeat,paid:row.actualPaidAtomic,gas:row.totalGasUsed,totalMs:row.phasesMs.total}));}
}
const sources=["mandate/research/http-baselines.ts","mandate/research/eoa-client.ts","mandate/research/eoa-merchant.ts","mandate/research/protocol.json","mandate/services/quote.ts","mandate/examples/local-environment.ts","mandate/examples/local-node.ts","dist/mandate-evidence-verifier.js","pnpm-lock.yaml"];
save("manifest.json",{schemaVersion:1,protocolId:protocol.protocolId,sourceBaseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceSHA256:Object.fromEntries(sources.map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),compiledArtifacts,smoke,caseOrder:"case/repetition blocks, rotate baseline order by case number + repetition",clockMode:"per-trial wall-aligned genesis; no signed-offer/controller clock bypass",newPublicTransactions:0});
save("summary.json",{schemaVersion:1,smoke,completed:results.length,planned:tasks.length*repetitions*4,baselines:["B1","B2","B3","B4"],allPassed:results.length===tasks.length*repetitions*4,comparativeTaskAcceptance:false,newPublicTransactions:0});
