import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {privateKeyToAccount} from "viem/accounts";
import {recoverTypedDataAddress,type Hex,type TypedData} from "viem";
import {signOffer,signReceipt,verifyOffer,verifyReceipt,offerData,receiptData,type SignerBinding} from "../signed-artifacts.js";
import type {PaymentRequirements} from "@x402/core/types";
const signer=privateKeyToAccount("0x"+"11".repeat(32) as Hex),other=privateKeyToAccount("0x"+"22".repeat(32) as Hex),url="https://example.org/stats";
const requirements:PaymentRequirements={scheme:"exact",network:"eip155:84532",asset:"0x"+"33".repeat(20),amount:"10000",payTo:signer.address,maxTimeoutSeconds:300,extra:{}};
const payload={version:1 as const,resourceUrl:url,scheme:"exact" as const,network:requirements.network,asset:requirements.asset,payTo:requirements.payTo,amount:"10000",validUntil:2000};
const binding:SignerBinding={resourceUrl:url,signer:signer.address,validFrom:900,validUntil:3000,source:"explicit-auditor-configuration"};
const offerOptions={requirements,resourceUrl:url,accepts:[requirements],observedAt:1000,binding};
const transaction="0x"+"44".repeat(32) as Hex;
const receiptOptions={network:requirements.network,resourceUrl:url,payer:other.address,transaction,observedAt:1500,minIssuedAt:1000,binding};
it("matches the normative vendor EIP-712 schemas and keeps domain chainId=1 on Base",async()=>{
  const specification=readFileSync("vendor/x402/specs/extensions/extension-offer-and-receipt.md","utf8");
  for(const kind of ["Offer","Receipt"] as const){
    const section=specification.split(kind==="Offer"?"**4.3 EIP-712 Types":"**5.3 EIP-712 Types")[1];
    const normative=JSON.parse(section.split("```javascript\n")[1].split("```\n")[0]);
    const artifact=kind==="Offer"?await signOffer(signer,payload):await signReceipt(signer,{version:1,network:requirements.network,resourceUrl:url,payer:other.address,issuedAt:1400,transaction});
    const data=kind==="Offer"?offerData(artifact.payload):receiptData(artifact.payload);
    const types={...normative.types};delete types.EIP712Domain;
    expect(await recoverTypedDataAddress({...data,types:types as TypedData,primaryType:normative.primaryType,signature:artifact.signature})).toBe(signer.address);
    expect(data.domain.chainId).toBe(1);
  }
});
it("matches signed fields rather than offer order or unsigned acceptIndex",async()=>{
  const offer=await signOffer(signer,payload,1),otherTerms={...requirements,amount:"20000"};
  expect((await verifyOffer(offer,{...offerOptions,accepts:[otherTerms,requirements]})).signer).toBe(signer.address);
  await expect(verifyOffer({...offer,acceptIndex:0},{...offerOptions,accepts:[otherTerms,requirements]})).rejects.toThrow("INDEX_MISMATCH");
  await expect(verifyOffer(offer,{...offerOptions,requirements:otherTerms,accepts:[requirements,otherTerms]})).rejects.toThrow("TERMS_MISMATCH");
  const external={...offerOptions,accepts:undefined};expect((await verifyOffer({...offer,acceptIndex:99},external)).signer).toBe(signer.address);
});
it("separates signature validity from service identity and rejects expired/tampered/domain-switched offers",async()=>{
  const offer=await signOffer(signer,payload);
  await expect(verifyOffer(await signOffer(other,payload),offerOptions)).rejects.toThrow("NOT_AUTHORIZED");
  await expect(verifyOffer(offer,{...offerOptions,binding:{...binding,resourceUrl:"https://other.example.org/stats"}})).rejects.toThrow("NOT_AUTHORIZED");
  await expect(verifyOffer(offer,{...offerOptions,observedAt:2000})).rejects.toThrow("EXPIRED");
  await expect(verifyOffer({...offer,payload:{...payload,amount:"20000"}},offerOptions)).rejects.toThrow("TERMS_MISMATCH");
  const wrongDomain=await signer.signTypedData({...offerData(payload),domain:{name:"x402 offer",version:"1",chainId:84532}});
  await expect(verifyOffer({...offer,signature:wrongDomain},offerOptions)).rejects.toThrow("NOT_AUTHORIZED");
});
it("treats omitted optional fields as normative zero/empty, with weaker receipt correlation",async()=>{
  const {validUntil,...noDeadline}=payload,offer=await signOffer(signer,noDeadline);
  expect((await verifyOffer(offer,offerOptions)).artifact.payload.validUntil).toBeUndefined();
  const receipt=await signReceipt(signer,{version:1,network:requirements.network,resourceUrl:url,payer:other.address,issuedAt:1400});
  const result=await verifyReceipt(receipt,receiptOptions);expect(result.correlation).toBe("merchant-claim-without-transaction");expect(result.coversPaymentAmount).toBe(false);expect(result.coversResultBody).toBe(false);
});
it("rejects receipt transaction/payer/time mismatches and unsupported schemas/formats",async()=>{
  const receipt=await signReceipt(signer,{version:1,network:requirements.network,resourceUrl:url,payer:other.address,issuedAt:1400,transaction});
  expect((await verifyReceipt(receipt,receiptOptions)).correlation).toBe("merchant-claim-with-transaction");
  await expect(verifyReceipt(receipt,{...receiptOptions,transaction:"0x"+"55".repeat(32) as Hex})).rejects.toThrow("TRANSACTION_MISMATCH");
  await expect(verifyReceipt(receipt,{...receiptOptions,payer:signer.address})).rejects.toThrow("CONTEXT_MISMATCH");
  await expect(verifyReceipt(receipt,{...receiptOptions,minIssuedAt:1450})).rejects.toThrow("TIME_INVALID");
  await expect(verifyReceipt(receipt,{...receiptOptions,observedAt:1000})).rejects.toThrow("TIME_INVALID");
  await expect(verifyReceipt({format:"jws",signature:"a.b.c"},receiptOptions)).rejects.toThrow("FORMAT_UNSUPPORTED");
  await expect(verifyReceipt({...receipt,payload:{...receipt.payload,resultHash:transaction}},receiptOptions)).rejects.toThrow("SCHEMA_UNSUPPORTED");
  await expect(verifyOffer({...await signOffer(signer,payload),payload:{...payload,version:2}},offerOptions)).rejects.toThrow("SCHEMA_UNSUPPORTED");
});
