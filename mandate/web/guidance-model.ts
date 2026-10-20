import {presentPurchase,type PurchaseView} from "./purchase-presentation.js";

type NumberLike=string|bigint;
export type GuideSnapshot={
  observedAt:NumberLike;owner:string;task:{id:string;description:string};
  context:{chainId:number;wallet:string;walletBalanceAtomic?:string;policy:{exists:boolean;revoked:boolean;paused:boolean;version:NumberLike;expiresAt:NumberLike};grant:{exists:boolean;revoked:boolean;policyVersion:NumberLike;expiresAt:NumberLike}};
  state:{records:(PurchaseView&{stepId:string})[]};services:{serviceId:string;stepId:string;url?:string}[];
  ownerRequests?:{requestId:string;status:string;actionApplied:boolean}[];
};
export type GuideContext={snapshot?:GuideSnapshot;ownerConnected:boolean;localDemo:boolean;fixturePreview?:boolean;connectionEpoch?:number;reviewOpen?:boolean;ownerBusy?:boolean;purchaseBusy?:boolean;activeService?:string;quotedService?:string;verification?:{taskId:string;serviceId:string;overall:string;requiredChecksPassed:boolean}};
export type GuideTarget={page?:"overview"|"mandates"|"services"|"payments"|"evidence";element?:string;action?:string;id?:string};
export type GuideModel={id:string;title:string;detail:string;label:string;target:GuideTarget;stage:number;state:"ready"|"attention"|"waiting";blockers:string[];steps:{label:string;done:boolean}[];task:string};

export function workspaceStatus(snapshot:GuideSnapshot){
  const p=snapshot.context.policy,g=snapshot.context.grant,now=BigInt(snapshot.observedAt);
  return !p.exists?"Draft":p.revoked?"Revoked":p.paused?"Paused":now>=BigInt(p.expiresAt)?"Expired":!g.exists?"Awaiting session grant":g.revoked?"Session revoked":String(g.policyVersion)!==String(p.version)?"Session stale":now>=BigInt(g.expiresAt)?"Session expired":"Active";
}

// Presentation only: use the same purchase decisions as the business controls.
// A guide click never changes authority, submits a transaction or marks progress.
export function resolveWorkspaceGuide(c:GuideContext):GuideModel{
  const s=c.snapshot,service=s?.services.find(x=>x.serviceId===c.activeService)??s?.services[0],records=(s?.state.records??[]).filter(r=>r.stepId===service?.stepId),valid=records.some(r=>r.paymentState==="paid"&&r.serviceState==="returned"&&r.resultState==="valid"),verified=Boolean(s&&service&&c.verification?.taskId===s.task.id&&c.verification.serviceId===service.serviceId&&c.verification.requiredChecksPassed);
  const steps=[{label:"Connect",done:Boolean(s)},{label:"Authorize",done:Boolean(s&&workspaceStatus(s)==="Active")},{label:"Run step",done:valid},{label:"Inspect",done:verified}];
  const model=(id:string,title:string,detail:string,label:string,target:GuideTarget,stage:number,state:GuideModel["state"]="ready",blockers:string[]=[]):GuideModel=>({id,title,detail,label,target,stage,state,blockers,steps,task:s?.task.description??"Your first mandate"});
  if(!s)return model("connect","Start with one complete task.","Follow the software setup, owner approval and MCP connection steps. Then have Codex or Claude Code purchase the approved data, recover its original order and write a brief.","Locate the introduction",{element:"start-walkthrough"},0);
  if(c.reviewOpen)return model("review",c.ownerBusy?"Your wallet is handling this request.":"Review before you approve.",c.ownerBusy?"Keep this request and its transaction identity. A submitted request must be reconciled before another signature is attempted.":"Check the task, budget, recipient scope and expiry in the signing summary. Only your wallet can approve this permission.",c.ownerBusy?"Locate reconciliation":c.ownerConnected?"Locate signing summary":"Locate owner connection",{element:c.ownerBusy?"recover-owner":c.ownerConnected?"review":"connect-review-owner"},1,c.ownerBusy?"waiting":"ready");
  const pending=s.ownerRequests?.find(r=>["signed","broadcast","pending"].includes(r.status));
  if(pending)return model("owner-pending","Reconcile the existing request.","An owner transaction has an unresolved outcome. Inspect that request instead of preparing a replacement signature.","Locate original request",{page:"mandates",action:"review-request",id:pending.requestId},1,"waiting");
  if(c.purchaseBusy)return model("purchase-pending","Checking the original step.","The existing order is being processed. Payment, service delivery and result checks will update separately.","Locate purchase status",{page:"services"},2,"waiting");
  // Recovery of a paid order remains possible after expiry or revocation.
  const unresolved=records.find(r=>r.paymentState==="paid"&&r.serviceState!=="returned"||["registering","reserved","pending","consumed_unknown","canceled","released"].includes(r.paymentState));
  if(unresolved){const v=presentPurchase(unresolved,s),service=s.services.find(x=>x.stepId===unresolved.stepId);return model("recover",unresolved.paymentState==="paid"?"Paid. Let’s recover delivery.":"Resolve the original payment.",v.text,v.action==="run"?"Locate original order":v.label,{page:v.action==="run"?"services":v.action,action:v.action==="run"&&service?"run":undefined,id:service?.serviceId},2,"attention");}
  const invalid=records.find(r=>r.paymentState==="paid"&&r.serviceState==="returned"&&r.resultState!=="valid");
  if(invalid)return model("result","The response needs inspection.",presentPurchase(invalid,s).text,"Locate evidence",{page:"evidence"},3,"attention");
  if(valid){
    if(verified&&(s.context.policy.revoked||s.context.grant.revoked))return model("revoked","Future permission is revoked.","The original paid order and its evidence remain inspectable. No new eligible payment can use this revoked permission; the report’s source and history limits still apply.","Locate retained evidence",{page:"evidence"},3);
    if(verified&&workspaceStatus(s)!=="Active")return model("inactive-complete","The order is checked. Permission is inactive.","Inspect the recorded authorization state and retained evidence. Reconnecting a wallet does not renew expired, paused or stale permission.","Locate permission state",{page:"mandates"},3);
    if(verified)return model("verified",c.verification?.overall==="incomplete"?"Checks passed. Source gaps remain.":"Your evidence report is ready.",c.fixturePreview?"This preset test account has no owner signer in the browser. Use the walkthrough to explore approval and revocation, or connect your own workspace for owner actions.":c.verification?.overall==="incomplete"?"The report passed its financial and record checks, but reports missing source or history guarantees. Inspect those limits before deciding whether to revoke the remaining session.":"Inspect the report’s individual guarantees. You can review or revoke the remaining session in Mandates.",c.fixturePreview?"Locate demo options":"Locate remaining permission",c.fixturePreview?{page:"mandates",element:"fixture-walkthrough"}:{page:"mandates",action:"revokeSession"},3,"ready");
    return model("evidence","Now inspect what happened.","This order’s payment, delivery and result check are recorded. Run its independent checks; this does not complete every other approved step or prove every source.","Locate independent checks",{page:"evidence",action:"check-evidence",id:service?.serviceId},3);
  }
  const state=workspaceStatus(s),record=service?records.find(r=>r.stepId===service.stepId):undefined,v=presentPurchase(record,s);
  if(v.action!=="run"){
    if(v.action!=="mandates")return model("authorization","Inspect the recorded outcome.",v.text,v.label,{page:v.action},1,"attention",[state]);
    if(c.fixturePreview)return model("fixture-permission","This test task cannot approve new permission.","The preset local task uses a test owner. Its expired or inactive permission cannot be renewed by connecting your personal wallet. Watch the complete walkthrough, or connect a Gateway and owner wallet that you control.","Locate demo options",{page:"mandates",element:"fixture-walkthrough"},1,"attention",[state]);
    const action=state==="Draft"||state==="Revoked"?"new":state==="Paused"?"pause":state==="Expired"?"replace":"grant";
    const label=action==="new"?"Locate new task":action==="pause"?"Locate unpause action":action==="replace"?"Locate policy renewal":"Locate session grant";
    return model("authorization","Your permission needs attention.",v.text,label,{page:"mandates",action},1,"attention",[state]);
  }
  if(record?.errorCode)return model("purchase-attention",record.errorCode==="WALLET_CASH_INSUFFICIENT"?"Budget and cash are different.":"Check the recorded issue.",v.text,v.action==="run"?"Locate the same step":v.label,{page:"services",action:service?"run":undefined,id:service?.serviceId},2,"attention");
  if(!service)return model("scope","No approved service is configured.","Directory results cannot expand the mandate. An owner or administrator must configure a service within the approved scope.","Locate mandate",{page:"mandates"},1,"attention");
  if(!c.quotedService||c.quotedService!==service.serviceId)return model("quote","Find out what the service costs.","This task already has an active finite session. Fetch the latest quote for an approved service before running its step.","Locate latest quote",{page:"services",action:"quote",id:service.serviceId},2);
  return model("run","Ready for the approved step.","A quote has been fetched for this task. The purchase flow checks the current terms, cash and authorization again before payment.","Locate run action",{page:"services",action:"run",id:service.serviceId},2);
}
