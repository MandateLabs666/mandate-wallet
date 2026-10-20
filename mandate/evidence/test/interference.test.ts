import {it,expect} from "vitest";
import {join} from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";
import {encodeFunctionData,type Hex} from "viem";
import {fixture} from "../../services/test/fixture.js";
import {PurchaseClient} from "../../services/client.js";
import {accountAbi} from "../../sdk/accountAbi.js";
import {decodePayment,MandateError} from "../../sdk/model.js";
import {SessionController} from "../controller.js";
import {ControllerClient,serveController} from "../controller-http.js";
import {signEnvelope,verifyStatement} from "../controller-model.js";
import {EvidenceJournal} from "../journal.js";
import {PurchaseEvidenceRecorder} from "../recorder.js";
import {SafeHttp} from "../../services/http.js";
import {verifyExternalAnchors} from "../anchors.js";
it("configured live gate blocks before signing, restores original pre-root and records the complete paid path",async()=>{
  const e=await fixture({signedOffersAndReceipts:true}),journal=new EvidenceJournal(join(e.directory,"journal.sqlite")),scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[0],policyVersion:"1",sessionEpoch:"1",signer:e.agentA.address},now=Math.floor(Date.now()/1000),envelope=await signEnvelope(e.owner,{schemaVersion:2,scope,mode:"live",stepIds:e.steps,maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+3600,checkpointDeadlineSeconds:30,expectedKinds:["pre-payment","registration","payment","service"]});
  const controller=await SessionController.create(join(e.directory,"controller.sqlite"),envelope,e.merchantSigner,async()=>null,{owner:e.owner.address,scope}),server=await serveController(controller),client=new ControllerClient(server.origin,envelope,e.agentA,e.merchantSigner.address,new SafeHttp({allowOrigins:[server.origin],testLoopbackOrigins:[server.origin]}));
  try{
    const original=client.anchor.bind(client);let blocked=true;client.anchor=async cp=>{if(blocked)throw new MandateError("SIMULATED_CONTROLLER_UNAVAILABLE");return original(cp);};
    const recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0),client),purchase=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder),held=await purchase.call(e.services[0].serviceId);
    expect(held.registrationSignature).toBeUndefined();expect(e.store.transactionRows()).toHaveLength(0);expect(held.evidenceStatus).toBe("incomplete");const first=journal.rows(scope)[0];
    blocked=false;const paid=await purchase.call(e.services[0].serviceId);expect(paid.paymentState).toBe("paid");expect(paid.evidenceStatus).toBe("recorded");expect(journal.rows(scope)[0].leaves).toBe(first.leaves);
    const checkpoints=journal.rows(scope).map(r=>JSON.parse(r.checkpoint)),anchors=controller.exportAnchors(),snapshot={lastSequence:anchors.at(-1)!.checkpoint.header.sequence,lastRoot:anchors.at(-1)!.checkpoint.root};expect(anchors).toHaveLength(4);await verifyExternalAnchors(anchors,checkpoints,{controller:e.merchantSigner.address,owner:e.owner.address,envelope,snapshot},scope);
    await expect(verifyExternalAnchors(anchors,checkpoints.slice(0,-1),{controller:e.merchantSigner.address,owner:e.owner.address,envelope,snapshot},scope)).rejects.toThrow("OMITTED");
    await expect(verifyExternalAnchors(anchors.slice(0,-1),checkpoints.slice(0,-1),{controller:e.merchantSigner.address,owner:e.owner.address,envelope,snapshot},scope)).rejects.toThrow("SNAPSHOT_MISMATCH");
    const p=decodePayment(paid.payment!),quote=paid.quote as {merchantSignature:Hex};
    await expect(e.pc.call({account:e.owner.address,to:e.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[p,paid.registrationSignature!,quote.merchantSignature]})})).rejects.toThrow();expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
    // A direct, otherwise authorized protocol client can bypass the off-chain
    // controller. The account does not claim to enforce complete session roots.
    const bypass=await e.clients[0].call(e.services[1].serviceId);expect(bypass.paymentState).toBe("paid");expect(bypass.preCheckpointRoot).toBeUndefined();expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(20000n);
    mkdirSync("artifacts/m5/interference",{recursive:true});writeFileSync("artifacts/m5/interference/live-gate.json",JSON.stringify({network:"local-Anvil",gateUnavailableRegistrationTransactions:0,restoredOriginalPreRoot:true,anchoredStages:4,omittedAnchoredTailDetected:true,omittedBothBundleAndAnchorsDetected:true,duplicateRegistrationRejected:true,protocolBypassWithoutSessionRoot:{paid:true,financialScopeStillEnforced:true,classification:"not-guaranteed for off-chain gate; matches D-M5-01"},source:"actual local EVM and HTTP controller",publicTransactions:0},null,2)+"\n");
  }finally{await server.close();controller.close();journal.close();await e.close();}
});
