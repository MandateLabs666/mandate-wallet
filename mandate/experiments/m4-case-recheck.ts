import {readFileSync,writeFileSync} from "node:fs";
import {createPublicClient,http,type Hex,type Chain} from "viem";
import {baseSepolia} from "viem/chains";
import {accountAbi} from "../sdk/accountAbi.js";
import {MandateReader,reconcilePayment,tokenReadAbi} from "../sdk/reader.js";
import {decodePayment} from "../sdk/model.js";
import {assertSameReceipts} from "../services/receipt.js";
import {canonicalReceipt} from "../services/transactions.js";
const original=JSON.parse(readFileSync("artifacts/m4/base-sepolia-http.json","utf8")),chain:Chain=baseSepolia;
if(!original.publicGatePassed)throw new Error("ORIGINAL_CASE_NOT_ACCEPTED");
const pc=createPublicClient({chain,transport:http("https://sepolia.base.org",{timeout:20000,retryCount:0})}),witness=createPublicClient({chain,transport:http("https://base-sepolia-rpc.publicnode.com",{timeout:20000,retryCount:0})});
await new MandateReader(pc,84532,original.wallet,{name:"USDC",version:"2",chainId:84532,verifyingContract:original.asset}).verifyContext();
const checks=[];
for(const saved of original.providerChecks){const initial=await Promise.all([pc.getTransactionReceipt({hash:saved.hash}),witness.getTransactionReceipt({hash:saved.hash})]);const [a,b]=await Promise.all([canonicalReceipt(pc,initial[0],2),canonicalReceipt(witness,initial[1],2)]);assertSameReceipts(a,b);if(a.status!=="success"||a.blockHash!==saved.blockHash)throw new Error("HISTORICAL_RECEIPT_CHANGED");checks.push({hash:saved.hash,blockHash:a.blockHash,status:a.status});}
let historicalPaid=0n;let released=false;
for(const record of original.gateway.records){if(!record.payment)continue;const p=decodePayment(record.payment);
 if(record.paymentState==="paid"){const proof=await reconcilePayment(pc,original.wallet,original.asset,p,record.settlementHash,2);if(proof.state!=="paid")throw new Error("ORIGINAL_PAYMENT_NOT_CANONICAL");historicalPaid+=p.value;}
 else if(record.agentId==="revocation-probe"){const digest=await pc.readContract({address:original.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]}),commitment=await pc.readContract({address:original.wallet,abi:accountAbi,functionName:"getCommitment",args:[digest]}),used=await pc.readContract({address:original.asset,abi:tokenReadAbi,functionName:"authorizationState",args:[original.wallet,p.nonce]});released=commitment.released&&!used;}
}
if(historicalPaid!==20000n||!released)throw new Error("ORIGINAL_CASE_PROOF_MISMATCH");
const report={observedAt:new Date().toISOString(),originalCompletedAt:original.completedAt,scope:"original-T5-public-case-only",passed:true,historicalPaidAtomic:"20000",revokedProbeReleased:true,receiptChecks:checks,submittedTransactions:0,newSignatures:0,latestBalanceNotUsedAsHistoricalBalance:true};
writeFileSync("artifacts/m4/case-recheck.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({passed:true,historicalPaidAtomic:"20000",receiptChecks:checks.length,submittedTransactions:0}));
