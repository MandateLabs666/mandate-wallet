import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from "node:fs";
import {execFileSync,spawn} from "node:child_process";
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,toHex,type Hex,type Chain} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {baseSepolia} from "viem/chains";
import {accountAbi} from "../sdk/accountAbi.js";
import {MandateReader,tokenReadAbi} from "../sdk/reader.js";
import {canonicalJson,requestHash,decodePayment,MandateError} from "../sdk/model.js";
import {PurchaseStore} from "../services/store.js";
import {DurableTransactions,canonicalReceipt} from "../services/transactions.js";
import {assertSameReceipts} from "../services/receipt.js";
import {controlledFacilitator} from "../services/facilitator.js";
import {startControlledMerchant,expectedStats} from "../services/merchant.js";
import {SafeHttp} from "../services/http.js";
import {PurchaseClient} from "../services/client.js";
import {EvidenceJournal} from "../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../evidence/recorder.js";
import {exportPurchaseBundle} from "../evidence/bundle.js";
import {M3Journal} from "./journal.js";
process.umask(0o077);
const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
if(execFileSync("git",["status","--porcelain","--","mandate"],{encoding:"utf8"}).trim())throw new Error("COMMIT_M5_SOURCE_FIRST");
if(JSON.parse(readFileSync("artifacts/m4/host-acceptance.json","utf8")).M4!=="accepted")throw new Error("M4_PREREQUISITE");
const directory=".runtime/m5",publicDirectory="artifacts/m5/lifecycle";mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(publicDirectory,{recursive:true});
const save=(path:string,data:unknown)=>{const temporary=path+".tmp";writeFileSync(temporary,JSON.stringify(data,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n",{mode:0o600});renameSync(temporary,path);};
const base=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8"));
const key=(path:string)=>privateKeyToAccount(JSON.parse(readFileSync(path,"utf8")).privateKey as Hex);
const owner=key(".runtime/keys/owner.json"),operator=key(".runtime/keys/operator.json"),payer=key(".runtime/keys/session.json"),merchantSigner=key(".runtime/keys/merchant.json"),agent=key(".runtime/m3/keys/agent-a.json"),chain:Chain=baseSepolia;
const pc=createPublicClient({chain,transport:http(base.rpc,{timeout:20000,retryCount:0}),pollingInterval:1000}),witness=createPublicClient({chain,transport:http(base.witnessRpc,{timeout:20000,retryCount:0})});
const wallet=(account:typeof owner)=>createWalletClient({chain,account,transport:http(base.rpc,{timeout:20000,retryCount:0})});
// Reuse cumulative M4 fee reservations and original broadcast journals.
const ownerJournal=new M3Journal(".runtime/m4/owner-journal.json",10n**14n),store=new PurchaseStore(".runtime/m4/purchases.sqlite"),facilityStore=new PurchaseStore(".runtime/m4/facilitator.sqlite"),journal=new EvidenceJournal(directory+"/evidence.sqlite");
const transactions=new DurableTransactions(pc,wallet(operator),store,10n**14n,2),facilityTransactions=new DurableTransactions(pc,wallet(payer),facilityStore,2n*10n**13n,2);
const reader=new MandateReader(pc,84532,base.wallet,base.tokenDomain),reportPath=publicDirectory+"/base-sepolia.json";
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,"utf8")):{schemaVersion:2,chainId:84532,wallet:base.wallet,asset:base.asset,sourceCommit,publicGatePassed:false,limits:["Controlled loopback HTTP merchant and reference facilitator, not a public HTTPS service.","Third-party RPC trust; two-provider agreement is not independent consensus verification.","Existing wallet enforces financial/request/quote scope, not complete session roots."]};
const check=(condition:unknown,code:string)=>{if(!condition)throw new MandateError(code);};
const update=()=>{report.updatedAt=new Date().toISOString();report.ownerTransactions=ownerJournal.evidence().filter(r=>r.id.startsWith("M5:"));save(reportPath,report);};
let merchant:Awaited<ReturnType<typeof startControlledMerchant>>|undefined;
try{
  check(await pc.getChainId()===84532&&await witness.getChainId()===84532,"RPC_CHAIN_MISMATCH");await reader.verifyContext();
  check(new Set([owner,operator,payer,merchantSigner,agent].map(a=>a.address.toLowerCase())).size===5,"ROLE_COLLISION");
  check((await pc.readContract({address:base.wallet,abi:accountAbi,functionName:"owner"})).toLowerCase()===owner.address.toLowerCase(),"OWNER_MISMATCH");
  const code=await pc.getCode({address:base.wallet});check(code&&code!=="0x"&&code===await witness.getCode({address:base.wallet}),"WALLET_CODE_MISMATCH");
  merchant=await startControlledMerchant({pc,facilitator:controlledFacilitator(facilityTransactions),chainId:84532,asset:base.asset,payTo:merchantSigner.address,quoteSigner:merchantSigner,allowedWallets:[base.wallet],dbPath:directory+"/merchant.sqlite",port:43403,confirmations:2,signedOffersAndReceipts:true,failAfterPayment:true});
  const mandateId=keccak256(toHex("Mandate-M5-native-evidence-v1")),sessionId=keccak256(toHex("M5-agent-a-v1")),merchantId=keccak256(toHex("M5-signed-merchant-v1"));
  const service={serviceId:keccak256(toHex("M5-ETH-service-v1")),stepId:keccak256(toHex("M5-ETH-step-v1")),method:"GET" as const,url:merchant.origin+"/stats?asset=ETH",body:null,checkResult:(value:unknown)=>canonicalJson(value)===canonicalJson(expectedStats("ETH"))};
  const planPath=directory+"/public-plan.json";
  if(!existsSync(planPath)){
    const walletBefore=await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[base.wallet]});check(walletBefore>=10000n,"EXISTING_USDC_INSUFFICIENT");
    save(planPath,{schemaVersion:2,mandateId,sessionId,merchantId,stepId:service.stepId,resourceUrl:service.url,requestHash:requestHash(service),budgetAtomic:"10000",maxPerPaymentAtomic:"10000",expiresAt:String((await pc.getBlock()).timestamp+3600n),walletBefore:String(walletBefore),merchantBefore:String(await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[merchantSigner.address]})),source:"existing-wallet-funds-only"});
  }
  const plan=JSON.parse(readFileSync(planPath,"utf8"));check(plan.mandateId===mandateId&&plan.sessionId===sessionId&&plan.resourceUrl===service.url&&plan.requestHash===requestHash(service)&&plan.budgetAtomic==="10000"&&plan.maxPerPaymentAtomic==="10000","PUBLIC_PLAN_CHANGED");report.plan=plan;update();
  const send=async(id:string,data:Hex)=>{const receipt=await ownerJournal.send("M5:"+id,{pc,wc:wallet(owner)},{to:base.wallet,data});update();return receipt;};
  const created=await send("create-root",encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[mandateId,keccak256(toHex("Audit one fixed ETH statistics purchase")),{budget:10000n,maxPerPayment:10000n,expiresAt:BigInt(plan.expiresAt)},[{id:merchantId,payTo:merchantSigner.address,quoteSigner:merchantSigner.address}],[{id:service.stepId,merchantId,requestHash:requestHash(service)}]]}));
  await send("grant-session",encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[mandateId,sessionId,agent.address,10000n,10000n,BigInt(plan.expiresAt),[service.stepId]]}));
  const context={agentId:"m5-agent-a",mandateId,sessionId,signer:agent,services:[service],startBlock:created.blockNumber},recorder=new PurchaseEvidenceRecorder(journal,reader,context),client=new PurchaseClient(context,reader,transactions,new SafeHttp({allowOrigins:[merchant.origin],testLoopbackOrigins:[merchant.origin],timeoutMs:90000}),store,recorder);
  report.phase="purchase";update();const first=await client.call(service.serviceId);check(first.paymentState==="paid","M5_PAYMENT_NOT_PROVEN");report.firstResponse??={payment:first.paymentState,service:first.serviceState,result:first.resultState,receipt:first.receiptEvidence?.status,hash:first.settlementHash};update();
  const paid=await client.call(service.serviceId);check(paid.paymentState==="paid"&&paid.serviceState==="returned"&&paid.resultState==="valid"&&paid.receiptEvidence?.status==="confirmed"&&paid.evidenceStatus==="recorded"&&paid.settlementHash===first.settlementHash,"M5_DELIVERY_OR_EVIDENCE_INCOMPLETE");
  const p=decodePayment(paid.payment!),bundle=await exportPurchaseBundle(recorder,paid,p,{discloseRequest:true,discloseResult:true});save(publicDirectory+"/public-bundle.json",bundle);
  const trust={schemaVersion:2,chainId:84532,wallet:base.wallet,asset:base.asset,walletRuntimeHash:keccak256(code!),owner:owner.address,mandateId,sessionId,sessionSigner:agent.address,merchantId,merchantSigner:merchantSigner.address,payTo:merchantSigner.address,resourceUrl:service.url,requestHash:requestHash(service),rootBudgetAtomic:"10000",maxPerPaymentAtomic:"10000",startBlock:String(created.blockNumber),rpcs:[base.rpc,base.witnessRpc],confirmations:2,resultChecker:"ETH-stats-v2"};save(publicDirectory+"/trusted-config.json",trust);
  const walletAfter=await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[base.wallet]}),merchantAfter=await pc.readContract({address:base.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[merchantSigner.address]});check(BigInt(plan.walletBefore)-walletAfter===10000n&&merchantAfter-BigInt(plan.merchantBefore)===10000n,"M5_BALANCE_MISMATCH");
  report.final={paidAtomic:"10000",walletBalanceAtomic:String(walletAfter),sameHashOnRecovery:true,preCheckpointRoot:paid.preCheckpointRoot,checkpoints:bundle.checkpoints.length,payment:paid.paymentState,service:paid.serviceState,result:paid.resultState,receipt:paid.receiptEvidence};
  report.receiptChecks=[];
  for(const hash of [...report.ownerTransactions.map((row:{hash:Hex})=>row.hash),paid.registrationHash!,paid.settlementHash!]){const initial=await Promise.all([pc.getTransactionReceipt({hash}),witness.getTransactionReceipt({hash})]),[a,b]=await Promise.all([canonicalReceipt(pc,initial[0],2),canonicalReceipt(witness,initial[1],2)]);assertSameReceipts(a,b);check(a.status==="success","M5_PUBLIC_TRANSACTION_FAILED");const raw=await pc.request({method:"eth_getTransactionReceipt",params:[hash]}) as unknown as {l1Fee?:Hex};report.receiptChecks.push({hash,blockHash:a.blockHash,blockNumber:String(a.blockNumber),logsEqual:true,status:a.status,evmGasFeeWei:String(a.gasUsed*a.effectiveGasPrice),l1FeeWei:raw.l1Fee?String(BigInt(raw.l1Fee)):null});update();}
  report.phase="independent-verification";update();
  const verification=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,["dist/mandate-evidence-verifier.js","--bundle",publicDirectory+"/public-bundle.json","--trust",publicDirectory+"/trusted-config.json","--output",publicDirectory+"/public-verification.json"],{stdio:["ignore","pipe","pipe"],env:{PATH:process.env.PATH??""}});child.stdout.on("data",data=>process.stdout.write(data));child.stderr.on("data",()=>{});child.once("error",reject);child.once("exit",resolve);});
  check(verification===0,"PUBLIC_INDEPENDENT_VERIFICATION_INCOMPLETE");report.phase="passed";report.publicGatePassed=true;report.completedAt=new Date().toISOString();update();console.log(JSON.stringify({publicGatePassed:true,paidAtomic:"10000",receipts:report.receiptChecks.length,checkpoints:bundle.checkpoints.length}));
}catch(error){report.lastError=error instanceof MandateError?error.code:"M5_PUBLIC_WORKFLOW_INTERRUPTED";update();console.error(JSON.stringify({phase:report.phase??"setup",code:report.lastError}));process.exitCode=1;}
finally{await merchant?.close();journal.close();store.close();facilityStore.close();}
