// Test-only worker: public deterministic key; no RPC or real broadcast.
import {existsSync} from "node:fs";
import {keccak256,type Address,type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {PurchaseStore,businessKey} from "../../../services/store.js";
const [path,action,gate,release]=process.argv.slice(2);
const wallet="0x1111111111111111111111111111111111111111" as Address,id=("0x"+"12".repeat(32)) as Hex,step=("0x"+"34".repeat(32)) as Hex;
const store=new PurchaseStore(path),key=businessKey(84532,wallet,id,step);
const record=store.create({key,requestHash:id,agentId:"durability-worker",chainId:84532,wallet,mandateId:id,stepId:step,paymentState:"draft",serviceState:"not_requested",resultState:"unchecked"});
const deadline=Date.now()+10000;
async function until(file:string){while(!existsSync(file)){if(Date.now()>deadline)throw Error("WORKER_GATE_TIMEOUT");await new Promise(r=>setTimeout(r,10));}}
if(action==="contend"){
  await until(gate);const lease=store.claim(key,30000);console.log(JSON.stringify({claimed:!!lease}));
  if(lease){await until(release);record.paymentState="registering";store.save(record,lease);store.release(lease);}
  store.close();
}else if(action==="crash-with-lease"){
  const lease=store.claim(key,100)!;console.log(JSON.stringify({claimed:!!lease}));process.exit(73);
}else if(action==="crash-after-prepare"){
  const signer=privateKeyToAccount(("0x"+"1".padStart(64,"0")) as Hex);
  const raw=await signer.signTransaction({chainId:84532,type:"eip1559",nonce:7,to:wallet,data:"0x",value:0n,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:1n});
  const tx=await store.reserveTransaction({id:"fixed-order",chainId:84532,sender:signer.address,nonce:7,intentHash:id,raw,hash:keccak256(raw)});
  console.log(JSON.stringify({hash:tx.hash,nonce:tx.nonce,status:tx.status}));process.exit(74);
}else throw Error("UNKNOWN_TEST_ACTION");
