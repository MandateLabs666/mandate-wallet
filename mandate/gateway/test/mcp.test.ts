import {it,expect} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {fixture} from "../../services/test/fixture.js";
import {GatewayTools} from "../tools.js";
import {createMandateMcp} from "../mcp.js";
import {decodeFunctionData} from "viem";
import {accountAbi} from "../../sdk/accountAbi.js";
it("eight MCP tools retain strict schemas and separate unsigned owner approval from chain funds",async()=>{
  const e=await fixture(),tools=new GatewayTools(e.clients[0]),server=createMandateMcp(tools),client=new Client({name:"mandate-sdk-test",version:"1.0.0"});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a),client.connect(b)]);
    const list=await client.listTools();expect(list.tools).toHaveLength(8);
    const invoke=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error("MCP_ERROR:"+JSON.stringify(r.content));return JSON.parse((r.content as {text:string}[])[0].text);};
    const context=await invoke("mandate_get_context",{});expect(context.ownerKeyHeldByGateway).toBe(false);expect(context.rootAvailable).toBe("150000");expect(context.configuredServiceIds).toEqual(e.services.map(s=>s.serviceId));expect(context.scopeNote).toContain("not a funded balance");
    const invalid=await client.callTool({name:"mandate_get_context",arguments:{wallet:e.wallet}});expect(invalid.isError).toBe(true);
    const draft=await invoke("mandate_request_authorization",{taskDescription:"Review limits",budgetAtomic:"150000",maxPerPaymentAtomic:"100000"});expect(draft.status).toBe("draft");expect(draft.chainActive).toBe(false);expect(draft.approvalRequired).toBe("owner-wallet");
    expect(decodeFunctionData({abi:accountAbi,data:draft.transaction.data}).functionName).toBe("replacePolicy");
    await invoke("mandate_search_services",{query:"statistics"});
    const quote=await invoke("mandate_quote_service",{serviceId:e.services[0].serviceId});expect(quote.readyForRegistration).toBe(false);
    const result=await invoke("mandate_call_service",{serviceId:e.services[0].serviceId});expect(result.paymentState).toBe("paid");expect(result.resultState).toBe("valid");expect(result.payload).toBeUndefined();expect(result.validatedResultSummary).toEqual({datasetId:"mandate-fixed-fixture-v2",asset:"ETH",count:3,mean:110});
    const receipt=await invoke("mandate_get_receipt",{serviceId:e.services[0].serviceId});expect(receipt.record.settlementHash).toBe(result.settlementHash);expect(receipt.record.registrationSignature).toBeUndefined();
    const task=await invoke("mandate_get_task",{});expect(task.records).toHaveLength(1);
    const revoke=await invoke("mandate_request_revoke",{});expect(revoke.status).toBe("draft");expect((await e.reader.readBudget(e.root,e.sessions[0])).session.revoked).toBe(false);
    expect(decodeFunctionData({abi:accountAbi,data:revoke.transaction.data}).functionName).toBe("revokeSession");
    const text=JSON.stringify([context,draft,result,receipt]);expect(text).not.toContain(e.agentA.getHdKey().privateKey!.toString());
  }finally{await client.close();await server.close();await e.close();}
});
