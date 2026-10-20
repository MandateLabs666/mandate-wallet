import {z} from "zod";
import {isAddressEqual,keccak256,type Address,type Hex} from "viem";
import {MandateError} from "./model.js";
import {accountAbi} from "./accountAbi.js";
import type {MandateReader} from "./reader.js";
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address);
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v as Hex);
const rpc=z.string().url().max(4096).refine(value=>{const u=new URL(value);return !u.username&&!u.password&&!u.hash&&(u.protocol==="https:"||(u.protocol==="http:"&&u.hostname==="127.0.0.1"));});
export const VerificationProfileSchema=z.object({schemaVersion:z.literal(1),chainId:z.number().int().positive().safe(),wallet:address,asset:address,owner:address,walletRuntimeHash:hash,rpcs:z.array(rpc).min(1).max(2),disclosurePolicy:z.object({request:z.boolean(),result:z.boolean()}).strict().default({request:false,result:false})}).strict();
export type VerificationProfile=z.infer<typeof VerificationProfileSchema>;
export async function checkVerificationProfile(reader:MandateReader,input:unknown){
  const p=VerificationProfileSchema.parse(input),[owner,code]=await Promise.all([reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"owner"}),reader.pc.getCode({address:reader.wallet})]);
  if(p.chainId!==reader.chainId||!isAddressEqual(p.wallet,reader.wallet)||!isAddressEqual(p.asset,reader.tokenDomain.verifyingContract)||!isAddressEqual(p.owner,owner)||!code||keccak256(code)!==p.walletRuntimeHash)throw new MandateError("VERIFICATION_PROFILE_CONTEXT_MISMATCH");return p;
}
