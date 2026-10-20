import {readFileSync,writeFileSync} from "node:fs";
import {createPublicClient,http,type Hex,type Chain} from "viem";
import {baseSepolia} from "viem/chains";
import {MandateReader,reconcilePayment,tokenReadAbi} from "../sdk/reader.js";
import {decodePayment} from "../sdk/model.js";
import {canonicalReceipt} from "../services/transactions.js";
import {assertSameReceipts} from "../services/receipt.js";
const config=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8")),chain:Chain=baseSepolia;
const pc=createPublicClient({chain,transport:http(config.rpc,{timeout:20000,retryCount:0})}),witness=createPublicClient({chain,transport:http(config.witnessRpc,{timeout:20000,retryCount:0})});
const report:{observedAt:string;modelPurchases:unknown[];receiptChecks:unknown[];latest?:unknown;gatePassed:boolean}={observedAt:new Date().toISOString(),modelPurchases:[],receiptChecks:[],gatePassed:false};
for(const host of ["codex","claude"]){
 const result=JSON.parse(readFileSync(`artifacts/m4/hosts/${host}-purchase-01.json`,"utf8"));if(!result.modelTaskPassed)throw new Error("MODEL_TASK_NOT_PASSED");
 const r=result.trace.purchaseRecords[0],p=decodePayment(r.payment);
 const proof=await reconcilePayment(pc,config.wallet,config.asset,p,r.settlementHash,2),other=await reconcilePayment(witness,config.wallet,config.asset,p,r.settlementHash,2);
 if(proof.state!=="paid"||other.state!=="paid"||proof.blockHash!==other.blockHash||p.value!==10000n)throw new Error("HOST_PAYMENT_PROOF_MISMATCH");
 for(const hash of [r.registrationHash,r.settlementHash] as Hex[]){const initial=await Promise.all([pc.getTransactionReceipt({hash}),witness.getTransactionReceipt({hash})]);const [a,b]=await Promise.all([canonicalReceipt(pc,initial[0],2),canonicalReceipt(witness,initial[1],2)]);assertSameReceipts(a,b);if(a.status!=="success")throw new Error("HOST_TRANSACTION_REVERTED");report.receiptChecks.push({host,hash,blockHash:a.blockHash,blockNumber:a.blockNumber.toString(),status:a.status,logsEqual:true});}
 report.modelPurchases.push({host,stepId:p.stepId,sessionId:p.sessionId,nonce:p.nonce,valueAtomic:"10000",settlementHash:r.settlementHash,paymentProven:true,resultSummary:r.validatedResultSummary,modelTaskPassed:true});
}
const reader=new MandateReader(pc,84532,config.wallet,config.tokenDomain),plan=JSON.parse(readFileSync(".runtime/m4/public-plan.json","utf8"));
const budget=await reader.readBudget(plan.root,plan.sessions[0]),balance=await pc.readContract({address:config.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[config.wallet]});
if(budget.policy.occupied!==40000n||balance!==10000n)throw new Error("CUMULATIVE_M4_LEDGER_MISMATCH");
report.latest={rootOccupiedAtomic:"40000",rootAvailableAtomic:"110000",walletBalanceAtomic:"10000",pipelinePaidAtomic:"20000",modelHostsPaidAtomic:"20000"};report.gatePassed=true;
writeFileSync("artifacts/m4/host-payment-current.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({modelHosts:2,gatePassed:true,receiptChecks:4,cumulativeM4PaidAtomic:"40000"}));
