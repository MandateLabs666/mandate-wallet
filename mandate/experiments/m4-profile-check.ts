import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
const report:{schemaVersion:2;observedAt:string;transport:string;modelHostTested:boolean;profiles:unknown[];submittedPurchases:number}={schemaVersion:2,observedAt:new Date().toISOString(),transport:"actual-stdio-subprocess",modelHostTested:false,profiles:[],submittedPurchases:0};
for(const id of ["agent-a","agent-b"]) {
  const path=resolve(".runtime/m4/"+id+".json"),config=JSON.parse(readFileSync(path,"utf8")),{connectionToken}=JSON.parse(readFileSync(".runtime/m4/credentials/"+id+".json","utf8"));
  const client=new Client({name:"mandate-profile-acceptance",version:"2.0.0"}),transport=new StdioClientTransport({command:process.execPath,args:["--import","tsx",resolve("mandate/gateway/cli.ts"),"--config",path],cwd:process.cwd(),env:{PATH:process.env.PATH??"",MANDATE_CONNECTION_TOKEN:connectionToken},stderr:"pipe"});
  try {
    await client.connect(transport);const list=await client.listTools();
    const invoke=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error("PROFILE_TOOL_REJECTED");return JSON.parse((r.content as {text:string}[])[0].text);};
    const context=await invoke("mandate_get_context",{}),quote=await invoke("mandate_quote_service",{serviceId:config.services[0].serviceId}),task=await invoke("mandate_get_task",{});
    if(context.agentId!==id||context.sessionId!==config.sessionId||context.ownerKeyHeldByGateway!==false||quote.readyForRegistration!==false||quote.requirements.amount!=="10000")throw new Error("PROFILE_SCOPE_MISMATCH");
    const denied=await client.callTool({name:"mandate_get_context",arguments:{wallet:config.wallet}});if(!denied.isError)throw new Error("UNKNOWN_PARAMETER_ACCEPTED");
    report.profiles.push({agentId:id,wallet:context.wallet,sessionId:context.sessionId,toolNames:list.tools.map(t=>t.name),ownerKeyHeldByGateway:false,rootAvailable:context.rootAvailable,grantAvailable:context.grantAvailable,walletBalanceAtomic:context.walletBalanceAtomic,quote:{serviceId:quote.serviceId,amountAtomic:quote.requirements.amount,requestHash:quote.requestHash,readyForRegistration:false},taskRecords:task.records.map((r:{stepId:string;paymentState:string;refresh:string})=>({stepId:r.stepId,paymentState:r.paymentState,refresh:r.refresh})),unknownWalletParameterRejected:true});
  }finally{await client.close();await transport.close();}
}
writeFileSync("artifacts/m4/profile-current.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({profiles:report.profiles.length,transport:report.transport,modelHostTested:false,submittedPurchases:0}));
