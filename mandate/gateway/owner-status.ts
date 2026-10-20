import {decodeFunctionData,parseTransaction,recoverTransactionAddress,keccak256,parseEventLogs,isAddressEqual,TransactionNotFoundError,TransactionReceiptNotFoundError,type Hex} from "viem";
import {MandateReader} from "../sdk/reader.js";
import {draftOwnerAction} from "../sdk/owner.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {canonicalJson,MandateError} from "../sdk/model.js";
import {PurchaseStore} from "../services/store.js";
import {canonicalReceipt} from "../services/transactions.js";
type Draft=ReturnType<typeof draftOwnerAction>;
export type OwnerRequest={requestId:Hex;actionId:Hex;draft:Draft;mandateId:Hex;sessionId:Hex;requestedBy:string;createdBlock:string;minimumOwnerNonce:number;version:number;status:"draft"|"signed"|"broadcast"|"confirmed"|"failed"|"pending";broadcastSource?:"external-wallet";transactionHash?:Hex;transactionNonce?:number;blockHash?:Hex;blockNumber?:string;actionApplied:boolean;chainActive:boolean;rootStatus:string;grantStatus:string};
const events:Record<string,string>={createMandate:"PolicyChanged",replacePolicy:"PolicyChanged",setPaused:"PauseChanged",revokeMandate:"MandateRevoked",grantSession:"SessionGranted",revokeSession:"SessionRevoked"};
const actions:Record<string,string>={createMandate:"create",replacePolicy:"replace",setPaused:"pause",revokeMandate:"revoke",grantSession:"grant",revokeSession:"revokeSession"};
const json=(value:unknown)=>canonicalJson(JSON.parse(JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v)));
export class OwnerStatus {
  constructor(readonly reader:MandateReader,readonly store:PurchaseStore,readonly confirmations=2){store.db.exec("CREATE TABLE IF NOT EXISTS owner_requests(id TEXT PRIMARY KEY,json TEXT NOT NULL,version INTEGER NOT NULL)");}
  get(id:Hex):OwnerRequest|undefined{const row=this.store.db.prepare("SELECT json FROM owner_requests WHERE id=?").get(id) as {json:string}|undefined;return row?JSON.parse(row.json):undefined;}
  private save(record:OwnerRequest){const next={...record,version:record.version+1},changed=this.store.db.prepare("UPDATE owner_requests SET json=?,version=? WHERE id=? AND version=?").run(json(next),next.version,record.requestId,record.version);if(changed.changes!==1)throw new MandateError("OWNER_REQUEST_VERSION_CHANGED");record.version=next.version;}
  private scoped(id:Hex){const record=this.get(id);if(!record||record.draft.transaction.chainId!==this.reader.chainId||!isAddressEqual(record.draft.transaction.to,this.reader.wallet))throw new MandateError("OWNER_REQUEST_SCOPE_MISMATCH");return record;}
  // Re-read the frozen intent after a competing observer commits. These methods
  // only observe/store an existing transaction; retrying never signs/broadcasts.
  private async consistent<T>(observe:()=>Promise<T>):Promise<T>{
    for(let attempt=0;attempt<8;attempt++){
      try{return await observe();}
      catch(error){if(!(error instanceof MandateError&&error.code==="OWNER_REQUEST_VERSION_CHANGED")||attempt===7)throw error;}
    }
    throw new MandateError("OWNER_REQUEST_VERSION_CHANGED");
  }
  async create(draft:Draft,scope:{mandateId:Hex;sessionId:Hex;requestedBy:string}) {
    await this.reader.verifyContext();
    const owner=await this.reader.pc.readContract({address:this.reader.wallet,abi:accountAbi,functionName:"owner"}),decoded=decodeFunctionData({abi:accountAbi,data:draft.transaction.data});
    if(draft.schemaVersion!==2||draft.approvalRequired!=="owner-wallet"||draft.action!==actions[decoded.functionName]||draft.transaction.chainId!==this.reader.chainId||!isAddressEqual(draft.transaction.from,owner)||!isAddressEqual(draft.transaction.to,this.reader.wallet)||draft.transaction.value!=="0"||!Object.hasOwn(events,decoded.functionName)||decoded.args?.[0]!==scope.mandateId)throw new MandateError("OWNER_DRAFT_CONTEXT_MISMATCH");
    if(["grantSession","revokeSession"].includes(decoded.functionName)&&decoded.args?.[1]!==scope.sessionId)throw new MandateError("OWNER_DRAFT_SESSION_MISMATCH");
    if(draft.actionId!==keccak256(new TextEncoder().encode(canonicalJson(draft.transaction))))throw new MandateError("OWNER_DRAFT_ID_MISMATCH");
    const [block,minimumOwnerNonce]=await Promise.all([this.reader.pc.getBlockNumber({cacheTime:0}),this.reader.pc.getTransactionCount({address:owner,blockTag:"latest"})]);
    const requestId=keccak256(new TextEncoder().encode(canonicalJson({actionId:draft.actionId,chainId:this.reader.chainId,wallet:this.reader.wallet.toLowerCase(),sessionId:scope.sessionId.toLowerCase(),minimumOwnerNonce})));
    const record:OwnerRequest={requestId,actionId:draft.actionId,draft,...scope,createdBlock:block.toString(),minimumOwnerNonce,version:0,status:"draft",actionApplied:false,chainActive:false,rootStatus:"unobserved",grantStatus:"unobserved"};
    this.store.db.prepare("INSERT OR IGNORE INTO owner_requests VALUES(?,?,0)").run(record.requestId,json(record));
    const stored=this.scoped(record.requestId);if(json(stored.draft)!==json(draft)||stored.mandateId!==scope.mandateId||stored.sessionId!==scope.sessionId)throw new MandateError("OWNER_REQUEST_IDENTITY_CHANGED");return this.reconcile(stored.requestId);
  }
  // Trusted owner UI/SDK only. No MCP tool accepts raw owner transactions or invokes this method.
  async noteSigned(id:Hex,raw:Hex) {
    return this.consistent(()=>this.noteSignedOnce(id,raw));
  }
  private async noteSignedOnce(id:Hex,raw:Hex) {
    const record=this.scoped(id),tx=parseTransaction(raw),owner=record.draft.transaction.from;
    if(!raw.startsWith("0x02"))throw new MandateError("SIGNED_OWNER_TRANSACTION_TYPE_UNSUPPORTED");
    const sender=await recoverTransactionAddress({serializedTransaction:raw as `0x02${string}`});
    if(!isAddressEqual(sender,owner)||tx.chainId!==this.reader.chainId||!tx.to||!isAddressEqual(tx.to,this.reader.wallet)||tx.data!==record.draft.transaction.data||(tx.value??0n)!==0n||tx.nonce===undefined||tx.nonce<record.minimumOwnerNonce)throw new MandateError("OWNER_SIGNED_INTENT_MISMATCH");
    const hash=keccak256(raw);if(record.transactionHash&&record.transactionHash!==hash)throw new MandateError("OWNER_SIGNED_TRANSACTION_FROZEN");
    if(!record.transactionHash){record.transactionHash=hash;record.transactionNonce=tx.nonce;record.status="signed";this.save(record);}
    return record;
  }
  // External wallets commonly sign and broadcast without exposing a raw tx.
  // This records their hash, never signs, and never broadcasts on their behalf.
  async noteBroadcast(id:Hex,hash:Hex) {
    return this.consistent(()=>this.noteBroadcastOnce(id,hash));
  }
  private async noteBroadcastOnce(id:Hex,hash:Hex) {
    if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new MandateError("OWNER_TRANSACTION_HASH_INVALID");
    const record=this.scoped(id);
    if(record.transactionHash&&record.transactionHash.toLowerCase()!==hash.toLowerCase())throw new MandateError("OWNER_SIGNED_TRANSACTION_FROZEN");
    try{const tx=await this.reader.pc.getTransaction({hash});this.checkBroadcastIntent(record,tx);record.transactionNonce=tx.nonce;}catch(error){if(!(error instanceof TransactionNotFoundError))throw error;}
    if(!record.transactionHash){record.transactionHash=hash;record.broadcastSource="external-wallet";record.status="pending";this.save(record);}
    return this.reconcile(id);
  }
  private checkBroadcastIntent(record:OwnerRequest,tx:{from:`0x${string}`;to:`0x${string}`|null;input:Hex;value:bigint;nonce:number;chainId?:number}){
    if(!isAddressEqual(tx.from,record.draft.transaction.from)||!tx.to||!isAddressEqual(tx.to,this.reader.wallet)||tx.input!==record.draft.transaction.data||tx.value!==0n||tx.nonce<record.minimumOwnerNonce||(record.transactionNonce!==undefined&&tx.nonce!==record.transactionNonce)||tx.chainId!==this.reader.chainId)throw new MandateError("OWNER_CHAIN_TRANSACTION_MISMATCH");
  }
  async reconcile(id:Hex) {
    return this.consistent(()=>this.reconcileOnce(id));
  }
  private async reconcileOnce(id:Hex) {
    const record=this.scoped(id),pc=this.reader.pc;
    record.actionApplied=false;
    if(record.transactionHash) {
      let tx;try{tx=await pc.getTransaction({hash:record.transactionHash});}catch(error){if(!(error instanceof TransactionNotFoundError))throw error;}
      if(!tx){record.status=record.broadcastSource==="external-wallet"?"pending":"signed";delete record.blockHash;delete record.blockNumber;}
      else {
        this.checkBroadcastIntent(record,tx);record.transactionNonce=tx.nonce;
        let receipt;try{receipt=await pc.getTransactionReceipt({hash:record.transactionHash});}catch(error){if(!(error instanceof TransactionReceiptNotFoundError))throw error;}
        record.status="broadcast";
        if(receipt) {
          try{receipt=await canonicalReceipt(pc,receipt,this.confirmations);}catch(error){if(!(error instanceof MandateError&&error.code==="TRANSACTION_CONFIRMATION_PENDING"))throw error;record.status="pending";receipt=undefined;}
          if(receipt) {
            if(receipt.blockNumber<BigInt(record.createdBlock))throw new MandateError("OWNER_TRANSACTION_PREDATES_REQUEST");
            record.status=receipt.status==="success"?"confirmed":"failed";record.blockHash=receipt.blockHash;record.blockNumber=receipt.blockNumber.toString();
            if(receipt.status==="success") {
              const fn=decodeFunctionData({abi:accountAbi,data:record.draft.transaction.data}).functionName;
              const logs=parseEventLogs({abi:accountAbi,logs:receipt.logs.filter(l=>isAddressEqual(l.address,this.reader.wallet))});
              const matches=logs.filter(l=>l.eventName===events[fn]&&"mandateId" in l.args&&l.args.mandateId===record.mandateId&&(!["grantSession","revokeSession"].includes(fn)||("sessionId" in l.args&&l.args.sessionId===record.sessionId)));
              if(matches.length!==1)throw new MandateError("OWNER_EFFECT_EVENT_MISSING");record.actionApplied=true;
            }
          }
        }
      }
    }
    const {policy,session}=await this.reader.readBudget(record.mandateId,record.sessionId),now=(await pc.getBlock()).timestamp;
    record.rootStatus=!policy.exists?"missing":policy.revoked?"revoked":policy.paused?"paused":now>=policy.expiresAt?"expired":"active";
    record.grantStatus=!session.exists?"missing":session.revoked?"revoked":session.policyVersion!==policy.version?"stale":now>=session.expiresAt?"expired":"active";
    record.chainActive=record.rootStatus==="active"&&record.grantStatus==="active";this.save(record);return record;
  }
  async list(mandateId:Hex,sessionId?:Hex) {
    const records=(this.store.db.prepare("SELECT json FROM owner_requests ORDER BY id").all() as {json:string}[]).map(r=>JSON.parse(r.json) as OwnerRequest).filter(r=>r.mandateId===mandateId&&(!sessionId||r.sessionId===sessionId)&&r.draft.transaction.chainId===this.reader.chainId&&isAddressEqual(r.draft.transaction.to,this.reader.wallet));
    return Promise.all(records.map(r=>this.reconcile(r.requestId)));
  }
}
