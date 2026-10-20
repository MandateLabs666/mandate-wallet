import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {spawn} from "node:child_process";
import {EvidenceBundleSchema,VerifierTrustSchema,type VerifierTrust} from "../evidence/bundle.js";
import type {VerificationReport} from "../evidence/verifier.js";
import {MandateError} from "./model.js";
// A separate process gets only public files, PATH and explicitly trusted RPCs.
export async function independentlyVerify(bundle:unknown,trust:VerifierTrust,entry=resolve("dist/mandate-evidence-verifier.js")){
  EvidenceBundleSchema.parse(bundle);VerifierTrustSchema.parse(trust);
  const bytes=JSON.stringify(bundle);if(Buffer.byteLength(bytes)>8*1024*1024)throw new MandateError("EVIDENCE_INPUT_TOO_LARGE");
  const directory=mkdtempSync(join(tmpdir(),"mandate-independent-check-")),input=join(directory,"bundle.json"),config=join(directory,"trust.json"),output=join(directory,"report.json");
  writeFileSync(input,bytes,{mode:0o600});writeFileSync(config,JSON.stringify(trust),{mode:0o600});
  try{
    const exitCode=await new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,[entry,"--bundle",input,"--trust",config,"--output",output],{cwd:directory,env:{PATH:process.env.PATH??""},stdio:["ignore","ignore","ignore"]});const timer=setTimeout(()=>{child.kill("SIGTERM");reject(new MandateError("INDEPENDENT_VERIFIER_TIMEOUT"));},60000);child.once("error",()=>{clearTimeout(timer);reject(new MandateError("INDEPENDENT_VERIFIER_UNAVAILABLE"));});child.once("exit",code=>{clearTimeout(timer);resolve(code??-1);});});
    if(![0,2].includes(exitCode))throw new MandateError("INDEPENDENT_VERIFIER_PROCESS_FAILED");
    const result=readFileSync(output);if(result.length>1024*1024)throw new MandateError("INDEPENDENT_REPORT_TOO_LARGE");
    return {exitCode,report:JSON.parse(result.toString("utf8")) as VerificationReport,privateRuntimeInputs:[] as string[],processSeparate:true,managementIsolation:false};
  }finally{rmSync(directory,{recursive:true,force:true});}
}
