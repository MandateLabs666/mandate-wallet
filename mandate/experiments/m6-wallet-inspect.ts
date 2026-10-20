// Read-only, deliberately projected evidence from the local real-wallet fixture.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createPublicClient,http,decodeFunctionData} from "viem";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
const f=JSON.parse(readFileSync(".runtime/browser-wallet/fixture.json","utf8")),phase=process.argv[2];
if(!phase||!/^[a-z0-9-]+$/.test(phase))throw Error("EVIDENCE_PHASE_REQUIRED");
const output=resolve("artifacts/m6/external-wallet",phase+".json");if(existsSync(output))throw Error("EVIDENCE_EXISTS");
async function api(operation:string,args:Record<string,unknown>={}){
  const r=await fetch(f.origin+"/api/workspace",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+f.connectionToken},body:JSON.stringify({operation,...args})});
  if(!r.ok)throw Error("READ_ONLY_WORKSPACE_REQUEST_FAILED");return r.json() as Promise<any>;
}
const pc=createPublicClient({transport:http(f.rpc)}),root=await api("connect"),tasks=[];
for(const task of root.tasks){
  const s=await api("snapshot",{taskId:task.id});
  tasks.push({id:task.id,sessionId:s.task.sessionId,description:s.task.description,policy:s.context.policy,session:s.context.grant,observedBlock:s.observedBlock,records:s.state.records.map((r:any)=>({stepId:r.stepId,paymentState:r.paymentState,serviceState:r.serviceState,resultState:r.resultState,errorCode:r.errorCode,registrationHash:r.registrationHash,settlementHash:r.settlementHash})),ownerRequests:s.ownerRequests.map((r:any)=>({requestId:r.requestId,action:r.draft.action,status:r.status,actionApplied:r.actionApplied,chainActive:r.chainActive,grantStatus:r.grantStatus,transactionHash:r.transactionHash,blockNumber:r.blockNumber}))});
}
const transactions=[];for(let n=7n;n<=await pc.getBlockNumber();n++){
  const b=await pc.getBlock({blockNumber:n,includeTransactions:true});
  for(const tx of b.transactions){
    if(typeof tx==="string")throw Error("TRANSACTION_OBJECT_REQUIRED");
    const receipt=await pc.getTransactionReceipt({hash:tx.hash});let method="other";
    if(tx.to?.toLowerCase()===f.wallet.toLowerCase()){try{method=decodeFunctionData({abi:accountAbi,data:tx.input}).functionName;}catch{method="unrecognized-wallet-call";}}
    if(tx.to?.toLowerCase()===f.asset.toLowerCase()){try{method=decodeFunctionData({abi:testTokenAbi,data:tx.input}).functionName;}catch{method="unrecognized-token-call";}}
    transactions.push({hash:tx.hash,from:tx.from,to:tx.to,nonce:tx.nonce,method,status:receipt.status,blockNumber:String(n),blockHash:receipt.blockHash,gasUsed:String(receipt.gasUsed)});
  }
}
const walletCash=await pc.readContract({address:f.asset,abi:testTokenAbi,functionName:"balanceOf",args:[f.wallet]});
const result={schemaVersion:1,phase,environment:"local-EVM-31337-mock-USDC",provider:"official-unmodified-MetaMask-13.52.0-unpacked",automatedNativeUI:true,humanRehearsal:false,physicalMobileDevice:false,ownerKeyInWeb:false,providerInjected:false,newPublicTransactions:0,wallet:f.wallet,asset:f.asset,owner:f.owner,walletCashAtomic:String(walletCash),tasks,transactions};
mkdirSync(join(output,".."),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({saved:output,phase,transactions:transactions.length,walletCashAtomic:String(walletCash)}));
