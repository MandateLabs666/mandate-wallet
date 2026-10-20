import {it,expect} from "vitest";
import {createWalletClient,http,keccak256,type Hex} from "viem";
import {fixture} from "../../services/test/fixture.js";
import {draftOwnerAction} from "../../sdk/owner.js";
import {OwnerStatus} from "../owner-status.js";
import {GatewayTools} from "../tools.js";

it("tracks draft, owner-signed and canonical revocation without signing or broadcasting through MCP",async()=>{
  const e=await fixture();
  try {
    const tools=new GatewayTools(e.clients[0]),response=await tools.call("mandate_request_revoke",{}) as {actionId:Hex;approvalRequest:{requestId:Hex;status:string;chainActive:boolean;actionApplied:boolean};transaction:{data:Hex}};
    expect(response.approvalRequest.status).toBe("draft");expect(response.approvalRequest.actionApplied).toBe(false);expect(response.approvalRequest.chainActive).toBe(true);
    const wc=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)}),request=await wc.prepareTransactionRequest({to:e.wallet,data:response.transaction.data,value:0n,type:"eip1559"}),raw=await e.owner.signTransaction(request);
    const signed=await tools.ownerStatus.noteSigned(response.approvalRequest.requestId,raw);expect(signed.status).toBe("signed");expect(signed.transactionHash).toBe(keccak256(raw));expect(signed.actionApplied).toBe(false);
    expect((await tools.ownerStatus.reconcile(response.approvalRequest.requestId)).status).toBe("signed");expect(JSON.stringify(tools.ownerStatus.get(response.approvalRequest.requestId))).not.toContain(raw);
    const hash=await wc.sendRawTransaction({serializedTransaction:raw});await e.pc.waitForTransactionReceipt({hash});
    const task=await tools.call("mandate_get_task",{}) as {ownerRequests:{status:string;actionApplied:boolean;chainActive:boolean;grantStatus:string}[]};
    expect(task.ownerRequests[0]).toMatchObject({status:"confirmed",actionApplied:true,chainActive:false,grantStatus:"revoked"});expect(e.store.transactionRows()).toHaveLength(0);
  }finally{await e.close();}
});
it("rejects a different owner intent, signer or replacement signed transaction; reorg reverts applied status",async()=>{
  const e=await fixture();
  try {
    const tracker=new OwnerStatus(e.reader,e.store,1),draft=draftOwnerAction(31337,e.owner.address,e.wallet,{action:"revokeSession",id:e.root,sessionId:e.sessions[0]});
    await expect(tracker.create({...draft,action:"grant"},{mandateId:e.root,sessionId:e.sessions[0],requestedBy:"agent-a"})).rejects.toThrow("OWNER_DRAFT_CONTEXT_MISMATCH");
    const created=await tracker.create(draft,{mandateId:e.root,sessionId:e.sessions[0],requestedBy:"agent-a"});
    const wc=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)}),request=await wc.prepareTransactionRequest({to:e.wallet,data:draft.transaction.data,value:0n,type:"eip1559"});
    await expect(tracker.noteSigned(created.requestId,await e.agentA.signTransaction(request))).rejects.toThrow("OWNER_SIGNED_INTENT_MISMATCH");
    await expect(tracker.noteSigned(created.requestId,await e.owner.signTransaction({...request,value:1n}))).rejects.toThrow("OWNER_SIGNED_INTENT_MISMATCH");
    const raw=await e.owner.signTransaction(request);await tracker.noteSigned(created.requestId,raw);
    await expect(tracker.noteSigned(created.requestId,await e.owner.signTransaction({...request,nonce:request.nonce+1}))).rejects.toThrow("OWNER_SIGNED_TRANSACTION_FROZEN");
    const snapshot=await e.pc.request({method:"evm_snapshot" as never}),hash=await wc.sendRawTransaction({serializedTransaction:raw});await e.pc.waitForTransactionReceipt({hash});
    expect((await tracker.reconcile(created.requestId)).actionApplied).toBe(true);
    await e.pc.request({method:"evm_revert" as never,params:[snapshot] as never});
    expect(await tracker.reconcile(created.requestId)).toMatchObject({status:"signed",actionApplied:false,chainActive:true,transactionHash:hash});
    await wc.sendRawTransaction({serializedTransaction:raw});await e.pc.waitForTransactionReceipt({hash});expect((await tracker.reconcile(created.requestId)).grantStatus).toBe("revoked");
  }finally{await e.close();}
});
it("a reverted owner transaction does not activate a requested change or overwrite existing authority",async()=>{
  const e=await fixture();
  try {
    const tracker=new OwnerStatus(e.reader,e.store,1),draft=draftOwnerAction(31337,e.owner.address,e.wallet,{action:"pause",id:e.root,paused:false});
    const created=await tracker.create(draft,{mandateId:e.root,sessionId:e.sessions[0],requestedBy:"agent-a"});
    const wc=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)}),request=await wc.prepareTransactionRequest({to:e.wallet,data:draft.transaction.data,value:0n,type:"eip1559",gas:200000n}),raw=await e.owner.signTransaction(request);
    await tracker.noteSigned(created.requestId,raw);const hash=await wc.sendRawTransaction({serializedTransaction:raw});await e.pc.waitForTransactionReceipt({hash});
    expect(await tracker.reconcile(created.requestId)).toMatchObject({status:"failed",actionApplied:false,chainActive:true,rootStatus:"active",grantStatus:"active"});
    const fresh=await tracker.create(draft,{mandateId:e.root,sessionId:e.sessions[0],requestedBy:"agent-a"});expect(fresh.requestId).not.toBe(created.requestId);expect(fresh.status).toBe("draft");
    await expect(tracker.noteSigned(fresh.requestId,raw)).rejects.toThrow("OWNER_SIGNED_INTENT_MISMATCH");
  }finally{await e.close();}
});
