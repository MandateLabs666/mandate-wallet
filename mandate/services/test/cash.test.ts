import {join} from "node:path";
import {EvidenceJournal} from "../../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../../evidence/recorder.js";
import {it,expect} from "vitest";
import {encodeFunctionData} from "viem";
import {fixture} from "./fixture.js";
import {PurchaseClient} from "../client.js";
import {testTokenAbi} from "../../sdk/testTokenAbi.js";
import {nonceFor} from "../../sdk/model.js";

it("low cash signs only decision evidence, reserves nothing, and funded recovery pays one order at zero cash",async()=>{
  const e=await fixture({initialWalletCashAtomic:5000n,failAfterPayment:true});
  let signatures=0;const signedTypes:string[]=[];const context={...e.context(0),signer:{address:e.agentA.address,signTypedData:async(data:any)=>{signedTypes.push(data.primaryType);if(["RegisterPayment","TransferWithAuthorization"].includes(data.primaryType))signatures++;return e.agentA.signTypedData(data);}}};
  const journal=new EvidenceJournal(join(e.directory,"cash-evidence.sqlite")),client=new PurchaseClient(context,e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(journal,e.reader,context));
  const scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[0],policyVersion:"1",sessionEpoch:"1",signer:e.agentA.address};
  try{
    const first=await client.call(e.services[0].serviceId);
    expect(first).toMatchObject({paymentState:"draft",errorCode:"WALLET_CASH_INSUFFICIENT",serviceState:"not_requested",resultState:"unchecked"});
    expect(first.evidenceStatus).toBe("recorded");expect(signedTypes).toEqual(["SessionAttestation"]);expect(journal.rows(scope)).toHaveLength(1);
    expect(first.payment).toBeUndefined();expect(first.registrationSignature).toBeUndefined();expect(first.payload).toBeUndefined();expect(signatures).toBe(0);
    expect(e.store.db.prepare("SELECT COUNT(*) n FROM signed_transactions").get()).toMatchObject({n:0});
    expect(await e.pc.getTransactionCount({address:e.operator.address})).toBe(0);
    const before=await e.reader.readBudget(e.root,e.sessions[0]);expect(before.policy.occupied).toBe(0n);expect(before.rootAvailable).toBe(150000n);
    await e.send(e.asset,encodeFunctionData({abi:testTokenAbi,functionName:"mint",args:[e.wallet,5000n]}));
    const funded=await e.reader.readBudget(e.root,e.sessions[0]);expect(funded.policy.version).toBe(before.policy.version);expect(funded.session.epoch).toBe(before.session.epoch);
    const paid=await client.call(e.services[0].serviceId);
    expect(paid).toMatchObject({key:first.key,paymentState:"paid",serviceState:"failed",resultState:"unchecked"});expect(signatures).toBe(2);
    expect(paid.payment!.nonce).toBe(nonceFor(31337,e.wallet,e.root,e.steps[0]));
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]})).toBe(0n);
    const recovered=await client.call(e.services[0].serviceId);
    expect(recovered).toMatchObject({key:first.key,paymentState:"paid",serviceState:"returned",resultState:"valid",settlementHash:paid.settlementHash});
    const repeated=await client.call(e.services[0].serviceId);expect(repeated.settlementHash).toBe(paid.settlementHash);expect(signatures).toBe(2);
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
    const used=await e.pc.getLogs({address:e.asset,event:testTokenAbi.find(x=>x.type==="event"&&x.name==="AuthorizationUsed") as any,fromBlock:0n,toBlock:"latest"});expect(used).toHaveLength(1);
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(10000n);
    const proof=await journal.export(scope,{decision:["paymentState","errorCode"],"pre-payment":["payment"]});expect(proof[0].checkpoint.header.kind).toBe("decision");expect(proof.some(p=>p.checkpoint.header.kind==="pre-payment")).toBe(true);expect(proof.some(p=>p.checkpoint.header.kind==="payment")).toBe(true);
  }finally{journal.close();await e.close();}
});
