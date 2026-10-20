import {z} from "zod";
import {hashTypedData,recoverTypedDataAddress,isAddressEqual,type LocalAccount,type Address} from "viem";
import {HashSchema,verifyDisclosures,type Disclosure} from "./merkle.js";
import {MandateError} from "../sdk/model.js";
const uint=z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v=>BigInt(v)<2n**64n),address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address);
export const kinds=["pre-payment","registration","payment","service","decision"] as const;
export const CheckpointHeaderSchema=z.object({schemaVersion:z.literal(2),chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),wallet:address,mandateId:HashSchema,sessionId:HashSchema,policyVersion:uint,sessionEpoch:uint,stepId:HashSchema,sequence:uint,kind:z.enum(kinds),previousRoot:HashSchema,merkleRoot:HashSchema,leafCount:z.number().int().min(1).max(256),observedAt:uint,signer:address}).strict();
export const CheckpointSchema=z.object({header:CheckpointHeaderSchema,root:HashSchema,signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(v=>v as `0x${string}`)}).strict();
export type CheckpointHeader=z.infer<typeof CheckpointHeaderSchema>;
export type Checkpoint=z.infer<typeof CheckpointSchema>;
export const EvidenceScopeSchema=CheckpointHeaderSchema.pick({chainId:true,wallet:true,mandateId:true,sessionId:true,policyVersion:true,sessionEpoch:true,signer:true});
export type EvidenceScope=z.infer<typeof EvidenceScopeSchema>;
export function evidenceScopeKey(input:EvidenceScope){const {chainId,wallet,mandateId,sessionId,policyVersion,sessionEpoch,signer}=input;const s=EvidenceScopeSchema.parse({chainId,wallet,mandateId,sessionId,policyVersion,sessionEpoch,signer});return [s.chainId,s.wallet.toLowerCase(),s.mandateId,s.sessionId,s.policyVersion,s.sessionEpoch,s.signer.toLowerCase()].join(":");}
export const ZERO_ROOT="0x"+"00".repeat(32) as `0x${string}`;
const checkpointTypes={SessionAttestation:[{name:"schemaVersion",type:"uint256"},{name:"mandateId",type:"bytes32"},{name:"sessionId",type:"bytes32"},{name:"policyVersion",type:"uint64"},{name:"sessionEpoch",type:"uint64"},{name:"stepId",type:"bytes32"},{name:"sequence",type:"uint64"},{name:"kind",type:"uint8"},{name:"previousRoot",type:"bytes32"},{name:"merkleRoot",type:"bytes32"},{name:"leafCount",type:"uint256"},{name:"observedAt",type:"uint64"},{name:"signer",type:"address"}]} as const;
export function checkpointData(input:unknown){const h=CheckpointHeaderSchema.parse(input);return {domain:{name:"MandateSessionEvidence",version:"2",chainId:h.chainId,verifyingContract:h.wallet},types:checkpointTypes,primaryType:"SessionAttestation" as const,message:{schemaVersion:2n,mandateId:h.mandateId,sessionId:h.sessionId,policyVersion:BigInt(h.policyVersion),sessionEpoch:BigInt(h.sessionEpoch),stepId:h.stepId,sequence:BigInt(h.sequence),kind:kinds.indexOf(h.kind),previousRoot:h.previousRoot,merkleRoot:h.merkleRoot,leafCount:BigInt(h.leafCount),observedAt:BigInt(h.observedAt),signer:h.signer}};}
export async function signCheckpoint(signer:Pick<LocalAccount,"address"|"signTypedData">,input:CheckpointHeader):Promise<Checkpoint>{
  const header=CheckpointHeaderSchema.parse(input);if(!isAddressEqual(header.signer,signer.address))throw new MandateError("CHECKPOINT_SIGNER_MISMATCH");
  const data=checkpointData(header);return {header,root:hashTypedData(data),signature:await signer.signTypedData(data)};
}
export async function verifyCheckpoint(input:unknown,expectedSigner:Address){
  const p=CheckpointSchema.parse(input),data=checkpointData(p.header);
  if(p.root.toLowerCase()!==hashTypedData(data).toLowerCase())throw new MandateError("CHECKPOINT_ROOT_MISMATCH");
  const signer=await recoverTypedDataAddress({...data,signature:p.signature});
  if(!isAddressEqual(signer,expectedSigner)||!isAddressEqual(signer,p.header.signer))throw new MandateError("CHECKPOINT_SIGNER_MISMATCH");
  return p;
}
export async function verifyCheckpointChain(inputs:unknown[],expected:{chainId:number;wallet:Address;mandateId:`0x${string}`;sessionId:`0x${string}`;signer:Address}){
  if(inputs.length<1||inputs.length>10000)throw new MandateError("CHECKPOINT_COUNT_INVALID");
  const checkpoints:Checkpoint[]=[];let previousRoot=ZERO_ROOT,lastTime=0n;
  for(let i=0;i<inputs.length;i++){
    const p=await verifyCheckpoint(inputs[i],expected.signer),h=p.header;
    if(h.chainId!==expected.chainId||!isAddressEqual(h.wallet,expected.wallet)||h.mandateId.toLowerCase()!==expected.mandateId.toLowerCase()||h.sessionId.toLowerCase()!==expected.sessionId.toLowerCase())throw new MandateError("CHECKPOINT_CONTEXT_MISMATCH");
    if(h.sequence!==String(i)||h.previousRoot!==previousRoot||BigInt(h.observedAt)<lastTime)throw new MandateError("CHECKPOINT_HISTORY_INVALID");
    if(i>0&&(h.policyVersion!==checkpoints[0].header.policyVersion||h.sessionEpoch!==checkpoints[0].header.sessionEpoch))throw new MandateError("CHECKPOINT_EPOCH_CHANGED");
    lastTime=BigInt(h.observedAt);previousRoot=p.root;checkpoints.push(p);
  }
  return checkpoints;
}
export function disclosedCheckpoint(checkpoint:Checkpoint,proofs:Disclosure[]){return verifyDisclosures(checkpoint.header.merkleRoot,proofs,checkpoint.header.leafCount);}
