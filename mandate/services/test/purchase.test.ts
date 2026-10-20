import {it,expect,vi} from "vitest";
import {encodeFunctionData,HttpRequestError,WaitForTransactionReceiptTimeoutError} from "viem";
import {encodePaymentSignatureHeader} from "@x402/core/http";
import {decodePaymentRequiredHeader,encodePaymentRequiredHeader} from "@x402/core/http";
import type {PaymentPayload} from "@x402/core/types";
import {fixture} from "./fixture.js";
import {accountAbi} from "../../sdk/accountAbi.js";
import {testTokenAbi} from "../../sdk/testTokenAbi.js";
import {PurchaseStore} from "../store.js";
import {PurchaseClient} from "../client.js";
import {DurableTransactions,canonicalReceipt} from "../transactions.js";
import {createWalletClient,http} from "viem";
import {MandateError} from "../../sdk/model.js";
it("two agents purchase approved services; same-step concurrency pays once and wrong HTTP reuse is rejected",async()=>{
  const e=await fixture();
  try {
    const same=await Promise.all([e.clients[0].call(e.services[0].serviceId),e.clients[1].call(e.services[0].serviceId)]);
    const first=e.store.get(same[0].key)!;expect(first.paymentState).toBe("paid");expect(first.serviceState).toBe("returned");expect(first.resultState).toBe("valid");
    const repeated=await e.clients[0].call(e.services[0].serviceId);expect(repeated.settlementHash).toBe(first.settlementHash);
    const misuse=await e.http.request(e.services[1].url,{headers:{"PAYMENT-SIGNATURE":encodePaymentSignatureHeader(first.payload as PaymentPayload)}});expect(misuse.status).toBe(400);
    const second=await e.clients[1].call(e.services[1].serviceId);expect(second.paymentState).toBe("paid");expect(second.resultState).toBe("valid");
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(20000n);
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(20000n);
  }finally{await e.close();}
});
it("service failure after payment is distinct; retry returns cached result without another settlement",async()=>{
  const e=await fixture({failAfterPayment:true});
  try {
    const first=await e.clients[0].call(e.services[0].serviceId);expect(first.paymentState).toBe("paid");expect(first.serviceState).toBe("failed");expect(first.resultState).toBe("unchecked");
    const recovered=await e.clients[0].call(e.services[0].serviceId);expect(recovered.paymentState).toBe("paid");expect(recovered.serviceState).toBe("returned");expect(recovered.settlementHash).toBe(first.settlementHash);
    expect(e.facilityStore.transactionRows()).toHaveLength(1);
  }finally{await e.close();}
});
it("restart after signed registration persistence reuses the same raw transaction and business nonce",async()=>{
  const e=await fixture();let second:PurchaseStore|undefined;
  try {
    const interrupt=vi.spyOn(e.transactions,"send").mockRejectedValueOnce(new Error("interrupted after persist"));
    const pending=await e.clients[0].call(e.services[0].serviceId);expect(pending.paymentState).toBe("registering");
    const original=e.store.transactionRows()[0];expect(original.status).toBe("prepared");expect(pending.payload).toBeUndefined();interrupt.mockRestore();
    second=new PurchaseStore(e.storePath);const manager=new DurableTransactions(e.pc,createWalletClient({chain:e.chain,account:e.operator,transport:http(e.node.rpc)}),second,10n**18n,1);
    const restarted=new PurchaseClient(e.context(0),e.reader,manager,e.http,second),result=await restarted.call(e.services[0].serviceId);
    expect(result.paymentState).toBe("paid");expect(second.transactionRows()[0].raw).toBe(original.raw);expect(result.payment!.nonce).toBe(pending.payment!.nonce);
    expect(second.transactionRows()).toHaveLength(1);
  }finally{second?.close();await e.close();}
});
it("revoked agent cannot register or sign a purchase",async()=>{
  const e=await fixture();
  try {
    await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[e.root,e.sessions[0]]}));
    const sign=vi.spyOn(e.agentA,"signTypedData"),result=await e.clients[0].call(e.services[0].serviceId);
    expect(result.paymentState).toBe("rejected");expect(result.errorCode).toBe("AGENT_GRANT_INACTIVE");expect(sign).not.toHaveBeenCalled();expect(e.store.transactionRows()).toHaveLength(0);
  }finally{await e.close();}
});
it("lost HTTP response after settlement recovers from token events and reuses the original payload",async()=>{
  const e=await fixture();
  try {
    const original=e.http.request.bind(e.http);let lost=true;
    vi.spyOn(e.http,"request").mockImplementation(async(url,options)=>{const r=await original(url,options);if(options?.headers?.["PAYMENT-SIGNATURE"] && lost){lost=false;throw new MandateError("HTTP_RESPONSE_LOST");}return r;});
    const sign=vi.spyOn(e.agentA,"signTypedData"),first=await e.clients[0].call(e.services[0].serviceId);
    expect(first.serviceState).toBe("unknown");expect(first.settlementHash).toBeUndefined();const signatureCalls=sign.mock.calls.length;
    const recovered=await e.clients[0].call(e.services[0].serviceId);expect(recovered.paymentState).toBe("paid");expect(recovered.serviceState).toBe("returned");expect(sign.mock.calls.length).toBe(signatureCalls);expect(e.facilityStore.transactionRows()).toHaveLength(1);
    expect(recovered.payment!.nonce).toBe(first.payment!.nonce);
  }finally{await e.close();}
});
it("facilitator prevalidation followed by owner revocation rejects settlement and retains reserved budget",async()=>{
  const e=await fixture();
  try {
    const original=e.facilitator.settle.bind(e.facilitator);
    vi.spyOn(e.facilitator,"settle").mockImplementationOnce(async(...args)=>{await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[e.root,e.sessions[0]]}));return original(...args);});
    const result=await e.clients[0].call(e.services[0].serviceId);expect(result.paymentState).not.toBe("paid");expect(result.serviceState).toBe("failed");
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(0n);
    expect(e.facilityStore.transactionRows()).toHaveLength(0);
  }finally{await e.close();}
});
it("a reorg removing registration and settlement restores only the original raw transactions and payload",async()=>{
  const e=await fixture();
  try {
    const snapshot=await e.pc.request({method:"evm_snapshot" as never});
    const sign=vi.spyOn(e.agentA,"signTypedData"),first=await e.clients[0].call(e.services[0].serviceId);
    expect(first.paymentState).toBe("paid");const signedCalls=sign.mock.calls.length,registration=e.store.transactionRows()[0],settlement=e.facilityStore.transactionRows()[0];
    await e.pc.request({method:"evm_revert" as never,params:[snapshot] as never});
    const recovered=await e.clients[0].call(e.services[0].serviceId);
    expect(recovered.paymentState).toBe("paid");expect(recovered.resultState).toBe("valid");
    expect(sign.mock.calls.length).toBe(signedCalls);expect(recovered.payload).toEqual(first.payload);expect(recovered.payment).toEqual(first.payment);
    expect(e.store.transactionRows()).toHaveLength(1);expect(e.store.transactionRows()[0].raw).toBe(registration.raw);
    expect(e.facilityStore.transactionRows()).toHaveLength(1);expect(e.facilityStore.transactionRows()[0].raw).toBe(settlement.raw);
    expect(await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.merchantSigner.address]})).toBe(10000n);
  }finally{await e.close();}
});
it("a broadcast accepted before an RPC response loss is reconciled with the same signed transaction",async()=>{
  const e=await fixture();
  try {
    const send=e.transactions.wc.sendRawTransaction.bind(e.transactions.wc);
    vi.spyOn(e.transactions.wc,"sendRawTransaction").mockImplementationOnce(async args=>{await send(args);throw new Error("RPC_RESPONSE_LOST_AFTER_ACCEPT");});
    const record=await e.clients[0].call(e.services[0].serviceId);
    expect(record.paymentState).toBe("paid");expect(e.store.transactionRows()).toHaveLength(1);expect(e.facilityStore.transactionRows()).toHaveLength(1);
    expect(record.registrationHash).toBe(e.store.transactionRows()[0].hash);
  }finally{await e.close();}
});
it("a temporarily unset public receipt block hash is refreshed without creating a transaction",async()=>{
  const e=await fixture();
  try {
    const record=await e.clients[0].call(e.services[0].serviceId),receipt=await e.pc.getTransactionReceipt({hash:record.registrationHash!}),rows=e.store.transactionRows();
    const corrected=await canonicalReceipt(e.pc,{...receipt,blockHash:("0x"+"00".repeat(32)) as `0x${string}`},1);
    expect(corrected.blockHash).toBe(receipt.blockHash);expect(corrected.transactionHash).toBe(receipt.transactionHash);expect(e.store.transactionRows()).toEqual(rows);
  }finally{await e.close();}
});
it("a failed receipt wait after a successful broadcast looks up the same hash and settles once",async()=>{
  const e=await fixture();
  try {
    const send=vi.spyOn(e.transactions.wc,"sendRawTransaction"),sign=vi.spyOn(e.agentA,"signTypedData");
    vi.spyOn(e.pc,"waitForTransactionReceipt").mockImplementationOnce(async({hash})=>{throw new WaitForTransactionReceiptTimeoutError({hash});});
    const first=await e.clients[0].call(e.services[0].serviceId);
    expect(first.paymentState).toBe("paid");expect(first.resultState).toBe("valid");expect(send).toHaveBeenCalledTimes(1);
    const signatureCount=sign.mock.calls.length,repeated=await e.clients[0].call(e.services[0].serviceId);
    expect(repeated.settlementHash).toBe(first.settlementHash);expect(sign.mock.calls.length).toBe(signatureCount);expect(send).toHaveBeenCalledTimes(1);
    expect(e.store.transactionRows()).toHaveLength(1);expect(e.facilityStore.transactionRows()).toHaveLength(1);
  }finally{await e.close();}
});
it("a transient canonical block lookup failure rechecks the original receipt; RPC rejection is not retried",async()=>{
  const e=await fixture();
  try {
    const record=await e.clients[0].call(e.services[0].serviceId),receipt=await e.pc.getTransactionReceipt({hash:record.registrationHash!});
    const get=vi.spyOn(e.pc,"getBlock").mockRejectedValueOnce(new HttpRequestError({url:"https://rpc.invalid",status:503}));
    expect((await canonicalReceipt(e.pc,receipt,1)).transactionHash).toBe(receipt.transactionHash);expect(get).toHaveBeenCalledTimes(2);
    get.mockClear();get.mockRejectedValueOnce(new HttpRequestError({url:"https://rpc.invalid",status:401}));
    await expect(canonicalReceipt(e.pc,receipt,1)).rejects.toMatchObject({status:401});expect(get).toHaveBeenCalledTimes(1);
  }finally{await e.close();}
});
it("an expired registered commitment is reported without signing, broadcasting or replacing it",async()=>{
  const e=await fixture();
  try {
    const wait=vi.spyOn(e.pc,"waitForTransactionReceipt").mockRejectedValueOnce(new Error("receipt monitoring interrupted"));
    const first=await e.clients[0].call(e.services[0].serviceId);wait.mockRestore();
    expect(first.paymentState).toBe("registering");expect(first.errorDiagnostic?.stage).toBe("registration-confirm");
    const original=e.store.transactionRows()[0],nonce=first.payment!.nonce;
    await e.pc.request({method:"evm_setNextBlockTimestamp" as never,params:[Number(BigInt(first.payment!.validBefore)+1n)] as never});await e.pc.request({method:"evm_mine" as never});
    const sign=vi.spyOn(e.agentA,"signTypedData"),send=vi.spyOn(e.transactions,"send"),http=vi.spyOn(e.http,"request");
    const read=await e.clients[0].readRecord(first.key);expect(read.record.errorCode).toBe("PAYMENT_COMMITMENT_EXPIRED");
    const retry=await e.clients[0].call(e.services[0].serviceId);expect(retry.errorCode).toBe("PAYMENT_COMMITMENT_EXPIRED");
    expect(retry.payment!.nonce).toBe(nonce);expect(e.store.transactionRows()).toEqual([{...original,status:"confirmed"}]);
    expect(retry.registrationBlock).toBeDefined();expect(retry.registrationBlockHash).toBeDefined();
    expect(sign).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(http).not.toHaveBeenCalled();
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
  }finally{await e.close();}
});
it("read-only task reconciliation refreshes released occupancy and cannot sign, broadcast or fetch a service",async()=>{
  const e=await fixture();
  try {
    const request=e.http.request.bind(e.http);
    vi.spyOn(e.http,"request").mockImplementation(async(url,options)=>{if(options?.headers?.["PAYMENT-SIGNATURE"])throw new Error("hold after registration");return request(url,options);});
    const pending=await e.clients[0].call(e.services[0].serviceId);expect(pending.paymentState).toBe("pending");
    const p=(await import("../../sdk/model.js")).decodePayment(pending.payment!),timestamp=p.validBefore+1n;
    await e.pc.request({method:"evm_setNextBlockTimestamp" as never,params:[Number(timestamp)] as never});await e.pc.request({method:"evm_mine" as never});
    const digest=await e.pc.readContract({address:e.wallet,abi:accountAbi,functionName:"paymentDigest",args:[p]});await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"releaseExpired",args:[digest]}));
    const sign=vi.spyOn(e.agentA,"signTypedData"),broadcast=vi.spyOn(e.transactions,"send"),httpRequest=vi.spyOn(e.http,"request");sign.mockClear();broadcast.mockClear();httpRequest.mockClear();
    const view=await e.clients[1].readRecord(pending.key);expect(view.record.paymentState).toBe("released");expect(view.refresh).toBe("chain-reconciled");expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(0n);
    expect(sign).not.toHaveBeenCalled();expect(broadcast).not.toHaveBeenCalled();expect(httpRequest).not.toHaveBeenCalled();
  }finally{await e.close();}
});
it("a price change after the Agent saw a quote is rejected even when still below the owner per-payment cap",async()=>{
  const e=await fixture();
  try {
    await e.clients[0].quote(e.services[0].serviceId);
    const original=e.http.request.bind(e.http);
    vi.spyOn(e.http,"request").mockImplementation(async(url,options)=>{const response=await original(url,options);const header=response.headers["payment-required"];if(response.status===402&&typeof header==="string"){const required=decodePaymentRequiredHeader(header);required.accepts[0].amount="20000";response.headers["payment-required"]=encodePaymentRequiredHeader(required);}return response;});
    const sign=vi.spyOn(e.agentA,"signTypedData"),result=await e.clients[0].call(e.services[0].serviceId);
    expect(result.paymentState).toBe("rejected");expect(result.errorCode).toBe("QUOTE_CHANGED_APPROVAL_REQUIRED");expect(sign).not.toHaveBeenCalled();expect(e.store.transactionRows()).toHaveLength(0);expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(0n);
  }finally{await e.close();}
});
