const artifactDirectory=process.env.MANDATE_M5_ARTIFACT_DIR??"artifacts/m5";
import {it,expect} from "vitest";
import {fixture} from "../../services/test/fixture.js";
import {verifyReceipt} from "../signed-artifacts.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {decodePaymentResponseHeader,encodePaymentResponseHeader} from "@x402/core/http";
it("actual HTTP offer and receipt use owner-bound signer and preserve the original paid order",async()=>{
  const e=await fixture({signedOffersAndReceipts:true});
  try{
    const quote=await e.clients[0].quote(e.services[0].serviceId);expect(quote.quote.evidenceLevel).toBe("standard-signed-offer");expect(quote.quote.standardOffer?.payload.amount).toBe("10000");
    const paid=await e.clients[0].call(e.services[0].serviceId);expect(paid.paymentState).toBe("paid");expect(paid.serviceState).toBe("returned");expect(paid.resultState).toBe("valid");expect(paid.receiptEvidence).toEqual({status:"confirmed",correlation:"merchant-claim-with-transaction",coversPaymentAmount:false,coversRequestBody:false,coversResultBody:false});
    const receipt=paid.merchantReceipt as {payload:{transaction:string}};expect(receipt.payload.transaction).toBe(paid.settlementHash);
    const other=await e.clients[1].call(e.services[0].serviceId);expect(other.settlementHash).toBe(paid.settlementHash);expect(other.merchantReceipt).toEqual(paid.merchantReceipt);
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
    mkdirSync(artifactDirectory,{recursive:true});writeFileSync(artifactDirectory+"/local-http-artifacts.json",JSON.stringify({schemaVersion:2,network:"local-ephemeral-Anvil",chainId:31337,paymentState:paid.paymentState,serviceState:paid.serviceState,resultState:paid.resultState,offer:quote.quote.standardOffer,receipt:paid.merchantReceipt,receiptEvidence:paid.receiptEvidence,signer:e.merchantSigner.address,wallet:e.wallet,resourceUrl:e.services[0].url,settlementHash:paid.settlementHash,registrationHash:paid.registrationHash,paidAtomic:"10000",duplicateAgentSamePayment:true,identitySource:"owner-configured-chain-merchant",signatureDomainChainId:1,publicNetworkClaim:false},null,2)+"\n");
  }finally{await e.close();}
});
it("a corrupted receipt cannot erase canonical payment or turn an invalid signature into confirmed evidence",async()=>{
  const e=await fixture({signedOffersAndReceipts:true});
  try{
    const original=e.http.request.bind(e.http);
    e.http.request=async(...args)=>{
      const response=await original(...args),header=response.headers["payment-response"];
      if(response.status===200&&typeof header==="string"){
        const decoded=decodePaymentResponseHeader(header),extension=decoded.extensions?.["offer-receipt"] as {info:{receipt:{payload:{resourceUrl:string}}}};
        extension.info.receipt.payload.resourceUrl="https://other.example.org/stats";
        response.headers["payment-response"]=encodePaymentResponseHeader(decoded);
      }
      return response;
    };
    const paid=await e.clients[0].call(e.services[0].serviceId);expect(paid.paymentState).toBe("paid");expect(paid.resultState).toBe("valid");expect(paid.receiptEvidence?.status).toBe("contradicted");expect(paid.receiptEvidence?.code).toBe("SIGNED_RECEIPT_CONTEXT_MISMATCH");expect(paid.merchantReceipt).toBeUndefined();
    expect((await e.reader.readBudget(e.root,e.sessions[0])).policy.occupied).toBe(10000n);
  }finally{await e.close();}
});
it("unavailable RPC identity verification is incomplete and preserves the independently proven payment",async()=>{
  const e=await fixture({signedOffersAndReceipts:true});
  try{
    let returned=false;const request=e.http.request.bind(e.http),read=e.pc.readContract.bind(e.pc);
    e.http.request=async(...args)=>{const response=await request(...args);if(response.status===200)returned=true;return response;};
    e.pc.readContract=(async(params:Parameters<typeof e.pc.readContract>[0])=>{if(returned&&params.functionName==="getMerchant")throw new Error("simulated RPC timeout during receipt identity verification");return read(params);}) as typeof e.pc.readContract;
    const paid=await e.clients[0].call(e.services[0].serviceId);expect(paid.paymentState).toBe("paid");expect(paid.receiptEvidence?.status).toBe("incomplete");expect(paid.receiptEvidence?.code).toBe("MERCHANT_RECEIPT_VERIFICATION_UNAVAILABLE");expect(paid.resultState).toBe("valid");
  }finally{await e.close();}
});
it("service failure after payment has no success receipt and retry retrieves the same payment",async()=>{
  const e=await fixture({signedOffersAndReceipts:true,failAfterPayment:true});
  try{
    const first=await e.clients[0].call(e.services[0].serviceId);expect(first.paymentState).toBe("paid");expect(first.serviceState).toBe("failed");expect(first.receiptEvidence?.status).toBe("incomplete");expect(first.merchantReceipt).toBeUndefined();
    const restored=await e.clients[0].call(e.services[0].serviceId);expect(restored.settlementHash).toBe(first.settlementHash);expect(restored.receiptEvidence?.status).toBe("confirmed");
    const invalid={...(restored.merchantReceipt as any),payload:{...(restored.merchantReceipt as any).payload,resourceUrl:"https://other.example.org/stats"}};
    await expect(verifyReceipt(invalid,{network:"eip155:31337",resourceUrl:e.services[0].url,payer:e.wallet,transaction:restored.settlementHash,observedAt:Number((await e.pc.getBlock()).timestamp),minIssuedAt:0,binding:{resourceUrl:e.services[0].url,signer:e.merchantSigner.address,validFrom:0,source:"owner-chain-merchant"}})).rejects.toThrow("CONTEXT_MISMATCH");
  }finally{await e.close();}
});
