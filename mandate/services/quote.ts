import {z} from "zod";
import {decodePaymentRequiredHeader} from "@x402/core/http";
import {recoverTypedDataAddress,isAddressEqual,keccak256,toHex,type Address,type Hex} from "viem";
import {RequirementsSchema} from "./catalog.js";
import {SafeHttp} from "./http.js";
import {atomicAmount,canonicalJson,requestHash,merchantQuoteTypedData,decodePayment,encodePayment,type Payment,MandateError} from "../sdk/model.js";
import {OfferSchema,verifyOffer,type SignedOffer} from "../evidence/signed-artifacts.js";
export const ServiceRequestSchema=z.object({method:z.enum(["GET","POST"]),url:z.string().url().max(4096),body:z.unknown().default(null)}).strict();
const RequiredSchema=z.object({x402Version:z.literal(2),resource:z.object({url:z.string().url().max(4096)}).passthrough(),accepts:z.array(RequirementsSchema).min(1).max(32),extensions:z.record(z.unknown()).optional()}).passthrough();
export type QuotePolicy={chainId:number;asset:Address;payTo:Address;domainName:string;domainVersion:string;maxAmount:bigint;approvedRequestHash:Hex;quoteSigner?:Address;quoteIdentitySource?:"owner-chain-merchant"|"explicit-auditor-configuration"};
export async function fetchQuote(http:SafeHttp,request:z.input<typeof ServiceRequestSchema>,policy:QuotePolicy,options:{previousRequirementsHash?:Hex;payment?:Payment;wallet?:Address;chainTimestamp?:bigint;discoveryOnly?:boolean}={}) {
  const parsed=ServiceRequestSchema.parse(request),r={...parsed,body:parsed.body??null},hash=requestHash(r);
  if(hash!==policy.approvedRequestHash)throw new MandateError("OWNER_REQUEST_APPROVAL_REQUIRED");
  const headers:Record<string,string>={};
  if(r.method==="POST")headers["content-type"]="application/json";
  if(options.payment){headers["MANDATE-CONTEXT"]=Buffer.from(JSON.stringify(encodePayment(options.payment))).toString("base64");if(options.wallet)headers["MANDATE-WALLET"]=options.wallet;}
  const response=await http.request(r.url,{method:r.method,headers,body:r.body===null?undefined:Buffer.from(canonicalJson(r.body))});
  if(response.status!==402)throw new MandateError("EXPECTED_PAYMENT_REQUIRED");
  const header=response.headers["payment-required"];
  if(typeof header!=="string" || header.length>16384)throw new MandateError("PAYMENT_REQUIREMENTS_HEADER_INVALID");
  let required:z.infer<typeof RequiredSchema>;
  try{required=RequiredSchema.parse(decodePaymentRequiredHeader(header));}catch{throw new MandateError("PAYMENT_REQUIREMENTS_SCHEMA_INVALID");}
  if(new URL(required.resource.url).href!==new URL(r.url).href)throw new MandateError("QUOTE_RESOURCE_MISMATCH");
  const candidates=required.accepts.filter(a=>a.scheme==="exact" && a.network===`eip155:${policy.chainId}` && a.asset.toLowerCase()===policy.asset.toLowerCase()
    && a.payTo.toLowerCase()===policy.payTo.toLowerCase() && (a.extra.assetTransferMethod===undefined || a.extra.assetTransferMethod==="eip3009") && a.extra.name===policy.domainName && a.extra.version===policy.domainVersion && a.maxTimeoutSeconds<=300)
    .filter(a=>{try{return atomicAmount(a.amount)>0n && atomicAmount(a.amount)<=policy.maxAmount;}catch{return false;}})
    .sort((a,b)=>atomicAmount(a.amount)<atomicAmount(b.amount)?-1:atomicAmount(a.amount)>atomicAmount(b.amount)?1:canonicalJson(a).localeCompare(canonicalJson(b)));
  if(!candidates.length)throw new MandateError("QUOTE_OUTSIDE_AUTHORIZATION");
  const requirements=candidates[0],quoteHash=keccak256(toHex(canonicalJson(requirements)));
  if(options.payment && (options.chainTimestamp===undefined || options.payment.validBefore<=options.chainTimestamp || options.payment.validBefore>options.chainTimestamp+BigInt(requirements.maxTimeoutSeconds) || options.payment.requestHash!==hash || options.payment.quoteHash!==quoteHash || options.payment.value!==atomicAmount(requirements.amount) || !isAddressEqual(options.payment.to,policy.payTo)))throw new MandateError("PAYMENT_QUOTE_OR_WINDOW_MISMATCH");
  if(options.previousRequirementsHash && options.previousRequirementsHash!==quoteHash)throw new MandateError("QUOTE_CHANGED_APPROVAL_REQUIRED");
  let standardOffer:SignedOffer|undefined;
  if(required.extensions?.["offer-receipt"]!==undefined){
    const extension=z.object({info:z.object({offers:z.array(z.unknown()).min(1).max(32)}).strict(),schema:z.unknown().optional()}).strict().safeParse(required.extensions["offer-receipt"]);
    if(!extension.success)throw new MandateError("SIGNED_OFFER_EXTENSION_UNSUPPORTED");
    if(!policy.quoteSigner||policy.quoteSigner==="0x0000000000000000000000000000000000000000")throw new MandateError("SIGNED_ARTIFACT_SIGNER_AUTHORITY_REQUIRED");
    const matching=extension.data.info.offers.filter(o=>{const p=OfferSchema.safeParse(o);return p.success&&p.data.payload.resourceUrl===r.url&&p.data.payload.network===requirements.network&&p.data.payload.amount===requirements.amount&&isAddressEqual(p.data.payload.asset as Address,requirements.asset as Address)&&isAddressEqual(p.data.payload.payTo as Address,requirements.payTo as Address);});
    if(matching.length!==1)throw new MandateError("SIGNED_OFFER_MATCH_UNSUPPORTED");
    const observedAt=options.chainTimestamp===undefined?Math.floor(Date.now()/1000):Number(options.chainTimestamp);
    standardOffer=(await verifyOffer(matching[0],{requirements:requirements as PaymentRequirements,resourceUrl:r.url,accepts:required.accepts as PaymentRequirements[],observedAt,binding:{resourceUrl:r.url,signer:policy.quoteSigner,validFrom:0,source:policy.quoteIdentitySource??"owner-chain-merchant"}})).artifact;
    if(options.payment&&standardOffer.payload.validUntil&&options.payment.validBefore>BigInt(standardOffer.payload.validUntil))throw new MandateError("PAYMENT_EXCEEDS_SIGNED_OFFER_WINDOW");
  }
  let merchantSignature:Hex|undefined;
  const requiresProof=!!policy.quoteSigner && policy.quoteSigner!=="0x0000000000000000000000000000000000000000";
  if(requiresProof && !options.discoveryOnly) {
    const extension=z.object({schemaVersion:z.literal(2),payment:z.unknown(),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().safeParse(required.extensions?.mandateQuote);
    if(!extension.success || !options.payment || !options.wallet)throw new MandateError("MERCHANT_QUOTE_PROOF_REQUIRED");
    const payment=decodePayment(extension.data.payment);
    if(canonicalJson(encodePayment(payment))!==canonicalJson(encodePayment(options.payment)) || payment.requestHash!==hash || payment.quoteHash!==quoteHash || payment.value!==atomicAmount(requirements.amount) || !isAddressEqual(payment.to,policy.payTo))throw new MandateError("MERCHANT_QUOTE_CONTEXT_MISMATCH");
    merchantSignature=extension.data.signature as Hex;
    const recovered=await recoverTypedDataAddress({...merchantQuoteTypedData(policy.chainId,options.wallet,payment),signature:merchantSignature});
    if(!isAddressEqual(recovered,policy.quoteSigner!))throw new MandateError("MERCHANT_QUOTE_SIGNER_MISMATCH");
  }
  return {schemaVersion:2,request:r,requestHash:hash,requirements,quoteHash,merchantSignature,standardOffer,resource:required.resource,receivedAt:response.receivedAt,extensions:required.extensions,evidenceLevel:standardOffer?"standard-signed-offer":merchantSignature?"internal-mandate-quote-signature":"unsigned-live-endpoint",readyForRegistration:!options.discoveryOnly && (!requiresProof || !!merchantSignature),sourceUrl:response.url};
}
import type {PaymentRequirements} from "@x402/core/types";
