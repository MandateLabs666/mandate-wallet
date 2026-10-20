import {hashTypedData,keccak256,toHex,type Hex} from "viem";
import type {AgentContext,ApprovedService} from "../services/client.js";
import type {PurchaseRecord} from "../services/store.js";
import type {fetchQuote} from "../services/quote.js";
import {MandateReader} from "../sdk/reader.js";
import {encodePayment,canonicalJson,registrationTypedData,paymentTypedData,MandateError,type Payment} from "../sdk/model.js";
import {EvidenceJournal} from "./journal.js";
import type {EvidenceScope} from "./checkpoint.js";
import type {ControllerClient} from "./controller-http.js";
type Quote=Awaited<ReturnType<typeof fetchQuote>>;
export class PurchaseEvidenceRecorder {
  constructor(readonly journal:EvidenceJournal,readonly reader:MandateReader,readonly context:AgentContext,readonly controller?:ControllerClient){}
  scope(p:Payment):EvidenceScope{return {chainId:this.reader.chainId,wallet:this.reader.wallet,mandateId:p.mandateId,sessionId:p.sessionId,policyVersion:String(p.policyVersion),sessionEpoch:String(p.sessionEpoch),signer:this.context.signer.address};}
  async rejected(record:PurchaseRecord){
    const budget=await this.reader.readBudget(this.context.mandateId,this.context.sessionId),scope:EvidenceScope={chainId:this.reader.chainId,wallet:this.reader.wallet,mandateId:this.context.mandateId,sessionId:this.context.sessionId,policyVersion:String(budget.policy.version),sessionEpoch:String(budget.session.epoch),signer:this.context.signer.address};
    const fields={paymentState:record.paymentState,serviceState:record.serviceState,resultState:record.resultState,errorCode:record.errorCode??null};
    return this.journal.append(this.context.signer,scope,record.stepId,"decision","rejection:"+record.key+":"+keccak256(toHex(canonicalJson(fields))),fields);
  }
  async pre(record:PurchaseRecord,p:Payment,quote:Quote,service:ApprovedService){
    const budget=await this.reader.readBudget(p.mandateId,p.sessionId);
    if(budget.policy.version!==p.policyVersion||budget.session.epoch!==p.sessionEpoch||budget.session.revoked||budget.policy.revoked||budget.policy.paused)throw new MandateError("EVIDENCE_AUTHORITY_CHANGED");
    const registrationDigest=hashTypedData(registrationTypedData(this.reader.chainId,this.reader.wallet,p));
    const paymentDigest=hashTypedData(paymentTypedData(this.reader.tokenDomain,this.reader.wallet,p));
    const existing=await this.journal.find(this.scope(p),"pre:"+record.key);
    if(existing){
      const payment=existing.leaves.find(l=>l.name==="payment")?.value;if(canonicalJson(payment)!==canonicalJson(encodePayment(p)))throw new MandateError("CHECKPOINT_PAYMENT_FROZEN");
      if(this.controller)await this.controller.anchor(existing.checkpoint);
      const actionProof=await this.journal.action(this.context.signer,"pre:"+record.key,{schemaVersion:2,...this.scope(p),stepId:p.stepId,checkpointRoot:existing.checkpoint.root,registrationDigest,paymentDigest});return {checkpointRoot:existing.checkpoint.root,actionProof};
    }
    const fields={request:{method:service.method,url:service.url,body:service.body??null},requestHash:p.requestHash,requirements:quote.requirements,offer:quote.standardOffer??null,internalQuoteSignature:quote.merchantSignature??null,payment:encodePayment(p),tokenDomain:this.reader.tokenDomain,registrationDigest,paymentDigest,authority:JSON.parse(JSON.stringify(budget,(_,v)=>typeof v==="bigint"?v.toString():v))};
    const checkpoint=await this.journal.append(this.context.signer,this.scope(p),p.stepId,"pre-payment","pre:"+record.key,fields);
    if(this.controller)await this.controller.anchor(checkpoint);
    const actionProof=await this.journal.action(this.context.signer,"pre:"+record.key,{schemaVersion:2,...this.scope(p),stepId:p.stepId,checkpointRoot:checkpoint.root,registrationDigest,paymentDigest});
    return {checkpointRoot:checkpoint.root,actionProof};
  }
  async registered(record:PurchaseRecord,p:Payment){
    if(!record.registrationHash||!record.registrationBlock)throw new MandateError("EVIDENCE_REGISTRATION_MISSING");
    const checkpoint=await this.journal.append(this.context.signer,this.scope(p),p.stepId,"registration","registration:"+record.registrationHash+":"+record.registrationBlockHash,{preCheckpointRoot:record.preCheckpointRoot??null,registrationHash:record.registrationHash,registrationBlock:record.registrationBlock,registrationBlockHash:record.registrationBlockHash??null,payment:encodePayment(p)});if(this.controller)await this.controller.anchor(checkpoint);return checkpoint;
  }
  async outcome(record:PurchaseRecord,p:Payment,httpStatus?:number){
    if(record.paymentState==="paid"&&record.settlementHash&&record.settlementBlockHash){const checkpoint=await this.journal.append(this.context.signer,this.scope(p),p.stepId,"payment","payment:"+record.settlementHash+":"+record.settlementBlockHash,{settlementHash:record.settlementHash,settlementBlockHash:record.settlementBlockHash,payment:encodePayment(p),state:record.paymentState});if(this.controller)await this.controller.anchor(checkpoint);}
    const resultDigest=record.result===undefined?null:keccak256(toHex(canonicalJson(record.result)));
    const fields={paymentState:record.paymentState,serviceState:record.serviceState,resultState:record.resultState,httpStatus:httpStatus??null,resultDigest,result:record.result??null,merchantReceipt:record.merchantReceipt??null,receiptEvidence:record.receiptEvidence??null,errorCode:record.errorCode??null};
    // Identical delivery fields after a reorg are a new observation: the old
    // service checkpoint precedes the newly canonical registration/payment.
    // Keep that old prefix and append once for this exact chain context.
    const eventContext={fields,registrationBlockHash:record.registrationBlockHash??null,settlementBlockHash:record.settlementBlockHash??null};
    const checkpoint=await this.journal.append(this.context.signer,this.scope(p),p.stepId,httpStatus===undefined?"decision":"service","outcome:"+record.key+":"+keccak256(toHex(canonicalJson(eventContext))),fields);if(this.controller)await this.controller.anchor(checkpoint);return checkpoint;
  }
}
