import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import type { Hex } from 'viem';
import { M1Error, canonical } from './model.js';

export type RecordState = {
  key:string; nonce:Hex; digest:Hex; mandateId:Hex; stepId:Hex; chainId:number; wallet:Hex; asset:Hex;
  url:string; requestHash:Hex; quoteHash:Hex; requirements:PaymentRequirements;
  payload:PaymentPayload; proof:unknown; registrationTx?:Hex; settlementTx?:Hex; settlementBlockHash?:Hex;
  paymentState:'registering'|'reserved'|'pending'|'settled'|'rejected'|'released';
  serviceState:'not_requested'|'returned'|'failed'|'unknown'; resultState:'unchecked'|'valid'|'invalid';
  result?:unknown; errorCode?:string;
};
export class PaymentStore {
  private db:DatabaseSync;
  private closed=false;
  constructor(path:string) {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db = new DatabaseSync(path); chmodSync(path,0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS payments (key TEXT PRIMARY KEY, json TEXT NOT NULL);');
  }
  get(key:string):RecordState|undefined { const row = this.db.prepare('SELECT json FROM payments WHERE key=?').get(key) as {json:string}|undefined; return row ? JSON.parse(row.json):undefined; }
  insert(record:RecordState):boolean { return this.db.prepare('INSERT OR IGNORE INTO payments(key,json) VALUES (?,?)').run(record.key,canonical(record)).changes === 1; }
  completeRegistration(record:RecordState):void {
    const previous=this.get(record.key);
    if(!previous||previous.paymentState!=='registering'||previous.digest!==record.digest||previous.nonce!==record.nonce) throw new M1Error('REGISTRATION_STATE_CONFLICT');
    const oldAuth=previous.payload.payload.authorization;
    if(canonical(oldAuth)!==canonical(record.payload.payload.authorization)||canonical(previous.payload.accepted)!==canonical(record.payload.accepted)) throw new M1Error('PAYMENT_IMMUTABLE');
    this.db.prepare('UPDATE payments SET json=? WHERE key=?').run(canonical(record),record.key);
  }
  save(record:RecordState, allowReorg=false):void {
    const previous = this.get(record.key);
    if (!previous) throw new M1Error('RECORD_MISSING');
    if (previous.digest !== record.digest || previous.nonce !== record.nonce || canonical(previous.payload) !== canonical(record.payload)) throw new M1Error('PAYMENT_IMMUTABLE');
    if (previous.paymentState === 'settled' && record.paymentState !== 'settled' && !allowReorg) throw new M1Error('SETTLEMENT_DOWNGRADE');
    this.db.prepare('UPDATE payments SET json=? WHERE key=?').run(canonical(record),record.key);
  }
  all():RecordState[] { return (this.db.prepare('SELECT json FROM payments ORDER BY key').all() as {json:string}[]).map(r=>JSON.parse(r.json)); }
  close():void { if(!this.closed){this.db.close();this.closed=true;} }
}
