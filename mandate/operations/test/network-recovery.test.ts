import {it,expect,vi} from "vitest";
import {createPublicClient,createWalletClient,http,encodeFunctionData} from "viem";
import {localEnvironment} from "../../examples/local-environment.js";
import {PurchaseStore} from "../../services/store.js";
import {DurableTransactions} from "../../services/transactions.js";
import {PurchaseClient} from "../../services/client.js";
import {MandateReader} from "../../sdk/reader.js";
import {testTokenAbi} from "../../sdk/testTokenAbi.js";
import {rpcProxy} from "./fixtures/rpc-proxy.js";
import {join} from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";
import {EvidenceJournal} from "../../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../../evidence/recorder.js";
import {exportPurchaseBundle,type VerifierTrust} from "../../evidence/bundle.js";
import {verifyEvidence} from "../../evidence/verifier.js";
import {decodePayment} from "../../sdk/model.js";
import {keccak256} from "viem";

for(const fault of ["timeout-before-send","accepted-response-lost","receipt-response-lost"] as const)it("real RPC wire fault and restarted store recover the original registration: "+fault,async()=>{
  const e=await localEnvironment(),proxy=await rpcProxy(e.node.rpc);let reopened:PurchaseStore|undefined;
  try{
    const pc=createPublicClient({chain:e.chain,transport:http(proxy.rpc,{timeout:100,retryCount:0}),pollingInterval:50});
    const manager=new DurableTransactions(pc,createWalletClient({chain:e.chain,account:e.operator,transport:http(proxy.rpc,{timeout:100,retryCount:0})}),e.store,10n**18n,1);
    const reader=new MandateReader(pc,31337,e.wallet,e.reader.tokenDomain),client=new PurchaseClient(e.context(0),reader,manager,e.http,e.store);
    if(fault==="timeout-before-send")proxy.controls.stallBeforeSend=true;
    else if(fault==="accepted-response-lost"){proxy.controls.dropAfterAccepted=true;proxy.controls.hideAcceptedLookup=true;}
    else proxy.controls.hideReceiptsAfterAccepted=true;
    const sign=vi.spyOn(e.agentA,"signTypedData"),first=await client.call(e.services[0].serviceId),stored=e.store.transactionRows()[0];
    expect(first.paymentState).toBe("registering");expect(first.payload).toBeUndefined();expect(stored.hash).toBe(first.registrationHash);expect(e.store.transactionRows()).toHaveLength(1);
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(fault==="timeout-before-send"?0n:10000n);
    proxy.controls.stallBeforeSend=false;proxy.controls.dropAfterAccepted=false;proxy.controls.hideAcceptedLookup=false;proxy.controls.hideReceiptsAfterAccepted=false;
    reopened=new PurchaseStore(e.storePath);const recoveredManager=new DurableTransactions(pc,manager.wc,reopened,10n**18n,1),restarted=new PurchaseClient(e.context(0),reader,recoveredManager,e.http,reopened);
    const recovered=await restarted.call(e.services[0].serviceId);
    expect(recovered.paymentState).toBe("paid");expect(recovered.resultState).toBe("valid");expect(recovered.registrationHash).toBe(stored.hash);expect(reopened.transactionRows()[0].raw).toBe(stored.raw);expect(reopened.transactionRows()).toHaveLength(1);
    expect(sign.mock.calls.filter(([data])=>data.primaryType==="RegisterPayment")).toHaveLength(1);expect(proxy.counts.accepted).toBe(1);expect(e.facilityStore.transactionRows()).toHaveLength(1);
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(10000n);
  }finally{reopened?.close();await proxy.close();await e.close();}
});
it("a different mined transaction occupying the stored nonce blocks automatic replacement",async()=>{
  const e=await localEnvironment();
  try{
    const data=encodeFunctionData({abi:testTokenAbi,functionName:"approve",args:[e.wallet,1n]}),prepared=await e.transactions.prepare("replaced-nonce",e.asset,data);
    const replacement=await e.transactions.wc.sendTransaction({to:e.operator.address,value:0n,nonce:prepared.nonce});await e.pc.waitForTransactionReceipt({hash:replacement});
    await expect(e.transactions.send(prepared.id)).rejects.toThrow("ORIGINAL_TRANSACTION_NEEDS_RECONCILIATION");
    expect(e.store.transactionRows()).toHaveLength(1);expect(e.store.transaction(prepared.id)!.hash).toBe(prepared.hash);expect(e.store.transaction(prepared.id)!.status).toBe("prepared");
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(0n);
  }finally{await e.close();}
});
it("a real reorg keeps the old signed evidence prefix and appends new canonical payment observations",async()=>{
  const e=await localEnvironment(),journal=new EvidenceJournal(join(e.directory,"reorg-evidence.sqlite"));
  try{
    const recorder=new PurchaseEvidenceRecorder(journal,e.reader,e.context(0)),client=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,recorder);
    const snapshot=await e.pc.request({method:"evm_snapshot" as never}),timestamp=(await e.pc.getBlock()).timestamp;
    const first=await client.call(e.services[0].serviceId);expect(first.paymentState).toBe("paid");
    const scope={chainId:31337,wallet:e.wallet,mandateId:e.root,sessionId:e.sessions[0],policyVersion:"1",sessionEpoch:"1",signer:e.agentA.address};
    const original=journal.rows(scope).map(r=>JSON.parse(r.checkpoint)),registration=e.store.transactionRows()[0],settlement=e.facilityStore.transactionRows()[0];
    expect(original).toHaveLength(4);
    await e.pc.request({method:"evm_revert" as never,params:[snapshot] as never});await e.pc.request({method:"evm_setNextBlockTimestamp" as never,params:[Number(timestamp+60n)] as never});
    const recovered=await client.call(e.services[0].serviceId),after=journal.rows(scope).map(r=>JSON.parse(r.checkpoint));
    expect(recovered.paymentState).toBe("paid");expect(recovered.settlementHash).toBe(first.settlementHash);expect(recovered.settlementBlockHash).not.toBe(first.settlementBlockHash);
    expect(after.slice(0,original.length)).toEqual(original);expect(after).toHaveLength(7);expect(after.at(-1).header.kind).toBe("service");
    expect(e.store.transactionRows()).toHaveLength(1);expect(e.store.transactionRows()[0].raw).toBe(registration.raw);expect(e.facilityStore.transactionRows()).toHaveLength(1);expect(e.facilityStore.transactionRows()[0].raw).toBe(settlement.raw);
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(10000n);
    const p=decodePayment(recovered.payment!),bundle=await exportPurchaseBundle(recorder,recovered,p,{discloseRequest:true,discloseResult:true});
    const trust:VerifierTrust={schemaVersion:2,chainId:31337,wallet:e.wallet,asset:e.asset,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),owner:e.owner.address,mandateId:e.root,sessionId:e.sessions[0],sessionSigner:e.agentA.address,merchantId:p.merchantId,merchantSigner:e.merchantSigner.address,payTo:e.merchantSigner.address,resourceUrl:e.services[0].url,requestHash:p.requestHash,rootBudgetAtomic:"150000",maxPerPaymentAtomic:"100000",startBlock:String(e.context(0).startBlock),rpcs:[e.node.rpc],confirmations:1,resultChecker:"ETH-stats-v2"};
    const verification=await verifyEvidence(bundle,trust);writeFileSync("artifacts/m7/operations/reorg-verification.json",JSON.stringify(verification,null,2)+"\n");expect(verification.requiredChecksPassed).toBe(true);
    await client.call(e.services[0].serviceId);expect(journal.rows(scope)).toHaveLength(after.length);
    mkdirSync("artifacts/m7/operations",{recursive:true});writeFileSync("artifacts/m7/operations/reorg-evidence.json",JSON.stringify({mode:"real-local-Anvil-reorg",transactionsSubmittedToPublicNetworks:0,originalCheckpointCount:original.length,recoveredCheckpointCount:after.length,oldPrefixPreserved:true,sameSignedTransactions:true,registrationHash:registration.hash,settlementHash:settlement.hash,oldBlockHash:first.settlementBlockHash,newBlockHash:recovered.settlementBlockHash,occupiedAtomic:"10000",merchantBalanceAtomic:"10000",checkpoints:after},null,2)+"\n");
  }finally{journal.close();await e.close();}
});
