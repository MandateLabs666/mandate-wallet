import {it,expect} from "vitest";
import {join} from "node:path";
import {writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {request as httpRequest} from "node:http";
import {createWalletClient,http,type Hex} from "viem";
import {fixture} from "../../services/test/fixture.js";
import {GatewayTools} from "../../gateway/tools.js";
import {MandateWorkspace} from "../../sdk/workspace.js";
import {describeOwnerDraft,ownerInputFromDraft,submitOwnerDraft,type OwnerProvider,type OwnerSubmission} from "../../sdk/owner-wallet.js";
import {budgetPresentation,formatUSDC} from "../../sdk/presentation.js";
import {EvidenceJournal} from "../../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../../evidence/recorder.js";
import {PurchaseClient} from "../../services/client.js";
import {serveWorkspace} from "../server.js";
import {authenticateCredential} from "../../gateway/runtime.js";
import {accountAbi} from "../../sdk/accountAbi.js";
const token="LOCAL_EVM_TEST_CONNECTION_"+"x".repeat(32),credentialSHA256=createHash("sha256").update(token).digest("hex");
async function setup(options:{failAfterPayment?:boolean}={}){const e=await fixture({signedOffersAndReceipts:true,...options}),journal=new EvidenceJournal(join(e.directory,"evidence.sqlite")),purchase=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(journal,e.reader,e.context(0))),tools=new GatewayTools(purchase),workspace=await MandateWorkspace.create(tools);return {e,journal,tools,workspace,close:async()=>{journal.close();await e.close();}};}
it("new root and finite grant require external owner confirmation; shared purchase recovers one paid order",async()=>{
  const s=await setup({failAfterPayment:true}),{e,workspace}=s;
  const wallet=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)}),provider:OwnerProvider={request:async args=>{
    if(args.method==="eth_chainId")return "0x7a69";if(["eth_accounts","eth_requestAccounts"].includes(args.method))return [e.owner.address];
    if(args.method==="eth_sendTransaction"){const p=args.params![0] as {to:`0x${string}`;data:Hex;value:string};return wallet.sendTransaction({to:p.to,data:p.data,value:BigInt(p.value)});}throw new Error("Unsupported fixture provider request");
  }};
  const confirm=async(value:any)=>{let saved:OwnerSubmission|undefined;const result=await submitOwnerDraft(provider,value.request,value.input,r=>{saved={...r};});expect(saved!.transactionHash).toBe(result.transactionHash);await e.pc.waitForTransactionReceipt({hash:result.transactionHash!});return workspace.noteOwnerBroadcast(value.request.requestId,result.transactionHash!);};
  try{
    const created=await workspace.draftCreate({description:"M6 approved stats",budgetAtomic:"150000",maxPerPaymentAtomic:"100000",ttlSeconds:3600});expect(created.request.status).toBe("draft");expect(describeOwnerDraft(created.request.draft,ownerInputFromDraft(created.request.draft)).action).toBe("create");expect((await workspace.snapshot(created.task.id)).context).toMatchObject({policy:{exists:false}});expect((await confirm(created)).actionApplied).toBe(true);
    const grant=await workspace.draftAction({action:"grant",taskId:created.task.id,budgetAtomic:"150000",maxPerPaymentAtomic:"100000",ttlSeconds:1800});expect((await confirm(grant)).chainActive).toBe(true);
    await workspace.quote(created.task.id,e.services[0].serviceId);const first=await workspace.call(created.task.id,e.services[0].serviceId) as any;expect(first).toMatchObject({paymentState:"paid",serviceState:"failed"});
    const resumed=await MandateWorkspace.create(new GatewayTools(new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(s.journal,e.reader,e.context(0))))),paid=await resumed.call(created.task.id,e.services[0].serviceId) as any;expect(paid).toMatchObject({paymentState:"paid",serviceState:"returned",resultState:"valid",settlementHash:first.settlementHash});
    const view=await resumed.snapshot(created.task.id) as any;expect(view.context.policy.occupied).toBe(10000n);expect(view.task.sessionId).toBe(grant.request.sessionId);expect(paid).not.toHaveProperty("payload");expect(paid).not.toHaveProperty("registrationSignature");
    const revoke=await resumed.draftAction({action:"revokeSession",taskId:created.task.id});expect((await confirm(revoke)).grantStatus).toBe("revoked");const denied=await resumed.call(created.task.id,e.services[1].serviceId) as any;expect(denied.paymentState).toBe("rejected");expect((await e.reader.readBudget(created.task.id,grant.request.sessionId)).policy.occupied).toBe(10000n);
    mkdirSync("artifacts/m6",{recursive:true});writeFileSync("artifacts/m6/local-owner-purchase.json",JSON.stringify({dataMode:"local-EVM-test",walletProvider:"controlled EIP-1193 fixture; not a browser extension acceptance",ownerKeyInBrowser:false,newRootConfirmed:true,finiteGrantConfirmed:true,firstPaidServiceFailed:true,sameHashOnRecovery:true,resultValid:true,occupiedAtomic:"10000",sessionRevocationConfirmed:true,laterPurchaseRejected:true,publicTransactions:0},null,2)+"\n");
  }finally{await s.close();}
});
it("owner rejects wrong network, changed call and uncertain or duplicate submissions",async()=>{
  const s=await setup(),{workspace,e}=s;try{
    const value=await workspace.draftAction({action:"pause",taskId:e.root,paused:true});expect(()=>describeOwnerDraft({...value.request.draft,transaction:{...value.request.draft.transaction,value:"1"}},value.input)).toThrow("MISMATCH");
    const wrong:OwnerProvider={request:async args=>args.method==="eth_chainId"?"0x1":[e.owner.address]};await expect(submitOwnerDraft(wrong,value.request,value.input,()=>{})).rejects.toThrow("WRONG_NETWORK");
    let last:OwnerSubmission|undefined,calls=0;const uncertain:OwnerProvider={request:async args=>{if(args.method==="eth_chainId")return "0x7a69";if(args.method==="eth_accounts")return [e.owner.address];calls++;throw new Error("RPC lost after wallet submission");}};
    await expect(submitOwnerDraft(uncertain,value.request,value.input,r=>{last={...r};})).rejects.toThrow("RPC lost");expect(last?.state).toBe("submission-unknown");await expect(submitOwnerDraft(uncertain,value.request,value.input,()=>{},last)).rejects.toThrow("RECONCILE_FIRST");expect(calls).toBe(1);
    const rejected:OwnerProvider={request:async args=>args.method==="eth_chainId"?"0x7a69":args.method==="eth_accounts"?[e.owner.address]:Promise.reject(Object.assign(new Error("Rejected"),{code:4001}))};await expect(submitOwnerDraft(rejected,value.request,value.input,r=>{last={...r};})).rejects.toThrow("Rejected");expect(last?.state).toBe("rejected");
  }finally{await s.close();}
});
it("external broadcast hash checks exact owner intent and keeps unresolved/reorged state pending",async()=>{
  const s=await setup(),{workspace,e,tools}=s;try{
    const value=await workspace.draftAction({action:"pause",taskId:e.root,paused:true}),wallet=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)});
    const wrong=await wallet.sendTransaction({to:e.owner.address,value:1n});await e.pc.waitForTransactionReceipt({hash:wrong});await expect(workspace.noteOwnerBroadcast(value.request.requestId,wrong)).rejects.toThrow("MISMATCH");expect(tools.ownerStatus.get(value.request.requestId)!.transactionHash).toBeUndefined();
    const before=await e.pc.request({method:"evm_snapshot" as never}),hash=await wallet.sendTransaction({to:e.wallet,data:value.request.draft.transaction.data});await e.pc.waitForTransactionReceipt({hash});expect((await workspace.noteOwnerBroadcast(value.request.requestId,hash)).actionApplied).toBe(true);
    await e.pc.request({method:"evm_revert" as never,params:[before] as never});expect(await workspace.ownerRequest(value.request.requestId)).toMatchObject({status:"pending",actionApplied:false,transactionHash:hash});
    await expect(workspace.noteOwnerBroadcast(value.request.requestId,wrong)).rejects.toThrow("FROZEN");
  }finally{await s.close();}
});
it("HTTP boundary rejects credentials, origins, host rebinding, extra input and private paths",async()=>{
  const s=await setup(),server=await serveWorkspace(s.workspace,{authenticate:t=>authenticateCredential(credentialSHA256,t),staticDirectory:"mandate/web/dist"});try{
    const send=(input:unknown,headers:Record<string,string>={})=>fetch(server.origin+"/api/workspace",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(input)});
    expect((await send({operation:"connect"})).status).toBe(401);expect((await send({operation:"connect"},{authorization:"Bearer "+token,origin:"https://evil.example"})).status).toBe(403);const forgedHostStatus=await new Promise<number>((resolve,reject)=>{const req=httpRequest(server.origin+"/api/workspace",{method:"POST",headers:{host:"evil.example",authorization:"Bearer "+token,"content-type":"application/json"}},res=>{res.resume();res.on("end",()=>resolve(res.statusCode!));});req.on("error",reject);req.end(JSON.stringify({operation:"connect"}));});expect(forgedHostStatus).toBe(400);
    expect((await send({operation:"connect",signer:"arbitrary"},{authorization:"Bearer "+token})).status).toBe(400);const response=await send({operation:"connect"},{authorization:"Bearer "+token});expect(response.status).toBe(200);const text=await response.text();expect(text).not.toContain("privateKey");expect(text).not.toContain("registrationSignature");expect(text).not.toContain(".runtime");
    expect((await fetch(server.origin+"/.runtime/keys/owner.json")).status).toBe(404);expect((await fetch(server.origin+"/app.html")).status).toBe(200);
    const walkthrough=await fetch(server.origin+"/walkthrough.html");expect(walkthrough.status).toBe(200);expect(await walkthrough.text()).toContain('id="flow-player"');expect((await fetch(server.origin+"/walkthrough.html?file=.runtime/keys/owner.json")).status).toBe(404);
    const release=await(await fetch(server.origin+"/contracts-release.json")).json(),source=await fetch(server.origin+"/mandate-contracts-v2.zip"),bytes=Buffer.from(await source.arrayBuffer());
    expect(source.status).toBe(200);expect(source.headers.get("content-type")).toBe("application/zip");expect(source.headers.get("content-disposition")).toContain("attachment");expect(bytes.subarray(0,4).toString("hex")).toBe("504b0304");expect(createHash("sha256").update(bytes).digest("hex")).toBe(release.archiveSHA256);
    expect((await fetch(server.origin+"/contracts/lib/forge-std/src/Test.sol")).status).toBe(404);expect((await fetch(server.origin+"/contracts-release.json?file=.runtime/keys/owner.json")).status).toBe(404);
  }finally{await server.close();await s.close();}
});
it("budget presentation separates occupied categories and uses exact six-decimal integers",()=>{
  expect(formatUSDC("10001")).toBe("0.010001");expect(budgetPresentation({budget:"150000",occupied:"120000"},[{paymentState:"paid",payment:{value:"10000"}},{paymentState:"pending",payment:{value:"100000"}}])).toEqual({budget:150000n,occupied:120000n,paidKnown:10000n,unresolvedKnown:100000n,otherConservativeOccupied:10000n,available:30000n});expect(()=>budgetPresentation({budget:"150000",occupied:"10000"},[{paymentState:"paid",payment:{value:"10001"}}])).toThrow("RECONCILIATION_REQUIRED");
});
it("concurrent owner status reads and the original broadcast report retain one confirmed intent",async()=>{
  const s=await setup(),{e,workspace}=s;
  try{
    const request=await workspace.draftAction({action:"pause",taskId:e.root,paused:true});
    const wallet=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)});
    const hash=await wallet.sendTransaction({to:e.wallet,data:request.request.draft.transaction.data});await e.pc.waitForTransactionReceipt({hash});
    const results=await Promise.allSettled([
      workspace.ownerRequest(request.request.requestId),
      workspace.noteOwnerBroadcast(request.request.requestId,hash),
      workspace.ownerRequest(request.request.requestId),
      workspace.ownerRequest(request.request.requestId),
    ]);
    expect(results.filter(r=>r.status==="rejected").map((r:any)=>r.reason.message)).toEqual([]);
    const confirmed=await workspace.ownerRequest(request.request.requestId);
    expect(confirmed).toMatchObject({status:"confirmed",actionApplied:true,transactionHash:hash});
    expect((await e.pc.getTransaction({hash})).nonce).toBe(confirmed.transactionNonce);
  }finally{await s.close();}
});
