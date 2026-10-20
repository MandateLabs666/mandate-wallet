import { z } from "zod";
import { encodeFunctionData, keccak256, toHex, type Address, type Hex } from "viem";
import { accountAbi } from "./accountAbi.js";
import { atomicAmount, canonicalJson, MandateError } from "./model.js";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(x=>x as Hex);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(x=>x as Address);
const amount = z.string().transform(atomicAmount);
const limits = z.object({budget:amount,maxPerPayment:amount,expiresAt:z.number().int().positive().safe().transform(BigInt)}).strict().refine(x=>x.budget>0n && x.maxPerPayment>0n && x.maxPerPayment<=x.budget);
const merchants = z.array(z.object({id:hash,payTo:address,quoteSigner:address}).strict()).min(1).max(32);
const steps = z.array(z.object({id:hash,merchantId:hash,requestHash:hash}).strict()).min(1).max(64);
export const OwnerActionSchema = z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),id:hash,taskHash:hash,limits,merchants,steps}).strict(),
  z.object({action:z.literal("replace"),id:hash,limits,merchants,steps}).strict(),
  z.object({action:z.literal("pause"),id:hash,paused:z.boolean()}).strict(),
  z.object({action:z.literal("revoke"),id:hash}).strict(),
  z.object({action:z.literal("grant"),id:hash,sessionId:hash,signer:address,budget:amount,maxPerPayment:amount,expiresAt:z.number().int().positive().safe().transform(BigInt),steps:z.array(hash).min(1).max(64)}).strict(),
  z.object({action:z.literal("revokeSession"),id:hash,sessionId:hash}).strict(),
  z.object({action:z.literal("withdraw"),to:address,amount}).strict(),
]);
export type OwnerActionInput = z.input<typeof OwnerActionSchema>;
/// Produces an unsigned transaction for a trusted owner wallet. It never signs or broadcasts.
export function draftOwnerAction(chainId:number,owner:Address,wallet:Address,input:OwnerActionInput) {
  if (![31337,11155111,84532].includes(chainId)) throw new MandateError("WRITE_NETWORK_UNSUPPORTED");
  const p=OwnerActionSchema.parse(input); let data: Hex;
  switch(p.action) {
    case "create": data=encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[p.id,p.taskHash,p.limits,p.merchants,p.steps]});break;
    case "replace": data=encodeFunctionData({abi:accountAbi,functionName:"replacePolicy",args:[p.id,p.limits,p.merchants,p.steps]});break;
    case "pause": data=encodeFunctionData({abi:accountAbi,functionName:"setPaused",args:[p.id,p.paused]});break;
    case "revoke": data=encodeFunctionData({abi:accountAbi,functionName:"revokeMandate",args:[p.id]});break;
    case "grant": data=encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[p.id,p.sessionId,p.signer,p.budget,p.maxPerPayment,p.expiresAt,p.steps]});break;
    case "revokeSession": data=encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[p.id,p.sessionId]});break;
    case "withdraw": data=encodeFunctionData({abi:accountAbi,functionName:"ownerWithdraw",args:[p.to,p.amount]});break;
  }
  const transaction={chainId,from:owner,to:wallet,data,value:"0"};
  return {schemaVersion:2,actionId:keccak256(toHex(canonicalJson(transaction))),transaction,action:p.action,approvalRequired:"owner-wallet"};
}
