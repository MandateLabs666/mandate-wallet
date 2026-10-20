// Owner-controlled test orchestration only. This is not automatic payment retry or a new nonce for an old step.
import {readFileSync,writeFileSync} from "node:fs";
import {createPublicClient,createWalletClient,http,encodeFunctionData,type Chain,type Hex} from "viem";
import {baseSepolia} from "viem/chains";
import {privateKeyToAccount} from "viem/accounts";
import {M3Journal,type TransactionContext} from "./journal.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {decodePayment} from "../sdk/model.js";
process.umask(0o077);
const config=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8"));
const payment=decodePayment(JSON.parse(readFileSync(".runtime/m3/84532-alpha-payment.json","utf8")).payment);
const network:Chain=baseSepolia;
const pc=createPublicClient({chain:network,transport:http(config.rpc,{timeout:20000,retryCount:0}),pollingInterval:5000});
const witness=createPublicClient({transport:http(config.witnessRpc,{timeout:20000,retryCount:0})});
if(await pc.getChainId()!==84532 || await witness.getChainId()!==84532)throw new Error("CHAIN_MISMATCH");
const digest=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"paymentDigest",args:[payment]});
const commitment=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"getCommitment",args:[digest]});
if(!commitment.exists || commitment.payment.nonce!==payment.nonce)throw new Error("ORIGINAL_COMMITMENT_MISSING");
for(const client of [pc,witness]) {
  const now=(await client.getBlock()).timestamp;
  const used=await client.readContract({address:config.asset,abi:testTokenAbi,functionName:"authorizationState",args:[config.wallet,payment.nonce]});
  if(now<=payment.validBefore || used)throw new Error("NOT_PROVEN_EXPIRED_UNUSED");
}
const owner=privateKeyToAccount(JSON.parse(readFileSync(".runtime/keys/owner.json","utf8")).privateKey),operator=privateKeyToAccount(JSON.parse(readFileSync(".runtime/keys/operator.json","utf8")).privateKey);
const context=(account:typeof owner):TransactionContext=>({pc,wc:createWalletClient({chain:network,account,transport:http(config.rpc,{timeout:20000,retryCount:0})})});
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8")),deployment=JSON.parse(readFileSync("artifacts/m3/84532-deployment.json","utf8"));
const reserved=deployment.transactions.reduce((s:bigint,r:{gas:string;feeCap:string})=>s+BigInt(r.gas)*BigInt(r.feeCap),0n);
const journal=new M3Journal(".runtime/m3/84532-experiment-journal.json",BigInt(settings.m3PublicLimits.evmGasReservationsWeiPerChain)-reserved);
await journal.send("revoke-expired-test-case",context(owner),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"revokeMandate",args:[payment.mandateId]})});
await journal.send("release-expired-alpha",context(operator),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"releaseExpired",args:[digest]})});
const policy=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"getPolicy",args:[payment.mandateId]});
const balance=await pc.readContract({address:config.asset,abi:testTokenAbi,functionName:"balanceOf",args:[config.wallet]});
if(!policy.revoked || policy.occupied!==0n || balance!==150000n)throw new Error("RECOVERY_DID_NOT_PRESERVE_FUNDS");
const record={schemaVersion:2,chainId:84532,recordedAt:new Date().toISOString(),oldMandateId:payment.mandateId,oldPayment:JSON.parse(readFileSync(".runtime/m3/84532-alpha-payment.json","utf8")).payment,digest,oldNonceUnusedAtBothRpcs:true,oldRootIrreversiblyRevoked:true,occupied:"0",walletBalance:"150000",nativeUSDCSpent:"0",transactions:journal.evidence(),nextAction:"A distinct owner-approved test mandate may be created using the existing wallet funds; old step/nonce/signature never replaced."};
writeFileSync("artifacts/m3/expired-base-case-recovery.json",JSON.stringify(record,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");
console.log(JSON.stringify({oldRootRevoked:true,expiredUnusedReleased:true,USDCSpent:"0"}));
