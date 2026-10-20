import {z} from "zod";
import {recoverTypedDataAddress,isAddressEqual,type Address,type Hex,type LocalAccount} from "viem";
import {atomicAmount,MandateError} from "../sdk/model.js";
import type {PaymentRequirements} from "@x402/core/types";
const evmAddress=z.string().regex(/^0x[0-9a-fA-F]{40}$/),network=z.string().regex(/^eip155:[1-9][0-9]{0,15}$/);
const resource=z.string().url().max(4096).refine(v=>{const u=new URL(v);return u.href===v&&!u.username&&!u.password&&!u.hash&&["https:","http:"].includes(u.protocol);});
const time=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),signature=z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(v=>v as Hex);
export const OfferPayloadSchema=z.object({version:z.literal(1),resourceUrl:resource,scheme:z.literal("exact"),network,asset:evmAddress,payTo:evmAddress,amount:z.string().regex(/^[1-9][0-9]{0,77}$/).refine(v=>{try{atomicAmount(v);return true;}catch{return false;}}),validUntil:time.optional()}).strict();
export const ReceiptPayloadSchema=z.object({version:z.literal(1),network,resourceUrl:resource,payer:evmAddress,issuedAt:time,transaction:z.string().regex(/^(|0x[0-9a-fA-F]{64})$/).optional()}).strict();
export const OfferSchema=z.object({format:z.literal("eip712"),payload:OfferPayloadSchema,signature,acceptIndex:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}).strict();
export const ReceiptSchema=z.object({format:z.literal("eip712"),payload:ReceiptPayloadSchema,signature}).strict();
export type SignedOffer=z.infer<typeof OfferSchema>;
export type SignedReceipt=z.infer<typeof ReceiptSchema>;
export const offerTypes={Offer:[{name:"version",type:"uint256"},{name:"resourceUrl",type:"string"},{name:"scheme",type:"string"},{name:"network",type:"string"},{name:"asset",type:"string"},{name:"payTo",type:"string"},{name:"amount",type:"string"},{name:"validUntil",type:"uint256"}]} as const;
export const receiptTypes={Receipt:[{name:"version",type:"uint256"},{name:"network",type:"string"},{name:"resourceUrl",type:"string"},{name:"payer",type:"string"},{name:"issuedAt",type:"uint256"},{name:"transaction",type:"string"}]} as const;
export function offerData(input:unknown){const p=OfferPayloadSchema.parse(input);return {domain:{name:"x402 offer",version:"1",chainId:1},types:offerTypes,primaryType:"Offer" as const,message:{...p,version:1n,validUntil:BigInt(p.validUntil??0)}};}
export function receiptData(input:unknown){const p=ReceiptPayloadSchema.parse(input);return {domain:{name:"x402 receipt",version:"1",chainId:1},types:receiptTypes,primaryType:"Receipt" as const,message:{...p,version:1n,issuedAt:BigInt(p.issuedAt),transaction:p.transaction??""}};}
export async function signOffer(signer:Pick<LocalAccount,"signTypedData">,input:unknown,acceptIndex?:number):Promise<SignedOffer>{const payload=OfferPayloadSchema.parse(input);return OfferSchema.parse({format:"eip712",payload,signature:await signer.signTypedData(offerData(payload)),...(acceptIndex===undefined?{}:{acceptIndex})});}
export async function signReceipt(signer:Pick<LocalAccount,"signTypedData">,input:unknown):Promise<SignedReceipt>{const payload=ReceiptPayloadSchema.parse(input);return ReceiptSchema.parse({format:"eip712",payload,signature:await signer.signTypedData(receiptData(payload))});}
export type SignerBinding={resourceUrl:string;signer:Address;validFrom:number;validUntil?:number;source:"owner-chain-merchant"|"explicit-auditor-configuration"};
function checkIdentity(recovered:Address,url:string,time:number,binding:SignerBinding){
  if(!Number.isSafeInteger(binding.validFrom)||binding.validFrom<0||(binding.validUntil!==undefined&&(!Number.isSafeInteger(binding.validUntil)||binding.validUntil<binding.validFrom)))throw new MandateError("SIGNED_ARTIFACT_IDENTITY_POLICY_INVALID");
  if(!Number.isSafeInteger(time)||time<binding.validFrom||(binding.validUntil!==undefined&&time>binding.validUntil)||url!==binding.resourceUrl||!isAddressEqual(recovered,binding.signer))throw new MandateError("SIGNED_ARTIFACT_SIGNER_NOT_AUTHORIZED");
}
function parseArtifact<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{
  if(input&&typeof input==="object"&&"format" in input&&input.format!=="eip712")throw new MandateError("SIGNED_ARTIFACT_FORMAT_UNSUPPORTED");
  const parsed=schema.safeParse(input);if(!parsed.success)throw new MandateError("SIGNED_ARTIFACT_SCHEMA_UNSUPPORTED");return parsed.data as z.output<S>;
}
function matches(p:SignedOffer["payload"],r:PaymentRequirements,url:string){return p.resourceUrl===url&&p.scheme===r.scheme&&p.network===r.network&&isAddressEqual(p.asset as Address,r.asset as Address)&&isAddressEqual(p.payTo as Address,r.payTo as Address)&&p.amount===r.amount;}
export async function verifyOffer(input:unknown,options:{requirements:PaymentRequirements;resourceUrl:string;accepts?:PaymentRequirements[];observedAt:number;binding:SignerBinding}){
  const offer=parseArtifact(OfferSchema,input),p=offer.payload;
  if(!matches(p,options.requirements,options.resourceUrl))throw new MandateError("SIGNED_OFFER_TERMS_MISMATCH");
  if(options.accepts&&offer.acceptIndex!==undefined&&(offer.acceptIndex>=options.accepts.length||!matches(p,options.accepts[offer.acceptIndex],options.resourceUrl)))throw new MandateError("SIGNED_OFFER_INDEX_MISMATCH");
  if(p.validUntil&&p.validUntil<=options.observedAt)throw new MandateError("SIGNED_OFFER_EXPIRED");
  let signer:Address;try{signer=await recoverTypedDataAddress({...offerData(p),signature:offer.signature});}catch{throw new MandateError("SIGNED_ARTIFACT_SIGNATURE_INVALID");}
  checkIdentity(signer,p.resourceUrl,options.observedAt,options.binding);
  return {artifact:offer,signer,identitySource:options.binding.source,guarantee:"merchant-signed-payment-terms" as const};
}
export async function verifyReceipt(input:unknown,options:{network:string;resourceUrl:string;payer:Address;transaction?:Hex;observedAt:number;minIssuedAt:number;maxClockSkewSeconds?:number;binding:SignerBinding}){
  const receipt=parseArtifact(ReceiptSchema,input),p=receipt.payload;
  if(!Number.isSafeInteger(options.observedAt)||!Number.isSafeInteger(options.minIssuedAt)||options.observedAt<0||options.minIssuedAt<0||!Number.isSafeInteger(options.maxClockSkewSeconds??60)||(options.maxClockSkewSeconds??60)<0||(options.maxClockSkewSeconds??60)>86400)throw new MandateError("SIGNED_RECEIPT_TIME_POLICY_INVALID");
  if(p.network!==options.network||p.resourceUrl!==options.resourceUrl||!isAddressEqual(p.payer as Address,options.payer))throw new MandateError("SIGNED_RECEIPT_CONTEXT_MISMATCH");
  if(p.issuedAt<options.minIssuedAt||p.issuedAt>options.observedAt+(options.maxClockSkewSeconds??60))throw new MandateError("SIGNED_RECEIPT_TIME_INVALID");
  if(p.transaction&&(!options.transaction||p.transaction.toLowerCase()!==options.transaction.toLowerCase()))throw new MandateError("SIGNED_RECEIPT_TRANSACTION_MISMATCH");
  let signer:Address;try{signer=await recoverTypedDataAddress({...receiptData(p),signature:receipt.signature});}catch{throw new MandateError("SIGNED_ARTIFACT_SIGNATURE_INVALID");}
  checkIdentity(signer,p.resourceUrl,p.issuedAt,options.binding);
  return {artifact:receipt,signer,identitySource:options.binding.source,correlation:p.transaction?"merchant-claim-with-transaction":"merchant-claim-without-transaction",coversPaymentAmount:false,coversRequestBody:false,coversResultBody:false};
}
