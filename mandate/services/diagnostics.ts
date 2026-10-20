import {MandateError} from "../sdk/model.js";
export type PurchaseFailureStage="reconcile"|"quote"|"registration-signature"|"registration-prepare"|"registration-confirm"|"registration-evidence"|"payment-signature"|"merchant-request"|"result-reconcile";
export type PurchaseFailureDiagnostic={stage:PurchaseFailureStage;observedAt:string;causes:{name:string;code?:number|string;status?:number}[]};
const names=new Set(["HttpRequestError","TimeoutError","WaitForTransactionReceiptTimeoutError","SocketClosedError","WebSocketRequestError","RpcRequestError","TransactionReceiptNotFoundError","TransactionNotFoundError","BlockNotFoundError","ContractFunctionExecutionError","ContractFunctionRevertedError","CallExecutionError","InvalidInputRpcError","LimitExceededRpcError","InternalRpcError"]);
// Error messages, URLs, request bodies and stacks can contain signed payloads or
// credentials. Persist only this fixed vocabulary and numeric protocol codes.
export function purchaseFailureDiagnostic(stage:PurchaseFailureStage,error:unknown):PurchaseFailureDiagnostic {
  const causes:PurchaseFailureDiagnostic["causes"]=[],seen=new Set<unknown>();
  for(let cause:any=error;cause&&typeof cause==="object"&&!seen.has(cause)&&causes.length<6;cause=cause.cause){
    seen.add(cause);
    causes.push({name:cause instanceof MandateError?"MandateError":names.has(cause.name)?cause.name:"Error",
      ...(cause instanceof MandateError&&/^[A-Z0-9_]{1,100}$/.test(cause.code)?{code:cause.code}:typeof cause.code==="number"&&Number.isSafeInteger(cause.code)?{code:cause.code}:{}),
      ...(Number.isInteger(cause.status)&&cause.status>=100&&cause.status<=599?{status:cause.status}:{})});
  }
  return {stage,observedAt:new Date().toISOString(),causes};
}
