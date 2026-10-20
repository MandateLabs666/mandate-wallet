import {DatabaseSync} from "node:sqlite";
import {mkdirSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {keccak256,toHex,recoverTypedDataAddress,isAddressEqual,type LocalAccount,type Hex,type Address} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
import {CheckpointSchema,verifyCheckpoint,evidenceScopeKey,ZERO_ROOT,type Checkpoint,type EvidenceScope} from "./checkpoint.js";
import {ControllerRequestSchema,EnvelopeSchema,envelopeHash,requestData,statementData,verifyEnvelope,type Envelope,type ControllerRequest,type ControllerStatement} from "./controller-model.js";
export class SessionController {
  readonly db:DatabaseSync;readonly envelope:Envelope;readonly hash:Hex;
  static async create(path:string,input:unknown,signer:Pick<LocalAccount,"address"|"signTypedData">,query:(stepId:Hex)=>Promise<unknown>,trusted:{owner:Address;scope:EvidenceScope},clock=()=>Math.floor(Date.now()/1000)){const envelope=await verifyEnvelope(input,trusted.owner,trusted.scope);return new SessionController(path,envelope,signer,query,clock);}
  private constructor(path:string,envelope:Envelope,readonly signer:Pick<LocalAccount,"address"|"signTypedData">,readonly query:(stepId:Hex)=>Promise<unknown>,readonly clock=()=>Math.floor(Date.now()/1000)){
    this.envelope=EnvelopeSchema.parse(envelope);this.hash=envelopeHash(this.envelope);
    if([envelope.owner,envelope.payload.scope.signer].some(a=>isAddressEqual(a,signer.address)))throw new MandateError("CONTROLLER_SIGNER_ROLE_COLLISION");
    mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);chmodSync(path,0o600);this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS controller_requests(envelope TEXT,request_id TEXT,digest TEXT,step_id TEXT,state TEXT,response TEXT,PRIMARY KEY(envelope,request_id)); CREATE TABLE IF NOT EXISTS controller_anchors(envelope TEXT,sequence INTEGER,root TEXT,checkpoint TEXT,statement TEXT,PRIMARY KEY(envelope,sequence)); CREATE TABLE IF NOT EXISTS controller_decisions(id INTEGER PRIMARY KEY AUTOINCREMENT,envelope TEXT,statement TEXT)");
  }
  private async statement(requestId:Hex,kind:ControllerStatement["kind"],outcome:ControllerStatement["outcome"],code:string,details:Record<string,unknown>={}){
    const p={schemaVersion:2 as const,envelopeHash:this.hash,requestId,kind,outcome,code,observedAt:this.clock(),controller:this.signer.address,details},s={...p,signature:await this.signer.signTypedData(statementData(p,this.envelope.payload.scope))};
    this.db.prepare("INSERT INTO controller_decisions(envelope,statement) VALUES(?,?)").run(this.hash,canonicalJson(s));return s;
  }
  private async authenticate(input:unknown,kind:ControllerRequest["kind"],payload:unknown){
    const r=ControllerRequestSchema.parse(input),p=this.envelope.payload;
    if(r.kind!==kind||r.envelopeHash!==this.hash||r.payloadHash!==keccak256(toHex(canonicalJson(payload)))||!p.stepIds.includes(r.stepId))throw new MandateError("CONTROLLER_REQUEST_SCOPE_MISMATCH");
    if(!isAddressEqual(await recoverTypedDataAddress({...requestData(r,p.scope),signature:r.signature}),p.scope.signer))throw new MandateError("CONTROLLER_REQUEST_SIGNER_INVALID");return r;
  }
  async runQuery(input:unknown):Promise<{statement:ControllerStatement;result?:unknown}>{
    let r:ControllerRequest|undefined;
    try{
      r=await this.authenticate(input,"query",null);const {signature,...unsigned}=r,digest=keccak256(toHex(canonicalJson(unsigned))),row=this.db.prepare("SELECT * FROM controller_requests WHERE envelope=? AND request_id=?").get(this.hash,r.requestId) as {digest:string;state:string;response?:string}|undefined;
      if(row){if(row.digest!==digest)throw new MandateError("CONTROLLER_REPLAY_MISMATCH");return row.response?JSON.parse(row.response):{statement:await this.statement(r.requestId,"query","pending","ORIGINAL_QUERY_PENDING")};}
      const now=this.clock(),p=this.envelope.payload;if(now<p.startsAt||now>=p.expiresAt||Math.abs(now-r.issuedAt)>30)throw new MandateError("CONTROLLER_REQUEST_EXPIRED");
      this.db.exec("BEGIN IMMEDIATE");
      try{
        const duplicate=this.db.prepare("SELECT request_id FROM controller_requests WHERE envelope=? AND request_id=?").get(this.hash,r.requestId);
        if(duplicate){this.db.exec("ROLLBACK");return this.runQuery(input);}
        const count=this.db.prepare("SELECT COUNT(*) AS count FROM controller_requests WHERE envelope=? AND step_id=?").get(this.hash,r.stepId) as {count:number};if(count.count>=p.maxQueriesPerStep)throw new MandateError("CONTROLLER_QUERY_BUDGET_EXHAUSTED");
        this.db.prepare("INSERT INTO controller_requests VALUES(?,?,?,?,?,NULL)").run(this.hash,r.requestId,digest,r.stepId,"in-progress");this.db.exec("COMMIT");
      }catch(error){this.db.exec("ROLLBACK");throw error;}
      let result:unknown,status:"completed"|"failed"="completed",code="CONTROLLED_QUERY_COMPLETED";
      try{result=await this.query(r.stepId);if(Buffer.byteLength(canonicalJson(result))>65536)throw new Error("query result limit");}catch{status="failed";code="CONTROLLED_QUERY_FAILED";result=null;}
      const resultDigest=keccak256(toHex(canonicalJson(result))),statement=await this.statement(r.requestId,"query",status,code,{resultDigest,charged:true}),response={statement,result};
      this.db.prepare("UPDATE controller_requests SET state=?,response=? WHERE envelope=? AND request_id=?").run(status,canonicalJson(response),this.hash,r.requestId);return response;
    }catch(error){return {statement:await this.statement(r?.requestId??ZERO_ROOT,"query","rejected",error instanceof MandateError?error.code:"CONTROLLER_REQUEST_SCHEMA_OR_SIGNATURE_INVALID"),result:null};}
  }
  async anchor(input:unknown,checkpointInput:unknown){
    let r:ControllerRequest|undefined;
    try{
      r=await this.authenticate(input,"anchor",checkpointInput);const checkpoint=await verifyCheckpoint(checkpointInput,this.envelope.payload.scope.signer),h=checkpoint.header,p=this.envelope.payload;
      if(evidenceScopeKey(h)!==evidenceScopeKey(p.scope)||h.stepId!==r.stepId)throw new MandateError("CONTROLLER_CHECKPOINT_SCOPE_MISMATCH");
      if(BigInt(h.sequence)>=10000n)throw new MandateError("CONTROLLER_CHECKPOINT_COUNT_LIMIT");
      const existing=this.db.prepare("SELECT * FROM controller_anchors WHERE envelope=? AND sequence=?").get(this.hash,Number(h.sequence)) as {root:string;statement:string}|undefined;
      if(existing){if(existing.root!==checkpoint.root)throw new MandateError("CONTROLLER_CHECKPOINT_FORK");const now=this.clock();if(p.mode==="live"&&h.kind==="pre-payment"&&(now<p.startsAt||now>=p.expiresAt||now>p.startsAt+p.checkpointDeadlineSeconds))return {statement:await this.statement(r.requestId,"anchor","detected","PRE_CHECKPOINT_GATE_EXPIRED",{sequence:h.sequence,root:checkpoint.root,kind:h.kind,stepId:h.stepId,capturedAt:now,mode:p.mode})};return {statement:JSON.parse(existing.statement)};}
      const last=this.db.prepare("SELECT sequence,root FROM controller_anchors WHERE envelope=? ORDER BY sequence DESC LIMIT 1").get(this.hash) as {sequence:number;root:Hex}|undefined;
      if(Number(h.sequence)!==(last?.sequence??-1)+1||h.previousRoot!==(last?.root??ZERO_ROOT))throw new MandateError("CONTROLLER_CHECKPOINT_GAP");
      const now=this.clock();if(p.mode==="live"&&now<p.startsAt)throw new MandateError("CONTROLLER_ENVELOPE_NOT_STARTED");if(BigInt(h.observedAt)>BigInt(Number.MAX_SAFE_INTEGER)||Number(h.observedAt)>now+30)throw new MandateError("CONTROLLER_CHECKPOINT_FUTURE");
      if(p.mode==="live"&&Number(h.observedAt)<p.startsAt)throw new MandateError("CONTROLLER_CHECKPOINT_BEFORE_ENVELOPE");
      const late=now>=p.expiresAt||now>p.startsAt+p.checkpointDeadlineSeconds;
      const statement=await this.statement(r.requestId,"anchor",late?"detected":"allowed",late?"LATE_CHECKPOINT_STORED":"CHECKPOINT_STORED",{sequence:h.sequence,root:checkpoint.root,previousRoot:h.previousRoot,kind:h.kind,stepId:h.stepId,capturedAt:now,mode:p.mode});
      this.db.exec("BEGIN IMMEDIATE");try{const current=this.db.prepare("SELECT sequence FROM controller_anchors WHERE envelope=? ORDER BY sequence DESC LIMIT 1").get(this.hash) as {sequence:number}|undefined;if((current?.sequence??-1)!==(last?.sequence??-1))throw new MandateError("CONTROLLER_CHECKPOINT_APPEND_RACE");this.db.prepare("INSERT INTO controller_anchors VALUES(?,?,?,?,?)").run(this.hash,Number(h.sequence),checkpoint.root,canonicalJson(checkpoint),canonicalJson(statement));this.db.exec("COMMIT");}catch(error){this.db.exec("ROLLBACK");throw error;}
      return {statement};
    }catch(error){return {statement:await this.statement(r?.requestId??ZERO_ROOT,"anchor","rejected",error instanceof MandateError?error.code:"CONTROLLER_CHECKPOINT_INVALID")};}
  }
  async inspect(){
    const p=this.envelope.payload,now=this.clock(),rows=this.db.prepare("SELECT checkpoint FROM controller_anchors WHERE envelope=? ORDER BY sequence").all(this.hash) as {checkpoint:string}[],checkpoints=rows.map(r=>CheckpointSchema.parse(JSON.parse(r.checkpoint))),alerts:ControllerStatement[]=[];
    if(now>Math.min(p.expiresAt,p.startsAt+p.checkpointDeadlineSeconds))for(const stepId of p.stepIds)for(const kind of p.expectedKinds)if(!checkpoints.some(c=>c.header.stepId===stepId&&c.header.kind===kind)){const id=keccak256(toHex("missing:"+stepId+":"+kind));const old=(this.db.prepare("SELECT statement FROM controller_decisions WHERE envelope=?").all(this.hash) as {statement:string}[]).map(r=>JSON.parse(r.statement)).find(s=>s.requestId===id);alerts.push(old??await this.statement(id,"alert","detected","EXPECTED_CHECKPOINT_MISSING",{stepId,kind,deadline:Math.min(p.expiresAt,p.startsAt+p.checkpointDeadlineSeconds),meaning:"missing expected checkpoint; cause and intent unknown"}));}
    return {schemaVersion:2,envelopeHash:this.hash,scope:p.scope,mode:p.mode,now,anchors:checkpoints.map(c=>({sequence:c.header.sequence,root:c.root,stepId:c.header.stepId,kind:c.header.kind})),queries:this.db.prepare("SELECT step_id,COUNT(*) AS charged FROM controller_requests WHERE envelope=? GROUP BY step_id").all(this.hash),alerts};
  }
  exportAnchors(){return (this.db.prepare("SELECT checkpoint,statement FROM controller_anchors WHERE envelope=? ORDER BY sequence").all(this.hash) as {checkpoint:string;statement:string}[]).map(r=>({checkpoint:JSON.parse(r.checkpoint) as Checkpoint,statement:JSON.parse(r.statement) as ControllerStatement}));}
  close(){this.db.close();}
}
