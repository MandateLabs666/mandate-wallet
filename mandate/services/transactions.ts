import {keccak256,toHex,parseTransaction,TransactionReceiptNotFoundError,TransactionNotFoundError,type Address,type Hex,type PublicClient,type WalletClient,type Transport,type Chain,type LocalAccount,type TransactionReceipt} from "viem";
import {PurchaseStore} from "./store.js";
import {canonicalJson,MandateError} from "../sdk/model.js";
const transientNames=new Set(["HttpRequestError","TimeoutError","WaitForTransactionReceiptTimeoutError","SocketClosedError","WebSocketRequestError","TransactionReceiptNotFoundError","TransactionNotFoundError","BlockNotFoundError"]);
export function transientReceiptError(error:unknown) {
  const seen=new Set<unknown>();
  for(let cause:any=error;cause&&typeof cause==="object"&&!seen.has(cause);cause=cause.cause){
    seen.add(cause);
    if(cause.name==="HttpRequestError"){if(cause.status===undefined||cause.status===408||cause.status===429||cause.status>=500)return true;}
    else if(transientNames.has(cause.name))return true;
    if(cause.name==="RpcRequestError"&&[-32005,-32016,-32603].includes(cause.code))return true;
  }
  return false;
}
function confirmationPending(cause?:unknown){return Object.assign(new MandateError("TRANSACTION_CONFIRMATION_PENDING"),cause===undefined?{}:{cause});}
export async function canonicalReceipt(pc:PublicClient,initial:TransactionReceipt,confirmations:number) {
  if(!Number.isSafeInteger(confirmations)||confirmations<1||confirmations>64)throw new MandateError("INVALID_CONFIRMATIONS");
  let receipt=initial,transientFailures=0;
  for(let attempt=0;attempt<20;attempt++) {
    try {
      if(attempt>0)receipt=await pc.getTransactionReceipt({hash:initial.transactionHash});
      const [block,tip]=await Promise.all([pc.getBlock({blockNumber:receipt.blockNumber}),pc.getBlockNumber({cacheTime:0})]);
      transientFailures=0;
      if(!/^0x0+$/.test(receipt.blockHash)&&block.hash===receipt.blockHash&&tip>=receipt.blockNumber+BigInt(confirmations-1))return receipt;
    }catch(error){if(!transientReceiptError(error))throw error;if(++transientFailures>=3)throw confirmationPending(error);}
    if(attempt===19)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
    // Some public endpoints temporarily return a receipt with an unset block hash.
    // Keep querying this exact signed transaction; never derive a replacement nonce.
  }
  throw confirmationPending();
}
export class DurableTransactions {
  constructor(readonly pc:PublicClient,readonly wc:WalletClient<Transport,Chain,LocalAccount>,readonly store:PurchaseStore,readonly feeReservationCap=10n**15n,readonly confirmations=2) {}
  intent(to:Address,data:Hex){return keccak256(toHex(canonicalJson({chainId:this.wc.chain.id,sender:this.wc.account.address.toLowerCase(),to:to.toLowerCase(),data})));}
  async prepare(id:string,to:Address,data:Hex) {
    if(![31337,11155111,84532].includes(this.wc.chain.id) || await this.pc.getChainId()!==this.wc.chain.id)throw new MandateError("WRITE_NETWORK_UNSUPPORTED");
    const intentHash=this.intent(to,data),existing=this.store.transaction(id);
    if(existing){const p=parseTransaction(existing.raw);if(existing.intentHash!==intentHash || p.to?.toLowerCase()!==to.toLowerCase() || p.data!==data || (p.value??0n)!==0n)throw new MandateError("TRANSACTION_INTENT_CHANGED");return existing;}
    const request=await this.wc.prepareTransactionRequest({to,data,value:0n,type:"eip1559"});
    if(request.gas===undefined || request.maxFeePerGas===undefined)throw new MandateError("GAS_FEE_MISSING");
    const reserved=this.store.transactionRows().filter(r=>r.chainId===this.wc.chain.id).reduce((sum,r)=>{const tx=parseTransaction(r.raw);return sum+(tx.gas??0n)*(tx.maxFeePerGas??0n);},0n);
    if(reserved+request.gas*request.maxFeePerGas>this.feeReservationCap)throw new MandateError("EVM_FEE_RESERVATION_CAP_EXCEEDED");
    const raw=await this.wc.account.signTransaction(request);
    return this.store.reserveTransaction({id,chainId:this.wc.chain.id,sender:this.wc.account.address,nonce:request.nonce,intentHash,raw,hash:keccak256(raw)});
  }
  async send(id:string,beforeBroadcast?:()=>void) {
    const row=this.store.transaction(id);if(!row)throw new MandateError("SIGNED_TRANSACTION_MISSING");
    if(row.chainId!==await this.pc.getChainId() || row.sender.toLowerCase()!==this.wc.account.address.toLowerCase())throw new MandateError("TRANSACTION_CONTEXT_CHANGED");
    let receipt;
    try{receipt=await this.pc.getTransactionReceipt({hash:row.hash});}catch(e){if(!(e instanceof TransactionReceiptNotFoundError))throw e;}
    if(!receipt) {
      if(await this.pc.getTransactionCount({address:row.sender,blockTag:"latest"})>row.nonce)throw new MandateError("ORIGINAL_TRANSACTION_NEEDS_RECONCILIATION");
      beforeBroadcast?.();
      try{await this.wc.sendRawTransaction({serializedTransaction:row.raw});}catch(error){
        try{await this.pc.getTransaction({hash:row.hash});}catch(lookup){if(lookup instanceof TransactionNotFoundError)throw error;throw lookup;}
      }
      this.store.transactionStatus(id,"broadcast");
      try{receipt=await this.pc.waitForTransactionReceipt({hash:row.hash,confirmations:this.confirmations,timeout:30000});}
      catch(error){
        if(!transientReceiptError(error))throw error;
        // A failed receipt subscription does not mean the broadcast failed.
        // Look up the persisted hash; never prepare or broadcast a replacement.
        try{receipt=await this.pc.getTransactionReceipt({hash:row.hash});}
        catch(lookup){if(!transientReceiptError(lookup))throw lookup;throw confirmationPending(lookup);}
      }
    }
    receipt=await canonicalReceipt(this.pc,receipt,this.confirmations);
    this.store.transactionStatus(id,receipt.status==="success"?"confirmed":"reverted");return receipt;
  }
}
