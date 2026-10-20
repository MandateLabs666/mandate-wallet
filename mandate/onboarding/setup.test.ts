import {beforeAll,it,expect} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,symlinkSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {createWalletClient,http,encodeFunctionData,keccak256} from "viem";
import {parse as parseTOML} from "smol-toml";
import {unzipSync} from "fflate";
import {HostIntegration} from "./hosts.js";
import {SetupEngine} from "./engine.js";
import {serveSetup} from "./server.js";
import {atomicPrivate,stringify} from "./files.js";
import {desktopConnection} from "../desktop/connection.js";
import {fixture} from "../services/test/fixture.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
const packageDirectory=resolve('.runtime/claude-desktop-guide/package'),entry=join(packageDirectory,'server/mandate-desktop.cjs');
beforeAll(()=>{execFileSync(process.execPath,['scripts/build-desktop-extension.mjs'],{stdio:'pipe'});execFileSync(process.execPath,['scripts/m6-build-web.mjs'],{stdio:'pipe',env:{...process.env,MANDATE_BUILD_REPORT_DIR:'.runtime/onboarding-check/build'}});});
function environment(){const dir=mkdtempSync(join(tmpdir(),'mandate-setup-test-'));return {directory:join(dir,'state'),home:join(dir,'home'),project:join(dir,'project'),entry,packageDirectory,networks:[]};}
function host(){const env=environment();mkdirSync(env.home);mkdirSync(env.project);return {env,integration:new HostIntegration({...env,node:process.execPath,connection:join(env.directory,'connection.json')})};}
it('Codex preview contains only the new stanza and preserves comments, unrelated servers and credentials',()=>{
 const {env,integration}=host(),path=join(env.project,'.codex/config.toml');mkdirSync(join(env.project,'.codex'));
 const old='# retain comment\nmodel = "existing-model"\n[mcp_servers.other]\ncommand = "other"\nsecret = "do-not-display"\n';writeFileSync(path,old);
 const preview=integration.prepare('codex','project');expect(JSON.stringify(preview)).not.toContain('do-not-display');expect(readFileSync(path,'utf8')).toBe(old);
 const result=integration.apply(preview.id),next=readFileSync(path,'utf8');expect(next.startsWith(old)).toBe(true);expect((parseTOML(next) as any).mcp_servers.other.secret).toBe('do-not-display');expect(existsSync(result.backup!)).toBe(true);
 integration.undo(preview.id);expect(readFileSync(path,'utf8')).toBe(old);
});
it('Claude Code merges only its MCP entry and refuses conflicting manual Mandate configuration',()=>{
 const {env,integration}=host(),path=join(env.home,'.claude.json');writeFileSync(path,JSON.stringify({otherSetting:{kept:true},mcpServers:{other:{command:'other'}}}));
 integration.apply(integration.prepare('claude-code','user').id);const next=JSON.parse(readFileSync(path,'utf8'));expect(next.otherSetting.kept).toBe(true);expect(next.mcpServers.other.command).toBe('other');
 expect(()=>integration.prepare('claude-code','user')).toThrow('HOST_MANDATE_CONFIG_EXISTS');
 writeFileSync(join(env.project,'.mcp.json'),JSON.stringify({mcpServers:{mandate:{command:'node',args:['dist/mandate-mcp.js']}}}));expect(()=>integration.prepare('claude-code','project')).toThrow('HOST_MANDATE_CONFIG_EXISTS');
});
it('a changed file invalidates review and a changed applied file cannot be overwritten by undo',()=>{
 const {env,integration}=host(),path=join(env.project,'.mcp.json'),preview=integration.prepare('claude-code','project');writeFileSync(path,'{}');expect(()=>integration.apply(preview.id)).toThrow('HOST_CONFIG_CHANGED');
 const p=integration.prepare('claude-code','project');integration.apply(p.id);writeFileSync(path,readFileSync(path,'utf8')+'\n');expect(()=>integration.undo(p.id)).toThrow('HOST_CONFIG_CHANGED_CANNOT_UNDO');
});
it('host configuration rejects symlinks and malformed input before writing',()=>{
 const {env,integration}=host(),path=join(env.project,'.mcp.json');writeFileSync(path,'[]');expect(()=>integration.prepare('claude-code','project')).toThrow('FORMAT_REJECTED');
 const other=host();writeFileSync(join(other.env.project,'target'),'{}');symlinkSync(join(other.env.project,'target'),join(other.env.project,'.mcp.json'));expect(()=>other.integration.prepare('claude-code','project')).toThrow('SYMLINK_REJECTED');
});
it('the bound MCPB has no required configuration fields and packages no connection file or signing material',()=>{
 const {integration}=host(),files=unzipSync(integration.desktopPackage()),m=JSON.parse(Buffer.from(files['manifest.json']).toString());expect(m.version).toBe(JSON.parse(readFileSync(join(packageDirectory,'manifest.json'),'utf8')).version);expect(m.user_config).toBeUndefined();expect(m.server.mcp_config.args[1]).toBe('--connection');
 expect(m.name).toMatch(/^mandate-wallet-guided-[a-f0-9]{12}$/);expect(m.name).not.toBe('mandate-wallet');expect(m.display_name).toContain('Guided');
 const other=host(),otherManifest=JSON.parse(Buffer.from(unzipSync(other.integration.desktopPackage())['manifest.json']).toString());expect(otherManifest.name).not.toBe(m.name);
 const sameManifest=JSON.parse(Buffer.from(unzipSync(integration.desktopPackage())['manifest.json']).toString());expect(sameManifest.name).toBe(m.name);
 expect(Object.keys(files).sort()).toEqual(['LICENSE','README.zh-CN.md','THIRD_PARTY_NOTICES.json','build.json','manifest.json','server/mandate-desktop.cjs'].sort());expect(Object.keys(files).join(' ')).not.toContain('PRIVATE_CONNECTION');
});
it('local onboarding creates a usable fixed wallet and independent MCP check, and paid recovery keeps its original hash',async()=>{
 const engine=new SetupEngine(environment());try{
  const result:any=await engine.createLocal();expect(result.connectionReady).toBe(true);expect(result.context.ownerKeyHeldByGateway).toBe(false);
  expect(await engine.checkConnection()).toMatchObject({passed:true,toolCount:8,modelToolCallVerified:false});
  const s=(await engine.workspace!.snapshot(engine.state!.mandateId)) as any,service=s.services[0].serviceId;
  const first:any=await engine.workspace!.call(engine.state!.mandateId,service);expect(first.paymentState).toBe('paid');expect(first.serviceState).toBe('failed');
  const second:any=await engine.workspace!.call(engine.state!.mandateId,service);expect(second.resultState).toBe('valid');expect(second.settlementHash).toBe(first.settlementHash);expect(second.nonce).toBe(first.nonce);
  const c:any=await engine.status();expect(c.context.policy.occupied).toBe(10000n);expect(JSON.stringify(c,(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain('privateKey');
  await expect(engine.createLocal()).rejects.toThrow('SETUP_ALREADY_EXISTS');
  const bound=desktopConnection(['--connection',engine.state!.descriptorPath!]);bound.check();const original=readFileSync(bound.config,'utf8');atomicPrivate(bound.config,original+'\n');expect(()=>bound.check()).toThrow('CONNECTION_CHANGED');atomicPrivate(bound.config,original);
  expect(await engine.revokeLocal()).toMatchObject({status:'revoked',chainId:31337,publicTransactions:0});
  expect((await engine.status()).executionReady).toBe(false);const denied:any=await engine.workspace!.call(engine.state!.mandateId,s.services[1].serviceId);expect(denied.paymentState).toBe('rejected');
 }finally{await engine.close();}
});
it('concurrent local setup requests cannot create two wallets',async()=>{
 const engine=new SetupEngine(environment());try{const r=await Promise.allSettled([engine.createLocal(),engine.createLocal()]);expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(r.filter(x=>x.status==='rejected')).toHaveLength(1);}finally{await engine.close();}
});
it('a stopped local node retains the original setup and cannot silently create a replacement wallet',async()=>{
 const env=environment(),engine=new SetupEngine(env);await engine.createLocal();const id=engine.state!.id,profile=engine.state!.profilePath!;await engine.close();
 const restored=new SetupEngine(env);try{await expect(restored.restore()).rejects.toThrow();expect(restored.state!.id).toBe(id);expect(existsSync(profile)).toBe(true);await expect(restored.createLocal()).rejects.toThrow('SETUP_ALREADY_EXISTS');}finally{await restored.close();}
});
it('HTTP setup requires a same-origin browser session, rejects arbitrary files and mainnet, and publishes no state files',async()=>{
 const engine=new SetupEngine(environment()),server=await serveSetup(engine,{port:0,staticDirectory:resolve('mandate/web/dist')});try{
  expect((await fetch(server.origin+'/api/setup/status')).status).toBe(401);
  const page=await fetch(server.origin+'/setup.html'),cookie=page.headers.get('set-cookie')!.split(';')[0];expect(await page.text()).toContain('setup-progress');
  const workspacePage=await fetch(server.origin+'/app.html?onboarding=1');expect(workspacePage.status).toBe(200);expect(await workspacePage.text()).toContain('connection-panel');
  expect((await fetch(server.origin+'/app.html?onboarding=1&file=.runtime/keys/owner.json')).status).toBe(404);
  expect((await fetch(server.origin+'/unknown.html?onboarding=1')).status).toBe(404);
  expect((await fetch(server.origin+'/constructor')).status).toBe(404);
  const call=(body:unknown,headers:Record<string,string>={})=>fetch(server.origin+'/api/setup',{method:'POST',headers:{cookie,'content-type':'application/json',origin:server.origin,'X-Mandate-Setup':'1',...headers},body:JSON.stringify(body)});
  expect((await call({operation:'local'},{origin:'https://evil.example'})).status).toBe(403);
  expect((await call({operation:'public',chainId:8453,owner:'0x'+'11'.repeat(20)})).status).toBe(409);
  expect((await call({operation:'host-preview',host:'codex',scope:'user',path:'/arbitrary/file'})).status).toBe(409);
  expect((await call({operation:'host-apply',id:'a'.repeat(32),approved:false})).status).toBe(409);
  expect((await fetch(server.origin+'/.runtime/mandate-setup/setup.json',{headers:{cookie}})).status).toBe(404);
  expect((await fetch(server.origin+'/api/setup/desktop.mcpb',{headers:{cookie}})).status).toBe(409);
  expect((await fetch(server.origin+'/api/workspace',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{"operation":"connect"}'})).status).toBe(409);
 }finally{await server.close();await engine.close();}
});
it('public onboarding requires externally signed, matching transactions and freezes unknown submissions',async()=>{
 const e=await fixture(),artifact=JSON.parse(readFileSync('mandate/contracts/out/MandateFactory.sol/MandateFactory.json','utf8')),owner=createWalletClient({chain:e.chain,account:e.owner,transport:http(e.node.rpc)});
 const deployment=await owner.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object}),factory=(await e.pc.waitForTransactionReceipt({hash:deployment})).contractAddress!;
 const env=environment(),engine=new SetupEngine({...env,networks:[{chainId:31337,name:'Controlled public-route test',rpc:e.node.rpc,asset:e.asset,factory,factoryHash:keccak256((await e.pc.getCode({address:factory}))!)}]});
 try{
  await engine.beginPublic(31337,e.owner.address);expect((await engine.status()).connectionReady).toBe(false);
  await expect(engine.prepare('session')).rejects.toThrow('ACCOUNT_CONFIRMATION_REQUIRED');
  const account=await engine.prepare('account');expect(account.state).toBe('prepared');expect(await e.pc.getCode({address:engine.state!.wallet!})).toBeUndefined();
  engine.mark(account.id,'awaiting-wallet');engine.mark(account.id,'submission-unknown');expect((await engine.prepare('account')).id).toBe(account.id);expect(()=>engine.mark(account.id,'awaiting-wallet')).toThrow('RECONCILE_FIRST');
  async function send(kind:any){const i=await engine.prepare(kind);if(i.state==='prepared')engine.mark(i.id,'awaiting-wallet');const hash=await owner.sendTransaction({to:i.to,data:i.data,value:BigInt(i.value)});await e.pc.waitForTransactionReceipt({hash});expect((await engine.broadcast(i.id,hash)).state).toBe('confirmed');return i;}
  const confirmed=await send('account');expect(engine.state!.wallet).not.toBe(e.wallet);await expect(engine.broadcast(confirmed.id,'0x'+'11'.repeat(32) as any)).rejects.toThrow('ORIGINAL_HASH_FROZEN');
  await e.send(e.asset,encodeFunctionData({abi:testTokenAbi,functionName:'mint',args:[e.owner.address,150000n]}));
  await send('fund-usdc');await send('fund-gas');await send('mandate');await send('session');
  expect((await engine.finishPublic()).connectionReady).toBe(true);expect(await engine.checkConnection()).toMatchObject({passed:true,toolCount:8});
  const live=await engine.workspace!.snapshot(engine.state!.mandateId) as any;
  const purchased:any=await engine.workspace!.call(engine.state!.mandateId,live.services[0].serviceId);expect(purchased.paymentState).toBe('paid');
  const recovered:any=await engine.workspace!.call(engine.state!.mandateId,live.services[0].serviceId);expect(recovered.resultState).toBe('valid');expect(recovered.settlementHash).toBe(purchased.settlementHash);
  const s=engine.state!,profileBefore=readFileSync(s.profilePath!,'utf8');await engine.finishPublic();expect(readFileSync(s.profilePath!,'utf8')).toBe(profileBefore);
  const bad=new SetupEngine({...environment(),networks:env.networks.length?env.networks:[{chainId:31337,name:'Controlled mismatched receipt',rpc:e.node.rpc,asset:e.asset,factory,factoryHash:keccak256((await e.pc.getCode({address:factory}))!)}]});
  try{await bad.beginPublic(31337,e.owner.address);const i=await bad.prepare('account');bad.mark(i.id,'awaiting-wallet');const hash=await owner.sendTransaction({to:e.owner.address,value:0n});await e.pc.waitForTransactionReceipt({hash});await expect(bad.broadcast(i.id,hash)).rejects.toThrow('TRANSACTION_INTENT_MISMATCH');expect((await bad.status()).connectionReady).toBe(false);}finally{await bad.close();}
  const pending=new SetupEngine({...environment(),networks:[{chainId:31337,name:'Reorg route test',rpc:e.node.rpc,asset:e.asset,factory,factoryHash:keccak256((await e.pc.getCode({address:factory}))!)}]});
  try{await pending.beginPublic(31337,e.owner.address);const i=await pending.prepare('account');pending.mark(i.id,'awaiting-wallet');const snapshot=await e.pc.request({method:'evm_snapshot' as never});const hash=await owner.sendTransaction({to:i.to,data:i.data,value:BigInt(i.value)});await e.pc.waitForTransactionReceipt({hash});expect((await pending.broadcast(i.id,hash)).state).toBe('confirmed');await e.pc.request({method:'evm_revert' as never,params:[snapshot] as never});expect((await pending.reconcile(i.id)).state).toBe('broadcast');await expect(pending.prepare('session')).rejects.toThrow('ACCOUNT_CONFIRMATION_REQUIRED');}finally{await pending.close();}
 }finally{await engine.close();await e.close();}
});
