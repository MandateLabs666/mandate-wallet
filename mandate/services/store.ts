import {DatabaseSync} from "node:sqlite";
import {mkdirSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {randomUUID} from "node:crypto";
import {keccak256,toHex,parseTransaction,recoverTransactionAddress,type Hex,type Address} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
import type {PurchaseFailureDiagnostic} from "./diagnostics.js";
export type PurchaseRecord={
  key:string;requestHash:Hex;agentId:string;chainId:number;wallet:Address;mandateId:Hex;stepId:Hex;
  paymentState:"draft"|"registering"|"reserved"|"pending"|"paid"|"consumed_unknown"|"canceled"|"rejected"|"released";
  serviceState:"not_requested"|"returned"|"failed"|"unknown";resultState:"unchecked"|"valid"|"invalid";
  payment?:Record<string,string>;quote?:unknown;payload?:unknown;registrationSignature?:Hex;registrationHash?:Hex;registrationBlock?:string;settlementHash?:Hex;settlementBlockHash?:Hex;
  errorCode?:string;errorDiagnostic?:PurchaseFailureDiagnostic;result?:unknown;version:number;createdAt:string;updatedAt:string;
  rejectedPolicyVersion?:string;rejectedSessionId?:Hex;
  merchantReceipt?:unknown;receiptEvidence?:{status:"confirmed"|"incomplete"|"contradicted"|"unsupported";code?:string;correlation?:string;coversPaymentAmount:false;coversRequestBody:false;coversResultBody:false};
  preCheckpointRoot?:Hex;actionProof?:unknown;registrationBlockHash?:Hex;lastHttpStatus?:number;evidenceStatus?:"recorded"|"incomplete"|"legacy-no-precheckpoint";evidenceErrorCode?:string;
};
export function businessKey(chainId:number,wallet:Address,mandateId:Hex,stepId:Hex){return `${chainId}:${wallet.toLowerCase()}:${mandateId.toLowerCase()}:${stepId.toLowerCase()}`;}
export type Lease={key:string;owner:string;expiresAt:number};
export class PurchaseStore {
  readonly db:DatabaseSync;
  constructor(path:string) {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchases(key TEXT PRIMARY KEY,json TEXT NOT NULL,version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS leases(key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS signed_transactions(id TEXT PRIMARY KEY,chain_id INTEGER NOT NULL,sender TEXT NOT NULL,nonce INTEGER NOT NULL,intent_hash TEXT NOT NULL,raw TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,UNIQUE(chain_id,sender,nonce));
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT NOT NULL,event TEXT NOT NULL,json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen_quotes(key TEXT PRIMARY KEY,policy_version TEXT NOT NULL,quote_hash TEXT NOT NULL,request_hash TEXT NOT NULL);
    `);
  }
  get(key:string):PurchaseRecord|undefined {const row=this.db.prepare("SELECT json FROM purchases WHERE key=?").get(key) as {json:string}|undefined;return row?JSON.parse(row.json):undefined;}
  all(){return (this.db.prepare("SELECT json FROM purchases ORDER BY key").all() as {json:string}[]).map(r=>JSON.parse(r.json) as PurchaseRecord);}
  create(input:Omit<PurchaseRecord,"version"|"createdAt"|"updatedAt">):PurchaseRecord {
    if(input.key!==businessKey(input.chainId,input.wallet,input.mandateId,input.stepId))throw new MandateError("BUSINESS_KEY_CONTEXT_MISMATCH");
    const now=new Date().toISOString(),record={...input,version:0,createdAt:now,updatedAt:now};
    this.db.prepare("INSERT OR IGNORE INTO purchases VALUES(?,?,0)").run(record.key,canonicalJson(record));
    const stored=this.get(record.key)!;
    if(stored.requestHash!==input.requestHash)throw new MandateError("STEP_REQUEST_REUSE_MISMATCH");
    return stored;
  }
  claim(key:string,ttlMs=30000):Lease|undefined {
    if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000)throw new MandateError("LEASE_DURATION_INVALID");
    const owner=randomUUID(),now=Date.now(),expiresAt=now+ttlMs;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing=this.db.prepare("SELECT expires_at FROM leases WHERE key=?").get(key) as {expires_at:number}|undefined;
      if(existing && existing.expires_at>now){this.db.exec("COMMIT");return;}
      this.db.prepare("INSERT INTO leases VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at").run(key,owner,expiresAt);
      this.db.exec("COMMIT");return {key,owner,expiresAt};
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  save(record:PurchaseRecord,lease:Lease) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const held=this.db.prepare("SELECT owner,expires_at FROM leases WHERE key=?").get(record.key) as {owner:string;expires_at:number}|undefined;
      if(!held || lease.key!==record.key || held.owner!==lease.owner || held.expires_at<=Date.now())throw new MandateError("LEASE_LOST");
      const current=this.get(record.key);if(!current || current.version!==record.version)throw new MandateError("RECORD_VERSION_CHANGED");
      if(current.requestHash!==record.requestHash || current.agentId!==record.agentId || current.key!==businessKey(record.chainId,record.wallet,record.mandateId,record.stepId))throw new MandateError("PURCHASE_IDENTITY_CHANGED");
      if(current.payment && (!record.payment || canonicalJson(current.payment)!==canonicalJson(record.payment)))throw new MandateError("PAYMENT_PARAMETERS_FROZEN");
      if(current.payload && (!record.payload || canonicalJson(current.payload)!==canonicalJson(record.payload)))throw new MandateError("PAYMENT_SIGNATURE_FROZEN");
      if(current.preCheckpointRoot&&current.preCheckpointRoot!==record.preCheckpointRoot)throw new MandateError("PRE_CHECKPOINT_FROZEN");
      if(current.actionProof&&canonicalJson(current.actionProof)!==canonicalJson(record.actionProof))throw new MandateError("ACTION_PROOF_FROZEN");
      const next={...record,version:record.version+1,updatedAt:new Date().toISOString()},json=canonicalJson(next);
      this.db.prepare("UPDATE purchases SET json=?,version=? WHERE key=?").run(json,next.version,record.key);
      this.db.prepare("INSERT INTO audit(key,event,json,created_at) VALUES(?,?,?,?)").run(record.key,"state",canonicalJson({payment:record.paymentState,service:record.serviceState,result:record.resultState,version:next.version,error:record.errorCode??null}),next.updatedAt);
      this.db.exec("COMMIT");
      record.version=next.version;record.updatedAt=next.updatedAt;
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  release(lease:Lease){this.db.prepare("DELETE FROM leases WHERE key=? AND owner=?").run(lease.key,lease.owner);}
  renew(lease:Lease,ttlMs=120000){const now=Date.now(),result=this.db.prepare("UPDATE leases SET expires_at=? WHERE key=? AND owner=? AND expires_at>?").run(now+ttlMs,lease.key,lease.owner,now);if(result.changes!==1)throw new MandateError("LEASE_LOST");lease.expiresAt=now+ttlMs;}
  transactionRows(){return (this.db.prepare("SELECT id FROM signed_transactions ORDER BY id").all() as {id:string}[]).map(r=>this.transaction(r.id)!);}
  pinQuote(key:string,policyVersion:bigint,quoteHash:Hex,requestHash:Hex) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const seen=this.db.prepare("SELECT * FROM seen_quotes WHERE key=?").get(key) as {policy_version:string;quote_hash:Hex;request_hash:Hex}|undefined;
      if(seen&&BigInt(seen.policy_version)>policyVersion)throw new MandateError("QUOTE_POLICY_VERSION_STALE");
      if(seen&&seen.policy_version===policyVersion.toString()&&(seen.quote_hash!==quoteHash||seen.request_hash!==requestHash))throw new MandateError("QUOTE_CHANGED_APPROVAL_REQUIRED");
      this.db.prepare("INSERT INTO seen_quotes VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET policy_version=excluded.policy_version,quote_hash=excluded.quote_hash,request_hash=excluded.request_hash").run(key,policyVersion.toString(),quoteHash,requestHash);
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  async reserveTransaction(input:{id:string;chainId:number;sender:Address;nonce:number;intentHash:Hex;raw:Hex;hash:Hex}) {
    if(keccak256(input.raw)!==input.hash)throw new MandateError("TRANSACTION_HASH_MISMATCH");
    if(!input.raw.startsWith("0x02"))throw new MandateError("SIGNED_TRANSACTION_TYPE_UNSUPPORTED");
    const parsed=parseTransaction(input.raw),signer=await recoverTransactionAddress({serializedTransaction:input.raw as `0x02${string}`});
    if(parsed.chainId!==input.chainId || parsed.nonce!==input.nonce || signer.toLowerCase()!==input.sender.toLowerCase())throw new MandateError("SIGNED_TRANSACTION_CONTEXT_MISMATCH");
    const existing=this.transaction(input.id);
    if(existing){if(existing.intentHash!==input.intentHash || existing.hash!==input.hash)throw new MandateError("SIGNED_TRANSACTION_FROZEN");return existing;}
    try{this.db.prepare("INSERT INTO signed_transactions VALUES(?,?,?,?,?,?,?,?)").run(input.id,input.chainId,input.sender.toLowerCase(),input.nonce,input.intentHash,input.raw,input.hash,"prepared");}
    catch{throw new MandateError("SIGNER_NONCE_ALREADY_RESERVED");}
    return this.transaction(input.id)!;
  }
  transaction(id:string){const row=this.db.prepare("SELECT * FROM signed_transactions WHERE id=?").get(id) as {id:string;chain_id:number;sender:Address;nonce:number;intent_hash:Hex;raw:Hex;hash:Hex;status:string}|undefined;return row?{id:row.id,chainId:row.chain_id,sender:row.sender,nonce:row.nonce,intentHash:row.intent_hash,raw:row.raw,hash:row.hash,status:row.status}:undefined;}
  transactionStatus(id:string,status:"broadcast"|"confirmed"|"reverted"){this.db.prepare("UPDATE signed_transactions SET status=? WHERE id=?").run(status,id);}
  exportPublic(){return {schemaVersion:2,records:this.all().map(({payload,quote,result,registrationSignature,...record})=>({...record,payloadDigest:payload?keccak256(toHex(canonicalJson(payload))):undefined,quoteDigest:quote?keccak256(toHex(canonicalJson(quote))):undefined,resultDigest:result?keccak256(toHex(canonicalJson(result))):undefined})),transactions:this.db.prepare("SELECT id,chain_id,sender,nonce,intent_hash,hash,status FROM signed_transactions ORDER BY id").all()};}
  close(){this.db.close();}
}
