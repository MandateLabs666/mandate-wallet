import {it,expect,beforeAll} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {keccak256,toHex,type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {fixture} from "../../services/test/fixture.js";
import {PurchaseClient} from "../../services/client.js";
import {decodePayment,MandateError} from "../../sdk/model.js";
import {EvidenceJournal} from "../journal.js";
import {PurchaseEvidenceRecorder} from "../recorder.js";
import {exportPurchaseBundle,type VerifierTrust} from "../bundle.js";
import {verifyEvidence} from "../verifier.js";
import {verifyCheckpointChain,signCheckpoint,ZERO_ROOT,type EvidenceScope} from "../checkpoint.js";
beforeAll(()=>{execFileSync(process.execPath,[resolve("scripts/m5-build-verifier.mjs")],{stdio:"pipe"});});
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n";
it("journal concurrency and restart keep frozen roots, salts and sequence without future references",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"mandate-journal-")),path=join(directory,"journal.sqlite"),signer=privateKeyToAccount("0x"+"88".repeat(32) as Hex);
  const scope:EvidenceScope={chainId:31337,wallet:signer.address,mandateId:keccak256(toHex("root")),sessionId:keccak256(toHex("session")),policyVersion:"1",sessionEpoch:"1",signer:signer.address},stepId=keccak256(toHex("step"));
  let a=new EvidenceJournal(path),b=new EvidenceJournal(path);
  try{
    await expect(a.append(signer,scope,stepId,"pre-payment","invalid",{settlementHash:stepId})).rejects.toThrow("FUTURE_OR_UNKNOWN_FIELD");
    const [one,two]=await Promise.all([a.append(signer,scope,stepId,"decision","one",{errorCode:"one"}),b.append(signer,scope,stepId,"decision","two",{errorCode:"two"})]);
    expect(new Set([one.header.sequence,two.header.sequence])).toEqual(new Set(["0","1"]));
    const saved=a.rows(scope)[0];a.close();a=new EvidenceJournal(path);
    const again=await a.append(signer,scope,stepId,"decision","one",{errorCode:"one"});expect(again.root).toBe(one.root);expect(a.rows(scope)[0].leaves).toBe(saved.leaves);
    await expect(a.append(signer,scope,stepId,"decision","one",{errorCode:"changed"})).rejects.toThrow("EVENT_FROZEN");
    await verifyCheckpointChain(a.rows(scope).map(r=>JSON.parse(r.checkpoint)),scope);
  }finally{a.close();b.close();}
});
it("crash after pre-checkpoint stops registration, and restart preserves it despite another agent spend",async()=>{
  const e=await fixture({signedOffersAndReceipts:true}),path=join(e.directory,"evidence.sqlite");let journal=new EvidenceJournal(path),fail=true;
  try{
    const sign=((data:Parameters<typeof e.agentA.signTypedData>[0])=>{if(data.primaryType==="RegisterPayment"&&fail){fail=false;return Promise.reject(new Error("simulated host crash after pre-checkpoint"));}return e.agentA.signTypedData(data);}) as typeof e.agentA.signTypedData;
    const context={...e.context(0),signer:{address:e.agentA.address,signTypedData:sign}};
    let recorder=new PurchaseEvidenceRecorder(journal,e.reader,context),client=new PurchaseClient(context,e.reader,e.transactions,e.http,e.store,recorder);
    const held=await client.call(e.services[0].serviceId);expect(held.preCheckpointRoot).toBeTruthy();expect(held.registrationSignature).toBeUndefined();expect(e.store.transactionRows()).toHaveLength(0);expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(0n);
    const firstPre=journal.rows(recorder.scope(decodePayment(held.payment!)))[0];
    expect((await e.clients[1].call(e.services[1].serviceId)).paymentState).toBe("paid");
    journal.close();journal=new EvidenceJournal(path);recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0));client=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder);
    const paid=await client.call(e.services[0].serviceId);expect(paid.paymentState).toBe("paid");expect(paid.evidenceStatus).toBe("recorded");expect(paid.preCheckpointRoot).toBe(held.preCheckpointRoot);expect(paid.actionProof).toEqual(held.actionProof);expect(journal.rows(recorder.scope(decodePayment(paid.payment!)))[0].leaves).toBe(firstPre.leaves);
    const count=journal.rows(recorder.scope(decodePayment(paid.payment!))).length;
    expect((await client.call(e.services[0].serviceId)).settlementHash).toBe(paid.settlementHash);expect(journal.rows(recorder.scope(decodePayment(paid.payment!)))).toHaveLength(count);expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(20000n);
  }finally{journal.close();await e.close();}
});
it("independent clean-cwd verifier checks lifecycle and rejects damaged or misleading public inputs",async()=>{
  const e=await fixture({signedOffersAndReceipts:true,failAfterPayment:true}),journal=new EvidenceJournal(join(e.directory,"evidence.sqlite"));
  try{
    const recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0)),client=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder);
    const failed=await client.call(e.services[0].serviceId);expect(failed.paymentState).toBe("paid");expect(failed.serviceState).toBe("failed");
    const paid=await client.call(e.services[0].serviceId),p=decodePayment(paid.payment!);expect(paid.settlementHash).toBe(failed.settlementHash);
    const bundle=await exportPurchaseBundle(recorder,paid,p,{discloseRequest:true,discloseResult:true});
    const trust:VerifierTrust={schemaVersion:2,chainId:31337,wallet:e.wallet,asset:e.asset,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),owner:e.owner.address,mandateId:e.root,sessionId:e.sessions[0],sessionSigner:e.agentA.address,merchantId:p.merchantId,merchantSigner:e.merchantSigner.address,payTo:e.merchantSigner.address,resourceUrl:e.services[0].url,requestHash:p.requestHash,rootBudgetAtomic:"150000",maxPerPaymentAtomic:"100000",startBlock:String(e.context(0).startBlock),rpcs:[e.node.rpc],confirmations:1,resultChecker:"ETH-stats-v2"};
    const clean=mkdtempSync(join(tmpdir(),"mandate-independent-verifier-")),input=join(clean,"public.json"),configuration=join(clean,"trust.json"),output=join(clean,"report.json");
    writeFileSync(input,json(bundle));writeFileSync(configuration,json(trust));
    const printed=execFileSync(process.execPath,[resolve("dist/mandate-evidence-verifier.js"),"--bundle",input,"--trust",configuration,"--output",output],{cwd:clean,env:{PATH:process.env.PATH??""},timeout:60000,encoding:"utf8"});
    const report=JSON.parse(readFileSync(output,"utf8"));expect(report.requiredChecksPassed,printed).toBe(true);expect(report.overall).toBe("incomplete");expect(report.checks.find((c:{name:string})=>c.name==="https-source").status).toBe("incomplete");expect(report.checks.find((c:{name:string})=>c.name==="budget").facts.occupiedAtomic).toBe("10000");
    const compiled=readFileSync(resolve("dist/mandate-evidence-verifier.js"),"utf8");expect(compiled).not.toContain("node:sqlite");expect(compiled).not.toContain("privateKeyToAccount");expect(compiled).not.toContain(".runtime/");
    const altered=JSON.parse(json(bundle));altered.checkpoints[0].disclosures[0].value="tampered";expect((await verifyEvidence(altered,trust)).requiredChecksPassed).toBe(false);
    // A malicious holder can re-sign a structurally valid history; check stage
    // semantics as well as cryptography. No external-anchor claim is made.
    const future=JSON.parse(json(bundle)),paymentIndex=future.checkpoints.findIndex((c:any)=>c.checkpoint.header.kind==="payment"),serviceIndex=future.checkpoints.findLastIndex((c:any)=>c.checkpoint.header.kind==="service"&&c.disclosures.some((d:any)=>d.name==="serviceState"&&d.value==="returned")),times=future.checkpoints.map((c:any)=>c.checkpoint.header.observedAt);
    [future.checkpoints[paymentIndex],future.checkpoints[serviceIndex]]=[future.checkpoints[serviceIndex],future.checkpoints[paymentIndex]];
    let previous=ZERO_ROOT;for(let i=0;i<future.checkpoints.length;i++){future.checkpoints[i].checkpoint=await signCheckpoint(e.agentA,{...future.checkpoints[i].checkpoint.header,sequence:String(i),previousRoot:previous,observedAt:times[i]});previous=future.checkpoints[i].checkpoint.root;}
    const premature=await verifyEvidence(future,trust);expect(premature.overall).toBe("contradicted");expect(premature.checks.some(c=>c.code==="DELIVERY_BEFORE_PAYMENT_CHECKPOINT")).toBe(true);
    const wrongTrust={...trust,sessionSigner:e.agentB.address};expect((await verifyEvidence(bundle,wrongTrust)).overall).toBe("contradicted");
    const hidden=await exportPurchaseBundle(recorder,paid,p);const privacy=await verifyEvidence(hidden,trust);expect(privacy.requiredChecksPassed).toBe(true);expect(privacy.checks.find(c=>c.name==="result")?.status).toBe("incomplete");
    const unavailable=await verifyEvidence(bundle,{...trust,rpcs:["http://127.0.0.1:1"]});expect(unavailable.requiredChecksPassed).toBe(false);expect(unavailable.overall).toBe("incomplete");
  }finally{journal.close();await e.close();}
});
it("evidence write failure after paid delivery preserves financial and result states",async()=>{
  const e=await fixture({signedOffersAndReceipts:true}),journal=new EvidenceJournal(join(e.directory,"evidence.sqlite"));
  try{
    const recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0));recorder.outcome=async()=>{throw new MandateError("SIMULATED_EVIDENCE_DISK_FAILURE");};
    const client=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder),paid=await client.call(e.services[0].serviceId);
    expect(paid.paymentState).toBe("paid");expect(paid.serviceState).toBe("returned");expect(paid.resultState).toBe("valid");expect(paid.evidenceStatus).toBe("incomplete");expect(paid.evidenceErrorCode).toBe("SIMULATED_EVIDENCE_DISK_FAILURE");
  }finally{journal.close();await e.close();}
});
it("a rejected quote records a signed decision without payment parameters or a transaction",async()=>{
  const e=await fixture({signedOffersAndReceipts:true,priceAtomic:"200000"}),journal=new EvidenceJournal(join(e.directory,"evidence.sqlite"));
  try{
    const recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0)),client=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder);
    const refused=await client.call(e.services[0].serviceId);expect(refused.paymentState).toBe("rejected");expect(refused.payment).toBeUndefined();expect(refused.registrationSignature).toBeUndefined();expect(e.store.transactionRows()).toHaveLength(0);expect(refused.evidenceStatus).toBe("recorded");
    const scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[0],policyVersion:"1",sessionEpoch:"1",signer:e.agentA.address};expect(journal.rows(scope)).toHaveLength(1);expect(JSON.parse(journal.rows(scope)[0].checkpoint).header.kind).toBe("decision");
  }finally{journal.close();await e.close();}
});
