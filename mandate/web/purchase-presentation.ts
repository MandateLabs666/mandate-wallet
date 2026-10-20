// Presentation only. Chain/client checks remain authoritative.
export type PurchaseView={paymentState:string;serviceState:string;resultState:string;errorCode?:string;registrationHash?:string;settlementHash?:string;payment?:{value?:string}};
type Amount=string|bigint;
export type PurchaseContext={observedAt:Amount;context:{policy:{exists:boolean;paused:boolean;revoked:boolean;version:Amount;expiresAt:Amount};grant:{exists:boolean;revoked:boolean;policyVersion:Amount;expiresAt:Amount}}};
type Guidance={text:string;label:string;action:"run"|"mandates"|"evidence"|"payments"};
function authority(view?:PurchaseContext):Guidance|undefined{
  if(!view)return;const p=view.context.policy,g=view.context.grant,now=BigInt(view.observedAt),review=(text:string)=>({text,label:"Review mandate",action:"mandates" as const});
  if(!p.exists)return review("Create an owner-approved mandate and a finite session before running this step.");
  if(p.revoked)return review("This mandate is revoked. Use a new owner-approved mandate; paid history remains recorded.");
  if(p.paused)return review("This mandate is paused. The owner must unpause, restore the policy scope and approve a fresh finite grant.");
  if(now>=BigInt(p.expiresAt))return review("This mandate has expired. The owner must approve a current policy and finite session.");
  if(!g.exists)return review("This task has no session grant. Ask the owner to approve a finite grant for the configured steps.");
  if(g.revoked)return review("This session is revoked. Ask the owner to approve a new finite session; reconnecting a wallet does not restore it.");
  if(String(g.policyVersion)!==String(p.version))return review("The policy version changed and the previous grant is stale. Ask the owner to approve a current finite grant.");
  if(now>=BigInt(g.expiresAt))return review("This session has expired. Ask the owner to approve a new finite grant within the current policy.");
}
export function purchaseErrorMessage(code:string,view?:PurchaseContext):string|undefined{
  if(["AGENT_GRANT_INACTIVE","BUDGET_OR_EXPIRY_APPROVAL_REQUIRED"].includes(code)){const inactive=authority(view);if(inactive)return inactive.text;return "The remaining budget, session scope or expiry does not allow this purchase. Ask the owner to review the mandate.";}
  const messages:Record<string,string>={
    WALLET_CASH_INSUFFICIENT:"Wallet cash is below the quoted amount. Have the owner fund this wallet with the approved USDC on this network, then retry the same step. Increasing the budget does not add funds.",
    QUOTE_OUTSIDE_AUTHORIZATION:"No compatible quote matches the approved network, asset, recipient, EIP-3009 payment path and amount limit. Ask the owner or administrator to review this service; do not bypass the approved scope.",
    QUOTE_CHANGED_APPROVAL_REQUIRED:"Merchant terms changed from the reviewed quote. Ask the owner to review the service scope; existing payment commitments remain frozen.",
    QUOTE_RESOURCE_MISMATCH:"The quoted resource differs from the approved request. Stop and ask the owner to review the service configuration.",
    OWNER_REQUEST_APPROVAL_REQUIRED:"The service request is outside the approved task scope. Ask the owner to review it before any purchase.",
    SERVICE_SCOPE_APPROVAL_REQUIRED:"This service is not configured for the selected task. Select an approved step or request owner review.",
    HTTP_TRANSPORT_UNKNOWN:"The service response is unknown. Reconcile the same step; keep any original payment and occupied budget until chain evidence resolves it.",
    TRANSPORT_OR_CHAIN_UNKNOWN:"The network or chain result is unknown. Reconcile the original step before retrying; do not create a replacement order.",
    TRANSACTION_CONFIRMATION_PENDING:"The original transaction is awaiting canonical confirmation. Reconcile its saved hash; do not sign a replacement transaction.",
    PAYMENT_COMMITMENT_EXPIRED:"The registered payment commitment has expired without settlement. Its terms cannot be extended. Inspect the original record; safe release does not make this step reusable.",
    REGISTRATION_REVERTED:"The registration transaction reverted. Inspect the original receipt and current authorization before trying another owner-approved step.",
  };
  if(messages[code])return messages[code];
  if(["PAYMENT_REQUIREMENTS_SCHEMA_INVALID","PAYMENT_REQUIREMENTS_HEADER_INVALID","EXPECTED_PAYMENT_REQUIRED"].includes(code))return "The merchant did not return supported x402 v2 payment terms. Ask the administrator to check this service's compatibility.";
  if(/^(SIGNED_OFFER_|SIGNED_ARTIFACT_|MERCHANT_QUOTE_)/.test(code))return "The merchant proof cannot be checked against the approved signer or scope. Stop and ask the administrator to review this service.";
}
export function presentPurchase(record:PurchaseView|undefined,view:PurchaseContext):Guidance{
  // Delivery of an already-paid order can still be recovered after authority changes.
  if(record?.paymentState==="paid"){
    if(record.serviceState==="returned"&&record.resultState==="valid")return {text:"Payment is confirmed, the service returned and the result check passed. View evidence for separate source and history limits.",label:"View evidence",action:"evidence"};
    if(record.serviceState==="returned")return {text:"Payment and delivery are recorded, but the result check did not pass. Inspect the evidence; do not buy the same step again.",label:"Inspect evidence",action:"evidence"};
    return {text:"Payment is confirmed but service delivery is not. Recover the same order using its original payment; this is not a new purchase.",label:"Recover same order",action:"run"};
  }
  if(record?.errorCode==="PAYMENT_COMMITMENT_EXPIRED")return {text:purchaseErrorMessage(record.errorCode)!,label:"Inspect payment record",action:"payments"};
  if(record&&["registering","reserved","pending"].includes(record.paymentState))return {text:"The original payment is unresolved. Reconcile the same step and retain its occupied budget; do not create a new order.",label:"Reconcile same step",action:"run"};
  if(record&&["consumed_unknown","canceled","released"].includes(record.paymentState))return {text:record.paymentState==="released"?"The original commitment was released. This step cannot create a replacement payment; review the recorded state.":"The nonce is used or canceled without confirmed payment. Inspect the original evidence and retained occupancy; do not create a replacement payment.",label:"Inspect payment record",action:"payments"};
  const inactive=authority(view);if(inactive)return inactive;
  const help=record?.errorCode?purchaseErrorMessage(record.errorCode,view):undefined;
  if(record?.paymentState==="rejected")return {text:help??"This request was rejected. Review its recorded reason and owner-approved scope before proceeding.",label:"Review mandate",action:"mandates"};
  if(record?.errorCode)return {text:help??"This step is incomplete. Review the original record and reconcile before retrying.",label:"Retry same step",action:"run"};
  return {text:"Run this configured step within its owner-approved scope. A quote does not activate new authority.",label:"Run approved step",action:"run"};
}
