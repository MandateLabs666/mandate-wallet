import {z} from "zod";
import {hashTypedData,recoverTypedDataAddress,isAddressEqual,type LocalAccount,type Address} from "viem";
import {EvidenceScopeSchema,type EvidenceScope} from "./checkpoint.js";
import {HashSchema} from "./merkle.js";
import {MandateError} from "../sdk/model.js";
export const ActionProofSchema=EvidenceScopeSchema.extend({schemaVersion:z.literal(2),stepId:HashSchema,checkpointRoot:HashSchema,registrationDigest:HashSchema,paymentDigest:HashSchema,signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(v=>v as `0x${string}`)}).strict();
export type ActionProof=z.infer<typeof ActionProofSchema>;
export type UnsignedActionProof=Omit<ActionProof,"signature">;
const types={ActionProof:[{name:"schemaVersion",type:"uint256"},{name:"mandateId",type:"bytes32"},{name:"sessionId",type:"bytes32"},{name:"policyVersion",type:"uint64"},{name:"sessionEpoch",type:"uint64"},{name:"stepId",type:"bytes32"},{name:"checkpointRoot",type:"bytes32"},{name:"registrationDigest",type:"bytes32"},{name:"paymentDigest",type:"bytes32"},{name:"signer",type:"address"}]} as const;
export function actionProofData(p:UnsignedActionProof){return {domain:{name:"MandateActionEvidence",version:"2",chainId:p.chainId,verifyingContract:p.wallet},types,primaryType:"ActionProof" as const,message:{schemaVersion:2n,mandateId:p.mandateId,sessionId:p.sessionId,policyVersion:BigInt(p.policyVersion),sessionEpoch:BigInt(p.sessionEpoch),stepId:p.stepId,checkpointRoot:p.checkpointRoot,registrationDigest:p.registrationDigest,paymentDigest:p.paymentDigest,signer:p.signer}};}
export async function signActionProof(signer:Pick<LocalAccount,"address"|"signTypedData">,p:UnsignedActionProof):Promise<ActionProof>{
  const checked=ActionProofSchema.omit({signature:true}).parse(p);if(!isAddressEqual(signer.address,checked.signer))throw new MandateError("ACTION_PROOF_SIGNER_MISMATCH");
  return {...checked,signature:await signer.signTypedData(actionProofData(checked))};
}
export async function verifyActionProof(input:unknown,expected:EvidenceScope){
  const p=ActionProofSchema.parse(input);
  if(p.chainId!==expected.chainId||!isAddressEqual(p.wallet,expected.wallet)||p.mandateId!==expected.mandateId||p.sessionId!==expected.sessionId||p.policyVersion!==expected.policyVersion||p.sessionEpoch!==expected.sessionEpoch||!isAddressEqual(p.signer,expected.signer))throw new MandateError("ACTION_PROOF_CONTEXT_MISMATCH");
  const recovered=await recoverTypedDataAddress({...actionProofData(p),signature:p.signature});if(!isAddressEqual(recovered,expected.signer as Address))throw new MandateError("ACTION_PROOF_SIGNER_MISMATCH");
  return {proof:p,digest:hashTypedData(actionProofData(p))};
}
