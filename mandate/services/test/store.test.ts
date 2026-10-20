import {it,expect} from "vitest";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {keccak256,type Hex,type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {PurchaseStore,businessKey,type PurchaseRecord} from "../store.js";
const wallet="0x1111111111111111111111111111111111111111" as Address,id="0x"+"12".repeat(32) as Hex,step="0x"+"34".repeat(32) as Hex,requestHash="0x"+"56".repeat(32) as Hex;
function draft(agentId="agent-a"):Omit<PurchaseRecord,"version"|"createdAt"|"updatedAt">{return {key:businessKey(84532,wallet,id,step),requestHash,agentId,chainId:84532,wallet,mandateId:id,stepId:step,paymentState:"draft",serviceState:"not_requested",resultState:"unchecked"};}
it("two agents share one business record; leases/CAS preserve frozen payment across restart",async()=>{
  const path=join(mkdtempSync(join(tmpdir(),"mandate-purchases-")),"purchases.sqlite"),a=new PurchaseStore(path),b=new PurchaseStore(path);
  try {
    const record=a.create(draft());expect(b.create(draft("agent-b")).agentId).toBe("agent-a");
    expect(()=>b.create({...draft(),requestHash:id})).toThrow("STEP_REQUEST_REUSE_MISMATCH");
    const lease=a.claim(record.key,100)!;expect(b.claim(record.key)).toBeUndefined();
    await new Promise(r=>setTimeout(r,110));const other=b.claim(record.key)!;
    expect(()=>a.save(record,lease)).toThrow("LEASE_LOST");
    const current=b.get(record.key)!;current.payment={nonce:id,value:"10000"};current.payload={signature:"private-bound-signature"};current.quote={body:"private request"};current.result={value:"private result"};b.save(current,other);
    const stale=a.get(record.key)!;const tampered={...stale,payment:{nonce:id,value:"20000"}};
    expect(()=>b.save(tampered,other)).toThrow("PAYMENT_PARAMETERS_FROZEN");
    const update=b.get(record.key)!;update.paymentState="pending";b.save(update,other);
    expect(()=>b.save(stale,other)).toThrow("RECORD_VERSION_CHANGED");
    b.release(other);const publicData=JSON.stringify(a.exportPublic());expect(publicData).not.toContain("private-bound-signature");expect(publicData).not.toContain("private request");expect(publicData).not.toContain("private result");
    expect(a.get(record.key)!.payment!.nonce).toBe(id);expect(a.get(record.key)!.paymentState).toBe("pending");
  }finally{a.close();b.close();}
});
it("stores the exact signed transaction before broadcast and reserves a signer nonce once",async()=>{
  const store=new PurchaseStore(join(mkdtempSync(join(tmpdir(),"mandate-nonce-")),"purchases.sqlite"));
  try {
    const signer=privateKeyToAccount(("0x"+"1".padStart(64,"0")) as Hex);
    const raw=await signer.signTransaction({chainId:84532,type:"eip1559",nonce:3,to:wallet,value:0n,data:"0x",gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:1n}),input={id:"registration",chainId:84532,sender:signer.address,nonce:3,intentHash:id,raw,hash:keccak256(raw)};
    expect((await store.reserveTransaction(input)).status).toBe("prepared");
    expect((await store.reserveTransaction(input)).hash).toBe(input.hash);
    await expect(store.reserveTransaction({...input,id:"different-order"})).rejects.toThrow("SIGNER_NONCE_ALREADY_RESERVED");
    await expect(store.reserveTransaction({...input,intentHash:step})).rejects.toThrow("SIGNED_TRANSACTION_FROZEN");
    await expect(store.reserveTransaction({...input,chainId:11155111})).rejects.toThrow("SIGNED_TRANSACTION_CONTEXT_MISMATCH");
    store.transactionStatus(input.id,"broadcast");expect(store.transaction(input.id)!.raw).toBe(raw);
    expect(JSON.stringify(store.exportPublic())).not.toContain(raw);
  }finally{store.close();}
});
