import {it, expect, beforeAll} from "vitest";
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync, writeFileSync, chmodSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {createHash, randomBytes} from "node:crypto";
import {toHex} from "viem";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {fixture} from "../services/test/fixture.js";
const stage=resolve(".runtime/claude-desktop-guide/package"),entry=join(stage,"server/mandate-desktop.cjs");
beforeAll(()=>{execFileSync(process.execPath,["scripts/build-desktop-extension.mjs"],{stdio:"pipe"});});

it("the standalone bundle rejects missing paths without exposing arguments",()=>{
  const r=spawnSync(process.execPath,[entry,"--token","not-a-token"],{encoding:"utf8",cwd:tmpdir()});
  expect(r.status).toBe(1);expect(r.stdout).toBe("");expect(r.stderr).toContain("DESKTOP_ABSOLUTE_PATHS_REQUIRED");
  expect(r.stderr).not.toContain("not-a-token");
});
it("the file picker route rejects readable-by-others, malformed and missing credentials",()=>{
  const dir=mkdtempSync(join(tmpdir(),"mandate-desktop-errors-")),path=join(dir,"connection.json"),config=join(dir,"profile.json");
  const run=()=>spawnSync(process.execPath,[entry,"--config",config,"--credential-file",path],{encoding:"utf8",cwd:dir});
  writeFileSync(path,JSON.stringify({connectionToken:"never-print-this-credential".repeat(3)}),{mode:0o600});chmodSync(path,0o644);
  expect(run().stderr).toContain("DESKTOP_CREDENTIAL_FILE_REJECTED");
  chmodSync(path,0o600);writeFileSync(path,JSON.stringify({privateKey:"not-a-connection-file"}));
  expect(run().stderr).toContain("DESKTOP_CREDENTIAL_INVALID");
  writeFileSync(path,"{");const malformed=run();expect(malformed.stderr).toContain("DESKTOP_START_REJECTED");expect(malformed.stdout).toBe("");
});
it("the distributable advertises exactly the existing tools and contains no external packages",()=>{
  const manifest=JSON.parse(readFileSync(join(stage,"manifest.json"),"utf8")),build=JSON.parse(readFileSync(join(stage,"build.json"),"utf8"));
  expect(manifest.tools).toHaveLength(8);expect(Object.keys(manifest.user_config)).toEqual(["profile_path","credential_path"]);
  expect(manifest.server.mcp_config.args).not.toContain("${user_config.connectionToken}");
  expect(build.externalImports.every((s:string)=>s.startsWith("node:"))).toBe(true);
});
it("the isolated bundle authenticates a fixed profile, serves eight tools and recovers the original test order",async()=>{
  const e=await fixture({failAfterPayment:true}),token=randomBytes(32).toString("hex"),client=new Client({name:"desktop-bundle-test",version:"1.0.0"});
  let transport:StdioClientTransport|undefined,stderr="";
  try{
    const config=join(e.directory,"case-agent.json"),credential=join(e.directory,"connection.json");
    writeFileSync(join(e.directory,"session.json"),JSON.stringify({privateKey:toHex(e.agentA.getHdKey().privateKey!)}),{mode:0o600});
    writeFileSync(join(e.directory,"operator.json"),JSON.stringify({privateKey:toHex(e.operator.getHdKey().privateKey!)}),{mode:0o600});
    writeFileSync(credential,JSON.stringify({connectionToken:token}),{mode:0o600});
    writeFileSync(config,JSON.stringify({schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"desktop-case",mandateId:e.root,sessionId:e.sessions[0],startBlock:"0",sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"desktop.sqlite",credentialSHA256:createHash("sha256").update(token).digest("hex"),confirmations:1,services:e.services.map((s,i)=>({...s,checkResult:undefined,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin]}),{mode:0o600});
    transport=new StdioClientTransport({command:process.execPath,args:[entry,"--config",config,"--credential-file",credential],cwd:tmpdir(),env:{PATH:process.env.PATH??""},stderr:"pipe"});
    transport.stderr?.on("data",chunk=>{stderr+=chunk.toString();});await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(8);
    const context=await client.callTool({name:"mandate_get_context",arguments:{}});expect(context.isError).not.toBe(true);expect(JSON.stringify(context)).toContain(e.wallet);
    const buy=await client.callTool({name:"mandate_call_service",arguments:{serviceId:e.services[0].serviceId}});
    const first=JSON.parse((buy.content as {text:string}[])[0].text);expect(first.paymentState).toBe("paid");expect(first.deliveryState).not.toBe("delivered");
    const recover=await client.callTool({name:"mandate_call_service",arguments:{serviceId:e.services[0].serviceId}});
    const second=JSON.parse((recover.content as {text:string}[])[0].text);expect(second.resultState).toBe("valid");expect(second.settlementHash).toBe(first.settlementHash);expect(second.nonce).toBe(first.nonce);
    expect(JSON.stringify([context,buy,recover])+stderr).not.toContain(token);expect(JSON.stringify([context,buy,recover])+stderr).not.toContain(toHex(e.agentA.getHdKey().privateKey!));
  }finally{await client.close();await transport?.close();await e.close();}
});
