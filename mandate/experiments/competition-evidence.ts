// Read-only consolidation of already executed public transactions. No signer/config secrets.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createPublicClient,http,decodeFunctionData,keccak256,parseEventLogs,isAddressEqual,type Hex,type Address} from "viem";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {canonicalJson} from "../sdk/model.js";
const read=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
const out=resolve(process.argv[2]??"artifacts/competition/execution-index"),indexPath=join(out,"index.json");if(existsSync(indexPath))throw Error("COMPETITION_EVIDENCE_OUTPUT_EXISTS");mkdirSync(out,{recursive:true});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n",save=(p:string,v:unknown)=>writeFileSync(join(out,p),json(v));
const networks=read("mandate/networks/networks.json").networks,m5=read("artifacts/m5/lifecycle/base-sepolia.json"),bundle=read("artifacts/m5/lifecycle/public-bundle.json"),eth=read("artifacts/m3/11155111-acceptance.json"),m4=read("artifacts/m4/base-sepolia-http.json");
const sources=["mandate/experiments/competition-evidence.ts","mandate/networks/networks.json","artifacts/m3/84532-deployment.json","artifacts/m3/11155111-deployment.json","artifacts/m3/11155111-acceptance.json","artifacts/m3/public-evidence.json","artifacts/m4/base-sepolia-http.json","artifacts/m4/host-acceptance.json","artifacts/m5/lifecycle/base-sepolia.json","artifacts/m5/lifecycle/public-bundle.json","artifacts/m5/lifecycle/trusted-config.json","artifacts/m5/lifecycle/clean-public-verification.json","artifacts/m6/sdk/clean-environment/summary.json"];
type Selected={id:string;chainId:number;hash:Hex;wallet:Address;asset:Address;kind:string;expectedStatus:"success"|"reverted";functionName:string;source:string;payment?:any};
const selected:Selected[]=[];
for(const r of m5.ownerTransactions)selected.push({id:"base-m5:"+r.id,chainId:84532,hash:r.hash,wallet:m5.wallet,asset:m5.asset,kind:"owner",expectedStatus:"success",functionName:r.id==="M5:create-root"?"createMandate":"grantSession",source:"artifacts/m5/lifecycle/base-sepolia.json"});
selected.push({id:"base-m5:register",chainId:84532,hash:bundle.record.registrationHash,wallet:m5.wallet,asset:m5.asset,kind:"registration",expectedStatus:"success",functionName:"registerPayment",source:"artifacts/m5/lifecycle/public-bundle.json",payment:bundle.payment},{id:"base-m5:settle",chainId:84532,hash:bundle.record.settlementHash,wallet:m5.wallet,asset:m5.asset,kind:"settlement",expectedStatus:"success",functionName:"transferWithAuthorization",source:"artifacts/m5/lifecycle/public-bundle.json",payment:bundle.payment});
const revoked=m4.ownerTransactions.find((r:any)=>r.id==="revoke-probe");selected.push({id:"base-m4:revoke-probe",chainId:84532,hash:revoked.hash,wallet:m4.wallet,asset:m4.asset,kind:"owner",expectedStatus:"success",functionName:"revokeSession",source:"artifacts/m4/base-sepolia-http.json"});
const wanted:Record<string,string>={"create-mandate":"createMandate","grant-0":"grantSession","register-alpha":"registerPayment","reject-over-budget":"registerPayment","settle-alpha":"transferWithAuthorization","register-gamma":"registerPayment","revoke-agent-b":"revokeSession","revoked-settlement":"transferWithAuthorization","release-gamma":"releaseExpired"};
for(const r of eth.transactions)if(wanted[r.id])selected.push({id:"ethereum-m3:"+r.id,chainId:11155111,hash:r.hash,wallet:eth.wallet,asset:eth.asset,kind:r.id.includes("settle")?"settlement":r.id.includes("register")||r.id==="reject-over-budget"?"registration":"owner",expectedStatus:["reject-over-budget","revoked-settlement"].includes(r.id)?"reverted":"success",functionName:wanted[r.id],source:"artifacts/m3/11155111-acceptance.json",...(r.id==="settle-alpha"?{payment:eth.paid.payment}:r.id==="revoked-settlement"?{payment:eth.revocation.payment}:{})});
const observations:any[]=[];
try{
  for(const chainId of [84532,11155111]){
    const n=networks.find((n:any)=>n.chainId===chainId),urls=[n.rpc,n.witnessRpc];for(const u of urls){const parsed=new URL(u);if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search)throw Error("UNSAFE_PUBLIC_RPC_CONFIGURATION");}
    const pcs=urls.map(url=>createPublicClient({transport:http(url,{timeout:20000,retryCount:0})}));
    const ids=await Promise.all(pcs.map(pc=>pc.getChainId()));if(ids.some(id=>id!==chainId))throw Error("RPC_CHAIN_MISMATCH");
    const heads=await Promise.all(pcs.map(pc=>pc.getBlock({blockTag:"finalized"}))),common=heads.reduce((n,h)=>h.number!<n?h.number!:n,heads[0].number!);
    const finalized=await Promise.all(pcs.map(pc=>pc.getBlock({blockNumber:common})));if(finalized[0].hash!==finalized[1].hash)throw Error("FINALIZED_HEAD_DISAGREEMENT");
    const transactions=[];
    for(const item of selected.filter(s=>s.chainId===chainId)){
      const rs=await Promise.all(pcs.map(pc=>pc.getTransactionReceipt({hash:item.hash}))),txs=await Promise.all(pcs.map(pc=>pc.getTransaction({hash:item.hash})));
      const consensus=(r:typeof rs[0])=>({transactionHash:r.transactionHash,blockHash:r.blockHash,blockNumber:String(r.blockNumber),status:r.status,gasUsed:String(r.gasUsed),effectiveGasPrice:String(r.effectiveGasPrice),logs:r.logs.map(l=>({address:l.address,topics:l.topics,data:l.data,blockHash:l.blockHash,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,logIndex:l.logIndex,removed:l.removed}))});
      if(canonicalJson(consensus(rs[0]))!==canonicalJson(consensus(rs[1]))||rs[0].status!==item.expectedStatus||rs[0].blockNumber>common)throw Error("RECEIPT_DISAGREEMENT_OR_EXPECTATION_FAILED");
      const blocks=await Promise.all(pcs.map(pc=>pc.getBlock({blockNumber:rs[0].blockNumber})));if(blocks.some(b=>b.hash!==rs[0].blockHash))throw Error("RECEIPT_NOT_CANONICAL");
      const tx=txs[0];if(txs.some(t=>t.input!==tx.input||t.from!==tx.from||t.to!==tx.to||t.nonce!==tx.nonce||t.blockHash!==rs[0].blockHash))throw Error("TRANSACTION_DISAGREEMENT");
      const expectedTarget=item.functionName==="transferWithAuthorization"?item.asset:item.wallet;if(!tx.to||!isAddressEqual(tx.to,expectedTarget))throw Error("TRANSACTION_TARGET_MISMATCH");
      const decoded=decodeFunctionData({abi:item.functionName==="transferWithAuthorization"?testTokenAbi:accountAbi,data:tx.input});if(decoded.functionName!==item.functionName)throw Error("TRANSACTION_FUNCTION_MISMATCH");
      let paymentFacts:unknown;
      if(item.functionName==="transferWithAuthorization"){
        const a=decoded.args as readonly unknown[],p=item.payment;
        if(!p||String(a[0]).toLowerCase()!==item.wallet.toLowerCase()||String(a[1]).toLowerCase()!==p.to.toLowerCase()||String(a[2])!==p.value||String(a[3])!==p.validAfter||String(a[4])!==p.validBefore||a[5]!==p.nonce)throw Error("TOKEN_CALL_PAYMENT_MISMATCH");
        const logs=rs[0].logs.filter(l=>isAddressEqual(l.address,item.asset)),auth=parseEventLogs({abi:testTokenAbi,eventName:"AuthorizationUsed",logs}),transfers=parseEventLogs({abi:testTokenAbi,eventName:"Transfer",logs});
        if(item.expectedStatus==="success"&&(auth.filter(a=>isAddressEqual(a.args.authorizer,item.wallet)&&a.args.nonce===p.nonce).length!==1||transfers.filter(t=>isAddressEqual(t.args.from,item.wallet)&&isAddressEqual(t.args.to,p.to)&&String(t.args.value)===p.value).length!==1))throw Error("TOKEN_PAYMENT_EVENTS_MISSING");
        if(item.expectedStatus==="reverted"&&logs.length!==0)throw Error("FAILED_SETTLEMENT_HAS_LOGS");
        paymentFacts={from:item.wallet,to:p.to,valueAtomic:p.value,nonce:p.nonce,validAfter:p.validAfter,validBefore:p.validBefore,signatureExported:false};
      }
      transactions.push({...item,payment:undefined,...consensus(rs[0]),sender:tx.from,to:tx.to,nonce:tx.nonce,functionName:decoded.functionName,inputHash:keccak256(tx.input),evmGasFeeWei:String(rs[0].gasUsed*rs[0].effectiveGasPrice),...(paymentFacts?{paymentFacts}:{}),finalizedAtObservation:true,providersAgree:true});
      save("progress.json",{completed:observations.reduce((n,o)=>n+o.transactions.length,0)+transactions.length,planned:selected.length,chainId,newPublicTransactions:0});
    }
    observations.push({chainId,providers:urls,commonFinalized:{blockNumber:String(common),blockHash:finalized[0].hash},transactions});
  }
  const verified=read("artifacts/m5/lifecycle/clean-public-verification.json");if(!verified.requiredChecksPassed||verified.overall!=="incomplete"||!m5.final.sameHashOnRecovery||m4.revocation.settlementAccepted||!m4.revocation.prevalidationPassed)throw Error("HISTORICAL_SERVICE_OR_REFUSAL_EVIDENCE_FAILED");
  const index={schemaVersion:1,recordedAt:new Date().toISOString(),sourceBaseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),scope:"read-only consolidation of historical public executions plus current local replay instructions",publicNetworks:observations,selectedPublicTransactions:selected.length,newPublicTransactions:0,privateRuntimeRead:false,signersCreated:false,sourcesSHA256:Object.fromEntries(sources.map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),demoSteps:[
    {id:"D01",step:"Owner approves scope and session",slides:[2,3,4],publicEvidence:["base-m5:M5:create-root","base-m5:M5:grant-session"],localReplay:"SDK demo uses trusted local owner fixture; actual external-wallet/mobile approval remains unverified."},
    {id:"D02",step:"Register exact payment and reserve budget",slides:[4],publicEvidence:["base-m5:register"],requestHash:bundle.payment.requestHash,quoteHash:bundle.payment.quoteHash,amountAtomic:bundle.payment.value},
    {id:"D03",step:"Actual settlement; service fails separately",slides:[5,6],publicEvidence:["base-m5:settle"],firstResponse:m5.firstResponse,resourceUrl:m5.plan.resourceUrl,merchant:bundle.payment.to,asset:m5.asset,serviceEnvironment:"controlled loopback HTTP; historical origin may no longer be running"},
    {id:"D04",step:"Recover original order and validate result",slides:[5],publicEvidence:["base-m5:settle"],sameHashOnRecovery:m5.final.sameHashOnRecovery,payment:m5.final.payment,service:m5.final.service,result:m5.final.result,receipt:m5.final.receipt,evidenceBundle:"artifacts/m5/lifecycle/public-bundle.json"},
    {id:"D05",step:"Independent public evidence checks",slides:[8],bundle:"artifacts/m5/lifecycle/public-bundle.json",trust:"artifacts/m5/lifecycle/trusted-config.json",report:"artifacts/m5/lifecycle/clean-public-verification.json",requiredChecksPassed:verified.requiredChecksPassed,overall:verified.overall},
    {id:"D06",step:"Revoke after prevalidation and reject settlement",slides:[7],publicEvidence:["base-m4:revoke-probe","ethereum-m3:revoke-agent-b","ethereum-m3:revoked-settlement"],httpRefusal:m4.revocation,scopeDifference:"Base M4 HTTP refusal and Ethereum M3 reverted token transaction are different experiments, not one fabricated combined run."},
    {id:"D07",step:"Budget rejection and safe release",slides:[7],publicEvidence:["ethereum-m3:reject-over-budget","ethereum-m3:release-gamma"],occupiedAfterRelease:eth.final.rootOccupied,releasedStepStillUsed:eth.final.releasedStepStillUsed},
    {id:"D08",step:"Replay purchase/recovery/evidence/revoke locally",slides:[12],command:"pnpm sdk:demo /absolute/new-output-directory",script:"mandate/examples/local-demo.ts",historicalCleanDemo:"artifacts/m6/sdk/clean-environment/summary.json",label:"real local EVM/HTTP execution with mock token; no new public payment; trusted fixture owner"}
  ],limitations:["Third-party RPC agreement/finalized tags are observations, not independent consensus verification.","Historical grants/funds may be expired/revoked/exhausted. A past successful purchase is not an active new authorization.","Controlled merchant/reference facilitator and fixture token on Ethereum are explicit; no third-party production merchant or mainnet claim.","Source paths preserve the historical versions of each experiment; this consolidation does not rewrite execution history.","Payment calldata/signatures and raw signed transactions are not exported; only input hashes and necessary public fields are retained.","This evidence index is not a recorded demo video, a final release freeze, an organizer confirmation or an independent audit."]};
  save("index.json",index);console.log(json({selectedPublicTransactions:selected.length,networks:observations.length,newPublicTransactions:0,allPassed:true}).trim());
}catch(error){save("failure.json",{recordedAt:new Date().toISOString(),code:error instanceof Error?error.message.split("\n")[0]:"READ_ONLY_EVIDENCE_FAILED",completedNetworks:observations.length,newPublicTransactions:0});throw Error("COMPETITION_READ_ONLY_EVIDENCE_FAILED");}
