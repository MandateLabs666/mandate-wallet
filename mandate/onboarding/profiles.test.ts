import {beforeAll,it,expect} from "vitest";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {unzipSync} from "fflate";
import {SetupProfiles} from "./profiles.js";
import {SetupEngine} from "./engine.js";
import {serveSetup} from "./server.js";
import {digest} from "./files.js";
import {desktopConnection} from "../desktop/connection.js";
const packageDirectory=resolve('.runtime/claude-desktop-guide/package'),entry=join(packageDirectory,'server/mandate-desktop.cjs');
beforeAll(()=>{
 execFileSync(process.execPath,['scripts/build-desktop-extension.mjs'],{stdio:'pipe'});
 execFileSync(process.execPath,['scripts/m6-build-web.mjs'],{stdio:'pipe',env:{...process.env,MANDATE_BUILD_REPORT_DIR:'.runtime/profile-check/build'}});
});
function environment(){const dir=mkdtempSync(join(tmpdir(),'mandate-profiles-test-'));mkdirSync(join(dir,'home'));mkdirSync(join(dir,'project'));return {directory:join(dir,'state'),home:join(dir,'home'),project:join(dir,'project'),entry,packageDirectory,networks:[]};}
it('a second local profile retains the first payment, revocation, fixed MCP binding and isolated budget',async()=>{
 const hub=new SetupProfiles(environment()),a='a'.repeat(32),b='b'.repeat(32);
 try{
  const concurrent=await Promise.allSettled([hub.create({kind:'local',requestId:a}),hub.create({kind:'local',requestId:a})]);
  expect(concurrent.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const first=hub.resolve(a),s=first.state!,profileBefore=digest(readFileSync(s.profilePath!)),descriptorBefore=digest(readFileSync(s.descriptorPath!));
  const snapshot:any=await first.workspace!.snapshot(s.mandateId),service=snapshot.services[0].serviceId;
  const paid:any=await first.workspace!.call(s.mandateId,service);expect(paid.paymentState).toBe('paid');
  await first.revokeLocal();const oldStatus:any=await first.status();expect(oldStatus.context.grant.revoked).toBe(true);
  await hub.create({kind:'local',requestId:b});expect(await hub.create({kind:'local',requestId:b})).toEqual({profileId:b});
  const second=hub.resolve(b),newStatus:any=await second.status();
  expect(newStatus.executionReady).toBe(true);expect(newStatus.context.policy.occupied).toBe(0n);
  expect(JSON.parse(readFileSync(s.profilePath!,'utf8')).rpc).not.toBe(JSON.parse(readFileSync(second.state!.profilePath!,'utf8')).rpc);
  expect(JSON.parse(readFileSync(s.profilePath!,'utf8')).storeFile).not.toBe(JSON.parse(readFileSync(second.state!.profilePath!,'utf8')).storeFile);
  expect(digest(readFileSync(s.profilePath!))).toBe(profileBefore);expect(digest(readFileSync(s.descriptorPath!))).toBe(descriptorBefore);
  const original=desktopConnection(['--connection',s.descriptorPath!]);original.check();expect(original.config).toBe(s.profilePath);
  const manifest=(engine:SetupEngine)=>JSON.parse(Buffer.from(unzipSync(engine.integration().desktopPackage())['manifest.json']).toString());
  expect(manifest(first).name).not.toBe(manifest(second).name);
  const after:any=await first.status();expect(after.context.grant.revoked).toBe(true);expect(after.context.policy.occupied).toBe(10000n);
  const rows=first.workspace!.base.purchase.store.db.prepare('SELECT COUNT(*) AS n FROM purchases').get() as any;expect(rows.n).toBe(1);
  expect((await hub.status(a)).selectedProfileId).toBe(a);expect((await hub.status(b)).selectedProfileId).toBe(b);
  expect((await hub.status()).selectedProfileId).toBe(a);
  await expect(hub.create({kind:'public',requestId:a,chainId:84532,owner:s.owner})).rejects.toThrow('REQUEST_CHANGED');
 }finally{await hub.close();}
});
it('migration imports an existing live wallet without changing its original configuration or restarting its chain',async()=>{
 const env=environment(),legacy=new SetupEngine(env);await legacy.createLocal();
 const oldSetup=readFileSync(join(env.directory,'setup.json')),s=legacy.state!,descriptor=digest(readFileSync(s.descriptorPath!));
 const hub=new SetupProfiles(env);
 try{
  await hub.restore();const status=await hub.status();expect(status.profiles).toHaveLength(1);expect(status.connectionReady).toBe(true);
  expect(status.state!.wallet).toBe(s.wallet);expect(readFileSync(join(env.directory,'setup.json'))).toEqual(oldSetup);expect(digest(readFileSync(s.descriptorPath!))).toBe(descriptor);
  await hub.restore();expect((await hub.status()).profiles).toHaveLength(1);
 }finally{await hub.close();}
 expect((await legacy.status()).connectionReady).toBe(true);expect((await legacy.status()).error).toBeUndefined();await legacy.close();
});
it('HTTP profile selection scopes workspace and downloads; unknown profiles and unapproved creations are refused',async()=>{
 const hub=new SetupProfiles(environment()),server=await serveSetup(hub,{port:0,staticDirectory:resolve('mandate/web/dist')});
 try{
  const page=await fetch(server.origin+'/setup.html'),cookie=page.headers.get('set-cookie')!.split(';')[0];
  const headers={cookie,origin:server.origin,'Content-Type':'application/json','X-Mandate-Setup':'1'};
  const call=(body:unknown,profile?:string)=>fetch(server.origin+'/api/setup',{method:'POST',headers:{...headers,...(profile?{'X-Mandate-Profile':profile}:{})},body:JSON.stringify(body)});
  expect((await call({operation:'new-local',requestId:'1'.repeat(32),approved:false})).status).toBe(409);
  expect((await call({operation:'new-public',requestId:'1'.repeat(32),approved:true,chainId:8453,owner:'0x'+'11'.repeat(20)})).status).toBe(409);
  const a='1'.repeat(32),b='2'.repeat(32);
  expect((await call({operation:'new-local',requestId:a,approved:true})).status).toBe(200);
  expect((await call({operation:'new-local',requestId:b,approved:true},a)).status).toBe(200);
  await hub.resolve(a).revokeLocal();
  const workspace=async(profile:string)=>{const r=await fetch(server.origin+'/api/workspace',{method:'POST',headers:{...headers,'X-Mandate-Profile':profile},body:'{"operation":"connect"}'});expect(r.status).toBe(200);return r.json() as Promise<any>;};
  expect((await workspace(a)).context.grant.revoked).toBe(true);expect((await workspace(b)).context.grant.revoked).toBe(false);
  for(const profile of [a,b]){
   const response=await fetch(server.origin+'/api/setup/desktop.mcpb?profile='+profile,{headers:{cookie}});expect(response.status).toBe(200);
   const manifest=JSON.parse(Buffer.from(unzipSync(new Uint8Array(await response.arrayBuffer()))['manifest.json']).toString());expect(manifest.server.mcp_config.args[2]).toBe(hub.resolve(profile).state!.descriptorPath);
   expect((await fetch(server.origin+'/app.html?profile='+profile+'&onboarding=1')).status).toBe(200);
   expect((await fetch(server.origin+'/setup.html?profile='+profile)).status).toBe(200);
  }
  expect((await call({operation:'check'},'f'.repeat(32))).status).toBe(409);
  expect((await fetch(server.origin+'/api/setup/desktop.mcpb?profile='+a,{headers:{cookie,'X-Mandate-Profile':b}})).status).toBe(409);
  expect((await fetch(server.origin+'/app.html?profile='+a+'&file=.runtime/keys.json')).status).toBe(404);
  expect((await fetch(server.origin+'/setup.html?profile=../setup.json')).status).toBe(404);
  const status=await (await fetch(server.origin+'/api/setup/status',{headers:{cookie,'X-Mandate-Profile':a}})).json();
  expect(JSON.stringify(status)).not.toMatch(/PRIVATE_CONNECTION|privateKey|connectionToken|profilePath|descriptorPath/);
 }finally{await server.close();await hub.close();}
});
it('a recorded interrupted creation is retained after restart and never starts another chain on retry',async()=>{
 const env=environment(),hub=new SetupProfiles(env),id='e'.repeat(32);await hub.create({kind:'local',requestId:id});await hub.close();
 const path=join(env.directory,'profiles.json'),registry=JSON.parse(readFileSync(path,'utf8'));registry.profiles[0].phase='pending';writeFileSync(path,JSON.stringify(registry));
 const restored=new SetupProfiles(env);try{
  await restored.restore();expect((await restored.status(id)).state!.id).toBeDefined();
  await expect(restored.create({kind:'local',requestId:id})).rejects.toThrow('CREATION_REVIEW_REQUIRED');
  expect((await restored.status(id)).profiles).toHaveLength(1);
  expect(()=>new SetupProfiles(env)).toThrow('SERVICE_ALREADY_RUNNING');
 }finally{await restored.close();}
});
