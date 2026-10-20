import {it,expect} from "vitest";
import {HttpRequestError} from "viem";
import {purchaseFailureDiagnostic} from "../diagnostics.js";
import {MandateError} from "../../sdk/model.js";
it("records the failing stage and protocol codes without request bodies, signatures, credentials or arbitrary names",()=>{
  const secret="do-not-export-secret",error=new HttpRequestError({url:`https://rpc.invalid/${secret}`,status:429,body:{signature:secret},details:secret});
  const result=purchaseFailureDiagnostic("registration-confirm",error);
  expect(result.causes).toEqual([{name:"HttpRequestError",status:429}]);expect(JSON.stringify(result)).not.toContain(secret);
  expect(purchaseFailureDiagnostic("payment-signature",new MandateError("PAYMENT_AUTHORITY_INACTIVE")).causes).toEqual([{name:"MandateError",code:"PAYMENT_AUTHORITY_INACTIVE"}]);
  const cycle:any={name:secret,message:secret};cycle.cause=cycle;
  expect(purchaseFailureDiagnostic("quote",cycle).causes).toEqual([{name:"Error"}]);
});
