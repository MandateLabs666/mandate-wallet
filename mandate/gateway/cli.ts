import {loadGateway} from "./runtime.js";
import {serveMandateStdio} from "./mcp.js";
import {MandateError} from "../sdk/model.js";
process.umask(0o077);
try {
  if(process.argv.length!==4 || process.argv[2]!=="--config")throw new MandateError("USAGE_CONFIG_REQUIRED");
  const runtime=await loadGateway(process.argv[3],process.env.MANDATE_CONNECTION_TOKEN);
  // The credential authenticates this fixed profile. It never selects an owner or another agent.
  delete process.env.MANDATE_CONNECTION_TOKEN;
  const server=await serveMandateStdio(runtime.tools);let closing=false;
  const close=async()=>{if(closing)return;closing=true;await server.close();runtime.close();};
  process.once("SIGINT",()=>{void close();});process.once("SIGTERM",()=>{void close();});process.stdin.once("end",()=>{void close();});
}catch(error){process.stderr.write(JSON.stringify({code:error instanceof MandateError?error.code:"GATEWAY_START_REJECTED"})+"\n");process.exitCode=1;}
