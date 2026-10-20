import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {loadGateway,authenticateCredential} from "../gateway/runtime.js";
import {MandateWorkspace} from "../sdk/workspace.js";
import {serveWorkspace} from "./server.js";
import {diagnosticCode} from "../sdk/diagnostics.js";
process.umask(0o077);
async function main(){
const args=process.argv.slice(2);
if(![4,6].includes(args.length)||args[0]!=="--config"||args[2]!=="--credential-file"||(args.length===6&&args[4]!=="--verification-file"))throw new Error("USAGE: --config private-gateway.json --credential-file private-connection.json [--verification-file public-verification.json]");
if((statSync(args[3]).mode&0o077)!==0)throw new Error("CREDENTIAL_FILE_PERMISSIONS");
const credential=JSON.parse(readFileSync(args[3],"utf8")).connectionToken;
const runtime=await loadGateway(args[1],credential),workspace=await MandateWorkspace.create(runtime.tools,args.length===6?JSON.parse(readFileSync(args[5],"utf8")):undefined);
const server=await serveWorkspace(workspace,{authenticate:token=>{authenticateCredential(runtime.config.credentialSHA256,token);runtime.authorizeConnection();},port:Number(process.env.MANDATE_WEB_PORT??18742),staticDirectory:resolve("mandate/web/dist"),allowedOrigins:[JSON.parse(readFileSync("mandate/web/publication.json","utf8")).expectedOrigin]});
console.log(JSON.stringify({origin:server.origin,ownerKeyLoaded:false,connectionTokenInOutput:false}));
const stop=async()=>{await server.close();runtime.close();};process.once("SIGINT",()=>{void stop();});process.once("SIGTERM",()=>{void stop();});
}
await main().catch(error=>{process.stderr.write(JSON.stringify({code:diagnosticCode(error,"WEB_START_REJECTED")})+"\n");process.exitCode=1;});
