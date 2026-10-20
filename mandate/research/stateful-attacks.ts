import {mkdirSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {createWalletClient,http,encodeFunctionData,keccak256,toHex,BaseError,ContractFunctionRevertedError,type Hex,type Address} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {localEnvironment} from "../examples/local-environment.js";
import {TEST_MNEMONIC} from "../examples/local-node.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {registrationTypedData,merchantQuoteTypedData,paymentTypedData,decodePayment,nonceFor,type Payment} from "../sdk/model.js";
import {SessionController} from "../evidence/controller.js";
import {signEnvelope} from "../evidence/controller-model.js";

type Env=Awaited<ReturnType<typeof localEnvironment>>;
const out=resolve(process.argv[2]??"artifacts/m7/benchmarks/stateful");
if(existsSync(join(out,"summary.json")))throw Error("RESEARCH_OUTPUT_ALREADY_EXISTS");
mkdirSync(out,{recursive:true});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x,2)+"\n";
const save=(name:string,v:unknown)=>writeFileSync(join(out,name),json(v));
const check=(v:unknown,label:string)=>{if(!v)throw Error(label);};
const h=(s:string)=>keccak256(toHex("m7-stateful:"+s));
const results:unknown[]=[];
async function rejected(call:()=>Promise<unknown>,expected:string){
  try{await call();}catch(error){
    const revert=error instanceof BaseError?error.walk(x=>x instanceof ContractFunctionRevertedError):undefined;
    const data=revert instanceof ContractFunctionRevertedError?revert.data:undefined;
    const actual=data?.errorName==="Error"?String(data.args?.[0]):data?.errorName;
    if(actual!==expected)throw Error("UNEXPECTED_REVERT:"+String(actual)+":expected:"+expected);
    return {expected,actual,accepted:false};
  }
  throw Error("INVALID_OPERATION_ACCEPTED:"+expected);
}
async function payment(e:Env,index:number,value:bigint,session=e.sessions[index]):Promise<Payment>{
  const policy=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getPolicy",args:[e.root]}),grant=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getSession",args:[e.root,session]}),step=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getStep",args:[e.root,policy.version,e.steps[index]]});
  return {mandateId:e.root,policyVersion:policy.version,sessionId:session,sessionEpoch:grant.epoch,stepId:e.steps[index],merchantId:step.merchantId,requestHash:step.requestHash,quoteHash:h("quote:"+index+":"+value),to:e.merchantSigner.address,value,validAfter:0n,validBefore:(await e.pc.getBlock()).timestamp+300n,nonce:nonceFor(31337,e.wallet,e.root,e.steps[index])};
}
async function registration(e:Env,p:Payment,signer=e.agentA){return {address:e.wallet,abi:accountAbi,functionName:"registerPayment" as const,args:[p,await signer.signTypedData(registrationTypedData(31337,e.wallet,p)),await e.merchantSigner.signTypedData(merchantQuoteTypedData(31337,e.wallet,p))] as const,account:e.operator.address};}
async function register(e:Env,p:Payment,signer=e.agentA){const r=await registration(e,p,signer);return e.send(e.wallet,encodeFunctionData(r));}
async function signature(e:Env,p:Payment,signer=e.agentA,from=e.wallet){return signer.signTypedData(paymentTypedData({name:"USDC",version:"2",chainId:31337,verifyingContract:e.asset},from,p));}
const transfer=(e:Env,p:Payment,sig:Hex,from=e.wallet)=>({address:e.asset,abi:testTokenAbi,functionName:"transferWithAuthorization" as const,args:[from,p.to,p.value,p.validAfter,p.validBefore,p.nonce,sig] as const,account:e.operator.address});
async function settle(e:Env,p:Payment,sig:Hex,from=e.wallet){return e.send(e.asset,encodeFunctionData(transfer(e,p,sig,from)));}
async function state(e:Env){return {policy:await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getPolicy",args:[e.root]}),cash:await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]}),merchant:await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})};}
async function receipt(e:Env,r:any){check((await e.pc.getBlock({blockNumber:r.blockNumber})).hash===r.blockHash,"NONCANONICAL_RECEIPT");return {hash:r.transactionHash,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash,gasUsed:r.gasUsed,effectiveGasPrice:r.effectiveGasPrice,feeWei:r.gasUsed*r.effectiveGasPrice,logs:r.logs};}
async function run(id:string,f:(e:Env)=>Promise<unknown>){
  const e=await localEnvironment({timestamp:Math.floor(Date.now()/1000),signedOffersAndReceipts:true});
  try{const detail=await f(e);const row={id,passed:true,bindings:{wallet:e.wallet,asset:e.asset,owner:e.owner.address,sessionSigners:[e.agentA.address,e.agentB.address]},runtimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),detail,endingState:await state(e),samples:1,newPublicTransactions:0};save(id+".json",row);results.push(row);console.log(id+":passed");}
  catch(error){save(id+"-failure.json",{id,passed:false,code:error instanceof Error?error.message.split("\n")[0]:"UNKNOWN"});throw error;}
  finally{await e.close();}
}

await run("concurrent-root-budget",async e=>{
  const ps=[await payment(e,0,100000n),await payment(e,1,100000n)],requests=[await registration(e,ps[0]),await registration(e,ps[1],e.agentB)];
  for(const r of requests)await e.pc.simulateContract(r);
  const senders=[e.operator,mnemonicToAccount(TEST_MNEMONIC,{addressIndex:8})],hashes:Hex[]=[];
  await e.pc.request({method:"evm_setAutomine" as never,params:[false] as never});
  try{
    for(let i=0;i<2;i++){const wc=createWalletClient({chain:e.chain,account:senders[i],transport:http(e.node.rpc)});hashes.push(await wc.sendTransaction({to:e.wallet,data:encodeFunctionData(requests[i]),gas:1000000n}));}
    await e.pc.request({method:"evm_mine" as never,params:[] as never});
  }finally{await e.pc.request({method:"evm_setAutomine" as never,params:[true] as never});}
  const rs=await Promise.all(hashes.map(hash=>e.pc.waitForTransactionReceipt({hash}))),winner=rs.findIndex(r=>r.status==="success"),loser=1-winner;
  check(rs.filter(r=>r.status==="success").length===1&&rs[0].blockHash===rs[1].blockHash,"CONCURRENCY_NOT_CHAIN_ENFORCED");
  const denied=await rejected(()=>e.pc.simulateContract(requests[loser]),"BudgetExceeded");
  check((await state(e)).policy.occupied===100000n,"ROOT_OCCUPANCY_WRONG");
  const paid=await settle(e,ps[winner],await signature(e,ps[winner],winner===0?e.agentA:e.agentB));check((await state(e)).merchant===100000n,"WINNER_NOT_PAID");
  return {bothInitiallyValid:true,distinctTransactionSenders:senders.map(s=>s.address),registrationReceipts:await Promise.all(rs.map(r=>receipt(e,r))),winner,loser,denied,settlement:await receipt(e,paid)};
});
await run("session-budget-subset",async e=>{
  const expiry=(await state(e)).policy.expiresAt,narrow=h("narrow"),subset=h("subset");
  await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[e.root,narrow,e.agentA.address,50000n,50000n,expiry,e.steps]}));
  const first=await register(e,await payment(e,0,30000n,narrow));
  const psBudget=await payment(e,1,30000n,narrow),budget=await rejected(()=>registration(e,psBudget).then(r=>e.pc.simulateContract(r)),"BudgetExceeded");
  await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[e.root,subset,e.agentA.address,50000n,50000n,expiry,[e.steps[0]]]}));
  const psSubset=await payment(e,1,10000n,subset),scope=await rejected(()=>registration(e,psSubset).then(r=>e.pc.simulateContract(r)),"InvalidPayment");
  const other=await register(e,await payment(e,1,10000n),e.agentB),grant=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getSession",args:[e.root,narrow]});
  check(grant.occupied===30000n&&(await state(e)).policy.occupied===40000n,"SUBSET_ACCOUNTING_WRONG");
  return {budget,scope,narrowOccupied:grant.occupied,rootRemainingBeforeDenial:120000,legalRegistrations:await Promise.all([first,other].map(r=>receipt(e,r)))};
});
await run("same-step-replay",async e=>{
  const a=await e.clients[0].call(e.services[0].serviceId),b=await e.clients[0].call(e.services[0].serviceId);
  check(a.paymentState==="paid"&&b.paymentState==="paid"&&a.settlementHash===b.settlementHash&&e.facilityStore.transactionRows().length===1,"DUPLICATE_PAYMENT");
  const p=decodePayment(a.payment!),sig=await signature(e,p),replay=await rejected(()=>e.pc.simulateContract(transfer(e,p,sig)),"used");
  check((await state(e)).merchant===10000n,"REPLAY_BALANCE_WRONG");
  return {settlementHash:a.settlementHash,sameHashOnRetry:true,settlementTransactions:1,replay};
});
await run("prevalidate-then-revoke",async e=>{
  const verify=e.facilitator.verify.bind(e.facilitator),settleOriginal=e.facilitator.settle.bind(e.facilitator);let preverified=false,revoked=false;
  e.facilitator.verify=async(...args)=>{const r=await verify(...args);if(r.isValid)preverified=true;return r;};
  e.facilitator.settle=async(...args)=>{if(!revoked){check(preverified,"PREVERIFY_NOT_PASSED");await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[e.root,e.sessions[0]]}));revoked=true;}return settleOriginal(...args);};
  const record=await e.clients[0].call(e.services[0].serviceId),p=decodePayment(record.payment!),sig=await signature(e,p),valid=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"isValidSignature",args:[await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]}),sig]});
  const s=await state(e),used=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"authorizationState",args:[e.wallet,p.nonce]});
  check(preverified&&revoked&&valid==="0xffffffff"&&s.merchant===0n&&s.policy.occupied===10000n&&!used&&record.paymentState!=="paid","REVOKED_PAYMENT_ACCEPTED");
  return {preverified,revoked,erc1271:valid,nonceUsed:used,payment:record.paymentState,service:record.serviceState,result:record.resultState,errorCode:record.errorCode??null};
});
await run("version-replacement",async e=>{
  const p=await payment(e,0,50000n),registered=await register(e,p),sig=await signature(e,p),digest=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]}),before=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,sig]});
  const expiry=(await state(e)).policy.expiresAt;
  const replaced=await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"replacePolicy",args:[e.root,{budget:150000n,maxPerPayment:100000n,expiresAt:expiry},[{id:p.merchantId,payTo:e.merchantSigner.address,quoteSigner:e.merchantSigner.address}],await Promise.all(e.steps.map(id=>e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"getStep",args:[e.root,1n,id]})))]}));
  const after=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,sig]}),newSession=h("version2");
  await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[e.root,newSession,e.agentA.address,100000n,100000n,expiry,e.steps]}));
  const repeated=await payment(e,0,10000n,newSession),denied=await rejected(()=>registration(e,repeated).then(r=>e.pc.simulateContract(r)),"StepAlreadyUsed"),fresh=await register(e,await payment(e,1,50000n,newSession));
  check(before==="0x1626ba7e"&&after==="0xffffffff"&&(await state(e)).policy.occupied===100000n,"VERSION_RESERVATION_LOST");
  return {oldSignatureBefore:before,oldSignatureAfter:after,oldReservationRetainedAtomic:"50000",denied,receipts:await Promise.all([registered,replaced,fresh].map(r=>receipt(e,r)))};
});
await run("uncertain-settlement-retains-budget",async e=>{
  const p=await payment(e,0,10000n);await register(e,p);const digest=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]}),release={address:e.wallet,abi:accountAbi,functionName:"releaseExpired" as const,args:[digest] as const,account:e.operator.address};
  const before=await rejected(()=>e.pc.simulateContract(release),"UnsafeRelease");
  await e.pc.request({method:"evm_setNextBlockTimestamp" as never,params:[Number(p.validBefore)] as never});await e.pc.request({method:"evm_mine" as never,params:[] as never});
  const at=await rejected(()=>e.pc.simulateContract(release),"UnsafeRelease");
  const freed=await e.send(e.wallet,encodeFunctionData(release));check((await state(e)).policy.occupied===0n,"EXPIRED_UNUSED_NOT_RELEASED");
  const reuse=await payment(e,0,10000n),denied=await rejected(()=>registration(e,reuse).then(r=>e.pc.simulateContract(r)),"StepAlreadyUsed");
  const consumed=await payment(e,1,10000n);await register(e,consumed,e.agentB);
  await e.send(e.asset,encodeFunctionData({abi:testTokenAbi,functionName:"cancelForTest",args:[e.wallet,consumed.nonce]}));
  await e.pc.request({method:"evm_setNextBlockTimestamp" as never,params:[Number(consumed.validBefore)+1] as never});await e.pc.request({method:"evm_mine" as never,params:[] as never});
  const consumedDigest=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"paymentDigest",args:[consumed]}),unsafe=await rejected(()=>e.pc.simulateContract({...release,args:[consumedDigest]}),"UnsafeRelease");
  check((await state(e)).policy.occupied===10000n&&(await state(e)).merchant===0n,"UNKNOWN_NONCE_RESERVATION_LOST");
  return {beforeDeadline:before,atDeadline:at,releasedUnused:await receipt(e,freed),reusedStep:denied,usedNonceRelease:unsafe,nonceStateInjection:"unrestricted local TestUSDC.cancelForTest; not native USDC authorization",knownFinancialResult:"no merchant payment; used nonce remains conservatively occupied"};
});
await run("direct-signer-bypass",async e=>{
  const attacker=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:8}).address,declared=await payment(e,0,200000n),malicious={...declared,to:attacker};
  await e.send(e.asset,encodeFunctionData({abi:testTokenAbi,functionName:"mint",args:[e.agentA.address,1000000n]}));
  // EOA has the same declared local caps; possession of its complete key bypasses that local client.
  const eoaPayment={...malicious,nonce:nonceFor(31337,e.agentA.address,e.root,malicious.stepId)},eoaSig=await signature(e,eoaPayment,e.agentA,e.agentA.address),eoaPaid=await settle(e,eoaPayment,eoaSig,e.agentA.address);
  const badSig=await signature(e,malicious),unregistered=await rejected(()=>e.pc.simulateContract(transfer(e,malicious,badSig)),"signature");
  const legit=await payment(e,0,10000n);await register(e,legit);const altered={...legit,to:attacker},alteredSig=await signature(e,altered),registeredTamper=await rejected(()=>e.pc.simulateContract(transfer(e,altered,alteredSig)),"signature");
  const valid=await settle(e,legit,await signature(e,legit)),attackerCash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[attacker]});
  check(attackerCash===200000n&&(await state(e)).cash===990000n&&(await state(e)).merchant===10000n,"BYPASS_COMPARISON_WRONG");
  return {eoa:{declaredLocalRootBudgetAtomic:"150000",declaredLocalSingleCapAtomic:"100000",actualUnapprovedPaymentAtomic:"200000",receipt:await receipt(e,eoaPaid),scope:"our ordinary full-key EOA reference, not all wallets"},mandate:{unregistered,registeredTamper,legitimate:await receipt(e,valid)},controllerLimit:"Off-chain query/pre-checkpoint gates are not enforced by this financial contract; same-host controller is not host isolation."};
});
await run("direct-controller-bypass-boundary",async e=>{
  let now=Math.floor(Date.now()/1000);
  const scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[0],policyVersion:"1",sessionEpoch:"1",signer:e.agentA.address};
  const envelope=await signEnvelope(e.owner,{schemaVersion:2,scope,mode:"live",stepIds:[e.steps[0]],maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+3600,checkpointDeadlineSeconds:300,expectedKinds:["pre-payment","registration","payment","service"]});
  const controller=await SessionController.create(join(e.directory,"bypass-controller.sqlite"),envelope,mnemonicToAccount(TEST_MNEMONIC,{addressIndex:6}),async()=>({fixture:true}),{owner:e.owner.address,scope},()=>now);
  try{
    const record=await e.clients[0].call(e.services[0].serviceId);check(record.paymentState==="paid","DIRECT_BOUNDED_PAYMENT_FAILED");
    now+=301;const inspection=await controller.inspect();
    check(inspection.anchors.length===0&&inspection.queries.length===0&&inspection.alerts.length===4&&inspection.alerts.every(s=>s.code==="EXPECTED_CHECKPOINT_MISSING"),"BYPASS_MISSING_ALERTS_FAILED");
    return {payment:record.paymentState,service:record.serviceState,result:record.resultState,settlementHash:record.settlementHash,inspection,clockInjection:"controller observation clock advanced 301 seconds; no claim of 301-second real elapsed test",meaning:"A holder of a valid session key can omit the off-chain controller while staying inside financial policy. Honest retained controller detects missing expected checkpoints; cause/intent and host isolation are not proven."};
  }finally{controller.close();}
});
const sources=["mandate/research/stateful-attacks.ts","mandate/research/protocol.json","mandate/contracts/src/MandateAccount.sol","mandate/examples/local-environment.ts","mandate/sdk/model.ts","mandate/evidence/controller.ts","pnpm-lock.yaml"];
save("manifest.json",{schemaVersion:1,protocolId:JSON.parse(readFileSync("mandate/research/protocol.json","utf8")).protocolId,sourcesSHA256:Object.fromEntries(sources.map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),clock:"wall-aligned local genesis, 1-second blocks; explicit deadline jumps only in expiry case",samplesPerCoreCase:1,financialCoreSharedBy:["B2","B3","B4"],duplicateSamplesNotClaimed:true,remainingProtocolCasesFrom:"http/B3-N03-0 and B4-N03-0 secondary evidence probes",signaturesExported:false,newPublicTransactions:0});
save("summary.json",{schemaVersion:1,completed:results.length,planned:8,allPassed:results.length===8,coreCases:results.map((r:any)=>r.id),additionalEvidenceCases:["checkpoint-tamper","checkpoint-tail-delete","controller-query-grinding"],newPublicTransactions:0});
