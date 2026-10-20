import { z } from "zod";
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";

export class MandateError extends Error {
  constructor(readonly code: string, readonly detail?: string) { super(code); }
}
const uint256Max = (1n << 256n) - 1n;
export function atomicAmount(value: string | bigint): bigint {
  if (typeof value !== "bigint" && (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))) throw new MandateError("INVALID_ATOMIC_AMOUNT");
  const result = BigInt(value);
  if (result < 0n || result > uint256Max) throw new MandateError("INVALID_ATOMIC_AMOUNT");
  return result;
}
export function parseUSDC(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) throw new MandateError("INVALID_USDC_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  return atomicAmount(BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0")));
}
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v => v.toLowerCase() as Hex);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v as Address);
const uint = z.bigint().min(0n).max(uint256Max);
const version = z.bigint().min(1n).max((1n << 64n) - 1n);
export const PaymentSchema = z.object({
  mandateId: hash, policyVersion: version, sessionId: hash, sessionEpoch: version,
  stepId: hash, merchantId: hash, requestHash: hash, quoteHash: hash, to: address,
  value: uint.refine(v => v > 0n), validAfter: uint.refine(v => v === 0n), validBefore: uint,
  nonce: hash,
}).strict();
export type Payment = z.infer<typeof PaymentSchema>;
export function encodePayment(input: Payment): Record<string,string> {
  return Object.fromEntries(Object.entries(PaymentSchema.parse(input)).map(([k,v])=>[k,typeof v === "bigint"?v.toString():v]));
}
export function decodePayment(input: unknown): Payment {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MandateError("INVALID_PAYMENT_RECORD");
  const value = {...input as Record<string,unknown>};
  for (const field of ["policyVersion","sessionEpoch","value","validAfter","validBefore"])
    value[field] = atomicAmount(value[field] as string);
  return PaymentSchema.parse(value);
}
export function nonceFor(chainId: number, wallet: Address, mandateId: Hex, stepId: Hex): Hex {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new MandateError("INVALID_CHAIN");
  return keccak256(encodeAbiParameters([{type:"uint256"},{type:"address"},{type:"bytes32"},{type:"bytes32"}], [BigInt(chainId), wallet, mandateId, stepId]));
}
export const registrationTypes = { RegisterPayment: [
  {name:"mandateId",type:"bytes32"},{name:"policyVersion",type:"uint64"},{name:"sessionId",type:"bytes32"},{name:"sessionEpoch",type:"uint64"},
  {name:"stepId",type:"bytes32"},{name:"merchantId",type:"bytes32"},{name:"requestHash",type:"bytes32"},{name:"quoteHash",type:"bytes32"},
  {name:"to",type:"address"},{name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"},
] } as const;
export const authorizationTypes = { TransferWithAuthorization: [
  {name:"from",type:"address"},{name:"to",type:"address"},{name:"value",type:"uint256"},
  {name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"},
] } as const;
export const quoteTypes = { MerchantQuote: [
  {name:"mandateId",type:"bytes32"},{name:"policyVersion",type:"uint64"},{name:"stepId",type:"bytes32"},{name:"requestHash",type:"bytes32"},
  {name:"quoteHash",type:"bytes32"},{name:"to",type:"address"},{name:"value",type:"uint256"},{name:"validBefore",type:"uint256"},
] } as const;
export function registrationTypedData(chainId: number, wallet: Address, input: Payment) {
  const p = PaymentSchema.parse(input);
  if (p.nonce !== nonceFor(chainId, wallet, p.mandateId, p.stepId)) throw new MandateError("NONCE_MISMATCH");
  return {domain:{name:"MandateWallet",version:"2",chainId,verifyingContract:wallet}, types:registrationTypes,primaryType:"RegisterPayment" as const,message:p};
}
export function merchantQuoteTypedData(chainId: number, wallet: Address, input: Payment) {
  const p = PaymentSchema.parse(input);
  return {domain:{name:"MandateWallet",version:"2",chainId,verifyingContract:wallet},types:quoteTypes,primaryType:"MerchantQuote" as const,
    message:{mandateId:p.mandateId,policyVersion:p.policyVersion,stepId:p.stepId,requestHash:p.requestHash,quoteHash:p.quoteHash,to:p.to,value:p.value,validBefore:p.validBefore}};
}
export function paymentTypedData(domain: {name:string;version:string;chainId:number;verifyingContract:Address}, wallet: Address, input: Payment) {
  const p = PaymentSchema.parse(input);
  if (p.nonce !== nonceFor(domain.chainId, wallet, p.mandateId, p.stepId)) throw new MandateError("NONCE_MISMATCH");
  return {domain,types:authorizationTypes,primaryType:"TransferWithAuthorization" as const,message:{from:wallet,to:p.to,value:p.value,validAfter:p.validAfter,validBefore:p.validBefore,nonce:p.nonce}};
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype)
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalJson((value as Record<string,unknown>)[k])).join(",") + "}";
  throw new MandateError("NON_JSON_REQUEST");
}
export function requestHash(input: {method:"GET"|"POST";url:string;body:unknown}): Hex {
  const url = new URL(input.url);
  if (url.username || url.password || url.hash || !["https:","http:"].includes(url.protocol)) throw new MandateError("INVALID_RESOURCE_URL");
  // GET bodies and fragments are not sent. Reject instead of hashing something absent from HTTP.
  if (input.method === "GET" && input.body !== null) throw new MandateError("GET_BODY_UNSUPPORTED");
  if (!["GET","POST"].includes(input.method)) throw new MandateError("METHOD_UNSUPPORTED");
  return keccak256(toHex(canonicalJson({schemaVersion:2,method:input.method,url:url.href,body:input.body})));
}
