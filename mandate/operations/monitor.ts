import {DatabaseSync} from "node:sqlite";
import {mkdirSync,lstatSync,chmodSync} from "node:fs";
import {dirname,isAbsolute} from "node:path";
import {z} from "zod";
import {keccak256,toHex,type Address,type Hex} from "viem";
import {businessKey} from "../services/store.js";
import {EvidenceScopeSchema,evidenceScopeKey,kinds,verifyCheckpointChain,type Checkpoint} from "../evidence/checkpoint.js";
import {observeTarget,type ObservationTarget} from "./observe.js";

const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v as Hex);
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address);
const privatePath=z.string().refine(isAbsolute,"absolute private path required");
const target=z.object({chainId:z.union([z.literal(84532),z.literal(11155111)]),rpcs:z.tuple([z.string().url(),z.string().url()]),wallet:address,owner:address,asset:address,runtimeHash:hash,mandateId:hash.optional(),sessionId:hash.optional()}).strict();
export const MonitorConfigSchema=z.object({
  schemaVersion:z.literal(1),stateDatabase:privatePath,purchaseDatabase:privatePath,evidenceDatabase:privatePath.optional(),
  pendingAfterSeconds:z.number().int().min(1).max(86400),networks:z.array(target).min(1).max(2),
  tasks:z.array(z.object({scope:EvidenceScopeSchema,stepId:hash,deadline:z.string().datetime(),expectedKinds:z.array(z.enum(kinds)).max(5),trustedHead:z.object({sequence:z.number().int().min(0).max(9999),root:hash}).strict().optional()}).strict()).min(1).max(64),
}).strict().superRefine((c,ctx)=>{
  const keys=c.tasks.map(t=>businessKey(t.scope.chainId,t.scope.wallet,t.scope.mandateId,t.stepId));
  if(new Set(keys).size!==keys.length)ctx.addIssue({code:"custom",message:"duplicate monitored business key"});
  if(new Set(c.networks.map(n=>n.chainId+":"+n.wallet.toLowerCase())).size!==c.networks.length)ctx.addIssue({code:"custom",message:"duplicate monitored network wallet"});
  if(c.tasks.some(t=>!c.networks.some(n=>n.chainId===t.scope.chainId&&n.wallet.toLowerCase()===t.scope.wallet.toLowerCase())))ctx.addIssue({code:"custom",message:"task has no declared network wallet"});
  if(c.stateDatabase===c.purchaseDatabase||c.stateDatabase===c.evidenceDatabase)ctx.addIssue({code:"custom",message:"monitor state must be separate"});
});
export type MonitorConfig=z.infer<typeof MonitorConfigSchema>;
export type Finding={code:string;severity:"warning"|"critical";subject:string};
type Alert=Finding&{id:string;domain:string;firstAt:string;lastAt:string;resolvedAt:string|null};
function privateFile(path:string){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||process.getuid&&s.uid!==process.getuid())throw Error("PRIVATE_STORAGE_PERMISSIONS_INVALID");}
function openReadOnly(path:string){
  privateFile(path);for(const suffix of ["-wal","-shm"]){try{privateFile(path+suffix);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}}
  const db=new DatabaseSync(path,{readOnly:true});db.exec("BEGIN");return db;
}
const unresolved=new Set(["registering","reserved","pending","consumed_unknown"]);
const statusSchema=z.object({
  payment:z.enum(["draft","registering","reserved","pending","paid","consumed_unknown","canceled","rejected","released"]),
  service:z.enum(["not_requested","returned","failed","unknown"]),result:z.enum(["unchecked","valid","invalid"]),created:z.string().datetime(),
  evidence:z.enum(["recorded","incomplete","legacy-no-precheckpoint"]).nullish(),
}).strict();
export class MonitorState {
  readonly db:DatabaseSync;
  constructor(path:string){
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    try{privateFile(path);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
    this.db=new DatabaseSync(path);chmodSync(path,0o600);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS monitor_alerts(id TEXT PRIMARY KEY,domain TEXT,code TEXT,severity TEXT,subject TEXT,first_at TEXT,last_at TEXT,resolved_at TEXT); CREATE TABLE IF NOT EXISTS monitor_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,alert_id TEXT,event TEXT,observed_at TEXT); CREATE TABLE IF NOT EXISTS monitor_heads(scope TEXT PRIMARY KEY,sequence INTEGER,root TEXT)");
  }
  record(domain:string,findings:Finding[],now:string,complete:boolean){
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const seen=new Set<string>();
      for(const f of findings){
        if(!/^[A-Z0-9_]+$/.test(f.code))throw Error("MONITOR_CODE_INVALID");
        const id=keccak256(toHex(domain+":"+f.code+":"+f.subject));seen.add(id);
        const prior=this.db.prepare("SELECT resolved_at FROM monitor_alerts WHERE id=?").get(id) as {resolved_at:string|null}|undefined;
        if(!prior||prior.resolved_at){
          this.db.prepare("INSERT INTO monitor_alerts VALUES(?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET first_at=excluded.first_at,last_at=excluded.last_at,resolved_at=NULL").run(id,domain,f.code,f.severity,f.subject,now,now);
          this.db.prepare("INSERT INTO monitor_events(alert_id,event,observed_at) VALUES(?,?,?)").run(id,prior?"reopened":"opened",now);
        }else this.db.prepare("UPDATE monitor_alerts SET last_at=? WHERE id=?").run(now,id);
      }
      if(complete)for(const old of this.db.prepare("SELECT id FROM monitor_alerts WHERE domain=? AND resolved_at IS NULL").all(domain) as {id:string}[]){
        if(!seen.has(old.id)){this.db.prepare("UPDATE monitor_alerts SET resolved_at=? WHERE id=?").run(now,old.id);this.db.prepare("INSERT INTO monitor_events(alert_id,event,observed_at) VALUES(?,?,?)").run(old.id,"resolved",now);}
      }
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  head(scope:string){return this.db.prepare("SELECT sequence,root FROM monitor_heads WHERE scope=?").get(scope) as {sequence:number;root:Hex}|undefined;}
  saveHead(scope:string,p:Checkpoint){this.db.prepare("INSERT INTO monitor_heads VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET sequence=excluded.sequence,root=excluded.root").run(scope,Number(p.header.sequence),p.root);}
  report(domains?:string[]){
    const filter=domains?" AND a.domain IN ("+domains.map(()=>"?").join(",")+")":"";
    return {active:(this.db.prepare("SELECT a.* FROM monitor_alerts a WHERE a.resolved_at IS NULL"+filter+" ORDER BY a.id").all(...domains??[]) as any[]).map(r=>({id:r.id,domain:r.domain,code:r.code,severity:r.severity,subject:r.subject,firstAt:r.first_at,lastAt:r.last_at,resolvedAt:r.resolved_at}) as Alert),events:this.db.prepare("SELECT e.seq,e.alert_id AS alertId,e.event,e.observed_at AS observedAt FROM monitor_events e JOIN monitor_alerts a ON a.id=e.alert_id WHERE 1=1"+filter+" ORDER BY e.seq").all(...domains??[])};
  }
  close(){this.db.close();}
}
function storageCode(e:unknown){return e instanceof Error&&e.message==="PRIVATE_STORAGE_PERMISSIONS_INVALID"?e.message:"MONITOR_STORAGE_UNAVAILABLE";}
type Observation=Pick<Awaited<ReturnType<typeof observeTarget>>,"issues">&Partial<Pick<Awaited<ReturnType<typeof observeTarget>>,"observations">>;
export async function runMonitor(input:unknown,state:MonitorState,options:{now?:Date;observe?:(target:ObservationTarget)=>Promise<Observation>}={}){
  const config=MonitorConfigSchema.parse(input),now=options.now??new Date(),iso=now.toISOString(),time=now.getTime();
  const coverage:{domain:string;complete:boolean;source:string}[]=[];
  const taskStatus:{key:string;payment:string;service:string;result:string;unresolvedSince?:string;unresolvedAgeSource?:string}[]=[],networkStatus:Record<string,unknown>[]=[];
  // Sequential network work bounds demand on free RPC providers.
  for(const network of config.networks){
    const domain="network:"+network.chainId+":"+network.wallet.toLowerCase();
    try{
      const r=await (options.observe??observeTarget)(network),o=r.observations?.[0];
      state.record(domain,r.issues.map(code=>({code,severity:code.includes("INVARIANT")?"critical":"warning",subject:network.wallet})),iso,true);coverage.push({domain,complete:true,source:"two-provider-finalized-state"});
      networkStatus.push({chainId:network.chainId,wallet:network.wallet,blockNumber:o?.blockNumber.toString(),blockHash:o?.blockHash,assetCashAtomic:o?.cash.toString(),rootBudgetAtomic:o?.policy?.budget.toString(),rootOccupiedAtomic:o?.policy?.occupied.toString(),grantBudgetAtomic:o?.session?.budget.toString(),grantOccupiedAtomic:o?.session?.occupied.toString(),issues:r.issues});
    }
    catch{state.record(domain,[{code:"NETWORK_OBSERVATION_UNAVAILABLE",severity:"critical",subject:network.wallet}],iso,false);coverage.push({domain,complete:false,source:"two-provider-RPC-unavailable-or-inconsistent"});}
  }
  let purchases:DatabaseSync|undefined,evidence:DatabaseSync|undefined;
  try{
    try{purchases=openReadOnly(config.purchaseDatabase);}catch(e){state.record("purchase-storage",[{code:storageCode(e),severity:"critical",subject:"purchase-database"}],iso,false);}
    try{if(config.evidenceDatabase)evidence=openReadOnly(config.evidenceDatabase);}catch(e){state.record("evidence-storage",[{code:storageCode(e),severity:"critical",subject:"evidence-database"}],iso,false);}
    if(purchases)state.record("purchase-storage",[],iso,true);if(evidence)state.record("evidence-storage",[],iso,true);
    const checkedScopes=new Map<string,Checkpoint[]|undefined>();
    for(const task of config.tasks){
      const key=businessKey(task.scope.chainId,task.scope.wallet,task.scope.mandateId,task.stepId),domain="task:"+key,findings:Finding[]=[];
      let complete=!!purchases;
      const add=(code:string,severity:Finding["severity"]="warning")=>findings.push({code,severity,subject:key});
      if(purchases){
        try{
          // Only selected status columns cross the SQLite API; reports omit payloads.
          const row=purchases.prepare("SELECT json_extract(json,'$.paymentState') AS payment, json_extract(json,'$.serviceState') AS service, json_extract(json,'$.resultState') AS result, json_extract(json,'$.createdAt') AS created, json_extract(json,'$.evidenceStatus') AS evidence FROM purchases WHERE key=?").get(key);
          const record=row?statusSchema.parse(row):undefined;
          if(!record){if(time>=Date.parse(task.deadline))add("EXPECTED_TASK_MISSING");}
          else{
            const summary={key,payment:record.payment,service:record.service,result:record.result,unresolvedSince:undefined as string|undefined,unresolvedAgeSource:undefined as string|undefined};taskStatus.push(summary);
            if(unresolved.has(record.payment)){
              const audit=purchases.prepare("SELECT json_extract(json,'$.payment') AS payment,created_at FROM audit WHERE key=? ORDER BY seq DESC LIMIT 10001").all(key) as {payment:string;created_at:string}[];
              let since=Date.parse(record.created);for(const row of audit){if(!unresolved.has(row.payment))break;since=Date.parse(row.created_at);}
              if(audit.length>10000||!Number.isFinite(since)||since>time+30000){add("PENDING_HISTORY_UNAVAILABLE","critical");complete=false;}
              else{summary.unresolvedSince=new Date(since).toISOString();summary.unresolvedAgeSource=audit.length?"state-audit":"record-created-fallback";if(time-since>=config.pendingAfterSeconds*1000)add("PAYMENT_UNRESOLVED_TOO_LONG");}
            }
            if(record.payment==="consumed_unknown")add("NONCE_CONSUMED_WITHOUT_PAYMENT_PROOF","critical");
            if(record.payment==="paid"&&record.service!=="returned")add("PAID_SERVICE_UNDELIVERED");
            if(record.service==="returned"&&record.result!=="valid")add("RESULT_NOT_VALIDATED");
            if(record.evidence&&record.evidence!=="recorded")add("EVIDENCE_INCOMPLETE");
            if(time>=Date.parse(task.deadline)&&!(record.payment==="paid"&&record.service==="returned"&&record.result==="valid"))add("TASK_DEADLINE_MISSED");
          }
        }catch{add("TASK_STATUS_UNAVAILABLE","critical");complete=false;}
      }
      if(task.expectedKinds.length||task.trustedHead){
        if(!evidence){add("CHECKPOINT_SOURCE_UNAVAILABLE","critical");complete=false;}
        else{
          const scope=evidenceScopeKey(task.scope);
          if(!checkedScopes.has(scope)){
            try{
              const rows=evidence.prepare("SELECT checkpoint FROM evidence_checkpoints WHERE scope=? ORDER BY sequence LIMIT 10001").all(scope) as {checkpoint:string}[];
              if(rows.length>10000)throw Error("CHECKPOINT_LIMIT");
              const list=rows.length?await verifyCheckpointChain(rows.map(r=>JSON.parse(r.checkpoint)),task.scope):[];
              if(list.some(p=>p.header.policyVersion!==task.scope.policyVersion||p.header.sessionEpoch!==task.scope.sessionEpoch))throw Error("CHECKPOINT_EPOCH_MISMATCH");
              checkedScopes.set(scope,list);
            }catch{checkedScopes.set(scope,undefined);}
          }
          const list=checkedScopes.get(scope);
          if(!list){add("CHECKPOINT_HISTORY_INVALID","critical");complete=false;}
          else{
            const anchors=[state.head(scope),task.trustedHead].filter(a=>!!a);
            const changed=anchors.some(a=>list[a.sequence]?.root!==a.root),future=list.some(p=>BigInt(p.header.observedAt)>BigInt(Math.floor(time/1000)+30));
            if(changed){add("CHECKPOINT_ROLLBACK_OR_FORK","critical");complete=false;}
            if(future){add("CHECKPOINT_TIME_FUTURE","critical");complete=false;}
            if(!changed&&!future&&list.length)state.saveHead(scope,list.at(-1)!);
            if(time>=Date.parse(task.deadline))for(const kind of task.expectedKinds)if(!list.some(p=>p.header.stepId===task.stepId&&p.header.kind===kind))add("EXPECTED_CHECKPOINT_MISSING_"+kind.replaceAll("-","_").toUpperCase());
          }
        }
      }
      state.record(domain,findings,iso,complete);coverage.push({domain,complete,source:"local-read-only-SQL-projection-and-checkpoint-signatures"});
    }
  }finally{purchases?.close();evidence?.close();}
  const domains=[...coverage.map(c=>c.domain),"purchase-storage","evidence-storage"],checkpointHeads=[...new Set(config.tasks.map(t=>evidenceScopeKey(t.scope)))].flatMap(scope=>{const head=state.head(scope);return head?[{scope,...head,source:"retained-observation"}]:[];});
  return {schemaVersion:1,observedAt:iso,mode:"single-run-local-operations-monitor",transactionsSubmitted:0,coverage,taskStatus,networkStatus,checkpointHeads,...state.report(domains),limits:["Local monitor state is controlled by this host; it is not an independent witness.","Without a pre-existing trusted head, a tail omitted before first observation may be undetectable.","Task status is locally reported; network observations and signature checks do not prove HTTP delivery."]};
}
