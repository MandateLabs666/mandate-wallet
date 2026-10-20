import {it,expect,beforeAll} from "vitest";
import {execFileSync} from "node:child_process";
import {writeFileSync,chmodSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash,randomBytes} from "node:crypto";
import {toHex} from "viem";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {fixture} from "../../services/test/fixture.js";
import {loadGateway,GatewayConfigSchema,authenticateCredential} from "../runtime.js";
beforeAll(()=>{execFileSync(process.execPath,[resolve("scripts/m4-build-gateway.mjs")],{cwd:process.cwd(),stdio:"pipe"});});

it("connection credential binds one fixed profile and rejects owner keys and unsafe signer permissions",async()=>{
  const e=await fixture(),token=randomBytes(32).toString("hex"),digest=createHash("sha256").update(token).digest("hex");let runtime:Awaited<ReturnType<typeof loadGateway>>|undefined;
  try {
    const agent=join(e.directory,"agent.json"),operator=join(e.directory,"operator.json"),configPath=join(e.directory,"gateway.json");
    const writeKey=(path:string,key:Uint8Array)=>writeFileSync(path,JSON.stringify({privateKey:toHex(key)}),{mode:0o600});
    writeKey(agent,e.agentA.getHdKey().privateKey!);writeKey(operator,e.operator.getHdKey().privateKey!);
    const config={schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:"0",sessionKeyFile:agent,operatorKeyFile:operator,storeFile:join(e.directory,"runtime.sqlite"),credentialSHA256:digest,confirmations:1,services:e.services.map((s,i)=>({...s,checkResult:undefined,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin]};
    const write=()=>writeFileSync(configPath,JSON.stringify(config),{mode:0o600});write();
    expect(()=>authenticateCredential(digest,undefined)).toThrow("TOOL_CONNECTION_UNAUTHENTICATED");expect(()=>authenticateCredential(digest,"x".repeat(64))).toThrow("TOOL_CONNECTION_UNAUTHENTICATED");
    expect(()=>GatewayConfigSchema.parse({...config,ownerKeyFile:agent})).toThrow();
    await expect(loadGateway(configPath,"x".repeat(64))).rejects.toThrow("TOOL_CONNECTION_UNAUTHENTICATED");
    chmodSync(agent,0o644);await expect(loadGateway(configPath,token)).rejects.toThrow("SIGNER_FILE_PERMISSIONS");chmodSync(agent,0o600);
    writeKey(operator,e.owner.getHdKey().privateKey!);await expect(loadGateway(configPath,token)).rejects.toThrow("OWNER_OR_SIGNER_ROLE_COLLISION");writeKey(operator,e.operator.getHdKey().privateKey!);
    runtime=await loadGateway(configPath,token);
    const context=await runtime.tools.call("mandate_get_context",{}) as {agentId:string;sessionId:string};expect(context.agentId).toBe("agent-a");expect(context.sessionId).toBe(e.sessions[0]);
  }finally{runtime?.close();await e.close();}
});

it("the portable stdio process stops on credential rotation and a new connection resumes the original order",async()=>{
  const e=await fixture(),token=randomBytes(32).toString("hex"),client=new Client({name:"mandate-stdio-test",version:"1.0.0"});let transport:StdioClientTransport|undefined;let stderr="",restored:Awaited<ReturnType<typeof loadGateway>>|undefined;
  try {
    const agent=join(e.directory,"agent.json"),operator=join(e.directory,"operator.json"),configPath=join(e.directory,"gateway.json");
    writeFileSync(agent,JSON.stringify({privateKey:toHex(e.agentA.getHdKey().privateKey!)}),{mode:0o600});writeFileSync(operator,JSON.stringify({privateKey:toHex(e.operator.getHdKey().privateKey!)}),{mode:0o600});
    writeFileSync(configPath,JSON.stringify({schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"stdio-agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:"0",sessionKeyFile:agent,operatorKeyFile:operator,storeFile:join(e.directory,"stdio.sqlite"),credentialSHA256:createHash("sha256").update(token).digest("hex"),confirmations:1,services:e.services.map((s,i)=>({...s,checkResult:undefined,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin]}),{mode:0o600});
    transport=new StdioClientTransport({command:process.execPath,args:[resolve("dist/mandate-mcp.js"),"--config",configPath],cwd:e.directory,env:{PATH:process.env.PATH??"",MANDATE_CONNECTION_TOKEN:token},stderr:"pipe"});
    transport.stderr?.on("data",chunk=>{stderr+=chunk.toString();});await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(8);
    const result=await client.callTool({name:"mandate_call_service",arguments:{serviceId:e.services[0].serviceId}});expect(result.isError).not.toBe(true);
    const record=JSON.parse((result.content as {text:string}[])[0].text);expect(record.agentId).toBe("stdio-agent-a");expect(record.paymentState).toBe("paid");expect(record.resultState).toBe("valid");
    expect(JSON.stringify(result)+stderr).not.toContain(token);expect(JSON.stringify(result)+stderr).not.toContain(toHex(e.agentA.getHdKey().privateKey!));
    const newToken=randomBytes(32).toString("hex"),profile=JSON.parse(readFileSync(configPath,"utf8"));profile.credentialSHA256=createHash("sha256").update(newToken).digest("hex");writeFileSync(configPath,JSON.stringify(profile),{mode:0o600});
    const denied=await client.callTool({name:"mandate_call_service",arguments:{serviceId:e.services[1].serviceId}});expect(denied.isError).toBe(true);expect(JSON.stringify(denied.content)).toContain("TOOL_CONNECTION_UNAUTHENTICATED");
    await expect(loadGateway(configPath,token)).rejects.toThrow("TOOL_CONNECTION_UNAUTHENTICATED");
    restored=await loadGateway(configPath,newToken);
    const receipt=await restored.tools.call("mandate_get_receipt",{serviceId:e.services[0].serviceId}) as {record:{settlementHash:string;nonce:string}};
    expect(receipt.record.settlementHash).toBe(record.settlementHash);expect(receipt.record.nonce).toBe(record.nonce);expect(restored.purchase.store.all()).toHaveLength(1);
    const same=await restored.tools.call("mandate_call_service",{serviceId:e.services[0].serviceId}) as {settlementHash:string;nonce:string};expect(same.settlementHash).toBe(record.settlementHash);expect(same.nonce).toBe(record.nonce);
  }finally{restored?.close();await client.close();await transport?.close();await e.close();}
});
