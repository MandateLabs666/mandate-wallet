import {DatabaseSync} from "node:sqlite";
import {mkdirSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {keccak256,toHex,type Hex,type LocalAccount} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
import {commitFields,disclose,verifyDisclosures,type PrivateLeaf,type Disclosure} from "./merkle.js";
import {evidenceScopeKey,signCheckpoint,verifyCheckpoint,verifyCheckpointChain,ZERO_ROOT,type EvidenceScope,type Checkpoint} from "./checkpoint.js";
import {ActionProofSchema,signActionProof,verifyActionProof,type ActionProof,type UnsignedActionProof} from "./action-proof.js";
import {stageFields} from "./stage-fields.js";
type Row={sequence:number;event_id:string;fields_hash:Hex;checkpoint:string;leaves:string};
export type DisclosedCheckpoint={checkpoint:Checkpoint;disclosures:Disclosure[]};
export class EvidenceJournal {
  readonly db:DatabaseSync;
  constructor(path:string){mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);chmodSync(path,0o600);this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS evidence_checkpoints(scope TEXT NOT NULL,sequence INTEGER NOT NULL,event_id TEXT NOT NULL,fields_hash TEXT NOT NULL,checkpoint TEXT NOT NULL,leaves TEXT NOT NULL,PRIMARY KEY(scope,sequence),UNIQUE(scope,event_id)); CREATE TABLE IF NOT EXISTS evidence_actions(scope TEXT NOT NULL,event_id TEXT NOT NULL,proof TEXT NOT NULL,PRIMARY KEY(scope,event_id))");}
  rows(scope:EvidenceScope){return this.db.prepare("SELECT * FROM evidence_checkpoints WHERE scope=? ORDER BY sequence").all(evidenceScopeKey(scope)) as Row[];}
  private async checked(row:Row,scope:EvidenceScope){
    const checkpoint=await verifyCheckpoint(JSON.parse(row.checkpoint),scope.signer),leaves=JSON.parse(row.leaves) as PrivateLeaf[];
    if(evidenceScopeKey(checkpoint.header)!==evidenceScopeKey(scope))throw new MandateError("CHECKPOINT_CONTEXT_MISMATCH");
    verifyDisclosures(checkpoint.header.merkleRoot,disclose(leaves,leaves.map(l=>l.name)),checkpoint.header.leafCount);
    return {checkpoint,leaves};
  }
  async find(scope:EvidenceScope,eventId:string){const row=this.db.prepare("SELECT * FROM evidence_checkpoints WHERE scope=? AND event_id=?").get(evidenceScopeKey(scope),eventId) as Row|undefined;return row?this.checked(row,scope):undefined;}
  async append(signer:Pick<LocalAccount,"address"|"signTypedData">,scope:EvidenceScope,stepId:Hex,kind:Checkpoint["header"]["kind"],eventId:string,fields:Record<string,unknown>,observedAt=Math.floor(Date.now()/1000)){
    if(!eventId||eventId.length>512||!Number.isSafeInteger(observedAt)||observedAt<0)throw new MandateError("CHECKPOINT_EVENT_INVALID");
    if(Object.keys(fields).some(name=>!(stageFields[kind] as readonly string[]).includes(name)))throw new MandateError("CHECKPOINT_FUTURE_OR_UNKNOWN_FIELD");
    const key=evidenceScopeKey(scope),fieldsHash=keccak256(toHex(canonicalJson(fields)));
    for(let retry=0;retry<8;retry++){
      const existing=this.db.prepare("SELECT * FROM evidence_checkpoints WHERE scope=? AND event_id=?").get(key,eventId) as Row|undefined;
      if(existing){if(existing.fields_hash!==fieldsHash)throw new MandateError("CHECKPOINT_EVENT_FROZEN");const {checkpoint}=await this.checked(existing,scope);if(checkpoint.header.kind!==kind||checkpoint.header.stepId!==stepId)throw new MandateError("CHECKPOINT_EVENT_CONTEXT_MISMATCH");return checkpoint;}
      const rows=this.rows(scope);if(rows.length>=10000)throw new MandateError("CHECKPOINT_COUNT_LIMIT");
      const last=rows.at(-1)?(await this.checked(rows.at(-1)!,scope)).checkpoint:undefined;
      if(last&&(Number(last.header.sequence)!==rows.length-1||BigInt(last.header.observedAt)>BigInt(observedAt)))throw new MandateError("CHECKPOINT_HISTORY_INVALID");
      const tree=commitFields(fields),checkpoint=await signCheckpoint(signer,{schemaVersion:2,...scope,stepId,sequence:String(rows.length),kind,previousRoot:last?.root??ZERO_ROOT,merkleRoot:tree.root,leafCount:tree.leaves.length,observedAt:String(observedAt)});
      this.db.exec("BEGIN IMMEDIATE");
      try{
        const current=this.db.prepare("SELECT sequence FROM evidence_checkpoints WHERE scope=? ORDER BY sequence DESC LIMIT 1").get(key) as {sequence:number}|undefined;
        if((current?.sequence??-1)!==rows.length-1){this.db.exec("ROLLBACK");continue;}
        this.db.prepare("INSERT INTO evidence_checkpoints VALUES(?,?,?,?,?,?)").run(key,rows.length,eventId,fieldsHash,canonicalJson(checkpoint),canonicalJson(tree.leaves));this.db.exec("COMMIT");return checkpoint;
      }catch(error){this.db.exec("ROLLBACK");throw error;}
    }
    throw new MandateError("CHECKPOINT_APPEND_BUSY");
  }
  async action(signer:Pick<LocalAccount,"address"|"signTypedData">,eventId:string,input:UnsignedActionProof):Promise<ActionProof>{
    const key=evidenceScopeKey(input),existing=this.db.prepare("SELECT proof FROM evidence_actions WHERE scope=? AND event_id=?").get(key,eventId) as {proof:string}|undefined;
    if(existing){const p=ActionProofSchema.parse(JSON.parse(existing.proof));await verifyActionProof(p,input);const {signature,...unsigned}=p;if(canonicalJson(unsigned)!==canonicalJson(input))throw new MandateError("ACTION_PROOF_FROZEN");return p;}
    const p=await signActionProof(signer,input);this.db.prepare("INSERT OR IGNORE INTO evidence_actions VALUES(?,?,?)").run(key,eventId,canonicalJson(p));
    const saved=ActionProofSchema.parse(JSON.parse((this.db.prepare("SELECT proof FROM evidence_actions WHERE scope=? AND event_id=?").get(key,eventId) as {proof:string}).proof));
    await verifyActionProof(saved,input);const {signature,...unsigned}=saved;if(canonicalJson(unsigned)!==canonicalJson(input))throw new MandateError("ACTION_PROOF_FROZEN");return saved;
  }
  async export(scope:EvidenceScope,names:Partial<Record<Checkpoint["header"]["kind"],readonly string[]>>,discloseOnlyStep?:Hex):Promise<DisclosedCheckpoint[]>{
    const checked=await Promise.all(this.rows(scope).map(r=>this.checked(r,scope)));await verifyCheckpointChain(checked.map(p=>p.checkpoint),scope);
    return checked.map(({checkpoint,leaves})=>({checkpoint,disclosures:disclose(leaves,(discloseOnlyStep&&checkpoint.header.stepId!==discloseOnlyStep?[]:names[checkpoint.header.kind]??[]).filter(name=>leaves.some(l=>l.name===name)))}));
  }
  close(){this.db.close();}
}
