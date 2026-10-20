import {readFileSync,statSync,writeFileSync} from "node:fs";
import {loadGateway,MandateWorkspace,type VerificationProfile} from "../sdk/index.js";
import type {Hex} from "viem";
const args=process.argv.slice(2);
if(args.length!==6)throw new Error("USAGE: GATEWAY.json CONNECTION.json VERIFICATION.json TASK_ID SERVICE_ID OUTPUT.json");
if((statSync(args[1]).mode&0o077)!==0)throw new Error("CREDENTIAL_FILE_PERMISSIONS");
const token=JSON.parse(readFileSync(args[1],"utf8")).connectionToken,runtime=await loadGateway(args[0],token);
try{
  const profile=JSON.parse(readFileSync(args[2],"utf8")) as VerificationProfile,workspace=await MandateWorkspace.create(runtime.tools,profile),task=args[3] as Hex,service=args[4] as Hex;
  const quote=await workspace.quote(task,service),purchase=await workspace.call(task,service),state=await workspace.snapshot(task);
  writeFileSync(args[5],JSON.stringify({quote,purchase,state},(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n",{mode:0o600});
}finally{runtime.close();}
