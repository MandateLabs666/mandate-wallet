import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,toHex,parseTransaction,recoverTransactionAddress,TransactionReceiptNotFoundError,TransactionNotFoundError,type Address,type Hex,type Chain} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {baseSepolia} from "viem/chains";
import {encodePaymentSignatureHeader} from "@x402/core/http";
import type {PaymentPayload} from "@x402/core/types";
import {accountAbi} from "../sdk/accountAbi.js";
import {MandateReader,tokenReadAbi} from "../sdk/reader.js";
import {requestHash,canonicalJson,decodePayment,MandateError} from "../sdk/model.js";
import {PurchaseStore} from "../services/store.js";
import {DurableTransactions,canonicalReceipt} from "../services/transactions.js";
import {assertSameReceipts} from "../services/receipt.js";
import {controlledFacilitator} from "../services/facilitator.js";
import {startControlledMerchant,expectedStats} from "../services/merchant.js";
import {PurchaseClient} from "../services/client.js";
import {SafeHttp} from "../services/http.js";
import {M3Journal} from "./journal.js";

process.umask(0o077);
if(existsSync("artifacts/m4/base-sepolia-http.json")&&JSON.parse(readFileSync("artifacts/m4/base-sepolia-http.json","utf8")).publicGatePassed){await import("./m4-case-recheck.js");process.exit(0);}
const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
if(execFileSync("git",["status","--porcelain","--","mandate"],{encoding:"utf8"}).trim())throw new Error("COMMIT_M4_SOURCE_FIRST");
const base=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8"));
if(JSON.parse(readFileSync("artifacts/m3/testnet-acceptance.json","utf8")).G2!=="closed")throw new Error("G2_PREREQUISITE");
const directory=".runtime/m4";mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync("artifacts/m4",{recursive:true});
const write=(path:string,data:unknown)=>{const temp=path+".tmp";writeFileSync(temp,JSON.stringify(data,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n",{mode:0o600});renameSync(temp,path);};
const key=(path:string)=>privateKeyToAccount(JSON.parse(readFileSync(path,"utf8")).privateKey as Hex);
const owner=key(".runtime/keys/owner.json"),operator=key(".runtime/keys/operator.json"),payer=key(".runtime/keys/session.json"),merchantSigner=key(".runtime/keys/merchant.json"),agents=[key(".runtime/m3/keys/agent-a.json"),key(".runtime/m3/keys/agent-b.json")];
const chain:Chain=baseSepolia,pc=createPublicClient({chain,transport:http(base.rpc,{timeout:20000,retryCount:0}),pollingInterval:1000}),witness=createPublicClient({chain,transport:http(base.witnessRpc,{timeout:20000,retryCount:0})});
const wallet=(account:typeof owner)=>createWalletClient({chain,account,transport:http(base.rpc,{timeout:20000,retryCount:0})});
const context=(account:typeof owner)=>({pc,wc:wallet(account)}),ownerJournal=new M3Journal(directory+"/owner-journal.json",10n**14n);
const reader=new MandateReader(pc,84532,base.wallet,base.tokenDomain);
const store=new PurchaseStore(directory+"/purchases.sqlite"),facilityStore=new PurchaseStore(directory+"/facilitator.sqlite"),transactions=new DurableTransactions(pc,wallet(operator),store,10n**14n,2),facilityTransactions=new DurableTransactions(pc,wallet(payer),facilityStore,2n*10n**13n,2),facilitator=controlledFacilitator(facilityTransactions);
const reportPath="artifacts/m4/base-sepolia-http.json",report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,"utf8")):{schemaVersion:2,chainId:84532,wallet:base.wallet,asset:base.asset,assetKind:"native-test-USDC",sourceCommit,publicGatePassed:false,limitations:["Controlled merchant HTTP runs on explicit loopback test origin; not a public HTTPS merchant.","Self-hosted fixed x402 reference facilitator; third-party facilitator not yet verified.","Third-party RPC response trust; two-provider consistency is not independent consensus verification.","MCP SDK/stdio tests are separate from Codex/Claude model task approval acceptance."]};
(report.attempts??=[]).push({sourceCommit,startedAt:new Date().toISOString()});
if(report.lastError){(report.recoveredFailures??=[]).push({code:report.lastError,recordedAt:report.updatedAt});delete report.lastError;}
const save=()=>{report.updatedAt=new Date().toISOString();report.ownerTransactions=ownerJournal.evidence();report.gateway=store.exportPublic();report.facilitator=facilityStore.exportPublic();write(reportPath,report);};
const check=(condition:unknown,code:string)=>{if(!condition)throw new MandateError(code);};
let merchant:Awaited<ReturnType<typeof startControlledMerchant>>|undefined;
async function fundPayer() {
  const path=directory+"/facilitator-funding.json",value=20n*10n**12n,wc=wallet(owner);let row;
  if(existsSync(path))row=JSON.parse(readFileSync(path,"utf8"));
  else {
    check(await pc.getBalance({address:payer.address})===0n,"UNEXPECTED_FACILITATOR_BALANCE");
    const request=await wc.prepareTransactionRequest({to:payer.address,value,type:"eip1559"});
    check(request.gas!==undefined&&request.maxFeePerGas!==undefined&&request.gas*request.maxFeePerGas<=10n**13n,"FUNDING_FEE_CAP");
    const raw=await owner.signTransaction(request);row={raw,hash:keccak256(raw),nonce:request.nonce,maximumEvmFeeWei:(request.gas!*request.maxFeePerGas!).toString()};write(path,row);
  }
  const tx=parseTransaction(row.raw);
  check(row.raw.startsWith("0x02")&&tx.chainId===84532&&tx.nonce===row.nonce&&tx.to?.toLowerCase()===payer.address.toLowerCase()&&tx.value===value&&(tx.data===undefined||tx.data==="0x")&&(tx.gas??0n)*(tx.maxFeePerGas??0n)===BigInt(row.maximumEvmFeeWei)&&BigInt(row.maximumEvmFeeWei)<=10n**13n&&keccak256(row.raw)===row.hash&&(await recoverTransactionAddress({serializedTransaction:row.raw})).toLowerCase()===owner.address.toLowerCase(),"FUNDING_JOURNAL_CHANGED");
  let receipt;try{receipt=await pc.getTransactionReceipt({hash:row.hash});}catch(e){if(!(e instanceof TransactionReceiptNotFoundError))throw e;}
  if(!receipt){check(await pc.getTransactionCount({address:owner.address,blockTag:"latest"})<=row.nonce,"RECONCILE_ORIGINAL_FUNDING_FIRST");try{await wc.sendRawTransaction({serializedTransaction:row.raw});}catch(error){try{await pc.getTransaction({hash:row.hash});}catch(lookup){if(lookup instanceof TransactionNotFoundError)throw error;throw lookup;}}receipt=await pc.waitForTransactionReceipt({hash:row.hash,confirmations:2,timeout:30000});}
  receipt=await canonicalReceipt(pc,receipt,2);
  check(receipt.status==="success","FUNDING_UNCONFIRMED");report.funding={hash:row.hash,to:payer.address,valueWei:value.toString(),maximumEvmFeeWei:row.maximumEvmFeeWei,source:"existing-test-ETH-only"};save();
}
try {
  check(await pc.getChainId()===84532&&await witness.getChainId()===84532,"RPC_CHAIN_MISMATCH");await reader.verifyContext();
  check((await pc.readContract({address:base.wallet,abi:accountAbi,functionName:"owner"})).toLowerCase()===owner.address.toLowerCase(),"OWNER_MISMATCH");
  check(new Set([owner,operator,payer,merchantSigner,...agents].map(a=>a.address.toLowerCase())).size===6,"ROLE_COLLISION");
  const code=await pc.getCode({address:base.wallet});check(code===await witness.getCode({address:base.wallet})&&code!=="0x","WALLET_CODE_PROVIDER_MISMATCH");
  merchant=await startControlledMerchant({pc,facilitator,chainId:84532,asset:base.asset,payTo:merchantSigner.address,quoteSigner:merchantSigner,allowedWallets:[base.wallet],dbPath:directory+"/merchant.sqlite",domainName:base.tokenDomain.name,domainVersion:base.tokenDomain.version,port:43402,confirmations:2,failAfterPayment:true});
  const root=keccak256(toHex("Mandate-M4-Base-native-HTTP-v1")),merchantId=keccak256(toHex("M4-controlled-merchant-v1")),sessions=["agent-a","agent-b","revocation-probe"].map(s=>keccak256(toHex("M4-"+s)));
  const services=["pipeline-ETH","pipeline-BTC","codex-ETH","claude-BTC","revocation-ETH"].map(id=>{const asset=id.endsWith("ETH")?"ETH":"BTC";return {serviceId:keccak256(toHex("service:"+id)),stepId:keccak256(toHex("step:"+id)),method:"GET" as const,url:`${merchant!.origin}/stats?asset=${asset}`,body:null,checkResult:(r:unknown)=>canonicalJson(r)===canonicalJson(expectedStats(asset)),resultChecker:asset+"-stats-v2"};});
  const planPath=directory+"/public-plan.json";
  if(!existsSync(planPath)) {
    check(await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[base.wallet]})>=20000n,"EXISTING_USDC_INSUFFICIENT");
    write(planPath,{root,merchantId,sessions,expiresAt:((await pc.getBlock()).timestamp+86400n).toString(),walletBefore:(await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[base.wallet]})).toString(),merchantBefore:(await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[merchantSigner.address]})).toString(),services:services.map(({checkResult,...s})=>s)});
  }
  const plan=JSON.parse(readFileSync(planPath,"utf8"));check(plan.root===root&&canonicalJson(plan.services)===canonicalJson(services.map(({checkResult,...s})=>s)),"OWNER_PLAN_CHANGED");
  report.plan={...plan,budgetAtomic:"150000",maxPerPaymentAtomic:"100000",pricePerServiceAtomic:"10000",paidTargetAtomic:"20000",merchantOrigin:merchant.origin};report.roles={owner:owner.address,relayer:operator.address,facilitator:payer.address,merchant:merchantSigner.address,agents:agents.map(a=>a.address)};save();
  await fundPayer();
  const send=async(id:string,data:Hex)=>{const r=await ownerJournal.send(id,context(owner),{to:base.wallet,data});save();return r;};
  const created=await send("create-root",encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[root,keccak256(toHex("Analyze fixed ETH/BTC fixture via Mandate-aware x402 merchant")),{budget:150000n,maxPerPayment:100000n,expiresAt:BigInt(plan.expiresAt)},[{id:merchantId,payTo:merchantSigner.address,quoteSigner:merchantSigner.address}],services.map(s=>({id:s.stepId,merchantId,requestHash:requestHash(s)}))]}));
  for(let i=0;i<3;i++)await send("grant-"+i,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[root,sessions[i],agents[i===1?1:0].address,150000n,100000n,BigInt(plan.expiresAt),services.map(s=>s.stepId)]}));
  const safe=new SafeHttp({allowOrigins:[merchant.origin],testLoopbackOrigins:[merchant.origin],timeoutMs:90000}),agentContext=(i:number)=>({agentId:i===0?"agent-a":i===1?"agent-b":"revocation-probe",mandateId:root,sessionId:sessions[i],signer:agents[i===1?1:0],services,startBlock:created.blockNumber}),clients=[0,1,2].map(i=>new PurchaseClient(agentContext(i),reader,transactions,safe,store));
  const first=await clients[0].call(services[0].serviceId);check(first.paymentState==="paid","FIRST_HTTP_PAYMENT_NOT_PROVEN");
  report.firstResponse??={payment:first.paymentState,service:first.serviceState,result:first.resultState,hash:first.settlementHash};save();
  const recovered=await clients[0].call(services[0].serviceId);check(recovered.paymentState==="paid"&&recovered.serviceState==="returned"&&recovered.resultState==="valid"&&recovered.settlementHash===first.settlementHash,"CACHED_DELIVERY_RECOVERY_FAILED");report.deliveryRecovery={sameHash:true,sameNonce:true,resultValid:true};save();
  const second=await clients[1].call(services[1].serviceId);check(second.paymentState==="paid"&&second.resultState==="valid","SECOND_AGENT_HTTP_PAYMENT_NOT_PROVEN");
  const duplicate=await clients[1].call(services[0].serviceId);check(duplicate.settlementHash===first.settlementHash&&duplicate.agentId==="agent-a","CROSS_AGENT_STEP_DUPLICATED");report.twoAgents={paidSteps:2,sameStepUsesOriginal:true,hashes:[first.settlementHash,second.settlementHash]};save();
  if(!report.prevalidation) {
    const heldHttp=new SafeHttp({allowOrigins:[merchant.origin],testLoopbackOrigins:[merchant.origin],timeoutMs:90000}),original=heldHttp.request.bind(heldHttp);
    heldHttp.request=async(url,options)=>{if(options?.headers?.["PAYMENT-SIGNATURE"])throw new MandateError("INTENTIONAL_HOLD_BEFORE_MERCHANT");return original(url,options);};
    const probeClient=new PurchaseClient(agentContext(2),reader,transactions,heldHttp,store),probe=await probeClient.call(services[4].serviceId);
    check(probe.payload&&probe.payment,"REVOCATION_PROBE_NOT_REGISTERED");
    const verified=await facilitator.verify(probe.payload as PaymentPayload,merchant.requirements);check(verified.isValid,"FACILITATOR_PREVALIDATION_FAILED");report.prevalidation={verified:true,stepId:services[4].stepId,validBefore:probe.payment!.validBefore};save();
  }
  await send("revoke-probe",encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[root,sessions[2]]}));
  const probe=store.all().find(r=>r.stepId===services[4].stepId)!;
  if(!report.revocation) {
    const refused=await facilitator.settle(probe.payload as PaymentPayload,merchant.requirements),r=await safe.request(services[4].url,{headers:{"PAYMENT-SIGNATURE":encodePaymentSignatureHeader(probe.payload as PaymentPayload)}});
    check(!refused.success&&r.status===402&&!await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"authorizationState",args:[base.wallet,probe.payment!.nonce as Hex]}),"REVOKED_PAYMENT_ACCEPTED");
    report.revocation={prevalidationPassed:true,settlementAccepted:false,httpStatus:r.status,errorReason:refused.errorReason,nonceUsed:false,occupiedBeforeRelease:(await reader.readBudget(root,sessions[2])).policy.occupied.toString()};save();
  }
  const p=decodePayment(probe.payment!);report.phase="waiting-expiry";save();console.log(JSON.stringify({phase:report.phase,validBefore:p.validBefore.toString(),paidAtomic:"20000"}));
  while((await pc.getBlock()).timestamp<=p.validBefore)await new Promise(r=>setTimeout(r,15000));
  await send("release-probe",encodeFunctionData({abi:accountAbi,functionName:"releaseExpired",args:[await pc.readContract({address:base.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]})]}));
  const after=await reader.readBudget(root,sessions[2]),walletAfter=await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[base.wallet]}),merchantAfter=await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[merchantSigner.address]});
  check(after.policy.occupied===20000n&&after.session.occupied===0n&&BigInt(plan.walletBefore)-walletAfter===20000n&&merchantAfter-BigInt(plan.merchantBefore)===20000n&&facilityStore.transactionRows().length===2,"FINAL_LEDGER_MISMATCH");
  report.final={occupied:"20000",probeOccupied:"0",available:"130000",paidAtomic:"20000",walletDelta:"20000",merchantDelta:"20000",walletBalanceAtomic:walletAfter.toString()};
  const hashes=[report.funding.hash,...ownerJournal.evidence().map(r=>r.hash),...store.transactionRows().map(r=>r.hash),...facilityStore.transactionRows().map(r=>r.hash)];
  report.phase="verifying-providers";report.providerChecks=[];save();
  for(const hash of hashes){const initial=await Promise.all([pc.getTransactionReceipt({hash}),witness.getTransactionReceipt({hash})]);const [a,b]=await Promise.all([canonicalReceipt(pc,initial[0],2),canonicalReceipt(witness,initial[1],2)]);assertSameReceipts(a,b);check(a.status==="success","PUBLIC_TRANSACTION_FAILED");const raw=await pc.request({method:"eth_getTransactionReceipt",params:[hash]}) as unknown as {l1Fee?:Hex};report.providerChecks.push({hash,block:a.blockNumber.toString(),blockHash:a.blockHash,status:a.status,logsEqual:true,evmGasFeeWei:(a.gasUsed*a.effectiveGasPrice).toString(),l1FeeWei:raw.l1Fee?BigInt(raw.l1Fee).toString():null});save();}
  report.phase="passed";report.publicGatePassed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({chainId:84532,publicGatePassed:true,paidAtomic:"20000",twoAgents:true,receiptCount:hashes.length}));
}catch(error){report.lastError=error instanceof MandateError?error.code:"PUBLIC_WORKFLOW_INTERRUPTED";save();console.error(JSON.stringify({phase:report.phase??"setup",code:report.lastError}));process.exitCode=1;}
finally{await merchant?.close();store.close();facilityStore.close();}
