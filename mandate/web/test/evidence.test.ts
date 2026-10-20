import {it,expect} from "vitest";
import {join} from "node:path";
import {keccak256} from "viem";
import {fixture} from "../../services/test/fixture.js";
import {EvidenceJournal,PurchaseEvidenceRecorder,PurchaseClient,GatewayTools,MandateWorkspace,independentlyVerify} from "../../sdk/index.js";
import {disclosedCheckpoint} from "../../evidence/checkpoint.js";
async function setup(disclose=true){const e=await fixture({signedOffersAndReceipts:true}),journal=new EvidenceJournal(join(e.directory,"journal.sqlite")),purchase=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(journal,e.reader,e.context(0))),profile={schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:disclose,result:disclose}},workspace=await MandateWorkspace.create(new GatewayTools(purchase),profile);return {e,journal,workspace,profile,close:async()=>{journal.close();await e.close();}};}
it("exports original-session evidence after rollover, hides other-step bodies and independently verifies",async()=>{
  const s=await setup(),{e,workspace}=s;try{
    await workspace.call(e.root,e.services[0].serviceId);await workspace.call(e.root,e.services[1].serviceId);
    const grant=await workspace.draftAction({action:"grant",taskId:e.root,budgetAtomic:"150000",maxPerPaymentAtomic:"100000",ttlSeconds:1800}),receipt=await e.send(e.wallet,grant.request.draft.transaction.data);await workspace.noteOwnerBroadcast(grant.request.requestId,receipt.transactionHash);expect((await workspace.snapshot(e.root)).task.sessionId).not.toBe(e.sessions[0]);
    const hidden=await workspace.evidence(e.root,e.services[0].serviceId);expect(hidden.scope.sessionId).toBe(e.sessions[0]);expect(hidden.record.resultDigest).toBeUndefined();expect(hidden.checkpoints.every(c=>c.disclosures.every(d=>!["request","result","resultDigest"].includes(d.name)))).toBe(true);
    const disclosed=await workspace.evidence(e.root,e.services[0].serviceId,{request:true,result:true});expect(disclosed.checkpoints.filter(c=>c.checkpoint.header.stepId===e.steps[1]).every(c=>c.disclosures.length===0)).toBe(true);expect(disclosed.checkpoints.some(c=>c.disclosures.some(d=>d.name==="result"))).toBe(true);
    const trust=await workspace.evidenceTrust(e.root,e.services[0].serviceId),checked=await independentlyVerify(disclosed,trust);expect(checked.report.requiredChecksPassed).toBe(true);expect(checked.report.overall).toBe("incomplete");expect(checked.privateRuntimeInputs).toEqual([]);expect(checked.report.checks.find(c=>c.name==="payment")?.status).toBe("confirmed");expect(checked.report.checks.find(c=>c.name==="https-source")?.status).toBe("incomplete");
    const changed=JSON.parse(JSON.stringify(disclosed)),leaf=changed.checkpoints.find((c:any)=>c.disclosures.some((d:any)=>d.name==="request")).disclosures.find((d:any)=>d.name==="request");leaf.value={...leaf.value,url:"https://evil.example"};expect((await independentlyVerify(changed,trust)).report.overall).toBe("contradicted");
  }finally{await s.close();}
});
it("disclosure cannot exceed the separately configured administrator policy",async()=>{
  const s=await setup(false);try{await s.workspace.call(s.e.root,s.e.services[0].serviceId);await expect(s.workspace.evidence(s.e.root,s.e.services[0].serviceId,{result:true})).rejects.toThrow("ADMIN_APPROVAL_REQUIRED");await expect(MandateWorkspace.create(new GatewayTools(s.workspace.base.purchase),{...s.profile,walletRuntimeHash:"0x"+"11".repeat(32)})).rejects.toThrow("PROFILE_CONTEXT_MISMATCH");}finally{await s.close();}
});
