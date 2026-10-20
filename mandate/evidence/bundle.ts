import {z} from "zod";
import {keccak256,toHex,type Address} from "viem";
import {HashSchema,DisclosureSchema} from "./merkle.js";
import {CheckpointSchema,EvidenceScopeSchema} from "./checkpoint.js";
import {ActionProofSchema} from "./action-proof.js";
import {PaymentSchema,encodePayment,decodePayment,canonicalJson,type Payment} from "../sdk/model.js";
import type {PurchaseRecord} from "../services/store.js";
import type {PurchaseEvidenceRecorder} from "./recorder.js";
import {stageFields} from "./stage-fields.js";
import type {EvidenceJournal} from "./journal.js";
import type {EvidenceScope} from "./checkpoint.js";
import type {MandateReader} from "../sdk/reader.js";
import {MandateError} from "../sdk/model.js";
import {ControllerStatementSchema,EnvelopeSchema} from "./controller-model.js";
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address),uint=z.string().regex(/^(0|[1-9][0-9]*)$/);
const publicPayment=z.record(z.string()).transform((value,context)=>{try{return decodePayment(value);}catch{context.addIssue({code:z.ZodIssueCode.custom,message:"Invalid versioned payment"});return z.NEVER;}});
export const EvidenceBundleSchema=z.object({schemaVersion:z.literal(2),scope:EvidenceScopeSchema,asset:address,tokenDomain:z.object({name:z.string().min(1).max(100),version:z.string().min(1).max(20),chainId:z.number().int().positive(),verifyingContract:address}).strict(),payment:publicPayment,actionProof:ActionProofSchema,checkpoints:z.array(z.object({checkpoint:CheckpointSchema,disclosures:z.array(DisclosureSchema).max(256)}).strict()).min(1).max(10000),externalAnchors:z.array(z.object({checkpoint:CheckpointSchema,statement:ControllerStatementSchema}).strict()).max(10000).optional(),record:z.object({registrationHash:HashSchema,settlementHash:HashSchema.optional(),paymentState:z.string().max(32),serviceState:z.string().max(32),resultState:z.string().max(32),resultDigest:HashSchema.optional()}).strict()}).strict();
export const VerifierTrustSchema=z.object({schemaVersion:z.literal(2),chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),wallet:address,asset:address,walletRuntimeHash:HashSchema,owner:address,mandateId:HashSchema,sessionId:HashSchema,sessionSigner:address,merchantId:HashSchema,merchantSigner:address,payTo:address,resourceUrl:z.string().url().max(4096),requestHash:HashSchema,rootBudgetAtomic:uint,maxPerPaymentAtomic:uint,startBlock:uint,rpcs:z.array(z.string().url().max(4096)).min(1).max(2),confirmations:z.number().int().min(1).max(64),resultChecker:z.enum(["ETH-stats-v2","BTC-stats-v2","digest-only"]),controllerSigner:address.optional(),controllerEnvelope:EnvelopeSchema.optional(),controllerSnapshot:z.object({lastSequence:uint,lastRoot:HashSchema}).strict().optional()}).strict();
export type VerifierTrust=z.infer<typeof VerifierTrustSchema>;
export type EvidenceBundle=z.output<typeof EvidenceBundleSchema>;
// Disclosure choices are trusted user/administrator input, never an MCP argument.
export async function exportPurchaseBundle(recorder:PurchaseEvidenceRecorder,record:PurchaseRecord,p:Payment,options:{discloseRequest?:boolean;discloseResult?:boolean}={}){
  return exportRecordedBundle(recorder.journal,recorder.reader,recorder.scope(p),record,p,options);
}
// Export original signer/session evidence after a later session has been selected.
// The caller pins scope from the recorded payment and the owner-authorized chain grant.
export async function exportRecordedBundle(journal:EvidenceJournal,reader:MandateReader,scope:EvidenceScope,record:PurchaseRecord,p:Payment,options:{discloseRequest?:boolean;discloseResult?:boolean;discloseOnlyStep?:`0x${string}`}={}){
  if(scope.chainId!==reader.chainId||scope.wallet.toLowerCase()!==reader.wallet.toLowerCase()||scope.mandateId!==p.mandateId||scope.sessionId!==p.sessionId||scope.policyVersion!==String(p.policyVersion)||scope.sessionEpoch!==String(p.sessionEpoch))throw new MandateError("EXPORT_SCOPE_MISMATCH");
  const names={...stageFields,"pre-payment":stageFields["pre-payment"].filter(n=>n!=="request"||options.discloseRequest),service:stageFields.service.filter(n=>!["result","resultDigest"].includes(n)||options.discloseResult),decision:stageFields.decision.filter(n=>!["result","resultDigest"].includes(n)||options.discloseResult)};
  if(!record.actionProof||!record.registrationHash)throw new Error("PREPAYMENT_EVIDENCE_OR_REGISTRATION_MISSING");
  if(options.discloseOnlyStep&&options.discloseOnlyStep!==p.stepId)throw new MandateError("EXPORT_STEP_MISMATCH");
  const checkpoints=await journal.export(scope,names,options.discloseOnlyStep);
  return {schemaVersion:2,scope,asset:reader.tokenDomain.verifyingContract,tokenDomain:reader.tokenDomain,payment:encodePayment(p),actionProof:record.actionProof,checkpoints,record:{registrationHash:record.registrationHash,settlementHash:record.settlementHash,paymentState:record.paymentState,serviceState:record.serviceState,resultState:record.resultState,resultDigest:!options.discloseResult||record.result===undefined?undefined:keccak256(toHex(canonicalJson(record.result)))}};
}
