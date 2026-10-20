import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import type {CallToolResult} from "@modelcontextprotocol/sdk/types.js";
import {GatewayTools,toolSchemas,toolDescriptions,type ToolName} from "./tools.js";
import {MandateError} from "../sdk/model.js";
export function createMandateMcp(tools:GatewayTools) {
  const server=new McpServer({name:"mandate-wallet",version:"2.0.0"});
  for(const name of Object.keys(toolSchemas) as ToolName[]) {
    server.registerTool(name,{description:toolDescriptions[name],inputSchema:toolSchemas[name],annotations:{readOnlyHint:!["mandate_call_service","mandate_request_authorization","mandate_request_revoke"].includes(name),destructiveHint:false,idempotentHint:!["mandate_request_authorization","mandate_request_revoke"].includes(name),openWorldHint:true}},async(input:unknown):Promise<CallToolResult>=>{
      try{const result=await tools.call(name,input);return {content:[{type:"text",text:JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v)}]};}
      catch(error){return {isError:true,content:[{type:"text",text:JSON.stringify({code:error instanceof MandateError?error.code:"TOOL_REQUEST_REJECTED"})}]};}
    });
  }
  return server;
}
export async function serveMandateStdio(tools:GatewayTools){const server=createMandateMcp(tools);await server.connect(new StdioServerTransport());return server;}
