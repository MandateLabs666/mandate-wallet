import {atomicAmount,MandateError} from "./model.js";
export function formatUSDC(input:string|bigint){const value=atomicAmount(input),whole=value/1000000n,fraction=String(value%1000000n).padStart(6,"0").replace(/0+$/,"");return String(whole)+(fraction?"."+fraction:"");}
export function budgetPresentation(policy:{budget:string;occupied:string},records:{paymentState:string;payment?:{value?:string}}[]){
  const budget=atomicAmount(policy.budget),occupied=atomicAmount(policy.occupied);let paid=0n,unresolved=0n;
  for(const r of records){const value=r.payment?.value?atomicAmount(r.payment.value):0n;if(r.paymentState==="paid")paid+=value;else if(["reserved","pending","consumed_unknown","canceled"].includes(r.paymentState))unresolved+=value;}
  if(occupied>budget||paid+unresolved>occupied)throw new MandateError("BUDGET_VIEW_RECONCILIATION_REQUIRED");
  return {budget,occupied,paidKnown:paid,unresolvedKnown:unresolved,otherConservativeOccupied:occupied-paid-unresolved,available:budget-occupied};
}
