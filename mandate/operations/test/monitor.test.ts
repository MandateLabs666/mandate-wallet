import {it,expect} from "vitest";
import {mkdtempSync,rmSync,chmodSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {privateKeyToAccount} from "viem/accounts";
import type {Hex,Address} from "viem";
import {PurchaseStore,businessKey} from "../../services/store.js";
import {EvidenceJournal} from "../../evidence/journal.js";
import {evidenceScopeKey,type EvidenceScope} from "../../evidence/checkpoint.js";
import {MonitorState,runMonitor,type MonitorConfig} from "../monitor.js";
const hash=("0x"+"12".repeat(32)) as Hex,step=("0x"+"34".repeat(32)) as Hex,wallet="0x1111111111111111111111111111111111111111" as Address;
const signer=privateKeyToAccount(("0x"+"1".padStart(64,"0")) as Hex);
const scope:EvidenceScope={chainId:84532,wallet,mandateId:hash,sessionId:hash,signer:signer.address,policyVersion:"1",sessionEpoch:"1"};
const key=businessKey(84532,wallet,hash,step),now=new Date("2026-10-15T00:10:00Z");
function setup(){
  const dir=mkdtempSync(join(tmpdir(),"mandate-monitor-")),purchases=new PurchaseStore(join(dir,"purchase.sqlite")),journal=new EvidenceJournal(join(dir,"evidence.sqlite")),state=new MonitorState(join(dir,"monitor.sqlite"));
  const config:MonitorConfig={schemaVersion:1,stateDatabase:join(dir,"monitor.sqlite"),purchaseDatabase:join(dir,"purchase.sqlite"),evidenceDatabase:join(dir,"evidence.sqlite"),pendingAfterSeconds:60,networks:[{chainId:84532,rpcs:["https://one.example","https://two.example"],wallet,asset:wallet,owner:wallet,runtimeHash:hash}],tasks:[{scope,stepId:step,deadline:"2026-10-15T00:05:00Z",expectedKinds:["pre-payment","service"]}]};
  const observe=async()=>({issues:[] as string[]});
  return {dir,purchases,journal,state,config,observe,close:()=>{state.close();journal.close();purchases.close();rmSync(dir,{recursive:true,force:true});}};
}
it("alerts for missing tasks/checkpoints, deduplicates unchanged runs and persists across monitor restart",async()=>{
  const e=setup();try{
    const first=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(first.active.map(a=>a.code)).toEqual(expect.arrayContaining(["EXPECTED_TASK_MISSING","EXPECTED_CHECKPOINT_MISSING_PRE_PAYMENT","EXPECTED_CHECKPOINT_MISSING_SERVICE"]));
    const repeated=await runMonitor(e.config,e.state,{now:new Date(now.getTime()+1000),observe:e.observe});expect(repeated.events.length).toBe(first.events.length);
    const reopened=new MonitorState(e.config.stateDatabase);try{expect(reopened.report().active).toHaveLength(first.active.length);expect(reopened.report().events).toHaveLength(first.events.length);}finally{reopened.close();}
  }finally{e.close();}
});
it("uses unresolved transition age despite fresh updates; flags paid delivery/result separately and records recovery",async()=>{
  const e=setup();try{
    const r=e.purchases.create({key,requestHash:hash,agentId:"test",chainId:84532,wallet,mandateId:hash,stepId:step,paymentState:"pending",serviceState:"unknown",resultState:"unchecked",payload:{signature:"PRIVATE_PAYMENT_SIGNATURE"},result:{private:"PRIVATE_RESULT_BODY"}});
    e.purchases.db.prepare("INSERT INTO audit(key,event,json,created_at) VALUES(?,?,?,?)").run(key,"state",JSON.stringify({payment:"pending"}),"2026-10-15T00:00:00Z");
    await e.journal.append(signer,scope,step,"pre-payment","pre",{request:{secret:"PRIVATE_REQUEST_BODY"}},1760486400);
    const a=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(a.active.map(x=>x.code)).toContain("PAYMENT_UNRESOLVED_TOO_LONG");expect(a.taskStatus[0].unresolvedSince).toBe("2026-10-15T00:00:00.000Z");
    const lease=e.purchases.claim(key)!;r.paymentState="paid";r.serviceState="failed";e.purchases.save(r,lease);
    const b=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(b.active.map(x=>x.code)).toContain("PAID_SERVICE_UNDELIVERED");expect(b.active.map(x=>x.code)).not.toContain("PAYMENT_UNRESOLVED_TOO_LONG");
    r.serviceState="returned";r.resultState="invalid";e.purchases.save(r,lease);const c=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(c.active.map(x=>x.code)).toContain("RESULT_NOT_VALIDATED");
    r.resultState="valid";e.purchases.save(r,lease);e.purchases.release(lease);await e.journal.append(signer,scope,step,"service","service",{resultState:"valid"},1760486401);
    const d=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(d.active).toHaveLength(0);expect(d.events.some((x:any)=>x.event==="resolved")).toBe(true);
    const serialized=JSON.stringify(d);for(const secret of ["PRIVATE_PAYMENT_SIGNATURE","PRIVATE_RESULT_BODY","PRIVATE_REQUEST_BODY"])expect(serialized).not.toContain(secret);
  }finally{e.close();}
});
it("detects a deleted checkpoint tail and a signed fork against retained and configured heads",async()=>{
  const e=setup();try{
    await e.journal.append(signer,scope,step,"pre-payment","pre",{requestHash:hash},1760486400);const head=await e.journal.append(signer,scope,step,"service","service",{resultState:"valid"},1760486401);
    e.config.tasks[0].trustedHead={sequence:1,root:head.root};await runMonitor(e.config,e.state,{now,observe:e.observe});
    e.journal.db.prepare("DELETE FROM evidence_checkpoints WHERE scope=? AND sequence=1").run(evidenceScopeKey(scope));
    const deleted=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(deleted.active.map(a=>a.code)).toContain("CHECKPOINT_ROLLBACK_OR_FORK");expect(deleted.coverage.some(c=>!c.complete)).toBe(true);
    await e.journal.append(signer,scope,step,"service","fork",{resultState:"invalid"},1760486402);
    const fork=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(fork.active.map(a=>a.code)).toContain("CHECKPOINT_ROLLBACK_OR_FORK");
  }finally{e.close();}
});
it("unavailable sources retain prior alerts; unsafe storage and unknown statuses fail closed",async()=>{
  const e=setup();try{
    await runMonitor(e.config,e.state,{now,observe:async()=>({issues:["POLICY_BUDGET_EXHAUSTED"]})});
    const failed=await runMonitor(e.config,e.state,{now,observe:async()=>{throw Error("PRIVATE_RPC_ERROR");}});
    expect(failed.active.map(a=>a.code)).toEqual(expect.arrayContaining(["POLICY_BUDGET_EXHAUSTED","NETWORK_OBSERVATION_UNAVAILABLE"]));expect(JSON.stringify(failed)).not.toContain("PRIVATE_RPC_ERROR");
    chmodSync(e.config.purchaseDatabase,0o644);const unsafe=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(unsafe.active.map(a=>a.code)).toContain("PRIVATE_STORAGE_PERMISSIONS_INVALID");
    chmodSync(e.config.purchaseDatabase,0o600);e.purchases.create({key,requestHash:hash,agentId:"test",chainId:84532,wallet,mandateId:hash,stepId:step,paymentState:"draft",serviceState:"not_requested",resultState:"unchecked"});
    e.purchases.db.prepare("UPDATE purchases SET json=json_set(json,'$.paymentState','invented') WHERE key=?").run(key);
    const corrupt=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(corrupt.active.map(a=>a.code)).toContain("TASK_STATUS_UNAVAILABLE");
  }finally{e.close();}
});
it("does not export unrelated monitor scopes or advance the retained head from future-dated checkpoints",async()=>{
  const e=setup();try{
    e.state.record("unrelated-domain",[{code:"UNRELATED",severity:"warning",subject:"PRIVATE_OTHER_TASK"}],now.toISOString(),true);
    await e.journal.append(signer,scope,step,"pre-payment","future",{requestHash:hash},Math.floor(now.getTime()/1000)+300);
    const r=await runMonitor(e.config,e.state,{now,observe:e.observe});expect(r.active.map(a=>a.code)).toContain("CHECKPOINT_TIME_FUTURE");expect(JSON.stringify(r)).not.toContain("PRIVATE_OTHER_TASK");expect(r.checkpointHeads).toHaveLength(0);
  }finally{e.close();}
});
