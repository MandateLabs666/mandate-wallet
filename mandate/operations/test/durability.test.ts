import {it,expect} from "vitest";
import {spawn,type ChildProcess} from "node:child_process";
import {mkdtempSync,writeFileSync,statSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {keccak256,type Hex} from "viem";
import {PurchaseStore} from "../../services/store.js";
const worker="mandate/operations/test/fixtures/store-worker.ts";
function start(path:string,action:string,gate="unused",release="unused"){
  const child=spawn(process.execPath,["--import","tsx",worker,path,action,gate,release],{env:{PATH:process.env.PATH},stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";const lines:any[]=[];
  child.stdout!.on("data",chunk=>{stdout+=chunk;for(const line of stdout.split("\n").slice(lines.length,-1)){if(line)lines.push(JSON.parse(line));}});child.stderr!.on("data",chunk=>{stderr+=chunk;});
  const done=new Promise<{code:number|null;lines:any[]}>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("WORKER_PROCESS_TIMEOUT"));},12000);
    child.once("error",e=>{clearTimeout(timer);reject(e);});child.once("close",code=>{clearTimeout(timer);if(code!==0&&code!==73&&code!==74)reject(new Error("WORKER_FAILED:"+stderr.slice(-400)));else resolve({code,lines});});
  });
  return {child,lines,done};
}
async function waitLines(workers:ReturnType<typeof start>[]){const deadline=Date.now()+10000;while(workers.some(w=>!w.lines.length)){if(Date.now()>deadline)throw Error("WORKER_RESPONSE_TIMEOUT");await new Promise(r=>setTimeout(r,10));}}
function kill(child:ChildProcess){if(child.exitCode===null)child.kill("SIGKILL");}
it("two independent OS workers contend for one business step; only the lease holder changes it",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"mandate-m7-workers-")),path=join(dir,"purchases.sqlite"),gate=join(dir,"go"),release=join(dir,"release");
  const initial=new PurchaseStore(path);initial.close();const workers=[start(path,"contend",gate,release),start(path,"contend",gate,release)];
  try{
    writeFileSync(gate,"");await waitLines(workers);expect(workers.filter(w=>w.lines[0].claimed)).toHaveLength(1);writeFileSync(release,"");
    expect((await Promise.all(workers.map(w=>w.done))).every(r=>r.code===0)).toBe(true);
    const store=new PurchaseStore(path);try{expect(store.all()).toHaveLength(1);expect(store.all()[0].paymentState).toBe("registering");expect(store.all()[0].version).toBe(1);}finally{store.close();}
  }finally{workers.forEach(w=>kill(w.child));rmSync(dir,{recursive:true,force:true});}
});
it("abrupt process exit retains a lease until expiry; replacement worker never takes a live lease",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"mandate-m7-crash-")),path=join(dir,"purchases.sqlite");
  try{
    const result=await start(path,"crash-with-lease").done;expect(result.code).toBe(73);
    const store=new PurchaseStore(path);try{
      const record=store.all()[0],old=store.db.prepare("SELECT owner,expires_at FROM leases WHERE key=?").get(record.key) as {owner:string;expires_at:number};
      const wait=Math.max(0,old.expires_at-Date.now()+5);if(wait)await new Promise(r=>setTimeout(r,wait));
      const fresh=store.claim(record.key)!;expect(fresh.owner).not.toBe(old.owner);expect(store.claim(record.key)).toBeUndefined();
      expect(()=>store.save(record,{key:record.key,owner:old.owner,expiresAt:old.expires_at})).toThrow("LEASE_LOST");store.release(fresh);
    }finally{store.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
it("a prepared signed transaction survives process death with its original nonce/hash and private file permissions",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"mandate-m7-prepared-")),path=join(dir,"purchases.sqlite");
  try{
    const result=await start(path,"crash-after-prepare").done;expect(result.code).toBe(74);
    const store=new PurchaseStore(path);try{
      const tx=store.transaction("fixed-order")!;expect(tx.hash).toBe(result.lines[0].hash);expect(tx.nonce).toBe(7);expect(tx.status).toBe("prepared");expect(keccak256(tx.raw)).toBe(tx.hash);
      expect(JSON.stringify(store.exportPublic())).not.toContain(tx.raw);expect(JSON.stringify(store.exportPublic())).not.toContain('"raw"');
      for(const file of [path,path+"-wal",path+"-shm"].filter(existsSync))expect(statSync(file).mode&0o077).toBe(0);
      expect(statSync(dir).mode&0o077).toBe(0);
      await expect(store.reserveTransaction({...tx,id:"another-order",intentHash:("0x"+"ab".repeat(32)) as Hex})).rejects.toThrow("SIGNER_NONCE_ALREADY_RESERVED");
      expect(store.transactionRows()).toHaveLength(1);
    }finally{store.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
