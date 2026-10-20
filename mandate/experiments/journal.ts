import {readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {keccak256,recoverTransactionAddress,parseTransaction,TransactionReceiptNotFoundError,TransactionNotFoundError,type Address,type Hex,type PublicClient,type WalletClient,type Transport,type Chain,type LocalAccount} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
export type TransactionContext={pc:PublicClient;wc:WalletClient<Transport,Chain,LocalAccount>};
export type TransactionIntent={to?:Address;data:Hex;gas?:bigint};
type Row={id:string;intentHash:Hex;chainId:number;sender:Address;nonce:number;raw:Hex;hash:Hex;gas:string;feeCap:string;receipt?:unknown;headerObservations?:unknown[]};
// One caller owns the enclosing workflow lock. Raw transactions are private, persisted before send.
export class M3Journal {
  private rows:Row[];
  constructor(readonly path:string,readonly cap:bigint) {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    try{this.rows=JSON.parse(readFileSync(path,"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;this.rows=[];}
  }
  private flush(){const temp=this.path+".tmp";writeFileSync(temp,JSON.stringify(this.rows,(_,v)=>typeof v==="bigint"?v.toString():v),{mode:0o600});renameSync(temp,this.path);}
  async send(id:string,c:TransactionContext,intent:TransactionIntent,status:"success"|"reverted"="success") {
    const chainId=await c.pc.getChainId();
    if(![31337,11155111,84532].includes(chainId) || chainId!==c.wc.chain.id)throw new MandateError("WRITE_NETWORK_UNSUPPORTED");
    const intentHash=keccak256(new TextEncoder().encode(canonicalJson({chainId,sender:c.wc.account.address.toLowerCase(),to:intent.to?.toLowerCase()??null,data:intent.data,gas:intent.gas?.toString()??null,status})));
    let row=this.rows.find(r=>r.id===id);
    if(row && row.intentHash!==intentHash)throw new MandateError("TRANSACTION_INTENT_CHANGED");
    if(!row) {
      const request=await c.wc.prepareTransactionRequest({...intent,value:0n,type:"eip1559"});
      if(request.gas===undefined || request.maxFeePerGas===undefined)throw new MandateError("GAS_FEE_MISSING");
      const maximum=request.gas*request.maxFeePerGas;
      if(this.rows.reduce((sum,r)=>sum+BigInt(r.gas)*BigInt(r.feeCap),maximum)>this.cap)throw new MandateError("NATIVE_RESERVATION_CAP_EXCEEDED");
      if(this.rows.some(r=>r.chainId===chainId && r.sender.toLowerCase()===c.wc.account.address.toLowerCase() && r.nonce===request.nonce))throw new MandateError("NONCE_RESERVED_BY_ANOTHER_INTENT");
      const raw=await c.wc.account.signTransaction(request);
      row={id,intentHash,chainId,sender:c.wc.account.address,nonce:request.nonce,raw,hash:keccak256(raw),gas:request.gas.toString(),feeCap:request.maxFeePerGas.toString()};
      this.rows.push(row);this.flush();
    }
    if(!row.raw.startsWith("0x02"))throw new MandateError("JOURNAL_TRANSACTION_TYPE_CHANGED");
    const parsed=parseTransaction(row.raw);
    if(keccak256(row.raw)!==row.hash || (await recoverTransactionAddress({serializedTransaction:row.raw as `0x02${string}`})).toLowerCase()!==row.sender.toLowerCase() || parsed.chainId!==row.chainId || parsed.nonce!==row.nonce || parsed.data!==intent.data || parsed.to?.toLowerCase()!==intent.to?.toLowerCase() || (parsed.value??0n)!==0n || parsed.gas!==BigInt(row.gas) || parsed.maxFeePerGas!==BigInt(row.feeCap))throw new MandateError("JOURNAL_SIGNATURE_CONTEXT_CORRUPT");
    let receipt;
    try{receipt=await c.pc.getTransactionReceipt({hash:row.hash});}catch(e){if(!(e instanceof TransactionReceiptNotFoundError))throw e;}
    if(!receipt) {
      const latest=await c.pc.getTransactionCount({address:row.sender,blockTag:"latest"});
      if(latest>row.nonce)throw new MandateError("RECONCILE_ORIGINAL_TRANSACTION_FIRST");
      try{await c.wc.sendRawTransaction({serializedTransaction:row.raw});}catch(error){
        try{await c.pc.getTransaction({hash:row.hash});}catch(lookup){if(lookup instanceof TransactionNotFoundError)throw error;throw lookup;}
      }
      receipt=await c.pc.waitForTransactionReceipt({hash:row.hash,confirmations:chainId===31337?1:2,timeout:90000});
    }
    if(chainId!==31337 && (await c.pc.getBlockNumber({cacheTime:0}))<receipt.blockNumber+1n)
      receipt=await c.pc.waitForTransactionReceipt({hash:row.hash,confirmations:2,timeout:90000});
    let canonical=false;
    for(let attempt=0;attempt<20;attempt++) {
      const block=await c.pc.getBlock({blockNumber:receipt.blockNumber});
      const tip=await c.pc.getBlockNumber({cacheTime:0});
      if(!/^0x0+$/.test(receipt.blockHash) && block.hash===receipt.blockHash && tip>=receipt.blockNumber+(chainId===31337?0n:1n)){canonical=true;break;}
      (row.headerObservations??=[]).push({recordedAt:new Date().toISOString(),receiptBlock:receipt.blockNumber.toString(),receiptHash:receipt.blockHash,observedHeaderHash:block.hash,tip:tip.toString()});this.flush();
      await new Promise(resolve=>setTimeout(resolve,3000));
      // Re-query the same transaction hash. Never sign or submit another transaction here.
      receipt=await c.pc.getTransactionReceipt({hash:row.hash});
    }
    if(!canonical)throw new MandateError("RECEIPT_NOT_CANONICAL");
    row.receipt=receipt;this.flush();
    if(receipt.status!==status)throw new MandateError("UNEXPECTED_TRANSACTION_STATUS");
    return receipt;
  }
  evidence(){return this.rows.map(({raw,...row})=>row);}
}
