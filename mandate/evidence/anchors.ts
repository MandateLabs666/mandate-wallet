import {verifyCheckpoint,verifyCheckpointChain,type EvidenceScope,type Checkpoint} from "./checkpoint.js";
import {verifyStatement,envelopeHash,verifyEnvelope,type ControllerStatement,type Envelope} from "./controller-model.js";
import {MandateError} from "../sdk/model.js";
import type {Address} from "viem";
export async function verifyExternalAnchors(anchors:{checkpoint:Checkpoint;statement:ControllerStatement}[],checkpoints:Checkpoint[],trusted:{controller:Address;owner:Address;envelope:Envelope;snapshot:{lastSequence:string;lastRoot:string}},scope:EvidenceScope){
  const envelope=await verifyEnvelope(trusted.envelope,trusted.owner,scope),hash=envelopeHash(envelope);
  if(!anchors.length||anchors.length>10000)throw new MandateError("EXTERNAL_ANCHOR_COUNT_INVALID");
  if(!trusted.snapshot||anchors.at(-1)!.checkpoint.header.sequence!==trusted.snapshot.lastSequence||anchors.at(-1)!.checkpoint.root!==trusted.snapshot.lastRoot)throw new MandateError("TRUSTED_ANCHOR_SNAPSHOT_MISMATCH");
  await verifyCheckpointChain(anchors.map(a=>a.checkpoint),scope);
  for(let i=0;i<anchors.length;i++){
    const cp=await verifyCheckpoint(anchors[i].checkpoint,scope.signer),s=await verifyStatement(anchors[i].statement,trusted.controller,scope);
    if(s.envelopeHash!==hash||s.kind!=="anchor"||!["allowed","detected"].includes(s.outcome)||s.details.root!==cp.root||s.details.sequence!==cp.header.sequence||Number(cp.header.sequence)!==i||!envelope.payload.stepIds.includes(cp.header.stepId))throw new MandateError("EXTERNAL_ANCHOR_INVALID");
    const offered=checkpoints.find(c=>c.header.sequence===cp.header.sequence);if(!offered)throw new MandateError("ANCHORED_CHECKPOINT_OMITTED");if(offered.root!==cp.root)throw new MandateError("ANCHORED_CHECKPOINT_REWRITTEN");
  }
  return {count:anchors.length,lastSequence:anchors.at(-1)!.checkpoint.header.sequence,mode:envelope.payload.mode,guarantee:"offered checkpoints match independently retained roots in the trusted snapshot",limits:["Requires honest independent retention and the pinned controller key.","Historical import does not prove that roots were captured before payment.","Unobserved tails and out-of-band model calls are not proven absent."]};
}
