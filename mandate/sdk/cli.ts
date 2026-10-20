import {readFileSync,writeFileSync,statSync} from "node:fs";
import {loadGateway,MandateWorkspace,independentlyVerify,MandateError} from "./index.js";
import type {Hex} from "viem";
import {diagnosticCode} from "./diagnostics.js";
process.umask(0o077);
async function main(){
const args=process.argv.slice(2),command=args.shift(),input:Record<string,string>={};
while(args.length){const flag=args.shift(),value=args.shift();if(!flag?.startsWith("--")||value===undefined||input[flag])throw new Error("CLI_ARGUMENT_INVALID");input[flag]=value;}
const allowed:Record<string,string[]>={context:[],search:["--query"],quote:["--service"],call:["--service"],reconcile:[],receipt:["--service","--output"],evidence:["--service","--output","--disclose-request","--disclose-result"],verify:["--service","--output","--disclose-request","--disclose-result"],"owner-create":["--description","--budget","--max","--ttl"],"owner-action":["--input"],"owner-reconcile":["--request"],"owner-broadcast":["--request","--hash"]};
if(!command||!Object.hasOwn(allowed,command))throw new Error("CLI_COMMAND_UNSUPPORTED");
if(Object.keys(input).some(k=>!["--config","--credential-file","--verification-file","--task","--output",...allowed[command]].includes(k)))throw new Error("CLI_ARGUMENT_UNSUPPORTED");
if(!input["--config"]||!input["--credential-file"])throw new Error("Provide --config and --credential-file. CLI never loads an owner key.");
if((statSync(input["--credential-file"]).mode&0o077)!==0)throw new MandateError("CREDENTIAL_FILE_PERMISSIONS");
const credential=JSON.parse(readFileSync(input["--credential-file"],"utf8")).connectionToken,runtime=await loadGateway(input["--config"],credential);
try{
  const workspace=await MandateWorkspace.create(runtime.tools,input["--verification-file"]?JSON.parse(readFileSync(input["--verification-file"],"utf8")):undefined),id=(input["--task"]??runtime.config.mandateId) as Hex,service=input["--service"] as Hex;
  const disclosure={request:input["--disclose-request"]==="true",result:input["--disclose-result"]==="true"};let result:unknown;
  switch(command){
    case "context":case "reconcile":result=await workspace.snapshot(id);break;
    case "search":result=await workspace.search(id,input["--query"]??"statistics");break;
    case "quote":result=await workspace.quote(id,service);break;
    case "call":result=await workspace.call(id,service);break;
    case "receipt":result=await workspace.receipt(id,service);break;
    case "evidence":result=await workspace.evidence(id,service,disclosure);break;
    case "verify":result=await independentlyVerify(await workspace.evidence(id,service,disclosure),await workspace.evidenceTrust(id,service));break;
    case "owner-create":result=await workspace.draftCreate({description:input["--description"],budgetAtomic:input["--budget"],maxPerPaymentAtomic:input["--max"],ttlSeconds:Number(input["--ttl"])});break;
    case "owner-action":result=await workspace.draftAction(JSON.parse(readFileSync(input["--input"],"utf8")));break;
    case "owner-reconcile":result=await workspace.ownerRequest(input["--request"] as Hex);break;
    case "owner-broadcast":result=await workspace.noteOwnerBroadcast(input["--request"] as Hex,input["--hash"] as Hex);break;
  }
  const text=JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n";
  if(input["--output"])writeFileSync(input["--output"],text,{mode:0o600});else process.stdout.write(text);
}finally{runtime.close();}
}
await main().catch(error=>{process.stderr.write(JSON.stringify({code:diagnosticCode(error,"SDK_COMMAND_REJECTED")})+"\n");process.exitCode=1;});
