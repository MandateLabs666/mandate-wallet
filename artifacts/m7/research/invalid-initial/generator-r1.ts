import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {encodeFunctionData,keccak256,toHex,hashTypedData,type Address,type Hex} from "viem";
import {localEnvironment} from "../examples/local-environment.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {registrationTypes,quoteTypes,nonceFor,type Payment} from "../sdk/model.js";

const protocol=JSON.parse(readFileSync("mandate/research/protocol.json","utf8"));
const directory=resolve(process.argv[2]??"artifacts/m7/research/invalid");mkdirSync(directory,{recursive:true});
const rowsPath=join(directory,"samples.ndjson");if(existsSync(rowsPath))throw Error("EXPERIMENT_OUTPUT_ALREADY_EXISTS");
const e=await localEnvironment({timestamp:protocol.genesisTimestamp});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
const save=(name:string,v:unknown)=>writeFileSync(join(directory,name),json(v)+"\n");
const selector=(name:string)=>keccak256(toHex(name+"()")).slice(0,10);
let state=Number(BigInt(protocol.seed))>>>0;
function next(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
const hash=(label:string,index:number)=>keccak256(toHex(protocol.protocolId+":"+protocol.seed+":"+label+":"+index));
const zero=("0x"+"00".repeat(32)) as Hex;
const domain={name:"MandateWallet",version:"2",chainId:31337,verifyingContract:e.wallet};
const rawRegistration=(p:Payment,d=domain)=>({domain:d,types:registrationTypes,primaryType:"RegisterPayment" as const,message:p});
const rawQuote=(p:Payment)=>({domain,types:quoteTypes,primaryType:"MerchantQuote" as const,message:p});
async function signatures(p:Payment,signer=e.agentA,d=domain){return {registration:await signer.signTypedData(rawRegistration(p,d)),quote:await e.merchantSigner.signTypedData(rawQuote(p))};}
async function callMany(inputs:{payment:Payment;signer?:typeof e.agentA;domain?:typeof domain}[]){
  const calls=[];
  for(const [id,input] of inputs.entries()){
    const sig=await signatures(input.payment,input.signer,input.domain),data=encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[input.payment,sig.registration,sig.quote]});
    calls.push({id,request:{jsonrpc:"2.0",id,method:"eth_call",params:[{from:e.operator.address,to:e.wallet,data},"latest"]},signatureHash:keccak256(sig.registration),quoteSignatureHash:keccak256(sig.quote),calldataHash:keccak256(data)});
  }
  const response=await fetch(e.node.rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(calls.map(c=>c.request)),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("LOCAL_RPC_HTTP_FAILURE");
  const results=await response.json() as {id:number;result?:Hex;error?:{code:number;data?:Hex;message?:string}}[];
  if(!Array.isArray(results)||results.length!==calls.length||new Set(results.map(r=>r.id)).size!==calls.length)throw Error("LOCAL_RPC_BATCH_INCOMPLETE");
  return calls.map(c=>{const result=results.find(r=>r.id===c.id);if(!result)throw Error("LOCAL_RPC_BATCH_ID_MISSING");return {...c,result};});
}
const start=performance.now();let completed=0,rejected=0,mismatched=0,controls=0;
try{
  const narrow=hash("narrow-session",0),expiry=(await e.reader.readBudget(e.root,e.sessions[0])).policy.expiresAt;
  await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[e.root,narrow,e.agentA.address,150000n,100000n,expiry,[e.steps[1]]]}));
  const now=(await e.pc.getBlock()).timestamp,step=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getStep",args:[e.root,1n,e.steps[0]]});
  const base:Payment={mandateId:e.root,policyVersion:1n,sessionId:e.sessions[0],sessionEpoch:1n,stepId:e.steps[0],merchantId:step.merchantId,requestHash:step.requestHash,quoteHash:hash("base-quote",0),to:e.merchantSigner.address,value:10000n,validAfter:0n,validBefore:now+300n,nonce:nonceFor(31337,e.wallet,e.root,e.steps[0])};
  // Raw EIP-712 generation deliberately bypasses SDK input validation.
  if(hashTypedData(rawRegistration(base))!==await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"registrationDigest",args:[base]})||hashTypedData(rawQuote(base))!==await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"quoteDigest",args:[base]}))throw Error("RAW_TYPED_DATA_ENCODER_MISMATCH");
  const controlInputs=[1n,1000n,10000n,50000n,100000n].map(value=>({payment:{...base,value}}));
  const controlResults=await callMany(controlInputs);if(controlResults.some(r=>r.result.error||!r.result.result))throw Error("LEGAL_CONTROLS_REJECTED");controls=controlResults.length;
  const sources=["mandate/research/protocol.json","mandate/research/invalid-calls.ts","mandate/examples/local-node.ts","mandate/examples/local-environment.ts","mandate/contracts/src/MandateAccount.sol","mandate/contracts/src/TestUSDC.sol","mandate/sdk/model.ts","pnpm-lock.yaml"];
  save("manifest.json",{schemaVersion:1,protocolId:protocol.protocolId,recordedAt:new Date().toISOString(),sourceBaseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceSHA256:Object.fromEntries(sources.map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),seed:protocol.seed,generator:"xorshift32 plus keccak256(protocolId:seed:category:globalIndex); batches preserve ordered RNG",genesisTimestamp:protocol.genesisTimestamp,blockTimestampIntervalSeconds:1,chainTimestamp:now,bindings:{wallet:e.wallet,asset:e.asset,owner:e.owner.address,agentA:e.agentA.address,agentB:e.agentB.address,merchant:e.merchantSigner.address,root:e.root,sessions:e.sessions,narrowSession:narrow,steps:e.steps},basePayment:base,publicTestMnemonicUsed:true,validMerchantQuoteProvidedForEveryInvalidCase:true,signaturesExported:false,newPublicTransactions:0});
  save("legal-controls.json",controlResults.map((r,i)=>({value:controlInputs[i].payment.value,accepted:!r.result.error,resultDigest:r.result.result,calldataHash:r.calldataHash})));
  const stateCheck=async()=>({occupied:(await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied,cash:await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]}),merchant:await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})});
  let expectedOccupied=0n;
  for(const category of protocol.invalidCalls.categories as string[]){
    if(category==="root-budget-exceeded"){
      const b={...base,sessionId:e.sessions[1],stepId:e.steps[1],requestHash:(await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getStep",args:[e.root,1n,e.steps[1]]})).requestHash,value:100000n,nonce:nonceFor(31337,e.wallet,e.root,e.steps[1]),validBefore:now+300n};
      const sig=await signatures(b,e.agentB);const receipt=await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[b,sig.registration,sig.quote]}));if(receipt.status!=="success")throw Error("BUDGET_STATE_PRECONDITION_FAILED");expectedOccupied=100000n;
    }
    for(let offset=0;offset<protocol.invalidCalls.samplesPerCategory;offset+=protocol.invalidCalls.transportBatchSize){
      const cases=[];
      for(let j=0;j<Math.min(protocol.invalidCalls.transportBatchSize,protocol.invalidCalls.samplesPerCategory-offset);j++){
        const index=completed+j,random=next(),p={...base,value:BigInt(1+random%100000),quoteHash:hash(category,index)};
        let error="InvalidPayment",signer=e.agentA,d=domain,predicate="";
        switch(category){
          case "zero-value":p.value=0n;predicate="value=0";break;
          case "above-single-cap":p.value=100001n+BigInt(random);predicate="value>100000";break;
          case "wrong-recipient":p.to=("0x"+hash("recipient",index).slice(-40)) as Address;predicate="recipient!=owner-approved payTo";break;
          case "wrong-request-hash":p.requestHash=hash("request",index);predicate="requestHash!=approved requestHash";break;
          case "wrong-merchant":p.merchantId=hash("merchant",index);predicate="merchantId!=approved step merchant";break;
          case "unapproved-step":p.stepId=hash("step",index);p.nonce=nonceFor(31337,e.wallet,e.root,p.stepId);predicate="step absent from policy/session";break;
          case "wrong-nonce":p.nonce=hash("nonce",index);predicate="nonce!=deterministic business nonce";break;
          case "zero-quote-hash":p.quoteHash=zero;predicate="quoteHash=0";break;
          case "nonzero-valid-after":p.validAfter=1n+BigInt(random);predicate="validAfter!=0";break;
          case "expired-payment":p.validBefore=now-BigInt(random%1000);predicate="validBefore<=chain timestamp";break;
          case "overlong-payment-window":p.validBefore=now+301n+BigInt(random%2000);predicate="validBefore>timestamp+300";break;
          case "wrong-policy-version":p.policyVersion=2n+BigInt(random%100000);error="InvalidSession";predicate="policyVersion!=current version=1";break;
          case "wrong-session-epoch":p.sessionEpoch=2n+BigInt(random%100000);error="InvalidSession";predicate="sessionEpoch!=current epoch=1";break;
          case "missing-session":p.sessionId=hash("session",index);error="InvalidSession";predicate="session does not exist";break;
          case "missing-mandate":p.mandateId=hash("root",index);p.nonce=nonceFor(31337,e.wallet,p.mandateId,p.stepId);error="InvalidSession";predicate="mandate does not exist";break;
          case "wrong-registration-signer":signer=e.agentB;error="InvalidSignature";predicate="signer B!=session A signer";break;
          case "wrong-chain-domain":d={...domain,chainId:31338+random%100000};error="InvalidSignature";predicate="signature chainId!=31337";break;
          case "wrong-wallet-domain":d={...domain,verifyingContract:("0x"+hash("wallet",index).slice(-40)) as Address};error="InvalidSignature";predicate="signature verifyingContract!=wallet";break;
          case "outside-session-step-subset":p.sessionId=narrow;predicate="narrow session allows BTC step only, payment uses ETH step";break;
          case "root-budget-exceeded":p.value=50001n+BigInt(random%50000);error="BudgetExceeded";predicate="value>remaining root budget 50000, value<=single cap 100000";break;
          default:throw Error("UNKNOWN_INVALID_CATEGORY");
        }
        cases.push({payment:p,signer,domain:d,index,category,predicate,expected:error,rng:random});
      }
      const results=await callMany(cases),lines=[];
      for(const [i,r] of results.entries()){
        const c=cases[i],actual=r.result.error?.data?.slice(0,10),correct=actual===selector(c.expected);if(r.result.error)rejected++;if(!correct)mismatched++;
        lines.push(json({index:c.index,category:c.category,rng:c.rng,payment:c.payment,signatureDomain:c.domain,registrationSigner:c.signer.address,quoteSigner:e.merchantSigner.address,invalidBecause:c.predicate,expectedError:c.expected,expectedSelector:selector(c.expected),actualSelector:actual??null,accepted:!r.result.error,matched:correct,registrationSignatureHash:r.signatureHash,quoteSignatureHash:r.quoteSignatureHash,calldataHash:r.calldataHash}));
      }
      appendFileSync(rowsPath,lines.join("\n")+"\n");completed+=cases.length;
      const observed=await stateCheck();if(observed.occupied!==expectedOccupied||observed.cash!==1000000n||observed.merchant!==0n)throw Error("STATE_CHANGED_BY_INVALID_CALLS");
      save("progress.json",{completed,rejected,mismatched,category,chainState:observed});
    }
    console.log(json({category,completed,rejected,mismatched}));
  }
  // Rejection tests must not make the remaining legitimate 0.05 payment impossible.
  const remaining={...base,value:50000n};const after=await callMany([{payment:remaining}]);if(after[0].result.error)throw Error("POST_ATTACK_LEGAL_CONTROL_REJECTED");controls++;
  save("summary.json",{schemaVersion:1,protocolId:protocol.protocolId,seed:protocol.seed,total:completed,rejected,mismatched,legalControlsAccepted:controls,categories:protocol.invalidCalls.categories.length,samplesPerCategory:protocol.invalidCalls.samplesPerCategory,elapsedMs:performance.now()-start,rawSamplesSHA256:createHash("sha256").update(readFileSync(rowsPath)).digest("hex"),statefulSetupReservations:1,endingRootOccupiedAtomic:"100000",endingMerchantPaidAtomic:"0",callsMode:"real-local-contract eth_call, no SDK validation gate",newPublicTransactions:0,allPassed:completed===10000&&rejected===completed&&mismatched===0});
  if(completed!==10000||rejected!==completed||mismatched)throw Error("INVALID_INPUT_EXPERIMENT_FAILED");
}finally{await e.close();}
