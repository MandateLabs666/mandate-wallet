import {MandateError} from "./model.js";
// Only application-owned codes are printable; parser/RPC messages can contain secrets.
export function diagnosticCode(error:unknown,fallback:string){
  return error instanceof MandateError&&/^[A-Z][A-Z0-9_]{1,95}$/.test(error.code)?error.code:fallback;
}
